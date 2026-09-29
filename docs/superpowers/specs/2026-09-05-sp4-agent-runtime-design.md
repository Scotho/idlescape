# Idlescape — SP4: Agent runtime (observe, act, tasks, MCP gateway)

Date: 2026-09-05
Status: approved 2026-09-05; revised the same day to inherit the pairing model from
`2026-09-05-entry-screen-and-quick-connect-design.md` (the "entry-screen spec")
Scope: Claude plays the client alongside the human. The player and Claude make plans in
conversation, save them as repeatable Tasks, run them from the side panel or from a Claude Code
session, and watch them execute with logs mirrored into the Claude panel and game chat. This
replaces the SP1 spec's original sub-projects 2, 3 and 4. Depends on SP1b, the SP2 framework,
and the entry-screen spec's Task 13b (pair tokens, agent tokens, `/pair/<token>`, `/connect`).

## 1. Goals and non-goals

Goals

- Observe: a typed world state (player, skills, inventory, equipment, bank, shop, trade,
  nearby NPCs, players, locs, ground items, dialog, interface, prayers, combat style, chat)
  available to the shell and to a paired Claude Code session.
- Act: high-level actions (walk, interact, talk, bank, shop, chop, mine, fish, eat, attack,
  cast, use item on) and low-level dispatches, executed through the client's own action paths
  so packets match human input.
- Tasks: named TypeScript snippets with parameters, saved per user, runnable from the browser
  panel or from Claude Code with identical results, with run logs.
- Gateway: the front server hosts the MCP endpoint at `/mcp` that the entry-screen spec's
  skill document already registers (`claude mcp add --transport http idlescape
  {{ORIGIN}}/mcp --header "Authorization: Bearer <agentToken>"`). No local install for
  the player beyond Claude Code itself.
- Chat: game chat mirrored into the Claude panel; Claude and tasks can speak in game.

Non-goals

- OAuth for claude.ai connectors (the agent token layer leaves room; not built).
- Headless play with the tab closed (SP5, LiteClient).
- Multiple characters per user. **Struck 2026-09-05** by `2026-09-05-multi-character-platform-design.md` section 9: tools gain `characterId`, the `/tab` registry is keyed by `(uid, characterId)`.

## 2. Relationship to the entry-screen spec

The entry-screen spec owns and ships, inside SP1 as Task 13b: the entry screen, the connect
card, `pairTokens` and `agentTokens` in Firestore, `POST /api/pair`, `GET /pair/:token`,
`POST /api/pair/:token/exchange`, `POST /api/agent-tokens/:id/revoke`, the skill document,
the `/connect` guide, the Claude Connection panel, and the `gateway` field in `/api/health`.
SP4 inherits all of it and adds:

- `mode: 'observe' | 'control'` on `agentTokens`, default `observe`, changed only by the
  owner through `POST /api/agent-tokens/:id/mode` from the Claude Connection panel's session
  row. Claude cannot raise its own mode.
- `POST /mcp` (and the Streamable HTTP session handling it needs) authenticated by the agent
  token, replacing the 503 placeholder. `/api/health.gateway` flips from `not_deployed` to
  `up`.
- A tab socket `/tab` on the front server that the shell opens after login, so the gateway
  can reach the player's live client.
- The `tasks` and `claude` plugins, the task store, the browser task runner, and the chat
  mirror.

Nothing in the entry-screen spec changes. The skill document's step 4 already points at
`/mcp`; its step 6 verification passes once this sub-project deploys.

## 3. What we take from rs-sdk and what we replace

Vendored (MIT, credited, upstream commit pinned in `CREDITS.md`):

| rs-sdk path | Our path | Modification |
|---|---|---|
| `server/webclient/src/bot/types.ts`, `StateCollector.ts`, `ActionExecutor.ts`, `ActionQueue.ts`, `reach.ts`, `formatters.ts` and their tests | `client/vendor/rs-sdk/bot/` | Imports rewritten to our client paths; `GatewayConnection`, `BotOverlay`, `OverlayUI` not taken. 274 field drift fixed and logged in `client/vendor/PATCHES.md`. |
| `sdk/actions.ts`, `actions-helpers.ts`, `action-quantity.ts`, `pathfinding.ts`, `spells.ts`, `trade-helpers.ts`, `chunking.ts`, `types.ts` | `web/vendor/rs-sdk/sdk/` | Transport calls replaced by our `Transport` interface (section 4.2). Their `index.ts` (gateway client), `runner.ts`, `cli.ts` not taken. |
| `sdk/fetch-collision-data.ts` and the engine `/api/exportCollision` idea | `scripts/gen/collision.ts` | Reimplemented against our engine clone's routefinder, producing `web/src/data/collision.bin` at build time. |

