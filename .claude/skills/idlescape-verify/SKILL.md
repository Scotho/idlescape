---
name: idlescape-verify
description: Use when about to claim a change is done, fixed or passing, before a commit, or before handing work to a reviewer. Names the three verification tiers, the commands that are correct only from a particular directory, and the greens that lie.
user-invocable: true
---

# Verifying an idlescape change

The rule this skill serves: **a change is done when a command says so, and that command has to be
capable of failing.** The characteristic defect of this codebase is the test that cannot fail. Nine
distinct instances were found and fixed in SP8b alone.

## Read first

- `docs/VERIFICATION.md` - **the authority.** Three tiers, every command with the environment trap
  attached, the false-green catalogue, and the recovery when the install is broken.
- `docs/OPERATIONS.md` - ports, timings, and the PowerShell 5.1 rules the commands run under.
- `scripts/verify.ps1` - the acceptance gate itself. Its header names the suites in order and omits
  two of its own ten steps; the body is the truth.

## Rules that are not negotiable

- **Evidence before assertions.** Say what you ran, from where, and what it printed. "Tests pass"
  is not a verification claim.
- **Mutate, do not read.** Every fix round produces a mutation-to-test table: what you changed to
  break it, which test must fail, whether it did. If nothing fails, the finding is the test.
- **A skip reads as green.** So does a suite that collected zero tests. Check the counts.
- **Never assert a server is current from a status code alone.** A stale server answers an unknown
  path with `404`, and a human route answers `401` before its handler runs. Assert on the route's
  own behaviour.
- **Never print a secret** while proving one is configured. Its length and the HTTP status it earns
  are the evidence.

## Working modes

### Per task, while you are working

Typecheck, lint, the touched package's unit suite, and the mutation table. The per-package commands
and their working directories are the table in `docs/VERIFICATION.md` tier 1. Run the package's
whole suite before calling a task done: `web/src/test/setupDom.ts` runs once per file, not per
test, so a test that mounts into `document.body` can pass alone and fail in company.

Two harness shapes have each cost a session here and are not in the numbered list below, because
the authority keeps them with its tier 1 mutation shapes rather than with its false greens:

- **A hand-dispatched pointer event must set `buttons`,** or the abandoned-drag guard ends the
  gesture before it starts and the test passes vacuously. jsdom has no pointer-events model and
  no `document.elementFromPoint` at all.
- **A non-cancelable `KeyboardEvent` swallows `preventDefault()`,** so the test asserts the
  opposite of browser behaviour.

### Per sub-project, before claiming done

```powershell
npm run verify        # from the repository root
```

Ten steps: the 400-line ceiling (`scripts/line-ceiling.ps1`, first because it costs a second);
step 2, which is now the clone pin check, both overlay applies, both drift checks, the
manifest-git-tracked check, `scripts/patches-check.ps1` and the engine typecheck and suites; the
client fork's own `tsc --noEmit`; client unit tests; server typecheck and tests with the emulators
up; web typecheck, lint and vitest; firebase rules; wiki typecheck and tests; `build.ps1`, which
also builds the reader database and asserts the minified client bundle; Playwright against a stack
the script brings up itself. About twenty five minutes.

