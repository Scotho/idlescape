# Idlescape - SP4b: bot expansion and the Tutorial Island script

Date: 2026-09-06
Status: approved 2026-09-06 (section 7's twelve decisions, all approved). **Reconciled with the
build on 2026-09-07**: every section below says what shipped rather than what was designed, and
section 9 records what SP4b actually built for the sub-project that inherits it.
Scope owner ask (verbatim, 2026-09-06): "a real expansion to our bot system. camera can pan and
find new resources for the given task, general pathing knowledge around the map and where
resources are, state detection and resetting after failures, better UI and information about the
run and past runs, simple toggles for each script, and actual testing once completed. I suppose
you can work this in with the tutorial island work batch."

Extends: `docs/superpowers/specs/2026-09-05-sp4-tasks-scripting-environment-design.md` (SP4b was
"Tutorial Island validated"; this document is the full SP4b design and supersedes that spec's
section 15 item 2). Consistent with `2026-09-05-sp7-character-tabs-and-sessions-design.md`
(one runtime per character iframe, `web/src/tasks/router.ts` over per-session `TasksApi`).
Depends on: SP4a as built (`web/src/agent/*`, `web/src/tasks/*`, `web/src/plugins/builtin/tasks*`,
`web/src/frame/runBanner.ts`), SP7 sessions (`web/src/sessions/manager.ts`), SP2 plugin settings
(`web/src/plugins/settings.ts`, `web/src/plugins/firestoreBackend.ts`).

## 1. Goal and scope

SP4b makes the bot system able to work away from the tile it is standing on: find its own
resources, walk across the map to them, notice when it has come off the rails and put itself back,
show the player what it did, be turned on and off per script, and prove all of it against the live
engine.

In scope:

1. **Task-scoped abort** (the first task, owed from the SP4a final review). Today a pause or a task
   timeout aborts a controller the `ScriptContext` closures never see: `createWorkerContext` binds
   every `wait.*` and the SDK to the run-level signal (`web/src/agent/workerContext.ts`, `d.signal`),
   while `web/src/tasks/runner.ts` hands the task's signal out only as `{ ...d.ctx, signal }`. A
   parked `wait.until` therefore runs to its own timeout and an in-flight SDK action keeps going.
2. **Resource discovery** beyond the current scene: wider scans, a static atlas, atlas fallback.
3. **Map knowledge and pathing**: a real collision grid, `findLongPath` over it, landmark and route
   waypoints, door and gate handling.
4. **State detection and reset**: a per-run health monitor with typed conditions and recovery
   tasks, integrated with the runner's attempts and stuck logic.
5. **Run UI and history**: live run detail in the Tasks panel and the banner, a per-run report for
   past runs, retention and export.
6. **Per-script toggles**: enable and disable each script, persisted per user, enforced in the api.
7. **Testing**: unit, worker-level with a fake transport, and real-stack Playwright per library
   script plus a Tutorial Island completion run.
8. **The Tutorial Island script** itself, plus the two smaller SP4a carry-overs (per-session
   settings caches, panel refresh).

Out of scope: SP4c (the `/tab` socket, `/mcp` gateway, `runs.db` mirror, Claude tab additions),
SP5 (headless play, scene-projection plugins), SP9 (contracts), any change to the engine or the
client renderer beyond publishing `cancelAll` on `ClientHooks`.

## 2. Current capabilities, as built

**Everything in this section describes the state SP4b started from, in 2026-09-06's present
tense, and is kept as the record of what was there before.** It is no longer true of the code:
the pathfinder is real, cancel reaches the client, and per-script toggles exist. Section 3 says
what replaced each of them and section 9 says what shipped.

### 2.1 How a script sees the world

`ClientHooks.getWorldState()` (`client/src/hooks/world.ts`) returns one snapshot per client cycle,
stamped with the server tick: the vendored collector's `BotWorldState`
(`web/src/vendor/rs-sdk/sdk/types.ts:551`) spread with our `WorldExtras`
(`client/src/hooks/worldExtras.ts`). That is `player` (worldX/worldZ/level, hp, animId, runEnergy,
`isDead`, `lifeId`, `respawnCount`, `lastDeathTick`), `skills`, `inventory`, `equipment`,
`nearbyNpcs`, `nearbyPlayers`, `nearbyLocs`, `groundItems`, `gameMessages`, `recentDialogs`,
`dialog`, `interface`, `shop`, `bank`, `trade?`, `modalOpen`, `modalInterface`, `combatStyle`,
`combatEvents`, `prayers`, plus our `hint`, `tutorial { open, title, lines }`, `flashingTab`,
`interfaceTexts`, `regionId` and `zone`. There is **no camera field anywhere in the state**:
nothing in `client/src/vendor/rs-sdk/bot/StateCollector.ts` reads the camera, and `WorldExtras`
does not add one.

### 2.2 What "camera" means here, and what actually limits discovery

Panning the camera changes **nothing** the bot can see. The client renders a 3D scene from a
camera; the bot reads the scene graph and the entity arrays directly, which do not care where the
camera points. The owner's phrase describes the human experience of the tutorial ("use your
keyboard's arrow keys to rotate the view",
`engine/content/scripts/tutorial/scripts/tut_chatbox_steps.rs2`); the translation into this
codebase is "widen and move the bot's search", not "drive the camera". What does limit discovery:

| Limit | Where | Value |
|---|---|---|
| Collector scan radius for locs and ground items | `StateCollector.ts:1073`, `:1260` | 15 tiles, Chebyshev, from the player |
| The built scene | `client/src/client/Client.ts:9219` (`mapBuildBaseX = (centreZoneX - 6) * 8`) | 104 x 104 tiles, 13 x 13 zones, centred on the player, rebuilt on zone change |
| NPC visibility | server-driven `npcs` array read at `StateCollector.ts:900` | only NPCs the server sends for the player's build area |
| Walk destinations | `Client.walkTo` clamps to scene bounds 1..102 (`Client.ts:2106`) | one leg can never leave the current scene |

So there are two dials that are free today: raise the loc/ground scan radius (the collector already
takes one, and `BotSDK.scanNearbyLocs(radius)` already plumbs it), and move the player so a
different scene is built. Everything past the scene needs static data.

### 2.3 How actions execute

`ClientHooks.dispatch(action)` puts a `BotAction` through `BotActionQueue` and the vendored
`ActionExecutor`, which calls the client's own input methods (`Client.walkTo` uses `tryMove`, the
same routefinder a mouse click uses), so packets match human input. `web/src/agent/localTransport.ts`
wraps that as `Transport`; inside the Worker, `bot`/`sdk` calls cross `postMessage` while state
reads are local (`web/src/agent/worker.ts`).

`createWorldHooks` already exposes `cancelAll()` (`client/src/hooks/world.ts:70`, generation bump on
the queue), but `ClientHooks` in `web/src/clientTypes.ts` does not list it and nothing publishes it.
No cancel path reaches the client today. `Transport.dispatch`'s doc comment says so explicitly.

### 2.4 How pathing works today

`BotActions.walkTo` (`web/src/vendor/rs-sdk/sdk/actions.ts:1008`) is a real routine: up to 50
iterations, progress measured as closing distance, partial-path dead-end detection, proactive door
opening, death-en-route abort. It asks `BotSDK.findPath` (`web/src/vendor/rs-sdk/sdk/index.ts:1054`),
which delegates to `web/src/vendor/rs-sdk/sdk/pathfinding.ts` - **ours, a stub**. Every predicate
answers permissively (`isTileWalkable` true, `isZoneAllocated` true, `findDoorsAlongPath` empty) and
`findLongPath` returns straight-line waypoints every 20 tiles. Each leg is then handed to
`Client.walkTo`, which does route properly inside the scene. Net effect: correct local walking,
dead reckoning between scenes, no route around water, cliffs or buildings, no door knowledge.

`web/src/vendor/rs-sdk/sdk/chunking.ts` is chat chunking, not map chunking; it is not part of
pathing.

### 2.5 What failure handling exists

`web/src/tasks/runner.ts`: per-task `timeoutMs` (default 30 s), `maxAttempts` (default 3, counted
as consecutive failures), `stuckAfterMs` (default 45 s) when no `when` matches, `hardStop.hpBelow`
which ends the run `failed`, and pause/resume with `paused_by_player`.
`web/src/tasks/humanInput.ts` pauses on a real canvas click and auto-resumes after
`resumeAfterHumanInputMs`; `wire.ts` stops a run on the `logout` hook. That is all of it: no death
handling, no interface recovery, no re-login, no inventory-full or out-of-supplies detection, and
no notion of progress other than "a task matched".

### 2.6 What run UI and history exist

`web/src/frame/runBanner.ts`: script, task, status line, mm:ss, Pause/Resume/Stop, tone by state,
strip dot, toasts, Escape to pause. `web/src/plugins/builtin/tasks.ts` plus `tasksViews.ts`: run
card, My scripts rows, snippet box, History list of the last 20 runs, and `traceView.ts` for one
run's trace with a Copy button. `web/src/tasks/history.ts`: IndexedDB `idlescape-runs`, 50 runs
with full traces, trimmed by `startedAt`. `RunSummary` carries `xpGained` but no item deltas, no
distance, no health-check record, and there is no export or per-run report view.

### 2.7 What toggles exist

Plugin-level only: `web/src/plugins/settings.ts` persists `{ enabled, settings }` per plugin id to
`users/{uid}/plugins/{pluginId}` (`firebase/firestore.rules:22`) with a localStorage mirror and an
800 ms debounce. There is no per-script enable anywhere: neither `TaskSummary` nor
`users/{uid}/tasks/{taskId}` (`web/src/tasks/userStore.ts`) carries one, and `TasksApi.run` checks
requirements and params only.

