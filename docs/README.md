# idlescape documentation index

The one-hop map. For any subject a fresh session might ask about, this file names the single
authority and nothing else. Written 2026-09-07 on `sprint/dragon-slayer` at commit `30efd94`.

New here? Read the five documents in section 2, in that order, and stop.

---

## 1. The authority for each subject

One row per subject. "Authority" is the file that decides; where a spec and a plan disagree the
spec wins, except where an entry says otherwise (sprint section 5).

| Subject | Authority | Also | Verify with |
|---|---|---|---|
| What the project is, and what settles design arguments | `docs/VISION.md` | - | - |
| System map, processes, boundaries, data flows | `docs/ARCHITECTURE.md` | - | - |
| What to run before claiming done | `docs/VERIFICATION.md` | skill `idlescape-verify` | `npm run verify` |
| Ports, hosts, secrets, timings, hazards | `docs/OPERATIONS.md` | skill `idlescape-stack` | `scripts/start-stack.ps1` |
| What gets built next, in what order | `docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md` | board: `docs/superpowers/sprint-control.md` | - |
| What each sub-project SP1 to SP10 delivers and depends on | `docs/superpowers/specs/2026-09-05-idlescape-roadmap-and-handoff.md` section 4 | - | - |
| How to work: conventions, traps, stop conditions | `docs/superpowers/specs/2026-09-06-sprint-handoff.md` sections 1, 4, 5, 6 | - | - |
| Cross-entry and policy rulings | `docs/superpowers/decisions.md` | - | - |
| Owner ideas that are not yet specs or rows | `docs/ideas/README.md` | one file per idea with a first consideration and a status | - |
| The SDD ledger convention | `docs/superpowers/SDD.md` | skill `idlescape-sdd` | the promoted ledger exists |
| The honest state of the build, and 34 findings | `docs/superpowers/specs/2026-09-07-project-audit.md` | - | - |
| UI, tokens, components, the design system | skill `idlescape-design`, over `docs/design/idlescape-shell-v2/` | ledger `ledgers/2026-09-07-shell-v2.md`, which supersedes spec `2026-09-05-idlescape-design-system.md` on every shell surface | `web/styleguide.html` at `/styleguide`, whose completeness rule and eight screenshot baselines run in `verify.ps1` step 10 |
| Shell, frame, panels, pairing | spec `2026-09-04-idlescape-platform-design.md`, plan `2026-09-04-idlescape-platform.md` | ledger `ledgers/2026-09-04-idlescape-platform.md` | web vitest |
| Revision 274 pin | spec `2026-09-05-sp1b-revision-274-design.md` | ledger `ledgers/2026-09-05-sp1b-revision-274.md`, `scripts/upstream.lock` | `engine-overlay.ps1 -Check` |
| Plugin framework and panels | spec `2026-09-05-sp2-plugin-framework-design.md` | ledgers `2026-09-05-sp2a-plugin-framework-core.md`, `2026-09-05-sp2c-tier1-shell-plugins.md`, `2026-09-05-sp2c2-status-hud-and-hooks.md`; skill `idlescape-plugin` | `web/e2e/plugins.pw.test.ts` |
| Client plugin tier | spec `2026-09-05-sp2-plugin-framework-design.md` section 4, ledger `2026-09-05-sp2b1-client-plugin-registry.md` | **dormant, decision D18** | `bun test src/plugins` in `client/` |
| Hiscores and the XP tracker service | spec `2026-09-05-sp3-hiscores-tracker-design.md` | **server half absent**; decision D14 rules SP3b is built | - |
| Agent runtime, tasks, scripting | specs `2026-09-05-sp4-agent-runtime-design.md` and `2026-09-05-sp4-tasks-scripting-environment-design.md` | plan `2026-09-05-sp4a-tasks-runtime-library-panels.md` | web vitest, `web/e2e/` |
| Bot expansion, state recovery, Tutorial Island | spec `2026-09-06-sp4b-bot-expansion-design.md`, plan `2026-09-06-sp4b-bot-expansion.md` | handoff `2026-09-07-sp4b-handoff.md`; skill `idlescape-library-script` | `librarySource.test.ts`, web vitest |
| The MCP gateway, `/tab`, `runs.db` | `2026-09-05-sp4-tasks-scripting-environment-design.md` from section 468 | **not built** (sprint entry 16) | - |
| Wiki corpus, reader, query API | spec `2026-09-05-spw-wiki-corpus-design.md`, plan `2026-09-05-spw-wiki-corpus.md` | ledger `ledgers/2026-09-05-spw-wiki-corpus.md`; `wiki/AUTHORING.md`, `wiki/STYLE.md` | `npm run wiki:test`, and `verify.ps1`'s wiki step |
| Accounts, characters, the home page | spec `2026-09-05-multi-character-platform-design.md`, plan `2026-09-05-sp6-accounts-and-characters.md` | - | server `bun test`, web vitest |
| Character tabs and iframe sessions | spec `2026-09-05-sp7-character-tabs-and-sessions-design.md`, plan `2026-09-05-sp7-character-tabs-and-sessions.md` | measurement `measurements/2026-09-05-sp7-sessions.md` | `web/e2e/` |
| Engine overlay, owner assertion, shared bank | plan `2026-09-05-sp8-engine-overlay-and-shared-bank.md` | `engine-custom/PATCHES.md`, `engine-custom/README.md`; skill `idlescape-engine-overlay` | verify step 2 (engine overlay) |
| The web bank | spec `2026-09-05-sp8b-web-bank-design.md` (**section 12 is what actually shipped, and 12.9 is what sprint entry 4 changed under it**), plan `2026-09-06-sp8b-web-bank.md` | - | `web/e2e/bank.pw.test.ts` |
| Content overlay and pack ids | `content-custom/README.md`, sprint spec section 3 | skill `idlescape-content-overlay`; the table in code is `engine-custom/src/idlescape/packIds.ts` | `content-overlay.ps1 -Check`, gated in verify step 2, plus `packIds.test.ts` |
| The forked game client | `client/PATCHES.md` (numbering at 28) | skill `idlescape-client-patch` | `scripts/patches-check.ps1`, gated in verify step 2; plus `bun test src/hooks` in `client/` |
| Hosting, release, rollback, secrets rotation | `deploy/lightsail/README.md` | spec `2026-09-05-lightsail-hosting-and-release-design.md`, plan `2026-09-05-lightsail-hosting-and-release.md` | `box/health.sh` |
| Credits and vendored code | `CREDITS.md` | **carries three false rows**, audit C14 | - |

