import { test, before } from 'node:test';
import assert from 'node:assert/strict';

import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';
import { Inventory } from '#/engine/Inventory.js';

import { applyOps, lastUsedSlot, normaliseOp, tabRanges } from './ops.js';
import { LAYOUT_OPS, MAX_TABS, isLayoutOp } from './types.js';

before(() => {
    InvType.load('data/pack');
    ObjType.load('data/pack');
});

function bank(entries: Array<[number, number, number]>): Inventory {
    const inv = Inventory.fromType(95);
    for (const [slot, obj, count] of entries) inv.set(slot, { id: obj, count });
    inv.resetTracking();
    return inv;
}

function alch(id: number): number {
    return Math.max(Math.floor((ObjType.get(id).cost * 6) / 10), 1);
}

test('lastUsedSlot is the highest occupied index plus one, holes included', () => {
    assert.equal(lastUsedSlot(bank([])), 0);
    assert.equal(lastUsedSlot(bank([[0, 995, 1]])), 1);
    assert.equal(lastUsedSlot(bank([[0, 995, 1], [5, 1038, 1]])), 6);
});

test('tabRanges turns sizes into contiguous ranges and leaves the rest to the main tab', () => {
    assert.deepEqual(tabRanges([2, 3]), [{ start: 0, end: 2 }, { start: 2, end: 5 }]);
    assert.deepEqual(tabRanges([]), []);
});

test('every op except delta is a layout op', () => {
    assert.equal(MAX_TABS, 9);
    assert.deepEqual([...LAYOUT_OPS], ['swap', 'insert', 'moveToTab', 'setTabs', 'sort']);
    assert.equal(isLayoutOp({ op: 'swap', a: 0, b: 1 }), true);
    assert.equal(isLayoutOp({ op: 'sort', tab: 1, by: 'id' }), true);
    assert.equal(isLayoutOp({ op: 'delta', obj: 995, count: 1 }), false);
});

test('swap exchanges two slots and marks the inventory dirty', () => {
    const inv = bank([[0, 995, 10], [1, 1038, 1]]);
    const res = applyOps(inv, [], [{ op: 'swap', a: 0, b: 1 }]);
    assert.equal(res.ok, true);
    assert.equal(inv.get(0)?.id, 1038);
    assert.equal(inv.get(1)?.id, 995);
    assert.equal(inv.update, true);
});

test('swap with an empty slot inside the used region moves the item and leaves a hole behind', () => {
    const inv = bank([[0, 995, 10], [5, 1038, 1]]);
    assert.equal(applyOps(inv, [], [{ op: 'swap', a: 0, b: 3 }]).ok, true);
    assert.equal(inv.get(0), null);
    assert.equal(inv.get(3)?.id, 995);
});

test('a move cannot place an item past the last one in the bank', () => {
    const inv = bank([[0, 995, 10], [1, 1038, 1]]);
    assert.equal(applyOps(inv, [], [{ op: 'insert', from: 0, to: 200 }]).ok, true);
    assert.deepEqual([0, 1, 2].map(s => inv.get(s)?.id), [1038, 995, undefined]);
    assert.equal(lastUsedSlot(inv), 2, 'the used region did not grow');

    assert.equal(applyOps(inv, [], [{ op: 'swap', a: 0, b: 239 }]).ok, true);
    assert.deepEqual([0, 1, 2].map(s => inv.get(s)?.id), [995, 1038, undefined]);
    assert.equal(lastUsedSlot(inv), 2);
});

test('changed is measured, so a batch whose ops cancel out reports false', () => {
    const inv = bank([[0, 995, 5], [1, 1038, 1]]);
    assert.deepEqual(applyOps(inv, [2], [{ op: 'swap', a: 1, b: 1 }]), { ok: true, tabs: [2], changed: false });
    assert.deepEqual(applyOps(inv, [2], [{ op: 'setTabs', sizes: [2] }]), { ok: true, tabs: [2], changed: false });
    assert.deepEqual(applyOps(inv, [2], [{ op: 'sort', tab: 1, by: 'id' }]), { ok: true, tabs: [2], changed: false });
    assert.equal(inv.update, false, 'and nothing was written');
});

test('insert shifts the intervening slots in both directions', () => {
    const inv = bank([[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1]]);
    assert.equal(applyOps(inv, [], [{ op: 'insert', from: 0, to: 2 }]).ok, true);
    assert.deepEqual([0, 1, 2, 3].map(s => inv.get(s)?.id), [2, 3, 1, 4]);
    assert.equal(applyOps(inv, [], [{ op: 'insert', from: 2, to: 0 }]).ok, true);
    assert.deepEqual([0, 1, 2, 3].map(s => inv.get(s)?.id), [1, 2, 3, 4]);
});

