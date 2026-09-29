// THIS MODULE MUST ROOT THE ENGINE'S MODULE GRAPH. It is the first import of the replaced
// src/app.ts (and of install.test.ts) for that reason: only the graph's root is guaranteed to
// run its body after every one of its imports has finished evaluating, and this body reads
// both `Player` and `World` as values.
//
// The engine's graph is circular (World -> PlayerLoading -> NetworkPlayer -> Player -> World),
// so a module reached part-way round the cycle sees bindings that are still in their temporal
// dead zone. Let something else root the graph and this body runs mid-cycle: entering at
// #/engine/World.js throws `ReferenceError: Cannot access 'Player' before initialization` at
// the Player.prototype patch below (probe, with the overlay applied:
// `npx tsx -e "import '#/engine/World.js'"`).
//
// World.js also leads Player.js here, out of the alphabetical order the rest of the overlay
// follows, and that order is load-bearing too: making Player.js the module that opens the
// cycle evaluates NetworkPlayer's `extends Player` while Player's own binding is still dead,
// which throws the same ReferenceError from inside NetworkPlayer. That one is upstream's and
// predates the overlay (`npx tsx -e "import '#/engine/entity/Player.js'"` fails in a pristine
// clone too).
import World from '#/engine/World.js';
import Player from '#/engine/entity/Player.js';
import type { Inventory } from '#/engine/Inventory.js';
import { idlescapeConfig } from '#/idlescape/config.js';
import { printInfo } from '#/util/Logger.js';

import { getOwnerKey } from './owner.js';
import { bankInvId, OwnerBankStore } from './ownerBank.js';
import { changedTabVarps, writeTabVarps } from './tabVarps.js';

let installed = false;
let store: OwnerBankStore | null = null;
let bankInv = -1;

/**
 * Upstream's `Player.getInventory`, saved by Patch 1 below. Kept at module scope so the overlay
 * itself can reach the UNPATCHED path (see `ownInventory`); everything else goes through the
 * patched method.
 */
let originalGetInventory: ((this: Player, inv: number) => Inventory | null) | null = null;

/**
 * One log line per transition INTO failure, cleared by the next success. The store's `warnOnce`
 * does the same job for migrations; this is its "until it recovers" cousin, because both
 * callers below run once per tick and would otherwise write a line every 600 ms, forever.
 */
function failureLog(): (failed: boolean, log?: () => void) => void {
    let failing = false;
    return (failed: boolean, log?: () => void): void => {
        if (!failed) {
            failing = false;
            return;
        }
        if (failing) {
            return;
        }
        failing = true;
        log?.();
    };
}

/**
 * Separate throttles: a change hook that is down must not silence a sweep that is broken, and
 * the per-owner push-out below must not be silenced BY the cycle wrapper's own success path
 * either. `World.cycle`'s wrapper calls `logCycleFailure(false)` every tick `afterCycle` returns
 * without throwing, which it always does: the push-out's own per-owner try/catch (below) catches
 * before the exception ever reaches the wrapper. Sharing one throttle between the two would have
 * the wrapper's unconditional reset clear the push-out's flag one tick later regardless of
 * whether that tick's push-out itself succeeded, printing one line per tick for a persistently
 * failing owner instead of one line per transition into failure.
 */
const logHookFailure = failureLog();
const logCycleFailure = failureLog();
const logPushOutFailure = failureLog();

/** The one owner bank store; created lazily so the packed cache is loaded before it reads sizes. */
export function ownerBanks(): OwnerBankStore {
    if (!store) {
        store = new OwnerBankStore(process.env.IDLESCAPE_BANK_DIR ?? idlescapeConfig.bankDir);
    }
    return store;
}

/**
 * The character's OWN container for `inv`, resolved through the UNPATCHED `Player.getInventory`.
 *
 * Patch 1 diverts inv 95 to the shared owner container for a stamped player, so the patched
 * method can never answer with the character's own bank; this is the way back to it. The one
 * caller is `PlayerLoading.load`, putting a REFUSED `.sav` bank migration back where `save()`
 * will re-emit it (`this.invs`), which is what keeps the next autosave from dropping the items
 * the store would not take. Falls back to the current method when the overlay has not installed
 * yet, which is then the upstream one anyway.
 */
export function ownInventory(player: Player, inv: number): Inventory | null {
    return (originalGetInventory ?? Player.prototype.getInventory).call(player, inv);
}

/**
 * Inv 95 in this pack, memoised. `bankInvId()` answers -1 until InvType is loaded, so a -1 is
 * never cached: it is re-asked until the cache can answer.
 */
