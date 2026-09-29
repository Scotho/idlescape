import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Fastify from 'fastify';
import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';

import { authorised, parseApplyBody, registerOwnerBankRoutes, registerSetupGuard } from './management.js';
import { ownerBanks } from './install.js';

// ONE directory for the whole file: install.ts's ownerBanks() memoises the store on its first
// call, so the bank directory is fixed the first time a route is hit and a per-test mkdtemp
// would only be the directory the assertions look in, not the one the store writes to. Every
// test below uses its own owner key instead, which is what keeps them independent.
const BANK_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'idlescape-mgmt-'));
const SECRET = 's'.repeat(32);
const AUTH = { 'x-idlescape-mgmt': SECRET };

before(() => {
    process.env.IDLESCAPE_BANK_DIR = BANK_DIR;
    InvType.load('data/pack');
    ObjType.load('data/pack');
});

function app() {
    const f = Fastify();
    registerOwnerBankRoutes(f, SECRET);
    return f;
}

test('authorised is a constant-time exact match and refuses an empty secret', () => {
    assert.equal(authorised('abc', 'abc'), true);
    assert.equal(authorised('abcd', 'abc'), false);
    assert.equal(authorised(undefined, 'abc'), false);
    assert.equal(authorised(['abc'], 'abc'), false);
    assert.equal(authorised('', ''), false);
    // A non-ASCII header is a clean false, never a timingSafeEqual length throw turned into a 500.
    assert.equal(authorised('éé', 'ab'), false);
});

test('parseApplyBody normalises ops and rejects junk', () => {
    assert.deepEqual(parseApplyBody({ expectedVersion: 3, ops: [{ obj: 995, delta: -5 }] }), { ok: true, expectedVersion: 3, ops: [{ op: 'delta', obj: 995, count: -5 }] });
    assert.deepEqual(parseApplyBody({ ops: [] }), { ok: true, expectedVersion: null, ops: [] });
    assert.deepEqual(parseApplyBody({ expectedVersion: null, ops: [] }), { ok: true, expectedVersion: null, ops: [] });
    assert.equal(parseApplyBody({ ops: [{ op: 'nope' }] }).ok, false);
    assert.equal(parseApplyBody({ ops: 'x' }).ok, false);
    assert.equal(parseApplyBody(null).ok, false);
    assert.equal(parseApplyBody({ expectedVersion: -1, ops: [] }).ok, false);
    assert.equal(parseApplyBody({ ops: new Array(201).fill({ op: 'swap', a: 0, b: 1 }) }).ok, false);
});

test('GET returns an empty bank for an owner that has never banked', async () => {
    const res = await app().inject({ method: 'GET', url: '/owner/uidA/bank', headers: AUTH });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { ownerKey: 'uidA', version: 0, capacity: 240, tabs: [], slots: [] });
});

test('both routes refuse a missing or wrong management header', async () => {
    const f = app();
    assert.equal((await f.inject({ method: 'GET', url: '/owner/uidA/bank' })).statusCode, 401);
    assert.equal((await f.inject({ method: 'POST', url: '/owner/uidA/bank/apply', payload: { ops: [] }, headers: { 'x-idlescape-mgmt': 'nope' } })).statusCode, 401);
});

test('a traversal-shaped owner key is refused before it reaches the filesystem', async () => {
    const res = await app().inject({ method: 'GET', url: '/owner/..%2Fescape/bank', headers: AUTH });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: 'bad_key' });
});

test('apply moves items for an offline owner and returns the new version', async () => {
    const f = app();
    const res = await f.inject({ method: 'POST', url: '/owner/uidOffline/bank/apply', headers: AUTH, payload: { expectedVersion: 0, ops: [{ obj: 995, delta: 250 }] } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { ownerKey: 'uidOffline', version: 1 });

    const read = await f.inject({ method: 'GET', url: '/owner/uidOffline/bank', headers: AUTH });
    assert.deepEqual(read.json().slots, [{ slot: 0, obj: 995, count: 250 }]);
    assert.equal(fs.existsSync(path.join(BANK_DIR, 'uidOffline.json')), true);
});

test('a stale expectedVersion gets 409 with the current version and changes nothing', async () => {
    const f = app();
    await f.inject({ method: 'POST', url: '/owner/uidC/bank/apply', headers: AUTH, payload: { expectedVersion: 0, ops: [{ obj: 995, delta: 10 }] } });
    const res = await f.inject({ method: 'POST', url: '/owner/uidC/bank/apply', headers: AUTH, payload: { expectedVersion: 0, ops: [{ obj: 995, delta: 10 }] } });
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.json(), { error: 'version', version: 1 });
    assert.equal(ownerBanks().get('uidC').getItemCount(995), 10);
});

test('an unsatisfiable op gets 422 and leaves the version alone', async () => {
    const f = app();
    await f.inject({ method: 'POST', url: '/owner/uidD/bank/apply', headers: AUTH, payload: { ops: [{ obj: 995, delta: 10 }] } });
    const res = await f.inject({ method: 'POST', url: '/owner/uidD/bank/apply', headers: AUTH, payload: { expectedVersion: 1, ops: [{ obj: 995, delta: -11 }] } });
    assert.equal(res.statusCode, 422);
    assert.deepEqual(res.json(), { error: 'insufficient' });
    assert.equal(ownerBanks().version('uidD'), 1);
});

