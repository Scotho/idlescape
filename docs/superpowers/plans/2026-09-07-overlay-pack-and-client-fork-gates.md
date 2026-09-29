# Overlay, pack and client-fork gates - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the three machineries that are supposed to keep this repository honest actually able to fail: pin the four allocated packs by name so a renumbered `.pack` fails a test before entries 10 and 11 append to them (C22), give the content overlay a drift check that reads the upstream blob, exits 1, is run by a gate, has a removal path and compares both clones to `scripts/upstream.lock` (C23), and turn `client/PATCHES.md`'s and `engine-custom/PATCHES.md`'s 104 hand-run grep lines into a self-tested runner inside `npm run verify`, with a written revision-bump procedure (C24).

**Architecture:** Three seams, in the order that puts the irreversible data risk first. (1) *The pack pin* is data plus one module: the three missing upstream packs are copied into `content-custom/pack/` with manifest entries, `.gitattributes` stops git from checking a `.pack` out CRLF (which the existing guard misreports as an id renumbering), and `engine-custom/src/idlescape/packIds.ts` holds the sprint's section 3 table in code so one array serves both `packIds.test.ts` and the two `packAll` call sites. (2) *The overlay machinery* gains `scripts/lib/OverlayHash.ps1` and `scripts/lib/UpstreamLock.ps1`, extracted from `engine-overlay.ps1`, which is where the correct blob-hashing already lives; `content-overlay.ps1` then becomes its sibling rather than its weaker twin, both scripts gain a `.overlay-manifest` sidecar so a deleted overlay file is removed from the clone, every native call in `setup.ps1` and `start-stack.ps1` gets its exit code read, and `verify.ps1` step 2 grows four sub-steps with `$TotalSteps` unchanged at 10. (3) *The client-fork gate* is `scripts/patches-check.ps1` plus a typed row grammar that replaces the `sh` grep fences in both `PATCHES.md` files, because the shell dialect those fences use has already produced one false pattern in the repository and would produce seven more under the audit's proposed runner.

**Tech Stack:** Windows PowerShell 5.1 for `scripts/` and `scripts/lib/`; TypeScript under `node:test` through `tsx` for the `engine-custom/` overlay; Bun plus TypeScript for `client/`; Docker multi-stage for `deploy/docker/`; markdown for the two patch records and the documentation set.

