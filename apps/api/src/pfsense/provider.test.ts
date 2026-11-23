import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { AppConfig } from "../config.js";
import type { DeviceRepository } from "../devices/device-repository.js";
import { validatePfSenseOperationData } from "./client.js";
import type { PfSenseClient, PfSenseOperation } from "./client.js";
import type { DevicePfSenseClientFactory } from "./device-client-factory.js";
import { PfSenseProvider } from "./provider.js";

const config = {
  PFSENSE_DEVICE_ID: "11111111-1111-4111-8111-111111111111",
  PFSENSE_DEVICE_NAME: "Legacy Firewall",
  PFSENSE_DEVICE_LOCATION: "Main Office",
  PFSENSE_EDITION: "ce",
  PFSENSE_API_BASE_URL: "https://192.168.10.1"
} as AppConfig;

const profile = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Branch",
  location: null,
  edition: "ce" as const,
  apiBaseUrl: "https://192.168.10.5",
  tlsServername: null,
  enabled: true,
  isDemo: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

function sampleData(operation: PfSenseOperation): unknown {
  switch (operation) {
    case "system": return { platform: "pfSense CE", uptime: "3 Days 04:05:06", cpu_usage: 12.345, mem_usage: 44, disk_usage: 20, swap_usage: 0, cpu_count: 4, cpu_load_avg: [0.1, 0.2, 0.3], serial: "SECRET-SERIAL" };
    case "version": return { version: "2.7.2-RELEASE", base: "2.7.2", patch: "", buildtime: "2024-01-01" };
    case "gateways": return [{ name: "WAN_DHCP", delay: 0.812, stddev: 0.1, loss: 0, status: "online", substatus: "none", monitorip: "192.0.2.1", srcip: "192.0.2.2" }];
    case "interfaces": return [{ name: "wan", descr: "WAN", macaddr: "00:11:22:33:44:55", hwif: "igb0", ipaddr: "192.0.2.2", subnet: "24", status: "up", enable: true, inbytes: 999 }];
    case "services": return [{ name: "unbound", description: "DNS Resolver", enabled: true, status: true }];
    case "arpTable": return [{ ip: "192.168.1.1", mac: "aa:bb" }];
    case "firewallStates": return [{ src: "192.168.1.1" }, { src: "192.168.1.2" }];
    case "firewallStateSize": return { currentstates: 2337, maximumstates: 340000 };
  }
}

