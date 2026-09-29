// The two-characters-in-one-tick case from spec section 11, at the level the engine actually
// decides it: two Players stamped with the same owner key, one container, one dirty sweep. Plus
// the login binding that puts the key there in the first place, exercised through the real
// PlayerLoading.load under a world configured with requireOwner.
//
// install.js FIRST and out of group order, exactly as the replaced src/app.ts imports it: it is
// the module that opens the engine's circular module graph at World.js, and reaching World.js
// by any other route runs the overlay's install body while World's default export is still in
// its temporal dead zone. See the header of src/idlescape/install.ts.
import { afterCycle, flushBanks, installIdlescape, ownerBanks } from './install.js';

import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';
import VarPlayerType from '#/cache/config/VarPlayerType.js';
import World from '#/engine/World.js';
import Player from '#/engine/entity/Player.js';
import { PlayerLoading } from '#/engine/entity/PlayerLoading.js';
import Packet from '#/io/Packet.js';
import NullClientSocket from '#/server/NullClientSocket.js';
import { toBase37 } from '#/util/JString.js';

import { idlescapeConfig } from './config.js';
import { getOwnerKey, setOwnerKey } from './owner.js';
import { OwnerAssertionError } from './ownerAssertion.js';
import type { BankSlotDto } from './types.js';

let scratch = '';

before(() => {
    // One directory for the whole file: the store is a module singleton created on the first
    // ownerBanks() call, so a per-test directory would only ever be read once anyway. Every
    // test below uses its own owner key instead.
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'idlescape-shared-'));
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

