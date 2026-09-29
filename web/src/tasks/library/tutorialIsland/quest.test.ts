import { describe, expect, test } from 'vitest';
import { TASKS } from './quest';
import { TASKS as guide } from './guide';
import { pick, tutorialHarness, type HarnessOpts } from './harness';

const at = (opts: HarnessOpts) => {
  const h = tutorialHarness(opts);
  return { h, task: pick(TASKS, h.state(), h.ctx) };
};

/** The arrow the tutorial puts over the mine ladder: `hint_coord(^hint_center, 0_48_48_16_47, 0)`. */
const LADDER_HINT = { kind: 'tile' as const, tile: { x: 3088, z: 3119, height: 0 } };

describe('enter-mine', () => {
  test('takes the declared route rather than clicking the ladder loc', async () => {
    const { h, task } = at({ world: { title: '', hint: LADDER_HINT } });
    expect(task?.name).toBe('enter-mine');
    await task?.run(h.ctx);
    expect(h.calls.travel).toEqual([{ landmark: 'tutorial-mine' }]);
    expect(h.calls.interactLoc).toEqual([]);
  });

  test('reports the travel failure rather than calling the descent done', async () => {
    const { h, task } = at({
      world: { title: '', hint: LADDER_HINT },
      travel: { success: false, reason: 'needs_route', legs: 0, tiles: 0 }
    });
    const r = await task?.run(h.ctx);
    expect(r).toEqual({ success: false, message: 'could not reach the mine: needs_route', reason: 'needs_route' });
  });

  test('an arrow one tile off the ladder is not the ladder step', () => {
    const { task } = at({ world: { title: '', hint: { kind: 'tile', tile: { x: 3088, z: 3120, height: 0 } } } });
    expect(task?.name).not.toBe('enter-mine');
  });

  test('the same arrow under a title is a different step and is left to that stage', () => {
    const { task } = at({ world: { title: 'Mining and smithing.', hint: LADDER_HINT } });
    expect(task).toBeUndefined();
  });

  test('an arrow over a person is never the ladder', () => {
    const { task } = at({ world: { title: '', hint: { kind: 'npc', npcIndex: 5 }, npcs: [{ index: 5, name: 'Quest Guide', x: 3084, z: 3124 }] } });
    expect(task?.name).toBe('talk-quest-guide');
  });
});

describe('talk-quest-guide', () => {
  test('talks to the person the arrow is over', async () => {
    const { h, task } = at({
      world: { title: '', hint: { kind: 'npc', npcIndex: 5 }, npcs: [{ index: 5, name: 'Quest Guide', x: 3084, z: 3124 }] }
    });
    await task?.run(h.ctx);
    expect(h.calls.talkTo).toEqual(['Quest Guide']);
  });

  test('does not fire when nothing is being pointed at', () => {
    const { task } = at({ world: { title: '' } });
    expect(task).toBeUndefined();
  });
});

test('the flashing journal tab is taken by the generic tab step, not by this stage', () => {
  const h = tutorialHarness({ world: { title: '', flashingTab: 7 } });
  expect(pick(TASKS, h.state(), h.ctx)).toBeUndefined();
  expect(pick([...guide, ...TASKS], h.state(), h.ctx)?.name).toBe('open-flashing-tab');
});
