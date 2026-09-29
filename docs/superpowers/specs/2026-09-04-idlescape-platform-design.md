# Idlescape — Sub-project 1: Platform and Shell

> **2026-09-05: revision migrated 225 -> 274 by SP1b; see
> `docs/superpowers/specs/2026-09-05-sp1b-revision-274-design.md`. "Client-TS 225" references
> below now read 274.**

Date: 2026-09-04
Status: approved 2026-09-04
Scope: the first of four sub-projects. This one delivers a public, gated, Firebase-authenticated
Lost City (2004Scape) web client wrapped in a RuneLite-style frame, served from
`https://osrs.scotho.com`. Nothing Claude-specific ships here, but the pairing surface,
hook module, and front server are shaped so sub-projects 2 to 4 are additive.

The four sub-projects, in order:

1. Platform and shell (this document)
2. Pairing and the MCP gateway (Claude Code first, OAuth for claude.ai later)
3. Chat interface between player and Claude, with game chat mirrored
4. Player info panels: XP tracker, loot tracker, session stats

## 1. Goals and non-goals

Goals

- A player opens `https://osrs.scotho.com`, passes a temporary password gate, signs in as a
  guest or with email, and is standing in the game inside a RuneLite-styled frame with no
  game password ever shown to them.
- The Lost City engine and content run unmodified as pinned upstream clones.
- The browser client is a thin fork whose only additions live in one hooks module.
- The same code runs on this Windows PC now (through a Cloudflare Tunnel) and on an Oracle VM
  later (containers), with the move being configuration only.
- Conventions from the tron (Luminal) project: strict TypeScript, Vite, ESLint flat config,
  Vitest, Playwright, conventional commits, files under 400 lines, shared types per package,
  one env example per process, Firebase rules style.

Non-goals for this sub-project

- Anything Claude does in the game (sub-project 2).
- The conversation UI beyond a placeholder panel (sub-project 3).
- Live XP and loot panels beyond specced layouts and the hook events that will feed them
  (sub-project 4).
- OAuth 2.1 for claude.ai connectors (deferred; token store designed to allow it).
- Real anti-abuse. The gate is deliberately flimsy and will be removed.
- tron's admin dashboard integration and ref system (they depend on tron's local dashboard).

## 2. Decisions recorded from the design conversation

| Topic | Decision |
|---|---|
| Who drives the character | Co-pilot: the human plays in the browser; their Claude session attaches to the same character (sub-project 2). |
| Hosting | One public server, open access, behind account creation. This PC now, Oracle VM later. |
| Identity | Firebase Auth. Guest (anonymous) accounts plus email/password. Guests can attach an email later via credential linking. No other OAuth providers. |
| Gate | Single shared password `fiddlesticks` on a page-level gate, removable by config. |
| Claude surfaces | Start with Claude Code (bearer token). Structure the token layer so claude.ai OAuth can be added later. |
| Architecture | Approach 3: our own front server on the public port, engine untouched on localhost, WebSocket and cache reverse-proxied. |
| Client | Thin fork of Client-TS with a single hooks module; page logs the client in programmatically. |
| Firebase project | New project for this game, not tron's or scotho's. |
| Layout | Full RuneLite-style frame: title bar, canvas, 210px side panel, right icon strip, overlays over the canvas, footer. Canvas auto-sizes by default. |
| Domain and edge | `osrs.scotho.com`. DNS at Cloudflare (registrar Namecheap). TLS at Cloudflare's edge. Cloudflare Tunnel from this PC; tunnel or proxied A record from the VM. |

## 3. Topology

```
Browser ──HTTPS/WSS──> Cloudflare edge ──Tunnel──> front server (Bun, :8787, our code)
                                                      │  serves: shell page, client bundle, wasm
                                                      │  handles: gate, /api/bridge, /api/health
                                                      │  proxies: cache endpoints, WebSocket upgrade
                                                      └──HTTP/WS──> engine (Bun, :8888, upstream, unmodified)
                                                                     TCP :43594 (Java client) not exposed
Firebase Auth + Firestore (project: idlescape-osrs) <──── browser SDK and firebase-admin in front server
```