test('an empty batch touches nothing and reports no change', () => {
    const inv = bank([[0, 995, 1], [1, 1038, 1]]);
    assert.deepEqual(applyOps(inv, [2], []), { ok: true, tabs: [2], changed: false });
    assert.equal(inv.update, false);
});

test('a slot outside the container is refused', () => {
    const inv = bank([[0, 995, 1]]);
    assert.deepEqual(applyOps(inv, [], [{ op: 'swap', a: 0, b: 240 }]), { ok: false, error: 'bad_slot' });
    assert.deepEqual(applyOps(inv, [], [{ op: 'insert', from: -1, to: 0 }]), { ok: false, error: 'bad_slot' });
});

test('setTabs enforces nine tabs, positive sizes and the used-slot ceiling', () => {
    const inv = bank([[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1]]);
    assert.deepEqual(applyOps(inv, [], [{ op: 'setTabs', sizes: [2, 2] }]), { ok: true, tabs: [2, 2], changed: true });
    assert.deepEqual(applyOps(inv, [], [{ op: 'setTabs', sizes: [3, 3] }]), { ok: false, error: 'tab_invariant' });
    assert.deepEqual(applyOps(inv, [], [{ op: 'setTabs', sizes: [1, 0, 1] }]), { ok: false, error: 'tab_invariant' });
    assert.deepEqual(applyOps(inv, [], [{ op: 'setTabs', sizes: Array(10).fill(1) }]), { ok: false, error: 'tab_invariant' });
});

test('an insert that would cross a tab boundary is refused, and allowed when the batch resizes first', () => {
    const inv = bank([[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1]]);
    assert.deepEqual(applyOps(inv, [2, 2], [{ op: 'insert', from: 0, to: 3 }]), { ok: false, error: 'tab_invariant' });
    const res = applyOps(inv, [2, 2], [{ op: 'setTabs', sizes: [1, 3] }, { op: 'insert', from: 0, to: 3 }]);
    assert.equal(res.ok, true);
    assert.deepEqual([0, 1, 2, 3].map(s => inv.get(s)?.id), [2, 3, 4, 1]);
});

test('a setTabs that does not account for the move leaves the insert illegal', () => {
    // [3, 1] grows the tab the item leaves and shrinks the one it lands in, the opposite of
    // what slot 0 -> slot 3 does, so the batch is still refused.
    const inv = bank([[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1]]);
    assert.deepEqual(
        applyOps(inv, [2, 2], [{ op: 'setTabs', sizes: [3, 1] }, { op: 'insert', from: 0, to: 3 }]),
        { ok: false, error: 'tab_invariant' }
    );
    assert.deepEqual([0, 1, 2, 3].map(s => inv.get(s)?.id), [1, 2, 3, 4]);
    assert.equal(inv.update, false);
});

test('a failing op inside a batch rolls the whole batch back', () => {
    const inv = bank([[0, 1, 1], [1, 2, 1]]);
    const before = [0, 1].map(s => inv.get(s)?.id);
    assert.deepEqual(applyOps(inv, [], [{ op: 'swap', a: 0, b: 1 }, { op: 'swap', a: 0, b: 999 }]), { ok: false, error: 'bad_slot' });
    assert.deepEqual([0, 1].map(s => inv.get(s)?.id), before);
    assert.equal(inv.update, false, 'nothing was written, so nothing is dirty');
});

test('moveToTab appends to the end of a tab and grows it, main tab included', () => {
    const inv = bank([[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1]]);
    const res = applyOps(inv, [2, 2], [{ op: 'moveToTab', slot: 3, tab: 1 }]);
    assert.deepEqual(res, { ok: true, tabs: [3, 1], changed: true });
    assert.deepEqual([0, 1, 2, 3].map(s => inv.get(s)?.id), [1, 2, 4, 3]);
});

test('moveToTab past the last tab creates one, and tab 0 drops the item into the main tab', () => {
    const inv = bank([[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1]]);
    assert.deepEqual(applyOps(inv, [2, 2], [{ op: 'moveToTab', slot: 0, tab: 3 }]), { ok: true, tabs: [1, 2, 1], changed: true });
    assert.deepEqual([0, 1, 2, 3].map(s => inv.get(s)?.id), [2, 3, 4, 1]);

    const main = bank([[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1]]);
    assert.deepEqual(applyOps(main, [2, 2], [{ op: 'moveToTab', slot: 0, tab: 0 }]), { ok: true, tabs: [1, 2], changed: true });
    assert.deepEqual([0, 1, 2, 3].map(s => main.get(s)?.id), [2, 3, 4, 1]);
});

