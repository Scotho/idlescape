// The monitor's job is arithmetic over time: fire once per occurrence, hand out one recovery,
// and answer each settled recovery with the next rung of the ladder.
import { expect, test, vi } from 'vitest';
import { createHealthMonitor, type HealthTraceEvent } from './healthMonitor';
import { DEFAULT_BEHAVIOUR, resolvePolicy } from './behaviour';
import type { HealthPolicy } from './types';
import type { WorldState } from '../agent/types';
import type { HookEvent } from '../agent/types';
import type { PlayerState } from '../vendor/rs-sdk/sdk/types';

const player = (over: Partial<PlayerState> = {}): PlayerState =>
  ({ worldX: 1, worldZ: 1, level: 0, hp: 10, maxHp: 10, animId: -1, isDead: false, lifeId: 1, ...over } as unknown as PlayerState);
const world = (patch: Partial<WorldState> = {}): WorldState => ({
  player: player(), skills: [], inventory: [], modalOpen: false, modalInterface: -1,
  interfaceTexts: {}, dialog: { isOpen: false, options: [], isWaiting: false }, ...patch
} as unknown as WorldState);

const alive = world();
const dead = world({ player: player({ isDead: true }) });
const tinderbox = { slot: 0, id: 590, name: 'Tinderbox', count: 1, optionsWithIndex: [] };

function make(policy: HealthPolicy = {}, claims: (c: string) => boolean = () => false) {
  const trace = vi.fn<(e: HealthTraceEvent) => void>();
  let clock = 0;
  // Through the real merge, because that is the only way production builds one: a policy that
  // never met `resolvePolicy` has no `onStuck` at all, and the ladder is typed never to see one.
  const monitor = createHealthMonitor({ policy: resolvePolicy(policy, DEFAULT_BEHAVIOUR), trace, claims, now: () => clock });
  const kinds = (kind: 'health' | 'recovery'): HealthTraceEvent[] => trace.mock.calls.map(c => c[0]).filter(e => e.kind === kind);
  return { monitor, trace, kinds, at: (ms: number) => { clock = ms; } };
}

test('onDeath: fail ends the run on the first death instead of walking home first', () => {
  const { monitor } = make({ onDeath: 'fail' });
  monitor.observe(dead, 0);
  monitor.takeRecovery();
  // The recovery settled failed because the script said give up, so there is nothing left for
  // the ladder to try: no `re-anchor`, and no `pause-stuck` on the rung after it.
  expect(monitor.settle('death', 'failed')).toEqual({ fail: 'died' });
});

test('onDeath: pause hands the first death to the pause rung, whatever the recovery reported', () => {
  const { monitor } = make({ onDeath: 'pause' });
  monitor.observe(dead, 0);
  monitor.takeRecovery();
  // The recovery settled `recovered` - it waited out the respawn and did nothing else - and the
  // ending is still the player's setting, because a recovery cannot pause a run.
  expect(monitor.settle('death', 'recovered')).toBe('pause-stuck');
});

test('onDeath: logout ends the run with logged_out, not with died', () => {
  for (const onDeath of ['logout', 'loot-and-logout'] as const) {
    for (const outcome of ['recovered', 'failed'] as const) {
      const { monitor } = make({ onDeath });
      monitor.observe(dead, 0);
      monitor.takeRecovery();
      // `died` would say the run came off the rails; the player asked for this one. The rung does
      // not consult the outcome, which is why the recovery has to send the packet on both paths.
      expect(monitor.settle('death', outcome)).toEqual({ fail: 'logged_out' });
    }
  }
});

test('a second death still ends the run with died, whatever onDeath asked for', () => {
  const { monitor } = make({ onDeath: 'pause' });
  monitor.observe(dead, 0);
  monitor.takeRecovery();
  monitor.settle('death', 'recovered');
  monitor.observe(world({ player: player({ lifeId: 2 }) }), 1000);
  monitor.takeRecovery();
  expect(monitor.settle('death', 'recovered')).toEqual({ fail: 'died' });
});

