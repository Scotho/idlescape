import { describe, expect, test } from 'vitest';
import { TASKS } from './guide';
import { TASKS as survival } from './survival';
import { pick, tutorialHarness, type HarnessOpts } from './harness';

const at = (opts: HarnessOpts) => {
  const h = tutorialHarness(opts);
  return { h, task: pick(TASKS, h.state(), h.ctx) };
};

describe('the Gielinor Guide', () => {
  test('the guide talking is clicked through under both of his titles', async () => {
    for (const title of ['Getting started', 'Player controls']) {
      const { h, task } = at({ world: { title, dialog: { isOpen: true } } });
      expect(task?.name).toBe('getting-started');
      await task?.run(h.ctx);
      expect(h.calls.dialogClicks.length).toBeGreaterThan(0);
    }
  });

  test('the empty-title spanner step is matched by the flashing tab, not by the title', () => {
    const { task } = at({ world: { title: '', flashingTab: 11 } });
    expect(task?.name).toBe('open-flashing-tab');
  });

  test('an empty title with nothing flashing matches nothing here, so a later stage can own it', () => {
    const { task } = at({ world: { title: '', flashingTab: null } });
    expect(task).toBeUndefined();
  });

  test('a flashing tab under a title belongs to the stage that owns that title, not to the generic step', () => {
    const { task } = at({ world: { title: 'These are your stats.', flashingTab: 6 } });
    expect(task).toBeUndefined();
  });

  test('the door and the path steps follow the arrow', async () => {
    const cases = [
      { title: 'Interacting with scenery', name: 'interact-scenery' },
      { title: 'Moving around', name: 'moving-around' }
    ];
    for (const { title, name } of cases) {
      const { h, task } = at({
        world: { title, hint: { kind: 'tile', tile: { x: 3100, z: 3100, height: 0 } }, locs: [{ name: 'Door', x: 3100, z: 3100 }] }
      });
      expect(task?.name).toBe(name);
      await task?.run(h.ctx);
      expect(h.calls.interactLoc).toEqual([{ name: 'Door', op: 1 }]);
    }
  });
});

describe('please-wait', () => {
  test('takes the step and sends no packet at all', async () => {
    const { h, task } = at({ world: { title: 'Please wait...', hint: { kind: 'npc', npcIndex: 1 }, npcs: [{ index: 1, name: 'Lev', x: 0, z: 0 }] } });
    expect(task?.name).toBe('please-wait');
    await task?.run(h.ctx);
    expect(h.calls.talkTo).toEqual([]);
    expect(h.calls.dialogClicks).toEqual([]);
    expect(h.calls.setTab).toEqual([]);
    expect(h.calls.waited).toEqual(['until:false']);
  });

  test('waits it out even while the guide is mid-sentence', async () => {
    const { h, task } = at({ world: { title: 'Please wait...', dialog: { isOpen: true } } });
    expect(task?.name).toBe('please-wait');
    await task?.run(h.ctx);
    expect(h.calls.dialogClicks).toEqual([]);
  });
});

test('no task matches a title the script does not know, so the runner goes stuck rather than looping', () => {
  const h = tutorialHarness({ world: { title: 'A step from a future content bump' } });
  expect(pick([...TASKS, ...survival], h.state(), h.ctx)).toBeUndefined();
});
