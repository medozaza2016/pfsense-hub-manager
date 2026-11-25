import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { DeviceRepository, ManagedDeviceProfile } from "../devices/device-repository.js";
import type { PfSenseClient } from "./client.js";
import {
  CONFIGURATION_AREAS,
  TELEMETRY_AREAS,
  registerPageReadRoutes,
  type PageReadCacheKey,
  type PageReadResult
} from "./configuration-routes.js";
import type { DevicePfSenseClientFactory } from "./device-client-factory.js";
import { PfSenseApiError } from "./errors.js";
import { ObservationCache } from "./observation-cache.js";

const deviceId = "22222222-2222-4222-8222-222222222222";
const aliasesUrl = `/api/v1/devices/${deviceId}/configuration/aliases`;

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

type ClientStub = {
  getConfiguration?: (operation: string) => Promise<unknown>;
  getStatusDetail?: (operation: string) => Promise<unknown>;
  close?: () => Promise<void>;
};

function setup(options: { device?: Partial<ManagedDeviceProfile> | null; client?: ClientStub | null } = {}) {
  const getConfiguration = vi.fn(options.client?.getConfiguration ?? (async (operation: string) => ({
    data: operation === "dnsSettings"
      ? { enable: true, port: "53" }
      : [{ name: "LAN_NETWORK", type: "network", descr: "Local LAN", address: ["192.168.10.0/24"], id: 1 }]
  })));
  const getStatusDetail = vi.fn(options.client?.getStatusDetail ?? (async (operation: string) => ({
    data: operation === "restapiVersion" ? { current_version: "2.6.0", latest_version: "2.6.0", update_available: false } : []
  })));
  const close = vi.fn(options.client?.close ?? (async () => undefined));
  const create = vi.fn(async () => (options.client === null ? null : { getConfiguration, getStatusDetail, close } as unknown as PfSenseClient));
  const factory = { create } as unknown as DevicePfSenseClientFactory & { create: ReturnType<typeof vi.fn> };
  const resolved = options.device === null ? null : { ...profile, ...(options.device ?? {}) };
  const devices = { getProfile: vi.fn(async () => resolved) } as unknown as DeviceRepository & { getProfile: ReturnType<typeof vi.fn> };
  const caches = new Map<PageReadCacheKey, ObservationCache<PageReadResult>>();
  const cache = (key: PageReadCacheKey) => {
    const existing = caches.get(key);
    if (existing) return existing;
    const created = new ObservationCache<PageReadResult>({ successTtlMs: 60_000, failureTtlMs: 10_000, maxEntries: 8 });
    caches.set(key, created);
    return created;
  };
  const app = Fastify();
  void registerPageReadRoutes(app, { factory, devices, cache });
  return { app, create, getConfiguration, getStatusDetail, close };
}

