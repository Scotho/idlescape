import { describe, expect, test, vi } from 'vitest';
import { createHumanInputWatcher } from './humanInput';
import type { Transport } from '../agent/types';

/** A clock whose timers only fire when the test advances it. */
function fakeClock() {
  let now = 1_000;
  let next = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimeout: (fn: () => void, ms: number): unknown => { const id = next++; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: (h: unknown): void => { timers.delete(h as number); },
    pending: () => timers.size,
    advance(ms: number): void {
      now += ms;
      for (const [id, t] of [...timers]) {
        if (t.at <= now) { timers.delete(id); t.fn(); }
      }
    }
  };
}

function harness(opts: { resumeAfterMs?: number } = {}) {
  const subs = new Set<() => void>();
  const transport = {
    humanInput: (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; },
    cancel: vi.fn()
  } as unknown as Transport;
  const clock = fakeClock();
  const state = { running: false, pausedByHuman: false, resumeAfterMs: opts.resumeAfterMs ?? 5000 };
  const pause = vi.fn(() => { state.running = false; state.pausedByHuman = true; });
  const resume = vi.fn(() => { state.pausedByHuman = false; state.running = true; });
  const setResumeAt = vi.fn();
  const watcher = createHumanInputWatcher({
    transport,
    isRunning: () => state.running,
    isPausedByHuman: () => state.pausedByHuman,
    pause, resume,
    resumeAfterMs: () => state.resumeAfterMs,
    setResumeAt,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout
  });
  return { watcher, clock, state, pause, resume, setResumeAt, input: () => { for (const cb of subs) cb(); } };
}

describe('human input watcher', () => {
  test('pauses the first input while running and exposes the resume deadline', () => {
    const h = harness();
    h.state.running = true;
    h.input();
    expect(h.pause).toHaveBeenCalledTimes(1);
    expect(h.watcher.resumeAt()).toBe(h.clock.now() + 5000);
    expect(h.setResumeAt).toHaveBeenLastCalledWith(h.clock.now() + 5000);
  });

  test('does nothing when no run is active', () => {
    const h = harness();
    h.input();
    expect(h.pause).not.toHaveBeenCalled();
    expect(h.watcher.resumeAt()).toBeNull();
    expect(h.clock.pending()).toBe(0);
  });

  test('re-arms on each further input and resumes 5s after the last one', () => {
    const h = harness();
    h.state.running = true;
    h.input();
    h.clock.advance(4000);
    h.input();                          // still paused by human: re-arm, do not pause twice
    expect(h.pause).toHaveBeenCalledTimes(1);
    expect(h.watcher.resumeAt()).toBe(h.clock.now() + 5000);
    h.clock.advance(4000);
    expect(h.resume).not.toHaveBeenCalled();
    h.clock.advance(1000);
    expect(h.resume).toHaveBeenCalledTimes(1);
    expect(h.watcher.resumeAt()).toBeNull();
    expect(h.setResumeAt).toHaveBeenLastCalledWith(null);
  });

  test('a zero delay pauses but never auto-resumes', () => {
    const h = harness({ resumeAfterMs: 0 });
    h.state.running = true;
    h.input();
    expect(h.pause).toHaveBeenCalledTimes(1);
    expect(h.watcher.resumeAt()).toBeNull();
    expect(h.clock.pending()).toBe(0);
    h.clock.advance(60_000);
    expect(h.resume).not.toHaveBeenCalled();
  });

  test('does not resume a run the player paused themselves', () => {
    const h = harness();
    h.state.running = true;
    h.input();
    h.state.pausedByHuman = false;      // the player hit Pause while the timer was armed
    h.clock.advance(5000);
    expect(h.resume).not.toHaveBeenCalled();
  });

  test('cancel drops the pending resume and clears the published deadline', () => {
    const h = harness();
    h.state.running = true;
    h.input();
    expect(h.clock.pending()).toBe(1);
    h.watcher.cancel();
    expect(h.clock.pending()).toBe(0);
    expect(h.watcher.resumeAt()).toBeNull();
    expect(h.setResumeAt).toHaveBeenLastCalledWith(null);
    h.clock.advance(60_000);
    expect(h.resume).not.toHaveBeenCalled();
    // Still subscribed: the next input re-arms as usual.
    h.state.running = true;
    h.input();
    expect(h.watcher.resumeAt()).toBe(h.clock.now() + 5000);
  });

  test('dispose unsubscribes and cancels the pending timer', () => {
    const h = harness();
    h.state.running = true;
    h.input();
    h.watcher.dispose();
    expect(h.clock.pending()).toBe(0);
    h.state.running = true;
    h.input();
    expect(h.pause).toHaveBeenCalledTimes(1);
  });
});
