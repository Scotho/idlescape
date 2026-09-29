# Idlescape — Multi-character platform, shared bank, Contracts, wealth hiscores

Date: 2026-09-05
Status: Phase A complete; decisions below are recommendations recorded for owner review (the
session that produced them ran unattended, so nothing here has been approved yet)
Inputs: `%USERPROFILE%\Downloads\idlescape_osrs_project_handoff.md` (the product brief),
the four Phase A audits and the critic report under `docs/superpowers/specs/phase-a/`
Amends: `2026-09-05-sp4-agent-runtime-design.md` (non-goal "multiple characters per user" is
struck; see section 9), `2026-09-05-entry-screen-and-quick-connect-design.md` (entry screen
becomes the home page, section 6.1), `2026-09-05-sp3-hiscores-tracker-design.md` (account-level
rankings, section 8)

## 1. What this document settles

The handoff asked for research before any build plan. That research is done and is cited by
`path:line` in the phase-a files. This document turns it into decisions on the thirteen open
questions of handoff section 18, a domain model, a sub-project sequence, and the pre-work that
must land before any economy feature ships. The already-delivered items from this batch are:

- A gameplay e2e suite that logs a guest in through the human path only and plays
  (`web/e2e/gameplay.pw.test.ts`, `web/e2e/helpers.ts`). No Claude pairing is involved.
- A client fix: hook-driven login now fires from the title loop, so the world actually renders
  after login (commit `56323f5`). Before it, the simulation ran but the viewport never painted.
- Hook state gains `position`, `activeTab`, `sceneReady`; `gameName` is stable (commit `e376848`).
- The handoff's "requirement that forced Claude to be connected before login" does not exist in
  the code: `startSession()` never reads pairing state (`web/src/main.ts`). Nothing to remove.

## 2. Facts the decisions rest on (verified in Phase A)

| Fact | Where |
|---|---|
| The client draws in one call (`mainredraw`) separable from simulation (`mainloop`); loop is `setTimeout`, not rAF. | `client/src/client/GameShell.ts:88-203` |
| The client's canvas and much game state are module-level or `static`; two clients cannot share a document. | `client/src/graphics/Canvas.ts:1-2`, `Client.ts:95-122`, `IfType.list` |
| Engine keeps a player 30 s after socket close, force-logs out at 60 s; same name twice is code 5; N different names from one browser is fine. | `engine/server/src/engine/World.ts:131-132,739-760,852-866`, `web.ts:87-135` |
| Single-world login never reads the `account` table and ignores the password: a name that has a `.sav` file logs in. | `engine/server/src/server/login/LoginThread.ts:62-100` |
| The whole character, bank included (inv 95, 240 slots), is one `.sav` file; saved on logout and every 15 min. No bank table exists. | `Player.ts:190-262`, `PlayerLoading.ts:68-161`, `prisma/singleworld/schema.prisma` |
| Bank mutation is RuneScript on the owning online player only; no HTTP or RPC path mutates inventories. | `content/.../bank.rs2`, `engine/script/handlers/InvOps.ts`, `web.ts:319-347` |
| `node.production=false` gives every player staff level 4, so `::give coins 2147483647` works for anyone today. | `LoginThread.ts:63-67`, `engine/server/data/config/world.json` |
| `node.debug=true` makes the engine ignore the client's idle-logout packet. | `IdleTimerHandler.ts:7-11`, `world.json` |
| The login packet's name/password block is RSA-encrypted end to end; the relay cannot read it. | `Client.ts:1795-1810`, `World.ts:2177` |
| Coins are obj 995; High Alchemy is `max(floor(cost*0.6),1)`; item metadata lives in `*.obj` under the content pack. | `pack/obj.pack:996`, `alchemy.rs2:25`, `ObjType.ts:135-180` |
| Hiscore tables are written only by the multiworld login server, which we do not run. | `LoginServer.ts:18-108,457` |
| Only pairing is built on the agent side: pair tokens, agent tokens (uid-scoped, no mode, no character). `/mcp`, `/tab`, rs-sdk, hooks v2 are spec only. | `server/src/pair/*`, `server/src/router.ts` |
| One Firebase uid maps to exactly one game account today. | `server/src/bridge.ts:16-38`, `gameAccounts/{uid}` |

## 3. Decisions on handoff section 18

