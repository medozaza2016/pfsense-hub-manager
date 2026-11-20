import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { AppConfig } from "../config.js";
import { PfSenseClient, type PfSenseOperation } from "./client.js";
import { classifyError } from "./errors.js";

export interface DeviceSummary {
  id: string; name: string; location: string | null; edition: string;
  release: string | null; apiBaseUrlConfigured: boolean; enabled: boolean;
}
const operationGroups: Record<PfSenseOperation, string> = {
  system: "system", gateways: "gateways", interfaces: "interfaces", services: "services",
  version: "version", arpTable: "arpTable", firewallStates: "firewallStates", firewallStateSize: "firewallStates"
};

export class PfSenseProvider {
  constructor(
    private readonly client: PfSenseClient,
    private readonly config: AppConfig,
    private readonly pool: Pool
  ) {}

  async ensureDevice(): Promise<void> {
    await this.pool.query(
      `INSERT INTO managed_devices(id,name,location,edition,api_base_url)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, location=EXCLUDED.location,
       edition=EXCLUDED.edition, api_base_url=EXCLUDED.api_base_url, updated_at=now()`,
      [this.config.PFSENSE_DEVICE_ID, this.config.PFSENSE_DEVICE_NAME,
       this.config.PFSENSE_DEVICE_LOCATION || null, this.config.PFSENSE_EDITION,
       this.config.PFSENSE_API_BASE_URL]
    );
  }

  async listDevices(): Promise<DeviceSummary[]> {
    const result = await this.pool.query(
      "SELECT id, name, location, edition, enabled FROM managed_devices ORDER BY name"
    );
    return result.rows.map((row) => ({
      id: row.id, name: row.name, location: row.location, edition: row.edition,
      release: null, apiBaseUrlConfigured: true, enabled: row.enabled
    }));
  }

  async collect(deviceId: string, onResult: (operation: string, result: "success" | "failure", errorClass?: string, durationMs?: number) => void) {
    if (deviceId !== this.config.PFSENSE_DEVICE_ID) return null;
    const results: Record<string, unknown> = {};
    const operations: PfSenseOperation[] = ["system", "gateways", "interfaces", "services", "version", "arpTable", "firewallStates", "firewallStateSize"];
    for (const operation of operations) {
      const started = Date.now();
      const id = randomUUID();
      let outcome: "success" | "failure" = "success";
      let errorClass: string | null = null;
      try {
        const response = await this.client.get(operation);
        if (operation === "arpTable") {
          const rows = Array.isArray(response.data) ? response.data.length : null;
          results.arpEntryCount = rows;
        } else if (operation === "firewallStates") {
          const rows = Array.isArray(response.data) ? response.data.length : null;
          results.firewallStateResponseCount = rows;
        } else if (operation === "firewallStateSize") {
          results.firewallStateSize = response.data;
        } else {
          results[operation] = response.data;
        }
      } catch (error) {
        outcome = "failure";
        errorClass = classifyError(error);
      }
      const durationMs = Date.now() - started;
      onResult(operationGroups[operation], outcome, errorClass ?? undefined, durationMs);
      await this.pool.query(
        `INSERT INTO poll_runs(id,device_id,operation_group,outcome,started_at,completed_at,duration_ms,error_class)
         VALUES($1,$2,$3,$4,now()-($5::text || ' milliseconds')::interval,now(),$5,$6)`,
        [id, deviceId, operationGroups[operation], outcome, durationMs, errorClass]
      );
    }
    return results;
  }

  async capabilities() {
    return [
      ["status.system.read", "/api/v2/status/system"],
      ["status.gateways.read", "/api/v2/status/gateways"],
      ["status.interfaces.read", "/api/v2/status/interfaces"],
      ["status.services.read", "/api/v2/status/services"],
      ["system.version.read", "/api/v2/system/version"],
      ["diagnostics.arpTable.read", "/api/v2/diagnostics/arp_table"],
      ["firewall.states.read", "/api/v2/firewall/states"],
      ["firewall.states.size.read", "/api/v2/firewall/states/size"]
    ].map(([key, endpoint]) => ({ key, endpoint, supported: true, verification: "tested" }));
  }
}
