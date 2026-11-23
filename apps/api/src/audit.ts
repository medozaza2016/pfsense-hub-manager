import type pg from "pg";

const SECRET_KEY = /(password|passwd|secret|token|cookie|authorization|api.?key|private.?key|salt|hash|credential)/i;

export type AuditOutcome = "success" | "failure" | "denied";
export interface AuditEvent {
  actorId?: string | null;
  actorUsername?: string | null;
  actorType?: "user" | "system" | "anonymous";
  action: string;
  outcome: AuditOutcome;
  targetType?: string | null;
  targetId?: string | null;
  summary: string;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}

export function sanitizeAuditMetadata(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 50).map(item => sanitizeAuditMetadata(item, depth + 1));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      output[key] = SECRET_KEY.test(key) ? "[redacted]" : sanitizeAuditMetadata(item, depth + 1);
    }
    return output;
  }
  if (typeof value === "string") return value.slice(0, 1000);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return String(value).slice(0, 100);
}

/** `PoolClient` is accepted so an audit event can commit with its subject in one transaction. */
export async function appendAudit(pool: pg.Pool | pg.PoolClient, event: AuditEvent): Promise<void> {
  const metadata = sanitizeAuditMetadata(event.metadata ?? {});
  await pool.query(
    `INSERT INTO audit_events(actor_id,actor_username,actor_type,action,outcome,target_type,target_id,summary,request_id,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    [event.actorId ?? null, event.actorUsername ?? null, event.actorType ?? (event.actorId ? "user" : "system"),
      event.action, event.outcome, event.targetType ?? null, event.targetId ?? null,
      event.summary.slice(0, 500), event.requestId ?? null, JSON.stringify(metadata)]
  );
}

export interface AlertInput {
  deduplicationKey: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  source: string;
  resourceType?: string;
  resourceId?: string;
}
export async function upsertAlert(pool: pg.Pool, alert: AlertInput): Promise<void> {
  await pool.query(
    `INSERT INTO alerts(deduplication_key,severity,title,message,source,resource_type,resource_id)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (deduplication_key) WHERE status IN ('active','acknowledged')
     DO UPDATE SET severity=EXCLUDED.severity,title=EXCLUDED.title,message=EXCLUDED.message,
       last_seen_at=now(),occurrence_count=alerts.occurrence_count+1`,
    [alert.deduplicationKey, alert.severity, alert.title.slice(0, 200), alert.message.slice(0, 1000),
      alert.source.slice(0, 100), alert.resourceType ?? null, alert.resourceId ?? null]
  );
}
