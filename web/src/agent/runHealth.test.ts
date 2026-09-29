// The wiring between the monitor and the run: what each rung of the ladder actually does to the
// runner, and that nothing is left observing once the run is over.
import { expect, test, vi } from 'vitest';
import { createRunHealth } from './runHealth';
import { DEFAULT_BEHAVIOUR, resolvePolicy } from '../tasks/behaviour';
import { createTrace } from '../tasks/trace';
import type { Runner } from '../tasks/runner';
import type { BehaviourSettings, Script, ScriptContext, TraceEvent } from '../tasks/types';
import type { HookEvent, WorldState } from './types';
import type { PlayerState } from '../vendor/rs-sdk/sdk/types';

const player = (): PlayerState =>
  ({ worldX: 1, worldZ: 1, level: 0, hp: 10, maxHp: 10, animId: -1, isDead: false, lifeId: 1 } as unknown as PlayerState);
const world = (patch: Partial<WorldState> = {}): WorldState => ({
  player: player(), skills: [], inventory: [], modalOpen: false, modalInterface: -1,
  interfaceTexts: {}, dialog: { isOpen: false, options: [], isWaiting: false }, ...patch
} as unknown as WorldState);

const script = (over: Partial<Script> = {}): Script =>
  ({ id: 'health-script', name: 'Health', version: 1, description: '', tasks: [], ...over });

/**
 * The policy goes through the real merge rather than being handed in whole: production only ever
 * builds one with `resolvePolicy`, and a harness that skipped it could hand the monitor a policy
 * with `onStuck` missing, which is a shape the ladder is now typed never to see.
 */
function harness(over: Partial<Script> = {}, player: Partial<BehaviourSettings> = {}) {
  const policy = resolvePolicy(over.health, { ...DEFAULT_BEHAVIOUR, ...player });
  const trace = createTrace();
  const ticks = new Set<() => void>();
  const events = new Set<(e: HookEvent) => void>();
  let state: WorldState = world();
  let clock = 0;
  // Typed from the context member it stands in for, so `mock.calls[n]` carries the real arguments
  // and `mockResolvedValue` takes a whole `TravelResult`. Declared bare, the fake had no parameters
  // at all and every read of a recorded call was indexing the empty tuple. Audit C16.
  const travel = vi.fn<ScriptContext['travel']['to']>(async () => ({ success: false, reason: 'unreachable', legs: 1, tiles: 0 }));
  /** Honest about the live snapshot, the way the real `wait.until` is: no fake shortcut. */
  const until = vi.fn(async (p?: (s: WorldState) => boolean) => (p ? p(state) : false));
  const ctx = {
    state: () => state, status: vi.fn(), log: vi.fn(),
    sdk: {
      scanNearbyLocs: vi.fn(async () => []), sendCloseModal: vi.fn(async () => ({ success: true, message: 'ok' })),
      scanGroundItems: vi.fn(async () => [])
    },
    bot: { dismissBlockingUI: vi.fn(async () => {}), pickupItem: vi.fn(async () => ({ success: false, message: 'gone' })) },
    signal: new AbortController().signal,
    tutorial: { clickThrough: vi.fn(async () => {}) },
    travel: { to: travel, distanceTo: () => 0 },
    anchor: () => ({ x: 7, z: 8 }),
    wait: { until }
  } as unknown as ScriptContext;
  const runner = { pause: vi.fn(), fail: vi.fn(), interrupt: vi.fn() } as unknown as Runner;
  const relogin = vi.fn(async () => ({ ok: false, reason: 'no session manager' }));
  const logout = vi.fn();
  const run = createRunHealth({
    script: script(over), policy, trace, state: () => state,
    onTick: cb => { ticks.add(cb); return () => { ticks.delete(cb); }; },
    onEvent: cb => { events.add(cb); return () => { events.delete(cb); }; },
    snapshot: () => ({ tick: 7 }), ctx: () => ctx, runner: () => runner, now: () => clock, relogin, logout
  });
  return {
    run, trace, ctx, runner, travel, relogin, logout, until,
    subs: () => ({ ticks: ticks.size, events: events.size }),
    tick: (at: number, next?: WorldState) => { clock = at; if (next) state = next; for (const cb of [...ticks]) cb(); },
    emit: (e: HookEvent) => { for (const cb of [...events]) cb(e); },
    kinds: (kind: TraceEvent['kind']) => trace.events().filter(e => e.kind === kind)
  };
}

