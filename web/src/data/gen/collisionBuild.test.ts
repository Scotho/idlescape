import { expect, test } from 'vitest';
import { parseConfigText } from './configs';
import { parseJm2 } from './jm2';
import { buildSquare, layerOf, locInfoOf, type LocInfo } from './collisionBuild';

const plain: LocInfo = { width: 1, length: 1, blockwalk: true, active: true, openable: false };
const LOCS = new Map<number, LocInfo>([
  [100, { ...plain, width: 2, length: 2 }],                       // a tree: 2x2, blocks
  [101, { ...plain, blockwalk: false }],                          // a flower: never blocks
  [102, { ...plain, width: 1, length: 3 }],                       // an oblong, to test the swap
  [103, { ...plain, openable: true }],                            // a door: a wall shape
  [104, { ...plain, active: false }]                              // ground decor that does not block
]);

const bit = (bits: Uint8Array, x: number, z: number): boolean => {
  const i = (x << 6) | z;
  return (bits[i >> 3] & (1 << (i & 7))) !== 0;
};

test('a land tile blocks only on flag bit 1', () => {
  const square = parseJm2(['==== MAP ====', '0 1 1: f1', '0 2 2: f4', '0 3 3: f24'].join('\n'), 50, 50);
  const { levels } = buildSquare(square, LOCS);
  expect(bit(levels.get(0)!, 1, 1)).toBe(true);
  expect(bit(levels.get(0)!, 2, 2)).toBe(false);
  // 24 is 0x18: REMOVE_ROOFS | VISIBLE_BELOW, no BLOCK_MAP_SQUARE bit.
  expect(bit(levels.get(0)!, 3, 3)).toBe(false);
});

test('a bridge tile moves the level below, not the level it is drawn on', () => {
  const square = parseJm2(['==== MAP ====', '1 4 4: f2', '1 5 5: f1'].join('\n'), 50, 50);
  const { levels } = buildSquare(square, LOCS);
  // level 1 with LINK_BELOW and no block bit: nothing is written anywhere.
  expect(bit(levels.get(1)!, 4, 4)).toBe(false);
  expect(bit(levels.get(0)!, 4, 4)).toBe(false);
  expect(bit(levels.get(1)!, 5, 5)).toBe(true);
});

test('a blocked level 1 tile that is bridged lands on level 0', () => {
  const square = parseJm2(['==== MAP ====', '1 6 6: f3'].join('\n'), 50, 50);
  const { levels } = buildSquare(square, LOCS);
  expect(bit(levels.get(0)!, 6, 6)).toBe(true);
  expect(bit(levels.get(1)!, 6, 6)).toBe(false);
});

test('a bridged level 0 tile is dropped, not clamped onto level 0', () => {
  // The engine computes actualLevel = -1 here and skips the tile outright
  // (GameMap.ts: `if (actualLevel < 0) continue`). Clamping would wall the ground floor.
  const square = parseJm2(['==== MAP ====', '0 7 7: f1', '1 7 7: f2'].join('\n'), 50, 50);
  const { levels } = buildSquare(square, LOCS);
  expect(bit(levels.get(0)!, 7, 7)).toBe(false);
  expect(bit(levels.get(1)!, 7, 7)).toBe(false);
});

test('a bridged level 0 loc is dropped too, and raises no door row', () => {
  const square = parseJm2(
    ['==== MAP ====', '1 8 8: f2', '1 9 9: f2', '==== LOC ====', '0 8 8: 100 10 0', '0 9 9: 103 0 2'].join('\n'),
    50, 50);
  const { levels, doors } = buildSquare(square, LOCS);
  expect(bit(levels.get(0)!, 8, 8)).toBe(false);
  expect(doors).toEqual([]);
});

test('a ground loc blocks its whole footprint', () => {
  const square = parseJm2(['==== LOC ====', '0 10 10: 100 10 0'].join('\n'), 50, 50);
  const { levels } = buildSquare(square, LOCS);
  expect(bit(levels.get(0)!, 10, 10)).toBe(true);
  expect(bit(levels.get(0)!, 11, 11)).toBe(true);
  expect(bit(levels.get(0)!, 12, 10)).toBe(false);
});

test('a footprint swaps its extents for angles 1 and 3', () => {
  const straight = buildSquare(parseJm2(['==== LOC ====', '0 20 20: 102 10 0'].join('\n'), 50, 50), LOCS);
  const turned = buildSquare(parseJm2(['==== LOC ====', '0 20 20: 102 10 1'].join('\n'), 50, 50), LOCS);
  expect(bit(straight.levels.get(0)!, 20, 22)).toBe(true);
  expect(bit(straight.levels.get(0)!, 22, 20)).toBe(false);
  expect(bit(turned.levels.get(0)!, 22, 20)).toBe(true);
  expect(bit(turned.levels.get(0)!, 20, 22)).toBe(false);
});

test('angle 3 swaps like angle 1, and angle 2 does not swap', () => {
  const three = buildSquare(parseJm2(['==== LOC ====', '0 20 20: 102 10 3'].join('\n'), 50, 50), LOCS);
  const two = buildSquare(parseJm2(['==== LOC ====', '0 20 20: 102 10 2'].join('\n'), 50, 50), LOCS);
  expect(bit(three.levels.get(0)!, 22, 20)).toBe(true);
  expect(bit(three.levels.get(0)!, 20, 22)).toBe(false);
  expect(bit(two.levels.get(0)!, 20, 22)).toBe(true);
  expect(bit(two.levels.get(0)!, 22, 20)).toBe(false);
});