| # | Question | Decision | Why (short) |
|---|---|---|---|
| 1 | How are multiple clients hosted? | One same-origin iframe per opened character, created lazily on first selection, never destroyed while the tab lives. The parent shell owns everything else. | Canvas and statics are per-document singletons; a worker port would be a large fork divergence. |
| 2 | Can background clients suspend rendering and resume? | Yes. Add a `renderSuspended` flag guarded in `mainredraw()` and `refresh()` on resume; hide the iframe. Simulation, network, entity movement and map building keep running. | Draw is one call; nothing in the sim depends on it except menu building, which the first resumed frame rebuilds. |
| 3 | AI session mapping | Hybrid: one agent token per account with a `characters: 'all' \| id[]` allow-list and an optional `defaultCharacterId`; every game tool takes `characterId?`. A single-entry allow-list is "one agent per character". | One MCP registration per player; shared bank favours one planner; per-character binding still available. |
| 4 | Scope of "one active accepted contract" | Per Firebase account. | The bank is account-level; per-character scope would let one account hold three. |
| 5 | Settlement | Escrow at creation. A sell contract moves the offered items from the owner bank into contract escrow; a buy contract reserves the coins. Fulfilment transfers escrow to the counterparty in one server transaction. | Prevents overselling and double-spend without polling the engine. |
| 6 | Partial fills | `filledQuantity` on the contract; each fill is its own `trades` row and its own settlement; `partialAllowed=false` requires a single fill of the full remainder; unfilled escrow returns on expiry or cancel. | Simple, auditable, feeds market data directly. |
| 7 | Matching | Explicit acceptance only in v1 (browse, then fulfil). Automatic matching is a later contract type. | Keeps v1 to one settlement path. |
| 8 | Canonical market price | v1: median unit price of trades in the last 7 days between distinct accounts, requiring at least 3 distinct counterparties and 5 trades; otherwise High Alchemy. Stored per item per day by the market service. | Median resists single outliers; distinct-counterparty rule blocks self-dealing. Revisit once real volume exists. |
| 9 | Manipulation safeguards | Exclude trades where both sides are the same uid; count counterparties not trades; median not mean; wealth uses the stored daily price, never a live quote; per-item daily price change capped at ±50 % for wealth purposes only. | Cheap rules that make a single tiny or wash trade unable to move a leaderboard. |
| 10 | Account vs character data | Account: bank, coins in bank, contracts, trade history, agent tokens, plugin settings, wealth. Character: inventory, worn, stats, varps, position, session state, active goal. | Follows the engine's `.sav` boundary; the bank is the one thing moved out of it. |
| 11 | Agent autonomy on the exchange | Per-token owner-set policy `contracts: 'deny' \| 'confirm' \| 'auto'`, default `deny`. `confirm` writes a pending action the human approves from the panel with a Firebase bearer. Market queries need no policy. Character deletion is never a tool. | Same shape as the goals spec's `set_pilot` gate; server-enforced by principal, not by hiding a button. |
| 12 | Switcher status | Per character: name, session state (`none \| booting \| title \| loggedIn \| disconnected`), position tile (region name once the wiki corpus maps it), activity (`idle \| moving \| interacting`, from a new `activity` hook field), hp and energy, session uptime. Polled from each frame's `getState()` at 1 s; no network. | Everything is already in the client; the hook exposes it. |
| 13 | Secure handshake | Interim: gate cookie plus non-guessable names (guests are random; registered names are public, so this is weak). Target: the relay injects a signed owner assertion `{uid, character, exp}` into the WebSocket upgrade and an engine overlay patch verifies it against the decrypted login name. | The relay cannot read the RSA-encrypted login block, so only the engine can bind name to owner. |

Two further rulings the audits forced:

- **Engine overlay.** `engine/server` is a pinned clone we never edit by hand. The shared bank,
  the owner assertion, and production hardening all need engine changes, so we adopt the same
  mechanism as `content-custom/`: an `engine-custom/` tree copied over the clone by
  `scripts/engine-overlay.ps1` after checkout, with `engine-custom/PATCHES.md` in the style of
  `client/PATCHES.md`. Files there are whole-file replacements of upstream files at the pinned
  sha, each with an anchor list for re-application on a revision bump.
- **Production flag.** Before any economy feature ships, the running engine must have
  `node.production=true` (or the overlay must source staff level from the login shim). With the
  current config every player can spawn coins.

## 4. Identity and character model

Firestore, admin SDK only unless stated. `gameAccounts/{uid}` is retired after migration.

