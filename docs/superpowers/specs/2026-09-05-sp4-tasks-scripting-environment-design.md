# Idlescape — SP4: Tasks scripting environment, Marketplace, run control, and the Tutorial Island script

Date: 2026-09-05
Status: draft for owner review
Supersedes: `2026-09-05-sp4-agent-runtime-design.md` sections 4.2 to 4.6, 5 and 7 (this document
is the detailed design for all of SP4; SP4's sections 1 to 3 on goals, the entry-screen inheritance
and the rs-sdk vendoring table stay authoritative). Consistent with
`2026-09-05-goals-and-autopilot-design.md` (its Autopilot loop drives the runner defined here) and
`2026-09-05-multi-character-platform-design.md` section 9 (`characterId` on tools).
Depends on: SP2 framework (built), entry-screen Task 13b agent tokens (built), SP6 characters (in
flight on the same branch; this design does not touch its files), the design system
(`2026-09-05-idlescape-design-system.md`).

## 1. What this delivers

1. A **client-side scripting environment**: a typed observe/act API over the vendored rs-sdk bot
   module, a priority-task script model, and a Worker-based runner with structured run traces.
2. Two new side-panel tabs: **Tasks** (my scripts, the current run, run history) and
   **Marketplace** (the built-in script catalogue, Tutorial Island first).
3. **Run control** visible everywhere: a canvas banner and strip badge while a script runs, pause
   and resume with reasons, stuck detection, hard stops.
4. **Claude attached**: the hosted `/mcp` gateway and `/tab` socket so a paired Claude Code session
   can list, save, run, attach to, pause, act manually during, resume and stop runs, and read traces.
5. A **default script set** in the repo library: `tutorial-island`, `chop-and-drop`,
   `net-fish-and-drop`, `mine-and-drop`.
6. The **Tutorial Island script validated** by an automated live playthrough on the local stack.

Non-goals: headless play (SP5), the goals/autopilot loop and Goals panel (goals spec), Contracts
tools (SP9), third-party script loading by URL (the manifest allows it later), any change to the
character routes or home page (SP6).

## 2. Decisions (owner-confirmed 2026-09-05)

| # | Question | Decision |
|---|---|---|
| 1 | Claude channel | Full SP4 in one spec: `/tab` and `/mcp` ship here. Delivery is split into three ordered plans (section 15) so the runtime and panels land first and are exercised by Playwright before the gateway. |
| 2 | Script storage | Repo files for the library (bundled, tested, versioned) plus Firestore `users/{uid}/tasks` for player and Claude-saved scripts. One list in the Tasks tab. |
| 3 | Validation | Local 274 stack, fresh guest, Playwright, repeatable. Not the live site. |
| 4 | Default set | `tutorial-island` plus three skilling loops. |
| 5 | Script model | Priority tasks: manifest, ordered `tasks[]` with `when`/`run`, `until` predicate. Free-form bodies remain a single-task script; `execute_code` snippets stay free-form. |
| 6 | Tabs | Two tabs: Tasks and Marketplace. The Marketplace lists the repo library; Tutorial Island is first. |
| 7 | Run history | Tab IndexedDB (last 50 runs with traces) mirrored as capped summaries and traces to front-server SQLite `data/runs.db`. Firestore holds no run data. |

## 3. Architecture

```
browser tab
  client bundle (fork)         hooks v1 + hooks v2: getWorldState(), dispatch(); hint, tutorial, interface texts in state
  client/vendor/rs-sdk/bot/    StateCollector, ActionExecutor, ActionQueue, reach, formatters, types (vendored)
  web/vendor/rs-sdk/sdk/       high-level actions, helpers, pathfinding, spells, chunking (vendored, transport rewired)
  web/src/agent/               Transport, LocalTransport, bot + sdk builders, WorkerHost, TaskRunner, trace store, TabLink
  web/src/tasks/               script model + defineScript, library/, user store (Firestore), run history, plugins tasks + marketplace
  window.idlescape.tasks       in-page control API used by the panels, Playwright, and TabLink
        |  wss /tab   gate cookie + Firebase ID token; JSON messages with correlation ids
front server (Bun)
  server/src/tab/              registry uid -> { socket, characterId }, relay, schema, mode enforcement, rate limits
  server/src/mcp/              POST /mcp Streamable HTTP; bearer csa_ agent token; tools -> tab relay; notifications <- tab events
  server/src/runs/             data/runs.db: run summaries + capped traces per uid; GET /api/runs for the panel, get_run for MCP
        |  https /mcp
Claude Code with the idlescape skill (server/src/pair/skill.md)
```

