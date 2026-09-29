# Overlay, pack and client-fork gates - ledger

Sprint entry 3, audit findings C22, C23 and C24. The authority for the entry is the plan,
`docs/superpowers/plans/2026-09-07-overlay-pack-and-client-fork-gates.md`, over
`docs/superpowers/specs/2026-09-07-project-audit.md` section 2.6 and over decisions D32, D95,
D102, D115 and D116. Ten tasks, one implementer and one reviewer each, on `sprint/dragon-slayer`
from BASE `1093a78`; commit range `4dbbf56e1bcd336f37c1b177ee8ea44931a6d759..HEAD`.

The entry in one sentence: the three machineries that are supposed to keep this repository honest
could not fail, and now they can, inside `npm run verify`.

---

## 1. What shipped, per task

| Task | Commits | What landed |
|---|---|---|
| 1 | `d8244f0`, `eda564d` | `content-custom/pack/obj.pack` (3894 lines), `inv.pack` (217), `loc.pack` (4671), read out of the pinned content clone; `content-custom/manifest.json` gains `base` and a `kind` per entry; `.gitattributes` gains `*.pack text eol=lf` |
| 2 | `df28e17`, `432e6bb` | `engine-custom/src/idlescape/packIds.ts`, the sprint section 3 table in code (`parsePack`, `checkPack`, `SHIPPED_IDS`, `ALLOCATED_IDS`, `UPSTREAM_TAIL`), and `packIds.test.ts`, 12 cases |
| 3 | `6f7c950`, `840b3d3`, fix round 1 | `checkPack` before and after `packAll` on both call sites (`engine-custom/tools/pack/BuildOverlay.ts`, `engine-custom/src/app.ts`; `app.ts` had only the before-call until fix round 1 gave it `assertPackIds('after packing')` and the shared `checkPackDir` scan, per plan R5); `deploy/docker/engine.Dockerfile` fails the image build if `world.json` ever carries a `verify` key |
| 4 | `7f17658`, `ef6498e` | `scripts/lib/OverlayHash.ps1` extracted from `engine-overlay.ps1`; `content-overlay.ps1 -Check` reads the upstream blob and **exits 1**; `verify.ps1` step 2 runs both applies, both drift checks and a two-manifest tracked check |
| 5 | `46c5780`, `57e3eb6` | `scripts/lib/UpstreamLock.ps1` (`Read-UpstreamLock`, `Assert-ClonePins`); every native call in `setup.ps1` and `start-stack.ps1` has its exit code read; `start-stack.ps1` **throws** on a dead or silent engine; one stop contract, `taskkill /T` first and `/T /F` five seconds later, carried by `Stop-Tracked` (`start-stack.ps1:41`) and by its counterpart `Stop-ProcessTree` (`verify.ps1:51`), two functions rather than one shared helper |
| 6 | `ccfa711`, `46428d3` | `Sync-OverlayRemovals` and the `.overlay-manifest` sidecar in each clone root; an overlay source file in no manifest is a hard failure |
| 7 | `7750da3`, `bceb1c8` | `scripts/patches-check.ps1`: the typed row grammar, `Assert-PatchMatching`, the per-record floor, the coverage set; `client/PATCHES.md`'s six `sh` fences converted, patch 9 given its row |
| 8 | `42de85f`, `8df6d5b` | The engine record and both vendored records added to the runner; `scripts/upstream.lock` gains `client-import` and `rs-sdk`; the pristine-274 diff of `client/` against the import commit; the rs-sdk cross-check |
| 9 | `3562c5a`, `5b8b0e0` | `scripts/build.ps1` asserts the bundle is minified and that the seven reserved hook names survived terser; the same pair mirrored into `deploy/docker/server.Dockerfile`'s `client-build` stage; `docs/OPERATIONS.md` section 10, the revision-bump procedure |
| 10 | `d0055da`, `f62fbd9` | The full gate twice, the document sweep, the audit reconciliation, this ledger |

Planning commits above BASE: `a4815ba`, `296edae`, `4dbbf56`. Four commits inside the range belong
to plans running beside this entry, the time candy plan (`2249455`, `018babf`) and SP8c
(`496794b`, `be1069e`); they are not this entry's.

After Task 10 the branch close added four commits: the whole-branch review's fix wave (`2b1fe3f`),
the fix wave's re-proof and reflow (`1123cea`), its re-review (`c391c81`), and this promotion.

## 2. The rulings, as made, with what each cost if wrong

The plan's sixteen rulings (R1 to R16) stand as written; D103 to D108, D115 and D116 carry the ones
that cross entries. What follows is what the implementers ruled on top of them.

