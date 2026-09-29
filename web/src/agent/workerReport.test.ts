// What the host is told about a live run, from both ends: `liveStatus` as a pure builder, and
// the Worker actually feeding it. The wiring half drives the Worker through its own message
// port, exactly as `worker.test.ts` does, because the three live fields are worth nothing if the
// runner's state change is the only thing that ever publishes them.
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { endSummary, liveStatus, type EndedRun, type LiveRun } from './workerReport';
import { DEFAULT_BEHAVIOUR } from '../tasks/behaviour';
import { createTrace } from '../tasks/trace';
import type { MainToWorker, WorkerToMain, WorldState } from './types';
import type { RunStatusLite } from '../tasks/runner';
import type { HealthCondition, HealthEvent } from '../tasks/types';

const LITE: RunStatusLite = { state: 'running', reason: null, task: 'chop-nearest', attempts: 1 };

/** A monitor stand-in whose two answers are set separately, because the pip depends on both. */
function monitor(last: HealthEvent | null, active: HealthCondition | null): LiveRun['health'] {
  return { health: { last: () => last, is: c => c === active, recovered: () => {} } };
}

const run = (o: Partial<LiveRun> = {}): LiveRun => ({
  runId: 'r1', startedAt: 1_000, script: { id: 'chop-and-drop', name: 'Chop and drop' },
  health: monitor(null, null), ...o
});

// The row history keeps. Every field is either identity the `run` message carried or a total
// the trace counted, and getting any of them wrong is invisible until someone reads a run back
// weeks later, so each one is pinned separately.
describe('endSummary', () => {
  const ended = (o: Partial<EndedRun> = {}): EndedRun => ({
    runId: 'r1', startedAt: 1_000, script: { id: 'chop-and-drop', name: 'Chop and drop', version: 3 },
    source: 'library', startedBy: 'player', params: { drop: true },
    characterId: 'char-1', characterName: 'Zezima',
    context: { tiles: () => 37 }, health: { counts: () => ({ 'dialog-stuck': 2 }) }, ...o
  });

  /** A trace with something in every total the summary reports, so no two of them can swap. */
  function worked(): ReturnType<typeof createTrace> {
    const t = createTrace();
    t.push({ kind: 'task_enter', task: 'chop' });
    t.push({ kind: 'xp', skill: 'Woodcutting', delta: 120 });
    t.push({ kind: 'item', id: 1511, delta: 4 });
    return t;
  }

  test('carries the identity the run message brought, and the totals the trace counted', () => {
    const summary = endSummary(ended(), worked(), 'done', { at: 11_000, lastTask: 'chop', failReason: null });
    expect(summary).toMatchObject({
      runId: 'r1', scriptId: 'chop-and-drop', scriptName: 'Chop and drop', version: 3,
      source: 'library', startedBy: 'player', characterId: 'char-1', characterName: 'Zezima',
      params: { drop: true }, status: 'done', startedAt: 1_000, endedAt: 11_000, durationMs: 10_000,
      xpGained: { Woodcutting: 120 }, itemsDelta: { 1511: 4 }, tilesTravelled: 37,
      recoveries: { 'dialog-stuck': 2 }, lastTask: 'chop'
    });
  });

  test('the one-line summary is the same one the run_done row carries', () => {
    const summary = endSummary(ended(), worked(), 'done', { at: 11_000, lastTask: 'chop', failReason: null });
    expect(summary.summary).toBe('done after 10s, 1 task, +120 Woodcutting xp');
  });

  test('a run that walked nowhere and recovered from nothing still writes the empty defaults', () => {
    const summary = endSummary(
      ended({ context: { tiles: () => 0 }, health: { counts: () => ({}) }, characterName: null }),
      createTrace(), 'stopped', { at: 2_000, lastTask: null, failReason: null }
    );
    expect(summary).toMatchObject({ itemsDelta: {}, tilesTravelled: 0, recoveries: {}, characterName: null });
  });

  test('a fail reason is set when there is one and absent when there is not', () => {
    const t = createTrace();
    expect(endSummary(ended(), t, 'failed', { at: 2_000, lastTask: null, failReason: 'died' }).failReason).toBe('died');
    expect('failReason' in endSummary(ended(), t, 'done', { at: 2_000, lastTask: null, failReason: null })).toBe(false);
  });
});

