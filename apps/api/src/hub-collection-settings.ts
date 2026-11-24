import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { authorizationFailure, type AdminUser } from "./auth.js";
import { appendAudit } from "./audit.js";
import {
  COLLECTION_SETTING_DEFAULTS,
  collectionSettingsSchema,
  type CollectionSettings
} from "./hub-settings.js";

/**
 * Runtime collection limits (DEC-046).
 *
 * The `hub_collection_settings` row is the single source of these three values:
 * how long one upstream pfSense read may take, and how long a successful or
 * failed observation may be reused from the in-process cache. Migration 020 seeds
 * it with the values the removed `PFSENSE_API_TIMEOUT_MS`,
 * `PFSENSE_OBSERVATION_CACHE_MS`, and `PFSENSE_OBSERVATION_ERROR_CACHE_MS`
 * environment variables defaulted to, Administration > Hub Settings edits it, and
 * the API restores the defaults if the row is ever missing or unreadable.
 *
 * Application is immediate and does not restart the API: the client factory reads
 * `CollectionLimits` when it builds a short-lived client (clients are not cached),
 * and the observation cache takes the new TTLs on the next stored entry.
 */

export type CollectionSettingsSource = "hub" | "install";

export interface ResolvedCollectionSettings {
  settings: CollectionSettings;
  /** `install` while `saved_at` is NULL; `hub` once an administrator saved it. */
  source: CollectionSettingsSource;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface StoredCollectionRow {
  requestTimeoutMs: unknown;
  successCacheTtlMs: unknown;
  failureCacheTtlMs: unknown;
  updatedAt: unknown;
  updatedBy: unknown;
  savedAt: unknown;
}

function asIsoString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

async function readCollectionRow(pool: Pool): Promise<StoredCollectionRow | null> {
  const result = await pool.query<StoredCollectionRow>(
    `SELECT s.request_timeout_ms AS "requestTimeoutMs",
            s.success_cache_ttl_ms AS "successCacheTtlMs",
            s.failure_cache_ttl_ms AS "failureCacheTtlMs",
            s.updated_at AS "updatedAt", s.saved_at AS "savedAt",
            u.username AS "updatedBy"
       FROM hub_collection_settings s
       LEFT JOIN admin_users u ON u.id = s.updated_by
      WHERE s.id = 1`
  );
  return result.rows[0] ?? null;
}

/**
 * Read the effective limits, creating or repairing the singleton row when it is
 * absent or no longer satisfies the bounds. A row is only invalid if the table was
 * edited outside the manager: the API schema and the `CHECK` constraints enforce
 * the same ranges.
 */
export async function resolveCollectionSettings(pool: Pool): Promise<ResolvedCollectionSettings> {
  const row = await readCollectionRow(pool);
  const parsed = row
    ? collectionSettingsSchema.safeParse({
        requestTimeoutMs: Number(row.requestTimeoutMs),
        successCacheTtlMs: Number(row.successCacheTtlMs),
        failureCacheTtlMs: Number(row.failureCacheTtlMs)
      })
    : null;
  if (!row || !parsed?.success) {
    await saveCollectionSettings(pool, COLLECTION_SETTING_DEFAULTS, { actorId: null, savedAt: null });
    return { settings: COLLECTION_SETTING_DEFAULTS, source: "install", updatedAt: null, updatedBy: null };
  }
  return {
    settings: parsed.data,
    source: asIsoString(row.savedAt) ? "hub" : "install",
    updatedAt: asIsoString(row.updatedAt),
    updatedBy: typeof row.updatedBy === "string" ? row.updatedBy : null
  };
}

/**
 * Persist the singleton row. Callers validate with `collectionSettingsSchema`
 * first. A repair that restores the install values passes
 * `{ actorId: null, savedAt: null }`, which is what makes `source` report
 * `install` again.
 */
export async function saveCollectionSettings(
  pool: Pool,
  settings: CollectionSettings,
  write: { actorId: string | null; savedAt: Date | null }
): Promise<void> {
  await pool.query(
    `INSERT INTO hub_collection_settings(id,request_timeout_ms,success_cache_ttl_ms,failure_cache_ttl_ms,updated_at,updated_by,saved_at)
     VALUES(1,$1,$2,$3,now(),$4,$5)
     ON CONFLICT (id) DO UPDATE SET
       request_timeout_ms=EXCLUDED.request_timeout_ms,
       success_cache_ttl_ms=EXCLUDED.success_cache_ttl_ms,
       failure_cache_ttl_ms=EXCLUDED.failure_cache_ttl_ms,
       updated_at=now(),
       updated_by=EXCLUDED.updated_by,
       saved_at=EXCLUDED.saved_at`,
    [settings.requestTimeoutMs, settings.successCacheTtlMs, settings.failureCacheTtlMs, write.actorId, write.savedAt]
  );
}

/**
 * The values the running process uses, held once and updated on save.
 *
 * Short-lived pfSense clients and the observation cache read this instead of the
 * process environment, so a saved value applies to the next request rather than
 * requiring a container restart.
 */
export class CollectionLimits {
  private current: CollectionSettings;