## 2. Reading order for a new session

Short on purpose. Five documents, then the entry's own.

1. `docs/VISION.md` - what this is and what settles arguments.
2. `docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md` - what gets built next and why in
   that order.
3. `docs/superpowers/sprint-control.md` - what is running right now, what is queued, what is gated.
4. The spec and plan for the entry you are working on, from the table above.
5. The skill for the thing you are touching (`.claude/skills/idlescape-*`), which names its own
   authority and its own verification command.

Then `docs/VERIFICATION.md` before you claim anything is done.

Two shortcuts worth knowing. `CLAUDE.md`'s "idlescape project" section is the compressed version of
the constraints that do not move, for a session that has read nothing else. `docs/ARCHITECTURE.md`
is the one to read when you need to know how a subsystem connects to the others rather than what it
was supposed to be.

## 3. Specs, with status

Every file under `docs/superpowers/specs/`. Status is from the file's own header, corrected where
the project audit's promised-versus-delivered ledger contradicts it.

| Spec | Purpose | Status |
|---|---|---|
| `2026-09-04-idlescape-platform-design.md` | SP1: the shell, frame, panels, gate, front server | approved; delivered |
| `2026-09-05-entry-screen-and-quick-connect-design.md` | Entry screen, pairing URL, agent tokens, Claude Connection panel | approved in conversation; delivered |
| `2026-09-05-goals-and-autopilot-design.md` | Goals store, three-mode selector, autopilot, event diffs | **orphan draft. Superseded on the co-pilot bar by shell v2 (decision D17); the rest is a candidate entry after SP4c** |
| `2026-09-05-idlescape-design-system.md` | Tokens, class families, `/styleguide` | implemented; superseded on the shell surfaces by the shell v2 bundle |
| `2026-09-05-idlescape-roadmap-and-handoff.md` | The sub-project table: what each SP delivers and depends on | approved. **Section 4's ordering is superseded by the sprint spec**; the table itself still governs |
| `2026-09-05-lightsail-hosting-and-release-design.md` | The hosting design behind `deploy/lightsail/` | approved; delivered. Its Components block lists 6 of 14 tracked files (audit C31) |
| `2026-09-05-multi-character-platform-design.md` | Phase A: characters, iframes, shared bank, Contracts, wealth hiscores | recommendations recorded; SP6 and SP7 delivered from it |
| `2026-09-05-sp1b-revision-274-design.md` | The 225 to 274 migration | approved; delivered |
| `2026-09-05-sp2-plugin-framework-design.md` | Two-tier plugin system and the Tier 1 set | approved; **partial: five of nine Tier 1 plugins exist; the client tier is dormant (D18)** |
| `2026-09-05-sp2b-gpu-spike-findings.md` | Spike revising the GPU renderer port approach | spike complete; **the renderer was never built** |
| `2026-09-05-sp3-hiscores-tracker-design.md` | Snapshot ingest, tracker database, hiscores pages | approved; **partial: trackers shipped, the hiscores half does not exist.** Decision D14 |
| `2026-09-05-sp4-agent-runtime-design.md` | The observe/act layer, tasks, the hosted MCP gateway | approved; SP4a delivered, SP4c absent |
| `2026-09-05-sp4-tasks-scripting-environment-design.md` | Tasks environment, Marketplace, run control, Tutorial Island; **section 468 onward is SP4c's authority** | draft for owner review; SP4a built from it. Three owner questions in section 19 are still open |
| `2026-09-05-sp7-character-tabs-and-sessions-design.md` | One client per character, tabs, name-first login | implemented |
| `2026-09-05-sp8b-web-bank-design.md` | The web bank. **Section 12 is the "what actually shipped" account SP9 inherits from; 12.9 is entry 4's amendment to it** | delivered with recorded gaps; sections 7 and 8 are sprint entry 8's authority |
| `2026-09-05-spw-wiki-corpus-design.md` | Wiki corpus, `/wiki`, `/api/wiki` | approved; **partial: corpus and reader built, authoring backlog and bearer auth open** |
| `2026-09-06-idlescape-shell-v2-gaps-design.md` | The companion that closes what the vendored shell v2 handoff leaves open | shipped 2026-09-09; **section 8 is the "what actually shipped" account, and its plan overruled this document where they disagreed** |
| `2026-09-06-sp4b-bot-expansion-design.md` | Bot expansion and the Tutorial Island script | approved with twelve owner decisions; **in flight** (tasks 9 to 15) |
| `2026-09-06-sprint-handoff.md` | The operating model: how to work, the traps, the constraints, "done means" | **sections 1, 4, 5, 6 apply. Sections 2 and 3 are superseded by the sprint spec**, and section 2 still says SP3 is done, which it is not |
| `2026-09-06-time-candy-design.md` | A recorded hour of experience, sealed into a bearer-token item | design approved; sprint entry 10, no plan yet. Two author's calls open (decision D8) |
| `2026-09-07-battlebots-minigame-design.md` | A script-driven PvP arena in a generated region | vendored 2026-09-07. **Its plan overrules it: sixteen rulings. Read the plan first** |
| `2026-09-07-battlebots2-puppets-queue-replays-design.md` | Puppets, the ranked queue and replays | approved under D11 and D39; sprint entry 14. Three plans in order per its section 17 |
| `2026-09-07-camera-frame-and-renderer-design.md` | Zoom, pitch, draw distance, the frame rate and the renderer seam | approved under D11 and D41; sprint entry 9. Authority over its idea file |
| `2026-09-07-project-audit.md` | The whole repository read against "can a fresh session do its job here" | proposed, for owner review. 34 confirmed findings; section 4 is the brief this documentation set answers |
| `2026-09-07-script-api-docs-design.md` | Developer script API reference and quickstart | approved under D11; sprint entry 5. Its first task is the survey's standard |
| `2026-09-07-script-api-survey-and-standard-design.md` | The script API surveyed against every large open source bot | approved under D11. **Not a row of its own**: section 4 seeds entry 5, section 5's phase-next is entry 7 |
| `2026-09-07-script-studio-design.md` | The Script Studio | approved under D11; sprint entry 6. Depends on entry 4 for the Window family and the tokens (D22) |
| `2026-09-07-sp3b-hiscores-completion-design.md` | SP3b: the hiscores half SP3 never built | approved under D11 and D14; sprint entry 13. Amends the SP3 design, section 12 lists what it supersedes |
| `2026-09-07-sp4b-handoff.md` | Everything a later session needs about SP4b tasks 9 to 15 | current; sprint entry 1. **Superseded on the rulings by `ledgers/2026-09-06-sp4b-bot-expansion.md`** |
| `2026-09-07-sprint-dragon-slayer.md` | **The order.** Eighteen entries, the pinned pack-id table, the conventions for this sprint | open |
| `2026-09-07-sprint-legends-quest.md` | The sprint after this one | drafted by the owner's ideas session; **opens when Dragon Slayer closes** (D60); rows 6, 7, 8 and 10 have specs |
| `2026-09-07-library-catalog-and-task-list-design.md` | Sprint 3 rows 6 and 7: the nineteen-script catalogue, the shared settings model, task lists, script stats | approved under D11 and D61; vocabulary amended by D91 |
| `2026-09-07-windows-and-session-canvas-design.md` | Sprint 3 row 8: the window manager, session windows off the character tabs, the bank at release standard, motion rules | approved under D11 and D90 |
| `2026-09-07-wiki-window-and-vocabulary-design.md` | Sprint 3 row 10: the wiki window, player and agent modes, the corpus filled for agents, live script actions; **section 9 is the vocabulary ruling D91** | approved under D11, D90 and D91 |
| `specs/phase-a/*` (5 files) | The read-only Phase A audits behind the multi-character design | historical; superseded by what SP6 and SP7 built |