function stamped(name: string, ownerKey: string): Player {
    const n37 = toBase37(name);
    const player = new Player(name, n37, n37);
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

test('a deposit by one character is visible to the other immediately and dirties one container', () => {
    const alice = stamped('alice', 'uidPair');
    const bob = stamped('bob', 'uidPair');

    alice.getInventory(95)!.add(995, 1000);
    assert.equal(bob.getInventory(95)!.getItemCount(995), 1000);

    // Both characters' inv listeners resolve the same Inventory, so both see the same dirty
    // slots in the same tick -- the reset happens once, in afterCycle, AFTER client output.
    const inv = ownerBanks().get('uidPair');
    assert.equal(inv.update, true);
    assert.deepEqual(inv.getDirtySlots(), [0]);

    assert.deepEqual(ownerBanks().bumpDirty(), ['uidPair']);
    assert.equal(inv.update, false, 'the overlay owns the reset; upstream processCleanup never sees this container');
    assert.equal(ownerBanks().version('uidPair'), 1);
});

test('interleaved writes from two characters both land, and produce one version bump per sweep', () => {
    const alice = stamped('alice2', 'uidPair2');
    const bob = stamped('bob2', 'uidPair2');

    alice.getInventory(95)!.add(995, 10);
    bob.getInventory(95)!.add(1038, 1);
    alice.getInventory(95)!.remove(995, 4);

    assert.equal(ownerBanks().get('uidPair2').getItemCount(995), 6);
    assert.equal(ownerBanks().get('uidPair2').getItemCount(1038), 1);
    assert.deepEqual(ownerBanks().bumpDirty(), ['uidPair2']);
    assert.equal(ownerBanks().version('uidPair2'), 1, 'one tick is one version, however many writes it contained');
});

test('one whole tick with both characters online bumps once and notifies once', () => {
    const banks = ownerBanks();
    const alice = stamped('alice2b', 'uidPair2b');
    const bob = stamped('bob2b', 'uidPair2b');

    alice.getInventory(95)!.add(995, 10);
    bob.getInventory(95)!.add(1038, 1);

    // The real post-cycle hook, not bumpDirty on its own: one pass over both online characters,
    // one owner in the sweep, one version.
    withOnline([alice, bob], afterCycle);
    assert.equal(banks.version('uidPair2b'), 1);

    // A tick in which nobody touched the bank moves nothing.
    withOnline([alice, bob], afterCycle);
    assert.equal(banks.version('uidPair2b'), 1);
});

test('a web apply between ticks is serialised against in-game writes', () => {
    const alice = stamped('alice3', 'uidPair3');
    alice.getInventory(95)!.add(995, 100);
    alice.getInventory(95)!.add(1038, 1);
    ownerBanks().bumpDirty(); // version 1, tick boundary

    // Slot 1, not an arbitrary far slot: both ends of a swap are pinned to the highest occupied
    // index, so a swap with an empty slot past the items folds back onto them and changes
    // nothing (engine-custom/PATCHES.md, "a move cannot place an item past the last one").
    assert.deepEqual(ownerBanks().apply('uidPair3', 1, [{ op: 'swap', a: 0, b: 1 }]), { ok: true, version: 2 });
    assert.equal(alice.getInventory(95)!.get(1)?.count, 100, 'the online character sees the web reorder at once');
    assert.equal(alice.getInventory(95)!.get(0)?.id, 1038);
});

test('the version an apply returns is immediately reusable as the next expectedVersion', () => {
    const banks = ownerBanks();
    const alice = stamped('alice4', 'uidPair4');
    alice.getInventory(95)!.add(995, 100);
    alice.getInventory(95)!.add(1038, 1);
    withOnline([alice], afterCycle); // version 1

    const first = banks.apply('uidPair4', 1, [{ op: 'swap', a: 0, b: 1 }]);
    assert.deepEqual(first, { ok: true, version: 2 });

    // The sweep that follows consumes the apply's dirt without bumping, so the number the
    // caller is holding is still current one tick later. This is the contract the web bank
    // window is written against; without it every item-moving web op would 409 forever.
    withOnline([alice], afterCycle);
    assert.equal(banks.version('uidPair4'), 2);
    assert.deepEqual(banks.apply('uidPair4', 2, [{ op: 'swap', a: 0, b: 1 }]), { ok: true, version: 3 });

    // And a caller holding a stale number is refused with the current one, which is what it
    // then refetches at.
    assert.deepEqual(banks.apply('uidPair4', 2, [{ op: 'swap', a: 0, b: 1 }]), { ok: false, reason: 'conflict', version: 3 });
});

// --- The login binding (dispatch note 2) -------------------------------------
// Locally node.production is false, so requireOwner is false and an unasserted login still
// succeeds un-stamped; the rejection path (World.onLoginMessage answering the throw with login
// response 13) is therefore pinned here rather than by flipping the dev world's config.

/** Runs `fn` with the overlay config temporarily forced into a production-shaped world. */
function withRequireOwner<T>(secret: string, fn: () => T): T {
    const priorSecret = idlescapeConfig.ownerSecret;
    const priorRequire = idlescapeConfig.requireOwner;
    idlescapeConfig.ownerSecret = secret;
    idlescapeConfig.requireOwner = true;
    try {
        return fn();
    } finally {
        idlescapeConfig.ownerSecret = priorSecret;
        idlescapeConfig.requireOwner = priorRequire;
    }
}

/** A new-character save: `load` takes its `sav.data.length < 2` branch. */
function emptySav(): Packet {
    return new Packet(new Uint8Array(0));
}

function socketWith(ownerHeader: string | null): NullClientSocket {
    const socket = new NullClientSocket();
    socket.ownerHeader = ownerHeader;
    return socket;
}

test('requireOwner refuses a login whose socket carries no assertion', () => {
    withRequireOwner('s'.repeat(32), () => {
        assert.throws(
            () => PlayerLoading.load('nobody', emptySav(), socketWith(null)),
            (err: unknown) => err instanceof OwnerAssertionError && /carried no valid owner assertion/.test(err.message)
        );
    });
});

test('requireOwner refuses a forged or mis-addressed assertion just as hard', () => {
    const secret = 's'.repeat(32);
    // A real entry for a different character, and a real entry with one signature byte changed.
    const valid = signed('u1', 'mallory', secret);
    withRequireOwner(secret, () => {
        assert.throws(() => PlayerLoading.load('victim', emptySav(), socketWith(valid)), OwnerAssertionError);
        assert.throws(() => PlayerLoading.load('mallory', emptySav(), socketWith(`${valid}x`)), OwnerAssertionError);
        assert.throws(() => PlayerLoading.load('mallory', emptySav(), socketWith(signed('u1', 'mallory', 'other-secret-32-chars-aaaaaaaaaa'))), OwnerAssertionError);
    });
});

test('requireOwner accepts a valid assertion and stamps the owner key onto the player', () => {
    const secret = 's'.repeat(32);
    withRequireOwner(secret, () => {
        const player = PlayerLoading.load('Owned', emptySav(), socketWith(signed('uidLogin', 'owned', secret)));
        assert.equal(getOwnerKey(player), 'uidLogin');
        // Stamped means inv 95 is the shared container, not this character's own.
        assert.equal(player.getInventory(95), ownerBanks().get('uidLogin'));
    });
});

test('requireOwner never refuses a socketless load (the login server reads .sav files that way)', () => {
    withRequireOwner('s'.repeat(32), () => {
        const player = PlayerLoading.load('autosave', emptySav(), null);
        assert.equal(getOwnerKey(player), null, 'and it is un-stamped by construction');
    });
});

// --- A refused .sav migration (the character's own bank stays authoritative) --

/** A legacy save with a bank in it, made the way an un-stamped character makes one. */
function savWithBank(name: string, slots: BankSlotDto[]): Uint8Array {
    const n37 = toBase37(name);
    const player = new Player(name, n37, n37); // un-stamped: inv 95 is this character's own
    const bank = player.getInventory(95);
    assert.ok(bank);
    for (const slot of slots) {
        bank.set(slot.slot, { id: slot.obj, count: slot.count });
    }
    return player.save();
}

/** The occupied slots of one inv type in a `.sav`, decoded the way PlayerLoading.load does. */
function decodeSavInv(sav: Packet, type: number): BankSlotDto[] {
    sav.pos = 0;
    sav.g2();
    sav.g2(); // magic, version
    sav.g2();
    sav.g2();
    sav.g1(); // x, z, level
    for (let i = 0; i < 12; i++) sav.g1(); // body, colors
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
    const found: BankSlotDto[] = [];
    for (let i = 0; i < invCount; i++) {
        const invType = sav.g2();
        const size = sav.g2();
        for (let slot = 0; slot < size; slot++) {
            const id = sav.g2() - 1;
            if (id === -1) continue;
            let count = sav.g1();
            if (count === 255) count = sav.g4();
            if (invType === type) found.push({ slot, obj: id, count });
        }
    }
    return found;
}

test('a refused .sav migration leaves that character bank in its own save, ready to retry', () => {
    const secret = 's'.repeat(32);
    const banks = ownerBanks();

    // Fill the owner's shared container so nothing can be merged into it. The bank is
    // ALWAYS_STACK, so leaving no room for a new obj means occupying all 240 slots with
    // distinct ones - exactly the state a second or third character's bank runs into.
    const shared = banks.get('uidRefused');
    for (let slot = 0; slot < shared.capacity; slot++) {
        shared.set(slot, { id: 100 + slot, count: 1 });
    }
    banks.bumpDirty();

    const legacy: BankSlotDto[] = [
        { slot: 0, obj: 995, count: 100 },
        { slot: 5, obj: 1038, count: 1 }
    ];
    const sav = savWithBank('refused', legacy);

    const player = withRequireOwner(secret, () => PlayerLoading.load('refused', new Packet(sav), socketWith(signed('uidRefused', 'refused', secret))));

    // The merge was refused whole, so nothing of this character's bank reached the store and
    // the username was not recorded: the next login retries it.
    assert.equal(banks.get('uidRefused').getItemCount(995), 0);
    assert.equal(getOwnerKey(player), 'uidRefused');

    // ...which means the .sav is still the only copy of those items, and save() must re-emit
    // it. Player.save() serialises this.invs alone, so a refusal has to put the decoded bank
    // back into the character's OWN container (through the unpatched getInventory: the patched
    // one would hand back the shared container and lose the items on the next autosave).
    assert.deepEqual(decodeSavInv(new Packet(player.save()), 95), legacy);

    // And in game the character still banks into the shared container, not its own copy.
    assert.equal(player.getInventory(95), banks.get('uidRefused'));
});

test('a merged .sav migration does not re-emit the bank into the save', () => {
    const secret = 's'.repeat(32);
    const banks = ownerBanks();
    const legacy: BankSlotDto[] = [{ slot: 2, obj: 995, count: 42 }];
    const sav = savWithBank('merged', legacy);

    const player = withRequireOwner(secret, () => PlayerLoading.load('merged', new Packet(sav), socketWith(signed('uidMerged', 'merged', secret))));

    assert.equal(banks.get('uidMerged').getItemCount(995), 42, 'the bank moved into the store');
    assert.deepEqual(decodeSavInv(new Packet(player.save()), 95), [], 'and the .sav no longer carries it');
});

/** The front server's entry format, mirrored so this suite needs no import from server/. */
function signed(uid: string, character: string, secret: string): string {
    const exp = Date.now() + 60_000;
    const sig = createHmac('sha256', secret).update(`cs1|${uid}|${character}|${exp}`).digest('base64url');
    return `${uid}.${character}.${exp}.${sig}`;
}
