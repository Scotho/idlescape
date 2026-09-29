import VarPlayerType from '#/cache/config/VarPlayerType.js';
import type Player from '#/engine/entity/Player.js';

import { MAX_TABS } from './types.js';

/**
 * Nine scope=perm varps mirroring the owner store's tab sizes, so the in-game bank interface
 * (SP8b's content overlay) and the web bank agree. Defined in
 * content-custom/scripts/interface_bank/configs/banktab.varp.
 */
export const TAB_VARP_NAMES: readonly string[] = Array.from({ length: MAX_TABS }, (_, i) => `banktab_size_${i + 1}`);

let ids: number[] | null = null;

function varpIds(): number[] {
    if (ids) {
        return ids;
    }

    // Nothing here may be memoised before the packed cache is loaded, or an ordering accident
    // would freeze every id at -1 for the life of the process. The engine only reaches this
    // code at login and from the post-cycle hook, both well after World.start().
    if (VarPlayerType.count === 0) {
        return TAB_VARP_NAMES.map(() => -1);
    }

    ids = TAB_VARP_NAMES.map(name => {
        const id = VarPlayerType.getId(name);
        if (id === -1) {
            console.warn(`[idlescape] varp ${name} is missing; bank tabs will not reach the game client`);
        }
        return id;
    });
    return ids;
}

export function readTabVarps(player: Player): number[] {
    const sizes = varpIds().map(id => {
        if (id === -1) {
            return 0;
        }
        // getVar answers a string for a string-typed varp; these are ints, but narrowing is
        // cheaper than a cast and cannot be wrong.
        const value = player.getVar(id);
        return typeof value === 'number' ? Math.max(0, value) : 0;
    });
    while (sizes.length > 0 && sizes[sizes.length - 1] === 0) {
        sizes.pop();
    }
    return sizes;
}

export function writeTabVarps(player: Player, tabs: number[]): void {
    const list = varpIds();
    for (let i = 0; i < list.length; i++) {
        if (list[i] === -1) {
            continue;
        }
        player.setVar(list[i], tabs[i] ?? 0);
    }
    // What the overlay itself last put on this character, in the form a later read answers with
    // (trimmed, and only the varps that actually exist). See changedTabVarps.
    lastWritten.set(player, readTabVarps(player));
}

/**
 * The layout the overlay last WROTE to each online character. A WeakMap beside the one in
 * `owner.ts`, and for the same reason: `Player.ts` is not one of the overlay's whole-file
 * replacements, so a field there would mean carrying 2,300 lines of upstream code.
 */
const lastWritten = new WeakMap<Player, number[]>();

/**
 * The character's tab varps if THIS character has moved them since the overlay last wrote to
 * it, or null if it has not.
 *
 * The post-cycle sweep mirrors the in-game layout into the store once per online character, and
 * an account can have two characters online at once. Mirroring unconditionally is
 * last-writer-wins: whichever character the pass happens to reach last decides the account's
 * layout, so a character that did nothing at all reverts one that just rearranged its tabs.
 * Comparing against the last written layout makes an untouched character silent, because
 * everything that writes these varps (the login seed and the sweep's push-out) writes the
 * STORE's layout - so "differs from what we wrote" is exactly "the player moved it".
 *
 * A character nothing has been written to yet has no snapshot, and mirrors in on its first tick.
 */
export function changedTabVarps(player: Player): number[] | null {
    const current = readTabVarps(player);
    const previous = lastWritten.get(player);
    if (previous && previous.length === current.length && previous.every((size, i) => size === current[i])) {
        return null;
    }
    return current;
}