describe('liveStatus', () => {
  test('carries the runner half through and names the run', () => {
    const s = liveStatus(LITE, { statusLine: 'Chopping', target: null, run: run(), trace: null, now: 2_000 });
    expect(s).toMatchObject({
      state: 'running', reason: null, task: 'chop-nearest', attempts: 1, statusLine: 'Chopping',
      runId: 'r1', scriptId: 'chop-and-drop', scriptName: 'Chop and drop'
    });
  });

  test('between runs there is no identity, no target, no health and no rate', () => {
    const s = liveStatus(LITE, { statusLine: '', target: null, run: null, trace: null, now: 2_000 });
    expect(s.runId).toBeNull();
    expect(s.scriptId).toBeNull();
    expect(s.scriptName).toBeNull();
    expect(s.target).toBeNull();
    expect(s.health).toBeNull();
    expect(s.xpPerHour).toEqual({});
  });

  test('the target is the one the Worker holds, not one it derives', () => {
    const target = { via: 'sweep' as const, kind: 'tree' as const, name: 'Oak', distance: 12 };
    const s = liveStatus(LITE, { statusLine: '', target, run: run(), trace: null, now: 2_000 });
    expect(s.target).toEqual({ via: 'sweep', kind: 'tree', name: 'Oak', distance: 12 });
  });

  test('xp per hour is the run xp scaled by how long the run has been going', () => {
    const trace = createTrace();
    trace.push({ kind: 'xp', skill: 'Woodcutting', delta: 300 });
    trace.push({ kind: 'xp', skill: 'Firemaking', delta: 50 });
    // 300 xp in six minutes is 3 000 an hour; 50 in the same six minutes is 500.
    const s = liveStatus(LITE, { statusLine: '', target: null, run: run({ startedAt: 0 }), trace, now: 360_000 });
    expect(s.xpPerHour).toEqual({ Woodcutting: 3000, Firemaking: 500 });
  });

  test('a status posted in the run start millisecond reports a number, not Infinity', () => {
    const trace = createTrace();
    trace.push({ kind: 'xp', skill: 'Woodcutting', delta: 1 });
    const s = liveStatus(LITE, { statusLine: '', target: null, run: run({ startedAt: 5_000 }), trace, now: 5_000 });
    expect(s.xpPerHour.Woodcutting).toBe(3_600_000);
    expect(Number.isFinite(s.xpPerHour.Woodcutting)).toBe(true);
  });

  test('the health pip is lit only while the last condition is still the one being recovered', () => {
    const at = 7_000;
    const lit = liveStatus(LITE, {
      statusLine: '', target: null, trace: null, now: 9_000,
      run: run({ health: monitor({ condition: 'dialog-stuck', at }, 'dialog-stuck') })
    });
    expect(lit.health).toEqual({ condition: 'dialog-stuck', since: 7_000 });
    // The same last event, no longer active: the monitor has settled it and the pip goes out.
    const settled = liveStatus(LITE, {
      statusLine: '', target: null, trace: null, now: 9_000,
      run: run({ health: monitor({ condition: 'dialog-stuck', at }, null) })
    });
    expect(settled.health).toBeNull();
  });
});

// ---- the Worker's half --------------------------------------------------------------
const posted: WorkerToMain[] = [];
const send = (m: MainToWorker): void => {
  const handler = (self as unknown as { onmessage: ((e: MessageEvent) => void) | null }).onmessage;
  if (!handler) throw new Error('worker installed no message handler');
  handler({ data: m } as MessageEvent);
};
const WAIT = { timeout: 10_000, interval: 10 };
const statuses = (): Extract<WorkerToMain, { t: 'status' }>[] =>
  posted.filter((m): m is Extract<WorkerToMain, { t: 'status' }> => m.t === 'status');

/**
 * A snapshot with an oak standing four tiles away. `c.find.nearest` answers layer 1 from the
 * snapshot alone at the default 15-tile radius, so this needs neither the atlas nor an RPC the
 * test would have to answer.
 */
const SCENE = {
  tick: 9, inGame: true, player: { animId: -1, worldX: 3200, worldZ: 3200, level: 0 }, skills: [], inventory: [],
  nearbyLocs: [{ id: 1, name: 'Oak', x: 3204, z: 3200, level: 0, distance: 4, options: ['Chop down'], reachable: true }]
} as unknown as WorldState;

/** Finds a tree, then parks: the run has a target and no reason of its own to publish again. */
const FIND_SCRIPT = `
export default defineScript({
  id: 'find-script', name: 'Find', version: 1, description: 'reports what it is working on',
  tasks: [{
    name: 'look', when: () => true, timeoutMs: 60000,
    run: async c => {
      await c.find.nearest('tree');
      await c.wait.until(() => false, { timeoutMs: 60000 });
      return { success: true, message: 'ok' };
    }
  }]
});
`;