Two long-lived processes on the same host. The front server is the only thing the edge can
reach. The engine binds all interfaces by upstream design and has no bind-address setting;
it is protected by the host firewall on the PC (no inbound rule, no router forward) and by
not publishing the port in Docker on the VM. This is a known gap, documented and accepted for
now because a direct engine connection would still need a valid game account.

## 4. Access and identity

### 4.1 Gate

- Every request except the gate page itself, its POST, and static assets under `/assets/`
  requires a `cs_gate` cookie.
- `POST /api/gate` with `{ password }`. On match with `GATE_PASSWORD`, set
  `cs_gate=<exp>.<hmac>` where hmac is HMAC-SHA256 over `exp` with `GATE_SECRET`.
  Cookie flags: HttpOnly, Secure, SameSite=Lax, 30-day expiry. Wrong password: plain
  message, 3-second per-IP cooldown.
- The WebSocket upgrade requires the cookie, so the engine cannot be reached by skipping the page.
- `GATE_ENABLED=false` disables the middleware. Removing the gate later is deleting the
  middleware file and its two env lines.

### 4.2 Firebase identity

- Firebase web SDK in the shell, following tron's `auth.ts` and `auth.html` partial patterns,
  reduced to: guest sign-in, email sign-up, email sign-in, password reset, and "attach email"
  (linkWithCredential on the anonymous user).
- Firestore `users/{uid}`: `{ displayName, gameName, createdAt, provider }`. Client rules:
  read if authenticated; create and update own document only; `gameName` is written by the
  bridge, never by the client (rules reject client writes to that field).
- Emulators for local development, as tron does via `VITE_USE_FIREBASE_EMULATORS`.

### 4.3 Game account bridge

The engine's login packet needs a game username and password. Auto-registration is enabled
in the engine (`WEBSITE_REGISTRATION=false` in its env), so the first login with a new name
creates the account. The bridge owns the mapping.

- `POST /api/bridge` with header `Authorization: Bearer <Firebase ID token>` and optional body
  `{ desiredName }` on first call.
- Server verifies the token with firebase-admin. Looks up `gameAccounts/{uid}`. If absent,
  derives a game name (see rules), generates a 20-character random secret, and creates the
  document `{ gameName, secret, createdAt }` plus the uniqueness index `gameNames/{gameName}
  = { uid }` in one Firestore transaction. Returns `{ gameName, secret }` either way.
- `gameAccounts` and `gameNames` have no client access in rules; the bridge writes with the
  admin SDK.
- Game name rules: 1 to 12 characters, lowercase letters, digits, underscore; must start with
  a letter; uniqueness enforced by the index. `desiredName` is normalised to these rules; on
  collision the server appends a short numeric suffix and returns the result. Guests without a
  desired name get `guest_` plus 6 random characters.
- The page hands the pair to the client hook's `login`. The human never sees the secret.
- Consequence: a guest who clears browser storage loses the Firebase anonymous user and thus
  the character. The Account panel and footer nudge guests to attach an email.

## 5. Front server

Bun, TypeScript strict, in `server/`. One process, one env file (`server/.env.example`):

```
PORT=8787
ENGINE_HTTP=http://127.0.0.1:8888
ENGINE_WS=ws://127.0.0.1:8888
GATE_ENABLED=true
GATE_PASSWORD=fiddlesticks
GATE_SECRET=<random>
FIREBASE_PROJECT_ID=idlescape-osrs
GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json
FIREBASE_EMULATORS=false
PUBLIC_ORIGIN=https://osrs.scotho.com
```

Routes

