import Fastify, { type FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { AdminUser } from "../auth.js";
import { DeviceRepository, type ManagedDeviceProfile } from "./device-repository.js";
import type { DevicePfSenseClientFactory } from "../pfsense/device-client-factory.js";
import { PfSenseApiError } from "../pfsense/errors.js";
import { registerDeviceAdminRoutes } from "./admin-routes.js";

const deviceId = "11111111-1111-4111-8111-111111111111";
const profile: ManagedDeviceProfile = {
  id: deviceId,
  name: "Branch Firewall",
  location: "Branch",
  edition: "ce",
  apiBaseUrl: "https://192.168.10.1",
  enabled: true,
  isDemo: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};
const admin: AdminUser = { id: "22222222-2222-4222-8222-222222222222", username: "admin", role: "admin" };
const regularUser: AdminUser = { id: "33333333-3333-4333-8333-333333333333", username: "viewer", role: "user" };

function setup(actor: AdminUser = admin, overrides: {
  devices?: Record<string, unknown>;
  client?: { get: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } | null;
  getError?: Error;
} = {}) {
  const devices = {
    create: vi.fn(async () => profile),
    updateProfile: vi.fn(async () => profile),
    setEnabled: vi.fn(async () => profile),
    rotateCredential: vi.fn(async () => true),
    setDeviceCaBundle: vi.fn(async () => true),
    ...(overrides.devices ?? {})
  } as unknown as DeviceRepository & Record<string, ReturnType<typeof vi.fn>>;

  const client = overrides.client ?? {
    get: vi.fn(async () => ({ data: { version: "ignored" } })),
    close: vi.fn(async () => undefined)
  };
  if (overrides.getError) client.get.mockRejectedValue(overrides.getError);

  const clientFactory = {
    create: vi.fn(async () => client)
  } as unknown as DevicePfSenseClientFactory & { create: ReturnType<typeof vi.fn> };
  const pool = { query: vi.fn(async () => ({ rows: [], rowCount: 1 })) } as unknown as Pool & { query: ReturnType<typeof vi.fn> };

  const app = Fastify();
  app.addHook("onRequest", async request => {
    (request as FastifyRequest & { admin?: AdminUser }).admin = actor;
  });

  const ready = registerDeviceAdminRoutes(app, { devices, clientFactory, pool });
  return { app, ready, devices, clientFactory, pool, client };
}

describe("managed-device administrator routes", () => {
  it("rejects regular users before creating a device", async () => {
    const state = setup(regularUser);
    await state.ready;
    const response = await state.app.inject({
      method: "POST",
      url: "/api/v1/devices",
      payload: {
        name: "Branch Firewall",
        location: "Branch",
        edition: "ce",
        apiBaseUrl: "https://192.168.10.1",
        apiKey: "private-api-key"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(state.devices.create).not.toHaveBeenCalled();
    await state.app.close();
  });

  it("creates a device and never returns the submitted credential", async () => {
    const state = setup();
    await state.ready;
    const response = await state.app.inject({
      method: "POST",
      url: "/api/v1/devices",
      payload: {
        name: "Branch Firewall",
        location: "Branch",
        edition: "ce",
        apiBaseUrl: "https://192.168.10.1",
        apiKey: "private-api-key"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data).toEqual(profile);
    expect(response.body).not.toContain("private-api-key");
    expect(state.devices.create).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "private-api-key" }));
    expect(state.pool.query).toHaveBeenCalledOnce();
    const auditParams = state.pool.query.mock.calls[0]?.[1] as unknown[];
    expect(JSON.stringify(auditParams)).not.toContain("private-api-key");
    await state.app.close();
  });

  it("rejects credentials in profile update payloads", async () => {
    const state = setup();
    await state.ready;
    const response = await state.app.inject({
      method: "PATCH",
      url: `/api/v1/devices/${deviceId}`,
      payload: {
        name: profile.name,
        location: profile.location,
        edition: profile.edition,
        apiBaseUrl: profile.apiBaseUrl,
        apiKey: "must-not-be-accepted"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(state.devices.updateProfile).not.toHaveBeenCalled();
    await state.app.close();
  });

  it("rotates credentials without returning or auditing the secret", async () => {
    const state = setup();
    await state.ready;
    const response = await state.app.inject({
      method: "PUT",
      url: `/api/v1/devices/${deviceId}/credential`,
      payload: { apiKey: "rotated-private-key" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ deviceId, credentialUpdated: true });
    expect(response.body).not.toContain("rotated-private-key");
    expect(JSON.stringify(state.pool.query.mock.calls)).not.toContain("rotated-private-key");
    await state.app.close();
  });

  it("reports successful read-only connection tests and closes the client", async () => {
    const state = setup();
    await state.ready;
    const response = await state.app.inject({
      method: "POST",
      url: `/api/v1/devices/${deviceId}/connection-test`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      deviceId,
      outcome: "reachable",
      errorClass: null,
      operation: "version"
    });
    expect(state.client.get).toHaveBeenCalledWith("version");
    expect(state.client.close).toHaveBeenCalledOnce();
    await state.app.close();
  });

  it("returns a classified failure without exposing upstream error details", async () => {
    const state = setup(admin, { getError: new PfSenseApiError("upstream secret detail", "authentication", 401) });
    await state.ready;
    const response = await state.app.inject({
      method: "POST",
      url: `/api/v1/devices/${deviceId}/connection-test`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ outcome: "unreachable", errorClass: "authentication" });
    expect(response.body).not.toContain("upstream secret detail");
    expect(state.client.close).toHaveBeenCalledOnce();
    await state.app.close();
  });

  it("rejects connection tests from regular users", async () => {
    const state = setup(regularUser);
    await state.ready;
    const response = await state.app.inject({
      method: "POST",
      url: `/api/v1/devices/${deviceId}/connection-test`
    });

    expect(response.statusCode).toBe(403);
    expect(state.clientFactory.create).not.toHaveBeenCalled();
    await state.app.close();
  });
});