| Ruling | Cost if wrong |
|---|---|
| T1-1: plan step 9's `content-custom/README.md:55-60` anchor is stale; only the replace-entry count clause was corrected, the drift-check contract wording left for Task 4 | One clause in a paragraph Task 4 rewrote anyway |
| T1-2: the plan's "the clone's working tree is CRLF on this machine" is false, because `engine/content/.gitattributes` carries `*.pack text eol=lf` upstream; the copy was proved by removing the three destinations from the clone first | Nothing to the shipped bytes; a later reader trusting the plan over a measurement |
| T1-3: `content-overlay.ps1 -Check` still self-reported `pack/varp.pack` as drifted and still exited 0; left standing for Task 4, which is the task that closes it | The gap stays open for three tasks, with the record written down |
| T3-1: the plan's Step 4 supplies the wrong Dockerfile comment wording verbatim, so the tree differs from the plan text at that plan's `:903`; the plan was left unedited, being the entry's authority and its history | A later reader diffs the plan against the Dockerfile and re-introduces the wrong sentence |
| T4-1: `engine-custom/PATCHES.md:553-556` and `:577-579` are corrected in Task 4, though the plan's file table assigns that file to Tasks 2, 3 and 8; both state as present-tense fact exactly what Task 4 changes, which is the C23 defect class the entry exists to remove | One extra file in a commit Task 8 also edits, in a different region, so a rebase conflict is the worst case |
| T4-2: new blocks keep each overlay script's own two-space indentation rather than the plan's four-space listing, so neither file ends up mixed; `scripts/lib/OverlayHash.ps1` is four-space | Cosmetic |
| T4-3: `Get-ByteSha` carries `[AllowEmptyCollection()]` beside `Mandatory`, because a Mandatory collection parameter refuses an empty array outright and a zero-byte upstream blob is legal | None; the attribute only widens what binds |
| T4-4: `Assert-OverlayHashing`'s git fixture runs under a local `$ErrorActionPreference = 'Continue'` restored in `finally`, because both callers run under 'Stop', where `git init`'s stderr is a terminating error and the self-test dies building its own fixture | A git failure inside the fixture is reported by the explicit `$LASTEXITCODE` check rather than by its own message |
| T4-5: `content-custom/README.md` gains one paragraph beyond the plan's replacement text, naming `OverlayHash.ps1` and its self-test and carrying the hash-recovery command with `-c core.autocrlf=false`, which the command it replaced omitted | Two extra lines of accurate prose |
| T5-1: R16's polite `taskkill /T` is REFUSED by the engine, not ignored, and under 'Stop' its stderr terminates, so the plan's single `try`/`catch` around both phases skipped the wait AND the `/F` escalation; restructured to a per-phase catch with 'Continue' set locally | None behavioural, both phases still run in order; leaving it wrong left `verify.ps1` step 10 leaking a running engine for the rest of the session |
| T5-2: the five second wait is spent only when at least one ask returned exit 0, because every ask is refused today and R16 as written would have cost five seconds per stop and bought nothing (measured: plan shape 6.2 s, shipped 1.2 s) | A process that would have closed cleanly but whose tree makes taskkill report non-zero gets `/F` immediately, which is what HEAD did to everything |
| T5-3: `$engineProc.ExitCode` is EMPTY on Windows PowerShell 5.1 even after `WaitForExit()`, so the throw prints `code unknown` and names `logs/engine.err.log`, where the engine's stderr now goes | One more file in the git-ignored `logs/`, and an operator running `npm run dev` no longer sees engine stack traces inline |
| T5-4: two present-tense sentences Task 5 falsified (`docs/VERIFICATION.md`'s `taskkill /T /F` finally, `docs/OPERATIONS.md`'s ten-second wait and its log list) are corrected in Task 5 rather than deferred; the stack skill's copy of the claim is left for Task 10, which owns the skills | Task 10 finds two of its sweep targets already correct |
| T5-5 (fix round 1): the teardown hole is closed structurally, not at the one call the review found: `Stop-Tracked` moves above the FIRST `Start-Process` and everything from the emulators onward runs in a `try` whose `catch` tears down and rethrows, the two engine throws losing their own calls because two owners is how the next one gets forgotten | A future throw in that region that wants the stack LEFT running has to move out of the `try`; nothing in the file wants that |
| T6-1: the broken-git self-test fixture writes a `.git` **file** holding `gitdir: ./not-a-directory` rather than leaving no `.git` at all, because git walks upwards and a temp directory inside a repository would take the other branch | The self-test exercises a slightly different git failure; both land in the throwing branch, so the cost is a false alarm on an apply and never a silent deletion |
| T6-2: the empty-directory residue after a removal is left as is, with a comment saying so; pruning upwards is how a script removes more than it meant to | One empty directory per removed overlay subtree, in a git-ignored clone `setup.ps1` recreates |
| T6-3: the three `engine.Dockerfile` copy-list divergences are recorded, not closed | The divergence stays open, with a written record of exactly what it is |
| T6-4: `Assert-OverlayRemoval`'s fixture git calls run under the same local 'Continue' as `Assert-OverlayHashing` eighty lines above, which the plan's listing omitted | None; the exit code, not the stderr, is what the fixture check reads |
| T6-5: every call site wraps the result as `@(Sync-OverlayRemovals ...)`, because PowerShell unrolls a returned array and `$removed.Count` would answer 0 for a single removal | `@()` around an array is a no-op, so the reverse cost is zero |
| T6-6: the self-test's restore assertion moved ABOVE its deletion assertion and a third apply was added, asserting that a repeat run with the same empty source set removes nothing; that third apply is what pins the sidecar rewrite | Two extra assertions in a self-test that runs in about a second |
| T6-7: both README "How it is applied" paragraphs get their skip-list sentence corrected too, not only the removal sentence; the list is four names, and after Task 6 both scripts skip them at ANY depth | One sentence in each README |
| T7-1: `ConvertTo-PatchRows`'s `$Lines` takes `[AllowEmptyString()]`; PowerShell 5.1 rejects an array containing an empty element for a plain mandatory `[string[]]`, so the parser died on the first blank line | None found; a blank line is skipped by the loop anyway |
| T7-2: `docs/VERIFICATION.md`'s honesty paragraph was rewritten whole rather than edited by one clause, because all three of its claims had gone false | One paragraph, and Task 10 read the file again |
| T7-3: the four rows replacing the four-name absence alternation are tagged `not-vendored`, not `patch 17`; only `patch <n>` tags feed the coverage set, and an absence check must not make a present-tense patch look proven | Four tag strings |
| T7-4 (fix round 1): the content-overlay contradiction the reviewer raised is fixed in Task 7, touching only the three statements this task made false (the tier 3 row, false green 1's opening, the release-gate bullet's "exits 0 even on drift"), the structural sweep left to Task 10 | Task 10 rewrites three sentences it was going to rewrite anyway |
| T8-1: the two vendor pin rows are `startswith` over the whole provenance line, not a `contains` count of 1; once the fence lands the row carries the sha itself, so a `contains` count is 2 and the row would be counting itself | The cross-check still closes both ways; a wrong mode here is one word |
| T8-2: the pristine block dot-sources `Read-UpstreamLock` from `scripts/lib/UpstreamLock.ps1` instead of re-implementing the plan's inline eight-line lock parser, which silently skipped a malformed line where the library rejects it | One dot-source line to undo, and `patches-check.ps1` gains a dependency `setup.ps1` and `start-stack.ps1` already require |
| T8-3: the stray-file proof used a DANGLING commit built with `git commit-tree` against a throwaway `GIT_INDEX_FILE`, not a scratch branch, because the brief forbids branch switches and `git reset` is unsafe while another agent may commit beside this one | The proof is one step removed from "someone commits a stray file", which is the same diff either way |
| T8-4: `docs/VERIFICATION.md`'s honesty paragraph is corrected in Task 8, outside its file list, because `:99-102` said in as many words that the record is a fence "that no script runs", which this commit makes false; only the falsified sentences moved | Task 10 rewrites one paragraph it was going to read anyway |
| T8-5: the engine fence's heading says "two anchors and two rows into the content clone", not the plan's "six of them target upstream files the overlay does not replace", which is not reproducible from any grouping of the 44 rows | One sentence |
| T8-6: the printed pristine line reports the stray count when there is one, instead of the plan's unconditional "all inside the numbered-patch set", which is false on exactly the run a reader is looking at | Three lines of script |
| T9-1: docker is not installed in this tree, so the new `server.Dockerfile` reserved-name gate was proved by extracting the `RUN` body verbatim and running that exact text under `/bin/sh` against four artifacts plus an empty file | A shell difference in a future base image surfaces as a failing release build, which is the safe direction; the first real `docker compose build` confirms it |
| T9-2: the plan's mutation C says `...@()`, which is PowerShell syntax and a TypeScript syntax error; `...[]` was used, which is what the plan meant | None; a mutation that was reverted and hash-confirmed |
| T9-3: three plan anchors were re-measured and the shipped prose differs: terser's `reserved` list closes at `client/bundle.ts:184`, not "roughly :160"; `client/src/vendor/PATCHES.md`'s second table has six rows, not eleven; `docs/OPERATIONS.md` step 6 cites `client/PATCHES.md` by section heading rather than by the plan's stale line numbers | A reader lands in the wrong place; nothing mechanical reads any of the three |
| T9-4: the verify skill points at its own "Numbering is at 28" claim by quoting it rather than by the plan's `:9-10`, which is the pinned client sha | A reader looking for the high-water mark reads the sha line instead |
| T10-1: the audit's "Remediation status" is a bullet list, not the table the plan's Step 6 snippet assumed. The row was appended in the existing bullet shape | A reader looking for a table finds a bullet that says the same thing |
| T10-2: `docs/VERIFICATION.md`'s false greens 1 and 2 were already marked CLOSED in place by Task 5. Task 10 moved them into a "Closed false greens" section below the live list, each with its closing commit, and the survivors keep numbers 3 to 11, so the live list starts at 3 | A session quoting "false green 5" from an older copy still lands on the same trap; the cost of getting this wrong is a renumbered quotation |
| T10-3: the sprint spec's entry 3 State cell is **not** closed here. Task 10 is the last implementer task, not the branch close; the whole-branch review and its fix wave come after | The board and the spec row read "in flight" for one more step, which is what they are |
| T10-4: `scripts/upstream.lock` came back from `git checkout --` with CRLF line endings after Task 10's mutation, because it is covered by `.gitattributes`'s `* text=auto` and had never been re-checked-out. It was left that way: git reports the file clean, and `Read-UpstreamLock` was re-run and parses it correctly | A `.lock` whose working-tree bytes differ from the previous working-tree bytes while the blob is identical; if a future parser starts comparing raw bytes it breaks, which is why the re-run is recorded here |
| T10-5: several swept documents said `.gitattributes` carries `*.pack -text`, which is what plan R2 proposed; the file carries `*.pack text eol=lf`, landed by `eda564d` because `-text` closes only the checkout half and entries 10 and 11 append lines by hand. Every occurrence was corrected to the shipped rule | None; it is what the file says, verified by `cat` |

