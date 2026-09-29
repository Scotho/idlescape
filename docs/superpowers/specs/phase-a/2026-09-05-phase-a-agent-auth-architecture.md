# Phase A audit — Agent attachment, authorization model, tool path, wiki precedent

Date: 2026-09-05
Branch audited: `feat/platform-shell` @ 10838e2 (plus the unmerged `feat/wiki-corpus` worktree @ be9594d)
Handoff sections covered: 4, 11, 12, 17, 18.3, 18.11, 19 "Agent architecture"
Read-only audit. "Verified" = read in code on this branch; "Spec" = only in `docs/superpowers/specs`; "Inferred" = my reasoning.

## Summary

1. Only the pairing layer is built: pair tokens, agent tokens (per uid, hashed secret, revocable), the skill document, the `/connect` guide, the Claude Connection panel. `server/src/pair/*`, `firebase/firestore.rules`.
2. No `/mcp`, no `/tab`, no MCP SDK dependency, no vendored rs-sdk, no hooks v2 (`getWorldState`/`dispatch`). `/mcp` is unrouted and answers `401 {error:'gate'}` — observed live this session when the configured `idlescape` MCP server failed to connect.
3. The wiki exists only on the `feat/wiki-corpus` worktree branch: reader `/wiki` built; `/api/wiki` is a 501 stub; its bearer verifier is a hook that rejects everything until wired to `agentTokens`.
4. The authorization model has two principals — Firebase ID token (human) and `agentTokens` (agent) — but nothing on this branch consumes an agent bearer yet. An agent token is bound to a uid only; there is no character dimension anywhere (`gameAccounts/{uid}` is one document = one game name).
5. SP4 hard-codes "one uid = one character = one tab": registry `uid -> socket`, `no_tab`, per-uid rate limits, single `gameName` in the exchange response. SP4 lists multiple characters per user as a non-goal.
6. Recommendation: a hybrid — account-scoped agent tokens with a character allow-list and a per-call `characterId`, a `(uid, characterId)`-keyed tab registry, one MCP session per token that may address several characters. Bind a token to one character by setting the allow-list to a single id.
7. Human-only operations should be enforced by a typed `Principal` resolved once per request and a per-route `principal: 'human' | 'agent' | 'either'` declaration in the router; character deletion never appears in `tools.ts` and its REST route accepts only a fresh Firebase ID token.
8. The wiki API's shape (question-shaped `q/*` routes, markdown-first, `ambiguous` with candidates, one `wiki_query(kind)` MCP tool, cookie-or-bearer auth) is a good template for the Contracts market query API, with one change: auth must return a principal, not a boolean.

## Findings

### F1. What exists today vs what is specified

**Built (verified on `feat/platform-shell`):**

- Pair token mint: `POST /api/pair`, Firebase bearer required — `server/src/pair/routes.ts:89-95`; store transaction expires prior unused tokens for the uid — `server/src/pair/store.ts:77-90`.
- Skill fetch: `GET /pair/:token` content-negotiates markdown skill vs human HTML — `routes.ts:97-104`; templates `server/src/pair/skill.md`, `human.html`, `guide.md`.
- Exchange: `POST /api/pair/:token/exchange` creates `agentTokens/{id}` in one transaction, returns the 40-char secret once — `store.ts:99-125`; response includes `gatewayUrl: ${origin}/mcp` and a single `gameName` — `routes.ts:115`.
- Revoke: `POST /api/agent-tokens/:id/revoke`, owner check by comparing `doc.uid` with the caller's uid, non-owner gets 404 — `store.ts:127-132`, `routes.ts:118-129`.
- Router classifications: `health, gate, bridge, ws, cache, client, static, index, pair(mint|fetch|exchange|revoke|guide), notfound` — `server/src/router.ts:3-13, 24-47`. Nothing else.
- Gate exemption: mint/fetch/exchange/revoke bypass the gate cookie; `/connect` stays gated — `server/src/index.ts:38-43`.
- Health: `gateway: 'not_deployed'` is a hard-coded literal — `server/src/health.ts:45`; type `HealthSnapshot.gateway` — `server/src/types.ts:37`.
- Web: Claude Connection panel subscribes to `agentTokens where uid == current`, lists rows, revokes — `web/src/panels/connect.ts:41-50, 123-134`; connect card mints and watches `pairTokens/{token}` — `web/src/panels/connectCard.ts:29-39, 112-144`; Claude panel is a placeholder button — `web/src/panels/claude.ts:14-17`; API calls — `web/src/api.ts:32-51`.
- Firestore rules for `pairTokens`/`agentTokens`: owner-read, no client writes — `firebase/firestore.rules:34-41`.

