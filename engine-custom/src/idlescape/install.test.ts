import { test, after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// install.js first and out of group order on purpose, exactly as the replaced src/app.ts
// imports it: it is the module that opens the engine's circular module graph at World.js, and
// reaching World.js by any other route runs this overlay's install body while World's default
// export is still in its temporal dead zone. Importing it also spawns the engine's three
// worker threads, which is why this suite is run with --test-force-exit.
import { afterCycle, flushBanks, installIdlescape, notifyBankChanged, ownerBanks } from './install.js';

import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';
import VarPlayerType from '#/cache/config/VarPlayerType.js';
import World from '#/engine/World.js';
import Player from '#/engine/entity/Player.js';
import Packet from '#/io/Packet.js';
import { toBase37 } from '#/util/JString.js';

import { idlescapeConfig } from './config.js';
import { setOwnerKey } from './owner.js';
import { readTabVarps, writeTabVarps, TAB_VARP_NAMES } from './tabVarps.js';

const scratchDirs: string[] = [];

function makePlayer(name: string): Player {
    const name37 = toBase37(name);
    return new Player(name, name37, name37);
}

/**
 * What an in-game tab drag does: RuneScript sets the varps directly. Not writeTabVarps, which is
 * the overlay's own write and is remembered as such - a character only counts as having moved
 * its tabs relative to the layout the overlay last wrote to it.
 */
function dragTabsInGame(player: Player, sizes: number[]): void {
    for (let i = 0; i < TAB_VARP_NAMES.length; i++) {
        player.setVar(VarPlayerType.getId(TAB_VARP_NAMES[i]), sizes[i] ?? 0);
    }
}

before(() => {
    InvType.load('data/pack');
    ObjType.load('data/pack');
    VarPlayerType.load('data/pack');
    installIdlescape();
});

beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idlescape-install-'));
    scratchDirs.push(dir);
    process.env.IDLESCAPE_BANK_DIR = dir; // read by install.ts on first ownerBanks() call
});