## 3. Measurements

Numbers taken on this machine, not read out of a document.

- **The CRLF hazard, both hashes.** A fresh Windows checkout of `content-custom/pack/varp.pack`
  through `git checkout-index` landed CRLF at sha256
  `a9a0c12222be811551cd40c4769727cf6a5d0b8869b858cf3ec7062ff5e29e9f` with 368 CR bytes, while the
  working-tree file was LF at
  `9400a824ff0dab2634ca6d40e6f7d331962923a85f1826723ee4e1380d9ab39b` with 0. After `*.pack text eol=lf`
  the same round trip hashes `9400a824...` on both sides with 0 CR bytes. This is why the entry
  brief's "content hash" was replaced by the prefix-plus-tail assertion (R4): a byte hash of a
  tracked `.pack` was not stable across checkouts.
- **The three pinned packs**, blob sha256 in manifest form: `obj` 3894 lines, last line
  `3893=wearable_stool_white`, `358E01A1...`; `inv` 217 lines, `216=boardgames_sideinv`,
  `841D9E89...`; `loc` 4671 lines, `4670=statue_herosguild2`, `326B4B80...`.
- **The bundle, both figures.** `bun run build` writes `client/out/client.js` as 403829 bytes on
  **one** line, so 403829 bytes per line; `bun run build:dev` writes 1086581 bytes over 32968
  lines, so 32. The floor of 200 sits three orders of magnitude below prod and six times above dev,
  and needed no adjustment. All seven reserved names are present in both bundles, which is why the
  minification test has to run before the name test.
