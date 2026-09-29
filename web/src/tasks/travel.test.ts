import { expect, test, vi } from 'vitest';
import { createTravel, MAX_LEG_TILES } from './travel';
import type { ActionResult } from '../agent/types';
import type { Atlas, AtlasRoute, RouteWaypoint } from './types';
import type { WorldState } from '../agent/types';

type Interact = Extract<RouteWaypoint, { kind: 'interact' }>;
interface FakePlayer { worldX: number; worldZ: number; level: number }

const ATLAS: Atlas = {
  version: 1, source: { contentSha: 'x' },
  kinds: {} as Atlas['kinds'],
  clusters: [{ id: 1, kind: 'tree', variant: 'tree', level: 0, x: 3300, z: 3200, n: 2, r: 1, region: 0 }],
  landmarks: [{ id: 'lumbridge', kind: 'town', name: 'Lumbridge castle', level: 0, x: 3222, z: 3218 }],
  routes: []
};

/** An atlas with `lumbridge` plus the extra landmarks and routes a route test needs. */
const routed = (landmarks: Atlas['landmarks'], routes: AtlasRoute[]): Atlas =>
  ({ ...ATLAS, landmarks: [...ATLAS.landmarks, ...landmarks], routes });

const town = (id: string, x: number, z: number, level = 0): Atlas['landmarks'][number] =>
  ({ id, kind: 'town', name: id, level, x, z });

interface HarnessOpts {
  atlas?: Atlas;
  /** False refuses the leg: the fake player does not move, which is what a stall looks like. */
  walk?: (x: number, z: number) => boolean;
  /** Tiles the walker lands shy of the leg target, so the arrival tolerance is a real number. */
  short?: number;
  /** Milliseconds the fake clock advances per leg and per interact, both of which cost time. */
  msPerStep?: number;
  /** Returns success, and may move the player - a ladder that works changes `level`. */
  interact?: (wp: Interact, player: FakePlayer) => boolean;
}

function harness(opts: HarnessOpts = {}) {
  const atlas = opts.atlas ?? ATLAS;
  const player: FakePlayer = { worldX: 3200, worldZ: 3200, level: 0 };
  const legs: { x: number; z: number }[] = [];
  const order: string[] = [];
  const abort = new AbortController();
  let clock = 0;
  const walkTo = vi.fn(async (x: number, z: number) => {
    legs.push({ x, z });
    order.push(`walk:${x}`);
    clock += opts.msPerStep ?? 0;
    const ok = opts.walk ? opts.walk(x, z) : true;
    if (ok) { player.worldX = x - (opts.short ?? 0); player.worldZ = z; }
    return ok ? { success: true, message: 'Arrived' } : { success: false, message: 'Stuck' };
  });
  const interact = vi.fn(async (wp: Interact): Promise<ActionResult> => {
    order.push(`interact:${wp.locName}`);
    clock += opts.msPerStep ?? 0;
    const ok = opts.interact ? opts.interact(wp, player) : true;
    return ok ? { success: true, message: 'done' } : { success: false, message: 'no ladder here', reason: 'target_not_found' };
  });
  // As the real loader does: `peek` answers null until a `load` has resolved, so a caller that
  // skips the fetch really is working without the atlas rather than reading a pre-filled cache.
  let peeked: Atlas | null = null;
  const atlasLoad = vi.fn(async () => { peeked = atlas; return atlas; });
  const travel = createTravel({
    state: () => ({ player } as unknown as WorldState),
    bot: { walkTo } as never,
    atlas: { load: atlasLoad, peek: () => peeked, nearestCluster: () => null, landmark: (a, id) => a.landmarks.find(l => l.id === id) ?? null },
    collision: { load: async () => true, ready: () => true },
    status: vi.fn(),
    interact,
    signal: () => abort.signal,
    now: () => clock
  });
  return { travel, legs, order, player, walkTo, interact, atlasLoad, abort };
}

test('a long walk is split into legs that each fit inside one scene', async () => {
  const { travel, legs } = harness();
  const result = await travel.to({ x: 3400, z: 3200 });
  expect(result.success).toBe(true);
  expect(legs.length).toBeGreaterThan(1);
  // Literals, not the imported constant: asserting a leg against `MAX_LEG_TILES` would raise
  // the bar in step with the constant and could never fail. 52 is the scene half-width.
  expect(MAX_LEG_TILES).toBe(52);
  let from = { x: 3200, z: 3200 };
  for (const leg of legs) {
    expect(Math.max(Math.abs(leg.x - from.x), Math.abs(leg.z - from.z))).toBeLessThanOrEqual(52);
    from = leg;
  }
});

test('arriving inside the tolerance is success, and the last leg is the target', async () => {
  const { travel, legs } = harness();
  const result = await travel.to({ x: 3230, z: 3200 }, { tolerance: 2 });
  expect(result).toMatchObject({ success: true, legs: legs.length });
  expect(legs.at(-1)).toEqual({ x: 3230, z: 3200 });
});

