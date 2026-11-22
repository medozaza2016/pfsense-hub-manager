import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { isAllowedDeviceAddress } from "./network-destination.js";
import {
  decryptCredential,
  decryptDeviceCredential,
  decryptDeviceTlsTrust,
  encryptDeviceCredential,
  encryptDeviceTlsTrust
} from "../security/credential-encryption.js";
import { normalizeDeviceCaBundle } from "../pfsense/tls-trust.js";

const deviceIdSchema = z.string().uuid();
export const apiOriginSchema = z.string().trim().min(1).max(2048).url().transform((value, context) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    context.addIssue({ code: "custom", message: "Enter a valid HTTPS origin." });
    return z.NEVER;
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    (url.pathname !== "" && url.pathname !== "/") ||
    url.search.length > 0 ||
    url.hash.length > 0 ||
    value.includes("?") ||
    value.includes("#") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" || (isIP(hostname.startsWith("[") ? hostname.slice(1, -1) : hostname) !== 0 && !isAllowedDeviceAddress(hostname))
  ) {
    context.addIssue({ code: "custom", message: "Use an HTTPS origin only, without credentials, path, query, fragment, or localhost target." });
    return z.NEVER;
  }
  return url.origin;
});

export const tlsServernameSchema = z.string().trim().min(1).max(253).nullable().optional().transform(value => value || null).refine(
  value => value === null || value.split(".").every(label => label.length >= 1 && label.length <= 63 && /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label)),
  "TLS server name must be a valid DNS hostname."
);

export const createDeviceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  location: z.string().trim().max(120).nullable().optional().transform(value => value || null),
  edition: z.enum(["plus", "ce"]),
  apiBaseUrl: apiOriginSchema,
  apiKey: z.string().min(1).max(4096).refine(value => !/[\\r\\n]/.test(value), "API credentials cannot contain line breaks."),
  tlsServername: tlsServernameSchema,
  certificateAuthority: z.string().max(60 * 1024).optional()
}).strict();

export const updateDeviceProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  location: z.string().trim().max(120).nullable().optional().transform(value => value || null),
  edition: z.enum(["plus", "ce"]),
  apiBaseUrl: apiOriginSchema
}).strict();

export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;
export type UpdateDeviceProfileInput = z.infer<typeof updateDeviceProfileSchema>;

export interface ManagedDeviceProfile {
  id: string;
  name: string;
  location: string | null;
  edition: "plus" | "ce" | "unknown";
  apiBaseUrl: string;
  tlsServername: string | null;
  enabled: boolean;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DeviceRow {
  id: string;
  name: string;
  location: string | null;
  edition: "plus" | "ce" | "unknown";
  api_base_url: string;
  tls_servername: string | null;
  enabled: boolean;
  is_demo: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CredentialRow {
  format_version: number;
  key_version: number;
  nonce: Buffer;
  auth_tag: Buffer;
  ciphertext: Buffer;
}

interface TlsTrustRow {
  format_version: number;
  key_version: number;
  nonce: Buffer;
  auth_tag: Buffer;
  ciphertext: Buffer;
}

function toProfile(row: DeviceRow): ManagedDeviceProfile {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    edition: row.edition,
    apiBaseUrl: row.api_base_url,
    tlsServername: row.tls_servername,
    enabled: row.enabled,
    isDemo: row.is_demo,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* preserve the original error */ }
    throw error;
  } finally {
    client.release();
  }
}

export class DeviceRepository {
  constructor(private readonly pool: Pool, private readonly encryptionKey: Buffer) {
    if (!Buffer.isBuffer(encryptionKey) || encryptionKey.length !== 32) {
      throw new Error("Device repository requires a valid 32-byte application encryption key.");
    }
  }

  async listProfiles(): Promise<ManagedDeviceProfile[]> {
    const result = await this.pool.query<DeviceRow>(
      `SELECT id,name,location,edition,api_base_url,tls_servername,enabled,is_demo,created_at,updated_at
       FROM managed_devices ORDER BY name,id`
    );
    return result.rows.map(toProfile);
  }

