import { randomInt } from 'node:crypto';
import type { Admin } from '../firebaseAdmin';
import { normaliseGameName, randomGuestName, randomSecret, withSuffix } from '../gameName';
import { CHARACTER_LIMITS, type CharacterDoc, type CharacterError, type CharacterSummary, type GameAccountDoc } from '../types';

export class CharacterStoreError extends Error {
  constructor(public readonly code: CharacterError) { super(code); }
}

export interface CharacterStore {
  list(uid: string): Promise<CharacterSummary[]>;
  check(name: string): Promise<{ ok: true; gameName: string } | { ok: false; error: 'invalid' | 'taken' }>;
  create(uid: string, isAnonymous: boolean, desired: string | null): Promise<CharacterSummary>;
  get(uid: string, id: string): Promise<CharacterSummary>;
  session(uid: string, id: string): Promise<{ gameName: string; secret: string }>;
  softDelete(uid: string, id: string): Promise<void>;
}

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const MAX_ATTEMPTS = 20;

export function newCharacterId(): string {
  let out = '';
  for (let i = 0; i < 20; i++) out += ID_ALPHABET[randomInt(ID_ALPHABET.length)];
  return out;
}

function summary(id: string, d: CharacterDoc): CharacterSummary {
  return { id, gameName: d.gameName, createdAt: d.createdAt, lastLoginAt: d.lastLoginAt };
}

