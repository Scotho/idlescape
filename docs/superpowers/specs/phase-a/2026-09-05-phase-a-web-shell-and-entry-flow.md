# Phase A audit — web shell, entry flow, identity, plugin framework, hiscores, e2e

Date: 2026-09-05. Scope: handoff sections 2.0, 2.1, 2.3, 6, 6.3, 15, 20 Phase D, 21.
Read-only audit of `web/`, `server/`, `client/` patches, specs, and `web/e2e`. Every claim
cites `path:line`; "inferred" marks what was not verified in code.

## Summary

- Entry flow is `gate -> entry -> playing`, with an auto-anonymous sign-in and two buttons
  (`Connect to Claude`, `Login`). **There is no Claude-connected precondition on Login**; the
  button enables on the first Firebase auth event alone (`web/src/main.ts:263-285`).
- Identity is 1 Firebase uid = 1 game character, enforced by `gameAccounts/{uid}` being a single
  doc (`server/src/bridge.ts:16-38`). Multi-character needs a new collection, not a field.
- The client is single-instance per page (`web/src/clientHost.ts:7-10`) and plugins read one
  global `hooks` (`web/src/main.ts:84`). A session manager seam is needed before a switcher.
- `hooks.login()` sets `headlessTitle` and logs in immediately (`client/src/client/Client.ts:604-613`);
  "Log in as <character>" and a mute toggle both need small new client patches.
- No live player-count route exists; the engine exposes it only as a Prometheus gauge on the
  management port (`engine/server/src/server/Metrics.ts:3`, `engine/server/src/web.ts:319-322`).
- SP3 hiscores/tracker is **spec only**; nothing under `server/src/tracker` or `web/src/hiscores`.
- E2E relies on stable element ids in `web/src/partials/*.html` and on
  `window.idlescape.client.getState()`; the engine rejects a duplicate login with code 5.

## Findings

### 1. Entry flow as built

**State machine.** `AppState = 'gate' | 'entry' | 'playing' | 'offline'` (`web/src/types.ts:1`),
default `'gate'` (`web/src/state.ts:4`). Screens map 1:1 to `<section>` ids
(`web/src/main.ts:34`); `'offline'` reuses `screen-frame` and is never actually set — the
offline card is toggled by `watchHealth()` (`web/src/main.ts:179-190`).

**Boot.** `boot()` wires gate + entry handlers, starts the health poll, then probes the gate by
`HEAD /client/deps.js` expecting a 401 when the cookie is missing (`web/src/main.ts:198-202,349-355`).
Gate POST `/api/gate` -> HMAC cookie `cs_gate` (`server/src/gate.ts:4,70-75`), password default
`fiddlesticks` (`server/src/env.ts:39`).

**Entry.** `enterApp()` sets `'entry'`, disables both buttons, subscribes `onUserIdToken`
(`web/src/main.ts:258-286`). First no-user event -> `signInGuest()` once (`main.ts:276-279`),
which calls `signInAnonymously` and writes `users/{uid} {displayName:'Guest', provider, createdAt}`
(`web/src/auth.ts:36-46`). Any user event -> buttons enabled (`main.ts:283-285`). The identity
strip and guest warning are rendered from `identity` (`main.ts:211-223`).

**Login.** `#btn-login` and `#btn-connect-login` both call `startSession()` (`main.ts:298-299`):
`state.set('playing')` (157) -> `loadClient()` (161) -> `currentIdToken()` -> `POST /api/bridge`
with `desiredName` only for non-anonymous users (164-166) -> `hooks.login(gameName, secret)` (168).
Failure paths write to the Account panel and open it (169, 173-176). Note: on bridge failure the
state stays `'playing'` (the frame), which differs from the entry spec's "state stays entry"
(`docs/superpowers/specs/2026-09-05-entry-screen-and-quick-connect-design.md:51-52`).

**No Claude precondition (verified).** `startSession()` only *disposes* the connect card
(`main.ts:155-156`); it never reads pairing state. `setButtonsEnabled` is driven solely by the
auth event (`main.ts:225-228,285`). The connect view is a sub-view with its own Login button
(`web/src/partials/entry.html:42-48`). Nothing to remove for the handoff.

