# Idlescape - SP4b handoff: Tasks 9 through 15

**Written 2026-09-07 on `feat/platform-shell`, with Tasks 1 to 8c complete and review-clean.**

This is the instruction sheet for the session that finishes SP4b. It is a companion to
`2026-09-06-sprint-handoff.md`, which still owns the sequence after SP4b (SP8c, SP9, SP10, SP4c)
and the working conventions, and to `2026-09-06-sp4b-bot-expansion-design.md`, which is the
binding design authority. Read both.

It exists because the SDD workspace is git-ignored, so nothing in it reaches a fresh clone, and
under the convention in force when this was written it was also deleted at close. Everything in it
that a later session needs - the rulings, the traps, the measured facts - is reproduced here.

**Correction, 2026-09-07.** The workspace at `.superpowers/sdd/2026-09-06-sp4b-bot-expansion/` was
never deleted; it was present and in use by the session that finished tasks 9 to 15. The convention
has since changed from deleting a ledger at close to promoting it into
`docs/superpowers/ledgers/<plan-basename>.md` (decision D19, written down in
`docs/superpowers/SDD.md`). At the landing step SP4b's ledger was promoted to
**`docs/superpowers/ledgers/2026-09-06-sp4b-bot-expansion.md`** and the workspace was removed
(D64). **Read the ledger first**: it carries tasks 9 to 15 as well, and it supersedes this document
wherever the two disagree. This document remains the readable narrative for tasks 1 to 8c.

---

## 1. Where things stand

**The plan** is `docs/superpowers/plans/2026-09-06-sp4b-bot-expansion.md`, committed at `fd19173`
and amended twice since (`405752e`, `0f4843a`, `727588c`). It is 17 tasks: 1 to 15 as originally
written, plus **8b** and **8c**, which the owner asked for mid-execution.

**Done, each implemented, reviewed by a fresh reviewer, fixed to clean, and committed:**

| Task | What it built | Range |
|---|---|---|
| 1 | Task-scoped abort: `signal()` accessor, `Transport.cancel`, `cancelAll` on `ClientHooks` | `fd19173..d972e8c` |
| 2 | SP4a carry-overs: router settings fan-out, live-run panel refresh | `d972e8c..5103da8` |
| 3 | The atlas: generator, `web/src/data/atlas.json`, runtime loader | `5103da8..909ea39` |
| 4 | Collision data and a real BFS pathfinder over it | `909ea39..1eee135` |
| 5 | `c.travel`, the long-distance walking layer | `1eee135..55a8c04` |
| 6 | `c.find`, three layers of discovery | `55a8c04..f6d677a` |
| 7 | The health monitor and the recovery ladder | `f6d677a..187fc64` |
| 8 | Re-login and death recovery | `187fc64..a412684` |
| 8b | Death loot recovery (owner request) | `a412684..5417ff6` |

| 8c | Bot behaviour settings (owner request) | `5417ff6..7dfe9b4` |

Task 8c also split five files under the 400-line ceiling, three of them beyond the two that were
planned, and one of those is production code: `tasks/api.ts` reached 418 lines, so the settings
store moved out whole into `web/src/tasks/settings.ts`. The splits were verified as pure moves by
comparing test titles byte for byte and reconciling assertion counts (recovery 58 = 30 + 28, api
112 = 68 + 44, workerHost 68 = 40 + 28).

**What is verified, and what is not.** At `7dfe9b4`: `npm run typecheck`, `npm run lint` and
`npx vitest run` are green in `web/` (1 092 tests across 106 files), and both
`bun scripts/gen/atlas.ts --check` and `bun scripts/gen/collision.ts --check` report the generated
data current when run **from the repo root** (they exit 0 from the wrong directory, which is a
false green worth knowing about). **`npm run verify` has never been run for this sub-project.** No
Playwright spec has been run, no stack has been brought up, and no line of this work has been
exercised against a live engine. That is Task 14's entire job and it is the largest remaining
risk: every claim about walking, finding, dying and looting rests on unit tests against fakes.

**Two follow-ups deliberately not taken**, both surfaced by Task 8c's review and both too broad
for the round they were found in:

- **`onDeath: 'pause'` ends on `pause-stuck`**, so `runBanner.ts:202` fires an *error-toned* toast
  reading `Stuck on recover:death. Open Tasks to see why.` at a player who chose "Pause and wait
  for me". Nothing malfunctions and the run is resumable, but the wording and the tone are both
  wrong. A `PauseReason` of its own touches `types.ts`, both `runner.pause` call sites and three
  renderers.
