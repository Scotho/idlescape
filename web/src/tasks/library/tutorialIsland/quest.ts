// The quest guide's house and the ladder into the mine.
//
// All four of the quest guide's own steps publish an empty title, so the only thing separating
// them is what the tutorial is pointing at: the instructor (an npc hint), the journal tab (a
// flashing tab, which `guide.ts` owns) and finally the ladder (a tile hint on the ladder itself).
//
// The ladder is the reason this stage exists as a module of its own: it is the first of the two
// declared atlas routes, and going down it through `c.travel` rather than by clicking the loc is
// what exercises the route path at all. The shipped atlas had zero routes before this script.
import { advance, hintIsNpc, hintIsTile, titleOf } from './helpers';
import { MINE_LADDER_TOP, TUTORIAL_MINE } from '../../../data/gen/tutorialRoutes';
import type { Task } from '../../types';
import type { WorldState } from '../../../agent/types';

/** The tutorial points the arrow at the ladder tile itself (`hint_coord(..., 0_48_48_16_47, 0)`). */
export function isLadderHint(s: WorldState): boolean {
  if (!hintIsTile(s) || titleOf(s) !== '') return false;
  const h = s.hint;
  return h.kind === 'tile' && h.tile.x === MINE_LADDER_TOP.x && h.tile.z === MINE_LADDER_TOP.z;
}

export const TASKS: Task[] = [
  {
    name: 'enter-mine',
    when: isLadderHint,
    // The route is a walk, a ladder click and a second walk on the far side, and the mine is a
    // different map square rather than a different plane, so travel's own default budget applies.
    timeoutMs: 180_000,
    async run(c) {
      c.status('Climbing down to the mine');
      const r = await c.travel.to({ landmark: TUTORIAL_MINE });
      if (!r.success) return { success: false, message: `could not reach the mine: ${r.reason ?? 'unknown'}`, reason: r.reason ?? 'unreachable' };
    }
  },
  {
    // The guide talks three times under an empty title, each time with the arrow over his head.
    // `guide.ts` has already taken the flashing-tab step in between, and `enter-mine` above has
    // taken the ladder, so what is left here is "the arrow is on a person: go and talk to them".
    name: 'talk-quest-guide',
    when: s => titleOf(s) === '' && hintIsNpc(s),
    timeoutMs: 60_000,
    async run(c) {
      c.status('Talking to the quest guide');
      await advance(c, 'talk-quest-guide');
    }
  }
];
