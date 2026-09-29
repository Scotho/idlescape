// The post-cycle sweep's two edge cases and the shutdown flush, split out of install.test.ts to
// keep both files under the project's 400-line limit. The module under test is the same one.
//
// install.js FIRST and out of group order, exactly as the replaced src/app.ts imports it: it is
// the module that opens the engine's circular module graph at World.js, and reaching World.js by
// any other route runs the overlay's install body while World's default export is still in its
// temporal dead zone. See the header of src/idlescape/install.ts.
import { afterCycle, beforeCycle, flushBanks, installIdlescape, ownerBanks } from './install.js';

import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';
import VarPlayerType from '#/cache/config/VarPlayerType.js';
import World from '#/engine/World.js';
import Player from '#/engine/entity/Player.js';
import { toBase37 } from '#/util/JString.js';

import { idlescapeConfig } from './config.js';
import { setOwnerKey } from './owner.js';
import { readTabVarps, writeTabVarps, TAB_VARP_NAMES } from './tabVarps.js';

let scratch = '';

before(() => {
    // One directory for the whole file: the store is a module singleton created on the first
    // ownerBanks() call, so a per-test directory would only ever be read once. Every test below
    // uses its own owner key instead.
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'idlescape-sweep-'));
    process.env.IDLESCAPE_BANK_DIR = scratch;
    InvType.load('data/pack');
    ObjType.load('data/pack');
    VarPlayerType.load('data/pack');
    installIdlescape();
});

after(() => {
    // The exit hook installIdlescape registers would otherwise re-create this directory on the
    // way out and write whatever is still dirty into it.
    process.removeListener('exit', flushBanks);
    fs.rmSync(scratch, { recursive: true, force: true });
});

function bankFile(ownerKey: string): string {
    return path.join(scratch, `${ownerKey}.json`);
}

function makePlayer(name: string, ownerKey: string): Player {
    const name37 = toBase37(name);
    const player = new Player(name, name37, name37);
    setOwnerKey(player, ownerKey);
    return player;
}

/** Puts characters in World.playerLoop for the duration of the call, then unlinks them. */
function withOnline(players: Player[], fn: () => void): void {
    let uid = 2130706433n;
    for (const player of players) {
        World.playerLoop.add(uid++, player);
    }
    try {
        fn();
    } finally {
        for (const player of players) {
            player.unlink();
        }
    }
}

/**
 * What an in-game tab drag does: RuneScript sets the varps directly. NOT writeTabVarps, which is
 * the overlay's own write and is remembered as such - a character is only "changed" relative to
 * the layout the overlay last wrote to it.
 */
function dragTabsInGame(player: Player, sizes: number[]): void {
    for (let i = 0; i < TAB_VARP_NAMES.length; i++) {
        player.setVar(VarPlayerType.getId(TAB_VARP_NAMES[i]), sizes[i] ?? 0);
    }
}

/** Runs `fn` with a change hook configured, collecting the owner keys it posts for. */
function capturingHook(fn: () => void): string[] {
    const posted: string[] = [];
    const originalFetch = globalThis.fetch;
    const hookUrl = idlescapeConfig.hookUrl;
    const managementSecret = idlescapeConfig.managementSecret;

    globalThis.fetch = (_input, init) => {
        posted.push(String(JSON.parse(String(init?.body)).ownerKey));
        return Promise.resolve(new Response(null, { status: 204 }));
    };
    idlescapeConfig.hookUrl = 'http://127.0.0.1:1/internal/bank-changed';
    idlescapeConfig.managementSecret = 'management-secret-at-least-32-chars';
    try {
        fn();
    } finally {
        globalThis.fetch = originalFetch;
        idlescapeConfig.hookUrl = hookUrl;
        idlescapeConfig.managementSecret = managementSecret;
    }
    return posted;
}

// --- C1: the shutdown paths ---------------------------------------------------

test('the exit hook is registered, and running it writes every dirty owner', () => {
    const banks = ownerBanks();
    banks.get('uidExit').add(995, 5);
    assert.deepEqual(banks.bumpDirty(), ['uidExit']);
    assert.equal(fs.existsSync(bankFile('uidExit')), false, 'a tick sweep alone never touches the disk');

    // World.processShutdown() calls process.exit(0) from INSIDE cycle(), so afterCycle (and its
    // 100-tick flush) never runs on a graceful shutdown; the same is true of the process.exit(1)
    // in cycle()'s own catch. An exit handler covers both, and is legal here because flush() is
    // synchronous fs. Invoked directly rather than by exiting the test process.
    assert.equal(
        process.listeners('exit').includes(flushBanks),
        true,
        'installIdlescape registered the exit hook'
    );
    flushBanks();

    assert.deepEqual(JSON.parse(fs.readFileSync(bankFile('uidExit'), 'utf8')).slots, [{ slot: 0, obj: 995, count: 5 }]);
});

test('a shutdown tick flushes before the cycle that will call process.exit', () => {
    const banks = ownerBanks();
    banks.get('uidShutdown').add(1038, 1);
    banks.bumpDirty();

    beforeCycle();
    assert.equal(fs.existsSync(bankFile('uidShutdown')), false, 'an ordinary tick flushes nothing here');

    // World.shutdown is a getter over shutdownTick; the world is in shutdown from the tick
    // ::reboot names onwards, and every one of those ticks may be the one that exits.
    const priorShutdownTick = World.shutdownTick;
    World.shutdownTick = World.currentTick;
    try {
        assert.equal(World.shutdown, true);
        beforeCycle();
    } finally {
        World.shutdownTick = priorShutdownTick;
    }

    assert.deepEqual(JSON.parse(fs.readFileSync(bankFile('uidShutdown'), 'utf8')).slots, [{ slot: 0, obj: 1038, count: 1 }]);
});