- **The death recovery's arm has three exits that each have to remember the logout packet.** It
  reads correctly today and is covered from both sides, but it is the shape that grows a fourth
  exit later; collapsing it into one `finish(ok)` that consults the policy once would remove the
  class of mistake. Task 8c's fix round had already touched that file twice.

**The working tree carries four things that are not this sub-project's** and must not be staged:
`deploy/lightsail/cloudflared.yml` (modified), two modified files under `docs/screenshots/`, an
untracked `CLAUDE.md`, and an untracked `docs/design/` directory holding a panel UI brief and
screenshots from other work.

---

## 2. How to work

Same as the previous handoff: proceed autonomously, one sub-project at a time, rulings rather than
stalls, and only four things stop you (an irreversible or destructive operation, a
security-sensitive action, a side effect outside the repo that norms say you ask about first, and
a plan so broken that every path forward is a guess).

Per remaining task: dispatch a fresh implementer with the task brief, review the diff with a fresh
reviewer, fix rounds until clean, then the next task. Start a new ledger - the old one is gone.
Model tiers: Opus for architecture, concurrency, lifecycle and the final whole-branch review;
Sonnet for scoped work and small fix-diff re-reviews. Always name the model explicitly.

**The one process change worth carrying forward:** every task in this sub-project that found a
real bug found it by *mutating the implementation and watching the test fail*, and three tasks
found their own new tests to be vacuous that way. Require a mutation-to-test table from every
implementer and every fix round, and treat a test whose mutation still passes as not a test.

---

## 3. The remaining tasks

Each entry gives the first concrete step, because that is where a fresh session wastes the most
time. The plan holds the full text, the interfaces and the code.

### Task 9 - per-script toggles

Enable and disable each script, per account, enforced in `TasksApi.run` so the Run button, the
Marketplace, Playwright and the SP4c relay are all refused identically. **First step: write the
`scriptToggles` store**, which is a copy of `web/src/plugins/settings.ts`'s shape - same debounce,
same key layout, same load precedence. The Firestore rule mirrors the `plugins` rule.

Task 2's `fanOut` is in `router.ts` and is what a toggle change uses to reach every open tab;
Task 8c may already have widened it for settings.

### Task 10 - the live run, in the banner and the card

`RunStatus` gains `target`, `health` and `xpPerHour`, and the banner gains a collapsible detail
line and a health pip. **Ruling already made: those three fields go on `RunStatus` and
`WorkerStatus`, NOT on `RunStatusLite`** - the runner produces `RunStatusLite` and cannot see the
monitor or the trace; the Worker fills them in `postStatus`.

### Task 11 - run history, the report, and export

History keeps its IndexedDB store and changes its cap policy to 200 summaries with full traces for
the newest 50, and a run report renders before the raw trace. **First step: the schema-2
migration, which must not drop a single summary** - the migration is a read-time default, not a
rewrite, because rewriting 200 rows inside an upgrade transaction is where this kind of change
goes wrong.

`RunSummary` already gains `failReason`, `itemsDelta`, `tilesTravelled`, `recoveries` and
`characterName` from Tasks 7 and 8; check what is already there before adding.

### Task 12 - the three library scripts, upgraded

`chop-and-drop`, `net-fish-and-drop` and `mine-and-drop` stop hardcoding "the nearest thing in the
current snapshot" and use `c.find` and `c.travel`. **The trap: `web/src/tasks/library/index.ts`
carries a `HELPERS` string inlined into every fork seed, and `librarySource.test.ts` compiles each
seed and compares.** Do not add a new shared import to a library script without adding the helper
to both `loopHelpers.ts` and that string in the same commit.

### Task 13 - the Tutorial Island script

Eight stage modules, a generated step list, and the script itself. **First step: generate
`steps.ts`** from `engine/content/scripts/tutorial/scripts/tut_chatbox_steps.rs2` - the plan
carries the real 75-title list extracted from the pinned clone, three of which are empty strings,
which is why the script matches on `tutorial.title`, then `flashingTab`, then `hint`, then
`dialog.isOpen`, in that order.