## 4. Plans, with status

Plans live under `docs/superpowers/plans/`. A plan is the argument for its spec, and is superseded
by the spec where they disagree.

| Plan | For | Status |
|---|---|---|
| `2026-09-04-idlescape-platform.md` | SP1 | executed; ledger promoted |
| `2026-09-05-entry-screen-retrofit.md` | Entry screen and pairing | executed; ledger promoted |
| `2026-09-05-lightsail-hosting-and-release.md` | Hosting and release | executed |
| `2026-09-05-sp1b-revision-274.md` | SP1b | executed; ledger promoted |
| `2026-09-05-sp2a-plugin-framework-core.md` | SP2a | executed; ledger promoted |
| `2026-09-05-sp2b1-client-plugin-registry.md` | SP2b-1 | executed; ledger promoted. **SP2b-2 was staged and never ran** |
| `2026-09-05-sp2c-tier1-shell-plugins.md` | SP2c | executed; ledger promoted |
| `2026-09-05-sp2c2-status-hud-and-hooks.md` | SP2c-2 | executed; ledger promoted |
| `2026-09-05-sp4a-tasks-runtime-library-panels.md` | SP4a | executed |
| `2026-09-05-sp6-accounts-and-characters.md` | SP6 | executed |
| `2026-09-05-sp7-character-tabs-and-sessions.md` | SP7 | executed |
| `2026-09-05-sp8-engine-overlay-and-shared-bank.md` | SP8 | executed |
| `2026-09-05-spw-wiki-corpus.md` | SPW | executed; ledger promoted |
| `2026-09-06-sp4b-bot-expansion.md` | SP4b | **in flight**, tasks 9 to 15 |
| `2026-09-06-sp8b-web-bank.md` | SP8b | executed |
| `2026-09-07-shell-v2.md` | Sprint entry 4 | executed, 21 tasks in two blocks; ledger promoted to `ledgers/2026-09-07-shell-v2.md` |
| `2026-09-07-spbb-battlebots-minigame.md` | Sprint entry 11 | written and shovel-ready; **overrules its spec on sixteen points** |

