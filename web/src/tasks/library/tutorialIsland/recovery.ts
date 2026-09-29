// The conditions this script handles itself, declared with `recovers` so the health monitor hands
// them over instead of running its own recovery beside them. All four are ordinary island
// furniture rather than failures: the character designer opens on the first tick, an instructor
// talks between every step, and the island hands out a level-up every few minutes.
//
// These tasks come first in the script's task list. A modal or an open dialog blocks every other
// task on the island, so anything that clears one has to be picked before the step tasks.
import { CHAR_DESIGN_INTERFACE } from '../../../agent/constants';
import { isLevelUp } from '../../health';
import { isTalking, titleIn } from './helpers';
import { T } from './titles';
import type { Task } from '../../types';
import type { WorldState } from '../../../agent/types';

/**
 * The steps that open a modal on purpose. The smithing interface has no id this script can
 * measure from the pinned content and the bank's is not a constant either, so the step that asked
 * for the modal is what identifies it. Closing one of these would undo the move the tutorial has
 * just asked for and leave the step where it was.
 */
const MODAL_STEPS: readonly string[] = [T.smithingADagger, T.banking, T.bankBox];

/** The designer is open and waiting for a body to be chosen. */
export const isCharacterDesign = (s: WorldState): boolean =>
  s.interface?.isOpen === true && s.interface.interfaceId === CHAR_DESIGN_INTERFACE;

/**
 * A modal the island did not ask for. The exceptions are recognised rather than listed by id: the
 * bank is `s.bank.isOpen`, which the client publishes from the bank state itself; the designer
 * has the one interface id the agent runtime already names; and the rest are identified by the
 * step title that asked for them.
 */
export function isUnexpectedModal(s: WorldState): boolean {
  if (s.modalOpen !== true) return false;
  if (s.bank?.isOpen === true) return false;
  if (titleIn(s, MODAL_STEPS)) return false;
  return !isCharacterDesign(s);
}

/**
 * The one option a run must take the moment it is offered, ahead of every step task.
 *
 * Measured on the live stack in SP4b Task 14. `map_live` is false on every dev and e2e world,
 * and `[label,newbie_basics_instructor_welcome]` only asks "Do you want to skip the tutorial?"
 * there, offering "Yes please." and "No, thank you.". No stage owns that choice, so nothing
 * answered it: `getting-started` matched on the title first and re-talked to the guide for as
 * long as the title stood, and the run left the island in Lumbridge with none of it played.
 * It is answered here, in the tasks that come before every stage, for the same reason
 * `continue-dialog` is: a dialog blocks every other task on the island.
 *
 * The dialog that leaves the island offers "Yes." and "No.", so this pattern cannot take that
 * one by mistake.
 */
export const DECLINE_SKIP = /^no,?\s*thank you\.?$/i;

/**
 * The question, one chatbox frame ahead of its two answers. It is matched as well as the answers
 * because the answers alone are a frame too late: the guide asks, `getting-started` matches the
 * title and talks to him again, and the twenty second step wait runs out with the question still
 * on screen. `interfaceTexts` is where the chatbox line arrives (`4885` in the measured frame).
 */
const SKIP_QUESTION = /skip the tutorial/i;

const declineIndex = (s: WorldState): number =>
  (s.dialog?.options ?? []).findIndex(o => DECLINE_SKIP.test((o.text ?? '').trim()));

const asksToSkip = (s: WorldState): boolean =>
  Object.values(s.interfaceTexts ?? {}).some(t => SKIP_QUESTION.test(t));

export const TASKS: Task[] = [
  {
    name: 'decline-tutorial-skip',
    when: s => declineIndex(s) >= 0 || asksToSkip(s),
    timeoutMs: 20_000,
    async run(c) {
      c.status('Declining the offer to skip the tutorial');
      // The question arrives as an ordinary chatbox frame and its answers only open behind it,
      // so the frame is clicked through first when that is what is on screen.
      // `continueUntilOption` is the member that stops the moment a choice appears, so the blind
      // one-click-then-wait this used to do is one call now, and it says why it gave up.
      if (declineIndex(c.state()) < 0) {
        const opened = await c.dialog.continueUntilOption();
        if (!opened.success) return opened;
      }
      // Kept as `not_found` rather than re-spelled: closing that union against the
      // `target_not_found` our own members return is P10, in sprint entry 7 (R9, D133).
      if (declineIndex(c.state()) < 0) return { success: false, message: 'the skip offer never opened its answers', reason: 'not_found' };
      const r = await c.dialog.choose(DECLINE_SKIP);
      if (!r.success) return r;
    }
  },
  {
    name: 'design-character',
    recovers: ['unexpected-interface'],
    when: isCharacterDesign,
    timeoutMs: 20_000,
    async run(c) {
      c.status('Choosing an appearance');
      // The designer cannot be driven field by field from here: `acceptCharacterDesign` uses
      // whatever design state the client holds, so randomising first is the only way a run gets
      // anything but the default body.
      if (c.params.randomiseAppearance === true) await c.sdk.sendRandomizeCharacterDesign();
      await c.sdk.sendAcceptCharacterDesign();
      const closed = await c.wait.until(s => !isCharacterDesign(s), { timeoutMs: 10_000, label: 'design-character' });
      if (closed) c.health.recovered('unexpected-interface');
    }
  },
  {
    name: 'dismiss-level-up',
    recovers: ['level-up'],
    when: isLevelUp,
    timeoutMs: 15_000,
    async run(c) {
      c.status('Dismissing a level-up');
      await c.tutorial.clickThrough(3);
      c.health.recovered('level-up');
    }
  },
  {
    name: 'continue-dialog',
    recovers: ['dialog-stuck'],
    // Option-less only. A dialog offering choices is a decision the stage that opened it owns,
    // and clicking blind through one is the single dialog move that cannot be undone.
    when: isTalking,
    timeoutMs: 20_000,
    async run(c) {
      c.status('Listening to the instructor');
      await c.tutorial.clickThrough(5);
      c.health.recovered('dialog-stuck');
    }
  },
  {
    name: 'close-unexpected-modal',
    recovers: ['unexpected-interface'],
    when: isUnexpectedModal,
    timeoutMs: 10_000,
    async run(c) {
      c.status('Closing an interface the tutorial did not ask for');
      await c.sdk.sendCloseModal();
      const closed = await c.wait.until(s => !isUnexpectedModal(s), { timeoutMs: 5_000, label: 'close-modal' });
      if (closed) c.health.recovered('unexpected-interface');
    }
  },
  {
    name: 'accept-expected-interface',
    // The monitor fires `unexpected-interface` for anything not in `expectInterfaces`, and the
    // bank is not in that list because its id is not a number this script can measure from the
    // pinned content. Claiming a condition and never reporting it back leaves it active for the
    // rest of the run, which would silence the monitor's interface arm from the banking step on.
    when: (s, c) => c.health.is('unexpected-interface') && !isUnexpectedModal(s) && !isCharacterDesign(s),
    timeoutMs: 5_000,
    async run(c) {
      c.log('the interface the monitor flagged is one the tutorial asked for', 'info');
      c.health.recovered('unexpected-interface');
    }
  }
];
