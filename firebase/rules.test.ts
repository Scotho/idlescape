import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'idlescape-osrs',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 }
  });
});
beforeEach(() => env.clearFirestore());
afterAll(() => env.cleanup());

describe('users', () => {
  test('owner can create a profile without gameName', async () => {
    const db = env.authenticatedContext('u1').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/u1'), { displayName: 'Bob', createdAt: 1 }));
  });
  test('client cannot set gameName', async () => {
    const db = env.authenticatedContext('u1').firestore();
    await assertFails(setDoc(doc(db, 'users/u1'), { displayName: 'Bob', gameName: 'bob' }));
  });
  test('client cannot change a server-written gameName', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'users/u1'), { displayName: 'Bob', gameName: 'bob', createdAt: 1 });
    });
    const db = env.authenticatedContext('u1').firestore();
    await assertFails(updateDoc(doc(db, 'users/u1'), { gameName: 'other' }));
    await assertSucceeds(updateDoc(doc(db, 'users/u1'), { displayName: 'Robert' }));
  });
  test('client cannot strip gameName via a non-merge setDoc', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'users/u1'), { displayName: 'Bob', gameName: 'bob', createdAt: 1 });
    });
    const db = env.authenticatedContext('u1').firestore();
    await assertFails(setDoc(doc(db, 'users/u1'), { displayName: 'Eve' }));
  });
  test('client cannot set an invalid displayName on update', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'users/u1'), { displayName: 'Bob', gameName: 'bob', createdAt: 1 });
    });
    const db = env.authenticatedContext('u1').firestore();
    await assertFails(updateDoc(doc(db, 'users/u1'), { displayName: '' }));
  });
  test('other users can read but not write', async () => {
    const db = env.authenticatedContext('u2').firestore();
    await assertSucceeds(getDoc(doc(db, 'users/u1')));
    await assertFails(setDoc(doc(db, 'users/u1'), { displayName: 'x' }));
  });
});

describe('server-only collections', () => {
  test('gameAccounts is unreadable and unwritable by clients', async () => {
    const db = env.authenticatedContext('u1').firestore();
    await assertFails(getDoc(doc(db, 'gameAccounts/u1')));
    await assertFails(setDoc(doc(db, 'gameAccounts/u1'), { secret: 'x' }));
  });
  test('gameNames is not readable or writable by clients', async () => {
    const db = env.authenticatedContext('u1').firestore();
    await assertFails(getDoc(doc(db, 'gameNames/bob')));
    await assertFails(setDoc(doc(db, 'gameNames/bob'), { uid: 'u1' }));
  });
});

describe('pairTokens', () => {
  test('the owning uid can read, but not write', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'pairTokens/tok1'), { uid: 'u1', createdAt: 1, expiresAt: 2, usedAt: null, agentTokenId: null });
    });
    const db = env.authenticatedContext('u1').firestore();
    await assertSucceeds(getDoc(doc(db, 'pairTokens/tok1')));
    await assertFails(setDoc(doc(db, 'pairTokens/tok1'), { uid: 'u1', createdAt: 1, expiresAt: 2, usedAt: null, agentTokenId: null }));
    await assertFails(updateDoc(doc(db, 'pairTokens/tok1'), { usedAt: 3 }));
  });
  test('another uid cannot read it', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'pairTokens/tok2'), { uid: 'u1', createdAt: 1, expiresAt: 2, usedAt: null, agentTokenId: null });
    });
    const db = env.authenticatedContext('u2').firestore();
    await assertFails(getDoc(doc(db, 'pairTokens/tok2')));
  });
  test('an unauthenticated reader cannot read it', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'pairTokens/tok3'), { uid: 'u1', createdAt: 1, expiresAt: 2, usedAt: null, agentTokenId: null });
    });
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'pairTokens/tok3')));
  });
});

describe('agentTokens', () => {
  test('the owning uid can read, but not write', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'agentTokens/a1'), { uid: 'u1', label: 'x', createdAt: 1, lastSeenAt: null, revokedAt: null, secretHash: 'h' });
    });
    const db = env.authenticatedContext('u1').firestore();
    await assertSucceeds(getDoc(doc(db, 'agentTokens/a1')));
    await assertFails(setDoc(doc(db, 'agentTokens/a1'), { uid: 'u1', label: 'x', createdAt: 1, lastSeenAt: null, revokedAt: null, secretHash: 'h' }));
    await assertFails(updateDoc(doc(db, 'agentTokens/a1'), { revokedAt: 2 }));
  });
  test('another uid cannot read it', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'agentTokens/a2'), { uid: 'u1', label: 'x', createdAt: 1, lastSeenAt: null, revokedAt: null, secretHash: 'h' });
    });
    const db = env.authenticatedContext('u2').firestore();
    await assertFails(getDoc(doc(db, 'agentTokens/a2')));
  });
});

describe('plugin settings', () => {
  test('owner can create and read their own plugin doc', async () => {
    const db = env.authenticatedContext('u1').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/u1/plugins/xp'), { enabled: true, settings: { rate: 3 } }));
    await assertSucceeds(getDoc(doc(db, 'users/u1/plugins/xp')));
  });
  test('a different user cannot read or write your plugin docs', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'users/u1/plugins/xp'), { enabled: true, settings: {} });
    });
    const other = env.authenticatedContext('u2').firestore();
    await assertFails(getDoc(doc(other, 'users/u1/plugins/xp')));
    await assertFails(setDoc(doc(other, 'users/u1/plugins/xp'), { enabled: false, settings: {} }));
  });
  test('enabled must be a boolean and settings a map', async () => {
    const db = env.authenticatedContext('u1').firestore();
    await assertFails(setDoc(doc(db, 'users/u1/plugins/xp'), { enabled: 'yes', settings: {} }));
    await assertFails(setDoc(doc(db, 'users/u1/plugins/xp'), { enabled: true, settings: 5 }));
  });
});

