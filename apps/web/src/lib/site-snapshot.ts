import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "./api";

/** Mirrors the server's sanitized `/api/v1/devices/:id/snapshot` contract. */
export type SnapshotOutcome = "success" | "partial" | "unavailable";
export type CompatibilityVerdict = "unknown" | "verified" | "mismatch";

export interface SystemView {
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

export interface VersionView { release: string | null; base: string | null; patch: string | null; buildTime: string | null }
export interface GatewayView { name: string | null; delayMs: number | null; stddevMs: number | null; lossPercent: number | null; status: string | null; substatus: string | null }
export interface InterfaceView { name: string | null; description: string | null; enabled: boolean | null; status: string | null; ipv4: string | null; subnet: string | null; ipv6: string | null; mtu: number | null; media: string | null }
export interface ServiceView { name: string | null; description: string | null; enabled: boolean | null; running: boolean | null }
export interface StateSummaryView { arpEntries: number | null; firewallStates: number | null; stateTableCurrent: number | null; stateTableLimit: number | null }
export interface SnapshotFailureView { operation: string; errorClass: string }
export interface CompatibilityView {
  declaredEdition: "plus" | "ce" | "unknown";
  reportedEdition: "plus" | "ce" | null;
  release: string | null;
  platform: string | null;
  apiPackageVersion: string | null;
  verdict: CompatibilityVerdict;
  checkedAt: string | null;
}
export interface CapabilityView {
  key: string;
  label: string;
  endpoint: string;
  operationGroup: string;
  supported: boolean | null;
  verification: "verified" | "failed" | "unverified";
  lastCheckedAt: string | null;
  errorClass: string | null;
}
export interface SiteSnapshotView {
  deviceId: string;
  collectedAt: string;
  outcome: SnapshotOutcome;
  failedOperations: number;
  failures: SnapshotFailureView[];
  system: SystemView | null;
  version: VersionView | null;
  gateways: GatewayView[];
  interfaces: InterfaceView[];
  services: ServiceView[];
  stateSummary: StateSummaryView;
  compatibility: CompatibilityView;
  capabilities: CapabilityView[];
}

/**
 * Navigation inside the site workspace must not collect the firewall once per
 * page. Successful snapshots are reused for the same short window the server
 * uses, and concurrent page mounts share one request.
 */
export const SITE_SNAPSHOT_TTL_MS = 10_000;

interface CacheEntry { fetchedAt: number; promise: Promise<SiteSnapshotView> }
const cache = new Map<string, CacheEntry>();

export function invalidateSiteSnapshot(deviceId: string): void {
  cache.delete(deviceId);
}

export function clearSiteSnapshotCache(): void {
  cache.clear();
}

function loadSnapshot(deviceId: string, force: boolean): Promise<SiteSnapshotView> {
  const now = Date.now();
  const existing = cache.get(deviceId);
  if (existing && !force && now - existing.fetchedAt < SITE_SNAPSHOT_TTL_MS) return existing.promise;

  const promise = apiRequest<SiteSnapshotView>(`/api/v1/devices/${encodeURIComponent(deviceId)}/snapshot`);
  cache.set(deviceId, { fetchedAt: now, promise });
  promise.catch(() => {
    if (cache.get(deviceId)?.promise === promise) cache.delete(deviceId);
  });
  return promise;
}

export interface SiteSnapshotState {
  snapshot: SiteSnapshotView | null;
  loading: boolean;
  error: string;
  refresh: () => void;
}

/** Set `enabled` to false for demo records and when no site is selected. */
export function useSiteSnapshot(deviceId: string | null, enabled = true): SiteSnapshotState {
  const [snapshot, setSnapshot] = useState<SiteSnapshotView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!deviceId || !enabled) {
      setSnapshot(null);
      setLoading(false);
      setError("");
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    loadSnapshot(deviceId, nonce > 0)
      .then(value => { if (active) { setSnapshot(value); setLoading(false); } })
      .catch((cause: unknown) => {
        if (!active) return;
        setSnapshot(null);
        setLoading(false);
        setError(cause instanceof Error ? cause.message : "Unable to read firewall telemetry.");
      });
    return () => { active = false; };
  }, [deviceId, enabled, nonce]);

  const refresh = useCallback(() => {
    if (deviceId) invalidateSiteSnapshot(deviceId);
    setNonce(value => value + 1);
  }, [deviceId]);

  return { snapshot, loading, error, refresh };
}

/** Shared, honest formatting for values the firewall did not report. */
export function formatPercent(value: number | null): string {
  return value === null ? "Unknown" : `${value}%`;
}

export function formatNumber(value: number | null): string {
  return value === null ? "Unknown" : value.toLocaleString();
}

export function formatDuration(seconds: number | null, fallback: string | null): string {
  if (seconds !== null) {
    const days = Math.floor(seconds / 86_400);
    const hours = Math.floor((seconds % 86_400) / 3_600);
    const minutes = Math.floor((seconds % 3_600) / 60);
    return days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }
  return fallback ?? "Unknown";
}

export function statusFromBooleans(running: boolean | null, enabled: boolean | null): "online" | "offline" | "warning" | "unknown" {
  if (running === true) return "online";
  if (running === false) return enabled === false ? "unknown" : "offline";
  return "unknown";
}
