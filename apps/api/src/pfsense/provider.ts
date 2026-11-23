import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { AppConfig } from "../config.js";
import { DeviceRepository } from "../devices/device-repository.js";
import { DevicePfSenseClientFactory } from "./device-client-factory.js";
import type { PfSenseOperation } from "./client.js";
import { classifyError } from "./errors.js";
import {
  CAPABILITY_DEFINITIONS,
  ObservationShapeError,
  deriveCapabilities,
  parseGatewayObservations,
  parseInterfaceObservations,
  parseServiceObservations,
  parseStateSummary,
  parseSystemObservation,
  parseVersionObservation,
  toCompatibilityObservation,
  type CapabilityObservation,
  type GatewayObservation,
  type InterfaceObservation,
  type LatestPollRun,
  type ServiceObservation,
  type SiteSnapshot,
  type SnapshotFailure,
  type SystemObservation,
  type VersionObservation
} from "./observations.js";

/**
 * The fixed, reviewed read-only allowlist. Adding an operation here is a
 * product and security decision, not a configuration change: it also requires
 * new firewall-side least-privilege permission and new tests.
 */
export const POLLED_OPERATIONS: readonly PfSenseOperation[] = [
  "system", "gateways", "interfaces", "services",
  "version", "arpTable", "firewallStates", "firewallStateSize"
];

type ResultCallback = (group: string, result: "success" | "failure", errorClass?: string, durationMs?: number) => void;

export interface CollectionResult {
  snapshot: SiteSnapshot;
  failures: SnapshotFailure[];
  failedOperations: number;
  durationMs: number;
}

export class PfSenseProvider {
  constructor(
    private readonly factory: DevicePfSenseClientFactory,
    private readonly devices: DeviceRepository,
    private readonly config: AppConfig,
    private readonly bootstrapApiKey: string | null,
    private readonly pool: Pool
  ) {}

  async ensureDevice(): Promise<void> {
    if (this.bootstrapApiKey === null) return;
    const { PFSENSE_DEVICE_ID, PFSENSE_DEVICE_NAME, PFSENSE_API_BASE_URL } = this.config;
    if (!PFSENSE_DEVICE_ID || !PFSENSE_DEVICE_NAME || !PFSENSE_API_BASE_URL) {
      throw new Error("Legacy firewall bootstrap configuration is incomplete.");
    }
    await this.devices.ensureBootstrapDevice({
      id: PFSENSE_DEVICE_ID,
      name: PFSENSE_DEVICE_NAME,
      location: this.config.PFSENSE_DEVICE_LOCATION,
      edition: this.config.PFSENSE_EDITION,
      apiBaseUrl: PFSENSE_API_BASE_URL,
      apiKey: this.bootstrapApiKey
    });
  }

  async listDevices() {
    const [profiles, compatibility] = await Promise.all([
      this.devices.listProfiles(),
      this.devices.listCompatibility()
    ]);
    const checks = await this.pool.query<{ device_id: string; outcome: "success" | "failure"; completed_at: Date | string }>(
      "SELECT DISTINCT ON (device_id) device_id,outcome,completed_at FROM poll_runs WHERE operation_group='version' ORDER BY device_id,completed_at DESC,id DESC"
    );
    const latestCheckByDevice = new Map(checks.rows.map(check => [check.device_id, check]));
    const compatibilityByDevice = new Map(compatibility.map(entry => [entry.deviceId, entry]));
    return profiles.map(device => {
      const latestCheck = latestCheckByDevice.get(device.id);
      const evidence = compatibilityByDevice.get(device.id);
      return {
        id: device.id,
        name: device.name,
        location: device.location,
        edition: device.edition,
        release: evidence?.release ?? null,
        platform: evidence?.platform ?? null,
        apiPackageVersion: evidence?.apiPackageVersion ?? null,
        compatibility: evidence?.compatibility ?? "unknown",
        compatibilityCheckedAt: evidence?.compatibilityCheckedAt ?? null,
        enabled: device.enabled,
        isDemo: device.isDemo,
        connectionState: latestCheck ? (latestCheck.outcome === "success" ? "reachable" : "unreachable") : "unknown",
        lastConnectionCheckAt: latestCheck ? new Date(latestCheck.completed_at).toISOString() : null
      };
    });
  }

