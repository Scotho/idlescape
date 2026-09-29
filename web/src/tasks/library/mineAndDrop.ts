import { defineScript } from '../defineScript';
import { dropAllTask, levelOf, tool } from './loopHelpers';

export default defineScript({
  id: 'mine-and-drop', name: 'Mine and drop', version: 1, order: 30, tags: ['skilling', 'mining'], author: 'idlescape',
  description: 'Finds the chosen ore, walking to its rocks when none are in sight, and drops the ore until the target Mining level.',
  params: {
    ore: { type: 'select', label: 'Ore', default: 'Copper', options: [{ value: 'Copper', label: 'Copper' }, { value: 'Tin', label: 'Tin' }, { value: 'Iron', label: 'Iron' }] },
    untilLevel: { type: 'number', label: 'Stop at level', default: 15, min: 2, max: 99 }
  },
  requires: [tool('Bronze pickaxe')], stuckAfterMs: 45_000, maxAttempts: 3, hardStop: { hpBelowPoints: 3 }, estimateMinutes: 25,
  // Nothing of its own to say about dying or being stuck, so both follow the player's settings.
  health: { noProgressMs: 90_000 },
  until: (s, c) => levelOf(s, 'Mining') >= Number(c.params.untilLevel),
  tasks: [
    dropAllTask('drop-ore-when-full', /ore$/i),
    {
      name: 'mine-nearest-rock', when: () => true, timeoutMs: 180_000,
      async run(c) {
        // `ore` is a select over fixed values, so it is safe to build a matcher from it.
        const ore = String(c.params.ore);
        c.status(`Looking for ${ore} rocks`);
        // The ore is chosen from the atlas, never from the scene. Every mining rock in the
        // content is displayed as 'Rocks' - `copperrock1`, `tinrock1` and `ironrock1` all carry
        // `name=Rocks` - so the scene cannot tell one ore from another and only a cluster's
        // content debug name can. `find.nearest` therefore walks to the chosen ore's own
        // cluster and re-scans there, where the nearest rock is the rock that was asked for.
        // Which rock the re-scan lands on inside the chosen cluster cannot be checked here the
        // way chop-and-drop checks a tree: every rock is `name=Rocks` and every one offers
        // 'Mine', so neither the display name nor the menu can tell copper from tin. In a mine
        // that holds both (Lumbridge swamp) a lap can mine the other ore. Accepted, and not
        // fixable without loc ids in the atlas.
        const found = await c.find.nearest('rock', { variant: new RegExp(`^${ore}rock`, 'i') });
        if (!found) return { success: false, message: `no ${ore} rocks anywhere nearby`, reason: 'not_found' };
        const rock = found.loc;
        // No `loc` after the atlas walked us to the cluster: the rocks are mined out, or the
        // re-scan could not reach them. Either way there is nothing here to swing at.
        if (!rock) return { success: false, message: `walked to the ${ore} rocks and none are standing`, reason: 'not_found' };
        c.status(`Mining ${ore}`);
        const r = await c.bot.interactLoc(rock, 'Mine');
        if (!r.success) return r;
        await c.wait.xp('Mining', 1, 30_000);
      }
    }
  ]
});