- **The runner's printed counts**, from the gate: `client/PATCHES.md` 69 assertions across 29
  numbered patch rows, **numbering is at 28**; `engine-custom/PATCHES.md` 44;
  `client/src/vendor/PATCHES.md` 3; `web/src/vendor/PATCHES.md` 2. 118 rows in total, against the
  104 hand-run grep lines the audit counted. `client/` differs from the 274 import commit in 32
  paths, all inside the numbered-patch set. The 29-versus-28 gap is `21b`, a real row that is not a
  new number, which is exactly why R7 prints the maximum id rather than the row count.
- **`map.pack` is 966 lines** in the pinned clone. `vars.pack` does not exist at the 274 pin.

## 4. Mutations

Forty seven mutations were confirmed failing by the nine implementers, and every reviewer re-ran a
subset independently plus mutations of its own. Per task: 3, 9, 3, 6, 6, 7, 5, 5, 3. Each was
restored byte for byte and confirmed by hash. The ones worth carrying forward:

| What was broken | What failed |
|---|---|
| `engine/content/pack/varp.pack`'s `367=banktab_size_9` renumbered to `368=` | `BuildOverlay.ts` exit 1 in about a second, **before** packing: `varp.pack: id 367 must be "banktab_size_9", found no line`. The same mutation through the engine's own boot path exits 1 with no `Starting world` and no port bound |
| A recorded `baseSha256` in `content-custom/manifest.json` mutated | `verify.ps1` step 2 dies with `content overlay drift check failed (exit 1)`. Before this entry the same mutation printed a note and exited 0 |
| `scripts/upstream.lock:5` changed by one character | `verify.ps1` dies at step 2 naming both shas, exit 1, **before any overlay applies** |
| `Read-UpstreamLock`'s empty-lock throw deleted | `Assert-LockParsing` fails with the all-comment message |
| The `$failures.Add` for a missing target file removed from `Measure-PatchRows` | `Assert-PatchMatching` reports the expected-set mismatch and exits 1. This is the proof that a missing target file is a failure and never a skip |
| `client/PATCHES.md` left with its six `sh` fences unconverted | `client/PATCHES.md parsed 0 assertion(s), floor 60`, exit 1. The floor is what stops an empty parse reading as green |
| `Client.ts`'s `hooksEmitter` renamed | `client/PATCHES.md:67 [patch 2] expected 1 got 0` |
| The `patch 9` row deleted | The coverage assertion names patch 9 as uncovered. This is the missing proof the audit's C24 found by hand |
| A stray file added under an overlay source tree with no manifest entry | The apply exits 1 naming it, leaving nothing in the clone |
| `'getObjIcon'` deleted from `client/bundle.ts`'s terser reserved list | `build.ps1` exit 1: the minified bundle no longer contains `getObjIcon` |
| `client/out/client.js` pointed at a copy of the dev bundle | `build.ps1` exit 1 at the bytes-per-line floor, 33 bytes per line |
| `world.json.template` given `"build": { "verify": false }` | The Dockerfile's own clause exits 1 under `sh`, and 0 on the template as shipped |

Task 10 re-ran two of them against the tree at HEAD, as the proof that the gate as committed can
still fail: `scripts/upstream.lock:5` mutated by one character sent `powershell -File
scripts/verify.ps1` to exit 1 inside step 2, before any overlay applied, naming both shas; and the
`patch 9` row's expected count changed from 1 to 2 sent `scripts/patches-check.ps1` to exit 1 with
`client/PATCHES.md:81 [patch 9] expected 2 got 1`. Both restored, `client/PATCHES.md` hash-confirmed
identical, both checks re-run green.