**Not built (verified absent):**

- `/mcp`, `/tab`, Streamable HTTP, `@modelcontextprotocol`: grep of `server/src` finds only the `gatewayUrl` string at `routes.ts:115`. `server/package.json` dependencies are `firebase-admin` and `ws` only. `router.test.ts` has no mcp/tab cases.
- Because `/mcp` classifies as `notfound`, the request falls through to the gate check and gets `401 {error:'gate'}` — `index.ts:46`, `gate.ts:77-79`. This session's environment reported exactly that: the configured `idlescape` MCP server failed with `AUTH_HEADER_REJECTED ... HTTP 401 ... { error : gate }`. The ledger already records the mismatch with `skill.md:44-46` ("returns 503") — `docs/superpowers/ledgers/2026-09-04-idlescape-platform.md`, deferred follow-ups.
- `client/vendor`, `web/vendor`, `server/vendor`: do not exist. No `rs-sdk` string in `client/src`, `web/src`, `server/src`.
- Hooks are v1 only: `ClientHooks = { login, logout, echoChat, getState, getObjName, on }` — `client/src/hooks/types.ts:33-40`; `ClientState` has skills/inventory/hp/prayer/energy/boosts, no bank, no scene — `types.ts:4-15`. No `getWorldState`/`dispatch`.
- Wiki: zero hits for "wiki" in `server/src`, `web/src`, `scripts` on this branch.

**Partially built on the `feat/wiki-corpus` worktree (`.claude/worktrees/wiki-corpus`, not merged):**

- Router adds `{ kind: 'wiki' }` for `/wiki*` and `{ kind: 'wikiApi' }` for `/api/wiki*` — worktree `server/src/router.ts:11-12, 39-40`.
- Reader site implemented (`/wiki`, `/wiki/search`, `/wiki/<type>/<slug>`, `/wiki/random`) over a read-only `bun:sqlite` FTS5 db — worktree `server/src/wiki/reader.ts:11-45`, `db.ts:41-56`; corpus file `wiki/build/wiki.db` present.
- Auth: `createWikiAuth({ gate, verifyBearer? }).allowed(req, kind)` — gate cookie passes anything; `wikiApi` additionally accepts `Authorization: Bearer` through an injected verifier whose default is `async () => false` — worktree `server/src/wiki/auth.ts:3-14`; wired without a verifier at worktree `server/src/index.ts:26`.
- Agent API: `handleWikiApi` returns `501 not_implemented` — worktree `server/src/wiki/api.ts:3-6` ("Task 15 replaces this stub").
- Health gains `wiki: 'up' | 'missing'` — worktree `server/src/types.ts:24`, `health.ts:45`.

Status table: pairing = built; `/mcp` + `/tab` + modes = spec only (SP4); rs-sdk vendoring + hooks v2 = spec only; wiki reader = built on a side branch; `/api/wiki` query API = stub; wiki bearer auth = hook present, verifier not wired; wiki MCP tools = spec only.

### F2. Authorization model as built