Replaced with our own: gateway and auth (theirs is a username-and-password relay on a
separate port; ours is `/mcp` plus `/tab` on the front server with the entry-screen token
model), MCP server process (theirs runs locally reading `bots/<name>/bot.env`; ours is hosted),
overlay UI (SP2 plugins), and gameplay patches (none adopted).

Not adopted: LostCityClientBot (subset), LostCityServerBots (server-side NPCs, later),
rs2b0t (anarchy fork; behaviour-tree base and load-by-URL scripts recorded as ideas).

## 4. Architecture

```
browser tab (shell + client bundle)
  client/vendor/rs-sdk/bot: StateCollector, ActionExecutor      reads Client, dispatches actions
  client/src/hooks: v1 (login, xp, inventory, chat, tick) + v2: getWorldState(), dispatch()
  web/src/agent/: LocalTransport, TaskRunner (Worker), TabLink (wss /tab), plugins tasks + claude
        ^                                                    |
        | wss /tab  (Firebase ID token + gate cookie)        |
front server (Bun)                                           |
  server/src/pair/   (Task 13b: tokens, /pair, /connect)     |
  server/src/mcp/    POST /mcp  Streamable HTTP MCP server, bearer = agentToken
  server/src/tab/    registry uid -> tab socket, relay, mode enforcement
        ^
        | https /mcp
Claude Code (user's machine) with the idlescape skill from /pair/<token>
```

One task runner. Task code executes only in the browser tab's Worker, whether the run was
started from the panel or from Claude through `/mcp`. The front server relays and validates;
it never evaluates task code. This is the "dual runner" collapsed to one runner with two
callers, which is what the hosted `/mcp` gateway in the entry-screen spec implies.

### 4.1 Client fork additions (hooks v2)

`client/src/hooks/world.ts` exposes `getWorldState(): BotWorldState` (vendored
`StateCollector.collectState`, cached per client cycle) and
`dispatch(action: BotAction): Promise<ActionResult>` (vendored `ActionExecutor` through
`ActionQueue`). `HookEvents` gains `state: { tick: number }` and
`action: { id, action, result }`. Types are the vendored ones re-exported from
`hooks/types.ts`, so shell and server import one definition.

### 4.2 Transport and task API

```ts
interface Transport {
  getState(): Promise<BotWorldState>;
  onState(cb: (s: BotWorldState) => void): Unsub;
  dispatch(action: BotAction, timeoutMs?: number): Promise<ActionResult>;
  say(text: string): Promise<void>;              // public chat
  echo(text: string, colour?: ChatColour): void;   // local chat pane only
  screenshot(): Promise<Blob>;
}
```

`LocalTransport` (shell main thread) calls the hooks directly. `web/src/agent/api/` builds the
`bot` object (vendored high-level actions) and `sdk` object (low-level dispatches and queries)
on top of it. `web/src/agent/API.md` is generated from the types by `scripts/gen/api-docs.ts`,
committed, and served by the front server as the MCP resource `idlescape://api` and at
`GET /api/agent/docs`. The skill document's troubleshooting pointer gains a line naming it.

### 4.3 Tasks

Firestore `users/{uid}/tasks/{taskId}` =
`{ name, description, params: ParamSchema, code: string, version, createdAt, updatedAt, lastRun: { at, status, summary } }`.
Rules: own documents only; `code` under 64 KB. A Task body is an async function receiving
`{ bot, sdk, params, log, signal }`; `signal` is an `AbortSignal` honoured by every awaited
action.

Runner (`web/src/agent/runner.ts`): the body runs inside a dedicated Worker via `new Function`,
with `bot` and `sdk` proxied over `postMessage` to the main thread's `LocalTransport`. Stop
terminates the Worker. Logs stream to the `tasks` panel, to `/tab` (so `/mcp` callers see
them), and optionally to `echo`. Only one task runs at a time per tab; a second start returns
`busy`.

Both callers use the same operations: `list`, `save`, `run(taskId, params)`,
`execute(code, params)`, `stop`, `status`. The panel calls them in-process; `/mcp` sends them
over `/tab`. Saving from either side writes the same Firestore document (the tab performs
Firestore writes for MCP-originated saves so rules stay client-only).

### 4.4 Tab socket and modes

- `/tab`: WebSocket upgrade on the front server, gate cookie plus a first message carrying the
  Firebase ID token; the server verifies and registers `uid -> socket`. One tab per uid; a new
  tab replaces the old with a `replaced` close reason. Heartbeat 30 s.