One runner, three callers (Tasks panel, Playwright, `/mcp` via `/tab`), one in-page API. Script
code executes only inside a Worker in the tab. The server relays, validates schemas, enforces the
token mode, stores run history, and never evaluates script code.

## 4. Observe and act layer (hooks v2)

### 4.1 Vendoring

Per SP4 section 3: `client/vendor/rs-sdk/bot/` and `web/vendor/rs-sdk/sdk/`, MIT headers kept,
upstream commit pinned in `CREDITS.md`, every local change listed in the owning `vendor/PATCHES.md`.
`client/src/hooks/world.ts` exposes `getWorldState(): WorldState` (collector output cached per
client cycle) and `dispatch(action: BotAction): Promise<ActionResult>` (executor through the
queue). `HookEvents` gains `state { tick }` and `action { id, action, result }`. Types are
re-exported from `client/src/hooks/types.ts` and mirrored in `web/src/clientTypes.ts`.

### 4.2 State additions (ours, on top of the collector; anchored in `client/PATCHES.md`)

| Field | Source in `Client.ts` | Why |
|---|---|---|
| `hint: { kind: 'none' \| 'npc' \| 'tile' \| 'player'; npcIndex?; playerIndex?; tile?: { x, z, height } }` | `hintType`, `hintNpc`, `hintPlayer`, `hintTileX/Z`, `hintHeight` (HINT_ARROW) | The tutorial (and quests) point at the next target with a hint arrow. `followHint()` needs it. |
| `tutorial: { open: boolean; title: string; lines: string[] }` | `tutorial_text` interface components (IF_SETTEXT) | The tutorial progress varp is server-only (`tutorial.varp` has no `transmit`); the on-screen title is the only client-visible step signal. |
| `flashingTab: number \| null` | the tutorial flash-side-icon packet | Several steps require opening the flashing tab. |
| `interface.texts: Record<number, string>` | component text of the open modal / chatbox interface | Lets scripts read any interface (quest journal, skill guide, count prompts) without a per-interface patch. |
| `player.regionId`, `player.zone` | derived from position | Cheap area predicates (`until` for the tutorial). |

### 4.3 Collision and pathing

`scripts/gen/collision.ts` reads the engine clone's map data through its routefinder inputs and
emits `web/src/data/collision.bin` (committed, generator input sha recorded). `walkTo` runs the
vendored A* against it, with door handling from the vendored helpers. Tutorial Island's six regions
(`tutorial_island.dbrow`) and Lumbridge are verified present by a unit test.

## 5. Transport

```ts
interface Transport {
  getState(): Promise<WorldState>;
  onState(cb: (s: WorldState) => void): Unsub;          // once per client tick
  onEvent(cb: (e: HookEvent) => void): Unsub;            // xp, inventory, chat, action, login/logout/disconnect
  dispatch(action: BotAction, timeoutMs?: number): Promise<ActionResult>;
  say(text: string): Promise<void>;
  echo(text: string, colour?: ChatColour): void;
  screenshot(): Promise<Blob>;
  humanInput(cb: () => void): Unsub;                     // real mouse/keyboard on the canvas
}
```

`LocalTransport` (main thread) wraps the hooks. Inside the Worker, `bot` and `sdk` are proxies
whose calls cross `postMessage` to the main thread; state reads are served from the latest
snapshot the main thread pushes each tick (no round trip per read). `API.md` is generated from
the types by `scripts/gen/api-docs.ts`, committed at `web/src/agent/API.md`, served at
`GET /api/agent/docs` and as the MCP resource `idlescape://api`.

## 6. Script API (`ScriptContext`)