test('stopping short of the target by less than the tolerance still arrives', async () => {
  // The walker lands a tile shy of every leg target, so the arrival comparison is against a
  // real distance rather than the always-zero one an exact walker produces.
  const { travel, player } = harness({ short: 1 });
  const result = await travel.to({ x: 3230, z: 3200 });
  expect(result).toMatchObject({ success: true, stoppedAt: { x: 3229, z: 3200 } });
  expect(player.worldX).toBe(3229);
});

test('a landmark and a cluster resolve to their coordinates', async () => {
  const { travel, legs } = harness();
  await travel.to({ landmark: 'lumbridge' });
  expect(legs.at(-1)).toEqual({ x: 3222, z: 3218 });
  legs.length = 0;
  await travel.to({ cluster: ATLAS.clusters[0] });
  expect(legs.at(-1)).toEqual({ x: 3300, z: 3200 });
});

test('an unknown landmark is unreachable, and nothing is walked', async () => {
  const { travel, walkTo } = harness();
  expect(await travel.to({ landmark: 'atlantis' })).toMatchObject({ success: false, reason: 'unreachable', legs: 0 });
  expect(walkTo).not.toHaveBeenCalled();
});

test('a coordinate target never fetches the atlas, and a landmark fetches it once', async () => {
  // `AtlasLoader.load` retries a failed fetch on every call, so a coordinate travel in a loop
  // would re-attempt a dead fetch forever for an answer it does not read.
  const { travel, atlasLoad } = harness();
  await travel.to({ x: 3210, z: 3200 });
  expect(atlasLoad).not.toHaveBeenCalled();
  await travel.to({ landmark: 'lumbridge' });
  await travel.to({ landmark: 'lumbridge' });
  expect(atlasLoad).toHaveBeenCalledTimes(1);
});

test('a level change with no route is refused rather than attempted', async () => {
  const { travel, walkTo } = harness();
  expect(await travel.to({ x: 3210, z: 3200, level: 1 })).toMatchObject({ success: false, reason: 'needs_route' });
  expect(walkTo).not.toHaveBeenCalled();
});

test('two legs that close no distance re-plan once, then fail unreachable with where it stopped', async () => {
  const { travel, walkTo } = harness({ walk: () => false });
  const result = await travel.to({ x: 3400, z: 3200 });
  expect(result).toMatchObject({ success: false, reason: 'unreachable', stoppedAt: { x: 3200, z: 3200 } });
  // One plan, one re-plan: three failed legs at most, never fifty.
  expect(walkTo.mock.calls.length).toBeLessThanOrEqual(4);
});

test('a walk that outruns its timeout stops with reason timeout', async () => {
  const { travel } = harness({ msPerStep: 500 });
  const result = await travel.to({ x: 3400, z: 3200 }, { timeoutMs: 1000 });
  // Legs at 0, 500 and 1000 ms; the fourth check sees 1500 against a 1000 ms deadline.
  expect(result).toMatchObject({ success: false, reason: 'timeout', legs: 3 });
});

test('maxLegs bounds the journey and reports where it gave up', async () => {
  const { travel } = harness();
  const result = await travel.to({ x: 3400, z: 3200 }, { maxLegs: 2 });
  expect(result).toMatchObject({ success: false, reason: 'unreachable', legs: 2, stoppedAt: { x: 3304, z: 3200 } });
});

test('an abort between legs stops immediately and reports aborted', async () => {
  const { travel, abort, walkTo } = harness({ walk: () => { abort.abort(); return true; } });
  const result = await travel.to({ x: 3400, z: 3200 });
  expect(result.reason).toBe('aborted');
  expect(walkTo).toHaveBeenCalledTimes(1);
});

test('distanceTo is straight-line and needs no walking', () => {
  const { travel, walkTo } = harness();
  expect(travel.distanceTo({ x: 3210, z: 3204 })).toBe(10);
  expect(travel.distanceTo({ landmark: 'atlantis' })).toBe(Infinity);
  expect(walkTo).not.toHaveBeenCalled();
});

// --- routes -----------------------------------------------------------------------------

const LADDER: Interact = { kind: 'interact', locName: 'Ladder', op: 'Climb-down', x: 3210, z: 3200, toLevel: 0 };

test('a route waypoint that is an interact is performed between the walks around it', async () => {
  const { travel, order, interact } = harness({
    atlas: routed([town('mine', 3220, 3200)], [{
      from: 'lumbridge', to: 'mine', level: 0,
      waypoints: [{ kind: 'walk', x: 3210, z: 3200 }, LADDER, { kind: 'walk', x: 3220, z: 3200 }]
    }])
  });

  const result = await travel.to({ landmark: 'mine' });
  expect(result.success).toBe(true);
  expect(order).toEqual(['walk:3210', 'interact:Ladder', 'walk:3220']);
  expect(interact).toHaveBeenCalledTimes(1);
});

