// The stateful half of state detection. It watches every snapshot, decides when a condition has
// newly fired, and hands the runner one pending recovery at a time. It never runs a task itself:
// the runner drains `takeRecovery()` before it evaluates the script's own tasks, so a recovery is
// an ordinary traced task with its own attempts.
import { emptyMemory, evaluate, observe, type HealthMemory } from './health';
import type { ResolvedPolicy } from './behaviour';
import type { FailReason, HealthCondition, HealthEvent, RecoveryOutcome, TraceEvent } from './types';
import type { HookEvent, WorldState } from '../agent/types';

export type Escalation = 'continue' | 're-anchor' | 'pause-stuck' | { fail: FailReason };

/**
 * Where a condition ends up when its recoveries keep failing, or when it has none to try.
 * `low-hp` is absent on purpose: `evaluate` never returns it, `recoveryTaskFor` has no task for
 * it and nothing settles it - it is the runner's own `hardStop.hpBelow`, which ends the run with
 * `low_hp` without ever passing through this ladder.
 */
const TERMINAL: Partial<Record<HealthCondition, FailReason>> = {
  death: 'died',
  logout: 'disconnected',
  'out-of-supplies': 'out_of_supplies',
  'inventory-full': 'inventory_full',
  'no-progress': 'no_progress'
};

/**
 * How many times a condition may fire in one run before the ladder stops trying it, and where it
 * goes when that budget is spent. Both rows the spec counts, it counts in occurrences rather than
 * attempts - and it has to: a recovery that worked resets the attempt ladder, so an attempt count
 * can never express "the second time this happens".
 */
const OCCURRENCE_BUDGET: Partial<Record<HealthCondition, { n: number; to: 'pause-stuck' | 'terminal' }>> = {
  // Decision 5: coming back from one death is a recovery; a second is a script that cannot
  // survive where it is standing.
  death: { n: 1, to: 'terminal' },
  // Spec 3.4 row 1: "second occurrence pauses stuck". A no-progress recovery normally reports
  // `recovered` even when nothing was wrong with where the character stood - walking to the
  // anchor while already on it arrives at zero tiles - so without a budget a wedged run would
  // re-scan and walk home every 90 s for the rest of its life without ever pausing or failing.
  'no-progress': { n: 1, to: 'pause-stuck' }
};

/**
 * Conditions the `re-anchor` rung is skipped for. Walking back to the run anchor is the ladder's
 * general "maybe it is where we are standing" move, and a full inventory is the one condition
 * where it demonstrably is not (spec 3.4 pauses `stuck` for it instead).
 */
const NO_REANCHOR: HealthCondition[] = ['inventory-full'];

/**
 * Where a death ends up, given the resolved policy. `loot` and `return` recover and carry on, and
 * `resume` never left, so those three answer null and fall through to the ordinary ladder; the
 * other four are endings the ladder owns rather than the recovery, because only the ladder can
 * stop a run. `fail` is a script saying a death ends it, which is why there is no rung between
 * the settle and the failure.
 */
function deathRung(policy: ResolvedPolicy): Escalation | null {
  switch (policy.onDeath) {
    case 'pause': return 'pause-stuck';
    case 'logout':
    case 'loot-and-logout': return { fail: 'logged_out' };
    case 'fail': return { fail: 'died' };
    default: return null;
  }
}

/**
 * Where a rung that ends in "the run cannot carry on by itself" goes. `pause` is the historical
 * behaviour and the default, and it is the only one a player can resume from; the other two end
 * the run, because someone who asked to be logged out or stopped is not coming back to it.
 */
function stuckRung(policy: ResolvedPolicy): Escalation {
  switch (policy.onStuck) {
    case 'stop': return { fail: 'stuck' };
    case 'logout': return { fail: 'logged_out' };
    default: return 'pause-stuck';
  }
}