test('a tab emptied by moveToTab is removed and later tabs shift left', () => {
    // Tab 1 holds one item; moving it into tab 2 empties tab 1, which is dropped, so the two
    // sizes [1, 1] collapse to the single [2] that tab 2 has grown into.
    const inv = bank([[0, 1, 1], [1, 2, 1], [2, 3, 1]]);
    const res = applyOps(inv, [1, 1], [{ op: 'moveToTab', slot: 0, tab: 2 }]);
    assert.deepEqual(res, { ok: true, tabs: [2], changed: true });
    assert.deepEqual([0, 1, 2].map(s => inv.get(s)?.id), [2, 1, 3]);
});

test('a moveToTab onto the tab the slot is already in changes nothing', () => {
    const inv = bank([[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1]]);
    assert.deepEqual(applyOps(inv, [2, 2], [{ op: 'moveToTab', slot: 0, tab: 1 }]), { ok: true, tabs: [2, 2], changed: false });
    assert.equal(inv.update, false);
});

test('a tab out of range is refused', () => {
    const inv = bank([[0, 995, 1]]);
    assert.deepEqual(applyOps(inv, [], [{ op: 'moveToTab', slot: 0, tab: 10 }]), { ok: false, error: 'bad_tab' });
    assert.deepEqual(applyOps(inv, [], [{ op: 'moveToTab', slot: 0, tab: -1 }]), { ok: false, error: 'bad_tab' });
});

test('sort orders a tab by id, name and High Alchemy value without touching other tabs', () => {
    // 995 Coins (cost 1), 1619 Uncut ruby (cost 100), 1618 Uncut diamond (cost 200): three
    // distinct costs, so the value order is neither the id order nor the name order.
    const inv = bank([[0, 1618, 1], [1, 995, 5], [2, 1619, 1], [3, 2, 1]]);
    assert.equal(applyOps(inv, [3], [{ op: 'sort', tab: 1, by: 'id' }]).ok, true);
    assert.deepEqual([0, 1, 2].map(s => inv.get(s)?.id), [995, 1618, 1619]);
    assert.equal(inv.get(3)?.id, 2, 'the main tab is untouched');

    assert.equal(applyOps(inv, [3], [{ op: 'sort', tab: 1, by: 'value' }]).ok, true);
    assert.deepEqual([0, 1, 2].map(s => inv.get(s)?.id), [1618, 1619, 995]);
    const values = [0, 1, 2].map(s => alch(inv.get(s)!.id));
    assert.deepEqual(values, [...values].sort((a, b) => b - a), 'value sort is descending');
    assert.deepEqual(values, [120, 60, 1], 'High Alchemy is max(floor(cost * 6 / 10), 1)');

    assert.equal(applyOps(inv, [3], [{ op: 'sort', tab: 1, by: 'name' }]).ok, true);
    const names = [0, 1, 2].map(s => ObjType.get(inv.get(s)!.id).name ?? '');
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
    assert.deepEqual(names, ['Coins', 'Uncut diamond', 'Uncut ruby']);
    assert.equal(inv.get(3)?.id, 2, 'the main tab is still untouched');
});

test('sort compacts the holes inside the tab it sorts and shrinks the tab onto them', () => {
    // Compacting drops the last used slot from 3 to 2, so the size-3 tab would extend past
    // the items. Sorting is not a layout request, so the tab follows the items down.
    const inv = bank([[0, 1618, 1], [2, 995, 5]]);
    assert.deepEqual(applyOps(inv, [3], [{ op: 'sort', tab: 1, by: 'id' }]), { ok: true, tabs: [2], changed: true });
    assert.deepEqual([0, 1, 2].map(s => inv.get(s)?.id), [995, 1618, undefined]);
});

test('sorting a tab that does not exist is refused', () => {
    const inv = bank([[0, 995, 1]]);
    assert.deepEqual(applyOps(inv, [], [{ op: 'sort', tab: 2, by: 'id' }]), { ok: false, error: 'bad_tab' });
    assert.deepEqual(applyOps(inv, [], [{ op: 'sort', tab: 10, by: 'id' }]), { ok: false, error: 'bad_tab' });
});

test('an obj this pack has never heard of sorts without throwing', () => {
    // ObjType.get is a bare array index, so 9999 (past ObjType.count) is undefined: a bank
    // written by another pack must still sort, with the stranger worth 0 and named ''.
    const inv = bank([[0, 9999, 1], [1, 995, 5]]);
    assert.equal(applyOps(inv, [2], [{ op: 'sort', tab: 1, by: 'value' }]).ok, true);
    assert.deepEqual([0, 1].map(s => inv.get(s)?.id), [995, 9999], 'the unknown obj is worth 0');
    assert.equal(applyOps(inv, [2], [{ op: 'sort', tab: 1, by: 'name' }]).ok, true);
    assert.deepEqual([0, 1].map(s => inv.get(s)?.id), [9999, 995], "the unknown obj is named ''");
    assert.equal(applyOps(inv, [2], [{ op: 'sort', tab: 1, by: 'id' }]).ok, true);
    assert.deepEqual([0, 1].map(s => inv.get(s)?.id), [995, 9999]);
});

