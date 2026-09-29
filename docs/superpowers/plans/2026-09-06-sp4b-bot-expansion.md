# SP4b - Bot expansion and the Tutorial Island script

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the bot system able to work away from the tile it is standing on: abort a task the moment the runner says so, find its own resources by kind at three widening ranges, walk across the map over real collision data, notice when it has come off the rails and put itself back, show the player what the run is doing and what past runs did, be turned on and off per script, and prove all of it against the live 274 stack - including a Tutorial Island script that plays a fresh guest off the island.

**Architecture:** Three new layers sit between the existing runner and the existing vendored SDK, and nothing below them changes shape. (1) *Static map knowledge*: two build-time generators read the pinned `engine/content` clone and emit `web/src/data/atlas.json` (resource clusters, landmarks, routes) and `web/src/data/collision.bin` + `doors.json` (one blocked bit per tile per level, plus every openable door), both delivered as Vite `?url` assets fetched lazily inside the Worker. The stub bodies in `web/src/vendor/rs-sdk/sdk/pathfinding.ts` are swapped for real ones over that bitset, which brings the vendored `walkTo`'s existing door-avoidance and re-route logic alive with no edit to `actions.ts`. (2) *Script-facing layers*: `c.find` (scene scan, atlas lookup, walking sweep) and `c.travel` (leg splitting, route waypoints, typed failures) build on the pathfinder and on `bot.walkTo`. (3) *A health monitor* runs in the Worker beside the runner, evaluates typed conditions on every state message, and hands the runner a pending recovery which it drains as a synthetic `recover:<condition>` task; the task-scoped abort built in Task 1 is what lets a recovery take the game away from a parked `wait.until`. The UI (banner detail line, run card, run report, export) reads the trace and the enriched `RunStatus`; per-script toggles live in a Firestore-backed store shaped exactly like the plugin settings store and are enforced in `TasksApi.run`.

**Tech Stack:** Vite + TypeScript shell (`web/`, Vitest + jsdom, Playwright), Bun for the build-time generators (`scripts/gen/`), vendored 274 client fork (`client/`, `bun test`), Node/tsx engine (`engine/server`, never edited), Firebase emulators for auth and Firestore.

**Spec:** `docs/superpowers/specs/2026-09-06-sp4b-bot-expansion-design.md`, including section 7's twelve owner decisions, all approved. It supersedes section 15 item 2 of `docs/superpowers/specs/2026-09-05-sp4-tasks-scripting-environment-design.md`. The session-level instructions are `docs/superpowers/specs/2026-09-06-sprint-handoff.md`.

## Global Constraints

- Strict TypeScript, no new `as any`, **files under 400 lines including test files** (split rather than trim comments), a `types.ts` per package, conventional commits.
- Unit tests: **Vitest with jsdom** for `web/` (`cd web && npx vitest run`); **`bun test`** for `server/` and `client/`.
- Browser tests: **Playwright against the live stack**, run from `web/`, never the repo root. Build with `cd web && npm run build:e2e` first; **NEVER** a plain `npm run build` for an e2e run - the front server serves `web/dist-e2e`.
- Dev stack: firebase emulators on **9099** (auth) and **8080** (firestore); engine on **8899** with management on **8897**; front server on **8787**. Bring it up with `npm run dev` (PowerShell, `scripts/start-stack.ps1`); ready in about two minutes. A client rebuild needs no restart.
- **`pwsh` is not installed.** Windows PowerShell 5.1 only: no `&&`, no ternary, no `?.`, no `??`.
- Branch: `feat/platform-shell`. Every commit ends with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
  ```
  Use `git -c core.safecrlf=false commit` and explicit `git add <paths>`, never `git add -A`.
- **No em dashes in new prose** (source comments, docs, UI copy). Use hyphens or commas.
- **`engine/` and `engine/content` are pinned clones and are never edited.** This plan only *reads* them, at build time. Engine-side changes would go in `engine-custom/` and `content-custom/`; **this plan needs none**.
- `client/` is edited once, in Task 1, and only under `client/src/hooks/`, which is ours (see `client/PATCHES.md`, first section). No new numbered client patch is created; the numbering stays at 28.
- The twelve owner decisions in spec section 7 are binding. In particular: atlas generated at build time from the pinned clone and committed (1); `atlas.json` at most **250 KB raw / 80 KB gzipped** and `collision.bin` at most **1 MB raw / 400 KB gzipped**, both lazily fetched (2); scene scan default **15** tiles, max **52**, sweep budget **200** tiles over **8** scan points (4); death policy `return-and-resume`, second death fails the run (5); **200** run summaries, full traces for the newest **50** (6); toggles per account at `users/{uid}/scriptToggles/{scriptId}` (7); enforcement in `TasksApi.run` (8); **600** ticks per skilling e2e, **25** minutes wall clock for Tutorial Island, one Playwright retry (9); ladders, stairs and boats only as declared route waypoints, everything else refused `needs_route` (11); banner detail line on by default, collapsible, no new setting (12).
- Per-command verification (Git Bash, from the repo root):
  - web: `cd web && npm run typecheck && npm run lint && npx vitest run`
  - client: `cd client && ~/.bun/bin/bunx tsc --noEmit && ~/.bun/bin/bun test src/hooks && ~/.bun/bin/bun run build:dev`
  - generators: `cd web && npx vitest run src/data/gen` (the parsers) plus `~/.bun/bin/bun scripts/gen/atlas.ts --check` from the repo root (the IO half)
  - e2e: stack up, then `cd web && npm run build:e2e && npx playwright test`

---

## What SP4a and SP7 already shipped, verified in the code

Read this before Task 1. Every task assumes it, and several tasks fail silently if an implementer assumes the SP4 *spec* instead of the built code.

**The abort story as built.** `web/src/agent/worker.ts:192` builds one `AbortController` per run and hands `abort.signal` to `createWorkerContext` as a fixed `signal`. `web/src/agent/workerContext.ts` closes over `d.signal` in `untilP` (lines 63, 69, 74) and in `ticks` (lines 86, 90, 91), and puts it on the context as `signal: d.signal` (line 95). `web/src/tasks/runner.ts:56` makes a *different* signal per task (`taskAbort`) and passes it as `{ ...d.ctx, signal: taskAbort.signal }` - a spread, so the `wait.*` closures never see it. A task timeout (line 58) therefore aborts a controller nothing is listening to: `wait.until(() => false, { timeoutMs: 60000 })` runs its full minute inside a task whose `timeoutMs` was one second, and the runner reports `timeout` only when the task body finally returns.

**No cancel path reaches the client.** `client/src/hooks/world.ts:70` already has `cancelAll()` (a `BotActionQueue.beginGeneration()` bump). It is **not** on `ClientHooks` in `client/src/hooks/types.ts`, **not** returned by `installHooks` (`client/src/hooks/install.ts:16-33`), **not** in `client/bundle.ts`'s terser `reserved` list, and **not** in the `web/src/clientTypes.ts` mirror. `Transport.dispatch`'s doc comment (`web/src/agent/types.ts:24-32`) says so explicitly.

**The Worker protocol.** `MainToWorker` and `WorkerToMain` are the two unions in `web/src/agent/types.ts:58-83`. `RpcMethod = 'dispatch' | 'say' | 'echo' | 'screenshot'`. `web/src/agent/workerHost.ts:250` maps each to a `Transport` call. The Worker's `stop` path (`worker.ts:118-126`) already does `current?.abort.abort()` then `rpc.rejectAll('run stopped')`.

**The runner.** `createRunner(d: RunnerDeps)` in `web/src/tasks/runner.ts`: `stuckAfterMs` default 45 s, per-task `timeoutMs` default 30 s, `maxAttempts` default 3 counted as *consecutive* failures, `hardStop.hpBelow`, pause/resume with `paused_by_player`. `loop()` picks `script.tasks.find(t => t.when(s, d.ctx))` on every fresh tick and calls `markStuck(null, s)` when nothing has matched for `stuckAfterMs`.

**The trace.** `web/src/tasks/trace.ts`: capped at 5 000 events, coalesces consecutive same-target `xp`/`item` deltas within 10 s, keeps `run_started` at the head and one `truncated` marker behind it. `TraceEvent` is the union in `web/src/tasks/types.ts:71-86`.

**History.** `web/src/tasks/history.ts`: IndexedDB `idlescape-runs` at **version 1**, stores `runs` (keyPath `runId`, index `startedAt`) and `events` (keyPath `runId`), one cap of **50** applied to both by `trim()` inside the caller's transaction.

**The api.** `web/src/tasks/api.ts` owns the catalogue, the live trace buffer (flushed to IndexedDB every 50 events), settings in `localStorage` under `cs.tasks.settings`, and the `TasksError` codes `busy | run_active | not_found | requirements | params | compile_error | paused_by_player | not_paused | not_signed_in | disposed`. `run()` checks declarative requirements, validates params, then calls `host.run`.

**The router.** `web/src/tasks/router.ts` forwards every method to the *active* session's api, except run-addressed calls, which go to the api that owns the run id. `settings.set` currently reaches `current()` only (line 128) - that is SP4a carry-over 2, fixed in Task 2.

**Sessions.** `web/src/sessions/manager.ts` exposes `login(characterId): Promise<LoginResult>`, which refuses with `LOGIN_IN_PROGRESS_MESSAGE` while one is in flight and reports `{ ok: true }` for a session already online. `web/src/frame/stage.ts:159` builds one runtime per iframe through `wireTasks({ hooks, canvas, uid, characterId })`.

**The world state.** `WorldState = BotWorldState & WorldExtras`. `WorldExtras` (`client/src/hooks/worldExtras.ts:27-35`) is `hint`, `tutorial { open, title, lines }`, `flashingTab`, `interfaceTexts`, `regionId` (`((x >> 6) << 8) | (z >> 6)`), `zone` (`{ x: x >> 3, z: z >> 3 }`). There is **no camera field anywhere**, and there is no way to add one that would change what the bot can see: the collector reads the scene graph, not the render camera.

**Scanning.** `BotSDK.getNearbyLocs()` reads the last snapshot; `BotSDK.scanNearbyLocs(radius?)` and `scanGroundItems(radius?)` dispatch an on-demand action that re-fills the reach probe (`web/src/vendor/rs-sdk/sdk/index.ts:425,439`). `NearbyLoc` carries `id, name, x, z, level, distance, optionsWithIndex, options, reachable?`; `NearbyNpc` carries `kind, id, index, name, combatLevel, x, z, tileX?, tileZ?, size?, distance, hp, ...`.

**Pathfinding is ours and is a stub.** `web/src/vendor/rs-sdk/sdk/pathfinding.ts` answers permissively everywhere and `findLongPath` returns straight-line waypoints every 20 tiles. `BotSDK.findPath` (`index.ts:1054`) refuses when the *source* zone is unallocated, returns `{ success: true, waypoints: [] }` when the destination zone is unallocated, and reports "unreachable" when a partial path ends more than 100 tiles short. `BotActions.walkTo` (`actions.ts:1008-1225`) is a real routine over that: 50 iterations, monotone best-remaining progress, partial-path dead-end detection, proactive door opening through `findDoorsAlongPath`, `TemporaryDoorBlocklist` avoidance, death-en-route abort. **`initPathfinding()` has no callers anywhere in the repo.**

**The panels.** `web/src/plugins/builtin/tasks.ts` re-reads rows and history at mount, on `deps.onActiveChanged`, and on a `run_done` trace event; there is no poll. `web/src/plugins/builtin/tasksViews.ts` holds `renderRunCard`/`updateRunCard`/`renderScriptRow`/`renderHistoryRow`/`renderParamsForm`/`statusLabel`/`fmtElapsed`. `web/src/frame/runBanner.ts` owns the strip dot, the toasts and Escape-to-pause. `web/src/plugins/builtin/traceView.ts` renders one run's events with a Copy button and `UNTRUSTED_HEADER`.

**Toggles do not exist.** Neither `TaskSummary`, nor `UserTaskDoc` (`web/src/tasks/userStore.ts:17`), nor `firebase/firestore.rules` carries a per-script enable. The plugin analogue is `web/src/plugins/settings.ts`: a debounced (800 ms) store over `users/{uid}/plugins/{pluginId}` with a `cs.plugin.<id>` localStorage mirror.

**Static delivery.** `server/src/router.ts:64` serves **only** `/assets/*` out of `web/dist`; a file dropped in `web/public/` at the dist root would 404 in production. Vite's `?url` import is the supported way to emit a content-hashed asset under `assets/` and get its URL, and it is what Tasks 3 and 4 use.

---

## Plan rulings

Six places where the spec's design and the code as built do not line up. Each is decided here, with what it costs if the decision is wrong. Task 15 writes each of them back into the spec.

**R1. The collision file is a walkability bitset, and walls are not in it.** The engine builds collision from three sources (`engine/server/src/engine/GameMap.ts:225-241` and `:265-285`): the land flag bit `0x1` (`BLOCK_MAP_SQUARE`) blocks a tile, bit `0x2` (`LINK_BELOW`) on level 1 means the tile belongs to the level below, and a loc with `blockwalk` blocks according to its shape's *layer* - `WALL` (shapes 0-3) blocks tile **edges** by angle, `GROUND` (9-16) blocks its `width x length` footprint (swapped for angles 0/2), `GROUND_DECOR` (22) blocks the tile only when `active === 1`. A one-bit-per-tile file, which is what spec section 3.3 specifies and what the 1 MB budget is sized for (487 squares x 4 levels x 4096 tiles = 997 KB), cannot carry edge blocking. **Ruling:** the bitset carries land blocking and GROUND / GROUND_DECOR loc footprints; wall shapes are excluded from it and appear only in the door table when they are openable. *Cost if wrong:* a global path may cut across a building wall it should have gone around. It is bounded, because every leg is handed to `Client.walkTo`, which routes with the client's own scene collision (walls included), and `travel.to` re-plans once and then fails `unreachable` rather than looping. Revisit by adding a second, sparse edge-flag table if the Tutorial Island run in Task 14 shows paths entering buildings through walls.

**R2. The generators live half in `web/src`, half in `scripts/gen`.** Spec section 3.2 puts `scripts/gen/atlas.ts` under `scripts/`, where nothing in `verify.ps1` runs a test. **Ruling:** every *pure* parser and transform goes in `web/src/data/gen/*.ts`, where `npm run typecheck`, `npm run lint` and vitest already cover it; `scripts/gen/*.ts` keeps only file IO, argument handling and the budget check, and imports the pure half by relative path under Bun. Two of those modules are shared with the shell on purpose - `kinds.ts` (the taxonomy `c.find` matches against) and `collisionFile.ts` (whose decoder the Worker uses) - and both are small, dependency-free and safe to bundle; the four that are generator-only (`jm2.ts`, `configs.ts`, `clusters.ts`, `collisionBuild.ts`) are imported by nothing in `web/src`, so Vite never emits them. *Cost if wrong:* the generators' IO half stays unit-untested (it is covered by the `--check` mode that `scripts/build.ps1` runs on every build).

**R3. Cancel is a Worker-to-main message, not an RPC call.** Spec section 3.1 asks for "a `cancel` main-to-worker message and RPC method". An RPC call would be rejected by the very `rpc.rejectAll` that follows it one line later, producing a spurious unhandled rejection on every task abort. **Ruling:** `WorkerToMain` gains `{ t: 'cancel' }`, handled in `workerHost` by calling `transport.cancel()`; no `MainToWorker` cancel message is added, because `pause` and `stop` already reach the Worker and now run the same path, and a second entry point would be the "redundant second owner" defect the handoff warns about. *Cost if wrong:* a future main-thread-initiated cancel that does not go through pause or stop needs one more message.

**R4. E2E seeding uses the engine's `::` cheat commands, not dev routes.** Spec section 3.7 and decision 10 assume "the engine's dev routes". There are none: `engine-custom/src/idlescape/management.ts` registers `GET /owner/:key/bank` and `POST /owner/:key/bank/apply` and nothing else. What does exist is `ClientCheatHandler` (`engine/server/src/network/game/client/handler/ClientCheatHandler.ts`), which gives `::give <item> [n]`, `::setstat <skill> <level>`, `::tele <level,mx,mz,lx,lz>` and the `[debugproc,...]` scripts to a player with `staffModLevel >= 4` on a non-production node, and the vendored client's `say()` already routes a `::`-prefixed message to `ClientProt.CLIENT_CHEAT` instead of public chat (`client/src/client/Client.ts:1883-1889`). `engine-custom/src/idlescape/staff.ts` grants level 4 only from `IDLESCAPE_DEV_STAFF`, which `scripts/start-stack.ps1:59` sets **only when `-Prod` is absent** - and `verify.ps1` starts the stack with `-Prod`. **Ruling:** `start-stack.ps1` gains a `-DevStaff` switch that sets `IDLESCAPE_DEV_STAFF=4` regardless of `-Prod`, `verify.ps1` passes `-Prod -DevStaff`, and `web/e2e/harness.ts` seeds through `tasks.dispatch({ type: 'say', ... })`. *Cost if wrong:* nothing in production - `loadIdlescapeConfig` forces `devStaffLevel` to 0 whenever `Environment.node.production` is true, so the switch cannot grant staff on a deployed world.

**R5. `atlas.json` and `collision.bin` are delivered as Vite `?url` assets.** Spec section 3.2 says "fetched lazily (not bundled)" without saying how. `web/public/` is not an option: the front server routes only `/assets/*` from `web/dist`. **Ruling:** the loaders `import atlasUrl from '../data/atlas.json?url'`, which emits a content-hashed file under `assets/` and hands back its URL; the loader takes the URL and a `fetch` as dependencies so unit tests never touch either. *Cost if wrong:* none known; this is the same mechanism Vite uses for every other asset the shell ships.

**R6. Fishing spots are identified by config, not by id suffix.** Spec section 3.2 says fishing-spot NPCs are "named `<level>_<mx>_<mz>_<kind>fish`". Only 35 npc ids in `engine/content/pack/npc.pack` match that shape, and four of them are the fishing-contest spots. **Ruling:** the atlas identifies a fishing spot as an npc config whose `name=Fishing spot` (or whose `op1..op5` includes one of `Net`, `Bait`, `Lure`, `Cage`, `Harpoon`, `Fish`), resolved to ids through `npc.pack`, and then finds its spawn tiles in the `==== NPC ====` sections. *Cost if wrong:* a few spot kinds are missed, which `c.find` degrades over by falling back to `sweep`.

---

## File structure

**Create - build-time generators (pure halves, unit tested in web)**

- `web/src/data/gen/jm2.ts` - parse one `.jm2` file into `{ land, locs, npcs, objs }`. The only place the `==== MAP ==== / LOC / NPC / OBJ` format is understood.
- `web/src/data/gen/configs.ts` - parse `[block]` + `key=value` config text (`.loc`, `.npc`) into `Map<debugname, Record<string, string[]>>`, and parse `id=debugname` pack files.
- `web/src/data/gen/kinds.ts` - the resource taxonomy: which loc categories and names are which `ResourceKind`, which npc configs are fishing spots, and each kind's interaction op.
- `web/src/data/gen/clusters.ts` - collapse placements into clusters (6-tile radius), and the landmark and route tables.
- `web/src/data/gen/collisionBuild.ts` - land flags plus loc footprints into per-square bitsets, and the door table.
- `web/src/data/gen/collisionFile.ts` - the on-disk format: `encodeCollision(squares)` and `decodeCollision(buffer)`. Shared by the generator and the runtime reader.
- Tests beside each: `jm2.test.ts`, `configs.test.ts`, `kinds.test.ts`, `clusters.test.ts`, `collisionBuild.test.ts`, `collisionFile.test.ts`.

**Create - build-time generators (IO halves, Bun)**

- `scripts/gen/atlas.ts` - reads the pinned clone, writes `web/src/data/atlas.json`, enforces the size budget, supports `--check`.
- `scripts/gen/collision.ts` - the same for `web/src/data/collision.bin` and `web/src/data/doors.json`.
- `scripts/gen/tutorial-steps.ts` - extracts the ordered `~tutorialstep` titles into `web/src/tasks/library/tutorialIsland/steps.ts`.
- `scripts/gen/lib/io.ts` - shared: locate the content root, read a directory of files, hash the inputs, gzip-size a buffer, and the `--check` comparison.

**Create - committed generator output**

- `web/src/data/atlas.json`, `web/src/data/collision.bin`, `web/src/data/doors.json`, `web/src/tasks/library/tutorialIsland/steps.ts`.

**Create - runtime**

- `web/src/tasks/atlas.ts` - the lazy atlas loader and lookups (`nearestCluster`, `landmark`, `routeBetween`).
- `web/src/tasks/collision.ts` - the lazy collision loader; calls `initPathfinding(grid)` once.
- `web/src/tasks/travel.ts` - `createTravel(deps)`: `to()` and `distanceTo()`.
- `web/src/tasks/find.ts` - `createFind(deps)`: `nearest`, `nearestAtlas`, `sweep`, `landmark`.
- `web/src/tasks/health.ts` - the typed checks as pure predicates over snapshots.
- `web/src/tasks/healthMonitor.ts` - the stateful monitor: evaluation, pending recovery, the escalation ladder.
- `web/src/tasks/recovery.ts` - the default recovery tasks, one per condition.
- `web/src/tasks/toggles.ts` - the `scriptToggles` store (Firestore + localStorage mirror + debounce).
- `web/src/tasks/runReport.ts` - pure: a trace plus a summary into the report model the panel renders.
- `web/src/plugins/builtin/runReportView.ts` - the report view (timeline, totals, Export).
- `web/src/tasks/library/tutorialIsland/` - `index.ts`, `steps.ts` (generated), `recovery.ts`, `guide.ts`, `survival.ts`, `chef.ts`, `quest.ts`, `mining.ts`, `combat.ts`, `finish.ts`, `helpers.ts`.
- `web/e2e/harness.ts` - `seedCharacter`, `runUntil`, `saveArtifacts`.
- `web/e2e/scripts.pw.test.ts`, `web/e2e/tutorial-island.pw.test.ts`.
- Tests beside each new runtime module.

**Modify**

- `client/src/hooks/types.ts`, `client/src/hooks/install.ts`, `client/src/hooks/install.test.ts`, `client/bundle.ts`, `client/PATCHES.md` - publish `cancelAll`.
- `web/src/clientTypes.ts` - mirror `cancelAll`.
- `web/src/agent/types.ts` - `Transport.cancel`, `Transport.relogin`, `WorkerToMain` gains `cancel` and the `relogin` RPC method.
- `web/src/agent/localTransport.ts`, `web/src/agent/localTransport.test.ts` - implement both.
- `web/src/agent/workerContext.ts`, `web/src/agent/workerContext.test.ts` - `signal()` accessor, `find`, `travel`, `health`, `anchor`.
- `web/src/agent/worker.ts`, `web/src/agent/worker.test.ts` - task signal plumbing, the monitor, the cancel message.
- `web/src/agent/workerHost.ts`, `web/src/agent/workerHost.test.ts` - handle `cancel`, answer `relogin`.
- `web/src/tasks/runner.ts`, `web/src/tasks/runner.test.ts` - `setSignal`, `cancel`, pending recoveries, `FailReason`.
- `web/src/tasks/types.ts` - every new type in spec section 5.
- `web/src/tasks/api.ts`, `web/src/tasks/api.test.ts` - `setEnabled`, `exportRun`, the `disabled` error.
- `web/src/tasks/router.ts`, `web/src/tasks/router.test.ts` - fan-out for `settings.set` and `setEnabled`.
- `web/src/tasks/catalogue.ts` - `TaskSummary.enabled`.
- `web/src/tasks/wire.ts` - build the toggles store, the monitor's transport bits and `relogin`.
- `web/src/tasks/history.ts`, `web/src/tasks/history.test.ts` - schema 2, split retention, export.
- `web/src/tasks/library/chopAndDrop.ts`, `netFishAndDrop.ts`, `mineAndDrop.ts`, `index.ts`, `library.test.ts`, `librarySource.test.ts` - use `find` and `travel`, declare `health`.
- `web/src/vendor/rs-sdk/sdk/pathfinding.ts`, `web/src/vendor/PATCHES.md` - real bodies.
- `web/src/frame/runBanner.ts`, `web/src/frame/runBanner.test.ts` - detail line and health pip.
- `web/src/frame/stage.ts`, `web/src/frame/stage.test.ts` - pass `relogin` into `wireTasks`.
- `web/src/plugins/builtin/tasks.ts`, `tasksViews.ts`, `tasks.test.ts`, `marketplace.ts`, `marketplace.test.ts` - toggles, live detail, the report.
- `web/src/styles/*.css`, `web/styleguide.html`, `web/src/styleguide.ts`.
- `firebase/firestore.rules` and the rules suite - the `scriptToggles` rule.
- `scripts/build.ps1` - run the three generators in `--check` mode.
- `scripts/start-stack.ps1`, `scripts/verify.ps1` - `-DevStaff`.
- `docs/superpowers/specs/2026-09-06-sp4b-bot-expansion-design.md`, `docs/superpowers/specs/2026-09-05-idlescape-roadmap-and-handoff.md`, `README.md` - Task 15.

---

### Task 1: Task-scoped abort

The first task, owed from the SP4a final review. Today a pause or a task timeout aborts a controller the `ScriptContext` closures never see, so a parked `wait.until` runs to its own timeout and an in-flight SDK action keeps going. Three pieces: a `signal()` accessor the context reads at call time, a `Transport.cancel()` that drains the client queue and settles outstanding dispatches, and `cancelAll` published on `ClientHooks`.

**Files:**
- Modify: `client/src/hooks/types.ts`, `client/src/hooks/install.ts`, `client/bundle.ts`, `client/PATCHES.md`
- Modify: `web/src/clientTypes.ts`, `web/src/agent/types.ts`, `web/src/agent/localTransport.ts`, `web/src/agent/workerContext.ts`, `web/src/agent/worker.ts`, `web/src/agent/workerHost.ts`, `web/src/tasks/runner.ts`
- Test: `client/src/hooks/install.test.ts`, `web/src/agent/localTransport.test.ts`, `web/src/agent/workerContext.test.ts`, `web/src/tasks/runner.test.ts`, `web/src/agent/worker.test.ts`, `web/src/agent/workerHost.test.ts` (all modify)

**Interfaces:**
- Consumes: `ClientHooks`, `Transport`, `ContextDeps`, `RunnerDeps`, `MainToWorker`/`WorkerToMain` as listed in "What SP4a and SP7 already shipped".
- Produces, and every later task depends on these names:
  - `ClientHooks.cancelAll(): void`
  - `Transport.cancel(): void`
  - `ContextDeps.signal(): AbortSignal` (replaces `signal: AbortSignal`)
  - `RunnerDeps.setSignal?(signal: AbortSignal | null): void` and `RunnerDeps.cancel?(): void`
  - `WorkerToMain` variant `{ t: 'cancel' }`

- [ ] **Step 1: Publish `cancelAll` on the client hooks**

`client/src/hooks/types.ts`, in `ClientHooks`, directly under `dispatch`:

```ts
  /**
   * Drop every queued bot action. The action already executing is kept as a quiescence
   * barrier (`BotActionQueue.beginGeneration`), so this means "nothing new starts and the
   * caller stops waiting", not "the client forgets what it is doing". Callers must re-read
   * the world state afterwards rather than assume it is untouched.
   */
  cancelAll(): void;
```

`client/src/hooks/install.ts`, in the `hooks` object literal beside `dispatch: world.dispatch`:

```ts
    cancelAll: world.cancelAll,
```

`client/bundle.ts`, in the terser `reserved` list, beside `'getWorldState', 'dispatch',`:

```ts
                    // SP4b: the shell drains the client's action queue when a task aborts.
                    'cancelAll',
```

- [ ] **Step 2: Prove the hook is wired, and that it is the queue bump**

`client/src/hooks/install.test.ts` - add to the existing describe. Mutation target: deleting `cancelAll: world.cancelAll` from `install.ts` must fail this.

```ts
test('cancelAll drops queued actions but leaves the running one', async () => {
  const bridge = makeBridge();               // the file's existing fake bridge
  const { hooks } = installHooks(bridge);
  let release: (r: ActionResult) => void = () => {};
  bridge.world().executor.execute = () => new Promise<ActionResult>(r => { release = r; });

  const first = hooks.dispatch({ type: 'say', message: 'a', reason: 'test' });
  const second = hooks.dispatch({ type: 'say', message: 'b', reason: 'test' });
  hooks.cancelAll();
  release({ success: true, message: 'done' });

  expect(await first).toEqual({ success: true, message: 'done' });
  expect(await second).toMatchObject({ success: false, reason: 'cancelled' });
});
```

Run: `cd client && ~/.bun/bin/bun test src/hooks` - expect FAIL ("hooks.cancelAll is not a function") before Step 1's edit, PASS after.

- [ ] **Step 3: Mirror it in the web and add `Transport.cancel`**

`web/src/clientTypes.ts`, in `ClientHooks` under `dispatch`: copy the same member and doc comment verbatim (this file is a verbatim mirror of the client's `hooks/types.ts`).

`web/src/agent/types.ts`: replace the "There is no cancel path today" paragraph in `dispatch`'s doc comment with a pointer to `cancel`, and add to `Transport`:

```ts
  /**
   * Stop waiting on everything in flight. Drains the client's queued actions and settles every
   * outstanding `dispatch` with `{ success: false, reason: 'cancelled' }`; the action already
   * executing runs to completion inside the client, so a caller must re-read the world rather
   * than assume nothing moved.
   */
  cancel(): void;
```

and add to `WorkerToMain`:

```ts
  /** The Worker aborted a task: drain the client queue on its behalf (plan ruling R3). */
  | { t: 'cancel' }
