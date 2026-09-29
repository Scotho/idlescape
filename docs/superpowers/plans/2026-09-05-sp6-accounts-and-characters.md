# SP6 — Accounts and Characters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-uid-one-game-account bridge with persistent Firebase-owned characters (guest 1, registered 3), a home page with Play as Guest / Log In / Create Account plus live player count and patch notes, a no-character gate with a lightweight creation form, a Characters panel that switches the single live client between characters, and a human-only guarded deletion flow.

**Architecture:** The front server gains a `characters` Firestore collection with a uniqueness index, a `principal` module that classifies every bearer as human or agent, and character routes that only accept human principals. The web shell's `entry` state becomes `home` (explicit guest click) followed by a `characters` gate that runs before the client bundle loads; `startSession(characterId)` mints credentials from `POST /api/characters/:id/session`. The client stays single-instance in this sub-project (switching = logout, then login as the other character); SP7 adds iframes per character on top of the same routes and panel.

**Tech Stack:** Bun front server (`server/`, `bun test` against the Firebase emulators), Vite + TypeScript shell (`web/`, Vitest + jsdom, Playwright), Firestore rules (`firebase/`, `@firebase/rules-unit-testing`).

**Spec:** `docs/superpowers/specs/2026-09-05-multi-character-platform-design.md` sections 4, 6, 9 (principal module only), 10 (SP6 row), 11.

## Global Constraints