## 5. The gate

`powershell -File scripts/verify.ps1`, run twice, before and after the sweep, and a third time in
fix round 1. Ten steps, all green, 27 Playwright specs passed and 5 skipped by design, about 25
minutes each. Step 2's output verbatim from the fix-round run, which is the committed state; the
two earlier runs printed the same block with 44 engine assertions rather than 47:

```
== [2/10] engine and content overlays (pins, apply, drift)
  engine/server and engine/content match scripts/upstream.lock.
engine-overlay: 36 overlay file(s), 0 copied, 36 unchanged.
engine-overlay -Check: 39 manifest entry(ies) checked against the clone's pinned blobs (HEAD 1d25566cb53e7af1b1cb18ade8af996316c19614).
  no drift detected.

== [2/10] (cont.) content overlay (apply + drift check)
content-overlay: 5 overlay file(s), 0 copied, 5 unchanged.
content-overlay -Check: 5 manifest entry(ies) checked against the clone's pinned blobs (HEAD 2b62ae68dfed02b441bae47987a01d6bcbaeb358).
  no drift detected.

== [2/10] (cont.) overlay manifest paths are git-tracked
  41 manifest path(s) tracked across 2 overlay(s).

== [2/10] (cont.) patch records (scripts/patches-check.ps1)
  client/PATCHES.md: 69 assertion(s) across 29 numbered patch row(s); numbering is at 28
  engine-custom/PATCHES.md: 47 assertion(s)
  client/src/vendor/PATCHES.md: 3 assertion(s)
  web/src/vendor/PATCHES.md: 2 assertion(s)
  client/: 32 path(s) differ from the 274 import, all inside the numbered-patch set.
  rs-sdk: scripts/upstream.lock and both vendor records name the same sha.
patches-check: every assertion holds.
```

Step 1 reports 532 files scanned, none over 400. `$TotalSteps` is still 10 (R11), so no prose line
that quotes the step count was falsified by this entry.

### What this entry asserted rather than redid

C22's sharpest claim was true when the audit landed and went false twenty three minutes later.
Three greps, run at HEAD:

- `grep -n "RUN npx tsx tools/pack/BuildOverlay.ts" deploy/docker/engine.Dockerfile` returns one
  hit, at `:154`.
- `grep -n "npm run build" deploy/docker/engine.Dockerfile` returns `:49`, `:145` and `:152`, all
  three inside comments explaining why the pack line is **not** `npm run build`. There is no
  `RUN npm run build` in that file.
- `grep -n "tsconfig.check.json" scripts/verify.ps1 client/package.json` returns
  `verify.ps1:229` and `client/package.json:12`, which is entry 2's client typecheck, not this
  entry's.

`ca8ef86` replaced that Dockerfile line under D73 and D74 at 14:35 on 2026-09-07, twenty three
minutes after the audit landed at 14:12. The sprint spec repeated the claim in two places and is
corrected by this task; per D97 the audit is not rewritten and gains a remediation row instead.

## 6. What this entry does not close

- **The eight header-only vendored files** in `web/src/vendor/PATCHES.md:17-24` still carry no sha
  pin, so nothing proves those eight are still upstream's bytes. The runner asserts the two rows
  that do have pins and cross-checks the `rs-sdk` sha against `scripts/upstream.lock`; the other
  eight are provenance headers only.
- **Nothing ties a deployed image's patches, clone shas or pack ids to a verified commit.** That is
  the surviving half of three `deploy/lightsail/README.md` bullets. The build machine is covered;
  the box is not, and there is still no health field for the content overlay.
- **`verify.ps1` still ends with an unminified `client/out`.** `build.ps1` at step 9 asserts a
  minified bundle, then step 10's `start-stack.ps1 -Prod` runs an unconditional `bun run build:dev`
  and overwrites it, so Playwright never exercises the artifact that was checked. R12 put the
  assertion inside `build.ps1` precisely because nothing after step 9 can read the right file.
- **The six allocated ids are asserted conditionally** (R4): if the id line exists its name must
  match, and if the name appears its id must match. Neither half asserts presence, because the
  names do not exist yet. They become positive assertions when entries 10 and 11 append.
- **`client/.upstream-git` is created by a procedure, not a script** (R13). `docs/OPERATIONS.md`
  section 10 carries the literal `git clone --bare` line a bump needs.
- **`map.pack` is not pinned** (D116). The sprint spec says the battlebots entry also appends to it
  and `content-custom/pack/` has no copy, so entry 11 meets the wall this entry removed for `obj`,
  `inv` and `loc`. It is out of scope here because section 3's table allocates ids only in `obj`,
  `inv`, `loc` and `varp`, and R4 pins by that table. Measured: 966 lines in the pinned clone.
  Pinning it is one `git show` and one `UPSTREAM_TAIL` row with no allocations. The same sentence
  names `vars.pack`, which **does not exist at the 274 pin**; that is a spec error entry 11 has to
  resolve, not a missing pin.
- **The lock's `client` row is read by no gate.** `Assert-ClonePins` iterates `engine/server` and
  `engine/content` only, because `client/` is a tracked directory rather than a clone with a HEAD
  to read. What stands in for it is `client-import`, which `scripts/patches-check.ps1` diffs
  against; the `client` row stays prose that only the revision-bump procedure reads. The `rs-sdk`
  row **is** enforced, by Task 8's cross-check.
