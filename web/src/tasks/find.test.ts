import { expect, test, vi } from 'vitest';
import { createFind, matchesKind, rescanRadius, DEFAULT_RADIUS, MAX_RADIUS, SWEEP_POINTS, SWEEP_RINGS } from './find';
import { createAtlasLoader } from './atlas';
import { resolveTarget } from './travel';
import type { Travel } from './travel';
import type { Atlas, AtlasCluster, TargetEvent, TravelTarget } from './types';
import type { WorldState } from '../agent/types';

const SWEEP_ALL = SWEEP_POINTS * SWEEP_RINGS.length;
const cheb = (ax: number, az: number, bx: number, bz: number): number => Math.max(Math.abs(ax - bx), Math.abs(az - bz));

/**
 * Tree clusters really are built this wide: `r` reaches 46 in the committed atlas, which is why
 * the post-atlas re-scan cannot use the 15-tile default.
 */
const ATLAS: Atlas = {
  version: 1, source: { contentSha: 'x' },
  kinds: {} as Atlas['kinds'],
  clusters: [
    { id: 1, kind: 'tree', variant: 'oaktree', level: 0, x: 3260, z: 3200, n: 5, r: 46, region: 0 },
    { id: 2, kind: 'tree', variant: 'tree', level: 0, x: 3600, z: 3200, n: 9, r: 4, region: 0 },
    { id: 3, kind: 'rock', variant: 'rock_copper', level: 1, x: 3260, z: 3200, n: 3, r: 18, region: 0 }
  ],
  landmarks: [{ id: 'shed', kind: 'town', name: 'Shed', level: 0, x: 3300, z: 3200 }],
  routes: []
};

interface WorldLoc { id: number; name: string; x: number; z: number; level: number; options: string[]; reachable?: boolean }
const loc = (name: string, x: number, z: number, options: string[], reachable = true): WorldLoc =>
  ({ id: 1, name, x, z, level: 0, options, reachable });
const npc = (name: string, x: number, z: number, options: string[]): unknown =>
  ({ kind: 'npc', id: 1, index: 1, name, x, z, tileX: x, tileZ: z, options, optionsWithIndex: [] });

interface HarnessOpts { world?: WorldLoc[]; npcs?: unknown[]; atlas?: Atlas | null }

/**
 * The fakes refuse what the real collaborators refuse. `state().nearbyLocs` holds only what the
 * collector's own 15-tile scan would hold, so a wider search has to go through `scanNearbyLocs`;
 * the atlas is the real loader over a stub fetch, so `peek()` is null until `load()` resolves;
 * and travel resolves its target through the real `resolveTarget` and reports the tiles it moved.
 */
function harness(opts: HarnessOpts = {}) {
  const world = opts.world ?? [];
  const player = { worldX: 3200, worldZ: 3200, level: 0 };
  const seen = (radius: number): unknown[] => world
    .filter(l => cheb(l.x, l.z, player.worldX, player.worldZ) <= radius)
    .map(l => ({ ...l, optionsWithIndex: [], distance: cheb(l.x, l.z, player.worldX, player.worldZ) }));
  const state = (): WorldState => ({
    player,
    nearbyLocs: seen(DEFAULT_RADIUS),
    nearbyNpcs: (opts.npcs ?? []).map(n => {
      const e = n as { x: number; z: number };
      return { ...e, distance: cheb(e.x, e.z, player.worldX, player.worldZ) };
    })
  } as unknown as WorldState);

  const body = 'atlas' in opts ? opts.atlas : ATLAS;
  const fetchImpl = body === null
    ? vi.fn().mockRejectedValue(new Error('offline'))
    : vi.fn().mockResolvedValue({ ok: true, json: async () => body });
  const atlas = createAtlasLoader({ url: '/atlas.json', fetchImpl });

  const travelled: { x: number; z: number }[] = [];
  const travelTo = vi.fn(async (target: TravelTarget) => {
      const at = resolveTarget(target, atlas.peek(), player.level);
      if (!at) return { success: false, reason: 'unreachable' as const, legs: 0, tiles: 0 };
      // Spec decision 11: travel never changes plane on its own.
      if (at.level !== player.level) return { success: false, reason: 'needs_route' as const, legs: 0, tiles: 0 };
      const tiles = cheb(at.x, at.z, player.worldX, player.worldZ);
      travelled.push({ x: at.x, z: at.z });
      player.worldX = at.x; player.worldZ = at.z;
    return { success: true, legs: 1, tiles };
  });
  const travel: Travel = {
    to: travelTo,
    distanceTo: (target: TravelTarget) => {
      const at = resolveTarget(target, atlas.peek(), player.level);
      return at ? cheb(at.x, at.z, player.worldX, player.worldZ) : Infinity;
    }
  };

  const scanNearbyLocs = vi.fn(async (radius = DEFAULT_RADIUS) => seen(radius));
  const trace = vi.fn<(e: TargetEvent) => void>();
  const status = vi.fn();
  const abort = new AbortController();
  const find = createFind({
    state,
    sdk: { scanNearbyLocs: scanNearbyLocs as unknown as FindSdk['scanNearbyLocs'] },
    atlas, travel, status, trace, signal: () => abort.signal
  });
  return { find, travelled, trace, status, player, abort, world, scanNearbyLocs, fetchImpl, travelTo };
}
type FindSdk = Parameters<typeof createFind>[0]['sdk'];

