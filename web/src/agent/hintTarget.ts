// Which loc a tile hint arrow means, and which menu option to send at it.
//
// The arrow is not always standing on the thing it points at. Measured in the pinned content,
// three of Tutorial Island's doors carry their `^hint_east` arrow one tile west of the door's
// own placement: `tutorial_step_go_to_chef` hints `0_48_48_6_12` while `newbie_door2` sits at
// `m48_48` "0 7 12: 3017 0", the bank exit hints `0_48_48_52_52` against "0 53 52", and the
// account guide's door hints `0_48_48_57_52` against "0 58 52". Every other tile hint on the
// island is on its loc's own tile, which is why an exact-tile match got a live run as far as the
// chef's door and no further: it walked onto the door's tile, found nothing standing on the
// arrow, and repeated that until the no-progress rung paused the run
// (docs/runs/tutorial-island-local.jsonl, seq 132 onward).
//
// One rule, used by `workerContext.followHint`, so the fake in the Tutorial Island harness can
// share it rather than re-state it and drift into being the more permissive of the two.
import type { NearbyLoc } from '../vendor/rs-sdk/sdk/types';

/** How far off the arrow a loc may stand and still be what the arrow means, in tiles. */
export const HINT_RADIUS = 1;

/** A door's own option, preferred over option 1 whenever the loc that wins carries it. */
const OPEN = /^open$/i;

export interface HintTarget {
  loc: NearbyLoc;
  /** The option index to send: the loc's own `Open` when it has one, otherwise the first. */
  op: number;
}

/** The `Open` option's server-side index on this loc, or null when it offers none. */
function openOp(l: NearbyLoc): number | null {
  return (l.optionsWithIndex ?? []).find(o => OPEN.test(o.text))?.opIndex ?? null;
}

/**
 * The loc the arrow at `tile` means, or null when the arrow is pointing at bare ground and the
 * caller should walk to it instead.
 *
 * The arrow's own tile always wins, whatever it is carrying, because that is what the rule was
 * before the neighbour case existed and every step that already worked depends on it. A loc one
 * tile away only counts when it offers something to click, so a fence, a floor or a wall
 * decoration beside the arrow can never beat walking to the tile; among equals the thing that
 * opens wins, which is the door on all three of the steps this exists for.
 */
export function locAtHint(locs: readonly NearbyLoc[], tile: { x: number; z: number }): HintTarget | null {
  let best: NearbyLoc | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const l of locs) {
    const away = Math.max(Math.abs(l.x - tile.x), Math.abs(l.z - tile.z));
    if (away > HINT_RADIUS) continue;
    const open = openOp(l);
    if (away > 0 && (l.optionsWithIndex ?? []).length === 0) continue;
    const rank = away * 2 + (open === null ? 1 : 0);
    if (rank < bestRank) { best = l; bestRank = rank; }
  }
  return best ? { loc: best, op: openOp(best) ?? 1 } : null;
}
