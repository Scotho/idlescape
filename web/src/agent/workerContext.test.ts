import { describe, expect, test, vi } from 'vitest';
import { createWorkerContext } from './workerContext';
import { transportMembers } from './workerContext.harness';
import { createTrace, type Trace } from '../tasks/trace';
import { createDeprecations } from '../tasks/deprecate';
import { createAttachments } from '../tasks/attachments';
import type { Transport, WorldState } from './types';
import type { Atlas, Tile, TileLike } from '../tasks/types';

const ATLAS: Atlas = {
  version: 1, source: { contentSha: 'x' },
  kinds: {} as Atlas['kinds'], clusters: [],
  landmarks: [
    // `travel` only follows a route from its own `from` end, so that end has to be a landmark
    // the atlas knows and one the fake player is standing on.
    { id: 'here', kind: 'town', name: 'Here', level: 0, x: 3200, z: 3200 },
    { id: 'shed', kind: 'town', name: 'Shed', level: 0, x: 3204, z: 3200 }
  ],
  routes: [{ from: 'here', to: 'shed', level: 0, waypoints: [
    { kind: 'interact', locName: 'Door', op: 'Open', x: 3201, z: 3200 },
    { kind: 'walk', x: 3204, z: 3200 }
  ] }]
};

function fakeWorld(patch: Partial<WorldState> = {}): WorldState {
  return {
    tick: 1,
    inGame: true,
    player: { name: 'me', animId: -1, hp: 10, x: 3200, z: 3200 },
    skills: [{ name: 'Woodcutting', level: 1, baseLevel: 1, experience: 100 }],
    inventory: [{ slot: 0, id: 1511, name: 'Logs', count: 2, optionsWithIndex: [] }],
    nearbyNpcs: [],
    nearbyLocs: [],
    gameMessages: [],
    recentDialogs: [],
    dialog: { isOpen: false, options: [], isWaiting: false },
    interface: { isOpen: false, interfaceId: -1, options: [] },
    hint: { kind: 'none' },
    tutorial: { open: true, title: 'Getting Started', lines: [] },
    ...patch
  } as unknown as WorldState;
}

const loc = (name: string, x: number, z: number): unknown =>
  ({ id: 1, name, x, z, level: 0, distance: 1, options: ['Open'], optionsWithIndex: [{ opIndex: 1, text: 'Open' }] });

/** A world with a positioned player, which `travel` reads, and the locs it can see. */
function standing(nearbyLocs: unknown[] = []): WorldState {
  return fakeWorld({
    player: { name: 'me', animId: -1, hp: 10, x: 3200, z: 3200, worldX: 3200, worldZ: 3200, level: 0 },
    nearbyLocs
  } as unknown as Partial<WorldState>);
}

/**
 * A world whose chatbox is showing an option-less frame, which is what `clickThrough` clicks
 * past. `realChoices` filters "Click here to continue" out, so this frame offers nothing to
 * decide and the loop keeps going.
 */
function chatting(): WorldState {
  return fakeWorld({
    dialog: { isOpen: true, options: [{ index: 0, text: 'Click here to continue' }], isWaiting: false }
  });
}

function harness(initial: WorldState = fakeWorld()) {
  let state = initial;
  const stateSubs = new Set<(s: WorldState) => void>();
  const ticks = new Set<() => void>();
  const spies = {
    getState: () => state,
    onState: (cb: (s: WorldState) => void) => { stateSubs.add(cb); return () => { stateSubs.delete(cb); }; },
    onEvent: () => () => {},
    dispatch: vi.fn(async () => ({ success: true, message: 'ok' })),
    say: vi.fn(async () => ({ success: true, message: 'ok' })),
    echo: vi.fn(),
    screenshot: vi.fn(async () => new Blob()),
    relogin: vi.fn(async () => ({ ok: true })),
    logout: vi.fn(),
    cancel: vi.fn(),
    humanInput: () => () => {}
  };
  const transport = spies as unknown as Transport;
  const trace = createTrace();
  const abort = new AbortController();
  // An accessor, not a fixed signal: `live` is what the runner swaps between tasks, and the
  // context has to read it per call rather than capture it once.
  let live: AbortSignal = abort.signal;
  let anchor: Tile = { x: 0, z: 0, level: 0 };
  const health = { is: (c: string) => c === 'death', last: () => null, recovered: vi.fn() };
  const { ctx, tiles, dispose } = createWorkerContext({
    transport, trace, params: { mode: 'chop' }, signal: () => live,
    onTick: cb => { ticks.add(cb); return () => { ticks.delete(cb); }; },
    atlas: {
      load: async () => ATLAS, peek: () => ATLAS, nearestCluster: () => null,
      landmark: (a, id) => a.landmarks.find(l => l.id === id) ?? null
    },
    collision: { load: async () => true, ready: () => true },
    // The dependency's real shape, not a two-field stand-in: an argument this fake ignored
    // would fail an assertion about the code under test on the harness instead. That includes
    // `makeAnchor`'s rule for an omitted level, which is the plane the player is on and not 0.
    anchor: (a?: TileLike | number, z?: number): Tile => {
      const here = state.player?.level ?? 0;
      if (typeof a === 'object' && a !== null) anchor = { x: a.x, z: a.z, level: a.level ?? here };
      else if (typeof a === 'number' && z !== undefined) anchor = { x: a, z, level: here };
      return { ...anchor };
    },
    deprecations: createDeprecations(text => trace.push({ kind: 'log', level: 'warn', text })),
    attachments: createAttachments(),
    runId: 'run-1',
    health
  });
  const push = (next: WorldState): void => { state = next; for (const cb of stateSubs) cb(next); };
  const tick = (): void => { for (const cb of [...ticks]) cb(); };
  const setSignal = (s: AbortSignal): void => { live = s; };
  return { ctx, tiles, dispose, trace, push, tick, abort, setSignal, transport, spies, stateSubs };
}

