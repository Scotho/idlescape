import { beforeAll, describe, expect, test } from 'bun:test';
import { createCharacterStore, CharacterStoreError } from './store';
import { initAdmin } from './../firebaseAdmin';
import { loadEnv } from '../env';

// Requires: cd firebase && npm run emulators (auth 9099, firestore 8080).
const env = loadEnv({ FIREBASE_EMULATORS: 'true', FIREBASE_PROJECT_ID: 'idlescape-osrs' });
const admin = initAdmin(env);
const store = createCharacterStore(admin);

beforeAll(async () => {
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/idlescape-osrs/databases/(default)/documents', { method: 'DELETE' });
});

describe('characters store', () => {
  test('create allocates a normalised unique name and lists it', async () => {
    const c = await store.create('u1', false, 'Bob The Great');
    expect(c.gameName).toBe('bob_the_grea');
    expect(c.id).toMatch(/^[A-Za-z0-9_-]{20}$/);
    const list = await store.list('u1');
    expect(list.map(x => x.gameName)).toEqual(['bob_the_grea']);
    const idx = await admin.db.doc('gameNames/bob_the_grea').get();
    expect(idx.data()).toEqual({ uid: 'u1', characterId: c.id });
    const user = await admin.db.doc('users/u1').get();
    expect(user.data()?.characterIds).toEqual([c.id]);
  });
  test('registered users get 3 characters, then limit', async () => {
    await store.create('u1', false, 'second');
    await store.create('u1', false, 'third');
    await expect(store.create('u1', false, 'fourth')).rejects.toMatchObject({ code: 'limit' });
  });
  test('guests name their own characters, and get 2 of them', async () => {
    // SP7 owner requirement 1: a guest fills in the same pre-game naming form a registered user
    // does, and the availability check it runs has to be what the character is actually called.
    const g = await store.create('g1', true, 'Guest Chosen');
    expect(g.gameName).toBe('guest_chosen');
    const g2 = await store.create('g1', true, 'second pick');
    expect(g2.gameName).toBe('second_pick');
    await expect(store.create('g1', true, 'a third')).rejects.toMatchObject({ code: 'limit' });
  });
  test('a guest who names nothing still gets a generated guest_ name', async () => {
    const g = await store.create('g2', true, null);
    expect(g.gameName).toMatch(/^guest_[a-z0-9]{6}$/);
    // The name index is global, so two nameless guests must not be handed the same name: a
    // collision would fail the second create outright.
    const other = await store.create('g5', true, null);
    expect(other.gameName).toMatch(/^guest_[a-z0-9]{6}$/);
    expect(other.gameName).not.toBe(g.gameName);
  });
  test('a name already taken is refused, whoever asked for it', async () => {
    await expect(store.create('g3', true, 'bob the great')).rejects.toMatchObject({ code: 'taken' });
    await expect(store.create('u2', false, 'bob the great')).rejects.toMatchObject({ code: 'taken' });
  });
  test('a guest who asks for an unusable name is told, not quietly renamed', async () => {
    await expect(store.create('g4', true, '9lives')).rejects.toMatchObject({ code: 'invalid' });
  });
  test('check reports invalid and taken', async () => {
    expect(await store.check('Bob The Great')).toEqual({ ok: false, error: 'taken' });
    expect(await store.check('9lives')).toEqual({ ok: false, error: 'invalid' });
    expect(await store.check('Fresh Name')).toEqual({ ok: true, gameName: 'fresh_name' });
  });
  test('session returns credentials for an owned character only', async () => {
    const [c] = await store.list('u1');
    const s = await store.session('u1', c.id);
    expect(s.gameName).toBe('bob_the_grea');
    expect(s.secret).toMatch(/^[A-Za-z0-9]{20}$/);
    await expect(store.session('u2', c.id)).rejects.toMatchObject({ code: 'not_found' });
    const doc = await admin.db.doc(`characters/${c.id}`).get();
    expect(typeof doc.data()?.lastLoginAt).toBe('number');
  });
  test('softDelete hides the character, keeps the name reserved, refuses session', async () => {
    const list = await store.list('u1');
    const victim = list[1];
    await store.softDelete('u1', victim.id);
    expect((await store.list('u1')).map(x => x.id)).not.toContain(victim.id);
    expect(await store.check(victim.gameName)).toEqual({ ok: false, error: 'taken' });
    await expect(store.session('u1', victim.id)).rejects.toMatchObject({ code: 'deleted' });
    // the freed slot can be used again
    const again = await store.create('u1', false, 'replacement');
    expect(again.gameName).toBe('replacement');
  });
  test('get returns an owned live character, not_found for other uid, deleted for soft-deleted', async () => {
    const c = await store.create('u9', false, 'gettable');
    expect(await store.get('u9', c.id)).toEqual(c);
    await expect(store.get('u2', c.id)).rejects.toMatchObject({ code: 'not_found' });
    await store.softDelete('u9', c.id);
    await expect(store.get('u9', c.id)).rejects.toMatchObject({ code: 'deleted' });
  });
  test('list migrates a legacy gameAccounts document once', async () => {
    await admin.db.doc('gameAccounts/legacy').set({ gameName: 'oldtimer', secret: 'S'.repeat(20), createdAt: 5 });
    await admin.db.doc('gameNames/oldtimer').set({ uid: 'legacy' });
    const first = await store.list('legacy');
    expect(first).toHaveLength(1);
    expect(first[0].gameName).toBe('oldtimer');
    const second = await store.list('legacy');
    expect(second).toEqual(first);
    const s = await store.session('legacy', first[0].id);
    expect(s.secret).toBe('S'.repeat(20));
    expect((await admin.db.doc('gameNames/oldtimer').get()).data()).toEqual({ uid: 'legacy', characterId: first[0].id });
    // The legacy document is consumed by the migration, so migrate()'s pre-check really does
    // short-circuit from the second call on.
    expect((await admin.db.doc('gameAccounts/legacy').get()).exists).toBe(false);
  });
});
