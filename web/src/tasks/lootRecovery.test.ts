// Every test here pins one way the loot walk gives up. None of them assert a failure, because
// `recoverLoot` has no failure to report: it hands back what it managed to pick up and why it
// stopped, and the caller is required to carry on regardless.
import { expect, test, vi } from 'vitest';
import { LOOT_SCAN_RADIUS, LOOT_WINDOW_MS, recoverLoot } from './lootRecovery';
import type { ScriptContext, TravelResult } from './types';
import type { GroundItem, InventoryItem, PlayerState } from '../vendor/rs-sdk/sdk/types';
import type { WorldState } from '../agent/types';

const DIED_AT = 1_000_000;
const TILE = { x: 3200, z: 3200, level: 0 };
const deadline = DIED_AT + LOOT_WINDOW_MS;

const ground = (name: string, id: number, x = TILE.x, z = TILE.z): GroundItem =>
  ({ id, name, count: 1, x, z, distance: 0, reachable: true });
const slot = (i: number): InventoryItem => ({ slot: i, id: 1511, name: 'Logs', count: 1, optionsWithIndex: [] });

interface FakeOpts {
  /** What the scan finds. The pile the fake actually holds is this, unless `phantom` says less. */
  pile?: GroundItem[];
  /** Items the scan reports that are no longer really there: another player took them first. */
  phantom?: GroundItem[];
  inventory?: InventoryItem[];
  level?: number;
  travel?: TravelResult;
  /** Epoch ms each pickup burns, so a test can close the window from inside the loop. */
  msPerPickup?: number;
  abortAfter?: number;
}

function fake(o: FakeOpts = {}) {
  const calls: string[] = [];
  const pile = o.pile ?? [ground('Bones', 526), ground('Iron ore', 440), ground('Coins', 995)];
  const present = new Set(pile.map(i => i.id));
  for (const gone of o.phantom ?? []) present.delete(gone.id);
  let clock = DIED_AT;
  let picks = 0;
  const controller = new AbortController();
  const inventory = [...(o.inventory ?? [])];
  // Standing at the Lumbridge respawn point, alive, which is where a real loot walk starts from.
  const player = ({ worldX: 3221, worldZ: 3218, level: o.level ?? 0, hp: 10, maxHp: 10, animId: -1, isDead: false, lifeId: 2 } as unknown as PlayerState);
  const state = { tick: 1, inGame: true, player, inventory } as unknown as WorldState;

  const travel = vi.fn(async (t: { x: number; z: number }): Promise<TravelResult> => {
    calls.push(`travel:${t.x},${t.z}`);
    return o.travel ?? { success: true, legs: 1, tiles: 12 };
  });
  const pickupItem = vi.fn(async (item: GroundItem) => {
    calls.push(`pickup:${item.name}`);
    picks += 1;
    clock += o.msPerPickup ?? 0;
    if (o.abortAfter !== undefined && picks >= o.abortAfter) controller.abort();
    // The honest refusal: the scan saw it, but by the time the walk arrived it was gone. A fake
    // that succeeded blindly would hide the branch that keeps the loop going after a miss.
    if (!present.has(item.id)) return { success: false, message: 'Item not found on ground', reason: 'item_not_found' as const };
    present.delete(item.id);
    inventory.push(slot(inventory.length));
    return { success: true, message: `Picked up ${item.name}` };
  });
  const ctx = {
    state: () => state,
    status: vi.fn(), log: vi.fn(),
    signal: controller.signal,
    travel: { to: travel, distanceTo: () => 0 },
    sdk: { scanGroundItems: vi.fn(async (radius?: number) => { calls.push(`scan:${radius}`); return pile; }) },
    bot: { pickupItem }
  } as unknown as ScriptContext;
  return { ctx, calls, travel, pickupItem, now: () => clock, inventory };
}

const opts = (f: { now(): number }) => ({ tile: TILE, deadline, now: f.now });

test('it walks to the death tile and picks up everything it finds', async () => {
  const f = fake();
  const result = await recoverLoot(f.ctx, opts(f));
  expect(result).toEqual({ picked: 3 });
  expect(f.travel).toHaveBeenCalledWith({ x: 3200, z: 3200, level: 0 }, expect.objectContaining({ tolerance: 1 }));
  expect(f.calls).toEqual(['travel:3200,3200', `scan:${LOOT_SCAN_RADIUS}`, 'pickup:Bones', 'pickup:Iron ore', 'pickup:Coins']);
});

test('the walk is given only what is left of the window, not a fresh timeout', async () => {
  const f = fake();
  // Thirty seconds of the two minutes are already gone on the respawn, so a walk allowed the
  // full window would still be walking when the pile despawned.
  await recoverLoot(f.ctx, { tile: TILE, deadline, now: () => DIED_AT + 30_000 });
  expect(f.travel).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ timeoutMs: LOOT_WINDOW_MS - 30_000 }));
});

