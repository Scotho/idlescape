import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadEnv } from './env';

const base = {
  PORT: '8787',
  ENGINE_HTTP: 'http://127.0.0.1:8899',
  ENGINE_WS: 'ws://127.0.0.1:8899',
  FIREBASE_PROJECT_ID: 'idlescape-osrs',
  GOOGLE_APPLICATION_CREDENTIALS: './secrets/firebase-admin.json',
  FIREBASE_EMULATORS: 'false',
  PUBLIC_ORIGIN: 'https://osrs.scotho.com',
  WEB_DIST: '../web/dist',
  CLIENT_OUT: '../client/out',
  ENGINE_PUBLIC: '../engine/server/public'
};

const keysOf = (text: string): Set<string> => new Set(
  text.split(/\r?\n/)
    .map(l => /^([A-Z][A-Z0-9_]*)=/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => m[1]!)
);

describe('loadEnv', () => {
  test('parses a complete environment', () => {
    const env = loadEnv(base);
    expect(env.port).toBe(8787);
    expect(env.firebaseEmulators).toBe(false);
    expect(env.engineHttp).toBe('http://127.0.0.1:8899');
  });

  test('ignores the retired password gate keys a deployed env file may still carry', () => {
    // The site went public and the gate was removed; a box's secrets/server.env written by an older
    // provision.ps1 still has these, including an empty or short secret and a non-boolean flag.
    const leftover = { ...base, GATE_ENABLED: 'yes', GATE_PASSWORD: 'x', GATE_SECRET: '' };
    expect(loadEnv(leftover)).toEqual(loadEnv(base));
  });

  test('the engine management secret is optional and shared with the engine', () => {
    expect(loadEnv(base).engineManagementSecret).toBe('');
    expect(loadEnv({ ...base, ENGINE_MANAGEMENT_SECRET: 'm'.repeat(32) }).engineManagementSecret).toBe('m'.repeat(32));
  });

  test('rejects a short engine management secret, like the owner secret', () => {
    expect(() => loadEnv({ ...base, ENGINE_MANAGEMENT_SECRET: 'too-short' })).toThrow(/ENGINE_MANAGEMENT_SECRET/);
  });

  test('rejects a non-numeric port', () => {
    expect(() => loadEnv({ ...base, PORT: 'abc' })).toThrow(/PORT/);
  });

  test('the engine defaults are the dev engine, never the retired 8888 instance', () => {
    // 8888 is the live 225-era proof of concept. server/.env.example has warned against pointing a
    // dev front server at it since SP1b; the default pointed straight at it (audit C17).
    const { ENGINE_HTTP: _http, ENGINE_WS: _ws, ...noEngine } = base;
    const env = loadEnv(noEngine);
    expect(env.engineHttp).toBe('http://127.0.0.1:8899');
    expect(env.engineWs).toBe('ws://127.0.0.1:8899');
  });

  test('.env.example documents exactly the keys loadEnv reads', () => {
    // path.join(import.meta.dir, ...), NOT new URL('.', import.meta.url).pathname. On Windows that
    // pathname is `/C:/projects/osrs_test/server/src/`, and both Bun and Node resolve the leading
    // slash into a `C:\C:\...` that does not exist, so the read throws ENOENT on the only platform
    // this project runs on. server/src/wiki/db.test.ts:46 is the in-repo precedent for this shape.
    const template = readFileSync(path.join(import.meta.dir, '..', '.env.example'), 'utf8');
    const source = readFileSync(path.join(import.meta.dir, 'env.ts'), 'utf8');

    const documented = keysOf(template);
    // Both shapes loadEnv uses: `str(source, 'KEY', ...)` / bool / int, and a direct `source.KEY`.
    const read = new Set<string>();
    for (const m of source.matchAll(/(?:str|bool|int)\(source, '([A-Z][A-Z0-9_]*)'/g)) read.add(m[1]!);
    for (const m of source.matchAll(/source\.([A-Z][A-Z0-9_]*)/g)) read.add(m[1]!);

    expect(read.size).toBeGreaterThan(10);   // the extraction still matches the source's shape
    expect([...read].filter(k => !documented.has(k)).sort()).toEqual([]);
    expect([...documented].filter(k => !read.has(k)).sort()).toEqual([]);
  });

  test('provision.ps1 writes or declares every key .env.example documents', () => {
    // The third direction of C17's template finding, which the map named and nothing else closed.
    // deploy/lightsail/provision.ps1 builds the box's secrets/server.env from a hand-kept nine-key
    // list while loadEnv reads seventeen, so a newly required key can be added to the template and
    // silently omitted from every box. The eight it leaves out are deliberate (docker-compose.yml
    // sets them, or env.ts's default is already right inside the container), so the generator
    // DECLARES them in a `# NOT-WRITTEN:` comment and this asserts written + declared == documented.
    const provision = readFileSync(path.join(import.meta.dir, '..', '..', 'deploy', 'lightsail', 'provision.ps1'), 'utf8');

    const written = new Set<string>();
    for (const m of provision.matchAll(/["']([A-Z][A-Z0-9_]*)=/g)) written.add(m[1]!);
    const declared = new Set<string>(
      (/^#\s*NOT-WRITTEN:(.*)$/m.exec(provision)?.[1] ?? '').trim().split(/\s+/).filter(Boolean)
    );

    expect(written.size).toBeGreaterThan(5);      // the $serverEnv array is still recognisable
    expect(declared.size).toBeGreaterThan(0);     // the declaration line is still there
    const covered = new Set([...written, ...declared]);
    const documented = keysOf(readFileSync(path.join(import.meta.dir, '..', '.env.example'), 'utf8'));
    expect([...documented].filter(k => !covered.has(k)).sort()).toEqual([]);
    expect([...covered].filter(k => !documented.has(k)).sort()).toEqual([]);
  });
});