  async getProfile(deviceId: string): Promise<ManagedDeviceProfile | null> {
    const id = deviceIdSchema.parse(deviceId);
    const result = await this.pool.query<DeviceRow>(
      `SELECT id,name,location,edition,api_base_url,tls_servername,enabled,is_demo,created_at,updated_at
       FROM managed_devices WHERE id=$1`,
      [id]
    );
    const row = result.rows[0];
    return row ? toProfile(row) : null;
  }

  /**
   * Bootstraps the legacy environment-configured firewall without overwriting
   * an existing profile or replacing a credential rotated through the manager.
   * A demo profile collision is treated as a hard error.
   */
  async ensureBootstrapDevice(input: {
    id: string;
    name: string;
    location: string;
    edition: "plus" | "ce" | "unknown";
    apiBaseUrl: string;
    apiKey: string;
  }): Promise<void> {
    const id = deviceIdSchema.parse(input.id);
    const profile = z.object({
      name: z.string().trim().min(1).max(120),
      location: z.string().trim().max(120).nullable().transform(value => value || null),
      edition: z.enum(["plus", "ce", "unknown"]),
      apiBaseUrl: apiOriginSchema
    }).strict().parse({
      name: input.name,
      location: input.location || null,
      edition: input.edition,
      apiBaseUrl: input.apiBaseUrl
    });
    if (typeof input.apiKey !== "string" || input.apiKey.length === 0 || input.apiKey.length > 4096) {
      throw new Error("Bootstrap API credential is invalid.");
    }
    const encrypted = encryptDeviceCredential(input.apiKey, this.encryptionKey, id);

    await withTransaction(this.pool, async client => {
      await client.query(
        `INSERT INTO managed_devices(id,name,location,edition,api_base_url,enabled,is_demo)
         VALUES($1,$2,$3,$4,$5,true,false)
         ON CONFLICT(id) DO NOTHING`,
        [id, profile.name, profile.location, profile.edition, profile.apiBaseUrl]
      );
      const device = await client.query<{ id: string; is_demo: boolean }>(
        "SELECT id,is_demo FROM managed_devices WHERE id=$1 FOR UPDATE",
        [id]
      );
      if (!device.rows[0] || device.rows[0].is_demo) {
        throw new Error("The configured bootstrap device conflicts with a demo or missing device.");
      }
      await client.query(
        `INSERT INTO device_credentials(device_id,algorithm,format_version,key_version,nonce,auth_tag,ciphertext)
         VALUES($1,'aes-256-gcm',$2,1,$3,$4,$5)
         ON CONFLICT(device_id) DO NOTHING`,
        [id, encrypted.version, Buffer.from(encrypted.nonce, "hex"), Buffer.from(encrypted.authTag, "hex"), Buffer.from(encrypted.ciphertext, "hex")]
      );
    });
  }

  async create(input: CreateDeviceInput): Promise<ManagedDeviceProfile> {
    const parsed = createDeviceSchema.parse(input);
    const id = randomUUID();
    const encrypted = encryptDeviceCredential(parsed.apiKey, this.encryptionKey, id);
    return withTransaction(this.pool, async client => {
      const inserted = await client.query<DeviceRow>(
        `INSERT INTO managed_devices(id,name,location,edition,api_base_url,tls_servername,enabled,is_demo)
         VALUES($1,$2,$3,$4,$5,$6,true,false)
         RETURNING id,name,location,edition,api_base_url,tls_servername,enabled,is_demo,created_at,updated_at`,
        [id, parsed.name, parsed.location, parsed.edition, parsed.apiBaseUrl, parsed.tlsServername]
      );
      await client.query(
        `INSERT INTO device_credentials(device_id,algorithm,format_version,key_version,nonce,auth_tag,ciphertext)
         VALUES($1,'aes-256-gcm',$2,1,$3,$4,$5)`,
        [id, encrypted.version, Buffer.from(encrypted.nonce, "hex"), Buffer.from(encrypted.authTag, "hex"), Buffer.from(encrypted.ciphertext, "hex")]
      );
      if (parsed.certificateAuthority) {
        const normalizedCa = normalizeDeviceCaBundle(parsed.certificateAuthority);
        const encryptedCa = encryptDeviceTlsTrust(normalizedCa, this.encryptionKey, id);
        await client.query(
          `INSERT INTO device_tls_trust(device_id,algorithm,format_version,key_version,nonce,auth_tag,ciphertext)
           VALUES($1,'aes-256-gcm',$2,1,$3,$4,$5)`,
          [id, encryptedCa.version, Buffer.from(encryptedCa.nonce, "hex"), Buffer.from(encryptedCa.authTag, "hex"), Buffer.from(encryptedCa.ciphertext, "hex")]
        );
      }
      const row = inserted.rows[0];
      if (!row) throw new Error("Managed device creation returned no profile.");
      return toProfile(row);
    });
  }

