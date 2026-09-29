// NOT vendored - ours. Upstream's module is a global A* over a 6 MB collision dump run through
// the native `rsmod-pathfinder`; we ship neither. This is the same contract over the collision
// bitset SP4b generates (`web/src/data/collision.bin`, `scripts/gen/collision.ts`): the exported
// names and signatures match upstream exactly, so `index.ts` and `actions.ts` need no edits.
//
// With no data loaded every predicate stays permissive, which is what SP4a shipped: a failed
// fetch degrades walking to dead reckoning rather than refusing to move.
import type { CollisionGrid } from '../../../data/gen/collisionFile';

export interface DoorInfo { level: number; x: number; z: number; shape: number; angle: number; blockrange: boolean }
export interface PathfindingData { grid: CollisionGrid; doors: DoorInfo[] }

/** Ruling R7: the BFS window is the query's bounding box padded by this, capped by MAX_SPAN. */
const PAD = 128;
const MAX_SPAN = 1024;
/** `walkStepToward` is written for short hops; the client routefinder does the fine work. */
const MAX_LEG = 20;
/** 4-connected. The client's own routefinder resolves the diagonals inside a scene. */
const STEPS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

let grid: CollisionGrid | null = null;
let doorsByTile = new Map<string, DoorInfo>();

const key = (level: number, x: number, z: number): string => `${level},${x},${z}`;

export class TemporaryDoorBlocklist {
    private keys = new Set<string>();

    block(door: DoorInfo, _ttlMs: number = 30_000): void {
        this.keys.add(key(door.level, door.x, door.z));
    }

    has(level: number, x: number, z: number): boolean {
        return this.keys.has(key(level, x, z));
    }

    /** The doors this session has evidence against, as rows a path query can re-wall. */
    active(): DoorInfo[] {
        const out: DoorInfo[] = [];
        for (const k of this.keys) {
            const door = doorsByTile.get(k);
            if (door) out.push(door);
        }
        return out;
    }

    clear(): void {
        this.keys.clear();
    }
}

/** Called once per Worker by `web/src/tasks/collision.ts`; `null` restores the permissive stub. */
export function initPathfinding(data: PathfindingData | null): void {
    grid = data?.grid ?? null;
    doorsByTile = new Map((data?.doors ?? []).map(d => [key(d.level, d.x, d.z), d]));
}

export function isZoneAllocated(level: number, x: number, z: number): boolean {
    return grid ? grid.hasSquare(level, x, z) : true;
}

export function isTileWalkable(level: number, x: number, z: number): boolean {
    return grid ? !grid.blocked(level, x, z) : true;
}

export function isFlagged(_x: number, _z: number, _level: number, _masks: number): boolean {
    return false;
}

export function isZoneLikelyLand(level: number, x: number, z: number): boolean {
    return isZoneAllocated(level, x, z);
}

export function getDoorAt(level: number, x: number, z: number): DoorInfo | undefined {
    return doorsByTile.get(key(level, x, z));
}

/** Every door the path passes through or beside, so `walkTo` can open them proactively. */
export function findDoorsAlongPath(waypoints: Array<{ x: number; z: number; level: number }>): DoorInfo[] {
    const out = new Map<string, DoorInfo>();
    for (const wp of waypoints) {
        for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const door = doorsByTile.get(key(wp.level, wp.x + dx, wp.z + dz));
            if (door) out.set(key(door.level, door.x, door.z), door);
        }
    }
    return [...out.values()];
}

/**
 * Breadth-first over the collision bitset, 4-connected. Returns waypoints from just after the
 * source to the destination, or - when the destination cannot be reached - to the reachable tile
 * closest to it, which is what the vendored `walkTo` treats as a partial path and walks once.
 *
 * A tile in a square the file does not carry is impassable here even though `isTileWalkable`
 * calls it walkable. Those two answer different questions: the predicate is upstream's "is this
 * tile flagged blocked", while a route may not leave the loaded map, which is the engine's own
 * rule (it allocates routefinder zones only for the squares it loads, and an unallocated zone
 * blocks). Without this the BFS would happily detour through the void around a map square.
 */