// --- layer 1: the scene -------------------------------------------------------------------

test('the scene answers first, and the trace says so', async () => {
  const { find, trace, travelled } = harness({ world: [loc('Tree', 3205, 3200, ['Chop down'])] });
  const found = await find.nearest('tree');
  expect(found).toMatchObject({ via: 'scene', name: 'Tree', x: 3205, distance: 5 });
  expect(travelled).toEqual([]);
  expect(trace).toHaveBeenCalledWith(expect.objectContaining({ kind: 'target', via: 'scene', kind_: 'tree' }));
});

test('a scene entry without the kind\'s op is not a match, and the search widens past it', async () => {
  const { find, travelled } = harness({ world: [loc('Tree', 3205, 3200, ['Examine'])], atlas: null });
  expect(await find.nearest('tree')).toBeNull();
  expect(travelled.length).toBeGreaterThan(0);          // it did not stop at the loc it rejected
});

test('an unreachable scene entry is skipped, unless the caller asks for it', async () => {
  const world = [loc('Tree', 3202, 3200, ['Chop down'], false), loc('Tree', 3208, 3200, ['Chop down'])];
  expect((await harness({ world }).find.nearest('tree'))!.x).toBe(3208);
  expect((await harness({ world }).find.nearest('tree', { reachableOnly: false }))!.x).toBe(3202);
});

test('a fishing spot is found among the npcs, by the name every spot config carries', async () => {
  const { find } = harness({ npcs: [npc('Man', 3201, 3200, ['Talk-to']), npc('Fishing spot', 3204, 3200, ['Net', 'Bait'])] });
  expect(await find.nearest('fishing-spot')).toMatchObject({ via: 'scene', name: 'Fishing spot', x: 3204 });
});

test('a radius over 15 asks the sdk to re-scan, and a radius over 52 is capped', async () => {
  const narrow = harness({ world: [loc('Tree', 3230, 3200, ['Chop down'])], atlas: null });
  // 30 tiles out: the default radius never reaches it, so only the sweep walking closer does.
  expect(await narrow.find.nearest('tree')).toMatchObject({ via: 'sweep', x: 3230 });
  expect(narrow.scanNearbyLocs).not.toHaveBeenCalled();
  const wide = harness({ world: [loc('Tree', 3230, 3200, ['Chop down'])] });
  expect(await wide.find.nearest('tree', { radius: 400 })).toMatchObject({ via: 'scene', x: 3230 });
  expect(wide.scanNearbyLocs).toHaveBeenCalledWith(MAX_RADIUS);
});

// --- layer 2: the atlas -------------------------------------------------------------------

test('with nothing in the scene the atlas answers, and travel is used to get there', async () => {
  const { find, travelled, trace, fetchImpl } = harness();
  const found = await find.nearest('tree', { variant: 'oaktree' });
  expect(fetchImpl).toHaveBeenCalledTimes(1);           // peek() was null, so load() had to run
  expect(travelled).toEqual([{ x: 3260, z: 3200 }]);
  expect(found).toMatchObject({ via: 'atlas', name: 'oaktree', cluster: expect.objectContaining({ id: 1 }) });
  expect(trace).toHaveBeenCalledWith(expect.objectContaining({ kind: 'target', via: 'atlas' }));
});

test('the re-scan after the atlas hop widens to the cluster\'s own radius', async () => {
  // 30 tiles from the cluster centre: inside a cluster whose r is 46, far outside a 15-tile scan.
  const { find, travelled, scanNearbyLocs } = harness({ world: [loc('Oak', 3290, 3200, ['Chop down'])] });
  const found = await find.nearest('tree', { variant: 'oaktree' });
  expect(travelled).toEqual([{ x: 3260, z: 3200 }]);
  expect(scanNearbyLocs).toHaveBeenCalledWith(48);      // r 46 plus travel's arrival tolerance
  expect(found).toMatchObject({ via: 'atlas', name: 'Oak', x: 3290, cluster: expect.objectContaining({ id: 1 }) });
});