- Human principal: Firebase ID token in `Authorization: Bearer`, verified with `auth.verifyIdToken` — `server/src/bridge.ts:47-57` (also derives `isAnonymous` from `decoded.firebase.sign_in_provider === 'anonymous'`, line 54) and `pair/routes.ts:78-87` (`verifyBearer` returns only the uid).
- Agent principal: `agentTokens/{id} = { uid, label, createdAt, lastSeenAt, revokedAt, secretHash }` — `store.ts:43-50`; secret hashed with sha256 — `pair/token.ts:11-13`. No `mode` field yet (SP4 adds it — spec `sp4:44-46`). No verifier for an agent bearer exists on this branch; `lastSeenAt` is only ever set to `null` (`store.ts:116`).
- Identity to character: `gameAccounts/{uid} = { gameName, secret, createdAt }`, one document per uid — `server/src/types.ts:45-49`, `bridge.ts:16-21`; the bridge also writes `users/{uid}.gameName` — `bridge.ts:37`. The exchange reads `gameAccounts/${pair.uid}` to return one `gameName` — `store.ts:108-109`.
- Ownership checks: revoke compares `doc.uid === uid` — `store.ts:130`. Rules: `users/{uid}` owner-write with `gameName`/`createdAt` immutable from the client — `firestore.rules:5-18`; `gameAccounts`, `gameNames` closed — `rules:29-30`; `pairTokens`, `agentTokens` owner-read only — `rules:34-41`. Note the owner can read `secretHash` (ledger deferred item, `progress.md:193`).
- Gate: HMAC cookie `cs_gate` — `server/src/gate.ts:4-29`; the gate is a site password, not an identity.
- Guests: anonymous Firebase users have real uids; nothing in the pair routes checks `isAnonymous`, so guests can mint and exchange agent tokens today (verified by reading `routes.ts:89-95, 106-116`).
- Conclusion (verified): the agent token is per uid with no character, no scope, no mode; the only thing an agent bearer could prove today is "some uid authorised me".

### F3. What the specs add (spec only)

SP4 (`docs/superpowers/specs/2026-09-05-sp4-agent-runtime-design.md`):

- Tools — `get_state`, `say`, `echo`, `list_tasks`, `save_task`, `get_api_docs` (any mode); `execute_code`, `run_task`, `stop`, `screenshot` (control) — `sp4:168-169`. Resources `idlescape://api`, `idlescape://learnings`; errors `no_tab`, `mode_denied`, `busy`, `timeout`, `action_failed` — `sp4:170-172`.
- Modes — `mode: 'observe' | 'control'` on `agentTokens`, default observe, owner-only via `POST /api/agent-tokens/:id/mode`, "Claude cannot raise its own mode" — `sp4:44-46`; per-message allow-lists and per-request read — `sp4:155-158`.
- `/tab` — "registers `uid -> socket`. One tab per uid; a new tab replaces the old with a `replaced` close reason" — `sp4:148-150`; `no_tab` when none connected — `sp4:159-160`.
- Runner rule — "Task code executes only in the browser tab's Worker ... The front server relays and validates; it never evaluates task code" — `sp4:94-97`; Worker + `busy` — `sp4:135-139`; security restatement — `sp4:200-201`.
- MCP session model — "one session per agent token, bearer verified against `agentTokens` (hash compare, `revokedAt` null)" — `sp4:166-167`. Rate limits per uid and per token — `sp4:195-196`. Non-goals: multiple characters per user, headless play — `sp4:33-34`.

Goals/autopilot (`2026-09-05-goals-and-autopilot-design.md`): three-mode selector with the token `mode` as ceiling — `goals:116-132`; mode is per tab — `goals:144`; extra tools `list_goals`, `add_goal`, `remove_goal`, `set_active_goal`, `get_active_goal`, `get_log`, `set_pilot` with `pilot_not_armed` — `goals:225-229`; storage `users/{uid}/goals`, `users/{uid}/log`, exactly one active goal per uid — `goals:30, 33, 66-68`; autopilot requires a connected tab "with the human present" — `goals:35`; `wiki_query(question)` tool proxying `/api/wiki` — `goals:265-268`.

SPW (`2026-09-05-spw-wiki-corpus-design.md`): `/api/wiki/*` accepts gate cookie or agent bearer, observe suffices — `spw:322-324`; markdown default, `?format=json` — `spw:326-328`; question-shaped routes `q/obtain`, `q/drops`, `q/requirements`, `q/unlocks`, `q/methods`, `q/nearest`, `q/where`, `q/shops`, `q/quest-order`, `q/plan-context`, plus `search`, `page`, `entity`, `schema` — `spw:334-349`; errors `not_found | ambiguous | bad_query` with candidates, 120 req/min per token — `spw:351-353`; MCP `wiki_search`, `wiki_page`, `wiki_query(kind)` — `spw:360-364`; "exposes only game data, never player data" — `spw:395`.