/** Parks and nothing else: it never asks `c.find` for anything, so it has no target of its own. */
const PARK_SCRIPT = `
export default defineScript({
  id: 'park-script', name: 'Park', version: 1, description: 'parks',
  tasks: [{
    name: 'park', when: () => true, timeoutMs: 60000,
    run: async c => { await c.wait.until(() => false, { timeoutMs: 60000 }); return { success: true, message: 'ok' }; }
  }]
});
`;

beforeAll(async () => {
  vi.stubGlobal('postMessage', (m: WorkerToMain) => { posted.push(m); });
  await import('./worker');
}, 60_000);

describe('the status the Worker publishes', () => {
  test('a target the run found reaches the host, and the xp rate is filled from the run trace', async () => {
    posted.length = 0;
    send({ t: 'state', state: SCENE });
    send({ t: 'run', runId: 'run-live', scriptRef: { kind: 'user', code: FIND_SCRIPT }, params: {}, startedBy: 'player', characterId: null, characterName: null, behaviour: DEFAULT_BEHAVIOUR });
    // Nothing about finding a tree moves the runner's state, so this can only arrive if the
    // trace subscription publishes a status of its own for a `target` event. `via` is the layer
    // that answered, carried from the trace event: the oak is in the snapshot, so layer 1.
    await vi.waitFor(() => expect(statuses().some(m => m.status.target !== null)).toBe(true), WAIT);
    expect(statuses().at(-1)?.status.target).toEqual({ via: 'scene', kind: 'tree', name: 'Oak', distance: 4 });

    send({ t: 'event', event: { name: 'xp', payload: { skill: 8, xp: 100, level: 1, delta: 25 } } });
    send({ t: 'pause', reason: 'claude', by: 'claude' });
    const last = statuses().at(-1);
    expect(last?.status.state).toBe('paused');
    expect(last?.status.xpPerHour.Woodcutting).toBeGreaterThan(0);
    expect(last?.status.target).toEqual({ via: 'scene', kind: 'tree', name: 'Oak', distance: 4 });
    expect(last?.status.health).toBeNull();

    send({ t: 'stop', by: 'test' });
    await vi.waitFor(() => expect(posted.some(m => m.t === 'run_end')).toBe(true), WAIT);
  });

  test('xp landing on its own republishes the rate, with no runner state change behind it', async () => {
    posted.length = 0;
    send({ t: 'state', state: SCENE });
    send({ t: 'run', runId: 'run-xp', scriptRef: { kind: 'user', code: PARK_SCRIPT }, params: {}, startedBy: 'player', characterId: null, characterName: null, behaviour: DEFAULT_BEHAVIOUR });
    await vi.waitFor(() => expect(statuses().some(m => m.status.runId === 'run-xp')).toBe(true), WAIT);
    // `PARK_SCRIPT` sits in one `wait.until` for a minute: it publishes no status line, finds
    // nothing, and the runner's own state does not move again. So the only thing that can post
    // a status from here is the xp row itself.
    const before = statuses().length;
    send({ t: 'event', event: { name: 'xp', payload: { skill: 8, xp: 100, level: 1, delta: 25 } } });
    await vi.waitFor(() => expect(statuses().length).toBeGreaterThan(before), WAIT);
    expect(statuses().at(-1)?.status.xpPerHour.Woodcutting).toBeGreaterThan(0);

    send({ t: 'stop', by: 'test' });
    await vi.waitFor(() => expect(posted.some(m => m.t === 'run_end')).toBe(true), WAIT);
  });

  // The oak is still standing in the scene, so a target on this run could only be the last
  // run's: nothing in `PARK_SCRIPT` ever asks `c.find` for one.
  test('the next run does not inherit the last run target', async () => {
    posted.length = 0;
    send({ t: 'state', state: SCENE });
    send({ t: 'run', runId: 'run-clean', scriptRef: { kind: 'user', code: PARK_SCRIPT }, params: {}, startedBy: 'player', characterId: null, characterName: null, behaviour: DEFAULT_BEHAVIOUR });
    await vi.waitFor(() => expect(statuses().some(m => m.status.runId === 'run-clean')).toBe(true), WAIT);
    send({ t: 'stop', by: 'test' });
    await vi.waitFor(() => expect(posted.some(m => m.t === 'run_end')).toBe(true), WAIT);
    expect(statuses().every(m => m.status.target === null)).toBe(true);
  });
});
