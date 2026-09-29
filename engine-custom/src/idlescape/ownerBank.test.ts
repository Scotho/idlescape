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
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idlescape-banks-'));
    made.push(dir);
});

after(() => {
    for (const scratch of made) {
        fs.rmSync(scratch, { recursive: true, force: true });
    }
});

test('a fresh owner gets an empty 240-slot container at version 0', () => {
    const store = new OwnerBankStore(dir);
    const inv = store.get('uidA');
    assert.equal(inv.capacity, 240);
    assert.equal(store.version('uidA'), 0);
    assert.deepEqual(store.snapshot('uidA'), { ownerKey: 'uidA', version: 0, capacity: 240, tabs: [], slots: [] });
});

test('every character of one owner gets the same container object', () => {
    const store = new OwnerBankStore(dir);
    assert.equal(store.get('uidA'), store.get('uidA'));
    assert.notEqual(store.get('uidA'), store.get('uidB'));
});

test('a mutation bumps the version once per bumpDirty, and flush writes a versioned file', () => {
    const store = new OwnerBankStore(dir);
    store.get('uidA').add(995, 500);
    assert.deepEqual(store.bumpDirty(), ['uidA']);
    assert.equal(store.version('uidA'), 1);
    assert.deepEqual(store.bumpDirty(), [], 'a second sweep with no change bumps nothing');

    store.flush();
    const file = JSON.parse(fs.readFileSync(path.join(dir, 'uidA.json'), 'utf8'));
    assert.equal(file.version, 1);
    assert.deepEqual(file.slots, [{ slot: 0, obj: 995, count: 500 }]);
    assert.deepEqual(file.tabs, []);
});

test('a second store instance reads the file back, slots, tabs, version and all', () => {
    const first = new OwnerBankStore(dir);
    first.get('uidA').add(995, 500);
    first.bumpDirty();
    first.setTabs('uidA', [1]);
    first.flush();

    const second = new OwnerBankStore(dir);
    assert.equal(second.get('uidA').getItemCount(995), 500);
    assert.deepEqual(second.tabs('uidA'), [1]);
    assert.equal(second.version('uidA'), 1);
});

test('apply honours expectedVersion and answers a stale one with conflict', () => {
    const store = new OwnerBankStore(dir);
    store.get('uidA').add(995, 100);
    store.bumpDirty(); // version 1

    assert.deepEqual(store.apply('uidA', 0, [{ op: 'delta', obj: 995, count: -50 }]), { ok: false, reason: 'conflict', version: 1 });
    assert.equal(store.get('uidA').getItemCount(995), 100, 'a conflict changes nothing');

    assert.deepEqual(store.apply('uidA', 1, [{ op: 'delta', obj: 995, count: -50 }]), { ok: true, version: 2 });
    assert.equal(store.get('uidA').getItemCount(995), 50);

    assert.deepEqual(store.apply('uidA', null, [{ op: 'delta', obj: 995, count: -50 }]), { ok: true, version: 3 });
});

test('a rejected op leaves the version and the contents alone', () => {
    const store = new OwnerBankStore(dir);
    store.get('uidA').add(995, 10);
    store.bumpDirty();
    assert.deepEqual(store.apply('uidA', 1, [{ op: 'delta', obj: 995, count: -11 }]), { ok: false, reason: 'insufficient' });
    assert.equal(store.version('uidA'), 1);
    assert.equal(store.get('uidA').getItemCount(995), 10);
});

test('apply persists immediately, so an offline owner survives a crash', () => {
    const store = new OwnerBankStore(dir);
    assert.deepEqual(store.apply('uidOffline', null, [{ op: 'delta', obj: 995, count: 25 }]), { ok: true, version: 1 });
    const file = JSON.parse(fs.readFileSync(path.join(dir, 'uidOffline.json'), 'utf8'));
    assert.deepEqual(file.slots, [{ slot: 0, obj: 995, count: 25 }]);
});

test('apply persists the tabs applyOps returns, not the ones it was handed', () => {
    const store = new OwnerBankStore(dir);

    // A setTabs states a layout the store never held: the returned array is the one kept.
    const first = store.apply('uidA', null, [
        { op: 'delta', obj: 995, count: 10 },
        { op: 'delta', obj: 1038, count: 1 },
        { op: 'setTabs', sizes: [2] }
    ]);
    assert.deepEqual(first, { ok: true, version: 1 });
    assert.deepEqual(store.tabs('uidA'), [2]);
    assert.deepEqual(store.snapshot('uidA').tabs, [2]);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'uidA.json'), 'utf8')).tabs, [2]);

    // A delta that empties the last used slot clamps the tabs down onto the items, and it is
    // that clamped array the store records, not the [2] it passed in.
    assert.deepEqual(store.apply('uidA', 1, [{ op: 'delta', obj: 1038, count: -1 }]), { ok: true, version: 2 });
    assert.deepEqual(store.tabs('uidA'), [1]);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'uidA.json'), 'utf8')).tabs, [1]);
});

