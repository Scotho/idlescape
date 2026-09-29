import { describe, expect, test } from 'vitest';
import { TASKS } from './survival';
import { pick, tutorialHarness, type HarnessOpts } from './harness';
import type { FoundTarget } from '../../types';
import type { NearbyLoc, NearbyNpc } from '../../../vendor/rs-sdk/sdk/types';

const at = (opts: HarnessOpts) => {
  const h = tutorialHarness(opts);
  return { h, task: pick(TASKS, h.state(), h.ctx) };
};

const foundTree: FoundTarget = {
  via: 'scene', kind: 'tree', name: 'Tree', x: 3096, z: 3100, level: 0, distance: 4,
  loc: { id: 1276, name: 'Tree', x: 3096, z: 3100, level: 0, distance: 4, options: ['Chop down'], optionsWithIndex: [] } as unknown as NearbyLoc
};
const foundSpot: FoundTarget = {
  via: 'scene', kind: 'fishing-spot', name: 'Fishing spot', x: 3102, z: 3092, level: 0, distance: 6,
  npc: { kind: 'npc', id: 316, index: 3, name: 'Fishing spot', x: 3102, z: 3092, options: ['Net'], optionsWithIndex: [] } as unknown as NearbyNpc
};

describe('cut-tree', () => {
  test('goes through the discovery layer rather than a hardcoded tile', async () => {
    const { h, task } = at({ world: { title: 'Cut down a tree' }, found: { tree: foundTree } });
    expect(task?.name).toBe('cut-tree');
    await task?.run(h.ctx);
    expect(h.calls.find).toEqual([{ kind: 'tree', radius: 30 }]);
    expect(h.calls.interactLoc).toEqual([{ name: 'Tree', op: 'Chop down' }]);
    expect(h.calls.waited).toEqual(['item:Logs']);
  });

  test('reports not_found rather than clicking at nothing when the island has no tree in range', async () => {
    const { h, task } = at({ world: { title: 'Cut down a tree' }, found: {} });
    const r = await task?.run(h.ctx);
    expect(r).toEqual({ success: false, message: 'no tree on the island', reason: 'not_found' });
    expect(h.calls.interactLoc).toEqual([]);
  });

  test('does not wait for logs when the click itself was refused', async () => {
    const { h, task } = at({ world: { title: 'Cut down a tree' }, found: { tree: foundTree }, interactFails: true });
    const r = await task?.run(h.ctx);
    expect(r?.success).toBe(false);
    expect(h.calls.waited).toEqual([]);
  });
});

describe('build-fire', () => {
  test('uses the tinderbox on the logs and waits for a fire to appear', async () => {
    const { h, task } = at({
      world: {
        title: 'Building a fire',
        inventory: [{ slot: 0, id: 590, name: 'Tinderbox', count: 1 }, { slot: 1, id: 1511, name: 'Logs', count: 1 }]
      }
    });
    expect(task?.name).toBe('build-fire');
    await task?.run(h.ctx);
    expect(h.calls.useItemOnItem).toEqual([{ source: 0, target: 1 }]);
    expect(h.calls.waited).toEqual(['until:false']);
  });

  test('refuses before sending anything when the logs are not in the bag', async () => {
    const { h, task } = at({ world: { title: 'Building a fire', inventory: [{ slot: 0, id: 590, name: 'Tinderbox', count: 1 }] } });
    const r = await task?.run(h.ctx);
    expect(r?.success).toBe(false);
    expect(h.calls.useItemOnItem).toEqual([]);
  });

  test('the wait is satisfied by a fire in view and not by any other loc', async () => {
    const h = tutorialHarness({
      world: {
        title: 'Building a fire', locs: [{ name: 'Fire', x: 0, z: 0 }],
        inventory: [{ slot: 0, id: 590, name: 'Tinderbox', count: 1 }, { slot: 1, id: 1511, name: 'Logs', count: 1 }]
      }
    });
    await TASKS.find(t => t.name === 'build-fire')?.run(h.ctx);
    expect(h.calls.waited).toEqual(['until:true']);
  });
});