test('a route whose interact fails stops there rather than walking on without it', async () => {
  const { travel, legs } = harness({
    interact: () => false,
    atlas: routed([town('mine', 3220, 3200)], [{
      from: 'lumbridge', to: 'mine', level: 0,
      waypoints: [{ ...LADDER, x: 3200, z: 3200 }, { kind: 'walk', x: 3220, z: 3200 }]
    }])
  });

  expect(await travel.to({ landmark: 'mine' })).toMatchObject({ success: false, reason: 'unreachable' });
  expect(legs).toEqual([]);
});

test('arrival is measured against the route\'s own last waypoint, not the landmark tile', async () => {
  // The route deliberately stops three tiles from the landmark - outside the tolerance. Its
  // author says that is arrival, and Task 13 must not have to end every route on the tile.
  const { travel } = harness({
    atlas: routed([town('mine', 3223, 3200)], [{
      from: 'lumbridge', to: 'mine', level: 0, waypoints: [{ kind: 'walk', x: 3220, z: 3200 }]
    }])
  });

  expect(await travel.to({ landmark: 'mine' })).toMatchObject({ success: true, stoppedAt: { x: 3220, z: 3200 } });
});

test('a route is only followed from its own from end', async () => {
  // The route starts at a landmark 500 tiles east, so it does not connect from here. Travel
  // plans straight to the landmark rather than following waypoints from the wrong place.
  const { travel, order } = harness({
    atlas: routed([town('mine', 3220, 3200), town('faraway', 3700, 3200)], [{
      from: 'faraway', to: 'mine', level: 0,
      waypoints: [{ kind: 'walk', x: 3690, z: 3200 }, LADDER, { kind: 'walk', x: 3220, z: 3200 }]
    }])
  });

  expect(await travel.to({ landmark: 'mine' })).toMatchObject({ success: true });
  expect(order).toEqual(['walk:3220']);
});

test('a route declared for another level does not license a level change', async () => {
  // The route reaches an upstairs landmark, but it is declared as starting on level 1 and the
  // player is on level 0, so it does not connect - and without a route, spec decision 11 holds.
  const { travel, walkTo } = harness({
    atlas: routed([town('upstairs', 3220, 3200, 1)], [{
      from: 'lumbridge', to: 'upstairs', level: 1, waypoints: [LADDER, { kind: 'walk', x: 3220, z: 3200 }]
    }])
  });

  expect(await travel.to({ landmark: 'upstairs' })).toMatchObject({ success: false, reason: 'needs_route' });
  expect(walkTo).not.toHaveBeenCalled();
});

test('a route interact that reports success without changing level does not report arrival', async () => {
  const upstairs = routed([town('upstairs', 3220, 3200, 1)], [{
    from: 'lumbridge', to: 'upstairs', level: 0,
    waypoints: [{ ...LADDER, op: 'Climb-up', x: 3200, z: 3200, toLevel: 1 }, { kind: 'walk', x: 3220, z: 3200 }]
  }]);

  // The click landed - the ladder is there and the interact succeeded - but the transition did
  // not happen. Standing on the wrong plane at the right tile is not arrival.
  const stuck = harness({ atlas: upstairs, interact: () => true });
  expect(await stuck.travel.to({ landmark: 'upstairs' })).toMatchObject({ success: false, reason: 'unreachable' });

  const climbed = harness({ atlas: upstairs, interact: (_wp, player) => { player.level = 1; return true; } });
  expect(await climbed.travel.to({ landmark: 'upstairs' })).toMatchObject({ success: true });
});

test('a slow interact is held to the same deadline the walks are', async () => {
  // Two gates in a row, each costing 500 ms against a 100 ms budget. The first is inside the
  // budget when it starts; the second must not be attempted. Only the interact branch's own
  // deadline check can stop it - the walk loop is not reached until after both.
  const { travel, interact, order } = harness({
    msPerStep: 500,
    atlas: routed([town('mine', 3220, 3200)], [{
      from: 'lumbridge', to: 'mine', level: 0,
      waypoints: [
        { ...LADDER, locName: 'First gate', x: 3200, z: 3200 },
        { ...LADDER, locName: 'Second gate', x: 3200, z: 3200 },
        { kind: 'walk', x: 3220, z: 3200 }
      ]
    }])
  });

  const result = await travel.to({ landmark: 'mine' }, { timeoutMs: 100 });
  expect(result).toMatchObject({ success: false, reason: 'timeout', legs: 0 });
  expect(interact).toHaveBeenCalledTimes(1);
  expect(order).toEqual(['interact:First gate']);
});

// `tiles()` is what the run summary reports as `tilesTravelled` (Task 11). It counts what the
// player actually moved, over every call this layer served for the run, and never resets.
test('the layer keeps a running total of the tiles it has actually walked', async () => {
  const { travel } = harness();
  expect(travel.tiles()).toBe(0);
  await travel.to({ x: 3230, z: 3200 });
  expect(travel.tiles()).toBe(30);
  await travel.to({ x: 3230, z: 3212 });
  expect(travel.tiles()).toBe(42);
});

test('a leg the walker refuses adds nothing to the total', async () => {
  const { travel } = harness({ walk: () => false });
  const result = await travel.to({ x: 3230, z: 3200 });
  expect(result.success).toBe(false);
  expect(travel.tiles()).toBe(0);
});
