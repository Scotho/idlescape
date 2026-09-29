import { defineScript } from '../defineScript';
import { countMatching, dropAllTask, levelOf, tool } from './loopHelpers';

/** Raw shrimps and anchovies are what a small net catches; both go straight back on the floor. */
const CATCH = /shrimp|anchov/i;

/**
 * The spots a small net works, as an atlas cluster names them: `saltfish` is the shrimp and
 * anchovy spot, `memberfish` the members' net and harpoon spot, `newbiefishing` Tutorial
 * Island's. The lure, cage, bait and fishing-contest spots offer no Net op and are left out.
 *
 * The scene is deliberately not named here. Every fishing spot npc in the content carries
 * `name=Fishing spot`, so a display-name matcher would match a lure spot as readily as a net
 * one and the scene layer would answer with a spot this script cannot use. Matching only the
 * content debug names sends `find.nearest` to the right cluster and re-scans there.
 */
const NET_SPOTS = /^(saltfish|memberfish|newbiefishing)$/i;

export default defineScript({
  id: 'net-fish-and-drop', name: 'Net fish and drop', version: 1, order: 20, tags: ['skilling', 'fishing'], author: 'idlescape',
  description: 'Finds a net fishing spot, walking to one when none is in sight, and drops the catch until the target Fishing level.',
  params: {
    untilLevel: { type: 'number', label: 'Stop at level', default: 20, min: 2, max: 99 }
  },
  requires: [tool('Small fishing net')], stuckAfterMs: 45_000, maxAttempts: 3, hardStop: { hpBelowPoints: 3 }, estimateMinutes: 25,
  // Nothing of its own to say about dying or being stuck, so both follow the player's settings.
  health: { noProgressMs: 90_000 },
  until: (s, c) => levelOf(s, 'Fishing') >= Number(c.params.untilLevel),
  tasks: [
    dropAllTask('drop-fish-when-full', CATCH),
    {
      name: 'net-nearest-spot', when: () => true, timeoutMs: 180_000,
      async run(c) {
        c.status('Looking for a fishing spot');
        const found = await c.find.nearest('fishing-spot', { variant: NET_SPOTS });
        if (!found) return { success: false, message: 'no net fishing spot anywhere nearby', reason: 'not_found' };
        // `find` drops the variant for the re-scan it runs after the walk, and all 51 spot npcs
        // are displayed 'Fishing spot', so `found.npc` is simply the nearest spot of any kind.
        // Lure, bait and cage spots stand beside net ones (Catherby, Lumbridge), and refusing
        // the whole lap because one of those is a tile nearer would fail the run against a
        // snapshot that never changes. Take the nearest spot that a net actually works instead.
        // `reachable: false` interactions fail silently before a packet is sent, so those are
        // skipped here the same way `find` skips them. The display name is deliberately NOT
        // tested as well: measured over the whole pinned content, `saltfish`, `memberfish` and
        // Tutorial Island's `newbiefishing` are the only three npc configs that carry a `Net`
        // op at all, so a name test could never change the answer.
        const spot = (c.state().nearbyNpcs ?? [])
          .filter(n => (n.options ?? []).includes('Net') && n.reachable !== false)
          .sort((a, b) => a.distance - b.distance)[0];
        if (!spot) {
          const near = found.npc;
          // A spot is an npc and npcs move, so the shoal can be gone by the time we arrive.
          // Report the tile, never `found.name`: on the empty-cluster path that is the content
          // debug name ('saltfish'), which means nothing to a player.
          if (!near) return { success: false, message: `nothing is fishing at ${found.x}, ${found.z}`, reason: 'not_found' };
          return { success: false, message: `the spot at ${near.x}, ${near.z} cannot be netted`, reason: 'not_found' };
        }
        const before = countMatching(c.state(), CATCH);
        c.status('Netting the fishing spot');
        const r = await c.bot.interactNpc(spot, 'Net');
        if (!r.success) return r;
        // `wait.item` matches an item id or an exact name, never a pattern, so the two
        // possible catches are matched here through `wait.until` instead.
        await c.wait.until(s => countMatching(s, CATCH) > before, { timeoutMs: 30_000, label: 'a catch' });
      }
    }
  ]
});
