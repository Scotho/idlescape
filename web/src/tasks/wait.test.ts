// The wait family, driven over a fake clock and a fake state stream. There is no DOM in any of
// it: `createWait` is five dependencies and a promise, which is the whole point of lifting it
// out of `workerContext.ts`.
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { createWait } from './wait';
import type { WorldState } from '../agent/types';

function harness(initial: Partial<WorldState> = {}) {
  let s = initial as WorldState;
  const subs = new Set<(w: WorldState) => void>();
  const ticks = new Set<() => void>();
  const warns: string[] = [];
  const ctl = new AbortController();
  const wait = createWait({
    state: () => s,
    onState: cb => { subs.add(cb); return () => { subs.delete(cb); }; },
    onTick: cb => { ticks.add(cb); return () => { ticks.delete(cb); }; },
    signal: () => ctl.signal,
    log: t => { warns.push(t); }
  });
  return {
    wait, warns, ctl, subs, ticks,
    push(next: Partial<WorldState>) {
      s = { ...s, ...next } as WorldState;
      for (const cb of [...subs]) cb(s);
    },
    tick() { for (const cb of [...ticks]) cb(); }
  };
}

const animating = (animId: number): Partial<WorldState> => ({ player: { animId } } as Partial<WorldState>);
const hurt = (hp: number, maxHp: number): Partial<WorldState> => ({ player: { hp, maxHp } } as Partial<WorldState>);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('wait.until with resetWhen', () => {
  test('re-arms the timeout while the second signal keeps firing', async () => {
    const h = harness(animating(1));
    const p = h.wait.until(s => s.player?.animId === -1, {
      timeoutMs: 1_000, label: 'chop', resetWhen: s => s.player?.animId === 1
    });
    await vi.advanceTimersByTimeAsync(900);
    h.push(animating(1));                              // re-arms
    await vi.advanceTimersByTimeAsync(900);
    h.push(animating(-1));
    await expect(p).resolves.toBe(true);
    expect(h.warns).toEqual([]);
  });

  test('without resetWhen the same sequence times out', async () => {
    const h = harness(animating(1));
    const p = h.wait.until(s => s.player?.animId === -1, { timeoutMs: 1_000, label: 'chop' });
    await vi.advanceTimersByTimeAsync(900);
    h.push(animating(1));
    await vi.advanceTimersByTimeAsync(900);
    await expect(p).resolves.toBe(false);
    expect(h.warns).toEqual(['wait chop timed out after 1000ms']);
  });

  test('the always-true footgun: it never times out, and that is documented rather than fixed', async () => {
    const h = harness(animating(1));
    const p = h.wait.until(() => false, { timeoutMs: 1_000, label: 'never', resetWhen: () => true });
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(900);
      h.push({});
    }
    expect(h.warns).toEqual([]);
    h.ctl.abort();                                     // only the abort ends it
    await expect(p).resolves.toBe(false);
  });

  test('a resetWhen that throws is caught like any other script predicate', async () => {
    const h = harness(animating(1));
    const p = h.wait.until(s => s.player?.animId === -1, {
      timeoutMs: 1_000, label: 'thrower', resetWhen: () => { throw new Error('boom'); }
    });
    h.push(animating(1));
    await vi.advanceTimersByTimeAsync(1_100);
    await expect(p).resolves.toBe(false);
    expect(h.warns).toEqual(['wait thrower timed out after 1000ms']);
  });
});