test('a window that has already closed is not walked to at all', async () => {
  const f = fake();
  const result = await recoverLoot(f.ctx, { tile: TILE, deadline, now: () => deadline + 1 });
  expect(result).toEqual({ picked: 0, reason: 'window_closed' });
  // The point of the check: a walk started after the despawn spends two minutes of the run
  // arriving at an empty tile.
  expect(f.calls).toEqual([]);
});

test('the window closing mid-pickup stops the loop and reports what it got', async () => {
  const f = fake({ msPerPickup: LOOT_WINDOW_MS });
  const result = await recoverLoot(f.ctx, opts(f));
  expect(result).toEqual({ picked: 1, reason: 'window_closed' });
  expect(f.pickupItem).toHaveBeenCalledTimes(1);
});

test('a death on another plane refuses before walking', async () => {
  // The respawn is always ground level, so a death upstairs is a cross-level target and travel
  // would refuse it `needs_route` anyway - after a walk to the foot of the stairs.
  const f = fake({ level: 0 });
  const result = await recoverLoot(f.ctx, { tile: { ...TILE, level: 1 }, deadline, now: f.now });
  expect(result).toEqual({ picked: 0, reason: 'needs_route' });
  expect(f.calls).toEqual([]);
});

test('an unreachable death tile gives up without throwing', async () => {
  const f = fake({ travel: { success: false, reason: 'unreachable', stoppedAt: { x: 3210, z: 3210 }, legs: 2, tiles: 8 } });
  const result = await recoverLoot(f.ctx, opts(f));
  expect(result).toEqual({ picked: 0, reason: 'unreachable' });
  expect(f.pickupItem).not.toHaveBeenCalled();
});

test('a walk that runs out of time reads as unreachable rather than inventing a reason', async () => {
  const f = fake({ travel: { success: false, reason: 'timeout', legs: 3, tiles: 40 } });
  expect(await recoverLoot(f.ctx, opts(f))).toEqual({ picked: 0, reason: 'unreachable' });
});

test('a walk travel refuses with needs_route keeps that reason', async () => {
  const f = fake({ travel: { success: false, reason: 'needs_route', legs: 0, tiles: 0 } });
  expect(await recoverLoot(f.ctx, opts(f))).toEqual({ picked: 0, reason: 'needs_route' });
});

test('an abort during the walk is reported as an abort, not as an unreachable tile', async () => {
  const f = fake({ travel: { success: false, reason: 'aborted', legs: 1, tiles: 3 } });
  expect(await recoverLoot(f.ctx, opts(f))).toEqual({ picked: 0, reason: 'aborted' });
});

test('a full inventory stops the loop rather than looping on a refusal', async () => {
  const f = fake({ inventory: Array.from({ length: 28 }, (_, i) => slot(i)) });
  const result = await recoverLoot(f.ctx, opts(f));
  expect(result).toEqual({ picked: 0, reason: 'inventory_full' });
  // Every pickup would be refused by the server with "your inventory is full"; asking 28 times
  // spends the window learning the same thing.
  expect(f.pickupItem).not.toHaveBeenCalled();
});

test('the inventory filling up part way through stops the loop where it filled', async () => {
  const f = fake({ inventory: Array.from({ length: 26 }, (_, i) => slot(i)) });
  const result = await recoverLoot(f.ctx, opts(f));
  expect(result).toEqual({ picked: 2, reason: 'inventory_full' });
});

test('an abort between pickups stops immediately', async () => {
  const f = fake({ abortAfter: 1 });
  const result = await recoverLoot(f.ctx, opts(f));
  expect(result).toEqual({ picked: 1, reason: 'aborted' });
  expect(f.pickupItem).toHaveBeenCalledTimes(1);
});

test('an item that vanished is logged and does not stop the rest', async () => {
  const missing = ground('Iron ore', 440);
  const f = fake({ phantom: [missing] });
  const result = await recoverLoot(f.ctx, opts(f));
  // Two of the three, and the third reported rather than swallowed: another player winning a
  // race for one item is not a reason to abandon the rest of the pile.
  expect(result).toEqual({ picked: 2 });
  expect(f.pickupItem).toHaveBeenCalledTimes(3);
  expect(f.ctx.log).toHaveBeenCalledWith(expect.stringContaining('Iron ore'), 'warn');
});

test('a scan that fails leaves nothing to pick up and is not an error', async () => {
  const f = fake();
  vi.mocked(f.ctx.sdk.scanGroundItems).mockRejectedValue(new Error('no scan'));
  expect(await recoverLoot(f.ctx, opts(f))).toEqual({ picked: 0 });
});
