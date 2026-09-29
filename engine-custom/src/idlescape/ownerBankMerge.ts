/**
 * The one-time `.sav` bank merge: the two pure helpers `OwnerBankStore.migrate` runs against a
 * scratch container so an overflow can never half-apply.
 *
 * Split out of `ownerBank.ts` for the same reason `ownerBankFile.ts` was, to keep that file
 * under the project's 400-line limit. The store's exported surface is unchanged; nothing else
 * imports this module.
 */
import ObjType from '#/cache/config/ObjType.js';
import type { Inventory } from '#/engine/Inventory.js';

import type { BankSlotDto } from './types.js';

/**
 * Copies the slots that differ, never aliasing the item objects (`Inventory.remove` mutates
 * the ones it is handed), so an unchanged slot is not marked dirty.
 */
export function copyItems(into: Inventory, from: Inventory): void {
    for (let slot = 0; slot < into.capacity; slot++) {
        const next = from.get(slot);
        const current = into.get(slot);
        if (!current && !next) {
            continue;
        }
        if (current && next && current.id === next.id && current.count === next.count) {
            continue;
        }
        into.set(slot, next ? { id: next.id, count: next.count } : null);
    }
}

/**
 * Merges one character's `.sav` slots into `inv`, keeping the original slot where it is free
 * and the obj is not already stacked elsewhere, and appending otherwise. Returns null when the
 * whole bank merged, or the reason it could not: an obj id this pack does not have (the same
 * guard `read()` applies, so the container can never hold an id the file would then drop), or
 * an item that does not fit.
 */
export function mergeInto(inv: Inventory, objs: BankSlotDto[]): string | null {
    for (const obj of objs) {
        if (!Number.isInteger(obj?.obj) || !Number.isInteger(obj.count) || obj.count <= 0) {
            continue;
        }
        if (obj.obj < 0 || obj.obj >= ObjType.count) {
            return `obj ${obj.obj} is not in this pack`;
        }
        if (Number.isInteger(obj.slot) && obj.slot >= 0 && obj.slot < inv.capacity && inv.get(obj.slot) === null && inv.getItemIndex(obj.obj) === -1) {
            inv.set(obj.slot, { id: obj.obj, count: obj.count });
            continue;
        }
        if (inv.add(obj.obj, obj.count) !== obj.count) {
            return `obj ${obj.obj} x${obj.count} does not fit`;
        }
    }
    return null;
}