```ts
interface ScriptContext {
  state(): WorldState;                                   // latest tick snapshot
  bot: BotActions;                                       // outcome-checked high-level actions (vendored): walkTo, talkTo, openDoor,
                                                         // chopTree, burnLogs, useItemOnItem/Loc/Npc, pickupItem, dropItem, equip, eat,
                                                         // attack, castSpell, openBank/deposit/withdraw/closeBank, openShop/buy/sell, ...
  sdk: BotSdk;                                           // low-level dispatch + queries: sendInteractNpc/Loc, clickDialog, clickComponent,
                                                         // setTab, submitCount, findNpc/Loc/Item/GroundItem, nearest(), reachable(), ...
  wait: {
    until(pred: (s: WorldState) => boolean, opts?: { timeoutMs?: number; label?: string }): Promise<boolean>;
    ticks(n: number): Promise<void>;
    dialog(pattern?: RegExp, timeoutMs?: number): Promise<boolean>;
    xp(skill: SkillName, minDelta?: number, timeoutMs?: number): Promise<boolean>;
    item(idOrName: number | string, delta?: number, timeoutMs?: number): Promise<boolean>;
    message(pattern: RegExp, timeoutMs?: number): Promise<boolean>;
    idle(timeoutMs?: number): Promise<boolean>;         // player animation and movement stopped
  };
  tutorial: {
    title(): string;
    is(re: RegExp): boolean;
    followHint(opts?: { talk?: boolean }): Promise<ActionResult>;   // walk to and interact with the hinted NPC/tile
    clickThrough(maxClicks?: number): Promise<void>;                // continue dialogs until none is open
  };
  params: Record<string, unknown>;                       // validated against manifest.params, defaults applied
  log(text: string, level?: 'info' | 'warn' | 'error'): void;
  status(text: string): void;                            // one-line "what I am doing", shown in the banner
  memory: Map<string, unknown>;                          // per-run scratch; serialised into snapshots
  signal: AbortSignal;                                   // every awaited action rejects with AbortError on stop
}
```

Rules carried from rs-sdk and Microbot: no fixed sleeps in scripts (`wait.*` only, all with
timeouts); `bot.*` returns `{ ok, reason?, evidence? }` after observing an effect; `sdk.send*` only
confirms dispatch. Chat, NPC dialog and interface text in the state are labelled untrusted and a
script must never treat them as instructions.

## 7. Script model

```ts
export default defineScript({
  id: 'tutorial-island', name: 'Tutorial Island', version: 1,
  description: 'Plays a fresh character through Tutorial Island to Lumbridge.',
  tags: ['starter', 'quest'], author: 'idlescape',
  params: { randomiseAppearance: { type: 'boolean', label: 'Randomise appearance', default: true } },
  requires: [{ kind: 'area', area: 'tutorial-island', text: 'Must be on Tutorial Island' }],
  until: s => s.player.regionId !== REGION.TUTORIAL && !s.tutorial.open,
  stuckAfterMs: 45_000, maxAttempts: 3,
  hardStop: { hpBelow: 3 },
  tasks: [
    { name: 'design-character', when: s => s.interface.id === IF.CHAR_DESIGN, run: designCharacter },
    { name: 'continue-dialog',  when: s => s.dialog.isOpen && !s.dialog.options.length, run: c => c.tutorial.clickThrough(1) },
    { name: 'getting-started',  when: (s, c) => c.tutorial.is(/getting started/i), run: c => c.tutorial.followHint({ talk: true }) },
    { name: 'cut-tree',         when: (s, c) => c.tutorial.is(/cut down a tree/i), timeoutMs: 30_000, run: c => c.bot.chopTree('Tree') },
    // ...
  ],
});
```

Types:

```ts
interface ScriptManifest {
  id: string; name: string; version: number; description: string; tags?: string[]; author?: string;
  params?: ParamSchema; requires?: Requirement[];
  stuckAfterMs?: number; maxAttempts?: number; hardStop?: { hpBelow?: number; onDeath?: true };
}
interface Task {
  name: string;
  when(s: WorldState, c: ScriptContext): boolean;
  run(c: ScriptContext): Promise<ActionResult | void>;
  timeoutMs?: number; maxAttempts?: number; cooldownMs?: number;
}
interface Script extends ScriptManifest {
  tasks: Task[];
  until?(s: WorldState, c: ScriptContext): boolean;
  onStart?(c: ScriptContext): Promise<void>;
  onStop?(c: ScriptContext, outcome: RunOutcome): Promise<void>;
}
```

Runner loop per iteration: take the tick snapshot; if `until` holds, finish `done`; evaluate
`when` in order and pick the first match; run it under `timeoutMs` and the run signal; record a
`task_exit` with outcome, attempts and the state delta; loop. Task order is priority: recovery
tasks (close modal, eat, dismiss level-up) first, catch-alls last. Progress lives in the world, so a
run can be paused, the script edited, and resumed at the current step. A script with one task
whose `when` is `() => true` is a free-form script.