test('a delta naming an obj this pack has never heard of is refused', () => {
    const inv = bank([[0, 995, 1]]);
    assert.deepEqual(applyOps(inv, [], [{ op: 'delta', obj: 9999, count: 1 }]), { ok: false, error: 'bad_op' });
    assert.deepEqual(applyOps(inv, [], [{ op: 'delta', obj: -1, count: -1 }]), { ok: false, error: 'bad_op' });
    assert.equal(inv.update, false);
});

test('delta adds and removes a stack, and refuses to overdraw', () => {
    const inv = bank([[0, 995, 100]]);
    assert.equal(applyOps(inv, [], [{ op: 'delta', obj: 995, count: -40 }]).ok, true);
    assert.equal(inv.getItemCount(995), 60);
    assert.deepEqual(applyOps(inv, [], [{ op: 'delta', obj: 995, count: -61 }]), { ok: false, error: 'insufficient' });
    assert.equal(inv.getItemCount(995), 60, 'the failed removal did not partially apply');
    assert.equal(applyOps(inv, [], [{ op: 'delta', obj: 995, count: 40 }]).ok, true);
    assert.equal(inv.getItemCount(995), 100);
});

test('delta refuses to overflow a full bank instead of dropping items on the floor', () => {
    const inv = Inventory.fromType(95);
    for (let slot = 0; slot < 240; slot++) inv.set(slot, { id: 1038, count: 1 });
    inv.resetTracking();
    assert.deepEqual(applyOps(inv, [], [{ op: 'delta', obj: 1618, count: 1 }]), { ok: false, error: 'full' });
    assert.equal(inv.update, false);
});

test('a delta that only changes a stack count in place still reports changed', () => {
    const inv = bank([[0, 995, 100]]);

    // Same obj, same slot, one different count. `changed` is MEASURED against the items the
    // batch started from, so it catches a change that moves nothing: SP8b's version economy
    // hangs on this flag, and a bank whose contents moved but whose layout did not must still
    // burn a version.
    assert.deepEqual(applyOps(inv, [1], [{ op: 'delta', obj: 995, count: -40 }]), { ok: true, tabs: [1], changed: true });
    assert.equal(inv.get(0)?.count, 60);
    assert.deepEqual(applyOps(inv, [1], [{ op: 'delta', obj: 995, count: 40 }]), { ok: true, tabs: [1], changed: true });
    assert.equal(inv.get(0)?.count, 100, 'and back again, at the same slot throughout');
});

test('a delta that shrinks the bank shrinks the tabs with it instead of failing', () => {
    const inv = bank([[0, 995, 100], [1, 1618, 1]]);
    const res = applyOps(inv, [1, 1], [{ op: 'delta', obj: 1618, count: -1 }]);
    assert.deepEqual(res, { ok: true, tabs: [1], changed: true });
    assert.equal(inv.get(1), null);
});

test('normaliseOp accepts the spec shorthand and rejects junk', () => {
    assert.deepEqual(normaliseOp({ obj: 995, delta: -5 }), { op: 'delta', obj: 995, count: -5 });
    assert.deepEqual(normaliseOp({ op: 'delta', obj: 995, count: 5 }), { op: 'delta', obj: 995, count: 5 });
    assert.deepEqual(normaliseOp({ op: 'swap', a: 1, b: 2 }), { op: 'swap', a: 1, b: 2 });
    assert.deepEqual(normaliseOp({ op: 'insert', from: 1, to: 2 }), { op: 'insert', from: 1, to: 2 });
    assert.deepEqual(normaliseOp({ op: 'moveToTab', slot: 1, tab: 2 }), { op: 'moveToTab', slot: 1, tab: 2 });
    assert.deepEqual(normaliseOp({ op: 'setTabs', sizes: [1, 2] }), { op: 'setTabs', sizes: [1, 2] });
    assert.deepEqual(normaliseOp({ op: 'sort', tab: 0, by: 'value' }), { op: 'sort', tab: 0, by: 'value' });
    for (const bad of [null, 42, {}, { op: 'nope' }, { op: 'swap', a: 1 }, { op: 'swap', a: 1.5, b: 2 }, { op: 'sort', tab: 0, by: 'colour' }, { op: 'setTabs', sizes: 'x' }, { op: 'setTabs', sizes: [1, 'x'] }, { op: 'delta', obj: 995, count: 0 }, { obj: 995, delta: 0 }, { op: 'delta', obj: 995 }, { op: 'delta', obj: 9999, count: 1 }, { obj: 9999, delta: 1 }, { op: 'delta', obj: -1, count: 1 }]) {
        assert.equal(normaliseOp(bad), null);
    }
});
