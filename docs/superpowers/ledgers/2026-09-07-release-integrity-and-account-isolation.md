# Release integrity and account isolation - sprint entry 2

Plan: `docs/superpowers/plans/2026-09-07-release-integrity-and-account-isolation.md`
Spec: `docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md` entry 2, standing on
`docs/superpowers/specs/2026-09-07-project-audit.md` sections 2.1 and 2.3 (C07, C09, C10, C16,
C17, C18) and decisions D15, D16, D30, D35, D73 to D75, D92 to D101.
Branch: `sprint/dragon-slayer`
Commit range: `55475f2ccfa0de0d92a187ef70576abd09c5700f..f945e28`, 27 commits: 11 task commits, 10
fix-round commits, the one that first promoted this ledger (`b09a801`), Task 12's own fix round 1
(`04d6b16`) and the three that recorded that round, its re-review and the whole-branch review, and
the fix wave (`f945e28`). Task 1 is the only task whose review approved without a fix
round. The two commits after `f945e28` are this ledger's landing state and the sprint-spec close;
they change no code.
Source: `.superpowers/sdd/2026-09-07-release-integrity-and-account-isolation/progress.md`, 1,493
lines, read in full.

---

## 1. What actually shipped

**Task 1, C10 account isolation (`5529925`).** `web/src/storage/scoped.ts` is new and owns both the
key shape (`cs.<ns>.u.<uid>.<id>` signed in, `cs.<ns>.anon.<id>` signed out) and the one-time
migration of bare `cs.plugin.<id>` and `cs.script.<id>` keys into the `anon` bucket.
`plugins/settings.ts` and `tasks/toggles.ts` compose it and stop enumerating the whole `cs.`
namespace, so the leak is closed by construction rather than by a filter anyone can forget. Nothing
is ever adopted into a uid bucket. Review approved with no findings; 12 mutations confirmed
failing, 5 of them re-run by the reviewer.

**Task 2, C18 boot (`44e14eb`, fix round `8930427`).** `boot()` moved out of `web/src/main.ts` into
`web/src/boot.ts` behind injected dependencies, so it is importable under jsdom for the first time.
It cannot reject: the catch calls `showBootError`, which hides `#gate-form` and paints
`#gate-boot-error`, a **sibling** of the form rather than a child of it, because `.hidden` is
`display: none !important` and the obvious version would have painted the empty card C18 exists to
remove (D99). `probeGate()` answers open, closed or unknown, and unknown enters the app. The health
watcher is a factory with an in-flight guard and a held interval id. The fix round added a
`stopped` flag so a request already in flight cannot write state after teardown, which the
reviewer's probe showed the first teardown test could not have caught, plus an `event.persisted`
guard so a bfcache freeze is not a teardown. 18 mutations.

**Task 3, C17 environment truth (`417a056`, fix round `50c4ae4`).** The two remaining shipped host
literals went behind `web/src/frame/siteLabel.ts` and `location.host`, at both call sites rather
than the one the audit named; `server/.env.production.example` was deleted rather than corrected;
`ENGINE_HTTP` and `ENGINE_WS` now default to 8899 rather than the retired 8888 instance;
`engine-custom/.env.example` was added. Two tests in `server/src/env.test.ts` hold the templates
honest: one asserts `server/.env.example`'s key set equals what `loadEnv` reads, the other asserts
`provision.ps1`'s nine written keys plus its new greppable `# NOT-WRITTEN:` declaration equal the
template exactly (D101). 13 mutations.

**Task 4, C09 the wiki in the gates (`4fee7fe`, fix round `9d29b9e`).** `scripts/build.ps1` builds
the wiki reader database and asserts `wiki/data/274/manifest.json`'s `contentSha` against
`scripts/upstream.lock`; `scripts/verify.ps1` gained a wiki typecheck-and-test step, and its step
labels moved to a `Write-Step` helper with a single `$TotalSteps` constant so the remaining two
additions were one-constant edits. `bun wiki/gen/extract.ts --check-full` is the tier 3 hand check.
14 mutations.