test('a flush that throws never takes the exiting process down with it', t => {
    const banks = ownerBanks();
    banks.get('uidExitThrow').add(995, 3);
    banks.bumpDirty();

    t.mock.method(fs, 'writeFileSync', () => {
        throw new Error('ENOSPC: no space left on device');
    });
    const error = t.mock.method(console, 'error', () => {});

    assert.doesNotThrow(() => flushBanks());
    assert.equal(error.mock.callCount(), 1, 'the failure is logged, not thrown');
});

// --- I2: one owner's push-out failure must not drop the hook for the rest ------

test('an owner whose tab push-out throws does not cost every later owner its change hook', t => {
    const banks = ownerBanks();
    const first = makePlayer('pushfail', 'uidPushA');
    const second = makePlayer('pushok', 'uidPushB');

    // Two owners dirty in the same tick, uidPushA first in the store's map.
    first.getInventory(95)!.add(995, 5);
    second.getInventory(95)!.add(995, 7);

    const error = t.mock.method(console, 'error', () => {});
    t.mock.method(first, 'setVar', () => {
        throw new Error('setVar exploded');
    });

    // bumpDirty has already consumed the dirt and bumped both versions by the time the push-out
    // runs, so an owner skipped here never gets a retry: without the per-owner guard the throw
    // aborts the loop and uidPushB's hook is lost for good.
    const posted = capturingHook(() => withOnline([first, second], afterCycle));

    assert.deepEqual(posted.sort(), ['uidPushA', 'uidPushB']);
    assert.equal(error.mock.callCount(), 1, 'and the failure is logged, once per outage');
    assert.equal(banks.version('uidPushB'), 1);
});

// --- R1: the push-out throttle is its own, not shared with the cycle wrapper --

test('a persistently failing push-out logs once per tick, and re-arms only on a real success', t => {
    const player = makePlayer('pushloop', 'uidPushLoop');
    const error = t.mock.method(console, 'error', () => {});
    const setVar = t.mock.method(player, 'setVar', () => {
        throw new Error('setVar exploded');
    });

    withOnline([player], () => {
        // Each afterCycle needs fresh dirt: bumpDirty already consumed the previous tick's, so
        // calling afterCycle twice with nothing new dirtied would not re-run the push-out at
        // all. Two calls, each preceded by a change, is what makes this "two ticks", not one.
        player.getInventory(95)!.add(995, 1);
        afterCycle();
        player.getInventory(95)!.add(995, 1);
        afterCycle();
    });
    assert.equal(error.mock.callCount(), 1, 'a second consecutive tick for the same failing owner stays silent');

    // The next push-out for this owner succeeds; the throttle must re-arm from that alone, not
    // merely because afterCycle itself returned without throwing (it always does - the push-out
    // catches its own error before the wrapper around afterCycle ever sees one).
    setVar.mock.mockImplementation(() => {});
    withOnline([player], () => {
        player.getInventory(95)!.add(995, 1);
        afterCycle();
    });
    assert.equal(error.mock.callCount(), 1, 'a success re-arms the throttle without itself logging anything');

    setVar.mock.mockImplementation(() => {
        throw new Error('setVar exploded again');
    });
    withOnline([player], () => {
        player.getInventory(95)!.add(995, 1);
        afterCycle();
    });
    assert.equal(error.mock.callCount(), 2, 'and the next failure after a success logs again');
});

// --- I3: the tab mirror is not last-writer-wins across two characters ---------

test('an untouched character cannot revert a tab change made by another of the same owner', () => {
    const banks = ownerBanks();
    const alice = makePlayer('twinA', 'uidTwins');
    const bob = makePlayer('twinB', 'uidTwins');

    // Both logged in seeded from the store, exactly as PlayerLoading does.
    banks.setTabs('uidTwins', [2]);
    writeTabVarps(alice, banks.tabs('uidTwins'));
    writeTabVarps(bob, banks.tabs('uidTwins'));
    alice.getInventory(95)!.add(995, 5);
    alice.getInventory(95)!.add(1038, 1);
    banks.bumpDirty();

    // Alice rearranges in game; Bob does nothing at all. Alice is reached FIRST by the pass, so
    // a last-writer-wins mirror would take her [1] and then let Bob's untouched [2] overwrite it.
    dragTabsInGame(alice, [1]);
    withOnline([alice, bob], afterCycle);

    assert.deepEqual(banks.tabs('uidTwins'), [1], 'the character that changed is the one that counts');
    assert.deepEqual(readTabVarps(bob), [1], 'and the other is brought into line by the push-out');
    assert.deepEqual(readTabVarps(alice), [1]);

    // The next tick is quiet: neither character now differs from what was last written to it.
    const settled = banks.version('uidTwins');
    withOnline([alice, bob], afterCycle);
    assert.deepEqual(banks.tabs('uidTwins'), [1]);
    assert.equal(banks.version('uidTwins'), settled, 'and nothing is bumped for a layout nobody moved');
});

test('a character whose varps were never written still mirrors in on its first tick', () => {
    const banks = ownerBanks();
    const carol = makePlayer('firsttick', 'uidFirstTick');
    carol.getInventory(95)!.add(995, 5);
    dragTabsInGame(carol, [1]);

    // No writeTabVarps has ever reached this character, so there is nothing to compare against
    // and the in-game layout is adopted rather than ignored.
    withOnline([carol], afterCycle);
    assert.deepEqual(banks.tabs('uidFirstTick'), [1]);
});
