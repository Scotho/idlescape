// Every check is a pure function over a snapshot, which is the only way they can be tested
// honestly: no monitor, no clock, no runner - a world and a number in, a boolean out.
import { expect, test } from 'vitest';
import {
  emptyMemory, evaluate, isDeath, isDialogStuck, isInventoryFull, isLevelUp, isNoProgress,
  isOutOfSupplies, isUnexpectedInterface, observe
} from './health';
import type { WorldState } from '../agent/types';
import type { DialogState, InventoryItem, PlayerState, SkillState } from '../vendor/rs-sdk/sdk/types';

// One cast per fixture kind, for the fields no check reads. Everything a check does read is
// spelled out, so a patch that gets a field's name or type wrong fails to compile.
const player = (over: Partial<PlayerState> = {}): PlayerState =>
  ({ worldX: 100, worldZ: 100, level: 0, hp: 10, maxHp: 10, animId: -1, isDead: false, lifeId: 1, ...over } as unknown as PlayerState);
const item = (id: number, name = 'Logs', count = 1): InventoryItem => ({ slot: 0, id, name, count, optionsWithIndex: [] });
const skill = (experience: number): SkillState => ({ name: 'Woodcutting', level: 5, baseLevel: 5, experience });
const dialog = (isOpen: boolean, options: DialogState['options'] = []): DialogState => ({ isOpen, options, isWaiting: false });

const world = (patch: Partial<WorldState> = {}): WorldState => ({
  player: player(), skills: [skill(100)], inventory: [], modalOpen: false, modalInterface: -1,
  interfaceTexts: {}, dialog: dialog(false), ...patch
} as unknown as WorldState);

test('no-progress needs xp, inventory and position all still for the whole window', () => {
  let mem = observe(emptyMemory(0), world(), 0);
  mem = observe(mem, world(), 89_000);
  expect(isNoProgress(mem, 89_000, 90_000)).toBe(false);
  mem = observe(mem, world(), 91_000);
  expect(isNoProgress(mem, 91_000, 90_000)).toBe(true);
});

test('any one of xp, inventory or position moving resets the window', () => {
  const cases: Partial<WorldState>[] = [
    { skills: [skill(200)] },
    { inventory: [item(1511)] },
    { player: player({ worldX: 101 }) }
  ];
  for (const patch of cases) {
    let mem = observe(emptyMemory(0), world(), 0);
    mem = observe(mem, world(patch), 91_000);
    expect(isNoProgress(mem, 91_000, 90_000)).toBe(false);
  }
});

test('a modal the script declared is expected; any other is not', () => {
  expect(isUnexpectedInterface(world({ modalOpen: true, modalInterface: 3559 }), [3559])).toBe(false);
  expect(isUnexpectedInterface(world({ modalOpen: true, modalInterface: 12 }), [3559])).toBe(true);
  expect(isUnexpectedInterface(world({ modalOpen: false, modalInterface: 12 }), [])).toBe(false);
});

test('dialog-stuck needs an open dialog with no options, held for 15 seconds', () => {
  const open = world({ dialog: dialog(true) });
  let mem = observe(emptyMemory(0), open, 0);
  mem = observe(mem, open, 14_000);
  expect(isDialogStuck(mem, 14_000)).toBe(false);
  mem = observe(mem, open, 16_000);
  expect(isDialogStuck(mem, 16_000)).toBe(true);
});

test('a dialog with options is a choice, not a stuck dialog', () => {
  const choice = world({ dialog: dialog(true, [{ index: 0, text: 'Yes' }, { index: 1, text: 'No' }]) });
  let mem = observe(emptyMemory(0), choice, 0);
  mem = observe(mem, choice, 60_000);
  expect(isDialogStuck(mem, 60_000)).toBe(false);
});