**Task 5, C09 the wiki in the image (`35c1ae8`, fix round `3d221bd`).**
`deploy/docker/server.Dockerfile` gained a `wiki-build` stage that clones Content at the pinned sha
and ships the database; compose passes `CONTENT_SHA` to the `server` service as well as the
`engine` one. No `WIKI_DB` override was added (R17). The image itself was **not built**: Docker is
not installed on this machine, so the substitute verification ran the Dockerfile's two `RUN` guards
verbatim under `sh`, ran the image's exact wiki chain locally, and parsed the compose file. Section
5 states what that does and does not prove. 15 mutations.

**Task 6, C16 the line ceiling (`7c311b3`, fix round `2bbd752`).** `scripts/line-ceiling.ps1` is the
authority: `git ls-files`, six exemptions in its own header, and an assertion that
`web/eslint.config.js`'s `max-lines` carries the same number. It runs at step 1. The fix round is
the interesting one: the first cut used `Get-Content | Measure-Object -Line`, which drops empty
strings from the pipeline, so it counted **non-blank** lines and a 401-line file with alternating
blanks passed the script while eslint errored on it. `Assert-LineCounting` now proves on every run
that blanks are counted. 16 mutations plus 4 negative controls.

**Task 7, C16 the typechecks (`75735bd`, fix round `39458f0`).** `web/tsconfig.test.json` brings
`*.test.ts` and the ten harness files into a program for the first time, and the client fork got
`tsc --noEmit` over the whole package. The fix round scoped the client config off `client/out`, the
git-ignored build output. The web test program came up **red at 107 errors across 27 files, by
design**; the gate was left red for exactly one task. 8 mutations, 7 of them confirmed failing:
dropping `"src/**/harness.ts"` from the test program's *include* left the harness error still
caught, which is the negative control that proved the glob is insurance there and load-bearing only
in `tsconfig.json`'s *exclude*.

**Task 8, C16 the backlog (`52a6e1c`, fix round `9ce3005`).** All 107 errors cleared with no new
`as any` and no widened interface: the one production change was `ToastTimer` in
`web/src/ui/toast.ts`, everything else was a fixture made right. The fix round corrected six
committed claims that said "nine harnesses" after `web/src/agent/world.harness.ts` made it ten, and
proved the count by making the compiler name the files (`--listFiles`) rather than by counting the
tree. 10 mutations.

**Task 9, C07 the engine half (`4e002ce`, fix round `c66a9f9`).** One `onRequest` hook in
`engine-custom/src/web.ts` 401s any path starting with `/setup`, so a fourth `/setup` route cannot
be forgotten; `/prometheus` stays open by not matching. `GET /owner/health` is a new route behind
the same `authorised()` check, registered only when a secret is set, and `verify.ps1`'s
fake-owner-key probe was repointed at it so there is one answer and not two. 6 mutations plus one
confirmed by the greps that are its only coverage.

**Task 10, C07 the server half (`0f5f464`, fix round `ed805fb`).** `HealthSnapshot.management` reads
up, unauthorized, unconfigured or down: an empty configured secret is unconfigured with no probe at
all, so a local stack reads honestly instead of looking broken, while `Get-HealthGaps` requires up
so an unconfigured production box fails the gate. `/api/health` stayed public, because
`cutover.ps1` polls it through the public hostname.  8 mutations.

**Task 11, C07 the two small ones (`82d244c`, fix round `4b0582c`).** The proxy stopped caching
upstream failures for an hour, and `server/src/log.ts` added a one-JSON-line access log whose quiet
set was read off `router.ts`'s `classify()` rather than guessed. The fix round is the entry's most
valuable finding: the first cut **logged live pairing tokens**, because `router.ts` puts the
32-character single-use pair secret in the *path*, not the query string the plan and the commit
message both claimed. `requestLine` now redacts every path under `/pair/` and `/api/pair/<...>`
whatever kind `classify()` calls it, and `withAccessLog` lifted the timing, the `shouldLog`
decision and the scrub into a tested function. 7 mutations.

**Task 12, this commit.** The gate end to end, the document sweep, this ledger, the audit pointer
and the board row.

---

## 2. The audit reconciliation

