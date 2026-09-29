import { defineScript } from '../defineScript';
import { dropAllTask, levelOf, tool } from './loopHelpers';

export default defineScript({
  id: 'chop-and-drop', name: 'Chop and drop', version: 1, order: 10, tags: ['skilling', 'woodcutting'], author: 'idlescape',
  description: 'Finds a tree of the chosen kind, walking to one when none is in sight, and drops the logs until the target Woodcutting level.',
  params: {
    tree: { type: 'select', label: 'Tree', default: 'Tree', options: [{ value: 'Tree', label: 'Tree' }, { value: 'Oak', label: 'Oak' }] },
    untilLevel: { type: 'number', label: 'Stop at level', default: 15, min: 2, max: 99 },
    keepLogs: { type: 'boolean', label: 'Keep logs (stop when full)', default: false }
  },
  requires: [tool('Bronze axe')], stuckAfterMs: 45_000, maxAttempts: 3, hardStop: { hpBelowPoints: 3 }, estimateMinutes: 20,
  // No `onDeath` or `onStuck`: a woodcutting loop has nothing of its own to say about dying, so
  // both follow the player's own behaviour settings.
  health: { noProgressMs: 90_000 },
  until: (s, c) => levelOf(s, 'Woodcutting') >= Number(c.params.untilLevel) || (c.params.keepLogs === true && (s.inventory?.length ?? 0) >= 28),
  tasks: [
    dropAllTask('drop-logs-when-full', /logs$/i, 'keepLogs'),
    {
      name: 'chop-nearest', when: () => true, timeoutMs: 180_000,
      async run(c) {
        const kind = String(c.params.tree);
        c.status(`Looking for ${kind}`);
        // One matcher for the two namespaces `c.find` searches with a single pattern: the scene
        // reports the display name the game shows ('Oak') and an atlas cluster carries the
        // content debug name ('oaktree'), so a matcher naming one of them loses the other layer.
        // The plain tree is the exception the content makes: `tree` and `tree2` are both 'Tree'.
        const variant = /^tree$/i.test(kind) ? /^(tree|tree2)$/i : new RegExp(`^(${kind}|${kind}tree)$`, 'i');
        // `find.nearest` widens by itself: the scene, then the atlas (walking to the cluster it
        // names), then a sweep. "No tree in range" is no longer a failure this script invents
        // one tile out of reach.
        const found = await c.find.nearest('tree', { variant });
        if (!found) return { success: false, message: `no ${kind} anywhere nearby`, reason: 'not_found' };
        // `find` drops the variant for the re-scan it runs after walking to a cluster, so
        // `found.loc` is the nearest tree of ANY species standing there. Trees, unlike rocks
        // and fishing spots, do carry distinguishing display names ('Oak' against 'Tree'), so
        // the name is checked before the click: an oak cluster with a plain tree nearer its
        // centre must not quietly become a plain-tree run.
        const target = found.loc !== undefined && found.loc.name.toLowerCase() === kind.toLowerCase() ? found.loc : null;
        c.status(`Chopping ${target === null ? kind : target.name}`);
        // No usable loc: the cluster emptied, or only another species is standing in it.
        // `chopTree` resolves by display name out of the snapshot, which is the better last try
        // before failing, and it answers 'No tree found' rather than chopping the wrong thing.
        const r = target !== null ? await c.bot.interactLoc(target, 'Chop down') : await c.bot.chopTree(kind);
        if (!r.success) return r;
        await c.wait.xp('Woodcutting', 1, 30_000);
      }
    }
  ]
});
