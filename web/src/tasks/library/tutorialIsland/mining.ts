// The mine: prospect, mine, smelt, smith, and out through the gates.
//
// The three prospecting titles each appear twice, once with the arrow over a rock and once with
// it over the instructor, and the move is completely different either way. Splitting on the hint
// kind rather than on the title is what makes that work: `Prospecting` with a tile hint is a
// rock, `Prospecting` with an npc hint is a conversation.
import { advance, advanceStep, hintIsNpc, hintIsTile, hintedLoc, titleIn, titleIs } from './helpers';
import { T } from './titles';
import type { ScriptContext, Task } from '../../types';
import type { ActionResult } from '../../../agent/types';

/** The prospecting steps, which the tutorial reuses for both ores. */
const ROCK_TITLES = [T.prospecting, T.itsCopper, T.itsTin] as const;
const ORE_WAIT_MS = 60_000;
/**
 * `smithing:column1` is component 1119 (`engine/content/pack/interface.pack`) and slot 0 of it is
 * `smithing_bronze1`'s `stock1`, which is `bronze_dagger`
 * (`engine/content/scripts/skill_smithing/configs/smithing/smithing.inv`). The engine refuses
 * anything else here anyway: "You cannot make this on Tutorial Island."
 */
const SMITHING_COLUMN1 = 1119;
const DAGGER_SLOT = 0;

/** Clicks the option the tutorial is asking for on the rock the arrow is over. */
async function useHintedRock(c: ScriptContext, op: string): Promise<ActionResult> {
  const hinted = hintedLoc(c.state());
  if (hinted) return c.bot.interactLoc(hinted, op);
  // The arrow can sit over a rock the scan has not reached yet; the discovery layer is the
  // second try rather than the first, because the arrow names the rock the tutorial means.
  const rock = await c.find.nearest('rock', { radius: 20 });
  if (!rock?.loc) return { success: false, message: 'no rock the arrow points at', reason: 'not_found' };
  return c.bot.interactLoc(rock.loc, op);
}

export const TASKS: Task[] = [
  advanceStep('talk-mining-instructor', s => titleIn(s, [T.miningAndSmithing, T.bronzeBar]) || (titleIn(s, ROCK_TITLES) && hintIsNpc(s)), {
    status: 'Talking to the mining instructor'
  }),
  {
    name: 'prospect-rocks',
    when: s => titleIn(s, ROCK_TITLES) && hintIsTile(s),
    timeoutMs: 60_000,
    async run(c) {
      c.status('Prospecting the rock the arrow is over');
      const r = await useHintedRock(c, 'Prospect');
      if (!r.success) return r;
      await c.wait.message(/copper|tin|contains/i, ORE_WAIT_MS);
    }
  },
  {
    name: 'mine-rocks',
    when: s => titleIs(s, T.mining),
    timeoutMs: 120_000,
    async run(c) {
      c.status('Mining the rock the arrow is over');
      const r = await useHintedRock(c, 'Mine');
      if (!r.success) return r;
      await c.wait.xp('Mining', 1, ORE_WAIT_MS);
    }
  },
  {
    name: 'smelt-bar',
    when: s => titleIs(s, T.smelting),
    timeoutMs: 120_000,
    async run(c) {
      c.status('Smelting a bronze bar');
      const r = await c.bot.useItemOnLoc('Tin ore', 'Furnace');
      if (!r.success) return r;
      await c.wait.item('Bronze bar', 1, ORE_WAIT_MS);
    }
  },
  {
    name: 'smith-dagger',
    when: s => titleIs(s, T.smithingADagger),
    timeoutMs: 120_000,
    async run(c) {
      // Two moves under one title: the bar goes on the anvil, then the smithing interface asks
      // which item. `recovery.ts` leaves this modal alone because the title says who owns it.
      if (c.state().modalOpen === true) {
        c.status('Choosing the bronze dagger');
        const click = await c.sdk.sendClickComponentWithOption(SMITHING_COLUMN1, 1, DAGGER_SLOT);
        if (!click.success) return click;
        await c.wait.item('Bronze dagger', 1, ORE_WAIT_MS);
        return;
      }
      c.status('Using the bar on the anvil');
      const r = await c.bot.useItemOnLoc('Bronze bar', 'Anvil');
      if (!r.success) return r;
      await c.wait.until(s => s.modalOpen === true, { timeoutMs: 15_000, label: 'smith-dagger' });
    }
  },
  {
    name: 'leave-mine',
    when: s => titleIs(s, T.finishedThisArea),
    timeoutMs: 90_000,
    async run(c) {
      c.status('Going through the gates to the combat area');
      await advance(c, 'leave-mine');
    }
  }
];