| Finding | State after entry 2 | Where | Left open |
|---|---|---|---|
| C07 | closed | the deploy half in `ca8ef86` (D73, D74), asserted here; `/setup` guard and `GET /owner/health` in `4e002ce`; the `management` health field and the fourth gate gap in `0f5f464`; proxy `no-store` and the request log in `82d244c` | the deploy half is asserted statically only: no image has ever been built here, and `"management":"up"` has been observed against a local `start-stack.ps1 -Prod` run and never against an image (section 5) |
| C09 | closed | build and verify steps plus the `contentSha` drift gate in `4fee7fe`; the `wiki-build` image stage in `35c1ae8` | a hand-edited data file is caught only by the tier 3 `--check-full`; and the image stage has never actually been built (section 5) |
| C10 | closed for the two stores the entry names | `web/src/storage/scoped.ts` and both stores in `5529925` | the adjacent unscoped keys, out of scope by ruling R4: `cs.panel`, `cs.size`, `cs.filter`, `cs.tasks.settings` and the three `cs.bank.*` keys are display preferences; **`cs.pl.<id>.<k>` (`PluginContext.storage`) is the same defect and waits only because no builtin plugin calls it at HEAD**; `cs.<k>` is entry 4's C21 |
| C16 | closed | `scripts/line-ceiling.ps1` in `7c311b3`; `web/tsconfig.test.json` and the client typecheck in `75735bd`; the backlog in `52a6e1c` | `web/styleguide.html` and five other exemptions, all listed in the script's header. The audit's C16 proposal also asked to split `engine-custom/src/idlescape/ownerBank.ts` (394) before entry 4 and to pick a seam for `web/src/tasks/api.ts` (393); neither happened, and five files sit within seven lines of the ceiling (`tasks.ts` 399, `worker.ts` 397, `manager.test.ts` 396, `ownerBank.ts` 394, `api.ts` 393). The gate now catches the 401st line; it does not shrink these. |
| C17 | closed | the escalation in `ca8ef86` (D74), asserted here; templates, the missing `engine-custom/.env.example`, the 8899 defaults and the two bundle literals in `417a056`; the footer password in `44e14eb`; the `.env.example` set-equality test and the `provision.ps1` written-plus-declared test in `417a056` | rotating the deployed gate password is an owner action under G5. `provision.ps1` still writes a hand-kept nine-key list rather than deriving from the template: the test makes an omission fail loudly, it does not make the generator derive |
| C18 | closed | `web/src/boot.ts` and the rewiring in `44e14eb`, strengthened in `8930427` | `main.ts` still cannot be imported under jsdom; entry 4 opens it |
| C08 | closed by entry 1 | `1271319`, `2f5dce7` (D15) | nothing |
| C21 | untouched | entry 4 | the bare `cs.<k>` accessor in `web/src/tasks/wire.ts` |
| C23, C24 | untouched | entry 3 | clone-sha and client-patch verification at build time |

---

## 3. Rulings R1 to R23, and what happened to each

**Held as written, nothing to add:** R1 (the scoped key shape), R2 (the migration adopts nothing
into a uid bucket), R3 (`web/src/storage/` and not `ui/`), R5 (`probeGate` returns three answers
and unknown enters the app), R8 (the in-flight guard's comment names the hung front server, not a
down engine), R9 (`location.host`, not a build variable), R10 (the footer password leaves the
bundle, the server default and the e2e fallback stay), R11 (`server/.env.production.example`
deleted rather than corrected), R13 (8899, never 8888), R17 (no `WIKI_DB` override), R20
(`GET /owner/health` is a new route, not a reuse of the bank probe), R21 (four `management` values,
`/api/health` stays public), R23 (the audit is not rewritten).

**R4, the unscoped keys, held and gained an obligation.** The plan's own review corrected the stated
reason for `cs.pl.<id>.<k>` before execution began: it is not a display preference, it is
`PluginContext.storage` and it is on exactly C10's defect. Both reasons are written separately into
`scoped.ts`'s header, and D100 carries the obligation past this plan.

**R6, the boot error surface, held and is the ruling that most earned its length.** A reviewer
mutation that put `#gate-boot-error` back inside `#gate-form` fails two tests. Without R6 this entry
would have shipped a second blank page while closing the first.

