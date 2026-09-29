import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { decodeCollision, encodeCollision } from './collisionFile';

const withTile = (x: number, z: number): Uint8Array => {
  const bits = new Uint8Array(512);
  const i = (x << 6) | z;
  bits[i >> 3] |= 1 << (i & 7);
  return bits;
};

// `Uint8Array.buffer` is an `ArrayBufferLike`, so slicing it yields `ArrayBuffer |
// SharedArrayBuffer` and `decodeCollision` takes an `ArrayBuffer`. Copy into one rather than
// asserting the union away. Audit C16.
const gridOf = (bytes: Uint8Array) => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return decodeCollision(buffer);
};

test('a round trip preserves every blocked tile at its absolute coordinates', () => {
  const grid = gridOf(encodeCollision([{ mx: 50, mz: 50, levels: new Map([[0, withTile(10, 20)]]) }]));
  expect(grid.blocked(0, (50 << 6) + 10, (50 << 6) + 20)).toBe(true);
  expect(grid.blocked(0, (50 << 6) + 11, (50 << 6) + 20)).toBe(false);
});

test('a square that is not in the file reads as unallocated, not as open', () => {
  const grid = gridOf(encodeCollision([{ mx: 50, mz: 50, levels: new Map([[0, new Uint8Array(512)]]) }]));
  expect(grid.hasSquare(0, (50 << 6) + 1, (50 << 6) + 1)).toBe(true);
  expect(grid.hasSquare(0, (99 << 6) + 1, (99 << 6) + 1)).toBe(false);
  // An unallocated square answers "not blocked" so a caller that ignores hasSquare still walks.
  expect(grid.blocked(0, (99 << 6) + 1, (99 << 6) + 1)).toBe(false);
});

test('a level the square does not carry is unallocated', () => {
  const grid = gridOf(encodeCollision([{ mx: 50, mz: 50, levels: new Map([[0, new Uint8Array(512)]]) }]));
  expect(grid.hasSquare(2, (50 << 6) + 1, (50 << 6) + 1)).toBe(false);
});

test('an all-zero level stays allocated but costs no payload bytes', () => {
  const empty = encodeCollision([{
    mx: 50, mz: 50,
    levels: new Map([[0, withTile(10, 20)], [1, new Uint8Array(512)], [2, new Uint8Array(512)]])
  }]);
  // Header + one index row + one stored level: levels 1 and 2 are allocated for free.
  expect(empty.byteLength).toBe(8 + 4 + 512);
  const grid = gridOf(empty);
  expect(grid.hasSquare(1, (50 << 6) + 1, (50 << 6) + 1)).toBe(true);
  expect(grid.blocked(1, (50 << 6) + 10, (50 << 6) + 20)).toBe(false);
  expect(grid.blocked(0, (50 << 6) + 10, (50 << 6) + 20)).toBe(true);
});

test('levels stay on their own plane after a drop reshuffles the payload', () => {
  // Level 0 is empty and stores nothing, so level 2's payload sits where level 0's would have.
  const grid = gridOf(encodeCollision([{
    mx: 50, mz: 50,
    levels: new Map([[0, new Uint8Array(512)], [2, withTile(10, 20)], [3, withTile(30, 40)]])
  }]));
  expect(grid.blocked(0, (50 << 6) + 10, (50 << 6) + 20)).toBe(false);
  expect(grid.blocked(2, (50 << 6) + 10, (50 << 6) + 20)).toBe(true);
  expect(grid.blocked(3, (50 << 6) + 10, (50 << 6) + 20)).toBe(false);
  expect(grid.blocked(3, (50 << 6) + 30, (50 << 6) + 40)).toBe(true);
  expect(grid.blocked(2, (50 << 6) + 30, (50 << 6) + 40)).toBe(false);
});

test('two squares keep their own payloads', () => {
  const grid = gridOf(encodeCollision([
    { mx: 50, mz: 50, levels: new Map([[0, withTile(10, 20)]]) },
    { mx: 51, mz: 50, levels: new Map([[0, withTile(30, 40)]]) }
  ]));
  expect(grid.squareCount).toBe(2);
  expect(grid.blocked(0, (50 << 6) + 10, (50 << 6) + 20)).toBe(true);
  expect(grid.blocked(0, (51 << 6) + 30, (50 << 6) + 40)).toBe(true);
  expect(grid.blocked(0, (51 << 6) + 10, (50 << 6) + 20)).toBe(false);
});

