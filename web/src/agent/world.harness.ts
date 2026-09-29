// web/src/agent/world.harness.ts
// A whole `WorldState`, and the `PlayerState` and `InventoryItem` inside it, for the tests that
// need a real one rather than a cast.
//
// `WorldState` is the vendored rs-sdk `BotWorldState` plus the idlescape extras, and twenty of its
// members are required. Before audit C16 put the test files into a typechecked program, fixtures
// named the three or four fields the code under test reads and reached for `as unknown as
// WorldState` for the rest, which is how a renamed field survives a green suite. Build from here
// and the compiler fills the gaps: `over` patches only what a test is actually about.
//
// Harness files are outside the shipped program (web/tsconfig.json excludes both harness globs and
// web/tsconfig.test.json includes them), so nothing here reaches a bundle.
import type { WorldState } from '../clientTypes';
import type { InventoryItem, PlayerState } from '../vendor/rs-sdk/sdk/types';

/** One inventory or equipment slot. `optionsWithIndex` is required and is empty by default. */
export const inventoryItem = (slot: number, id: number, name: string, count = 1): InventoryItem =>
  ({ slot, id, name, count, optionsWithIndex: [] });

/** A living player standing at Lumbridge, out of combat. */
export const playerState = (over: Partial<PlayerState> = {}): PlayerState => ({
  name: 'Zezima', combatLevel: 3, hp: 10, maxHp: 10,
  x: 32, z: 32, worldX: 3222, worldZ: 3218, level: 0,
  runEnergy: 100, runWeight: 0, animId: -1, spotanimId: -1,
  combat: { inCombat: false, targetIndex: -1, targetType: 'none', lastDamageTick: -1 },
  isDead: false, lifeId: 1, respawnCount: 0, lastDeathTick: null,
  ...over
});

/** An in-game world with nothing happening in it. */
export const worldState = (over: Partial<WorldState> = {}): WorldState => ({
  tick: 1,
  inGame: true,
  player: playerState(),
  skills: [],
  inventory: [],
  equipment: [],
  nearbyNpcs: [], nearbyPlayers: [], nearbyLocs: [], groundItems: [],
  gameMessages: [], recentDialogs: [],
  dialog: { isOpen: false, options: [], isWaiting: false },
  interface: { isOpen: false, interfaceId: -1, options: [] },
  shop: { isOpen: false, title: '', shopItems: [], playerItems: [] },
  bank: { isOpen: false, items: [], noteMode: false },
  modalOpen: false,
  modalInterface: -1,
  combatEvents: [],
  prayers: { activePrayers: [], prayerPoints: 0, prayerLevel: 1 },
  hint: { kind: 'none' },
  tutorial: { open: false, title: '', lines: [] },
  flashingTab: null,
  interfaceTexts: {},
  regionId: 12336,
  zone: { x: 3222 >> 3, z: 3218 >> 3 },
  ...over
});
