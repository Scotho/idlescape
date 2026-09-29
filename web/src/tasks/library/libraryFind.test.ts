// The run half of the three bundled scripts, against the real `c.find` and `c.travel`.
//
// What each test is really pinning is which discovery layer answered, because that is the whole
// of Task 12: the scripts used to read `state().nearbyLocs` and fail `not_found` one tile out of
// reach. `calls.walked` is the evidence - a script that reached its target through the atlas
// walks one leg straight to the cluster, and one that fell through to the sweep walks a ring of
// scan points first. An assertion on the interaction alone cannot tell those two apart.
import { describe, expect, test } from 'vitest';
import chopAndDrop from './chopAndDrop';
import mineAndDrop from './mineAndDrop';
import netFishAndDrop from './netFishAndDrop';
import { libraryHarness, taskOf } from './library.harness';

const chop = () => taskOf(chopAndDrop, 'chop-nearest');
const mine = () => taskOf(mineAndDrop, 'mine-nearest-rock');
const net = () => taskOf(netFishAndDrop, 'net-nearest-spot');

describe('chop-and-drop', () => {
  test('chops a tree that is already in the scene, without walking anywhere', async () => {
    const h = libraryHarness({ locs: [{ name: 'Oak', x: 3205, z: 3200, options: ['Chop down'] }], params: { tree: 'Oak' } });
    expect(await chop().run(h.ctx)).toBeUndefined();
    expect(h.calls.walked).toEqual([]);
    expect(h.calls.interactLoc).toEqual([{ name: 'Oak', x: 3205, z: 3200, op: 'Chop down' }]);
    expect(h.calls.waited).toEqual(['xp']);
  });

  test('walks to the oak the atlas knows about when none is in the scene', async () => {
    // 40 tiles out: past the collector's 15-tile scan, inside one 52-tile leg.
    const h = libraryHarness({ locs: [{ name: 'Oak', x: 3240, z: 3205, options: ['Chop down'] }], params: { tree: 'Oak' } });
    expect(await chop().run(h.ctx)).toBeUndefined();
    // One leg, straight to the cluster. A sweep would have walked its scan ring first.
    expect(h.calls.walked).toEqual([{ x: 3240, z: 3205 }]);
    expect(h.calls.interactLoc).toEqual([{ name: 'Oak', x: 3240, z: 3205, op: 'Chop down' }]);
  });

  test("the 'Tree' option reaches the cluster the content calls tree2", async () => {
    const h = libraryHarness({ locs: [{ name: 'Tree', x: 3400, z: 3205, options: ['Chop down'] }], params: { tree: 'Tree' } });
    expect(await chop().run(h.ctx)).toBeUndefined();
    expect(h.calls.walked.at(-1)).toEqual({ x: 3400, z: 3205 });
    expect(h.calls.interactLoc).toEqual([{ name: 'Tree', x: 3400, z: 3205, op: 'Chop down' }]);
  });

  test('falls back to chopTree when the walk arrives and the cluster is empty', async () => {
    const h = libraryHarness({ locs: [], params: { tree: 'Oak' } });
    // `chopTree` re-resolves by display name against a snapshot that holds nothing, so its
    // refusal is what the task reports. What is pinned here is that the empty cluster reaches
    // the re-resolve at all rather than failing before it.
    expect(await chop().run(h.ctx)).toMatchObject({ success: false, message: 'No tree found' });
    expect(h.calls.walked).toEqual([{ x: 3240, z: 3205 }]);
    expect(h.calls.interactLoc).toEqual([]);
    expect(h.calls.chopTree).toEqual(['Oak']);
  });

  test('does not chop a plain Tree standing in the oak cluster', async () => {
    // The re-scan `find` runs after the walk drops the variant, so the nearest tree of ANY
    // species answers. Two tiles from the cluster centre a plain Tree beats every oak, and
    // trees, unlike rocks, are told apart by their display name: this must not click it.
    const h = libraryHarness({ locs: [{ name: 'Tree', x: 3238, z: 3204, options: ['Chop down'] }], params: { tree: 'Oak' } });
    expect(await chop().run(h.ctx)).toMatchObject({ success: false, message: 'No tree found' });
    expect(h.calls.walked).toEqual([{ x: 3240, z: 3205 }]);
    expect(h.calls.interactLoc).toEqual([]);
    expect(h.calls.chopTree).toEqual(['Oak']);
    expect(h.calls.status).toEqual(['Looking for Oak', 'Walking to the nearest tree', 'Travelling to 3240, 3205 (40 tiles)', 'Chopping Oak']);
  });

  test('takes an oak standing further out over the plain tree the re-scan lands on', async () => {
    // The same cluster, with an oak in it: `chopTree` resolves by display name out of the
    // snapshot, so the fall-through reaches the tree that was actually asked for.
    const h = libraryHarness({
      params: { tree: 'Oak' },
      locs: [
        { name: 'Tree', x: 3238, z: 3204, options: ['Chop down'] },
        { name: 'Oak', x: 3246, z: 3208, options: ['Chop down'] }
      ]
    });
    expect(await chop().run(h.ctx)).toBeUndefined();
    expect(h.calls.interactLoc).toEqual([]);
    expect(h.calls.chopTree).toEqual(['Oak']);
    expect(h.calls.waited).toEqual(['xp']);
  });

  test('reports not_found rather than chopping whatever the snapshot happens to hold', async () => {
    const h = libraryHarness({
      atlas: null, params: { tree: 'Oak' },
      locs: [{ name: 'Willow', x: 3205, z: 3200, options: ['Chop down'] }]
    });
    expect(await chop().run(h.ctx)).toMatchObject({ success: false, reason: 'not_found' });
    expect(h.calls.interactLoc).toEqual([]);
    expect(h.calls.chopTree).toEqual([]);
  });
});

