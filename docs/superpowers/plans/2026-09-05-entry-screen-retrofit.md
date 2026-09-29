# Entry Screen and Quick Connect Retrofit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retrofit the completed SP1 shell so the sign-in card becomes a two-button entry screen with automatic guest sign-in, the panel controller becomes a manifest-driven PluginRegistry, the Connect panel becomes a Claude Connection panel with a shared connect card, and the server gains the pairing subsystem (`/pair/<token>`, agent tokens, skill document, `/connect` guide).

**Architecture:** Additive on the finished SP1 code (Tasks 1-14, HEAD 4937aa8 on branch feat/platform-shell). Server work adds `server/src/pair/*` and a `pair` router class. Web work reworks `main.ts`, the entry partial, and the connect panel, and renames the panel controller. The MCP gateway itself is out of scope (sub-project 4); this ships the pairing surface up to "paired", with the gateway path returning "not deployed".

**Tech Stack:** Bun + TypeScript (server, `bun test`), Vite + TypeScript + vitest/jsdom (web), Firebase Admin + Firestore emulator, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-05-entry-screen-and-quick-connect-design.md` (amends `2026-09-04-idlescape-platform-design.md`)

## Global Constraints

- TypeScript strict, no new `as any`. Files under 400 lines. Conventional commits. `types.ts` per package.
- Server tests: `bun test` (bun:test). Web tests: vitest + jsdom. Bun at `%USERPROFILE%\.bun\bin\bun.exe`.
- Local run ports (corrected ruling): front server 8787, dev engine 8899 (game 43596, mgmt 8897), emulators auth 9099 / firestore 8080. Committed `.env.example` keeps deployment defaults. The live PoC on 8888/43594/8898 is never touched.
- Firebase project `idlescape-osrs`. Cloud resource creation and rule DEPLOY stay deferred to the controller; rules are authored and tested against the emulator only.
- Pairing tokens: pair token 32 chars `[A-Za-z0-9_-]`, 15-min expiry, single use, minting expires the previous unused token for that uid; agent token 40 chars same alphabet, returned once, stored only as SHA-256 hash.
- `/pair/*` is exempt from the gate middleware (Claude's fetch carries no cookie); the token is the credential and exposes no game name or secret. The gate still guards the shell, cache proxy, and WebSocket.
- Every task that borrows an idea or vendors code updates `CREDITS.md` (already at repo root) in the same commit; this retrofit vendors nothing, so no CREDITS change is expected.
- The gateway does not exist yet: the skill document's `claude mcp add` step registers `{{ORIGIN}}/mcp` which returns 503 "gateway not deployed yet"; `/api/health` reports `gateway: "not_deployed"`.

---

### Task 1: Pairing server subsystem (spec Feature 2, plan Task "13b")

**Files:**
- Create: `server/src/pair/token.ts`, `server/src/pair/store.ts`, `server/src/pair/routes.ts`, `server/src/pair/skill.md`, `server/src/pair/human.html`, `server/src/pair/guide.md`
- Modify: `server/src/router.ts` (add `pair` classification), `server/src/index.ts` (route the pair class; gateway field already or newly in health), `server/src/health.ts` + `server/src/types.ts` (add `gateway` field to HealthSnapshot), `firebase/firestore.rules` (pairTokens, agentTokens)
- Test: `server/src/pair/token.test.ts`, `server/src/pair/store.test.ts`, `server/src/pair/routes.test.ts`, `firebase/rules.test.ts` (extend)

**Interfaces:**
- Consumes: `initAdmin(env)` -> `{ auth, db }` (from SP1 Task 7); `Env`; the existing `router.ts` `classify()` returning a `Route` union; `createGate`/`gate.isOpen` (pair routes bypass the gate).
- Produces: `randomToken(len): string`, `hashToken(token): string`, `expiryFrom(nowMs, ttlMs): number` in `token.ts` (pure); `createPairStore(db)` with `mint(uid)`, `lookup(token)`, `exchange(token, label?)`, `revoke(uid, agentTokenId)` in `store.ts`; `createPairRoutes({ store, auth, origin })` with `handle(req, route)` in `routes.ts`; `Route` gains `{ kind: 'pair'; sub: 'mint' | 'fetch' | 'exchange' | 'revoke' | 'guide'; token?: string; id?: string }`.

- [ ] **Step 1: Write the failing token test**

`server/src/pair/token.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { expiryFrom, hashToken, randomToken } from './token';

describe('pair token', () => {
  test('randomToken length and alphabet', () => {
    const t = randomToken(32);
    expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(randomToken(40)).toMatch(/^[A-Za-z0-9_-]{40}$/);
    expect(randomToken(32)).not.toBe(randomToken(32));
  });
  test('hashToken is a stable 64-hex sha256, not the token', () => {
    const h = hashToken('abc');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(hashToken('abc'));
    expect(h).not.toContain('abc');
  });
  test('expiryFrom adds the ttl', () => {
    expect(expiryFrom(1000, 15 * 60 * 1000)).toBe(1000 + 900000);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && bun test src/pair/token.test.ts`
Expected: FAIL, cannot find module `./token`.

- [ ] **Step 3: Implement `token.ts`**

```ts
import { createHash, randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

export function randomToken(len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function expiryFrom(nowMs: number, ttlMs: number): number {
  return nowMs + ttlMs;
}
```

- [ ] **Step 4: Run token test**

Run: `cd server && bun test src/pair/token.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Add the HealthSnapshot gateway field**

In `server/src/types.ts` add to `HealthSnapshot`: `gateway: 'up' | 'down' | 'not_deployed'`. In `server/src/health.ts` `snapshot()` return `gateway: 'not_deployed'` (a constant until sub-project 4 wires the gateway; keep it a field so the panel can read it). In `web/src/types.ts` mirror `gateway` on HealthSnapshot. Update `server/src/health.test.ts` to expect `gateway: 'not_deployed'`.

- [ ] **Step 6: Write the failing store test (emulator)**

`server/src/pair/store.test.ts` (requires the Firestore emulator on 8080):

```ts
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { initAdmin } from '../firebaseAdmin';
import { loadEnv } from '../env';
import { createPairStore } from './store';

const env = loadEnv({ GATE_ENABLED: 'false', FIREBASE_EMULATORS: 'true', FIREBASE_PROJECT_ID: 'idlescape-osrs' });
const { db } = initAdmin(env);
const store = createPairStore(db);

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
    const { token } = await store.mint('uid-3');
    const ex = await store.exchange(token, 'My Laptop');
    expect(ex.ok).toBe(true);
    if (ex.ok) {
      expect(ex.agentToken).toMatch(/^[A-Za-z0-9_-]{40}$/);
      expect(ex.gameName).toBeDefined();
    }
    const again = await store.exchange(token, 'My Laptop');
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('token_spent');
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
});
```

- [ ] **Step 7: Run to verify it fails**

Run (emulators up: `cd firebase && npm run emulators`): `cd server && bun test src/pair/store.test.ts`
Expected: FAIL, cannot find module `./store`.

- [ ] **Step 8: Implement `store.ts`**

Implement `createPairStore(db)` with:
- `mint(uid)`: in a transaction, query `pairTokens` where `uid == uid && usedAt == null`, set each found doc's `expiresAt` to now (expire them); create `pairTokens/{token}` = `{ uid, createdAt, expiresAt: expiryFrom(now, 900000), usedAt: null, agentTokenId: null }` with `token = randomToken(32)`; return `{ token, expiresAt }`.
- `lookup(token)`: get `pairTokens/{token}`; return `null` if absent; else `{ uid, usedAt, expired: expiresAt <= now }`.
- `exchange(token, label?)`: read the game name from `gameAccounts/{uid}` (created by the SP1 bridge; if absent, still allow exchange and return `gameName: null`). In one transaction: re-read `pairTokens/{token}`; if absent -> `{ ok: false, reason: 'token_unknown' }`; if `usedAt != null` or expired -> `{ ok: false, reason: 'token_spent' }`; else create `agentTokens/{id}` (`id = randomToken(20)`, `{ uid, label: label ?? 'Claude Code', createdAt: now, lastSeenAt: null, revokedAt: null, secretHash: hashToken(agentToken) }` with `agentToken = randomToken(40)`), set the pair token's `usedAt = now` and `agentTokenId = id`; return `{ ok: true, agentToken, agentTokenId: id, gameName }`.
- `revoke(uid, agentTokenId)`: if `agentTokens/{id}.uid !== uid` -> throw a NotOwner error (route maps to 404); else set `revokedAt = now`.
- `listAgentTokens(uid)`: query `agentTokens` where `uid == uid`, return `{ id, label, createdAt, lastSeenAt, revokedAt }[]`.

Use Firestore `FieldValue`/`Timestamp` as the SP1 bridge does; store times as epoch millis for test simplicity if the bridge does, else Timestamps — match the SP1 bridge's convention (read `server/src/bridge.ts`). Keep under 400 lines.

- [ ] **Step 9: Run store test**

Run: `cd server && bun test src/pair/store.test.ts`
Expected: 4 pass.

- [ ] **Step 10: Router classification + routes + skill/human/guide docs**

- In `router.ts`, add a `pair` classification BEFORE the gate-guarded classes for: `/api/pair` (POST, sub `mint`), `/pair/:token` (GET, sub `fetch`), `/api/pair/:token/exchange` (POST, sub `exchange`), `/api/agent-tokens/:id/revoke` (POST, sub `revoke`), `/connect` (GET, sub `guide`). Return `{ kind: 'pair', sub, token?, id? }`. Add router tests for each path shape.
- Create `skill.md`, `human.html`, `guide.md` with the exact contents from spec sections 3.4, 3.5/3.6, using `{{TOKEN}}` and `{{ORIGIN}}` placeholders. Read them once at boot.
- Implement `createPairRoutes({ store, auth, origin })` `handle(req, route)`:
  - `mint`: verify Firebase bearer (401 if missing/invalid) -> `store.mint(uid)` -> `{ pairUrl: `${origin}/pair/${token}`, token, expiresAt }`.
  - `fetch`: no auth. `lookup`; if absent/expired/used -> status 410 with the "expired" body in the negotiated type. Else content-negotiate: `Accept` preferring `text/html` -> `human.html` with `{{ORIGIN}}`; else `text/markdown; charset=utf-8` -> `skill.md` with `{{TOKEN}}`/`{{ORIGIN}}`.
  - `exchange`: no auth. Body `{ label? }`. `store.exchange`; on `{ok:false}` -> 410 `{ error: reason }`; on ok -> `{ agentToken, gatewayUrl: `${origin}/mcp`, gameName }`.
  - `revoke`: verify bearer, owner only; `store.revoke`; NotOwner -> 404; else 204.
  - `guide`: gate cookie required (it is part of the shell); render `guide.md` to HTML with `{{ORIGIN}}` and the shell tokens. (If HTML rendering of markdown is heavy, serve the markdown wrapped in a minimal HTML shell; keep it simple.)
- In `index.ts`, construct `createPairStore` + `createPairRoutes` once and route the `pair` class to `handle`; ensure the gate middleware is bypassed for `pair` subs `fetch`/`exchange`/`mint`/`revoke` but `guide` stays behind the gate. `mint`/`revoke` do their own Firebase bearer check.

- [ ] **Step 11: Write the failing routes test (emulator) and Firestore rules**

`server/src/pair/routes.test.ts`: mint requires bearer (401 without); `GET /pair/:token` with `Accept: */*` returns `text/markdown` containing the token; with a browser `Accept: text/html,...` returns `text/html`; an expired/unknown token returns 410; exchange succeeds once then 410 `token_spent`; revoke by a non-owner returns 404. Mint ID tokens via the auth emulator custom-token exchange as `bridge.test.ts` does.

Extend `firebase/rules.test.ts`: `pairTokens/{token}` and `agentTokens/{id}` are readable by the owning uid, not writable by any client; other uids cannot read another's tokens. Add the rules to `firestore.rules`:

```
match /pairTokens/{token} {
  allow read: if request.auth != null && resource.data.uid == request.auth.uid;
  allow write: if false;
}
match /agentTokens/{id} {
  allow read: if request.auth != null && resource.data.uid == request.auth.uid;
  allow write: if false;
}
```

- [ ] **Step 12: Run to verify fail, implement, run to pass**

Run (emulators up): `cd server && bun test src/pair/routes.test.ts` then `cd firebase && npm test`. Expected after implementation: routes tests pass; rules tests (existing + new pairTokens/agentTokens) pass. Also `cd server && bun test` full suite green (incl updated health.test with `gateway`).

- [ ] **Step 13: Commit**

```bash
git add server firebase
git commit -m "feat(server): pairing subsystem, agent tokens, skill document, /connect guide"
```

---

### Task 2: PluginRegistry and panel manifests (spec/roadmap Task 12 amendment)

**Files:**
- Modify: `web/src/frame/panels.ts` (rename controller to PluginRegistry, add manifest), `web/src/panels/{account,config,connect,claude,xp,loot}.ts` (each exports a `manifest`), `web/src/main.ts` (registration uses manifests)
- Test: `web/src/frame/panels.test.ts` (extend)

**Interfaces:**
- Consumes: `PanelView` from the current `panels.ts`; `PanelId` from `types.ts`.
- Produces: `PluginManifest = { id: PanelId; name: string; icon: string; tier: 'shell' }`; `createPluginRegistry(opts)` (the renamed `createPanelController`) with the same `open/close/toggle/current/register/restore` API plus `register(manifest: PluginManifest, view: PanelView)` (manifest replaces the bare id) and `manifests(): PluginManifest[]`. Each panel module exports `const manifest: PluginManifest`.

- [ ] **Step 1: Extend the failing test**

Add to `web/src/frame/panels.test.ts` a test that `createPluginRegistry` registers by manifest, `manifests()` returns them in registration order, and `register(manifest, view)` then `open(manifest.id)` mounts the view and marks the icon active (reuse the existing fixture; assert on `manifests()` contents `{id,name,icon,tier}`).

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/frame/panels.test.ts`
Expected: FAIL (createPluginRegistry / manifests not defined).