describe('createWorkerContext', () => {
  test('the transport a script can reach through the sdk refuses relogin and logout', async () => {
    const { ctx, spies, trace } = harness();
    // `BotSDK` holds its transport as a TypeScript parameter property, which is an ordinary own
    // property once the types are stripped: `private` is not a runtime fence, and `sdk` is on
    // `ScriptContext` and in the snippet destructure list. So this IS reachable from script code,
    // and it has to refuse rather than forward - a script must not log the account in and out.
    const reached = (ctx.sdk as unknown as { transport: Transport }).transport;
    expect(await reached.relogin()).toEqual({ ok: false, reason: 'not available to script code' });
    expect(spies.relogin).not.toHaveBeenCalled();
    // `logout` returns void, so its refusal is a trace line rather than a result: a script author
    // whose call did nothing at all would have nothing to read.
    reached.logout();
    expect(spies.logout).not.toHaveBeenCalled();
    expect(trace.events().at(-1)).toMatchObject({ kind: 'log', level: 'warn', text: expect.stringContaining('not available to script code') });
  });

  test('relogin and logout are the only Transport members refused for script code', () => {
    const { ctx, transport } = harness();
    const reached = (ctx.sdk as unknown as { transport: Transport }).transport;
    // Deliberately NOT `Object.keys(transport)`: every transport fake in this repo is an
    // `as unknown as Transport` double cast, so a fake missing a new member would make this test
    // pass by not looking at it. `transportMembers()` comes from a `Record<keyof Transport, true>`
    // in a file tsconfig compiles, so a member added to `Transport` and not to that list breaks
    // typecheck instead. The fake is asserted complete against it first, for the same reason.
    const members = transportMembers();
    expect(Object.keys(transport).sort()).toEqual(members);
    const swapped = members.filter(k => reached[k] !== transport[k]);
    // `onState` is swapped for the disposal-tracking wrapper rather than refused. `scoped` spreads
    // the real transport, so a new member reaches script code by default: this list is what makes
    // leaving it reachable a decision someone made rather than an oversight nobody saw.
    expect(swapped).toEqual(['logout', 'onState', 'relogin']);
  });

  test('exposes the latest snapshot, params and a trace-backed log', () => {
    const { ctx, trace } = harness();
    expect(ctx.state().tick).toBe(1);
    expect(ctx.params).toEqual({ mode: 'chop' });
    ctx.log('hello');
    ctx.status('chopping');
    expect(trace.events().map(e => e.kind)).toEqual(['log', 'status']);
  });

  test('log takes an options bag as well as the grandfathered positional level', () => {
    const h = harness();
    h.ctx.log('positional still works', 'warn');
    h.ctx.log('the compliant form', { level: 'error' });
    h.ctx.log('the default is info');
    expect(h.trace.events().flatMap(e => (e.kind === 'log' ? [e.level] : [])))
      .toEqual(['warn', 'error', 'info']);
  });

  test('tutorial.clickThrough reads maxClicks and timeoutMs from the options bag', async () => {
    vi.useFakeTimers();
    try {
      const h = harness(chatting());
      // Nothing ever changes the chatbox, so each click waits its full frame timeout. Two clicks
      // at 500 ms fit inside 1200 ms; the grandfathered default of 4000 ms would fit one.
      const p = h.ctx.tutorial.clickThrough({ maxClicks: 2, timeoutMs: 500 });
      await vi.advanceTimersByTimeAsync(1200);
      expect(h.spies.dispatch).toHaveBeenCalledTimes(2);
      await p;
    } finally {
      vi.useRealTimers();
    }
  });

  test('tutorial.clickThrough still takes the grandfathered positional maxClicks', async () => {
    const h = harness(chatting());
    const p = h.ctx.tutorial.clickThrough(1);
    // Abort rather than wait out the 4000 ms default frame timeout the positional arm cannot set.
    h.abort.abort();
    await p;
    expect(h.spies.dispatch).toHaveBeenCalledTimes(1);
  });

  test('wait.until resolves synchronously when the predicate already holds', async () => {
    const { ctx } = harness();
    await expect(ctx.wait.until(s => s.tick === 1)).resolves.toBe(true);
  });

  test('wait.until resolves on a later state push and unsubscribes', async () => {
    const { ctx, push } = harness();
    const p = ctx.wait.until(s => s.tick === 5);
    push(fakeWorld({ tick: 5 }));
    await expect(p).resolves.toBe(true);
  });

  test('wait.until resolves false when the run is aborted', async () => {
    const { ctx, abort } = harness();
    const p = ctx.wait.until(s => s.tick === 99);
    abort.abort();
    await expect(p).resolves.toBe(false);
  });

  test('a wait registers against the signal that is live when it is called', async () => {
    const h = harness();
    const task = new AbortController();
    h.setSignal(task.signal);
    const parked = h.ctx.wait.until(() => false, { timeoutMs: 60_000 });
    task.abort();

    expect(await parked).toBe(false);
    expect(h.abort.signal.aborted).toBe(false);      // the run-level signal was never touched
  });

  test('the context reads the accessor per access, so c.signal is the task signal', () => {
    const h = harness();
    const task = new AbortController();
    h.setSignal(task.signal);
    task.abort();

    expect(h.ctx.signal.aborted).toBe(true);
    expect(h.abort.signal.aborted).toBe(false);
  });

  test('wait.until resolves false and warns on timeout', async () => {
    vi.useFakeTimers();
    try {
      const { ctx, trace } = harness();
      const p = ctx.wait.until(s => s.tick === 99, { timeoutMs: 500, label: 'tick 99' });
      await vi.advanceTimersByTimeAsync(600);
      await expect(p).resolves.toBe(false);
      expect(trace.events().some(e => e.kind === 'log' && e.text.includes('tick 99'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test('wait.ticks resolves after the requested number of ticks', async () => {
    const { ctx, tick } = harness();
    let done = false;
    const p = ctx.wait.ticks(2).then(() => { done = true; });
    tick();
    await Promise.resolve();
    expect(done).toBe(false);
    tick();
    await p;
    expect(done).toBe(true);
  });

  test('wait.xp and wait.item measure a delta from the moment they are called', async () => {
    const { ctx, push } = harness();
    const xp = ctx.wait.xp('Woodcutting', 25);
    const item = ctx.wait.item('logs', 1);
    push(fakeWorld({
      tick: 2,
      skills: [{ name: 'Woodcutting', level: 1, baseLevel: 1, experience: 130 }],
      inventory: [{ slot: 0, id: 1511, name: 'Logs', count: 4, optionsWithIndex: [] }]
    } as unknown as Partial<WorldState>));
    await expect(xp).resolves.toBe(true);
    await expect(item).resolves.toBe(true);
  });

  test('wait.message only matches messages newer than the call', async () => {
    const { ctx, push } = harness(fakeWorld({
      gameMessages: [{ type: 0, text: 'You get some logs.', sender: '', tick: 1, fromSelf: false }]
    } as unknown as Partial<WorldState>));
    const p = ctx.wait.message(/some logs/, 2000);
    push(fakeWorld({
      tick: 2,
      gameMessages: [
        { type: 0, text: 'You get some logs.', sender: '', tick: 1, fromSelf: false },
        { type: 0, text: 'You get some logs.', sender: '', tick: 2, fromSelf: false }
      ]
    } as unknown as Partial<WorldState>));
    await expect(p).resolves.toBe(true);
  });

  test('tutorial reads the flat tutorial extra', () => {
    const { ctx } = harness();
    expect(ctx.tutorial.title()).toBe('Getting Started');
    expect(ctx.tutorial.is(/getting/i)).toBe(true);
    expect(ctx.tutorial.is(/mining/i)).toBe(false);
  });

  test('dispose releases every state subscription, including the one the sdk opens', () => {
    const h = harness();
    // The BotSDK subscribes in its constructor, so a live context always holds at least one.
    expect(h.stateSubs.size).toBe(1);
    void h.ctx.wait.until(() => false, { timeoutMs: 60_000 });
    void h.ctx.wait.until(() => false, { timeoutMs: 60_000 });
    expect(h.stateSubs.size).toBe(3);
    h.dispose();
    expect(h.stateSubs.size).toBe(0);
  });

  test('a settled wait removes its own subscription without waiting for dispose', async () => {
    const h = harness();
    const settled = h.stateSubs.size;
    const p = h.ctx.wait.until(s => s.tick === 5);
    expect(h.stateSubs.size).toBe(settled + 1);
    h.push(fakeWorld({ tick: 5 }));
    await p;
    expect(h.stateSubs.size).toBe(settled);
  });

  // What the run summary reports as `tilesTravelled`. Asserted by identity rather than by
  // walking: driving the vendored walker far enough to move a fake player takes a scene and a
  // pathfinder, and what can go wrong here is the counter being a fresh one rather than the
  // layer's own. `createTravel` counting correctly is travel.test.ts's job.
  test('the run tile counter is the travel layer own counter, not a second one', () => {
    const { ctx, tiles } = harness();
    expect(tiles()).toBe(0);
    expect(tiles).toBe((ctx.travel as unknown as { tiles(): number }).tiles);
  });

  test('travel is wired to the loaders and resolves an atlas landmark', () => {
    const { ctx } = harness(standing());
    // The player stands at 3200, 3200; the landmark is four tiles east.
    expect(ctx.travel.distanceTo({ landmark: 'shed' })).toBe(4);
    expect(ctx.travel.distanceTo({ landmark: 'atlantis' })).toBe(Infinity);
  });

  test('a route interact is resolved against the live scene, by name and within two tiles', async () => {
    // The route puts the door at 3201, 3200. Nothing that answers that description is in the
    // scene in either case, so travel stops at the waypoint rather than walking on without it.
    const wrongName = await harness(standing([loc('Gate', 3201, 3200)])).ctx.travel.to({ landmark: 'shed' });
    expect(wrongName).toMatchObject({ success: false, reason: 'unreachable', legs: 0 });

    const tooFar = await harness(standing([loc('Door', 3204, 3200)])).ctx.travel.to({ landmark: 'shed' });
    expect(tooFar).toMatchObject({ success: false, reason: 'unreachable', legs: 0 });
  });

  test('a route interact with no matching loc in the scene stops the travel', async () => {
    const h = harness(standing());
    const result = await h.ctx.travel.to({ landmark: 'shed' });
    expect(result).toMatchObject({ success: false, reason: 'unreachable', legs: 0 });
  });

  test('find is wired to the scene, the atlas and the trace', async () => {
    const tree = {
      id: 1, name: 'Tree', x: 3206, z: 3200, level: 0, distance: 6, reachable: true,
      options: ['Chop down'], optionsWithIndex: [{ opIndex: 1, text: 'Chop down' }]
    };
    const h = harness(standing([tree]));
    await expect(h.ctx.find.nearest('tree')).resolves.toMatchObject({ via: 'scene', name: 'Tree', x: 3206 });
    // The layer that answered reaches the trace as its own event kind, not as a log line.
    expect(h.trace.events().map(e => e.kind)).toContain('target');
    // `nearestCluster` on the fake loader answers null, so the atlas accessors are the wiring
    // proof here: `landmark` resolves through the same loader `travel` uses.
    expect(h.ctx.find.landmark('shed')).toMatchObject({ id: 'shed' });
    expect(h.ctx.find.landmark('atlantis')).toBeNull();
    expect(h.ctx.find.nearestAtlas('tree')).toBeNull();
  });

  test('c.anchor(x, z) warns once and still works; c.anchor({ x, z }) is silent', () => {
    const h = harness();
    expect(h.ctx.anchor(3222, 3218)).toEqual({ x: 3222, z: 3218, level: 0 });
    h.ctx.anchor(10, 20);
    h.ctx.anchor({ x: 30, z: 40 });
    expect(warnings(h.trace))
      .toEqual(['c.anchor(x, z) is deprecated. Use c.anchor({ x, z }). Removed in api 3.']);
    // A second context, because warn-once would hide a wrapper that warned on the tile form
    // too: the notice above is already spent by the time the compliant call is made.
    const compliant = harness();
    expect(compliant.ctx.anchor({ x: 30, z: 40 })).toEqual({ x: 30, z: 40, level: 0 });
    expect(warnings(compliant.trace)).toEqual([]);
  });

  test('the anchor accessor reads and writes the worker-owned tile', () => {
    const { ctx } = harness();
    expect(ctx.anchor()).toEqual({ x: 0, z: 0, level: 0 });
    expect(ctx.anchor({ x: 3210, z: 3220 })).toEqual({ x: 3210, z: 3220, level: 0 });
    expect(ctx.anchor()).toEqual({ x: 3210, z: 3220, level: 0 });
  });

});

/** Every `warn` line a trace holds, which is the shape a deprecation notice arrives in. */
function warnings(trace: Trace): string[] {
  return trace.events().flatMap(e => (e.kind === 'log' && e.level === 'warn' ? [e.text] : []));
}