- **The empty-directory residue** after an overlay removal (ruling T6-2) and the **three
  `engine.Dockerfile` copy-list divergences** (ruling T6-3) are recorded, not closed.

## 7. Traps, for the next session

- **The CRLF hazard.** `.gitattributes:1` is `* text=auto` and `core.autocrlf` is true, so a fresh
  Windows checkout of a `.pack` lands CRLF. The engine's `Parse.ts` splits on `/\r?\n/` and parses
  it fine, but `PackFileBase.save()` joins with `'\n'` and rewrites the file to LF, the sha-delta
  guard then sees the pack move, and the build exits 1 **accusing you of renumbering obj ids**. The
  symptom of this bug is a false accusation of data corruption. `*.pack text eol=lf` closes both
  directions, the `git add` and the checkout, where a bare `-text` would close only the checkout
  half; entries 10 and 11 append `<id>=<name>` lines to these files by hand, which is why the add
  half matters. Do not remove that line, and do not "fix" a `.pack` by re-saving it through an
  editor.
- **The `after:<n>` row depends on the row above it.** In the `patches-check` grammar, `after:<n>`
  counts inside the `n` lines following the previous row's match, so reordering rows silently
  changes what an `after` row asserts. Keep such a pair adjacent.
- **`$ErrorActionPreference = 'Stop'` does not catch a native command's exit code.** A non-zero
  exit from `git`, `npx` or `taskkill` does not throw, and a `.ps1` invoked with `&` that runs
  `exit 1` sets `$LASTEXITCODE` without throwing either. Read the code, or wrap the call in
  `Invoke-Native`. Native **stderr** is not an error either; do not redirect it with `2>&1` under
  PowerShell 5.1, which wraps each line in an ErrorRecord and sets `$?` false on a clean exit.
- **`exit N` inside a script called with `&`** returns to the caller rather than ending the run.
  Every such call site in `verify.ps1`, `setup.ps1` and `start-stack.ps1` now reads
  `$LASTEXITCODE`.
- **`Join-Path` takes two arguments** in PowerShell 5.1. Nest the calls, or build the path as a
  string.
- **`engine/` is anchored in `.gitignore`.** Line 8 is `/engine/`, not `engine/`, so it does not
  also match `engine-custom/src/engine/`, which is tracked and which is where the overlay's
  `PlayerLoading.ts` replacement lives. Do not clean up a file there because it looked ignored.
- **A `PATCHES.md` row is data, not a shell command.** Five fields split on the first four pipes
  only, so a literal containing a pipe survives verbatim. The old dialect had five shapes and one
  of them, an escaped table-cell pipe, read as a BRE alternation and answered 7 where 1 was meant.
  Do not paste a row into a shell; run `powershell -File scripts/patches-check.ps1`.
- **A drift check on a stale clone passes vacuously.** Both drift checks resolve the clone's own
  HEAD, so on a stale clone every recorded hash agrees with the blob it was taken from.
  `Assert-ClonePins` runs first for that reason. If you hand-check-out a clone, run `npm run setup`
  before trusting a green.

## 8. Fix round 1

Task 10: fix round 1 (3 important, 4 minor; commits `d0055da`..`f62fbd9`); `npm run verify` green
end to end again, ten steps, 532 files scanned, 47 engine patch assertions, 149 engine unit tests,
27 Playwright specs passed and 5 skipped; 3 mutations confirmed failing.

| Finding | What it got |
|---|---|
| The `ca8ef86` chronology was inverted in three sentences | `d4431af` is 14:12:02 and `ca8ef86` is 14:35:25, so the claim was **true when written and false twenty three minutes later**. Corrected in the audit's remediation bullet, in the sprint spec's entry 3 paragraph, in its change-log row 32, and in this ledger's own section 5 lead sentence, all four now carrying both timestamps |
| Three documents said `checkPack` ran before **and after** `packAll` on both call sites; `app.ts` ran it only before | The **code** moved, because plan R5 names `app.ts` explicitly. `app.ts` gains `assertPackIds('after packing')` after the hash-delta guard, the directory scan both callers had copied becomes one exported `checkPackDir` in `packIds.ts`, and four new `patches-check` rows assert all four calls. The engine record is 47 assertions, up from 44 |
| The verify skill's false-green list did not agree with the authority, and its hedge sentence was wrong twice | The skill's numbering is now the authority's, 3 to 11, same traps in the same order. The two web harness shapes it carried at 8 and 9 move up into its own tier 1 prose, where `docs/VERIFICATION.md` keeps them. The hedge sentence says what is true: every number below is the authority's |
| "ten numbered steps, six of them sub-steps of step 2" | Step 2 prints **five** (`verify.ps1:139`, `:151`, `:188`, `:192`, `:218`); the sixth `Write-SubStep`, `:258`, is the server unit tests under step 5. Both facts are now in the sentence, and sub-steps are no longer conflated with the ten |
| Two re-measured `verify.ps1` anchors overshot their blocks | `:218-226` becomes `:218-223` and `:151-186` becomes `:151-183`; the trailing lines were the next block's comments |
| "one shared helper" named a `Stop-Tracked` that `verify.ps1` does not have | There are two functions with one contract: `Stop-Tracked` (`start-stack.ps1:41`) and `Stop-ProcessTree` (`verify.ps1:51`). The stack skill and this ledger's Task 5 row now say so, with both anchors |
| The entry 3 docs commit swept ten uncommitted orchestrator board lines | Left as it landed (ruling in the progress file). Reverting another agent's board text to re-commit it identically is churn on a file this task does not own |

