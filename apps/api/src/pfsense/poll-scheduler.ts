import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { appendAudit } from "../audit.js";
import type { DeviceRepository, ManagedDeviceProfile } from "../devices/device-repository.js";
import { deviceUp, pollObserver } from "../metrics.js";
import type { ObservationCache } from "./observation-cache.js";
import type { SiteSnapshot } from "./observations.js";
import { DEFAULT_RETENTION_BATCH_SIZE, prunePollRuns } from "./poll-retention.js";
import { recordPollHealth } from "./poll-health.js";
import { POLLED_OPERATIONS, type PfSenseProvider } from "./provider.js";

/**
 * Background, read-only polling of every enabled firewall.
 *
 * It schedules the same eight-operation `collect()` path the site snapshot route
 * uses, then records health and seeds the observation cache. No endpoint,
 * upstream route, or firewall permission is added: the scheduler only decides
 * *when* the existing collection runs.
 *
 * Design and approved parameters: `docs/BACKGROUND-POLLING-DESIGN.md`, DEC-043.
 */

/** Retry floor per consecutive failure, capped at five minutes. */
export const POLL_RETRY_BACKOFF_MS = [30_000, 60_000, 120_000, 300_000] as const;

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MINIMUM_TIMER_DELAY_MS = 1_000;

export interface PollSchedulerOptions {
  /** Cadence for a healthy device. */
  intervalMs: number;
  /** Devices collected at the same time, fleet-wide. */
  concurrency: number;
  /** Random 0..jitter spread added to each scheduled attempt. */
  jitterMs: number;
  /** Cache lifetime for a scheduled success, normally one interval. */
  successCacheTtlMs: number;
  /** Cache lifetime for a partial or unavailable result. */
  failureCacheTtlMs: number;
  /** Days of `poll_runs` history to keep. */
  retentionDays: number;
  /** Injectable clock, for deterministic tests. */
  now?: () => number;
  /** Injectable randomness, for deterministic tests. */
  random?: () => number;
}

export interface PollSchedulerLogger {
  info(context: Record<string, unknown>, message: string): void;
  warn(context: Record<string, unknown>, message: string): void;
  error(context: Record<string, unknown>, message: string): void;
}

export interface PollSchedulerDependencies {
  provider: Pick<PfSenseProvider, "collect">;
  devices: Pick<DeviceRepository, "listProfiles">;
  cache: Pick<ObservationCache<SiteSnapshot>, "store">;
  pool: Pool;
  log?: PollSchedulerLogger;
  /** Defaults to the shared recorder so poll health cannot diverge. */
  health?: typeof recordPollHealth;
  /** Defaults to the shared bounded prune. */
  prune?: typeof prunePollRuns;
}

export interface PollCycleResult {
  /** Devices collected during this cycle. */
  polled: number;
  /** True when a previous cycle was still running. */
  skipped: boolean;
}

interface DevicePollState {
  nextAttemptAt: number;
  consecutiveFailures: number;
}

function assertRange(name: string, value: number, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
}

/** Error class names only: a message may carry a hostname or upstream detail. */
function errorClassName(error: unknown): string {
  if (error instanceof Error && error.name) return error.name;
  return "unknown_error";
}

export class PollScheduler {
  private readonly options: Required<Pick<PollSchedulerOptions, "now" | "random">> & PollSchedulerOptions;
  private readonly health: typeof recordPollHealth;
  private readonly prune: typeof prunePollRuns;
  private readonly state = new Map<string, DevicePollState>();
  private timer: NodeJS.Timeout | null = null;
  private retentionTimer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = true;

  constructor(
    private readonly dependencies: PollSchedulerDependencies,
    options: PollSchedulerOptions
  ) {
    assertRange("intervalMs", options.intervalMs, 15_000, 3_600_000);
    assertRange("concurrency", options.concurrency, 1, 8);
    assertRange("jitterMs", options.jitterMs, 0, 60_000);
    if (options.jitterMs >= options.intervalMs) throw new Error("jitterMs must be shorter than intervalMs.");
    assertRange("successCacheTtlMs", options.successCacheTtlMs, 0, 600_000);
    assertRange("failureCacheTtlMs", options.failureCacheTtlMs, 0, 60_000);
    assertRange("retentionDays", options.retentionDays, 1, 365);
    this.options = { ...options, now: options.now ?? Date.now, random: options.random ?? Math.random };
    this.health = dependencies.health ?? recordPollHealth;
    this.prune = dependencies.prune ?? prunePollRuns;
  }

  /** True while the scheduler owns timers. */
  get active(): boolean {
    return !this.stopped;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.dependencies.log?.info({
      intervalMs: this.options.intervalMs,
      concurrency: this.options.concurrency,
      jitterMs: this.options.jitterMs,
      retentionDays: this.options.retentionDays
    }, "Background firewall polling started");
    void this.pruneHistory();
    this.retentionTimer = setInterval(() => void this.pruneHistory(), RETENTION_INTERVAL_MS);
    this.retentionTimer.unref?.();
    this.schedule(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.retentionTimer) { clearInterval(this.retentionTimer); this.retentionTimer = null; }
    this.dependencies.log?.info({}, "Background firewall polling stopped");
  }

