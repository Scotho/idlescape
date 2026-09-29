# Sprint control board - Dragon Slayer

Owner-facing board for the autonomous run of `2026-09-07-sprint-dragon-slayer.md`. Maintained by
the orchestrating session's manager cron is overwritten by other sessions) (every ten minutes) and by hand when a workflow completes.
Times are local (ADT). Executive decisions live in `decisions.md` beside this file; this board only
points at them.

## Operating policy

- **Concurrency.** At most four workflows run at once (raised from three at 03:05 because read-only runs finish in their review phases while the next block waits). The sprint entry being implemented
  (today: SP4b) always keeps its slot. Read-only workflows (research, planning, auditing,
  spec writing) may run beside it. Only one workflow that edits code under `web/`, `server/`,
  `client/`, `engine-custom/` or `content-custom/` runs at a time, because they share the
  working tree and the branch.
- **Usage.** The signal is the per-session file the statusline wrapper writes on every prompt,
  `%TEMP%/claude-usage-6cfc8eb7-fa0f-4398-8701-64d1005b1577.json` (decision D23; the shared
  `%TEMP%/claude-usage.json` is overwritten by other sessions on this machine and is not trusted).
  Fields: `five_hour.used_pct` and `resets_at`, `seven_day.used_pct` and `resets_at`,
  `context_pct`, `cost_usd`, `session_id`; unix seconds. `npx ccusage blocks --active --json` gives
  the machine-wide burn rate and cost per hour. Rules: launch new workflows only while the five-hour window is
  under 80 percent and the seven-day window under 85 percent. Between 80 and 95 percent of the
  five-hour window, keep what is running, launch nothing, and schedule a one-shot resume cron
  three minutes after `five_hour.resets_at`. At 95 percent or more, write the Handoff section
  (what is running, the resume command for each) and wait for the reset. At 90 percent of the
  seven-day window, stop launching and tell the owner: that cap is the expensive one. When the
  session's remaining context drops under 1.5M tokens, nothing new is launched and the Handoff
  section is written for the next session. When a workflow dies on an API error or a rate
  limit, it is resumed with `resumeFromRunId` once after the reset, then parked here for the owner.
- **Gates.** Nothing in the "Awaiting owner authorization" section is started by a cron. It
  waits for a sentence from the owner in the session.
- **Decisions.** Any ruling a cron or a workflow makes that the owner might want to revisit is
  appended to `decisions.md` with its reversibility; the board's "Decisions since last update"
  section names the new ids.
- **Status updates.** A completed sprint entry, a completed large block (a plan, a spec set, an
  audit), or a block on authorization produces a message in the session and a push notification.
  Routine ticks produce one line.

## Running

| Run id | What | Started | Signal of completion |
|---|---|---|---|

