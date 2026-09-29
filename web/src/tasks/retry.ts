// P11's `c.retry`. Pure composition over `wait.ticks` and the task signal: it starts nothing,
// owns nothing, subscribes to nothing, and it checks the signal between attempts so a stop is
// never delayed by a backoff.
//
// How it composes with the other three retry mechanisms, because a script that nests all three
// otherwise gets behaviour nobody specified: `c.retry` lives entirely inside ONE task attempt.
// Its backoff counts against the task's `timeoutMs`, its attempts do not touch
// `Task.maxAttempts`, and it never touches the recovery ladder's occurrence budget. A task that
// wants the runner's ladder returns `{ success: false }` and lets the runner decide; a task that
// wants to try the same call again inside one attempt uses this.
import type { RetryOpts, ScriptContext } from './scriptContext';

/** Ticks waited before attempt 2, 3 and 4. Attempt 5 and later hold at the last rung. */
const DEFAULT_BACKOFF: readonly number[] = [1, 2, 4];

export interface RetryDeps {
  /** `wait.ticks`: server ticks, not milliseconds, per S8. */
  ticks(n: number): Promise<boolean>;
  /**
   * The signal that is live *now*. The runner swaps the current task's signal in before each
   * `run`, so this is read per attempt rather than captured once.
   */
  signal(): AbortSignal;
  log(text: string): void;
}

export function createRetry(d: RetryDeps): ScriptContext['retry'] {
  return async function retry<T>(fn: () => Promise<T>, o: RetryOpts<T>): Promise<T> {
    // Zero or a negative attempt count still calls `fn` once: a caller that computed the number
    // and got it wrong wants the call attempted, not silently skipped with nothing to return.
    const attempts = Math.max(1, o.attempts ?? 3);
    // An empty ladder is a legal `number[]` and it used to park the retry: `ladder[-1]` is
    // `undefined`, and `wait.ticks(undefined)` counts down from `NaN`, so it settles only on an
    // abort. A caller that passed no rungs asked for the default, not for a hang.
    const given = typeof o.backoffTicks === 'number' ? [o.backoffTicks] : o.backoffTicks;
    const ladder = given && given.length > 0 ? given : DEFAULT_BACKOFF;
    const stopped = (): boolean => d.signal().aborted || o.signal?.aborted === true;
    let last: T | undefined;
    for (let i = 0; i < attempts; i++) {
      last = await fn();
      // The result is returned rather than thrown, at every exit: S2 says a member reports
      // instead of throwing, so a caller reads the last result and decides.
      if (o.until(last)) return last;
      if (stopped()) return last;
      if (i === attempts - 1) break;
      if (o.label) d.log(`retry ${o.label}: attempt ${i + 1} of ${attempts} did not succeed`);
      // A ladder shorter than the attempt count holds at its last rung rather than running off
      // the end and waiting `undefined` ticks.
      await d.ticks(ladder[Math.min(i, ladder.length - 1)]);
      if (stopped()) return last;
    }
    return last as T;
  };
}
