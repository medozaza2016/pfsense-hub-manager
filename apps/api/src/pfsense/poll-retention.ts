import type { Pool } from "pg";

/**
 * Bounded retention for the read-only poll history.
 *
 * `poll_runs` is the evidence behind capability state and connection history, so
 * it is kept for a configurable window and pruned in small batches instead of
 * truncating a large table in one statement. Deletion is scoped to rows older
 * than the window; an active alert is a separate table and is never touched.
 */
export interface PollRetentionOptions {
  /** Days of history to keep. Must be an integer between 1 and 365. */
  retentionDays: number;
  /** Maximum rows removed per statement, so a prune cannot lock the table. */
  batchSize?: number;
}

export const DEFAULT_RETENTION_BATCH_SIZE = 5_000;

export async function prunePollRuns(pool: Pool, options: PollRetentionOptions): Promise<number> {
  const { retentionDays } = options;
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
    throw new Error("retentionDays must be an integer between 1 and 365.");
  }
  const batchSize = options.batchSize ?? DEFAULT_RETENTION_BATCH_SIZE;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100_000) {
    throw new Error("batchSize must be an integer between 1 and 100000.");
  }
  const result = await pool.query(
    `DELETE FROM poll_runs
      WHERE id IN (
        SELECT id FROM poll_runs
         WHERE completed_at < now() - ($1::integer * interval '1 day')
         ORDER BY completed_at
         LIMIT $2
      )`,
    [retentionDays, batchSize]
  );
  return result.rowCount ?? 0;
}
