# Verification

What to run, when, and what a green actually means. Three tiers, each escalating into the next.
Written 2026-09-07 at commit `30efd94`.

The rule this document exists to serve: **a change is done when a command says so, and that command
has to be capable of failing.** This project's characteristic defect is the test that cannot fail.
Nine distinct instances were found and fixed in SP8b alone.

Environment facts (ports, hosts, timings, the worktree hazard) are in `docs/OPERATIONS.md`.
PowerShell here is Windows PowerShell 5.1: no `&&`, no ternary, no `??`, and `pwsh` is not
installed.

---

## Tier 1 - per task, while you are working

Run these before you hand a task to a reviewer. They are seconds to minutes, not the acceptance
gate.

| You touched | Run, from | Command |
|---|---|---|
| `web/src/**` | `web/` | `npm run typecheck`, `npm run lint`, `npm test` (vitest run) |
| `server/src/**` | `server/` | `bun run typecheck`, then `bun test` **with the auth and firestore emulators up** |
| `client/src/**` | `client/` | `bun test src/hooks src/plugins src/vendor` |
| `engine-custom/**` | repo root | `powershell -File scripts/engine-overlay.ps1`, then `-Check` |
| `content-custom/**` | repo root | `powershell -File scripts/content-overlay.ps1`, then `-Check` |
| `wiki/**` | `wiki/` | `bun run typecheck`, `bun test` (also `verify.ps1`'s wiki step) |
| `firebase/firestore.rules` | `firebase/` | `npm test` |
| `scripts/gen/**` | `web/` | `npx tsc -p ../scripts/gen/tsconfig.json`, then the `--check` runs below from the **repo root** |
| any file you grew | repo root | `powershell -File scripts/line-ceiling.ps1` (the 400-line ceiling, counting every line including blank ones, the way `max-lines` does; `verify.ps1` step 1 runs it too) |

Narrow the vitest run while iterating (`npm test -- src/tasks`), but run the package's whole suite
before you call the task done: `setupDom.ts` runs once per file, not per test, so a test that
mounts into `document.body` can pass alone and fail in company.

**Where you run these from is part of the command.** Playwright runs from `web/`, the generators'
`--check` runs from the repository root, their typecheck runs from `web/`, and `build:e2e` is not
`build`. Each of those has cost a session on its own, so read "The false greens" below before you
trust a tier 1 green - the working-directory rules live there and are not repeated here.

### The mutation-to-test table

Every task and every fix round produces one. It is three columns and it is not optional:

| Change I made to break it | The test that must fail | Did it? |
|---|---|---|

**Mutate, do not read.** When a review says a behaviour is covered, break the behaviour and watch
the test fail. If nothing fails, the test does not test what its name says, and the finding is the
test, not the code. The shapes that have hidden real bugs here:

- **A fixture where right and wrong are identical.** A focus test that used slot 0, the one slot
  where the bug was invisible, led a careful reviewer to declare buggy code correct.
- **A fake looser than the real thing.** Every composed bank view test used a store that accepted
  every operation, while the real store clamps endpoints and refuses cross-tab inserts. Replacing
  it with an honest fake failed four tests immediately.
- **A harness the environment cannot run.** jsdom has no `document.elementFromPoint` and no
  pointer-events model, so ten composed drag tests never executed and a context menu shipped
  unclickable with a mouse. A hand-dispatched pointer event must set `buttons`, or the
  abandoned-drag guard ends the gesture before it starts.
- **A test that asserts only an absence.** "No timer remains" is not a teardown test. Assert that
  no callback fires and no state is written after disposal.
- **A non-cancelable `KeyboardEvent`,** which swallows `preventDefault()` silently, so the test
  asserts the opposite of browser behaviour.

## Tier 2 - per sub-project, before you claim it is done

```powershell
npm run verify        # from the repository root
```

`scripts/verify.ps1`, ten steps. Every process it starts is killed in a `finally` block: `taskkill
/T` asks first, and `taskkill /T /F` follows for anything still alive, so a wrapper's whole child
tree goes with it either way. `scripts/start-stack.ps1` stops its tracked processes the same way on
Ctrl+C. The ask exists so a process that can close cleanly gets to; measured on 2026-09-08, **the
engine is not one of them** - a windowless console child refuses `/T` outright ("can only be
terminated forcefully"), so the escalation does the work and the owner bank is still flushed only
by its own 100-tick timer. Do not read a clean stop into a clean exit here. It never touches the
retired PoC on port 8888.

| Step | What runs | What a green means |
|---|---|---|
| 1 | `scripts/line-ceiling.ps1` | Every tracked source file we wrote is at or under 400 lines, and `web/eslint.config.js`'s `max-lines` carries the same number. It scanned more than 200 files, so a green is not an empty scan. Six exemptions, all in the script's header |
| 2 | Both clones checked against `scripts/upstream.lock`, then engine overlay apply, `-Check` for drift, the content overlay's apply and `-Check`, the manifest-git-tracked check, `scripts/patches-check.ps1`, engine `tsc --noEmit`, engine unit tests via `npx tsx --test --test-force-exit` | Both clones sit at the pinned revisions, so the two drift checks below are answering about upstream and not about themselves; both overlays apply cleanly, no upstream file either patches has changed since it was authored, every manifest path is a file git knows about, every assertion in **all four** patch records still holds against the tree (the client fork's, the engine overlay's and the two vendored `rs-sdk` ones), every numbered patch in the fork's table owns at least one of them, `client/` differs from the pinned import commit only inside the allowed set, and the overlay's own suites pass. The patch runner sits here rather than beside the client typecheck because the engine half of the record reads `engine/server`, which is only ours once the overlay above has been applied |
| 3 | `bun run typecheck` (`tsc --noEmit -p tsconfig.check.json`) in `client/` | The whole client fork typechecks, all 123 files under `client/src`, not only what a test imports. `tsconfig.check.json` exists only to `extends` the pristine `tsconfig.json` and drop the git-ignored `out/` bundler output, which the pristine config's default glob would otherwise sweep in on any tree where a build had run, so the gate's program is 123 files whatever the build state. Audit C16: the fork had no typecheck script at all while `client/PATCHES.md` claimed every upstream bump ran one |
| 4 | `bun test src/hooks src/plugins src/vendor` in `client/` | The client hooks, the client plugin registry and the vendored rs-sdk module behave |
| 5 | `bun run typecheck` in `server/`, then `bun test` with the auth (9099) and firestore (8080) emulators up | The whole server package typechecks (not just what tests import), and the pair and bridge suites really ran |
| 6 | `npm run typecheck`, `npm run lint`, `npm test` in `web/` | The shell typechecks, lints and passes its unit suite. The typecheck is three programs now: `tsconfig.json` for `src/`, `tsconfig.e2e.json` for the Playwright half, `tsconfig.test.json` for the test files and the ten harnesses (audit C16) |
| 7 | `npm test` in `firebase/` | The Firestore rules do what the rules tests say |
| 8 | `bun run typecheck` and `bun test` in `wiki/` | The corpus generator, the renderer and the reader database builder typecheck and pass their 31 suites. Fixtures only: no emulator, no stack, no engine content |
| 9 | `scripts/build.ps1` | All three shippable artifacts build, `scripts/gen` typechecks, the committed `atlas.json`, `collision.bin` and `doors.json` still match the pinned content, `wiki/data/274`'s `contentSha` still equals the pinned content sha, and the reader database clears a size floor with no lint errors in its report |
| 10 | Emulators, `start-stack.ps1 -Prod`, `/api/health` reporting `engine: up`, the management-secret probe, `npm run build:e2e`, `npx playwright test` from `web/` | 36 Playwright specs passed and 5 skipped against a freshly built 274 stack with a real engine behind it |

**What a full green does not mean.** Be honest about this when you report it. The three gaps this
paragraph used to open with are closed, all three inside step 2: both clone shas are checked
against `scripts/upstream.lock` before anything else in that step, the **content** overlay's
`-Check` runs and its exit code is read, and `scripts/patches-check.ps1` runs all four patch
records, the client fork's, the engine overlay's and the two vendored `rs-sdk` ones, so no
assertion in any `PATCHES.md` is a grep anybody has to paste. The same run also diffs `client/`
against the import commit pinned as `client-import` in `scripts/upstream.lock`, which is what makes
the fork's "everything else is the pristine 274 tree" claim mechanical rather than remembered.
What that still leaves open is narrow and named. The eight vendored `sdk/` files
`web/src/vendor/PATCHES.md` lists as "provenance header only" carry no per-file pin, so nothing
proves those eight are still upstream's bytes. And the **minified** client bundle is read exactly
once, inside `scripts/build.ps1` at step 9, which asserts the artifact really is minified and that
the seven reserved hook names survived terser; step 10 then starts `start-stack.ps1 -Prod`, which
runs an unconditional `bun run build:dev` and overwrites `client/out`, so every Playwright spec
exercises an unminified bundle and the run ends with one on disk. A green also measures a line count
(`scripts/line-ceiling.ps1` is step 1, audit C16's first third) and typechecks the web tests and
the client fork (audit C16's second third): `web/tsconfig.test.json` holds the 133 test files and
the ten harnesses, and step 3 is the fork's own `tsc --noEmit` over its 123 source files.

What it still does not mean. **A typecheck
is not proof the tests are honest**: the web suite carries 113 `as unknown as` casts, which suppress
exactly the interface drift the check exists to catch, so its value is the ratchet on what comes
next rather than today's count. `verify.ps1` also does not re-extract the wiki corpus, so it sees a
stale `contentSha` and not a hand-edited data file; that is the tier 3 `--check-full` row below.
And every check named above answers about **this working tree**, never about the release image:
what the shipped image is and is not proven to carry is its own list, under "What a green release
gate still does not prove". Cover what is left by hand from the tier 1 table above.

### Two steps the script's own header omits

`verify.ps1`'s header names the suites in order; the script runs ten numbered steps, and step 2
alone prints five sub-steps under its own number (`Write-SubStep` at `verify.ps1:139`, `:151`,
`:188`, `:192` and `:218`; the script's sixth such call, `:258`, is the server unit tests under
step 5). Two of step 2's five are load-bearing and easy to miss:

- **The engine unit tests** (`verify.ps1:218-223`, the `(cont.) engine unit tests` sub-step). The
  suite paths must be passed **relative** to `engine/server`, never as `$_.FullName`: an absolute path carries whatever drive casing the
  caller typed, node then holds two specifiers for the same file, evaluates the engine's circular
  module graph twice, and three suites die at load with `Cannot access 'Player' before
  initialization`. `--test-force-exit` is required too, or the step hangs forever on an event loop
  the engine's worker threads never drain.
- **The manifest-git-tracked check** (`verify.ps1:151-183`, the `(cont.) overlay manifest paths
  are git-tracked` sub-step, which now walks both overlays). The overlay is copied into a throwaway
  clone, so a file that was never `git add`ed still applies and still passes every suite on the
  machine that wrote it, while being absent from the repository. This is the check that catches it.

## Tier 3 - pre-deploy

**Escalate here whenever the change is release-bound; a tier 2 green is not a release gate.**
`npm run verify` proves the tree builds and behaves on this machine, and says nothing about what a
deployed box will run. A release is additionally owner-gated (board gate G5). Before asking, all of
tier 2 plus:

| Check | Command | State |
|---|---|---|
| Engine overlay drift | `powershell -File scripts/engine-overlay.ps1 -Check` | exists, in verify's engine overlay step |
| **Content** overlay drift | `powershell -File scripts/content-overlay.ps1 -Check` | exists, in verify's overlay step, and it **exits 1** on drift, on a vanished base file, or on a `kind: "new"` entry whose path upstream now carries a file (the exit block at the end of its `-Check` branch), so `$LASTEXITCODE` is now the answer rather than a formality. Audit C23, closed; false green 1 below closed with it |
| Manifest paths tracked | inside `verify.ps1`'s overlay step | exists, and it now walks **both** manifests, 41 paths across 2 overlays. Before this it read `engine-custom/manifest.json` only, so a `content-custom/` file that was never `git add`ed still applied and still passed |
| Generated map data | `bun scripts/gen/atlas.ts --check` and `bun scripts/gen/collision.ts --check`, **from the repository root** | exists, in `build.ps1:62-65` |
| Clone shas match the lock | `Assert-ClonePins`, inside `verify.ps1`'s overlay step | exists, and it runs **first** in that step. Both `-Check` implementations resolve the CLONE's own HEAD, so on a stale clone every recorded hash agrees with the blob it was taken from and both drift checks pass vacuously; the pin check is what makes them mean anything. `scripts/start-stack.ps1` asserts the same thing before either overlay. Audit C23, closed |
| Patch records still applied | `scripts/patches-check.ps1`, inside `verify.ps1`'s overlay step | exists, and the shell fences it replaced are gone. It runs four records, not one: `client/PATCHES.md`, `engine-custom/PATCHES.md` and the two vendored `client/src/vendor/PATCHES.md` and `web/src/vendor/PATCHES.md`. It also diffs `client/` against the `client-import` commit `scripts/upstream.lock` pins, which is what makes the fork's pristine-274 claim mechanical, and cross-checks that lock's `rs-sdk` sha against both vendor records so a bump cannot update one and not the other. The rows are typed data (`<tag> \| <mode> \| <expected> \| <file> \| <literal>`), not grep commands, because the old dialect had five shapes and one of them, an escaped table-cell pipe, already read as alternation and answered 7 where 1 was meant. A missing target file is a failure, never a skip; a parse under the per-record floor throws; and every numbered patch in the table must own an assertion, which is how patch 9's missing proof was found. `Assert-PatchMatching` runs first, over a throwaway fixture, so the runner is watched failing on every invocation. Audit C24 |
| Wiki data matches a fresh extract | `bun wiki/gen/extract.ts --check-full`, from the repository root | **by hand, and slow on purpose.** `build.ps1` asserts only that `wiki/data/274/manifest.json`'s `contentSha` equals the sha `scripts/upstream.lock` pins, which catches a content bump nobody re-extracted and does **not** catch a hand-edited `items.json`. This does, by re-extracting into a temporary directory and comparing the eleven tracked files plus `gaps.md`, normalising line endings and dropping `generatedAt`. The same comparison is `wiki/gen/extract.test.ts`'s `checkFull` test, gated behind `WIKI_CHECK_FULL=1` |
| Release health | `deploy/lightsail/release.ps1` and `cutover.ps1` poll `box/health.sh` through `Get-HealthGaps` (`deploy/lightsail/common.ps1`) | **widened, and now a runtime proof of the engine overlay.** The gate needs `"engine":"up"` **and** a numeric `"players"` **and** `"wiki":"up"` (decision D75) **and** `"management":"up"`. That fourth field is answered by `GET /owner/health` on the management port, a route only `engine-custom` registers and only when a secret is set, so one green field proves the running image carries the overlay, `ENGINE_MANAGEMENT_HTTP` reaches the engine, and both halves hold the same `ENGINE_MANAGEMENT_SECRET`. `"unauthorized"` is a 401 or a 404, `"unconfigured"` means the front server has no secret (a healthy local stack, never a passing release), `"down"` means the port did not answer. The build-time half stays: `deploy/docker/engine.Dockerfile` asserts every manifest path plus a content grep per replaced file. What the four fields still cannot see is the list below |

### What a green release gate still does not prove

Even with all four health fields green, the release gate does not see:

- Whether the engine image carries the CONTENT overlay. There is **no health field** for it, so a
  running image is never asked. The local half closed on 2026-09-08 (audit C23, entry 3): the
  `-Check` that could not fail now exits 1 and `npm run verify` reads its code. That answers about
  this working tree and never about an image.
- Whether either pinned clone matches `scripts/upstream.lock` **in the image**. `engine.Dockerfile`
  and the wiki stage take shas as build args and fail without them, but nothing compares a running
  image's shas to the lock. The build machine is covered: `Assert-ClonePins` runs first in
  `verify.ps1`'s overlay step and again in `start-stack.ps1` (audit C23, entry 3, closed there).
- Whether the client fork's numbered patches are present **in the image that ships**.
  `scripts/patches-check.ps1` runs all four records inside `npm run verify` and diffs `client/`
  against the pinned import commit, so they are proven on the build machine (audit C24, entry 3,
  closed there) and nothing ties that answer to a deployed bundle. That is the next bullet's point,
  and this one now merges into it.
- Whether the deployed bundle is the bundle that was verified. `release.ps1` ships HEAD and warns
  about dirty tracked files under `deploy/`, but nothing ties an image to a verified commit.

## The false greens

Each of these has cost a real session. They are ordered by how easy it is to hit them. Two of the
entries this list opened with are closed; they are kept below the live ones, and **the survivors
keep their numbers**, so the list starts at 3 on purpose and a session quoting "false green 5" from
an older copy still lands on the same trap.

3. **The generator `--check` from the wrong directory.** `bun scripts/gen/atlas.ts --check` and
   `collision.ts --check` must run from the **repository root**. Run from `web/` they resolve
   nothing useful. The generators' own typecheck is the mirror image: `npx tsc -p
   ../scripts/gen/tsconfig.json` runs from **`web/`**, because it borrows web's TypeScript.
4. **Playwright from the repository root.** It reports "No tests found" and exits 0. Run
   `npx playwright test` from **`web/`**, where `@playwright/test` resolves and the config lives.
5. **A plain `npm run build` in `web/`.** The old rule forbade it absolutely; the rule is wrong as
   stated, because `scripts/build.ps1:37` does exactly that to produce the shipped bundle. Name
   the case instead:
   - `npm run build` produces `web/dist` against **`web/.env.production`**, the real Firebase
     project. That is correct, and only correct, when you are building what ships.
   - For local play and for Playwright, use **`npm run build:e2e`**, which builds `web/dist-e2e` in
     mode `e2e` against the emulators. A production bundle loaded against the emulators signs in to
     real Firebase and the front server rejects the token. `verify.ps1` sets
     `WEB_DIST=../web/dist-e2e` for the stack it starts, precisely so this cannot happen there.
6. **Launching the Firebase emulators from bash.** They die silently: the log shows only the cmd
   banner. Start them from PowerShell,
   `Start-Process cmd.exe "/c npm run emulators"` in `firebase/`. See `docs/OPERATIONS.md`.
7. **A skip reads as green.** `web/e2e/bank.pw.test.ts` skips itself when
   `ENGINE_MANAGEMENT_SECRET` is missing, which would silently drop the one spec that proves the
   shared bank works. `verify.ps1` guards it three ways: the value exists and clears the
   32-character floor, the **engine answers it with a 200** on the management port, and it is
   exported into the Playwright process. Never print the value; the length and the HTTP status are
   the evidence.
8. **Proving a server is current from a status code.** A stale server answers a path it does not
   know with `404`, and a current one answers a human route with `401 {error:'unauthorized'}`
   before its handler runs, so neither says the handler works. Assert on a route's own
   behaviour. That mistake hid a genuinely broken SSE fan-out for hours and made every browser run
   exercise only the polling fallback.
9. **A test file's leftover DOM.** `web/src/test/setupDom.ts` runs once per file, not per test.
10. **`pointer-events: none` hosts.** Anything interactive inside one must opt back in, or its
   clicks fall through to whatever is behind it and the test that "passes" proves nothing.
11. **A typechecked test suite is not an honest one.** Both halves of the old entry here are now
   false: `web/tsconfig.test.json` puts the 133 test files and the ten harnesses in a program of
   their own, `web/tsconfig.json` excludes harnesses so none of them is in the shipped program any
   more, and `npm run typecheck` runs all three projects (audit C16). What the check still cannot
   see is a cast: the web suite carries 113 `as unknown as`, and every one of them hides precisely
   the interface drift this check exists to catch. A green typecheck means no test has drifted
   **where it did not cast**.

### Closed false greens

Kept rather than deleted, because the habit each one warns about outlives the fix, and because a
session reading an older copy of this document needs to find out here that it was closed.

- **1, closed 2026-09-08 in `7f17658` (audit C23, entry 3 task 4): `scripts/content-overlay.ps1
  -Check` could not fail.** It printed the base files that had drifted upstream and the ones that
  had vanished, then ran `exit 0` unconditionally, so wrapping it in an `if ($LASTEXITCODE -ne 0)`
  was a check that could only ever pass, while its sibling `scripts/engine-overlay.ps1 -Check`
  exited **1** on the same finding. It now exits 1 too (`content-overlay.ps1:117-125`) and
  `verify.ps1` runs both and reads both codes. **The habit:** two scripts with the same flag and
  the same name shape held opposite exit contracts for months, and nothing about a `-Check` name
  tells you which one you have. Read the exit path.
- **2, closed 2026-09-08 in `46c5780`, refined in `57e3eb6` (audit C23, entry 3 task 5):
  `start-stack.ps1` continued when the engine never came up.** It used to poll `logs/engine.log`
  for `World ready` until a deadline and, if it never appeared, print `WARNING: did not see 'World
  ready' ... continuing anyway` and start the front server regardless, so a stack that "started"
  could have no engine behind it and every browser check run against it was measuring the front
  server alone. It now **throws** in both shapes: the poll loop checks `$engineProc.HasExited` on
  every pass, so a crash is reported in seconds rather than waited on for ten minutes, and a silent
  engine past the deadline throws too. Do not expect an exit code from it. Measured on 2026-09-08,
  the object `Start-Process -PassThru` returns on Windows PowerShell 5.1 answers `HasExited`
  correctly and answers `ExitCode` as empty, before and after `WaitForExit()`, so the message reads
  `the engine exited (code unknown) before reporting 'World ready'`. **The reason is in
  `logs/engine.err.log`**, the engine's own stderr, which is where an `EADDRINUSE`, a Node stack or
  a tsx resolution failure lands; `logs/engine.log` has only whatever it managed to print first.
  Every tracked process is stopped before either throw, and before any other throw between the
  first `Start-Process` and the last, because that whole region sits in a `try` whose `catch` calls
  `Stop-Tracked` and rethrows. **The habit:** a stack that printed a URL is still not a stack with a
  world behind it if you started the engine some other way. Assert on `/api/health` reporting
  `engine: up`.

## When the install is broken

Symptoms: `Cannot find package`, or `'vitest' is not recognized` at verify's firebase rules step.
Usually a worktree removal followed a `node_modules` junction and emptied the main tree (see
`docs/OPERATIONS.md` for the hazard and the unlink procedure). Recovery, about two minutes:

```powershell
cd web;      npm ci
cd ..\firebase; npm ci
cd ..\server;   bun install
cd ..\client;   bun install
```

**Do not skip `firebase/`.** Nothing exercises it until verify's firebase rules step, so a partial
recovery looks complete for hours and then fails the acceptance gate.

If the stack itself will not come up, that is `docs/OPERATIONS.md` and the `idlescape-stack` skill,
not this document.

## Reporting a result

Say what you ran, from where, and what it printed. "Tests pass" is not a verification claim.
A sub-project is done when: every task is implemented and reviewed, the whole-branch review returns
ship, one fix wave has landed, `npm run verify` is green end to end, the ledger is promoted to
`docs/superpowers/ledgers/`, and the spec carries a "what actually shipped" section.