describe('mine-and-drop', () => {
  test('walks past the tin rocks in the scene to the copper cluster, because every rock is called Rocks', async () => {
    const h = libraryHarness({
      params: { ore: 'Copper' },
      locs: [
        { name: 'Rocks', x: 3205, z: 3200, options: ['Mine', 'Prospect'] },   // tin, five tiles away
        { name: 'Rocks', x: 3230, z: 3210, options: ['Mine', 'Prospect'] }    // copper, thirty
      ]
    });
    expect(await mine().run(h.ctx)).toBeUndefined();
    expect(h.calls.walked).toEqual([{ x: 3230, z: 3210 }]);
    expect(h.calls.interactLoc).toEqual([{ name: 'Rocks', x: 3230, z: 3210, op: 'Mine' }]);
    expect(h.calls.waited).toEqual(['xp']);
  });

  test('reports not_found when the walk arrives and no rock is standing', async () => {
    const h = libraryHarness({ locs: [], params: { ore: 'Copper' } });
    expect(await mine().run(h.ctx)).toMatchObject({ success: false, reason: 'not_found', message: expect.stringContaining('none are standing') });
    expect(h.calls.walked).toEqual([{ x: 3230, z: 3210 }]);
    expect(h.calls.interactLoc).toEqual([]);
  });

  test('reports not_found rather than mining the wrong ore when the atlas never loaded', async () => {
    const h = libraryHarness({
      atlas: null, params: { ore: 'Copper' },
      locs: [{ name: 'Rocks', x: 3205, z: 3200, options: ['Mine', 'Prospect'] }]
    });
    expect(await mine().run(h.ctx)).toMatchObject({ success: false, reason: 'not_found' });
    expect(h.calls.interactLoc).toEqual([]);
  });
});