**Every place "one uid = one character = one tab" is assumed** (each needs a character dimension):

| # | Assumption | Where |
|---|---|---|
| 1 | One `gameAccounts/{uid}` document; `users/{uid}.gameName` single field | `bridge.ts:16-21, 37`; `types.ts:45-49`; `firestore.rules:4, 11, 13` (verified) |
| 2 | Exchange returns one `gameName`; skill tells Claude "the game name" | `store.ts:57, 108-109`; `routes.ts:115`; `skill.md:57-59` (verified) |
| 3 | One client instance per page: single `loading` promise, `window.idlescape.client` singleton, single `hooks`/`gameName` in the shell | `web/src/clientHost.ts:7-10`; `client/src/hooks/install.ts:26`; `web/src/main.ts:43-44, 161-167` (verified) |
| 4 | `/tab` registry keyed by uid, one tab per uid, `no_tab` | `sp4:88, 148-150, 159-160` (spec) |
| 5 | Action rate limits per uid | `sp4:195` (spec) |
| 6 | Health `tabs: number` counts uids | `sp4:194` (spec) |
| 7 | Mode selector "per tab" | `goals:144` (spec) |
| 8 | Exactly one active goal per uid; log entries have no character | `goals:66-68, 33, 214` (spec) |
| 9 | Tracker looks up `gameAccounts/{uid}` and 403s if "the uid has no character"; `update/:gameName` reaches "that player's live session" via `/tab` | `sp3:67-68, 82-83` (spec) |
| 10 | Task `lastRun` is per task, not per character | `sp4:129-130` (spec) |
| 11 | Canvas overlay "Claude: paired" and Connection panel are per account (fine to keep) | `entry-screen:178-179` (spec) |

Rows 1-3 are the hard ones: they are code. Rows 4-10 are cheaper to fix now than after SP4 ships.

### F4. Model A vs Model B vs hybrid against this architecture

Where routing lives (spec `sp4:86-88`): the only point where a tool call meets a game session is the `/tab` registry lookup in `server/src/tab/registry.ts`. Whatever model is chosen, that lookup must gain a second key. Inferred: with several live clients in one browser page (handoff 2.3), each client either opens its own `/tab` socket carrying `characterId` in its hello, or one socket multiplexes with `characterId` on every message. Either way the registry becomes `uid -> Map<characterId, TabLink>`.

MCP session model (spec `sp4:166`): Streamable HTTP, one session per agent token, registered once in Claude Code as a server named `idlescape` (`skill.md:41`). Consequences:

- Model A (one agent per account): one token, one MCP session, tools take `characterId`. Fits the existing registration flow with no change to pairing UX. Cross-character planning and shared-bank coordination happen in one context, which is what the bank model (handoff 5) wants. Cost: every game tool needs a character parameter and notifications need a character label; `get_state` for N characters is N calls.
- Model B (one session per character): N tokens, N Claude Code registrations with distinct server names (`idlescape-<char>`), N pairings. Clean state mapping, but the pairing UX multiplies, the Connection panel needs a character column, and two sessions planning against the same bank can race at plan level (the engine serialises the actual bank writes, but "withdraw 100 iron for smithing" twice is a plan conflict no server lock fixes). Coordination tools would have to be invented.
- Hybrid: one mechanism that yields both. The token carries an allow-list; tools take an optional `characterId`. A token whose allow-list has one entry behaves like Model B; a token allowed `all` behaves like Model A. The player chooses at pairing time from the connect card.

Shared bank (inferred from handoff 5 and current `ClientState`): the bank is account-level and will reach Claude through `get_state` identically for every character, so the bank is not a reason to split sessions. The shared bank favours a single planner. Contracts reservations live in the server-side contracts service, not in the agent, so agent topology does not affect their atomicity.

Verdict: hybrid, defaulting to account scope. Concrete shape in the Recommendation.

### F5. Agent-safe vs human-only operations

Principals available today (verified): a Firebase ID token proves a human browser session (`bridge.ts:52-54`); an `agentTokens` secret proves an agent authorised by a uid (`store.ts:43-50`). They are structurally distinguishable (a Firebase ID token is a three-part JWT; an agent token is 40 chars of `[A-Za-z0-9_-]`, `store.ts:6`, `token.ts:3`) but nothing classifies them yet.