describe("page-scoped read routes", () => {
  it("registers every approved configuration area exactly once", async () => {
    const { app, getConfiguration } = setup();
    const names = Object.keys(CONFIGURATION_AREAS);

    for (const name of names) {
      const response = await app.inject({ method: "GET", url: `/api/v1/devices/${deviceId}/configuration/${name}` });
      expect(response.statusCode, name).toBe(200);
      expect(response.json().data.area, name).toBe(name);
      expect(Array.isArray(response.json().data.items), name).toBe(true);
    }
    expect(getConfiguration).toHaveBeenCalledTimes(names.length);
  });

  it("uses the fixed upstream operation for each configuration area", async () => {
    for (const [name, area] of Object.entries(CONFIGURATION_AREAS)) {
      const { app, getConfiguration } = setup();
      await app.inject({ method: "GET", url: `/api/v1/devices/${deviceId}/configuration/${name}` });
      expect(getConfiguration).toHaveBeenCalledWith(area.operation);
    }
  });

  it("serves VPN status from the telemetry namespace and never from the configuration client", async () => {
    for (const name of Object.keys(TELEMETRY_AREAS)) {
      const { app, getConfiguration, getStatusDetail } = setup();
      const response = await app.inject({ method: "GET", url: `/api/v1/devices/${deviceId}/telemetry/${name}` });
      expect(response.statusCode, name).toBe(200);
      expect(response.json().data.area).toBe(name);
      expect(getStatusDetail).toHaveBeenCalledOnce();
      expect(getConfiguration).not.toHaveBeenCalled();
    }
  });

  it("has no route for an area the manager did not approve", async () => {
    const { app, create } = setup();

    const configuration = await app.inject({ method: "GET", url: `/api/v1/devices/${deviceId}/configuration/command-prompt` });
    const telemetry = await app.inject({ method: "GET", url: `/api/v1/devices/${deviceId}/telemetry/reboot` });
    const wrongNamespace = await app.inject({ method: "GET", url: `/api/v1/devices/${deviceId}/telemetry/rules` });

    expect(configuration.statusCode).toBe(404);
    expect(telemetry.statusCode).toBe(404);
    expect(wrongNamespace.statusCode).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns the DNS resolver settings as the single record the endpoint documents", async () => {
    const { app } = setup();
    const response = await app.inject({ method: "GET", url: `/api/v1/devices/${deviceId}/configuration/dns-settings` });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ area: "dns-settings", count: 1, truncated: false });
    expect(response.json().data.items).toHaveLength(1);
    expect(response.json().data.items[0]).toMatchObject({ enabled: true, port: "53" });
  });

  it("rejects a malformed device identifier before touching the firewall", async () => {
    const { app, create } = setup();
    const response = await app.inject({ method: "GET", url: "/api/v1/devices/not-a-uuid/configuration/rules" });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_DEVICE_ID");
    expect(create).not.toHaveBeenCalled();
  });

  it("hides unknown and demo devices behind the same 404", async () => {
    const unknown = setup({ device: null });
    const demo = setup({ device: { isDemo: true } });

    expect((await unknown.app.inject({ method: "GET", url: aliasesUrl })).statusCode).toBe(404);
    expect((await demo.app.inject({ method: "GET", url: aliasesUrl })).statusCode).toBe(404);
    expect(unknown.create).not.toHaveBeenCalled();
    expect(demo.create).not.toHaveBeenCalled();
  });

  it("refuses to read a disabled device", async () => {
    const { app, create } = setup({ device: { enabled: false } });
    const response = await app.inject({ method: "GET", url: aliasesUrl });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("DEVICE_DISABLED");
    expect(create).not.toHaveBeenCalled();
  });

  it("serves a sanitized area and reuses it for the cache window", async () => {
    const { app, create, getConfiguration, close } = setup();

    const first = await app.inject({ method: "GET", url: aliasesUrl });
    const second = await app.inject({ method: "GET", url: aliasesUrl });

    expect(first.statusCode).toBe(200);
    expect(first.json().meta.cacheHit).toBe(false);
    expect(first.json().data).toMatchObject({
      deviceId,
      area: "aliases",
      count: 1,
      truncated: false,
      items: [{ name: "LAN_NETWORK", type: "network", description: "Local LAN", entries: ["192.168.10.0/24"], entryCount: 1, entriesTruncated: false }]
    });
    expect(first.json().data.collectedAt).toEqual(expect.any(String));
    expect(JSON.stringify(first.json())).not.toContain("\"id\"");
    expect(second.json().meta.cacheHit).toBe(true);
    expect(getConfiguration).toHaveBeenCalledOnce();
    expect(getConfiguration).toHaveBeenCalledWith("aliases");
    expect(create).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("reports a denied privilege as a manager configuration problem and caches the failure briefly", async () => {
    const denied = async () => { throw new PfSenseApiError("Firewall denied the requested operation.", "authorization", 403); };
    const { app, create, close } = setup({ client: { getConfiguration: denied } });
    const url = `/api/v1/devices/${deviceId}/configuration/rules`;

    const first = await app.inject({ method: "GET", url });
    const second = await app.inject({ method: "GET", url });

    expect(first.statusCode).toBe(502);
    expect(first.json().error.code).toBe("FIREWALL_PERMISSION_DENIED");
    expect(first.json().error.message).toContain("api-v2-firewall-rules-get");
    expect(first.json().data).toBeNull();
    expect(second.json().meta.cacheHit).toBe(true);
    expect(create).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("names the telemetry privilege when a VPN status read is denied", async () => {
    const denied = async () => { throw new PfSenseApiError("Firewall denied the requested operation.", "authorization", 403); };
    const { app } = setup({ client: { getStatusDetail: denied } });
    const response = await app.inject({ method: "GET", url: `/api/v1/devices/${deviceId}/telemetry/ipsec-sas` });

    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("FIREWALL_PERMISSION_DENIED");
    expect(response.json().error.message).toContain("api-v2-status-ipsec-sas-get");
  });

  it("reports an endpoint the firewall does not expose as unsupported", async () => {
    const unsupported = async () => { throw new PfSenseApiError("Firewall endpoint is unavailable.", "unsupported", 404); };
    const { app } = setup({ client: { getConfiguration: unsupported } });
    const response = await app.inject({ method: "GET", url: aliasesUrl });

    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("FIREWALL_ENDPOINT_UNSUPPORTED");
    expect(response.json().error.message).toContain("/api/v2/firewall/aliases");
  });

  it("rejects a malformed upstream body instead of displaying it", async () => {
    const { app } = setup({ client: { getConfiguration: async () => ({ data: { rules: [] } }) } });
    const response = await app.inject({ method: "GET", url: `/api/v1/devices/${deviceId}/configuration/rules` });

    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("FIREWALL_INVALID_RESPONSE");
  });

  it("does not let a configuration-shaped answer satisfy a status area", async () => {
    const { app } = setup({ client: { getStatusDetail: async () => ({ data: { sas: [] } }) } });
    const response = await app.inject({ method: "GET", url: `/api/v1/devices/${deviceId}/telemetry/ipsec-sas` });

    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("FIREWALL_INVALID_RESPONSE");
  });

  it("reports a firewall that vanished after the profile check", async () => {
    const { app, create } = setup({ client: null });

    const configuration = await app.inject({ method: "GET", url: aliasesUrl });
    const telemetry = await app.inject({ method: "GET", url: `/api/v1/devices/${deviceId}/telemetry/wireguard-tunnels` });

    expect(configuration.statusCode).toBe(409);
    expect(configuration.json().error.code).toBe("DEVICE_UNAVAILABLE");
    expect(telemetry.statusCode).toBe(409);
    expect(telemetry.json().error.code).toBe("DEVICE_UNAVAILABLE");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("closes the client when the upstream read throws", async () => {
    const close = vi.fn(async () => undefined);
    const failing = async () => { throw new PfSenseApiError("Firewall connection failed.", "unknown"); };
    const { app } = setup({ client: { getConfiguration: failing, close } });
    await app.inject({ method: "GET", url: aliasesUrl });

    expect(close).toHaveBeenCalledOnce();
  });
});


