import type pg from "pg";
import { appendAudit } from "../audit.js";
import type { AdminUser } from "../auth.js";
import type { AppConfig } from "../config.js";
import {
  HOST_AGENT_PROTOCOL_VERSION,
  HOST_OPERATION_ACTIONS,
  HOST_OPERATION_TARGETS,
  requiresStackStopConfirmation,
  type ComposeValidationResult,
  type HostService,
  type LogsResult,
  type OperationAction,
  type OperationRecord,
  type OperationResult,
  type OperationState,
  type OperationSubmission,
  type OperationTarget,
  type SystemStatusView
} from "./protocol.js";
import {
  requestHostComposeValidation,
  requestHostOperation,
  requestHostOperationResult,
  requestHostServiceLogs,
  requestHostSystemStatus
} from "./client.js";

export interface HostSystemOptions {
  socketPath: string | null;
  monitoringEnabled: boolean;
  operationsEnabled: boolean;
  statusCacheMs?: number;
  /** A journaled operation older than this is reported as `unknown`. */
  operationTimeoutMs?: number;
}

const DEFAULT_STATUS_CACHE_MS = 3_000;
const DEFAULT_OPERATION_TIMEOUT_MS = 180_000;
const RECENT_OPERATION_LIMIT = 5;
const ACTIVE_OPERATION_LIMIT = 5;
const OPERATION_HISTORY_LIMIT = 50;
const OPERATION_STATES: readonly OperationState[] = ["requested", "running", "succeeded", "failed", "unknown"];

/** Column list with camelCase aliases so rows map onto `OperationRecord` directly. */
const OPERATION_COLUMNS = `id, action, target, state,
  requested_at AS "requestedAt",
  completed_at AS "completedAt",
  verified_at AS "verifiedAt",
  safe_error_code AS "safeErrorCode",
  actor_username AS "requestedBy"`;

interface OperationRow {
  id: string;
  action: string;
  target: string;
  state: string;
  requestedAt: Date | string;
  completedAt: Date | string | null;
  verifiedAt: Date | string | null;
  safeErrorCode: string | null;
  requestedBy: string | null;
}

function isoOrNull(value: Date | string | null): string | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Persisted rows are still validated: an unknown enum value means the journal
 * was written by a different version, and reporting it as a plausible operation
 * would misstate what the manager did.
 */
function toOperationRecord(row: OperationRow): OperationRecord | null {
  const action = (HOST_OPERATION_ACTIONS as readonly string[]).includes(row.action)
    ? row.action as OperationAction
    : null;
  const target = (HOST_OPERATION_TARGETS as readonly string[]).includes(row.target)
    ? row.target as OperationTarget
    : null;
  const state = OPERATION_STATES.includes(row.state as OperationState) ? row.state as OperationState : null;
  const requestedAt = isoOrNull(row.requestedAt);
  if (!action || !target || !state || !requestedAt) return null;
  return {
    id: row.id,
    action,
    target,
    state,
    requestedAt,
    completedAt: isoOrNull(row.completedAt),
    verifiedAt: isoOrNull(row.verifiedAt),
    safeErrorCode: row.safeErrorCode,
    requestedBy: row.requestedBy
  };
}

function auditOutcome(state: OperationState): "success" | "failure" {
  return state === "succeeded" ? "success" : "failure";
}

/** Only a stable upper-case code is journaled; agent or driver text is dropped. */
function safeFailureCode(error: unknown): string {
  return error instanceof Error && /^[A-Z][A-Z0-9_]{1,63}$/.test(error.message)
    ? error.message
    : "HOST_AGENT_FAILURE";
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}

/**
 * Translate an operation-level failure into the code the route layer reports.
 * A version mismatch gets its own code because the operator action differs from
 * a transient failure: agent and API must be upgraded together.
 */
function hostFailure(errorCode: string): Error {
  return new Error(errorCode === "PROTOCOL_VERSION_UNSUPPORTED" ? "HOST_AGENT_PROTOCOL_MISMATCH" : errorCode);
}