**R7, `boot.ts` owns the watcher and `main.ts` keeps the fps interval, held; its teardown claim did
not.** The factory shape and the frank admission that the fps interval is untestable were both
right. What R7 did not anticipate is that `stop()` alone does not stop the callbacks of a request
already in flight, and that the teardown test as written could never have caught it, because its
fake `health` resolved immediately. Fixed in `8930427` with a `stopped` flag and a second teardown
case that resolves a held promise after `stop()`. **The lesson is the plan's own test-hygiene rule
turned on a fake: a fake easier than the real collaborator hides the bug it was written to find.**

**R12, the `.env.example` set-equality test, held, and its second half was strengthened into D101**
by the plan review before execution. Both tests ship. The gap R12 names out loud is still open and
is recorded in section 6.

**R14, one `$TotalSteps` constant, held and proved its worth three times.** The count moved 7 to 8
to 9 to 10 with one edit each. **Its principle reached further than its wording.** Task 8's review
found six committed claims saying "the nine harnesses" that R14's greps did not cover, on exactly
R14's own argument that an intermediate number left behind is as wrong as the original. This task's
sweep still greps only step counts; the harness count is guarded by nothing mechanical, which
section 6 records.

**R15, the cheap `contentSha` gate plus a tier 3 `--check-full`, held.** Task 4's review caught the
build's throw message overstating what it proves; the message now says it asserts the recorded sha
and not the bytes, which is what R15 asked for in the first place.

**R16, the wiki ships in the image, held in design and is unproven in fact.** The 132.3 MiB cost was
measured locally and is real. Whether BuildKit accepts the file, whether `oven/bun:1` has `stat` and
`git`, and whether the extract fits the builder's memory are all still unknown, because no image has
ever been built here. Section 5 states it rather than letting a green gate imply it.

**R18, one authority and one convenience, held; the authority was wrong about what a line is for one
commit.** `Get-Content | Measure-Object -Line` counts non-blank lines, so the two halves carried the
same number while measuring different things, which is precisely the drift R18 exists to prevent.
`2bbd752` fixed it and added `Assert-LineCounting` so the class of bug cannot return.

**R19, `engine-custom/src/web.ts` exempt and the guard is one hook, held.** The file is 374 lines
and passes today; the exemption is recorded so an upstream bump does not turn an unrelated file into
a gate failure. A reviewer also found the adjacent Task 3 ruling about `engine-custom/PATCHES.md`
resting on a false premise, since prose is exempt by extension and can never reach the exemption
array, so no dead entry was added.

**R22, the request log, is the one ruling this entry falsified.** Its quiet set was right and was
correctly read off `classify()` rather than guessed. Its stated mitigation was **false**: the plan
and the first commit message both said "query strings are dropped: pair tokens travel there", and
`router.ts:41-44` puts the pair secret in the path. The log therefore became the only place the
plaintext token existed, in a commit whose own audit finding asked for the log "never the bearer".
Fixed in `4b0582c` by redacting in `log.ts` on path shape, deliberately not on the `Route` the
router already built, because `/pair/<token>/extra` classifies as `notfound` while still carrying a
live token. **A ruling that names the wrong mitigation is worse than one that names none, because it
stops the reviewer looking.**

---

## 4. Fix rounds and deferred minors

Twelve tasks, eleven fix rounds, **zero findings disputed**, every re-review clean at 1/1 to 5/5
addressed. Only Task 1 was approved without one.

