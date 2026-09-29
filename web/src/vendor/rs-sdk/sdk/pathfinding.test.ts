import { afterEach, expect, test } from 'vitest';
import { encodeCollision, decodeCollision } from '../../../data/gen/collisionFile';
import { findDoorsAlongPath, findLongPath, getDoorAt, initPathfinding, isTileWalkable, isZoneAllocated, TemporaryDoorBlocklist } from './pathfinding';

const MX = 50, MZ = 50, BASE_X = MX << 6, BASE_Z = MZ << 6;
const GAP_X = BASE_X + 40, WALL_Z = BASE_Z + 10;

const gridOf = (bytes: Uint8Array) =>
  decodeCollision(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

/** A wall along local z = 10, with a gap at local x = 40 unless `sealed`. */
function wallBits(sealed: boolean): Uint8Array {
  const bits = new Uint8Array(512);
  for (let x = 0; x < 64; x++) {
    if (!sealed && x === 40) continue;
    const i = (x << 6) | 10;
    bits[i >> 3] |= 1 << (i & 7);
  }
  return bits;
}

const DOOR = { level: 0, x: GAP_X, z: WALL_Z, shape: 0, angle: 0, blockrange: false };

function world(): void {
  const grid = gridOf(encodeCollision([{ mx: MX, mz: MZ, levels: new Map([[0, wallBits(false)]]) }]));
  initPathfinding({ grid, doors: [DOOR] });
}

/**
 * An L-shaped corridor: one tile east from the source, then north. Everything else in the square
 * is wall, so the route has to turn on its very first tile. `world()` cannot catch a turn there
 * because its route runs straight east out of the source.
 */
function corridor(): void {
  const bits = new Uint8Array(512);
  const open = new Set([`5,5`, `6,5`]);
  for (let z = 5; z <= 30; z++) open.add(`6,${z}`);
  for (let x = 0; x < 64; x++) {
    for (let z = 0; z < 64; z++) {
      if (open.has(`${x},${z}`)) continue;
      const i = (x << 6) | z;
      bits[i >> 3] |= 1 << (i & 7);
    }
  }
  initPathfinding({ grid: gridOf(encodeCollision([{ mx: MX, mz: MZ, levels: new Map([[0, bits]]) }])), doors: [] });
}

/**
 * Every tile a walker crosses following the waypoints. `walkTo` hands each leg to the client's
 * own routefinder, so a leg that clips a wall is a route through the wall even when no waypoint
 * lands on a blocked tile.
 */
function tilesAlong(path: Array<{ x: number; z: number }>, srcX: number, srcZ: number): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = [];
  let at = { x: srcX, z: srcZ };
  for (const wp of path) {
    const steps = Math.max(Math.abs(wp.x - at.x), Math.abs(wp.z - at.z));
    for (let i = 1; i <= steps; i++) {
      out.push({
        x: at.x + Math.round(((wp.x - at.x) * i) / steps),
        z: at.z + Math.round(((wp.z - at.z) * i) / steps)
      });
    }
    at = { x: wp.x, z: wp.z };
  }
  return out;
}

afterEach(() => { initPathfinding(null); });

test('with no data loaded every predicate stays permissive, exactly as the stub was', () => {
  initPathfinding(null);
  expect(isTileWalkable(0, BASE_X + 5, WALL_Z)).toBe(true);
  expect(isZoneAllocated(0, BASE_X + 5, WALL_Z)).toBe(true);
  expect(findLongPath(0, BASE_X + 5, BASE_Z + 5, BASE_X + 5, BASE_Z + 30).length).toBeGreaterThan(0);
  expect(getDoorAt(0, GAP_X, WALL_Z)).toBeUndefined();
});

