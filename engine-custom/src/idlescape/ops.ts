/**
 * The pure half of the owner bank: validating an op batch and applying it to a real engine
 * `Inventory`. Nothing here reads or writes a file, a player or the world, so the whole op
 * model is testable against the packed cache alone; Task 8's store owns persistence and
 * versioning, and only calls `applyOps`.
 */
import ObjType from '#/cache/config/ObjType.js';
import { Inventory } from '#/engine/Inventory.js';

import {
    clampTabs,
    dropEmptyTabs,
    insertKeepsTabs,
    moveWithin,
    sameItems,
    sameSizes,
    tabRanges,
    tabOfSlot,
    tabsValid,
    usedOf,
    type BankItem
} from './bankLayout.js';
import { MAX_TABS, type BankApplyError, type BankOp } from './types.js';

// Re-exported so the op model has one entry point: callers import everything from './ops.js'.
export { tabRanges };

export type ApplyResult = { ok: true; tabs: number[]; changed: boolean } | { ok: false; error: BankApplyError };

function isInt(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value);
}

function isIntArray(value: unknown): value is number[] {
    return Array.isArray(value) && value.every(isInt);
}

/**
 * `ObjType.get` is a bare array index (`ObjType.configs[id]`), so anything at or past
 * `ObjType.count` comes back undefined and dereferencing it throws. A bank written by an older
 * pack, or a hand-edited store file, can hold such an id, and one stale id must not take the
 * whole batch down: `objTypeOf` returns null instead, sorting treats it as value 0 / name '',
 * and a `delta` naming one is refused outright (`Inventory.add` would dereference it).
 */
function knownObj(obj: number): boolean {
    return Number.isInteger(obj) && obj >= 0 && obj < ObjType.count;
}

function objTypeOf(id: number): ObjType | null {
    return knownObj(id) ? ObjType.get(id) : null;
}

/**
 * Turns untrusted JSON into a `BankOp`, or `null`. Everything that is not exactly one of the
 * six shapes is refused here rather than deeper in: `applyOps` may then trust its input.
 */
export function normaliseOp(raw: unknown): BankOp | null {
    if (typeof raw !== 'object' || raw === null) {
        return null;
    }
    const r = raw as Record<string, unknown>;

    // Spec section 7 spells a delta as { obj, delta }; the richer SP8b op set uses a tagged
    // union. Accept both, emit one.
    if (r.op === undefined && isInt(r.obj) && knownObj(r.obj) && isInt(r.delta) && r.delta !== 0) {
        return { op: 'delta', obj: r.obj, count: r.delta };
    }

    switch (r.op) {
        case 'delta':
            return isInt(r.obj) && knownObj(r.obj) && isInt(r.count) && r.count !== 0 ? { op: 'delta', obj: r.obj, count: r.count } : null;
        case 'swap':
            return isInt(r.a) && isInt(r.b) ? { op: 'swap', a: r.a, b: r.b } : null;
        case 'insert':
            return isInt(r.from) && isInt(r.to) ? { op: 'insert', from: r.from, to: r.to } : null;
        case 'moveToTab':
            return isInt(r.slot) && isInt(r.tab) ? { op: 'moveToTab', slot: r.slot, tab: r.tab } : null;
        case 'setTabs':
            return isIntArray(r.sizes) ? { op: 'setTabs', sizes: [...r.sizes] } : null;
        case 'sort':
            return isInt(r.tab) && (r.by === 'value' || r.by === 'name' || r.by === 'id') ? { op: 'sort', tab: r.tab, by: r.by } : null;
        default:
            return null;
    }
}

/** Highest occupied slot index + 1 (0 when the bank is empty). Holes are inside it. */
export function lastUsedSlot(inv: Inventory): number {
    for (let slot = inv.capacity - 1; slot >= 0; slot--) {
        if (inv.get(slot)) {
            return slot + 1;
        }
    }
    return 0;
}