| Task | Findings | Shape |
|---|---|---|
| 1 | 0 | approved as written |
| 2 | 1 important, 1 minor | the in-flight teardown gap; a bfcache freeze treated as a teardown |
| 3 | 3 minor | a `.dockerignore` comment claiming "no values" in a file carrying `PORT=8787`; a ruling resting on a false ceiling premise; an overstated deviation |
| 4 | 4, plus 4 stale citations | an overstated throw message, and citations re-anchored after the file moved |
| 5 | 2 important, 3 minor | a memory measurement, and prose sitting under the wrong heading |
| 6 | 1 critical, 1 important, 1 minor | the blank-line counting bug |
| 7 | 1 | the client typecheck reaching into `client/out` |
| 8 | 1 important | six documents still saying "nine harnesses" |
| 9 | 2 minor | `/setup` prose that did not say the page is curl-only |
| 10 | 1 minor | two cost paragraphs under the wrong heading |
| 11 | 1 critical, 1 important, 1 minor | the pairing token in the log; Step 5 untested; a dead query-string strip |
| 12 | 1 important, 5 minor | a Step 3 sweep that swapped one broken pointer for another; four accuracy corrections to this ledger |

Task 12: fix round 1 (1 important, 5 minor; commits `b09a801..04d6b16` plus the one that added this
line); `scripts/line-ceiling.ps1` green at 527 files and all eight of the plan's Step 3 greps re-run
with no new hit; 0 mutations confirmed failing, because all six findings are prose accuracy in two
committed documents and nothing executable changed. The sixth, `2026-09-07-sprint-dragon-slayer.md`
line 42 still reading "needs a plan", is handed back to the orchestrator with the board row rather
than edited here, for the reason that spared the board.

Task 12: fix round 1 re-review (sonnet): 6/6 ADDRESSED, no breakage. Task 8's pointer now names
`cd web && npx tsc --noEmit -p tsconfig.test.json` inline in both the Files and Interfaces bullets,
and the identical phrase this replaced (`wrote into the SDD workspace`, `error list Step 4 below`)
is gone from the plan by `git grep`. The commit range reads `55475f2..b09a801` with the fix round
named after it. Section 5's `126 across the eleven tasks, plus 5 negative controls` recomputes
correctly against section 1's own per-task figures (using each task's primary confirmed-failing
number, the same convention that produced the pre-fix `127`: 12+18+13+14+15+16+7+10+6+8+7 = 126).
The C07 row's `Left open` cell now points at section 5 for the unbuilt image, matching C09's row.
Finding 6 is answered in the handback text, not by an edit, which is what was asked. Re-ran
`scripts/line-ceiling.ps1` (527 files, none over 400, ledger 314 lines) and all eight Step 3 sweep
greps (no new hit outside the historical documents the plan already excuses); `git diff
b09a801..f385583` carries zero em dashes and both commits end in the exact two-line trailer. No
suite run: the diff is two markdown files, matching the fixer's own claim.

entry 2: final whole-branch review (fable): clean (ship), 1 important, 3 minor, 0 critical. Seven
mutations run, seven killed, the tree restored byte for byte; `verify.ps1` green end to end at
`b81c973` (line ceiling 527 files, overlay 37 entries with no drift, engine 134/0, client 110/0,
server 261/0, web 1,487 across 134 files, firebase 29/0, wiki 121 pass / 1 skip, wiki.db 132.3 MiB,
Playwright 27 passed / 5 skipped). Constraint sweep over `55475f2..HEAD`: no em dash and no `as any`
in any added line, no secret-shaped literal, no protected path. Checked and accepted without a
finding: every `cs.` literal in `web/src`, the migration's three edge cases (signed-out mirror, two
accounts on one browser, a stale bare key), the reload of both stores on an identity change, the
three boot failure paths, every gate's floor against a vacuous green, and `Get-HealthGaps` by hand.
The mutation table is in the SDD workspace ledger.

- important (docs): `docs/ARCHITECTURE.md:347`, `.claude/skills/idlescape-plugin/SKILL.md:35` and
  `.claude/skills/idlescape-library-script/SKILL.md:55` still list the persisted keys as
  `cs.plugin.<id>` and `cs.script.<id>`; the shape has been `cs.<ns>.u.<uid>.<id>` and
  `cs.<ns>.anon.<id>` since `5529925`. Three one-line edits pointing at `web/src/storage/scoped.ts`.
- minor (ledger): the C16 row in section 2 says closed and names only the exemptions as left open;
  the audit's proposal also asked for the `ownerBank.ts` split (394) and an `api.ts` seam (393)
  before entry 4, and neither happened. One clause in that cell.