export function findLongPath(
    level: number,
    srcX: number,
    srcZ: number,
    destX: number,
    destZ: number,
    maxWaypoints: number = 500,
    blockedDoors: Iterable<DoorInfo> = []
): Array<{ x: number; z: number; level: number }> {
    const map = grid;
    if (!map) return straightLine(level, srcX, srcZ, destX, destZ);

    const minX = Math.max(0, Math.min(srcX, destX) - PAD);
    const minZ = Math.max(0, Math.min(srcZ, destZ) - PAD);
    const width = Math.min(MAX_SPAN, Math.abs(destX - srcX) + PAD * 2 + 1);
    const height = Math.min(MAX_SPAN, Math.abs(destZ - srcZ) + PAD * 2 + 1);
    const inside = (x: number, z: number): boolean => x >= minX && z >= minZ && x < minX + width && z < minZ + height;
    if (!inside(srcX, srcZ) || !inside(destX, destZ)) return [];

    const walled = new Set<string>();
    for (const door of blockedDoors) walled.add(key(door.level, door.x, door.z));

    const index = (x: number, z: number): number => (x - minX) * height + (z - minZ);
    const cameFrom = new Int32Array(width * height).fill(-1);
    const seen = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let head = 0, tail = 0;

    const start = index(srcX, srcZ);
    seen[start] = 1;
    queue[tail++] = start;
    let best = start;
    const startDist = Math.max(Math.abs(srcX - destX), Math.abs(srcZ - destZ));
    let bestDist = startDist;
    let found = false;

    while (head < tail) {
        const at = queue[head++];
        const x = minX + Math.floor(at / height);
        const z = minZ + (at % height);
        const dist = Math.max(Math.abs(x - destX), Math.abs(z - destZ));
        if (dist < bestDist) { bestDist = dist; best = at; }
        if (x === destX && z === destZ) { best = at; found = true; break; }
        for (const [dx, dz] of STEPS) {
            const nx = x + dx, nz = z + dz;
            if (!inside(nx, nz)) continue;
            const next = index(nx, nz);
            if (seen[next]) continue;
            seen[next] = 1;
            if (!map.hasSquare(level, nx, nz)) continue;
            if (map.blocked(level, nx, nz)) continue;
            if (walled.has(key(level, nx, nz))) continue;
            cameFrom[next] = at;
            queue[tail++] = next;
        }
    }
    if (!found && bestDist === startDist) return [];

    const tiles: Array<{ x: number; z: number }> = [];
    for (let at = best; at !== -1 && at !== start; at = cameFrom[at]) {
        tiles.push({ x: minX + Math.floor(at / height), z: minZ + (at % height) });
    }
    tiles.reverse();
    return simplify(tiles, level, maxWaypoints, { x: srcX, z: srcZ });
}

/**
 * Corners, plus a point at least every MAX_LEG tiles. Handing `walkTo` one waypoint per tile
 * would make it walk the route a step at a time; handing it only the endpoints would let its
 * `walkStepToward` cut the corner into a wall.
 *
 * The waypoint emitted at a turn is the corner tile itself, not the first tile of the new
 * direction. Emitting the tile after the corner is the same bug in miniature: it leaves one leg
 * running diagonally past the corner, which is exactly the line `walkStepToward` would cut.
 */
function simplify(
    tiles: Array<{ x: number; z: number }>,
    level: number,
    maxWaypoints: number,
    from: { x: number; z: number }
): Array<{ x: number; z: number; level: number }> {
    const step = (a: { x: number; z: number }, b: { x: number; z: number }): string =>
        `${Math.sign(b.x - a.x)},${Math.sign(b.z - a.z)}`;
    const out: Array<{ x: number; z: number; level: number }> = [];
    let sinceLast = 0;
    for (let i = 0; i < tiles.length; i++) {
        sinceLast++;
        const last = i === tiles.length - 1;
        // The step into this tile against the step out of it. `tiles[0]` has no predecessor in
        // the array, so the source stands in as a virtual `tiles[-1]`: a route that turns on its
        // very first tile turns there whether or not this function can see the tile before it,
        // and skipping the test would leave the leg from the source to the next waypoint running
        // diagonally across the corner. That is the same defect as emitting the tile after a
        // corner, relocated to the head of the route.
        const before = i === 0 ? from : tiles[i - 1];
        const turns = !last && step(before, tiles[i]) !== step(tiles[i], tiles[i + 1]);
        if (last || turns || sinceLast >= MAX_LEG) {
            out.push({ x: tiles[i].x, z: tiles[i].z, level });
            sinceLast = 0;
        }
    }
    return out.length > maxWaypoints ? out.slice(0, maxWaypoints) : out;
}

/** The SP4a behaviour, kept for the no-data case: straight-line legs of at most MAX_LEG tiles. */
function straightLine(
    level: number,
    srcX: number,
    srcZ: number,
    destX: number,
    destZ: number
): Array<{ x: number; z: number; level: number }> {
    const out: Array<{ x: number; z: number; level: number }> = [];
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(destX - srcX), Math.abs(destZ - srcZ)) / MAX_LEG));
    for (let i = 1; i <= steps; i++) {
        out.push({
            x: Math.round(srcX + ((destX - srcX) * i) / steps),
            z: Math.round(srcZ + ((destZ - srcZ) * i) / steps),
            level
        });
    }
    return out;
}