/**
 * Read-only Host Agent facade.
 *
 * Gates are evaluated on every call, not at construction time, so an operator
 * can disable monitoring without restarting the API and a disabled feature can
 * never be reached through a cached response. Failures propagate as stable
 * upper-case codes that the route layer maps to fixed HTTP responses; agent
 * text never reaches a caller.
 */
export class HostSystemService {
  private readonly socketPath: string | null;
  private readonly monitoringEnabled: boolean;
  private readonly operationsEnabled: boolean;
  private readonly statusCacheMs: number;
  private readonly operationTimeoutMs: number;
  private statusCache: { at: number; view: SystemStatusView } | null = null;
  private statusInFlight: Promise<SystemStatusView> | null = null;
  private reconcileInFlight: Promise<void> | null = null;

  constructor(options: HostSystemOptions) {
    this.socketPath = options.socketPath;
    this.monitoringEnabled = options.monitoringEnabled;
    this.operationsEnabled = options.operationsEnabled;
    this.statusCacheMs = options.statusCacheMs ?? DEFAULT_STATUS_CACHE_MS;
    this.operationTimeoutMs = options.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
  }

  private requireSocket(): string {
    if (!this.monitoringEnabled) throw new Error("HOST_MONITORING_DISABLED");
    if (!this.socketPath) throw new Error("HOST_AGENT_NOT_CONFIGURED");
    return this.socketPath;
  }

  /**
   * Current host and service state, shared by every viewer for a few seconds so
   * a full dashboard of clients produces one agent exchange per window.
   */
  async status(pool: pg.Pool): Promise<SystemStatusView> {
    const socketPath = this.requireSocket();
    const cached = this.statusCache;
    if (cached && Date.now() - cached.at < this.statusCacheMs) return cached.view;
    if (this.statusInFlight) return this.statusInFlight;

    const pending = this.collectStatus(socketPath, pool).then(view => {
      this.statusCache = { at: Date.now(), view };
      return view;
    }).finally(() => {
      if (this.statusInFlight === pending) this.statusInFlight = null;
    });
    this.statusInFlight = pending;
    return pending;
  }

  private async collectStatus(socketPath: string, pool: pg.Pool): Promise<SystemStatusView> {
    const result = await requestHostSystemStatus(socketPath);
    if (result.state === "error") throw hostFailure(result.errorCode);
    if (!this.operationsEnabled) {
      return {
        host: result.host,
        collectedAt: result.collectedAt,
        services: result.services,
        agent: { reachable: true, protocolVersion: HOST_AGENT_PROTOCOL_VERSION },
        operationsEnabled: false,
        recentOperations: []
      };
    }
    // Progress is settled in the background: an agent that accepts a status read
    // but stalls on a result read must never delay the dashboard, and the journal
    // is authoritative for the next poll either way.
    this.scheduleReconcile(pool);
    const recentOperations = await this.recentOperations(pool).catch(() => [] as OperationRecord[]);
    return {
      host: result.host,
      collectedAt: result.collectedAt,
      services: result.services,
      agent: { reachable: true, protocolVersion: HOST_AGENT_PROTOCOL_VERSION },
      operationsEnabled: true,
      recentOperations
    };
  }

  async logs(service: HostService, lines: number): Promise<LogsResult> {
    const socketPath = this.requireSocket();
    const result = await requestHostServiceLogs(socketPath, service, lines);
    if (result.state === "error") throw hostFailure(result.errorCode);
    return result;
  }

  async validateCompose(): Promise<ComposeValidationResult> {
    if (!this.operationsEnabled) throw new Error("HOST_OPERATIONS_DISABLED");
    const socketPath = this.requireSocket();
    const result = await requestHostComposeValidation(socketPath);
    if (result.state === "error") throw hostFailure(result.errorCode);
    return result;
  }

  /** Newest journal entries for the dashboard. Malformed rows are dropped. */
  async recentOperations(pool: pg.Pool): Promise<OperationRecord[]> {
    return this.listOperations(pool, RECENT_OPERATION_LIMIT);
  }

