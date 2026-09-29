import { beforeAll, describe, expect, test } from 'bun:test';
import { initAdmin } from '../firebaseAdmin';
import { loadEnv } from '../env';
import { createPairStore } from './store';
import { createPairRoutes } from './routes';
import { createCharacterStore } from '../characters/store';
import type { Route } from '../router';

// Requires: cd firebase && npm run emulators (auth 9099, firestore 8080).
const env = loadEnv({ FIREBASE_EMULATORS: 'true', FIREBASE_PROJECT_ID: 'idlescape-osrs' });
const admin = initAdmin(env);
// Wired the way index.ts wires it: the exchange's gameName comes from the real characters store.
const characterStore = createCharacterStore(admin);
const store = createPairStore(admin.db, async uid => (await characterStore.list(uid))[0]?.gameName ?? null);
const ORIGIN = 'http://localhost:8787';
const routes = createPairRoutes({ store, auth: admin.auth, origin: ORIGIN });

async function idTokenFor(uid: string): Promise<string> {
  const custom = await admin.auth.createCustomToken(uid);
  const res = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: custom, returnSecureToken: true })
  });
  const json = (await res.json()) as { idToken: string };
  return json.idToken;
}

function pairRoute(sub: 'mint' | 'fetch' | 'exchange' | 'revoke' | 'guide', extra: Partial<Route> = {}): Extract<Route, { kind: 'pair' }> {
  return { kind: 'pair', sub, ...extra } as Extract<Route, { kind: 'pair' }>;
}

beforeAll(async () => {
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/idlescape-osrs/databases/(default)/documents', { method: 'DELETE' });
});

describe('pair routes: mint', () => {
  test('401 without a bearer token', async () => {
    const res = await routes.handle(new Request('http://x/api/pair', { method: 'POST' }), pairRoute('mint'));
    expect(res.status).toBe(401);
  });
  test('200 with a valid bearer, returns a pairUrl', async () => {
    const token = await idTokenFor('uid-routes-1');
    const res = await routes.handle(new Request('http://x/api/pair', {
      method: 'POST', headers: { authorization: `Bearer ${token}` }
    }), pairRoute('mint'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pairUrl: string; token: string; expiresAt: number };
    expect(body.pairUrl).toBe(`${ORIGIN}/pair/${body.token}`);
  });
});

describe('pair routes: fetch', () => {
  test('Accept: */* returns markdown containing the token', async () => {
    const { token } = await store.mint('uid-routes-2');
    const res = await routes.handle(new Request(`http://x/pair/${token}`, { headers: { accept: '*/*' } }), pairRoute('fetch', { token }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    const body = await res.text();
    expect(body).toContain(token);
  });
  test('a browser Accept returns html', async () => {
    const { token } = await store.mint('uid-routes-3');
    const res = await routes.handle(new Request(`http://x/pair/${token}`, {
      headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
    }), pairRoute('fetch', { token }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });
  test('unknown token returns 410', async () => {
    const res = await routes.handle(new Request('http://x/pair/does-not-exist', { headers: { accept: '*/*' } }), pairRoute('fetch', { token: 'does-not-exist' }));
    expect(res.status).toBe(410);
  });
  test('expired token returns 410', async () => {
    const { token } = await store.mint('uid-routes-4');
    await store.mint('uid-routes-4'); // expires the first
    const res = await routes.handle(new Request(`http://x/pair/${token}`, { headers: { accept: '*/*' } }), pairRoute('fetch', { token }));
    expect(res.status).toBe(410);
  });
});

describe('pair routes: exchange', () => {
  test('succeeds once, then 410 token_spent', async () => {
    await characterStore.create('uid-routes-5', false, 'routesfive');
    const { token } = await store.mint('uid-routes-5');
    const first = await routes.handle(new Request(`http://x/api/pair/${token}/exchange`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: 'Test' })
    }), pairRoute('exchange', { token }));
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { agentToken: string; gatewayUrl: string; gameName: string | null };
    expect(firstBody.agentToken).toMatch(/^csa_[A-Za-z0-9_-]{40}$/);
    expect(firstBody.gatewayUrl).toBe(`${ORIGIN}/mcp`);
    // The skill tells the player which character Claude is watching; a post-SP6 account keeps
    // its name in characters/{id}, so a null here means the exchange is reading the wrong place.
    expect(firstBody.gameName).toBe('routesfive');

    const second = await routes.handle(new Request(`http://x/api/pair/${token}/exchange`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({})
    }), pairRoute('exchange', { token }));
    expect(second.status).toBe(410);
    const secondBody = (await second.json()) as { error: string };
    expect(secondBody.error).toBe('token_spent');
  });
  test('unknown token returns 410 token_unknown', async () => {
    const res = await routes.handle(new Request('http://x/api/pair/nope/exchange', { method: 'POST' }), pairRoute('exchange', { token: 'nope' }));
    expect(res.status).toBe(410);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('token_unknown');
  });
});

describe('pair routes: revoke', () => {
  test('a non-owner gets 404', async () => {
    const { token } = await store.mint('uid-routes-6');
    const ex = await store.exchange(token, 'x');
    expect(ex.ok).toBe(true);
    if (!ex.ok) return;
    const otherUserToken = await idTokenFor('uid-routes-not-owner');
    const res = await routes.handle(new Request(`http://x/api/agent-tokens/${ex.agentTokenId}/revoke`, {
      method: 'POST', headers: { authorization: `Bearer ${otherUserToken}` }
    }), pairRoute('revoke', { id: ex.agentTokenId }));
    expect(res.status).toBe(404);
  });
  test('the owner can revoke', async () => {
    const { token } = await store.mint('uid-routes-7');
    const ex = await store.exchange(token, 'x');
    expect(ex.ok).toBe(true);
    if (!ex.ok) return;
    const ownerToken = await idTokenFor('uid-routes-7');
    const res = await routes.handle(new Request(`http://x/api/agent-tokens/${ex.agentTokenId}/revoke`, {
      method: 'POST', headers: { authorization: `Bearer ${ownerToken}` }
    }), pairRoute('revoke', { id: ex.agentTokenId }));
    expect(res.status).toBe(204);
  });
  test('401 without a bearer token', async () => {
    const res = await routes.handle(new Request('http://x/api/agent-tokens/whatever/revoke', { method: 'POST' }), pairRoute('revoke', { id: 'whatever' }));
    expect(res.status).toBe(401);
  });
});

describe('pair routes: guide', () => {
  test('renders the connect guide as html', async () => {
    const res = await routes.handle(new Request('http://x/connect'), pairRoute('guide'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    expect(body).toContain('Connecting Claude');
  });
});
