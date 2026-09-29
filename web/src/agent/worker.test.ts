// The Worker entry cannot be spawned under jsdom, so this drives it through its own
// message port: `self.postMessage` is stubbed before the module is imported, and the
// handler the module installs on `self.onmessage` is called directly.
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { DEFAULT_BEHAVIOUR } from '../tasks/behaviour';
import { SCRIPT_CONTEXT_KEYS } from '../tasks/scriptApiKeys';
import type { MainToWorker, WorkerToMain, WorldState } from './types';
import type { TraceEvent } from '../tasks/types';

const posted: WorkerToMain[] = [];

function send(m: MainToWorker): void {
  const handler = (self as unknown as { onmessage: ((e: MessageEvent) => void) | null }).onmessage;
  if (!handler) throw new Error('worker installed no message handler');
  handler({ data: m } as MessageEvent);
}

/**
 * `vi.waitFor` defaults to a 1 s deadline, which the runner's real timers miss when this suite
 * shares the machine with the client's (two `waitFor`s here failed that way, and passed on
 * their own). The polling interval, not the deadline, decides how long a passing test takes.
 */
const WAIT = { timeout: 10_000, interval: 10 };

const found = <T extends WorkerToMain['t']>(t: T): Extract<WorkerToMain, { t: T }> | undefined =>
  posted.find(m => m.t === t) as Extract<WorkerToMain, { t: T }> | undefined;

const WORLD = { tick: 7, inGame: true, player: { animId: -1 }, skills: [], inventory: [] } as unknown as WorldState;

/** The same world with the character dead. */
const DEAD = { tick: 8, inGame: true, player: { animId: -1, worldX: 1, worldZ: 1, isDead: true, lifeId: 1 }, skills: [], inventory: [] } as unknown as WorldState;

/** A snapshot with the player somewhere, which is what the run anchor seeds from. */
const standing = (tick: number, worldX: number, worldZ: number): WorldState =>
  ({ tick, inGame: true, player: { animId: -1, worldX, worldZ }, skills: [], inventory: [] } as unknown as WorldState);

const logged = (): string[] =>
  posted.flatMap(m => (m.t === 'trace' && m.event.kind === 'log' ? [m.event.text] : []));

const USER_SCRIPT = `
export default defineScript({
  id: 'unit-script', name: 'Unit script', version: 2, description: 'ends at once',
  tasks: [{ name: 'noop', when: () => false, run: async () => ({ success: true, message: 'ok' }) }],
  until: () => true
});
`;

const PARKED_SCRIPT = `
export default defineScript({
  id: 'parked-script', name: 'Parked', version: 1, description: 'parks on a wait',
  tasks: [{
    name: 'park', when: () => true, timeoutMs: 60000,
    run: async c => { await c.wait.until(() => false, { timeoutMs: 60000 }); return { success: true, message: 'unparked' }; }
  }]
});
`;

/**
 * Spec 3.1's acceptance criterion, end to end: a 1 s task timeout against a 60 s wait. The
 * runner's per-task controller only reaches this wait through `setSignal` and the context's
 * `() => taskSignal ?? abort.signal`, so the timeout can only land if both are wired.
 */
const TIMEOUT_SCRIPT = `
export default defineScript({
  id: 'timeout-script', name: 'Timeout', version: 1, description: 'parks past its task timeout',
  tasks: [{
    name: 'parked', when: () => true, timeoutMs: 1000,
    run: async c => { await c.wait.until(() => false, { timeoutMs: 60000 }); return { success: true, message: 'unparked' }; }
  }]
});
`;

/**
 * Parks like `PARKED_SCRIPT`, and declares `onDeath: 'fail'` so its death recovery refuses at
 * once rather than sitting on a 60 s respawn wait no test snapshot would ever satisfy.
 */
const DEATH_SCRIPT = `
export default defineScript({
  id: 'death-script', name: 'Death', version: 1, description: 'parks, and gives up on a death',
  health: { onDeath: 'fail' },
  tasks: [{
    name: 'park', when: () => true, timeoutMs: 60000,
    run: async c => { await c.wait.until(() => false, { timeoutMs: 60000 }); return { success: true, message: 'unparked' }; }
  }]
});
`;

