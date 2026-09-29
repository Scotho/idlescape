// The Gielinor Guide's room, plus the two steps that recur across the whole island: a flashing
// sidebar tab under an empty title, and `Please wait...` while the server catches up.
//
// The island's first four steps are the guide talking, one flashing spanner, and a door and a
// path the hint arrow points at, so almost all of it is `advanceStep`.
import { advanceStep, flashingTab, stepKey, tabStep, titleIn, titleIs, titleOf, waitForStep } from './helpers';
import { T } from './titles';
import type { Task } from '../../types';

/** Long enough for the server-side wait these steps actually cover, and no longer. */
const PLEASE_WAIT_MS = 30_000;

export const TASKS: Task[] = [
  advanceStep('getting-started', s => titleIn(s, [T.gettingStarted, T.playerControls]), {
    status: 'Listening to the Gielinor Guide'
  }),
  // Every untitled tab step on the island, not only the spanner: the quest guide's journal and
  // the chapel's prayer tab publish no title at all, and the flashing tab is the only signal.
  tabStep('open-flashing-tab', s => titleOf(s) === '' && flashingTab(s) !== null, {
    status: 'Opening the tab the tutorial is flashing'
  }),
  advanceStep('interact-scenery', s => titleIs(s, T.interactingWithScenery), {
    status: 'Opening the door the arrow points at'
  }),
  advanceStep('moving-around', s => titleIs(s, T.movingAround), {
    status: 'Walking where the arrow points'
  }),
  {
    // `Please wait...` appears in four stages and means the server is mid-step. Doing anything
    // here is how a run ends up clicking at an interface that is about to be replaced.
    name: 'please-wait',
    when: s => titleIs(s, T.pleaseWait),
    timeoutMs: 60_000,
    async run(c) {
      c.status('Waiting for the tutorial to catch up');
      await waitForStep(c, stepKey(c.state()), PLEASE_WAIT_MS, 'please-wait');
    }
  }
];