## 3. Design

### 3.1 Task-scoped abort (first task, no new features)

Change `createWorkerContext` to take `signal: () => AbortSignal` instead of a fixed signal, and have
the runner set the current task signal before each `run`. Every `wait.*` then registers its abort
listener against the signal that is live at call time, and `ScriptContext.signal` reads the same
accessor, so `c.signal.aborted` inside a script means "this task was aborted".

Cancelling an in-flight action needs three pieces: publish `cancelAll()` on `ClientHooks`
(`web/src/clientTypes.ts` and the client's `hooks/types.ts` mirror; the implementation already
exists at `client/src/hooks/world.ts:70`); add `cancel(): void` to `Transport`, implemented in
`localTransport.ts` as `hooks.cancelAll()` plus resolving every outstanding dispatch with
`{ success: false, reason: 'cancelled' }`; and add a **Worker-to-main** `{ t: 'cancel' }` message,
which `workerHost` answers by calling `transport.cancel()`. It is a message rather than an RPC
call because the `rpc.rejectAll` one line further down the same abort path would reject the call
itself, producing a spurious unhandled rejection on every task abort. There is no main-to-worker
cancel, because `pause` and `stop` already reach the Worker and now run the same path, and a
second entry point would be a redundant second owner of one rule.

`ActionQueue.beginGeneration` keeps the currently executing action as a quiescence barrier, so
cancel means "nothing new starts and the caller stops waiting", not "the client forgets what it is
doing". Scripts must re-read state after a cancel rather than assume the world is untouched.

Acceptance: a task with `timeoutMs: 1000` parked on `wait.until(() => false, { timeoutMs: 60000 })`
exits at ~1 s with `task_exit { outcome: 'timeout' }`; a pause during `bot.walkTo` leaves no queued
actions within one tick.

### 3.2 Resource discovery

Three layers, tried in order, behind one interface.

**Layer 1, the scene.** `c.find.nearest(kind, { radius })` scans the current snapshot's
`nearbyLocs` / `nearbyNpcs` / `groundItems`, and for a radius over 15 calls the SDK's on-demand
`scanNearbyLocs(radius)` (which re-fills the reach probe). Radius is capped at 52, the scene half
width; past that the tiles are not built. Default 15, so existing behaviour is unchanged.

