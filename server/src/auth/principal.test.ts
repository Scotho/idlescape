import { beforeAll, describe, expect, test } from 'bun:test';
import { bearerOf, createAuthenticator, AGENT_PREFIX } from './principal';
import { initAdmin } from '../firebaseAdmin';
import { loadEnv } from '../env';
import { hashToken } from '../pair/token';

const env = loadEnv({ FIREBASE_EMULATORS: 'true', FIREBASE_PROJECT_ID: 'idlescape-osrs' });
const admin = initAdmin(env);
const auth = createAuthenticator(admin);

async function idTokenFor(uid: string): Promise<string> {
  const custom = await admin.auth.createCustomToken(uid);
  const res = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: custom, returnSecureToken: true })
  });
  return ((await res.json()) as { idToken: string }).idToken;
}
const req = (bearer: string | null) => new Request('http://x/', { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} });

beforeAll(async () => {
  await admin.db.doc('agentTokens/t1').set({ uid: 'owner', label: 'x', createdAt: 1, lastSeenAt: null, revokedAt: null, secretHash: hashToken('a'.repeat(40)) });
  await admin.db.doc('agentTokens/t2').set({ uid: 'owner', label: 'x', createdAt: 1, lastSeenAt: null, revokedAt: 2, secretHash: hashToken('b'.repeat(40)) });
});

describe('authenticate', () => {
  test('no header -> null', async () => { expect(await auth.authenticate(req(null))).toBeNull(); });
  test('firebase id token -> human with authTime', async () => {
    const p = await auth.authenticate(req(await idTokenFor('u9')));
    expect(p).toMatchObject({ kind: 'human', uid: 'u9', isAnonymous: false });
    expect(Math.abs((p as { authTime: number }).authTime - Date.now())).toBeLessThan(60_000);
  });
  test('csa_ agent token -> agent; revoked or unknown -> null', async () => {
    expect(await auth.authenticate(req(AGENT_PREFIX + 'a'.repeat(40)))).toEqual({ kind: 'agent', uid: 'owner', tokenId: 't1' });
    expect(await auth.authenticate(req(AGENT_PREFIX + 'b'.repeat(40)))).toBeNull();
    expect(await auth.authenticate(req(AGENT_PREFIX + 'c'.repeat(40)))).toBeNull();
  });
  test('garbage bearer -> null', async () => { expect(await auth.authenticate(req('nope'))).toBeNull(); });
  test('empty or whitespace-only bearer -> null', async () => {
    const empty = new Request('http://x/', { headers: { authorization: 'Bearer ' } });
    const whitespace = new Request('http://x/', { headers: { authorization: 'Bearer    ' } });
    expect(bearerOf(empty)).toBeNull();
    expect(bearerOf(whitespace)).toBeNull();
    expect(await auth.authenticate(empty)).toBeNull();
    expect(await auth.authenticate(whitespace)).toBeNull();
  });
});
