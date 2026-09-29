import type { Actor, FailReason, PauseReason, RunOutcome, RunState, Script, ScriptContext, Task } from './types';
import type { Trace } from './trace';
import type { WorldState } from '../agent/types';
type Unsub = () => void;
export interface RunStatusLite { state: RunState; reason: PauseReason | null; task: string | null; attempts: number }
export interface RunnerDeps {
  script: Script; ctx: ScriptContext; trace: Trace; state(): WorldState | null; onTick(cb: () => void): Unsub;
  now(): number; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(h: unknown): void; onStateChange?(s: RunStatusLite): void;
  /**
   * Publishes the signal `ctx.signal` and every `ctx.wait.*` observes. The runner owns one
   * controller per task; without this the context keeps the run-level signal and a task timeout
   * aborts something nothing is listening to.
   */
  setSignal?(signal: AbortSignal | null): void;
  /** Drain the client's action queue and settle in-flight dispatches. Called on every task abort. */
  cancel?(): void;
  /**
   * A recovery the health monitor wants run before the script's own tasks. Called once per
   * evaluation; returning null means there is nothing to recover from.
   */
  recovery?(): Task | null;
}
export interface Runner {
  start(): Promise<RunOutcome>; pause(reason: PauseReason, by: Actor): void;
  resume(by: Actor): { ok: true } | { ok: false; reason: 'paused_by_player' | 'not_paused' }; stop(by: Actor): void; status(): RunStatusLite;
  /**
   * Abort the task in flight so the loop re-evaluates at once, without counting it as a failure.
   * The health monitor calls it when it queues a recovery: spec 3.4 asks for a recovery that
   * takes the game now, rather than one that waits out a parked `wait.until`.
   */
  interrupt(): void;
  /** End the run with a typed reason. Used by the recovery ladder's last rung. */
  fail(reason: FailReason): void;
  failReason(): FailReason | null;
}