after(() => {
    // The exit hook installIdlescape registers would otherwise re-create these directories on
    // the way out and write whatever is still dirty into them.
    process.removeListener('exit', flushBanks);
    for (const dir of scratchDirs) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('an owner-stamped player resolves inv 95 to the shared container', () => {
    const alice = makePlayer('alice');
    const bob = makePlayer('bob');
    setOwnerKey(alice, 'uidShared');
    setOwnerKey(bob, 'uidShared');

    const aliceBank = alice.getInventory(95);
    assert.ok(aliceBank);
    assert.equal(aliceBank, bob.getInventory(95), 'two characters of one owner share one Inventory');
    assert.equal(aliceBank, ownerBanks().get('uidShared'));
});

test('a player with no owner key keeps the upstream per-player bank', () => {
    const solo = makePlayer('solo');
    const bank = solo.getInventory(95);
    assert.ok(bank);
    assert.notEqual(bank, ownerBanks().get('uidShared'));
    assert.equal(solo.invs.get(95), bank, 'unstamped players still populate player.invs');
});

test('every other inventory is untouched by the patch', () => {
    const alice = makePlayer('alice2');
    setOwnerKey(alice, 'uidOther');
    const inv = alice.getInventory(93);
    assert.ok(inv);
    assert.equal(alice.invs.get(93), inv);
    assert.equal(alice.getInventory(-1), null);
});

test('the owner bank never lands in player.invs, so Player.save() cannot write it', () => {
    const alice = makePlayer('alice3');
    setOwnerKey(alice, 'uidSave');
    alice.getInventory(95)!.add(995, 1000);
    alice.getInventory(93)!.add(995, 7);
    assert.equal(alice.invs.has(95), false);

    // Decode the sav's inventory section and assert type 95 is absent.
    const sav = new Packet(alice.save());
    const types = decodeSavInvTypes(sav);
    assert.deepEqual(types.includes(95), false);
    assert.deepEqual(types.includes(93), true);
});

test('tab varps round-trip through the player and trim trailing zeroes', () => {
    const alice = makePlayer('alice4');
    writeTabVarps(alice, [3, 2]);
    assert.deepEqual(readTabVarps(alice), [3, 2]);
    writeTabVarps(alice, []);
    assert.deepEqual(readTabVarps(alice), []);
});

test('afterCycle resets an owner container and bumps its version once', () => {
    assert.equal([...World.playerLoop.all()].length, 0, 'no player is online in this suite');

    const banks = ownerBanks();
    const inv = banks.get('uidCycle');
    const before = banks.version('uidCycle');

    inv.add(995, 5);
    assert.equal(inv.update, true, 'the mutation marked the container');

    afterCycle();

    // Upstream's processCleanup only resets player.invs, and the owner container is
    // deliberately outside those maps, so the post-cycle hook is the only thing that resets it.
    assert.equal(inv.update, false);
    assert.equal(banks.version('uidCycle'), before + 1);

    // A second sweep with nothing to do neither bumps nor re-notifies.
    afterCycle();
    assert.equal(banks.version('uidCycle'), before + 1);
});

test('notifyBankChanged is a no-op when no change hook is configured', () => {
    assert.equal(idlescapeConfig.hookUrl, null, 'the test world configures no hook url');

    let calls = 0;
    const original = globalThis.fetch;
    const spy: typeof fetch = () => {
        calls += 1;
        return Promise.resolve(new Response(null, { status: 204 }));
    };
    globalThis.fetch = spy;
    try {
        notifyBankChanged('uidNoHook', 3);
    } finally {
        globalThis.fetch = original;
    }

    assert.equal(calls, 0);
});

test('the change hook is signed with the management secret, never the owner secret', () => {
    // The front server's /internal/bank-changed verifies x-idlescape-mgmt against
    // ENGINE_MANAGEMENT_SECRET (server/src/bank/routes.ts), and server/src/env.ts holds that
    // variable to at least 32 characters, so the owner-assertion secret can never coincide
    // with it by accident: a hook signed with ownerSecret 401s on every post, forever.
    const seen: (string | null)[] = [];
    const original = globalThis.fetch;
    const hookUrl = idlescapeConfig.hookUrl;
    const ownerSecret = idlescapeConfig.ownerSecret;
    const managementSecret = idlescapeConfig.managementSecret;

    const spy: typeof fetch = (_input, init) => {
        seen.push(new Headers(init?.headers).get('x-idlescape-mgmt'));
        return Promise.resolve(new Response(null, { status: 204 }));
    };

    idlescapeConfig.hookUrl = 'http://127.0.0.1:1/internal/bank-changed';
    idlescapeConfig.ownerSecret = 'owner-assertion-secret-not-this-one';
    idlescapeConfig.managementSecret = 'management-secret-at-least-32-chars';
    globalThis.fetch = spy;
    try {
        notifyBankChanged('uidHook', 7);
    } finally {
        globalThis.fetch = original;
        idlescapeConfig.hookUrl = hookUrl;
        idlescapeConfig.ownerSecret = ownerSecret;
        idlescapeConfig.managementSecret = managementSecret;
    }

    assert.deepEqual(seen, ['management-secret-at-least-32-chars']);
});

test('the change hook is silent when either half of its configuration is missing', () => {
    const original = globalThis.fetch;
    const hookUrl = idlescapeConfig.hookUrl;
    const managementSecret = idlescapeConfig.managementSecret;

    let calls = 0;
    const spy: typeof fetch = () => {
        calls += 1;
        return Promise.resolve(new Response(null, { status: 204 }));
    };
    globalThis.fetch = spy;
    try {
        // A url with no secret would post an unsigned request the front server answers 401 to.
        idlescapeConfig.hookUrl = 'http://127.0.0.1:1/internal/bank-changed';
        idlescapeConfig.managementSecret = '';
        notifyBankChanged('uidHalf', 1);

        // A secret with no url is the dev world.
        idlescapeConfig.hookUrl = null;
        idlescapeConfig.managementSecret = 'management-secret-at-least-32-chars';
        notifyBankChanged('uidHalf', 2);
    } finally {
        globalThis.fetch = original;
        idlescapeConfig.hookUrl = hookUrl;
        idlescapeConfig.managementSecret = managementSecret;
    }

    assert.equal(calls, 0);
});

test('a refused change hook is logged once per failure run, and a success re-arms it', async t => {
    const original = globalThis.fetch;
    const hookUrl = idlescapeConfig.hookUrl;
    const managementSecret = idlescapeConfig.managementSecret;
    const warn = t.mock.method(console, 'warn');

    // A 401/404/5xx RESOLVES the fetch promise, so a bare `.catch` never sees it. That is the
    // blindness that let Task 10's wrong-secret bug live: every post was refused, silently.
    let status = 401;
    globalThis.fetch = () => Promise.resolve(new Response(null, { status }));

    idlescapeConfig.hookUrl = 'http://127.0.0.1:1/internal/bank-changed';
    idlescapeConfig.managementSecret = 'management-secret-at-least-32-chars';
    try {
        assert.doesNotThrow(() => notifyBankChanged('uidStatus', 1));
        await settle();
        assert.equal(warn.mock.callCount(), 1);
        const line = String(warn.mock.calls[0].arguments[0]);
        assert.match(line, /401/, 'the status is named');
        assert.match(line, /uidStatus/, 'and so is the owner key');
        assert.doesNotMatch(line, /management-secret/, 'the secret never reaches the log');

        notifyBankChanged('uidStatus', 2);
        await settle();
        assert.equal(warn.mock.callCount(), 1, 'a second refusal in a row is silent');

        status = 200;
        notifyBankChanged('uidStatus', 3);
        await settle();
        assert.equal(warn.mock.callCount(), 1, 'a success logs nothing');

        status = 401;
        notifyBankChanged('uidStatus', 4);
        await settle();
        assert.equal(warn.mock.callCount(), 2, 'the success re-armed the throttle');

        // leave the module-level throttle disarmed for whatever runs next
        status = 200;
        notifyBankChanged('uidStatus', 5);
        await settle();
    } finally {
        globalThis.fetch = original;
        idlescapeConfig.hookUrl = hookUrl;
        idlescapeConfig.managementSecret = managementSecret;
    }
});

test('for one tick after an external apply the store layout is pushed out, not read back in', () => {
    const banks = ownerBanks();
    const alice = makePlayer('applied');
    setOwnerKey(alice, 'uidApplied');

    // The character is online holding the pre-apply layout, and the store agrees.
    alice.getInventory(95)!.add(995, 5);
    alice.getInventory(95)!.add(1038, 1);
    writeTabVarps(alice, [2]);
    banks.setTabs('uidApplied', [2]);
    banks.bumpDirty();

    const before = banks.version('uidApplied');
    assert.deepEqual(banks.apply('uidApplied', null, [{ op: 'setTabs', sizes: [1] }]), { ok: true, version: before + 1 });
    assert.deepEqual(banks.tabs('uidApplied'), [1]);
    assert.deepEqual(readTabVarps(alice), [2], 'the online character still shows the old layout');

    withOnline(alice, afterCycle);

    assert.deepEqual(banks.tabs('uidApplied'), [1], 'the stale varps did not overwrite the applied layout');
    assert.deepEqual(readTabVarps(alice), [1], 'the applied layout was pushed out to the character');
    assert.equal(banks.version('uidApplied'), before + 1, 'and nothing was bumped behind the caller');
});

test('with no external apply, afterCycle still mirrors the character varps into the store', () => {
    const banks = ownerBanks();
    const bob = makePlayer('mirror');
    setOwnerKey(bob, 'uidMirror');
    bob.getInventory(95)!.add(995, 5);
    banks.bumpDirty();

    dragTabsInGame(bob, [1]);
    assert.deepEqual(banks.tabs('uidMirror'), [], 'the store has no layout yet');

    const before = banks.version('uidMirror');
    withOnline(bob, afterCycle);

    assert.deepEqual(banks.tabs('uidMirror'), [1], 'the in-game layout is adopted');
    assert.equal(banks.version('uidMirror'), before + 1, 'and it bumps');
});

test('an in-game tab change in a later tick still bumps and pushes normally', () => {
    const banks = ownerBanks();
    const carol = makePlayer('later');
    setOwnerKey(carol, 'uidLater');
    carol.getInventory(95)!.add(995, 5);
    carol.getInventory(95)!.add(1038, 1);
    banks.bumpDirty();

    assert.deepEqual(banks.apply('uidLater', null, [{ op: 'setTabs', sizes: [1] }]), { ok: true, version: banks.version('uidLater') });
    withOnline(carol, afterCycle); // the one flagged tick: pushed out, not bumped
    const settled = banks.version('uidLater');
    assert.deepEqual(readTabVarps(carol), [1]);

    // The next tick is ordinary again: the player rearranges in game and it travels inwards.
    dragTabsInGame(carol, [2]);
    withOnline(carol, afterCycle);

    assert.deepEqual(banks.tabs('uidLater'), [2]);
    assert.equal(banks.version('uidLater'), settled + 1);
    assert.deepEqual(readTabVarps(carol), [2]);
});

/** Lets the fire-and-forget hook's promise chain run before the assertions. */
function settle(): Promise<void> {
    return new Promise(resolve => setImmediate(resolve));
}

/** Puts one character in World.playerLoop for the duration of the call, then unlinks it. */
function withOnline(player: Player, fn: () => void): void {
    World.playerLoop.add(2130706433n, player);
    try {
        fn();
    } finally {
        player.unlink();
    }
}

// Mirrors Player.save()'s layout (Player.ts:190-262) closely enough to find the inv section.
function decodeSavInvTypes(sav: Packet): number[] {
    sav.pos = 0;
    sav.g2();
    sav.g2(); // magic, version
    sav.g2();
    sav.g2();
    sav.g1(); // x, z, level
    for (let i = 0; i < 7; i++) sav.g1(); // body
    for (let i = 0; i < 5; i++) sav.g1(); // colors
    sav.g1();
    sav.g2();
    sav.g4(); // gender, runenergy, playtime
    for (let i = 0; i < 21; i++) {
        sav.g4();
        sav.g1();
    }
    const varps = sav.g2();
    for (let i = 0; i < varps; i++) {
        sav.g2();
        sav.gVarInt();
    }
    const invCount = sav.g1();
    const types: number[] = [];
    for (let i = 0; i < invCount; i++) {
        const type = sav.g2();
        const size = sav.g2();
        types.push(type);
        for (let slot = 0; slot < size; slot++) {
            const id = sav.g2() - 1;
            if (id === -1) continue;
            const count = sav.g1();
            if (count === 255) sav.g4();
        }
    }
    return types;
}
