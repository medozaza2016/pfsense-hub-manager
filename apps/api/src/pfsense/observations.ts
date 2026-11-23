import { z } from "zod";
import type { PfSenseOperation } from "./client.js";

/**
 * Firewall responses are untrusted input. Every value below is validated and
 * then copied into an explicitly constructed object. Upstream payloads are
 * never spread, so a newly added upstream field cannot leak into the manager,
 * the browser, or a log by default. Fields the manager does not need - serial
 * number, Netgate ID, MAC address, hardware interface name, monitor/source IP
 * addresses, and packet/byte counters - are deliberately not modeled at all.
 */

export type CompatibilityVerdict = "unknown" | "verified" | "mismatch";
export type ObservationOutcome = "success" | "partial" | "unavailable";

export interface SystemObservation {
  platform: string | null;
  uptimeText: string | null;
  uptimeSeconds: number | null;
  cpuCount: number | null;
  cpuUsagePercent: number | null;
  memoryUsagePercent: number | null;
  diskUsagePercent: number | null;
  swapUsagePercent: number | null;
  loadAverage: [number, number, number] | null;
}

export interface VersionObservation {
  release: string | null;
  base: string | null;
  patch: string | null;
  buildTime: string | null;
}

export interface GatewayObservation {
  name: string | null;
  delayMs: number | null;
  stddevMs: number | null;
  lossPercent: number | null;
  status: string | null;
  substatus: string | null;
}

export interface InterfaceObservation {
  name: string | null;
  description: string | null;
  enabled: boolean | null;
  status: string | null;
  ipv4: string | null;
  subnet: string | null;
  ipv6: string | null;
  mtu: number | null;
  media: string | null;
}

export interface ServiceObservation {
  name: string | null;
  description: string | null;
  enabled: boolean | null;
  running: boolean | null;
}

export interface StateSummaryObservation {
  arpEntries: number | null;
  firewallStates: number | null;
  stateTableCurrent: number | null;
  stateTableLimit: number | null;
}

export interface SnapshotFailure {
  operation: PfSenseOperation;
  errorClass: string;
}

export interface CompatibilityObservation {
  declaredEdition: "plus" | "ce" | "unknown";
  reportedEdition: "plus" | "ce" | null;
  release: string | null;
  platform: string | null;
  /** No approved endpoint exposes the installed REST API package version. */
  apiPackageVersion: null;
  verdict: CompatibilityVerdict;
  checkedAt: string | null;
}

export type CapabilityVerification = "verified" | "failed" | "unverified";

export interface CapabilityObservation {
  key: string;
  label: string;
  endpoint: string;
  operationGroup: string;
  supported: boolean | null;
  verification: CapabilityVerification;
  lastCheckedAt: string | null;
  errorClass: string | null;
}

export interface SiteSnapshot {
  deviceId: string;
  collectedAt: string;
  outcome: ObservationOutcome;
  failedOperations: number;
  failures: SnapshotFailure[];
  system: SystemObservation | null;
  version: VersionObservation | null;
  gateways: GatewayObservation[];
  interfaces: InterfaceObservation[];
  services: ServiceObservation[];
  stateSummary: StateSummaryObservation;
  compatibility: CompatibilityObservation;
  capabilities: CapabilityObservation[];
}

export class ObservationShapeError extends Error {
  constructor(operation: PfSenseOperation, detail: string) {
    super(`Firewall returned an unusable ${operation} payload: ${detail}`);
    this.name = "ObservationShapeError";
  }
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(CONTROL_CHARACTERS, " ").trim();
  return cleaned.length === 0 ? null : cleaned.slice(0, maxLength);
}

function number(value: unknown, max: number): number | null {
  const parsed = z.number().finite().min(0).max(max).safeParse(value);
  return parsed.success ? Math.round(parsed.data * 10) / 10 : null;
}