describe('net-fish-and-drop', () => {
  test('walks past the nearer lure spot to a spot a net works, and waits for the catch', async () => {
    const h = libraryHarness({
      params: { untilLevel: 20 }, yields: { id: 317, name: 'Raw shrimps' },
      npcs: [
        { name: 'Fishing spot', x: 3210, z: 3200, options: ['Lure', 'Bait'] },
        { name: 'Fishing spot', x: 3240, z: 3205, options: ['Net', 'Bait'] }
      ]
    });
    expect(await net().run(h.ctx)).toBeUndefined();
    expect(h.calls.walked).toEqual([{ x: 3240, z: 3205 }]);
    expect(h.calls.interactNpc).toEqual([{ name: 'Fishing spot', x: 3240, z: 3205, op: 'Net' }]);
    // `until:true` and not merely `until`: the catch predicate has to have answered yes, which
    // pins `before`, the CATCH pattern and the comparison together.
    expect(h.calls.waited).toEqual(['until:true']);
  });

  test('takes the net spot beside the lure spot the re-scan lands on, rather than failing the lap', async () => {
    // Catherby and Lumbridge both put a lure or cage spot within a tile or two of the net one,
    // and the re-scan after the walk drops the variant, so the nearest 'Fishing spot' is the
    // one this script cannot work. Failing there fails against a snapshot that never changes,
    // and three laps of that end the run.
    const h = libraryHarness({
      params: { untilLevel: 20 }, yields: { id: 317, name: 'Raw shrimps' },
      npcs: [
        { name: 'Fishing spot', x: 3241, z: 3206, options: ['Lure', 'Bait'] },              // 1 tile out, no net
        { name: 'Fishing spot', x: 3242, z: 3205, options: ['Net'], reachable: false },     // 2, across the water
        { name: 'Fishing spot', x: 3250, z: 3210, options: ['Net', 'Bait'] },               // 10
        { name: 'Fishing spot', x: 3245, z: 3205, options: ['Net', 'Bait'] }                // 5, the answer
      ]
    });
    expect(await net().run(h.ctx)).toBeUndefined();
    expect(h.calls.walked).toEqual([{ x: 3240, z: 3205 }]);
    expect(h.calls.interactNpc).toEqual([{ name: 'Fishing spot', x: 3245, z: 3205, op: 'Net' }]);
    expect(h.calls.waited).toEqual(['until:true']);
  });

  test('does not call the lap a catch when nothing new arrived', async () => {
    // No `yields`, so the interaction lands and the inventory does not move. The shrimp already
    // in the bag is what makes the fixture worth having: a predicate that compared against zero,
    // or with `>=`, would read it as this lap's catch.
    const h = libraryHarness({
      params: { untilLevel: 20 },
      inventory: [{ slot: 0, id: 317, name: 'Raw shrimps', count: 1 }],
      npcs: [{ name: 'Fishing spot', x: 3240, z: 3205, options: ['Net', 'Bait'] }]
    });
    expect(await net().run(h.ctx)).toBeUndefined();
    expect(h.calls.interactNpc).toEqual([{ name: 'Fishing spot', x: 3240, z: 3205, op: 'Net' }]);
    expect(h.calls.waited).toEqual(['until:false']);
  });

  test('refuses a spot that offers no Net, because the re-scan matches every spot by name', async () => {
    const h = libraryHarness({
      params: { untilLevel: 20 },
      npcs: [{ name: 'Fishing spot', x: 3240, z: 3205, options: ['Lure', 'Bait'] }]
    });
    expect(await net().run(h.ctx)).toMatchObject({ success: false, reason: 'not_found', message: expect.stringContaining('3240') });
    expect(h.calls.interactNpc).toEqual([]);
  });

  test('reports not_found when the shoal has moved on by the time the walk arrives', async () => {
    const h = libraryHarness({ npcs: [], params: { untilLevel: 20 } });
    // The tile, never the cluster's `variant`: 'nothing is fishing at saltfish' is content
    // debug naming leaking into player-facing copy.
    expect(await net().run(h.ctx)).toMatchObject({ success: false, reason: 'not_found', message: 'nothing is fishing at 3240, 3205' });
    expect(h.calls.walked).toEqual([{ x: 3240, z: 3205 }]);
    expect(h.calls.interactNpc).toEqual([]);
  });

  test('passes a failed interaction straight back, rather than waiting for a catch that cannot come', async () => {
    const h = libraryHarness({
      params: { untilLevel: 20 }, interactFails: true,
      npcs: [{ name: 'Fishing spot', x: 3240, z: 3205, options: ['Net', 'Bait'] }]
    });
    expect(await net().run(h.ctx)).toMatchObject({ success: false, reason: 'cant_reach' });
    expect(h.calls.waited).toEqual([]);
  });
});
