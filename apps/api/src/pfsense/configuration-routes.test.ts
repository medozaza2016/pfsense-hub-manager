import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { DeviceRepository, ManagedDeviceProfile } from "../devices/device-repository.js";
import type { PfSenseClient } from "./client.js";
import { registerConfigurationRoutes, type AliasReadResult } from "./configuration-routes.js";
import type { DevicePfSenseClientFactory } from "./device-client-factory.js";
import { PfSenseApiError } from "./errors.js";
import { ObservationCache } from "./observation-cache.js";

const deviceId = "22222222-2222-4222-8222-222222222222";
const url = `/api/v1/devices/${deviceId}/configuration/aliases`;

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

function setup(options: {
  device?: Partial<ManagedDeviceProfile> | null;
  client?: { getConfiguration?: () => Promise<unknown>; close?: () => Promise<void> } | null;
} = {}) {
  const getConfiguration = vi.fn(options.client?.getConfiguration ?? (async () => ({
    data: [{ name: "LAN_NETWORK", type: "network", descr: "Local LAN", address: ["192.168.10.0/24"], id: 1 }]
  })));
  const close = vi.fn(options.client?.close ?? (async () => undefined));
  const create = vi.fn(async () => (options.client === null ? null : { getConfiguration, close } as unknown as PfSenseClient));
  const factory = { create } as unknown as DevicePfSenseClientFactory & { create: ReturnType<typeof vi.fn> };
  const resolved = options.device === null ? null : { ...profile, ...(options.device ?? {}) };
  const devices = { getProfile: vi.fn(async () => resolved) } as unknown as DeviceRepository & { getProfile: ReturnType<typeof vi.fn> };
  const cache = new ObservationCache<AliasReadResult>({ successTtlMs: 60_000, failureTtlMs: 10_000, maxEntries: 8 });
  const app = Fastify();
  void registerConfigurationRoutes(app, { factory, devices, cache });
  return { app, create, getConfiguration, close, cache };
}

describe("configuration alias route", () => {
  it("rejects a malformed device identifier before touching the firewall", async () => {
    const { app, create } = setup();
    const response = await app.inject({ method: "GET", url: "/api/v1/devices/not-a-uuid/configuration/aliases" });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_DEVICE_ID");
    expect(create).not.toHaveBeenCalled();
  });

  it("hides unknown and demo devices behind the same 404", async () => {
    const unknown = setup({ device: null });
    const demo = setup({ device: { isDemo: true } });

    expect((await unknown.app.inject({ method: "GET", url })).statusCode).toBe(404);
    expect((await demo.app.inject({ method: "GET", url })).statusCode).toBe(404);
    expect(unknown.create).not.toHaveBeenCalled();
    expect(demo.create).not.toHaveBeenCalled();
  });

  it("refuses to read a disabled device", async () => {
    const { app, create } = setup({ device: { enabled: false } });
    const response = await app.inject({ method: "GET", url });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("DEVICE_DISABLED");
    expect(create).not.toHaveBeenCalled();
  });

  it("serves a sanitized alias list and reuses it for the cache window", async () => {
    const { app, create, getConfiguration, close } = setup();

    const first = await app.inject({ method: "GET", url });
    const second = await app.inject({ method: "GET", url });

    expect(first.statusCode).toBe(200);
    expect(first.json().meta.cacheHit).toBe(false);
    expect(first.json().data).toMatchObject({
      deviceId,
      truncated: false,
      aliases: [{ name: "LAN_NETWORK", type: "network", description: "Local LAN", entries: ["192.168.10.0/24"], entryCount: 1, entriesTruncated: false }]
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

    const first = await app.inject({ method: "GET", url });
    const second = await app.inject({ method: "GET", url });

    expect(first.statusCode).toBe(502);
    expect(first.json().error.code).toBe("FIREWALL_PERMISSION_DENIED");
    expect(first.json().error.message).toContain("api-v2-firewall-aliases-get");
    expect(first.json().data).toBeNull();
    expect(second.json().meta.cacheHit).toBe(true);
    expect(create).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("reports an endpoint the firewall does not expose as unsupported", async () => {
    const unsupported = async () => { throw new PfSenseApiError("Firewall endpoint is unavailable.", "unsupported", 404); };
    const { app } = setup({ client: { getConfiguration: unsupported } });
    const response = await app.inject({ method: "GET", url });

    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("FIREWALL_ENDPOINT_UNSUPPORTED");
    expect(response.json().error.message).toContain("/api/v2/firewall/aliases");
  });

  it("rejects a malformed upstream body instead of displaying it", async () => {
    const { app } = setup({ client: { getConfiguration: async () => ({ data: { aliases: [] } }) } });
    const response = await app.inject({ method: "GET", url });

    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("FIREWALL_INVALID_RESPONSE");
  });

  it("reports a firewall that vanished after the profile check", async () => {
    const { app, create } = setup({ client: null });
    const response = await app.inject({ method: "GET", url });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("DEVICE_UNAVAILABLE");
    expect(create).toHaveBeenCalledOnce();
  });

  it("closes the client when the upstream read throws", async () => {
    const close = vi.fn(async () => undefined);
    const failing = async () => { throw new PfSenseApiError("Firewall connection failed.", "unknown"); };
    const { app } = setup({ client: { getConfiguration: failing, close } });
    await app.inject({ method: "GET", url });

    expect(close).toHaveBeenCalledOnce();
  });
});