function wholeNumber(value: unknown, max: number): number | null {
  const candidate = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  const parsed = z.number().int().min(0).max(max).safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function record(value: unknown, operation: PfSenseOperation): Record<string, unknown> {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  if (!parsed.success) throw new ObservationShapeError(operation, "expected a JSON object");
  return parsed.data;
}

function recordList(value: unknown, operation: PfSenseOperation): Array<Record<string, unknown>> {
  const parsed = z.array(z.record(z.string(), z.unknown())).safeParse(value);
  if (!parsed.success) throw new ObservationShapeError(operation, "expected a JSON array of objects");
  return parsed.data;
}

/**
 * pfSense reports uptime as a human string such as "12 Days 06:02:01". Only a
 * fully formed value is converted; anything else stays null rather than being
 * approximated from partial evidence.
 */
export function parseUptimeSeconds(value: string | null): number | null {
  if (value === null) return null;
  const match = /^(?:(\d{1,4})\s+days?,?\s+)?(\d{1,2}):(\d{2}):(\d{2})$/i.exec(value);
  if (!match) return null;
  const days = match[1] ? Number(match[1]) : 0;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  const seconds = Number(match[4]);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return days * 86_400 + hours * 3_600 + minutes * 60 + seconds;
}

function parseLoadAverage(value: unknown): [number, number, number] | null {
  const parsed = z.array(z.number().finite().min(0).max(100_000)).safeParse(value);
  if (!parsed.success || parsed.data.length < 3) return null;
  const [one, five, fifteen] = parsed.data;
  if (one === undefined || five === undefined || fifteen === undefined) return null;
  const round = (input: number) => Math.round(input * 100) / 100;
  return [round(one), round(five), round(fifteen)];
}

export function parseSystemObservation(data: unknown): SystemObservation {
  const fields = record(data, "system");
  const uptimeText = text(fields.uptime, 64);
  return {
    platform: text(fields.platform, 120),
    uptimeText,
    uptimeSeconds: parseUptimeSeconds(uptimeText),
    cpuCount: wholeNumber(fields.cpu_count, 4096),
    cpuUsagePercent: number(fields.cpu_usage, 100_000),
    memoryUsagePercent: number(fields.mem_usage, 100_000),
    diskUsagePercent: number(fields.disk_usage, 100_000),
    swapUsagePercent: number(fields.swap_usage, 100_000),
    loadAverage: parseLoadAverage(fields.cpu_load_avg)
  };
}

export function parseVersionObservation(data: unknown): VersionObservation {
  if (typeof data === "string") {
    return { release: text(data, 120), base: null, patch: null, buildTime: null };
  }
  const fields = record(data, "version");
  return {
    release: text(fields.version, 120),
    base: text(fields.base, 120),
    patch: text(fields.patch, 60),
    buildTime: text(fields.buildtime, 60)
  };
}

export function parseGatewayObservations(data: unknown): GatewayObservation[] {
  return recordList(data, "gateways").map(entry => ({
    name: text(entry.name, 120),
    delayMs: number(entry.delay, 3_600_000),
    stddevMs: number(entry.stddev, 3_600_000),
    lossPercent: number(entry.loss, 100),
    status: text(entry.status, 40),
    substatus: text(entry.substatus, 40)
  }));
}

export function parseInterfaceObservations(data: unknown): InterfaceObservation[] {
  return recordList(data, "interfaces").map(entry => ({
    name: text(entry.name, 60),
    description: text(entry.descr, 120),
    enabled: booleanValue(entry.enable),
    status: text(entry.status, 40),
    ipv4: text(entry.ipaddr, 60),
    subnet: text(entry.subnet, 60),
    ipv6: text(entry.ipaddrv6, 60),
    mtu: wholeNumber(entry.mtu, 65_535),
    media: text(entry.media, 80)
  }));
}

export function parseServiceObservations(data: unknown): ServiceObservation[] {
  return recordList(data, "services").map(entry => ({
    name: text(entry.name, 80),
    description: text(entry.description, 200),
    enabled: booleanValue(entry.enabled),
    running: booleanValue(entry.status)
  }));
}

export function emptyStateSummary(): StateSummaryObservation {
  return { arpEntries: null, firewallStates: null, stateTableCurrent: null, stateTableLimit: null };
}

/** Only counts and limits are retained; no ARP entry or state-table record is kept. */
export function parseStateSummary(input: {
  arpTable?: unknown;
  firewallStates?: unknown;
  stateTableSize?: unknown;
}): StateSummaryObservation {
  const summary = emptyStateSummary();
  if (Array.isArray(input.arpTable)) summary.arpEntries = input.arpTable.length;
  if (Array.isArray(input.firewallStates)) summary.firewallStates = input.firewallStates.length;
  if (typeof input.stateTableSize === "number") {
    summary.stateTableCurrent = wholeNumber(input.stateTableSize, Number.MAX_SAFE_INTEGER);
  } else if (input.stateTableSize && typeof input.stateTableSize === "object") {
    const fields = input.stateTableSize as Record<string, unknown>;
    summary.stateTableCurrent = wholeNumber(fields.currentstates, Number.MAX_SAFE_INTEGER);
    summary.stateTableLimit = wholeNumber(fields.maximumstates, Number.MAX_SAFE_INTEGER);
  }
  return summary;
}

export function inferEdition(platform: string | null, release: string | null): "plus" | "ce" | null {
  const haystack = `${platform ?? ""} ${release ?? ""}`.toLowerCase();
  if (haystack.includes("plus")) return "plus";
  if (/\bce\b/.test(haystack) || haystack.includes("community edition")) return "ce";
  return null;
}

/**
 * A verdict is only "mismatch" when the firewall's own release/platform string
 * contradicts the edition recorded in the site profile. Absence of evidence is
 * "unknown", never a guess in either direction.
 */
export function evaluateCompatibility(
  declaredEdition: "plus" | "ce" | "unknown",
  system: SystemObservation | null,
  version: VersionObservation | null
): { verdict: CompatibilityVerdict; reportedEdition: "plus" | "ce" | null } {
  const reportedEdition = inferEdition(system?.platform ?? null, version?.release ?? null);
  if (!version?.release) return { verdict: "unknown", reportedEdition };
  if (declaredEdition !== "unknown" && reportedEdition !== null && declaredEdition !== reportedEdition) {
    return { verdict: "mismatch", reportedEdition };
  }
  return { verdict: "verified", reportedEdition };
}

export function toCompatibilityObservation(
  declaredEdition: "plus" | "ce" | "unknown",
  system: SystemObservation | null,
  version: VersionObservation | null,
  checkedAt: string
): CompatibilityObservation {
  const { verdict, reportedEdition } = evaluateCompatibility(declaredEdition, system, version);
  return {
    declaredEdition,
    reportedEdition,
    release: version?.release ?? null,
    platform: system?.platform ?? null,
    apiPackageVersion: null,
    verdict,
    checkedAt: verdict === "unknown" ? null : checkedAt
  };
}

export interface CapabilityDefinition {
  key: string;
  label: string;
  endpoint: string;
  operationGroup: string;
  /** Historical poll_runs labels written before per-operation grouping. */
  legacyOperationGroups?: string[];
}

/** Fixed allowlist. No capability is added or enabled from upstream metadata. */
export const CAPABILITY_DEFINITIONS: readonly CapabilityDefinition[] = [
  { key: "status.system.read", label: "System status", endpoint: "/api/v2/status/system", operationGroup: "system" },
  { key: "status.gateways.read", label: "Gateway status", endpoint: "/api/v2/status/gateways", operationGroup: "gateways" },
  { key: "status.interfaces.read", label: "Interface status", endpoint: "/api/v2/status/interfaces", operationGroup: "interfaces" },
  { key: "status.services.read", label: "Service status", endpoint: "/api/v2/status/services", operationGroup: "services" },
  { key: "system.version.read", label: "pfSense version", endpoint: "/api/v2/system/version", operationGroup: "version" },
  { key: "diagnostics.arpTable.read", label: "ARP summary", endpoint: "/api/v2/diagnostics/arp_table", operationGroup: "arpTable", legacyOperationGroups: ["diagnostics"] },
  { key: "firewall.states.read", label: "Firewall states summary", endpoint: "/api/v2/firewall/states", operationGroup: "firewallStates" },
  { key: "firewall.states.size.read", label: "State table size", endpoint: "/api/v2/firewall/states/size", operationGroup: "firewallStateSize", legacyOperationGroups: ["firewallStates"] }
];

export interface LatestPollRun {
  outcome: "success" | "partial" | "failure";
  completedAt: string;
  errorClass: string | null;
}

/**
 * A capability is reported unsupported only when the firewall itself refused or
 * did not implement the operation. Transport, TLS, rate-limit, and schema
 * failures say nothing about availability, so their `supported` value stays
 * null and the capability is never silently downgraded.
 */
const CONCLUSIVE_FAILURE_CLASSES = new Set(["unsupported", "authorization", "authentication"]);

export function deriveCapabilities(runs: ReadonlyMap<string, LatestPollRun>): CapabilityObservation[] {
  return CAPABILITY_DEFINITIONS.map(definition => {
    const fallback = definition.legacyOperationGroups
      ?.map(group => runs.get(group))
      .find((run): run is LatestPollRun => run !== undefined);
    const run = runs.get(definition.operationGroup) ?? fallback;
    if (!run) {
      return {
        key: definition.key,
        label: definition.label,
        endpoint: definition.endpoint,
        operationGroup: definition.operationGroup,
        supported: null,
        verification: "unverified",
        lastCheckedAt: null,
        errorClass: null
      };
    }
    const succeeded = run.outcome === "success";
    const conclusive = !succeeded && run.errorClass !== null && CONCLUSIVE_FAILURE_CLASSES.has(run.errorClass);
    return {
      key: definition.key,
      label: definition.label,
      endpoint: definition.endpoint,
      operationGroup: definition.operationGroup,
      supported: succeeded ? true : conclusive ? false : null,
      verification: succeeded ? "verified" : "failed",
      lastCheckedAt: run.completedAt,
      errorClass: run.errorClass
    };
  });
}
