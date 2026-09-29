import { describe, expect, test } from 'vitest';
import { TASKS } from './mining';
import { pick, tutorialHarness, type HarnessOpts } from './harness';
import type { FoundTarget } from '../../types';
import type { NearbyLoc } from '../../../vendor/rs-sdk/sdk/types';

const at = (opts: HarnessOpts) => {
  const h = tutorialHarness(opts);
  return { h, task: pick(TASKS, h.state(), h.ctx) };
};

const ROCK_HINT = { kind: 'tile' as const, tile: { x: 3080, z: 9500, height: 0 } };
const ROCKS = [{ name: 'Rocks', x: 3080, z: 9500, options: ['Mine', 'Prospect'] }];
const foundRock: FoundTarget = {
  via: 'atlas', kind: 'rock', name: 'Rocks', x: 3085, z: 9505, level: 0, distance: 5,
  loc: { id: 2091, name: 'Rocks', x: 3085, z: 9505, level: 0, distance: 5, options: ['Mine'], optionsWithIndex: [] } as unknown as NearbyLoc
};

describe('the three prospecting titles', () => {
  test('an arrow over a rock prospects it, under every one of them', async () => {
    for (const title of ['Prospecting', "It's copper.", "It's tin."]) {
      const { h, task } = at({ world: { title, hint: ROCK_HINT, locs: ROCKS } });
      expect(task?.name).toBe('prospect-rocks');
      await task?.run(h.ctx);
      expect(h.calls.interactLoc).toEqual([{ name: 'Rocks', op: 'Prospect' }]);
    }
  });

  test('the same title with the arrow over the instructor is a conversation, not a rock', async () => {
    const { h, task } = at({
      world: { title: "It's tin.", hint: { kind: 'npc', npcIndex: 3 }, npcs: [{ index: 3, name: 'Mining Instructor', x: 3080, z: 9490 }] }
    });
    expect(task?.name).toBe('talk-mining-instructor');
    await task?.run(h.ctx);
    expect(h.calls.talkTo).toEqual(['Mining Instructor']);
    expect(h.calls.interactLoc).toEqual([]);
  });

  test('a prospecting title with no arrow at all matches nothing, so nothing is clicked blind', () => {
    // The instructor arm above needs an npc arrow and the rock arm needs a tile arrow, so a
    // snapshot with neither has to fall through to the script's own fallbacks.
    const { task } = at({ world: { title: "It's tin.", locs: ROCKS } });
    expect(task).toBeUndefined();
  });

  test('falls back to the discovery layer when the arrow tile carries no loc yet', async () => {
    const { h, task } = at({ world: { title: 'Prospecting', hint: ROCK_HINT }, found: { rock: foundRock } });
    await task?.run(h.ctx);
    expect(h.calls.find).toEqual([{ kind: 'rock', radius: 20 }]);
    expect(h.calls.interactLoc).toEqual([{ name: 'Rocks', op: 'Prospect' }]);
  });

  test('refuses when neither the arrow nor the discovery layer has a rock', async () => {
    const { h, task } = at({ world: { title: 'Prospecting', hint: ROCK_HINT }, found: {} });
    const r = await task?.run(h.ctx);
    expect(r).toEqual({ success: false, message: 'no rock the arrow points at', reason: 'not_found' });
    expect(h.calls.interactLoc).toEqual([]);
  });
});

describe('mine-rocks', () => {
  test('sends Mine and not Prospect, and waits on mining xp', async () => {
    const { h, task } = at({ world: { title: 'Mining.', hint: ROCK_HINT, locs: ROCKS } });
    expect(task?.name).toBe('mine-rocks');
    await task?.run(h.ctx);
    expect(h.calls.interactLoc).toEqual([{ name: 'Rocks', op: 'Mine' }]);
    expect(h.calls.waited).toEqual(['xp']);
  });

  test('does not wait for xp when the click was refused', async () => {
    const { h, task } = at({ world: { title: 'Mining.', hint: ROCK_HINT, locs: ROCKS }, interactFails: true });
    const r = await task?.run(h.ctx);
    expect(r?.success).toBe(false);
    expect(h.calls.waited).toEqual([]);
  });
});

describe('smelt-bar and smith-dagger', () => {
  test('the ore goes on the furnace and the bar is waited for', async () => {
    const { h, task } = at({
      world: { title: 'Smelting.', locs: [{ name: 'Furnace', x: 3079, z: 9496 }], inventory: [{ slot: 0, id: 438, name: 'Tin ore', count: 1 }] }
    });
    expect(task?.name).toBe('smelt-bar');
    await task?.run(h.ctx);
    expect(h.calls.useItemOnLoc).toEqual([{ item: 'Tin ore', loc: 'Furnace' }]);
    expect(h.calls.waited).toEqual(['item:Bronze bar']);
  });

  test('the bar goes on the anvil first, and no component is clicked before the interface opens', async () => {
    const { h, task } = at({
      world: { title: 'Smithing a dagger.', locs: [{ name: 'Anvil', x: 3083, z: 9499 }], inventory: [{ slot: 0, id: 2349, name: 'Bronze bar', count: 1 }] }
    });
    expect(task?.name).toBe('smith-dagger');
    await task?.run(h.ctx);
    expect(h.calls.useItemOnLoc).toEqual([{ item: 'Bronze bar', loc: 'Anvil' }]);
    expect(h.calls.clickedComponentWithOption).toEqual([]);
  });

  test('with the interface up it picks column 1 slot 0, which is the only thing the island allows', async () => {
    const { h, task } = at({
      world: { title: 'Smithing a dagger.', modalOpen: true, inventory: [{ slot: 0, id: 2349, name: 'Bronze bar', count: 1 }] }
    });
    await task?.run(h.ctx);
    expect(h.calls.clickedComponentWithOption).toEqual([{ component: 1119, option: 1, slot: 0 }]);
    expect(h.calls.useItemOnLoc).toEqual([]);
    expect(h.calls.waited).toEqual(['item:Bronze dagger']);
  });
});

describe('leave-mine', () => {
  test('follows the arrow to the gates', async () => {
    const { h, task } = at({
      world: {
        title: "You've finished this area.",
        hint: { kind: 'tile', tile: { x: 3094, z: 9502, height: 0 } },
        locs: [{ name: 'Gate', x: 3094, z: 9502 }]
      }
    });
    expect(task?.name).toBe('leave-mine');
    await task?.run(h.ctx);
    expect(h.calls.interactLoc).toEqual([{ name: 'Gate', op: 1 }]);
  });
});