function cachedBankInv(): number {
    if (bankInv === -1) {
        bankInv = bankInvId();
    }
    return bankInv;
}

/**
 * Posts the change hook the front server listens on. Never fatal: it is fire and forget on
 * purpose, because awaiting it here would put an HTTP round trip inside the world tick.
 *
 * BOTH failure modes are logged, throttled to one line per transition into failure. A refused
 * post (401, 404, 5xx) RESOLVES the fetch promise, so a bare `.catch` cannot see it, and that
 * blindness is exactly why Task 10's wrong-secret bug survived: every post was refused and
 * nothing said so. The status is inspected, not just the transport.
 *
 * The header is the MANAGEMENT secret, not the owner-assertion one: the front server's
 * /internal/bank-changed verifies `x-idlescape-mgmt` against ENGINE_MANAGEMENT_SECRET
 * (server/src/bank/routes.ts), which server/src/env.ts holds to at least 32 characters, so the
 * two values can never coincide by accident. A hook signed with the wrong one is a silent 401
 * on every post.
 *
 * Neither the body nor the secret is ever logged. There are two log sites - the `.then` arm,
 * which names the owner key and an HTTP status, and the `.catch`, which names the owner key and
 * a transport error - and the body (an owner key and a version) and the header (the shared
 * secret) are handed to neither, so no item data and no credential can reach the log.
 */
export function notifyBankChanged(ownerKey: string, version: number): void {
    const url = idlescapeConfig.hookUrl;
    if (!url || !idlescapeConfig.managementSecret) {
        // No url is the dev world; no secret would post an unsigned request the front server
        // can only answer 401 to. Either way the hook is silent rather than noisy.
        return;
    }
    void fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-idlescape-mgmt': idlescapeConfig.managementSecret },
        body: JSON.stringify({ ownerKey, version }),
        signal: AbortSignal.timeout(2000)
    })
        .then(res => logHookFailure(!res.ok, () => console.warn(`[idlescape] bank change hook refused for ${ownerKey}: HTTP ${res.status} (further failures stay silent until one succeeds)`)))
        .catch(err => logHookFailure(true, () => console.warn(`[idlescape] bank change hook failed for ${ownerKey}:`, err)));
}

/**
 * Writes every dirty owner bank to disk, never throwing. Used on the two paths that leave the
 * process: the `exit` handler installIdlescape registers, and a tick the world is shutting down
 * on. `OwnerBankStore.flush()` is synchronous `fs` throughout, which is what makes it legal in
 * an exit handler; an unwritable file is logged rather than turned into a crash on the way out.
 */
export function flushBanks(): void {
    try {
        ownerBanks().flush();
    } catch (err) {
        console.error('[idlescape] flushing the owner banks on the way out failed:', err);
    }
}

/**
 * Runs BEFORE every World.cycle. The bank is account-level state that is NOT in any `.sav`, and
 * the shutdown path never reaches afterCycle: `World.processShutdown()` runs inside `cycle()`
 * and calls `process.exit(0)` as soon as the last player is out, having saved every `.sav` on
 * the way. Flushing here makes the owner store durable at the same moment the saves are, so a
 * withdrawal followed by a `::reboot` cannot leave the items in both places (nor a deposit in
 * neither). The `exit` handler below is the belt to this pair of braces.
 */
export function beforeCycle(): void {
    if (World.shutdown) {
        flushBanks();
    }
}

/**
 * Runs after every World.cycle, i.e. after processClientsOut has written each player's
 * inv_transmit diff and after processCleanup has reset the per-player containers. The owner
 * bank is deliberately not in player.invs, so this is the only place its dirty tracking is
 * reset -- and because it happens after client output, every online character of the owner
 * received the same diff first.
 */
