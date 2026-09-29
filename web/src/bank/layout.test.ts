// web/src/bank/layout.test.ts
import { describe, expect, it } from 'vitest';
import type { BankItems, BankSnapshot, ObjInfo } from './types';
import {
  alchValue, expandSlots, formatCount, insertCrossesTab, localInsert, localSort, localSwap,
  rangeOfTab, tabIconObj, tabItemCount, tabOfSlot, tabRanges, usedOf
} from './layout';

const at = (slot: number, obj: number, count = 1) => ({ slot, obj, count });

/** Dense array of `objs`, padded with nulls to `capacity`. */
function items(objs: (number | null)[], capacity = 240): BankItems {
  const out: BankItems = new Array(capacity).fill(null);
  objs.forEach((obj, slot) => { out[slot] = obj === null ? null : { slot, obj, count: 1 }; });
  return out;
}

const INFO: Record<number, ObjInfo> = {
  995: { name: 'Coins', examine: 'Lovely money!', cost: 1, stackable: true, noted: false },
  1618: { name: 'Uncut diamond', examine: 'This looks valuable.', cost: 200, stackable: false, noted: false },
  1619: { name: 'Uncut ruby', examine: 'This looks valuable.', cost: 100, stackable: false, noted: false }
};
const info = (obj: number): ObjInfo | null => INFO[obj] ?? null;

describe('tab arithmetic', () => {
  it('turns sizes into contiguous ranges', () => {
    expect(tabRanges([2, 3])).toEqual([{ start: 0, end: 2 }, { start: 2, end: 5 }]);
    expect(tabRanges([])).toEqual([]);
  });

  it('reports which tab a slot is in, 0 for the main tab', () => {
    expect(tabOfSlot([2, 3], 0)).toBe(1);
    expect(tabOfSlot([2, 3], 1)).toBe(1);
    expect(tabOfSlot([2, 3], 2)).toBe(2);
    expect(tabOfSlot([2, 3], 4)).toBe(2);
    expect(tabOfSlot([2, 3], 5)).toBe(0);
    expect(tabOfSlot([], 0)).toBe(0);
  });

  it('gives the main tab everything past the last tab, up to the used slots', () => {
    expect(rangeOfTab([2, 3], 0, 9)).toEqual({ start: 5, end: 9 });
    expect(rangeOfTab([2, 3], 2, 9)).toEqual({ start: 2, end: 5 });
    // A tab index past the end is empty, not a throw.
    expect(rangeOfTab([2], 4, 9)).toEqual({ start: 9, end: 9 });
  });

  it('counts used slots as the highest occupied index plus one, holes included', () => {
    expect(usedOf(items([995, null, 1618]))).toBe(3);
    expect(usedOf(items([]))).toBe(0);
  });
});

describe('expandSlots', () => {
  it('makes the sparse wire shape dense and capacity-long', () => {
    const snapshot: BankSnapshot = { ownerKey: 'u', version: 3, capacity: 240, tabs: [], slots: [at(0, 995, 500), at(2, 1618)] };
    const dense = expandSlots(snapshot);
    expect(dense.length).toBe(240);
    expect(dense[0]).toEqual({ slot: 0, obj: 995, count: 500 });
    expect(dense[1]).toBeNull();
    expect(dense[2]).toEqual({ slot: 2, obj: 1618, count: 1 });
    expect(dense[239]).toBeNull();
  });
});

describe('tab icons and counts (owner decision 4)', () => {
  it('uses the first item of the tab as its icon', () => {
    const bank = items([995, 1618, 1619]);
    expect(tabIconObj(bank, [2], 1, 3)).toBe(995);
    expect(tabIconObj(bank, [2], 0, 3)).toBe(1619);
  });

  it('skips holes when picking the icon and reports null for an empty tab', () => {
    expect(tabIconObj(items([null, 1618]), [2], 1, 2)).toBe(1618);
    expect(tabIconObj(items([995]), [1], 2, 1)).toBeNull();
  });

  it('counts the occupied slots of a tab', () => {
    expect(tabItemCount(items([995, null, 1618, 1619]), [3], 1, 4)).toBe(2);
    expect(tabItemCount(items([995, null, 1618, 1619]), [3], 0, 4)).toBe(1);
  });
});