test('a hop the walker refuses falls through to the sweep rather than reporting the cluster', async () => {
  const h = harness();
  // The real walker stops and says why - a door it cannot open, a leg budget spent. The atlas
  // branch has to treat that as "not found here" and keep widening.
  h.travelTo.mockResolvedValueOnce({ success: false, reason: 'unreachable', legs: 1, tiles: 40 });
  expect(await h.find.nearest('tree', { variant: 'oaktree' })).toBeNull();
  expect(h.travelTo.mock.calls[0]![0]).toEqual({ cluster: expect.objectContaining({ id: 1 }) });
  expect(h.travelled.length).toBeGreaterThan(0);        // the sweep ran, and its hops are real
  expect(h.travelled).not.toContainEqual({ x: 3260, z: 3200 });
});

test('a sweep hop that stops short still spends the tiles it walked', async () => {
  const h = harness({ atlas: { ...ATLAS, clusters: [] } });
  // `travel.ts` reports the tiles walked before it gave up, so a refused hop is not free.
  h.travelTo.mockResolvedValueOnce({ success: false, reason: 'unreachable', legs: 1, tiles: 40 });
  expect(await h.find.sweep('rock', { maxTiles: 30 })).toBeNull();
  expect(h.travelTo).toHaveBeenCalledTimes(1);          // 40 tiles spent, budget gone
});

test('a cluster the atlas filters out by plane never becomes a hop, and nearest widens instead', async () => {
  const { find, travelled } = harness();
  expect(await find.nearest('rock')).toBeNull();
  // The one rock cluster is on level 1, so `nearestCluster` never offers it to a level 0 player.
  expect(travelled).not.toContainEqual({ x: 3260, z: 3200 });
  expect(travelled.length).toBeGreaterThan(0);
});

test('with no atlas at all the scene still answers, and an empty scene widens to the sweep', async () => {
  const withTree = harness({ world: [loc('Tree', 3203, 3200, ['Chop down'])], atlas: null });
  expect(await withTree.find.nearest('tree')).toMatchObject({ via: 'scene' });
  expect(withTree.travelled).toEqual([]);
  const bare = harness({ atlas: null });
  expect(await bare.find.nearest('tree')).toBeNull();
  expect(bare.travelled.length).toBeGreaterThan(0);
});

test('nearestAtlas and landmark read the loaded atlas, and answer null before it loads', async () => {
  const { find } = harness();
  expect(find.nearestAtlas('tree')).toBeNull();
  expect(find.landmark('shed')).toBeNull();
  await find.nearest('tree', { variant: 'nothing-like-this' });
  expect(find.nearestAtlas('tree')).toMatchObject({ id: 1 });
  expect(find.nearestAtlas('tree', { maxDistance: 10 })).toBeNull();
  expect(find.landmark('shed')).toMatchObject({ id: 'shed' });
  expect(find.landmark('atlantis')).toBeNull();
});

// --- layer 3: the sweep -------------------------------------------------------------------

test('with no atlas match the sweep walks every ring point and gives up', async () => {
  const { find, travelled, status } = harness({ atlas: { ...ATLAS, clusters: [] } });
  expect(await find.sweep('rock', { maxTiles: Infinity })).toBeNull();
  expect(travelled.length).toBe(SWEEP_ALL);
  expect(status).toHaveBeenCalledWith(`Looking for a rock, 1 of ${SWEEP_ALL}`);
});

test('nearest falls through to the sweep when the atlas has no cluster of the kind', async () => {
  const { find, travelled } = harness({ atlas: { ...ATLAS, clusters: [] } });
  expect(await find.nearest('rock')).toBeNull();
  // The default 200-tile budget stops it short of the full ring, which is what a budget is for.
  expect(travelled.length).toBeGreaterThan(0);
  expect(travelled.length).toBeLessThan(SWEEP_ALL);
});

test('the sweep stops the moment a scan finds something', async () => {
  const world: WorldLoc[] = [];
  const h = harness({ world, atlas: { ...ATLAS, clusters: [] } });
  // The fake records a hop before it moves the player, so `n === 2` plants the rock beside the
  // *first* point, 13 tiles from where the second one lands. Inside the 15-tile scan, but only
  // just: this test is about the sweep re-scanning after every hop, not about the margin.
  const original = h.travelled.push.bind(h.travelled);
  h.travelled.push = (...args) => {
    const n = original(...args);
    if (n === 2) world.push(loc('Rocks', h.player.worldX, h.player.worldZ + 1, ['Mine', 'Prospect']));
    return n;
  };
  expect(await h.find.sweep('rock')).toMatchObject({ via: 'sweep', name: 'Rocks' });
  expect(h.travelled.length).toBe(2);
  expect(h.trace).toHaveBeenCalledWith(expect.objectContaining({ kind: 'target', via: 'sweep' }));
});