Loops in the default set follow the same shape: `chop-and-drop` is `[ drop-logs-when-full,
chop-nearest ]` with `until` from `params.untilLevel`.

## 8. Run lifecycle and control

States: `idle → starting → running ⇄ paused → done | failed | stopped`.

| Pause reason | Set by | Resume by |
|---|---|---|
| `player` | Pause button, Escape | Player only |
| `claude` | `pause_run` tool | Claude or player |
| `human-input` | Real click or key on the canvas while running (any human input cancels the in-flight action, as SP4 4.4 says) | Auto after `resumeAfterHumanInputMs` idle (setting, default 5000, 0 = manual), or Resume |
| `stuck` | No task matched for `stuckAfterMs`, or one task failed `maxAttempts` in a row; a full snapshot is attached | Claude or player |
| `hard-stop` | `died`, or hp below `hardStop.hpBelow` | None; run ends `failed` |

Rules:

- One run per tab. `run` while a run is active returns `busy`; `restart` stops, reloads the script
  code (HMR for library files in dev, a fresh read for user scripts), and starts a new run.
- Manual actions (`execute_code`, `dispatch`, panel "Run snippet") are accepted only when no run is
  active or the run is paused; during `running` they return `run_active`. Paused means the runner
  holds no queued actions and touches nothing.
- Resume re-evaluates `tasks[]` from live state. `memory` survives pause/resume and is cleared on
  restart.
- Stop terminates the Worker (`AbortSignal` then `terminate()` after 2 s), cancels the action
  queue, and records `stopped` with who stopped it.
- Every run has a `runId`, `scriptId`, `scriptVersion`, `source: 'library' | 'user'`,
  `startedBy: 'player' | 'claude' | 'test'`, `characterId`, params, and a trace.

### 8.1 Trace

JSON Lines events: `run_started`, `task_enter {task}`, `task_exit {task, outcome, attempts, ms}`,
`action {action, result}`, `log {level, text}`, `status {text}`, `xp {skill, delta}` and
`item {id, delta}` (coalesced per 10 s), `stuck {task?, snapshot}`, `paused {reason, by}`,
`resumed {by}`, `human_input`, `screenshot {ref}`, `run_done {status, summary, durationMs,
xpGained, itemsDelta, tasksEntered}`. Snapshots (compact `WorldState`) are attached on `stuck`,
on a failed `task_exit`, and at most every 60 s. Traces are capped at 5 000 events in the tab and
2 000 in `runs.db`; older events roll off with a `truncated` marker.

## 9. Storage

| Source | Where | Writers | Notes |
|---|---|---|---|
| Library | `web/src/tasks/library/<id>.ts`, registered in `library/index.ts`, unit tests beside each | Us and Claude Code via git | Bundled by Vite. Shown in the Marketplace; "Add to my tasks" writes a reference document so it also appears in Tasks. HMR reload in dev triggers the "script changed, restart?" affordance. |
| User | Firestore `users/{uid}/tasks/{taskId}` = `{ name, description, tags, params, code, version, source: 'user' \| 'fork' \| 'library', libraryId?, pinnedVersion?, createdAt, updatedAt, lastRun: { runId, at, status, summary } }` | Panel, or Claude through `save_task` (the tab performs the write under client rules) | `code` is the `defineScript` form as a string, compiled in the Worker (`new Function` around a module shim; the shell sets no CSP today, and the Worker gets none that blocks it). `code` under 64 KB, `name` under 60 chars. Library references carry no code. |
| Run history | Tab IndexedDB `runs` (last 50 with traces); front server `data/runs.db` tables `runs(uid, run_id, character_id, script_id, version, source, started_by, status, started_at, ended_at, summary_json)` and `run_events(run_id, seq, at, kind, json)` | Tab over `/tab` (`run_summary`, `run_events` batches) | Capped per uid (200 runs, 2 000 events each). `GET /api/runs?limit=` (Firebase bearer) for the panel; `get_run` for MCP. |

Firestore rules add `users/{uid}/tasks/{taskId}`: owner read/write, `code is string && size < 65536`,
`source in ['user', 'fork', 'library']`.

## 10. In-page API (`window.idlescape.tasks`)