test('the header names itself, so a wrong file fails loudly', () => {
  expect(() => decodeCollision(new ArrayBuffer(8))).toThrow(/not a collision file/i);
});

test('a file whose payload was cut short fails loudly rather than reading garbage', () => {
  const bytes = encodeCollision([{ mx: 50, mz: 50, levels: new Map([[0, withTile(10, 20)]]) }]);
  const short = bytes.slice(0, bytes.byteLength - 1);
  expect(() => decodeCollision(short.buffer.slice(short.byteOffset, short.byteOffset + short.byteLength)))
    .toThrow(/truncated/i);
});

test('a square coordinate that does not fit its index byte fails the build', () => {
  expect(() => encodeCollision([{ mx: 300, mz: 50, levels: new Map([[0, withTile(1, 1)]]) }]))
    .toThrow(/does not fit the index row/);
});

test('a level plane of the wrong size fails the build', () => {
  expect(() => encodeCollision([{ mx: 50, mz: 50, levels: new Map([[0, new Uint8Array(511)]]) }]))
    .toThrow(/511 bytes, not 512/);
});

test('squares stay in a stable order regardless of input order', () => {
  const a = encodeCollision([
    { mx: 51, mz: 1, levels: new Map([[0, withTile(1, 1)]]) },
    { mx: 50, mz: 2, levels: new Map([[0, withTile(2, 2)]]) }
  ]);
  const b = encodeCollision([
    { mx: 50, mz: 2, levels: new Map([[0, withTile(2, 2)]]) },
    { mx: 51, mz: 1, levels: new Map([[0, withTile(1, 1)]]) }
  ]);
  expect([...a]).toEqual([...b]);
});

// Every fixture above builds its bits with the same `(x << 6) | z` expression the encoder uses,
// and each drives both halves of a round trip, so nothing up to here would notice if the whole
// pipeline agreed on a transposed layout. These probes are against the committed `collision.bin`
// at coordinates whose real-world answer is known, which is the only thing in the suite that
// pins the layout, the square index and the generator's absolute coordinates to an actual place
// on the map. Each transposed partner was checked against the committed file: they disagree, so
// the pairs are sensitive to a swap rather than merely self-consistent.
// Not `new URL('...', import.meta.url)`: Vite rewrites that pattern into an asset URL.
const COMMITTED = join(dirname(fileURLToPath(import.meta.url)), '..', 'collision.bin');

test('the committed collision.bin agrees with the map at known landmarks', () => {
  const file = readFileSync(COMMITTED);
  const grid = decodeCollision(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  expect(grid.squareCount).toBe(483);

  // Lumbridge castle courtyard: open ground you can stand on.
  expect(grid.hasSquare(0, 3222, 3218)).toBe(true);
  expect(grid.blocked(0, 3222, 3218)).toBe(false);
  // The River Lum east of Lumbridge: water, which the map flags BLOCK_MAP_SQUARE.
  expect(grid.blocked(0, 3245, 3230)).toBe(true);
  expect(grid.blocked(0, 3242, 3235)).toBe(true);
  // Open ocean: no map square was ever authored there.
  expect(grid.hasSquare(0, 2000, 2000)).toBe(false);

  // Two tiles whose transpose gives the opposite answer, so a swapped x/z cannot pass both.
  expect(grid.blocked(0, 3093, 3244)).toBe(false);   // walkable near Draynor
  expect(grid.blocked(0, 3244, 3093)).toBe(true);    // its transpose is not
  expect(grid.blocked(0, 3185, 3436)).toBe(false);   // walkable near the Varrock west bank
  expect(grid.blocked(0, 3436, 3185)).toBe(true);

  // And a square that exists whose transpose does not, which pins the index's mx/mz order.
  expect(grid.hasSquare(0, (32 << 6) + 1, (50 << 6) + 1)).toBe(true);
  expect(grid.hasSquare(0, (50 << 6) + 1, (32 << 6) + 1)).toBe(false);
});
