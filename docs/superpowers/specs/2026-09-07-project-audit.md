# Idlescape - Project audit, 2026-09-07

Date: 2026-09-07
Status: proposed 2026-09-07; adopted in part by the sprint document the same afternoon (its section 7 lists which sections became rows and fold-ins); the audit proposes, the sprint decides
Owns: nothing. This document proposes; the sprint document decides. Every task here is a
proposal for a row in, or a fold into, `2026-09-07-sprint-dragon-slayer.md` section 2.
Depends on: `2026-09-07-sprint-dragon-slayer.md` (the order), `2026-09-06-sprint-handoff.md`
sections 1, 4, 5 and 6 (the operating model), `2026-09-05-idlescape-roadmap-and-handoff.md`
section 4 (what each sub-project delivers).
Amends: nothing yet. Section 3 lists the amendments it asks the owner to approve.

## Scope

The whole repository, read against one question: **can a fresh agent session with no memory do
its job here?** Concretely, five tests, taken from the operating model in
`2026-09-06-sprint-handoff.md`:

1. Find the authority for any decision in one hop.
2. Run the verification a change needs, and trust the answer.
3. Add a feature without inventing a second pattern for something that already has one.
4. Know which files are never edited and which conventions do not move.
5. Hand off without losing rulings.

Anything that defeats one of those is a finding, and so are the recurring shapes the operating
model already names: files at the 400-line ceiling, duplicated mechanisms, a convention
documented in one place and violated in another, fakes looser than the real thing, generated
artefacts with no drift gate, scripts that pass from the wrong directory, docs that describe the
design rather than the build, hardcoded secrets and hosts, error paths that swallow, teardown
that does not fence in-flight work, deferred items with no home, and anything a handoff says
"revisit" about.

**In scope:** `web/`, `server/`, `client/` (the fork, not the pinned clone), `engine-custom/`,
`content-custom/`, `wiki/`, `scripts/`, `deploy/`, `firebase/`, every file under
`docs/superpowers/`, the root docs (`README.md`, `CLAUDE.md`, `CREDITS.md`, the three
`PATCHES.md`), and the nine surviving SDD ledgers under `.superpowers/sdd/`.

**Out of scope:** `engine/` and `engine/content/` (pinned clones, never edited) and
`web/src/vendor/`, `client/src/vendor/` except for their provenance records.

## Method

A four-phase workflow, read-only on everything outside `.superpowers/sdd/2026-09-07-audit/`.

**Phase 1 - promised versus delivered.** One auditor read every file under
`docs/superpowers/specs/` (22 files), the headers and rulings of every file under
`docs/superpowers/plans/` (17 files), the one file under `docs/superpowers/measurements/`, all
nine surviving SDD ledgers, `CREDITS.md`, the three `PATCHES.md`, `README.md`, `build.ps1` and
`verify.ps1`, and swept `web/src`, `server/src`, `engine-custom/src`, `client/src/hooks`,
`client/src/plugins`, `scripts/`, `content-custom/` and `deploy/` for TODO, FIXME, "for now",
"not yet" and "later". Output: the ledger in section 1.

**Phase 2 - six area audits, in parallel.** Web shell and plugins; web task and agent runtime;
server and deploy; client fork and engine overlay; Firebase and wiki; agentic-development
infrastructure. Each auditor read its area in full against the five tests above.

**Phase 3 - synthesis.** 143 raw findings merged to 35 candidates, de-duplicated across areas,
re-ranked on one priority bar, and each given a placement in the sprint sequence.

**Phase 4 - adversarial verification.** A fresh verifier per candidate, with no stake in it,
instructed to try to refute it: re-read every cited line, check whether an existing test, spec,
ledger or in-flight sprint entry already closes it, check the proposal against the constraints
that do not move, and correct or reject.

### Counts

| | |
|---|---|
| Raw findings from the six area audits | 143 |
| Candidates after merge and de-duplication | 35 |
| Confirmed by adversarial verification | 34 |
| Refuted | 1 (C34, appendix A) |
| Scope reduced by the verifier | 1 (C20) |
| Priority changed | 0 |
| Candidates carrying a verifier correction | 30 of 34 |
| Owner rulings requested | 5 |

Confirmed candidates by priority: **5 P0**, **21 P1**, **7 P2**, **1 P3**.
By effort: **11 S**, **21 M**, **2 L**.

### Priority bar

- **P0** - production is broken, account state leaks or corrupts, or the sprint cannot proceed
  correctly on top of it.
- **P1** - a gate lies, a fresh agent is actively misled, or a user hits it on a main path.
- **P2** - real and bounded; costs the next reader or a small class of users.
- **P3** - janitorial.

### Reading state and the moving files

Read at `385e24d` on `sprint/dragon-slayer`, verified through `5889437`. Two other workflows were
live in this tree during the audit: SP4b tasks 9 to 15 (sprint entry 1) and the shell v2 plan.
Anything under `web/src/tasks`, `web/src/agent`, `web/src/frame/runBanner.ts` or
`web/src/plugins/builtin/tasks*.ts` was moving underneath the audit; where such a file is cited,
the commit it was read at is named (`tasks.ts` and `tasksViews.ts` at `109ace8`, `runBanner.ts`
at `31c46e0`, everything else at the working tree as of `385e24d`, re-verified at `5889437`).
Line numbers in those files drift by one to a few lines; re-grep rather than trusting a raw
line number there.

### Two observations the task list does not carry

**The code is in better shape than the documents.** One TODO marker exists in the whole tree and
it is upstream's (`web/src/vendor/rs-sdk/sdk/types.ts:604`). All 81 `PATCHES.md` greps pass, the
overlay tree matches its manifest one to one, both pinned clones are at their recorded shas, and
the front server's modules are small with one auth story per concern. The failure mode of this
project is not sloppy code. It is that rulings, deferrals and status live in places that do not
survive: ledgers the process deletes, handoffs that supersede each other, machine-local memory,
and comments that were true when written. Eleven of the thirty-four confirmed candidates are
that one problem wearing different clothes.

**The gates report green on things that do not work.** `verify.ps1` passes without ever building
the wiki, typechecking a test file, typechecking the client fork, running a single `PATCHES.md`
grep, checking the clone shas against `upstream.lock`, checking the content overlay for drift, or
measuring a line count. `release.ps1` promotes a build whose engine carries no overlay, whose
management link is unreachable and whose wiki database does not exist, on the strength of
`"engine":"up"`. For a project whose stated contract is "run the verification a change needs and
trust its answer", closing that gap (C09, C16, C22, C23, C24, and C07's health assertion) is
worth more than any single defect on the list.

---

## 1. What is built

The honest state, sub-project by sub-project, from the promised-versus-delivered ledger. "Home"
is the sprint entry that carries the remainder, or `none` if nothing does.

### 1.1 Sub-projects

| SP | Promised (roadmap section 4) | State | Evidence | Home |
|---|---|---|---|---|
| SP1 | Shell, frame, panels, gate, pairing, hooks v1 | **DELIVERED** | `web/src/main.ts`, `server/src/gate.ts`, `server/src/pair/*` | - |
| SP1b | Revision 274 across engine, content, client, scripts, server; the content overlay | **DELIVERED** | `scripts/upstream.lock`, `content-custom/`, `client/PATCHES.md` revision-274 notes | - |
| SP2 | Plugin framework, settings persistence, Plugins panel, Tier 1 plugins **including the GPU renderer port** | **PARTIAL** | framework at `web/src/plugins/*`; of the nine Tier 1 plugins in its spec section 5 only `xp-tracker`, `loot-tracker`, `status-hud`, `notes`, `screenshot` exist. `gpu-renderer`, `quest-helper`, `skill-calc` and `hiscores` have zero references anywhere in `web/src`, `server/src`, `client/src` or `scripts/`. Their generators are absent from `scripts/gen/`. | **none** (C31, C32) |
| SP2b | GPU renderer as a client-tier plugin (225-gpu ported to 274) | **PARTIAL** | only SP2b-1 (the registry) shipped: `client/src/plugins/{capability,registry}.ts`, `web/src/frame/stage.ts:322-329`. No `tier: 'client'` manifest exists outside two test fixtures. `client/src` has no `renderer/`, no WebGL, no WebGPU. SP2b-2 was staged in a ledger and never ran. | **none** (C32) |
| SP3 | Snapshot ingest, tracker database, hiscores and player pages, Hiscores panel, XP Tracker link | **PARTIAL, trackers only** | `server/src` has no hiscores, tracker or snapshot module; `web/src` has no match for "hiscore"; the SP2-reserved `ctx.snapshots.push(reason)` seam is absent from `web/src/plugins/types.ts` | sprint section 4 names the gap; **needs an owner ruling** (C14) |
| SP4a | Agent runtime, script library, panels | **DELIVERED** | `web/src/agent/*`, `web/src/tasks/*` | entry 1 |
| SP4b | Bot expansion and Tutorial Island | **IN FLIGHT** (tasks 9 to 15) | tasks 1 to 8c committed; task 9 landed at `109ace8` | entry 1 |
| SP4c | `/tab`, `/mcp`, `runs.db`, modes, rate limits | **ABSENT** | no `/mcp` route in `server/src/router.ts` | entry 8 |
| SP5 | Tier 2 plugins and the headless LiteClient runner | **ABSENT** | - | entry 9 |
| SPW | Wiki corpus, `/wiki`, `/api/wiki`, **the authoring backlog** | **PARTIAL** | corpus, reader and query API built (`wiki/`, `server/src/wiki/`); authoring is 5 pages against a generated queue of 11 quests with no start NPC in `wiki/data/274/gaps.md`; bearer auth is a permanent-deny stub; the package is outside every gate and absent from the server image | **none** (C09, C28, C31) |
| SP6 | Characters, principal, home, player count, patch notes, gate, deletion | **DELIVERED** | `server/src/characters/*`, `web/src/home/*` | - |
| SP7 | Iframe sessions, tab strip, measurements | **DELIVERED** | `web/src/sessions/*`, `web/src/frame/characterTabs.ts`, `docs/superpowers/measurements/2026-09-05-sp7-sessions.md` | - |
| SP8 | Engine overlay, shared owner bank, management routes | **DELIVERED in the tree, ABSENT from the deployed image** | `engine-custom/`, `server/src/bank/routes.ts`; `deploy/` never copies `engine-custom` (C07) | **none** for the deploy half (C07) |
| SP8b | Web bank | **DELIVERED with recorded gaps** (its spec section 12.6) | `web/src/bank/*` | entry 3 covers the client half only; the recorded gaps have no home (C21) |
| SP8c | Client bank tabs | **ABSENT** | - | entry 3 |
| SP9 | Contracts | **ABSENT**, stubs only | `web/src/bank/contextMenu.ts:25` `CONTRACTS_HINT` | entry 6 |
| SP10 | Wealth hiscores | **ABSENT, blocked on SP3** | - | entry 7 (blocked) |

### 1.2 Named deferrals with no home

Twenty deferrals were traced to where they were promised. Eleven are open with **no sprint entry
carrying them**:

| # | Deferral | Promised in | State | Candidate |
|---|---|---|---|---|
| D1 | Mute toggle and `setAudioMuted` | multi-char spec section 5; SP7 spec section 7; roadmap section 4 | ABSENT, zero references | C21 |
| D2 | `advanced-controls` plugin (WASD camera, Enter to chat, wheel zoom), "scoped to SP2" | entry-screen ledger ruling 6 | ABSENT, zero references, and the ruling exists only in a git-ignored directory the process says to delete | C32, C13 |
| D3 | `agentTokens.secretHash` readable by its owner, "revisit in SP4" | SP1 final review ledger | OPEN, `firebase/firestore.rules:61-64` | C29 |
| D4 | `pair/skill.md` `/mcp` 503-versus-401 wording | same ledger | OPEN, `server/src/pair/skill.md:49` still says 503 | C28 |
| D5 | Bank placeholders and fillers, "engine-level, SP8 follow-up" | SP8b spec:189 | ABSENT; entry 3's scope line does not include it | one line to add to entry 3 |
| D6 | Bank focus trap and `aria-modal` | SP8b spec section 12.6 | ABSENT | C21 |
| D7 | `web/styleguide.html` over the 400-line ceiling | SP8b spec section 12.6 | OPEN and worse: 504 lines now | C16, C21 |
| D8 | 225 wiki data kept beside 274 for a generated Changes section | SPW spec decision 5 | ABSENT, only `wiki/data/274/` | C31 |
| D9 | `/api/wiki` accepts agent tokens in observe mode "so Claude can use it before SP4" | SPW spec decision 3 | ABSENT, `server/src/wiki/auth.ts:7` defaults `verifyBearer` to `async () => false` | C28 |
| D11 | Empirical terser check that `plugins/enable/disable` survive mangling, "will surface at SP2b-2 integration" | SP2b-1 ledger | OPEN and unreachable: SP2b-2 never ran | C24, C32 |
| D15, D16 | Three unanswered owner questions in the SP4 tasks spec section 19; four in the goals-and-autopilot spec section 10 | those specs | OPEN, shipped over | C15 |