export function createRunner(d: RunnerDeps): Runner {
  const { script, trace } = d;
  const stuckAfterMs = script.stuckAfterMs ?? 45_000;
  // S12 step 2, for the deprecation this task creates: a run that still names the floor
  // `hpBelow` says so once, at warn, so a player who never reads the reference finds out. It
  // fires on the member being SET, not on it being the one read, because a script that sets both
  // has still touched the member that is going away. `createDeprecations` is run-scoped inside
  // the context and does not reach the runner, so this is the trace directly, in the wording
  // deprecate.ts would have produced.
  if (script.hardStop?.hpBelow !== undefined) {
    trace.push({ kind: 'log', level: 'warn', text: 'hardStop.hpBelow is deprecated. Use hpBelowPoints. Removed in api 3.' });
  }
  const st: RunStatusLite = { state: 'idle', reason: null, task: null, attempts: 0 };
  let resumeWaiters: (() => void)[] = [];
  let taskAbort: AbortController | null = null; const runAbort = new AbortController(); let outcome: RunOutcome | null = null;
  let lastMatchAt = d.now(); let lastTask: string | null = null; let fails = 0;
  let failure: FailReason | null = null;
  // Ticks are counted from start() so a tick that lands while a task is in flight still counts as
  // "fresh state" for the next `when` evaluation (edge-triggered, not level-triggered).
  let ticks = 0; let tickWaiter: (() => void) | null = null;
  const set = (patch: Partial<RunStatusLite>): void => { Object.assign(st, patch); d.onStateChange?.({ ...st }); };
  const wakeTick = (): void => { const w = tickWaiter; tickWaiter = null; w?.(); };
  const tickAfter = (seen: number): Promise<void> => ticks > seen ? Promise.resolve() : new Promise(res => { tickWaiter = res; });
  const waitResume = (): Promise<void> => new Promise(res => resumeWaiters.push(res));
  /** Abort the task in flight and take the game back from it. Safe when no task is running. */
  const abortTask = (): void => {
    if (!taskAbort) return;
    taskAbort.abort();
    d.cancel?.();
  };
  const wakeResume = (): void => { const w = resumeWaiters; resumeWaiters = []; for (const r of w) r(); };

  function pause(reason: PauseReason, by: Actor): void {
    if (st.state !== 'running' && st.state !== 'starting') return;
    abortTask();
    trace.push({ kind: 'paused', reason, by });
    set({ state: 'paused', reason });
  }
  function resume(by: Actor) {
    if (st.state !== 'paused') return { ok: false as const, reason: 'not_paused' as const };
    if (st.reason === 'player' && by !== 'player') return { ok: false as const, reason: 'paused_by_player' as const };
    if (st.reason === 'hard-stop') return { ok: false as const, reason: 'not_paused' as const };
    trace.push({ kind: 'resumed', by }); fails = 0; lastMatchAt = d.now();
    set({ state: 'running', reason: null });
    wakeResume();
    return { ok: true as const };
  }
  function interrupt(): void {
    if (outcome || st.state !== 'running') return;
    abortTask();
    wakeTick();
  }
  function fail(reason: FailReason): void {
    if (outcome) return;
    failure = reason;
    outcome = 'failed';
    trace.push({ kind: 'log', level: 'error', text: `run failed: ${reason}` });
    abortTask(); runAbort.abort(); wakeResume(); wakeTick();
  }
  function stop(by: Actor): void {
    if (outcome) return; outcome = 'stopped'; trace.push({ kind: 'log', level: 'info', text: `stopped by ${by}` });
    abortTask(); runAbort.abort(); wakeResume(); wakeTick();
  }

  async function runTask(t: Task): Promise<'ok' | 'failed' | 'timeout' | 'aborted'> {
    const started = d.now();
    taskAbort = new AbortController();
    d.setSignal?.(taskAbort.signal);
    const onRunAbort = (): void => taskAbort?.abort();
    runAbort.signal.addEventListener('abort', onRunAbort, { once: true });
    // NOT a spread: `d.ctx.signal` is a getter over `setSignal`, and spreading it would freeze
    // the value at task start - which is exactly the SP4a bug this task exists to fix.
    const ctx: ScriptContext = d.ctx;
    let timedOut = false;
    const timer = d.setTimeout(() => { timedOut = true; abortTask(); }, t.timeoutMs ?? 30_000);
    if (lastTask !== t.name) { trace.push({ kind: 'task_enter', task: t.name }); fails = 0; }
    lastTask = t.name; set({ task: t.name, attempts: fails + 1 });
    let out: 'ok' | 'failed' | 'timeout' | 'aborted'; let reason: string | undefined;
    try {
      const r = await t.run(ctx);
      out = r && typeof r === 'object' && r.success === false ? 'failed' : 'ok'; reason = r && typeof r === 'object' ? r.reason : undefined;
    } catch (e) { out = 'failed'; reason = e instanceof Error ? e.message : String(e); }
    if (taskAbort.signal.aborted) out = timedOut ? 'timeout' : 'aborted';
    d.clearTimeout(timer); runAbort.signal.removeEventListener('abort', onRunAbort); d.setSignal?.(null); taskAbort = null;
    trace.push({ kind: 'task_exit', task: t.name, outcome: out, attempts: fails + 1, ms: d.now() - started, reason });
    return out;
  }

  function markStuck(task: string | null, snapshot: unknown): void {
    trace.push({ kind: 'stuck', task, snapshot });
    set({ state: 'paused', reason: 'stuck' });
    trace.push({ kind: 'paused', reason: 'stuck', by: 'runner' });
  }

  /**
   * When each task last finished, so `Task.cooldownMs` (P19) can hold it back. Run scoped: a
   * cooldown is about how often a task runs inside one run, and a new run starts everything due.
   */
  const lastExit = new Map<string, number>();
  const due = (t: Task): boolean => {
    const cd = t.cooldownMs;
    if (cd === undefined) return true;
    const at = lastExit.get(t.name);
    return at === undefined || d.now() - at >= cd;
  };
  /**
   * Holds already noted in the trace, keyed by the `lastExit` stamp they belong to, so one hold
   * is one line rather than one per tick. Only a cooldown at least as long as `stuckAfterMs` is
   * noted: the state stays `running` and the stuck detector is deliberately suppressed while a
   * task is held, so a long hold is otherwise a run that reads as alive and does nothing. A
   * shorter one is invisible for less time than the detector would have taken to fire anyway.
   */
  const notedHold = new Map<string, number>();
  function noteHold(t: Task): void {
    const at = lastExit.get(t.name);
    if (at === undefined || (t.cooldownMs ?? 0) < stuckAfterMs || notedHold.get(t.name) === at) return;
    notedHold.set(t.name, at);
    trace.push({ kind: 'log', level: 'info', text: `${t.name} is held by its ${t.cooldownMs}ms cooldown; the run idles until it is due rather than trying a later task` });
  }

  async function loop(): Promise<RunOutcome> {
    const offTick = d.onTick(() => { ticks++; wakeTick(); });
    if (st.state !== 'paused') set({ state: 'running' });   // a pause issued during onStart stands
    while (!outcome) {
      if (st.state === 'paused') { await waitResume(); continue; }
      const seenTick = ticks;
      const s = d.state();
      if (s) {
        // S8: `hpBelowPoints` is the named form. `hpBelow` is deprecated and still read.
        const hp = s.player?.hp; const floor = script.hardStop?.hpBelowPoints ?? script.hardStop?.hpBelow;
        if (floor !== undefined && typeof hp === 'number' && hp < floor) { trace.push({ kind: 'paused', reason: 'hard-stop', by: 'runner' }); set({ state: 'paused', reason: 'hard-stop' }); failure = 'low_hp'; outcome = 'failed'; break; }
        if (script.until?.(s, d.ctx)) { outcome = 'done'; break; }
        // A recovery outranks the script: the monitor only queues one when the world is in a
        // state the script is not equipped for, and letting `when` win would run the script's
        // own task into the same wall that produced the condition.
        // The recovery is drained FIRST and `matched` is computed only when there is none. The
        // `??` this replaces short-circuited, so a pending recovery evaluated no script
        // predicate at all; hoisting the `find` above it would run every author-written `when`
        // on every recovery tick, which is a behaviour change in a hot loop over code we do not
        // control.
        const recovered = d.recovery?.();
        const matched = recovered ? undefined : script.tasks.find(t => { try { return t.when(s, d.ctx); } catch { return false; } });
        // P19: a matching task that is still inside its cooldown is not selected this tick.
        const task = recovered ?? (matched && due(matched) ? matched : undefined);
        // Draining the recovery can itself end the run (the ladder's last rung): without this the
        // script's own task would be entered on a run that is already over, against a run-level
        // signal that has already fired and so will never abort it.
        if (outcome) break;
        // A task that matched but is on cooldown HAS matched: refreshing `lastMatchAt` here is
        // what stops a cooldown longer than `stuckAfterMs` from turning into a stuck pause the
        // player never caused. The skip is not an attempt, so `fails` is untouched.
        if (!task && matched) { lastMatchAt = d.now(); noteHold(matched); }
        if (task) {
          lastMatchAt = d.now();
          const out = await runTask(task);
          lastExit.set(task.name, d.now());
          if (out === 'failed' || out === 'timeout') {
            fails++;
            if (fails >= (task.maxAttempts ?? script.maxAttempts ?? 3)) { markStuck(task.name, d.state()); continue; }
          } else if (out === 'ok') fails = 0;
        } else if (d.now() - lastMatchAt >= stuckAfterMs && st.state === 'running') {
          markStuck(null, s); continue;
        }
      }
      if (!outcome) await tickAfter(seenTick);
    }
    offTick();
    set({ state: outcome });
    return outcome;
  }

  return {
    async start() {
      set({ state: 'starting' });
      // Only yield when the hooks exist: the first task is evaluated synchronously on the current snapshot.
      if (script.onStart) { try { await script.onStart(d.ctx); } catch (e) { trace.push({ kind: 'log', level: 'error', text: `onStart failed: ${String(e)}` }); } }
      const result = await loop();
      if (script.onStop) { try { await script.onStop(d.ctx, result); } catch { /* ignore */ } }
      return result;
    },
    pause, resume, stop, interrupt, fail, failReason: () => failure, status: () => ({ ...st })
  };
}