| Route | Behaviour |
|---|---|
| `GET /` | Shell page (built Vite index). The shell renders gate, sign-in, or playing state client-side. |
| `POST /api/gate` | Gate cookie issuance (4.1). |
| `POST /api/bridge` | Game account bridge (4.3). |
| `GET /api/health` | `{ engine: "up" \| "down", engineUptimeMs, version }`. Engine probed every 10 s via its `/rs2.cgi` HEAD. |
| `GET /assets/*` | Vite build output, immutable cache headers. |
| `GET /client/client.js`, `/client/*.wasm`, `/client/deps.js`, `/client/*.sf2` | Client bundle and companions from `client/out`, served together so JS and wasm never mismatch. |
| `GET /crc`, `/title`, `/config`, `/interface`, `/media`, `/models`, `/textures`, `/wordenc`, `/sounds` | Reverse-proxied to the engine with content type preserved. Gate cookie required. |
| `GET /` with `Upgrade: websocket` | Proxied to the engine WebSocket, subprotocol `binary`, frames relayed unchanged both ways, close codes mirrored. Gate cookie required. The client dials the page's own host at the root path, so no client change is needed for routing. |

Anything else is 404. No CORS headers: single origin by design.

Modules (each under 400 lines): `index.ts` (Bun.serve wiring), `gate.ts`, `bridge.ts`,
`gameName.ts`, `proxy/http.ts`, `proxy/ws.ts`, `health.ts`, `firebaseAdmin.ts`, `env.ts`,
`types.ts`.

## 6. Shell page (RuneLite frame)

Vite app in `web/`, TypeScript strict, HTML partials via tron's include plugin, tokens CSS.
No framework.

### 6.1 States

- **gate**: centred card with one password field. On success, reload into sign-in.
- **signin**: centred card: "Play as guest", email sign-in, sign-up, reset. Same structure as
  tron's auth partial, reduced.
- **playing**: the frame (6.2). Entered after bridge success; the client is started only then.
- **offline**: replaces the canvas with a "world offline" card and a retry countdown when
  `/api/health` reports the engine down.

### 6.2 Frame anatomy (approved mockup)

- **Title bar** (22px): brand "idlescape", world and game name centre, decorative window
  glyphs right.
- **Stage** (flex row): canvas left, side panel, icon strip right edge.
  - Canvas keeps 765:503, auto-sizes to the width left by the panel. Configuration panel
    offers 1x, 2x, 3x, auto, and the pixelated filter, persisted in localStorage like upstream.
  - Side panel 210px, RuneLite grey (`#282828`), header with icon, title, and back chevron;
    scrollable body. Collapsed when no icon is active; the canvas takes the width back.
  - Icon strip 32px, one icon per plugin, orange (`#ff981f`) for the active one, gear at bottom.
- **Overlays**: absolutely positioned HTML boxes over the canvas, scaled with it: xp/h line
  top-left, info boxes below it, pairing status top-right. Translucent black, orange text,
  RuneLite border.
- **Footer** (16px): left identity nudge for guests; right fps, ping, and gate indicator.
- Responsive: below 1100px the panel moves under the canvas; below 700px it becomes a bottom
  sheet and the icon strip becomes a bottom bar.

### 6.3 Plugins (panels) in this sub-project

| Icon | Panel | Contents now |
|---|---|---|
| Claude | Claude | Placeholder: "Pair Claude to start", link to Connect. Sub-project 3 fills it. |
| XP | XP Tracker | Layout and per-skill rows driven by hook `xp` events: skill, xp gained this session, xp/h, time to next level. Live from day one because the hook exists; polish in sub-project 4. |
| Loot | Loot Tracker | Layout driven by hook `inventory` added events: item id, count, first seen. Names resolved from the client's object config. |
| Connect | Connect | Pairing card: URL with copy button, status. In this sub-project the card shows the agreed URL shape with a placeholder token and the status "gateway not deployed yet"; no tokens are minted. |
| Account | Account | Identity (guest or email), game name, attach-email flow, sign out, bridge errors. |
| Gear | Configuration | Canvas size and filter, fullscreen, hide overlays, theme note. |