/** `Omit` is not distributive over a union; distribute it so each variant keeps its payload. */
type WithoutMeta<T> = T extends unknown ? Omit<T, 'seq' | 'at'> : never;
/** The two trace rows the monitor writes, derived from `TraceEvent` so they cannot drift. */
export type HealthTraceEvent = WithoutMeta<Extract<TraceEvent, { kind: 'health' | 'recovery' }>>;

export interface HealthMonitorDeps {
  /**
   * `ResolvedPolicy`, not `HealthPolicy`: `deathRung` and `stuckRung` switch on `onDeath` and
   * `onStuck` and would fall through their `default` arms if `resolvePolicy` had not run. The
   * type is what makes having run it structural rather than a convention.
   */
  policy: ResolvedPolicy;
  trace(event: HealthTraceEvent): void;
  /** True when the running script declares a task that handles this condition itself. */
  claims(condition: HealthCondition): boolean;
  /** The clock the progress window is measured against, so a settled recovery can move it. */
  now(): number;
}

export interface HealthMonitor {
  observe(state: WorldState, now: number): void;
  /** Hook events a snapshot cannot show. */
  note(event: HookEvent, now: number): void;
  /** The condition waiting for a recovery, without consuming it. */
  pending(): HealthCondition | null;
  /** The condition to recover from next, consumed by the caller. */
  takeRecovery(): HealthCondition | null;
  /** Report how a recovery ended; the ladder answers with what to do next. */
  settle(condition: HealthCondition, outcome: RecoveryOutcome): Escalation;
  is(condition: HealthCondition): boolean;
  last(): HealthEvent | null;
  /**
   * The tile the run died on, or null. Captured as the death fires rather than read on demand:
   * by the time a recovery runs, the snapshot reports the Lumbridge respawn point.
   */
  deathTile(): { x: number; z: number; level: number } | null;
  /** Epoch ms of that death, which is when the 200-tick despawn clock on the loot started. */
  diedAt(): number | null;
  recovered(condition: HealthCondition): void;
  counts(): Partial<Record<HealthCondition, number>>;
  dispose(): void;
}