test('onStuck: stop fails the run where onStuck: pause would have paused it', () => {
  const { monitor } = make({ onStuck: 'stop', maxRecoveryAttempts: 2 });
  monitor.observe(alive, 0);
  monitor.observe(alive, 200_000);
  monitor.takeRecovery();
  expect(monitor.settle('no-progress', 'failed')).toBe('re-anchor');   // the rung before it
  monitor.observe(alive, 400_000);
  monitor.takeRecovery();
  expect(monitor.settle('no-progress', 'failed')).toEqual({ fail: 'stuck' });
});

test('onStuck: logout ends the run with logged_out on the same rung', () => {
  const { monitor } = make({ onStuck: 'logout' });
  // A full inventory skips the re-anchor rung, so its first failed recovery is already the one
  // that cannot carry on by itself.
  monitor.observe(world({ inventory: new Array(28).fill({ slot: 0, id: 1511, name: 'Logs', count: 1, optionsWithIndex: [] }) }), 0);
  monitor.takeRecovery();
  expect(monitor.settle('inventory-full', 'failed')).toEqual({ fail: 'logged_out' });
});

test('onStuck reaches the conditions with no typed failure of their own too', () => {
  const { monitor } = make({ onStuck: 'stop' });
  monitor.observe(world({ dialog: { isOpen: true, options: [], isWaiting: false } }), 0);
  monitor.observe(world({ dialog: { isOpen: true, options: [], isWaiting: false } }), 20_000);
  expect(monitor.takeRecovery()).toBe('dialog-stuck');
  // `dialog-stuck` has no row in TERMINAL, so its `escalated` rung used to be a hard-coded pause.
  expect(monitor.settle('dialog-stuck', 'escalated')).toEqual({ fail: 'stuck' });
});

test('a condition fires once, not once per tick', () => {
  const { monitor, kinds } = make();
  monitor.observe(dead, 0);
  monitor.observe(dead, 600);
  monitor.observe(dead, 1200);
  expect(kinds('health')).toHaveLength(1);
});

test('the pending recovery is handed out once and then cleared', () => {
  const { monitor } = make();
  monitor.observe(dead, 0);
  expect(monitor.takeRecovery()).toBe('death');
  expect(monitor.takeRecovery()).toBeNull();
  // It is still the condition being worked on, which is what a script's `when` reads.
  expect(monitor.is('death')).toBe(true);
  expect(monitor.last()).toMatchObject({ condition: 'death', at: 0 });
});

test('a condition a script claims is never turned into a recovery', () => {
  const { monitor, trace } = make({}, c => c === 'death');
  monitor.observe(dead, 0);
  expect(monitor.takeRecovery()).toBeNull();
  expect(trace).toHaveBeenCalledWith(expect.objectContaining({ kind: 'recovery', outcome: 'handled-by-script' }));
  // The script sees it through `is`, and hands it back when it has dealt with it.
  expect(monitor.is('death')).toBe(true);
  monitor.recovered('death');
  expect(monitor.is('death')).toBe(false);
  expect(trace).toHaveBeenCalledWith(expect.objectContaining({ kind: 'recovery', action: 'script', outcome: 'recovered' }));
});

test('the ladder escalates: recover, then a second death ends the run', () => {
  const { monitor } = make({ maxRecoveryAttempts: 2 });
  monitor.observe(dead, 0);
  expect(monitor.takeRecovery()).toBe('death');
  expect(monitor.settle('death', 'recovered')).toBe('continue');
  monitor.observe(world({ player: player({ lifeId: 2 }) }), 1000);
  expect(monitor.takeRecovery()).toBe('death');
  // Spec decision 5: a second death in one run ends it.
  expect(monitor.settle('death', 'failed')).toEqual({ fail: 'died' });
});

test('the second death ends the run even when its own recovery worked', () => {
  const { monitor } = make();
  monitor.observe(dead, 0);
  monitor.takeRecovery();
  monitor.settle('death', 'recovered');
  monitor.observe(world({ player: player({ lifeId: 2 }) }), 1000);
  monitor.takeRecovery();
  expect(monitor.settle('death', 'recovered')).toEqual({ fail: 'died' });
});

