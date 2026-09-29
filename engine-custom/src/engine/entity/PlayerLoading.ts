import InvType from '#/cache/config/InvType.js';
import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import Player, { getExpByLevel, getLevelByExp } from '#/engine/entity/Player.js';
import { PlayerStat } from '#/engine/entity/PlayerStat.js';
import World from '#/engine/World.js';
import { idlescapeConfig } from '#/idlescape/config.js';
import { ownerBanks, ownInventory } from '#/idlescape/install.js';
import { setOwnerKey } from '#/idlescape/owner.js';
import { OwnerAssertionError, verifyOwnerHeader } from '#/idlescape/ownerAssertion.js';
import { writeTabVarps } from '#/idlescape/tabVarps.js';
import { BANK_INV_NAME, type BankSlotDto } from '#/idlescape/types.js';
import Packet from '#/io/Packet.js';
import ClientSocket from '#/server/ClientSocket.js';
import { fromBase37, toBase37 } from '#/util/JString.js';

export class PlayerLoading {
    public static readonly SAV_MAGIC: number = 0x2004;
    public static readonly SAV_VERSION: number = 7;

    static verify(sav: Packet) {
        if (sav.g2() !== PlayerLoading.SAV_MAGIC) {
            return false;
        }

        const version = sav.g2();
        if (version > PlayerLoading.SAV_VERSION) {
            return false;
        }

        sav.pos = sav.data.length - 4;
        const crc = sav.g4s();
        return crc === Packet.getcrc(sav.data, 0, sav.data.length - 4);
    }

