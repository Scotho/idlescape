import { expect, test } from 'vitest';
import { attachNearby, clusterByKind, clusterPlacements, type Placement } from './clusters';
import { regionId } from '../../tasks/library/regions';

const at = (x: number, z: number, variant = 'tree'): Placement => ({ kind: 'tree', variant, level: 0, x, z });

test('placements within the radius collapse into one cluster with a count and a radius', () => {
  const out = clusterPlacements([at(3200, 3200), at(3202, 3203), at(3204, 3200)], 6);
  expect(out).toHaveLength(1);
  expect(out[0].n).toBe(3);
  expect(out[0].r).toBeGreaterThan(0);
  // The centre is inside the hull of its members, not on one of them.
  expect(out[0].x).toBeGreaterThanOrEqual(3200);
  expect(out[0].x).toBeLessThanOrEqual(3204);
});

test('a placement past the radius starts its own cluster', () => {
  const out = clusterPlacements([at(3200, 3200), at(3230, 3200)], 6);
  expect(out).toHaveLength(2);
});

test('two variants never merge, however close they stand', () => {
  const out = clusterPlacements([at(3200, 3200, 'tree'), at(3200, 3201, 'oaktree')], 6);
  expect(out.map(c => c.variant).sort()).toEqual(['oaktree', 'tree']);
});

test('two levels never merge', () => {
  const out = clusterPlacements([at(3200, 3200), { ...at(3200, 3200), level: 1 }], 6);
  expect(out).toHaveLength(2);
});

test('the region is packed the way WorldExtras reports regionId', () => {
  // Two different map squares (50 on x, 51 on z), so transposing the packing changes the
  // answer, and the expectation comes from the helper the panels already read regionId with
  // rather than restating the packing under test.
  const [cluster] = clusterPlacements([at(3222, 3300)], 6);
  expect(cluster.region).toBe(regionId(50, 51));
});

test('ids are stable across runs for the same input in any order', () => {
  const a = clusterPlacements([at(3200, 3200), at(3230, 3200)], 6);
  const b = clusterPlacements([at(3230, 3200), at(3200, 3200)], 6);
  expect(a.map(c => `${c.id}:${c.x},${c.z}`)).toEqual(b.map(c => `${c.id}:${c.x},${c.z}`));
});

test('clusterByKind gives each kind its own radius and one id space', () => {
  // 20 tiles apart: one cluster at the tree radius, two at the 6-tile radius the singletons keep.
  const spread: Placement[] = [
    { kind: 'tree', variant: 'tree', level: 0, x: 3200, z: 3200 },
    { kind: 'tree', variant: 'tree', level: 0, x: 3220, z: 3200 },
    { kind: 'bank', variant: 'bankbooth', level: 0, x: 3200, z: 3200 },
    { kind: 'bank', variant: 'bankbooth', level: 0, x: 3220, z: 3200 }
  ];
  const out = clusterByKind(spread, { tree: 24 }, 6);
  expect(out.filter(c => c.kind === 'tree')).toHaveLength(1);
  expect(out.filter(c => c.kind === 'bank')).toHaveLength(2);
  expect(out.map(c => c.id)).toEqual([1, 2, 3]);
});

test('attachNearby names the landmarks within 50 tiles and leaves the rest without the field', () => {
  const [close, far] = clusterPlacements([at(3220, 3218), at(3900, 3900)], 6);
  const [a, b] = attachNearby([close, far], [{ id: 'lumbridge', level: 0, x: 3222, z: 3218 }]);
  expect(a.near).toEqual(['lumbridge']);
  expect(b.near).toBeUndefined();
});

test('attachNearby takes a landmark at exactly 50 tiles and not one at 51', () => {
  const [cluster] = clusterPlacements([at(3200, 3200)], 6);
  const [edge] = attachNearby([cluster], [
    { id: 'on-the-line', level: 0, x: 3250, z: 3200 },
    { id: 'past-it', level: 0, x: 3200, z: 3251 }
  ]);
  expect(edge.near).toEqual(['on-the-line']);
});

test('attachNearby never names a landmark on another level', () => {
  // The atlas carries level 1 and level 2 clusters, and a landmark you cannot walk to from
  // the cluster without a staircase is not what `near` means.
  const [cluster] = clusterPlacements([{ ...at(3200, 3200), level: 1 }], 6);
  const [upstairs] = attachNearby([cluster], [{ id: 'ground-floor', level: 0, x: 3200, z: 3200 }]);
  expect(upstairs.near).toBeUndefined();
});