  /**
   * Collects the eight approved read-only operations and returns a sanitized
   * snapshot. Each operation is recorded independently, so one failing endpoint
   * never prevents the other seven from being reported.
   */
  async collect(deviceId: string, onResult: ResultCallback): Promise<CollectionResult | null> {
    const client = await this.factory.create(deviceId);
    if (!client) return null;

    const startedAt = Date.now();
    const profile = await this.devices.getProfile(deviceId);
    const failures: SnapshotFailure[] = [];
    const summaryInput: { arpTable?: unknown; firewallStates?: unknown; stateTableSize?: unknown } = {};
    let system: SystemObservation | null = null;
    let version: VersionObservation | null = null;
    let gateways: GatewayObservation[] = [];
    let interfaces: InterfaceObservation[] = [];
    let services: ServiceObservation[] = [];

    try {
      for (const operation of POLLED_OPERATIONS) {
        const started = Date.now();
        let outcome: "success" | "failure" = "success";
        let errorClass: string | null = null;

        try {
          const response = await client.get(operation);
          switch (operation) {
            case "system": system = parseSystemObservation(response.data); break;
            case "gateways": gateways = parseGatewayObservations(response.data); break;
            case "interfaces": interfaces = parseInterfaceObservations(response.data); break;
            case "services": services = parseServiceObservations(response.data); break;
            case "version": version = parseVersionObservation(response.data); break;
            case "arpTable": summaryInput.arpTable = response.data; break;
            case "firewallStates": summaryInput.firewallStates = response.data; break;
            case "firewallStateSize": summaryInput.stateTableSize = response.data; break;
          }
        } catch (error) {
          outcome = "failure";
          errorClass = error instanceof ObservationShapeError ? "invalid_response" : classifyError(error);
          failures.push({ operation, errorClass });
        }

        const duration = Date.now() - started;
        onResult(operation, outcome, errorClass ?? undefined, duration);
        await this.pool.query(
          `INSERT INTO poll_runs(id,device_id,operation_group,outcome,started_at,completed_at,duration_ms,error_class)
           VALUES($1,$2,$3,$4,now()-($5::integer * interval '1 millisecond'),now(),$5,$6)`,
          [randomUUID(), deviceId, operation, outcome, duration, errorClass]
        );
      }
    } finally {
      await client.close().catch(() => undefined);
    }

    const collectedAt = new Date().toISOString();
    const compatibility = toCompatibilityObservation(profile?.edition ?? "unknown", system, version, collectedAt);
    if (profile && version?.release) {
      // Compatibility is evidence for an administrator; a storage problem must
      // not turn a successful read-only collection into a failed request.
      await this.devices.recordCompatibility(deviceId, {
        release: compatibility.release,
        platform: compatibility.platform,
        apiPackageVersion: null,
        compatibility: compatibility.verdict
      }).catch(() => false);
    }

    const snapshot: SiteSnapshot = {
      deviceId,
      collectedAt,
      outcome: failures.length === 0 ? "success" : failures.length === POLLED_OPERATIONS.length ? "unavailable" : "partial",
      failedOperations: failures.length,
      failures,
      system,
      version,
      gateways,
      interfaces,
      services,
      stateSummary: parseStateSummary(summaryInput),
      compatibility,
      capabilities: await this.capabilities(deviceId)
    };
    return { snapshot, failures, failedOperations: failures.length, durationMs: Date.now() - startedAt };
  }

  /**
   * Capability state is derived from this device's own recorded outcomes. A
   * device with no polling history reports `unverified`, never `supported`.
   */
  async capabilities(deviceId: string): Promise<CapabilityObservation[]> {
    const groups = [...new Set(CAPABILITY_DEFINITIONS.flatMap(definition => [
      definition.operationGroup,
      ...(definition.legacyOperationGroups ?? [])
    ]))];
    const result = await this.pool.query<{
      operation_group: string;
      outcome: "success" | "partial" | "failure";
      completed_at: Date | string;
      error_class: string | null;
    }>(
      `SELECT DISTINCT ON (operation_group) operation_group,outcome,completed_at,error_class
         FROM poll_runs
        WHERE device_id=$1 AND operation_group = ANY($2::text[])
        ORDER BY operation_group,completed_at DESC,id DESC`,
      [deviceId, groups]
    );
    const runs = new Map<string, LatestPollRun>(result.rows.map(row => [row.operation_group, {
      outcome: row.outcome,
      completedAt: new Date(row.completed_at).toISOString(),
      errorClass: row.error_class
    }]));
    return deriveCapabilities(runs);
  }
}

