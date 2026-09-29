# Release integrity and account isolation - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the audit's five P0s that are true of the live site right now, plus the static gate that would have caught them: stop `localStorage` leaking plugin and script state between accounts on one browser (C10), stop `boot()` rejecting into a blank page (C18), make the environment templates and the shipped bundle tell the truth (C17), build the wiki into the gates and into the server image so `/wiki` stops 503ing and the release gate can go green (C09), enforce the 400-line ceiling and typecheck the web tests and the client fork (C16), and finish C07's runtime half with a `management` health field and authenticated `/setup*` routes.

**Architecture:** Six seams, one per audit finding, in the order that puts the live data leak first and the gate that measures everything last. (1) *Account isolation* gains one new module, `web/src/storage/scoped.ts`, which owns the key shape and the one-time migration; `plugins/settings.ts` and `tasks/toggles.ts` both compose it and stop enumerating the whole `cs.` namespace. (2) *Boot* is lifted out of `web/src/main.ts` into `web/src/boot.ts` behind injected dependencies, because `main.ts` has fourteen module-scope `byId` calls and cannot be imported under jsdom; that extraction is what makes the gate probe, the in-flight guard and the teardown testable at all, and it buys `main.ts` headroom before entry 4 opens it. (3) *Environment truth* moves the two remaining shipped literals behind runtime values, corrects three templates, adds the missing one, and adds a test that keeps `server/.env.example` equal to what `loadEnv` reads. (4) *The wiki* gains a build step in `scripts/build.ps1`, a typecheck-and-test step in `scripts/verify.ps1`, and a fourth stage in `deploy/docker/server.Dockerfile` that clones Content at `CONTENT_SHA` and writes the database at the path `server/src/env.ts` already defaults to. (5) *The static gate* is `scripts/line-ceiling.ps1` plus `web/tsconfig.test.json` plus a `typecheck` script in `client/`, each wired into `verify.ps1`, followed by a task that fixes what they surface. (6) *C07's remainder* is one Fastify `onRequest` hook in the overlay, one new secret-gated route, and a fourth field on `HealthSnapshot` that the release gate requires.

**Tech Stack:** Vite plus vanilla TypeScript (`web/`, Vitest and jsdom, Playwright); Bun plus TypeScript (`server/`, `wiki/`, `client/`, `bun:test`); Fastify inside the pinned Lost City engine via the `engine-custom/` overlay (`node:test` through `tsx`); Windows PowerShell 5.1 for `scripts/` and `deploy/lightsail/`; Docker multi-stage builds for `deploy/docker/`.

**Spec:** `docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md` entry 2, "Release integrity and account isolation" (`:93-126`), standing on `docs/superpowers/specs/2026-09-07-project-audit.md` sections 2.1 and 2.3 (findings C07, C09, C10, C16, C17, C18) and on decisions D15, D16, D30, D35, D73, D74, D75 in `docs/superpowers/decisions.md`. Session conventions: `docs/superpowers/specs/2026-09-06-sprint-handoff.md` sections 1, 4, 5, 6. Board: `docs/superpowers/sprint-control.md`.

Three read-only maps were written for this plan in the git-ignored SDD workspace `.superpowers/sdd/2026-09-07-entry2-plan/`: `map-findings.md` (what the entry 1 landing already closed and what remains, with HEAD line numbers), `map-code.md` (the seam each fix lands in, the tests around it, the traps), `map-gates.md` (the gates and the release path). **This plan quotes every fact it needs from them**, so an implementer never opens the workspace and a fresh clone that lacks it loses nothing. Where a line number in this plan and a grep at HEAD disagree, the grep is right.

## Global Constraints

- **Strict TypeScript, no new `as any`.** `web/`, `server/`, `wiki/` and `client/` are all `strict`. The one sanctioned relaxation is `client/src/vendor/` and `web/src/vendor/` (see each `vendor/PATCHES.md`); nothing this plan writes goes there.
- **Every file under 400 lines, test files included.** Task 6 makes this enforced rather than aspirational, which means it binds this plan's own output from Task 6 onward. Files this plan grows, with their HEAD sizes: `web/src/main.ts` 358, `engine-custom/src/web.ts` 367, `scripts/verify.ps1` 293, `scripts/build.ps1` 94, `server/src/index.ts` 124, `server/src/health.ts` 61.
- **No em dashes in any new prose**: source comments, this plan, documentation. Hyphens or commas.
- **`engine/server` and `engine/content` are never edited.** The only route into the engine is `engine-custom/`, with a `manifest.json` entry, a `PATCHES.md` row carrying a verifying grep, and a matching `RUN grep` in `deploy/docker/engine.Dockerfile`. `scripts/verify.ps1` step 1 fails on an untracked manifest path.
- **`client/src/client/Client.ts` is edited only by a numbered patch** recorded in `client/PATCHES.md`; numbering is at 28. This plan does not touch it.
- **`localStorage` keys keep the `cs.` prefix, and an existing key is migrated, never silently reset.** Task 1 is the only task that changes a key shape, and ruling R2 is the exact migration.
- **The release stays owner-gated as G5** (D16, D35). Nothing here releases, touches the Lightsail box, or runs `deploy/lightsail/release.ps1`. The health gate is red by design until Task 5 lands (D75). Task 5 is verified by building the image locally, never by deploying it.
- **Windows PowerShell 5.1 only.** `pwsh` is not installed. No `&&`, no `||`, no ternary, no `??`, no `?.`, no here-string continuation. `$ErrorActionPreference = 'Stop'` turns a native command's stderr into a terminating error; `scripts/verify.ps1:101-106` is the worked example of the workaround, copy that shape rather than inventing another.
- **Verification traps that have each cost a session** (`CLAUDE.md:70-77`): Playwright runs from `web/`, never the repository root, where it reports "No tests found" and exits 0; `bun scripts/gen/*.ts --check` runs from the repository root but `npx tsc -p ../scripts/gen/tsconfig.json` runs from `web/`; `npm run build` in `web/` builds against real Firebase and only `npm run build:e2e` is correct for a Playwright run; start the Firebase emulators from PowerShell `Start-Process`, never from a bash subshell, where they die silently.
- **Branch `sprint/dragon-slayer`.** Every commit uses explicit `git add <paths>`, never `git add -A`, is made with `git -c core.safecrlf=false commit`, and ends with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577
  ```
- **Per-command verification**, from the repository root in Git Bash unless stated:
  - web: `cd web && npm run typecheck && npm run lint && npx vitest run`
  - server: `cd server && bun run typecheck && bun test` (the pair and bridge suites need the auth and firestore emulators up)
  - wiki: `cd wiki && bun run typecheck && bun test`
  - client: `cd client && bunx tsc --noEmit && bun test src/hooks src/plugins src/vendor`
  - engine overlay: `powershell -File scripts/engine-overlay.ps1`, then `-Check`, then `cd engine/server && npx tsx --test --test-force-exit src/idlescape/config.test.ts src/idlescape/management.test.ts`
  - the whole gate: `powershell -File scripts/verify.ps1`

---

## What already shipped, verified in the code

Read this before Task 1. Every line number below was re-read at HEAD on `sprint/dragon-slayer`. **Treat every line number in this plan as a hint and grep for the symbol beside it.**

### The entry 1 landing closed more than the sprint text says

The sprint spec at `:118-120` says what remains of the deploy half is "C09's wiki build into the server image and C17's two engine secrets across the production pipeline". **Only the first is true.** The landing commits at HEAD are `ca8ef86` (the overlay and the idlescape environment in the deployed stack, D73 and D74), `1271319` (the cloudflared ingress, D15 and C08), `2f5dce7` (the dirty tracked file warning), then four fix rounds `cff1e0d`, `f03bb45`, `20f013f`, `1c82cde` and the rulings commit `9608f2b`. **The brief's `376cf58` is not reachable from HEAD**: D83 rewrote `376cf58..c822c02` in place as `ca8ef86..2f5dce7`. Cite `ca8ef86`, never `376cf58`.

Asserted, not rebuilt (this plan changes none of it):

- **The overlay is in the engine image.** `deploy/docker/engine.Dockerfile:66-73` copies `engine-custom` with the depth-2 find loop that mirrors `scripts/engine-overlay.ps1`; `:94-101` asserts all 34 manifest paths present plus six content greps. The pack line is `npx tsx tools/pack/BuildOverlay.ts` (`:140`), not `npm run build`.
- **The idlescape environment reaches the engine.** `deploy/docker/docker-compose.yml:50` sets `IDLESCAPE_MANAGEMENT_HOST=0.0.0.0`, `:53` `IDLESCAPE_HOOK_URL`, `:57` `IDLESCAPE_BANK_DIR`, `:89` `ENGINE_MANAGEMENT_HTTP=http://engine:8897` on `server`, and `:43` env_files `SERVER_ENV_FILE` into the **engine** service so both shared secrets are one value each.
- **Both engine secrets are generated and shared.** `deploy/lightsail/provision.ps1:107-118` generates `OWNER_ASSERTION_SECRET` and `ENGINE_MANAGEMENT_SECRET` at 48 characters into the box's `secrets/server.env`. **C17's production-pipeline half is closed. Do not re-do D74.**
- **The engine is off the shared network.** `docker-compose.yml:122-128` puts it on its own `engine` network with only `server`. The comment at `:15-21` records that this was done *because* the three `/setup*` routes are unauthenticated. Task 9 makes that comment stale and must update it in the same commit.
- **The release gate is three fields.** `deploy/lightsail/common.ps1:69-76` `Get-HealthGaps` requires `"engine":"up"`, a numeric `"players"` and `"wiki":"up"`, each by real value rather than by key presence. `release.ps1:132` reaches it through `Wait-RemoteHealth` (`common.ps1:78-85`) and `cutover.ps1:52` calls it directly on the public probe it polls at `:51` (D75, D86). **The gate is red today by design** and stays red until Task 5 lands.

### C16's e2e half already landed, outside the landing

Commit `59f6155` created `web/tsconfig.e2e.json` (16 lines, `types: ["node"]`, includes `e2e/**/*.ts` and `playwright.config.ts`), made `web/package.json:13` `"typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.e2e.json"`, and made `:12` `"lint": "eslint src/ e2e/"`. A probe measured **zero** typecheck errors under `web/e2e/`. The audit's "the e2e specs are never typechecked" and "lint covers `src/` only" are **both closed**. What remains of C16 is `web/src/**/*.test.ts`, the client fork, and the line ceiling. Commit `b847e88` closed C09's "correct `README.md:387-390`": README is 134 lines at HEAD and `:35` states the truth, that `npm run verify` "does **not** build the wiki".

### The 400-line first-run backlog is empty

Measured by `wc -l` over `git ls-files` at HEAD, in Task 6's scope with Task 6's exemptions, **zero files exceed 400**. The only file over is `web/styleguide.html` at 504, exempt under D12, which eslint never reaches anyway. Largest per area: `web/src/plugins/builtin/tasks.ts` 399, `web/e2e/bank-ui.pw.test.ts` 380, `server/src/bank/routes.stream.test.ts` 274, `engine-custom/src/idlescape/ownerBank.ts` 394, `client/src/hooks/objArt.test.ts` 241, `wiki/gen/drops.ts` 151, `scripts/gen/atlas.ts` 125, `firebase/rules.test.ts` 237. **Seven files sit within ten lines of the ceiling**: `tasks.ts` 399, `web/src/agent/worker.ts` 397, `web/src/sessions/manager.test.ts` 396, `web/src/plugins/builtin/tasks.test.ts` 394, `ownerBank.ts` 394, `web/src/tasks/api.ts` 393, `web/src/agent/workerHost.ts` 391. So Task 6 is a **ratchet, not a cleanup**, and its first run is green, which is exactly the shape this project distrusts. That is why Task 6 carries a mandatory mutation step.

### The client fork typechecks clean today

Measured: `bunx tsc --noEmit` from `client/` exits 0 with no output over 123 files under `client/src`, 13 of them tests. `client/tsconfig.json` is 31 lines, strict, with no `include`, so it takes the whole package. `client/PATCHES.md:34` claims every upstream bump re-runs this; nothing in the repository has ever run it. **The client half of C16 is one `package.json` line and one `verify.ps1` step with no backlog.** The scoped `client/tsconfig.check.json` the audit hedged about is not needed. Task 7 measures again before it ships, because that measurement will be stale by the time this runs.

### The web test backlog is measured, and it breaks a production file

Adding `web/src/**/*.test.ts` to a program with `web/tsconfig.json`'s options produces **108 errors across 28 files**, zero of them in `e2e/`. Error mix: 33 TS2353 (unknown object-literal property), 24 TS2345 (bad argument), 11 TS7006 (implicit any), 9 TS2741 (missing property, for example five `HealthSnapshot` fixtures in `src/panels/connect.test.ts` missing `players`), 9 TS2304 (a type name used and never imported: `MainToWorker`, `ObjInfo`, `IconCache`, `TraceEvent`). Worst files: `src/tasks/runReport.test.ts` 19, `src/plugins/builtin/runReportView.test.ts` 10, `src/sessions/manager.test.ts` 7, `src/panels/connect.test.ts` 5, `src/agent/workerHost.test.ts` 5, `src/agent/workerHost.bridge.test.ts` 5; fifteen files have four or fewer. `src/vendor/rs-sdk/sdk/pathfinding.test.ts` contributes one and needs the same `src/vendor/**` carve-out eslint already has.

**The 109th error is in a production file and nobody has budgeted it.** `web/src/ui/toast.ts:17-18` gets two TS7006 on `(fn, ms)`. The mechanism: a test's `import ... from 'vitest'` drags `@types/node` into the program regardless of the `types` array, `setTimeout` becomes an overloaded union, and `opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms))` loses its contextual typing. It reproduces with `types: ["vite/client"]` alone, so it is not a probe artefact. Task 8 fixes it first, with real code.

Also measured: across the 127 web test files there are **zero** `as any`, **zero** `@ts-expect-error`, **zero** `@ts-ignore`, and **108** `as unknown as` casts. A low first-run count is therefore not evidence the check has little value; those casts suppress exactly the interface drift the check exists to catch, and the value is the ratchet on future drift. `noUncheckedIndexedAccess` is not set in `web/tsconfig.json` and Task 7 does not set it: that would be a different decision wearing this one's clothes.

### The wiki artefacts are enormous and gitignored

`wiki/data/274/loc-spawns.json` is 113 MB and `wiki/build/wiki.db` is 138 MB, both gitignored (`.gitignore:20-21`). `wiki/gen/extract.ts:78-81` `readData()` **silently runs a full extract** when `loc-spawns.json` is absent, and `runExtract` requires `engine/content` checked out at the sha in `scripts/upstream.lock` (`extract.ts:24-26` `assertContentPinned`, called at `:31-33`). The root `.dockerignore:12` excludes `engine/` from the build context, and `release.ps1:120` ships `git archive HEAD`, so a server image stage can COPY neither the database nor its largest input. It must clone Content itself at `CONTENT_SHA`, exactly as `server.Dockerfile:51-59` already clones Engine-TS at `ENGINE_SHA`. Measured at HEAD: `bun test` in `wiki/` is 107 pass, 0 fail, 30 files, 9.0 s (fifteen is `wiki/gen/*.test.ts` alone; `render/` and `parse/` bring it to 30), and `bunx tsc --noEmit` in `wiki/` exits 0. **Both are free to add to `verify.ps1` today.**

### The three `/setup*` routes are still open, and the C10 leak is untouched

`engine-custom/src/web.ts:335-337` (`GET /setup`), `:339-345` (`GET /setup/config`, which returns `loadWorldConfig()` whole, including `db.pass` in plaintext) and `:347-355` (`PUT /setup/config`, which rewrites `node.production` and `build.verify`) have no auth, and sit directly above the secret-gated `registerOwnerBankRoutes(management);` at `:359`. `web.ts:366` binds the whole management app to `idlescapeConfig.managementHost`, which compose sets to `0.0.0.0`. The verifier is already in the same package: `engine-custom/src/idlescape/management.ts:37-47` `authorised(header, secret)`, constant-time, refuses an empty configured secret. `/prometheus` at `web.ts:330-333` must stay open, because `server/src/health.ts:38` polls it for the players gauge.

C10 is exactly as the audit found it. `web/src/plugins/settings.ts:18` is `KEY = (id) => cs.plugin.${id}` with no uid; `:57-69` `load(uid)` reads the backend then `:63` unions in **every** `cs.plugin.*` key in the browser via `localStorage_snapshot()` at `:89-98`, and `:65` falls back to `readLocal(id)`. `web/src/tasks/toggles.ts:23` is `PREFIX = 'cs.script.'` (the audit's verifier corrected this to line 22; at HEAD it is 23), `:51-60` `localIds()` enumerates every `cs.script.*` key, `:96-99` seeds from them. `toggles.ts:1-5` states in its own header that the shape is deliberately identical to `settings.ts`, which is why the fix must land in both at once and why that comment is the one to update. **The entry's coordination question is resolved**: entry 1 is complete (`docs/superpowers/sprint-control.md:95`), so `toggles.ts` is free and both halves land here rather than being folded into entry 1's task 9.

### C18 is confirmed line by line

`web/src/main.ts` is 358 lines. `:322-328` `isGateOpen()` is a bare `fetch('/client/client.js', { method: 'HEAD', credentials: 'same-origin' })` with no `.catch`. `:351-356` `boot()` awaits it at `:354`; `:358` is `void boot();`. A `TypeError: Failed to fetch` rejects `boot`, the rejection is voided, and nothing past `:354` runs. All four screens start `hidden` in the static HTML, and `web/src/state.ts:8-12` returns early on an unchanged state whose initial value is `'gate'`, so `main.ts:354`'s `state.set('gate')` is **itself a no-op** and the `show('screen-gate')` beside it is the only thing that paints. The page is genuinely blank with nothing in the console. `#offline-card` lives inside `#screen-frame` (`web/src/partials/frame.html:18`), and `'offline'` is in the `AppState` union and in `main.ts:42`'s map but `state.set('offline')` appears **nowhere in the tree**, so the offline card cannot be the failure surface. `watchHealth()` at `:302-314` is declared `async` with no top-level `await`, fires every 1000 ms with no in-flight guard, and never holds the interval id; the fps interval at `:262-265` likewise.

**Do not repeat the audit's stated justification for the in-flight guard.** A slow `/api/health` is not what happens when the engine is down: `server/src/health.ts:25-43` probes the engine on its own 10-second interval with a 3-second `AbortSignal.timeout` and `server/src/index.ts:51` returns the cached snapshot synchronously, so an engine outage answers instantly. The guard is still worth adding; the pile-up case is a hung or overloaded front server, and that is what the plan and the code comment say.

---

## Plan rulings

Twenty-three rulings, each with what it costs if it is wrong. Where the audit, the sprint entry or a map recommended something and this plan chose otherwise, the ruling says so.

**R1. The scoped key shape is `cs.<ns>.u.<uid>.<id>` for a signed-in principal and `cs.<ns>.anon.<id>` for a signed-out one**, where `<ns>` is `plugin` or `script`. The `cs.` prefix survives, as the constraint requires. The `u.` and `anon.` segments are literal discriminators rather than a bare uid, so the anon bucket can never collide with a Firebase uid and so a reader of `localStorage` can see at a glance which principal a key belongs to. Enumeration is by the full scoped prefix, so a store can no longer see any other scope's keys, which is the whole fix: the leak is closed by construction and not by a filter anyone can forget. *Cost if wrong:* a rename of one constant in `web/src/storage/scoped.ts` plus a second migration pass, because the first migration has already retired the bare keys.

**R2. The migration moves every bare `cs.plugin.<id>` and `cs.script.<id>` key into the `anon` bucket, and into no uid bucket.** It runs once per page load, at the top of `web/src/main.ts` before any store is constructed, is idempotent (after it runs there are no bare keys, so a second run is a no-op), and needs no marker key. If a target key already exists the bare key is deleted rather than overwritten, because the target was written by the new code and is newer. **Nothing is adopted into a uid bucket, ever.** The reason: the principal that wrote a bare key is unknowable, and adopting it into whichever account signs in first is exactly the leak being fixed. What a signed-in account loses in the worst case is a settings change that never reached Firestore for the whole of a session, because `load(uid)` will refill its bucket from the backend, which is the record for a signed-in account (`web/src/plugins/firestoreBackend.ts:8` `users/{uid}/plugins`, `web/src/tasks/toggles.ts:30` `users/{uid}/scriptToggles`). What a signed-out player keeps is everything, because `anon` is precisely what a bare key has always meant in the signed-out case. **The signed-out mirror rule, stated:** `load(null)` reads and writes only the `anon` bucket; signing out never copies the account's bucket into `anon`; signing in never reads `anon`. *Cost if wrong:* one player-visible reset of local-only plugin settings for an account whose Firestore document is empty or unreachable at first load, once, at upgrade. The alternative (a first-signed-in-uid claim) trades that for a one-time cross-account leak on a shared browser, which is the defect this entry exists to close.

**R3. The scope module is `web/src/storage/scoped.ts`, a new directory, and entry 4 composes over it rather than replacing it.** Entry 4's shell v2 plan introduces `web/src/ui/storage.ts` with a `KEYS` inventory and renames `cs.pl.` to `cs.pluginData.` (audit C21). Putting the scope rule in `web/src/storage/` keeps it out of `ui/`, so entry 4's inventory imports `scopedKey` and `scopePrefix` instead of restating them. *Cost if wrong:* entry 4 moves one 60-line file and updates two imports.

**R4. C10's scope is the two stores the entry names and nothing else.** `web/src/main.ts:172-173`'s per-plugin `cs.pl.<id>.<k>` storage, `web/src/tasks/wire.ts:33-34`'s bare `cs.<k>` accessor and `web/src/tasks/settings.ts:31`'s `cs.tasks.settings`, `web/src/frame/panels.ts:5`'s `cs.panel`, `main.ts:50-51`'s `cs.size` and `cs.filter`, and `web/src/bank/view.ts:42-44`'s three `cs.bank.*` keys are all equally unkeyed and are **out of scope**. C21 owns `wire.ts` for entry 4. `cs.panel`, `cs.size`, `cs.filter`, `cs.tasks.settings` and the three `cs.bank.*` keys are per-browser display preferences rather than per-account state, which is why they can wait. **`cs.pl.<id>.<k>` is not, and the honest reason it waits is different and measurable**: it is the `PluginContext.storage` API handed to every plugin, so whatever a plugin persists there lands unscoped, and it is on exactly the same defect as C10. `git grep -n "storage\." -- web/src/plugins/builtin` returns **nothing** at HEAD, so no builtin plugin calls it and the leak is unreachable today. Both reasons are stated in `scoped.ts`'s header comment, separately, so the next reader is not surprised and so the first plugin author who reaches for `ctx.storage` is told to scope it. *Cost if wrong:* a player's panel choice or bank column widths are shared between their own accounts on one browser, which is a preference and not a leak of what an account has enabled; and the first plugin that uses `ctx.storage` before entry 4 reopens this ships the same leak in a new place. Recorded as **D100**, so the obligation outlives this plan.

**R5. The gate probe returns three answers, and an unreachable server enters the app rather than showing the gate.** `probeGate()` returns `'open' | 'closed' | 'unknown'`: a 401 is `closed`, any other response is `open`, and two consecutive throws 300 ms apart are `unknown`. `unknown` calls `enterApp()`. Rationale: a network failure is not evidence that a password gate is on, and the cost of guessing wrong in this direction is a home screen whose first API call fails visibly, while the cost of guessing wrong in the other direction is a password form a visitor of an ungated deployment can never pass. The retry exists so a single blip does not skip the gate screen for a genuinely gated visitor. *Cost if wrong:* a gated deployment shows its home screen for one load to a visitor with a broken network; they still cannot reach anything behind the gate, because every gated asset still 401s.

**R6. `boot()` cannot reject, and its failure surface is the gate screen with the form hidden and a message that is a sibling of the form, not a child of it.** The whole body is wrapped and the catch calls `showBootError(message)`, which hides `#gate-form` and paints `#gate-boot-error`. **The obvious version of this does not work and would have shipped the very defect C18 exists to remove.** At HEAD `web/src/partials/gate.html:7` nests `<p id="gate-error">` inside `<form id="gate-form">` (in the `.field` div beside the password input), and `web/src/styles/base.css:21` is `.hidden { display: none !important; }`, so hiding the form hides the message with it and a boot error paints an empty card: a blank page again. So `gate.html` is restructured the way `web/src/partials/home.html` already is, a `<div class="card">` wrapper holding a `<p id="gate-boot-error">` and then the `<form id="gate-form">`. `#gate-error` stays exactly where it is, under the password input, because that is where a wrong-password message belongs and `wireGate` still writes to it. `.card-screen` is a centring flexbox, so the new node must be **inside** the card and not a second child of `#screen-gate`, which would sit beside it. `showBootError` therefore lives in `web/src/boot.ts` rather than in `main.ts`, so the closing test can load the real partial into jsdom (the `web/src/characters/gate.test.ts:9` pattern), call the error path, and assert the message is present, non-empty and has no `.hidden` ancestor. A surface with no test is what let this defect exist. The offline card is **not** the surface: it lives inside `#screen-frame`, and `state.set('offline')` appears nowhere in the tree. Recorded as **D99**, because entry 4's shell v2 must reconcile the markup rather than assume HEAD's eleven-line partial. *Cost if wrong:* one added element and one restructured partial for entry 4 to reconcile, against a failure surface that paints nothing.

**R7. `web/src/boot.ts` owns the gate probe and the health watcher; `main.ts` keeps the fps interval and holds its id.** The watcher is a factory with `start()` and `stop()`, an in-flight guard, and a held interval id. The fps interval at `main.ts:262-265` stays in `main.ts` because it reads `stage`, but its id is held in a module constant and cleared on `pagehide` beside the existing `settingsStore.flush()` at `:160`. It is not unit-tested, because `main.ts` cannot be imported under jsdom (fourteen module-scope `byId` calls, and `web/src/dom.ts:31-35` throws on a missing element); the plan says so rather than pretending otherwise. *Cost if wrong:* one leaked interval per page in a single-page app that never navigates, which is what HEAD already has.

**R8. The in-flight guard's justification in the code comment is the hung front server, not a down engine.** `server/src/health.ts:25-43` probes the engine on its own 10-second interval with a 3-second timeout and `server/src/index.ts:51` returns the cached snapshot synchronously, so an engine outage answers instantly. Shipping the audit's stated reason would put a false claim in a comment that outlives it. *Cost if wrong:* nothing functional, one comment.

**R9. The two hardcoded hostname literals become `location.host`, not a `VITE_SITE_HOST` build variable.** The audit proposed an environment variable through `StageDeps`. `location.host` is correct in every environment with no configuration to drift, and there is exactly one world, so `WORLD = 1` stays a named constant. One new module, `web/src/frame/siteLabel.ts`, exports `siteLabel(gameName: string): string`; **both** call sites use it: `web/src/frame/stage.ts:230` and `web/src/sessions/wire.ts:41`. The audit named only the first, and cited it at `:229`. *Cost if wrong:* a dev session's title bar reads `localhost:8787 - world 1 - Name`, which is true.

**R10. The gate password leaves the shipped bundle; the server default and the e2e fallback stay.** `web/src/main.ts:264` stops rendering `gate: fiddlesticks` into the footer of every logged-in session and renders `gate on` instead. `server/src/env.ts:55`'s `GATE_PASSWORD` default and `web/e2e/helpers.ts:9`'s `process.env.E2E_GATE_PASSWORD ?? 'fiddlesticks'` both stay, because they are a local development password for a local development gate, neither ships in a bundle, and changing either breaks `scripts/start-stack.ps1` and every Playwright run for no security gain. Rotating the deployed password is an owner action under G5 and is not this entry's. *Cost if wrong:* the footer stops telling a developer what to type, which `server/.env.example:15` tells them instead.

**R11. `server/.env.production.example` is deleted rather than corrected.** It is 45 lines, stops at the SP1 set (no `ENGINE_MANAGEMENT_HTTP`, `ENGINE_MANAGEMENT_SECRET`, `OWNER_ASSERTION_SECRET`, `WIKI_DB`), and has exactly one citation, `deploy/windows/register-tasks.ps1:22-24`, which describes a Windows scheduled-task deployment superseded by the Lightsail runbook. Its real replacement already exists and is generated rather than copied: `deploy/lightsail/provision.ps1:107-118` writes the box's `secrets/server.env`, and `deploy/docker/.env.example` documents the compose side. Keeping a second production template correct forever is the drift the audit names. The deletion also removes `.dockerignore:24`, which excludes it from the build context. *Cost if wrong:* restoring one file from git history and re-adding one `.dockerignore` line.

**R12. `server/.env.example` stays the single key inventory, and a test keeps it equal to what `loadEnv` reads.** The test lives in `server/src/env.test.ts`, reads both `server/.env.example` and `server/src/env.ts` from disk, extracts the key set from each (`^KEY=` lines from the template; `str|bool|int(source, 'KEY'` calls plus `source.KEY` reads from the source), and asserts set equality in both directions. No exported inventory constant is added, because a constant is a third thing that can drift from the other two. **A second test in the same file covers the third direction the map named**: `deploy/lightsail/provision.ps1:110-119` writes the box's `secrets/server.env` from a hand-kept nine-key list (`PORT`, `GATE_ENABLED`, `GATE_PASSWORD`, `GATE_SECRET`, `OWNER_ASSERTION_SECRET`, `ENGINE_MANAGEMENT_SECRET`, `FIREBASE_PROJECT_ID`, `FIREBASE_EMULATORS`, `PUBLIC_ORIGIN`) while `loadEnv` reads seventeen, so a new required key can be added to the template and silently omitted from every box. The eight it leaves out are deliberate (compose sets them, or `env.ts`'s default is already right inside the container), so the fix is not to write them but to **declare** them: `provision.ps1` gains a greppable `# NOT-WRITTEN:` line naming the eight, and the test asserts that the nine it writes plus the eight it declares equal `server/.env.example` exactly. *Cost if wrong:* a false failure when someone renames the `str`, `bool` or `int` helpers, which the test's own error message names, or when a key moves between the written and declared lists without the comment moving with it. The declaration is recorded as **D101**; that the generator still does not derive from the template is stated in the ledger and in "What this entry does not close".

