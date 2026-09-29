# Script API reference, and the standard - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the script API a decided, documented, gated surface: apply the twelve-rule standard and its nine phase-now proposals to the runtime, give every member we own a doc comment, generate `web/src/agent/API.md` and `web/src/agent/api-index.json` from the real types with a byte-compare drift gate in `scripts/build.ps1`, publish seven prose pages and nine worked examples that compile as tests, and serve both artefacts at `GET /api/agent/docs` and `GET /api/agent/docs.json`.

**Architecture:** Four layers, bottom up. (1) *The surface*: `web/src/tasks/scriptContext.ts` holds the `ScriptContext` interface and every named options bag, `web/src/tasks/types.ts` re-exports it so no import site moves, and the phase-now proposals land as factory modules (`tasks/wait.ts`, `tasks/dialog.ts`, `tasks/retry.ts`, `tasks/botExtras.ts`) injected into `createWorkerContext`, because `workerContext.ts` at 294 lines and `worker.ts` at 397 cannot absorb them. (2) *The declaration*: `web/src/tasks/scriptApiKeys.ts` is the one `Record<keyof ScriptContext, true>`, `web/src/tasks/scriptApi.ts` is the one re-export entry that says what a script may see, and `web/src/tasks/standard.ts` is the machine-readable form of the standard. (3) *The generator*: `web/src/tasks/gen/apiIndex.ts` walks that entry with the TypeScript compiler API and `web/src/tasks/gen/render.ts` turns the index into markdown, both inside `web/`'s own program so the pinned compiler resolves and vitest can test them; `scripts/gen/apiDocs.ts` is argv and file IO only. (4) *The readers*: two exact-path server routes over one `readAgentDocs` seam, six gates, and a wiki pointer page.

**Tech Stack:** Vite plus vanilla TypeScript (`web/`), strict mode; the TypeScript compiler API 5.9.3 from `web/node_modules` (its first use anywhere in this repository); Bun for `scripts/gen/*` and for the `server/` front server; Vitest plus jsdom for unit tests; `bun test` for server tests; Playwright from `web/` for one API-only spec; Windows PowerShell 5.1 for `scripts/build.ps1`.

**Spec:** `docs/superpowers/specs/2026-09-07-script-api-docs-design.md` in full (15 sections), whose **first task is the standard**: `docs/superpowers/specs/2026-09-07-script-api-survey-and-standard-design.md` section 4 (S1 to S12) plus that document's phase-now proposals from section 5 (P0, P4's type and overload, P7, P8, P9, P11, P14, P19, P20). The survey's phase-**next** proposals are sprint entry 7 and are out of scope here. The docs spec extends `2026-09-05-sp4-tasks-scripting-environment-design.md` sections 5, 6, 7, 9, 11.2 and 17, and documents without redesigning the SP4b surface (`2026-09-06-sp4b-bot-expansion-design.md`: `c.find`, `c.travel`, `c.health`, `c.anchor`). Sprint position: `docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md` entry 5 (row 5, and its section 2 paragraph "### 5."). Session conventions: `docs/superpowers/specs/2026-09-06-sprint-handoff.md` sections 1, 4 and 5.

Three read-only maps were written for this plan against HEAD. They live in the plan's git-ignored SDD workspace, `.superpowers/sdd/2026-09-09-script-api-reference-plan/`: `map-standard.md` (S1 to S12 and the nine proposals against the runtime), `map-generator.md` (the generator seam), `map-serving.md` (routes, gates and consumers). **They are scratch and a fresh clone does not have them.** Every fact they carry that this plan depends on is restated below with its own `file:line`, so no task needs to open one.

## Global Constraints

- Strict TypeScript, **no new `as any`**. **Every file under 400 lines, test files included** (`scripts/line-ceiling.ps1`, verify step 1). Split rather than trim comments. **No exemption row is added by this plan**; ruling R29 says why the two generated artefacts need none.
- One `types.ts` per package. `.env.example` per process: `server/.env.example` gains `AGENT_DOCS` and `deploy/lightsail/provision.ps1`'s `# NOT-WRITTEN:` line gains it too, or two already-green tests turn red (R20).
- Conventional commits. **No em dashes in any new prose**: source comments, doc comments, the seven pages, this plan, and the generator's own rendered headings and labels. Twenty-eight new doc comments are twenty-eight new chances to write one; Task 13's page gate asserts that `—` appears nowhere across the pages, the examples or the emitted `API.md`.
- The product is **idlescape**, lowercase in UI strings. `idlescape` infrastructure identifiers are kept on purpose and are not renamed.
- **`localStorage` keys keep the `cs.` prefix and their exact names**; this entry adds none and resets none. **Panel ids in `web/src/types.ts` are a persisted data contract**; this entry adds none (R21).
- **Pack ids: none.** This entry allocates no obj, inv, loc, map, interface, dbrow or varp id, touches no `content-custom/pack/*`, and needs no content overlay run. `engine/server` and `engine/content` are never edited; `live/` is never read.
- **No client patch is expected.** Everything lands in `web/src/`, `scripts/gen/`, `server/src/`, `deploy/docker/` and `docs/`. `client/PATCHES.md` numbering stays at **28** (R30). P8 dispatches an action `Client.ts:1282` already implements.
- **Windows PowerShell 5.1 only** in `.ps1`: no `&&`, no `||`, no ternary, no `??`, no `?.`, no here-string continuation, and `Join-Path` takes two arguments so nest it. `pwsh` is not installed. A backtick inside a double-quoted string is the escape character, so any message containing one is single-quoted.
- **Saved user scripts are reached by string.** A script is plain text in Firestore at `users/{uid}/tasks/{taskId}.code`, compiled by `new Function` (`web/src/tasks/defineScript.ts:42`) with `defineScript` as the only injected identifier. **Nothing type-checks it**, so renaming any `ScriptContext` member, leaf, manifest field or closed-union string value is a `TypeError` inside a live run, not a build error. Every change in this plan is therefore an **addition**, per S12: this entry renames nothing and removes nothing, and the one deprecation it creates (`anchor(x, z)`) keeps working.
- **The release is the orchestrator's, not the executor's** (D127). No task here runs `deploy/lightsail/release.ps1`. Task 15 adds a `COPY` line to the runtime image and records in its own commit that the route's production behaviour is proven by the first release after the entry lands, not by any gate.
- Branch: `sprint/dragon-slayer`. Every commit ends with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577
  ```
  Use `git -c core.safecrlf=false commit` and explicit `git add <paths>`, **never `git add -A`**. `docs/superpowers/sprint-control.md` is the orchestrator's live board: never stage it, never revert it. `docs/screenshots/e2e-*.png` are regenerated by every green gate and differ by world randomness; this entry moves no UI, so a screenshot diff inside one of its commits is noise and must not be staged.
- Per-command verification, from the repository root in Git Bash:
  - web: `cd web && npm run typecheck && npm run lint && npx vitest run`; one file with `npx vitest run src/tasks/<file>.test.ts` from `web/`.
  - server: `cd server && bun test src/router.test.ts src/agentDocs.test.ts`. **Neither new server suite needs the emulators**; both are fixture tests, like `router.test.ts:1-3` and the whole `wiki/` suite. Do not copy `loadEnv({ FIREBASE_EMULATORS: 'true' })` in from `pair/routes.test.ts`; it drags in `initAdmin` and turns a fixture test into an emulator test.
  - the generator: `bun scripts/gen/apiDocs.ts` and `bun scripts/gen/apiDocs.ts --check`, **from the repository root** (R10), and `npx tsc --noEmit -p ../scripts/gen/tsconfig.json` from `web/`.
  - e2e: emulators from PowerShell `Start-Process` (never a bash subshell, where they die silently), stack up, then `cd web && npm run build:e2e && npx playwright test`. **Never a plain `npm run build`** for an e2e run, and never run Playwright from the repository root, where it reports "No tests found" and exits 0.
  - the whole gate: `scripts/verify.ps1`, ten steps. **Run it detached from PowerShell** with `Start-Process -RedirectStandardOutput`: run through the Bash tool it dies mid-gate, recorded twice in `docs/superpowers/ledgers/2026-09-07-shell-v2.md`, and the tell is a log that stops mid-step with no error line under it.

---

## What already shipped, verified in the code

Read this before Task 1. Every line number was read at `63f4c76` on `sprint/dragon-slayer` (entry 4 closed at `b2b4ca7`; `63f4c76` is the board move after it). **Treat every line number as a hint and grep for the symbol beside it.**

**Nothing this entry creates exists yet.** Verified absent by `ls`: `web/src/tasks/scriptApi.ts`, `scriptApiKeys.ts`, `standard.ts`, `forbidden.ts`, `web/src/tasks/docs/`, `web/src/tasks/gen/`, `web/src/agent/API.md`, `web/src/agent/api-index.json`, `scripts/gen/apiDocs.ts`, and any `/api/agent/docs` route. `scripts/gen/` holds `atlas.ts`, `collision.ts`, `tutorial-steps.ts`, `lib/io.ts` and `tsconfig.json`.

**`ScriptContext` is `web/src/tasks/types.ts:179-218`: 14 top-level members, 29 leaves, 5 namespace declaration sites, 34 declaration sites in all.** The members are `state`, `bot`, `sdk`, `wait`, `tutorial`, `params`, `log`, `status`, `memory`, `signal`, `travel`, `find`, `anchor`, `health`. Leaves: `state()` `:180`; `bot` and `sdk` **share line 181**; `wait.{until, ticks, dialog, xp, item, message, idle}` `:183-189`; all four `tutorial` leaves **share line 191** as an inline type literal; `params` `:192`, `log` `:193`, `status` `:194`, `memory` `:195`, `signal` `:196`; `travel.{to, distanceTo}` `:198`, `:200`; `find.{nearest, nearestAtlas, sweep, landmark}` `:203-206`; `anchor` `:209`; `health.{is, last, recovered}` `:213`, `:214`, `:216`.

**Six of those 34 sites carry a doc comment; 28 do not.** Documented: the `find` namespace `:202`, the `health` namespace `:211`, `travel.distanceTo` `:199`, `anchor` `:208`, `health.is` `:212`, `health.recovered` `:215`. **The docs spec's fact table is wrong here**: it records `ScriptContext` as "14 top-level members carrying about 28 leaves, declared with doc comments". S11 is the largest single writing task in this entry and the spec prices it as nothing.

**The hand-maintained mirror of the member list is `web/src/agent/worker.ts:374`** (both specs say `:367`), the snippet destructuring list. It destructures exactly those fourteen names, so the two lists agree today: P0 is preventive, not corrective. A member missing there is invisible to `api.execute` snippets with nothing complaining.

**Line counts at HEAD, which decide three seams:** `web/src/tasks/types.ts` **323**, `web/src/agent/worker.ts` **397**, `web/src/agent/workerContext.ts` **294**, `web/src/tasks/api.ts` **393**, `scripts/verify.ps1` **398**, `scripts/build.ps1` **180**, `web/src/tasks/library/tutorialIsland/harness.ts` **338**, `web/src/tasks/runner.ts` **170**, `web/src/agent/runContext.ts` **97**, `scripts/gen/lib/io.ts` **87**, `server/src/router.ts` **87**.

**The factory seam is written down.** `web/src/agent/runContext.ts:1-7` states the rule: "What belongs here is Worker-lifetime state a context is built over ... A context member built from `state`, `sdk` or `bot` belongs in `workerContext.ts` instead". `createTravel` (`workerContext.ts:139-163`) and `createFind` (`:165-172`) are the two existing factories. P9, P11, P14 and P8 follow them **out** of `workerContext.ts` rather than into it.

**`c.signal` is a getter over `d.signal()`** (`workerContext.ts:167-169`), which the runner swaps per task (`runner.ts:9-14`, `RunnerDeps.setSignal`). Every `wait.*` **resolves** rather than rejects on abort (`workerContext.ts:112, 118, 135-136`), and `untilP` (`:98-119`) owns every subscription, so a `resetWhen` is a timer re-arm inside it rather than a new mechanism. `DEFAULT_WAIT_MS` is `20_000` (`:40`). There is no fixed sleep anywhere in our layer.

**The scoped transport swaps exactly three members**, `onState`, `relogin`, `logout` (`workerContext.ts:88-92`), pinned twice: `workerContext.harness.ts:19-31` is a `Record<keyof Transport, true>` that makes a new `Transport` member a typecheck failure, and `workerContext.test.ts:99-118` asserts the refusals and that those two are the only refused members. **The block comment at `workerContext.ts:76-87` is honest about `c.sdk.transport` being reachable and stops one sentence short**: script text runs in the Worker's own global scope (`defineScript.ts:42`, `worker.ts:371-375`) and can post its own RPC frame, which `workerHost.ts:277` answers against the **raw** transport. Task 2 finishes that sentence.

**`c.state()` never returns null.** `workerContext.ts:49, 95` hands out a frozen `NO_STATE` before the first snapshot, deliberately, so `wait.*` predicates simply never match until the first tick lands. That differs from `sdk.getState()`/`transport.getState()`, which are `WorldState | null` (`agent/types.ts:21`), and S9's example list names `getState()` among the null-returning lookups. The reference has to state the distinction or an author null-checks the wrong one.

**The anchor has three consumers, not the two P4 names.** `makeAnchor` is `runContext.ts:29-37` and stores `{ x, z }` seeded from `player.worldX`/`worldZ` on first read; `ContextDeps.anchor(x?, z?)` is `workerContext.ts:32`; the readers are `recovery.ts:134`, `recovery.ts:191` and **`runHealth.ts:104`**, with the setter at `worker.ts:251`. `runContext.test.ts:75-91` pins `anchor()` and `anchor(x, z)` returning exactly `{ x, z }`, so teaching it a `level` breaks that assertion by design.

**`Task.cooldownMs` is declared at `types.ts:225` and read by nothing** (grep: two hits, the declaration and the SP4a plan). The runner's task selection is `runner.ts:136-147`, and `lastMatchAt` (`:142`, `:148`) is what drives `stuckAfterMs`.

**`hardStop.hpBelow`** (`types.ts:172`) is read at `runner.ts:130-131` and set by all three loop scripts (`chopAndDrop.ts:12` and siblings). It is absolute hitpoints and its name says so in neither direction: S8's named live violation.

**Four options bags are inline literals rather than named exported interfaces**: `wait.until`'s `{ timeoutMs?, label? }` (`types.ts:183`), `tutorial.followHint`'s `{ talk? }` (`:191`), `ScriptManifest.hardStop`'s `{ hpBelow? }` (`:172`) and `ScriptManifest.anchor`'s `{ x, z }` (`:176`), plus `SweepOpts.anchor` (`:83`). P20's api-shape gate asserts every options parameter's type is a named exported interface.

**Three closed unions besides `HealthCondition` are kebab-case**, and S1 grandfathers only `HealthCondition` by name: `DeathBehaviour` (`types.ts:134-135`), `RecoveryOutcome` (`:107`) and `PauseReason` (`:242`). All three are persisted, `PauseReason` and `HealthCondition` into `RunStatus`/`RunSummary` (`:297`, `:301`) and into IndexedDB history rows, so a rename is a data migration rather than a rename.

**The library's failure reasons are already split two ways.** `chopAndDrop.ts:33`, `netFishAndDrop.ts:55-56` and `tutorialIsland/helpers.ts:135` say `reason: 'not_found'`; `workerContext.ts:203` and `:149` say `'target_not_found'`. Closing that union is P10, which is entry 7.

**`netFishAndDrop.ts:47-49` is S5's own non-compliant example, verbatim in the tree**: `(c.state().nearbyNpcs ?? []).filter(...).sort((a, b) => a.distance - b.distance)[0]`. `tutorialIsland/combat.ts:28` and `helpers.ts:41` read the scene the same way. The fluent query that replaces it is P3, phase next. This entry migrates none of them and must not let an example copy the shape.

**The dialogue footgun P14 exists to absorb is live in three files.** `sendClickDialog` takes the **server-assigned** `DialogOption.index`, not the array position, and the two differ by one; `finish.ts:75-99` (`choose-dialog-option`) and `recovery.ts:70-92` (`decline-tutorial-skip`) each carry a paragraph of comment explaining it, and `helpers.ts:80-91` (`advance`) drives `clickThrough`.

**`compileUserScript`** (`defineScript.ts:37-49`) caps at 64 KB, **strips whole-line imports by regex**, rewrites the first `export default` into `return`, and runs the rest through `new Function`. There is no transpile step, so **a type annotation is a syntax error**. `defineScript` (`:6-16`) enforces `ID_RE = /^[a-z][a-z0-9-]{1,40}$/`, a non-empty `tasks` array, `name`/`when`/`run` on every task, and unique task names.

**The precedent gate 4 copies is `web/src/tasks/library/librarySource.test.ts:24-33`** (77 lines), not `api.harness.ts`/`api.runtime.test.ts`, which are the fakes and suites for the panel-facing `TasksApi` and compile nothing. It is gate 4 minus the param-schema comparison, and `?raw` is the idiom it uses (`library/index.ts:7-10`). There is **no `import.meta.glob` anywhere in `web/src`**.

**`scripts/gen/lib/io.ts` has two write helpers and the spec cites the wrong one.** `writeOrCheckText` is `:55-68` (normalises CRLF on both sides, writes LF) and `writeOrCheck` is `:75-87` (exact `Buffer.compare`). `writeOrCheckText`'s doc block at `:48-54` says why it exists: `.gitattributes:1` is `* text=auto` and this repository is checked out with `core.autocrlf=true`, so a committed multi-line text file arrives CRLF while a generator writing `\n` produces LF, and "comparing bytes would fail the build on every fresh clone". `atlas.json` and `doors.json` survive the byte form only because they are emitted as a single line with no newline in them; `collision.bin` is pinned `binary` at `.gitattributes:7`; `tutorial-steps.ts:9,:24` is the in-tree precedent that gets a multi-line artefact right. **Both helpers hardcode the message "is out of date with engine/content"**, which is untrue for a generator whose input is `web/src`.

**`scripts/build.ps1:47-70` is the drift-gate precedent**, in two blocks: a `Push-Location $web` typecheck of `scripts/gen` (`:53-59`) and a `Push-Location $root` group running the three generators with `--check` (`:60-70`). `$bun` comes from `Get-Bun` (`:24-31`) and `$ErrorActionPreference = 'Stop'` is set at `:18`. `scripts/verify.ps1:38` is `$TotalSteps = 10`; step 9 is `build.ps1` (`:305-307`) and step 6 is the web unit tests (`:274-282`).

**Test files ARE typechecked, since audit C16.** `web/tsconfig.json:20` excludes four globs (`src/**/*.test.ts`, `src/**/*.harness.ts`, `src/**/harness.ts`, `e2e/**`), but `web/tsconfig.test.json:17` includes the first three plus `src/test/**/*.ts`, and `web/package.json:11` is `"typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.e2e.json && tsc --noEmit -p tsconfig.test.json"`. **The docs spec's gate-6 argument, and `workerContext.harness.ts:5-8`'s own header, are both stale about this.** Do not quote either as evidence; see R14.

**`web/vitest.config.ts` includes only `src/**/*.test.ts`, rooted at `web/`.** There is no runner for `scripts/`, so the spec's `scripts/gen/apiDocs.test.ts` would be picked up by nothing (R16). `setupFiles` are `fake-indexeddb/auto` and `src/test/setupDom.ts`, run once per file; jsdom performs no layout.

**`web/eslint.config.js` narrows only by `ignores`** (`:29-32`: `dist`, `node_modules`, `scripts`, `src/vendor`, `*.config.*`), so `js.configs.recommended` applies to `src/**/*.js` and `no-undef` is live there. `max-lines: 400` (`:26`) applies to the nine examples too; at 20 to 70 lines each that is free. `web/package.json:12` is `"lint": "eslint src/ e2e/"`.

**`scripts/line-ceiling.ps1:64` is `$includeExt = @('.ts', '.js', '.css', '.html', '.ps1', '.sh', '.rules')`.** No `.md` and no `.json`. The five-entry `$exempt` array (`:70-75`) is matched by `StartsWith` or exact equality, and the `steps.ts` row exists only because that generated artefact happens to be `.ts`.

**The server's route seam.** `classify` (`router.ts:32-73`) is a flat sequence of equality and `startsWith` tests; `/api/health` is an exact match at `:37`. `principalRule` (`:75-87`) returns `'none'` from its `default:` at `:86`. **`principal: 'none'` is not enough to make a route reachable**: `server/src/index.ts:76` runs `gate.isOpen(req)` for everything that falls to `default: break` at `:74`, and `GATE_ENABLED=true` is the `.env.example` default and what `verify.ps1` step 10 runs. The routes that answer ahead of the gate do it from the **first** switch: `health` (`:52`), `bankHook` (`:57`), `pair` when `sub !== 'guide'` (`:63-68`), `wiki`/`wikiApi` (`:69-73`).

**Do not route this through `serveStatic`.** `static.ts:29-49` joins only `env.webDist`, `env.clientOut` and `env.enginePublic`; `classify` only ever produces `kind: 'static'` under `/assets/` (`router.ts:68-71`); and the `MIME` table (`static.ts:5-17`) has **no `.md` entry**, so markdown would be served `application/octet-stream`.

**Two already-green server tests fail the moment a new env key lands.** `server/src/env.test.ts:69-86` extracts every `str|bool|int(source, 'KEY')` and every `source.KEY` from `env.ts` and asserts set equality with `server/.env.example` **in both directions**; `:88-109` asserts that `deploy/lightsail/provision.ps1`'s written keys plus its `# NOT-WRITTEN:` line (`provision.ps1:115`) equal the template exactly.

**The runtime image does not contain `web/src`.** `deploy/docker/server.Dockerfile`'s runtime stage (`:117-141`) copies `server/package.json`, `server/src`, `client/out`, `web/dist`, the engine's `public/client` and `wiki/build/wiki.db`, and nothing else. `WORKDIR` is `/app/server` (`:119`). `.dockerignore` does not exclude `web/src`, so the fix is one `COPY` line (R19).

**The generator has no house pattern to copy for its traversal.** Grepped `web/src`, `server/src`, `scripts` and `wiki`: **zero** uses of the TypeScript compiler API (`from 'typescript'`, `createProgram`, `createSourceFile`). This is the first, so this plan specifies the traversal rules itself rather than pointing at a precedent.

**What entries 2, 3 and 4 changed under this plan** is in "Reconcile against HEAD" at the end of this file. Read it before dispatching Task 1.

---
## Plan rulings

Thirty-five decisions. Each is a question the two specs, the maps or the code left open, or a place where a spec sentence is false at HEAD and this plan has to choose. Each says what it costs if it is wrong. **Where a ruling overturns a spec ruling it says so by number**, because the spec is otherwise the authority and a reviewer must be able to see the departure without reconstructing it.

### The five that overturn a spec ruling, or correct a draft of this plan

**R10. The generator never imports `typescript` from `scripts/`, and it runs from the repository root beside the other three.** *Overturns docs spec section 3.2's ruling that `apiDocs.ts` runs from `web/` "because TypeScript exists in `web/node_modules`".* Module resolution is from the importing file, not the cwd, and there is no `node_modules` at the repository root, under `scripts/`, or under `scripts/gen/` (the root `package.json` declares zero dependencies). Measured on this machine: a bare `import ts from 'typescript'` in a file with no `node_modules` ancestor, run with `bun` from `web/`, resolved **typescript 7.0.2 out of Bun's global auto-install cache** (`file:///C:/Users/.../.bun/install/cache/typescript@7.0.2@@@1/...`), not `web/node_modules`'s pinned **5.9.3**; `bun --no-install` on the same file errors `Cannot find package 'typescript'`. TypeScript 7 is the Go port with a different API surface, and `typeToString`-derived signature text can differ compiler to compiler while `--check` compares the result. **So the traversal lives in `web/src/tasks/gen/apiIndex.ts`, where a bare `'typescript'` resolves to `web/node_modules` normally, and `scripts/gen/apiDocs.ts` imports only node builtins and repo-relative modules, exactly like `atlas.ts`.** Its `--check` block then joins the existing `Push-Location $root` group at `build.ps1:60-70` rather than needing one of its own. *Cost if wrong: one `Push-Location $web` block and one import line.*

**R35. `apiDocs.ts` reads the seven pages and the nine example sources off disk with `node:fs`, and imports neither `docs/index.ts` nor `docs/examples.ts`.** *Overturns nothing in the spec, which does not say; it corrects an earlier draft of this plan that had the generator import both barrel modules.* Those two modules are built entirely out of Vite `?raw` imports, whose only type declaration is the ambient `declare module '*?raw'` at `web/node_modules/vite/client.d.ts:243`, pulled in by `web/tsconfig.json`'s `"types": ["vite/client"]`. **`scripts/gen/tsconfig.json` sets `"types": ["bun-types"]` with `typeRoots` reaching `server/node_modules`, and `server/node_modules/bun-types/extensions.d.ts` declares `*.txt`, `*.toml`, `*.yaml`, `*.yml`, `*.jsonc`, `*.json5`, `*.xml`, `*/bun.lock` and `*.html`, and nothing matching `*?raw`.** TypeScript follows imports regardless of a project's `include`, so `npx tsc --noEmit -p ../scripts/gen/tsconfig.json`, which `build.ps1:53-59` runs as part of verify step 9, would report `Cannot find module './00-quickstart.md?raw'` sixteen times on the same commit that lands them. That check exits 0 today. Widening the generator project's `types` is the other repair and it is the wrong one: entry 3's lesson (commit `39458f0`) is that a widened tsconfig sweeps in what nobody scoped it off, and this one would then be typechecking `web/src` through a project with `web`'s DOM lib but not `web`'s program. **Reading off disk is also what `apiDocs.ts` already does for every other input**, and it keeps R10's "node builtins and repo-relative modules only" literally true. The barrel modules stay, unchanged, for the vitest gates, which run under Vite where `?raw` is real. `apiDocs.ts` and `docs/index.ts` must therefore agree on the page order; **Task 13 step 5 asserts that agreement rather than leaving it to a reader**. *Cost if wrong: two `readFileSync` loops instead of two imports, and one ordering assertion.*

**R11. Both artefacts go through `writeOrCheckText`, and `api-index.json` is pretty-printed.** *Overturns docs spec ruling 10 and gate 1's wording, both of which say `writeOrCheck` (byte compare) for both, citing `io.ts:53-65`, which is not either helper's line range.* `API.md` is multi-line markdown; on a `core.autocrlf=true` checkout a byte compare of a committed multi-line text file is red on every fresh clone, which is what `writeOrCheckText`'s own header at `io.ts:48-54` exists to say. Pretty-printing the index follows for free once the text helper owns it, and gives a readable diff. Task 12's demonstration 4 proves this rather than asserting it. *Cost if wrong: the index goes back to one line and both artefacts stay on the text helper anyway.*

**R14. There is no `scriptApi.harness.ts`. The shipped leaf `web/src/tasks/scriptApiKeys.ts` is the one `Record<keyof ScriptContext, true>`.** *Overturns docs spec ruling 13 and gate 6's placement argument.* That argument's premise ("`npm run typecheck` is `tsc --noEmit`, so nothing in a `.test.ts` is ever type-checked") was closed by audit C16: `web/tsconfig.test.json` includes tests and harnesses and `web/package.json:11` runs three programs. Meanwhile P0 (`survey spec :1206-1220`) rules the record must live in a **shipped leaf module** so `worker.ts` can `Object.keys` it without a value import of `scriptApi.ts` dragging P17's future `createTestContext` into the Worker chunk. A shipped leaf is inside `web/tsconfig.json`'s own program, so the type error fires on the first of the three typecheck passes with no harness at all. `scriptApi.test.ts` keeps gate 6's runtime half and gains P20's api-shape assertions. *Cost if wrong: one file moves and one import changes.*

**R18. One API-only Playwright spec, `web/e2e/api-docs.pw.test.ts`, about 25 lines, deliberately without `openGate`.** *Overturns docs spec section 9's "No Playwright", whose reasoning ("this entry ships no UI") is about UI and does not reach the two routes.* Two of this entry's failure modes are invisible to every unit test: the gate ordering inside `index.ts`'s first switch, and a path that does not exist in the runtime image. A spec that signed in first would pass against a route sitting behind the gate, which is why it uses a fresh `request.newContext` and no helper. It rides step 10's bare `npx playwright test` with no config change. *Cost if wrong: one file and a few seconds in step 10.*

### The standard's four missing arms, which stop the api-shape gate failing on HEAD

**R2. S1's grandfather clause is extended to name all four kebab-case unions, and none is renamed.** S1 grandfathers `HealthCondition` by name and calls it "not a precedent"; `DeathBehaviour` (`types.ts:134-135`), `RecoveryOutcome` (`:107`) and `PauseReason` (`:242`) are three more, and all of them are persisted into `RunStatus`/`RunSummary` and IndexedDB history rows, so a rename is a data migration. The four names go in `standard.ts`'s `KEBAB_UNIONS` exemption list with that reason, and the S1 clause of the api-shape gate reads it. *Cost if wrong: four unions stay kebab forever and the standard reads as four exceptions rather than one. Renaming them instead is a history migration this entry has no budget for.*

**R3. S4's grandfather list gains `log(text, level?)` and `tutorial.clickThrough(max?)`, and each also gains a compliant options overload.** S4 enumerates four grandfathered positional members (`wait.dialog/xp/item/message`) and stops; `log`'s second argument is an option in a positional slot and `clickThrough`'s is a setting rather than a subject, so the gate as P20 words it fails on both at HEAD. Both are reached by string from saved scripts, so neither is changed: an overload is added (`log(text, opts?: LogOpts)`, `clickThrough(opts?: ClickThroughOpts)`) so a new caller writes the compliant form, and the old arm is grandfathered rather than deprecated, because there is nothing wrong with it. *Cost if wrong: two overloads and two exemption rows.*

**R4. S8's api-shape regex gains a count allowance, and every unit-less numeric name on the surface we own is pinned in an exemption list.** The regex `/Ms$|Percent$|Fraction$|Points$|Ticks$/` admits no counts. `numericNames` (Task 10 exports it and Task 16 states its contract: it reads **method parameter names plus the field names of every `ApiType` an options bag declares**, over the members it is handed, which the gate filters to `vendored: false`) returns about twenty on the surface as this entry leaves it, not the fourteen a first census found: `maxAttempts`, `maxLegs`, `maxRelogins`, `maxRecoveryAttempts`, `maxTiles`, `maxClicks`, `radius`, `tolerance`, `minDelta`, `delta`, `n`, `legs`, `tiles`, `estimateMinutes`, **plus the six this entry itself adds**: `attempts` (`RetryOpts`), `id` (`WaitAnimationOpts`), `opIndex` (`InteractGroundItemOpts`), and `x`, `z`, `level` (`Tile` and `TileLike`). The gate accepts a name matching `/^(max[A-Z]|n$|legs$|tiles$)/`, and `standard.ts` exports `COUNT_EXEMPT` naming **all** the rest with the unit each is counted in. **There is no doc-comment escape hatch**: an earlier draft of this ruling promised one, the gate cannot implement it without re-reading the source text it already turned into an index, and a list with a reason per row is the cheaper and more auditable form. `estimateMinutes` is listed with the note that it is a duration whose unit is in its name and is not milliseconds on purpose, because it is shown to a player; `x`, `z` and `level` are listed as world-coordinate components, which is the one place a bare letter is the clearest name there is. *Cost if wrong: the gate is green by exemption on a name that should have gained a unit suffix. Every entry is one line to delete once P12 or entry 7 renames it.*

**R5. `hardStop.hpBelowPoints` is added now, `hpBelow` is deprecated, and nothing is removed.** S8 names `hpBelow` the live violation and prescribes exactly this; it is not a numbered proposal, so it would otherwise fall between this entry and entry 7's P12 (`eatBelowPercent`). It is about eight lines and it is the second exercise of the deprecation machinery R7 builds. `runner.ts:130-131` reads `hpBelowPoints ?? hpBelow`; all three loop scripts and their fork seeds move to the new name in the same commit, per S12's "the shipped corpus never demonstrates a deprecated idiom". *Cost if wrong: entry 7 does it with P12 and one deprecation window slips a sprint. Doing it here costs the three library scripts a one-word edit each.*

### The twelve the code left open

**R1. `web/src/tasks/types.ts` splits, and `types.ts` stays the package's one entry.** At 323 lines it cannot take 28 doc comments (which also need 8 to 10 lines of restructuring, because `bot` and `sdk` share line 181 and all four `tutorial` leaves share line 191) plus the phase-now members. **`web/src/tasks/scriptContext.ts` takes the `ScriptContext` interface and every options bag a script passes; `types.ts` keeps the run and persistence model (`ParamField`, `Requirement`, `ScriptManifest`, `Task`, `Script`, `RunState`, `TraceEvent`, ...) and re-exports everything in `scriptContext.ts`,** so no existing import site changes and the one-`types.ts`-per-package rule still reads true. *Cost if wrong: a file move and a re-export line.*

**R6. `wait.ticks(n)` widens from `Promise<void>` to `Promise<boolean>`, `false` when the run was stopped.** S2 and S3 give every other wait a boolean and leave `ticks` with no arm, so a delay that ended because the player pressed stop is today indistinguishable from one that ran to term. **No saved script can observe the change**: JavaScript discards an unused return value, and `await c.wait.ticks(1)` reads identically. *Cost if wrong: one line back, and the four call sites in the library that ignore it are unaffected either way.*

**R7. S12's warn-once-on-a-deprecated-member is built in this entry, with the deprecation it exists for.** S12 step 2 requires "one `log` line at `warn` the first time a run touches a deprecated member", and this entry produces the first deprecation there has ever been (`anchor(x, z)`, and under R5 `hardStop.hpBelow`). It is about six lines in `web/src/tasks/deprecate.ts`: a `Set` of member paths already warned, a `warnOnce(path, message)` that pushes one trace line, and nothing else. It is run-scoped, not Worker-scoped, so a second run warns again. *Cost if wrong: the first two deprecations ship with a notice in the reference and none at run time, which is exactly what S12 says is not enough.*