```ts
interface TasksApi {
  list(): Promise<TaskSummary[]>;                                   // library + user, with source and requirements status
  get(id: string): Promise<TaskDetail>;
  save(task: SaveTaskInput): Promise<{ id: string; version: number }>;
  remove(id: string): Promise<void>;
  install(libraryId: string): Promise<{ id: string }>;              // Marketplace "Add to my tasks"
  run(id: string, params?: Record<string, unknown>, opts?: { startedBy?: 'player' | 'claude' | 'test' }): Promise<{ runId: string }>;
  execute(code: string, params?: Record<string, unknown>): Promise<ExecuteResult>;   // free-form snippet; run_active while running
  dispatch(action: BotAction): Promise<ActionResult>;                                // run_active while running
  pause(by: 'player' | 'claude'): Promise<void>;
  resume(by: 'player' | 'claude'): Promise<void>;
  stop(by: 'player' | 'claude'): Promise<void>;
  restart(): Promise<{ runId: string }>;
  status(): RunStatus;                                              // state, reason, script, task, attempts, elapsed, attached
  getRun(runId?: string, sinceSeq?: number): Promise<{ summary: RunSummary; events: TraceEvent[] }>;
  listRuns(limit?: number): Promise<RunSummary[]>;
  onEvent(cb: (e: TraceEvent) => void): Unsub;
  getState(): WorldState;
  screenshot(): Promise<Blob>;
}
```

Playwright drives exactly this surface; so does `TabLink` when a `/tab` message arrives.

## 11. Tab socket and MCP gateway

### 11.1 `/tab`

WebSocket upgrade on the front server, gate cookie plus a first `hello { idToken, characterId }`
message; the server verifies the ID token and registers `uid -> { socket, characterId }`. One tab
per uid; a newer tab replaces the older with close reason `replaced`. Heartbeat 30 s. The tab sends
`character_changed` when SP6's switcher logs in as another character. Messages are JSON with `type`
and correlation `id`, validated by schema on the server:

- Server to tab (requests): `state_request`, `dispatch`, `execute`, `run`, `pause`, `resume`,
  `stop`, `restart`, `list`, `get`, `save`, `remove`, `install`, `status`, `get_run`, `list_runs`,
  `screenshot`, `say`, `echo`, `attach`, `detach`, `user_message`.
- Tab to server: `*_result` with the correlation id, `event` (trace events while a session is
  attached, plus `chat`, `presence`), `run_summary` and `run_events` (history mirror), `log`.

Mode enforcement per message from `agentTokens/{id}.mode`, read per request:
`observe` allows `state_request`, `list`, `get`, `status`, `get_run`, `list_runs`, `attach`,
`detach`, `say`, `echo`, `save`; `control` adds `dispatch`, `execute`, `run`, `pause`, `resume`,
`stop`, `restart`, `remove`, `install`, `screenshot`. If no tab is connected the tool returns
`no_tab`. Every tool accepts `characterId?`; until SP7 the relay returns `character_mismatch` if
it differs from the tab's active character.

Rate limits (from SP4 section 5): 20 dispatches per second per uid, 5 `say` per 10 s, one
screenshot per second, 60 `/mcp` requests per minute per token. `agentTokens.lastSeenAt` updates on
every request.

### 11.2 `/mcp` tools

| Tool | Mode | Notes |
|---|---|---|
| `get_state(format?: 'summary' \| 'full')` | observe | Formatted summary by default (vendored formatters), raw on request. |
| `get_api_docs()` | observe | Returns `API.md`. |
| `list_tasks()`, `get_task(id)` | observe | Library and user scripts with requirements status. |
| `save_task({ id?, name, description, code, params, tags })` | observe | Writes through the tab; returns id and version. Compiles the code in the Worker first and returns compile errors. |
| `list_runs(limit?)`, `get_run(runId?, sinceSeq?)`, `get_run_status()` | observe | History and the current run. |
| `attach_run(runId?)`, `detach_run()` | observe | Trace events arrive as MCP notifications `idlescape/run_event`. |
| `say(text)`, `echo(text)` | observe | Public chat and local echo. |
| `run_task(id, params?)`, `restart_run()` | control | Returns `busy` if a run is active. |
| `pause_run()`, `resume_run()`, `stop_run()` | control | Resume is refused with `paused_by_player` when the player paused. |
| `execute_code(code, params?)` | control | Free-form snippet with the same `ScriptContext`; refused with `run_active` while running. |
| `dispatch(action)` | control | Single low-level action; same `run_active` rule. |
| `screenshot()` | control | PNG as an image content block. |
| `install_task(libraryId)`, `remove_task(id)` | control | Marketplace and cleanup. |
| `wiki_query(question)` | observe | Proxies `/api/wiki` (SPW), as the goals spec anticipated. |

