// Walking back for what a death dropped. The engine drops everything except the three most
// valuable items at the tile the player died on, and gives the pile 200 ticks (120 seconds)
// before it despawns (`^lootdrop_duration`), so this is a race the recovery can lose honestly:
// losing the loot is not a failed run, and every giving-up path settles as recovered.
import type { ScriptContext } from './types';

/** `^lootdrop_duration` = 200 ticks at 600 ms. The budget covers respawn, travel AND pickup. */
export const LOOT_WINDOW_MS = 120_000;
/** The death pile is one tile, but a pickup walk can nudge the player; scan a little wider. */
export const LOOT_SCAN_RADIUS = 8;
const INVENTORY_SLOTS = 28;
/** Standing on the pile is not required to take from it, and insisting on it can fail the walk. */
const TILE_TOLERANCE = 1;

export interface LootOpts {
  tile: { x: number; z: number; level: number };
  /** Epoch ms the pile despawns. Past it, there is nothing to go back for. */
  deadline: number;
  now(): number;
}

export interface LootResult {
  picked: number;
  reason?: 'window_closed' | 'unreachable' | 'needs_route' | 'inventory_full' | 'aborted';
}

export async function recoverLoot(c: ScriptContext, o: LootOpts): Promise<LootResult> {
  const left = (): number => o.deadline - o.now();
  if (left() <= 0) return { picked: 0, reason: 'window_closed' };

  // Refuse before walking rather than after: a death on another plane needs a route, and
  // travel would tell us the same thing 60 tiles later (spec decision 11).
  if (c.state().player?.level !== o.tile.level) return { picked: 0, reason: 'needs_route' };

  c.status(`Going back for the loot at ${o.tile.x}, ${o.tile.z}`);
  const trip = await c.travel.to(
    { x: o.tile.x, z: o.tile.z, level: o.tile.level },
    { tolerance: TILE_TOLERANCE, timeoutMs: left() }
  );
  if (!trip.success) {
    // `timeout` folds into `unreachable`: from here they are the same fact, that the walk did
    // not get there inside the window, and the pile is gone either way.
    const reason = trip.reason === 'needs_route' ? 'needs_route' : trip.reason === 'aborted' ? 'aborted' : 'unreachable';
    return { picked: 0, reason };
  }

  let picked = 0;
  // One scan, then pick up what it found. Re-scanning per item would spend the window on
  // scans; `pickupItem` already confirms each item left the ground before returning.
  const items = await c.sdk.scanGroundItems(LOOT_SCAN_RADIUS).catch(() => []);
  for (const item of items) {
    if (c.signal.aborted) return { picked, reason: 'aborted' };
    if (left() <= 0) return { picked, reason: 'window_closed' };
    // Checked per item rather than once: every successful pickup fills a slot, and the pile a
    // death leaves is usually bigger than the space a respawned character has for it.
    if ((c.state().inventory?.length ?? 0) >= INVENTORY_SLOTS) return { picked, reason: 'inventory_full' };
    const result = await c.bot.pickupItem(item);
    if (result.success) picked++;
    else c.log(`could not pick up ${item.name}: ${result.message}`, 'warn');
  }
  return { picked };
}
