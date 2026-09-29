// web/src/tasks/runner.test.ts
import { describe, expect, test, vi } from 'vitest';
import { createRunner, type RunnerDeps } from './runner';
import { createTrace } from './trace';
import type { Script, ScriptContext, Task } from './types';
import type { WorldState } from '../agent/types';

function harness(script: Script, states: Partial<WorldState>[]) {
  let i = 0; let now = 0;
  const tickSubs = new Set<() => void>();
  const timers: { at: number; fn: () => void }[] = [];
  const trace = createTrace({ now: () => now });
  // The context a real Worker builds: `signal` and every `wait.*` read whatever the runner
  // last installed through `setSignal`, per access, rather than a signal captured once.
  let live: AbortSignal | null = null;
  const idle = new AbortController().signal;
  const cancels: number[] = [];
  const ctx = {
    state: () => states[Math.min(i, states.length - 1)] as WorldState,
    get signal() { return live ?? idle; },
    wait: { until: () => new Promise<boolean>(res => { live?.addEventListener('abort', () => res(false)); }) },
    log: vi.fn(), status: vi.fn(), memory: new Map(), params: {}
  } as unknown as ScriptContext;
  const deps: RunnerDeps = {
    script, ctx, trace,
    state: () => states[Math.min(i, states.length - 1)] as WorldState,
    onTick: cb => { tickSubs.add(cb); return () => tickSubs.delete(cb); },
    now: () => now,
    setTimeout: (fn, ms) => { const t = { at: now + ms, fn }; timers.push(t); return t; },
    clearTimeout: h => { const k = timers.indexOf(h as never); if (k >= 0) timers.splice(k, 1); },
    setSignal: sig => { live = sig; },
    cancel: () => { cancels.push(now); }
  };
  async function tick(ms = 600) {
    now += ms; i++;
    for (const t of [...timers]) if (t.at <= now) { timers.splice(timers.indexOf(t), 1); t.fn(); }
    for (const cb of [...tickSubs]) cb();
    await Promise.resolve(); await Promise.resolve();
  }
  return { deps, trace, tick, cancels, runner: createRunner(deps) };
}
const s = (over: Partial<WorldState> = {}): Partial<WorldState> => ({ tick: 1, player: { hp: 10, maxHp: 10 } as never, ...over });
const script = (tasks: Script['tasks'], extra: Partial<Script> = {}): Script => ({ id: 'test-script', name: 'T', version: 1, description: '', tasks, ...extra });