**Client host.** `loadClient()` dynamically imports `/client/client.js`, constructs
`new Client(10, 0, true)`, and resolves on the `idlescape:client-ready` event
(`web/src/clientHost.ts:9-26`, dispatched by `client/src/hooks/install.ts:26-27`). The promise is
memoised in a module variable, so **one client per page** (`clientHost.ts:7,10`). The canvas is a
fixed `<canvas id="canvas" width=789 height=532>` in `web/src/partials/frame.html:10`, sized by
`layout()` (`main.ts:57-63`).

**Headless title patch.** `hooks.login` sets `this.headlessTitle = true`, stores user/secret and
immediately calls `this.login(...)` (`client/src/client/Client.ts:604-613`; PATCHES.md patch 3).
While headless: `titleScreenLoop()` returns early, so no title clicks are processed
(`Client.ts:1419-1423`, patch 7); `titleScreenDraw()` draws `Waiting for idlescape...` instead of
New/Existing User (`Client.ts:1553-1556`, patch 8) and hides the credential form
(`Client.ts:1578-1579`, patch 9). Because `headlessTitle` only flips inside `hooks.login`, the stock
title UI is drawn from client boot until the bridge returns.

**"Log in as <character>" — where it lands.** Two viable designs:
1. *Client patch (matches handoff 6.3 literally).* Add a hook `armLogin(gameName, secret, label)`
   to `HookBridge`/`ClientHooks` (`client/src/hooks/types.ts:33-48`) that sets `headlessTitle`,
   stores creds and a label but does not call `this.login()`. Patch 8 draws one centred
   `imageTitlebutton` labelled `Log in as <label>` (same primitives as `Client.ts:1559-1566`);
   patch 7 gains a hit-test for that button that calls `this.login(...)`. Keep `login()` for
   agent/auto paths. Terser `reserved` in `client/bundle.ts` must list the new names (PATCHES.md:9-12).
2. *DOM overlay (no client patch).* A shell overlay button over the canvas; the client keeps
   showing `Waiting for idlescape...`. Overlay layers are `pointer-events: none` today
   (`web/src/styles/frame.css:22`, `overlays.css:1`), so an interactive layer would be added.
   Cheaper and Playwright-friendly, but does not look like the OSRS title button.

**Mute toggle.** Title music starts unconditionally at `Client.ts:913-917` (`scape_main`, song 0
via `onDemand.request(2, ...)`, `midiVolume` default 0 = +0 dB `Client.ts:531`) and plays through
`saveMidi -> playMidi` (`Client.ts:640-642`). Volume is only changed by in-game varp `clientcode 3/4`
(`Client.ts:10720-10760`) mapping to `setMidiVolume`/`stopMidi`/`waveEnabled`. There is no
title-screen setting. A mute needs: (a) a hook `setAudioMuted(bool)` that calls `stopMidi(false)` /
`setMidiVolume` and short-circuits the requests at 913-917, 3535-3538, 7139-7158; (b) a toggle UI —
either drawn in patch 8 bottom-right of the 360x200 title box with a hit-test in patch 7, or a DOM
overlay; (c) persistence in the shell (`localStorage` or a `config` plugin setting). `TitleFlames`
(`client/src/client/TitleFlames.ts:12-35`, started at `Client.ts:1764-1767`) is unaffected.

### 2. Identity model and the three-choice home page

**Firebase side.** `Identity = { uid, isAnonymous, email, displayName }` (`web/src/types.ts:5`).
Guest = anonymous provider; upgrade via `linkWithCredential` keeps the uid (`web/src/auth.ts:72-85`);
`onIdTokenChanged` is used so the in-place upgrade is observed (`auth.ts:101-103`). Sign-up validates
display name 1-20 chars (`auth.ts:49-50`). Firestore `users/{uid}` rules: create/update own,
`gameName` and `createdAt` server-owned, read by any signed-in user, never deletable
(`firebase/firestore.rules:5-18`).