  async listOperations(pool: pg.Pool, limit: number = OPERATION_HISTORY_LIMIT): Promise<OperationRecord[]> {
    if (!this.operationsEnabled) throw new Error("HOST_OPERATIONS_DISABLED");
    const bounded = Math.min(Math.max(Math.trunc(limit), 1), OPERATION_HISTORY_LIMIT);
    const { rows } = await pool.query<OperationRow>(
      `SELECT ${OPERATION_COLUMNS} FROM host_operations ORDER BY requested_at DESC LIMIT $1`,
      [bounded]
    );
    return rows.map(toOperationRecord).filter((record): record is OperationRecord => record !== null);
  }

  async operation(pool: pg.Pool, operationId: string): Promise<OperationRecord> {
    if (!this.operationsEnabled) throw new Error("HOST_OPERATIONS_DISABLED");
    const { rows } = await pool.query<OperationRow>(
      `SELECT ${OPERATION_COLUMNS} FROM host_operations WHERE id = $1`,
      [operationId]
    );
    const record = rows.length === 1 ? toOperationRecord(rows[0] as OperationRow) : null;
    if (!record) throw new Error("HOST_OPERATION_NOT_FOUND");
    return record;
  }

  /**
   * Journal and dispatch one administrator-requested operation.
   *
   * The journal row and its audit event commit together before the agent is
   * contacted, so a crash between the two leaves evidence rather than an
   * untracked restart. Dispatch itself is detached: the caller receives the
   * journaled record and polls its state.
   */
  async requestOperation(
    pool: pg.Pool,
    actor: AdminUser,
    submission: OperationSubmission,
    requestId: string
  ): Promise<OperationRecord> {
    if (!this.operationsEnabled) throw new Error("HOST_OPERATIONS_DISABLED");
    const socketPath = this.requireSocket();
    if (requiresStackStopConfirmation(submission) && submission.confirmStackStop !== true) {
      throw new Error("HOST_OPERATION_CONFIRMATION_REQUIRED");
    }

    const client = await pool.connect();
    let record: OperationRecord;
    try {
      await client.query("BEGIN");
      const inserted = await client.query<OperationRow>(
        `INSERT INTO host_operations (actor_id, actor_username, action, target, state, request_id)
         VALUES ($1, $2, $3, $4, 'requested', $5)
         RETURNING ${OPERATION_COLUMNS}`,
        [actor.id, actor.username, submission.action, submission.target, requestId]
      );
      const created = inserted.rows.length === 1 ? toOperationRecord(inserted.rows[0] as OperationRow) : null;
      if (!created) throw new Error("HOST_OPERATION_JOURNAL_INVALID");
      record = created;
      await appendAudit(client, {
        actorId: actor.id,
        actorUsername: actor.username,
        action: "system.operation.request",
        outcome: "success",
        targetType: "host_operation",
        targetId: created.id,
        summary: `Requested host ${created.action} of ${created.target}`,
        requestId,
        metadata: { action: created.action, target: created.target, stackStopConfirmed: submission.confirmStackStop === true }
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (isUniqueViolation(error)) throw new Error("HOST_OPERATION_IN_PROGRESS");
      throw error;
    } finally {
      client.release();
    }

    this.dispatch(pool, record, socketPath);
    return record;
  }

  /**
   * Settle journaled operations from the agent's own result journal. Called on
   * boot and after status reads. An unreachable agent leaves the row untouched:
   * a transient failure must not invent an outcome, so only the timeout does.
   */
  async reconcile(pool: pg.Pool): Promise<void> {
    if (!this.operationsEnabled) return;
    let socketPath: string;
    try {
      socketPath = this.requireSocket();
    } catch {
      return;
    }
    const { rows } = await pool.query<OperationRow>(
      `SELECT ${OPERATION_COLUMNS} FROM host_operations
        WHERE state IN ('requested', 'running')
        ORDER BY requested_at ASC
        LIMIT $1`,
      [ACTIVE_OPERATION_LIMIT]
    );
    for (const row of rows) {
      const record = toOperationRecord(row);
      if (!record) continue;
      const ageMs = Date.now() - Date.parse(record.requestedAt);
      if (!Number.isFinite(ageMs) || ageMs > this.operationTimeoutMs) {
        await this.finish(pool, record, "unknown", "OPERATION_TIMEOUT", null);
        continue;
      }
      let result: OperationResult;
      try {
        result = await requestHostOperationResult(socketPath, record.id);
      } catch {
        continue;
      }
      if (result.state === "error") {
        // The agent has no journal entry for this id, so the outcome cannot be
        // confirmed: settle as unknown with the agent's own code rather than
        // leaving the row pending until the timeout.
        await this.finish(pool, record, "unknown", result.errorCode, null);
        continue;
      }
      if (result.state !== "completed") continue;
      await this.finish(pool, record, result.result, result.errorCode, result.verified ? result.finishedAt : null);
    }
  }

  private dispatch(pool: pg.Pool, record: OperationRecord, socketPath: string): void {
    void this.runDispatch(pool, record, socketPath);
  }

  private async runDispatch(pool: pg.Pool, record: OperationRecord, socketPath: string): Promise<void> {
    try {
      const outcome = await requestHostOperation(socketPath, {
        operationId: record.id,
        action: record.action,
        target: record.target
      });
      if (outcome.state !== "accepted") {
        await this.finish(pool, record, "failed", outcome.errorCode, null);
        return;
      }
      await pool.query(
        `UPDATE host_operations SET state = 'running', updated_at = now()
          WHERE id = $1 AND state = 'requested'`,
        [record.id]
      );
    } catch (error) {
      // The agent never acknowledged, so no work started. Recording the failure
      // immediately is more accurate than waiting for the reconcile timeout.
      await this.finish(pool, record, "failed", safeFailureCode(error), null).catch(() => undefined);
    }
  }

  private scheduleReconcile(pool: pg.Pool): void {
    if (this.reconcileInFlight) return;
    const pending = this.reconcile(pool).catch(() => undefined).finally(() => {
      if (this.reconcileInFlight === pending) this.reconcileInFlight = null;
    });
    this.reconcileInFlight = pending;
  }

  private async finish(
    pool: pg.Pool,
    record: Pick<OperationRecord, "id" | "action" | "target" | "requestedBy">,
    state: Exclude<OperationState, "requested" | "running">,
    errorCode: string | null,
    verifiedAt: string | null
  ): Promise<void> {
    const safeCode = errorCode !== null && /^[A-Z][A-Z0-9_]{1,63}$/.test(errorCode) ? errorCode : null;
    const { rowCount } = await pool.query(
      `UPDATE host_operations
          SET state = $2, safe_error_code = $3, verified_at = $4, completed_at = now(), updated_at = now()
        WHERE id = $1 AND state IN ('requested', 'running')`,
      [record.id, state, safeCode, verifiedAt]
    );
    // A concurrent settle already recorded the outcome and its audit event.
    if (!rowCount) return;
    await appendAudit(pool, {
      actorUsername: record.requestedBy ?? null,
      actorType: "system",
      action: "system.operation.complete",
      outcome: auditOutcome(state),
      targetType: "host_operation",
      targetId: record.id,
      summary: `Host ${record.action} of ${record.target} reported ${state}`,
      metadata: { action: record.action, target: record.target, state, errorCode: safeCode, verified: verifiedAt !== null }
    });
  }
}

export function createHostSystemService(config: AppConfig): HostSystemService {
  return new HostSystemService({
    socketPath: config.HUB_DEPLOYMENT_AGENT_SOCKET ? config.HUB_DEPLOYMENT_AGENT_SOCKET : null,
    monitoringEnabled: config.HUB_HOST_MONITORING_ENABLED,
    operationsEnabled: config.HUB_HOST_OPERATIONS_ENABLED,
    operationTimeoutMs: config.HUB_HOST_OPERATION_TIMEOUT_MS
  });
}