**Layer 2, walk and scan.** `c.find.sweep(kind, { maxTiles, pattern })` walks an expanding ring of
scan points around an anchor (default: the player's position at sweep start), scanning at each stop
and returning the first match. `pattern: 'ring'` (default) walks 8 points at 20, 40 and 60 tiles;
`pattern: 'zones'` walks the centres of the 8 neighbouring zone groups. Each leg is a `travel.to`
(section 3.3), so a sweep respects collision. It is bounded by `maxTiles` (default 200) and by the
task timeout, and pushes `status` lines so the banner shows "looking for oak trees, 2 of 8".

**Layer 3, the atlas.** A static, build-time index of where things are on the whole map.

Generator, in two halves. Every pure parser and transform lives in `web/src/data/gen/*.ts`, where
`npm run typecheck`, `npm run lint` and vitest already cover it; `scripts/gen/atlas.ts` (Bun, run
by `scripts/build.ps1`, output committed) keeps only file IO, argument handling and the budget
check, and imports the pure half by relative path. Three of those modules are shared with the shell
on purpose - `kinds.ts` (the taxonomy `c.find` matches against), `collisionFile.ts` (whose decoder
the Worker uses) and `tutorialRoutes.ts` (section 4's two ladder routes) - and the generator-only
four (`jm2.ts`, `configs.ts`, `clusters.ts`, `collisionBuild.ts`) are imported by nothing under
`web/src`, so Vite never emits them. `scripts/gen/` carries its own `tsconfig.json` and a
build-time typecheck, because Bun strips types without checking them and `web/tsconfig.json` covers
only `web/src`. The generator input sha is recorded inside the file, as `source.contentSha`.

Inputs, all verified present in the pinned engine clone:

| Input | What it gives |
|---|---|
| `engine/content/pack/loc.pack` (4 671 lines, `id=debugname`) | loc id to debug name |
| `engine/content/pack/npc.pack` | npc id to debug name. Fishing spots are identified by **config**, not by the shape of an id: only 35 ids match `<level>_<mx>_<mz>_*fish` and four of those are contest spots. The rule is an npc config whose `name=Fishing spot`, or whose `op1..op5` carries one of `Net`, `Bait`, `Lure`, `Cage`, `Harpoon`, `Fish`, resolved to ids through `npc.pack` |
| `engine/content/scripts/**/*.loc` | `name=`, `category=` (`tree`, `mining_rock_normal`, `smithing_furnace`, `cooking_fire`, `prayer_altar`, ...), `op1..op5`, `width`, `length`, `blockwalk` |
| `engine/content/scripts/**/*.npc` | `name=`, `op1=` (`Fish`, `Bank`, ...) for spot and service NPCs |
| `engine/content/maps/*.jm2` (**483** `.jm2` files; `engine/content/maps` holds 487 entries, and 487 was a directory count) `==== LOC ====` section, `level localX localZ: locId shape angle` | 1 530 117 loc placements, of which **16 182** match the indexed kinds once the bank rule below and the fishing rule above are applied. The first estimate of 32 186 counted a `name.startsWith('bank ')` match that was mostly notice boards |
| the same files' `==== NPC ====` section | spawn tiles for the npc ids the config rule resolved |

**The bank rule is an exact-name set plus a `Bank`-op arm**, not `name.startsWith('bank ')`. That
prefix matched 218 placements, of which 147 were notice boards and tables, and it put 68 unwalkable
targets in the landmark table.

Output: `web/src/data/atlas.json`, shaped as the `Atlas` type in section 5 (`kinds`, `clusters`,
`landmarks`, `routes`, plus a `source.contentSha` stamp). It is delivered as a Vite `?url` asset,
which emits a content-hashed file under `assets/` and hands the loader its URL, so the shell's
first paint is untouched. `web/public/` is not an option: the front server routes only `/assets/*`
out of `web/dist`, so a file at the dist root would 404 in production. The stamp is the content sha
alone. A `generatedAt` timestamp was removed, because a drift gate that fails on the calendar
rather than on the content fails `scripts/build.ps1`, and therefore `verify.ps1`, every time UTC
rolls over, and stays failed.

Clusters, not tiles: adjacent placements of the same kind and variant collapse into one entry with
a centre, a count `n` and a radius `r`. The collapse radius is **per kind** - tree 32, rock 16,
fire 16 and 6 for everything else - not the single 6-tile radius first written here, which produced
an 825 KB file against a 250 KB budget. The named fallback (per-region cluster files fetched on
demand) was rejected because it changes the loader contract four later tasks are written against.
A radius is not a bound on the settled `r`: a placement joins on its distance to the running
centre, and the centre then moves, so the widest tree cluster settles at `r` 46 against a radius of
32. That is exactly why `c.find`'s atlas layer re-scans on arrival using the cluster's own `r`
instead of trusting the centre tile. **Size budget: `atlas.json` at most 250 KB raw and 80 KB
gzipped; the generator fails the build if it exceeds either.** As built: 16 182 placements into
1 520 clusters and 44 landmarks, 179 612 bytes raw and 25 646 gzipped. Trees, rocks, fishing spots,
banks, furnaces, anvils, ranges, altars and cooking fires are indexed; everything else is out of
the first version.

Lookup: `c.find.nearestAtlas(kind, opts)` returns the nearest cluster by straight-line distance
from the player, optionally filtered by `variant` and `maxDistance`. `c.find.nearest` falls through
scene, then atlas plus `travel.to(cluster)`, then sweep, and reports which layer answered so the
trace records it. A content bump regenerates the atlas, and a unit test asserts a known set of
clusters (Lumbridge trees, Varrock east mine, Draynor willows, Tutorial Island's tree and fishing
spot) is present with plausible coordinates.

### 3.3 Map knowledge and pathing

**Collision.** `scripts/gen/collision.ts` (the generator SP4 section 4.3 reserved and SP4a
deferred) reads the same `*.jm2` files. The `==== MAP ====` section carries per-tile `f<flags>`
tokens (`f1` blocked, `f2` bridge; observed values 1, 2, 4, 8, 16, 20, 24) and the `==== LOC ====`
section plus each loc's `blockwalk` (default yes; only 296 configs declare `blockwalk=no`), `width`,
`length` and `shape` give the rest.

**The file is a per-tile walkability bitset, and walls are not in it.** The engine builds collision
from three sources: the land flag bit `0x1` blocks a tile, bit `0x2` on level 1 means the tile
belongs to the level below, and a `blockwalk` loc blocks according to its shape's layer - a `WALL`
shape (0 to 3) blocks tile **edges** by angle, a `GROUND` shape (9 to 16) blocks its
`width x length` footprint (swapped for angles 0 and 2), and `GROUND_DECOR` (22) blocks the tile
only when the placement is active. One bit per tile cannot express an edge, and the 1 MB budget is
sized for exactly one bit per tile per level. So the bitset carries land blocking and
GROUND / GROUND_DECOR footprints; wall shapes are excluded from it and appear only in the door
table when they are openable. A global path may therefore cut across a building wall, which is
bounded: every leg is handed to `Client.walkTo`, which routes with the client's own scene collision
(walls included), and `travel.to` re-plans once and then fails `unreachable` rather than looping.
Revisit by adding a second, sparse edge-flag table if a live run shows paths entering buildings
through walls.

`GROUND_DECOR` "active" means **a model name that resolves verbatim in `model.pack`, or any op**.
The first rule written here would have marked 259 676 of 311 905 ground-decor placements as
blocking instead of 1 259, walling off puddles and floors map-wide.

Output `web/src/data/collision.bin`: one bit per tile per level over the populated map squares, with
a square index header so empty squares cost nothing. **The index carries two masks per square, not
one:** "present" is the set of levels the square has at all, which is what `isZoneAllocated`
answers and what the engine allocates; "payload" is the subset that actually holds a blocked tile,
so an all-zero level is allocated but not stored. The separation is needed in production and not
only by a test - `BotSDK.findPath` refuses when the **source** zone is unallocated, and 34 real
squares have an entirely walkable level 0 that would otherwise strand a player standing on one.
`.gitattributes` marks `*.bin binary`: `collision.bin`'s first NUL is at offset 5 and it holds 368
`0x0A` bytes, so only git's NUL heuristic was keeping CRLF mangling away from it.

Budget: at most 1 MB raw, 400 KB gzipped, fetched lazily on the first `travel.to` as a Vite `?url`
asset and cached in the Worker. As built: 483 squares, 521 108 bytes raw and 144 311 gzipped, plus
`doors.json` at 2 653 doors, 132 731 bytes raw and 10 949 gzipped.

**Pathfinder.** Replace the stub bodies in `web/src/vendor/rs-sdk/sdk/pathfinding.ts` with a real
implementation over `collision.bin`: BFS over **the query's bounding box padded by 128 tiles and
capped at 1 024 x 1 024**, not a fixed 2 048 x 2 048 window, with `isTileWalkable` and
`isZoneAllocated` reading the bitset and `getDoorAt` and `findDoorsAlongPath` reading a door table
the generator emits alongside (loc placements whose config has an `Open` op).
`TemporaryDoorBlocklist.active()` then returns real doors, so `walkTo`'s existing
avoid-and-reroute logic (`actions.ts:1129` onward) comes alive with no edit to `actions.ts`. The
upstream signatures already match, which is why this is a body swap.

Two consequences of that window are worth knowing. A query whose `|dx|` or `|dz|` reaches **896**
(the cap minus the padding) returns `[]` rather than a partial path, which is harmless only
because `travel.to` splits its legs at 52 tiles. And **the BFS refuses to leave loaded squares**,
even though `isTileWalkable` calls a tile in an unloaded square walkable: the two answer different
questions, and not leaving the loaded map is the engine's own rule, since `CollisionEngine.get`
returns every block bit for an unallocated zone.

**Travel.** `c.travel.to(target, opts)` is the long-distance layer over `bot.walkTo`. It resolves
the target (coordinates, an atlas landmark id, or a cluster); walks a `routes` entry's waypoints if
one connects the player's landmark region to the target's, otherwise plans straight; splits the
plan into legs of **at most `MAX_LEG_TILES` = 52 tiles**, so each leg sits inside one scene and the
client routefinder does the fine work; and re-plans once, then fails
`{ reason: 'unreachable', stoppedAt }`, if two consecutive legs do not close distance. 52 rather
than 60: 52 is the built scene's half width, and a 60-tile target lands outside the scene that
`Client.walkTo` clamps to, so "at most 60" is satisfied literally by the tighter number.

Route selection honours **`from` and `level` as well as `to`**, with `ROUTE_START_TILES` (also 52)
as the bound on how far from a route's start the player may stand; a route whose start is further
than one scene from where scripts stand is silently ignored in favour of a straight plan. Arrival
**checks the level**, and measures against the route's **last walk waypoint** when a route was
followed: without the first, a route interact that clicks but does not transition would report
success on the wrong plane, and without the second every route would be obliged to end exactly on
its landmark tile.

Doors and gates ride `walkTo`'s own handling. Ladders, stairs and boats are **not** modelled in
version 1: a route may carry an `interact` waypoint
(`{ kind: 'interact', locName, op, x, z, toLevel? }`) which `travel` performs before continuing,
and that is how Tutorial Island's ladders and gates are covered. Any other level change is refused
with `reason: 'needs_route'` rather than attempted, because `findPath` already reports cross-plane
destinations as unreachable (`index.ts:1100`) and guessing is worse than saying so. Both routes the
atlas actually ships are Tutorial Island's ladders, and neither is a plane change: the content
moves the player 6 400 tiles in z at level 0 rather than onto level 1, so `toLevel` stays unset and
the route's own arrival tile is what proves the transition happened.

### 3.4 State detection and reset

A **health monitor** runs in the Worker beside the runner, evaluated on every state message,
independent of which task is selected. It is a list of typed checks; each produces a `HealthEvent`
and, if the script has not handled it, a recovery.

| Condition | Detection | Default recovery |
|---|---|---|
| `no-progress` | no `xp`, no inventory delta and no position change for `noProgressMs` (default 90 s) while `running` | `status`, one re-scan, then re-path to the run anchor; second occurrence pauses `stuck` |
| `unexpected-interface` | `state.modalOpen` and `modalInterface` not in the script's `expectInterfaces` | `sdk.sendClickComponent` on the close button, else Escape key action, then re-check |
| `dialog-stuck` | `dialog.isOpen` with no options for more than 15 s | `tutorial.clickThrough(5)` |
| `level-up` | `interfaceTexts` matches the level-up component | click through, do not count as a failure |
| `death` | `player.isDead`, or `lifeId` changed since the last tick | per the resolved `onDeath` behaviour (below) |
| `logout` / `disconnect` | the `logout` or `disconnect` hook event | re-login through the SP7 armed login (`SessionManager.login(characterId)` behind a new `Transport.relogin()`), up to `maxRelogins` (default 2), then fail `disconnected` |
| `inventory-full` | 28 slots and no matching drop or bank task in the script | pause `stuck` with reason `inventory_full` unless the script declares a handler. The `re-anchor` rung is skipped: a full bag is the one condition where walking home demonstrably is not the answer |
| `out-of-supplies` | a declared `consumes` item **reaching** zero, read off the loss the snapshot shows, not off the item being absent | fail the run with `reason: 'out_of_supplies'`. There is no recovery task; the monitor escalates a condition with no task straight to its typed failure |
| `low-hp` | existing `hardStop.hpBelow` | unchanged, ends the run `failed` with `low_hp`, which is its own `FailReason` rather than `stuck` |

**The `logout` stop that used to live in `wire.ts` was removed.** A dropped connection reaches
`Client.logout()` on two of `lostCon()`'s three exits and a server kick emits `logout` too, so
stopping the run on that hook killed it at exactly the moment the re-login recovery was wanted. The
three cases it covered are each covered better: `api.dispose()` for a shell-initiated close, the
human-input pause for a player clicking logout on the canvas, and this ladder for everything else.

Integration with the runner: the monitor never runs a task itself. It sets a **pending recovery**
which the runner drains before evaluating `script.tasks`, as a synthetic task named
`recover:<condition>` that is traced like any other (`task_enter` / `task_exit`) and counts against
its own `maxAttempts` (default 2), not the script's. A script may claim any condition by declaring
a task whose `when` tests `c.health.is('unexpected-interface')`, which is how Tutorial Island owns
the character-design chatbox.

Escalation is a ladder, each rung traced: recover, re-anchor (walk back to the run anchor, the
position where the run started or the last `c.anchor(x, z)` call), restart the current task, pause
`stuck` with a snapshot, fail with a typed `FailReason` from a closed set so history and later
Claude can group failures. The monitor is where the task-scoped abort earns its keep: a recovery
that needs the game now aborts the in-flight task rather than waiting out its timeout.

**The ladder counts occurrences as well as attempts.** Two conditions carry a per-condition
occurrence budget - `death` escalates to terminal on the second, `no-progress` to `pause-stuck` on
the second and to terminal on the third - and they have to, because a successful recovery clears
the attempt count. Keyed on attempts alone, a wedged run re-scanned and walked home every 90
seconds forever without ever pausing or failing, since walking to the anchor while standing on it
always succeeds.

**Behaviour on death is the player's setting, not one policy.** `onDeath` is a seven-value union
(`DeathBehaviour`), not the three this document first named: `loot` (the default), `return`,
`resume`, `pause`, `logout`, `loot-and-logout` and `fail`. `loot`, `return` and `resume` recover and
carry on and so fall through to the ordinary ladder; the other four are endings the ladder owns
rather than the recovery, because only the ladder can stop a run. `fail` jumps straight to terminal
on the first death - skipping the re-anchor rung is not enough, because the next rung returns
`pause-stuck`, which pauses rather than ends. A second matching setting, `onStuck`
(`pause` | `logout` | `stop`), decides where every `pause-stuck` rung goes, and `maxRelogins` bounds
the `logout` recovery. All three are read **once, at run start**, and travel on the `run` message;
a script's own `health.*` declaration beats the player's setting, which beats the built-in default,
field by field, and every value from storage is validated on the way in. A `restart` is a run start
for this purpose - it mints a new `runId` and re-seeds status - so `WorkerHost.restart(behaviour)`
takes the current settings and the argument is required.

**The default `loot` behaviour walks back for what the death dropped.** The engine keeps the three
priciest items (four with Protect Item, none if skulled) and drops the rest at the death tile,
where the pile lives for `^lootdrop_duration` = 200 ticks = 120 seconds covering respawn, travel
and pickup together. Losing that race is not a failed run: every giving-up path settles as
recovered. Two details the implementation turns on. The death tile is captured **immediately after**
the once-per-occurrence guard, because the death is visible for several ticks and a capture before
the guard lets the respawn snapshot win with Lumbridge. And the recovery task's budget is
`RESPAWN_MS + LOOT_WINDOW_MS + ANCHOR_WALK_MS` (300 s), because the loot window is absolute from
the moment of death: bounding the anchor walk by what remained left it about 60 s of `travel`'s
120 s default, the runner aborted the task, and the recovery settled **failed** - the one route by
which a loot detour could turn a survivable death into a failed run.

### 3.5 Run UI and history

**Run banner** (`web/src/frame/runBanner.ts`) gains one collapsible detail line under the existing
strip, on by default, and a health pip that turns amber while a recovery runs and carries the
condition as its tooltip. The line as built is
`<target> (<n> tiles) · recovering: <condition> · <x, z> · <rate> <skill> xp/h`, each part omitted
when it has nothing to say. There is no `<items>` part: item deltas are `RunSummary` data that only
the end of a run has, and the tile count comes from the api's own state rather than from
`RunStatus`, which carries no position.

**Tasks panel current-run card** gains XP per hour per skill, the last five health checks with
outcomes, and the current target as "Working on Oak, 12 tiles away (in view)", where the
parenthesis names which of `c.find`'s three layers answered. Three things this document first asked
of the card are deliberately not there: **ETA**, because `RunStatus` carries no target level and a
finish time guessed from a rate with nothing to aim at is a made-up number; and **items gained and
lost** and **tiles travelled**, because both are `RunSummary` fields the run report shows when the
run ends rather than live status. All of the live half is already in the trace, so the card reads
the live status the Worker posts rather than needing new plumbing.

**Past runs.** History rows keep their shape and gain outcome reason and XP/h. Opening a row now
shows a **run report** before the raw trace: a timeline of tasks entered with durations as a
stacked bar, outcome and `FailReason`, totals (duration, XP by skill, items, tiles, recoveries by
condition), and a "Show trace" toggle for `traceView.ts` as it is today. Two buttons: "Copy for
Claude", which copies the **report** (the trace view keeps its own copy button for the raw rows),
and **Export**, which downloads
`idlescape-run-<sanitised scriptId>-<runId>.json` (`{ summary, events }`). The file name is not the
bare `run-<runId>.json` first written here: a downloads folder is shared with everything else the
browser saves, and a bare run id says nothing about which script it came from.

**Storage.** `web/src/tasks/history.ts` keeps IndexedDB and changes its cap policy: summaries for
200 runs, full traces for the newest 50 (decision 6). Traces are already capped at 5 000 events by
`web/src/tasks/trace.ts`. A `runs` record gains `failReason`, `itemsDelta`, `tilesTravelled`,
`recoveries` and `characterName` (so the list reads correctly after a character switch). The schema
bump migrates by dropping event records past the trace cap, never by dropping summaries.

### 3.6 Per-script toggles

A script gains `enabled: boolean`, defaulting to true, stored per user next to the plugin settings
so it survives a device change: `users/{uid}/scriptToggles/{scriptId}` holding
`{ enabled: bool, updatedAt }`, mirrored to `localStorage` under `cs.script.<id>` by the same
debounced store shape as `web/src/plugins/settings.ts`, with a Firestore rule mirroring the
`plugins` rule (owner-only, `enabled is bool`). Scoping is **per account, not per character**
(decision 7): a script the player switched off should not come back because they opened another tab.

Enforcement lives in the api, not in the panels: a disabled id raises `TasksError('disabled', ...)`
from one named guard, `refuseIfDisabled(id)`, called by `run()` and by `restart()` before either of
restart's two branches and before anything is stopped. That single check covers the Run button, the
Marketplace's Run now, `window.idlescape.tasks.run` from Playwright, the SP4c tab relay when it
arrives, and any future scheduler, because all of them go through this api. It is checked **before**
requirements, so a script that is both switched off and unequipped reports being switched off.
`TaskSummary` gains `enabled` (required, not optional) so the Tasks row
can render a toggle and the Marketplace card can grey out with "Turned off" and a link to the Tasks
tab. A run already in flight when its script is disabled is left alone: the toggle governs starting.

### 3.7 Testing

Three tiers, all required before SP4b is done.

**Unit (Vitest, no browser).** Atlas generator parsers against fixture `.jm2`, `.loc` and `.pack`
snippets; cluster collapsing; the collision bitset reader against a hand-built square;
`findLongPath` around a known wall; `travel.to` leg splitting with a fake `walkTo`; every health
check as a pure predicate over fixture snapshots; the recovery ladder's escalation order; toggle
store persistence; `history` migration and retention.

**Worker-level (Vitest, fake transport).** The existing `web/src/agent/worker.test.ts` shape: feed
scripted state sequences and assert task selection, abort behaviour (a task timeout interrupts
`wait.until` within 50 ms of the deadline), recovery injection, and the trace an unreachable target
produces. Every library script gets a scripted-sequence test, as SP4a's already have
(`web/src/tasks/library/library.test.ts`).

**Real stack (Playwright, local emulators plus engine 274 plus front server).** New file
`web/e2e/scripts.pw.test.ts`, one test per library script, driven through
`window.idlescape.tasks.run(id, params, { startedBy: 'test' })` on a seeded guest character:

| Script | Seed | Budget | Must reach |
|---|---|---|---|
| `chop-and-drop` | Lumbridge, bronze axe, 25 logs already in the bag | 600 ticks | Woodcutting XP up, a real drop cycle (28 slots, then an empty bag, then a count of the trace's negative item deltas), no `stuck` |
| `net-fish-and-drop` | Lumbridge river, small net, **17** tiles from the shoal | 600 ticks | Fishing XP up, and the atlas layer is what answered. 17 rather than 30: what the test needs is a seed outside the 15-tile scene default, and a shorter walk is a faster test |
| `mine-and-drop` | Varrock east mine, bronze pickaxe | 600 ticks | Mining XP up, plus the layer that answered and the tiles travelled. Not "two different rocks": every mining rock in the content shares one display name, so the assertion could not have meant what it said |
| `tutorial-island` | fresh guest | 25 minutes of game time | off the island, section 4 assertions. **Committed `test.fixme`**; see section 9.6 |

Every seed starts by taking the character **off Tutorial Island**, with `::setvar tutorial 1000`
and the `[debugproc,death]` cheat, before it gives anything: a character still on the island has no
inventory to seed into and no map to walk on.

A **testing harness**, `web/e2e/harness.ts`, sits on the existing `web/e2e/helpers.ts`
(`loginAsGuest`, `openCharacterTab`, `openPanel` are already there) and adds
`seedCharacter({ name, at, inventory, equipment, skills })`, so a test does not play its way to a
pickaxe, plus `runUntil(api, predicate, ticks)` which polls `getRun()` and fails with the last
trace slice attached.

**Seeding goes through the engine's `::` cheat commands, not through dev routes: there are none.**
The only management routes the engine registers are the owner-bank pair. What does exist is
`ClientCheatHandler`, which gives `::give <item> [n]`, `::setstat <skill> <level>`,
`::tele <level,mx,mz,lx,lz>` and the `[debugproc,...]` scripts to a player with
`staffModLevel >= 4` on a non-production node, and the vendored client already routes a
`::`-prefixed message to `ClientProt.CLIENT_CHEAT` rather than to public chat. So the harness seeds
through `tasks.dispatch({ type: 'say', ... })`. Staff level 4 comes from `IDLESCAPE_DEV_STAFF`,
which `scripts/start-stack.ps1` used to set only when `-Prod` was absent, so the script gained a
`-DevStaff` switch that sets it regardless and `scripts/verify.ps1` starts the stack with
`-Prod -DevStaff`. None of this reaches production: `loadIdlescapeConfig` forces `devStaffLevel` to
0 whenever `node.production` is true. The same flag is what makes a loot e2e possible at all, since
`player_death_lose_items` returns early for staff only when `map_live` is true, and `map_live` is
`node.production`.

Flaky world state is handled by budget, not by sleeping: every assertion is a tick budget with
`expect.poll`, each script test retries once at the Playwright level, and a test that fails twice
saves its trace to `docs/runs/<script>-<sha>.jsonl` and its screenshot to `docs/screenshots/`.
Ticks, not wall clock, so a slow CI machine does not move the pass criteria; Tutorial Island is the
one wall-clock-bounded test, because the tutorial itself has server-side waits.

## 4. Tutorial Island

### 4.1 What the engine tells the client

`%tutorial` is server-only, so the on-screen title is the step signal. Titles come from
`engine/content/scripts/tutorial/scripts/tut_chatbox_steps.rs2`, which carries **75**
`~tutorialstep("<title>", "<body>")` calls, one of them commented out on its own line.
`scripts/gen/tutorial-steps.ts` extracts the remaining **74** titles in order into
`web/src/tasks/library/tutorialIsland/steps.ts`, so a content bump regenerates them and a unit test
asserts the titles the script matches on still exist. The titles the stages match against live in
`tutorialIsland/titles.ts` as a named record, so a step reads its own title rather than an index
into the generated list.

**Thirteen** of the 74 are empty strings, not the three first counted here, so title matching alone
is nowhere near enough. The script uses, in order: `tutorial.title`, then `flashingTab` (the step
that wants a sidebar tab), then `hint` (npc, tile or none), then `dialog.isOpen`. `WorldExtras`
already carries all four.

Two things the live stack taught this section that no amount of reading the content would have.

**A tile hint does not always stand on the thing it points at.** Three of the island's doors carry
their `^hint_east` arrow one tile west of the door's own placement: `tutorial_step_go_to_chef`
hints `0_48_48_6_12` while `newbie_door2` sits at `m48_48` "0 7 12", the bank exit hints
`0_48_48_52_52` against "0 53 52", and the account guide's door hints `0_48_48_57_52` against
"0 58 52". Every other tile hint on the island is on its loc's own tile, which is why an exact-tile
rule got a live run as far as the chef's door and no further. `followHint` therefore takes the
arrow's own tile unconditionally, and otherwise the nearest loc with a menu option within one tile
of it, preferring one that offers `Open` and sending that option's own index. The rule lives in
`web/src/agent/hintTarget.ts` and the Tutorial Island harness's fake imports it rather than
restating it.

**`tutorial.title` lags the real `%tutorial` across several transitions.** The content advances the
variable and calls `~set_tutorial_progress` without re-rendering the chatbox, so a step that can
complete without the title moving will keep matching itself. Any such step needs a second signal in
its `when`: a flashing tab that has cleared, an item in the bag, a component that has opened.

### 4.2 Stages

The task list keeps the shape SP4's section 13.2 gave it, as
`web/src/tasks/library/tutorialIsland/` (one module per stage so no file passes 400 lines). The
stages as built, which differ from the sketch above wherever a step turned out to be one the
content never asks for separately or one a neighbouring step already covers:

1. `recovery.ts`: `decline-tutorial-skip` (first in the list, and matching the question as well as
   the answers, because a world with `map_live` false offers to skip the tutorial),
   `design-character` (interface 3559, `sendRandomizeCharacterDesign` per `randomiseAppearance`,
   then accept), `dismiss-level-up`, `continue-dialog`, `close-unexpected-modal` (declared as this
   script's `unexpected-interface` handler so the monitor does not fight it),
   `accept-expected-interface`.
2. `guide.ts`: `getting-started`, `open-flashing-tab`, `interact-scenery` (the hinted door),
   `moving-around`, `please-wait`.
3. `survival.ts`: `view-inventory`, `cut-tree`, `build-fire`, `open-skills`, `view-stats`,
   `catch-shrimp`, `cook-shrimp`, `survival-recap`.
4. `chef.ts`: `make-dough`, `bake-bread`, `open-music-tab`, `leave-the-kitchen`,
   `open-controls-tab`, `enable-run`, `run-to-the-next-guide`. `go-to-chef` and `talk-to-chef`
   collapse into the generic hint and dialog handling.
5. `quest.ts`: `talk-quest-guide`, `enter-mine`. `enter-quest-house` and `open-quest-journal` are
   hint and tab steps the generic handlers already cover.
6. `mining.ts`: `talk-mining-instructor`, `prospect-rocks`, `mine-rocks`, `smelt-bar`,
   `smith-dagger`, `leave-mine`.
7. `combat.ts`: `talk-combat-instructor`, `open-combat-tab`, `equip-dagger`, `unequip-dagger`,
   `enter-the-rat-pit`, `attack-rat-melee`, `attack-rat-ranged`, `climb-ladder-to-bank`.
   `leave-pit` is `enter-the-rat-pit` read the other way and is not a task of its own.
8. `finish.ts`: `open-bank`, `close-bank`, `talk-advisor`, `open-ignore-tab`, `talk-brother-brace`,
   `find-the-final-instructor`, `open-magic-tab`, `cast-wind-strike`, `choose-dialog-option` and
   `follow-the-arrow`, the last two being the generic exits that carry the mainland choice.

`choose-dialog-option` sends the server-assigned `DialogOption.index`, never the array position:
the two agree only when the server sent every option.

`until`: `!isTutorialRegion(s.regionId) && s.tutorial?.open !== true`
(`web/src/tasks/library/regions.ts` already has `TUTORIAL_REGION_IDS` and `isTutorialRegion`).
`stuckAfterMs` 45 s, `maxAttempts` 3, `hardStop.hpBelow` 3, `estimateMinutes` 25, per-task
`timeoutMs` 20 s to 90 s.

### 4.3 Which expansion pieces it exercises

Deliberately, all of them: task-scoped abort (a hint that moves mid-step must not wait out a 30 s
timeout), discovery (the tree and the fishing spot are found by kind, not by hardcoded tile),
pathing (the six Tutorial Island map squares, gates, and both ladders as `interact` route
waypoints - the atlas's only two routes, and neither is a plane change), health monitor
(`dialog-stuck`, `unexpected-interface`, `level-up` fire constantly on the island; `death` should
never fire and the test asserts it does not), run UI (the e2e asserts the banner detail line
renders the run's tile), toggles (a test disables the script and asserts `run` raises `disabled`).

## 5. Data model and interfaces

New and changed TypeScript, consistent with `web/src/tasks/types.ts` and `web/src/agent/types.ts`.

```ts
// web/src/tasks/types.ts (additions)

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
  // 'route' is a place that exists only so a route can name it: the top and bottom of a ladder
  // are neither a resource nor a town, and route selection resolves `from` through this table.
  id: string; kind: ResourceKind | 'town' | 'teleport' | 'route'; name: string;
  level: number; x: number; z: number;
}
export type RouteWaypoint =
  | { kind: 'walk'; x: number; z: number }
  | { kind: 'interact'; locName: string; op: string; x: number; z: number; toLevel?: number };
export interface AtlasRoute { from: string; to: string; level: number; waypoints: RouteWaypoint[] }
export interface Atlas {
  // No `generatedAt`: a timestamp in generated output fails the drift gate on the calendar.
  version: number; source: { contentSha: string };
  kinds: Record<ResourceKind, { label: string; op: string; skill?: string }>;
  clusters: AtlasCluster[]; landmarks: AtlasLandmark[]; routes: AtlasRoute[];
}

export type FoundVia = 'scene' | 'atlas' | 'sweep';
export interface FoundTarget {
  via: FoundVia; kind: ResourceKind;
  // The display name the game shows ('Oak'), except where the atlas layer walked to a cluster and
  // then saw nothing standing in it: there it is the content debug name ('oaktree'). The scene and
  // the atlas use different namespaces, so this is for a human reading the trace. Never key on it;
  // read `loc`, `npc` or `cluster`.
  name: string;
  x: number; z: number; level: number; distance: number;
  loc?: NearbyLoc; npc?: NearbyNpc;                     // present only for `via: 'scene'`
  cluster?: AtlasCluster;
}
export interface FindOpts {
  // Matched against the scene entry's display name AND against a cluster's variant (the content
  // debug name). A string is an exact, CASE-INSENSITIVE match; a RegExp is tested as written.
  variant?: string | RegExp;
  radius?: number;                                      // scene radius, capped at 52
  maxDistance?: number; reachableOnly?: boolean;        // atlas filter in tiles; reachable defaults true
}
export interface SweepOpts { maxTiles?: number; pattern?: 'ring' | 'zones'; anchor?: { x: number; z: number } }

export type TravelTarget =
  | { x: number; z: number; level?: number }
  | { landmark: string }
  | { cluster: AtlasCluster };
export interface TravelOpts { tolerance?: number; maxLegs?: number; timeoutMs?: number }
export interface TravelResult {
  success: boolean; reason?: 'unreachable' | 'needs_route' | 'aborted' | 'timeout';
  stoppedAt?: { x: number; z: number }; legs: number; tiles: number;
}

export type HealthCondition =
  | 'no-progress' | 'unexpected-interface' | 'dialog-stuck' | 'level-up'
  | 'death' | 'logout' | 'inventory-full' | 'out-of-supplies' | 'low-hp';
export type RecoveryOutcome = 'recovered' | 'escalated' | 'failed' | 'handled-by-script';
export interface HealthEvent {
  condition: HealthCondition; at: number; detail?: string; snapshot?: unknown;
}
export type FailReason =
  | 'stuck' | 'unreachable' | 'no_progress' | 'died' | 'disconnected'
  | 'out_of_supplies' | 'inventory_full' | 'requirements' | 'timeout' | 'aborted' | 'crashed'
  | 'low_hp'          // its own reason, not 'stuck': two failures a player would never confuse
  | 'logged_out';     // the player asked to be logged out; nothing went wrong

// What a run does about its own death, and where a rung that cannot carry on by itself goes.
// Both are player settings with per-script overrides; both are validated on the way out of storage.
export type DeathBehaviour =
  | 'loot' | 'return' | 'resume' | 'pause' | 'logout' | 'loot-and-logout' | 'fail';
export type StuckBehaviour = 'pause' | 'logout' | 'stop';
export interface BehaviourSettings {
  onDeath: DeathBehaviour; onStuck: StuckBehaviour; maxRelogins: number;
}
// Defaults: { onDeath: 'loot', onStuck: 'pause', maxRelogins: 2 }. Read once, at run start, and
// carried on the `run` message; a restart is a run start and takes the settings as an argument.

export interface HealthPolicy {
  noProgressMs?: number;                                // default 90_000
  onDeath?: DeathBehaviour;                             // default 'loot'
  onStuck?: StuckBehaviour;                             // default 'pause'
  maxRelogins?: number; maxRecoveryAttempts?: number;   // defaults 2 and 2 (per condition)
  expectInterfaces?: number[];                          // modal ids this script opens on purpose
  consumes?: string[];                                  // item names whose exhaustion ends the run
}

// ScriptManifest gains: health?: HealthPolicy; anchor?: { x: number; z: number };
// Script tasks may declare: recovers?: HealthCondition[];

export interface ScriptContext {
  // ... everything SP4a already declares ...
  find: {
    nearest(kind: ResourceKind, opts?: FindOpts): Promise<FoundTarget | null>;
    nearestAtlas(kind: ResourceKind, opts?: FindOpts): AtlasCluster | null;
    sweep(kind: ResourceKind, opts?: SweepOpts & FindOpts): Promise<FoundTarget | null>;
    landmark(id: string): AtlasLandmark | null;
  };
  travel: {
    to(target: TravelTarget, opts?: TravelOpts): Promise<TravelResult>;
    distanceTo(target: TravelTarget): number;           // straight line, cheap, for `when` predicates
  };
  health: {
    is(condition: HealthCondition): boolean;            // a script task claims a condition through this
    last(): HealthEvent | null;
    recovered(condition: HealthCondition): void;        // a script handler reports success
  };
  anchor(x?: number, z?: number): { x: number; z: number };   // read, or set, the run anchor
}
```

Trace and summary:

```ts
// TraceEvent gains three variants
| { kind: 'health'; condition: HealthCondition; detail?: string }
| { kind: 'recovery'; condition: HealthCondition; action: string; outcome: RecoveryOutcome }
| { kind: 'target'; via: FoundVia; kind_: ResourceKind; name: string; x: number; z: number; distance: number }

// RunSummary gains
failReason?: FailReason;
itemsDelta: Record<number, number>;
tilesTravelled: number;
recoveries: Partial<Record<HealthCondition, number>>;
characterName: string | null;

// RunStatus and WorkerStatus gain (so the banner and card render without reading the trace).
// Deliberately NOT on RunStatusLite: the runner produces that and can see neither the health
// monitor nor the trace, so the Worker fills all three in `postStatus`.
target: { via: FoundVia; kind: ResourceKind; name: string; distance: number } | null;
health: { condition: HealthCondition; since: number } | null;
xpPerHour: Record<string, number>;

// TaskSummary gains
enabled: boolean;
```

Api and transport:

```ts
// web/src/agent/types.ts
export interface Transport {
  // ... as built ...
  cancel(): void;                                       // drain the client queue, settle pending dispatches
  relogin(): Promise<{ ok: boolean; reason?: string }>; // SP7 armed login, wired in `tasks/wire.ts`
  logout(): void;                                       // for the `logout` and `loot-and-logout` endings
}
// Neither `relogin` nor `logout` is on `ScriptContext`: a recovery may end or restore the session,
// a script may not.

// web/src/agent/types.ts, the Worker protocol
// WorkerToMain gains `{ t: 'cancel' }` - the Worker aborted a task, drain the client queue on its
// behalf. There is no MainToWorker cancel; `pause` and `stop` already run the same path.

// web/src/tasks/api.ts
export type TasksErrorCode = /* ... as built ... */ | 'disabled';
export interface TasksApi {
  // ... as built ...
  setEnabled(id: string, enabled: boolean): Promise<void>;
  exportRun(runId: string): Promise<Blob>;
}
```

`TasksRouter` (`web/src/tasks/router.ts`) changes: `settings.set` fans out to **every** attached
api rather than only `current()` (SP4a carry-over 2), and `setEnabled` does the same, so a toggle
made on one character tab is live on the others without a reload.

## 6. Sequencing

Fourteen tasks as planned, seventeen as executed: **8b** (death loot recovery) and **8c** (the
player's bot-behaviour settings) were added mid-execution at the owner's request, and Task 15
reconciles this document with what shipped. Each ends green and testable. Dependencies in brackets.

| # | Task | Produces |
|---|---|---|
| 1 | **Task-scoped abort.** `signal()` accessor in `workerContext`, `Transport.cancel`, `cancelAll` on `ClientHooks`, `cancel` RPC and message. | Unit: a 1 s task timeout interrupts a 60 s `wait.until`. Worker test: pause leaves no queued action. |
| 2 | **SP4a carry-overs.** Router `settings.set` fan-out to all sessions; Tasks panel re-reads rows and history on `run_done`, on toggle change and on a 10 s poll while a run is live. | Unit tests in `router.test.ts` and `tasks.test.ts`. |
| 3 | **Atlas generator** [none]. `scripts/gen/atlas.ts`, `web/src/data/atlas.json`, loader with lazy fetch and Worker cache, size assertion in the build. | Unit: parsers, clustering, known-cluster assertions. |
| 4 | **Collision generator and real pathfinder** [3 shares the parsers]. `scripts/gen/collision.ts`, `web/src/data/collision.bin`, real bodies in `sdk/pathfinding.ts`, door table. | Unit: BFS around a wall; `walkTo` reroutes around a blocked door in a fake world. |
| 5 | **`c.travel`** [4]. Leg splitting, route waypoints, `interact` waypoints, typed failures. | Unit with a fake `walkTo`; worker test for abort mid-travel. |
| 6 | **`c.find`** [3, 5]. Scene scan with radius, atlas lookup, sweep, `FoundTarget` and the `target` trace event. | Unit per layer; worker test that the fallback order is scene, atlas, sweep. |
| 7 | **Health monitor and recovery ladder** [1]. Checks, pending-recovery queue, synthetic recovery tasks, `FailReason`, `c.health`, `HealthPolicy` on the manifest. | Unit per check; worker tests for the escalation order and for a script claiming a condition. |
| 8 | **Re-login and death recovery** [7]. `Transport.relogin` over `SessionManager.login`, `onDeath` policy, anchor return. | Worker test with a fake transport; e2e later. |
| 9 | **Per-script toggles** [2]. `scriptToggles` store, Firestore rule, `TasksApi.setEnabled`, `disabled` error, Tasks row switch, Marketplace greying. | Unit for the store and the api refusal; panel tests. |
| 10 | **Run UI, live** [6, 7]. `RunStatus` additions, banner detail line and health pip, run card detail. | Panel unit tests; visual check in the styleguide. |
| 11 | **Run history and reports** [10]. History schema bump, retention split, run report view, export. | Unit for migration and retention; panel test for the report. |
| 12 | **Library scripts upgraded** [5, 6, 7]. `chop-and-drop`, `net-fish-and-drop`, `mine-and-drop` use `find` and `travel`, declare `health`, and stop hardcoding "in range". | Scripted-sequence tests updated in `library.test.ts`. |
| 13 | **Tutorial Island script** [1..8]. `scripts/gen/tutorial-steps.ts`, the eight stage modules, manifest, requirements. | Unit: step titles exist; scripted-sequence test per stage. |
| 14 | **Real stack e2e and harness** [9..13]. `web/e2e/harness.ts`, `web/e2e/scripts.pw.test.ts`, `web/e2e/tutorial-island.pw.test.ts`, committed trace and screenshot. | Green runs on the local stack; `docs/runs/` artefacts. |
| 8b | **Death loot recovery** (owner request, after 8). Walk back to the death tile inside the 120 s pile window, then home. | Unit tests over a faked pile and a faked clock. |
| 8c | **Bot behaviour settings** (owner request, after 8b). `onDeath`, `onStuck` and `maxRelogins` as player settings with per-script overrides. | Unit tests for the merge and for the read-once contract. |
| 15 | **Reconcile the spec with what shipped.** This document, the roadmap table, the README's generated-data note. | Section 9. |

Task 1 is first because every later abort path depends on it, and task 3 is early because tasks 5,
6, 12 and 13 all consume the atlas.

## 7. Owner decisions

Each has a recommended default; approving the list as-is is a complete answer.

1. **Atlas source.** Generate from the pinned `engine/content` clone at build time (maps plus
   packs), commit the output, fail the build on drift. *Recommended: yes.* The alternative, querying
   a live engine route, ties the shell to a running server.
2. **Atlas size budget.** `atlas.json` at most 250 KB raw / 80 KB gzipped, `collision.bin` at most
   1 MB raw / 400 KB gzipped, both fetched lazily rather than bundled. *Recommended: yes.*
3. **Atlas coverage in version 1.** Trees, rocks, fishing spots, banks, furnaces, anvils, ranges,
   altars, cooking fires. *Recommended: yes*, add shops and quest NPCs in a later pass.
4. **Discovery radius.** Scene scan default 15 tiles (unchanged), maximum 52; sweep default budget
   200 tiles walked and 8 scan points. *Recommended: yes.*
5. **Recovery policy on death.** `return-and-resume`: respawn, walk back to the run anchor, resume
   the script; a second death within the same run fails it with `died`. *Recommended: yes*, with
   `fail` available per script via `health.onDeath`.
6. **History retention.** 200 run summaries, full traces for the newest 50, per-run JSON export.
   *Recommended: yes.*
7. **Toggle scope.** Per account, not per character, stored in
   `users/{uid}/scriptToggles/{scriptId}`. *Recommended: yes.*
8. **Toggle enforcement point.** In `TasksApi.run` so the player, Playwright, Claude (SP4c) and any
   future schedule are all refused identically. *Recommended: yes.*
9. **E2E tick budgets.** 600 ticks (about 6 minutes) per skilling script, 25 minutes wall clock for
   Tutorial Island, one Playwright retry, trace and screenshot saved on a second failure.
   *Recommended: yes.*
10. **E2E seeding.** A harness that seeds position, inventory and skills rather than playing to a
    pickaxe. *Approved.* **As built it goes through the engine's `::` cheat commands, not dev
    routes: there are none.** Section 3.7 has the mechanism; the switch that enables it cannot
    grant staff on a production node.
11. **Ladders, stairs and boats.** Version 1 handles them only as declared route waypoints; other
    level changes are refused with `needs_route`. *Recommended: yes.*
12. **Run banner detail line.** On by default, collapsible, no new setting. *Recommended: yes.*

## 8. Risks and open questions

**Verified in this repo** (files and lines cited above): no camera field in the bot state; the
15-tile collector scan radius and the 104 x 104 built scene; `Client.walkTo` clamping to scene
bounds; `pathfinding.ts` being a permissive stub of ours, not vendored code; `cancelAll` existing
on `WorldHooks` but not on `ClientHooks`; the run-level-only abort in `workerContext.ts`;
`router.settings.set` reaching only the active api; the Tasks panel reading rows and history at
mount, on active change and on `run_done`; no per-script enable in `TaskSummary`, `UserTaskDoc` or
`firestore.rules`; the `.jm2` format carrying `f<flags>` tiles, `LOC` placements and `NPC` spawns;
`loc.pack` and `npc.pack` as id-to-name indexes; `category=tree` and `category=mining_rock_normal`
on loc configs; 483 `.jm2` map squares (487 is a directory count), 1 530 117 loc placements of
which 16 182 match the resource kinds above once the config-driven bank and fishing rules are
applied; 75 `~tutorialstep` calls in `tut_chatbox_steps.rs2`, one commented out, leaving 74 titles
of which 13 are empty.

**Assumed, and each settled by the task that touched it.** That `f1` is the blocked-tile flag and
`f2` the bridge flag: **confirmed**, by diffing a known square against the client's own scene.
That a 6-tile cluster radius keeps the atlas under budget: **false**, it produced 825 KB against a
250 KB budget, and the fix was per-kind radii (section 3.2) rather than the named fallback of
per-region cluster files, which would have changed a loader contract four tasks were written
against. That the engine has dev routes usable for e2e seeding: **false**, there are none, and
seeding goes through the `::` cheat commands instead (section 3.7).

**Open questions.** (1) Does `travel` need agility shortcuts and members-only barriers, or is
`needs_route` acceptable for every route the library scripts use? Current answer: acceptable.
(2) Should `no-progress` also watch chat for engine refusals ("You can't reach that")? The messages
are untrusted text and matching on them is brittle. Current answer: record them as `health` detail,
do not act on them. (3) Should the atlas record what a resource yields, so `until` and `requires`
can be derived? Current answer: out of version 1. (4) Does the owner want a scheduler? The toggle
design anticipates one but nothing here builds it. Current answer: not in SP4b.

## 9. What SP4b actually built

The plan and the SP4b handoff both call this "section 12", after the section of the same name in
`2026-09-05-sp8b-web-bank-design.md` that it is modelled on; it is section 9 here because this
document has eight. It is the section the next sub-project reads.

Plan: `docs/superpowers/plans/2026-09-06-sp4b-bot-expansion.md`, seventeen tasks (1 to 15 plus 8b
and 8c). Ledger: `docs/superpowers/ledgers/2026-09-06-sp4b-bot-expansion.md`. The sections above
have been corrected in place wherever the code disagreed with the design; this section is the
single place to read what shipped, what did not, and what the live stack taught that no unit test
could.

### 9.1 The interfaces SP4c inherits

**`TasksApi`** (`web/src/tasks/api.ts`) gains two methods and one error code:

- `setEnabled(id: string, enabled: boolean): Promise<void>`. The id is resolved through the
  catalogue before anything is written, so a caller on `window.idlescape.tasks` cannot create a
  toggle document for a script that does not exist.
- `exportRun(runId: string): Promise<Blob>`, a `{ summary, events }` JSON blob. It lives in
  `web/src/tasks/runReads.ts` with `getRun` and `listRuns`; `api.ts` re-exports it.
- `TasksErrorCode` gains **`disabled`**. Enforcement is a single named guard,
  `refuseIfDisabled(id)`, called from `run()` and from `restart()` before either of restart's two
  branches and before anything is stopped. That one check covers the Run button, the Marketplace,
  `window.idlescape.tasks.run` from Playwright, the SP4c relay when it arrives and any future
  scheduler, because all of them go through this api. It is checked **before** requirements, so a
  script that is both off and unequipped reports being off.

`TasksRouter.setEnabled` has its own **async** fan-out rather than reusing Task 2's `fanOut`, which
returns `void` and cannot carry a promise. One toggle store exists per session, so a click writes
once per open character tab; that duplication is deliberate and is bounded by the store's 800 ms
debounce.

**`Transport`** (`web/src/agent/types.ts`) gains three members: `cancel()`, `relogin()` and
`logout()`. None of the three is on `ScriptContext`: a recovery may drain the queue, restore the
session or end it, a script may not. `WorkerToMain` gains `{ t: 'cancel' }` and there is no
main-to-worker counterpart.

**Trace events.** Three new `TraceEvent` variants, each with a consumer: `health`
(`{ condition, detail? }`) and `recovery` (`{ condition, action, outcome }`) feed the run card's
health notes and the report's recovery totals; `target`
(`{ via, kind_, name, x, z, distance }`) feeds the banner detail line, the run card and the e2e
assertions. `kind_` rather than `kind` because the union is already discriminated on `kind`.

**`RunStatus`** gains `target: { via, kind, name, distance } | null`,
`health: { condition, since } | null` and `xpPerHour: Record<string, number>`. All three are on
`RunStatus` and on `WorkerStatus` (as `Pick<RunStatus, ...>`, so the two cannot drift) and
deliberately **not** on `RunStatusLite`: the runner produces that and can see neither the health
monitor nor the trace, so the Worker fills them in `postStatus`. `target` keeps the last answer for
the rest of the run rather than clearing between finds, and it is cleared where the run **starts**,
not where it ends, so a new run cannot inherit the last one's.

**`FailReason`** is the closed set history and Claude group by:
`stuck | unreachable | no_progress | died | disconnected | out_of_supplies | inventory_full |
requirements | timeout | aborted | crashed | low_hp | logged_out`. `low_hp` and `logged_out` are
both additions to what section 5 first named: a run that dropped below `hardStop.hpBelow` and one
that could not make progress are two failures a player would never confuse, and a run that ended
because the player asked to be logged out did not fail at all.

**`RunSummary`** gains `failReason?`, `itemsDelta`, `tilesTravelled`, `recoveries` and
`characterName`. The last four are required with empty defaults, applied at read time, so a row
written by an older build reads back the same shape as one written today.

**`TaskSummary.enabled`** is required, not optional. The catalogue is its only producer and always
sets it.

**History** is IndexedDB schema 2: `summaryCap` 200 and `traceCap` 50 as separate options, not one
`cap`. The migration is a **read-time default**, never a rewrite, so it cannot drop a summary;
rewriting 200 rows inside an upgrade transaction is where this kind of change goes wrong.

### 9.2 What the generated data contains, and what it costs

Both files are generated from the pinned `engine/content` clone, committed, and checked for drift
by `scripts/build.ps1` (and therefore by `verify.ps1`). Both `--check` runs must be started **from
the repository root**: from anywhere else they exit 0 without checking anything, which is a false
green worth knowing about.

| File | Contents | Raw | Gzipped | Budget |
|---|---|---|---|---|
| `web/src/data/atlas.json` | 16 182 placements collapsed into 1 520 clusters, 44 landmarks, 2 routes | 179 612 B | 25 646 B | 250 KB / 80 KB |
| `web/src/data/collision.bin` | 483 map squares, one walkability bit per tile per level, present and payload masks | 521 108 B | 144 311 B | 1 MB / 400 KB |
| `web/src/data/doors.json` | 2 653 openable doors | 132 731 B | 10 949 B | 512 KB / 128 KB |
| `web/src/tasks/library/tutorialIsland/steps.ts` | 74 tutorial titles in content order, 13 of them empty | - | - | - |

Clusters by kind: 873 tree, 299 rock, 98 fire, 75 fishing-spot, 65 range, 39 altar, 31 bank,
22 furnace, 18 anvil. The atlas ships **two** routes, both Tutorial Island ladders, and they are
the only routes anywhere; every other level change is refused `needs_route`.

Two measurements the kind taxonomy rests on. **`KIND_META[kind].op` is intent, not a clickable
option, for four kinds:** over all 4 671 loc configs, fires publish an op on 0 of 10, anvils 0 of 3,
ranges 1 of 8, furnaces 5 of 9, and altars split 13 `Craft-rune` to 6 `Pray-at`. Only trees (35 of
35) and rocks (52 of 52) publish one universally, which is why those two match on the op and every
other kind matches on the content name. Running the scene matcher against the atlas classifier over
every config gives **zero false negatives for every kind**, and that is the property the post-atlas
re-scan depends on. **The scene and the atlas use different namespaces:** a cluster's `variant` is
the content debug name (`oaktree`) while the scene reports the display name (`Oak`), so the
post-atlas re-scan drops the variant filter and `FoundTarget.name` flips namespace between the two.
Do not key behaviour on it.

### 9.3 Which conditions have a default recovery, and which do not

| Condition | Recovery task | Escalation |
|---|---|---|
| `unexpected-interface` | yes: close button, then an Escape key action, then re-check | ordinary ladder |
| `dialog-stuck` | yes: `tutorial.clickThrough` | ordinary ladder |
| `level-up` | yes: click through, not counted as a failure | ordinary ladder |
| `no-progress` | yes: status, one re-scan (`scanNearbyLocs(30)`), then walk to the run anchor | occurrence budget 1, then `pause-stuck`, then terminal |
| `inventory-full` | yes, unless a script task claims it | `re-anchor` skipped; `pause-stuck` with `inventory_full` |
| `death` | yes: per the resolved `onDeath` behaviour, including the loot walk | occurrence budget 1, then terminal `died` |
| `logout` | yes: `Transport.relogin`, up to `maxRelogins` (default 2) | terminal `disconnected` |
| `out-of-supplies` | **no task** | straight to terminal `out_of_supplies` |
| `low-hp` | **no task** | the runner's own hard stop, terminal `low_hp` |

A condition with no task escalates to its typed failure; that is the default branch of
`recoveryTaskFor`, not an oversight. A script claims a condition by declaring `recovers` on a task
and testing `c.health.is(condition)` in its `when`, and reports back with `c.health.recovered`.

The `logout` **hook** no longer stops a run (section 3.4). The `logout` **condition** does still end
one, through `maxRelogins`, which is the difference the removal turns on.

### 9.4 The two deferred follow-ups, and how the final review settled them

Both were surfaced by Task 8c's review, carried through Tasks 9 to 14, and settled by the
whole-branch review as **accepted, no code change**:

1. **`onDeath: 'pause'` ends on `pause-stuck`,** so `runBanner.ts` fires an error-toned toast
   reading `Stuck on recover:death. Open Tasks to see why.` at a player who chose "Pause and wait
   for me". Nothing malfunctions and the run is resumable, but the tone and the wording are both
   wrong. The fix is a `PauseReason` of its own, which crosses `tasks/types.ts`, both
   `runner.pause` call sites, the health monitor's escalate and three renderers. That is not a
   change to land beside a door fix in one wave. **This is a known wording defect, recorded here
   rather than left to be rediscovered.**
2. **The death recovery's arm has three exits that each have to remember the logout packet.** Read
   again with the whole ladder in view it is still correct, both sides are pinned by
   `recovery.death.test.ts`, no fourth exit was added by Tasks 9 to 14, and no live run has
   exercised a death at all. Collapse it into one `finish(ok)` that consults the policy once when
   the next exit arrives, not before.

### 9.5 What the live stack showed that the design did not predict

Nothing in this sub-project ran against a real engine until Task 14. Eight things it found, in the
order they cost time.

1. **A dialog's "Click here to continue" is published as an option.** The live client puts it in
   `dialog.options`, so a "is anyone talking" test never matched, and a "does this dialog offer a
   choice" test always did. Both `clickThrough`'s frame-change wait and the `dialog-stuck` check
   now count only real choices.
2. **A tile hint can stand one tile off the thing it points at** (section 4.1). This is what stopped
   the first two live Tutorial Island runs, at the chef's door, and the rule now lives in
   `web/src/agent/hintTarget.ts`.
3. **`tutorial.title` lags the real `%tutorial`** across several transitions, so a step that can
   complete without the title moving matches itself forever. `enable-run` fires on the stale
   short-distance title for exactly this reason, and `tabStep` stops matching once its own click
   has cleared the flash.
4. **A world where `map_live` is false offers to skip the tutorial**, which no reading of the happy
   path predicted. `decline-tutorial-skip` is first in the task list and matches the question as
   well as the answers.
5. **`chop-and-drop` filled 28 slots and wedged**, because the drop task did not claim
   `inventory-full` and the monitor's own recovery paused the run instead. A script that handles a
   condition must say so.
6. **Stopping a run takes about 1.7 s to unwind an in-flight SDK action**, measured live, so
   `WorkerHost`'s stop grace default moved from 2 000 ms to 5 000 ms.
7. **The atlas layer's re-scan can beat the engine's npc spawn-in.** The engine adds a zone's static
   npcs when a player first enters it, so a `find.nearest` that walks to a cluster and re-scans
   immediately can see an empty tile. The library scripts absorb it by taking the next lap.
8. **`mine-and-drop`'s scene layer can never answer**, because the content's rock names do not
   contain the ore name. Every lap therefore re-runs the atlas layer and `travel.to`; accepted
   rather than fixed, because the walk is a no-op when the player is already standing there.

**Evidence.** `logs/verify-sp4b-task14.log` is the first end-to-end `verify.ps1` this work ever had
(25 Playwright passed, 6 skipped, 1 failed); `logs/verify-sp4b-task14-fix1.log` ends
`verify passed` with 26 passed and 6 skipped. The one failure in the first log is
`web/e2e/wiki.pw.test.ts`, which predates SP4b: it needs `wiki/build/wiki.db` and `verify.ps1` does
not build it. `logs/fixwave-e2e-subset.log` is the last live run, 14 passed, deliberately excluding
the two specs that overwrite screenshots another piece of work had uncommitted. The Tutorial Island
run's own trace is `docs/runs/tutorial-island-local.jsonl` and its screenshot is
`docs/screenshots/tutorial-island-local.png`.

### 9.6 Known gaps

- **`web/e2e/tutorial-island.pw.test.ts` is committed `test.fixme`.** The headline deliverable is
  not delivered. The best live run entered 46 tasks over 406 events and got through the player
  controls, the run toggle, the quest guide, the journal, into the mine, both prospects, both ores
  and a smelted bronze bar before wedging on `smelt-bar`. The cause is diagnosed and is item 3
  above: `tut_smelting.rs2` advances `%tutorial` past the smelt without re-rendering the tutorial
  box, so the title still reads `Smelting.` with the bar in the bag and the step matches itself.
  The fix is a second signal in that step's `when`. Each further stage costs a 22 minute live loop,
  which is why the line was drawn here.
- **The Escape panic key** (`runBanner.ts`) ignores the shell's spent-Escape convention, swallows
  the failure of the pause it requests, and is a frame-level `keydown` listener that cannot cross
  the iframe boundary into the game canvas. Carried from the project audit (C05) as a fix for the
  next round rather than left silent.
- **`enable-run`'s stale-title arm carries no positive signal** that the controls tab was opened, so
  a snapshot where the title lands before the flash lets it fire early. Bounded: the runner
  re-matches `open-controls-tab` when the flash arrives.
- **`tutorialIsland/helpers.ts`'s own `hintedLoc` stays on the exact-tile rule** and is not routed
  through `hintTarget.ts`. Its caller passes a named option like `Prospect`, so a neighbour that
  does not offer it would fail the interaction rather than fall through to the `c.find` fallback
  already there.
- **`getRun(runId, sinceSeq)` cannot re-deliver a corrected row.** The trace coalesces consecutive
  same-target `xp` and `item` deltas by mutating the previous entry, and the correction is fanned
  out as a fresh row; a `sinceSeq` reader filtering on `seq > sinceSeq` will never see it. This is
  documented on `RunReads.getRun` and on `RunRecorder.eventsSince`. **SP4c's `runs.db` mirror is
  the caller this will bite.**
- **`web/styleguide.html` is 504 lines, over the 400-line ceiling.** It was 436 lines before SP4b
  and 490 before Task 10; restructuring it is out of scope and is inherited debt, not new.
- **`npm run verify` has never been run end to end after the fix wave.** It passed at
  `59f6155` and the fix wave re-ran the unit suites and a 14-spec live subset, not the whole gate.

### 9.7 Traps for whoever touches this next

- **A fake more permissive than the real collaborator hides the branch you are testing.** Six
  instances in this sub-project, three of them found by an implementer mutating a test written in
  the same hour: a fake `peek()` that returned data unconditionally, so the `load()` branch behind
  `peek() ?? await load()` was dead; a fake reporting one tile per hop, so a walking budget never
  fired; a fixture holding the item the predicate was meant to watch it lose; a post-logout fixture
  with `worldX: 0`, a state production never produces. Prefer the real collaborator. Where a fake
  is unavoidable, share the real rule with it - the Tutorial Island harness's fake `followHint`
  imports `hintTarget.ts` rather than restating it.
- **An assertion against an imported constant cannot pin that constant.**
  `expect(leg).toBeLessThanOrEqual(MAX_LEG_TILES)` passes for every value of `MAX_LEG_TILES`.
  Assert against a literal.
- **A fixture where right and wrong give the same number proves nothing.** A region-packing test at
  (3222, 3218) passes under an x/z transposition, because both coordinates are in square 50.
- **`web/tsconfig.json` excludes `src/**/*.test.ts` and eslint is not type-aware**, so nothing
  mechanical catches a test fake missing a member of an interface you just widened. Widening
  `Transport`, `RunStatus` and `RunSummary` each turned up typed-but-unchecked literals this way.
  Find them by hand: grep for `as unknown as`, `: Transport =` and `as Transport`.
- **`fileURLToPath(new URL('...', import.meta.url))` throws under vitest**, because Vite rewrites
  that exact pattern into an asset URL. Use `join(dirname(fileURLToPath(import.meta.url)), ...)`.
- **A timestamp in generated output makes a drift gate useless.** It fails on the calendar rather
  than on the content, and it stays failed.
- **`web/src/tasks/library/index.ts` carries a `HELPERS` string inlined into every fork seed**, and
  `librarySource.test.ts` compiles each seed and compares. A fork seed runs through `new Function`
  as plain JS, so a library script cannot gain a shared import without the helper being added to
  both `loopHelpers.ts` and that string in the same commit.
- **The 400-line ceiling bites mid-task, and the seam matters.** `worker.ts` hit 401 with the
  plan's code written verbatim and split into `runContext.ts`, `runHealth.ts` and
  `workerReport.ts`; `api.ts` split off `settings.ts`, `runRecorder.ts` and `runReads.ts`. Extract
  along a seam that means something rather than trimming comments. `worker.ts` stands at 397 and
  `tasks.ts` at 399, so the next line added to either splits it.