describe('catch-shrimp and cook-shrimp', () => {
  test('nets the spot the discovery layer answered with', async () => {
    const { h, task } = at({ world: { title: 'Catch some Shrimp.' }, found: { 'fishing-spot': foundSpot } });
    expect(task?.name).toBe('catch-shrimp');
    await task?.run(h.ctx);
    expect(h.calls.find).toEqual([{ kind: 'fishing-spot', radius: 30 }]);
    expect(h.calls.interactNpc).toEqual([{ name: 'Fishing spot', op: 'Net' }]);
    expect(h.calls.waited).toEqual(['item:Raw shrimps']);
  });

  test('refuses when the shoal has gone rather than netting whatever is nearest', async () => {
    const { h, task } = at({ world: { title: 'Catch some Shrimp.' }, found: {} });
    const r = await task?.run(h.ctx);
    expect(r).toEqual({ success: false, message: 'no fishing spot on the island', reason: 'not_found' });
    expect(h.calls.interactNpc).toEqual([]);
  });

  test('cooks on the fire under both the cooking and the burning title', async () => {
    for (const title of ['Cooking your shrimp.', 'Burning your shrimp.']) {
      const { h, task } = at({
        world: { title, locs: [{ name: 'Fire', x: 0, z: 0 }], inventory: [{ slot: 2, id: 317, name: 'Raw shrimps', count: 1 }] }
      });
      expect(task?.name).toBe('cook-shrimp');
      await task?.run(h.ctx);
      expect(h.calls.useItemOnLoc).toEqual([{ item: 'Raw shrimps', loc: 'Fire' }]);
    }
  });

  test('the burnt first shrimp sends the run back to the water, not at an empty bag', async () => {
    // The tutorial burns the first shrimp on purpose. Under `Burning your shrimp.` the raw one
    // is already gone, and a cook step keyed on the title alone clicked at nothing, failed
    // `item_not_found` three times inside one tick and ended the live run on `stuck`.
    for (const title of ['Cooking your shrimp.', 'Burning your shrimp.']) {
      const { h, task } = at({ world: { title, inventory: [] }, found: { 'fishing-spot': foundSpot } });
      expect(task?.name).toBe('catch-shrimp');
      await task?.run(h.ctx);
      expect(h.calls.interactNpc).toEqual([{ name: 'Fishing spot', op: 'Net' }]);
      expect(h.calls.useItemOnLoc).toEqual([]);
    }
  });

  test('a bag holding a raw shrimp cooks it rather than netting another', () => {
    // The other half of the same gate: with something to cook, the cook step still wins under
    // both titles, so the two are decided by the inventory and not by the order of the list.
    const { task } = at({
      world: {
        title: 'Burning your shrimp.', locs: [{ name: 'Fire', x: 0, z: 0 }],
        inventory: [{ slot: 2, id: 317, name: 'Raw shrimps', count: 1 }]
      },
      found: { 'fishing-spot': foundSpot }
    });
    expect(task?.name).toBe('cook-shrimp');
  });

  test('refuses when there is no fire in view, rather than reporting the shrimp cooked', async () => {
    const { h, task } = at({ world: { title: 'Cooking your shrimp.', inventory: [{ slot: 2, id: 317, name: 'Raw shrimps', count: 1 }] } });
    const r = await task?.run(h.ctx);
    expect(r?.success).toBe(false);
    expect(h.calls.waited).toEqual([]);
  });
});

describe('the tab and recap steps', () => {
  test('the inventory step opens the tab the client is flashing', async () => {
    const { h, task } = at({ world: { title: 'Viewing the items that you were given.', flashingTab: 3 } });
    expect(task?.name).toBe('view-inventory');
    await task?.run(h.ctx);
    expect(h.calls.setTab).toEqual([3]);
  });

  test('the experience title opens the skills tab that is flashing', async () => {
    const { h, task } = at({ world: { title: 'You gained some experience...', flashingTab: 6 } });
    expect(task?.name).toBe('open-skills');
    await task?.run(h.ctx);
    expect(h.calls.setTab).toEqual([6]);
  });

  test('the stats title is the instructor again, with no tab flashing to open', async () => {
    // Opening the flashing tab is what advances the step to this title, and the client clears
    // the flash as it sends TUT_CLICKSIDE, so nothing flashes here. A tab step would answer
    // 'no tab is flashing' on every lap until maxAttempts tripped markStuck.
    const { h, task } = at({
      world: {
        title: 'These are your stats.', flashingTab: null,
        hint: { kind: 'npc', npcIndex: 4 }, npcs: [{ index: 4, name: 'Survival Expert', x: 3103, z: 3096 }]
      }
    });
    expect(task?.name).toBe('view-stats');
    const r = await task?.run(h.ctx);
    expect(r).toBeUndefined();
    expect(h.calls.setTab).toEqual([]);
    expect(h.calls.talkTo).toEqual(['Survival Expert']);
  });

  test('the recap steps follow the arrow to the next instructor', async () => {
    const { h, task } = at({
      world: { title: 'Find your next instructor.', hint: { kind: 'npc', npcIndex: 2 }, npcs: [{ index: 2, name: 'Master Chef', x: 0, z: 0 }] }
    });
    expect(task?.name).toBe('survival-recap');
    await task?.run(h.ctx);
    expect(h.calls.talkTo).toEqual(['Master Chef']);
  });
});