test('initPathfinding(null) puts the permissive answers back', () => {
  world();
  expect(isTileWalkable(0, BASE_X + 5, WALL_Z)).toBe(false);
  initPathfinding(null);
  expect(isTileWalkable(0, BASE_X + 5, WALL_Z)).toBe(true);
  expect(isZoneAllocated(0, (99 << 6) + 5, (99 << 6) + 5)).toBe(true);
  expect(getDoorAt(0, GAP_X, WALL_Z)).toBeUndefined();
});

test('a blocked tile reads as blocked and its square reads as allocated', () => {
  world();
  expect(isTileWalkable(0, BASE_X + 5, WALL_Z)).toBe(false);
  expect(isTileWalkable(0, GAP_X, WALL_Z)).toBe(true);
  expect(isZoneAllocated(0, BASE_X + 5, WALL_Z)).toBe(true);
  expect(isZoneAllocated(0, (99 << 6) + 5, (99 << 6) + 5)).toBe(false);
});

test('a path across the wall goes through the gap, and never through the wall', () => {
  world();
  const path = findLongPath(0, BASE_X + 5, BASE_Z + 5, BASE_X + 5, BASE_Z + 30);
  expect(path.length).toBeGreaterThan(0);
  expect(path[path.length - 1]).toMatchObject({ x: BASE_X + 5, z: BASE_Z + 30 });
  for (const wp of path) expect(isTileWalkable(0, wp.x, wp.z)).toBe(true);
  // The only opening is the gap column, so the route has to reach it.
  expect(path.some(wp => wp.x === GAP_X)).toBe(true);
  // And every tile between the waypoints has to be walkable, not just the waypoints.
  const crossed = tilesAlong(path, BASE_X + 5, BASE_Z + 5);
  for (const tile of crossed) expect(isTileWalkable(0, tile.x, tile.z)).toBe(true);
  expect(crossed.some(t => t.x === GAP_X && t.z === WALL_Z)).toBe(true);
});

test('a route that turns on its first tile does not cut the corner', () => {
  corridor();
  const path = findLongPath(0, BASE_X + 5, BASE_Z + 5, BASE_X + 6, BASE_Z + 30);
  expect(path.length).toBeGreaterThan(0);
  expect(path[path.length - 1]).toMatchObject({ x: BASE_X + 6, z: BASE_Z + 30 });
  // The turn is at (6,5), one step from the source, so it has to be the first waypoint. Without
  // it the leg from the source runs diagonally and clips the wall column at x = 5.
  expect(path[0]).toMatchObject({ x: BASE_X + 6, z: BASE_Z + 5 });
  for (const tile of tilesAlong(path, BASE_X + 5, BASE_Z + 5)) {
    expect(isTileWalkable(0, tile.x, tile.z)).toBe(true);
  }
});

test('a route never leaves the squares the file carries', () => {
  world();
  // Detouring through the unallocated squares either side would be far shorter than the gap;
  // the engine allocates zones only for squares it loaded, and off-map is not walkable.
  const path = findLongPath(0, BASE_X + 5, BASE_Z + 5, BASE_X + 5, BASE_Z + 30);
  for (const tile of tilesAlong(path, BASE_X + 5, BASE_Z + 5)) {
    expect(isZoneAllocated(0, tile.x, tile.z)).toBe(true);
  }
});

test('consecutive waypoints are never more than 20 tiles apart', () => {
  world();
  const path = findLongPath(0, BASE_X + 5, BASE_Z + 5, BASE_X + 5, BASE_Z + 30);
  let prev = { x: BASE_X + 5, z: BASE_Z + 5 };
  for (const wp of path) {
    expect(Math.max(Math.abs(wp.x - prev.x), Math.abs(wp.z - prev.z))).toBeLessThanOrEqual(20);
    prev = wp;
  }
});

test('an unreachable destination comes back as the best partial path, not as nothing', () => {
  // Seal the gap: nothing can cross.
  const grid = gridOf(encodeCollision([{ mx: MX, mz: MZ, levels: new Map([[0, wallBits(true)]]) }]));
  initPathfinding({ grid, doors: [] });
  const path = findLongPath(0, BASE_X + 5, BASE_Z + 5, BASE_X + 5, BASE_Z + 30);
  expect(path.length).toBeGreaterThan(0);
  expect(path[path.length - 1].z).toBeLessThan(WALL_Z);
});