**Spec:** `docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md` entry 3, "Overlay, pack and client-fork gates" (`:126-145`), plus that document's section 3 (the pack-id table, `:520-556`) and change-log row 2 (`:680`). It stands on `docs/superpowers/specs/2026-09-07-project-audit.md` section 2.6, findings C22, C23 and C24 (`:1093-1240`), and on decisions D32 (the row's position), D39, D41 (the entry renumbering that makes the pack table's Entry column read 10 and 11), D94 (the `$TotalSteps` rule), D95 (the line ceiling) and D97 (the audit is never rewritten). Session conventions: `docs/superpowers/SDD.md` and `docs/superpowers/specs/2026-09-06-sprint-handoff.md`. Board: `docs/superpowers/sprint-control.md`. The entry immediately before this one is `docs/superpowers/ledgers/2026-09-07-release-integrity-and-account-isolation.md`, whose sections 6 and 7 say in writing that C23 and C24 are untouched and are entry 3's.

Three read-only maps were written for this plan in the git-ignored SDD workspace `.superpowers/sdd/2026-09-07-entry3-plan/`: `map-findings.md` (which audit claims are still true at HEAD and which have gone stale, with corrected line numbers), `map-overlay.md` (the pack and overlay seams, the CRLF hazard, the extraction points) and `map-client.md` (the fork, all 104 assertions run, the runner design). **This plan quotes every fact it needs from them**, so an implementer never opens the workspace and a fresh clone that lacks it loses nothing. Where a line number in this plan and a grep at HEAD disagree, the grep is right.

## Global Constraints

- **Strict TypeScript, no new `as any`.** The one file this plan writes in TypeScript is `engine-custom/src/idlescape/packIds.ts` plus its test, both under the engine clone's strict `tsconfig.json` and both covered by `verify.ps1`'s engine typecheck.
- **Every file under 400 lines, test files included**, enforced by `scripts/line-ceiling.ps1` as `verify.ps1` step 1 (D95). `scripts/` is inside that script's include list and `.ps1` is an included extension, so **every new script this plan writes is under the ceiling from its first commit**: `scripts/patches-check.ps1`, `scripts/lib/OverlayHash.ps1` and `scripts/lib/UpstreamLock.ps1`. Sizes at HEAD of the files this plan grows: `scripts/verify.ps1` 346, `scripts/engine-overlay.ps1` 240, `scripts/content-overlay.ps1` 148, `scripts/setup.ps1` 146, `scripts/start-stack.ps1` 100, `scripts/build.ps1` 136, `engine-custom/tools/pack/BuildOverlay.ts` 72, `engine-custom/src/app.ts` 70. The `.pack` files are exempt by exemption 3, which already names `content-custom/pack/**` (`scripts/line-ceiling.ps1:36-39`), and both `PATCHES.md` files are exempt as prose by exemption 5.
- **No em dashes in any new prose**: source comments, this plan, documentation, commit messages. Hyphens or commas.
- **`engine/server` and `engine/content` are never edited.** The only routes in are `engine-custom/` and `content-custom/`, each with a `manifest.json` entry and a `PATCHES.md` row carrying a verifying assertion. `verify.ps1` step 2 fails on an untracked manifest path.
- **`client/src/client/Client.ts` is edited only by a numbered patch** recorded in `client/PATCHES.md`; numbering is at 28. **This plan writes no patch.** It edits `client/PATCHES.md`'s verification fences and `client/bundle.ts` not at all.
- **Pack ids are pinned BY NAME in the sprint spec's section 3, and no id changes in this entry.** `obj` 3894 `time_candy`, `obj` 3895 `time_candy_filled`, `inv` 217 `bb_stash_inv`, `inv` 218 `bb_stash_worn`, `inv` 219 `time_candy_keep`, `loc` 4671 `bb_portal`. Entry 3 pins them; entries 10 and 11 append them.
- **`live/` is never read, edited or referenced.** `.gitignore:28`.
- **Windows PowerShell 5.1 only.** `pwsh` is not installed. No `&&`, no `||`, no ternary, no `??`, no `?.`. `Join-Path` takes two arguments, so nest it. `$ErrorActionPreference = 'Stop'` turns a native command's stderr into a terminating error, and `verify.ps1:120-132` is the worked example of the local `'Continue'` workaround; copy that shape. `exit N` inside a `&`-called `.ps1` sets `$LASTEXITCODE` and does **not** throw, which is why every script ends with an explicit `exit 0`.
- **The release stays owner-gated as G5** (D16). Nothing in this plan releases, touches the Lightsail box, runs `deploy/lightsail/release.ps1`, or builds a Docker image on the box. The one Dockerfile edit (Task 3) is verified by reading the file and by a local `docker build` only if the implementer already has Docker running; it is not required.
- **Branch `sprint/dragon-slayer`.** Every commit uses explicit `git add <paths>`, never `git add -A`, is made with `git -c core.safecrlf=false commit`, and ends with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577
  ```
- **Per-command verification**, from the repository root in Git Bash unless stated:
  - the pack pin: `powershell -File scripts/content-overlay.ps1`, then `-Check`, then from `engine/server`, `npx tsx --test --test-force-exit src/idlescape/packIds.test.ts`
  - the overlays: `powershell -File scripts/engine-overlay.ps1`, `-Check`, `powershell -File scripts/content-overlay.ps1`, `-Check`
  - the patch runner: `powershell -File scripts/patches-check.ps1`
  - the ceiling: `powershell -File scripts/line-ceiling.ps1`
  - the whole gate: `powershell -File scripts/verify.ps1` (about 25 minutes; Task 10 is the only task required to run it end to end)

---

## What already shipped, verified in the code at HEAD

Read this before Task 1. HEAD is `1093a780` on `sprint/dragon-slayer` (`aa121ee` closed entry 2, `1093a780` is board bookkeeping above it; no code differs from `c66a9f9`, which the maps were written against). **Treat every line number in this plan as a hint and grep for the symbol beside it.**

### Entry 2 and the entry 1 landing closed exactly one third of one finding here

C22's sharpest claim is **already false**. At the audit's own commit `d4431af`, `deploy/docker/engine.Dockerfile:86` was `RUN npm run build`. At HEAD that file is 157 lines and `:143` is `RUN npx tsx tools/pack/BuildOverlay.ts`, with the stale comment the audit quotes rewritten at `:43-49` and a second explanatory block at `:129-142`. It landed in `ca8ef86` at 14:35 on 2026-09-07 as entry 1's deploy escalation under D73 and D74; the audit landed at 14:12. **So the verifier's escalation, "very likely already failing in production", is void.** Assert this with a grep in Task 10; do not re-edit the Dockerfile's pack line.

What survives from that bullet and is Task 3's: `engine/server/tools/pack/config/PackShared.ts:314` still advises `BUILD_VERIFY=false`, and `engine/server/src/util/WorldConfig.ts:292-299` still returns as soon as `data/config/world.json` exists, before any `BUILD_*` variable is read, so that advice cannot work for this world. `deploy/docker/world.json.template` has no `build` key at all (9 lines, read in full), so a guard against one appearing is prospective, and cheap.

Also asserted rather than redone:

- **The client fork typechecks on every gate.** `client/tsconfig.check.json` and `verify.ps1:181-186` landed in entry 2 and close C16's third, not C24's. `client/PATCHES.md:37-44` says which is which. A patch-presence gate is additive to it.
- **`scripts/line-ceiling.ps1` exists and exempts `content-custom/pack/**`** (`:36-39`), written before those files existed. Task 1 gets it free.
- **`verify.ps1`'s step labels come from `Write-Step`, `Write-SubStep` and one `$TotalSteps` constant** (`:39-49`, D94). This entry does not move the count; see ruling R11.
- **`Invoke-Native` at `verify.ps1:76-79`** is the helper Task 5 copies into `setup.ps1` and `start-stack.ps1`.
- **`engine-overlay.ps1:61-67`, `:72-94` and `:105-111`** (`Get-ByteSha`, `Invoke-GitInClone`, `Get-UpstreamBlobSha`) are the correct blob-hashing implementation. Task 4 extracts them; it does not invent them.

### The tree is green today, which is the cheapest time to build these gates

Measured, by running them and not by reading them:

- **All 104 patch assertions pass**: 65 in `client/PATCHES.md`'s six `sh` fences (3 in the `tsconfig.check.json` fence at `:46-51` that entry 2 added, 62 in the five patch fences at `:55-74`, `:78-99`, `:103-117`, `:121-131`, `:142-150`), and 39 in `engine-custom/PATCHES.md:859-899`. The audit's counts, 62 and 35, were right when taken; entry 2 appended 3 and 4.
- **Both clones sit at their pinned shas**: `engine/server` `1d25566cb53e7af1b1cb18ade8af996316c19614`, `engine/content` `2b62ae68dfed02b441bae47987a01d6bcbaeb358`, matching `scripts/upstream.lock:5-6`.
- **`engine-custom/manifest.json` lists 34 files and the overlay source set is exactly those 34.** The unlisted set is empty, so Task 6's change from a printed note to a hard failure is a ratchet and not a cleanup.
- **The three missing packs are exactly the right shape to copy.** Read out of the pinned content clone with `git -C engine/content -c core.autocrlf=false show HEAD:pack/<t>.pack`:

  | Pack | lines | last line | blob sha256 (uppercase, manifest form) |
  |---|---|---|---|
  | `obj` | 3894 | `3893=wearable_stool_white` | `358E01A1F2E3751E3D1F8C6704B2F248F8F160567A73EDDFC53FEEAAF49C7F77` |
  | `inv` | 217 | `216=boardgames_sideinv` | `841D9E89F6EE89D4316401697C9EED86E2A5F20CB12ECE347CA2DC38133457C6` |
  | `loc` | 4671 | `4670=statue_herosguild2` | `326B4B80F62ABCD4B81DD0C6F7AF94E2AB49B5B915E1DFE64FFAB312DF00C291` |
  | `varp` | 368 (ours) | `367=banktab_size_9` | `BE5D9B325D1E26C06C2643A63D796A922ACC1F4DDE38F1090C0653EE833517D8` (already recorded, `content-custom/manifest.json:3`) |

  Ids are dense from 0, one `<id>=<name>` per line, which is why line count is max plus one. The three upstream maxima match the sprint spec's section 3 statement verbatim (`:544-546`), and `grep -n "time_candy\|bb_stash\|bb_portal" engine/content/pack/*.pack` returns nothing, so no allocated name collides upstream. **Entry 3 pins. It does not allocate and it changes no id.**

**If a new gate is red on its first run, the gate is wrong, not the tree.** Every one of these numbers was measured on this machine at HEAD.

### The three defects that are not in the audit, and that this plan must not inherit

1. **The CRLF hazard is live, and its symptom is a false accusation of data corruption.** `.gitattributes:1` is `* text=auto` and `core.autocrlf` is `true`. Measured with `git checkout-index --prefix=<scratch>`: a fresh Windows checkout of `content-custom/pack/varp.pack` lands **CRLF** at sha256 `a9a0c122...`, while the file on this machine is LF at `9400a824...`, because it has never been re-checked-out since it was written. The overlay copies the CRLF file into the clone; `engine/server/tools/pack/Parse.ts:7-13` splits on `/\r?\n/` so it parses fine, but `PackFileBase.ts:120-128` `save()` joins with `'\n'` and `FsCache.ts:122-135` compares exact text, so `save()` rewrites it to LF, `changedPacks` names the file, and `BuildOverlay.ts:66-69` exits 1 with a message about obj-id renumbering. Whether `save()` runs at all depends on `PackFile.ts:133-136`'s mtime check, so it is intermittent. One line in `.gitattributes` closes it, and it must land in **the same task as the three new pack files** (Task 1), before entries 10 and 11 append.
2. **`client/PATCHES.md:190`, the patch 28 table row, is a false pattern.** It reads `... : string \| null {`, where `\|` is markdown escaping a table-cell pipe. Fed to `grep` as a BRE that is **alternation** and returns 7, not 1 (`Client.ts:2183, 2201, 2221, 2238, 2268, 13964, 13976`), six of them unrelated to patch 28. With a literal pipe it returns 1. Any runner built by pasting the table's "Grep that proves it" column inherits it, and a row whose accidental alternation happened to match would be a silent false pass. This is the argument for ruling R6 and it is the row the self-test must carry.
3. **The audit's own proposal for C24 is wrong for eight of the 104 lines.** It says to run each with `Select-String -SimpleMatch`. Three are `^`-anchored (`client/PATCHES.md:82-84`), three carry BRE-escaped brackets (`:87`, `:88`, `engine-custom/PATCHES.md:868`), one is a four-name BRE alternation expecting 0 (`:91`), and one is a `grep -A5 ... | grep -c` pipeline (`:130`). Seven become false failures. `:91` becomes a **false pass**, and it is the assertion that packet logging, auto-login and agent mode were never vendored from rs-sdk, so under `-SimpleMatch` it would go on reading 0 after somebody vendored all four. Three further parser traps were found by building a runner and watching it lie: five patterns contain a `#` so the count marker is the **last** `# <digits>` on the line, fourteen counts carry trailing prose (`# 0, still pristine`, `# 1  (an external apply is never bumped twice)`), and `engine-custom/PATCHES.md` has three fenced blocks of which only the last is a verify block. Ruling R6 removes this whole class rather than teaching a parser to survive it.

### Two committed sentences that HEAD falsifies, both in entry 3's own text

`docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md:132-133` (entry 3's paragraph) and `:554-556` (section 3) both still say the engine Dockerfile's plain `npm run build` is very likely already failing in production. False since `ca8ef86`, twenty three minutes after the spec landed. The adjacent sentence about `BUILD_VERIFY=false` being unreachable because `WorldConfig.ts` returns early is still **true** and must survive the edit. Task 10 corrects the sprint spec; per D97 it does **not** correct the audit.

---

## Plan rulings

Each is a decision this plan makes, with what it costs if it turns out wrong. Sixteen rulings. The ones that cross entries or touch policy are appended to `docs/superpowers/decisions.md`: D103 to D108 when the plan was written, then **D115** (R16, the stop escalation) and **D116** (the `map.pack` residue that entry 11 inherits) when the plan review was applied.

**R1. `packIds.test.ts` reads the TRACKED source, `content-custom/pack/<t>.pack`, not the clone's `engine/content/pack/<t>.pack`.** The two existing content assertions (`engine-custom/PATCHES.md:898-899`) read the clone, and following that precedent here would be wrong: `verify.ps1` at HEAD never applies the content overlay, so the clone's pack files are ours only if some earlier `setup.ps1` or `start-stack.ps1` run happened to put them there, and a suite that reads them proves nothing about a fresh checkout. The tracked file is always present and always `git ls-files`-visible. **That the clone matches it is a separate check**, proven by Task 4's content overlay apply-and-check sub-step in `verify.ps1`, which copies the tracked file in and whose exit code is now read. *If wrong:* the suite could pass while the clone carries stale packs; the failure surface is the overlay apply, which is one line above it in the same step and cannot be skipped.

**R2. `.gitattributes` gains `*.pack -text`, and it lands in Task 1 before the three pack files are `git add`ed.** `-text` unsets the text attribute entirely, so git stores and checks out the bytes verbatim on every platform. The existing `varp.pack` blob is already LF, so no re-add is needed; the fix takes effect on the next checkout. *If wrong:* nothing in the repository wants a CRLF `.pack`; the reverse cost is zero and the forward cost is an intermittent false "obj-id renumbering" failure on every fresh Windows clone.

**R3. The pinned table lives in TypeScript at `engine-custom/src/idlescape/packIds.ts`, not in JSON or in the test file.** One array is read by `packIds.test.ts` (from the repository root's `content-custom/pack/`), by `BuildOverlay.ts` (from the clone's pack directory, before and after `packAll`) and by `app.ts`. The engine typecheck covers it, and `#/idlescape/packIds.js` is importable from `tools/` because `BuildOverlay.ts` already imports `#/util/Environment.js`. *If wrong:* the array and the sprint spec's section 3 table can drift; mitigated by the module header naming the spec as the authority and by Task 10's sweep, and the cost of drift is one wrong line in a test that entries 10 and 11 will run.

**R4. Until entries 10 and 11 append, the six allocated ids are asserted BOTH WAYS conditionally, and the nine shipped varps positively.** For an allocation: if the id line exists its name must be exactly the allocated name, and if the name appears anywhere its id must be exactly the allocated id. Neither half asserts presence, because the names do not exist yet. The nine `359..367=banktab_size_N` lines do exist and are asserted positively, as is the intact upstream prefix (`0..max` dense, and the recorded last upstream line verbatim). **That form fails on a renumber the day entry 10 appends and never before, which is the whole point of landing it early.** *If wrong:* a typo in an entry-10 name would pass here and fail in that entry's own tests; the pin still catches the failure mode it exists for, which is a renumbering of an id already written into a `.sav`.

**This is a deliberate deviation from the entry brief's wording.** The brief asks for the packs pinned "by name, id and content hash". The content hash is dropped and replaced by "the upstream prefix is dense from 0 and its last line is verbatim". A byte hash of a tracked `.pack` is not stable across machines: measured with `git checkout-index`, a fresh Windows checkout of `content-custom/pack/varp.pack` hashes `a9a0c122...` while the file on this machine hashes `9400a824...`. Ruling R2 makes that stable going forward, but a test whose correctness depends on one `.gitattributes` line is one deleted line away from lying, and it would also have to be re-recorded by entries 10 and 11 on every append. The prefix-plus-tail assertion is stronger where it matters (it names the wrong line rather than reporting that a file moved) and needs no re-recording. The manifest still records the upstream **blob** hash for each pack, which is what `-Check` compares.

**R5. The pack guard becomes a check against the pinned table, run BEFORE and AFTER `packAll`, and the hash-delta guard stays.** They answer different questions: `checkPack` answers "is id 3894 `time_candy`?", `changedPacks` answers "did this run rewrite a file?". Both are cheap. The before-call is what makes the guard preventive rather than a post-mortem with a restore instruction. **`engine-custom/src/app.ts:18-32`'s `packAll` gets the same pair.** Say out loud in that file's comment why it is not redundant: `app.ts` runs with `world.json`'s `verify` at its default of true, so a missing name throws rather than auto-registering, and the guard there is defence in depth against a world whose `build.verify` was flipped, which is exactly what upstream's unauthenticated `PUT /setup/config` used to allow and what entry 2's `registerSetupGuard` now blocks. *If wrong:* two extra directory reads per pack run, on a step that already takes about seven minutes.

**R6. The `sh` grep fences in both `PATCHES.md` files are replaced by a typed `patches-check` row grammar, and the runner never parses a shell command.** The grammar is one directive line and one row per assertion:
```
root: client
patch 28 | contains | 1 | src/client/Client.ts | private objIconDataUrl(id: number, count: number): string | null {
```
Five fields, split on the **first four** pipes only, so a literal containing a pipe survives verbatim. Modes are `contains`, `startswith` and `after:<n>`. The alternative, teaching a parser to un-escape BRE, is rejected because this repository has already shipped one false pattern of exactly that kind (defect 2 above) and because the audit's own proposal is wrong for eight of 104 lines. The fences stop being copy-pasteable into a shell; the heading above them says to run `powershell -File scripts/patches-check.ps1` instead. *If wrong:* 104 rows of churn across two prose files, reversible by `git revert` of Tasks 7 and 8; the runner would then need eight special cases and a documented escaping dialect.

**R7. The runner PRINTS the counts and the patch high-water mark, asserts a floor and a coverage set, and no document quotes a number again.** `.claude/skills/idlescape-client-patch/SKILL.md:90-91` says "All 81 currently pass" and no mechanical count of `client/PATCHES.md` produces 81; `docs/ARCHITECTURE.md:61` repeats it. Asserting a high-water mark of 28 in a constant would just move the drift into a number that patch 29 has to edit. So: a per-file floor (client at least 60 rows, engine at least 40) so an empty parse cannot pass, a coverage assertion that every numbered patch id in `client/PATCHES.md`'s table appears as some row's tag (this is what catches patch 9), and two printed numbers the prose points at, the assertion count and the **maximum** numeric patch id.

**The maximum is printed, not asserted, and it is not the row count.** Measured: `grep -cE '^\|\s*[0-9]+b?\s*\|' client/PATCHES.md` answers **29**, because `21b` at `:183` is a real row, while the numbering is at **28**. A runner that printed only the row count would hand the next session a mechanical-looking 29 to reconcile against two documents that correctly say 28. So the coverage block computes `max(id)` with `21b` parsed as 21 and prints `numbering is at 28`, which is the sentence `.claude/skills/idlescape-client-patch/SKILL.md:9-10` and `docs/README.md:43` can be checked against. *If wrong:* the floor needs raising when a fence grows, which is one number in one script.

**R8. `scripts/patches-check.ps1` is a PowerShell script, not a bun test.** A bun test would have to live under `client/src/hooks/`, `client/src/plugins/` or `client/src/vendor/` to be picked up by `verify.ps1:189-194`, and a patch-record checker is none of those three zones; widening that path list is a fifth thing to keep in sync. Only a script can also cover `engine-custom/PATCHES.md`, which C24 explicitly asks for. It matches `scripts/line-ceiling.ps1` and `scripts/engine-overlay.ps1` in shape. *If wrong:* a rewrite as a bun test plus a widened path list.

**R9. Every new check carries a self-test that runs before the real pass and does not read the repository.** The precedent is `Assert-LineCounting` (`scripts/line-ceiling.ps1:87-110`, called unconditionally at `:111`) and its stated reason, that a green from a check nobody has watched fail means nothing. **Five self-tests land**, four in PowerShell and one in `node:test`: `Assert-OverlayHashing` (Task 4, proves the blob hash ignores the working tree), `Assert-LockParsing` (Task 5, proves an all-comment or malformed lock throws rather than checking nothing), `Assert-OverlayRemoval` (Task 6, proves a removed overlay file is restored where upstream has one and deleted where it does not), `Assert-PatchMatching` (Task 7, proves a wrong count, an absent literal and a missing file are all reported, and that a literal containing a pipe passes), and `packIds.test.ts`'s mutation cases (Task 2). **A row whose target file does not exist is a failure, never a skip.** *If wrong:* about 120 lines of script that run in under a second.

**R10. `start-stack.ps1` throws when the engine never reaches `World ready`, instead of warning and continuing.** `:78-80` is false green 2 in `docs/VERIFICATION.md` and it is what makes an unguarded `packAll` death in `app.ts` invisible. The deadline stays at ten minutes, which comfortably covers the roughly seven minute first pack, and the process is also checked for `HasExited` inside the poll loop so a crash is reported in seconds rather than in ten minutes. Every tracked process is killed before the throw. *If wrong:* a local `npm run dev` on a machine where the first pack exceeds ten minutes now fails instead of half-starting; raising the deadline is one constant.

**R11. `$TotalSteps` stays 10.** Entry 3 adds four checks to `verify.ps1` and all four are `Write-SubStep`s inside step 2, which already holds three sub-steps of exactly this kind: the clone-sha check, the content overlay apply, the content overlay drift check and the patch runner. The engine half of the patch runner needs the overlay applied, so it cannot run earlier, and the client half alone at step 1b would split one invocation across two call sites for no gain. Keeping the count at 10 avoids falsifying seven prose lines (`README.md:35`, `CLAUDE.md:68`, `docs/VERIFICATION.md:73`, `docs/ARCHITECTURE.md:239`, `.claude/skills/idlescape-verify/SKILL.md:19`, `:48`, `:111`), which D94 would otherwise require this entry to correct. The minified-bundle assertion is the one addition outside `verify.ps1`: it goes inside `build.ps1` (ruling R12). *If wrong:* one constant and seven prose lines.

**R12. The minified-bundle assertion lands in `build.ps1` immediately after the client build, not in `verify.ps1`.** `verify.ps1:255-257` runs `build.ps1` (step 9, minified) and then `:282` starts `start-stack.ps1 -Prod`, which reaches `start-stack.ps1:84`'s unconditional `bun run build:dev` and **overwrites** `client/out` with an unminified bundle. So an assertion placed anywhere after step 9 would be reading the wrong artifact. Putting it in `build.ps1` right after `& $bun run build` is the only placement a later step cannot undo, and it also covers the release path, which runs `build.ps1` without `verify.ps1`. The alternative C24 names, `-ClientBuild dev|prod` on `start-stack.ps1`, is a bigger blast radius on the local play path for the same protection. *If wrong:* the check moves, which is one block.

**R13. No new script is written for `client/.upstream-git`.** C24 proposes `scripts/upstream-git.ps1 -Init`; the revision-bump procedure carries the literal `git clone --bare https://github.com/LostCityRS/Client-TS client/.upstream-git` line instead. A bump happens roughly once per upstream revision and the procedure is already ten ordered steps of hand work; one more runnable line inside it is cheaper than a script nobody exercises between bumps. *If wrong:* one small script, later.

**R14. `scripts/upstream.lock` gains two rows, `client-import` and `rs-sdk`.** The fork's import commit `dec1dc58d3b958aadadeb341b51886cd3f855383` appears nowhere in the repository outside one ledger, and the rs-sdk pin `56b73e08fc01a1d683d7a86d145a494ae945d071` appears in prose in six places and in the lock not at all. The pristine-274 check (Task 8) needs the first, and the revision-bump procedure needs both. `setup.ps1` iterates a fixed `$repos` hash, so extra rows are inert there. *If wrong:* two lines.

**R15. The overlay removal path is a `.overlay-manifest` sidecar written into each clone root.** Both clone roots are under `/engine/`, which `.gitignore:8` covers, so the sidecar is never tracked, and `setup.ps1:45`'s `git checkout -q -f $sha` leaves untracked files alone, so it survives a re-pin, which is what makes it useful. On each apply, any path in the previous sidecar that is not in the current source set is restored from the clone's git objects if git knows it, and deleted if git does not. *If wrong:* a stale sidecar restores a file the overlay no longer owns, which is what the clone would have carried from upstream anyway.

**R16 (D115). Every tracked process is stopped with `taskkill /T` first and escalated to `/T /F` after five seconds, in `start-stack.ps1` and `verify.ps1` both.** This is C23's last open clause and the plan would otherwise widen it: `verify.ps1:56` and `start-stack.ps1:100` both go straight to `/T /F`, which is `TerminateProcess`, so the engine's `safeExit` and its owner-bank flush never run and up to about sixty seconds of bank state is discarded on every Ctrl+C (the flush runs every 100 ticks). Task 5's new `Stop-Tracked` would have been a third such kill. So one shared helper does the escalation and all three call sites use it: a plain `taskkill /PID <id> /T` asks for a clean close, five seconds of `HasExited` polling gives the flush time, and `/T /F` follows for anything still alive. `taskkill` without `/F` posts WM_CLOSE and sends Ctrl+Break to a console child, which the engine already handles; a process that ignores it is exactly the case `/F` still covers. *If wrong:* a stop takes up to five seconds longer per stubborn process, and the reverse cost is a bank rollback the owner cannot see. If the engine turns out not to flush on a clean close, the escalation is still no worse than `/F` and the item moves to the ledger's "does not close" list rather than back into the code.

### Two audit clauses this plan answers by measurement rather than by new code

- **"manifest anchors"** (C23). `engine-custom/manifest.json` already has both an `anchors` array and a `base` field, and `engine-overlay.ps1:117-121` already folds the anchors into `-Check` as a third entry kind. What was missing was on the content side: `content-custom/manifest.json` had **no** `base` and **no** `kind`, so nothing recorded which content sha its hashes were taken against and a new file was expressed as a null `baseSha256` that `content-overlay.ps1:74` silently skipped. Task 1 gives it both fields and Task 4 makes a `replace` entry with no recorded hash an error rather than a skip. No new anchor machinery is written.
- **"the production build no longer steering the operator into disabling the guard"** (C22). Already closed by `ca8ef86` under D73, twenty three minutes after the audit landed. Task 10 asserts it with two greps and Task 3 adds the one guard that was genuinely missing, against a `verify` key appearing in `world.json`. The audit's sharpest sentence on this finding is not re-implemented, and the sprint spec that repeats it is corrected.

---

## File structure

| Path | Created or modified | Responsibility | Task |
|---|---|---|---|
| `.gitattributes` | modify | `*.pack -text`, so a `.pack` is byte-stable across platforms | 1 |
| `content-custom/pack/obj.pack` | create (3894 lines) | The upstream `obj` pack, pinned so entry 10 has a file to append to | 1 |
| `content-custom/pack/inv.pack` | create (217 lines) | The upstream `inv` pack, for entries 10 and 11 | 1 |
| `content-custom/pack/loc.pack` | create (4671 lines) | The upstream `loc` pack, for entry 11 | 1 |
| `content-custom/manifest.json` | modify | Gains `base`, a `kind` per entry, and the three new rows | 1 |
| `content-custom/README.md` | modify | The pinned packs, the `-text` rule, and the corrected `-Check` contract | 1, 4 |
| `engine-custom/src/idlescape/packIds.ts` | create | The pinned table in code: `parsePack`, `checkPack`, `SHIPPED_IDS`, `ALLOCATED_IDS`, `UPSTREAM_TAIL` | 2 |
| `engine-custom/src/idlescape/packIds.test.ts` | create | Asserts the four tracked packs against that table, plus five mutation cases | 2 |
| `engine-custom/manifest.json` | modify | Two `kind: "new"` rows for the pair above | 2 |
| `engine-custom/tools/pack/BuildOverlay.ts` | modify | Calls `checkPack` before and after `packAll`; the restore instruction is reworded | 3 |
| `engine-custom/src/app.ts` | modify | The second `packAll` gets the same guard pair | 3 |
| `deploy/docker/engine.Dockerfile` | modify | Fails the image build if `world.json` ever carries a `verify` key | 3 |
| `scripts/lib/OverlayHash.ps1` | create | `Get-ByteSha`, `Invoke-GitInClone`, `Get-UpstreamBlobSha`, `Get-CloneHead`, `Sync-OverlayRemovals`, plus the self-tests `Assert-OverlayHashing` and `Assert-OverlayRemoval` | 4, 6 |
| `scripts/content-overlay.ps1` | modify | `-Check` reads the blob and exits 1; the apply path gains an explicit `exit 0`, the shared skip list, the removal path and a fatal unlisted check | 4, 6 |
| `scripts/engine-overlay.ps1` | modify | Uses the shared library; apply gains the removal path and a fatal unlisted check | 4, 6 |
| `scripts/lib/UpstreamLock.ps1` | create | `Read-UpstreamLock`, `Assert-ClonePins` | 5 |
| `scripts/setup.ps1` | modify | Reads every exit code; uses `Read-UpstreamLock` | 5 |
| `scripts/start-stack.ps1` | modify | Reads every exit code; asserts the clone pins; throws on a dead engine | 5 |
| `scripts/verify.ps1` | modify | Step 2 gains four sub-steps; `$TotalSteps` unchanged | 4, 5, 7, 8 |
| `scripts/patches-check.ps1` | create | The typed-row runner, its self-test, the coverage and floor assertions, the pristine-274 check | 7, 8 |
| `client/PATCHES.md` | modify | Six `sh` fences become `patches-check` fences; patch 9 gains its row | 7 |
| `engine-custom/PATCHES.md` | modify | The `:859` fence becomes a `patches-check` fence; the `pwsh` line is corrected | 2, 3, 8 |
| `scripts/upstream.lock` | modify | Gains `client-import` and `rs-sdk` | 8 |
| `scripts/build.ps1` | modify | Asserts the reserved hook names survive minification | 9 |
| `docs/OPERATIONS.md` | modify | New section 10, the standing revision-bump procedure | 9 |
| `deploy/lightsail/README.md` | modify | `:182-187`, the three release-gate blind spots this entry moves: two close for the local gate, all three stay open for the image | 10 |
| `docs/VERIFICATION.md`, `docs/ARCHITECTURE.md`, `README.md`, `docs/README.md`, the four skills, the sprint spec, the audit | modify | The sweep: every present-tense claim this entry falsifies | 10 |

---

## Task 1: Pin the three upstream packs, and stop CRLF from faking a renumber

**Files:**
- Modify: `.gitattributes` (8 lines at HEAD)
- Create: `content-custom/pack/obj.pack`, `content-custom/pack/inv.pack`, `content-custom/pack/loc.pack`
- Modify: `content-custom/manifest.json` (6 lines at HEAD)
- Modify: `content-custom/README.md:55-72`
- Test: no code test. The verification is a measured byte round trip through git plus a re-run of the overlay.

**Interfaces:**
- Consumes: nothing.
- Produces: four files under `content-custom/pack/` (`obj.pack`, `inv.pack`, `loc.pack`, `varp.pack`) whose lines are exactly `<id>=<name>`, LF, dense from id 0. `content-custom/manifest.json` gains the shape `{ "base": "<content sha>", "files": [ { "path", "kind": "replace"|"new", "baseSha256" } ] }`, which Task 4's `-Check` consumes.

- [ ] **Step 1: Prove the CRLF hazard before fixing it**

From the repository root in Git Bash. Record both hashes in the ledger.

```bash
TMP=$(mktemp -d)
git -c core.autocrlf=true checkout-index --prefix="$TMP/" -- content-custom/pack/varp.pack
sha256sum "$TMP/content-custom/pack/varp.pack" content-custom/pack/varp.pack
```

Expected: two DIFFERENT hashes. The fresh checkout is CRLF (`a9a0c122...` on this machine), the working tree is LF (`9400a824...`). If they already agree, someone landed the fix; say so and skip to Step 4.

- [ ] **Step 2: Add the attribute**

Append to `.gitattributes`:

```gitattributes

# .pack files are the pack-id pin (sprint spec section 3, content-custom/pack/*.pack). Under
# `* text=auto` git checks them out CRLF on Windows, and the engine's PackFileBase.save() joins
# with '\n' while FsCache.writeFileIfChanged compares exact text, so the first pack run rewrites
# the file to LF. That is a byte change, so tools/pack/packGuard.ts names it and BuildOverlay.ts
# exits 1 with a message about obj-id renumbering: a false positive that accuses the operator of
# corrupting bank data, on nothing worse than a fresh clone. Whether save() runs at all depends on
# PackFile.ts's mtime check, so it is intermittent, which is worse. Store and check these out
# byte-for-byte on every platform.
*.pack -text
```

- [ ] **Step 3: Prove the attribute fixes it**

```bash
TMP=$(mktemp -d)
git -c core.autocrlf=true checkout-index --prefix="$TMP/" -- content-custom/pack/varp.pack
sha256sum "$TMP/content-custom/pack/varp.pack" content-custom/pack/varp.pack
```

Expected: the two hashes now AGREE. The stored blob was already LF, so no re-add is needed; the attribute changes the checkout filter only.

- [ ] **Step 4: Copy the three upstream packs in, as bytes**

`git show` writes the blob and the redirect adds nothing, so this cannot pick up CRLF. Do **not** `cp` from the clone's working tree, which is CRLF on this machine.

```bash
for t in obj inv loc; do
  git -C engine/content -c core.autocrlf=false show HEAD:pack/$t.pack > content-custom/pack/$t.pack
done
wc -l content-custom/pack/obj.pack content-custom/pack/inv.pack content-custom/pack/loc.pack
tail -1 content-custom/pack/obj.pack; tail -1 content-custom/pack/inv.pack; tail -1 content-custom/pack/loc.pack
```

Expected exactly: 3894, 217, 4671 lines; last lines `3893=wearable_stool_white`, `216=boardgames_sideinv`, `4670=statue_herosguild2`. If any number differs the clone is not at `2b62ae68`, which Task 5's check exists to catch; stop and report rather than pinning the wrong bytes.

- [ ] **Step 5: Confirm the blob hashes the manifest will record**

```bash
for t in obj inv loc varp; do
  printf "%s " $t
  git -C engine/content -c core.autocrlf=false show HEAD:pack/$t.pack | sha256sum | tr 'a-f' 'A-F' | cut -c1-64
done
```

Expected, and these are the values Step 6 writes:

```
obj  358E01A1F2E3751E3D1F8C6704B2F248F8F160567A73EDDFC53FEEAAF49C7F77
inv  841D9E89F6EE89D4316401697C9EED86E2A5F20CB12ECE347CA2DC38133457C6
loc  326B4B80F62ABCD4B81DD0C6F7AF94E2AB49B5B915E1DFE64FFAB312DF00C291
varp BE5D9B325D1E26C06C2643A63D796A922ACC1F4DDE38F1090C0653EE833517D8
```

The `varp` value must equal what `content-custom/manifest.json:3` already records. That equality is the proof that this manifest's recorded hashes have always been blob hashes, which is what lets Task 4 switch `-Check` to blob hashing without re-recording anything.

- [ ] **Step 6: Rewrite `content-custom/manifest.json`**

Whole file. `base` and `kind` mirror `engine-custom/manifest.json:2` and `:4-37`, which have both and which Task 4's shared code expects.

```json
{
  "base": "2b62ae68dfed02b441bae47987a01d6bcbaeb358",
  "files": [
    { "path": "pack/obj.pack", "kind": "replace", "baseSha256": "358E01A1F2E3751E3D1F8C6704B2F248F8F160567A73EDDFC53FEEAAF49C7F77" },
    { "path": "pack/inv.pack", "kind": "replace", "baseSha256": "841D9E89F6EE89D4316401697C9EED86E2A5F20CB12ECE347CA2DC38133457C6" },
    { "path": "pack/loc.pack", "kind": "replace", "baseSha256": "326B4B80F62ABCD4B81DD0C6F7AF94E2AB49B5B915E1DFE64FFAB312DF00C291" },
    { "path": "pack/varp.pack", "kind": "replace", "baseSha256": "BE5D9B325D1E26C06C2643A63D796A922ACC1F4DDE38F1090C0653EE833517D8" },
    { "path": "scripts/interface_bank/configs/banktab.varp", "kind": "new", "baseSha256": null }
  ]
}
```

- [ ] **Step 7: Apply the overlay and prove it is a no-op afterwards**

```powershell
powershell -File scripts/content-overlay.ps1
powershell -File scripts/content-overlay.ps1
```

Expected: the first run reports `5 overlay file(s)` with the three new packs among the copied list. The **second** run reports `5 overlay file(s), 0 copied, 5 unchanged`. A second run that copies anything means a line-ending mismatch survived and Step 2 did not take; do not proceed.

- [ ] **Step 8: Prove the ceiling is not tripped by a 4,671-line file**

```powershell
powershell -File scripts/line-ceiling.ps1
```

Expected: `line ceiling: <n> file(s) scanned, none over 400`. `.pack` is not an included extension and `content-custom/` is not an include directory (`scripts/line-ceiling.ps1:65-70`), and exemption 3 in that script's header already names `content-custom/pack/**`. If this fails the include list changed under us, and widening the exemption list is a decision, not a fix.

- [ ] **Step 9: Update `content-custom/README.md`**

Correct the pinned-file description around `:55-60` so it names four packs rather than one, and add this paragraph to the packing section:

```markdown
`pack/*.pack` files are byte-pinned. `.gitattributes` carries `*.pack -text` so git stores and
checks them out verbatim on every platform: under `text=auto` a Windows checkout lands CRLF, the
engine's first pack run rewrites the file to LF, and `tools/pack/packGuard.ts` reports that byte
change as an obj-id renumbering. `obj.pack`, `inv.pack` and `loc.pack` are verbatim copies of
upstream 274 with nothing appended yet; sprint entries 10 and 11 append the ids the sprint spec's
section 3 allocates, and `engine-custom/src/idlescape/packIds.test.ts` fails if any of them lands
on the wrong number.
```

Leave the `-Check` self-reports-drift paragraph at `:67-72` alone; Task 4 owns it.

- [ ] **Step 10: Verify**

```bash
git status --short
```

Expected exactly: `M .gitattributes`, `M content-custom/manifest.json`, `M content-custom/README.md`, and three `??` rows for the new packs. Nothing under `engine/` appears, because it is git-ignored.

```bash
python3 -c "
for t in ('obj','inv','loc','varp'):
    raw = open('content-custom/pack/%s.pack' % t, 'rb').read().decode()
    assert '\r' not in raw, t
    ids = [int(l.split('=')[0]) for l in raw.split('\n') if l]
    assert ids == list(range(len(ids))), t
    print(t, len(ids), 'max', ids[-1])
"
```

Expected: `obj 3894 max 3893`, `inv 217 max 216`, `loc 4671 max 4670`, `varp 368 max 367`, and no assertion. A `\r` anywhere means Step 4 read the working tree instead of the blob.

- [ ] **Step 11: Commit**

```bash
git add .gitattributes content-custom/pack/obj.pack content-custom/pack/inv.pack content-custom/pack/loc.pack content-custom/manifest.json content-custom/README.md
git -c core.safecrlf=false commit -m "feat(content): pin obj, inv and loc packs and keep .pack bytes stable

The sprint spec's section 3 allocates six ids across obj, inv and loc, and none of
those three packs was in content-custom/pack/, so BuildOverlay.ts's instruction to add
the missing ID line by hand was impossible for six of six rows. Each pack is copied
verbatim out of the pinned content clone at 2b62ae68 with its upstream blob sha
recorded; the manifest also gains base and kind to match its engine sibling.

.gitattributes gains *.pack -text. Under text=auto a fresh Windows checkout lands
CRLF, PackFileBase.save() rewrites it to LF, and packGuard reports that byte change as
an obj-id renumbering: a false positive that accuses the operator of corrupting bank
data. Measured before and after with git checkout-index.

Audit C22. No id changes; entries 10 and 11 append.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 2: The pinned table in code, and the test that fails on a renumber

**Files:**
- Create: `engine-custom/src/idlescape/packIds.ts`
- Create: `engine-custom/src/idlescape/packIds.test.ts`
- Modify: `engine-custom/manifest.json` (two `kind: "new"` rows)
- Modify: `engine-custom/PATCHES.md` (a section for the module, two rows in the `:859` fence)
- Test: `engine-custom/src/idlescape/packIds.test.ts`

**Interfaces:**
- Consumes: Task 1's four tracked pack files.
- Produces, from `#/idlescape/packIds.js`:
  - `interface PinnedId { readonly pack: string; readonly id: number; readonly name: string }`
  - `const UPSTREAM_TAIL: ReadonlyArray<PinnedId>`, upstream 274's last line per pack
  - `const SHIPPED_IDS: ReadonlyArray<PinnedId>`, ids already appended
  - `const ALLOCATED_IDS: ReadonlyArray<PinnedId>`, ids the sprint allocates and no entry has appended
  - `function parsePack(text: string): Map<number, string>`, throws on a malformed or duplicate line
  - `function checkPack(pack: string, text: string): string[]`, violations as sentences, empty when clean

  Task 3's `BuildOverlay.ts` and `app.ts` both import `checkPack`.

- [ ] **Step 1: Write the module**

`engine-custom/src/idlescape/packIds.ts`:

```ts
/**
 * The pack-id pin, in code.
 *
 * `docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md` section 3 is the authority: pack ids
 * are allocated by hand, by NAME, because `tools/pack/BuildOverlay.ts` runs with
 * `Environment.build.verify = false`, which makes `validateConfigPack` auto-register an unknown
 * name at `pack.max++` and rewrite `<srcDir>/pack/<type>.pack`. A renumbered `.pack` renumbers obj
 * ids already written into every `.sav` bank and every owner-bank JSON, silently turning one item
 * into another. The guard that shipped with that tool hashes the pack directory before and after
 * one `packAll`, so it answers "did this run rewrite a file?" and cannot answer "is id 3894
 * time_candy?". This module answers the second question, and both callers ask both.
 *
 * Nothing here allocates. Adding a row means editing the sprint spec's table first.
 */

export interface PinnedId {
    readonly pack: string;
    readonly id: number;
    readonly name: string;
}

/**
 * Upstream 274's LAST line in each pack we pin, at content sha 2b62ae68. Ids are dense from 0, so
 * asserting this line plus density proves the file is upstream-plus-our-appends rather than a
 * partial copy or a renumbering.
 */
export const UPSTREAM_TAIL: ReadonlyArray<PinnedId> = [
    { pack: 'obj', id: 3893, name: 'wearable_stool_white' },
    { pack: 'inv', id: 216, name: 'boardgames_sideinv' },
    { pack: 'loc', id: 4670, name: 'statue_herosguild2' },
    { pack: 'varp', id: 358, name: 'boardgames_varbit4' }
];

/** Ids this repository has already appended. These must be present. */
export const SHIPPED_IDS: ReadonlyArray<PinnedId> = [
    { pack: 'varp', id: 359, name: 'banktab_size_1' },
    { pack: 'varp', id: 360, name: 'banktab_size_2' },
    { pack: 'varp', id: 361, name: 'banktab_size_3' },
    { pack: 'varp', id: 362, name: 'banktab_size_4' },
    { pack: 'varp', id: 363, name: 'banktab_size_5' },
    { pack: 'varp', id: 364, name: 'banktab_size_6' },
    { pack: 'varp', id: 365, name: 'banktab_size_7' },
    { pack: 'varp', id: 366, name: 'banktab_size_8' },
    { pack: 'varp', id: 367, name: 'banktab_size_9' }
];

/**
 * Ids the sprint allocates that no entry has appended yet: sprint entry 10 (time candy) owns
 * time_candy, time_candy_filled and time_candy_keep, entry 11 (battlebots) owns bb_stash_inv,
 * bb_stash_worn and bb_portal. Absence is NOT a violation until those entries land; a mismatch is,
 * in both directions. See checkPack.
 */
export const ALLOCATED_IDS: ReadonlyArray<PinnedId> = [
    { pack: 'obj', id: 3894, name: 'time_candy' },
    { pack: 'obj', id: 3895, name: 'time_candy_filled' },
    { pack: 'inv', id: 217, name: 'bb_stash_inv' },
    { pack: 'inv', id: 218, name: 'bb_stash_worn' },
    { pack: 'inv', id: 219, name: 'time_candy_keep' },
    { pack: 'loc', id: 4671, name: 'bb_portal' }
];

/**
 * One `<id>=<name>` per line, keyed by id. Splits on /\r?\n/ and never hashes: a tracked .pack is
 * byte-identical across platforms only because .gitattributes says `*.pack -text`, and a check
 * that compared bytes would still be one attribute away from lying. Throws on a malformed line or
 * a duplicate id, because either means the file is not a pack file any more.
 */
export function parsePack(text: string): Map<number, string> {
    const byId = new Map<number, string>();
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.length === 0) {
            continue;
        }

        const eq = line.indexOf('=');
        if (eq <= 0) {
            throw new Error(`pack line ${i + 1} is not "<id>=<name>": ${line}`);
        }

        const raw = line.slice(0, eq);
        if (!/^\d+$/.test(raw)) {
            throw new Error(`pack line ${i + 1} has a non-numeric id "${raw}"`);
        }

        const id = Number(raw);
        if (byId.has(id)) {
            throw new Error(`pack line ${i + 1} repeats id ${id}, already "${byId.get(id)}"`);
        }

        byId.set(id, line.slice(eq + 1));
    }

    return byId;
}