test('setTabs from the in-game varps is recorded and bumps the version through bumpDirty', () => {
    const store = new OwnerBankStore(dir);
    store.get('uidA').add(995, 1);
    store.bumpDirty();
    store.setTabs('uidA', [1]);
    assert.deepEqual(store.bumpDirty(), ['uidA']);
    assert.deepEqual(store.tabs('uidA'), [1]);
});

test('a write reaches disk as a tmp file and one atomic rename', t => {
    const store = new OwnerBankStore(dir);
    store.get('uidA').add(995, 1);
    store.bumpDirty();

    const write = t.mock.method(fs, 'writeFileSync');
    const rename = t.mock.method(fs, 'renameSync');
    store.flush();

    assert.equal(write.mock.callCount(), 1);
    assert.equal(write.mock.calls[0].arguments[0], path.join(dir, 'uidA.json.tmp'));
    assert.equal(rename.mock.callCount(), 1);
    assert.equal(rename.mock.calls[0].arguments[0], path.join(dir, 'uidA.json.tmp'));
    assert.equal(rename.mock.calls[0].arguments[1], path.join(dir, 'uidA.json'));
    assert.deepEqual(fs.readdirSync(dir), ['uidA.json'], 'the tmp file never survives the write');
});

test('flush writes only the owners that are dirty', t => {
    const store = new OwnerBankStore(dir);
    store.get('uidA').add(995, 1);
    store.get('uidB');
    store.bumpDirty();
    store.flush();
    assert.deepEqual(fs.readdirSync(dir), ['uidA.json'], 'an untouched owner is never written');

    const write = t.mock.method(fs, 'writeFileSync');
    store.flush();
    assert.equal(write.mock.callCount(), 0, 'a second flush with nothing dirty writes nothing');
});

test('flush is best-effort per owner: one throwing write does not cost the owners after it', t => {
    const store = new OwnerBankStore(dir);
    store.get('uidA').add(995, 1);
    store.get('uidB').add(995, 2);
    store.bumpDirty();

    const original = fs.writeFileSync as (...args: unknown[]) => void;
    const error = t.mock.method(console, 'error', () => {});
    t.mock.method(fs, 'writeFileSync', (...args: unknown[]) => {
        const target = args[0];
        if (typeof target === 'string' && target.endsWith('uidA.json.tmp')) {
            throw new Error('ENOSPC: no space left on device');
        }
        original(...args);
    });

    assert.doesNotThrow(() => store.flush());
    assert.equal(error.mock.callCount(), 1, 'the failing owner is logged once, not thrown');
    assert.equal(fs.existsSync(path.join(dir, 'uidA.json')), false, 'the owner that failed to write has no file');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'uidB.json'), 'utf8')).slots, [{ slot: 0, obj: 995, count: 2 }], 'the owner after it in insertion order is still written');
});

test('migration merges a .sav bank once per character, first character keeping slot order', () => {
    const store = new OwnerBankStore(dir);
    assert.equal(
        store.migrate('uidA', 'alice', [
            { slot: 3, obj: 995, count: 100 },
            { slot: 0, obj: 1038, count: 1 }
        ]),
        'merged'
    );
    assert.equal(store.get('uidA').get(3)?.id, 995);
    assert.equal(store.get('uidA').get(0)?.id, 1038);

    // the same character logging in again never re-merges, and says so distinguishably: an
    // 'already' must never be read as the 'refused' that keeps the .sav bank alive.
    assert.equal(store.migrate('uidA', 'alice', [{ slot: 0, obj: 1038, count: 1 }]), 'already');
    assert.equal(store.get('uidA').getItemCount(1038), 1);

    // a second character's bank is appended, stacking where it can and filling holes otherwise
    assert.equal(
        store.migrate('uidA', 'bob', [
            { slot: 0, obj: 995, count: 50 },
            { slot: 1, obj: 1618, count: 2 }
        ]),
        'merged'
    );
    assert.equal(store.get('uidA').getItemCount(995), 150);
    assert.equal(store.get('uidA').getItemCount(1618), 2);

    store.flush();
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'uidA.json'), 'utf8')).migrated, ['alice', 'bob']);
});