Two things measured during this sub-project that this task depends on:
- **Tutorial Island has no tree cluster in the atlas** - `newbietree` carries no `category` field,
  so `locKind` returns null for it. But `matchesKind` reads the name and op the client publishes
  and finds it, so `find.nearest('tree')` works through the **scene layer**. The scene layer is
  strictly wider than the atlas, by design, and this is the case that proves it matters.
- The route code path in `c.travel` is exercised by tests only: the shipped atlas has **zero**
  routes, and Task 13 is what adds them (the mine ladder and the bank ladder as `interact`
  waypoints). An actual level transition through a route is untested anywhere.

### Task 14 - the real-stack e2e

Four Playwright specs on tick budgets, a seeding harness, and the first time any of this runs
against a live engine. **First step, before writing a single test: prove the seeding path.** Bring
the stack up with `-Prod -DevStaff`, log a guest in, and run
`window.idlescape.tasks.dispatch({ type: 'say', message: '::give bronze_axe 1', reason: 'test' })`
from the console. If the axe does not appear, nothing else in the task can work.

Everything this task needs to know about seeding is in section 5 below.

### Task 15 - reconcile the spec with what shipped

Not paperwork. SP4c inherits from this spec, and it currently describes a design that differs from
the build in at least eleven places, all listed in section 4. Fold each ruling into the spec **in
its own voice**, fixing the sentence a ruling makes wrong rather than leaving a correction beside
a contradiction, and add a section 12, "What SP4b actually built", modelled on the SP8b spec's -
that is the section the next sub-project will read.

---

## 4. Every ruling made, and what it costs if wrong

These were condensed from the workspace ledger, which was git-ignored and therefore never reached a
fresh clone. That ledger is now promoted to
`docs/superpowers/ledgers/2026-09-06-sp4b-bot-expansion.md`, which carries these twenty-seven
rulings and the tasks 9 to 15 rulings beside them. R1 to R27 are kept here as written.

**R1. Collision is a per-tile walkability bitset and walls are not in it.** A wall blocks a tile
edge, which one bit per tile cannot express, and the 1 MB budget is sized for exactly one bit per
tile per level. Openable walls become door rows instead. *Cost:* a global path may cut across a
building wall; bounded, because every leg is handed to `Client.walkTo`, which routes with the
client's own scene collision, and `travel.to` re-plans once then fails `unreachable`.

**R2. The generators live half in `web/src/data/gen` (pure, unit-tested) and half in
`scripts/gen` (file IO).** `kinds.ts` and `collisionFile.ts` are deliberately shared with the
shell; the other four are generator-only. *Cost:* the IO half is covered only by the `--check`
gate in `scripts/build.ps1`.

**R3. Cancel is a Worker-to-main message, not an RPC call.** An RPC would be rejected by the
`rpc.rejectAll` that follows it one line later. No main-to-worker cancel exists, because `pause`
and `stop` already reach the Worker and run the same path. *Cost:* a future main-thread cancel
that goes through neither needs one more message.

**R4. E2E seeding uses the engine's `::` cheat commands, not dev routes.** There are no dev
routes; the only management routes the engine registers are the owner-bank ones. *Cost:* none in
production - `loadIdlescapeConfig` forces `devStaffLevel` to 0 whenever `node.production` is true.

**R5. `atlas.json` and `collision.bin` ship as Vite `?url` assets.** `web/public/` is not an
option: the front server routes only `/assets/*` from `web/dist`.

**R6. Fishing spots are identified by npc config, not by an id suffix.** Only 35 ids match the
`<level>_<mx>_<mz>_*fish` shape the spec describes, four of them contest spots.

**R7. The pathfinder's BFS window is the query's bounding box padded by 128 tiles, capped at
1024x1024**, not the spec's fixed 2048x2048. *Cost, corrected during Task 4:* a query whose `|dx|`
or `|dz|` reaches **896** (`MAX_SPAN - PAD`) returns `[]`, not a partial path. Harmless while
`travel.to` splits legs at 52 tiles.

**R8. Per-kind cluster radii** (tree 32, rock 16, fire 16, everything else 6) replace the spec's
single 6-tile radius, which produced an 825 KB atlas against a 250 KB owner-approved budget. The
spec's own named fallback (per-region cluster files) was rejected because it changes the loader
contract four tasks are written against. *Cost:* a tree cluster centre can sit up to 46 tiles from
the nearest actual tree, which is why `c.find` re-scans using the cluster's own `r`.

