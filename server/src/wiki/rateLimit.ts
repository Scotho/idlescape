export interface RateLimiter {
  /** Records a hit for `key` (an opaque string - hash any secret before calling); returns true
   * once that credential has gone past `limit` hits inside the trailing `windowMs`. */
  hit(key: string): boolean;
  /** Number of credentials the limiter currently holds a bucket for. Exposed for tests. */
  size(): number;
}

const SWEEP_EVERY_CALLS = 256;
const SWEEP_AT_SIZE = 1024;

/**
 * A sliding-window rate limiter keyed by an opaque string. Without periodic sweeping, a
 * credential that stops calling would leave its (correctly pruned-to-empty-on-next-hit, but
 * never-actually-hit-again) bucket in the map forever - the map only ever shrinks when the same
 * credential calls back in. Sweeping evicts any credential whose newest timestamp already fell
 * out of the window, so idle credentials get forgotten instead of accumulating.
 */
export function createRateLimiter(opts: { limit: number; windowMs: number; now?: () => number }): RateLimiter {
  const now = opts.now ?? Date.now;
  const hits = new Map<string, number[]>();
  let calls = 0;

  function sweep(nowMs: number): void {
    for (const [key, timestamps] of hits) {
      const newest = timestamps[timestamps.length - 1] ?? -Infinity;
      if (nowMs - newest >= opts.windowMs) hits.delete(key);
    }
  }

  return {
    hit(key: string): boolean {
      const nowMs = now();
      calls += 1;
      if (calls % SWEEP_EVERY_CALLS === 0 || hits.size > SWEEP_AT_SIZE) sweep(nowMs);
      const pruned = (hits.get(key) ?? []).filter(t => nowMs - t < opts.windowMs);
      pruned.push(nowMs);
      hits.set(key, pruned);
      return pruned.length > opts.limit;
    },
    size(): number { return hits.size; }
  };
}
