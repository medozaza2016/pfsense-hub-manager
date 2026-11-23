import type { Pool } from "pg";
import { appendAudit, upsertAlert } from "../audit.js";

/**
 * One place that decides how a collection outcome becomes an operational alert,
 * shared by the site snapshot and the legacy site overview route.
 */
export async function recordPollHealth(pool: Pool, input: {
  deviceId: string;
  failedOperations: number;
  totalOperations: number;
  requestId: string;
}): Promise<void> {
  const { deviceId, failedOperations, totalOperations, requestId } = input;
  if (failedOperations > 0) {
    const allFailed = failedOperations === totalOperations;
    await upsertAlert(pool, {
      deduplicationKey: "device-poll:" + deviceId,
      severity: allFailed ? "critical" : "warning",
      title: allFailed ? "Firewall is unreachable" : "Firewall polling is degraded",
      message: `${failedOperations} of ${totalOperations} read-only status operations failed. Review the integration and network path.`,
      source: "pfSense integration",
      resourceType: "device",
      resourceId: deviceId
    });
    return;
  }
  const resolved = await pool.query(
    `UPDATE alerts SET status='resolved',resolved_at=now(),last_seen_at=now()
      WHERE deduplication_key='device-poll:' || $1 AND status IN ('active','acknowledged') RETURNING id`,
    [deviceId]
  );
  if (resolved.rowCount) {
    await appendAudit(pool, {
      actorType: "system",
      action: "alert.auto_resolve",
      outcome: "success",
      targetType: "device",
      targetId: deviceId,
      summary: "Automatically resolved recovered firewall polling alert",
      metadata: { resolvedCount: resolved.rowCount },
      requestId
    });
  }
}
