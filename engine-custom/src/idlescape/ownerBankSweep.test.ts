/**
 * The version/sweep contract between the external write path (`apply`) and the once-per-tick
 * `bumpDirty()` sweep. Split out of `ownerBank.test.ts` to keep both files under the project's
 * 400-line limit; the store under test is the same one.
 */
import { test, after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';

import { OwnerBankStore } from './ownerBank.js';

let dir = '';
const made: string[] = [];

before(() => {
    InvType.load('data/pack');
    ObjType.load('data/pack');
});

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idlescape-sweep-'));
    made.push(dir);
});

after(() => {
    for (const scratch of made) {
        fs.rmSync(scratch, { recursive: true, force: true });
    }
});

test('apply bumps the version synchronously, and the next sweep does not bump it again', () => {
    const store = new OwnerBankStore(dir);
    assert.equal(store.version('uidA'), 0);
    assert.deepEqual(store.apply('uidA', null, [{ op: 'delta', obj: 995, count: 5 }]), { ok: true, version: 1 });
    assert.equal(store.version('uidA'), 1, 'version() reports the bump immediately');
    assert.equal(store.snapshot('uidA').version, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'uidA.json'), 'utf8')).version, 1);

    // The container is left dirty on purpose, so an online client still gets its inv diff, and
    // the sweep runs after client output has written it. A one-shot flag on the entry consumes
    // that dirt instead of bumping a second time: the number apply RETURNED has to stay usable
    // as the caller's next expectedVersion, or every item-moving web op would 409 forever.
    assert.deepEqual(store.bumpDirty(), []);
    assert.equal(store.version('uidA'), 1);
    assert.equal(store.get('uidA').update, false, 'the sweep still reset the tracking');
    assert.deepEqual(store.bumpDirty(), []);
});

test('externallyApplied reports the armed owners without disarming them', () => {
    const store = new OwnerBankStore(dir);
    assert.deepEqual([...store.externallyApplied()], []);

    store.apply('uidArmed', null, [{ op: 'delta', obj: 995, count: 5 }]);
    assert.deepEqual([...store.externallyApplied()], ['uidArmed']);
    assert.deepEqual([...store.externallyApplied()], ['uidArmed'], 'reading it twice does not consume it');

    // The post-cycle hook reads this to know whose tab layout to push OUT for one tick instead
    // of reading the online characters' still-stale varps in; bumpDirty stays the only consumer.
    assert.deepEqual(store.bumpDirty(), []);
    assert.deepEqual([...store.externallyApplied()], []);
});

test('a setTabs-only apply and an item-moving apply behave identically at the next sweep', () => {
    const store = new OwnerBankStore(dir);

    // Same starting bank for both owners, so the only difference is the shape of the batch.
    for (const owner of ['uidTabs', 'uidMove']) {
        assert.deepEqual(
            store.apply(owner, null, [
                { op: 'delta', obj: 995, count: 5 },
                { op: 'delta', obj: 1038, count: 1 }
            ]),
            { ok: true, version: 1 }
        );
    }
    assert.deepEqual(store.bumpDirty(), []);

    // A setTabs never touched inv.update, so it was never double-bumped; a swap does, and used
    // to be. Both now land on the version their own apply returned.
    assert.deepEqual(store.apply('uidTabs', 1, [{ op: 'setTabs', sizes: [1] }]), { ok: true, version: 2 });
    assert.deepEqual(store.apply('uidMove', 1, [{ op: 'swap', a: 0, b: 1 }]), { ok: true, version: 2 });

    assert.deepEqual(store.bumpDirty(), [], 'neither shape is bumped a second time');
    assert.equal(store.version('uidTabs'), 2);
    assert.equal(store.version('uidMove'), 2);
});

test('an in-game change in the tick after an apply still bumps normally', () => {
    const store = new OwnerBankStore(dir);
    assert.deepEqual(store.apply('uidA', null, [{ op: 'delta', obj: 995, count: 5 }]), { ok: true, version: 1 });
    assert.deepEqual(store.bumpDirty(), [], 'the apply consumed its own dirt');

    store.get('uidA').add(995, 10); // a RuneScript deposit, one tick later
    assert.deepEqual(store.bumpDirty(), ['uidA']);
    assert.equal(store.version('uidA'), 2);

    store.flush();
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'uidA.json'), 'utf8')).version, 2);
});

test('a RuneScript change in the SAME tick is folded into the apply version, and still persisted', () => {
    const store = new OwnerBankStore(dir);
    assert.deepEqual(store.apply('uidA', null, [{ op: 'delta', obj: 995, count: 5 }]), { ok: true, version: 1 });

    // Between the external write and the sweep, a script deposits into the shared container.
    // The sweep cannot tell the two changes apart, so it folds this one into the apply's
    // version rather than guessing - the trade-off recorded in PATCHES.md.
    store.get('uidA').add(1038, 1);
    assert.deepEqual(store.bumpDirty(), []);
    assert.equal(store.version('uidA'), 1);

    // The file is still marked dirty, so nothing is lost: the next flush writes both changes.
    store.flush();
    const file = JSON.parse(fs.readFileSync(path.join(dir, 'uidA.json'), 'utf8'));
    assert.equal(file.version, 1);
    assert.deepEqual(file.slots, [
        { slot: 0, obj: 995, count: 5 },
        { slot: 1, obj: 1038, count: 1 }
    ]);
});
