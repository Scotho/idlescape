import { expect, test, vi } from 'vitest';
import { createAtlasLoader } from './atlas';
import type { Atlas } from './types';

const ATLAS: Atlas = {
  version: 1, source: { contentSha: 'x' },
  kinds: { tree: { label: 'tree', op: 'Chop down' } } as Atlas['kinds'],
  clusters: [
    { id: 1, kind: 'tree', variant: 'tree', level: 0, x: 3200, z: 3200, n: 4, r: 3, region: 0 },
    { id: 2, kind: 'tree', variant: 'oaktree', level: 0, x: 3210, z: 3200, n: 2, r: 1, region: 0 },
    { id: 3, kind: 'tree', variant: 'tree', level: 1, x: 3201, z: 3200, n: 1, r: 0, region: 0 }
  ],
  landmarks: [{ id: 'lumbridge', kind: 'town', name: 'Lumbridge castle', level: 0, x: 3222, z: 3218 }],
  routes: []
};

const loader = (fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ATLAS })) =>
  ({ fetchImpl, loader: createAtlasLoader({ url: '/assets/atlas.json', fetchImpl }) });

test('the atlas is fetched once, however many callers ask for it', async () => {
  const { fetchImpl, loader: l } = loader();
  await Promise.all([l.load(), l.load()]);
  await l.load();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('peek answers null until load has resolved, then the atlas', async () => {
  const { loader: l } = loader();
  expect(l.peek()).toBeNull();
  await l.load();
  expect(l.peek()).toBe(await l.load());
});

test('a failed fetch answers null and is retried on the next call', async () => {
  const fetchImpl = vi.fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ ok: true, json: async () => ATLAS });
  const l = createAtlasLoader({ url: '/a.json', fetchImpl });
  expect(await l.load()).toBeNull();
  expect(await l.load()).not.toBeNull();
});

test('nearestCluster picks by distance', async () => {
  const { loader: l } = loader();
  const atlas = (await l.load())!;
  expect(l.nearestCluster(atlas, 'tree', { x: 3208, z: 3200, level: 0 })!.id).toBe(2);
});

test('nearestCluster never crosses a level, even to a strictly nearer cluster', async () => {
  const { loader: l } = loader();
  const atlas = (await l.load())!;
  // Cluster 1 sits on this exact tile one level down, so distance alone would answer it.
  // Only the level guard keeps the answer on cluster 3, which is a tile away on level 1.
  expect(l.nearestCluster(atlas, 'tree', { x: 3200, z: 3200, level: 1 })!.id).toBe(3);
});

test('a fetch the server refuses answers null rather than caching the error body', async () => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ oops: true }) });
  const l = createAtlasLoader({ url: '/missing.json', fetchImpl });
  expect(await l.load()).toBeNull();
  expect(l.peek()).toBeNull();
});

test('a variant filter matches the variant, not the kind', async () => {
  const { loader: l } = loader();
  const atlas = (await l.load())!;
  expect(l.nearestCluster(atlas, 'tree', { x: 3200, z: 3200, level: 0 }, { variant: 'oaktree' })!.id).toBe(2);
  expect(l.nearestCluster(atlas, 'tree', { x: 3200, z: 3200, level: 0 }, { variant: /oak/ })!.id).toBe(2);
});

test('a string variant is matched case-insensitively, as FindOpts documents and find.ts does', async () => {
  const { loader: l } = loader();
  const atlas = (await l.load())!;
  // Exact comparison here would make one option mean two things: `variant: 'Oaktree'` would
  // match a scene entry and silently find zero clusters.
  expect(l.nearestCluster(atlas, 'tree', { x: 3200, z: 3200, level: 0 }, { variant: 'Oaktree' })!.id).toBe(2);
  expect(l.nearestCluster(atlas, 'tree', { x: 3200, z: 3200, level: 0 }, { variant: 'OAKTREE' })!.id).toBe(2);
  // A RegExp is still tested exactly as written, so a case-sensitive one still refuses.
  expect(l.nearestCluster(atlas, 'tree', { x: 3200, z: 3200, level: 0 }, { variant: /Oak/ })).toBeNull();
});

test('maxDistance refuses a cluster that is further away rather than returning the least bad one', async () => {
  const { loader: l } = loader();
  const atlas = (await l.load())!;
  expect(l.nearestCluster(atlas, 'tree', { x: 3400, z: 3400, level: 0 }, { maxDistance: 20 })).toBeNull();
});

test('landmark answers by id, and null for one the atlas does not carry', async () => {
  const { loader: l } = loader();
  const atlas = (await l.load())!;
  expect(l.landmark(atlas, 'lumbridge')!.name).toBe('Lumbridge castle');
  expect(l.landmark(atlas, 'atlantis')).toBeNull();
});