function makeProvider(client: Partial<PfSenseClient> | null, bootstrapApiKey: string | null = "bootstrap-secret", providerConfig: AppConfig = config) {
  const firewallClient = {
    get: vi.fn(async (operation: PfSenseOperation) => ({ data: sampleData(operation) })),
    close: vi.fn(async () => undefined)
  } as unknown as PfSenseClient & { get: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
  if (client) {
    Object.assign(firewallClient as unknown as Record<string, unknown>, client as Record<string, unknown>);
  }
  const factory = { create: vi.fn(async () => firewallClient as PfSenseClient | null) } as unknown as DevicePfSenseClientFactory;
  const devices = {
    ensureBootstrapDevice: vi.fn(async () => undefined),
    listProfiles: vi.fn(async () => [profile]),
    listCompatibility: vi.fn(async () => [{ deviceId: profile.id, release: "2.7.2-RELEASE", platform: "pfSense CE", apiPackageVersion: null, compatibility: "verified" as const, compatibilityCheckedAt: "2026-11-23T00:00:00.000Z" }]),
    getProfile: vi.fn(async () => profile),
    recordCompatibility: vi.fn(async () => true)
  } as unknown as DeviceRepository;
  const pool = { query: vi.fn(async () => ({ rows: [], rowCount: 1 })) } as unknown as Pool;
  const provider = new PfSenseProvider(factory, devices, providerConfig, bootstrapApiKey, pool);
  return { provider, factory, devices, pool, firewallClient };
}

describe("PfSenseProvider multi-device polling", () => {
  it("bootstraps the legacy device through encrypted repository storage", async () => {
    const { provider, devices } = makeProvider(null);
    await provider.ensureDevice();
    expect(devices.ensureBootstrapDevice).toHaveBeenCalledWith({
      id: config.PFSENSE_DEVICE_ID,
      name: config.PFSENSE_DEVICE_NAME,
      location: config.PFSENSE_DEVICE_LOCATION,
      edition: config.PFSENSE_EDITION,
      apiBaseUrl: config.PFSENSE_API_BASE_URL,
      apiKey: "bootstrap-secret"
    });
  });

  it("starts without creating a firewall when no registration has happened yet", async () => {
    const emptyConfig = {
      PFSENSE_DEVICE_ID: undefined,
      PFSENSE_DEVICE_NAME: undefined,
      PFSENSE_DEVICE_LOCATION: "",
      PFSENSE_EDITION: "unknown",
      PFSENSE_API_BASE_URL: undefined
    } as AppConfig;
    const { provider, devices } = makeProvider(null, null, emptyConfig);
    await expect(provider.ensureDevice()).resolves.toBeUndefined();
    expect(devices.ensureBootstrapDevice).not.toHaveBeenCalled();
  });

  it("collects the fixed eight operations, records one poll row per operation, and closes the client", async () => {
    const { provider, firewallClient, pool, devices } = makeProvider(null);
    const onResult = vi.fn();

    const result = await provider.collect(profile.id, onResult);

    expect(result).toMatchObject({ failedOperations: 0 });
    expect(result?.snapshot.outcome).toBe("success");
    expect(firewallClient.get.mock.calls.map(call => call[0])).toEqual([
      "system", "gateways", "interfaces", "services",
      "version", "arpTable", "firewallStates", "firewallStateSize"
    ]);
    expect(onResult).toHaveBeenCalledTimes(8);
    const insertCalls = vi.mocked(pool.query).mock.calls.filter(call => String(call[0]).includes("INSERT INTO poll_runs"));
    expect(insertCalls).toHaveLength(8);
    expect(insertCalls.map(call => (call[1] as unknown[])[2])).toEqual([
      "system", "gateways", "interfaces", "services",
      "version", "arpTable", "firewallStates", "firewallStateSize"
    ]);
    expect(firewallClient.close).toHaveBeenCalledOnce();
    expect(devices.recordCompatibility).toHaveBeenCalledWith(profile.id, {
      release: "2.7.2-RELEASE",
      platform: "pfSense CE",
      apiPackageVersion: null,
      compatibility: "verified"
    });
  });

  it("returns a sanitized snapshot without serial numbers, MAC addresses, or counters", async () => {
    const { provider } = makeProvider(null);
    const result = await provider.collect(profile.id, vi.fn());
    const serialized = JSON.stringify(result?.snapshot);

    expect(serialized).not.toContain("SECRET-SERIAL");
    expect(serialized).not.toContain("00:11:22:33:44:55");
    expect(serialized).not.toContain("igb0");
    expect(serialized).not.toContain("monitorip");
    expect(serialized).not.toContain("inbytes");
    expect(result?.snapshot.system).toMatchObject({ platform: "pfSense CE", uptimeSeconds: 273906, cpuUsagePercent: 12.3, cpuCount: 4 });
    expect(result?.snapshot.stateSummary).toEqual({ arpEntries: 1, firewallStates: 2, stateTableCurrent: 2337, stateTableLimit: 340000 });
    expect(result?.snapshot.compatibility.apiPackageVersion).toBeNull();
  });

  it("reports compatibility evidence in inventory instead of a null release", async () => {
    const { provider, pool } = makeProvider(null);
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await expect(provider.listDevices()).resolves.toMatchObject([{
      id: profile.id, release: "2.7.2-RELEASE", platform: "pfSense CE",
      apiPackageVersion: null, compatibility: "verified"
    }]);
  });

  it("returns null without polling when the factory rejects an unavailable device", async () => {
    const { provider, factory, pool } = makeProvider(null);
    vi.mocked(factory.create).mockResolvedValue(null);

    await expect(provider.collect(profile.id, vi.fn())).resolves.toBeNull();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("records an invalid_response failure when a payload has an unusable shape", async () => {
    const { provider, pool } = makeProvider({
      get: vi.fn(async (operation: PfSenseOperation) => ({
        data: operation === "gateways" ? [null] : sampleData(operation)
      }))
    });
    const onResult = vi.fn();

    const result = await provider.collect(profile.id, onResult);

    expect(result?.failedOperations).toBe(1);
    expect(result?.snapshot.outcome).toBe("partial");
    expect(onResult).toHaveBeenCalledWith("gateways", "failure", "invalid_response", expect.any(Number));
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO poll_runs"),
      expect.arrayContaining(["gateways", "failure", "invalid_response"])
    );
  });

  it("reports unavailable, not success, when every operation fails", async () => {
    const { provider, firewallClient } = makeProvider(null);
    firewallClient.get.mockRejectedValue(new Error("connection failed"));

    const result = await provider.collect(profile.id, vi.fn());

    expect(result?.failedOperations).toBe(8);
    expect(result?.snapshot.outcome).toBe("unavailable");
    expect(firewallClient.close).toHaveBeenCalledOnce();
  });

  it("keeps a client-side response-shape rejection inside the single failed operation", async () => {
    const { provider } = makeProvider({
      get: vi.fn(async (operation: PfSenseOperation) => {
        const data = operation === "gateways" ? [null] : sampleData(operation);
        validatePfSenseOperationData(operation, data);
        return { data };
      })
    });

    const result = await provider.collect(profile.id, vi.fn());
    expect(result?.failures).toEqual([{ operation: "gateways", errorClass: "invalid_response" }]);
  });
});

describe("PfSenseProvider capability derivation", () => {
  it("reports unverified capabilities when the device has no polling history", async () => {
    const { provider } = makeProvider(null);
    const capabilities = await provider.capabilities(profile.id);

    expect(capabilities).toHaveLength(8);
    expect(capabilities.every(item => item.verification === "unverified" && item.supported === null)).toBe(true);
  });

  it("distinguishes verified, unsupported, and inconclusive failures", async () => {
    const { provider, pool } = makeProvider(null);
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        { operation_group: "system", outcome: "success", completed_at: "2026-11-23T10:00:00.000Z", error_class: null },
        { operation_group: "gateways", outcome: "failure", completed_at: "2026-11-23T10:00:01.000Z", error_class: "unsupported" },
        { operation_group: "interfaces", outcome: "failure", completed_at: "2026-11-23T10:00:02.000Z", error_class: "timeout" },
        { operation_group: "services", outcome: "success", completed_at: "2026-11-23T10:00:03.000Z", error_class: null },
        { operation_group: "version", outcome: "success", completed_at: "2026-11-23T10:00:04.000Z", error_class: null }
      ],
      rowCount: 5
    } as never);

    const capabilities = await provider.capabilities(profile.id);
    const byKey = new Map(capabilities.map(item => [item.key, item]));

    expect(byKey.get("status.system.read")).toMatchObject({ supported: true, verification: "verified" });
    expect(byKey.get("status.gateways.read")).toMatchObject({ supported: false, verification: "failed", errorClass: "unsupported" });
    expect(byKey.get("status.interfaces.read")).toMatchObject({ supported: null, verification: "failed", errorClass: "timeout" });
    expect(byKey.get("status.services.read")).toMatchObject({ supported: true });
    expect(byKey.get("system.version.read")).toMatchObject({ supported: true });
    expect(byKey.get("diagnostics.arpTable.read")).toMatchObject({ supported: null, verification: "unverified" });
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("poll_runs"), [profile.id, expect.arrayContaining(["arpTable", "diagnostics"])]);
  });

  it("falls back to the historical shared group label for state-table capabilities", async () => {
    const { provider, pool } = makeProvider(null);
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        { operation_group: "firewallStates", outcome: "failure", completed_at: "2026-11-23T10:00:00.000Z", error_class: "unsupported" },
        { operation_group: "diagnostics", outcome: "success", completed_at: "2026-11-23T10:00:01.000Z", error_class: null }
      ],
      rowCount: 2
    } as never);

    const capabilities = await provider.capabilities(profile.id);
    const byKey = new Map(capabilities.map(item => [item.key, item]));

    expect(byKey.get("firewall.states.size.read")).toMatchObject({ supported: false });
    expect(byKey.get("diagnostics.arpTable.read")).toMatchObject({ supported: true });
  });
});