Resources: `idlescape://api` (API.md), `idlescape://scripts/<id>` (library source, read-only),
`idlescape://learnings` (our notes file `docs/agent/learnings.md`). Typed errors: `no_tab`,
`mode_denied`, `busy`, `run_active`, `paused_by_player`, `character_mismatch`, `timeout`,
`action_failed { reason }`, `compile_error { message, line }`. `/api/health` gains
`gateway: 'up'`, `tabs`, `mcpSessions`, `activeRuns`.

The skill document (`server/src/pair/skill.md`) gains a "Running tasks" section: list, attach,
run, watch notifications, pause to intervene, resume; and the rule that Claude asks before
starting a run unless the player already asked for it in conversation.

## 12. UI

All components follow the design system (RuneLite density, one orange accent, sentence case).

### 12.1 Tasks tab (`tasks`, icon ▶, default enabled)

1. **Current run card** (top, only when a run is not idle): script name, status pill
   (running orange, paused amber with reason, stuck amber "Stuck: <task>", failed red), current
   task name and `status()` line, elapsed, attempts, XP gained so far, buttons Pause/Resume, Stop,
   Restart, and a "Claude attached" badge with the last tool call when a session is attached.
2. **My scripts**: rows for installed library scripts and user scripts: name, source badge
   (built-in / mine / fork), version, requirements status dot with a tooltip naming what is
   missing, Run (opens the params form from the manifest when params exist), Edit (user scripts:
   a code editor textarea with compile feedback), Fork (library), Delete (user). Empty state
   points at the Marketplace.
3. **Run snippet**: a small code box for free-form `execute` with the last result; disabled with
   "pause the run first" while running.
4. **History**: last runs with status, script, duration, XP gained, started by; "Open trace" shows
   the trace viewer (filters by kind, snapshot expanders, "Copy to Claude" which sends a slice as a
   `user_message`).
5. **Settings** (gear): `resumeAfterHumanInputMs`, `echoLogsToChat`. `bannerPosition` is
   dropped (SP4a Task 13): the run banner is always along the top of the canvas, one fewer knob.

### 12.2 Marketplace tab (`marketplace`, icon ⚑, default enabled)

Cards for every library script: name, blurb, tags, version, estimated duration, requirements
evaluated live ("Needs an axe", "Must be on Tutorial Island: yes"), and actions **Run now** and
**Add to my tasks** (installed cards show "Added"). Tutorial Island is first and, while the player
is on the island, carries a "Start here" badge. A search box filters by name and tag. The catalogue
is the bundled library; a later spec can add remote sources without changing the card.

### 12.3 Run banner and badges (always visible while a run is not idle)

A slim banner across the top of the canvas: "<script> · <task> · <status line> · mm:ss" with
Pause/Resume and Stop; orange while running (a subtle pulse, none under reduced motion), amber
while paused with the reason ("Paused: you took control · resumes in 3 s", "Paused by Claude",
"Stuck on cut-tree"), red for a hard stop with what happened. Escape pauses. The Tasks strip icon
shows a status dot in the same colour. When a Claude session is attached, a small ✦ dot appears on
the banner. Toasts announce `run_done`, `stuck`, and `hard-stop`.

### 12.4 Claude tab additions

The existing Claude tab (`connect`) gains a "Now" section: current run status, attached yes/no,
last tool call, and a text box whose content goes to the paired session as `user_message` (SP4
4.6). Chat mirroring into this tab is kept from SP4.

## 13. Tutorial Island script

### 13.1 Step detection

The engine drives the tutorial through `%tutorial` (server-only) and tells the client three
things per step: the `tutorial_text` title and lines, a hint arrow (NPC or tile), and sometimes a
flashing tab. Every task's `when` matches on the title; `followHint` covers most movement and
talking. Titles come from `engine/content/scripts/tutorial/scripts/tut_chatbox_steps.rs2`; the
mapping table is generated into `web/src/tasks/library/tutorial-island/steps.ts` by
`scripts/gen/tutorial-steps.ts` so a content bump regenerates it.

### 13.2 Task list (priority order)

