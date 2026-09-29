import { beforeAll, describe, expect, test } from 'bun:test';
import { initAdmin } from '../firebaseAdmin';
import { loadEnv } from '../env';
import { createPairStore } from './store';

const env = loadEnv({ FIREBASE_EMULATORS: 'true', FIREBASE_PROJECT_ID: 'idlescape-osrs' });
const { db } = initAdmin(env);
/** Stands in for the characters store: uid -> first live character's game name. */
const names = new Map<string, string>();
const store = createPairStore(db, async uid => names.get(uid) ?? null);

beforeAll(async () => {
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/idlescape-osrs/databases/(default)/documents', { method: 'DELETE' });
});

describe('pair store', () => {
  test('mint returns a token that lookup finds unused', async () => {
    const { token } = await store.mint('uid-1');
    const looked = await store.lookup(token);
    expect(looked?.uid).toBe('uid-1');
    expect(looked?.usedAt).toBeNull();
  });
  test('minting again expires the previous unused token', async () => {
    const first = await store.mint('uid-2');
    await store.mint('uid-2');
    const looked = await store.lookup(first.token);
    expect(looked === null || looked.expired).toBe(true);
  });
  test('exchange succeeds once, returns an agent token, second call reports spent', async () => {
    names.set('uid-3', 'zezima');
    const { token } = await store.mint('uid-3');
    const ex = await store.exchange(token, 'My Laptop');
    expect(ex.ok).toBe(true);
    if (ex.ok) {
      expect(ex.agentToken).toMatch(/^[A-Za-z0-9_-]{40}$/);
      // The name comes from the account's first live character, not the retired
      // gameAccounts/{uid} document.
      expect(ex.gameName).toBe('zezima');
    }
    const again = await store.exchange(token, 'My Laptop');
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('token_spent');
  });
  test('exchange reports gameName null for an account with no character', async () => {
    const { token } = await store.mint('uid-3b');
    const ex = await store.exchange(token, 'My Laptop');
    expect(ex.ok).toBe(true);
    if (ex.ok) expect(ex.gameName).toBeNull();
  });
  test('revoke sets revokedAt and hides the agent token', async () => {
    const { token } = await store.mint('uid-4');
    const ex = await store.exchange(token, 'x');
    expect(ex.ok).toBe(true);
    if (ex.ok) {
      await store.revoke('uid-4', ex.agentTokenId);
      const rows = await store.listAgentTokens('uid-4');
      expect(rows.find(r => r.id === ex.agentTokenId)?.revokedAt).not.toBeNull();
    }
  });

  // `label` is free text from whatever calls exchange (the pairing skill, today); it's later
  // rendered in the Connect panel, so it must be capped and stripped of control characters
  // before it's ever persisted -- a stored-XSS regression pairs this with the web-side escaping
  // in connect.test.ts.
  describe('label sanitization', () => {
    test('an over-long label is capped at 64 characters', async () => {
      const { token } = await store.mint('uid-label-1');
      const longLabel = 'x'.repeat(200);
      const ex = await store.exchange(token, longLabel);
      expect(ex.ok).toBe(true);
      if (ex.ok) {
        const rows = await store.listAgentTokens('uid-label-1');
        expect(rows.find(r => r.id === ex.agentTokenId)?.label).toBe('x'.repeat(64));
      }
    });

    test('control characters are stripped from a label', async () => {
      const { token } = await store.mint('uid-label-2');
      const dirty = `My${String.fromCharCode(7)}Laptop${String.fromCharCode(27)}[31m`;
      const ex = await store.exchange(token, dirty);
      expect(ex.ok).toBe(true);
      if (ex.ok) {
        const rows = await store.listAgentTokens('uid-label-2');
        expect(rows.find(r => r.id === ex.agentTokenId)?.label).toBe('MyLaptop[31m');
      }
    });

    test('a label of only control characters falls back to the default', async () => {
      const { token } = await store.mint('uid-label-3');
      const onlyControl = String.fromCharCode(1, 2, 3);
      const ex = await store.exchange(token, onlyControl);
      expect(ex.ok).toBe(true);
      if (ex.ok) {
        const rows = await store.listAgentTokens('uid-label-3');
        expect(rows.find(r => r.id === ex.agentTokenId)?.label).toBe('Claude Code');
      }
    });

    test('a missing label still defaults to Claude Code', async () => {
      const { token } = await store.mint('uid-label-4');
      const ex = await store.exchange(token);
      expect(ex.ok).toBe(true);
      if (ex.ok) {
        const rows = await store.listAgentTokens('uid-label-4');
        expect(rows.find(r => r.id === ex.agentTokenId)?.label).toBe('Claude Code');
      }
    });
  });
});
