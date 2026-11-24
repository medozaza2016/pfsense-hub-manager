import Fastify, { type FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { AdminUser } from "./auth.js";
import { POLLING_SETTING_DEFAULTS, pollingSettingsSchema, type PollingSettings } from "./hub-settings.js";
import { registerHubPollingSettingsRoutes, resolvePollingSettings } from "./hub-polling-settings.js";

const admin: AdminUser = { id: "22222222-2222-4222-8222-222222222222", username: "admin", role: "admin" };
const viewer: AdminUser = { id: "33333333-3333-4333-8333-333333333333", username: "viewer", role: "user" };
const defaults = POLLING_SETTING_DEFAULTS;

const storedRow = {
  intervalMs: 120_000,
  concurrency: 4,
  jitterMs: 5_000,
  retentionDays: 14,
  updatedAt: "2026-11-23T10:00:00.000Z",
  updatedBy: "admin"
};

function fakePool(row: Record<string, unknown> | null) {
  return {
    query: vi.fn(async (sql: string) =>
      sql.includes("FROM hub_polling_settings")
        ? { rows: row ? [row] : [], rowCount: row ? 1 : 0 }
        : { rows: [], rowCount: 1 }
    )
  } as unknown as Pool & { query: ReturnType<typeof vi.fn> };
}

function setup(actor: AdminUser | null, options: {
  row?: Record<string, unknown> | null;
  pollingEnabled?: boolean;
  apply?: (settings: PollingSettings) => boolean;
} = {}) {
  const pool = fakePool(options.row ?? null);
  const pollingEnabled = options.pollingEnabled ?? true;
  // Mirrors the server: with the flag off there is no scheduler to start.
  const apply = vi.fn(options.apply ?? (() => pollingEnabled));
  const app = Fastify();
  app.addHook("onRequest", async request => {
    if (actor) (request as FastifyRequest & { admin?: AdminUser }).admin = actor;
  });
  registerHubPollingSettingsRoutes(app, {
    pool,
    pollingEnabled,
    apply
  });
  return { app, pool, apply };
}

const insertCalls = (pool: Pool & { query: ReturnType<typeof vi.fn> }) =>
  pool.query.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO hub_polling_settings"));

describe("polling settings validation", () => {
  it("accepts the approved bounds and rejects values outside them", () => {
    expect(pollingSettingsSchema.safeParse({ intervalMs: 15_000, concurrency: 1, jitterMs: 0, retentionDays: 1 }).success).toBe(true);
    expect(pollingSettingsSchema.safeParse({ intervalMs: 3_600_000, concurrency: 8, jitterMs: 60_000, retentionDays: 365 }).success).toBe(true);
    expect(pollingSettingsSchema.safeParse({ intervalMs: 3_600_000, concurrency: 8, jitterMs: 59_999, retentionDays: 365 }).success).toBe(true);
    expect(pollingSettingsSchema.safeParse({ intervalMs: 14_999, concurrency: 2, jitterMs: 0, retentionDays: 30 }).success).toBe(false);
    expect(pollingSettingsSchema.safeParse({ intervalMs: 3_600_001, concurrency: 2, jitterMs: 0, retentionDays: 30 }).success).toBe(false);
    expect(pollingSettingsSchema.safeParse({ intervalMs: 60_000, concurrency: 0, jitterMs: 0, retentionDays: 30 }).success).toBe(false);
    expect(pollingSettingsSchema.safeParse({ intervalMs: 60_000, concurrency: 9, jitterMs: 0, retentionDays: 30 }).success).toBe(false);
    expect(pollingSettingsSchema.safeParse({ intervalMs: 60_000, concurrency: 2, jitterMs: 60_001, retentionDays: 30 }).success).toBe(false);
    expect(pollingSettingsSchema.safeParse({ intervalMs: 60_000, concurrency: 2, jitterMs: 0, retentionDays: 0 }).success).toBe(false);
    expect(pollingSettingsSchema.safeParse({ intervalMs: 60_000, concurrency: 2, jitterMs: 0, retentionDays: 366 }).success).toBe(false);
  });

  it("requires jitter to be shorter than the interval and rejects unknown keys", () => {
    expect(pollingSettingsSchema.safeParse({ intervalMs: 60_000, concurrency: 2, jitterMs: 60_000, retentionDays: 30 }).success).toBe(false);
    expect(pollingSettingsSchema.safeParse({ intervalMs: 60_000, concurrency: 2, jitterMs: 0, retentionDays: 30, paused: true }).success).toBe(false);
  });

  it("rejects fractional values so the scheduler never sees a non-integer", () => {
    expect(pollingSettingsSchema.safeParse({ intervalMs: 60_000.5, concurrency: 2, jitterMs: 0, retentionDays: 30 }).success).toBe(false);
  });
});

describe("polling settings resolution", () => {
  it("creates the install defaults when the singleton row is missing", async () => {
    const pool = fakePool(null);
    const resolved = await resolvePollingSettings(pool);
    expect(resolved).toEqual({ settings: defaults, source: "install", updatedAt: null, updatedBy: null });
    const inserts = insertCalls(pool);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.[1]).toEqual([defaults.intervalMs, defaults.concurrency, defaults.jitterMs, defaults.retentionDays, null]);
  });

  it("reports the seeded row as install defaults while nobody has saved it", async () => {
    const resolved = await resolvePollingSettings(fakePool({ ...storedRow, updatedBy: null }));
    expect(resolved.source).toBe("install");
    expect(resolved.settings).toEqual({ intervalMs: 120_000, concurrency: 4, jitterMs: 5_000, retentionDays: 14 });
    expect(resolved.updatedBy).toBeNull();
    expect(resolved.updatedAt).toBe("2026-11-23T10:00:00.000Z");
  });

  it("reports saved values and their author", async () => {
    const resolved = await resolvePollingSettings(fakePool(storedRow));
    expect(resolved.source).toBe("hub");
    expect(resolved.settings).toEqual({ intervalMs: 120_000, concurrency: 4, jitterMs: 5_000, retentionDays: 14 });
    expect(resolved.updatedBy).toBe("admin");
    expect(resolved.updatedAt).toBe("2026-11-23T10:00:00.000Z");
  });

  it("repairs a row edited outside the manager that no longer satisfies the bounds", async () => {
    const pool = fakePool({ ...storedRow, jitterMs: 900_000 });
    const resolved = await resolvePollingSettings(pool);
    expect(resolved).toEqual({ settings: defaults, source: "install", updatedAt: null, updatedBy: null });
    expect(insertCalls(pool)).toHaveLength(1);
  });
});


