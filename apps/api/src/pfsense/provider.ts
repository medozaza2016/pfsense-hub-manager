import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { AppConfig } from "../config.js";
import { decryptSecret, encryptSecret } from "../auth/credential-crypto.js";
import { PfSenseClient, type PfSenseOperation } from "./client.js";
import { classifyError } from "./errors.js";

const groups: Record<PfSenseOperation, string> = {
  system: "system", gateways: "gateways", interfaces: "interfaces", services: "services",
  version: "version", arpTable: "diagnostics", firewallStates: "firewallStates", firewallStateSize: "firewallStates", restApiVersion: "compatibility"
};
function recordCount(value: unknown): number | null { return Array.isArray(value) ? value.length : null; }

const capabilityDefinitions = [
  { key: "status.system.read", endpoint: "/api/v2/status/system", operation: "system" },
  { key: "status.gateways.read", endpoint: "/api/v2/status/gateways", operation: "gateways" },
  { key: "status.interfaces.read", endpoint: "/api/v2/status/interfaces", operation: "interfaces" },
  { key: "status.services.read", endpoint: "/api/v2/status/services", operation: "services" },
  { key: "system.version.read", endpoint: "/api/v2/system/version", operation: "version" },
  { key: "diagnostics.arpTable.read", endpoint: "/api/v2/diagnostics/arp_table", operation: "arpTable" },
  { key: "firewall.states.read", endpoint: "/api/v2/firewall/states", operation: "firewallStates" },
  { key: "firewall.states.size.read", endpoint: "/api/v2/firewall/states/size", operation: "firewallStateSize" },
  { key: "system.restApiVersion.read", endpoint: "/api/v2/system/restapi/version", operation: "restApiVersion" }
] as const;
type CapabilityEvidence = { operationKey: string; endpoint: string; verificationStatus: "unknown" | "verified" | "unsupported"; errorClass: string | null };

function safeSystemMetrics(value: unknown): Record<string, string | number | boolean | null> {
  const output: Record<string, string | number | boolean | null> = {};
  const blocked = /(serial|netgate|mac|(^|_)ip($|_)|address|hostname|host_name|fqdn|token|secret|key|password|credential|uuid|arp|source|destination)/i;
  const visit = (node: unknown, prefix = "", depth = 0) => {
    if (depth > 4 || Object.keys(output).length >= 100 || node === null || typeof node !== "object" || Array.isArray(node)) return;
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (blocked.test(key)) continue;
      const label = prefix ? prefix + "." + key : key;
      if (child === null || typeof child === "number" || typeof child === "boolean") output[label] = child;
      else if (typeof child === "string" && child.length <= 160) output[label] = child;
      else if (typeof child === "object" && !Array.isArray(child)) visit(child, label, depth + 1);
    }
  };
  visit(value);
  return output;
}

export type FirewallInput = { name: string; location?: string | undefined; edition: "plus" | "ce" | "unknown"; apiBaseUrl: string; apiKey: string; caCertificatePem?: string | undefined; tlsServername?: string | undefined };
function validateBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Firewall API URL must be an HTTPS origin without credentials, path, query, or fragment.");
  }
  return url.origin;
}

export class PfSenseProvider {
  constructor(private readonly config: AppConfig, private readonly pool: Pool, private readonly credentialKey: Buffer) {}


  async listDevices() {
    const result = await this.pool.query(
      "SELECT id,name,location,edition,release,architecture,rest_api_package_version,compatibility_verified_at,enabled,connection_status,last_checked_at,last_success_at,last_error_class FROM managed_devices ORDER BY name"
    );
    return result.rows.map(row => ({
      id: row.id, name: row.name, location: row.location, edition: row.edition, release: row.release ?? null,
      architecture: row.architecture ?? null, restApiPackageVersion: row.rest_api_package_version ?? null,
      compatibilityVerifiedAt: row.compatibility_verified_at ?? null,
      enabled: row.enabled, connectionStatus: row.connection_status ?? "unknown",
      lastCheckedAt: row.last_checked_at ?? null, lastSuccessAt: row.last_success_at ?? null,
      lastErrorClass: row.last_error_class ?? null,
    }));
  }

