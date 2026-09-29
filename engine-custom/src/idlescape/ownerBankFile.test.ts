/**
 * The store's ON-DISK behaviour: what a file that does not fully validate does to the owner it
 * belongs to, the quarantine of one that cannot be parsed at all, and the write suspension both
 * of those leave behind. The counterpart of `src/idlescape/ownerBankFile.ts`; split out of
 * `ownerBank.test.ts` to keep both files under the project's 400-line limit, the same way
 * `ownerBankSweep.test.ts` was. The store under test is the same one.
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
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idlescape-bankfile-'));
    made.push(dir);
});

after(() => {
    for (const scratch of made) {
        fs.rmSync(scratch, { recursive: true, force: true });
    }
});

function quarantined(): string[] {
    return fs.readdirSync(dir).filter(name => name.endsWith('.corrupt'));
}

test('a corrupt bank file is quarantined rather than losing the world', () => {
    fs.writeFileSync(path.join(dir, 'uidBad.json'), '{ not json');
    const store = new OwnerBankStore(dir);
    assert.equal(store.get('uidBad').getItemCount(995), 0);
    assert.deepEqual(quarantined().length, 1);
    assert.equal(fs.readFileSync(path.join(dir, quarantined()[0]), 'utf8'), '{ not json');
});

test('a second corruption never overwrites the first quarantine', () => {
    const file = path.join(dir, 'uidBad.json');
    fs.writeFileSync(file, '{ first');
    new OwnerBankStore(dir).get('uidBad');
    fs.writeFileSync(file, '{ second');
    new OwnerBankStore(dir).get('uidBad');

    const names = quarantined();
    assert.equal(names.length, 2, 'both copies survive, the timestamp keeps them apart');
    assert.deepEqual(names.map(name => fs.readFileSync(path.join(dir, name), 'utf8')).sort(), ['{ first', '{ second']);
    for (const name of names) {
        assert.equal(name.includes(':'), false, 'no colon ever reaches a Windows path');
    }
});

test('when the corrupt file cannot be quarantined, every write for that owner is suspended', t => {
    const file = path.join(dir, 'uidBad.json');
    fs.writeFileSync(file, '{ not json');
    const original = fs.readFileSync(file);

    const realRename = fs.renameSync;
    t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
        if (String(to).endsWith('.corrupt')) {
            throw new Error('EPERM: quarantine refused');
        }
        realRename(from, to);
    });
    const write = t.mock.method(fs, 'writeFileSync');

    const store = new OwnerBankStore(dir);
    assert.equal(store.get('uidBad').getItemCount(995), 0, 'get still answers with a usable container');

    assert.deepEqual(store.apply('uidBad', null, [{ op: 'delta', obj: 995, count: 5 }]), { ok: false, reason: 'unavailable' });
    assert.equal(store.migrate('uidBad', 'alice', [{ slot: 0, obj: 995, count: 5 }]), 'refused');

    // an in-game mutation still tracks in memory, it just never reaches the file
    store.get('uidBad').add(1038, 1);
    assert.deepEqual(store.bumpDirty(), ['uidBad']);
    store.flush();

    assert.equal(write.mock.callCount(), 0, 'not one write was attempted for this owner');
    assert.deepEqual(fs.readdirSync(dir), ['uidBad.json'], 'no quarantine, no tmp file, no new bank');
    assert.deepEqual(fs.readFileSync(file), original, 'the only surviving copy is byte-for-byte untouched');
});

test('a file that is valid JSON but has bad slots loads short, warns, and is never rewritten', t => {
    const file = path.join(dir, 'uidPartial.json');
    const original = JSON.stringify({
        version: 4,
        tabs: [1],
        slots: [
            { slot: 0, obj: 995, count: 100 },
            { slot: 1, obj: 999999, count: 1 }, // an obj id this pack does not have
            { slot: 2, obj: 1038, count: 0 } // a non-positive count
        ],
        migrated: ['alice']
    });
    fs.writeFileSync(file, original);
    const error = t.mock.method(console, 'error', () => {});

    const store = new OwnerBankStore(dir);
    assert.equal(store.get('uidPartial').getItemCount(995), 100, 'the good slots still load');
    assert.equal(store.version('uidPartial'), 4);

    assert.equal(error.mock.callCount(), 1, 'the loss is named exactly once');
    const line = String(error.mock.calls[0].arguments[0]);
    assert.match(line, /uidPartial/, 'the owner is named');
    assert.match(line, /2/, 'and how many slots were dropped');
    store.get('uidPartial');
    assert.equal(error.mock.callCount(), 1, 'a second get does not re-warn');

    // The file is the only surviving record of whatever those slots were, so the store must not
    // write the short version back over it until an operator has looked: the same posture a
    // failed quarantine takes.
    store.get('uidPartial').add(995, 5);
    assert.deepEqual(store.bumpDirty(), ['uidPartial'], 'in-game play still works in memory');
    store.flush();
    assert.deepEqual(store.apply('uidPartial', null, [{ op: 'delta', obj: 995, count: 1 }]), { ok: false, reason: 'unavailable' });
    assert.equal(store.migrate('uidPartial', 'alice2', [{ slot: 9, obj: 995, count: 1 }]), 'refused');
    assert.equal(fs.readFileSync(file, 'utf8'), original, 'the surviving file is byte-for-byte untouched');
    assert.deepEqual(fs.readdirSync(dir), ['uidPartial.json'], 'and nothing new was written beside it');
});

test('a clean file loads with no warning and is writable as usual', t => {
    const file = path.join(dir, 'uidClean.json');
    fs.writeFileSync(file, JSON.stringify({ version: 2, tabs: [1], slots: [{ slot: 0, obj: 995, count: 7 }], migrated: [] }));
    const error = t.mock.method(console, 'error', () => {});

    const store = new OwnerBankStore(dir);
    store.get('uidClean').add(995, 1);
    store.bumpDirty();
    store.flush();

    assert.equal(error.mock.callCount(), 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).slots, [{ slot: 0, obj: 995, count: 8 }]);
});

test('evict never drops an owner whose writes are suspended, however idle it looks', t => {
    const file = path.join(dir, 'uidSuspended.json');
    fs.writeFileSync(file, JSON.stringify({ version: 1, tabs: [], slots: [{ slot: 0, obj: 999999, count: 1 }], migrated: [] }));
    t.mock.method(console, 'error', () => {});

    const store = new OwnerBankStore(dir);
    store.get('uidSuspended');

    // Nothing is dirty (the load rejected the only slot), so without an explicit check the
    // entry would be dropped, re-read on the next get and warn again, forever. Holding it back
    // keeps the suspension - and its one warning - for the life of the process.
    assert.equal(
        store.evict(() => false),
        0
    );
    assert.deepEqual(store.loaded(), ['uidSuspended']);
});