**Game side.** `POST /api/bridge` verifies the ID token, and `resolve()` returns the single
`gameAccounts/{uid}` doc or allocates one in a transaction against the `gameNames/{name}` index,
writing `users/{uid}.gameName` (`server/src/bridge.ts:15-44`). Names are normalised to
`^[a-z][a-z0-9_]*$`, max 12 (`server/src/gameName.ts:3-15`); guests get `guest_xxxxxx`
(`gameName.ts:28-30`); desired names are honoured only for non-anonymous users (`bridge.ts:22`).
The secret is a random 20-char string stored server-side (`gameName.ts:32-34`, `server/src/types.ts:45-49`).
**This is the 1:1 constraint**: `gameAccounts/{uid}` is a document, not a collection.

**Mapping the handoff onto the entry screen.** Today there is no "Play as Guest" click — the spec
chose auto-anonymous sign-in (`entry-screen spec:16`). Proposed state values:

```
AppState = 'gate' | 'home' | 'characters' | 'playing' | 'offline'
homeView = 'choices' | 'login' | 'signup' | 'connect'     // sub-view, as spec 2.3 did with entryView
```

- `'home'`: replaces `'entry'`. `Play as Guest` calls `signInGuest()` on click (no auto sign-in);
  `Log In` / `Create Account` reveal the existing `#signin-form` / `#signup-form`
  (`web/src/partials/entry.html:10-28`). Player count + patch notes render in the same card.
- `'characters'` (the **no-character gate**): entered after any auth event with a user. It calls a
  new `GET /api/characters` (Firebase bearer); zero results -> inline create form (name input,
  availability check, submit); otherwise select first and continue. The client is not loaded here.
- `'playing'`: unchanged, but `startSession(characterId)` replaces the bridge call with
  `POST /api/characters/:id/session` returning `{ gameName, secret }` for an owned character.
- `shell.init()` per uid (`main.ts:267-270`) stays as is.

Reuse for username validation: `normaliseGameName` + the `gameNames/{name}` transaction
(`bridge.ts:30-40`) already give server-backed uniqueness; expose it as `GET /api/characters/check?name=`
and return 409 from create on a race.

**Live player count.** Engine: `World.getTotalPlayers()` counts populated player slots
(`engine/server/src/engine/World.ts:1719-1729`); RuneScript sees it as `PLAYERCOUNT`
(`engine/server/src/engine/script/handlers/ServerOps.ts:126-128`); it is published as the Prometheus
gauge `lostcity_active_players` (`engine/server/src/server/Metrics.ts:3`, set at `World.ts:478`) on
the management Fastify at `/prometheus` (`engine/server/src/web.ts:319-322,347`), port
`WEB_MANAGEMENT_PORT=8897` (`engine/server/.env:69`). The public web Fastify has no player-count
route (`web.ts:79-100,160-249`). Our `/api/health` is public and unauthenticated
(`server/src/index.ts:33`, `server/src/router.ts:26`) and already polled by the shell every second
(`main.ts:183-189`). Proposal: `health.ts` `probe()` additionally fetches
`http://127.0.0.1:8897/prometheus`, parses the gauge, and `HealthSnapshot` gains `players: number | null`
(`server/src/types.ts:32-38`, `web/src/types.ts:3`). Fallback: count open relays in
`server/src/proxy/ws.ts` (connections, not logins; inferred, not read). Never expose 8897 publicly.

**Patch notes.** Same pattern as the human guide: a markdown file served by the front server
(`server/src/pair/guide.md` via route `/connect`, `server/src/router.ts:30`) or a Vite-built
`web/src/data/patch-notes.json`. No mechanism exists today.

### 3. Plugin framework as built

**Types.** `PluginManifest { id, name, icon, tier:'shell'|'client', description, settings?, defaultEnabled?, alwaysOn?, requires? }`
(`web/src/plugins/types.ts:15-29`). `PluginContext { client(), settings, storage, notify, openPanel, user() }`
(`types.ts:32-47`); `client()` returns `ClientHooks | null` (34), `user()` returns `{ uid, gameName }` (46).
`ShellPlugin { manifest, onEnable, onDisable, panel?, overlay?, onTick? }` (`types.ts:49-58`).