Proposed enforcement (inferred design, builds on existing code):

1. `server/src/auth/principal.ts`: `authenticate(req) -> Principal | null` where `Principal = { kind: 'human'; uid; isAnonymous; authTime } | { kind: 'agent'; uid; tokenId; mode; characters }`. Human = `verifyIdToken` (move `bridge.ts:47-57` and `routes.ts:78-87` here). Agent = prefix-tagged bearer (`csa_` + 40 chars; new mints only) looked up by `secretHash`, `revokedAt === null`; update `lastSeenAt` here (fixes the never-written field at `store.ts:116`). Explicit prefix rather than "try JWT first" so classification is not a heuristic.
2. `Route` gains `principal: 'human' | 'agent' | 'either' | 'none'` next to `kind` in `router.ts:3-13`; `index.ts` checks it before dispatch, in the same spot the gate check sits (`index.ts:46`). A route declared `human` never sees an agent principal, regardless of handler code.
3. Character deletion: no `delete_character` entry in `server/src/mcp/tools.ts`; `DELETE /api/characters/:id` declared `principal: 'human'`, requires `authTime` within 5 minutes (Firebase `auth_time` claim; force re-auth in the UI), a typed confirmation phrase in the body, and ownership (`characters/{id}.uid === principal.uid`); Firestore rules `allow delete: if false` on the character collection so the route is the only path; write an audit row. Guests included.
4. Exchange actions by agents: per-token policy field `contracts: 'deny' | 'confirm' | 'auto'` (owner-set like `mode`, `sp4:44-46`); `confirm` makes mutation tools return `confirmation_required { pendingId }` after writing `pendingActions/{id}` that the human approves from the panel with a Firebase bearer; `auto` bounded by a per-token gp cap. Read-only market queries need no confirmation. This is the `set_pilot -> pilot_not_armed` pattern (`goals:225-229`) applied to money.

Routes that must accept only Firebase bearers: `/api/bridge` (`bridge.ts:46`), `/api/pair` mint (`routes.ts:89`), `/api/agent-tokens/:id/revoke` (`routes.ts:118`) and the planned `/mode`, all `/api/characters*` create/rename/delete, account link/delete, `/tab` hello (`sp4:148-149`), contract confirmation, and any future `/api/agent-tokens/:id/characters`. Routes for agents: `/mcp` only, plus the read-only `/api/wiki/*` and the proposed `/api/market/*`. `/api/tracker/snapshot` stays a human route (`sp3:67`) or moves behind `/tab`.

### F6. Wiki query precedent for the Contracts market API

Shape to mirror (spec `spw:320-364`; worktree code `wiki/auth.ts`, `wiki/routes.ts`, `wiki/reader.ts`):

- Own module under `server/src/<domain>/` with `routes.ts` doing auth first, then a db-missing 503, then dispatch — worktree `wiki/routes.ts:8-13`.
- Auth accepts gate cookie or agent bearer via an injected verifier — `wiki/auth.ts:4-14`. For market data change the contract to `principal(req) -> Principal | null` because "my open contracts" needs a uid, unlike the wiki (`spw:395`).
- Question-shaped `q/<question>` routes, one per question class, limits not pagination, markdown default with `?format=json`, `ambiguous` errors carrying candidates — `spw:334-353`.
- A `schema` route that doubles as an MCP resource, and one MCP tool `<domain>_query(kind, ...)` so the tool list stays short — `spw:349, 360-362`.
- Per-token rate limit (`spw:353`) and read-only db handle (`db.ts:44-45`).

Concrete mapping: `GET /api/market/q/price?item=`, `q/volume?item=&period=`, `q/book?item=&side=`, `q/contracts?item=&side=&status=`, `q/mine` (principal-scoped), `q/worth?contract=` and `GET /api/market/schema`; MCP `market_query(kind, ...)` (any mode), `market_create`/`market_fulfil` (control + contracts policy).

## Implications for the handoff

