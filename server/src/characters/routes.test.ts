import { beforeAll, describe, expect, test } from 'bun:test';
import { createCharacterRoutes } from './routes';
import { createCharacterStore } from './store';
import { initAdmin } from '../firebaseAdmin';
import { loadEnv } from '../env';
import type { Principal } from '../auth/principal';
import { OWNER_COOKIE, splitOwnerCookie, verifyOwnerAssertion } from '../auth/ownerAssertion';

const env = loadEnv({ FIREBASE_EMULATORS: 'true', FIREBASE_PROJECT_ID: 'idlescape-osrs' });
const admin = initAdmin(env);
const store = createCharacterStore(admin);
const routes = createCharacterRoutes({ store, ownerSecret: '', secureCookies: false });
const human = (uid: string, isAnonymous = false, authTime = Date.now()): Principal & { kind: 'human' } => ({ kind: 'human', uid, isAnonymous, authTime });
const json = (method: string, url: string, body?: unknown) => new Request(`http://x${url}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

beforeAll(async () => {
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/idlescape-osrs/databases/(default)/documents', { method: 'DELETE' });
});

describe('character routes', () => {
  let id = '';
  test('create then list', async () => {
    const res = await routes.handle(json('POST', '/api/characters', { desiredName: 'Alice' }), { kind: 'characters', sub: 'create' }, human('u1'));
    expect(res.status).toBe(201);
    const c = (await res.json()) as { id: string; gameName: string };
    id = c.id;
    expect(c.gameName).toBe('alice');
    const list = await routes.handle(json('GET', '/api/characters'), { kind: 'characters', sub: 'list' }, human('u1'));
    const body = (await list.json()) as { characters: unknown[]; limit: number };
    expect(body.characters).toHaveLength(1);
    expect(body.limit).toBe(3);
  });
  test('a guest listing reports the guest limit of two', async () => {
    const list = await routes.handle(json('GET', '/api/characters'), { kind: 'characters', sub: 'list' }, human('u-guest', true));
    expect(((await list.json()) as { limit: number }).limit).toBe(2);
  });
  test('a guest is refused a third character', async () => {
    for (let i = 0; i < 2; i++) {
      expect((await routes.handle(json('POST', '/api/characters'), { kind: 'characters', sub: 'create' }, human('u-guest', true))).status).toBe(201);
    }
    const res = await routes.handle(json('POST', '/api/characters'), { kind: 'characters', sub: 'create' }, human('u-guest', true));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'limit' });
  });
  test('check', async () => {
    const res = await routes.handle(json('GET', '/api/characters/check?name=Alice'), { kind: 'characters', sub: 'check' }, human('u1'));
    expect(await res.json()).toEqual({ ok: false, error: 'taken' });
  });
  test('session for owner; 404 for others', async () => {
    const ok = await routes.handle(json('POST', `/api/characters/${id}/session`), { kind: 'characters', sub: 'session', id }, human('u1'));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { gameName: string }).gameName).toBe('alice');
    const no = await routes.handle(json('POST', `/api/characters/${id}/session`), { kind: 'characters', sub: 'session', id }, human('u2'));
    expect(no.status).toBe(404);
  });
  test('delete needs the phrase and a fresh sign-in', async () => {
    const stale = await routes.handle(json('DELETE', `/api/characters/${id}`, { confirm: 'delete alice' }), { kind: 'characters', sub: 'delete', id }, human('u1', false, Date.now() - 600_000));
    expect(stale.status).toBe(403);
    const wrong = await routes.handle(json('DELETE', `/api/characters/${id}`, { confirm: 'delete bob' }), { kind: 'characters', sub: 'delete', id }, human('u1'));
    expect(wrong.status).toBe(400);
    const ok = await routes.handle(json('DELETE', `/api/characters/${id}`, { confirm: 'delete alice' }), { kind: 'characters', sub: 'delete', id }, human('u1'));
    expect(ok.status).toBe(204);
    const gone = await routes.handle(json('POST', `/api/characters/${id}/session`), { kind: 'characters', sub: 'session', id }, human('u1'));
    expect(gone.status).toBe(410);
    const again = await routes.handle(json('DELETE', `/api/characters/${id}`, { confirm: 'delete alice' }), { kind: 'characters', sub: 'delete', id }, human('u1'));
    expect(again.status).toBe(410);
  });
  test('limit -> 409', async () => {
    for (const n of ['b1', 'b2', 'b3']) expect((await routes.handle(json('POST', '/api/characters', { desiredName: n }), { kind: 'characters', sub: 'create' }, human('u3'))).status).toBe(201);
    const res = await routes.handle(json('POST', '/api/characters', { desiredName: 'b4' }), { kind: 'characters', sub: 'create' }, human('u3'));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'limit' });
  });
});

test('session mints an owner assertion cookie for the minted character', async () => {
  const routes = createCharacterRoutes({ store, ownerSecret: 'z'.repeat(32), secureCookies: false });
  const created = await store.create('u-cookie', false, 'cookiefan');
  const res = await routes.handle(
    new Request(`http://x/api/characters/${created.id}/session`, { method: 'POST' }),
    { kind: 'characters', sub: 'session', id: created.id },
    { kind: 'human', uid: 'u-cookie', isAnonymous: false, authTime: Date.now() }
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ gameName: 'cookiefan' });
  const cookie = res.headers.get('set-cookie') ?? '';
  expect(cookie).toContain('cs_owner=');
  expect(cookie).toContain('HttpOnly');
  const value = cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));
  expect(verifyOwnerAssertion('z'.repeat(32), value)).toMatchObject({ uid: 'u-cookie', character: 'cookiefan' });
});

test('session sets no cookie when no secret is configured', async () => {
  const routes = createCharacterRoutes({ store, ownerSecret: '', secureCookies: false });
  const created = await store.create('u-nocookie', false, 'nocookie');
  const res = await routes.handle(
    new Request(`http://x/api/characters/${created.id}/session`, { method: 'POST' }),
    { kind: 'characters', sub: 'session', id: created.id },
    { kind: 'human', uid: 'u-nocookie', isAnonymous: false, authTime: Date.now() }
  );
  expect(res.headers.get('set-cookie')).toBeNull();
});

test('a second session replaying the minted cookie accumulates a second entry', async () => {
  const secret = 'z'.repeat(32);
  const routes = createCharacterRoutes({ store, ownerSecret: secret, secureCookies: false });
  const session = async (uid: string, id: string, cookie: string | null) => routes.handle(
    new Request(`http://x/api/characters/${id}/session`, { method: 'POST', headers: cookie ? { cookie } : {} }),
    { kind: 'characters', sub: 'session', id },
    { kind: 'human', uid, isAnonymous: false, authTime: Date.now() }
  );
  const cookieValue = (res: Response) => {
    const header = res.headers.get('set-cookie') ?? '';
    return header.slice(header.indexOf('=') + 1, header.indexOf(';'));
  };

  const first = await store.create('u-replay', false, 'replayone');
  const second = await store.create('u-replay', false, 'replaytwo');
  const firstValue = cookieValue(await session('u-replay', first.id, null));
  expect(splitOwnerCookie(firstValue)).toHaveLength(1);

  const secondValue = cookieValue(await session('u-replay', second.id, `${OWNER_COOKIE}=${firstValue}`));
  expect(splitOwnerCookie(secondValue)).toHaveLength(2);
  expect(splitOwnerCookie(secondValue).map(e => verifyOwnerAssertion(secret, e)?.character)).toEqual(['replayone', 'replaytwo']);
});