```
users/{uid}                { displayName, provider, createdAt, characterIds: string[] }   // client-readable, server writes characterIds
characters/{characterId}   { uid, gameName, secret, createdAt, lastLoginAt, deletedAt: null }  // server-only
gameNames/{gameName}       { uid, characterId }                                            // uniqueness index, server-only
```

- `characterId` is a random 20-character id; `gameName` follows the existing rules
  (`server/src/gameName.ts`) and stays unique across live and deleted characters.
- Limits: anonymous uid 2 characters, password uid 3 (owner ruling 2026-09-05; SP6 shipped with 1 for guests and its fix wave raises it). Enforced in the create transaction, which
  also reserves the name. A later `tier` field on `users/{uid}` raises the limit.
- Guest to registered upgrade keeps the uid (`linkWithCredential`), so characters carry over.
- Deletion sets `deletedAt`, removes the `gameNames` entry only after the `.sav` is removed by the
  engine overlay's management route, and appends an audit row. The name is never released.
- Migration: one document per existing `gameAccounts/{uid}` becomes `characters/{new id}` with the
  same name and secret; `users/{uid}.gameName` is replaced by `characterIds`.

Routes (all Firebase bearer, human principal only):

| Route | Behaviour |
|---|---|
| `GET /api/characters` | List the caller's characters with `gameName`, `createdAt`, `lastLoginAt`. |
| `GET /api/characters/check?name=` | Normalise and report availability. |
| `POST /api/characters` | Create within limits; 409 on collision or limit. |
| `POST /api/characters/:id/session` | Return `{ gameName, secret }` for an owned character (replaces `/api/bridge`). |
| `DELETE /api/characters/:id` | Human-only, `auth_time` within 5 minutes, typed confirmation phrase, ownership check, kick-then-remove. |

## 5. Sessions and the switcher

- `web/play.html`: a minimal document with `#canvas` that loads the client bundle and exposes
  `window.idlescape.client` and `.plugins` as today. Query `?character=<id>` is informational;
  the parent drives login through `contentWindow`.
- `web/src/sessions/manager.ts`: `open(characterId)`, `activate(id)`, `active()`, `list()`,
  `on('change')`. It keeps `Map<characterId, { iframe, hooks, startedAt, state }>`, hides
  inactive frames, calls `setRenderSuspended(true)` on them, and on activation un-hides, resumes
  and focuses the canvas. `PluginContext.client()` returns the active session's hooks; a new
  `ctx.sessions` gives the Characters plugin the list.
- Client patch set (all anchored per `client/PATCHES.md`): `renderSuspended` guard in
  `mainredraw()`; `setRenderSuspended`, `setAttended`, `armLogin`, `setAudioMuted` hook members;
  `activity` in `hookState()`; idle-timer guard for attended frames (only matters once
  `node.debug=false`).
- Game login page: `armLogin(gameName, secret, label)` stores credentials and draws one centred
  title button "Log in as <label>" using the existing `imageTitlebutton` primitives; the hit test
  in `titleScreenLoop` calls `login()`. `hooks.login()` stays for tests and agents. A mute toggle
  drawn bottom-right of the title box calls `setAudioMuted`; the shell persists it in
  `localStorage` (`cs.mute`).
  Superseded by the SP7 addendum (`docs/superpowers/specs/2026-09-05-sp7-character-tabs-and-sessions-design.md`): the armed label is drawn above a plain centred "Login" button (client patches 24 and 25), and no mute toggle or `setAudioMuted` hook shipped.
- Shell-side per-character state: `wireHooks`, XP and loot trackers, `onClientToggle` fan-out are
  keyed by `characterId`. Plugin settings stay per uid (decision 10).
- Measurements gating the rollout (handoff Phase E): background-tab throttling survival against
  the engine's 60 s timeout, and memory for three live clients. Both are tasks in SP7, not
  assumptions.

## 6. Home page and entry flow

`AppState = 'gate' | 'home' | 'characters' | 'playing' | 'offline'`; `homeView = 'choices' |
'login' | 'signup' | 'connect'`.

1. `home`: three buttons, Play as Guest, Log In, Create Account (explicit guest click replaces the
   auto-anonymous sign-in), plus a live player count and patch notes. The player count comes from
   `/api/health.players`, which the front server scrapes from the engine's management
   `/prometheus` gauge `lostcity_active_players` (port 8897, never exposed). Patch notes are a
   markdown file served like the connect guide.
2. `characters`: after any signed-in auth event, `GET /api/characters`. Zero results show the
   one-field creation form with live availability; otherwise the first character is selected.
   The client bundle is not loaded before this state.
