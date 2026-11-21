import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { AppConfig } from "./config.js";
import { buildApp } from "./app.js";
import { createSessionToken, SESSION_COOKIE } from "./auth/session.js";
import type { PfSenseProvider } from "./pfsense/provider.js";

const { tlsConnectMock } = vi.hoisted(() => ({ tlsConnectMock: vi.fn() }));
vi.mock("node:tls", () => ({ connect: tlsConnectMock }));

const config: AppConfig = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 3000,
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  PFSENSE_DEVICE_ID: "00000000-0000-4000-8000-000000000001",
  PFSENSE_DEVICE_NAME: "Primary firewall",
  PFSENSE_DEVICE_LOCATION: "Main site",
  PFSENSE_EDITION: "plus",
  PFSENSE_API_BASE_URL: "https://primary.example.test:10443",
  PFSENSE_API_KEY_FILE: "./secret",
  PFSENSE_CREDENTIALS_KEY_FILE: "./credentials-key",
  PFSENSE_API_TIMEOUT_MS: 10000
};

function createHarness(role: "admin" | "user" | null = "admin") {
  const sessionRows = role ? [{
    id: "user-1",
    display_name: "Test Operator",
    email: "operator@example.test",
    role,
    is_active: true,
    session_id: "session-1"
  }] : [];

  const query = vi.fn(async (statement: string) => {
    if (statement.includes("FROM manager_sessions s JOIN manager_users u")) {
      return { rows: sessionRows, rowCount: sessionRows.length };
    }
    if (statement.includes("FROM manager_users ORDER BY created_at")) {
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  });

  const pool = { query } as unknown as Pool;
  const provider = {
    listDevices: vi.fn().mockResolvedValue([]),
    testConnection: vi.fn(),
    registerDevice: vi.fn(),
    updateDevice: vi.fn(),
    updateDeviceCredentials: vi.fn(),
    deleteDevice: vi.fn(),
    capabilities: vi.fn().mockResolvedValue([]),
    collect: vi.fn()
  } as unknown as PfSenseProvider;

  const app = buildApp({ config, pool, provider });
  const token = createSessionToken();

  return { app, query, provider, cookie: `${SESSION_COOKIE}=${token}` };
}

describe("Fastify route authentication and authorization", () => {
  const apps: Array<ReturnType<typeof buildApp>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map(app => app.close()));
  });

  it("rejects API requests without a session", async () => {
    const { app } = createHarness();
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/v1/users" });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("rejects expired or inactive sessions", async () => {
    const { app, query, cookie } = createHarness(null);
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users",
      headers: { cookie }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("SESSION_EXPIRED");
    expect(query).toHaveBeenCalledOnce();
  });

  it("denies a regular user access to administrator-only routes", async () => {
    const { app, query, cookie } = createHarness("user");
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users",
      headers: { cookie }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
    expect(query.mock.calls.some(([statement]) => statement.includes("FROM manager_users ORDER BY created_at"))).toBe(false);
  });

  it("allows an administrator to access administrator-only routes", async () => {
    const { app, cookie } = createHarness("admin");
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users",
      headers: { cookie }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [] });
  });

  it("allows an authenticated regular user to access permitted device inventory", async () => {
    const { app, provider, cookie } = createHarness("user");
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/devices",
      headers: { cookie }
    });

    expect(response.statusCode).toBe(200);
    expect(provider.listDevices).toHaveBeenCalledOnce();
  });

  it("allows an administrator to register a device after the connection test", async () => {
    const { app, provider, cookie } = createHarness("admin");
    apps.push(app);
    vi.mocked(provider.registerDevice).mockResolvedValue({
      device: { id: "branch-device-id", name: "Branch firewall", location: "Branch office", edition: "ce", enabled: true },
      connection: { reachable: true, version: { version: "2.8.1" } }
    } as never);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/devices",
      headers: { cookie },
      payload: {
        name: "Branch firewall",
        location: "Branch office",
        edition: "ce",
        apiBaseUrl: "https://branch.example.test:10443",
        apiKey: "test-read-only-key",
        caCertificatePem: "-----BEGIN CERTIFICATE-----\ntest-ca\n-----END CERTIFICATE-----",
        tlsServername: "branch.example.test"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(provider.registerDevice).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "test-read-only-key",
      caCertificatePem: expect.stringContaining("BEGIN CERTIFICATE"),
      tlsServername: "branch.example.test"
    }));
    expect(response.body).not.toContain("test-read-only-key");
  });

  it("denies device registration to regular users", async () => {
    const { app, provider, cookie } = createHarness("user");
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/devices",
      headers: { cookie },
      payload: {
        name: "Branch firewall",
        edition: "ce",
        apiBaseUrl: "https://branch.example.test:10443",
        apiKey: "test-read-only-key"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(provider.registerDevice).not.toHaveBeenCalled();
  });

  it("updates device metadata through the typed route", async () => {
    const { app, provider, cookie } = createHarness("admin");
    apps.push(app);
    vi.mocked(provider.updateDevice).mockResolvedValue({
      id: "branch-device-id", name: "Updated branch", location: null, edition: "ce", enabled: true
    } as never);

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/devices/branch-device-id",
      headers: { cookie },
      payload: { name: "Updated branch", location: null, edition: "ce", enabled: true }
    });

    expect(response.statusCode).toBe(200);
    expect(provider.updateDevice).toHaveBeenCalledWith("branch-device-id", {
      name: "Updated branch", location: null, edition: "ce", enabled: true
    });
  });

  it("updates credentials only through the administrator credential route", async () => {
    const { app, provider, cookie } = createHarness("admin");
    apps.push(app);
    vi.mocked(provider.updateDeviceCredentials).mockResolvedValue({
      deviceId: "branch-device-id", connection: { reachable: true, version: { version: "2.8.1" } }
    } as never);

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/devices/branch-device-id/credentials",
      headers: { cookie },
      payload: {
        apiKey: "replacement-read-only-key",
        caCertificatePem: "-----BEGIN CERTIFICATE-----\ntest-ca\n-----END CERTIFICATE-----",
        tlsServername: "branch.example.test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(provider.updateDeviceCredentials).toHaveBeenCalledWith("branch-device-id", expect.objectContaining({
      apiKey: "replacement-read-only-key",
      tlsServername: "branch.example.test"
    }));
    expect(response.body).not.toContain("replacement-read-only-key");
  });

  it("allows an administrator to delete the configured placeholder device", async () => {
    const { app, provider, cookie } = createHarness("admin");
    apps.push(app);
    vi.mocked(provider.deleteDevice).mockResolvedValue(true);

    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/devices/${config.PFSENSE_DEVICE_ID}`,
      headers: { cookie }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ id: config.PFSENSE_DEVICE_ID, deleted: true });
    expect(provider.deleteDevice).toHaveBeenCalledWith(config.PFSENSE_DEVICE_ID);
  });

  it("denies credential rotation to regular users", async () => {
    const { app, provider, cookie } = createHarness("user");
    apps.push(app);

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/devices/branch-device-id/credentials",
      headers: { cookie },
      payload: { apiKey: "replacement-read-only-key" }
    });

    expect(response.statusCode).toBe(403);
    expect(provider.updateDeviceCredentials).not.toHaveBeenCalled();
  });

  it("passes the supplied CA and TLS server name to the connection test", async () => {
    const { app, provider, cookie } = createHarness("admin");
    apps.push(app);
    vi.mocked(provider.testConnection).mockResolvedValue({ reachable: true, version: { version: "2.8.1" } } as never);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/devices/test-connection",
      headers: { cookie },
      payload: {
        name: "Branch firewall",
        edition: "ce",
        apiBaseUrl: "https://branch.example.test:10443",
        apiKey: "test-read-only-key",
        caCertificatePem: "-----BEGIN CERTIFICATE-----\ntest-ca\n-----END CERTIFICATE-----",
        tlsServername: "branch.example.test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(provider.testConnection).toHaveBeenCalledWith(expect.objectContaining({
      caCertificatePem: expect.stringContaining("BEGIN CERTIFICATE"),
      tlsServername: "branch.example.test"
    }));
  });

  it("discovers certificate identity metadata without treating discovery as trust", async () => {
    const { app, cookie } = createHarness("admin");
    apps.push(app);
    const listeners: Record<string, () => void> = {};
    const socket: {
      once: (event: string, callback: () => void) => unknown;
      destroy: ReturnType<typeof vi.fn>;
      end: ReturnType<typeof vi.fn>;
      getPeerCertificate: ReturnType<typeof vi.fn>;
    } = {
      once(event, callback) { listeners[event] = callback; return socket; },
      destroy: vi.fn(),
      end: vi.fn(),
      getPeerCertificate: vi.fn(() => ({
        raw: Buffer.from("test-certificate"),
        subject: { CN: "branch.example.test" },
        issuer: { CN: "Test CA" },
        subjectaltname: "DNS:branch.example.test",
        fingerprint256: "AA:BB:CC",
        valid_to: "Dec 31 23:59:59 2030 GMT"
      }))
    };
    tlsConnectMock.mockReset().mockImplementation(() => {
      queueMicrotask(() => listeners.secureConnect?.());
      return socket;
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/devices/discover-certificate",
      headers: { cookie },
      payload: { apiBaseUrl: "https://branch.example.test:10443" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      dnsNames: ["branch.example.test"],
      suggestedServername: "branch.example.test",
      fingerprint256: "AA:BB:CC"
    });
    expect(tlsConnectMock).toHaveBeenCalledWith(expect.objectContaining({
      host: "branch.example.test",
      port: 10443,
      servername: "branch.example.test",
      rejectUnauthorized: false
    }));
    expect(socket.end).toHaveBeenCalledOnce();
  });

  it("rejects certificate discovery for non-HTTPS URLs", async () => {
    const { app, cookie } = createHarness("admin");
    apps.push(app);
    tlsConnectMock.mockReset();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/devices/discover-certificate",
      headers: { cookie },
      payload: { apiBaseUrl: "http://branch.example.test" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("CERTIFICATE_DISCOVERY_FAILED");
    expect(tlsConnectMock).not.toHaveBeenCalled();
  });

  it("rejects state-changing requests from an untrusted origin", async () => {
    const { app, query, cookie } = createHarness("admin");
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: {
        cookie,
        origin: "https://attacker.example",
        host: "manager.example.test"
      },
      payload: {
        name: "New Operator",
        email: "new.operator@example.test",
        password: "a-long-test-password",
        role: "user"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("INVALID_ORIGIN");
    expect(query.mock.calls.some(([statement]) => statement.includes("INSERT INTO manager_users"))).toBe(false);
  });
});
