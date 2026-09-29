// The Survival Expert: a tree, a fire, a shoal of shrimp and the first cooked meal.
//
// `cut-tree` and `catch-shrimp` go through `c.find` rather than through a hardcoded tile, which
// is the point of putting them here: the island's tree carries no atlas category at all, so
// `find.nearest('tree')` has to answer from the scene layer, and the scene layer being strictly
// wider than the atlas is the property this stage proves on the smallest map in the game.
import { advanceStep, tabStep, titleIn, titleIs, useItemOn } from './helpers';
import { T } from './titles';
import type { Task } from '../../types';
import type { WorldState } from '../../../agent/types';

/** The island's whole shoal is inside the scan; a wider radius would only cost a re-scan. */
const FIND_RADIUS = 30;
const CHOP_WAIT_MS = 60_000;
const COOK_WAIT_MS = 30_000;

/**
 * The two shrimp titles are a pair of steps, not one, and which of them is live says nothing
 * about what the bag holds. The tutorial deliberately burns the first shrimp: the title moves to
 * `Burning your shrimp.` with the raw one already gone, and a cook step that fired on the title
 * alone clicked at an item that is not there, failed `item_not_found` in no time at all, and
 * spent all three of the run's attempts inside one tick. Measured on the live stack in SP4b Task
 * 14 (docs/runs/tutorial-island-local.jsonl, seq 191 to 197: three failures and then `stuck`).
 *
 * So the bag decides. Holding a raw shrimp means cook it; holding none under either title means
 * go back to the water and net another.
 */
const hasRawShrimp = (s: WorldState): boolean =>
  (s.inventory ?? []).some(i => /^raw shrimps?$/i.test((i.name ?? '').trim()));
const atShrimpStep = (s: WorldState): boolean => titleIn(s, [T.cookingYourShrimp, T.burningYourShrimp]);

export const TASKS: Task[] = [
  tabStep('view-inventory', s => titleIs(s, T.viewingItems), { status: 'Opening the inventory' }),
  {
    name: 'cut-tree',
    when: s => titleIs(s, T.cutDownATree),
    timeoutMs: 90_000,
    async run(c) {
      c.status('Cutting the tutorial tree');
      // By kind, not by tile: the island's tree is where the content puts it, and this is the
      // discovery layer doing its job on the smallest possible map. `newbietree` carries no
      // `category`, so the atlas holds no cluster for it and only the scene layer can answer.
      const tree = await c.find.nearest('tree', { radius: FIND_RADIUS });
      if (!tree?.loc) return { success: false, message: 'no tree on the island', reason: 'not_found' };
      const r = await c.bot.interactLoc(tree.loc, 'Chop down');
      if (!r.success) return r;
      await c.wait.item('Logs', 1, CHOP_WAIT_MS);
    }
  },
  {
    name: 'build-fire',
    when: s => titleIs(s, T.buildingAFire),
    timeoutMs: 60_000,
    async run(c) {
      c.status('Lighting a fire');
      const r = await useItemOn(c, 'Tinderbox', 'Logs');
      if (!r.success) return r;
      await c.wait.until(s => (s.nearbyLocs ?? []).some(l => /^fire$/i.test(l.name)), { timeoutMs: COOK_WAIT_MS, label: 'build-fire' });
    }
  },
  // Only the first of the two skill titles is a tab step. The client clears the flash the moment
  // the flashing tab is opened (Client.ts, `tutFlashIcon === activeIcon`), and that TUT_CLICKSIDE
  // is exactly what advances the step to 'These are your stats.'; the content's next proc points
  // the arrow back at the Survival Expert instead. Matching both titles as a tab step returned
  // 'no tab is flashing' every lap under the second one, until maxAttempts tripped markStuck.
  tabStep('open-skills', s => titleIs(s, T.gainedExperience), { status: 'Opening the skills tab' }),
  advanceStep('view-stats', s => titleIs(s, T.theseAreYourStats), {
    status: 'Going back to the Survival Expert'
  }),
  {
    name: 'catch-shrimp',
    // Also the two cooking titles with an empty net: that is the burnt-shrimp lap, and nothing
    // else in this stage sends the run back to the shoal for the second one.
    when: s => titleIs(s, T.catchSomeShrimp) || (atShrimpStep(s) && !hasRawShrimp(s)),
    timeoutMs: 90_000,
    async run(c) {
      c.status('Netting shrimp');
      const spot = await c.find.nearest('fishing-spot', { radius: FIND_RADIUS });
      if (!spot?.npc) return { success: false, message: 'no fishing spot on the island', reason: 'not_found' };
      const r = await c.bot.interactNpc(spot.npc, 'Net');
      if (!r.success) return r;
      await c.wait.item('Raw shrimps', 1, CHOP_WAIT_MS);
    }
  },
  {
    // Both titles, but only with something to cook: see `hasRawShrimp` above.
    name: 'cook-shrimp',
    when: s => atShrimpStep(s) && hasRawShrimp(s),
    timeoutMs: 90_000,
    async run(c) {
      c.status('Cooking on the fire');
      const r = await c.bot.useItemOnLoc('Raw shrimps', 'Fire');
      if (!r.success) return r;
      await c.wait.item('Shrimps', 1, COOK_WAIT_MS);
    }
  },
  advanceStep('survival-recap', s => titleIn(s, [T.firstMeal, T.findYourNextInstructor]), {
    status: 'Finishing with the Survival Expert'
  })
];
