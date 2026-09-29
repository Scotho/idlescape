import { describe, expect, test } from 'bun:test';
import { createRateLimiter } from './rateLimit';

describe('createRateLimiter', () => {
  test('answers true once a credential exceeds the limit within the window', () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => t });
    expect(rl.hit('a')).toBe(false);
    expect(rl.hit('a')).toBe(false);
    expect(rl.hit('a')).toBe(false);
    expect(rl.hit('a')).toBe(true);
  });

  test('forgets a credential once its window has elapsed', () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 120, windowMs: 60_000, now: () => t });
    expect(rl.hit('a')).toBe(false);
    t = 61_000; // a's only timestamp is now outside the window
    expect(rl.hit('a')).toBe(false); // starts a fresh window rather than counting the old hit
  });

  test('sweeps idle credentials out of the map once their window has fully elapsed', () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 120, windowMs: 60_000, now: () => t });
    rl.hit('a'); // credential A calls once at t=0
    expect(rl.size()).toBe(1);
    t = 61_000; // A's entry is now stale
    for (let i = 0; i < 256; i++) rl.hit('b'); // enough B calls to trigger the periodic sweep
    // Only B remains: A's idle bucket was swept out, not just left to prune-on-next-hit forever.
    expect(rl.size()).toBe(1);
  });

  test('sweeps once the map grows past 1024 distinct credentials even without 256 calls', () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 120, windowMs: 60_000, now: () => t });
    for (let i = 0; i < 1025; i++) rl.hit(`stale-${i}`);
    t = 61_000;
    rl.hit('fresh'); // size is already > 1024, so this call's own sweep should fire immediately
    expect(rl.size()).toBe(1);
  });
});