## 5. Ledgers and measurements

- **Promoted ledgers** live in `docs/superpowers/ledgers/<plan-basename>.md`, each under 400 lines,
  each committed with its sub-project's closing commit. They hold the rulings, the fix rounds and
  the deferred minors. The convention is `docs/superpowers/SDD.md`.
- **Live SDD workspaces** live in `.superpowers/sdd/<plan-basename>/`, which is git-ignored. A
  workspace is scratch; the promoted ledger is the record. Do not cite a workspace path from a
  committed file.
- **Measurements** live in `docs/superpowers/measurements/` and are linked from here. Today there
  is one: `2026-09-05-sp7-sessions.md`, the throttling and memory numbers behind the iframe session
  design.

## 6. The MCP note

There is no MCP server in this repository yet. The hosted gateway at `/mcp` is SP4c, sprint entry 16,
and `server/src/router.ts` has no `/mcp` route. A session whose environment reports
`ConnectionRefused` on an MCP entry under the project's earlier name is seeing a stale entry in the operator's own
`~/.claude.json`, left over from the rename; it is expected and it is not a repository problem.

## 7. The check that keeps this file honest

Committed files must not cite a path under `.superpowers/`, because that directory is git-ignored
scratch that a fresh clone does not have. From the repository root:

```powershell
git grep -n "\.superpowers/sdd" -- ':!.superpowers' ':!docs/superpowers/specs/2026-09-07-project-audit.md'
```

Read each hit and sort it into one of two kinds:

- **An instruction about where a live workspace goes.** Fine. The sprint board, the sprint handoff's
  `:24`, and the tail of each plan are this kind. The one exception is
  `plans/2026-09-06-sp4b-bot-expansion.md:6097`, which still says to **delete** the workspace at
  close; that is superseded by `docs/superpowers/SDD.md` and decision D19.
- **A citation of a workspace as the authority for a fact.** Broken. Fix it by pointing at
  `docs/superpowers/ledgers/<plan-basename>.md`, or, where the workspace was deleted under the old
  convention and no ledger exists, by inlining the reason so the citing file stands alone. Six such
  citations were found and rewritten on 2026-09-07, one of them in production code
  (`server/src/firebaseAdmin.ts`) and one in `scripts/verify.ps1`; the audit's C13 records them.
