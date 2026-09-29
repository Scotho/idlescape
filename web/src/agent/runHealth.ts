// Wiring the health monitor to one run: what it observes, what it does with each rung of the
// escalation ladder, and what has to be released when the run ends. It lives beside the run
// lifecycle rather than inside `worker.ts` because the two subscriptions it opens are the sort
// of thing that outlives its owner if nobody owns the release.
import { createHealthMonitor } from '../tasks/healthMonitor';
import { recoveryTaskFor } from '../tasks/recovery';
import type { Runner } from '../tasks/runner';
import type { ResolvedPolicy } from '../tasks/behaviour';
import type { HealthCondition, RecoveryOutcome, Script, ScriptContext, Task } from '../tasks/types';
import type { Trace } from '../tasks/trace';
import type { HookEvent, WorldState } from './types';

/** The same slack `travel` uses for a resource: standing next to home is being home. */
const ANCHOR_TOLERANCE = 3;

export interface RunHealthDeps {
  script: Script;
  /**
   * The run's resolved health policy: the script's declared `health` over the player's behaviour
   * settings over the defaults (`tasks/behaviour.ts`). It arrives resolved rather than read off
   * `script.health` here, because only the Worker's `startRun` can see the `run` message the
   * player's half crossed on - and it is typed `ResolvedPolicy` so that having been through
   * `resolvePolicy` is a fact the compiler checks rather than one the caller remembers.
   */
  policy: ResolvedPolicy;
  trace: Trace;
  /** The latest snapshot, or null before the first one arrives. */
  state(): WorldState | null;
  onTick(cb: () => void): () => void;
  onEvent(cb: (e: HookEvent) => void): () => void;
  /** The compact snapshot the `stuck` rung records. */
  snapshot(): unknown;
  /** Read late: the context and the runner are both built after the monitor is. */
  ctx(): ScriptContext | null;
  runner(): Runner | null;
  now(): number;
  /**
   * The `logout` recovery's way back into the game, wired from `Transport.relogin`. It comes in
   * here rather than off the context because `ScriptContext` has no `relogin` and must not gain
   * one: a recovery may log the account back in, a script may not log it in and out.
   */
  relogin(): Promise<{ ok: boolean; reason?: string }>;
  /**
   * Ends the session, wired from `Transport.logout`. Two rungs reach it: a death whose behaviour
   * is `logout` or `loot-and-logout` (the recovery calls it, because it may have to loot first),
   * and any other rung whose `onStuck` is `logout` (the ladder calls it, below).
   */
  logout(): void;
}

export interface RunHealth {
  /** The `c.health` a script sees. */
  health: ScriptContext['health'];
  /** The runner's `recovery` dep: one queued recovery, as an ordinary task. */
  recovery(): Task | null;
  counts(): Partial<Record<HealthCondition, number>>;
  /** Releases both subscriptions and the monitor. Nothing observes after this. */
  dispose(): void;
}

export function createRunHealth(d: RunHealthDeps): RunHealth {
  const policy = d.policy;
  const monitor = createHealthMonitor({
    policy,
    now: d.now,
    trace: e => { d.trace.push(e); },
    // A script claims a condition by declaring a task that lists it in `recovers`.
    claims: condition => d.script.tasks.some(task => task.recovers?.includes(condition) === true)
  });

  // The monitor has to see every snapshot, running or not, so it hangs off the same fan-out the
  // context does, and hook events for the conditions no snapshot shows.
  /**
   * A recovery that has just been queued takes the game now: a task parked on a 60 s
   * `wait.until` would otherwise sit through the whole thing before the runner ever looks at the
   * queue. Interrupting only on the step from "nothing queued" to "this condition queued" keeps
   * it to one abort per occurrence, rather than one per tick the condition stays visible.
   */
  const queued = (before: HealthCondition | null): void => {
    const after = monitor.pending();
    if (after && after !== before) d.runner()?.interrupt();
  };
  const offTick = d.onTick(() => {
    const s = d.state();
    if (!s) return;
    const before = monitor.pending();
    monitor.observe(s, d.now());
    queued(before);
  });
  const offEvent = d.onEvent(e => {
    const before = monitor.pending();
    monitor.note(e, d.now());
    queued(before);
  });

  /** One rung of the ladder, applied. Each one is already traced by the monitor. */
  function escalate(condition: HealthCondition, outcome: RecoveryOutcome): void {
    const next = monitor.settle(condition, outcome);
    if (next === 'continue') return;
    if (next === 're-anchor') {
      const ctx = d.ctx();
      // Fire and forget: what happens next is decided by the world the next snapshot shows,
      // not by whether this walk finished.
      if (ctx) void ctx.travel.to(ctx.anchor(), { tolerance: ANCHOR_TOLERANCE }).catch(() => {});
      return;
    }
    if (next === 'pause-stuck') {
      d.trace.push({ kind: 'stuck', task: `recover:${condition}`, snapshot: d.snapshot() });
      d.runner()?.pause('stuck', 'runner');
      return;
    }
    // The death recovery has already asked the transport itself - it is the only rung that may
    // have had to loot first - so asking again here would send a second logout packet.
    if (next.fail === 'logged_out' && condition !== 'death') d.logout();
    d.runner()?.fail(next.fail);
  }

  return {
    health: {
      is: condition => monitor.is(condition),
      last: () => monitor.last(),
      recovered: condition => { monitor.recovered(condition); }
    },
    recovery() {
      const condition = monitor.takeRecovery();
      if (!condition) return null;
      // `onDeath` and `maxRelogins` come off the resolved policy; `relogin` and `logout` are the
      // transport's, and never reach a script.
      const task = recoveryTaskFor(condition, {
        settle: escalate, relogin: d.relogin, logout: d.logout,
        onDeath: policy.onDeath, maxRelogins: policy.maxRelogins,
        // Read through the monitor rather than copied out now: the recovery runs later, and the
        // monitor is the only thing that saw the snapshot the death fired on.
        deathTile: () => monitor.deathTile(),
        diedAt: () => monitor.diedAt(),
        // The run's clock, not `Date.now`: `diedAt` is stamped from this one, and the loot window
        // is the difference between them.
        now: d.now
      });
      // No default recovery for this one (and no script claimed it): escalate it now rather than
      // consuming the condition and leaving the run to walk back into it.
      if (!task) { escalate(condition, 'escalated'); return null; }
      return task;
    },
    counts: () => monitor.counts(),
    dispose() {
      offTick();
      offEvent();
      monitor.dispose();
    }
  };
}
