import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_RETENTION_BATCH_SIZE, prunePollRuns } from "./poll-retention.js";

function fakePool(rowCount: number | null) {
  return { query: vi.fn(async () => ({ rows: [], rowCount })) } as unknown as Pool;
}

describe("prunePollRuns", () => {
  it("deletes only expired rows, in one bounded batch", async () => {
    const pool = fakePool(7);
    const query = pool.query as unknown as ReturnType<typeof vi.fn>;

    await expect(prunePollRuns(pool, { retentionDays: 30 })).resolves.toBe(7);

    expect(query).toHaveBeenCalledOnce();
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("DELETE FROM poll_runs");
    expect(sql).toContain("completed_at < now()");
    expect(sql).toContain("LIMIT $2");
    expect(params).toEqual([30, DEFAULT_RETENTION_BATCH_SIZE]);
  });

  it("honours an explicit batch size", async () => {
    const pool = fakePool(0);
    await prunePollRuns(pool, { retentionDays: 7, batchSize: 250 });
    expect((pool.query as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toEqual([7, 250]);
  });

  it("reports zero when the driver returns no row count", async () => {
    await expect(prunePollRuns(fakePool(null), { retentionDays: 30 })).resolves.toBe(0);
  });

  it("rejects an out-of-range window or batch size", async () => {
    await expect(prunePollRuns(fakePool(0), { retentionDays: 0 })).rejects.toThrow(/retentionDays/);
    await expect(prunePollRuns(fakePool(0), { retentionDays: 366 })).rejects.toThrow(/retentionDays/);
    await expect(prunePollRuns(fakePool(0), { retentionDays: 30, batchSize: 0 })).rejects.toThrow(/batchSize/);
  });
});