1. Recovery: `design-character` (interface 3559, randomise per param, accept), `continue-dialog`
   (a dialog with no options), `dismiss-level-up`, `close-unexpected-modal`.
2. Guide's house: `getting-started` (talk to the RuneScape Guide via hint), `interact-scenery`
   (open the hinted door), `moving-around` (walk to and talk to the Survival Expert via hint).
3. Survival: `view-inventory` (set tab 3), `cut-tree` (chop the hinted tree, wait for logs),
   `build-fire` (tinderbox on logs, wait for Firemaking XP), `open-skills` (set the flashing tab),
   `catch-shrimp` (net the hinted spot, wait for raw shrimp), `cook-shrimp` (raw shrimp on the
   fire, wait for cooked or burnt), `survival-recap` (talk via hint).
4. Chef: `go-to-chef` (open gate, follow hint), `talk-to-chef`, `make-dough` (pot of flour on
   bucket of water), `bake-bread` (dough on range), `open-music-tab`, `click-run` and `enable-run`
   (player controls tab, run toggle).
5. Quest guide: `enter-quest-house`, `talk-quest-guide`, `open-quest-journal`, `enter-mine`
   (ladder via hint).
6. Mining: `talk-mining-instructor`, `prospect-rocks` (prospect the hinted rock until the title
   changes; the server flips between copper and tin), `mine-rocks` (mine hinted rocks until the
   title changes), `smelt-bar` (ore on furnace), `smith-dagger` (bar on anvil, choose dagger in the
   smithing interface), `leave-mine` (gate via hint).
7. Combat: `talk-combat-instructor`, `open-worn` (equipment tab), `equip-dagger`, `unequip`,
   `open-combat-tab`, `attack-rat-melee` (enter the pit via gate, attack a Giant rat, wait for
   the kill), `leave-pit`, `attack-rat-ranged` (equip bow and arrows, attack from outside the
   fence, wait for the title), `climb-ladder-to-bank`.
8. Bank and advisor: `open-bank` (bank booth via hint), `close-bank`, `open-advisor-door`,
   `talk-advisor`, `exit-advisor-room`.
9. Chapel: `enter-chapel`, `talk-brother`, `open-prayer-tab`, `open-friends-tab`,
   `open-ignore-tab`, `talk-brother-again`, `exit-chapel`.
10. Magic: `talk-magic-instructor`, `open-magic-tab`, `cast-wind-strike` (select Wind Strike,
    cast on a Chicken, retry on splash until the title reads success), `finish` (talk via hint,
    choose the "go to mainland" option, accept).

`until`: region is not Tutorial Island and `tutorial.open` is false. `stuckAfterMs` 45 s per task,
`maxAttempts` 3, `timeoutMs` per task between 20 and 90 s (mining and combat are the long ones).

### 13.3 Validation harness

`web/e2e/tutorial-island.pw.test.ts`, run on the local stack (emulators, engine 274, front
server) with a fresh guest through the human login path (`web/e2e/helpers.ts`):

1. Assert the Marketplace lists Tutorial Island first with "Start here".
2. Start the run from the panel's Run now button (one test) and from
   `window.idlescape.tasks.run('tutorial-island', {}, { startedBy: 'test' })` (a second test).
3. Assert the banner is visible and orange, the strip icon dot is on, and Pause then Resume
   toggles the banner colour and the run state.
4. Poll `getRun()` and assert every task in section 13.2 is entered in order (recovery tasks may
   interleave), no `stuck` event occurs, and the run ends `done` within 25 minutes of game time.
5. Assert the final state: `tutorial.open` false, region is Lumbridge, inventory holds the
   tutorial rewards, and Woodcutting, Firemaking, Fishing, Cooking, Mining, Smithing, Attack,
   Ranged and Magic each gained XP during the run.
6. Save the trace to `docs/runs/tutorial-island-<sha>.jsonl` and a screenshot to
   `docs/screenshots/e2e-tutorial-island.png`; the plan's acceptance is this file committed from
   a green run.

A human-input test pauses the run by clicking the canvas mid-`cut-tree` and asserts
`paused { reason: 'human-input' }` then automatic resume.

## 14. Default library