**Registry.** `createShellRegistry` keeps `plugins`, declaration `order`, `enabled`, per-plugin
`panels`/`overlays` (`web/src/plugins/registry.ts:27-32`); `init()` deactivates everything, loads the
store for the uid, then enables in `requires` order (79-94); `alwaysOn` cannot be disabled (66-67,
105-107); client-tier toggles go through `deps.onClientToggle` (43-44, 56-57), wired in `main.ts:105-111`
to `window.idlescape.plugins.enable/disable` (`web/src/clientTypes.ts:45-50`).

**Context.** `contextFor(id)` closes over module-level `hooks` and `identity` (`main.ts:82-98`), so
every plugin sees the same single client. `wireHooks()` runs once (`main.ts:145-152,162`).

**Settings.** `createSettingsStore(backend)` writes localStorage synchronously then debounces
Firestore 800 ms (`web/src/plugins/settings.ts:30-54`), flushed on `pagehide` (`main.ts:80`);
backend is `users/{uid}/plugins/{id} { enabled, settings, updatedAt }` (`web/src/plugins/firestoreBackend.ts:7-22`),
rules owner-only with typed fields (`firebase/firestore.rules:20-26`).

**Panels and strip.** `createPluginRegistry` (SP1 name; really the panel controller) owns one side
panel, `open/close/toggle/restore`, persisting the open id in `cs.panel`
(`web/src/frame/panels.ts:7-63`). `PanelId` is a closed union (`web/src/types.ts:4`); `rebuildStrip`
casts plugin ids into it (`main.ts:137`) — a `characters` panel must be added to that union.
Registered shell plugins: claude, xp, loot, notes, screenshot, status-hud, connect (alwaysOn),
account (alwaysOn), config (alwaysOn), plugins (alwaysOn) (`main.ts:118-127`). Overlays are
rendered into `#plugin-overlays` (`main.ts:141`, `frame.html:12`) with `pointer-events: none`
(`frame.css:22`). `status-hud` is the model for a polling status widget: it reads
`ctx.client()?.getState()` on a 600 ms interval (`web/src/plugins/builtin/statusHud.ts:50-55`).

**What a plugin can see per client.** `ClientState { loggedIn, gameName, skills, inventory, fps, rttMs, hp, prayer, energy, boosts }`
(`web/src/clientTypes.ts:6-17`), events `login | logout | disconnect | xp | inventory | chat | tick`
(`clientTypes.ts:25-33`). There is **no location or activity** in the state; the handoff's
"current location / activity" needs a hook extension (player tile from the client's local player;
inferred) or a derivation ("idle" = no xp/inventory/chat event for N seconds).

**Proposed seam for N clients.** `web/src/sessions/sessionManager.ts`:

```ts
interface CharacterSession { characterId: string; gameName: string; hooks: ClientHooks;
  frame: HTMLIFrameElement; startedAt: number; status: 'booting'|'title'|'loggedIn'|'disconnected';
  lastEventAt: number }
interface SessionManager { open(characterId): Promise<CharacterSession>; activate(id): void;
  active(): CharacterSession | null; list(): CharacterSession[]; on(ev, fn): () => void }
```

- Each session is a same-origin iframe (`/play.html?character=<id>`) hosting the canvas +
  `loadClient()`; the parent reads `iframe.contentWindow.idlescape.client` after the ready
  event, so the existing `ClientHooks` contract is reused unchanged. `clientHost.ts`'s memo
  (`clientHost.ts:7`) stays valid per iframe.
- `PluginContext.client()` becomes `manager.active()?.hooks ?? null`; add `ctx.sessions` (read-only
  list + change subscription) for the Characters plugin. `wireHooks` runs per session.
- The Characters plugin: `alwaysOn`, `tier:'shell'`, `panel` listing characters from
  `GET /api/characters` joined with `manager.list()`; row click -> `open`/`activate`; rows poll
  `hooks.getState()` like `status-hud`. Deletion is not offered here (handoff 6.2).
- Engine constraint: the same username cannot be logged in twice — `World.ts:857-868` sends code 5
  and closes; distinct characters have distinct usernames, so N sessions are fine, but moving one
  character between iframes requires logout and a wait for the engine's logout cycle.

### 4. Hiscores tracker (SP3) status