test('a destination the walker already stands on comes back empty rather than looping', () => {
  world();
  expect(findLongPath(0, BASE_X + 5, BASE_Z + 5, BASE_X + 5, BASE_Z + 5)).toEqual([]);
});

test('a blocked door is treated as a wall for this query only', () => {
  world();
  expect(getDoorAt(0, GAP_X, WALL_Z)).toMatchObject({ x: GAP_X });
  const path = findLongPath(0, BASE_X + 5, BASE_Z + 5, BASE_X + 5, BASE_Z + 30, 500, [DOOR]);
  expect(path[path.length - 1].z).toBeLessThan(WALL_Z);
  // The next query, with no blocklist, still gets through.
  expect(findLongPath(0, BASE_X + 5, BASE_Z + 5, BASE_X + 5, BASE_Z + 30).some(wp => wp.x === GAP_X)).toBe(true);
});

test('the blocklist reports the generated rows for the doors it holds', () => {
  world();
  const list = new TemporaryDoorBlocklist();
  expect(list.active()).toEqual([]);
  list.block(DOOR);
  expect(list.has(0, GAP_X, WALL_Z)).toBe(true);
  expect(list.active()).toEqual([DOOR]);
  list.clear();
  expect(list.active()).toEqual([]);
});

test('a blocklist entry with no matching door row contributes nothing', () => {
  world();
  const list = new TemporaryDoorBlocklist();
  list.block({ level: 0, x: BASE_X + 1, z: BASE_Z + 1, shape: 0, angle: 0, blockrange: false });
  expect(list.has(0, BASE_X + 1, BASE_Z + 1)).toBe(true);
  expect(list.active()).toEqual([]);
});

test('findDoorsAlongPath picks up a door beside a waypoint, once', () => {
  world();
  expect(findDoorsAlongPath([{ level: 0, x: GAP_X, z: WALL_Z - 1 }, { level: 0, x: GAP_X, z: WALL_Z + 1 }]))
    .toEqual([DOOR]);
  expect(findDoorsAlongPath([{ level: 0, x: BASE_X + 5, z: BASE_Z + 5 }])).toEqual([]);
});

test('a destination beyond the BFS window comes back empty, not as a partial path', () => {
  // Characterisation, not an endorsement. Ruling R7 says a query wider than the padding degrades
  // to a partial path; it does not. `width` is min(MAX_SPAN, |dx| + PAD * 2 + 1) and the window
  // starts PAD before the nearer end, so the destination falls outside once |dx| reaches
  // MAX_SPAN - PAD = 896, and `findLongPath` returns [] at its `inside(destX, destZ)` guard.
  // Harmless while travel.to splits plans into 60-tile legs. Pinned so it cannot drift quietly.
  const open = new Uint8Array(512);
  const squares = [];
  for (let mx = 40; mx < 80; mx++) squares.push({ mx, mz: MZ, levels: new Map([[0, open]]) });
  // One blocked tile keeps a level from being dropped as empty, so every square stays allocated.
  squares[0] = { mx: 40, mz: MZ, levels: new Map([[0, wallBits(true)]]) };
  const grid = gridOf(encodeCollision(squares));
  initPathfinding({ grid, doors: [] });

  const x = BASE_X + 1, z = BASE_Z + 1;
  expect(findLongPath(0, x, z, x + 895, z).length).toBeGreaterThan(0);
  expect(findLongPath(0, x, z, x + 896, z)).toEqual([]);
});

test('the maxWaypoints cap is honoured', () => {
  world();
  const path = findLongPath(0, BASE_X + 5, BASE_Z + 5, BASE_X + 5, BASE_Z + 30, 2);
  expect(path.length).toBe(2);
});