Mutations, each restored byte for byte and md5-confirmed:

| What was broken | What failed |
|---|---|
| `checkPackDir`'s `if (!name.endsWith('.pack')) continue` deleted | `checkPackDir > reads every .pack in the directory and never opens anything else`, on the fake reader refusing `server` |
| `checkPackDir` made to return at the first file with problems | `checkPackDir > reports every file that disagrees with the pin, not only the first` |
| `assertPackIds('after packing');` deleted from `engine-custom/src/app.ts` | `scripts/patches-check.ps1` exit 1: `engine-custom/PATCHES.md:955 [pack guard] expected 1 got 0` |

Task 10: fix round 1 re-review (sonnet): 7/7 ADDRESSED, no breakage.

## 9. Whole-branch review

entry 3: final whole-branch review (fable): fix, 3 important and 4 minor, all 7 closed in one fix wave; 11 mutations run (A to I, B three ways), 3 of them found a gate passing vacuously; every suite green before and after.

- Important, fixed: both `-Check`s skipped a `kind: "new"` entry without asking whether upstream now has a file at that path, so a replace entry relabelled `new` (measured: `pack/obj.pack`, and `src/web.ts` on the engine side) printed `no drift detected.` and exited 0 while the apply overwrote upstream on every run. Both scripts now report it as a collision and exit 1.
- Important, fixed: `engine-overlay.ps1 -Check` silently `continue`d on a replace entry whose hash was blanked and exited 0 on an empty manifest, where `content-overlay.ps1` throws on both; it throws on both now.
- Important, fixed: the pristine-274 block diffed the import commit against `HEAD`, so a stray under `client/` that was staged, untracked, or a modified tracked file passed `npm run verify` and would be committed on the strength of the green. It diffs the working tree now and adds `git ls-files --others --exclude-standard -- client/`; all three shapes fail naming the path.
- Minor, fixed: `verify.ps1` step 9 called `build.ps1` without reading its exit code (harmless today because `build.ps1` only throws; a harness with an `exit 1` stand-in continued past it). `Invoke-Native` added; the file stays at 398 lines.
- Minor, fixed: `verify.ps1`'s header still described the stop as `taskkill /T /F` alone; it names `Stop-ProcessTree`'s ask-then-force shape.
- Minor, fixed: `scripts/line-ceiling.ps1:44` still said `engine-custom/PATCHES.md` is 902 lines (deferred by Tasks 3 and 8 for Task 10 and never done); it says past 900.
- Minor, fixed: `engine-custom/README.md` said `verify.ps1` runs the engine `-Check` "as its first step"; step 1 is the ceiling and the overlays are step 2. Five documents that said a `new` entry is "skipped" now say what the check does.
- Confirmed, no change: all three new packs are byte-identical to their upstream blobs at `2b62ae68` and `varp.pack` differs only by its nine appended lines, no id changed; `Stop-ProcessTree` measured escalating in 0.8 s against a windowless child that refuses `/T`, and a copy with `/F` removed leaves the child alive, so the measurement discriminates; the tracked `obj.pack` with `3894=time_candy_typo` appended fails 7 of 15 `packIds` cases through the path `verify.ps1` runs; no PowerShell 5.1 violation, em dash, `as any` or protected-path edit in the diff.
- The gate after the fix wave: `powershell -File scripts/verify.ps1` green end to end at the committed tree (`logs/verify-review-fable2.log`), ten steps, 532 files under the ceiling, both `-Check`s `no drift detected.`, 41 manifest paths tracked, `patches-check` 69/47/3/2 rows with 32 pristine paths all inside the set, 149 engine unit tests, step 9 through the new exit-code read with `7 reserved hook name(s) survived`, 27 Playwright specs passed and 5 skipped by design; ports free afterwards and the two regenerated screenshots restored.

## 10. Fix wave

entry 3: fix wave (3 important, 4 minor, all 7 closed; commits `2b1fe3f`..`c391c81`); seven
mutations re-run at this tree, both overlay `-Check`s, `patches-check.ps1`, `line-ceiling.ps1` and
a parser pass over all five edited scripts green after them, on top of the whole-gate green in
`logs/verify-review-fable2.log`.

The seven findings landed in `2b1fe3f`. This wave re-proved each of them at the working tree rather
than taking the review's word for it, and closed the ragged prose that fix left behind.