export function afterCycle(): void {
    const banks = ownerBanks();

    // Owners whose last change came from an external apply and has not been swept yet. For that
    // one tick the STORE's layout is authoritative and travels OUTWARDS: the online characters'
    // varps still show the pre-apply tabs, so mirroring them in would overwrite the layout the
    // web client was just handed, and bumpDirty's flag branch would then swallow the
    // tabsChanged it set - no bump, no hook, no push-back, and the store silently adopting a
    // stale layout at the version the caller already holds. Read without clearing; bumpDirty is
    // still the only consumer of the flag.
    const applied = banks.externallyApplied();

    // ONE pass over the online players. It mirrors the in-game tab varps into the store before
    // the sweep, so a tab change made by RuneScript is picked up by the same version bump as
    // the item movement that caused it, and it builds the owner -> characters index that both
    // the sweep and the eviction below reuse rather than walking the player list again per
    // dirty owner.
    const online = new Map<string, Player[]>();
    for (const player of World.playerLoop.all()) {
        const ownerKey = getOwnerKey(player);
        if (ownerKey === null) {
            continue;
        }
        const characters = online.get(ownerKey);
        if (characters) {
            characters.push(player);
        } else {
            online.set(ownerKey, [player]);
        }
        if (applied.has(ownerKey)) {
            writeTabVarps(player, banks.tabs(ownerKey));
            continue;
        }
        // Only a character that has MOVED its own tabs since the overlay last wrote to it may
        // mirror in. Two characters of one account can be online together, and mirroring every
        // one of them unconditionally is last-writer-wins: the character the loop reaches last
        // decides the layout, so an untouched one reverts the change the other just made.
        const moved = changedTabVarps(player);
        if (moved) {
            banks.setTabs(ownerKey, moved);
        }
    }

    for (const ownerKey of banks.bumpDirty()) {
        // Per owner, because bumpDirty has ALREADY consumed the dirt and bumped the versions:
        // there is nothing left to retry from, so a throw escaping here would cost every owner
        // after this one its change hook, permanently, and leave the front server's version map
        // stale with nothing to correct it.
        try {
            notifyBankChanged(ownerKey, banks.version(ownerKey));
            // Push the (possibly store-side) tab layout back out to every online character.
            const tabs = banks.tabs(ownerKey);
            for (const player of online.get(ownerKey) ?? []) {
                writeTabVarps(player, tabs);
            }
            logPushOutFailure(false);
        } catch (err) {
            logPushOutFailure(true, () => console.error(`[idlescape] post-cycle push-out failed for ${ownerKey} (further failures stay silent until one succeeds):`, err));
        }
    }

    if (World.currentTick % 100 === 0) {
        banks.flush();
    }

    if (World.currentTick % 1500 === 0) {
        banks.evict(key => online.has(key));
    }
}

/**
 * Installs every runtime patch the idlescape overlay needs. Called at module load from the
 * replaced src/app.ts, BEFORE World.start(), so the patched Player.getInventory and the
 * wrapped World.cycle are in place before the first tick is scheduled.
 */
export function installIdlescape(): void {
    if (installed) {
        return;
    }
    installed = true;

    // --- Patch 1: route inventory 95 to the owner store -----------------------
    // Upstream Player.getInventory (Player.ts:1467-1490) branches on InvType scope; this adds
    // one branch in front of it. Returning the store's container WITHOUT putting it in
    // this.invs is what keeps Player.save() (which iterates this.invs) from writing the bank
    // back into the .sav.
    originalGetInventory = Player.prototype.getInventory;
    const upstreamGetInventory = originalGetInventory;
    Player.prototype.getInventory = function (this: Player, inv: number): Inventory | null {
        const ownerKey = getOwnerKey(this);
        if (ownerKey !== null && inv !== -1 && inv === cachedBankInv()) {
            return ownerBanks().get(ownerKey);
        }
        return upstreamGetInventory.call(this, inv);
    };

    // --- Patch 2: wrap the world tick ----------------------------------------
    // cycle() reschedules itself with setTimeout(this.cycle.bind(this), ...), so an own
    // property on the singleton takes effect from the next tick. Installed before
    // World.start() by the replaced src/app.ts. afterCycle is guarded: a throw here would land
    // in cycle()'s own catch, which answers an unhandled tick error by removing every player.
    const originalCycle = World.cycle.bind(World);
    World.cycle = (): void => {
        beforeCycle();
        originalCycle();
        try {
            afterCycle();
            logCycleFailure(false);
        } catch (err) {
            logCycleFailure(true, () => console.error('[idlescape] afterCycle failed (further failures stay silent until one succeeds):', err));
        }
    };

    // --- Patch 3: the owner banks are flushed on every way out ---------------
    // Both exits are inside cycle(): process.exit(0) from processShutdown once the last player
    // is out, and process.exit(1) from cycle()'s own catch. Neither reaches afterCycle, so
    // neither reaches the 100-tick flush, while every player's .sav IS written on the first of
    // them. An exit handler covers both codes and is legal because flush() is synchronous fs.
    process.on('exit', flushBanks);

    printInfo(`[idlescape] overlay active (requireOwner=${idlescapeConfig.requireOwner}, banks=${idlescapeConfig.bankDir})`);
}

installIdlescape();
