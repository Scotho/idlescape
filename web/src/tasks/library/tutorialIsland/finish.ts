// The bank, the chapel, the wizard, and the boat to the mainland - plus the two fallbacks that
// close the island out.
//
// The chapel and prayer steps publish no title at all, five of them in a row, so they are covered
// by the fallbacks rather than by tasks of their own: a flashing tab is `guide.ts`'s
// `open-flashing-tab`, an arrow is `follow-the-arrow` below, and an instructor talking is
// `recovery.ts`'s `continue-dialog`. The fallbacks are last in the list on purpose - every named
// step above wins over them.
import { advance, advanceStep, hasChoices, hasHint, tabStep, titleIs } from './helpers';
import { DECLINE_SKIP } from './recovery';
import { T } from './titles';
import type { Task } from '../../types';

const BANK_WAIT_MS = 15_000;
const CAST_WAIT_MS = 60_000;
/**
 * Which option to take when a step offers a choice. Nothing on Tutorial Island is destructive and
 * nothing on it is irreversible, so the worst a wrong pick costs is a repeat of the step - but
 * the last dialog of all is the one that leaves the island, so leaving is what is preferred.
 */
const PREFERRED_OPTION = /mainland|lumbridge|yes|ready|continue/i;

export const TASKS: Task[] = [
  {
    name: 'open-bank',
    when: s => titleIs(s, T.banking),
    timeoutMs: 90_000,
    async run(c) {
      c.status('Opening a bank booth');
      const r = await c.bot.openBank();
      if (!r.success) return r;
      await c.wait.until(s => s.bank?.isOpen === true, { timeoutMs: BANK_WAIT_MS, label: 'open-bank' });
    }
  },
  {
    name: 'close-bank',
    when: s => titleIs(s, T.bankBox),
    timeoutMs: 60_000,
    async run(c) {
      // Two moves under one title, in order: shut the box, then take the door the arrow is over.
      if (c.state().bank?.isOpen === true) {
        c.status('Closing the bank box');
        const r = await c.bot.closeBank();
        if (!r.success) return r;
        await c.wait.until(s => s.bank?.isOpen !== true, { timeoutMs: BANK_WAIT_MS, label: 'close-bank' });
        return;
      }
      c.status('Leaving the bank');
      await advance(c, 'close-bank');
    }
  },
  advanceStep('talk-advisor', s => titleIs(s, T.financialAdvice), { status: 'Talking to the account guide' }),
  tabStep('open-ignore-tab', s => titleIs(s, T.friendsList), { status: 'Opening the ignore list' }),
  advanceStep('talk-brother-brace', s => titleIs(s, T.ignoreList), { status: 'Talking to Brother Brace' }),
  advanceStep('find-the-final-instructor', s => titleIs(s, T.finalInstructor), { status: 'Walking to the wizard' }),
  tabStep('open-magic-tab', s => titleIs(s, T.openUpYourFinalMenu), { status: 'Opening the magic menu' }),
  {
    name: 'cast-wind-strike',
    when: s => titleIs(s, T.castWindStrike),
    timeoutMs: 120_000,
    async run(c) {
      c.status('Casting Wind Strike at a chicken');
      // The tutorial says so itself: "It may take several tries." A splash leaves the title
      // where it is and the runner enters this task again.
      const r = await c.bot.castSpell(/chicken/i, 'wind strike');
      if (!r.success) return r;
      await c.wait.xp('Magic', 1, CAST_WAIT_MS);
    }
  },
  advanceStep('leave-for-the-mainland', s => titleIs(s, T.almostCompleted), {
    status: 'Asking Terrova for the trip to Lumbridge', timeoutMs: 90_000
  }),
  {
    // Never clicked blind from `continue-dialog`, which handles option-less dialogs only: a
    // choice is a decision, and this is the one task on the island that makes one.
    name: 'choose-dialog-option',
    when: hasChoices,
    timeoutMs: 20_000,
    async run(c) {
      // `recovery.ts`'s `decline-tutorial-skip` answers the skip offer before any step task is
      // reached, so DECLINE_SKIP first is the second lock on the one door that must not open:
      // "Yes please." is in PREFERRED_OPTION, and taking it ends the run in Lumbridge with none
      // of the island played. That order is the only rule this task still owns; the server index
      // versus the array position is `c.dialog`'s, which is why the paragraph that used to
      // explain it here is gone.
      const options = c.dialog.options();
      const chosen = options.find(t => DECLINE_SKIP.test(t.trim()))
        ?? options.find(t => PREFERRED_OPTION.test(t))
        ?? options[0];
      if (chosen === undefined) return { success: false, message: 'the dialog offered nothing to answer', reason: 'not_found' };
      c.status(`Answering "${chosen}"`);
      const r = await c.dialog.choose(chosen);
      if (!r.success) return r;
    }
  },
  {
    // The last resort, and the one that carries the five untitled chapel steps: the tutorial is
    // pointing at something and has said nothing else about it.
    name: 'follow-the-arrow',
    when: hasHint,
    timeoutMs: 60_000,
    async run(c) {
      c.status('Doing what the arrow points at');
      await advance(c, 'follow-the-arrow');
    }
  }
];
