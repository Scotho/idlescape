// P8. `interactGroundItem` exists in the vendored BotAction union (sdk/types.ts:615) and
// nothing wraps it, so a ground item can be picked up (through sendPickup) and never used with
// any other menu option. This is our own wrapper layer rather than an addition to the vendored
// actions file, because re-vendoring is a recurring cost and a PATCHES.md note is not.
//
// `c.bot` is the vendored `BotActions` with this object's members assigned onto it
// (workerContext.ts), so what is declared here is what `ScriptBot` adds over the class.
import type { ActionResult, BotAction, WorldState } from '../agent/types';
import type { GroundItem } from '../vendor/rs-sdk/sdk/types';

export interface InteractGroundItemOpts {
  /**
   * The game's own option ordinal, 1 to 5, where 3 is Take (Client.ts:1278). Defaults to 3.
   * Ground items are the ONE documented exception to "never a raw menu index" (S5): GroundItem
   * publishes no option text for a name to match against, unlike NearbyLoc, NearbyNpc and
   * InventoryItem, which all carry optionsWithIndex. Survey ruling 13 records it, and ruling 25
   * declines the collector change that would close it. Client.ts:1282 rejects anything outside
   * 1 to 5, which is why the type is the literal union rather than `number`.
   */
  opIndex?: 1 | 2 | 3 | 4 | 5;
  /** A caller's own signal. Aborting it reports `stopped` without dispatching anything. */
  signal?: AbortSignal;
}

/** What `ScriptBot` adds over the vendored `BotActions`. */
export interface BotExtras {
  /**
   * Use a ground item with one of its menu options, resolving the pile by name, by pattern, or
   * from a `GroundItem` the caller already holds.
   */
  interactGroundItem(target: GroundItem | string | RegExp, opts?: InteractGroundItemOpts): Promise<ActionResult>;
}

export interface BotExtrasDeps {
  /** The tick snapshot a name or a pattern is resolved against. */
  state(): WorldState;
  /** The transport's own dispatch, which is where the action's timeout and cancellation live. */
  dispatch(action: BotAction): Promise<ActionResult>;
}

/** Take. The default, because it is what a script means nine times in ten. */
const TAKE = 3;

/** A string matches the whole name, trimmed and case-insensitively; a pattern is tested. */
function matches(item: GroundItem, sel: string | RegExp): boolean {
  const name = (item.name ?? '').trim();
  if (typeof sel === 'string') return name.toLowerCase() === sel.trim().toLowerCase();
  // `test` advances `lastIndex` on a /g or /y pattern and leaves it there after a match, so the
  // next pile in the same sweep would be tested from the middle of its name. One RegExp object
  // is tested against every candidate here, and a caller may keep theirs across calls, so the
  // offset is reset rather than trusted. `/logs/gi` is a pattern a script author will write.
  sel.lastIndex = 0;
  return sel.test(name);
}

/**
 * The nearest match, found in one pass. Deliberately not `.filter(...).sort(...)[0]`: that shape
 * is S5's own named violation, it is live in three library scripts, and the reference must not
 * teach it from the layer the reference documents.
 */
function nearestMatch(items: GroundItem[], sel: string | RegExp): GroundItem | null {
  let best: GroundItem | null = null;
  for (const item of items) {
    if (!matches(item, sel)) continue;
    if (!best || item.distance < best.distance) best = item;
  }
  return best;
}

export function createBotExtras(d: BotExtrasDeps): BotExtras {
  return {
    async interactGroundItem(target, o = {}) {
      if (o.signal?.aborted) return { success: false, message: 'the run was stopped', reason: 'stopped' };
      // A resolved `GroundItem` is taken at its word rather than looked up again: it may have
      // come from `c.sdk.scanGroundItems`, which reaches piles the tick snapshot has not
      // published, and a re-resolution would then lose the target the caller just found.
      const resolved = typeof target === 'object' && !(target instanceof RegExp)
        ? target
        : nearestMatch(d.state().groundItems ?? [], target);
      if (!resolved) {
        const shown = typeof target === 'string' ? target : String(target);
        // `target_not_found` and not `not_found`: it is the spelling our own members already
        // return (workerContext.ts:203, find.ts), and P10 closes the split in entry 7.
        return { success: false, message: `no ground item matching ${shown}`, reason: 'target_not_found' };
      }
      return d.dispatch({
        type: 'interactGroundItem',
        x: resolved.x, z: resolved.z, itemId: resolved.id,
        optionIndex: o.opIndex ?? TAKE,
        reason: 'script'
      });
    }
  };
}