/**
 * Every way `<pack>.pack` disagrees with the pin, as sentences a session can act on. Empty means
 * clean. Four families, in the order they matter:
 *   1. the upstream prefix is dense from 0 and its last line is upstream's,
 *   2. every shipped id is present and carries its name,
 *   3. every allocated id matches in BOTH directions whenever either half is present,
 *   4. no name is on two ids.
 */
export function checkPack(pack: string, text: string): string[] {
    const problems: string[] = [];
    const byId = parsePack(text);

    const idForName = new Map<string, number>();
    for (const [id, name] of byId) {
        const first = idForName.get(name);
        if (first === undefined) {
            idForName.set(name, id);
        } else {
            problems.push(`${pack}.pack: name "${name}" is on id ${first} and again on id ${id}`);
        }
    }

    const tail = UPSTREAM_TAIL.find(t => t.pack === pack);
    if (tail !== undefined) {
        for (let id = 0; id <= tail.id; id++) {
            if (!byId.has(id)) {
                problems.push(`${pack}.pack: upstream id ${id} has no line, so this is not upstream 274 plus our appends`);
                break;
            }
        }

        const last = byId.get(tail.id);
        if (last !== undefined && last !== tail.name) {
            problems.push(`${pack}.pack: upstream id ${tail.id} reads "${last}", upstream 274 has "${tail.name}"`);
        }
    }

    for (const pin of SHIPPED_IDS) {
        if (pin.pack !== pack) {
            continue;
        }

        const actual = byId.get(pin.id);
        if (actual !== pin.name) {
            const found = actual === undefined ? 'no line' : `"${actual}"`;
            problems.push(`${pack}.pack: id ${pin.id} must be "${pin.name}", found ${found}`);
        }
    }

    for (const pin of ALLOCATED_IDS) {
        if (pin.pack !== pack) {
            continue;
        }

        const actual = byId.get(pin.id);
        if (actual !== undefined && actual !== pin.name) {
            problems.push(`${pack}.pack: id ${pin.id} is allocated to "${pin.name}" by the sprint spec's section 3, found "${actual}"`);
        }

        const where = idForName.get(pin.name);
        if (where !== undefined && where !== pin.id) {
            problems.push(`${pack}.pack: "${pin.name}" is allocated id ${pin.id} by the sprint spec's section 3, found it on id ${where}`);
        }
    }

    return problems;
}
```

- [ ] **Step 2: Write the failing test**

`engine-custom/src/idlescape/packIds.test.ts`:

```ts
/**
 * The pack-id pin, asserted against the TRACKED source rather than against the clone.
 *
 * `scripts/verify.ps1` runs these suites from engine/server (its comment at :147-166 explains why
 * the paths must be relative), so `../../content-custom/pack` is the repository's own copy and
 * `../content/pack` is the clone's post-overlay copy. This suite reads the tracked one on purpose:
 * a fresh checkout always has it, while the clone's copy is ours only if an overlay run put it
 * there. Whether the clone matches is a different question, and scripts/content-overlay.ps1
 * answers it in the same verify step.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { ALLOCATED_IDS, checkPack, parsePack, SHIPPED_IDS, UPSTREAM_TAIL } from '#/idlescape/packIds.js';

const PACK_DIR = path.resolve('..', '..', 'content-custom', 'pack');
const PACKS = ['obj', 'inv', 'loc', 'varp'];

function readPack(pack: string): string {
    return fs.readFileSync(path.join(PACK_DIR, `${pack}.pack`), 'utf8');
}

describe('packIds', () => {
    it('every pinned pack file is present in content-custom', () => {
        for (const pack of PACKS) {
            const file = path.join(PACK_DIR, `${pack}.pack`);
            assert.ok(fs.existsSync(file), `${file} is missing; the sprint spec's section 3 allocates ids in it`);
        }
    });

    it('every pinned pack file agrees with the pin', () => {
        for (const pack of PACKS) {
            assert.deepStrictEqual(checkPack(pack, readPack(pack)), [], `content-custom/pack/${pack}.pack`);
        }
    });

    it('the nine shipped bank-tab varps are on their exact ids', () => {
        const byId = parsePack(readPack('varp'));
        for (const pin of SHIPPED_IDS) {
            assert.strictEqual(byId.get(pin.id), pin.name);
        }
    });

    it('no allocated id has been squatted by another name', () => {
        for (const pin of ALLOCATED_IDS) {
            const actual = parsePack(readPack(pin.pack)).get(pin.id);
            assert.ok(actual === undefined || actual === pin.name, `${pin.pack}.pack id ${pin.id} is "${actual}"; the sprint allocates it to "${pin.name}"`);
        }
    });

    it('the recorded upstream tails match the files', () => {
        for (const tail of UPSTREAM_TAIL) {
            assert.strictEqual(parsePack(readPack(tail.pack)).get(tail.id), tail.name);
        }
    });

    it('a renumbered shipped id fails', () => {
        const original = readPack('varp');
        const mutated = original.replace('367=banktab_size_9', '368=banktab_size_9');
        assert.notStrictEqual(mutated, original, 'the mutation did not apply');

        const problems = checkPack('varp', mutated);
        assert.ok(problems.some(p => p.includes('id 367 must be "banktab_size_9"')), problems.join('\n'));
    });

    it('an allocated name on the wrong id fails, in both directions', () => {
        const wrongId = `${readPack('obj').trimEnd()}\n3999=time_candy\n`;
        const byName = checkPack('obj', wrongId);
        assert.ok(byName.some(p => p.includes('"time_candy" is allocated id 3894')), byName.join('\n'));

        const wrongName = `${readPack('obj').trimEnd()}\n3894=time_candy_typo\n`;
        const byIdProblems = checkPack('obj', wrongName);
        assert.ok(byIdProblems.some(p => p.includes('id 3894 is allocated to "time_candy"')), byIdProblems.join('\n'));
    });

    it('a hole in the upstream prefix fails', () => {
        const holed = readPack('inv').split('\n').filter(l => !l.startsWith('100=')).join('\n');
        const problems = checkPack('inv', holed);
        assert.ok(problems.some(p => p.includes('upstream id 100 has no line')), problems.join('\n'));
    });

    it('a duplicate id throws rather than being reported', () => {
        assert.throws(() => parsePack('0=a\n1=b\n1=c\n'), /repeats id 1/);
    });

    it('CRLF parses identically to LF, so a checkout filter cannot change the answer', () => {
        const lf = readPack('inv');
        assert.deepStrictEqual([...parsePack(lf.replace(/\n/g, '\r\n'))], [...parsePack(lf)]);
    });
});
```

- [ ] **Step 3: Run it and watch it fail for the right reason**

```powershell
cd engine\server
npx tsx --test --test-force-exit src/idlescape/packIds.test.ts
```

Expected: `Cannot find module`, because the overlay has not copied the two new files into the clone yet. That is the point of running it now, so nobody mistakes a passing run for the module being wired.

- [ ] **Step 4: Register both files in the manifest**

Add to `engine-custom/manifest.json`'s `files` array, beside the other `src/idlescape/*` rows:

```json
    { "path": "src/idlescape/packIds.test.ts", "kind": "new", "baseSha256": null },
    { "path": "src/idlescape/packIds.ts", "kind": "new", "baseSha256": null },
```

`verify.ps1:114-139` fails on any manifest path git does not track, so this and Step 9's `git add` are one unit.

- [ ] **Step 5: Apply the overlay and run the suite for real**

```powershell
powershell -File scripts/engine-overlay.ps1
cd engine\server
npx tsx --test --test-force-exit src/idlescape/packIds.test.ts
```

Expected: 10 tests pass, 0 fail. Relative paths and `--test-force-exit` are both required (`verify.ps1:147-166`); an absolute path evaluates the engine's module graph twice and a missing force-exit hangs on worker threads the engine never drains.

- [ ] **Step 6: Prove the gate fails on a real renumber, not only inside a fixture**

This is the mutation the task exists for. Mutate the tracked file, run the real gate path, undo.

```bash
sed -i 's/^367=banktab_size_9$/368=banktab_size_9/' content-custom/pack/varp.pack
powershell -File scripts/engine-overlay.ps1
cd engine/server && npx tsx --test --test-force-exit src/idlescape/packIds.test.ts; cd ../..
git checkout -- content-custom/pack/varp.pack
git status --short content-custom/pack/varp.pack
```

Expected: the run FAILS, naming `varp.pack: id 367 must be "banktab_size_9", found no line`, and the last command prints nothing. If the run passes, `PACK_DIR` is resolving elsewhere; print `path.resolve('..','..','content-custom','pack')` from `engine/server` and fix it before continuing.

- [ ] **Step 7: Record the module in `engine-custom/PATCHES.md`**

Add a section beside the other `src/idlescape/` modules:

```markdown
### The pack-id pin (`src/idlescape/packIds.ts`)

`docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md` section 3 allocates pack ids by hand,
by name. This module carries that table in code so one array serves the test, `BuildOverlay.ts` and
`app.ts`. `checkPack` answers "is id 3894 time_candy?", which the hash-delta guard in
`tools/pack/packGuard.ts` structurally cannot: that one compares a pack to itself across a single
`packAll`, so it detects a rewrite and never a wrong id.

`src/idlescape/packIds.test.ts` reads `../../content-custom/pack/*.pack`, the TRACKED source, not
`../content/pack`. `scripts/verify.ps1` applies the content overlay in the same step, so the clone
matching the tracked copy is proven there rather than assumed here. Audit C22.
```

Then two rows at the end of the `sh` fence at `:859-900`. Task 8 converts this fence to the typed grammar; write them in the fence's current shape so the tree stays green between the two tasks:

```sh
grep -c "export function checkPack"      src/idlescape/packIds.ts   # 1
grep -c "id: 3894, name: 'time_candy'"   src/idlescape/packIds.ts   # 1
```

- [ ] **Step 8: Verify**

```powershell
powershell -File scripts/engine-overlay.ps1
powershell -File scripts/engine-overlay.ps1 -Check
powershell -File scripts/line-ceiling.ps1
cd engine\server
npx tsc --noEmit
npx tsx --test --test-force-exit (Get-ChildItem 'src\idlescape\*.test.ts' | ForEach-Object { "src/idlescape/$($_.Name)" })
```

Expected: the overlay applies, `-Check` reports no drift and exits 0, the ceiling passes (`packIds.ts` is about 175 lines and `packIds.test.ts` about 115), the engine typechecks with no output, and **every** engine suite passes, not only the new one. Then run the two new grep rows by hand from `engine/server` and confirm each answers 1.

- [ ] **Step 9: Commit**

```bash
git add engine-custom/src/idlescape/packIds.ts engine-custom/src/idlescape/packIds.test.ts engine-custom/manifest.json engine-custom/PATCHES.md
git -c core.safecrlf=false commit -m "feat(engine): pin pack ids by name and test them

engine-custom/src/idlescape/packIds.ts carries the sprint spec's section 3 table in
code: upstream 274's last line per pack, the nine bank-tab varps already shipped, and
the six ids entries 10 and 11 will append. checkPack asserts the upstream prefix is
dense and intact, that every shipped id carries its name, and that an allocated id and
its name match in both directions whenever either half is present.

packIds.test.ts reads content-custom/pack, the tracked source, not the clone: verify
never applied the content overlay, so the clone's packs were only ours by luck. Ten
cases including four mutations, and a renumbering of 367=banktab_size_9 was watched to
fail through the real gate path before this landed.

Audit C22. No id changes.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 3: Both `packAll` paths guarded against the table, and the production build's last hole

**Files:**
- Modify: `engine-custom/tools/pack/BuildOverlay.ts` (72 lines at HEAD)
- Modify: `engine-custom/src/app.ts` (70 lines at HEAD; `:18-32` is the unguarded `packAll`)
- Modify: `deploy/docker/engine.Dockerfile:123-127` (the `world.json` write)
- Modify: `engine-custom/PATCHES.md` (three rows in the `:859` fence, and the packing section's `pwsh` line at `:561`)
- Test: `engine-custom/src/idlescape/packIds.test.ts` already covers `checkPack`; this task's own proof is a watched failure of the real tool.

**Interfaces:**
- Consumes: `checkPack` from `#/idlescape/packIds.js` (Task 2).
- Produces: nothing new for later tasks. `BuildOverlay.ts` exits 1 with a table violation before it writes anything, and again after.

- [ ] **Step 1: Add the table check to `BuildOverlay.ts`**

Add the import beside the existing ones and the helper below `PACK_DIR` (`:42`). **Only `fs` and `checkPack` are new.** `BuildOverlay.ts:32` already carries `import path from 'node:path';`, which is what builds `PACK_DIR` at `:42`; adding a second one is a duplicate identifier and `npx tsc --noEmit` fails at Step 9.

```ts
import fs from 'node:fs';

import { checkPack } from '#/idlescape/packIds.js';
```

```ts
/**
 * The pin, checked against the table rather than against ourselves.
 *
 * `changedPacks` below answers "did this run rewrite a file?", which cannot see a wrong id that
 * has been wrong since before this process started, and cannot run until after packAll has already
 * written it. This runs BEFORE the pack as well as after, so a pack directory that is already
 * renumbered is refused rather than repacked, and the operator is told which line is wrong instead
 * of which file moved.
 */