test('blockwalk=no and inactive ground decor leave the tile walkable', () => {
  const { levels } = buildSquare(
    parseJm2(['==== LOC ====', '0 30 30: 101 10 0', '0 31 31: 104 22 0'].join('\n'), 50, 50), LOCS);
  expect(bit(levels.get(0)!, 30, 30)).toBe(false);
  expect(bit(levels.get(0)!, 31, 31)).toBe(false);
});

test('active ground decor blocks its one tile', () => {
  const { levels } = buildSquare(parseJm2(['==== LOC ====', '0 32 32: 100 22 0'].join('\n'), 50, 50), LOCS);
  // Loc 100 is 2x2, but GROUND_DECOR blocks a single tile whatever the footprint says.
  expect(bit(levels.get(0)!, 32, 32)).toBe(true);
  expect(bit(levels.get(0)!, 33, 33)).toBe(false);
});

test('a wall shape stays out of the bitset and becomes a door row instead (ruling R1)', () => {
  const { levels, doors } = buildSquare(parseJm2(['==== LOC ====', '0 40 40: 103 0 2'].join('\n'), 50, 50), LOCS);
  expect(bit(levels.get(0)!, 40, 40)).toBe(false);
  expect(doors).toEqual([{ level: 0, x: 40, z: 40, shape: 0, angle: 2 }]);
});

test('a wall that does not open raises no door row', () => {
  const { doors } = buildSquare(parseJm2(['==== LOC ====', '0 41 41: 100 0 2'].join('\n'), 50, 50), LOCS);
  expect(doors).toEqual([]);
});

test('a loc with no config entry is ignored entirely', () => {
  const { levels, doors } = buildSquare(parseJm2(['==== LOC ====', '0 42 42: 999 10 0'].join('\n'), 50, 50), LOCS);
  expect(bit(levels.get(0)!, 42, 42)).toBe(false);
  expect(doors).toEqual([]);
});

test("layerOf follows the engine's shape table", () => {
  expect([0, 1, 2, 3].map(layerOf)).toEqual(['wall', 'wall', 'wall', 'wall']);
  expect([4, 8].map(layerOf)).toEqual(['walldecor', 'walldecor']);
  expect([9, 10, 21].map(layerOf)).toEqual(['ground', 'ground', 'ground']);
  expect(layerOf(22)).toBe('grounddecor');
});

const block = (lines: string[]) => parseConfigText(['[thing]', ...lines].join('\n')).get('thing')!;
const MODELS = new Set(['tree_model', 'floor_puddle_0']);

test('locInfoOf takes the LocType defaults when the config says nothing', () => {
  expect(locInfoOf(block([]), MODELS)).toEqual({
    width: 1, length: 1, blockwalk: true, active: false, openable: false
  });
});

test('locInfoOf reads width, length and blockwalk straight off the config', () => {
  expect(locInfoOf(block(['width=2', 'length=3', 'blockwalk=no']), MODELS))
    .toMatchObject({ width: 2, length: 3, blockwalk: false });
});

test('an explicit active wins over anything postDecode would derive', () => {
  expect(locInfoOf(block(['active=no', 'op1=Open', 'model=tree_model']), MODELS).active).toBe(false);
  expect(locInfoOf(block(['active=yes']), MODELS).active).toBe(true);
  // The packer's getConfigBoolean also takes `true` and `1`.
  expect(locInfoOf(block(['active=1']), MODELS).active).toBe(true);
});

test('a derived active follows postDecode: an op, or a model that resolves verbatim', () => {
  expect(locInfoOf(block(['op1=Search']), MODELS).active).toBe(true);
  expect(locInfoOf(block(['model=tree_model']), MODELS).active).toBe(true);
  expect(locInfoOf(block(['model1=tree_model', 'model2=nothing']), MODELS).active).toBe(true);
});

test('a model that only resolves through a shape suffix leaves active off', () => {
  // `[puddle]` is `model=floor_puddle`, and model.pack holds only `floor_puddle_0`. The packer
  // writes shapes [22], postDecode sees shapes[0] !== 10, and the puddle does not block.
  expect(locInfoOf(block(['model=floor_puddle']), MODELS).active).toBe(false);
});

test('our ops() skips a hidden op, which diverges from the engine (deliberately)', () => {
  // The engine would call this loc active: the packer writes `hidden` verbatim as an op string
  // and LocType.decode sets `op` for any of opcodes 30-34, so postDecode sees `op !== null`.
  // `ops()` (web/src/data/gen/configs.ts, Task 3) drops it instead, so we call it inactive. Kept
  // as-is: no loc config in the pinned content has only hidden ops, so the divergence changes
  // not one bit of collision.bin, and configs.ts is shared with the atlas generator.
  expect(locInfoOf(block(['op1=hidden']), MODELS).active).toBe(false);
  expect(locInfoOf(block(['op1=Open']), MODELS).openable).toBe(true);
  expect(locInfoOf(block(['op2=open']), MODELS).openable).toBe(true);
  expect(locInfoOf(block(['op1=Close', 'op2=Search']), MODELS).openable).toBe(false);
});
