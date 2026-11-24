import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { authorizationFailure, type AdminUser } from "./auth.js";
import { appendAudit } from "./audit.js";
import { POLLING_SETTING_DEFAULTS, pollingSettingsSchema, type PollingSettings } from "./hub-settings.js";

/**
 * Runtime background-polling settings (DEC-044).
 *
 * The `hub_polling_settings` row is the single source of these four values.
 * Migration 017 seeds it at install time, Administration > Hub Settings edits it,
 * and the API restores the defaults if the row is ever missing or unreadable, so
 * there is never a second set of values for the running scheduler to disagree
 * with. No environment variable carries them.
 *
 * `PFSENSE_POLLING_ENABLED` stays environment-only: whether this process may
 * schedule at all is a deployment decision that must not be flippable from the
 * browser.
 */

export type PollingSettingsSource = "hub" | "install";

export interface ResolvedPollingSettings {
  settings: PollingSettings;
  /** `install` while the seeded row is untouched; `hub` once an administrator saved it. */
  source: PollingSettingsSource;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface StoredSettingsRow {
  intervalMs: unknown;
  concurrency: unknown;
  jitterMs: unknown;
  retentionDays: unknown;
  updatedAt: unknown;
  updatedBy: unknown;
}

function asIsoString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

async function readPollingRow(pool: Pool): Promise<StoredSettingsRow | null> {
  const result = await pool.query<StoredSettingsRow>(
    `SELECT s.interval_ms AS "intervalMs", s.concurrency, s.jitter_ms AS "jitterMs",
            s.retention_days AS "retentionDays", s.updated_at AS "updatedAt", u.username AS "updatedBy"
       FROM hub_polling_settings s
       LEFT JOIN admin_users u ON u.id = s.updated_by
      WHERE s.id = 1`
  );
  return result.rows[0] ?? null;
}

/**
 * Read the effective cadence, creating or repairing the singleton row when it is
 * absent or no longer satisfies the bounds. A row is only invalid if the table was
 * edited outside the manager, since the API and the `CHECK` constraints both
 * enforce the same ranges.
 */
export async function resolvePollingSettings(pool: Pool): Promise<ResolvedPollingSettings> {
  const row = await readPollingRow(pool);
  const parsed = row
    ? pollingSettingsSchema.safeParse({
        intervalMs: Number(row.intervalMs),
        concurrency: Number(row.concurrency),
        jitterMs: Number(row.jitterMs),
        retentionDays: Number(row.retentionDays)
      })
    : null;
  if (!row || !parsed?.success) {
    await savePollingSettings(pool, POLLING_SETTING_DEFAULTS, null);
    return { settings: POLLING_SETTING_DEFAULTS, source: "install", updatedAt: null, updatedBy: null };
  }
  const updatedBy = typeof row.updatedBy === "string" ? row.updatedBy : null;
  return {
    settings: parsed.data,
    source: updatedBy ? "hub" : "install",
    updatedAt: asIsoString(row.updatedAt),
    updatedBy
  };
}

/** Persist the singleton row. Callers validate with `pollingSettingsSchema` first. */
export async function savePollingSettings(pool: Pool, settings: PollingSettings, actorId: string | null): Promise<void> {
  await pool.query(
    `INSERT INTO hub_polling_settings(id,interval_ms,concurrency,jitter_ms,retention_days,updated_at,updated_by)
     VALUES(1,$1,$2,$3,$4,now(),$5)
     ON CONFLICT (id) DO UPDATE SET
       interval_ms=EXCLUDED.interval_ms,
       concurrency=EXCLUDED.concurrency,
       jitter_ms=EXCLUDED.jitter_ms,
       retention_days=EXCLUDED.retention_days,
       updated_at=now(),
       updated_by=EXCLUDED.updated_by`,
    [settings.intervalMs, settings.concurrency, settings.jitterMs, settings.retentionDays, actorId]
  );
}

export interface HubPollingSettingsRouteDependencies {
  pool: Pool;
  /** False when `PFSENSE_POLLING_ENABLED` is off: values are stored and shown but not run. */
  pollingEnabled: boolean;
  /**
   * Swap the running scheduler to the new values. Constructs before stopping the
   * current scheduler, so a rejected value leaves the previous cadence running.
   * Returns false when this deployment does not schedule at all.
   */
  apply: (settings: PollingSettings) => boolean;
}

interface AuthenticatedRequest extends FastifyRequest {
  admin?: AdminUser;
}


const SETTINGS_BOUNDS_SUMMARY = "intervalMs 15000-3600000, concurrency 1-8, jitterMs 0-60000 and shorter than intervalMs, retentionDays 1-365";

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

function settingsView(resolved: ResolvedPollingSettings, pollingEnabled: boolean) {
  return {
    ...resolved.settings,
    source: resolved.source,
    pollingEnabled,
    updatedAt: resolved.updatedAt,
    updatedBy: resolved.updatedBy
  };
}

/**
 * `GET`/`PUT /api/v1/hub-settings/polling`. Both methods are administrator-only
 * (route-level check plus the server's admin-only hook). Registered as a module
 * so the authorization and validation boundaries are testable without booting
 * the whole API.
 */
export function registerHubPollingSettingsRoutes(app: FastifyInstance, dependencies: HubPollingSettingsRouteDependencies): void {
  app.get("/api/v1/hub-settings/polling", async (request, reply) => {
    if (!await requireAdministrator(request, reply)) return reply;
    const resolved = await resolvePollingSettings(dependencies.pool);
    return { data: settingsView(resolved, dependencies.pollingEnabled) };
  });

  app.put("/api/v1/hub-settings/polling", async (request, reply) => {
    if (!await requireAdministrator(request, reply)) return reply;
    const parsed = pollingSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: "INVALID_POLLING_SETTINGS",
          message: parsed.error.issues[0]?.message ?? `Check each polling setting. Allowed ranges: ${SETTINGS_BOUNDS_SUMMARY}.`
        }
      });
    }
    const actor = (request as AuthenticatedRequest).admin ?? null;
    const previous = await resolvePollingSettings(dependencies.pool);

    let applied: boolean;
    try {
      applied = dependencies.apply(parsed.data);
    } catch {
      await appendAudit(dependencies.pool, {
        actorId: actor?.id ?? null,
        actorUsername: actor?.username ?? null,
        action: "hub.settings.update",
        outcome: "failure",
        targetType: "hub_polling_settings",
        summary: "Rejected polling settings the scheduler could not run with",
        requestId: request.id,
        metadata: { requested: parsed.data }
      });
      return reply.code(500).send({
        error: { code: "POLLING_SETTINGS_NOT_APPLIED", message: "The polling scheduler rejected these settings. The previous cadence is still running." }
      });
    }

    try {
      await savePollingSettings(dependencies.pool, parsed.data, actor?.id ?? null);
    } catch {
      // Keep runtime and storage consistent: restore the cadence that was running.
      try { dependencies.apply(previous.settings); } catch { /* the previous values were already accepted once */ }
      await appendAudit(dependencies.pool, {
        actorId: actor?.id ?? null,
        actorUsername: actor?.username ?? null,
        action: "hub.settings.update",
        outcome: "failure",
        targetType: "hub_polling_settings",
        summary: "Could not persist polling settings",
        requestId: request.id,
        metadata: { requested: parsed.data, restored: previous.settings }
      });
      return reply.code(500).send({
        error: { code: "POLLING_SETTINGS_NOT_SAVED", message: "The settings could not be saved. The previous cadence was restored." }
      });
    }

    await appendAudit(dependencies.pool, {
      actorId: actor?.id ?? null,
      actorUsername: actor?.username ?? null,
      action: "hub.settings.update",
      outcome: "success",
      targetType: "hub_polling_settings",
      summary: applied ? "Updated background polling settings" : "Stored background polling settings without starting a scheduler",
      requestId: request.id,
      metadata: { previous: previous.settings, updated: parsed.data, applied, pollingEnabled: dependencies.pollingEnabled }
    });

    const resolved = await resolvePollingSettings(dependencies.pool);
    return { data: { ...settingsView(resolved, dependencies.pollingEnabled), applied } };
  });
}