**R9. The bank rule is an exact-name set plus a `Bank`-op arm**, not `name.startsWith('bank ')`,
which matched 218 placements of which 147 were notice boards and tables and put 68 unwalkable
targets in the landmark table.

**R10. `scripts/gen/*.ts` gained its own tsconfig and a build-time typecheck.** It sat outside all
static checking: `web/tsconfig.json` covers only `src/`, lint runs from `web/`, and Bun strips
types without checking them.

**R11. The collision generator's `active` derivation means "a model name that resolves verbatim in
`model.pack`, or any op".** The plan's rule would have marked 259 676 of 311 905 ground-decor
placements as blocking instead of 1 259, walling off puddles and floors map-wide.

**R12. `collision.bin` carries a present mask separate from its payload mask.** Required in
production, not only by a test: `BotSDK.findPath` refuses when the *source* zone is unallocated,
and 34 real squares have an entirely walkable level 0 that would otherwise strand a player
standing on one.

**R13. The BFS refuses to leave loaded squares.** It is the engine's own rule -
`CollisionEngine.get` returns every block bit for an unallocated zone.

**R14. `.gitattributes` gained `*.bin binary`.** `collision.bin`'s first NUL is at offset 5 and it
holds 368 `0x0A` bytes, so only git's NUL heuristic was preventing CRLF mangling.

**R15. `MAX_LEG_TILES` is 52, not 60.** The constant's own comment derives the built scene's
52-tile half-width, and a 60-tile target lands outside the scene `Client.walkTo` clamps to. The
spec's "at most 60" is satisfied literally.

**R16. `routeFor` honours `r.from` and `r.level`, not only `r.to`,** with `ROUTE_START_TILES = 52`
as the bound on how far from a route's start the player may stand. *Cost:* a route whose start is
further than one scene from where scripts stand is silently ignored in favour of a straight plan.
Revisit when Task 13 authors real routes.

**R17. Arrival checks the level, and measures against the route's last walk waypoint when a route
was followed.** Without the first, a route interact that clicks but does not transition reports
success on the wrong plane; without the second, every route is obliged to end exactly on its
landmark tile.

**R18. `atlas.ts`'s string variant comparison is case-insensitive,** matching what `types.ts`
documents, rather than the doc being corrected. A script passing `'Oaktree'` matched the scene and
silently missed every cluster.

**R19. The ladder counts occurrences as well as attempts,** with a per-condition escalation target
(`death` to terminal at the second, `no-progress` to `pause-stuck` at the second and terminal at
the third). Keyed on attempts alone, a wedged run re-scanned and walked home every 90 seconds
forever, never pausing and never failing, because a successful recovery clears the attempt count
and walking to the anchor while standing on it always succeeds.

**R20. `onDeath: 'fail'` jumps straight to terminal on the first death.** Skipping the re-anchor
rung is not enough - the next line returns `pause-stuck`, which pauses rather than ends.

**R21. `out-of-supplies` means "reaching zero", not "absent".** As written, a script declaring
`consumes` and starting with an empty inventory failed its own run unrecoverably on the first
snapshot.

**R22. The `logout` stop was removed from `wire.ts`.** A dropped connection reaches
`Client.logout()` on two of `lostCon()`'s three exits, and a server kick emits `logout` too, so
the stop killed the run exactly when the re-login recovery was needed. The three cases it covered
are each covered better: `api.dispose()` for a shell-initiated close, the human-input pause for a
player clicking logout, and the ladder for everything else.

**R23. `generatedAt` was removed from the generated atlas.** It made the drift gate fail every
time UTC rolled over, which fails `scripts/build.ps1` and therefore `verify.ps1`. `contentSha` is
what tracks the content. *Deviates from the `Atlas` type in spec section 5.*

**R24. The death tile is captured when the death fires, immediately after the once-per-occurrence
guard.** `isDeath` returns true on `memory.lifeChanged`, which is recorded on the **respawn**
snapshot - alive, at Lumbridge, with `lastAliveAt` already moved - so capturing before the guard
lets the last write win with the respawn point.

**R25. `DEATH_TIMEOUT_MS = RESPAWN_MS + LOOT_WINDOW_MS + ANCHOR_WALK_MS` (300 s).** The loot
window is absolute from the moment of death, so a long loot walk left the anchor walk about 60 s
of the 120 s `travel` defaults to; the runner then aborted the task and the recovery settled
**failed** - the one route by which the loot detour could turn a survivable death into a failed
run.

