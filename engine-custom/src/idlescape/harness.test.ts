// Proves the engine test harness itself: node:test through tsx resolves the package's "#/"
// import map, and the packed cache in data/pack can be loaded from a test process, so every
// other suite here can build real InvType/ObjType/Inventory objects instead of fakes.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';
import { Inventory } from '#/engine/Inventory.js';

test('the packed cache loads and the bank is inv 95, 240 slots, always-stack', () => {
    InvType.load('data/pack');
    ObjType.load('data/pack');

    const bank = InvType.getId('bank');
    assert.equal(bank, 95);

    const inv = Inventory.fromType(bank);
    assert.equal(inv.capacity, 240);
    assert.equal(inv.stackType, Inventory.ALWAYS_STACK);

    inv.add(995, 100);
    assert.equal(inv.getItemCount(995), 100);
    assert.equal(ObjType.get(995).name, 'Coins');
    assert.equal(inv.update, true);
    inv.resetTracking();
    assert.equal(inv.update, false);
});