**R8. P7's `attach` writes to a run-scoped attachments store; the trace row carries an id and a label, never a `Blob`.** A trace event crosses `postMessage`, is capped at 5000 (`trace.ts:35`), is persisted per run in IndexedDB (`history.ts:74-78`), is rendered by `traceView.ts`'s exhaustive switch in **`detailOf`** (18 cases at HEAD, `case 'target'` at `:47`, no `default`, so a 19th kind is TS2366; `describeEvent` at `:52` calls it and switches on nothing), needs a rail in `styles/layout/trace.css:25-26`, and is copied to Claude behind `UNTRUSTED_HEADER`. A `Blob` inside that row is the wrong shape at every one of those points. **`web/src/tasks/attachments.ts` keeps `Map<runId, { id, label, blob }[]>` with a cap of eight per run, and the trace variant is `{ kind: 'attachment'; attachmentId: string; label: string }`.** *Cost if wrong: the copy path tries to render a binary and the row cap holds images in memory for the life of a run.*

**R9. The nine examples spell a missing target `'target_not_found'`, and `04-find-travel-and-anchor.md` names the split.** The tree says both (`workerContext.ts:203`, `:149` versus `chopAndDrop.ts:33`, `netFishAndDrop.ts:55-56`, `tutorialIsland/helpers.ts:135`), and closing the union is P10, which is entry 7. The examples take the spelling our own members already return, and the page says in one sentence that three bundled library scripts still say `'not_found'` and that P10 closes it. *Cost if wrong: nine files re-spelled by entry 7's own migration, which touches them anyway. This ruling is on the cross-entry ledger (D133) because entry 7 must honour it.*

**R12. `apiDocs.ts` rethrows the write helpers' failure with the right command.** `writeOrCheckText` and `writeOrCheck` both hardcode "is out of date with **engine/content**" (`io.ts:68`, `:85`), which is untrue for a generator whose input is `web/src`. Widening the shared helpers would touch three green generators for one caller's message, so `apiDocs.ts` wraps each call in a try/catch and rethrows `<path> is out of date with web/src/tasks/scriptApi.ts and its docs; run: bun scripts/gen/apiDocs.ts`. Gate 1's whole value is that the message names what to run. *Cost if wrong: a reader is sent to look at the engine content clone for a change they made in `types.ts`.*

**R13. `ApiIndex` gains `schemaVersion: 1` as its first field, and `apiIndex.test.ts` asserts it.** The spec gives the index a `hash` and calls it metadata and a fast path; `hash` changes on every content edit, so **no consumer can branch on it**. Entry 6 imports the JSON as a bundled module and would notice a shape change at compile time, but `/api/agent/docs.json` is a public route that outside tools and SP4c read. One integer, bumped only when a field is removed or retyped. *Cost if wrong: a consumer written against a later shape silently misreads an older file. This is the cross-entry ruling on the ledger (D132).*

**R15. The traversal emits `kind: 'namespace'` for `c.bot` and `c.sdk` even though they are class-typed properties, and the rule survives an interface that extends a class type.** Entry 6 derives its completion trigger set at load time from `members[].kind === 'namespace'` and names the eight prefixes it expects, including `c.bot.` and `c.sdk.` (`script-studio-design.md:968-978`). The tree has five object-literal namespaces plus the root; `bot: BotActions` and `sdk: BotSDK` are properties of a class type. **Task 7 then retypes `bot` as `ScriptBot`, an interface that extends `BotActions` and adds `interactGroundItem`, so the rule is stated over the resolved apparent type rather than over the declaration**: a property whose type has call-signature-free members and resolves through a class type, an interface extending one, or an intersection of either is a namespace and is descended into. A rule written as "is a class type" would have matched at Task 10 and stopped matching at Task 7, dropping `c.bot`'s 160 members to a single `kind: 'property'` row with nothing failing. The fixture carries both shapes: a bare class-typed property and an interface extending a class. *Cost if wrong: entry 6 hand-lists two prefixes and the derived-set test it was going to write becomes a lie.*

**R32. `vendored` is decided by the file a member is declared in, not by its path prefix.** The docs spec's own phrasing is "under `c.bot` or `c.sdk`", which was right until Task 7 put `interactGroundItem` on `c.bot`. Under a prefix rule, the one member in this entry with a carefully argued `opIndex` doc comment is the one member gate 2 skips and the api-shape gate's `ours` filter excludes: the two gates would protect everything except the thing that was just added. So `vendored` is true when the declaration's source file is under `web/src/vendor/`, which is the real question ("can we edit the prose that documents this?") and which the `ts.Program` already knows. `apiIndex.test.ts` pins both halves against the fixture. *Cost if wrong: one predicate, and a member of ours documented as if we could not have documented it.*

**R33. `ScriptManifest.apiVersion`, the `API_VERSION` constant and the shim table are entry 7's, and this plan says so rather than leaving the reader to infer it.** S12's mechanism has three parts: the version map (built here, Task 10 rule 5b), the warn-once notice (built here, R7), and the manifest field that lets a saved script pin an api version, which S12 delegates to **P18, a phase-next proposal and therefore entry 7**. This entry nevertheless ships the first two deprecations there have ever been, both of whose notices read "Removed in api 3". **The consequence, stated plainly because it is the sort of thing a later reader takes as a bug**: until P18 lands, the api number exists only in the generator's `SINCE` map and in the deprecation strings; no constant defines it, no manifest carries it and no runtime can count it. The reference is honest about that (`01-script-model.md` says what a deprecation notice means and that pinning arrives with P18), and Task 17 step 3 records it under "what is still open". Entry 7 must honour both removal windows, which is the half D133 already carries. *Cost if wrong: nothing this entry can observe; entry 7 rediscovers that it owns three names. This is on the cross-entry ledger as D134.*

**R34. S5's predicate arm is not added to this entry's two new selector-taking members, and that is a departure, not an oversight.** S5 states the selector union as `string | RegExp | number | ((e: E) => boolean)` "uniformly". `dialog.choose(sel)` and `bot.interactGroundItem(target, opts)` both take `string | RegExp` only, following P14's and P8's own sketches. The predicate arm belongs with the fluent query work (P10 and P3) that gives every selector one resolution path, which is entry 7: adding it to two members now would set two hand-written precedents for a shape entry 7 is about to decide once, and gate 4 freezes the examples that call these members while entry 6 ships them as templates. **`04-find-travel-and-anchor.md` says in one sentence that the predicate arm is coming and where**, so a reader who tries one and gets a type error knows why. *Cost if wrong: two signatures widen in entry 7, which touches both files anyway, and two examples gain a line. Doing it here costs a `matches` arm in `dialog.ts`, a target-resolution arm in `botExtras.ts` and two tests. This is on the cross-entry ledger as D135.*

**R16. The traversal's test is `web/src/tasks/gen/apiIndex.test.ts`.** The docs spec's section 9 and 10 put it at `scripts/gen/apiDocs.test.ts`, which **no runner picks up**: `web/vitest.config.ts` includes `src/**/*.test.ts` rooted at `web/`, and there is no runner for `scripts/`. This is the second reason for R10's placement; the first is compiler resolution and the third is that P20's api-shape gate says it reuses "the same `ts.Program` the docs generator already builds", which a vitest file cannot do across the `scripts/` boundary. *Cost if wrong: a 160-line test suite that never runs, which is worse than no suite.*

### The gates, the routes and the surfaces

**R17. Gate 1 lands in `scripts/build.ps1` and `$TotalSteps` stays 10.** `scripts/verify.ps1` is **398** lines against the ceiling, with two lines of headroom; `build.ps1` is 180 and is verify step 9. Entry 3's plan already ruled this class of question (its R11 keeps `$TotalSteps` at 10 because moving it falsifies seven prose lines across `README.md`, `CLAUDE.md`, `docs/VERIFICATION.md`, `docs/ARCHITECTURE.md` and the `idlescape-verify` skill; its R12 puts the one new assertion that is not a verify sub-step into `build.ps1`). The commit before this entry, `9ce3005`, is what a moved step count costs. `docs/VERIFICATION.md`'s step 6 and step 9 rows each gain a clause; the ten-step paragraph and the table's ten rows do not change. *Cost if wrong: four documents and a skill to re-count.*

**R19. `deploy/docker/server.Dockerfile`'s runtime stage gains one `COPY` of the two artefacts.** Docs spec ruling 8 justifies reading `web/src/agent/API.md` through an env var on the grounds that "release.ps1 uses `git archive HEAD`, so the file is on the box". True of the box's checkout; **the front server does not run from it**. The runtime stage (`:117-141`) has no `COPY web/src`, `WORKDIR` is `/app/server`, so the default `../web/src/agent/API.md` resolves to `/app/web/src/agent/API.md`, which the image does not contain, and both routes answer 503 on the live site forever. **No gate catches this**: `verify.ps1`'s local stack runs the server from the repository, where the path exists. One line, in the same task as the route, with the reason in a comment. *Cost if wrong: the entry is green everywhere and dead in production until somebody curls the box.*

**R20. `server/src/agentDocs.ts` exports one `readAgentDocs(env, format)` that both the HTTP route and, later, SP4c call; the `.json` sibling is derived, not a second env var.** SP4 section 11.2 says `get_api_docs()` returns `API.md` and `idlescape://api` serves the same file. If entry 5 inlines a `Bun.file` read into `index.ts`'s switch, entry 16 writes a second read and the two can answer differently; docs spec section 12 promises SP4c "two lines" and this is what makes that true. The index path is `join(dirname(env.agentDocs), 'api-index.json')`, so the two artefacts cannot be pointed at different directories. **Entry 5 adds no `/mcp` route, no agent-token check and no mode gate**; `server/src/router.ts` has none at HEAD and `docs/README.md:146-151` says so. *Cost if wrong: two reads of one file, which is the drift the seam exists to prevent.*

**R21. No shell surface in this entry, on the record.** The docs spec ships no UI and the sprint's own paragraph says the reference "is the only one of the three that ships no new UI". The Configuration panel (`web/src/panels/config.ts:4`) is not a documentation surface; the Tasks panel (`plugins/builtin/tasks.ts`) is at **399** lines, so a link there costs a file split before it costs a link; `PanelId` (`web/src/types.ts:15`) is a persisted contract and gains nothing. Entry 6's help pane is the reference's UI and is the next entry, so a throwaway link now is a second entry point it would have to keep or remove. **The findability that is in scope is docs spec ruling 4's one pointer line in `CLAUDE.md` plus a row in `docs/README.md` section 1's authority table**, which has no script-API row today. *Cost if wrong: a player has no in-shell path to the reference for one entry. If it is overturned, `web/src/styleguide.families.test.ts:46-50` is the gate a new family stylesheet trips, plus a `web/styleguide.html` section and possibly a screenshot baseline.*

**R22. `api-index.json` carries a budget of 400 KB raw and 40 KB gzipped, enforced by `enforceBudget`.** Entry 6 prices its whole help chunk (index plus seven pages plus renderer) at about 45 KB gzipped against a 60 KB ceiling (`script-studio-design.md:1532`), and the docs spec states no budget at all. The vendored half (`c.bot` and `c.sdk`, roughly 160 rows) is what makes the number non-obvious. `scripts/gen/lib/io.ts:38-46` already has the helper, used by `atlas.ts:129` and `collision.ts:45`. *Cost if wrong: the build throws with the measured number in the message and the number is edited with the reason beside it, which is the failure mode a budget is for.*

**R23. Both routes answer 405 to anything but `GET`.** The wiki routes check no method; `'gate'` does (`index.ts:53`). These are read-only documentation routes with one shape, so the explicit refusal is two lines and is what a reader expects. *Cost if wrong: two lines.*

**R24. `build.ps1` runs the generator with `bun --no-install`.** Bun's auto-install is on by default and silently succeeds, which is exactly what turned R10's bare specifier into a wrong artefact rather than a loud failure. Under R10 `scripts/gen/apiDocs.ts` imports node builtins and repo-relative modules only, so `--no-install` costs it nothing and makes any future bare specifier fail at the gate instead of resolving to whatever the operator's cache holds. *Cost if wrong: if a later change gives the generator a real dependency, the flag is removed in the same commit that adds it.*

**R25. Task 9's `?raw` doc-comment check is provisional and Task 16 deletes it in the same commit that lands gate 2.** The doc comments are written before the generator exists, and a task that ships 28 comments with no test that fails when one goes missing is a task with no gate. The provisional form reads `scriptContext.ts` through `?raw` and asserts every declaration site inside `ScriptContext` is preceded by a `/**` block. **One gate, not two:** gate 2 reads the emitted index, which is the real question, and the two would otherwise be two sources. *Cost if wrong: one test file lives about six tasks longer than it should.*

**R26. `web/src/tasks/library/tutorialIsland/harness.ts` splits before it grows a `dialog` fake.** It is 338 lines and is the fake every stage test builds on; P14's namespace does not fit in 62 lines beside `clickThrough` (`:214`) and `sendClickDialog` (`:266`). The dialogue half moves to `tutorialIsland/harness.dialog.ts` and `harness.ts` re-exports it, so no stage test's import changes. *Cost if wrong: a 400-line failure in verify step 1 partway through Task 6.*

**R27. `scriptApi.ts` re-exports the spec's 31, corrected in three spellings, extended by four types, and extended again by every named options bag this entry adds: 49 type names in all.** No bare count is repeated anywhere else in this plan, because the count moved twice while the plan was written and a stale figure in a ruling is what a reviewer of entry 6 would read as the contract. **The list in Task 8 step 4 is the contract; this ruling states the delta from the spec and nothing else.** `BotSdk` does not exist; the type is **`BotSDK`** (`web/src/vendor/rs-sdk/sdk/index.ts:65`). `WorldState` is declared in **`web/src/clientTypes.ts:34`** and only re-exported by `web/src/agent/types.ts:12`, so `generatedFrom.files` must name `clientTypes.ts` or the hash misses the shape a script reads most. And `TraceEvent`'s union carries `TargetEvent` (`types.ts:249`) as a named member while `RecoveryOutcome` (`:107`) appears inside its `recovery` variant: without both in the list, `ApiType.variants` renders names the index does not define. **The four additions over the spec's list are `TargetEvent`, `RecoveryOutcome`, `Tile` and `TasksErrorCode`**; the thirteen options bags follow from S4, which requires each to be a named exported interface, and from the api-shape gate's assertion that every options type a member takes is one `scriptApi.ts` exports. `TasksErrorCode` (`web/src/tasks/api.ts:26`) is in the list because `06-limits-and-trust.md`'s eleven-value error vocabulary is meant to be sourced from the real type and Task 10 step 5 eyeballs it in `enums`; without the export it is in neither. **The invariant behind all of this is asserted, not just ruled**: `scriptApi.test.ts` checks that every capitalised identifier appearing in a `types[].variants` entry or a `types[].fields[].type` is either a TypeScript built-in or a name the index defines, so the next member added to `TraceEvent`'s union cannot reintroduce a dangling name silently. *Cost if wrong: three dangling names in a hover card, which is now a red test rather than a reader's problem.*

**R28. The `DeathBehaviour` correction to the SP4b design spec is this entry's, in one line.** `2026-09-06-sp4b-bot-expansion-design.md:472` still prints `onDeath?: 'resume' | 'return-and-resume' | 'fail'` where `types.ts:134-135` has seven values; SP4b plan task 15's reconciliation list does not include it, and it is closed. The generated page is unaffected either way because it reads the real type; the spec sentence is not. *Cost if wrong: a reader of the SP4b spec designs against three values.*

**R29. No line-ceiling exemption row is added, and the plan says so rather than leaving the reflex.** `scripts/line-ceiling.ps1:64`'s `$includeExt` has no `.md` and no `.json`, so `web/src/agent/API.md`, the seven pages and `api-index.json` are exempt **by extension** whatever their size, and the `steps.ts` row at `:74` exists only because that artefact is `.ts`. What **is** scanned and nobody expects: the nine `web/src/tasks/docs/examples/*.js` (`.js` is in the list for `web/eslint.config.js`'s sake) and `scripts/gen/apiDocs.ts`, via the `scripts/` include prefix. *Cost if wrong: a row in that header for nothing, and a header comment that then has to explain it.*

**R30. This entry touches nothing under `client/`, and `client/PATCHES.md` stays at 28.** P8 dispatches `interactGroundItem`, which `Client.ts:1282` already implements and validates (`1..5`, "Option 3 = Take"). Publishing ground-item option names would be a collector change in `client/src`; survey ruling 25 declines it and P8 is written to stay compatible with doing it later. *Cost if wrong: nothing in this entry; the option-name arm is an added field on the same bag whenever a later entry wants it.*

**R31. The wiki page's provenance comments are `editorial:cs:2026-09-09`, and no eighth source kind is added.** `wiki/AUTHORING.md` requires a `<!-- src: kind:ref -->` on every hand-written sentence and lists seven kinds: `content`, `engine`, `derived`, `cited`, `period`, `modern`, `editorial`. **None of them names our own product source**, which is what the docs spec's `sources.lead` wants to point at (`web/src/agent/API.md`). Adding a `product:` kind is a change to the wiki's authoring contract, its extractor and its footnote renderer, for one three-paragraph page; `editorial` already means "your own judgement call, dated so it can be revisited", which is honest for a page about our own software. *Cost if wrong: three source comments to re-tag when a `product:` kind arrives, and one footnote that reads as editorial rather than as a citation of a file in this repository.*

---

## File structure

Every file under 400 lines including tests. Estimates in parentheses, and each is a ceiling to design to rather than a target.

```
web/src/tasks/
  scriptContext.ts        (300)  R1: the ScriptContext interface and every options bag, doc-commented
  scriptContext.harness.ts (40)  type-level: each options parameter IS its named interface
  types.ts               (~230)  the run and persistence model, re-exporting scriptContext.ts
  standard.ts             (180)  P20: STANDARD, LINTS, and the five exemption lists (R2, R3, R4, I2)
  standard.test.ts        (120)
  scriptApiKeys.ts         (30)  P0 and gate 6: Record<keyof ScriptContext, true>, and nothing else
  scriptApi.ts             (60)  the one re-export entry; Task 8 step 4's list is the contract (R27)
  scriptApi.test.ts       (190)  gate 6's runtime half plus P20's api-shape gate
  docComments.test.ts      (60)  PROVISIONAL, R25: Task 9 creates it, Task 16 deletes it
  deprecate.ts             (30)  R7: warn once per run per deprecated member path
  deprecate.test.ts        (60)
  wait.ts                 (150)  P9: the wait family as a factory, lifted out of workerContext.ts
  wait.test.ts            (200)
  dialog.ts               (140)  P14: isOpen/text/options/choose/continueUntilOption/complete
  dialog.test.ts          (220)
  retry.ts                 (70)  P11
  retry.test.ts           (120)
  botExtras.ts             (70)  P8: interactGroundItem over the vendored action
  botExtras.test.ts        (90)
  attachments.ts           (60)  R8: the run-scoped screenshot sink
  attachments.test.ts      (80)
  gen/apiIndex.ts         (330)  R10, R16: the ts.Program traversal, inside web/'s own program
  gen/apiIndex.test.ts    (300)  table driven over a synthetic surface fixture
  gen/fixture.harness.ts  (100)  the synthetic ScriptContext the traversal test walks
  gen/render.ts           (250)  index -> markdown
  gen/render.test.ts      (160)
  gen/markdown.ts         (120)  the help pane's markdown subset, parsed; entry 6 replaces it
  docs/index.ts            (70)  sixteen explicit ?raw imports, typed
  docs/examples.ts         (80)  id, title, teaches, docsAnchor, source
  docs/apiIndex.test.ts   (140)  gates 2 and 3
  docs/examples.test.ts   (170)  gate 4
  docs/pages.test.ts      (130)  gate 5
  docs/00-quickstart.md ... docs/06-limits-and-trust.md          seven pages
  docs/examples/hello-status.js ... report-for-claude.js         nine files, 20 to 70 lines each

scripts/gen/
  apiDocs.ts              (130)  argv, file IO, writeOrCheckText, --check (R10, R11, R12, R35)

web/src/agent/
  API.md                          generated, committed (R11: writeOrCheckText)
  api-index.json                  generated, committed, pretty-printed (R11, R13, R22)

server/src/
  agentDocs.ts             (80)  R20: readAgentDocs(env, format) plus agentDocsResponse, two callers
  agentDocs.test.ts       (150)  including the 405 and the 503-with-a-message

web/e2e/
  api-docs.pw.test.ts      (35)  R18
```

Modified:

```
web/src/agent/workerContext.ts    the four factories wired in; the S10 comment finished (Task 2)
web/src/agent/worker.ts:374       P0: Object.keys(SCRIPT_CONTEXT_KEYS)
web/src/agent/runContext.ts       P4: makeAnchor learns level
web/src/tasks/runner.ts           P19 cooldownMs; R5's hpBelowPoints
web/src/tasks/types.ts            R8: TraceEvent's 19th variant is declared HERE, not in trace.ts
web/src/tasks/trace.ts            R8: TraceInput follows from it; no edit if the derivation holds
web/src/plugins/builtin/traceView.ts   detailOf's 19th case (:47, the exhaustive switch)
web/src/styles/layout/trace.css   the attachment rail
web/src/tasks/library/{chopAndDrop,netFishAndDrop,ironOre}.ts   R5: hardStop.hpBelowPoints
web/src/tasks/library/tutorialIsland/{finish,recovery,helpers}.ts   P14 migration
web/src/tasks/library/tutorialIsland/harness.ts   R26: split
web/eslint.config.js              an override for src/tasks/docs/examples/*.js (R-note in Task 14)
scripts/build.ps1                 gate 1, in the existing Push-Location $root group (R10, R17)
server/src/{router,index,env,types}.ts, server/.env.example       the two routes and AGENT_DOCS
deploy/lightsail/provision.ps1:115                                 the NOT-WRITTEN line
deploy/docker/server.Dockerfile                                    R19: the runtime-stage COPY
wiki/content/mechanics/scripting.md                                one standalone mechanic page
docs/VERIFICATION.md              the step 6 and step 9 rows (R17)
docs/README.md                    one authority row for the script API (R21)
CLAUDE.md                         one line naming web/src/agent/API.md (docs spec ruling 4)
docs/superpowers/specs/2026-09-06-sp4b-bot-expansion-design.md:472  R28
docs/superpowers/specs/2026-09-07-script-api-docs-design.md         the "what actually shipped" section
docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md           row 5
.claude/skills/{idlescape-library-script,idlescape-verify}/SKILL.md
```

`.claude/skills/idlescape-plugin/SKILL.md` is **conditional**, not listed above, because R21 ships no shell surface: Task 17 step 6 edits it only if a panel ends up reading the index, and otherwise says so in the ledger. A file that appears in a Modified list and not in an explicit-paths `git add` is a reconciliation a fresh reviewer has to do by hand.

**Not built here, and each has a named owner.** No studio window, editor, completion UI, linter or diagnostic surface: that is entry 6, and this entry is complete without it. **No `.d.ts` tree and no lib closure**: they exist only to feed a language service, they are roughly 600 KB of committed output, and nothing in this entry reads them; entry 6's phase 2 adds a `--declarations` mode to this same generator when it has a consumer, commits the tree and inherits gate 1 over it unchanged (docs spec section 3.3 and ruling 16). **No HTML renderer**: the studio renders the JSON directly and the wiki renders its own page, and a third renderer is a third thing to keep consistent. **No copy of the reference under `docs/`**: `docs/` holds design and superpowers material, not product artefacts (ruling 4). **No change to `compileUserScript`, `UserTaskDoc`, the Firestore rules, the 64 KB code cap or the 60-character name limit.** **The network hole SP4 section 17 claims is closed is not closed here**: this entry documents it accurately, at the strength entry 6 actually delivers, and does not promise a sandbox neither entry ships.

**Deliberately not touched, so no task spends a step on it:** `scripts/gen/tsconfig.json` (`"include": ["**/*.ts"]` already, so `apiDocs.ts` joins by existing, and **R35 keeps the generator off the `?raw` barrel modules precisely so this file needs no `vite/client` and no widened `typeRoots`**; that check exits 0 at HEAD and must still exit 0 at Task 17), `web/tsconfig.json` (no `allowJs`, so the nine `.js` examples are already outside the program), `scripts/verify.ps1` (`$TotalSteps` stays 10), `scripts/line-ceiling.ps1` (R29), `server/src/static.ts`, `server/src/gate.ts`, `web/src/types.ts` (`PanelId` unchanged), any `cs.` key, any pack id, any `engine-custom/` or `content-custom/` file, and anything under `client/` (R30).

---
## Task 1: The script-context split, the named options bags, and `Tile`

Rules S1, S4, S8 and S9 at the type level, plus P4's type half. Nothing here changes behaviour except `log`, which gains an options overload and keeps its old arm working.