test('observing the world queues a recovery the runner can run as an ordinary task', async () => {
  const h = harness();
  h.tick(0);
  h.tick(200_000);
  expect(h.kinds('health')).toHaveLength(1);
  const task = h.run.recovery();
  expect(task?.name).toBe('recover:no-progress');
  expect(h.run.recovery()).toBeNull();
  expect(h.run.counts()).toEqual({ 'no-progress': 1 });
  await task!.run(h.ctx);
  // The recovery walked home and failed, so the ladder sent it home again (the `re-anchor` rung).
  expect(h.travel.mock.calls).toHaveLength(2);
  expect(h.travel.mock.calls[1]).toEqual([{ x: 7, z: 8 }, { tolerance: 3 }]);
});

test('a newly queued recovery takes the game from the task in flight, once', () => {
  const h = harness();
  h.tick(0);
  h.tick(200_000);
  expect(h.runner.interrupt).toHaveBeenCalledTimes(1);
  h.tick(200_600);                       // the same condition, still visible: no second abort
  expect(h.runner.interrupt).toHaveBeenCalledTimes(1);
});

test('a condition the script claims never becomes a recovery task', () => {
  const h = harness({
    tasks: [{ name: 'mine', recovers: ['no-progress'], when: () => true, run: async () => {} }]
  });
  h.tick(0);
  h.tick(200_000);
  expect(h.run.recovery()).toBeNull();
  // Nothing was queued, so nothing took the game: the script's own task picks it up when the
  // runner next evaluates `when`.
  expect(h.runner.interrupt).not.toHaveBeenCalled();
  expect(h.run.health.is('no-progress')).toBe(true);
  expect(h.kinds('recovery')[0]).toMatchObject({ outcome: 'handled-by-script' });
  h.run.health.recovered('no-progress');
  expect(h.run.health.is('no-progress')).toBe(false);
  expect(h.run.health.last()).toMatchObject({ condition: 'no-progress' });
});

test('the stuck rung records a snapshot and pauses the runner', async () => {
  const h = harness();
  const full = new Array(28).fill({ slot: 0, id: 1511, name: 'Logs', count: 1, optionsWithIndex: [] });
  h.tick(0, world({ inventory: full }));
  const task = h.run.recovery();
  expect(task?.name).toBe('recover:inventory-full');
  await task!.run(h.ctx);
  expect(h.runner.pause).toHaveBeenCalledWith('stuck', 'runner');
  expect(h.kinds('stuck')[0]).toMatchObject({ task: 'recover:inventory-full', snapshot: { tick: 7 } });
});

test('a condition with no recovery to try fails the run with its typed reason', () => {
  const h = harness({ health: { consumes: ['Tinderbox'] } });
  // The supply has to reach zero during the run: held on one snapshot, gone on the next.
  h.tick(0, world({ inventory: [{ slot: 0, id: 590, name: 'Tinderbox', count: 1, optionsWithIndex: [] }] }));
  expect(h.run.recovery()).toBeNull();
  expect(h.runner.fail).not.toHaveBeenCalled();
  h.tick(600, world());
  expect(h.run.recovery()).toBeNull();
  expect(h.runner.fail).toHaveBeenCalledWith('out_of_supplies');
});

test('a hook event the snapshot cannot show reaches the monitor', () => {
  const h = harness();
  h.emit({ name: 'disconnect', payload: { code: 3 } });
  expect(h.kinds('health')[0]).toMatchObject({ condition: 'logout', detail: 'disconnect' });
});

test('the logout recovery is handed the transport login, not something off the context', async () => {
  const h = harness();
  h.emit({ name: 'logout', payload: {} } as HookEvent);
  const task = h.run.recovery();
  expect(task?.name).toBe('recover:logout');
  await task!.run(h.ctx);
  // `ScriptContext` has no `relogin` and must not gain one: the run wires it from the transport.
  expect(h.relogin).toHaveBeenCalledTimes(1);
  expect(h.kinds('recovery')[0]).toMatchObject({ condition: 'logout', outcome: 'failed' });
});