### 6.4 Visual direction

RuneLite palette: `#1b1b1b` window, `#1e1e1e` strip and headers, `#282828` panel, `#808080`
muted, `#a0a0a0` text, `#e0e0e0` strong, `#ff981f` brand orange, `#43a047` ok, `#e53935` error.
System sans for panels. A free pixel font for overlays chosen at implementation, never a Jagex
font. Tokens live in `web/src/styles/tokens.css` in tron's RGB-triplet convention.

## 7. Client fork and hooks

`client/` is a git fork of `LostCityRS/Client-TS` branch 225. All additions live in
`client/src/hooks/` plus minimal call sites in `Client.ts`. Build stays upstream's `bundle.ts`;
output goes to `client/out/`, which the front server serves.

Exposed on `window.idlescape.client`:

```ts
interface ClientHooks {
  login(gameName: string, secret: string): Promise<LoginResult>;
  logout(): void;
  echoChat(text: string, colour?: ChatColour): void;      // writes into the in-game chat pane
  getState(): ClientState;
  on<E extends keyof HookEvents>(event: E, handler: (payload: HookEvents[E]) => void): () => void;
}

type LoginResult = { ok: true } | { ok: false; code: number; reason: string };
type ChatColour = 'orange' | 'white' | 'green' | 'red';

interface ClientState {
  loggedIn: boolean;
  gameName: string | null;
  skills: { xp: number[]; level: number[] };          // indexed by skill id
  inventory: { id: number; count: number }[];
  fps: number;
  rttMs: number | null;
}

interface HookEvents {
  login: { gameName: string };
  logout: Record<string, never>;
  disconnect: { code: number };
  xp: { skill: number; xp: number; level: number; delta: number };
  inventory: { added: { id: number; count: number }[]; removed: { id: number; count: number }[] };
  chat: { kind: 'game' | 'public' | 'private'; sender: string | null; text: string };
  tick: { cycle: number };
}
```

Implementation notes

- `login` calls the client's existing private login routine; the title screen form is hidden
  when the hooks module is active. Rejections map the engine's login response codes to
  `LoginResult`.
- `xp` and `inventory` are computed by diffing the client's own skill and inventory arrays after
  the packets that update them; no protocol parsing in our code.
- `echoChat` pushes into the client's chat message list the way a server message does.
- `tick` fires once per client cycle for sub-project 2's observers; cheap, no payload.
- Sub-project 2 grows this interface with observation (`getScene`, nearby NPCs, dialogue state)
  and actions (walk, interact, use item); names are additive.

## 8. Repository layout and conventions

The repo is `idlescape`, rooted at the current `C:\projects\osrs_test` directory (folder name
kept to avoid breaking sessions). Local only for now by owner decision; no remote until asked.

```
idlescape/
  server/        front server (Bun, TS)
  web/           shell page (Vite, TS)
  client/        fork of Client-TS 225 + hooks
  engine/        upstream Engine-TS 225 and Content 225, cloned and pinned by scripts/setup
  deploy/        cloudflared/, docker/, windows/ (Task Scheduler + service scripts)
  firebase/      firestore.rules, firestore.indexes.json, firebase.json, .firebaserc
  docs/          superpowers/specs, screenshots, decisions
  scripts/       setup.ps1, build-client.ps1, start-stack.ps1, verify.ps1 and .sh twins
  README.md
```

Migration from the current layout: `lostcity/engine` and `lostcity/content` move under
`engine/`; `lostcity/webclient` becomes `client/` with our fork remote added; the wrapper
repo `lostcity/` is dropped. Existing `start-server.ps1` and `build-client.ps1` are replaced by
the `scripts/` versions.

Conventions: strict TS, no new `as any`; ESLint flat config per package; Vitest per package;
conventional commits `feat(scope):` etc.; files under 400 lines; each package has
`types.ts` as the single source of shared shapes; `.env.example` per process; upstream clones
are never edited and are pinned to commits recorded in `scripts/upstream.lock`.