```

- [ ] **Step 4: Write the failing transport test**

`web/src/agent/localTransport.test.ts`:

```ts
test('cancel drains the client queue and settles the dispatches waiting on it', async () => {
  const hooks = fakeHooks();                       // the file's existing helper
  let cancelled = 0;
  hooks.cancelAll = () => { cancelled++; };
  let never: (r: ActionResult) => void = () => {};
  hooks.dispatch = () => new Promise<ActionResult>(r => { never = r; });
  const transport = createLocalTransport(hooks, () => null);

  const inFlight = transport.dispatch({ type: 'say', message: 'x', reason: 'test' });
  transport.cancel();

  expect(cancelled).toBe(1);
  expect(await inFlight).toMatchObject({ success: false, reason: 'cancelled' });
  // The late reply must not resolve it a second time or overwrite the cancellation.
  never({ success: true, message: 'late' });
  expect(await inFlight).toMatchObject({ success: false, reason: 'cancelled' });
});
```

Run: `cd web && npx vitest run src/agent/localTransport.test.ts` - expect FAIL ("transport.cancel is not a function").

- [ ] **Step 5: Implement `cancel` in the local transport**

`web/src/agent/localTransport.ts`. Replace the module-level `withTimeout` with a version that registers its resolver, and add the set plus the method:

```ts
export function createLocalTransport(hooks: ClientHooks, canvas: () => HTMLCanvasElement | null): LocalTransport {
  // Every dispatch this transport is still waiting on. `cancel` settles them; a normal reply
  // removes its own entry, so the set only ever holds work that is genuinely in flight.
  const waiting = new Set<(r: ActionResult) => void>();
```

```ts
    dispatch: (action: BotAction, timeoutMs = DEFAULT_TIMEOUT_MS) =>
      withTimeout(hooks.dispatch(action), timeoutMs, waiting),
```

```ts
    cancel(): void {
      // A client bundle older than this hook is a real possibility (a frame that was already
      // open across a deploy), and a cancel that throws would take the abort path down with it.
      try { hooks.cancelAll(); } catch { /* older client: the settles below still apply */ }
      for (const settle of [...waiting]) settle({ success: false, message: 'cancelled', reason: 'cancelled' });
      waiting.clear();
    },
```

and in `dispose()`, after the listener removal, add `waiting.clear();`.

```ts
function withTimeout(p: Promise<ActionResult>, ms: number, waiting: Set<(r: ActionResult) => void>): Promise<ActionResult> {
  return new Promise(resolve => {
    let settled = false;
    const done = (r: ActionResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      waiting.delete(done);
      resolve(r);
    };
    const t = setTimeout(() => done({ success: false, message: `action timed out after ${ms}ms`, reason: 'timeout' }), ms);
    waiting.add(done);
    p.then(r => done(r), e => done({ success: false, message: String(e), reason: 'error' }));
  });
}
```

Run: `cd web && npx vitest run src/agent/localTransport.test.ts` - expect PASS.

- [ ] **Step 6: Write the failing context test for the live signal**

`web/src/agent/workerContext.test.ts`. The existing helper builds a context with a fixed signal; change it to take an accessor, then add:

```ts
test('a wait registers against the signal that is live when it is called', async () => {
  const run = new AbortController();
  let current: AbortSignal = run.signal;
  const { ctx } = createWorkerContext({ ...deps, signal: () => current });

  const task = new AbortController();
  current = task.signal;
  const parked = ctx.wait.until(() => false, { timeoutMs: 60_000 });
  task.abort();

  expect(await parked).toBe(false);
});

test('the context reads the accessor per access, so c.signal is the task signal', () => {
  const run = new AbortController();
  let current: AbortSignal = run.signal;
  const { ctx } = createWorkerContext({ ...deps, signal: () => current });
  const task = new AbortController();
  current = task.signal;
  task.abort();

  expect(ctx.signal.aborted).toBe(true);
  expect(run.signal.aborted).toBe(false);
});
```

Run: expect FAIL (the first hangs to its 60 s timeout under fake timers, the second reads the run signal).

- [ ] **Step 7: Make the context read the signal at call time**

`web/src/agent/workerContext.ts`:

```ts
export interface ContextDeps {
  transport: Transport;
  trace: Trace;
  params: ParamValues;
  /**
   * The signal that is live *now*. The runner installs the current task's signal before each
   * `run` and clears it afterwards, so a `wait.*` registers against the task that started it -
   * a fixed signal here is what made a 1 s task timeout wait out a 60 s `wait.until` (SP4a).
   */
  signal(): AbortSignal;
  onTick(cb: () => void): () => void;
}
```

In `untilP`, take the signal once at the top and use it throughout:

```ts
  const untilP = (pred: (s: WorldState) => boolean, timeoutMs = DEFAULT_WAIT_MS, label?: string): Promise<boolean> =>
    new Promise(res => {
      if (safe(pred, state())) { res(true); return; }
      const signal = d.signal();
      let settled = false;
      const done = (v: boolean): void => {
        if (settled) return;
        settled = true;
        off();
        signal.removeEventListener('abort', onAbort);
        clearTimeout(timer);
        res(v);
      };
      const off = onState(s => { if (safe(pred, s)) done(true); });
      const onAbort = (): void => done(false);
      signal.addEventListener('abort', onAbort);
      const timer = setTimeout(() => {
        if (label) d.trace.push({ kind: 'log', level: 'warn', text: `wait ${label} timed out after ${timeoutMs}ms` });
        done(false);
      }, timeoutMs);
      if (signal.aborted) done(false);
    });
```

`ticks` gets the same treatment (`const signal = d.signal();` before the listener wiring, then `signal` everywhere `d.signal` appeared).

The context itself keeps `signal` a plain `AbortSignal` for scripts, read through a getter so it is never stale:

```ts
  const ctx: ScriptContext = {
    state, bot, sdk, params: d.params, memory,
    // A getter, not a value: the runner swaps the live signal between tasks, and a script that
    // captured `c.signal` at task start must still see its own task's abort.
    get signal() { return d.signal(); },
    log: (text, level = 'info') => d.trace.push({ kind: 'log', level, text }),
```

Run: `cd web && npx vitest run src/agent/workerContext.test.ts` - expect PASS.

- [ ] **Step 8: Write the failing runner test**

`web/src/tasks/runner.test.ts`. This is the acceptance criterion from spec section 3.1.

```ts
test('a task timeout interrupts the wait the task is parked on, and cancels the client queue', async () => {
  vi.useFakeTimers();
  const cancels: number[] = [];
  let live: AbortSignal | null = null;
  // The context a real Worker would build: `signal` follows whatever the runner installed.
  const ctx = makeCtx({
    signal: () => live ?? new AbortController().signal,
    wait: { until: () => new Promise<boolean>(res => { live?.addEventListener('abort', () => res(false)); }) }
  });
  const runner = createRunner({
    ...deps, ctx,
    script: { id: 's', name: 's', version: 1, description: '', tasks: [
      { name: 'parked', when: () => true, timeoutMs: 1000, run: c => c.wait.until(() => false, { timeoutMs: 60_000 }).then(() => undefined) }
    ], until: () => false },
    setSignal: s => { live = s; },
    cancel: () => { cancels.push(Date.now()); }
  });

  const done = runner.start();
  await vi.advanceTimersByTimeAsync(1100);
  runner.stop('player');
  await done;

  const exit = trace.events().find(e => e.kind === 'task_exit');
  expect(exit).toMatchObject({ task: 'parked', outcome: 'timeout' });
  expect(cancels.length).toBeGreaterThan(0);
});
```

Run: `cd web && npx vitest run src/tasks/runner.test.ts` - expect FAIL (unknown deps `setSignal`/`cancel`; the task never exits).

- [ ] **Step 9: Install the task signal from the runner and cancel on abort**

`web/src/tasks/runner.ts`:

```ts
export interface RunnerDeps {
  script: Script; ctx: ScriptContext; trace: Trace; state(): WorldState | null; onTick(cb: () => void): Unsub;
  now(): number; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(h: unknown): void; onStateChange?(s: RunStatusLite): void;
  /**
   * Publishes the signal `ctx.signal` and every `ctx.wait.*` observes. The runner owns one
   * controller per task; without this the context keeps the run-level signal and a task timeout
   * aborts something nothing is listening to.
   */
  setSignal?(signal: AbortSignal | null): void;
  /** Drain the client's action queue and settle in-flight dispatches. Called on every task abort. */
  cancel?(): void;
}
```

Add the helper and use it everywhere a task is aborted:

```ts
  /** Abort the task in flight and take the game back from it. Safe when no task is running. */
  const abortTask = (): void => {
    if (!taskAbort) return;
    taskAbort.abort();
    d.cancel?.();
  };
```

- `pause()`: `taskAbort?.abort();` becomes `abortTask();`
- `stop()`: `taskAbort?.abort(); runAbort.abort();` becomes `abortTask(); runAbort.abort();`
- in `runTask`, the timeout callback becomes `d.setTimeout(() => { timedOut = true; abortTask(); }, t.timeoutMs ?? 30_000)`
- in `runTask`, after `taskAbort = new AbortController();` add `d.setSignal?.(taskAbort.signal);`
- `const ctx: ScriptContext = { ...d.ctx, signal: taskAbort.signal };` becomes `const ctx = d.ctx;` with the comment:

```ts
    // NOT a spread: `d.ctx.signal` is a getter over `setSignal`, and spreading it would freeze
    // the value at task start - which is exactly the SP4a bug this task exists to fix.
    const ctx: ScriptContext = d.ctx;
```

- in the teardown line after `d.clearTimeout(timer)`, add `d.setSignal?.(null);` before `taskAbort = null;`

Run: `cd web && npx vitest run src/tasks/runner.test.ts` - expect PASS.

- [ ] **Step 10: Wire the Worker and the host**

`web/src/agent/worker.ts`:

```ts
/** The signal the runner has installed for the task in flight, or null between tasks. */
let taskSignal: AbortSignal | null = null;
```

in `startRun`, replace the context construction and add the two runner deps:

```ts
    const abort = new AbortController();
    const context = createWorkerContext({
      transport, trace: t, params: parsed.values, onTick,
      signal: () => taskSignal ?? abort.signal
    });
```

```ts
    runner = createRunner({
      script: resolved.script, ctx: context.ctx, trace: t, state: () => latest, onTick, now: Date.now,
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: h => { clearTimeout(h as ReturnType<typeof setTimeout>); },
      onStateChange: postStatus,
      setSignal: s => { taskSignal = s; },
      // Two halves of one thing: the client stops working on what the task asked for, and the
      // task's own RPC calls stop waiting for answers that are no longer wanted.
      cancel: () => { post({ t: 'cancel' }); rpc.rejectAll('task aborted'); }
    });
```

in `endRun`, beside `run.abort.abort();` add `taskSignal = null;`.

in the `execute` path, the snippet context becomes `signal: () => abort.signal`.

in the `stop` message case, add `post({ t: 'cancel' });` before `rpc.rejectAll('run stopped');`.

`web/src/agent/workerHost.ts`, in `handle`:

```ts
      case 'cancel':
        // The Worker aborted a task. Drain the client queue on its behalf: the Worker has no
        // client, and its own RPC rejection only stops it waiting, not the game moving.
        d.transport.cancel();
        return;
```

- [ ] **Step 11: Prove a pause leaves nothing queued**

`web/src/agent/worker.test.ts` (the file drives the Worker module through a fake transport and a message pump):

```ts
test('a pause during an action cancels the client queue within one message turn', async () => {
  const { post, transport } = startWorker();      // the file's existing harness
  transport.dispatch = () => new Promise(() => {});   // never settles
  await runScript(WALKING_SCRIPT);
  post({ t: 'pause', reason: 'player', by: 'player' });
  await flush();
  expect(transport.cancel).toHaveBeenCalledTimes(1);
});
```

`web/src/agent/workerHost.test.ts`:

```ts
test('a cancel message from the Worker drains the client queue', () => {
  const { worker, transport } = makeHost();
  worker.emit({ t: 'cancel' });
  expect(transport.cancel).toHaveBeenCalledTimes(1);
});
```

Add `cancel: vi.fn()` to every fake `Transport` in the web test suite (`workerHost.test.ts`, `worker.test.ts`, `api.test.ts`, `catalogue.test.ts`, and any other file building one) so `npm run typecheck` passes.

- [ ] **Step 12: Record it in the client patch notes and verify**

`client/PATCHES.md`, in the "Everything under `client/src/hooks/` is ours" paragraph, extend the published contract list to `login / logout / echoChat / getState / getObjName / getObjIcon / getObjInfo / getWorldState / dispatch / cancelAll / on`, and extend the `cancelAll()` paragraph below it with: "SP4b publishes it on `ClientHooks` and the web shell calls it through `Transport.cancel()` whenever a task aborts; the in-flight action is still not cancellable, so the transport settles the caller's promise with `reason: 'cancelled'` and the script re-reads the world."

Run all of it:

```bash
cd client && ~/.bun/bin/bunx tsc --noEmit && ~/.bun/bin/bun test src/hooks && ~/.bun/bin/bun run build:dev
cd ../web && npm run typecheck && npm run lint && npx vitest run
```

- [ ] **Step 13: Commit**

```bash
git add client/src/hooks/types.ts client/src/hooks/install.ts client/src/hooks/install.test.ts client/bundle.ts client/PATCHES.md web/src/clientTypes.ts web/src/agent web/src/tasks/runner.ts web/src/tasks/runner.test.ts
git -c core.safecrlf=false commit -m "$(cat <<'EOF'
feat(tasks): make a task abort reach the waits and the client queue

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
EOF
)"
```

---

### Task 2: The two SP4a carry-overs

Small, independent, and both are "the panel shows a stale thing" bugs. (1) `router.settings.set` reaches only the active session, so a setting changed on one character tab is not live on the others. (2) The Tasks panel re-reads at mount, on tab change and on `run_done`, so a live run's history and script rows go stale for as long as the run lasts.

**Files:**
- Modify: `web/src/tasks/router.ts`, `web/src/plugins/builtin/tasks.ts`
- Test: `web/src/tasks/router.test.ts`, `web/src/plugins/builtin/tasks.test.ts`

**Interfaces:**
- Consumes: `TasksRouter`, `TasksApi`, the panel's `refreshHistory`/`refreshScripts`.
- Produces: `TasksRouter` behaviour only; no new exported names. Task 9 reuses the same fan-out for `setEnabled`.

- [ ] **Step 1: Write the failing router test**

`web/src/tasks/router.test.ts`:

```ts
test('a settings change reaches every attached session, not only the active one', () => {
  const a = fakeApi(), b = fakeApi();
  const router = createTasksRouter({ activeId: () => 'a' });
  router.attach('a', a);
  router.attach('b', b);

  router.api.settings.set({ echoLogsToChat: true });

  expect(a.settings.set).toHaveBeenCalledWith({ echoLogsToChat: true });
  expect(b.settings.set).toHaveBeenCalledWith({ echoLogsToChat: true });
});

test('a settings change with no session attached is a no-op, not a throw', () => {
  const router = createTasksRouter({ activeId: () => null });
  expect(() => router.api.settings.set({ echoLogsToChat: true })).not.toThrow();
});
```

Run: `cd web && npx vitest run src/tasks/router.test.ts` - expect FAIL (only `a` is written).

- [ ] **Step 2: Fan the write out**

`web/src/tasks/router.ts`, above the `api` object:

```ts
  /**
   * A write every attached session should see. Settings are per account, not per character
   * (the panel writes them from one tab and every character's runtime reads them), so a write
   * that reached only `current()` left the other tabs on the old value until their next reload.
   * One session that throws must not cost the others the write.
   */
  function fanOut(write: (api: TasksApi) => void): void {
    for (const api of [...apis.values()]) {
      try { write(api); } catch (e) { console.error('[tasks] a session refused a fan-out write', e); }
    }
  }
```

and:

```ts
    settings: {
      get: () => current()?.settings.get() ?? { ...DEFAULT_SETTINGS },
      set: patch => { fanOut(api => api.settings.set(patch)); }
    },
```

Run: expect PASS.

- [ ] **Step 3: Write the failing panel test**

`web/src/plugins/builtin/tasks.test.ts`:

```ts
test('a live run re-reads history on a poll, and stops when the panel unmounts', () => {
  vi.useFakeTimers();
  const api = fakeApi({ status: { ...IDLE_STATUS, state: 'running', runId: 'r1', startedAt: 0 } });
  const view = createTasksPlugin(deps(api)).panel!(ctx);
  view.mount(body);
  const before = api.listRuns.mock.calls.length;

  vi.advanceTimersByTime(10_000);
  expect(api.listRuns.mock.calls.length).toBe(before + 1);

  view.unmount?.();
  vi.advanceTimersByTime(30_000);
  // Not "no timer remains" - no CALL happens. A cleared interval and a live one that writes
  // into a detached panel look identical to a timer count.
  expect(api.listRuns.mock.calls.length).toBe(before + 1);
});

test('an idle panel does not poll', () => {
  vi.useFakeTimers();
  const api = fakeApi({ status: IDLE_STATUS });
  const view = createTasksPlugin(deps(api)).panel!(ctx);
  view.mount(body);
  const before = api.listRuns.mock.calls.length;
  vi.advanceTimersByTime(30_000);
  expect(api.listRuns.mock.calls.length).toBe(before);
});
```

Run: `cd web && npx vitest run src/plugins/builtin/tasks.test.ts` - expect FAIL (no poll exists).

- [ ] **Step 4: Add the poll**

`web/src/plugins/builtin/tasks.ts`. Beside `const TICK_MS = 1000;`:

```ts
/** How often a live run re-reads the rows and the history behind it. */
const REFRESH_MS = 10_000;
```

Add a second handle beside `timer`:

```ts
  let refresh: ReturnType<typeof setInterval> | null = null;
```

Extend `syncTick` (renaming it is not worth the churn; it already owns "what runs while a run is live"):

```ts
    function syncTick(status: RunStatus): void {
      const moving = status.state !== 'idle' && !TERMINAL.has(status.state);
      if (moving && timer === null) timer = setInterval(() => renderRun(api.status()), TICK_MS);
      if (!moving && timer !== null) { clearInterval(timer); timer = null; }
      // The clock ticks once a second; the rows and the history behind them are a network
      // read, so they get their own, slower beat. Both stop the moment the run does.
      if (moving && refresh === null) {
        refresh = setInterval(() => { void refreshHistory(); void refreshScripts(); }, REFRESH_MS);
      }
      if (!moving && refresh !== null) { clearInterval(refresh); refresh = null; }
    }
```

and in `unmount()`:

```ts
      if (timer !== null) clearInterval(timer);
      if (refresh !== null) clearInterval(refresh);
      timer = null;
      refresh = null;
```

Run: expect PASS.

- [ ] **Step 5: Verify and commit**

```bash
cd web && npm run typecheck && npm run lint && npx vitest run
```

```bash
git add web/src/tasks/router.ts web/src/tasks/router.test.ts web/src/plugins/builtin/tasks.ts web/src/plugins/builtin/tasks.test.ts
git -c core.safecrlf=false commit -m "$(cat <<'EOF'
fix(tasks): fan settings writes to every session and refresh a live run's rows

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
EOF
)"
```

---

### Task 3: The atlas - generator, data, loader

A build-time index of where things are on the whole map, so a script can ask for "the nearest oak" without standing next to one. Read `engine/content/pack/*.pack` for id-to-name, `engine/content/scripts/**/*.loc` and `*.npc` for what each name *is*, and `engine/content/maps/*.jm2` for where each id is placed. Collapse placements into clusters and commit the result.

**The formats, verified against the engine's own packer** (`engine/server/tools/pack/map/Pack.js:36-130`):

- A `.jm2` file has four sections, each headed `==== MAP ====`, `==== LOC ====`, `==== NPC ====`, `==== OBJ ====`.
- Every data line is `<level> <localX> <localZ>: <payload>`, with level a single digit and local coordinates 0-63.
- MAP payload is space-separated tokens: `h<height>`, `o<id>[;shape[;rot]]`, `f<flags>`, `u<underlay>`. Any may be absent.
- LOC payload is `<id> [shape] [angle]`. **Shape defaults to 10 and angle to 0** when absent - not 0 and 0.
- NPC payload is `<id>`. OBJ payload is `<id> <count>`. A tile may repeat, so all four are one-to-many.
- The file name is `m<mx>_<mz>.jm2`; absolute tile = `(mx << 6) + localX`, `(mz << 6) + localZ`.
- A config file (`.loc`, `.npc`) is `[debugname]` blocks of `key=value` lines, with `//` comments and blank lines between. Keys repeat (`param=`, `op1..op5`). `loc.pack` and `npc.pack` are `<id>=<debugname>` per line.

**Files:**
- Create: `web/src/data/gen/jm2.ts`, `web/src/data/gen/configs.ts`, `web/src/data/gen/kinds.ts`, `web/src/data/gen/clusters.ts`, `web/src/data/gen/landmarks.ts`, `scripts/gen/lib/io.ts`, `scripts/gen/atlas.ts`, `web/src/tasks/atlas.ts`, `web/src/data/atlas.json` (generated, committed)
- Modify: `web/src/tasks/types.ts`, `scripts/build.ps1`
- Test: `web/src/data/gen/jm2.test.ts`, `configs.test.ts`, `kinds.test.ts`, `clusters.test.ts`, `web/src/tasks/atlas.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `web/src/tasks/types.ts`: `ResourceKind`, `AtlasCluster`, `AtlasLandmark`, `RouteWaypoint`, `AtlasRoute`, `Atlas`, `FoundVia`, `FoundTarget`, `FindOpts`, `SweepOpts`, exactly as spec section 5 declares them.
  - `web/src/data/gen/jm2.ts`: `parseJm2(text: string, mx: number, mz: number): MapSquare`, `squareCoords(fileName: string): { mx: number; mz: number } | null`, `packLocal(level, x, z): number`, and the types `LocPlacement { level; x; z; id; shape; angle }`, `NpcSpawn { level; x; z; id }`, `MapSquare { mx; mz; land: Map<number, number>; locs: LocPlacement[]; npcs: NpcSpawn[] }`.
  - `web/src/data/gen/configs.ts`: `type ConfigBlock = Record<string, string[]>`, `parseConfigText(text: string): Map<string, ConfigBlock>`, `parsePack(text: string): Map<number, string>`, `first(block, key): string | undefined`, `ops(block): string[]`.
  - `web/src/data/gen/kinds.ts`: `KIND_META: Record<ResourceKind, { label: string; op: string; skill?: string }>`, `locKind(block: ConfigBlock): ResourceKind | null`, `isFishingSpot(block: ConfigBlock): boolean`, `variantOf(debugName: string): string`.
  - `web/src/data/gen/clusters.ts`: `type Placement = { kind: ResourceKind; variant: string; level: number; x: number; z: number }`, `clusterPlacements(items: Placement[], radius?: number): AtlasCluster[]`.
  - `web/src/data/gen/landmarks.ts`: `TOWNS: { id: string; name: string; level: number; x: number; z: number }[]`, `deriveLandmarks(clusters: AtlasCluster[]): AtlasLandmark[]`.
  - `web/src/tasks/atlas.ts`: `createAtlasLoader(deps): AtlasLoader` with `load(): Promise<Atlas | null>`, `peek(): Atlas | null`, `nearestCluster(atlas, kind, from, opts): AtlasCluster | null`, `landmark(atlas, id): AtlasLandmark | null`.

- [ ] **Step 1: Add the atlas types**

`web/src/tasks/types.ts`, after the `Requirement` union. Copy spec section 5 verbatim; these are the names Tasks 5, 6, 12 and 13 all import.

```ts
export type ResourceKind =
  | 'tree' | 'rock' | 'fishing-spot' | 'bank' | 'furnace' | 'anvil' | 'range' | 'altar' | 'fire';

export interface AtlasCluster {
  id: number; kind: ResourceKind; variant: string;      // 'oaktree', 'rock_copper', 'saltfish'
  level: number; x: number; z: number;
  n: number; r: number;                                 // placements collapsed, and cluster radius
  region: number;                                       // regionId, packed as WorldExtras reports it
  near?: string[];                                      // landmark ids within 50 tiles
}
export interface AtlasLandmark {
  id: string; kind: ResourceKind | 'town' | 'teleport'; name: string;
  level: number; x: number; z: number;
}
export type RouteWaypoint =
  | { kind: 'walk'; x: number; z: number }
  | { kind: 'interact'; locName: string; op: string; x: number; z: number; toLevel?: number };
export interface AtlasRoute { from: string; to: string; level: number; waypoints: RouteWaypoint[] }
export interface Atlas {
  version: number; source: { contentSha: string; generatedAt: string };
  kinds: Record<ResourceKind, { label: string; op: string; skill?: string }>;
  clusters: AtlasCluster[]; landmarks: AtlasLandmark[]; routes: AtlasRoute[];
}
```

- [ ] **Step 2: Write the failing `.jm2` parser test**

`web/src/data/gen/jm2.test.ts`. The fixture is four real lines lifted out of `engine/content/maps/m50_50.jm2`, which is what makes it a contract test rather than a restatement of the implementation.

```ts
import { describe, expect, test } from 'vitest';
import { packLocal, parseJm2, squareCoords } from './jm2';

const FIXTURE = [
  '==== MAP ====',
  '0 0 0: u48',
  '0 4 9: h50 o10;1;3 f4 u50',
  '0 5 7: h50 o10 f1 u50',
  '1 5 7: f2',
  '==== LOC ====',
  '0 0 0: 1247 22 3',
  '0 0 7: 1258 22',
  '0 0 8: 1911 3 1',
  '0 0 8: 1938',
  '==== NPC ====',
  '0 0 38: 59',
  '==== OBJ ====',
  '0 5 27: 882 1'
].join('\n');

describe('parseJm2', () => {
  const square = parseJm2(FIXTURE, 50, 50);

  test('reads the f token, and only the f token, as the flags', () => {
    expect(square.land.get(packLocal(0, 4, 9))).toBe(4);
    expect(square.land.get(packLocal(0, 5, 7))).toBe(1);
    expect(square.land.get(packLocal(1, 5, 7))).toBe(2);
    // A tile with no f token is present with flags 0, not absent: "not blocked" and
    // "not in the file" have to be distinguishable for the bridge lookup in Task 4.
    expect(square.land.get(packLocal(0, 0, 0))).toBe(0);
  });

  test('defaults an omitted loc shape to 10 and an omitted angle to 0', () => {
    const byTile = square.locs.filter(l => l.x === 8 && l.z === undefined);
    expect(square.locs).toContainEqual({ level: 0, x: 0, z: 7, id: 1258, shape: 22, angle: 0 });
    expect(square.locs).toContainEqual({ level: 0, x: 0, z: 8, id: 1938, shape: 10, angle: 0 });
    expect(byTile).toEqual([]);
  });

  test('keeps every loc on a tile that carries more than one', () => {
    const onTile = square.locs.filter(l => l.level === 0 && l.x === 0 && l.z === 8);
    expect(onTile.map(l => l.id).sort()).toEqual([1911, 1938]);
  });

  test('reads npc spawns and ignores the OBJ section', () => {
    expect(square.npcs).toEqual([{ level: 0, x: 0, z: 38, id: 59 }]);
  });

  test('squareCoords reads the map square out of the file name', () => {
    expect(squareCoords('m50_50.jm2')).toEqual({ mx: 50, mz: 50 });
    expect(squareCoords('m29_75.jm2')).toEqual({ mx: 29, mz: 75 });
    expect(squareCoords('free2play.csv')).toBeNull();
  });
});
```

Run: `cd web && npx vitest run src/data/gen/jm2.test.ts` - expect FAIL (module missing).

- [ ] **Step 3: Write the parser**

`web/src/data/gen/jm2.ts`:

```ts
// The `.jm2` map-square format, as the engine's own packer reads it
// (engine/server/tools/pack/map/Pack.js readMap). Pure string-to-data: the file IO lives in
// scripts/gen, so this half is covered by the web unit suite (plan ruling R2).
//
// Only what the generators need is kept: the land flag byte (the height, overlay and underlay
// tokens are rendering data), loc placements, and npc spawns.

export interface LocPlacement { level: number; x: number; z: number; id: number; shape: number; angle: number }
export interface NpcSpawn { level: number; x: number; z: number; id: number }

export interface MapSquare {
  mx: number; mz: number;
  /** `packLocal(level, x, z)` to the tile's `f` flags; 0 when the tile carries no `f` token. */
  land: Map<number, number>;
  locs: LocPlacement[];
  npcs: NpcSpawn[];
}

/** The engine's own packing: level in bits 12-13, local x in 6-11, local z in 0-5. */
export function packLocal(level: number, x: number, z: number): number {
  return (z & 0x3f) | ((x & 0x3f) << 6) | ((level & 0x3) << 12);
}

/** `m50_50.jm2` to `{ mx: 50, mz: 50 }`; null for anything else in the maps directory. */
export function squareCoords(fileName: string): { mx: number; mz: number } | null {
  const m = /^m(\d+)_(\d+)\.jm2$/.exec(fileName);
  return m ? { mx: Number(m[1]), mz: Number(m[2]) } : null;
}

type Section = 'MAP' | 'LOC' | 'NPC' | 'OBJ' | null;

export function parseJm2(text: string, mx: number, mz: number): MapSquare {
  const square: MapSquare = { mx, mz, land: new Map(), locs: [], npcs: [] };
  let section: Section = null;
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (line.length === 0) continue;
    if (line.startsWith('====')) {
      const name = line.replace(/=/g, '').trim();
      section = name === 'MAP' || name === 'LOC' || name === 'NPC' || name === 'OBJ' ? name : null;
      continue;
    }
    if (section === null || section === 'OBJ') continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const head = line.slice(0, colon).split(' ');
    if (head.length !== 3) continue;
    const level = Number(head[0]), x = Number(head[1]), z = Number(head[2]);
    const payload = line.slice(colon + 1).trim();
    if (section === 'MAP') {
      square.land.set(packLocal(level, x, z), flagsOf(payload));
    } else if (section === 'LOC') {
      const parts = payload.split(' ');
      square.locs.push({
        level, x, z,
        id: Number(parts[0]),
        // Pack.js: an omitted shape is 10 (CENTREPIECE_STRAIGHT) and an omitted angle is 0.
        shape: parts.length > 1 ? Number(parts[1]) : 10,
        angle: parts.length > 2 ? Number(parts[2]) : 0
      });
    } else {
      square.npcs.push({ level, x, z, id: Number(payload) });
    }
  }
  return square;
}

/** The `f<n>` token's value, or 0 when the tile has none. */
function flagsOf(payload: string): number {
  for (const token of payload.split(' ')) {
    if (token.charCodeAt(0) === 102) return Number(token.slice(1)) | 0;   // 'f'
  }
  return 0;
}
```

Run: expect PASS. Then delete the `byTile` lines from the test if they read awkwardly - keep the three real assertions.

- [ ] **Step 4: Config and pack parsers, test first**

`web/src/data/gen/configs.test.ts`:

```ts
import { expect, test } from 'vitest';
import { first, ops, parseConfigText, parsePack } from './configs';

const LOC_TEXT = `// a comment
[tree]
name=Tree
width=2
length=2
op1=Chop down
op3=hidden
category=tree
param=next_loc_stage,treestump2
param=ent,macro_ent_tree1

[bank_booth]
name=Bank booth
op2=Use-quickly
blockwalk=no
`;

test('a block keeps repeated keys in file order', () => {
  const blocks = parseConfigText(LOC_TEXT);
  expect([...blocks.keys()]).toEqual(['tree', 'bank_booth']);
  expect(blocks.get('tree')!.param).toEqual(['next_loc_stage,treestump2', 'ent,macro_ent_tree1']);
  expect(first(blocks.get('tree')!, 'name')).toBe('Tree');
  expect(first(blocks.get('tree')!, 'missing')).toBeUndefined();
});

test('ops collects op1..op5 and drops the hidden marker', () => {
  const blocks = parseConfigText(LOC_TEXT);
  expect(ops(blocks.get('tree')!)).toEqual(['Chop down']);
  expect(ops(blocks.get('bank_booth')!)).toEqual(['Use-quickly']);
});

test('a value containing = is kept whole', () => {
  const blocks = parseConfigText('[x]\ndesc=a=b\n');
  expect(first(blocks.get('x')!, 'desc')).toBe('a=b');
});

test('parsePack reads id=debugname', () => {
  const pack = parsePack('0=hans\n1=man\n\n2=man2\n');
  expect(pack.get(1)).toBe('man');
  expect(pack.size).toBe(3);
});
```

`web/src/data/gen/configs.ts`:

```ts
// `[block]` + `key=value` config text (`.loc`, `.npc`) and the `id=debugname` pack indexes,
// both from the pinned engine content clone. Pure string-to-data (plan ruling R2).

export type ConfigBlock = Record<string, string[]>;

/** Every `[name]` block in one config file, in file order. Keys may repeat (`param`, `op1..5`). */
export function parseConfigText(text: string): Map<string, ConfigBlock> {
  const out = new Map<string, ConfigBlock>();
  let block: ConfigBlock | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith('//')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      block = {};
      out.set(line.slice(1, -1), block);
      continue;
    }
    if (!block) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    (block[key] ??= []).push(value);
  }
  return out;
}

/** The first value for a key, or undefined. Most config keys appear at most once. */
export function first(block: ConfigBlock, key: string): string | undefined {
  return block[key]?.[0];
}

/** `op1..op5`, in order, skipping the `hidden` marker the content uses for a suppressed op. */
export function ops(block: ConfigBlock): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const value = first(block, `op${i}`);
    if (value && value !== 'hidden') out.push(value);
  }
  return out;
}

/** `engine/content/pack/*.pack`: one `<id>=<debugname>` per line. */
export function parsePack(text: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    out.set(Number(line.slice(0, eq)), line.slice(eq + 1));
  }
  return out;
}
```

Run: `cd web && npx vitest run src/data/gen/configs.test.ts` - expect PASS.

- [ ] **Step 5: The taxonomy, test first**

`web/src/data/gen/kinds.test.ts` - the fixtures are real blocks from the content tree, so a content bump that renames a category fails here rather than silently emptying the atlas.

```ts
import { expect, test } from 'vitest';
import { parseConfigText } from './configs';
import { isFishingSpot, KIND_META, locKind, variantOf } from './kinds';

const blocks = parseConfigText(`
[tree]
name=Tree
op1=Chop down
category=tree

[rock_copper]
name=Rocks
op1=Mine
category=mining_rock_normal

[bank_booth]
name=Bank booth
op2=Use-quickly

[furnace]
name=Furnace
category=smithing_furnace

[anvil]
name=Anvil
op1=Smith

[fire]
name=Fire
category=cooking_fire

[chair]
name=Chair
op1=Sit-on
`);

test('every kind is classified from the content, not from a hardcoded id list', () => {
  expect(locKind(blocks.get('tree')!)).toBe('tree');
  expect(locKind(blocks.get('rock_copper')!)).toBe('rock');
  expect(locKind(blocks.get('bank_booth')!)).toBe('bank');
  expect(locKind(blocks.get('furnace')!)).toBe('furnace');
  expect(locKind(blocks.get('anvil')!)).toBe('anvil');
  expect(locKind(blocks.get('fire')!)).toBe('fire');
});

test('anything not in the taxonomy is left out of the atlas', () => {
  expect(locKind(blocks.get('chair')!)).toBeNull();
});

test('a fishing spot is an npc config, matched by name or by a fishing op', () => {
  const npcs = parseConfigText(`
[0_43_51_saltfish]
name=Fishing spot
op1=Net
op2=Bait

[hans]
name=Hans
op1=Talk-to
`);
  expect(isFishingSpot(npcs.get('0_43_51_saltfish')!)).toBe(true);
  expect(isFishingSpot(npcs.get('hans')!)).toBe(false);
});

test('the variant is the debug name, which is what a script filters on', () => {
  expect(variantOf('0_43_51_saltfish')).toBe('saltfish');
  expect(variantOf('oaktree')).toBe('oaktree');
});

test('every kind declares the op a script interacts with', () => {
  for (const kind of Object.keys(KIND_META)) {
    expect(KIND_META[kind as keyof typeof KIND_META].op.length).toBeGreaterThan(0);
  }
});
```

`web/src/data/gen/kinds.ts`:

```ts
// Which content config is which `ResourceKind`, and what a script does with it. Driven by the
// `category=` and `name=` fields the content actually carries (verified against
// engine/content/scripts/**: 35 `category=tree`, 28 `category=mining_rock_normal`,
// 8 `category=cooking_fire`, 7 `category=smithing_furnace`, 6 `category=prayer_altar`),
// never by hardcoded ids, which drift on every content bump.
import type { ResourceKind } from '../../tasks/types';
import { first, ops, type ConfigBlock } from './configs';

export const KIND_META: Record<ResourceKind, { label: string; op: string; skill?: string }> = {
  tree: { label: 'tree', op: 'Chop down', skill: 'Woodcutting' },
  rock: { label: 'rock', op: 'Mine', skill: 'Mining' },
  'fishing-spot': { label: 'fishing spot', op: 'Net', skill: 'Fishing' },
  bank: { label: 'bank', op: 'Use-quickly' },
  furnace: { label: 'furnace', op: 'Smelt', skill: 'Smithing' },
  anvil: { label: 'anvil', op: 'Smith', skill: 'Smithing' },
  range: { label: 'range', op: 'Cook', skill: 'Cooking' },
  altar: { label: 'altar', op: 'Pray-at', skill: 'Prayer' },
  fire: { label: 'fire', op: 'Cook', skill: 'Cooking' }
};

const FISHING_OPS = new Set(['net', 'bait', 'lure', 'cage', 'harpoon', 'fish']);

/** The kind a loc config belongs to, or null when it is not something a script goes to. */
export function locKind(block: ConfigBlock): ResourceKind | null {
  const category = (first(block, 'category') ?? '').toLowerCase();
  const name = (first(block, 'name') ?? '').toLowerCase();
  const option = ops(block).map(o => o.toLowerCase());
  if (category === 'tree') return 'tree';
  if (category.startsWith('mining_rock')) return 'rock';
  if (category === 'smithing_furnace' || name === 'furnace') return 'furnace';
  if (category === 'cooking_fire' || name === 'fire') return 'fire';
  if (category === 'prayer_altar' || name.startsWith('altar')) return 'altar';
  if (name === 'anvil') return 'anvil';
  if (name === 'range' || name === 'cooking range') return 'range';
  if (name.startsWith('bank ') || option.includes('bank')) return 'bank';
  return null;
}

/** Fishing spots are NPCs, not locs (plan ruling R6). */
export function isFishingSpot(block: ConfigBlock): boolean {
  if ((first(block, 'name') ?? '').toLowerCase() === 'fishing spot') return true;
  return ops(block).some(o => FISHING_OPS.has(o.toLowerCase()));
}

/**
 * The variant a script filters on. Content debug names for map-square-scoped spawns carry
 * their square as a `<level>_<mx>_<mz>_` prefix (`0_43_51_saltfish`), which is placement
 * detail, not identity: strip it so one filter matches the same resource everywhere.
 */
export function variantOf(debugName: string): string {
  return debugName.replace(/^\d+_\d+_\d+_/, '');
}
```

Run: `cd web && npx vitest run src/data/gen/kinds.test.ts` - expect PASS.

- [ ] **Step 6: Clustering, test first**

`web/src/data/gen/clusters.test.ts`:

```ts
import { expect, test } from 'vitest';
import { clusterPlacements, type Placement } from './clusters';

const at = (x: number, z: number, variant = 'tree'): Placement => ({ kind: 'tree', variant, level: 0, x, z });

test('placements within the radius collapse into one cluster with a count and a radius', () => {
  const out = clusterPlacements([at(3200, 3200), at(3202, 3203), at(3204, 3200)], 6);
  expect(out).toHaveLength(1);
  expect(out[0].n).toBe(3);
  expect(out[0].r).toBeGreaterThan(0);
  // The centre is inside the hull of its members, not on one of them.
  expect(out[0].x).toBeGreaterThanOrEqual(3200);
  expect(out[0].x).toBeLessThanOrEqual(3204);
});

test('a placement past the radius starts its own cluster', () => {
  const out = clusterPlacements([at(3200, 3200), at(3230, 3200)], 6);
  expect(out).toHaveLength(2);
});

test('two variants never merge, however close they stand', () => {
  const out = clusterPlacements([at(3200, 3200, 'tree'), at(3200, 3201, 'oaktree')], 6);
  expect(out.map(c => c.variant).sort()).toEqual(['oaktree', 'tree']);
});

test('two levels never merge', () => {
  const out = clusterPlacements([at(3200, 3200), { ...at(3200, 3200), level: 1 }], 6);
  expect(out).toHaveLength(2);
});

test('the region is packed the way WorldExtras reports regionId', () => {
  const [cluster] = clusterPlacements([at(3222, 3218)], 6);
  expect(cluster.region).toBe(((3222 >> 6) << 8) | (3218 >> 6));
});

test('ids are stable across runs for the same input in any order', () => {
  const a = clusterPlacements([at(3200, 3200), at(3230, 3200)], 6);
  const b = clusterPlacements([at(3230, 3200), at(3200, 3200)], 6);
  expect(a.map(c => `${c.id}:${c.x},${c.z}`)).toEqual(b.map(c => `${c.id}:${c.x},${c.z}`));
});
```

`web/src/data/gen/clusters.ts`:

```ts
// Placements into clusters. 32 186 loc placements match the resource kinds; one row each would
// be a 900 KB atlas, and the budget is 250 KB (spec decision 2), so adjacent placements of the
// same kind and variant collapse into one row with a centre, a count and a radius.
import type { AtlasCluster, ResourceKind } from '../../tasks/types';

export interface Placement { kind: ResourceKind; variant: string; level: number; x: number; z: number }

/** Spec decision 3: 6 tiles. Two oaks 7 tiles apart are two places to walk to, not one. */
export const DEFAULT_RADIUS = 6;

interface Building { kind: ResourceKind; variant: string; level: number; sx: number; sz: number; n: number; members: Placement[] }

const bucketKey = (p: { kind: string; variant: string; level: number }, bx: number, bz: number): string =>
  `${p.kind}|${p.variant}|${p.level}|${bx}|${bz}`;

/**
 * Greedy agglomeration over a spatial hash: each placement joins the nearest open cluster of
 * its own kind, variant and level whose running centre is within `radius`, or starts one.
 * The input is sorted first, so the output does not depend on the order the map files were
 * read - a generator whose bytes move for no reason makes the committed-output drift check
 * (`scripts/build.ps1`) useless.
 */
export function clusterPlacements(items: Placement[], radius: number = DEFAULT_RADIUS): AtlasCluster[] {
  const sorted = [...items].sort((a, b) =>
    a.kind.localeCompare(b.kind) || a.variant.localeCompare(b.variant) || a.level - b.level || a.x - b.x || a.z - b.z);
  const buckets = new Map<string, Building[]>();
  const all: Building[] = [];
  const cell = Math.max(1, radius);

  for (const p of sorted) {
    const bx = Math.floor(p.x / cell), bz = Math.floor(p.z / cell);
    let best: Building | null = null;
    let bestDist = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const candidate of buckets.get(bucketKey(p, bx + dx, bz + dz)) ?? []) {
          const cx = candidate.sx / candidate.n, cz = candidate.sz / candidate.n;
          const dist = Math.max(Math.abs(cx - p.x), Math.abs(cz - p.z));
          if (dist <= radius && dist < bestDist) { best = candidate; bestDist = dist; }
        }
      }
    }
    if (best) {
      best.sx += p.x; best.sz += p.z; best.n += 1; best.members.push(p);
      continue;
    }
    const built: Building = { kind: p.kind, variant: p.variant, level: p.level, sx: p.x, sz: p.z, n: 1, members: [p] };
    all.push(built);
    const key = bucketKey(p, bx, bz);
    const list = buckets.get(key) ?? [];
    buckets.set(key, list);
    list.push(built);
  }

  return all.map((b, i) => {
    const x = Math.round(b.sx / b.n), z = Math.round(b.sz / b.n);
    const r = b.members.reduce((max, m) => Math.max(max, Math.abs(m.x - x), Math.abs(m.z - z)), 0);
    return {
      id: i + 1, kind: b.kind, variant: b.variant, level: b.level, x, z, n: b.n, r,
      region: ((x >> 6) << 8) | (z >> 6)
    } satisfies AtlasCluster;
  });
}

/**
 * The landmarks within 50 tiles of each cluster, as `near`. It is what makes a cluster
 * addressable in prose ("the trees by Lumbridge castle") without a second lookup, and it is
 * the field `travel` uses to decide whether a route connects the two.
 */
export function attachNearby(clusters: AtlasCluster[], landmarks: { id: string; level: number; x: number; z: number }[], radius = 50): AtlasCluster[] {
  return clusters.map(c => {
    const near = landmarks
      .filter(l => l.level === c.level && Math.max(Math.abs(l.x - c.x), Math.abs(l.z - c.z)) <= radius)
      .map(l => l.id);
    return near.length ? { ...c, near } : c;
  });
}
```

`clusters.test.ts` gains one more case:

```ts
test('attachNearby names the landmarks within 50 tiles and leaves the rest without the field', () => {
  const [close, far] = clusterPlacements([at(3220, 3218), at(3900, 3900)], 6);
  const [a, b] = attachNearby([close, far], [{ id: 'lumbridge', level: 0, x: 3222, z: 3218 }]);
  expect(a.near).toEqual(['lumbridge']);
  expect(b.near).toBeUndefined();
});
```

`scripts/gen/atlas.ts` calls it between building the clusters and the landmarks:

```ts
const landmarks = deriveLandmarks(clusters);
const withNearby = attachNearby(clusters, landmarks);
```

and puts `withNearby` in the atlas rather than `clusters`.

Run: `cd web && npx vitest run src/data/gen/clusters.test.ts` - expect PASS.

- [ ] **Step 7: Landmarks**

`web/src/data/gen/landmarks.ts`. Landmarks are mostly *derived* (every bank cluster is one), plus a small table of town centres a script or a route can name. Each town coordinate is checked by the generator against the parsed map data and fails the build if its square is not populated, so a wrong constant cannot ship quietly.

```ts
// Named places a route or a script can address. Banks are derived from the atlas itself; the
// towns are the free-to-play centres a player would name out loud. The generator asserts every
// town lands in a populated map square, so a typo here fails the build rather than producing a
// landmark that `travel.to({ landmark })` walks at forever.
import type { AtlasCluster, AtlasLandmark } from '../../tasks/types';

export const TOWNS: { id: string; name: string; level: number; x: number; z: number }[] = [
  { id: 'lumbridge', name: 'Lumbridge castle', level: 0, x: 3222, z: 3218 },
  { id: 'varrock-west', name: 'Varrock west bank', level: 0, x: 3185, z: 3436 },
  { id: 'varrock-east', name: 'Varrock east bank', level: 0, x: 3253, z: 3420 },
  { id: 'draynor', name: 'Draynor village bank', level: 0, x: 3092, z: 3243 },
  { id: 'al-kharid', name: 'Al Kharid', level: 0, x: 3293, z: 3174 },
  { id: 'falador-east', name: 'Falador east bank', level: 0, x: 3013, z: 3355 },
  { id: 'edgeville', name: 'Edgeville', level: 0, x: 3093, z: 3493 },
  { id: 'port-sarim', name: 'Port Sarim', level: 0, x: 3013, z: 3234 },
  { id: 'barbarian-village', name: 'Barbarian village', level: 0, x: 3082, z: 3420 }
];

/** One landmark per bank cluster, plus the towns. Ids are stable: `bank-<level>-<x>-<z>`. */
export function deriveLandmarks(clusters: AtlasCluster[]): AtlasLandmark[] {
  const banks = clusters
    .filter(c => c.kind === 'bank')
    .map(c => ({ id: `bank-${c.level}-${c.x}-${c.z}`, kind: 'bank' as const, name: `Bank (${c.x}, ${c.z})`, level: c.level, x: c.x, z: c.z }));
  const towns = TOWNS.map(t => ({ id: t.id, kind: 'town' as const, name: t.name, level: t.level, x: t.x, z: t.z }));
  return [...towns, ...banks].sort((a, b) => a.id.localeCompare(b.id));
}
```

- [ ] **Step 8: The generator's IO half**

`scripts/gen/lib/io.ts`:

```ts
// Shared file IO for the three generators. Bun only: nothing in web/ imports this.
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dir, '..', '..', '..');
export const CONTENT = join(ROOT, 'engine', 'content');
export const DATA = join(ROOT, 'web', 'src', 'data');