- [ ] **Step 3: Rename and add manifest**

Rename `createPanelController` -> `createPluginRegistry` in `panels.ts`; export `PluginManifest`; change `register(id, view)` to `register(manifest: PluginManifest, view: PanelView)`, store manifests in an ordered array, key views by `manifest.id`; add `manifests()`. Keep `open/close/toggle/current/restore` unchanged (still keyed by id). Add each panel's `manifest` export, e.g. in `claude.ts`: `export const manifest = { id: 'claude', name: 'Claude', icon: '✦', tier: 'shell' } as const;` and similarly account/config/connect/xp/loot with their icons matching `frame.html`'s strip buttons.

- [ ] **Step 4: Update main.ts registration**

In `main.ts`, replace `createPanelController` with `createPluginRegistry` and register each panel as `panels.register(<panelModule>.manifest, create<Name>Panel(deps))`, importing each `manifest`.

- [ ] **Step 5: Run tests + typecheck + lint**

Run: `cd web && npx vitest run src/frame/panels.test.ts && npm run typecheck && npm run lint && npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "refactor(web): panel controller becomes manifest-driven PluginRegistry"
```

---

### Task 3: Connect card and Claude Connection panel (spec Features 2.5, 3, 4)

**Files:**
- Create: `web/src/panels/connectCard.ts`
- Modify: `web/src/panels/connect.ts` (Connect -> Claude Connection), `web/src/api.ts` (add pair/exchange-status/revoke client calls), `web/src/panels/claude.ts` (button opens 'connect')
- Test: `web/src/panels/connectCard.test.ts`, extend `web/src/api.test.ts`