describe('the new family members', () => {
  test('animation baselines at call time and resolves when the id changes', async () => {
    const h = harness(animating(7));
    let settled = false;
    const p = h.wait.animation({ timeoutMs: 5_000, label: 'swing' });
    void p.then(() => { settled = true; });
    h.push(animating(7));                              // unchanged, still waiting
    await Promise.resolve();
    expect(settled).toBe(false);
    h.push(animating(9));
    await expect(p).resolves.toBe(true);
  });

  test('animation with an id waits for that id specifically', async () => {
    const h = harness(animating(-1));
    const p = h.wait.animation({ id: 879, timeoutMs: 5_000 });
    h.push(animating(4));
    h.push(animating(879));
    await expect(p).resolves.toBe(true);
  });

  test('animation takes no bag at all, and labels itself', async () => {
    const h = harness(animating(7));
    const p = h.wait.animation();
    await vi.advanceTimersByTimeAsync(20_100);         // DEFAULT_WAIT_MS
    await expect(p).resolves.toBe(false);
    expect(h.warns).toEqual(['wait animation timed out after 20000ms']);
  });

  test('hp takes a required bag and reads percent of the maximum', async () => {
    const h = harness(hurt(30, 100));
    const p = h.wait.hp({ belowPercent: 20, timeoutMs: 5_000, label: 'hurt' });
    h.push(hurt(25, 100));
    h.push(hurt(19, 100));
    await expect(p).resolves.toBe(true);
  });

  test('hp reads a percentage, not a count: 19 of 40 is not below 20 percent', async () => {
    const h = harness(hurt(30, 40));
    const p = h.wait.hp({ belowPercent: 20, timeoutMs: 5_000, label: 'hurt' });
    h.push(hurt(19, 40));                              // 47.5 percent
    await vi.advanceTimersByTimeAsync(5_100);
    await expect(p).resolves.toBe(false);
  });

  test('hp abovePercent resolves when the player heals past the threshold, not at it', async () => {
    const h = harness(hurt(10, 100));
    let settled = false;
    const p = h.wait.hp({ abovePercent: 50, timeoutMs: 5_000, label: 'healed' });
    void p.then(() => { settled = true; });
    h.push(hurt(50, 100));                             // exactly 50, and "above" is strict
    await Promise.resolve();
    expect(settled).toBe(false);
    h.push(hurt(51, 100));
    await expect(p).resolves.toBe(true);
  });

  test('hp never matches while the world has published no hitpoints', async () => {
    const h = harness({});
    const p = h.wait.hp({ belowPercent: 99, timeoutMs: 1_000, label: 'blind' });
    h.push({ player: { hp: 5 } } as Partial<WorldState>);             // no maximum yet
    h.push({ player: { hp: 5, maxHp: 0 } } as Partial<WorldState>);   // a world still publishing
    await vi.advanceTimersByTimeAsync(1_100);
    await expect(p).resolves.toBe(false);
    expect(h.warns).toEqual(['wait blind timed out after 1000ms']);
  });

  test('a timeout writes one labelled warn line and resolves false', async () => {
    const h = harness(hurt(100, 100));
    const p = h.wait.hp({ belowPercent: 20, timeoutMs: 1_000, label: 'hurt' });
    await vi.advanceTimersByTimeAsync(1_100);
    await expect(p).resolves.toBe(false);
    expect(h.warns).toEqual(['wait hurt timed out after 1000ms']);
  });

  test("a caller's own signal ends the wait without ending the task", async () => {
    const h = harness({});
    const own = new AbortController();
    const p = h.wait.until(() => false, { timeoutMs: 60_000, label: 'own', signal: own.signal });
    own.abort();
    await expect(p).resolves.toBe(false);
    expect(h.ctl.signal.aborted).toBe(false);
    expect(h.warns).toEqual([]);
  });

  test("a caller's signal that is already aborted resolves false at once", async () => {
    const h = harness({});
    const own = new AbortController();
    own.abort();
    await expect(h.wait.until(() => false, { timeoutMs: 60_000, signal: own.signal })).resolves.toBe(false);
    expect(h.subs.size).toBe(0);
  });

  test('ticks resolves true when it counted, false when the run was stopped (R6)', async () => {
    const h = harness({});
    const counted = h.wait.ticks(2);
    h.tick(); h.tick();
    await expect(counted).resolves.toBe(true);
    const stopped = h.wait.ticks(5);
    h.ctl.abort();
    await expect(stopped).resolves.toBe(false);
  });

  test('ticks of zero or fewer resolves true without subscribing', async () => {
    const h = harness({});
    await expect(h.wait.ticks(0)).resolves.toBe(true);
    expect(h.ticks.size).toBe(0);
  });
});

describe('teardown', () => {
  test('every settled wait releases its own subscription', async () => {
    const h = harness(animating(1));
    const resolved = h.wait.until(s => s.player?.animId === 2, { timeoutMs: 5_000 });
    const timedOut = h.wait.until(() => false, { timeoutMs: 1_000, label: 'gone' });
    const aborted = h.wait.until(() => false, { timeoutMs: 60_000 });
    expect(h.subs.size).toBe(3);

    h.push(animating(2));
    await expect(resolved).resolves.toBe(true);
    await vi.advanceTimersByTimeAsync(1_100);
    await expect(timedOut).resolves.toBe(false);
    h.ctl.abort();
    await expect(aborted).resolves.toBe(false);
    expect(h.subs.size).toBe(0);
  });

  test('nothing fires after a wait has settled: no second line, no second resolution', async () => {
    const h = harness(animating(1));
    const p = h.wait.until(s => s.player?.animId === 2, { timeoutMs: 1_000, label: 'once' });
    h.push(animating(2));
    await expect(p).resolves.toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    h.push(animating(3));
    h.ctl.abort();
    expect(h.warns).toEqual([]);
  });

  test('a stopped tick wait releases its tick subscription', async () => {
    const h = harness({});
    const p = h.wait.ticks(5);
    expect(h.ticks.size).toBe(1);
    h.ctl.abort();
    await expect(p).resolves.toBe(false);
    expect(h.ticks.size).toBe(0);
    h.tick();
    expect(h.ticks.size).toBe(0);
  });
});
