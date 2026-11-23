import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObservationCache } from "./observation-cache.js";

function makeCache(overrides: Partial<{ successTtlMs: number; failureTtlMs: number; maxEntries: number; now: () => number }> = {}) {
  return new ObservationCache<string>({
    successTtlMs: 10_000,
    failureTtlMs: 2_000,
    maxEntries: 8,
    now: () => clock,
    ...overrides
  });
}

let clock = 1_000;

beforeEach(() => { clock = 1_000; });

describe("ObservationCache", () => {
  it("reuses a success for the success TTL only", async () => {
    const cache = makeCache();
    const load = vi.fn(async () => "fresh");

    expect(await cache.get("a", load, () => false)).toEqual({ value: "fresh", cacheHit: false });
    clock += 9_999;
    expect(await cache.get("a", load, () => false)).toEqual({ value: "fresh", cacheHit: true });
    clock += 2;
    expect(await cache.get("a", load, () => false)).toEqual({ value: "fresh", cacheHit: false });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("reuses a failure for the shorter failure TTL", async () => {
    const cache = makeCache();
    const load = vi.fn(async () => "partial");

    await cache.get("a", load, value => value === "partial");
    clock += 2_001;
    await cache.get("a", load, value => value === "partial");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("collapses concurrent misses into one loader call", async () => {
    const cache = makeCache();
    let release: (value: string) => void = () => undefined;
    const load = vi.fn(() => new Promise<string>(resolve => { release = resolve; }));

    const first = cache.get("a", load, () => false);
    const second = cache.get("a", load, () => false);
    release("fresh");

    await expect(first).resolves.toEqual({ value: "fresh", cacheHit: false });
    await expect(second).resolves.toEqual({ value: "fresh", cacheHit: true });
    expect(load).toHaveBeenCalledOnce();
  });

  it("does not cache a loader rejection", async () => {
    const cache = makeCache();
    const load = vi.fn(async () => { throw new Error("upstream down"); });

    await expect(cache.get("a", load, () => false)).rejects.toThrow("upstream down");
    expect(cache.size).toBe(0);
    await expect(cache.get("a", load, () => false)).rejects.toThrow("upstream down");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("bounds entries and evicts the oldest key", async () => {
    const cache = makeCache({ maxEntries: 2 });
    await cache.get("a", async () => "a", () => false);
    await cache.get("b", async () => "b", () => false);
    await cache.get("c", async () => "c", () => false);

    expect(cache.size).toBe(2);
    const load = vi.fn(async () => "a");
    expect(await cache.get("a", load, () => false)).toEqual({ value: "a", cacheHit: false });
  });

  it("invalidates one key without disturbing others", async () => {
    const cache = makeCache();
    const loadA = vi.fn(async () => "a");
    const loadB = vi.fn(async () => "b");
    await cache.get("a", loadA, () => false);
    await cache.get("b", loadB, () => false);

    cache.invalidate("a");
    await cache.get("a", loadA, () => false);
    await cache.get("b", loadB, () => false);
    expect(loadA).toHaveBeenCalledTimes(2);
    expect(loadB).toHaveBeenCalledOnce();
  });

  it("rejects invalid configuration", () => {
    expect(() => makeCache({ successTtlMs: -1 })).toThrow();
    expect(() => makeCache({ maxEntries: 0 })).toThrow();
  });
});