test('the continue line is not a choice, so a live talking frame can still go stuck', () => {
  // The client the monitor actually runs against publishes "Click here to continue" as a dialog
  // option on every frame with nothing to decide. A fixture with an empty `options` array is a
  // world no live snapshot produces, and counting raw options against the real one left
  // `dialog-stuck` dead: the condition both recovery ladders declare they recover could never
  // be raised.
  const talking = world({ dialog: dialog(true, [{ index: 1, text: 'Click here to continue' }]) });
  let mem = observe(emptyMemory(0), talking, 0);
  mem = observe(mem, talking, 14_000);
  expect(isDialogStuck(mem, 14_000)).toBe(false);
  mem = observe(mem, talking, 16_000);
  expect(isDialogStuck(mem, 16_000)).toBe(true);
});

test('a dialog that closes and reopens starts its 15 seconds again', () => {
  const open = world({ dialog: dialog(true) });
  let mem = observe(emptyMemory(0), open, 0);
  mem = observe(mem, world(), 10_000);
  mem = observe(mem, open, 11_000);
  expect(isDialogStuck(mem, 25_000)).toBe(false);
  expect(isDialogStuck(mem, 26_000)).toBe(true);
});

test('level-up is read from the interface text, not from a component id', () => {
  expect(isLevelUp(world({ interfaceTexts: { 740: 'Congratulations, you just advanced a Woodcutting level.' } }))).toBe(true);
  expect(isLevelUp(world({ interfaceTexts: { 740: 'You need a bronze axe.' } }))).toBe(false);
});

test('death fires on isDead and on a lifeId that moved', () => {
  const mem = observe(emptyMemory(0), world(), 0);
  const dead = world({ player: player({ isDead: true }) });
  expect(isDeath(dead, observe(mem, dead, 600))).toBe(true);
  const respawned = world({ player: player({ lifeId: 2 }) });
  expect(isDeath(respawned, observe(mem, respawned, 600))).toBe(true);
  expect(isDeath(world(), observe(mem, world(), 600))).toBe(false);
  // Nothing has been observed yet, so a lifeId cannot have "moved": only isDead counts.
  const first = world({ player: player({ lifeId: 9 }) });
  expect(isDeath(first, observe(emptyMemory(0), first, 0))).toBe(false);
});

test('a death is one occurrence, not one per tick it stays visible', () => {
  const respawned = world({ player: player({ lifeId: 2 }) });
  const mem = observe(observe(emptyMemory(0), world(), 0), respawned, 600);
  expect(isDeath(respawned, mem)).toBe(true);
  expect(isDeath(respawned, observe(mem, respawned, 1200))).toBe(false);
});

test('inventory-full is 28 slots', () => {
  expect(isInventoryFull(world({ inventory: new Array(28).fill(item(1511)) }))).toBe(true);
  expect(isInventoryFull(world({ inventory: new Array(27).fill(item(1511)) }))).toBe(false);
});

test('out-of-supplies is an item reaching zero, not an item that was never held', () => {
  const empty = world({ inventory: [] });
  // A script that declares a consumable and starts without it has not run out of anything: this
  // condition has no recovery, so firing here would fail the run on its first snapshot.
  let mem = observe(emptyMemory(0), empty, 0);
  expect(isOutOfSupplies(mem, ['Tinderbox'])).toBe(false);
  mem = observe(mem, world({ inventory: [item(590, 'Tinderbox')] }), 600);
  expect(isOutOfSupplies(mem, ['Tinderbox'])).toBe(false);
  mem = observe(mem, empty, 1200);
  expect(isOutOfSupplies(mem, ['Tinderbox'])).toBe(true);
  expect(isOutOfSupplies(mem, [])).toBe(false);
  // The transition, not the state: staying empty is not a second occurrence.
  expect(isOutOfSupplies(observe(mem, empty, 1800), ['Tinderbox'])).toBe(false);
});

