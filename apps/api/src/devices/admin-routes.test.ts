import Fastify, { type FastifyRequest } from "fastify";
import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { tlsConnectMock } = vi.hoisted(() => ({ tlsConnectMock: vi.fn() }));
vi.mock("node:tls", () => ({ connect: tlsConnectMock }));
beforeEach(() => tlsConnectMock.mockReset());
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
  tlsServername: null,
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
    getProfile: vi.fn(async () => profile),
    create: vi.fn(async () => profile),
    updateProfile: vi.fn(async () => profile),
    setEnabled: vi.fn(async () => profile),
    archive: vi.fn(async () => true),
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
    create: vi.fn(async () => client),
    testConnection: vi.fn(async () => undefined)
  } as unknown as DevicePfSenseClientFactory & { create: ReturnType<typeof vi.fn>; testConnection: ReturnType<typeof vi.fn> };
  const pool = { query: vi.fn(async () => ({ rows: [], rowCount: 1 })) } as unknown as Pool & { query: ReturnType<typeof vi.fn> };

  const app = Fastify();
  app.addHook("onRequest", async request => {
    (request as FastifyRequest & { admin?: AdminUser }).admin = actor;
  });

  const ready = registerDeviceAdminRoutes(app, { devices, clientFactory, pool });
  return { app, ready, devices, clientFactory, pool, client };
}