**Interfaces:**
- Consumes: `PanelView`, the pairing routes from Task 1 (`POST /api/pair`, `POST /api/agent-tokens/:id/revoke`), Firestore client listeners on `pairTokens/{token}` and `agentTokens` (via `web/src/firebase.ts` `db`), `deps` object.
- Produces: `createConnectCard(opts)` returning `{ el: HTMLElement; dispose(): void }` rendering the pairing URL, copy button, expiry countdown, and a status line driven by a `pairTokens` listener; `api.mintPair(idToken)` -> `{ pairUrl, token, expiresAt }`; `api.revokeAgentToken(idToken, id)`; the Claude Connection panel `createConnectPanel(deps)` with pairing card + sessions list + gateway + link health.

- [ ] **Step 1: api additions (test first)**

Extend `web/src/api.test.ts`: `mintPair` POSTs to `/api/pair` with the bearer and returns the parsed body; `revokeAgentToken` POSTs to `/api/agent-tokens/:id/revoke` with the bearer, resolves on 204, throws on 404. Mock fetch as the existing api tests do.

- [ ] **Step 2: Run fail, implement `api.ts` additions, run pass**

Run: `cd web && npx vitest run src/api.test.ts` (RED), implement `mintPair`/`revokeAgentToken` in `api.ts`, (GREEN).