function assertPinnedIds(when: string): void {
    const problems: string[] = [];

    for (const name of fs.readdirSync(PACK_DIR)) {
        if (!name.endsWith('.pack')) {
            continue;
        }

        const pack = name.slice(0, name.length - '.pack'.length);
        const text = fs.readFileSync(path.join(PACK_DIR, name), 'utf8');
        for (const problem of checkPack(pack, text)) {
            problems.push(problem);
        }
    }

    if (problems.length === 0) {
        return;
    }

    printError(`[idlescape] pack ids do not match the pin (${when}), in ${PACK_DIR}:`);
    for (const problem of problems) {
        printError(`  ${problem}`);
    }
    printError('[idlescape] The pin is docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md section 3, carried in src/idlescape/packIds.ts.');
    printError('[idlescape] Restore the clone (git -C engine/content checkout -- pack/), fix the ID line in content-custom/pack/<type>.pack, re-run scripts/content-overlay.ps1, then pack again.');
    process.exit(1);
}
```

Call it in two places: immediately after `const packsBefore = hashPacks(PACK_DIR);` at `:44`, as `assertPinnedIds('before packing');`, and immediately after the `changedPacks` block at `:70`, as `assertPinnedIds('after packing');`.

- [ ] **Step 2: Reword the restore instruction at `:68`**

The current line says "add the missing ID lines to `content-custom/pack/*.pack` by hand", which was impossible for `obj`, `inv` and `loc` until Task 1 landed. Replace it with:

```ts
    printError('[idlescape] Restore the clone with `git -C engine/content checkout -- pack/`, add the missing `<id>=<name>` line to content-custom/pack/<type>.pack (all four are pinned copies of upstream), re-run scripts/content-overlay.ps1, then pack again.');
```

- [ ] **Step 3: Guard `app.ts`'s `packAll`**

`engine-custom/src/app.ts:18-32` is the second `packAll` path and has no guard of any kind. Add the imports and wrap the existing call:

```ts
import fsSync from 'node:fs';
import nodePath from 'node:path';

import { checkPack } from '#/idlescape/packIds.js';
import { changedPacks, hashPacks } from '#tools/pack/packGuard.js';
```

`app.ts` already imports `fs` from `'fs'`, so reuse that import rather than adding `fsSync`; the names above are illustrative only. Use the existing `fs` and add `path` if it is absent.

```ts
if (OnDemand.cache.count(0) !== 9 || OnDemand.cache.count(2) === 0 || !fs.existsSync('data/pack/server/script.dat')) {
    printInfo('Packing cache, please wait until you see the world is ready.');

    // The same pin tools/pack/BuildOverlay.ts enforces. It is not redundant here: this path runs
    // with world.json's build.verify at its default of TRUE, so a missing name throws rather than
    // auto-registering, but a world whose verify was flipped would renumber silently and this is
    // the only process that would notice. Upstream's unauthenticated PUT /setup/config used to be
    // able to flip it; engine-custom's registerSetupGuard now blocks that, and this is the second
    // half of the same defence.
    const packDir = path.join(Environment.build.srcDir, 'pack');
    const idProblems: string[] = [];
    for (const name of fs.readdirSync(packDir)) {
        if (!name.endsWith('.pack')) {
            continue;
        }
        const pack = name.slice(0, name.length - '.pack'.length);
        for (const problem of checkPack(pack, fs.readFileSync(path.join(packDir, name), 'utf8'))) {
            idProblems.push(problem);
        }
    }
    if (idProblems.length > 0) {
        for (const problem of idProblems) {
            printError(`[idlescape] ${problem}`);
        }
        printError('[idlescape] refusing to pack: the pack ids do not match src/idlescape/packIds.ts. See engine-custom/PATCHES.md.');
        process.exit(1);
    }

    const packsBefore = hashPacks(packDir);

    try {
        // todo: different logic so the main thread doesn't have to load pack files
        const modelFlags: number[] = [];
        await packAll(modelFlags);
    } catch (err) {
        if (err instanceof Error) {
            printError(err);
        }

        process.exit(1);
    }

    const moved = changedPacks(packsBefore, hashPacks(packDir));
    if (moved.length > 0) {
        printError(`[idlescape] packAll rewrote ${moved.length} pinned pack file(s): ${moved.join(', ')}`);
        printError('[idlescape] a rewritten .pack renumbers obj ids already stored in .sav banks and owner-bank JSON. Restore the clone and pack through tools/pack/BuildOverlay.ts.');
        process.exit(1);
    }
}
```

Keep `app.ts` under 400 lines; it is 70 at HEAD and this adds roughly 40.

- [ ] **Step 4: Close the production build's remaining hole**

`deploy/docker/world.json.template` has no `build` key, and `engine/server/src/util/WorldConfig.ts:292-299` returns as soon as `data/config/world.json` exists, so `BUILD_VERIFY=false` cannot reach this world. What is missing is a guard against a `build.verify` key ever appearing in that template. Add a comment above the `RUN` at `:124` and one clause to the chain at `:125-127`:

```dockerfile
# A world.json carrying a "verify" key would hand tools/pack/BuildOverlay.ts below a world whose
# build.verify is settable, which is the one path from this image to an obj-id renumbering.
# world.json.template has no build key today; this fails the image build the day one appears.
RUN mkdir -p data/config \
 && sed "s#__WEB_ALLOWED_ORIGIN__#${WEB_ALLOWED_ORIGIN}#" /tmp/world.json.template > data/config/world.json \
 && rm /tmp/world.json.template \
 && cat data/config/world.json \
 && ! grep -q '"verify"' data/config/world.json
```

`! grep -q` exits 0 when the string is absent, which is what the `&&` chain needs. Do not use `grep -c`, which exits 1 on a count of zero and would fail the build in the healthy case.

- [ ] **Step 5: Run the guard and watch it refuse a renumbered pack directory**

The mutation goes into the CLONE, which is the directory the tool actually reads. It is git-ignored and `setup.ps1` restores it, so this is safe.

```bash
powershell -File scripts/content-overlay.ps1
sed -i 's/^367=banktab_size_9$/368=banktab_size_9/' engine/content/pack/varp.pack
cd engine/server && npx tsx tools/pack/BuildOverlay.ts; echo "exit=$?"; cd ../..
git -C engine/content checkout -- pack/varp.pack
powershell -File scripts/content-overlay.ps1
```

Expected: `exit=1` within a second or two, before any packing starts, printing `varp.pack: id 367 must be "banktab_size_9", found no line` and the restore instruction. **A run that reaches `console.time('pack')` means the before-call is missing or `PACK_DIR` is wrong.**

- [ ] **Step 6: Run the guard clean**

```powershell
powershell -File scripts/content-overlay.ps1
cd engine\server
npx tsx tools/pack/BuildOverlay.ts
```

Expected: `[idlescape] packing with build.verify disabled`, then a pack of roughly seven minutes on a cold cache and well under a minute on a warm one, then `[idlescape] pack ids unchanged (N pack file(s) verified byte-for-byte)` and exit 0. This is the slowest step in the plan; it is required once, here.

- [ ] **Step 7: Prove the `app.ts` guard fires, which is this task's second mutation and is NOT optional**

The `app.ts` branch only runs when the cache looks incomplete, so a warm-cache boot skips it. Nothing else covers it either: `verify.ps1:170` globs `src\idlescape\*.test.ts` and `app.ts` is not under `src/idlescape`, so no engine suite loads it, and `packIds.test.ts` covers `checkPack` the function rather than this file's wiring (the `packDir` it builds from `Environment.build.srcDir`, the `process.exit(1)`, and the fact that the guard runs before `packAll` rather than after). It is about forty lines of new gate code with its own directory read and its own exit; it gets watched failing like every other new check.

```bash
powershell -File scripts/content-overlay.ps1
rm engine/server/data/pack/server/script.dat
sed -i 's/^367=banktab_size_9$/368=banktab_size_9/' engine/content/pack/varp.pack
powershell -File scripts/start-stack.ps1 -Prod
```

Expected: the engine's packing branch is entered (`Packing cache, please wait...` in `logs/engine.log`), then `[idlescape] varp.pack: id 367 must be "banktab_size_9", found no line` and `[idlescape] refusing to pack: the pack ids do not match src/idlescape/packIds.ts`, the engine exits 1, and **Task 5's new `HasExited` throw in `start-stack.ps1` reports it within seconds**. If Task 5 has not landed yet, `start-stack.ps1` will instead wait out its ten minute deadline and warn; read `logs/engine.log` for the refusal and note in the ledger which of the two you saw.

Restore, then boot clean:

```bash
git -C engine/content checkout -- pack/varp.pack
powershell -File scripts/content-overlay.ps1
powershell -File scripts/start-stack.ps1 -Prod
```

Expected: the cache packs (roughly seven minutes, the `script.dat` you deleted is rebuilt) and the log reaches `World ready`. Ctrl+C.

- [ ] **Step 8: Record it in `engine-custom/PATCHES.md`**

Three rows at the end of the `sh` fence at `:859-900`:

```sh
grep -c "assertPinnedIds('before packing');"   tools/pack/BuildOverlay.ts   # 1
grep -c "assertPinnedIds('after packing');"    tools/pack/BuildOverlay.ts   # 1
grep -c "refusing to pack: the pack ids do not match" src/app.ts            # 1
```

And correct `engine-custom/PATCHES.md:561`, which tells the reader to run `pwsh scripts/content-overlay.ps1`. `pwsh` is not installed on this machine (`CLAUDE.md`). Make it `powershell -File scripts/content-overlay.ps1`, matching `.claude/skills/idlescape-content-overlay/SKILL.md:80-83`.

- [ ] **Step 9: Verify**

```powershell
powershell -File scripts/engine-overlay.ps1
powershell -File scripts/engine-overlay.ps1 -Check
powershell -File scripts/line-ceiling.ps1
cd engine\server
npx tsc --noEmit
npx tsx --test --test-force-exit (Get-ChildItem 'src\idlescape\*.test.ts' | ForEach-Object { "src/idlescape/$($_.Name)" })
```

Expected: all green. Then run the three new grep rows by hand from `engine/server` and confirm each answers 1, and `grep -c pwsh engine-custom/PATCHES.md` answers 0.

- [ ] **Step 10: Commit**

```bash
git add engine-custom/tools/pack/BuildOverlay.ts engine-custom/src/app.ts engine-custom/PATCHES.md deploy/docker/engine.Dockerfile
git -c core.safecrlf=false commit -m "fix(engine): check both packAll paths against the pinned id table

BuildOverlay.ts's guard hashed the same directory twice in one process, so its
baseline was whatever was on disk when the run started and it fired only after
packAll had written the renumbered file. It now calls checkPack before and after, so
an already-renumbered pack directory is refused instead of repacked and the operator
is told which line is wrong rather than which file moved. Watched refusing a
mutated 367=banktab_size_9 before this landed.

src/app.ts's packAll had no guard at all. It runs with build.verify true, so a
missing name throws rather than auto-registering, but a world whose verify was
flipped would renumber silently and nothing downstream would notice. It gets the same
pair, with the reason in a comment so it does not read as redundant.

engine.Dockerfile fails the image build if world.json ever carries a verify key.
PATCHES.md stops telling the reader to run pwsh, which is not installed.

Audit C22.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 4: A content overlay check that reads the blob, exits 1, and is run by a gate

**Files:**
- Create: `scripts/lib/OverlayHash.ps1`
- Modify: `scripts/engine-overlay.ps1:56-111` (the four functions move out; the callers gain a clone-root argument)
- Modify: `scripts/content-overlay.ps1:51-95` (the whole `-Check` branch) and its apply path's missing `exit 0` at `:148`
- Modify: `scripts/verify.ps1:102-139` (two sub-steps, and the manifest-tracked check generalised to two manifests)
- Modify: `content-custom/README.md:67-72` (the paragraph that documents the false positive as expected behaviour), `:36` and `:81` (the two `pwsh` invocations)
- Test: `Assert-OverlayHashing` inside `scripts/lib/OverlayHash.ps1`, run on every invocation.

**Interfaces:**
- Consumes: Task 1's `content-custom/manifest.json` shape (`base`, `kind`, `baseSha256`).
- Produces, dot-sourced from `scripts/lib/OverlayHash.ps1`:
  - `Get-ByteSha -Bytes <byte[]> -> string` (uppercase hex sha256)
  - `Invoke-GitInClone -CloneRoot <string> -GitArgs <string[]> -> pscustomobject { ExitCode; Bytes; Stderr }`
  - `Get-CloneHead -CloneRoot <string> -> string` (throws when git fails)
  - `Get-UpstreamBlobSha -CloneRoot <string> -Rev <string> -RelPath <string> -> string or $null`
  - `Assert-OverlayHashing` (self-test, throws)

  Task 6 adds `Sync-OverlayRemovals` and its self-test `Assert-OverlayRemoval` to the same file.

- [ ] **Step 1: Write the library with its self-test first**

`scripts/lib/OverlayHash.ps1`. Dot-source it, never `&`-call it; it defines functions and returns nothing.

```powershell
# scripts/lib/OverlayHash.ps1 -- the upstream-blob hashing both overlay scripts need.
#
# WHY A BLOB AND NOT THE FILE ON DISK. By the time a -Check runs, the overlay has already
# overwritten the WORKING-TREE copy of every "replace" file with ours, so the working tree can no
# longer answer "what does upstream say?" -- only the committed blob can. scripts/engine-overlay.ps1
# has done this correctly since it was written; scripts/content-overlay.ps1 hashed the working tree
# instead and therefore reported pack/varp.pack as drifted on every run after an apply, then exited
# 0 anyway. Both halves wrong at once, and both documented as expected behaviour in four files.
# This is that code, extracted, with the clone root as a parameter.
#
# -c core.autocrlf=false hashes exactly the bytes git stores. Both clones are checked out with
# core.autocrlf=true, so a file on disk is CRLF while its blob is LF and the two hash differently.
# Every baseSha256 in either manifest is therefore a BLOB hash. Verified when this landed:
# content-custom/manifest.json's recorded hash for pack/varp.pack equals
# `git -C engine/content -c core.autocrlf=false show HEAD:pack/varp.pack | sha256sum`, so nothing
# had to be re-recorded.
#
# Dot-source this file (`. (Join-Path $PSScriptRoot 'lib\OverlayHash.ps1')`), do not `&` it.
# Windows PowerShell 5.1 only.

function Get-ByteSha {
    param([Parameter(Mandatory = $true)][byte[]]$Bytes)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return (($sha.ComputeHash($Bytes) | ForEach-Object { $_.ToString('X2') }) -join '')
    } finally { $sha.Dispose() }
}

# Runs git inside a clone and returns its stdout as RAW BYTES. Capturing git through the pipeline
# would decode the output as text and normalise the line endings, which would make the hash depend
# on the reader's console encoding rather than on the blob.
function Invoke-GitInClone {
    param(
        [Parameter(Mandatory = $true)][string]$CloneRoot,
        [Parameter(Mandatory = $true)][string[]]$GitArgs
    )
    $quoted = @()
    foreach ($a in $GitArgs) {
        if ($a -match '[\s"]') { $quoted += ('"' + $a.Replace('"', '\"') + '"') } else { $quoted += $a }
    }
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'git'
    $psi.Arguments = ($quoted -join ' ')
    $psi.WorkingDirectory = $CloneRoot
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $proc = [System.Diagnostics.Process]::Start($psi)
    $buffer = New-Object System.IO.MemoryStream
    $proc.StandardOutput.BaseStream.CopyTo($buffer)
    $stderr = $proc.StandardError.ReadToEnd()
    $proc.WaitForExit()
    $exit = $proc.ExitCode
    $proc.Dispose()
    return [pscustomobject]@{ ExitCode = $exit; Bytes = $buffer.ToArray(); Stderr = $stderr }
}

function Get-CloneHead {
    param([Parameter(Mandatory = $true)][string]$CloneRoot)
    $result = Invoke-GitInClone -CloneRoot $CloneRoot -GitArgs @('rev-parse', 'HEAD')
    if ($result.ExitCode -ne 0) {
        throw "Could not read HEAD of the clone at $CloneRoot (git exit $($result.ExitCode)): $($result.Stderr)"
    }
    return ([System.Text.Encoding]::ASCII.GetString($result.Bytes)).Trim()
}

# The sha256 of the pristine upstream bytes for a path at a revision. $null when the path does not
# exist at that revision, which the caller reports as "removed upstream" rather than as drift.
function Get-UpstreamBlobSha {
    param(
        [Parameter(Mandatory = $true)][string]$CloneRoot,
        [Parameter(Mandatory = $true)][string]$Rev,
        [Parameter(Mandatory = $true)][string]$RelPath
    )
    $spec = $Rev + ':' + ($RelPath -replace '\\', '/')
    $result = Invoke-GitInClone -CloneRoot $CloneRoot -GitArgs @('-c', 'core.autocrlf=false', 'show', $spec)
    if ($result.ExitCode -ne 0) { return $null }
    return (Get-ByteSha $result.Bytes)
}

# The permanent form of the defect this library exists to remove: a check that hashes the working
# tree instead of the blob. Builds a throwaway repository, commits one file, then makes the working
# tree disagree with it, and asserts the answer did not move. Runs on every invocation of either
# overlay script, costs about a second, and never reads this repository, so a corrupt working tree
# cannot make it pass by accident (the precedent is Assert-LineCounting in scripts/line-ceiling.ps1).
function Assert-OverlayHashing {
    $dir = Join-Path $env:TEMP ('overlay-hash-selftest-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $dir | Out-Null
    try {
        $file = Join-Path $dir 'a.txt'
        [System.IO.File]::WriteAllText($file, "one`ntwo`n")

        Push-Location $dir
        try {
            & git init -q .
            & git config core.autocrlf false
            & git config user.email 'selftest@example.invalid'
            & git config user.name 'selftest'
            & git add a.txt
            & git -c core.safecrlf=false commit -q -m selftest
            if ($LASTEXITCODE -ne 0) { throw "Assert-OverlayHashing could not build its fixture repository (git exit $LASTEXITCODE)" }
        } finally { Pop-Location }

        $expected = Get-ByteSha ([System.Text.Encoding]::ASCII.GetBytes("one`ntwo`n"))
        $head = Get-CloneHead -CloneRoot $dir

        $blob = Get-UpstreamBlobSha -CloneRoot $dir -Rev $head -RelPath 'a.txt'
        if ($blob -ne $expected) { throw "Assert-OverlayHashing: the committed blob hashed $blob, expected $expected" }

        # Make the working tree disagree, in both content and line endings. The answer must not move.
        [System.IO.File]::WriteAllText($file, "one`r`ntwo`r`nthree`r`n")
        $after = Get-UpstreamBlobSha -CloneRoot $dir -Rev $head -RelPath 'a.txt'
        if ($after -ne $expected) {
            throw "Assert-OverlayHashing: the hash moved to $after after the WORKING TREE changed, so this is reading the file on disk and not the blob. That is audit C23's content-overlay defect, back again."
        }

        $absent = Get-UpstreamBlobSha -CloneRoot $dir -Rev $head -RelPath 'nope.txt'
        if ($null -ne $absent) { throw "Assert-OverlayHashing: an absent path must hash to `$null, got $absent" }
    } finally {
        Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
```

- [ ] **Step 2: Run the self-test on its own, and watch it fail**

```powershell
powershell -NoProfile -Command ". scripts\lib\OverlayHash.ps1; Assert-OverlayHashing; 'self-test passed'"
```

Expected: `self-test passed`. Then mutate `Get-UpstreamBlobSha` to `return (Get-ByteSha ([System.IO.File]::ReadAllBytes((Join-Path $CloneRoot $RelPath))))`, which is exactly the defect, re-run, and expect the throw whose message names audit C23. Undo the mutation.

- [ ] **Step 3: Point `engine-overlay.ps1` at the library**

Delete `Get-ByteSha` (`:61-67`), `Invoke-GitInClone` (`:69-94`) and `Get-UpstreamBlobSha` (`:96-111`) from that file, keeping their comment blocks by moving them into the library (Step 1 already carries them). Above the deletions add:

```powershell
. (Join-Path $PSScriptRoot 'lib\OverlayHash.ps1')
Assert-OverlayHashing
```

Then update the three call sites: `:136-140`'s HEAD resolution becomes `$head = Get-CloneHead -CloneRoot $baseRoot`, `:154`'s call becomes `Get-UpstreamBlobSha -CloneRoot $baseRoot -Rev $head -RelPath $relPath`, and `:165`'s becomes `Invoke-GitInClone -CloneRoot $baseRoot -GitArgs @('status', '--porcelain', '--', $relPath)`. `Get-Sha` (`:56-59`) stays where it is; it is a working-tree hash used only for the copy comparison and the non-fatal hand-edit note, both of which want the file on disk.

Run `powershell -File scripts/engine-overlay.ps1 -Check` and expect the same output as before the change, ending `no drift detected.` with exit 0.

- [ ] **Step 4: Rewrite `content-overlay.ps1`'s `-Check` branch**

Replace `:51-95` in full. The shape is `engine-overlay.ps1:113-192`'s, minus the anchors it has no equivalent of.

```powershell
if ($Check) {
    if (-not (Test-Path $baseRoot)) {
        throw "Base content clone not found at $baseRoot. Run scripts/setup.ps1 first."
    }

    $manifest = Get-ContentManifest
    $entries = @()
    if ($manifest -and $manifest.PSObject.Properties['files'] -and $manifest.files) { $entries = @($manifest.files) }

    if ($entries.Count -eq 0) {
        throw "content-custom/manifest.json lists no files. A -Check with nothing to check is a green that means nothing."
    }

    # The clone's own HEAD, not manifest.base: base is the sha the recorded hashes were authored
    # against, and hashing its blobs would compare a hash against the blob it was taken from, which
    # can only ever agree. Hashing HEAD's blobs is what answers the question -Check exists to ask.
    # A stale clone makes that comparison vacuous, which is why scripts/verify.ps1 asserts the clone
    # shas against scripts/upstream.lock in the same step (Assert-ClonePins).
    $head = Get-CloneHead -CloneRoot $baseRoot

    $drifted = New-Object System.Collections.Generic.List[string]
    $gone = New-Object System.Collections.Generic.List[string]
    foreach ($entry in $entries) {
        $relPath = [string]$entry.path
        if ([string]::IsNullOrEmpty($relPath)) { continue }
        if ([string]$entry.kind -eq 'new') { continue }

        $recorded = [string]$entry.baseSha256
        if ([string]::IsNullOrEmpty($recorded)) {
            throw "content-custom/manifest.json: $relPath has kind '$($entry.kind)' and no baseSha256. A replace entry with no recorded hash is uncheckable; give it a hash or mark it kind 'new'."
        }

        $upstream = Get-UpstreamBlobSha -CloneRoot $baseRoot -Rev $head -RelPath $relPath
        if ($null -eq $upstream) { $gone.Add($relPath); continue }
        if ($upstream -ne $recorded) { $drifted.Add($relPath) }
    }

    Write-Host "content-overlay -Check: $($entries.Count) manifest entry(ies) checked against the clone's pinned blobs (HEAD $head)."
    if ($manifest.base -and ($manifest.base -ne $head)) {
        Write-Host "  note: manifest base is $($manifest.base); the clone is at $head. Hashes below are compared against the clone."
    }
    if ($gone.Count -gt 0) {
        Write-Host "  base file removed upstream:"
        foreach ($p in $gone) { Write-Host "    $p" }
    }
    if ($drifted.Count -gt 0) {
        Write-Host "  base file changed upstream since the override was recorded (review it against the new content before trusting it):"
        foreach ($p in $drifted) { Write-Host "    $p" }
    }
    if ($gone.Count -eq 0 -and $drifted.Count -eq 0) {
        Write-Host "  no drift detected."
        exit 0
    }
    exit 1
}
```

Rename `Get-OverlayManifest` to `Get-ContentManifest` and make it return the parsed object rather than only `files`, mirroring `Get-EngineManifest` (`engine-overlay.ps1:50-54`), since the branch now reads `base` too. Update its other caller at `:139`. Add the dot-source and `Assert-OverlayHashing` beside the `param` block, exactly as Step 3 did.

**And give the APPLY path the `exit 0` it has never had.** This is not cosmetic and it must land before Step 6 wires `Invoke-Native` behind it. `scripts/content-overlay.ps1` ends at `:148` with the unlisted-file `Write-Host` loop and simply falls off the end. Its sibling already fixed exactly this: `engine-overlay.ps1:235-240` carries the comment and the `exit 0`. Append the same to the end of `content-overlay.ps1`, in the same shape:

```powershell
# Explicit success exit. Falling off the end of a script leaves $LASTEXITCODE untouched, which
# in a caller that has not yet run a native command means $null -- and verify.ps1's `Invoke-Native`
# reads $null -ne 0 as a failure. Both -Check paths already exit explicitly; this makes the apply
# path do the same, so the script's contract is simply "exit code 0 means it worked".
exit 0
```

Without it, Step 6's `Invoke-Native 'content overlay apply'` reads whatever the previous native command left, so the new sub-step becomes a check that can only ever pass, which is the exact defect class C23 exists to remove. Task 6 Step 3 rewrites the tail of this same apply path; keep the `exit 0` below everything it adds.

**Correction, Task 4 fix round 1: the `$null` half of the paragraph this replaced was wrong, and Task 5 must not carry it forward.** It claimed that at `start-stack.ps1:23`, where the content overlay is the first thing the script runs, `$LASTEXITCODE` would be `$null` and `$null -ne 0` would make every `npm run dev` die with `content overlay apply failed (exit )`. That cannot happen once Step 1's `Assert-OverlayHashing` is in the script: the self-test runs `git init`, `git config`, `git add` and `git commit` as native commands on every invocation, so `$LASTEXITCODE` is `0` in the caller before the apply path ends, with or without the `exit 0`. The real reason the `exit 0` must stay is narrower and still sufficient: without it the exit code is whichever native command inside the script ran last, which is the self-test's `git commit` today and Task 6's removal-sync `git` calls tomorrow, not the apply's own verdict.

- [ ] **Step 5: Prove `-Check` can now both pass and fail**

```powershell
powershell -File scripts/content-overlay.ps1
powershell -File scripts/content-overlay.ps1 -Check
echo $LASTEXITCODE
```

Expected: `no drift detected.` and `0`. Before this task the same command printed `pack/varp.pack` under "base file changed upstream" on every run and still exited 0, so the change of output is itself the proof that it was hashing the wrong bytes.

Then the mutation, which must be done to the manifest and not to the clone:

```bash
sed -i 's/"baseSha256": "BE5D9B32/"baseSha256": "AE5D9B32/' content-custom/manifest.json
powershell -File scripts/content-overlay.ps1 -Check; echo "exit=$?"
git checkout -- content-custom/manifest.json
```

Expected: `exit=1`, listing `pack/varp.pack` as drifted. A `0` here means the exit path did not change and the whole task is a no-op.

Then prove the APPLY path's own exit code, which Step 6 is about to depend on:

```bash
powershell -File scripts/content-overlay.ps1; echo "apply exit=$?"
powershell -NoProfile -Command "& './scripts/content-overlay.ps1' | Out-Null; Write-Host \"LASTEXITCODE=[$LASTEXITCODE]\""
```

Expected: `apply exit=0`.

**Correction, Task 4 fix round 1: the `LASTEXITCODE=[0]` half of this step proves nothing and must not be relied on.** Step 4 also adds `Assert-OverlayHashing` to the top of the same script, and that self-test runs `git init`, `git config`, `git add` and `git commit` as native commands on every invocation, so `$LASTEXITCODE` is already `0` before the apply path reaches its end. Measured with the final `exit 0` deleted: the command above still prints `LASTEXITCODE=[0]`. There is no state in which it prints `[]`, so it cannot tell the two apart, and a later task that moves or drops the `exit 0` and re-runs it gets a false green.

The `exit 0` is still required, for a different reason: it makes the exit code the apply's own answer instead of whatever the last native command inside the script left behind, which matters as soon as Task 6 Step 3 adds native calls to this apply path. The check that discriminates is a caller reading the exit code through `verify.ps1`'s `Invoke-Native` pattern with the apply path made to leave a non-zero code:

```powershell
# insert `& cmd /c exit 7` just above the `exit 0`, then, from a caller:
& 'scripts\content-overlay.ps1' | Out-Null
if ($LASTEXITCODE -ne 0) { throw "content overlay apply failed (exit $LASTEXITCODE)" }
```

Expected: silence with the `exit 0` present, and `content overlay apply failed (exit 7)` once it is deleted. Restore both edits afterwards. `tail -1 scripts/content-overlay.ps1` returning `exit 0` is the cheap version of the same question.

- [ ] **Step 6: Wire it into `verify.ps1`, and generalise the manifest-tracked check**

Two edits inside step 2, after the engine overlay's drift check at `:107`. `$TotalSteps` does not move (ruling R11).

```powershell
Write-SubStep '(cont.) content overlay (apply + drift check)'
& (Join-Path $PSScriptRoot 'content-overlay.ps1')
Invoke-Native 'content overlay apply'
& (Join-Path $PSScriptRoot 'content-overlay.ps1') -Check
Invoke-Native 'content overlay drift check'
```

The first `Invoke-Native` here is only meaningful because Step 4 gave the apply path an explicit `exit 0`. Without that it would read the engine overlay's stale `0` and could never fail. If Step 4's `exit 0` is missing, go back and add it rather than writing this block.

Then replace the single-manifest block at `:114-139` with a loop over both, keeping the local `$ErrorActionPreference` workaround verbatim because `git ls-files --error-unmatch` still writes to stderr for an unknown path:

```powershell
Write-SubStep '(cont.) overlay manifest paths are git-tracked'
$manifests = @(
    @{ Root = 'engine-custom'; Path = (Join-Path $root 'engine-custom\manifest.json') },
    @{ Root = 'content-custom'; Path = (Join-Path $root 'content-custom\manifest.json') }
)
$checkedPaths = 0
foreach ($m in $manifests) {
    $manifestPaths = @((Get-Content -LiteralPath $m.Path -Raw | ConvertFrom-Json).files | ForEach-Object { $_.path })
    if ($manifestPaths.Count -eq 0) { throw "$($m.Root)/manifest.json lists no files" }
    $untracked = New-Object System.Collections.Generic.List[string]
    foreach ($p in $manifestPaths) {
        $tracked = "$($m.Root)/$($p -replace '\\', '/')"
        try {
            $ErrorActionPreference = 'Continue'
            & git -C $root ls-files --error-unmatch -- $tracked *> $null
        } finally {
            $ErrorActionPreference = 'Stop'
        }
        if ($LASTEXITCODE -ne 0) { $untracked.Add($tracked) }
    }
    if ($untracked.Count -gt 0) {
        foreach ($p in $untracked) { Write-Host "    untracked: $p" }
        throw "$($m.Root)/manifest.json names $($untracked.Count) file(s) that git does not track; 'git add' them"
    }
    $checkedPaths = $checkedPaths + $manifestPaths.Count
}
Write-Host "  $checkedPaths manifest path(s) tracked across $($manifests.Count) overlay(s)."
```

Keep the existing comment above it, which explains why an un-added overlay file still passes every suite on the machine that wrote it; widen its first sentence to say "either clone".

- [ ] **Step 7: Correct `content-custom/README.md`**

(The skill copies that mirror these claims are Task 10 Step 5's, not this task's.) Replace the `:67-72` paragraph, which currently documents the false positive as expected behaviour:

```markdown
`-Check` hashes the upstream GIT BLOB for each recorded path at the clone's current HEAD, not the
file as it sits in `engine/content`: after an apply, that file is our own copy for every `replace`
entry, so the working tree cannot answer "what does upstream say?". **It exits 1 on drift**, the
same contract as `scripts/engine-overlay.ps1 -Check`, and `scripts/verify.ps1` runs both in its
overlay step. Entries with `kind: "new"` have no upstream file and are skipped; a `replace` entry
with no recorded hash is an error rather than a skip.
```

Then correct the two `pwsh` invocations in the same file. `pwsh` is not installed on this machine (`CLAUDE.md`), so both lines are unrunnable as written, and Task 3 Step 8 fixes the identical defect in `engine-custom/PATCHES.md:561`. Measured at HEAD: `content-custom/README.md:36` reads "You can also run it by hand: `pwsh scripts/content-overlay.ps1`." and `:81` is a fenced `pwsh scripts/content-overlay.ps1`. Make both `powershell -File scripts/content-overlay.ps1`, matching `.claude/skills/idlescape-content-overlay/SKILL.md:80-83`.

- [ ] **Step 8: Verify**

```powershell
powershell -File scripts/line-ceiling.ps1
powershell -File scripts/engine-overlay.ps1
powershell -File scripts/engine-overlay.ps1 -Check
powershell -File scripts/content-overlay.ps1
powershell -File scripts/content-overlay.ps1 -Check
```

Expected: the ceiling passes with `scripts/lib/OverlayHash.ps1` now in scope (it is about 140 lines), both overlays apply, both `-Check`s report no drift and exit 0, and each prints its self-test having run silently. Then confirm `scripts/engine-overlay.ps1` is smaller than it was and `git diff --stat` shows the three functions moved rather than duplicated.

```bash
grep -c pwsh content-custom/README.md          # 0
tail -1 scripts/content-overlay.ps1            # exit 0
```

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/OverlayHash.ps1 scripts/engine-overlay.ps1 scripts/content-overlay.ps1 scripts/verify.ps1 content-custom/README.md
git -c core.safecrlf=false commit -m "fix(gates): make the content overlay check able to fail, and gate it

content-overlay.ps1 -Check hashed the post-overlay working tree and then exited 0 on
every path, so it reported pack/varp.pack as drifted on every run after an apply and
still passed. Four documents recorded that as expected behaviour. It now reads the
upstream blob at the clone's HEAD, the way engine-overlay.ps1 always has, and exits 1
on drift.

The three functions that did it correctly move to scripts/lib/OverlayHash.ps1 with the
clone root as a parameter, plus Assert-OverlayHashing, which builds a throwaway
repository and proves the hash does not move when the working tree does. Watched
failing under a deliberate reintroduction of the defect.

verify.ps1 step 2 gains the content overlay apply and drift check, and its
manifest-git-tracked check now covers both manifests. TotalSteps is unchanged at 10.

Audit C23.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 5: Every exit code read, and both clones checked against the lock

**Files:**
- Create: `scripts/lib/UpstreamLock.ps1`
- Modify: `scripts/setup.ps1` (146 lines; nine unchecked calls at `:31`, `:36`, `:45`, `:51`, `:109`, `:119`, `:132`, `:136`, `:143`)
- Modify: `scripts/start-stack.ps1` (100 lines; `:23`, `:33`, `:66-80`, `:84`, `:100`)
- Modify: `scripts/verify.ps1`'s `Stop-ProcessTree` (`:51-59`), for the same escalation (ruling R16)
- Modify: `scripts/verify.ps1` (one sub-step at the top of step 2)
- Modify: `docs/VERIFICATION.md` (false green 2, and the tier 3 clone-sha row)
- Test: `Assert-LockParsing` inside `scripts/lib/UpstreamLock.ps1`, run on every invocation.

**Interfaces:**
- Consumes: `scripts/upstream.lock`'s `<key> <sha>` line format.
- Produces, dot-sourced from `scripts/lib/UpstreamLock.ps1`:
  - `Read-UpstreamLock -Path <string> -> hashtable` (key to sha)
  - `Assert-ClonePins -Root <string> -> void` (throws, naming every clone that disagrees)
  - `Assert-LockParsing` (self-test, throws)

- [ ] **Step 1: Write the library**

`scripts/lib/UpstreamLock.ps1`:

```powershell
# scripts/lib/UpstreamLock.ps1 -- scripts/upstream.lock, parsed once and compared to reality.
#
# The lock pins three shas and nothing ever compared a clone to it. That matters more than it
# looks: scripts/engine-overlay.ps1 -Check resolves the CLONE's own HEAD and hashes that revision's
# blobs, which is right, but on a STALE clone HEAD is the revision every recorded hash was taken
# from, so every comparison agrees and the check passes vacuously while verify.ps1 prints
# "verify passed". Both clones happen to be current today, which is the only reason this has been
# invisible. Audit C23.
#
# Windows PowerShell 5.1 only. Dot-source, do not `&`.

function Read-UpstreamLock {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { throw "upstream lock not found: $Path" }

    $lock = @{}
    foreach ($raw in (Get-Content -LiteralPath $Path)) {
        $line = $raw.Trim()
        if ($line.Length -eq 0) { continue }
        if ($line.StartsWith('#')) { continue }
        $parts = $line -split '\s+'
        if ($parts.Length -ne 2) { throw "upstream lock line is not '<key> <sha>': $line" }
        $lock[$parts[0]] = $parts[1]
    }
    if ($lock.Count -eq 0) { throw "upstream lock $Path has no entries" }
    return $lock
}

# The two clones scripts/setup.ps1 creates must sit at the shas the lock names. Reports BOTH before
# throwing, so a bump that moved one and not the other is one message rather than two runs.
function Assert-ClonePins {
    param([Parameter(Mandatory = $true)][string]$Root)
    . (Join-Path $PSScriptRoot 'OverlayHash.ps1')

    $lock = Read-UpstreamLock -Path (Join-Path $Root 'scripts\upstream.lock')
    $wrong = New-Object System.Collections.Generic.List[string]
    foreach ($rel in @('engine/server', 'engine/content')) {
        $dir = Join-Path $Root ($rel -replace '/', '\')
        if (-not (Test-Path -LiteralPath (Join-Path $dir '.git'))) {
            $wrong.Add("$rel is not a clone at $dir; run scripts/setup.ps1")
            continue
        }
        $pinned = [string]$lock[$rel]
        if ([string]::IsNullOrEmpty($pinned)) {
            $wrong.Add("$rel has no pinned sha in scripts/upstream.lock")
            continue
        }
        $head = Get-CloneHead -CloneRoot $dir
        if ($head -ne $pinned) {
            $wrong.Add("$rel is at $head, scripts/upstream.lock pins $pinned")
        }
    }

    if ($wrong.Count -gt 0) {
        foreach ($w in $wrong) { Write-Host "    $w" }
        throw "the pinned clones do not match scripts/upstream.lock; run scripts/setup.ps1 to re-pin. Every overlay drift check resolves the CLONE's HEAD, so on a stale clone it compares each recorded hash against the blob it was taken from and can only agree."
    }
    Write-Host "  engine/server and engine/content match scripts/upstream.lock."
}

# Two shapes a hand-edited lock takes, and the empty file that would make Assert-ClonePins skip
# everything silently. Runs before any real parse, and never reads this repository.
function Assert-LockParsing {
    $dir = Join-Path $env:TEMP ('upstream-lock-selftest-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $dir | Out-Null
    try {
        $good = Join-Path $dir 'good.lock'
        [System.IO.File]::WriteAllLines($good, @('# a comment', '', 'engine/server abc123', 'client def456'))
        $parsed = Read-UpstreamLock -Path $good
        if ($parsed.Count -ne 2) { throw "Assert-LockParsing: expected 2 entries, got $($parsed.Count)" }
        if ($parsed['engine/server'] -ne 'abc123') { throw "Assert-LockParsing: engine/server parsed as $($parsed['engine/server'])" }

        $empty = Join-Path $dir 'empty.lock'
        [System.IO.File]::WriteAllLines($empty, @('# nothing but comments'))
        $threw = $false
        try { Read-UpstreamLock -Path $empty } catch { $threw = $true }
        if (-not $threw) { throw "Assert-LockParsing: an all-comment lock must throw, or Assert-ClonePins would silently check nothing" }

        $malformed = Join-Path $dir 'bad.lock'
        [System.IO.File]::WriteAllLines($malformed, @('engine/server abc123 extra'))
        $threw = $false
        try { Read-UpstreamLock -Path $malformed } catch { $threw = $true }
        if (-not $threw) { throw "Assert-LockParsing: a three-field line must throw" }
    } finally {
        Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
```

- [ ] **Step 2: Run the self-test and the real check**

```powershell
powershell -NoProfile -Command ". scripts\lib\UpstreamLock.ps1; Assert-LockParsing; Assert-ClonePins -Root (Get-Location).Path; 'ok'"
```

Expected: `engine/server and engine/content match scripts/upstream.lock.` then `ok`. Then mutate `scripts/upstream.lock:5`'s sha by one character, re-run, expect the throw naming both shas, and undo.

- [ ] **Step 3: Wire the pin check into `verify.ps1` as step 2's first sub-step**

Immediately after `Write-Step 'engine overlay (apply + drift check)'` at `:103`, before the apply:

```powershell
# First, because everything below it is only meaningful on a clone at the pinned revision: both
# -Check implementations resolve the CLONE's HEAD, so a stale clone makes every recorded hash agree
# with the blob it was taken from and both checks pass vacuously. Audit C23.
. (Join-Path $PSScriptRoot 'lib\UpstreamLock.ps1')
Assert-LockParsing
Assert-ClonePins -Root $root
```

Rename the step label to `'engine and content overlays (pins, apply, drift)'` so the printed name matches what it now does.

- [ ] **Step 4: Wire it into `start-stack.ps1`**

At the top, before the content overlay call at `:20`:

```powershell
. (Join-Path $PSScriptRoot 'lib\UpstreamLock.ps1')
Assert-LockParsing
Assert-ClonePins -Root $root
```

- [ ] **Step 5: Read every exit code in `setup.ps1`**

Add the helper below the `$bun` check at `:8`, copied from `verify.ps1:76-79` so both files carry the same shape:

```powershell
# A native command's non-zero exit does NOT throw under $ErrorActionPreference = 'Stop', and a
# .ps1 invoked with `&` that runs `exit 1` sets $LASTEXITCODE without throwing either. This file
# had nine such calls and read none of them, so tools/pack/BuildOverlay.ts's process.exit(1) -- the
# whole output of the pack-id guard -- ended with "setup complete". Audit C23.
function Invoke-Native {
    param([string]$Description)
    if ($LASTEXITCODE -ne 0) { throw "$Description failed (exit $LASTEXITCODE)" }
}
```

Then add a call after each of the nine: `git clone` (`:31`), `git fetch` (`:36`), `git checkout` (`:45`), `npm install` (`:51`), `& $overlay` (`:109`), `& $engineOverlay` (`:119`), `npx tsx tools/pack/BuildOverlay.ts` (`:132`), `& $bun install` in `client/` (`:136`) and in `wiki/` (`:143`). Each description names the step, for example `Invoke-Native "content overlay ($rel)"`.

Also replace the inline lock parsing at `:16-22` with:

```powershell
. (Join-Path $PSScriptRoot 'lib\UpstreamLock.ps1')
Assert-LockParsing
$lock = Read-UpstreamLock -Path (Join-Path $root 'scripts\upstream.lock')
```

Do **not** call `Assert-ClonePins` from `setup.ps1`: this is the script that creates and re-pins the clones, so asserting the pin before it has run would refuse to bootstrap a fresh checkout.

- [ ] **Step 6: Read every exit code in `start-stack.ps1`, and stop it walking past a dead engine**

Add the same `Invoke-Native` helper. Call it after `& $overlay` (`:23`), `& $engineOverlay` (`:33`) and `& $bun run build:dev` (`:84`).

Then replace **`:66-80`**, the engine's `Start-Process` together with the poll loop and the warning. The range includes `:66` on purpose: `$procs` is an array and the engine is the process appended there, so the block below needs it to assign `$engineProc` rather than to append anonymously. An implementer who replaces only `:68-80` leaves `:66` in place, starts a SECOND engine against the same port and the same log file, and `$engineProc` then tracks one of the two.

```powershell
$engineProc = Start-Process -PassThru -NoNewWindow -WorkingDirectory "$root\engine\server" -FilePath "cmd.exe" -ArgumentList "/c","npx","tsx","src/app.ts" -RedirectStandardOutput "$root\logs\engine.log"
$procs += $engineProc

# Ruling R16. Ask for a clean close first and escalate only if it is ignored. `taskkill /T /F` is
# TerminateProcess: the engine's safeExit never runs and the owner-bank flush, which runs every 100
# ticks, is skipped, so up to about 60 seconds of bank state is discarded. Audit C23 named this at
# start-stack.ps1 and verify.ps1 both. Five seconds is the whole cost when a process ignores WM_CLOSE.
function Stop-Tracked {
  foreach ($p in $procs) { try { if (-not $p.HasExited) { & taskkill /PID $p.Id /T *> $null } } catch {} }
  $wait = (Get-Date).AddSeconds(5)
  do {
    $alive = @($procs | Where-Object { try { -not $_.HasExited } catch { $false } })
    if ($alive.Count -eq 0) { break }
    Start-Sleep -Milliseconds 250
  } until ((Get-Date) -gt $wait)
  foreach ($p in $procs) { try { if (-not $p.HasExited) { & taskkill /PID $p.Id /T /F *> $null } } catch {} }
}

Write-Host "waiting for the engine to come up (first run packs the cache, ~7 min)..."
$deadline = (Get-Date).AddMinutes(10)
$engineUp = $false
do {
  Start-Sleep 3
  # HasExited, not only the log: a crash in the first three seconds used to be waited on for ten
  # minutes and then warned about. app.ts's packAll path exits 1 on a pack-id violation, and this
  # is the only place that would ever see it.
  if ($engineProc.HasExited) {
    Stop-Tracked
    throw "the engine exited with code $($engineProc.ExitCode) before reporting 'World ready'. See logs/engine.log; a pack-id violation exits 1 from src/app.ts."
  }
  if (Test-Path "$root\logs\engine.log") {
    $log = Get-Content "$root\logs\engine.log" -Raw -ErrorAction SilentlyContinue
    if ($log -and $log -match 'World ready') { $engineUp = $true }
  }
} until ($engineUp -or (Get-Date) -gt $deadline)
if (-not $engineUp) {
  # This used to print "continuing anyway" and start the front server on a dead world. It is false
  # green 2 in docs/VERIFICATION.md, and nothing below this line can work without the engine.
  Stop-Tracked
  throw "the engine did not report 'World ready' within 10 minutes. See logs/engine.log."
}
```

Then point the `finally` at `:100` at the same helper, so Ctrl+C takes the graceful path too. That is the case audit C23 actually cared about, because Ctrl+C is how a local session ends:

```powershell
try { Wait-Process -Id ($procs | ForEach-Object Id) } finally { Stop-Tracked }
```

Keep the comment above it, which explains why `taskkill /T` is used rather than `Stop-Process`, and extend it with the escalation's reason.

Give `verify.ps1`'s `Stop-ProcessTree` (`:51-59`) the same two phases, for the same reason: `verify.ps1` step 10 starts the engine through `start-stack.ps1 -Prod` and stops it from this helper.

```powershell
function Stop-ProcessTree {
    param([System.Diagnostics.Process]$Process)
    if ($null -eq $Process) { return }
    # Ruling R16: /T asks, /T /F takes. /F is TerminateProcess, so the engine's safeExit and its
    # owner-bank flush (every 100 ticks) never run and up to about 60 seconds of bank state is lost.
    try {
        if ($Process.HasExited) { return }
        & taskkill /PID $Process.Id /T *> $null
        $wait = (Get-Date).AddSeconds(5)
        while (-not $Process.HasExited -and (Get-Date) -lt $wait) { Start-Sleep -Milliseconds 250 }
        if (-not $Process.HasExited) { & taskkill /PID $Process.Id /T /F *> $null }
    } catch {}
}
```

- [ ] **Step 7: Prove the exit codes are actually read**

```bash
sed -i 's/^367=banktab_size_9$/368=banktab_size_9/' content-custom/pack/varp.pack
powershell -File scripts/setup.ps1; echo "exit=$?"
git checkout -- content-custom/pack/varp.pack
```

Expected: `setup.ps1` FAILS at the pack step with `pack (BuildOverlay) failed (exit 1)` and never prints `setup complete`. Before this task the same mutation ended with `setup complete`. This run re-clones nothing and takes a few minutes at most because the clones and installs are idempotent.

Then the dead-engine path:

```powershell
powershell -File scripts/start-stack.ps1 -Prod
```

with `server/.env` temporarily renamed so the engine refuses to start, or simply Ctrl+C the engine's window; expect a throw within seconds naming the exit code, and expect no front server on 8787 afterwards. Restore `server/.env`.

Then the graceful stop (ruling R16). Start the stack, wait for `World ready`, note the size and mtime of the owner-bank JSON under `engine/server/data/`, play nothing, and Ctrl+C:

```powershell
powershell -File scripts/start-stack.ps1 -Prod
```

Expected: the stop takes a beat rather than being instant, and `logs/engine.log` ends with the engine's own shutdown lines rather than stopping mid-sentence. If the log shows no clean shutdown at all, `taskkill /T` was ignored and the five second escalation did the work; that is the case `/F` still covers, so it is not a failure. **Record in the ledger which of the two happened**, because it is what tells the next session whether R16 bought the flush or only the chance of one.

- [ ] **Step 8: Correct the two documents that describe the old behaviour**

`docs/VERIFICATION.md`: false green 2 (`start-stack.ps1` continues when the engine never came up) is closed; rewrite it as a closed row naming the throw, or move it out of the false-greens list and into the step 2 description. The tier 3 table's "Clone shas match the lock" row moves from **by hand today** to `inside verify.ps1's overlay step`. Leave false green 1 (`content-overlay.ps1 -Check` cannot fail, `docs/VERIFICATION.md:154`) to **Task 10 Step 3**, which is where it is closed; Task 4 rewrites `content-custom/README.md` and does not touch `docs/VERIFICATION.md`. Leave the client-fork row to Task 7.

- [ ] **Step 9: Verify**

```powershell
powershell -File scripts/line-ceiling.ps1
powershell -NoProfile -Command ". scripts\lib\UpstreamLock.ps1; Assert-LockParsing; 'ok'"
powershell -File scripts/setup.ps1
powershell -File scripts/engine-overlay.ps1 -Check
powershell -File scripts/content-overlay.ps1 -Check
```

Expected: the ceiling passes (`setup.ps1` grows to roughly 170 lines, `start-stack.ps1` to roughly 135 with `Stop-Tracked`, `verify.ps1` by about 6, `UpstreamLock.ps1` is about 105), the self-test passes, `setup.ps1` runs to `setup complete`, and both drift checks exit 0.

- [ ] **Step 10: Commit**

```bash
git add scripts/lib/UpstreamLock.ps1 scripts/setup.ps1 scripts/start-stack.ps1 scripts/verify.ps1 docs/VERIFICATION.md
git -c core.safecrlf=false commit -m "fix(gates): read every exit code, and check both clones against the lock

setup.ps1 made nine native calls and read none of their exit codes, so
BuildOverlay.ts's process.exit(1), which is the entire output of the pack-id guard,
ended with 'setup complete'. Watched failing on a mutated varp.pack before and after.

Nothing had ever compared a clone to scripts/upstream.lock. That matters because both
overlay drift checks resolve the CLONE's HEAD, so on a stale clone every recorded hash
agrees with the blob it was taken from and the check passes vacuously.
Assert-ClonePins now runs first in verify.ps1's overlay step and at the top of
start-stack.ps1, with Assert-LockParsing proving the parser rejects an all-comment
lock rather than silently checking nothing.

start-stack.ps1 throws when the engine exits or never reports World ready, instead of
printing 'continuing anyway' and starting the front server on a dead world. That is
false green 2 in docs/VERIFICATION.md.

Both scripts also stop tracked processes with taskkill /T first and escalate to /T /F
after five seconds. /F is TerminateProcess, so the engine's safeExit never ran and the
owner-bank flush, which runs every 100 ticks, was skipped: up to about 60 seconds of
bank state was discarded on every Ctrl+C. Ruling R16.

Audit C23.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 6: A removal path for both overlays, and an unlisted overlay file becomes fatal

**Files:**
- Modify: `scripts/lib/OverlayHash.ps1` (gains `Sync-OverlayRemovals` and `Assert-OverlayRemoval`)
- Modify: `scripts/engine-overlay.ps1:194-240` (the apply path; the unlisted check moves ABOVE the copy loop at `:203-221`)
- Modify: `scripts/content-overlay.ps1:97-148` (the apply path; same move, above the copy loop at `:110-132`, and the `exit 0` Task 4 added stays last)
- Modify: `content-custom/README.md:29`, `engine-custom/README.md` (both say "nothing is ever removed")
- Test: `Assert-OverlayRemoval` inside the library, run on every invocation.

**Interfaces:**
- Consumes: `Invoke-GitInClone` from Task 4.
- Produces: `Sync-OverlayRemovals -CloneRoot <string> -CurrentPaths <string[]> -> string[]` (the forward-slash relative paths it removed or restored).

- [ ] **Step 1: Write the removal function and its self-test**

Append to `scripts/lib/OverlayHash.ps1`:

```powershell
# THE REMOVAL PATH. Both overlay scripts only ever copied, and both README files said so:
# "nothing is ever duplicated or removed". scripts/setup.ps1's `git checkout -q -f <sha>` restores
# TRACKED files and leaves untracked ones, so an overlay file deleted from engine-custom/ or
# content-custom/ survives in the clone on the machine that had applied it, and nowhere else.
# Nobody else sees it, and nobody sees that it is gone. Audit C23.
#
# The record is a `.overlay-manifest` sidecar in the clone root. Both clone roots are under
# /engine/, which .gitignore:8 covers, so it is never tracked, and checkout -f leaves it alone,
# which is what makes it useful across a re-pin. On each apply, every path in the previous sidecar
# that is no longer in the current source set is RESTORED from the clone's git objects if git knows
# it, and DELETED if git does not (a "new" overlay file has no upstream counterpart).
function Sync-OverlayRemovals {
    param(
        [Parameter(Mandatory = $true)][string]$CloneRoot,
        [AllowEmptyCollection()][string[]]$CurrentPaths
    )
    $sidecar = Join-Path $CloneRoot '.overlay-manifest'
    $removed = New-Object System.Collections.Generic.List[string]

    $current = New-Object System.Collections.Generic.HashSet[string]
    foreach ($p in $CurrentPaths) { [void]$current.Add($p) }

    if (Test-Path -LiteralPath $sidecar) {
        foreach ($raw in (Get-Content -LiteralPath $sidecar)) {
            $p = $raw.Trim()
            if ($p.Length -eq 0) { continue }
            if ($current.Contains($p)) { continue }

            $full = Join-Path $CloneRoot ($p -replace '/', '\')
            $restore = Invoke-GitInClone -CloneRoot $CloneRoot -GitArgs @('checkout', '--', $p)
            if ($restore.ExitCode -ne 0) {
                if (Test-Path -LiteralPath $full) { Remove-Item -LiteralPath $full -Force }
                $removed.Add("$p (deleted; no upstream file)")
            } else {
                $removed.Add("$p (restored from upstream)")
            }
        }
    }

    [System.IO.File]::WriteAllLines($sidecar, [string[]]$CurrentPaths)
    return $removed.ToArray()
}

# Proves the removal path both removes and restores, against a throwaway repository. Without this
# the function's first real run would be its first test, on a clone somebody cares about.
function Assert-OverlayRemoval {
    $dir = Join-Path $env:TEMP ('overlay-removal-selftest-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $dir | Out-Null
    try {
        $tracked = Join-Path $dir 'tracked.txt'
        [System.IO.File]::WriteAllText($tracked, "upstream`n")
        Push-Location $dir
        try {
            & git init -q .
            & git config core.autocrlf false
            & git config user.email 'selftest@example.invalid'
            & git config user.name 'selftest'
            & git add tracked.txt
            & git -c core.safecrlf=false commit -q -m selftest
            if ($LASTEXITCODE -ne 0) { throw "Assert-OverlayRemoval could not build its fixture repository (git exit $LASTEXITCODE)" }
        } finally { Pop-Location }

        # Apply one: the overlay owns a replaced file and a brand new one.
        [System.IO.File]::WriteAllText($tracked, "ours`n")
        $untracked = Join-Path $dir 'ours.txt'
        [System.IO.File]::WriteAllText($untracked, "ours`n")
        $none = Sync-OverlayRemovals -CloneRoot $dir -CurrentPaths @('tracked.txt', 'ours.txt')
        if ($none.Count -ne 0) { throw "Assert-OverlayRemoval: a first apply removed $($none.Count) file(s), expected 0" }

        # Apply two: both are gone from the overlay source.
        $gone = Sync-OverlayRemovals -CloneRoot $dir -CurrentPaths @()
        if ($gone.Count -ne 2) { throw "Assert-OverlayRemoval: expected 2 removals, got $($gone.Count): $($gone -join ', ')" }
        if (Test-Path -LiteralPath $untracked) { throw 'Assert-OverlayRemoval: a new overlay file with no upstream counterpart must be deleted' }
        $restored = [System.IO.File]::ReadAllText($tracked)
        if ($restored -ne "upstream`n") { throw "Assert-OverlayRemoval: a replaced file must go back to upstream's bytes, got '$restored'" }
    } finally {
        Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
```

Call `Assert-OverlayRemoval` beside `Assert-OverlayHashing` in both scripts.

- [ ] **Step 2: Run the self-test, and watch it fail**

```powershell
powershell -NoProfile -Command ". scripts\lib\OverlayHash.ps1; Assert-OverlayRemoval; 'ok'"
```

Expected: `ok`. Then delete the `Remove-Item` line inside `Sync-OverlayRemovals`, re-run, and expect `a new overlay file with no upstream counterpart must be deleted`. Undo.

- [ ] **Step 3: Call it from both apply paths, and make an unlisted file fatal**

**The unlisted check moves ABOVE the copy loop.** At HEAD it sits after it (`engine-overlay.ps1:226-233` follows the loop at `:203-221`; `content-overlay.ps1:137-147` follows the loop at `:110-132`), which was harmless while it only printed a note. As a `throw` it is not: the stray file would be copied into the clone first, and the throw would then skip `Sync-OverlayRemovals`, so the sidecar would never learn about it and the stray `.pack` would sit in `engine/content/pack/` forever, read by `BuildOverlay.ts`'s `assertPinnedIds` and by `app.ts`'s guard. So compute `$sourcePaths` once, immediately after `$sourceFiles`, check it there, and leave only the removal call below the loop.

`scripts/engine-overlay.ps1`: delete the printed-note block at `:226-233`, and insert this **between** the `$sourceFiles` enumeration at `:195-197` and the copy loop at `:203`:

```powershell
$manifest = Get-EngineManifest
$manifestPaths = New-Object System.Collections.Generic.HashSet[string]
if ($manifest -and $manifest.files) { foreach ($e in @($manifest.files)) { if ($e.path) { [void]$manifestPaths.Add([string]$e.path) } } }
$sourcePaths = @($sourceFiles | ForEach-Object { $_.FullName.Substring($customRoot.Length + 1).Replace('\', '/') })
$unlisted = @($sourcePaths | Where-Object { -not $manifestPaths.Contains($_) })
if ($unlisted.Count -gt 0) {
    foreach ($p in $unlisted) { Write-Host "    not in manifest.json: $p" }
    # Was a printed note. An overlay file that is not in the manifest is copied over upstream on
    # every apply and is checked by NOTHING, forever: -Check only ever walks manifest entries, and
    # verify.ps1's git-tracked check reads the same list. The manifest is the definition of what
    # the overlay is, so a file outside it is not an overlay file. Audit C23.
    throw "engine-custom holds $($unlisted.Count) file(s) that engine-custom/manifest.json does not list; add them with a kind and a baseSha256, or delete them"
}
```

Then, at the END of the apply path where the printed note used to be, only the removal call:

```powershell
$removed = Sync-OverlayRemovals -CloneRoot $baseRoot -CurrentPaths $sourcePaths
if ($removed.Count -gt 0) {
    Write-Host "  removed from the clone (no longer in engine-custom/):"
    foreach ($p in $removed) { Write-Host "    $p" }
}
```

`scripts/content-overlay.ps1` gets the mirror, in the same three places and the same order. Its source enumeration at `:102-104` also adopts the engine's skip list so the two agree:

```powershell
# Same skip list as scripts/engine-overlay.ps1:44 and deploy/docker/engine.Dockerfile:51-53, and at
# ANY depth rather than at the root only. Before this, content-custom/scripts/README.md would have
# landed in the clone locally and not in the image, a divergence nothing reported.
$skipNames = @('README.md', 'PATCHES.md', 'manifest.json', '.gitkeep')
$sourceFiles = @(Get-ChildItem -LiteralPath $customRoot -Recurse -File | Where-Object {
  $_.DirectoryName -ne $customRoot -and $skipNames -notcontains $_.Name
})
```

The content variant of the unlisted check is not a straight copy of the engine one: Task 4 renamed `Get-OverlayManifest` to `Get-ContentManifest` and changed its return from `@($obj.files)` to the parsed object, so the mirror reads `.files` off it. It goes immediately below the enumeration above:

```powershell
$manifest = Get-ContentManifest
$manifestPaths = New-Object System.Collections.Generic.HashSet[string]
if ($manifest -and $manifest.files) { foreach ($e in @($manifest.files)) { if ($e.path) { [void]$manifestPaths.Add([string]$e.path) } } }
$sourcePaths = @($sourceFiles | ForEach-Object { $_.FullName.Substring($customRoot.Length + 1).Replace('\', '/') })
$unlisted = @($sourcePaths | Where-Object { -not $manifestPaths.Contains($_) })
if ($unlisted.Count -gt 0) {
  foreach ($p in $unlisted) { Write-Host "    not in manifest.json: $p" }
  throw "content-custom holds $($unlisted.Count) file(s) that content-custom/manifest.json does not list; add them with a kind and a baseSha256, or delete them"
}
```

and the removal call replaces the printed note at `:137-147`, **above** the `exit 0` Task 4 added:

```powershell
$removed = Sync-OverlayRemovals -CloneRoot $baseRoot -CurrentPaths $sourcePaths
if ($removed.Count -gt 0) {
  Write-Host "  removed from the clone (no longer in content-custom/):"
  foreach ($p in $removed) { Write-Host "    $p" }
}
```

- [ ] **Step 4: Prove both halves on the real tree**

The unlisted check:

```bash
touch content-custom/pack/scratch.pack
powershell -File scripts/content-overlay.ps1; echo "exit=$?"
ls engine/content/pack/scratch.pack
rm content-custom/pack/scratch.pack
powershell -File scripts/content-overlay.ps1; echo "exit=$?"
```

Expected: `exit=1` naming `pack/scratch.pack`; the `ls` FAILS, because Step 3 put the check above the copy loop so nothing was written into the clone; then `exit=0`. If the `ls` succeeds, the check is still below the copy loop: move it, delete `engine/content/pack/scratch.pack` by hand, and run the sequence again. That distinction is the whole point of the move, because a throw below the loop also skips `Sync-OverlayRemovals`, so the sidecar never records the stray and nothing ever removes it.

The removal path, end to end: add a real temporary overlay file with a manifest row, apply, confirm it landed in the clone, delete both, apply again, and confirm the clone no longer has it.

```bash
mkdir -p content-custom/scripts/selftest
echo "// removal path proof" > content-custom/scripts/selftest/tmp.rs2
# add {"path": "scripts/selftest/tmp.rs2", "kind": "new", "baseSha256": null} to content-custom/manifest.json
powershell -File scripts/content-overlay.ps1
ls engine/content/scripts/selftest/tmp.rs2          # exists
rm -r content-custom/scripts/selftest
git checkout -- content-custom/manifest.json
powershell -File scripts/content-overlay.ps1
ls engine/content/scripts/selftest/tmp.rs2          # must be gone
cat engine/content/.overlay-manifest                 # five paths, none of them the deleted one
```

Expected: the second apply prints `removed from the clone (no longer in content-custom/): scripts/selftest/tmp.rs2 (deleted; no upstream file)` and the `ls` fails. **Before this task that file would have stayed in the clone forever.**

The restore half (a `replace` entry going back to upstream's bytes) is proven by `Assert-OverlayRemoval` against a fixture repository rather than against `engine/content`: the only `replace` entries here are the four pinned packs, and un-pinning one to watch it come back is a destructive way to learn what the self-test already asserts. Record in the ledger that the restore branch was proven there.

- [ ] **Step 5: Correct both README files**

`content-custom/README.md:29` and the matching sentence in `engine-custom/README.md` both say "nothing is ever duplicated or removed on repeat runs". Replace with:

```markdown
Re-running is safe: byte-identical files are left untouched and changed files are overwritten.
A file **deleted** from this directory is removed from the clone on the next apply, restored to
upstream's copy where one exists and deleted where it does not. The record is a `.overlay-manifest`
sidecar in the clone root, which is git-ignored and survives `scripts/setup.ps1`'s force checkout.
Every file here must be listed in `manifest.json`; one that is not fails the apply, because
`-Check` only ever walks manifest entries and an unlisted file would be checked by nothing.
```

Update the same two scripts' `.SYNOPSIS` blocks, which repeat the claim at `:10-11` in each.

- [ ] **Step 6: Verify**

```powershell
powershell -File scripts/line-ceiling.ps1
powershell -File scripts/engine-overlay.ps1
powershell -File scripts/engine-overlay.ps1 -Check
powershell -File scripts/content-overlay.ps1
powershell -File scripts/content-overlay.ps1 -Check
```

Expected: all pass, both sidecars exist (`engine/server/.overlay-manifest` with 34 paths, `engine/content/.overlay-manifest` with 5), and `git status --short` shows nothing under `engine/`, which is git-ignored. `scripts/lib/OverlayHash.ps1` is now roughly 220 lines, still well under the ceiling.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/OverlayHash.ps1 scripts/engine-overlay.ps1 scripts/content-overlay.ps1 content-custom/README.md engine-custom/README.md
git -c core.safecrlf=false commit -m "feat(gates): give both overlays a removal path and refuse an unlisted file

Both scripts only ever copied, and setup.ps1's checkout -f restores tracked files and
leaves untracked ones, so a file deleted from an overlay directory survived in the
clone on the machine that had applied it and nowhere else. A .overlay-manifest sidecar
in each clone root now records what the last apply owned; anything that leaves the
source set is restored from upstream where a blob exists and deleted where it does
not. Assert-OverlayRemoval proves both branches against a throwaway repository.

An overlay file missing from manifest.json is now a failure rather than a printed
note: -Check only ever walks manifest entries and verify.ps1 reads the same list, so
an unlisted file was copied over upstream on every apply and checked by nothing. The
unlisted set is empty at HEAD, so this is a ratchet. The content overlay also adopts
the engine's skip list at any depth, closing a divergence with the Dockerfile's copy.

Audit C23.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 7: The patch runner, its self-test, and `client/PATCHES.md` in the typed grammar

**Files:**
- Create: `scripts/patches-check.ps1`
- Modify: `client/PATCHES.md` (six `sh` fences at `:46`, `:55`, `:78`, `:103`, `:121`, `:142` become `patches-check` fences; patch 9 gains its row; the fence headings say to run the script)
- Modify: `scripts/verify.ps1` (one sub-step inside step 2)
- Modify: `docs/VERIFICATION.md:133` and the tier 2 "what a full green does not mean" paragraph
- Test: `Assert-PatchMatching` inside `scripts/patches-check.ps1`, run before the real pass.

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `scripts/patches-check.ps1`, callable as `powershell -File scripts/patches-check.ps1` (checks every configured record) or `-Only client` / `-Only engine`. Task 8 adds the engine record and the pristine-tree check to it.
- The row grammar, which Task 8 reuses verbatim:
  ```
  ```patches-check
  root: client
  # a comment line
  <tag> | <mode> | <expected> | <file> | <literal>
  ```
  ```
  Split on the **first four** pipes only, so a literal may contain pipes. `<mode>` is `contains`, `startswith` or `after:<n>`. The literal is everything after the fourth pipe with exactly one leading space removed and trailing whitespace trimmed, so a leading-indent literal is written with its indent after that one delimiter space.

- [ ] **Step 1: Write the runner**

`scripts/patches-check.ps1`:

```powershell
<#
.SYNOPSIS
  Runs the machine-readable patch assertions in client/PATCHES.md and engine-custom/PATCHES.md.

.DESCRIPTION
  Audit C24: 28 numbered patches inside a 14,481-line file rested on grep lines in a shell fence
  that no script ran, and one of them (patch 9) had no runnable proof at all while the block's own
  heading said "How to verify all patches are present".

  WHY NOT PARSE THE OLD `grep -c "..." file  # N` LINES. The dialect they used has five shapes:
  plain substring, BRE-escaped brackets, a `^` anchor, a `\|` alternation, and one `grep -A5 ... |
  grep -c` pipeline. The audit proposed running each with Select-String -SimpleMatch, which is
  wrong for eight of the 104 lines: seven become false failures and one, the assertion that packet
  logging and auto-login were never vendored from rs-sdk, becomes a false PASS. The repository had
  already shipped one such defect: client/PATCHES.md's patch 28 table row escaped a table-cell pipe
  as `\|`, which grep reads as alternation and answers 7 instead of 1. So the rows carry the
  LITERAL text and express anchoring structurally, and this script never sees a shell command.

  THE ROW GRAMMAR. Inside a ```patches-check fence: one `root: <path>` directive, then
      <tag> | <mode> | <expected> | <file> | <literal>
  split on the FIRST FOUR pipes only, so a literal containing a pipe survives verbatim. Blank lines
  and lines starting with # are notes. Modes:
      contains      <expected> lines contain the literal
      startswith    <expected> lines start with it (the old ^ anchored greps)
      after:<n>     <expected> lines within <n> lines AFTER the previous row's matches contain it
                    (the old grep -A5 pipeline; patch 27's polarity check)
  The literal is everything after the fourth pipe with ONE leading space removed and trailing
  whitespace trimmed, so an indent-sensitive literal is written with its indent after that space.

  A row whose target file does not exist is a FAILURE, never a skip. engine/server is a git-ignored
  clone, so on a tree where scripts/setup.ps1 has not run the engine record's targets are absent,
  and a skip that reads as green is exactly what this exists to remove.

  Windows PowerShell 5.1 only.

.PARAMETER Only
  'client' or 'engine'. Default: every record.
#>
param([ValidateSet('client', 'engine')][string]$Only)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function ConvertTo-PatchRows {
    param([Parameter(Mandatory = $true)][string[]]$Lines, [Parameter(Mandatory = $true)][string]$Source)
    $rows = New-Object System.Collections.Generic.List[psobject]
    $inFence = $false
    $fenceRoot = ''

    for ($i = 0; $i -lt $Lines.Count; $i++) {
        $line = $Lines[$i]
        $trimmed = $line.Trim()

        if (-not $inFence) {
            # Only a ```patches-check fence. engine-custom/PATCHES.md carries two other fenced
            # blocks, a repro command and a packing recipe, which a runner that treated every fence
            # as assertions would try to execute.
            if ($trimmed -eq '```patches-check') { $inFence = $true; $fenceRoot = '' }
            continue
        }
        if ($trimmed -eq '```') { $inFence = $false; continue }
        if ($trimmed.Length -eq 0) { continue }
        if ($trimmed.StartsWith('#')) { continue }
        if ($trimmed.StartsWith('root:')) { $fenceRoot = $trimmed.Substring(5).Trim(); continue }

        $parts = $line -split '\|', 5
        if ($parts.Count -ne 5) { throw "${Source}:$($i + 1): a row needs 5 pipe-separated fields, got $($parts.Count): $trimmed" }
        if ($fenceRoot.Length -eq 0) { throw "${Source}:$($i + 1): this fence has no 'root:' line" }

        $expectedText = $parts[2].Trim()
        $expected = 0
        if (-not [int]::TryParse($expectedText, [ref]$expected)) { throw "${Source}:$($i + 1): expected count '$expectedText' is not an integer" }

        $literal = $parts[4]
        if ($literal.StartsWith(' ')) { $literal = $literal.Substring(1) }
        $literal = $literal.TrimEnd()
        if ($literal.Length -eq 0) { throw "${Source}:$($i + 1): the literal is empty" }

        $rows.Add([pscustomobject]@{
            Source   = $Source
            Line     = $i + 1
            Tag      = $parts[0].Trim()
            Mode     = $parts[1].Trim()
            Expected = $expected
            Root     = $fenceRoot
            File     = $parts[3].Trim()
            Literal  = $literal
        })
    }

    if ($inFence) { throw "${Source}: a patches-check fence is never closed" }
    return $rows.ToArray()
}

function Measure-PatchRows {
    param([Parameter(Mandatory = $true)][psobject[]]$Rows, [Parameter(Mandatory = $true)][string]$Base)
    $failures = New-Object System.Collections.Generic.List[string]
    $lastHits = @()

    foreach ($row in $Rows) {
        $full = Join-Path (Join-Path $Base ($row.Root -replace '/', '\')) ($row.File -replace '/', '\')
        if (-not (Test-Path -LiteralPath $full)) {
            $failures.Add("$($row.Source):$($row.Line) [$($row.Tag)] file not found :: $($row.Root)/$($row.File)")
            $lastHits = @()
            continue
        }

        $lines = @(Get-Content -LiteralPath $full)
        $hits = New-Object System.Collections.Generic.List[int]

        if ($row.Mode -eq 'contains') {
            for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i].Contains($row.Literal)) { [void]$hits.Add($i) } }
        } elseif ($row.Mode -eq 'startswith') {
            for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i].StartsWith($row.Literal)) { [void]$hits.Add($i) } }
        } elseif ($row.Mode -like 'after:*') {
            $span = 0
            if (-not [int]::TryParse($row.Mode.Substring(6), [ref]$span)) { throw "$($row.Source):$($row.Line): 'after:' needs a line count" }
            foreach ($anchor in $lastHits) {
                $to = [Math]::Min($lines.Count - 1, $anchor + $span)
                for ($i = $anchor + 1; $i -le $to; $i++) { if ($lines[$i].Contains($row.Literal)) { [void]$hits.Add($i) } }
            }
        } else {
            throw "$($row.Source):$($row.Line): unknown mode '$($row.Mode)'"
        }

        if ($hits.Count -ne $row.Expected) {
            $failures.Add("$($row.Source):$($row.Line) [$($row.Tag)] expected $($row.Expected) got $($hits.Count) :: $($row.Literal) :: $($row.Root)/$($row.File)")
        }
        # An after: row measures against the PREVIOUS anchor row, so it must not become the anchor.
        if ($row.Mode -notlike 'after:*') { $lastHits = @($hits) }
    }

    return $failures.ToArray()
}
```

- [ ] **Step 2: Write the self-test, and make it carry the literal-pipe regression**

Append to the same file:

```powershell
# The precedent is Assert-LineCounting in scripts/line-ceiling.ps1: a gate whose first run is green
# and that nobody has watched fail is worth nothing. Four fixture rows for the three ways a row can
# be wrong plus one that must pass, and a FIFTH that is the regression test for the defect this
# grammar exists to remove: a literal containing a pipe. A self-test that only proved "a broken row
# is reported" would still have shipped the escaped-alternation bug.
function Assert-PatchMatching {
    $dir = Join-Path $env:TEMP ('patches-check-selftest-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path (Join-Path $dir 'zone') | Out-Null
    try {
        $sample = Join-Path (Join-Path $dir 'zone') 'Sample.ts'
        [System.IO.File]::WriteAllLines($sample, [string[]]@(
            'private objIconDataUrl(id: number, count: number): string | null {',
            '    walkTo(x: number, z: number, opts: WalkOptions) {',
            'if (!this.attended) {',
            '    // two stock assignments',
            '    this.out.p1isaac(ClientProt.IDLE_TIMER);',
            'present twice',
            'present twice'
        ))

        $doc = Join-Path $dir 'FIXTURE.md'
        [System.IO.File]::WriteAllLines($doc, [string[]]@(
            '```patches-check',
            'root: zone',
            '# a note the parser must ignore',
            'pipe-literal | contains | 1 | Sample.ts | private objIconDataUrl(id: number, count: number): string | null {',
            'indent | startswith | 1 | Sample.ts |     walkTo(x: number, z: number',
            'anchor | contains | 1 | Sample.ts | if (!this.attended) {',
            'context | after:5 | 1 | Sample.ts | ClientProt.IDLE_TIMER',
            'polarity | contains | 0 | Sample.ts | if (this.attended) {',
            'wrong-count | contains | 1 | Sample.ts | present twice',
            'absent | contains | 1 | Sample.ts | this literal is not in the file',
            'missing-file | contains | 1 | Nope.ts | anything at all',
            '```'
        ))

        $rows = ConvertTo-PatchRows -Lines (Get-Content -LiteralPath $doc) -Source 'FIXTURE.md'
        if ($rows.Count -ne 8) { throw "Assert-PatchMatching: parsed $($rows.Count) rows, expected 8 (a note line or the root directive was counted as a row)" }

        $failures = Measure-PatchRows -Rows $rows -Base $dir
        $reported = @($failures | ForEach-Object { ($_ -split '\[')[1] -replace '\].*', '' })
        $expected = @('wrong-count', 'absent', 'missing-file')
        $diff = Compare-Object -ReferenceObject $expected -DifferenceObject $reported
        if ($null -ne $diff) {
            throw "Assert-PatchMatching: reported [$($reported -join ', ')], expected exactly [$($expected -join ', ')]. Full output:`n$($failures -join "`n")"
        }
    } finally {
        Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
```

- [ ] **Step 3: Write the record definitions and the report**

Append:

```powershell
# One record per patch log. Floor: a parse that matched nothing would pass forever, and this is the
# same guard scripts/line-ceiling.ps1:140 carries for the same reason. Raise a floor when a fence
# grows; the script PRINTS the real counts so no document has to quote one (the client-patch skill
# claimed "All 81 currently pass" against a mechanical count of 65).
$records = @(
    @{ Name = 'client'; Doc = 'client/PATCHES.md'; Floor = 60; Coverage = $true }
)

Assert-PatchMatching

$selected = $records
if ($Only) { $selected = @($records | Where-Object { $_.Name -eq $Only }) }
if ($selected.Count -eq 0) { throw "no patch record named '$Only'" }

$allFailures = New-Object System.Collections.Generic.List[string]
foreach ($record in $selected) {
    $docPath = Join-Path $root ($record.Doc -replace '/', '\')
    if (-not (Test-Path -LiteralPath $docPath)) { throw "patch record not found: $($record.Doc)" }

    $lines = @(Get-Content -LiteralPath $docPath)
    $rows = ConvertTo-PatchRows -Lines $lines -Source $record.Doc
    if ($rows.Count -lt $record.Floor) {
        throw "$($record.Doc) parsed $($rows.Count) assertion(s), floor $($record.Floor). A green from an empty parse would mean nothing; if the fences really shrank, lower the floor in scripts/patches-check.ps1 and say why."
    }

    foreach ($f in (Measure-PatchRows -Rows $rows -Base $root)) { $allFailures.Add($f) }

    $patchIds = @()
    if ($record.Coverage) {
        # Every numbered row in the patches table must have at least one assertion. This is what
        # catches patch 9, whose only "grep that proves it" lived in the table and in no fence, so a
        # copy-paste of the block verified 27 of 28 while reading as complete.
        $tableIds = New-Object System.Collections.Generic.List[string]
        foreach ($line in $lines) {
            if ($line -match '^\|\s*(\d+b?)\s*\|') { $tableIds.Add($Matches[1]) }
        }
        if ($tableIds.Count -lt 29) { throw "$($record.Doc): found $($tableIds.Count) numbered patch rows in the table, expected at least 29" }

        $tagged = New-Object System.Collections.Generic.HashSet[string]
        foreach ($rowItem in $rows) {
            if ($rowItem.Tag -match '^patch\s+(\d+b?)$') { [void]$tagged.Add($Matches[1]) }
        }
        foreach ($id in $tableIds) {
            if (-not $tagged.Contains($id)) {
                $allFailures.Add("$($record.Doc) [coverage] patch $id has no assertion row; add one to a patches-check fence")
            }
        }
        $patchIds = @($tableIds)
    }

    $summary = "  $($record.Doc): $($rows.Count) assertion(s)"
    if ($record.Coverage) {
        # The ROW count and the HIGH-WATER MARK are different numbers and both get printed, because
        # the two documents that quote one (the client-patch skill and docs/README.md) mean the mark.
        # 21b is a real table row, so the rows are 29 while the numbering is at 28; printing only the
        # row count would hand the next session a mechanical-looking 29 to reconcile against a
        # correct 28. Ruling R7: printed, never asserted, so patch 29 needs no constant edited.
        $maxPatch = 0
        foreach ($id in $patchIds) {
            $n = [int]($id -replace '[^0-9]', '')
            if ($n -gt $maxPatch) { $maxPatch = $n }
        }
        $summary = "$summary across $($patchIds.Count) numbered patch row(s); numbering is at $maxPatch"
    }
    Write-Host $summary
}

if ($allFailures.Count -gt 0) {
    Write-Host "`n$($allFailures.Count) patch assertion(s) failed:"
    foreach ($f in $allFailures) { Write-Host "  $f" }
    throw "the patch records do not match the tree. Either a patch was lost (re-apply it) or the record is stale (update the row and say so in the patch table)."
}

Write-Host "patches-check: every assertion holds."
exit 0
```

- [ ] **Step 4: Run the self-test before converting anything**

```powershell
powershell -File scripts/patches-check.ps1
```

Expected: it fails at the floor, because `client/PATCHES.md` has no `patches-check` fence yet and parses 0 rows. That is the right failure. Then mutate `Measure-PatchRows` so a missing file `continue`s without recording a failure, re-run, and expect `Assert-PatchMatching` to throw naming `missing-file`. Undo.

- [ ] **Step 5: Convert `client/PATCHES.md`'s six fences**

Mechanical. For each `grep -c "<pattern>" <file>  # <n>` line: the mode is `contains` unless the pattern started with `^` (then `startswith`, with the `^` dropped and the indent preserved), the expected count is the integer after the `#`, and the literal is the pattern with every BRE escape removed (`\[` becomes `[`, `\]` becomes `]`).

**The tag comes from the patches table's "Grep that proves it" column at `:162-190`, not from the fence heading.** A heading covers a range (`:78` covers patches 17 to 21), which under-determines the tag for all 17 rows under it, and one of the table's rows is `21b`. So: find the table row whose proof string is this pattern, and tag the assertion with that row's number. Where a fence row has no table counterpart (the `tsconfig` fence at `:46`, the polarity and hygiene rows) keep a descriptive tag; only `patch <n>` tags feed the coverage set. Five rows need more than the mechanical rule:

- `client/PATCHES.md:91`, the four-name alternation expecting 0, becomes **four** rows, one per name, each `contains | 0`. Each is now individually nameable, which is the point: it is the assertion that packet logging, auto-login, agent mode and the bot overlay were never vendored from rs-sdk.
- `client/PATCHES.md:130`, the `grep -A5 ... | grep -c` pipeline, becomes an `after:5` row directly under the `contains` row it measures from. The order matters and the comment above the fence must say so.
- `client/PATCHES.md:63`'s `if (this.headlessTitle) {` at count 2 is the table's proof for patch 7 (`:168` says "first of two hits"); tag it `patch 7`. Patch 25's proof is `private armedLoginHit(): boolean {` (`:187`), which already has a fence row at `:124`: **retag that existing row `patch 25`, do not add a second one.**
- **Patch 21b needs a row and the plan names it explicitly**, because the heading rule would never produce the tag. Its proof at `:183` is `this.hookGameTick++;`, so the row is:
  ```
  patch 21b | contains | 1 | src/client/Client.ts | this.hookGameTick++;
  ```
  Run that literal by hand first and use the count it gives.
- **Patch 9 gains the row it never had.** Its proof is `client/PATCHES.md:170`'s `skip the credential form`, which appears in no fence; the anchor is `client/src/client/Client.ts:3851`.

The first fence becomes:

````markdown
Run `powershell -File scripts/patches-check.ps1` from the repository root. `scripts/verify.ps1`
runs it in its overlay step, so this block is checked on every gate rather than pasted by hand.
The rows below are data, not shell: `<tag> | <mode> | <expected> | <file> | <literal>`, split on
the first four pipes so a literal may contain a pipe. That is not decoration. This file's own patch
28 table row escapes a table-cell pipe as `\|`, and grep reads that as alternation and answers 7
instead of 1.

```patches-check
root: client
tsconfig | contains | 1 | tsconfig.check.json | "exclude": ["out", "node_modules"]
tsconfig | contains | 1 | package.json | tsconfig.check.json
tsconfig | contains | 0 | tsconfig.json | exclude
```
````

and the patches 1-16 fence begins:

```patches-check
root: client
patch 1 | contains | 1 | src/client/Client.ts | from '#/hooks/install.js'
patch 2 | contains | 1 | src/client/Client.ts | private hooksEmitter: Emitter<HookEvents>
patch 3 | contains | 1 | src/client/Client.ts | const installed = installHooks({
patch 4 | contains | 1 | src/client/Client.ts | this.hooksEmitter?.emit('login', { gameName: this.loginUser })
patch 5 | contains | 1 | src/client/Client.ts | if (this.loginResolver && !this.ingame) {
patch 6 | contains | 1 | src/client/Client.ts | reason: 'Unable to connect to the world.'
patch 7 | contains | 2 | src/client/Client.ts | if (this.headlessTitle) {
patch 7 | contains | 1 | src/client/Client.ts | if (this.pendingHeadlessLogin) {
patch 8 | contains | 1 | src/client/Client.ts | // idlescape headless title: the character name
patch 9 | contains | 1 | src/client/Client.ts | skip the credential form
patch 10 | contains | 1 | src/client/Client.ts | const events = diffXp(this.prevStatXP
```

and so on for the remaining rows, in the fences' existing order. The patch 24-27 fence's tail is:

```patches-check
patch 27 | contains | 1 | src/client/Client.ts | if (!this.attended) {
patch 27 | after:5 | 1 | src/client/Client.ts | ClientProt.IDLE_TIMER
patch 27 | contains | 0 | src/client/Client.ts | if (this.attended) {
patch 27 | contains | 1 | src/client/Client.ts | this.idleTimer = now;
patch 24 | contains | 0 | src/client/Client.ts | Waiting for idlescape...
```

Keep the prose at `:133-138` that explains the polarity check; add one sentence saying the `after:5` row must stay directly below its anchor row because it measures from the previous row's matches.

- [ ] **Step 6: Run the runner against the converted file**

```powershell
powershell -File scripts/patches-check.ps1
```

Expected: a line of the shape `client/PATCHES.md: <n> assertion(s) across 29 numbered patch row(s); numbering is at 28`, then `patches-check: every assertion holds.`

`<n>` should land near 70: the six fences hold 65 rows at HEAD (measured, 3 + 17 + 19 + 12 + 8 + 6), plus patch 9's new row, plus patch 21b's, minus the four-name alternation row and plus its four replacements. **Use the number the script prints, not an arithmetic guess**, and put it nowhere but the ledger. `29` and `28` are both expected and are different numbers on purpose: `21b` is a real table row, so the rows are 29 while the numbering is at 28.

If any row fails, it is a conversion error, not a lost patch: every one of the 65 original greps was measured passing at HEAD. Compare the failing row's literal against the original `grep` pattern character by character; the usual cause is a leftover `\[`.

- [ ] **Step 7: Prove it catches a removed patch**

```bash
python3 - <<'PY'
p='client/src/client/Client.ts'
s=open(p,encoding='utf-8').read()
open(p,'w',encoding='utf-8').write(s.replace("private hooksEmitter: Emitter<HookEvents>","private hooksEmitterRenamed: Emitter<HookEvents>",1))
PY
powershell -File scripts/patches-check.ps1; echo "exit=$?"
git checkout -- client/src/client/Client.ts
powershell -File scripts/patches-check.ps1
```

Expected: `exit=1` with `[patch 2] expected 1 got 0`, then a clean run after the checkout. **This is the mutation the task exists for; do not skip it.** Also delete patch 9's new row temporarily and confirm the coverage check reports `patch 9 has no assertion row`.

- [ ] **Step 8: Wire it into `verify.ps1`**

Inside step 2, after the manifest-tracked sub-step:

```powershell
Write-SubStep '(cont.) patch records (scripts/patches-check.ps1)'
& (Join-Path $PSScriptRoot 'patches-check.ps1')
Invoke-Native 'patch records'
```

It goes here rather than at step 1 because Task 8 adds the engine record, whose targets live in `engine/server` with the overlay applied. One invocation, one call site. `$TotalSteps` does not move.

- [ ] **Step 9: Correct the documents that say this does not exist**

- `docs/VERIFICATION.md:133`, the tier 3 row "Client fork patches still applied ... by hand today. `scripts/patches-check.ps1` is audit C24 and does not exist yet", becomes `inside verify.ps1's overlay step`.
- The tier 2 "what a full green does not mean" paragraph loses "running a single `PATCHES.md` grep" from its list; the clone-sha and content-overlay clauses were already removed by Tasks 4 and 5, so this sentence should now be checked in full and rewritten to name only what is genuinely still uncovered.
- The step 2 row in the tier 2 table gains the pin check, the content overlay and the patch runner.

- [ ] **Step 10: Verify**

```powershell
powershell -File scripts/line-ceiling.ps1
powershell -File scripts/patches-check.ps1
cd client
bun run typecheck
```

Expected: the ceiling passes (`scripts/patches-check.ps1` lands around 230 lines; if it crosses 400 the parser moves to `scripts/lib/PatchRows.ps1` rather than losing comments), the runner is green, and the client fork still typechecks, which proves the `PATCHES.md` edits touched no source.

- [ ] **Step 11: Commit**

```bash
git add scripts/patches-check.ps1 client/PATCHES.md scripts/verify.ps1 docs/VERIFICATION.md
git -c core.safecrlf=false commit -m "feat(gates): run the client fork's patch record on every verify

28 numbered patches inside a 14,481-line file rested on grep lines no script ran, and
patch 9 had no runnable proof at all while the block's heading said it verified them
all. scripts/patches-check.ps1 parses a typed row grammar instead of shell: the rows
carry the literal text and express anchoring structurally, split on the first four
pipes so a literal may contain one.

That is not theoretical. This file's patch 28 table row escapes a table-cell pipe as
backslash-pipe, which grep reads as alternation and answers 7 instead of 1, and the
audit's proposed Select-String -SimpleMatch runner would have turned seven rows into
false failures and made the never-vendored-from-rs-sdk assertion a false pass.

Assert-PatchMatching runs before every real pass over a throwaway fixture and asserts
the exact set of reported failures, with a literal-pipe row as the regression test. A
missing target file is a failure, never a skip; a parse under the floor throws; and
every numbered patch in the table must have an assertion, which is what patch 9 now
has. Watched failing on a renamed hooksEmitter field.

Audit C24.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 8: The engine record, and the pristine-274 claim made mechanical

**Files:**
- Modify: `engine-custom/PATCHES.md:857-900` (the one `sh` verify fence becomes a `patches-check` fence; the other two fences at `:479-482` and `:560-563` are a repro command and a packing recipe and stay `sh`)
- Modify: `scripts/patches-check.ps1` (a second record, and the pristine-tree check)
- Modify: `scripts/upstream.lock` (two rows, ruling R14)
- Modify: `client/PATCHES.md:32-35` (the pristine claim gains the sentence saying what checks it)
- Modify: `client/src/vendor/PATCHES.md`, `web/src/vendor/PATCHES.md` (a `patches-check` fence each)
- Test: `Assert-PatchMatching` already covers the matcher; this task's own proof is a watched failure of the pristine check.

**Interfaces:**
- Consumes: Task 7's `ConvertTo-PatchRows`, `Measure-PatchRows` and `$records`.
- Produces: `scripts/upstream.lock` gains `client-import <sha>` and `rs-sdk <sha>`, which Task 9's revision-bump procedure reads.

- [ ] **Step 1: Add the two lock rows**

`scripts/upstream.lock` at HEAD is 7 lines. Append, keeping the comment block's shape:

```
# The client fork's IMPORT commit into this repository, the base the pristine-274 claim in
# client/PATCHES.md is measured against (scripts/patches-check.ps1). Not an upstream sha.
# rs-sdk is the third-party bot surface vendored under client/src/vendor and web/src/vendor
# (MaxBittker/rs-sdk, MIT); it is itself a fork of Client-TS 274 and does not move with the client.
client-import dec1dc58d3b958aadadeb341b51886cd3f855383
rs-sdk 56b73e08fc01a1d683d7a86d145a494ae945d071
```

`scripts/setup.ps1` iterates a fixed `$repos` hashtable, and `scripts/build.ps1:79-84` reads only `engine/content`, so neither is affected. Confirm with `powershell -File scripts/setup.ps1` at the end of this task.

- [ ] **Step 2: Convert `engine-custom/PATCHES.md`'s verify fence**

Same mechanical conversion as Task 7, with `root: engine/server`. The 39 rows measured at HEAD in the `:861-899` fence, plus the two Task 2 added and the three Task 3 added, so expect 44. There is no coverage set here: this record has no numbered patch table. Five rows need care:

- The counts carry trailing prose. `# 1  (an external apply is never bumped twice)` and thirteen more. The prose moves to a `#` note line above the row, or is dropped; the expected count is the bare integer in field 3.
- `:868`'s `OWNER_KEY_RE = /\^\[A-Za-z0-9_-\]{1,64}\$/` loses every backslash and becomes the literal `OWNER_KEY_RE = /^[A-Za-z0-9_-]{1,64}$/`, mode `contains`. Verified: `grep -cF` with the literal answers 1 against `engine/server/src/idlescape/ownerBank.ts`.
- One pattern here contains a `#`, `import '#/idlescape/install.js';` at `:861` (the other four `#` patterns in the repository are in `client/PATCHES.md` at `:57`, `:97`, `:98` and `:148`, which is Task 7's record). Under the old grammar the count marker was the LAST `# <digits>` on the line and a naive parser truncated such a pattern; under this grammar the `#` is just a character inside field 5 and needs nothing.
- Two rows reach outside the root: `../content/scripts/interface_bank/configs/banktab.varp` and `../content/pack/varp.pack`. They stay exactly that, as the `file` field; `Join-Path` plus `Test-Path` resolve `..` correctly. Tag them `content`.
- The `:561` fence tells the reader to run `pwsh`; Task 3 already corrected it. Confirm rather than re-edit.

The fence heading becomes:

````markdown
## How to verify all patches are present

`scripts/patches-check.ps1` runs these, and `scripts/verify.ps1` runs it, so this block is a gate
rather than a checklist. The rows are data: `<tag> | <mode> | <expected> | <file> | <literal>`,
relative to the applied overlay in `engine/server`. Six of them target upstream files the overlay
does not replace (the anchors), which exist only in the clone, so this record cannot run before
`scripts/setup.ps1` has cloned it. A missing file is reported as a failure, never skipped.

```patches-check
root: engine/server
install | contains | 1 | src/app.ts | import '#/idlescape/install.js';
owner | contains | 1 | src/server/ClientSocket.ts | ownerHeader: string | null = null;
```
````

Note that the second row above is itself a literal containing a pipe, and it is the reason the
splitter takes only the first four.

- [ ] **Step 3: Add the engine record and the pristine check to the runner**

In `scripts/patches-check.ps1`, extend `$records`:

```powershell
$records = @(
    @{ Name = 'client'; Doc = 'client/PATCHES.md'; Floor = 60; Coverage = $true },
    @{ Name = 'engine'; Doc = 'engine-custom/PATCHES.md'; Floor = 40; Coverage = $false },
    @{ Name = 'client'; Doc = 'client/src/vendor/PATCHES.md'; Floor = 3; Coverage = $false },
    @{ Name = 'client'; Doc = 'web/src/vendor/PATCHES.md'; Floor = 2; Coverage = $false }
)
```

Then add the pristine-tree check, after the record loop and before the failure report:

```powershell
# client/PATCHES.md:32 asserts "everything else in client/ is the pristine 274 tree except the call
# sites below", and nothing checked it: the greps cover 28 anchors and say nothing about the other
# ~97 files. Measured when this landed, `git diff --name-status <import> HEAD -- client/` was 32
# paths, four of them modifications of upstream files and 28 additions inside three directories, so
# an allowed-path set makes the claim mechanical with zero exceptions to carve out.
if (-not $Only -or $Only -eq 'client') {
    $lock = @{}
    foreach ($raw in (Get-Content -LiteralPath (Join-Path $root 'scripts\upstream.lock'))) {
        $line = $raw.Trim()
        if ($line.Length -eq 0 -or $line.StartsWith('#')) { continue }
        $parts = $line -split '\s+'
        if ($parts.Length -eq 2) { $lock[$parts[0]] = $parts[1] }
    }
    $importSha = [string]$lock['client-import']
    if ([string]::IsNullOrEmpty($importSha)) { throw "scripts/upstream.lock has no client-import row; the pristine-274 claim in client/PATCHES.md cannot be checked without it" }

    $allowedFiles = @(
        'client/PATCHES.md', 'client/bundle.ts', 'client/package.json', 'client/tsconfig.check.json',
        'client/src/client/Client.ts'
    )
    $allowedPrefixes = @('client/src/hooks/', 'client/src/plugins/', 'client/src/vendor/')

    $changed = @()
    try {
        $ErrorActionPreference = 'Continue'
        $changed = @(& git -C $root diff --name-only $importSha HEAD -- client/)
    } finally { $ErrorActionPreference = 'Stop' }
    if ($LASTEXITCODE -ne 0) { throw "git diff against the client import commit $importSha failed; is it still reachable from HEAD?" }
    if ($changed.Count -eq 0) { throw "git diff against $importSha listed no changed paths under client/, which cannot be right: bundle.ts, package.json, PATCHES.md and Client.ts all carry our edits" }

    foreach ($p in $changed) {
        $path = $p -replace '\\', '/'
        if ($allowedFiles -contains $path) { continue }
        $ok = $false
        foreach ($prefix in $allowedPrefixes) { if ($path.StartsWith($prefix)) { $ok = $true } }
        if (-not $ok) {
            $allFailures.Add("client/PATCHES.md [pristine] $path differs from the 274 import $($importSha.Substring(0, 7)) and is not a numbered-patch file. Record it as a numbered patch, or add it to the allowed set in scripts/patches-check.ps1 with a reason.")
        }
    }
    Write-Host "  client/: $($changed.Count) path(s) differ from the 274 import, all inside the numbered-patch set."

    # The lock's rs-sdk row is otherwise read by nothing. The two vendor fences assert the sha
    # STRING against their own PATCHES.md, which is a different file from the lock, so without this
    # the two could drift apart silently and a bump could update one and not the other. Measured at
    # HEAD: the sha appears once in each vendor record.
    $rsSdk = [string]$lock['rs-sdk']
    if ([string]::IsNullOrEmpty($rsSdk)) { throw "scripts/upstream.lock has no rs-sdk row; the two vendor records pin a sha that nothing would then cross-check" }
    foreach ($vendorDoc in @('client\src\vendor\PATCHES.md', 'web\src\vendor\PATCHES.md')) {
        $vendorPath = Join-Path $root $vendorDoc
        if (-not (Test-Path -LiteralPath $vendorPath)) { throw "vendor record not found: $vendorDoc" }
        $vendorText = [System.IO.File]::ReadAllText($vendorPath)
        if (-not $vendorText.Contains($rsSdk)) {
            $allFailures.Add("$($vendorDoc -replace '\\', '/') [lock] does not name the rs-sdk sha $($rsSdk.Substring(0, 7)) that scripts/upstream.lock pins")
        }
    }
    Write-Host "  rs-sdk: scripts/upstream.lock and both vendor records name the same sha."
}
```

**The lock's `client` row stays unenforced, deliberately.** `Assert-ClonePins` (Task 5) iterates `engine/server` and `engine/content` only, because `client/` is a tracked directory rather than a clone with a HEAD to read; what actually stands in for it is `client-import`, which the block above diffs against. Task 10 Step 7 records that in the ledger's "does not close" list rather than leaving it implied.

- [ ] **Step 4: Give both vendor records their first fence**

`client/src/vendor/PATCHES.md` has **no** fenced block at all and `web/src/vendor/PATCHES.md` has none either, against the convention `engine-custom/PATCHES.md:7-9` states. Neither can be made complete in this entry (the eight "provenance header only" rows at `web/src/vendor/PATCHES.md:17-24` would each want a sha pin, which is a bigger piece of work). What lands here is the pin and the licence, which is cheap and is what a bump actually has to re-check:

Every literal below was measured at HEAD, and the two trees are **not** mirrors, which is why they get different rows. `client/src/vendor/rs-sdk/` holds `bot/` and `lite/`; `web/src/vendor/rs-sdk/` holds only `sdk/` and `LICENSE`, so there is no `bot/ActionExecutor.ts` on the web side and a row naming one would be a file-not-found, which ruling R9 makes a hard failure. Note also that the literal is `MIT License` and not `MIT`: `MIT` occurs twice in the licence text (`:1` and `:16`, "WARRANTIES OF MERCHANTABILITY"), while `MIT License` occurs once in each file.

```patches-check
root: client/src/vendor
rs-sdk pin | contains | 1 | PATCHES.md | 56b73e08fc01a1d683d7a86d145a494ae945d071
rs-sdk licence | contains | 1 | rs-sdk/LICENSE | MIT License
rs-sdk no-anticheat | contains | 0 | rs-sdk/bot/ActionExecutor.ts | ANTICHEAT
```

```patches-check
root: web/src/vendor
rs-sdk pin | contains | 1 | PATCHES.md | 56b73e08fc01a1d683d7a86d145a494ae945d071
rs-sdk licence | contains | 1 | rs-sdk/LICENSE | MIT License
```

The web record therefore gets `Floor = 2` in Step 3's `$records`, not 3. Record in each file, in one sentence, that the eight header-only files listed at `web/src/vendor/PATCHES.md:17-24` are still unpinned and that closing that is not this entry's, so the gap is written down rather than implied. If a third web-side row is wanted, pick a real target under `rs-sdk/sdk/`, run the literal by hand first, and use the count it gives, never a guessed one.

- [ ] **Step 5: Run the whole runner**

```powershell
powershell -File scripts/patches-check.ps1
```

Expected: four record lines, the pristine line, and `patches-check: every assertion holds.` If the engine record reports files not found, `scripts/setup.ps1` and `scripts/engine-overlay.ps1` have not run; run them, and note that this is exactly the case the "never skip" rule exists for.

- [ ] **Step 6: Prove the pristine check catches a stray file**

```bash
echo "// stray" > client/src/util/stray.ts
git add client/src/util/stray.ts
powershell -File scripts/patches-check.ps1; echo "exit=$?"
git rm -f --cached client/src/util/stray.ts; rm client/src/util/stray.ts
powershell -File scripts/patches-check.ps1
```

Expected: `exit=1` with `[pristine] client/src/util/stray.ts differs from the 274 import`, then clean. `git diff --name-only <sha> HEAD` sees staged content only after a commit, so if the staged file does not trip it, commit it on a scratch branch, prove it, and reset. Record which form was used.

- [ ] **Step 7: Update `client/PATCHES.md`'s pristine paragraph**

`:32-35` claims it and says nothing about who checks it. Add, in the shape entry 2 used for the typecheck at `:37-38`:

```markdown
`scripts/patches-check.ps1` checks that claim mechanically: it diffs `client/` against the import
commit recorded as `client-import` in `scripts/upstream.lock` and fails on any changed path outside
`bundle.ts`, `package.json`, `tsconfig.check.json`, `PATCHES.md`, `src/client/Client.ts` and the
three directories that are ours (`src/hooks/`, `src/plugins/`, `src/vendor/`). So the roughly 97
files no grep will ever mention are covered too. Audit C24 found this unchecked.
```

- [ ] **Step 8: Verify**

```powershell
powershell -File scripts/line-ceiling.ps1
powershell -File scripts/patches-check.ps1
powershell -File scripts/setup.ps1
cd client
bun run typecheck
```

Expected: the ceiling passes, the runner is green across four records plus the pristine check, `setup.ps1` still runs to `setup complete` with the two new lock rows present, and the client fork typechecks.

- [ ] **Step 9: Commit**

```bash
git add engine-custom/PATCHES.md scripts/patches-check.ps1 scripts/upstream.lock client/PATCHES.md client/src/vendor/PATCHES.md web/src/vendor/PATCHES.md
git -c core.safecrlf=false commit -m "feat(gates): run the engine record too, and check the pristine 274 claim

engine-custom/PATCHES.md's verify fence joins the runner. Its dialect was heavier than
the client's, with BRE-escaped brackets, five patterns containing a hash and two rows
reaching into ../content, and only one of its three fenced blocks was ever assertions:
the other two are a repro command and a packing recipe a naive runner would execute.
The typed grammar makes all three unambiguous.

client/PATCHES.md's "everything else is the pristine 274 tree" was unchecked and is
now one diff against the import commit, recorded as client-import in
scripts/upstream.lock beside the rs-sdk pin, which had lived only in prose. Thirty two
paths differ, four of them modifications, all inside a natural allowed set, so the
roughly 97 files no grep mentions are covered. Watched failing on a stray file.

Both vendor records get their first verify fence, covering the pin and the licence.
The eight header-only files stay unpinned and the file now says so.

Audit C24.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 9: The minified bundle, and a standing revision-bump procedure

**Files:**
- Modify: `scripts/build.ps1:93-112` (immediately after the client build)
- Modify: `docs/OPERATIONS.md` (new section 10, after section 9)
- Modify: `.claude/skills/idlescape-client-patch/SKILL.md:90-97` (the file is 101 lines; there is no `:104`)
- Test: no code test. The proof is a measured before-and-after against both bundle modes.

**Interfaces:**
- Consumes: `scripts/upstream.lock`'s `client-import` and `rs-sdk` rows (Task 8).
- Produces: nothing for later tasks.

- [ ] **Step 1: Measure both bundles before writing the check**

```powershell
cd client
& "$env:USERPROFILE\.bun\bin\bun.exe" run build
```

```bash
ls -l client/out/client.js
python3 -c "
d=open('client/out/client.js','rb').read()
print('bytes', len(d), 'lines', d.count(b'\n')+1, 'bytes/line', len(d)//(d.count(b'\n')+1))
for n in ('optionIndex','armLogin','loginArmed','setRenderSuspended','setAttended','getObjIcon','getObjInfo'):
    print(n, d.count(n.encode()))
"
```

Then the same for `bun run build:dev`. **Record both bytes-per-line figures in the ledger**; the threshold in Step 2 is calibrated from them, and a threshold picked without measuring is exactly the kind of guess this entry exists to remove. Restore the prod bundle afterwards with `bun run build`.

- [ ] **Step 2: Add the assertion to `build.ps1`**

Immediately after the artifact-existence check at `:104-112`, while `client/out/client.js` is still the artifact `bun run build` just wrote:

```powershell
# --- 3b. The minified bundle still carries the reserved hook names -----------
# client/bundle.ts:82 opens terser's `reserved` list (it runs to roughly :160), and a name that
# falls out of it is mangled. For an OUTPUT name that shows up as undefined in the web; for an
# INPUT field name such as optionIndex it is worse: the action dispatches with the field dropped
# (client/PATCHES.md, patch 21). Nothing in any gate had ever looked inside the minified bundle.
#
# It runs HERE and not in verify.ps1 because verify.ps1 step 10 starts start-stack.ps1 -Prod, which
# reaches an unconditional `bun run build:dev` and OVERWRITES client/out with an unminified bundle.
# An assertion after step 9 would be reading the wrong artifact. This is also the path a release
# takes, which verify.ps1 is not.
$clientJs = Join-Path $out 'client.js'
$bundleText = [System.IO.File]::ReadAllText($clientJs)

# First prove this really is the minified artifact, or the name check below would pass happily
# against a dev bundle that never ran terser at all. Measured when this landed: prod is about
# <PROD> bytes per line, dev about <DEV>. The floor sits well below prod and well above dev.
$bundleLines = @([System.IO.File]::ReadAllLines($clientJs)).Count
$bytesPerLine = 0
if ($bundleLines -gt 0) { $bytesPerLine = [int]((Get-Item -LiteralPath $clientJs).Length / $bundleLines) }
if ($bytesPerLine -lt 200) {
    # SINGLE-quoted, with the variable pulled out first. In a double-quoted PowerShell string a
    # backtick is the escape character, so "`bun" renders as a backspace followed by "un" and
    # "`reserved" as a carriage return followed by "eserved". The string still parses; the message
    # is just corrupted at the moment an operator needs it.
    $msg = 'client/out/client.js averages ' + $bytesPerLine + ' bytes per line, which is a dev (unminified) bundle. The reserved-name check below has to run against the minified one or it proves nothing; scripts/build.ps1 must run `bun run build`, not build:dev.'
    throw $msg
}

$reserved = @('optionIndex', 'armLogin', 'loginArmed', 'setRenderSuspended', 'setAttended', 'getObjIcon', 'getObjInfo')
$mangled = @()
foreach ($name in $reserved) { if (-not $bundleText.Contains($name)) { $mangled += $name } }
if ($mangled.Count -gt 0) {
    $names = $mangled -join ', '
    throw ('the minified client bundle no longer contains ' + $names + '; check the terser `reserved` list in client/bundle.ts (it is under client/PATCHES.md''s numbered-patch regime)')
}
Write-Host "  minified bundle: $($reserved.Count) reserved hook name(s) survived ($bytesPerLine bytes/line)."
```

Replace `<PROD>` and `<DEV>` with the measured figures, and adjust `200` if the measurement says so. Do not leave the placeholders in.

- [ ] **Step 3: Prove both halves**

```bash
cd client && "$USERPROFILE/.bun/bin/bun.exe" run build:dev && cd ..
powershell -File scripts/build.ps1; echo "exit=$?"
```

Expected: `exit` non-zero at the bytes-per-line floor, because `build.ps1` rebuilds with `bun run build` first. That means this test needs the check pointed at a dev artifact deliberately: temporarily change `$clientJs` to a copy of the dev bundle, confirm the throw, and revert. Record which form was used.

Then the name half. **Do not try to remove `'optionIndex'`: it is not a literal in that file.** Measured, `grep -c "'optionIndex'" client/bundle.ts` answers 0; the name reaches the list through `...vendoredBotProperties()` at `:109`, which harvests the field names declared in `client/src/vendor/rs-sdk/bot/types.ts`, and `bundle.ts` mentions it only in a prose comment at `:25`. Mutate a name that IS a literal in the list: delete `'getObjIcon'` from `:103`, run `scripts/build.ps1`, expect the throw naming `getObjIcon`, and `git checkout -- client/bundle.ts`.

Then prove the harvested half too, since it is where `optionIndex` actually comes from: change `...vendoredBotProperties()` at `:109` to `...@()`, run `scripts/build.ps1`, expect the throw naming `optionIndex`, and revert. **`client/bundle.ts` is under the numbered-patch regime, so both mutations must be reverted before the commit; confirm with `git status --short client/`.**

- [ ] **Step 4: Write the revision-bump procedure**

`docs/OPERATIONS.md` gains a section 10. Ten ordered steps, every one runnable, ending in `npm run verify`. Write it against what is true at HEAD:

````markdown
## 10. Bumping a pinned revision

Five revisions are pinned and `scripts/upstream.lock` records all five: `engine/server` and
`engine/content` (upstream Lost City, branch 274), `client` (the fork's upstream tip),
`client-import` (the commit that imported the fork into this repository, the base
`scripts/patches-check.ps1` measures the pristine claim against) and `rs-sdk` (the vendored bot
surface, a fork of Client-TS 274 that does not move with the client).

The engine and content clones are the easy half: edit their rows, run `scripts/setup.ps1`, then
`powershell -File scripts/engine-overlay.ps1 -Check` and `powershell -File
scripts/content-overlay.ps1 -Check`. Both exit 1 naming every recorded hash that moved, and each
one is a patch to re-apply per `engine-custom/PATCHES.md`. The client fork is the long half:

1. Get the upstream history, which a fresh clone does not have. `client/.upstream-git/` is
   git-ignored (`.gitignore:29`) and no script creates it:
   ```bash
   git clone --bare https://github.com/LostCityRS/Client-TS client/.upstream-git
   git --git-dir=client/.upstream-git fetch origin '+refs/heads/*:refs/heads/*'
   ```
2. Pick the new revision and export its tree over `client/`, preserving `src/hooks/`,
   `src/plugins/`, `src/vendor/` and `tsconfig.check.json`, which are ours:
   ```bash
   git --git-dir=client/.upstream-git archive <new-sha> | tar -x -C client/ \
     --exclude 'src/hooks/*' --exclude 'src/plugins/*' --exclude 'src/vendor/*'
   ```
3. Re-apply the 28 numbered patches **in order**, locating each anchor by surrounding code and
   never by line number. Order matters inside two methods: patches 8, 9 and 24 all live in
   `titleScreenDraw()`, and 7 and 25 both live in `titleScreenLoop()`.
4. Re-apply `bundle.ts`'s terser `reserved` block (`client/bundle.ts:82` onwards). It is upstream's
   file carrying our block, so it is under the same numbered-patch regime as `Client.ts`.
5. Re-check the vendored rs-sdk deltas against the `rs-sdk` sha. `client/src/vendor/PATCHES.md`
   lists eight `Client.ts` row deviations and eleven file rows, including the deliberate ANTICHEAT
   omission and the one `as any` the repository's rule exempts. A client bump does not move rs-sdk;
   bump it separately or not at all.
6. Re-check the 274 anchors no assertion covers: `client/PATCHES.md:199-212` (patch 21's `extras`
   field table) and `:241-273` (the inventory `+1` offset, the chat type numbers, the login
   response codes). These are the claims a revision bump is most likely to falsify.
7. From `client/`: `bun run typecheck`, `bun test src/hooks src/plugins src/vendor`,
   `bun run build`.
8. `powershell -File scripts/patches-check.ps1`. Every failure names the row, the expected count,
   the actual count and the file. A row that is genuinely stale is updated **and** its patch table
   row is updated in the same commit.
9. Update `scripts/upstream.lock` (`client` to the new upstream sha, `client-import` to the commit
   that lands this bump, `rs-sdk` only if it moved), `client/PATCHES.md:3-5`, and
   `.claude/skills/idlescape-client-patch/SKILL.md:9-10`, which carries the pinned client sha.
   `scripts/patches-check.ps1` compares the lock's `rs-sdk` row to both vendor records, so a
   partial rs-sdk bump fails there. Step 8 will fail on the old
   `client-import` until this is done, which is the intended order: fix the record last.
10. `npm run verify` from the repository root.
````

- [ ] **Step 5: Correct the client-patch skill**

The file is 101 lines; every line reference below was read at HEAD. `:90-91` says "All 81 currently pass", which matches no mechanical count of anything (the fences held 65 and the table has 29 rows). `:93-97` says the grep run is by hand and that `scripts/patches-check.ps1` is audit C24 and does not exist yet. Replace both with a pointer to the runner, and add a pointer to `docs/OPERATIONS.md` section 10.

Per ruling R7, do not substitute a new number: point at the **two** numbers the runner prints and say what each means, because they differ on purpose. The runner prints an assertion count and, separately, `numbering is at 28`. It is the second that this skill's `:9-10` and `docs/README.md:43` are claiming, and the table's 29 rows (`21b` is real) is neither. Say that in one sentence so the next session does not "correct" 28 to 29.

Leave the minification note at `:99-101` alone; `scripts/build.ps1` now enforces it and Step 2 is what says so.

- [ ] **Step 6: Verify**

```powershell
powershell -File scripts/line-ceiling.ps1
powershell -File scripts/build.ps1
powershell -File scripts/patches-check.ps1
```

Expected: the ceiling passes (`build.ps1` is 136 lines at HEAD and grows to roughly 165), the build prints the reserved-name line with a real bytes-per-line figure, and the runner is green. Then `git status --short client/` must be empty, proving Step 3's mutations were reverted.

- [ ] **Step 7: Commit**

```bash
git add scripts/build.ps1 docs/OPERATIONS.md .claude/skills/idlescape-client-patch/SKILL.md
git -c core.safecrlf=false commit -m "feat(gates): assert the minified bundle, and write the revision-bump procedure

No step in any gate had ever looked inside the minified client.js, and verify.ps1
actively destroys it: step 9 builds prod, step 10 starts start-stack.ps1 -Prod, which
reaches an unconditional bun run build:dev and overwrites client/out. So the
assertion goes in build.ps1 right after the prod build, where a later step cannot
undo it, and that is also the path a release takes. It proves the artifact really is
minified before checking that the seven reserved hook names survived, because a name
check against a dev bundle proves nothing. Both figures measured, not guessed.

docs/OPERATIONS.md gains section 10, ten ordered runnable steps ending in npm run
verify, including the bare clone of client/.upstream-git that no script creates, the
within-method re-apply order for patches 8/9/24 and 7/25, and the 274 anchor claims
no assertion covers. The client-patch skill stops claiming 'All 81 currently pass',
a number no mechanical count produces, and points at the runner instead.

Audit C24.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Task 10: The full gate, the document sweep, and the audit reconciliation

**Files:**
- Modify: `docs/VERIFICATION.md` (the tier 2 table's step 2 row, the "what a full green does not mean" paragraph, the tier 3 table's three rows, the "what a green release gate still does not prove" bullets, false greens 1 and 2)
- Modify: `docs/ARCHITECTURE.md:60-61`, `:67`, `:325-343` (invariant 1)
- Modify: `README.md:35`, `docs/README.md:41-43`
- Modify: `deploy/lightsail/README.md:182-187` (three of the four "what the release gate still cannot see" bullets)
- Modify: `.claude/skills/idlescape-content-overlay/SKILL.md:25-40`, `:100-125`; `.claude/skills/idlescape-verify/SKILL.md`; `.claude/skills/idlescape-engine-overlay/SKILL.md`; `.claude/skills/idlescape-stack/SKILL.md`
- Modify: `docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md:132-133`, `:554-556`, and its section 7 change log
- Modify: `docs/superpowers/specs/2026-09-07-project-audit.md` (append one row to the "Remediation status" section, D97)
- Modify: `docs/superpowers/sprint-control.md` (the entry 3 row)
- Create: `docs/superpowers/ledgers/2026-09-07-overlay-pack-and-client-fork-gates.md`
- Test: `npm run verify`, end to end, the only task required to run it.

**Interfaces:**
- Consumes: everything Tasks 1 to 9 produced.
- Produces: nothing.

- [ ] **Step 1: Run the whole gate**

```powershell
powershell -File scripts/verify.ps1
```

About twenty five minutes. Expected: ten steps, all green, with step 2 now printing the clone pin check, both overlay applies, both drift checks, the two-manifest tracked check, the engine typecheck, the engine suites including `packIds`, and the patch runner across four records plus the pristine check. **Copy the step 2 output verbatim into the ledger.** If anything is red, fix it in the task that owns it and re-run; do not paper over it here.

- [ ] **Step 2: Assert what this entry did not redo**

Three greps, so the ledger can say "asserted" rather than "assumed":

```bash
grep -n "RUN npx tsx tools/pack/BuildOverlay.ts" deploy/docker/engine.Dockerfile   # 1 hit, ~:143
grep -n "npm run build" deploy/docker/engine.Dockerfile                             # no pack line
grep -n "tsconfig.check.json" scripts/verify.ps1 client/package.json                # the entry 2 typecheck
```

Record the results. The first two are the proof that C22's "the production build is very likely already failing" was closed by `ca8ef86` and not by this entry.

- [ ] **Step 3: Sweep `docs/VERIFICATION.md`**

This document is the authority and it is wrong in six places once this entry lands. Work through it top to bottom rather than by line number, because Tasks 4, 5 and 7 already edited parts of it:

- The tier 2 step 2 row: name every sub-check it now runs.
- "What a full green does not mean": all three clauses it lists (a `PATCHES.md` grep, the clone shas, the content overlay's `-Check`) are now covered. Rewrite the paragraph to name what is genuinely still uncovered, which is at least: the wiki corpus is not re-extracted, the minified bundle is checked in `build.ps1` and then overwritten by step 10 so the e2e never exercises it, the eight header-only vendored files carry no sha pin, and a typecheck is not proof the tests are honest.
- The tier 3 table: the content overlay row, the clone-sha row and the client-fork row all change state.
- "What a green release gate still does not prove": the first three bullets all name entry 3 as their ground. The content overlay and clone-sha bullets close; the client-fork bullet closes for the local gate and stays open for the image, because nothing ties a running image's patches to a verified commit. Say exactly that.
- False green 1 (`content-overlay.ps1 -Check` cannot fail) and false green 2 (`start-stack.ps1` continues over a dead engine) are both closed. Do **not** delete them; move them into a short "closed false greens" list with the commit that closed each, so a session reading an older document is not confused. Keep the numbering of the survivors stable.

- [ ] **Step 3b: Sweep `deploy/lightsail/README.md`**

`:182-187`, "What the release gate still cannot see", carries four bullets and this entry moves three of them. The distinction Step 3 already draws for `docs/VERIFICATION.md` applies here unchanged: **a gap can close for the local gate and stay open for the image**, and this file is about the image.

- `:183`, "`scripts/content-overlay.ps1 -Check` exits 0 even on drift (false green 1). Entry 3's ground." The false green is gone: `-Check` reads the upstream blob and exits 1, and `verify.ps1` runs it. What stays true for the release gate is that there is still **no health field** for the content overlay, so a running image is not asked whether it carries one. Rewrite the bullet to say exactly that, and drop "Entry 3's ground."
- `:184-186`, the clone shas. `Assert-ClonePins` now compares both clones to `scripts/upstream.lock` in `verify.ps1` and in `start-stack.ps1`, but that is the build machine, not the box: nothing compares a **running image's** shas to the lock. This bullet **stays open**, narrowed to the image, with the local half named as closed.
- `:187`, "Whether the client fork's 28 numbered patches are present. Greps run by hand. Entry 3, audit C24." The greps are no longer run by hand; `scripts/patches-check.ps1` runs them inside `npm run verify`. Narrow this the same way: the patches are checked on the build machine, and nothing ties them to the image that ships, which is the fourth bullet's point and is where this one now merges.
- The fourth bullet, "nothing ties an image to a verified commit", is untouched and is still true.

Do not renumber "false green 1" here; the numbering lives in `docs/VERIFICATION.md` and Step 3 keeps it stable.

- [ ] **Step 4: Sweep `docs/ARCHITECTURE.md`**

- `:60`, "Content overlay must not drift ... Written but never run by a gate" becomes enforced, naming the verify sub-step.
- `:61`, "Client fork changes are numbered patches ... Manual. All 81 greps pass today; nothing runs them" becomes enforced, naming `scripts/patches-check.ps1`, and drops the number (ruling R7).
- `:67`, "Pack ids are pinned by name ... Not enforced" becomes enforced, naming `packIds.test.ts` and the two guarded `packAll` paths, and drops the "three of the four packs are not yet in `content-custom/pack/`" clause, which is now false.
- Invariant 1 (`:330-343`) says "Two blind spots remain": a throwing `packAll` names no files, and a wrong id that never moves is byte-identical to a right one. **The second is closed by this entry.** Rewrite that half to say `checkPack` reads the line; keep the first, which is still true.
- Add a row for the clone-sha check and one for the overlay removal path.

- [ ] **Step 5: Sweep `README.md`, `docs/README.md` and the four skills**

- `README.md:35`, the `npm run verify` row's second cell: "It does **not** run a `PATCHES.md` grep, check the clone shas, or check the content overlay for drift" is false in all three clauses. Replace with what it still does not do, and keep the Playwright trap sentence.
- `docs/README.md:41`, the content-overlay row's Verify cell, and `:43`, the client-fork row's Verify cell (`bun test src/hooks`), both become `scripts/patches-check.ps1` and the gated `-Check`.
- `.claude/skills/idlescape-content-overlay/SKILL.md`: `:29-34`'s pack table carries **pre-renumber sprint entry numbers**, saying 4 and 5 where the sprint has said 10 and 11 since D41 and D39, and `:38` says "Sprint entry 5". This is the copy a session reads while allocating an id, and a stale copy invites exactly the 217 collision section 3 exists to prevent. Fix the numbers, add the three now-pinned packs, and rewrite `:100-125`, which says `-Check` is not gated and that `packIds.test.ts` does not exist.
- `.claude/skills/idlescape-verify/SKILL.md`: its list of what a green does not cover, and its false-green list, mirror `docs/VERIFICATION.md`; make them agree.
- `.claude/skills/idlescape-engine-overlay/SKILL.md` and `.claude/skills/idlescape-stack/SKILL.md`: the removal path, the fatal unlisted file, the clone pin check and `start-stack.ps1`'s new throw.

- [ ] **Step 6: Correct the sprint spec, and leave the audit historical**

Two sentences in `docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md` are false at HEAD and both are entry 3's own text: `:132-133` and `:554-556` say the engine Dockerfile's plain `npm run build` is very likely already failing in production. Rewrite both to say it was closed by `ca8ef86` under D73 twenty three minutes after the spec landed, and **keep the adjacent sentence about `BUILD_VERIFY=false` being unreachable because `WorldConfig.ts` returns early**, which is still true. Section 3's "three of the four allocated packs are not in `content-custom/pack/`" becomes a past-tense sentence naming this entry. Add a change-log row in section 7 for both corrections.

Per D97 the audit is **not** rewritten. Append one row to its "Remediation status" section:

```markdown
| C22, C23, C24 | closed with residue | `docs/superpowers/ledgers/2026-09-07-overlay-pack-and-client-fork-gates.md` |
```

- [ ] **Step 7: Write the ledger**

`docs/superpowers/ledgers/2026-09-07-overlay-pack-and-client-fork-gates.md`, under 400 lines, following entry 2's shape: what shipped per task with its commit, the rulings as made with what each cost, the measurements (both CRLF hashes, both bundle bytes-per-line figures, the runner's printed counts, the step 2 output), the mutations watched to fail, and two sections this project requires:

- **What this entry does not close.** At least:
  - the eight header-only vendored files in `web/src/vendor/PATCHES.md:17-24` still carry no sha pin;
  - nothing ties a deployed image's patches, clone shas or pack ids to a verified commit, which is the surviving half of three `deploy/lightsail/README.md:182-187` bullets;
  - `verify.ps1` still ends with an unminified `client/out`, because step 10's `start-stack.ps1 -Prod` rebuilds it, so the e2e never exercises a minified bundle even though `build.ps1` now checks one;
  - the six allocated ids are asserted conditionally and become positive assertions only when entries 10 and 11 land;
  - `client/.upstream-git` is still created by a procedure rather than by a script (ruling R13);
  - **`map.pack` is not pinned** (D116). The sprint spec at `:535-536` says the battlebots entry also appends to `map.pack`, and `content-custom/pack/` has no copy of it, so entry 11 meets the same wall entry 3 exists to remove for `obj`, `inv` and `loc`. It is out of scope here because section 3's table allocates ids only in `obj`, `inv`, `loc` and `varp` and ruling R4 pins by that table. Measured at HEAD: `map.pack` is 966 lines in the pinned clone. Pinning it is one `git show` and one `UPSTREAM_TAIL` row with no allocations. The same sentence also names `vars.pack`, which **does not exist at the 274 pin** (`git -C engine/content show HEAD:pack/vars.pack` fails, and it is not on disk either); that is a spec error entry 11 has to resolve, not a missing pin;
  - **the lock's `client` row is read by no gate.** `Assert-ClonePins` iterates `engine/server` and `engine/content` only, because `client/` is a tracked directory rather than a clone with a HEAD to read. What stands in for it is `client-import`, which `scripts/patches-check.ps1` diffs against; the `client` row remains prose that only the revision-bump procedure reads. The `rs-sdk` row IS enforced, by the cross-check Task 8 Step 3 added.
- **Traps, for the next session.** The CRLF hazard and why `.gitattributes` closes it; the `after:<n>` row's dependence on the row above it; `$ErrorActionPreference` and native stderr; `exit N` in a `&`-called script; `Join-Path` taking two arguments; and that `engine/` is anchored in `.gitignore` so `engine-custom/src/engine/` is tracked.

- [ ] **Step 8: Update the board**

`docs/superpowers/sprint-control.md`'s entry 3 row: state, the commits, and the ledger path.

- [ ] **Step 9: Verify**

```powershell
powershell -File scripts/verify.ps1
```

Run it a second time, after the sweep, so the committed state is the state that was measured. Then:

```bash
python3 -c "
import sys,glob
bad=[]
for f in ['docs/VERIFICATION.md','docs/ARCHITECTURE.md','README.md','docs/README.md','docs/OPERATIONS.md','docs/superpowers/plans/2026-09-07-overlay-pack-and-client-fork-gates.md','docs/superpowers/ledgers/2026-09-07-overlay-pack-and-client-fork-gates.md']:
    for i,l in enumerate(open(f,encoding='utf-8'),1):
        if '—' in l: bad.append((f,i))
print(bad if bad else 'no em dashes')
"
```

`git grep -P` fails in this Git Bash ("supports only unibyte and UTF-8 locales"), which is why this is a Python pass. Expected: `no em dashes` for every file this entry wrote or rewrote. Pre-existing em dashes in files this entry only touched are not this entry's to remove.

- [ ] **Step 10: Commit**

```bash
git add docs/VERIFICATION.md docs/ARCHITECTURE.md README.md docs/README.md deploy/lightsail/README.md .claude/skills/idlescape-content-overlay/SKILL.md .claude/skills/idlescape-verify/SKILL.md .claude/skills/idlescape-engine-overlay/SKILL.md .claude/skills/idlescape-stack/SKILL.md docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md docs/superpowers/specs/2026-09-07-project-audit.md docs/superpowers/ledgers/2026-09-07-overlay-pack-and-client-fork-gates.md docs/superpowers/sprint-control.md
git -c core.safecrlf=false commit -m "docs(entry3): reconcile the documents entry 3 falsifies

npm run verify is green end to end with step 2 now carrying the clone pin check, both
overlay applies and drift checks, a two-manifest tracked check and the patch runner.

Six documents asserted, in the present tense, gaps this entry closed: verify runs no
PATCHES.md grep, does not check the clone shas, does not run the content overlay's
-Check; the content overlay check is written but never run; the client fork's greps
are manual and 'all 81 pass'; pack ids are pinned by name but not enforced; and both
false greens. Each is corrected where it stands, and the two closed false greens are
kept as a closed list so a session reading an older copy is not confused.

The content-overlay skill's pack table carried pre-renumber sprint entry numbers,
saying entries 4 and 5 where the sprint has said 10 and 11 since D41 and D39. That is
the copy a session reads while allocating an id, and the 217 collision section 3
exists to prevent is exactly what a stale copy invites.

The sprint spec's own entry 3 paragraph and its section 3 both said the engine
Dockerfile's npm run build is very likely already failing in production. It was
replaced by ca8ef86 under D73 twenty three minutes after that spec landed. Corrected
in place with a change-log row. Per D97 the audit is not rewritten; it gains one
remediation row pointing at the ledger.

Audit C22, C23, C24, closed with the residue named in the ledger.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: 6cfc8eb7-fa0f-4398-8701-64d1005b1577"
```

---

## Executor notes

**Dependency order, and whether anything can run in parallel.** Nothing can. There is one working tree, D5 rules out per-task worktrees for this sprint, and `scripts/verify.ps1`, `scripts/patches-check.ps1` and both overlay scripts are edited by more than one task each. Run 1 through 10 in order, one implementer and one reviewer per task.

The hard dependencies, so a reviewer can see which are real:

- **2 needs 1.** `packIds.test.ts` reads `content-custom/pack/obj.pack`, which does not exist until Task 1.
- **3 needs 2.** Both `packAll` call sites import `checkPack`.
- **4 must precede 6.** Task 6's apply-path edits assume Task 4's dot-source and `Get-ContentManifest` rename are in place.
- **5 needs 4.** `Assert-ClonePins` dot-sources `OverlayHash.ps1` for `Get-CloneHead`.
- **8 needs 7.** It extends `$records` and reuses `ConvertTo-PatchRows` and `Measure-PatchRows`.
- **9 needs 8** for the `client-import` and `rs-sdk` lock rows the procedure names.
- **4 needs 1.** The rewritten `-Check` throws on any entry that is not `kind: "new"` and has an empty `baseSha256`, and `content-custom/manifest.json` at HEAD has no `kind` key at all and gives `scripts/interface_bank/configs/banktab.varp` a null `baseSha256`. Run before Task 1 it throws on its first invocation. The `kind` and `base` fields arrive in Task 1 Step 6.
- **10 needs everything**, and is the only task that runs `npm run verify` end to end.

Only Task 7 is free of an upstream dependency (Task 1 has none either, but 4 now needs it). They are not reordered anyway, because Task 1 is the irreversible data risk and Task 7 is the largest diff, and finishing the cheap irreversible one first is worth more than the parallelism nobody can use.

**The slow steps, so nobody budgets them wrong.** Task 3 step 6 runs a real pack, roughly seven minutes cold. Task 5 step 7 runs `setup.ps1`, a few minutes. Task 9 step 1 runs two client builds. Task 10 runs the whole gate twice, about fifty minutes. Everything else is seconds.

**Watch every new check fail before trusting it.** Fourteen mutations are written into the steps and each names what it must print: Task 1 step 1 and step 3 (the CRLF round trip, before and after), Task 2 step 6 (a renumbered `varp.pack` through the real gate path), Task 3 step 5 (`BuildOverlay.ts` refusing before it packs), **Task 3 step 7** (the same violation through `app.ts`'s own guard, which no suite covers because `verify.ps1:170` globs `src\idlescape\*.test.ts` and `app.ts` is not there), Task 4 step 2 and step 5 (the working-tree hash reintroduced, and a mutated manifest hash), Task 5 step 7 (a swallowed exit code, and a dead engine), Task 6 step 2 and step 4 (the removal path and the unlisted file), Task 7 step 4 and step 7 (a skipped missing file, and a renamed `hooksEmitter`), Task 8 step 6 (a stray file under `client/`), Task 9 step 3 (a dev bundle, a dropped literal reserved name, and an emptied `vendoredBotProperties()`). **A task whose mutation was not run is not done**, and the ledger records what each printed.

**Reconcile against HEAD before dispatch.** Every line number in this plan was read at `1093a780`, and Tasks 4 to 8 all edit `scripts/verify.ps1`, which moves under them. Grep for the symbol, not the line.

**What this plan deliberately does not do.** It writes no numbered `Client.ts` patch, changes no pack id, releases nothing, reads nothing under `live/`, and does not rewrite the audit. It also does not close the eight header-only vendored files, does not add `-ClientBuild` to `start-stack.ps1`, and does not write `scripts/upstream-git.ps1`; each is named in a ruling with its reason, and each is in the ledger's "does not close" section so the next session does not have to rediscover it.