**R13. `ENGINE_HTTP` and `ENGINE_WS` default to port 8899, the dev engine, and never 8888.** `server/src/env.ts:48-49` currently defaults to `127.0.0.1:8888`, the retired 225 proof-of-concept instance that `server/.env.example:2-3` explicitly warns against pointing a dev front server at. `server/src/env.test.ts:6-7` pins 8888 as its base fixture (`:5` is `PORT`), so this is a two-file change plus one new test asserting the default is 8899. The blast radius is narrow, because `docker-compose.yml:84-85` overrides both in the real deploy path; the failure this closes is a bare `bun run src/index.ts` on a fresh clone. *Cost if wrong:* a developer who genuinely wanted the live 8888 instance sets one variable.

**R14. `verify.ps1`'s step labels come from a `Write-Step` helper with one `$TotalSteps` constant, so the seven-to-ten renumber happens once and never again.** This plan adds **three** steps: the wiki in Task 4 (7 to 8), the line ceiling in Task 6 (8 to 9), the client typecheck in Task 7 (9 to 10). Decision D94 records the same number. Introducing `Write-Step` in Task 4 makes every later addition a one-constant edit.

**The exact inventory of documents that quote the count, re-grepped at HEAD**, because a partial list is how a document gets left at an intermediate number:

| Where | What it says | Corrected by |
|---|---|---|
| `docs/VERIFICATION.md:72` | "`scripts/verify.ps1`, seven steps" | Task 4, then 6, then 7 |
| `docs/VERIFICATION.md:95` | "`verify.ps1:1-15` describes five things and does seven" | Task 4, then 6, then 7 |
| `docs/VERIFICATION.md` tier 2 table | the step list | Tasks 4, 6, 7 |
| `README.md:35` | "Seven steps: ..." plus "does **not** ... measure a line count" | Task 4, then 6 |
| `docs/README.md:37` | "**not in `verify.ps1`**" (the wiki row) | Task 4 |
| `docs/ARCHITECTURE.md:236` | "the acceptance gate, seven steps" | Task 4, then 6, then 7 |
| `CLAUDE.md:66` | "the acceptance gate, seven steps" | Task 4, then 6, then 7 |
| `.claude/skills/idlescape-verify/SKILL.md:18,:48,:96` | three restatements of the count | Task 4, then 6, then 7 |

`docs/ARCHITECTURE.md:66,:68,:223,:304` are **not** step-count claims and are listed here so nobody edits them for the wrong reason: `:66` is "Files under 400 lines | Nothing | **Not enforced** (audit C16)" (Task 6 falsifies it), `:68` and `:223` say the wiki is outside every gate (Task 4), `:304` says "`/wiki` 503s forever in production" (Task 5).

**Every one of the eight rows above is edited three times, by Tasks 4, 6 and 7 in turn**, except the two the table scopes to fewer. Each task's Files list and `git add` carries all of them; a document left saying "eight steps" is the same defect as one left saying seven, and Task 12's sweep greps for every intermediate spelling so a miss fails. The documents are corrected in the task that falsifies them, not in a sweep at the end. *Cost if wrong:* a slightly less greppable step label; the numbers still print.

**R15. The wiki data drift gate is a cheap `contentSha` assertion on every build, plus a `--check-full` run by hand at tier 3.** A byte-for-byte copy of `scripts/gen/atlas.ts --check` cannot work here: `wiki/data/274/manifest.json` carries a `generatedAt` ISO timestamp (`extract.ts:66`) so a byte comparison fails on every run, and a full re-extract parses every `.jm2` map to produce 818,801 loc placements, which is nothing like the seconds the atlas check costs. `build.ps1` therefore asserts that `wiki/data/274/manifest.json`'s `contentSha` equals `scripts/upstream.lock`'s `engine/content` sha, which is O(1) and catches the exact failure the audit names, a content bump nobody re-extracted. It does **not** catch a hand-edited `items.json`, and both the throw message and `docs/VERIFICATION.md` say so rather than implying more. `bun wiki/gen/extract.ts --check-full` extracts to a temporary directory and compares the eleven tracked JSON files plus `gaps.md`, skipping `loc-spawns.json`, normalising line endings the way `scripts/gen/lib/io.ts:55-68` does, and normalising `generatedAt` away. *Cost if wrong:* a hand-edited data file survives until someone runs the full check; the tier 3 row in `docs/VERIFICATION.md` says exactly that.

**R16. The server image builds the wiki from a second Content clone and ships the ~132 MiB database.** The alternative, a reader database built without loc spawns, thins out `wiki/gen/render/area.ts:14-15`'s feature lists and would make the deployed wiki quietly different from the local one. The costs are stated rather than discovered: one extra `git clone` of `LostCityRS/Content` per server image build (build time and bandwidth on the box, not image size; `--filter=blob:none` is the mitigation if it hurts, and `--depth 1` is not available because the checkout is a pinned sha), and about 132 MiB of image layer on a `small_3_0` Lightsail bundle. `CONTENT_SHA` must be added to the `server` service's build args in `docker-compose.yml:69-75`, which today passes only `ENGINE_SHA`; `release.ps1:64` already writes `CONTENT_SHA` into `compose.env`, so nothing above compose changes. *Cost if wrong:* the box runs out of disk, which `deploy/lightsail/README.md` gains a sentence about, and the fallback is the loc-spawn-free database.

**R17. The image needs no `WIKI_DB` override.** `server/src/env.ts:65` defaults to `../wiki/build/wiki.db`, resolved against `server.Dockerfile:63`'s `WORKDIR /app/server`, so the image path is `/app/wiki/build/wiki.db` and it falls out of the layout comment already at `:70-73`. Adding a `WIKI_DB` line to `docker-compose.yml` would be a second statement of the same fact that can drift from the first. *Cost if wrong:* one environment line in compose.

**R18. The line ceiling has one authority and one convenience, and the authority checks the convenience.** `scripts/line-ceiling.ps1` is the authority: it enumerates with `git ls-files` (which excludes `node_modules`, `dist`, `engine/`, `wiki/build/` and `live/` for free, and means an untracked scratch file cannot fail the gate), covers every area including `web/`, and holds the exemption list in its own header. `web/eslint.config.js` gains `'max-lines': ['error', { max: 400, skipBlankLines: false, skipComments: false }]` as the convenience, because `web/src` is where the seven near-ceiling files live and editor feedback there is worth having. The script asserts that `web/eslint.config.js` contains a `max-lines` rule with the same number, so the two cannot drift. It runs **early** in `verify.ps1`, not from `build.ps1`: it is a second of work, failing at step 1 costs nothing while failing at step 8 costs the suites before it, and `build.ps1` is about producing shippable bundles. This overrides C16's literal wording, which put it in `build.ps1`. *Cost if wrong:* the check runs a few minutes later in the gate.

**R19. `engine-custom/src/web.ts` is exempt from the ceiling, in writing, and the `/setup` guard is one `onRequest` hook.** The file is 367 lines and is a whole-file replacement of an upstream file, so its size is upstream's choice; three per-route guards would add about 30 lines and three places to forget, while one hook that 401s any path starting with `/setup` adds about twelve and cannot be forgotten by a fourth route. `/prometheus` stays open by not matching. The exemption is recorded in `scripts/line-ceiling.ps1`'s header with the other five. *Cost if wrong:* an upstream bump grows the file past 400 and the exemption hides it; the `engine-overlay.ps1 -Check` drift gate catches the bump itself.

**R20. `GET /owner/health` is a new route rather than a reuse of `GET /owner/verifyprobe/bank`.** `verify.ps1:255-268` already proves a secret is configured by probing a fake owner key, and it is safe (`ownerBank.ts:105-120` caches an in-memory entry with `dirtyFile:false` and writes nothing), but on a 10-second production interval it is an odd thing to lean on. The new route is registered by `registerOwnerBankRoutes`, so it exists only when a secret is set, is behind the same `authorised()` check, returns `{ ok: true }` and touches no store. `verify.ps1`'s existing probe is repointed at it in the same change so there is one answer and not two. *Cost if wrong:* one route and one `verify.ps1` line revert to the fake key.

**R21. `HealthSnapshot.management` has four values, and `/api/health` stays public.** `'up' | 'unauthorized' | 'unconfigured' | 'down'`: 200 is `up`, 401 or 404 is `unauthorized`, an empty configured secret is `unconfigured` without a probe at all (so a local stack reads honestly rather than looking broken), anything else or a throw is `down`. `Get-HealthGaps` requires `"up"`, so an unconfigured production box fails the gate, which is correct. `/api/health` is public and must stay public because `cutover.ps1:51` polls it through the public hostname, so `"management":"unauthorized"` is visible to anyone; it is a status word with no secret in it, and a gated field would break the cutover gate. The secret never appears in the response, in a log, or in an error message. *Cost if wrong:* an anonymous reader learns that the two halves of a private deployment disagree about a secret, which is already inferable from `/wiki` and the player count.

**R22. The per-request log is one JSON line, and the five route kinds a client boot floods are excluded.** `server/src/index.ts` has exactly one `console.log`, at `:124`, the startup line, so a live incident shows one boot line in `box/logs.sh`. A line per request would bury that under the client's own fetches. **The quiet set is read off `server/src/router.ts`'s `classify()`, not guessed**: `/assets/*` is `{ kind: 'static' }` (`:68-71`), `/` is `{ kind: 'index' }` (`:33`), `/play.html` and `/styleguide` are `{ kind: 'page' }` (`:34-36`), `/client/*` is `{ kind: 'client' }` (`:64-67`), and every `.mid` plus every `CACHE_PREFIXES` path (`/crc`, `/title`, `/config`, `/interface`, `/media`, `/versionlist`, `/textures`, `/wordenc`, `server/src/types.ts:4`) is `{ kind: 'cache' }` (`:61`). A single client boot is hundreds of `client` and `cache` requests and one `page`, so a quiet set of `static` and `index` alone would log the exact flood this ruling exists to prevent. The rule: `QUIET_KINDS = { static, index, page, client, cache }`, log every other kind, **plus** every request whose status is 400 or above regardless of kind, so a 404 storm on `/client/*` is still visible. The formatting is a pure function in a new `server/src/log.ts` with its own test, the test names the kinds from the `Route` union rather than inventing them (`proxy` is not a member), and it pins `shouldLog('cache', 200) === false` beside `shouldLog('cache', 502) === true` so the exclusion is asserted rather than assumed. *Cost if wrong:* one predicate and one set literal.

**R23. The audit is not rewritten; the reconciliation lives in the promoted ledger.** `docs/superpowers/specs/2026-09-07-project-audit.md` is a historical record of the state before this entry, and rewriting its C-rows would destroy the evidence the entry was built on. Task 12 writes `docs/superpowers/ledgers/2026-09-07-release-integrity-and-account-isolation.md` with a row per C-id saying closed, partly closed or out of scope and by which commit, and appends **one** line to the audit pointing at that ledger so a reader of the audit is not misled. *Cost if wrong:* a reader of the audit follows one link.

---

## File structure

Paths are repository-relative. Line counts are targets that keep every file under the 400-line ceiling Task 6 starts enforcing.

### Create

- `web/src/storage/scoped.ts` - the scoped key shape, scope-prefixed enumeration, the guarded read and write, and the one-time bare-key migration. Task 1. ~70 lines.
- `web/src/storage/scoped.test.ts` - the key shape, the migration in every direction, the storage-blocked path. Task 1. ~120 lines.
- `web/src/boot.ts` - `probeGate`, `createHealthWatcher`, `createBoot`, `showBootError`, all dependency-injected or DOM-only. Task 2. ~130 lines.
- `web/src/boot.test.ts` - the gate probe's three answers, the retry, the in-flight guard, teardown, the never-rejects contract, and the boot-error surface against the real `gate.html` partial. Task 2. ~215 lines.
- `web/src/frame/siteLabel.ts` - `siteLabel(gameName)` from `location.host` and `WORLD`. Task 3. ~15 lines.
- `web/src/frame/siteLabel.test.ts` - Task 3. ~25 lines.
- `engine-custom/.env.example` - the seven variables `engine-custom/src/idlescape/config.ts:76-115` reads. Task 3. ~35 lines.
- `web/tsconfig.test.json` - the test-and-harness project. Task 7. ~12 lines.
- `scripts/line-ceiling.ps1` - the authority for the 400-line ceiling, with the exemption list in its header. Task 6. ~110 lines.
- `server/src/log.ts` - the request log line formatter. Task 11. ~30 lines.
- `server/src/log.test.ts` - Task 11. ~40 lines.
- `docs/superpowers/ledgers/2026-09-07-release-integrity-and-account-isolation.md` - the promoted ledger and the audit reconciliation. Task 12. under 400 lines by the SDD convention.

### Modify

- `web/src/plugins/settings.ts` (98) - composes `scoped.ts`; `localStorage_snapshot` is deleted. Task 1.
- `web/src/tasks/toggles.ts` (118) - composes `scoped.ts`; `localIds` and `readLocal` are rewritten; the `:1-5` header comment is updated. Task 1.
- `web/src/plugins/settings.test.ts` (62), `web/src/tasks/toggles.test.ts` (189), `web/src/tasks/wire.test.ts` - twelve hardcoded bare key literals become scoped ones, plus the new cross-account tests. Task 1.
- `web/e2e/helpers.ts` (328) - gains `scopedItem(page, ns, id)`. Task 1.
- `web/e2e/plugins.pw.test.ts` - `:22`'s bare `cs.plugin.loot` poll becomes `scopedItem`, plus an assertion that no bare key exists. Task 1.
- `web/src/main.ts` (358) - loses `isGateOpen`, `watchHealth`, `boot` and `showBootError` to `boot.ts`; runs the migration first; holds the fps interval id; `:264` loses the password literal. Tasks 1, 2, 3. **It does not shrink**: Task 2 removes about 31 lines and adds about 27, and Task 1 adds about 7, so it lands near **361**, four above HEAD and well under the 400 ceiling Task 6 starts enforcing. The arithmetic is in Task 2 Step 7; do not plan on headroom that is not there.
- `web/src/partials/gate.html` (11) - restructured into a `<div class="card">` wrapper so `#gate-boot-error` can be a sibling of `#gate-form` rather than a child of it (ruling R6). Task 2.
- `web/src/frame/stage.ts`, `web/src/sessions/wire.ts`, `web/src/frame/stage.test.ts` (three assertions at `:153,:176,:190`) - all call `siteLabel`. Task 3.
- `server/src/env.ts` (67) - the 8899 defaults. Task 3.
- `server/src/env.test.ts` (50) - the base fixture, the default test, and the two template tests (the `.env.example` set equality and the `provision.ps1` generator cover). Task 3.
- `deploy/lightsail/provision.ps1` - the `# NOT-WRITTEN:` declaration beside the nine-key `server.env` generator (ruling R12). Task 3.
- `server/.env.example` (33) - `:21-24` become working dev values; `:15` gains a comment. Task 3.
- `server/.env.production.example` - **deleted** (R11). Task 3.
- `deploy/windows/register-tasks.ps1` - `:22-24` repointed. Task 3.
- `.dockerignore` (37) - loses the `.env.production.example` line (Task 3), gains `wiki/build/` and `wiki/data/*/loc-spawns.json` (Task 5).
- `scripts/build.ps1` (94) - step 1c, the wiki build and the drift assertion; the step 3 artifact assertion covers the wiki. Task 4.
- `scripts/verify.ps1` (293) - `Write-Step`, the wiki step (Task 4), the line-ceiling step (Task 6), the client typecheck step (Task 7), the repointed management probe (Task 10).
- `scripts/setup.ps1` - `bun install` in `wiki/`. Task 4.
- `wiki/gen/extract.ts` - the `--check-full` mode. Task 4.
- `deploy/docker/server.Dockerfile` (81) - the `wiki-build` stage and one runtime `COPY`. Task 5.
- `deploy/docker/docker-compose.yml` - `CONTENT_SHA` in the `server` build args (Task 5); the `:15-21` topology comment (Task 9).
- `web/eslint.config.js` (28) - `max-lines`. Task 6.
- `web/tsconfig.json` (19) - `exclude` gains the harnesses now that they live in the test project. Task 7.
- `web/package.json` - `typecheck` gains a third project. Task 7.
- `client/package.json` - a `typecheck` script. Task 7.
- `client/PATCHES.md` - `:33-35`'s unverified claim becomes a verified one. Task 7.
- Whatever the new typechecks surface, roughly 28 web test files plus `web/src/ui/toast.ts`. Task 8.
- `engine-custom/src/web.ts` (367) - the `/setup` `onRequest` hook. Task 9.
- `engine-custom/src/idlescape/management.ts` - `GET /owner/health`. Task 9.
- `engine-custom/src/idlescape/management.test.ts` - the hook and the route. Task 9.
- `engine-custom/PATCHES.md` (845) - two rows with verifying greps. Task 9.
- `deploy/docker/engine.Dockerfile` - one more `RUN grep`. Task 9.
- `server/src/types.ts` - `HealthSnapshot.management`. Task 10.
- `server/src/health.ts` (61), `server/src/health.test.ts`, `server/src/index.ts` - the management probe. Task 10.
- `deploy/lightsail/common.ps1` - a fourth gap in `Get-HealthGaps`. Task 10.
- `server/src/proxy/http.ts` (16), `server/src/proxy/http.test.ts` - `no-store` on non-2xx. Task 11.
- `docs/VERIFICATION.md`, `docs/ARCHITECTURE.md`, `README.md`, `docs/README.md`, `.claude/skills/idlescape-verify/SKILL.md`, `deploy/lightsail/README.md`, `deploy/docker/README.md`, `wiki/AUTHORING.md` - corrected in the task that falsifies each, swept in Task 12.
- `docs/superpowers/decisions.md` - the cross-entry rulings, appended by the planner with this plan.

---

### Task 1: Account isolation - per-principal localStorage buckets (C10)

The live data leak, and the only task that touches the `web/src` stores. Entry 1 is complete, so
`web/src/tasks/toggles.ts` is free and both halves land here. The fix must be identical in both
files, because `toggles.ts:1-5` states in its own header that the shape is deliberately identical.

**Files:**
- Create: `web/src/storage/scoped.ts`
- Create: `web/src/storage/scoped.test.ts`
- Modify: `web/src/plugins/settings.ts:18,20-28,52,57-69,88-98`
- Modify: `web/src/tasks/toggles.ts:1-5,23-24,43-48,50-60,96-99,107`
- Modify: `web/src/plugins/settings.test.ts:18,25,36,49`
- Modify: `web/src/tasks/toggles.test.ts:24,70,79,100,121,131,137,182`
- Modify: `web/src/tasks/wire.test.ts:116`
- Modify: `web/src/main.ts` (the migration call, at the top of the module body, before `:41`)
- Modify: `web/e2e/helpers.ts`
- Modify: `web/e2e/plugins.pw.test.ts:22`

**Interfaces:**
- Consumes: nothing. This is the first task.
- Produces, from `web/src/storage/scoped.ts`:
  - `type ScopedNamespace = 'plugin' | 'script'`
  - `scopeOf(uid: string | null): string`
  - `scopePrefix(ns: ScopedNamespace, uid: string | null): string`
  - `scopedKey(ns: ScopedNamespace, uid: string | null, id: string): string`
  - `scopedIds(ns: ScopedNamespace, uid: string | null): string[]`
  - `readScoped(ns: ScopedNamespace, uid: string | null, id: string): string | null`
  - `writeScoped(ns: ScopedNamespace, uid: string | null, id: string, value: string): void`
  - `migrateBareKeys(ns: ScopedNamespace): number`
- Produces, from `web/src/plugins/settings.ts`: `migratePluginKeys(): number`
- Produces, from `web/src/tasks/toggles.ts`: `migrateScriptKeys(): number`
- Produces, from `web/e2e/helpers.ts`: `scopedItem(page: Page, ns: 'plugin' | 'script', id: string): Promise<string | null>`
- `SettingsStore` and `ToggleStore` keep their exact public signatures. Both already take
  `uid: string | null` on every mutating call, so no caller outside these files changes.

- [ ] **Step 1: Write the failing test for the key shape and the migration**

Create `web/src/storage/scoped.test.ts`:

```ts
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { migrateBareKeys, readScoped, scopedIds, scopedKey, scopePrefix, writeScoped } from './scoped';

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

test('a signed-in principal and a signed-out one get different keys', () => {
  expect(scopedKey('plugin', 'abc123', 'loot')).toBe('cs.plugin.u.abc123.loot');
  expect(scopedKey('plugin', null, 'loot')).toBe('cs.plugin.anon.loot');
  expect(scopedKey('script', 'abc123', 'chop-and-drop')).toBe('cs.script.u.abc123.chop-and-drop');
  expect(scopePrefix('script', null)).toBe('cs.script.anon.');
});

test('every key keeps the cs. prefix', () => {
  for (const key of [scopedKey('plugin', 'u1', 'x'), scopedKey('script', null, 'y')]) {
    expect(key.startsWith('cs.')).toBe(true);
  }
});

test('enumeration sees one principal and never another', () => {
  writeScoped('plugin', 'userA', 'loot', '{"enabled":false,"settings":{}}');
  writeScoped('plugin', 'userB', 'xp', '{"enabled":true,"settings":{}}');
  writeScoped('plugin', null, 'notes', '{"enabled":true,"settings":{}}');
  expect(scopedIds('plugin', 'userA')).toEqual(['loot']);
  expect(scopedIds('plugin', 'userB')).toEqual(['xp']);
  expect(scopedIds('plugin', null)).toEqual(['notes']);
});

test('a foreign namespace is never adopted', () => {
  localStorage.setItem('cs.other.u.userA.loot', 'x');
  localStorage.setItem('cs.pl.loot.k', 'x');
  expect(scopedIds('plugin', 'userA')).toEqual([]);
});

test('the pre-C10 bare keys move into the anon bucket and nowhere else', () => {
  localStorage.setItem('cs.plugin.loot', '{"enabled":false,"settings":{}}');
  localStorage.setItem('cs.script.chop-and-drop', 'false');
  expect(migrateBareKeys('plugin')).toBe(1);
  expect(migrateBareKeys('script')).toBe(1);
  expect(localStorage.getItem('cs.plugin.loot')).toBeNull();
  expect(localStorage.getItem('cs.script.chop-and-drop')).toBeNull();
  expect(readScoped('plugin', null, 'loot')).toBe('{"enabled":false,"settings":{}}');
  expect(readScoped('script', null, 'chop-and-drop')).toBe('false');
  // The rule that matters: no account inherits them.
  expect(readScoped('plugin', 'userA', 'loot')).toBeNull();
  expect(scopedIds('script', 'userA')).toEqual([]);
});

test('the migration leaves already-scoped keys alone and is idempotent', () => {
  writeScoped('plugin', 'userA', 'xp', 'kept');
  localStorage.setItem('cs.plugin.loot', 'moved');
  expect(migrateBareKeys('plugin')).toBe(1);
  expect(migrateBareKeys('plugin')).toBe(0);
  expect(readScoped('plugin', 'userA', 'xp')).toBe('kept');
  expect(readScoped('plugin', null, 'loot')).toBe('moved');
});

test('a bare key never overwrites a value the anon bucket already holds', () => {
  writeScoped('plugin', null, 'loot', 'newer');
  localStorage.setItem('cs.plugin.loot', 'older');
  expect(migrateBareKeys('plugin')).toBe(0);
  expect(readScoped('plugin', null, 'loot')).toBe('newer');
  expect(localStorage.getItem('cs.plugin.loot')).toBeNull();
});

test('blocked storage returns zero rather than throwing at boot', () => {
  localStorage.setItem('cs.plugin.loot', 'x');
  vi.spyOn(Storage.prototype, 'key').mockImplementation(() => { throw new Error('blocked'); });
  expect(() => migrateBareKeys('plugin')).not.toThrow();
  expect(migrateBareKeys('plugin')).toBe(0);
  expect(scopedIds('plugin', null)).toEqual([]);
});
```

- [ ] **Step 2: Run it and watch it fail for the right reason**

Run: `cd web && npx vitest run src/storage/scoped.test.ts`
Expected: FAIL with `Failed to resolve import "./scoped"`. Not a type error and not an assertion:
the module does not exist yet.

- [ ] **Step 3: Write `web/src/storage/scoped.ts`**

```ts
// Per-principal localStorage buckets. Audit C10: `cs.plugin.<id>` and `cs.script.<id>` carried no
// uid, so load(uid) enumerated the whole namespace and one browser leaked enable flags, notes and
// script toggles between accounts. Every key is now scoped: `cs.<ns>.u.<uid>.<id>` for a signed-in
// principal and `cs.<ns>.anon.<id>` for a signed-out one. Enumeration is by the scoped prefix, so
// a store cannot see another scope's keys at all: the leak is closed by construction rather than
// by a filter someone can forget to apply.
//
// IN SCOPE: `cs.plugin.*` (web/src/plugins/settings.ts) and `cs.script.*` (web/src/tasks/toggles.ts),
// the two stores audit C10 names.
//
// OUT OF SCOPE, deliberately, and still unscoped, for two different reasons:
//   - `cs.<k>` (web/src/tasks/wire.ts) is audit C21 and belongs to entry 4.
//   - `cs.tasks.settings`, `cs.panel`, `cs.size`, `cs.filter` and the three `cs.bank.*` keys are
//     per-browser display preferences rather than per-account state, so sharing them between one
//     person's own accounts is not a leak.
//   - `cs.pl.<id>.<k>` (web/src/main.ts's PluginContext.storage) is NOT a display preference. It is
//     arbitrary per-plugin data and it is on exactly this defect. It waits only because no builtin
//     plugin calls it today: `git grep -n "storage\." -- web/src/plugins/builtin` returns nothing,
//     so the leak is currently unreachable. THE FIRST PLUGIN THAT USES ctx.storage MUST SCOPE IT
//     through this module; do not read the line above as permission to leave it bare.
//
// Entry 4's web/src/ui/storage.ts KEYS inventory composes over this module rather than restating
// the shape.

export type ScopedNamespace = 'plugin' | 'script';

/** `u.<uid>` signed in, `anon` signed out. Literal discriminators, so no uid can collide with anon. */
export function scopeOf(uid: string | null): string {
  return uid === null ? 'anon' : `u.${uid}`;
}

/** Everything one principal's bucket shares, e.g. `cs.plugin.u.abc123.` or `cs.script.anon.`. */
export function scopePrefix(ns: ScopedNamespace, uid: string | null): string {
  return `cs.${ns}.${scopeOf(uid)}.`;
}

export function scopedKey(ns: ScopedNamespace, uid: string | null, id: string): string {
  return `${scopePrefix(ns, uid)}${id}`;
}

/** The ids in one principal's bucket. Guarded: a private window can block storage outright. */
export function scopedIds(ns: ScopedNamespace, uid: string | null): string[] {
  const prefix = scopePrefix(ns, uid);
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k !== null && k.startsWith(prefix)) out.push(k.slice(prefix.length));
    }
  } catch { /* storage blocked */ }
  return out;
}

export function readScoped(ns: ScopedNamespace, uid: string | null, id: string): string | null {
  try { return localStorage.getItem(scopedKey(ns, uid, id)); } catch { return null; }
}

export function writeScoped(ns: ScopedNamespace, uid: string | null, id: string, value: string): void {
  try { localStorage.setItem(scopedKey(ns, uid, id), value); } catch { /* storage blocked */ }
}

/**
 * Moves every pre-C10 bare `cs.<ns>.<id>` key into the anon bucket, and into no account's bucket.
 * Returns how many were moved. Idempotent: after one pass there are no bare keys left, so a second
 * pass moves nothing, which is why this needs no marker key to guard it.
 *
 * Why anon and not the signed-in account: the principal that wrote a bare key is unknowable, and
 * adopting it into whichever account signs in first is exactly the leak this closes. Firestore is
 * the record for a signed-in account (`users/{uid}/plugins`, `users/{uid}/scriptToggles`) and
 * load(uid) refills that bucket from it; `anon` is precisely what a bare key has always meant in
 * the signed-out case. Nothing is deleted without being read first, so no value is silently reset.
 */
export function migrateBareKeys(ns: ScopedNamespace): number {
  const nsPrefix = `cs.${ns}.`;
  // Collect first: removing a key while enumerating by index shifts every index after it.
  const bare: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k === null || !k.startsWith(nsPrefix)) continue;
      const rest = k.slice(nsPrefix.length);
      // `u.` and `anon.` are the two scope discriminators. No plugin id (`loot`, `xp`, `notes`,
      // `tasks`, `bank`, `status-hud`, ...) and no script id (kebab-case, e.g. `chop-and-drop`)
      // starts with either, so anything else is a pre-C10 bare key.
      if (rest.startsWith('u.') || rest.startsWith('anon.')) continue;
      bare.push(rest);
    }
  } catch { return 0; }

  let moved = 0;
  for (const id of bare) {
    try {
      const from = `${nsPrefix}${id}`;
      const value = localStorage.getItem(from);
      // The target was written by the current code and is newer than any bare key, so a collision
      // drops the bare key rather than overwriting what the anon bucket already holds.
      if (value !== null && readScoped(ns, null, id) === null) { writeScoped(ns, null, id, value); moved++; }
      localStorage.removeItem(from);
    } catch { /* storage blocked mid-sweep: leave the rest alone */ }
  }
  return moved;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd web && npx vitest run src/storage/scoped.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Write the failing cross-account tests for both stores**

Append to `web/src/plugins/settings.test.ts`, inside the existing `describe('settings store', ...)`:

```ts
  test('a second account cannot see the first account settings', async () => {
    const store = createSettingsStore(memoryBackend(), { debounceMs: 10 });
    await store.load('userA');
    store.setEnabled('userA', 'loot', false);
    expect(localStorage.getItem('cs.plugin.u.userA.loot')).toContain('"enabled":false');

    const forB = await store.load('userB');
    expect(forB.has('loot')).toBe(false);
    expect(store.get('loot')).toBeUndefined();
  });

  test('signing out shows the anon bucket, not the account that was just signed in', async () => {
    const store = createSettingsStore(memoryBackend(), { debounceMs: 10 });
    await store.load('userA');
    store.setEnabled('userA', 'loot', false);

    const signedOut = await store.load(null);
    expect(signedOut.has('loot')).toBe(false);
    expect(localStorage.getItem('cs.plugin.anon.loot')).toBeNull();
  });