**R26. `WorkerHost.restart(behaviour)` takes the current settings, and the argument is required.**
The ruling is that behaviour settings are read once at run start, and a restart *is* a run start:
it mints a new `runId` and re-seeds status. Replaying the stored request would have meant a run
started at 14:00 and restarted at 18:00 obeying the 14:00 settings - not "the run in flight keeps
its answers" but a new run inheriting a dead one's. The user-script restart path already went back
through `run()`, so without this the two restart paths disagreed with each other.

**R27. The `onDeath` setting offers all seven `DeathBehaviour` values, including `fail` ("Stop the
run").** The plan's settings table listed seven and its code block listed six; the table was the
intent. A script may declare `fail`, so a player must be able to choose it.

**Parked, deliberately, with reasons:** the `travel` "re-plan" that re-plans nothing (it is a
doubled retry budget with a misleading name; the bound is what matters and is tight at four
walks); `stalled`/`replanned` being travel-global rather than per-waypoint; an abort landing on the
final leg of a walk that arrived reporting `aborted`; the double-start guard on the panel's two
intervals being verified by reading rather than by a test; `localTransport`'s `waiting`-set
no-leak on the normal-reply path being structurally untestable; and one guard in `healthMonitor`
that is unreachable today and documented as uncovered rather than claimed as covered.

---

## 5. Facts measured during this sub-project

Each of these cost real time to establish and is not written down anywhere else.

**The engine's death mechanics** (`engine/content/scripts/player/scripts/death.rs2`,
`[proc,player_death_lose_items]`): the three priciest items are kept, four with the Protect Item
prayer, none if skulled. Everything else in `inv` and `worn` drops **at the death tile**, plus
bones. Items whose config carries `destroy_drop` or `destroy_death` are deleted and are never
recoverable. `^lootdrop_duration = 200` ticks = **120 seconds**, covering respawn, travel and
pickup together. The respawn is fixed at `p_teleport(map_findsquare(0_50_50_21_18, ...))`, absolute
tile **(3221, 3218)** in Lumbridge. Dropped objs are private to their owner until
`Zone.revealObj` publishes them, so the bot sees its own loot immediately.

**Staff keep their items only on a live world.** `player_death_lose_items` opens with
`if (staffmodlevel > 1 & map_live = true) { return; }`, and `map_live` is
`Environment.node.production` (`engine/server/src/engine/script/handlers/ServerOps.ts:24`), which
is **false** in the dev and e2e stacks. So a `-DevStaff` character **does** drop its items, which
is what makes an e2e for the loot recovery possible. There is a `[debugproc,death]` cheat in
`cheat_other.rs2` for triggering one.

**E2E seeding.** `::give <item> [n]`, `::setstat <skill> <level>` and
`::tele <level,mx,mz,lx,lz>` all require `staffModLevel >= 4` on a non-production node. The
vendored client routes any `::`-prefixed message to `ClientProt.CLIENT_CHEAT` rather than public
chat (`client/src/client/Client.ts:1883`), so `bot.say('::give ...')` is the seeding path.
`scripts/start-stack.ps1` needs a `-DevStaff` switch that sets `IDLESCAPE_DEV_STAFF=4` regardless
of `-Prod`, and `verify.ps1` must pass it.

**The `.jm2` format**, verified against the engine's own packer
(`engine/server/tools/pack/map/Pack.js`): `<level> <localX> <localZ>: <payload>`; MAP tokens are
`h`/`o`/`f`/`u` and any may be absent; **an omitted loc shape defaults to 10 and an omitted angle
to 0**; a tile may carry more than one loc or npc; absolute tile is `(mx << 6) + localX`.
`engine/content/maps` holds 487 files of which **483** are `.jm2` - the spec's "487 map squares"
is a directory count.