test('the script health policy reaches the death recovery', async () => {
  const h = harness({ health: { onDeath: 'resume' } });
  h.tick(0, world({ player: { ...player(), isDead: true } as PlayerState }));
  h.tick(600, world());                                  // the server brings the character back
  const task = h.run.recovery();
  expect(task?.name).toBe('recover:death');
  await task!.run(h.ctx);
  // `resume` carries on from wherever the respawn put it. Without the script's policy reaching
  // the recovery the default `loot` would have walked back to the death tile first.
  expect(h.travel).not.toHaveBeenCalled();
  expect(h.kinds('recovery')[0]).toMatchObject({ condition: 'death', outcome: 'recovered' });
});

test('the onStuck: logout rung asks the transport to log out before it fails the run', async () => {
  const h = harness({}, { onStuck: 'logout' });
  // A full inventory has no re-anchor rung, so its first failed recovery is already the one that
  // cannot carry on by itself.
  const full = new Array(28).fill({ slot: 0, id: 1511, name: 'Logs', count: 1, optionsWithIndex: [] });
  h.tick(0, world({ inventory: full }));
  await h.run.recovery()!.run(h.ctx);
  expect(h.logout).toHaveBeenCalledTimes(1);
  expect(h.runner.fail).toHaveBeenCalledWith('logged_out');
});

test('a death that ends in a logout sends one logout packet, not two', async () => {
  const h = harness({}, { onDeath: 'logout' });
  h.tick(0, world({ player: { ...player(), isDead: true } as PlayerState }));
  h.tick(600, world());                                  // the server brings the character back
  const task = h.run.recovery();
  await task!.run(h.ctx);
  // The recovery logs out itself, because only it knows whether the player wanted the loot walk
  // first; the ladder must not repeat it when the same rung comes back as `logged_out`.
  expect(h.logout).toHaveBeenCalledTimes(1);
  expect(h.runner.fail).toHaveBeenCalledWith('logged_out');
});

test('the resolved policy, not the script, is what the death recovery follows', async () => {
  // The script declares nothing; the player asked to be logged out. `resolvePolicy` merged the
  // two before the run started, and this is the object the recovery reads.
  const h = harness({}, { onDeath: 'logout' });
  h.tick(0, world({ player: { ...player(), isDead: true } as PlayerState }));
  h.tick(600, world());
  await h.run.recovery()!.run(h.ctx);
  expect(h.travel).not.toHaveBeenCalled();
  expect(h.logout).toHaveBeenCalled();
});

test('dispose releases the tick and the event subscription, and the monitor with them', () => {
  const h = harness();
  expect(h.subs()).toEqual({ ticks: 1, events: 1 });
  h.run.dispose();
  // Both halves matter. The disposed monitor is silent whatever it is handed, and the released
  // subscriptions are what stop a finished run's closure being held by the Worker's fan-outs.
  expect(h.subs()).toEqual({ ticks: 0, events: 0 });
  h.tick(0, world({ player: { ...player(), isDead: true } as PlayerState }));
  h.emit({ name: 'logout', payload: {} } as HookEvent);
  expect(h.kinds('health')).toHaveLength(0);
  expect(h.run.recovery()).toBeNull();
});

test('the tile the monitor captured is what the death recovery walks back to', async () => {
  const h = harness();
  // Plain harness ticks. The recovery reads the loot window off the run's own clock, so a
  // harness that counts from zero is as valid as one that counts from the epoch.
  h.tick(0, world({ player: { ...player(), worldX: 3200, worldZ: 3200 } as PlayerState }));
  // The snapshot that carries the death already reports Lumbridge. Nothing after this point can
  // see where the character actually was, which is why the monitor holds it.
  h.tick(600, world({ player: { ...player(), worldX: 3221, worldZ: 3218, isDead: true } as PlayerState }));
  h.tick(1200, world({ player: { ...player(), worldX: 3221, worldZ: 3218 } as PlayerState }));
  h.travel.mockResolvedValue({ success: true, reason: undefined, legs: 1, tiles: 4 });
  await h.run.recovery()!.run(h.ctx);
  // The death tile first, then the run anchor. Only the monitor could have supplied the first.
  expect(h.travel.mock.calls[0]?.[0]).toEqual({ x: 3200, z: 3200, level: 0 });
  expect(h.travel.mock.calls[1]?.[0]).toEqual({ x: 7, z: 8 });
  expect(h.kinds('recovery')[0]).toMatchObject({ condition: 'death', outcome: 'recovered' });
});
