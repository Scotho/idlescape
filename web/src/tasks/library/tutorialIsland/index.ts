// Tutorial Island, end to end. The script that exercises every layer this sub-project built at
// once: discovery (`c.find` answering from the scene where the atlas has nothing), travel
// (the island's two ladders, as the first declared routes the atlas carries), the health monitor
// (four conditions the script claims for itself), and the runner's task loop.
//
// The step signal is the chatbox title, because `%tutorial` is a server-only varp. Thirteen of the
// content's seventy-five titles are empty strings and several repeat, so the tasks below match on
// the title first, then on the flashing tab, then on the hint arrow, then on the dialog - in that
// order, which is the order the task list is assembled in.
import { defineScript } from '../../defineScript';
import { CHAR_DESIGN_INTERFACE } from '../../../agent/constants';
import { isTutorialRegion, TUTORIAL_REGION_IDS } from '../regions';
import { TASKS as recovery } from './recovery';
import { TASKS as guide } from './guide';
import { TASKS as survival } from './survival';
import { TASKS as chef } from './chef';
import { TASKS as quest } from './quest';
import { TASKS as mining } from './mining';
import { TASKS as combat } from './combat';
import { TASKS as finish } from './finish';

export default defineScript({
  id: 'tutorial-island', name: 'Tutorial Island', version: 1, order: 5,
  tags: ['tutorial', 'questing'], author: 'idlescape',
  description: 'Plays a fresh character through Tutorial Island and out onto the mainland.',
  params: {
    randomiseAppearance: { type: 'boolean', label: 'Randomise appearance', default: true }
  },
  requires: [{ kind: 'area', regionIds: [...TUTORIAL_REGION_IDS], text: 'Only runs on Tutorial Island' }],
  stuckAfterMs: 45_000, maxAttempts: 3, hardStop: { hpBelowPoints: 3 }, estimateMinutes: 25,
  health: {
    // Nothing on the island should kill anyone: a death here means something is wrong that
    // walking back to the anchor will not fix.
    onDeath: 'fail',
    // Several steps genuinely wait on the server, and `Please wait...` is a step of its own.
    noProgressMs: 120_000,
    // The character designer, which `recovery.ts` owns. The bank and the smithing interface are
    // recognised by `recovery.ts` instead, because neither has an id this script can read out of
    // the pinned content.
    expectInterfaces: [CHAR_DESIGN_INTERFACE],
    maxRecoveryAttempts: 3
  },
  // Recovery first: a modal or an open dialog blocks every other task on the island. Then the
  // stages in the order the tutorial walks them, and the two fallbacks at the tail of `finish`.
  tasks: [...recovery, ...guide, ...survival, ...chef, ...quest, ...mining, ...combat, ...finish],
  until: s => !isTutorialRegion(s.regionId) && s.tutorial?.open !== true
});
