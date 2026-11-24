import Fastify, { type FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { AdminUser } from "./auth.js";
import { COLLECTION_SETTING_DEFAULTS, collectionSettingsSchema, type CollectionSettings } from "./hub-settings.js";
import { CollectionLimits, registerHubCollectionSettingsRoutes, resolveCollectionSettings } from "./hub-collection-settings.js";

const admin: AdminUser = { id: "22222222-2222-4222-8222-222222222222", username: "admin", role: "admin" };
const viewer: AdminUser = { id: "33333333-3333-4333-8333-333333333333", username: "viewer", role: "user" };
const defaults = COLLECTION_SETTING_DEFAULTS;

const storedRow = {
  requestTimeoutMs: 20_000,
  successCacheTtlMs: 15_000,
  failureCacheTtlMs: 3_000,
  updatedAt: "2026-11-23T10:00:00.000Z",
  updatedBy: "admin",
  savedAt: "2026-11-23T10:00:00.000Z"
};

function fakePool(row: Record<string, unknown> | null) {
  return {
    query: vi.fn(async (sql: string) =>
      sql.includes("FROM hub_collection_settings")
        ? { rows: row ? [row] : [], rowCount: row ? 1 : 0 }
        : { rows: [], rowCount: 1 }
    )
  } as unknown as Pool & { query: ReturnType<typeof vi.fn> };
}

function setup(actor: AdminUser | null, options: {
  row?: Record<string, unknown> | null;
  apply?: (settings: CollectionSettings) => boolean;
} = {}) {
  const pool = fakePool(options.row ?? null);
  const apply = vi.fn(options.apply ?? (() => true));
  const app = Fastify();
  app.addHook("onRequest", async request => {
    if (actor) (request as FastifyRequest & { admin?: AdminUser }).admin = actor;
  });
  registerHubCollectionSettingsRoutes(app, { pool, apply });
  return { app, pool, apply };
}

const insertCalls = (pool: Pool & { query: ReturnType<typeof vi.fn> }) =>
  pool.query.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO hub_collection_settings"));

const saved: CollectionSettings = { requestTimeoutMs: 12_000, successCacheTtlMs: 8_000, failureCacheTtlMs: 1_500 };
const savedRow = {
  requestTimeoutMs: saved.requestTimeoutMs,
  successCacheTtlMs: saved.successCacheTtlMs,
  failureCacheTtlMs: saved.failureCacheTtlMs,
  updatedAt: "2026-11-23T11:00:00.000Z",
  updatedBy: "admin",
  savedAt: "2026-11-23T11:00:00.000Z"
};

describe("collection settings validation", () => {
  it("accepts the approved bounds and rejects values outside them", () => {
    expect(collectionSettingsSchema.safeParse({ requestTimeoutMs: 1_000, successCacheTtlMs: 1_000, failureCacheTtlMs: 0 }).success).toBe(true);
    expect(collectionSettingsSchema.safeParse({ requestTimeoutMs: 60_000, successCacheTtlMs: 60_000, failureCacheTtlMs: 60_000 }).success).toBe(true);
    expect(collectionSettingsSchema.safeParse({ requestTimeoutMs: 999, successCacheTtlMs: 10_000, failureCacheTtlMs: 2_000 }).success).toBe(false);
    expect(collectionSettingsSchema.safeParse({ requestTimeoutMs: 60_001, successCacheTtlMs: 10_000, failureCacheTtlMs: 2_000 }).success).toBe(false);
    expect(collectionSettingsSchema.safeParse({ requestTimeoutMs: 10_000, successCacheTtlMs: 999, failureCacheTtlMs: 0 }).success).toBe(false);
    expect(collectionSettingsSchema.safeParse({ requestTimeoutMs: 10_000, successCacheTtlMs: 10_000, failureCacheTtlMs: -1 }).success).toBe(false);
  });

  it("refuses a failure TTL longer than the success TTL and rejects unknown keys", () => {
    expect(collectionSettingsSchema.safeParse({ requestTimeoutMs: 10_000, successCacheTtlMs: 2_000, failureCacheTtlMs: 2_001 }).success).toBe(false);
    expect(collectionSettingsSchema.safeParse({ requestTimeoutMs: 10_000, successCacheTtlMs: 10_000, failureCacheTtlMs: 2_000, deviceId: "x" }).success).toBe(false);
  });

  it("rejects fractional values so the cache never sees a non-integer", () => {
    expect(collectionSettingsSchema.safeParse({ requestTimeoutMs: 10_000.5, successCacheTtlMs: 10_000, failureCacheTtlMs: 2_000 }).success).toBe(false);
  });
});

describe("collection limits holder", () => {
  it("starts from the stored values and switches only after validation", () => {
    const limits = new CollectionLimits(saved);
    expect(limits.requestTimeoutMs).toBe(12_000);
    expect(() => limits.apply({ requestTimeoutMs: 500, successCacheTtlMs: 8_000, failureCacheTtlMs: 1_500 })).toThrow();
    expect(limits.snapshot).toEqual(saved);
    limits.apply(defaults);
    expect(limits.failureCacheTtlMs).toBe(2_000);
  });
});


describe("collection settings resolution", () => {
  it("creates the install defaults when the singleton row is missing", async () => {
    const pool = fakePool(null);
    const resolved = await resolveCollectionSettings(pool);
    expect(resolved).toEqual({ settings: defaults, source: "install", updatedAt: null, updatedBy: null });
    const inserts = insertCalls(pool);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.[1]).toEqual([defaults.requestTimeoutMs, defaults.successCacheTtlMs, defaults.failureCacheTtlMs, null, null]);
  });

  it("reports the seeded row as install defaults while nobody has saved it", async () => {
    const resolved = await resolveCollectionSettings(fakePool({ ...storedRow, updatedBy: null, savedAt: null }));
    expect(resolved.source).toBe("install");
    expect(resolved.settings).toEqual({ requestTimeoutMs: 20_000, successCacheTtlMs: 15_000, failureCacheTtlMs: 3_000 });
    expect(resolved.updatedBy).toBeNull();
    expect(resolved.updatedAt).toBe("2026-11-23T10:00:00.000Z");
  });

  it("reports saved values and their author", async () => {
    const resolved = await resolveCollectionSettings(fakePool(storedRow));
    expect(resolved.source).toBe("hub");
    expect(resolved.settings).toEqual({ requestTimeoutMs: 20_000, successCacheTtlMs: 15_000, failureCacheTtlMs: 3_000 });
    expect(resolved.updatedBy).toBe("admin");
  });

  it("keeps reporting a saved row when the saving account is no longer attributed", async () => {
    const resolved = await resolveCollectionSettings(fakePool({ ...storedRow, updatedBy: null }));
    expect(resolved.source).toBe("hub");
    expect(resolved.updatedBy).toBeNull();
  });

  it("repairs a row edited outside the manager that no longer satisfies the bounds", async () => {
    const pool = fakePool({ ...storedRow, failureCacheTtlMs: 60_000, successCacheTtlMs: 1_000 });
    const resolved = await resolveCollectionSettings(pool);
    expect(resolved).toEqual({ settings: defaults, source: "install", updatedAt: null, updatedBy: null });
    expect(insertCalls(pool)).toHaveLength(1);
  });
});


