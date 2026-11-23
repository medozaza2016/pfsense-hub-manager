import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceRepository, ManagedDeviceProfile } from "../devices/device-repository.js";
import type { SiteSnapshot } from "./observations.js";
import type { recordPollHealth } from "./poll-health.js";
import type { prunePollRuns } from "./poll-retention.js";
import { POLL_RETRY_BACKOFF_MS, PollScheduler, type PollSchedulerOptions } from "./poll-scheduler.js";
import type { PfSenseProvider } from "./provider.js";

function deviceId(index: number): string {
  return `0000000${index}-0000-4000-8000-000000000000`;
}

function profile(index: number, overrides: Partial<ManagedDeviceProfile> = {}): ManagedDeviceProfile {
  return {
    id: deviceId(index),
    name: `Firewall ${index}`,
    location: null,
    edition: "ce",
    apiBaseUrl: "https://192.168.10.1",
    tlsServername: null,
    enabled: true,
    isDemo: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function snapshot(id: string, outcome: SiteSnapshot["outcome"] = "success"): SiteSnapshot {
  return {
    deviceId: id,
    collectedAt: "2026-11-23T10:00:00.000Z",
    outcome,
    failedOperations: outcome === "success" ? 0 : 8,
    failures: [],
    system: null,
    version: null,
    gateways: [],
    interfaces: [],
    services: [],
    stateSummary: { arpEntries: 0, firewallStates: 0, stateTableCurrent: 0, stateTableLimit: 0 },
    compatibility: {
      declaredEdition: "ce", reportedEdition: "ce", release: null, platform: null,
      apiPackageVersion: null, verdict: "unknown", checkedAt: "2026-11-23T10:00:00.000Z"
    },
    capabilities: []
  };
}

function collection(id: string, outcome: SiteSnapshot["outcome"] = "success") {
  const failedOperations = outcome === "success" ? 0 : outcome === "partial" ? 3 : 8;
  return { snapshot: snapshot(id, outcome), failures: [], failedOperations, durationMs: 5 };
}

let clock = 1_000_000;

type Collect = (id: string, onResult: (group: string) => void) => Promise<ReturnType<typeof collection> | null>;

function setup(options: Partial<PollSchedulerOptions> & {
  profiles?: ManagedDeviceProfile[];
  collect?: Collect;
} = {}) {
  const collect = vi.fn<Collect>(options.collect ?? (async id => collection(id)));
  const health = vi.fn(async (..._args: Parameters<typeof recordPollHealth>) => undefined);
  const prune = vi.fn(async (..._args: Parameters<typeof prunePollRuns>) => 0);
  const cache = { store: vi.fn() };
  const pool = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) };
  const devices = { listProfiles: vi.fn(async () => options.profiles ?? [profile(1)]) };
  const scheduler = new PollScheduler(
    {
      provider: { collect } as unknown as Pick<PfSenseProvider, "collect">,
      devices: devices as unknown as Pick<DeviceRepository, "listProfiles">,
      cache,
      pool: pool as unknown as Pool,
      health: health as unknown as typeof recordPollHealth,
      prune: prune as unknown as typeof prunePollRuns
    },
    {
      intervalMs: 60_000,
      concurrency: 2,
      jitterMs: 0,
      successCacheTtlMs: 60_000,
      failureCacheTtlMs: 2_000,
      retentionDays: 30,
      now: () => clock,
      random: () => 0,
      ...options
    }
  );
  return { scheduler, collect, health, prune, cache, pool, devices };
}

beforeEach(() => { clock = 1_000_000; });

afterEach(() => { vi.useRealTimers(); });