/**
 * The engine's only price signal: High Alchemy, `alchemy.rs2:25` (`max(scale(6, 10, cost), 1)`).
 * An obj this pack has never heard of is worth 0, which sorts it to the back rather than
 * throwing.
 */
function alchValue(id: number): number {
    const type = objTypeOf(id);
    return type === null ? 0 : Math.max(Math.floor((type.cost * 6) / 10), 1);
}

/** '' for an obj this pack has never heard of, which sorts it to the front. */
function objName(id: number): string {
    return objTypeOf(id)?.name ?? '';
}

function snapshot(inv: Inventory): Array<BankItem | null> {
    const out: Array<BankItem | null> = new Array(inv.capacity).fill(null);
    for (let slot = 0; slot < inv.capacity; slot++) {
        const item = inv.get(slot);
        out[slot] = item ? { id: item.id, count: item.count } : null;
    }
    return out;
}

/** Copies (never aliases: `Inventory.remove` mutates the item objects it is handed). */
function restore(inv: Inventory, items: Array<BankItem | null>): void {
    for (let slot = 0; slot < inv.capacity; slot++) {
        const item = items[slot];
        inv.set(slot, item ? { id: item.id, count: item.count } : null);
    }
}

/** Writes only the slots that actually differ, so the next inv_transmit diff stays small. */
function commit(inv: Inventory, items: Array<BankItem | null>): void {
    for (let slot = 0; slot < inv.capacity; slot++) {
        const current = inv.get(slot);
        const next = items[slot];
        if (!current && !next) {
            continue;
        }
        if (current && next && current.id === next.id && current.count === next.count) {
            continue;
        }
        inv.set(slot, next ? { id: next.id, count: next.count } : null);
    }
}

/**
 * Applies a batch atomically to `inv` (an Inventory the caller owns; every write goes through
 * Inventory.set, so dirty-slot tracking and the next inv_transmit diff come for free) and
 * returns the tab layout the batch leaves behind. On any failure nothing is written: the batch
 * runs against a snapshot and only reaches the container once every op has been accepted.
 */
