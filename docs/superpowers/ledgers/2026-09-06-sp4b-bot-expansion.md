# SDD ledger for plan docs/superpowers/plans/2026-09-06-sp4b-bot-expansion.md

Spec: `docs/superpowers/specs/2026-09-06-sp4b-bot-expansion-design.md` (binding authority; its section 9 is the "what
actually shipped" account, written by Task 15). Handoff: `docs/superpowers/specs/2026-09-07-sp4b-handoff.md`, written at
the tasks 1 to 8c pause and still the readable narrative for that half; this ledger supersedes it on the rulings.
Branch: started on `feat/platform-shell`, finished on `sprint/dragon-slayer` (D1).
Commit range: `fd19173..4440115`. Seventeen tasks (1 to 15 as planned, plus 8b and 8c, which the owner asked for
mid-execution), each with a fresh implementer, a fresh reviewer and fix rounds to clean, then a whole-branch review, one
fix wave, Task 15's reconciliation, and the gate.
Source: `.superpowers/sdd/2026-09-06-sp4b-bot-expansion/progress.md`, 539 lines, read in full, condensed here and then
removed under D19 and D64.

SP4b gave the bot a world to work in: real collision data and a pathfinder, a static resource atlas generated from the
pinned content, `c.travel` and `c.find`, a health monitor with a recovery ladder, death and re-login recovery, per-script
toggles, the live run in the banner and the card, run history with a report and an export, three upgraded library
scripts, and a Tutorial Island script.

## Rulings

### Pre-flight, before any dispatch

- **R-A.** `router.settings.set` keeps Task 2's synchronous `fanOut`; `router.setEnabled` gets its own async fan-out, because `fanOut` returns void and cannot carry a promise. Cost: two small helpers instead of one. (Confirmed at Task 9.)
- **R-B.** `jm2.test.ts` ships without the `byTile` lines the brief adds and then deletes: an assertion that exists only to be deleted is a test that asserts nothing. Cost: none.
- **R-C.** If `tsc` rejects `'../data/collision.bin?url'`, declare `*.bin?url` in `web/src/vite-env.d.ts` rather than casting. Cost: one unnecessary declaration file.
- **R-D.** `FailReason` gains `'low_hp'` and the `hardStop.hpBelow` branch sets it; the set is ours and closed and history groups runs by it. Cost: SP4c handles one more union member.
- **R-E.** The `no-progress` recovery re-scans before it walks, matching spec 3.4. Cost: one extra scan per recovery.
- **R-F.** `RunStatus.target`, `.health` and `.xpPerHour` go on `RunStatus` and `WorkerStatus`, not on `RunStatusLite`, which the runner produces and cannot fill. Cost: type churn in one file.
- **R-G.** `tutorialIsland/index.ts` imports both `isTutorialRegion` and `TUTORIAL_REGION_IDS`. Cost: none.

### Tasks 1 to 8c: R1 to R27, from the handoff's section 4

- **R1.** Collision is a per-tile walkability bitset and walls are not in it: a wall blocks a tile edge, which one bit per tile cannot express, and the 1 MB budget is one bit per tile per level. Openable walls become door rows. Cost: a global path may cut a building wall, bounded because every leg goes to `Client.walkTo`, which routes on scene collision.
- **R2.** The generators live half in `web/src/data/gen` (pure, unit-tested) and half in `scripts/gen` (file IO); `kinds.ts` and `collisionFile.ts` are shared with the shell on purpose. Cost: the IO half is covered only by `--check`.
- **R3.** Cancel is a Worker-to-main message, not an RPC call, which `rpc.rejectAll` would reject one line later. Cost: a future main-thread cancel needs one more message.
- **R4.** E2E seeding uses the engine's `::` cheat commands; there are no dev routes. Cost: none in production, where `loadIdlescapeConfig` forces `devStaffLevel` to 0.
- **R5.** `atlas.json` and `collision.bin` ship as Vite `?url` assets; the front server routes only `/assets/*` from `web/dist`, so `web/public/` is not an option.
- **R6.** Fishing spots are identified by npc config, not by an id suffix: only 35 ids match the shape the spec describes, and four of those are contest spots.
- **R7.** The pathfinder's BFS window is the query's bounding box padded by 128 tiles, capped at 1024x1024, not the spec's fixed 2048x2048. Corrected twice during Task 4: a query whose `|dx|` or `|dz|` reaches **896** (`MAX_SPAN - PAD`) returns `[]`, not a partial path. Harmless while `travel.to` splits legs at 52 tiles; pinned by a characterisation test.
- **R8.** Per-kind cluster radii (tree 32, rock 16, fire 16, everything else 6) replace the spec's single 6-tile radius, which produced an 825 KB atlas against a 250 KB owner-approved budget. The spec's named fallback, per-region cluster files, was rejected because it changes the loader contract four tasks are written against. Cost: a tree cluster centre can sit up to 46 tiles from the nearest tree, which is why `c.find` re-scans with the cluster's own `r`.
- **R9.** The bank rule is an exact-name set plus a `Bank`-op arm, not `name.startsWith('bank ')`, which matched 218 placements of which 147 were notice boards and tables and put 68 unwalkable targets in the landmark table. Landmarks fell from 108 to 40.
- **R10.** `scripts/gen/*.ts` gained its own tsconfig and a build-time typecheck. It sat outside all static checking: `web/tsconfig.json` covers only `src/`, lint runs from `web/`, and Bun strips types without checking them.
- **R11.** The collision generator's `active` means a model name that resolves verbatim in `model.pack`, or any op. The plan's rule would have marked 259 676 of 311 905 ground-decor placements as blocking instead of 1 259.
- **R12.** `collision.bin` carries a present mask separate from its payload mask. Required in production, not only by a test: `BotSDK.findPath` refuses when the source zone is unallocated, and 34 real squares have an entirely walkable level 0 that would strand a player standing on one. Cost: one byte per square index row.
- **R13.** The BFS refuses to leave loaded squares; it is the engine's own rule, since `CollisionEngine.get` returns every block bit for an unallocated zone. Cost: a path across an unmapped square is refused rather than attempted.
- **R14.** `.gitattributes` gained `*.bin binary`: `collision.bin`'s first NUL is at offset 5 and it holds 368 `0x0A` bytes, so only git's NUL heuristic was preventing CRLF mangling.
- **R15.** `MAX_LEG_TILES` is 52, not 60. The constant's comment derives the built scene's 52-tile half-width and a 60-tile target lands outside the scene `Client.walkTo` clamps to; the spec's "at most 60" is satisfied literally. Cost: marginally more legs, each still one scene walk.
- **R16.** `routeFor` honours `r.from` and `r.level`, not only `r.to`, with `ROUTE_START_TILES = 52` bounding how far from a route's start the player may stand. Cost: a route whose start is further than one scene from where scripts stand is silently ignored in favour of a straight plan.
- **R17.** Arrival checks the level, and measures against the route's last walk waypoint when a route was followed. Without the first, a route interact that clicks but does not transition reports success on the wrong plane; without the second, every route is obliged to end exactly on its landmark tile.
- **R18.** `atlas.ts`'s string variant comparison is case-insensitive, matching what `types.ts` documents, rather than the doc being corrected: a script passing `'Oaktree'` matched the scene and silently missed every cluster. The change can only match more clusters, never fewer.
- **R19.** The ladder counts occurrences as well as attempts, with a per-condition escalation target (death terminal at the second, no-progress pause-stuck at the second and terminal at the third). Keyed on attempts alone a wedged run re-scanned and walked home every 90 seconds forever, never pausing and never failing, because a successful recovery clears the attempt count and walking to the anchor while standing on it always succeeds. Cost: a stubborn no-progress run ends as failed rather than sitting paused for a player who might have rescued it; two-line revert.
- **R20.** `onDeath: 'fail'` jumps straight to terminal on the first death; skipping the re-anchor rung is not enough, because the next line returns pause-stuck, which pauses rather than ends.
- **R21.** `out-of-supplies` means reaching zero, not absent: as written, a script declaring `consumes` and starting empty failed its own run unrecoverably on the first snapshot.
- **R22.** The `logout` stop was removed from `wire.ts`. A dropped connection reaches `Client.logout()` on two of `lostCon()`'s three exits and a server kick emits `logout` too, so the stop killed the run exactly when the re-login recovery was needed. The three cases it covered are each covered better: `api.dispose()` for a shell-initiated close, the human-input pause for a player clicking logout, and the ladder for everything else.
- **R23.** `generatedAt` was removed from the generated atlas: it made the drift gate fail every time UTC rolled over, which fails `scripts/build.ps1` and therefore `verify.ps1`, while `contentSha` is what tracks the content. Deviates from the `Atlas` type in spec section 5. Cost: nothing reads it, and git log answers the same question.
- **R24.** The death tile is captured immediately after the once-per-occurrence guard. `isDeath` returns true on `memory.lifeChanged`, recorded on the respawn snapshot with `lastAliveAt` already moved, so capturing before the guard lets the last write win with the respawn point.
- **R25.** `DEATH_TIMEOUT_MS = RESPAWN_MS + LOOT_WINDOW_MS + ANCHOR_WALK_MS` (300 s). The loot window is absolute from the moment of death, so a long loot walk left the anchor walk about 60 s of the 120 s travel defaults to and the recovery settled failed: the one route by which the loot detour could turn a survivable death into a failed run.
- **R26.** `WorkerHost.restart(behaviour)` takes the current settings and the argument is required. Behaviour is read once at run start and a restart is a run start: it mints a new `runId` and re-seeds status. Replaying the stored request meant a run started at 14:00 and restarted at 18:00 obeying the 14:00 settings, and the user-script restart path already went back through `run()`, so without this the two restart paths disagreed with each other.
- **R27.** The `onDeath` setting offers all seven `DeathBehaviour` values including `fail`. The plan's settings table listed seven and its code block listed six; the table was the intent, and a script may declare `fail`.

### Task 9, per-script toggles

- `api.ts` was split before the feature, not after: `tasks/runRecorder.ts` took the live run's trace buffer and its journey into IndexedDB. Verified a pure move, 1095 tests either side. Cost: one more small module.
- `plugins/builtin/tasks.test.ts` split its pure view builders into `tasksViews.test.ts`; titles byte-identical, 27 = 8 + 19. Cost: two fixture factories duplicated, about twelve lines.
- `TaskSummary.enabled` is required, not optional; the renderers still read `!== false` so a stale row runs rather than looking broken. Cost: one more field for a future producer to fill, which the compiler announces.
- The Tasks panel re-reads its rows in `finally`, not the plan's `then`: the plan's version left the switch showing Off after a refused write, because the player has already moved it. A real defect in the plan's Step 4 code block.
- The toggle is checked before requirements in `run()`, so a script that is off and also missing its axe says "turned off", which is the half the player can undo.
- `wire.ts` fires `toggles.load(uid)` without awaiting and flushes the store on dispose; until the load lands `isEnabled` answers enabled, the same answer it gives a script nobody has ever touched.
- The N-writes-per-click duplication (one store per session) is recorded deliberately rather than removed: hoisting one store above the sessions trades N idempotent writes for a staleness bug across accounts. Revisit if SP4c gives the shell a place that outlives a session and knows the uid.
- `renderParamsForm`'s boolean field had the same `class="switch"`-on-the-input mistake and was fixed in the same commit: pre-existing, but two lines from the row that was wrong for the same reason.

### Task 10, the live run in the banner and the card

- Confirms R-F, with `WorkerStatus` picking the three fields off `RunStatus` through `Pick<>` so they cannot drift.
- The enrichment is a pure `liveStatus(lite, deps)` in `workerReport.ts`, not inline in `postStatus`: `worker.ts` was at 385 of 400 and the plan's inline version takes it to 394 with nothing testable in isolation.
- No `monitorRef`: `current.health` already has that lifecycle, and a second reference would be a second owner of a fact.
- `lastTarget` is cleared where the run starts, not where it ends; a clear in `endRun` is unobservable, because every publication path is guarded on `runner`, so no mutation could fail on it.
- The health pip is a persistent element whose `hidden` class toggles: `#run-banner` is an atomic live region and adding and removing a node inside it is worse than a class change. The plan's test snippet contradicted its own implementation.
- No ETA on the run card: `RunStatus` carries no target level and the plan says not to invent one.
- The panel owns the five-check cap and the card renders what it is handed; capping in both places made the panel's slice unreachable. `HEALTH_NOTES` moved beside the buffer it bounds.
- The styleguide's fourth banner state is `reason: 'hard-stop'`, not `state: 'failed'`: a settled run lingers four seconds and then leaves, which is not much of a swatch. The demos call the real `createRunBanner`.
- `web/styleguide.html` goes 490 to 504 lines, recorded rather than split: it was over the ceiling before this task.
- The has-detail pill offsets are 38px and 62px, not the reviewer's 37 and 61: the second row costs the 8px row gap plus one 11px line at 1.2 = 21.2px, and rounding up keeps at least the clearance the one-row rules give.
- `RunStatus.target` gains `via: FoundVia` and the card renders it ("in view", "from the atlas", "found by sweeping"), which is spec 3.5's discovery layer for one field and one word map, pinned through the real Worker's own message port.

### Task 11, history, the report and the export

- `buildRunReport` closes a visit on the next `task_enter`, not on `task_exit`: `runner.ts:103` pushes `task_enter` only when the task name changes, so the plan's loop reported half an hour of chopping as the four seconds of its first lap. All six of the plan's fixtures paired each enter with one exit, where right and wrong are the same number.
- The end summary is built by `endSummary` in `workerReport.ts` and the `run_done` trace row is pushed from the summary's own numbers, so the two cannot disagree.
- Reading a run back moved to `tasks/runReads.ts` (`api.ts` reached 395 with Step 1 alone); `TasksError` stays api.ts's and reaches `runReads` through a `notFound` factory, so there is no import cycle.
- The panel's shared fixtures moved to `tasks.harness.ts`, which tsconfig compiles: being compiled immediately caught the old inline `fakeApi` missing `dispose`, which nothing had noticed.
- `RunHistoryOptions.cap` is replaced by `summaryCap` and `traceCap`, not kept beside them: two names for one retention policy is the redundant-second-owner shape.
- The Export button turns the blob into a download inside `runReportView.ts`; the panel still owns which run is exported.
- "Copy for Claude" copies the report, and `renderTraceView` keeps its own copy button for the filtered trace rows, which is what its kind filter exists for.
- Carried P0 (audit C01) fixed wider than the audit's line: a bare re-emit would have doubled the row in the export, so `seq` is the key at all three consumers (recorder buffer, `RunHistory.appendEvents`, `appendTraceEvent`), and the fan-out copies the subscriber set before the walk (C02). Cost: nothing downstream may append a trace event without checking its seq first.
- The `tiles: context.tiles` joint is removed rather than tested: `EndedRun` holds the context whole. The reviewer's suggested test needs the vendored walker, a built scene and a live path, which is a project rather than an assertion.
- The export file name stays `idlescape-run-<scriptId>-<runId>.json`, not the spec's `run-<runId>.json`: a downloads folder is shared with every application on the machine and a run id is an opaque string.

### Task 12, the three library scripts

- `health` on the three loops is `{ noProgressMs: 90_000 }` only. `return-and-resume` no longer exists, and `resolvePolicy` gives a declared `onDeath` precedence over the player's setting, so declaring one would silently disable the setting R27 widened. Cost: a death on a skilling run follows the player's choice (default `loot`) rather than walking straight home.
- A variant matcher names both namespaces in one pattern: chop builds `^(Oak|Oaktree)$`; mine matches `^Copperrock` only, because every rock is `name=Rocks` and the scene cannot tell ores apart; net fish matches `^(saltfish|memberfish|newbiefishing)$` for the same reason.
- `net-fish-and-drop` loses its `spot` param: it filtered on the display name every spot shares, and passing it as the variant made the scene answer with a lure spot the script cannot net.
- The plan's second sample test is not written; every discovery test asserts `calls.walked` instead, which is the only evidence of which layer answered (one leg is the atlas, a ring of scan points is the sweep, empty is the scene).
- The tests run against the real `c.find` and `c.travel` through a new `library.harness.ts`, with only the snapshot, the atlas fetch and the bot actions faked. Cost: a change to `find.ts` or `travel.ts` can now fail a library test.
- The net-spot fallback filters on the `Net` op alone, not on the display name the review prescribed: measured over the whole pinned content, exactly three npc configs carry a `Net` op and all three are `name=Fishing spot`.
- All three tasks move from `timeoutMs: 60_000` to `180_000`: `travel.to` defaults to 120 s and the catch or xp wait adds 30 s, so a 60 s timeout aborted a walk travel was still willing to make and three of those tripped `maxAttempts`.
- **Correction to the variant ruling, folded into the spec:** "neither can interact with the wrong thing because the menu option is checked at the end" is true for fishing and, after the fix round, for chopping. It is **not** true for mining: every rock is `name=Rocks` and offers `Mine`, so in a mine holding two ores a lap mines whichever rock the re-scan lands on nearest. An accepted limitation, not fixable without loc ids in the atlas, recorded in a comment in `mineAndDrop.ts`.

### Task 13, the Tutorial Island script

- `sendClickTab` does not exist; the SDK's method is `sendSetTab(tabIndex)`, and `sendAcceptCharacterDesign` was added beside the randomiser because randomising alone never commits the design.
- The content has **thirteen** empty titles, not the plan's three; asserted as the literal 13, because `>= 3` against a real 13 is a test that cannot fail.
- `MATCHED_TITLES` moved into a `titles.ts` of its own as a named record: the stages match through `T.cutDownATree` and never through a literal, so the constant cannot drift from what they key on, while the stage tests use literals.
- The two ladders are **not** plane changes: `~climb_ladder` moves the player 6400 tiles in z at level 0, which is why map square 48_148 is a tutorial region. Both routes are `level: 0` end to end.
- Route endpoints are landmarks of a new kind, `route`, because `routeFor` resolves `r.from` through the landmark table and refuses a route whose start it cannot find. Deviates from spec section 5. Cost: four extra atlas rows.
- `web/src/data/gen/tutorialRoutes.ts` is a third module shared between the generator and the shell, because the script names the landmark ids and the generator emits them; a second copy would be a second thing to keep in step.
- Route coordinates were read from the pinned clone, not guessed, and the generator now throws on an unknown endpoint.
- `writeOrCheckText` was added to `scripts/gen/lib/io.ts` for the generated `steps.ts`: `.gitattributes` is `* text=auto` and this checkout is `core.autocrlf=true`, so a byte compare fails the build on every fresh clone.
- The smithing interface and the bank are recognised by step title and `s.bank.isOpen`, not by interface id, because a wrong literal would have had `close-unexpected-modal` shut the bank the tutorial had just asked the player to open. A fifth recovery task, `accept-expected-interface`, hands the condition back so a claimed condition that is never reported does not silence the monitor's interface arm for the rest of the run.
- `enable-run` clicks component 153 directly: `tut_doors_and_gates.rs2:78` refuses the door until `^tutorial_has_toggled_on_run` moves, so no amount of hint-following replaces that click.
- The stage list deviates from the plan in four places (`open-flashing-tab` split out, `please-wait` as its own task, `choose-dialog-option` as a general last-resort picker, `follow-the-arrow` as the tail fallback), and three planned tasks were collapsed into neighbours (`go-to-chef`, `talk-to-chef`, `leave-pit`), because a task whose `when` cannot be told from its neighbour's is a task the runner picks at random. Both fallbacks are last, so every named step wins.
- `enter-mine` is gated on the hint arrow sitting exactly on the ladder tile, not on the empty title plus proximity: the quest guide's other three steps are also untitled and the engine refuses the climb until his own flag moves.
- `library.test.ts` and `librarySource.test.ts` grew a `LOOPS` subset rather than being loosened, so the six skilling-loop assertions keep pinning the three loops.
- The `forkable` rationale lives on `RowOptions.forkable` and on the `SOURCES` note, not beside the call site: `tasks.ts` was at 399 and a three-line comment there put it at 403.

### Task 14, the real-stack e2e

- `seedCharacter` takes the character off Tutorial Island first, with `::setvar tutorial 1000` and the `[debugproc,death]` whose respawn runs `~initalltabs`. The plan's harness could not have worked: `inv_transmit` only runs once `%tutorial` passes a threshold, so `::give` succeeds server side and the client is never sent the inventory, while `::setstat` is unaffected, which is what makes the failure look like `::give` alone being broken.
- The mining spec asserts the layer that answered and the tiles travelled, not "two different rock names": every rock in the pinned content displays `Rocks`, so the plan's assertion is one no run could satisfy.
- The tutorial spec asserts the banner detail line renders the run's tile and that the trace entered a named instructor's task: a tutorial run's target is null, so the plan's assertion could only have passed by accident.
- `stopGraceMs` defaults to 5000, not 2000. Measured live: a chop run stopped inside an SDK action takes about 1.7 s to unwind, and 2 s left no room for the api and router hops, so every stopped library run was killed and wrote "the worker was terminated before the run reported an end" with zero xp, items and tiles.
- An aborted task may not dispatch: `createRunContext` wraps the transport so `dispatch` rejects once the signal has fired. Without it an SDK action caught the stop's rejection and issued the next call, which nothing cancels.
- "Click here to continue" is not a choice: the live client publishes it as a `dialog.options` entry, so `isTalking` never matched and `clickThrough` refused to click a frame with nothing to decide. `realChoices` in `agent/constants.ts` is shared by `workerContext` and the tutorial helpers rather than duplicated.
- `decline-tutorial-skip` is first in the list and matches the question as well as the answers: on a world where `map_live` is false the guide opens with "Do you want to skip the tutorial?" and "Yes please." matched the script's own preferred option. Matching only the answers is a frame too late.
- The chop spec asserts a real drop cycle (28 slots, then an empty bag, then a count of negative item deltas) and seeds 25 logs: an empty-bagged character does not fill 28 slots inside a 15 minute wall clock at level 1, and `summary.itemsDelta` is a net change per item id and cannot answer the question at all.
- Partial dispute of a minor: the net-fish seed stays 17 tiles from the shoal rather than the documented 30. The property being named is the 15-tile scene default, which 17 clears; the ground 30 tiles out is water or the dark wizards the seeded hitpoints exist to survive. Both atlas specs now require `tilesTravelled > 15` where they required `> 0`.
- The clickThrough and followHint tests moved to `workerContext.tutorial.test.ts`: rebuilding the fixtures took `workerContext.test.ts` to 423 lines, and the seam is real.
- `tutorial-island.pw.test.ts` is committed as `test.fixme` with a real run's trace and screenshot. Cost: SP4b's headline claim is evidenced by a 22 minute trace rather than by a green spec, and the gap is named where the next round reads it.

### Task 15, reconciling the spec

- The new section is numbered **9**, not 12: the plan, the handoff and the final review all call it "section 12" after SP8b's section of that name, but this document has eight sections and a literal 12 would be a hole no reader could resolve. Its first paragraph says so, so both names find it.
- `README.md` and the roadmap were both carrying another session's uncommitted work, so each addition was applied twice: to the working tree, and onto the HEAD version through `git hash-object -w --path` plus `git update-index --cacheinfo`, so `git diff --cached` showed exactly the 25 README lines and the one roadmap row and nothing else.
- The roadmap gains an inserted `SP4b (done 2026-09-07)` row, since the table has no SP4a row and only one SP4 row.
- Audit carry-in C04's vendor half needed nothing: `web/src/vendor/PATCHES.md` was already reconciled by Tasks 4 and 5. C05, the Escape panic key, is a code change and is recorded in section 9.6 for the next round.
- Spec 3.5's ETA, items gained and lost, and tiles travelled are written into the spec as **dropped** from the live card, not as owed work; the run report shows them at the end, which is where Task 11 built them.
- Follow-up commit `a3b0a11`: section 2 is written in the present tense about the state SP4b started from, all of which is now false. One paragraph says it is the before picture, rather than rewriting eight subsections of a deliberate one.

## Deferred, parked and carried forward

Everything below is in the spec's section 9, in `decisions.md`, or in the audit; nothing waits on this document alone.

- `onDeath: 'pause'` still ends on pause-stuck, so the banner toasts "Stuck on recover:death" in the error tone at a player who chose "Pause and wait for me". Accepted twice (Task 8c, final review): a `PauseReason` of its own crosses `types.ts`, both `runner.pause` call sites, `runHealth`'s escalate and three renderers. In spec section 9.
- The death recovery's three exits each remember the logout packet. Accepted: both sides are pinned and no fourth exit arrived. Collapse it into one `finish(ok)` when the next exit does.
- **Tutorial Island is `test.fixme`.** The run gets through the character designer, the guide, the door, the tabs, cut-tree, build-fire, catch-and-cook-shrimp, the controls, the run orb, the quest journal, the mine, both prospects, both ores and a smelted bar, then wedges at `smelt-bar`: `tut_smelting.rs2` advances `%tutorial` and calls `~set_tutorial_progress` but nothing re-renders the tutorial box, so `tutorial.title` still reads `Smelting.` and the step matches itself again. The lesson is in the spec's comment: **`tutorial.title` lags the real `%tutorial` across several transitions, so any step that can complete without the title moving needs a second signal in its `when`.**
- The atlas layer's re-scan can beat the engine's npc spawn-in: at Rimmington's shoal the snapshot taken the moment `travel.to` returned held no fishing spot while one six seconds later held two. `find` has no wait dependency; the fix belongs beside Task 6's code.
- `enable-run`'s stale-title arm carries no positive signal that the controls tab was opened, so a snapshot where the title lands before the flash lets it fire early. Bounded: the runner re-matches `open-controls-tab` when it arrives.
- `tutorialIsland/helpers.ts`'s `hintedLoc` stays on the exact-tile rule by ruling, because its caller passes a named option and a neighbour that does not offer it would fail rather than fall through to the `find` fallback already there.
- C06's history half, the silent void-catch writes in `runRecorder`, is not fixed: a real fix needs somewhere for the failure to go, which is a `TasksApi` decision rather than a recorder one.
- `getRun(runId, sinceSeq)` cannot re-deliver a correction, whose seq is by definition below the cursor. No caller passes it today; documented on `RunReads.getRun` and `RunRecorder.eventsSince` rather than removed, because SP4c's relay wants it.
- `web/styleguide.html` is 504 lines, over the ceiling, and was over it before SP4b. `styles/index.css` imports `./tasks.css` twice: pre-existing, harmless, untouched.
- Two mutations survive and are recorded rather than claimed: deleting `run.context.dispose()` from `endRun`, and (before the joint was removed) `tiles: context.tiles`. Both need a live stack to pin.
- Parked in Tasks 1 to 8c: the travel "re-plan" that re-plans nothing (a doubled retry budget with a misleading name, and the bound is tight at four walks); `stalled`/`replanned` being travel-global rather than per-waypoint; an abort on the final leg of a walk that arrived reporting `aborted`; the panel's double-start guard verified by reading rather than by a test; `localTransport`'s waiting-set no-leak on the normal-reply path, structurally untestable; and one `healthMonitor` guard unreachable today and documented as uncovered rather than claimed.
- `localTransport.dispose()` clears the waiting set without settling the resolvers in it, so a dispatch in flight at teardown never resolves. Found at Task 1, folded into Task 8, which already owned the file.

## Traps recorded

- **A fake more permissive than the real collaborator hides the branch you are testing.** Nine instances here, several found by implementers mutating their own new tests: a `peek()` that returned data unconditionally, so the `load()` branch behind `peek() ?? await load()` was dead; a fake reporting one tile per hop, so a walking budget never fired; a fixture holding the item the predicate had to see it lose; a `wait.until` that evaluated the predicate and threw the answer away; a `chopTree` that always succeeded; a `sendClickDialog` that accepted any number. Prefer the real collaborator: Task 6 deleted its atlas fake for the real loader over a stub `fetch`.
- **A fixture where right and wrong are the same number proves nothing.** A region test at (3222, 3218) passes under an x/z transposition because both coordinates are in square 50; a `flashingTab: 6` fixture set for both titles hid a step that could never flash.
- **An assertion against an imported constant cannot pin that constant.** Assert a literal.
- **Nothing mechanical catches a test fake missing a member of an interface you just widened.** `web/tsconfig.json` excludes `src/**/*.test.ts` and eslint is not type-aware. `*.harness.ts` **is** compiled, which is why the exhaustive `Record<keyof Transport, true>` lives in one. Nine instances; grep for `as unknown as X` and `: X =`.
- **Vitest's config can silently exclude a whole suite:** `web/vitest.config.ts` excluded `src/vendor/**`, so Task 4's new pathfinder test would never have run at all.
- **`fileURLToPath(new URL('...', import.meta.url))` throws under vitest**, because Vite rewrites that exact pattern into an asset URL. Use `join(dirname(fileURLToPath(import.meta.url)), ...)`.
- **A timestamp in generated output makes a drift gate useless:** it fails on the calendar rather than on the content, and it stays failed (R23).
- **The 400-line ceiling bites mid-task.** `worker.ts` hit 401 with the plan's code written verbatim, and six more files hit it as tasks added to them, one of them production code. Extract along a seam that means something: `runContext.ts`, `runHealth.ts`, `workerReport.ts`, `runReads.ts`, `runRecorder.ts`, `tasks/settings.ts`.
- **A library script may not carry a TypeScript annotation anywhere at module scope**, because a fork seed runs through `new Function` as plain JS. Build the matchers inside `run`, where `c` is contextually typed. The `HELPERS` string in `library/index.ts` must mirror `loopHelpers.ts`, including `recovers` and `c.health.recovered`.
- **jsdom has no `CSS.escape` and its `Blob` has no `text()`**, and its `localStorage` arms a timer on every write, so `vi.getTimerCount()` cannot be asserted as zero; measure the delta.
- **`loginAsGuest` returns on the session's first world publication** (D87, the e2e wait): tick 1, no npcs, the player at its pre-placement sentinel coordinates. Any spec that drives `bot.*` straight after it must wait for the world it acts on, and that wait must itself be asserted.
- **The scene and the atlas use different namespaces:** a cluster's `variant` is the content debug name (`oaktree`), the scene reports the display name (`Oak`), and `FoundTarget.name` flips between them. Do not key on it, and never let it reach player-facing copy.

## Measured facts

- **Death mechanics** (`[proc,player_death_lose_items]`): the three priciest items are kept, four with Protect Item, none if skulled; everything else in `inv` and `worn` drops **at the death tile**, plus bones. `destroy_drop` and `destroy_death` items are deleted and never recoverable. `^lootdrop_duration = 200` ticks = **120 seconds**, covering respawn, travel and pickup together. Respawn is fixed at absolute tile **(3221, 3218)** in Lumbridge. Dropped objs are private to their owner until `Zone.revealObj`, so the bot sees its own loot immediately.
- **Staff keep their items only on a live world.** The guard is `staffmodlevel > 1 & map_live = true`, and `map_live` is `Environment.node.production`, false in the dev and e2e stacks, so a `-DevStaff` character does drop its items, which is what makes an e2e for the loot recovery possible. A `[debugproc,death]` cheat triggers one.
- **E2E seeding.** `::give`, `::setstat` and `::tele` need `staffModLevel >= 4` on a non-production node; the vendored client routes any `::` message to `CLIENT_CHEAT`, so `bot.say('::give ...')` is the path. `start-stack.ps1` needs `-DevStaff` (`IDLESCAPE_DEV_STAFF=4`) regardless of `-Prod`, and `verify.ps1` passes it.
- **The `.jm2` format:** `<level> <localX> <localZ>: <payload>`; MAP tokens `h`/`o`/`f`/`u`, any may be absent; an omitted loc shape defaults to 10 and an omitted angle to 0; a tile may carry more than one loc or npc; absolute tile is `(mx << 6) + localX`. `engine/content/maps` holds 487 files of which **483** are `.jm2`; "487 map squares" is a directory count.
- **The atlas as shipped:** 16 182 matching placements (not the spec's 32 186) become 1 520 clusters, **44** landmarks and **2** routes, 179 612 bytes raw and 25 646 gzipped, against budgets of 256 000 and 81 920. `collision.bin`: 483 squares, 2 653 doors, 521 108 raw and 144 311 gzipped, budgets 1 048 576 and 409 600.
- **`KIND_META[kind].op` is intent, not a clickable option, for four kinds.** Over all 4 671 loc configs: fires 0 of 10 carry any op, anvils 0 of 3, ranges 1 of 8, furnaces 5 of 9, altars split 13 `Craft-rune` and 6 `Pray-at`; only trees (35 of 35) and rocks (52 of 52) publish one universally, so the rest match on the content name. `matchesKind` against `locKind` over every config gives **zero false negatives for every kind**, which is the property the post-atlas re-scan depends on. It also recognises 29 configs `locKind` returns null for, including `newbietree`, which is the mechanism behind Tutorial Island having no tree cluster and the tree still being reachable.
- **Every mining rock displays `Rocks`** (`copperrock1`, `tinrock1`, `ironrock1`), **all 51 fishing spot npcs display `Fishing spot`**, and exactly three npc configs carry a `Net` op.
- **The tutorial content calls 74 `~tutorialstep`s, 13 of them untitled** (a 75th call is commented out on the same line as the one that replaced it). `Mining.` appears three times and `It's tin.` twice, which is why a title alone cannot identify a step.
- **Three door hints sit one tile west of their door:** `tutorial_step_go_to_chef` hints 0_48_48_6_12 while `newbie_door2` is placed at "0 7 12", and the bank exit and the account guide's door likewise. Every other tile hint on the island is on the loc's own tile, which is why the run got as far as it did before this was found.
- **Constants at HEAD**, re-measured by Task 15 rather than copied: `MAX_LEG_TILES` 52, `ROUTE_START_TILES` 52, `PAD` 128, `MAX_SPAN` 1024, `DEATH_TIMEOUT_MS` 300 s (60 + 120 + 120), `summaryCap` 200, `traceCap` 50, find `DEFAULT_RADIUS` 15 / `MAX_RADIUS` 52 / `DEFAULT_SWEEP_TILES` 200, `KIND_RADIUS` tree 32 rock 16 fire 16 default 6; seven `DeathBehaviour` values, three `StuckBehaviour`, twelve `TasksErrorCode` including `disabled`, thirteen `FailReason` including `low_hp` and `logged_out`. Two handoff figures were stale and are corrected in the spec: 40 landmarks (now 44) and the byte counts.
- **Suite growth:** 805 tests at Task 2, 1 450 across 131 files at the fix wave, plus 29 firebase rules tests, 48 client hook tests, and 26 Playwright specs passing with 6 skipped by design.

## Per-task table

| Task | What | Commits | First review | Fix rounds |
|---|---|---|---|---|
| 1 | Abort reaches the waits and the client queue | `fd19173..d972e8c` | opus: 2 important, 3 minor | 1 |
| 2 | Fan settings writes to every session | `d972e8c..5103da8` | sonnet: 1 important | 1 |
| 3 | Generate and load the resource atlas | `5103da8..909ea39` | opus, not approved: 3 important | 1 |
| 4 | Path over real collision data | `909ea39..1eee135` | opus, not approved: 1 important, 5 minor | 1 |
| 5 | `c.travel` | `1eee135..55a8c04` | opus: 8 important, 7 minor | 1 |
| 6 | `c.find`, three discovery layers | `55a8c04..f6d677a` | opus: 1 important, 9 minor | 1 |
| 7 | Health monitor and the recovery ladder | `f6d677a..187fc64` | opus, spec not met: 1 critical, 2 important, 7 minor | 1 |
| 8 | Death and re-login recovery | `187fc64..a412684` | opus: 1 critical, 4 important, 2 minor | 1 |
| 8b | Death loot recovery (owner scope change) | `a412684..5417ff6` | opus: 1 important, 3 minor | 1 |
| 8c | Bot behaviour settings (owner scope change) | `5417ff6..7dfe9b4` | opus, not approved: 2 important, 6 minor | 1 |
| 9 | Per-script toggles | `19607b1..1bfdc7d` | opus, not approved: 4 important, 4 minor | 1 |
| 10 | The live run in the banner and the card | `1bfdc7d..30efd94` | opus, not approved: 2 important, 6 minor | 1 |
| 11 | History, the report, the export | `30efd94..807a33b` | opus, not approved: 1 important, 9 minor | 1 |
| 12 | The three library scripts | `807a33b..ef14b81` | opus, not approved: 2 important, 4 minor | 1 |
| 13 | The Tutorial Island script | `ef14b81..1fe96f1` | opus, spec not ok: 2 important, 3 minor | 1 |
| 14 | The real-stack e2e | `1fe96f1..59f6155` | opus, not approved: 1 critical, 3 important, 8 minor | 1 |
| review, wave | Whole-branch review and the fix wave | `59f6155..e7a88bf` | fable: 1 important, 5 minor | 1 wave |
| 15 | Reconcile the spec with what shipped | `16e4e14`, `a3b0a11` | read-back by the author | n/a |
| gate | `verify.ps1` green at HEAD | `4440115` | n/a | n/a |

Every task was implemented by a fresh opus agent (Task 2 sonnet), first-reviewed by a fresh opus agent, and re-reviewed
by a sonnet agent scoped to the fix diff. Every fix round closed at 1 of a 5-round cap and no re-review found new
breakage. Tasks 9 to 14 ran as one Workflow of 29 agents over 12.3 hours.

## The final review and the fix wave

Whole-branch review by fable at `59f6155`: **ship**, 1 important and 5 minor, 2 of the 5 accepted without a code change.
Seven mutations run, seven killed, the tree restored byte for byte. Constraint sweep over `19607b1..HEAD`: no em dash in
any added line, no new `as any`, all 21 commits carrying both required trailers and no protected file, every source file
under 400 (`tasks.ts` 399, `worker.ts` 396, `tasks.test.ts` 394, `api.ts` 393 at the edge). Checked and accepted without a
finding: toggles across a session switch and sign-out, every trace kind having a consumer, the `HELPERS` string matching
`loopHelpers`, schema-2 read-time defaults over a hand-written v1 database, the report against a truncated marker, and
every dispose fencing the in-flight work that matters.

The one important finding was the headline: `followHint` matched a loc on the **exact** hint tile only, and three of the
island's door hints sit one tile west of their door. The fix wave's rulings:

- The rule lives in one module, `web/src/agent/hintTarget.ts`, and the Tutorial Island harness's fake `followHint` **imports** it rather than restating it: sharing the function is the strongest form of "a fake at least as strict as the real thing". `hintTarget.test.ts` pins it against literals so a defect inside it is not invisible to the stage tests.
- The arrow's own tile still wins unconditionally; a loc one tile away counts only when it carries at least one menu option, and among equals the one offering Open wins and its own option index is sent. Every hint step that already worked stands on its own arrow, so none of them changed.
- Capping `runRecorder` exposed a second defect, fixed in the same commit: a marker correction pulled the flush cursor back and re-sent the whole tail every fifty events. A correction now sets a dirty flag and rides the next flush.
- `worker.ts` was **not** split to add xp to the live repost set; the comment was compressed so the file stands at 397.
- **One extra stage fix was taken beyond the brief**, because the live run the door fix unblocked wedged again three stages later on the same shape: `tabStep` stops matching once its own click has cleared the flash, and `enable-run` fires on the stale short-distance title. The line was drawn at the third blocker, `smelt-bar`, which is diagnosed in the spec's comment rather than fixed, because each further stage costs a 22 minute live loop and that is Task 13 continued.
- The stale skip reason on `tasks.pw.test.ts`'s guide snippet was closed by running it: it passes in 5.9 s now that SP4b ships `collision.bin` and the real pathfinder, so it was un-skipped rather than re-commented.

Live evidence for the wave: two full runs of `tutorial-island.pw.test.ts` against a `-Prod -DevStaff` stack. Run 1 (door
fix only) entered 25 tasks over 209 events and stuck at `open-controls-tab`; run 2 (both fixes) entered 46 tasks over 406
events and stuck at `smelt-bar`. The spec stays `test.fixme`; the trace and the screenshot are committed.

**The gate.** `verify.ps1` at `a3b0a11` failed at step 7 on the newly un-skipped guide snippet, twice, while it passed
alone in 5.9 s. Diagnosed rather than retried: the snippet's opening `state()` was the session's first publication (tick
1, `nearbyNpcs: []`, the player at (-389056, -391104), "Welcome to RuneScape." the only message) and `bot.talkTo` answered
`NPC not found` synchronously, after which the 8 s `wait.dialog` could only fail. The spec now waits for the guide to be
in view within five tiles and asserts that wait; `loginAsGuest` is deliberately left alone, because every other spec
already does something before it touches the world (D87, the e2e wait). Proved by two consecutive full Playwright runs
against one stack, not by the spec alone. `verify.ps1` is green end to end at `4440115` (`logs/verify-sp4b-landing.log`).
