import Fastify from "fastify";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { DeviceRepository, ManagedDeviceProfile } from "../devices/device-repository.js";
import { ObservationCache } from "./observation-cache.js";
import { registerObservationRoutes } from "./observation-routes.js";
import type { SiteSnapshot } from "./observations.js";
import type { PfSenseProvider } from "./provider.js";

const deviceId = "11111111-1111-4111-8111-111111111111";

const profile: ManagedDeviceProfile = {
  id: deviceId,
  name: "Branch Firewall",
  location: "Branch",
  edition: "ce",
  apiBaseUrl: "https://192.168.10.1",
  tlsServername: null,
  enabled: true,
  isDemo: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

function snapshot(overrides: Partial<SiteSnapshot> = {}): SiteSnapshot {
  return {
    deviceId,
    collectedAt: "2026-11-23T10:00:00.000Z",
    outcome: "success",
    failedOperations: 0,
    failures: [],
    system: {
      platform: "pfSense CE", uptimeText: "1 Day 00:00:00", uptimeSeconds: 86400,
      cpuCount: 4, cpuUsagePercent: 10, memoryUsagePercent: 20, diskUsagePercent: 30,
      swapUsagePercent: 0, loadAverage: [0.1, 0.2, 0.3]
    },
    version: { release: "2.7.2-RELEASE", base: "2.7.2", patch: null, buildTime: null },
    gateways: [],
    interfaces: [],
    services: [],
    stateSummary: { arpEntries: 0, firewallStates: 0, stateTableCurrent: 0, stateTableLimit: 0 },
    compatibility: {
      declaredEdition: "ce", reportedEdition: "ce", release: "2.7.2-RELEASE", platform: "pfSense CE",
      apiPackageVersion: null, verdict: "verified", checkedAt: "2026-11-23T10:00:00.000Z"
    },
    capabilities: [],
    ...overrides
  };
}

function setup(overrides: {
  device?: Partial<ManagedDeviceProfile> | null;
  outcome?: SiteSnapshot["outcome"];
} = {}) {
  const collect = vi.fn(async () => ({
    snapshot: snapshot({ outcome: overrides.outcome ?? "success", failedOperations: overrides.outcome === "unavailable" ? 8 : 0 }),
    failures: [],
    failedOperations: overrides.outcome === "unavailable" ? 8 : 0,
    durationMs: 5
  }));
  const provider = {
    collect,
    capabilities: vi.fn(async () => [{ key: "status.system.read" }])
  } as unknown as PfSenseProvider & { collect: ReturnType<typeof vi.fn>; capabilities: ReturnType<typeof vi.fn> };
  const resolved = overrides.device === null ? null : { ...profile, ...(overrides.device ?? {}) };
  const devices = { getProfile: vi.fn(async () => resolved) } as unknown as DeviceRepository & { getProfile: ReturnType<typeof vi.fn> };
  const pool = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) } as unknown as Pool & { query: ReturnType<typeof vi.fn> };
  const cache = new ObservationCache<SiteSnapshot>({ successTtlMs: 10_000, failureTtlMs: 2_000, maxEntries: 8 });
  const app = Fastify();
  void registerObservationRoutes(app, { provider, devices, pool, cache });
  return { app, provider, devices, pool, cache };
}

describe("site observation routes", () => {
  it("rejects a malformed device identifier before touching the firewall", async () => {
    const { app, provider } = setup();
    const response = await app.inject({ method: "GET", url: "/api/v1/devices/not-a-uuid/snapshot" });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_DEVICE_ID");
    expect(provider.collect).not.toHaveBeenCalled();
  });

  it("hides unknown and demo devices behind the same 404", async () => {
    const unknown = setup({ device: null });
    const demo = setup({ device: { isDemo: true } });

    const unknownResponse = await unknown.app.inject({ method: "GET", url: `/api/v1/devices/${deviceId}/snapshot` });
    const demoResponse = await demo.app.inject({ method: "GET", url: `/api/v1/devices/${deviceId}/capabilities` });

    expect(unknownResponse.statusCode).toBe(404);
    expect(demoResponse.statusCode).toBe(404);
    expect(unknown.provider.collect).not.toHaveBeenCalled();
    expect(demo.provider.capabilities).not.toHaveBeenCalled();
  });

  it("refuses to poll a disabled device", async () => {
    const { app, provider } = setup({ device: { enabled: false } });
    const response = await app.inject({ method: "GET", url: `/api/v1/devices/${deviceId}/snapshot` });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("DEVICE_DISABLED");
    expect(provider.collect).not.toHaveBeenCalled();
  });

  it("serves one sanitized snapshot and reuses it for the navigation window", async () => {
    const { app, provider } = setup();

    const first = await app.inject({ method: "GET", url: `/api/v1/devices/${deviceId}/snapshot` });
    const second = await app.inject({ method: "GET", url: `/api/v1/devices/${deviceId}/overview` });

    expect(first.statusCode).toBe(200);
    expect(first.json().meta.cacheHit).toBe(false);
    expect(first.json().data).toMatchObject({ deviceId, outcome: "success", compatibility: { apiPackageVersion: null } });
    expect(second.json().meta.cacheHit).toBe(true);
    expect(provider.collect).toHaveBeenCalledOnce();
  });

  it("polls again after an explicit invalidation", async () => {
    const { app, provider, cache } = setup();
    await app.inject({ method: "GET", url: `/api/v1/devices/${deviceId}/snapshot` });
    cache.invalidate(deviceId);
    await app.inject({ method: "GET", url: `/api/v1/devices/${deviceId}/snapshot` });

    expect(provider.collect).toHaveBeenCalledTimes(2);
  });

  it("returns 502 when every upstream operation failed", async () => {
    const { app } = setup({ outcome: "unavailable" });
    const response = await app.inject({ method: "GET", url: `/api/v1/devices/${deviceId}/snapshot` });

    expect(response.statusCode).toBe(502);
    expect(response.json().data.outcome).toBe("unavailable");
  });

  it("serves device-derived capability state", async () => {
    const { app } = setup();
    const response = await app.inject({ method: "GET", url: `/api/v1/devices/${deviceId}/capabilities` });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([{ key: "status.system.read" }]);
  });
});
