import { afterEach, expect, test, vi } from 'vitest';
import { encodeCollision } from '../data/gen/collisionFile';
import { createCollisionLoader } from './collision';
import { getDoorAt, initPathfinding, isTileWalkable, isZoneAllocated } from '../vendor/rs-sdk/sdk/pathfinding';

const bits = (): Uint8Array => { const b = new Uint8Array(512); b[0] = 1; return b; };
const binary = () => encodeCollision([{ mx: 50, mz: 50, levels: new Map([[0, bits()]]) }]);

const DOOR = { level: 0, x: (50 << 6) + 3, z: (50 << 6) + 4, shape: 0, angle: 2 };

/** A fetch that serves the encoded bitset for `.bin` and a door table for anything else. */
const serving = (bytes: Uint8Array, doors: unknown[] = []) => vi.fn(async (url: string) => url.endsWith('.bin')
  ? { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
  : { ok: true, status: 200, json: async () => ({ doors }) });

afterEach(() => { initPathfinding(null); });

test('loading installs the grid into the pathfinder', async () => {
  initPathfinding(null);
  const fetchImpl = serving(binary());
  const loader = createCollisionLoader({ binUrl: '/a.bin', doorsUrl: '/a.json', fetchImpl: fetchImpl as unknown as typeof fetch });

  expect(await loader.load()).toBe(true);
  expect(isTileWalkable(0, 50 << 6, 50 << 6)).toBe(false);
  expect(isZoneAllocated(0, 50 << 6, 50 << 6)).toBe(true);
  expect(loader.ready()).toBe(true);
});

test('the door table arrives with the blockrange the vendored type wants', async () => {
  initPathfinding(null);
  const fetchImpl = serving(binary(), [DOOR]);
  const loader = createCollisionLoader({ binUrl: '/a.bin', doorsUrl: '/a.json', fetchImpl: fetchImpl as unknown as typeof fetch });

  expect(await loader.load()).toBe(true);
  expect(getDoorAt(0, DOOR.x, DOOR.z)).toEqual({ ...DOOR, blockrange: false });
});

test('a failed fetch leaves the pathfinder permissive and says so', async () => {
  initPathfinding(null);
  const loader = createCollisionLoader({
    binUrl: '/a.bin', doorsUrl: '/a.json',
    fetchImpl: (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch
  });
  expect(await loader.load()).toBe(false);
  expect(loader.ready()).toBe(false);
  expect(isTileWalkable(0, 50 << 6, 50 << 6)).toBe(true);
});

test('a 404 leaves the pathfinder permissive too', async () => {
  initPathfinding(null);
  const fetchImpl = vi.fn(async () => ({ ok: false, status: 404 }));
  const loader = createCollisionLoader({ binUrl: '/a.bin', doorsUrl: '/a.json', fetchImpl: fetchImpl as unknown as typeof fetch });
  expect(await loader.load()).toBe(false);
  expect(isTileWalkable(0, 50 << 6, 50 << 6)).toBe(true);
});

test('a corrupt bitset leaves the pathfinder permissive rather than throwing at the caller', async () => {
  initPathfinding(null);
  const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const loader = createCollisionLoader({
    binUrl: '/a.bin', doorsUrl: '/a.json',
    fetchImpl: serving(junk) as unknown as typeof fetch
  });
  expect(await loader.load()).toBe(false);
  expect(isTileWalkable(0, 50 << 6, 50 << 6)).toBe(true);
});

test('two concurrent loads fetch once', async () => {
  const fetchImpl = serving(binary());
  const loader = createCollisionLoader({ binUrl: '/a.bin', doorsUrl: '/a.json', fetchImpl: fetchImpl as unknown as typeof fetch });
  await Promise.all([loader.load(), loader.load()]);
  expect(fetchImpl).toHaveBeenCalledTimes(2);   // one .bin and one .json, not two of each
});

test('a second load after success does not fetch again', async () => {
  const fetchImpl = serving(binary());
  const loader = createCollisionLoader({ binUrl: '/a.bin', doorsUrl: '/a.json', fetchImpl: fetchImpl as unknown as typeof fetch });
  expect(await loader.load()).toBe(true);
  expect(await loader.load()).toBe(true);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test('a failed load can be retried', async () => {
  let online = false;
  const bytes = binary();
  const fetchImpl = vi.fn(async (url: string) => {
    if (!online) throw new Error('offline');
    return url.endsWith('.bin')
      ? { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
      : { ok: true, status: 200, json: async () => ({ doors: [] }) };
  });
  const loader = createCollisionLoader({ binUrl: '/a.bin', doorsUrl: '/a.json', fetchImpl: fetchImpl as unknown as typeof fetch });
  expect(await loader.load()).toBe(false);
  online = true;
  expect(await loader.load()).toBe(true);
  expect(loader.ready()).toBe(true);
});

test('the committed assets resolve to real URLs, so the default deps are usable', async () => {
  const loader = createCollisionLoader();
  // No fetch is made here; the point is that the `?url` imports are wired and did not throw.
  expect(loader.ready()).toBe(false);
});