const CUSTOM_REQ_SCRIPT = `
export default defineScript({
  id: 'needs-tick', name: 'Needs a later tick', version: 1, description: 'has a custom requirement',
  requires: [{ kind: 'custom', test: s => s.tick > 100, text: 'needs tick over 100' }],
  tasks: [{ name: 'noop', when: () => true, run: async () => ({ success: true, message: 'ok' }) }]
});
`;

/**
 * Parks until a later snapshot arrives, then reads the anchor. The wait is the point: it puts
 * the first read *after* `startRun`, which is the only way to see whether the anchor seeded
 * lazily from the live snapshot or eagerly from whatever was there when the run began.
 */
const ANCHOR_SCRIPT = `
export default defineScript({
  id: 'anchor-script', name: 'Anchor', version: 1, description: 'reads and moves the run anchor',
  tasks: [{
    name: 'move', when: () => true, timeoutMs: 20000,
    run: async c => {
      await c.wait.until(s => s.tick === 999, { timeoutMs: 15000 });
      c.log('seeded ' + JSON.stringify(c.anchor()));
      c.log('moved ' + JSON.stringify(c.anchor(1111, 2222)));
      c.memory.set('done', true);
      return { success: true, message: 'ok' };
    }
  }],
  until: (s, c) => c.memory.get('done') === true
});
`;

/**
 * The same script, with the manifest saying where home is, and its own move written in the
 * compliant tile form: the only thing left that could put a deprecation notice in this run's
 * log is the runtime's own call installing the declared anchor.
 */
const DECLARED_ANCHOR_SCRIPT = ANCHOR_SCRIPT
  .replace("id: 'anchor-script'", "id: 'declared-anchor'")
  .replace('c.anchor(1111, 2222)', 'c.anchor({ x: 1111, z: 2222 })')
  .replace("description: 'reads and moves the run anchor',", "description: 'declares where home is', anchor: { x: 2500, z: 2600 },");

const runMsg = (runId: string, code: string): MainToWorker =>
  ({ t: 'run', runId, scriptRef: { kind: 'user', code }, params: {}, startedBy: 'player', characterId: null, characterName: null, behaviour: DEFAULT_BEHAVIOUR });

// The default 10 s hook timeout is not enough on a loaded machine: importing the worker pulls in
// the whole runtime (quickjs included) and Vitest transforms it on the spot.
beforeAll(async () => {
  vi.stubGlobal('postMessage', (m: WorkerToMain) => { posted.push(m); });
  await import('./worker');
}, 60_000);