Resolved and needing no action: D10 (`plugins.pw.test.ts` now runs inside verify step 7), D19
(the `inv` 217 to 219 collision, settled in the sprint's section 3), D20 (OAuth for claude.ai
connectors, absent by design and stated in three specs). Open by design and correctly homed: D14
(SP4b's six deliberately parked items, entry 1's handoff section 4), D17 (battlebots D5 and D9,
entry 5), D18 (time candy's drop rate and recording rule, entry 4). D12 and D13 (the
`onDeath: 'pause'` toast tone, and collapsing recovery's three-exit arm to one `finish(ok)`) are
recorded as deliberately not taken and belong to whoever next opens `recovery.ts`.

### 1.3 What shipped that no spec describes

- **`deploy/lightsail/preview.ps1`, `common.ps1`, and the six scripts under `box/`**
  (`extract.sh`, `health.sh`, `logs.sh`, `preview.sh`, `public.sh`, `up.sh`). The lightsail
  spec's Components block lists 6 of that directory's 14 tracked files. `public.sh` is
  undocumented and, by its name, changes the box's exposure.  (C31)
- **`web/src/plugins/builtin/traceView.ts` and `tasksViews.ts`** are views, not plugins, sitting
  in the `builtin/` plugin directory. A naming exception nothing documents.
- **`web/src/bank/store.ts:35-36`** maintains a `pending` op set that is written at five sites
  and is part of the state contract, but no module outside that file reads it.
- **`content-custom/pack/varp.pack`** now carries varps 359 to 367 (bank tab sizes), which the
  engine Dockerfile's comment at `deploy/docker/engine.Dockerfile:46-49` still says does not
  exist. (C22)

Everything else scanned under `web/src`, `server/src` and `engine-custom/src` maps onto a spec.

### 1.4 The one-line summary

The build is roughly where the roadmap says it is, with four exceptions the documents do not
admit: **SP2's Tier 1 set is five of nine**, **SP2b is a registry with no consumer**, **SP3's
hiscores half does not exist**, and **SP8's engine overlay is not in the deployed image**. The
reconciliation convention that would have caught all four is honoured once in eleven
opportunities (C31).

---

## 2. Proposed tasks

Thirty-four confirmed tasks, grouped by where they belong in the sequence. Each block gives the
id, title, priority, effort, category, the evidence with file and line, the proposal, and the
verifier's note wherever adversarial verification corrected, sharpened or narrowed the finding.
Where a verifier found nothing to correct, the note says so, because that is information too.

Refuted candidates are in appendix A, so the record shows what was considered and rejected.

**Placement counts:** outside the sprint, do now 6 - fold into entry 1 6 - before entry 2 6 -
fold into entry 2 3 - after entry 2 2 - before entry 4 3 - before entry 5 1 - before entry 6 2 -
entry 8 3 - after the sprint 2.

---

### 2.1 Outside the sprint sequence: do now

Six tasks. None of them waits on an entry, and four of them are true of the live site right now.

#### C07 - The deployed stack is not the stack anything tests

**P0 - M - reliability - do now; the live site's owner bank is dead until it lands**

**Evidence.** `deploy/docker/engine.Dockerfile:38-57` copies `content-custom` and nothing else;
`grep -rn engine-custom deploy/` returns zero hits, while `engine-custom/manifest.json` lists
five `replace` patches plus 29 new files including `idlescape/management.ts`,
`ownerAssertion.ts` and `staff.ts`. Both local entry points apply the overlay first
(`scripts/verify.ps1:77-81`, `scripts/start-stack.ps1:28-35`); the Docker image never does, so
the deployed engine is stock Lost City 274 with no owner bank and no management routes.
`deploy/docker/docker-compose.yml:18-31` sets none of the four idlescape environment variables
that `engine-custom/src/idlescape/config.ts:76-101` reads, and `config.ts:81` makes
`requireOwner` a hard floor under `deploy/docker/world.json.template:4`'s `production: true`, so
fixing only the COPY makes the build worse. `docker-compose.yml:51-57` never sets
`ENGINE_MANAGEMENT_HTTP`, so `server/src/env.ts:50` falls back to loopback inside the server
container while the engine binds management to `127.0.0.1` (`config.ts:100`,
`engine-custom/src/web.ts:366`). `engine-custom/src/web.ts:335-354` registers `GET /setup`,
`GET /setup/config` and `PUT /setup/config` with **no auth**, directly above the secret-gated
owner bank routes at `:359`; `GET /setup/config` returns `db.pass` in plaintext and `PUT`
rewrites `node.production` and `build.verify`, so binding `0.0.0.0` is unsafe until that is
fixed. `server/src/health.ts:25-43` probes only `/rs2.cgi` and the players gauge, and
`deploy/lightsail/release.ps1:86` and `cutover.ps1:23,45` gate solely on `engine:up`. Also
`server/src/proxy/http.ts:11` caches error responses for an hour, and the server writes no
per-request log (`server/src/index.ts` has exactly one `console.log`, at startup).

**Proposal.** One task, in this order. COPY `engine-custom` into `engine.Dockerfile` with a copy
loop mirroring `engine-overlay.ps1:44`'s skip list plus a build-time assertion. Authenticate the
three `/setup*` routes with `management.ts:37-47`'s `authorised()` and add a test. Then set
`IDLESCAPE_MANAGEMENT_HOST=0.0.0.0` and `IDLESCAPE_HOOK_URL` on the engine service and
`ENGINE_MANAGEMENT_HTTP=http://engine:8897` on the server service, sourcing both secrets from
the same `SERVER_ENV_FILE` and generating them in `provision.ps1` at the 32-character floors in
`env.ts:37,43`. Refuse at boot on `production: true` with an empty owner secret. Add
`management` to `HealthSnapshot` and make `Wait-RemoteHealth` require it. Fold in the two
same-release extras: `no-store` on non-2xx in `proxy/http.ts`, and one structured request line in
`index.ts`'s fetch handler.

**Verifier.** Confirmed end to end against the live tree. Two corrections: the manifest lists
**29** new files, not 28; and `wiki` is **already** a field on `HealthSnapshot`
(`server/src/types.ts:43`) and already populated, so only `management` needs adding. Cite the
health probe unambiguously as `server/src/health.ts` (there is an unrelated `web/src/tasks/health.ts`
that SP4b owns). The `engine:up` regex in `cutover.ps1` is at line 45, not 44.

#### C09 - The wiki is outside every gate, and is never in the server image

**P0 - M - gap-follow-on - do now; the acceptance gate is not reproducible on a clean clone without it**

**Evidence.** `scripts/build.ps1` and `scripts/verify.ps1` contain zero occurrences of "wiki",
and `git log --all -p` over both never has. `wiki/build/` is gitignored and absent;
`server/src/wiki/db.ts:45-46` returns null and `server/src/wiki/routes.ts:39` 503s gracefully, so
`web/e2e/wiki.pw.test.ts:4-5` (which cites `verify.ps1` for the built database) fails
deterministically on a fresh checkout, while `2026-09-06-sprint-handoff.md:52` claims SPW passed
21 Playwright tests end to end. Fifteen `wiki/gen/*.test.ts` files and a `tsc --noEmit` never run
though `package.json:12` exposes `wiki:test`. `git ls-files wiki/data` returns 12 generated files
with **no `--check` gate**, against `scripts/build.ps1:60-66` which gates `atlas.json` and
`collision.bin` exactly that way, and against SP4b ruling R23 where a broken drift gate was
build-stopping. `deploy/docker/server.Dockerfile:74-76` never builds `wiki/` (`grep -rn wiki
deploy/` returns nothing), so `server/src/env.ts:65` resolves `WIKI_DB` to a path absent from the
image and `server/src/index.ts:21-22`'s 30-second reopen loop never succeeds: **`/wiki` 503s in
production forever.** The plan deferred the wiring behind a trigger that has fired
(`docs/superpowers/plans/2026-09-05-spw-wiki-corpus.md`, around line 4204) and `README.md:387-390`
still says it will happen once those scripts land. `wiki/gen/paths.ts:6` also sources only
`engine/content`, never `content-custom`.

**Proposal.** Add `bun run --cwd wiki build` to `build.ps1`, before verify step 7 starts the e2e
stack. Add a wiki stage to `verify.ps1` beside the firebase rules step (`bun run --cwd wiki test`
plus `tsc --noEmit` in `wiki/`). Give `wiki/gen/extract.ts` a `--check` mode on the model of
`scripts/gen/atlas.ts` and call it from `build.ps1`, excluding the gitignored `loc-spawns.json`.
Add a wiki build stage to `server.Dockerfile` and COPY the database into `/app`. Add wiki to
C07's release health assertion. Correct `README.md:387-390`. Record in the spec and in
`AUTHORING.md` that the extractors never read `content-custom`, with a loud failure in
`extract.ts` if it ever grows game-data fields.

**Verifier.** Every claim confirmed, including that no CI workflow exists as a backstop. Citation
drift only: the null-return and 503 are at `db.ts:45-46` and `routes.ts:39` (not `db.ts:43-44`);
`wiki:test` is `package.json` line 12; the README passage is at 387-390; the plan is
`docs/superpowers/plans/2026-09-05-spw-wiki-corpus.md` around line 4204.

#### C10 - Plugin and script state in localStorage is not keyed by uid, so it leaks between accounts

**P0 - M - reliability - do now, before entry 2; coordinate with entry 1, which owns `tasks/toggles.ts`**

**Evidence.** `web/src/plugins/settings.ts:18` is `const KEY = (id) => 'cs.plugin.' + id`, with
no uid. `writeLocal` (`:26-28`) is called from `mutate` (`:52`) for signed-in users too.
`load(uid)` (`:57-69`) enumerates **every** `cs.plugin.*` key in the browser (`:63` via
`localStorage_snapshot` at `:89-98`) and falls back to `readLocal(id)` (`:65`) for any id the
backend did not return. So user B inherits user A's enable flags and notes text, and then writes
them up to B's own Firestore document via `schedule()` (`:36-46`). This contradicts the ruling
written into `web/src/plugins/registry.ts:80-81` (a re-init should reflect the new user's stored
state rather than accumulating the previous session's plugins): the registry does its half at
`:82`, the store undoes it. The key shape was deliberately copied to `web/src/tasks/toggles.ts`
(PREFIX at line 22, `cs.script.`), whose header at `:1-5` says it is intentionally identical.

**Proposal.** Key the mirror `cs.plugin.<uid|anon>.<id>`; make `localStorage_snapshot` take the
uid and enumerate only that prefix; `load(null)` reads the anon bucket only; a one-shot migration
moves bare `cs.plugin.*` into anon. Apply the identical change to `tasks/toggles.ts` in the same
task. Test: `load('u1')`, `setEnabled`, `load('u2')`, assert u2 sees nothing.

**Verifier.** Confirmed line by line, including that no sign-out or auth-state-change hook clears
these mirrors in production code, and that SP4b task 9's `dirty`-set fix closes only a concurrent
in-flight-load race, not the key shape. One nit: `toggles.ts`'s `PREFIX` is line 22, not 23.

#### C17 - Environment templates are wrong in three directions, and two production values are literals in the shipped bundle

**P1 - S - security - do now**

**Evidence.** `server/src/env.ts:48-49` defaults `ENGINE_HTTP` and `ENGINE_WS` to
`127.0.0.1:8888` and `server/.env` is gitignored, so a fresh clone gets the defaults, while
`server/.env.example:2-3` says of that port "never point a dev front server at it" and
`README.md:302-303` confirms it is a raw 225 engine. Copying the template is worse: `:24` sets
`PUBLIC_ORIGIN=https://osrs.scotho.com` where `env.ts:61` gets the dev default right and the
engine rejects a mismatched `allowedOrigin`, and `:21-23` add a production project id, a
credentials path a fresh clone lacks, and `FIREBASE_EMULATORS=false`. `loadEnv` reads 17 keys
(`env.ts:28-67`); `deploy/lightsail/provision.ps1:88-96` writes seven;
`server/.env.production.example` (which `deploy/windows/register-tasks.ps1:22-24` still tells an
operator to copy) stops at the SP1 set with no `ENGINE_MANAGEMENT_HTTP`,
`ENGINE_MANAGEMENT_SECRET`, `OWNER_ASSERTION_SECRET` or `WIKI_DB`. `engine-custom/` reads seven
environment variables and ships no `.env.example` at all, against the non-moving constraint
"`.env.example` per process" at `2026-09-06-sprint-handoff.md:205`; `OWNER_REQUIRE_ASSERTION`
appears only inside a 4,254-line plan. `web/src/main.ts:264` prints the gate password literal
into the footer of every logged-in session and `web/e2e/helpers.ts:9` defaults to the same
literal; `web/src/frame/stage.ts:229` hardcodes `osrs.scotho.com` and world 1.

**Proposal.** Point the two `env.ts` engine defaults at 8899, or make them required so the
failure names the file to copy; pin the default in `env.test.ts` and note the code default in
`.env.example`. Make `server/.env.example` a working dev file and the single template
`provision.ps1` generates from, with a test that parses it and asserts it covers every key
`loadEnv` reads. Refresh or delete `.env.production.example` and point `deploy/windows/` at the
lightsail runbook. Add `engine-custom/.env.example` with all seven variables. Delete the password
literal from `main.ts:264` and the default in `helpers.ts:9`, and rotate the deployed password if
it is still the literal in the tree. Add `VITE_SITE_HOST` and `VITE_WORLD` and pass them through
`StageDeps`.

**Verifier.** Confirmed at every cited line. Two corrections and one escalation. `loadEnv`
returns **17** keys, not sixteen, and spans `28-67`. The framing "a fresh clone's dev server
points at the live PoC" overstates the risk to production: `deploy/docker/docker-compose.yml:44-53`
overrides `ENGINE_HTTP`, `ENGINE_WS`, `PUBLIC_ORIGIN`, `FIREBASE_EMULATORS` and `GATE_ENABLED` as
container environment values regardless of `server.env`, so the bad defaults never reach the live
site through the real deploy path; only a bare local `bun run src/index.ts` with no `server/.env`
is exposed. The escalation: a grep of the whole `deploy/` tree shows
`ENGINE_MANAGEMENT_SECRET` and `OWNER_ASSERTION_SECRET` are **never set anywhere in the
production pipeline**, so the live engine, which `config.ts` hard-forces into `requireOwner=true`,
is verifying owner assertions against an empty shared secret (or silently not registering the
routes at all). Fixing `.env.example` does not close that; `provision.ps1` and
`docker-compose.yml` must both gain the two keys. This overlaps C07 and should land in the same
release.

#### C18 - `boot()` can reject on a network blip and leave a blank page, and the health poll can pile up

**P1 - S - reliability - do now, before entry 2**

**Evidence.** `web/src/main.ts:322-328` `isGateOpen()` does a bare
`fetch('/client/client.js', { method: 'HEAD' })` with no `.catch`; `boot()` (`:351-356`) awaits it
and `:358` is `void boot();`. A `TypeError: Failed to fetch` (offline, DNS, front server not yet
up, mid-deploy) rejects `boot`, the rejection is voided, and nothing past `:354` runs: no
`enterApp()`, no home screen, no gate. All four screen partials start `hidden` in the static HTML
and the show/hide wiring only runs inside `state.onChange`, which never fires because `state.set`
was never called, so the body is genuinely blank. `watchHealth()` starts at `:353` but its only
visible output is `#offline-card`, which lives inside `#screen-frame`
(`web/src/partials/frame.html:18`) and is hidden for the same reason. `watchHealth` itself
(`:302-313`) is declared `async` with no `await`, fires a fetch every 1000 ms with no in-flight
guard and is never cleared; the fps interval at `:262` is likewise never cleared. No test anywhere
covers `boot`, `isGateOpen` or `watchHealth`.

**Proposal.** `const res = await fetch(...).catch(() => null); return res === null || res.status
!== 401;` so an unreachable probe boots the app and lets the health watcher take over, and wrap
`boot()` in a `.catch` that renders a visible failure line. Drop the pointless `async`, guard
`watchHealth` with an `inFlight` flag, and hold both interval ids so a future `shutdown()` can
clear them.

**Verifier.** Confirmed at every line, and the blank-page claim is if anything understated
(`'offline'` is never a `state.set()` argument anywhere, so the offline card is dead on this
path). **One correction that must be fixed before this ships:** the evidence said a slow
`/api/health` "is what happens when the engine is down". It is not.
`server/src/health.ts`'s `createHealth()` probes the engine on its own 10-second server-side
interval with a 3-second `AbortSignal.timeout`, and the `/api/health` route returns the cached
snapshot synchronously, so an engine outage returns `{engine:'down'}` instantly. The in-flight
guard is still worth adding, but the pile-up scenario is a hung or overloaded **front** server,
not a downed engine. Do not ship the stated justification.

#### C08 - An uncommitted production tunnel ingress routes another project's hostname, and the next release will silently delete it

**P1 - S - reliability - do now; needs an owner ruling**

**Evidence.** `git diff deploy/lightsail/cloudflared.yml` adds an ingress for
`other-site.example.com -> http://other-service:8787`, annotated in the file as a separate
compose project joining the `idlescape_internal` network on the same box (a correct name:
`deploy/docker/docker-compose.yml:15` sets `name: idlescape` and the default `internal` network
at `:87` resolves to `idlescape_internal`). It has been dirty in the working tree since at
least 2026-09-05 by file mtime, and `2026-09-07-sp4b-handoff.md:66-69` lists it among four things
a session must step around. `docker-compose.yml:72` mounts the file read-only into the
cloudflared container, and `release.ps1` ships `git archive ... HEAD` (line 74; the dirty-file
guard that `-Force` bypasses is at `:37-38`, and `:1-11` is explicit that HEAD ships either way).
`deploy/lightsail/box/up.sh` re-applies `--profile public` whenever a cloudflared container is
already running, so the next release does not merely fail to add the hostname: it restarts
cloudflared without it.

**Proposal.** Owner ruling on whether the ingress belongs in this repository. If yes, commit it
and record the cross-project dependency on the `idlescape_internal` network in
`deploy/lightsail/README.md`, so a future network rename does not break it silently. If no,
revert the working-tree change and move the ingress into `other-service`'s own connector
config. Either way, have `release.ps1` print the dirty tracked files it ignores under `-Force`
and warn specifically when any is under `deploy/`.

**Verifier.** Core claim confirmed end to end, including the `box/up.sh` restart path, which is
the part that makes it a deletion rather than an omission. Three corrections. **"The third
consecutive handoff to do so" is false** - only `2026-09-07-sp4b-handoff.md` mentions it; the
other two handoffs have zero hits. The four-things list is at lines 66-69, not 69-72. And
`release.ps1:37-38` is the dirty-file guard; the `git archive` that ships HEAD is at line 74.
The true dirty window is longer than stated (since 2026-09-05), which strengthens rather than
weakens the finding.

---

### 2.2 Fold into entry 1 (SP4b, tasks 9 to 15, in flight)

Six tasks. Entry 1's remaining tasks are 9 to 15; task 10 owns `runBanner.ts`, task 11 is the run
report and export, and task 15 is the spec reconciliation, so C01, C05 and C04 in particular are
cheapest inside it.

#### C01 - Trace coalescing silently drops xp and item deltas from every recorded run

**P0 - S - reliability - fold into entry 1, before task 11 closes**

**Evidence.** `web/src/tasks/trace.ts:36-50` merges consecutive same-target `xp` and `item` rows
inside a 10-second window by mutating the previous entry in place, then `push` returns at `:70`
**before** the subscriber fan-out at `:74`. The Worker's only subscriber
(`web/src/agent/worker.ts:212`) structured-clones the event across `postMessage`, so the host,
`runRecorder`'s buffer (`web/src/tasks/runRecorder.ts:51-61`) and IndexedDB all keep the *first*
row with its *original* delta forever. `push` accumulates into `xp` and `items` before coalescing
(`:67-69`), so `xpGained()` stays correct and the run summary and the exported trace disagree
with nothing to say so. A woodcutting run gaining 25 xp a tick records one `+25` row and drops
the rest of the minute. Read at `385e24d`; task 11 is being written against exactly these rows.

**Proposal.** When `coalesce` merges, still fan out the merged row (re-emit the mutated `last`,
or emit a correction row). Test: subscribe, push two `xp` rows one second apart, assert the
subscriber's view sums to `xpGained()`. Copy the subscriber set before iterating and guard each
call in the same pass (C02).

**Verifier.** Confirmed line for line at HEAD. Nothing closes it: `trace.test.ts` has a
"coalesces xp and item deltas within 10 s" test, but it asserts only against the trace object's
own accessors and never subscribes via `onEvent`, so it structurally cannot see the defect. Two
additions the candidate did not spell out. **It is player-visible today**:
`web/src/plugins/builtin/traceView.ts`'s `describeEvent` renders `+{delta} {skill} xp` per live
row, so a player watching the trace panel sees the stale first delta forever. And **task 11 ships
broken data on top of it**: `TasksApi.exportRun` emits `{ summary, events }` where `summary` is
correct and `events` is the corrupted buffer, so every export silently disagrees with its own
summary. The fix should also get a regression test at the recorder or report boundary, not only
in `trace.ts`, or a future refactor can reintroduce the drop one layer down.

#### C02 - Worker lifecycle: a late RPC respawns a terminated Worker, `dispose()` is not a fence, three request/reply mechanisms disagree

**P1 - M - reliability - fold into entry 1**

**Evidence.** `workerHost.post` (`web/src/agent/workerHost.ts:177-181`) spawns via
`ensureWorker` when `worker` is null; `answerRpc` (`:248-261`) posts unconditionally after its
await; `terminate()` (`:294-308`) nulls `worker` and rejects only the RPC-client direction.
`api.dispose()` (`web/src/tasks/api.ts:382-389`) terminates, then calls `onDispose` ->
`web/src/tasks/wire.ts:71` -> `transport.dispose()`, which settles every in-flight dispatch
(`web/src/agent/localTransport.ts:142`), resolving `answerRpc`'s await and spawning a fresh
Worker that is never terminated: **one leaked live Worker per closed character tab**, and
terminate-then-dispose is exactly the ordering that creates it. `stop()` returns early once idle,
so it cannot clean up. `LocalTransport.dispose()` (`localTransport.ts:133-147`) sets no flag, so
post-dispose `dispatch` and `say` re-enqueue, `getState()` still calls `hooks.getWorldState()`
(`:87`), and `humanInput` re-attaches canvas listeners via `wireHuman()` (`:132`).
`api.dispatch` (`api.ts:348-351`) skips `requireLive()`, alone among the api's methods, and
`api.ts:154` discards the `onStatus` `Unsub`. `workerHost` correlates `execute` and `compile` by
`createRpcClient`, `resume` by an untimed arrival-order FIFO, and `stop` by a second array plus a
grace timer: three idioms for one problem. `worker.ts:111-124` is the only unguarded fan-out in
the runtime, while `client/src/hooks/emitter.ts`, `workerHost.ts:117-121`, `tasks/router.ts:58-62`
and `api.ts:146` each carry their own copy of the same guarded emit. `worker.ts`'s `execute`
guard reads only `runner`, never the module-level `starting` flag. `client/src/hooks/world.ts:49-55`
polls with no ceiling and `:57` has no catch, so a throw loses the action event.

**Proposal.** A generation counter on the host: `post` does not spawn once terminated, and
`answerRpc` captures the generation before its await and drops a stale reply; test that
`spawns()` stays 1. A `disposed` flag on `LocalTransport`. `requireLive()` on `dispatch`, and
keep the `onStatus` unsub. Move `resume` onto `createRpcClient`. Extract the guarded emit helper
that exists verbatim in four files. Widen the execute guard to `starting || current ||
isRunning()`. Cap the `world.ts` wait with `maxWaitMs` returning busy, and wrap
`executor.execute` so a throw still emits.

**Verifier.** Every mechanism confirmed. Nothing closes it: the SP4b handoff parks a
superficially similar `localTransport` waiting-set item, but that is about `withTimeout`'s
`done()` on the normal-settle path, not this. The only existing terminate test covers the
RPC-client direction, which `rejectAll` already guards; the worker-to-main direction `answerRpc`
uses has no guard and no test. Corrections: `wire.ts` is `web/src/tasks/wire.ts` and the
`emitter.ts` model is `client/src/hooks/emitter.ts`; `client/src/hooks/world.ts`'s cited commit
`bb433eb` does not touch that file (its blame commit is `a9c0963`), though the code claim holds;
every `workerHost.ts` and `api.ts` line range is off by exactly one against HEAD, consistent with
SP4b editing underneath. One narrowing: "the execute backstop misses the whole of `startRun`'s
await" overstates reachability through the public api, because `host.status` flips to `starting`
synchronously inside `host.run()`; the exploitable window is `api.run()`'s own pre-host awaits.
The Worker-level gap is still real and still worth widening.

#### C03 - One params validator, and exhaustiveness pressure on the Worker protocol and the behaviour lists

**P1 - M - consistency - fold into entry 1**

**Evidence.** `web/src/tasks/params.ts:46-59` (used by `api.run` and `api.execute`) and
`web/src/tasks/defineScript.ts:18-34` (used by `worker.startRun`, `worker.ts:197`) disagree on
unknown keys, empty-schema passthrough, numeric strings (`params.ts:20` rejects,
`defineScript.ts:25` accepts) and text coercion. Because
`web/src/tasks/catalogue.ts:39,91` documents that a saved user script's row carries an empty
params schema, `api.ts:268`'s `schema = manifest?.params ?? {}` takes the passthrough branch for
**every** user-script run, while `defineScript.ts:33` rejects any key at all when the schema is
empty: the run is accepted by the api, fails in the Worker as "unknown param x", and
`api.ts:280`'s `recorder.begin` writes it to history as a failed run. Separately, `web/tsconfig.json`
sets no `noImplicitReturns` and the only exhaustiveness device in `web/src` is the
`Record<keyof Transport, true>` in `workerContext.harness.ts`: `worker.ts:110-147`,
`workerHost.ts:215-245` and `workerHost.ts:263-271` (`callTransport`, declared `unknown`, so a new
`RpcMethod` resolves with `undefined` instead of rejecting) all switch with no `never` arm, as do
the switches in `recovery.ts` and `healthMonitor.ts`. `web/src/tasks/behaviour.ts:13-16` types
`DEATH_BEHAVIOURS` and `STUCK_BEHAVIOURS` as readonly arrays assignable from any subset, and
`oneOf` (`:28-30`) downgrades a missing member to `'loot'`; the only test
(`tasks.settings.test.ts:44,53`) compares the panel's literals (`tasks.ts:337-356`, read at
`109ace8`) to the same array and never touches the union at `types.ts:129-138`, which is R27's bug
left unguarded. `TasksSettings` is per session (`api.ts:130`) over the shared `cs.` namespace with
a fan-out at `router.ts:150-153`, while `wire.ts:41-53` already rules exactly this for the toggle
store.

**Proposal.** Keep `params.ts`, give it an `{ ok, values, errors }` variant for the Worker,
delete `defineScript.validateParams`, settle the unknown-key rule once, and add one test
asserting the api and the Worker answer identically. Add a `never` default to the five switches.
Declare `Record<DeathBehaviour, string>` and `Record<StuckBehaviour, string>` label maps in
`behaviour.ts` and derive the arrays, the panel options and the bounds from them. Apply the
`wire.ts:41-53` ruling to settings in one sentence, or hoist one store into the composition root.

**Verifier.** All four sub-findings confirmed, including that the validator disagreement is
reachable on every user-script run rather than theoretical. Corrections: the evidence's
"(`params.ts:20` rejects, `:25` accepts)" is a transcription slip; the accepting line is
`defineScript.ts:25`, and `params.ts:25` is the unrelated `select` case (the synthesis document
has it right). Minor line drift throughout (`worker.ts` 110-147, `workerHost.ts` 215-245 and
263-271, `api.ts:130`). `recovery.ts` and `healthMonitor.ts` do have plain `default:` arms, so
they behave more gracefully than the three with none; the "no `never` arm" grouping still holds.
Note for the implementer: `worker.ts` (390) and `workerHost.ts` (380) are close to the 400-line
ceiling, so adding `never` arms cleanly may force a split first.

#### C04 - Task 15's reconcile pass must also fix the stale vendor note, mark the parked guards, and pin the constants

**P1 - S - agentic - fold into entry 1, task 15**

**Evidence.** `web/src/vendor/PATCHES.md:62-70` still says the client publishes no `cancelAll`
and that cancellation arrives with SP4 4.4. It arrived: `client/src/hooks/world.ts:70` implements
it, `client/src/hooks/types.ts:89` and `install.ts:32` publish it, and
`web/src/agent/localTransport.ts:95` calls it; `web/src/agent/types.ts:22-40` already says so
correctly. The SP4b handoff at `docs/superpowers/specs/2026-09-07-sp4b-handoff.md:302-303` parks
"one guard in `healthMonitor` that is unreachable today and documented as uncovered", but a grep
of `web/src/tasks` and `web/src/agent` for `unreachable today|uncovered|TODO|FIXME|deferred`
returns **nothing at all**: the ruling exists only in handoff prose, and the same is true of the
other parked sites at `travel.ts:105-106`, `travel.ts:135-142` and `localTransport.ts:161-175`.
Assertions against imported constants, the anti-pattern the handoff names at `:372` and that
`travel.test.ts:79-84` avoids by pinning `expect(MAX_LEG_TILES).toBe(52)`, appear unpinned at
`find.test.ts:129,204,306` and `client/src/hooks/objArt.test.ts:231`.
`web/src/tasks/library/index.ts:19-26` hand-copies 13 of `ScriptManifest`'s 15 fields; `health`
and `anchor` were added in SP4b (`af4cec4`) and never added to the list, and the function's own
doc comment already describes the structural derivation it should be doing.

**Proposal.** Rewrite that `PATCHES.md` section against the build and point at
`agent/types.ts:22-40`. Add one short comment at each parked site naming the ruling and why, with
task 15's new spec section pointing at the same list. Add `expect(MAX_RADIUS).toBe(52)`-style
pins beside the behavioural assertions. Derive `libraryManifests` structurally.

**Verifier.** All four threads confirmed. Task 15 exists and is already touching this ground, but
nothing in the handoff or the sprint asks it to do any of these four, so this is a scope
addition, not duplication. Corrections: `ScriptManifest` has **15** fields and
`libraryManifests` copies **13**, not 14 and 12 (the two omissions are correctly named);
`objArt.test.ts:136` already asserts `OBJ_ICON_MEMO_MAX > 0`, so the suite would not silently
accept a cap of 0, though line 231 is still unpinned against a specific value; and the grep for
the five parked-item terms returns **zero** hits in that area, not two.

#### C05 - The Escape panic key ignores the spent-Escape convention, swallows its failure, and cannot cross the iframe boundary

**P1 - S - reliability - fold into entry 1 (task 10 owns `runBanner.ts`)**

**Evidence.** `web/src/bank/gridInputKeys.ts:102-108` documents the convention and
`preventDefault`s while dragging (`:105`) and while an item is keyboard-held (`:145-147`);
`web/src/bank/view.ts:204-205` and `web/src/bank/contextMenu.ts:196` honour it.
`web/src/frame/runBanner.ts:210-215` (read at `31c46e0`) does not, and is registered on
`document`, and `preventDefault` does not stop propagation, so every Escape the bank spends on a
drag cancel, a held-item drop or a context-menu close **also pauses the running script**. Line
213 is `void d.api()?.pause('player').catch(() => {})`, so the player's panic key shows nothing
on failure, while `control()` at `:118-121` in the same file notifies on exactly the same shape
of failure. `web/src/frame/stage.ts:195-206` re-dispatches Escape out of each iframe with no
`cancelable: true` (so `preventDefault` on it is a silent no-op), on `document` rather than an
element, and with none of the original modifiers.

**Proposal.** Add `|| e.defaultPrevented` at `runBanner.ts:212` with a test dispatching a
cancelable, already-preventDefaulted Escape. Change `:213` to
`.catch(err => d.notify(err.message, 'error'))`, matching `:120`. Dispatch the iframe Escape with
`cancelable: true` and the original modifiers, and `preventDefault` the inner event if it comes
back `defaultPrevented`. Write the convention down once, outside the bank.

**Verifier.** No corrections: every citation and quoted line is accurate at `31c46e0`. Checked
that SP4b task 10's in-flight change to `runBanner.ts` touches only the detail line and health
pip and leaves `onKey` untouched, so the bug is present in both the last commit and the current
work in progress, and the fold-in placement is right. `runBanner.test.ts` has two Escape tests,
neither covering `defaultPrevented`. Note: task 10 has grown the file from 251 to about 299
lines; still under the ceiling, but it is filling up.

#### C06 - Two silent-failure seams in the runtime: history writes and generated-asset loads

**P2 - S - reliability - fold into entry 1**

**Evidence.** `web/src/tasks/runRecorder.ts:63-70` writes `events.slice()` on every `run_end`
regardless of whether the run id matches `current.summary.runId` (the document lookup one line
above does check), so a stale `run_end` (the synthesised killed-run end at
`workerHost.ts:312-327`, or one racing a restart) writes run B's trace into run A's row; the
`ended` set does not prevent the cross-run case. Every history write is swallowed
(`runRecorder.ts:58,70,73,84` all `.catch(() => {})`), so a quota-exceeded IndexedDB produces an
empty report with nothing said anywhere, and task 11 is building the report on it.
`web/src/tasks/atlas.ts:48` and `collision.ts:40` collapse a 404, a CSP refusal, a decode error
and an offline tab into the same silent answer, while `workerHost.ts:204-211`'s `warnDegraded` is
the pattern the host already uses; `travel.ts:88` re-fetches the atlas on every landmark
`travel.to` with no backoff. `scripts/gen/atlas.ts:92` writes `version: 1` and `atlas.ts:46` never
reads it. `find.ts:216-219` and `:136-139` peek only, so a cold Worker's first landmark call
returns `null`, the same value an unknown landmark returns, while `nearest()` at `:188` loads
first. The scene half-width 52 is derived independently at `travel.ts:18`, `find.ts:20` and
`scripts/gen/atlas.ts:80`.

**Proposal.** Guard the history write on run-id ownership; route the catches through an `onError`
dep and degrade visibly rather than answering not-found. Give both asset loaders an `onError` dep
wired in `runContext.ts` to a `warnDegraded`-style line plus a trace row, and cap the atlas retry
at 3. Export `ATLAS_VERSION` and refuse a mismatch. Kick `atlas.load()` at Worker start, or
document the cold-start null. Export one `SCENE_HALF_WIDTH` with its derivation.

**Verifier.** Every citation confirmed verbatim, including that `history.put` keys both stores off
`summary.runId` and that no SP4b design, plan or handoff mentions any of it while task 11 builds
directly on the same mechanism. No corrections of substance. One note for the fix's test: target
the cross-run case explicitly, `begin(A)` -> trace -> `begin(B)` -> trace -> deliver `run_end(A)`,
since the `ended` set already handles a duplicate end for the same id.

---

### 2.3 Before entry 2

Six tasks. Every other documentation finding routes through the first three artefacts, and entry
2 is the next thing that opens a plan and a ledger.

#### C11 - The front door: README is the 2026-09-04 validation write-up, CLAUDE.md is 26 lines about AWS, and the docs tree has no index

**P1 - M - gap-unspecced - before entry 2**

**Evidence.** `README.md:1-5` titles the repository `osrs_test` and states the goal as validating
that an OSRS-style TypeScript server exists; `:7` heads a candidate table and `:23-26` a rejection
list; `:402` is a 225-PoC verification section for an instance the stack no longer uses; `:387`
says `build.ps1` and `verify.ps1` do not exist while `package.json:8-9` wires both; the Layout
block (`:28-56`) omits `engine-custom/`, `web/`, `server/`, `firebase/`, `wiki/` and `deploy/` and
lists a 225-era `.py` script. Nothing in 418 lines mentions the agent runtime, tasks, plugins,
SDD, `docs/superpowers` or the sprint. `CLAUDE.md` (26 lines, committed 2026-09-06 at `2d681f0`)
is entirely AWS and Secrets Manager guidance for a service this project does not use, while the
binding rules live in `2026-09-06-sprint-handoff.md:185-199` and `:203-221` and the roadmap's
section 5. No docs index exists (`find docs -maxdepth 2 -iname 'index*' -o -iname 'readme*'`
returns nothing) against 29 specs and 17 plans totalling about 50,000 lines. Two live
consequences: **5 of the last 60 commits carry the wrong trailer** (`274f149`, `109ace8`,
`385e24d`, `1bfdc7d`, `86c905c`), and the `.claude/` runtime ignores live in
`.git/info/exclude:8-17`, which git never clones.

**Proposal.** Rewrite `README.md` as a front door: what idlescape is in five lines, the one-hop
map, four commands and what each proves, the never-edited list, and a link to
`docs/VERIFICATION.md`. Fold its deploy sections (`:190-297`) into the existing
`deploy/lightsail/README.md` and delete the validation and 225-PoC sections. Add an
`# idlescape` section above the AWS block in `CLAUDE.md`, under 60 lines, pointing rather than
restating: the never-edited list, the 400-line ceiling, PowerShell 5.1 only, Playwright from
`web/`, the settled commit trailer, `git add <paths>`, and the two worktree hazards with their
recovery command. Write `docs/README.md` as a one-hop authority table (subsystem -> spec, plan,
ledger, verification command) plus a spec inventory marking superseded documents. Move the
`.claude/` patterns into `.gitignore`, keeping `!.claude/skills/`.

**Verifier.** Confirmed on inspection, including the missing index and the `.git/info/exclude`
risk. Three corrections, all of which make the finding worse rather than weaker: the rejection
list is `:23-26`, not `:24-28`; the wrong-trailer count is **5 of the last 60**, not 3, and the
SP4b run in progress is still producing the wrong trailer; and `.git/info/exclude` holds **10**
`.claude/*` patterns, not seven. One correction to the proposal: `deploy/lightsail/README.md`
already exists at 109 lines, so fold into it rather than creating a competing `deploy/README.md`.
The spec and plan total is about 50,000 lines, not 46,000.

#### C12 - No document lists the checks a change must pass before it is claimed done

**P1 - M - agentic - before entry 2**

**Evidence.** The closest thing is `scripts/verify.ps1:1-15`, a header that omits two of its own
steps: the engine unit tests at `:141-145` and the manifest-git-tracked check at `:88-113`.
Per-package commands are in `web/package.json:5-13` and `server/package.json:5-8`; the rules that
make them correct are scattered across `2026-09-06-sprint-handoff.md:197` (Playwright from
`web/`), `:198` (PowerShell 5.1), `:199`, and `2026-09-07-sp4b-handoff.md:44-48` (the
atlas/collision `--check` must run from the repository root, and `npm run verify` has never been
run for that sub-project). Nothing states the escalation from per-task to per-sub-project to
pre-deploy. One rule is also stated absolutely and is wrong: `sprint-handoff.md:199` forbids a
plain `npm run build` in `web/`, while `scripts/build.ps1:34-37` does exactly that, correctly, to
produce the shipped bundle.

**Proposal.** Write `docs/VERIFICATION.md` in three tiers. Per-task: typecheck, lint, the touched
package's unit suite, and a mutation-to-test table. Per-sub-project: `npm run verify` green with
all seven steps named. Pre-deploy: `build.ps1`'s drift gates, the overlay `-Check`, the
manifest-tracked check, and C07's release health assertion. Give each command the environment
trap that makes it correct and the recovery for a broken install. Reword
`sprint-handoff.md:199` to name the case rather than forbid the command. Update `verify.ps1`'s
header to list every step its body performs. Link from README and CLAUDE.md.

**Verifier.** Confirmed, including the `npm run build` contradiction, which is real because the
rule does not scope itself to the dev loop. `2026-09-06-sprint-handoff.md` section 6 states the
per-sub-project bar and nothing else, so it does not close this. One citation fix: the
`sp4b-handoff.md` content described is at lines **44-48**, not 33-38 (33-38 is the task table),
and the file is `docs/superpowers/specs/2026-09-07-sp4b-handoff.md`.

#### C13 - The SDD convention deletes the ledger at close, and rulings are being lost

**P1 - M - agentic - before entry 2, which opens the next ledger**

**Evidence.** `2026-09-06-sprint-handoff.md:25` instructs deleting the ledger directory on a
clean final review, repeated at `:228-230` and per-plan in the SP4b plan around `:6097`. On disk
`.superpowers/sdd/` holds 8 implementation ledgers against 17 plans; sp4a, sp6, sp7, sp8, sp8b,
spw and lightsail-hosting are gone. `2026-09-07-sp4b-handoff.md` exists only to hand-reconstruct
one, costs 423 lines, and does so **on a false premise**: `:7-12` and `:172` say the workspace is
gone while `.superpowers/sdd/2026-09-06-sp4b-bot-expansion/progress.md` is present at 317 lines
with 21 review diffs and 20 task briefs and reports, and the concurrent SP4b run is using it right
now. The practice is contested: `.superpowers/sdd/2026-09-04-idlescape-platform/progress.md:202`
records a deliberate exception ("Ruling: NOT deleting this plan workspace (SDD would)"). Five
in-repo files cite a deleted or misnamed ledger as their authority, one of them production code:
`server/src/firebaseAdmin.ts:21` (sp6 directory gone), `scripts/verify.ps1:13` (wrong prefix
`docs/superpowers/sdd` **and** wrong slug), `2026-09-05-sp8b-web-bank-design.md:253` (sp8b gone),
roadmap `:7` (wrong slug) and `:155` (sp8 gone), and
`specs/phase-a/2026-09-05-phase-a-agent-auth-architecture.md:38` (wrong slug). The slug mismatch
is systemic: the plan is `2026-09-04-idlescape-platform.md`, the directory
`2026-09-04-idlescape-platform/`. Three open items in this audit exist **only** inside those
directories, and SPW's rulings survive only as a 20 KB file in machine-local memory.

**Proposal.** Replace the delete step with a **promote** step: at final-review-clean, `progress.md`
is condensed into `docs/superpowers/ledgers/<plan-basename>.md` and committed with the closing
commit, and only then is the workspace removed. Amend `sprint-handoff.md:25` and `:228-230` and
the plan template; fix the SP4b handoff's two false sentences. Rewrite the five citations,
inlining the two-sentence reason at `firebaseAdmin.ts:21` so the code stands alone. Promote
`spw-wiki-corpus-ledger.md` out of memory. Add a docs-index check that greps for
`.superpowers/sdd` outside `.superpowers/` and fails on an unresolvable path. Write the artefact
shape down: it is demonstrated nowhere described.

**Verifier.** Confirmed against the live tree, including the deliberate exception quoted verbatim
and all five broken citations. Correction: the SP4b ledger holds **20** brief and report files
(10 briefs, 10 reports), not 18; the 21 review diffs is right. A distinction the fix should
carry: the wrong-slug citations point at a directory that **never existed** under that name (a
product-rename artefact), which is a different failure from the genuinely-deleted-target
citations, and from `verify.ps1:13`'s wrong prefix and wrong slug together. Note: the promoted
ledger artefact must itself respect the 400-line ceiling.

#### C14 - Four status documents contradict each other and one attribution record is false

**P1 - S - consistency - before entry 2; raise the SP3 owner ruling now rather than at entry 7**

**Evidence.** `2026-09-06-sprint-handoff.md:52-53` lists SP3 as done and verified, against the
sprint's section 4 (`:186-208`), which rules it wrong with evidence; the roadmap's SP3 row (line
134), in the document that declares itself the authority on what each SP delivers, still reads
unqualified. `sprint-handoff.md:43` still says work lands on `feat/platform-shell` against the
sprint's section 5; `:60-62` says SP5 is not in the sequence while the sprint sequences it ninth.
`CREDITS.md:14` claims the 225-gpu `Renderer` facade and the WebGL and WebGPU back ends were
ported as the `gpu-renderer` plugin ("Yes, ported and wrapped"), and `client/src` has no
`renderer/` directory while `gpu-renderer` has zero code references; `:15` leaves `REBUILD_REGION`
as an unresolved conditional whose condition never came true (the string appears nowhere in the
pinned engine, and SP1b's own task-5 report recorded it was never ported); `:22` calls
`sdk/pathfinding.ts` a signature-compatible stand-in, which SP4b task 4 made false while updating
the file header and `web/src/vendor/PATCHES.md` and not `CREDITS.md`. And the sprint's
`:224` ("an entry needs an approved spec") is broken by entry 5's own spec header at
`2026-09-07-battlebots-minigame-design.md:10`, still reading "Status: draft, pending decisions in
section 19".

**Proposal.** Amend `sprint-handoff.md:53` to record SP3 as partial with a pointer to the
sprint's section 4, correct its section 3 SP10 entry and its section 1 branching paragraph, and
add a superseded banner naming what still applies (sections 1 minus branching, 4, 5, 6) and what
does not (2, 3). Amend the roadmap's SP3 row. Move the two false `CREDITS.md` rows into an
"Evaluated, not taken" subsection, add the same status line to
`2026-09-05-sp2b-gpu-spike-findings.md`, and fix the pathfinding row. Mark the battlebots spec
approved with a header recording which gates its plan closed, or amend the sprint's `:224` and
name entry 5 as the precedent. Put the SP3 ruling to the owner now, a completion entry ahead of
SP10 or a descope, noting that the client half does not exist either: SP2 reserved
`ctx.snapshots.push(reason)` (SP2 spec `:163-164`) and `web/src/plugins/types.ts` has no
`snapshots` member.

**Verifier.** Every sub-claim confirmed at the cited location, including that the sprint's own
section 4 "resolves nothing on its own authority" so the stale documents remain stale. Two
softenings. The "~1,550 lines across five documents" figure could not be reproduced: the four
named documents total 752 lines, and reaching 1,550 requires an unnamed fifth; either name it or
drop the figure. And `CREDITS.md:15` is more hedged than `:14` ("Ported if the 274 engine emits
the packet"), so describe it as a dangling conditional rather than a false completion claim. Also
worth telling the owner: entry 5's plan has already settled 10 of its spec's 12 open decisions,
leaving D4 and D5 deliberately deferred, so "approved" is closer than the draft header suggests.

#### C15 - An orphan spec formally amends the SP4 design that entry 8 will be built from, and overlaps entry 2's co-pilot bar

**P1 - S - gap-follow-on - before entry 2**

**Evidence.** `docs/superpowers/specs/2026-09-05-goals-and-autopilot-design.md:1-10` reads
"Status: draft for owner review. Amends: 2026-09-05-sp4-agent-runtime-design.md (adds a Goals
store, a three-mode selector ... changes SP4's fixed co-pilot rule to a human-chosen mode)". It is
293 lines, with `:286-293` carrying four unanswered owner questions. It appears in no roadmap row
(`:120-157`), in neither handoff's sequence, and in no sprint entry; its only trace is
`.superpowers/sdd/2026-09-05-entry-screen-retrofit/progress.md:56` ruling 7. Zero code:
`autopilot`, `goalId` and a Goals store have no references in `web/src` or `server/src`. The
sprint's `:224` covers a row without a spec; nothing covers a spec that claims to amend an entry's
authority.

**Proposal.** Put the four questions to the owner, then either give the spec a row in the
sprint's section 2 (after entry 8, on which it depends) or mark it superseded in its own header.
Either way record what entry 2's co-pilot bar takes from it: the shell v2 design already ships a
bar with five run states, overlapping this spec's three-mode selector, and the winner must be
stated before entry 2 builds it. SP4c must not be planned while a second document claims to have
amended its spec.

**Verifier.** Confirmed, and understated. Entry 8's immediate authority is
`2026-09-05-sp4-tasks-scripting-environment-design.md`, not the agent-runtime design directly, and
that document explicitly declares itself "Consistent with 2026-09-05-goals-and-autopilot-design.md
(its Autopilot loop drives the runner defined here)" - so entry 8's runner is already declared
dependent on the unresolved orphan. The entry 2 overlap is concrete, not superficial:
`docs/design/idlescape-shell-v2/README.md:81-86` hardcodes the fixed co-pilot behaviour
("paused - you took control", "Esc take control") as one of the bar's five states, which is
exactly the rule the orphan proposes replacing. Precision note: name the tasks-scripting document
as entry 8's authority.

#### C16 - The static gate: the 400-line ceiling is enforced by nothing, and tests, e2e and the whole client fork are never typechecked

**P1 - M - agentic - before entry 2; the `ownerBank.ts` split specifically before entry 4**

**Evidence.** The ceiling is cited at `2026-09-06-sprint-handoff.md:205`, roadmap `:192`,
`.claude/skills/idlescape-design/SKILL.md:32` and the sprint's `:78`, and enforced nowhere: a grep
for `max-lines` across `web/`, `server/` and `client/` configs returns nothing and `400` appears
nowhere in `scripts/*.ps1`. It is caught only after the fact: `sp4b-handoff.md:38-39` and `:392`
record `tasks/api.ts` reaching 418 and `worker.ts` 401 mid-task, and `274f149` is a refactor
commit whose subject is splitting two files at the ceiling. Today: `web/styleguide.html` 504
(recorded at `sp8b-web-bank-design.md:359-370` at 490, and growing inside entry 2),
`engine-custom/src/idlescape/ownerBank.ts` 394, `sessions/manager.test.ts` 396, `tasks/api.ts`
390, `agent/worker.ts` 390, `agent/workerHost.ts` 380, `main.ts` 358 and growing per plugin.
`web/tsconfig.json:18` excludes `src/**/*.test.ts` and `e2e/**`, and `web/package.json:12` lints
`src/` only, while Vitest and Playwright typecheck nothing, so a test can drift from a changed
interface and `verify.ps1:188-190` stays green; `web/e2e/helpers.ts` is 328 lines with no static
gate at all. `client/` is the only TypeScript package with no typecheck of any kind
(`verify.ps1:152` runs `bun test`, `build.ps1:72` runs `bun run build`) while
`client/PATCHES.md:34` claims every upstream bump re-runs `bunx tsc --noEmit`.

**Proposal.** Add `max-lines 400` to `web/eslint.config` with a `src/vendor/**` override so
`npm run lint` (already verify step 4) fails on the ceiling, plus an equivalent line-count check
in `build.ps1` for `server/src`, `client/src/hooks`, `client/src/plugins` and `scripts/gen`,
recording the exemptions (the `client/` fork, `vendor/`, `engine-custom/src/web.ts` as a
whole-file replacement) in one place. Add `web/tsconfig.test.json` including `src` and `e2e` with
vitest and vite types, chain `typecheck:tests` from `typecheck` so verify picks it up unchanged,
widen lint to `e2e/`, and fix the first-run backlog in the same task. Add a `typecheck` script to
`client/package.json` and a verify step, with a scoped tsconfig if the pristine tree does not
pass. Split `ownerBank.ts` before entry 4 opens it and pick a seam for `api.ts` before the next
task forces one.

**Verifier.** Every specific claim confirmed, including the `client/PATCHES.md` contradiction and
that `styleguide.html` has grown further, to 504. Two corrections. The roadmap's ceiling sentence
is at line **192**, not 198. And the placement rationale overstates the specs: grepping both the
time-candy and battlebots documents for `OwnerBankStore` or `ownerBank.` returns zero hits, so
neither entry demonstrably lands code inside `ownerBank.ts` itself (entry 4 adds a parallel
`candyLedgerFile.ts`, entry 5 reuses the route-registration pattern). Justify the split as "no
headroom left at 394", not "two entries will extend it". Useful precedent for the implementer:
`build.ps1:47-54` already does exactly this shape for `scripts/gen` (its own `tsconfig.json` plus
a `tsc --project` step); follow it rather than inventing a second mechanism.

---

### 2.4 Fold into entry 2 (shell v2)

Three tasks. All of them are code entry 2 already opens, and one of them (C20) is the moment or
never.

#### C19 - The plugin runtime seam: `settings.subscribe` is dead, `deactivate` leaks its panel, listeners accumulate, and the lifecycle has no test

**P1 - M - reliability - fold into entry 2, which rewrites `panels.ts`, the strip and the plugin surfaces**

**Evidence.** `web/src/plugins/types.ts:35-39` declares `PluginContext.settings.subscribe`;
`web/src/main.ts:169` implements it as `subscribe: () => () => {}`. There is a live consumer:
`web/src/plugins/builtin/tasks.ts:285` (read at `109ace8`) uses it to push `onDeath`, `onStuck`
and `maxRelogins` to the run runtime, so a player changing "When I die" gets the old behaviour
until the panel is reopened; `statusHud.ts:51` reads once at `onEnable` and `xpTracker.ts:13`
re-reads every render, three plugins with three answers, and eight test files stub the same broken
fake. `web/src/plugins/registry.ts:51-61` `deactivate` never tells `panelCtl`, so
`panelCtl.current()` still returns the disabled id, `#side-panel` lacks `hidden`, and `cs.panel`
still names it; `panelCtl.restore()` (`frame/panels.ts:58-62`, called from `main.ts:292` and
`stage.ts` on every character switch) re-opens a view the registry already unmounted, whose
`views` entry was never dropped (`panels.ts:56` only sets), which `panels.ts:31` then unmounts a
second time. `panels.ts:33` `replaceChildren()`s a **stable** `#panel-body`, and four views
delegate off it in `mount` and remove nothing in `unmount` (`xpTracker.ts:32`,
`lootTracker.ts:29`, `screenshot.ts:48`, `pluginsPanel.ts:46,55,62`), so five open-and-close
cycles of Screenshot download five PNGs per click; `marketplace.ts` and `connect.ts` get it right
two files away. `registry.test.ts`'s eight tests touch none of it, and `types.test.ts:5` asserts
that an identity function returns its argument.

**Proposal.** Give `createSettingsStore` a real `subscribe(id, fn)` and wire `main.ts:169` to it,
then pick one documented answer for settings reactivity. Add `onPanelRetired(id)` to
`RegistryDeps` plus `panelCtl.unregister(id)` so the stale view and the stale `cs.panel` key go
with it, and document or guard double-unmount. Have `panels.ts:33` mount into a fresh child
element per open: one change fixes all four listener leaks and makes the class of bug
unrepresentable. Replace `types.test.ts` with `registry.lifecycle.test.ts` driving a spy plugin
through init, enable, mount, unmount, disable and re-enable, asserting call order and counts.
Iterate a snapshot in `registry.ts:123` `onTick`.

**Verifier.** Every claim verified, including tracing the disabled-panel consequence through
`rebuildStrip` (it conditionally opens but never closes) and confirming the five-PNGs
consequence mechanically. Checked whether entry 2 already fixes it as a side effect: its plan
rewrites all four leaking panels and even states "unmount() releases every timer and
subscription" as a constraint, but its actual tasks add only timer cleanup, never touch
`ctx.settings.subscribe` or `main.ts:169`, and add no registry or `panelCtl` unregister path. So
the placement is right and the fold-in must be deliberate. Corrections: `tasks.ts`'s subscribe
call has moved to line 298 at current HEAD, so re-grep rather than trusting `:285`;
`registry.ts`'s `deactivate` is 51-61, not 53-64.

#### C20 - Two plugin registries, two style dialects, two DOM-building mechanisms, and one drift gate covering one stylesheet

**P2 - L - consistency - fold into entry 2, which retires the `.p-*` dialect outright**

**Evidence.** `web/src/frame/panels.ts:3-7` defines `PanelView`, a `PluginManifest` with
`id: PanelId; tier: 'shell'`, and `createPluginRegistry`; `web/src/plugins/types.ts:15-29` defines
a **different** `PluginManifest` consumed by `createShellRegistry`
(`web/src/plugins/registry.ts:27`), both called "the plugin registry" in comments, joined by three
unchecked casts from `string` id to the closed `PanelId` union (`main.ts:176,203,249`).
`panels/account.ts:6`, `config.ts:4` and `connect.ts:12` each export a manifest nothing imports
while `main.ts:223,238,239` retype the same fields inline. `button.css:2`, `forms.css:2` and
`data.css:4-26` carry `.p-*` aliases "kept for existing markup", `web/styleguide.html:173,269`
documents both sets, and nine non-test files mix them (`config.ts:34` mixes `.field-inline` with
`.p-input` on one line). `web/src/ui/el.ts:1` states that panels build DOM without `innerHTML`
strings, yet nine files build panels with `innerHTML` plus hand-called `escapeHtml`, and `kv()`
renders the same row two ways. `web/src/styles/bank.test.ts:1-9` is the only class-contract gate
and exists because two class names drifted during review; nothing covers the other twelve
stylesheets or the hand-maintained styleguide.

**Proposal.** Rename `frame/panels.ts`'s type to `PanelDescriptor` and its factory to
`createPanelHost`; delete the three dead manifest exports or import them; replace `PanelId` with
`string` and let `rebuildStrip` be the single authority on what is openable. Write the markup
rule in one place (a Panels section in `ui/el.ts`'s header, or `web/src/ui/CONVENTIONS.md`):
build with `h()`, `.p-*` is frozen legacy; convert the four smallest offenders in one task so the
majority flips, and mark the alias blocks deprecated with a remove-after note. Confirm and
execute the two pieces entry 2's own spec already commits to (retiring `.p-*`, section 4 G9; the
styleguide-completeness and no-per-panel-selector checks, section 5 items 2 and 4) rather than
re-scoping them here.

**Verifier.** Real, but **scope reduced** and one claim corrected. The central causal claim
"a plugin outside the union type-checks, appears in the strip and silently never opens" is
**wrong**: `as PanelId` casts erase at runtime, and the shipped `notes` and `screenshot` plugins
have ids outside the union and open correctly today. This is a type-staleness problem, not a
functional bug, and must be described that way. `createShellRegistry` is in
`plugins/registry.ts:27`, not `types.ts`. The styleguide lines are `web/styleguide.html:173` and
`:269`, not 171/267. "Eleven files mix them" overcounts: **9** non-test files carry a `.p-*`
literal (the separate count of nine `innerHTML` plus `escapeHtml` files is correct). And the two
costliest items in the proposal are **already committed inside entry 2's own spec**, so the
net-new ask is only the `PanelId` and `PluginManifest` consolidation and the dead exports, which
that spec explicitly leaves unresolved. Priority stays P2; effort is smaller than L once scoped
that way.

#### C21 - Entry 2 scope additions: the recorded SP8b gaps, the a11y contract, the mute toggle, and one localStorage accessor

**P2 - M - gap-follow-on - fold into entry 2's spec, section 6**

**Evidence.** `2026-09-05-sp8b-web-bank-design.md:359-370` records three known gaps with no
owner: no focus trap and no `aria-modal` on the bank dialog, `BankPluginDeps.closePanel`
"constructed and passed but never called" (still true: `main.ts:221` passes it while the real path
is `onClose` at `:219`), and the styleguide over the ceiling. Entry 2 rebuilds the bank window and
the styleguide and mentions none of them. `web/src/partials/frame.html:23` makes `#side-panel`
`aria-live="polite"` while everything mounted into it repaints on a 1 to 5 second timer
(`xpTracker.ts:35`, `lootTracker.ts:32`, `tasks.ts:127,132` at `109ace8`, `connect.ts:219,242`),
so a screen-reader user hears the whole panel every five seconds, and `runBanner.ts:105-116`
(at `31c46e0`) reasons about exactly this hazard one element away by marking its ticking spans
`aria-hidden`. `web/src/ui/strip.ts:9-19` is a `role=tablist` whose tabpanel does not exist, and
`strip.test.ts` is fed a bare `<nav>` so it cannot see the missing half. The mute toggle and
`setAudioMuted` were moved to "a later sub-project" by the multi-char spec, the SP7 spec section 7
and the roadmap, and have zero references. `web/src/styles/index.css` imports `tasks.css` at both
`:8` and `:14`, placing tasks rules after `bank.css` against the file's own line 1. `main.ts`
touches `localStorage` unguarded at module top level (`:50,51`) where a throw kills the bundle,
while every other site guards it and `bank/view.ts:49-54` says why; the `cs.` namespace has seven
writers, no inventory, two near-identical prefixes (`cs.pl.` and `cs.plugin.`), and one wildcard
writer at `tasks/wire.ts:29-32` whose comment states the hazard as a mitigation. `config.ts:36`
renders the Hide-overlays checkbox with no `checked` binding and `:47` discards the return, and
`main.ts:147` persists nothing unlike `:144-145`.

**Proposal.** Add all of it to entry 2's spec section 6: focus trap and `aria-modal` with the bank
rework; the styleguide split with the CSS split; deleting the dead `closePanel` in the same pass;
dropping `aria-live` for `role=tabpanel` plus `aria-labelledby` with `aria-controls` on each strip
button, routing real announcements through `ui/toast.ts:19` and extending `strip.test.ts` with a
fixture that includes the panel; a per-tab mute control on the new tab strip (a small client patch
beside patch 23's `setRenderSuspended`); deleting one of the two `tasks.css` imports with a
no-duplicate-`@import` assertion in `bank.test.ts`; and one `web/src/ui/storage.ts` with the
guarded accessor plus a `KEYS` inventory, converting all seven sites, giving `wire.ts` a
`cs.tasks.` prefix, renaming `cs.pl.` to `cs.pluginData.`, testing that every literal `cs.` string
appears in `KEYS`, and persisting `hideOverlays` with `setOverlaysHidden`/`getOverlaysHidden`.

**Verifier.** Every fact confirmed by direct read, and independently corroborated from a source
the candidate did not cite: entry 2's own section 2 fact table lists the localStorage keys in use
and **misses** `cs.pl.<id>.<k>` and `cs.script.<id>` entirely, which is the same inventory gap.
One correction: `web/styleguide.html` is now **504** lines (it grew during SP4b), not the 490 the
SP8b document recorded; quote the document as a quote, but state 504 as the current count.

---

### 2.5 After entry 2

Two tasks. Both are the durability problem, and both are cheapest once the panel and plugin
patterns have settled.

#### C31 - The reconciliation convention is honoured once out of eleven times

**P1 - M - gap-follow-on - after entry 2; SP2's section is the urgent one and is a 30-minute job**

**Evidence.** `2026-09-06-sprint-handoff.md:227-230` requires each sub-project to end with its
spec reconciled against the build, citing SP8b as the model; a heading dump across every spec
finds exactly one such section, `2026-09-05-sp8b-web-bank-design.md:250` ("Built as"). SP1, SP1b,
SP2, SP2b, SP2c, SP3, SP4a, SPW, SP6, SP7, SP8 and the lightsail spec have none. Live costs:
SP2's spec `:143-160` still presents nine Tier 1 plugins when five exist, and their generators are
absent from `scripts/gen/`, with the deferral recorded only in a git-ignored ledger tail
(`.superpowers/sdd/2026-09-05-sp2c-tier1-shell-plugins/progress.md:21`). SPW's authoring backlog
(spec `:420-424`) is named as remaining work at `sprint-handoff.md:236-238` and has no sprint row;
`wiki/content/` holds five files against a generated queue in `wiki/data/274/gaps.md:5` listing
11 quests with no start NPC, and SPW decision 5's promise to keep 225 data beside 274 is unmet.
The lightsail spec is 86 lines ending at "## Testing" with three concrete divergences from the
code (relative versus absolute secret paths, port-forward versus `box/health.sh`, `.env.local`
versus `web/.env.production`) and a Components block listing 6 of 14 files, of which the
undocumented `public.sh` sounds like it changes the box's exposure. Three deploy runbooks exist,
one live, and `deploy/lightsail/README.md:47` cites `/api/bridge`, which
`server/src/router.test.ts:9` asserts is `notfound`.

**Proposal.** Add a final "What SPn actually built" section to the SP1b, SP2, SP2b, SP2c, SPW,
SP6, SP7, SP8 and lightsail specs on the SP8b section 12 model. SP2's states that four Tier 1
plugins and both generators did not ship, that the GPU renderer was never finished at all, that
the client-tier registry landed with no consumer (C32), and that the snapshots seam was reserved
and skipped. Either add a sprint row for the SPW backlog (`gaps.md` is already the work list) or
state that phases B to D are descoped and what phase A closed at, and drop decision 5 with a line
saying the 225 corpus was not retained. Extend the lightsail Components block to all fourteen
files with a one-line purpose each, say plainly what `public.sh` does, and correct or strike the
three diverged lines. Put a SUPERSEDED header on `deploy/windows/*.ps1` and fix the `/api/bridge`
line.

**Verifier.** Confirmed throughout, including all three lightsail divergences and the
`/api/bridge` contradiction. Corrections: the lightsail directory holds **14** tracked files, not
eleven, so the Components block documents 6 of 14. `deploy/docker/README.md` **already** carries a
"Where this runs now" banner and a "Historical: Oracle VM notes (superseded)" section, so only
`deploy/windows/*.ps1` still needs one. Two routing notes for whoever writes the sections: SP2 was
executed as four separately-ledgered slices (sp2a, sp2b-1, sp2c, sp2c-2), so its reconciliation
rolls up four ledgers; and SP6 and SP8 have no standalone design spec to append to (SP6's design
lives in `2026-09-05-multi-character-platform-design.md`, which also has no such section, and SP8
has only a plan plus a roadmap row and a README section).

#### C33 - One project skill exists; eight repeated tasks have none

**P2 - L - agentic - after entry 2, once the panel and plugin patterns have settled**

**Evidence.** `git ls-files .claude/` returns one file,
`.claude/skills/idlescape-design/SKILL.md`, added at `b3eb51f`. It is well formed - a description
opening with "Use when...", a read-first list, non-negotiable rules, working modes - and is the
template to copy. Nothing covers the tasks every sub-project repeats: bringing the stack up
(`start-stack.ps1`, about two minutes, five ports, documented only at
`2026-09-06-sprint-handoff.md:56-58` and in machine-local memory), running verify (293 lines,
seven steps), writing an engine overlay patch (`PATCHES.md` plus `manifest.json` plus the
pinned-blob drift check), adding a client patch (numbering is at 28), adding a plugin or a panel,
adding a library script (the HELPERS trap, C25), the SDD ledger convention, and vendoring an
external spec - which already has two shapes against one rule: the sprint's `:228-230` describes
an inline header, battlebots follows it literally, and the shell v2 bundle went to `docs/design/`
with a separate `PROVENANCE.md` that is the better artefact and is not what the rule describes.
`docs/superpowers/measurements/` holds one file that nothing links to.

**Proposal.** Author eight skills under `.claude/skills/`, each with a one-line "Use when" trigger
and each naming its authority file and its verification command: `idlescape-stack`,
`idlescape-verify`, `idlescape-engine-overlay`, `idlescape-content-overlay` (carrying the pinned
pack-id table), `idlescape-client-patch`, `idlescape-plugin`, `idlescape-library-script`,
`idlescape-sdd`. Write `idlescape-sdd` as the convention C13 is missing: the directory layout with
each filename's purpose, the `progress.md` sections, when a ruling is recorded rather than
escalated, the close-out sequence ending in promotion, the ledger naming rule, the vendoring rule
covering both shapes, and the rule that a measurement a spec gated on goes in `measurements/`
rather than the ledger.

**Verifier.** Every fact confirmed, including the two vendoring shapes and the orphaned
measurements file. Entry 2's plan step 5 adds one sentence to the existing design skill, which
extends the template and closes none of the eight. Correction: the merge list is wrong - AG-23
and AG-24 landed in C35, not here; this candidate merges AG-06 only.

---

### 2.6 Before entry 4

Three tasks. Entries 4 and 5 are the first two to append to `content-custom/pack/*` and the first
to lean on the overlay machinery hard, so these close before entry 4 opens.

#### C22 - The pack-id renumbering hole: three of the four packs the sprint allocates are not in the repo, two `packAll` paths have no guard, and the production build steers the operator into disabling the check

**P0 - M - reliability - before entry 4**

**Evidence.** The sprint's section 3 allocates `obj` 3894 and 3895, `inv` 217, 218 and 219 and
`loc` 4671, but `content-custom/pack/` holds only `varp.pack`: `obj.pack`, `inv.pack` and
`loc.pack` are not in the repository, making `engine-custom/tools/pack/BuildOverlay.ts:68`'s
instruction to add the missing id lines by hand impossible for three of them, while the real
recovery (copy the upstream pack, then append) is unnamed there. The guard compares each pack to
itself across one `packAll` (`:44` versus `:64`), so it detects a rewrite but never that an id
matches the allocation, and it runs **after** `packAll` (`:52`) has written the renumbered file.
`deploy/docker/engine.Dockerfile:86` packs with `npm run build` with verify defaulting true, and
its stale comment at `:46-49` still claims `content-custom` lists no files when it now lists
`pack/varp.pack` (varps 359 to 367), so `engine/server/src/util/PackShared.ts:314` throws a
checksum mismatch whose advice (`BUILD_VERIFY=false`) **cannot work**, because
`WorldConfig.ts:295-298` returns as soon as `world.json` exists, before any `BUILD_*` variable is
read. `engine-custom/src/app.ts:18-32` calls `packAll` with no `hashPacks`/`changedPacks`, unlike
`BuildOverlay.ts` next door; today it dies at the mismatch and `scripts/start-stack.ps1:74-76`
warns and continues over a dead engine.

**Proposal.** Pin upstream `obj.pack`, `inv.pack` and `loc.pack` into `content-custom/pack/` with
manifest entries the way `varp.pack` is. Add `engine-custom/src/idlescape/packIds.test.ts`
asserting the six section-3 lines verbatim (`verify.ps1:144` already globs
`src/idlescape/*.test.ts`). Reword `BuildOverlay.ts:68` to name the real restore command. Change
`engine.Dockerfile:86` to `RUN npx tsx tools/pack/BuildOverlay.ts`, delete the stale comment, and
add a RUN that fails if `world.json` contains `"verify": false`. Wrap `app.ts:21-31` in the same
`hashPacks`/`changedPacks` pair from `packGuard.js` with the same `exit(1)`, plus a
`packGuard.test.ts` case for the `app.ts` shape.

**Verifier.** Confirmed on direct read. Two adjustments, one of which **raises** confidence. The
"impossible" framing is overstated: entry 5's plan already creates
`content-custom/pack/{loc,inv,vars}.pack` by copy-then-append, and entry 4's design already lists
`obj.pack` and `inv.pack` as replacements, so the pattern is named elsewhere, just not landed for
`obj.pack` and not named at the point of failure. And `world.json.template` has no `build` key
today, so "leaving `build.verify:false` in the template as the operator's next move" is a
prediction, not a fact; say "would plausibly lead to". The escalation: because
`content-custom/pack/varp.pack`'s banktab varps landed at `3586fea`, **before** the last
Dockerfile edit, and every Lightsail release runs `docker compose build` on this Dockerfile, the
plain `npm run build` step is very likely **already failing in production**, not merely a future
risk. `PackShared.ts`'s throw is at line 314.

#### C23 - The overlay and pin machinery: three checks that cannot fail, one that is never run, no removal path, and scripts that discard every exit code

**P1 - M - reliability - before entry 4**

**Evidence.** The patch sets are intact today (all 81 greps pass, 34 overlay files against 34
manifest entries, both clones at their pinned shas); the machinery meant to keep that true is not.
`scripts/content-overlay.ps1:94` exits 0 on every path including drift (`engine-overlay.ps1:191`
exits 1), and `:76` hashes the **post-overlay working tree** rather than the upstream blob, which
is the fix `engine-overlay.ps1:96-111` already applies via `git show <HEAD>:<path>`;
`content-custom/README.md:67-72` documents the resulting false positive as expected. And
`verify.ps1:76-81` never runs it at all. Nothing compares either clone's HEAD to
`scripts/upstream.lock`, so on a stale clone `engine-overlay.ps1:136-140` compares every hash
against the blob it was taken from and `verify.ps1:293` prints "verify passed".
`engine-overlay.ps1:230-233` prints "note: not listed in manifest.json" and continues, so an
unlisted replacement is copied over upstream and never drift-checked. Both overlays document that
nothing is ever removed, and `setup.ps1:45`'s `git checkout -f` leaves untracked files, so a
deleted overlay file lives on in the clone on this machine only. Nothing checks the eight
"provenance header only" files at `web/src/vendor/PATCHES.md:17-24`. `setup.ps1` reads
`$LASTEXITCODE` nowhere across seven native calls, including `BuildOverlay`'s `exit(1)`.
`start-stack.ps1:64-76` warns and continues over a dead engine and never checks `HasExited`.
`verify.ps1:37` and `start-stack.ps1:96` both `taskkill /T /F`, so the owner-bank flush on exit
and `safeExit` never run and up to about 60 seconds of bank state is discarded on every Ctrl+C.

**Proposal.** Extract `Invoke-GitInClone` and `Get-UpstreamBlobSha` into
`scripts/lib/OverlayHash.ps1`, dot-source it from both overlay scripts, make `content-overlay
-Check` exit 1 on drift, add it to `verify.ps1` step 1, and delete the false-positive paragraph
from the README. Add a verify step 0 (and the same at the top of `start-stack.ps1`) comparing both
clones' HEAD to `upstream.lock`. Turn the unlisted-file note into a throw and add the mirror check
for `content-custom`. Have each overlay write an `.overlay-manifest` and delete paths dropped
since the last run. Commit the upstream sha256 of each header-only vendor file for a
"file minus line 1" comparison. Copy `Invoke-Native` into `setup.ps1` and add a `rev-parse` check
after `:45`. Check `HasExited` inside `start-stack`'s poll loop and throw on timeout. Try
`taskkill /T` without `/F` first, escalating after about 5 seconds.

**Verifier.** Every mechanism confirmed, including that `/F` uses `TerminateProcess` and so
bypasses the engine's `SIGINT`/`SIGTERM`/`exit` handlers, and that the periodic bank flush runs
every 100 ticks (about 60 seconds). **One evidence item must be dropped:**
`web/src/vendor/rs-sdk/sdk/actions.ts` at 4,817 lines is **not** an unwritten exemption -
`2026-09-05-idlescape-roadmap-and-handoff.md` section 5 states plainly that the 400-line rule does
not apply inside `vendor/`. What survives from that clause is the narrower and still-real point
that nothing verifies the eight header-only vendor files are still byte-identical to upstream
apart from their header, which is what the proposal's sha256 pin addresses.

#### C24 - The client fork has no automated check of any kind, and no standing revision-bump procedure

**P1 - M - agentic - before entry 4 (arguably before entry 3, which adds new patches)**

**Evidence.** `client/PATCHES.md:37-134` and `engine-custom/PATCHES.md:784-823` both head a "How
to verify all patches are present" block and `scripts/verify.ps1` runs neither. The engine has
partial cover via the overlay `-Check` and the manifest-tracked check; the client fork has no
manifest, no hashes and no drift script, so 28 patches inside a 14,481-line `Client.ts` rest on
grep lines in an `sh` fence while every repository script is `.ps1`. The block also **omits patch
9's proof** (skip the credential form), so a copy-paste verifies 27 of 28 while reading as
complete. `client/bundle.ts:203` only minifies when prod, and `start-stack.ps1:80` runs
`build:dev` unconditionally including under `-Prod`, which is the mode `verify.ps1:228-231`
starts for the e2e, so step 7 overwrites the minified `out/` that `build.ps1:72` produced, while
`deploy/docker/server.Dockerfile:18` ships the minified build and `client/PATCHES.md:204-215`
explains that a missing reserved name makes a dispatch input field silently dropped.
`client/PATCHES.md:32` asserts everything else is pristine 274 with nothing checking it, and the
import commit `dec1dc5` is recorded neither in `upstream.lock` nor in `PATCHES.md`. The rs-sdk pin
`56b73e08` appears only in prose in two files and never in `upstream.lock`, and
`client/src/vendor/PATCHES.md` has no verify block at all against the convention at
`engine-custom/PATCHES.md:7-9`. `.gitignore:29` ignores `client/.upstream-git/`, which
`README.md:42-43` names as where the fork's history lives, and no script recreates it, so a fresh
clone cannot fetch upstream.

**Proposal.** Write `scripts/patches-check.ps1` parsing both files for the grep-count lines,
running each with `Select-String -SimpleMatch` and throwing "expected N got M :: pattern file";
wire it in as verify step 1c and assert the block sizes so a patch added without a grep fails. Add
patch 9's grep, and a verify block to `client/src/vendor/PATCHES.md`. Either add
`-ClientBuild dev|prod` to `start-stack.ps1` with verify passing prod, or add a `build.ps1` step
grepping `out/client.js` for the five reserved names. Record `dec1dc5` beside the upstream sha and
add a verify step running `git diff --name-only <import> HEAD -- client/` against an allowed path
set. Add the rs-sdk sha to `upstream.lock`. Write `2026-09-07-revision-bump-procedure.md` as an
ordered runnable checklist ending in `npm run verify`, and `scripts/upstream-git.ps1 -Init` to
recreate `client/.upstream-git`.

**Verifier.** Confirmed line by line, including that patch 9 really is silently skipped by the
verify block and that `client/src/vendor/PATCHES.md` has no block at all. Production itself is
unaffected by the build-mode overwrite (`server.Dockerfile:18` runs plain `bun run build`), so the
loss is verification confidence, not shipped bytes. Two corrections: the grep count is **62** in
`client/PATCHES.md`'s five fences plus 35 in the engine's block, not "46 greps in an sh fence";
and the gitignore line is `.gitignore:29`, not 37. Placement note: entry 3 (SP8c) adds new
numbered patches to `Client.ts`, so this arguably belongs before entry 3 rather than entry 4, so
the new patches do not ship into the same unverified state.

---

### 2.7 Before entry 5

#### C25 - The HELPERS string gate covers four helpers and one branch of one of them

**P1 - M - reliability - before entry 5, which adds four library bot scripts through the same seam**

**Evidence.** `web/src/tasks/library/index.ts:35-52` is a hand-maintained JavaScript
transcription of `web/src/tasks/library/loopHelpers.ts`, prepended to every fork seed, and its
comment at `:32-33` claims `librarySource.test.ts` means the two cannot drift apart silently.
What `librarySource.test.ts:28-41` actually does: compares `dropAllTask(...).when` on two fixtures
for chop-and-drop only, and calls `tool`, `invFull` and `levelOf` directly. Never compared:
`countMatching`; `dropAllTask.run`, which is the drop loop and its `c.signal.aborted` guard and
the half that moves the game; the `keepParam === true` branch; and the net-fish and mine seeds.
`2026-09-07-sp4b-handoff.md:128-131` already names the HELPERS inlining trap as a thing that costs
a session, and entry 5 adds four more library scripts on top of the same seam.

**Proposal.** Generate HELPERS at build time by stripping the types off `loopHelpers.ts`, with a
`--check` mode in `scripts/build.ps1` like the other generators, so it cannot drift. Cheaper
interim: drive the comparison from a fixture table over every exported helper, and exercise `run`
against a recording bot for both seeds and both `keepParam` values.

**Verifier.** No corrections. Confirmed at commit `5fd58c3` (the file is untouched by SP4b so far;
task 12, which opens these scripts, has not started). The proposed build-time generation mirrors
the existing `atlas.ts --check` and `collision.ts --check` convention in `build.ps1`, so it
invents no second pattern, and the files are 17, 64 and 81 lines, nowhere near the ceiling.

---

### 2.8 Before entry 6

#### C26 - One rate limiter, keyed on something the caller cannot set

**P1 - M - security - before entry 6; SP9 adds the first economically interesting write routes**

**Evidence.** `server/src/index.ts:40-42`'s `clientIp` prefers `cf-connecting-ip` over
`server.requestIP(req)`, and `server/src/gate.ts:55-68` keys its 3-second brute-force cooldown on
that value. The hazard is documented twelve lines away about a different route,
`index.ts:53-56`: "The SOCKET address is what gets checked -- never clientIp(), whose
cf-connecting-ip preference is set by the caller". The wiki limiter's no-credential fallback
(`server/src/wiki/routes.ts:28-32`) inherits it. There are two limiter implementations:
`server/src/wiki/rateLimit.ts:9-42` is a sliding window with an idle sweep and its own tests;
`gate.ts:48` is a bare `Map` never swept or capped, growing one entry per distinct key for the
life of the process. **No write route is throttled at all**: `POST /api/characters` (a Firestore
write per call), `GET /api/characters/check` (a name-enumeration oracle with no method check),
`POST /api/pair` (mints and expires in a transaction), `POST /api/bank/ops` (up to 200 ops to the
engine). And `server/src/auth/principal.ts:22-28` does an awaited Firestore
`set({ lastSeenAt })` on every agent-authenticated request.

**Proposal.** Derive the client address once in one helper: `srv.requestIP()` as the identity,
honouring `cf-connecting-ip` only when the socket address is inside the private range the tunnel
connects from - `bank/routes.ts:31-46`'s `isTrustedHookSource` is already that predicate. Promote
`wiki/rateLimit.ts` to `server/src/rateLimit.ts` and have the gate use it with limit 1 and window
3000, deleting the second mechanism and the leak in one move. Apply it as a small shared
middleware in `index.ts` after the principal block, keyed on `principal.uid`, with per-route
budgets (create 10/hour, pair mint 20/hour, bank ops 120/minute). Add a gate test that two
requests with different `cf-connecting-ip` and the same socket address still hit the cooldown.
Make `lastSeenAt` fire-and-forget and skip it when the value just read is under a minute old.

**Verifier.** All evidence confirmed at the cited lines. **One claim must be softened before this
ships:** "GATE_PASSWORD can be guessed at full speed" is not true of the current production
topology. The Lightsail firewall is closed to everything but SSH, no compose service publishes a
host port, cloudflared is the only path in, and Cloudflare's edge overwrites a client-supplied
`CF-Connecting-IP` before proxying through the Tunnel. The real exposure is narrower and still
worth fixing: local dev (no Cloudflare in front, header fully attacker-controlled) and anything
else on the docker-internal network reaching `server` directly, which is exactly the class of
caller the existing SOCKET-address comment already distrusts. Everything else - two limiter
mechanisms, the unswept `Map`, the four unthrottled routes, the blocking `lastSeenAt` - is real
and independent of that correction.

#### C27 - The auth matrix has one authority the server does not implement, a comment that says the opposite of the code, and no composition test

**P2 - M - consistency - before entry 6; SP9 is the first consumer of the agent rule**

**Evidence.** `server/src/index.ts:62-67` handles `case 'pair'` in the **first** switch and
returns for every sub except `guide`, before `gate.isOpen` and before the principal block at
`:76-83`, so `server/src/router.ts:81` never executes for mint or revoke (they authenticate
themselves at `pair/routes.ts:79-88`) while `router.test.ts:88` asserts
`principalRule({kind:'pair',sub:'mint'})` is `'human'`: true of the function, false of the server.
`router.ts:33-36` says the gate cookie covers the per-character document "like the index", but
`index.ts:59-61` serves index and static **before** `gate.isOpen` and `:87-88` serves `page`
**after** it - the two documents sit on opposite sides of the gate deliberately and the comment
states the reverse. `principalRule` never returns `'agent'`, so `index.ts:82`'s agent branch has
never executed and no test covers it, though it is the branch SP9's agent bank reads need first
(and `bank/routes.ts:106-107` says so). `server/src/firebaseAdmin.ts:10-13` points the Admin SDK
at the emulators when `FIREBASE_EMULATORS=true` and `verify.ps1:167-182` runs the whole server
suite that way, so `principal.ts:31-43`'s `verifyIdToken` never rejects a forged token in any
test, and the anonymous sign-in claim that decides 2 versus 3 characters is caller-influenceable
under the emulator. There is no `index.test.ts` at all, and no test anywhere builds the real
fetch handler.

**Proposal.** Delete the `pair` case from `principalRule`, drop the test line, and add a one-line
comment saying pair authenticates itself because it must be gate-exempt, matching how the wiki
case is already documented at `router.ts:82-84`. Rewrite the `:33-36` comment to state the real
rule. Add a composition test building the real fetch handler with fake deps and asserting the
matrix route by route: gated versus gate-exempt, 401 with no bearer, 403 for an agent bearer on a
human route, 405 on the wrong method. Record in the spec or on `firebaseAdmin.ts` that emulator
tokens are unsigned. Leave the agent branch but note in the SP9 spec that it has never run.

**Verifier.** No corrections to the evidence or line citations. One nuance for the write-up: the
`router.ts:33-36` comment appears to have been written to the SP7 intent, and the actual asymmetry
is a **sound** design choice (index must stay ungated so the client-side gate UI can render), so
the fix is to correct the comment's wording, not the gating behaviour - which the proposal already
gets right.

---

### 2.9 Entry 8 (SP4c, the gateway)

Three tasks. One half of C28 can land immediately; C29 and C30 are what entry 8's scope line
should say.

#### C28 - Every agent-facing surface currently lies about its own state

**P1 - S - consistency - add to entry 8's scope line; the `/api/wiki` half is two lines and can land immediately**

**Evidence.** `server/src/wiki/auth.ts:3-7` says `verifyBearer` "is not wired yet: PairStore has
no verify-by-secret method ... That lands with SP4", and defaults to `async () => false`. SP4a
landed: `server/src/auth/principal.ts:21-29` verifies a `csa_` token against `agentTokens` by
`hashToken`, which is exactly the missing method, and git log shows it landed about 19 minutes
before `wiki/auth.ts`'s last edit, which touched an unrelated rate-limit fix. `index.ts:38` still
constructs `createWikiAuth({ gate })` with no verifier, so an agent can never reach the API whose
stated audience is agents (`wiki/api.ts:11-12`, `wiki/reader.ts:17`), against SPW decision 3
(`spw-wiki-corpus-design.md:442`), which promised observe-mode access before SP4.
`server/src/pair/skill.md:45` instructs `claude mcp add` against `{{ORIGIN}}/mcp` and `:49` says
the endpoint returns 503; `router.ts` has no `/mcp` route, so it falls to the gate and returns
`401 {error:'gate'}` - recorded at
`specs/phase-a/2026-09-05-phase-a-agent-auth-architecture.md:38` and deferred in the git-ignored
`.superpowers/sdd/2026-09-04-idlescape-platform/progress.md:206-207`. This session's own MCP
roster reports `idlescape (ConnectionRefused)`: there is no `.mcp.json` in the repository, so
the entry lives in the user-scope config under the retired product name pointing at
`localhost:8787/mcp` with a live `csa_` bearer, while `skill.md:45` names the server `idlescape`,
so following the in-repo instructions creates a second one.

**Proposal.** Export a narrow `verifyAgentToken(secret)` from `principal.ts`, pass it as
`verifyBearer` at `index.ts:38` gated on `mode >= observe`, update the stale comment, and add a
`wiki/auth.test.ts` case for a valid token. Fix `skill.md:48-50` to state the real 401 and that it
is expected until SP4c. Rename or remove the stale user-scope `idlescape` entry and rotate the
bearer it carries. Add a `docs/README.md` section saying the gateway is SP4c, that no MCP server
is configured by this repository, and that a ConnectionRefused on `idlescape` is expected. Copy
both SP1 carry-forward items out of the ledger into entry 8's scope line.

**Verifier.** Every fact confirmed, including the timestamps and the live corroboration from this
session's own failing MCP connection. Two citation fixes: the fake verifier is at
`wiki/auth.test.ts:8` (the file is 18 lines; there is no line 86), and `skill.md`'s line 2 names
the **skill**, not the MCP server - the colliding name is set by the `claude mcp add ... idlescape`
command at line 45.

#### C29 - Firestore rules: the deferred `secretHash` hardening, plus unbounded fields, a latent delete footgun and four untested paths

**P2 - M - security - add to entry 8's scope; SP4 is the revisit point the deferral itself named**

**Evidence.** `firebase/firestore.rules:61-64` lets a token's owner read `secretHash`;
`.superpowers/sdd/2026-09-04-idlescape-platform/progress.md:193` records the ruling ("DEFERRED
(ruling): risk negligible ... Revisit in SP4 when the gateway/token model is built"), repeated at
`:206` with the touch list, and SP4a shipped without revisiting it while entry 8 does not mention
it - and that ledger is git-ignored. `:37-46` (tasks) bounds `name` and `code` but never
`description`, `tags`, `params`, `version` or the timestamps, while
`web/src/tasks/userStore.ts:5` deliberately caps `code` at 65,536; `:22-27` (plugins) checks
`settings` is a map with no size bound; `:29-34` (scriptToggles) checks only `enabled`.
`:43-45` documents, **only for tasks**, that a bare `allow write` denies deletes and adds a
dedicated `allow delete`; plugins and scriptToggles use the same shape with neither the comment
nor the rule. Four untested paths: `web/src/panels/connect.ts:45` runs a `list` query over
`agentTokens` while `rules.test.ts:94-111` only exercises `getDoc`; the plugin block lacks the
unauthenticated test scriptToggles and tasks both have; the `characters`/`audit` block never
`getDocs` to prove `allow read: if false` denies list; and `userStore.ts`'s partial `updateDoc`
path (`:135` `setLastRun` into `:79` `updateDoc`) has no rules test.

**Proposal.** Move `secretHash` to a sibling document (`agentTokens/{id}/private/secret`) or an
admin-only collection, deny client reads, and add an `assertFails` for the hash read. Add size and
type bounds for `description`, `tags` and `params` on tasks and a `settings` size bound on
plugins, with a test per bound. Add the tasks delete comment above plugins and scriptToggles, or
give both an explicit `allow delete` with a test each. Add the four missing tests. Add the whole
thing to entry 8's scope line so the ruling has a home outside the ledger.

**Verifier.** Confirmed, including the ledger ruling verbatim and all three bounds gaps. Two
citation errors: the `agentTokens` describe block is `rules.test.ts:94-111`, not 108-119; and
`userStore.ts:127` is **not** the partial-update call (it is a `lastRun` copy inside `save()`).
The real path is `setLastRun` at `:135` into `createFirestoreTaskBackend`'s `updateDoc` at `:79`,
and the cited commit `109ace8` does not touch `userStore.ts` at all - drop that attribution. The
underlying claim survives: no rules test does an `updateDoc` against `users/{uid}/tasks/{id}`.

#### C30 - Script code can forge the Worker's own RPC and reach the raw transport, the network and remote imports

**P1 - M - security - settle before entry 8 relays anyone else's code; the decision, not necessarily the code**

**Evidence.** `web/src/agent/workerContext.ts:63-84` refuses `relogin` and `logout` on the
transport a script reaches through `c.sdk.transport`, and `workerContext.harness.ts:19` plus
`workerContext.test.ts:116-130` pin the member list exhaustively: that half is sound. But script
code runs through `new Function` in the Worker's own global scope
(`web/src/tasks/defineScript.ts:42`, `web/src/agent/worker.ts:365`), so it has `self`, and
`self.postMessage({t:'rpc',callId:'x',target:'transport',method:'logout',args:[]})` is
indistinguishable from a legitimate SDK call: it reaches `workerHost.ts:217` -> `answerRpc`
(`:248`) -> `callTransport` (`:263-271`), which calls the **raw** `d.transport.logout()` or
`relogin()`. `RpcMethod` is a compile-time type and erases. The same script has `fetch` and
dynamic `import()` because the Worker is spawned `{ type: 'module' }` (`workerHost.ts:71`); it has
no DOM. The comment at `workerContext.ts:77` reads as a security claim ("a script may not log the
account in or out") that the runtime does not enforce. Blast radius is bounded today only because
`userStore.ts` scopes scripts to `users/{uid}/tasks` and nothing runs another account's code, and
the Marketplace and the SP4c Claude relay both point the other way.

**Proposal.** Either (a) state plainly in `workerContext.ts` and the SP4 spec that the refusal is
a guardrail against accidents, that a Worker-resident script is trusted as the account's own code,
and that `fetch` and `import` are reachable, making that an explicit precondition on any future
script sharing or Claude relay; or (b) drop `relogin` and `logout` from `RpcMethod`, give the
recovery a separate `{ t: 'session'; op }` message, and honour it only while the Worker reports a
recovery task in flight. Option (b) is still forgeable from inside the Worker, so (a) is the
honest answer unless script code moves out of the Worker - but the decision must be written down
before entry 8 makes "someone else's script" a real case.

**Verifier.** Confirmed end to end, and strengthened: the SP4 design spec's own section 17
(Security) states as fact that "the Worker has no DOM, no Firebase, no network beyond
postMessage", which is false for a module worker, while the same document's storage table already
admits "the shell sets no CSP today, and the Worker gets none that blocks it". That is a
documented-here, contradicted-there failure sitting in the foundational spec entry 8 builds its
relay on. Line drift only (the comment is at `workerContext.ts:77`, `case 'rpc'` at
`workerHost.ts:217`, `answerRpc` at `:248`, the `new Function` at `worker.ts:365`). Note for the
implementer: `worker.ts` is already at 390 of 400, so option (b)'s new message type may need to
land partly outside it.

---

### 2.10 After the sprint

#### C32 - The client plugin tier has no consumer, no worked example, and no sequenced follow-on for its GPU half

**P2 - M - gap-follow-on - after the sprint; needs a decision, not necessarily code**

**Evidence.** SP2b-1 shipped the registry (`client/src/plugins/registry.ts`, `capability.ts`, and
the shell side at `web/src/frame/stage.ts:322-329` reached from `main.ts:188`) and nothing
registers a client-tier plugin: `tier: 'client'` appears only in `web/src/plugins/registry.test.ts:81`
and `pluginsPanel.test.ts:18`. The ledger tail records the staging ("NEXT (staging): SP2b-2
fullscreen WebGL present path ... then checkpoint before SP2b-3") plus a deferred terser-mangling
check that "will surface at SP2b-2 integration"; neither stage exists as a plan nor appears in the
sprint's nine entries. `.superpowers/sdd/2026-09-05-entry-screen-retrofit/progress.md:56` ruling 6
scopes an `advanced-controls` plugin (WASD camera, Enter to chat, wheel zoom) to SP2; SP2, SP2a,
SP2b-1 and SP2c all completed without it, the three behaviours have zero references and appear in
no spec, and the ruling exists nowhere outside a directory the process says to delete.
`client/src/plugins/capability.ts:41-42` exposes `_fireBeforeDraw` and `_fireAfterDraw` that
`Client.ts` never calls while `client/PATCHES.md:254-257` lists only renderer, scene and menu as
stubs, so the frame capability reads as working and is dead. `registry.ts:20-26` also adds the id
to `enabled` **before** awaiting `onEnable`, `disable` calls `onDisable` bare, and
`capability.ts:23` fires with no isolation.

**Proposal.** Decide explicitly and record it. Either give SP2b-2 a sprint row - the small
demonstrable half, blitting the software PixMap to a GL canvas behind a feature detect per
`2026-09-05-sp2b-gpu-spike-findings.md:77` - with `advanced-controls` as its worked consumer; or
state in the SP2 spec that the client tier is deliberately dormant and carry the terser-mangling
check into `build.ps1` (C24) so the registry's public names are gated with no consumer. Either way
write the `advanced-controls` ruling up as a spec section, add `frame` to the stub list at
`client/PATCHES.md:254-257` or wire the two hooks into `mainredraw()` as a 29th patch with its own
grep, and add try/catch around `onEnable`, `onDisable` and `fire`, moving `enabled.add(id)` after
the await.

**Verifier.** Every citation confirmed verbatim, and the patch numbering (28) makes "a 29th patch"
correct. One softening: "no sequenced follow-on" is too broad. Entry 9 (SP5) **is** a sequenced
follow-on for the scene- and menu-consuming client plugins; what has no plan, ledger or row is the
GPU renderer (SP2b-2 and 2b-3) and `advanced-controls`. Worth adding to the proposal: SP2's own
spec section 5 scoped the GPU renderer as an SP2 Tier 1 deliverable, so its disappearance during
SP2's fragmentation is itself an undocumented spec-versus-build divergence, which the SP2
reconciliation section (C31) should say outright.

#### C35 - The janitorial batch: fourteen small defects, one task

**P3 - S - maintainability - after the sprint, one task**

**Evidence.** `web/src/test/setupDom.ts` is one module-level statement loaded as a Vitest setup
file (which runs once per file, not per test), so five or six suites re-implement the reset
differently and `frame/panels.test.ts` reads and writes `cs.panel` with no `localStorage.clear()`.
`settingsForm.ts:47-48` binds both `input` and `change` to the same emit, so every checkbox and
select change emits twice. `plugins/registry.ts:123` `onTick` iterates a Set its callees may
mutate. `bank/contextMenu.test.ts:115` dispatches a `MouseEvent` as a pointer event with `buttons`
defaulting to 0 while `gridInput.harness.ts:8-26` installs a faithful shim two files away.
`playwright.config.ts:29-37` declares no `webServer` and no retries. `server/src/types.ts:46-49`
`BridgeResponse` has zero references; `characters/store.ts:36-62` `migrate()` costs a Firestore
read on every `list()` and `create()` for a collection nothing has written since SP6, with no
retirement date. `server/src/static.ts:5-17` maps eleven extensions, so `.ico`, `.txt` and
`.webmanifest` fall back to octet-stream. `verify.ps1:6` still names a bridge suite.
`firestore.rules:4,11,14` guard a `gameName` field on `users/{uid}` that nothing has written since
SP6, and the subcollection-versus-top-level split is undocumented. `content-custom/README.md` says
`pwsh`, `engine-custom/README.md` says `powershell`, `package.json` says a third form.
`client/bundle.ts:215`'s `if (script)` can never be false, `bunBuild` reads only `outputs[0]`, and
`applyTerser`'s return is never read. Three loose Playwright `.py` scripts sit at the docs root.

**Proposal.** One pass: make `setupDom.ts` a real `beforeEach` clearing body, localStorage and
sessionStorage in a try/catch and delete the local copies; bind `input` for text, number and
colour and `change` for boolean and select in `settingsForm`; iterate a snapshot in `onTick`; make
`installPointerEvent` the single way; add a `webServer` or `globalSetup` that fails with one line
pointing at `start-stack.ps1`, and retries on CI; delete `BridgeResponse` and record a removal date
for the `gameAccounts` migration; add the three MIME entries; drop `/bridge` from `verify.ps1`'s
header; remove the vestigial `gameName` guard or say it is deliberate defence in depth, and write
one paragraph on the collection split; settle on one PowerShell invocation form and state the
working directory at the top of every fence in the four overlay and patch documents; drop
`bundle.ts`'s dead guard and throw when `outputs.length !== 1`; and move `docs/*.py` under
`docs/tools/` with a line each, deleting only the two that nothing references.

**Verifier.** Essentially every item confirmed line for line. Two overstatements to fix. The MIME
gap has **zero observed effect** today (no `.ico`, `.webmanifest` or `.txt` file exists anywhere
under `web/`, and `index.html` references neither a favicon nor a manifest), so it is a
pre-emptive fix, not a live symptom. And "invoked by nothing" is wrong for
`docs/verify_guest_login.py`: `deploy/lightsail/README.md` documents it as the manual post-release
smoke check against the live host, so it must move to `docs/tools/` and be kept, not deleted with
the 225 section. Minor: the `firestore.rules` guard lines are 4, 11 and 14.

---

## Appendix A. Refuted

One candidate was rejected by adversarial verification and is recorded here so the record shows
what was considered.

### C34 (REFUTED) - The staff allow-list covers one of the engine's two login paths, and dev grants staff 4 to every account while the game web binds 0.0.0.0

**Proposed as P2 - S - security - after the sprint.**

**The claim.** The overlay replaces `src/server/login/LoginThread.ts`, but
`engine/server/src/server/login/LoginServer.ts` reads `account.staffmodlevel` straight from the
database at `:291,304,362,381`, is not overlaid, is not in `manifest.json`, and is not mentioned
in `PATCHES.md:185` - so turning `login.enabled` on silently restores upstream's policy.
Separately, `start-stack.ps1:59` sets `IDLESCAPE_DEV_STAFF='4'` on the non-`-Prod` path, which
`staff.ts` applies to every username, while `ClientCheatHandler.ts:57` opens the `::give-class`
cheats and `engine-custom/src/web.ts:316` binds the game web server to `0.0.0.0`.

**Refutation.** The headline mechanism is the opposite of what the code does. Inside
`LoginThread.ts`'s `Environment.login.enabled` branch, the line immediately after
`client.playerLogin` unconditionally overwrites the response:
`response.staffmodlevel = staffLevelFor(username, Environment.node.production,
idlescapeConfig.devStaffLevel, idlescapeConfig.staff);` - so whatever `LoginServer.ts` read from
the database is discarded before it reaches `World.ts`. `engine-custom/PATCHES.md:213-216` says
exactly this ("a level supplied by a multiworld login server is demoted to the allow-list value
... cannot promote anyone by answering with a 4"), and `:469-474` further records that
`LoginServer.ts` is unreachable in this deployment at all, because `src/app.ts` spawns that worker
only under `Environment.easyStartup`, which the dev `world.json` does not set. The claim that
`PATCHES.md` does not mention it is therefore also wrong. The `staffmodlevel` column defaults to 0
in both Prisma schemas and nothing writes it. On the dev half: `config.ts` forces `devStaffLevel`
to 0 whenever `node.production` is true, independently of what the script sets, so it cannot leak
into a production world; `staff.ts`'s own header already documents the single-developer-world
tradeoff; and the `0.0.0.0` bind matches upstream's own unmodified `TcpServer.ts:70`, so it is not
overlay-introduced exposure, while the **management** web already binds `managementHost`,
defaulting to `127.0.0.1`.

**What survives.** One documentation nit, not a finding: `LoginServer.ts` is genuinely absent from
`manifest.json`'s `anchors`. If C23's anchor work is done anyway, add it there with a one-line
why. Not worth a task on its own.

---

## 3. Recommended sprint changes

Everything below is a proposed amendment to
`docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md`. Nothing here is applied; the sprint
document is the authority on its own order.

### 3.1 New rows for section 2

Five new rows. Three of them sit ahead of entry 2 and one of those can run in parallel with entry
1, because it touches no file entry 1 owns. The sprint's own rule at `:224` ("an entry needs an
approved spec before it gets a row") is satisfied by this document standing as the entry's spec,
which is the same shape the sprint already uses for entries whose authority is a section of
another document; if the owner prefers, each row can be brainstormed into its own spec first, at
the cost of the delay.

| Position | Entry | Kind | Carries | Authority | State |
|---|---|---|---|---|---|
| **1a** (after entry 1, runnable in parallel) | **Release integrity: the deployed stack** | audit remediation | C07, C09, C17, C08 | section 2.1 of this document | needs a plan |
| **1b** (after 1a) | **Account isolation and the boot path** | audit remediation | C10, C18 | section 2.1 | needs a plan |
| **1c** (immediately before entry 2) | **The front door, the verification document, and the static gate** | agentic infrastructure | C11, C12, C13, C14, C15, C16 | sections 2.3 and 4 | needs a plan |
| **3a** (between entry 3 and entry 4) | **The overlay, pack and client-fork gates** | audit remediation | C22, C23, C24 | section 2.6 | needs a plan |
| **10** (after entry 9) | **Reconciliation, skills, and the janitorial batch** | agentic infrastructure | C31, C33, C32, C35 | sections 2.5, 2.10 | needs a plan |

Notes on placement, each of which belongs in the entry's own paragraph when the row is written:

- **1a runs in parallel with entry 1 deliberately.** Its files are `deploy/`, `server/src`,
  `engine-custom/`, `wiki/` and `scripts/`; entry 1 owns `web/src/tasks`, `web/src/agent`,
  `web/src/frame/runBanner.ts` and `web/src/plugins/builtin/tasks*.ts`. There is no overlap. Its
  four candidates are the ones that are true of the live site right now: the deployed engine has
  no overlay and therefore no owner bank (C07), `/wiki` 503s forever (C09), the two engine
  secrets are unset in production (C17), and the next release deletes a hostname from the live
  tunnel (C08).
- **1b coordinates with entry 1 on one file.** C10's fix must be applied identically to
  `web/src/plugins/settings.ts` and `web/src/tasks/toggles.ts`, and entry 1's task 9 owns the
  second. Either fold C10's `toggles.ts` half into task 9 or land 1b after task 9 commits; do not
  do both halves in two places.
- **1c is the prerequisite for every later documentation task.** C31's reconciliation sections and
  C33's skills both write into artefacts 1c creates (the docs index, the verification document,
  the promoted ledger directory), which is why they sit at position 10 rather than beside it.
- **3a arguably belongs before entry 3, not entry 4.** Entry 3 (SP8c) adds new numbered patches to
  `Client.ts`, and C24 is what stops those patches shipping into the same unverified state. If the
  owner is willing to move it one position earlier, C24 in particular should go there.
- **Position 10 is "after the sprint" in the audit's language.** It is a real row rather than a
  backlog note because three of its four candidates carry an owner decision or a spec amendment,
  and a backlog with no row is what produced eleven of the findings in this document.

### 3.2 Fold-ins to existing entries

No new rows; the entry's plan or scope line gains the item.

| Entry | Fold in | Where exactly |
|---|---|---|
| 1 (SP4b) | **C01** | before task 11 closes; task 11's report and export are built on the corrupted rows |
| 1 | **C05** | into task 10, which already owns `runBanner.ts` |
| 1 | **C04** | into task 15, whose reconcile pass is already touching this ground |
| 1 | **C02, C03, C06** | anywhere in 9 to 15; all three are `web/src/agent` and `web/src/tasks` |
| 2 (shell v2) | **C19, C21** | the plan's panel tasks, and the companion spec's section 6 |
| 2 | **C20** | scoped to the `PanelId` and `PluginManifest` consolidation only; the `.p-*` retirement and the styleguide/CSS drift gate are already committed in that spec's section 4 G9 and section 5 items 2 and 4 |
| 3 (SP8c) | **D5** | one line to the scope: SP8b's deferred bank placeholders and fillers are engine-level and currently homeless |
| 5 (battlebots) | **C25** | before the task that adds the four library bot scripts |
| 6 (SP9) | **C26, C27** | into SP9's spec when it is written; SP9 adds the first economically interesting write routes and is the first consumer of the agent principal rule |
| 8 (SP4c) | **C28, C29, C30** | into entry 8's scope line. C28's `/api/wiki` half is two lines and can land immediately without waiting for the entry |

### 3.3 Amendments to the sprint document's own sections

- **Section 2, entry 5's State cell.** It reads "plan written, ready to execute" while the spec's
  own header still reads "Status: draft, pending decisions in section 19", against the rule at
  `:224`. The plan has settled 10 of the spec's 12 decisions; either mark the spec approved with a
  header recording which gates the plan closed, or amend `:224` and name entry 5 as the precedent
  for a plan-approved entry. (C14)
- **Section 3, after the pack table.** Add: three of the four packs the table allocates
  (`obj.pack`, `inv.pack`, `loc.pack`) are **not in `content-custom/pack/`**, so the allocation is
  currently unenforceable; entry 3a pins them and adds `packIds.test.ts` asserting the six lines
  verbatim. Note also that the guard in `BuildOverlay.ts` compares a pack to itself and cannot
  detect an id mismatch, and that the engine Dockerfile's `npm run build` step is likely already
  failing on the checksum. (C22)
- **Section 5, conventions.** Add a line pointing at `docs/VERIFICATION.md` once it exists, and
  reword the absolute "never a plain `npm run build` in `web/`" to name the case, because
  `scripts/build.ps1:34-37` does exactly that, correctly. (C12)
- **Section 5, the vendoring rule.** It describes one shape (an inline header) and the repository
  has two (the battlebots inline header, and the shell v2 bundle's separate `PROVENANCE.md`,
  which is the better artefact). State both, or state which one wins. (C33)

### 3.4 The SP10 ruling the sprint already asks for, restated with the audit's evidence

The sprint's section 4 asks for an owner ruling before entry 7 is reached and correctly declines
to make it. The audit adds three facts that should be in front of the owner when they do.

1. **The server half of SP3 does not exist, confirmed independently.** `server/src` has no
   hiscores, tracker or snapshot module; `web/src` has no match for "hiscore" at all. This audit
   reached that conclusion from the code without reference to the battlebots plan's R10.
2. **The client half does not exist either, which the sprint's section 4 does not say.** SP2
   reserved the seam that SP3's snapshot ingest was meant to use -
   `ctx.snapshots.push(reason)`, SP2 design spec `:163-164` - and `web/src/plugins/types.ts` has
   no `snapshots` member on `PluginContext`. So an SP3 completion entry is not "add a server
   module": it is a plugin-context extension, a client-side snapshot trigger, an ingest endpoint, a
   tracker store, and the hiscores pages, in that order.
3. **Three documents currently tell a fresh reader that SP3 is done.**
   `2026-09-06-sprint-handoff.md:52-53` lists it under "done and verified", the roadmap's SP3 row
   carries no qualifier, and `CREDITS.md:14` attributes a `hiscores` plugin that has zero code
   references. Whichever way the ruling goes, C14 fixes all three, and it should be part of the
   same decision rather than a follow-up.

**The ruling, as the audit would put it:** SP10 (wealth hiscores) is blocked on an SP3 completion
entry whose real size is five layers, not one. Either sequence that completion entry ahead of
entry 7 and accept that it is a sub-project rather than a task, or **descope SP10 and SP3's
hiscores half together** and record it in the roadmap and in `CREDITS.md` as evaluated and not
taken. What should not happen is entry 7 being reached with the documents still saying SP3 shipped.

### 3.5 The five owner rulings, in the order they are wanted

1. **C08 - does the other-site ingress belong in this repository?** Wanted first because the next
   release deletes it either way, and the answer is one commit or one revert.
2. **C14 and section 3.4 - SP3 and SP10: complete or descope?** Wanted before entry 6 finishes,
   and the document corrections should not wait for it.
3. **C15 - the four goals-and-autopilot questions, and which co-pilot model entry 2 builds.**
   Wanted **before entry 2 starts**, because entry 2 ships a co-pilot bar with five run states
   that an unresolved orphan spec claims to redesign, and entry 8's own authority declares itself
   consistent with that orphan.
4. **C30 - is a Worker-resident script trusted as the account's own code?** Wanted before entry 8
   relays anyone else's code. The decision matters more than the code; option (a) is the honest
   answer and costs two paragraphs.
5. **C32 - SP2b-2 as a row, or the client tier declared dormant?** Wanted at the end of the sprint.
   Either answer is fine; the current state (a registry, a dead frame capability, and a staging
   note in a deleted ledger) is not.

---

## 4. Agentic infrastructure

This section is written as **input to the vision-and-architecture workflow that follows this
audit**, not as a task list. It names the concrete artefacts, what each must contain, and the
test each one has to pass. Every one of them is an answer to "a fresh agent session with no
memory must be able to do this", and every one is currently missing or wrong.

The shape of the problem, stated once: **the code is in better condition than the documents that
describe it, and the process deletes the documents that would have kept them in step.** Five
artefacts fix that. They are listed in dependency order.

### 4.1 `README.md` as a front door

**Today.** 418 lines titled `osrs_test`, whose stated goal is validating that an OSRS-style
TypeScript server exists, containing a candidate table, a rejection list, a 225-PoC verification
section, a deploy runbook, and a Layout block that omits six of the repository's directories.
Nothing in it mentions the agent runtime, tasks, plugins, SDD, `docs/superpowers` or the sprint.
It states that `build.ps1` and `verify.ps1` do not exist.

**What it must contain, in this order.**

1. **What idlescape is, in five lines.** A browser platform around a pinned Lost City (2004
   RuneScape, revision 274) TypeScript engine and a forked TypeScript client, with a Vite shell, a
   Bun front server, Firebase auth, an engine overlay, a wiki corpus, Lightsail hosting, and an
   agent runtime that lets Claude and player-written scripts play characters.
2. **The one-hop map.** Directory to purpose to authority document, including the four the current
   Layout block omits. One line each.
3. **Four commands and what each proves.** `npm run setup`, `npm run verify`, `npm run build`,
   `scripts/start-stack.ps1` - with the environment trap attached to each, not in a footnote.
4. **The never-edited list.** `engine/`, `engine/content/`, `web/src/vendor/`,
   `client/src/vendor/`, and how each is changed instead (overlay, numbered patch, vendored
   `PATCHES.md`).
5. **A link to `docs/README.md` and `docs/VERIFICATION.md`,** and nothing else that duplicates
   them.

**Moved out:** the deploy runbook folds into the existing `deploy/lightsail/README.md` (109 lines,
already the live one). **Deleted:** the validation framing, the candidate table, the rejection
list, and the 225-PoC section.

**The test it must pass.** A fresh session that reads only this file can name what the project is,
find the authority for any subsystem in one more hop, and run the right verification without
guessing a working directory.

### 4.2 A project section in `CLAUDE.md`

**Today.** 26 lines, entirely AWS and Secrets Manager guidance for services this project does not
use. The binding rules live three documents away.

**What it must contain.** An `# idlescape` section **above** the existing AWS block, under 60
lines, **pointing rather than restating** - the failure mode to avoid is a fourth copy of the
conventions that then drifts from the other three. Contents:

- The never-edited list, one line, with the mechanism for each.
- The 400-line ceiling, with a pointer to what enforces it once C16 lands (today: nothing).
- PowerShell 5.1 only; no `&&`, no ternary, no here-string continuation.
- Playwright runs from `web/`; the atlas and collision `--check` run from the repository root.
- The settled commit trailer, verbatim. Five of the last sixty commits get it wrong, including
  commits being written now.
- `git add <paths>`, never `git add -A`.
- The two worktree hazards (junction removal before `worktree remove`; copying `web/.env.local`
  and `server/.env` into a new worktree) with their recovery command.
- One line: read `docs/README.md` first.

**The test.** A session that has read only `CLAUDE.md` does not break a convention that does not
move, and knows where to look for the ones it has not been told.

### 4.3 `docs/README.md` as the index

**Today.** Nothing. 29 specs and 17 plans, about 50,000 lines, with no entry point, several
superseded documents carrying no banner, and one orphan spec that formally amends another.

**What it must contain.**

1. **A one-hop authority table**, one row per subsystem: subsystem, its spec, its plan, its
   promoted ledger, and the command that verifies it. This is the artefact that makes "find the
   authority in one hop" true rather than aspirational.
2. **A spec inventory** marking every superseded document as superseded and naming what replaced
   it, including: `2026-09-06-sprint-handoff.md` sections 2 and 3 (superseded by the sprint),
   `2026-09-05-idlescape-roadmap-and-handoff.md` section 4's ordering (same), and
   `2026-09-05-goals-and-autopilot-design.md` (unresolved orphan, pending the C15 ruling).
3. **A reading order for a fresh session**, which today is five documents and about 750 lines
   before the first line of an entry's own spec, three of which contradict each other.
4. **The MCP note** C28 asks for: the gateway is SP4c, this repository configures no MCP server,
   and a `ConnectionRefused` on a `idlescape` entry is expected and stale.
5. **A check that keeps it honest**: grep for `.superpowers/sdd` references outside
   `.superpowers/` and fail on an unresolvable path, which is what would have caught the five
   broken ledger citations.

### 4.4 `docs/VERIFICATION.md`, three tiers

**Today.** No document lists what to run before claiming done. The closest is `verify.ps1`'s
header, which omits two of its own seven steps.

**What it must contain.** Three tiers, with the escalation stated, and for each command the
environment trap that makes it correct plus the recovery when the install is broken.

- **Per task.** Typecheck, lint, the touched package's unit suite, and a mutation-to-test table
  (change X, this test must fail).
- **Per sub-project.** `npm run verify` green end to end, with all seven steps named, including
  the two its header currently omits (the engine unit tests, the manifest-tracked check).
- **Pre-deploy.** `build.ps1`'s drift gates, the overlay `-Check` for **both** overlays, the
  manifest-tracked check, the `PATCHES.md` grep runner (C24), the clone-sha check against
  `upstream.lock` (C23), and the release health assertion that requires management and wiki, not
  just `engine:up` (C07, C09).

**The one wrong rule to fix while writing it.** `2026-09-06-sprint-handoff.md:199` forbids a plain
`npm run build` in `web/` absolutely; `scripts/build.ps1:34-37` does exactly that to produce the
shipped bundle. Name the case.

**The test.** A session can answer "am I done?" from one file, and the answer is the same answer
the next reviewer would give.

### 4.5 Eight skills, each with a trigger line

**Today.** One skill exists, `.claude/skills/idlescape-design/SKILL.md`, and it is well formed:
a description opening with "Use when...", a read-first list, non-negotiable rules, working modes.
It is the template. Nothing covers the tasks every sub-project repeats.

Each skill is short, names its **authority file** and its **verification command**, and opens with
a one-line trigger.

| Skill | Trigger line | Authority | Verification |
|---|---|---|---|
| `idlescape-stack` | Use when bringing the local stack up or debugging why it will not start | `sprint-handoff.md:56-58`, `scripts/start-stack.ps1` | the five ports answer; the engine process has not exited |
| `idlescape-verify` | Use when about to claim a change is done, or before a commit | `docs/VERIFICATION.md` | `npm run verify` green, all seven steps |
| `idlescape-engine-overlay` | Use when changing anything under `engine/server/src` | `engine-custom/PATCHES.md`, `manifest.json` | `engine-overlay.ps1 -Check` exits 0; the manifest-tracked check passes |
| `idlescape-content-overlay` | Use when adding or changing a pack id, a config or an interface | `content-custom/README.md`, sprint section 3 (carry the pinned pack-id table into the skill) | `content-overlay.ps1 -Check` exits 1 on drift (once C23 lands); `packIds.test.ts` |
| `idlescape-client-patch` | Use when changing the forked client under `client/src` | `client/PATCHES.md` (numbering is at 28) | `scripts/patches-check.ps1` (once C24 lands) |
| `idlescape-plugin` | Use when adding a shell plugin or a panel | SP2 spec plus entry 2's component library | the plugin lifecycle test; the styleguide completeness rule |
| `idlescape-library-script` | Use when adding a library bot script | `web/src/tasks/library/`, and the HELPERS trap (C25) | `librarySource.test.ts`, and the generated-HELPERS `--check` once it exists |
| `idlescape-sdd` | Use when opening, keeping or closing a plan ledger | this section 4.6 | the promoted ledger exists and is committed with the closing commit |

### 4.6 The SDD convention, written down

This is the artefact C13 is missing, and it is the highest-leverage item in this section: eleven
of the thirty-four confirmed findings are the same durability problem.

**The change.** `2026-09-06-sprint-handoff.md:25` says "delete the plan's ledger directory when its
final review is clean". Replace **delete** with **promote**: at final-review-clean, `progress.md`
is condensed into `docs/superpowers/ledgers/<plan-basename>.md` and committed with the closing
commit, and only then is the workspace removed.

**What the written convention must cover**, because it is demonstrated everywhere and described
nowhere:

- The directory layout, with each filename's purpose (`progress.md`, `task-N-brief.md`,
  `task-N-report.md`, `review-N.diff`).
- The sections of `progress.md`, and which of them survive promotion.
- When a ruling is **recorded** rather than escalated, which is the single convention this project
  leans on hardest and has never written down.
- The close-out sequence, ending in promotion rather than deletion.
- The ledger naming rule, because the current slug mismatch (plan
  `2026-09-04-idlescape-platform.md`, directory `2026-09-04-idlescape-platform/`) has produced
  three broken citations on its own.
- The vendoring rule, covering **both** existing shapes (inline header; separate `PROVENANCE.md`).
- That a measurement a spec gated on goes in `docs/superpowers/measurements/` and is linked from
  the index, not left in a ledger.
- That the promoted ledger is itself under the 400-line ceiling.

**Immediate consequences to carry out with the change:** fix the two false sentences in
`2026-09-07-sp4b-handoff.md` (`:7-12`, `:172`) which say a workspace is gone that is present and
in use; rewrite the five in-repo citations to deleted or misnamed ledgers, inlining the
two-sentence reason at `server/src/firebaseAdmin.ts:21` so the production code stands alone; and
promote `spw-wiki-corpus-ledger.md` out of machine-local memory, where SPW's rulings currently
survive as a 20 KB file on one developer's disk.

### 4.7 What the follow-on workflow should decide, not inherit

Three things this audit deliberately did not settle, because they are architecture rather than
defects:

1. **Where operational knowledge lives.** Today a meaningful fraction of it is in machine-local
   memory (stack startup timing, worktree hazards, deploy identifiers, the SPW ruling ledger).
   That is invisible to a fresh clone and to every other machine. The skills in 4.5 are one answer;
   a `docs/OPERATIONS.md` is another; doing both duplicates.
2. **Whether the co-pilot model is the fixed rule or the three-mode selector.** C15's orphan spec
   claims to have amended it, entry 2 is about to build the fixed version, and entry 8's authority
   declares itself consistent with the orphan. This is a product decision wearing a documentation
   costume.
3. **Whether the client plugin tier is a live extension point or a dormant one.** C32. The
   registry exists, the frame capability is dead code, the GPU renderer that justified the tier was
   never built, and SP5 (entry 9) needs only the scene and menu halves. Deciding this is cheaper
   than maintaining the ambiguity.

---

## Remediation status

This document records the state of the repository on 2026-09-07, before sprint entry 2 ran, and is
not updated as findings close. What has since happened to each finding is recorded in the entry
that closed it:

- C07, C09, C10, C16, C17, C18: sprint entry 2,
  `docs/superpowers/ledgers/2026-09-07-release-integrity-and-account-isolation.md`.
- C01 to C06, C08: sprint entry 1, `docs/superpowers/ledgers/2026-09-06-sp4b-bot-expansion.md`.
- C22, C23, C24: sprint entry 3, **closed with residue**,
  `docs/superpowers/ledgers/2026-09-07-overlay-pack-and-client-fork-gates.md`. That ledger's
  "What this entry does not close" section is the list; C22's claim that the engine Dockerfile's
  plain `npm run build` was very likely already failing in production was true when this document
  landed (`d4431af`, 14:12:02 on 2026-09-07) and went false twenty three minutes later, when
  `ca8ef86` (14:35:25) replaced that line with `RUN npx tsx tools/pack/BuildOverlay.ts` under D73
  and D74. Entry 3 asserted the replacement by grep rather than redoing it.

- C19, C20, C21: sprint entry 4, **left open**, `docs/superpowers/ledgers/2026-09-07-shell-v2.md`.
  That entry folded all three in and closed part of each: C19's shared-`#panel-body` listener leak in
  all four panels; C20's `.p-*` dialect, its two DOM-building mechanisms and its one-file drift gate,
  which now covers nineteen stylesheets plus a styleguide completeness rule and eight screenshot
  baselines; and C21's duplicate `tasks.css` import, its styleguide ceiling (settled by D12 rather
  than by a split) and the tablist half of its strip contract. What each still leaves open is listed
  in that ledger's close-out, read against the tree rather than assumed: C19's dead
  `settings.subscribe` and missing unregister path, C20's two `PluginManifest` declarations, three
  `as PanelId` casts and three unimported manifest exports, and all of C21's remaining a11y, mute and
  storage items. Whoever picks them up starts from that list, not from this section.

The other ledgers in `docs/superpowers/ledgers/` all predate this audit and close none of its rows.