**Report what a green does not cover.** The three gaps this paragraph used to name are closed, all
three inside step 2 (audit C22, C23 and C24, entry 3, 2026-09-08): `Assert-ClonePins` compares both
clones to `scripts/upstream.lock` before anything else, the **content** overlay's `-Check` runs and
its exit code is read, and `scripts/patches-check.ps1` runs all four patch records and diffs
`client/` against the pinned import commit, so no `PATCHES.md` assertion is a grep anybody has to
paste. It **does** measure a line count: step 1 is `scripts/line-ceiling.ps1`, the 400-line
ceiling, with its six exemptions in its own header (audit C16's first third). It **does** typecheck
the web tests and the client fork (C16's second third): `web/tsconfig.test.json` holds the 133
test files and the ten harnesses, and step 3 is the fork's `tsc --noEmit` over its 123 source
files (`tsconfig.check.json`, the pristine config plus a carve-out for git-ignored `out/`). Say what
that does not buy: the web suite carries 113 `as unknown as` casts, and each one hides the drift the
check exists to catch, so the value is the ratchet and not the count. `verify.ps1` sees a stale wiki
`contentSha` but not a hand-edited wiki data file; that is `bun wiki/gen/extract.ts --check-full`,
tier 3. The eight `sdk/` files `web/src/vendor/PATCHES.md` calls "provenance header only" carry no
per-file pin. And the **minified** bundle is read once, in `build.ps1` at step 9; step 10's
`start-stack.ps1 -Prod` then rebuilds `client/out` unminified, so Playwright never exercises the
artifact that was checked. Everything above answers about this working tree and never about the
release image.

### Pre-deploy

Tier 3 in `docs/VERIFICATION.md`. A release is owner-gated (board gate G5), and today
`"engine":"up"` from `box/health.sh` is **not** evidence that the deployed stack has the engine
overlay or a reachable management link (audit C07). The server image now builds the wiki database
(`server.Dockerfile`'s `wiki-build` stage, audit C09, second half), so a red `"wiki"` gap is a
build or copy failure to look into, not the design; it is expected only for a release cut from a
commit that predates 35c1ae8.

## The traps that produce a false green

Ordered by how easy they are to hit. Full detail and the reasons are in `docs/VERIFICATION.md`.

Entries 1 and 2 are **closed** and their numbers are retired, here and in the authority, so this
list starts at 3. What they were, and what habit each still warns about, is the "Closed false
greens" section of `docs/VERIFICATION.md`: `content-overlay.ps1 -Check` could not fail (closed in
`7f17658`), and `start-stack.ps1` continued over a dead engine (closed in `46c5780`, refined in
`57e3eb6`). It **throws** now, in both shapes, and the reason a start failed is in
`logs/engine.err.log`, not `logs/engine.log`. Every number below is the authority's number for the
same trap: 3 to 11, same order, abridged here and told in full there.

3. **`bun scripts/gen/atlas.ts --check` and `collision.ts --check` run from the repository root.**
   The generators' own typecheck, `npx tsc -p ../scripts/gen/tsconfig.json`, runs from `web/`.
4. **Playwright runs from `web/`.** From the repository root it reports "No tests found" and exits
   zero.
5. **`npm run build` in `web/` builds against real Firebase** (`web/.env.production`). That is
   correct only when building what ships. For local play and Playwright use `npm run build:e2e`.
   The old absolute prohibition on `npm run build` is wrong: `scripts/build.ps1:37` does exactly
   that, correctly.
6. **Emulators launched from bash die silently.** PowerShell `Start-Process`; see
   `docs/OPERATIONS.md`.
7. **`web/e2e/bank.pw.test.ts` skips itself without `ENGINE_MANAGEMENT_SECRET`,** which would
   silently drop the one spec that proves the shared bank works. `verify.ps1` guards it three ways.
8. **Proving a server is current from a status code.** A stale server answers a path it does not
   know with `404`, and a current one answers a human route with `401 {error:'unauthorized'}`
   before its handler runs, so neither says the handler works. Assert on a route's own
   behaviour. That mistake hid a broken SSE fan-out for hours.
9. **A test file's leftover DOM.** `web/src/test/setupDom.ts` runs once per file, not per test, so
   a test that mounts into `document.body` can pass alone and fail in company.
10. **`pointer-events: none` hosts.** Anything interactive inside one must opt back in, or its
   clicks fall through to whatever is behind it and the test that "passes" proves nothing.
11. **A typechecked test suite is not an honest one.** The old entry here (a harness in the shipped
   program, a test file in no program at all) is closed: `web/tsconfig.test.json` takes the tests
   and the ten harnesses, `web/tsconfig.json` excludes both, and `npm run typecheck` runs all
   three projects. What a typecheck cannot see through is a cast, and the web suite carries 113
   `as unknown as`. A green there means no test drifted **where it did not cast**.

## Verification

This skill is satisfied when `npm run verify` is green end to end, all ten steps named in the
report, and when the claim you make about it is bounded by the list above rather than stated as
"everything passes". For a sub-project, done additionally means: whole-branch review returns ship,
one fix wave landed, the ledger promoted to `docs/superpowers/ledgers/`, and the spec carrying its
"what actually shipped" section.