  constructor(initial: CollectionSettings) {
    this.current = collectionSettingsSchema.parse(initial);
  }

  get requestTimeoutMs(): number {
    return this.current.requestTimeoutMs;
  }

  get successCacheTtlMs(): number {
    return this.current.successCacheTtlMs;
  }

  get failureCacheTtlMs(): number {
    return this.current.failureCacheTtlMs;
  }

  get snapshot(): CollectionSettings {
    return { ...this.current };
  }

  /** Validates before switching, so a bad row can never reach a live client. */
  apply(next: CollectionSettings): void {
    this.current = collectionSettingsSchema.parse(next);
  }
}

export interface HubCollectionSettingsRouteDependencies {
  pool: Pool;
  /** Register the values with the client factory and observation cache. */
  apply: (settings: CollectionSettings) => boolean;
}

interface AuthenticatedRequest extends FastifyRequest {
  admin?: AdminUser;
}

const SETTINGS_BOUNDS_SUMMARY = "requestTimeoutMs 1000-60000, successCacheTtlMs 1000-60000, failureCacheTtlMs 0-60000 and not longer than successCacheTtlMs";

async function requireAdministrator(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const failure = authorizationFailure((request as AuthenticatedRequest).admin ?? null);
  if (failure === 401) {
    await reply.code(401).send({ error: { code: "AUTHENTICATION_REQUIRED", message: "Sign in to access this resource." } });
    return false;
  }
  if (failure === 403) {
    await reply.code(403).send({ error: { code: "ADMINISTRATOR_REQUIRED", message: "Administrator permissions are required for this operation." } });
    return false;
  }
  return true;
}

function settingsView(resolved: ResolvedCollectionSettings) {
  return {
    ...resolved.settings,
    source: resolved.source,
    updatedAt: resolved.updatedAt,
    updatedBy: resolved.updatedBy
  };
}

/**
 * `GET`/`PUT /api/v1/hub-settings/collection`. Both methods are administrator-only
 * (route-level check plus the server's admin-only hook). Registered as a module so
 * the authorization and validation boundaries are testable without booting the
 * whole API.
 */
export function registerHubCollectionSettingsRoutes(app: FastifyInstance, dependencies: HubCollectionSettingsRouteDependencies): void {
  app.get("/api/v1/hub-settings/collection", async (request, reply) => {
    if (!await requireAdministrator(request, reply)) return reply;
    const resolved = await resolveCollectionSettings(dependencies.pool);
    return { data: settingsView(resolved) };
  });

  app.put("/api/v1/hub-settings/collection", async (request, reply) => {
    if (!await requireAdministrator(request, reply)) return reply;
    const parsed = collectionSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: "INVALID_COLLECTION_SETTINGS",
          message: parsed.error.issues[0]?.message ?? `Check each collection limit. Allowed ranges: ${SETTINGS_BOUNDS_SUMMARY}.`
        }
      });
    }
    const actor = (request as AuthenticatedRequest).admin ?? null;
    const previous = await resolveCollectionSettings(dependencies.pool);

    let applied: boolean;
    try {
      applied = dependencies.apply(parsed.data);
    } catch {
      await appendAudit(dependencies.pool, {
        actorId: actor?.id ?? null,
        actorUsername: actor?.username ?? null,
        action: "hub.settings.update",
        outcome: "failure",
        targetType: "hub_collection_settings",
        summary: "Rejected collection limits the runtime refused",
        requestId: request.id,
        metadata: { requested: parsed.data }
      });
      return reply.code(500).send({
        error: { code: "COLLECTION_SETTINGS_NOT_APPLIED", message: "The API rejected these collection limits. The previous values are still in effect." }
      });
    }

    try {
      await saveCollectionSettings(dependencies.pool, parsed.data, { actorId: actor?.id ?? null, savedAt: new Date() });
    } catch {
      // Keep runtime and storage consistent: restore the values that were in effect.
      try { dependencies.apply(previous.settings); } catch { /* the previous values were already accepted once */ }
      await appendAudit(dependencies.pool, {
        actorId: actor?.id ?? null,
        actorUsername: actor?.username ?? null,
        action: "hub.settings.update",
        outcome: "failure",
        targetType: "hub_collection_settings",
        summary: "Could not persist collection limits",
        requestId: request.id,
        metadata: { requested: parsed.data, restored: previous.settings }
      });
      return reply.code(500).send({
        error: { code: "COLLECTION_SETTINGS_NOT_SAVED", message: "The settings could not be saved. The previous values were restored." }
      });
    }

    await appendAudit(dependencies.pool, {
      actorId: actor?.id ?? null,
      actorUsername: actor?.username ?? null,
      action: "hub.settings.update",
      outcome: "success",
      targetType: "hub_collection_settings",
      summary: "Updated collection limits",
      requestId: request.id,
      metadata: { previous: previous.settings, updated: parsed.data, applied }
    });

    const resolved = await resolveCollectionSettings(dependencies.pool);
    return { data: { ...settingsView(resolved), applied } };
  });
}