test('a failed recovery re-anchors before it pauses, and pauses before it fails', () => {
  const { monitor } = make({ maxRecoveryAttempts: 2 });
  monitor.observe(alive, 0);
  monitor.observe(alive, 200_000);                 // no-progress
  expect(monitor.takeRecovery()).toBe('no-progress');
  expect(monitor.settle('no-progress', 'failed')).toBe('re-anchor');
  monitor.observe(alive, 400_000);
  monitor.takeRecovery();
  expect(monitor.settle('no-progress', 'failed')).toBe('pause-stuck');
  monitor.observe(alive, 600_000);
  monitor.takeRecovery();
  expect(monitor.settle('no-progress', 'failed')).toEqual({ fail: 'no_progress' });
});

test('a second no-progress pauses stuck, even when both its recoveries worked', () => {
  // The wedged run: `travel.to(anchor)` while standing on the anchor arrives at zero tiles, so a
  // no-progress recovery reports `recovered` whether or not anything was actually wrong. Keying
  // this rung on attempts rather than occurrences would re-anchor every 90 s for ever.
  const { monitor, at } = make();
  monitor.observe(alive, 0);
  monitor.observe(alive, 200_000);
  expect(monitor.takeRecovery()).toBe('no-progress');
  at(200_000);
  expect(monitor.settle('no-progress', 'recovered')).toBe('continue');
  monitor.observe(alive, 300_000);
  expect(monitor.takeRecovery()).toBe('no-progress');
  at(300_000);
  expect(monitor.settle('no-progress', 'recovered')).toBe('pause-stuck');
  // Resumed, and wedged again: the ladder has nothing left to try.
  monitor.observe(alive, 400_000);
  monitor.takeRecovery();
  expect(monitor.settle('no-progress', 'recovered')).toEqual({ fail: 'no_progress' });
});

test('a settled recovery moves the progress clock, without stopping it', () => {
  const { monitor, kinds, at } = make();
  monitor.observe(alive, 0);
  monitor.observe(alive, 200_000);
  expect(monitor.takeRecovery()).toBe('no-progress');
  at(200_000);
  expect(monitor.settle('no-progress', 'recovered')).toBe('continue');
  monitor.observe(alive, 200_600);                 // the very next tick: the window restarted
  expect(kinds('health')).toHaveLength(1);
  monitor.observe(alive, 291_000);                 // 91 s later, still nothing moving
  expect(kinds('health')).toHaveLength(2);
});

test('a condition with nothing to try goes straight to its typed failure', () => {
  const { monitor } = make({ consumes: ['Tinderbox'] });
  // Held, then gone: the supply has to reach zero, and a run that never had one has not run out.
  monitor.observe(alive, 0);                       // starting empty is not running out
  expect(monitor.takeRecovery()).toBeNull();
  monitor.observe(world({ inventory: [tinderbox] }), 600);
  expect(monitor.takeRecovery()).toBeNull();
  monitor.observe(alive, 1200);
  expect(monitor.takeRecovery()).toBe('out-of-supplies');
  expect(monitor.settle('out-of-supplies', 'escalated')).toEqual({ fail: 'out_of_supplies' });
});

test('a full inventory pauses stuck rather than walking back to the anchor', () => {
  const { monitor } = make();
  monitor.observe(world({ inventory: new Array(28).fill({ slot: 0, id: 1511, name: 'Logs', count: 1, optionsWithIndex: [] }) }), 0);
  expect(monitor.takeRecovery()).toBe('inventory-full');
  expect(monitor.settle('inventory-full', 'failed')).toBe('pause-stuck');
});

test('a logout hook is a condition too, with the hook name as its detail', () => {
  const { monitor, trace } = make();
  monitor.note({ name: 'logout', payload: {} } as HookEvent, 50);
  expect(monitor.takeRecovery()).toBe('logout');
  expect(trace).toHaveBeenCalledWith({ kind: 'health', condition: 'logout', detail: 'logout' });
});

test('counts are per condition and feed the run summary', () => {
  const { monitor } = make();
  monitor.observe(dead, 0);
  monitor.takeRecovery();
  monitor.settle('death', 'recovered');
  expect(monitor.counts()).toEqual({ death: 1 });
});