describe('script toggles', () => {
  test('owner can write and read their own toggle doc', async () => {
    const db = env.authenticatedContext('u1').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/u1/scriptToggles/chop-and-drop'), { enabled: false, updatedAt: 1 }));
    await assertSucceeds(getDoc(doc(db, 'users/u1/scriptToggles/chop-and-drop')));
  });
  test('a different user cannot read or write your toggle docs', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'users/u1/scriptToggles/chop-and-drop'), { enabled: false, updatedAt: 1 });
    });
    const other = env.authenticatedContext('u2').firestore();
    await assertFails(getDoc(doc(other, 'users/u1/scriptToggles/chop-and-drop')));
    await assertFails(setDoc(doc(other, 'users/u1/scriptToggles/chop-and-drop'), { enabled: true, updatedAt: 2 }));
  });
  test('a signed-out client cannot read or write a toggle doc', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'users/u1/scriptToggles/chop-and-drop')));
    await assertFails(setDoc(doc(anon, 'users/u1/scriptToggles/chop-and-drop'), { enabled: false, updatedAt: 1 }));
  });
  test('enabled must be a boolean', async () => {
    const db = env.authenticatedContext('u1').firestore();
    await assertFails(setDoc(doc(db, 'users/u1/scriptToggles/chop-and-drop'), { enabled: 'no', updatedAt: 1 }));
    await assertFails(setDoc(doc(db, 'users/u1/scriptToggles/chop-and-drop'), { updatedAt: 1 }));
  });
});

describe('characters', () => {
  test('clients cannot read or write characters or audit', async () => {
    const db = env.authenticatedContext('u1').firestore();
    await assertFails(getDoc(doc(db, 'characters/c1')));
    await assertFails(setDoc(doc(db, 'characters/c1'), { uid: 'u1', gameName: 'x' }));
    await assertFails(setDoc(doc(db, 'audit/a1'), { kind: 'x' }));
  });
  test('client cannot set or change characterIds on its profile', async () => {
    const db = env.authenticatedContext('u1').firestore();
    await assertFails(setDoc(doc(db, 'users/u1'), { displayName: 'Bob', createdAt: 1, characterIds: ['c1'] }));
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'users/u1'), { displayName: 'Bob', createdAt: 1, characterIds: ['c1'] });
    });
    await assertFails(updateDoc(doc(db, 'users/u1'), { characterIds: [] }));
    await assertSucceeds(updateDoc(doc(db, 'users/u1'), { displayName: 'Robert' }));
  });
});

describe('users/{uid}/tasks', () => {
  const task = (over: Record<string, unknown> = {}) => ({
    name: 'Chop and drop',
    description: 'chops',
    tags: ['skilling'],
    params: { untilLevel: 15 },
    code: 'export default defineScript({});',
    version: 1,
    source: 'user',
    createdAt: 1,
    updatedAt: 1,
    ...over
  });

  test('owner can write and read their own task', async () => {
    const db = env.authenticatedContext('u1').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/u1/tasks/t1'), task()));
    await assertSucceeds(getDoc(doc(db, 'users/u1/tasks/t1')));
  });
  test('another uid cannot read or write your tasks', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'users/u1/tasks/t1'), task());
    });
    const other = env.authenticatedContext('u2').firestore();
    await assertFails(getDoc(doc(other, 'users/u1/tasks/t1')));
    await assertFails(setDoc(doc(other, 'users/u1/tasks/t1'), task({ name: 'Evil' })));
  });
  test('code over 64 KB is rejected', async () => {
    const db = env.authenticatedContext('u1').firestore();
    await assertFails(setDoc(doc(db, 'users/u1/tasks/t1'), task({ code: 'x'.repeat(70_000) })));
  });
  test('an unknown source is rejected', async () => {
    const db = env.authenticatedContext('u1').firestore();
    await assertFails(setDoc(doc(db, 'users/u1/tasks/t1'), task({ source: 'remote' })));
    await assertSucceeds(setDoc(doc(db, 'users/u1/tasks/t2'), task({ source: 'fork' })));
    await assertSucceeds(setDoc(doc(db, 'users/u1/tasks/t3'), task({ source: 'library' })));
  });
  test('a missing or over-long name is rejected', async () => {
    const db = env.authenticatedContext('u1').firestore();
    const { name: _name, ...noName } = task();
    await assertFails(setDoc(doc(db, 'users/u1/tasks/t1'), noName));
    await assertFails(setDoc(doc(db, 'users/u1/tasks/t1'), task({ name: '' })));
    await assertFails(setDoc(doc(db, 'users/u1/tasks/t1'), task({ name: 'n'.repeat(61) })));
  });
  test('the owner can delete a task, another uid cannot', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'users/u1/tasks/t1'), task());
    });
    await assertFails(deleteDoc(doc(env.authenticatedContext('u2').firestore(), 'users/u1/tasks/t1')));
    await assertSucceeds(deleteDoc(doc(env.authenticatedContext('u1').firestore(), 'users/u1/tasks/t1')));
  });
  test('an unauthenticated client cannot read or write tasks', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'users/u1/tasks/t1'), task());
    });
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'users/u1/tasks/t1')));
    await assertFails(setDoc(doc(anon, 'users/u1/tasks/t1'), task()));
  });
});
