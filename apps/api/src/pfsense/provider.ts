import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { AppConfig } from "../config.js";
import { DeviceRepository } from "../devices/device-repository.js";
import { DevicePfSenseClientFactory } from "./device-client-factory.js";
import type { PfSenseOperation } from "./client.js";
import { classifyError } from "./errors.js";

const groups: Record<PfSenseOperation, string> = {
  system: "system",
  gateways: "gateways",
  interfaces: "interfaces",
  services: "services",
  version: "version",
  arpTable: "diagnostics",
  firewallStates: "firewallStates",
  firewallStateSize: "firewallStates"
};

const operations: PfSenseOperation[] = [
  "system", "gateways", "interfaces", "services",
  "version", "arpTable", "firewallStates", "firewallStateSize"
];

function recordCount(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null;
}

export class PfSenseProvider {
  constructor(
    private readonly factory: DevicePfSenseClientFactory,
    private readonly devices: DeviceRepository,
    private readonly config: AppConfig,
    private readonly bootstrapApiKey: string,
    private readonly pool: Pool
  ) {}

  async ensureDevice(): Promise<void> {
    await this.devices.ensureBootstrapDevice({
      id: this.config.PFSENSE_DEVICE_ID,
      name: this.config.PFSENSE_DEVICE_NAME,
      location: this.config.PFSENSE_DEVICE_LOCATION,
      edition: this.config.PFSENSE_EDITION,
      apiBaseUrl: this.config.PFSENSE_API_BASE_URL,
      apiKey: this.bootstrapApiKey
    });
  }

  async listDevices() {
    const profiles = await this.devices.listProfiles();
    return profiles.map(device => ({
      id: device.id,
      name: device.name,
      location: device.location,
      edition: device.edition,
      release: null,
      enabled: device.enabled,
      isDemo: device.isDemo,
      connectionState: "unknown"
    }));
  }

  async collect(
    deviceId: string,
    onResult: (group: string, result: "success" | "failure", errorClass?: string, durationMs?: number) => void
  ) {
    const client = await this.factory.create(deviceId);
    if (!client) return null;

    const results: Record<string, unknown> = {};
    let failures = 0;

    try {
      for (const operation of operations) {
        const started = Date.now();
        const pollId = randomUUID();
        let outcome: "success" | "failure" = "success";
        let errorClass: string | null = null;

        try {
          const response = await client.get(operation);
          if (operation === "system") results.system = { received: true };
          else if (operation === "gateways") results.gateways = { recordCount: recordCount(response.data) };
          else if (operation === "interfaces") results.interfaces = { recordCount: recordCount(response.data) };
          else if (operation === "services") results.services = { recordCount: recordCount(response.data) };
          else if (operation === "version") results.version = response.data;
          else if (operation === "arpTable") results.arpEntryCount = recordCount(response.data);
          else if (operation === "firewallStates") results.firewallStateEntryCount = recordCount(response.data);
          else if (operation === "firewallStateSize") results.firewallStateSize = response.data;
        } catch (error) {
          outcome = "failure";
          failures++;
          errorClass = classifyError(error);
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
      await client.close().catch(() => undefined);
    }
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
