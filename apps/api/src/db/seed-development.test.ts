import { describe, expect, it } from "vitest";
import { buildAlertSeedRecords, buildAuditSeedRecords } from "./seed-development.js";

describe("development seed dataset", () => {
  const now = new Date("2026-11-21T22:00:00.000Z");

  it("builds 50 alerts with a balanced lifecycle and severity distribution", () => {
    const alerts = buildAlertSeedRecords(now);
    expect(alerts).toHaveLength(50);
    expect(alerts.filter(item => item.status === "active")).toHaveLength(20);
    expect(alerts.filter(item => item.status === "acknowledged")).toHaveLength(15);
    expect(alerts.filter(item => item.status === "resolved")).toHaveLength(15);
    expect(alerts.filter(item => item.severity === "critical")).toHaveLength(8);
    expect(alerts.filter(item => item.severity === "warning")).toHaveLength(25);
    expect(alerts.filter(item => item.severity === "info")).toHaveLength(17);
    expect(alerts.every(item => item.lastSeenAt >= item.firstSeenAt)).toBe(true);
  });

  it("builds 100 audit events with varied outcomes and timestamps", () => {
    const events = buildAuditSeedRecords(now);
    expect(events).toHaveLength(100);
    expect(new Set(events.map(item => item.action)).size).toBeGreaterThan(5);
    expect(events.some(item => item.outcome === "success")).toBe(true);
    expect(events.some(item => item.outcome === "failure")).toBe(true);
    expect(events.some(item => item.outcome === "denied")).toBe(true);
    expect(events[0]?.occurredAt.getTime()).toBeLessThan(events[99]!.occurredAt.getTime());
  });
});