  /**
   * One scheduling pass: reconcile the device set, poll everything that is due,
   * then let the caller decide when to run again.
   */
  async runCycle(): Promise<PollCycleResult> {
    if (this.running) return { polled: 0, skipped: true };
    this.running = true;
    try {
      const profiles = await this.dependencies.devices.listProfiles();
      const eligible = profiles.filter(profile => profile.enabled && !profile.isDemo);
      this.reconcileState(eligible);
      const now = this.options.now();
      const due = eligible.filter(profile => (this.state.get(profile.id)?.nextAttemptAt ?? now) <= now);
      await this.pollAll(due);
      return { polled: due.length, skipped: false };
    } finally {
      this.running = false;
    }
  }

  /** Bounded prune of expired `poll_runs`; returns the number of rows removed. */
  async pruneHistory(): Promise<number> {
    try {
      const removed = await this.prune(this.dependencies.pool, {
        retentionDays: this.options.retentionDays,
        batchSize: DEFAULT_RETENTION_BATCH_SIZE
      });
      if (removed > 0) {
        await appendAudit(this.dependencies.pool, {
          actorType: "system",
          action: "polling.history_pruned",
          outcome: "success",
          summary: "Pruned firewall poll history older than the retention window",
          metadata: { removedRuns: removed, retentionDays: this.options.retentionDays }
        }).catch(() => undefined);
      }
      return removed;
    } catch (error) {
      this.dependencies.log?.error({ errorClass: errorClassName(error) }, "Unable to prune firewall poll history");
      return 0;
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, Math.max(0, delayMs));
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    try {
      await this.runCycle();
    } catch (error) {
      this.dependencies.log?.error({ errorClass: errorClassName(error) }, "Background firewall poll cycle failed");
    }
    if (!this.stopped) this.schedule(this.nextDelay());
  }

  /** Sleep until the earliest due device, bounded by one healthy interval. */
  private nextDelay(): number {
    if (this.state.size === 0) return this.options.intervalMs;
    let earliest = Number.POSITIVE_INFINITY;
    for (const state of this.state.values()) earliest = Math.min(earliest, state.nextAttemptAt);
    return Math.min(Math.max(earliest - this.options.now(), MINIMUM_TIMER_DELAY_MS), this.options.intervalMs);
  }

  private reconcileState(eligible: ManagedDeviceProfile[]): void {
    const active = new Set(eligible.map(profile => profile.id));
    // Disabled, archived, and demo devices stop being scheduled immediately.
    for (const deviceId of [...this.state.keys()]) {
      if (!active.has(deviceId)) this.state.delete(deviceId);
    }
    const now = this.options.now();
    for (const profile of eligible) {
      if (this.state.has(profile.id)) continue;
      this.state.set(profile.id, { nextAttemptAt: now + this.jitter(), consecutiveFailures: 0 });
    }
  }

  private async pollAll(profiles: ManagedDeviceProfile[]): Promise<void> {
    const queue = [...profiles];
    const workers = Math.min(this.options.concurrency, queue.length);
    await Promise.all(Array.from({ length: workers }, async () => {
      for (let profile = queue.shift(); profile; profile = queue.shift()) {
        await this.pollDevice(profile);
      }
    }));
  }

  /** One device. Every failure is contained here so it cannot stall the fleet. */
  private async pollDevice(profile: ManagedDeviceProfile): Promise<void> {
    try {
      const result = await this.dependencies.provider.collect(profile.id, pollObserver(profile.id));
      if (!result) {
        // Disabled, archived, demo, or missing by the time the poll started.
        this.completeAttempt(profile.id, false);
        return;
      }
      await this.health(this.dependencies.pool, {
        deviceId: profile.id,
        failedOperations: result.failedOperations,
        totalOperations: POLLED_OPERATIONS.length,
        requestId: "poll:" + randomUUID()
      });
      const succeeded = result.snapshot.outcome === "success";
      deviceUp.set({ device_id: profile.id }, succeeded ? 1 : 0);
      this.dependencies.cache.store(
        profile.id,
        result.snapshot,
        succeeded ? this.options.successCacheTtlMs : this.options.failureCacheTtlMs
      );
      this.completeAttempt(profile.id, succeeded);
    } catch (error) {
      this.dependencies.log?.warn({ deviceId: profile.id, errorClass: errorClassName(error) },
        "Background poll of a managed device failed");
      this.completeAttempt(profile.id, false);
    }
  }

  private completeAttempt(deviceId: string, succeeded: boolean): void {
    const state = this.state.get(deviceId);
    if (!state) return;
    if (succeeded) {
      state.consecutiveFailures = 0;
      state.nextAttemptAt = this.options.now() + this.options.intervalMs + this.jitter();
      return;
    }
    state.consecutiveFailures = Math.min(state.consecutiveFailures + 1, POLL_RETRY_BACKOFF_MS.length);
    const step = POLL_RETRY_BACKOFF_MS[Math.min(state.consecutiveFailures - 1, POLL_RETRY_BACKOFF_MS.length - 1)];
    // A failing device is retried with backoff but never more often than a
    // healthy one at the configured interval.
    state.nextAttemptAt = this.options.now() + Math.max(step ?? 300_000, this.options.intervalMs);
  }

  private jitter(): number {
    const { jitterMs } = this.options;
    if (jitterMs <= 0) return 0;
    return Math.min(jitterMs, Math.floor(this.options.random() * (jitterMs + 1)));
  }
}