test('out-of-supplies ignores an item the script did not declare, and matches case-insensitively', () => {
  const mem = observe(observe(emptyMemory(0), world({ inventory: [item(590, 'Tinderbox'), item(1511, 'Logs')] }), 0), world({ inventory: [item(1511, 'Logs')] }), 600);
  expect(isOutOfSupplies(mem, ['Logs'])).toBe(false);
  expect(isOutOfSupplies(mem, ['tinderbox'])).toBe(true);
});

test('evaluate returns the most urgent condition, not the first one it looks at', () => {
  const dying = world({ player: player({ isDead: true }), modalOpen: true, modalInterface: 99 });
  expect(evaluate(observe(emptyMemory(0), world(), 0), dying, 0, {})).toBe('death');
});

test('evaluate reads the policy: an expected modal and a longer window are both honoured', () => {
  const mem = observe(observe(emptyMemory(0), world(), 0), world(), 100_000);
  expect(evaluate(mem, world({ modalOpen: true, modalInterface: 3559 }), 100_000, { expectInterfaces: [3559] })).toBe('no-progress');
  expect(evaluate(mem, world(), 100_000, { noProgressMs: 120_000 })).toBeNull();
});

test('the last alive tile survives the death that follows it', () => {
  let mem = observe(emptyMemory(0), world({ player: player({ worldX: 3200, worldZ: 3200 }) }), 0);
  // The snapshot that reports the death already reports the respawn point, which is exactly why
  // this field must not follow the player into it.
  mem = observe(mem, world({ player: player({ worldX: 3221, worldZ: 3218, isDead: true }) }), 600);
  expect(mem.lastAliveAt).toEqual({ x: 3200, z: 3200, level: 0 });
});

test('a respawn does not restore it either, until the player moves again', () => {
  let mem = observe(emptyMemory(0), world({ player: player({ worldX: 3200, worldZ: 3200 }) }), 0);
  mem = observe(mem, world({ player: player({ worldX: 3221, worldZ: 3218, isDead: true }) }), 600);
  mem = observe(mem, world({ player: player({ worldX: 3221, worldZ: 3218 }) }), 1200);
  // Which is the one real constraint on the design: whatever wants the death tile has to read it
  // before the snapshot after the respawn lands. The monitor captures it when the death fires.
  expect(mem.lastAliveAt).toEqual({ x: 3221, z: 3218, level: 0 });
});

test('an empty memory has no last alive tile at all', () => {
  expect(emptyMemory(0).lastAliveAt).toBeNull();
});

test('a death seen only as a new life does not move the last alive tile either', () => {
  let mem = observe(emptyMemory(0), world({ player: player({ worldX: 3200, worldZ: 3200 }) }), 0);
  // No `isDead: true` snapshot was ever published, so the collector's first sight of this death
  // is the respawn itself: alive, in Lumbridge, carrying a new lifeId. `isDeath` fires on it,
  // which makes it the snapshot the death tile is read from.
  const respawn = world({ player: player({ worldX: 3221, worldZ: 3218, lifeId: 2 }) });
  mem = observe(mem, respawn, 600);
  expect(isDeath(respawn, mem)).toBe(true);
  expect(mem.lastAliveAt).toEqual({ x: 3200, z: 3200, level: 0 });
});

test('the tile starts moving again on the snapshot after the respawn', () => {
  let mem = observe(emptyMemory(0), world({ player: player({ worldX: 3200, worldZ: 3200 }) }), 0);
  mem = observe(mem, world({ player: player({ worldX: 3221, worldZ: 3218, lifeId: 2 }) }), 600);
  // One snapshot of grace, not a latch: `lifeChanged` is false again here, and the run is simply
  // alive somewhere. Anything that wanted the death tile has had its chance by now.
  mem = observe(mem, world({ player: player({ worldX: 3222, worldZ: 3219, lifeId: 2 }) }), 1200);
  expect(mem.lastAliveAt).toEqual({ x: 3222, z: 3219, level: 0 });
});