| Re-proof | What was broken | What failed |
|---|---|---|
| A | `content-custom/manifest.json`'s `pack/obj.pack` relabelled `kind: "new"` | `content-overlay.ps1 -Check` exit 1, `recorded as kind 'new' but upstream has a file at that path` |
| B | `engine-custom/manifest.json`'s `src/web.ts` relabelled `kind: "new"` | `engine-overlay.ps1 -Check` exit 1, same line naming `src/web.ts` |
| C | `src/app.ts`'s `baseSha256` blanked | `engine-overlay.ps1 -Check` exit 1, `has kind 'replace' and no recorded sha256` |
| D | `engine-custom/manifest.json` emptied to `files: []`, `anchors: []` | `engine-overlay.ps1 -Check` exit 1, `A -Check with nothing to check is a green that means nothing` |
| E | `client/src/util/stray.ts` untracked | `patches-check.ps1` exit 1, `33 path(s) ... 1 outside the allowed set` |
| F | the same file `git add`ed | same failure, so staging does not hide it |
| G | a comment appended to the tracked `client/src/config/IfType.ts` | same failure naming `IfType.ts` |
| H | a stand-in script that `exit 1`s, called with `&` | without `Invoke-Native` the run continues (`LASTEXITCODE=1`, next line reached); with it, `build (scripts/build.ps1) failed (exit 1)` and exit 1 |

Each manifest and client file was restored and md5-confirmed against the pre-mutation copy;
`git status` under `client/` is clean.

Fixed here, on top of `2b1fe3f`: the reflow in that commit left five ragged wraps and two lines past
100 columns in prose it had rewritten (`scripts/content-overlay.ps1` and `scripts/engine-overlay.ps1`
comment-based help, both overlay READMEs, both overlay skills). Rewrapped, no executable line
touched, which is why the gate was not re-run whole for it (ruling in the progress file).

entry 3: fix-wave re-review (opus): 7/7 ADDRESSED at `1123cea`, clean, no breakage. Two of the wave's
mutations re-run independently and each watched failing: `pack/obj.pack` relabelled `kind: "new"`
gave `content-overlay.ps1 -Check` exit 1 under `recorded as kind 'new' but upstream has a file at
that path`, and an untracked `client/src/util/stray.ts` gave `patches-check.ps1` exit 1 with
`33 path(s) differ from the 274 import, 1 outside the allowed set`; the same file `git add`ed failed
identically, so the staged path is covered separately from `ls-files --others`. Both restored, tree
clean under `client/` and `content-custom/` afterwards. Suites at this tree: both overlay `-Check`s
clean (39 and 5 entries), `patches-check` 69/47/3/2 rows and 32 pristine paths, ceiling 532 files,
parser 0 errors on all five edited scripts, web typecheck + lint (0 errors, 2 pre-existing warnings)
+ 1487 vitest, client `tsc --noEmit` + 48 hook tests, 149 engine unit tests, both generator
`--check`s current. `server/` `bun test` is 214 pass / 5 fail, every failure a Firestore emulator
`ConnectionRefused`, which `docs/VERIFICATION.md:24` requires the emulators for; not a regression.
Fix-wave ruling 2 verified rather than taken: `1123cea`'s only `.ps1` hunks are at lines 28-31 and
32-34, both inside the `<# ... #>` help block that ends at 35 and 38, so the executable text is
byte-identical to the whole-gate green in `logs/verify-review-fable2.log` (07:42, `verify exit 0`).

## 11. Landing

`powershell -File scripts/verify.ps1` was re-run whole at `c391c81`, the branch tip after the fix
wave, and passed: `logs/verify-entry3-final.log`, ten steps, 532 files under the ceiling, both
overlay `-Check`s `no drift detected.`, 41 manifest paths tracked across 2 overlays, `patches-check`
69 assertions across 29 numbered rows with numbering at 28, plus 47, 3 and 2 on the other three
records and 32 pristine paths all inside the set, 149 engine unit tests, step 9 through `build.ps1`'s
minified-bundle and reserved-name assertions, 27 Playwright specs passed and 5 skipped by design,
`verify passed`. The five ports were free before the run and after it, and the two e2e screenshots
the Playwright step rewrites were restored to HEAD.

- Landing ruling 1: the gate was re-run whole even though the fix wave's last two commits
  (`1123cea`, `c391c81`) changed no executable line, so the sprint spec's "verify green at" names a
  sha the gate actually ran at rather than one inferred from a diff. - Cost if wrong: 25 minutes.
- Landing ruling 2: `docs/superpowers/specs/2026-09-07-project-audit.md` is left byte for byte as
  Task 10 committed it. Its Remediation status bullet already marks C22, C23 and C24 closed with
  residue and points here, and per D97 the audit is never rewritten. `map.pack` stays unpinned per
  D116, along with the same sentence's `vars.pack`, which does not exist at the 274 pin; both are
  entry 11's. - Cost if wrong: nothing, a closed row marked twice.
- Landing ruling 3: no "what actually shipped" section is added to a spec (`docs/superpowers/SDD.md`
  step 4). This entry is audit remediation, its authority is the plan, and the shape entry 2 set for
  that authority is that the ledger IS the shipped record; the sprint spec gets its State cell and a
  change-log row instead. - Cost if wrong: one section a later reader looks for in the spec and
  finds here.
- Landing ruling 4: `docs/superpowers/sprint-control.md`'s entry 3 row (the plan's Task 10 step 8)
  is NOT written here. The board is the orchestrator's live file, dirty in this tree with its own
  uncommitted lines, and staging it would commit work that is not this session's. - Cost if wrong:
  the orchestrator writes its own row, which is what it does anyway.
