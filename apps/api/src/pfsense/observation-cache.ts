/**
 * Short-lived, in-process cache for read-only firewall observations.
 *
 * It exists so that one navigation pass across several site pages produces a
 * single upstream collection instead of one per page. Nothing is persisted:
 * observations are re-read from the firewall after restart, and a failure is
 * cached only briefly so a recovering firewall is noticed quickly.
 */

export interface ObservationCacheOptions {
  /** Time a successful observation may be reused. */
  successTtlMs: number;
  /** Time a partial or unavailable observation may be reused. */
  failureTtlMs: number;
  /** Hard bound so a long-running process cannot grow without limit. */
  maxEntries: number;
  now?: () => number;
}

export interface CacheLookup<T> {
  value: T;
  cacheHit: boolean;
}

interface CacheEntry<T> {
  expiresAt: number;
  value?: T;
  inflight?: Promise<T>;
}

function assertTtl(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 600_000) {
    throw new Error(`${name} must be an integer between 0 and 600000 milliseconds.`);
  }
}

export class ObservationCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly now: () => number;

  constructor(private readonly options: ObservationCacheOptions) {
    assertTtl("successTtlMs", options.successTtlMs);
    assertTtl("failureTtlMs", options.failureTtlMs);
    if (!Number.isSafeInteger(options.maxEntries) || options.maxEntries < 1 || options.maxEntries > 1024) {
      throw new Error("maxEntries must be an integer between 1 and 1024.");
    }
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.entries.size;
  }

  async get(key: string, load: () => Promise<T>, isFailure: (value: T) => boolean): Promise<CacheLookup<T>> {
    const current = this.entries.get(key);
    if (current?.inflight) return { value: await current.inflight, cacheHit: true };
    if (current && current.value !== undefined && current.expiresAt > this.now()) {
      return { value: current.value, cacheHit: true };
    }
    if (current) this.entries.delete(key);

    let inflight: Promise<T>;
    inflight = load().then(
      value => {
        const ttl = isFailure(value) ? this.options.failureTtlMs : this.options.successTtlMs;
        // An invalidation or eviction during the request wins over this result.
        if (this.entries.get(key)?.inflight === inflight) {
          this.entries.set(key, { expiresAt: this.now() + ttl, value });
        }
        return value;
      },
      error => {
        if (this.entries.get(key)?.inflight === inflight) this.entries.delete(key);
        throw error;
      }
    );
    this.entries.set(key, { expiresAt: 0, inflight });
    this.evictOverflow(key);
    return { value: await inflight, cacheHit: false };
  }

  /** Drops a device's cached observation, for example after disabling it. */
  invalidate(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  private evictOverflow(protectedKey: string): void {
    if (this.entries.size <= this.options.maxEntries) return;
    for (const key of this.entries.keys()) {
      if (key === protectedKey) continue;
      this.entries.delete(key);
      return;
    }
  }
}