/** Every file under `dir` whose name matches, recursively, in a stable order. */
export function filesUnder(dir: string, match: RegExp): string[] {
  const out: string[] = [];
  const walk = (at: string): void => {
    for (const entry of readdirSync(at).sort()) {
      const full = join(at, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (match.test(entry)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

/** A sha256 over the generator's inputs: path plus bytes, in the order `filesUnder` returns. */
export function contentSha(files: string[]): string {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(relative(ROOT, file).replace(/\\/g, '/'));
    hash.update(readFileSync(file));
  }
  return hash.digest('hex').slice(0, 16);
}

export interface Budget { rawBytes: number; gzipBytes: number }

/** Fails loudly rather than committing an asset the shell would then fetch on every run. */
export function enforceBudget(name: string, bytes: Uint8Array, budget: Budget): void {
  const gz = gzipSync(bytes).byteLength;
  if (bytes.byteLength > budget.rawBytes || gz > budget.gzipBytes) {
    throw new Error(
      `${name} is ${bytes.byteLength} bytes raw / ${gz} gzipped; the budget is ` +
      `${budget.rawBytes} / ${budget.gzipBytes} (spec decision 2)`);
  }
  console.log(`${name}: ${bytes.byteLength} bytes raw, ${gz} gzipped (budget ${budget.rawBytes} / ${budget.gzipBytes})`);
}

/**
 * Write, or in `--check` mode compare. The check is what `scripts/build.ps1` runs: the atlas is
 * committed output, so a content bump that nobody regenerated has to fail the build rather than
 * leave the shell fetching an atlas that no longer describes the map.
 */
export function writeOrCheck(path: string, bytes: Uint8Array, check: boolean): void {
  if (!check) {
    writeFileSync(path, bytes);
    console.log(`wrote ${relative(ROOT, path)}`);
    return;
  }
  let existing: Uint8Array;
  try { existing = readFileSync(path); } catch { throw new Error(`${relative(ROOT, path)} is missing; run the generator`); }
  if (Buffer.compare(Buffer.from(existing), Buffer.from(bytes)) !== 0) {
    throw new Error(`${relative(ROOT, path)} is out of date with engine/content; re-run the generator and commit it`);
  }
  console.log(`${relative(ROOT, path)} is current`);
}
```

`scripts/gen/atlas.ts`:

```ts
// Builds web/src/data/atlas.json from the pinned engine/content clone (spec section 3.2,
// owner decision 1). Run by scripts/build.ps1 with --check; run by hand without it to
// regenerate after a content bump.
//
//   bun scripts/gen/atlas.ts            # write
//   bun scripts/gen/atlas.ts --check    # fail if the committed file is stale
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { first, parseConfigText, parsePack, type ConfigBlock } from '../../web/src/data/gen/configs';
import { parseJm2, squareCoords } from '../../web/src/data/gen/jm2';
import { isFishingSpot, KIND_META, locKind, variantOf } from '../../web/src/data/gen/kinds';
import { clusterPlacements, type Placement } from '../../web/src/data/gen/clusters';
import { deriveLandmarks, TOWNS } from '../../web/src/data/gen/landmarks';
import { CONTENT, contentSha, DATA, enforceBudget, filesUnder, writeOrCheck } from './lib/io';
import type { Atlas, ResourceKind } from '../../web/src/tasks/types';

const check = process.argv.includes('--check');

const configFiles = filesUnder(join(CONTENT, 'scripts'), /\.(loc|npc)$/);
const mapFiles = filesUnder(join(CONTENT, 'maps'), /\.jm2$/);
const packFiles = [join(CONTENT, 'pack', 'loc.pack'), join(CONTENT, 'pack', 'npc.pack')];

// 1. name -> kind, from the configs.
const locKinds = new Map<string, ResourceKind>();
const fishingNames = new Set<string>();
for (const file of configFiles) {
  const blocks: Map<string, ConfigBlock> = parseConfigText(readFileSync(file, 'utf8'));
  const isNpc = file.endsWith('.npc');
  for (const [name, block] of blocks) {
    if (isNpc) { if (isFishingSpot(block)) fishingNames.add(name); continue; }
    const kind = locKind(block);
    if (kind) locKinds.set(name, kind);
  }
}

// 2. id -> kind, through the packs.
const locById = new Map<number, { kind: ResourceKind; variant: string }>();
for (const [id, name] of parsePack(readFileSync(packFiles[0], 'utf8'))) {
  const kind = locKinds.get(name);
  if (kind) locById.set(id, { kind, variant: variantOf(name) });
}
const npcById = new Map<number, string>();
for (const [id, name] of parsePack(readFileSync(packFiles[1], 'utf8'))) {
  if (fishingNames.has(name)) npcById.set(id, variantOf(name));
}

// 3. Placements, from the maps.
const placements: Placement[] = [];
const populated = new Set<string>();
for (const file of mapFiles) {
  const coords = squareCoords(basename(file));
  if (!coords) continue;
  populated.add(`${coords.mx}_${coords.mz}`);
  const square = parseJm2(readFileSync(file, 'utf8'), coords.mx, coords.mz);
  for (const loc of square.locs) {
    const meta = locById.get(loc.id);
    if (!meta) continue;
    placements.push({ kind: meta.kind, variant: meta.variant, level: loc.level, x: (coords.mx << 6) + loc.x, z: (coords.mz << 6) + loc.z });
  }
  for (const npc of square.npcs) {
    const variant = npcById.get(npc.id);
    if (!variant) continue;
    placements.push({ kind: 'fishing-spot', variant, level: npc.level, x: (coords.mx << 6) + npc.x, z: (coords.mz << 6) + npc.z });
  }
}

// 4. A town whose square carries no map file is a typo, not a place.
for (const town of TOWNS) {
  if (!populated.has(`${town.x >> 6}_${town.z >> 6}`)) {
    throw new Error(`landmark "${town.id}" at (${town.x}, ${town.z}) is in map square ${town.x >> 6}_${town.z >> 6}, which has no .jm2`);
  }
}

const clusters = clusterPlacements(placements);
const atlas: Atlas = {
  version: 1,
  source: { contentSha: contentSha([...configFiles, ...mapFiles, ...packFiles]), generatedAt: new Date().toISOString().slice(0, 10) },
  kinds: KIND_META,
  clusters,
  // v1 plans straight between landmarks (spec decision 11); Tutorial Island's ladders and
  // gates arrive as `interact` waypoints in Task 13.
  routes: [],
  landmarks: deriveLandmarks(clusters)
};

console.log(`${placements.length} placements -> ${clusters.length} clusters, ${atlas.landmarks.length} landmarks`);
const bytes = new TextEncoder().encode(JSON.stringify(atlas));
enforceBudget('atlas.json', bytes, { rawBytes: 250 * 1024, gzipBytes: 80 * 1024 });
writeOrCheck(join(DATA, 'atlas.json'), bytes, check);
```

Note `generatedAt` is deliberately date-only: a full timestamp would make the committed file differ on every regeneration and turn the drift check into noise.

- [ ] **Step 9: Generate it, and sanity-check the output**

```bash
cd /c/projects/osrs_test && ~/.bun/bin/bun scripts/gen/atlas.ts
```

Expected: a placement count in the tens of thousands, a cluster count in the low thousands, and a size line inside budget. Then check by hand that the four clusters spec section 3.2 names are present:

```bash
cd /c/projects/osrs_test && node -e "const a=require('./web/src/data/atlas.json');const near=(k,x,z)=>a.clusters.filter(c=>c.kind===k&&Math.abs(c.x-x)<40&&Math.abs(c.z-z)<40).length;console.log('lumbridge trees',near('tree',3222,3218),'varrock east rocks',near('rock',3285,3365),'draynor trees',near('tree',3087,3235),'tutorial island',a.clusters.filter(c=>((c.x>>6)===48&&(c.z>>6)===48)).length)"
```

Every number must be non-zero. If `tutorial island` is zero, the tutorial's own tree and fishing spot are spawned by script rather than placed in the map, and Task 13 relies on `find.nearest` falling through to the scene layer for them - record that in the ledger and carry on.

- [ ] **Step 10: The runtime loader, test first**

`web/src/tasks/atlas.test.ts`:

```ts
import { expect, test, vi } from 'vitest';
import { createAtlasLoader } from './atlas';
import type { Atlas } from './types';

const ATLAS: Atlas = {
  version: 1, source: { contentSha: 'x', generatedAt: '2026-09-06' },
  kinds: { tree: { label: 'tree', op: 'Chop down' } } as Atlas['kinds'],
  clusters: [
    { id: 1, kind: 'tree', variant: 'tree', level: 0, x: 3200, z: 3200, n: 4, r: 3, region: 0 },
    { id: 2, kind: 'tree', variant: 'oaktree', level: 0, x: 3210, z: 3200, n: 2, r: 1, region: 0 },
    { id: 3, kind: 'tree', variant: 'tree', level: 1, x: 3201, z: 3200, n: 1, r: 0, region: 0 }
  ],
  landmarks: [{ id: 'lumbridge', kind: 'town', name: 'Lumbridge castle', level: 0, x: 3222, z: 3218 }],
  routes: []
};

const loader = (fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ATLAS })) =>
  ({ fetchImpl, loader: createAtlasLoader({ url: '/assets/atlas.json', fetchImpl }) });

test('the atlas is fetched once, however many callers ask for it', async () => {
  const { fetchImpl, loader: l } = loader();
  await Promise.all([l.load(), l.load()]);
  await l.load();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('a failed fetch answers null and is retried on the next call', async () => {
  const fetchImpl = vi.fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ ok: true, json: async () => ATLAS });
  const l = createAtlasLoader({ url: '/a.json', fetchImpl });
  expect(await l.load()).toBeNull();
  expect(await l.load()).not.toBeNull();
});

test('nearestCluster picks by distance, and never crosses a level', async () => {
  const { loader: l } = loader();
  const atlas = (await l.load())!;
  expect(l.nearestCluster(atlas, 'tree', { x: 3208, z: 3200, level: 0 })!.id).toBe(2);
  expect(l.nearestCluster(atlas, 'tree', { x: 3201, z: 3200, level: 1 })!.id).toBe(3);
});

test('a variant filter matches the variant, not the kind', async () => {
  const { loader: l } = loader();
  const atlas = (await l.load())!;
  expect(l.nearestCluster(atlas, 'tree', { x: 3200, z: 3200, level: 0 }, { variant: 'oaktree' })!.id).toBe(2);
  expect(l.nearestCluster(atlas, 'tree', { x: 3200, z: 3200, level: 0 }, { variant: /oak/ })!.id).toBe(2);
});

test('maxDistance refuses a cluster that is further away rather than returning the least bad one', async () => {
  const { loader: l } = loader();
  const atlas = (await l.load())!;
  expect(l.nearestCluster(atlas, 'tree', { x: 3400, z: 3400, level: 0 }, { maxDistance: 20 })).toBeNull();
});
```

`web/src/tasks/atlas.ts`:

```ts
// The atlas at runtime: fetched once per Worker, on the first call that needs it, and cached.
// It is a Vite `?url` asset (plan ruling R5), so it costs the shell's first paint nothing and
// arrives content-hashed - a regenerated atlas is a new URL, never a stale cache entry.
import atlasUrl from '../data/atlas.json?url';
import type { Atlas, AtlasCluster, AtlasLandmark, FindOpts, ResourceKind } from './types';

export interface AtlasLoaderDeps {
  url?: string;
  fetchImpl?: typeof fetch;
}

export interface AtlasLoader {
  /** The atlas, or null when it could not be fetched. Retries on the next call. */
  load(): Promise<Atlas | null>;
  /** What `load` already resolved, without starting a fetch. Null until it has. */
  peek(): Atlas | null;
  nearestCluster(atlas: Atlas, kind: ResourceKind, from: { x: number; z: number; level: number }, opts?: FindOpts): AtlasCluster | null;
  landmark(atlas: Atlas, id: string): AtlasLandmark | null;
}

const matches = (variant: string, want: FindOpts['variant']): boolean =>
  want === undefined ? true : typeof want === 'string' ? variant === want : want.test(variant);

export function createAtlasLoader(deps: AtlasLoaderDeps = {}): AtlasLoader {
  const url = deps.url ?? atlasUrl;
  const doFetch = deps.fetchImpl ?? ((input: RequestInfo | URL) => fetch(input));
  let atlas: Atlas | null = null;
  let inFlight: Promise<Atlas | null> | null = null;

  return {
    peek: () => atlas,
    async load() {
      if (atlas) return atlas;
      // One fetch for every concurrent caller; a failure clears the promise so the next call
      // tries again rather than caching "the network was down once".
      inFlight ??= (async () => {
        try {
          const res = await doFetch(url);
          if (!res.ok) throw new Error(`atlas fetch failed: ${res.status}`);
          atlas = (await res.json()) as Atlas;
          return atlas;
        } catch {
          return null;
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    },
    nearestCluster(a, kind, from, opts = {}) {
      let best: AtlasCluster | null = null;
      let bestDist = Infinity;
      for (const c of a.clusters) {
        if (c.kind !== kind || c.level !== from.level || !matches(c.variant, opts.variant)) continue;
        const dist = Math.max(Math.abs(c.x - from.x), Math.abs(c.z - from.z));
        if (opts.maxDistance !== undefined && dist > opts.maxDistance) continue;
        if (dist < bestDist) { best = c; bestDist = dist; }
      }
      return best;
    },
    landmark: (a, id) => a.landmarks.find(l => l.id === id) ?? null
  };
}
```

Run: `cd web && npx vitest run src/tasks/atlas.test.ts` - expect PASS.

- [ ] **Step 11: Check the atlas on every build**

`scripts/build.ps1`, a new step between the web build and the client build:

```powershell
# --- 1b. Generated map data must match the pinned engine content --------------
# atlas.json and collision.bin are committed output of scripts/gen/*.ts. A content bump that
# nobody regenerated would leave the shell fetching data that no longer describes the map, and
# nothing else in the build would notice.
Write-Host "`n== Checking generated map data (scripts/gen)"
Push-Location $root
try {
    & $bun 'scripts/gen/atlas.ts' '--check'
    if ($LASTEXITCODE -ne 0) { throw 'atlas.json is out of date with engine/content (run: bun scripts/gen/atlas.ts)' }
} finally {
    Pop-Location
}
```

Run it once to prove it passes on the committed file: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build.ps1` (or just the two `bun` lines while iterating).

- [ ] **Step 12: Verify and commit**

```bash
cd web && npm run typecheck && npm run lint && npx vitest run
```

```bash
git add web/src/data/gen web/src/data/atlas.json web/src/tasks/atlas.ts web/src/tasks/atlas.test.ts web/src/tasks/types.ts scripts/gen scripts/build.ps1
git -c core.safecrlf=false commit -m "$(cat <<'EOF'
feat(tasks): generate and load a static resource atlas from the pinned content

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
EOF
)"
```

---

### Task 4: Collision data and a real pathfinder

The stub in `web/src/vendor/rs-sdk/sdk/pathfinding.ts` answers "walkable" everywhere, so `findLongPath` dead-reckons between scenes and the vendored `walkTo`'s door handling never fires. This task builds the collision data, swaps the stub bodies for real ones, and changes nothing else: the upstream signatures already match, which is why `index.ts` and `actions.ts` need no edit.

**How the engine derives collision** (`engine/server/src/engine/GameMap.ts:203-285`, `routefinder/flags.ts:120`), which this generator mirrors:

- Land flag bit `0x1` (`BLOCK_MAP_SQUARE`) blocks the tile. Bits `0x2` `LINK_BELOW`, `0x4` `REMOVE_ROOFS`, `0x8` `VISIBLE_BELOW`, `0x10` `NOT_LOW_DETAIL` do not.
- Bridges: `bridged = (level === 1 ? thisTileFlags : flagsAt(level 1, same x/z)) & 0x2`; when bridged the tile's collision belongs to `level - 1`. A level-0 tile under a bridge is therefore *not* blocked by the bridge above it.
- A loc blocks only when its config says `blockwalk` (default **true**; only 296 configs say `blockwalk=no`), and then according to its shape's layer: **WALL** shapes 0-3 block tile edges, **WALL_DECOR** 4-8 never block, **GROUND** 9-21 block a `width x length` footprint (extents swap for angles 1 and 3), **GROUND_DECOR** 22 blocks the tile only when the config's `active` is 1.
- `active` defaults to `-1` and is then derived (`LocType.postDecode`): 1 when the config has models with no shapes (or shape[0] === 10), or when it has any op; otherwise 0.

**Plan ruling R7 (recorded here, written into the spec by Task 15).** Spec section 3.3 says "BFS in a 2 048 x 2 048 window centred between source and destination". A 4 M-cell frontier costs 16 MB of typed array per query and is far larger than any leg needs, because `travel.to` splits a plan into legs of at most 60 tiles. **Ruling:** the BFS window is the source-destination bounding box padded by 128 tiles and capped at 1 024 x 1 024. *Cost if wrong:* a route whose only detour is wider than 128 tiles reports a partial path instead of a full one, which `walkTo` walks and then re-queries from the new position - so it degrades to iterative progress rather than failing.

**Files:**
- Create: `web/src/data/gen/collisionBuild.ts`, `web/src/data/gen/collisionFile.ts`, `scripts/gen/collision.ts`, `web/src/tasks/collision.ts`, `web/src/data/collision.bin` (generated), `web/src/data/doors.json` (generated)
- Modify: `web/src/vendor/rs-sdk/sdk/pathfinding.ts`, `web/src/vendor/PATCHES.md`, `scripts/build.ps1`
- Test: `web/src/data/gen/collisionBuild.test.ts`, `web/src/data/gen/collisionFile.test.ts`, `web/src/vendor/rs-sdk/sdk/pathfinding.test.ts`, `web/src/tasks/collision.test.ts`

**Interfaces:**
- Consumes: `parseJm2`, `packLocal`, `MapSquare`, `LocPlacement` (Task 3); `parseConfigText`, `parsePack`, `first`, `ops` (Task 3).
- Produces:
  - `web/src/data/gen/collisionBuild.ts`: `type LocInfo = { width: number; length: number; blockwalk: boolean; active: boolean; openable: boolean }`, `layerOf(shape: number): 'wall' | 'walldecor' | 'ground' | 'grounddecor'`, `buildSquare(square: MapSquare, locs: Map<number, LocInfo>): { levels: Map<number, Uint8Array>; doors: DoorRow[] }`, `type DoorRow = { level: number; x: number; z: number; shape: number; angle: number }`.
  - `web/src/data/gen/collisionFile.ts`: `encodeCollision(squares: EncodedSquare[]): Uint8Array`, `decodeCollision(buffer: ArrayBuffer): CollisionGrid`, `type EncodedSquare = { mx: number; mz: number; levels: Map<number, Uint8Array> }`, `interface CollisionGrid { blocked(level, x, z): boolean; hasSquare(level, x, z): boolean; squareCount: number }`.
  - `web/src/vendor/rs-sdk/sdk/pathfinding.ts`: `initPathfinding(data: PathfindingData | null): void` where `PathfindingData = { grid: CollisionGrid; doors: DoorInfo[] }`; every other export keeps its current signature.
  - `web/src/tasks/collision.ts`: `createCollisionLoader(deps): { load(): Promise<boolean>; ready(): boolean }`.

- [ ] **Step 1: Write the failing bitset-build test**

`web/src/data/gen/collisionBuild.test.ts`:

```ts
import { expect, test } from 'vitest';
import { parseJm2, packLocal } from './jm2';
import { buildSquare, layerOf, type LocInfo } from './collisionBuild';

const plain: LocInfo = { width: 1, length: 1, blockwalk: true, active: true, openable: false };
const LOCS = new Map<number, LocInfo>([
  [100, { ...plain, width: 2, length: 2 }],                       // a tree: 2x2, blocks
  [101, { ...plain, blockwalk: false }],                          // a flower: never blocks
  [102, { ...plain, width: 1, length: 3 }],                       // an oblong, to test the swap
  [103, { ...plain, openable: true }],                            // a door: a wall shape
  [104, { ...plain, active: false }]                              // ground decor that does not block
]);

const bit = (bits: Uint8Array, x: number, z: number): boolean => {
  const i = (x << 6) | z;
  return (bits[i >> 3] & (1 << (i & 7))) !== 0;
};

test('a land tile blocks only on flag bit 1', () => {
  const square = parseJm2(['==== MAP ====', '0 1 1: f1', '0 2 2: f4', '0 3 3: f24'].join('\n'), 50, 50);
  const { levels } = buildSquare(square, LOCS);
  expect(bit(levels.get(0)!, 1, 1)).toBe(true);
  expect(bit(levels.get(0)!, 2, 2)).toBe(false);
  // 24 is 0x18: REMOVE_ROOFS | VISIBLE_BELOW, no BLOCK_MAP_SQUARE bit.
  expect(bit(levels.get(0)!, 3, 3)).toBe(false);
});

test('a bridge tile moves the level below, not the level it is drawn on', () => {
  const square = parseJm2(['==== MAP ====', '1 4 4: f2', '1 5 5: f1'].join('\n'), 50, 50);
  const { levels } = buildSquare(square, LOCS);
  // level 1 with LINK_BELOW and no block bit: nothing is written anywhere.
  expect(bit(levels.get(1)!, 4, 4)).toBe(false);
  expect(bit(levels.get(0)!, 4, 4)).toBe(false);
  expect(bit(levels.get(1)!, 5, 5)).toBe(true);
});

test('a ground loc blocks its whole footprint', () => {
  const square = parseJm2(['==== LOC ====', '0 10 10: 100 10 0'].join('\n'), 50, 50);
  const { levels } = buildSquare(square, LOCS);
  expect(bit(levels.get(0)!, 10, 10)).toBe(true);
  expect(bit(levels.get(0)!, 11, 11)).toBe(true);
  expect(bit(levels.get(0)!, 12, 10)).toBe(false);
});

test('a footprint swaps its extents for angles 1 and 3', () => {
  const straight = buildSquare(parseJm2(['==== LOC ====', '0 20 20: 102 10 0'].join('\n'), 50, 50), LOCS);
  const turned = buildSquare(parseJm2(['==== LOC ====', '0 20 20: 102 10 1'].join('\n'), 50, 50), LOCS);
  expect(bit(straight.levels.get(0)!, 20, 22)).toBe(true);
  expect(bit(straight.levels.get(0)!, 22, 20)).toBe(false);
  expect(bit(turned.levels.get(0)!, 22, 20)).toBe(true);
  expect(bit(turned.levels.get(0)!, 20, 22)).toBe(false);
});

test('blockwalk=no and inactive ground decor leave the tile walkable', () => {
  const { levels } = buildSquare(parseJm2(['==== LOC ====', '0 30 30: 101 10 0', '0 31 31: 104 22 0'].join('\n'), 50, 50), LOCS);
  expect(bit(levels.get(0)!, 30, 30)).toBe(false);
  expect(bit(levels.get(0)!, 31, 31)).toBe(false);
});

test('a wall shape stays out of the bitset and becomes a door row instead (ruling R1)', () => {
  const { levels, doors } = buildSquare(parseJm2(['==== LOC ====', '0 40 40: 103 0 2'].join('\n'), 50, 50), LOCS);
  expect(bit(levels.get(0)!, 40, 40)).toBe(false);
  expect(doors).toEqual([{ level: 0, x: 40, z: 40, shape: 0, angle: 2 }]);
});

test('layerOf follows the engine s shape table', () => {
  expect([0, 1, 2, 3].map(layerOf)).toEqual(['wall', 'wall', 'wall', 'wall']);
  expect([4, 8].map(layerOf)).toEqual(['walldecor', 'walldecor']);
  expect([9, 10, 21].map(layerOf)).toEqual(['ground', 'ground', 'ground']);
  expect(layerOf(22)).toBe('grounddecor');
});
```

Run: `cd web && npx vitest run src/data/gen/collisionBuild.test.ts` - expect FAIL (module missing).

- [ ] **Step 2: Build the bitsets**

`web/src/data/gen/collisionBuild.ts`:

```ts
// One walkability bit per tile per level, mirroring what the engine writes into its own
// collision map when it loads a map square (engine/server/src/engine/GameMap.ts:203-285).
//
// Walls are deliberately absent (plan ruling R1): a wall blocks a tile EDGE, which a per-tile
// bit cannot express, and the client's own routefinder - which every leg is handed to - knows
// them. Openable walls come out as door rows instead, which is what the vendored walkTo needs.
import { packLocal, type MapSquare } from './jm2';

export interface LocInfo { width: number; length: number; blockwalk: boolean; active: boolean; openable: boolean }
export interface DoorRow { level: number; x: number; z: number; shape: number; angle: number }

const BLOCK_MAP_SQUARE = 0x1;
const LINK_BELOW = 0x2;
/** 64 x 64 tiles, one bit each. */
const SQUARE_BYTES = 512;

export type LocLayer = 'wall' | 'walldecor' | 'ground' | 'grounddecor';

/** `routefinder/flags.ts` `locShapeLayer`, as a range test over the same shape numbering. */
export function layerOf(shape: number): LocLayer {
  if (shape <= 3) return 'wall';
  if (shape <= 8) return 'walldecor';
  if (shape <= 21) return 'ground';
  return 'grounddecor';
}

export function buildSquare(square: MapSquare, locs: Map<number, LocInfo>): { levels: Map<number, Uint8Array>; doors: DoorRow[] } {
  const levels = new Map<number, Uint8Array>();
  const doors: DoorRow[] = [];
  const bits = (level: number): Uint8Array => {
    const existing = levels.get(level);
    if (existing) return existing;
    const made = new Uint8Array(SQUARE_BYTES);
    levels.set(level, made);
    return made;
  };
  // Every level is present in the output even when empty, so a caller can tell "level 2 of this
  // square is open" from "this square has no level 2" without a second table.
  for (let level = 0; level < 4; level++) bits(level);

  const flagsAt = (level: number, x: number, z: number): number => square.land.get(packLocal(level, x, z)) ?? 0;
  /** Which level a tile's collision actually belongs to, following the bridge rule. */
  const actualLevel = (level: number, x: number, z: number): number => {
    const link = level === 1 ? flagsAt(1, x, z) : flagsAt(1, x, z);
    return (link & LINK_BELOW) === LINK_BELOW ? level - 1 : level;
  };
  const set = (level: number, x: number, z: number): void => {
    if (level < 0 || level > 3 || x < 0 || x > 63 || z < 0 || z > 63) return;
    const i = (x << 6) | z;
    bits(level)[i >> 3] |= 1 << (i & 7);
  };

  for (const [packed, flags] of square.land) {
    if ((flags & BLOCK_MAP_SQUARE) !== BLOCK_MAP_SQUARE) continue;
    const z = packed & 0x3f, x = (packed >> 6) & 0x3f, level = (packed >> 12) & 0x3;
    set(actualLevel(level, x, z), x, z);
  }

  for (const loc of square.locs) {
    const info = locs.get(loc.id);
    if (!info) continue;
    const layer = layerOf(loc.shape);
    if (layer === 'wall' && info.openable) doors.push({ level: loc.level, x: loc.x, z: loc.z, shape: loc.shape, angle: loc.angle });
    if (!info.blockwalk) continue;
    const level = actualLevel(loc.level, loc.x, loc.z);
    if (layer === 'ground') {
      // The engine swaps the extents for LocAngle.NORTH (1) and SOUTH (3).
      const turned = loc.angle === 1 || loc.angle === 3;
      const xExtent = turned ? info.length : info.width;
      const zExtent = turned ? info.width : info.length;
      for (let dx = 0; dx < xExtent; dx++) for (let dz = 0; dz < zExtent; dz++) set(level, loc.x + dx, loc.z + dz);
    } else if (layer === 'grounddecor' && info.active) {
      set(level, loc.x, loc.z);
    }
  }

  return { levels, doors };
}
```

Note the `actualLevel` helper reads level 1's `LINK_BELOW` for every level, which is exactly what the engine does (`level === 1 ? land : lands[packCoord(x, z, 1)]` - both branches read the same tile at level 1). Keep it as one expression rather than the engine's redundant ternary.

Run: expect PASS. Then **mutate to prove the tests bite**: change `BLOCK_MAP_SQUARE` to `0x4` and confirm the first test fails; change the extent swap to never swap and confirm the fourth fails. Revert both.

- [ ] **Step 3: The file format, test first**

`web/src/data/gen/collisionFile.test.ts`:

```ts
import { expect, test } from 'vitest';
import { decodeCollision, encodeCollision } from './collisionFile';

const withTile = (x: number, z: number): Uint8Array => {
  const bits = new Uint8Array(512);
  const i = (x << 6) | z;
  bits[i >> 3] |= 1 << (i & 7);
  return bits;
};

test('a round trip preserves every blocked tile at its absolute coordinates', () => {
  const bytes = encodeCollision([{ mx: 50, mz: 50, levels: new Map([[0, withTile(10, 20)]]) }]);
  const grid = decodeCollision(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  expect(grid.blocked(0, (50 << 6) + 10, (50 << 6) + 20)).toBe(true);
  expect(grid.blocked(0, (50 << 6) + 11, (50 << 6) + 20)).toBe(false);
});

test('a square that is not in the file reads as unallocated, not as open', () => {
  const bytes = encodeCollision([{ mx: 50, mz: 50, levels: new Map([[0, new Uint8Array(512)]]) }]);
  const grid = decodeCollision(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  expect(grid.hasSquare(0, (50 << 6) + 1, (50 << 6) + 1)).toBe(true);
  expect(grid.hasSquare(0, (99 << 6) + 1, (99 << 6) + 1)).toBe(false);
  // An unallocated square answers "not blocked" so a caller that ignores hasSquare still walks.
  expect(grid.blocked(0, (99 << 6) + 1, (99 << 6) + 1)).toBe(false);
});

test('a level the square does not carry is unallocated', () => {
  const bytes = encodeCollision([{ mx: 50, mz: 50, levels: new Map([[0, new Uint8Array(512)]]) }]);
  const grid = decodeCollision(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  expect(grid.hasSquare(2, (50 << 6) + 1, (50 << 6) + 1)).toBe(false);
});

test('the header names itself, so a wrong file fails loudly', () => {
  expect(() => decodeCollision(new ArrayBuffer(8))).toThrow(/not a collision file/i);
});

test('squares stay in a stable order regardless of input order', () => {
  const a = encodeCollision([{ mx: 51, mz: 1, levels: new Map([[0, withTile(1, 1)]]) }, { mx: 50, mz: 2, levels: new Map([[0, withTile(2, 2)]]) }]);
  const b = encodeCollision([{ mx: 50, mz: 2, levels: new Map([[0, withTile(2, 2)]]) }, { mx: 51, mz: 1, levels: new Map([[0, withTile(1, 1)]]) }]);
  expect([...a]).toEqual([...b]);
});
```

`web/src/data/gen/collisionFile.ts`:

```ts
// `collision.bin`: one bit per tile per level over the populated map squares, with a square
// index so empty squares cost nothing. Read by the Worker on the first `travel.to`, written by
// scripts/gen/collision.ts. Budget: 1 MB raw, 400 KB gzipped (spec decision 2); 487 squares x
// 4 levels x 512 bytes is 997 KB, so the index is what keeps it inside.
//
// Layout, little-endian:
//   0  u32   magic 'ISCB'
//   4  u8    version (1)
//   5  u8    reserved (0)
//   6  u16   square count
//   8  n x 4 index rows: u8 mx, u8 mz, u8 level mask, u8 reserved
//   ...      payload: for each square, for each set level bit ascending, 512 bytes

export interface EncodedSquare { mx: number; mz: number; levels: Map<number, Uint8Array> }

export interface CollisionGrid {
  /** Absolute tile coordinates. False for a tile in a square the file does not carry. */
  blocked(level: number, x: number, z: number): boolean;
  /** Whether the file carries this square at this level at all. */
  hasSquare(level: number, x: number, z: number): boolean;
  readonly squareCount: number;
}

const MAGIC = 0x42435349;        // 'ISCB' little-endian
const SQUARE_BYTES = 512;
const HEADER_BYTES = 8;
const INDEX_BYTES = 4;

export function encodeCollision(squares: EncodedSquare[]): Uint8Array {
  const sorted = [...squares].sort((a, b) => a.mx - b.mx || a.mz - b.mz);
  const rows = sorted.map(s => {
    // A level of all zeroes is dropped: three quarters of the map has nothing above level 0,
    // and an empty level costs 512 bytes for no information.
    const levels = [...s.levels.entries()].filter(([, bits]) => bits.some(b => b !== 0)).sort((a, b) => a[0] - b[0]);
    return { mx: s.mx, mz: s.mz, levels };
  }).filter(r => r.levels.length > 0);

  const payloadBytes = rows.reduce((n, r) => n + r.levels.length * SQUARE_BYTES, 0);
  const out = new Uint8Array(HEADER_BYTES + rows.length * INDEX_BYTES + payloadBytes);
  const view = new DataView(out.buffer);
  view.setUint32(0, MAGIC, true);
  out[4] = 1;
  view.setUint16(6, rows.length, true);
  let index = HEADER_BYTES;
  let payload = HEADER_BYTES + rows.length * INDEX_BYTES;
  for (const row of rows) {
    out[index] = row.mx;
    out[index + 1] = row.mz;
    out[index + 2] = row.levels.reduce((mask, [level]) => mask | (1 << level), 0);
    index += INDEX_BYTES;
    for (const [, bits] of row.levels) { out.set(bits, payload); payload += SQUARE_BYTES; }
  }
  return out;
}

export function decodeCollision(buffer: ArrayBuffer): CollisionGrid {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (bytes.byteLength < HEADER_BYTES || view.getUint32(0, true) !== MAGIC) {
    throw new Error('not a collision file (bad magic)');
  }
  const count = view.getUint16(6, true);
  /** `(mx << 8) | mz` to the offsets of its levels, one entry per level bit that is set. */
  const squares = new Map<number, { mask: number; offsets: number[] }>();
  let payload = HEADER_BYTES + count * INDEX_BYTES;
  for (let i = 0; i < count; i++) {
    const at = HEADER_BYTES + i * INDEX_BYTES;
    const mask = bytes[at + 2];
    const offsets: number[] = [];
    for (let level = 0; level < 4; level++) {
      if ((mask & (1 << level)) === 0) { offsets.push(-1); continue; }
      offsets.push(payload);
      payload += SQUARE_BYTES;
    }
    squares.set((bytes[at] << 8) | bytes[at + 1], { mask, offsets });
  }

  const offsetOf = (level: number, x: number, z: number): number => {
    if (level < 0 || level > 3) return -1;
    return squares.get(((x >> 6) << 8) | (z >> 6))?.offsets[level] ?? -1;
  };

  return {
    squareCount: count,
    hasSquare: (level, x, z) => offsetOf(level, x, z) >= 0,
    blocked(level, x, z) {
      const offset = offsetOf(level, x, z);
      if (offset < 0) return false;
      const i = ((x & 0x3f) << 6) | (z & 0x3f);
      return (bytes[offset + (i >> 3)] & (1 << (i & 7))) !== 0;
    }
  };
}
```

Run: `cd web && npx vitest run src/data/gen/collisionFile.test.ts` - expect PASS.

- [ ] **Step 4: The collision generator**

`scripts/gen/collision.ts`:

```ts
// Builds web/src/data/collision.bin and web/src/data/doors.json from the pinned content clone
// (spec section 3.3). Same shape as scripts/gen/atlas.ts:
//
//   bun scripts/gen/collision.ts            # write
//   bun scripts/gen/collision.ts --check    # fail if the committed files are stale
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { first, ops, parseConfigText, parsePack, type ConfigBlock } from '../../web/src/data/gen/configs';
import { parseJm2, squareCoords } from '../../web/src/data/gen/jm2';
import { buildSquare, type DoorRow, type LocInfo } from '../../web/src/data/gen/collisionBuild';
import { encodeCollision, type EncodedSquare } from '../../web/src/data/gen/collisionFile';
import { CONTENT, contentSha, DATA, enforceBudget, filesUnder, writeOrCheck } from './lib/io';

const check = process.argv.includes('--check');

const configFiles = filesUnder(join(CONTENT, 'scripts'), /\.loc$/);
const mapFiles = filesUnder(join(CONTENT, 'maps'), /\.jm2$/);
const packFile = join(CONTENT, 'pack', 'loc.pack');

/** `LocType`'s defaults: width 1, length 1, blockwalk true, active derived in postDecode. */
function infoOf(block: ConfigBlock): LocInfo {
  const option = ops(block);
  const activeRaw = first(block, 'active');
  const hasModel = block.model !== undefined || block.model1 !== undefined;
  return {
    width: Number(first(block, 'width') ?? 1),
    length: Number(first(block, 'length') ?? 1),
    blockwalk: first(block, 'blockwalk') !== 'no',
    active: activeRaw !== undefined ? activeRaw === 'yes' || activeRaw === '1' : option.length > 0 || hasModel,
    openable: option.some(o => /^open$/i.test(o))
  };
}

const byName = new Map<string, LocInfo>();
for (const file of configFiles) {
  for (const [name, block] of parseConfigText(readFileSync(file, 'utf8'))) byName.set(name, infoOf(block));
}
const locs = new Map<number, LocInfo>();
for (const [id, name] of parsePack(readFileSync(packFile, 'utf8'))) {
  const info = byName.get(name);
  if (info) locs.set(id, info);
}

const squares: EncodedSquare[] = [];
const doors: DoorRow[] = [];
for (const file of mapFiles) {
  const coords = squareCoords(basename(file));
  if (!coords) continue;
  const parsed = parseJm2(readFileSync(file, 'utf8'), coords.mx, coords.mz);
  const built = buildSquare(parsed, locs);
  squares.push({ mx: coords.mx, mz: coords.mz, levels: built.levels });
  for (const door of built.doors) {
    doors.push({ ...door, x: (coords.mx << 6) + door.x, z: (coords.mz << 6) + door.z });
  }
}

const bin = encodeCollision(squares);
console.log(`${squares.length} squares, ${doors.length} doors`);
enforceBudget('collision.bin', bin, { rawBytes: 1024 * 1024, gzipBytes: 400 * 1024 });
writeOrCheck(join(DATA, 'collision.bin'), bin, check);

const doorsJson = new TextEncoder().encode(JSON.stringify({
  version: 1,
  source: { contentSha: contentSha([...configFiles, ...mapFiles, packFile]) },
  // Sorted so the committed bytes do not move with the directory read order.
  doors: doors.sort((a, b) => a.level - b.level || a.x - b.x || a.z - b.z)
}));
enforceBudget('doors.json', doorsJson, { rawBytes: 512 * 1024, gzipBytes: 128 * 1024 });
writeOrCheck(join(DATA, 'doors.json'), doorsJson, check);
```

Run it: `cd /c/projects/osrs_test && ~/.bun/bin/bun scripts/gen/collision.ts`. If `collision.bin` exceeds its budget, the first thing to check is whether levels 1-3 are being written for squares that have nothing on them (`encodeCollision` already drops all-zero levels), and the second is whether `active` is defaulting to true for configs with neither ops nor models.

- [ ] **Step 5: Write the failing pathfinder test**

`web/src/vendor/rs-sdk/sdk/pathfinding.test.ts` - a new file. The world is a 64 x 64 square with a wall across it and one gap, built through the real encoder so the test exercises the same reader the shell uses.

```ts
import { afterEach, expect, test } from 'vitest';
import { encodeCollision, decodeCollision } from '../../../data/gen/collisionFile';
import { findLongPath, getDoorAt, initPathfinding, isTileWalkable, isZoneAllocated } from './pathfinding';

const MX = 50, MZ = 50, BASE_X = MX << 6, BASE_Z = MZ << 6;

/** A wall along local z = 10 with a gap at local x = 40. */
function world(): void {
  const bits = new Uint8Array(512);
  for (let x = 0; x < 64; x++) {
    if (x === 40) continue;
    const i = (x << 6) | 10;
    bits[i >> 3] |= 1 << (i & 7);
  }
  const bytes = encodeCollision([{ mx: MX, mz: MZ, levels: new Map([[0, bits]]) }]);
  const grid = decodeCollision(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  initPathfinding({ grid, doors: [{ level: 0, x: BASE_X + 40, z: BASE_Z + 10, shape: 0, angle: 0, blockrange: false }] });
}

afterEach(() => { initPathfinding(null); });

test('with no data loaded every predicate stays permissive, exactly as the stub was', () => {
  initPathfinding(null);
  expect(isTileWalkable(0, BASE_X + 5, BASE_Z + 10)).toBe(true);
  expect(isZoneAllocated(0, BASE_X + 5, BASE_Z + 10)).toBe(true);
  expect(findLongPath(0, BASE_X + 5, BASE_Z + 5, BASE_X + 5, BASE_Z + 30).length).toBeGreaterThan(0);
});

test('a blocked tile reads as blocked and its square reads as allocated', () => {
  world();
  expect(isTileWalkable(0, BASE_X + 5, BASE_Z + 10)).toBe(false);
  expect(isTileWalkable(0, BASE_X + 40, BASE_Z + 10)).toBe(true);
  expect(isZoneAllocated(0, BASE_X + 5, BASE_Z + 10)).toBe(true);
  expect(isZoneAllocated(0, (99 << 6) + 5, (99 << 6) + 5)).toBe(false);
});

test('a path across the wall goes through the gap, and never through the wall', () => {
  world();
  const path = findLongPath(0, BASE_X + 5, BASE_Z + 5, BASE_X + 5, BASE_Z + 30);
  expect(path.length).toBeGreaterThan(0);
  expect(path[path.length - 1]).toMatchObject({ x: BASE_X + 5, z: BASE_Z + 30 });
  for (const wp of path) expect(isTileWalkable(0, wp.x, wp.z)).toBe(true);
  expect(path.some(wp => wp.x === BASE_X + 40 && Math.abs(wp.z - (BASE_Z + 10)) <= 1)).toBe(true);
});

test('consecutive waypoints are never more than 20 tiles apart', () => {
  world();
  const path = findLongPath(0, BASE_X + 5, BASE_Z + 5, BASE_X + 5, BASE_Z + 30);
  let prev = { x: BASE_X + 5, z: BASE_Z + 5 };
  for (const wp of path) {
    expect(Math.max(Math.abs(wp.x - prev.x), Math.abs(wp.z - prev.z))).toBeLessThanOrEqual(20);
    prev = wp;
  }
});

test('an unreachable destination comes back as the best partial path, not as nothing', () => {
  // Seal the gap: nothing can cross.
  const bits = new Uint8Array(512);
  for (let x = 0; x < 64; x++) { const i = (x << 6) | 10; bits[i >> 3] |= 1 << (i & 7); }
  const bytes = encodeCollision([{ mx: MX, mz: MZ, levels: new Map([[0, bits]]) }]);
  initPathfinding({ grid: decodeCollision(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), doors: [] });
  const path = findLongPath(0, BASE_X + 5, BASE_Z + 5, BASE_X + 5, BASE_Z + 30);
  expect(path.length).toBeGreaterThan(0);
  expect(path[path.length - 1].z).toBeLessThan(BASE_Z + 10);
});

test('a blocked door is treated as a wall for this query only', () => {
  world();
  const door = { level: 0, x: BASE_X + 40, z: BASE_Z + 10, shape: 0, angle: 0, blockrange: false };
  expect(getDoorAt(0, BASE_X + 40, BASE_Z + 10)).toMatchObject({ x: BASE_X + 40 });
  const path = findLongPath(0, BASE_X + 5, BASE_Z + 5, BASE_X + 5, BASE_Z + 30, 500, [door]);
  expect(path[path.length - 1].z).toBeLessThan(BASE_Z + 10);
});
```

Run: `cd web && npx vitest run src/vendor/rs-sdk/sdk/pathfinding.test.ts` - expect FAIL (the stub walks straight through the wall).

- [ ] **Step 6: Replace the stub bodies**

`web/src/vendor/rs-sdk/sdk/pathfinding.ts`. Keep `DoorInfo` and `TemporaryDoorBlocklist`'s public shape; `active()` now returns real rows.

```ts
// NOT vendored - ours. Upstream's module is a global A* over a 6 MB collision dump run through
// the native `rsmod-pathfinder`; we ship neither. This is the same contract over the collision
// bitset SP4b generates (`web/src/data/collision.bin`, `scripts/gen/collision.ts`): the exported
// names and signatures match upstream exactly, so `index.ts` and `actions.ts` need no edits.
//
// With no data loaded every predicate stays permissive, which is what SP4a shipped: a failed
// fetch degrades walking to dead reckoning rather than refusing to move.
import type { CollisionGrid } from '../../../data/gen/collisionFile';

export interface DoorInfo { level: number; x: number; z: number; shape: number; angle: number; blockrange: boolean }
export interface PathfindingData { grid: CollisionGrid; doors: DoorInfo[] }

/** Ruling R7: the BFS window is the query's bounding box padded by this, capped by MAX_SPAN. */
const PAD = 128;
const MAX_SPAN = 1024;
/** `walkStepToward` is written for short hops; the client routefinder does the fine work. */
const MAX_LEG = 20;

let grid: CollisionGrid | null = null;
let doorsByTile = new Map<string, DoorInfo>();

const key = (level: number, x: number, z: number): string => `${level},${x},${z}`;

export class TemporaryDoorBlocklist {
    private keys = new Set<string>();

    block(door: DoorInfo, _ttlMs: number = 30_000): void {
        this.keys.add(key(door.level, door.x, door.z));
    }

    has(level: number, x: number, z: number): boolean {
        return this.keys.has(key(level, x, z));
    }

    /** The doors this session has evidence against, as rows a path query can re-wall. */
    active(): DoorInfo[] {
        const out: DoorInfo[] = [];
        for (const k of this.keys) {
            const door = doorsByTile.get(k);
            if (door) out.push(door);
        }
        return out;
    }

    clear(): void {
        this.keys.clear();
    }
}

/** Called once per Worker by `web/src/tasks/collision.ts`; `null` restores the permissive stub. */
export function initPathfinding(data: PathfindingData | null): void {
    grid = data?.grid ?? null;
    doorsByTile = new Map((data?.doors ?? []).map(d => [key(d.level, d.x, d.z), d]));
}

export function isZoneAllocated(level: number, x: number, z: number): boolean {
    return grid ? grid.hasSquare(level, x, z) : true;
}

export function isTileWalkable(level: number, x: number, z: number): boolean {
    return grid ? !grid.blocked(level, x, z) : true;
}

export function isFlagged(_x: number, _z: number, _level: number, _masks: number): boolean {
    return false;
}

export function isZoneLikelyLand(level: number, x: number, z: number): boolean {
    return isZoneAllocated(level, x, z);
}

export function getDoorAt(level: number, x: number, z: number): DoorInfo | undefined {
    return doorsByTile.get(key(level, x, z));
}

/** Every door the path passes through or beside, so `walkTo` can open them proactively. */
export function findDoorsAlongPath(waypoints: Array<{ x: number; z: number; level: number }>): DoorInfo[] {
    const out = new Map<string, DoorInfo>();
    for (const wp of waypoints) {
        for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const door = doorsByTile.get(key(wp.level, wp.x + dx, wp.z + dz));
            if (door) out.set(key(door.level, door.x, door.z), door);
        }
    }
    return [...out.values()];
}
```

- [ ] **Step 7: The BFS**

Same file, below the predicates:

```ts
/**
 * Breadth-first over the collision bitset, 4-connected (the client's own routefinder resolves
 * the diagonals inside a scene). Returns waypoints from just after the source to the
 * destination, or - when the destination cannot be reached - to the reachable tile closest to
 * it, which is what the vendored `walkTo` treats as a partial path and walks once.
 */
export function findLongPath(
    level: number,
    srcX: number,
    srcZ: number,
    destX: number,
    destZ: number,
    maxWaypoints: number = 500,
    blockedDoors: Iterable<DoorInfo> = []
): Array<{ x: number; z: number; level: number }> {
    if (!grid) return straightLine(level, srcX, srcZ, destX, destZ);

    const minX = Math.max(0, Math.min(srcX, destX) - PAD);
    const minZ = Math.max(0, Math.min(srcZ, destZ) - PAD);
    const width = Math.min(MAX_SPAN, Math.abs(destX - srcX) + PAD * 2 + 1);
    const height = Math.min(MAX_SPAN, Math.abs(destZ - srcZ) + PAD * 2 + 1);
    const inside = (x: number, z: number): boolean => x >= minX && z >= minZ && x < minX + width && z < minZ + height;
    if (!inside(srcX, srcZ) || !inside(destX, destZ)) return [];

    const walled = new Set<string>();
    for (const door of blockedDoors) walled.add(key(door.level, door.x, door.z));

    const index = (x: number, z: number): number => (x - minX) * height + (z - minZ);
    const cameFrom = new Int32Array(width * height).fill(-1);
    const seen = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let head = 0, tail = 0;

    const start = index(srcX, srcZ);
    seen[start] = 1;
    queue[tail++] = start;
    let best = start;
    let bestDist = Math.max(Math.abs(srcX - destX), Math.abs(srcZ - destZ));
    let found = false;

    while (head < tail) {
        const at = queue[head++];
        const x = minX + Math.floor(at / height);
        const z = minZ + (at % height);
        const dist = Math.max(Math.abs(x - destX), Math.abs(z - destZ));
        if (dist < bestDist) { bestDist = dist; best = at; }
        if (x === destX && z === destZ) { best = at; found = true; break; }
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz;
            if (!inside(nx, nz)) continue;
            const next = index(nx, nz);
            if (seen[next]) continue;
            if (grid.blocked(level, nx, nz)) continue;
            if (walled.has(key(level, nx, nz))) continue;
            seen[next] = 1;
            cameFrom[next] = at;
            queue[tail++] = next;
        }
    }
    if (!found && bestDist === Math.max(Math.abs(srcX - destX), Math.abs(srcZ - destZ))) return [];

    const tiles: Array<{ x: number; z: number }> = [];
    for (let at = best; at !== -1 && at !== start; at = cameFrom[at]) {
        tiles.push({ x: minX + Math.floor(at / height), z: minZ + (at % height) });
    }
    tiles.reverse();
    return simplify(tiles, level, maxWaypoints);
}

/**
 * Corners, plus a point at least every MAX_LEG tiles. Handing `walkTo` one waypoint per tile
 * would make it walk the route a step at a time; handing it only the endpoints would let its
 * `walkStepToward` cut the corner into a wall.
 */
function simplify(tiles: Array<{ x: number; z: number }>, level: number, maxWaypoints: number): Array<{ x: number; z: number; level: number }> {
    const out: Array<{ x: number; z: number; level: number }> = [];
    let lastDir = '';
    let sinceLast = 0;
    for (let i = 0; i < tiles.length; i++) {
        const prev = tiles[i - 1] ?? tiles[0];
        const dir = `${Math.sign(tiles[i].x - prev.x)},${Math.sign(tiles[i].z - prev.z)}`;
        sinceLast++;
        const last = i === tiles.length - 1;
        if (last || (dir !== lastDir && i > 0) || sinceLast >= MAX_LEG) {
            out.push({ x: tiles[i].x, z: tiles[i].z, level });
            sinceLast = 0;
        }
        lastDir = dir;
    }
    return out.length > maxWaypoints ? out.slice(0, maxWaypoints) : out;
}

/** The SP4a behaviour, kept for the no-data case: straight-line legs of at most MAX_LEG tiles. */
function straightLine(level: number, srcX: number, srcZ: number, destX: number, destZ: number): Array<{ x: number; z: number; level: number }> {
    const out: Array<{ x: number; z: number; level: number }> = [];
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(destX - srcX), Math.abs(destZ - srcZ)) / MAX_LEG));
    for (let i = 1; i <= steps; i++) {
        out.push({
            x: Math.round(srcX + ((destX - srcX) * i) / steps),
            z: Math.round(srcZ + ((destZ - srcZ) * i) / steps),
            level
        });
    }
    return out;
}
```

Run: `cd web && npx vitest run src/vendor/rs-sdk/sdk/pathfinding.test.ts` - expect PASS. Then **mutate**: delete the `if (grid.blocked(level, nx, nz)) continue;` line and confirm the "goes through the gap" and "never through the wall" assertions both fail. Revert.

- [ ] **Step 8: The runtime loader**

`web/src/tasks/collision.test.ts`:

```ts
import { expect, test, vi } from 'vitest';
import { encodeCollision } from '../data/gen/collisionFile';
import { createCollisionLoader } from './collision';
import { isTileWalkable, initPathfinding } from '../vendor/rs-sdk/sdk/pathfinding';

const bits = (): Uint8Array => { const b = new Uint8Array(512); b[0] = 1; return b; };
const binary = () => encodeCollision([{ mx: 50, mz: 50, levels: new Map([[0, bits()]]) }]);

test('loading installs the grid into the pathfinder', async () => {
  initPathfinding(null);
  const bytes = binary();
  const fetchImpl = vi.fn(async (url: string) => url.endsWith('.bin')
    ? { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
    : { ok: true, json: async () => ({ doors: [] }) });
  const loader = createCollisionLoader({ binUrl: '/a.bin', doorsUrl: '/a.json', fetchImpl: fetchImpl as unknown as typeof fetch });

  expect(await loader.load()).toBe(true);
  expect(isTileWalkable(0, 50 << 6, 50 << 6)).toBe(false);
  expect(loader.ready()).toBe(true);
  initPathfinding(null);
});

test('a failed fetch leaves the pathfinder permissive and says so', async () => {
  initPathfinding(null);
  const loader = createCollisionLoader({ binUrl: '/a.bin', doorsUrl: '/a.json', fetchImpl: (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch });
  expect(await loader.load()).toBe(false);
  expect(loader.ready()).toBe(false);
  expect(isTileWalkable(0, 50 << 6, 50 << 6)).toBe(true);
});

test('two concurrent loads fetch once', async () => {
  const bytes = binary();
  const fetchImpl = vi.fn(async (url: string) => url.endsWith('.bin')
    ? { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
    : { ok: true, json: async () => ({ doors: [] }) });
  const loader = createCollisionLoader({ binUrl: '/a.bin', doorsUrl: '/a.json', fetchImpl: fetchImpl as unknown as typeof fetch });
  await Promise.all([loader.load(), loader.load()]);
  expect(fetchImpl).toHaveBeenCalledTimes(2);   // one .bin and one .json, not two of each
  initPathfinding(null);
});
```

`web/src/tasks/collision.ts`:

```ts
// The collision bitset at runtime: fetched on the first `travel.to`, decoded, and handed to the
// vendored pathfinder. Both files are Vite `?url` assets (plan ruling R5), so they cost the
// shell's first paint nothing and a regenerated file is a new URL rather than a stale cache.
import binAsset from '../data/collision.bin?url';
import doorsAsset from '../data/doors.json?url';
import { decodeCollision } from '../data/gen/collisionFile';
import { initPathfinding, type DoorInfo } from '../vendor/rs-sdk/sdk/pathfinding';

export interface CollisionLoaderDeps { binUrl?: string; doorsUrl?: string; fetchImpl?: typeof fetch }
export interface CollisionLoader {
  /** True once the pathfinder holds real data. False leaves it permissive, as SP4a shipped. */
  load(): Promise<boolean>;
  ready(): boolean;
}

interface DoorsFile { doors: DoorInfo[] }

export function createCollisionLoader(deps: CollisionLoaderDeps = {}): CollisionLoader {
  const binUrl = deps.binUrl ?? binAsset;
  const doorsUrl = deps.doorsUrl ?? doorsAsset;
  const doFetch = deps.fetchImpl ?? ((input: RequestInfo | URL) => fetch(input));
  let ready = false;
  let inFlight: Promise<boolean> | null = null;

  return {
    ready: () => ready,
    load() {
      if (ready) return Promise.resolve(true);
      inFlight ??= (async () => {
        try {
          const [bin, doors] = await Promise.all([doFetch(binUrl), doFetch(doorsUrl)]);
          if (!bin.ok || !doors.ok) throw new Error(`collision fetch failed: ${bin.status}/${doors.status}`);
          const grid = decodeCollision(await bin.arrayBuffer());
          // A door row carries no `blockrange` in the file; the vendored type wants one, and
          // nothing in our path queries reads it (it is a projectile rule, not a walk rule).
          const rows = ((await doors.json()) as DoorsFile).doors.map(d => ({ ...d, blockrange: false }));
          initPathfinding({ grid, doors: rows });
          ready = true;
          return true;
        } catch {
          return false;
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    }
  };
}
```

Run: `cd web && npx vitest run src/tasks/collision.test.ts` - expect PASS.

- [ ] **Step 9: Record the deviation, extend the build check, verify, commit**

`web/src/vendor/PATCHES.md`, replace the "pathfinding.ts: ours, not vendored" table rows with the real behaviour:

| Consumer | Symbol | Our behaviour |
|---|---|---|
| `index.ts` | `TemporaryDoorBlocklist` | remembers blocked door keys; `active()` returns the matching rows from the generated door table |
| `index.ts` | `isZoneAllocated(level, x, z)` | whether `collision.bin` carries that map square at that level; `true` when no data is loaded |
| `index.ts` | `findLongPath(...)` | BFS over the collision bitset in the query's bounding box padded by 128 tiles (plan ruling R7), simplified to corners at most 20 tiles apart; the best partial path when the destination is unreachable |
| `index.ts` | `getDoorAt(level, x, z)` | the generated door row on that tile |
| `actions.ts` | `isTileWalkable(level, x, z)` | the bit from `collision.bin`; `true` when no data is loaded |

`scripts/build.ps1`, in the step Task 3 added:

```powershell
    & $bun 'scripts/gen/collision.ts' '--check'
    if ($LASTEXITCODE -ne 0) { throw 'collision.bin/doors.json are out of date with engine/content (run: bun scripts/gen/collision.ts)' }
```

```bash
cd web && npm run typecheck && npm run lint && npx vitest run
```

```bash
git add web/src/data/gen/collisionBuild.ts web/src/data/gen/collisionBuild.test.ts web/src/data/gen/collisionFile.ts web/src/data/gen/collisionFile.test.ts web/src/data/collision.bin web/src/data/doors.json web/src/tasks/collision.ts web/src/tasks/collision.test.ts web/src/vendor/rs-sdk/sdk/pathfinding.ts web/src/vendor/rs-sdk/sdk/pathfinding.test.ts web/src/vendor/PATCHES.md scripts/gen/collision.ts scripts/build.ps1
git -c core.safecrlf=false commit -m "$(cat <<'EOF'
feat(tasks): path over real collision data instead of dead reckoning

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
EOF
)"
```

---

### Task 5: `c.travel` - the long-distance layer

`bot.walkTo` is a good local walker: it re-queries the path every iteration, opens doors, gives up on a dead end. What it does not do is plan across the map, follow a declared route, or report *why* it stopped in a way a script can branch on. `c.travel` is that layer, and it is where spec decision 11 lives: a level change that is not a declared `interact` waypoint is refused with `needs_route` rather than guessed at.

**Files:**
- Create: `web/src/tasks/travel.ts`, `web/src/tasks/travel.test.ts`
- Modify: `web/src/tasks/types.ts`, `web/src/agent/workerContext.ts`, `web/src/agent/workerContext.test.ts`

**Interfaces:**
- Consumes: `AtlasLoader` and `createAtlasLoader` (Task 3), `CollisionLoader` (Task 4), `BotActions.walkTo`, `BotSDK.findPath`, `ContextDeps.signal()` (Task 1).
- Produces:
  - `web/src/tasks/types.ts`: `TravelTarget`, `TravelOpts`, `TravelResult` exactly as spec section 5 declares them.
  - `web/src/tasks/travel.ts`: `createTravel(deps: TravelDeps): Travel` where `Travel = ScriptContext['travel']`, plus `MAX_LEG_TILES = 60` and `resolveTarget(target, atlas, player): { x: number; z: number; level: number } | null` exported for the tests and for `find`.

- [ ] **Step 1: Add the travel types**

`web/src/tasks/types.ts`, after the atlas types:

```ts
export type TravelTarget =
  | { x: number; z: number; level?: number }
  | { landmark: string }
  | { cluster: AtlasCluster };
export interface TravelOpts { tolerance?: number; maxLegs?: number; timeoutMs?: number }
export interface TravelResult {
  success: boolean; reason?: 'unreachable' | 'needs_route' | 'aborted' | 'timeout';
  stoppedAt?: { x: number; z: number }; legs: number; tiles: number;
}
```

- [ ] **Step 2: Write the failing travel tests**

`web/src/tasks/travel.test.ts`. The fake `walkTo` moves the fake player, so "did it get there" is a real assertion rather than a call count.

```ts
import { expect, test, vi } from 'vitest';
import { createTravel, MAX_LEG_TILES } from './travel';
import type { Atlas, WorldState } from './types';

const ATLAS: Atlas = {
  version: 1, source: { contentSha: 'x', generatedAt: '2026-09-06' },
  kinds: {} as Atlas['kinds'],
  clusters: [{ id: 1, kind: 'tree', variant: 'tree', level: 0, x: 3300, z: 3200, n: 2, r: 1, region: 0 }],
  landmarks: [{ id: 'lumbridge', kind: 'town', name: 'Lumbridge castle', level: 0, x: 3222, z: 3218 }],
  routes: []
};

function harness(opts: { walk?: (x: number, z: number) => boolean } = {}) {
  const player = { worldX: 3200, worldZ: 3200, level: 0 };
  const legs: { x: number; z: number }[] = [];
  const abort = new AbortController();
  const walkTo = vi.fn(async (x: number, z: number) => {
    legs.push({ x, z });
    const ok = opts.walk ? opts.walk(x, z) : true;
    if (ok) { player.worldX = x; player.worldZ = z; }
    return ok ? { success: true, message: 'Arrived' } : { success: false, message: 'Stuck' };
  });
  const travel = createTravel({
    state: () => ({ player } as unknown as WorldState),
    bot: { walkTo } as never,
    atlas: { load: async () => ATLAS, peek: () => ATLAS, nearestCluster: () => null, landmark: (a, id) => a.landmarks.find(l => l.id === id) ?? null },
    collision: { load: async () => true, ready: () => true },
    status: vi.fn(),
    interact: vi.fn(async () => ({ success: true, message: 'done' })),
    signal: () => abort.signal,
    now: () => 0
  });
  return { travel, legs, player, walkTo, abort };
}

test('a long walk is split into legs that each fit inside one scene', async () => {
  const { travel, legs } = harness();
  const result = await travel.to({ x: 3400, z: 3200 });
  expect(result.success).toBe(true);
  expect(legs.length).toBeGreaterThan(1);
  let from = { x: 3200, z: 3200 };
  for (const leg of legs) {
    expect(Math.max(Math.abs(leg.x - from.x), Math.abs(leg.z - from.z))).toBeLessThanOrEqual(MAX_LEG_TILES);
    from = leg;
  }
});

test('arriving inside the tolerance is success, and the last leg is the target', async () => {
  const { travel, legs } = harness();
  const result = await travel.to({ x: 3230, z: 3200 }, { tolerance: 2 });
  expect(result).toMatchObject({ success: true, legs: legs.length });
  expect(legs.at(-1)).toEqual({ x: 3230, z: 3200 });
});

test('a landmark and a cluster resolve to their coordinates', async () => {
  const { travel, legs } = harness();
  await travel.to({ landmark: 'lumbridge' });
  expect(legs.at(-1)).toEqual({ x: 3222, z: 3218 });
  legs.length = 0;
  await travel.to({ cluster: ATLAS.clusters[0] });
  expect(legs.at(-1)).toEqual({ x: 3300, z: 3200 });
});

test('an unknown landmark is unreachable, and nothing is walked', async () => {
  const { travel, walkTo } = harness();
  expect(await travel.to({ landmark: 'atlantis' })).toMatchObject({ success: false, reason: 'unreachable', legs: 0 });
  expect(walkTo).not.toHaveBeenCalled();
});

test('a level change with no route is refused rather than attempted', async () => {
  const { travel, walkTo } = harness();
  expect(await travel.to({ x: 3210, z: 3200, level: 1 })).toMatchObject({ success: false, reason: 'needs_route' });
  expect(walkTo).not.toHaveBeenCalled();
});

test('two legs that close no distance re-plan once, then fail unreachable with where it stopped', async () => {
  const { travel, walkTo } = harness({ walk: () => false });
  const result = await travel.to({ x: 3400, z: 3200 });
  expect(result).toMatchObject({ success: false, reason: 'unreachable', stoppedAt: { x: 3200, z: 3200 } });
  // One plan, one re-plan: three failed legs at most, never fifty.
  expect(walkTo.mock.calls.length).toBeLessThanOrEqual(4);
});

test('an abort between legs stops immediately and reports aborted', async () => {
  const { travel, abort, walkTo } = harness({ walk: () => { abort.abort(); return true; } });
  const result = await travel.to({ x: 3400, z: 3200 });
  expect(result.reason).toBe('aborted');
  expect(walkTo).toHaveBeenCalledTimes(1);
});

test('distanceTo is straight-line and needs no walking', () => {
  const { travel, walkTo } = harness();
  expect(travel.distanceTo({ x: 3210, z: 3204 })).toBe(10);
  expect(travel.distanceTo({ landmark: 'atlantis' })).toBe(Infinity);
  expect(walkTo).not.toHaveBeenCalled();
});

test('a route waypoint that is an interact is performed between the walks around it', async () => {
  const ROUTED: Atlas = {
    ...ATLAS,
    landmarks: [...ATLAS.landmarks, { id: 'mine', kind: 'town', name: 'Mine', level: 0, x: 3220, z: 3200 }],
    routes: [{ from: 'lumbridge', to: 'mine', level: 0, waypoints: [
      { kind: 'walk', x: 3210, z: 3200 },
      { kind: 'interact', locName: 'Ladder', op: 'Climb-down', x: 3210, z: 3200, toLevel: 0 },
      { kind: 'walk', x: 3220, z: 3200 }
    ] }]
  };
  const player = { worldX: 3200, worldZ: 3200, level: 0 };
  const order: string[] = [];
  const interact = vi.fn(async (wp: { locName: string }) => { order.push(`interact:${wp.locName}`); return { success: true, message: 'ok' }; });
  const travel = createTravel({
    state: () => ({ player } as unknown as WorldState),
    bot: { walkTo: async (x: number, z: number) => { order.push(`walk:${x}`); player.worldX = x; player.worldZ = z; return { success: true, message: 'Arrived' }; } } as never,
    atlas: { load: async () => ROUTED, peek: () => ROUTED, nearestCluster: () => null, landmark: (a, id) => a.landmarks.find(l => l.id === id) ?? null },
    collision: { load: async () => true, ready: () => true },
    status: vi.fn(), interact,
    signal: () => new AbortController().signal,
    now: () => 0
  });

  const result = await travel.to({ landmark: 'mine' });
  expect(result.success).toBe(true);
  expect(order).toEqual(['walk:3210', 'interact:Ladder', 'walk:3220']);
  expect(interact).toHaveBeenCalledTimes(1);
});

test('a route whose interact fails stops there rather than walking on without it', async () => {
  const player = { worldX: 3200, worldZ: 3200, level: 0 };
  const walked: number[] = [];
  const ROUTED: Atlas = {
    ...ATLAS,
    landmarks: [...ATLAS.landmarks, { id: 'mine', kind: 'town', name: 'Mine', level: 0, x: 3220, z: 3200 }],
    routes: [{ from: 'lumbridge', to: 'mine', level: 0, waypoints: [
      { kind: 'interact', locName: 'Ladder', op: 'Climb-down', x: 3200, z: 3200 },
      { kind: 'walk', x: 3220, z: 3200 }
    ] }]
  };
  const travel = createTravel({
    state: () => ({ player } as unknown as WorldState),
    bot: { walkTo: async (x: number) => { walked.push(x); return { success: true, message: 'Arrived' }; } } as never,
    atlas: { load: async () => ROUTED, peek: () => ROUTED, nearestCluster: () => null, landmark: (a, id) => a.landmarks.find(l => l.id === id) ?? null },
    collision: { load: async () => true, ready: () => true },
    status: vi.fn(),
    interact: async () => ({ success: false, message: 'no ladder here', reason: 'target_not_found' }),
    signal: () => new AbortController().signal,
    now: () => 0
  });

  expect(await travel.to({ landmark: 'mine' })).toMatchObject({ success: false, reason: 'unreachable' });
  expect(walked).toEqual([]);
});
```

Run: `cd web && npx vitest run src/tasks/travel.test.ts` - expect FAIL (module missing).

- [ ] **Step 3: Implement travel**

`web/src/tasks/travel.ts`:

```ts
// `c.travel`: getting somewhere that is not in the current scene. `bot.walkTo` is a good local
// walker (it re-queries the path, opens doors, gives up on a dead end); this is the layer above
// it that resolves a target, follows a declared route when one exists, splits the rest into legs
// small enough for one scene, and reports a typed reason when it stops.
import type { AtlasLoader } from './atlas';
import type { CollisionLoader } from './collision';
import type {
  Atlas, AtlasRoute, RouteWaypoint, ScriptContext, TravelOpts, TravelResult, TravelTarget
} from './types';
import type { ActionResult, WorldState } from '../agent/types';

/** One leg has to sit inside the built scene (104 x 104 tiles centred on the player). */
export const MAX_LEG_TILES = 60;
const DEFAULT_TOLERANCE = 2;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_LEGS = 24;

export interface TravelDeps {
  state(): WorldState;
  bot: { walkTo(x: number, z: number, tolerance?: number): Promise<ActionResult> };
  atlas: AtlasLoader;
  collision: CollisionLoader;
  status(text: string): void;
  /** Performs a route's `interact` waypoint (a ladder, a gate). Wired in `workerContext`. */
  interact(waypoint: Extract<RouteWaypoint, { kind: 'interact' }>): Promise<ActionResult>;
  signal(): AbortSignal;
  now(): number;
}

export type Travel = ScriptContext['travel'];

const chebyshev = (ax: number, az: number, bx: number, bz: number): number =>
  Math.max(Math.abs(ax - bx), Math.abs(az - bz));

/** Coordinates for a target, or null when the atlas does not know it. */
export function resolveTarget(target: TravelTarget, atlas: Atlas | null, playerLevel: number): { x: number; z: number; level: number } | null {
  if ('landmark' in target) {
    const found = atlas?.landmarks.find(l => l.id === target.landmark);
    return found ? { x: found.x, z: found.z, level: found.level } : null;
  }
  if ('cluster' in target) return { x: target.cluster.x, z: target.cluster.z, level: target.cluster.level };
  return { x: target.x, z: target.z, level: target.level ?? playerLevel };
}

export function createTravel(d: TravelDeps): Travel {
  const here = (): { x: number; z: number; level: number } => {
    const p = d.state().player;
    return { x: p?.worldX ?? 0, z: p?.worldZ ?? 0, level: p?.level ?? 0 };
  };

  /** The route that connects where we are to where we are going, or null. */
  const routeFor = (atlas: Atlas | null, target: TravelTarget): AtlasRoute | null => {
    if (!atlas || !('landmark' in target)) return null;
    return atlas.routes.find(r => r.to === target.landmark) ?? null;
  };

  async function to(target: TravelTarget, opts: TravelOpts = {}): Promise<TravelResult> {
    const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
    const deadline = d.now() + (opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const maxLegs = opts.maxLegs ?? DEFAULT_MAX_LEGS;
    // The collision data is what makes a leg follow the ground rather than the straight line.
    // A failed load leaves the pathfinder permissive, which is SP4a's behaviour, not an error.
    await d.collision.load();
    const atlas = d.atlas.peek() ?? await d.atlas.load();
    const start = here();
    const destination = resolveTarget(target, atlas, start.level);
    if (!destination) return { success: false, reason: 'unreachable', legs: 0, tiles: 0 };

    const route = routeFor(atlas, target);
    // Spec decision 11: a level change is only ever made by a route's `interact` waypoint.
    if (destination.level !== start.level && !route) {
      return { success: false, reason: 'needs_route', stoppedAt: { x: start.x, z: start.z }, legs: 0, tiles: 0 };
    }

    const waypoints: RouteWaypoint[] = route
      ? route.waypoints
      : [{ kind: 'walk', x: destination.x, z: destination.z }];

    let legs = 0;
    let tiles = 0;
    let replanned = false;
    let stalled = 0;

    for (const waypoint of waypoints) {
      if (waypoint.kind === 'interact') {
        if (d.signal().aborted) return stop('aborted');
        d.status(`${waypoint.op} the ${waypoint.locName}`);
        const result = await d.interact(waypoint);
        if (!result.success) return stop('unreachable');
        continue;
      }
      // Walk to this waypoint in scene-sized legs, re-reading the player between each so a
      // partial walk is progress rather than a restart.
      for (;;) {
        if (d.signal().aborted) return stop('aborted');
        if (d.now() > deadline) return stop('timeout');
        if (legs >= maxLegs) return stop('unreachable');
        const from = here();
        const remaining = chebyshev(from.x, from.z, waypoint.x, waypoint.z);
        if (remaining <= tolerance) break;
        const leg = stepToward(from, waypoint, tolerance);
        d.status(`Travelling to ${waypoint.x}, ${waypoint.z} (${remaining} tiles)`);
        await d.bot.walkTo(leg.x, leg.z, tolerance);
        legs++;
        const after = here();
        const moved = chebyshev(from.x, from.z, after.x, after.z);
        tiles += moved;
        if (moved > 0) { stalled = 0; continue; }
        stalled++;
        // One re-plan, then say so. A walker that keeps re-trying a leg it cannot walk is the
        // "stuck in a doorway for the whole run" failure the health monitor should never have
        // to catch for us.
        if (stalled >= 2) {
          if (replanned) return stop('unreachable');
          replanned = true;
          stalled = 0;
        }
      }
    }

    const end = here();
    const arrived = chebyshev(end.x, end.z, destination.x, destination.z) <= tolerance;
    return { success: arrived, ...(arrived ? {} : { reason: 'unreachable' as const }), stoppedAt: { x: end.x, z: end.z }, legs, tiles };

    function stop(reason: TravelResult['reason']): TravelResult {
      const at = here();
      return { success: false, reason, stoppedAt: { x: at.x, z: at.z }, legs, tiles };
    }
  }

  /** The furthest point toward `to` that is still inside one scene. */
  function stepToward(from: { x: number; z: number }, to: { x: number; z: number }, tolerance: number): { x: number; z: number } {
    const dist = chebyshev(from.x, from.z, to.x, to.z);
    if (dist <= MAX_LEG_TILES) return { x: to.x, z: to.z };
    const ratio = MAX_LEG_TILES / dist;
    return {
      x: Math.round(from.x + (to.x - from.x) * ratio),
      z: Math.round(from.z + (to.z - from.z) * ratio)
    };
  }

  return {
    to,
    distanceTo(target) {
      const from = here();
      const destination = resolveTarget(target, d.atlas.peek(), from.level);
      return destination ? chebyshev(from.x, from.z, destination.x, destination.z) : Infinity;
    }
  };
}
```

Run: `cd web && npx vitest run src/tasks/travel.test.ts` - expect PASS. **Mutate**: change `MAX_LEG_TILES` to 600 and confirm the leg-splitting test fails; make `stalled >= 2` into `stalled >= 20` and confirm the re-plan test fails on the call-count assertion. Revert both.

- [ ] **Step 4: Hang travel off the context**

`web/src/tasks/types.ts`, extend `ScriptContext` (the `find` and `health` members arrive in Tasks 6 and 7; add `travel` and `anchor` now and the others in their own tasks, so each task's diff is reviewable on its own):

```ts
  travel: {
    to(target: TravelTarget, opts?: TravelOpts): Promise<TravelResult>;
    /** Straight line, cheap, for a `when` predicate. Infinity when the target cannot be resolved. */
    distanceTo(target: TravelTarget): number;
  };
  /** Read, or set, the tile the run treats as home. Recovery walks back here. */
  anchor(x?: number, z?: number): { x: number; z: number };
```

`web/src/agent/workerContext.ts`, extend `ContextDeps` and build the layer:

```ts
export interface ContextDeps {
  transport: Transport;
  trace: Trace;
  params: ParamValues;
  signal(): AbortSignal;
  onTick(cb: () => void): () => void;
  /** Static map knowledge, shared by every run in this Worker. */
  atlas: AtlasLoader;
  collision: CollisionLoader;
  /** The run anchor, owned by the Worker so it outlives a context rebuild. */
  anchor(x?: number, z?: number): { x: number; z: number };
}
```

```ts
  const travel = createTravel({
    state, bot,
    atlas: d.atlas,
    collision: d.collision,
    status: text => d.trace.push({ kind: 'status', text }),
    // A route's `interact` waypoint is a loc interaction like any other; resolving it through
    // the live scene rather than the route's own coordinates means a door that has been moved
    // by a content bump still works.
    interact: async wp => {
      const loc = (state().nearbyLocs ?? []).find(l => l.name === wp.locName && Math.abs(l.x - wp.x) <= 2 && Math.abs(l.z - wp.z) <= 2);
      if (!loc) return { success: false, message: `no ${wp.locName} at ${wp.x}, ${wp.z}`, reason: 'target_not_found' };
      return bot.interactLoc(loc, wp.op);
    },
    signal: d.signal,
    now: Date.now
  });
```

and add `travel` plus `anchor: d.anchor` to the `ctx` literal.

`web/src/agent/worker.ts`: build the two loaders once at module scope (they are per-Worker caches, not per-run), and the anchor per run:

```ts
import { createAtlasLoader } from '../tasks/atlas';
import { createCollisionLoader } from '../tasks/collision';

// One per Worker: the atlas and the collision bitset are static map knowledge, so a second run
// in the same tab pays nothing for them.
const atlas = createAtlasLoader();
const collision = createCollisionLoader();
```

in `startRun`, before `createWorkerContext`:

```ts
    // The run anchor: where the run started, until a script moves it with `c.anchor(x, z)`.
    // Recovery walks back here, so it has to survive the context, not live inside it.
    let anchor = { x: latest?.player?.worldX ?? 0, z: latest?.player?.worldZ ?? 0 };
    const anchorAt = (x?: number, z?: number): { x: number; z: number } => {
      if (x !== undefined && z !== undefined) anchor = { x, z };
      return { ...anchor };
    };
```

and pass `atlas`, `collision`, `anchor: anchorAt` into `createWorkerContext`. The snippet context in `execute` gets the same three.

- [ ] **Step 5: Verify and commit**

```bash
cd web && npm run typecheck && npm run lint && npx vitest run
```

```bash
git add web/src/tasks/travel.ts web/src/tasks/travel.test.ts web/src/tasks/types.ts web/src/agent/workerContext.ts web/src/agent/workerContext.test.ts web/src/agent/worker.ts web/src/agent/worker.test.ts
git -c core.safecrlf=false commit -m "$(cat <<'EOF'
feat(tasks): add c.travel, the long-distance walking layer

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
EOF
)"
```

---

### Task 6: `c.find` - three layers of discovery

The owner's "camera can pan and find new resources" translated into this codebase: the bot's sight is the collector's 15-tile scan and the 104 x 104 built scene, not a camera, so discovery widens the scan, then consults the atlas, then walks a sweep. `nearest` tries all three in order and records which layer answered.

**Files:**
- Create: `web/src/tasks/find.ts`, `web/src/tasks/find.test.ts`
- Modify: `web/src/tasks/types.ts`, `web/src/agent/workerContext.ts`, `web/src/agent/workerContext.test.ts`

**Interfaces:**
- Consumes: `AtlasLoader` (Task 3), `Travel` (Task 5), `KIND_META` (Task 3), `BotSDK.scanNearbyLocs`.
- Produces:
  - `web/src/tasks/types.ts`: `FoundVia`, `FoundTarget`, `FindOpts`, `SweepOpts` (spec section 5), the `target` trace event, and `ScriptContext['find']`.
  - `web/src/tasks/find.ts`: `createFind(deps: FindDeps): Find`, `matchesKind(kind, entry): boolean`, `SWEEP_RINGS = [20, 40, 60]`, `SWEEP_POINTS = 8`.

- [ ] **Step 1: Types**

`web/src/tasks/types.ts`:

```ts
export type FoundVia = 'scene' | 'atlas' | 'sweep';
export interface FoundTarget {
  via: FoundVia; kind: ResourceKind; name: string;
  x: number; z: number; level: number; distance: number;
  loc?: NearbyLoc; npc?: NearbyNpc;                     // present only for `via: 'scene'`
  cluster?: AtlasCluster;
}
export interface FindOpts {
  /**
   * Matched against the scene entry's display name, and against an atlas cluster's variant
   * (the content debug name). A string is an exact, case-insensitive match; a RegExp is tested
   * as written. The two namespaces differ on purpose: 'Oak' is what the game calls it and
   * 'oaktree' is what the content does.
   */
  variant?: string | RegExp;
  radius?: number;                                      // scene radius, capped at 52
  maxDistance?: number; reachableOnly?: boolean;        // atlas filter in tiles; reachable defaults true
}
export interface SweepOpts { maxTiles?: number; pattern?: 'ring' | 'zones'; anchor?: { x: number; z: number } }
```

and the trace event, as a named type so `find.ts` can take it as a dependency without re-deriving it from the union:

```ts
/** `kind_` rather than `kind`: the trace union is already discriminated on `kind`. */
export interface TargetEvent {
  kind: 'target'; via: FoundVia; kind_: ResourceKind; name: string;
  x: number; z: number; distance: number;
}
```

appended to the `TraceEvent` union as `| TargetEvent`.

`ScriptContext` gains:

```ts
  find: {
    nearest(kind: ResourceKind, opts?: FindOpts): Promise<FoundTarget | null>;
    nearestAtlas(kind: ResourceKind, opts?: FindOpts): AtlasCluster | null;
    sweep(kind: ResourceKind, opts?: SweepOpts & FindOpts): Promise<FoundTarget | null>;
    landmark(id: string): AtlasLandmark | null;
  };
```

`traceView.ts`'s `describeEvent` needs a case for the new kind or the switch stops being exhaustive:

```ts
    case 'target': return `found ${e.name} via ${e.via} at ${e.x}, ${e.z} (${Math.round(e.distance)} tiles)`;
```

- [ ] **Step 2: Write the failing find tests**

`web/src/tasks/find.test.ts`:

```ts
import { expect, test, vi } from 'vitest';
import { createFind, SWEEP_POINTS } from './find';
import type { Atlas, WorldState } from './types';

const ATLAS: Atlas = {
  version: 1, source: { contentSha: 'x', generatedAt: '2026-09-06' },
  kinds: {} as Atlas['kinds'],
  clusters: [
    { id: 1, kind: 'tree', variant: 'oaktree', level: 0, x: 3260, z: 3200, n: 5, r: 2, region: 0 },
    { id: 2, kind: 'tree', variant: 'tree', level: 0, x: 3600, z: 3200, n: 9, r: 4, region: 0 }
  ],
  landmarks: [], routes: []
};

const loc = (name: string, x: number, z: number, options: string[]) =>
  ({ id: 1, name, x, z, level: 0, distance: Math.max(Math.abs(x - 3200), Math.abs(z - 3200)), options, optionsWithIndex: [], reachable: true });

function harness(scene: ReturnType<typeof loc>[], atlas: Atlas | null = ATLAS) {
  const player = { worldX: 3200, worldZ: 3200, level: 0 };
  const state = () => ({ player, nearbyLocs: scene, nearbyNpcs: [] } as unknown as WorldState);
  const travelled: { x: number; z: number }[] = [];
  const trace = vi.fn();
  const abort = new AbortController();
  const find = createFind({
    state,
    sdk: { scanNearbyLocs: vi.fn(async () => scene) } as never,
    atlas: { load: async () => atlas, peek: () => atlas, nearestCluster: (a, kind, from, opts) =>
      a.clusters.filter(c => c.kind === kind && (!opts?.variant || (typeof opts.variant === 'string' ? c.variant === opts.variant : opts.variant.test(c.variant))))
        .filter(c => opts?.maxDistance === undefined || Math.max(Math.abs(c.x - from.x), Math.abs(c.z - from.z)) <= opts.maxDistance)
        .sort((a2, b) => Math.abs(a2.x - from.x) - Math.abs(b.x - from.x))[0] ?? null,
      landmark: () => null },
    travel: {
      to: vi.fn(async (target: { x?: number; cluster?: { x: number; z: number } }) => {
        const at = 'cluster' in target && target.cluster ? target.cluster : (target as { x: number; z: number });
        travelled.push({ x: at.x, z: at.z });
        player.worldX = at.x; player.worldZ = at.z;
        return { success: true, legs: 1, tiles: 1 };
      }),
      distanceTo: () => 0
    },
    status: vi.fn(),
    trace,
    signal: () => abort.signal
  });
  return { find, travelled, trace, player, abort, scene };
}

test('the scene answers first, and the trace says so', async () => {
  const { find, trace, travelled } = harness([loc('Tree', 3205, 3200, ['Chop down'])]);
  const found = await find.nearest('tree');
  expect(found).toMatchObject({ via: 'scene', name: 'Tree', x: 3205, distance: 5 });
  expect(travelled).toEqual([]);
  expect(trace).toHaveBeenCalledWith(expect.objectContaining({ kind: 'target', via: 'scene' }));
});

test('a scene entry without the kind s option is not a match', async () => {
  const { find } = harness([loc('Tree', 3205, 3200, ['Examine'])]);
  expect(await find.nearest('tree', { maxDistance: 0 })).toBeNull();
});

test('an unreachable scene entry is skipped', async () => {
  const scene = [{ ...loc('Tree', 3202, 3200, ['Chop down']), reachable: false }, loc('Tree', 3208, 3200, ['Chop down'])];
  const { find } = harness(scene);
  expect((await find.nearest('tree'))!.x).toBe(3208);
});

test('with nothing in the scene the atlas answers, and travel is used to get there', async () => {
  const { find, travelled, trace } = harness([]);
  const found = await find.nearest('tree', { variant: 'oaktree' });
  expect(travelled).toEqual([{ x: 3260, z: 3200 }]);
  expect(found).toMatchObject({ via: 'atlas', cluster: expect.objectContaining({ id: 1 }) });
  expect(trace).toHaveBeenCalledWith(expect.objectContaining({ kind: 'target', via: 'atlas' }));
});

test('with no atlas match the sweep walks its ring and gives up inside its budget', async () => {
  const { find, travelled } = harness([], { ...ATLAS, clusters: [] });
  const found = await find.nearest('rock');
  expect(found).toBeNull();
  expect(travelled.length).toBe(SWEEP_POINTS);
});

test('the sweep stops the moment a scan finds something', async () => {
  const scene: ReturnType<typeof loc>[] = [];
  const { find, travelled } = harness(scene, { ...ATLAS, clusters: [] });
  // The second sweep point brings a rock into view.
  const original = travelled.push.bind(travelled);
  travelled.push = (...args) => {
    const n = original(...args);
    if (n === 2) scene.push(loc('Rocks', 3200, 3200, ['Mine']));
    return n;
  };
  const found = await find.sweep('rock');
  expect(found).toMatchObject({ via: 'sweep', name: 'Rocks' });
  expect(travelled.length).toBe(2);
});

test('an abort ends a sweep between points', async () => {
  const { find, travelled, abort } = harness([], { ...ATLAS, clusters: [] });
  abort.abort();
  expect(await find.sweep('rock')).toBeNull();
  expect(travelled).toEqual([]);
});

test('a radius over 15 asks the sdk to re-scan, and a radius over 52 is capped', async () => {
  const { find } = harness([loc('Tree', 3230, 3200, ['Chop down'])]);
  const deps = (find as unknown as { sdk: { scanNearbyLocs: ReturnType<typeof vi.fn> } });
  await find.nearest('tree', { radius: 400 });
  expect(deps.sdk.scanNearbyLocs).toHaveBeenCalledWith(52);
});
```

The last test needs the harness to expose its `sdk` spy; add it to the returned object rather than reaching through the closure.

Run: expect FAIL (module missing).

- [ ] **Step 3: Implement find**

`web/src/tasks/find.ts`:

```ts
// `c.find`: three widening layers of "where is the nearest X", tried in order and reported so
// the trace says which one answered.
//
// Layer 1 is the current snapshot (and, past 15 tiles, an on-demand SDK re-scan). Layer 2 is the
// static atlas plus a `travel.to` to the cluster it names. Layer 3 walks a ring of scan points
// around the anchor. There is no camera layer: panning the client's camera changes nothing the
// bot can see, because the collector reads the scene graph, not the render view.
import { KIND_META } from '../data/gen/kinds';
import type { AtlasLoader } from './atlas';
import type { Travel } from './travel';
import type {
  AtlasCluster, AtlasLandmark, FindOpts, FoundTarget, ResourceKind, ScriptContext, SweepOpts, TargetEvent
} from './types';
import type { WorldState } from '../agent/types';
import type { NearbyLoc, NearbyNpc } from '../vendor/rs-sdk/sdk/types';

/** Spec decision 4. The scene is 104 x 104 tiles, so 52 is the furthest that is built. */
export const DEFAULT_RADIUS = 15;
export const MAX_RADIUS = 52;
export const SWEEP_RINGS = [20, 40, 60];
export const SWEEP_POINTS = 8;
export const DEFAULT_SWEEP_TILES = 200;

export interface FindDeps {
  state(): WorldState;
  sdk: { scanNearbyLocs(radius?: number): Promise<NearbyLoc[]> };
  atlas: AtlasLoader;
  travel: Travel;
  status(text: string): void;
  trace(event: TargetEvent): void;
  signal(): AbortSignal;
}

export type Find = ScriptContext['find'];

const nameMatches = (name: string, want: FindOpts['variant']): boolean =>
  want === undefined ? true : typeof want === 'string' ? name.toLowerCase() === want.toLowerCase() : want.test(name);

/** A scene entry is this kind when it publishes the kind's interaction option. */
export function matchesKind(kind: ResourceKind, options: string[]): boolean {
  const want = KIND_META[kind].op.toLowerCase();
  return options.some(o => o.toLowerCase() === want);
}

export function createFind(d: FindDeps): Find {
  const here = (): { x: number; z: number; level: number } => {
    const p = d.state().player;
    return { x: p?.worldX ?? 0, z: p?.worldZ ?? 0, level: p?.level ?? 0 };
  };

  const report = (target: FoundTarget): FoundTarget => {
    d.trace({ kind: 'target', via: target.via, kind_: target.kind, name: target.name, x: target.x, z: target.z, distance: target.distance });
    return target;
  };

  /** Layer 1. Fishing spots are NPCs; everything else is a loc. */
  async function scene(kind: ResourceKind, opts: FindOpts, via: 'scene' | 'sweep'): Promise<FoundTarget | null> {
    const radius = Math.min(opts.radius ?? DEFAULT_RADIUS, MAX_RADIUS);
    if (radius > DEFAULT_RADIUS) {
      // The collector's own scan is 15 tiles; past that the SDK has to ask the client to walk
      // the built scene again, which also re-fills the reach probe.
      await d.sdk.scanNearbyLocs(radius).catch(() => []);
    }
    const from = here();
    if (kind === 'fishing-spot') {
      const npc = (d.state().nearbyNpcs ?? [])
        .filter((n: NearbyNpc) => nameMatches(n.name, opts.variant) && (opts.reachableOnly === false || n.reachable !== false))
        .filter(n => n.distance <= radius)
        .sort((a, b) => a.distance - b.distance)[0];
      return npc
        ? { via, kind, name: npc.name, x: npc.tileX ?? npc.x, z: npc.tileZ ?? npc.z, level: from.level, distance: npc.distance, npc }
        : null;
    }
    const loc = (d.state().nearbyLocs ?? [])
      .filter((l: NearbyLoc) => matchesKind(kind, l.options) && nameMatches(l.name, opts.variant) && (opts.reachableOnly === false || l.reachable !== false))
      .filter(l => l.distance <= radius)
      .sort((a, b) => a.distance - b.distance)[0];
    return loc ? { via, kind, name: loc.name, x: loc.x, z: loc.z, level: loc.level, distance: loc.distance, loc } : null;
  }

  function nearestAtlas(kind: ResourceKind, opts: FindOpts = {}): AtlasCluster | null {
    const atlas = d.atlas.peek();
    return atlas ? d.atlas.nearestCluster(atlas, kind, here(), opts) : null;
  }

  async function sweep(kind: ResourceKind, opts: SweepOpts & FindOpts = {}): Promise<FoundTarget | null> {
    const budget = opts.maxTiles ?? DEFAULT_SWEEP_TILES;
    const anchor = opts.anchor ?? { x: here().x, z: here().z };
    const points = opts.pattern === 'zones' ? zonePoints(anchor) : ringPoints(anchor);
    let walked = 0;
    for (let i = 0; i < points.length; i++) {
      if (d.signal().aborted) return null;
      if (walked >= budget) return null;
      d.status(`Looking for a ${KIND_META[kind].label}, ${i + 1} of ${points.length}`);
      const result = await d.travel.to({ x: points[i].x, z: points[i].z });
      walked += result.tiles;
      const found = await scene(kind, opts, 'sweep');
      if (found) return report(found);
    }
    return null;
  }

  async function nearest(kind: ResourceKind, opts: FindOpts = {}): Promise<FoundTarget | null> {
    const inScene = await scene(kind, opts, 'scene');
    if (inScene) return report(inScene);

    await d.atlas.load();
    const cluster = nearestAtlas(kind, opts);
    if (cluster && !d.signal().aborted) {
      d.status(`Walking to the nearest ${KIND_META[kind].label}`);
      const trip = await d.travel.to({ cluster });
      if (trip.success) {
        const at = await scene(kind, opts, 'scene');
        // The cluster is where the content places the resource; the scene is the truth about
        // what is standing there now. Report the cluster either way so a script can retry it.
        const from = here();
        return report(at
          ? { ...at, via: 'atlas', cluster }
          : { via: 'atlas', kind, name: cluster.variant, x: cluster.x, z: cluster.z, level: cluster.level, distance: Math.max(Math.abs(cluster.x - from.x), Math.abs(cluster.z - from.z)), cluster });
      }
    }

    return sweep(kind, opts);
  }

  /** SWEEP_POINTS points on each ring, nearest ring first. */
  function ringPoints(anchor: { x: number; z: number }): { x: number; z: number }[] {
    const out: { x: number; z: number }[] = [];
    for (const radius of SWEEP_RINGS) {
      for (let i = 0; i < SWEEP_POINTS; i++) {
        const angle = (i / SWEEP_POINTS) * Math.PI * 2;
        out.push({ x: Math.round(anchor.x + Math.cos(angle) * radius), z: Math.round(anchor.z + Math.sin(angle) * radius) });
      }
    }
    return out.slice(0, SWEEP_POINTS * SWEEP_RINGS.length);
  }

  /** The centres of the eight neighbouring zone groups (8 tiles to a zone, 8 zones across). */
  function zonePoints(anchor: { x: number; z: number }): { x: number; z: number }[] {
    const step = 64;
    const out: { x: number; z: number }[] = [];
    for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
      if (dx === 0 && dz === 0) continue;
      out.push({ x: anchor.x + dx * step, z: anchor.z + dz * step });
    }
    return out;
  }

  return {
    nearest,
    nearestAtlas,
    sweep,
    landmark: (id: string): AtlasLandmark | null => {
      const atlas = d.atlas.peek();
      return atlas ? d.atlas.landmark(atlas, id) : null;
    }
  };
}
```

Run: `cd web && npx vitest run src/tasks/find.test.ts` - expect PASS. **Mutate**: make `nearest` skip the scene layer and confirm the first test fails; make `sweep` ignore `signal()` and confirm the abort test fails.

- [ ] **Step 4: Hang find off the context, and prove the fallback order end to end**

`web/src/agent/workerContext.ts`: build `createFind({ state, sdk, atlas: d.atlas, travel, status, trace, signal: d.signal })` after `travel`, and add `find` to the `ctx` literal.

`web/src/agent/worker.test.ts` - the worker-level assertion spec section 3.7 asks for:

```ts
test('discovery falls through scene, then atlas, then sweep', async () => {
  const { ctx, calls } = workerWithFakeTransport({ scene: [], atlas: ATLAS_WITH_NO_MATCH });
  await ctx.find.nearest('tree');
  expect(calls.map(c => c.layer)).toEqual(['scene', 'atlas', 'sweep']);
});
```

- [ ] **Step 5: Verify and commit**

```bash
cd web && npm run typecheck && npm run lint && npx vitest run
```

```bash
git add web/src/tasks/find.ts web/src/tasks/find.test.ts web/src/tasks/types.ts web/src/agent/workerContext.ts web/src/agent/workerContext.test.ts web/src/agent/worker.test.ts web/src/plugins/builtin/traceView.ts
git -c core.safecrlf=false commit -m "$(cat <<'EOF'
feat(tasks): add c.find with scene, atlas and sweep discovery layers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
EOF
)"
```

---

### Task 7: The health monitor and the recovery ladder

State detection and reset. A monitor runs in the Worker beside the runner and is evaluated on every state message, independent of which task is selected. It never runs a task itself: it sets a **pending recovery** which the runner drains before evaluating `script.tasks`, as a synthetic task named `recover:<condition>` that is traced like any other and counts against its own `maxAttempts`.

The escalation ladder, each rung traced: recover, re-anchor, restart the current task, pause `stuck` with a snapshot, fail with a typed `FailReason`.

**Files:**
- Create: `web/src/tasks/health.ts`, `web/src/tasks/health.test.ts`, `web/src/tasks/healthMonitor.ts`, `web/src/tasks/healthMonitor.test.ts`, `web/src/tasks/recovery.ts`, `web/src/tasks/recovery.test.ts`
- Modify: `web/src/tasks/types.ts`, `web/src/tasks/runner.ts`, `web/src/tasks/runner.test.ts`, `web/src/agent/worker.ts`, `web/src/agent/worker.test.ts`, `web/src/agent/workerContext.ts`, `web/src/plugins/builtin/traceView.ts`

**Interfaces:**
- Consumes: `RunnerDeps` (Task 1), `ScriptContext['travel']` and `anchor` (Task 5), `ScriptContext['find']` (Task 6).
- Produces:
  - `web/src/tasks/types.ts`: `HealthCondition`, `RecoveryOutcome`, `HealthEvent`, `FailReason`, `HealthPolicy`, the `health` and `recovery` trace events, `ScriptManifest.health`, `ScriptManifest.anchor`, `Task.recovers`, `ScriptContext['health']`.
  - `web/src/tasks/health.ts`: `type HealthMemory`, `emptyMemory(now): HealthMemory`, `observe(memory, state, now): HealthMemory`, and one exported predicate per condition (`isNoProgress`, `isUnexpectedInterface`, `isDialogStuck`, `isLevelUp`, `isDeath`, `isInventoryFull`, `isOutOfSupplies`), plus `evaluate(memory, state, now, policy): HealthCondition | null`.
  - `web/src/tasks/healthMonitor.ts`: `createHealthMonitor(deps): HealthMonitor` with `observe`, `note`, `takeRecovery`, `settle`, `is`, `last`, `recovered`, `counts`, `dispose`; and `type Escalation = 'continue' | 're-anchor' | 'pause-stuck' | { fail: FailReason }`.
  - `web/src/tasks/recovery.ts`: `recoveryTaskFor(condition, deps): Task | null`.
  - `web/src/tasks/runner.ts`: `RunnerDeps.recovery?(): Task | null`, `Runner.fail(reason: FailReason): void`, `Runner.failReason(): FailReason | null`.

- [ ] **Step 1: Types**

`web/src/tasks/types.ts`, copied from spec section 5:

```ts
export type HealthCondition =
  | 'no-progress' | 'unexpected-interface' | 'dialog-stuck' | 'level-up'
  | 'death' | 'logout' | 'inventory-full' | 'out-of-supplies' | 'low-hp';
export type RecoveryOutcome = 'recovered' | 'escalated' | 'failed' | 'handled-by-script';
export interface HealthEvent { condition: HealthCondition; at: number; detail?: string; snapshot?: unknown }
export type FailReason =
  | 'stuck' | 'unreachable' | 'no_progress' | 'died' | 'disconnected'
  | 'out_of_supplies' | 'inventory_full' | 'requirements' | 'timeout' | 'aborted' | 'crashed';

export interface HealthPolicy {
  noProgressMs?: number;                                // default 90_000
  onDeath?: 'resume' | 'return-and-resume' | 'fail';    // default 'return-and-resume'
  maxRelogins?: number; maxRecoveryAttempts?: number;   // defaults 2 and 2 (per condition)
  expectInterfaces?: number[];                          // modal ids this script opens on purpose
  consumes?: string[];                                  // item names whose exhaustion ends the run
}
```

`ScriptManifest` gains `health?: HealthPolicy;` and `anchor?: { x: number; z: number };`. `Task` gains `recovers?: HealthCondition[];`. `TraceEvent` gains:

```ts
  | { kind: 'health'; condition: HealthCondition; detail?: string }
  | { kind: 'recovery'; condition: HealthCondition; action: string; outcome: RecoveryOutcome }
```

`ScriptContext` gains:

```ts
  health: {
    /** True while this condition is the one waiting for a recovery. A task claims it with `when`. */
    is(condition: HealthCondition): boolean;
    last(): HealthEvent | null;
    /** A script handler reporting that it dealt with the condition itself. */
    recovered(condition: HealthCondition): void;
  };
```

`traceView.ts`'s `describeEvent` gains:

```ts
    case 'health': return `health: ${e.condition}${e.detail ? ` (${e.detail})` : ''}`;
    case 'recovery': return `recovery ${e.condition}: ${e.action} -> ${e.outcome}`;
```

- [ ] **Step 2: Write the failing predicate tests**

`web/src/tasks/health.test.ts`. Every check is a pure function over a snapshot, which is the only way they can be tested honestly.

```ts
import { expect, test } from 'vitest';
import { emptyMemory, evaluate, isDeath, isDialogStuck, isInventoryFull, isLevelUp, isNoProgress, isOutOfSupplies, isUnexpectedInterface, observe } from './health';
import type { WorldState } from '../agent/types';

const world = (patch: Partial<WorldState>): WorldState => ({
  player: { worldX: 100, worldZ: 100, level: 0, hp: 10, isDead: false, lifeId: 1 },
  skills: [{ name: 'Woodcutting', experience: 100, baseLevel: 5 }],
  inventory: [], modalOpen: false, modalInterface: -1, interfaceTexts: {},
  dialog: { isOpen: false }, ...patch
} as unknown as WorldState);

test('no-progress needs xp, inventory and position all still for the whole window', () => {
  let mem = observe(emptyMemory(0), world({}), 0);
  mem = observe(mem, world({}), 89_000);
  expect(isNoProgress(mem, 89_000, 90_000)).toBe(false);
  mem = observe(mem, world({}), 91_000);
  expect(isNoProgress(mem, 91_000, 90_000)).toBe(true);
});

test('any one of xp, inventory or position moving resets the window', () => {
  const cases: Partial<WorldState>[] = [
    { skills: [{ name: 'Woodcutting', experience: 200, baseLevel: 5 }] as WorldState['skills'] },
    { inventory: [{ id: 1, count: 1, name: 'Logs' }] as WorldState['inventory'] },
    { player: { worldX: 101, worldZ: 100, level: 0, hp: 10, isDead: false, lifeId: 1 } as WorldState['player'] }
  ];
  for (const patch of cases) {
    let mem = observe(emptyMemory(0), world({}), 0);
    mem = observe(mem, world(patch), 91_000);
    expect(isNoProgress(mem, 91_000, 90_000)).toBe(false);
  }
});

test('a modal the script declared is expected; any other is not', () => {
  expect(isUnexpectedInterface(world({ modalOpen: true, modalInterface: 3559 }), [3559])).toBe(false);
  expect(isUnexpectedInterface(world({ modalOpen: true, modalInterface: 12 }), [3559])).toBe(true);
  expect(isUnexpectedInterface(world({ modalOpen: false, modalInterface: 12 }), [])).toBe(false);
});

test('dialog-stuck needs an open dialog with no options, held for 15 seconds', () => {
  const open = world({ dialog: { isOpen: true, options: [] } as WorldState['dialog'] });
  let mem = observe(emptyMemory(0), open, 0);
  mem = observe(mem, open, 14_000);
  expect(isDialogStuck(mem, 14_000)).toBe(false);
  mem = observe(mem, open, 16_000);
  expect(isDialogStuck(mem, 16_000)).toBe(true);
});

test('a dialog with options is a choice, not a stuck dialog', () => {
  const choice = world({ dialog: { isOpen: true, options: ['Yes', 'No'] } as WorldState['dialog'] });
  let mem = observe(emptyMemory(0), choice, 0);
  mem = observe(mem, choice, 60_000);
  expect(isDialogStuck(mem, 60_000)).toBe(false);
});

test('level-up is read from the interface text, not from a component id', () => {
  expect(isLevelUp(world({ interfaceTexts: { 740: 'Congratulations, you just advanced a Woodcutting level.' } }))).toBe(true);
  expect(isLevelUp(world({ interfaceTexts: { 740: 'You need a bronze axe.' } }))).toBe(false);
});

test('death fires on isDead and on a lifeId that moved', () => {
  const mem = observe(emptyMemory(0), world({}), 0);
  expect(isDeath(world({ player: { ...world({}).player!, isDead: true } }), mem)).toBe(true);
  expect(isDeath(world({ player: { ...world({}).player!, lifeId: 2 } }), mem)).toBe(true);
  expect(isDeath(world({}), mem)).toBe(false);
});

test('inventory-full is 28 slots', () => {
  expect(isInventoryFull(world({ inventory: new Array(28).fill({ id: 1, count: 1 }) as WorldState['inventory'] }))).toBe(true);
  expect(isInventoryFull(world({ inventory: new Array(27).fill({ id: 1, count: 1 }) as WorldState['inventory'] }))).toBe(false);
});

test('out-of-supplies fires only for an item the script declared', () => {
  const empty = world({ inventory: [] });
  expect(isOutOfSupplies(empty, ['Tinderbox'])).toBe(true);
  expect(isOutOfSupplies(empty, [])).toBe(false);
  expect(isOutOfSupplies(world({ inventory: [{ id: 1, count: 1, name: 'Tinderbox' }] as WorldState['inventory'] }), ['Tinderbox'])).toBe(false);
});

test('evaluate returns the most urgent condition, not the first one it looks at', () => {
  const dying = world({ player: { ...world({}).player!, isDead: true }, modalOpen: true, modalInterface: 99 });
  expect(evaluate(observe(emptyMemory(0), world({}), 0), dying, 0, {})).toBe('death');
});
```

Run: expect FAIL.

- [ ] **Step 3: Implement the predicates**

`web/src/tasks/health.ts`:

```ts
// The health checks as pure predicates over a snapshot plus a small rolling memory. Nothing here
// runs a task, touches the runner or holds a timer: `healthMonitor.ts` owns all of that, and
// keeping this half pure is what makes every condition testable against a fixture world.
import type { HealthCondition, HealthPolicy } from './types';
import type { WorldState } from '../agent/types';

export const DEFAULT_NO_PROGRESS_MS = 90_000;
const DIALOG_STUCK_MS = 15_000;
const INVENTORY_SLOTS = 28;
/** The engine's own wording; matching text rather than a component id survives a content bump. */
const LEVEL_UP_RE = /you just advanced|congratulations.*\blevel\b/i;

export interface HealthMemory {
  /** The last time anything the run cares about moved: xp, inventory or position. */
  lastProgressAt: number;
  xpTotal: number;
  inventorySignature: string;
  position: string;
  /** When the current option-less dialog opened, or null. */
  dialogOpenSince: number | null;
  lifeId: number | undefined;
}

export function emptyMemory(now: number): HealthMemory {
  return { lastProgressAt: now, xpTotal: -1, inventorySignature: '', position: '', dialogOpenSince: null, lifeId: undefined };
}

const xpOf = (s: WorldState): number => (s.skills ?? []).reduce((n, k) => n + (k.experience ?? 0), 0);
const invOf = (s: WorldState): string => (s.inventory ?? []).map(i => `${i.id}x${i.count}`).join(',');
const posOf = (s: WorldState): string => `${s.player?.worldX ?? 0},${s.player?.worldZ ?? 0},${s.player?.level ?? 0}`;

/** One snapshot in, the next memory out. Call it for every state message, running or not. */
export function observe(memory: HealthMemory, s: WorldState, now: number): HealthMemory {
  const xpTotal = xpOf(s), inventorySignature = invOf(s), position = posOf(s);
  const moved = memory.xpTotal === -1
    || xpTotal !== memory.xpTotal || inventorySignature !== memory.inventorySignature || position !== memory.position;
  const optionless = s.dialog?.isOpen === true && (s.dialog.options?.length ?? 0) === 0;
  return {
    lastProgressAt: moved ? now : memory.lastProgressAt,
    xpTotal, inventorySignature, position,
    dialogOpenSince: optionless ? memory.dialogOpenSince ?? now : null,
    lifeId: s.player?.lifeId ?? memory.lifeId
  };
}

export function isNoProgress(memory: HealthMemory, now: number, windowMs = DEFAULT_NO_PROGRESS_MS): boolean {
  return now - memory.lastProgressAt >= windowMs;
}

export function isUnexpectedInterface(s: WorldState, expected: number[] = []): boolean {
  return s.modalOpen === true && !expected.includes(s.modalInterface ?? -1);
}

export function isDialogStuck(memory: HealthMemory, now: number): boolean {
  return memory.dialogOpenSince !== null && now - memory.dialogOpenSince >= DIALOG_STUCK_MS;
}

export function isLevelUp(s: WorldState): boolean {
  return Object.values(s.interfaceTexts ?? {}).some(text => LEVEL_UP_RE.test(text));
}

export function isDeath(s: WorldState, memory: HealthMemory): boolean {
  if (s.player?.isDead === true) return true;
  const lifeId = s.player?.lifeId;
  return memory.lifeId !== undefined && lifeId !== undefined && lifeId !== memory.lifeId;
}

export function isInventoryFull(s: WorldState): boolean {
  return (s.inventory?.length ?? 0) >= INVENTORY_SLOTS;
}

export function isOutOfSupplies(s: WorldState, consumes: string[] = []): boolean {
  if (consumes.length === 0) return false;
  const held = new Set((s.inventory ?? []).map(i => (i.name ?? '').toLowerCase()));
  return consumes.some(name => !held.has(name.toLowerCase()));
}

/**
 * The condition to act on, most urgent first. Order matters: a dead character inside an
 * unexpected interface is a death, and treating it as an interface would click at a respawn
 * screen for the rest of the run.
 */
export function evaluate(memory: HealthMemory, s: WorldState, now: number, policy: HealthPolicy): HealthCondition | null {
  if (isDeath(s, memory)) return 'death';
  if (isLevelUp(s)) return 'level-up';
  if (isUnexpectedInterface(s, policy.expectInterfaces)) return 'unexpected-interface';
  if (isDialogStuck(memory, now)) return 'dialog-stuck';
  if (isOutOfSupplies(s, policy.consumes)) return 'out-of-supplies';
  if (isInventoryFull(s)) return 'inventory-full';
  if (isNoProgress(memory, now, policy.noProgressMs ?? DEFAULT_NO_PROGRESS_MS)) return 'no-progress';
  return null;
}
```

Run: expect PASS. **Mutate**: swap the `death` and `unexpected-interface` lines in `evaluate` and confirm the last test fails.

- [ ] **Step 4: The monitor and the ladder, test first**

`web/src/tasks/healthMonitor.test.ts`:

```ts
import { expect, test, vi } from 'vitest';
import { createHealthMonitor } from './healthMonitor';
import type { WorldState } from '../agent/types';

const alive = { player: { worldX: 1, worldZ: 1, level: 0, hp: 10, isDead: false, lifeId: 1 }, skills: [], inventory: [], modalOpen: false, modalInterface: -1, interfaceTexts: {}, dialog: { isOpen: false } } as unknown as WorldState;
const dead = { ...alive, player: { ...alive.player!, isDead: true } } as WorldState;

const make = (policy = {}) => {
  const trace = vi.fn();
  let clock = 0;
  const monitor = createHealthMonitor({ policy, trace, claims: () => false, now: () => clock });
  return { monitor, trace, tick: (at: number) => { clock = at; } };
};

test('a condition fires once, not once per tick', () => {
  const { monitor, trace } = make();
  monitor.observe(dead, 0);
  monitor.observe(dead, 600);
  expect(trace.mock.calls.filter(c => c[0].kind === 'health').length).toBe(1);
});

test('the pending recovery is handed out once and then cleared', () => {
  const { monitor } = make();
  monitor.observe(dead, 0);
  expect(monitor.takeRecovery()).toBe('death');
  expect(monitor.takeRecovery()).toBeNull();
});

test('a condition a script claims is never turned into a recovery', () => {
  const trace = vi.fn();
  const monitor = createHealthMonitor({ policy: {}, trace, claims: c => c === 'death' });
  monitor.observe(dead, 0);
  expect(monitor.takeRecovery()).toBeNull();
  expect(trace).toHaveBeenCalledWith(expect.objectContaining({ kind: 'recovery', outcome: 'handled-by-script' }));
});

test('the ladder escalates: recover, re-anchor, pause stuck, fail', () => {
  const { monitor } = make({ maxRecoveryAttempts: 2 });
  monitor.observe(dead, 0);
  monitor.takeRecovery();
  expect(monitor.settle('death', 'recovered')).toBe('continue');
  monitor.observe({ ...dead, player: { ...dead.player!, lifeId: 2 } } as WorldState, 1000);
  monitor.takeRecovery();
  // Spec decision 5: a second death in one run ends it.
  expect(monitor.settle('death', 'failed')).toEqual({ fail: 'died' });
});

test('a failed recovery re-anchors before it pauses, and pauses before it fails', () => {
  const { monitor } = make({ maxRecoveryAttempts: 2 });
  monitor.observe({ ...alive, skills: [] } as WorldState, 0);
  monitor.observe(alive, 200_000);                 // no-progress
  expect(monitor.takeRecovery()).toBe('no-progress');
  expect(monitor.settle('no-progress', 'failed')).toBe('re-anchor');
  monitor.observe(alive, 400_000);
  monitor.takeRecovery();
  expect(monitor.settle('no-progress', 'failed')).toBe('pause-stuck');
});

test('counts are per condition and feed the run summary', () => {
  const { monitor } = make();
  monitor.observe(dead, 0);
  monitor.takeRecovery();
  monitor.settle('death', 'recovered');
  expect(monitor.counts()).toEqual({ death: 1 });
});

test('after dispose no observation produces an event', () => {
  const { monitor, trace } = make();
  monitor.dispose();
  monitor.observe(dead, 0);
  expect(trace).not.toHaveBeenCalled();
  expect(monitor.takeRecovery()).toBeNull();
});
```

`web/src/tasks/healthMonitor.ts`:

```ts
// The stateful half of state detection. It watches every snapshot, decides when a condition has
// newly fired, and hands the runner one pending recovery at a time. It never runs a task itself:
// the runner drains `takeRecovery()` before it evaluates the script's own tasks, so a recovery is
// an ordinary traced task with its own attempts.
import { emptyMemory, evaluate, observe, type HealthMemory } from './health';
import type { FailReason, HealthCondition, HealthEvent, HealthPolicy, RecoveryOutcome, TraceEvent } from './types';
import type { HookEvent, WorldState } from '../agent/types';

export type Escalation = 'continue' | 're-anchor' | 'pause-stuck' | { fail: FailReason };

/** Where a condition ends up when its recoveries keep failing. */
const TERMINAL: Partial<Record<HealthCondition, FailReason>> = {
  death: 'died',
  logout: 'disconnected',
  'out-of-supplies': 'out_of_supplies',
  'inventory-full': 'inventory_full',
  'no-progress': 'no_progress'
};

export interface HealthMonitorDeps {
  policy: HealthPolicy;
  trace(event: Omit<Extract<TraceEvent, { kind: 'health' | 'recovery' }>, 'seq' | 'at'>): void;
  /** True when the running script declares a task that handles this condition itself. */
  claims(condition: HealthCondition): boolean;
  now(): number;
}

export interface HealthMonitor {
  observe(state: WorldState, now: number): void;
  /** Hook events a snapshot cannot show. */
  note(event: HookEvent, now: number): void;
  /** The condition to recover from next, consumed by the caller. */
  takeRecovery(): HealthCondition | null;
  /** Report how a recovery ended; the ladder answers with what to do next. */
  settle(condition: HealthCondition, outcome: RecoveryOutcome): Escalation;
  is(condition: HealthCondition): boolean;
  last(): HealthEvent | null;
  recovered(condition: HealthCondition): void;
  counts(): Partial<Record<HealthCondition, number>>;
  dispose(): void;
}

export function createHealthMonitor(d: HealthMonitorDeps): HealthMonitor {
  const maxAttempts = d.policy.maxRecoveryAttempts ?? 2;
  const counts: Partial<Record<HealthCondition, number>> = {};
  const attempts = new Map<HealthCondition, number>();
  let memory: HealthMemory | null = null;
  let pending: HealthCondition | null = null;
  let active: HealthCondition | null = null;
  let lastEvent: HealthEvent | null = null;
  let disposed = false;

  function fire(condition: HealthCondition, at: number, detail?: string): void {
    // One event per occurrence, not one per tick: a death is visible for many ticks, and a
    // recovery queue that grew every tick would never drain.
    if (active === condition || pending === condition) return;
    lastEvent = { condition, at, detail };
    counts[condition] = (counts[condition] ?? 0) + 1;
    d.trace({ kind: 'health', condition, ...(detail === undefined ? {} : { detail }) });
    if (d.claims(condition)) {
      // The script owns this one. Say so in the trace, and leave the queue alone so the
      // script's own `when` (which tests `c.health.is`) picks it up on the next evaluation.
      active = condition;
      d.trace({ kind: 'recovery', condition, action: 'script', outcome: 'handled-by-script' });
      return;
    }
    pending = condition;
  }

  return {
    observe(state, now) {
      if (disposed) return;
      memory = observe(memory ?? emptyMemory(now), state, now);
      const condition = evaluate(memory, state, now, d.policy);
      if (condition) fire(condition, now);
    },
    note(event, now) {
      if (disposed) return;
      if (event.name === 'logout' || event.name === 'disconnect') fire('logout', now, event.name);
    },
    takeRecovery() {
      if (disposed) return null;
      const next = pending;
      pending = null;
      if (next) active = next;
      return next;
    },
    settle(condition, outcome) {
      const tried = (attempts.get(condition) ?? 0) + 1;
      attempts.set(condition, tried);
      d.trace({ kind: 'recovery', condition, action: `attempt ${tried}`, outcome });
      if (outcome === 'recovered' || outcome === 'handled-by-script') {
        attempts.delete(condition);
        active = null;
        // The progress clock has to move too, or a recovery that worked is followed straight
        // back into `no-progress` by the same window it was already inside.
        if (memory) memory = { ...memory, lastProgressAt: d.now() };
        return 'continue';
      }
      active = null;
      if (tried === 1) return 're-anchor';
      if (tried < maxAttempts + 1) return 'pause-stuck';
      const reason = TERMINAL[condition];
      return reason ? { fail: reason } : 'pause-stuck';
    },
    is: condition => active === condition || pending === condition,
    last: () => lastEvent,
    recovered(condition) {
      if (active === condition || pending === condition) {
        attempts.delete(condition);
        active = null;
        pending = null;
        d.trace({ kind: 'recovery', condition, action: 'script', outcome: 'recovered' });
      }
    },
    counts: () => ({ ...counts }),
    dispose() {
      disposed = true;
      pending = null;
      active = null;
      memory = null;
    }
  };
}
```

The `lastProgressAt: Number.MAX_SAFE_INTEGER` above is wrong on its face: it must be "now", not "never". Fix it while implementing by taking `now` as a `settle` parameter, or by having the monitor keep its own clock dep. Prefer a `now(): number` dep on `HealthMonitorDeps` and use `memory = { ...memory, lastProgressAt: d.now() }`. Add a test that a recovered `no-progress` does not fire again on the very next observation.

Run: `cd web && npx vitest run src/tasks/healthMonitor.test.ts` - expect PASS.

- [ ] **Step 5: The default recovery tasks**

`web/src/tasks/recovery.test.ts` asserts each recovery does the one thing the spec's table says, and that an unknown condition has no task:

```ts
import { expect, test, vi } from 'vitest';
import { recoveryTaskFor } from './recovery';
import type { ScriptContext, WorldState } from './types';

/** A context whose world the test drives, so "did the recovery work" is a real question. */
function fakeCtx(world: Partial<WorldState>, opts: { anchor?: { x: number; z: number } } = {}) {
  let state = { modalOpen: false, dialog: { isOpen: false }, player: { worldX: 10, worldZ: 10 }, ...world } as WorldState;
  const ctx = {
    state: () => state,
    status: vi.fn(), log: vi.fn(),
    sdk: { sendCloseModal: vi.fn(async () => { state = { ...state, modalOpen: false }; return { success: true, message: 'closed' }; }) },
    bot: { dismissBlockingUI: vi.fn(async () => {}) },
    tutorial: { clickThrough: vi.fn(async () => { state = { ...state, dialog: { isOpen: false } } as WorldState; }) },
    travel: { to: vi.fn(async () => ({ success: true, legs: 1, tiles: 5 })), distanceTo: () => 0 },
    anchor: () => opts.anchor ?? { x: 10, z: 10 },
    wait: { until: async (p: (s: WorldState) => boolean) => p(state) }
  } as unknown as ScriptContext;
  return { ctx, set: (patch: Partial<WorldState>) => { state = { ...state, ...patch } as WorldState; } };
}

const deps = () => ({ settle: vi.fn() });

test('unexpected-interface closes the modal and settles recovered once it is gone', async () => {
  const d = deps();
  const { ctx } = fakeCtx({ modalOpen: true, modalInterface: 99 });
  await recoveryTaskFor('unexpected-interface', d)!.run(ctx);
  expect(ctx.sdk.sendCloseModal).toHaveBeenCalled();
  expect(d.settle).toHaveBeenCalledWith('unexpected-interface', 'recovered');
});

test('an interface that will not close falls back to dismiss and settles failed', async () => {
  const d = deps();
  const { ctx } = fakeCtx({ modalOpen: true, modalInterface: 99 });
  (ctx.sdk.sendCloseModal as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, message: 'no' });
  await recoveryTaskFor('unexpected-interface', d)!.run(ctx);
  expect(ctx.bot.dismissBlockingUI).toHaveBeenCalled();
  expect(d.settle).toHaveBeenCalledWith('unexpected-interface', 'failed');
});

test('dialog-stuck clicks through and settles on whether the dialog actually closed', async () => {
  const d = deps();
  const { ctx } = fakeCtx({ dialog: { isOpen: true, options: [] } as WorldState['dialog'] });
  await recoveryTaskFor('dialog-stuck', d)!.run(ctx);
  expect(ctx.tutorial.clickThrough).toHaveBeenCalledWith(5);
  expect(d.settle).toHaveBeenCalledWith('dialog-stuck', 'recovered');
});

test('level-up uses the same click-through and reports its own condition', async () => {
  const d = deps();
  const { ctx } = fakeCtx({ dialog: { isOpen: true, options: [] } as WorldState['dialog'] });
  await recoveryTaskFor('level-up', d)!.run(ctx);
  expect(d.settle).toHaveBeenCalledWith('level-up', 'recovered');
});

test('no-progress walks back to the anchor, not to wherever it happens to be', async () => {
  const d = deps();
  const { ctx } = fakeCtx({}, { anchor: { x: 50, z: 60 } });
  await recoveryTaskFor('no-progress', d)!.run(ctx);
  expect(ctx.travel.to).toHaveBeenCalledWith({ x: 50, z: 60 }, expect.objectContaining({ tolerance: 3 }));
  expect(d.settle).toHaveBeenCalledWith('no-progress', 'recovered');
});

test('a travel that fails settles failed, so the ladder escalates instead of looping', async () => {
  const d = deps();
  const { ctx } = fakeCtx({});
  (ctx.travel.to as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, reason: 'unreachable', legs: 2, tiles: 0 });
  await recoveryTaskFor('no-progress', d)!.run(ctx);
  expect(d.settle).toHaveBeenCalledWith('no-progress', 'failed');
});

test('inventory-full with no script handler settles failed rather than dropping something', async () => {
  const d = deps();
  const { ctx } = fakeCtx({});
  await recoveryTaskFor('inventory-full', d)!.run(ctx);
  expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining('full'), 'warn');
  expect(d.settle).toHaveBeenCalledWith('inventory-full', 'failed');
});

test('a condition with no default recovery returns null', () => {
  expect(recoveryTaskFor('low-hp', deps())).toBeNull();
});
```

`web/src/tasks/recovery.ts`:

```ts
// One task per condition, built on the same `ScriptContext` a script gets. They are ordinary
// tasks: the runner enters and exits them, traces them, and counts their attempts, which is what
// makes a recovery visible in the run report instead of being invisible runtime behaviour.
import type { HealthCondition, ScriptContext, Task } from './types';

export interface RecoveryDeps {
  /** How the recovery reports what happened, so the ladder can escalate. */
  settle(condition: HealthCondition, outcome: 'recovered' | 'failed'): void;
}

const CLICK_THROUGH = 5;

export function recoveryTaskFor(condition: HealthCondition, d: RecoveryDeps): Task | null {
  const name = `recover:${condition}`;
  const done = (c: ScriptContext, ok: boolean): void => { d.settle(condition, ok ? 'recovered' : 'failed'); };

  switch (condition) {
    case 'unexpected-interface':
      return {
        name, when: () => true, timeoutMs: 10_000, maxAttempts: 2,
        async run(c) {
          c.status('Closing an interface the script did not open');
          await c.sdk.sendCloseModal();
          const closed = await c.wait.until(s => s.modalOpen !== true, { timeoutMs: 3000, label: 'modal close' });
          if (!closed) await c.bot.dismissBlockingUI();
          done(c, c.state().modalOpen !== true);
        }
      };
    case 'dialog-stuck':
    case 'level-up':
      return {
        name, when: () => true, timeoutMs: 15_000, maxAttempts: 2,
        async run(c) {
          c.status(condition === 'level-up' ? 'Reading a level-up' : 'Clicking through a dialog');
          await c.tutorial.clickThrough(CLICK_THROUGH);
          done(c, c.state().dialog?.isOpen !== true);
        }
      };
    case 'no-progress':
      return {
        name, when: () => true, timeoutMs: 60_000, maxAttempts: 2,
        async run(c) {
          c.status('Nothing has happened for a while; looking around');
          const anchor = c.anchor();
          const trip = await c.travel.to({ x: anchor.x, z: anchor.z }, { tolerance: 3 });
          done(c, trip.success);
        }
      };
    case 'inventory-full':
      return {
        name, when: () => true, timeoutMs: 5000, maxAttempts: 1,
        async run(c) {
          // Nothing generic is safe here: dropping the wrong item loses it, and banking needs a
          // bank. A script that fills its inventory declares its own handler with `recovers`.
          c.log('The inventory is full and this script declares no way to empty it', 'warn');
          done(c, false);
        }
      };
    default:
      // death and logout are Task 8; low-hp is the runner's own hard stop.
      return null;
  }
}
```

- [ ] **Step 6: Drain recoveries in the runner**

`web/src/tasks/runner.ts`. `RunnerDeps` gains:

```ts
  /**
   * A recovery the health monitor wants run before the script's own tasks. Called once per
   * evaluation; returning null means there is nothing to recover from.
   */
  recovery?(): Task | null;
```

`Runner` gains:

```ts
  /** End the run with a typed reason. Used by the recovery ladder's last rung. */
  fail(reason: FailReason): void;
  failReason(): FailReason | null;
```

In `loop()`, the task selection becomes:

```ts
        // A recovery outranks the script: the monitor only queues one when the world is in a
        // state the script is not equipped for, and letting `when` win would run the script's
        // own task into the same wall that produced the condition.
        const task = d.recovery?.() ?? script.tasks.find(t => { try { return t.when(s, d.ctx); } catch { return false; } });
```

and the implementation of `fail`:

```ts
  let failure: FailReason | null = null;
  function fail(reason: FailReason): void {
    if (outcome) return;
    failure = reason;
    outcome = 'failed';
    trace.push({ kind: 'log', level: 'error', text: `run failed: ${reason}` });
    abortTask();
    runAbort.abort();
    wakeResume();
    wakeTick();
  }
```

with `fail` and `failReason: () => failure` on the returned object. The existing `hardStop.hpBelow` branch sets `failure = 'stuck'`... no: it sets `failure = 'low_hp'`? `FailReason` has no `low_hp`; use `failure ??= 'stuck'` there is wrong too. Set it to `'stuck'` only when the run pauses stuck; for the hard stop, extend the branch to `failure = 'died'`? None of those is honest. **Ruling:** add nothing to `FailReason`; the hard stop's branch sets `failure = 'stuck'` and its trace already says `hard-stop`, and Task 15 records that `low-hp` has no distinct `FailReason` in v1. If the reviewer prefers, add `'low_hp'` to the union - that is a one-line change and the closed set is ours.

Test in `runner.test.ts`:

```ts
test('a recovery runs before a script task that also matches', async () => { /* recovery() returns a task; assert task_enter order */ });
test('a run failed by the ladder reports its reason and stops the loop', async () => { /* runner.fail('died'); expect outcome 'failed' and failReason 'died' */ });
```

- [ ] **Step 7: Wire the monitor into the Worker**

`web/src/agent/worker.ts`, in `startRun` after the context is built:

```ts
    const policy = resolved.script.health ?? {};
    const monitor = createHealthMonitor({
      policy,
      now: Date.now,
      trace: e => t.push(e),
      // A script claims a condition by declaring a task that lists it in `recovers`.
      claims: condition => resolved.script.tasks.some(task => task.recovers?.includes(condition) === true)
    });
```

The monitor has to see every snapshot, running or not, so it hangs off the same fan-out the context does:

```ts
    const offMonitor = onTick(() => { if (latest) monitor.observe(latest, Date.now()); });
    const offEvents = ((): (() => void) => {
      const cb = (e: HookEvent): void => { monitor.note(e, Date.now()); };
      eventSubs.add(cb);
      return () => { eventSubs.delete(cb); };
    })();
```

and both are released in `endRun` beside `run.dispose()`, together with `monitor.dispose()`. **This is the teardown the handoff warns about:** the test for it asserts that no `health` trace event is written after `endRun`, not merely that a subscription was removed.

The runner's `recovery` dep:

```ts
      recovery: () => {
        const condition = monitor.takeRecovery();
        if (!condition) return null;
        return recoveryTaskFor(condition, {
          settle: (c, outcome) => {
            const next = monitor.settle(c, outcome);
            if (next === 're-anchor') void context.ctx.travel.to(context.ctx.anchor(), { tolerance: 3 });
            else if (next === 'pause-stuck') runner?.pause('stuck', 'runner');
            else if (typeof next === 'object') runner?.fail(next.fail);
          }
        });
      },
```

and `health` on the context deps:

```ts
      health: {
        is: condition => monitor.is(condition),
        last: () => monitor.last(),
        recovered: condition => { monitor.recovered(condition); }
      },
```

`endRun` puts `monitor.counts()` on the summary as `recoveries` (the field arrives in Task 11; add it here and let Task 11 use it).

- [ ] **Step 8: Prove the teardown**

`web/src/agent/worker.test.ts`:

```ts
test('the monitor stops observing when the run ends', async () => {
  const { post, traces } = startWorker();
  await runScript(SHORT_SCRIPT);                 // ends by itself
  traces.length = 0;
  post({ t: 'state', state: deadWorld });        // a death after the run is over
  await flush();
  expect(traces.filter(e => e.kind === 'health')).toEqual([]);
});
```

- [ ] **Step 9: Verify and commit**

```bash
cd web && npm run typecheck && npm run lint && npx vitest run
```

```bash
git add web/src/tasks/health.ts web/src/tasks/health.test.ts web/src/tasks/healthMonitor.ts web/src/tasks/healthMonitor.test.ts web/src/tasks/recovery.ts web/src/tasks/recovery.test.ts web/src/tasks/types.ts web/src/tasks/runner.ts web/src/tasks/runner.test.ts web/src/agent/worker.ts web/src/agent/worker.test.ts web/src/agent/workerContext.ts web/src/plugins/builtin/traceView.ts
git -c core.safecrlf=false commit -m "$(cat <<'EOF'
feat(tasks): detect a run coming off the rails and recover it

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
EOF
)"
```

---

### Task 8: Re-login and death recovery

The two conditions Task 7 deliberately left without a recovery, because both need something outside the Worker: a death needs the run anchor and a respawn wait, and a logout needs the SP7 armed login, which lives on the session manager in the parent document.

**Files:**
- Modify: `web/src/agent/types.ts`, `web/src/agent/localTransport.ts`, `web/src/agent/workerHost.ts`, `web/src/agent/worker.ts`, `web/src/tasks/wire.ts`, `web/src/frame/stage.ts`, `web/src/tasks/recovery.ts`
- Test: `web/src/agent/localTransport.test.ts`, `web/src/agent/workerHost.test.ts`, `web/src/tasks/recovery.test.ts`, `web/src/frame/stage.test.ts`

**Interfaces:**
- Consumes: `HealthMonitor.settle` (Task 7), `CharacterSessionManager.login` (SP7), `Transport.cancel` (Task 1).
- Produces:
  - `Transport.relogin(): Promise<{ ok: boolean; reason?: string }>`
  - `RpcMethod` gains `'relogin'`
  - `WireTasksDeps.relogin(): Promise<{ ok: boolean; reason?: string }>`
  - `recoveryTaskFor` handles `'death'` and `'logout'`

- [ ] **Step 1: Add `relogin` to the transport contract**

`web/src/agent/types.ts`:

```ts
  /**
   * Log this character back in through the SP7 armed credentials. The session manager owns the
   * flow (it refuses a second login while one is in flight and reports success for a session
   * that is already online), so the transport only forwards.
   */
  relogin(): Promise<{ ok: boolean; reason?: string }>;
```

and `export type RpcMethod = 'dispatch' | 'say' | 'echo' | 'screenshot' | 'relogin';`

`web/src/agent/localTransport.ts`: `createLocalTransport(hooks, canvas, opts: { relogin?(): Promise<{ ok: boolean; reason?: string }> } = {})` and

```ts
    relogin: () => (opts.relogin
      ? opts.relogin()
      // Without the session manager the client's own armed credentials are still the right
      // fallback: SP7 arms them on every session it opens.
      : hooks.loginArmed().then(r => (r.ok ? { ok: true } : { ok: false, reason: r.reason })))
      .catch(e => ({ ok: false, reason: e instanceof Error ? e.message : String(e) })),
```

`web/src/agent/workerHost.ts`, in `callTransport`: `case 'relogin': return d.transport.relogin();`

`web/src/agent/worker.ts`, on the Worker's transport: `relogin: () => callRpc<{ ok: boolean; reason?: string }>('relogin', [], 60_000),`

`web/src/tasks/wire.ts`: `WireTasksDeps` gains `relogin(): Promise<{ ok: boolean; reason?: string }>` and passes it into `createLocalTransport(d.hooks, d.canvas, { relogin: d.relogin })`.

`web/src/frame/stage.ts`, in the `makeTasks({...})` call:

```ts
          // The session manager, not the client: it refuses a second login while one is in
          // flight, which a bare `loginArmed()` would leave hanging forever.
          relogin: () => sessions.login(session.id).then(r => (r.ok ? { ok: true } : { ok: false, reason: r.reason })),
```

- [ ] **Step 2: Death and logout recoveries, test first**

`web/src/tasks/recovery.test.ts`:

```ts
test('death waits for the respawn, walks back to the anchor and resumes', async () => {
  const c = ctx({ player: { isDead: true, worldX: 100, worldZ: 100 }, anchor: { x: 50, z: 50 } });
  const task = recoveryTaskFor('death', deps)!;
  c.becomeAliveAfter(2);                       // the fake world respawns two ticks in
  await task.run(c);
  expect(c.travel.to).toHaveBeenCalledWith({ x: 50, z: 50 }, expect.objectContaining({ tolerance: 3 }));
  expect(deps.settle).toHaveBeenCalledWith('death', 'recovered');
});

test('death with onDeath: resume does not walk back', async () => {
  const task = recoveryTaskFor('death', { ...deps, onDeath: 'resume' })!;
  const c = ctx({ player: { isDead: false } });
  await task.run(c);
  expect(c.travel.to).not.toHaveBeenCalled();
});

test('death with onDeath: fail settles failed on the first death', async () => {
  const task = recoveryTaskFor('death', { ...deps, onDeath: 'fail' })!;
  await task.run(ctx({ player: { isDead: false } }));
  expect(deps.settle).toHaveBeenCalledWith('death', 'failed');
});

test('logout re-logs in and waits for the world to come back', async () => {
  const c = ctx({});
  c.transportRelogin.mockResolvedValue({ ok: true });
  await recoveryTaskFor('logout', deps)!.run(c);
  expect(deps.settle).toHaveBeenCalledWith('logout', 'recovered');
});

test('logout gives up after maxRelogins', async () => {
  const d = { ...deps, maxRelogins: 1 };
  const c = ctx({});
  c.transportRelogin.mockResolvedValue({ ok: false, reason: 'no credentials' });
  const task = recoveryTaskFor('logout', d)!;
  await task.run(c);
  await task.run(c);
  expect(d.settle).toHaveBeenLastCalledWith('logout', 'failed');
});
```

- [ ] **Step 3: Implement them**

`web/src/tasks/recovery.ts`: `RecoveryDeps` gains `onDeath?: 'resume' | 'return-and-resume' | 'fail'`, `maxRelogins?: number`, and `relogin(): Promise<{ ok: boolean; reason?: string }>`. Add the two cases:

```ts
    case 'death':
      return {
        name, when: () => true, timeoutMs: 120_000, maxAttempts: 1,
        async run(c) {
          const policy = d.onDeath ?? 'return-and-resume';
          if (policy === 'fail') { done(c, false); return; }
          c.status('Died; waiting to respawn');
          // The respawn is server-side and takes a few ticks; there is nothing to click.
          await c.wait.until(s => s.player?.isDead !== true, { timeoutMs: 60_000, label: 'respawn' });
          if (policy === 'resume') { done(c, c.state().player?.isDead !== true); return; }
          const anchor = c.anchor();
          c.status(`Walking back to ${anchor.x}, ${anchor.z}`);
          const trip = await c.travel.to({ x: anchor.x, z: anchor.z }, { tolerance: 3 });
          done(c, trip.success);
        }
      };
    case 'logout':
      return {
        name, when: () => true, timeoutMs: 90_000, maxAttempts: d.maxRelogins ?? 2,
        async run(c) {
          c.status('Logging back in');
          const result = await d.relogin();
          if (!result.ok) { c.log(`Could not log back in: ${result.reason ?? 'unknown'}`, 'warn'); done(c, false); return; }
          // A login that resolves ok still has to produce a world before the script can run.
          const back = await c.wait.until(s => (s.player?.worldX ?? 0) > 0, { timeoutMs: 30_000, label: 'world after relogin' });
          done(c, back);
        }
      };
```

`ScriptContext` has no `relogin`, and it should not: a script must not be able to log the account in and out. The recovery reaches it through `RecoveryDeps`, which the Worker wires from `transport.relogin`.

`web/src/agent/worker.ts`: pass `onDeath: policy.onDeath`, `maxRelogins: policy.maxRelogins`, and `relogin: () => transport.relogin()` into `recoveryTaskFor`'s deps.

- [ ] **Step 4: Verify and commit**

```bash
cd web && npm run typecheck && npm run lint && npx vitest run
```

```bash
git add web/src/agent web/src/tasks/recovery.ts web/src/tasks/recovery.test.ts web/src/tasks/wire.ts web/src/frame/stage.ts web/src/frame/stage.test.ts
git -c core.safecrlf=false commit -m "$(cat <<'EOF'
feat(tasks): recover a run from a death or a logout

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
EOF
)"
```

---

### Task 8b: Death loot recovery

**Owner decision, taken 2026-09-06 after the spec was approved, and superseding decision 5's default:** when a run dies, the default behaviour is to **walk back to where it died and pick its loot up**, then resume. This is the first thing in the sub-project that could not have been built before Task 4, because it needs a real path from the respawn point to an arbitrary death tile.

**The engine's mechanics, verified in the pinned clone. Every number below is load-bearing:**

- `engine/content/scripts/player/scripts/death.rs2`, `[proc,player_death_lose_items]`: the three most valuable items are kept (`~move_priciest_item_on_hero_to_death` three times), a fourth with the Protect Item prayer, **none if skulled**. Everything else in `inv` and `worn` is dropped **at the death tile** by `inv_dropall(inv, coord, ^lootdrop_duration)` and `inv_dropall(worn, coord, ^lootdrop_duration)`, and `obj_addall(coord, bones, 1, ^lootdrop_duration)` adds bones. Items whose config carries `destroy_drop` or `destroy_death` are deleted rather than dropped, so they are never recoverable.
- **`^lootdrop_duration = 200` ticks** (`engine/content/scripts/drop tables/configs/lootdrop.constant`), which at 600 ms per tick is **120 seconds**. That is the entire budget for respawn, travel and pickup - not 120 seconds of walking.
- The respawn point is fixed: `p_teleport(map_findsquare(0_50_50_21_18, ...))`, which is absolute tile **(3221, 3218)** in Lumbridge. So the journey is always "Lumbridge to the death tile", and its length is knowable in advance from `travel.distanceTo`.
- A dropped obj is private to its owner until `Zone.revealObj` publishes it, so the bot can see its own loot immediately and nobody else can take it early.
- `[proc,player_death_lose_items]` opens with `if (staffmodlevel > 1 & map_live = true) { return; }` - staff lose nothing. **But `map_live` is `Environment.node.production`** (`engine/server/src/engine/script/handlers/ServerOps.ts:24`), which is **false** in the dev and e2e stacks, so a `-DevStaff` character still drops its items. That is what makes Task 14's e2e for this possible at all.

**The SDK already has the pieces:** `bot.pickupItem(target: GroundItem | string | RegExp): Promise<PickupResult>` (`web/src/vendor/rs-sdk/sdk/actions.ts:822`) walks to the item, sends the pickup and confirms by watching the item leave the ground, and `sdk.scanGroundItems(radius?)` (`index.ts:439`) is the on-demand re-scan; the snapshot's own `groundItems` is the collector's 15-tile view.

**Files:**
- Modify: `web/src/tasks/types.ts`, `web/src/tasks/health.ts`, `web/src/tasks/health.test.ts`, `web/src/tasks/healthMonitor.ts`, `web/src/tasks/healthMonitor.test.ts`, `web/src/tasks/recovery.ts`, `web/src/tasks/recovery.test.ts`, `web/src/agent/runHealth.ts`, `web/src/agent/runHealth.test.ts`
- Create: `web/src/tasks/lootRecovery.ts`, `web/src/tasks/lootRecovery.test.ts` (the pickup loop, kept out of `recovery.ts` so that file stays under its ceiling and the loop is testable on its own)

**Interfaces:**
- Consumes: `recoveryTaskFor` and `RecoveryDeps` (Tasks 7 and 8), `ScriptContext['travel']` and `anchor` (Task 5), `HealthMemory` (Task 7).
- Produces:
  - **`HealthPolicy.onDeath` becomes `DeathBehaviour`**, declared in `types.ts` as
    `'loot' | 'return' | 'resume' | 'pause' | 'logout' | 'loot-and-logout' | 'fail'`, with **`'loot'` the default**. This task implements `loot`, `return`, `resume` and `fail`; Task 8c implements `pause`, `logout` and `loot-and-logout` and puts the whole set behind a player setting. Declaring the full union here rather than adding values twice means Task 8c is additive and no call site migrates twice.
    - `'return'` **renames** the old `'return-and-resume'` - one migration, done here. Update every declaration and test that names it (`grep -rn "return-and-resume" web/src` before you start).
    - `'fail'` keeps the meaning Task 8 gave it, including the ladder guard in `healthMonitor.ts` that jumps a `fail` policy straight to terminal on the first death.
    - The three values Task 8c owns must be **declared but not silently ignored**: `recoveryTaskFor`'s `'death'` case treats them as `'loot'` for now and logs once that the behaviour is not implemented yet, so a hand-written policy cannot quietly do nothing.
  - `HealthMemory` gains `lastAliveAt: { x: number; z: number; level: number } | null`.
  - `RecoveryDeps` gains `deathTile(): { x: number; z: number; level: number } | null` and `diedAt(): number | null`.
  - `web/src/tasks/lootRecovery.ts`: `recoverLoot(c: ScriptContext, opts: LootOpts): Promise<LootResult>` where `LootOpts = { tile: { x; z; level }; deadline: number; now(): number }` and `LootResult = { picked: number; reason?: 'window_closed' | 'unreachable' | 'needs_route' | 'inventory_full' | 'aborted' }`, plus `LOOT_WINDOW_MS = 120_000`.

- [ ] **Step 1: Remember where the run was standing when it was alive**

`web/src/tasks/health.ts`. `HealthMemory` gains one field, and `observe` fills it only while alive - the whole point is that the position *after* death is the respawn point, not the death tile:

```ts
  /**
   * The last tile the player was standing on while alive. On death the snapshot already
   * reports the respawn point, so this is the only record of where the loot fell.
   */
  lastAliveAt: { x: number; z: number; level: number } | null;
```

in `observe`, alongside the existing position tracking:

```ts
  const alive = s.player?.isDead !== true;
  const at = s.player ? { x: s.player.worldX, z: s.player.worldZ, level: s.player.level } : null;
```

```ts
    lastAliveAt: alive && at ? at : memory.lastAliveAt,
```

`emptyMemory` seeds it `null`.

Test in `health.test.ts` - the assertion that matters is that a death does **not** overwrite it:

```ts
test('the last alive tile survives the death that follows it', () => {
  let mem = observe(emptyMemory(0), world({ player: at(3200, 3200) }), 0);
  mem = observe(mem, world({ player: { ...at(3221, 3218), isDead: true } }), 600);
  expect(mem.lastAliveAt).toEqual({ x: 3200, z: 3200, level: 0 });
});

test('a respawn does not restore it either, until the player moves again', () => {
  let mem = observe(emptyMemory(0), world({ player: at(3200, 3200) }), 0);
  mem = observe(mem, world({ player: { ...at(3221, 3218), isDead: true } }), 600);
  mem = observe(mem, world({ player: at(3221, 3218) }), 1200);
  expect(mem.lastAliveAt).toEqual({ x: 3221, z: 3218, level: 0 });
});
```

The second test documents the one real constraint on the design: the recovery has to read the death tile **before** the respawn snapshot lands. Step 3 solves that by having the monitor capture it when the death fires, not when the recovery runs.

- [ ] **Step 2: The pickup loop**

`web/src/tasks/lootRecovery.ts`. Kept separate from `recovery.ts` so it can be tested without the ladder, and so `recovery.ts` stays well under 400 lines.

```ts
// Walking back for what a death dropped. The engine drops everything except the three most
// valuable items at the tile the player died on, and gives the pile 200 ticks (120 seconds)
// before it despawns (`^lootdrop_duration`), so this is a race the recovery can lose honestly:
// losing the loot is not a failed run, and every giving-up path settles as recovered.
import type { ScriptContext } from './types';

/** `^lootdrop_duration` = 200 ticks at 600 ms. The budget covers respawn, travel AND pickup. */
export const LOOT_WINDOW_MS = 120_000;
/** The death pile is one tile, but a pickup walk can nudge the player; scan a little wider. */
export const LOOT_SCAN_RADIUS = 8;
const INVENTORY_SLOTS = 28;

export interface LootOpts {
  tile: { x: number; z: number; level: number };
  /** Epoch ms the pile despawns. Past it, there is nothing to go back for. */
  deadline: number;
  now(): number;
}

export interface LootResult {
  picked: number;
  reason?: 'window_closed' | 'unreachable' | 'needs_route' | 'inventory_full' | 'aborted';
}

export async function recoverLoot(c: ScriptContext, o: LootOpts): Promise<LootResult> {
  const left = (): number => o.deadline - o.now();
  if (left() <= 0) return { picked: 0, reason: 'window_closed' };

  // Refuse before walking rather than after: a death on another plane needs a route, and
  // travel would tell us the same thing 60 tiles later (spec decision 11).
  if (c.state().player?.level !== o.tile.level) return { picked: 0, reason: 'needs_route' };

  c.status(`Going back for the loot at ${o.tile.x}, ${o.tile.z}`);
  const trip = await c.travel.to({ x: o.tile.x, z: o.tile.z, level: o.tile.level }, { tolerance: 1, timeoutMs: left() });
  if (!trip.success) {
    return { picked: 0, reason: trip.reason === 'needs_route' ? 'needs_route' : trip.reason === 'aborted' ? 'aborted' : 'unreachable' };
  }

  let picked = 0;
  // One scan, then pick up what it found. Re-scanning per item would spend the window on
  // scans; `pickupItem` already confirms each item left the ground before returning.
  const items = await c.sdk.scanGroundItems(LOOT_SCAN_RADIUS).catch(() => []);
  for (const item of items) {
    if (c.signal.aborted) return { picked, reason: 'aborted' };
    if (left() <= 0) return { picked, reason: 'window_closed' };
    if ((c.state().inventory?.length ?? 0) >= INVENTORY_SLOTS) return { picked, reason: 'inventory_full' };
    const result = await c.bot.pickupItem(item);
    if (result.success) picked++;
    else c.log(`could not pick up ${item.name}: ${result.message}`, 'warn');
  }
  return { picked };
}
```

Tests in `lootRecovery.test.ts`, each pinning one giving-up path. The fake `travel` must refuse the way the real one does (`{ success: false, reason, stoppedAt, legs, tiles }`), and the fake `pickupItem` must report failure for an item that is gone rather than succeeding blindly - that is the shape that has hidden a branch five times in this sub-project:

```ts
test('it walks to the death tile and picks up everything it finds', async () => { /* picked === items.length, travel.to called with the tile */ });
test('a window that has already closed is not walked to at all', async () => { /* travel.to never called, reason window_closed */ });
test('the window closing mid-pickup stops the loop and reports what it got', async () => { /* clock advances per pickup */ });
test('a death on another plane refuses before walking', async () => { /* reason needs_route, travel.to never called */ });
test('an unreachable death tile gives up without throwing', async () => { /* travel refuses, reason unreachable */ });
test('a full inventory stops the loop rather than looping on a refusal', async () => { /* 28 slots, reason inventory_full */ });
test('an abort between pickups stops immediately', async () => { /* signal aborted, reason aborted */ });
test('an item that vanished is logged and does not stop the rest', async () => { /* one pickup fails, the others still run */ });
```

- [ ] **Step 3: Capture the death tile when the death fires**

`web/src/tasks/healthMonitor.ts`. The monitor is the only thing that sees the snapshot in which the death became true, so it captures the tile then and holds it for the recovery. Add to the fields:

```ts
  /** Where the run died and when, captured as the death fires because the next snapshot is the respawn. */
  let death: { tile: { x: number; z: number; level: number }; at: number } | null = null;
```

in `fire`, when the condition is `'death'`, before anything else:

```ts
      if (condition === 'death' && memory?.lastAliveAt) death = { tile: memory.lastAliveAt, at };
```

and on the returned object:

```ts
    deathTile: () => death?.tile ?? null,
    diedAt: () => death?.at ?? null,
```

`dispose()` clears it with the rest.

Test in `healthMonitor.test.ts`:

```ts
test('the death tile is the last alive tile, not the respawn point', () => {
  const { monitor, tick } = make();
  monitor.observe(aliveAt(3200, 3200), 0);
  tick(600);
  monitor.observe(deadAt(3221, 3218), 600);
  expect(monitor.deathTile()).toEqual({ x: 3200, z: 3200, level: 0 });
  expect(monitor.diedAt()).toBe(600);
});
```

- [ ] **Step 4: Make it the default death recovery**

`web/src/tasks/types.ts`: `onDeath?: 'resume' | 'return-and-resume' | 'return-and-loot' | 'fail'`, with the doc comment recording that **`'return-and-loot'` is the default** and why the others exist.

`web/src/tasks/recovery.ts`, the `'death'` case. The loot attempt sits between the respawn wait and the anchor walk, and **never turns a recovered death into a failed one** - the run is alive either way, and the items are a bonus:

```ts
    case 'death':
      return {
        name, when: () => true, timeoutMs: 180_000, maxAttempts: 1,
        async run(c) {
          const policy = d.onDeath ?? 'loot';
          if (policy === 'fail') { done(c, false); return; }
          c.status('Died; waiting to respawn');
          await c.wait.until(s => s.player?.isDead !== true, { timeoutMs: 60_000, label: 'respawn' });
          if (c.state().player?.isDead === true) { done(c, false); return; }
          if (policy === 'resume') { done(c, true); return; }

          if (policy === 'loot' || policy === 'loot-and-logout') {
            const tile = d.deathTile();
            const diedAt = d.diedAt();
            if (tile && diedAt !== null) {
              // Losing the race is not a failure: the run is alive, and the loot was already
              // lost the moment it died. Report what happened and carry on to the anchor.
              const loot = await recoverLoot(c, { tile, deadline: diedAt + LOOT_WINDOW_MS, now: Date.now });
              c.log(loot.reason
                ? `recovered ${loot.picked} items before giving up: ${loot.reason}`
                : `recovered ${loot.picked} items from the death pile`, loot.reason ? 'warn' : 'info');
            } else {
              c.log('died with no recorded death tile; not going back for loot', 'warn');
            }
          }

          const anchor = c.anchor();
          c.status(`Walking back to ${anchor.x}, ${anchor.z}`);
          const trip = await c.travel.to({ x: anchor.x, z: anchor.z }, { tolerance: 3 });
          done(c, trip.success);
        }
      };
```

`timeoutMs` rises to 180 s because the task now contains a respawn wait, a two-minute loot race and an anchor walk. That is above the runner's 30 s default and is deliberate.

`web/src/agent/runHealth.ts` wires the two new deps straight from the monitor:

```ts
        deathTile: () => monitor.deathTile(),
        diedAt: () => monitor.diedAt(),
```

- [ ] **Step 5: Tests that pin the default and the ordering**

`recovery.test.ts`:

```ts
test('the default policy goes back for the loot before it walks to the anchor', async () => {
  const order: string[] = [];
  // travel.to records each destination; recoverLoot is exercised through the real module.
  await recoveryTaskFor('death', deps({ deathTile: () => ({ x: 3200, z: 3200, level: 0 }) }))!.run(ctx);
  expect(order).toEqual(['travel:3200,3200', 'pickup', 'travel:anchor']);
});

test('return-and-resume skips the loot walk entirely', async () => { /* order has no pickup */ });
test('a death with no recorded tile still walks to the anchor', async () => { /* logs, then anchor */ });
test('a loot walk that fails does not fail the recovery', async () => { /* settle called with recovered */ });
test('resume neither loots nor walks', async () => { /* travel.to never called */ });
```

The third and fourth are the ones that matter: this recovery must be *incapable* of turning a survivable death into a failed run.

- [ ] **Step 6: Verify and commit**

```bash
cd web && npm run typecheck && npm run lint && npx vitest run
~/.bun/bin/bun scripts/gen/atlas.ts --check && ~/.bun/bin/bun scripts/gen/collision.ts --check
```

```bash
git add web/src/tasks/lootRecovery.ts web/src/tasks/lootRecovery.test.ts web/src/tasks/types.ts web/src/tasks/health.ts web/src/tasks/health.test.ts web/src/tasks/healthMonitor.ts web/src/tasks/healthMonitor.test.ts web/src/tasks/recovery.ts web/src/tasks/recovery.test.ts web/src/agent/runHealth.ts web/src/agent/runHealth.test.ts
git -c core.safecrlf=false commit -m "$(cat <<'EOF'
feat(tasks): go back for the loot a death dropped

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
EOF
)"
```

---

### Task 8c: Bot behaviour settings

**Owner decision, taken 2026-09-06:** the player picks what the bot does by default, and specifically what it does when it dies, from the Tasks panel's settings. Until now the death policy existed only as `ScriptManifest.health.onDeath`, which a player cannot reach without editing a script.

**Precedence, and it is the whole design:** a script's own `health.*` beats the player's setting, which beats the built-in default. A script that deliberately declares `onDeath: 'fail'` is making a statement about itself and keeps it; every script that says nothing follows the player.

**The settings, decided here.** The plugin settings system already renders a `select` (`web/src/plugins/settingsForm.ts:17`, `PluginManifest.settings` accepts `{ type: 'select'; label; default; options }`), it already persists per account to `users/{uid}/plugins/tasks` with a localStorage mirror, and Task 2 already fans a change out to every open character tab. So this is a manifest change plus the plumbing to get the values into the Worker.

| Setting | Type | Default | Values |
|---|---|---|---|
| `onDeath` | select | `loot` | `loot` "Go back for my loot, then carry on"; `loot-and-logout` "Go back for my loot, then log out"; `return` "Go back to work, leave the loot"; `resume` "Carry on from where I respawned"; `pause` "Pause and wait for me"; `logout` "Log out"; `fail` "Stop the run" |
| `onStuck` | select | `pause` | `pause` "Pause and wait for me"; `logout` "Log out"; `stop` "Stop the run" |
| `maxRelogins` | number | 2 | 0 to 5. 0 means do not log back in after a disconnect, which is also how a player says "if I get logged out, stay out". |

`onStuck` is the general default the owner asked for: it governs every rung that ends in "the run cannot carry on by itself", which today is the `pause-stuck` rung of every condition, not only death.

**Files:**
- Modify: `web/src/plugins/builtin/tasks.ts` (the manifest's settings and `settingsFrom`), `web/src/tasks/api.ts` (`TasksSettings`), `web/src/tasks/api.test.ts`, `web/src/agent/types.ts` (the `run` message), `web/src/agent/workerHost.ts`, `web/src/agent/worker.ts`, `web/src/agent/workerContext.ts`, `web/src/agent/localTransport.ts`, `web/src/tasks/types.ts`, `web/src/tasks/healthMonitor.ts`, `web/src/tasks/recovery.ts`, `web/src/agent/runHealth.ts`, `web/src/tasks/wire.ts`, and the matching tests
- Create: `web/src/tasks/behaviour.ts`, `web/src/tasks/behaviour.test.ts` (the pure merge of script policy over player settings over defaults)

**Interfaces:**
- Consumes: `TasksSettings` and `api.settings` (SP4a), `HealthPolicy` (Task 7), `recoveryTaskFor` and `RecoveryDeps` (Tasks 8 and 8b), `Transport` (Task 1).
- Produces:
  - `TasksSettings` gains `onDeath: DeathBehaviour`, `onStuck: StuckBehaviour`, `maxRelogins: number`.
  - `web/src/tasks/types.ts`: `type StuckBehaviour = 'pause' | 'logout' | 'stop'` and `HealthPolicy.onStuck?: StuckBehaviour`. `DeathBehaviour` already exists in full from Task 8b; this task implements its remaining three values (`pause`, `logout`, `loot-and-logout`) and removes the "not implemented yet" log Task 8b left behind.
  - `web/src/tasks/behaviour.ts`: `resolvePolicy(script: HealthPolicy | undefined, player: BehaviourSettings): Required<Pick<HealthPolicy, 'onDeath' | 'onStuck' | 'maxRelogins'>> & HealthPolicy`, and `DEFAULT_BEHAVIOUR`.
  - `Transport.logout(): void` - the counterpart to `relogin`, wired to `hooks.logout()`, and **refused for script code the same way**.
  - `FailReason` gains `'logged_out'`.

- [ ] **Step 1: The types and the pure merge, test first**

`web/src/tasks/behaviour.test.ts`. The merge is the whole feature, so it is tested on its own before any plumbing:

```ts
import { expect, test } from 'vitest';
import { DEFAULT_BEHAVIOUR, resolvePolicy } from './behaviour';

const player = { onDeath: 'logout' as const, onStuck: 'stop' as const, maxRelogins: 0 };

test('with no script policy the player settings win', () => {
  expect(resolvePolicy(undefined, player)).toMatchObject({ onDeath: 'logout', onStuck: 'stop', maxRelogins: 0 });
});

test('a script that declares a policy keeps it, field by field', () => {
  const merged = resolvePolicy({ onDeath: 'fail' as never, noProgressMs: 5000 }, player);
  expect(merged.onDeath).toBe('fail');
  // Fields the script did not declare still follow the player.
  expect(merged.onStuck).toBe('stop');
  expect(merged.maxRelogins).toBe(0);
  expect(merged.noProgressMs).toBe(5000);
});

test('with neither, the built-in defaults apply and loot is the death default', () => {
  expect(resolvePolicy(undefined, DEFAULT_BEHAVIOUR)).toMatchObject({ onDeath: 'loot', onStuck: 'pause', maxRelogins: 2 });
});

test('an unknown stored value falls back to the default rather than reaching the ladder', () => {
  expect(resolvePolicy(undefined, { ...DEFAULT_BEHAVIOUR, onDeath: 'nonsense' as never }).onDeath).toBe('loot');
});

test('maxRelogins is clamped to its declared range', () => {
  expect(resolvePolicy(undefined, { ...DEFAULT_BEHAVIOUR, maxRelogins: 99 }).maxRelogins).toBe(5);
  expect(resolvePolicy(undefined, { ...DEFAULT_BEHAVIOUR, maxRelogins: -1 }).maxRelogins).toBe(0);
});
```

The fourth test is the one that earns its keep: settings come out of Firestore and localStorage, both of which can hold anything a previous build wrote.

`web/src/tasks/behaviour.ts` is a small pure module: the two value lists as `readonly` arrays with `includes` guards, `DEFAULT_BEHAVIOUR = { onDeath: 'loot', onStuck: 'pause', maxRelogins: 2 }`, and a `resolvePolicy` that spreads the script's declared fields over the validated player values.

- [ ] **Step 2: Put the settings on the panel**

`web/src/plugins/builtin/tasks.ts`, in the plugin manifest's `settings`, after the two that exist:

```ts
        onDeath: {
          type: 'select', label: 'When I die', default: 'loot',
          // All seven values of `DeathBehaviour`, in the order a player would scan them.
          // `fail` is offered too: a script may declare it, so a player must be able to.
          options: [
            { value: 'loot', label: 'Go back for my loot, then carry on' },
            { value: 'loot-and-logout', label: 'Go back for my loot, then log out' },
            { value: 'return', label: 'Go back to work, leave the loot' },
            { value: 'resume', label: 'Carry on from where I respawned' },
            { value: 'pause', label: 'Pause and wait for me' },
            { value: 'logout', label: 'Log out' },
            { value: 'fail', label: 'Stop the run' }
          ]
        },
        onStuck: {
          type: 'select', label: 'When a run gets stuck', default: 'pause',
          options: [
            { value: 'pause', label: 'Pause and wait for me' },
            { value: 'logout', label: 'Log out' },
            { value: 'stop', label: 'Stop the run' }
          ]
        },
        maxRelogins: { type: 'number', label: 'Times to log back in after a disconnect', default: 2, min: 0, max: 5, step: 1 },
```

and extend `settingsFrom(ctx)` to read all three, exactly as it already reads the other two. `TasksSettings` in `api.ts` gains the three fields and `DEFAULT_SETTINGS` gains their defaults.

- [ ] **Step 3: Get them into the Worker**

The health policy is consumed inside the Worker, and `api.settings` lives on the main thread, so the values travel on the `run` message. `web/src/agent/types.ts`:

```ts
  | { t: 'run'; runId: string; scriptRef: ScriptRef; params: ParamValues; startedBy: Actor; characterId: string | null; characterName: string | null; behaviour: BehaviourSettings }
```

`workerHost.run` takes the settings on its `RunRequest` and forwards them; `api.run` passes `getSettings()`. In `worker.ts`'s `startRun`, the policy handed to `createHealthMonitor` and to `recoveryTaskFor` becomes `resolvePolicy(resolved.script.health, m.behaviour)`.

**Ruling: the settings are read once, at run start.** Changing them mid-run does not affect the run in flight, exactly as Task 9's toggle governs starting rather than stopping. Say so in the setting's own doc comment, and pin it with a test that changes the setting after `run` and asserts the live run's policy is unchanged.

- [ ] **Step 4: Teach the ladder the new endings**

`web/src/tasks/healthMonitor.ts`. The death rung already consults the policy after Task 8's fix (`if (condition === 'death' && d.policy.onDeath === 'fail') return terminal(condition)`); generalise that into one function so every behaviour has exactly one place it is decided:

```ts
/**
 * Where a death ends up, given the player's setting. `loot` and `return` recover and carry on,
 * so they never reach here; the other three are endings the ladder owns rather than the
 * recovery, because only the ladder can stop the run.
 */
function deathRung(policy: HealthPolicy): Escalation | null {
  switch (policy.onDeath) {
    case 'pause': return 'pause-stuck';
    case 'logout':
    case 'loot-and-logout': return { fail: 'logged_out' };
    default: return null;
  }
}
```

`onStuck` replaces the hard-coded `'pause-stuck'` return with a policy lookup: `pause` keeps today's behaviour, `stop` returns `{ fail: 'stuck' }`, and `logout` returns `{ fail: 'logged_out' }` after asking the transport to log out. `FailReason` gains `'logged_out'` and `traceView.ts` needs no change (it renders the reason as text).

- [ ] **Step 5: `Transport.logout`, refused for scripts**

`web/src/agent/types.ts` gains `logout(): void` on `Transport` with the same doc note as `relogin`; `localTransport` implements it as `hooks.logout()` inside a try; `workerHost.callTransport` gains the case and `RpcMethod` the member; the Worker's transport forwards it.

**It must be refused for script code by the same override Task 8's Critical fix installs** in `workerContext.ts`'s `scoped` transport - a script must not be able to log the account out any more than it can log it in. Extend that override and its test to cover both members, and add a test that asserts the two are the only `Transport` members so overridden, so a future member is a deliberate decision rather than an oversight.

`recoveryTaskFor`'s `'death'` case gains the `logout` and `loot-and-logout` arms: loot first when the behaviour asks for it, then `d.logout()`, then settle - the ladder turns that into `{ fail: 'logged_out' }`.

- [ ] **Step 6: Tests that pin each behaviour end to end**

`recovery.test.ts` gains one test per `onDeath` value, each asserting the ordered calls rather than only the settle:

```ts
test('loot goes to the death tile, then the anchor', async () => { /* ['travel:death', 'pickup', 'travel:anchor'] */ });
test('return skips the death tile', async () => { /* ['travel:anchor'] */ });
test('resume walks nowhere', async () => { /* [] */ });
test('pause neither loots nor walks, and the ladder pauses', async () => { /* settle -> pause-stuck */ });
test('logout logs out without looting', async () => { /* ['logout'] */ });
test('loot-and-logout loots first, then logs out', async () => { /* ['travel:death', 'pickup', 'logout'] */ });
```

and `healthMonitor.test.ts` gains one per rung: `onStuck: 'stop'` fails with `stuck`, `onStuck: 'logout'` fails with `logged_out`, `onDeath: 'pause'` pauses on the first death, `onDeath: 'logout'` ends the run with `logged_out`.

- [ ] **Step 7: Verify and commit**

```bash
cd web && npm run typecheck && npm run lint && npx vitest run
~/.bun/bin/bun scripts/gen/atlas.ts --check && ~/.bun/bin/bun scripts/gen/collision.ts --check
```

```bash
git add web/src/tasks/behaviour.ts web/src/tasks/behaviour.test.ts web/src/tasks web/src/agent web/src/plugins/builtin/tasks.ts web/src/plugins/builtin/tasks.test.ts
git -c core.safecrlf=false commit -m "$(cat <<'EOF'
feat(tasks): let the player choose what the bot does when it dies or gets stuck

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
EOF
)"
```

---

### Task 9: Per-script toggles

A script gains `enabled`, defaulting to true, stored per **account** (spec decision 7) next to the plugin settings so it survives a device change, and enforced in `TasksApi.run` (spec decision 8) so the Run button, the Marketplace, Playwright, the SP4c relay and any future scheduler are refused identically.

**Files:**
- Create: `web/src/tasks/toggles.ts`, `web/src/tasks/toggles.test.ts`
- Modify: `web/src/tasks/api.ts`, `web/src/tasks/api.test.ts`, `web/src/tasks/catalogue.ts`, `web/src/tasks/router.ts`, `web/src/tasks/router.test.ts`, `web/src/tasks/wire.ts`, `web/src/tasks/types.ts`, `web/src/plugins/builtin/tasksViews.ts`, `web/src/plugins/builtin/tasks.ts`, `web/src/plugins/builtin/marketplace.ts`, their tests, `firebase/firestore.rules` and the rules suite

**Interfaces:**
- Consumes: `createSettingsStore`'s shape (`web/src/plugins/settings.ts`) as the model to mirror, `TasksApi`, `TaskSummary`.
- Produces:
  - `web/src/tasks/toggles.ts`: `interface ToggleBackend { load(uid): Promise<Record<string, boolean>>; write(uid, id, enabled): Promise<void> }`, `createFirestoreToggleBackend(db): ToggleBackend`, `createToggleStore(backend, opts?): ToggleStore` with `load(uid)`, `isEnabled(id)`, `setEnabled(uid, id, enabled)`, `flush()`.
  - `TasksApi.setEnabled(id: string, enabled: boolean): Promise<void>`, `TasksErrorCode` gains `'disabled'`, `TaskSummary.enabled: boolean`.

- [ ] **Step 1: The store, test first**

`web/src/tasks/toggles.test.ts`:

```ts
import { beforeEach, expect, test, vi } from 'vitest';
import { createToggleStore } from './toggles';

const backend = () => ({ load: vi.fn(async () => ({})), write: vi.fn(async () => {}) });

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });

test('a script with no stored toggle is enabled', async () => {
  const store = createToggleStore(backend());
  await store.load('u1');
  expect(store.isEnabled('chop-and-drop')).toBe(true);
});

test('a write lands in localStorage at once and in the backend after the debounce', async () => {
  const b = backend();
  const store = createToggleStore(b, { debounceMs: 800 });
  await store.load('u1');
  store.setEnabled('u1', 'chop-and-drop', false);

  expect(store.isEnabled('chop-and-drop')).toBe(false);
  expect(localStorage.getItem('cs.script.chop-and-drop')).toBe('false');
  expect(b.write).not.toHaveBeenCalled();
  vi.advanceTimersByTime(800);
  expect(b.write).toHaveBeenCalledWith('u1', 'chop-and-drop', false);
});

test('two writes inside the debounce make one backend call with the last value', async () => {
  const b = backend();
  const store = createToggleStore(b, { debounceMs: 800 });
  await store.load('u1');
  store.setEnabled('u1', 'x', false);
  vi.advanceTimersByTime(400);
  store.setEnabled('u1', 'x', true);
  vi.advanceTimersByTime(800);
  expect(b.write).toHaveBeenCalledTimes(1);
  expect(b.write).toHaveBeenCalledWith('u1', 'x', true);
});

test('the backend wins over the local mirror on load', async () => {
  localStorage.setItem('cs.script.x', 'true');
  const b = backend();
  b.load.mockResolvedValue({ x: false });
  const store = createToggleStore(b);
  await store.load('u1');
  expect(store.isEnabled('x')).toBe(false);
});

test('signed out, the local mirror is the whole store and nothing is written remotely', async () => {
  localStorage.setItem('cs.script.x', 'false');
  const b = backend();
  const store = createToggleStore(b);
  await store.load(null);
  expect(store.isEnabled('x')).toBe(false);
  store.setEnabled(null, 'y', false);
  vi.advanceTimersByTime(5000);
  expect(b.write).not.toHaveBeenCalled();
  expect(store.isEnabled('y')).toBe(false);
});

test('a backend that throws leaves the local value standing', async () => {
  const b = backend();
  b.load.mockRejectedValue(new Error('offline'));
  localStorage.setItem('cs.script.x', 'false');
  const store = createToggleStore(b);
  await store.load('u1');
  expect(store.isEnabled('x')).toBe(false);
});
```

`web/src/tasks/toggles.ts` - the same shape as `web/src/plugins/settings.ts`, because a second, differently-behaved persistence model for the same kind of value is how two stores end up disagreeing about what the player chose:

```ts
// Per-script enable, per account (spec decision 7). Firestore is the record; localStorage is a
// mirror so a reload before the debounce fires still shows what the player chose, and so a
// signed-out player still has working toggles. Deliberately the same debounce, key shape and
// load precedence as `web/src/plugins/settings.ts`.
import { collection, doc, getDocs, setDoc, type Firestore } from 'firebase/firestore';

export interface ToggleBackend {
  load(uid: string): Promise<Record<string, boolean>>;
  write(uid: string, id: string, enabled: boolean): Promise<void>;
}

export interface ToggleStore {
  load(uid: string | null): Promise<Map<string, boolean>>;
  /** Absent means enabled: a script the player has never touched runs. */
  isEnabled(id: string): boolean;
  setEnabled(uid: string | null, id: string, enabled: boolean): void;
  flush(): Promise<void>;
}

const KEY = (id: string): string => `cs.script.${id}`;
const DEBOUNCE_MS = 800;

export function createFirestoreToggleBackend(db: Firestore): ToggleBackend {
  return {
    async load(uid) {
      const snap = await getDocs(collection(db, 'users', uid, 'scriptToggles'));
      const out: Record<string, boolean> = {};
      for (const d of snap.docs) out[d.id] = (d.data() as { enabled?: boolean }).enabled !== false;
      return out;
    },
    async write(uid, id, enabled) {
      await setDoc(doc(db, 'users', uid, 'scriptToggles', id), { enabled, updatedAt: Date.now() });
    }
  };
}

function readLocal(id: string): boolean | undefined {
  try {
    const raw = localStorage.getItem(KEY(id));
    return raw === null ? undefined : raw === 'true';
  } catch { return undefined; }
}

function localIds(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('cs.script.')) out.push(k.slice('cs.script.'.length));
    }
  } catch { /* storage blocked */ }
  return out;
}

export function createToggleStore(backend: ToggleBackend, opts: { debounceMs?: number } = {}): ToggleStore {
  const debounceMs = opts.debounceMs ?? DEBOUNCE_MS;
  const values = new Map<string, boolean>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Map<string, { uid: string; enabled: boolean }>();

  function schedule(uid: string, id: string, enabled: boolean): void {
    pending.set(id, { uid, enabled });
    const existing = timers.get(id);
    if (existing) clearTimeout(existing);
    timers.set(id, setTimeout(() => {
      const job = pending.get(id);
      timers.delete(id);
      pending.delete(id);
      // Offline is not an error: localStorage already holds the value the player chose.
      if (job) void backend.write(job.uid, id, job.enabled).catch(() => {});
    }, debounceMs));
  }

  return {
    async load(uid) {
      values.clear();
      let remote: Record<string, boolean> = {};
      if (uid) { try { remote = await backend.load(uid); } catch { remote = {}; } }
      // localStorage fills only the ids the backend did not answer for, so a value written on
      // another device wins over a stale local mirror.
      for (const id of localIds()) {
        const local = readLocal(id);
        if (local !== undefined) values.set(id, local);
      }
      for (const [id, enabled] of Object.entries(remote)) values.set(id, enabled);
      return new Map(values);
    },
    isEnabled: id => values.get(id) !== false,
    setEnabled(uid, id, enabled) {
      values.set(id, enabled);
      try { localStorage.setItem(KEY(id), String(enabled)); } catch { /* storage blocked */ }
      if (uid) schedule(uid, id, enabled);
    },
    async flush() {
      for (const [id, timer] of timers) {
        clearTimeout(timer);
        const job = pending.get(id);
        if (job) await backend.write(job.uid, id, job.enabled).catch(() => {});
      }
      timers.clear();
      pending.clear();
    }
  };
}
```

- [ ] **Step 2: The Firestore rule**

`firebase/firestore.rules`, beside the `plugins` rule:

```
      // SP4b: per-script enable, per account rather than per character (spec decision 7).
      match /scriptToggles/{scriptId} {
        allow read: if request.auth != null && request.auth.uid == uid;
        allow write: if request.auth != null && request.auth.uid == uid
                     && request.resource.data.enabled is bool;
      }
```

Add a rules test that mirrors the plugin one: the owner may write `{ enabled: false, updatedAt: 1 }`, another signed-in user may not read or write it, and a write whose `enabled` is a string is refused. Run `cd firebase && npm test`.

- [ ] **Step 3: Enforce it in the api, test first**

`web/src/tasks/api.test.ts`:

```ts
test('a disabled script refuses to run, with a code the panels can branch on', async () => {
  const api = makeApi({ toggles: { isEnabled: (id: string) => id !== 'chop-and-drop' } });
  await expect(api.run('chop-and-drop')).rejects.toMatchObject({ code: 'disabled' });
  expect(host.run).not.toHaveBeenCalled();
});

test('a run already in flight is not stopped by disabling its script', async () => {
  const api = makeApi({});
  await api.run('chop-and-drop');
  await api.setEnabled('chop-and-drop', false);
  expect(host.stop).not.toHaveBeenCalled();
  expect(api.status().state).not.toBe('stopped');
});

test('list reports the toggle so the row can render it', async () => {
  const api = makeApi({ toggles: { isEnabled: (id: string) => id !== 'mine-and-drop' } });
  const rows = await api.list();
  expect(rows.find(r => r.id === 'mine-and-drop')!.enabled).toBe(false);
  expect(rows.find(r => r.id === 'chop-and-drop')!.enabled).toBe(true);
});
```

`web/src/tasks/api.ts`:

- `TasksErrorCode` gains `'disabled'`.
- `TasksApiDeps` gains `toggles: { isEnabled(id: string): boolean; setEnabled(id: string, enabled: boolean): Promise<void> }`.
- `TasksApi` gains `setEnabled(id: string, enabled: boolean): Promise<void>`.
- In `run()`, directly after `requireLive()` and the `busy` check:

```ts
    // Spec decision 8: one enforcement point. The Run button, the Marketplace's Run now,
    // `window.idlescape.tasks.run` from Playwright and the SP4c relay all arrive here.
    if (!d.toggles.isEnabled(id)) {
      throw new TasksError('disabled', 'that script is turned off; turn it back on in the Tasks tab');
    }
```

- `setEnabled` implementation: `async setEnabled(id, enabled) { requireLive(); await d.toggles.setEnabled(id, enabled); publish(); }`. It deliberately does **not** touch a live run: the toggle governs starting.

`web/src/tasks/catalogue.ts`: `CatalogueDeps` gains `enabled(id: string): boolean`, and both `summarise` and `userRow` set `enabled: d.enabled(id)`. `TaskSummary` gains `enabled: boolean`.

`web/src/tasks/router.ts`: `setEnabled` fans out through the same helper Task 2 added:

```ts
    async setEnabled(...args: Parameters<TasksApi['setEnabled']>) {
      // Per account, not per character: a script switched off on one tab is off on all of them.
      const results = [...apis.values()].map(api => api.setEnabled(...args));
      await Promise.all(results.map(p => p.catch(e => { console.error('[tasks] a session refused a toggle', e); })));
    },
```

`web/src/tasks/wire.ts` builds the store and passes it in, calling `void toggles.load(d.uid())` once.

- [ ] **Step 4: The two panels**

`web/src/plugins/builtin/tasksViews.ts`: `RowHandlers` gains `setEnabled(enabled: boolean): void`, and `renderScriptRow` gains a switch in the row's action area, before Run:

```ts
    h('label', { class: 'field field-inline task-row-toggle' },
      h('input', {
        type: 'checkbox', class: 'switch', 'data-task-enabled': task.id, checked: task.enabled !== false,
        onchange: (ev: Event) => handlers.setEnabled?.((ev.target as HTMLInputElement).checked)
      }),
      h('span', { class: 'field-label' }, task.enabled === false ? 'Off' : 'On')),
```

and Run is disabled when `task.enabled === false`, with the title "This script is turned off".

`web/src/plugins/builtin/tasks.ts` wires the handler in `refreshScripts`:

```ts
        const row = renderScriptRow(task, {
          run: () => onRun(task, row), edit: () => void onEdit(task, row),
          fork: () => void onFork(task), remove: () => void onRemove(task),
          // The toggle governs starting, not the run in flight, so nothing else moves here.
          setEnabled: enabled => guard(api.setEnabled(task.id, enabled).then(() => refreshScripts()))
        });
```

`web/src/plugins/builtin/marketplace.ts`: a card for a disabled script renders the "Turned off" badge and its Run button links to the Tasks tab rather than calling `run`:

```ts
    task.enabled === false
      ? alert('This script is turned off. Turn it back on in the Tasks tab.', { tone: 'warn', title: 'Turned off' })
      : null,
```

Panel tests: toggling the switch calls `api.setEnabled(id, false)`; a row whose `enabled` is false has a disabled Run button; a market card for a disabled script shows the notice and its Run button does not call `api.run`.

- [ ] **Step 5: Verify and commit**

```bash
cd web && npm run typecheck && npm run lint && npx vitest run
cd ../firebase && npm test
```

```bash
git add web/src/tasks/toggles.ts web/src/tasks/toggles.test.ts web/src/tasks/api.ts web/src/tasks/api.test.ts web/src/tasks/catalogue.ts web/src/tasks/router.ts web/src/tasks/router.test.ts web/src/tasks/wire.ts web/src/tasks/types.ts web/src/plugins/builtin firebase/firestore.rules firebase/test
git -c core.safecrlf=false commit -m "$(cat <<'EOF'
feat(tasks): turn a script off per account and refuse to run it

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
EOF
)"
```

---

### Task 10: The live run, in the banner and the card

Everything the run is doing is already in the trace; this task puts the three things a player wants at a glance onto `RunStatus` so the banner and the card can paint them without reading it: the current target, the health condition, and xp per hour.

**Files:**
- Modify: `web/src/tasks/types.ts`, `web/src/agent/types.ts`, `web/src/agent/worker.ts`, `web/src/agent/workerHost.ts`, `web/src/frame/runBanner.ts`, `web/src/plugins/builtin/tasksViews.ts`, `web/src/plugins/builtin/tasks.ts`, `web/src/styles/*.css`, `web/styleguide.html`, `web/src/styleguide.ts`, and the matching tests

**Interfaces:**
- Consumes: `WorkerStatus` (Task 1's protocol), `FoundTarget` (Task 6), `HealthEvent` (Task 7).
- Produces: `RunStatus` gains `target`, `health`, `xpPerHour`; `renderRunCard`/`updateRunCard` render them; the banner gains a detail line and a health pip.

- [ ] **Step 1: Types and the Worker's half**

`web/src/tasks/types.ts`, on `RunStatus` (and therefore on `WorkerStatus`, which spreads `RunStatusLite`; put the three on `RunStatusLite` so the Worker can fill them):

```ts
  /** What the run is working on, from the last `target` trace event. */
  target: { kind: ResourceKind; name: string; distance: number } | null;
  /** The condition a recovery is running for, and when it started. Null when healthy. */
  health: { condition: HealthCondition; since: number } | null;
  /** Skill name to xp per hour, over the run so far. */
  xpPerHour: Record<string, number>;
```

`IDLE_STATUS` in `api.ts` and `IDLE` in `workerHost.ts` both gain `target: null, health: null, xpPerHour: {}`.

`web/src/agent/worker.ts`, in `postStatus`, fill them from what the Worker already holds:

```ts
function postStatus(s: RunStatusLite): void {
  if (s.task) lastTask = s.task;
  const elapsedMs = current ? Math.max(1, Date.now() - current.startedAt) : 1;
  const xpPerHour: Record<string, number> = {};
  for (const [skill, xp] of Object.entries(trace?.xpGained() ?? {})) {
    xpPerHour[skill] = Math.round((xp * 3_600_000) / elapsedMs);
  }
  const event = monitorRef?.last() ?? null;
  post({
    t: 'status',
    status: {
      ...s, statusLine, xpPerHour,
      target: lastTarget,
      health: event && monitorRef?.is(event.condition) ? { condition: event.condition, since: event.at } : null,
      runId: current?.runId ?? null,
      scriptId: current?.script.id ?? null,
      scriptName: current?.script.name ?? null
    }
  });
}
```

with `lastTarget` set in the trace subscription (`if (e.kind === 'target') lastTarget = { kind: e.kind_, name: e.name, distance: e.distance };`) and cleared in `endRun`. `monitorRef` is a module-level `HealthMonitor | null` set in `startRun` and nulled in `endRun` - the same lifecycle as `trace`.

Because `postStatus` only fires on a runner state change, add one more publication: the trace subscription already calls `postStatus` for a `status` event; extend that to `target` and `health` events so the banner follows them.

- [ ] **Step 2: The banner detail line, test first**

`web/src/frame/runBanner.test.ts`:

```ts
test('the detail line shows the target, the position and xp per hour', () => {
  banner.update({ ...RUNNING, target: { kind: 'tree', name: 'Oak', distance: 12 }, xpPerHour: { Woodcutting: 12000 } });
  const detail = root.querySelector('[data-banner-detail]')!;
  expect(detail.textContent).toContain('Oak');
  expect(detail.textContent).toContain('12');
  expect(detail.textContent).toContain('12,000');
});

test('the health pip appears only while a recovery is running, and names the condition', () => {
  banner.update({ ...RUNNING, health: null });
  expect(root.querySelector('[data-banner-health]')).toBeNull();
  banner.update({ ...RUNNING, health: { condition: 'dialog-stuck', since: 0 } });
  const pip = root.querySelector('[data-banner-health]')!;
  expect(pip.getAttribute('title')).toContain('dialog-stuck');
});

test('the detail line collapses and stays collapsed across updates', () => {
  banner.update(RUNNING);
  (root.querySelector('[data-banner-detail-toggle]') as HTMLButtonElement).click();
  banner.update({ ...RUNNING, task: 'another' });
  expect(root.querySelector('[data-banner-detail]')!.hidden).toBe(true);
});

test('dispose leaves nothing behind', () => {
  banner.update(RUNNING);
  banner.dispose();
  expect(root.querySelector('[data-banner-detail]')).toBeNull();
});
```

`web/src/frame/runBanner.ts`. Spec decision 12: on by default, collapsible, no new setting, so the collapsed flag is one boolean in the closure and is not persisted.

```ts
/** The second line: what the run is working on, where, and how fast. */
const detailEl = h('div', { class: 'run-banner-detail', 'data-banner-detail': '' });
const detailToggle = h('button', {
  type: 'button', class: 'run-banner-detail-toggle', 'data-banner-detail-toggle': '',
  'aria-expanded': 'true', title: 'Hide the detail line',
  onclick: () => { collapsed = !collapsed; paint(); }
}, '▾');
let collapsed = false;
```

`healthPip` is built the same way as `dot` and carries the condition as its `title`. Both are appended in the `d.root.replaceChildren(...)` call, and painted at the end of `paint()`:

```ts
    // The detail line is aria-hidden for the same reason the clock is: `#run-banner` is an
    // atomic live region, and a line that changes every tick would be re-read every tick.
    detailEl.hidden = collapsed;
    detailToggle.setAttribute('aria-expanded', String(!collapsed));
    setText(detailEl, detailParts(s).join(' · '));
    const health = s.health;
    healthPip.classList.toggle('hidden', health === null);
    if (health) healthPip.title = `Recovering: ${health.condition}`;
```

```ts
/** Each part is omitted when it has no value, so the line never reads "· · ·". */
function detailParts(s: RunStatus): string[] {
  const out: string[] = [];
  if (s.target) out.push(`${s.target.name} (${Math.round(s.target.distance)} tiles)`);
  // RunStatus carries no position; the banner already reaches for the api elsewhere, and a
  // missing one is a normal pre-login state rather than an error.
  const player = d.api()?.getState()?.player;
  if (player) out.push(`${player.worldX}, ${player.worldZ}`);
  for (const [skill, rate] of Object.entries(s.xpPerHour ?? {})) out.push(`${rate.toLocaleString()} ${skill} xp/h`);
  return out;
}
```

- [ ] **Step 3: The run card detail**

`web/src/plugins/builtin/tasksViews.ts`: `renderRunCard` gains a details block under the status line - elapsed and ETA where `until` is a level target (skip the ETA in v1 if the status carries no target level; do not invent one), xp per hour per skill, the current target, and the last five health checks with outcomes. The last five come from the trace, which the panel already subscribes to: keep a small ring buffer of `health`/`recovery` events in the panel and hand it to `renderRunCard`.

`updateRunCard` patches the same fields in place, for the same reason it already patches the clock: rebuilding takes focus off Pause.

Panel tests: a status with a target renders it; a status with two skills renders both xp rates; the ring buffer never grows past five; `updateRunCard` does not replace the card element (assert the node identity is unchanged).

- [ ] **Step 4: The styleguide**

Add a "Run banner" section to `web/styleguide.html` / `web/src/styleguide.ts` showing the banner in its four states (running, running with a target and a health pip, paused, failed), so the CSS can be eyeballed with `npm run preview` rather than by starting the whole stack.

- [ ] **Step 5: Verify and commit**

```bash
cd web && npm run typecheck && npm run lint && npx vitest run
```

```bash
git add web/src/tasks/types.ts web/src/agent web/src/frame/runBanner.ts web/src/frame/runBanner.test.ts web/src/plugins/builtin/tasksViews.ts web/src/plugins/builtin/tasks.ts web/src/plugins/builtin/tasks.test.ts web/src/styles web/styleguide.html web/src/styleguide.ts
git -c core.safecrlf=false commit -m "$(cat <<'EOF'
feat(tasks): show the target, the health and the xp rate of a live run

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
EOF
)"
```

---

### Task 11: Run history, the report, and export

History keeps its IndexedDB store and changes its cap policy (spec decision 6): summaries for **200** runs, full traces for the newest **50**. Opening a history row now shows a report before the raw trace, and every run can be exported as JSON.

**Files:**
- Create: `web/src/tasks/runReport.ts`, `web/src/tasks/runReport.test.ts`, `web/src/plugins/builtin/runReportView.ts`, `web/src/plugins/builtin/runReportView.test.ts`
- Modify: `web/src/tasks/history.ts`, `web/src/tasks/history.test.ts`, `web/src/tasks/types.ts`, `web/src/tasks/api.ts`, `web/src/agent/worker.ts`, `web/src/plugins/builtin/tasks.ts`, `web/src/plugins/builtin/tasksViews.ts`

**Interfaces:**
- Consumes: `RunSummary`, `TraceEvent`, `HealthCondition` and `FailReason` (Task 7), `monitor.counts()` (Task 7).
- Produces:
  - `RunSummary` gains `failReason?: FailReason`, `itemsDelta: Record<number, number>`, `tilesTravelled: number`, `recoveries: Partial<Record<HealthCondition, number>>`, `characterName: string | null`.
  - `web/src/tasks/history.ts`: schema version 2, `RunHistoryOptions` gains `summaryCap` (default 200) and `traceCap` (default 50).
  - `web/src/tasks/runReport.ts`: `buildRunReport(summary, events): RunReport` with `{ totals, timeline, recoveries, failReason }`.
  - `TasksApi.exportRun(runId: string): Promise<Blob>`.

- [ ] **Step 1: The summary fields**

`web/src/tasks/types.ts`, on `RunSummary`. `itemsDelta`, `tilesTravelled` and `recoveries` are required with empty defaults rather than optional, so a reader never has to branch on "old row or new row"; the migration in Step 2 fills them.

`web/src/agent/worker.ts`, in `endRun`, fill them: `itemsDelta: t.itemsDelta()`, `recoveries: monitorRef?.counts() ?? {}`, `failReason: runner?.failReason() ?? undefined`, `characterName` from a new `characterName` field on the `run` message (the host already sends `characterId`; add the name beside it, sourced in `wire.ts` from the session), and `tilesTravelled` from a counter the Worker keeps by summing `TravelResult.tiles` - expose it as a `tiles()` accessor on the travel layer rather than parsing the trace.

- [ ] **Step 2: History schema 2, test first**

`web/src/tasks/history.test.ts` (the suite uses `fake-indexeddb`):

```ts
test('summaries are kept to 200 and traces to 50', async () => {
  const history = createRunHistory({ dbName: unique(), summaryCap: 200, traceCap: 50 });
  for (let i = 0; i < 205; i++) await history.put(summary(`r${i}`, i), [event(i)]);
  const list = await history.list(1000);
  expect(list).toHaveLength(200);
  // The newest 50 keep their events; older rows keep the summary and lose the trace.
  expect((await history.get('r204'))!.events).toHaveLength(1);
  expect((await history.get('r100'))!.events).toEqual([]);
  expect(await history.get('r0')).toBeNull();
});

test('a v1 database is migrated without dropping a single summary', async () => {
  const name = unique();
  await seedV1(name, 60);                       // opens version 1 by hand and writes 60 runs
  const history = createRunHistory({ dbName: name, summaryCap: 200, traceCap: 50 });
  expect(await history.list(1000)).toHaveLength(60);
});

test('a summary written by an older build reads back with the new fields defaulted', async () => {
  const name = unique();
  await seedV1(name, 1);
  const history = createRunHistory({ dbName: name });
  const [row] = await history.list(1);
  expect(row.itemsDelta).toEqual({});
  expect(row.recoveries).toEqual({});
  expect(row.tilesTravelled).toBe(0);
});
```

`web/src/tasks/history.ts`: open at version **2**; `onupgradeneeded` creates the stores when absent and otherwise leaves both alone (the migration is a read-time default, not a rewrite - rewriting 200 rows inside an upgrade transaction is where this kind of change goes wrong). `trim` splits into two passes: drop `runs` past `summaryCap` (deleting their events with them), then drop `events` for every run outside the newest `traceCap`. Reads normalise old rows through one `withDefaults(summary)` helper.

- [ ] **Step 3: The report model, test first**

`web/src/tasks/runReport.test.ts`:

```ts
import { expect, test } from 'vitest';
import { buildRunReport } from './runReport';
import type { RunSummary, TraceEvent } from './types';

let seq = 0;
const ev = (at: number, e: Omit<TraceEvent, 'seq' | 'at'>): TraceEvent => ({ ...e, seq: ++seq, at } as TraceEvent);
const summary = (patch: Partial<RunSummary> = {}): RunSummary => ({
  runId: 'r1', scriptId: 's', scriptName: 'S', version: 1, source: 'library', startedBy: 'player',
  characterId: null, characterName: null, params: {}, status: 'done', startedAt: 0, endedAt: 10_000,
  durationMs: 10_000, xpGained: { Woodcutting: 120 }, itemsDelta: { 1511: 4 }, tilesTravelled: 37,
  recoveries: { 'dialog-stuck': 2 }, lastTask: 'chop', summary: 'done', ...patch
});

test('the timeline is one entry per task visit, with its duration and attempts', () => {
  const report = buildRunReport(summary(), [
    ev(0, { kind: 'task_enter', task: 'chop' }),
    ev(4000, { kind: 'task_exit', task: 'chop', outcome: 'ok', attempts: 1, ms: 4000 })
  ]);
  expect(report.timeline).toEqual([{ task: 'chop', startedAt: 0, ms: 4000, outcome: 'ok', attempts: 1 }]);
});

test('two visits to the same task are two entries, not one merged row', () => {
  const report = buildRunReport(summary(), [
    ev(0, { kind: 'task_enter', task: 'chop' }),
    ev(1000, { kind: 'task_exit', task: 'chop', outcome: 'ok', attempts: 1, ms: 1000 }),
    ev(2000, { kind: 'task_enter', task: 'chop' }),
    ev(3000, { kind: 'task_exit', task: 'chop', outcome: 'failed', attempts: 1, ms: 1000 })
  ]);
  expect(report.timeline).toHaveLength(2);
  expect(report.timeline[1].outcome).toBe('failed');
});

test('a task that never exited is still on the timeline, running to the end of the run', () => {
  const report = buildRunReport(summary({ endedAt: 9000 }), [ev(1000, { kind: 'task_enter', task: 'chop' })]);
  expect(report.timeline).toEqual([{ task: 'chop', startedAt: 1000, ms: 8000, outcome: null, attempts: 0 }]);
});

test('totals come from the summary, which is what history stores once the trace is gone', () => {
  const report = buildRunReport(summary(), []);
  expect(report.totals).toMatchObject({ durationMs: 10_000, xp: { Woodcutting: 120 }, items: { 1511: 4 }, tiles: 37 });
  expect(report.recoveries).toEqual({ 'dialog-stuck': 2 });
});

test('a truncated trace reports how many events it lost', () => {
  const report = buildRunReport(summary(), [ev(0, { kind: 'truncated', dropped: 900 })]);
  expect(report.droppedEvents).toBe(900);
});

test('a run with no events produces an empty timeline rather than throwing', () => {
  expect(buildRunReport(summary(), []).timeline).toEqual([]);
});
```

`web/src/tasks/runReport.ts`:

```ts
// A run, as a reader wants it: what it did in order, and what it added up to. Pure, so the
// panel is a renderer and this is the thing that is actually tested.
//
// The totals come from the summary rather than from the trace, because history keeps 200
// summaries and only 50 traces (spec decision 6): a report for an older run has to be honest
// with no events at all.
import type { FailReason, HealthCondition, RunSummary, TraceEvent } from './types';

export interface TimelineEntry {
  task: string; startedAt: number; ms: number;
  outcome: 'ok' | 'failed' | 'timeout' | 'aborted' | null; attempts: number;
}

export interface RunReport {
  totals: { durationMs: number; xp: Record<string, number>; items: Record<number, number>; tiles: number };
  timeline: TimelineEntry[];
  recoveries: Partial<Record<HealthCondition, number>>;
  failReason?: FailReason;
  droppedEvents: number;
}

export function buildRunReport(summary: RunSummary, events: TraceEvent[]): RunReport {
  const timeline: TimelineEntry[] = [];
  let open: TimelineEntry | null = null;
  let droppedEvents = 0;

  for (const e of events) {
    if (e.kind === 'truncated') { droppedEvents += e.dropped; continue; }
    if (e.kind === 'task_enter') {
      open = { task: e.task, startedAt: e.at, ms: 0, outcome: null, attempts: 0 };
      timeline.push(open);
      continue;
    }
    if (e.kind === 'task_exit' && open && open.task === e.task) {
      open.ms = e.ms;
      open.outcome = e.outcome;
      open.attempts = e.attempts;
      open = null;
    }
  }
  // A task the run was still inside when it ended has no exit event; give it the rest of the run
  // rather than a zero-width bar, which would read as "it did nothing".
  if (open) open.ms = Math.max(0, (summary.endedAt ?? summary.startedAt + summary.durationMs) - open.startedAt);

  return {
    totals: {
      durationMs: summary.durationMs,
      xp: { ...summary.xpGained },
      items: { ...summary.itemsDelta },
      tiles: summary.tilesTravelled
    },
    timeline,
    recoveries: { ...summary.recoveries },
    ...(summary.failReason === undefined ? {} : { failReason: summary.failReason }),
    droppedEvents
  };
}
```

- [ ] **Step 4: The report view and Export**

`web/src/plugins/builtin/runReportView.ts` renders the report: the timeline as a stacked bar (one `<div>` per entry with a percentage width and a title), the outcome and `FailReason`, the totals, the recoveries by condition, and a "Show trace" toggle that mounts the existing `renderTraceView` underneath. Two buttons: "Copy for Claude" (the existing behaviour, moved) and **Export**.

`TasksApi.exportRun(runId)`:

```ts
    async exportRun(runId) {
      const { summary, events } = await getRun(runId);
      return new Blob([JSON.stringify({ summary, events }, null, 2)], { type: 'application/json' });
    },
```

The panel turns it into a download with an object URL and revokes it on the next tick. **This is a real download in the shell, not in an artifact**, so `<a download>` works; assert in the panel test that `URL.revokeObjectURL` is called.

`web/src/plugins/builtin/tasks.ts`: `openTraceFor` becomes `openReportFor`, mounting `renderRunReport` and keeping the trace behind its toggle. The existing `data-trace-open` hook stays on the history row so `web/e2e/tasks.pw.test.ts` keeps working; add `data-report` to the new view.

- [ ] **Step 5: Verify and commit**

```bash
cd web && npm run typecheck && npm run lint && npx vitest run
```

```bash
git add web/src/tasks/history.ts web/src/tasks/history.test.ts web/src/tasks/runReport.ts web/src/tasks/runReport.test.ts web/src/tasks/types.ts web/src/tasks/api.ts web/src/tasks/api.test.ts web/src/agent/worker.ts web/src/plugins/builtin
git -c core.safecrlf=false commit -m "$(cat <<'EOF'
feat(tasks): keep 200 run summaries and show a report for each one

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
EOF
)"
```

---

### Task 12: The three library scripts, upgraded

`chop-and-drop`, `net-fish-and-drop` and `mine-and-drop` each hardcode "the nearest thing in the current snapshot" and fail with `not_found` the moment they are one tile too far away. They become `find` plus `travel` scripts and declare a health policy.

**Files:**
- Modify: `web/src/tasks/library/chopAndDrop.ts`, `netFishAndDrop.ts`, `mineAndDrop.ts`, `library.test.ts`, `librarySource.test.ts`

**Interfaces:**
- Consumes: `ScriptContext['find']` (Task 6), `ScriptContext['travel']` (Task 5), `HealthPolicy` (Task 7), the existing `loopHelpers`.
- Produces: no new exports. `libraryManifests()` gains `health` in the manifest copy so the api can see the policy.

**The constraint that bites here:** `web/src/tasks/library/index.ts` carries a `HELPERS` string, inlined into every fork seed, and `librarySource.test.ts` compiles each seed and compares the helpers against the real module. **Do not add a new shared import to a library script**: either inline the logic in the script, or add the helper to `loopHelpers.ts` *and* to the `HELPERS` string in the same commit. The test will tell you, but only if you run it.

- [ ] **Step 1: Update the scripted-sequence tests first**

`web/src/tasks/library/library.test.ts` drives each script against a scripted world sequence. Add, per script:

```ts
test('chop-and-drop walks to a tree the atlas knows when none is in the scene', async () => {
  const world = sequence([empty(), empty(), withTree(3260, 3200)]);
  const ctx = fakeContext(world, { atlas: OAK_CLUSTER });
  await runTask(chopAndDrop, 'chop-nearest', ctx);
  expect(ctx.travel.to).toHaveBeenCalled();
  expect(ctx.bot.interactLoc).toHaveBeenCalledWith(expect.objectContaining({ name: 'Oak' }), 'Chop down');
});

test('chop-and-drop stops saying "no tree in range" and reports the discovery layer instead', async () => {
  const ctx = fakeContext(sequence([empty()]), { atlas: null });
  const result = await runTask(chopAndDrop, 'chop-nearest', ctx);
  expect(result).toMatchObject({ success: false, reason: 'not_found' });
  expect(ctx.trace).toHaveBeenCalledWith(expect.objectContaining({ kind: 'target' }));
});
```

- [ ] **Step 2: Rewrite the three task bodies**

`web/src/tasks/library/chopAndDrop.ts`, the `chop-nearest` task:

```ts
    {
      name: 'chop-nearest', when: () => true, timeoutMs: 60_000,
      async run(c) {
        const kind = String(c.params.tree);
        c.status(`Looking for a ${kind}`);
        // `find.nearest` walks the layers itself: the scene, then the atlas (which walks there),
        // then a sweep. "No tree in range" is no longer a failure the script has to invent.
        const found = await c.find.nearest('tree', { variant: new RegExp(`^${kind}$`, 'i') });
        if (!found) return { success: false, message: `no ${kind} anywhere nearby`, reason: 'not_found' };
        c.status(`Chopping ${found.name}`);
        const target = found.loc;
        const r = target ? await c.bot.interactLoc(target, 'Chop down') : await c.bot.chopTree(kind);
        if (!r.success) return r;
        await c.wait.xp('Woodcutting', 1, 30_000);
      }
    }
```

and the manifest gains:

```ts
  health: { onDeath: 'return-and-resume', noProgressMs: 90_000 },
```

`netFishAndDrop.ts` uses `c.find.nearest('fishing-spot', { variant: ... })` and interacts with `found.npc`; `mineAndDrop.ts` uses `c.find.nearest('rock', { variant: new RegExp(ore, 'i') })` and `found.loc`. Both keep their existing `until`, their `dropAllTask`, and their requirements untouched.

`web/src/tasks/library/index.ts`: `libraryManifests()` copies `health` and `anchor` alongside the fields it already copies.

- [ ] **Step 3: Verify and commit**

```bash
cd web && npm run typecheck && npm run lint && npx vitest run src/tasks/library
```

```bash
git add web/src/tasks/library
git -c core.safecrlf=false commit -m "$(cat <<'EOF'
feat(tasks): let the library scripts find and walk to their own resources

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
EOF
)"
```

---

### Task 13: The Tutorial Island script

The script that exercises every piece of this sub-project at once. `%tutorial` is server-only, so the on-screen title is the step signal; three titles are empty strings, so the script matches on `tutorial.title`, then `flashingTab`, then `hint`, then `dialog.isOpen`, in that order.

**The 75 `~tutorialstep` calls in `engine/content/scripts/tutorial/scripts/tut_chatbox_steps.rs2`, in order** (this is the real list, extracted from the pinned clone; Step 1 generates it rather than copying it):

`Getting started`, `` (spanner), `Player controls`, `Interacting with scenery` (x2), `Moving around`, `Viewing the items that you were given.`, `Cut down a tree`, `Please wait...`, `Building a fire`, `Please wait...`, `You gained some experience...`, `These are your stats.`, `Catch some Shrimp.`, `Please wait...`, `Cooking your shrimp.`, `Burning your shrimp.`, `Well done, you've just cooked your first RuneScape meal.`, `Find your next instructor.` (x2), `Making dough.`, `` , `Well done, your first loaf of bread. As you gain experience in`, `The Music Player.` (x2), `It's only a short distance to the next guide.`, `Running.`, `Run to the next guide.`, four empty titles (the quest-guide steps), `Mining and smithing.`, `Please wait...`, `Prospecting`, `It's copper.`, `It's tin.` (x2), `It's copper.`, `Please wait...`, `Mining.` (x3), `Smelting.`, `You've made a bronze bar!`, `Smithing a dagger.`, `You've finished this area.`, `Combat.`, ``, `This is your worn inventory.`, `You're now holding your dagger.`, `Unequipping items.`, `Combat interface.`, `This is your Combat interface.`, `Attacking.`, `Sit back and watch.`, `Well done, you've made your first kill!`, `Rat ranging.`, `Moving on.`, `Banking.`, `This is your bank box.`, `Financial advice.`, five empty titles (the chapel and prayer steps), `This is your friends list.`, `This is your ignore list.`, ``, `Your final instructor!`, `Open up your final menu.`, `Cast Wind Strike at a chicken.` (x2), `You have almost completed the tutorial!`.

**Files:**
- Create: `scripts/gen/tutorial-steps.ts`, `web/src/tasks/library/tutorialIsland/steps.ts` (generated), `helpers.ts`, `recovery.ts`, `guide.ts`, `survival.ts`, `chef.ts`, `quest.ts`, `mining.ts`, `combat.ts`, `finish.ts`, `index.ts`, and one test file per stage
- Modify: `web/src/tasks/library/index.ts`, `web/src/data/atlas.json` (the Tutorial Island routes), `scripts/gen/atlas.ts` (the route table), `scripts/build.ps1`

**Interfaces:**
- Consumes: everything from Tasks 1 and 5 to 8, plus `isTutorialRegion` and `TUTORIAL_REGION_IDS` (`web/src/tasks/library/regions.ts`, already present).
- Produces: the library script `tutorial-island`, and `TUTORIAL_STEPS: readonly string[]` from the generated module.

- [ ] **Step 1: Generate the step list**

`scripts/gen/tutorial-steps.ts`: read the `.rs2`, match `/~tutorialstep\("((?:[^"\\]|\\.)*)"/g` in file order, and emit

```ts
// GENERATED by scripts/gen/tutorial-steps.ts from
// engine/content/scripts/tutorial/scripts/tut_chatbox_steps.rs2. Do not edit by hand.
export const TUTORIAL_STEPS: readonly string[] = [ /* 75 entries, empty strings included */ ];
```

`web/src/tasks/library/tutorialIsland/steps.test.ts` is the contract with the content: every title the stages match on has to still exist.

```ts
import { expect, test } from 'vitest';
import { TUTORIAL_STEPS } from './steps';
import { MATCHED_TITLES } from './helpers';

test('every title the script matches on is still in the content', () => {
  for (const title of MATCHED_TITLES) {
    expect(TUTORIAL_STEPS, `"${title}" is gone from tut_chatbox_steps.rs2`).toContain(title);
  }
});

test('the three empty titles are still empty, so title matching alone is not enough', () => {
  expect(TUTORIAL_STEPS.filter(t => t === '').length).toBeGreaterThanOrEqual(3);
});
```

Add `bun scripts/gen/tutorial-steps.ts --check` to the `scripts/build.ps1` step Tasks 3 and 4 built.

- [ ] **Step 2: The shared helpers**

`web/src/tasks/library/tutorialIsland/helpers.ts`:

```ts
// What every stage needs: matching a step, talking to the instructor the hint points at, and
// the list of titles the script keys on (which `steps.test.ts` checks against the content).
import type { ScriptContext, Task } from '../../types';
import type { WorldState } from '../../../agent/types';

/** Every title any stage matches on. Keep it in sync when a stage adds one. */
export const MATCHED_TITLES = [
  'Getting started', 'Player controls', 'Interacting with scenery', 'Moving around',
  'Viewing the items that you were given.', 'Cut down a tree', 'Building a fire',
  'You gained some experience...', 'These are your stats.', 'Catch some Shrimp.',
  'Cooking your shrimp.', 'Well done, you\'ve just cooked your first RuneScape meal.',
  'Find your next instructor.', 'Making dough.', 'The Music Player.', 'Running.',
  'Run to the next guide.', 'Mining and smithing.', 'Prospecting', 'Mining.', 'Smelting.',
  'Smithing a dagger.', 'You\'ve finished this area.', 'Combat.', 'This is your worn inventory.',
  'Unequipping items.', 'Combat interface.', 'Attacking.', 'Rat ranging.', 'Moving on.',
  'Banking.', 'Financial advice.', 'This is your friends list.', 'This is your ignore list.',
  'Your final instructor!', 'Open up your final menu.', 'Cast Wind Strike at a chicken.',
  'You have almost completed the tutorial!'
] as const;

export const titleIs = (s: WorldState, title: string): boolean => (s.tutorial?.title ?? '') === title;
export const titleStarts = (s: WorldState, prefix: string): boolean => (s.tutorial?.title ?? '').startsWith(prefix);

/** A step whose whole job is "do what the arrow says", which is most of the island. */
export function hintStep(name: string, when: (s: WorldState) => boolean, opts: { timeoutMs?: number } = {}): Task {
  return {
    name, when, timeoutMs: opts.timeoutMs ?? 30_000,
    async run(c: ScriptContext) {
      c.status(name);
      const r = await c.tutorial.followHint();
      if (!r.success) return r;
      await c.wait.until(s => (s.tutorial?.title ?? '') !== c.tutorial.title(), { timeoutMs: 20_000, label: name });
    }
  };
}

/** The flashing sidebar tab a step asks for. `flashingTab` is the tab index, or null. */
export function tabStep(name: string, when: (s: WorldState) => boolean): Task {
  return {
    name, when, timeoutMs: 20_000,
    async run(c: ScriptContext) {
      const tab = c.state().flashingTab;
      if (tab === null || tab === undefined) return { success: false, message: 'no tab is flashing', reason: 'not_found' };
      c.status(`Opening tab ${tab}`);
      await c.sdk.sendClickTab(tab);
      await c.wait.until(s => s.flashingTab === null, { timeoutMs: 10_000, label: name });
    }
  };
}
```

`sendClickTab` is the SDK's tab method; check its exact name in `web/src/vendor/rs-sdk/sdk/index.ts` before writing it (the tab helpers are in the "Interface" section) and use whatever it is called there.

- [ ] **Step 3: The stages**

One module per stage so no file passes 400 lines. Each exports `export const TASKS: Task[]`. The trigger column is the `when`; the action column is the `run`.

`recovery.ts` - claimed conditions, declared with `recovers` so the monitor does not fight the script:

| Task | Trigger | Action | `recovers` |
|---|---|---|---|
| `design-character` | `s.interface?.interfaceId === 3559` (the `CHAR_DESIGN_INTERFACE` constant already in `web/src/agent/constants.ts`) | `sdk.sendRandomizeCharacterDesign()` when `params.randomiseAppearance`, then accept | `['unexpected-interface']` |
| `continue-dialog` | `s.dialog?.isOpen && !s.dialog.options?.length` | `tutorial.clickThrough(5)` | `['dialog-stuck']` |
| `dismiss-level-up` | `isLevelUp(s)` | `tutorial.clickThrough(3)` | `['level-up']` |
| `close-unexpected-modal` | `s.modalOpen && !EXPECTED.includes(s.modalInterface)` | `sdk.sendCloseModal()` | `['unexpected-interface']` |

`guide.ts`: `getting-started` (title `Getting started` or `Player controls`, or the empty title with `flashingTab` set), `interact-scenery` (title `Interacting with scenery`, follow the hinted door), `moving-around` (title `Moving around`, follow the hint, then walk to the survival expert).

`survival.ts`: `view-inventory` (tab step), `cut-tree` (`c.find.nearest('tree')` then `Chop down`, **not** a hardcoded tile - this is the discovery layer being exercised on purpose), `build-fire` (use tinderbox on logs), `open-skills` (tab step), `catch-shrimp` (`c.find.nearest('fishing-spot')` then `Net`), `cook-shrimp` (use shrimp on the fire), `survival-recap` (talk to the hinted instructor).

`chef.ts`: `go-to-chef` (travel through the gate), `talk-to-chef`, `make-dough` (use flour on water), `bake-bread`, `open-music-tab` (tab step), `enable-run` (click the run orb).

`quest.ts`: `enter-quest-house`, `talk-quest-guide`, `open-quest-journal` (tab step), `enter-mine` (the ladder, as a route `interact` waypoint).

`mining.ts`: `talk-mining-instructor`, `prospect-rocks`, `mine-rocks` (both `It's copper.` and `It's tin.` steps), `smelt-bar`, `smith-dagger`, `leave-mine`.

`combat.ts`: `talk-combat-instructor`, `open-worn` (tab step), `equip-dagger`, `unequip`, `open-combat-tab` (tab step), `attack-rat-melee`, `leave-pit`, `attack-rat-ranged`, `climb-ladder-to-bank`.

`finish.ts`: `open-bank`, `close-bank`, `talk-advisor`, the chapel and magic steps, and `finish` (choose the mainland option in the last dialog).

Write `guide.ts` and `survival.ts` fully first, get them green against scripted sequences, and use them as the template for the rest. A worked example, `survival.ts`'s `cut-tree`:

```ts
export const TASKS: Task[] = [
  {
    name: 'cut-tree',
    when: s => titleIs(s, 'Cut down a tree'),
    timeoutMs: 90_000,
    async run(c) {
      c.status('Cutting the tutorial tree');
      // By kind, not by tile: the island's tree is where the content puts it, and this is the
      // discovery layer doing its job on the smallest possible map.
      const tree = await c.find.nearest('tree', { radius: 30 });
      if (!tree?.loc) return { success: false, message: 'no tree on the island', reason: 'not_found' };
      const r = await c.bot.interactLoc(tree.loc, 'Chop down');
      if (!r.success) return r;
      await c.wait.item('Logs', 1, 60_000);
    }
  },
  // ...
];
```

- [ ] **Step 4: The script itself**

`web/src/tasks/library/tutorialIsland/index.ts`:

```ts
import { defineScript } from '../../defineScript';
import { isTutorialRegion } from '../regions';
import { TASKS as recovery } from './recovery';
import { TASKS as guide } from './guide';
import { TASKS as survival } from './survival';
import { TASKS as chef } from './chef';
import { TASKS as quest } from './quest';
import { TASKS as mining } from './mining';
import { TASKS as combat } from './combat';
import { TASKS as finish } from './finish';

export default defineScript({
  id: 'tutorial-island', name: 'Tutorial Island', version: 1, order: 5,
  tags: ['tutorial', 'questing'], author: 'idlescape',
  description: 'Plays a fresh character through Tutorial Island and out onto the mainland.',
  params: {
    randomiseAppearance: { type: 'boolean', label: 'Randomise appearance', default: true }
  },
  requires: [{ kind: 'area', regionIds: [...TUTORIAL_REGION_IDS], text: 'Only runs on Tutorial Island' }],
  stuckAfterMs: 45_000, maxAttempts: 3, hardStop: { hpBelow: 3 }, estimateMinutes: 25,
  health: {
    onDeath: 'fail',                       // nothing on the island should kill anyone
    noProgressMs: 120_000,                 // several steps genuinely wait on the server
    expectInterfaces: [3559],              // the character designer, which recovery.ts owns
    maxRecoveryAttempts: 3
  },
  // Recovery first: a modal or a dialog blocks every other task on the island.
  tasks: [...recovery, ...guide, ...survival, ...chef, ...quest, ...mining, ...combat, ...finish],
  until: s => !isTutorialRegion(s.regionId) && s.tutorial?.open !== true
});
```

Register it in `web/src/tasks/library/index.ts`'s `LIBRARY` array and in `SOURCES` (its `?raw` import is the whole directory's entry module, so `librarySource('tutorial-island')` returns the index module only - that is honest, and the Fork button on a multi-module script is out of scope; make `librarySource` return `null` for it and add a test that says so).

- [ ] **Step 5: Scripted-sequence tests per stage**

One test file per stage module, each driving a scripted title sequence and asserting the task that fires and the action it takes. The shape that matters:

```ts
test('the empty-title spanner step is matched by the flashing tab, not by the title', async () => {
  const s = world({ tutorial: { open: true, title: '', lines: [] }, flashingTab: 11 });
  const task = pick(guide.TASKS, s);
  expect(task?.name).toBe('getting-started');
});

test('no task matches a title the script does not know, so the runner goes stuck rather than looping', () => {
  const s = world({ tutorial: { open: true, title: 'A step from a future content bump', lines: [] } });
  expect(pick([...guide.TASKS, ...survival.TASKS], s)).toBeUndefined();
});
```

- [ ] **Step 6: The Tutorial Island routes**

Once Step 5 is green, add the island's two level changes to the atlas as `interact` route waypoints (spec decision 11): the mine ladder and the bank ladder. Get their coordinates from the content rather than by guessing:

```bash
cd /c/projects/osrs_test && grep -n "Ladder" engine/content/scripts/tutorial/configs/*.loc
```

then find that loc id's placements in the island's map squares (`m48_48.jm2`, `m48_47.jm2`, `m47_48.jm2`, `m47_47.jm2`, `m49_48.jm2`) with the `parseJm2` helper. Add them to a `ROUTES` table in `web/src/data/gen/landmarks.ts`, emit them from `scripts/gen/atlas.ts`, regenerate, and commit the new `atlas.json`.

- [ ] **Step 7: Verify and commit**

```bash
cd web && npm run typecheck && npm run lint && npx vitest run
```

```bash
git add web/src/tasks/library scripts/gen/tutorial-steps.ts scripts/gen/atlas.ts web/src/data/gen/landmarks.ts web/src/data/atlas.json scripts/build.ps1
git -c core.safecrlf=false commit -m "$(cat <<'EOF'
feat(tasks): add the Tutorial Island script

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
EOF
)"
```

---

### Task 14: The real-stack e2e

Unit tests prove the pieces; this proves the thing. Four Playwright specs against the local stack, on tick budgets rather than wall clocks (spec decision 9), seeded through the engine's own cheat commands (plan ruling R4).

**Files:**
- Create: `web/e2e/harness.ts`, `web/e2e/scripts.pw.test.ts`, `web/e2e/tutorial-island.pw.test.ts`
- Modify: `web/e2e/helpers.ts`, `web/playwright.config.ts`, `scripts/start-stack.ps1`, `scripts/verify.ps1`

**Interfaces:**
- Consumes: `loginAsGuest`, `openCharacterTab`, `openPanel`, `clientState`, `signUpAndPlay` (`web/e2e/helpers.ts`), `window.idlescape.tasks`.
- Produces: `web/e2e/harness.ts` exporting `seedCharacter(page, seed)`, `runUntil(page, predicate, opts)`, `saveArtifacts(page, name)`, and `type Seed = { at?: { level: number; mx: number; mz: number; lx: number; lz: number }; inventory?: [string, number][]; skills?: [string, number][] }`.

- [ ] **Step 1: Give the e2e stack a staff level**

`scripts/start-stack.ps1`: add `-DevStaff` to the `param(...)` line and change line 59 to

```powershell
# Dev only: `::give`, `::setstat` and `::tele` need staffmodlevel 4, which
# engine-custom/src/idlescape/staff.ts grants only from this variable and only when the engine
# is not in production mode. verify.ps1 passes -Prod -DevStaff so the e2e harness can seed a
# character without playing it to a pickaxe; a deployed world forces devStaffLevel to 0.
if ((-not $Prod) -or $DevStaff) { $env:IDLESCAPE_DEV_STAFF = '4' }
```

`scripts/verify.ps1`: the stack `-ArgumentList` gains `'-DevStaff'` after `'-Prod'`.

Prove it before writing a single test: bring the stack up with `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-stack.ps1 -Prod -DevStaff`, log a guest in, and run `window.idlescape.tasks.dispatch({ type: 'say', message: '::give bronze_axe 1', reason: 'test' })` from the browser console. If the axe does not appear, nothing else in this task can work - check `logs/engine.log` for the staff level and `Environment.node.production`.

- [ ] **Step 2: The harness**

`web/e2e/harness.ts`:

```ts
// Seeding and polling for the script e2e. Seeding goes through the engine's own developer
// commands, which the client's `say()` routes to CLIENT_CHEAT for any `::`-prefixed message
// (client/src/client/Client.ts:1883). There are no dev HTTP routes on the engine: the only
// management routes it registers are the owner bank ones (plan ruling R4).
import { expect, type Page } from '@playwright/test';

export interface Seed {
  /** `::tele level,mx,mz,lx,lz`. */
  at?: { level: number; mx: number; mz: number; lx: number; lz: number };
  /** `::give <item> <n>`; the item is the content debug name, e.g. `bronze_axe`. */
  inventory?: [string, number][];
  /** `::setstat <skill> <level>`. */
  skills?: [string, number][];
}

const cheat = (page: Page, message: string): Promise<unknown> =>
  page.evaluate(m => window.idlescape!.tasks!.dispatch({ type: 'say', message: m, reason: 'e2e' }), message);

export async function seedCharacter(page: Page, seed: Seed): Promise<void> {
  for (const [skill, level] of seed.skills ?? []) await cheat(page, `::setstat ${skill} ${level}`);
  for (const [item, count] of seed.inventory ?? []) await cheat(page, `::give ${item} ${count}`);
  if (seed.at) await cheat(page, `::tele ${seed.at.level},${seed.at.mx},${seed.at.mz},${seed.at.lx},${seed.at.lz}`);
  // Every cheat is a packet; the world needs a tick to show the result, and a seed that has not
  // landed makes the run under test fail for a reason that has nothing to do with the run.
  if (seed.at) {
    await expect.poll(() => page.evaluate(() => window.idlescape!.tasks!.getState()?.player?.worldX ?? 0))
      .toBe((seed.at.mx << 6) + seed.at.lx);
  }
}

export interface RunUntilOpts { ticks: number; label: string }

/**
 * Poll the live run until `predicate` holds, budgeted in GAME TICKS rather than wall clock so a
 * slow machine does not move the pass criteria. Fails with the last slice of the trace attached,
 * which is the difference between "the run did not finish" and knowing why.
 */
export async function runUntil(page: Page, predicate: string, opts: RunUntilOpts): Promise<void> {
  const start = await page.evaluate(() => window.idlescape!.tasks!.getState()?.tick ?? 0);
  try {
    await expect.poll(
      () => page.evaluate(p => {
        const api = window.idlescape!.tasks!;
        const state = api.getState();
        return Boolean(new Function('state', 'status', `return ${p}`)(state, api.status()));
      }, predicate),
      { timeout: opts.ticks * 600 + 30_000, message: opts.label }
    ).toBe(true);
  } catch (e) {
    const trace = await page.evaluate(async () => {
      const api = window.idlescape!.tasks!;
      const run = await api.getRun().catch(() => null);
      return run ? run.events.slice(-40).map(ev => JSON.stringify(ev)).join('\n') : 'no run';
    });
    const ticks = (await page.evaluate(() => window.idlescape!.tasks!.getState()?.tick ?? 0)) - start;
    throw new Error(`${opts.label} did not hold within ${opts.ticks} ticks (saw ${ticks})\n${trace}`);
  }
}

/** Spec decision 9: a spec that fails twice leaves its trace and its screenshot behind. */
export async function saveArtifacts(page: Page, name: string): Promise<void> {
  const run = await page.evaluate(() => window.idlescape!.tasks!.getRun().catch(() => null));
  const fs = await import('node:fs/promises');
  await fs.mkdir('../docs/runs', { recursive: true });
  if (run) await fs.writeFile(`../docs/runs/${name}.jsonl`, run.events.map(e => JSON.stringify(e)).join('\n'));
  await page.screenshot({ path: `../docs/screenshots/${name}.png` });
}
```

`web/playwright.config.ts`: `retries: 1` (spec decision 9).

- [ ] **Step 3: The skilling specs**

`web/e2e/scripts.pw.test.ts`, one test per library script, exactly the table in spec section 3.7:

```ts
test('chop-and-drop earns woodcutting xp and drops a full inventory', async ({ page }) => {
  await openGate(page);
  await loginAsGuest(page);
  await seedCharacter(page, {
    at: { level: 0, mx: 50, mz: 50, lx: 22, lz: 18 },        // Lumbridge castle courtyard
    inventory: [['bronze_axe', 1]]
  });
  await page.evaluate(() => window.idlescape!.tasks!.run('chop-and-drop', { untilLevel: 3 }, { startedBy: 'test' }));
  await runUntil(page, "status.state === 'running'", { ticks: 20, label: 'the run starts' });
  await runUntil(page, "(state.skills ?? []).some(k => k.name === 'Woodcutting' && k.experience > 0)", { ticks: 600, label: 'woodcutting xp' });
  const status = await page.evaluate(() => window.idlescape!.tasks!.status());
  expect(status.reason).not.toBe('stuck');
  await page.evaluate(() => window.idlescape!.tasks!.stop('test'));
});
```

`net-fish-and-drop` seeds a small fishing net and stands 30 tiles from the river, so the atlas layer is what finds the spot (assert the trace carries a `target` event with `via: 'atlas'`). `mine-and-drop` seeds a bronze pickaxe at the Varrock east mine and asserts two different rock names were interacted with. Each ends by stopping the run so the next test starts idle.

Add a toggles assertion here too, which spec section 4.3 asks for:

```ts
test('a disabled script is refused on every path', async ({ page }) => {
  await openGate(page);
  await loginAsGuest(page);
  await page.evaluate(() => window.idlescape!.tasks!.setEnabled('chop-and-drop', false));
  const refusal = await page.evaluate(async () => {
    try { await window.idlescape!.tasks!.run('chop-and-drop'); return 'no-error'; }
    catch (e) { return (e as { code?: string }).code ?? 'unknown'; }
  });
  expect(refusal).toBe('disabled');
});
```

- [ ] **Step 4: The Tutorial Island spec**

`web/e2e/tutorial-island.pw.test.ts` - the one wall-clock-bounded test, because the tutorial has server-side waits:

```ts
test('a fresh guest plays off Tutorial Island', async ({ page }) => {
  test.setTimeout(25 * 60_000);
  await openGate(page);
  await loginAsGuest(page);
  await page.evaluate(() => window.idlescape!.tasks!.run('tutorial-island', {}, { startedBy: 'test' }));

  try {
    await expect.poll(
      () => page.evaluate(() => {
        const s = window.idlescape!.tasks!.getState();
        return Boolean(s && !TUTORIAL_REGION_IDS.includes(s.regionId) && s.tutorial?.open !== true);
      }),
      { timeout: 24 * 60_000, message: 'off the island' }
    ).toBe(true);
  } catch (e) {
    await saveArtifacts(page, `tutorial-island-${process.env.GITHUB_SHA ?? 'local'}`);
    throw e;
  }

  const run = await page.evaluate(() => window.idlescape!.tasks!.getRun());
  // Section 4.3: death should never fire on the island, and the run should not have gone stuck.
  expect(run.events.filter(e => e.kind === 'health' && e.condition === 'death')).toHaveLength(0);
  expect(run.summary.status).toBe('done');
  // The banner names the instructor the script is working with.
  await expect(page.locator('[data-banner-detail]')).toContainText(/instructor|guide/i);
});
```

`TUTORIAL_REGION_IDS` cannot be imported into `page.evaluate`; inline the six numbers with a comment pointing at `web/src/tasks/library/regions.ts`, and add a unit assertion in `regions.test.ts` that the inlined list still matches, so the two cannot drift.

- [ ] **Step 5: Run it, and keep what it produces**

```bash
# stack up in one shell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-stack.ps1 -Prod -DevStaff
# then, from web/
cd web && npm run build:e2e && npx playwright test scripts.pw.test.ts
cd web && npx playwright test tutorial-island.pw.test.ts
```

Commit the trace and the screenshot the Tutorial Island run leaves in `docs/runs/` and `docs/screenshots/` **whether or not it needed them**: they are the evidence that this sub-project's headline claim is true.

- [ ] **Step 6: Full verification**

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify.ps1
```

Every step green. This is the acceptance gate for the whole sub-project.

- [ ] **Step 7: Commit**

```bash
git add web/e2e scripts/start-stack.ps1 scripts/verify.ps1 web/playwright.config.ts docs/runs docs/screenshots
git -c core.safecrlf=false commit -m "$(cat <<'EOF'
test(tasks): drive every library script and Tutorial Island on the real stack

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
EOF
)"
```

---

### Task 15: Reconcile the spec with what shipped

Not paperwork. SP8b's spec section 12 is what SP9 inherits from, and SP4c inherits from this one: a spec that still describes the design rather than the build will mislead the next sub-project.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-06-sp4b-bot-expansion-design.md`, `docs/superpowers/specs/2026-09-05-idlescape-roadmap-and-handoff.md`, `README.md`

- [ ] **Step 1: Fold the seven rulings into the spec, in its own voice**

Where a ruling makes an existing sentence wrong, **fix that sentence** rather than leaving a correction standing next to a contradiction:

- R1: section 3.3's "one bit per tile per level" gains what the bit means and that walls are not in it, with the reason and the door table.
- R2: section 3.2's `scripts/gen/atlas.ts` becomes the two-part split, naming `web/src/data/gen/`.
- R3: section 3.1's "a `cancel` main-to-worker message and RPC method" becomes the Worker-to-main `cancel` message.
- R4: section 3.7's "the engine's dev routes" and decision 10 become the `::` cheat path and the `-DevStaff` switch. Section 8's "Assumed, confirmed by the first task that touches it" loses the dev-routes assumption and gains what was actually found.
- R5: section 3.2's "fetched lazily (not bundled)" gains the `?url` mechanism and why `web/public/` is not one.
- R6: section 3.2's fishing-spot naming claim is corrected to the config-driven rule, with the real counts.
- R7: section 3.3's "2 048 x 2 048 window" becomes the padded bounding box.

- [ ] **Step 2: Add a section 12, "What SP4b actually built"**

Modelled on the SP8b spec's section 12, because that is the section this sub-project's successor will read. It records: the interfaces SP4c inherits (`TasksApi.setEnabled`/`exportRun`, the `disabled` error code, `Transport.cancel`/`relogin`, the `health`/`recovery`/`target` trace events, `RunStatus.target`/`health`/`xpPerHour`, `FailReason`), what the atlas and collision files actually contain and cost, which conditions have default recoveries and which do not, and anything the e2e run showed that the design did not predict.

- [ ] **Step 3: Update the roadmap and the README**

`docs/superpowers/specs/2026-09-05-idlescape-roadmap-and-handoff.md`: mark SP4b done in the sub-project table.

`README.md`: a short "Generated map data" note under the build section - what `scripts/gen/*` produces, when to re-run it (a content bump), and that `scripts/build.ps1` fails on drift.

- [ ] **Step 4: Delete the ledger and commit**

Once the final whole-branch review is clean, delete `.superpowers/sdd/2026-09-06-sp4b-bot-expansion/`.

```bash
git add docs/superpowers/specs README.md
git -c core.safecrlf=false commit -m "$(cat <<'EOF'
docs(sp4b): reconcile the spec with what shipped

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
EOF
)"
```

---

## Notes for the executor

**Order.** Task 1 is first because every abort path depends on it, and Task 3 is early because Tasks 5, 6, 12 and 13 all consume the atlas. Tasks 3 and 4 can run in parallel with Tasks 1 and 2 (nothing is shared); 5 needs 4, 6 needs 3 and 5, 7 needs 1, 8 needs 7, 9 needs 2, 10 needs 6 and 7, 11 needs 10, 12 needs 5, 6 and 7, 13 needs 1 to 8, 14 needs everything.

**Worktrees.** Branch every worktree from `feat/platform-shell`, never from a sibling task's branch - twice in SP8b an implementer patched a stale copy of an already-merged file. Before `git worktree remove`, unlink the `node_modules` junctions from PowerShell and verify nothing remains; plain `remove` follows them and empties the main tree's installs. Recovery is `npm ci` in `web/` **and `firebase/`** plus `bun install` in `server/` and `client/`.

**Test hygiene this codebase has earned the hard way.** Mutate, do not read: when a review says a behaviour is covered, break the behaviour and watch the test fail. A test that asserts only the absence of something (no timer armed, nothing rendered) is probably not testing what its name says - assert that no callback fires and no state is written. `setupDom.ts` runs once per file, not per test, so anything mounting into `document.body` needs an explicit reset. A hand-dispatched pointer event must set `buttons`. A `KeyboardEvent` that is not `cancelable` swallows `preventDefault()` silently. `tsconfig` excludes `src/**/*.test.ts` but not `*.harness.ts`, so a vitest import in a harness file breaks the shipped program.

