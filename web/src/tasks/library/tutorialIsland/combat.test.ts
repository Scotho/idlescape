import { describe, expect, test } from 'vitest';
import { noRatInSight, TASKS } from './combat';
import { pick, tutorialHarness, type HarnessOpts } from './harness';

const at = (opts: HarnessOpts) => {
  const h = tutorialHarness(opts);
  return { h, task: pick(TASKS, h.state(), h.ctx) };
};

const DAGGER = { slot: 0, id: 1205, name: 'Bronze dagger', count: 1 };
const RANGE_GEAR = [{ slot: 1, id: 841, name: 'Shortbow', count: 1 }, { slot: 2, id: 882, name: 'Bronze arrow', count: 25 }];
const RAT = [{ index: 4, name: 'Giant rat', x: 3110, z: 9510, combatLevel: 3 }];

describe('equipping', () => {
  test('wields the dagger and waits for it to be worn', async () => {
    const { h, task } = at({ world: { title: 'This is your worn inventory.', inventory: [DAGGER] } });
    expect(task?.name).toBe('equip-dagger');
    await task?.run(h.ctx);
    expect(h.calls.equipped).toEqual(['Bronze dagger']);
    expect(h.calls.waited).toEqual(['until:false']);
  });

  test('refuses when the dagger is not carried, rather than reporting it wielded', async () => {
    const { h, task } = at({ world: { title: 'This is your worn inventory.', inventory: [] } });
    const r = await task?.run(h.ctx);
    expect(r?.success).toBe(false);
    expect(h.calls.waited).toEqual([]);
  });

  test('the unequip step takes the dagger off and puts the sword and shield on, in that order', async () => {
    const { h, task } = at({
      world: {
        title: 'Unequipping items.',
        equipment: [DAGGER],
        inventory: [{ slot: 0, id: 1277, name: 'Bronze sword', count: 1 }, { slot: 1, id: 1171, name: 'Wooden shield', count: 1 }]
      }
    });
    expect(task?.name).toBe('unequip-dagger');
    await task?.run(h.ctx);
    expect(h.calls.unequipped).toEqual(['Bronze dagger']);
    expect(h.calls.equipped).toEqual(['Bronze sword', 'Wooden shield']);
  });

  test('stops at the first refusal rather than carrying on half dressed', async () => {
    const { h, task } = at({
      world: { title: 'Unequipping items.', equipment: [DAGGER], inventory: [{ slot: 1, id: 1171, name: 'Wooden shield', count: 1 }] }
    });
    const r = await task?.run(h.ctx);
    expect(r?.success).toBe(false);
    expect(h.calls.equipped).toEqual([]);
  });
});

describe('the rats', () => {
  test('attacks the rat under the melee title', async () => {
    const { h, task } = at({ world: { title: 'Attacking.', npcs: RAT } });
    expect(task?.name).toBe('attack-rat-melee');
    await task?.run(h.ctx);
    expect(h.calls.attacked).toEqual(['Giant rat']);
  });

  test('the kill is judged by no rat being in view, not by the instructor being there', () => {
    const fighting = tutorialHarness({ world: { npcs: RAT } });
    expect(noRatInSight(fighting.state())).toBe(false);
    const done = tutorialHarness({ world: { npcs: [{ index: 9, name: 'Vannaka', x: 0, z: 0 }] } });
    expect(noRatInSight(done.state())).toBe(true);
    const empty = tutorialHarness({ world: { npcs: [] } });
    expect(noRatInSight(empty.state())).toBe(true);
  });

  test('the melee task waits on that predicate rather than declaring the kill immediately', async () => {
    const { h, task } = at({ world: { title: 'Attacking.', npcs: RAT } });
    await task?.run(h.ctx);
    expect(h.calls.waited).toEqual(['until:false']);
  });

  test('the ranged step equips the bow and arrows before attacking', async () => {
    const { h, task } = at({ world: { title: 'Rat ranging.', npcs: RAT, inventory: RANGE_GEAR } });
    expect(task?.name).toBe('attack-rat-ranged');
    await task?.run(h.ctx);
    expect(h.calls.equipped).toEqual(['Shortbow', 'Bronze arrow']);
    expect(h.calls.attacked).toEqual(['Giant rat']);
  });

  test('does not attack at all when the ranging gear is missing', async () => {
    const { h, task } = at({ world: { title: 'Rat ranging.', npcs: RAT, inventory: [RANGE_GEAR[0]] } });
    const r = await task?.run(h.ctx);
    expect(r?.success).toBe(false);
    expect(h.calls.attacked).toEqual([]);
  });

  test('refuses when the pit holds nothing to attack', async () => {
    const { h, task } = at({ world: { title: 'Attacking.', npcs: [{ index: 9, name: 'Vannaka', x: 0, z: 0 }] } });
    const r = await task?.run(h.ctx);
    expect(r?.success).toBe(false);
    expect(h.calls.attacked).toEqual([]);
  });
});

describe('climb-ladder-to-bank', () => {
  test('takes the declared route on the Moving on. title', async () => {
    const { h, task } = at({ world: { title: 'Moving on.' } });
    expect(task?.name).toBe('climb-ladder-to-bank');
    await task?.run(h.ctx);
    expect(h.calls.travel).toEqual([{ landmark: 'tutorial-bank' }]);
  });

  test('names the ladder in the trace and falls back to the arrow when the route did not take', async () => {
    const { h, task } = at({
      world: { title: 'Moving on.', hint: { kind: 'tile', tile: { x: 3111, z: 9526, height: 0 } }, locs: [{ name: 'Ladder', x: 3111, z: 9526 }] },
      travel: { success: false, reason: 'unreachable', legs: 2, tiles: 4 }
    });
    await task?.run(h.ctx);
    expect(h.calls.log.join(' ')).toContain('3111, 9526');
    expect(h.calls.interactLoc).toEqual([{ name: 'Ladder', op: 1 }]);
  });

  test('does not fall back to the arrow when the route worked', async () => {
    const { h, task } = at({
      world: { title: 'Moving on.', hint: { kind: 'tile', tile: { x: 3111, z: 9526, height: 0 } }, locs: [{ name: 'Ladder', x: 3111, z: 9526 }] }
    });
    await task?.run(h.ctx);
    expect(h.calls.interactLoc).toEqual([]);
    expect(h.calls.log).toEqual([]);
  });
});

describe('the instructor and the tabs', () => {
  test('all four of his titles are one conversation task', () => {
    for (const title of ['Combat.', "You're now holding your dagger.", 'Sit back and watch.', "Well done, you've made your first kill!"]) {
      const { task } = at({ world: { title } });
      expect(task?.name).toBe('talk-combat-instructor');
    }
  });

  test('the combat interface title opens the flashing tab and the follow-up walks to the gates', async () => {
    const tab = at({ world: { title: 'Combat interface.', flashingTab: 0 } });
    expect(tab.task?.name).toBe('open-combat-tab');
    await tab.task?.run(tab.h.ctx);
    expect(tab.h.calls.setTab).toEqual([0]);

    const gates = at({
      world: { title: 'This is your Combat interface.', hint: { kind: 'tile', tile: { x: 3111, z: 9518, height: 0 } }, locs: [{ name: 'Gate', x: 3111, z: 9518 }] }
    });
    expect(gates.task?.name).toBe('enter-the-rat-pit');
    await gates.task?.run(gates.h.ctx);
    expect(gates.h.calls.interactLoc).toEqual([{ name: 'Gate', op: 1 }]);
  });
});