- [ ] **Step 3: connectCard test + implementation**

`web/src/panels/connectCard.test.ts` (jsdom): given an injected `mint` that resolves `{ pairUrl, token, expiresAt }` and an injected fake listener, `createConnectCard` renders the URL in a read-only field, a copy button, and a status line that updates to "Paired as <label>" when the listener reports `usedAt` set. Assert DOM. Implement `connectCard.ts`: injectable `mint` and `subscribe(token, cb)` (default to real `api.mintPair` + a Firestore `onSnapshot` on `pairTokens/{token}`), with a copy button (`navigator.clipboard`), an expiry countdown, and a "New link" re-mint on expiry. `dispose()` unsubscribes the listener and clears the countdown interval.

- [ ] **Step 4: Claude Connection panel**

Rework `connect.ts` `createConnectPanel(deps)` to render, per spec section 4: the connect card (via `createConnectCard`, hidden when an active agent token exists or on "Pair another"), a Sessions list (one row per non-revoked `agentTokens` for the uid from a Firestore listener: label, created, last-seen relative, green/grey dot for seen-within-60s, Revoke button with confirm calling `api.revokeAgentToken`), a Gateway line from `deps` health (`up|down|not_deployed`), and a Link health line (fps/rtt/ws mirrored from `deps.hooks()?.getState()`). Empty state "No Claude session paired." `unmount()` disposes all listeners/intervals. Its `manifest` name becomes "Claude Connection" (keep id `connect`, icon from frame.html). Update `claude.ts` empty-state button to `deps.openPanel('connect')` (already does).