- minor (code, pre-existing): `web/src/main.ts:58-59` read `localStorage` unguarded at module scope,
  so a storage-blocked browser still blanks the page before `createBoot` runs. Wrap the two reads.
- minor (docs, pre-existing): "21 Playwright specs" at `docs/VERIFICATION.md:88` and
  `docs/ARCHITECTURE.md:349`; the gate runs 27 passed / 5 skipped.

**The fix wave (`f945e28`), run at landing.** All four findings closed in one commit. Landing found
the wave had not run, and the sprint row it was about to write says "fix wave done", so it ran
rather than closing the entry on a sentence that is not true: the important finding is the
persisted-key inventory `docs/ARCHITECTURE.md` constraint 2 holds, which is what entry 4's C21 KEYS
work gets written from, and parking it would have seeded the next entry from a falsehood. What each
got: the three inventory lines now name `cs.plugin.<scope>.<id>` and `cs.script.<scope>.<id>` and
point at `web/src/storage/scoped.ts` as the authority for the shape and for which `cs.` keys are
deliberately still bare; `web/src/main.ts`'s two module-scope reads go through a guarded `readPref`
while the setters stay bare, because a throw inside a handler costs one settings change rather than
the page; the C16 row above carries its missing clause; and both stale Playwright counts become 27
passed / 5 skipped, with the same sentence's 1,092 unit tests corrected to the measured 1,487.
**No mutation table:** five of the six files are prose and the sixth is a guard on the one scope R7
already records as unreachable from jsdom, which is why the reviewer filed it as untestable. The
gate is the verification instead, re-run end to end at `f945e28`: `scripts/verify.ps1` exit 0,
`verify passed`, all ten steps, `logs/verify-entry2-final.log`. Line ceiling 527 files none over
400; overlay -Check clean over 37 manifest entries against clone HEAD `1d25566` with 34 paths
tracked; engine 134 pass 0 fail; client typecheck clean; server green with the emulators up; web
typecheck across three programs, lint 0 errors with the same 2 pre-existing warnings, vitest 1,487
across 134 files; firebase rules 29 pass; wiki green; build.ps1 green with `wiki.db` at 132.3 MiB;
Playwright 27 passed / 5 skipped in 5.8m. The two e2e screenshots the run rewrote were restored
with `git checkout --`, and all five stack ports were free before and after.

**Deferred minors, all deliberate:**

- Two eslint warnings in `web/`, pre-existing at BASE and in files no task touched. Every task
  reported "0 errors, 2 pre-existing warnings" rather than quietly folding them into an unrelated
  commit.
- `web/src/main.ts:80`'s pre-existing em dash, parked by Task 1 so it would not enter a commit a
  reviewer had to gate for a data leak, and removed by Task 2, which owned that file.