test('the sweep stops when it has spent its tile budget', async () => {
  const { find, travelled } = harness({ atlas: { ...ATLAS, clusters: [] } });
  expect(await find.sweep('rock', { maxTiles: 30 })).toBeNull();
  // The first hop is 20 tiles out; the second spends the rest of the budget.
  expect(travelled.length).toBe(2);
});

test('the zones pattern walks the eight neighbouring zone groups', async () => {
  const { find, travelled } = harness({ atlas: { ...ATLAS, clusters: [] } });
  expect(await find.sweep('rock', { pattern: 'zones', maxTiles: Infinity })).toBeNull();
  expect(travelled.length).toBe(8);
  expect(travelled[0]).toEqual({ x: 3136, z: 3136 });
});

test('a sweep anchored elsewhere rings that tile rather than the player', async () => {
  const { find, travelled } = harness({ atlas: { ...ATLAS, clusters: [] } });
  await find.sweep('rock', { anchor: { x: 3400, z: 3400 }, maxTiles: 1 });
  expect(travelled).toEqual([{ x: 3420, z: 3400 }]);
});

// --- aborts -------------------------------------------------------------------------------

test('an abort ends a sweep between points', async () => {
  const { find, travelled, abort } = harness({ atlas: { ...ATLAS, clusters: [] } });
  abort.abort();
  expect(await find.sweep('rock')).toBeNull();
  expect(travelled).toEqual([]);
});

test('an abort after the scene misses stops nearest before it walks anywhere', async () => {
  const { find, travelled, abort, fetchImpl } = harness();
  abort.abort();
  expect(await find.nearest('tree')).toBeNull();
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(travelled).toEqual([]);
});

// --- the taxonomy ------------------------------------------------------------------------

test('the four item-on-loc kinds match on the name, because the content gives them no op', () => {
  // `fire`, `range` and `anvil` carry no op in any config; 4 of 9 furnaces carry none either.
  expect(matchesKind('fire', { name: 'Fire', options: [] })).toBe(true);
  expect(matchesKind('fire', { name: 'Fireplace', options: [] })).toBe(true);
  expect(matchesKind('range', { name: 'Range', options: [] })).toBe(true);
  expect(matchesKind('range', { name: 'Cooking range', options: [] })).toBe(true);
  expect(matchesKind('anvil', { name: 'Anvil', options: [] })).toBe(true);
  expect(matchesKind('furnace', { name: 'Furnace', options: [] })).toBe(true);
  expect(matchesKind('fire', { name: 'Firepit of doom', options: [] })).toBe(false);
});

test('trees and rocks match on the op, including the one tree config that says just Chop', () => {
  expect(matchesKind('tree', { name: 'Achey Tree', options: ['Chop'] })).toBe(true);
  expect(matchesKind('tree', { name: 'Tree', options: ['Chop-down'] })).toBe(true);
  expect(matchesKind('tree', { name: 'Tree', options: ['Examine'] })).toBe(false);
  expect(matchesKind('rock', { name: 'Rocks', options: ['Mine', 'Prospect'] })).toBe(true);
  expect(matchesKind('rock', { name: 'Rocks', options: ['Prospect'] })).toBe(false);
});

test('banks, altars and fishing spots take either signal', () => {
  expect(matchesKind('bank', { name: 'Bank booth', options: [] })).toBe(true);
  expect(matchesKind('bank', { name: 'Open chest', options: ['Bank', 'Shut'] })).toBe(true);
  expect(matchesKind('bank', { name: 'Bank table', options: [] })).toBe(false);
  expect(matchesKind('altar', { name: 'Chaos altar', options: ['Pray-at'] })).toBe(true);
  expect(matchesKind('altar', { name: 'Altar', options: ['Craft-rune'] })).toBe(true);
  expect(matchesKind('fishing-spot', { name: 'Fishing spot', options: ['Lure', 'Bait'] })).toBe(true);
  expect(matchesKind('fishing-spot', { name: 'Man', options: ['Talk-to'] })).toBe(false);
});

test('the re-scan radius follows the cluster and stays inside the built scene', () => {
  const at = (r: number): AtlasCluster => ({ id: 1, kind: 'tree', variant: 'tree', level: 0, x: 0, z: 0, n: 1, r, region: 0 });
  expect(rescanRadius(at(2))).toBe(DEFAULT_RADIUS);      // never narrower than the default
  expect(rescanRadius(at(18))).toBe(20);                 // the widest rock cluster in the atlas
  expect(rescanRadius(at(46))).toBe(48);                 // the widest tree cluster in the atlas
  expect(rescanRadius(at(200))).toBe(MAX_RADIUS);
  expect(rescanRadius(at(2), { radius: 30 })).toBe(30);  // the caller's own radius still wins
});
