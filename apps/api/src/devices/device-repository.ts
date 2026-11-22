import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  decryptCredential,
  decryptDeviceCredential,
  encryptDeviceCredential
} from "../security/credential-encryption.js";

const deviceIdSchema = z.string().uuid();
function isForbiddenAddress(hostname: string): boolean {
  const address = hostname.replace(/^\\[|\\]$/g, "").toLowerCase();
  const family = isIP(address);
  if (family === 4) {
    const octets = address.split(".").map(Number);
    const first = octets[0] ?? 0;
    const second = octets[1] ?? 0;
    return first === 0 || first === 127 || (first === 169 && second === 254) || first >= 224;
  }
  if (family === 6) {
    return address === "::" || address === "::1" || address.startsWith("fe8") ||
      address.startsWith("fe9") || address.startsWith("fea") || address.startsWith("feb") ||
      address.startsWith("ff") || address.startsWith("::ffff:127.");
  }
  return false;
}

const apiOriginSchema = z.string().trim().min(1).max(2048).url().transform((value, context) => {
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
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" || isForbiddenAddress(hostname)
  ) {
    context.addIssue({ code: "custom", message: "Use an HTTPS origin only, without credentials, path, query, fragment, or localhost target." });
    return z.NEVER;
  }
  return url.origin;
});

export const createDeviceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  location: z.string().trim().max(120).nullable().optional().transform(value => value || null),
  edition: z.enum(["plus", "ce"]),
  apiBaseUrl: apiOriginSchema,
  apiKey: z.string().min(1).max(4096)
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

function toProfile(row: DeviceRow): ManagedDeviceProfile {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    edition: row.edition,
    apiBaseUrl: row.api_base_url,
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
      `SELECT id,name,location,edition,api_base_url,enabled,is_demo,created_at,updated_at
       FROM managed_devices ORDER BY name,id`
    );
    return result.rows.map(toProfile);
  }

  async getProfile(deviceId: string): Promise<ManagedDeviceProfile | null> {
    const id = deviceIdSchema.parse(deviceId);
    const result = await this.pool.query<DeviceRow>(
      `SELECT id,name,location,edition,api_base_url,enabled,is_demo,created_at,updated_at
       FROM managed_devices WHERE id=$1`,
      [id]
    );
    const row = result.rows[0];
    return row ? toProfile(row) : null;
  }

  async create(input: CreateDeviceInput): Promise<ManagedDeviceProfile> {
    const parsed = createDeviceSchema.parse(input);
    const id = randomUUID();
    const encrypted = encryptDeviceCredential(parsed.apiKey, this.encryptionKey, id);
    return withTransaction(this.pool, async client => {
      const inserted = await client.query<DeviceRow>(
        `INSERT INTO managed_devices(id,name,location,edition,api_base_url,enabled,is_demo)
         VALUES($1,$2,$3,$4,$5,true,false)
         RETURNING id,name,location,edition,api_base_url,enabled,is_demo,created_at,updated_at`,
        [id, parsed.name, parsed.location, parsed.edition, parsed.apiBaseUrl]
      );
      await client.query(
        `INSERT INTO device_credentials(device_id,algorithm,format_version,key_version,nonce,auth_tag,ciphertext)
         VALUES($1,'aes-256-gcm',$2,1,$3,$4,$5)`,
        [id, encrypted.version, Buffer.from(encrypted.nonce, "hex"), Buffer.from(encrypted.authTag, "hex"), Buffer.from(encrypted.ciphertext, "hex")]
      );
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
       RETURNING id,name,location,edition,api_base_url,enabled,is_demo,created_at,updated_at`,
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
       RETURNING id,name,location,edition,api_base_url,enabled,is_demo,created_at,updated_at`,
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
    const envelope = {
      version: row.format_version,
      algorithm: "aes-256-gcm" as const,
      nonce: row.nonce.toString("hex"),
      authTag: row.auth_tag.toString("hex"),
      ciphertext: row.ciphertext.toString("hex")
    };
    if (row.format_version === 1) return decryptCredential(envelope, this.encryptionKey);
    if (row.format_version === 2) return decryptDeviceCredential(envelope, this.encryptionKey, id);
    throw new Error("Stored device credential uses an unsupported encryption format.");
  }
}