test('a malformed op batch gets 400 bad_ops, not a 422', async () => {
    const res = await app().inject({ method: 'POST', url: '/owner/uidD/bank/apply', headers: AUTH, payload: { ops: [{ op: 'nope' }] } });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: 'bad_ops' });
});

test('layout ops apply and are reflected in tabs', async () => {
    const f = app();
    await f.inject({ method: 'POST', url: '/owner/uidE/bank/apply', headers: AUTH, payload: { ops: [{ obj: 995, delta: 1 }, { obj: 1038, delta: 1 }] } });
    const res = await f.inject({ method: 'POST', url: '/owner/uidE/bank/apply', headers: AUTH, payload: { expectedVersion: 1, ops: [{ op: 'setTabs', sizes: [1] }] } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual((await f.inject({ method: 'GET', url: '/owner/uidE/bank', headers: AUTH })).json().tabs, [1]);
});

test("an owner whose writes the store has suspended gets 503, the front server's 'unavailable'", async () => {
    // noWrite is only reachable through a bank file that can be neither read nor renamed, which
    // no portable test can stage on Windows; the store's refusal is stubbed instead, since what
    // is under test here is the mapping of that refusal onto a status code.
    const store = ownerBanks();
    const real = store.apply.bind(store);
    store.apply = () => ({ ok: false, reason: 'unavailable' });
    try {
        const res = await app().inject({ method: 'POST', url: '/owner/uidF/bank/apply', headers: AUTH, payload: { ops: [{ obj: 995, delta: 1 }] } });
        assert.equal(res.statusCode, 503);
        assert.deepEqual(res.json(), { error: 'unavailable' });
    } finally {
        store.apply = real;
    }
});

test('with no secret configured the routes are not registered at all', async () => {
    const f = Fastify();
    registerOwnerBankRoutes(f, '');
    assert.equal((await f.inject({ method: 'GET', url: '/owner/uidA/bank', headers: AUTH })).statusCode, 404);
    assert.equal((await f.inject({ method: 'POST', url: '/owner/uidA/bank/apply', headers: AUTH, payload: { ops: [] } })).statusCode, 404);
});

test('the health route answers only for the configured secret', async () => {
    const f = app();
    const ok = await f.inject({ method: 'GET', url: '/owner/health', headers: AUTH });
    assert.equal(ok.statusCode, 200);
    assert.deepEqual(ok.json(), { ok: true });
    // Never the secret, never a hint at its length: the status IS the evidence.
    assert.equal(ok.body.includes(SECRET), false);

    assert.equal((await f.inject({ method: 'GET', url: '/owner/health' })).statusCode, 401);
    assert.equal((await f.inject({ method: 'GET', url: '/owner/health', headers: { 'x-idlescape-mgmt': 'nope' } })).statusCode, 401);
});

test('a world with no secret registers no health route at all', async () => {
    const f = Fastify();
    registerOwnerBankRoutes(f, '');
    // 404 rather than 401: an engine that started without a secret is a different failure from one
    // that holds a different secret, and the front server's health field tells them apart.
    assert.equal((await f.inject({ method: 'GET', url: '/owner/health', headers: AUTH })).statusCode, 404);
});

test('the setup guard refuses every /setup path and leaves /prometheus open', async () => {
    const f = Fastify();
    registerSetupGuard(f, SECRET);
    f.get('/prometheus', async () => 'metrics');
    f.get('/setup', async () => 'page');
    f.get('/setup/config', async () => ({ db: { pass: 'secret' } }));
    f.put('/setup/config', async () => ({ ok: true }));

    assert.equal((await f.inject({ method: 'GET', url: '/prometheus' })).statusCode, 200);
    assert.equal((await f.inject({ method: 'GET', url: '/setup' })).statusCode, 401);
    assert.equal((await f.inject({ method: 'GET', url: '/setup/config' })).statusCode, 401);
    assert.equal((await f.inject({ method: 'PUT', url: '/setup/config', payload: {} })).statusCode, 401);
    // The body of a refusal must not leak what it was guarding.
    const refused = await f.inject({ method: 'GET', url: '/setup/config' });
    assert.equal(refused.body.includes('pass'), false);

    assert.equal((await f.inject({ method: 'GET', url: '/setup', headers: AUTH })).statusCode, 200);
    assert.equal((await f.inject({ method: 'GET', url: '/setup/config', headers: AUTH })).statusCode, 200);
    // A query string or a trailing path must not slip past the prefix match. The bare page with a
    // query string is the one that needs the split: '/setup?x=1' is neither equal to '/setup' nor
    // a '/setup/' prefix, so matching on req.url whole would wave it straight through.
    assert.equal((await f.inject({ method: 'GET', url: '/setup/config?x=1' })).statusCode, 401);
    assert.equal((await f.inject({ method: 'GET', url: '/setup?x=1' })).statusCode, 401);
});

test('a world with no secret has no setup page either', async () => {
    const f = Fastify();
    registerSetupGuard(f, '');
    f.get('/setup', async () => 'page');
    // authorised() refuses an empty configured secret, so a local world without one loses the
    // page rather than serving it to anyone. Edit data/config/world.json directly instead.
    assert.equal((await f.inject({ method: 'GET', url: '/setup', headers: AUTH })).statusCode, 401);
});