| id | Tags | Params | Tasks | until |
|---|---|---|---|---|
| `tutorial-island` | starter, quest | `randomiseAppearance` | section 13 | off the island |
| `chop-and-drop` | skilling, woodcutting | `tree` (Tree/Oak), `untilLevel`, `keepLogs` | `drop-logs-when-full`, `chop-nearest` | Woodcutting level reached |
| `net-fish-and-drop` | skilling, fishing | `untilLevel`, `spot` | `drop-fish-when-full`, `net-nearest-spot` | Fishing level reached |
| `mine-and-drop` | skilling, mining | `ore` (copper/tin/iron), `untilLevel` | `drop-ore-when-full`, `mine-nearest-rock` | Mining level reached |

Each loop declares `requires` (axe, net, pickaxe in inventory or worn) and a `hardStop.hpBelow`.
Each has a unit test with a fake transport that feeds scripted state sequences and asserts task
selection and `until`.

## 15. Delivery split and order of work

Three plans, executed in order, each independently green:

1. **SP4a: runtime, library, panels.** Vendor rs-sdk bot module into the client; hooks v2 and the
   state additions; collision generator; Transport and Worker runner with traces; script model;
   the four library scripts with unit tests; IndexedDB run history; Tasks and Marketplace tabs;
   banner and badges; `window.idlescape.tasks`; Playwright: run `chop-and-drop` from the panel
   on Tutorial Island's tree, pause via canvas click, resume, stop.
   Collision generator and global A* moved to SP4b (plan ruling 2026-09-05): SP4a `walkTo` uses
   the client routefinder with straight-line legs. As built, the Playwright run is therefore
   driven by a user script rather than by `chop-and-drop`, which is asserted through its
   requirement refusal (no axe in the guide's house) until SP4b gives it a runnable path —
   collision data and the Tutorial Island script.
2. **SP4b: Tutorial Island validated.** `scripts/gen/tutorial-steps.ts`, the script, the
   validation harness in section 13.3, the committed trace. Fixes to hooks or actions found on the
   way land here.
3. **SP4c: gateway.** `/tab` registry, relay, schema, modes and rate limits; `runs.db` and
   `GET /api/runs`; `/mcp` server, tools, resources, notifications; `mode` on agent tokens and
   its route; skill document section; Claude tab additions; health fields. Integration tests with
   a test tab and a test agent token; the Tutorial Island run repeated through `run_task` with
   `attach_run` notifications asserted.

## 16. Testing

- Unit: vendored bot module tests under our client build; state additions from fixture packets;
  `Transport` contract against `LocalTransport` with a fake hooks object; runner task selection,
  timeouts, attempts, stuck, pause/resume/restart, abort; trace caps and coalescing; script
  compile errors; params validation; library scripts against scripted state sequences; tab
  registry replace semantics; mode enforcement per message; MCP auth (valid, revoked, unknown,
  wrong prefix); `runs.db` caps.
- Integration (emulators): save through `/mcp` lands in Firestore via the tab; `run_task` under
  `observe` returns `mode_denied`; under `control` starts a run and streams notifications;
  `execute_code` during `running` returns `run_active`, succeeds after `pause_run`.
- Browser (Playwright): SP4a loop test; SP4b tutorial harness; SP4c tutorial through MCP.

## 17. Security

Agent tokens hashed, revocable, mode owner-controlled (unchanged). Script code runs only in the
tab's Worker; the Worker has no DOM, no Firebase, no network beyond `postMessage`. The server
validates message schemas and never evaluates code. Firestore writes for tasks happen only from the
tab under client rules. Chat, dialog and interface text are labelled untrusted in every surface
Claude reads. Claude can pause, act and resume but can never override a player pause, raise its own
mode, or start a run when the token is `observe`.

## 18. Credits

`CREDITS.md` gains: rs-sdk pinned commit under Vendored (already reserved); Microbot
(BSD-2-Clause) under Inspiration for `sleepUntil` over fixed sleeps, `status` reporting, the state
machine script base with state snapshots, pause-all, and the agent server idea; rs2b0t for the
priority `TaskBot` and per-action outcome checks (already listed); OSRSBot and RSBot/powerbot for
the script lifecycle, manifest and paint overlay lineage.

## 19. Open questions for the owner

1. Should a library script be runnable from the Marketplace without "Add to my tasks" (current
   design: yes, Run now works directly)?
2. Human-input auto-resume default of 5 s: keep, or default to manual resume for scripts (the
   goals spec uses 5 s for Autopilot)?
3. Should `save_task` from Claude be allowed in `observe` mode (current design: yes, it writes only
   the player's own documents and runs nothing)?
