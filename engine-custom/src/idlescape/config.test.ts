import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { loadIdlescapeConfig } from './config.js';

test('defaults are safe: no secret, owner not required in dev, loopback management', () => {
    const c = loadIdlescapeConfig({}, null, false);
    assert.equal(c.ownerSecret, '');
    assert.equal(c.managementSecret, '');
    assert.equal(c.requireOwner, false);
    assert.equal(c.bankDir, 'data/banks');
    assert.equal(c.hookUrl, null);
    assert.equal(c.managementHost, '127.0.0.1');
    assert.equal(c.devStaffLevel, 0);
    assert.deepEqual(c.staff, {});
});

test('production forces requireOwner on and refuses the dev staff override', () => {
    const c = loadIdlescapeConfig({ IDLESCAPE_DEV_STAFF: '4', OWNER_ASSERTION_SECRET: 's'.repeat(32) }, null, true);
    assert.equal(c.requireOwner, true);
    assert.equal(c.devStaffLevel, 0);
});

test('a production world with no owner secret refuses to start', () => {
    // requireOwner is forced on in production, so an empty secret is not "owner binding off",
    // it is "every login is verified against the empty string and refused". Refusing to start
    // is the visible failure; refusing every player one at a time is the invisible one.
    assert.throws(() => loadIdlescapeConfig({}, null, true), /OWNER_ASSERTION_SECRET/);
    // Same world, same emptiness, arriving from the config file rather than the environment.
    assert.throws(() => loadIdlescapeConfig({}, JSON.stringify({ ownerSecret: '' }), true), /OWNER_ASSERTION_SECRET/);
});

test('a production world takes the owner secret from either source and starts', () => {
    assert.equal(loadIdlescapeConfig({ OWNER_ASSERTION_SECRET: 's'.repeat(32) }, null, true).ownerSecret, 's'.repeat(32));
    assert.equal(loadIdlescapeConfig({}, JSON.stringify({ ownerSecret: 'f'.repeat(32) }), true).ownerSecret, 'f'.repeat(32));
});

test('a dev world with no owner secret is still a working world', () => {
    // The floor is production-only: local dev has requireOwner false and no secret, and that
    // must keep loading rather than throwing.
    const c = loadIdlescapeConfig({}, null, false);
    assert.equal(c.ownerSecret, '');
    assert.equal(c.requireOwner, false);
});

test('dev honours the staff override only when a secret-free dev world asks for it', () => {
    const c = loadIdlescapeConfig({ IDLESCAPE_DEV_STAFF: '4' }, null, false);
    assert.equal(c.devStaffLevel, 4);
});

test('env beats the config file, and the file supplies the rest', () => {
    const file = JSON.stringify({
        ownerSecret: 'from-file',
        requireOwner: true,
        bankDir: 'data/other',
        hookUrl: 'http://127.0.0.1:8787/internal/bank-changed',
        staff: { admin: 2 }
    });
    const c = loadIdlescapeConfig({ OWNER_ASSERTION_SECRET: 'from-env' }, file, false);
    assert.equal(c.ownerSecret, 'from-env');
    assert.equal(c.requireOwner, true);
    assert.equal(c.bankDir, 'data/other');
    assert.equal(c.hookUrl, 'http://127.0.0.1:8787/internal/bank-changed');
    assert.deepEqual(c.staff, { admin: 2 });
});

test('the management secret comes from the name the front server reads', () => {
    // server/src/env.ts reads ENGINE_MANAGEMENT_SECRET; scripts/start-stack.ps1 exports the
    // same server/.env line into the engine process, so the two halves share one value.
    assert.equal(loadIdlescapeConfig({ ENGINE_MANAGEMENT_SECRET: 'm'.repeat(32) }, null, false).managementSecret, 'm'.repeat(32));
    assert.equal(loadIdlescapeConfig({}, JSON.stringify({ managementSecret: 'from-file' }), false).managementSecret, 'from-file');
    assert.equal(loadIdlescapeConfig({ ENGINE_MANAGEMENT_SECRET: 'from-env' }, JSON.stringify({ managementSecret: 'from-file' }), false).managementSecret, 'from-env');
    // It is NOT the owner assertion secret: two different secrets, two different jobs.
    assert.equal(loadIdlescapeConfig({ OWNER_ASSERTION_SECRET: 'o'.repeat(32) }, null, false).managementSecret, '');
});

test('a corrupt config file is ignored rather than fatal', () => {
    const c = loadIdlescapeConfig({}, '{ not json', false);
    assert.equal(c.bankDir, 'data/banks');
});

test('.env.example documents every variable the config reads', () => {
    // Audit C17: the overlay was the one process in the repository shipping no template. This
    // file is copied into engine/server/src/idlescape/ by the overlay, so from its runtime
    // location the repository root is four directories up.
    const root = path.resolve(import.meta.dirname, '..', '..', '..', '..');
    const template = fs.readFileSync(path.join(root, 'engine-custom', '.env.example'), 'utf8');
    const source = fs.readFileSync(path.join(root, 'engine-custom', 'src', 'idlescape', 'config.ts'), 'utf8');

    const documented = new Set(
        template.split(/\r?\n/)
            .map(l => /^([A-Z][A-Z0-9_]*)=/.exec(l))
            .filter(m => m !== null)
            .map(m => m![1])
    );
    const read = new Set<string>();
    for (const m of source.matchAll(/env\.([A-Z][A-Z0-9_]*)/g)) {
        read.add(m[1]!);
    }

    assert.ok(read.size >= 7, `expected at least 7 env reads in config.ts, found ${read.size}`);
    assert.deepEqual([...read].filter(k => !documented.has(k)).sort(), []);
});