test('after dispose no observation produces an event', () => {
  const { monitor, trace } = make();
  monitor.dispose();
  monitor.observe(dead, 0);
  monitor.note({ name: 'logout', payload: {} } as HookEvent, 0);
  expect(trace).not.toHaveBeenCalled();
  expect(monitor.takeRecovery()).toBeNull();
});

test('a recovery that outlives the run settles into nothing', () => {
  const { monitor, trace } = make();
  monitor.observe(dead, 0);
  monitor.takeRecovery();
  monitor.dispose();
  trace.mockClear();
  expect(monitor.settle('death', 'failed')).toBe('continue');
  expect(trace).not.toHaveBeenCalled();
});

const aliveAt = (x: number, z: number): WorldState => world({ player: player({ worldX: x, worldZ: z }) });
const deadAt = (x: number, z: number): WorldState => world({ player: player({ worldX: x, worldZ: z, isDead: true }) });

test('the death tile is the last alive tile, not the respawn point', () => {
  const { monitor } = make();
  monitor.observe(aliveAt(3200, 3200), 0);
  // The snapshot the death fires on already reports Lumbridge, which is why the monitor is the
  // thing that captures the tile: nothing downstream can still see where the character was.
  monitor.observe(deadAt(3221, 3218), 600);
  expect(monitor.deathTile()).toEqual({ x: 3200, z: 3200, level: 0 });
  expect(monitor.diedAt()).toBe(600);
});

test('the respawn ticks that follow do not move the captured tile', () => {
  const { monitor } = make();
  monitor.observe(aliveAt(3200, 3200), 0);
  monitor.observe(deadAt(3221, 3218), 600);
  monitor.observe(deadAt(3221, 3218), 1200);
  monitor.observe(aliveAt(3221, 3218), 1800);
  expect(monitor.deathTile()).toEqual({ x: 3200, z: 3200, level: 0 });
  expect(monitor.diedAt()).toBe(600);
});

test('a run that has not died has no death tile', () => {
  const { monitor } = make();
  monitor.observe(aliveAt(3200, 3200), 0);
  expect(monitor.deathTile()).toBeNull();
  expect(monitor.diedAt()).toBeNull();
});

test('a second death records its own tile, not the first one', () => {
  const { monitor } = make();
  monitor.observe(aliveAt(3200, 3200), 0);
  monitor.observe(deadAt(3221, 3218), 600);
  monitor.takeRecovery();
  monitor.settle('death', 'recovered');
  monitor.observe(aliveAt(3100, 3100), 1200);
  monitor.observe(deadAt(3221, 3218), 1800);
  expect(monitor.deathTile()).toEqual({ x: 3100, z: 3100, level: 0 });
  expect(monitor.diedAt()).toBe(1800);
});

test('dispose forgets where the run died', () => {
  const { monitor } = make();
  monitor.observe(aliveAt(3200, 3200), 0);
  monitor.observe(deadAt(3221, 3218), 600);
  monitor.dispose();
  expect(monitor.deathTile()).toBeNull();
});

test('a death seen only as a new life captures the tile, not the respawn point', () => {
  const { monitor } = make();
  monitor.observe(aliveAt(3200, 3200), 0);
  // The arm every `isDead: true` fixture leaves untested: `evaluate` answers `death` here on
  // `lifeChanged` alone, and this snapshot is alive and standing on the respawn point.
  monitor.observe(world({ player: player({ worldX: 3221, worldZ: 3218, lifeId: 2 }) }), 600);
  expect(monitor.deathTile()).toEqual({ x: 3200, z: 3200, level: 0 });
  expect(monitor.diedAt()).toBe(600);
});

test('a death the monitor never saw a living tile for records nothing at all', () => {
  const { monitor } = make();
  // The run's very first snapshot is a corpse, so there is no tile to go back to and the
  // recovery must be told that rather than handed someone else's.
  monitor.observe(deadAt(3221, 3218), 0);
  expect(monitor.deathTile()).toBeNull();
  expect(monitor.diedAt()).toBeNull();
});
