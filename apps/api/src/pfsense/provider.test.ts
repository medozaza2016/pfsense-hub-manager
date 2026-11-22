import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { AppConfig } from "../config.js";
import type { DeviceRepository } from "../devices/device-repository.js";
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

function makeProvider(client: Partial<PfSenseClient> | null) {
  const firewallClient = client === null ? null : {
    get: vi.fn(async (_operation: PfSenseOperation) => ({ data: [] })),
    close: vi.fn(async () => undefined),
    ...client
  };
  const factory = {
    create: vi.fn(async () => firewallClient as PfSenseClient | null)
  } as unknown as DevicePfSenseClientFactory;
  const devices = {
    ensureBootstrapDevice: vi.fn(async () => undefined),
    listProfiles: vi.fn(async () => [])
  } as unknown as DeviceRepository;
  const pool = { query: vi.fn(async () => ({ rows: [], rowCount: 1 })) } as unknown as Pool;
  const provider = new PfSenseProvider(factory, devices, config, "bootstrap-secret", pool);
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

  it("collects the fixed eight read-only operations for any managed device and closes its client", async () => {
    const { provider, factory, pool } = makeProvider(null);
    const client = {
      get: vi.fn(async (_operation: PfSenseOperation) => ({ data: [] })),
      close: vi.fn(async () => undefined)
    };
    vi.mocked(factory.create).mockResolvedValue(client as unknown as PfSenseClient);
    const onResult = vi.fn();

    const result = await provider.collect("22222222-2222-4222-8222-222222222222", onResult);

    expect(result).toMatchObject({ failedOperations: 0 });
    expect(Object.keys(result?.results ?? {})).toEqual([
      "system", "gateways", "interfaces", "services",
      "version", "arpEntryCount", "firewallStateEntryCount", "firewallStateSize"
    ]);
    expect(client.get.mock.calls.map(call => call[0])).toEqual([
      "system", "gateways", "interfaces", "services",
      "version", "arpTable", "firewallStates", "firewallStateSize"
    ]);
    expect(onResult).toHaveBeenCalledTimes(8);
    expect(pool.query).toHaveBeenCalledTimes(8);
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("returns the latest persisted connection test state and timestamp in inventory", async () => {
    const { provider, devices, pool } = makeProvider(null);
    vi.mocked(devices.listProfiles).mockResolvedValue([{
      id: "55555555-5555-4555-8555-555555555555", name: "Branch", location: null, edition: "ce",
      apiBaseUrl: "https://192.168.10.5", enabled: true, isDemo: false,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z"
    }]);
    vi.mocked(pool.query).mockResolvedValue({ rows: [{
      device_id: "55555555-5555-4555-8555-555555555555", outcome: "success", completed_at: "2026-11-21T18:30:00.000Z"
    }], rowCount: 1 } as never);

    await expect(provider.listDevices()).resolves.toMatchObject([{
      id: "55555555-5555-4555-8555-555555555555", connectionState: "reachable",
      lastConnectionCheckAt: "2026-11-21T18:30:00.000Z"
    }]);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("DISTINCT ON (device_id)"));
  });

  it("returns null without polling when the factory rejects an unavailable device", async () => {
    const { provider, factory, pool } = makeProvider(null);
    vi.mocked(factory.create).mockResolvedValue(null);

    await expect(provider.collect("33333333-3333-4333-8333-333333333333", vi.fn())).resolves.toBeNull();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("records operation failures and still closes the client", async () => {
    const { provider, factory } = makeProvider(null);
    const client = {
      get: vi.fn(async (_operation: PfSenseOperation) => { throw new Error("connection failed"); }),
      close: vi.fn(async () => undefined)
    };
    vi.mocked(factory.create).mockResolvedValue(client as unknown as PfSenseClient);
    const onResult = vi.fn();

    const result = await provider.collect("44444444-4444-4444-8444-444444444444", onResult);

    expect(result?.failedOperations).toBe(8);
    expect(onResult).toHaveBeenCalledTimes(8);
    expect(client.close).toHaveBeenCalledOnce();
  });
});
