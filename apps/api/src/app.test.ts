import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { AppConfig } from "./config.js";
import { buildApp } from "./app.js";
import { createSessionToken, SESSION_COOKIE } from "./auth/session.js";
import type { PfSenseProvider } from "./pfsense/provider.js";

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
