/**
 * The bank's tab and slot arithmetic: pure array maths over sizes and slots, with no engine
 * import beyond `MAX_TABS`. Split out of `ops.ts` so both files stay well under the project's
 * 400-line ceiling; it is also the engine-side counterpart of `web/src/bank/layout.ts`, so the
 * two ends of SP8b can be read side by side.
 */
import { MAX_TABS } from './types.js';

export type BankItem = { id: number; count: number };

export function tabRanges(tabs: number[]): Array<{ start: number; end: number }> {
    const out: Array<{ start: number; end: number }> = [];
    let start = 0;
    for (const size of tabs) {
        out.push({ start, end: start + size });
        start += size;
    }
    return out;
}

/** Which tab a slot belongs to: 1..9 for a real tab, 0 for the main tab beyond them. */
export function tabOfSlot(tabs: number[], slot: number): number {
    const ranges = tabRanges(tabs);
    for (let i = 0; i < ranges.length; i++) {
        if (slot >= ranges[i].start && slot < ranges[i].end) {
            return i + 1;
        }
    }
    return 0;
}

/** Ruling 1: at most nine tabs, every size >= 1, and they may not extend past the items. */
export function tabsValid(tabs: number[], used: number): boolean {
    if (tabs.length > MAX_TABS) {
        return false;
    }
    let sum = 0;
    for (const size of tabs) {
        if (size < 1) {
            return false;
        }
        sum += size;
    }
    return sum <= used;
}

export function dropEmptyTabs(tabs: number[]): number[] {
    return tabs.filter(size => size > 0);
}

export function sameSizes(a: number[], b: number[]): boolean {
    return a.length === b.length && a.every((size, i) => size === b[i]);
}

export function sameItems(a: Array<BankItem | null>, b: Array<BankItem | null>): boolean {
    for (let slot = 0; slot < a.length; slot++) {
        const left = a[slot];
        const right = b[slot];
        if (!left && !right) {
            continue;
        }
        if (!left || !right || left.id !== right.id || left.count !== right.count) {
            return false;
        }
    }
    return true;
}

/**
 * Shrinks the tabs back onto the items, last tab first. Used by the two ops that can lower the
 * used-slot count without the caller asking for a layout change (`sort` compacts holes,
 * `delta` withdraws): the tabs follow the items down instead of the op failing.
 */
export function clampTabs(tabs: number[], used: number): number[] {
    const out = [...tabs];
    let sum = out.reduce((total, size) => total + size, 0);
    for (let i = out.length - 1; i >= 0 && sum > used; i--) {
        const take = Math.min(out[i], sum - used);
        out[i] -= take;
        sum -= take;
    }
    return dropEmptyTabs(out);
}

/** Highest occupied index + 1 (0 when empty), over a snapshot rather than an Inventory. */
export function usedOf(items: Array<BankItem | null>): number {
    for (let slot = items.length - 1; slot >= 0; slot--) {
        if (items[slot]) {
            return slot + 1;
        }
    }
    return 0;
}

/** Moves one slot and shifts everything between the two ends over by one, in either direction. */
export function moveWithin(items: Array<BankItem | null>, from: number, to: number): void {
    const moving = items[from];
    if (from < to) {
        for (let slot = from; slot < to; slot++) {
            items[slot] = items[slot + 1];
        }
    } else {
        for (let slot = from; slot > to; slot--) {
            items[slot] = items[slot - 1];
        }
    }
    items[to] = moving;
}

/**
 * Ruling 2: an `insert` that crosses a tab boundary is only legal when the batch has already
 * declared the sizes the move produces. `arranged` is the layout the items currently sit in,
 * `declared` the one a `setTabs` earlier in the batch asked for; the move is legal exactly when
 * moving one slot out of its tab and into the destination's tab turns the first into the second.
 * With no `setTabs` the two are equal, which reduces to "from and to are in the same tab".
 */
export function insertKeepsTabs(arranged: number[], declared: number[], from: number, to: number): boolean {
    const src = tabOfSlot(arranged, from);
    const dst = tabOfSlot(declared, to);
    const expected = [...arranged];
    if (src > 0) {
        expected[src - 1] -= 1;
    }
    if (dst > 0) {
        while (expected.length < dst) {
            expected.push(0);
        }
        expected[dst - 1] += 1;
    }
    return sameSizes(dropEmptyTabs(expected), dropEmptyTabs(declared));
}