```

Append to `web/src/tasks/toggles.test.ts` (that file has no `describe` wrapper):

```ts
test('a script disabled by one account still runs for another', async () => {
  const store = createToggleStore(backend(), { debounceMs: 10 });
  await store.load('userA');
  store.setEnabled('userA', 'chop-and-drop', false);
  expect(store.isEnabled('chop-and-drop')).toBe(false);
  expect(localStorage.getItem('cs.script.u.userA.chop-and-drop')).toBe('false');

  await store.load('userB');
  // Absent means enabled: userB has never touched this script and must not inherit userA's off.
  expect(store.isEnabled('chop-and-drop')).toBe(true);
  expect(localStorage.getItem('cs.script.u.userB.chop-and-drop')).toBeNull();
});

test('a signed-out toggle does not follow the player into an account', async () => {
  const store = createToggleStore(backend(), { debounceMs: 10 });
  await store.load(null);
  store.setEnabled(null, 'chop-and-drop', false);
  expect(localStorage.getItem('cs.script.anon.chop-and-drop')).toBe('false');

  await store.load('userA');
  expect(store.isEnabled('chop-and-drop')).toBe(true);
});
```

- [ ] **Step 6: Run them and watch them fail for the right reason**

Run: `cd web && npx vitest run src/plugins/settings.test.ts src/tasks/toggles.test.ts`
Expected: FAIL. `cs.plugin.u.userA.loot` is null because the store still writes `cs.plugin.loot`,
and `forB.has('loot')` is `true` because `load` still unions in every `cs.plugin.*` key. That
second failure is the leak itself, reproduced in a test.

- [ ] **Step 7: Scope `web/src/plugins/settings.ts`**

Replace `:18` through `:28` with an import and two thin wrappers, and delete
`localStorage_snapshot` at `:88-98` entirely:

```ts
import { migrateBareKeys, readScoped, scopedIds, writeScoped } from '../storage/scoped';
import type { SettingsValues } from './types';

// ... the four exported interfaces are unchanged ...

function readLocal(uid: string | null, id: string): PluginDoc | undefined {
  const raw = readScoped('plugin', uid, id);
  if (raw === null) return undefined;
  try { return JSON.parse(raw) as PluginDoc; } catch { return undefined; }
}

function writeLocal(uid: string | null, id: string, doc: PluginDoc): void {
  writeScoped('plugin', uid, id, JSON.stringify(doc));
}

/** Run once at boot, before any store is built. See web/src/storage/scoped.ts. */
export function migratePluginKeys(): number { return migrateBareKeys('plugin'); }
```

`mutate` at `:48-54` passes the uid through to storage:

```ts
  function mutate(uid: string | null, id: string, patch: Partial<PluginDoc>): void {
    const current = docs.get(id) ?? { enabled: false, settings: {} };
    const next: PluginDoc = { enabled: patch.enabled ?? current.enabled, settings: patch.settings ?? current.settings };
    docs.set(id, next);
    writeLocal(uid, id, next);
    if (uid) schedule(uid, id);
  }
```

`load` at `:57-69` enumerates only this principal's bucket:

```ts
    async load(uid) {
      docs.clear();
      let remote: Record<string, PluginDoc> = {};
      if (uid) { try { remote = await backend.load(uid); } catch { remote = {}; } }
      const ids = new Set(Object.keys(remote));
      // This principal's own mirror fills only ids the backend did not return. Another account's
      // bucket is not reachable from here at all: scopedIds is prefixed by uid (audit C10).
      for (const id of scopedIds('plugin', uid)) ids.add(id);
      for (const id of ids) {
        const doc = remote[id] ?? readLocal(uid, id);
        if (doc) docs.set(id, doc);
      }
      return new Map(docs);
    },
```

- [ ] **Step 8: Scope `web/src/tasks/toggles.ts`**

Rewrite the header comment at `:1-5` so it no longer promises a key shape that has changed, and so
the next reader knows both stores moved together:

```ts
// Per-script enable, per account (spec decision 7). Firestore is the record; localStorage is a
// mirror so a reload before the debounce fires still shows what the player chose, and so a
// signed-out player still has working toggles. The mirror is keyed by principal
// (`cs.script.u.<uid>.<id>`, or `cs.script.anon.<id>` signed out) through web/src/storage/scoped.ts:
// audit C10 found the old bare `cs.script.<id>` key leaking one account's choices into another on
// the same browser. Deliberately the same debounce, key shape and load precedence as
// web/src/plugins/settings.ts, which scopes itself through the same module: a second,
// differently-behaved persistence model for the same kind of value is how two stores end up
// disagreeing about what was chosen.
```

Delete `PREFIX` and `KEY` (`:23-24`) and `localIds` (`:50-60`), and rewrite `readLocal` (`:43-48`):

```ts
import { migrateBareKeys, readScoped, scopedIds, writeScoped } from '../storage/scoped';

const DEBOUNCE_MS = 800;

function readLocal(uid: string | null, id: string): boolean | undefined {
  const raw = readScoped('script', uid, id);
  return raw === null ? undefined : raw === 'true';
}

/** Run once at boot, before any store is built. See web/src/storage/scoped.ts. */
export function migrateScriptKeys(): number { return migrateBareKeys('script'); }
```

`load` at `:87-102` and `setEnabled` at `:104-109` take the uid through to storage:

```ts
    async load(uid) {
      dirty.clear();
      values.clear();
      let remote: Record<string, boolean> = {};
      if (uid) { try { remote = await backend.load(uid); } catch { remote = {}; } }
      // This principal's mirror goes in first and the backend overwrites it, so a value written on
      // another device wins over a stale local mirror while an id the backend has never heard of
      // stays. A write made while this load was in flight outranks both. Another account's bucket
      // is unreachable from here: scopedIds is prefixed by uid (audit C10).
      for (const id of scopedIds('script', uid)) {
        const local = readLocal(uid, id);
        if (local !== undefined && !dirty.has(id)) values.set(id, local);
      }
      for (const [id, enabled] of Object.entries(remote)) { if (!dirty.has(id)) values.set(id, enabled); }
      return new Map(values);
    },
    isEnabled: id => values.get(id) !== false,
    setEnabled(uid, id, enabled) {
      values.set(id, enabled);
      dirty.add(id);
      writeScoped('script', uid, id, String(enabled));
      if (uid) schedule(uid, id, enabled);
    },
```

Note `writeScoped` already swallows a storage error, so the `try`/`catch` that was inline at `:107`
goes away with the line.

- [ ] **Step 9: Repoint the twelve existing key literals**

Each of these is a bare key that no longer exists. **Read each test's own `store.load(...)`
argument before choosing the scope; do not pattern-replace.**

- `web/src/plugins/settings.test.ts:18` `'cs.plugin.xp'` becomes `'cs.plugin.u.u1.xp'`
- `:25` `'cs.plugin.notes'` becomes `'cs.plugin.u.u1.notes'`
- `:36` `'cs.plugin.xp'` becomes `'cs.plugin.u.u1.xp'`
- `:49` `'cs.plugin.xp'` becomes `'cs.plugin.anon.xp'` (that test calls `store.load(null)`)
- `web/src/tasks/toggles.test.ts:24,70,79,100,121,131,137` `'cs.script.<id>'` becomes
  `'cs.script.u.u1.<id>'` where the test loaded `'u1'`, and `'cs.script.anon.<id>'` where it
  loaded `null`
- `:182-183` seeds `'cs.script.x'` and `'cs.other.x'` then loads `null`: the first becomes
  `'cs.script.anon.x'`; **the second stays exactly as it is**, because the point of that test is
  that a foreign namespace is not adopted, and it still is not
- `web/src/tasks/wire.test.ts:116` asserts the bare mirror key: it becomes
  `'cs.script.u.u1.chop-and-drop'`, matching the uid that file mocks. `:139`'s Firestore path
  assertion (`users/u1/scriptToggles/chop-and-drop`) is **unchanged**: the backend document path
  never had this defect.

One trap, and the citation matters because the wrong lines look like something else: the idiom is
at `web/src/tasks/toggles.test.ts:159` (`const armed = vi.getTimerCount();`) and `:166`
(`expect(vi.getTimerCount()).toBe(armed - 1)`), not at `:39-42`, which is an unrelated debounce
assertion. jsdom arms a timer on every `localStorage` write, which is why that test asserts
`vi.getTimerCount()` as a **delta** rather than an absolute. Do not turn any of those into
absolutes while editing nearby lines.

- [ ] **Step 10: Run both suites and watch everything pass**

Run: `cd web && npx vitest run src/plugins src/tasks src/storage`
Expected: PASS, including the four new cross-account tests from Step 5.

- [ ] **Step 11: Run the migration at boot in `web/src/main.ts`**

Change the import at `:16` and add one at the top of the tasks imports, then call both at the very
top of the module body, immediately before `const state = createAppState();` at `:41`. They must
run before `createSettingsStore` at `:157` and before `wireTasks` builds a toggle store per
session:

```ts
import { createSettingsStore, migratePluginKeys } from './plugins/settings';
import { migrateScriptKeys } from './tasks/toggles';

// Audit C10: pre-scoping `cs.plugin.<id>` and `cs.script.<id>` keys move into the signed-out
// bucket before any store reads them. Idempotent and guarded, so it is safe on every load and on a
// browser with storage blocked. See web/src/storage/scoped.ts for why anon and not the account.
migratePluginKeys();
migrateScriptKeys();
```

- [ ] **Step 12: Update the Playwright spec, which asserts a key that no longer exists**

`web/e2e/plugins.pw.test.ts:22` polls `localStorage.getItem('cs.plugin.loot')`. The spec runs
signed in as a guest, so the new key carries a uid the spec does not know. Add a helper to
`web/e2e/helpers.ts` that finds it by shape rather than by literal:

```ts
/**
 * Reads a scoped store key from the page without knowing the signed-in uid: audit C10 moved
 * `cs.plugin.<id>` to `cs.plugin.u.<uid>.<id>` (see web/src/storage/scoped.ts). Returns the first
 * signed-in bucket's value for that id, or null.
 */
export async function scopedItem(page: Page, ns: 'plugin' | 'script', id: string): Promise<string | null> {
  return page.evaluate(([namespace, key]) => {
    const prefix = `cs.${namespace}.u.`;
    const suffix = `.${key}`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k !== null && k.startsWith(prefix) && k.endsWith(suffix)) return localStorage.getItem(k);
    }
    return null;
  }, [ns, id] as const);
}
```

and rewrite `plugins.pw.test.ts:20-24`:

```ts
  // The store writes localStorage synchronously: this is what a reload would load back. The key is
  // scoped to the signed-in uid (audit C10), so it is found by shape rather than by literal.
  await expect.poll(() => scopedItem(page, 'plugin', 'loot')).toContain('"enabled":false');
  // The pre-C10 bare key must not come back: a store that still wrote it would leak into the next
  // account on this browser.
  expect(await page.evaluate(() => localStorage.getItem('cs.plugin.loot'))).toBeNull();
```

Add `scopedItem` to the existing `import { loginAsGuest, openGate } from './helpers';` line.

- [ ] **Step 13: Verify**

From the repository root in Git Bash:

```bash
cd web && npm run typecheck && npm run lint && npx vitest run
```

Expected: typecheck clean, lint clean, every web suite green including the four new cross-account
tests and the eight in `src/storage/scoped.test.ts`.

The Playwright change in Step 12 needs the whole stack and is verified by Task 12's `verify.ps1`
run. Do not start a stack for it here.

Then grep for anything this task missed, from the repository root:

```bash
git grep -n "cs\.plugin\.\${\|cs\.script\.\${" -- web/
git grep -n "cs\.plugin\.[a-z]\|cs\.script\.[a-z]" -- web/src web/e2e | grep -v "\.u\.\|\.anon\."
```

Expected: the first returns nothing. The second returns only the one deliberate assertion in
`plugins.pw.test.ts` that the bare key is gone, and `toggles.test.ts:183`'s `cs.other.x`.

- [ ] **Step 14: Commit**

```bash
git add web/src/storage/scoped.ts web/src/storage/scoped.test.ts \
        web/src/plugins/settings.ts web/src/plugins/settings.test.ts \
        web/src/tasks/toggles.ts web/src/tasks/toggles.test.ts web/src/tasks/wire.test.ts \
        web/src/main.ts web/e2e/helpers.ts web/e2e/plugins.pw.test.ts
git -c core.safecrlf=false commit -m "fix(web): key plugin and script state by principal so one browser stops leaking between accounts

Audit C10. cs.plugin.<id> and cs.script.<id> carried no uid, so load(uid) unioned in every key in
the namespace and a second account on the same browser inherited the first account's enable flags
and notes. Both stores now read and write cs.<ns>.u.<uid>.<id>, or cs.<ns>.anon.<id> signed out,
through one module that owns the shape and the enumeration.

Pre-existing bare keys move into the anon bucket once, at boot, and into no account's bucket: the
principal that wrote them is unknowable, and adopting them into whichever account signs in first is
the leak itself. Firestore is the record for a signed-in account and refills its bucket.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

### Task 2: Boot cannot blank the page, and the health poll cannot pile up (C18)

`boot()` rejects on a network blip and leaves a genuinely blank page with nothing in the console.
`web/src/main.ts` cannot be imported under jsdom (fourteen module-scope `byId` calls, and
`web/src/dom.ts:31-35` throws on a missing element), so the fix begins by extracting the seam. That
extraction is also what gives `main.ts` headroom before entry 4 opens it.

**Files:**
- Create: `web/src/boot.ts`
- Create: `web/src/boot.test.ts`
- Modify: `web/src/main.ts:160,262-265,302-314,322-328,351-358`
- Modify: `web/src/partials/gate.html` (the whole file, 11 lines; ruling R6)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces, from `web/src/boot.ts`:
  - `type GateState = 'open' | 'closed' | 'unknown'`
  - `showBootError(message: string): void` - the DOM-only failure surface, exported from `boot.ts`
    rather than `main.ts` so a jsdom test can drive it against the real partial
  - `probeGate(deps: { fetchImpl: typeof fetch; waitMs?: (ms: number) => Promise<void> }): Promise<GateState>`
  - `interface HealthWatcherDeps { health: () => Promise<HealthSnapshot>; onSnapshot(h: HealthSnapshot | null): void; onCountdown(down: boolean, secs: number): void; intervalMs?: number }`
  - `interface HealthWatcher { start(): void; stop(): void; tick(): Promise<void> }`
  - `createHealthWatcher(deps: HealthWatcherDeps): HealthWatcher`
  - `interface BootDeps { probe: () => Promise<GateState>; watcher: HealthWatcher; wireGate(): void; showGate(): void; enterApp(): void; onBootError(message: string): void }`
  - `createBoot(deps: BootDeps): { run(): Promise<void> }`

- [ ] **Step 1: Write the failing tests**

Create `web/src/boot.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createBoot, createHealthWatcher, probeGate, showBootError } from './boot';
import type { HealthSnapshot } from './types';

// No `wiki` field: web/src/types.ts's HealthSnapshot is the WEB mirror and has six members
// (engine, engineUptimeMs, version, gateEnabled, gateway, players). Only server/src/types.ts:36-44
// carries `wiki`. Adding it here would be a TS2353 excess-property error the moment Task 7's
// tsconfig.test.json puts this file in a program, and vitest's esbuild transpile would hide it
// until then. Task 10 adds `management` and `wiki` to the web mirror together, and this factory
// gains both there.
const snapshot = (over: Partial<HealthSnapshot> = {}): HealthSnapshot => ({
  engine: 'up', engineUptimeMs: 1, version: '0.1.0', gateEnabled: false,
  gateway: 'not_deployed', players: 3, ...over
});
const noWait = async (): Promise<void> => {};
const idleWatcher = (): ReturnType<typeof createHealthWatcher> =>
  createHealthWatcher({ health: async () => snapshot(), onSnapshot: () => {}, onCountdown: () => {} });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test('a 401 on the client asset means the gate is closed', async () => {
  const fetchImpl = vi.fn(async () => new Response(null, { status: 401 })) as unknown as typeof fetch;
  expect(await probeGate({ fetchImpl, waitMs: noWait })).toBe('closed');
});

test('any other status means the gate is open', async () => {
  const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
  expect(await probeGate({ fetchImpl, waitMs: noWait })).toBe('open');
});

test('two consecutive network failures are unknown, not closed', async () => {
  const fetchImpl = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
  expect(await probeGate({ fetchImpl: fetchImpl as unknown as typeof fetch, waitMs: noWait })).toBe('unknown');
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test('a single blip is retried and the real answer wins', async () => {
  let n = 0;
  const fetchImpl = vi.fn(async () => {
    n += 1;
    if (n === 1) throw new TypeError('Failed to fetch');
    return new Response(null, { status: 401 });
  }) as unknown as typeof fetch;
  expect(await probeGate({ fetchImpl, waitMs: noWait })).toBe('closed');
});

test('an unreachable server enters the app rather than showing a gate nobody can pass', async () => {
  const enterApp = vi.fn();
  const showGate = vi.fn();
  const watcher = idleWatcher();
  await createBoot({ probe: async () => 'unknown', watcher, wireGate: () => {}, showGate, enterApp, onBootError: () => {} }).run();
  expect(enterApp).toHaveBeenCalledTimes(1);
  expect(showGate).not.toHaveBeenCalled();
  watcher.stop();
});

test('a closed gate paints the gate and does not enter the app', async () => {
  const enterApp = vi.fn();
  const showGate = vi.fn();
  const watcher = idleWatcher();
  await createBoot({ probe: async () => 'closed', watcher, wireGate: () => {}, showGate, enterApp, onBootError: () => {} }).run();
  expect(showGate).toHaveBeenCalledTimes(1);
  expect(enterApp).not.toHaveBeenCalled();
  watcher.stop();
});

test('boot never rejects, and a thrown enterApp reaches the error surface', async () => {
  const onBootError = vi.fn();
  const watcher = idleWatcher();
  const boot = createBoot({
    probe: async () => 'open', watcher, wireGate: () => {}, showGate: () => {},
    enterApp: () => { throw new Error('homeCtl exploded'); }, onBootError
  });
  await expect(boot.run()).resolves.toBeUndefined();
  expect(onBootError).toHaveBeenCalledTimes(1);
  expect(onBootError.mock.calls[0]?.[0]).toContain('homeCtl exploded');
  watcher.stop();
});

test('the health poll does not pile up while a request is in flight', async () => {
  let resolve: (h: HealthSnapshot) => void = () => {};
  const health = vi.fn(() => new Promise<HealthSnapshot>(r => { resolve = r; }));
  const w = createHealthWatcher({ health, onSnapshot: () => {}, onCountdown: () => {}, intervalMs: 1000 });
  w.start();
  expect(health).toHaveBeenCalledTimes(1);      // start() polls immediately
  await vi.advanceTimersByTimeAsync(5000);      // five ticks, one request still open
  expect(health).toHaveBeenCalledTimes(1);
  resolve(snapshot());
  await vi.advanceTimersByTimeAsync(1000);
  expect(health).toHaveBeenCalledTimes(2);
  w.stop();
});

test('stop() ends the poll: nothing survives a teardown', async () => {
  const health = vi.fn(async () => snapshot());
  const w = createHealthWatcher({ health, onSnapshot: () => {}, onCountdown: () => {}, intervalMs: 1000 });
  w.start();
  await vi.advanceTimersByTimeAsync(3000);
  const seen = health.mock.calls.length;
  expect(seen).toBeGreaterThan(1);
  w.stop();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(health).toHaveBeenCalledTimes(seen);
});

test('start() twice does not double the poll rate', async () => {
  const health = vi.fn(async () => snapshot());
  const w = createHealthWatcher({ health, onSnapshot: () => {}, onCountdown: () => {}, intervalMs: 1000 });
  w.start();
  w.start();
  await vi.advanceTimersByTimeAsync(3000);
  expect(health).toHaveBeenCalledTimes(4);       // one at start, three ticks
  w.stop();
});

test('a rejected health call reports down and does not escape', async () => {
  const seen: (HealthSnapshot | null)[] = [];
  const w = createHealthWatcher({
    health: async () => { throw new TypeError('Failed to fetch'); },
    onSnapshot: h => seen.push(h), onCountdown: () => {}, intervalMs: 1000
  });
  await w.tick();
  expect(seen).toEqual([null]);
  w.stop();
});

test('the offline countdown runs 10 down to 1 and wraps', async () => {
  const counts: number[] = [];
  const w = createHealthWatcher({
    health: async () => snapshot({ engine: 'down' }),
    onSnapshot: () => {}, onCountdown: (down, secs) => { if (down) counts.push(secs); }, intervalMs: 1000
  });
  for (let i = 0; i < 11; i++) await w.tick();
  expect(counts.slice(0, 10)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 10]);
  w.stop();
});

// The closing test for C18 itself. Everything above proves the plumbing; this proves the page is
// not blank, which is the whole finding. It loads the REAL partial the way
// web/src/characters/gate.test.ts:9 does, so a future edit to gate.html that puts the message back
// inside the form fails here rather than in production.
test('a boot error paints a message that is actually visible on the gate screen', () => {
  document.body.innerHTML = readFileSync(resolve(process.cwd(), 'src/partials/gate.html'), 'utf-8');

  showBootError('homeCtl exploded');

  const el = document.getElementById('gate-boot-error');
  expect(el).not.toBeNull();
  expect(el!.textContent).toContain('homeCtl exploded');
  expect(el!.textContent!.length).toBeGreaterThan(0);
  // .hidden is `display: none !important` (web/src/styles/base.css:21), so an ancestor carrying it
  // is the same as painting nothing. This is the assertion that would have caught the version of
  // this fix that hid #gate-form with the message inside it.
  for (let n: HTMLElement | null = el; n !== null; n = n.parentElement) {
    expect(n.classList.contains('hidden')).toBe(false);
  }
  expect(document.getElementById('gate-form')!.classList.contains('hidden')).toBe(true);
  expect(document.getElementById('screen-gate')!.classList.contains('hidden')).toBe(false);
});

test('the wrong-password error and the boot error are different elements', () => {
  // #gate-error stays under the password input for wireGate's "Wrong password."; #gate-boot-error
  // is the one that survives the form being hidden. Conflating them is the defect.
  document.body.innerHTML = readFileSync(resolve(process.cwd(), 'src/partials/gate.html'), 'utf-8');
  const form = document.getElementById('gate-form')!;
  expect(form.contains(document.getElementById('gate-error'))).toBe(true);
  expect(form.contains(document.getElementById('gate-boot-error'))).toBe(false);
});
```

- [ ] **Step 2: Run them and watch them fail for the right reason**

Run: `cd web && npx vitest run src/boot.test.ts`
Expected: FAIL with `Failed to resolve import "./boot"`.

- [ ] **Step 3: Restructure `web/src/partials/gate.html` so the message can survive the form**

Ruling R6, and this comes before `boot.ts` because `showBootError` is written against it. At HEAD
`#gate-error` is a child of `#gate-form`, and `.hidden` is `display: none !important`
(`web/src/styles/base.css:21`), so `hide('gate-form')` would hide the message with the form and
paint an empty card: the same blank screen C18 is about. `.card-screen` is a centring flexbox
(`web/src/styles/layout.css:14`), so a second child of `#screen-gate` would sit **beside** the card
rather than in it. The fix is the wrapper shape `web/src/partials/home.html` already uses. Replace
the file with:

```html
<section id="screen-gate" class="card-screen hidden">
  <div class="card">
    <h1 class="card-title">idlescape</h1>
    <p class="card-sub">Private preview. Enter the gate password to continue.</p>
    <!-- Audit C18: the boot failure surface. A SIBLING of the form, never a child, so
         showBootError() can hide the form and still paint this. See web/src/boot.ts. -->
    <p id="gate-boot-error" class="field-error hidden" aria-live="polite"></p>
    <form id="gate-form" class="stack" autocomplete="off">
      <div class="field">
        <input id="gate-password" class="input" type="password" placeholder="Gate password" aria-label="Gate password" required>
        <p id="gate-error" class="field-error hidden" aria-live="polite"></p>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Enter</button>
    </form>
  </div>
</section>
```

`.stack` is `display: flex; flex-direction: column; gap: var(--sp-2)`
(`web/src/styles/layout.css:2`); the form needs it because it stops being the `.card` and would
otherwise collapse the field and the button together. `#gate-error` does not move and `wireGate`
does not change: a wrong-password message still belongs under the input. No test or spec references
this markup today (`git grep -ln "screen-gate\|gate-form\|gate-error" -- web/src web/e2e` returns
only `main.ts` and the partial itself), so nothing else has to move with it.

- [ ] **Step 4: Write `web/src/boot.ts`**

```ts
import { byId, hide, show } from './dom';
import type { HealthSnapshot } from './types';

// Audit C18. boot() used to await a bare fetch with no catch, so a TypeError from an offline
// browser, a DNS hiccup or a front server that had not finished starting rejected the promise,
// `void boot()` swallowed it, and nothing after that await ran. Every screen partial starts hidden
// and the show/hide wiring only fires inside state.onChange, so the page was genuinely blank with
// nothing in the console. Everything here takes its dependencies as arguments because
// web/src/main.ts calls byId() fourteen times at module scope and cannot be imported under jsdom.

export type GateState = 'open' | 'closed' | 'unknown';

const RETRY_MS = 300;
const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

/**
 * Is the password gate open? /api/health is always public, so a 401 on a /client/ asset is what
 * says the gate cookie is missing. client.js is always present in a 274 build; deps.js was a
 * 225-era companion the 274 engine no longer ships, so probing it logged a 404 on every load.
 *
 * `unknown` is the answer C18 exists for: a network failure is not evidence that a gate is on.
 * One retry, so a single blip does not skip the gate screen for a genuinely gated visitor.
 */
export async function probeGate(deps: { fetchImpl: typeof fetch; waitMs?: (ms: number) => Promise<void> }): Promise<GateState> {
  const wait = deps.waitMs ?? sleep;
  // Bound to a local FIRST, never called as `deps.fetchImpl(...)`. A property call passes `deps` as
  // the receiver, and WebIDL substitutes the global only for a null or undefined `this`, so the
  // browser throws "Illegal invocation" on the real global fetch while a vi.fn() fake in a test
  // does not. The catch below would swallow both attempts, probeGate would answer 'unknown' every
  // time, and a gated deployment would never paint its gate. web/src/bank/api.ts:66-67 is the same
  // shape for the same reason.
  const doFetch = deps.fetchImpl;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await doFetch('/client/client.js', { method: 'HEAD', credentials: 'same-origin' });
      return res.status === 401 ? 'closed' : 'open';
    } catch {
      if (attempt === 0) await wait(RETRY_MS);
    }
  }
  return 'unknown';
}

export interface HealthWatcherDeps {
  health: () => Promise<HealthSnapshot>;
  onSnapshot(h: HealthSnapshot | null): void;
  onCountdown(down: boolean, secs: number): void;
  intervalMs?: number;
}

export interface HealthWatcher {
  start(): void;
  stop(): void;
  /** One poll. Public so a test can drive it without timers, and so start() can poll at once. */
  tick(): Promise<void>;
}

const COUNTDOWN_FROM = 10;

export function createHealthWatcher(deps: HealthWatcherDeps): HealthWatcher {
  const intervalMs = deps.intervalMs ?? 1000;
  let timer: ReturnType<typeof setInterval> | null = null;
  // An in-flight guard, and not because /api/health is slow when the engine is down: it is not.
  // server/src/health.ts probes the engine on its own 10-second interval with a 3-second timeout
  // and server/src/index.ts returns the cached snapshot synchronously, so an engine outage answers
  // instantly. The pile-up case is a hung or overloaded FRONT server, where a 1-second interval
  // stacks requests until the browser's connection pool is the only thing throttling them.
  let inFlight = false;
  let secs = COUNTDOWN_FROM;

  async function tick(): Promise<void> {
    if (inFlight) return;
    inFlight = true;
    try {
      const h = await deps.health().catch(() => null);
      deps.onSnapshot(h);
      const down = h === null || h.engine === 'down';
      if (down) secs = secs <= 1 ? COUNTDOWN_FROM : secs - 1;
      deps.onCountdown(down, secs);
    } finally {
      inFlight = false;
    }
  }

  return {
    start() {
      if (timer) return;
      void tick();
      timer = setInterval(() => { void tick(); }, intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    tick
  };
}

export interface BootDeps {
  probe: () => Promise<GateState>;
  watcher: HealthWatcher;
  wireGate(): void;
  showGate(): void;
  enterApp(): void;
  onBootError(message: string): void;
}

export function createBoot(deps: BootDeps): { run(): Promise<void> } {
  return {
    async run() {
      try {
        deps.wireGate();
        deps.watcher.start();
        // 'unknown' enters the app: a network failure is not a closed gate, and a home screen whose
        // first call fails visibly beats a password form an ungated visitor cannot pass.
        if (await deps.probe() === 'closed') { deps.showGate(); return; }
        deps.enterApp();
      } catch (err) {
        // Nothing here may reject. A blank page with nothing in the console is the defect.
        deps.onBootError(err instanceof Error ? err.message : String(err));
      }
    }
  };
}

/**
 * The only visible failure surface a boot error has.
 *
 * Every screen partial starts hidden and #offline-card lives inside #screen-frame, so it cannot
 * paint before the frame does; the gate screen is the one always-present partial. The message goes
 * into #gate-boot-error, which web/src/partials/gate.html deliberately keeps as a SIBLING of
 * #gate-form: .hidden is `display: none !important`, so a message inside the hidden form would
 * paint nothing and reproduce the blank page this whole module exists to remove.
 *
 * This lives here rather than in main.ts only so it can be tested: main.ts calls byId() fourteen
 * times at module scope and cannot be imported under jsdom.
 */
export function showBootError(message: string): void {
  hide('gate-form');
  const el = byId('gate-boot-error');
  el.textContent = `Could not start: ${message}. Reload the page.`;
  el.classList.remove('hidden');
  show('screen-gate');
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `cd web && npx vitest run src/boot.test.ts`
Expected: PASS, 14 tests, including the two that load the real `gate.html`.

- [ ] **Step 6: Rewire `web/src/main.ts`**

Delete `watchHealth` (`:302-314`), `isGateOpen` (`:322-328`), `boot` (`:351-356`) and
`void boot();` (`:358`). Add the import and, at the end of the file where `boot()` used to live,
the composition. `setError` at `:316-320` stays exactly as it is: `wireGate` still uses it for
"Wrong password.", and the boot surface is `boot.ts`'s `showBootError` on a different element.

```ts
import { createBoot, createHealthWatcher, probeGate, showBootError } from './boot';