Spec only. Grep for `tracker|hiscore|snapshot` in `server/src` and `web/src` hits only the XP/loot
tracker plugins and `health.snapshot()`; `server/src/tracker`, `web/src/hiscores`, `web/hiscores.html`,
`server/data` do not exist. The spec plans front-server SQLite with `players(game_name, uid)`,
`snapshots`, `latest`, `latest_skill`, `records` and `POST /api/tracker/snapshot` fed by the
`xp-tracker` plugin (`docs/superpowers/specs/2026-09-05-sp3-hiscores-tracker-design.md:38-55,62-80`).
The engine's own `hiscore`/`hiscore_large` tables (`engine/server/src/db/types.ts:32-47`) are only
written by `updateHiscores` in login-server mode (`engine/server/src/server/login/LoginServer.ts:18-105,457`),
which the single-world setup does not run (SP3 spec:28-31).

**Adding account-level rankings.** Client snapshots cannot carry bank contents — `ClientState` has
inventory only (`clientTypes.ts:10`) — so raw-coin and wealth rankings need a server-authoritative
feed (Phase C wealth service reading the shared bank), not the hooks path. Schema addition:
`accounts(uid PK, display_name)`, `account_latest(uid PK, coins, wealth_est, priced_at, updated_at)`,
indexed on `coins DESC` / `wealth_est DESC`; `players.uid` already links characters to the account.
Read routes `GET /api/hiscores?skill=coins|wealth` fit the spec's route shape (SP3 spec:89-97).
Rank ties and the 30 s cache follow the spec. Keep character skill rankings per character.

### 5. E2E and verification

- Stack: `scripts/verify.ps1` runs client `bun test src/hooks`, server typecheck + `bun test` with
  auth (9099) and Firestore (8080) emulators, web typecheck/lint/vitest, firebase rules tests,
  `build.ps1`, then emulators + `start-stack.ps1 -Prod` and `npx playwright test`
  (`scripts/verify.ps1:60-151`). `start-stack.ps1` orders content overlay -> engine (`npx tsx src/app.ts`,
  waits for `World ready`) -> client `bun run build:dev` -> front server -> vite dev
  (`scripts/start-stack.ps1:20-63`). Ports: engine `WEB_PORT=8899` (`engine/server/.env:66`,
  `server/.env:2-3`), management 8897, front 8787 (`server/src/env.ts:35`), vite 5173
  (`web/vite.config.ts:27`), emulators wired in `web/src/firebase.ts:16-19`. Gate password
  `fiddlesticks` (`env.ts:39`).
- Playwright: `baseURL http://localhost:8787`, one worker, 120 s timeout (`web/playwright.config.ts:3-12`).
- Selectors relied on: `#gate-password`, button "Enter", `#screen-entry`, `#entry-guest-warning`,
  `#btn-login`, `#btn-connect`, `#screen-frame`, `[data-panel="account"]`, `#panel-title`,
  `#entry-connect-view`, `#entry-buttons`, `#connect-url`, `#btn-entry-back`, `#btn-connect-login`,
  `#entry-account-link`, `#btn-show-signup`, `#signup-form`, `#signup-name/email/password`,
  `#entry-identity`, `#entry-email-forms` (`web/e2e/gate-to-game.pw.test.ts:7-99`);
  `[data-panel="plugins"]`, `[data-toggle="loot"]`, `localStorage cs.plugin.loot`
  (`web/e2e/plugins.pw.test.ts:15-32`). State is asserted via `window.idlescape.client.getState()`
  (`gate-to-game.pw.test.ts:25-30`, typed in `web/e2e/global.d.ts`). The in-game screenshot is written
  to `docs/screenshots/e2e-in-game.png` (line 35), which is why that file shows as modified.
- **Code 5 constraint.** Re-login of the same character while the engine still holds the player is
  rejected with byte 5 (`engine/server/src/engine/World.ts:857-868`), shown as "Your account is
  already logged in." (`client/src/client/Client.ts:1975-1976`); the plugins e2e deliberately avoids
  reload-then-relogin (`plugins.pw.test.ts:4-7`). A new browser context gets a fresh anonymous uid
  and therefore a fresh guest, so cross-test isolation is fine; the constraint bites only within one
  persisted auth session. Renaming ids in the entry partial breaks all three entry tests.

### 6. Conventions

