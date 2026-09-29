import { test } from 'node:test';
import assert from 'node:assert/strict';

import { staffLevelFor } from './staff.js';

test('everyone is level 0 by default, in dev and in production', () => {
    assert.equal(staffLevelFor('bob', false, 0, {}), 0);
    assert.equal(staffLevelFor('bob', true, 0, {}), 0);
});

test('the allow-list applies in both modes and is case-insensitive', () => {
    assert.equal(staffLevelFor('Admin', true, 0, { admin: 2 }), 2);
    assert.equal(staffLevelFor('admin', false, 0, { admin: 2 }), 2);
});

test('the dev override applies only outside production and never beats a higher allow-list entry', () => {
    assert.equal(staffLevelFor('bob', false, 4, {}), 4);
    assert.equal(staffLevelFor('bob', true, 4, {}), 0);
    assert.equal(staffLevelFor('admin', false, 1, { admin: 3 }), 3);
});

test('an out-of-range allow-list value cannot exceed 4 or go negative', () => {
    assert.equal(staffLevelFor('x', false, 0, { x: 99 }), 4);
    assert.equal(staffLevelFor('x', false, 0, { x: -1 }), 0);
});