- [ ] **Step 5: Run web suite + typecheck + lint**

Run: `cd web && npm test && npm run typecheck && npm run lint`
Expected: connectCard tests + api tests + existing suite green.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat(web): shared connect card and Claude Connection panel"
```

---

### Task 4: Entry screen and login-triggered client start (spec Feature 1; amends SP1 Tasks 11 and 14)

**Files:**
- Create: `web/src/partials/entry.html`
- Modify: `web/index.html` (include entry.html; the old signin partial include is removed), `web/src/main.ts` (entry state machine, auto-guest, two buttons, client starts only on Login), `web/src/types.ts` (`AppState` gains `entry`, drops `signin`), `web/e2e/gate-to-game.pw.test.ts` (drive the entry screen)
- Delete: `web/src/partials/signin.html`
- Test: `web/src/state.test.ts` (extend), `web/e2e/gate-to-game.pw.test.ts`

**Interfaces:**
- Consumes: `createAppState`, auth functions, `startSession` (existing), the connect card (Task 3) for the "Connect to Claude" sub-view.
- Produces: `AppState = 'gate' | 'entry' | 'playing' | 'offline'`; `main.ts` boot: gate -> `entry`; subscribe to `onUser` BEFORE rendering buttons; first event with no user calls `signInAnonymously` (via `signInGuest`) exactly once; buttons enable on the next user event; "Login" calls `startSession()`; "Connect to Claude" shows the connect card sub-view (`entryView`). Client (`loadClient`) is invoked ONLY from `startSession`, which is called ONLY by the "Login" button, never from `onUser` directly.

- [ ] **Step 1: entry.html partial**

Create `web/src/partials/entry.html` with `#screen-entry` and the three zones from spec 2.1: identity strip (`#entry-identity`, right-side `#entry-account-link`), inline email forms (reuse the signin/signup/forgot form markup and ids so `wireSignin`-style handlers still bind), buttons row (`#btn-connect` left, `#btn-login` right, `#entry-checking` caption), guest warning (`#entry-guest-warning`), and an error line `#entry-error`. Include a container `#entry-connect-host` for the connect card sub-view and a `#btn-entry-back`.

- [ ] **Step 2: state test (extend)**

Extend `web/src/state.test.ts`: `AppState` includes `entry`; setting `entry` notifies; existing no-op-on-same and order tests still hold. (state.ts already generic over AppState; only the type changes.)

- [ ] **Step 3: main.ts entry rework**