export function createHealthMonitor(d: HealthMonitorDeps): HealthMonitor {
  const maxAttempts = d.policy.maxRecoveryAttempts ?? 2;
  const counts: Partial<Record<HealthCondition, number>> = {};
  const attempts = new Map<HealthCondition, number>();
  let memory: HealthMemory | null = null;
  let pending: HealthCondition | null = null;
  let active: HealthCondition | null = null;
  let lastEvent: HealthEvent | null = null;
  let disposed = false;
  /** Where the run died and when, captured as the death fires because the next snapshot is the respawn. */
  let death: { tile: { x: number; z: number; level: number }; at: number } | null = null;

  function fire(condition: HealthCondition, at: number, detail?: string): void {
    // One event per occurrence, not one per tick: a death is visible for many ticks, and a
    // recovery queue that grew every tick would never drain. The cost of that is that a script
    // which claims a condition and never calls `c.health.recovered(...)` leaves it `active` for
    // the rest of the run, and the monitor stays silent about that one condition.
    if (active === condition || pending === condition) return;
    // Captured here, on the far side of that guard, because this is the one snapshot whose
    // memory still holds the tile the loot fell on: a death stays visible for several ticks, and
    // by the time the respawn lands `lastAliveAt` has moved to the Lumbridge respawn point. One
    // capture per occurrence, so a second death in the same run records its own tile.
    // Assigned on every death, including to null: leaving the previous record standing would
    // hand the next recovery the last death's tile and, worse, the last death's clock.
    if (condition === 'death') death = memory?.lastAliveAt ? { tile: memory.lastAliveAt, at } : null;
    lastEvent = { condition, at, detail };
    counts[condition] = (counts[condition] ?? 0) + 1;
    d.trace({ kind: 'health', condition, ...(detail === undefined ? {} : { detail }) });
    if (d.claims(condition)) {
      // The script owns this one. Say so in the trace, and leave the queue alone so the
      // script's own `when` (which tests `c.health.is`) picks it up on the next evaluation.
      active = condition;
      d.trace({ kind: 'recovery', condition, action: 'script', outcome: 'handled-by-script' });
      return;
    }
    // One slot, not a queue: a lower-priority condition firing before the runner drains this one
    // replaces it. The window is a tick or two, and the evicted condition fires again on the next
    // snapshot that still shows it, which is every snapshot until it is dealt with.
    pending = condition;
  }

  /** The run is over for this condition, if the closed set has a reason for it. */
  const terminal = (condition: HealthCondition): Escalation => {
    const reason = TERMINAL[condition];
    return reason ? { fail: reason } : stuckRung(d.policy);
  };

  return {
    observe(state, now) {
      if (disposed) return;
      memory = observe(memory ?? emptyMemory(now), state, now);
      const condition = evaluate(memory, state, now, d.policy);
      if (condition) fire(condition, now);
    },
    note(event, now) {
      if (disposed) return;
      if (event.name === 'logout' || event.name === 'disconnect') fire('logout', now, event.name);
    },
    pending: () => pending,
    takeRecovery() {
      if (disposed) return null;
      const next = pending;
      pending = null;
      if (next) active = next;
      return next;
    },
    settle(condition, outcome) {
      // A recovery that outlived the run reports into nothing: the trace it would write to
      // belongs to a run that has already been summarised.
      if (disposed) return 'continue';
      const tried = (attempts.get(condition) ?? 0) + 1;
      attempts.set(condition, tried);
      d.trace({ kind: 'recovery', condition, action: `attempt ${tried}`, outcome });
      active = null;
      const settled = outcome === 'recovered' || outcome === 'handled-by-script';
      if (settled) {
        attempts.delete(condition);
        // The progress clock has to move too, or a recovery that worked is followed straight
        // back into `no-progress` by the same window it was already inside.
        if (memory) memory = { ...memory, lastProgressAt: d.now() };
      }
      const budget = OCCURRENCE_BUDGET[condition];
      if (budget) {
        const seen = counts[condition] ?? 0;
        // A pause is not the end of a run - a player or Claude can resume it - so a condition
        // that comes back after its own pause has nothing left on the ladder.
        if (seen > budget.n + 1) return terminal(condition);
        if (seen > budget.n) return budget.to === 'terminal' ? terminal(condition) : stuckRung(d.policy);
      }
      // Ahead of the `settled` check, and ahead of the rungs: a death whose behaviour is an
      // ending is one whatever the recovery reported, because the recovery cannot stop a run and
      // the four that carry on answer null here. This is also where `onDeath: 'fail'` lives -
      // that policy has no rungs left, not a re-anchor to try first.
      if (condition === 'death') {
        const rung = deathRung(d.policy);
        if (rung) return rung;
      }
      if (settled) return 'continue';
      // Nothing was tried: the condition has no default recovery and no script claimed it.
      if (outcome === 'escalated') return terminal(condition);
      if (tried === 1 && !NO_REANCHOR.includes(condition)) return 're-anchor';
      if (tried <= maxAttempts) return stuckRung(d.policy);
      return terminal(condition);
    },
    is: condition => active === condition || pending === condition,
    last: () => lastEvent,
    deathTile: () => death?.tile ?? null,
    diedAt: () => death?.at ?? null,
    /**
     * A script reporting that it handled a condition itself. It does not consult the occurrence
     * budget: a script that claims a condition owns the policy for it, including whether a second
     * death should end the run.
     */
    recovered(condition) {
      if (disposed) return;
      if (active === condition || pending === condition) {
        attempts.delete(condition);
        active = null;
        pending = null;
        d.trace({ kind: 'recovery', condition, action: 'script', outcome: 'recovered' });
      }
    },
    counts: () => ({ ...counts }),
    dispose() {
      disposed = true;
      pending = null;
      active = null;
      memory = null;
      death = null;
    }
  };
}