    static load(name: string, sav: Packet, client: ClientSocket | null) {
        const hash64 = toBase37(name); // username or email.
        const name37 = toBase37(name); // always username.
        const safeName = fromBase37(name37); // always safe username.

        const player = client ? new NetworkPlayer(safeName, name37, hash64, client) : new Player(safeName, name37, hash64);
        // idlescape: this character's legacy .sav bank, held back for the one-time migration
        // in the tail of this method rather than written into the shared container here.
        let pendingBank: BankSlotDto[] = [];

        // idlescape: bind this login to the Firebase account that owns the character. The
        // assertion arrived on the WebSocket upgrade (src/web.ts); safeName is the name the
        // engine decrypted from the login block, so this comparison is the binding. Throwing
        // here is answered by World.onLoginMessage with login response 13.
        const owner = verifyOwnerHeader(client?.ownerHeader ?? null, safeName, idlescapeConfig.ownerSecret);
        if (owner) {
            setOwnerKey(player, owner.uid);
        } else if (client && idlescapeConfig.requireOwner) {
            // `client &&`: only a real login can carry an assertion. The standalone login
            // server calls load(name, sav, null) to read a .sav for the autosave merge and the
            // hiscores update, and those must never be refused for want of a header no socket
            // was involved in.
            throw new OwnerAssertionError(`login for '${safeName}' carried no valid owner assertion`);
        }
        const ownerKey = owner ? owner.uid : null;

        player.lastConnected = World.currentTick;
        player.lastResponse = World.currentTick;

        if (sav.data.length < 2) {
            for (let i = 0; i < 21; i++) {
                player.stats[i] = 0;
                player.baseLevels[i] = 1;
                player.levels[i] = 1;
            }

            // hitpoints starts at level 10
            player.stats[PlayerStat.HITPOINTS] = getExpByLevel(10);
            player.baseLevels[PlayerStat.HITPOINTS] = 10;
            player.levels[PlayerStat.HITPOINTS] = 10;

            // idlescape: a brand-new character of an existing owner returns here, before the
            // tail below, and must still start from the store's tab layout. Without this its
            // all-zero tab varps would be mirrored into the store by the first post-cycle
            // sweep and wipe the layout every other character of the account shares.
            if (ownerKey !== null) {
                writeTabVarps(player, ownerBanks().tabs(ownerKey));
            }
            return player;
        }

        if (sav.g2() !== PlayerLoading.SAV_MAGIC) {
            throw new Error('Invalid save file');
        }

        const version = sav.g2();
        if (version > PlayerLoading.SAV_VERSION) {
            throw new Error('Unsupported save version');
        }

        sav.pos = sav.data.length - 4;
        const crc = sav.g4s();
        if (crc != Packet.getcrc(sav.data, 0, sav.data.length - 4)) {
            throw new Error('Incorrect save checksum');
        }

        sav.pos = 4;
        player.x = sav.g2();
        player.z = sav.g2();
        player.level = sav.g1();
        for (let i = 0; i < 7; i++) {
            player.body[i] = sav.g1();
            if (player.body[i] === 255) {
                player.body[i] = -1;
            }
        }
        for (let i = 0; i < 5; i++) {
            player.colors[i] = sav.g1();
        }
        player.gender = sav.g1();
        player.runenergy = sav.g2();
        if (version >= 2) {
            // oops playtime overflow
            player.playtime = sav.g4s();
        } else {
            player.playtime = sav.g2();
        }

        for (let i = 0; i < 21; i++) {
            player.stats[i] = sav.g4s();
            player.baseLevels[i] = getLevelByExp(player.stats[i]);
            player.levels[i] = sav.g1();
        }

        const varpCount = sav.g2();
        if (version >= 7) {
            for (let i = 0; i < varpCount; i++) {
                const id = sav.g2();
                player.vars[id] = sav.gVarInt();
            }
        } else {
            for (let i = 0; i < varpCount; i++) {
                player.vars[i] = sav.g4s();
            }
        }

        const invCount = sav.g1();
        for (let i = 0; i < invCount; i++) {
            const type = sav.g2();
            const invType = InvType.get(type);
            const size = version >= 5 ? sav.g2() : invType.size;

            const objs = [];
            for (let slot = 0; slot < size; slot++) {
                const id = sav.g2() - 1;
                if (id === -1) {
                    continue;
                }

                let count = sav.g1();
                if (count === 255) {
                    count = sav.g4s();
                }

                objs.push({ slot, id, count });
            }

            if (invType.scope === InvType.SCOPE_PERM) {
                // idlescape: an owner-stamped player's bank lives in the account store, not in
                // this .sav. Hand the decoded slots to the one-time migration instead of
                // writing them into the shared container on every login.
                if (ownerKey !== null && type === InvType.getId(BANK_INV_NAME)) {
                    pendingBank = objs.map(o => ({ slot: o.slot, obj: o.id, count: o.count }));
                    continue;
                }

                const inv = player.getInventory(type);
                if (inv) {
                    for (const obj of objs) {
                        inv.set(obj.slot, { id: obj.id, count: obj.count });
                    }
                }
            }
        }

        // afk zones
        if (version >= 3) {
            const afkZones: number = sav.g1();
            for (let index: number = 0; index < afkZones; index++) {
                player.afkZones[index] = sav.g4s();
            }
            player.lastAfkZone = sav.g2();
        }

        // chat modes
        if (version >= 4) {
            const packedChatModes = sav.g1();
            player.publicChat = (packedChatModes >> 4) & 0b11;
            player.privateChat = (packedChatModes >> 2) & 0b11;
            player.tradeDuel = packedChatModes & 0b11;
        }

        // last login info
        if (version >= 6) {
            player.lastLoginTime = sav.g8();
        }

        // idlescape: fold this character's old .sav bank into the account store (once per
        // character, ever), then seed the in-game tab varps from the store so the bank
        // interface and the web bank agree from the first tick. Nothing here retires or
        // rewrites the .sav bank on any outcome: it stays the source of truth until a merge
        // lands.
        if (ownerKey !== null) {
            const banks = ownerBanks();
            if (pendingBank.length > 0 && banks.migrate(ownerKey, safeName, pendingBank) === 'refused') {
                // idlescape: the merge was refused (it would overflow the shared container, it
                // names an obj this pack does not have, or the owner has writes suspended), so
                // these items still exist ONLY in this character's .sav, and Player.save()
                // serialises this.invs alone. Put them back into the character's OWN container
                // -- through the UNPATCHED getInventory, because the patched one answers a
                // stamped player with the shared container and would swallow them again -- so
                // the next autosave re-emits the bank verbatim and the next login retries the
                // merge. It is never read in game: inv 95 still resolves to the store.
                const own = ownInventory(player, InvType.getId(BANK_INV_NAME));
                if (own) {
                    for (const obj of pendingBank) {
                        own.set(obj.slot, { id: obj.obj, count: obj.count });
                    }
                }
            }
            writeTabVarps(player, banks.tabs(ownerKey));
        }

        player.combatLevel = player.getCombatLevel();

        return player;
    }
}