- Section 4 is not blocked by built code: nothing consumes agent tokens yet, so adding `characters` to `agentTokens` and `characterId` to the (unbuilt) tools costs nothing now and saves a migration later. Do it before SP4 starts.
- SP4's `/tab` registry, `no_tab`, rate limits, and health counters must be re-specified per `(uid, characterId)` before its plan is written. SP4 section 1 non-goal "multiple characters per user" must be struck.
- The exchange response's single `gameName` (`routes.ts:115`) and `skill.md` step 4 become a character list; the skill should tell Claude to call `list_characters`.
- The shell's single-client assumption (`clientHost.ts:7-10`, `install.ts:26`) is the multi-session question owned by the other Phase A audit; the agent audit only needs each live client to register its own `characterId` on `/tab`.
- Goals and log stores are per uid; decide whether "active goal" is per character (likely yes for autopilot, since a plan runs on one character) before the goals spec is planned.
- The wiki worktree needs merging and its `verifyBearer` wired to the principal module; Task 15 (`/api/wiki` query routes) is the first place the agent-bearer path gets exercised and is the natural pilot for the Contracts market API.
- `skill.md:44-46` (503 wording) and the `--scope user` flag are already-logged SP4 carry-forwards (`progress.md:207`; entry-screen ledger line 16).
- Guests can pair agents today; with guest = 1 character that is acceptable, but decide whether agent `control` mode is allowed for anonymous uids.

## Open questions

1. Should the `characters` allow-list be edited after minting (owner route `POST /api/agent-tokens/:id/characters`) or fixed at exchange time from a selector on the connect card? (Owner UX decision.)
2. When a tool omits `characterId` and several tabs are connected: error with candidates (safer) or default to the visible/most-recently-active character (friendlier)? Proposed: error, plus `defaultCharacterId` on the token.
3. Is the active goal per character or per account? Autopilot executes on one character, but "get 5 quest points across the account" is plausible.
4. Does the engine expose a character delete at all today (rev 274 `LoginServer`/account routes)? Out of this audit's scope; the deletion route needs an authoritative engine path.
5. Confirmation UX for agent-originated contract mutations: in-panel approval queue, or a hard `deny` until the market has run for a while?
6. Should `agentTokens.secretHash` move out of the owner-readable document when the character allow-list is added (ledger `progress.md:193`)? Cheap to do in the same migration.
7. `wiki_query(question)` (goals spec) vs `wiki_query(kind, ...)` (SPW): pick one signature before SP4 tools are written; the SPW form is the one the Contracts API should copy.

## Recommendation

Adopt the hybrid. Concrete shape:

```ts
// Firestore agentTokens/{id}  (server-written; owner-readable minus secretHash)
{ uid, label, createdAt, lastSeenAt, revokedAt, secretHash,
  mode: 'observe' | 'control',                 // SP4 ceiling, owner-set
  characters: 'all' | string[],                // characterIds the token may observe/control
  defaultCharacterId?: string,
  contracts: 'deny' | 'confirm' | 'auto' }     // exchange policy, owner-set

// /tab registry (server/src/tab/registry.ts)
Map<uid, Map<characterId, TabLink>>            // hello = { idToken, characterId }; server checks characters/{id}.uid

// MCP (one session per token, unchanged): every game tool gains characterId?: string
get_state({ characterId? }) / say / execute_code / run_task / stop / screenshot ...
list_characters()  -> [{ characterId, gameName, connected, activity, location, sinceMs }]   // any mode; feeds the switcher too
errors: no_tab { characterId }, character_denied, ambiguous_character { candidates }
notifications (event, user_message, log): carry characterId
rate limits: actions per (uid, characterId); requests per token
```

Resolution order for `characterId`: explicit and allowed and owned -> use it; omitted -> `defaultCharacterId` -> the only connected tab -> `ambiguous_character`. Ownership is re-checked server-side on every call against the characters collection, never trusted from the token alone (handoff 17).

Enforcement: one `Principal` type, a `principal` field on every `Route`, deletion absent from `tools.ts` and human-only with re-auth at the REST layer, contract mutations gated by the per-token `contracts` policy with a pending-approval queue. Build the Contracts market query API as a copy of the wiki module's structure with `principal(req)` in place of `allowed(req)`.
