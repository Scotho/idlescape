import type Player from '#/engine/entity/Player.js';

/**
 * Which Firebase account owns each online player. A WeakMap rather than a field on Player,
 * because Player.ts is NOT one of the overlay's whole-file replacements: adding a field there
 * would mean carrying a 2 304-line copy of upstream code for one property.
 */
const ownerKeys = new WeakMap<Player, string>();

export const OWNER_KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Re-validating the key here is defence in depth, not the check that matters: every key that
 * reaches this function has already been through `verifyOwnerHeader`, which will not return a
 * uid that fails this same shape test. It is repeated because the key becomes a filename in
 * `OwnerBankStore` (`<ownerKey>.json`), and a stamped player is trusted from here on, so the
 * one place that stamps them refuses to be the weak link if a future caller arrives from
 * somewhere other than the assertion.
 */
export function setOwnerKey(player: Player, key: string): void {
    if (!OWNER_KEY_RE.test(key)) {
        throw new Error(`bad owner key: ${key}`);
    }
    ownerKeys.set(player, key);
}

export function getOwnerKey(player: Player): string | null {
    return ownerKeys.get(player) ?? null;
}

export function hasOwnerKey(player: Player): boolean {
    return ownerKeys.has(player);
}
