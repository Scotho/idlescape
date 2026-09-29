/**
 * The on-disk half of the owner bank: the sparse file shape, the atomic write, and the name a
 * file that could not be read is parked under.
 *
 * Split out of `ownerBank.ts` only to keep that file under the project's 400-line limit. The
 * store's exported surface is unchanged; nothing outside `ownerBank.ts` imports this module.
 */
import fs from 'node:fs';

import ObjType from '#/cache/config/ObjType.js';
import type { Inventory } from '#/engine/Inventory.js';

import { lastUsedSlot } from './ops.js';
import { MAX_TABS, type BankSlotDto, type OwnerBankFile } from './types.js';

/** What `readBankFile` recovered from one owner's file, plus what it could not. */
export interface BankFileRead {
    version: number;
    tabs: number[];
    migrated: string[];
    /**
     * How many slots validation REFUSED: an obj id this pack does not have, a count that is not
     * positive, a slot outside the container. The store treats any of these as a partial loss
     * and suspends writes for the owner, because the file is the only record of what they were.
     */
    rejected: number;
}

/**
 * Reads one owner's bank file into `inv`, re-validating every field. Throws on JSON the parser
 * cannot read at all - the store answers that with the quarantine - and reports anything it had
 * to drop instead of dropping it silently.
 */
export function readBankFile(file: string, inv: Inventory): BankFileRead {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as OwnerBankFile;
    const result: BankFileRead = {
        version: Number.isSafeInteger(parsed.version) && parsed.version >= 0 ? parsed.version : 0,
        tabs: Array.isArray(parsed.tabs) ? parsed.tabs.filter(n => Number.isInteger(n) && n > 0).slice(0, MAX_TABS) : [],
        migrated: Array.isArray(parsed.migrated) ? parsed.migrated.filter(n => typeof n === 'string') : [],
        rejected: 0
    };

    for (const slot of Array.isArray(parsed.slots) ? parsed.slots : []) {
        if (Number.isInteger(slot?.slot) && slot.slot >= 0 && slot.slot < inv.capacity && Number.isInteger(slot.obj) && slot.obj >= 0 && slot.obj < ObjType.count && Number.isInteger(slot.count) && slot.count > 0) {
            inv.set(slot.slot, { id: slot.obj, count: slot.count });
        } else {
            result.rejected++;
        }
    }
    return result;
}

/**
 * `<file>.<ISO timestamp>.corrupt`, with the colons replaced (Windows forbids them in a path).
 * A fixed `.corrupt` name would let a second corruption overwrite the first quarantine, which
 * is the very copy the owner would be restored from; the counter suffix covers two corruptions
 * inside the same millisecond.
 */
export function quarantinePath(file: string): string {
    const stamp = new Date().toISOString().replace(/:/g, '-');
    let candidate = `${file}.${stamp}.corrupt`;
    for (let n = 1; fs.existsSync(candidate); n++) {
        candidate = `${file}.${stamp}-${n}.corrupt`;
    }
    return candidate;
}

/** The occupied slots, in slot order. The file shape is sparse: empty slots are absent. */
export function slotsOf(inv: Inventory): BankSlotDto[] {
    const slots: BankSlotDto[] = [];
    const used = lastUsedSlot(inv);
    for (let slot = 0; slot < used; slot++) {
        const item = inv.get(slot);
        if (item) {
            slots.push({ slot, obj: item.id, count: item.count });
        }
    }
    return slots;
}

/**
 * Writes one owner's bank atomically: `<target>.tmp` then a rename over `<target>`, so a crash
 * never leaves a half-written bank behind. `fs` is used through the module namespace on
 * purpose, so a test can mock `writeFileSync`/`renameSync` and still see these calls.
 */
export function writeBankFile(dir: string, target: string, payload: OwnerBankFile): void {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
    fs.renameSync(tmp, target); // atomic replace: a crash never leaves a half-written bank
}