- `types.ts`: `AppState = 'gate' | 'entry' | 'playing' | 'offline'`.
- `screens` map: `entry: 'screen-entry'` (remove `signin`). Keep `playing`/`offline` -> `screen-frame`.
- Replace `enterApp()` and the `onUser` handler: on gate open, call `enterApp()` which subscribes to `onUser` ONCE and sets `state.set('entry')`; render the identity strip; on the first event with a user, enable `#btn-connect`/`#btn-login` and hide `#entry-checking`; on the first event with NO user, call `signInGuest()` exactly once (guard with a `triedGuest` flag); if it rejects, show the guest-unavailable message and keep buttons disabled.
- Wire `#btn-login` -> `startSession()` (unchanged behaviour; it already does bridge+login and sets `state.set('playing')`).
- Wire `#btn-connect` -> mount the connect card into `#entry-connect-host` (mint via `api.mintPair(await currentIdToken())`), show the connect sub-view, keep a "Login" button and `#btn-entry-back` to return.
- Keep the email sign-in/up/forgot handlers (rebind to the entry partial ids) and the guest warning shown only while `identity?.isAnonymous`.
- Remove the old `screen-signin` show/hide and `wireSignin`'s guest button (guest is now automatic).
- `startSession()` must be the ONLY caller of `loadClient()` (it already is); confirm `onUser` no longer calls `startSession` directly.

- [ ] **Step 4: index.html + delete signin.html**

Replace the `signin.html` include with `entry.html` in `index.html`; `git rm web/src/partials/signin.html`.

- [ ] **Step 5: e2e update**

Update `web/e2e/gate-to-game.pw.test.ts`: after the gate, expect `#screen-entry`, the guest warning visible, both buttons enabled (poll), then click `#btn-login` to reach the frame and assert `getState().loggedIn`. Add a second assertion: click `#btn-connect`, expect a pairing URL field to appear, `fetch` that URL with `Accept: */*` and assert the response is `text/markdown` containing the token, then `#btn-entry-back` returns to the buttons.

- [ ] **Step 6: Run unit + e2e**

Run: `cd web && npm run typecheck && npm run lint && npm test`. Then the full stack e2e per the SP1 Task 14 procedure (emulators + dev engine 8899 + build client after engine up + build web + front server 8787), `cd web && npx playwright test`. Expected: unit green; e2e reaches the frame via Login and the connect sub-view yields markdown with the token. Stop all processes; never touch the live instance.

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "feat(web): two-button entry screen with auto-guest and login-triggered client start"
```

---

## Self-review against the spec

- **Feature 1 entry screen** (spec 2): Task 4 (entry.html, auto-guest, two buttons, entryView connect sub-view, guest warning, login-triggered start).
- **Feature 2 quick connect** (spec 3): Task 1 (token model, `/api/pair`, `/pair/:token` negotiation, `/api/pair/:token/exchange`, revoke, skill.md, human.html, guide.md, `/connect`), Task 3 (connect card, api client).
- **Feature 3 Claude Connection panel** (spec 4): Task 3 (sessions list, gateway line, link health, revoke).
- **Plan amendments** (spec 7): Task 11 -> Task 4; Task 13 -> Task 3; Task 14 -> Task 4 (login-only client start); new 13b -> Task 1; Task 12 PluginRegistry -> Task 2.
- **Health gateway field** (spec 4): Task 1 Step 5.
- **Gate exemption for /pair/*** (spec 3.2): Task 1 Step 10 (guide stays gated; mint/fetch/exchange/revoke exempt).
- **Type consistency:** `HealthSnapshot.gateway` added to both server and web types (Task 1); `PluginManifest` defined in Task 2 and used in Tasks 2-4; `AppState` `entry` in Task 4 consumed by main.ts; connect card `createConnectCard` produced in Task 3 and consumed by Tasks 3 (panel) and 4 (entry sub-view).
- **Placeholder scan:** the skill.md `claude mcp add {{ORIGIN}}/mcp` intentionally targets a gateway that returns 503 until sub-project 4 — spec-mandated, not a gap. No TBD/TODO.
- **Deferred to sub-project 4:** the MCP gateway, its tools, `agent` hook event for last-tool-call time (the Gateway panel line shows `not_deployed` until then).