  async deleteDevice(deviceId: string): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM managed_devices WHERE id=$1 RETURNING id", [deviceId]);
    return (result.rowCount ?? 0) > 0;
  }

  async updateDevice(deviceId: string, input: { name: string; location: string | null; edition: "plus" | "ce" | "unknown"; enabled: boolean }) {
    const result = await this.pool.query(
      `UPDATE managed_devices
       SET name=$1,location=$2,edition=$3,enabled=$4,updated_at=now()
       WHERE id=$5
       RETURNING id,name,location,edition,enabled,
                 connection_status AS "connectionStatus",last_checked_at AS "lastCheckedAt",
                 last_success_at AS "lastSuccessAt",last_error_class AS "lastErrorClass"`,
      [input.name.trim(), input.location?.trim() || null, input.edition, input.enabled, deviceId]
    );
    return result.rows[0] ?? null;
  }

  async testConnection(input: Pick<FirewallInput, "apiBaseUrl" | "apiKey" | "caCertificatePem" | "tlsServername">) {
    const baseUrl = validateBaseUrl(input.apiBaseUrl);
    if (!input.apiKey.trim() || input.apiKey.length > 4096 || /[\r\n]/.test(input.apiKey)) throw new Error("Enter a valid pfSense API key.");
    if (input.caCertificatePem && (input.caCertificatePem.length > 65536 || !input.caCertificatePem.includes("-----BEGIN CERTIFICATE-----"))) {
      throw new Error("CA certificate must be a PEM certificate under 64 KB.");
    }
    const testClient = new PfSenseClient(this.config, input.apiKey, { baseUrl, caCertificatePem: input.caCertificatePem || null, tlsServername: input.tlsServername || null });
    try {
      const version = await testClient.get("version");
      await testClient.get("system");
      return { reachable: true, version: version.data };
    } finally {
      await testClient.close();
    }
  }

  async registerDevice(input: FirewallInput) {
    const baseUrl = validateBaseUrl(input.apiBaseUrl);
    const tested = await this.testConnection(input);
    const encrypted = encryptSecret(input.apiKey, this.credentialKey);
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO managed_devices(id,name,location,edition,api_base_url,api_key_ciphertext,api_key_iv,api_key_tag,ca_certificate_pem,tls_servername,connection_status,last_checked_at,last_success_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'online',now(),now())`,
      [id, input.name.trim(), input.location?.trim() || null, input.edition, baseUrl, encrypted.ciphertext, encrypted.iv, encrypted.tag, input.caCertificatePem?.trim() || null, input.tlsServername?.trim() || null]
    );
    return { device: { id, name: input.name.trim(), location: input.location?.trim() || null, edition: input.edition, enabled: true }, connection: tested };
  }

  async updateDeviceCredentials(deviceId: string, input: { apiKey: string; caCertificatePem?: string | null; tlsServername?: string | null }) {
    const current = await this.pool.query(
      "SELECT api_base_url,ca_certificate_pem,tls_servername FROM managed_devices WHERE id=$1",
      [deviceId]
    );
    const row = current.rows[0];
    if (!row) return null;

    const caCertificatePem = input.caCertificatePem === undefined ? row.ca_certificate_pem : input.caCertificatePem;
    const tlsServername = input.tlsServername === undefined ? row.tls_servername : input.tlsServername;
    const connection = await this.testConnection({
      apiBaseUrl: row.api_base_url,
      apiKey: input.apiKey,
      caCertificatePem: caCertificatePem ?? undefined,
      tlsServername: tlsServername ?? undefined
    });
    const encrypted = encryptSecret(input.apiKey, this.credentialKey);
    const saved = await this.pool.query(
      `UPDATE managed_devices
       SET api_key_ciphertext=$1,api_key_iv=$2,api_key_tag=$3,ca_certificate_pem=$4,tls_servername=$5,
           connection_status='online',last_checked_at=now(),last_success_at=now(),last_error_class=NULL,updated_at=now()
       WHERE id=$6`,
      [encrypted.ciphertext, encrypted.iv, encrypted.tag, caCertificatePem, tlsServername, deviceId]
    );
    if (saved.rowCount === 0) return null;
    return { deviceId, connection };
  }

  private async clientForDevice(deviceId: string): Promise<{ client: PfSenseClient; owned: boolean } | null> {
    const result = await this.pool.query(
      "SELECT api_base_url,api_key_ciphertext,api_key_iv,api_key_tag,ca_certificate_pem,tls_servername FROM managed_devices WHERE id=$1 AND enabled=true",
      [deviceId]
    );
    const row = result.rows[0];
    if (!row?.api_key_ciphertext || !row.api_key_iv || !row.api_key_tag) return null;
    const apiKey = decryptSecret({ ciphertext: row.api_key_ciphertext, iv: row.api_key_iv, tag: row.api_key_tag }, this.credentialKey);
    return { client: new PfSenseClient(this.config, apiKey, { baseUrl: row.api_base_url, caCertificatePem: row.ca_certificate_pem, tlsServername: row.tls_servername }), owned: true };
  }

  async collect(deviceId: string, onResult: (group: string, result: "success" | "failure", errorClass?: string, durationMs?: number) => void) {
    const selected = await this.clientForDevice(deviceId);
    if (!selected) return null;
    const client = selected.client;
    const results: Record<string, unknown> = {};
    const operations: PfSenseOperation[] = ["system", "gateways", "interfaces", "services", "version", "arpTable", "firewallStates", "firewallStateSize"];
    let failures = 0;
    const errorClasses: string[] = [];
    const capabilityEvidence: CapabilityEvidence[] = [];
    try {
      for (const operation of operations) {
        const started = Date.now();
        const pollId = randomUUID();
        let outcome: "success" | "failure" = "success";
        let errorClass: string | null = null;
        try {
          const response = await client.get(operation);
          const capability = capabilityDefinitions.find(item => item.operation === operation);
          if (capability) capabilityEvidence.push({ operationKey: capability.key, endpoint: capability.endpoint, verificationStatus: "verified", errorClass: null });
          if (operation === "system") results.system = safeSystemMetrics(response.data);
          else if (operation === "gateways") results.gateways = { recordCount: recordCount(response.data) };
          else if (operation === "interfaces") results.interfaces = { recordCount: recordCount(response.data) };
          else if (operation === "services") results.services = { recordCount: recordCount(response.data) };
          else if (operation === "version") results.version = response.data;
          else if (operation === "arpTable") results.arpEntryCount = recordCount(response.data);
          else if (operation === "firewallStates") results.firewallStateEntryCount = recordCount(response.data);
          else if (operation === "firewallStateSize") results.firewallStateSize = response.data;
        } catch (error) {
          outcome = "failure"; failures++; errorClass = classifyError(error); errorClasses.push(errorClass);
          const capability = capabilityDefinitions.find(item => item.operation === operation);
          if (capability) capabilityEvidence.push({ operationKey: capability.key, endpoint: capability.endpoint, verificationStatus: errorClass === "unsupported" ? "unsupported" : "unknown", errorClass });
        }
        const duration = Date.now() - started;
        onResult(groups[operation], outcome, errorClass ?? undefined, duration);
        await this.pool.query(
          `INSERT INTO poll_runs(id,device_id,operation_group,outcome,started_at,completed_at,duration_ms,error_class)
           VALUES($1,$2,$3,$4,now()-($5::integer * interval '1 millisecond'),now(),$5,$6)`,
          [pollId, deviceId, groups[operation], outcome, duration, errorClass]
        );
      }
      const connectionStatus = failures === 0
        ? "online"
        : failures < operations.length
          ? "degraded"
          : errorClasses.every(value => value === "authentication") ? "authentication_failed"
            : errorClasses.every(value => value === "authorization") ? "authorization_failed"
              : errorClasses.every(value => value === "tls") ? "tls_error"
                : errorClasses.every(value => value === "unsupported") ? "unsupported"
                  : errorClasses.every(value => value === "timeout") ? "offline" : "error";
      const lastErrorClass = failures === 0 ? null : [...new Set(errorClasses)].join(",");
      await this.pool.query(
        `UPDATE managed_devices
         SET connection_status=$1,last_checked_at=now(),
             last_success_at=CASE WHEN $2 THEN now() ELSE last_success_at END,
             last_error_class=$3,updated_at=now()
         WHERE id=$4`,
        [connectionStatus, failures === 0, lastErrorClass, deviceId]
      );
      // Optional package-version discovery is isolated from core connection health.
      try {
        const packageResponse = await client.get("restApiVersion");
        const packageCapability = capabilityDefinitions.find(item => item.operation === "restApiVersion");
        if (packageCapability) capabilityEvidence.push({ operationKey: packageCapability.key, endpoint: packageCapability.endpoint, verificationStatus: "verified", errorClass: null });
        const packageData = packageResponse.data && typeof packageResponse.data === "object" ? packageResponse.data as Record<string, unknown> : {};
        const versionData = results.version && typeof results.version === "object" ? results.version as Record<string, unknown> : {};
        const packageVersion = typeof packageData.current_version === "string" ? packageData.current_version : null;
        const release = ["version", "product_version", "release", "version_full"].map(key => versionData[key]).find(value => typeof value === "string") as string | undefined;
        const systemData = results.system && typeof results.system === "object" ? results.system as Record<string, unknown> : {};
        const architecture = ["architecture", "arch", "machine_architecture", "platform_architecture"].map(key => systemData[key]).find(value => typeof value === "string") as string | undefined;
        if (packageVersion || release || architecture) await this.pool.query(
          `UPDATE managed_devices
           SET release=COALESCE($1,release),architecture=COALESCE($2,architecture),
               rest_api_package_version=COALESCE($3,rest_api_package_version),
               compatibility_verified_at=CASE WHEN $3::text IS NOT NULL THEN now() ELSE compatibility_verified_at END
           WHERE id=$4`,
          [release ?? null, architecture ?? null, packageVersion, deviceId]
        );
      } catch (error) {
        const packageCapability = capabilityDefinitions.find(item => item.operation === "restApiVersion");
        const errorClass = classifyError(error);
        if (packageCapability) capabilityEvidence.push({ operationKey: packageCapability.key, endpoint: packageCapability.endpoint, verificationStatus: errorClass === "unsupported" ? "unsupported" : "unknown", errorClass });
        // Preserve prior metadata. Optional discovery must not degrade operational health.
      }
      if (capabilityEvidence.length) {
        await this.pool.query(
          `INSERT INTO device_capabilities(device_id,operation_key,endpoint,http_method,verification_status,last_checked_at,last_error_class)
           SELECT $1, evidence.operation_key, evidence.endpoint, 'GET', evidence.verification_status, now(), evidence.error_class
           FROM unnest($2::text[],$3::text[],$4::text[],$5::text[]) AS evidence(operation_key,endpoint,verification_status,error_class)
           ON CONFLICT(device_id,operation_key) DO UPDATE SET
             endpoint=EXCLUDED.endpoint,http_method=EXCLUDED.http_method,
             verification_status=EXCLUDED.verification_status,last_checked_at=EXCLUDED.last_checked_at,
             last_error_class=EXCLUDED.last_error_class`,
          [deviceId, capabilityEvidence.map(item => item.operationKey), capabilityEvidence.map(item => item.endpoint),
            capabilityEvidence.map(item => item.verificationStatus), capabilityEvidence.map(item => item.errorClass)]
        );
      }
      return { results, failedOperations: failures, connectionStatus };
    } finally {
      if (selected.owned) await client.close();
    }
  }

  async capabilities(deviceId: string) {
    const result = await this.pool.query(
      "SELECT operation_key,endpoint,http_method,verification_status,last_checked_at,last_error_class FROM device_capabilities WHERE device_id=$1",
      [deviceId]
    );
    const evidence = new Map(result.rows.map(row => [row.operation_key, row]));
    return capabilityDefinitions.map(item => {
      const row = evidence.get(item.key);
      const verification = row?.verification_status ?? "unknown";
      return {
        key: item.key,
        endpoint: item.endpoint,
        method: "GET",
        supported: verification === "verified" ? true : verification === "unsupported" ? false : null,
        verification,
        lastCheckedAt: row?.last_checked_at ?? null,
        lastErrorClass: row?.last_error_class ?? null
      };
    });
  }
}
