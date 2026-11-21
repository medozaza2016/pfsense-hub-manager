import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { AppConfig } from "../config.js";
import { decryptSecret, encryptSecret } from "../auth/credential-crypto.js";
import { PfSenseClient, type PfSenseOperation } from "./client.js";
import { classifyError } from "./errors.js";

const groups: Record<PfSenseOperation, string> = {
  system: "system", gateways: "gateways", interfaces: "interfaces", services: "services",
  version: "version", arpTable: "diagnostics", firewallStates: "firewallStates", firewallStateSize: "firewallStates"
};
function recordCount(value: unknown): number | null { return Array.isArray(value) ? value.length : null; }

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
  constructor(private readonly client: PfSenseClient, private readonly config: AppConfig, private readonly pool: Pool, private readonly credentialKey: Buffer) {}

  async ensureDevice(): Promise<void> {
    await this.pool.query(
      `INSERT INTO managed_devices(id,name,location,edition,api_base_url)
       VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING`,
      [this.config.PFSENSE_DEVICE_ID, this.config.PFSENSE_DEVICE_NAME, this.config.PFSENSE_DEVICE_LOCATION || null, this.config.PFSENSE_EDITION, this.config.PFSENSE_API_BASE_URL]
    );
  }

  async listDevices() {
    const result = await this.pool.query("SELECT id,name,location,edition,enabled FROM managed_devices ORDER BY name");
    return result.rows.map(row => ({ id: row.id, name: row.name, location: row.location, edition: row.edition, release: null, enabled: row.enabled, canDelete: row.id !== this.config.PFSENSE_DEVICE_ID }));
  }

  async deleteDevice(deviceId: string): Promise<boolean> {
    if (deviceId === this.config.PFSENSE_DEVICE_ID) return false;
    const result = await this.pool.query("DELETE FROM managed_devices WHERE id=$1 RETURNING id", [deviceId]);
    return (result.rowCount ?? 0) > 0;
  }

  async updateDevice(deviceId: string, input: { name: string; location: string | null; edition: "plus" | "ce" | "unknown"; enabled: boolean }) {
    const result = await this.pool.query(
      `UPDATE managed_devices
       SET name=$1,location=$2,edition=$3,enabled=$4,updated_at=now()
       WHERE id=$5
       RETURNING id,name,location,edition,enabled`,
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
      `INSERT INTO managed_devices(id,name,location,edition,api_base_url,api_key_ciphertext,api_key_iv,api_key_tag,ca_certificate_pem,tls_servername)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, input.name.trim(), input.location?.trim() || null, input.edition, baseUrl, encrypted.ciphertext, encrypted.iv, encrypted.tag, input.caCertificatePem?.trim() || null, input.tlsServername?.trim() || null]
    );
    return { device: { id, name: input.name.trim(), location: input.location?.trim() || null, edition: input.edition, enabled: true }, connection: tested };
  }

  async updateDeviceCredentials(deviceId: string, input: { apiKey: string; caCertificatePem?: string | null; tlsServername?: string | null }) {
    if (deviceId === this.config.PFSENSE_DEVICE_ID) {
      throw new Error("Primary firewall credentials are managed by the installation secrets and cannot be rotated here.");
    }
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
    await this.pool.query(
      `UPDATE managed_devices
       SET api_key_ciphertext=$1,api_key_iv=$2,api_key_tag=$3,ca_certificate_pem=$4,tls_servername=$5,updated_at=now()
       WHERE id=$6`,
      [encrypted.ciphertext, encrypted.iv, encrypted.tag, caCertificatePem, tlsServername, deviceId]
    );
    return { deviceId, connection };
  }

  private async clientForDevice(deviceId: string): Promise<{ client: PfSenseClient; owned: boolean } | null> {
    if (deviceId === this.config.PFSENSE_DEVICE_ID) return { client: this.client, owned: false };
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
    try {
      for (const operation of operations) {
        const started = Date.now();
        const pollId = randomUUID();
        let outcome: "success" | "failure" = "success";
        let errorClass: string | null = null;
        try {
          const response = await client.get(operation);
          if (operation === "system") results.system = safeSystemMetrics(response.data);
          else if (operation === "gateways") results.gateways = { recordCount: recordCount(response.data) };
          else if (operation === "interfaces") results.interfaces = { recordCount: recordCount(response.data) };
          else if (operation === "services") results.services = { recordCount: recordCount(response.data) };
          else if (operation === "version") results.version = response.data;
          else if (operation === "arpTable") results.arpEntryCount = recordCount(response.data);
          else if (operation === "firewallStates") results.firewallStateEntryCount = recordCount(response.data);
          else if (operation === "firewallStateSize") results.firewallStateSize = response.data;
        } catch (error) {
          outcome = "failure"; failures++; errorClass = classifyError(error);
        }
        const duration = Date.now() - started;
        onResult(groups[operation], outcome, errorClass ?? undefined, duration);
        await this.pool.query(
          `INSERT INTO poll_runs(id,device_id,operation_group,outcome,started_at,completed_at,duration_ms,error_class)
           VALUES($1,$2,$3,$4,now()-($5::integer * interval '1 millisecond'),now(),$5,$6)`,
          [pollId, deviceId, groups[operation], outcome, duration, errorClass]
        );
      }
      return { results, failedOperations: failures };
    } finally {
      if (selected.owned) await client.close();
    }
  }

  async capabilities() {
    return [
      ["status.system.read", "/api/v2/status/system"], ["status.gateways.read", "/api/v2/status/gateways"],
      ["status.interfaces.read", "/api/v2/status/interfaces"], ["status.services.read", "/api/v2/status/services"],
      ["system.version.read", "/api/v2/system/version"], ["diagnostics.arpTable.read", "/api/v2/diagnostics/arp_table"],
      ["firewall.states.read", "/api/v2/firewall/states"], ["firewall.states.size.read", "/api/v2/firewall/states/size"]
    ].map(([key, endpoint]) => ({ key, endpoint, supported: true, verification: "tested" }));
  }
}