const offlineCard = byId('offline-card');
const offlineCount = byId('offline-count');
const healthWatcher = createHealthWatcher({
  health,
  onSnapshot: h => {
    if (h) gateEnabled = h.gateEnabled;
    const down = h === null || h.engine === 'down';
    homeCtl.setPlayers({ engine: down ? 'down' : 'up', players: h?.players ?? null });
  },
  onCountdown: (down, secs) => {
    offlineCard.classList.toggle('hidden', !down);
    if (down) offlineCount.textContent = String(secs);
  }
});

void createBoot({
  probe: () => probeGate({ fetchImpl: fetch }),
  watcher: healthWatcher,
  wireGate,
  showGate: () => { state.set('gate'); show('screen-gate'); },
  enterApp,
  onBootError: showBootError
}).run();
```

`state.set('gate')` stays inside `showGate` even though it is a no-op today
(`web/src/state.ts:8-12` returns early on an unchanged state and the initial state is already
`'gate'`): dropping it would let the state object disagree with the painted screen the moment
anything else moves the state first.

Hold the fps interval id at `:262-265`, and clear both timers on `pagehide` beside the existing
`settingsStore.flush()` that lives at `:160` today:

```ts
// The footer fps line reads whichever client is on screen. The id is held so a teardown stops it:
// audit C18 found both this and the health poll running forever with no handle on them.
const fpsTimer = setInterval(() => {
  const hooks = stage.sessions.active()?.hooks ?? null;
  byId('foot-right').textContent = hooks ? `fps ${hooks.getState().fps}${gateEnabled ? ' · gate on' : ''}` : '';
}, 1000);
```

and move the `pagehide` listener from `:160` down to the end of the file, beside the boot block,
so it can see all three:

```ts
window.addEventListener('pagehide', () => { clearInterval(fpsTimer); healthWatcher.stop(); void settingsStore.flush(); });
```

Note that `gate: fiddlesticks` became `gate on` in the fps block. That is C17's shipped-literal
half (ruling R10), and it lands here because it is the same line. Task 3 does not reopen it.

Declaration order matters: `healthWatcher` reads `homeCtl`, which is constructed at `:86`, so the
whole boot block goes at the end of the file.

- [ ] **Step 7: Verify**

```bash
cd web && npm run typecheck && npm run lint && npx vitest run
wc -l web/src/main.ts
```

Expected: clean, and **`main.ts` near 361, which is slightly LARGER than the 358 it was at HEAD**.
Do not read that as a failure. The arithmetic, counted off the blocks above: Task 1 already added
about seven (one import, a three-line comment, two calls, a blank), taking it to about 365. This
task removes `watchHealth` 13 lines, `isGateOpen` 7, `boot` 6, `void boot();` 1 and about four
separating blank lines, so about **31 out**; and adds the `./boot` import 1,
`offlineCard`/`offlineCount` 2, the `healthWatcher` block 12, the `createBoot(...).run()` block 8,
the fps comment 2 and two blank lines, so about **27 in**. Net for this task is about minus four,
and the file lands near **361**. Keeping `showBootError` in `boot.ts` rather than here is worth
about another twelve; without that move it would land near 373.

**This matters for Task 6, which starts enforcing 400.** 361 clears the ceiling comfortably, but
nothing downstream should budget on headroom that does not exist: entry 4 opens this file next and
has about 39 lines of room, not 90. If your `wc -l` comes back above 380, stop and say so rather
than trimming comments to hit a number.

Then confirm by grep that the defects are gone:

```bash
git grep -n "void boot()" -- web/src            # nothing
git grep -n "gate: fiddlesticks" -- web/src     # nothing
git grep -n "setInterval" -- web/src/main.ts    # only the held fpsTimer
git grep -n "gate-boot-error" -- web/src        # boot.ts, boot.test.ts, partials/gate.html
```

- [ ] **Step 8: Commit**

```bash
git add web/src/boot.ts web/src/boot.test.ts web/src/main.ts web/src/partials/gate.html
git -c core.safecrlf=false commit -m "fix(web): boot cannot reject into a blank page, and the health poll cannot pile up

Audit C18. isGateOpen() was a bare fetch with no catch, so an offline browser, a DNS hiccup or a
front server still starting rejected boot(), void boot() swallowed it, and nothing past that await
ran: every screen partial starts hidden, so the page was blank with nothing in the console. The
gate probe now answers open, closed or unknown, retries once, and enters the app on unknown,
because a network failure is not evidence a password gate is on.

The health poll gains an in-flight guard and a held interval id, and boot() cannot reject at all:
its failure surface is the gate screen with the form hidden and a message beside it. That message
needed markup: gate.html nested #gate-error INSIDE #gate-form, and .hidden is display:none
!important, so hiding the form to show the error would have painted an empty card, which is the
blank page again. gate.html now uses the same card-wrapper shape as home.html, with
#gate-boot-error a sibling of the form, and a jsdom test loads the real partial and asserts the
message has no hidden ancestor.

All of it moved into web/src/boot.ts behind injected dependencies, because main.ts calls byId()
fourteen times at module scope and cannot be imported under jsdom. probeGate binds fetchImpl to a
local before calling it: a property call passes deps as the receiver and the real global fetch
throws Illegal invocation, which the retry loop's own catch would have swallowed into a permanent
'unknown'.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

### Task 3: Environment templates and shipped literals tell the truth (C17)

C17's serious half, the two engine secrets across the production pipeline, **landed in `ca8ef86`
under D74** and is not re-done here. What remains is the templates in three directions, the
missing one, and the two production literals still compiled into the shipped bundle. The gate
password already left the bundle in Task 2 (ruling R10).

**Files:**
- Create: `web/src/frame/siteLabel.ts`
- Create: `web/src/frame/siteLabel.test.ts`
- Create: `engine-custom/.env.example`
- Modify: `server/src/env.ts:48-49`
- Modify: `server/src/env.test.ts:6-7` (the fixture; `:5` is `PORT`) and the end of the file (three new tests)
- Modify: `server/.env.example:15,21-24`
- Modify: `deploy/lightsail/provision.ps1:104-119` (the `# NOT-WRITTEN:` declaration)
- Delete: `server/.env.production.example`
- Modify: `deploy/windows/register-tasks.ps1:22-23` (**not** `:24`, which is the first line of a
  separate `world.json` bullet)
- Modify: `.dockerignore:24`
- Modify: `web/src/frame/stage.ts:230`
- Modify: `web/src/sessions/wire.ts:41`
- Modify: `web/src/frame/stage.test.ts:153,176,190` (three assertions on the removed literal)
- Modify: `engine-custom/src/idlescape/config.test.ts` (the template coverage test)
- Modify: `engine-custom/PATCHES.md` (the `.env.example` row)

**Interfaces:**
- Consumes: nothing from Tasks 1 or 2.
- Produces, from `web/src/frame/siteLabel.ts`:
  - `const WORLD = 1`
  - `siteLabel(gameName: string): string`, returning `` `${location.host} · world ${WORLD} · ${gameName}` ``

- [ ] **Step 1: Write the failing test for the site label**

Create `web/src/frame/siteLabel.test.ts`:

```ts
import { expect, test } from 'vitest';
import { siteLabel, WORLD } from './siteLabel';

test('the label names the host the shell is actually served from', () => {
  // jsdom serves about:blank at localhost by default; whatever it is, the label must quote it
  // rather than a compiled-in production hostname (audit C17).
  expect(siteLabel('Zezima')).toBe(`${location.host} · world ${WORLD} · Zezima`);
  expect(siteLabel('Zezima')).not.toContain('osrs.scotho.com');
});

test('there is one world and it is named once', () => {
  expect(WORLD).toBe(1);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx vitest run src/frame/siteLabel.test.ts`
Expected: FAIL with `Failed to resolve import "./siteLabel"`.

- [ ] **Step 3: Write `web/src/frame/siteLabel.ts` and use it at both call sites**

```ts
// Audit C17: `osrs.scotho.com · world 1 · <name>` was a literal compiled into the shipped bundle
// in two places, so a bundle served from anywhere else lied about where the player was. The host
// is read from the document rather than from an import.meta.env build variable: it is correct in
// every environment with nothing to configure and nothing to drift.
export const WORLD = 1;

export function siteLabel(gameName: string): string {
  return `${location.host} · world ${WORLD} · ${gameName}`;
}
```

`web/src/frame/stage.ts:230` becomes:

```ts
    deps.title.textContent = session.state === 'online' ? siteLabel(name) : '';
```

`web/src/sessions/wire.ts:41` becomes:

```ts
      deps.setTitle(siteLabel(ev.gameName));
```

Both files gain `import { siteLabel } from '../frame/siteLabel';` (adjust the relative path:
`stage.ts` is in `web/src/frame/`, so its import is `'./siteLabel'`).

**The audit named only `stage.ts` and cited it at `:229`.** There are two call sites and it is
`:230`. Grep before and after:

```bash
git grep -n "osrs.scotho.com · world" -- web/src
```

Expected before: **five** hits, not two. Two are the call sites above; the other three are
assertions in `web/src/frame/stage.test.ts` at `:153`, `:176` and `:190`. Expected after: none.

- [ ] **Step 4: Repoint the three assertions the change breaks, then run the web suite**

`web/src/frame/stage.test.ts` asserts the literal three times:

```ts
    expect(title.textContent).toBe('osrs.scotho.com · world 1 · name_a');   // :153 and :176
    expect(title.textContent).toBe('osrs.scotho.com · world 1 · name_b');   // :190
```

Each becomes the function, with `import { siteLabel } from './siteLabel';` at the top of the file:

```ts
    expect(title.textContent).toBe(siteLabel('name_a'));
    expect(title.textContent).toBe(siteLabel('name_b'));
```

**Do not hardcode `localhost` in the expectation**: the jsdom host is configuration, not a contract,
and an assertion that pins it would fail the day `web/vitest.config.ts` changes environments.
`web/src/sessions/wire.test.ts` carries no such literal (grep it to confirm rather than assuming);
`stage.test.ts` is the only test file this step touches.

Run: `cd web && npm run typecheck && npx vitest run src/frame src/sessions`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for the server environment**

Change `server/src/env.test.ts:6-7` so the base fixture stops pinning the retired port:

```ts
  ENGINE_HTTP: 'http://127.0.0.1:8899',
  ENGINE_WS: 'ws://127.0.0.1:8899',
```

and `:26`'s assertion with it. Then append two tests:

```ts
  test('the engine defaults are the dev engine, never the retired 8888 instance', () => {
    // 8888 is the live 225-era proof of concept. server/.env.example has warned against pointing a
    // dev front server at it since SP1b; the default pointed straight at it (audit C17).
    const { ENGINE_HTTP: _http, ENGINE_WS: _ws, ...noEngine } = base;
    const env = loadEnv(noEngine);
    expect(env.engineHttp).toBe('http://127.0.0.1:8899');
    expect(env.engineWs).toBe('ws://127.0.0.1:8899');
  });

  test('.env.example documents exactly the keys loadEnv reads', () => {
    // path.join(import.meta.dir, ...), NOT new URL('.', import.meta.url).pathname. On Windows that
    // pathname is `/C:/projects/osrs_test/server/src/`, and both Bun and Node resolve the leading
    // slash into a `C:\C:\...` that does not exist, so the read throws ENOENT on the only platform
    // this project runs on. server/src/wiki/db.test.ts:46 is the in-repo precedent for this shape.
    const template = readFileSync(path.join(import.meta.dir, '..', '.env.example'), 'utf8');
    const source = readFileSync(path.join(import.meta.dir, 'env.ts'), 'utf8');

    const documented = keysOf(template);
    // Both shapes loadEnv uses: `str(source, 'KEY', ...)` / bool / int, and a direct `source.KEY`.
    const read = new Set<string>();
    for (const m of source.matchAll(/(?:str|bool|int)\(source, '([A-Z][A-Z0-9_]*)'/g)) read.add(m[1]!);
    for (const m of source.matchAll(/source\.([A-Z][A-Z0-9_]*)/g)) read.add(m[1]!);

    expect(read.size).toBeGreaterThan(10);   // the extraction still matches the source's shape
    expect([...read].filter(k => !documented.has(k)).sort()).toEqual([]);
    expect([...documented].filter(k => !read.has(k)).sort()).toEqual([]);
  });

  test('provision.ps1 writes or declares every key .env.example documents', () => {
    // The third direction of C17's template finding, which the map named and nothing else closed.
    // deploy/lightsail/provision.ps1 builds the box's secrets/server.env from a hand-kept nine-key
    // list while loadEnv reads seventeen, so a newly required key can be added to the template and
    // silently omitted from every box. The eight it leaves out are deliberate (docker-compose.yml
    // sets them, or env.ts's default is already right inside the container), so the generator
    // DECLARES them in a `# NOT-WRITTEN:` comment and this asserts written + declared == documented.
    const provision = readFileSync(path.join(import.meta.dir, '..', '..', 'deploy', 'lightsail', 'provision.ps1'), 'utf8');

    const written = new Set<string>();
    for (const m of provision.matchAll(/["']([A-Z][A-Z0-9_]*)=/g)) written.add(m[1]!);
    const declared = new Set<string>(
      (/^#\s*NOT-WRITTEN:(.*)$/m.exec(provision)?.[1] ?? '').trim().split(/\s+/).filter(Boolean)
    );

    expect(written.size).toBeGreaterThan(5);      // the $serverEnv array is still recognisable
    expect(declared.size).toBeGreaterThan(0);     // the declaration line is still there
    const covered = new Set([...written, ...declared]);
    const documented = keysOf(readFileSync(path.join(import.meta.dir, '..', '.env.example'), 'utf8'));
    expect([...documented].filter(k => !covered.has(k)).sort()).toEqual([]);
    expect([...covered].filter(k => !documented.has(k)).sort()).toEqual([]);
  });
```

Both tests share one helper, which goes above them in the same file:

```ts
const keysOf = (text: string): Set<string> => new Set(
  text.split(/\r?\n/)
    .map(l => /^([A-Z][A-Z0-9_]*)=/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => m[1]!)
);
```

and the file gains `import { readFileSync } from 'node:fs';` and `import path from 'node:path';`.

The `read.size`, `written.size` and `declared.size` assertions are the mutation guards: if someone
renames `str`, `bool` or `int`, or restructures the `$serverEnv` array, or deletes the
`# NOT-WRITTEN:` line, the regexes stop matching and without these the tests would pass vacuously
against empty sets.

**Measured at HEAD**, so you know what green looks like before you run it: `server/.env.example`
documents 17 keys; `env.ts` reads the same 17 (14 through `str`/`bool`/`int`, plus `GATE_SECRET`,
`ENGINE_MANAGEMENT_SECRET` and `OWNER_ASSERTION_SECRET` read directly off `source`);
`provision.ps1:111-119` writes 9 of them and nothing else in that file matches the `KEY=` shape. So
the eight names for the `# NOT-WRITTEN:` line are exactly `CLIENT_OUT`, `ENGINE_HTTP`,
`ENGINE_MANAGEMENT_HTTP`, `ENGINE_PUBLIC`, `ENGINE_WS`, `GOOGLE_APPLICATION_CREDENTIALS`,
`WEB_DIST` and `WIKI_DB`. The second test is **red until Step 8b adds that line**.

- [ ] **Step 6: Run them and watch them fail**

Run: `cd server && bun test src/env.test.ts`
Expected: FAIL. The engine-default test says
`expected "http://127.0.0.1:8899", got "http://127.0.0.1:8888"`. The `provision.ps1` test fails on
`declared.size` being 0, because Step 8b has not written the `# NOT-WRITTEN:` line yet. The
`.env.example` set-equality test reports drift only if the key NAMES differ; at HEAD both sets are
the same 17, so **it passes on the first run and that is fine**: it is a ratchet, and Step 8's
edits to the template must keep it passing.

- [ ] **Step 7: Change the defaults in `server/src/env.ts:48-49`**

```ts
    // 8899 is the 274 dev engine (`npx tsx src/app.ts` in engine/server). 8888 is the retired 225
    // proof of concept that still runs on this machine, and pointing a dev front server at it
    // gives a shell talking a protocol the client no longer speaks (audit C17). The deployed stack
    // overrides both from docker-compose.yml regardless.
    engineHttp: str(source, 'ENGINE_HTTP', 'http://127.0.0.1:8899'),
    engineWs: str(source, 'ENGINE_WS', 'ws://127.0.0.1:8899'),
```

- [ ] **Step 8: Correct `server/.env.example`**

`:15` keeps the value and gains the reason, so nobody promotes it:

```
# Local development only. The deployed password is generated by deploy/lightsail/provision.ps1
# into the box's secrets/server.env and never appears in this repository.
GATE_PASSWORD=fiddlesticks
```

`:21-24` become working dev values, matching what `server/src/env.ts` already defaults to for a
local stack:

```
# The emulator project id, which must match firebase/.firebaserc's `default`.
FIREBASE_PROJECT_ID=idlescape-osrs
# Only read when FIREBASE_EMULATORS=false. A local emulator stack needs no such file, so a fresh
# clone can leave this pointing at a path that does not exist.
GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json
# Local development runs against the Firebase emulators. The deployed stack sets false in
# deploy/docker/docker-compose.yml regardless of what this file says.
FIREBASE_EMULATORS=true
# The origin THIS front server answers on. The deployed stack overrides it with the public one.
PUBLIC_ORIGIN=http://localhost:8787
```

- [ ] **Step 8b: Declare what `provision.ps1` deliberately does not write**

The generator at `deploy/lightsail/provision.ps1:110-119` writes nine of `.env.example`'s seventeen
keys. The other eight are not missing, they are supplied elsewhere, and Step 5's second test needs
that stated rather than remembered. Insert immediately above the `$serverEnv = @(` line:

```powershell
# The keys server/.env.example documents that this file deliberately does NOT write, because
# deploy/docker/docker-compose.yml sets them on the container or server/src/env.ts's default is
# already correct inside it. server/src/env.test.ts asserts that this line plus the array below
# covers server/.env.example exactly, so a newly required key cannot be added to the template and
# silently omitted from every box (audit C17).
# NOT-WRITTEN: CLIENT_OUT ENGINE_HTTP ENGINE_MANAGEMENT_HTTP ENGINE_PUBLIC ENGINE_WS GOOGLE_APPLICATION_CREDENTIALS WEB_DIST WIKI_DB
```

The name list is one line on purpose: the test's regex is `^#\s*NOT-WRITTEN:(.*)$`, so a wrapped
continuation would be silently dropped and the test would then fail loudly on the dropped name,
which is the right direction to fail in but a confusing message. Keep it on one line.

Re-run `cd server && bun test src/env.test.ts`. Expected: PASS, all three.

- [ ] **Step 9: Delete `server/.env.production.example` and repoint its one citation**

```bash
git rm server/.env.production.example
```

`deploy/windows/register-tasks.ps1:22-23` currently reads "server/.env must exist with production
values (copy server/.env.production.example, ...)". **Replace those two lines and no more.** `:24`
is `#   - engine/server/data/config/world.json's \`web.allowedOrigin\` must already be`, the first
half of a separate two-line bullet, and taking it would orphan its continuation at `:25`:

```
#   - server/.env must exist with production values. There is no template for these in the repo on
#     purpose (audit C17): deploy/lightsail/provision.ps1 GENERATES the box's secrets/server.env,
#     including both 48-character engine secrets, and deploy/docker/.env.example documents the
#     compose side. Anything hand-copied drifts from the generator within one release.
```

Remove `.dockerignore:24` (`server/.env.production.example`) and mention the removal in the
surrounding comment block at `:21-26`, which currently explains why the three entries are excluded.

- [ ] **Step 10: Write `engine-custom/.env.example`**

The overlay reads seven variables and ships no template, against the "`.env.example` per process"
constraint. Every one is read in `engine-custom/src/idlescape/config.ts:76-115`, plus
`install.ts:77` reads `IDLESCAPE_BANK_DIR` a second time directly off `process.env`.

```
# engine-custom/.env.example -- the environment the idlescape engine overlay reads.
#
# The overlay lives inside the pinned Lost City engine (engine/server), so these are read from that
# process's environment, not from a file this directory loads. Locally, scripts/start-stack.ps1
# exports them into the engine process from server/.env; in the deployment,
# deploy/docker/docker-compose.yml sets the topological ones and env_files SERVER_ENV_FILE for the
# two secrets, so each secret is ONE value shared by the engine and the front server (decision D74).
# Every name here is read in src/idlescape/config.ts.

# Shared with the front server (server/.env, same key name). 32 characters minimum; the front
# server refuses to start below that. Empty disables owner binding, which is only valid against a
# dev world with node.production=false. A PRODUCTION world refuses to start with this empty:
# config.ts throws, because requireOwner is forced on and an empty secret refuses every login one
# at a time at login response 13, which is a failure a deployment cannot see.
OWNER_ASSERTION_SECRET=

# Shared with the front server (server/.env, same key name). 32 characters minimum. Empty means
# registerOwnerBankRoutes registers nothing at all, so the owner bank and the management health
# route do not exist rather than being unauthenticated.
ENGINE_MANAGEMENT_SECRET=

# Force owner assertion on in a DEV world. Ignored in production, where it is forced true.
# Documented nowhere else in the repository before this file.
OWNER_REQUIRE_ASSERTION=false

# Grants a staff level (0 to 4) in a DEV world only; ignored in production.
IDLESCAPE_DEV_STAFF=0

# Where owner bank files live. The default resolves INSIDE the container image, so the deployed
# stack sets /opt/engine/data/banks onto a volume: without it a container replace discards every
# owner bank (decision D74).
IDLESCAPE_BANK_DIR=data/banks

# The front server's bank-changed hook. Empty means the engine tells nobody when a bank moves.
IDLESCAPE_HOOK_URL=

# The interface the management Fastify binds. 127.0.0.1 by default, which is what keeps the
# management port unreachable from anywhere else. The deployed stack sets 0.0.0.0 because the front
# server is in another container, and compose puts the engine on a two-member network to compensate.
IDLESCAPE_MANAGEMENT_HOST=127.0.0.1
```

- [ ] **Step 11: Make the template provable, in the overlay's own test**

`engine-custom/src/idlescape/config.test.ts` is copied into `engine/server/src/idlescape/` by the
overlay and run by `verify.ps1` step 1, so from its runtime location the repository root is four
directories up. Append:

```ts
test('.env.example documents every variable the config reads', () => {
    const root = path.resolve(import.meta.dirname, '..', '..', '..', '..');
    const template = fs.readFileSync(path.join(root, 'engine-custom', '.env.example'), 'utf8');
    const source = fs.readFileSync(path.join(root, 'engine-custom', 'src', 'idlescape', 'config.ts'), 'utf8');

    const documented = new Set(
        template.split(/\r?\n/)
            .map(l => /^([A-Z][A-Z0-9_]*)=/.exec(l))
            .filter(m => m !== null)
            .map(m => m![1])
    );
    const read = new Set<string>();
    for (const m of source.matchAll(/env\.([A-Z][A-Z0-9_]*)/g)) {
        read.add(m[1]!);
    }

    assert.ok(read.size >= 7, `expected at least 7 env reads in config.ts, found ${read.size}`);
    assert.deepEqual([...read].filter(k => !documented.has(k)).sort(), []);
});
```

Use whatever `assert` and `test` imports `config.test.ts` already has (it runs under
`node:test` through `tsx`), and add `node:fs` and `node:path` imports if it lacks them. The
assertion is one-directional on purpose: the template may document `IDLESCAPE_BANK_DIR`, which
`install.ts` also reads directly, without `config.ts` naming it twice.

Record it in `engine-custom/PATCHES.md`. **The file has no patch table to add a row to.** Its only
table is the management route table at `:758-761`; patches are prose, either a `### \`path\` - title`
section (for example `:90`) or a sentence in the `## New files (no upstream counterpart)` block at
`:11-22`, and every claim is backed by a `grep -c` line in the ```sh block under `## How to verify
all patches are present` at `:803-845`, which ends "(Each task appends its own grep lines here.)".
So append a sentence to the new-files block:

```
`.env.example` documents the seven variables `src/idlescape/config.ts` reads. Audit C17: the
overlay was the one process in the repository shipping no template. It is deliberately NOT in
`manifest.json`: the manifest lists files copied onto the engine clone, and this is documentation
that stays in this directory. Proved by `src/idlescape/config.test.ts`'s ".env.example documents
every variable the config reads".
```

and one line to the verification block, in the same column style as the two `src/web.ts` lines
already at `:835-836`. Note that block runs from `engine/server`, so the path is relative to the
applied overlay, and `.env.example` is not applied; grep the test that proves it instead:

```sh
grep -c "documents every variable the config reads" src/idlescape/config.test.ts   # 1
```

- [ ] **Step 12: Verify**

```bash
cd server && bun run typecheck && bun test src/env.test.ts
cd ../web && npm run typecheck && npm run lint && npx vitest run
cd .. && powershell -File scripts/engine-overlay.ps1 && powershell -File scripts/engine-overlay.ps1 -Check
cd engine/server && npx tsx --test --test-force-exit src/idlescape/config.test.ts
```

Expected: all green. Then the grep sweep, from the repository root:

```bash
git grep -n "8888" -- server/src server/.env.example      # only the warning comment in .env.example
git grep -n "env.production.example"                       # nothing
git grep -n "osrs.scotho.com" -- web/src                   # nothing
```

- [ ] **Step 13: Commit**

```bash
git add web/src/frame/siteLabel.ts web/src/frame/siteLabel.test.ts \
        web/src/frame/stage.ts web/src/frame/stage.test.ts web/src/sessions/wire.ts \
        server/src/env.ts server/src/env.test.ts server/.env.example \
        engine-custom/.env.example engine-custom/src/idlescape/config.test.ts engine-custom/PATCHES.md \
        deploy/lightsail/provision.ps1 deploy/windows/register-tasks.ps1 .dockerignore
git rm --cached server/.env.production.example 2>/dev/null || true
git -c core.safecrlf=false commit -m "fix(env): make the templates and the shipped bundle tell the truth

Audit C17, minus the escalation, which landed in ca8ef86 under D74 (provision.ps1 generates both
engine secrets at 48 characters into the box's server.env and compose env_files them into the
engine). What is left:

- ENGINE_HTTP/ENGINE_WS defaulted to 127.0.0.1:8888, the retired 225 proof of concept that
  server/.env.example explicitly warns against. They now default to the dev engine on 8899.
- server/.env.example shipped production values as its dev defaults. It now describes a working
  local stack, and a test keeps its key set equal to what loadEnv reads, in both directions. A
  second test covers the third direction the audit did not name: provision.ps1 generates the box's
  server.env from a hand-kept nine-key list, so it now DECLARES the eight keys it deliberately
  leaves to compose and to env.ts's defaults, and written + declared must equal the template.
- server/.env.production.example was three releases stale and had one citation. Deleted: the box's
  values are generated by provision.ps1, not copied from a template that drifts.
- engine-custom shipped no .env.example at all, against the per-process constraint. It has one now,
  covering all seven variables, proved by the overlay's own config test.
- osrs.scotho.com and world 1 were compiled into the bundle in two places, not the one the audit
  named. Both read location.host through web/src/frame/siteLabel.ts.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

### Task 4: The wiki enters the gates (C09, first half)

`grep -rn wiki scripts/` returns zero hits at HEAD. `wiki/` has 30 test files, 107 tests that run
in 9 seconds and pass, and a `tsc --noEmit` that exits 0, and nothing runs any of it. This task
adds the build to `scripts/build.ps1`, the suites to `scripts/verify.ps1`, the drift gate ruling
R15 chose, and the install to `scripts/setup.ps1` so a fresh clone does not fail with
`Cannot find package 'marked'`.

**Files:**
- Modify: `scripts/build.ps1:70,81-90`
- Modify: `scripts/verify.ps1` (the `Write-Step` helper, ruling R14, and the new step)
- Modify: `scripts/setup.ps1:131-133`
- Modify: `wiki/gen/extract.ts` (the `--check-full` mode)
- Modify: `wiki/AUTHORING.md` (the `content-custom` boundary the audit asks for)
- Modify: `docs/VERIFICATION.md`, `docs/ARCHITECTURE.md:68,223,236,304`, `README.md:35`,
  `docs/README.md:37`, `.claude/skills/idlescape-verify/SKILL.md:18,48,96`

**Interfaces:**
- Consumes: nothing from Tasks 1 to 3.
- Produces, for Tasks 6, 7 and 10: `verify.ps1` has a `Write-Step` function and a `$TotalSteps`
  constant at the top; adding a step is one constant edit plus one `Write-Step` call.
- Produces, for Task 5: `wiki/build/wiki.db` exists on a machine that has run `build.ps1`, which is
  what makes the Playwright wiki spec reproducible.

- [ ] **Step 1: Add `--check-full` to `wiki/gen/extract.ts`**

`runExtract` already takes an `outRoot` parameter, so a check can extract to a temporary directory
and compare. Two traps ruling R15 names: `manifest.json` carries a `generatedAt` ISO timestamp
(`extract.ts:66`), so it must be compared with that field removed, and the tracked JSON comes back
CRLF under `core.autocrlf=true` while `extract.ts:70` writes LF, so every comparison normalises
line endings the way `scripts/gen/lib/io.ts:55-68` does.

Replace the `import.meta.main` block at `:88-91`:

```ts
const CHECKED_FILES = ['items.json', 'npcs.json', 'locs.json', 'areas.json', 'spawns.json',
  'shops.json', 'skills.json', 'methods.json', 'drops.json', 'quests.json', 'gaps.md'] as const;

const lf = (s: string): string => s.replace(/\r\n/g, '\n');

/** manifest.json minus generatedAt, which changes on every run and cannot be compared. */
function stableManifest(text: string): string {
  const m = JSON.parse(text) as Record<string, unknown>;
  delete m.generatedAt;
  return JSON.stringify(m, null, 1);
}

/** Extracts to a temporary directory and reports every tracked file that differs. */
export function checkFull(rev = REVISION): string[] {
  const tmp = mkdtempSync(path.join(tmpdir(), 'wiki-check-'));
  try {
    runExtract(CONTENT, tmp, rev);
    const drift: string[] = [];
    for (const name of CHECKED_FILES) {
      const a = lf(readFileSync(path.join(DATA, String(rev), name), 'utf8'));
      const b = lf(readFileSync(path.join(tmp, String(rev), name), 'utf8'));
      if (a !== b) drift.push(name);
    }
    const ma = stableManifest(readFileSync(path.join(DATA, String(rev), 'manifest.json'), 'utf8'));
    const mb = stableManifest(readFileSync(path.join(tmp, String(rev), 'manifest.json'), 'utf8'));
    if (ma !== mb) drift.push('manifest.json');
    return drift;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  if (process.argv.includes('--check-full')) {
    // Not cheap: a full re-extract parses every .jm2 map and produces over 800,000 loc placements.
    // loc-spawns.json is skipped because it is gitignored and is the reason this is slow.
    const drift = checkFull();
    if (drift.length > 0) {
      console.error(`[wiki] data drift in ${drift.join(', ')}; run: bun run --cwd wiki extract`);
      process.exit(1);
    }
    console.log('[wiki] tracked data matches a fresh extract');
  } else {
    const m = runExtract();
    console.log(`[wiki] extracted rev ${m.revision} @ ${m.contentSha.slice(0, 8)}:`, m.counts);
  }
}
```

Add `mkdtempSync`, `rmSync` to the `node:fs` import and `tmpdir` from `node:os`.

- [ ] **Step 2: Test the new mode against a deliberate drift**

Add to `wiki/gen/extract.test.ts` (or create it if it does not exist; check first with
`ls wiki/gen/*.test.ts`):

```ts
import { expect, test } from 'bun:test';
import { checkFull } from './extract';

// Slow (a full extract): this is the one test that proves the tier 3 drift gate can fail. It is
// tagged so `bun test` in verify.ps1 can skip it; run it by hand when the data changes.
test.skipIf(process.env.WIKI_CHECK_FULL !== '1')('a clean tree reports no drift', () => {
  expect(checkFull()).toEqual([]);
});
```

Then prove it can fail, by hand, once, and do not commit the mutation:

```bash
cd wiki && node -e "const f='data/274/shops.json';const s=require('fs');const t=s.readFileSync(f,'utf8');s.writeFileSync(f,t.replace('[','[ '))"
bun gen/extract.ts --check-full     # expect exit 1 naming shops.json
git checkout -- data/274/shops.json
bun gen/extract.ts --check-full     # expect exit 0
```

- [ ] **Step 3: Add the cheap drift assertion and the wiki build to `scripts/build.ps1`**

Insert between `:70` (the closing brace of the `scripts/gen` check) and `:71` (the client build):

```powershell
# --- 1c. Wiki corpus: the pin, then the reader database ----------------------
# wiki/data/274/*.json is committed output of wiki/gen/extract.ts. This is the cheap half of the
# drift gate (plan ruling R15): it asserts the data was extracted from the CONTENT SHA this
# revision is pinned to, which is the failure the audit names, a content bump nobody re-extracted.
# It does NOT catch a hand-edited items.json; `bun wiki/gen/extract.ts --check-full` does, costs a
# full re-extract, and is a tier 3 command in docs/VERIFICATION.md rather than a build step.
Write-Host "`n== Checking the wiki corpus pin and building the reader database"
$manifest = Get-Content (Join-Path $root 'wiki\data\274\manifest.json') -Raw | ConvertFrom-Json
$lockLine = Select-String -LiteralPath (Join-Path $root 'scripts\upstream.lock') -Pattern '^engine/content ' | Select-Object -First 1
$pinned = ($lockLine.Line -split ' ')[1]
if ($manifest.contentSha -ne $pinned) {
    throw "wiki/data/274 was extracted from content $($manifest.contentSha) but scripts/upstream.lock pins $pinned (run: bun run --cwd wiki extract). This check does not see a hand-edited data file; for that run: bun wiki/gen/extract.ts --check-full"
}
Push-Location $root
try {
    & $bun 'run' '--cwd' 'wiki' 'build'
    if ($LASTEXITCODE -ne 0) { throw 'wiki build failed (see wiki/build/report.md for lint errors)' }
} finally {
    Pop-Location
}
```

**PowerShell 5.1 note:** `$manifest.contentSha -ne $pinned` is fine; do not reach for `??` or a
ternary anywhere in this block.

- [ ] **Step 4: Extend the step 3 artifact assertion to the wiki**

`build.ps1:81-90` checks three client artifacts exist. Existence alone is a check that cannot fail
interestingly for the database: `wiki/gen/build.ts:40-44` already returns 1 on lint errors, so what
a truncated or killed build produces is a small or empty file. Also note `build.ts` writes
`report.md` **before** it decides whether to build the database, so a red report and a stale
database can coexist; assert both.

Append after the client `$missing` check:

```powershell
# The wiki database the front server serves /wiki from. A size floor rather than an existence
# check: a killed or truncated build leaves a file that exists and answers nothing. 32 MiB is a
# quarter of what a full 274 corpus produces, so it fails on a broken build and never on a real one.
$wikiDb = Join-Path $root 'wiki\build\wiki.db'
if (-not (Test-Path $wikiDb)) { throw 'wiki build produced no wiki/build/wiki.db' }
$wikiMiB = [math]::Round((Get-Item $wikiDb).Length / 1MB, 1)
if ((Get-Item $wikiDb).Length -lt 32MB) { throw "wiki/build/wiki.db is only $wikiMiB MiB; a complete 274 corpus is over 100 MiB, so this build was truncated" }
# Belt and braces over the exit code above. build.ts writes report.md BEFORE it decides whether to
# write the database (wiki/gen/build.ts:38 vs :46), so a red report and a stale database can
# coexist on disk; runBuild returns 1 first, so this only fires if someone bypasses that. The
# pattern matches the PROBLEM lines build.ts:23 emits, `- <level> <rule> <page>: <message>` with a
# lowercase level, and deliberately not the summary lines at :22, which are `- <level>:<rule>: N`
# and would double-count. Select-String is case-insensitive by default, so a capitalised level
# still matches.
$report = Join-Path $root 'wiki\build\report.md'
if (-not (Test-Path $report)) { throw 'wiki build produced no wiki/build/report.md' }
$lintErrors = Select-String -LiteralPath $report -Pattern '^- error ' -AllMatches
if ($lintErrors) { throw "wiki/build/report.md records $($lintErrors.Count) lint error line(s); see the file" }
```

Read `wiki/gen/build.ts:18-25` before shipping this and match whatever `report()` actually emits;
the shape above was read at HEAD. If it has changed, use the real one and say so in the comment
rather than leaving a pattern that cannot match.

Also extend the closing summary at `:92-94` with a `wiki/build : wiki.db (N MiB)` line.

- [ ] **Step 5: Give `verify.ps1` a step helper, then add the wiki step**

Ruling R14. At the top of `scripts/verify.ps1`, after `$bun = Get-Bun` at `:30`:

```powershell
# Step labels come from one place so adding a step is one constant edit rather than eleven string
# edits. Before this the file carried eleven hardcoded [n/7] strings, and eight claims across five
# documents quoted the count (see the plan's ruling R14); this entry moves it three times.
$TotalSteps = 8
$script:StepNo = 0
function Write-Step {
    param([string]$Name)
    $script:StepNo = $script:StepNo + 1
    Write-Host "`n== [$script:StepNo/$TotalSteps] $Name"
}
function Write-SubStep {
    param([string]$Name)
    Write-Host "`n== [$script:StepNo/$TotalSteps] $Name"
}
```

Replace all eleven `Write-Host "`n== [n/7] ..."` lines (`:77, :88, :115, :141, :149, :157, :167,
:185, :194, :202, :206`) with `Write-Step '...'`, except the four that are continuations of a step
already announced (`:88`, `:115`, `:141` and `:167` all print the same number as the line above
them); those become `Write-SubStep '...'` so they do not advance the counter. Read each line before
converting it; the "(cont.)" ones are the continuations.

Then add the wiki step immediately after the firebase rules step at `:193-199`, so it lands before
`build.ps1`:

```powershell
# --- Wiki package (typecheck + its own suites) -------------------------------
# 30 test files, 107 tests, about 9 seconds, fixtures only: no emulator, no stack, no engine
# content. Audit C09: this package sat outside every gate while server/src/wiki served from it.
Write-Step 'wiki typecheck + tests'
Push-Location (Join-Path $root 'wiki')
try {
    & $bun run typecheck
    Invoke-Native 'wiki typecheck'
    & $bun test
    Invoke-Native 'wiki tests'
} finally { Pop-Location }
```

- [ ] **Step 6: Teach `scripts/setup.ps1` about `wiki/`**

`setup.ps1` installs `engine/server` (`:51`) and `client/` (`:131-133`) and nothing else, so the
new verify step would fail on a fresh clone with `Cannot find package 'marked'` and read as a
broken gate. Add beside the client install:

```powershell
Push-Location (Join-Path $root 'wiki')
& $bun install
Pop-Location
```

- [ ] **Step 7: Record the `content-custom` boundary the audit asks for**

`wiki/gen/paths.ts:5` sources only `engine/content`; `content-custom/` is never read. That is
accurate today only because the overlay carries nothing the extractor would have parsed. Add a loud
failure so it cannot become wrong silently.

**Guard on content, never on a directory's existence.** `content-custom/` at HEAD is
`README.md`, `manifest.json` and thirteen directories that all exist and are all empty except two:
`pack/varp.pack` and `scripts/interface_bank/configs/banktab.varp`. There is no `src/`, so a guard
on `content-custom/src` could never fire and would be a permanent no-op; and a guard on the
existence of `scripts/`, `maps/` or `pack/` throws on the first run, at HEAD, and breaks every
extract. The measurable thing is the file extensions `wiki/gen/load.ts:22-29` walks: under
`scripts/` it reads `.obj`, `.npc`, `.loc`, `.inv`, `.varp`, `.param`, `.dbtable`, `.dbrow`, `.rs2`
and `.constant`, and under `maps/` it reads `.jm2`.

In `wiki/gen/extract.ts`, at the top of `runExtract`, after `assertContentPinned`:

```ts
  // The corpus is extracted from the PINNED upstream content only; content-custom/ is never read
  // (wiki/gen/paths.ts sources engine/content alone). That is correct only while the overlay
  // carries nothing this extractor would have parsed, so fail loudly the day it grows one rather
  // than quietly shipping a wiki that describes a world nobody plays. See wiki/AUTHORING.md.
  //
  // The extensions are the ones wiki/gen/load.ts walks. Measured at HEAD, content-custom holds
  // exactly two real files: pack/varp.pack, a packed id table this extractor never reads, and
  // scripts/interface_bank/configs/banktab.varp, the bank-tab size varp SP8 added. The .varp is
  // the one accepted exception: it is an interface config no wiki page describes.
  const OVERLAY_PARSED = /\.(obj|npc|loc|inv|varp|param|dbtable|dbrow|rs2|constant|jm2)$/;
  const OVERLAY_ACCEPTED = new Set(['scripts/interface_bank/configs/banktab.varp']);
  const overlayRoot = path.join(ROOT, 'content-custom');
  const overlapping = (readdirSync(overlayRoot, { recursive: true }) as string[])
    .map(rel => rel.replace(/\/g, '/'))
    .filter(rel => OVERLAY_PARSED.test(rel) && !OVERLAY_ACCEPTED.has(rel));
  if (overlapping.length > 0) {
    throw new Error(`content-custom/ now carries ${overlapping.length} file(s) this extractor parses (${overlapping.slice(0, 5).join(', ')}), but wiki/gen/paths.ts reads engine/content only, so the corpus would describe a world nobody plays. Teach paths.ts about the overlay, or add the file to OVERLAY_ACCEPTED above with the reason it is not wiki-visible.`);
  }
```

Two imports have to change and both are easy to miss: `wiki/gen/extract.ts:1` imports
`existsSync, mkdirSync, writeFileSync, readFileSync` from `node:fs` and needs `readdirSync` added;
`:3` imports `{ CONTENT, DATA, contentHeadSha, upstreamShas }` from `./paths` and needs `ROOT`,
which `wiki/gen/paths.ts:4` already exports.

**Then prove it can fire, which the previous shape could not.** The guard runs before
`loadContent`, so this costs milliseconds rather than a full extract:

```bash
mkdir -p content-custom/scripts/probe && touch content-custom/scripts/probe/fake.obj
cd wiki && bun -e "const m = await import('./gen/extract.ts'); m.runExtract();"   # expect the throw naming fake.obj
cd .. && rm -rf content-custom/scripts/probe
cd wiki && bun -e "const m = await import('./gen/extract.ts'); m.runExtract();"   # no longer throws here
```

The second run proceeds into a real extract, so interrupt it once the guard has passed; the point
is only that the throw is gone. Commit none of the probe files. Add the matching paragraph to
`wiki/AUTHORING.md`, naming the accepted `.varp` so the next person does not delete it as noise.

- [ ] **Step 8: Correct every document this task falsifies**

Each of these carries a claim that stops being true. Correct them in this commit, not in a sweep.
**Every step-count claim goes to eight here and will be edited twice more, by Tasks 6 and 7**; R14
carries the full inventory and each of those tasks carries the same list.

The wiki claims:

- `README.md:35` says `npm run verify` "does **not** build the wiki". It now does. (The same line's
  "or measure a line count" is Task 6's, not this one's; leave it.)
- `docs/README.md:37` says `npm run wiki:test` is "**not in `verify.ps1`**". It now is.
- `docs/VERIFICATION.md:122` says the wiki builds and passes "**by hand today** (audit C09)"; its
  tier 1 `wiki/**` row says nothing else runs these; its tier 2 table gains a row; the "what a full
  green does not mean" paragraph loses the wiki; tier 3 gains the `--check-full` row with ruling
  R15's honest limit ("the cheap check sees a content bump nobody re-extracted, not a hand-edited
  data file").
- `docs/ARCHITECTURE.md:68` and `:223` record the wiki as outside every gate.

The step count, seven to **eight**:

- `docs/VERIFICATION.md:72` ("seven steps") and `:95` ("`verify.ps1:1-15` describes five things and
  does seven"), plus the tier 2 table's step list. **`:95` is not in the audit's list and no sweep
  grep would find it**; it is here because it was re-grepped at HEAD.
- `README.md:35` ("Seven steps: ...").
- `docs/ARCHITECTURE.md:236` ("the acceptance gate, seven steps"). **`:304` is not a step-count
  claim**, it is "`/wiki` 503s forever in production", which Task 5 falsifies; leave it here.
- `CLAUDE.md:66` ("`npm run verify` from the repository root is the acceptance gate, seven steps").
  This one is in no earlier list and is easy to miss.
- `.claude/skills/idlescape-verify/SKILL.md:18,:48,:96`, all three, plus the
  what-a-green-does-not-cover paragraph.

**Do not touch `docs/superpowers/specs/2026-09-07-project-audit.md` or any older plan.** They are
historical records of the state before this entry (ruling R23).

- [ ] **Step 9: Verify**

```bash
cd wiki && bun run typecheck && bun test
cd .. && powershell -File scripts/build.ps1
```

Expected: the wiki step prints, `wiki/build/wiki.db` exists and clears the floor, and the build
summary names it.

Then prove the drift gate can fail, by hand, and put it back:

```bash
python - <<'PY'
import json,io
p='wiki/data/274/manifest.json'
d=json.load(open(p))
d['contentSha']='0000000000000000000000000000000000000000'
open(p,'w',newline='\n').write(json.dumps(d,indent=1)+'\n')
PY
powershell -File scripts/build.ps1    # expect the throw naming upstream.lock
git checkout -- wiki/data/274/manifest.json
```

If `python` is not available, edit the sha by hand in an editor; the point is that the check is
observed failing before it is trusted.

- [ ] **Step 10: Commit**

```bash
git add scripts/build.ps1 scripts/verify.ps1 scripts/setup.ps1 \
        wiki/gen/extract.ts wiki/gen/extract.test.ts wiki/AUTHORING.md \
        README.md docs/README.md docs/VERIFICATION.md docs/ARCHITECTURE.md CLAUDE.md \
        .claude/skills/idlescape-verify/SKILL.md
git -c core.safecrlf=false commit -m "feat(gates): build and test the wiki in build.ps1 and verify.ps1

Audit C09, first half. grep -rn wiki scripts/ returned nothing: 30 test files, 107 tests and a
clean tsc ran in no gate, while server/src/wiki served /wiki from a database no gate built.

build.ps1 gains step 1c: assert wiki/data/274/manifest.json's contentSha equals the sha
scripts/upstream.lock pins, then build the reader database, then assert the database clears a size
floor and the report records no lint errors. The cheap assertion catches a content bump nobody
re-extracted; bun wiki/gen/extract.ts --check-full catches a hand-edited data file and is a tier 3
command because it costs a full re-extract.

verify.ps1's step labels now come from Write-Step and one $TotalSteps constant, so the eleven [n/7]
strings and the eight document claims asserting seven steps move once and never again. This entry
moves the count twice more, in Tasks 6 and 7, and each of those edits the same eight claims.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

### Task 5: The wiki enters the server image (C09, second half)

**This is what unblocks the release gate.** `server/src/env.ts:65` resolves `WIKI_DB` to
`../wiki/build/wiki.db`, which is absent from the image, so `server/src/index.ts:21-22`'s
30-second reopen loop never succeeds, `server/src/wiki/db.ts:45-46` returns null and
`server/src/wiki/routes.ts:39` 503s forever. `Get-HealthGaps` requires `"wiki":"up"` (D75), so no
release can pass until this lands.

**Files:**
- Modify: `deploy/docker/server.Dockerfile:46-59,74-76`
- Modify: `deploy/docker/docker-compose.yml:69-75`
- Modify: `.dockerignore`
- Modify: `deploy/docker/README.md`
- Modify: `web/e2e/wiki.pw.test.ts:4-5` (its citation is now true)

**Interfaces:**
- Consumes: Task 4's `wiki/build/wiki.db`, only in the sense that Task 4 proves the build works
  locally before this asks Docker to run it.
- Produces: `/app/wiki/build/wiki.db` inside the server image, at the path `env.ts` already
  defaults to, so no `WIKI_DB` override exists anywhere (ruling R17).

- [ ] **Step 1: Add the `wiki-build` stage**

Insert after the `engine-public` stage at `server.Dockerfile:59`. Modelled on that stage, because
the same constraint applies: `.dockerignore:12` excludes `engine/` from the build context and
`release.ps1:120` ships `git archive HEAD`, so neither the pinned content clone nor the 113 MB
`loc-spawns.json` is reachable. The stage clones Content itself, exactly as the engine image does.

```dockerfile
# --- stage: wiki (Bun -> wiki/build/wiki.db) ---------------------------------------------------
# The wiki corpus is extracted from engine/content, which is gitignored, excluded from the build
# context, and absent from the `git archive HEAD` tree the box builds from. wiki/data/*/loc-spawns.json
# (113 MB) and wiki/build/wiki.db (138 MB) are gitignored too, so neither the inputs nor the output
# can be COPYed: this stage clones Content at the same pinned sha the engine image uses and runs the
# extract itself. WORKDIR is /build and not /build/wiki because wiki/gen/paths.ts resolves ROOT two
# directories above wiki/gen, and assertContentPinned compares the clone's HEAD against
# scripts/upstream.lock, so both must sit under one root.
FROM oven/bun:1 AS wiki-build
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ARG CONTENT_SHA
RUN if [ -z "$CONTENT_SHA" ]; then echo "CONTENT_SHA build arg is required (see scripts/upstream.lock)" >&2; exit 1; fi
WORKDIR /build
# --depth 1 is not available: the checkout is a pinned sha, not the branch tip.
RUN git clone --single-branch -b 274 https://github.com/LostCityRS/Content engine/content \
 && git -C engine/content checkout -q -f "${CONTENT_SHA}"
COPY scripts/upstream.lock ./scripts/upstream.lock
COPY wiki/package.json wiki/bun.lock* ./wiki/
RUN cd wiki && bun install
COPY wiki/ ./wiki/
RUN cd wiki && bun run extract && bun run build
# The same floor scripts/build.ps1 asserts: a truncated or killed build leaves a file that exists
# and answers nothing, and server/src/wiki/db.ts would open it and 503 forever without saying why.
RUN test -s /build/wiki/build/wiki.db \
 && [ "$(stat -c%s /build/wiki/build/wiki.db)" -gt 33554432 ]
```

and in the runtime stage, beside `:74-76`:

```dockerfile
# server/src/env.ts defaults WIKI_DB to ../wiki/build/wiki.db against this WORKDIR, so the path is
# /app/wiki/build/wiki.db and NO compose override exists. Adding one would be a second statement of
# the same fact that can drift from the first.
COPY --from=wiki-build /build/wiki/build/wiki.db /app/wiki/build/wiki.db
```

- [ ] **Step 2: Pass `CONTENT_SHA` to the `server` build**

`docker-compose.yml:69-75` gives the `server` service `ENGINE_SHA` and the five Vite variables and
no `CONTENT_SHA`; `:31-32` gives the `engine` service both. Add, matching the existing style:

```yaml
        CONTENT_SHA: ${CONTENT_SHA:?set from scripts/upstream.lock, see README.md}
```

`deploy/lightsail/release.ps1:64` already writes `CONTENT_SHA` into `compose.env`, so nothing above
compose changes. Confirm that with `grep -n CONTENT_SHA deploy/lightsail/release.ps1` before
assuming it.

- [ ] **Step 3: Keep the two giant files out of the build context**

`.dockerignore` says nothing about `wiki/`, so on a developer machine the daemon would receive
`wiki/build/wiki.db` (138 MB) and `wiki/data/274/loc-spawns.json` (113 MB) for no reason: the stage
regenerates both. Add, with the reason:

```
# Wiki generated output and its largest gitignored input. The wiki-build stage in
# server.Dockerfile clones Content at CONTENT_SHA and regenerates both, so shipping 250 MB to the
# daemon would be pure cost.
wiki/build/
wiki/data/*/loc-spawns.json
```

- [ ] **Step 4: Say what it costs, where an operator reads**

`deploy/docker/README.md` gains a paragraph, and `deploy/lightsail/README.md` gains the disk note:

```
The server image now carries the wiki reader database, about 132 MiB of layer. That is deliberate
(audit C09): before it, /wiki returned 503 in production forever and the release gate's `wiki` field
could never go green. The stage also clones LostCityRS/Content a second time per image build, since
the engine image clones it too; the cost is build time and bandwidth on the box rather than image
size, and `--filter=blob:none` is the mitigation if it starts to hurt. The box is a small_3_0
Lightsail bundle, so check free disk before a release that also keeps an old image around.
```

- [ ] **Step 5: Make the e2e spec's citation true**

`web/e2e/wiki.pw.test.ts:4-5` cites `scripts/verify.ps1` for a database `verify.ps1` never built,
so on a clean clone it fails deterministically; it passes on a developer machine only because
`wiki/build/` happens to exist there. Task 4 made that citation true for the local stack. Update
the comment to name the step that builds it (`scripts/build.ps1`'s step 1c, run by verify) and the
image stage that ships it, so a reader knows both halves.

- [ ] **Step 6: Verify, without deploying anything**

Build the image locally. This is the only proof that matters and it touches no host:

```bash
ENGINE_SHA=$(grep '^engine/server ' scripts/upstream.lock | cut -d' ' -f2)
CONTENT_SHA=$(grep '^engine/content ' scripts/upstream.lock | cut -d' ' -f2)
docker build -f deploy/docker/server.Dockerfile \
  --build-arg ENGINE_SHA="$ENGINE_SHA" \
  --build-arg CONTENT_SHA="$CONTENT_SHA" \
  --build-arg VITE_FIREBASE_API_KEY=x --build-arg VITE_FIREBASE_AUTH_DOMAIN=x \
  --build-arg VITE_FIREBASE_PROJECT_ID=x --build-arg VITE_FIREBASE_APP_ID=x \
  --build-arg VITE_FIREBASE_MESSAGING_SENDER_ID=x \
  -t idlescape-server:entry2 .
docker run --rm idlescape-server:entry2 ls -la /app/wiki/build/wiki.db
```

Expected: the build succeeds and the file is over 100 MB at exactly that path.

Then prove the stage's assertion can fail: temporarily change the size floor in the Dockerfile to a
number the real database cannot clear (say `-gt 999999999`), rebuild, watch it fail at that RUN,
and put the real number back. A build-time assertion nobody has seen fail is a build-time assertion
nobody should trust.

Finally, prove the missing build arg fails loudly:

```bash
docker build -f deploy/docker/server.Dockerfile --build-arg ENGINE_SHA="$ENGINE_SHA" \
  --build-arg VITE_FIREBASE_API_KEY=x --build-arg VITE_FIREBASE_AUTH_DOMAIN=x \
  --build-arg VITE_FIREBASE_PROJECT_ID=x --build-arg VITE_FIREBASE_APP_ID=x \
  --build-arg VITE_FIREBASE_MESSAGING_SENDER_ID=x -t idlescape-server:noargs .
```

Expected: fails with `CONTENT_SHA build arg is required`.

**Do not run `deploy/lightsail/release.ps1`, `cutover.ps1` or anything that reaches the box.** G5.

- [ ] **Step 7: Commit**

```bash
git add deploy/docker/server.Dockerfile deploy/docker/docker-compose.yml \
        deploy/docker/README.md deploy/lightsail/README.md .dockerignore web/e2e/wiki.pw.test.ts
git -c core.safecrlf=false commit -m "feat(deploy): build the wiki into the server image so /wiki stops 503ing in production

Audit C09, second half, and the thing that unblocks the release gate. server/src/env.ts resolves
WIKI_DB to ../wiki/build/wiki.db; nothing put a database there, so index.ts's 30-second reopen loop
never succeeded, wiki/db.ts returned null and wiki/routes.ts 503'd forever. D75 made the release
gate require wiki:\"up\", which is why no release could pass.

A fourth build stage clones LostCityRS/Content at CONTENT_SHA and runs the extract and the build
itself: engine/ is excluded from the build context and both the 113 MB input and the 138 MB output
are gitignored, so neither can be COPYed. The database lands at /app/wiki/build/wiki.db, which is
the path env.ts already defaults to against the runtime WORKDIR, so there is no WIKI_DB override
anywhere. CONTENT_SHA is added to the server service's build args; release.ps1 already writes it
into compose.env.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

### Task 6: The 400-line ceiling, enforced by something (C16, first third)

`CLAUDE.md:53` says out loud "Nothing is enforcing the 400-line ceiling yet (audit C16). Hold it
yourself." The rule is asserted in five documents and enforced by none. **The first run is green**,
and a gate whose first run is green is exactly the shape this project distrusts, so the mutation
step is not optional.

**Files:**
- Create: `scripts/line-ceiling.ps1`
- Modify: `web/eslint.config.js:15-22`
- Modify: `scripts/verify.ps1` (a new early step, `$TotalSteps` 8 to 9)
- Modify: `CLAUDE.md:53` (nothing enforces the ceiling) **and `:66`** (the step count)
- Modify: `README.md:35` (the step count, and "or measure a line count")
- Modify: `docs/ARCHITECTURE.md:66` (`| Files under 400 lines | Nothing | **Not enforced** |`)
  **and `:236`** (the step count)
- Modify: `docs/VERIFICATION.md` (`:72`, `:95`, the tier 1 and tier 2 tables, the what-a-green-does-
  not-mean paragraph)
- Modify: `.claude/skills/idlescape-verify/SKILL.md:18,:48,:96`

Every step-count location in ruling R14's inventory is edited here, eight to nine, not just the
three the first draft of this task listed. A document left saying "eight steps" is exactly as wrong
as one left saying seven, and Task 12's sweep greps for both spellings.

**Interfaces:**
- Consumes: Task 4's `Write-Step` and `$TotalSteps` in `scripts/verify.ps1`.
- Produces: `scripts/line-ceiling.ps1`, exit 0 clean and exit 1 with one line per offender
  (`<path>: <n> lines (ceiling 400)`). It is runnable by hand from the repository root and is
  named in `docs/VERIFICATION.md`'s tier 1 table.

- [ ] **Step 1: Write the check**

Ruling R18: this script is the authority and covers every area including `web/`; eslint carries the
same number as an editor convenience and this script asserts that the two agree. Enumerate with
`git ls-files`, which excludes `node_modules`, `dist`, `engine/`, `wiki/build/` and `live/` for
free and means an untracked scratch file cannot fail the gate.

Create `scripts/line-ceiling.ps1`:

```powershell
# scripts/line-ceiling.ps1 -- the 400-line ceiling, enforced.
#
# CLAUDE.md, the sprint spec, the roadmap, the sprint handoff and the design skill all assert that
# every file we wrote stays under 400 lines including tests. Audit C16: nothing enforced it, and
# CLAUDE.md said so. This is the authority. web/eslint.config.js carries the same number as an
# editor convenience for web/src and web/e2e, and this script asserts the two agree, so they
# cannot drift.
#
# SCOPE: tracked source files WE wrote, by extension. Enumerated with `git ls-files`, so
# node_modules, dist, engine/, wiki/build/ and live/ are excluded for free and an untracked scratch
# file cannot fail the gate.
#
# EXEMPTIONS, all of them, in one place. Nothing else is exempt, and adding one means editing this
# header and the list below together.
#
#   1. web/src/vendor/** and client/src/vendor/**  -- vendored third party (rs-sdk, pinned at
#      56b73e0); deviations are logged in each vendor/PATCHES.md, and web/src/vendor/** is already
#      in eslint.config.js's ignores. Largest today: web/src/vendor/rs-sdk/sdk/actions.ts at 4,817.
#   2. client/src/** outside hooks/ and plugins/   -- the pristine 274 client fork.
#      client/src/client/Client.ts is 14,481 lines and holds 28 numbered patches; the ceiling is
#      not ours to apply to upstream's tree.
#   3. Generated output -- wiki/data/**, web/src/data/**, content-custom/pack/**. Extension
#      filtering removes most of it. The one generated SOURCE file is
#      web/src/tasks/library/tutorialIsland/steps.ts (82 lines today), named here so a future
#      regeneration that crosses 400 is a known exemption rather than a surprise.
#   4. web/styleguide.html, 504 lines -- decision D12 and shell v2 ruling R31: a single static demo
#      page whose value is that every component family is on ONE scrollable page. The only
#      exemption that is load-bearing today.
#   5. Prose -- every .md. engine-custom/PATCHES.md is 845 and docs/** is far larger. The ceiling
#      has never applied to prose; the SDD convention's "ledgers under 400 lines" is a different
#      rule with a different enforcement point.
#   6. engine-custom/src/web.ts, 367 lines -- a whole-file replacement of an upstream file, so its
#      size is upstream's choice. It passes today; recorded so a future upstream bump does not turn
#      an unrelated file into a gate failure. Audit C16 names this one explicitly.
#
# WHERE IT RUNS: early in scripts/verify.ps1, not in build.ps1. It is a second of work, so failing
# at step 1 costs nothing while failing at step 8 costs every suite before it, and build.ps1 is
# about producing shippable bundles. This overrides C16's literal wording.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$Ceiling = 400

$includeExt = @('.ts', '.css', '.html', '.ps1', '.sh', '.rules')
$includeDirs = @(
    'web/src/', 'web/e2e/', 'server/src/', 'engine-custom/src/',
    'client/src/hooks/', 'client/src/plugins/',
    'scripts/', 'wiki/gen/', 'firebase/', 'deploy/'
)
$exempt = @(
    'web/src/vendor/', 'client/src/vendor/',
    'web/styleguide.html',
    'web/src/tasks/library/tutorialIsland/steps.ts',
    'engine-custom/src/web.ts'
)

Push-Location $root
try {
    $tracked = & git ls-files
    if ($LASTEXITCODE -ne 0) { throw 'git ls-files failed' }
} finally { Pop-Location }

$offenders = @()
$scanned = 0
foreach ($rel in $tracked) {
    $path = $rel -replace '\\', '/'
    $inScope = $false
    foreach ($d in $includeDirs) { if ($path.StartsWith($d)) { $inScope = $true } }
    if (-not $inScope) { continue }
    if ($includeExt -notcontains [System.IO.Path]::GetExtension($path)) { continue }
    $skip = $false
    foreach ($e in $exempt) { if ($path.StartsWith($e) -or $path -eq $e) { $skip = $true } }
    if ($skip) { continue }

    $full = Join-Path $root ($path -replace '/', '\')
    if (-not (Test-Path -LiteralPath $full)) { continue }
    $n = (Get-Content -LiteralPath $full | Measure-Object -Line).Lines
    $scanned = $scanned + 1
    if ($n -gt $Ceiling) { $offenders += "  ${path}: $n lines (ceiling $Ceiling)" }
}

# A scan that matched nothing would pass silently forever, which is the failure mode this whole
# entry exists to remove. The floor is well under the ~430 files in scope today.
if ($scanned -lt 200) { throw "line-ceiling scanned only $scanned files; the include list or the extension filter is wrong, and a green here would mean nothing" }

# The eslint convenience must carry the same number, or a developer's editor and this gate disagree.
$eslint = Get-Content -LiteralPath (Join-Path $root 'web\eslint.config.js') -Raw
if ($eslint -notmatch "'max-lines'\s*:\s*\[\s*'error'\s*,\s*\{\s*max:\s*$Ceiling\b") {
    throw "web/eslint.config.js does not carry a max-lines rule at $Ceiling; it and scripts/line-ceiling.ps1 must agree (see this file's header)"
}

if ($offenders.Count -gt 0) {
    Write-Host "`n$($offenders.Count) file(s) over the $Ceiling-line ceiling:"
    $offenders | ForEach-Object { Write-Host $_ }
    throw "split them; the exemption list is in the header of scripts/line-ceiling.ps1 and adding to it is a decision, not a fix"
}
Write-Host "line ceiling: $scanned file(s) scanned, none over $Ceiling"
```

- [ ] **Step 2: Add the eslint rule**

`web/eslint.config.js:15-22`, inside the existing `rules` block:

```js
      // The 400-line ceiling, as editor feedback. scripts/line-ceiling.ps1 is the authority and
      // asserts this number matches its own; web/src/vendor/** is already in `ignores` below.
      // skipBlankLines and skipComments are false so the number means the same thing as `wc -l`.
      'max-lines': ['error', { max: 400, skipBlankLines: false, skipComments: false }],
```

- [ ] **Step 3: Run it and watch it pass, which is not yet evidence of anything**

```bash
powershell -File scripts/line-ceiling.ps1
cd web && npm run lint
```

Expected: `line ceiling: <n> file(s) scanned, none over 400`, with `n` somewhere near 430, and a
clean lint. **This proves nothing yet.**

- [ ] **Step 4: The mutation step, which is where the evidence comes from**

Create a 401-line file in each scanned area, one at a time, confirm the check fails and names it,
then delete it. Areas to cover, because each exercises a different include prefix and a different
extension: `web/src`, `server/src`, `engine-custom/src`, `client/src/hooks`, `scripts`,
`wiki/gen`, `deploy` and one `.css` under `web/src/styles`.

```bash
for f in web/src/_ceiling.ts server/src/_ceiling.ts engine-custom/src/_ceiling.ts \
         client/src/hooks/_ceiling.ts scripts/_ceiling.ps1 wiki/gen/_ceiling.ts \
         deploy/lightsail/_ceiling.ps1 web/src/styles/_ceiling.css; do
  mkdir -p "$(dirname "$f")"
  yes "// x" | head -401 > "$f"
  git add -N "$f"                 # git ls-files must see it, since the scan enumerates tracked files
  powershell -File scripts/line-ceiling.ps1 && echo "FAILED TO CATCH $f"
  git rm -f --cached "$f" >/dev/null; rm "$f"
done
```

Expected: each iteration prints `  <path>: 401 lines (ceiling 400)` and throws, and `FAILED TO
CATCH` never appears. Then confirm the eslint half fails too:

```bash
yes "// x" | head -401 > web/src/_ceiling.ts
cd web && npm run lint          # expect: max-lines error on _ceiling.ts
cd .. && rm web/src/_ceiling.ts
```

Then confirm the drift guard fires: temporarily change eslint's `max: 400` to `max: 500`, run the
script, watch it throw naming the disagreement, and put it back.

**Commit none of the mutation files.** `git status` must be clean of them before Step 6.

- [ ] **Step 5: Wire it into `verify.ps1` as the new first step**

Bump `$TotalSteps` from 8 to 9 and insert before the engine overlay step at `:76`:

```powershell
# --- Static gate: the 400-line ceiling ---------------------------------------
# First, deliberately: it is a second of work, and a file over the ceiling should not cost the ten
# minutes of suites below it before anyone hears about it. Audit C16.
Write-Step 'line ceiling (scripts/line-ceiling.ps1)'
& (Join-Path $PSScriptRoot 'line-ceiling.ps1')
Invoke-Native 'line ceiling'
```

- [ ] **Step 6: Correct the documents that say nothing enforces this, and the step count**

Two separate sets of claims. Both are in this commit.

The ceiling claims, which this task falsifies:

- `CLAUDE.md:53` currently reads "Nothing is enforcing the 400-line ceiling yet (audit C16). Hold
  it yourself." Replace with: "`scripts/line-ceiling.ps1` enforces it, first thing in
  `npm run verify`, and `web/eslint.config.js` carries the same number so your editor says it
  first. The six exemptions are listed in that script's header."
- `docs/ARCHITECTURE.md:66` is the row
  `| Files under 400 lines | Nothing | **Not enforced** (audit C16). ... |`. The middle column
  becomes `scripts/line-ceiling.ps1` plus `web/eslint.config.js`, and the right column says
  enforced, keeping the `web/styleguide.html` D12 note.
- `README.md:35` lists what `npm run verify` does **not** do, including "or measure a line count".
  It now does; remove that clause and leave the rest of the sentence alone.
- `docs/VERIFICATION.md`: the tier 1 table gains a `scripts/line-ceiling.ps1` row; the tier 2
  table gains the verify step; the "what a full green does not mean" paragraph loses the line
  count.
- `.claude/skills/idlescape-verify/SKILL.md`: the step list and the same paragraph.

The step count, eight to **nine**, every location in R14's inventory: `docs/VERIFICATION.md:72`
and `:95`, `README.md:35`, `docs/ARCHITECTURE.md:236`, `CLAUDE.md:66`, and
`.claude/skills/idlescape-verify/SKILL.md:18,:48,:96`. Task 4 moved each of these from seven to
eight; leaving any at eight is the same defect.

- [ ] **Step 7: Verify**

```bash
powershell -File scripts/line-ceiling.ps1
cd web && npm run lint
cd .. && git status --short          # nothing from Step 4 left behind
```

- [ ] **Step 8: Commit**

```bash
git add scripts/line-ceiling.ps1 scripts/verify.ps1 web/eslint.config.js \
        CLAUDE.md README.md docs/ARCHITECTURE.md docs/VERIFICATION.md \
        .claude/skills/idlescape-verify/SKILL.md
git -c core.safecrlf=false commit -m "feat(gates): enforce the 400-line ceiling

Audit C16. The rule was asserted in five documents and enforced by nothing; CLAUDE.md said so.
scripts/line-ceiling.ps1 is the authority: it enumerates with git ls-files, scans the source we
wrote by extension, and holds all six exemptions in one header. web/eslint.config.js gains the same
number as editor feedback, and the script asserts the two agree so they cannot drift.

Zero files are over the ceiling today, so this is a ratchet rather than a cleanup, and seven sit
within ten lines of it. A gate whose first run is green proves nothing, so the check was watched
failing on a 401-line file in each scanned area, on both mechanisms, and on a deliberate
disagreement between the two numbers, before it was trusted. It also refuses to pass if it scanned
fewer than 200 files, since an include list that silently matches nothing is the same defect in a
new place.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

### Task 7: Typecheck the web tests and the client fork (C16, second third)

`web/tsconfig.json:18` excludes `src/**/*.test.ts`, so 127 test files are in no program at all;
vitest transpiles with esbuild and typechecks nothing, so a test can drift from a changed interface
and verify stays green. `client/package.json` has `build` and `build:dev` and no typecheck of any
kind, while `client/PATCHES.md:34` claims every upstream bump re-runs `bunx tsc --noEmit`.

**This task wires the checks and reports honestly. Task 8 fixes what they find.** They are separate
tasks because a reviewer can meaningfully accept the wiring and reject a fix, and because the
wiring commit must not be a 30-file diff.

**Files:**
- Create: `web/tsconfig.test.json`
- Modify: `web/tsconfig.json:17-18`
- Modify: `web/package.json:13`
- Modify: `client/package.json:9-12`
- Modify: `client/PATCHES.md:33-35`
- Modify: `scripts/verify.ps1` (the client typecheck, `$TotalSteps` 9 to 10)
- Modify: `docs/VERIFICATION.md` (false green 11 is retired, plus `:72`, `:95` and the tier 2 table
  for the step count)
- Modify: `README.md:35`, `docs/ARCHITECTURE.md:236`, `CLAUDE.md:66`,
  `.claude/skills/idlescape-verify/SKILL.md:18,:48,:96` (the step count, nine to **ten**)

This is the third and last time this entry moves the count. Tasks 4 and 6 each edited the same
eight locations; if any of them still says eight or nine when this task is done, Task 12's sweep
fails.

**Interfaces:**
- Consumes: Task 6's `Write-Step` usage and `$TotalSteps` in `verify.ps1`.
- Produces: `cd web && npm run typecheck` runs three projects; `cd client && bun run typecheck`
  exists; both are in `verify.ps1`.

- [ ] **Step 1: Measure the client fork before deciding its shape**

The audit hedged that a scoped tsconfig might be needed. A probe found the pristine tree clean, but
that measurement will be stale by the time this runs, so measure again first:

```bash
cd client && bunx tsc --noEmit; echo "exit $?"
```

- **Exit 0:** ship `"typecheck": "tsc --noEmit"` and continue. This is the expected outcome.
- **Non-zero:** count the errors and the files, then ship `client/tsconfig.check.json` scoped to
  `src/hooks/**`, `src/plugins/**` and `bundle.ts` (about 1,407 lines of our own code), record the
  excluded surface **and the error count you measured** in `client/PATCHES.md` beside the claim it
  is correcting, and open a row in this plan's ledger (Task 12) saying the pristine tree is red.
  **Do not let a red pristine tree turn into a skipped step.**

Write the number you got into the commit message either way.

- [ ] **Step 2: Add the client typecheck script and correct its PATCHES claim**

`client/package.json:9-12`:

```json
    "scripts": {
        "build": "bun run bundle.ts",
        "build:dev": "bun run bundle.ts dev",
        "typecheck": "tsc --noEmit"
    },
```

`client/PATCHES.md:33-35` claims every upstream bump re-runs `bunx tsc --noEmit`. It becomes true
rather than aspirational:

```
Every upstream bump re-runs `bun run typecheck` (`tsc --noEmit` over the whole package), and
`scripts/verify.ps1` runs it on every gate, so the claim above is checked rather than remembered.
Audit C16 found it unchecked. `src/vendor/` remains the only place the repo's no-`as any` rule is
relaxed; casts do not fail a typecheck, so the vendored tree passing is not evidence about its
casts.
```

- [ ] **Step 3: Create the web test project**

**The harness trap:** there are nine harness files under `web/src`, and one of them is not named
`*.harness.ts`. Confirm with `git ls-files | grep harness`; at HEAD the list is

```
web/src/agent/workerContext.harness.ts     web/src/agent/workerHost.harness.ts
web/src/bank/grid.harness.ts               web/src/bank/gridInput.harness.ts
web/src/plugins/builtin/tasks.harness.ts   web/src/tasks/api.harness.ts
web/src/tasks/library/library.harness.ts   web/src/tasks/recovery.harness.ts
web/src/tasks/library/tutorialIsland/harness.ts
```

That last one has no `.harness` infix, so an `**/*.harness.ts` glob alone misses it. Every one is
imported only by test files, which is why five of them carry a comment about deliberately importing
nothing from vitest; moving them into a test-only project retires `docs/VERIFICATION.md`'s false
green 11 ("`tsconfig` excludes `*.test.ts` but not `*.harness.ts`") as a class rather than as a
discipline.

Create `web/tsconfig.test.json`:

```jsonc
{
  // The test program. Audit C16: 127 test files were in no tsconfig at all, and vitest transpiles
  // with esbuild without typechecking, so a test could drift from a changed interface and the gate
  // stayed green. No `types` entry is needed for vitest globals: all 127 files import describe,
  // test and expect from 'vitest' explicitly. Inheriting types: ["vite/client"] from the base is
  // right, because the tests import src/ modules that read import.meta.env.
  "extends": "./tsconfig.json",
  "include": ["src/**/*.test.ts", "src/**/*.harness.ts", "src/**/harness.ts", "src/test/**/*.ts"],
  // The same carve-out eslint.config.js already has: vendored rs-sdk, deviations in vendor/PATCHES.md.
  "exclude": ["src/vendor/**"]
}
```

`web/tsconfig.json:17-18` stops shipping the harnesses in the production program:

```jsonc
  "include": ["src/**/*.ts"],
  // Tests and harnesses live in tsconfig.test.json; e2e in tsconfig.e2e.json. `npm run typecheck`
  // runs all three, so nothing is unchecked, and a harness is no longer part of the shipped program.
  "exclude": ["src/**/*.test.ts", "src/**/*.harness.ts", "src/**/harness.ts", "e2e/**"]
```

`web/package.json:13`:

```json
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.e2e.json && tsc --noEmit -p tsconfig.test.json",
```

- [ ] **Step 4: Run it and record the real number**

```bash
cd web && npx tsc --noEmit -p tsconfig.test.json 2>&1 | tee ../.superpowers/sdd/2026-09-07-entry2-plan/typecheck-web-tests.txt | tail -5
npx tsc --noEmit -p tsconfig.test.json 2>&1 | grep -c "error TS"
npx tsc --noEmit -p tsconfig.test.json 2>&1 | grep -o "error TS[0-9]*" | sort | uniq -c | sort -rn
npx tsc --noEmit -p tsconfig.test.json 2>&1 | grep "error TS" | cut -d'(' -f1 | sort | uniq -c | sort -rn
```

The probe measured **109** across **29** files: 108 in tests plus two in `web/src/ui/toast.ts`
(which is one file, so 29 files and 110 errors if `toast.ts` contributes both; record what you
actually see rather than what this paragraph predicts). Write the four outputs into the SDD
workspace: they are Task 8's checklist, and the workspace is git-ignored so nothing commits.

**Report the number honestly and do not call a small one a success.** Across the 127 test files
there are zero `as any`, zero `@ts-expect-error` and zero `@ts-ignore`, but **108** `as unknown as`
casts, and those suppress precisely the interface-drift class this check exists to catch. The value
is the ratchet on future drift, not the size of today's backlog.

- [ ] **Step 5: Wire the client typecheck into `verify.ps1`**

Bump `$TotalSteps` from 9 to 10, and add beside the existing client unit test step at `:148-154`:

```powershell
Write-Step 'client typecheck (tsc --noEmit)'
Push-Location (Join-Path $root 'client')
try {
    & $bun run typecheck
    Invoke-Native 'client typecheck'
} finally { Pop-Location }
```

If Step 1 measured a red pristine tree and you shipped `tsconfig.check.json`, the script line is
`& $bun run typecheck` all the same; the scoping lives in `client/package.json`, not in
`verify.ps1`, so the gate does not have to know.

**Do not** add a `verify.ps1` step for the web test typecheck: `web/package.json`'s `typecheck`
already runs all three projects and `verify.ps1:188` already calls it, so it is picked up with no
script change. That is why `$TotalSteps` goes to 10 and not 11.

Then move the step count from nine to **ten** in all eight of R14's locations, in this commit:
`docs/VERIFICATION.md:72` and `:95` and its tier 2 table, `README.md:35`,
`docs/ARCHITECTURE.md:236`, `CLAUDE.md:66`, and `.claude/skills/idlescape-verify/SKILL.md:18,:48,
:96`. Task 4 took them to eight and Task 6 to nine; this is the last move. **Check each one by
opening it, not by trusting that the earlier task did it**: `git grep -nE "(seven|eight|nine) steps"`
from the repository root must return nothing outside
`docs/superpowers/specs/2026-09-07-project-audit.md` and older plans and ledgers.

- [ ] **Step 6: Verify what you can, and leave the rest to Task 8**

```bash
cd client && bun run typecheck && bun test src/hooks src/plugins src/vendor
```

Expected: green.

```bash
cd web && npm run typecheck
```

Expected: **red**, with the count from Step 4. That is the point of this commit: the check now
exists and it is honest. `verify.ps1`'s web step (typecheck, lint, vitest) is red until Task 8
lands, and the two tasks are dispatched back to back. Do not quote a step number here: by the time
this task ships, Task 6 has inserted the line ceiling as the new first step and this task has
inserted the client typecheck, so the web step prints `[6/10]` rather than the `[4/7]` it is at
HEAD. Naming the step by what it does is the whole point of ruling R14.

- [ ] **Step 7: Retire false green 11**

`docs/VERIFICATION.md`'s false-green list has an entry saying `tsconfig` excludes `*.test.ts` but
not `*.harness.ts`, so a harness was in the shipped program and a broken test file was checked by
nothing. Both halves are now false. Rewrite that entry to say what is true: tests and harnesses are
typechecked by `tsconfig.test.json`, harnesses are out of the shipped program, and the residual
risk is the 108 `as unknown as` casts, which a typecheck cannot see through.

- [ ] **Step 8: Commit**

```bash
git add web/tsconfig.json web/tsconfig.test.json web/package.json \
        client/package.json client/PATCHES.md scripts/verify.ps1 \
        docs/VERIFICATION.md README.md docs/ARCHITECTURE.md CLAUDE.md \
        .claude/skills/idlescape-verify/SKILL.md
git -c core.safecrlf=false commit -m "feat(gates): typecheck the web tests and the client fork

Audit C16, the two halves 59f6155 did not close. web/tsconfig.json excluded src/**/*.test.ts and
nothing else picked them up, so 127 files were in no program and vitest's esbuild transpile checked
none of them. client/ had no typecheck script at all, while client/PATCHES.md claimed every
upstream bump ran one.

web/tsconfig.test.json takes the tests and the nine harnesses, and tsconfig.json stops shipping the
harnesses in the production program, which retires false green 11 as a class. Note one harness is
named harness.ts with no infix, so the include needs both globs. client gains tsc --noEmit and a
verify step beside its unit tests.

This commit wires the checks and reports the backlog; the next fixes it. The web test project is
RED at N errors across M files as of this commit. That number is not a scorecard: the suite carries
108 `as unknown as` casts, which suppress exactly the drift this check exists to catch, so the
value is the ratchet on what comes next.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

Replace `N` and `M` with the numbers Step 4 measured. Do not guess them.

---

### Task 8: Fix what the new typechecks surface (C16, final third)

The backlog Task 7 exposed, fixed rather than suppressed. The probe measured 108 errors across 28
test files plus two in one production file; the authoritative list is what
`cd web && npx tsc --noEmit -p tsconfig.test.json` prints at HEAD, and **that list, not this
paragraph, is the checklist**.

**Files:**
- Modify: `web/src/ui/toast.ts:16-18` (the production file, first)
- Modify: roughly 28 files under `web/src/**/*.test.ts`, per that command's output

**Interfaces:**
- Consumes: Task 7's `web/tsconfig.test.json` and the error list that task's Step 4 command,
  `cd web && npx tsc --noEmit -p tsconfig.test.json`, regenerates on demand. Task 8's own Step 3
  only re-counts it and Step 4 greps the diff for casts, so neither is the source. (The planning
  workspace held a captured copy; a committed file must not cite a git-ignored path as an
  authority, per `docs/README.md` section 7, and the count it carried is recorded in
  `docs/superpowers/ledgers/2026-09-07-release-integrity-and-account-isolation.md` section 5.)
- Produces: `cd web && npm run typecheck` exits 0 across all three projects.

**The rule for the whole task, which is the only thing that makes it worth doing:** a finding is
fixed by making the fixture right, not by widening a type and not by adding a cast. **No new
`as unknown as`, no `as any`, no `@ts-expect-error`, no `@ts-ignore`.** The suite already has 108
`as unknown as` casts and they are the reason 108 drifts accumulated unseen. If a finding genuinely
cannot be fixed without one, it goes in the ledger with the reason, and there should be none.

- [ ] **Step 1: Fix the production file first**

`web/src/ui/toast.ts:17-18` gets two TS7006 the moment a test file joins the program. The mechanism
is worth understanding before touching it: a test's `import ... from 'vitest'` pulls `@types/node`
into the program regardless of the `types` array, `setTimeout` becomes an overloaded union of the
DOM and Node signatures, and `opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms))` loses its
contextual typing, so `fn` and `ms` become implicit `any`. It reproduces with `types:
["vite/client"]` alone, so it is not a probe artefact.

Fix it by naming the parameter types rather than by reaching for the global:

```ts
// The default timer, typed explicitly. Inferring it from the global `setTimeout` breaks the moment
// @types/node is in the program (which a single `import from 'vitest'` anywhere achieves), because
// the global becomes an overloaded union and the callback loses its contextual typing. Audit C16.
const defaultSetTimeout = (fn: () => void, ms: number): ReturnType<typeof setTimeout> => setTimeout(fn, ms);
```

and use `opts.setTimeout ?? defaultSetTimeout`. Read `web/src/ui/toast.ts:10-20` first and match
the real parameter shape of the `setTimeout` option in that file's own interface: if it is declared
as `(fn: () => void, ms: number) => number`, the return type above must be `number` and the body
needs the DOM overload, which under `@types/node` means asserting nothing and instead changing the
interface's return type to `ReturnType<typeof setTimeout>`. Choose whichever of the two keeps the
interface honest, and say which in the commit.

Run: `cd web && npx tsc --noEmit && npx tsc --noEmit -p tsconfig.test.json 2>&1 | grep toast`
Expected: no `toast.ts` line in either.

- [ ] **Step 2: Fix the four error classes, worst files first**

Work down the per-file counts from Task 7's Step 4. Each class has one right fix:

**TS2304, "cannot find name" (9 at the probe: `MainToWorker`, `ObjInfo`, `IconCache`,
`TraceEvent`).** A type name used and never imported. Add the import. These are free and go first,
because an unresolved name suppresses every downstream error in the same file, so fixing them
changes the count.

```ts
import type { MainToWorker } from './protocol';
```

**TS2741, "property missing" (9; five are `HealthSnapshot` fixtures in `src/panels/connect.test.ts`
missing `players`).** The interface grew and the fixture did not. Fix the fixture, and if the same
fixture appears more than twice in a file, hoist it into a local factory so the next field costs
one edit:

```ts
const snapshot = (over: Partial<HealthSnapshot> = {}): HealthSnapshot => ({
  engine: 'up', engineUptimeMs: 0, version: '0.1.0', gateEnabled: false,
  gateway: 'not_deployed', players: 0, ...over
});
```

**No `wiki` field.** `web/src/types.ts:4`'s `HealthSnapshot` is the web mirror and declares six
members; only `server/src/types.ts:36-44` has `wiki`. Adding it to a web-side literal is a TS2353
excess-property error, which is precisely the class this task is clearing, and it would land in
this task's own measured backlog. Task 10 adds `management` and `wiki` to the web mirror together
and every such factory gains both fields there. That is the ratchet working, and it is why the
factory is worth writing here.

**TS2353, "object literal may only specify known properties" (33, the largest class).** A test is
passing a field the interface does not have, usually because the field was renamed. **Do not widen
the interface.** Find what the field became and rename it in the test; if the production code no
longer has that concept at all, the assertion around it is dead and goes with it. If a test
genuinely needs a partial, take `Partial<T>` in the helper rather than casting the literal.

**TS2345, "argument not assignable" (24) and TS7006, "implicit any" (11).** TS7006 is an inline
fake whose callback parameters were never typed; type them from the interface the fake implements:

```ts
const backend: ToggleBackend = {
  load: async (uid: string) => ({}),
  write: async (uid: string, id: string, enabled: boolean) => {}
};
```

TS2345 is usually a stub object handed to a function expecting a full interface. Build the stub
through a typed factory so the compiler fills the gaps, or implement the missing members with
`() => { throw new Error('not used by this test'); }`, which is honest and fails loudly if the test
starts depending on it.

- [ ] **Step 3: Re-measure after every few files**

```bash
cd web && npx tsc --noEmit -p tsconfig.test.json 2>&1 | grep -c "error TS"
```

The count must go down monotonically. If it goes up, a TS2304 fix has unmasked errors that were
hidden behind it; that is expected once or twice and is not a regression.

- [ ] **Step 4: Prove no cast was smuggled in**

```bash
git diff --unified=0 -- web/src | grep '^+' | grep -nE "as any|as unknown as|@ts-(expect-error|ignore)"
```

Expected: nothing. If a line comes back, it violates this task's only rule; fix the fixture instead.

Then confirm the suite still means what it meant:

```bash
cd web && npx vitest run
```

Expected: the same pass count as before Task 8, with no test skipped or deleted. If a test was
deleted because its assertion was dead, say which and why in the commit message.

- [ ] **Step 5: Verify**

```bash
cd web && npm run typecheck && npm run lint && npx vitest run
cd .. && powershell -File scripts/line-ceiling.ps1
```

Expected: all clean. The line ceiling matters here because the fixture factories add lines to test
files, and `web/src/sessions/manager.test.ts` is at 396 and `web/src/plugins/builtin/tasks.test.ts`
at 394. If either crosses 400, split the file by concern rather than trimming comments, and name
the split in the commit.

- [ ] **Step 6: Commit**

```bash
git add web/src/ui/toast.ts web/src
git -c core.safecrlf=false commit -m "fix(web): clear the backlog the test typecheck exposed

Audit C16. N errors across M files, every one of them the interface drift the check exists to
catch: type names used and never imported, HealthSnapshot fixtures missing fields the interface
grew, object literals carrying renamed properties, and untyped inline fakes.

Every one is fixed by making the fixture right. No new `as unknown as`, no `as any`, no
ts-expect-error: the suite already carried 108 of the first, and those casts are why 108 drifts
accumulated where nothing could see them.

One of the errors was in a production file nobody had budgeted for: web/src/ui/toast.ts lost the
contextual typing of its default timer the moment a test's `import from 'vitest'` pulled
@types/node into the program and setTimeout became an overloaded union. Named explicitly now.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

Replace `N` and `M` with what you measured. `git add web/src` is acceptable here only because the
change is genuinely spread across that whole tree; run `git status --short` first and confirm every
listed file is one this task edited.

---

### Task 9: Authenticate `/setup*`, and give the overlay a health route (C07 remainder, engine half)

`engine-custom/src/web.ts:335-355` registers three routes with no auth, directly above the
secret-gated bank routes at `:359`. `GET /setup/config` returns `loadWorldConfig()` whole, which
carries `db.pass` in plaintext; `PUT /setup/config` rewrites `node.production` and `build.verify`.
D74 mitigated this by **topology**, moving the engine onto a two-member compose network, and said
in writing that authenticating them "is C07's remaining half and belongs to entry 2".

**Files:**
- Modify: `engine-custom/src/web.ts:330-359`
- Modify: `engine-custom/src/idlescape/management.ts:89-105`
- Modify: `engine-custom/src/idlescape/management.test.ts`
- Modify: `engine-custom/PATCHES.md`
- Modify: `deploy/docker/engine.Dockerfile:94-101`
- Modify: `deploy/docker/docker-compose.yml:15-21`
- Modify: `scripts/setup.ps1:56` (the world.json comment that mentions the `/setup` page; `:126` is
  the `BuildOverlay` pack block and is not this)

**Interfaces:**
- Consumes: nothing from Tasks 1 to 8.
- Produces, for Task 10: `GET /owner/health` on the engine's management port, behind the same
  `x-idlescape-mgmt` header as the bank routes, returning `200 {"ok":true}` when the header matches
  and `401` when it does not. It is registered by `registerOwnerBankRoutes`, so with no
  `ENGINE_MANAGEMENT_SECRET` it does not exist at all and answers `404`. Those three statuses are
  exactly what Task 10's health probe maps to `up`, `unauthorized` and `unauthorized`.

- [ ] **Step 1: Write the failing tests**

Append to `engine-custom/src/idlescape/management.test.ts`, using the `app()` factory already at
`:28-32` plus the two constants above it: `SECRET` at `:19` (`'s'.repeat(32)`) and `AUTH` at `:20`
(`{ 'x-idlescape-mgmt': SECRET }`). Both are used below; the first draft of this step named only
`AUTH`, and cited it a line late.

```ts
test('the health route answers only for the configured secret', async () => {
    const f = app();
    const ok = await f.inject({ method: 'GET', url: '/owner/health', headers: AUTH });
    assert.equal(ok.statusCode, 200);
    assert.deepEqual(ok.json(), { ok: true });
    // Never the secret, never a hint at its length: the status IS the evidence.
    assert.equal(ok.body.includes(SECRET), false);

    assert.equal((await f.inject({ method: 'GET', url: '/owner/health' })).statusCode, 401);
    assert.equal((await f.inject({ method: 'GET', url: '/owner/health', headers: { 'x-idlescape-mgmt': 'nope' } })).statusCode, 401);
});

test('a world with no secret registers no health route at all', async () => {
    const f = Fastify();
    registerOwnerBankRoutes(f, '');
    // 404 rather than 401: an engine that started without a secret is a different failure from one
    // that holds a different secret, and the front server's health field tells them apart.
    assert.equal((await f.inject({ method: 'GET', url: '/owner/health', headers: AUTH })).statusCode, 404);
});

test('the setup guard refuses every /setup path and leaves /prometheus open', async () => {
    const f = Fastify();
    registerSetupGuard(f, SECRET);
    f.get('/prometheus', async () => 'metrics');
    f.get('/setup', async () => 'page');
    f.get('/setup/config', async () => ({ db: { pass: 'secret' } }));
    f.put('/setup/config', async () => ({ ok: true }));

    assert.equal((await f.inject({ method: 'GET', url: '/prometheus' })).statusCode, 200);
    assert.equal((await f.inject({ method: 'GET', url: '/setup' })).statusCode, 401);
    assert.equal((await f.inject({ method: 'GET', url: '/setup/config' })).statusCode, 401);
    assert.equal((await f.inject({ method: 'PUT', url: '/setup/config', payload: {} })).statusCode, 401);
    // The body of a refusal must not leak what it was guarding.
    const refused = await f.inject({ method: 'GET', url: '/setup/config' });
    assert.equal(refused.body.includes('pass'), false);

    assert.equal((await f.inject({ method: 'GET', url: '/setup', headers: AUTH })).statusCode, 200);
    assert.equal((await f.inject({ method: 'GET', url: '/setup/config', headers: AUTH })).statusCode, 200);
    // A query string or a trailing path must not slip past the prefix match.
    assert.equal((await f.inject({ method: 'GET', url: '/setup/config?x=1' })).statusCode, 401);
});

test('a world with no secret has no setup page either', async () => {
    const f = Fastify();
    registerSetupGuard(f, '');
    f.get('/setup', async () => 'page');
    // authorised() refuses an empty configured secret, so a local world without one loses the
    // page rather than serving it to anyone. Edit data/config/world.json directly instead.
    assert.equal((await f.inject({ method: 'GET', url: '/setup', headers: AUTH })).statusCode, 401);
});
```

Add `registerSetupGuard` to the `from './management.js'` import at `:11`.

- [ ] **Step 2: Run them and watch them fail**

```bash
powershell -File scripts/engine-overlay.ps1
cd engine/server && npx tsx --test --test-force-exit src/idlescape/management.test.ts
```

Expected: FAIL, `registerSetupGuard is not exported` and 404 on `/owner/health`.

- [ ] **Step 3: Add both to `engine-custom/src/idlescape/management.ts`**

Inside `registerOwnerBankRoutes`, after the two existing routes:

```ts
    // The runtime proof that this overlay is in the running image and that both halves hold the
    // same secret. server/src/health.ts polls it on its own interval and reports the result as
    // HealthSnapshot.management, which the release gate requires (audit C07, decision D75).
    // Touches no store: `snapshot()` would cache an in-memory entry for whatever key it was given,
    // which is safe but is an odd thing to lean on every ten seconds in production.
    app.get('/owner/health', async (req, reply) => {
        if (!authorised(req.headers['x-idlescape-mgmt'], secret)) {
            return reply.status(401).send({ error: 'unauthorised' });
        }
        return { ok: true };
    });
```

and, as a new exported function beside it:

```ts
/**
 * Refuses every `/setup*` request without the shared secret.
 *
 * Upstream registers `GET /setup`, `GET /setup/config` and `PUT /setup/config` with no auth at all.
 * `GET /setup/config` returns loadWorldConfig() whole, including `db.pass` in plaintext, and the
 * PUT rewrites `node.production` and `build.verify`. The management app binds 0.0.0.0 in the
 * deployment (IDLESCAPE_MANAGEMENT_HOST), so until now the only thing between those routes and a
 * neighbouring container was the compose network split decision D74 put in as a mitigation.
 *
 * One onRequest hook rather than three per-route guards: a fourth upstream /setup route would
 * silently arrive unguarded, and engine-custom/src/web.ts is a whole-file replacement where every
 * added line is a line to re-merge on the next upstream bump.
 *
 * `/prometheus` is deliberately NOT guarded: server/src/health.ts polls it for the players gauge
 * and it carries no secret. With no ENGINE_MANAGEMENT_SECRET, authorised() refuses everything, so a
 * local world loses the setup page entirely and world.json is edited directly. That is the same
 * thing an empty secret already does to the bank routes.
 */
export function registerSetupGuard(app: FastifyInstance, secret: string = idlescapeConfig.managementSecret): void {
    app.addHook('onRequest', async (req, reply) => {
        // req.url carries the query string; match on the path only.
        const path = req.url.split('?')[0] ?? '';
        if (path !== '/setup' && !path.startsWith('/setup/')) {
            return;
        }
        if (!authorised(req.headers['x-idlescape-mgmt'], secret)) {
            return reply.status(401).send({ error: 'unauthorised' });
        }
    });
}
```

- [ ] **Step 4: Call the guard in `engine-custom/src/web.ts`**

The management app is created at `:321`. Register the guard **before** the routes it guards, so it
is a hook on the whole instance rather than something that depends on route order. Insert at
`:329`, immediately after the `FastifyView` registration and before `management.get('/prometheus')`:

```ts
// idlescape: upstream's three /setup routes have no auth, and GET /setup/config returns
// loadWorldConfig() whole (db.pass included). This hook refuses them without the shared secret;
// /prometheus stays open, because the front server polls it for the players gauge and it carries
// nothing sensitive. Audit C07; decision D74 mitigated this by compose topology and left the fix
// here. See engine-custom/PATCHES.md.
registerSetupGuard(management);
```

and add `registerSetupGuard` to the `#/idlescape/management.js` import at `:17`.

- [ ] **Step 5: Run the tests and watch them pass**

```bash
powershell -File scripts/engine-overlay.ps1
cd engine/server && npx tsx --test --test-force-exit src/idlescape/management.test.ts
cd ../.. && powershell -File scripts/engine-overlay.ps1 -Check
```

Expected: PASS, and the drift check clean.

- [ ] **Step 6: Make the change verifiable from the image, and correct the comment it falsifies**

**`engine-custom/PATCHES.md` has no patch table to add a row to.** Its only table is the management
route table at `:758-761`. Patches are recorded as prose sections headed
`### \`src/web.ts\` - <what and why>` (the existing one is at `:90`), and every claim is backed by a
`grep -c` line in the ```sh block under `## How to verify all patches are present` at `:803-845`,
which ends "(Each task appends its own grep lines here.)". Follow that, not a table.

Append a paragraph to the existing `### \`src/web.ts\`` section (its heading already reads
"the relayed owner assertion, and the management routes (hunks 1, 2, 3)"; make it hunks 1 to 4):

```
Hunk 4, anchored immediately after the `FastifyView` registration and before
`management.get('/prometheus', ...)`: one added statement, `registerSetupGuard(management);`, plus
`registerSetupGuard` on the existing `#/idlescape/management.js` import. Upstream registers
`GET /setup`, `GET /setup/config` and `PUT /setup/config` with no auth at all, and the config route
returns `loadWorldConfig()` whole including `db.pass` in plaintext (audit C07). One onRequest hook
rather than three per-route guards, so a fourth upstream `/setup` route cannot arrive unguarded.
`/prometheus` is deliberately not matched: server/src/health.ts polls it for the players gauge.
```

and add a line to the management-routes section for `GET /owner/health`, beside the two rows in the
table at `:758-761`:

```
| `GET /owner/health` | - | `{ ok: true }` | 401 `unauthorised` |
```

with a sentence under it saying it touches no store and exists so `HealthSnapshot.management` can
prove at runtime that the deployed image carries this overlay and that both halves hold the same
`ENGINE_MANAGEMENT_SECRET` (decision D75).

Then two lines in the verification block, in the same column style as the two `src/web.ts` lines
already at `:835-836`:

```sh
grep -c "registerSetupGuard(management);"  src/web.ts                       # 1
grep -c "'/owner/health'"                  src/idlescape/management.ts      # 1
```

`deploy/docker/engine.Dockerfile:94-101` already greps `src/web.ts` twice. Add a third to the same
`RUN` chain, in the same style, so an upstream bump that drops the line is a build failure with a
name on it:

```dockerfile
 && grep -qF "registerSetupGuard(management);" /opt/engine/server/src/web.ts \
```

and extend the comment block above it (`:82-93`) with the new line, matching its existing shape.

`deploy/docker/docker-compose.yml:15-21` records that the engine was moved onto its own network
**because** the `/setup*` routes are unauthenticated. That reason is now stale, and the network
split should stay for defence in depth rather than for a reason that is no longer true:

```yaml
# The engine sits on its own two-member network with `server` and nothing else. It was put there
# because binding the management port off loopback exposed three unauthenticated upstream /setup
# routes, one of which returns db.pass in plaintext (decision D74). Entry 2 authenticated those
# routes behind ENGINE_MANAGEMENT_SECRET, so the original reason is closed; the split stays as
# defence in depth, because the management port also carries routes that can move any account's
# items and nothing else on this box has any business reaching it.
```

`scripts/setup.ps1:56` mentions a world.json file "hand-edited via the /setup management page".
That page now needs the header. Add one sentence saying so, and that a local world with no
`ENGINE_MANAGEMENT_SECRET` has no setup page at all and edits `data/config/world.json` directly.

- [ ] **Step 7: Verify**

```bash
powershell -File scripts/engine-overlay.ps1
cd engine/server && npx tsx --test --test-force-exit src/idlescape/config.test.ts src/idlescape/management.test.ts
cd ../.. && powershell -File scripts/engine-overlay.ps1 -Check
grep -c "grep -qF" deploy/docker/engine.Dockerfile     # one more than before
```

Then prove the guard is really in the path, against a running engine rather than an injected
Fastify instance:

```bash
powershell -File scripts/start-stack.ps1 -Prod
curl -i http://127.0.0.1:8897/setup/config                                  # expect 401
curl -i -H "x-idlescape-mgmt: $(grep '^ENGINE_MANAGEMENT_SECRET=' server/.env | cut -d= -f2)" \
     http://127.0.0.1:8897/setup/config                                     # expect 200
curl -i http://127.0.0.1:8897/prometheus                                    # expect 200, still open
```

Stop the stack afterwards. Do not paste the secret into a commit, a log or a plan.

- [ ] **Step 8: Commit**

```bash
git add engine-custom/src/web.ts engine-custom/src/idlescape/management.ts \
        engine-custom/src/idlescape/management.test.ts engine-custom/PATCHES.md \
        deploy/docker/engine.Dockerfile deploy/docker/docker-compose.yml scripts/setup.ps1
git -c core.safecrlf=false commit -m "fix(engine): authenticate the three /setup routes, and add the overlay health route

Audit C07's remaining half. Upstream registers GET /setup, GET /setup/config and PUT /setup/config
with no auth, directly above the secret-gated bank routes. GET /setup/config returns
loadWorldConfig() whole, db.pass included; PUT rewrites node.production and build.verify. D74
mitigated this by moving the engine onto a two-member compose network and said the fix belonged
here.

One onRequest hook rather than three per-route guards: a fourth upstream /setup route would arrive
unguarded, and web.ts is a whole-file replacement where every added line is a line to re-merge.
/prometheus stays open, because the front server polls it for the players gauge.

GET /owner/health comes with it: registered only when a secret is set, behind the same constant-time
check, touching no store. Its three possible answers (200, 401, 404) are what the next commit turns
into HealthSnapshot.management, so one green field proves the overlay is in the running image, the
management link resolves, and both halves hold the same secret.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

### Task 10: The release gate can see the overlay (C07 remainder, server and deploy half)

D75 is explicit about the hole it left: `players` proves the front server reached the engine's
management port, but upstream 274 binds that port itself, so it is not proof of the overlay. The
overlay is asserted at build time by D73's manifest check; this is the runtime answer, and D75
parked it here by name.

**Files:**
- Modify: `server/src/types.ts:36-44`
- Modify: `server/src/health.ts:18,25-43,58`
- Modify: `server/src/health.test.ts`
- Modify: `server/src/index.ts:23`
- Modify: `deploy/lightsail/common.ps1:55-76`
- Modify: `scripts/verify.ps1:259-267` (repoint the existing probe)
- Modify: `deploy/lightsail/README.md`, `docs/VERIFICATION.md` (tier 3, what the gate still cannot see)

**Interfaces:**
- Consumes: Task 9's `GET /owner/health`.
- Produces: `HealthSnapshot.management: 'up' | 'unauthorized' | 'unconfigured' | 'down'`, and a
  fourth gap in `Get-HealthGaps`. Task 8's `HealthSnapshot` fixture factories each gain one field.

- [ ] **Step 1: Write the failing tests**

`server/src/health.test.ts` already has a `fakeFetch(status)` helper at `:4-9` that answers every
URL the same way. The management probe needs a fake that answers **per URL**, so add one:

```ts
function routedFetch(byPath: Record<string, number | 'throw'>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const key = Object.keys(byPath).find(p => url.includes(p));
    const status = key === undefined ? 404 : byPath[key]!;
    if (status === 'throw') throw new Error('ECONNREFUSED');
    return new Response('lostcity_active_players 3\n', { status });
  }) as unknown as typeof fetch;
}

const opts = (over: Partial<Parameters<typeof createHealth>[0]> = {}) => ({
  engineHttp: 'http://engine', engineManagementHttp: 'http://mgmt', engineManagementSecret: 'm'.repeat(32),
  intervalMs: 60_000, gateEnabled: true, wikiUp: () => true, ...over
});

describe('management health', () => {
  test('a 200 from the overlay health route is up', async () => {
    const h = createHealth(opts({ fetchImpl: routedFetch({ '/rs2.cgi': 200, '/prometheus': 200, '/owner/health': 200 }) }));
    await h.probe();
    expect(h.snapshot().management).toBe('up');
  });

  test('a 401 means the two halves hold different secrets', async () => {
    const h = createHealth(opts({ fetchImpl: routedFetch({ '/rs2.cgi': 200, '/prometheus': 200, '/owner/health': 401 }) }));
    await h.probe();
    expect(h.snapshot().management).toBe('unauthorized');
  });

  test('a 404 means the engine started without a secret, and reads the same to the gate', async () => {
    const h = createHealth(opts({ fetchImpl: routedFetch({ '/rs2.cgi': 200, '/prometheus': 200, '/owner/health': 404 }) }));
    await h.probe();
    expect(h.snapshot().management).toBe('unauthorized');
  });

  test('an unreachable management port is down, not unauthorized', async () => {
    const h = createHealth(opts({ fetchImpl: routedFetch({ '/rs2.cgi': 200, '/prometheus': 200, '/owner/health': 'throw' }) }));
    await h.probe();
    expect(h.snapshot().management).toBe('down');
  });

  test('no configured secret is unconfigured, and the route is never probed', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: string) => { seen.push(String(input)); return new Response('', { status: 200 }); }) as unknown as typeof fetch;
    const h = createHealth(opts({ engineManagementSecret: '', fetchImpl }));
    await h.probe();
    expect(h.snapshot().management).toBe('unconfigured');
    expect(seen.some(u => u.includes('/owner/health'))).toBe(false);
  });

  test('the secret never appears in the snapshot', async () => {
    const secret = 'm'.repeat(32);
    const h = createHealth(opts({ engineManagementSecret: secret, fetchImpl: routedFetch({ '/rs2.cgi': 200, '/prometheus': 200, '/owner/health': 200 }) }));
    await h.probe();
    expect(JSON.stringify(h.snapshot())).not.toContain(secret);
  });
});
```

Every existing `createHealth({...})` call in that file gains `engineManagementSecret: ''`, which is
why those tests keep passing with `management: 'unconfigured'`.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd server && bun test src/health.test.ts`
Expected: FAIL, `engineManagementSecret` is not a known option and `snapshot().management` is
`undefined`.

- [ ] **Step 3: Add the field**

`server/src/types.ts:36-44`:

```ts
export interface HealthSnapshot {
  engine: 'up' | 'down';
  engineUptimeMs: number;
  version: string;
  gateEnabled: boolean;
  gateway: 'up' | 'down' | 'not_deployed';
  players: number | null;
  wiki: 'up' | 'missing';
  /**
   * The engine overlay, answering on its own secret-gated route (audit C07, decision D75).
   * `up` proves three things at once: the running image carries engine-custom, ENGINE_MANAGEMENT_HTTP
   * reaches the engine, and both halves hold the same ENGINE_MANAGEMENT_SECRET. `unauthorized` is a
   * 401 (different secrets) or a 404 (an engine that started without one, so the route was never
   * registered). `unconfigured` means THIS server has no secret, which is a working local stack.
   * This response is public, so the value carries a status word and never a secret.
   */
  management: 'up' | 'unauthorized' | 'unconfigured' | 'down';
}
```

`server/src/health.ts`: add `engineManagementSecret: string` to the `opts` parameter at `:18`, a
`let management: HealthSnapshot['management'] = 'unconfigured';`, this block at the end of `probe()`
after the prometheus probe at `:37-42`, and `management` in the snapshot at `:58`:

```ts
    // The overlay's own route, which upstream 274 does not have. /prometheus above proves the
    // management PORT is reachable, but upstream binds that port itself, so it is not proof of the
    // overlay (decision D75). This is.
    if (opts.engineManagementSecret === '') {
      management = 'unconfigured';
    } else {
      try {
        const res = await fetchImpl(`${opts.engineManagementHttp}/owner/health`, {
          headers: { 'x-idlescape-mgmt': opts.engineManagementSecret },
          signal: AbortSignal.timeout(3000)
        });
        if (res.status === 200) management = 'up';
        else if (res.status === 401 || res.status === 404) management = 'unauthorized';
        else management = 'down';
      } catch {
        management = 'down';
      }
    }
```

`server/src/index.ts:23` passes it:

```ts
const health = createHealth({ engineHttp: env.engineHttp, engineManagementHttp: env.engineManagementHttp, engineManagementSecret: env.engineManagementSecret, intervalMs: 10_000, gateEnabled: env.gateEnabled, wikiUp: () => wikiDb !== null });
```

- [ ] **Step 4: Run the server suite**

```bash
cd server && bun run typecheck && bun test src/health.test.ts
```

Expected: PASS. `bun run typecheck` will also flag every other `HealthSnapshot` literal in
`server/src`; fix each by adding the field rather than by widening the type.

Then in `web/`, the same interface is **partly** mirrored in `web/src/types.ts:4`. Measured at HEAD,
the web mirror declares six members and the server declares seven: `wiki: 'up' | 'missing'` is on
the server only and the web has been behind since it was added. Add **both** fields here, in one
edit, with a one-line comment naming the server as the authority:

```ts
// Mirrors server/src/types.ts's HealthSnapshot, which is the authority. `wiki` and `management` are
// read by the release gate rather than by this shell, but the mirror carries them so a drifting
// fixture fails a typecheck here instead of at the gate.
export interface HealthSnapshot {
  engine: 'up' | 'down'; engineUptimeMs: number; version: string; gateEnabled: boolean;
  gateway: 'up' | 'down' | 'not_deployed'; players: number | null;
  wiki: 'up' | 'missing'; management: 'up' | 'unauthorized' | 'unconfigured' | 'down';
}
```

Then run:

```bash
cd web && npm run typecheck
```

Task 8's fixture factories are what make this a one-line change per file; if Task 8 has not run
yet, this is where the ratchet earns its keep. **Two named files will fail here for certain**:
`web/src/boot.test.ts`'s `snapshot()` factory (Task 2) and `web/src/panels/connect.test.ts`'s five
`HealthSnapshot` literals at `:31-32, :59-60, :85-86, :110-111, :139-140`. Each gains **both**
`wiki: 'up'` and `management: 'up'`, because Tasks 2 and 8 deliberately left `wiki` off the web-side
fixtures: it was not on the web interface until this step, and putting it there earlier would have
been a TS2353 error hidden by vitest's esbuild transpile until Task 7 built the program.

**Whatever else `npm run typecheck` names, fix it and add it to Step 9's `git add`.** The list above
is what was measured, not a promise about what you will see.

- [ ] **Step 5: Require it at the release gate**

`deploy/lightsail/common.ps1:69-76`:

```powershell
  if ($Body -notmatch '"management"\s*:\s*"up"') { $gaps += 'management (the running engine image is not carrying engine-custom, or the two halves hold different ENGINE_MANAGEMENT_SECRETs, or the front server cannot reach the management port; "unconfigured" means the front server has no secret at all)' }
```

and rewrite the comment block at `:55-68`, which currently says the gate cannot see whether the
image carries the overlay and that the runtime half is "left with entry 2". It can now:

```powershell
#   management is "up" only when the engine answers ITS OWN secret-gated route, GET /owner/health,
#            which upstream 274 does not have. One green field therefore proves three things at
#            once: the running image carries engine-custom, ENGINE_MANAGEMENT_HTTP reaches the
#            engine, and both halves hold the same ENGINE_MANAGEMENT_SECRET. This closes the hole
#            decision D75 named: players proves the management PORT is reachable, but upstream
#            binds that port itself, so it was never proof of the overlay.
```

- [ ] **Step 6: Repoint `verify.ps1`'s existing probe**

`verify.ps1:259-267` probes `GET {mgmtBase}/owner/verifyprobe/bank` with the header and requires
200. That works, but it goes through `ownerBank.ts`'s `snapshot()`, which caches an in-memory entry
for a fake owner key. There should be one answer to this question, not two, so point it at the new
route in the same commit:

```powershell
        $probe = try {
            (Invoke-WebRequest -Uri "$mgmtBase/owner/health" -Headers @{ 'x-idlescape-mgmt' = $mgmtSecret } -UseBasicParsing -TimeoutSec 5).StatusCode
        } catch {
            if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode.value__ } else { -1 }
        }
```

The failure message at `:265` already spells out what each status means; keep it and change
`owner-bank management port` to `owner health route`. Do not print the secret; the existing block's
comment at `:246-251` states that rule and it still holds.

- [ ] **Step 7: Say what the gate still cannot see**

D75 stated its own limits, and this must too. Add to `deploy/lightsail/README.md` and to
`docs/VERIFICATION.md`'s tier 3 section, as a list:

```
Even with all four health fields green, the release gate does not see:

- Whether the engine image carries the CONTENT overlay. There is no health field for it, and
  scripts/content-overlay.ps1 -Check exits 0 even on drift (false green 1). Entry 3's ground.
- Whether either pinned clone matches scripts/upstream.lock at build time. engine.Dockerfile and
  the wiki stage take shas as build args and fail without them, but nothing compares the running
  image's shas to the lock. Entry 3, audit C23.
- Whether the client fork's 28 numbered patches are present. Greps run by hand. Entry 3, audit C24.
- Whether the deployed bundle is the bundle that was verified. release.ps1 ships HEAD and warns
  about dirty tracked files under deploy/, but nothing ties an image to a verified commit.
```

- [ ] **Step 8: Verify**

```bash
cd server && bun run typecheck && bun test
cd ../web && npm run typecheck && npx vitest run
```

Then against a real stack, which is the only thing that proves the two halves agree:

```bash
powershell -File scripts/start-stack.ps1 -Prod
curl -s http://localhost:8787/api/health | grep -o '"management":"[a-z]*"'   # expect "up"
```

Then prove the field can be wrong: stop the engine, wait for the ten-second interval, and confirm
the field turns `down`; start it with a deliberately different `ENGINE_MANAGEMENT_SECRET` and
confirm `unauthorized`. A health field nobody has seen go red is a health field nobody should
trust. Also confirm the secret is not in the body:

```bash
curl -s http://localhost:8787/api/health | grep -c "$(grep '^ENGINE_MANAGEMENT_SECRET=' server/.env | cut -d= -f2)"   # expect 0
```

- [ ] **Step 9: Commit**

```bash
git add server/src/types.ts server/src/health.ts server/src/health.test.ts server/src/index.ts \
        web/src/types.ts web/src/boot.test.ts web/src/panels/connect.test.ts \
        deploy/lightsail/common.ps1 deploy/lightsail/README.md \
        scripts/verify.ps1 docs/VERIFICATION.md
git -c core.safecrlf=false commit -m "feat(health): the release gate can see whether the running image carries the overlay

Audit C07's runtime half, which decision D75 parked here by name. The gate required engine, players
and wiki, and D75 said out loud that players proves the management PORT is reachable but upstream
274 binds that port itself, so it was never proof of the overlay.

HealthSnapshot gains management: up, unauthorized, unconfigured or down, answered by GET
/owner/health, a route only the overlay registers and only when a secret is set. One green field
proves the image carries engine-custom, ENGINE_MANAGEMENT_HTTP reaches the engine, and both halves
hold the same secret, which is the live failure the audit escalated. /api/health stays public
because cutover.ps1 polls it through the public hostname, so the field carries a status word and
never a secret.

verify.ps1's existing probe moves to the same route, so there is one answer to this question rather
than two, and the deploy README records the four things the gate still cannot see.

web/src/types.ts's mirror of HealthSnapshot gains management and also wiki, which it had been
missing since the wiki field was added on the server side.

Append to this git add whatever else `bun run typecheck` and `npm run typecheck` named; the two web
test files above are the ones measured, not the whole list. `git status --short` must be empty
before Task 12 runs.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

### Task 11: The proxy stops caching failures, and the front server logs a request (C07, the two small ones)

`server/src/proxy/http.ts:11` sets `cache-control: public, max-age=3600` unconditionally and then
passes `upstream.status` through at `:12`, so a 404 or 502 from an engine mid-restart is cached at
Cloudflare for an hour on the cache-archive paths. And `server/src/index.ts` has exactly one
`console.log`, at `:124`, the startup line, so `box/logs.sh` on a live incident shows one boot line.

**Files:**
- Create: `server/src/log.ts`
- Create: `server/src/log.test.ts`
- Modify: `server/src/proxy/http.ts:8-12`
- Modify: `server/src/proxy/http.test.ts`
- Modify: `server/src/index.ts:46-120`

**Interfaces:**
- Consumes: nothing from Tasks 9 or 10.
- Produces, from `server/src/log.ts`:
  - `interface RequestLog { method: string; path: string; status: number; ms: number; kind: string }`
  - `shouldLog(kind: string, status: number): boolean`
  - `requestLine(entry: RequestLog): string`

- [ ] **Step 1: Write the failing tests**

Add to `server/src/proxy/http.test.ts`, whose `beforeAll` already serves `/crc` (200), `/boom`
(500) and everything else 404:

```ts
  test('a successful response is cached for an hour', async () => {
    const res = await proxyHttp(env, new Request('http://front/crc'));
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  test('an upstream error is never cached', async () => {
    // An engine mid-restart 404s and 502s. Caching those for an hour at the edge outlives the
    // restart by a long way, and the cache-archive paths are exactly where it hurts (audit C07).
    for (const path of ['/boom', '/missing']) {
      const res = await proxyHttp(env, new Request(`http://front${path}`));
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });

  test('the 502 this server invents is not cached either', async () => {
    const dead = loadEnv({ GATE_ENABLED: 'false', ENGINE_HTTP: 'http://127.0.0.1:1' });
    const res = await proxyHttp(dead, new Request('http://front/crc'));
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
```

Create `server/src/log.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { requestLine, shouldLog } from './log';

describe('request log', () => {
  // The kind names below are the members of server/src/router.ts's `Route` union, re-read at HEAD.
  // Inventing one ('proxy' is not a member) makes a test that asserts nothing about this server.
  test('the five kinds a client boot floods are not logged when they succeed', () => {
    expect(shouldLog('static', 200)).toBe(false);   // /assets/*
    expect(shouldLog('index', 200)).toBe(false);    // /
    expect(shouldLog('page', 200)).toBe(false);     // /play.html, /styleguide
    expect(shouldLog('client', 200)).toBe(false);   // /client/client.js and friends
    expect(shouldLog('cache', 200)).toBe(false);    // /crc, /title, /config, ... and every .mid
    expect(shouldLog('static', 304)).toBe(false);
    expect(shouldLog('cache', 304)).toBe(false);
  });

  test('a failing one of those is logged, because that is the incident', () => {
    expect(shouldLog('static', 404)).toBe(true);
    expect(shouldLog('static', 502)).toBe(true);
    expect(shouldLog('client', 404)).toBe(true);
    expect(shouldLog('cache', 502)).toBe(true);
  });

  test('every other route is logged whatever it answers', () => {
    for (const kind of ['health', 'gate', 'pair', 'bankHook', 'characters', 'bank', 'wiki', 'wikiApi', 'notfound']) {
      expect(shouldLog(kind, 200)).toBe(true);
    }
  });

  test('the line is one line of JSON with no newline inside it', () => {
    const line = requestLine({ method: 'POST', path: '/api/gate', status: 401, ms: 12, kind: 'gate' });
    expect(line.includes('\n')).toBe(false);
    expect(JSON.parse(line)).toEqual({ t: 'req', method: 'POST', path: '/api/gate', status: 401, ms: 12, kind: 'gate' });
  });

  test('a query string never reaches the log', () => {
    // Pairing tokens and gate values travel in query strings on some paths; the log is not the
    // place to persist one.
    const line = requestLine({ method: 'GET', path: '/api/pair?token=secret-value', status: 200, ms: 1, kind: 'pair' });
    expect(line).not.toContain('secret-value');
    expect(JSON.parse(line).path).toBe('/api/pair');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
cd server && bun test src/proxy/http.test.ts src/log.test.ts
```

Expected: `cache-control` is `public, max-age=3600` on the error cases, and `./log` does not exist.

- [ ] **Step 3: Fix the proxy**

`server/src/proxy/http.ts:8-12`:

```ts
    const headers = new Headers();
    const ct = upstream.headers.get('content-type');
    if (ct) headers.set('content-type', ct);
    // Only a success is cacheable. An engine mid-restart answers 404 or 502, and an hour of edge
    // caching outlives the restart by a very long way on exactly the cache-archive paths a client
    // cannot start without (audit C07).
    const ok = upstream.status >= 200 && upstream.status < 300;
    headers.set('cache-control', ok ? 'public, max-age=3600' : 'no-store');
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return new Response('engine unreachable', { status: 502, headers: { 'cache-control': 'no-store' } });
  }
```

- [ ] **Step 4: Write `server/src/log.ts`**

```ts
// One structured line per request. Audit C07: the front server had exactly one console.log, the
// startup line, so box/logs.sh during a live incident showed a boot message and nothing else.
//
// Static assets and the index are excluded WHEN THEY SUCCEED, because a client boot fetches enough
// of them to bury everything else; a failing one is the incident and is logged. One line of JSON so
// the shape is parseable and so a multi-line body can never be mistaken for several entries.

export interface RequestLog {
  method: string;
  path: string;
  status: number;
  ms: number;
  kind: string;
}

// Read off server/src/router.ts's classify(), not guessed: 'static' is /assets/* (:68-71), 'index'
// is / (:33), 'page' is /play.html and /styleguide (:34-36), 'client' is /client/* (:64-67), and
// 'cache' is every .mid plus every CACHE_PREFIXES path, /crc /title /config /interface /media
// /versionlist /textures /wordenc (:61, server/src/types.ts:4). One client boot is hundreds of
// 'client' and 'cache' requests; excluding only 'static' and 'index' would log exactly the flood
// this set exists to prevent, and the log would be turned off again within a week. A failure is
// still logged whatever its kind, so a 404 storm on /client/* stays visible.
const QUIET_KINDS = new Set(['static', 'index', 'page', 'client', 'cache']);

export function shouldLog(kind: string, status: number): boolean {
  if (status >= 400) return true;
  return !QUIET_KINDS.has(kind);
}

export function requestLine(entry: RequestLog): string {
  // The query string is dropped: pair tokens and gate values travel there on some paths, and a log
  // is the wrong place to persist one.
  const path = entry.path.split('?')[0] ?? entry.path;
  return JSON.stringify({ t: 'req', method: entry.method, path, status: entry.status, ms: entry.ms, kind: entry.kind });
}
```

- [ ] **Step 5: Emit it from `server/src/index.ts`**

The fetch handler is `:46-120` and every branch returns a `Response`, so wrap rather than edit
sixteen return sites. Rename the existing handler body to an inner function and log around it:

```ts
  async fetch(req, srv) {
    const url = new URL(req.url);
    const isUpgrade = req.headers.get('upgrade')?.toLowerCase() === 'websocket';
    const route = classify(url.pathname, isUpgrade);
    const started = Date.now();
    const res = await handle(req, srv, url, route, isUpgrade);
    // A websocket upgrade returns undefined from Bun's handler; there is nothing to time or log.
    if (res && shouldLog(route.kind, res.status)) {
      console.log(requestLine({ method: req.method, path: url.pathname, status: res.status, ms: Date.now() - started, kind: route.kind }));
    }
    return res;
  },
```

Read `:46-120` before doing this: the websocket branch at `:110-117` calls `srv.upgrade` and its
return type is not a plain `Response` on every path, so `handle`'s signature has to admit whatever
the existing switch actually returns. Do not widen it to `any`; if the union is awkward, give
`handle` an explicit return type naming both members.

- [ ] **Step 6: Verify**

```bash
cd server && bun run typecheck && bun test
```

Then against a running stack, confirm the log says something useful and does not flood:

```bash
powershell -File scripts/start-stack.ps1 -Prod
curl -s http://localhost:8787/api/health > /dev/null
curl -s -o /dev/null http://localhost:8787/client/client.js
curl -s -o /dev/null http://localhost:8787/client/does-not-exist.js
tail -20 logs/server.log
```

Expected: one line for `/api/health` (kind `health`, not quiet), **no** line for the successful
`client.js` (kind `client`, quiet), and one line for the 404 on `/client/does-not-exist.js`, which
is kind `notfound` and would be logged even if it were not. Then the assertion that matters, that
the quiet set actually covers a real client boot: load `http://localhost:8787/` in a browser, wait
for the client to finish fetching, and check that the tail has not grown by more than a handful of
lines. If it has grown by hundreds, `QUIET_KINDS` is missing a kind the router produces; re-read
`classify()` rather than adding the kind you saw. Confirm the log file path against
`scripts/start-stack.ps1` before running the tail.

- [ ] **Step 7: Commit**

```bash
git add server/src/log.ts server/src/log.test.ts server/src/index.ts \
        server/src/proxy/http.ts server/src/proxy/http.test.ts
git -c core.safecrlf=false commit -m "fix(server): stop caching upstream failures for an hour, and log a request

Audit C07's two same-release extras.

proxyHttp set cache-control: public, max-age=3600 unconditionally and then passed the upstream
status through, so a 404 or 502 from an engine mid-restart was cached at the edge for an hour on the
cache-archive paths a client cannot start without. Only a 2xx is cacheable now; everything else,
including the 502 this server invents when the engine is unreachable, is no-store.

The front server had exactly one console.log, the startup line, so box/logs.sh during an incident
showed a boot message and nothing else. One JSON line per request now, excluding successful static
assets and the index because a client boot buries everything else in them, and including every
status of 400 or more whatever the route. Query strings are dropped: pair tokens travel there.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

### Task 12: Run the whole gate, and reconcile the audit's rows

The entry is not done because eleven commits landed. It is done when the gate this entry built runs
end to end and every audit row it touched has an honest answer.

**Files:**
- Create: `docs/superpowers/ledgers/2026-09-07-release-integrity-and-account-isolation.md`
- Modify: `docs/superpowers/specs/2026-09-07-project-audit.md` (one appended line, ruling R23)
- Modify: `docs/superpowers/sprint-control.md` (entry 2 closed)
- Modify: whatever the Step 3 sweep finds

**Interfaces:**
- Consumes: every task.
- Produces: a promoted ledger under 400 lines, per `docs/superpowers/SDD.md`.

- [ ] **Step 1: Run `verify.ps1` end to end, once, from a clean tree**

```bash
git status --short          # must be empty
powershell -File scripts/verify.ps1
```

Expected: ten steps, all green, ending in `verify passed`. Budget the full runtime; this is the
first run that includes the wiki build and the two new static gates.

If a step fails, fix it in the task that owns it and re-run the whole script, not the step. A gate
that is only ever run in pieces is the defect this entry exists to close.

- [ ] **Step 2: Build the server image once more, with the final tree**

```bash
ENGINE_SHA=$(grep '^engine/server ' scripts/upstream.lock | cut -d' ' -f2)
CONTENT_SHA=$(grep '^engine/content ' scripts/upstream.lock | cut -d' ' -f2)
docker build -f deploy/docker/server.Dockerfile \
  --build-arg ENGINE_SHA="$ENGINE_SHA" --build-arg CONTENT_SHA="$CONTENT_SHA" \
  --build-arg VITE_FIREBASE_API_KEY=x --build-arg VITE_FIREBASE_AUTH_DOMAIN=x \
  --build-arg VITE_FIREBASE_PROJECT_ID=x --build-arg VITE_FIREBASE_APP_ID=x \
  --build-arg VITE_FIREBASE_MESSAGING_SENDER_ID=x -t idlescape-server:entry2-final .
docker run --rm idlescape-server:entry2-final ls -la /app/wiki/build/wiki.db
docker image inspect idlescape-server:entry2-final --format '{{.Size}}'
```

Record the image size in the ledger. **Do not release, do not run `cutover.ps1`, do not touch the
box.** G5.

- [ ] **Step 3: Sweep the documents for claims this entry falsified**

Each task corrected the documents it broke. This is the check that none were missed:

```bash
# The step count moved three times, so an INTERMEDIATE number left behind is as wrong as the
# original. Match every spelling and every [n/m] label, not just "seven steps" and [1/7].
git grep -nE "(seven|eight|nine) steps|\[[0-9]+/[0-9]+\] "
git grep -n "does not build the wiki\|not in .verify.ps1\|measure a line count"
git grep -n "Nothing is enforcing the 400-line ceiling\|Not enforced.*C16"
git grep -n "outside every gate" -- docs/
git grep -n "503s forever" -- docs/
git grep -n "cs\.plugin\.[a-z]\|cs\.script\.[a-z]" -- web/ | grep -v "\.u\.\|\.anon\.\|cs\.other"
git grep -n "osrs.scotho.com" -- web/src client/src
git grep -n "\.superpowers/sdd" -- ':!.superpowers' ':!docs/superpowers/specs/2026-09-07-project-audit.md'
```

All but the last must return nothing outside `docs/superpowers/specs/2026-09-07-project-audit.md`
and older plans and ledgers, which are historical records and stay as written. The `[n/m]` pattern
will legitimately hit `scripts/verify.ps1`'s own `Write-Step` output format and older plans; read
each hit rather than assuming. The last grep is `docs/README.md` section 7's standing check: every
hit must be an instruction about where a live workspace goes, never a citation of one as an
authority for a fact.

- [ ] **Step 4: Write the ledger**

Create `docs/superpowers/ledgers/2026-09-07-release-integrity-and-account-isolation.md`, under 400
lines, with these sections:

1. **What actually shipped**, one paragraph per task, naming the commit sha.
2. **The audit reconciliation table**, one row per C-id this entry touched. Fill it from what you
   observed, not from what the plan predicted:

   | Finding | State after entry 2 | Where | Left open |
   |---|---|---|---|
   | C07 | closed | the deploy half in `ca8ef86` (D73, D74) asserted here; `/setup` guard and `GET /owner/health` in Task 9; `management` health field and the fourth gate gap in Task 10; proxy `no-store` and the request log in Task 11 | nothing |
   | C09 | closed | build and verify steps plus the `contentSha` drift gate in Task 4; the `wiki-build` image stage in Task 5 | a hand-edited data file is caught only by the tier 3 `--check-full` |
   | C10 | closed for the two stores the entry names | `web/src/storage/scoped.ts` and both stores in Task 1 | the adjacent unscoped keys, out of scope by ruling R4: `cs.panel`, `cs.size`, `cs.filter`, `cs.tasks.settings` and the three `cs.bank.*` keys are display preferences; **`cs.pl.<id>.<k>` (`PluginContext.storage`) is the same defect and waits only because no builtin plugin calls it at HEAD**; `cs.<k>` is entry 4's C21 |
   | C16 | closed | `scripts/line-ceiling.ps1` in Task 6; `web/tsconfig.test.json` and the client typecheck in Task 7; the backlog in Task 8 | `web/styleguide.html` and five other exemptions, all listed in the script's header |
   | C17 | closed | the escalation in `ca8ef86` (D74) asserted here; templates, the missing `engine-custom/.env.example`, the 8899 defaults and the two bundle literals in Task 3; the footer password in Task 2; the `.env.example` set-equality test and the `provision.ps1` written-plus-declared test in Task 3 Steps 5 and 8b | rotating the deployed gate password is an owner action under G5. Note `provision.ps1` still writes a hand-kept nine-key list rather than generating from the template; the test makes an omission fail loudly, it does not make the generator derive from the template |
   | C18 | closed | `web/src/boot.ts` and the rewiring in Task 2 | `main.ts` still cannot be imported under jsdom; entry 4 opens it |
   | C08 | closed by entry 1 | `1271319`, `2f5dce7` (D15) | nothing |
   | C21 | untouched | entry 4 | the bare `cs.<k>` accessor in `web/src/tasks/wire.ts` |
   | C23, C24 | untouched | entry 3 | clone-sha and client-patch verification at build time |

3. **Rulings**, R1 to R23 from this plan, each with what actually happened to it: held, revised, or
   overtaken by what the code turned out to be. A ruling that was wrong is more useful written down
   than quietly dropped.
4. **Fix rounds and deferred minors**, in the SDD convention's shape.
5. **The numbers**, measured rather than predicted: the web test typecheck backlog Task 7 found and
   Task 8 cleared, the client typecheck result, the file count `line-ceiling.ps1` scans, the wiki
   database size, the server image size, and the `verify.ps1` wall-clock time.

- [ ] **Step 5: Point the audit at the ledger, without rewriting it**

Ruling R23: the audit is the historical record of the state this entry was built from, and
rewriting its C-rows destroys the evidence. Append **one** block at the very end of
`docs/superpowers/specs/2026-09-07-project-audit.md`:

```markdown
## Remediation status

This document records the state of the repository on 2026-09-07, before sprint entry 2 ran, and is
not updated as findings close. What has since happened to each finding is recorded in the entry
that closed it:

- C07, C09, C10, C16, C17, C18: sprint entry 2,
  `docs/superpowers/ledgers/2026-09-07-release-integrity-and-account-isolation.md`.
- C01 to C06, C08: sprint entry 1, `docs/superpowers/ledgers/2026-09-06-sp4b-bot-expansion.md`.
```

Add any other entry's ledger that exists by the time this runs; check `ls docs/superpowers/ledgers/`
rather than copying this list.

- [ ] **Step 6: Close the row on the board**

`docs/superpowers/sprint-control.md`: mark entry 2 done with the date, the closing commit and a
one-line result, in whatever shape the file already uses for entry 1's row. Note in the same line
that **the release gate can now go green and has not been run**, so the owner knows G5 is the only
thing left between this work and the live site.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/ledgers/2026-09-07-release-integrity-and-account-isolation.md \
        docs/superpowers/specs/2026-09-07-project-audit.md \
        docs/superpowers/sprint-control.md
git -c core.safecrlf=false commit -m "docs(entry2): promote the ledger and reconcile the audit's rows

verify.ps1 ran end to end at ten steps, and the server image built with the wiki stage. Six audit
findings closed (C07, C09, C10, C16, C17, C18), with what each left open recorded rather than
implied. The audit itself is not rewritten: it is the record of the state this entry was built
from, and it now points at the ledger instead.

The release gate can go green for the first time since D75 made it require the wiki. Running it is
owner-gated as G5 and has not been done.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Notes for the executor

### Dependency order

Strictly sequential. One working tree, and most tasks touch a file another task also touches.

```
1 C10 account isolation        (web/src stores; touches main.ts)
 -> 2 C18 boot and health      (main.ts again; also takes C17's footer literal)
      -> 3 C17 env and literals (server env, templates, the two host literals)
           -> 4 C09 wiki in the gates      (build.ps1, verify.ps1, Write-Step)
                -> 5 C09 wiki in the image (server.Dockerfile, compose)
                     -> 6 C16 line ceiling      (verify.ps1, $TotalSteps 8 -> 9)
                          -> 7 C16 typechecks   (verify.ps1, $TotalSteps 9 -> 10)
                               -> 8 C16 the backlog
                                    -> 9 C07 engine half   (engine-custom, PATCHES, Dockerfile)
                                         -> 10 C07 server half (HealthSnapshot.management)
                                              -> 11 C07 the two small ones
                                                   -> 12 verify end to end, ledger, reconcile
```

The hard edges, the ones that break if reordered:

- **2 after 1.** Both edit `web/src/main.ts`. Task 1 adds two lines at the top; Task 2 rewrites the
  bottom third. Doing them at once produces a diff no reviewer can gate.
- **3 after 2.** The gate password literal at `main.ts:264` is C17's finding but lives in the fps
  block Task 2 rewrites, so Task 2 takes it (ruling R10) and Task 3 must not reopen the file.
- **5 after 4.** Task 4 proves `bun run --cwd wiki build` works on this machine. Debugging it
  inside a Docker layer first would cost hours.
- **6 before 7.** Task 6 introduces the `$TotalSteps` bump pattern that Task 7 follows, and Task 8
  adds lines to two test files at 396 and 394, which is exactly what Task 6's ceiling is for.
- **8 after 7.** The wiring commit must not be a 30-file diff, and a reviewer must be able to accept
  the check and reject a fix.
- **10 after 9.** Task 10's health probe calls the route Task 9 registers. Without it the field is
  `unauthorized` forever and the tests would be written against a fiction.
- **12 last.** It runs the gate the other eleven built.

### What can run in parallel

**Nothing, and that is the honest answer.** One working tree, no worktrees (decision D5), and the
overlap is real rather than theoretical: Tasks 1, 2 and 3 all touch `web/src/main.ts`; Tasks 4, 6, 7
and 10 all touch `scripts/verify.ps1`; Tasks 5 and 9 both touch `deploy/docker/docker-compose.yml`;
Tasks 3, 9 and 12 all touch documents in `docs/`.

If a later session insists on parallelism, the only pair with genuinely no shared file is **Task 9
and Task 11** (engine overlay versus `server/src/proxy` plus `server/src/log.ts`), and even then
Task 10 sits between them in the dependency chain, so the saving is one task's latency against the
merge risk of a shared branch. It is not worth it.

### The worktree junction hazard

From `docs/superpowers/specs/2026-09-06-sprint-handoff.md` section 4, and it has cost real time
twice: `git worktree remove` follows `node_modules` junctions and wipes the main tree's installs.
Unlink from PowerShell and verify before removing, and copy `web/.env.local` and `server/.env` into
any new worktree. Procedure and recovery are in `docs/OPERATIONS.md`. **This plan asks for no
worktree**, and D5 says execution runs sequentially in the main tree.

### Where the gate is red on purpose, and for how long

- From HEAD until **Task 5** lands, the release gate cannot pass: D75 requires `"wiki":"up"` and
  the database is not in the image. That is intended and is the point of the entry.
- From **Task 7** until **Task 8** lands, `verify.ps1`'s **web step (typecheck, lint, vitest)** is
  red at roughly 109 typecheck errors. Name the step by what it does, not by its number: it is
  `[4/7]` at HEAD, but Task 6 inserts the line ceiling ahead of it and Task 7 inserts the client
  typecheck, so by the time it goes red it prints `[6/10]`. Quoting a number here is the failure
  ruling R14 exists to remove. That redness is intended, and the two tasks are dispatched back to
  back. Do not skip the step to make the gate green; a skipped check is the defect this entry
  exists to close.
- After **Task 10**, the gate requires a fourth field, `"management":"up"`. A local stack with no
  `ENGINE_MANAGEMENT_SECRET` reads `unconfigured`, which is honest and is not a failure of anything
  local; only the deployment gate requires `up`.

### Things that will bite

1. **`web/src/main.ts` is 358 lines at HEAD and three tasks open it, and it does NOT shrink.** Task
   1 adds about seven lines, Task 2 removes about 31 and adds about 27, and Task 3 changes one line
   in place, so it lands near **361**. The order is still safe, because Task 6's ceiling of 400 does
   not start enforcing until after Task 5 and 361 clears it comfortably, but do not budget on
   headroom that is not there: an earlier draft of this plan claimed a shrink to about 310 and it
   was wrong. Task 2 Step 7 carries the arithmetic. Check `wc -l` after every task that touches it.
2. **jsdom arms a timer on every `localStorage` write.** `web/src/tasks/toggles.test.ts:159` and
   `:166` document this and assert `vi.getTimerCount()` as a **delta** (`armed - 1`), not an
   absolute. (`:39-42` is an unrelated debounce assertion; an earlier draft cited it by mistake.)
   Task 1's migration writes N keys and arms N timers; any timer assertion near it stays a delta.
3. **`web/src/test/setupDom.ts` is one line and runs once per file, not per test**
   (`web/vitest.config.ts:11`). It does not touch `localStorage`. Both store suites clear it in
   their own `beforeEach`, and `web/src/storage/scoped.test.ts` must too, or it inherits keys from
   the test above it.
4. **One harness file is not named `*.harness.ts`.**
   `web/src/tasks/library/tutorialIsland/harness.ts` has no infix, so Task 7's include needs both
   `src/**/*.harness.ts` and `src/**/harness.ts`.
5. **PowerShell 5.1 has no `&&`, no ternary and no `??`**, and under
   `$ErrorActionPreference = 'Stop'` a native command's stderr becomes a terminating error;
   `scripts/verify.ps1:101-106` is the worked example of the workaround.
6. **`engine-custom/` changes need three things, not one**: a `manifest.json` entry (for a new
   file), a `PATCHES.md` row with a verifying grep, and a matching `RUN grep` in
   `deploy/docker/engine.Dockerfile`. `verify.ps1` step 1 fails on an untracked manifest path.
   `engine-custom/.env.example` is the exception: it is documentation that stays in this directory
   and must **not** be in the manifest.
7. **`wiki:build` is not self-contained.** `wiki/gen/extract.ts:78-81` silently runs a full extract
   when `loc-spawns.json` is missing, and that needs `engine/content` checked out at the pinned sha.
   The first `build.ps1` on a machine that has never extracted pays that cost inside what is
   otherwise a two-minute step.
8. **Never run Playwright from the repository root.** It reports "No tests found" and exits 0.
9. **Never run `npm run build` in `web/` for an e2e run.** It builds against real Firebase;
   `npm run build:e2e` is the one Playwright needs.
10. **Start the Firebase emulators from PowerShell `Start-Process`, never a bash subshell.**

### Stop conditions

Stop and ask the owner if any of these appears; they are the sprint handoff's own list plus this
entry's two:

- Anything that would touch the Lightsail box, the live site, Cloudflare or the tunnel. **G5.** The
  release gate going green is a result to report, not a permission to release.
- `client/src/client/Client.ts` needing a change. That is a numbered patch and this entry has none.
- A wiki image layer that does not fit the box's disk, or a build that cannot pin `CONTENT_SHA`.
- Task 8's backlog turning out to need a genuine `as unknown as` to fix. It should not; if it does,
  say which finding and why rather than shipping the cast quietly.
- The client fork's pristine tree failing `tsc --noEmit` (Task 7 Step 1). Ship the scoped config the
  step describes and record the count; do not skip the step.

### What this entry does not close

Say it out loud in the ledger rather than letting a green gate imply it:

- The content overlay's presence in the engine image has no health field, and
  `scripts/content-overlay.ps1 -Check` exits 0 even on drift. **Entry 3.**
- Nothing compares either pinned clone's sha to `scripts/upstream.lock` at build time. **Entry 3,
  audit C23.**
- The client fork's 28 numbered patches are verified by hand. **Entry 3, audit C24.**
- Nothing ties a deployed image to a commit that passed `verify.ps1`.
- The `cs.` keys next to the two this entry scoped are still unscoped (ruling R4). `cs.panel`,
  `cs.size`, `cs.filter`, `cs.tasks.settings` and the three `cs.bank.*` keys are per-browser display
  preferences, which is why they wait. **`cs.pl.<id>.<k>` is not**: it is `PluginContext.storage`,
  it is on exactly C10's defect, and it waits only because no builtin plugin calls it at HEAD
  (`git grep -n "storage\." -- web/src/plugins/builtin` returns nothing). **The first plugin that
  uses `ctx.storage` must scope it through `web/src/storage/scoped.ts`**; entry 4's C21 work is
  where it is meant to land. `cs.<k>` in `web/src/tasks/wire.ts` is **entry 4's C21**.
- `deploy/lightsail/provision.ps1` still writes the box's `server.env` from a hand-kept list rather
  than generating it from `server/.env.example`. Task 3's second template test makes a silent
  omission impossible, which is the failure that mattered, but the two lists are still two lists.