**Files:**
- Create: `web/src/tasks/scriptContext.ts`
- Create: `web/src/tasks/scriptContext.harness.ts`
- Modify: `web/src/tasks/types.ts` (remove `ScriptContext` at `:179-218` and the four inline bags; re-export)
- Modify: `web/src/agent/workerContext.ts:170` (`log`'s implementation)
- Test: `web/src/agent/workerContext.test.ts` (two new cases)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces, all exported from `web/src/tasks/scriptContext.ts` and re-exported by `web/src/tasks/types.ts`:
  ```ts
  export interface Tile { x: number; z: number; level: number }
  export type TileLike = { x: number; z: number; level?: number };
  export interface WaitUntilOpts { timeoutMs?: number; label?: string }
  export interface FollowHintOpts { talk?: boolean }
  export interface ClickThroughOpts { maxClicks?: number; timeoutMs?: number }
  export interface LogOpts { level?: 'info' | 'warn' | 'error' }
  export interface HardStop { hpBelow?: number }
  export type TravelTarget = TileLike | { landmark: string } | { cluster: AtlasCluster };
  export interface ScriptContext { /* the 14 members, unchanged in behaviour */ }
  ```
  Later tasks widen `WaitUntilOpts` (Task 4), add `DialogContinueOpts`/`DialogCompleteOpts` (Task 6), `RetryOpts` (Task 5), `ScreenshotOpts`/`InteractGroundItemOpts` (Task 7) and `HardStop.hpBelowPoints` (Task 5). They all land in this file.

- [ ] **Step 1: Write the failing test**

In `web/src/agent/workerContext.test.ts`, beside the existing trace assertions:

```ts
test('log takes an options bag as well as the grandfathered positional level', () => {
  const h = harness();     // the file's existing fake at workerContext.test.ts:53, unchanged.
                           // It is `harness`, not `makeHarness`: grep before you type it.
  h.ctx.log('positional still works', 'warn');
  h.ctx.log('the compliant form', { level: 'error' });
  h.ctx.log('the default is info');
  expect(h.trace.events().filter(e => e.kind === 'log').map(e => (e as { level: string }).level))
    .toEqual(['warn', 'error', 'info']);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run from `web/`: `npx vitest run src/agent/workerContext.test.ts`
Expected: FAIL. `log('...', { level: 'error' })` is a type error under vitest's esbuild transform only at typecheck time, so the visible failure is the assertion: the second event's level is the object, not `'error'`.

- [ ] **Step 3: Create `web/src/tasks/scriptContext.ts` with the split surface**

Move `ScriptContext` (`types.ts:179-218`) verbatim, then name the four inline bags and add the coordinate type. The header states why the file exists:

```ts
// The surface a script sees, and the named options bags it passes. Split out of types.ts
// (which re-exports every name here, so no import site moved) for two reasons: the doc
// comments S11 requires put the file over the 400-line ceiling, and this file is what
// scriptApi.ts declares and what scripts/gen/apiDocs.ts walks.
//
// One world-coordinate shape, per S8: x and z, never x and y, because that is what the engine
// and the whole vendored surface use. `level` is the floor plane and is 0 when a call site
// omits it.
export interface Tile { x: number; z: number; level: number }
/** What a call site may pass where a tile is wanted. `level` defaults to 0. */
export type TileLike = { x: number; z: number; level?: number };

export interface WaitUntilOpts {
  /** Milliseconds. Defaults to DEFAULT_WAIT_MS, 20000. */
  timeoutMs?: number;
  /** Names the wait in the trace when it expires. A cancelled wait and a timed-out wait both
   *  return false, so this is the only way a reader tells them apart. */
  label?: string;
}
export interface FollowHintOpts { /** Talk to a hinted npc rather than using option 1. Default true. */ talk?: boolean }
export interface ClickThroughOpts {
  /** How many option-less frames to click past before giving up. Default 10. */
  maxClicks?: number;
  /** Milliseconds to wait for the chatbox to change between clicks. Default 4000. */
  timeoutMs?: number;
}
export interface LogOpts { level?: 'info' | 'warn' | 'error' }
/** Ends the run when hitpoints fall below the floor. */
export interface HardStop {
  /** Absolute hitpoints, not a percentage. */
  hpBelow?: number;
}
```

**Write every doc comment as it should read after the entry closes.** These land in the repository, they outlive this plan, and `scriptContext.ts` is the file the reference is generated from, so a comment naming a plan task number would reach `API.md`. Task 5 replaces `HardStop`'s body with the two-field version R5 specifies; it does not have to delete a dangling cross-reference first.

**One thing the split creates that is not written anywhere else: a type-only import cycle.** `ScriptContext`'s members reference the run model (`Task`, `RunState`, `TraceEvent`, `FoundTarget`, `TravelResult`, `HealthEvent` and the rest), which stays in `types.ts`, while `types.ts` re-exports `scriptContext.ts`. So `scriptContext.ts` opens with `import type { ... } from './types';` and `types.ts` ends with `export * from './scriptContext';`. **That is fine and it is deliberate**: a type-only cycle is erased at emit, `verbatimModuleSyntax` is not on, and nothing in the cycle is a value. It matters at exactly one place, Task 8's re-export list, which must name each type from the file that *declares* it and never from the file that re-exports it.

`TravelTarget`'s first arm becomes `TileLike`, `ScriptManifest.anchor` becomes `TileLike`, `SweepOpts.anchor` becomes `TileLike`, and `ScriptManifest.hardStop` becomes `HardStop`. `log` and `tutorial.clickThrough` gain their overloads:

```ts
  log(text: string, level?: 'info' | 'warn' | 'error'): void;   // grandfathered, S4 and R3
  log(text: string, opts: LogOpts): void;
```

- [ ] **Step 4: Reduce `types.ts` to the run model plus a re-export**

Delete the moved declarations and add, near the top beside the existing `BotActions`/`BotSDK` re-export at `:9`:

```ts
// The script-facing surface lives in scriptContext.ts (plan R1). Re-exported here so that
// `import type { ScriptContext } from './types'` keeps working everywhere it already does,
// and so this package still has one types.ts.
export * from './scriptContext';
```

Grep for the moved names to confirm nothing imports them from a third place: `grep -rn "from '.*scriptContext'" web/src` should return only this line until Task 8.

- [ ] **Step 5: Write the type-level harness**

`web/src/tasks/scriptContext.harness.ts`. It imports nothing from vitest, for the reason `web/src/tasks/api.harness.ts:7-11` gives: a harness sits outside the shipped program, so naming test types near it cannot leak vitest's ambient globals into what ships.

```ts
// Type-level only: it asserts that each options parameter on ScriptContext IS the named
// exported interface, not a structurally identical inline literal. P20's api-shape gate says
// the same thing over the ts.Program; this says it to `npm run typecheck`, which is faster and
// runs first. Inlining a bag again fails to compile here.
import type { ClickThroughOpts, FollowHintOpts, LogOpts, ScriptContext, WaitUntilOpts } from './scriptContext';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

type UntilBag = NonNullable<Parameters<ScriptContext['wait']['until']>[1]>;
type HintBag = NonNullable<Parameters<ScriptContext['tutorial']['followHint']>[0]>;
type ClickBag = NonNullable<Parameters<ScriptContext['tutorial']['clickThrough']>[0]>;

export type _UntilIsNamed = Assert<Equals<UntilBag, WaitUntilOpts>>;
export type _HintIsNamed = Assert<Equals<HintBag, FollowHintOpts>>;
export type _ClickIsNamed = Assert<Equals<ClickBag, ClickThroughOpts>>;
export type _LogOptsIsReachable = Assert<Equals<LogOpts['level'], 'info' | 'warn' | 'error' | undefined>>;
```

**`Parameters<T>` reads the LAST overload signature**, so for `log` and `clickThrough` the compliant options overload must be **declared second**, after the grandfathered positional one. Get that order wrong and the harness compiles against the positional arm and asserts nothing.

- [ ] **Step 6: Implement `log`'s overload**

`web/src/agent/workerContext.ts`, replacing the single-line `log:` at `:170`:

```ts
    log: (text: string, arg?: 'info' | 'warn' | 'error' | LogOpts) => {
      const level = typeof arg === 'string' ? arg : arg?.level ?? 'info';
      d.trace.push({ kind: 'log', level, text });
    },
```

- [ ] **Step 7: Run the tests and the typecheck**

Run from `web/`: `npx vitest run src/agent/workerContext.test.ts`
Expected: PASS, `['warn', 'error', 'info']`.
Run from `web/`: `npm run typecheck`
Expected: all three programs clean. **This is the step that proves the harness compiles**; a harness that never runs proves nothing.
Run from `web/`: `npx vitest run`
Expected: the whole suite green, which is what proves the re-export facade is complete.
Run from the repository root: `powershell -File scripts/line-ceiling.ps1`
Expected: green, and `types.ts` now around 230 lines.

- [ ] **Step 8: Commit**

```bash
git add web/src/tasks/scriptContext.ts web/src/tasks/scriptContext.harness.ts \
        web/src/tasks/types.ts web/src/agent/workerContext.ts web/src/agent/workerContext.test.ts
git -c core.safecrlf=false commit -m "refactor(tasks): split the script surface out of types.ts and name its options bags

S4 wants every options parameter to be a named exported interface and S8 wants one
world-coordinate shape. Both are type-level, so no saved script can see the change; `log`
keeps its grandfathered positional level and gains the compliant overload beside it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 2: `standard.ts`, and the sandbox comment S10 leaves half-written

P20's module half, plus the four exemption lists (R2, R3, R4) that let the api-shape gate be green on HEAD, plus the correction P20's own text asks for.

**Files:**
- Create: `web/src/tasks/standard.ts`
- Test: `web/src/tasks/standard.test.ts`
- Modify: `web/src/agent/workerContext.ts:76-87` (the block comment)

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface StandardRule { id: `S${number}`; title: string; severity: 'error' | 'warn' }
  export const STANDARD: readonly StandardRule[];              // the twelve clauses of section 4
  export interface LintRule { id: string; standard: StandardRule['id'] | StandardRule['id'][]; severity: 'error' | 'warn' | 'info' }
  export const LINTS: readonly LintRule[];                     // the studio's seventeen rules
  export const KEBAB_UNIONS: readonly string[];                // R2
  export const POSITIONAL_GRANDFATHERED: readonly string[];    // R3, S4's four plus two
  export const COUNT_EXEMPT: readonly { name: string; unit: string }[];  // R4
  export const ABBREVIATIONS: readonly string[];               // S1's list, the half a gate can decide
  export const SIGNAL_EXEMPT: readonly string[];               // S2, the options bags with no signal
  ```
  Task 16's api-shape gate reads all five lists. Entry 6's validator reads `STANDARD` and `LINTS`.

- [ ] **Step 1: Write the failing test**

`web/src/tasks/standard.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { ABBREVIATIONS, COUNT_EXEMPT, KEBAB_UNIONS, LINTS, POSITIONAL_GRANDFATHERED, SIGNAL_EXEMPT, STANDARD } from './standard';

describe('the standard, as a module', () => {
  test('is the twelve clauses of section 4, in order, with unique ids', () => {
    expect(STANDARD.map(r => r.id)).toEqual(['S1','S2','S3','S4','S5','S6','S7','S8','S9','S10','S11','S12']);
    expect(new Set(STANDARD.map(r => r.title)).size).toBe(12);
  });

  test('every lint names a clause that exists, and the severities are the three spellings both documents use', () => {
    // Seventeen, not the fourteen an earlier draft of the survey counted: the count is asserted
    // so the module and the comment beside it cannot drift again.
    expect(LINTS).toHaveLength(17);
    expect(new Set(LINTS.map(l => l.id)).size).toBe(17);
    const ids = new Set(STANDARD.map(r => r.id));
    for (const l of LINTS) {
      for (const s of Array.isArray(l.standard) ? l.standard : [l.standard]) {
        expect(ids.has(s), `${l.id} cites ${s}`).toBe(true);
      }
      expect(['error', 'warn', 'info']).toContain(l.severity);
    }
    // The middle tier is `warn`, never `warning`: the studio's agreement test compares strings.
    expect(LINTS.map(l => l.id)).toContain('no-fixed-sleep');
    expect(LINTS.find(l => l.id === 'no-fixed-sleep')!.severity).toBe('error');
  });

  test('the five exemption lists are exactly the shipped exceptions, with no spare rows', () => {
    expect([...KEBAB_UNIONS].sort()).toEqual(['DeathBehaviour', 'HealthCondition', 'PauseReason', 'RecoveryOutcome']);
    expect([...POSITIONAL_GRANDFATHERED].sort())
      .toEqual(['log', 'tutorial.clickThrough', 'wait.dialog', 'wait.item', 'wait.message', 'wait.xp']);
    expect(COUNT_EXEMPT.every(c => c.unit.length > 0)).toBe(true);
    expect(COUNT_EXEMPT.map(c => c.name)).toContain('estimateMinutes');
    // R4: the six names this entry itself adds have to be here, or the api-shape gate lands red
    // in Task 16 on the surface this same entry shipped.
    for (const n of ['attempts', 'id', 'opIndex', 'x', 'z', 'level']) {
      expect(COUNT_EXEMPT.map(c => c.name), n).toContain(n);
    }
    expect(ABBREVIATIONS).toContain('inv');
    expect(SIGNAL_EXEMPT).toEqual(['ScreenshotOpts']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run from `web/`: `npx vitest run src/tasks/standard.test.ts`
Expected: FAIL, "Failed to resolve import './standard'".

- [ ] **Step 3: Write `web/src/tasks/standard.ts`**

The clause titles are one line each and must not restate the rule; the survey spec's section 4 is the only statement of it, and a second copy here would be a second source with no gate between them (docs spec ruling 21).

```ts
// The machine-readable form of the standard. The rules themselves live once, in
// docs/superpowers/specs/2026-09-07-script-api-survey-and-standard-design.md section 4; this is
// the shape the studio's validator and the api-shape gate read, so a clause and the lint that
// enforces it cannot disagree about an id or a severity.
//
// Two shapes, not one: a clause is enforced by several lints, one lint cites a clause and a
// proposal, and three lints are advisory. Collapsing them makes the type unable to express the
// studio's own rule table.
export interface StandardRule { id: `S${number}`; title: string; severity: 'error' | 'warn' }

export const STANDARD: readonly StandardRule[] = [
  { id: 'S1',  title: 'Naming: camelCase members, PascalCase types, snake_case in a new closed union', severity: 'warn' },
  { id: 'S2',  title: 'Async and cancellation: a promise for anything slower than one expression, and an abort resolves', severity: 'error' },
  { id: 'S3',  title: 'A typed result when the caller branches, a throw only when it cannot continue', severity: 'error' },
  { id: 'S4',  title: 'At most one required positional, then one named options object', severity: 'warn' },
  { id: 'S5',  title: 'A predicate is accepted anywhere a selector is, and no magic number is a widget id', severity: 'warn' },
  { id: 'S6',  title: 'An event subscription returns one idempotent unsubscribe function', severity: 'warn' },
  { id: 'S7',  title: 'c.wait is the only wait: no fixed sleeps, a default timeout, a label, false on expiry', severity: 'error' },
  { id: 'S8',  title: 'Tiles, ticks and Ms; one Tile shape; Percent, Fraction and Points say so in the name', severity: 'warn' },
  { id: 'S9',  title: 'null means there is no such thing; a result union means it was tried and failed', severity: 'error' },
  { id: 'S10', title: 'No member exposes the transport, the DOM, the network, another session, or login', severity: 'error' },
  { id: 'S11', title: 'Every member we own carries the doc comment the reference is generated from', severity: 'error' },
  { id: 'S12', title: 'Additions over renames: add, deprecate, remove no earlier than two api versions later', severity: 'error' }
];

export interface LintRule { id: string; standard: StandardRule['id'] | StandardRule['id'][]; severity: 'error' | 'warn' | 'info' }

export const LINTS: readonly LintRule[] = [
  { id: 'no-fixed-sleep',        standard: ['S7', 'S2'], severity: 'error' },
  { id: 'no-transport-escape',   standard: 'S10', severity: 'error' },
  { id: 'no-forbidden-globals',  standard: 'S10', severity: 'error' },
  { id: 'no-eval',               standard: 'S10', severity: 'error' },
  { id: 'no-dom',                standard: 'S10', severity: 'error' },
  { id: 'no-unawaited-action',   standard: 'S2',  severity: 'error' },
  { id: 'no-missing-task-name',  standard: 'S3',  severity: 'error' },
  { id: 'no-unknown-param',      standard: 'S4',  severity: 'error' },
  { id: 'no-throw-for-timeout',  standard: 'S3',  severity: 'warn' },
  { id: 'prefer-result-branch',  standard: 'S3',  severity: 'warn' },
  { id: 'no-static-widget-id',   standard: 'S5',  severity: 'warn' },
  { id: 'no-legacy-wait',        standard: 'S7',  severity: 'warn' },
  { id: 'no-captured-signal',    standard: 'S2',  severity: 'warn' },
  { id: 'no-deprecated-member',  standard: 'S12', severity: 'warn' },
  { id: 'untrusted-text',        standard: 'S10', severity: 'info' },
  { id: 'wait-until-needs-label',standard: 'S7',  severity: 'info' },
  { id: 'manifest-has-description', standard: 'S11', severity: 'info' }
];
```

Then the four exemption lists, each carrying its reason, because a list with no reason is a list the next session deletes:

```ts
/**
 * S1 grandfathers HealthCondition by name and calls it "not a precedent". Three more closed
 * unions shipped kebab-case before the rule existed, and all four are persisted: they reach
 * RunStatus, RunSummary and the IndexedDB history rows, so a rename is a data migration rather
 * than a rename. Plan ruling R2 extends the clause to name all four instead. A NEW closed union
 * is snake_case and gets no row here.
 */
export const KEBAB_UNIONS: readonly string[] = ['HealthCondition', 'DeathBehaviour', 'RecoveryOutcome', 'PauseReason'];

/**
 * S4's own clause grandfathers four positional waits. `log(text, level?)` and
 * `tutorial.clickThrough(max?)` are two more that shipped before the rule and that saved scripts
 * call by name, so plan ruling R3 grandfathers them too. Each already has a compliant options
 * overload beside it, so nothing new is written in the old shape.
 */
export const POSITIONAL_GRANDFATHERED: readonly string[] =
  ['wait.dialog', 'wait.xp', 'wait.item', 'wait.message', 'log', 'tutorial.clickThrough'];

/**
 * S8's suffix rule covers units and says nothing about counts, and the surface has fourteen
 * counts. The api-shape gate accepts /^(max[A-Z]|n$|legs$|tiles$)/ or a unit in the doc comment;
 * these are the names outside both, each with what it counts. Plan ruling R4. A row here is one
 * line to delete the day the name gains a suffix.
 */
export const COUNT_EXEMPT: readonly { name: string; unit: string }[] = [
  { name: 'radius', unit: 'tiles' },
  { name: 'tolerance', unit: 'tiles' },
  { name: 'minDelta', unit: 'units of the thing being waited for' },
  { name: 'delta', unit: 'units of the thing being waited for' },
  { name: 'estimateMinutes', unit: 'minutes, shown to a player, deliberately not milliseconds' },
  { name: 'hpBelow', unit: 'hitpoints; deprecated in favour of hpBelowPoints' },
  // The six this entry itself adds. Without these rows the api-shape gate lands red in Task 16
  // on the surface Tasks 1 to 7 shipped, which is the worst place to discover an exemption list
  // is short: the gate looks broken and the surface looks wrong, and neither is.
  { name: 'attempts', unit: 'tries, including the first' },
  { name: 'id', unit: 'an animation id, an opaque engine number with no unit' },
  { name: 'opIndex', unit: 'the game menu ordinal, 1 to 5' },
  { name: 'x', unit: 'world tiles, east' },
  { name: 'z', unit: 'world tiles, north' },
  { name: 'level', unit: 'floor plane, 0 to 3' }
];

/**
 * S1's abbreviation clause, as the list a gate can decide. S1 says a member name is spelled out
 * rather than abbreviated; the half a mechanical check can enforce is "is this name one of the
 * abbreviations we have agreed not to use". The list is short on purpose. A name here fails the
 * api-shape gate on the surface we own; the vendored half is not scanned, because renaming
 * BotSDK's members is a fork rather than a rename.
 */
export const ABBREVIATIONS: readonly string[] =
  ['inv', 'dist', 'pos', 'cfg', 'msg', 'idx', 'len', 'num', 'val', 'obj', 'str', 'qty'];

/**
 * S2 requires every options bag introduced by section 5 to carry `signal?: AbortSignal`. One
 * does not, deliberately: `ScreenshotOpts` describes a single canvas read with no wait in it, so
 * there is nothing for a signal to interrupt and a field that does nothing is worse than an
 * absent one. Plan ruling for it is here rather than in the gate, so the reason travels with the
 * exemption. Every other bag this entry adds carries the field.
 */
export const SIGNAL_EXEMPT: readonly string[] = ['ScreenshotOpts'];
```

`opts` is deliberately **not** on that list, even though it is an abbreviation: it is the parameter name S4 itself prescribes and the api-shape gate matches on it. The list names members and options-bag fields, never the options parameter.

- [ ] **Step 4: Run the test**

Run from `web/`: `npx vitest run src/tasks/standard.test.ts`
Expected: PASS, three tests.

- [ ] **Step 5: Prove the test fails on a drifted module, with two named mutations**

Two, because the test makes two different promises and one mutation proves only one of them. Restore the row after each.

1. **Delete the `S6` row from `STANDARD`.** Expected: FAIL on the twelve-id assertion only. No lint cites `S6` (nor `S1`, `S8` or `S9`), so the clause-lookup assertion stays green, which is the point of running both.
2. **Delete the `S10` row instead.** Expected: FAIL on the twelve-id assertion **and** on the clause lookup, naming `no-transport-escape`, `no-forbidden-globals`, `no-eval`, `no-dom` and `untrusted-text` as lints citing a clause that no longer exists.

Do not skip this because the test "obviously" works: a clause-lookup assertion that never fires is a clause-lookup assertion that is scanning an empty array.

- [ ] **Step 6: Finish the sandbox comment S10 leaves half-written**

`web/src/agent/workerContext.ts:76-87` is honest that `c.sdk.transport` is reachable and stops there. P20's own text says the comment "that reads as a security claim is corrected to say so in the phase-now task that carries P20". Add, at the end of that block:

```ts
   * And be exact about the limit of that: script text runs through `new Function` in the
   * Worker's own global scope (defineScript.ts:42, worker.ts:374), so it holds `self`, and
   * `self.postMessage({ t: 'rpc', target: 'transport', method: 'logout' })` reaches
   * workerHost's answerRpc and then the RAW transport (workerHost.ts:277). The same script
   * reaches fetch and dynamic import(), because the Worker is spawned { type: 'module' }.
   * The swap below is therefore a guardrail against accidents, not a boundary a determined
   * script cannot walk around. A Worker-resident script is trusted as the account's own code
   * (decision D24), and web/src/tasks/docs/06-limits-and-trust.md says so in those words.
```

- [ ] **Step 7: Verify and commit**

Run from `web/`: `npm run typecheck && npm run lint && npx vitest run src/tasks/standard.test.ts src/agent/workerContext.test.ts`
Expected: clean, and the workerContext suite unchanged (a comment edit must not move a test).

```bash
git add web/src/tasks/standard.ts web/src/tasks/standard.test.ts web/src/agent/workerContext.ts
git -c core.safecrlf=false commit -m "feat(tasks): declare the standard as a module, with its four exemption lists

P20's module half. The twelve clauses live once in the survey spec; this is the shape the
studio validator and the api-shape gate read. The exemption lists (R2, R3, R4) are what let
that gate be green on the surface as it actually shipped, each with the reason beside it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 3: P4's anchor, and the first deprecation there has ever been

`Tile` through the one member that returns a coordinate, plus S12's warn-once (R7), which this entry has to build because it creates the deprecation the mechanism exists for.

**Files:**
- Create: `web/src/tasks/deprecate.ts`, `web/src/tasks/deprecate.test.ts`
- Modify: `web/src/agent/runContext.ts:29-37` (`makeAnchor`), `web/src/agent/workerContext.ts:32` (`ContextDeps.anchor`) and `:166`, `web/src/tasks/scriptContext.ts` (the `anchor` overloads)
- Modify: `web/src/tasks/library/tutorialIsland/recovery.ts:134`, `:191`; `web/src/agent/runHealth.ts:104`; `web/src/agent/worker.ts:251`
- Test: `web/src/agent/runContext.test.ts:75-91` (widened), `web/src/agent/workerContext.test.ts` (the deprecation cases)

**Interfaces:**
- Consumes: `Tile`, `TileLike` from Task 1.
- Produces:
  ```ts
  // web/src/tasks/deprecate.ts
  export interface Deprecations { warn(path: string, message: string): void; reset(): void }
  export function createDeprecations(log: (text: string) => void): Deprecations;
  // web/src/tasks/scriptContext.ts
  anchor(tile?: TileLike): Tile;
  /** @deprecated Use `anchor({ x, z })`. Removed in api 3. */
  anchor(x?: number, z?: number): Tile;
  // web/src/agent/runContext.ts
  export function makeAnchor(state: () => WorldState | null): (a?: TileLike | number, z?: number) => Tile;
  ```

- [ ] **Step 1: Write the failing tests**

`web/src/tasks/deprecate.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { createDeprecations } from './deprecate';

describe('createDeprecations', () => {
  test('warns once per member path, not once per call', () => {
    const lines: string[] = [];
    const d = createDeprecations(t => lines.push(t));
    d.warn('c.anchor(x, z)', 'Use c.anchor({ x, z }). Removed in api 3.');
    d.warn('c.anchor(x, z)', 'Use c.anchor({ x, z }). Removed in api 3.');
    d.warn('hardStop.hpBelow', 'Use hpBelowPoints. Removed in api 3.');
    expect(lines).toEqual([
      'c.anchor(x, z) is deprecated. Use c.anchor({ x, z }). Removed in api 3.',
      'hardStop.hpBelow is deprecated. Use hpBelowPoints. Removed in api 3.'
    ]);
  });

  test('a second run warns again, because the set is run scoped', () => {
    const lines: string[] = [];
    const d = createDeprecations(t => lines.push(t));
    d.warn('c.anchor(x, z)', 'x');
    d.reset();
    d.warn('c.anchor(x, z)', 'x');
    expect(lines).toHaveLength(2);
  });
});
```

And in `web/src/agent/runContext.test.ts`, widening the existing block at `:75-91`:

```ts
test('the anchor is a Tile, seeded from the player, and both call shapes reach it', () => {
  const anchor = makeAnchor(() => ({ player: { worldX: 3222, worldZ: 3218, level: 1 } } as WorldState));
  expect(anchor()).toEqual({ x: 3222, z: 3218, level: 1 });
  expect(anchor({ x: 10, z: 20 })).toEqual({ x: 10, z: 20, level: 0 });   // level defaults to 0
  expect(anchor({ x: 10, z: 20, level: 2 })).toEqual({ x: 10, z: 20, level: 2 });
  expect(anchor(30, 40)).toEqual({ x: 30, z: 40, level: 0 });             // the deprecated arm still works
});
```

- [ ] **Step 2: Run them and watch them fail**

Run from `web/`: `npx vitest run src/tasks/deprecate.test.ts src/agent/runContext.test.ts`
Expected: FAIL. The first file cannot resolve `./deprecate`; the second fails on the missing `level` in the first three assertions.

- [ ] **Step 3: Write `web/src/tasks/deprecate.ts`**

```ts
// S12 step 2: "one log line at warn the first time a run touches a deprecated member, so a
// player who never reads the reference still finds out". Run scoped, not Worker scoped: a
// second run says it again, because the player watching that run has not seen it.
export interface Deprecations {
  warn(path: string, message: string): void;
  /** Called when a run ends, so the next run warns again. */
  reset(): void;
}

export function createDeprecations(log: (text: string) => void): Deprecations {
  const seen = new Set<string>();
  return {
    warn(path, message) {
      if (seen.has(path)) return;
      seen.add(path);
      log(`${path} is deprecated. ${message}`);
    },
    reset() { seen.clear(); }
  };
}
```

- [ ] **Step 4: Teach `makeAnchor` a level, and keep both call shapes**

`web/src/agent/runContext.ts`, replacing `:29-37`:

```ts
export function makeAnchor(state: () => WorldState | null): (a?: TileLike | number, z?: number) => Tile {
  let at: Tile | null = null;
  return (a, z) => {
    // Two arms on purpose: `anchor({ x, z })` is the compliant form and `anchor(x, z)` is the
    // form every saved script that ever set an anchor is written in. S12 says additions over
    // renames, so the old arm keeps working until api 3 removes it.
    if (typeof a === 'object') at = { x: a.x, z: a.z, level: a.level ?? 0 };
    else if (a !== undefined && z !== undefined) at = { x: a, z, level: 0 };
    const player = state()?.player;
    at ??= { x: player?.worldX ?? 0, z: player?.worldZ ?? 0, level: player?.level ?? 0 };
    return { ...at };
  };
}
```

`PlayerState` carries `level` (vendored `sdk/types.ts:35`), which is why it seeds the same way `x` and `z` do.

- [ ] **Step 5: Wire the deprecation warning at the context**

`web/src/agent/workerContext.ts`. `ContextDeps` gains `deprecations: Deprecations` and `anchor`'s type widens to the two arms. At `:166`, `anchor: d.anchor` becomes:

```ts
    anchor: ((a?: TileLike | number, z?: number): Tile => {
      if (typeof a === 'number') {
        d.deprecations.warn('c.anchor(x, z)', 'Use c.anchor({ x, z }). Removed in api 3.');
      }
      return d.anchor(a, z);
    }) as ScriptContext['anchor'],
```

The cast is the overload signature, not a widening: `as ScriptContext['anchor']` is how a single implementation is presented as an overloaded member, and it is not `as any`. `runContext.ts` builds `createDeprecations(text => trace.push({ kind: 'log', level: 'warn', text }))` and calls `reset()` where the run's context is disposed.

- [ ] **Step 6: Move the three consumers and the setter**

`tutorialIsland/recovery.ts:134` and `:191` read `c.travel.to(c.anchor(), ...)`, which now gets a `Tile`; `TravelTarget`'s first arm is `TileLike` (Task 1), so both compile unchanged. `runHealth.ts:104` is the third consumer P4's cost paragraph does not name and is the same shape. `worker.ts:251` is the setter and passes through. Grep to be sure nothing else calls it: `grep -rn "anchor(" web/src --include=*.ts | grep -v test`.

- [ ] **Step 6b: Widen the test harness's `anchor` fake, or step 7 cannot pass**

`web/src/agent/workerContext.test.ts:85-88` is a local fake with the **old** shape:

```ts
    anchor: (x, z) => {
      if (x !== undefined && z !== undefined) anchor = { x, z };
      return { ...anchor };
    },
```

over `let anchor = { x: 0, z: 0 }`. It returns two fields and ignores an object argument, so step 7's assertions would fail on the harness rather than on the code under test, which is the worst way for a test to be red. Replace it with the dependency's real shape:

```ts
  let anchor: Tile = { x: 0, z: 0, level: 0 };
  ...
    anchor: (a?: TileLike | number, z?: number): Tile => {
      if (typeof a === 'object') anchor = { x: a.x, z: a.z, level: a.level ?? 0 };
      else if (a !== undefined && z !== undefined) anchor = { x: a, z, level: 0 };
      return { ...anchor };
    },
```

The same `level` field may be missing from the anchor fixtures in `recovery.test.ts` and `recovery.death.test.ts`; step 8 runs both.

- [ ] **Step 7: Add the deprecation's own behavioural test**

In `web/src/agent/workerContext.test.ts` (the file's helper is `harness`, at `:53`, not `makeHarness`):

```ts
test('c.anchor(x, z) warns once and still works; c.anchor({ x, z }) is silent', () => {
  const h = harness();
  expect(h.ctx.anchor(3222, 3218)).toEqual({ x: 3222, z: 3218, level: 0 });
  h.ctx.anchor(10, 20);
  h.ctx.anchor({ x: 30, z: 40 });
  const warns = h.trace.events().filter(e => e.kind === 'log' && (e as { level: string }).level === 'warn');
  expect(warns.map(e => (e as { text: string }).text))
    .toEqual(['c.anchor(x, z) is deprecated. Use c.anchor({ x, z }). Removed in api 3.']);
});
```

- [ ] **Step 8: Run everything and commit**

Run from `web/`: `npx vitest run src/tasks/deprecate.test.ts src/agent/runContext.test.ts src/agent/workerContext.test.ts src/agent/runHealth.test.ts src/tasks/library/tutorialIsland`
Expected: PASS. `recovery.test.ts` and `recovery.death.test.ts` build anchors and are the two most likely to need their fixtures widened with a `level`.
Run from `web/`: `npm run typecheck && npx vitest run`
Expected: clean.

```bash
git add web/src/tasks/deprecate.ts web/src/tasks/deprecate.test.ts web/src/tasks/scriptContext.ts \
        web/src/agent/runContext.ts web/src/agent/runContext.test.ts web/src/agent/workerContext.ts \
        web/src/agent/workerContext.test.ts web/src/agent/worker.ts web/src/agent/runHealth.ts \
        web/src/tasks/library/tutorialIsland/recovery.ts
git -c core.safecrlf=false commit -m "feat(tasks): anchor returns a Tile, and deprecating a member now says so at run time

P4's type and overload, plus the warn-once S12 step 2 has always required and that nothing
implemented, because until now nothing had been deprecated. anchor(x, z) keeps working: it is
reached by string from every saved script that ever set one.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 4: P9, and the wait family as a factory

`resetWhen`, `animation` and `hp`, plus R6's `wait.ticks` widening. The family moves out of `workerContext.ts` (294 lines, and three more proposals still to land) into a factory, exactly as `createTravel` and `createFind` already are.

**Files:**
- Create: `web/src/tasks/wait.ts`, `web/src/tasks/wait.test.ts`
- Modify: `web/src/agent/workerContext.ts` (`untilP`, `ticks` and the whole `wait` literal move out; the factory is wired in), `web/src/tasks/scriptContext.ts` (the family's declarations)
- Test: `web/src/agent/workerContext.test.ts` (the existing wait cases stay and must still pass unchanged)

**Interfaces:**
- Consumes: `WaitUntilOpts` (Task 1), which gains two fields here.
- Produces:
  ```ts
  export interface WaitUntilOpts {
    timeoutMs?: number; label?: string;
    /** Re-arms the timeout each time this fires. A predicate that is always true never times out. */
    resetWhen?: (s: WorldState) => boolean;
    /** Raced with the task signal. */
    signal?: AbortSignal;
  }
  export interface WaitAnimationOpts { id?: number; timeoutMs?: number; label?: string; signal?: AbortSignal }
  export interface WaitHpOpts { belowPercent?: number; abovePercent?: number; timeoutMs?: number; label?: string; signal?: AbortSignal }
  export interface WaitDeps {
    state(): WorldState;
    onState(cb: (s: WorldState) => void): () => void;
    onTick(cb: () => void): () => void;
    signal(): AbortSignal;
    log(text: string, level: 'warn'): void;
  }
  export const DEFAULT_WAIT_MS = 20_000;
  export function createWait(d: WaitDeps): ScriptContext['wait'];
  ```
  `createWait` is what Task 6's `createDialog` composes its `wait.dialog` over, so it is built first.

- [ ] **Step 1: Write the failing tests**

`web/src/tasks/wait.test.ts`. It drives a fake clock and a fake state stream; there is no DOM in any of it.

```ts
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { createWait } from './wait';
import type { WorldState } from '../agent/types';

function harness(initial: Partial<WorldState> = {}) {
  let s = initial as WorldState;
  const subs = new Set<(w: WorldState) => void>();
  const ticks = new Set<() => void>();
  const warns: string[] = [];
  const ctl = new AbortController();
  const wait = createWait({
    state: () => s,
    onState: cb => { subs.add(cb); return () => subs.delete(cb); },
    onTick: cb => { ticks.add(cb); return () => ticks.delete(cb); },
    signal: () => ctl.signal,
    log: t => warns.push(t)
  });
  return {
    wait, warns, ctl,
    push(next: Partial<WorldState>) { s = { ...s, ...next } as WorldState; for (const cb of [...subs]) cb(s); },
    tick() { for (const cb of [...ticks]) cb(); }
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('wait.until with resetWhen', () => {
  test('re-arms the timeout while the second signal keeps firing', async () => {
    const h = harness({ player: { animId: 1 } } as Partial<WorldState>);
    const p = h.wait.until(s => s.player?.animId === -1, { timeoutMs: 1_000, label: 'chop', resetWhen: s => s.player?.animId === 1 });
    await vi.advanceTimersByTimeAsync(900);
    h.push({ player: { animId: 1 } } as Partial<WorldState>);   // re-arms
    await vi.advanceTimersByTimeAsync(900);
    h.push({ player: { animId: -1 } } as Partial<WorldState>);
    await expect(p).resolves.toBe(true);
    expect(h.warns).toEqual([]);
  });

  test('the always-true footgun: it never times out, and that is documented rather than fixed', async () => {
    const h = harness({ player: { animId: 1 } } as Partial<WorldState>);
    const p = h.wait.until(() => false, { timeoutMs: 1_000, label: 'never', resetWhen: () => true });
    for (let i = 0; i < 10; i++) { await vi.advanceTimersByTimeAsync(900); h.push({}); }
    h.ctl.abort();                                   // only the abort ends it
    await expect(p).resolves.toBe(false);
  });
});

describe('the new family members', () => {
  test('animation baselines at call time and resolves when the id changes', async () => {
    const h = harness({ player: { animId: 7 } } as Partial<WorldState>);
    const p = h.wait.animation({ timeoutMs: 5_000, label: 'swing' });
    h.push({ player: { animId: 7 } } as Partial<WorldState>);   // unchanged, still waiting
    h.push({ player: { animId: 9 } } as Partial<WorldState>);
    await expect(p).resolves.toBe(true);
  });

  test('animation with an id waits for that id specifically', async () => {
    const h = harness({ player: { animId: -1 } } as Partial<WorldState>);
    const p = h.wait.animation({ id: 879, timeoutMs: 5_000 });
    h.push({ player: { animId: 4 } } as Partial<WorldState>);
    h.push({ player: { animId: 879 } } as Partial<WorldState>);
    await expect(p).resolves.toBe(true);
  });

  test('hp takes a required bag and reads percent of the maximum', async () => {
    const h = harness({ player: { hp: 30, maxHp: 100 } } as Partial<WorldState>);
    const p = h.wait.hp({ belowPercent: 20, timeoutMs: 5_000, label: 'hurt' });
    h.push({ player: { hp: 25, maxHp: 100 } } as Partial<WorldState>);
    h.push({ player: { hp: 19, maxHp: 100 } } as Partial<WorldState>);
    await expect(p).resolves.toBe(true);
  });

  test('a timeout writes one labelled warn line and resolves false', async () => {
    const h = harness({ player: { hp: 100, maxHp: 100 } } as Partial<WorldState>);
    const p = h.wait.hp({ belowPercent: 20, timeoutMs: 1_000, label: 'hurt' });
    await vi.advanceTimersByTimeAsync(1_100);
    await expect(p).resolves.toBe(false);
    expect(h.warns).toEqual(['wait hurt timed out after 1000ms']);
  });

  test("a caller's own signal ends the wait without ending the task", async () => {
    const h = harness({});
    const own = new AbortController();
    const p = h.wait.until(() => false, { timeoutMs: 60_000, label: 'own', signal: own.signal });
    own.abort();
    await expect(p).resolves.toBe(false);
    expect(h.ctl.signal.aborted).toBe(false);
  });

  test('ticks resolves true when it counted, false when the run was stopped (R6)', async () => {
    const h = harness({});
    const counted = h.wait.ticks(2);
    h.tick(); h.tick();
    await expect(counted).resolves.toBe(true);
    const stopped = h.wait.ticks(5);
    h.ctl.abort();
    await expect(stopped).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run from `web/`: `npx vitest run src/tasks/wait.test.ts`
Expected: FAIL, "Failed to resolve import './wait'".

- [ ] **Step 3: Write `web/src/tasks/wait.ts`**

Move `untilP` (`workerContext.ts:98-119`) and `ticks` (`:121-137`) in unchanged in behaviour, then add the three new arms. `untilP` gains the two new options; the re-arm is one `clearTimeout` plus one `setTimeout` inside the subscription it already owns.

```ts
// The whole wait family, S7's "c.wait is the only sanctioned wait", as a factory over the four
// things a wait needs. It lives here rather than in workerContext.ts for the reason
// runContext.ts:1-7 gives about seams, and because workerContext.ts has no room: it was 294
// lines before this proposal and three more land beside it.
export const DEFAULT_WAIT_MS = 20_000;

export function createWait(d: WaitDeps): ScriptContext['wait'] {
  const untilP = (pred: (s: WorldState) => boolean, o: WaitUntilOpts = {}): Promise<boolean> =>
    new Promise(res => {
      const timeoutMs = o.timeoutMs ?? DEFAULT_WAIT_MS;
      if (safe(pred, d.state())) { res(true); return; }
      const task = d.signal();
      let settled = false;
      let timer: ReturnType<typeof setTimeout>;
      const done = (v: boolean): void => {
        if (settled) return;
        settled = true;
        off();
        task.removeEventListener('abort', onAbort);
        o.signal?.removeEventListener('abort', onAbort);
        clearTimeout(timer);
        res(v);
      };
      const arm = (): void => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          // The label is the only thing that separates a timeout from a cancellation in a
          // trace, because S2 makes both resolve false. S7 requires one for that reason.
          if (o.label) d.log(`wait ${o.label} timed out after ${timeoutMs}ms`, 'warn');
          done(false);
        }, timeoutMs);
      };
      const off = d.onState(s => {
        if (safe(pred, s)) { done(true); return; }
        // DreamBot documents the footgun and we keep it rather than fixing it: a resetWhen that
        // is always true re-arms on every snapshot, so the wait never expires. Only an abort
        // ends it. The doc comment on WaitUntilOpts.resetWhen says so.
        if (o.resetWhen && safe(o.resetWhen, s)) arm();
      });
      const onAbort = (): void => done(false);
      task.addEventListener('abort', onAbort);
      o.signal?.addEventListener('abort', onAbort);
      arm();
      if (task.aborted || o.signal?.aborted) done(false);
    });

  return {
    until: untilP,
    ticks,                                   // moved verbatim, then widened to Promise<boolean>
    dialog: (re, t) => untilP(s => !!s.dialog?.isOpen && (!re || re.test(dialogText(s))), { timeoutMs: t, label: 'dialog' }),
    xp: (skill, min = 1, t) => { const base = skillXp(d.state(), skill); return untilP(s => skillXp(s, skill) - base >= min, { timeoutMs: t, label: `xp ${skill}` }); },
    item: (key, delta = 1, t) => { const base = itemCount(d.state(), key); return untilP(s => itemCount(s, key) - base >= delta, { timeoutMs: t, label: `item ${key}` }); },
    message: (re, t) => { const since = lastMessageTick(d.state()); return untilP(s => (s.gameMessages ?? []).some(m => m.tick > since && re.test(m.text)), { timeoutMs: t, label: 'message' }); },
    idle: t => untilP(s => (s.player?.animId ?? -1) === -1, { timeoutMs: t, label: 'idle' }),
    animation: (o = {}) => {
      // The baseline is captured at call time, like xp, item and message, so there is no
      // missed-edge race between the call and the first snapshot after it.
      const base = d.state().player?.animId ?? -1;
      const hit = (s: WorldState): boolean =>
        o.id === undefined ? (s.player?.animId ?? -1) !== base : (s.player?.animId ?? -1) === o.id;
      return untilP(hit, { timeoutMs: o.timeoutMs, label: o.label ?? 'animation', signal: o.signal });
    },
    hp: o => untilP(s => {
      const pct = hpPercent(s);
      if (pct === null) return false;
      if (o.belowPercent !== undefined && pct < o.belowPercent) return true;
      return o.abovePercent !== undefined && pct > o.abovePercent;
    }, { timeoutMs: o.timeoutMs, label: o.label ?? 'hp', signal: o.signal })
  };
}
```

**Four helpers move, one is new, and one stays.** `skillXp`, `itemCount`, `lastMessageTick` and `safe` move here from `workerContext.ts:255-294` with no change; leaving copies behind is a second source. `dialogText` moves too, and Task 6's `createDialog` imports it from here rather than from `workerContext.ts`. **`chatFrame` (`:284-292`) stays in `workerContext.ts`** until Task 6, because `tutorial.clickThrough` at `:226-244` is its only caller and Task 6 is what moves that body into `dialog.ts`.

**`hpPercent` does not exist and has to be written.** Grep confirms it: `workerContext.ts:255-294` has no such helper and neither does anywhere else in `web/src`. It is four lines, and its null case is what the "no hp published" test at step 1 asserts:

```ts
/** Current hitpoints as a percentage of the maximum, or null when the world has not published either. */
function hpPercent(s: WorldState): number | null {
  const hp = s.player?.hp;
  const max = s.player?.maxHp;
  if (typeof hp !== 'number' || typeof max !== 'number' || max <= 0) return null;
  return (hp / max) * 100;
}
```

`hp` and `maxHp` are both on `PlayerState` (`web/src/vendor/rs-sdk/sdk/types.ts:27` and `:29`). `max <= 0` is folded into the null arm rather than allowed to divide: a zero maximum is a world that has not finished publishing, not a dead player.

- [ ] **Step 4: Declare the family in `scriptContext.ts`, with `ticks` widened**

```ts
  wait: {
    until(pred: (s: WorldState) => boolean, opts?: WaitUntilOpts): Promise<boolean>;
    /** Waits `n` server ticks. True when it counted them, false when the run was stopped first. */
    ticks(n: number): Promise<boolean>;
    /* the four grandfathered positional members are unchanged */
    animation(opts?: WaitAnimationOpts): Promise<boolean>;
    /** The bag is required because a threshold with neither side set waits forever. */
    hp(opts: WaitHpOpts): Promise<boolean>;
  };
```

- [ ] **Step 5: Wire the factory into `workerContext.ts` and delete what moved**

```ts
  const wait = createWait({
    state, onState, onTick: d.onTick, signal: d.signal,
    log: (text, level) => d.trace.push({ kind: 'log', level, text })
  });
```
and `wait` goes into the `ctx` literal in place of the removed object. `untilP` had one other caller, `tutorial.clickThrough` (`:239-242`); it becomes `wait.until(...)` there, which Task 6 then replaces entirely.

- [ ] **Step 6: Run the tests**

Run from `web/`: `npx vitest run src/tasks/wait.test.ts src/agent/workerContext.test.ts src/agent/workerContext.tutorial.test.ts`
Expected: PASS, all three files. **The existing `workerContext.test.ts` wait cases must pass unedited**: if one needs changing, the move was not behaviour-preserving and the change is a defect, not a fixture update.

- [ ] **Step 7: Prove the footgun test is load bearing**

Delete the `if (o.resetWhen && safe(o.resetWhen, s)) arm();` line and rerun.
Expected: the re-arm test fails (`resolves.toBe(true)` becomes `false` after the timeout fires). Restore it.

- [ ] **Step 8: Verify and commit**

Run from `web/`: `npm run typecheck && npm run lint && npx vitest run`
Run from the repository root: `powershell -File scripts/line-ceiling.ps1`
Expected: green, and `workerContext.ts` now around 200 lines.

```bash
git add web/src/tasks/wait.ts web/src/tasks/wait.test.ts web/src/tasks/scriptContext.ts \
        web/src/agent/workerContext.ts web/src/agent/workerContext.test.ts
git -c core.safecrlf=false commit -m "feat(tasks): complete the wait family with resetWhen, animation and hp

P9. The family moves into a factory beside createTravel and createFind, because
workerContext.ts had no room for three more proposals. wait.ticks now returns a boolean (R6),
which no saved script can observe: JavaScript discards an unused return value.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---
## Task 5: P11's `c.retry`, P19's `cooldownMs`, and S8's `hpBelowPoints`

Three small things that all live at the same seam: how a run decides to try again. Doing them in one task is what lets the composition rule be stated once and tested once.

**Files:**
- Create: `web/src/tasks/retry.ts`, `web/src/tasks/retry.test.ts`
- Modify: `web/src/tasks/runner.ts:130-131` (`hpBelowPoints`) and `:136-148` (the cooldown), `web/src/tasks/scriptContext.ts` (`RetryOpts`, `retry`, `HardStop.hpBelowPoints`), `web/src/agent/workerContext.ts` (wire `createRetry`)
- Modify: `web/src/tasks/library/{chopAndDrop,netFishAndDrop,ironOre}.ts` (`hardStop`)
- Test: `web/src/tasks/runner.test.ts`, `web/src/tasks/library/librarySource.test.ts` (already compiles the fork seeds, so it is the gate on the library edit)

**Interfaces:**
- Consumes: `createWait`'s `ticks` (Task 4), `createDeprecations` (Task 3).
- Produces:
  ```ts
  export interface RetryOpts<T> {
    /** Default 3. */ attempts?: number;
    /** What counts as success. Required, which is why the bag is. */ until: (r: T) => boolean;
    /** Ticks, not milliseconds (S8). Default [1, 2, 4]. */ backoffTicks?: number | number[];
    label?: string; signal?: AbortSignal;
  }
  export function createRetry(d: { ticks(n: number): Promise<boolean>; signal(): AbortSignal; log(text: string): void }): ScriptContext['retry'];
  // scriptContext.ts
  retry<T>(fn: () => Promise<T>, opts: RetryOpts<T>): Promise<T>;
  export interface HardStop { /** @deprecated Use `hpBelowPoints`. Removed in api 3. */ hpBelow?: number; hpBelowPoints?: number }
  ```

**The composition rule, stated once and then tested.** Four retry mechanisms exist after this task: `Task.maxAttempts` (declarative, runner owned), `Task.cooldownMs` (P19), `c.retry` (script owned) and the recovery ladder's occurrence budget. **`c.retry` lives entirely inside one task attempt**: its backoff counts against the task's `timeoutMs`, its attempts do not touch `maxAttempts`, and it returns rather than retries once the signal aborts. **A `cooldownMs` skip is not an attempt and does not reset the attempt ladder**: a task skipped for being on cooldown has not run, so counting it would let a cooldown quietly consume `maxAttempts`, and resetting the ladder would let a task with a cooldown retry forever.

- [ ] **Step 1: Write the failing tests for `c.retry`**

`web/src/tasks/retry.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest';
import { createRetry } from './retry';

function harness() {
  const ctl = new AbortController();
  const waited: number[] = [];
  const logs: string[] = [];
  const retry = createRetry({
    ticks: async n => { waited.push(n); return !ctl.signal.aborted; },
    signal: () => ctl.signal,
    log: t => logs.push(t)
  });
  return { retry, waited, logs, ctl };
}

describe('c.retry', () => {
  test('returns the first result that satisfies `until`, and does not call fn again', async () => {
    const h = harness();
    const fn = vi.fn().mockResolvedValueOnce({ success: false }).mockResolvedValueOnce({ success: true });
    const r = await h.retry(fn, { until: (x: { success: boolean }) => x.success, label: 'open the bank' });
    expect(r).toEqual({ success: true });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(h.waited).toEqual([1]);                       // one backoff, the first of [1, 2, 4]
  });

  test('gives up after `attempts` and returns the last result rather than throwing', async () => {
    const h = harness();
    const fn = vi.fn().mockResolvedValue({ success: false, reason: 'target_not_found' });
    const r = await h.retry(fn, { attempts: 3, until: (x: { success: boolean }) => x.success });
    expect(fn).toHaveBeenCalledTimes(3);
    expect(r).toEqual({ success: false, reason: 'target_not_found' });
    expect(h.waited).toEqual([1, 2]);                    // no backoff after the last attempt
  });

  test('an abort between attempts returns immediately, so a stop is never delayed by a backoff', async () => {
    const h = harness();
    const fn = vi.fn().mockImplementation(async () => { h.ctl.abort(); return { success: false }; });
    const r = await h.retry(fn, { attempts: 5, until: (x: { success: boolean }) => x.success });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ success: false });
  });

  test('backoffTicks accepts one number as well as a ladder', async () => {
    const h = harness();
    const fn = vi.fn().mockResolvedValue(false);
    await h.retry(fn, { attempts: 3, backoffTicks: 2, until: (x: boolean) => x });
    expect(h.waited).toEqual([2, 2]);
  });
});
```

- [ ] **Step 2: Write the failing tests for the cooldown and the hp floor**

In `web/src/tasks/runner.test.ts`:

```ts
test('a task on cooldown is skipped, and the skip is not an attempt', async () => {
  // The task fails once, which starts its cooldown; the runner must not count the skipped
  // ticks against maxAttempts, or a cooldown quietly spends the ladder.
  const r = harnessWith([{ name: 'flaky', when: () => true, cooldownMs: 5_000, maxAttempts: 2, run: failOnce }]);
  await r.runTicks(3);
  expect(r.calls('flaky')).toBe(1);
  expect(r.status().state).not.toBe('failed');
});

test('a cooldown skip refreshes lastMatchAt, so a long cooldown does not manufacture a stuck pause', async () => {
  // stuckAfterMs defaults to 45s. A run whose only matching task is on a 60s cooldown has a
  // task that matches; it just is not due. Pausing `stuck` there would be a lie.
  const r = harnessWith([{ name: 'slow', when: () => true, cooldownMs: 60_000, run: ok }], { stuckAfterMs: 45_000 });
  await r.runTicks(1);
  r.advance(50_000);
  await r.runTicks(1);
  expect(r.status().reason).toBeUndefined();
});

test('hardStop reads hpBelowPoints, and still honours the deprecated hpBelow', async () => {
  const a = harnessWith([alwaysTask], { hardStop: { hpBelowPoints: 10 } });
  a.setState({ player: { hp: 9 } });
  await a.runTicks(1);
  expect(a.status().reason).toBe('hard-stop');

  const b = harnessWith([alwaysTask], { hardStop: { hpBelow: 10 } });
  b.setState({ player: { hp: 9 } });
  await b.runTicks(1);
  expect(b.status().reason).toBe('hard-stop');
});
```

- [ ] **Step 3: Run them and watch them fail**

Run from `web/`: `npx vitest run src/tasks/retry.test.ts src/tasks/runner.test.ts`
Expected: FAIL. `./retry` does not resolve; the three runner cases fail because `cooldownMs` is read by nothing and `hpBelowPoints` does not exist.

- [ ] **Step 4: Write `web/src/tasks/retry.ts`**

```ts
// P11. Pure composition over wait.ticks and the signal: it starts nothing, owns nothing and
// aborts between attempts, so a stop is never delayed by a backoff.
//
// How it composes with the other three retry mechanisms, because a script that nests all three
// otherwise gets behaviour nobody specified: c.retry lives entirely inside ONE task attempt.
// Its backoff counts against the task's timeoutMs, its attempts do not touch Task.maxAttempts,
// and it never touches the recovery ladder's occurrence budget.
const DEFAULT_BACKOFF: readonly number[] = [1, 2, 4];

export function createRetry(d: RetryDeps): ScriptContext['retry'] {
  return async function retry<T>(fn: () => Promise<T>, o: RetryOpts<T>): Promise<T> {
    const attempts = Math.max(1, o.attempts ?? 3);
    const ladder = typeof o.backoffTicks === 'number' ? [o.backoffTicks] : (o.backoffTicks ?? DEFAULT_BACKOFF);
    let last: T | undefined;
    for (let i = 0; i < attempts; i++) {
      last = await fn();
      if (o.until(last)) return last;
      if (d.signal().aborted || o.signal?.aborted) return last;
      if (i === attempts - 1) break;
      if (o.label) d.log(`retry ${o.label}: attempt ${i + 1} of ${attempts} did not succeed`);
      await d.ticks(ladder[Math.min(i, ladder.length - 1)]);
      if (d.signal().aborted || o.signal?.aborted) return last;
    }
    return last as T;
  };
}
```

- [ ] **Step 5: Implement the cooldown in `runner.ts`**

At the task selection (`runner.ts:136-147`), around the existing `script.tasks.find(...)`:

```ts
        const lastExit = new Map<string, number>();          // hoisted to the loop's scope
        ...
        const due = (t: Task): boolean => {
          const cd = t.cooldownMs;
          if (cd === undefined) return true;
          const at = lastExit.get(t.name);
          return at === undefined || d.now() - at >= cd;
        };
        // The recovery is drained FIRST and `matched` is computed only when there is none.
        // At HEAD the `??` short-circuits, so a pending recovery evaluates no script predicate
        // at all; hoisting the `find` above it would run every author-written `when` on every
        // recovery tick, which is a behaviour change in a hot loop over code we do not control.
        // The comment at runner.ts:133-135 is about exactly that precedence.
        const recovered = d.recovery?.();
        const matched = recovered ? undefined : script.tasks.find(t => { try { return t.when(s, d.ctx); } catch { return false; } });
        const task = recovered ?? (matched && due(matched) ? matched : undefined);
        ...
        // A task that matched but is on cooldown HAS matched: refreshing lastMatchAt here is
        // what stops a cooldown longer than stuckAfterMs from turning into a stuck pause the
        // player never caused. The skip is not an attempt, so `fails` is untouched.
        if (!task && matched) lastMatchAt = d.now();
```
and `lastExit.set(task.name, d.now())` after `runTask` returns.

The hp floor at `:130-131` becomes:

```ts
        const floor = script.hardStop?.hpBelowPoints ?? script.hardStop?.hpBelow;
```

- [ ] **Step 6: Move the three library scripts and the `HardStop` declaration**

`scriptContext.ts`:

```ts
export interface HardStop {
  /** Absolute hitpoints. @deprecated Use `hpBelowPoints`. Removed in api 3. */
  hpBelow?: number;
  /** Absolute hitpoints, not a percentage. The run ends when hp falls below this. */
  hpBelowPoints?: number;
}
```

`chopAndDrop.ts:12` and its two siblings change `hardStop: { hpBelow: N }` to `hpBelowPoints`. **This is the S12 clause that says the shipped corpus never demonstrates a deprecated idiom**, and `librarySource.test.ts` compiles all three fork seeds, so it is already the gate on it.

- [ ] **Step 7: Run the tests, and prove the cooldown test is load bearing**

Run from `web/`: `npx vitest run src/tasks/retry.test.ts src/tasks/runner.test.ts src/tasks/library/librarySource.test.ts`
Expected: PASS.
Then delete the `if (!task && matched) lastMatchAt = d.now();` line and rerun.
Expected: the stuck-pause test fails with `reason` equal to `'stuck'`. Restore it. That one line is the whole of the interaction the proposal does not price, so a test that does not fail without it is a test that proves nothing.

- [ ] **Step 8: Verify and commit**

Run from `web/`: `npm run typecheck && npm run lint && npx vitest run`

```bash
git add web/src/tasks/retry.ts web/src/tasks/retry.test.ts web/src/tasks/scriptContext.ts \
        web/src/tasks/runner.ts web/src/tasks/runner.test.ts web/src/agent/workerContext.ts \
        web/src/tasks/library/chopAndDrop.ts web/src/tasks/library/netFishAndDrop.ts web/src/tasks/library/ironOre.ts
git -c core.safecrlf=false commit -m "feat(tasks): add c.retry, implement Task.cooldownMs, and name the hp floor in points

P11 and P19, plus S8's live violation. cooldownMs was declared and read by nothing; the skip
refreshes lastMatchAt so a cooldown longer than stuckAfterMs cannot manufacture a stuck pause.
hpBelow keeps working and is deprecated; the three bundled loops move in the same commit.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 6: P14's `c.dialog`, and the Tutorial Island migration

The largest of the nine proposals, and the only one with a real migration. Its precondition, SP4b plan task 13, landed on 2026-09-07 (`docs/superpowers/ledgers/2026-09-06-sp4b-bot-expansion.md`, "Task 13, the Tutorial Island script"), and the stage modules are in the tree.

**Files:**
- Create: `web/src/tasks/dialog.ts`, `web/src/tasks/dialog.test.ts`
- Create: `web/src/tasks/library/tutorialIsland/harness.dialog.ts` (R26)
- Modify: `web/src/tasks/scriptContext.ts` (the `dialog` namespace, `clickThrough`'s shim), `web/src/agent/workerContext.ts` (wire `createDialog`; `tutorial.clickThrough` becomes a shim)
- Modify: `web/src/tasks/library/tutorialIsland/finish.ts:75-99`, `recovery.ts:70-92`, `helpers.ts:80-91`, `harness.ts` (split)
- Test: `web/src/tasks/library/tutorialIsland/{finish,recovery,helpers}.test.ts`

**Interfaces:**
- Consumes: `createWait` (Task 4) for `wait.dialog` and `wait.until`.
- Produces:
  ```ts
  export interface DialogContinueOpts { timeoutMs?: number; maxClicks?: number; signal?: AbortSignal }
  export interface DialogCompleteOpts { timeoutMs?: number; signal?: AbortSignal }
  // scriptContext.ts
  dialog: {
    isOpen(): boolean;
    text(): string;
    options(): string[];
    choose(sel: string | RegExp): Promise<ActionResult>;
    continueUntilOption(opts?: DialogContinueOpts): Promise<ActionResult>;
    complete(choices: (string | RegExp)[], opts?: DialogCompleteOpts): Promise<ActionResult>;
  };
  export function createDialog(d: DialogDeps): ScriptContext['dialog'];
  ```
  The three verbs return `ActionResult`, not `boolean`: each performs a game action that can fail for a reason the caller branches on (`no_option`, `wrong_interface`, `timeout`), and S3 reserves a bare boolean for waits. `isOpen`, `text` and `options` are synchronous snapshot reads, per S2.

**The footgun this namespace exists to absorb, in one paragraph, because it is the reason for the whole proposal.** `sdk.sendClickDialog` takes the **server-assigned** `DialogOption.index`, not the array position, and the two differ by one: the server numbers from 1 and reserves 0 for the implicit continue click, which `Client.clickDialogOption` refuses outright while a choice is pending. The island's last dialogue puts "Yes." at array position 0, so passing the position is exactly the case that cannot leave the island. Two files carry a paragraph of comment about it today (`finish.ts:88-94`, `recovery.ts:86-88`); after this task, one function does.

- [ ] **Step 1: Write the failing tests**

`web/src/tasks/dialog.test.ts`. The fake publishes options whose array position and server index deliberately disagree, which is the whole point:

```ts
import { describe, expect, test } from 'vitest';
import { createDialog } from './dialog';

const OPTIONS = [
  { text: 'Yes please.', index: 1 },
  { text: 'No thanks.', index: 2 },
  { text: "I'll think about it.", index: 3 }
];

/**
 * The fake is a SCRIPTED SEQUENCE of dialogue frames, not one frozen frame. A frozen frame is
 * a hang: `complete` loops until the dialogue ends, and against a state that never changes and
 * a `wait.until` that always resolves true, a faithful implementation never terminates and the
 * suite times out rather than failing. Each click advances to the next frame; the last frame is
 * closed. `frames` is also what lets the multi-step assertion below say two clicks rather than
 * one, which is the difference between testing a tree and testing a single choice.
 *
 * A typed factory, not `as never`: the Global Constraints ban `as any`, and `as never` defeats
 * the same check by another spelling. `DialogDeps.state` reads one field, so it is declared to
 * take one field.
 */
type DialogFrame = { isOpen: boolean; options?: { text: string; index: number }[]; text?: string };

function harness(frames: DialogFrame[] = [{ isOpen: true, options: OPTIONS, text: 'Do you want to skip the tutorial?' }]) {
  const clicked: number[] = [];
  let at = 0;
  const dialog = createDialog({
    state: () => ({ dialog: frames[Math.min(at, frames.length - 1)] }),
    click: async i => { clicked.push(i); at++; return { success: true }; },
    wait: { until: async () => true, dialog: async () => true },
    signal: () => new AbortController().signal
  });
  return { dialog, clicked };
}

const CLOSED: DialogFrame = { isOpen: false };
const SECOND = [
  { text: 'Sounds good.', index: 1 },
  { text: 'Let me think.', index: 3 }
];

describe('c.dialog', () => {
  test('choose sends the SERVER index, never the array position', async () => {
    const h = harness();
    const r = await h.dialog.choose(/no thanks/i);
    expect(r.success).toBe(true);
    expect(h.clicked).toEqual([2]);            // array position 1, server index 2
  });

  test('choose takes a string as an exact case-insensitive match, per S5', async () => {
    const h = harness();
    await h.dialog.choose('yes please.');
    expect(h.clicked).toEqual([1]);
  });

  test('a pattern that matches nothing reports no_option and clicks nothing', async () => {
    const h = harness();
    const r = await h.dialog.choose(/bury the body/i);
    expect(r).toMatchObject({ success: false, reason: 'no_option' });
    expect(h.clicked).toEqual([]);
  });

  test('a closed dialogue reports wrong_interface rather than no_option', async () => {
    const h = harness([CLOSED]);
    const r = await h.dialog.choose(/yes/i);
    expect(r).toMatchObject({ success: false, reason: 'wrong_interface' });
  });

  test('complete drives a TREE, consuming its patterns in order, one per choice frame', async () => {
    const h = harness([
      { isOpen: true, options: OPTIONS, text: 'Do you want to skip the tutorial?' },
      { isOpen: true, options: SECOND, text: 'Are you sure?' },
      CLOSED
    ]);
    const r = await h.dialog.complete([/no thanks/i, /let me think/i]);
    expect(r.success).toBe(true);
    // The whole array, not clicked[0]: a one-step implementation passes a clicked[0] assertion.
    expect(h.clicked).toEqual([2, 3]);
  });

  test('complete stops with no_option when a frame matches none of the remaining patterns', async () => {
    const h = harness([
      { isOpen: true, options: OPTIONS, text: 'Do you want to skip the tutorial?' },
      { isOpen: true, options: SECOND, text: 'Are you sure?' },
      CLOSED
    ]);
    const r = await h.dialog.complete([/no thanks/i, /bury the body/i]);
    expect(r).toMatchObject({ success: false, reason: 'no_option' });
    expect(h.clicked).toEqual([2]);
  });

  test('options() and text() are synchronous snapshot reads', () => {
    const h = harness();

    expect(h.dialog.isOpen()).toBe(true);
    expect(h.dialog.options()).toEqual(['Yes please.', 'No thanks.', "I'll think about it."]);
    expect(h.dialog.text()).toContain('skip the tutorial');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run from `web/`: `npx vitest run src/tasks/dialog.test.ts`
Expected: FAIL, "Failed to resolve import './dialog'".

- [ ] **Step 3: Write `web/src/tasks/dialog.ts`**

```ts
// P14. A named namespace over sdk.sendClickDialog, sdk.clickDialogByText and wait.dialog, so
// the index-versus-array-position footgun is never a script's problem again.
//
// THE FOOTGUN, once, here: sendClickDialog takes DialogOption.index, the SERVER's number, which
// starts at 1 because 0 is the implicit continue click that Client.clickDialogOption refuses
// while a choice is pending. The array position is not that number. Tutorial Island's last
// dialogue puts "Yes." at position 0, so passing the position is exactly the case that cannot
// leave the island. Every member here goes through `indexOf` below and never through a position.
export function createDialog(d: DialogDeps): ScriptContext['dialog'] {
  const raw = () => d.state().dialog;
  const matches = (sel: string | RegExp, text: string): boolean =>
    typeof sel === 'string' ? text.trim().toLowerCase() === sel.trim().toLowerCase() : sel.test(text);

  async function choose(sel: string | RegExp): Promise<ActionResult> {
    const dlg = raw();
    if (!dlg?.isOpen) return { success: false, message: 'no dialogue is open', reason: 'wrong_interface' };
    const found = (dlg.options ?? []).find(o => matches(sel, o.text ?? ''));
    if (!found) return { success: false, message: `no option matching ${String(sel)}`, reason: 'no_option' };
    // The server index, with the position+1 fallback the two migrated call sites already used
    // for a publisher that omits it.
    const r = await d.click(found.index ?? (dlg.options ?? []).indexOf(found) + 1);
    if (!r.success) return r;
    await d.wait.until(s => realChoices(s.dialog?.options).length === 0, { timeoutMs: 10_000, label: 'dialog choose' });
    return { success: true };
  }
  ...
}
```

`continueUntilOption` is `clickThrough`'s body (`workerContext.ts:226-244`) moved here and given a return value: `{ success: true }` when a choice appeared or the dialogue ended, `{ success: false, reason: 'timeout' }` when it ran out of clicks. **The measured comment at `workerContext.ts:232-243` moves with it verbatim**: the wait between clicks is on the chatbox actually changing, not on a tick, because a bare `ticks(1)` sent the second click before the server's next frame reached the client and answered "Do you want to skip the tutorial?" with "Yes please.", teleporting a live run to Lumbridge with none of the island played. `realChoices` and not `options.length`, for the reason that comment gives.

**`complete(choices, opts)` consumes its patterns in order and never rescans a spent one**, which is the difference between a tree walker and an infinite loop. Each iteration: `continueUntilOption`, then take the **next unconsumed** pattern and `choose` with it. It ends `{ success: true }` when the dialogue closes, `{ success: false, reason: 'no_option' }` when the current pattern matches nothing on the frame in front of it, and `{ success: false, reason: 'timeout' }` when `continueUntilOption` gives up. A rescanning implementation would re-take the same branch on a frame that has not changed and hang, and the test above is written so that it hangs the suite rather than passing: that is why its fake advances and its assertion is the whole `clicked` array.

- [ ] **Step 4: Make `tutorial.clickThrough` a shim, and keep its name**

Per S12, the name stays and the implementation moves:

```ts
      /** @deprecated Prefer `c.dialog.continueUntilOption()`, which reports why it stopped. */
      clickThrough: (arg?: number | ClickThroughOpts) => {
        const maxClicks = typeof arg === 'number' ? arg : arg?.maxClicks;
        return dialog.continueUntilOption({ maxClicks, timeoutMs: typeof arg === 'object' ? arg.timeoutMs : undefined })
          .then(() => undefined);
      },
```
It keeps returning `Promise<void>`, because that is what every saved script awaits, and the compliant member beside it is the one that reports. It is **not** run through `createDeprecations`: `clickThrough` is grandfathered under R3, not scheduled for removal, and a warn line on a member Tutorial Island's own tests call sixty times would be noise. State that in the doc comment.

- [ ] **Step 5: Split the harness, then migrate the three stage files**

R26: `web/src/tasks/library/tutorialIsland/harness.ts` is 338 lines. Move its dialogue fakes (`clickThrough` at `:214`, `sendClickDialog` at `:266` and their state) into `harness.dialog.ts`, add the `dialog` namespace fake there, and re-export from `harness.ts` so no stage test's import line changes.

Then:
- `finish.ts:75-99` (`choose-dialog-option`) becomes `return c.dialog.choose(DECLINE_SKIP) ` first, falling back to `PREFERRED_OPTION`, and the two comment paragraphs about the server index are deleted because `dialog.ts` owns that now. **The `DECLINE_SKIP`-before-`PREFERRED_OPTION` order stays**: it is the second lock on the one door that must not open, and `PREFERRED_OPTION` contains "Yes please.".
- `recovery.ts:70-92` (`decline-tutorial-skip`) becomes `await c.dialog.continueUntilOption()` then `c.dialog.choose(DECLINE_SKIP)`, with its `not_found` failure kept as-is (R9: P10 closes the spelling in entry 7, not here).
- `helpers.ts:80-91` (`advance`) calls `c.dialog.continueUntilOption({ maxClicks: 5 })` and logs when it reports `timeout`, which is information the old `clickThrough` could not give it.

- [ ] **Step 6: Run the migrated suites**

Run from `web/`: `npx vitest run src/tasks/dialog.test.ts src/tasks/library/tutorialIsland`
Expected: PASS, all six stage suites plus the new one. `finish.test.ts` (182 lines), `recovery.test.ts` (138) and `helpers.test.ts` (185) are the three that exercise the migrated code; if one needs a new fixture field, that is the harness split, not a behaviour change.

- [ ] **Step 7: Prove the footgun test is load bearing**

In `dialog.ts`, change `found.index ?? ...` to the array position and rerun.
Expected: "choose sends the SERVER index" fails with `[1]` instead of `[2]`, and the Tutorial Island `finish` suite fails with it. Restore. This is the one assertion the whole proposal exists for.

- [ ] **Step 8: Verify and commit**

Run from `web/`: `npm run typecheck && npm run lint && npx vitest run`
Run from the repository root: `powershell -File scripts/line-ceiling.ps1`

```bash
git add web/src/tasks/dialog.ts web/src/tasks/dialog.test.ts web/src/tasks/scriptContext.ts \
        web/src/agent/workerContext.ts web/src/agent/workerContext.tutorial.test.ts \
        web/src/tasks/library/tutorialIsland/
git -c core.safecrlf=false commit -m "feat(tasks): add the c.dialog namespace and migrate Tutorial Island onto it

P14, sequenced after SP4b task 13 as its own phase line requires. The server-index versus
array-position footgun was written out twice in comments and is now written once in code.
tutorial.clickThrough keeps its name and becomes a shim, per S12.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 7: P7's `c.screenshot` with a real sink, and P8's `interactGroundItem`

Two proposals that both close a hole rather than adding an idiom. P7 is a naming, typing and documentation change over a capability that is already reachable as `c.sdk.screenshot()` (`web/src/vendor/rs-sdk/sdk/index.ts:1047`, pinned by `localSdk.test.ts:125`); P8 wraps a `BotAction` that exists in the union (`vendor/rs-sdk/sdk/types.ts:615`) and that grep confirms nothing wraps.

**Files:**
- Create: `web/src/tasks/attachments.ts`, `web/src/tasks/attachments.test.ts`, `web/src/tasks/botExtras.ts`, `web/src/tasks/botExtras.test.ts`
- Modify: `web/src/tasks/scriptContext.ts`, `web/src/agent/workerContext.ts`, `web/src/agent/runContext.ts` (the store's owner and the `clear` call)
- Modify: **`web/src/tasks/types.ts`** (the 19th `TraceEvent` variant is declared here, `:255-273`, not in `trace.ts`; `trace.ts:1` only imports the type and derives `TraceInput` from it, so it usually needs no edit at all)
- Modify: `web/src/plugins/builtin/traceView.ts` (**`detailOf`**, the exhaustive switch, `case 'target'` at `:47`; `describeEvent` at `:52` just calls it and does not switch), `web/src/styles/layout/trace.css:25-26` (one rail)
- Test: `web/src/plugins/builtin/traceView.test.ts`, `web/src/agent/workerContext.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 3 to 6.
- Produces:
  ```ts
  export interface ScreenshotOpts { label?: string; /** Files the image with the run. Default true. */ attach?: boolean }
  screenshot(opts?: ScreenshotOpts): Promise<Blob | null>;
  export interface InteractGroundItemOpts { opIndex?: 1 | 2 | 3 | 4 | 5; signal?: AbortSignal }
  // scriptContext.ts: how c.bot gains a member without an addition to the vendored class.
  export interface ScriptBot extends BotActions {
    interactGroundItem(target: GroundItem | string | RegExp, opts?: InteractGroundItemOpts): Promise<ActionResult>;
  }
  // ...and ScriptContext's member becomes `bot: ScriptBot;`
  // attachments.ts
  export interface Attachments { put(runId: string, label: string, blob: Blob): string; list(runId: string): { id: string; label: string }[]; get(id: string): Blob | null; clear(runId: string): void }
  export function createAttachments(cap?: number): Attachments;
  // web/src/tasks/types.ts, inside TraceEvent's union at :255-273
  | { kind: 'attachment'; attachmentId: string; label: string }
  ```

**How `c.bot` gains a member, stated because it decides two gates.** `ScriptContext.bot` is `BotActions`, a vendored class type, and nothing may be added to `web/src/vendor/rs-sdk/` without a `PATCHES.md` deviation. So the surface declares **`interface ScriptBot extends BotActions`**, `workerContext.ts` builds it as `{ ...d.bot, ...createBotExtras(...) }` presented as `ScriptBot`, and `scriptContext.ts` types the member as `ScriptBot`. Two consequences the traversal has to be told about, both already ruled: **R15** states the namespace rule over the resolved apparent type, so an interface extending a class type still descends and `c.bot`'s 160 members do not collapse into one `kind: 'property'` row; and **R32** decides `vendored` by the declaring source file, so `c.bot.interactGroundItem` is ours, gate 2 requires its doc comment, and the api-shape gate scans its `opIndex`. Under the path-prefix rule this plan first wrote, the one new member with the most carefully argued doc comment in the entry would have been the one member neither gate looked at.

**Attachment ids.** `Math.random().toString(36).slice(2, 12)`, ten lowercase alphanumerics, stated here because Task 7 step 1 asserts the format and an executor reaching for the obvious `crypto.randomUUID()` would get a red test with no contract to consult. It is not a security token; it is a map key that has to survive a `postMessage` and read tolerably in a trace row, and uuid hyphens fail the assertion for no benefit.

- [ ] **Step 1: Write the failing tests**

`web/src/tasks/attachments.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { createAttachments } from './attachments';

describe('the run attachment store', () => {
  test('hands back an id and keeps the blob out of anything that is persisted', () => {
    const a = createAttachments();
    const id = a.put('run-1', 'stuck at the bank', new Blob(['png']));
    expect(id).toMatch(/^[a-z0-9]{8,}$/);
    expect(a.list('run-1')).toEqual([{ id, label: 'stuck at the bank' }]);
    expect(a.get(id)).toBeInstanceOf(Blob);
  });

  test('caps at eight per run, dropping the oldest, so a loop cannot fill the tab', () => {
    const a = createAttachments(8);
    const ids = Array.from({ length: 10 }, (_, i) => a.put('run-1', `shot ${i}`, new Blob([`${i}`])));
    expect(a.list('run-1')).toHaveLength(8);
    expect(a.get(ids[0])).toBeNull();
    expect(a.get(ids[9])).toBeInstanceOf(Blob);
  });

  test('clear releases a finished run', () => {
    const a = createAttachments();
    const id = a.put('run-1', 'x', new Blob(['x']));
    a.clear('run-1');
    expect(a.list('run-1')).toEqual([]);
    expect(a.get(id)).toBeNull();
  });
});
```

`web/src/tasks/botExtras.test.ts`:

```ts
test('interactGroundItem defaults to option 3, which is Take', async () => {
  const h = harness([{ id: 1511, name: 'Logs', x: 3222, z: 3218, count: 1, distance: 2 }]);
  const r = await h.bot.interactGroundItem('Logs');
  expect(r.success).toBe(true);
  expect(h.dispatched).toEqual([{ type: 'interactGroundItem', x: 3222, z: 3218, itemId: 1511, optionIndex: 3 }]);
});

test('a selector that matches nothing reports target_not_found and dispatches nothing', async () => {
  const h = harness([]);
  const r = await h.bot.interactGroundItem(/bones/i);
  expect(r).toMatchObject({ success: false, reason: 'target_not_found' });
  expect(h.dispatched).toEqual([]);
});

test('a RegExp, a string and a GroundItem all resolve to the same call', async () => {
  const item = { id: 526, name: 'Bones', x: 1, z: 2, count: 1, distance: 1 };
  for (const sel of ['Bones', /bones/i, item] as const) {
    const h = harness([item]);
    await h.bot.interactGroundItem(sel, { opIndex: 5 });
    expect(h.dispatched[0]).toMatchObject({ itemId: 526, optionIndex: 5 });
  }
});
```

- [ ] **Step 1b: Widen `workerContext.test.ts`'s harness before writing the screenshot test**

This is a numbered step because the test below cannot be written without it, and because the shape it needs is not the shape the helper has. At HEAD the helper is `function harness(initial: WorldState = fakeWorld())` at `workerContext.test.ts:53`: it takes a world, not a spy-override bag, and returns `{ ctx, tiles, dispose, trace, push, tick, abort, setSignal, transport, spies, stateSubs }` with no `attachments`. Two additions, both small and both used only by tests:

```ts
type HarnessOverrides = { screenshot?: () => Promise<Blob> };

function harness(initial: WorldState = fakeWorld(), over: HarnessOverrides = {}) {
  const attachments = createAttachments();
  ...
  const ctx = createWorkerContext({ ..., attachments, screenshot: over.screenshot ?? (async () => new Blob(['png'])) });
  return { ctx, tiles, dispose, trace, push, tick, abort, setSignal, transport, spies, stateSubs, attachments };
}
```

Every existing call site is `harness()` or `harness(fakeWorld({...}))`, so the second parameter is additive and no existing test changes. Run `npx vitest run src/agent/workerContext.test.ts` after the widening and before writing the new case: the file must be green on the widening alone.

- [ ] **Step 1c: Write the screenshot test**

In `web/src/agent/workerContext.test.ts`:

```ts
test('c.screenshot returns null rather than rejecting when there is no canvas, and files the image', async () => {
  const h = harness(fakeWorld(), { screenshot: async () => { throw new Error('no canvas'); } });
  await expect(h.ctx.screenshot()).resolves.toBeNull();

  const ok = harness(fakeWorld(), { screenshot: async () => new Blob(['png']) });
  const shot = await ok.ctx.screenshot({ label: 'stuck' });
  expect(shot).toBeInstanceOf(Blob);
  const row = ok.trace.events().find(e => e.kind === 'attachment') as { attachmentId: string; label: string };
  expect(row.label).toBe('stuck');
  expect(row).not.toHaveProperty('blob');        // R8: an id crosses postMessage, never a Blob
  expect(ok.attachments.get(row.attachmentId)).toBeInstanceOf(Blob);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run from `web/`: `npx vitest run src/tasks/attachments.test.ts src/tasks/botExtras.test.ts src/agent/workerContext.test.ts`
Expected: FAIL on two unresolved imports and on `c.screenshot` not existing.

- [ ] **Step 3: Write `web/src/tasks/attachments.ts`**

The header carries R8's whole argument, because the next session's first instinct is to put the `Blob` in the trace row:

```ts
// Where a screenshot goes. A script in a Worker has nowhere else to put a Blob: fetch is
// forbidden by S10, there is no DOM, and there is no persisted store yet (P6 is entry 7).
//
// It is NOT the trace. A trace event crosses postMessage, is capped at 5000 (trace.ts:35), is
// persisted per run in IndexedDB (history.ts:74-78), is rendered by traceView.ts's detailOf
// exhaustive switch, and is copied to Claude behind UNTRUSTED_HEADER. A Blob is wrong at all
// five. The
// trace row carries an id and a label; the bytes live here, in memory, for the life of the run.
```

- [ ] **Step 4: Write `web/src/tasks/botExtras.ts`**

```ts
// P8. `interactGroundItem` exists in the vendored BotAction union (sdk/types.ts:615) and
// nothing wraps it, so a ground item can be picked up (through sendPickup) and never used with
// any other menu option. This is our own wrapper layer rather than an addition to the vendored
// actions file, because re-vendoring is a recurring cost and a PATCHES.md note is not.
export interface InteractGroundItemOpts {
  /**
   * The game's own option ordinal, 1 to 5, where 3 is Take (Client.ts:1278). Defaults to 3.
   * Ground items are the ONE documented exception to "never a raw menu index" (S5): GroundItem
   * publishes no option text for a name to match against, unlike NearbyLoc, NearbyNpc and
   * InventoryItem, which all carry optionsWithIndex. Survey ruling 13 records it, and ruling 25
   * declines the collector change that would close it. Client.ts:1282 rejects anything outside
   * 1 to 5, which is why the type is the literal union rather than `number`.
   */
  opIndex?: 1 | 2 | 3 | 4 | 5;
  signal?: AbortSignal;
}
```

- [ ] **Step 5: Wire `c.screenshot`, the 19th trace kind, and the store's owner**

`workerContext.ts` gains the member; `localTransport.ts:127` **rejects** when there is no canvas, so ours catches and returns `null`, which is the S3 and S9 defect P7 exists to fix.

**The variant is declared in `web/src/tasks/types.ts`, inside `TraceEvent`'s union at `:255-273`.** `trace.ts:1` is `import type { TraceEvent } from './types'` and derives `TraceInput` from it, so the union member does not go there and `trace.ts` may need no edit at all; check the derivation rather than assuming either way. **The exhaustive switch a 19th kind breaks is `detailOf`** (`traceView.ts`, `case 'target'` at `:47`, no `default`, so `strictNullChecks` reports TS2366 on the missing return path); `describeEvent` at `:52` calls it and switches on nothing. `traceView.test.ts` gains one assertion for the new row's text, and `styles/layout/trace.css:25-26` gains the rail beside the twelve already there.

**`attachments.clear(runId)` gets a caller in this step, or the store is not run-scoped.** R8's whole framing is a per-run store with a cap of eight, and a `clear` that nothing calls leaves the outer map growing one entry per run for the life of the tab. The caller is `web/src/agent/runContext.ts`, at the same disposal point where Task 3 calls `deprecations.reset()`: one line, `attachments.clear(runId)`, and one assertion in `workerContext.test.ts` that a disposed run's attachments are gone. `runContext.ts` is in this task's Files for that reason.

- [ ] **Step 6: Run the tests, then prove the R8 assertion bites**

Run from `web/`: `npx vitest run src/tasks/attachments.test.ts src/tasks/botExtras.test.ts src/agent/workerContext.test.ts src/plugins/builtin/traceView.test.ts`
Expected: PASS.
Then push the `Blob` onto the trace row instead of the id and rerun.
Expected: `expect(row).not.toHaveProperty('blob')` fails. Restore.

- [ ] **Step 7: Verify and commit**

Run from `web/`: `npm run typecheck && npm run lint && npx vitest run`

```bash
git add web/src/tasks/attachments.ts web/src/tasks/attachments.test.ts web/src/tasks/botExtras.ts \
        web/src/tasks/botExtras.test.ts web/src/tasks/scriptContext.ts web/src/tasks/types.ts \
        web/src/agent/workerContext.ts web/src/agent/workerContext.test.ts web/src/agent/runContext.ts \
        web/src/plugins/builtin/traceView.ts web/src/plugins/builtin/traceView.test.ts \
        web/src/styles/layout/trace.css
git -c core.safecrlf=false commit -m "feat(tasks): name c.screenshot with a sink, and wrap interactGroundItem

P7 and P8. The screenshot was already reachable as c.sdk.screenshot and had two defects: it
rejects with no canvas, and a Worker script had nowhere to put the Blob. It returns null now
and files the image against the run, with only an id in the trace.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 8: The declared surface, and the snippet list generated from it

P0, plus the re-export entry the generator walks. This is the last task of the standard half: after it, "what a script may see" is one screen and nothing can drift from it silently.

**Files:**
- Create: `web/src/tasks/scriptApiKeys.ts`, `web/src/tasks/scriptApi.ts`
- Modify: `web/src/agent/worker.ts:374`
- Test: `web/src/agent/worker.test.ts:333-343` (the existing snippet-reachability probe, widened)

**Interfaces:**
- Consumes: every member added by Tasks 3 to 7.
- Produces:
  ```ts
  // scriptApiKeys.ts, a leaf that exports this and nothing else
  export const SCRIPT_CONTEXT_KEYS: Record<keyof ScriptContext, true>;
  // scriptApi.ts
  // Three `export type {...} from` blocks, one per declaring file, plus two singles.
  // Step 4 below is the contract; R27 states only the delta from the spec's 31, because a bare
  // count in a ruling goes stale the moment a task adds an options bag.
  export type { /* from './scriptContext' */ };
  export type { /* from './types' */ };
  export type { TasksErrorCode } from './api';
  export type { WorldState, ActionResult } from '../agent/types';
  export { SCRIPT_CONTEXT_KEYS } from './scriptApiKeys';
  ```

**Why `scriptApiKeys.ts` is a leaf and not part of `scriptApi.ts`.** `web/src/agent/worker.ts` is the module-worker entry point (Vite emits it as its own chunk from `workerHost.ts:70`; `vite.config.ts:44` is `worker: { format: 'es' }`), and a **value** import pulls the imported module's whole runtime export graph into that chunk. `scriptApi.ts` is where entry 7's `createTestContext` (P17) will live, and P17 says the test harness must never reach the Worker. `worker.ts` already avoids this shape once: it loads the library through `await import('../tasks/library/index')` at `:172` rather than a static import.

- [ ] **Step 1: Write the failing test**

In `web/src/agent/worker.test.ts`, replacing the hand-listed probe at `:333-343`:

```ts
test('every declared context member is reachable from a snippet, with no hand-maintained list', async () => {
  const names = Object.keys(SCRIPT_CONTEXT_KEYS);
  // The snippet body names each member and reports which ones the destructure actually bound.
  const body = `return [${names.map(n => `typeof ${n} === 'undefined' ? '${n}' : null`).join(',')}].filter(Boolean);`;
  const missing = await runSnippet(body);
  expect(missing).toEqual([]);
  expect(names).toHaveLength(17);   // the 14 at HEAD, plus dialog, retry and screenshot
});
```

- [ ] **Step 2: Run it and watch it fail**

Run from `web/`: `npx vitest run src/agent/worker.test.ts`
Expected: FAIL, `SCRIPT_CONTEXT_KEYS` does not resolve.

- [ ] **Step 3: Write `web/src/tasks/scriptApiKeys.ts`**

```ts
// The declared member set, as a value. It is a leaf on purpose: web/src/agent/worker.ts imports
// it for its VALUE, and a value import drags the imported module's whole export graph into the
// Worker chunk. scriptApi.ts is where the docs generator's entry and (entry 7) P17's
// createTestContext live, and P17 says that harness must never reach the Worker.
//
// The Record type is the gate: adding a member to ScriptContext without adding it here is a
// compile error in `npm run typecheck`'s FIRST program, because this file ships. Removing one
// that no longer exists is the same error from the other direction.
import type { ScriptContext } from './scriptContext';

export const SCRIPT_CONTEXT_KEYS: Record<keyof ScriptContext, true> = {
  state: true, bot: true, sdk: true, wait: true, tutorial: true, params: true, log: true,
  status: true, memory: true, signal: true, travel: true, find: true, anchor: true, health: true,
  dialog: true, retry: true, screenshot: true
};
```

- [ ] **Step 4: Write `web/src/tasks/scriptApi.ts`**

```ts
// What a script may see, decided in one screen rather than inferred from a generator's
// traversal rules. This file is the generator's entry (scripts/gen/apiDocs.ts) and gate 6's
// subject; it is the only file a future session edits when the surface widens.
//
// Corrections to the spec's list of 31 (plan ruling R27): the SDK type is BotSDK and not BotSdk;
// WorldState is declared in web/src/clientTypes.ts and only re-exported by web/src/agent/types.ts,
// so the generator's generatedFrom.files must reach the real file; TargetEvent and RecoveryOutcome
// are named inside TraceEvent's union, so without them ApiType.variants renders names the index
// does not define; TasksErrorCode is the error vocabulary 06-limits-and-trust.md renders; and every
// named options bag is here because S4 requires each to be a named exported interface and the
// api-shape gate asserts that every options type a member takes is one this file exports.
//
// EACH NAME COMES FROM THE FILE THAT DECLARES IT. types.ts re-exports scriptContext.ts (plan R1),
// not the other way round, so naming a run-model type here as if it came from './scriptContext'
// is ~26 "has no exported member" errors and the first thing that stops in step 7.

// The script-facing surface: scriptContext.ts declares these.
export type {
  ScriptContext, Tile, TileLike, TravelTarget,
  WaitUntilOpts, WaitAnimationOpts, WaitHpOpts, FollowHintOpts, ClickThroughOpts, LogOpts,
  HardStop, RetryOpts, ScreenshotOpts, DialogContinueOpts, DialogCompleteOpts,
  InteractGroundItemOpts, ScriptBot
} from './scriptContext';

// The run and persistence model: types.ts declares these and keeps them (plan R1).
export type {
  Script, ScriptManifest, Task,
  ParamSchema, ParamField, ParamValues, Requirement,
  ResourceKind, FoundTarget, FoundVia, FindOpts, SweepOpts, TravelOpts, TravelResult,
  AtlasCluster, AtlasLandmark,
  HealthCondition, HealthPolicy, HealthEvent, DeathBehaviour, StuckBehaviour, RecoveryOutcome,
  TraceEvent, TargetEvent, RunState, PauseReason, FailReason, RunOutcome,
  BotActions, BotSDK
} from './types';

export type { TasksErrorCode } from './api';
export type { WorldState, ActionResult } from '../agent/types';
export { SCRIPT_CONTEXT_KEYS } from './scriptApiKeys';
```

**Which file declares which, checked at HEAD before you type the list.** `types.ts` declares `ParamField:11`, `ParamSchema:16`, `ParamValues:17`, `Requirement:19`, `ResourceKind:29`, `AtlasCluster:32`, `AtlasLandmark:39`, `FoundVia:58`, `FoundTarget:59`, `FindOpts:72`, `SweepOpts:83`, `TravelOpts:93`, `TravelResult:94`, `HealthCondition:104`, `RecoveryOutcome:107`, `HealthEvent:108`, `FailReason:114`, `DeathBehaviour:134`, `StuckBehaviour:143`, `HealthPolicy:159`, `ScriptManifest:168`, `Task:221`, `RunOutcome:234`, `Script:235`, `PauseReason:242`, `RunState:243`, `TargetEvent:250` and `TraceEvent:255`, and re-exports `BotActions`/`BotSDK` at `:9`. Task 1 moves only `ScriptContext:179-218`, `TravelTarget:89` and the four inline bags into `scriptContext.ts`. **`TasksErrorCode` is `web/src/tasks/api.ts:26`**, which is neither file: it is exported here because Task 10 step 5 eyeballs it in `enums` and Task 13's trust page renders its eleven values, and traversal rule 7 only sees what this list names.

- [ ] **Step 5: Generate the snippet destructuring list**

`web/src/agent/worker.ts:371-376`:

```ts
/** The snippet body is an async function over the destructured context, exactly as the panel documents. */
function snippet(code: string): (ctx: ScriptContext) => Promise<unknown> {
  // Generated from the declared surface (P0). The hand-maintained list this replaces was a
  // silent failure mode: a member missing from it was invisible to snippets and nothing
  // complained.
  const names = Object.keys(SCRIPT_CONTEXT_KEYS).join(', ');
  return new Function('ctx', `return (async ({${names}}) => {${code}\n})(ctx)`) as (ctx: ScriptContext) => Promise<unknown>;
}
```

This is a **net shrink** of `worker.ts`, which matters: it was at 397 of 400 lines.

- [ ] **Step 6: Run the tests, then prove the gate bites in both directions**

Run from `web/`: `npx vitest run src/agent/worker.test.ts`
Expected: PASS, `missing` empty.
Then add `foo: () => 0;` to `ScriptContext` without touching `scriptApiKeys.ts` and run `npm run typecheck` from `web/`.
Expected: FAIL, "Property 'foo' is missing in type ... but required in type 'Record<keyof ScriptContext, true>'". Remove it.
Then add `foo: true` to the record without adding the member and typecheck again.
Expected: FAIL, "Object literal may only specify known properties". Remove it. **Both directions, because a gate that only fails one way lets a member be removed silently.**

- [ ] **Step 7: Verify and commit**

Run from `web/`: `npm run typecheck && npm run lint && npx vitest run`
Run from the repository root: `powershell -File scripts/line-ceiling.ps1`

```bash
git add web/src/tasks/scriptApiKeys.ts web/src/tasks/scriptApi.ts web/src/agent/worker.ts web/src/agent/worker.test.ts
git -c core.safecrlf=false commit -m "feat(tasks): declare the script surface once, and generate the snippet list from it

P0 and the docs spec's scriptApi.ts. The snippet destructuring list at worker.ts:374 was
hand-maintained and agreed with ScriptContext by luck; it is now Object.keys over a typed
record, and adding a member without declaring it is a typecheck failure in both directions.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---
## Task 9: S11, every member we own carries the doc comment the reference is generated from

The largest writing task in the entry, and the one the docs spec prices at nothing. **Counted at HEAD: 6 of the 34 declaration sites inside `ScriptContext` carry a doc comment and 28 do not**, and the phase-now proposals added more. S11 says what each comment must answer: what the member does, **what it returns when the answer is "nothing"**, what it costs (a round trip or a snapshot read), and what unit each number is in. It does not restate the type.

**Files:**
- Modify: `web/src/tasks/scriptContext.ts` (every member and every options bag)
- Create: `web/src/tasks/docComments.test.ts` (provisional, R25: Task 16 deletes it)

**Interfaces:** consumes the full surface from Tasks 1 to 8; produces no new names.

**Two structural obstacles to budget for.** `bot: BotActions; sdk: BotSDK;` shared one line at HEAD, and all four `tutorial` leaves shared one inline type literal; neither can take a per-member JSDoc without being split across lines first. Task 1's split already did most of that; check it before writing.

- [ ] **Step 1: Write the provisional failing test**

`web/src/tasks/docComments.test.ts`:

```ts
// PROVISIONAL, plan ruling R25. Gate 2 (web/src/tasks/docs/apiIndex.test.ts) asks the real
// question, over the emitted index, and Task 16 deletes this file in the same commit that lands
// it. It exists because 28 doc comments written with no gate is 28 doc comments one of which
// goes missing in the next sub-project.
import { describe, expect, test } from 'vitest';
import source from './scriptContext.ts?raw';

/** Every line inside the ScriptContext block that declares a member, with its indent. */
function declarationsIn(block: string): { line: string; documented: boolean }[] {
  const lines = block.split('\n');
  const out: { line: string; documented: boolean }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s{2,}[a-zA-Z]\w*[(?:<]/.test(line) && !/^\s{2,}[a-zA-Z]\w*\??:/.test(line)) continue;
    if (/^\s*\*/.test(line)) continue;
    const above = lines.slice(Math.max(0, i - 12), i).join('\n');
    out.push({ line: line.trim(), documented: /\*\/\s*$/.test(above.trimEnd()) });
  }
  return out;
}

describe('S11: every member we own is documented', () => {
  const block = source.slice(source.indexOf('export interface ScriptContext'));
  const decls = declarationsIn(block.slice(0, block.indexOf('\n}')));

  test('finds the whole surface, so an empty scan cannot pass', () => {
    expect(decls.length).toBeGreaterThanOrEqual(34);
  });

  test('every declaration site carries a doc comment', () => {
    expect(decls.filter(d => !d.documented).map(d => d.line)).toEqual([]);
  });

  test('no doc comment contains an em dash', () => {
    expect(source).not.toContain('—');
  });
});
```

- [ ] **Step 2: Run it and watch it fail with a list**

Run from `web/`: `npx vitest run src/tasks/docComments.test.ts`
Expected: FAIL, and the failure **prints the 28 undocumented lines**. That list is the task's own worklist; copy it before starting.

- [ ] **Step 3: Write the comments, namespace by namespace**

The house form, from `find.nearest`, which S11 quotes as its compliant example:

```ts
  /**
   * The nearest resource of `kind`, searched in the scene, then the atlas, then a sweep.
   * `FoundTarget.via` says which layer answered. Null when no layer found one.
   * Costs a client round trip when the scene rescan runs. Distances are tiles, Chebyshev.
   */
  nearest(kind: ResourceKind, opts?: FindOpts): Promise<FoundTarget | null>;
```

Four that carry a fact a reader gets wrong without them, written out here because they are the ones a reviewer should check first:

```ts
  /**
   * The world as of the last snapshot the host pushed. Never null: before the first snapshot
   * it is a frozen empty object, so a `wait.*` predicate simply never matches rather than
   * throwing. This is the one place our surface differs from `c.sdk.getState()`, which is
   * `WorldState | null`. A snapshot read, no round trip.
   */
  state(): WorldState;

  /**
   * Scratch space that survives between task runs inside one run, and nothing else. It is a
   * plain Map, so `get` is `unknown | undefined`, and it is gone when the run ends. Nothing
   * here is persisted; per-script storage is not built yet.
   */
  memory: Map<string, unknown>;

  /**
   * The abort signal of the task running right now. Read it, never cache it: the runner swaps
   * the controller between tasks, so a copy taken at task start misses your own task's stop.
   * A snapshot read, no round trip.
   */
  signal: AbortSignal;

  /**
   * Waits `n` server ticks. True when it counted them, false when the run was stopped first.
   * Ticks, not milliseconds: a tick is the server's own beat, and a fixed sleep drifts against
   * it. This is the only delay a script may express.
   */
  ticks(n: number): Promise<boolean>;
```

Every options-bag field gets one too, and every number says its unit, because R4's count allowance reads the doc comment as its escape hatch.

- [ ] **Step 4: Run the test until it is green**

Run from `web/`: `npx vitest run src/tasks/docComments.test.ts`
Expected: PASS, three tests, with the first asserting the scan found at least 34 sites so a regex that matched nothing cannot pass.

- [ ] **Step 5: Prove it fails on a missing comment**

Delete the doc comment above `c.memory` and rerun.
Expected: FAIL, naming `memory: Map<string, unknown>;`. Restore it.

- [ ] **Step 6: Verify and commit**

Run from `web/`: `npm run typecheck && npm run lint && npx vitest run`
Run from the repository root: `powershell -File scripts/line-ceiling.ps1`
Expected: green. `scriptContext.ts` is the file to watch here; if it is over 400, split the wait and dialog member declarations into `scriptContext.wait.ts` rather than trimming a comment.

```bash
git add web/src/tasks/scriptContext.ts web/src/tasks/docComments.test.ts
git -c core.safecrlf=false commit -m "docs(tasks): document every script API member we own

S11. Six of the 34 declaration sites carried a doc comment; the reference is generated from
these, so the 28 that did not were 28 bare signatures. Each says what it returns when the
answer is nothing, what it costs, and what unit its numbers are in.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 10: The traversal, and `api-index.json`

The first use of the TypeScript compiler API anywhere in this repository, so the traversal rules are specified here rather than inherited from a house pattern.

**Files:**
- Create: `web/src/tasks/gen/apiIndex.ts`, `web/src/tasks/gen/apiIndex.test.ts`, `web/src/tasks/gen/fixture.harness.ts`
- Create: `scripts/gen/apiDocs.ts` (index only in this task; the markdown lands in Task 11)
- Create: `web/src/agent/api-index.json` (generated, committed)

**Interfaces:**
- Consumes: `web/src/tasks/scriptApi.ts` (Task 8).
- Produces:
  ```ts
  export interface ApiIndex {
    /** R13. Bumped only when a field is removed or retyped. Consumers assert it. */
    schemaVersion: 1;
    /** Computed inside buildApiIndex over generatedFrom.files plus GENERATOR_VERSION. Metadata
     *  and a fast path, NOT the gate: gate 1 regenerates and compares (R11). */
    hash: string;
    generatedFrom: { files: string[] };
    members: ApiMember[];
    types: ApiType[];
    enums: Record<string, string[]>;
    forbidden: string[];                          // empty until entry 6 creates forbidden.ts
    examples: ApiExample[];
    usedBy: Record<string, string[]>;             // member path -> example ids
  }
  export interface ApiMember { path: string; kind: 'method' | 'property' | 'namespace'; signature: string; doc: string; since: string; vendored: boolean; deprecated?: string }
  export interface ApiType { name: string; kind: 'interface' | 'union' | 'alias'; doc: string; fields?: { name: string; type: string; optional: boolean; doc: string }[]; variants?: string[] }
  /** The spec references ApiExample five times and never declares it. This is the declaration. */
  export interface ApiExample { id: string; title: string; teaches: string; docsAnchor: string; source: string }
  export function buildApiIndex(opts: {
    /** ABSOLUTE path to the entry module. Never cwd-relative: see below. */
    entry: string;
    /** ABSOLUTE path to the tsconfig whose options the program uses. */
    tsconfig: string;
    /** The exported interface the traversal starts from. `'ScriptContext'` in production. */
    root: string;
    /** What that interface is called in a script. Defaults to `'c'`; every path is dotted from it. */
    rootAlias?: string;
    /** Repository-relative paths, recorded verbatim in generatedFrom.files. buildApiIndex reads
     *  each (resolved against the repository root, which is WEB_ROOT's parent) and hashes their
     *  contents together with GENERATOR_VERSION into `hash`. There is no `hash` option: a caller
     *  that could pass one could pass a stale one. */
    sources: string[];
    examples: ApiExample[]; forbidden: string[];
    /** Member path -> api version. Defaults to the module's own SINCE map; the fixture test overrides it. */
    since?: Record<string, string>;
  }): ApiIndex;
  export const GENERATOR_VERSION = 1;
  /** web/, derived from this module's own location. Never process.cwd(). */
  export const WEB_ROOT: string;
  /** Task 16's api-shape gate reads both; entry 6's validator will too. */
  export function countRequiredPositionals(signature: string): number;
  export function surfaceNames(members: ApiMember[], types: ApiType[]): string[];
  export function numericNames(members: ApiMember[], types: ApiType[]): string[];
  ```

**Three things about that signature that the first draft of this plan got wrong, each of which is a silent failure rather than an error.**

**`entry` and `tsconfig` are absolute, and `apiIndex.ts` resolves them from its own module location when a caller passes a `web/`-relative one.** They were `'src/tasks/scriptApi.ts'` and `'tsconfig.json'`, passed identically from three call sites with two different working directories: `apiIndex.test.ts` and `scriptApi.test.ts` run under vitest with cwd `web/` (`web/vitest.config.ts` is rooted there), and `apiDocs.ts` runs from the repository root (R10). From the root there is no `tsconfig.json` and no `src/tasks/`, so `ts.readConfigFile` returns nothing, `createProgram` sees an empty file list, the traversal emits zero members, and the visible symptom is `apiDocs.ts`'s own `members.length < 100` throw, which reads as "the surface moved" when the truth is "the path did not resolve". So: **`apiIndex.ts` exports `const WEB_ROOT = resolve(import.meta.dirname, '..', '..', '..')`** (from `web/src/tasks/gen/` that is `web/`), resolves any relative `entry` or `tsconfig` against it, and **never reads `process.cwd()`**. Every call site may then pass either form and all three agree. `apiIndex.test.ts` asserts it directly: build once with a `web/`-relative entry and once with `join(WEB_ROOT, 'src/tasks/gen/fixture.harness.ts')` and expect the same member paths.

**`root` is required, because the fixture is not called `ScriptContext`.** Traversal rule 2 is written over `ScriptContext` and the fixture deliberately declares `FakeContext`, so without this parameter every assertion in `apiIndex.test.ts` walks nothing. `rootAlias` defaults to `'c'` so the fixture's paths read `c.wait.until` like the real ones.

**`sources` is what fills `generatedFrom.files`, and it is folded into the hash with `GENERATOR_VERSION`.** The field was declared in `ApiIndex` and set by nobody: `apiDocs.ts`'s `SOURCES` array reached `contentSha` and stopped there, so the contract field entry 6 and SP4c read shipped empty. And docs spec section 3.2 defines `hash` as computed over those files **plus a version constant bumped when the generator's own output format changes**; without it a rendering-only change leaves the hash unmoved. Gate 1 still catches that (R11's regenerate-and-compare is exactly why `hash` is not the gate), so this is a shape defect rather than a hole, but the field is part of a published contract. `apiIndex.test.ts` asserts both: `generatedFrom.files` equals what was passed, and two builds differing only in `GENERATOR_VERSION` produce different hashes.

**The traversal rules, stated because nothing in the tree implies them.**
1. **Entry.** A `ts.Program` over `web/src/tasks/scriptApi.ts` with `web/tsconfig.json`'s options. Every `export type { ... }` name is resolved to its declaration.
2. **Members.** The properties of **the interface named by `root`** are walked depth first. A property whose type is an object type literal with only call signatures and properties is `kind: 'namespace'` and is descended into. **A property whose type resolves, through its apparent type, to a class type, an interface extending one, or an intersection of either, is also `kind: 'namespace'` and is descended into** (R15): that is `c.sdk`, and `c.bot`, which Task 7 retypes as `ScriptBot extends BotActions`. A rule written as "is a class type" matches `c.bot` at Task 10 and stops matching it at Task 7, dropping 160 members to one row with nothing failing. A call signature is `kind: 'method'`; anything else is `kind: 'property'`.
3. **Paths** are dotted from `rootAlias`, which is `'c'`: `c.wait.until`, `c.find.nearest`, `c.bot.chopTree`.
4. **Signatures** are rendered with `checker.typeToString` on the signature, with `TypeFormatFlags.NoTruncation`. The compiler version therefore matters, which is why R10 pins it by construction.
5. **Docs** come from `ts.getJSDocCommentsAndTags`, joined and trimmed. **`@since` is never read from a comment**: the version map below is the one source (docs spec ruling 19). `@deprecated` is read into `deprecated?: string`.
5b. **`since` comes from a hand-maintained map inside this module**, `const SINCE: Record<string, string>`, keyed by member path. **Its values are api versions written as the bare number S12 uses (`'1'`, `'2'`), never sprint labels such as `'SP4a'`**, so that "what api version is this member from", which S12's two-version removal window depends on, has one answer the reference can render. Every member that shipped before this entry is `'1'`; the members this entry adds (`c.dialog`, `c.retry`, `c.screenshot`, `c.wait.animation`, `c.wait.hp`, `c.bot.interactGroundItem`, `hardStop.hpBelowPoints`) are `'2'`. **A member the map does not name is emitted with `since: ''` and the renderer omits the column for it; no gate fails on an empty `since`**, because a version label is not worth blocking a build over. The map is about thirty lines and a doc comment must never carry a `@since` beside it: two sources for one fact is the failure gate 1 exists to prevent.
6. **`vendored: true`** when the member's declaration lives under `web/src/vendor/`, taken from the declaration's source file, **not from the path prefix** (R32). The prefix rule was right until Task 7 put `interactGroundItem` on `c.bot`, at which point it would have marked our own new member vendored and hidden it from gate 2 and from the api-shape gate's `ours` filter. The file is also the real question the flag stands for: can we edit the prose that documents this member.
7. **Types.** Every name in `scriptApi.ts`'s export list that is not `ScriptContext` becomes an `ApiType`: `interface` gets `fields`, a union of string literals gets `enums` **and** a `variants` list, a discriminated union gets `variants` rendered as source text.
8. **`usedBy`** is a syntactic scan of each example source for member expressions rooted at the run parameter, recording the full path and **every ancestor path**: `c.travel.to(...)` records `c.travel.to`, `c.travel` and `c`. Gate 3 counts on the ancestor rule, so it is a rule and not a detail. A member named only in a comment does not count.

- [ ] **Step 1: Write the fixture and the failing test**

`web/src/tasks/gen/fixture.harness.ts` is a synthetic surface, deliberately small and deliberately unlike the real one, so the traversal is pinned without depending on a surface that moves:

```ts
// A synthetic ScriptContext for the traversal test. It carries one of each shape the real
// surface has: an object-literal namespace, a CLASS-typed property (the c.sdk case), an
// INTERFACE EXTENDING a class type (the c.bot case after Task 7, plan ruling R15), a documented
// method, an undocumented method, a deprecated method, a string union, and an options bag.
//
// It is NOT called ScriptContext, which is why buildApiIndex takes a `root` parameter: a
// traversal hard-coded to the production name walks nothing here and every assertion below is
// vacuously green rather than red.
export class FakeActions { /** Chops it. */ chopTree(name: string): Promise<boolean> { return Promise.resolve(!!name); } }
/** Our own extension of a vendored class type, the c.bot shape after Task 7. */
export interface FakeBot extends FakeActions {
  /** Ours, not theirs. Declared in this file, so `vendored` must be false (plan ruling R32). */
  takeItem(name: string): Promise<boolean>;
}
export type FakeKind = 'tree' | 'rock';
export interface FakeOpts { /** tiles */ maxDistance?: number }
export interface FakeContext {
  /** The world now. Never null. */
  state(): object;
  bot: FakeBot;
  sdk: FakeActions;
  wait: {
    /** Waits. True when it happened, false on timeout or stop. */
    until(pred: () => boolean, opts?: FakeOpts): Promise<boolean>;
    ticks(n: number): Promise<boolean>;
  };
  /** @deprecated Use `state()`. Removed in api 3. */
  snapshot(): object;
}
```

The fixture cannot exercise R32's *true* arm, because nothing in `web/src/tasks/gen/` is under `web/src/vendor/`. That half is asserted against the real surface in `scriptApi.test.ts` (`c.sdk.getState` is vendored, `c.bot.interactGroundItem` is not), and the fixture asserts the arm it can: everything it declares is ours.

`web/src/tasks/gen/apiIndex.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { join } from 'node:path';
import { buildApiIndex, GENERATOR_VERSION, WEB_ROOT } from './apiIndex';

const FIXTURE = 'src/tasks/gen/fixture.harness.ts';
const base = {
  entry: FIXTURE, tsconfig: 'tsconfig.json', root: 'FakeContext',
  sources: [`web/${FIXTURE}`], forbidden: []
};
const index = buildApiIndex({
  ...base,
  examples: [{ id: 'demo', title: 'Demo', teaches: 'the shape', docsAnchor: '00-quickstart.md#demo', source: 'export default defineScript({ tasks: [{ run: async c => { await c.wait.until(() => true); c.bot.chopTree("Oak"); } }] });' }]
});
const at = (path: string) => index.members.find(m => m.path === path);

describe('the traversal', () => {
  test('schemaVersion is asserted by every consumer, so it is asserted here first', () => {
    expect(index.schemaVersion).toBe(1);
  });

  test('an object-literal namespace is a namespace and is descended into', () => {
    expect(at('c.wait')!.kind).toBe('namespace');
    expect(at('c.wait.until')!.kind).toBe('method');
  });

  test('a CLASS-typed property is a namespace too, or the studio loses c.bot and c.sdk', () => {
    expect(at('c.sdk')!.kind).toBe('namespace');
    expect(at('c.sdk.chopTree')!.kind).toBe('method');
  });

  test('an INTERFACE EXTENDING a class type is a namespace, which is c.bot after Task 7', () => {
    expect(at('c.bot')!.kind).toBe('namespace');
    expect(at('c.bot.chopTree')!.kind).toBe('method');    // inherited from the class
    expect(at('c.bot.takeItem')!.kind).toBe('method');    // added by the interface
  });

  test('vendored is decided by the declaring FILE, not by the c.bot prefix (R32)', () => {
    // Everything in the fixture is ours, so the prefix rule and the file rule disagree here,
    // which is exactly what makes this assertion worth writing.
    expect(at('c.bot.chopTree')!.vendored).toBe(false);
    expect(at('c.bot.takeItem')!.vendored).toBe(false);
    expect(at('c.wait.until')!.vendored).toBe(false);
  });

  test('the entry and tsconfig resolve against web/, never against process.cwd()', () => {
    const absolute = buildApiIndex({ ...base, entry: join(WEB_ROOT, FIXTURE), tsconfig: join(WEB_ROOT, 'tsconfig.json'), examples: [] });
    expect(absolute.members.map(m => m.path)).toEqual(index.members.map(m => m.path));
    expect(absolute.members.length).toBeGreaterThan(5);
  });

  test('generatedFrom.files is what the caller passed, and the hash covers the generator version', () => {
    expect(index.generatedFrom.files).toEqual([`web/${FIXTURE}`]);
    const other = buildApiIndex({ ...base, examples: [], sources: [`web/${FIXTURE}`, 'web/tsconfig.json'] });
    expect(other.hash).not.toBe(buildApiIndex({ ...base, examples: [] }).hash);
    expect(typeof GENERATOR_VERSION).toBe('number');
  });

  test('signatures and docs come from the source, and the type is not restated in the doc', () => {
    expect(at('c.wait.until')!.signature).toBe('(pred: () => boolean, opts?: FakeOpts) => Promise<boolean>');
    expect(at('c.wait.until')!.doc).toBe('Waits. True when it happened, false on timeout or stop.');
    expect(at('c.wait.ticks')!.doc).toBe('');
  });

  test('@deprecated is read; @since is never read, because the version map is the one source', () => {
    expect(at('c.snapshot')!.deprecated).toBe('Use `state()`. Removed in api 3.');
    expect(at('c.wait.until')!.since).toBe('');       // not in the map, so no version is invented
  });

  test('since comes from the map, keyed by member path, as a bare api number', () => {
    const i = buildApiIndex({ ...base, examples: [], since: { 'c.wait.until': '1', 'c.wait.ticks': '2' } });
    expect(i.members.find(m => m.path === 'c.wait.until')!.since).toBe('1');
    expect(i.members.find(m => m.path === 'c.wait.ticks')!.since).toBe('2');
    expect(i.members.find(m => m.path === 'c.bot.chopTree')!.since).toBe('');
  });

  test('a string union becomes an enum and a variants list', () => {
    expect(index.enums.FakeKind).toEqual(['tree', 'rock']);
    expect(index.types.find(t => t.name === 'FakeKind')!.kind).toBe('union');
  });

  test('an interface becomes fields, with the doc comment on each', () => {
    const opts = index.types.find(t => t.name === 'FakeOpts')!;
    expect(opts.fields).toEqual([{ name: 'maxDistance', type: 'number', optional: true, doc: 'tiles' }]);
  });

  test('usedBy records the full path and every ancestor, which is what gate 3 counts', () => {
    expect(index.usedBy['c.wait.until']).toEqual(['demo']);
    expect(index.usedBy['c.wait']).toEqual(['demo']);
    expect(index.usedBy['c.bot']).toEqual(['demo']);
    expect(index.usedBy['c']).toEqual(['demo']);
  });

  test('a member named only in a comment does not count as used', () => {
    const i = buildApiIndex({ ...base,
      examples: [{ id: 'commented', title: 'C', teaches: 'nothing', docsAnchor: '00-quickstart.md#c', source: '// c.snapshot() is old\nexport default defineScript({ tasks: [] });' }] });
    expect(i.usedBy['c.snapshot']).toBeUndefined();
  });
});
```

Fourteen tests, not the ten an earlier draft counted; step 6 says so.

- [ ] **Step 2: Run it and watch it fail**

Run from `web/`: `npx vitest run src/tasks/gen/apiIndex.test.ts`
Expected: FAIL, "Failed to resolve import './apiIndex'".

- [ ] **Step 3: Write `web/src/tasks/gen/apiIndex.ts`**

It imports `typescript` by bare specifier, which resolves to `web/node_modules`'s pinned 5.9.3 because the importing file is under `web/src`. Its header says why it lives here rather than in `scripts/gen/`:

```ts
// The ts.Program traversal behind web/src/agent/api-index.json. It lives under web/src, not in
// scripts/gen, for three reasons and each of them is load bearing (plan ruling R10, R16):
//
//  1. `import ts from 'typescript'` resolves from the IMPORTING FILE, not the cwd. There is no
//     node_modules at the repo root, under scripts/, or under scripts/gen/, so the same import
//     in scripts/gen/apiDocs.ts is satisfied silently by Bun's auto-install cache. Measured on
//     2026-09-09: that cache held TypeScript 7.0.2, the Go port, against web's pinned 5.9.3,
//     and `bun --no-install` on the same file could not resolve it at all. Signature text comes
//     out of checker.typeToString, so a different compiler is a different artefact.
//  2. web/vitest.config.ts includes src/**/*.test.ts and there is no runner for scripts/, so a
//     test beside the generator over there would be run by nothing.
//  3. P20's api-shape gate reuses this same program from web/src/tasks/scriptApi.test.ts, and a
//     vitest file cannot import across the scripts/ boundary.
//
// Nothing shipped imports this module, so it is not in the bundle; assert that rather than
// assume it (Task 16 does, over the built chunk list).
import ts from 'typescript';
```

Watch the ceiling: at about 330 lines it is the largest new file in the entry. If it crosses, the type half (`ApiType`, `enums`) splits into `apiIndex.types.ts`.

- [ ] **Step 4: Write `scripts/gen/apiDocs.ts`, index half only**

It is argv and file IO, exactly like `tutorial-steps.ts` (26 lines), and it touches `ts` nowhere:

```ts
// Builds web/src/agent/api-index.json and API.md from the declared script surface.
// Run by scripts/build.ps1 with --check; run by hand without it after the surface changes.
//
//   bun scripts/gen/apiDocs.ts            # write
//   bun scripts/gen/apiDocs.ts --check    # fail if the committed artefacts are stale
//
// It runs from the repository root beside the other three generators and imports node builtins
// and repo-relative modules only. The TypeScript compiler API is reached from web/src, never
// from here: see web/src/tasks/gen/apiIndex.ts's header for the measurement behind that.
//
// It also reads the seven prose pages and the nine example sources OFF DISK rather than
// importing web/src/tasks/docs/{index,examples}.ts (plan ruling R35). Those two modules are
// built out of Vite `?raw` imports, whose only type declaration is vite/client's ambient
// `declare module '*?raw'`; scripts/gen/tsconfig.json loads bun-types, not vite/client, and
// tsc follows imports regardless of a project's `include`, so importing them would break the
// generator typecheck that build.ps1 runs as verify step 9. The barrel modules stay for the
// vitest gates, which run under Vite where `?raw` is real.
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { buildApiIndex } from '../../web/src/tasks/gen/apiIndex';
import { enforceBudget, ROOT, writeOrCheckText } from './lib/io';

const check = process.argv.includes('--check');
const OUT = join(ROOT, 'web', 'src', 'agent');
const DOCS = join(ROOT, 'web', 'src', 'tasks', 'docs');

// Repo-relative, because that is what generatedFrom.files publishes. buildApiIndex resolves and
// hashes them with GENERATOR_VERSION; there is no hash argument to get stale.
const SOURCES = [
  'web/src/tasks/scriptApi.ts', 'web/src/tasks/scriptApiKeys.ts', 'web/src/tasks/scriptContext.ts',
  'web/src/tasks/types.ts', 'web/src/tasks/api.ts', 'web/src/clientTypes.ts', 'web/src/agent/types.ts'
];

// The one list of page names, and the one list of examples. web/src/tasks/docs/index.ts and
// examples.ts hold the same two lists for the bundle; Task 13 step 5 and Task 14 step 4 assert
// that the two agree, because two lists of one thing is the failure gate 1 exists to prevent.
const PAGE_NAMES = [
  '00-quickstart.md', '01-script-model.md', '02-waiting.md', '03-params-and-requirements.md',
  '04-find-travel-and-anchor.md', '05-health-and-recovery.md', '06-limits-and-trust.md'
];
const pages = PAGE_NAMES.map(name => ({ name, text: readFileSync(join(DOCS, name), 'utf8') }));
const examples = EXAMPLE_RECORDS.map(e => ({ ...e, source: readFileSync(join(DOCS, 'examples', `${e.id}.js`), 'utf8') }));

const index = buildApiIndex({
  entry: join(ROOT, 'web', 'src', 'tasks', 'scriptApi.ts'),
  tsconfig: join(ROOT, 'web', 'tsconfig.json'),
  root: 'ScriptContext',
  sources: SOURCES, examples, forbidden: []
});
if (index.members.length < 100) throw new Error(`the traversal found only ${index.members.length} members; check that entry and tsconfig resolved (they are absolute here) before assuming the surface moved`);
console.log(`${index.members.length} members, ${index.types.length} types, ${Object.keys(index.enums).length} closed sets`);

const json = JSON.stringify(index, null, 2) + '\n';
enforceBudget('api-index.json', new TextEncoder().encode(json), { rawBytes: 400_000, gzipBytes: 40_000 });
writeOrCurrent(join(OUT, 'api-index.json'), json);
```

`EXAMPLE_RECORDS` is the `{ id, title, teaches, docsAnchor }` metadata without `source`, declared in `apiDocs.ts` itself; the source text is the file on disk. In this task both lists are **empty**, and `pages`/`examples` come out empty with them: Task 13 fills `PAGE_NAMES`' files and Task 14 fills `EXAMPLE_RECORDS`. `web/src/tasks/docs/index.ts` and `examples.ts` are still created by Tasks 11 and 14 for the bundle, and their tests are the gates over them.

`writeOrCurrent` is the R12 wrapper: it calls `writeOrCheckText(path, text, check)` inside a try/catch and rethrows with `<file> is out of date with web/src/tasks/scriptApi.ts and its docs; run: bun scripts/gen/apiDocs.ts`, because both shared helpers hardcode "is out of date with engine/content", which names the wrong cause for this generator.

The loud throw on `members.length < 100` is `atlas.ts:73`'s pattern: a traversal that silently found nothing is the failure a `--check` cannot see. Its message names the path question first, because an empty program is what a mis-resolved `entry` looks like from the outside.

- [ ] **Step 5: Generate the index and read it**

Run from the repository root: `bun scripts/gen/apiDocs.ts`
Expected: a line naming the member, type and enum counts, then `wrote web/src/agent/api-index.json`, then the budget line.
Read the first 60 lines of the output. Confirm by eye: `schemaVersion` is 1, `generatedFrom.files` lists the seven `SOURCES` paths rather than being empty, `c.bot` and `c.sdk` are `kind: "namespace"`, `c.bot.interactGroundItem` has `vendored: false` while `c.bot.chopTree` has `vendored: true`, `HealthCondition` is in `enums` with nine values, `TasksErrorCode` is in `enums` with eleven (the SP4b ledger's "twelve" at its line 192 is wrong, and the docs spec's table is right; `TasksErrorCode` is in the index only because Task 8's export list names it, per R27), and `forbidden` is `[]`.

- [ ] **Step 6: Run the tests and the generator typecheck**

Run from `web/`: `npx vitest run src/tasks/gen/apiIndex.test.ts`
Expected: PASS, fourteen tests.
Run from `web/`: `npx tsc --noEmit -p ../scripts/gen/tsconfig.json`
Expected: clean. It exits 0 at HEAD and it must still exit 0 here. `scripts/gen/tsconfig.json:20` is `"include": ["**/*.ts"]`, so `apiDocs.ts` joins the project by existing and **no config change is needed**, which is true only because R35 keeps the generator off the `?raw` barrel modules. **If this step goes red with `Cannot find module './00-quickstart.md?raw'`, an import of `web/src/tasks/docs/index.ts` or `examples.ts` crept back in**: remove it and read the file off disk, and do not repair it by adding `vite/client` to that project's `types`.

- [ ] **Step 7: Prove R15 is load bearing**

In `apiIndex.ts`, drop the class-type arm so a class-typed property falls through to `kind: 'property'`, and rerun the test.
Expected: FAIL on "a CLASS-typed property is a namespace too", and `c.bot.chopTree` disappears from `members` entirely. Restore. Without this the index looks fine and entry 6 quietly gets no completions for 160 members.

- [ ] **Step 8: Verify and commit**

Run from `web/`: `npm run typecheck && npm run lint && npx vitest run`
Run from the repository root: `powershell -File scripts/line-ceiling.ps1`
Expected: green. `api-index.json` is `.json` and outside `$includeExt`, so it is not scanned (R29).

```bash
git add web/src/tasks/gen/apiIndex.ts web/src/tasks/gen/apiIndex.test.ts web/src/tasks/gen/fixture.harness.ts \
        web/src/tasks/docs/examples.ts scripts/gen/apiDocs.ts web/src/agent/api-index.json
git -c core.safecrlf=false commit -m "feat(gen): walk the declared script surface into api-index.json

The first use of the TypeScript compiler API in this repository, so the traversal rules are
written down rather than inherited. The traversal lives under web/src because a bare
'typescript' import from scripts/ resolves to Bun's auto-install cache, measured at 7.0.2
against web's pinned 5.9.3, and because vitest has no runner for scripts/.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 11: The renderer, `API.md`, and `--check`

**Files:**
- Create: `web/src/tasks/gen/render.ts`, `web/src/tasks/gen/render.test.ts`
- Create: `web/src/agent/API.md` (generated, committed)
- Modify: `scripts/gen/apiDocs.ts` (the second artefact)

**Interfaces:**
- Consumes: `ApiIndex` (Task 10).
- Produces: `export function renderApiMarkdown(index: ApiIndex, pages: { name: string; text: string }[]): string;`

**What `API.md` is.** The seven prose pages, concatenated ahead of the generated reference, with the nine examples appended. Pages and examples arrive in Tasks 13 and 14, so `API.md` grows across three commits and **gate 1 is green at each of them**, which is the property that makes a regenerate-and-compare gate usable mid-entry. Its first line says it is generated and must not be hand edited.

- [ ] **Step 1: Write the failing test**

`web/src/tasks/gen/render.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { renderApiMarkdown } from './render';

const index = {
  schemaVersion: 1 as const, hash: 'abc123', generatedFrom: { files: ['web/src/tasks/scriptApi.ts'] },
  members: [
    { path: 'c.wait', kind: 'namespace' as const, signature: '', doc: 'Waiting.', since: '1', vendored: false },
    { path: 'c.wait.until', kind: 'method' as const, signature: '(pred: (s: WorldState) => boolean, opts?: WaitUntilOpts) => Promise<boolean>', doc: 'Waits until the predicate holds.', since: '1', vendored: false },
    { path: 'c.anchor', kind: 'method' as const, signature: '(x?: number, z?: number) => Tile', doc: 'Home.', since: '1', vendored: false, deprecated: 'Use `anchor({ x, z })`. Removed in api 3.' },
    { path: 'c.bot.chopTree', kind: 'method' as const, signature: '(name: string) => Promise<ActionResult>', doc: '', since: '', vendored: true }
  ],
  types: [{ name: 'WaitUntilOpts', kind: 'interface' as const, doc: '', fields: [{ name: 'timeoutMs', type: 'number', optional: true, doc: 'Milliseconds. Default 20000.' }] }],
  enums: { ResourceKind: ['tree', 'rock'] }, forbidden: [],
  // A real example, not []: with an empty array a renderer that dropped the gallery entirely
  // passes every assertion below, because `hello-status` also appears through usedBy.
  examples: [{ id: 'hello-status', title: 'Hello, status', teaches: 'One task and a stop condition',
    docsAnchor: '00-quickstart.md#your-first-script', source: 'export default defineScript({ id: "hello-status", tasks: [] });' }],
  usedBy: { 'c.wait.until': ['hello-status'] }
};

describe('renderApiMarkdown', () => {
  const md = renderApiMarkdown(index, [{ name: '00-quickstart.md', text: '# Quickstart\n\nScripts are JavaScript.\n' }]);

  test('says it is generated, in its first line, and names the command', () => {
    expect(md.split('\n')[0]).toContain('generated');
    expect(md).toContain('bun scripts/gen/apiDocs.ts');
  });

  test('puts the prose ahead of the reference, in the order given', () => {
    expect(md.indexOf('Scripts are JavaScript.')).toBeLessThan(md.indexOf('c.wait.until'));
  });

  test('renders a member with its signature, its doc and the examples that use it', () => {
    expect(md).toContain('### `c.wait.until`');
    expect(md).toContain('(pred: (s: WorldState) => boolean, opts?: WaitUntilOpts) => Promise<boolean>');
    expect(md).toContain('Waits until the predicate holds.');
    expect(md).toContain('hello-status');
  });

  test('marks a deprecated member so a reader cannot miss it', () => {
    expect(md).toMatch(/### `c\.anchor`[\s\S]{0,400}Deprecated: Use `anchor\(\{ x, z \}\)`\. Removed in api 3\./);
  });

  test('renders the vendored half without failing on its missing doc', () => {
    expect(md).toContain('c.bot.chopTree');
  });

  test('appends the examples gallery, with each source, AFTER the member reference', () => {
    expect(md).toContain('Hello, status');
    expect(md).toContain('One task and a stop condition');
    expect(md).toContain('00-quickstart.md#your-first-script');
    // A distinctive line of the source, so a renderer that printed only titles fails here.
    expect(md).toContain('export default defineScript({ id: "hello-status"');
    expect(md.indexOf('export default defineScript({ id: "hello-status"')).toBeGreaterThan(md.indexOf('### `c.wait.until`'));
  });

  test('substitutes the forbidden block, and says so in words when the list is empty', () => {
    // Docs spec ruling 12: 06-limits-and-trust.md carries a GENERATED block, not a second copy,
    // so that entry 6's forbidden.ts becomes an input rather than a hand-typed list. The marker
    // and the substitution are defined here, empty, so entry 6 fills a seam instead of inventing
    // one and editing both the page and this renderer.
    const withPage = renderApiMarkdown(index, [{ name: '06-limits-and-trust.md', text: '## Shadowed identifiers\n\n<!-- forbidden -->\n' }]);
    expect(withPage).not.toContain('<!-- forbidden -->');
    expect(withPage).toMatch(/nothing is shadowed yet/i);

    const withList = renderApiMarkdown({ ...index, forbidden: ['fetch', 'XMLHttpRequest'] },
      [{ name: '06-limits-and-trust.md', text: '## Shadowed identifiers\n\n<!-- forbidden -->\n' }]);
    expect(withList).toContain('`fetch`');
    expect(withList).toContain('`XMLHttpRequest`');
  });

  test('renders closed sets and named types as definition lists, never as tables (ruling 11)', () => {
    expect(md).toContain('ResourceKind');
    expect(md).toContain('timeoutMs');
    expect(md).not.toMatch(/^\|/m);
  });

  test('writes no em dash', () => {
    expect(md).not.toContain('—');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run from `web/`: `npx vitest run src/tasks/gen/render.test.ts`
Expected: FAIL, "Failed to resolve import './render'".

- [ ] **Step 3: Write `web/src/tasks/gen/render.ts`**

The grammar is the help pane's subset and nothing else (docs spec section 5 and ruling 11): headings, paragraphs, unordered and ordered lists, fenced code blocks, inline code and links. **No tables**, including in the generated half, because entry 6 renders this same grammar in a 300px pane and a table there is raw pipe characters. A two-column enumeration is a bolded term followed by a paragraph, the `.kv` row grammar the design system already has.

```ts
/** The one marker a prose page may carry. Substituted from index.forbidden (docs spec ruling 12). */
const FORBIDDEN_MARKER = '<!-- forbidden -->';

function forbiddenBlock(forbidden: string[]): string {
  if (forbidden.length === 0) {
    return 'Nothing is shadowed yet. The shadowed-identifier list is generated from\n'
      + '`web/src/tasks/forbidden.ts`, which the script studio creates; until it exists this\n'
      + 'block is empty, and the guardrails this page describes are the ones in the paragraphs above.';
  }
  return forbidden.map(name => `- \`${name}\``).join('\n');
}

export function renderApiMarkdown(index: ApiIndex, pages: { name: string; text: string }[]): string {
  const out: string[] = [
    '<!-- This file is generated by scripts/gen/apiDocs.ts. Do not hand edit it: scripts/build.ps1',
    '     regenerates it and compares, so a hand edit fails the build. Run: bun scripts/gen/apiDocs.ts -->',
    ''
  ];
  for (const p of pages) out.push(p.text.trimEnd().split(FORBIDDEN_MARKER).join(forbiddenBlock(index.forbidden)), '');
  out.push('# Script API reference', '', `Generated from \`web/src/tasks/scriptApi.ts\`. Index hash \`${index.hash}\`.`, '');
  ...                                        // members, then types and closed sets
  out.push('# Worked examples', '');          // the gallery, LAST, after the reference
  for (const e of index.examples) {
    out.push(`## ${e.title}`, '', e.teaches, '', `Explained in \`${e.docsAnchor}\`.`, '', '```js', e.source.trimEnd(), '```', '');
  }
  return out.join('\n');
}
```

**Why the marker exists in an entry that ships `forbidden: []`.** Docs spec ruling 12 makes `forbidden.ts` an input to the generator so that gate 1 covers the documented list and the enforced list together, and says the page carries "a generated block rather than a second copy". Carrying the field end to end and leaving the page hand-written would mean entry 6 has to invent the marker, edit the page and edit this renderer, which is the hand-typed-second-copy risk the ruling exists to close. The marker and the substitution land now, empty, with one sentence of prose saying so, and the test above pins both arms.

- [ ] **Step 4: Emit the second artefact from `apiDocs.ts`**

```ts
const md = renderApiMarkdown(index, pages);   // read off disk in Task 10's step 4, per R35
writeOrCurrent(join(OUT, 'API.md'), md);
```

`pages` is the `readFileSync` list `apiDocs.ts` already builds from `PAGE_NAMES`; it is empty until Task 13 writes the files. **This task also creates `web/src/tasks/docs/index.ts` with an empty `PAGES` array and its declared type**, for the bundle and for gate 5, and Task 13 fills both. Two lists of seven page names is the drift this plan otherwise complains about, so Task 13 step 5 asserts they agree. Both artefacts go through `writeOrCheckText` (R11): `API.md` is multi-line markdown and a byte compare of one is red on every fresh clone, and the index is pretty-printed, which the text helper does not care about.

- [ ] **Step 5: Generate, then check**

Run from the repository root:
```
bun scripts/gen/apiDocs.ts
bun scripts/gen/apiDocs.ts --check
```
Expected: the first writes both files and prints two `wrote` lines; the second prints two `is current` lines and exits 0.

- [ ] **Step 6: Prove `--check` fails on a hand edit, which is the case a hash comparison passes**

Change one word in the committed `web/src/agent/API.md`, then run `bun scripts/gen/apiDocs.ts --check`.
Expected: exit non-zero, with the R12 message naming `bun scripts/gen/apiDocs.ts` and **not** naming `engine/content`. `git checkout web/src/agent/API.md` to restore.

- [ ] **Step 7: Verify and commit**

Run from `web/`: `npm run typecheck && npm run lint && npx vitest run`

```bash
git add web/src/tasks/gen/render.ts web/src/tasks/gen/render.test.ts web/src/tasks/docs/index.ts \
        scripts/gen/apiDocs.ts web/src/agent/API.md web/src/agent/api-index.json
git -c core.safecrlf=false commit -m "feat(gen): render API.md from the index, and add the --check mode

Both artefacts go through writeOrCheckText rather than the byte comparer the spec named: this
repository is checked out with core.autocrlf=true and .gitattributes says text=auto, so a byte
compare of a multi-line committed text file is red on every fresh clone.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 12: Gate 1, watched failing four ways

**Files:**
- Modify: `scripts/build.ps1` (one block inside the existing `Push-Location $root` group at `:60-70`)
- Modify: `docs/VERIFICATION.md` (the step 6 and step 9 rows)

**Interfaces:** consumes `bun scripts/gen/apiDocs.ts --check` (Task 11); produces a non-zero exit and a message naming the command.

**Where it goes, and why not `verify.ps1`.** `scripts/verify.ps1` is **398** lines against the 400 ceiling; `build.ps1` is 180 and is verify **step 9**. Entry 3's plan ruled this class of question already (its R11 and R12), and the commit before this entry, `9ce3005`, is what a moved step count costs across four documents and a skill. **`$TotalSteps` stays 10.**

- [ ] **Step 1: Add the block**

`scripts/build.ps1`, after the `tutorial-steps.ts --check` at `:66-67`, inside the same `try`:

```powershell
    & $bun '--no-install' 'scripts/gen/apiDocs.ts' '--check'
    if ($LASTEXITCODE -ne 0) { throw 'web/src/agent/API.md and api-index.json are stale (run: bun scripts/gen/apiDocs.ts)' }
```

PowerShell 5.1 rules this satisfies and must keep satisfying: no `&&`, no `||`, no ternary, no `??`, no `?.`; the message is single-quoted, so a backtick inside it would be literal rather than an escape; and a `throw` under `$ErrorActionPreference = 'Stop'` (`:18`) terminates. `--no-install` is R24: Bun's auto-install is on by default and succeeds silently, so without it a future bare specifier in the generator resolves to whatever the operator's cache holds instead of failing at the gate.

It joins the `Push-Location $root` group rather than getting a `Push-Location $web` of its own, because R10 removed the reason for one. Add a one-line comment saying so, so the next reader does not restore the spec's version.

- [ ] **Step 2: Watch it fail, four ways**

Entry 3's plan requires every new gate be watched failing. Four demonstrations, each naming a case the spec's section 9 lists. Run `powershell -File scripts/build.ps1` after each, or the block alone; `& scripts/build.ps1` sets `$LASTEXITCODE` and does not throw, so read the exit code.

1. **Stale from an input change.** Add a doc comment to one `ScriptContext` member and do not regenerate.
   Expected: non-zero, message naming `bun scripts/gen/apiDocs.ts`.
2. **Hand-edited `API.md`, inputs untouched.** Change one word in the committed markdown.
   Expected: non-zero. **This is the case an input-hash comparison passes**, and it is the whole argument for regenerate-and-compare.
3. **Missing artefact.** Delete `web/src/agent/api-index.json`.
   Expected: non-zero, with `web/src/agent/api-index.json is missing; run the generator` (`io.ts:60`), not a stack trace.
4. **CRLF.** Force `API.md` to land CRLF (`git rm --cached web/src/agent/API.md && git checkout -- web/src/agent/API.md`, or clone to a scratch path and run there).
   Expected: **passes**, because `writeOrCheckText` normalises both sides. Then temporarily switch the call to `writeOrCheck` and rerun: it **fails**. That contrast is what proves R11 rather than asserting it. Restore.

Restore the tree after each with `git checkout -- <path>`.

- [ ] **Step 3: Update `docs/VERIFICATION.md`**

The step 9 row gains ", and the committed `web/src/agent/API.md` and `api-index.json` still match the declared script surface"; the step 6 row gains ", including the five script-API documentation gates". **The ten-step paragraph at `:73` and the table's ten rows do not change**, and neither does `scripts/verify.ps1`.

- [ ] **Step 4: Run the build and commit**

Run from the repository root: `powershell -File scripts/build.ps1`
Expected: green through all four generator checks.

```bash
git add scripts/build.ps1 docs/VERIFICATION.md
git -c core.safecrlf=false commit -m "build(gates): fail the build when the script API reference is stale

Gate 1. It joins the three existing --check calls in build.ps1, which verify runs as step 9;
verify.ps1 is at 398 of 400 lines and \$TotalSteps stays 10. Watched failing four ways,
including the hand-edited-artefact case that an input-hash comparison would pass.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---
## Task 13: The seven prose pages, the markdown subset, and gate 5

The quickstart and the six pages that carry what a generator cannot know. **Section 4 of the docs spec says which page renders which rule**, and the rules themselves live once, in the survey spec's section 4: a second copy here would be a second source with no gate between them, which is the failure gate 1 exists to prevent one layer up (docs spec ruling 21).

| File | Renders | Covers |
|---|---|---|
| `00-quickstart.md` | S2, S7 | From nothing to a running script in about fifteen lines: `defineScript`, one task, `when` and `run`, `c.status`, save, run, watch the trace. Its **first paragraph, in bold, is that scripts are JavaScript and a type annotation is a syntax error**, because the library fork seeds are TypeScript text that compiles only by carrying no annotations. Ends by pointing at the nine examples |
| `01-script-model.md` | S12 | The manifest, the task list, the first task whose `when` matches wins, `until`, `onStart`, `onStop`, and why one task with `when: () => true` is a free-form script. Additions over renames, and what a deprecation notice means |
| `02-waiting.md` | S7, S2, S8 | Every `wait.*` member, what each baselines, when each returns false, and the fixed-sleep rule with its reason: a `setTimeout` sleep drifts against the game tick. **Carries the docs spec's second runtime fact, in bold, in these words: `bot.*` observes before it resolves, while `sdk.send*` only confirms that the click was dispatched.** The spec calls that the most common cause of a script that appears to work and then does not, and it is why S7 marks the vendored `sdk.waitFor*` family **legacy rather than removing it**: that family stays reachable, it is what a `sdk.send*` caller has to reach for, and this page says so and points at `c.wait` instead. **States plainly that this inverts the web platform's convention**: `fetch` and every other `{ signal }` API rejects on abort and ours resolves, because a stop is a normal ending and an uncaught rejection would take the run down at exactly the moment the player asked it to stop. And the consequence: a cancelled await is indistinguishable from a timeout in the return value, so the trace label is how you tell them apart |
| `03-params-and-requirements.md` | S4, S8, S9 | The four `ParamField` types, how a schema becomes a form, `validateParams`'s rejection of unknown keys, the four `Requirement` kinds including that a `custom` requirement cannot cross the Worker boundary and is evaluated inside it. **The `c.state()` versus `sdk.getState()` distinction** (ours is never null, theirs is `WorldState \| null`), and that `c.memory` is a plain `Map` so `get` is `unknown \| undefined` |
| `04-find-travel-and-anchor.md` | S5, S3, S9 | `c.find`'s three layers and which one answered, `c.travel`'s typed failures, landmarks, what `c.anchor` is for. **Names the two live exceptions**: `netFishAndDrop.ts:47-49` reads the scene with `filter().sort()[0]` because `find` alone was not enough and the fluent query is a later entry, and three bundled scripts still report `'not_found'` where our own members report `'target_not_found'` (R9), which entry 7's P10 closes. **Carries the results half of the docs spec's second runtime fact**: `c.find`, `c.travel` and `c.bot.*` return a result you branch on because they have already observed the outcome, while `c.sdk.send*` returns as soon as the click left, so a script that reads a `sdk.send*` return as "it happened" is the failure this page names. **And one sentence that the predicate arm of a selector (`c.find.nearest(e => ...)`) is not accepted yet and arrives with entry 7's fluent query** (R34), so a reader who tries one and gets a type error knows why |
| `05-health-and-recovery.md` | S3, S8 | `HealthPolicy`, the nine `HealthCondition` values, `recovers` on a task, `c.health.recovered`, and `DeathBehaviour` **as it actually is: seven values** |
| `06-limits-and-trust.md` | S10 | The trust model in full, below |

**`06-limits-and-trust.md` is the one page that carries more than a rendering**, and it is the page most easily got wrong by overclaiming. It says, in these words:
- **A Worker-resident script is trusted as the account's own code.** The scoped transport's refusal of `relogin` and `logout`, the `forbidden_api` scan and the `no-transport-escape` lint are **guardrails against accidents, not a boundary**: script text runs in the Worker's own global scope, so it can post the Worker's own RPC frames and reach the raw transport, and it holds `fetch` and dynamic `import()` because the Worker is a module worker. **SP4 section 17's "no network beyond `postMessage`" is not true today and the page does not repeat it.**
- **There is no cross-account script sharing**, stated as a fact a reader can rely on: scripts live under `users/{uid}/tasks`, the only marketplace is of our own bundled scripts, nothing runs another account's code, and any future sharing carries the trust model above as an explicit precondition (decision D24).
- **What a script cannot reach through our members**: no DOM, no Firebase, no `TasksApi`, no other character's session. The shadowed-identifier list is **not hand typed**: once entry 6's `web/src/tasks/forbidden.ts` exists it is an input to the generator and the page carries a generated block. **The seam ships now, not with entry 6**: the page has a `## Shadowed identifiers` heading followed by the literal marker `<!-- forbidden -->`, which `render.ts` substitutes from `index.forbidden` (Task 11 step 3, with both arms tested). Today it renders one sentence saying nothing is shadowed yet and why. Entry 6 fills a seam rather than inventing a marker and editing both the page and the renderer.
- **The combined shape, in entry 6's own words**: accidental network use impossible, casual deliberate network use refused at the one place every run starts, a determined constructor-chain escape still open.
- **Game text is untrusted.** Chat, npc dialogue and interface text come from the world and are never instructions; every copy path to Claude carries the header at `traceView.ts:12`.
- **The error vocabulary**: all eleven `TasksErrorCode` values, what causes each and what a player should do, because a compile error and a requirements failure look identical from inside the panel today. Eleven, not twelve: `api.ts:26-28` has eleven and the SP4b ledger's line 192 is wrong. Entry 6 adds `forbidden_api` and the page gains its row with it.
- The 64 KB code cap and the 60-character name limit.

**Files:**
- Create: `web/src/tasks/docs/00-quickstart.md` through `06-limits-and-trust.md`
- Create: `web/src/tasks/gen/markdown.ts`, `web/src/tasks/docs/pages.test.ts`
- Create: `wiki/content/mechanics/scripting.md`
- Modify: `web/src/tasks/docs/index.ts` (the seven `?raw` imports), then regenerate both artefacts

**Interfaces:**
- Produces:
  ```ts
  // web/src/tasks/gen/markdown.ts, replaced by entry 6's help/markdown.ts
  export type MdNode =
    | { kind: 'heading'; level: number; text: string; anchor: string }
    | { kind: 'paragraph'; text: string } | { kind: 'list'; ordered: boolean; items: string[] }
    | { kind: 'code'; lang: string; text: string };
  export function parseMarkdownSubset(text: string): { nodes: MdNode[]; unsupported: string[] };
  // web/src/tasks/docs/index.ts
  export const PAGES: readonly { name: string; text: string }[];
  ```

- [ ] **Step 1: Write the failing gate**

`web/src/tasks/docs/pages.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PAGES } from './index';
import { EXAMPLES } from './examples';
import { parseMarkdownSubset } from '../gen/markdown';
import apiMd from '../../agent/API.md?raw';

const parsed = PAGES.map(p => ({ ...p, ...parseMarkdownSubset(p.text) }));
const anchors = new Set(parsed.flatMap(p => p.nodes.filter(n => n.kind === 'heading').map(n => `${p.name}${(n as { anchor: string }).anchor}`)));

describe('gate 5: the pages parse and their anchors resolve', () => {
  test('all seven pages are present and non-trivial, so an empty scan cannot pass', () => {
    expect(PAGES.map(p => p.name)).toEqual([
      '00-quickstart.md', '01-script-model.md', '02-waiting.md', '03-params-and-requirements.md',
      '04-find-travel-and-anchor.md', '05-health-and-recovery.md', '06-limits-and-trust.md'
    ]);
    for (const p of PAGES) expect(p.text.length, p.name).toBeGreaterThan(800);
  });

  test('every page uses the help pane subset and nothing else', () => {
    for (const p of parsed) expect(p.unsupported, `${p.name}: ${p.unsupported.join(', ')}`).toEqual([]);
  });

  test('every internal link, and every example docsAnchor, names a heading that exists', () => {
    const links = parsed.flatMap(p => [...p.text.matchAll(/\]\((\d\d-[a-z-]+\.md#[a-z0-9-]+)\)/g)].map(m => m[1]));
    expect(links.length, 'the pages cross-link, so an empty link set means the regex stopped matching').toBeGreaterThan(3);
    for (const l of links) expect(anchors.has(l), l).toBe(true);
    for (const e of EXAMPLES) expect(anchors.has(e.docsAnchor), `${e.id} -> ${e.docsAnchor}`).toBe(true);
  });

  test('no em dash anywhere in the pages, the examples or the generated artefact', () => {
    for (const p of PAGES) expect(p.text, p.name).not.toContain('—');
    for (const e of EXAMPLES) expect(e.source, e.id).not.toContain('—');
    expect(apiMd).not.toContain('—');
  });

  test('the quickstart says in its first hundred words that scripts are JavaScript', () => {
    expect(PAGES[0].text.slice(0, 700)).toMatch(/JavaScript/);
    expect(PAGES[0].text).toMatch(/type annotation is a syntax error/i);
  });

  test('the trust page states the guardrail-not-boundary fact rather than a sandbox claim', () => {
    const page = PAGES.find(p => p.name === '06-limits-and-trust.md')!.text;
    expect(page).toMatch(/guardrail/i);
    expect(page).not.toMatch(/no network beyond postMessage/i);
    expect(page).toMatch(/eleven/);       // the error vocabulary count, not twelve
    expect(page).toContain('<!-- forbidden -->');   // the seam render.ts substitutes
  });

  test('the waiting page carries the observe-versus-dispatch fact and names the legacy family', () => {
    // The docs spec's second runtime fact, and the reason S7 marks sdk.waitFor* legacy rather
    // than removing it. It is the one thing on that page a generator can never know, so it is
    // asserted the way the JavaScript fact and the eleven-value count already are.
    const page = PAGES.find(p => p.name === '02-waiting.md')!.text;
    expect(page).toMatch(/waitFor/);
    expect(page).toMatch(/legacy/i);
    expect(page).toMatch(/sdk\.send/);
    expect(page).toMatch(/dispatch/i);
    const results = PAGES.find(p => p.name === '04-find-travel-and-anchor.md')!.text;
    expect(results).toMatch(/sdk\.send/);
  });

  test('the pages the generator reads and the pages the bundle imports are the same seven', () => {
    // apiDocs.ts holds PAGE_NAMES for the generator (R35: it reads off disk, it cannot import
    // this module) and docs/index.ts holds the ?raw imports for the bundle. Two lists of one
    // thing, so the agreement is asserted rather than hoped for.
    const gen = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'scripts', 'gen', 'apiDocs.ts'), 'utf8');
    for (const p of PAGES) expect(gen, `${p.name} is not in apiDocs.ts's PAGE_NAMES`).toContain(`'${p.name}'`);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run from `web/`: `npx vitest run src/tasks/docs/pages.test.ts`
Expected: FAIL, `PAGES` is empty from Task 11 and `../gen/markdown` does not resolve.

- [ ] **Step 3: Write the markdown subset parser**

`web/src/tasks/gen/markdown.ts`. The grammar is stated once, in the docs spec's section 5, and both this and entry 6's renderer read that one list: **headings, paragraphs, unordered and ordered lists, fenced code blocks, inline code, links, and nothing else.** Anything else is reported in `unsupported` with its first line, so the failure names the node rather than the file.

```ts
// The help pane's markdown subset, as a parser. Entry 6 ships the renderer over the same
// grammar and replaces this module; the grammar is stated once, in
// docs/superpowers/specs/2026-09-07-script-api-docs-design.md section 5, so the two cannot
// drift into two subsets.
//
// No tables (ruling 11): entry 6's pane is 300px wide, it ships no markdown library, and a
// table there renders as raw pipe characters. A two-column enumeration is a bolded term
// followed by a paragraph, the .kv row grammar the design system already has.
const ANCHOR = (text: string): string => '#' + text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
```

- [ ] **Step 4: Write the seven pages**

House prose rules: sentence case, no em dashes, no emoji, second person for the player, Claude named plainly, `idlescape` lowercase. Every page under 400 lines (and outside the line-ceiling scan anyway, R29). Every code block is JavaScript a player could paste, so none of them carries a type annotation.

- [ ] **Step 5: Fill `web/src/tasks/docs/index.ts`**

Seven explicit `?raw` imports, typed, because **there is no `import.meta.glob` anywhere in `web/src`** and explicit is what lets the module be typed:

```ts
import quickstart from './00-quickstart.md?raw';
...
export const PAGES: readonly { name: string; text: string }[] = [
  { name: '00-quickstart.md', text: quickstart }, ...
];
```

`?raw` on `.md` is core Vite, not a plugin, and works under vitest; `librarySource.test.ts` proves the idiom on `.ts`. **Verify it on `.md` in this step rather than discovering it in Task 14**: `npx vitest run src/tasks/docs/pages.test.ts` failing with an empty string is the tell.

- [ ] **Step 6: Write the wiki page**

`wiki/content/mechanics/scripting.md`, a standalone page: `type: mechanic`, `slug: scripting`, `title: Scripting`, a lead sentence, a `sources.lead` entry, and a body of three paragraphs plus a link to `/api/agent/docs`. **It is not a second copy of the reference** (docs spec ruling 3): the wiki pipeline extracts from the pinned clones and requires a `<!-- src: kind:ref -->` on every hand-written sentence, and our own script API has no such source. **The seven source kinds in `wiki/AUTHORING.md` have none for our own product source** (R31), so the lead and each sentence carry `editorial:cs:2026-09-09`; adding a `product:` kind is an addition to that document this entry declines. `scripts/build.ps1:73-91` fails the build on any `- error ` line in `wiki/build/report.md`, so run the wiki build before committing.

- [ ] **Step 7: Regenerate, run everything, and prove the gate bites**

Run from the repository root: `bun scripts/gen/apiDocs.ts` (the pages now land in `API.md`), then `bun run --cwd wiki build`.
Run from `web/`: `npx vitest run src/tasks/docs/pages.test.ts`
Expected: PASS.
Then put a markdown table into `02-waiting.md` and rerun.
Expected: FAIL, naming the unsupported node and the page. Remove it.
Then change a heading in `04-find-travel-and-anchor.md` without updating the `docsAnchor` that points at it (Task 14 adds those; until then use an internal link between two pages).
Expected: FAIL, naming the link. Restore.

- [ ] **Step 8: Verify and commit**

Run from `web/`: `npm run typecheck && npm run lint && npx vitest run`
Run from the repository root: `powershell -File scripts/build.ps1`

```bash
git add web/src/tasks/docs/ web/src/tasks/gen/markdown.ts wiki/content/mechanics/scripting.md \
        web/src/agent/API.md web/src/agent/api-index.json
git -c core.safecrlf=false commit -m "docs(script-api): the quickstart and the six pages a generator cannot write

Seven pages in the help pane's markdown subset, gated by a parser that fails on an unsupported
node rather than by a style review. 06-limits-and-trust.md states the trust model honestly:
the swap list is a guardrail, not a boundary, and SP4 section 17's network claim is not true
today, so the page does not repeat it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 14: The nine examples, executed as tests

Each is a complete user script that compiles through `compileUserScript` as written, 20 to 70 lines, opening with a comment header carrying its id, one sentence of purpose and the docs anchor where its explanation lives. **Every example is also a New-script template for entry 6 and a test fixture here.**

| id | Teaches | Principal API |
|---|---|---|
| `hello-status` | The smallest thing that runs: one task, a status line, a tick wait, an `until` that stops after a minute. Entry 6's New-script default | `c.status`, `c.log`, `c.wait.ticks`, `until` |
| `loop-with-params` | The canonical loop: a `select`, a `number` and a `boolean` param, an `until` computed from a param, **a counter carried across task runs in `c.memory`**, and a task that stops itself | `params`, `until`, `c.wait.xp`, `c.memory` |
| `find-and-travel` | Getting to a resource that is not on screen: nearest by kind, the atlas fallback, a landmark, and what each `TravelResult` failure means | `c.find.nearest`, `c.find.landmark`, `c.travel.to`, `c.travel.distanceTo` |
| `requirements-and-health` | Declaring what a run needs before it starts: a `requires` list covering all four kinds, a `HealthPolicy`, one task with `recovers` that reports back | `requires`, `health`, `c.health.is`, `c.health.recovered`, `c.anchor` |
| `dialogs-and-interfaces` | Reacting rather than driving: waiting for a dialogue, matching its text, choosing an option **by text through `c.dialog.choose`**, reading `interfaceTexts`, closing an unexpected interface. Carries the untrusted-text rule inline as a comment | `c.wait.dialog`, `c.dialog`, `c.bot.closeInterface` |
| `bank-round-trip` | Travel to a bank landmark, open, deposit everything matching a pattern, withdraw a tool, close, travel back to the anchor, loop | `c.travel.to`, `c.bot.openBank`, `c.bot.depositItem`, `c.bot.withdrawItem`, `c.bot.closeBank` |
| `combat-and-loot` | A combat loop with a drop and loot routine: attack the nearest of a named npc, eat below a threshold, pick up what matches, drop what does not, a `hardStop` on hp. Its loot loop **checks `c.signal.aborted` between items**, which is what a stop actually looks like inside a long task | `c.bot.attack`, `c.bot.eatFood`, `c.bot.interactGroundItem`, `hardStop`, `c.signal`, `c.retry` |
| `tutorial-steps` | The step-script shape: tasks keyed off `c.tutorial.title()` and `c.tutorial.is()`, `followHint`, and why the on-screen title is the step signal. **A three-step slice, deliberately not a competitor to the real script** | `c.tutorial.*` |
| `report-for-claude` | The Copy-for-Claude workflow as a script: it logs a structured snapshot of skills, inventory and position at `info` and stops. The page beside it explains the workflow and notes that the pasted text carries the untrusted-text header the trace view already writes | `c.log`, `c.state`, `c.sdk.getSkills`, `until` |

**Between them the nine reach all seventeen top-level members, which is what gate 3 asserts.** `c.memory` and `c.signal` had no home until `loop-with-params` and `combat-and-loot` were given one on purpose: they are the members a first script never reaches by accident and the ones a long-running script most needs, so an example that omitted them would be a gate passed by scoping rather than by covering. **Each of those two has exactly one home in the corpus, and that is deliberate**: Task 16 step 5 proves gate 3 bites by deleting the one `c.memory` usage and watching `unexampled: memory`, and a second usage anywhere would make that demonstration prove nothing. `hello-status` therefore keeps its elapsed-time counter in a module-scope variable, which is also the more honest thing to show a reader writing their first script. The three new members follow the same rule: `c.dialog` in `dialogs-and-interfaces`, `c.retry` in `combat-and-loot`, and **`c.screenshot` in `combat-and-loot`'s failure branch**, which is where its own doc comment says to use it.

**Three constraints every example is written under.** **No imports**: `compileUserScript` strips whole-line imports by regex, so an example that imported a helper would compile to something different from what it reads as; where one needs a helper it declares it inline, which is what a real user script has to do anyway. **No type annotations**: there is no transpile step. **An id matching `/^[a-z][a-z0-9-]{1,40}$/`**, which all nine satisfy.

**Files:**
- Create: `web/src/tasks/docs/examples/hello-status.js` through `report-for-claude.js`
- Modify: `web/src/tasks/docs/examples.ts` (nine entries), `web/src/tasks/docs/index.ts`, `web/eslint.config.js`
- Create: `web/src/tasks/docs/examples.test.ts`

- [ ] **Step 1: Write gate 4**

`web/src/tasks/docs/examples.test.ts`, modelled on `librarySource.test.ts:24-33`, which is this gate minus the param-schema comparison:

```ts
import { describe, expect, test } from 'vitest';
import { EXAMPLES } from './examples';
import { compileUserScript } from '../defineScript';

describe('gate 4: every example compiles as a user script', () => {
  test('there are nine of them and none is a stub', () => {
    expect(EXAMPLES).toHaveLength(9);
    for (const e of EXAMPLES) expect(e.source.length, e.id).toBeGreaterThan(300);
  });

  test('each compiles, its id matches the record of it, and every task and param is well formed', () => {
    for (const e of EXAMPLES) {
      const r = compileUserScript(e.source);
      expect(r.ok, `${e.id}: ${r.ok ? '' : r.message}`).toBe(true);
      if (!r.ok) continue;
      expect(r.script.id, e.id).toBe(e.id);
      expect(r.script.tasks.every(t => t.name.length > 0), e.id).toBe(true);
      for (const key of Object.keys(r.script.params ?? {})) {
        expect(['select', 'number', 'boolean', 'text']).toContain(r.script.params![key].type);
      }
    }
  });

  test('no example imports anything, because compileUserScript strips imports by regex', () => {
    for (const e of EXAMPLES) expect(e.source, e.id).not.toMatch(/^\s*import\s/m);
  });

  test('no example carries a type annotation, because there is no transpile step', () => {
    for (const e of EXAMPLES) expect(e.source, e.id).not.toMatch(/\(\s*\w+\s*:\s*\w+/);
  });

  test('no example copies the scene-filter idiom S5 names as non-compliant', () => {
    for (const e of EXAMPLES) expect(e.source, e.id).not.toMatch(/nearbyNpcs[\s\S]{0,80}\.sort\(/);
  });

  test('every example id satisfies the id rule defineScript enforces', () => {
    for (const e of EXAMPLES) expect(e.id).toMatch(/^[a-z][a-z0-9-]{1,40}$/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run from `web/`: `npx vitest run src/tasks/docs/examples.test.ts`
Expected: FAIL, `EXAMPLES` has length 0 (Task 10 created the empty array).

- [ ] **Step 3: Write `hello-status.js` first, whole, so the shape is fixed**

```js
// hello-status
// The smallest script that runs: one task, a status line, and a stop condition.
// Explained in 00-quickstart.md#your-first-script

// A plain module-scope variable. A script is a module, so this is the ordinary way to keep a
// value between task runs; c.memory is for the case where you want it typed and inspectable,
// and loop-with-params shows that.
let startedAt = Date.now();

export default defineScript({
  id: 'hello-status',
  name: 'Hello, status',
  version: 1,
  description: 'Writes a status line every few ticks and stops after a minute.',
  tags: ['example'],
  estimateMinutes: 1,

  // The run ends when this returns true. It is checked before every task, so it is the
  // cheapest way to stop a script that has nothing else to decide on.
  //
  // A closure variable, not c.memory: the quickstart is the smallest thing that runs, and
  // c.memory is what loop-with-params is for. It is also load bearing for gate 3, which is
  // proven in Task 16 by removing the ONE c.memory usage in the corpus and watching
  // `unexampled: memory`. Two homes would make that demonstration prove nothing.
  until() {
    return Date.now() - startedAt > 60_000;
  },

  async onStart(c) {
    startedAt = Date.now();
    c.log('hello from a script', 'info');
  },

  tasks: [
    {
      // The first task whose `when` returns true wins. One task with `when: () => true` is
      // how a free-form script is written.
      name: 'say-hello',
      when: () => true,
      async run(c) {
        const p = c.state().player;
        c.status(`standing at ${p?.worldX ?? '?'}, ${p?.worldZ ?? '?'}`);
        // c.wait.ticks is the only delay a script may use. A fixed setTimeout sleep drifts
        // against the server tick; this counts ticks. It returns false if the run was stopped.
        await c.wait.ticks(5);
      }
    }
  ]
});
```

- [ ] **Step 4: Write the remaining eight, and the index**

`web/src/tasks/docs/examples.ts` carries nine `?raw` imports and the declared shape:

```ts
import helloStatus from './examples/hello-status.js?raw';
...
export const EXAMPLES: readonly ApiExample[] = [
  { id: 'hello-status', title: 'Hello, status', teaches: 'One task, a status line and a stop condition',
    docsAnchor: '00-quickstart.md#your-first-script', source: helloStatus },
  ...
];
```

**And `apiDocs.ts`'s `EXAMPLE_RECORDS` gains the same nine `{ id, title, teaches, docsAnchor }` rows**, minus `source`, which it reads from `docs/examples/<id>.js` (R35). Two lists again, so assert the agreement the way Task 13 step 5 does for the pages: one test in `examples.test.ts` reads `scripts/gen/apiDocs.ts` off disk and expects every `EXAMPLES` id to appear in it. Without that, an example added to the bundle and not to the generator is simply absent from `API.md` and no gate says a word.

- [ ] **Step 5: Add the eslint override**

`web/eslint.config.js` gains a block before the `ignores` block. **The docs spec describes this backwards**: it says the override treats the examples "as scripts rather than modules", but they are `export default defineScript({...})`, which is module syntax and a **parse error** under `sourceType: 'script'`. What they actually need is `sourceType: 'module'` plus `defineScript` declared a global, because `no-undef` from `js.configs.recommended` is live for plain `.js` and the config narrows only by `ignores`:

```js
  {
    // The nine worked examples are user scripts, not modules this bundle compiles: the shell
    // imports their text with ?raw and compileUserScript runs it through new Function with
    // `defineScript` injected. They are module syntax (export default), so sourceType stays
    // 'module'; `defineScript` is the one injected identifier and is declared here so no-undef
    // does not fail nine files the day they land.
    files: ['src/tasks/docs/examples/*.js'],
    languageOptions: { sourceType: 'module', globals: { defineScript: 'readonly' } }
  },
```

- [ ] **Step 6: Regenerate and run the gate**

Run from the repository root: `bun scripts/gen/apiDocs.ts` (the examples now land in `API.md` and in `usedBy`).
Run from `web/`: `npx vitest run src/tasks/docs/ && npm run lint`
Expected: PASS, and lint clean on the nine `.js` files.

- [ ] **Step 7: Prove gate 4 bites, and be honest about what neither gate catches**

Three mutations, each proving a different thing, restored after each.

1. **Break the syntax**: delete a closing brace in `find-and-travel.js`, run `npx vitest run src/tasks/docs/examples.test.ts`.
   Expected: gate 4 fails with the compile message and the example id. This is the one gate 4 is for.
2. **Rename a whole top-level access**: change every `c.find.` in `find-and-travel.js` to `c.finder.`, regenerate, rerun.
   Expected: gate 4 still passes (a missing member is a runtime `TypeError`, not a compile error) and **gate 3 fails with `unexampled: find`**, because `c.find` drops out of `usedBy` entirely. Check first that no other example reaches `c.find`; `bank-round-trip` uses `c.travel` and would keep that one green on its own.
3. **Rename a LEAF**: change `c.find.nearest` to `c.find.nearestThing` and leave the rest.
   Expected: **both gates pass.** Gate 3 asserts per top-level member, not per leaf (its own note says so), and traversal rule 8's ancestor rule keeps `c.find` in `usedBy`. This is a real hole and it is entry 6's language service that closes it.

**Record all three in the ledger, including the third.** Gate 4 catches a script that no longer parses, gate 3 catches a top-level member that stopped being demonstrated, and **neither catches a renamed leaf**. An earlier draft of this step claimed mutation 3 turned gate 3 red; it does not, and a demonstration written down as proof of something that did not happen is worse than no demonstration.

- [ ] **Step 8: Verify and commit**

Run from `web/`: `npm run typecheck && npm run lint && npx vitest run`
Run from the repository root: `powershell -File scripts/line-ceiling.ps1`
Expected: green. The nine `.js` files **are** scanned (`.js` is in `$includeExt` and `web/` is an include prefix); at 20 to 70 lines each they pass.

```bash
git add web/src/tasks/docs/examples/ web/src/tasks/docs/examples.ts web/src/tasks/docs/examples.test.ts \
        web/src/tasks/docs/index.ts web/eslint.config.js web/src/agent/API.md web/src/agent/api-index.json
git -c core.safecrlf=false commit -m "docs(script-api): nine worked examples, each compiled by a test

Every example is a real file that compiles through compileUserScript as written, and between
them they reach all seventeen top-level context members. The eslint override declares
defineScript a global and keeps sourceType module: the spec described it the other way round,
and 'script' is a parse error on `export default`.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 15: The two routes, and the image that has to contain the file

**Files:**
- Create: `server/src/agentDocs.ts`, `server/src/agentDocs.test.ts`, `web/e2e/api-docs.pw.test.ts`
- Modify: `server/src/router.ts` (route kind, two `classify` lines, one `principalRule` case), `server/src/index.ts` (one case in the **first** switch), `server/src/types.ts` (`Env.agentDocs`), `server/src/env.ts`, `server/.env.example`, `deploy/lightsail/provision.ps1:115`, `deploy/docker/server.Dockerfile`
- Test: `server/src/router.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // server/src/agentDocs.ts
  export interface AgentDocs { text: string; contentType: string }
  /** The one read. Entry 16's get_api_docs() and idlescape://api call THIS (R20). */
  export async function readAgentDocs(env: AgentDocsEnv, format: 'md' | 'json'): Promise<AgentDocs | null>;
  /** The whole HTTP answer: 405, 503-with-a-message, or 200. index.ts's case is one line. */
  export async function agentDocsResponse(env: AgentDocsEnv, format: 'md' | 'json', req: Request): Promise<Response>;
  /** The narrow parameter both functions actually read, so no test needs a cast. */
  export type AgentDocsEnv = Pick<Env, 'agentDocs'>;
  // server/src/router.ts
  | { kind: 'agentDocs'; format: 'md' | 'json' }
  ```
  Entry 16's `get_api_docs()` is `readAgentDocs(env, 'md')` and `idlescape://api` is the same call (R20). **Entry 5 adds no `/mcp` route, no bearer check and no mode gate.**

**Why the response construction is a function and not four lines inside `index.ts`'s switch.** Docs spec section 9 requires a handler test that a missing file yields **503 with a message naming the generator**, rather than a bare 404, so the failure explains itself; R23 adds the **405**. Left inline, both live in the request handler, which `router.test.ts` does not exercise (it tests `classify` and `principalRule`) and which the Playwright spec only ever GETs, so neither would be asserted anywhere. That matters more here than usual: **R19's whole argument is that the missing-file path is the production failure mode**, so the one behaviour that fires when the Dockerfile `COPY` is forgotten would be the one behaviour with no test. `server/src/wiki/routes.test.ts` and `server/src/bank/routes.test.ts` are the in-tree precedent for testing a handler rather than only its seam.

**The gate seam, which is the one that is easy to get wrong.** `principalRule` returning `'none'` is **not** enough: `index.ts:76` runs `gate.isOpen(req)` for every route that falls through to `default: break` at `:74`, and `GATE_ENABLED=true` is the default and what `verify.ps1` step 10 runs. Docs spec ruling 18 says these are "readable by anyone who can reach the box", and SP4c's `get_api_docs()` carries a bearer token and no browser cookie, so the route must answer inside the **first** switch, like `health` at `:52` and `wiki` at `:69-73`.

- [ ] **Step 1: Write the failing tests**

`server/src/router.test.ts`, following the wiki case at `:52-57`:

```ts
describe('agent docs routes', () => {
  test('both exact paths classify, and nothing near them does', () => {
    expect(classify('/api/agent/docs', false)).toEqual({ kind: 'agentDocs', format: 'md' });
    expect(classify('/api/agent/docs.json', false)).toEqual({ kind: 'agentDocs', format: 'json' });
    expect(classify('/api/agent/docsx', false)).toEqual({ kind: 'notfound' });
    expect(classify('/api/agent/docs/x', false)).toEqual({ kind: 'notfound' });
    expect(classify('/api/agent/docs/../../etc/passwd', false)).toEqual({ kind: 'notfound' });
  });

  test('the principal is none, like the wiki routes', () => {
    expect(principalRule({ kind: 'agentDocs', format: 'md' })).toBe('none');
  });
});
```

`server/src/agentDocs.test.ts` (no emulators, fixture files only; `path.join(import.meta.dir, ...)` and **never** `new URL('.', import.meta.url).pathname`, which yields `/C:/...` on Windows and throws ENOENT):

```ts
import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { agentDocsResponse, readAgentDocs, type AgentDocsEnv } from './agentDocs';

// A typed factory, not a cast. `as never` defeats the type check exactly the way `as any` does,
// and tests have been typechecked since audit C16, so the Global Constraints' ban reaches it.
// AgentDocsEnv is Pick<Env, 'agentDocs'>, which is all either function reads.
function envWith(files: Record<string, string>): AgentDocsEnv {
  const dir = mkdtempSync(join(tmpdir(), 'agentdocs-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return { agentDocs: join(dir, 'API.md') };
}
const MISSING: AgentDocsEnv = { agentDocs: '/nope/API.md' };

describe('readAgentDocs', () => {
  test('serves the markdown with the right content type', async () => {
    const r = await readAgentDocs(envWith({ 'API.md': '# Script API\n' }), 'md');
    expect(r?.contentType).toBe('text/markdown; charset=utf-8');
    expect(r?.text).toContain('# Script API');
  });

  test('serves the index from the SIBLING path, so the two cannot be pointed apart', async () => {
    const r = await readAgentDocs(envWith({ 'API.md': 'x', 'api-index.json': '{"schemaVersion":1}' }), 'json');
    expect(r?.contentType).toBe('application/json');
    expect(JSON.parse(r!.text).schemaVersion).toBe(1);
  });

  test('a missing file is null, so the route can answer 503 naming the generator', async () => {
    expect(await readAgentDocs(MISSING, 'md')).toBeNull();
    expect(await readAgentDocs(envWith({ 'API.md': 'x' }), 'json')).toBeNull();
  });
});

describe('agentDocsResponse', () => {
  const get = new Request('http://x/api/agent/docs');

  test('200 with the content type and no-cache, which is what the wiki routes do', async () => {
    const r = await agentDocsResponse(envWith({ 'API.md': '# Script API\n' }), 'md', get);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(r.headers.get('cache-control')).toBe('no-cache');
    expect(await r.text()).toContain('# Script API');
  });

  test('405 to anything but GET (plan ruling R23)', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const r = await agentDocsResponse(envWith({ 'API.md': 'x' }), 'md', new Request('http://x/api/agent/docs', { method }));
      expect(r.status, method).toBe(405);
    }
  });

  test('503 with a message naming the generator, never a bare 404', async () => {
    // This is the production failure mode R19 exists for: forget the Dockerfile COPY and the
    // live site answers this forever with every gate green. The message has to say what to run.
    const r = await agentDocsResponse(MISSING, 'md', get);
    expect(r.status).toBe(503);
    const body = await r.text();
    expect(body).toContain('bun scripts/gen/apiDocs.ts');
    expect(body).toContain('not generated');
  });

  test('the json sibling answers 503 on its own when only the markdown is present', async () => {
    const r = await agentDocsResponse(envWith({ 'API.md': 'x' }), 'json', get);
    expect(r.status).toBe(503);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run from `server/`: `bun test src/router.test.ts src/agentDocs.test.ts`
Expected: FAIL on the unknown route kind and the unresolved import.

- [ ] **Step 3: Write `server/src/agentDocs.ts`**

```ts
// The one read of the generated script API reference. Both the HTTP routes below and sprint
// entry 16's get_api_docs() / idlescape://api call this, so the MCP gateway and the route
// cannot answer differently. Plan ruling R20.
//
// The index is the SIBLING of the markdown rather than a second env var, so the two artefacts
// cannot be pointed at different directories.
export async function readAgentDocs(env: AgentDocsEnv, format: 'md' | 'json'): Promise<AgentDocs | null> {
  const path = format === 'md' ? env.agentDocs : join(dirname(env.agentDocs), 'api-index.json');
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return { text: await file.text(), contentType: format === 'md' ? 'text/markdown; charset=utf-8' : 'application/json' };
}

// The whole HTTP answer, here rather than inline in index.ts's switch, so the 405 and the
// 503-with-a-message are testable without a running server. The 503 is not a 404 on purpose:
// a missing file means the generator has not run or the runtime image is missing the COPY
// (plan ruling R19), which is an operator problem, not a bad URL.
export async function agentDocsResponse(env: AgentDocsEnv, format: 'md' | 'json', req: Request): Promise<Response> {
  if (req.method !== 'GET') return new Response(null, { status: 405 });
  const doc = await readAgentDocs(env, format);
  if (!doc) {
    return new Response('script API reference not generated: run bun scripts/gen/apiDocs.ts', { status: 503 });
  }
  return new Response(doc.text, { headers: { 'content-type': doc.contentType, 'cache-control': 'no-cache' } });
}
```

- [ ] **Step 4: Wire the route, ahead of the gate**

`router.ts`: the union gains `{ kind: 'agentDocs'; format: 'md' | 'json' }`; `classify` gains two exact-path lines beside `/api/health` at `:37` (**exact matches only, no `safeSegments` and no prefix, so there is no traversal surface**); `principalRule` gains an explicit `case 'agentDocs': return 'none';` with a comment in the shape of the wiki comment at `:81-84`, even though `default:` already returns `'none'`, so ruling 18 is written where a reader looks.

`index.ts`, in the **first** switch beside `wiki`:

```ts
    case 'agentDocs':
      // Gate-exempt, like the wiki routes above and for the same reason: the reference is
      // documentation of a surface that already ships inside the client bundle, and entry 16's
      // MCP tool reads it with a bearer token and no browser gate cookie (ruling 18). The
      // response itself is built in agentDocs.ts so its 405 and 503 are testable under bun test.
      return await agentDocsResponse(env, route.format, req);
```
`no-cache` matches `wiki/api.ts:21` and `static.ts:31`.

- [ ] **Step 5: Add the env var in all four places**

`server/src/types.ts` gains `agentDocs: string;` after `wikiDb`; `server/src/env.ts` gains `agentDocs: str(source, 'AGENT_DOCS', '../web/src/agent/API.md')`; `server/.env.example` gains the key with a comment; `deploy/lightsail/provision.ps1:115`'s `# NOT-WRITTEN:` line gains `AGENT_DOCS` beside `WEB_DIST` and `WIKI_DB`, because the container's default is already right. **Miss either of the last two and `server/src/env.test.ts:69-109` turns red**, in a suite nobody touching a route expects to break.

- [ ] **Step 6: Add the `COPY` the image does not have (R19)**

`deploy/docker/server.Dockerfile`, runtime stage, beside the other `COPY` lines at `:121-136`:

```dockerfile
# The generated script API reference. Committed source, not build output: the runtime stage
# copies it explicitly because server/src/env.ts's AGENT_DOCS default (../web/src/agent/API.md)
# is relative to this WORKDIR (/app/server), and web/src is otherwise absent from this image.
# Without this line both /api/agent/docs routes answer 503 on the live site and no gate notices,
# because verify.ps1's local stack runs the server from the repository, where the path exists.
COPY web/src/agent/API.md web/src/agent/api-index.json /app/web/src/agent/
```

`.dockerignore` does not exclude `web/src`, so no compose override is needed.

- [ ] **Step 7: Write the Playwright proof (R18)**

`web/e2e/api-docs.pw.test.ts`, modelled on `wiki.pw.test.ts:22-24` but **without `openGate`**:

```ts
import { expect, request, test } from '@playwright/test';

// No openGate, deliberately: ruling 18 puts both routes at principal `none` AND ahead of the
// gate cookie check in server/src/index.ts's first switch, and a spec that signed in first
// would pass against a route sitting behind the gate. A fresh context carries no cs_gate cookie.
test('the script API reference is served ungated, as markdown and as the index', async () => {
  const api = await request.newContext({ baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8787' });

  const md = await api.get('/api/agent/docs');
  expect(md.status()).toBe(200);
  expect(md.headers()['content-type']).toContain('text/markdown');
  const text = await md.text();
  expect(text).toContain('c.wait.ticks');        // the generated half
  expect(text).toContain('hello-status');        // the appended examples
  expect(text).toContain('Your first script');   // a heading from 00-quickstart.md: the prose half

  const json = await api.get('/api/agent/docs.json');
  expect(json.status()).toBe(200);
  const index = await json.json() as { schemaVersion: number; members: { path: string }[]; examples: { id: string }[] };
  expect(index.schemaVersion).toBe(1);
  expect(index.members.map(m => m.path)).toContain('c.travel.to');
  expect(index.examples.map(e => e.id)).toContain('hello-status');

  // R23, end to end: agentDocs.test.ts asserts the 405 on the function, this asserts that the
  // case is actually reached, which is the half a unit test over a seam cannot see.
  expect((await api.post('/api/agent/docs')).status()).toBe(405);
});
```

`request.newContext` rather than the `page` fixture keeps it under a second and out of the sign-in helpers at `web/e2e/helpers.ts:32-40`.

- [ ] **Step 8: Run everything, including the stack**

Run from `server/`: `bun test src/router.test.ts src/agentDocs.test.ts src/env.test.ts`
Expected: PASS, including the two env-template tests.
Then start the emulators from PowerShell `Start-Process`, bring the stack up, and from `web/`: `npm run build:e2e && npx playwright test api-docs`
Expected: PASS.
Then curl the route with no gate cookie: `curl -i http://localhost:8787/api/agent/docs | head -5`
Expected: `200` and `text/markdown`. If it is a redirect or a gate page, the case is in the wrong switch.

**Say this in the commit and in the ledger:** the Playwright spec is green against `verify.ps1`'s local stack whether or not step 6's `COPY` line exists, because that stack runs the server from the repository. **The image half is proven by the first release after this entry lands, not by any gate**, and the release is the orchestrator's (D127).

- [ ] **Step 9: Commit**

```bash
git add server/src/agentDocs.ts server/src/agentDocs.test.ts server/src/router.ts server/src/router.test.ts \
        server/src/index.ts server/src/env.ts server/src/types.ts server/.env.example \
        deploy/lightsail/provision.ps1 deploy/docker/server.Dockerfile web/e2e/api-docs.pw.test.ts
git -c core.safecrlf=false commit -m "feat(server): serve the script API reference at /api/agent/docs

Two exact-path routes over one readAgentDocs seam, answered inside the first switch so they
sit ahead of the gate cookie check, which principal 'none' alone does not achieve. The runtime
image gains a COPY of both artefacts: it contains no web/src, so the route would have answered
503 on the live site with every gate green.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---
## Task 16: Gates 2, 3 and 6, the api-shape gate, and all six proven able to fail

Gates 1, 4 and 5 landed with their content (Tasks 12, 14 and 13). This task lands the three that read the index, adds P20's api-shape gate over the same `ts.Program`, deletes the provisional doc-comment test (R25), and **watches every one of the six fail**.

**Files:**
- Create: `web/src/tasks/docs/apiIndex.test.ts` (gates 2 and 3)
- Create: `web/src/tasks/scriptApi.test.ts` (gate 6 plus the api-shape gate)
- Delete: `web/src/tasks/docComments.test.ts` (R25)

**Interfaces:** consumes `SCRIPT_CONTEXT_KEYS` (Task 8); `buildApiIndex`, `countRequiredPositionals`, `surfaceNames` and `numericNames` (Task 10, all four exported from `web/src/tasks/gen/apiIndex.ts`); the five exemption lists `KEBAB_UNIONS`, `POSITIONAL_GRANDFATHERED`, `COUNT_EXEMPT`, `ABBREVIATIONS` and `SIGNAL_EXEMPT` (Task 2); and the committed `api-index.json`.

- [ ] **Step 1: Write gates 2 and 3**

`web/src/tasks/docs/apiIndex.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import index from '../../agent/api-index.json';
import { SCRIPT_CONTEXT_KEYS } from '../scriptApiKeys';

const members = index.members as { path: string; kind: string; doc: string; vendored: boolean }[];

describe('gate 2: every member we own is documented', () => {
  test('the index is the real one, so an empty scan cannot pass', () => {
    expect(index.schemaVersion).toBe(1);
    expect(members.length).toBeGreaterThan(100);
  });

  test('every non-vendored member has a non-empty doc comment', () => {
    const bare = members.filter(m => !m.vendored && m.doc.trim() === '').map(m => m.path);
    expect(bare, `undocumented: ${bare.join(', ')}`).toEqual([]);
  });

  test('vendored coverage is reported and does not fail the build', () => {
    const vendored = members.filter(m => m.vendored);
    const covered = vendored.filter(m => m.doc.trim() !== '').length;
    // We cannot add prose inside web/src/vendor/rs-sdk/ without a PATCHES.md note, and a gate
    // demanding one would make every re-vendor a documentation task (docs spec ruling 6).
    console.log(`vendored doc coverage: ${covered} of ${vendored.length}`);
    expect(vendored.length).toBeGreaterThan(100);
  });
});

describe('gate 3: every top-level context member is exampled', () => {
  test('each of the declared members appears in usedBy with at least one example', () => {
    const usedBy = index.usedBy as Record<string, string[]>;
    const missing = Object.keys(SCRIPT_CONTEXT_KEYS).filter(k => (usedBy[`c.${k}`] ?? []).length === 0);
    expect(missing, `unexampled: ${missing.join(', ')}`).toEqual([]);
  });

  test('and the gate counts the declared set, not a hand-typed list', () => {
    expect(Object.keys(SCRIPT_CONTEXT_KEYS)).toHaveLength(17);
  });
});
```

Note what gate 3 asserts and what it does not: **per top-level member, not per leaf, and not `c.sdk`'s 110 methods**, because a gate demanding that would be gamed within a week (docs spec ruling 7). A leaf such as `c.wait.message` can go unexampled; the reference lists it with its doc comment either way.

- [ ] **Step 2: Write gate 6 and the api-shape gate**

`web/src/tasks/scriptApi.test.ts`. Gate 6's runtime half compares the declared record against the index; P20's half asserts the shape rules over the same program the generator builds.

```ts
import { describe, expect, test } from 'vitest';
import committed from '../agent/api-index.json';
import { SCRIPT_CONTEXT_KEYS } from './scriptApiKeys';
import { buildApiIndex, countRequiredPositionals, numericNames, surfaceNames } from './gen/apiIndex';
import { ABBREVIATIONS, COUNT_EXEMPT, KEBAB_UNIONS, POSITIONAL_GRANDFATHERED, SIGNAL_EXEMPT } from './standard';

// entry and tsconfig are web/-relative and apiIndex.ts resolves them against WEB_ROOT, never
// against process.cwd(); vitest's cwd is web/ and the generator's is the repository root, and
// both must build the same index.
const live = buildApiIndex({
  entry: 'src/tasks/scriptApi.ts', tsconfig: 'tsconfig.json', root: 'ScriptContext',
  sources: ['web/src/tasks/scriptApi.ts'], examples: [], forbidden: []
});

describe('gate 6: the surface is a decided set', () => {
  test('the declared record and the generated index name the same top-level members', () => {
    const fromIndex = live.members.filter(m => /^c\.[a-z]+$/.test(m.path)).map(m => m.path.slice(2)).sort();
    expect(fromIndex).toEqual(Object.keys(SCRIPT_CONTEXT_KEYS).sort());
  });

  test('the committed index is current with the surface, which is gate 1 said once more in vitest', () => {
    expect(committed.members.map((m: { path: string }) => m.path).sort())
      .toEqual(live.members.map(m => m.path).sort());
  });
});

describe('P20: the api-shape gate', () => {
  const ours = live.members.filter(m => !m.vendored);

  test('S4: no boolean in a positional slot', () => {
    const bad = ours.filter(m => /\(\s*[^)]*:\s*boolean\s*[,)]/.test(m.signature) && !m.signature.includes('opts'));
    expect(bad.map(m => m.path)).toEqual([]);
  });

  test('S4: at most one required positional before an options object, outside the grandfathered six', () => {
    const bad = ours.filter(m => countRequiredPositionals(m.signature) > 1 && !POSITIONAL_GRANDFATHERED.includes(m.path.slice(2)));
    expect(bad.map(m => m.path), 'add an overload or a row to POSITIONAL_GRANDFATHERED with a reason').toEqual([]);
  });

  test('S4: every options parameter is a named exported interface, never an inline literal', () => {
    const known = new Set(live.types.map(t => t.name));
    const bad = ours.filter(m => /opts\??:\s*\{/.test(m.signature));
    expect(bad.map(m => m.path)).toEqual([]);
    for (const m of ours) {
      const named = m.signature.match(/opts\??:\s*([A-Z]\w+)/)?.[1];
      if (named) expect(known.has(named), `${m.path} takes ${named}, which scriptApi.ts does not export`).toBe(true);
    }
  });

  test('S9: no member we own returns undefined deliberately', () => {
    expect(ours.filter(m => /=>\s*[^)]*\bundefined\b/.test(m.signature)).map(m => m.path)).toEqual([]);
  });

  test('S8: every numeric name carries a unit suffix, is a count, or is on the exemption list', () => {
    const exempt = new Set(COUNT_EXEMPT.map(c => c.name));
    // OURS, not `live`: numericNames takes the members to scan, and handing it the whole index
    // sweeps the ~160 vendored c.bot and c.sdk rows, where `qty`, `level`, `min`, `max`, `step`
    // and `distance` are all equally uncovered and none of them is ours to rename.
    const bad = numericNames(ours, live.types).filter(n =>
      !/Ms$|Percent$|Fraction$|Points$|Ticks$/.test(n) && !/^(max[A-Z]|n$|legs$|tiles$)/.test(n) && !exempt.has(n));
    expect(bad, 'give it a unit suffix, or add it to COUNT_EXEMPT with the unit it counts').toEqual([]);
  });

  test('S8: every positional coordinate parameter is a TileLike, so P4 cannot decay', () => {
    // The one assertion that keeps "one world-coordinate shape" true after this entry ships it.
    // Without it the next member to take (x, z) again reintroduces the second shape silently,
    // and this is the entry that created Tile and TileLike.
    const bad = ours.filter(m => /\(\s*x\s*:\s*number\s*,\s*z\s*:\s*number/.test(m.signature)
      && !POSITIONAL_GRANDFATHERED.includes(m.path.slice(2)));
    expect(bad.map(m => m.path), 'take a TileLike, not (x, z); c.anchor keeps its arm because it is deprecated').toEqual([]);
  });

  test('S1: no get or fetch prefix on an accessor, and a new closed union is snake_case', () => {
    expect(ours.filter(m => /\.(get|fetch)[A-Z]/.test(m.path)).map(m => m.path)).toEqual([]);
    const kebab = Object.entries(live.enums)
      .filter(([name, values]) => !KEBAB_UNIONS.includes(name) && values.some(v => v.includes('-')))
      .map(([name]) => name);
    expect(kebab, 'a new closed union is snake_case; the four grandfathered ones are in KEBAB_UNIONS').toEqual([]);
  });

  test('S1: no member or options field is one of the abbreviations we agreed not to use', () => {
    const abbrev = new Set(ABBREVIATIONS);
    const leaves = ours.map(m => m.path.split('.').at(-1)!).filter(n => abbrev.has(n));
    const fields = surfaceNames(ours, live.types).filter(n => abbrev.has(n));
    expect([...leaves, ...fields], 'spell it out; ABBREVIATIONS in standard.ts is the list').toEqual([]);
  });

  test('S2: every options bag this entry introduced carries signal?: AbortSignal', () => {
    // S2's enforcement row in the survey's own map is "api-shape gate for the signal field",
    // and without this assertion that row is enforced by nothing. It catches ScreenshotOpts
    // immediately, which is why SIGNAL_EXEMPT exists and says why.
    const bags = live.types.filter(t => /Opts$/.test(t.name) && !SIGNAL_EXEMPT.includes(t.name));
    const missing = bags.filter(t => !(t.fields ?? []).some(f => f.name === 'signal')).map(t => t.name);
    expect(missing, 'add signal?: AbortSignal, or a SIGNAL_EXEMPT row with the reason').toEqual([]);
  });

  test('R27: no rendered type name is one the index does not define', () => {
    const known = new Set(live.types.map(t => t.name));
    const BUILTIN = /^(Promise|Array|Record|Map|Set|Partial|Pick|Omit|Readonly|NonNullable|Blob|AbortSignal|RegExp|Date|Error|Object|Function|String|Number|Boolean)$/;
    const named = live.types.flatMap(t => [
      ...(t.variants ?? []).flatMap(v => v.match(/\b[A-Z]\w+/g) ?? []),
      ...(t.fields ?? []).flatMap(f => f.type.match(/\b[A-Z]\w+/g) ?? [])
    ]);
    const dangling = [...new Set(named)].filter(n => !known.has(n) && !BUILTIN.test(n));
    expect(dangling, 'add it to scriptApi.ts\'s export list, or the hover card renders a name with nothing behind it').toEqual([]);
  });
});
```

**The three helpers the gate leans on, defined rather than assumed.** Both live in `apiIndex.ts` beside the traversal, because they read the index's own shapes and entry 6's validator will want them:

```ts
/** How many parameters of a rendered signature are required and precede any options bag. */
export function countRequiredPositionals(signature: string): number;

/**
 * Every name the given members and their options bags introduce: method parameter names read
 * out of `members[].signature`, plus the field names of every ApiType those members take. S1's
 * abbreviation clause reads this. The MEMBERS are a parameter and not the whole index on
 * purpose: called on `live` it sweeps the ~160 vendored rows, which are not ours to rename.
 */
export function surfaceNames(members: ApiMember[], types: ApiType[]): string[];

/**
 * The subset of surfaceNames whose declared type is `number`. S8's clause reads this, and R4's
 * census is exactly its output on the surface this entry leaves, which is why R4 lists twenty
 * names and not the fourteen a first count by eye found.
 */
export function numericNames(members: ApiMember[], types: ApiType[]): string[];
```

**Read R4 against that definition before Task 2 writes `COUNT_EXEMPT`.** The census it pins is over exactly these two sources, filtered to `vendored: false`, which is what makes `attempts`, `id`, `opIndex`, `x`, `z` and `level` show up alongside the original fourteen. An earlier draft of R4 promised a doc-comment escape hatch as well; the gate does not implement one and R4 no longer offers one.

- [ ] **Step 3: Delete the provisional doc-comment test**

`git rm web/src/tasks/docComments.test.ts`. R25: gate 2 asks the real question over the emitted index, and two tests over one fact are two sources. Say so in the commit message so a reviewer does not read the deletion as a lost gate.

- [ ] **Step 4: Run the three files**

Run from `web/`: `npx vitest run src/tasks/docs/apiIndex.test.ts src/tasks/scriptApi.test.ts`
Expected: PASS, with the vendored coverage figure printed. **If the S8 or S4 assertion is red here, do not widen the regex**: add the name to `COUNT_EXEMPT` or `POSITIONAL_GRANDFATHERED` in `standard.ts` with its reason, which is what those lists are for, or give the member the compliant shape.

- [ ] **Step 5: Watch each of the six fail, one at a time**

This is the step the entry exists for, and it is not optional. Restore the tree with `git checkout -- <path>` after each.

1. **Gate 1.** Change one word in the committed `web/src/agent/API.md`. Run `powershell -File scripts/build.ps1`.
   Expected: throws, naming `bun scripts/gen/apiDocs.ts`.
2. **Gate 2.** Delete the doc comment from one non-vendored member in `scriptContext.ts`, run `bun scripts/gen/apiDocs.ts`, then `npx vitest run src/tasks/docs/apiIndex.test.ts` from `web/`.
   Expected: FAIL, naming the member path.
3. **Gate 3.** Remove the `c.memory` usage from `loop-with-params.js`, regenerate, rerun.
   Expected: FAIL, `unexampled: memory`. `c.memory` and `c.signal` are the two this gate is actually load bearing for.
4. **Gate 4.** Delete a closing brace in `find-and-travel.js`, run `npx vitest run src/tasks/docs/examples.test.ts`.
   Expected: FAIL with the compile message and the example id.
5. **Gate 5.** Put a markdown table in `02-waiting.md`, run `npx vitest run src/tasks/docs/pages.test.ts`.
   Expected: FAIL, naming the unsupported node.
6. **Gate 6.** Add a member to `ScriptContext` without adding it to `scriptApiKeys.ts`, run `npm run typecheck` from `web/`.
   Expected: FAIL on the `Record<keyof ScriptContext, true>`. Then add it to the record too and run `npx vitest run src/tasks/scriptApi.test.ts`.
   Expected: FAIL on the **committed-versus-live** comparison, because the committed index is now stale. **Not on the member-set comparison**, which stays green: both sides of it now contain the new member, and saying otherwise in the ledger would be recording a failure that did not happen. Regenerate and it goes green, which is the point: gate 6 asks "is the declared set the generated set", and "is the committed artefact current" is gate 1 said once more in vitest. Remove the member.
   **What no gate in this entry asks** is whether a type is missing from `scriptApi.ts`'s *type* export list. The `R27` assertion in the same file is the closest thing: it catches the case that matters, a name rendered in the reference with nothing behind it. Say so in the ledger rather than implying the export list is gated.

**Record all six in the ledger with the exact message each printed.** A gate whose failure message does not say what to run is a gate that costs a session an hour.

- [ ] **Step 6: Assert the generator is not in the shipped bundle**

`web/src/tasks/gen/apiIndex.ts` imports `typescript`. Nothing shipped imports it, so Vite does not bundle it, but **assert that rather than assume it**:

Run from `web/`: `npm run build:e2e`. That script is `tsc --noEmit && vite build --mode e2e --outDir dist-e2e` (`web/package.json:8`), so the output is `web/dist-e2e/`, **not** the `web/dist/` the Dockerfile copies; read the directory out of `package.json` rather than trusting either name.

Then, in one command so an empty directory cannot pass for a clean grep:

```bash
ls web/dist-e2e/assets/*.js >/dev/null && ! grep -rl "createProgram" web/dist-e2e/assets
```

Expected: the `ls` succeeds and the `grep` finds nothing. If the grep matches, a shipped module imported the traversal and the entry just added a megabyte to the bundle. If the `ls` fails, the build wrote somewhere else and the assertion was proving nothing.

- [ ] **Step 7: Verify and commit**

Run from `web/`: `npm run typecheck && npm run lint && npx vitest run`

```bash
git add web/src/tasks/docs/apiIndex.test.ts web/src/tasks/scriptApi.test.ts
git rm web/src/tasks/docComments.test.ts
git -c core.safecrlf=false commit -m "test(script-api): gates 2, 3 and 6, plus the api-shape gate over the standard

All six gates watched failing, each with the message it printed recorded in the ledger. The
provisional doc-comment check goes with this commit: gate 2 asks the same question over the
emitted index, and two tests over one fact are two sources.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 17: Close the entry

The whole gate end to end, then the documents that describe what shipped. **No release**: D127 makes that the orchestrator's.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-07-script-api-docs-design.md` (a "what actually shipped" section)
- Modify: `docs/superpowers/specs/2026-09-06-sp4b-bot-expansion-design.md:472` (R28)
- Modify: `docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md` (row 5)
- Modify: `docs/README.md` (one authority row), `CLAUDE.md` (one pointer line)
- Modify: `.claude/skills/idlescape-library-script/SKILL.md`, `.claude/skills/idlescape-verify/SKILL.md` (`idlescape-plugin/SKILL.md` is conditional; see step 6)
- Create: `docs/superpowers/ledgers/2026-09-09-script-api-reference.md`

- [ ] **Step 1: Run the whole gate**

From PowerShell, **detached**, because run through the Bash tool it dies mid-gate:

```powershell
Start-Process powershell -ArgumentList '-NoProfile','-File','scripts\verify.ps1' -RedirectStandardOutput verify.log -RedirectStandardError verify.err -NoNewWindow -Wait
```
Expected: ten steps green. Read `verify.log` to the end; the tell for the Bash-tool failure mode is a log that stops mid-step with no error line under it.

- [ ] **Step 2: Run the Playwright proof against a real stack**

Emulators from PowerShell `Start-Process`, stack up, then from `web/`: `npm run build:e2e && npx playwright test`
Expected: the existing specs plus `api-docs.pw.test.ts` green. **Do not stage `docs/screenshots/e2e-*.png`**: a green gate regenerates them and they differ by world randomness, and this entry moved no UI.

- [ ] **Step 3: Write the spec's "what actually shipped" section**

Append a section 16 to `docs/superpowers/specs/2026-09-07-script-api-docs-design.md`, in the shape `2026-09-05-sp8b-web-bank-design.md` section 12 uses. It must name, at minimum, every place this plan departed from the spec, because the spec is otherwise the authority a later session reads:

- **Ruling 10 is overturned:** both artefacts go through `writeOrCheckText`, not `writeOrCheck`, and `api-index.json` is pretty-printed (R11). The line citation `io.ts:53-65` belonged to neither helper.
- **Section 3.2's "run it from `web/`" is overturned:** the traversal lives in `web/src/tasks/gen/apiIndex.ts` and the generator runs from the repository root beside the other three (R10), with the measurement.
- **Ruling 13 and gate 6's placement argument are overturned:** there is no `scriptApi.harness.ts`; the shipped leaf `scriptApiKeys.ts` is the record, and the premise that test files are typechecked by nothing was closed by audit C16 (R14).
- **Section 9's "No Playwright" is overturned** by one API-only spec (R18).
- **Section 2's doc-coverage fact was wrong:** six of 34 `ScriptContext` declaration sites carried a doc comment, not "declared with doc comments", so S11 was the largest writing task in the entry.
- **`ApiIndex` gained `schemaVersion`** (R13), and **`ApiExample` is declared** for the first time.
- **`scriptApi.ts`'s export list is the spec's 31 corrected in three spellings, plus `TargetEvent`, `RecoveryOutcome`, `Tile` and `TasksErrorCode`, plus every named options bag this entry adds** (R27). Give the real count from the shipped file, not a figure from this plan: it moved twice while the plan was written. `BotSdk` is `BotSDK`.
- **The generator reads the pages and examples off disk rather than importing the `?raw` barrel modules** (R35), because `scripts/gen/tsconfig.json` has no `vite/client` and tsc follows imports past a project's `include`.
- **`vendored` is decided by the declaring file, not the `c.bot` prefix** (R32), and `c.bot` is `ScriptBot extends BotActions` so our own member is documented and gated like the rest of ours.
- **The runtime image needed a `COPY`** (R19): ruling 8's justification was true of the box's checkout and not of the container.
- **The standard gained four exemption lists** (R2, R3, R4) without which the api-shape gate could not be green on the surface as it shipped, and **`hpBelowPoints` shipped here** rather than waiting for entry 7's P12 (R5).
- **What is still open and whose it is**, one line each, with the owner named:
  - `forbidden` ships empty until entry 6 creates `web/src/tasks/forbidden.ts`. **The seam is in place**: `06-limits-and-trust.md` carries a `<!-- forbidden -->` marker and `render.ts` substitutes it, with both arms tested, so entry 6 fills it rather than inventing one.
  - The twelfth `TasksErrorCode`, `forbidden_api`, arrives with entry 6; the page has eleven rows and says so.
  - `'not_found'` versus `'target_not_found'` is entry 7's P10 (R9, D133).
  - **`ScriptManifest.apiVersion`, the `API_VERSION` constant and the shim table are entry 7's, through P18** (R33). This entry ships the first two deprecations there have ever been, both saying "Removed in api 3", **and no constant, manifest field or runtime counts api versions**: the number lives only in the generator's `SINCE` map and in those two strings. Entry 7 must honour both windows and owns all three names. D133 records the window and not the missing mechanism; this line is the other half.
  - `anchor(x, z)` and `hardStop.hpBelow` are the two deprecations that window covers.
  - **S5's predicate arm on a selector is not shipped** (R34): `dialog.choose` and `bot.interactGroundItem` take `string | RegExp` only, and the fluent-query work that decides the shape once is entry 7's P10 and P3. `04-find-travel-and-anchor.md` says so to a reader.
  - The `.d.ts` tree is entry 6's phase 2.
  - **Nothing gates `scriptApi.ts`'s type export list.** The `R27` assertion in `scriptApi.test.ts` catches the consequence that matters, a rendered name the index does not define, and not the omission itself.
  - **Gate 3 does not catch a renamed leaf**, only a top-level member that stopped being demonstrated. Task 14 step 7's third mutation shows it. Entry 6's language service is what closes it.

- [ ] **Step 4: Correct the SP4b spec's `DeathBehaviour` sentence (R28)**

`docs/superpowers/specs/2026-09-06-sp4b-bot-expansion-design.md:472` still prints `onDeath?: 'resume' | 'return-and-resume' | 'fail'`. `web/src/tasks/types.ts:134-135` has seven values. One line, plus a parenthetical naming this entry as where the correction was made, because SP4b plan task 15's reconciliation list did not include it and that plan is closed.

- [ ] **Step 5: Mark the sprint row and add the two documentation rows**

`docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md` row 5's status cell, in the shape rows 1 to 4 use: `done <date>: 17 tasks clean, whole-branch review and fix wave done, verify.ps1 green at <sha>, ledger promoted to docs/superpowers/ledgers/2026-09-09-script-api-reference.md`.

`docs/README.md` section 1 gains a row, which the index has never had for the script API:

| Subject | Authority | Also | Verify with |
|---|---|---|---|
| The script API: what a script may call, and the standard it follows | `web/src/agent/API.md` (generated) over spec `2026-09-07-script-api-docs-design.md` | the standard is `2026-09-07-script-api-survey-and-standard-design.md` section 4; `web/src/agent/api-index.json` is the structured form entry 6 and SP4c read | `bun scripts/gen/apiDocs.ts --check`, gated in verify step 9 |

`CLAUDE.md`'s "Read this first" section gains one line (docs spec ruling 4): the generated script API reference is `web/src/agent/API.md`, it is regenerated by `bun scripts/gen/apiDocs.ts` and never hand edited.

- [ ] **Step 6: Update the three skills that changed under this entry**

- `.claude/skills/idlescape-library-script/SKILL.md`: a bundled script now uses `c.dialog` rather than raw `sendClickDialog`, `hardStop.hpBelowPoints` rather than `hpBelow`, and `c.retry` rather than a hand-written loop; and every new member needs a doc comment or gate 2 fails.
- `.claude/skills/idlescape-plugin/SKILL.md`: **conditional, and not in this task's Files list or step 8's `git add` for that reason.** Edit it only if a panel ends up reading the index; R21 says none does, so the expected outcome is a line in the ledger rather than a diff.
- `.claude/skills/idlescape-verify/SKILL.md`: the step 6 and step 9 clauses, matching `docs/VERIFICATION.md`. **The three "ten steps" mentions at `:19`, `:48` and `:111` do not change**, and a diff that touches them is wrong.

- [ ] **Step 7: Promote the ledger**

`docs/superpowers/ledgers/2026-09-09-script-api-reference.md`, under 400 lines, per `docs/superpowers/SDD.md`. It carries: the rulings this plan made and any the executor had to make; the six gate-failure messages from Task 16 step 5; the fix rounds; the deferred minors with an owner each; and a traps section naming at least the Bun auto-install hazard, the CRLF helper choice, the gate-ordering seam in `index.ts`, and the fact that the Dockerfile `COPY` is proven only by a release.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/specs/2026-09-07-script-api-docs-design.md \
        docs/superpowers/specs/2026-09-06-sp4b-bot-expansion-design.md \
        docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md \
        docs/README.md CLAUDE.md \
        .claude/skills/idlescape-library-script/SKILL.md .claude/skills/idlescape-verify/SKILL.md \
        docs/superpowers/ledgers/2026-09-09-script-api-reference.md
git -c core.safecrlf=false commit -m "docs(script-api): close entry 5, reconcile the spec, promote the ledger

The spec's new section 16 records the ten places this entry departed from it, including four
overturned rulings and one fact that was wrong. The sprint row, the documentation index and
the two skills that changed follow.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Executor notes

### Dependency order, and whether anything runs in parallel

**Nothing runs in parallel. One tree, sequential tasks, per decision D5**: worktrees have twice cost a dependency wipe through the `node_modules` junction hazard, and the Workflow tool's worktree isolation fails on this repository's path-case mismatch. Every task after Task 1 edits a file an earlier one created or moved.

The hard edges, which are the ones a reordering would break:

1. **Task 1 before everything.** Tasks 3 to 9 all declare members in `scriptContext.ts`, which Task 1 creates.
2. **Task 4 before Task 6.** `createDialog` composes over `createWait`'s `until` and `dialog`.
3. **Task 6 after SP4b plan task 13**, which landed on 2026-09-07 (`ledgers/2026-09-06-sp4b-bot-expansion.md`, "Task 13"). P14's own phase line makes this a precondition, and it is met.
4. **Tasks 3 to 7 before Task 8.** `scriptApiKeys.ts` is a `Record<keyof ScriptContext, true>` and every member must exist before the record can name it.
5. **Task 8 before Task 10.** The traversal's entry is `scriptApi.ts`.
6. **Task 9 before Task 10's first real generation**, or gate 2 lands red on day one with 28 findings.
7. **Task 10 before Task 11**, and **Task 11 before Task 12**: there is nothing for the gate to check until both artefacts exist.
8. **Task 13 and Task 14 in that order**, because Task 14's `docsAnchor` values must name headings Task 13 wrote, and gate 5 checks exactly that.
9. **Task 16 last but one.** Gates 2, 3 and 6 read the committed index, so every member, page and example must be in it.

Two things a task must do that a fresh implementer will otherwise miss: **regenerate both artefacts and stage them** whenever a task changes a page or an example, which is **Tasks 13 and 14**, and **never stage `docs/screenshots/e2e-*.png`**.

**Task 9 is not on that list, and its omission is the reason for edge 6 above.** The generator does not exist until Task 10, so there is nothing to regenerate when the 28 doc comments land; Task 9 stages `scriptContext.ts` and its provisional test and nothing else. **Task 10's first generation absorbs Task 9's comments**, which is exactly why the ordering constraint exists: run it the other way and gate 2 lands red on day one with 28 findings.

### Reconcile against HEAD: what entries 2, 3 and 4 changed under this plan

This plan was written at `63f4c76`, after entries 2, 3 and 4 all landed. Each left something under this entry's feet, and each is already accounted for above; this section exists so an executor can check rather than rediscover.

**Entry 2 (release integrity and account isolation), audit C16.** It landed `web/tsconfig.test.json` and made `web/package.json`'s `typecheck` three programs. **This falsifies the premise of the docs spec's gate-6 argument** and of the header comment at `web/src/agent/workerContext.harness.ts:5-8`, which still says a harness exists "because that is what tsconfig compiles and `*.test.ts` is what it excludes". Neither may be quoted as evidence (R14). The comment is not this entry's to fix; note it in the ledger.

**Entry 3 (overlay, pack and client-fork gates).** Its plan is `docs/superpowers/plans/2026-09-07-overlay-pack-and-client-fork-gates.md`, and it is the model for how a gate is added here. Three of its rulings bind this entry: **R11**, `$TotalSteps` stays 10 because moving it falsifies seven prose lines across four documents and a skill; **R12**, an assertion that is not a verify sub-step goes into `build.ps1`; and its task 9 note that a new check "gets watched failing like every other new check" (`:940`), which is Task 12 step 2 and Task 16 step 5. It also landed `client/tsconfig.check.json` (commit `39458f0`) after the pristine config's default glob swept in `client/out/*.js`; **the lesson for this entry is that any new tsconfig or widened `include` must be scoped off generated output, and the evidence is a file count rather than an exit code**. This entry needs no new tsconfig, which is the cheapest way to honour it.

**Entry 4 (shell v2), and what its ledger hands over.** `docs/superpowers/ledgers/2026-09-07-shell-v2.md` records three things this entry inherits. **`web/src/plugins/builtin/tasks.ts` and `web/src/main.ts` both sit at 399 lines**, with named next seams of about 25 lines each; that is why R21 says a link into the Tasks panel costs a file split before it costs a link. **`verify.ps1` run through the Bash tool dies mid-gate**, twice, at steps 2 and 3, which is why every verify step in this plan says `Start-Process -RedirectStandardOutput`. **`docs/screenshots/e2e-*.png` are regenerated by every green gate** and differ by world randomness, which is why the commit steps use explicit paths. Entry 4 also created `web/src/styles/layout/trace.css`, whose kind rails Task 7 adds one to, and `web/src/ui/copy.ts`, which this entry does not touch.

**Entry 1 (SP4b) is the dependency the docs spec names**, and it is closed: tasks 1 to 15 landed on 2026-09-07, the ledger is promoted, and `web/src/tasks/library/tutorialIsland/` holds the 24 stage modules P14 migrates. The one loose end it left is `DeathBehaviour`, which R28 makes this entry's.

**Line numbers this plan corrects, so an executor does not chase a stale citation.** The docs spec was read at `1bfdc7d` and its `types.ts` citations are all about five lines short of HEAD; the survey and docs specs both cite `worker.ts:367` where HEAD is `:374`; the docs spec cites `writeOrCheck` at `io.ts:53-65`, which is inside `writeOrCheckText`; the survey cites `sdk.screenshot` at `index.ts:1044` where HEAD is `:1047`; the SP4b ledger's line 192 says "twelve `TasksErrorCode` including `disabled`" where `api.ts:26-28` has eleven; and the docs spec's own section 12 body says "entry 3" where its header and the sprint both say entry 5. **Grep for the symbol, not the line.**

### What a green gate still does not prove for this entry

Say this in the ledger, because it is the shape of the risk that is left.

- **The routes on the live site.** `verify.ps1`'s stack runs the front server from the repository, where `../web/src/agent/API.md` exists. The image is a different tree, and R19's `COPY` line is proven only by the first release after this entry lands, which is the orchestrator's (D127).
- **That the prose is good.** Gates 2, 3 and 5 assert that prose exists, parses and resolves its links. None of them asserts that it is right. That is a review responsibility and this plan says so rather than implying a mechanism.
- **That a member still behaves as its comment says.** Gate 1 pins the reference to the declarations, not the declarations to the runtime. A doc comment that lies is caught by review, or by a player.
- **The generator against a different TypeScript.** R10 makes the compiler the pinned one by construction, and `--no-install` makes a regression loud, but a `web/node_modules` upgrade can still change `typeToString` output and therefore both artefacts. That is a regeneration and a diff to read, not a failure, and the first `npm run verify` after a TypeScript bump is where it shows up.