- The Playwright half of Task 1 (`web/e2e/plugins.pw.test.ts` and `helpers.ts`'s `scopedItem`) was
  deferred by the plan to this task's gate run, where it ran green.

---

## 5. The numbers, measured

| What | Value |
|---|---|
| `verify.ps1` steps | 10, all green, from a tree clean but for the orchestrator's two live files |
| `verify.ps1` wall clock | 8m 45s on this machine (22:01:54 to 22:10:39), against the plan's roughly 25 minute budget. Playwright is 5.8m of it and step 9's build, including the wiki database, is most of the rest |
| `line-ceiling.ps1` | 527 files scanned, none over 400 |
| Web test typecheck backlog | 107 errors across 27 files when Task 7 opened the program; 0 after Task 8, across all three web programs |
| Client fork typecheck | exit 0 over exactly 123 files under `client/src`, 0 under `client/out` |
| Engine overlay | 34 overlay files, 37 manifest entries checked, no drift, all 34 paths git-tracked |
| Engine tests | 134 pass / 0 fail |
| Client tests | 110 pass / 0 fail across 13 files |
| Server tests | 261 pass / 0 fail across 28 files |
| Web tests | 1,487 pass across 134 files |
| Wiki tests | 121 pass / 1 skip / 0 fail, 122 across 31 files |
| Firebase rules | 29 pass across 1 file |
| Playwright | 27 passed, 5 skipped, 0 failed, in 5.8m, from `web/` against a freshly built 274 stack. Includes the plugin-scoping spec Task 1 deferred to this run |
| Wiki reader database | 138,756,096 bytes, 132.3 MiB, from 827,274 spawns and 9,074 pages |
| Server image size | **not measured**, see below |
| Mutations confirmed failing | 126 across the eleven tasks, plus 5 negative controls: 4 in Task 6, and Task 7's include-glob mutation, which stayed caught (section 1) |

**The server image was never built, and that is this entry's one real gap.** Docker is not installed
on this machine: nothing on PATH, no `C:\Program Files\Docker`, no service, and `wsl.exe -l -v`
reports WSL absent, so Docker Desktop would need WSL plus a reboot, a side effect outside this
repository. Task 5 ruled to continue with the strongest available substitute rather than stall the
entry, and made it real rather than a claim: both `RUN` guards extracted verbatim from the
Dockerfile and executed under `sh` against the real 132.3 MiB database and three negative cases; the
image's exact wiki chain (`bun run extract && bun run build`) run locally; a structural read of all
five stages; and `docker-compose.yml` parsed with `Bun.YAML.parse` to assert the `server` service's
`CONTENT_SHA` is byte-identical to the `engine` service's. 32 assertions, all passing. **What no
static check proved:** that BuildKit accepts the file, that `oven/bun:1` carries `stat` and `git`,
that the extract fits the builder's memory, and that the roughly 132 MiB layer copies. The first
image build is still the acceptance test, and it happens under G5.

---

## 6. What this entry does not close

Said out loud so a green gate does not imply it:

- **Nothing has been released.** The gate can go green for the first time since D75 made it require
  the wiki. Running it is G5, an owner action, and it has not been done. The live box is still the
  one where `/wiki` 503s.
- No image has been built from this tree (section 5).
- The content overlay's presence in the engine image has no health field, and
  `scripts/content-overlay.ps1 -Check` exits 0 even on drift. **Entry 3.**
- Nothing compares either pinned clone's sha to `scripts/upstream.lock` at build time (**entry 3,
  audit C23**), and the client fork's 28 numbered patches are still verified by hand (**entry 3,
  audit C24**).
- Nothing ties a deployed image to a commit that passed `verify.ps1`.
- The `cs.` keys next to the two this entry scoped are still unscoped (R4, D100). **`cs.pl.<id>.<k>`
  is `PluginContext.storage`, it is on exactly C10's defect, and the first plugin that reaches for
  `ctx.storage` must scope it through `web/src/storage/scoped.ts`.**
- `deploy/lightsail/provision.ps1` still writes the box's `server.env` from a hand-kept list rather
  than deriving it from `server/.env.example`. The test makes a silent omission impossible, which is
  the failure that mattered; the two lists are still two lists.
- Measured counts in prose (ten harnesses, 134 test files, 123 client files) are guarded by nothing
  mechanical. Task 8's review caught one drifting; the next one will need another reviewer. Guarding
  all of them together is a decision for an audit, not for a fix round.

---

## 7. Traps recorded

- **jsdom arms a timer on every `localStorage` write.** Any timer assertion near a migration that
  writes N keys must be a delta, never an absolute. `web/src/tasks/toggles.test.ts:159` and `:166`
  are the worked example.
- **`web/src/test/setupDom.ts` runs once per file, not per test, and does not touch `localStorage`.**
  A storage suite clears it in its own `beforeEach` or it inherits keys from whatever file ran above.
- **`git grep -P` for an em dash fails in this Git Bash** ("supports only unibyte and UTF-8
  locales"). Scan for U+2014 with a small Python pass over the touched files instead.
- **`Get-Content | Measure-Object -Line` does not count blank lines.** It drops empty strings from
  the pipeline. Anything measuring a file against eslint's `max-lines` has to count them.
- **A pairing token is a path segment, not a query parameter.** `classify()` in
  `server/src/router.ts` returns it out of the path. Anything that logs a path must redact it.
- **Leftover Firebase emulators hold 8080 and 9099** and will fail this gate's own stack at step 10.
  Check the five ports before a run, not after.
