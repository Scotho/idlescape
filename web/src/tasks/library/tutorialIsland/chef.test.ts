import { describe, expect, test } from 'vitest';
import { TASKS } from './chef';
import { pick, tutorialHarness, type HarnessOpts } from './harness';

const at = (opts: HarnessOpts) => {
  const h = tutorialHarness(opts);
  return { h, task: pick(TASKS, h.state(), h.ctx) };
};

const INGREDIENTS = [
  { slot: 0, id: 1929, name: 'Bucket of water', count: 1 },
  { slot: 1, id: 1933, name: 'Pot of flour', count: 1 }
];

describe('make-dough', () => {
  test('uses the water on the flour, by the slots they are actually in', async () => {
    const { h, task } = at({ world: { title: 'Making dough.', inventory: INGREDIENTS } });
    expect(task?.name).toBe('make-dough');
    await task?.run(h.ctx);
    expect(h.calls.useItemOnItem).toEqual([{ source: 0, target: 1 }]);
    expect(h.calls.waited).toEqual(['item:Bread dough']);
  });

  test('refuses before sending anything when the chef has not handed the ingredients over', async () => {
    const { h, task } = at({ world: { title: 'Making dough.', inventory: [INGREDIENTS[0]] } });
    const r = await task?.run(h.ctx);
    expect(r).toEqual({ success: false, message: 'the chef has not handed over the ingredients yet', reason: 'not_found' });
    expect(h.calls.useItemOnItem).toEqual([]);
  });
});

describe('bake-bread', () => {
  test('is keyed on the dough in the bag, not on the empty title alone', () => {
    const withDough = at({ world: { title: '', inventory: [{ slot: 0, id: 2307, name: 'Bread dough', count: 1 }] } });
    expect(withDough.task?.name).toBe('bake-bread');
    const without = at({ world: { title: '' } });
    expect(without.task).toBeUndefined();
  });

  test('does not fire under a title of its own, so it cannot preempt a named step', () => {
    const { task } = at({ world: { title: 'Making dough.', inventory: [{ slot: 0, id: 2307, name: 'Bread dough', count: 1 }] } });
    expect(task?.name).toBe('make-dough');
  });

  test('uses the dough on the range and waits for bread', async () => {
    const { h, task } = at({
      world: { title: '', locs: [{ name: 'Range', x: 0, z: 0 }], inventory: [{ slot: 0, id: 2307, name: 'Bread dough', count: 1 }] }
    });
    await task?.run(h.ctx);
    expect(h.calls.useItemOnLoc).toEqual([{ item: 'Bread dough', loc: 'Range' }]);
    expect(h.calls.waited).toEqual(['item:Bread']);
  });

  test('refuses when the range is not in view rather than reporting the loaf baked', async () => {
    const { h, task } = at({ world: { title: '', inventory: [{ slot: 0, id: 2307, name: 'Bread dough', count: 1 }] } });
    const r = await task?.run(h.ctx);
    expect(r?.success).toBe(false);
    expect(h.calls.waited).toEqual([]);
  });
});

describe('the two prose titles that flash a tab', () => {
  test('the bread congratulation opens the music tab', async () => {
    const { h, task } = at({ world: { title: 'Well done, your first loaf of bread. As you gain experience in', flashingTab: 13 } });
    expect(task?.name).toBe('open-music-tab');
    await task?.run(h.ctx);
    expect(h.calls.setTab).toEqual([13]);
  });

  test('the short-distance line opens the player controls, and does not walk anywhere', async () => {
    const { h, task } = at({
      world: {
        title: "It's only a short distance to the next guide.", flashingTab: 12,
        hint: { kind: 'tile', tile: { x: 3110, z: 3110, height: 0 } }
      }
    });
    expect(task?.name).toBe('open-controls-tab');
    await task?.run(h.ctx);
    expect(h.calls.setTab).toEqual([12]);
    expect(h.calls.walked).toEqual([]);
  });

  test('the bread congratulation stops matching once its flash has cleared', () => {
    // Nothing else on the island claims that title, so the run goes to no task rather than
    // burning three instant refusals on a tab that is no longer flashing.
    const { task } = at({ world: { title: 'Well done, your first loaf of bread. As you gain experience in', flashingTab: null } });
    expect(task).toBeUndefined();
  });

  test('the music player title follows the arrow to the door instead', async () => {
    const { h, task } = at({
      world: { title: 'The Music Player.', hint: { kind: 'tile', tile: { x: 3100, z: 3100, height: 0 } }, locs: [{ name: 'Door', x: 3100, z: 3100 }] }
    });
    expect(task?.name).toBe('leave-the-kitchen');
    await task?.run(h.ctx);
    expect(h.calls.interactLoc).toEqual([{ name: 'Door', op: 1 }]);
  });
});

describe('enable-run', () => {
  test('takes over when the tab has been opened and the tutorial text has not moved on', async () => {
    // The state the first live run wedged in. `[proc,tutorial_step_enable_run]` returns at
    // `if (p_finduid(uid) = true)` before it writes a new tutorial line, so `%tutorial` is
    // already `^tutorial_open_player_controls` while the box still reads the previous step and
    // the click on the controls tab has cleared the flash.
    const { h, task } = at({ world: { title: "It's only a short distance to the next guide.", flashingTab: null } });
    expect(task?.name).toBe('enable-run');
    await task?.run(h.ctx);
    expect(h.calls.clickedComponent).toEqual([153]);
    expect(h.calls.setTab).toEqual([]);
  });

  test('clicks the run-on component the content handler is bound to', async () => {
    const { h, task } = at({ world: { title: 'Running.' } });
    expect(task?.name).toBe('enable-run');
    await task?.run(h.ctx);
    // 153 is `controls:com_5` in engine/content/pack/interface.pack, the handler that sets
    // ^tutorial_has_toggled_on_run. The door to the quest guide is gated on that varp.
    expect(h.calls.clickedComponent).toEqual([153]);
  });

  test('the next step walks rather than clicking the orb again', async () => {
    const { h, task } = at({
      world: { title: 'Run to the next guide.', hint: { kind: 'tile', tile: { x: 3090, z: 3120, height: 0 } } }
    });
    expect(task?.name).toBe('run-to-the-next-guide');
    await task?.run(h.ctx);
    expect(h.calls.clickedComponent).toEqual([]);
    expect(h.calls.walked).toEqual([{ x: 3090, z: 3120 }]);
  });
});