describe('local swap and insert', () => {
  it('swaps two slots without touching the rest', () => {
    const before = items([995, 1618, 1619]);
    const after = localSwap(before, 0, 2);
    expect(after.slice(0, 3).map(s => s?.obj)).toEqual([1619, 1618, 995]);
    // The input is never mutated: the optimistic view must be reversible on a 409.
    expect(before.slice(0, 3).map(s => s?.obj)).toEqual([995, 1618, 1619]);
  });

  it('renumbers the slot field so the view and the server agree', () => {
    const after = localSwap(items([995, 1618]), 0, 1);
    expect(after[0]).toEqual({ slot: 0, obj: 1618, count: 1 });
    expect(after[1]).toEqual({ slot: 1, obj: 995, count: 1 });
  });

  it('shifts everything between the ends on an insert, in both directions', () => {
    expect(localInsert(items([1, 2, 3, 4]), 0, 2).slice(0, 4).map(s => s?.obj)).toEqual([2, 3, 1, 4]);
    expect(localInsert(items([1, 2, 3, 4]), 3, 1).slice(0, 4).map(s => s?.obj)).toEqual([1, 4, 2, 3]);
  });

  it('is a no-op when the ends are equal', () => {
    expect(localInsert(items([1, 2, 3]), 1, 1).slice(0, 3).map(s => s?.obj)).toEqual([1, 2, 3]);
  });
});

describe('insertCrossesTab', () => {
  it('is false inside one tab and true across a boundary', () => {
    expect(insertCrossesTab([2, 2], 0, 1)).toBe(false);
    expect(insertCrossesTab([2, 2], 1, 2)).toBe(true);
    expect(insertCrossesTab([2, 2], 3, 5)).toBe(true);
    // Everything past the tabs is one main tab.
    expect(insertCrossesTab([2], 4, 7)).toBe(false);
  });
});

describe('alchValue', () => {
  it('is max(floor(cost * 6 / 10), 1), the engine formula', () => {
    expect(alchValue(0)).toBe(1);
    expect(alchValue(1)).toBe(1);
    expect(alchValue(100)).toBe(60);
    expect(alchValue(101)).toBe(60);
  });
});

describe('formatCount', () => {
  it('shows nothing for a single item', () => {
    expect(formatCount(1)).toBeNull();
  });

  it('is yellow below 100 000', () => {
    expect(formatCount(2)).toEqual({ text: '2', tone: 'yellow' });
    expect(formatCount(99_999)).toEqual({ text: '99999', tone: 'yellow' });
  });

  it('turns white and K at 100 000', () => {
    expect(formatCount(100_000)).toEqual({ text: '100K', tone: 'white' });
    expect(formatCount(9_999_999)).toEqual({ text: '9999K', tone: 'white' });
  });

  it('turns green and M at 10 000 000', () => {
    expect(formatCount(10_000_000)).toEqual({ text: '10M', tone: 'green' });
    expect(formatCount(2_147_483_647)).toEqual({ text: '2147M', tone: 'green' });
  });
});

describe('localSort', () => {
  const bank = items([1619, 995, 1618]);

  it('sorts a tab by descending alch value and compacts it', () => {
    const after = localSort(bank, [3], 1, 3, 'value', info);
    expect(after.slice(0, 3).map(s => s?.obj)).toEqual([1618, 1619, 995]);
  });

  it('sorts by name with an en collation, not the host locale', () => {
    const after = localSort(bank, [3], 1, 3, 'name', info);
    expect(after.slice(0, 3).map(s => s?.obj)).toEqual([995, 1618, 1619]);
  });

  it('sorts by id', () => {
    const after = localSort(bank, [3], 1, 3, 'id', info);
    expect(after.slice(0, 3).map(s => s?.obj)).toEqual([995, 1618, 1619]);
  });

  it('compacts holes inside the sorted range and leaves other tabs alone', () => {
    const holed = items([1619, null, 1618, 995]);
    const after = localSort(holed, [3], 1, 4, 'id', info);
    expect(after.slice(0, 4).map(s => s?.obj ?? null)).toEqual([1618, 1619, null, 995]);
  });

  it('treats an obj this pack has never heard of as value 0 and name empty', () => {
    const unknown = items([4151, 1618]);
    expect(localSort(unknown, [2], 1, 2, 'value', info).slice(0, 2).map(s => s?.obj)).toEqual([1618, 4151]);
    expect(localSort(unknown, [2], 1, 2, 'name', info).slice(0, 2).map(s => s?.obj)).toEqual([4151, 1618]);
  });
});