describe("collection settings routes", () => {
  it("requires an administrator for both reading and saving", async () => {
    const anonymous = setup(null);
    expect((await anonymous.app.inject({ method: "GET", url: "/api/v1/hub-settings/collection" })).statusCode).toBe(401);
    expect((await anonymous.app.inject({ method: "PUT", url: "/api/v1/hub-settings/collection", payload: saved })).statusCode).toBe(401);
    await anonymous.app.close();

    const user = setup(viewer);
    const read = await user.app.inject({ method: "GET", url: "/api/v1/hub-settings/collection" });
    expect(read.statusCode).toBe(403);
    expect(read.json().error.code).toBe("ADMINISTRATOR_REQUIRED");
    const write = await user.app.inject({ method: "PUT", url: "/api/v1/hub-settings/collection", payload: saved });
    expect(write.statusCode).toBe(403);
    expect(user.apply).not.toHaveBeenCalled();
    expect(insertCalls(user.pool)).toHaveLength(0);
    await user.app.close();
  });

  it("creates and reports the install defaults on an untouched Hub", async () => {
    const state = setup(admin);
    const response = await state.app.inject({ method: "GET", url: "/api/v1/hub-settings/collection" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ ...defaults, source: "install", updatedAt: null, updatedBy: null });
    expect(insertCalls(state.pool)).toHaveLength(1);
    await state.app.close();
  });

  it("applies, persists, and audits a valid save", async () => {
    const state = setup(admin, { row: savedRow });
    const response = await state.app.inject({ method: "PUT", url: "/api/v1/hub-settings/collection", payload: saved });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ ...saved, source: "hub", applied: true });
    expect(state.apply).toHaveBeenCalledTimes(1);
    expect(state.apply).toHaveBeenCalledWith(saved);
    expect(insertCalls(state.pool)[0]?.[1]).toEqual([saved.requestTimeoutMs, saved.successCacheTtlMs, saved.failureCacheTtlMs, admin.id, expect.any(Date)]);
    const audit = state.pool.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO audit_events"));
    expect(audit?.[1]).toContain("hub.settings.update");
    expect(audit?.[1]).toContain("hub_collection_settings");
    await state.app.close();
  });

  it("rejects an out-of-bounds save without applying, persisting, or auditing it", async () => {
    const state = setup(admin, { row: savedRow });
    const response = await state.app.inject({
      method: "PUT",
      url: "/api/v1/hub-settings/collection",
      payload: { ...saved, successCacheTtlMs: 10_000, failureCacheTtlMs: 30_000 }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_COLLECTION_SETTINGS");
    expect(state.apply).not.toHaveBeenCalled();
    expect(insertCalls(state.pool)).toHaveLength(0);
    const audit = state.pool.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO audit_events"));
    expect(audit).toBeUndefined();
    await state.app.close();
  });

  it("reports a runtime refusal and keeps the previous values", async () => {
    const state = setup(admin, { row: savedRow, apply: () => { throw new Error("refused"); } });
    const response = await state.app.inject({ method: "PUT", url: "/api/v1/hub-settings/collection", payload: defaults });
    expect(response.statusCode).toBe(500);
    expect(response.json().error.code).toBe("COLLECTION_SETTINGS_NOT_APPLIED");
    expect(insertCalls(state.pool)).toHaveLength(0);
    await state.app.close();
  });

  it("restores the previous values when the row cannot be written", async () => {
    const state = setup(admin, { row: savedRow });
    const previous: CollectionSettings = {
      requestTimeoutMs: savedRow.requestTimeoutMs,
      successCacheTtlMs: savedRow.successCacheTtlMs,
      failureCacheTtlMs: savedRow.failureCacheTtlMs
    };
    state.pool.query.mockImplementation(async (sql: string) => {
      if (String(sql).includes("INSERT INTO hub_collection_settings")) throw new Error("write failed");
      return String(sql).includes("FROM hub_collection_settings")
        ? { rows: [savedRow], rowCount: 1 }
        : { rows: [], rowCount: 1 };
    });

    const response = await state.app.inject({ method: "PUT", url: "/api/v1/hub-settings/collection", payload: saved });

    expect(response.statusCode).toBe(500);
    expect(response.json().error.code).toBe("COLLECTION_SETTINGS_NOT_SAVED");
    expect(state.apply).toHaveBeenNthCalledWith(1, saved);
    expect(state.apply).toHaveBeenNthCalledWith(2, previous);
    const audit = state.pool.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO audit_events"));
    expect(audit?.[1]).toContain("failure");
    expect(audit?.[1]).toContain("hub_collection_settings");
    await state.app.close();
  });
});