export function createCharacterStore(admin: Admin): CharacterStore {
  const { db } = admin;

  /** One-time move of gameAccounts/{uid} into characters/{id}; idempotent. */
  async function migrate(uid: string): Promise<void> {
    const legacyRef = db.doc(`gameAccounts/${uid}`);
    // Cheap pre-check outside a transaction: the vast majority of calls have no
    // legacy account, and opening a transaction for every list()/create() call
    // is wasteful (and, empirically, can exhaust the emulator's transaction
    // slots under test load). Only pay for a transaction when migration might
    // actually be needed; the transaction re-checks existence to stay race-safe.
    const precheck = await legacyRef.get();
    if (!precheck.exists) return;
    const userRef = db.doc(`users/${uid}`);
    await db.runTransaction(async tx => {
      const [legacy, user] = await Promise.all([tx.get(legacyRef), tx.get(userRef)]);
      if (!legacy.exists) return;
      if ((user.data()?.characterIds as string[] | undefined)?.length) return;
      const d = legacy.data() as GameAccountDoc;
      const id = newCharacterId();
      const doc: CharacterDoc = { uid, gameName: d.gameName, secret: d.secret, createdAt: d.createdAt, lastLoginAt: null, deletedAt: null };
      tx.set(db.doc(`characters/${id}`), doc);
      tx.set(db.doc(`gameNames/${d.gameName}`), { uid, characterId: id });
      tx.set(userRef, { characterIds: [id] }, { merge: true });
      // Drop the legacy document in the same transaction. Without this the pre-check above
      // reads it on every later list()/create() for this uid and re-opens a transaction that
      // does nothing, so the "only pay when migration might be needed" saving never applies to
      // the accounts that actually migrated.
      tx.delete(legacyRef);
    });
  }

  /** Reads the ids of every character ever created for uid (live or soft-deleted). */
  async function characterIdsOf(uid: string): Promise<string[]> {
    const userSnap = await db.doc(`users/${uid}`).get();
    return (userSnap.data()?.characterIds as string[] | undefined) ?? [];
  }

  async function liveCharacters(uid: string): Promise<{ id: string; doc: CharacterDoc }[]> {
    const ids = await characterIdsOf(uid);
    if (ids.length === 0) return [];
    const snaps = await db.getAll(...ids.map(cid => db.doc(`characters/${cid}`)));
    return snaps
      .filter(s => s.exists)
      .map(s => ({ id: s.id, doc: s.data() as CharacterDoc }))
      .filter(c => c.doc.deletedAt === null)
      .sort((a, b) => a.doc.createdAt - b.doc.createdAt);
  }

  return {
    async list(uid) {
      await migrate(uid);
      return (await liveCharacters(uid)).map(c => summary(c.id, c.doc));
    },

    async check(name) {
      const gameName = normaliseGameName(name);
      if (!gameName) return { ok: false, error: 'invalid' };
      const idx = await db.doc(`gameNames/${gameName}`).get();
      return idx.exists ? { ok: false, error: 'taken' } : { ok: true, gameName };
    },

    async create(uid, isAnonymous, desired) {
      await migrate(uid);
      const limit = isAnonymous ? CHARACTER_LIMITS.anonymous : CHARACTER_LIMITS.password;
      // Whoever asks for a name gets that name (SP7 owner requirement 1): guests name their
      // character on the same pre-game form registered users do, and the availability check
      // they just passed has to mean something. The generated `guest_` name is only the
      // fallback for a guest who names nothing -- a registered user with no name is invalid.
      const base = desired ? normaliseGameName(desired) : (isAnonymous ? randomGuestName() : null);
      if (!base) throw new CharacterStoreError('invalid');
      const id = newCharacterId();
      const secret = randomSecret();
      const userRef = db.doc(`users/${uid}`);
      return db.runTransaction(async tx => {
        const userSnap = await tx.get(userRef);
        const existingIds = (userSnap.data()?.characterIds as string[] | undefined) ?? [];
        const owned = existingIds.length ? await tx.getAll(...existingIds.map(cid => db.doc(`characters/${cid}`))) : [];
        const live = owned.filter(s => s.exists && (s.data() as CharacterDoc).deletedAt === null).length;
        if (live >= limit) throw new CharacterStoreError('limit');
        let candidate = base;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          const idx = await tx.get(db.doc(`gameNames/${candidate}`));
          if (!idx.exists) {
            const doc: CharacterDoc = { uid, gameName: candidate, secret, createdAt: Date.now(), lastLoginAt: null, deletedAt: null };
            tx.set(db.doc(`characters/${id}`), doc);
            tx.set(db.doc(`gameNames/${candidate}`), { uid, characterId: id });
            tx.set(userRef, { characterIds: existingIds.concat(id) }, { merge: true });
            return summary(id, doc);
          }
          // Someone asked for a specific name: report the collision instead of suffixing. Only a
          // generated guest name (nothing was desired) may be retried with a suffix.
          if (desired) throw new CharacterStoreError('taken');
          candidate = withSuffix(base, attempt + 1);
        }
        throw new CharacterStoreError('taken');
      });
    },

    async get(uid, id) {
      const snap = await db.doc(`characters/${id}`).get();
      const d = snap.data() as CharacterDoc | undefined;
      if (!d || d.uid !== uid) throw new CharacterStoreError('not_found');
      if (d.deletedAt !== null) throw new CharacterStoreError('deleted');
      return summary(id, d);
    },

    async session(uid, id) {
      const ref = db.doc(`characters/${id}`);
      const snap = await ref.get();
      const d = snap.data() as CharacterDoc | undefined;
      if (!d || d.uid !== uid) throw new CharacterStoreError('not_found');
      if (d.deletedAt !== null) throw new CharacterStoreError('deleted');
      await ref.set({ lastLoginAt: Date.now() }, { merge: true });
      return { gameName: d.gameName, secret: d.secret };
    },

    async softDelete(uid, id) {
      const ref = db.doc(`characters/${id}`);
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const d = snap.data() as CharacterDoc | undefined;
        if (!d || d.uid !== uid) throw new CharacterStoreError('not_found');
        if (d.deletedAt !== null) throw new CharacterStoreError('deleted');
        tx.set(ref, { deletedAt: Date.now() }, { merge: true });
        tx.set(db.doc(`audit/${id}-${Date.now()}`), { kind: 'character_delete', uid, characterId: id, gameName: d.gameName, at: Date.now() });
      });
    }
  };
}