  async updateProfile(deviceId: string, input: UpdateDeviceProfileInput): Promise<ManagedDeviceProfile | null> {
    const id = deviceIdSchema.parse(deviceId);
    const parsed = updateDeviceProfileSchema.parse(input);
    const result = await this.pool.query<DeviceRow>(
      `UPDATE managed_devices SET name=$2,location=$3,edition=$4,api_base_url=$5,updated_at=now()
       WHERE id=$1 AND is_demo=false
       RETURNING id,name,location,edition,api_base_url,tls_servername,enabled,is_demo,created_at,updated_at`,
      [id, parsed.name, parsed.location, parsed.edition, parsed.apiBaseUrl]
    );
    const row = result.rows[0];
    return row ? toProfile(row) : null;
  }

  async setEnabled(deviceId: string, enabled: boolean): Promise<ManagedDeviceProfile | null> {
    const id = deviceIdSchema.parse(deviceId);
    if (typeof enabled !== "boolean") throw new Error("Device enabled state must be a boolean.");
    const result = await this.pool.query<DeviceRow>(
      `UPDATE managed_devices SET enabled=$2,updated_at=now()
       WHERE id=$1 AND is_demo=false
       RETURNING id,name,location,edition,api_base_url,tls_servername,enabled,is_demo,created_at,updated_at`,
      [id, enabled]
    );
    const row = result.rows[0];
    return row ? toProfile(row) : null;
  }

  async rotateCredential(deviceId: string, apiKey: string): Promise<boolean> {
    const id = deviceIdSchema.parse(deviceId);
    if (typeof apiKey !== "string" || apiKey.length === 0 || apiKey.length > 4096) {
      throw new Error("API credential must be a non-empty string within the supported length.");
    }
    const encrypted = encryptDeviceCredential(apiKey, this.encryptionKey, id);
    return withTransaction(this.pool, async client => {
      const device = await client.query<{ id: string }>(
        "SELECT id FROM managed_devices WHERE id=$1 AND is_demo=false FOR UPDATE",
        [id]
      );
      if (!device.rowCount) return false;
      await client.query(
        `INSERT INTO device_credentials(device_id,algorithm,format_version,key_version,nonce,auth_tag,ciphertext)
         VALUES($1,'aes-256-gcm',$2,1,$3,$4,$5)
         ON CONFLICT(device_id) DO UPDATE SET algorithm=EXCLUDED.algorithm,format_version=EXCLUDED.format_version,
           key_version=EXCLUDED.key_version,nonce=EXCLUDED.nonce,auth_tag=EXCLUDED.auth_tag,
           ciphertext=EXCLUDED.ciphertext,updated_at=now()`,
        [id, encrypted.version, Buffer.from(encrypted.nonce, "hex"), Buffer.from(encrypted.authTag, "hex"), Buffer.from(encrypted.ciphertext, "hex")]
      );
      return true;
    });
  }

