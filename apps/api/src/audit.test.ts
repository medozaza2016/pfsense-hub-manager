import { describe, expect, it, vi } from "vitest";
import { appendAudit, sanitizeAuditMetadata, upsertAlert } from "./audit.js";

describe("audit metadata safety", () => {
  it("redacts credential-like fields recursively", () => {
    expect(sanitizeAuditMetadata({ username: "operator", apiKey: "abc", nested: { passwordHash: "hash", ok: true } }))
      .toEqual({ username: "operator", apiKey: "[redacted]", nested: { passwordHash: "[redacted]", ok: true } });
  });
  it("bounds depth, arrays, and strings", () => {
    expect(sanitizeAuditMetadata({ values: Array.from({ length: 55 }, (_, i) => i), text: "x".repeat(1100) }))
      .toMatchObject({ values: expect.arrayContaining([0]), text: "x".repeat(1000) });
    expect((sanitizeAuditMetadata({ values: Array.from({ length: 55 }, (_, i) => i) }) as { values: unknown[] }).values).toHaveLength(50);
  });
});

describe("audit and alert persistence", () => {
  it("writes an audit event with sanitized metadata", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    await appendAudit({ query } as never, { action: "user.create", outcome: "success", summary: "Created user", metadata: { password: "do-not-store" } });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[1]?.[9]).toContain("[redacted]");
  });
  it("upserts alerts using the active-alert deduplication constraint", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    await upsertAlert({ query } as never, { deduplicationKey: "device:offline", severity: "critical", title: "Offline", message: "Site unreachable", source: "poller" });
    expect(query.mock.calls[0]?.[0]).toContain("occurrence_count=alerts.occurrence_count+1");
  });
});