test('a migration that would overflow the container is refused whole, dropping nothing', () => {
    const store = new OwnerBankStore(dir, 3);
    assert.equal(
        store.migrate('uidC', 'alice', [
            { slot: 0, obj: 995, count: 1 },
            { slot: 1, obj: 1038, count: 1 },
            { slot: 2, obj: 1618, count: 2 }
        ]),
        'merged'
    );

    assert.equal(store.migrate('uidC', 'bob', [{ slot: 0, obj: 1619, count: 1 }]), 'refused', 'no free slot left for a new obj');
    assert.equal(store.get('uidC').getItemCount(1619), 0, 'nothing of the refused bank landed');
    assert.equal(store.get('uidC').getItemCount(995), 1, 'and nothing already there was disturbed');
    store.flush();
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'uidC.json'), 'utf8')).migrated, ['alice'], 'a refused character is not recorded, so its .sav stays the source of truth');

    // the same character retries later with a bank that does fit, and is merged then
    assert.equal(store.migrate('uidC', 'bob', [{ slot: 0, obj: 995, count: 5 }]), 'merged');
    assert.equal(store.get('uidC').getItemCount(995), 6);
    store.flush();
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'uidC.json'), 'utf8')).migrated, ['alice', 'bob']);
});

test('a bad owner key never reaches the filesystem', () => {
    const store = new OwnerBankStore(dir);
    for (const bad of ['../escape', 'a/b', '', 'x'.repeat(65), 'a b']) {
        assert.throws(() => store.get(bad), /owner key/);
        assert.throws(() => store.snapshot(bad), /owner key/);
        assert.throws(() => store.apply(bad, null, [{ op: 'delta', obj: 995, count: 1 }]), /owner key/);
        assert.throws(() => store.migrate(bad, 'alice', []), /owner key/);
    }
    assert.deepEqual(fs.readdirSync(dir), [], 'no path was ever built from a bad key');
    assert.deepEqual(store.loaded(), []);
});

test('a migration naming an obj this pack does not have is refused whole', () => {
    const store = new OwnerBankStore(dir);
    assert.equal(
        store.migrate('uidA', 'alice', [
            { slot: 0, obj: 995, count: 5 },
            { slot: 1, obj: 999999, count: 1 }
        ]),
        'refused'
    );
    assert.equal(store.get('uidA').getItemCount(995), 0, 'the whole batch is refused, not just the bad entry');
    assert.equal(fs.existsSync(path.join(dir, 'uidA.json')), false, 'and nothing was written');

    assert.equal(store.migrate('uidA', 'alice', [{ slot: 0, obj: -1, count: 1 }]), 'refused', 'a negative obj id is refused too');

    // the username was never recorded, so the character migrates once its .sav is cleaned up
    assert.equal(store.migrate('uidA', 'alice', [{ slot: 0, obj: 995, count: 5 }]), 'merged');
    assert.equal(store.get('uidA').getItemCount(995), 5);
});

test('a bare setTabs is durable on the next flush, with no item change to carry it', () => {
    const store = new OwnerBankStore(dir);
    store.get('uidA').add(995, 3);
    store.bumpDirty();
    store.flush();

    store.setTabs('uidA', [1]);
    store.flush(); // no bumpDirty in between
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'uidA.json'), 'utf8')).tabs, [1]);
});

test('a batch that changes nothing burns no version and writes no file', () => {
    const store = new OwnerBankStore(dir);
    assert.deepEqual(store.apply('uidA', null, []), { ok: true, version: 0 }, 'an empty batch');
    assert.equal(store.version('uidA'), 0);
    assert.equal(fs.existsSync(path.join(dir, 'uidA.json')), false);

    store.get('uidA').add(995, 5);
    store.bumpDirty();
    store.flush();
    assert.deepEqual(store.apply('uidA', 1, [{ op: 'swap', a: 0, b: 0 }]), { ok: true, version: 1 }, 'a swap of a slot with itself');
    assert.equal(store.version('uidA'), 1);
});

test('evict drops containers nobody is using and keeps the ones the predicate holds', () => {
    const store = new OwnerBankStore(dir);
    store.get('uidA');
    store.get('uidB').add(995, 1);
    store.bumpDirty();
    store.flush();
    assert.equal(
        store.evict(key => key === 'uidB'),
        1
    );
    assert.deepEqual(store.loaded(), ['uidB']);
});

test('evict never drops an owner with unsaved work, and a re-read owner keeps its version', () => {
    const store = new OwnerBankStore(dir);
    store.get('uidA').add(995, 1);
    store.bumpDirty();
    assert.equal(
        store.evict(() => false),
        0,
        'a dirty owner is held back even when nothing keeps it'
    );

    store.flush();
    assert.equal(
        store.evict(() => false),
        1
    );
    assert.deepEqual(store.loaded(), []);
    assert.equal(store.version('uidA'), 1, 'the version comes back from disk, never restarting at 0');
    assert.equal(store.get('uidA').getItemCount(995), 1);
});