  /**
   * Stores a validated, device-bound custom trust bundle. Passing null removes
   * the custom trust anchor and returns the device to system trust.
   */
  async setDeviceCaBundle(deviceId: string, pem: string | null): Promise<boolean> {
    const id = deviceIdSchema.parse(deviceId);
    const normalized = pem === null ? null : normalizeDeviceCaBundle(pem);
    const encrypted = normalized === null ? null : encryptDeviceTlsTrust(normalized, this.encryptionKey, id);

    return withTransaction(this.pool, async client => {
      const device = await client.query<{ id: string }>(
        "SELECT id FROM managed_devices WHERE id=$1 AND is_demo=false FOR UPDATE",
        [id]
      );
      if (!device.rowCount) return false;

      if (!encrypted) {
        await client.query("DELETE FROM device_tls_trust WHERE device_id=$1", [id]);
        return true;
      }

      await client.query(
        `INSERT INTO device_tls_trust(device_id,algorithm,format_version,key_version,nonce,auth_tag,ciphertext)
         VALUES($1,'aes-256-gcm',$2,1,$3,$4,$5)
         ON CONFLICT(device_id) DO UPDATE SET algorithm=EXCLUDED.algorithm,format_version=EXCLUDED.format_version,
           key_version=EXCLUDED.key_version,nonce=EXCLUDED.nonce,auth_tag=EXCLUDED.auth_tag,
           ciphertext=EXCLUDED.ciphertext,updated_at=now()`,
        [id, encrypted.version, Buffer.from(encrypted.nonce, "hex"), Buffer.from(encrypted.authTag, "hex"), Buffer.from(encrypted.ciphertext, "hex")]
      );
      return true;
    });
  }

  /**
   * Returns custom trust material only for an enabled, non-demo device.
   * No row means the client must use the operating system trust store.
   */
  async decryptDeviceCaBundle(deviceId: string): Promise<string | null> {
    const id = deviceIdSchema.parse(deviceId);
    const result = await this.pool.query<TlsTrustRow>(
      `SELECT t.format_version,t.key_version,t.nonce,t.auth_tag,t.ciphertext
       FROM device_tls_trust t
       JOIN managed_devices d ON d.id=t.device_id
       WHERE t.device_id=$1 AND d.is_demo=false AND d.enabled=true`,
      [id]
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.key_version !== 1 || row.format_version !== 3) {
      throw new Error("Stored device TLS trust material uses an unsupported encryption version.");
    }
    const envelope = {
      version: 3 as const,
      algorithm: "aes-256-gcm" as const,
      nonce: row.nonce.toString("hex"),
      authTag: row.auth_tag.toString("hex"),
      ciphertext: row.ciphertext.toString("hex")
    };
    return normalizeDeviceCaBundle(decryptDeviceTlsTrust(envelope, this.encryptionKey, id));
  }

  async decryptApiKeyForConnection(deviceId: string): Promise<string | null> {
    const id = deviceIdSchema.parse(deviceId);
    const result = await this.pool.query<CredentialRow>(
      `SELECT c.format_version,c.key_version,c.nonce,c.auth_tag,c.ciphertext
       FROM device_credentials c
       JOIN managed_devices d ON d.id=c.device_id
       WHERE c.device_id=$1 AND d.is_demo=false AND d.enabled=true`,
      [id]
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.key_version !== 1) throw new Error("Stored device credential uses an unsupported encryption key version.");
    const envelope = {
      version: row.format_version,
      algorithm: "aes-256-gcm" as const,
      nonce: row.nonce.toString("hex"),
      authTag: row.auth_tag.toString("hex"),
      ciphertext: row.ciphertext.toString("hex")
    };
    if (row.format_version === 1) return decryptCredential({ ...envelope, version: 1 }, this.encryptionKey);
    if (row.format_version === 2) return decryptDeviceCredential({ ...envelope, version: 2 }, this.encryptionKey, id);
    throw new Error("Stored device credential uses an unsupported encryption format.");
  }
}