- Strict TypeScript, no new `as any`, files under 400 lines, `types.ts` per package, conventional commits (`docs/superpowers/specs/2026-09-05-idlescape-roadmap-and-handoff.md` section 5).
- Character limits: anonymous uid **1**, password uid **3** (spec section 4). Game-name rules unchanged: `server/src/gameName.ts` (`^[a-z][a-z0-9_]*$`, max 12).
- Character routes accept **only** Firebase ID tokens (human principal); an agent bearer gets 403 (spec section 9). Deletion additionally requires a fresh `auth_time` (within 300 s) for password users and the typed phrase `delete <gameName>`.
- Names are never released: `gameNames/{name}` keeps its entry after deletion (spec section 4).
- Do not touch `engine/`, the live PoC (8888/43594/8898), or deploy. The `.sav` file of a deleted character stays on disk until SP8's engine overlay; SP6 deletion is a soft delete that refuses future session mints.
- Keep `web/e2e/gameplay.pw.test.ts` and `web/e2e/gate-to-game.pw.test.ts` green; where the entry screen changes, update the specs in the same task (Task 12).
- Branch: `feat/platform-shell`. Commit trailers on every commit:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
  ```
- Commands (Git Bash, from the repo root): server — `cd server && ~/.bun/bin/bun test` (needs `cd firebase && npm run emulators` running: auth 9099, firestore 8080) and `~/.bun/bin/bun run typecheck`; web — `cd web && npm run typecheck && npm run lint && npx vitest run`; rules — `cd firebase && npm test`; e2e — stack up per `scripts/verify.ps1` step 6, then `cd web && npx playwright test`.

## Interfaces from earlier work

- `server/src/firebaseAdmin.ts`: `initAdmin(env) -> Admin { auth, db }` (firebase-admin).
- `server/src/bridge.ts`: `createBridge(admin).resolve(uid, isAnonymous, desiredName)` and the `gameAccounts/{uid}`, `gameNames/{name}` documents it writes (`server/src/types.ts` `GameAccountDoc`). Kept until Task 3 migrates callers; removed in Task 12.
- `server/src/gameName.ts`: `normaliseGameName`, `randomGuestName`, `randomSecret`, `withSuffix`, `GAME_NAME_MAX`.
- `server/src/router.ts`: `classify(pathname, isUpgrade): Route`; `server/src/index.ts` dispatches on `route.kind` and applies the gate.
- `server/src/pair/routes.ts` `verifyBearer` pattern (Firebase bearer → uid) — superseded by Task 2.
- `web/src/main.ts`: `state` (`createAppState`), `startSession()`, `enterApp()`, `renderIdentityStrip()`, `setButtonsEnabled()`; `web/src/api.ts` fetch helpers; `web/src/partials/entry.html` ids; `web/src/plugins/types.ts` `PluginContext`, `definePlugin`; `web/src/frame/panels.ts` panel controller.
- `web/src/clientTypes.ts` `ClientHooks` with `login(gameName, secret)`, `logout()`, `getState()`.

---

## File Structure

- `server/src/characters/store.ts` — **Create.** Firestore transactions: list (with lazy migration from `gameAccounts`), check, create, session, softDelete.
- `server/src/characters/routes.ts` — **Create.** HTTP handlers for the five routes; validation; 4xx mapping.
- `server/src/auth/principal.ts` — **Create.** `authenticate(req)`; human via `verifyIdToken`, agent via `csa_` prefix + `agentTokens` hash lookup.
- `server/src/router.ts` — **Modify.** `characters` route kind, `principal` field on every route.
- `server/src/index.ts` — **Modify.** Principal enforcement, character dispatch, health players.
- `server/src/health.ts`, `server/src/env.ts`, `server/src/types.ts` — **Modify.** `players` from the engine management `/prometheus`; `ENGINE_MANAGEMENT_HTTP`.
- `firebase/firestore.rules` — **Modify.** `characters/*` server-only; `users/{uid}.characterIds` server-only.
- `web/src/partials/home.html` — **Create** (replaces `entry.html`). Three choices, identity strip, email forms, connect sub-view, player count, patch notes.
- `web/src/partials/characters.html` — **Create.** No-character gate with the creation form.
- `web/src/data/patchNotes.json` — **Create.** Bundled patch notes.
- `web/src/characters/api.ts` — **Create.** Typed fetches for the character routes.
- `web/src/characters/gate.ts` — **Create.** The `characters` state controller (list, create, pick first).
- `web/src/plugins/builtin/characters.ts` — **Create.** Characters panel plugin: list, switch, create, delete.
- `web/src/main.ts`, `web/src/state.ts`, `web/src/types.ts`, `web/src/api.ts`, `web/index.html` — **Modify.**
- Tests: `server/src/characters/store.test.ts`, `server/src/characters/routes.test.ts`, `server/src/auth/principal.test.ts`, `server/src/router.test.ts`, `server/src/health.test.ts`, `firebase/rules.test.ts`, `web/src/characters/gate.test.ts`, `web/src/plugins/builtin/characters.test.ts`, `web/src/state.test.ts`, `web/e2e/characters.pw.test.ts`, plus edits to `web/e2e/helpers.ts` and `web/e2e/gate-to-game.pw.test.ts`.

---

### Task 1: Character store (Firestore transactions)

**Files:**
- Create: `server/src/characters/store.ts`
- Modify: `server/src/types.ts` (append the types below)
- Test: `server/src/characters/store.test.ts`

**Interfaces:**
- Consumes: `Admin` from `./firebaseAdmin`; `normaliseGameName`, `randomGuestName`, `randomSecret`, `withSuffix` from `./gameName`; `GameAccountDoc`.
- Produces (append to `server/src/types.ts`):
  ```ts
  export interface CharacterDoc { uid: string; gameName: string; secret: string; createdAt: number; lastLoginAt: number | null; deletedAt: number | null }
  export interface CharacterSummary { id: string; gameName: string; createdAt: number; lastLoginAt: number | null }
  export type CharacterError = 'limit' | 'taken' | 'invalid' | 'not_found' | 'deleted';
  export const CHARACTER_LIMITS = { anonymous: 1, password: 3 } as const;
  ```
  and `server/src/characters/store.ts`:
  ```ts
  export interface CharacterStore {
    list(uid: string): Promise<CharacterSummary[]>;                       // lazily migrates gameAccounts/{uid}
    check(name: string): Promise<{ ok: true; gameName: string } | { ok: false; error: 'invalid' | 'taken' }>;
    create(uid: string, isAnonymous: boolean, desired: string | null): Promise<CharacterSummary>;  // throws CharacterStoreError
    session(uid: string, id: string): Promise<{ gameName: string; secret: string }>;             // throws CharacterStoreError
    softDelete(uid: string, id: string): Promise<void>;                                            // throws CharacterStoreError
  }
  export class CharacterStoreError extends Error { constructor(public readonly code: CharacterError) { super(code); } }
  export function createCharacterStore(admin: Admin): CharacterStore
  ```
  Firestore layout: `characters/{id}` = `CharacterDoc`; `gameNames/{name}` = `{ uid, characterId }`; `users/{uid}.characterIds: string[]` (server-written).

- [ ] **Step 1: Write the failing store test**

```ts
// server/src/characters/store.test.ts
import { beforeAll, describe, expect, test } from 'bun:test';
import { createCharacterStore, CharacterStoreError } from './store';
import { initAdmin } from './../firebaseAdmin';
import { loadEnv } from '../env';

// Requires: cd firebase && npm run emulators (auth 9099, firestore 8080).
const env = loadEnv({ GATE_ENABLED: 'false', FIREBASE_EMULATORS: 'true', FIREBASE_PROJECT_ID: 'idlescape-osrs' });
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
  test('guests get 1 character with a guest_ name and ignore desired', async () => {
    const g = await store.create('g1', true, 'ignored');
    expect(g.gameName).toMatch(/^guest_[a-z0-9]{6}$/);
    await expect(store.create('g1', true, null)).rejects.toMatchObject({ code: 'limit' });
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
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && ~/.bun/bin/bun test src/characters/store.test.ts`
Expected: FAIL with "Cannot find module './store'".

- [ ] **Step 3: Append the types and write the store**

Append to `server/src/types.ts`:

```ts
export interface CharacterDoc { uid: string; gameName: string; secret: string; createdAt: number; lastLoginAt: number | null; deletedAt: number | null }
export interface CharacterSummary { id: string; gameName: string; createdAt: number; lastLoginAt: number | null }
export type CharacterError = 'limit' | 'taken' | 'invalid' | 'not_found' | 'deleted';
export const CHARACTER_LIMITS = { anonymous: 1, password: 3 } as const;
```

```ts
// server/src/characters/store.ts
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
    });
  }

  async function liveCharacters(uid: string): Promise<{ id: string; doc: CharacterDoc }[]> {
    const snap = await db.collection('characters').where('uid', '==', uid).get();
    return snap.docs
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
      const base = (desired && !isAnonymous ? normaliseGameName(desired) : null) ?? (isAnonymous ? randomGuestName() : null);
      if (!base) throw new CharacterStoreError('invalid');
      const id = newCharacterId();
      const secret = randomSecret();
      return db.runTransaction(async tx => {
        const owned = await tx.get(db.collection('characters').where('uid', '==', uid));
        const live = owned.docs.filter(s => (s.data() as CharacterDoc).deletedAt === null).length;
        if (live >= limit) throw new CharacterStoreError('limit');
        let candidate = base;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          const idx = await tx.get(db.doc(`gameNames/${candidate}`));
          if (!idx.exists) {
            const doc: CharacterDoc = { uid, gameName: candidate, secret, createdAt: Date.now(), lastLoginAt: null, deletedAt: null };
            tx.set(db.doc(`characters/${id}`), doc);
            tx.set(db.doc(`gameNames/${candidate}`), { uid, characterId: id });
            const ids = owned.docs.map(s => s.id).concat(id);
            tx.set(db.doc(`users/${uid}`), { characterIds: ids }, { merge: true });
            return summary(id, doc);
          }
          // A registered user asked for a specific name: report the collision instead of suffixing.
          if (!isAnonymous && desired) throw new CharacterStoreError('taken');
          candidate = withSuffix(base, attempt + 1);
        }
        throw new CharacterStoreError('taken');
      });
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
```

Note: `desired` for a registered user is honoured exactly or rejected with `taken`, so the web form's availability check and the create result agree. Guests always get a random `guest_` name with suffix retry.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd server && ~/.bun/bin/bun test src/characters/store.test.ts`
Expected: 7 pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/characters/store.ts server/src/characters/store.test.ts server/src/types.ts
git commit -m "feat(server): characters store with limits, name index, session, soft delete, legacy migration"
```

---

### Task 2: Principal module

**Files:**
- Create: `server/src/auth/principal.ts`
- Test: `server/src/auth/principal.test.ts`

**Interfaces:**
- Consumes: `Admin`; `hashSecret` from `server/src/pair/token.ts` (sha256 of the agent token; verify the export name there and reuse it); `agentTokens/{id}` fields `uid`, `secretHash`, `revokedAt`.
- Produces:
  ```ts
  export type Principal =
    | { kind: 'human'; uid: string; isAnonymous: boolean; authTime: number }   // authTime in ms
    | { kind: 'agent'; uid: string; tokenId: string };
  export const AGENT_PREFIX = 'csa_';
  export function bearerOf(req: Request): string | null;
  export function createAuthenticator(admin: Admin): { authenticate(req: Request): Promise<Principal | null> };
  ```

- [ ] **Step 1: Write the failing test**

```ts
// server/src/auth/principal.test.ts
import { beforeAll, describe, expect, test } from 'bun:test';
import { createAuthenticator, AGENT_PREFIX } from './principal';
import { initAdmin } from '../firebaseAdmin';
import { loadEnv } from '../env';
import { hashSecret } from '../pair/token';

const env = loadEnv({ GATE_ENABLED: 'false', FIREBASE_EMULATORS: 'true', FIREBASE_PROJECT_ID: 'idlescape-osrs' });
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
  await admin.db.doc('agentTokens/t1').set({ uid: 'owner', label: 'x', createdAt: 1, lastSeenAt: null, revokedAt: null, secretHash: hashSecret('a'.repeat(40)) });
  await admin.db.doc('agentTokens/t2').set({ uid: 'owner', label: 'x', createdAt: 1, lastSeenAt: null, revokedAt: 2, secretHash: hashSecret('b'.repeat(40)) });
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
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && ~/.bun/bin/bun test src/auth/principal.test.ts`
Expected: FAIL, module not found. If `hashSecret` is not the export name in `server/src/pair/token.ts`, use the sha256 helper that file exports and adjust the import in both files.

- [ ] **Step 3: Implement**

```ts
// server/src/auth/principal.ts
import type { Admin } from '../firebaseAdmin';
import { hashSecret } from '../pair/token';

export type Principal =
  | { kind: 'human'; uid: string; isAnonymous: boolean; authTime: number }
  | { kind: 'agent'; uid: string; tokenId: string };

export const AGENT_PREFIX = 'csa_';

export function bearerOf(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

export function createAuthenticator(admin: Admin): { authenticate(req: Request): Promise<Principal | null> } {
  return {
    async authenticate(req) {
      const bearer = bearerOf(req);
      if (!bearer) return null;
      if (bearer.startsWith(AGENT_PREFIX)) {
        const secret = bearer.slice(AGENT_PREFIX.length);
        const snap = await admin.db.collection('agentTokens').where('secretHash', '==', hashSecret(secret)).limit(1).get();
        const doc = snap.docs[0];
        if (!doc) return null;
        const d = doc.data() as { uid: string; revokedAt: number | null };
        if (d.revokedAt !== null) return null;
        await doc.ref.set({ lastSeenAt: Date.now() }, { merge: true });
        return { kind: 'agent', uid: d.uid, tokenId: doc.id };
      }
      try {
        const decoded = await admin.auth.verifyIdToken(bearer);
        return {
          kind: 'human',
          uid: decoded.uid,
          isAnonymous: decoded.firebase.sign_in_provider === 'anonymous',
          authTime: decoded.auth_time * 1000
        };
      } catch {
        return null;
      }
    }
  };
}
```

Existing agent tokens minted before this task have no `csa_` prefix. Task 3 makes the exchange route mint prefixed secrets; old tokens keep working through `/mcp` once SP4 lands because `/mcp` will call the same authenticator with the prefix stripped only if present. No migration needed now.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd server && ~/.bun/bin/bun test src/auth/principal.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/auth/principal.ts server/src/auth/principal.test.ts
git commit -m "feat(server): principal module classifying firebase and csa_ agent bearers"
```

---

### Task 3: Character routes, router classification, principal enforcement

**Files:**
- Create: `server/src/characters/routes.ts`
- Modify: `server/src/router.ts`, `server/src/index.ts`, `server/src/pair/routes.ts` (exchange mints `csa_` secrets)
- Test: `server/src/characters/routes.test.ts`, `server/src/router.test.ts` (append)

**Interfaces:**
- Consumes: `CharacterStore`, `CharacterStoreError` (Task 1); `Principal`, `createAuthenticator` (Task 2).
- Produces:
  ```ts
  // router.ts additions
  | { kind: 'characters'; sub: 'list' | 'check' | 'create' | 'session' | 'delete'; id?: string }
  export type PrincipalRule = 'human' | 'agent' | 'either' | 'none';
  export function principalRule(route: Route): PrincipalRule;   // characters -> 'human'; bridge -> 'human'; pair mint/revoke -> 'human'; everything else -> 'none'
  // characters/routes.ts
  export function createCharacterRoutes(deps: { store: CharacterStore }): { handle(req: Request, route: Route & { kind: 'characters' }, principal: Principal & { kind: 'human' }): Promise<Response> };
  ```
  Routes: `GET /api/characters` → `{ characters: CharacterSummary[] }`; `GET /api/characters/check?name=` → `{ ok, gameName? , error? }`; `POST /api/characters` body `{ desiredName? }` → 201 `CharacterSummary` or 409 `{ error: 'limit' | 'taken' | 'invalid' }`; `POST /api/characters/:id/session` → `{ gameName, secret }` or 404/410; `DELETE /api/characters/:id` body `{ confirm: string }` → 204, 400 `{ error: 'confirm' }`, 403 `{ error: 'reauth' }` when a password user's `authTime` is older than 300 s, 404/410.

- [ ] **Step 1: Write the failing router test cases** (append to `server/src/router.test.ts`)

```ts
import { classify, principalRule } from './router';

describe('characters routes', () => {
  test('classifies list, check, create, session, delete', () => {
    expect(classify('/api/characters', false)).toEqual({ kind: 'characters', sub: 'list' });
    expect(classify('/api/characters/check', false)).toEqual({ kind: 'characters', sub: 'check' });
    expect(classify('/api/characters/abcDEF123_-abcDEF123/session', false)).toEqual({ kind: 'characters', sub: 'session', id: 'abcDEF123_-abcDEF123' });
    expect(classify('/api/characters/abcDEF123_-abcDEF123', false)).toEqual({ kind: 'characters', sub: 'delete', id: 'abcDEF123_-abcDEF123' });
    expect(classify('/api/characters/../x', false)).toEqual({ kind: 'notfound' });
  });
  test('principal rules', () => {
    expect(principalRule({ kind: 'characters', sub: 'list' })).toBe('human');
    expect(principalRule({ kind: 'bridge' })).toBe('human');
    expect(principalRule({ kind: 'pair', sub: 'mint' })).toBe('human');
    expect(principalRule({ kind: 'pair', sub: 'exchange', token: 't' })).toBe('none');
    expect(principalRule({ kind: 'health' })).toBe('none');
  });
});
```

Note `list` and `create` share the path `/api/characters`; the method decides. `classify` returns `sub: 'list'` for the path and `index.ts` maps `POST` to `create` (see Step 3). The same holds for `/api/characters/:id`: `DELETE` is delete; other methods 405.

- [ ] **Step 2: Write the failing routes test**

```ts
// server/src/characters/routes.test.ts
import { beforeAll, describe, expect, test } from 'bun:test';
import { createCharacterRoutes } from './routes';
import { createCharacterStore } from './store';
import { initAdmin } from '../firebaseAdmin';
import { loadEnv } from '../env';
import type { Principal } from '../auth/principal';

const env = loadEnv({ GATE_ENABLED: 'false', FIREBASE_EMULATORS: 'true', FIREBASE_PROJECT_ID: 'idlescape-osrs' });
const admin = initAdmin(env);
const routes = createCharacterRoutes({ store: createCharacterStore(admin) });
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
    expect(((await list.json()) as { characters: unknown[] }).characters).toHaveLength(1);
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
  });
  test('limit -> 409', async () => {
    for (const n of ['b1', 'b2', 'b3']) expect((await routes.handle(json('POST', '/api/characters', { desiredName: n }), { kind: 'characters', sub: 'create' }, human('u3'))).status).toBe(201);
    const res = await routes.handle(json('POST', '/api/characters', { desiredName: 'b4' }), { kind: 'characters', sub: 'create' }, human('u3'));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'limit' });
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `cd server && ~/.bun/bin/bun test src/router.test.ts src/characters/routes.test.ts`
Expected: FAIL (`principalRule` not exported; `./routes` missing).

- [ ] **Step 4: Implement the router changes**

In `server/src/router.ts`:

```ts
export type Route =
  | ...existing members...
  | { kind: 'characters'; sub: 'list' | 'check' | 'create' | 'session' | 'delete'; id?: string }
  | { kind: 'notfound' };

export type PrincipalRule = 'human' | 'agent' | 'either' | 'none';

const CHAR_ID = /^[A-Za-z0-9_-]{20}$/;

// inside classify(), before the CACHE_PREFIXES check:
  if (pathname === '/api/characters') return { kind: 'characters', sub: 'list' };
  if (pathname === '/api/characters/check') return { kind: 'characters', sub: 'check' };
  const charSession = pathname.match(/^\/api\/characters\/([^/]+)\/session$/);
  if (charSession) return CHAR_ID.test(charSession[1]) ? { kind: 'characters', sub: 'session', id: charSession[1] } : { kind: 'notfound' };
  const charOne = pathname.match(/^\/api\/characters\/([^/]+)$/);
  if (charOne) return CHAR_ID.test(charOne[1]) ? { kind: 'characters', sub: 'delete', id: charOne[1] } : { kind: 'notfound' };

export function principalRule(route: Route): PrincipalRule {
  switch (route.kind) {
    case 'characters': return 'human';
    case 'bridge': return 'human';
    case 'pair': return route.sub === 'mint' || route.sub === 'revoke' ? 'human' : 'none';
    default: return 'none';
  }
}
```

- [ ] **Step 5: Implement the routes**

```ts
// server/src/characters/routes.ts
import type { Principal } from '../auth/principal';
import type { Route } from '../router';
import { CharacterStoreError, type CharacterStore } from './store';

const REAUTH_WINDOW_MS = 300_000;
type CharRoute = Route & { kind: 'characters' };

function statusFor(code: string): number {
  switch (code) {
    case 'not_found': return 404;
    case 'deleted': return 410;
    case 'limit': case 'taken': case 'invalid': return 409;
    default: return 500;
  }
}

async function bodyOf(req: Request): Promise<Record<string, unknown>> {
  try { return (await req.json()) as Record<string, unknown>; } catch { return {}; }
}

export function createCharacterRoutes(deps: { store: CharacterStore }) {
  const { store } = deps;
  return {
    async handle(req: Request, route: CharRoute, principal: Principal & { kind: 'human' }): Promise<Response> {
      const sub = route.sub === 'list' && req.method === 'POST' ? 'create' : route.sub;
      try {
        switch (sub) {
          case 'list': {
            if (req.method !== 'GET') return new Response(null, { status: 405 });
            return Response.json({ characters: await store.list(principal.uid) });
          }
          case 'check': {
            const name = new URL(req.url).searchParams.get('name') ?? '';
            return Response.json(await store.check(name));
          }
          case 'create': {
            const body = await bodyOf(req);
            const desired = typeof body.desiredName === 'string' ? body.desiredName : null;
            const created = await store.create(principal.uid, principal.isAnonymous, desired);
            return Response.json(created, { status: 201 });
          }
          case 'session': {
            if (req.method !== 'POST') return new Response(null, { status: 405 });
            return Response.json(await store.session(principal.uid, route.id!));
          }
          case 'delete': {
            if (req.method !== 'DELETE') return new Response(null, { status: 405 });
            if (!principal.isAnonymous && Date.now() - principal.authTime > REAUTH_WINDOW_MS) return Response.json({ error: 'reauth' }, { status: 403 });
            const body = await bodyOf(req);
            const target = (await store.list(principal.uid)).find(c => c.id === route.id);
            if (!target) return Response.json({ error: 'not_found' }, { status: 404 });
            if (body.confirm !== `delete ${target.gameName}`) return Response.json({ error: 'confirm' }, { status: 400 });
            await store.softDelete(principal.uid, route.id!);
            return new Response(null, { status: 204 });
          }
        }
      } catch (err) {
        if (err instanceof CharacterStoreError) return Response.json({ error: err.code }, { status: statusFor(err.code) });
        console.error('[characters]', err);
        return Response.json({ error: 'characters failed' }, { status: 500 });
      }
      return new Response('Not found', { status: 404 });
    }
  };
}
```

- [ ] **Step 6: Wire `index.ts`**

In `server/src/index.ts`: construct `const authn = createAuthenticator(admin)`, `const characterStore = createCharacterStore(admin)`, `const characterRoutes = createCharacterRoutes({ store: characterStore })`. Replace the dispatch so that, after the gate check, the principal rule is enforced before any handler:

```ts
    if (!gate.isOpen(req)) return gate.deny();
    const rule = principalRule(route);
    let principal: Principal | null = null;
    if (rule !== 'none') {
      principal = await authn.authenticate(req);
      if (!principal) return Response.json({ error: 'unauthorized' }, { status: 401 });
      if (rule === 'human' && principal.kind !== 'human') return Response.json({ error: 'human_only' }, { status: 403 });
      if (rule === 'agent' && principal.kind !== 'agent') return Response.json({ error: 'agent_only' }, { status: 403 });
    }
    switch (route.kind) {
      case 'characters': return characterRoutes.handle(req, route, principal as Principal & { kind: 'human' });
      ...existing cases unchanged...
```

`bridge` and pair `mint`/`revoke` keep their own bearer parsing for now (they re-verify; harmless). In `server/src/pair/routes.ts` exchange, prefix the returned secret: `agentToken: AGENT_PREFIX + secret` while storing `hashSecret(secret)` unchanged, so Task 2's authenticator finds it. Update `server/src/pair/routes.test.ts` expectations for the prefix.

- [ ] **Step 7: Run the server suite and typecheck**

Run: `cd server && ~/.bun/bin/bun run typecheck && ~/.bun/bin/bun test`
Expected: all pass (router, routes, principal, store, pair, bridge, gate, health, proxy).

- [ ] **Step 8: Commit**

```bash
git add server/src
git commit -m "feat(server): character routes with human-only principal enforcement; csa_ agent token prefix"
```

---

### Task 4: Firestore rules for characters

**Files:**
- Modify: `firebase/firestore.rules`
- Test: `firebase/rules.test.ts` (append)

- [ ] **Step 1: Write the failing rules tests** (append inside the file)

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd firebase && npm test`
Expected: the two new tests fail (characters readable/writable is not the case yet, but `characterIds` on create currently succeeds).

- [ ] **Step 3: Update the rules**

In `firebase/firestore.rules`: extend the `users/{uid}` create rule with `&& !('characterIds' in request.resource.data)` and the update rule's `hasAny([...])` list with `'characterIds'`; add

```
    match /characters/{id} { allow read, write: if false; }
    match /audit/{id}      { allow read, write: if false; }
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd firebase && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add firebase/firestore.rules firebase/rules.test.ts
git commit -m "feat(rules): characters and audit server-only; characterIds server-written"
```

---

### Task 5: Live player count on `/api/health`

**Files:**
- Modify: `server/src/health.ts`, `server/src/env.ts`, `server/src/types.ts`, `server/src/index.ts`, `server/.env.example`, `web/src/types.ts`
- Test: `server/src/health.test.ts` (append)

**Interfaces:**
- Produces: `HealthSnapshot.players: number | null` (null when the management port is unreachable); `Env.engineManagementHttp` from `ENGINE_MANAGEMENT_HTTP` (default `http://127.0.0.1:8897`); `createHealth` gains `engineManagementHttp` in its options; `parsePlayerGauge(text: string): number | null` exported for tests.

- [ ] **Step 1: Write the failing test** (append)

```ts
import { parsePlayerGauge } from './health';

describe('players gauge', () => {
  test('parses the prometheus line', () => {
    expect(parsePlayerGauge('# HELP lostcity_active_players Active player count.\n# TYPE lostcity_active_players gauge\nlostcity_active_players 7\n')).toBe(7);
    expect(parsePlayerGauge('nothing here')).toBeNull();
  });
  test('probe fills players from the management endpoint and nulls it on failure', async () => {
    const h = createHealth({ engineHttp: 'http://engine', engineManagementHttp: 'http://mgmt', intervalMs: 60_000, gateEnabled: false,
      fetchImpl: (async (url: string | URL | Request) => String(url).startsWith('http://mgmt')
        ? new Response('lostcity_active_players 3\n', { status: 200 })
        : new Response('', { status: 200 })) as typeof fetch });
    await h.probe();
    expect(h.snapshot().players).toBe(3);
    h.setFetch((async () => { throw new Error('down'); }) as typeof fetch);
    await h.probe();
    expect(h.snapshot().players).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && ~/.bun/bin/bun test src/health.test.ts`
Expected: FAIL (`parsePlayerGauge` missing; `players` undefined).

- [ ] **Step 3: Implement**

`server/src/types.ts`: add `engineManagementHttp: string` to `Env` and `players: number | null` to `HealthSnapshot`. `server/src/env.ts`: `engineManagementHttp: str(source, 'ENGINE_MANAGEMENT_HTTP', 'http://127.0.0.1:8897')`. `server/.env.example`: add `ENGINE_MANAGEMENT_HTTP=http://127.0.0.1:8897` with a comment that 8897 is the dev engine's management port and must never be exposed. `web/src/types.ts` `HealthSnapshot`: add `players: number | null`.

```ts
// server/src/health.ts additions
export function parsePlayerGauge(text: string): number | null {
  const m = text.match(/^lostcity_active_players\s+(\d+)/m);
  return m ? Number(m[1]) : null;
}
// in createHealth: opts gains engineManagementHttp: string; state gains `let players: number | null = null;`
// at the end of probe():
    try {
      const res = await fetchImpl(`${opts.engineManagementHttp}/prometheus`, { signal: AbortSignal.timeout(3000) });
      players = res.ok ? parsePlayerGauge(await res.text()) : null;
    } catch {
      players = null;
    }
// snapshot(): add `players`
```

`server/src/index.ts`: pass `engineManagementHttp: env.engineManagementHttp` to `createHealth`. Existing `createHealth` call sites in tests gain the same option.

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && ~/.bun/bin/bun run typecheck && ~/.bun/bin/bun test src/health.test.ts src/env.test.ts`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add server/src server/.env.example web/src/types.ts
git commit -m "feat(server): live player count on /api/health from the engine management gauge"
```

---

### Task 6: Web character API client and app-state values

**Files:**
- Create: `web/src/characters/api.ts`
- Modify: `web/src/types.ts`, `web/src/state.ts` (no change needed if it is generic over `AppState`), `web/src/api.ts` (remove `bridge` in Task 12 only)
- Test: `web/src/characters/api.test.ts`, `web/src/state.test.ts` (append)

**Interfaces:**
- Produces (in `web/src/types.ts`):
  ```ts
  export type AppState = 'gate' | 'home' | 'characters' | 'playing' | 'offline';
  export type HomeView = 'choices' | 'login' | 'signup' | 'connect';
  export interface CharacterSummary { id: string; gameName: string; createdAt: number; lastLoginAt: number | null }
  export type PanelId = 'claude' | 'xp' | 'loot' | 'connect' | 'account' | 'config' | 'plugins' | 'characters';
  ```
  and `web/src/characters/api.ts`:
  ```ts
  export async function listCharacters(idToken: string): Promise<CharacterSummary[]>;
  export async function checkName(idToken: string, name: string): Promise<{ ok: true; gameName: string } | { ok: false; error: 'invalid' | 'taken' }>;
  export async function createCharacter(idToken: string, desiredName?: string): Promise<CharacterSummary>;   // throws Error(code) on 409
  export async function mintSession(idToken: string, id: string): Promise<{ gameName: string; secret: string }>;
  export async function deleteCharacter(idToken: string, id: string, confirm: string): Promise<void>;         // throws Error('reauth' | 'confirm' | ...)
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// web/src/characters/api.test.ts
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createCharacter, deleteCharacter, listCharacters, mintSession } from './api';

function mockFetch(status: number, body: unknown) {
  const f = vi.fn(async () => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', f);
  return f;
}
afterEach(() => vi.unstubAllGlobals());

describe('characters api', () => {
  test('list sends the bearer and unwraps', async () => {
    const f = mockFetch(200, { characters: [{ id: 'c1', gameName: 'a', createdAt: 1, lastLoginAt: null }] });
    expect(await listCharacters('tok')).toEqual([{ id: 'c1', gameName: 'a', createdAt: 1, lastLoginAt: null }]);
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ authorization: 'Bearer tok' });
  });
  test('create surfaces the 409 error code', async () => {
    mockFetch(409, { error: 'limit' });
    await expect(createCharacter('tok', 'x')).rejects.toThrow('limit');
  });
  test('mintSession returns credentials', async () => {
    mockFetch(200, { gameName: 'a', secret: 's' });
    expect(await mintSession('tok', 'c1')).toEqual({ gameName: 'a', secret: 's' });
  });
  test('delete resolves on 204 and throws the code otherwise', async () => {
    mockFetch(204, null);
    await expect(deleteCharacter('tok', 'c1', 'delete a')).resolves.toBeUndefined();
    mockFetch(403, { error: 'reauth' });
    await expect(deleteCharacter('tok', 'c1', 'delete a')).rejects.toThrow('reauth');
  });
});
```

Append to `web/src/state.test.ts`:

```ts
test('accepts the home and characters states', () => {
  const s = createAppState();
  const seen: string[] = [];
  s.onChange(v => seen.push(v));
  s.set('home'); s.set('characters'); s.set('playing');
  expect(seen).toEqual(['home', 'characters', 'playing']);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run src/characters src/state.test.ts`
Expected: FAIL (module missing; `'home'` not assignable).

- [ ] **Step 3: Implement**

Update `web/src/types.ts` per the interface block. Then:

```ts
// web/src/characters/api.ts
import type { CharacterSummary } from '../types';

const JSON_HEADERS = { 'content-type': 'application/json' };

async function call<T>(idToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, headers: { ...JSON_HEADERS, ...(init.headers ?? {}), authorization: `Bearer ${idToken}` }, credentials: 'same-origin' });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(body.error ?? `characters ${res.status}`);
  return body;
}

export async function listCharacters(idToken: string): Promise<CharacterSummary[]> {
  return (await call<{ characters: CharacterSummary[] }>(idToken, '/api/characters')).characters;
}
export function checkName(idToken: string, name: string): Promise<{ ok: true; gameName: string } | { ok: false; error: 'invalid' | 'taken' }> {
  return call(idToken, `/api/characters/check?name=${encodeURIComponent(name)}`);
}
export function createCharacter(idToken: string, desiredName?: string): Promise<CharacterSummary> {
  return call(idToken, '/api/characters', { method: 'POST', body: JSON.stringify(desiredName ? { desiredName } : {}) });
}
export function mintSession(idToken: string, id: string): Promise<{ gameName: string; secret: string }> {
  return call(idToken, `/api/characters/${id}/session`, { method: 'POST' });
}
export function deleteCharacter(idToken: string, id: string, confirm: string): Promise<void> {
  return call(idToken, `/api/characters/${id}`, { method: 'DELETE', body: JSON.stringify({ confirm }) });
}
```

`web/src/main.ts` will not compile until Task 8 renames `'entry'`; for this task change the `screens` record in `main.ts` to `{ gate: 'screen-gate', home: 'screen-entry', characters: 'screen-entry', playing: 'screen-frame', offline: 'screen-frame' }` and every `state.set('entry')` to `state.set('home')` so typecheck stays green.

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `cd web && npx vitest run && npm run typecheck && npm run lint`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat(web): characters api client; home and characters app states"
```

---

### Task 7: Home page partial with three choices, player count and patch notes

**Files:**
- Create: `web/src/partials/home.html`, `web/src/data/patchNotes.json`, `web/src/home/view.ts`
- Modify: `web/index.html` (include `home.html` instead of `entry.html`), `web/src/styles/auth.css`, delete `web/src/partials/entry.html`
- Test: `web/src/home/view.test.ts`

**Interfaces:**
- Produces `web/src/home/view.ts`:
  ```ts
  export interface HomeDeps { onGuest(): void; onShowLogin(): void; onShowSignup(): void; onShowConnect(): void; onBack(): void }
  export function createHomeView(root: HTMLElement, deps: HomeDeps): { setView(v: HomeView): void; setPlayers(n: number | null): void; renderPatchNotes(notes: PatchNote[]): void; setBusy(busy: boolean): void; setError(msg: string | null): void }
  export interface PatchNote { date: string; title: string; items: string[] }
  ```
  Element ids (Playwright relies on them): `#screen-home` (rename of `#screen-entry`), `#btn-guest`, `#btn-show-login`, `#btn-show-signup`, `#btn-connect` (secondary link), `#home-players`, `#home-patch-notes`, `#home-error`, `#home-busy`, `#btn-home-back`; the existing `#signin-form`, `#signup-form`, `#entry-connect-view`, `#entry-connect-host`, `#btn-connect-login`, `#btn-entry-back`, `#entry-identity`, `#entry-account-link`, `#entry-guest-warning` keep their ids and markup.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/home/view.test.ts
import { describe, expect, test, vi } from 'vitest';
import { createHomeView } from './view';

function mount(): HTMLElement {
  document.body.innerHTML = `
    <section id="screen-home">
      <div id="home-choices"><button id="btn-guest"></button><button id="btn-show-login"></button><button id="btn-show-signup"></button><button id="btn-connect"></button></div>
      <div id="home-login" class="hidden"><form id="signin-form"></form></div>
      <div id="home-signup" class="hidden"><form id="signup-form"></form></div>
      <div id="entry-connect-view" class="hidden"></div>
      <button id="btn-home-back" class="hidden"></button>
      <span id="home-players"></span><ul id="home-patch-notes"></ul>
      <p id="home-error" class="hidden"></p><p id="home-busy" class="hidden"></p>
    </section>`;
  return document.getElementById('screen-home')!;
}

describe('home view', () => {
  test('choices call their handlers', () => {
    const deps = { onGuest: vi.fn(), onShowLogin: vi.fn(), onShowSignup: vi.fn(), onShowConnect: vi.fn(), onBack: vi.fn() };
    createHomeView(mount(), deps);
    document.getElementById('btn-guest')!.click();
    document.getElementById('btn-show-signup')!.click();
    expect(deps.onGuest).toHaveBeenCalledOnce();
    expect(deps.onShowSignup).toHaveBeenCalledOnce();
  });
  test('setView shows one sub-view and the back link', () => {
    const v = createHomeView(mount(), { onGuest() {}, onShowLogin() {}, onShowSignup() {}, onShowConnect() {}, onBack() {} });
    v.setView('login');
    expect(document.getElementById('home-login')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('home-choices')!.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('btn-home-back')!.classList.contains('hidden')).toBe(false);
    v.setView('choices');
    expect(document.getElementById('home-choices')!.classList.contains('hidden')).toBe(false);
  });
  test('players and patch notes render escaped', () => {
    const v = createHomeView(mount(), { onGuest() {}, onShowLogin() {}, onShowSignup() {}, onShowConnect() {}, onBack() {} });
    v.setPlayers(12);
    expect(document.getElementById('home-players')!.textContent).toBe('12 players online');
    v.setPlayers(null);
    expect(document.getElementById('home-players')!.textContent).toBe('world offline');
    v.renderPatchNotes([{ date: '2026-09-05', title: '<b>x</b>', items: ['a'] }]);
    expect(document.getElementById('home-patch-notes')!.innerHTML).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/home`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement the view, partial and data**

```ts
// web/src/home/view.ts
import { byId, escapeHtml, hide, show, toggleVisible } from '../dom';
import type { HomeView } from '../types';

export interface PatchNote { date: string; title: string; items: string[] }
export interface HomeDeps { onGuest(): void; onShowLogin(): void; onShowSignup(): void; onShowConnect(): void; onBack(): void }

const SUBVIEWS: Record<HomeView, string> = { choices: 'home-choices', login: 'home-login', signup: 'home-signup', connect: 'entry-connect-view' };

export function createHomeView(root: HTMLElement, deps: HomeDeps) {
  const q = <T extends HTMLElement>(id: string): T => root.querySelector<T>(`#${id}`) ?? byId<T>(id);
  q('btn-guest').addEventListener('click', () => deps.onGuest());
  q('btn-show-login').addEventListener('click', () => deps.onShowLogin());
  q('btn-show-signup').addEventListener('click', () => deps.onShowSignup());
  q('btn-connect').addEventListener('click', () => deps.onShowConnect());
  q('btn-home-back').addEventListener('click', () => deps.onBack());
  return {
    setView(v: HomeView) {
      for (const [key, id] of Object.entries(SUBVIEWS)) toggleVisible(q(id), key === v);
      toggleVisible(q('btn-home-back'), v !== 'choices');
    },
    setPlayers(n: number | null) { q('home-players').textContent = n === null ? 'world offline' : `${n} player${n === 1 ? '' : 's'} online`; },
    renderPatchNotes(notes: PatchNote[]) {
      q('home-patch-notes').innerHTML = notes.slice(0, 3).map(n =>
        `<li><span class="pn-date">${escapeHtml(n.date)}</span> <b>${escapeHtml(n.title)}</b><ul>${n.items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul></li>`).join('');
    },
    setBusy(busy: boolean) { toggleVisible(q('home-busy'), busy); },
    setError(msg: string | null) { const el = q('home-error'); el.textContent = msg ?? ''; if (msg) show(el); else hide(el); }
  };
}
```

`web/src/partials/home.html`: copy `entry.html`, rename the section id to `screen-home`, replace the `#entry-buttons` row with:

```html
    <div id="home-choices" class="stack">
      <button id="btn-guest" class="btn btn-primary" type="button" disabled>Play as Guest</button>
      <div class="entry-buttons-row">
        <button id="btn-show-login" class="btn" type="button" disabled>Log In</button>
        <button id="btn-show-signup" class="btn" type="button" disabled>Create Account</button>
      </div>
      <button id="btn-connect" class="link" type="button" disabled>Connect to Claude</button>
    </div>
    <div id="home-login" class="stack hidden"><!-- move #signin-form here unchanged --></div>
    <div id="home-signup" class="stack hidden"><!-- move #signup-form here unchanged --></div>
    <button id="btn-home-back" class="link hidden" type="button">Back</button>
    <p id="home-busy" class="card-sub hidden">signing in…</p>
    <p id="home-error" class="error hidden" aria-live="polite"></p>
    <p id="home-players" class="card-sub"></p>
    <ul id="home-patch-notes" class="patch-notes"></ul>
```

Keep `#entry-connect-view` (with `#entry-connect-host`, `#btn-entry-back`, `#btn-connect-login`), `#entry-identity`, `#entry-account-link`, `#entry-guest-warning`, `#entry-checking` and `#entry-signup-success` exactly as in `entry.html`. Remove `#btn-show-signin` / `#btn-show-signup` from inside the forms (the choices row replaces them). In `web/index.html` replace the `entry.html` include with `home.html`. Delete `web/src/partials/entry.html`. Add to `auth.css`: `.patch-notes { list-style: none; padding: 0; margin: 8px 0 0; font-size: 12px; text-align: left } .patch-notes ul { margin: 2px 0 6px 14px } .pn-date { color: rgb(var(--rl-muted)) }` (use the existing muted token name from `tokens.css`).

`web/src/data/patchNotes.json`:

```json
[
  { "date": "2026-09-05", "title": "Characters", "items": ["Guests get one character, accounts get three.", "Pick a character before entering the world.", "Live player count on this page."] },
  { "date": "2026-09-05", "title": "Rendering fix", "items": ["The world now paints right after login instead of staying on the loading bar."] }
]
```

Enable `resolveJsonModule` is already on in `web/tsconfig.json`; import with `import patchNotes from './data/patchNotes.json'`.

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `cd web && npx vitest run && npm run typecheck && npm run lint`
Expected: pass (main.ts still references `entry-buttons`/`btn-login`: temporarily keep those calls guarded with `document.getElementById(...)?.` until Task 8 rewires them, or do Task 8 in the same commit if the typecheck cannot be kept green otherwise).

- [ ] **Step 5: Commit**

```bash
git add web/index.html web/src/partials web/src/home web/src/data web/src/styles/auth.css
git commit -m "feat(web): home page with guest/login/signup choices, player count and patch notes"
```

---

### Task 8: Home flow controller in `main.ts`

**Files:**
- Modify: `web/src/main.ts` (the `enterApp`, `wireEntry`, `renderIdentityStrip`, `setButtonsEnabled` region), `web/src/api.ts` (no change), `web/src/auth.ts` (no change)
- Test: `web/src/entrySignup.test.ts` (unchanged), manual smoke via Task 12 e2e

**Interfaces:**
- Consumes: `createHomeView` (Task 7), `health()` from `web/src/api.ts` (now returns `players`), `signInGuest`, `signInEmail`, `signUpEmail`, `attachEmail`, `onUserIdToken`.
- Produces: `enterApp()` sets `'home'` with `homeView='choices'`; **no automatic anonymous sign-in**. Buttons enable once Firebase has resolved (either a user or no user). On any user event: `state.set('characters')` and hand over to the gate (Task 9). `startSession(characterId)` replaces `startSession()`.

- [ ] **Step 1: Rewire `enterApp`**

Replace the `onUserIdToken` callback body:

```ts
  onUserIdToken(id => {
    identity = id;
    renderIdentityStrip();
    const uid = id?.uid ?? null;
    if (uid !== shellUid) { shellUid = uid; void shell.init(); }
    home.setBusy(false);
    setChoicesEnabled(true);
    if (!id) { state.set('home'); home.setView('choices'); return; }
    setError('home-error', null);
    void charactersGate.enter(id);   // Task 9
  });
```

`setChoicesEnabled(enabled)` toggles `disabled` on `#btn-guest`, `#btn-show-login`, `#btn-show-signup`, `#btn-connect` and `toggleVisible('entry-checking', !enabled)`. Remove `triedGuest` and the auto `signInGuest()` call.

- [ ] **Step 2: Rewire the choices**

```ts
const home = createHomeView(byId('screen-home'), {
  onGuest: () => { home.setBusy(true); signInGuest().catch(() => { home.setBusy(false); home.setError(GUEST_UNAVAILABLE_MESSAGE); }); },
  onShowLogin: () => home.setView('login'),
  onShowSignup: () => home.setView('signup'),
  onShowConnect: () => { home.setView('connect'); showConnectView(); },
  onBack: () => { showButtonsView(); home.setView('choices'); }
});
home.renderPatchNotes(patchNotes);
```

`showConnectView()`/`showButtonsView()` keep creating and disposing the connect card but no longer hide/show `#entry-buttons` (which no longer exists); `#btn-connect-login` now calls `charactersGate.enter(identity)` when signed in, else `signInGuest()`. In `watchHealth()`, after `const h = await health()`, call `home.setPlayers(h?.players ?? null)`. `Connect to Claude` before sign-in: minting needs a user, so `onShowConnect` first signs in a guest if `identity` is null (`signInGuest().then(() => showConnectView())`).

- [ ] **Step 3: Replace `startSession`**

```ts
async function startSession(character: CharacterSummary): Promise<void> {
  connectCard?.dispose(); connectCard = null;
  state.set('playing');
  layout();
  overlays.setStatus('connecting…', 'muted');
  try {
    const h = hooks ?? (hooks = await loadClient());
    if (!wired) { wireHooks(h); wired = true; }
    const token = await currentIdToken();
    const creds = await mintSession(token, character.id);
    gameName = creds.gameName;
    activeCharacter = character;
    const result = await h.login(creds.gameName, creds.secret);
    if (!result.ok) { setAccountError(result.reason); overlays.setStatus(`login failed (${result.code})`, 'error'); panelCtl.open('account'); return; }
    setAccountError(null);
    byId('foot-left').textContent = identity?.isAnonymous ? 'guest · attach an email to keep this character' : identity?.email ?? '';
    panelCtl.restore();
  } catch (err) {
    setAccountError((err as Error).message);
    overlays.setStatus('session failed', 'error');
    panelCtl.open('account');
  }
}
```

Add module state `let activeCharacter: CharacterSummary | null = null;` and export nothing; `deps` gains `activeCharacter: () => activeCharacter`, `startSession`, `characters: () => charactersGate.cached()` for the panel plugin (Task 10). Delete the `bridge` import.

- [ ] **Step 4: Typecheck and lint**

Run: `cd web && npm run typecheck && npm run lint && npx vitest run`
Expected: pass once Task 9's `charactersGate` exists; if implementing Tasks 8 and 9 in sequence, commit both together at the end of Task 9.

- [ ] **Step 5: Commit** (with Task 9)

---

### Task 9: No-character gate and creation form

**Files:**
- Create: `web/src/partials/characters.html`, `web/src/characters/gate.ts`
- Modify: `web/index.html` (include), `web/src/main.ts` (screens map: `characters: 'screen-characters'`)
- Test: `web/src/characters/gate.test.ts`

**Interfaces:**
- Consumes: `listCharacters`, `checkName`, `createCharacter` (Task 6); `currentIdToken`.
- Produces:
  ```ts
  export interface GateDeps { idToken(): Promise<string>; isAnonymous(): boolean; onReady(characters: CharacterSummary[], first: CharacterSummary): void; setState(s: AppState): void }
  export function createCharactersGate(root: HTMLElement, deps: GateDeps): { enter(identity: Identity): Promise<void>; cached(): CharacterSummary[]; refresh(): Promise<CharacterSummary[]> }
  ```
  Ids: `#screen-characters`, `#char-create-form`, `#char-name`, `#char-name-status`, `#char-create-error`, `#btn-char-create`, `#char-busy`.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/characters/gate.test.ts
import { describe, expect, test, vi } from 'vitest';
import { createCharactersGate } from './gate';
import * as api from './api';

function mount(): HTMLElement {
  document.body.innerHTML = `<section id="screen-characters">
    <form id="char-create-form"><input id="char-name"><span id="char-name-status"></span><button id="btn-char-create" type="submit"></button></form>
    <p id="char-create-error" class="hidden"></p><p id="char-busy" class="hidden"></p></section>`;
  return document.getElementById('screen-characters')!;
}
const identity = { uid: 'u1', isAnonymous: false, email: 'a@b.c', displayName: 'Al' };

describe('characters gate', () => {
  test('with characters: calls onReady with the first and skips the form', async () => {
    vi.spyOn(api, 'listCharacters').mockResolvedValue([{ id: 'c1', gameName: 'al', createdAt: 1, lastLoginAt: null }, { id: 'c2', gameName: 'bo', createdAt: 2, lastLoginAt: null }]);
    const onReady = vi.fn(); const setState = vi.fn();
    const gate = createCharactersGate(mount(), { idToken: async () => 't', isAnonymous: () => false, onReady, setState });
    await gate.enter(identity);
    expect(onReady).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ id: 'c1' }));
    expect(gate.cached()).toHaveLength(2);
  });
  test('without characters: shows the form, creates, then onReady', async () => {
    vi.spyOn(api, 'listCharacters').mockResolvedValue([]);
    vi.spyOn(api, 'checkName').mockResolvedValue({ ok: true, gameName: 'zed' });
    vi.spyOn(api, 'createCharacter').mockResolvedValue({ id: 'c9', gameName: 'zed', createdAt: 1, lastLoginAt: null });
    const onReady = vi.fn(); const setState = vi.fn();
    const gate = createCharactersGate(mount(), { idToken: async () => 't', isAnonymous: () => false, onReady, setState });
    await gate.enter(identity);
    expect(setState).toHaveBeenCalledWith('characters');
    expect(onReady).not.toHaveBeenCalled();
    (document.getElementById('char-name') as HTMLInputElement).value = 'Zed';
    document.getElementById('char-create-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise(r => setTimeout(r, 0));
    expect(api.createCharacter).toHaveBeenCalledWith('t', 'Zed');
    expect(onReady).toHaveBeenCalledWith([expect.objectContaining({ id: 'c9' })], expect.objectContaining({ id: 'c9' }));
  });
  test('guest: no name field needed; create is called without a name', async () => {
    vi.spyOn(api, 'listCharacters').mockResolvedValue([]);
    const create = vi.spyOn(api, 'createCharacter').mockResolvedValue({ id: 'g1', gameName: 'guest_abc123', createdAt: 1, lastLoginAt: null });
    const onReady = vi.fn();
    const gate = createCharactersGate(mount(), { idToken: async () => 't', isAnonymous: () => true, onReady, setState: vi.fn() });
    await gate.enter({ ...identity, isAnonymous: true });
    expect(create).toHaveBeenCalledWith('t', undefined);
    expect(onReady).toHaveBeenCalled();
  });
  test('create error is shown', async () => {
    vi.spyOn(api, 'listCharacters').mockResolvedValue([]);
    vi.spyOn(api, 'createCharacter').mockRejectedValue(new Error('taken'));
    const gate = createCharactersGate(mount(), { idToken: async () => 't', isAnonymous: () => false, onReady: vi.fn(), setState: vi.fn() });
    await gate.enter(identity);
    (document.getElementById('char-name') as HTMLInputElement).value = 'Zed';
    document.getElementById('char-create-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise(r => setTimeout(r, 0));
    expect(document.getElementById('char-create-error')!.textContent).toMatch(/taken/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/characters/gate.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

```ts
// web/src/characters/gate.ts
import { byId, hide, show, toggleVisible } from '../dom';
import type { AppState, CharacterSummary, Identity } from '../types';
import { checkName, createCharacter, listCharacters } from './api';

export interface GateDeps { idToken(): Promise<string>; isAnonymous(): boolean; onReady(characters: CharacterSummary[], first: CharacterSummary): void; setState(s: AppState): void }

const FRIENDLY: Record<string, string> = { taken: 'That name is taken.', invalid: 'Names are 1-12 letters, digits or underscores and start with a letter.', limit: 'You have reached your character limit.' };

export function createCharactersGate(root: HTMLElement, deps: GateDeps) {
  const q = <T extends HTMLElement>(id: string): T => root.querySelector<T>(`#${id}`) ?? byId<T>(id);
  let cached: CharacterSummary[] = [];
  let checkTimer: ReturnType<typeof setTimeout> | null = null;

  function setError(msg: string | null): void { const el = q('char-create-error'); el.textContent = msg ?? ''; if (msg) show(el); else hide(el); }

  async function create(name: string | undefined): Promise<void> {
    toggleVisible(q('char-busy'), true);
    setError(null);
    try {
      const created = await createCharacter(await deps.idToken(), name);
      cached = [...cached, created];
      deps.onReady(cached, created);
    } catch (err) {
      setError(FRIENDLY[(err as Error).message] ?? (err as Error).message);
    } finally {
      toggleVisible(q('char-busy'), false);
    }
  }

  q<HTMLFormElement>('char-create-form').addEventListener('submit', e => { e.preventDefault(); void create(q<HTMLInputElement>('char-name').value.trim() || undefined); });
  q<HTMLInputElement>('char-name').addEventListener('input', () => {
    if (checkTimer) clearTimeout(checkTimer);
    const value = q<HTMLInputElement>('char-name').value.trim();
    checkTimer = setTimeout(async () => {
      if (!value) { q('char-name-status').textContent = ''; return; }
      const r = await checkName(await deps.idToken(), value).catch(() => null);
      q('char-name-status').textContent = !r ? '' : r.ok ? `${r.gameName} is available` : FRIENDLY[r.error];
    }, 300);
  });

  return {
    async enter(identity: Identity): Promise<void> {
      cached = await listCharacters(await deps.idToken()).catch(() => []);
      if (cached.length > 0) { deps.onReady(cached, cached[0]); return; }
      if (identity.isAnonymous) { await create(undefined); return; }   // guests get a random name, no form
      deps.setState('characters');
      q<HTMLInputElement>('char-name').focus();
    },
    cached: () => cached,
    async refresh() { cached = await listCharacters(await deps.idToken()); return cached; }
  };
}
```

`web/src/partials/characters.html`:

```html
<section id="screen-characters" class="card-screen hidden">
  <div class="card">
    <h1 class="card-title">Name your character</h1>
    <p class="card-sub">1-12 characters: letters, digits, underscores. Starts with a letter.</p>
    <form id="char-create-form" class="stack">
      <input id="char-name" class="input" type="text" maxlength="12" placeholder="character name" autocomplete="off" required>
      <span id="char-name-status" class="card-sub" aria-live="polite"></span>
      <p id="char-create-error" class="error hidden" aria-live="polite"></p>
      <button id="btn-char-create" class="btn btn-primary" type="submit">Create character</button>
    </form>
    <p id="char-busy" class="card-sub hidden">creating…</p>
  </div>
</section>
```

In `main.ts`: `screens.characters = 'screen-characters'`; `const charactersGate = createCharactersGate(byId('screen-characters'), { idToken: currentIdToken, isAnonymous: () => identity?.isAnonymous ?? true, onReady: (_all, first) => { void startSession(first); }, setState: s => state.set(s) });`. Include the partial in `web/index.html` after `home.html`.

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `cd web && npx vitest run && npm run typecheck && npm run lint`
Expected: pass.

- [ ] **Step 5: Commit** (Tasks 8 and 9 together)

```bash
git add web/index.html web/src
git commit -m "feat(web): home flow with explicit guest sign-in and a no-character gate before the client boots"
```

---

### Task 10: Characters panel plugin (switch, create, guarded delete)

**Files:**
- Create: `web/src/plugins/builtin/characters.ts`
- Modify: `web/src/main.ts` (register; `deps`), `web/src/types.ts` (`PanelId` done in Task 6), `web/src/styles/panels.css`
- Test: `web/src/plugins/builtin/characters.test.ts`

**Interfaces:**
- Consumes: `definePlugin`, `PluginContext` (`web/src/plugins/types.ts`), `CharacterSummary`, `listCharacters`, `createCharacter`, `deleteCharacter` (Task 6), `reauthenticateWithCredential`/`EmailAuthProvider` from `firebase/auth` through a new `web/src/auth.ts` export `reauthEmail(password: string): Promise<void>`.
- Produces:
  ```ts
  export interface CharactersDeps {
    idToken(): Promise<string>;
    isAnonymous(): boolean;
    active(): CharacterSummary | null;
    limit(): number;                                     // 1 or 3
    switchTo(c: CharacterSummary): Promise<void>;        // main.ts: hooks.logout(); wait for loggedIn=false; startSession(c)
    reauth(password: string): Promise<void>;
  }
  export function createCharactersPlugin(deps: CharactersDeps): ShellPlugin   // manifest { id: 'characters', name: 'Characters', icon: '👥', tier: 'shell', alwaysOn: true }
  ```
  Panel markup ids: `[data-char-row="<id>"]`, `[data-char-switch="<id>"]`, `[data-char-delete="<id>"]`, `#char-panel-create`, `#char-panel-error`, delete dialog `#char-del-dialog`, `#char-del-phrase`, `#char-del-password`, `#char-del-confirm`, `#char-del-cancel`.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/plugins/builtin/characters.test.ts
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createCharactersPlugin } from './characters';
import * as api from '../../characters/api';

const chars = [{ id: 'c1', gameName: 'al', createdAt: 1, lastLoginAt: null }, { id: 'c2', gameName: 'bo', createdAt: 2, lastLoginAt: null }];
function deps(over: Partial<Parameters<typeof createCharactersPlugin>[0]> = {}) {
  return { idToken: async () => 't', isAnonymous: () => false, active: () => chars[0], limit: () => 3, switchTo: vi.fn(async () => {}), reauth: vi.fn(async () => {}), ...over };
}
const flush = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => { document.body.innerHTML = '<div id="body"></div>'; vi.spyOn(api, 'listCharacters').mockResolvedValue(chars); });

describe('characters panel', () => {
  test('lists characters, marks the active one, offers create under the limit', async () => {
    const p = createCharactersPlugin(deps());
    const view = p.panel!();
    view.mount(document.getElementById('body')!);
    await flush();
    expect(document.querySelectorAll('[data-char-row]')).toHaveLength(2);
    expect(document.querySelector('[data-char-row="c1"]')!.classList.contains('active')).toBe(true);
    expect(document.getElementById('char-panel-create')).not.toBeNull();
  });
  test('switch calls switchTo with the other character', async () => {
    const d = deps();
    createCharactersPlugin(d).panel!().mount(document.getElementById('body')!);
    await flush();
    (document.querySelector('[data-char-switch="c2"]') as HTMLButtonElement).click();
    expect(d.switchTo).toHaveBeenCalledWith(expect.objectContaining({ id: 'c2' }));
  });
  test('delete requires the exact phrase, re-auths, then deletes and re-lists', async () => {
    const del = vi.spyOn(api, 'deleteCharacter').mockResolvedValue();
    const d = deps();
    createCharactersPlugin(d).panel!().mount(document.getElementById('body')!);
    await flush();
    (document.querySelector('[data-char-delete="c2"]') as HTMLButtonElement).click();
    const confirm = document.getElementById('char-del-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    (document.getElementById('char-del-phrase') as HTMLInputElement).value = 'delete bo';
    document.getElementById('char-del-phrase')!.dispatchEvent(new Event('input'));
    expect(confirm.disabled).toBe(false);
    (document.getElementById('char-del-password') as HTMLInputElement).value = 'pw';
    confirm.click();
    await flush(); await flush();
    expect(d.reauth).toHaveBeenCalledWith('pw');
    expect(del).toHaveBeenCalledWith('t', 'c2', 'delete bo');
    expect(api.listCharacters).toHaveBeenCalledTimes(2);
  });
  test('the active character cannot be deleted from the panel', async () => {
    createCharactersPlugin(deps()).panel!().mount(document.getElementById('body')!);
    await flush();
    expect(document.querySelector('[data-char-delete="c1"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/plugins/builtin/characters.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

```ts
// web/src/plugins/builtin/characters.ts
import { escapeHtml } from '../../dom';
import { createCharacter, deleteCharacter, listCharacters } from '../../characters/api';
import type { CharacterSummary } from '../../types';
import { definePlugin, type ShellPlugin } from '../types';

export interface CharactersDeps {
  idToken(): Promise<string>;
  isAnonymous(): boolean;
  active(): CharacterSummary | null;
  limit(): number;
  switchTo(c: CharacterSummary): Promise<void>;
  reauth(password: string): Promise<void>;
}

const WARNING = 'Deleting a character removes it permanently: its stats, quests and inventory are gone. Only you can do this; a connected Claude session cannot.';

export function createCharactersPlugin(deps: CharactersDeps): ShellPlugin {
  return definePlugin({
    manifest: { id: 'characters', name: 'Characters', icon: '👥', tier: 'shell', description: 'Switch, create and manage your characters.', alwaysOn: true },
    panel: () => {
      let body: HTMLElement | null = null;
      let list: CharacterSummary[] = [];

      const setError = (msg: string | null): void => { const el = body?.querySelector<HTMLElement>('#char-panel-error'); if (el) { el.textContent = msg ?? ''; el.classList.toggle('hidden', !msg); } };

      async function reload(): Promise<void> {
        list = await listCharacters(await deps.idToken()).catch(() => []);
        render();
      }

      function render(): void {
        if (!body) return;
        const active = deps.active();
        const rows = list.map(c => `
          <div class="p-row char-row${c.id === active?.id ? ' active' : ''}" data-char-row="${escapeHtml(c.id)}">
            <span class="p-value">${escapeHtml(c.gameName)}</span>
            <span class="p-label">${c.id === active?.id ? 'playing' : c.lastLoginAt ? 'last seen ' + new Date(c.lastLoginAt).toLocaleDateString() : 'never played'}</span>
            ${c.id === active?.id ? '' : `<button class="p-btn" data-char-switch="${escapeHtml(c.id)}">Log in as ${escapeHtml(c.gameName)}</button><button class="p-btn p-btn-danger" data-char-delete="${escapeHtml(c.id)}">Delete</button>`}
          </div>`).join('');
        body.innerHTML = `${rows || '<div class="p-empty">No characters yet.</div>'}
          ${list.length < deps.limit() ? `<form id="char-panel-create" class="stack">${deps.isAnonymous() ? '' : '<input class="p-input" id="char-panel-name" placeholder="new character name" maxlength="12" required>'}<button class="p-btn p-btn-primary" type="submit">Create character</button></form>` : `<div class="p-label">Character limit reached (${deps.limit()}).</div>`}
          <div class="p-error hidden" id="char-panel-error"></div>
          <div id="char-del-dialog" class="hidden"></div>`;
        body.querySelectorAll<HTMLButtonElement>('[data-char-switch]').forEach(b => b.addEventListener('click', () => { const c = list.find(x => x.id === b.dataset.charSwitch); if (c) void deps.switchTo(c).catch(err => setError((err as Error).message)); }));
        body.querySelectorAll<HTMLButtonElement>('[data-char-delete]').forEach(b => b.addEventListener('click', () => openDelete(list.find(x => x.id === b.dataset.charDelete)!)));
        body.querySelector<HTMLFormElement>('#char-panel-create')?.addEventListener('submit', async e => {
          e.preventDefault();
          const name = body?.querySelector<HTMLInputElement>('#char-panel-name')?.value.trim();
          try { await createCharacter(await deps.idToken(), name || undefined); await reload(); } catch (err) { setError((err as Error).message); }
        });
      }

      function openDelete(c: CharacterSummary): void {
        const dlg = body!.querySelector<HTMLElement>('#char-del-dialog')!;
        const phrase = `delete ${c.gameName}`;
        dlg.classList.remove('hidden');
        dlg.innerHTML = `<p class="p-error">${escapeHtml(WARNING)}</p>
          <p class="p-label">Type <b>${escapeHtml(phrase)}</b> to continue.</p>
          <input class="p-input" id="char-del-phrase" autocomplete="off">
          ${deps.isAnonymous() ? '' : '<input class="p-input" id="char-del-password" type="password" placeholder="your password (re-authentication)">'}
          <button class="p-btn p-btn-danger" id="char-del-confirm" disabled>Delete ${escapeHtml(c.gameName)} forever</button>
          <button class="p-btn" id="char-del-cancel">Cancel</button>`;
        const input = dlg.querySelector<HTMLInputElement>('#char-del-phrase')!;
        const confirm = dlg.querySelector<HTMLButtonElement>('#char-del-confirm')!;
        input.addEventListener('input', () => { confirm.disabled = input.value.trim() !== phrase; });
        dlg.querySelector('#char-del-cancel')!.addEventListener('click', () => { dlg.classList.add('hidden'); dlg.innerHTML = ''; });
        confirm.addEventListener('click', async () => {
          try {
            const pw = dlg.querySelector<HTMLInputElement>('#char-del-password')?.value ?? '';
            if (!deps.isAnonymous()) await deps.reauth(pw);
            await deleteCharacter(await deps.idToken(), c.id, phrase);
            await reload();
          } catch (err) { setError((err as Error).message === 'reauth' ? 'Please re-enter your password.' : (err as Error).message); }
        });
      }

      return {
        title: 'Characters',
        mount(el: HTMLElement) { body = el; void reload(); },
        unmount() { body = null; }
      };
    }
  });
}
```

`web/src/auth.ts` add:

```ts
export async function reauthEmail(password: string): Promise<void> {
  const u = auth.currentUser;
  if (!u || !u.email) throw new Error('reauth');
  await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
}
```

(`reauthenticateWithCredential` comes from `firebase/auth`.) `web/src/main.ts`: register `shell.register(createCharactersPlugin({ idToken: currentIdToken, isAnonymous: () => identity?.isAnonymous ?? true, active: () => activeCharacter, limit: () => (identity?.isAnonymous ? 1 : 3), switchTo: switchCharacter, reauth: reauthEmail }))` directly after the `claude` plugin, and add:

```ts
async function switchCharacter(c: CharacterSummary): Promise<void> {
  if (hooks?.getState().loggedIn) {
    hooks.logout();
    await new Promise<void>(resolve => { const t = setInterval(() => { if (!hooks?.getState().loggedIn) { clearInterval(t); resolve(); } }, 100); });
  }
  await startSession(c);
}
```

`panels.css`: `.char-row.active { border-left: 2px solid rgb(var(--rl-accent)) } .p-btn-danger { background: rgb(var(--rl-danger)) }` (use the existing accent and danger tokens from `tokens.css`; add `--rl-danger: 160 40 40` if absent).

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `cd web && npx vitest run && npm run typecheck && npm run lint`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat(web): characters panel with switch, create and human-only guarded delete"
```

---

### Task 11: Retire the bridge

**Files:**
- Modify: `server/src/index.ts`, `server/src/router.ts`, `server/src/router.test.ts`, `web/src/api.ts`, `web/src/types.ts`; delete `server/src/bridge.ts`, `server/src/bridge.test.ts`, `web/src/api.test.ts` bridge cases
- Test: server suite, web suite

- [ ] **Step 1: Remove the route**

Delete the `bridge` member from `Route`, its `classify` line, its `principalRule` case and its `index.ts` case; remove `createBridge` import and construction. Update `router.test.ts` (`/api/bridge` now classifies as `notfound`). Delete `server/src/bridge.ts` and its test; keep `GameAccountDoc` in `types.ts` (the store's migration reads it).

- [ ] **Step 2: Remove the web helper**

Delete `bridge()` from `web/src/api.ts`, `BridgeResponse` from `web/src/types.ts`, and the bridge cases from `web/src/api.test.ts`.

- [ ] **Step 3: Run everything**

Run: `cd server && ~/.bun/bin/bun run typecheck && ~/.bun/bin/bun test && cd ../web && npm run typecheck && npm run lint && npx vitest run`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add -A server/src web/src
git commit -m "refactor: retire /api/bridge in favour of character sessions"
```

---

### Task 12: End-to-end coverage and docs

**Files:**
- Create: `web/e2e/characters.pw.test.ts`
- Modify: `web/e2e/helpers.ts`, `web/e2e/gate-to-game.pw.test.ts`, `web/e2e/plugins.pw.test.ts`, `README.md`, `docs/superpowers/specs/2026-09-05-idlescape-roadmap-and-handoff.md` (sequence table gains SP6)

- [ ] **Step 1: Update the helpers for the new home flow**

In `web/e2e/helpers.ts` replace `loginAsGuest`:

```ts
export async function loginAsGuest(page: Page): Promise<string> {
  await expect.poll(() => page.locator('#btn-guest').isEnabled(), { timeout: 30_000 }).toBe(true);
  await expect(page.locator('#entry-connect-view')).toBeHidden();
  await page.locator('#btn-guest').click();
  // A guest has no character: the gate creates one with a random name and starts the client.
  await expect(page.locator('#screen-frame')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => window.idlescape?.client?.getState().loggedIn ?? false), { timeout: 90_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.idlescape?.client?.getState().skills.xp.length ?? 0), { timeout: 30_000 }).toBeGreaterThan(20);
  await expect.poll(async () => (await clientState(page)).position.x, { timeout: 60_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await clientState(page)).sceneReady, { timeout: 120_000 }).toBe(true);
  const state = await clientState(page);
  if (!state.gameName) throw new Error('logged in without a game name');
  return state.gameName;
}

export async function signUp(page: Page, name: string): Promise<string> {
  const email = `${name.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.locator('#btn-show-signup').click();
  await page.locator('#signup-name').fill(name);
  await page.locator('#signup-email').fill(email);
  await page.locator('#signup-password').fill('secret123');
  await page.locator('#signup-form button[type="submit"]').click();
  return email;
}
```

In `openGate`, wait for `#screen-home` instead of `#screen-entry`. Update `gate-to-game.pw.test.ts`: test 1 uses `loginAsGuest`; test 2 clicks `#btn-connect` (now a link) after `#btn-guest` sign-in is not required: `#btn-connect` signs a guest in itself, so wait for `#connect-url` as before; test 3 becomes: `signUp(page, 'Bob')`, expect `#screen-characters` visible, fill `#char-name` with `Bob`, expect `#char-name-status` to contain `available`, submit, expect the frame and `gameName` `bob`. `plugins.pw.test.ts`: replace `#btn-login` click with `loginAsGuest(page)`.

- [ ] **Step 2: Write the characters e2e**

```ts
// web/e2e/characters.pw.test.ts
import { expect, test } from '@playwright/test';
import { clientState, openGate, signUp } from './helpers';

test('a registered user creates three characters, is refused a fourth, switches, and deletes with the phrase', async ({ page }) => {
  await openGate(page);
  await signUp(page, 'Trio');
  await expect(page.locator('#screen-characters')).toBeVisible();
  await page.locator('#char-name').fill('trio_one');
  await page.locator('#btn-char-create').click();
  await expect(page.locator('#screen-frame')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.idlescape?.client?.getState().loggedIn ?? false), { timeout: 90_000 }).toBe(true);

  await page.locator('[data-panel="characters"]').click();
  await expect(page.locator('#panel-title')).toHaveText('Characters');
  for (const n of ['trio_two', 'trio_three']) {
    await page.locator('#char-panel-name').fill(n);
    await page.locator('#char-panel-create button[type="submit"]').click();
    await expect(page.locator(`[data-char-row]:has-text("${n}")`)).toBeVisible();
  }
  await expect(page.locator('#char-panel-create')).toHaveCount(0);
  await expect(page.locator('#panel-body')).toContainText('Character limit reached');

  await page.locator('[data-char-switch]').first().click();
  await expect.poll(async () => (await clientState(page)).gameName, { timeout: 90_000 }).toBe('trio_two');
  await expect.poll(async () => (await clientState(page)).sceneReady, { timeout: 120_000 }).toBe(true);

  await page.locator('[data-panel="characters"]').click();
  await page.locator('[data-char-delete]').last().click();
  await expect(page.locator('#char-del-confirm')).toBeDisabled();
  await page.locator('#char-del-phrase').fill('delete trio_three');
  await page.locator('#char-del-password').fill('secret123');
  await page.locator('#char-del-confirm').click();
  await expect(page.locator('[data-char-row]:has-text("trio_three")')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('#char-panel-create')).toBeVisible();
});

test('an agent bearer cannot call the character routes', async ({ page }) => {
  await openGate(page);
  const res = await page.request.get('/api/characters', { headers: { authorization: 'Bearer csa_' + 'x'.repeat(40) } });
  expect(res.status()).toBe(401);
  const del = await page.request.delete('/api/characters/' + 'a'.repeat(20), { headers: { authorization: 'Bearer csa_' + 'x'.repeat(40) }, data: { confirm: 'delete a' } });
  expect(del.status()).toBe(401);
});
```

(An unknown agent token authenticates to `null`, hence 401; a valid agent token would get 403 `human_only`. Add that case to the server routes test rather than here, since minting a real token in e2e needs the pairing flow.)

- [ ] **Step 3: Bring the stack up and run the whole e2e suite**

Run (PowerShell, from the repo root): emulators via `Start-Process cmd.exe "/c npm run emulators"` in `firebase/`, then `scripts/start-stack.ps1 -Prod`; wait for `/api/health` `engine: up`. Then Git Bash: `cd web && npm run build && npx playwright test`.
Expected: all specs pass, including the four existing ones. Take note that the dev engine ignores passwords and grants staff level 4 (spec section 3); nothing in this task changes that.

- [ ] **Step 4: Docs**

`README.md`: under "How it fits together" replace the `/api/bridge` sentence with the character routes and the home flow; add the `ENGINE_MANAGEMENT_HTTP` line to the env table. Roadmap spec section 4 table: add the SP6 row pointing at this plan.

- [ ] **Step 5: Commit**

```bash
git add web/e2e README.md docs/superpowers/specs/2026-09-05-idlescape-roadmap-and-handoff.md
git commit -m "test(e2e): character creation, limits, switching and guarded deletion; docs for SP6"
```

---

## Self-review notes

- Spec coverage: section 4 (model, limits, migration, routes) → Tasks 1, 3, 4, 11; section 6 (home page, player count, patch notes, gate) → Tasks 5, 7, 8, 9; section 9 principal module and human-only routes → Tasks 2, 3; section 10 SP6 row (single-client switch, deletion flow) → Task 10; section 11 tests → every task plus Task 12. Not in SP6 by design: iframes, render suspend, `armLogin`, mute (SP7); `.sav` removal on delete (SP8).
- Type consistency: `CharacterSummary` is defined once in `server/src/types.ts` and mirrored in `web/src/types.ts` with identical fields; `Principal` shapes match between Tasks 2 and 3; `mintSession` (web) ↔ `store.session` (server) return `{ gameName, secret }`.
- Known limitation carried into the spec: deletion cannot kick an online character from another tab until SP8; the route only refuses future sessions.