Task output files live under
`%USERPROFILE%\AppData\Local\Temp\claude\C--projects-osrs-test\68825220-402f-41bb-8721-729cd09dac4d\tasks\`.
The file exists (empty) from launch; completion is when it is non-empty and holds the JSON with
`"summary"` and `"result"`. Manager tick 15:08 (2026-09-09): SPRINT PAUSED per D137 and D138 (board committed at d47b08a). Entry 5 run wf_26986b0b-af7 paused after task 9 at 3e633c7, tree clean; no workflow running; the testing site on 63f4c76 since 08:44. Usage 79 percent five-hour (reset 17:20 ADT), 16 percent seven-day. Nothing launches until the owner says so.
Journals live under
`%USERPROFILE%\.claude\projects\C--projects-osrs-test\6cfc8eb7-fa0f-4398-8701-64d1005b1577\subagents\workflows\<run id>\journal.jsonl`.

## Completed

| Run id | What | Finished | Outcome |
|---|---|---|---|
| `wf_26986b0b-af7` | Entry 5 execution (the script API reference and the standard), tasks 1 to 9 of 17 | 2026-09-09 15:07 PAUSED | Tasks 1 to 9 clean (one fix round each except task 8, approved clean) at 3e633c7; D136 recorded. Task 10 (the traversal and api-index.json) implementer was interrupted at 14:51 while the owner paused the sprint (D137, D138); its partial files were saved to the scratchpad and the tree restored to HEAD 3e633c7. The run is paused, not finished: see Handoff for the resume command. |
| `wf_4b668a79-187` | Entry 5 planning (the script API reference and the standard) | 2026-09-09 09:47 | Plan `docs/superpowers/plans/2026-09-09-script-api-reference.md` committed (9dd4494, review applied at 90c93e6; 17 tasks, 3,834 lines; 47 findings from three lenses, 38 applied, 1 disputed with evidence, 1 applied differently). Cross-entry rulings D132 to D135 (index schemaVersion 1 as the contract with entry 6 and SP4c; target_not_found spelling entry 7 closes; apiVersion and the shim table are entry 7 via P18; S5 predicate arm left to entry 7 fluent query). |
| `wf_0e94a740-4da` | Shell v2 block B (entry 4, tasks 11-21) and the entry 4 landing | 2026-09-09 08:41 | Tasks 11-21 clean (one fix round each), fable whole-entry review at 86c799d (0 critical, 3 important, 5 minor; 5 of 6 mutations killed; D131), fix wave 470c42f..18d7e17 re-reviewed clean, verify.ps1 green ten of ten at 18d7e17 (logs/verify-shellv2-final.log, Playwright 36 passed), ledger promoted at 62cd355 (docs/superpowers/ledgers/2026-09-07-shell-v2.md), entry 4 closed at b2b4ca7. The run hit the 05:56 session limit after the fix wave commits and was resumed from its journal at 07:54. |
| `wf_8441543d-1e8` | Shell v2 block A (entry 4, tasks 1-10) | 2026-09-08 16:02 | Tasks 1-10 clean (one fix round each, none a second), 78 rulings in the ledger, verify.ps1 green ten of ten at 31c63d4 (one red e2e in the first run, a canvas click off the viewport, fixed by the checkpoint agent), ledger checkpoint written, sprint row 4 set to block A done (78d2cb0). Block B inherits the family modules, the icon type, the strip builder and the cascade harness; files near the ceiling that block B opens are named in the checkpoint. 41 agents, 6.3M subagent tokens, 7h53m. |
| `wf_7ece2e35-91a` | Entry 3 execution (overlay, pack and client-fork gates), ten tasks | 2026-09-08 08:08 | Tasks 1-10 clean (one fix round each), whole-branch review (fable) verdict fix with three important and four minor findings (three gates still passing vacuously one edit away), all seven closed in one fix wave (2b1fe3f, re-review clean), verify.ps1 green ten of ten at c391c81, ledger promoted (72957b9) to `docs/superpowers/ledgers/2026-09-07-overlay-pack-and-client-fork-gates.md`, sprint row 3 closed (3695133). C22, C23, C24 closed with residue named (ledger section 6: header-only vendor files unpinned, verify ends with an unminified client/out, six allocated ids conditional until entries 10 and 11 append, map.pack per D116). 44 agents, 5.6M subagent tokens, 6h15m. |
| `wf_5e436c89-653` | Time candy planning (entry 10; queue item 6) | 2026-09-08 03:06 | Plan `docs/superpowers/plans/2026-09-08-time-candy.md` committed (2249455, review applied at 018babf; 9 tasks, 4,339 lines; 27 review findings applied, one fix direction disputed with evidence). D8 settled: D120 (1/50 medium drop as its own roll) and D121 (a 0 XP hour still seals); D122 to D126 (alchemy exit, whole-file OpHeldHandler overlay, IDLESCAPE_CANDY_HOUR_MS config, lazy seal read by afterCycle, verify runs the browser spec against an eight second hour). Executes after entry 3 and the entries before it in sprint order. Pending docs commit: sprint row 10 state and the board's decisions pointer (D126). |
| `wf_6a8ca944-6df` | SP8c planning (entry 8, the game client's bank tabs; queue item 6) | 2026-09-08 00:50 | Plan `docs/superpowers/plans/2026-09-07-sp8c-client-bank-tabs.md` committed (496794b, review applied at be1069e; 12 tasks, 4,009 lines; 30 review findings, all applied, four differently with evidence; D117 to D119 appended: interface id allocation corrected to 21 components, a tab is two components with a comparator-cleared icon, the client compacts a tab while the web pads). Executes after entry 3 (the client-fork gate) as sprint entry 8. |
| `wf_544fb981-35a` | Entry 3 planning (overlay, pack and client-fork gates) | 2026-09-08 00:24 | Plan `docs/superpowers/plans/2026-09-07-overlay-pack-and-client-fork-gates.md` committed (a4815ba, review applied at 296edae; 10 tasks, 3,052 lines, rulings R1 to R16; 27 review findings, 26 applied, 1 disputed; D115 and D116 appended). The orchestrator's two conditions hold: the pin is a table in code read by the test (R3, R4) and the patch runner parses a typed row grammar in PATCHES.md (R6, R7). |
| `wf_04f27c1e-828` | Entry 2 execution (release integrity and account isolation), twelve tasks | 2026-09-07 22:58 | Tasks 1-12 clean (task 1 needed no fix round, tasks 2-12 one each, none a second), whole-branch review (fable) clean with four documentation or pre-existing findings closed by one fix wave (f945e28), verify.ps1 green ten of ten at f945e28, ledger promoted to `docs/superpowers/ledgers/2026-09-07-release-integrity-and-account-isolation.md`, sprint row 2 closed (aa121ee). C07, C09, C10, C16, C17, C18 closed with residue named; nothing released (G5); no image ever built here (Docker absent). 48 agents, 1.78M subagent tokens, 1h44m of run time after the 21:21 resume plus 4h35m before the restart. |
| `wf_070ecd5c-855` | Camera, frame and renderer spec | 2026-09-07 07:30 | `2026-09-07-camera-frame-and-renderer-design.md` approved under D11 and D41; 36 review findings applied (three criticals changed the design); the spike's numbers folded in (D57); first numbered patch outside Client.ts widens the patch convention (D56); fps target defaults to 50 against the owner's stated preference (R17, reversible) |
| `wf_3e688a8f-a61` | Battlebots 2 spec | 2026-09-07 07:20 | `2026-09-07-battlebots2-puppets-queue-replays-design.md` (1,561 lines) approved under D11 and D39; 34 rulings, 27 distinct review findings applied, decisions D43 to D55 appended; three plans in order per its section 17; a proof-of-life gate on the headless LiteClient with SP5 as fallback (D46); the default-bot sparring half of round three deferred with a cost (D55) |
| `wf_042d036c-409` | Entry 2 plan | 2026-09-07 16:45 | `docs/superpowers/plans/2026-09-07-release-integrity-and-account-isolation.md`: 12 tasks, 4,109 lines, committed (f0ac491, 55475f2); 27 review findings applied, none disputed; decisions D92 to D101 |
| `wf_1d5ea9a5-f03` | SP4b landing | 2026-09-07 15:35 | Gate closed at 4440115 (the snippet waits for the Guide to be in view; root cause: loginAsGuest returns on the first world publication before npcs arrive) and verify.ps1 green end to end; five docs commits landed everything that waited and promoted the SP4b ledger; three deploy commits (engine overlay and idlescape env in the image, the tunnel ingress, the release dirty-file warning) reviewed clean after one fix round (D73 to D75); the shell v2 plan reconciled against HEAD (7239ab9, 7071d1d; D88 menu family classes only, D89 code maps promoted to docs/superpowers/maps/) |
| `wf_cedf5b67-3a5` | Library catalogue and task list spec (sprint 3 entries 6 and 7) | 2026-09-07 15:00 | `2026-09-07-library-catalog-and-task-list-design.md` approved under D11 and D61: 19 catalogue scripts in tiers with a shared settings model (what, where, how long, disposal, restock, thresholds), the task list with a declared stop model and on-failure policy, script stats; 37 review findings applied; decisions D62 to D86 |
| `wf_4f2eb589-899` | SP4b finish (tasks 9 to 15, whole-branch review, fix wave, verify) | 2026-09-07 13:15 | 29 agents over 12.3 hours; tasks 9-14 each clean after one fix round; whole-branch review (fable) 1 important, 5 minor, fix wave 6 of 6 addressed; task 15 reconciled the spec; verify.ps1 green at 10:52 and at HEAD except one order-dependent e2e (the un-skipped guide snippet), handed to the landing run |
| `wf_144d5e13-121` | Spec reconciliation and sprint amendment | 2026-09-07 04:45 | Three script specs reconciled and approved under D11 (31 question rulings in D23, C30 trust ruling in D24, cross-review 15 findings applied); sprint document amended to 16 rows with section 7 listing every change (D25, D30, D34 to D36; 588 lines; review 10 findings applied); `2026-09-07-sp3b-hiscores-completion-design.md` written and approved (440 lines); shell v2 plan gained --window and .frame-body under D29 |
| `wf_2c5f5f0b-53d` | Vision and architecture | 2026-09-07 04:00 | `docs/VISION.md`, `docs/ARCHITECTURE.md` (346 lines), `docs/README.md` index, `docs/VERIFICATION.md`, `docs/OPERATIONS.md`, `docs/superpowers/SDD.md`, README front door, CLAUDE.md project section, eight skills under `.claude/skills/idlescape-*`, eight promoted ledgers under `docs/superpowers/ledgers/`, six ledger citations fixed; fresh-agent test 15/20 with nine partials, all nine doc defects fixed (the plugin skill was the main culprit); all uncommitted |
| `wf_f28c29e0-4fc` | Bot API survey and standard spec | 2026-09-07 03:25 | `2026-09-07-script-api-survey-and-standard-design.md`, 2,383 lines: 18 systems plus ours, 45 gaps, twelve-rule standard S1-S12, 20 proposals (10 now, 9 next, 1 later), 34 review findings applied, 12 owner questions with recommendations (ruled in the reconciliation run) |
| `wf_1ae48e4a-117` | Script studio specs | 2026-09-07 03:15 | Spec A `2026-09-07-script-api-docs-design.md` (635 lines) and Spec B `2026-09-07-script-studio-design.md` (1,924 lines), 35 rulings, 39 review findings all applied, 29 owner questions with recommendations (ruled in the reconciliation step under D11); recommended placement entries 3 and 4, after shell v2; editor CodeMirror 6 pinned, Monaco rejected; four named dependencies on entry 2 (tokens, Window family, z-scale, .frame-body stretch), see D22 |
| `wf_748ff432-be0` | Project audit | 2026-09-07 03:00 | `docs/superpowers/specs/2026-09-07-project-audit.md`, 1,883 lines: 34 confirmed tasks (5 P0, 21 P1), five new sprint rows proposed (1a release integrity, 1b account isolation, 1c front door, 3a overlay and pack gates, 10 reconciliation and skills), fold-ins to entries 1, 2, 3, 5, 6, 8; SP4b carry-ins written to its ledger |
| `wf_8927824c-b20` | Shell v2 plan | 2026-09-07 02:30 | `docs/superpowers/plans/2026-09-07-shell-v2.md`, 21 tasks, 5,218 lines, 80 review findings applied; five owner questions (decisions D4) |

## Queue, in order, with prerequisites

1. **Vision and architecture**: LAUNCHED 03:12 as `wf_2c5f5f0b-53d` (see Running). Original brief kept for the record. Prerequisite: the audit
   completes. Inputs: `2026-09-07-project-audit.md` section 4, the shell v2 code maps under
   `.superpowers/sdd/2026-09-07-shell-v2-plan/`, every spec, the sprint handoff conventions.
   Shape: one opus author writes `docs/VISION.md`, `docs/ARCHITECTURE.md`, a project section
   for `CLAUDE.md` (pointing at both, listing the constraints that do not move, the verification
   commands, the never-edited paths and the operating model: full agentic development under the
   owner's high-level direction, rulings not stalls, four stop conditions), a `docs/INDEX.md`
   naming the authority for every subject in one hop, and the skills the audit names as missing
   under `.claude/skills/` (stack bring-up and verify, engine overlay patch with pinned pack ids,
   client patch, adding a plugin or panel, adding a library script, the SDD ledger and handoff
   convention, vendoring an external spec). Then a fresh-agent test: a sonnet agent given only
   those documents answers twenty questions and sketches one small change; an opus grader marks
   each answer against the code; wrong answers go back to the author for one fix round. All
   output stays uncommitted until SP4b's commits stop, then lands as one docs commit.
2. **Spec reconciliation**: LAUNCHED 03:30 as `wf_144d5e13-121` together with item 2b (see Running). Original brief: Prerequisite: the studio
   specs and the survey both complete. One opus agent makes the API docs spec document the
   survey's standard, makes the studio's validator enforce it, resolves conflicts between the
   three drafts, merges their owner questions into one list, rules on each (recorded in
   `decisions.md`), sets Status to "approved by the orchestrator under D11", and proposes one
   sprint placement for the set.
2b. **Sprint amendment**: LAUNCHED with item 2 in `wf_144d5e13-121`. Original brief: Prerequisite:
   items 1 and 2 and the audit. Insert the new rows (the API standard, the API docs and
   quickstart, the Script Studio, the audit's accepted tasks, and SP3b hiscores per D14) at
   the positions their specs argue for, renumber, re-pin nothing in the pack-id table, and commit
   the sprint spec together with the new specs, the audit and the vision docs as docs commits
   once no execution workflow is mid-commit.
3. **SP4b landing**: DONE 15:35 (`wf_1d5ea9a5-f03`). Entry 1 is complete. Original brief (edits the tree). Prerequisite: SP4b completes clean with verify green. Per D35 the landing step also carries the three deploy changes the sprint document now lists under entry 1: the audit C07 fix to the deploy files (engine overlay applied in the image, the four idlescape env vars, the management link), the D15 cloudflared chore commit, and the release.ps1 dirty-deploy warning. The release that applies them stays gated (G5).
   Commit the shell v2 plan, this board, `decisions.md` and the vision docs as docs commits.
   Also the D15 chore commit: `deploy/lightsail/cloudflared.yml` with the README note and the
   `release.ps1` dirty-deploy warning. The two modified screenshots under `docs/screenshots/` stay
   untouched until their owner is known.
   Also in the landing docs commit, the vision run's leftovers: `CREDITS.md` false rows (audit C14), the dead frame-capability stub note in `client/PATCHES.md` (D18), and the "delete the ledger" wording in `2026-09-06-sprint-handoff.md` lines 25 and 228-230 and `plans/2026-09-06-sp4b-bot-expansion.md` line 6097 changed to "promote" (D19).
   Run the "reconcile against HEAD" pass the plan's executor notes call for (one opus agent,
   the ten marked tasks, records what moved). That pass also applies the doors the ideas section
   lists for entry 4: D22's Window family split and the z-scale lane, a Sound section reserved
   beside Display in the config panel, the event shape (kind, character, time, one-line label),
   the co-pilot bar's slot for a rate-derived line, and a menu family (right-click on a character
   tab, first consumer mute) if it fits the overlay or navigation family cheaply; otherwise it
   records that sprint 3 builds it. Update memory.
3a. **Release integrity and account isolation**: DONE 2026-09-07 22:58 (plan `wf_042d036c-409`, execution `wf_04f27c1e-828`; ledger at docs/superpowers/ledgers/2026-09-07-release-integrity-and-account-isolation.md; sprint row 2 closed at aa121ee). Left open by the entry, carried on the sprint: the release gate can now go green but running it is G5; no image has been built on this machine (Docker absent, WSL plus a reboot to install: a side effect outside the repository, G-class); the ownerBank.ts split and api.ts seam the audit proposed under C16 are for entry 18.
3b. **Overlay, pack and client-fork gates** (sprint entry 3): DONE 2026-09-08 08:08 (plan `wf_544fb981-35a`, execution `wf_7ece2e35-91a`; ledger at docs/superpowers/ledgers/2026-09-07-overlay-pack-and-client-fork-gates.md; sprint row 3 closed at 3695133).
4. **Shell v2 execution, block A** (tasks 1-10): DONE 16:02 (`wf_8441543d-1e8`, verify green at 31c63d4, checkpoint 78d2cb0). Same shape as the SP4b workflow: sequential in the main
   tree, opus implementer, opus review, sonnet re-reviews, five-round cap, ledger at
   `.superpowers/sdd/2026-09-07-shell-v2/progress.md`. Decision D4's defaults apply unless the
   owner reverses them.
5. **Shell v2 execution, block B** (tasks 11-21): DONE 2026-09-09 08:41 (`wf_0e94a740-4da`, entry 4 closed at b2b4ca7; see Completed). Entry 4 is complete: 21 tasks, review, fix wave, verify, ledger. Prerequisite: block A
   clean.
6. **SP8c plan and time candy plan** (read-only, may run beside block A or B). SP8c plan DONE 00:50 (`wf_6a8ca944-6df`, be1069e). Time candy plan DONE 03:06 (`wf_5e436c89-653`, 018babf; D120 to D126). Item 6 is complete: both plans written. Prerequisite:
   item 3. Each is a planning workflow in the shell v2 plan's shape (readers, planner, three
   lensed reviewers, fix). Time candy's two author's calls (the 1/50 drop rate; a 0 XP hour still
   seals) are ruled at plan time and recorded in `decisions.md` (decision D8).
7. **Entries 2 onward execution** in sprint order, one execution workflow at a time. Entries 2, 3 and 4 done. Entry 5 plan DONE 09:47 (`wf_4b668a79-187`, 90c93e6). Entry 5 execution PAUSED at 15:07 after task 9 (`wf_26986b0b-af7`; D137, D138; see Handoff). Nothing launches until the owner says so; then entry 6 (Script Studio) and entry 7 (API v2) each plan then execute; entries 8 and 10 already have plans.
8. **Battlebots 2: puppets, queue and replays**: DONE 07:20; the row is **sprint entry 14**, inserted immediately after entry 13 (SP3b) under D39, with old entries 14 to 17 renumbered 15 to 18 (D58). Prerequisite: none for the spec. Brainstorm to a spec per sprint section 6 from docs/ideas/2026-09-07-battlebots-improvements.md round two and decisions D37 to D39: puppets hosted in the player's browser (LiteClient in a Worker, script Worker unchanged), stored setups, server-side queue with loser-dequeued and winner-requeued, win streaks into SP3b's registry, replays and live viewing in a shell v2 window drawn as a schematic first, queue population and end-of-run data additive on the store, limits as ruled (plots bound concurrency, one ranked match per player, same-account pairing refused, puppet pool of two per plot, retention per the spec's section 14). Runs whenever a read-only slot is free.
9. **Draw-distance spike**: DONE 07:02 (appended to the idea file as "Draw-distance spike (2026-09-07)"). Recommendation: the slider moves two constants together (the 25-tile window at client/src/dash3d/World.ts:982-1000 and the per-model far clip at Model.ts:1723), never the 104-tile built scene; range 15 to 50 tiles, default 25, maximum 50; no region-rebuild change (the engine guarantees only 16 tiles of margin); frame cost 1.5x to 2.5x at 50, applied at the next scene rebuild; the 50 fps ceiling is structural (no requestAnimationFrame, one draw per 20 ms), a rAF draw with a fixed-step accumulator makes 60 fps a 1.2x load and camera-only interpolation is near-free. one opus agent reads docs/ideas/2026-09-07-camera-frame-and-renderer.md and the client's scene drawing path, measures what a longer draw distance and a variable frame rate would cost in the software renderer, and reports a recommendation into the idea file. Prerequisite: none; low priority, runs when nothing else needs the slot.
10. **Camera, frame and renderer spec**: DONE 07:30 (`wf_070ecd5c-855`).

11. **Camera spec amendment, Battlebots 2 sparring consistency fix, three stale citations, entry 9 state**: DONE 07:42. Camera spec section 6.6 now carries the sprint 3 fold-in with a which-layer-sees-it table, a precedence table and ruling R19; sprint 3 entry 2's patch half is marked delivered by entry 9; the Battlebots 2 spec's R26, R34 and section 21 say both testing shapes arrive in one deferred task with practice-only first-release play (D59 corrects D55); entry 9's row reads approved (section 7 row 30).

12. **Sprint close and the hand-over to sprint 3** (D60, owner instruction). Prerequisite: every Dragon Slayer row done (rows 1 to 18). Steps: final verify.ps1 at HEAD; confirm every spec carries its "what actually shipped" section and every ledger is promoted under docs/superpowers/ledgers/; set the sprint document's Status to closed with a closing section (what shipped, what was deferred and where it went); commit; merge `sprint/dragon-slayer` into `develop` (fast-forward if possible, otherwise a merge commit with the sprint name; no remote exists, nothing is pushed); cut `sprint/legends-quest` from `develop`; copy this board to a fresh board for sprint 3 with its rows as the queue (each row: brainstorm to spec, plan, execute); update memory; then kick off sprint 3's first row. Merging to develop is not gated (the sprint spec orders it and D60 confirms); a release to the live host stays gated (G5).
## Awaiting owner authorization

Owner's standing instruction (2026-09-07 03:05): "you do not need my permission if confident
proceeding. Only gated on clear blockers." So the orchestrator rules on scope, sprint rows,
constraint edits and product calls itself, records each in `decisions.md`, and gates only these:

| Gate | What needs a yes | Why it is gated |
|---|---|---|
| G5 | OPENED for the live Lightsail host on 2026-09-08 16:52 (D127): the manager releases with `deploy/lightsail/release.ps1 -Force` at every verify-green landing point, never mid-task. Still gated: any change to cloud Firebase; any push to a remote other than the local repository | Side effects outside the repo that the sprint handoff keeps owner-gated ("nothing touches the live Lightsail host ... until the owner asks"). Merging `sprint/dragon-slayer` into `develop` when the sprint closes is NOT gated: the sprint spec itself orders it. |
| G6 | Deleting player data, `.sav` files, owner-bank JSON, or an SDD ledger before its sub-project's final review is clean | Irreversible |
| G7 | Anything an agent cannot make confident: a plan so broken every path is a guess, a security-sensitive change with no precedent in the repo, or spending outside the account's existing plan | The handoff's remaining stop conditions |

Former gates G1 to G4 were converted to rulings D11 to D14 on the owner's instruction.

## Ideas to keep doors open for

The owner records ideas under `docs/ideas/` (2026-09-07: battlebots improvements; a script recorder and block editor). Each idea file ends with "doors to leave open now". When these entries are planned or briefed, carry those lines into the brief:

- Entry 11 (battlebots), per the idea file's round two and D37 to D39: the match record keeps its schema version AND gains a tick log (both fighters' positions and HP per tick from the match clock that already samples HP, plus the two run traces in the SP4b export shape); the store carries setup fields (script source and version, kit id, stat snapshot, queued-at); puppet-to-owner mapping is a store column, not RuneScript state; the web panel stubs a "Queue" action even if the pad ships; the ranked queue pad (R13) is deferred out of entry 11 (D38).
- Entry 6 (Script Studio) plan: the user script document tolerates a nullable `blocks` field.
- Entry 7 (API v2): the intent-shaped verbs keep names a recorder can emit verbatim.
- The next client hooks patch keeps menu resolution in one place so an input tap can be added later.
- Round three (peer session osrs-test-f1, 06:18; verified on disk 06:26, idea file lines 170 onward): private untracked matches against shipped default bots and past opponents go into the Battlebots 2 spec, no entry 11 change; a rematch against a past opponent is the first feature needing SP5's Bun-hosted half, until then it uses the opponent's kit and stats with a default script.
- Recorder round two (same source): combat thresholds (eat, prayer potion, teleport, bank-and-return) are manifest fields extending `health` and `hardStop`, so entry 7's P12 is shaped as a reaction per threshold; P16 `bank.ensure` is promoted from "later" into entry 7 (restock-and-return is a stated requirement); a shared `Loadout` type (starting inventory plus worn gear) is used by entry 11's kits, entry 7's `bank.ensure` and the studio's requirements; the input tap is a client patch at `Client.doAction` and lands with entry 8's patch batch.
- Sprint 3, "Legends Quest" (`docs/superpowers/specs/2026-09-07-sprint-legends-quest.md`, written by the owner's ideas session, opens when Dragon Slayer closes; its section 4 names these doors on Dragon Slayer rows): entries 7 and 11 share one `Loadout` shape (already above); entry 9's key routing is extensible by a later patch with function keys and Escape, and states a precedence for typing mode versus Escape-closes-interface; entry 4's config panel reserves a Sound section beside Display, its event feed's event shape carries kind, character, time and a one-line label, and its co-pilot bar keeps a slot for a rate-derived line; entry 16's gateway relay is shaped so a run trace can be sent as one payload. Two owner details from sprint 3's Sound entry that entry 4 owns the surfaces for: mute must work on the login screen before any character is chosen, and a right-click menu on a character tab (`web/src/frame/characterTabs.ts`) carries mute, so the shell v2 plan should add a menu family if it is cheap (carry into the reconcile-against-HEAD pass; the plan's Task 7 or a small new task).
- Sprint 3 fold-ins (D42, owner: "if anything can logically fit in, feel free to work it in or leave it in sprint 3"): the `Loadout` type is defined in entry 7 and adopted by entry 11; function keys switching sidebar tabs and Escape closing the open interface fold into entry 9's key-routing patch (queue item 11 amends the camera spec once it lands); the menu family for mute is attempted in the shell v2 reconcile pass. Everything else stays in sprint 3, whose rows get "delivered by Dragon Slayer entry N" when a fold-in ships.
- Camera, frame and renderer (idea file `docs/ideas/2026-09-07-camera-frame-and-renderer.md`, verified on disk 06:26): entry 8's client patches keep scene drawing behind one call so a WebGL backend can replace it later; shell v2's `config` panel reserves a "Display" section (zoom, draw-distance slider, fps target, pitch) and never a twelfth strip icon; the draw-loop change is written so a backend can drive it at any rate. One candidate and one row (D41, amending D40): the draw-distance spike stays a candidate, queue item 9, and its only output is the slider's maximum; the "camera and frame" client-patch entry is now **sprint row 9, "Camera, frame and renderer"**, placed after entry 8 on the owner's instruction, with its spec being written under queue item 10.

## Decisions since last update

D1 to D138 in `decisions.md`; D130 records the box secrets added by hand after the first live release; D129 makes a pack created from nothing not a rewrite for the packer guard; D127 opens G5 for the testing site (release at every verify-green landing); D128 makes category.pack optional for the wiki extract after the first image build failed on it; D120 and D121 settle D8 (time candy drop rate and the 0 XP hour), D122 to D126 are the time candy plan's other rulings; D102 records the 21:15 session restart and the resumed entry 2 run; D103 to D116 are the entry 3 and SP8c planners' rulings (D115 the graceful taskkill, D116 map.pack as entry 11 residue); D117 to D119 are SP8c's interface allocation and tab-component rulings; D92 to D101 are the entry 2 plan's rulings. D43 to D55 from the Battlebots 2 spec run; D56, D57 from the camera spec run; D58 the entry 14 insertion; D59 corrects D55; D60 the owner's sprint-close instruction; D61 the owner's sprint 3 library and task-list instruction; D62 to D86 from the library spec run; D87 the SP4b gate's e2e-wait ruling (renumbered from a duplicate D61); D88, D89 from the shell v2 reconcile pass; D90 sprint 3 rows 8 and 10 with the renumber (the menu-family and mute row is now sprint 3 entry 11); D91 the vocabulary ruling (Script, Library, Task, Task list, Run, Step, Plugin each mean one thing; Automation tabs become Scripts, Library, Tasks, Runs; every manifest gains a closed category).
spec run; D58 the entry 14 insertion; D59 corrects D55; D60 the owner's sprint-close instruction;
**two rows are both numbered D61**, the gate-closing e2e ruling and the owner's sprint 3 scope
instruction, which D62 records rather than renumbers; D63 commits the two e2e screenshots; D64
removes SP4b's workspace now that its ledger is promoted; D65 reworded four documents that cited a
git-ignored workspace and names the one, the shell v2 plan's code maps, still open).

The docs landing of queue item 3 is done: the sprint document, this board, `decisions.md`, the
specs and the plan (`docs(sprint)`), the vision set, the skills and the two comment-only source
edits (`docs(vision)`), `docs/ideas/**` (`docs(ideas)`), SP4b's promoted ledger (`docs(sp4b)`) and
the two e2e captures (`docs(screenshots)`). `deploy/lightsail/cloudflared.yml` is deliberately left
uncommitted for entry 1's deploy step under D15 and D35.

## Handoff

PAUSED by owner instruction (D137, D138) at 15:07 on 2026-09-09. Entry 5 execution run `wf_26986b0b-af7` stands at HEAD 3e633c7 with tasks 1 to 9 clean; task 10 restarts fresh (its interrupted implementer left no journal result; partial files kept at the scratchpad entry5-task10-partial for reference only). Tree clean. To resume, on the owner's word: Workflow({scriptPath: "%USERPROFILE%\.claude\projects\C--projects-osrs-test\6cfc8eb7-fa0f-4398-8701-64d1005b1577\workflows\scripts\entry5-execute.js", resumeFromRunId: "wf_26986b0b-af7"}); tasks 1 to 9 replay from cache, task 10 onward run fresh, then the fable review, fix wave, verify at HEAD, ledger promotion, row 5 close-out, and the release per D127. Then put the run back in the Running table with its new task id.