export function applyOps(inv: Inventory, tabs: number[], ops: BankOp[]): ApplyResult {
    const original = snapshot(inv);
    let items = snapshot(inv);
    let declared = dropEmptyTabs([...tabs]);
    let arranged = [...declared];

    const fail = (error: BankApplyError): ApplyResult => ({ ok: false, error });
    const validSlot = (slot: number) => slot >= 0 && slot < inv.capacity;

    // OSRS will not let you drop an item past the last one in the bank: the slots beyond it are
    // not a place, they are the absence of items. Both ends of a move are pinned to the last
    // occupied index (`lastUsedSlot` - 1) so a move can only ever permute the used region,
    // never inflate it and leave a hole behind. Out-of-container slots are still `bad_slot`;
    // this only folds a legal-but-empty destination back onto the items.
    const lastItem = () => Math.max(usedOf(items) - 1, 0);

    for (const op of ops) {
        switch (op.op) {
            case 'swap': {
                if (!validSlot(op.a) || !validSlot(op.b)) {
                    return fail('bad_slot');
                }
                const a = Math.min(op.a, lastItem());
                const b = Math.min(op.b, lastItem());
                const tmp = items[a];
                items[a] = items[b];
                items[b] = tmp;
                break;
            }
            case 'insert': {
                if (!validSlot(op.from) || !validSlot(op.to)) {
                    return fail('bad_slot');
                }
                const from = Math.min(op.from, lastItem());
                const to = Math.min(op.to, lastItem());
                if (!insertKeepsTabs(arranged, declared, from, to)) {
                    return fail('tab_invariant');
                }
                moveWithin(items, from, to);
                break;
            }
            case 'moveToTab': {
                if (!validSlot(op.slot)) {
                    return fail('bad_slot');
                }
                if (op.tab < 0 || op.tab > MAX_TABS) {
                    return fail('bad_tab');
                }
                const from = tabOfSlot(declared, op.slot);
                if (from === op.tab) {
                    break;
                }

                // A tab index past the last tab is the "+" tab: the sizes grow to reach it and
                // any tab left empty in between is dropped below.
                const sizes = [...declared];
                while (sizes.length < op.tab) {
                    sizes.push(0);
                }
                if (from > 0) {
                    sizes[from - 1] -= 1;
                }

                // The destination is the end of the target tab once the source has shrunk; the
                // main tab appends at the last used slot, which is always past every tab.
                const dest = op.tab === 0 ? Math.max(usedOf(items) - 1, 0) : tabRanges(sizes)[op.tab - 1].end;
                if (op.tab > 0) {
                    sizes[op.tab - 1] += 1;
                }

                moveWithin(items, op.slot, Math.min(dest, inv.capacity - 1));
                declared = dropEmptyTabs(sizes);
                break;
            }
            case 'setTabs': {
                // Zero sizes are not dropped here: an explicit setTabs states the whole layout,
                // so a 0 in it is a bad request (ruling 1) rather than an empty tab to collapse.
                declared = [...op.sizes];
                break;
            }
            case 'sort': {
                if (op.tab < 0 || op.tab > MAX_TABS) {
                    return fail('bad_tab');
                }
                const ranges = tabRanges(declared);
                const range = op.tab === 0 ? { start: declared.reduce((total, size) => total + size, 0), end: inv.capacity } : ranges[op.tab - 1];
                if (!range) {
                    return fail('bad_tab');
                }

                const held = items.slice(range.start, range.end).filter((item): item is BankItem => item !== null);
                held.sort((a, b) => {
                    if (op.by === 'id') {
                        return a.id - b.id;
                    }
                    if (op.by === 'name') {
                        // Pinned to 'en' so the order does not depend on the host's locale.
                        return objName(a.id).localeCompare(objName(b.id), 'en');
                    }
                    return alchValue(b.id) - alchValue(a.id);
                });
                for (let slot = range.start; slot < range.end; slot++) {
                    items[slot] = held[slot - range.start] ?? null;
                }
                declared = clampTabs(declared, usedOf(items));
                break;
            }
            case 'delta': {
                if (!knownObj(op.obj)) {
                    return fail('bad_op');
                }
                // Applied through a scratch Inventory so stacking, the 0x7fffffff clamp and
                // "how many actually fitted" come from the engine's own container logic.
                const scratch = new Inventory(inv.type, inv.capacity, inv.stackType);
                restore(scratch, items);
                if (op.count > 0) {
                    if (scratch.add(op.obj, op.count) !== op.count) {
                        return fail('full');
                    }
                } else {
                    if (scratch.remove(op.obj, -op.count) !== -op.count) {
                        return fail('insufficient');
                    }
                }
                items = snapshot(scratch);
                declared = clampTabs(declared, usedOf(items));
                break;
            }
            default:
                return fail('bad_op');
        }

        // Only a setTabs leaves the declared layout ahead of where the items sit; every other
        // op moves items into the layout it found, so the two are back in step afterwards.
        if (op.op !== 'setTabs') {
            arranged = [...declared];
        }

        // The invariant is checked after every op, not once at the end, so a batch cannot
        // pass through an illegal intermediate state and land somewhere plausible.
        if (!tabsValid(declared, usedOf(items))) {
            return fail('tab_invariant');
        }
    }

    // `changed` is measured, not counted: a batch whose ops cancel out (a swap of a slot with
    // itself, a sort of an already sorted tab, a setTabs that restates the sizes) leaves the
    // bank exactly as it found it, and the store must not burn a version on it.
    const itemsChanged = !sameItems(original, items);
    if (itemsChanged) {
        commit(inv, items);
    }
    return { ok: true, tabs: declared, changed: itemsChanged || !sameSizes(tabs, declared) };
}