## 9. Deployment

### 9.1 This PC (now)

- Engine and front server run as Task Scheduler tasks at startup, "run whether user is logged
  on or not", restart on failure, working directories set, logs to `logs/`.
- `cloudflared` installed via winget and registered as a Windows service with a tunnel config:
  ingress `osrs.scotho.com` -> `http://localhost:8787`, catch-all 404.
- Windows sleep disabled on AC; Windows Update active hours set to reduce surprise reboots.

### 9.2 Oracle VM (later)

- `deploy/docker/` with a Dockerfile for the engine (Bun, clones pinned upstream, packs cache at
  build time) and one for the front server; `docker-compose.yml` with the engine unpublished,
  the front server on an internal network, and cloudflared as a third service, or a Caddy
  service if a proxied A record is preferred.
- Same env files; secrets mounted, not baked.

### 9.3 Firebase

- Project `idlescape-osrs` (the bare id was taken). Auth providers: Anonymous and Email/Password.
  Firestore in native mode, rules and indexes deployed from `firebase/`. Service account key
  for the front server stored under `server/secrets/` (git-ignored).

## 10. Error handling

| Failure | Behaviour |
|---|---|
| Engine down | `/api/health` reports down; shell shows the offline card with retry countdown; proxy returns 503. |
| Bridge failure (bad token, Firestore unreachable) | Account panel shows the error and a retry; client never started without credentials. |
| Game login rejected | Engine code mapped to a message in the Account panel via `LoginResult`. |
| Wrong gate password | Plain message, 3 s per-IP cooldown. |
| Tunnel drop | Cloudflare's own error page; cloudflared service restarts. |
| Engine closes WebSocket | Proxy closes the browser side with the same code; client shows its normal disconnect; shell resets session state. |
| Client bundle and wasm mismatch | Impossible by construction: served from one build directory. |

## 11. Testing

- **Unit (Vitest)**: gate cookie sign/verify/expiry; game name normalisation, rules, suffixing;
  bridge create-or-return against the Firestore emulator; proxy route matching; hook event
  diffing with fixture arrays.
- **Integration**: front server against a real engine on localhost: gate flow, cache proxy
  content types, WebSocket login handshake round trip, hook `login` event observed. Reuses the
  Playwright verifier from `docs/verify_client.py`, ported to TypeScript under `web/e2e/`.
- **Browser (Playwright)**: gate -> guest -> Tutorial Island with screenshot, against emulators.
  Runs in `scripts/verify` before any deploy, mirroring tron's pre-deploy checklist.

## 12. External prerequisites (actions for the project owner)

Things I cannot do from this machine without you:

1. **Cloudflare Tunnel authorisation**. Either run `cloudflared tunnel login` once after I
   install cloudflared (browser prompt, picks the scotho.com zone), or create an API token with
   `Zone:DNS:Edit` and `Account:Cloudflare Tunnel:Edit` on scotho.com and give it to me. The
   tunnel then creates the `osrs` CNAME itself; no manual DNS record needed.
2. **Firebase Auth providers**. After I create the project, enable Anonymous and
   Email/Password under Authentication -> Sign-in method in the console. Two toggles; the CLI
   cannot flip them.
3. **GitHub repo**. Deferred by owner decision on 2026-09-04; repo stays local.
4. **Oracle VM**, when ready: SSH access and the public IP.

Things I will do myself with the already-authenticated Firebase CLI and gcloud: create the
Firebase project, create the Firestore database, deploy rules and indexes, create the service
account and key, and install cloudflared and the Windows services.

## 13. Open questions carried into sub-project 2

- Pairing token format and the `/pair/<token>` URL shape, so the Connect panel's placeholder
  matches the real thing.
- Whether the MCP gateway lives in the same front server process (preferred, per approach 3
  in section 2) or a sibling process.