describe("PollScheduler", () => {
  it("polls an enabled device, records shared health, and seeds the cache for one interval", async () => {
    const { scheduler, collect, health, cache } = setup();

    const cycle = await scheduler.runCycle();

    expect(cycle).toEqual({ polled: 1, skipped: false });
    expect(collect).toHaveBeenCalledOnce();
    expect(collect.mock.calls[0]?.[0]).toBe(deviceId(1));
    expect(health).toHaveBeenCalledOnce();
    expect(health.mock.calls[0]?.[1]).toMatchObject({
      deviceId: deviceId(1), failedOperations: 0, totalOperations: 8
    });
    expect(cache.store).toHaveBeenCalledWith(deviceId(1), expect.objectContaining({ outcome: "success" }), 60_000);
  });

  it("never polls a disabled or demo device", async () => {
    const { scheduler, collect, health } = setup({
      profiles: [profile(1, { enabled: false }), profile(2, { isDemo: true }), profile(3)]
    });

    const cycle = await scheduler.runCycle();

    expect(cycle.polled).toBe(1);
    expect(collect).toHaveBeenCalledOnce();
    expect(collect.mock.calls[0]?.[0]).toBe(deviceId(3));
    expect(health).toHaveBeenCalledOnce();
  });

  it("contains a failing device so the rest of the fleet is still polled", async () => {
    const { scheduler, collect, health, cache } = setup({
      concurrency: 1,
      profiles: [profile(1), profile(2), profile(3)],
      collect: async id => {
        if (id === deviceId(2)) throw new Error("upstream exploded at https://192.168.10.1");
        return collection(id);
      }
    });

    const cycle = await scheduler.runCycle();

    expect(cycle.polled).toBe(3);
    expect(collect).toHaveBeenCalledTimes(3);
    expect(health).toHaveBeenCalledTimes(2);
    expect(cache.store).toHaveBeenCalledTimes(2);
  });

  it("collects no more than the configured number of devices at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const { scheduler, collect } = setup({
      concurrency: 2,
      profiles: [profile(1), profile(2), profile(3)],
      collect: id => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        return new Promise(resolve => releases.push(() => {
          inFlight -= 1;
          resolve(collection(id));
        }));
      }
    });

    const tick = () => new Promise(resolve => setTimeout(resolve, 0));
    const pending = scheduler.runCycle();
    await tick();

    // Two devices start; the third waits for a free worker.
    expect(releases).toHaveLength(2);
    expect(peak).toBe(2);

    releases.shift()?.();
    await tick();
    expect(releases).toHaveLength(2);

    releases.shift()?.();
    await tick();
    expect(releases).toHaveLength(1);

    releases.shift()?.();
    await tick();
    const cycle = await pending;

    expect(cycle.polled).toBe(3);
    expect(collect).toHaveBeenCalledTimes(3);
    expect(peak).toBe(2);
  });

  it("treats a device that disappears mid-cycle as a failed attempt", async () => {
    const { scheduler, health, cache } = setup({ collect: async () => null });

    const cycle = await scheduler.runCycle();

    expect(cycle.polled).toBe(1);
    expect(health).not.toHaveBeenCalled();
    expect(cache.store).not.toHaveBeenCalled();
  });

  it("reports a partial collection through the same health path and short cache window", async () => {
    const { scheduler, health, cache } = setup({ collect: async id => collection(id, "partial") });

    await scheduler.runCycle();

    expect(health.mock.calls[0]?.[1]).toMatchObject({ failedOperations: 3, totalOperations: 8 });
    expect(cache.store).toHaveBeenCalledWith(deviceId(1), expect.objectContaining({ outcome: "partial" }), 2_000);
  });

  it("spreads a new device's first poll across the jitter window", async () => {
    const { scheduler, collect } = setup({ jitterMs: 15_000, random: () => 1 });

    expect((await scheduler.runCycle()).polled).toBe(0);
    clock += 14_999;
    expect((await scheduler.runCycle()).polled).toBe(0);
    clock += 1;
    expect((await scheduler.runCycle()).polled).toBe(1);
    expect(collect).toHaveBeenCalledOnce();
  });

  it("waits a full interval after a success", async () => {
    const { scheduler, collect } = setup();

    await scheduler.runCycle();
    clock += 59_999;
    expect((await scheduler.runCycle()).polled).toBe(0);
    clock += 1;
    expect((await scheduler.runCycle()).polled).toBe(1);
    expect(collect).toHaveBeenCalledTimes(2);
  });

  it("backs off a failing device and resets after a success", async () => {
    let healthy = false;
    const { scheduler } = setup({
      intervalMs: 15_000,
      collect: async id => {
        if (!healthy) throw new Error("unreachable");
        return collection(id);
      }
    });

    async function waitUntilDue(): Promise<number> {
      const startedAt = clock;
      while ((await scheduler.runCycle()).polled === 0) {
        clock += 1_000;
        if (clock - startedAt > 10 * 60_000) throw new Error("device never became due");
      }
      return clock - startedAt;
    }

    const delays: number[] = [];
    // The first attempt is due immediately, so it is not a retry delay.
    await scheduler.runCycle();
    for (let attempt = 0; attempt < 5; attempt += 1) delays.push(await waitUntilDue());

    // First failure is retried at the 30 s floor, then 60 s, 120 s, and the
    // five-minute cap. A retry is never more frequent than the interval.
    expect(delays).toEqual([30_000, 60_000, 120_000, 300_000, 300_000]);
    expect(POLL_RETRY_BACKOFF_MS).toEqual([30_000, 60_000, 120_000, 300_000]);

    healthy = true;
    // The outstanding five-minute backoff is honoured; recovery is observed on
    // the next allowed attempt rather than by polling early.
    expect(await waitUntilDue()).toBe(300_000);
    // A success clears the backoff and returns to the configured cadence.
    expect(await waitUntilDue()).toBe(15_000);
  });

  it("rejects an incoherent or out-of-range configuration", () => {
    expect(() => setup({ jitterMs: 60_000, intervalMs: 60_000 })).toThrow(/jitterMs/);
    expect(() => setup({ concurrency: 0 })).toThrow(/concurrency/);
    expect(() => setup({ retentionDays: 0 })).toThrow(/retentionDays/);
    expect(() => setup({ successCacheTtlMs: 700_000 })).toThrow(/successCacheTtlMs/);
  });

  it("skips a cycle while the previous one is still running", async () => {
    let release: (value: ReturnType<typeof collection>) => void = () => undefined;
    const { scheduler } = setup({
      collect: () => new Promise(resolve => { release = resolve; })
    });

    const first = scheduler.runCycle();
    await expect(scheduler.runCycle()).resolves.toEqual({ polled: 0, skipped: true });

    release(collection(deviceId(1)));
    await expect(first).resolves.toEqual({ polled: 1, skipped: false });
  });

  it("prunes expired history with the configured window and audits only real deletions", async () => {
    const { scheduler, prune, pool } = setup();

    prune.mockResolvedValueOnce(0);
    await expect(scheduler.pruneHistory()).resolves.toBe(0);
    expect(prune).toHaveBeenCalledWith(pool, { retentionDays: 30, batchSize: 5_000 });
    expect(pool.query).not.toHaveBeenCalled();

    prune.mockResolvedValueOnce(3);
    await expect(scheduler.pruneHistory()).resolves.toBe(3);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO audit_events"),
      expect.arrayContaining(["polling.history_pruned"])
    );
  });

  it("keeps polling alive when history pruning fails", async () => {
    const { scheduler, prune } = setup();
    prune.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(scheduler.pruneHistory()).resolves.toBe(0);
  });

  it("polls on its own timer after start and stops cleanly", async () => {
    vi.useFakeTimers();
    const { scheduler, collect, prune } = setup({ now: Date.now });

    scheduler.start();
    expect(scheduler.active).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(prune).toHaveBeenCalledOnce();
    expect(collect).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(collect).toHaveBeenCalledTimes(2);

    scheduler.stop();
    expect(scheduler.active).toBe(false);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(collect).toHaveBeenCalledTimes(2);
  });
});