3. `playing`: the frame with the selected character's iframe armed at "Log in as <name>".
   Superseded by the SP7 addendum: the title screen shows the character's name above a plain "Login" button.
   "Connect to Claude" moves into the frame's Claude Connection panel and stays reachable from
   the home page as a secondary link.

## 7. Shared bank (engine overlay)

- `World.ownerBanks: Map<ownerKey, Inventory>`; `Player.getInventory(95)` routes to it for any
  player whose login carried an `ownerKey`. `Player.save` and `PlayerLoading.load` skip type 95
  for such players; a one-time migration moves the `.sav` bank of each existing character into
  its owner's store (first character wins slot order; overflow is appended).
- Persistence: `engine/server/data/banks/<ownerKey>.json` with a monotonically increasing
  `version`, written on every mutation tick that touched it and on autosave.
- Management routes on 8897 (loopback only): `GET /owner/:key/bank` and
  `POST /owner/:key/bank/apply` with `{ expectedVersion, ops: [{ obj, delta }] }`, applied on the
  world tick, 409 on version mismatch. This is the seam Contracts and wealth use. When no
  character of the owner is online the engine still applies it to the file.
- Two characters banking at once: the container is single-threaded on the tick, so no
  corruption; the other character's open bank interface goes stale until reopened. Acceptable for
  v1; a cross-player `inv_transmit` refresh is an optional follow-up.
  Superseded by SP8 as built: the accepted staleness does not apply. The owner container lives
  outside `player.invs`, so the overlay owns its dirty-tracking reset and does it after client
  output; every online character of the owner receives the same inventory diff in the same tick
  (`engine-custom/PATCHES.md`, patch 2 ruling 4). No refresh follow-up is needed.
- Capacity stays 240 per owner in v1.

**As built (SP8).** Three places the implementation differs from the design above, all verified
on the live stack:

- The assertion travels in an `HttpOnly` `cs_owner` cookie that the relay promotes to an
  `X-Idlescape-Owner` header on the engine handshake, because the 274 client builds its own
  WebSocket URL with no query string and no header control. The engine verifies it in
  `PlayerLoading.load` against the name it decrypts from the RSA login block, which is the only
  place both the name and the socket are in scope.
- Applies are serialised by the engine's single thread between ticks rather than queued onto a
  tick. `World.cycle` is synchronous and the management handler awaits nothing between reading the
  version and mutating, so the handler necessarily runs between ticks; that is the same atomicity
  with no queue to drain.
- `World.ownerBanks: Map<ownerKey, Inventory>` became `OwnerBankStore`
  (`engine-custom/src/idlescape/ownerBank.ts`), which owns the container, the tab layout, the
  version, the `migrated` list and the atomic persistence, and the apply body is
  `{ expectedVersion, ops }` over the five layout ops plus `delta`, not `[{ obj, delta }]`.

## 8. Contracts, market data, wealth

Front-server SQLite (`server/data/economy.db`), same convention as SP3's tracker db.

```
contracts(id, uid, type 'buy'|'sell', obj, quantity, pricePer, filled, partialAllowed,
          status 'open'|'filled'|'expired'|'cancelled', expiresAt, createdAt, updatedAt)
escrow(contractId, obj, count)              -- items or coins (obj 995) held by the contract
fills(id, contractId, fulfillerUid, quantity, pricePer, at)   -- trade history; one per settlement
prices(obj, day, median, trades, counterparties, source 'market'|'alch')
account_wealth(uid, coins, wealthEst, pricedAt)
```

- Lifecycle for every contract type: `open -> filled | expired | cancelled`. The item trade
  payload (`obj, quantity, pricePer, partialAllowed`) is the v1 type; the `type` column and the
  escrow table are the extension points for bounties and task contracts later.
- Creation: verify ownership, check the account's one-active-fulfilment rule when accepting,
  then in one SQLite transaction plus one engine `apply` with `expectedVersion`: move the sell
  items or buy coins from the owner bank into `escrow`. If the engine returns 409 the contract is
  not created.
- Fulfilment: the fulfiller's bank is debited (items for a buy, coins for a sell), the owner's
  escrow is released to the fulfiller, the owner's proceeds are credited, one `fills` row is
  written. All within a single SQLite transaction; the two engine `apply` calls carry versions
  and the transaction rolls back if either returns 409.
