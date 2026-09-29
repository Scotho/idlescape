// web/src/tasks/retry.test.ts
import { describe, expect, test, vi } from 'vitest';
import { createRetry } from './retry';

/** `onTicks` fires inside the backoff, which is the only way to abort during one. */
function harness(onTicks?: (n: number) => void) {
  const ctl = new AbortController();
  const waited: number[] = [];
  const logs: string[] = [];
  const retry = createRetry({
    // As strict as the real `wait.ticks`, which is what let the empty-ladder bug through once:
    // the real one takes a non-finite `n` as `n <= 0` false, counts down from `NaN` and never
    // settles, so a fake that shrugged at `undefined` was weaker than the collaborator.
    ticks: async n => {
      if (!Number.isFinite(n)) throw new Error(`wait.ticks would never settle for ${String(n)}`);
      waited.push(n); onTicks?.(n); return !ctl.signal.aborted;
    },
    signal: () => ctl.signal,
    log: t => logs.push(t)
  });
  return { retry, waited, logs, ctl };
}

describe('c.retry', () => {
  test('returns the first result that satisfies `until`, and does not call fn again', async () => {
    const h = harness();
    const fn = vi.fn().mockResolvedValueOnce({ success: false }).mockResolvedValueOnce({ success: true });
    const r = await h.retry(fn, { until: (x: { success: boolean }) => x.success, label: 'open the bank' });
    expect(r).toEqual({ success: true });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(h.waited).toEqual([1]);                       // one backoff, the first of [1, 2, 4]
  });

  test('gives up after `attempts` and returns the last result rather than throwing', async () => {
    const h = harness();
    const fn = vi.fn().mockResolvedValue({ success: false, reason: 'target_not_found' });
    const r = await h.retry(fn, { attempts: 3, until: (x: { success: boolean }) => x.success });
    expect(fn).toHaveBeenCalledTimes(3);
    expect(r).toEqual({ success: false, reason: 'target_not_found' });
    expect(h.waited).toEqual([1, 2]);                    // no backoff after the last attempt
  });

  test('an abort between attempts returns immediately, so a stop is never delayed by a backoff', async () => {
    const h = harness();
    const fn = vi.fn().mockImplementation(async () => { h.ctl.abort(); return { success: false }; });
    const r = await h.retry(fn, { attempts: 5, until: (x: { success: boolean }) => x.success });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ success: false });
    expect(h.waited).toEqual([]);                        // and it never reached the backoff at all
  });

  test('an abort during a backoff ends the retry before the next attempt', async () => {
    const h: { retry: ReturnType<typeof createRetry>; ctl: AbortController; waited: number[] } =
      harness(() => h.ctl.abort());
    const fn = vi.fn().mockResolvedValue(false);
    await h.retry(fn, { attempts: 4, until: (x: boolean) => x });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(h.waited).toEqual([1]);
  });

  test('backoffTicks accepts one number as well as a ladder', async () => {
    const h = harness();
    const fn = vi.fn().mockResolvedValue(false);
    await h.retry(fn, { attempts: 3, backoffTicks: 2, until: (x: boolean) => x });
    expect(h.waited).toEqual([2, 2]);
  });

  // The ladder is shorter than the attempt count on purpose: [1, 2, 4] with attempts: 6 holds at
  // 4 rather than running off the end and waiting `undefined` ticks.
  test('a ladder shorter than the attempt count holds at its last rung', async () => {
    const h = harness();
    const fn = vi.fn().mockResolvedValue(false);
    await h.retry(fn, { attempts: 6, until: (x: boolean) => x });
    expect(h.waited).toEqual([1, 2, 4, 4, 4]);
  });

  test('a caller signal that is already aborted stops after one attempt, without touching the run', async () => {
    const h = harness();
    const own = new AbortController();
    own.abort();
    const fn = vi.fn().mockResolvedValue(false);
    await h.retry(fn, { attempts: 4, until: (x: boolean) => x, signal: own.signal });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(h.ctl.signal.aborted).toBe(false);
    expect(h.waited).toEqual([]);
  });

  test('`label` is what a reader sees between attempts, and an unlabelled retry stays silent', async () => {
    const h = harness();
    const fn = vi.fn().mockResolvedValue(false);
    await h.retry(fn, { attempts: 2, until: (x: boolean) => x, label: 'open the bank' });
    expect(h.logs).toEqual(['retry open the bank: attempt 1 of 2 did not succeed']);
    const q = harness();
    await q.retry(vi.fn().mockResolvedValue(false), { attempts: 2, until: (x: boolean) => x });
    expect(q.logs).toEqual([]);
  });

  // `number[]` admits the empty array, and `ladder[-1]` is `undefined`. The real `wait.ticks`
  // takes `undefined <= 0` as false and then counts down from `NaN`, so it never settles: an
  // empty ladder parked the retry until the task's `timeoutMs` fired. It falls back instead.
  test('an empty backoff ladder falls back to the default rather than waiting undefined ticks', async () => {
    const h = harness();
    const fn = vi.fn().mockResolvedValue(false);
    const r = await h.retry(fn, { attempts: 3, backoffTicks: [], until: (x: boolean) => x });
    expect(fn).toHaveBeenCalledTimes(3);
    expect(r).toBe(false);
    expect(h.waited).toEqual([1, 2]);
    expect(h.waited.every(n => Number.isFinite(n))).toBe(true);
  });

  test('attempts below one is still one attempt, not zero', async () => {
    const h = harness();
    const fn = vi.fn().mockResolvedValue(false);
    const r = await h.retry(fn, { attempts: 0, until: (x: boolean) => x });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(r).toBe(false);
    expect(h.waited).toEqual([]);
  });
});