const saved: PollingSettings = { intervalMs: 90_000, concurrency: 3, jitterMs: 10_000, retentionDays: 7 };
const savedRow = {
  intervalMs: saved.intervalMs,
  concurrency: saved.concurrency,
  jitterMs: saved.jitterMs,
  retentionDays: saved.retentionDays,
  updatedAt: "2026-11-23T11:00:00.000Z",
  updatedBy: "admin"
};

describe("polling settings routes", () => {
  it("requires an administrator for both reading and saving", async () => {
    const anonymous = setup(null);
    expect((await anonymous.app.inject({ method: "GET", url: "/api/v1/hub-settings/polling" })).statusCode).toBe(401);
    expect((await anonymous.app.inject({ method: "PUT", url: "/api/v1/hub-settings/polling", payload: saved })).statusCode).toBe(401);
    await anonymous.app.close();

    const user = setup(viewer);
    const read = await user.app.inject({ method: "GET", url: "/api/v1/hub-settings/polling" });
    expect(read.statusCode).toBe(403);
    expect(read.json().error.code).toBe("ADMINISTRATOR_REQUIRED");
    const write = await user.app.inject({ method: "PUT", url: "/api/v1/hub-settings/polling", payload: saved });
    expect(write.statusCode).toBe(403);
    expect(user.apply).not.toHaveBeenCalled();
    expect(insertCalls(user.pool)).toHaveLength(0);
    await user.app.close();
  });

  it("creates and reports the install defaults on an untouched Hub", async () => {
    const state = setup(admin, { pollingEnabled: false });
    const response = await state.app.inject({ method: "GET", url: "/api/v1/hub-settings/polling" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      ...defaults,
      source: "install",
      pollingEnabled: false,
      updatedAt: null,
      updatedBy: null
    });
    expect(insertCalls(state.pool)).toHaveLength(1);
    await state.app.close();
  });

  it("reports saved values and who last changed them", async () => {
    const state = setup(admin, { row: storedRow });
    const response = await state.app.inject({ method: "GET", url: "/api/v1/hub-settings/polling" });
    expect(response.json().data).toMatchObject({ intervalMs: 120_000, concurrency: 4, source: "hub", updatedBy: "admin" });
    expect(insertCalls(state.pool)).toHaveLength(0);
    await state.app.close();
  });

  it("applies, persists, and audits a valid save", async () => {
    const state = setup(admin, { row: savedRow });
    const response = await state.app.inject({ method: "PUT", url: "/api/v1/hub-settings/polling", payload: saved });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ ...saved, source: "hub", pollingEnabled: true, applied: true });
    expect(state.apply).toHaveBeenCalledTimes(1);
    expect(state.apply).toHaveBeenCalledWith(saved);
    expect(insertCalls(state.pool)).toHaveLength(1);
    expect(insertCalls(state.pool)[0]?.[1]).toEqual([saved.intervalMs, saved.concurrency, saved.jitterMs, saved.retentionDays, admin.id]);
    const audit = state.pool.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO audit_events"));
    expect(audit?.[1]).toContain("hub.settings.update");
    await state.app.close();
  });

  it("stores values without starting a scheduler when polling is disabled", async () => {
    const state = setup(admin, { row: savedRow, pollingEnabled: false });
    const response = await state.app.inject({ method: "PUT", url: "/api/v1/hub-settings/polling", payload: saved });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ applied: false, pollingEnabled: false, source: "hub" });
    expect(insertCalls(state.pool)).toHaveLength(1);
    await state.app.close();
  });

  it("rejects out-of-bounds values before touching the scheduler or the database", async () => {
    const state = setup(admin);
    for (const payload of [
      { ...saved, intervalMs: 14_999 },
      { ...saved, intervalMs: 3_600_001 },
      { ...saved, concurrency: 0 },
      { ...saved, concurrency: 9 },
      { ...saved, retentionDays: 0 },
      { ...saved, retentionDays: 366 },
      { ...saved, intervalMs: 60_000, jitterMs: 60_000 },
      { ...saved, paused: true }
    ]) {
      const response = await state.app.inject({ method: "PUT", url: "/api/v1/hub-settings/polling", payload });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("INVALID_POLLING_SETTINGS");
    }
    expect(state.apply).not.toHaveBeenCalled();
    expect(insertCalls(state.pool)).toHaveLength(0);
    await state.app.close();
  });

  it("keeps the previous cadence when the scheduler rejects a value", async () => {
    const state = setup(admin, {
      row: storedRow,
      apply: () => { throw new Error("scheduler refused"); }
    });
    const response = await state.app.inject({ method: "PUT", url: "/api/v1/hub-settings/polling", payload: saved });
    expect(response.statusCode).toBe(500);
    expect(response.json().error.code).toBe("POLLING_SETTINGS_NOT_APPLIED");
    expect(response.body).not.toContain("scheduler refused");
    expect(insertCalls(state.pool)).toHaveLength(0);
    await state.app.close();
  });

  it("restores the running cadence when the row cannot be persisted", async () => {
    const state = setup(admin, { row: storedRow });
    state.pool.query.mockImplementation(async (sql: string) => {
      if (String(sql).includes("INSERT INTO hub_polling_settings")) throw new Error("write failed");
      if (String(sql).includes("FROM hub_polling_settings")) return { rows: [storedRow], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const response = await state.app.inject({ method: "PUT", url: "/api/v1/hub-settings/polling", payload: saved });
    expect(response.statusCode).toBe(500);
    expect(response.json().error.code).toBe("POLLING_SETTINGS_NOT_SAVED");
    expect(state.apply).toHaveBeenCalledTimes(2);
    expect(state.apply).toHaveBeenLastCalledWith({
      intervalMs: 120_000, concurrency: 4, jitterMs: 5_000, retentionDays: 14
    });
    await state.app.close();
  });
});