- Messages are JSON with a `type` discriminator (`state`, `state_request`, `action`,
  `action_result`, `run`, `execute`, `stop`, `log`, `say`, `echo`, `screenshot`,
  `screenshot_result`, `presence`, `user_message`), correlation ids on requests, strict schema
  validation on the server.
- Modes follow rs-sdk's semantics. `observe`: `state_request`, `say`, `echo`, `list`,
  `save`, `status`. `control`: also `action`, `run`, `execute`, `stop`, `screenshot`. Mode is
  read from `agentTokens/{id}.mode` per request. The human's own clicks always win: any human
  input cancels the in-flight queue and the caller gets `action_result { cancelled: 'human' }`.
- If no tab is connected for the uid, `/mcp` tools return a typed `no_tab` error telling
  Claude to ask the player to open the game. SP5's LiteClient lifts this.
- `agentTokens.lastSeenAt` updates on every `/mcp` request, which is what the Claude
  Connection panel's green dot reads.

### 4.5 MCP gateway

`server/src/mcp/` implements Streamable HTTP with `@modelcontextprotocol/sdk`, one session
per agent token, bearer verified against `agentTokens` (hash compare, `revokedAt` null).
Tools: `get_state` (formatted and raw, mode any), `say`, `echo`, `list_tasks`, `save_task`,
`get_api_docs` (mode any); `execute_code`, `run_task`, `stop`, `screenshot` (mode `control`).
Resources: `idlescape://api` (API.md), `idlescape://learnings` (our notes in rs-sdk's
`learnings/` spirit). Errors are typed: `no_tab`, `mode_denied`, `busy`, `timeout`,
`action_failed { reason }`.

Chat from other players reaches Claude through `get_state` and the mirror; both label it as
untrusted text, as rs-sdk does.

### 4.6 Claude panel and chat mirror

The `claude` plugin panel (default, SP2 framework, icon directly above Claude Connection)
shows: pairing summary, a scrollable view mirroring game chat (public, private, game messages
from hooks `chat`) interleaved with `log` lines, and a text box. Text typed here goes over
`/tab` as `user_message` and is delivered to the paired `/mcp` session as a notification, so
the intelligence stays in the Claude Code session; Claude's replies come back as `log` lines.
`say` appears in game as the player's public chat with an optional prefix setting. The Claude
Connection panel gains "last tool call" from the `/tab` `log` stream, as its spec anticipated.

## 5. Front server changes

- `server/src/tab/`: `registry.ts`, `relay.ts`, `schema.ts`, `routes.ts` (the upgrade).
- `server/src/mcp/`: `server.ts`, `tools.ts`, `resources.ts`, `auth.ts`.
- `server/src/pair/`: add `mode` to the exchange default and the `mode` route.
- Router: `mcp` and `tab` classifications. `/mcp` is gate exempt like `/pair/*` (the bearer
  is the credential); `/tab` requires the gate cookie.
- Health: `gateway: 'up'`, plus `tabs: number`, `mcpSessions: number`.
- Rate limits: 20 actions per second per uid, 5 `say` per 10 seconds, one screenshot per
  second, 60 `/mcp` requests per minute per token.

## 6. Security

- Agent tokens: hashed at rest, shown once, revocable, one uid, mode owner-controlled.
- Task code never runs on the server. The server validates message schemas only.
- Firestore writes for tasks happen only from the tab under client rules.
- Chat and NPC text are labelled untrusted in every surface Claude reads.

## 7. Testing

- Unit: vendored bot module tests under our client build; `Transport` contract tests against
  `LocalTransport` with a fake hooks object; tab registry replace semantics; mode enforcement
  per message type; task runner abort and `busy`; MCP auth (valid, revoked, unknown).
- Integration: emulator-backed pairing then exchange (Task 13b tests) followed by an `/mcp`
  `get_state` round trip through a connected test tab; `execute_code` under `observe` returns
  `mode_denied`; under `control` reaches the tab and returns a log line.
- Browser: create a task from the panel that chops one tree on Tutorial Island, run it, assert
  a log line and an inventory event; trigger the same task through `/mcp` with a test agent
  token and assert identical logs.

## 8. Order of work

1. Vendor the bot module into the client, hooks v2, tests green.
2. `web/src/agent/`: `Transport`, vendored sdk actions, `LocalTransport`, API.md generator.
3. `tasks` plugin with the Worker runner and Firestore task store.
4. `/tab` socket, registry, relay, modes; `mode` on agent tokens and its route.
5. `/mcp` gateway with tools and resources; health `gateway: up`.
6. `claude` plugin and chat mirror; Claude Connection panel gains last tool call.
7. Tracker `update/:gameName` integration (SP3) through the tab registry.