describe('runner', () => {
  test('runs the first matching task, then finishes when until holds', async () => {
    const run = vi.fn(async () => {});
    const h = harness(script([{ name: 'a', when: (st) => st.tick === 1, run }, { name: 'b', when: () => true, run: async () => {} }], { until: st => st.tick >= 3 }), [s({ tick: 1 }), s({ tick: 2 }), s({ tick: 3 })]);
    const done = h.runner.start();
    await h.tick(); await h.tick(); await h.tick();
    expect(await done).toBe('done');
    expect(run).toHaveBeenCalledTimes(1);
    expect(h.trace.tasksEntered()).toEqual(['a', 'b']);
  });
  test('three consecutive failures of one task pause the run as stuck', async () => {
    const h = harness(script([{ name: 'fail', when: () => true, run: async () => ({ success: false, message: 'no' }) }], { maxAttempts: 3 }), [s()]);
    void h.runner.start();
    for (let k = 0; k < 6; k++) await h.tick();
    expect(h.runner.status()).toMatchObject({ state: 'paused', reason: 'stuck', task: 'fail', attempts: 3 });
    expect(h.trace.events().some(e => e.kind === 'stuck')).toBe(true);
  });
  test('no matching task for stuckAfterMs pauses as stuck with task null', async () => {
    const h = harness(script([{ name: 'never', when: () => false, run: async () => {} }], { stuckAfterMs: 2000 }), [s()]);
    void h.runner.start();
    for (let k = 0; k < 5; k++) await h.tick(600);
    expect(h.runner.status()).toMatchObject({ state: 'paused', reason: 'stuck', task: null });
  });
  test('a task past its timeout exits as timeout and the run continues', async () => {
    let calls = 0;
    const h = harness(script([{ name: 'slow', when: () => calls === 0, timeoutMs: 1000, run: async (c) => { calls++; await new Promise((_, rej) => c.signal.addEventListener('abort', () => rej(new Error('aborted')))); } }, { name: 'next', when: () => true, run: async () => {} }], { until: () => calls > 0 && false }), [s()]);
    void h.runner.start();
    await h.tick(600); await h.tick(600); await h.tick(600);
    const exits = h.trace.events().filter(e => e.kind === 'task_exit');
    expect(exits[0]).toMatchObject({ task: 'slow', outcome: 'timeout' });
    expect(h.trace.tasksEntered()).toContain('next');
  });
  // Spec section 3.1: a 1 s task timeout must interrupt a 60 s `wait.until`, not wait it out.
  test('a task timeout interrupts the wait the task is parked on, and cancels the client queue', async () => {
    const h = harness(script([
      { name: 'parked', when: () => true, timeoutMs: 1000, run: c => c.wait.until(() => false, { timeoutMs: 60_000 }).then(() => undefined) }
    ], { until: () => false }), [s()]);
    void h.runner.start();
    await h.tick(600); await h.tick(600); await h.tick(600);
    const exit = h.trace.events().find(e => e.kind === 'task_exit');
    expect(exit).toMatchObject({ task: 'parked', outcome: 'timeout' });
    expect(h.cancels.length).toBeGreaterThan(0);
  });
  test('a pause and a stop both drain the client queue', async () => {
    const h = harness(script([{ name: 'a', when: () => true, run: c => c.wait.until(() => false, { timeoutMs: 60_000 }).then(() => undefined) }]), [s()]);
    const done = h.runner.start(); await h.tick();
    h.runner.pause('player', 'player');
    expect(h.cancels).toHaveLength(1);
    // The task is still in flight at `stop`: the abort listener's `res(false)` has not been
    // drained past the microtask queue, so `taskAbort` is non-null and the stop owes a drain
    // of its own. `taskAbort?.abort()` without the drain would leave this at one.
    h.runner.stop('player');
    expect(h.cancels).toHaveLength(2);
    expect(await done).toBe('stopped');
  });
  test('player pause cannot be resumed by claude; player can', async () => {
    const h = harness(script([{ name: 'a', when: () => true, run: async () => {} }]), [s()]);
    void h.runner.start(); await h.tick();
    h.runner.pause('player', 'player');
    expect(h.runner.resume('claude')).toEqual({ ok: false, reason: 'paused_by_player' });
    expect(h.runner.resume('player')).toEqual({ ok: true });
    expect(h.runner.status().state).toBe('running');
  });
  test('hard stop on low hp ends the run as failed, with low_hp as its reason', async () => {
    const h = harness(script([{ name: 'a', when: () => true, run: async () => {} }], { hardStop: { hpBelow: 3 } }), [s(), s({ player: { hp: 2, maxHp: 10 } as never })]);
    const done = h.runner.start(); await h.tick(); await h.tick();
    expect(await done).toBe('failed');
    expect(h.trace.events().find(e => e.kind === 'paused')).toMatchObject({ reason: 'hard-stop' });
    // Its own reason, not `stuck`: a character that dropped below the floor and one that could
    // not make progress are two failures a player would never confuse.
    expect(h.runner.failReason()).toBe('low_hp');
  });
  test('a recovery runs before a script task that also matches', async () => {
    const order: string[] = [];
    const h = harness(script([{ name: 'script-task', when: () => true, run: async () => { order.push('script-task'); } }]), [s()]);
    let queued: Task | null = { name: 'recover:death', when: () => true, run: async () => { order.push('recover:death'); } };
    // Exactly what the Worker's dep does: hand the queued recovery over once, then nothing.
    h.deps.recovery = () => { const t = queued; queued = null; return t; };
    const r = createRunner(h.deps);
    void r.start();
    await h.tick(); await h.tick();
    // The script's own task matches on every tick; the recovery still goes first.
    expect(order.slice(0, 2)).toEqual(['recover:death', 'script-task']);
    expect(h.trace.tasksEntered()).toEqual(['recover:death', 'script-task']);
    r.stop('test');
  });
  test('interrupt takes the game from the task in flight, without counting it as a failure', async () => {
    let recovered = false;
    const h = harness(script([
      { name: 'parked', when: () => true, run: c => c.wait.until(() => false, { timeoutMs: 60_000 }).then(() => undefined) }
    ]), [s()]);
    let queued: Task | null = null;
    h.deps.recovery = () => { const t = queued; queued = null; return t; };
    const r = createRunner(h.deps);
    void r.start();
    await h.tick();
    queued = { name: 'recover:death', when: () => true, run: async () => { recovered = true; } };
    r.interrupt();
    await h.tick(); await h.tick();
    // The parked task let go at once rather than sitting out its 60 s wait, and the recovery ran.
    expect(h.trace.events().find(e => e.kind === 'task_exit')).toMatchObject({ task: 'parked', outcome: 'aborted' });
    expect(recovered).toBe(true);
    expect(h.cancels.length).toBeGreaterThan(0);
    r.stop('test');
  });
  test('a run failed by the ladder reports its reason and stops the loop', async () => {
    let runs = 0;
    const h = harness(script([{ name: 'a', when: () => true, run: async () => { runs++; } }]), [s()]);
    const done = h.runner.start(); await h.tick();
    h.runner.fail('died');
    expect(await done).toBe('failed');
    expect(h.runner.failReason()).toBe('died');
    expect(h.runner.status().state).toBe('failed');
    expect(h.trace.events().some(e => e.kind === 'log' && e.text === 'run failed: died')).toBe(true);
    const after = runs;
    await h.tick();
    expect(runs).toBe(after);
  });
  test('stop aborts an in-flight task and resolves stopped', async () => {
    const h = harness(script([{ name: 'a', when: () => true, run: c => new Promise((_, rej) => c.signal.addEventListener('abort', () => rej(new Error('x')))) }]), [s()]);
    const done = h.runner.start(); await h.tick();
    h.runner.stop('player');
    expect(await done).toBe('stopped');
    // The runner does not push run_done (the worker, Task 7, does — it owns the run id and
    // summary); the runner's own terminal signals are the aborted task_exit and the status.
    expect(h.trace.events().at(-1)).toMatchObject({ kind: 'task_exit', task: 'a', outcome: 'aborted' });
    expect(h.runner.status()).toMatchObject({ state: 'stopped', task: 'a' });
  });
  test('stop while waiting for the next tick resolves without another tick', async () => {
    const h = harness(script([{ name: 'a', when: () => true, run: async () => {} }]), [s()]);
    const done = h.runner.start(); await h.tick();
    h.runner.stop('claude');
    expect(await done).toBe('stopped');
    expect(h.trace.events().some(e => e.kind === 'log' && e.text === 'stopped by claude')).toBe(true);
  });
  test('onStart runs before the first task and a pause during starting stands', async () => {
    const order: string[] = [];
    const h = harness(script([{ name: 'a', when: () => true, run: async () => { order.push('a'); } }], { onStart: async () => { order.push('onStart'); } }), [s()]);
    const changes: string[] = [];
    h.deps.onStateChange = st => changes.push(st.state);
    const r = createRunner(h.deps);
    void r.start();
    r.pause('claude', 'claude');
    await h.tick(); await h.tick();
    expect(order).toEqual(['onStart']);
    expect(r.status()).toMatchObject({ state: 'paused', reason: 'claude' });
    expect(r.resume('claude')).toEqual({ ok: true });
    await h.tick();
    expect(order).toEqual(['onStart', 'a']);
    expect(changes.slice(0, 3)).toEqual(['starting', 'paused', 'running']);
  });
  // P19. `cooldownMs` was declared on `Task` and read by nothing until this test.
  test('a task on cooldown is skipped, and the skip is not an attempt', async () => {
    // The task fails once, which starts its cooldown; the runner must not count the skipped
    // ticks against maxAttempts, or a cooldown quietly spends the ladder.
    const run = vi.fn(async () => ({ success: false as const, message: 'no' }));
    const h = harness(script([{ name: 'flaky', when: () => true, cooldownMs: 5_000, maxAttempts: 2, run }]), [s()]);
    void h.runner.start();
    for (let k = 0; k < 4; k++) await h.tick(600);
    expect(run).toHaveBeenCalledTimes(1);
    expect(h.runner.status().state).toBe('running');
    expect(h.runner.status().reason).toBeNull();
  });
  test('a cooldown that has expired lets the task run again', async () => {
    const run = vi.fn(async () => {});
    const h = harness(script([{ name: 'slow', when: () => true, cooldownMs: 5_000, run }]), [s()]);
    void h.runner.start();
    await h.tick(600);
    expect(run).toHaveBeenCalledTimes(1);
    await h.tick(600);
    expect(run).toHaveBeenCalledTimes(1);   // still inside the cooldown
    await h.tick(6_000);
    expect(run).toHaveBeenCalledTimes(2);
    h.runner.stop('test');
  });
  // The selection reads the FIRST matching task and then asks whether it is due, so a cooldown
  // idles the tick rather than yielding to a later task that also matches. That is the shape the
  // plan dictates and the `lastMatchAt` refresh below only makes sense under it, so it is pinned
  // here rather than left for the first author who trips over it.
  test('a cooldown on the first matching task idles the tick, it does not yield to a later match', async () => {
    const guard = vi.fn(async () => {});
    const work = vi.fn(async () => {});
    const h = harness(script([
      { name: 'guard', when: () => true, cooldownMs: 60_000, run: guard },
      { name: 'work', when: () => true, run: work }
    ]), [s()]);
    void h.runner.start();
    for (let k = 0; k < 6; k++) await h.tick(600);
    expect(guard).toHaveBeenCalledTimes(1);
    expect(work).toHaveBeenCalledTimes(0);
    expect(h.trace.tasksEntered()).toEqual(['guard']);
    h.runner.stop('test');
  });
  // ...and because that idle is otherwise invisible - the state stays `running`, the stuck
  // detector is deliberately suppressed, and no task enters - a hold at least as long as
  // `stuckAfterMs` says so once, on the tick the hold starts, not on every tick of it.
  test('a cooldown longer than stuckAfterMs is noted in the trace once per hold', async () => {
    const h = harness(script([{ name: 'slow', when: () => true, cooldownMs: 60_000, run: async () => {} }], { stuckAfterMs: 45_000 }), [s()]);
    const held = (): unknown[] => h.trace.events().filter(e => e.kind === 'log' && e.text.includes('is held by its'));
    void h.runner.start();                     // the first pass runs it, which starts the hold
    await h.tick(600);
    expect(held()).toHaveLength(1);
    expect(held()[0]).toMatchObject({ level: 'info', text: 'slow is held by its 60000ms cooldown; the run idles until it is due rather than trying a later task' });
    await h.tick(600); await h.tick(600); await h.tick(600);
    expect(held()).toHaveLength(1);            // three more skipped ticks, still one line
    await h.tick(60_000);                      // due again, so it runs, and is then held afresh
    await h.tick(600);
    expect(held()).toHaveLength(2);
    h.runner.stop('test');
  });
  // A cooldown shorter than the stuck threshold is invisible for less time than the detector
  // would have taken to fire, so it stays out of the trace: one line per hold is still one line
  // every few seconds on a short cooldown.
  test('a cooldown shorter than stuckAfterMs is not noted', async () => {
    const h = harness(script([{ name: 'quick', when: () => true, cooldownMs: 5_000, run: async () => {} }], { stuckAfterMs: 45_000 }), [s()]);
    void h.runner.start();
    for (let k = 0; k < 4; k++) await h.tick(600);
    expect(h.trace.events().some(e => e.kind === 'log' && e.text.includes('is held by its'))).toBe(false);
    h.runner.stop('test');
  });
  // The cooldown clock starts when the task EXITS, not when it is entered, so a task with a long
  // `timeoutMs` and a short cooldown still gets its full cooldown after it finishes. Every other
  // cooldown case here finishes inside one tick, where the two readings are indistinguishable.
  test('the cooldown is counted from when the task exits, not from when it was entered', async () => {
    let release = (): void => {};
    const parked = new Promise<void>(res => { release = res; });
    const run = vi.fn(async () => { if (run.mock.calls.length === 1) await parked; });
    const h = harness(script([{ name: 'slow', when: () => true, cooldownMs: 1_000, run }]), [s()]);
    void h.runner.start();
    await h.tick(600);                        // entered at 600, and parks there
    await h.tick(600); await h.tick(600);     // now is 1800 and it is still inside the same run
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await h.tick(600);                        // now 2400: it exits here, so it is due at 3400
    expect(run).toHaveBeenCalledTimes(1);
    await h.tick(600);                        // now 3000: 600ms since the exit, 2400 since entry
    expect(run).toHaveBeenCalledTimes(1);
    await h.tick(600);                        // now 3600: a full second after the exit
    expect(run).toHaveBeenCalledTimes(2);
    h.runner.stop('test');
  });
  test('a cooldown skip refreshes lastMatchAt, so a long cooldown does not manufacture a stuck pause', async () => {
    // stuckAfterMs is 45 s here. A run whose only matching task is on a 60 s cooldown has a task
    // that matches; it just is not due. Pausing `stuck` there would be a lie.
    const h = harness(script([{ name: 'slow', when: () => true, cooldownMs: 60_000, run: async () => {} }], { stuckAfterMs: 45_000 }), [s()]);
    void h.runner.start();
    await h.tick(600);
    await h.tick(50_000);
    expect(h.runner.status()).toMatchObject({ state: 'running', reason: null });
    expect(h.trace.events().some(e => e.kind === 'stuck')).toBe(false);
    h.runner.stop('test');
  });
  // S8: the floor is a count of hitpoints and its name now says so. `hpBelow` keeps working.
  test('hard stop reads hpBelowPoints, and still honours the deprecated hpBelow', async () => {
    const a = harness(script([{ name: 'a', when: () => true, run: async () => {} }], { hardStop: { hpBelowPoints: 3 } }), [s(), s({ player: { hp: 2, maxHp: 10 } as never })]);
    const doneA = a.runner.start(); await a.tick(); await a.tick();
    expect(await doneA).toBe('failed');
    expect(a.runner.status().reason).toBe('hard-stop');
    expect(a.runner.failReason()).toBe('low_hp');

    const b = harness(script([{ name: 'a', when: () => true, run: async () => {} }], { hardStop: { hpBelow: 3 } }), [s(), s({ player: { hp: 2, maxHp: 10 } as never })]);
    const doneB = b.runner.start(); await b.tick(); await b.tick();
    expect(await doneB).toBe('failed');
    expect(b.runner.status().reason).toBe('hard-stop');
  });
  test('a script that still uses hpBelow is told once, at warn', async () => {
    const h = harness(script([{ name: 'a', when: () => true, run: async () => {} }], { hardStop: { hpBelow: 3 } }), [s()]);
    const said = h.trace.events().filter(e => e.kind === 'log' && e.text.startsWith('hardStop.hpBelow is deprecated'));
    expect(said).toHaveLength(1);
    expect(said[0]).toMatchObject({ level: 'warn', text: 'hardStop.hpBelow is deprecated. Use hpBelowPoints. Removed in api 3.' });
    const q = harness(script([{ name: 'a', when: () => true, run: async () => {} }], { hardStop: { hpBelowPoints: 3 } }), [s()]);
    expect(q.trace.events().some(e => e.kind === 'log' && e.text.includes('deprecated'))).toBe(false);
  });
  // A script that sets both means the new name: the deprecated one is only a fallback.
  test('hpBelowPoints wins over hpBelow when a script sets both', async () => {
    const h = harness(script([{ name: 'a', when: () => true, run: async () => {} }], { hardStop: { hpBelow: 9, hpBelowPoints: 3 } }), [s(), s({ player: { hp: 5, maxHp: 10 } as never })]);
    void h.runner.start(); await h.tick(); await h.tick();
    expect(h.runner.status().reason).toBeNull();
    // It set the deprecated member, so it is still told, whichever one the floor read.
    expect(h.trace.events().some(e => e.kind === 'log' && e.text.startsWith('hardStop.hpBelow is deprecated'))).toBe(true);
    h.runner.stop('test');
  });
  test('a tick that lands while a task is in flight counts as fresh state', async () => {
    let release: (() => void) | null = null;
    const seen: number[] = [];
    const h = harness(script([{ name: 'a', when: st => { seen.push(st.tick); return true; }, run: () => new Promise<void>(res => { release = res; }) }]), [s({ tick: 1 }), s({ tick: 2 }), s({ tick: 3 })]);
    void h.runner.start();
    await h.tick();                       // tick arrives while `a` is still running
    release!(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(seen).toEqual([1, 2]);         // re-evaluated on the newer snapshot without waiting for another tick
  });
});