describe('the script worker', () => {
  test('announces itself when the module loads', () => {
    expect(found('ready')).toEqual({ t: 'ready' });
  });

  test('compiles user script code and answers with its manifest', () => {
    send({ t: 'compile', callId: 'k1', code: USER_SCRIPT });
    expect(found('compile_result')).toMatchObject({ callId: 'k1', ok: true, manifest: { id: 'unit-script', name: 'Unit script', version: 2 } });
  });

  test('reports a compile failure with its message', () => {
    posted.length = 0;
    send({ t: 'compile', callId: 'k2', code: 'export default defineScript({ id: "BAD" })' });
    expect(found('compile_result')).toMatchObject({ callId: 'k2', ok: false });
    expect(found('compile_result')?.message).toBeTruthy();
  });

  test('runs a snippet against the live context and captures its logs', async () => {
    posted.length = 0;
    send({ t: 'state', state: WORLD });
    send({ t: 'execute', callId: 'x1', code: 'log("from the snippet"); return state().tick + params.bump;', params: { bump: 1 } });
    await vi.waitFor(() => expect(found('execute_result')).toBeTruthy(), WAIT);
    expect(found('execute_result')).toMatchObject({ callId: 'x1', ok: true, value: 8, logs: ['from the snippet'] });
  });

  test('a snippet that throws is reported, not swallowed', async () => {
    posted.length = 0;
    send({ t: 'execute', callId: 'x2', code: 'throw new Error("nope")', params: {} });
    await vi.waitFor(() => expect(found('execute_result')).toBeTruthy(), WAIT);
    expect(found('execute_result')).toMatchObject({ callId: 'x2', ok: false, error: 'nope' });
  });

  test('a run traces run_started, reports status and ends with run_end', async () => {
    posted.length = 0;
    send({ t: 'run', runId: 'run-1', scriptRef: { kind: 'user', code: USER_SCRIPT }, params: {}, startedBy: 'player', characterId: 'char-1', characterName: 'Zezima', behaviour: DEFAULT_BEHAVIOUR });
    send({ t: 'state', state: WORLD });
    await vi.waitFor(() => expect(found('run_end')).toBeTruthy(), WAIT);

    const started = posted.find(m => m.t === 'trace' && m.event.kind === 'run_started');
    expect(started).toBeTruthy();
    expect(found('run_end')).toMatchObject({
      runId: 'run-1', outcome: 'done',
      summary: {
        scriptId: 'unit-script', scriptName: 'Unit script', version: 2, source: 'user', status: 'done',
        // The identity the `run` message carried, and the empty defaults a run that walked
        // nowhere and recovered from nothing still writes: history never has to branch on age.
        startedBy: 'player', characterId: 'char-1', characterName: 'Zezima',
        itemsDelta: {}, tilesTravelled: 0, recoveries: {}
      }
    });
    const done = posted.find(m => m.t === 'trace' && m.event.kind === 'run_done');
    expect(done).toBeTruthy();
    expect(posted.some(m => m.t === 'status' && m.status.runId === 'run-1')).toBe(true);
  });

  test('an unknown library script ends the run instead of hanging', async () => {
    posted.length = 0;
    send({ t: 'run', runId: 'run-2', scriptRef: { kind: 'library', id: 'does-not-exist' }, params: {}, startedBy: 'claude', characterId: null, characterName: null, behaviour: DEFAULT_BEHAVIOUR });
    await vi.waitFor(() => expect(found('run_end')).toBeTruthy(), WAIT);
    expect(found('run_end')).toMatchObject({ runId: 'run-2', outcome: 'failed' });
    expect(found('run_end')?.summary.summary).toMatch(/does-not-exist/);
  });

  test('xp, inventory and action hook events become trace deltas only while a run owns the trace', async () => {
    posted.length = 0;
    send({ t: 'event', event: { name: 'xp', payload: { skill: 8, xp: 100, level: 1, delta: 25 } } });
    expect(posted.filter(m => m.t === 'trace')).toHaveLength(0);

    send({ t: 'run', runId: 'run-3', scriptRef: { kind: 'user', code: USER_SCRIPT.replace('until: () => true', 'until: s => s.tick > 900') }, params: {}, startedBy: 'player', characterId: null, characterName: null, behaviour: DEFAULT_BEHAVIOUR });
    await vi.waitFor(() => expect(posted.some(m => m.t === 'trace' && m.event.kind === 'run_started')).toBe(true), WAIT);
    send({ t: 'event', event: { name: 'xp', payload: { skill: 8, xp: 100, level: 1, delta: 25 } } });
    send({ t: 'event', event: { name: 'inventory', payload: { added: [{ id: 1511, count: 2 }], removed: [{ id: 946, count: 1 }] } } });
    send({ t: 'event', event: { name: 'action', payload: { id: 'a1', action: { type: 'talkToNpc', npcIndex: 3, reason: 'test' }, result: { success: false, message: 'too far', reason: 'cant_reach' } } } });
    // A snippet is refused while the run holds the game (spec section 8).
    send({ t: 'execute', callId: 'x3', code: 'return 1', params: {} });
    expect(found('execute_result')).toMatchObject({ callId: 'x3', ok: false, error: 'run_active', logs: [] });
    const traced = posted.filter(m => m.t === 'trace').map(m => m.event);
    expect(traced.some(e => e.kind === 'xp' && e.skill === 'Woodcutting' && e.delta === 25)).toBe(true);
    expect(traced.some(e => e.kind === 'item' && e.id === 1511 && e.delta === 2)).toBe(true);
    expect(traced.some(e => e.kind === 'item' && e.id === 946 && e.delta === -1)).toBe(true);
    expect(traced.some(e => e.kind === 'action' && e.action === 'talkToNpc' && !e.ok && e.reason === 'cant_reach')).toBe(true);

    // Pause, resume and stop all round-trip through the runner that run owns.
    send({ t: 'pause', reason: 'claude', by: 'claude' });
    send({ t: 'resume', by: 'player' });
    expect(found('resume_result')).toMatchObject({ ok: true });
    send({ t: 'stop', by: 'player' });
    await vi.waitFor(() => expect(found('run_end')).toBeTruthy(), WAIT);
    expect(found('run_end')).toMatchObject({ runId: 'run-3', outcome: 'stopped' });
  });

  test('a task parked on wait.until ends the run promptly when stop arrives', async () => {
    posted.length = 0;
    send({ t: 'state', state: WORLD });
    send(runMsg('run-4', PARKED_SCRIPT));
    await vi.waitFor(() => expect(posted.some(m => m.t === 'trace' && m.event.kind === 'task_enter')).toBe(true), WAIT);
    // The wait would otherwise hold the run for its own 60 s timeout, far past the
    // host's 2 s stop grace, and the host would have to kill the worker instead. The
    // bound is that grace, not a tighter number a loaded machine could miss.
    const at = Date.now();
    send({ t: 'stop', by: 'player' });
    await vi.waitFor(() => expect(found('run_end')).toBeTruthy(), WAIT);
    expect(Date.now() - at).toBeLessThan(2000);
    expect(found('run_end')).toMatchObject({ runId: 'run-4', outcome: 'stopped' });
  });

  test('a pause while a task is parked cancels the client queue', async () => {
    posted.length = 0;
    send({ t: 'state', state: WORLD });
    send(runMsg('run-pause', PARKED_SCRIPT));
    await vi.waitFor(() => expect(posted.some(m => m.t === 'trace' && m.event.kind === 'task_enter')).toBe(true), WAIT);
    // The host owns the client; the Worker asks for the drain by message. Without it a pause
    // leaves the queued actions of the aborted task to run on into the player's hands.
    expect(posted.some(m => m.t === 'cancel')).toBe(false);
    send({ t: 'pause', reason: 'player', by: 'player' });
    expect(posted.some(m => m.t === 'cancel')).toBe(true);
    send({ t: 'stop', by: 'player' });
    await vi.waitFor(() => expect(found('run_end')).toBeTruthy(), WAIT);
  });

  test('a task timeout unparks the wait it is on, with no stop message involved', async () => {
    posted.length = 0;
    send({ t: 'state', state: WORLD });
    send(runMsg('run-timeout', TIMEOUT_SCRIPT));
    // No `stop` here: the run-level signal is never aborted, so the only thing that can end
    // this wait is the runner's own task controller reaching the context.
    await vi.waitFor(() => expect(posted.some(m => m.t === 'trace' && m.event.kind === 'task_exit')).toBe(true), WAIT);
    const exit = posted.find(m => m.t === 'trace' && m.event.kind === 'task_exit');
    expect(exit).toMatchObject({ t: 'trace', event: { task: 'parked', outcome: 'timeout' } });
    expect(posted.some(m => m.t === 'cancel')).toBe(true);
    send({ t: 'stop', by: 'player' });
    await vi.waitFor(() => expect(found('run_end')).toBeTruthy(), WAIT);
  });

  test('a second run arriving before the first has started is refused, and the first survives', async () => {
    posted.length = 0;
    send({ t: 'state', state: WORLD });
    send(runMsg('run-5', PARKED_SCRIPT));
    send(runMsg('run-6', PARKED_SCRIPT));            // same turn: run-5 is still resolving
    await vi.waitFor(() => expect(found('run_end')).toBeTruthy(), WAIT);
    expect(found('run_end')).toMatchObject({ runId: 'run-6', outcome: 'failed' });
    expect(found('run_end')?.summary.summary).toMatch(/already active/);

    await vi.waitFor(() => expect(posted.some(m => m.t === 'trace' && m.event.kind === 'task_enter')).toBe(true), WAIT);
    send({ t: 'stop', by: 'player' });
    await vi.waitFor(() => expect(posted.filter(m => m.t === 'run_end')).toHaveLength(2), WAIT);
    expect(posted.filter(m => m.t === 'run_end')[1]).toMatchObject({ runId: 'run-5', outcome: 'stopped' });
  });

  test('a failing custom requirement fails the run instead of entering its tasks', async () => {
    posted.length = 0;
    send({ t: 'state', state: WORLD });                 // tick 7, so `s.tick > 100` is false
    send(runMsg('run-7', CUSTOM_REQ_SCRIPT));
    await vi.waitFor(() => expect(found('run_end')).toBeTruthy(), WAIT);
    expect(found('run_end')).toMatchObject({ runId: 'run-7', outcome: 'failed' });
    expect(found('run_end')?.summary.summary).toMatch(/needs tick over 100/);
    expect(posted.some(m => m.t === 'trace' && m.event.kind === 'task_enter')).toBe(false);
  });

  test('a death ends a run whose policy is onDeath: fail, taking the game from a parked task', async () => {
    posted.length = 0;
    send({ t: 'state', state: WORLD });
    send(runMsg('run-death', DEATH_SCRIPT));
    await vi.waitFor(() => expect(posted.some(m => m.t === 'trace' && m.event.kind === 'task_enter')).toBe(true), WAIT);
    const traced = (): TraceEvent[] => posted.flatMap(m => (m.t === 'trace' ? [m.event] : []));
    // The task is parked on a 60 s wait. The monitor sees the death on this message, and the
    // recovery has to take the game from it rather than wait the whole thing out.
    const at = Date.now();
    send({ t: 'state', state: DEAD });
    await vi.waitFor(() => expect(found('run_end')).toBeTruthy(), WAIT);
    expect(Date.now() - at).toBeLessThan(2000);
    expect(traced().some(e => e.kind === 'task_enter' && e.task === 'recover:death')).toBe(true);
    expect(found('run_end')).toMatchObject({ runId: 'run-death', outcome: 'failed' });
    expect(traced().some(e => e.kind === 'health' && e.condition === 'death')).toBe(true);
    expect(traced().some(e => e.kind === 'recovery' && e.condition === 'death' && e.outcome === 'failed')).toBe(true);
    // The banner's health pip, from the real monitor: lit while the death is the condition being
    // recovered from, and carrying the moment it fired.
    const pip = posted.flatMap(m => (m.t === 'status' && m.status.health ? [m.status.health] : []));
    expect(pip.map(p => p.condition)).toContain('death');
    expect(pip.every(p => p.since >= at)).toBe(true);
    // `onDeath: 'fail'` is the script saying a death ends the run, so the ladder skips its
    // `re-anchor` rung and one death is enough.
    expect(traced().some(e => e.kind === 'log' && e.text === 'run failed: died')).toBe(true);
    expect(found('run_end')?.summary.recoveries).toEqual({ death: 1 });
  });

  test('the monitor stops observing when the run ends', async () => {
    posted.length = 0;
    send({ t: 'state', state: WORLD });
    send(runMsg('run-health-teardown', USER_SCRIPT));      // ends by itself
    await vi.waitFor(() => expect(found('run_end')).toBeTruthy(), WAIT);
    posted.length = 0;
    // A death and a logout after the run is over. The subscriptions the monitor opened are on
    // the Worker's own fan-outs, which outlive every run, and the trace it would write into is
    // still wired to `post` - so a monitor that kept observing would be visible right here.
    send({ t: 'state', state: DEAD });
    send({ t: 'event', event: { name: 'logout', payload: {} } });
    await Promise.resolve();
    expect(posted.filter(m => m.t === 'trace' && (m.event.kind === 'health' || m.event.kind === 'recovery'))).toEqual([]);
  });

  test('every declared context member is reachable from a snippet, with no hand-maintained list', async () => {
    // A member missing from the snippet's destructuring list exists and is unreachable: `typeof`
    // on an unbound name reads 'undefined' rather than throwing. The list is generated from the
    // declared surface now, so this asks the Worker whether the two agree, in one string so that
    // a failure names the member. `health.is` is the inert one: a snippet has no run behind it.
    const names = Object.keys(SCRIPT_CONTEXT_KEYS);
    expect(names).toHaveLength(17);
    posted.length = 0;
    send({ t: 'state', state: WORLD });
    const probe = `return [${names.map(n => `typeof ${n} === 'undefined' ? '${n}' : null`).join(',')}].filter(Boolean).join(',') + '|' + health.is('death');`;
    send({ t: 'execute', callId: 'x4', code: probe, params: {} });
    await vi.waitFor(() => expect(found('execute_result')).toBeTruthy(), WAIT);
    expect(found('execute_result')).toMatchObject({ callId: 'x4', ok: true, value: '|false' });
  });

  test('the run anchor seeds on first read, and a second run does not inherit the first', async () => {
    posted.length = 0;
    send({ t: 'state', state: WORLD });                     // no position on this snapshot yet
    send(runMsg('run-anchor-1', ANCHOR_SCRIPT));
    await vi.waitFor(() => expect(posted.some(m => m.t === 'trace' && m.event.kind === 'task_enter')).toBe(true), WAIT);
    send({ t: 'state', state: standing(999, 3200, 3300) }); // arrives after the run started
    await vi.waitFor(() => expect(found('run_end')).toBeTruthy(), WAIT);
    expect(found('run_end')).toMatchObject({ runId: 'run-anchor-1', outcome: 'done' });
    expect(logged()).toContain('seeded {"x":3200,"z":3300,"level":0}');
    expect(logged()).toContain('moved {"x":1111,"z":2222,"level":0}');
    // The script text above reaches `anchor` by string in its deprecated positional form, which
    // is how every saved script that ever set one is written. It still works, and the player
    // watching the run is told once that it is going away.
    expect(logged()).toContain('c.anchor(x, z) is deprecated. Use c.anchor({ x, z }). Removed in api 3.');

    posted.length = 0;
    send({ t: 'state', state: standing(1, 3400, 3500) });
    send(runMsg('run-anchor-2', ANCHOR_SCRIPT));
    await vi.waitFor(() => expect(posted.some(m => m.t === 'trace' && m.event.kind === 'task_enter')).toBe(true), WAIT);
    send({ t: 'state', state: standing(999, 3400, 3500) });
    await vi.waitFor(() => expect(found('run_end')).toBeTruthy(), WAIT);
    // The anchor the first run moved to 1111, 2222 is gone: this run seeds from its own player.
    expect(logged()).toContain('seeded {"x":3400,"z":3500,"level":0}');
  });

  test('a script that declares an anchor overrides the lazy seed', async () => {
    // Every `re-anchor` rung of the recovery ladder walks to this tile, so a declared home has to
    // beat the player's position at the moment the anchor is first read.
    posted.length = 0;
    send({ t: 'state', state: standing(1, 3400, 3500) });
    send(runMsg('run-anchor-3', DECLARED_ANCHOR_SCRIPT));
    await vi.waitFor(() => expect(posted.some(m => m.t === 'trace' && m.event.kind === 'task_enter')).toBe(true), WAIT);
    send({ t: 'state', state: standing(999, 3400, 3500) });
    await vi.waitFor(() => expect(found('run_end')).toBeTruthy(), WAIT);
    expect(logged()).toContain('seeded {"x":2500,"z":2600,"level":0}');
    // A run whose script never writes the positional call must hear nothing: a notice blaming a
    // player for a call the runtime made is worse than no notice at all.
    expect(logged().filter(t => t.startsWith('c.anchor(x, z) is deprecated'))).toEqual([]);
  });

  test('resume with no run reports not_paused', () => {
    posted.length = 0;
    send({ t: 'resume', by: 'claude' });
    expect(found('resume_result')).toEqual({ t: 'resume_result', ok: false, reason: 'not_paused' });
  });
});