- Styling: RuneLite palette as RGB triplets in `web/src/styles/tokens.css:1-21`, consumed as
  `rgb(var(--rl-x))`; `.hidden { display:none !important }` (`tokens.css:23`) is the visibility
  primitive used by `web/src/dom.ts:17-29`. Cards/forms in `auth.css` (`.card-screen`, `.card`,
  `.btn`, `.input`, `.link`, `.notice*`), frame in `frame.css`, panel atoms `p-row/p-label/p-value/p-btn/p-input`
  in `panels.css`, canvas overlays in `overlays.css`. Partials are inlined by the `@include` Vite
  plugin (`web/index.html:14-16`, `web/vite.config.ts:6-23`).
- 400-line file rule: platform spec (`docs/superpowers/specs/2026-09-04-idlescape-platform-design.md:33,157,286`),
  SP2 spec:158, entry spec:103. Largest current file is `main.ts` at 357 lines.
- TypeScript strict, bundler resolution, tests and e2e excluded from typecheck (`web/tsconfig.json:7,17-18`);
  ESLint recommended + typescript-eslint (`web/eslint.config.js`).
- Vitest: `globals`, `jsdom`, `src/**/*.test.ts`, setup `src/test/setupDom.ts` which only clears
  `document.body` (`web/vitest.config.ts:3`, `web/src/test/setupDom.ts:1`). Test seams are
  injectable factory options (`web/src/panels/connect.ts:26-32`, `settings.ts:30`).

## Implications for the handoff

1. **2.0 Home page**: replace auto-guest with an explicit `Play as Guest` click; `'entry'` becomes
   `'home'` with a `homeView` sub-view. Player count needs a new front-server field on `/api/health`
   sourced from the engine's management `/prometheus`; patch notes need a served markdown/JSON.
2. **2.1 / 2.2 Characters**: `gameAccounts/{uid}` must become a per-character collection with a uid
   owner field; `users/{uid}.gameName` (`bridge.ts:37`) becomes a list or is dropped. Rules must
   keep character docs server-only as they are today (`firestore.rules:29-30`).
3. **6.1 No-character gate**: a new `'characters'` state before `loadClient()`; the bridge's name
   normalisation and uniqueness transaction are reusable for validation.
4. **6.3 Game-client login page**: two small client patches (arm-login hook + audio-mute hook) plus
   either canvas-drawn or DOM controls; PATCHES.md and `bundle.ts` reserved names updated.
5. **2.3 Switcher**: requires the session-manager seam (iframe per character) and
   `PluginContext.client()` redirected to the active session; `PanelId` union extended; hook state
   lacks location/activity.
6. **15 Wealth hiscores**: cannot ride SP3's client-snapshot path; needs the server-side bank feed.
7. **6.2 Deletion**: nothing exists; the character routes must reject agent tokens
   (`agentTokens`, `server/src/pair/routes.ts`) and accept only Firebase ID tokens.

## Open questions

- Should `Log in as <character>` be drawn on the canvas (client patch) or as a DOM overlay? The
  handoff's OSRS styling favours canvas; testability favours DOM.
- Iframe per character vs. refactoring the client for multiple instances: the memoised
  `loadClient()` and the fixed `#canvas` id make iframes the only no-refactor option; SP2b's
  fullscreen WebGL path may interact with iframes (not read here).
- Where does "current location / activity" come from — a new hook field or SP4's observe layer?
- Does the anonymous guest still get created on page load for analytics, or only on click?
- Bridge failure currently leaves the user on the frame with an error; should it return to `'home'`?
- Player count: scrape `/prometheus` or count WS relays? Scraping is exact but couples us to the
  management port being reachable from the front server.

## Recommendation

Proceed in this order: (1) add the session-manager seam and iframe client page behind the
existing single-session behaviour, so plugins compile against `ctx.client()` unchanged; (2) land
the `'home'`/`'characters'` states with the explicit guest button and the character API stubs;
(3) add the two client hooks (`armLogin`, `setAudioMuted`) with canvas-drawn title controls,
updating PATCHES.md and the terser reserved list; (4) extend `/api/health` with `players`;
(5) build the Characters plugin on the seam. Keep SP3 as the base for account-level hiscores but
plan its wealth feed as a server-side service, not a client snapshot.
