// The combat area: equip, unequip, kill a rat with a dagger, kill another with a bow, and climb
// out to the bank.
//
// The climb is the second of the two declared routes. Like the mine ladder it is a 6400-tile jump
// in z rather than a change of plane, so it can only be made through a route's `interact`
// waypoint; walking is not an option travel would ever find.
import { advance, advanceStep, tabStep, titleIn, titleIs } from './helpers';
import { COMBAT_LADDER_BOTTOM, TUTORIAL_BANK } from '../../../data/gen/tutorialRoutes';
import { T } from './titles';
import type { ScriptContext, Task } from '../../types';
import type { ActionResult } from '../../../agent/types';
import type { WorldState } from '../../../agent/types';

const KILL_WAIT_MS = 90_000;
/** The tutorial's rats are the only npcs in the pit, and both steps name the same target. */
const RAT = /rat/i;

/** Equips everything named, and reports the first refusal rather than carrying on half dressed. */
async function equipAll(c: ScriptContext, names: string[]): Promise<ActionResult> {
  for (const name of names) {
    const r = await c.bot.equipItem(name);
    if (!r.success) return r;
  }
  return { success: true, message: `equipped ${names.join(', ')}` };
}

/** True once nothing in the pit is worth attacking any more: the rat is dead and gone. */
export const noRatInSight = (s: WorldState): boolean => !(s.nearbyNpcs ?? []).some(n => RAT.test(n.name ?? ''));

export const TASKS: Task[] = [
  advanceStep('talk-combat-instructor', s => titleIn(s, [T.combat, T.holdingYourDagger, T.firstKill, T.sitBackAndWatch]), {
    status: 'Talking to the combat instructor'
  }),
  {
    name: 'equip-dagger',
    when: s => titleIs(s, T.wornInventory),
    timeoutMs: 30_000,
    async run(c) {
      c.status('Wielding the bronze dagger');
      const r = await c.bot.equipItem('Bronze dagger');
      if (!r.success) return r;
      await c.wait.until(s => (s.equipment ?? []).some(i => /bronze dagger/i.test(i.name ?? '')), { timeoutMs: 10_000, label: 'equip-dagger' });
    }
  },
  {
    name: 'unequip-dagger',
    when: s => titleIs(s, T.unequippingItems),
    timeoutMs: 60_000,
    async run(c) {
      c.status('Swapping the dagger for the sword and shield');
      const off = await c.bot.unequipItem('Bronze dagger');
      if (!off.success) return off;
      // The step asks for the sword and shield next, and the tutorial will not move on until
      // both are worn.
      return equipAll(c, ['Bronze sword', 'Wooden shield']);
    }
  },
  tabStep('open-combat-tab', s => titleIs(s, T.combatInterface), { status: 'Opening the combat interface' }),
  advanceStep('enter-the-rat-pit', s => titleIs(s, T.thisIsYourCombatInterface), {
    status: 'Going through the gates to the rats'
  }),
  {
    name: 'attack-rat-melee',
    when: s => titleIs(s, T.attacking),
    timeoutMs: 120_000,
    async run(c) {
      c.status('Attacking a giant rat');
      const r = await c.bot.attack(RAT);
      if (!r.success) return r;
      await c.wait.until(noRatInSight, { timeoutMs: KILL_WAIT_MS, label: 'attack-rat-melee' });
    }
  },
  {
    name: 'attack-rat-ranged',
    when: s => titleIs(s, T.ratRanging),
    timeoutMs: 150_000,
    async run(c) {
      c.status('Equipping the bow and killing a rat with it');
      const gear = await equipAll(c, ['Shortbow', 'Bronze arrow']);
      if (!gear.success) return gear;
      const r = await c.bot.attack(RAT);
      if (!r.success) return r;
      await c.wait.until(noRatInSight, { timeoutMs: KILL_WAIT_MS, label: 'attack-rat-ranged' });
    }
  },
  {
    name: 'climb-ladder-to-bank',
    when: s => titleIs(s, T.movingOn),
    timeoutMs: 180_000,
    async run(c) {
      c.status('Climbing the ladder to the bank');
      const r = await c.travel.to({ landmark: TUTORIAL_BANK });
      if (r.success) return;
      // The route is the only way up. Saying which ladder it is beats reporting a bare
      // `unreachable` into the trace from a script that names exactly one ladder.
      c.log(`the ladder at ${COMBAT_LADDER_BOTTOM.x}, ${COMBAT_LADDER_BOTTOM.z} did not take: ${r.reason ?? 'unknown'}`, 'warn');
      await advance(c, 'climb-ladder-to-bank');
    }
  }
];