- Market queries mirror the wiki API's shape: `GET /api/market/q/price|volume|book|contracts|mine|worth`
  and `GET /api/market/schema`, markdown by default, `?format=json`; accepted principals are a
  human bearer or an agent bearer. MCP tools `market_query(kind, ...)` (any mode),
  `market_create`, `market_fulfil` (control plus the `contracts` policy).
- Observability before caching: request counts and latency per query kind, db size, fills per
  day, logged from the first release; no materialised aggregates in v1.
- Wealth: nightly and on-demand job computes `coins` (obj 995 in the owner bank) and `wealthEst`
  (sum of count times the day's price, High Alchemy fallback) per uid from the bank store; rankings
  are account-level rows in the tracker db, ranked on `coins` and `wealthEst`. Inventory and worn
  items are excluded in v1 ("bank wealth").

## 9. Agent and authorization changes

- `server/src/auth/principal.ts`: `authenticate(req) -> { kind: 'human', uid, isAnonymous,
  authTime } | { kind: 'agent', uid, tokenId, mode, characters, contracts } | null`. New agent
  tokens are prefixed `csa_` so classification is explicit.
- Every `Route` declares `principal: 'human' | 'agent' | 'either' | 'none'`; the dispatcher
  enforces it before the handler runs. Character CRUD, session minting, pairing mint and revoke,
  contract confirmation are `human`. `/mcp` is `agent`. Market and wiki queries are `either`.
- `agentTokens/{id}` gains `mode` (SP4), `characters`, `defaultCharacterId`, `contracts`;
  `secretHash` moves out of the owner-readable document.
- SP4 amendments: `/tab` registry becomes `uid -> Map<characterId, TabLink>`; every game tool
  gains `characterId?` with resolution order explicit, then `defaultCharacterId`, then the only
  connected character, else `ambiguous_character`; `list_characters` is added; rate limits are
  per `(uid, characterId)`; the non-goal "multiple characters per user" is struck. The exchange
  response's single `gameName` becomes a character list.

## 10. Sub-project sequence

| SP | Delivers | Depends on |
|---|---|---|
| SP6 Accounts and characters | Firestore model and migration, character routes, principal module, home page with three choices, player count, patch notes, no-character gate, single-client character switch (logout then login), human-only deletion flow. | Nothing new; ships on the current single-client shell. |
| SP7 Multi-session | `play.html`, session manager, render-suspend and idle patches, `armLogin` title button, mute toggle, Characters dashboard with live status, `activity` hook field, throttling and memory measurements. Superseded in part by the SP7 addendum: the title button is a plain "Login" under the armed name, and the mute toggle was cut. | SP6 |
| SP8 Engine overlay and shared bank | `engine-custom/` mechanism, `node.production` hardening, owner assertion on login, owner bank store, management routes, `.sav` migration. | SP6 |
| SP8b Web bank | OSRS-style bank window in the shell over the shared bank: reorder (swap/insert, tabs), search, right-click Sell/Buy hooks for Contracts, item icons via a client hook; in-game tab bar via content overlay plus one client patch. Spec `2026-09-05-sp8b-web-bank-design.md`. | SP8, SP7 |
| SP9 Contracts | Economy db, contract service, market queries, web UI, agent tools and policy. | SP8, SP4 (for tools) |
| SP10 Wealth hiscores | Pricing job, wealth job, account rankings on the SP3 tracker. | SP8, SP9, SP3 |

SP2b, SP3, SP4, SP5 and SPW keep their places; SP4's plan must be re-cut against section 9
before it starts. The gameplay e2e suite is the acceptance baseline for SP6 and SP7: every
sub-project keeps it green and extends it.

## 11. Testing

- Unit: character limit and name transaction against the Firestore emulator; principal
  classification; contract state machine and escrow arithmetic; price median and counterparty
  rules with fixture trades; wealth with market and alch fallback.
- Integration: engine overlay `apply` with version conflicts; two characters of one owner
  banking in one tick; fulfilment rollback when the second `apply` returns 409.
- Browser (extends `web/e2e/gameplay.pw.test.ts`): guest creates a first character and lands in
  game; a password user creates three characters and is refused a fourth; switching characters
  keeps the first session alive and resumes rendering (pixel assertions as in the render
  regression step); deletion requires the typed phrase and re-auth; an agent token cannot call
  the delete route; a sell contract's items leave the bank and return on cancel.

## 12. Out of scope for these sub-projects

Paid tiers, automatic matching, non-item contract types, price candles and analytics caching,
headless unattended characters (SP5 LiteClient), OAuth for claude.ai connectors.