**The atlas as built:** 16 182 placements (not the spec's 32 186) become 1 520 clusters and 40
landmarks, 178 KB raw and 25 KB gzipped. `collision.bin` is 483 squares, 521 KB raw and 144 KB
gzipped, with 2 653 doors.

**`KIND_META[kind].op` is intent, not a clickable option, for four kinds.** Measured over all 4 671
loc configs: fires 0 of 10 carry any op, anvils 0 of 3, ranges 1 of 8, furnaces 5 of 9, and altars
split 13 `Craft-rune` / 6 `Pray-at`. Only trees (35 of 35) and rocks (52 of 52) publish one
universally, so those two match on the op and the rest match on the content name. Running
`matchesKind` against `locKind` over every config gives **zero false negatives for every kind**,
which is the property the post-atlas re-scan depends on.

**The scene and the atlas use different namespaces.** A cluster's `variant` is the content debug
name (`oaktree`); the scene reports the display name (`Oak`). The post-atlas re-scan therefore
drops the variant filter, and `FoundTarget.name` flips namespace between the two - do not key on
it.

---

## 6. What this codebase does to you, part two

The previous handoff's section 4 still applies in full. This sub-project added these.

**A fake more permissive than the real collaborator hides the branch you are testing.** Six
instances, three of them found by implementers mutating their own brand-new tests. The shapes: a
fake `peek()` that returned data unconditionally, so the `load()` branch behind
`peek() ?? await load()` was dead; a fake reporting one tile per hop, so a walking budget never
fired; a fixture holding an item the predicate was meant to see it lose; a post-logout fixture
with `worldX: 0`, a state production never produces. **Prefer the real collaborator over a fake**
wherever you can construct one - Task 6 deleted its atlas fake for the real loader over a stub
`fetch` and converted three assertions-about-a-fake into assertions about shipped code.

**An assertion against an imported constant cannot pin that constant.** `expect(leg).toBeLessThanOrEqual(MAX_LEG_TILES)` passes for any value of `MAX_LEG_TILES`. Assert against a literal.

**A fixture where right and wrong are the same number proves nothing.** A region-packing test at
(3222, 3218) passes under an x/z transposition because both coordinates are in square 50. A
level-guard test where the wrong-level candidate is also the furthest passes with the guard
deleted.

**Vitest's config can silently exclude a whole suite.** `web/vitest.config.ts` excluded
`src/vendor/**`, so Task 4's new pathfinder test would never have run at all.

**`web/tsconfig.json` excludes `src/**/*.test.ts` and eslint is not type-aware**, so nothing
mechanical catches a test fake missing a member of an interface you just widened. Find them by
hand: `grep` for `as unknown as Transport`, `: Transport =` and `as Transport`.

**`fileURLToPath(new URL('...', import.meta.url))` throws under vitest**, because Vite rewrites
that exact pattern into an asset URL. Use `join(dirname(fileURLToPath(import.meta.url)), ...)`.

**A timestamp in generated output makes a drift gate useless.** It fails on the calendar rather
than on the content, and it stays failed.

**The 400-line ceiling bites mid-task.** `worker.ts` hit 401 with the plan's code written
verbatim, and three test files hit the ceiling as tasks added to them. Extract along a seam that
means something - `worker.ts` split into `runContext.ts` (Worker-lifetime state), `runHealth.ts`
(the monitor wiring) and `workerReport.ts` (pure host-facing data) - rather than trimming comments.
Watch `api.test.ts`, which was 574 lines before this sub-project began.

---

## 7. Constraints that do not move

Everything in the previous handoff's section 5, unchanged: strict TypeScript, no new `as any`,
files under 400 lines including test files, `types.ts` per package, `.env.example` per process,
conventional commits, upstream clones never edited, vendored code under `vendor/` with its licence
and a `PATCHES.md`, `engine/` and `engine/content` pinned and never edited, the client fork edited
only through numbered patches (still at **28** - this sub-project added `cancelAll` under
`client/src/hooks/`, which is ours and is not a numbered patch), no Jagex art vendored, and the
commit trailers.

Add to that: **no em dashes in new prose** (source comments, docs, UI copy), and
`bun scripts/gen/atlas.ts --check` plus `bun scripts/gen/collision.ts --check` must both stay green
- they run inside `scripts/build.ps1` and therefore inside `verify.ps1`.

---

## 8. Done means

For SP4b: Tasks 8c through 15 implemented and reviewed, the final whole-branch review returning
ship, one fix wave, **`npm run verify` green end to end** - which for this sub-project means the
first Playwright run any of this work has ever had - and the spec reconciled with what shipped.

Then the sequence in `2026-09-06-sprint-handoff.md` continues: SP8c, SP9, SP10, SP4c, and SP5 is
still unstarted and still wanted.