describe("managed-device administrator routes", () => {

  it("requires a successful authenticated TLS/API test before registration", async () => {
    const state = setup(admin, {
      client: {
        get: vi.fn(async () => ({ data: { version: "ignored" } })),
        close: vi.fn(async () => undefined)
      }
    });
    state.clientFactory.testConnection.mockRejectedValueOnce(new PfSenseApiError("private TLS detail", "tls"));
    await state.ready;
    const response = await state.app.inject({
      method: "POST",
      url: "/api/v1/devices",
      payload: {
        name: "Branch Firewall",
        edition: "ce",
        apiBaseUrl: "https://192.168.10.1",
        apiKey: "private-api-key"
      }
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toMatchObject({ code: "CONNECTION_TEST_FAILED", errorClass: "tls" });
    expect(response.body).not.toContain("private TLS detail");
    expect(state.devices.create).not.toHaveBeenCalled();
    await state.app.close();
  });

  it("returns and logs a safe TLS diagnostic code for registration failures", async () => {
    const state = setup();
    state.clientFactory.testConnection.mockRejectedValueOnce(
      new PfSenseApiError("Firewall TLS verification failed.", "tls", undefined, "ERR_TLS_CERT_ALTNAME_INVALID")
    );
    await state.ready;
    const response = await state.app.inject({
      method: "POST",
      url: "/api/v1/devices/registration-test",
      payload: {
        apiBaseUrl: "https://192.168.10.1",
        apiKey: "temporary-key",
        tlsServername: "firewall.example.test"
      }
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toMatchObject({
      code: "CONNECTION_TEST_FAILED",
      errorClass: "tls",
      diagnosticCode: "ERR_TLS_CERT_ALTNAME_INVALID"
    });
    expect(response.body).not.toContain("temporary-key");
    expect(response.body).not.toContain("private TLS detail");
    await state.app.close();
  });

  it("exposes a write-free authenticated registration connection test", async () => {
    const state = setup();
    await state.ready;
    const response = await state.app.inject({
      method: "POST",
      url: "/api/v1/devices/registration-test",
      payload: {
        apiBaseUrl: "https://192.168.10.1",
        apiKey: "temporary-key",
        tlsServername: "firewall.example.test"
      }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ outcome: "reachable", operation: "version" });
    expect(state.clientFactory.testConnection).toHaveBeenCalledWith(expect.objectContaining({
      apiBaseUrl: "https://192.168.10.1",
      apiKey: "temporary-key",
      tlsServername: "firewall.example.test"
    }));
    expect(response.body).not.toContain("temporary-key");
    expect(state.devices.create).not.toHaveBeenCalled();
    await state.app.close();
  });

  it("discovers a firewall certificate using the pinned safe destination", async () => {
    const state = setup();
    await state.ready;
    tlsConnectMock.mockReset();
    const certificate = new X509Certificate(readFileSync(new URL("../pfsense/fixtures/firewall-test-cert.pem", import.meta.url)));
    const listeners: Record<string, () => void> = {};
    const socket = {
      once: vi.fn((event: string, callback: () => void) => { listeners[event] = callback; }),
      getPeerCertificate: vi.fn(() => ({ raw: certificate.raw })),
      end: vi.fn(),
      destroy: vi.fn()
    };
    tlsConnectMock.mockImplementation(() => {
      queueMicrotask(() => listeners.secureConnect?.());
      return socket;
    });

    const response = await state.app.inject({
      method: "POST",
      url: "/api/v1/devices/discover-certificate",
      payload: { apiBaseUrl: "https://192.168.10.1:10443", tlsServername: "firewall.test" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      fingerprint256: certificate.fingerprint256,
      subject: certificate.subject,
      issuer: certificate.issuer,
      tlsServernameUsed: "firewall.test"
    });
    expect(tlsConnectMock).toHaveBeenCalledWith(expect.objectContaining({
      host: "192.168.10.1",
      port: 10443,
      servername: "firewall.test",
      rejectUnauthorized: false
    }));
    expect(socket.end).toHaveBeenCalledOnce();
    await state.app.close();
  });

  it("denies TLS certificate discovery to regular users", async () => {
    const state = setup(regularUser);
    await state.ready;
    const response = await state.app.inject({
      method: "POST",
      url: "/api/v1/devices/discover-certificate",
      payload: { apiBaseUrl: "https://192.168.10.1" }
    });
    expect(response.statusCode).toBe(403);
    expect(tlsConnectMock).not.toHaveBeenCalled();
    await state.app.close();
  });

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
    expect(state.clientFactory.testConnection).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "private-api-key" }));
    expect(state.devices.create).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "private-api-key" }), expect.any(Number));
    expect(state.pool.query).toHaveBeenCalledOnce();
    const auditParams = state.pool.query.mock.calls[0]?.[1] as unknown[];
    expect(JSON.stringify(auditParams)).not.toContain("private-api-key");
    await state.app.close();
  });

  it("returns a non-secret connection profile to administrators", async () => {
    const state = setup();
    await state.ready;
    const response = await state.app.inject({ method: "GET", url: `/api/v1/devices/${deviceId}/profile` });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(profile);
    expect(response.body).not.toContain("apiKey");
    await state.app.close();
  });

  it("denies connection profile details to regular users", async () => {
    const state = setup(regularUser);
    await state.ready;
    const response = await state.app.inject({ method: "GET", url: `/api/v1/devices/${deviceId}/profile` });
    expect(response.statusCode).toBe(403);
    expect(state.devices.getProfile).not.toHaveBeenCalled();
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

  it("requires an explicit archive confirmation before changing a device", async () => {
    const state = setup();
    await state.ready;
    const response = await state.app.inject({
      method: "DELETE",
      url: `/api/v1/devices/${deviceId}`,
      payload: { confirmation: "delete" }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("ARCHIVE_CONFIRMATION_REQUIRED");
    expect(state.devices.archive).not.toHaveBeenCalled();
    await state.app.close();
  });

  it("archives devices only for administrators and records retained history", async () => {
    const state = setup();
    await state.ready;
    const response = await state.app.inject({
      method: "DELETE",
      url: `/api/v1/devices/${deviceId}`,
      payload: { confirmation: "ARCHIVE" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      deviceId,
      archived: true,
      pollingHistoryRetained: true,
      alertsRetained: true
    });
    expect(state.devices.archive).toHaveBeenCalledWith(deviceId);
    expect(state.pool.query).toHaveBeenCalledOnce();
    expect(JSON.stringify(state.pool.query.mock.calls)).not.toContain("apiKey");
    await state.app.close();
  });

  it("denies device archival to regular users", async () => {
    const state = setup(regularUser);
    await state.ready;
    const response = await state.app.inject({
      method: "DELETE",
      url: `/api/v1/devices/${deviceId}`,
      payload: { confirmation: "ARCHIVE" }
    });
    expect(response.statusCode).toBe(403);
    expect(state.devices.archive).not.toHaveBeenCalled();
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

  it("rejects malformed custom CA material before persistence", async () => {
    const state = setup();
    await state.ready;
    const response = await state.app.inject({
      method: "PUT",
      url: `/api/v1/devices/${deviceId}/tls-trust`,
      payload: { certificateAuthority: "not a PEM certificate" }
    });

    expect(response.statusCode).toBe(400);
    expect(state.devices.setDeviceCaBundle).not.toHaveBeenCalled();
    await state.app.close();
  });

  it("does not attempt a connection test for a disabled device", async () => {
    const state = setup(admin, {
      devices: { getProfile: vi.fn(async () => ({ ...profile, enabled: false })) }
    });
    await state.ready;
    const response = await state.app.inject({
      method: "POST",
      url: `/api/v1/devices/${deviceId}/connection-test`
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("DEVICE_DISABLED");
    expect(state.clientFactory.create).not.toHaveBeenCalled();
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
    expect(state.pool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO poll_runs"),
      expect.arrayContaining([deviceId, "success", expect.any(Number), null])
    );
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
    expect(state.pool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO poll_runs"),
      expect.arrayContaining([deviceId, "failure", expect.any(Number), "authentication"])
    );
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
