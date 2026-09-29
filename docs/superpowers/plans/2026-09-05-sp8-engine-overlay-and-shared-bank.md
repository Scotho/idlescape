# SP8 — Engine overlay, production hardening, owner assertion, shared bank

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the pinned engine clone a tracked, re-appliable overlay (`engine-custom/` + `scripts/engine-overlay.ps1` + `engine-custom/PATCHES.md`), stop handing every player staff level 4, bind each game socket to the Firebase account that owns the character via a signed owner assertion the relay injects and the engine verifies against the RSA-decrypted login name, and move inventory 95 out of the per-character `.sav` into an owner-keyed shared bank store with versioned management routes, tab sizes, a change hook, and a one-time `.sav` migration.

**Architecture:** `engine-custom/` mirrors `engine/server/`; `scripts/engine-overlay.ps1` copies it over the clone before the engine starts (same shape as `scripts/content-overlay.ps1`). Five upstream files are replaced whole (`src/app.ts`, `src/server/ClientSocket.ts`, `src/web.ts`, `src/engine/entity/PlayerLoading.ts`, `src/server/login/LoginThread.ts`); everything else new lives under `src/idlescape/` and is installed at boot by `src/idlescape/install.ts`, which patches `Player.prototype.getInventory` and wraps `World.cycle`. The front server mints an HMAC owner assertion when it mints a character session, parks it in an `HttpOnly` cookie, and the WebSocket relay copies that cookie onto the upstream handshake as `X-Idlescape-Owner`; the engine's replaced `PlayerLoading.load` verifies it against the decrypted username and stamps the player's owner key. Inventory 95 for an owner-stamped player resolves to `OwnerBankStore`, persisted at `engine/server/data/banks/<ownerKey>.json`, mutated only inside the engine's single JS thread, versioned, and exposed on the loopback management port for the front server's `server/src/engine/managementClient.ts`.

**Tech Stack:** Engine — Node 24 + `tsx`, TypeScript strict, `node:test` via `npx tsx --test` (no vitest/bun in that clone), Fastify 5 for the management port. Front server — Bun (`~/.bun/bin/bun test`, Firebase emulators on 9099/8080). Web — Playwright for the stack-level e2e. Scripts — PowerShell 5.1.

**Spec:** `docs/superpowers/specs/2026-09-05-multi-character-platform-design.md` section 3 (both rulings), decision 13, section 7, section 10 SP8 row, section 11; `docs/superpowers/specs/2026-09-05-sp8b-web-bank-design.md` sections 4, 6, 7 (this sub-project owes SP8b: `tabs` in the store, the layout op set, the change hook, nine `scope=perm` tab varps).

## Global Constraints

- Strict TypeScript, no new `as any`, files under 400 lines **except** the five whole-file replacements under `engine-custom/`, which mirror their upstream sizes (348, 176, 165, 66, 62 lines). Conventional commits.
- `engine/server` and `engine/content` are git-ignored pinned clones (`scripts/upstream.lock`: engine/server `1d25566cb53e7af1b1cb18ade8af996316c19614`). **Never hand-edit them.** Every engine change is a file under `engine-custom/` plus an `engine-custom/PATCHES.md` entry with an anchor and a grep check.
- The dev `engine/server/data/config/world.json` is **not** edited by this sub-project (`node.production` stays `false`, `node.debug` stays `true` there). Production hardening is delivered as overlay behaviour plus deploy documentation for the agent who owns `deploy/`.
- Owner assertion: `HMAC-SHA256(OWNER_ASSERTION_SECRET, "cs1|<uid>|<gameName>|<expMs>")`, base64url. Cookie `cs_owner`, `HttpOnly; SameSite=Lax; Path=/`, at most 5 entries joined by `~`, TTL **12 h** (`OWNER_ASSERTION_TTL_MS = 43_200_000`). Upgrade header `X-Idlescape-Owner`.
- Fallback when the header is absent: reject in production; accept (no owner key, per-character `.sav` bank) only when the engine has `node.production=false` **and** `login.requireOwner=false`.
- Shared bank: inventory type **95**, capacity **240** (`InvType.get(95).size`), file `engine/server/data/banks/<ownerKey>.json`, `ownerKey` matches `^[A-Za-z0-9_-]{1,64}$`, file shape `{ version, tabs, slots, migrated }`, at most **9** tabs.
- Management routes bind to `127.0.0.1` only and require header `x-idlescape-mgmt` equal to the shared secret (constant-time compare).
- `POST /api/bank/ops` (browser-facing) accepts **layout ops only** (`swap`, `insert`, `moveToTab`, `setTabs`, `sort`). `delta` ops are server-internal (SP9 Contracts) and are refused with 403 on that route.
- Keep `web/e2e/gameplay.pw.test.ts`, `gate-to-game.pw.test.ts`, `characters.pw.test.ts`, `plugins.pw.test.ts` green.
- Branch: `feat/platform-shell`. Commit trailers on every commit:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Vp4QzdwPRRQGeSG7ktG5YY
  ```
- Commands (Git Bash, repo root): overlay — `pwsh scripts/engine-overlay.ps1` then `pwsh scripts/engine-overlay.ps1 -Check`; engine typecheck — `cd engine/server && npx tsc --noEmit` (verified clean on the pristine clone); engine tests — `cd engine/server && npx tsx --test src/idlescape/*.test.ts`; front server — `cd server && ~/.bun/bin/bun run typecheck && ~/.bun/bin/bun test` (emulators on 9099/8080); stack — `scripts/verify.ps1` step 6; e2e — `cd web && npm run build:e2e && npx playwright test`.

## Interfaces from earlier work

- `scripts/content-overlay.ps1` — the overlay precedent: `-Check` mode reads `content-custom/manifest.json` (`{ files: [{ path, baseSha256 }] }`), recomputes the base file hash, reports drift; default mode copies every real file under the custom root over the base root, skipping byte-identical files.
- `server/src/gate.ts` — `readCookie(req, name)`, `GATE_COOKIE`, and the `createHmac`/`timingSafeEqual` pattern this plan copies for the owner assertion.
- `server/src/characters/store.ts` — `CharacterStore.session(uid, id) -> { gameName, secret }`; `server/src/characters/routes.ts` `case 'session'` is where the assertion is minted.
- `server/src/auth/principal.ts` — `authenticate(req) -> Principal | null`; `server/src/router.ts` — `classify`, `principalRule`; `server/src/index.ts` — dispatch, gate, and the `ws` case that calls `openUpstream(env.engineWs, { origin })`.
- `server/src/proxy/ws.ts` — `openUpstream(engineWs, opts)` builds the upstream `ws` socket with `{ headers: { Origin } }`; `OpenUpstreamOptions` gains `headers` in Task 4.
- `server/src/health.ts` — `createHealth({ engineManagementHttp, ... })`, the existing consumer of `ENGINE_MANAGEMENT_HTTP`.
- Engine (read-only facts this plan depends on, all verified in the pinned clone):
  - `src/web.ts` `wsHandler(socket, req)` constructs `new WSClientSocket({...}, req.socket.remoteAddress ?? 'unknown')`; `req.headers` is in scope and unused today.
  - `src/engine/World.ts:2177` `World.loginBuf.rsadec(priv)`, `:2199-2200` `gjstr()` username/password, `:2240` `toSafeName`, `:2244-2253` the `player_login` post; `:1913` `PlayerLoading.load(username, new Packet(save), client)` inside a `try` whose `catch` sends login code 13.
  - `src/engine/World.ts:340` `cycle(): void` is synchronous and reschedules itself with `setTimeout(this.cycle.bind(this), ...)` at `:507`; `processCleanup` (`:1147-1159`) resets inv tracking **only** for `player.invs.values()`; `playerLoop` is public `readonly` (`:146`).
  - `src/engine/entity/Player.ts:1467-1490` `getInventory`, `:229-253` `save()` iterates `this.invs` only, `:1442-1450` `refreshInvs()`, `:1765` `setVar(id, value)`, `:326` `invListeners`.
  - `src/engine/Inventory.ts` — every mutation funnels through `set()` → `markDirty()` → `update = true`; `getDirtySlots()`, `resetTracking()`.
  - `src/server/login/LoginThread.ts:47-49` and `:62-67` are the two `staffmodlevel = 4` sites.
  - `src/util/WorldConfig.ts` `mergeConfig` **drops unknown keys**, so new engine config cannot live in `world.json` without replacing that 329-line file — hence the separate `data/config/idlescape.json` + env in Task 2.

---

## File Structure

- `scripts/engine-overlay.ps1` — **Create.** Apply / `-Check` the engine overlay.
- `scripts/setup.ps1`, `scripts/start-stack.ps1`, `scripts/verify.ps1` — **Modify.** Run the overlay before the engine starts; add an engine check step.
- `engine-custom/README.md`, `engine-custom/PATCHES.md`, `engine-custom/manifest.json` — **Create.**
- `engine-custom/src/app.ts` — **Create (replacement of upstream, 66 lines + 1 import).**
- `engine-custom/src/server/ClientSocket.ts` — **Create (replacement, 62 lines + 1 field).**
- `engine-custom/src/server/login/LoginThread.ts` — **Create (replacement, 176 lines, two hunks).**
- `engine-custom/src/web.ts` — **Create (replacement, 348 lines, three hunks).**
- `engine-custom/src/engine/entity/PlayerLoading.ts` — **Create (replacement, 165 lines, three hunks).**
- `engine-custom/src/idlescape/config.ts` — **Create.** Env + `data/config/idlescape.json` config.
- `engine-custom/src/idlescape/types.ts` — **Create.** `BankOp`, `BankSlotDto`, `OwnerBankFile`.
- `engine-custom/src/idlescape/ownerAssertion.ts` — **Create.** Header parse + HMAC verify.
- `engine-custom/src/idlescape/ops.ts` — **Create.** Pure layout/delta op application + tab invariant.
- `engine-custom/src/idlescape/ownerBank.ts` — **Create.** `OwnerBankStore`.
- `engine-custom/src/idlescape/owner.ts` — **Create.** `ownerKeys` WeakMap + tab varp helpers.
- `engine-custom/src/idlescape/install.ts` — **Create.** `getInventory` patch, `World.cycle` wrapper, change hook.
- `engine-custom/src/idlescape/management.ts` — **Create.** The two owner-bank Fastify routes.
- `engine-custom/src/idlescape/*.test.ts` — **Create.** `node:test` suites.
- `content-custom/scripts/interface_bank/configs/banktab.varp` — **Create.** Nine `scope=perm` tab varps.
- `server/src/auth/ownerAssertion.ts` (+ test) — **Create.** Mint / cookie build / verify.
- `server/src/engine/managementClient.ts` (+ test) — **Create.** Typed client for the two engine routes. *(SP8b's spec calls this `server/src/bank/engine.ts`; it is this module — SP8b imports it rather than creating a second one.)*
- `server/src/bank/routes.ts` (+ test) — **Create.** `GET /api/bank`, `POST /api/bank/ops`, `POST /internal/bank-changed`.
- `server/src/env.ts`, `server/src/types.ts`, `server/src/router.ts`, `server/src/index.ts`, `server/src/characters/routes.ts`, `server/src/proxy/ws.ts` — **Modify.**
- `server/.env.example` — **Modify.** `OWNER_ASSERTION_SECRET`.
- `web/e2e/bank.pw.test.ts` — **Create.**
- `README.md`, `CREDITS.md`, `docs/superpowers/specs/2026-09-05-idlescape-roadmap-and-handoff.md` — **Modify.**

---
### Task 1: The `engine-custom/` overlay mechanism

**Files:**
- Create: `scripts/engine-overlay.ps1`, `engine-custom/README.md`, `engine-custom/manifest.json`, `engine-custom/PATCHES.md`, `engine-custom/src/idlescape/.gitkeep`
- Modify: `scripts/setup.ps1`, `scripts/start-stack.ps1`, `scripts/verify.ps1`, `.gitignore` (only if `engine-custom/` would be caught by an existing rule — check first)

**Interfaces:**
- Consumes: `scripts/content-overlay.ps1` (shape), `scripts/upstream.lock` (`engine/server 1d25566cb53e7af1b1cb18ade8af996316c19614`).
- Produces:
  - `pwsh scripts/engine-overlay.ps1` — copies every real file under `engine-custom/` (excluding root-level files: `README.md`, `PATCHES.md`, `manifest.json`) onto the matching path under `engine/server/`, skipping byte-identical files; prints a per-file report.
  - `pwsh scripts/engine-overlay.ps1 -Check` — reads `engine-custom/manifest.json` and reports upstream drift; exits 1 when anything drifted (unlike content-overlay, which only prints) so `verify.ps1` fails loudly.
  - `engine-custom/manifest.json` shape:
    ```json
    { "base": "1d25566cb53e7af1b1cb18ade8af996316c19614",
      "files": [{ "path": "src/web.ts", "kind": "replace", "baseSha256": "<hex>" }],
      "anchors": [{ "path": "src/engine/entity/Player.ts", "sha256": "<hex>", "why": "getInventory is patched at runtime" }] }
    ```
    `kind` is `replace` (a whole-file replacement of an upstream file: `baseSha256` is that upstream file's hash at the pinned sha) or `new` (a file that does not exist upstream: `baseSha256` is `null`). `anchors` are upstream files we do **not** replace but whose code a runtime patch depends on.

- [ ] **Step 1: Confirm `engine-custom/` is not git-ignored**

Run: `git check-ignore -v engine-custom/README.md; echo "ignored=$?"`
Expected: `ignored=1` (not ignored). If it is ignored, add a `!engine-custom/` negation next to the `engine/` rule in `.gitignore` and re-run.

- [ ] **Step 2: Write the overlay script**

```powershell
# scripts/engine-overlay.ps1
<#
.SYNOPSIS
  Applies the engine-custom/ overlay on top of the pinned engine/server clone, or checks
  whether the overlay has drifted from a since-changed upstream base.

.DESCRIPTION
  engine-custom/ is a tracked directory mirroring the layout of engine/server (see
  engine-custom/README.md). Every real file under one of its subdirectories is copied on top
  of the matching path in engine/server/, creating destination directories as needed.
  Re-running is safe: byte-identical files are left untouched, changed files are overwritten,
  nothing is ever duplicated or removed.

  engine-custom/manifest.json records two lists. "files" is every path the overlay
  contributes: kind "replace" pairs the path with the sha256 of the upstream file it was
  authored against, kind "new" has a null baseSha256 (no upstream file exists). "anchors" is
  every upstream file the overlay does NOT replace but whose code a runtime patch in
  src/idlescape/install.ts depends on (Player.getInventory, World.cycle, ...).

  -Check recomputes those hashes against the current clone and reports every entry whose
  upstream file changed or vanished, then exits 1 so a revision bump that invalidates a patch
  fails the build instead of silently applying.

.PARAMETER Check
  Report drift instead of copying. Does not touch engine/server.
#>
param(
  [switch]$Check
)

$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot -Parent
$customRoot = Join-Path $root 'engine-custom'
$baseRoot = Join-Path $root 'engine\server'
$manifestPath = Join-Path $customRoot 'manifest.json'
# Root-level bookkeeping files are never copied into the clone.
$skipNames = @('README.md', 'PATCHES.md', 'manifest.json', '.gitkeep')

if (-not (Test-Path $customRoot)) { throw "engine-custom/ not found at $customRoot" }
if (-not (Test-Path $manifestPath)) { throw "Manifest not found: $manifestPath" }
if (-not (Test-Path $baseRoot)) { throw "Engine clone not found at $baseRoot. Run scripts/setup.ps1 first." }

function Get-EngineManifest {
  $raw = Get-Content -LiteralPath $manifestPath -Raw
  if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
  return ($raw | ConvertFrom-Json)
}

function Get-Sha {
  param([string]$Path)
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

if ($Check) {
  $manifest = Get-EngineManifest
  $entries = @()
  if ($manifest -and $manifest.PSObject.Properties['files'] -and $manifest.files) { $entries += @($manifest.files) }
  if ($manifest -and $manifest.PSObject.Properties['anchors'] -and $manifest.anchors) {
    foreach ($a in @($manifest.anchors)) {
      $entries += [pscustomobject]@{ path = $a.path; kind = 'anchor'; baseSha256 = $a.sha256 }
    }
  }

  if ($entries.Count -eq 0) {
    Write-Host "engine-overlay -Check: manifest is empty, nothing to check."
    exit 0
  }

  $drifted = New-Object System.Collections.Generic.List[string]
  $gone = New-Object System.Collections.Generic.List[string]
  foreach ($entry in $entries) {
    $relPath = [string]$entry.path
    if ([string]::IsNullOrEmpty($relPath)) { continue }
    if ([string]$entry.kind -eq 'new') { continue }
    $recorded = [string]$entry.baseSha256
    if ([string]::IsNullOrEmpty($recorded)) { continue }

    $basePath = Join-Path $baseRoot $relPath
    if (-not (Test-Path -LiteralPath $basePath)) { $gone.Add("$relPath ($($entry.kind))"); continue }

    # A "replace" entry's base file is, after an overlay run, our own copy -- compare against
    # the overlay source when it matches ours, otherwise against the recorded upstream hash.
    $customPath = Join-Path $customRoot $relPath
    $currentHash = Get-Sha $basePath
    if ((Test-Path -LiteralPath $customPath) -and ($currentHash -eq (Get-Sha $customPath))) { continue }
    if ($currentHash -ne $recorded) { $drifted.Add("$relPath ($($entry.kind))") }
  }

  Write-Host "engine-overlay -Check: $($entries.Count) manifest entry(ies) checked (base $($manifest.base))."
  if ($gone.Count -gt 0) {
    Write-Host "  base file removed upstream:"
    foreach ($p in $gone) { Write-Host "    $p" }
  }
  if ($drifted.Count -gt 0) {
    Write-Host "  base file changed upstream since the patch was recorded (re-apply per engine-custom/PATCHES.md):"
    foreach ($p in $drifted) { Write-Host "    $p" }
  }
  if ($gone.Count -eq 0 -and $drifted.Count -eq 0) {
    Write-Host "  no drift detected."
    exit 0
  }
  exit 1
}

# --- Default mode: copy engine-custom/** over engine/server/ ----------------
$sourceFiles = @(Get-ChildItem -LiteralPath $customRoot -Recurse -File | Where-Object {
  $_.DirectoryName -ne $customRoot -and $skipNames -notcontains $_.Name
})

$copied = 0
$unchanged = 0
$copiedPaths = New-Object System.Collections.Generic.List[string]

foreach ($file in $sourceFiles) {
  $relPath = $file.FullName.Substring($customRoot.Length + 1)
  $destPath = Join-Path $baseRoot $relPath
  $destDir = Split-Path $destPath -Parent
  if (-not (Test-Path -LiteralPath $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }

  $needsCopy = $true
  if (Test-Path -LiteralPath $destPath) {
    if ((Get-Sha $file.FullName) -eq (Get-Sha $destPath)) { $needsCopy = $false }
  }

  if ($needsCopy) {
    Copy-Item -LiteralPath $file.FullName -Destination $destPath -Force
    $copied++
    $copiedPaths.Add($relPath.Replace('\', '/'))
  } else {
    $unchanged++
  }
}

Write-Host "engine-overlay: $($sourceFiles.Count) overlay file(s), $copied copied, $unchanged unchanged."
foreach ($p in $copiedPaths) { Write-Host "  copied: $p" }

$manifest = Get-EngineManifest
$manifestPaths = New-Object System.Collections.Generic.HashSet[string]
if ($manifest -and $manifest.files) { foreach ($e in @($manifest.files)) { if ($e.path) { [void]$manifestPaths.Add([string]$e.path) } } }
$unlisted = @($sourceFiles | ForEach-Object { $_.FullName.Substring($customRoot.Length + 1).Replace('\', '/') } | Where-Object { -not $manifestPaths.Contains($_) })
if ($unlisted.Count -gt 0) {
  Write-Host "  note: not listed in manifest.json:"
  foreach ($p in $unlisted) { Write-Host "    $p" }
}
```

- [ ] **Step 3: Seed the manifest and the two docs**

`engine-custom/manifest.json` (start with the anchors only; every task below appends its own entry):

```json
{
  "base": "1d25566cb53e7af1b1cb18ade8af996316c19614",
  "files": [],
  "anchors": []
}
```

`engine-custom/README.md`:

```markdown
# engine-custom/

`engine/server` is a pinned, git-ignored clone of the upstream
[Engine-TS](https://github.com/LostCityRS/Engine-TS) repo (`scripts/upstream.lock`, currently
`1d25566cb53e7af1b1cb18ade8af996316c19614`, revision 274). It is never hand-edited: every
checkout or revision bump replaces it wholesale, so anything written directly inside it is
silently lost on the next `scripts/setup.ps1` run.

This directory is the alternative, and the exact counterpart of `content-custom/` for the
server half: a **tracked** overlay that adds or replaces files in the engine tree without
touching the pristine clone. It mirrors `engine/server`'s layout, so a file at
`engine-custom/src/web.ts` lands at `engine/server/src/web.ts`.

Two kinds of file live here:

- **Replacements** — whole copies of an upstream file with our hunks applied. Kept whole (not
  as patch files) so `npx tsc --noEmit` and the editor see real code. Every one is recorded in
  `manifest.json` with the sha256 of the upstream file it was authored against.
- **New files** — everything under `src/idlescape/`, which upstream has no opinion about.
  Where a change can be made from a new file instead of a replacement (by patching a prototype
  or wrapping a public method at boot), it is: a runtime patch that stops matching upstream is
  caught by an `anchors` entry in `manifest.json`, whereas a 2 300-line copy of `Player.ts`
  would rot invisibly.

`PATCHES.md` is the authority on what each change is, where its anchor is, and how to verify
it is still present — the same contract as `client/PATCHES.md`.

## How it is applied

`scripts/engine-overlay.ps1` copies every real file under this directory (except the three
root-level bookkeeping files) on top of `engine/server/`. It is idempotent. It runs
automatically from `scripts/setup.ps1` (after checkout, before the pack) and from
`scripts/start-stack.ps1` (before the engine starts). Run it by hand with
`pwsh scripts/engine-overlay.ps1`.

`pwsh scripts/engine-overlay.ps1 -Check` recomputes every recorded hash against the current
clone and **exits non-zero** if an upstream file a patch depends on has changed or vanished.
`scripts/verify.ps1` runs it as its first step, so a revision bump that invalidates a patch
fails verification instead of shipping.
```

`engine-custom/PATCHES.md`:

```markdown
# engine-custom/PATCHES.md — idlescape engine overlay

Base: **Engine-TS revision 274**, sha `1d25566cb53e7af1b1cb18ade8af996316c19614`
(`scripts/upstream.lock`). Applied by `scripts/engine-overlay.ps1`; drift is caught by
`scripts/engine-overlay.ps1 -Check` against `manifest.json`.

Line numbers drift. Every patch below is described by the **surrounding code** that anchors
it, exactly as `client/PATCHES.md` does, and each has a grep that must return the stated count
after the overlay has been applied.

## New files (no upstream counterpart)

`src/idlescape/` is entirely ours: `config.ts`, `types.ts`, `ownerAssertion.ts`, `ops.ts`,
`ownerBank.ts`, `owner.ts`, `install.ts`, `management.ts` and their `*.test.ts` neighbours.
Nothing upstream imports them; `src/app.ts` is the single entry point that pulls `install.ts`
in.

## Replacements

(One section per replacement, added by the task that introduces it.)

## Runtime patches (installed by `src/idlescape/install.ts`)

(One section per prototype/method patch, added by the task that introduces it.)

## How to verify all patches are present

```sh
cd engine/server
grep -c "import '#/idlescape/install.js';" src/app.ts                       # 1
```

(Each task appends its own grep lines here.)
```

- [ ] **Step 4: Wire the overlay into the scripts**

`scripts/setup.ps1` — directly after the existing content-overlay block (search for
`== running content overlay`), append:

```powershell
# Custom engine overlay: engine-custom/** over engine/server/, after the checkout so the
# clone is pristine underneath it. Guarded in case the script is ever absent.
$engineOverlay = Join-Path $root 'scripts\engine-overlay.ps1'
if (Test-Path $engineOverlay) {
  Write-Host "== running engine overlay"
  & $engineOverlay
} else {
  Write-Host "== scripts/engine-overlay.ps1 not present, skipping engine overlay"
}
```

`scripts/start-stack.ps1` — the same block, inserted between the content-overlay block and the
`# 274 engine runs under Node via tsx` line, so the overlay is on disk before `npx tsx
src/app.ts` starts.

`scripts/verify.ps1` — renumber the six steps to seven and insert a new first step before
"client unit tests":

```powershell
# --- 1. Engine overlay: apply, then fail on upstream drift -------------------
Write-Host "`n== [1/7] engine overlay (apply + drift check)"
& (Join-Path $PSScriptRoot 'engine-overlay.ps1')
Invoke-Native 'engine overlay apply'
& (Join-Path $PSScriptRoot 'engine-overlay.ps1') -Check
Invoke-Native 'engine overlay drift check'

Write-Host "`n== [1/7] engine typecheck (tsc --noEmit)"
Push-Location (Join-Path $root 'engine\server')
try {
    npx tsc --noEmit; Invoke-Native 'engine typecheck'
} finally { Pop-Location }
```

(`Invoke-Native` and `$root` are already defined above that point in the file; move the
`function Invoke-Native` definition above the new step if it currently sits below it.)

- [ ] **Step 5: Prove the pipeline end to end**

Run:
```sh
pwsh scripts/engine-overlay.ps1 && pwsh scripts/engine-overlay.ps1 -Check
cd engine/server && npx tsc --noEmit && echo ENGINE_TYPECHECK_OK
```
Expected: `0 overlay file(s), 0 copied`, `no drift detected.`, `ENGINE_TYPECHECK_OK`.

- [ ] **Step 6: Commit**

```bash
git add scripts/engine-overlay.ps1 scripts/setup.ps1 scripts/start-stack.ps1 scripts/verify.ps1 engine-custom
git commit -m "build(engine): engine-custom overlay mechanism, apply/-Check script and PATCHES.md"
```

---

### Task 2: Engine boot hook, config module and the `node:test` harness

**Files:**
- Create: `engine-custom/src/app.ts` (replacement), `engine-custom/src/idlescape/config.ts`, `engine-custom/src/idlescape/install.ts`, `engine-custom/src/idlescape/config.test.ts`, `engine-custom/src/idlescape/harness.test.ts`
- Modify: `engine-custom/manifest.json`, `engine-custom/PATCHES.md`, `scripts/start-stack.ps1`, `scripts/verify.ps1`

**Interfaces:**
- Consumes: `Environment` (`#/util/Environment.js`), `InvType`/`ObjType` (`#/cache/config/*.js`), `Inventory` (`#/engine/Inventory.js`).
- Produces:
  ```ts
  // engine-custom/src/idlescape/config.ts
  export interface IdlescapeConfig {
    ownerSecret: string;          // '' disables signing/verification entirely
    requireOwner: boolean;        // reject a login with no valid assertion
    bankDir: string;              // default 'data/banks'
    hookUrl: string | null;       // front server loopback change hook
    managementHost: string;       // default '127.0.0.1'
    devStaffLevel: number;        // 0 unless IDLESCAPE_DEV_STAFF is set AND !node.production
    staff: Record<string, number>;// gameName -> staffmodlevel allow-list
  }
  export function loadIdlescapeConfig(
    env?: NodeJS.ProcessEnv, fileText?: string | null, production?: boolean
  ): IdlescapeConfig;
  export const idlescapeConfig: IdlescapeConfig;   // resolved once at import
  ```
  ```ts
  // engine-custom/src/idlescape/install.ts
  export function installIdlescape(): void;        // idempotent; called at module load
  ```

- [ ] **Step 1: Write the failing config + harness tests**

```ts
// engine-custom/src/idlescape/config.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadIdlescapeConfig } from './config.js';

test('defaults are safe: no secret, owner not required in dev, loopback management', () => {
  const c = loadIdlescapeConfig({}, null, false);
  assert.equal(c.ownerSecret, '');
  assert.equal(c.requireOwner, false);
  assert.equal(c.bankDir, 'data/banks');
  assert.equal(c.hookUrl, null);
  assert.equal(c.managementHost, '127.0.0.1');
  assert.equal(c.devStaffLevel, 0);
  assert.deepEqual(c.staff, {});
});

test('production forces requireOwner on and refuses the dev staff override', () => {
  const c = loadIdlescapeConfig({ IDLESCAPE_DEV_STAFF: '4', OWNER_ASSERTION_SECRET: 's'.repeat(32) }, null, true);
  assert.equal(c.requireOwner, true);
  assert.equal(c.devStaffLevel, 0);
});

test('dev honours the staff override only when a secret-free dev world asks for it', () => {
  const c = loadIdlescapeConfig({ IDLESCAPE_DEV_STAFF: '4' }, null, false);
  assert.equal(c.devStaffLevel, 4);
});

test('env beats the config file, and the file supplies the rest', () => {
  const file = JSON.stringify({
    ownerSecret: 'from-file', requireOwner: true, bankDir: 'data/other',
    hookUrl: 'http://127.0.0.1:8787/internal/bank-changed', staff: { admin: 2 }
  });
  const c = loadIdlescapeConfig({ OWNER_ASSERTION_SECRET: 'from-env' }, file, false);
  assert.equal(c.ownerSecret, 'from-env');
  assert.equal(c.requireOwner, true);
  assert.equal(c.bankDir, 'data/other');
  assert.equal(c.hookUrl, 'http://127.0.0.1:8787/internal/bank-changed');
  assert.deepEqual(c.staff, { admin: 2 });
});

test('a corrupt config file is ignored rather than fatal', () => {
  const c = loadIdlescapeConfig({}, '{ not json', false);
  assert.equal(c.bankDir, 'data/banks');
});
```

```ts
// engine-custom/src/idlescape/harness.test.ts
// Proves the engine test harness itself: node:test through tsx resolves the package's "#/"
// import map, and the packed cache in data/pack can be loaded from a test process, so every
// other suite here can build real InvType/ObjType/Inventory objects instead of fakes.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';
import { Inventory } from '#/engine/Inventory.js';

test('the packed cache loads and the bank is inv 95, 240 slots, always-stack', () => {
  InvType.load('data/pack');
  ObjType.load('data/pack');

  const bank = InvType.getId('bank');
  assert.equal(bank, 95);

  const inv = Inventory.fromType(bank);
  assert.equal(inv.capacity, 240);
  assert.equal(inv.stackType, Inventory.ALWAYS_STACK);

  inv.add(995, 100);
  assert.equal(inv.getItemCount(995), 100);
  assert.equal(ObjType.get(995).name, 'Coins');
  assert.equal(inv.update, true);
  inv.resetTracking();
  assert.equal(inv.update, false);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pwsh scripts/engine-overlay.ps1 && cd engine/server && npx tsx --test src/idlescape/*.test.ts`
Expected: FAIL — `Cannot find module './config.js'` for the first suite. (`harness.test.ts` passes immediately; that is the point of it — it is the harness assertion, not a red test.)

- [ ] **Step 3: Write the config module**

```ts
// engine-custom/src/idlescape/config.ts
import fs from 'fs';

import Environment from '#/util/Environment.js';

export interface IdlescapeConfig {
    ownerSecret: string;
    requireOwner: boolean;
    bankDir: string;
    hookUrl: string | null;
    managementHost: string;
    devStaffLevel: number;
    staff: Record<string, number>;
}

// world.json cannot carry these: WorldConfig.mergeConfig() drops any key that is not in
// createDefaultWorldConfig(), so a new section there would need a whole-file replacement of a
// 329-line file for two strings. Env first (scripts/start-stack.ps1 exports it from
// server/.env so both halves share one secret), then this optional file, then defaults.
export const CONFIG_FILE = 'data/config/idlescape.json';

interface FileShape {
    ownerSecret?: unknown;
    requireOwner?: unknown;
    bankDir?: unknown;
    hookUrl?: unknown;
    managementHost?: unknown;
    staff?: unknown;
}

function readFileShape(text: string | null): FileShape {
    if (!text) {
        return {};
    }
    try {
        const parsed: unknown = JSON.parse(text);
        return typeof parsed === 'object' && parsed !== null ? (parsed as FileShape) : {};
    } catch {
        console.warn(`[idlescape] ignoring unparseable ${CONFIG_FILE}`);
        return {};
    }
}

function asString(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function asBool(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
}

function asStaff(value: unknown): Record<string, number> {
    if (typeof value !== 'object' || value === null) return {};
    const out: Record<string, number> = {};
    for (const [name, level] of Object.entries(value as Record<string, unknown>)) {
        const n = Number(level);
        if (Number.isInteger(n) && n >= 0 && n <= 4) out[name.toLowerCase()] = n;
    }
    return out;
}

export function loadIdlescapeConfig(env: NodeJS.ProcessEnv = process.env, fileText: string | null = null, production: boolean = Environment.node.production): IdlescapeConfig {
    const file = readFileShape(fileText);

    // Production is the hard floor: an unattended world always demands an owner assertion and
    // never grants a staff level from an env var.
    const requireOwner = production ? true : asBool(env.OWNER_REQUIRE_ASSERTION, asBool(file.requireOwner, false));

    let devStaffLevel = 0;
    if (!production) {
        const n = Number(env.IDLESCAPE_DEV_STAFF ?? '0');
        if (Number.isInteger(n) && n >= 0 && n <= 4) devStaffLevel = n;
    }

    return {
        ownerSecret: asString(env.OWNER_ASSERTION_SECRET, asString(file.ownerSecret, '')),
        requireOwner,
        bankDir: asString(env.IDLESCAPE_BANK_DIR, asString(file.bankDir, 'data/banks')),
        hookUrl: asString(env.IDLESCAPE_HOOK_URL, asString(file.hookUrl, '')) || null,
        managementHost: asString(env.IDLESCAPE_MANAGEMENT_HOST, asString(file.managementHost, '127.0.0.1')),
        devStaffLevel,
        staff: asStaff(file.staff)
    };
}

function readConfigFile(): string | null {
    try {
        return fs.existsSync(CONFIG_FILE) ? fs.readFileSync(CONFIG_FILE, 'utf8') : null;
    } catch {
        return null;
    }
}

export const idlescapeConfig: IdlescapeConfig = loadIdlescapeConfig(process.env, readConfigFile(), Environment.node.production);
```

- [ ] **Step 4: Write the install bootstrap (no-op for now) and the replaced `app.ts`**

```ts
// engine-custom/src/idlescape/install.ts
import { idlescapeConfig } from '#/idlescape/config.js';
import { printInfo } from '#/util/Logger.js';

let installed = false;

/**
 * Installs every runtime patch the idlescape overlay needs. Called at module load from the
 * replaced src/app.ts, BEFORE World.start(), so the patched Player.getInventory and the
 * wrapped World.cycle are in place before the first tick is scheduled.
 *
 * Tasks 8 and 10 fill this in; keeping it here from the start means app.ts is replaced once
 * and never again.
 */
export function installIdlescape(): void {
    if (installed) {
        return;
    }
    installed = true;

    printInfo(`[idlescape] overlay active (requireOwner=${idlescapeConfig.requireOwner}, banks=${idlescapeConfig.bankDir})`);
}

installIdlescape();
```

`engine-custom/src/app.ts` — copy `engine/server/src/app.ts` verbatim and add **one** line as the first import:

```ts
// idlescape overlay: installs the runtime patches (Player.getInventory routing, World.cycle
// wrapper) before anything below imports World and schedules the first tick. Must stay first.
import '#/idlescape/install.js';

import fs from 'fs';
import { Worker } from 'worker_threads';
// ...rest of upstream app.ts unchanged
```

- [ ] **Step 5: Record the patch**

`engine-custom/manifest.json` — add to `files`:

```json
{ "path": "src/app.ts", "kind": "replace", "baseSha256": "<sha256 of engine/server/src/app.ts BEFORE the overlay runs>" }
```

Get the hash with `git -C engine/server show 1d25566cb53e7af1b1cb18ade8af996316c19614:src/app.ts | sha256sum` (the clone has its own git dir), or `(Get-FileHash engine/server/src/app.ts -Algorithm SHA256).Hash` on a freshly checked-out clone, before copying the overlay over it. Also add every `src/idlescape/*.ts` file with `"kind": "new", "baseSha256": null`.

`engine-custom/PATCHES.md` — under **Replacements**:

```markdown
### `src/app.ts` — install the overlay before the world starts

Anchor: the top of the file, above `import fs from 'fs';`. One added line:
`import '#/idlescape/install.js';`. Nothing else in the file changes. It must stay the first
import: `install.ts` patches `Player.prototype` and wraps `World.cycle`, and `await
World.start()` further down the same module schedules the first tick.
```

and under **How to verify**:

```sh
grep -c "import '#/idlescape/install.js';" src/app.ts    # 1
```

- [ ] **Step 6: Wire the engine test command into verify.ps1 and start-stack**

`scripts/verify.ps1` — extend the step added in Task 1 so it also runs the engine suites:

```powershell
Write-Host "`n== [1/7] engine unit tests (node:test via tsx)"
Push-Location (Join-Path $root 'engine\server')
try {
    npx tsx --test (Get-ChildItem 'src\idlescape\*.test.ts' | ForEach-Object { $_.FullName })
    Invoke-Native 'engine unit tests'
} finally { Pop-Location }
```

`scripts/start-stack.ps1` — before the engine `Start-Process`, export the shared secret so both
halves agree without duplicating it:

```powershell
# The engine reads OWNER_ASSERTION_SECRET from its process env (see engine-custom/src/
# idlescape/config.ts); server/.env is the single source of truth for it.
$serverEnv = Join-Path $root 'server\.env'
if (Test-Path $serverEnv) {
  $secretLine = Select-String -LiteralPath $serverEnv -Pattern '^OWNER_ASSERTION_SECRET=' | Select-Object -First 1
  if ($secretLine) { $env:OWNER_ASSERTION_SECRET = ($secretLine.Line -replace '^OWNER_ASSERTION_SECRET=', '').Trim('"').Trim("'") }
}
$env:IDLESCAPE_HOOK_URL = 'http://127.0.0.1:8787/internal/bank-changed'
if (-not $Prod) { $env:IDLESCAPE_DEV_STAFF = '4' }  # dev only: keeps ::give usable locally
```

- [ ] **Step 7: Run everything**

Run:
```sh
pwsh scripts/engine-overlay.ps1 && pwsh scripts/engine-overlay.ps1 -Check
cd engine/server && npx tsc --noEmit && npx tsx --test src/idlescape/*.test.ts
```
Expected: no drift, typecheck clean, 6 passing tests.

- [ ] **Step 8: Commit**

```bash
git add engine-custom scripts/verify.ps1 scripts/start-stack.ps1
git commit -m "feat(engine-overlay): idlescape config module, boot install hook and node:test harness"
```

---
### Task 3: Owner assertion — front-server mint and cookie

**Files:**
- Create: `server/src/auth/ownerAssertion.ts`, `server/src/auth/ownerAssertion.test.ts`
- Modify: `server/src/env.ts`, `server/src/types.ts`, `server/src/characters/routes.ts`, `server/src/characters/routes.test.ts`, `server/src/index.ts`, `server/.env.example`

**Interfaces:**
- Consumes: `readCookie` from `../gate`; `Principal` from `./principal`; `CharacterStore.session`.
- Produces:
  ```ts
  // server/src/auth/ownerAssertion.ts
  export const OWNER_COOKIE = 'cs_owner';
  export const OWNER_ASSERTION_TTL_MS = 43_200_000;   // 12 h
  export const OWNER_ASSERTION_MAX_ENTRIES = 5;
  export interface OwnerAssertion { uid: string; character: string; exp: number }
  export function signOwnerAssertion(secret: string, a: OwnerAssertion): string;   // "uid.character.exp.sig"
  export function verifyOwnerAssertion(secret: string, entry: string, nowMs?: number): OwnerAssertion | null;
  export function splitOwnerCookie(value: string | null): string[];
  export function buildOwnerCookie(secret: string, previous: string | null, next: OwnerAssertion, nowMs?: number): string;
  export function ownerCookieHeader(value: string, secure: boolean): string;
  ```
- Produces (`server/src/types.ts`): `Env.ownerAssertionSecret: string`.

- [ ] **Step 1: Write the failing test**

```ts
// server/src/auth/ownerAssertion.test.ts
import { describe, expect, test } from 'bun:test';
import {
  OWNER_ASSERTION_MAX_ENTRIES, OWNER_ASSERTION_TTL_MS, OWNER_COOKIE,
  buildOwnerCookie, ownerCookieHeader, signOwnerAssertion, splitOwnerCookie, verifyOwnerAssertion
} from './ownerAssertion';

const SECRET = 'x'.repeat(32);
const NOW = 1_800_000_000_000;

describe('owner assertion', () => {
  test('round-trips uid, character and expiry', () => {
    const entry = signOwnerAssertion(SECRET, { uid: 'uid123', character: 'bob', exp: NOW + 1000 });
    expect(entry.split('.')).toHaveLength(4);
    expect(verifyOwnerAssertion(SECRET, entry, NOW)).toEqual({ uid: 'uid123', character: 'bob', exp: NOW + 1000 });
  });

  test('rejects a tampered character, a tampered uid, a wrong secret and an expired entry', () => {
    const entry = signOwnerAssertion(SECRET, { uid: 'uid123', character: 'bob', exp: NOW + 1000 });
    const [uid, , exp, sig] = entry.split('.');
    expect(verifyOwnerAssertion(SECRET, `${uid}.eve.${exp}.${sig}`, NOW)).toBeNull();
    expect(verifyOwnerAssertion(SECRET, `evil.bob.${exp}.${sig}`, NOW)).toBeNull();
    expect(verifyOwnerAssertion('y'.repeat(32), entry, NOW)).toBeNull();
    expect(verifyOwnerAssertion(SECRET, entry, NOW + 2000)).toBeNull();
  });

  test('rejects malformed entries without throwing', () => {
    for (const bad of ['', 'a', 'a.b', 'a.b.c', 'a.b.notanumber.sig', 'a.b.1.']) {
      expect(verifyOwnerAssertion(SECRET, bad, NOW)).toBeNull();
    }
  });

  test('an empty secret never verifies (a misconfigured server must not authorise anyone)', () => {
    const entry = signOwnerAssertion(SECRET, { uid: 'uid123', character: 'bob', exp: NOW + 1000 });
    expect(verifyOwnerAssertion('', entry, NOW)).toBeNull();
  });

  test('the cookie accumulates characters, replaces the same one, drops expired and caps the list', () => {
    let cookie = buildOwnerCookie(SECRET, null, { uid: 'u', character: 'one', exp: NOW + OWNER_ASSERTION_TTL_MS }, NOW);
    cookie = buildOwnerCookie(SECRET, cookie, { uid: 'u', character: 'two', exp: NOW + OWNER_ASSERTION_TTL_MS }, NOW);
    expect(splitOwnerCookie(cookie)).toHaveLength(2);

    // re-minting a session for 'one' replaces its entry rather than appending a second
    cookie = buildOwnerCookie(SECRET, cookie, { uid: 'u', character: 'one', exp: NOW + OWNER_ASSERTION_TTL_MS }, NOW);
    expect(splitOwnerCookie(cookie)).toHaveLength(2);
    expect(splitOwnerCookie(cookie).map(e => verifyOwnerAssertion(SECRET, e, NOW)?.character)).toEqual(['two', 'one']);

    // a stale entry from an expired session is dropped on the next mint
    const stale = signOwnerAssertion(SECRET, { uid: 'u', character: 'old', exp: NOW - 1 });
    cookie = buildOwnerCookie(SECRET, `${stale}~${cookie}`, { uid: 'u', character: 'three', exp: NOW + OWNER_ASSERTION_TTL_MS }, NOW);
    expect(splitOwnerCookie(cookie).map(e => verifyOwnerAssertion(SECRET, e, NOW)?.character)).toEqual(['two', 'one', 'three']);

    for (const name of ['four', 'five', 'six']) {
      cookie = buildOwnerCookie(SECRET, cookie, { uid: 'u', character: name, exp: NOW + OWNER_ASSERTION_TTL_MS }, NOW);
    }
    const names = splitOwnerCookie(cookie).map(e => verifyOwnerAssertion(SECRET, e, NOW)?.character);
    expect(names).toHaveLength(OWNER_ASSERTION_MAX_ENTRIES);
    expect(names).toEqual(['one', 'three', 'four', 'five', 'six']);   // oldest ('two') evicted
  });

  test('another account signing in replaces the cookie instead of merging', () => {
    const mine = buildOwnerCookie(SECRET, null, { uid: 'u1', character: 'one', exp: NOW + 1000 }, NOW);
    const theirs = buildOwnerCookie(SECRET, mine, { uid: 'u2', character: 'two', exp: NOW + 1000 }, NOW);
    expect(splitOwnerCookie(theirs)).toHaveLength(1);
    expect(verifyOwnerAssertion(SECRET, splitOwnerCookie(theirs)[0], NOW)?.uid).toBe('u2');
  });

  test('the Set-Cookie header is HttpOnly, Lax, path-wide and Secure only on https', () => {
    const header = ownerCookieHeader('v', false);
    expect(header.startsWith(`${OWNER_COOKIE}=v; Path=/; Max-Age=${OWNER_ASSERTION_TTL_MS / 1000}; HttpOnly; SameSite=Lax`)).toBe(true);
    expect(header).not.toContain('Secure');
    expect(ownerCookieHeader('v', true)).toContain('; Secure');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && ~/.bun/bin/bun test src/auth/ownerAssertion.test.ts`
Expected: FAIL with "Cannot find module './ownerAssertion'".

- [ ] **Step 3: Write the module**

```ts
// server/src/auth/ownerAssertion.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The owner assertion binds a game socket to the Firebase account that owns the character it
 * will log in as. The relay cannot read the login block (the client RSA-encrypts uid/username/
 * password and only the engine holds the private key), so the binding has to be carried
 * out-of-band and checked inside the engine against the name it decrypts. See the platform
 * spec, decision 13.
 *
 * It travels in an HttpOnly cookie because the 274 client builds its WebSocket URL itself
 * (`new WebSocket(`${protocol}://${host}`, 'binary')`, client/src/io/ClientStream.ts:12) with
 * no query string and no header control -- a cookie is the only channel the browser attaches
 * to that upgrade without patching the client. The relay copies it onto the upstream
 * handshake as X-Idlescape-Owner.
 */
export const OWNER_COOKIE = 'cs_owner';
export const OWNER_ASSERTION_TTL_MS = 43_200_000; // 12 h
export const OWNER_ASSERTION_MAX_ENTRIES = 5;

const VERSION = 'cs1';
const UID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const NAME_RE = /^[a-z0-9_]{1,12}$/;

export interface OwnerAssertion {
  uid: string;
  character: string;
  exp: number;
}

function sign(secret: string, uid: string, character: string, exp: number): string {
  return createHmac('sha256', secret).update(`${VERSION}|${uid}|${character}|${exp}`).digest('base64url');
}

export function signOwnerAssertion(secret: string, a: OwnerAssertion): string {
  if (!UID_RE.test(a.uid)) throw new Error('owner assertion: bad uid');
  if (!NAME_RE.test(a.character)) throw new Error('owner assertion: bad character');
  return `${a.uid}.${a.character}.${a.exp}.${sign(secret, a.uid, a.character, a.exp)}`;
}

export function verifyOwnerAssertion(secret: string, entry: string, nowMs: number = Date.now()): OwnerAssertion | null {
  // A server with no secret configured must authorise nobody, rather than everybody.
  if (secret.length === 0) return null;
  const parts = entry.split('.');
  if (parts.length !== 4) return null;
  const [uid, character, expText, sig] = parts;
  if (!UID_RE.test(uid) || !NAME_RE.test(character) || sig.length === 0) return null;
  const exp = Number(expText);
  if (!Number.isSafeInteger(exp) || exp <= nowMs) return null;

  const expected = Buffer.from(sign(secret, uid, character, exp));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;
  return { uid, character, exp };
}

export function splitOwnerCookie(value: string | null): string[] {
  if (!value) return [];
  return value.split('~').filter(part => part.length > 0);
}

/**
 * Rebuilds the cookie around one freshly minted assertion: keeps the caller's other live
 * characters (so SP7's several concurrent sessions all stay bound), drops anything expired or
 * unverifiable, replaces the entry for this character, and caps the list oldest-first. An
 * assertion for a different uid means a different account is now signed in on this browser,
 * so the previous list is discarded entirely.
 */
export function buildOwnerCookie(secret: string, previous: string | null, next: OwnerAssertion, nowMs: number = Date.now()): string {
  const kept: string[] = [];
  for (const entry of splitOwnerCookie(previous)) {
    const parsed = verifyOwnerAssertion(secret, entry, nowMs);
    if (!parsed || parsed.uid !== next.uid || parsed.character === next.character) continue;
    kept.push(entry);
  }
  kept.push(signOwnerAssertion(secret, next));
  return kept.slice(Math.max(0, kept.length - OWNER_ASSERTION_MAX_ENTRIES)).join('~');
}

export function ownerCookieHeader(value: string, secure: boolean): string {
  return `${OWNER_COOKIE}=${value}; Path=/; Max-Age=${OWNER_ASSERTION_TTL_MS / 1000}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}
```

- [ ] **Step 4: Add the env value**

`server/src/types.ts` — add to `Env`: `ownerAssertionSecret: string;`

`server/src/env.ts` — inside `loadEnv`, after the gate checks:

```ts
  const ownerAssertionSecret = source.OWNER_ASSERTION_SECRET ?? '';
  // A production front server that cannot sign owner assertions would hand out sessions the
  // engine must then refuse; fail at boot instead of at login.
  if (ownerAssertionSecret !== '' && ownerAssertionSecret.length < 32) {
    throw new Error('OWNER_ASSERTION_SECRET must be at least 32 characters');
  }
```
and `ownerAssertionSecret` in the returned object.

`server/.env.example` — add:
```
# Shared with the engine overlay (scripts/start-stack.ps1 exports it into the engine process).
# 32+ chars. Empty disables owner binding: only valid against a dev world with
# node.production=false and login.requireOwner=false.
OWNER_ASSERTION_SECRET=
```

- [ ] **Step 5: Mint the assertion on the session route**

`server/src/characters/routes.ts` — `createCharacterRoutes` takes the secret and the secure
flag, and the `session` case sets the cookie:

```ts
export function createCharacterRoutes(deps: { store: CharacterStore; ownerSecret: string; secureCookies: boolean }) {
  const { store, ownerSecret, secureCookies } = deps;
```

```ts
          case 'session': {
            if (req.method !== 'POST') return new Response(null, { status: 405 });
            const minted = await store.session(principal.uid, route.id!);
            // The credentials the client logs in with, plus the owner assertion the relay will
            // put on the upstream handshake so the engine can bind this socket to the account.
            const headers: Record<string, string> = { 'content-type': 'application/json' };
            if (ownerSecret !== '') {
              const cookie = buildOwnerCookie(ownerSecret, readCookie(req, OWNER_COOKIE), {
                uid: principal.uid,
                character: minted.gameName,
                exp: Date.now() + OWNER_ASSERTION_TTL_MS
              });
              headers['set-cookie'] = ownerCookieHeader(cookie, secureCookies);
            }
            return new Response(JSON.stringify(minted), { headers });
          }
```
with `import { OWNER_ASSERTION_TTL_MS, OWNER_COOKIE, buildOwnerCookie, ownerCookieHeader } from '../auth/ownerAssertion';` and `import { readCookie } from '../gate';`.

`server/src/index.ts` — `const characterRoutes = createCharacterRoutes({ store: characterStore, ownerSecret: env.ownerAssertionSecret, secureCookies: env.publicOrigin.startsWith('https:') });`

- [ ] **Step 6: Extend the routes test**

Append to `server/src/characters/routes.test.ts`:

```ts
test('session mints an owner assertion cookie for the minted character', async () => {
  const routes = createCharacterRoutes({ store, ownerSecret: 'z'.repeat(32), secureCookies: false });
  const created = await store.create('u-cookie', false, 'cookiefan');
  const res = await routes.handle(
    new Request(`http://x/api/characters/${created.id}/session`, { method: 'POST' }),
    { kind: 'characters', sub: 'session', id: created.id },
    { kind: 'human', uid: 'u-cookie', isAnonymous: false, authTime: Date.now() }
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ gameName: 'cookiefan' });
  const cookie = res.headers.get('set-cookie') ?? '';
  expect(cookie).toContain('cs_owner=');
  expect(cookie).toContain('HttpOnly');
  const value = cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));
  expect(verifyOwnerAssertion('z'.repeat(32), value)).toMatchObject({ uid: 'u-cookie', character: 'cookiefan' });
});

test('session sets no cookie when no secret is configured', async () => {
  const routes = createCharacterRoutes({ store, ownerSecret: '', secureCookies: false });
  const created = await store.create('u-nocookie', false, 'nocookie');
  const res = await routes.handle(
    new Request(`http://x/api/characters/${created.id}/session`, { method: 'POST' }),
    { kind: 'characters', sub: 'session', id: created.id },
    { kind: 'human', uid: 'u-nocookie', isAnonymous: false, authTime: Date.now() }
  );
  expect(res.headers.get('set-cookie')).toBeNull();
});
```
(Import `verifyOwnerAssertion` from `../auth/ownerAssertion`; adjust the existing `createCharacterRoutes({ store })` call sites in this file to pass the two new deps.)

- [ ] **Step 7: Run the suite**

Run: `cd server && ~/.bun/bin/bun run typecheck && ~/.bun/bin/bun test src/auth src/characters`
Expected: pass (emulators up on 9099/8080).

- [ ] **Step 8: Commit**

```bash
git add server/src/auth server/src/characters server/src/env.ts server/src/types.ts server/src/index.ts server/.env.example
git commit -m "feat(server): mint a signed owner assertion cookie when a character session is minted"
```

---

### Task 4: Relay — carry the assertion onto the upstream handshake

**Files:**
- Modify: `server/src/proxy/ws.ts`, `server/src/proxy/ws.test.ts`, `server/src/index.ts`
- Create: `server/src/proxy/ownerHeader.test.ts`

**Interfaces:**
- Consumes: `splitOwnerCookie`, `OWNER_COOKIE` from `../auth/ownerAssertion`; `readCookie` from `../gate`.
- Produces:
  ```ts
  // server/src/proxy/ws.ts
  export const OWNER_HEADER = 'x-idlescape-owner';
  export interface OpenUpstreamOptions { origin?: string; headers?: Record<string, string> }
  export function ownerHeaderFor(req: Request): string | null;   // trimmed cookie value, or null
  ```

- [ ] **Step 1: Write the failing test**

```ts
// server/src/proxy/ownerHeader.test.ts
import { describe, expect, test } from 'bun:test';
import { OWNER_HEADER, ownerHeaderFor } from './ws';
import { OWNER_ASSERTION_MAX_ENTRIES, signOwnerAssertion } from '../auth/ownerAssertion';

const SECRET = 'q'.repeat(32);
const entry = (name: string) => signOwnerAssertion(SECRET, { uid: 'u1', character: name, exp: Date.now() + 60_000 });

function upgrade(cookie: string | null): Request {
  return new Request('http://localhost:8787/', { headers: cookie ? { cookie } : {} });
}

describe('owner header extraction', () => {
  test('the header name is the one the engine overlay reads', () => {
    expect(OWNER_HEADER).toBe('x-idlescape-owner');
  });

  test('forwards the cs_owner cookie value verbatim', () => {
    const value = `${entry('one')}~${entry('two')}`;
    expect(ownerHeaderFor(upgrade(`cs_gate=abc.def; cs_owner=${value}`))).toBe(value);
  });

  test('returns null with no cookie, an empty cookie, or a different cookie', () => {
    expect(ownerHeaderFor(upgrade(null))).toBeNull();
    expect(ownerHeaderFor(upgrade('cs_owner='))).toBeNull();
    expect(ownerHeaderFor(upgrade('cs_gate=abc.def'))).toBeNull();
  });

  test('refuses a cookie with header-injection characters or an absurd length', () => {
    expect(ownerHeaderFor(upgrade('cs_owner=abc\r\nX-Evil: 1'))).toBeNull();
    expect(ownerHeaderFor(upgrade(`cs_owner=${'a'.repeat(4001)}`))).toBeNull();
  });

  test('caps the number of entries it is willing to forward', () => {
    const many = Array.from({ length: OWNER_ASSERTION_MAX_ENTRIES + 3 }, (_, i) => entry(`c${i}`)).join('~');
    expect(ownerHeaderFor(upgrade(`cs_owner=${many}`))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && ~/.bun/bin/bun test src/proxy/ownerHeader.test.ts`
Expected: FAIL — `OWNER_HEADER` / `ownerHeaderFor` are not exported from `./ws`.

- [ ] **Step 3: Implement in `server/src/proxy/ws.ts`**

Add near the top:

```ts
import { OWNER_ASSERTION_MAX_ENTRIES, OWNER_COOKIE, splitOwnerCookie } from '../auth/ownerAssertion';
import { readCookie } from '../gate';

/** Upgrade header the engine overlay reads (engine-custom/src/web.ts). */
export const OWNER_HEADER = 'x-idlescape-owner';
const OWNER_HEADER_MAX_BYTES = 4000;
/** Only the alphabet signOwnerAssertion can emit, plus the '~' entry separator. */
const OWNER_HEADER_RE = /^[A-Za-z0-9_.~-]+$/;

/**
 * The value to relay upstream for this WebSocket upgrade, or null. The relay does NOT verify
 * the signature -- it has no reason to and the engine must check it anyway, against the name
 * it decrypts from the login block. It only guarantees the value is header-safe.
 */
export function ownerHeaderFor(req: Request): string | null {
  const raw = readCookie(req, OWNER_COOKIE);
  if (!raw || raw.length > OWNER_HEADER_MAX_BYTES) return null;
  if (!OWNER_HEADER_RE.test(raw)) return null;
  const entries = splitOwnerCookie(raw);
  if (entries.length === 0 || entries.length > OWNER_ASSERTION_MAX_ENTRIES) return null;
  return raw;
}
```

and extend the options + socket construction:

```ts
export interface OpenUpstreamOptions {
  // ...existing origin doc comment unchanged...
  origin?: string;
  /**
   * Extra handshake headers. Used for X-Idlescape-Owner: the 274 client cannot put anything
   * on its own upgrade, so the browser carries the assertion in a cookie and the relay
   * promotes it to a header here.
   */
  headers?: Record<string, string>;
}
```

```ts
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.origin) headers.Origin = opts.origin;
    const ws = new EngineSocket(engineWs, 'binary', Object.keys(headers).length > 0 ? { headers } : undefined);
```

- [ ] **Step 4: Use it in the ws route**

`server/src/index.ts`, inside `case 'ws'`, replacing the `openUpstream` call:

```ts
        const origin = env.publicOrigin;
        // Promote the owner-assertion cookie to a handshake header. The engine verifies it
        // against the RSA-decrypted login name; an absent header is a login the engine will
        // refuse whenever it is configured to require one.
        const ownerHeader = ownerHeaderFor(req);
        let handle: UpstreamHandle;
        try {
          handle = await openUpstream(env.engineWs, { origin, headers: ownerHeader ? { [OWNER_HEADER]: ownerHeader } : {} });
        } catch { return new Response('engine unreachable', { status: 502 }); }
```
with `OWNER_HEADER, ownerHeaderFor` added to the existing `./proxy/ws` import.

- [ ] **Step 5: Cover the header on the wire**

Append to `server/src/proxy/ws.test.ts` (it already stands up a local `ws` server for the
upstream leg — reuse that fixture):

```ts
test('openUpstream puts Origin and the owner header on the handshake', async () => {
  const seen: Record<string, string | undefined> = {};
  const wss = new WebSocketServer({ port: 0 });
  wss.on('headers', () => {});
  wss.on('connection', (_sock, req) => {
    seen.origin = req.headers.origin as string | undefined;
    seen.owner = req.headers['x-idlescape-owner'] as string | undefined;
  });
  const port = (wss.address() as { port: number }).port;
  const handle = await openUpstream(`ws://127.0.0.1:${port}`, {
    origin: 'http://localhost:8787',
    headers: { 'x-idlescape-owner': 'u1.bob.99.sig' }
  });
  await new Promise(r => setTimeout(r, 50));
  expect(seen.origin).toBe('http://localhost:8787');
  expect(seen.owner).toBe('u1.bob.99.sig');
  handle.upstream.close();
  wss.close();
});
```

- [ ] **Step 6: Run the suite**

Run: `cd server && ~/.bun/bin/bun run typecheck && ~/.bun/bin/bun test src/proxy src/auth`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add server/src/proxy server/src/index.ts
git commit -m "feat(server): relay the owner assertion cookie as X-Idlescape-Owner on the engine handshake"
```

---
### Task 5: Engine — verify the assertion and stamp the owner key

**Files:**
- Create: `engine-custom/src/idlescape/ownerAssertion.ts`, `engine-custom/src/idlescape/ownerAssertion.test.ts`, `engine-custom/src/idlescape/owner.ts`, `engine-custom/src/server/ClientSocket.ts` (replacement), `engine-custom/src/web.ts` (replacement)
- Modify: `engine-custom/src/engine/entity/PlayerLoading.ts` (replacement, created here), `engine-custom/manifest.json`, `engine-custom/PATCHES.md`

**Interfaces:**
- Consumes: `idlescapeConfig`; `ClientSocket` (`#/server/ClientSocket.js`); `Player` (`#/engine/entity/Player.js`).
- Produces:
  ```ts
  // engine-custom/src/idlescape/ownerAssertion.ts
  export const OWNER_HEADER = 'x-idlescape-owner';
  export interface OwnerAssertion { uid: string; character: string; exp: number }
  export function verifyOwnerHeader(header: string | null, gameName: string, secret: string, nowMs?: number): OwnerAssertion | null;
  export class OwnerAssertionError extends Error {}
  ```
  ```ts
  // engine-custom/src/idlescape/owner.ts
  export function setOwnerKey(player: Player, key: string): void;
  export function getOwnerKey(player: Player): string | null;
  export function hasOwnerKey(player: Player): boolean;
  ```

**Design note (record in PATCHES.md):** the check happens inside `PlayerLoading.load`, not in
`World.readLogin`. `load` is the first place that sees both the decrypted, `toSafeName`d
username *and* the `ClientSocket` the header was captured on, and it is already wrapped in a
`try/catch` in `World.onLoginMessage` (`World.ts:1911-1955`) that answers a throw with login
response **13** and a `player_force_logout` post the single-world login thread ignores
(`LoginThread.ts` only acts on that message when `Environment.login.enabled`). That gets a
correct rejection with a 165-line replacement instead of a 2 375-line one.

- [ ] **Step 1: Write the failing verifier test**

```ts
// engine-custom/src/idlescape/ownerAssertion.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { verifyOwnerHeader } from './ownerAssertion.js';

const SECRET = 'x'.repeat(32);
const NOW = 1_800_000_000_000;

// Mirrors server/src/auth/ownerAssertion.ts exactly; if these two ever disagree, logins break.
function entry(uid: string, character: string, exp: number, secret = SECRET): string {
    const sig = createHmac('sha256', secret).update(`cs1|${uid}|${character}|${exp}`).digest('base64url');
    return `${uid}.${character}.${exp}.${sig}`;
}

test('accepts the entry whose character matches the decrypted login name', () => {
    const header = `${entry('u1', 'alice', NOW + 1000)}~${entry('u1', 'bob', NOW + 1000)}`;
    assert.deepEqual(verifyOwnerHeader(header, 'bob', SECRET, NOW), { uid: 'u1', character: 'bob', exp: NOW + 1000 });
});

test('refuses a name with no entry, a forged signature, a wrong secret and an expired entry', () => {
    const header = entry('u1', 'alice', NOW + 1000);
    assert.equal(verifyOwnerHeader(header, 'mallory', SECRET, NOW), null);
    assert.equal(verifyOwnerHeader(`${header}x`, 'alice', SECRET, NOW), null);
    assert.equal(verifyOwnerHeader(header, 'alice', 'y'.repeat(32), NOW), null);
    assert.equal(verifyOwnerHeader(entry('u1', 'alice', NOW - 1), 'alice', SECRET, NOW), null);
});

test('refuses to authorise anything when no secret is configured', () => {
    assert.equal(verifyOwnerHeader(entry('u1', 'alice', NOW + 1000), 'alice', '', NOW), null);
});

test('survives junk headers without throwing', () => {
    for (const bad of [null, '', '~~~', 'a.b', 'a.b.c.d.e', `${'a'.repeat(5000)}`]) {
        assert.equal(verifyOwnerHeader(bad, 'alice', SECRET, NOW), null);
    }
});

test('an entry for the right name but a different uid still binds to that uid', () => {
    // Two accounts cannot both own one name (gameNames/{name} is a unique index on the front
    // server), so whichever uid signed for this name is the owner of the bank it opens.
    const parsed = verifyOwnerHeader(entry('u2', 'alice', NOW + 1000), 'alice', SECRET, NOW);
    assert.equal(parsed?.uid, 'u2');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pwsh scripts/engine-overlay.ps1 && cd engine/server && npx tsx --test src/idlescape/ownerAssertion.test.ts`
Expected: FAIL — cannot resolve `./ownerAssertion.js`.

- [ ] **Step 3: Write the verifier and the owner-key map**

```ts
// engine-custom/src/idlescape/ownerAssertion.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Upgrade header the front server's relay sets (server/src/proxy/ws.ts OWNER_HEADER). */
export const OWNER_HEADER = 'x-idlescape-owner';

const VERSION = 'cs1';
const MAX_HEADER_BYTES = 4000;
const MAX_ENTRIES = 5;
const UID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const NAME_RE = /^[a-z0-9_]{1,12}$/;

export interface OwnerAssertion {
    uid: string;
    character: string;
    exp: number;
}

export class OwnerAssertionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OwnerAssertionError';
    }
}

/**
 * Picks the entry for `gameName` out of the relayed header and verifies it. `gameName` is the
 * name the engine itself decrypted from the RSA login block and passed through toSafeName --
 * that is the whole point: the relay never sees it, so only this comparison can bind a socket
 * to an account.
 */
export function verifyOwnerHeader(header: string | null, gameName: string, secret: string, nowMs: number = Date.now()): OwnerAssertion | null {
    if (secret.length === 0 || !header || header.length > MAX_HEADER_BYTES) {
        return null;
    }

    const entries = header.split('~').filter(part => part.length > 0);
    if (entries.length === 0 || entries.length > MAX_ENTRIES) {
        return null;
    }

    for (const raw of entries) {
        const parts = raw.split('.');
        if (parts.length !== 4) {
            continue;
        }

        const [uid, character, expText, sig] = parts;
        if (character !== gameName || !UID_RE.test(uid) || !NAME_RE.test(character) || sig.length === 0) {
            continue;
        }

        const exp = Number(expText);
        if (!Number.isSafeInteger(exp) || exp <= nowMs) {
            continue;
        }

        const expected = Buffer.from(createHmac('sha256', secret).update(`${VERSION}|${uid}|${character}|${exp}`).digest('base64url'));
        const actual = Buffer.from(sig);
        if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
            continue;
        }

        return { uid, character, exp };
    }

    return null;
}
```

```ts
// engine-custom/src/idlescape/owner.ts
import type Player from '#/engine/entity/Player.js';

/**
 * Which Firebase account owns each online player. A WeakMap rather than a field on Player,
 * because Player.ts is NOT one of the overlay's whole-file replacements: adding a field there
 * would mean carrying a 2 304-line copy of upstream code for one property.
 */
const ownerKeys = new WeakMap<Player, string>();

export const OWNER_KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function setOwnerKey(player: Player, key: string): void {
    if (!OWNER_KEY_RE.test(key)) {
        throw new Error(`bad owner key: ${key}`);
    }
    ownerKeys.set(player, key);
}

export function getOwnerKey(player: Player): string | null {
    return ownerKeys.get(player) ?? null;
}

export function hasOwnerKey(player: Player): boolean {
    return ownerKeys.has(player);
}
```

- [ ] **Step 4: Replace `src/server/ClientSocket.ts`**

Copy `engine/server/src/server/ClientSocket.ts` to `engine-custom/src/server/ClientSocket.ts`
verbatim and add one field next to `remoteAddress`:

```ts
export default abstract class ClientSocket {
    uuid = randomUUID();
    remoteAddress = 'unknown';
    /**
     * idlescape: the X-Idlescape-Owner header from the WebSocket upgrade, verbatim. Set in
     * src/web.ts's wsHandler; read in PlayerLoading.load once the login name is decrypted.
     * Null for the TCP listener (the original Java client cannot carry it), which is why a
     * world with login.requireOwner=true refuses TCP logins.
     */
    ownerHeader: string | null = null;
    totalBytesRead = 0;
```

- [ ] **Step 5: Replace `src/web.ts` — capture the header**

Copy `engine/server/src/web.ts` to `engine-custom/src/web.ts` verbatim, then apply hunk 1 of 3
(the other two arrive in Task 10). Anchor: the `wsHandler` of the `GET /` route, at the
`new WSClientSocket(` construction.

```ts
    wsHandler: (socket, req) => {
        const client = new WSClientSocket(
            {
                send(data: Uint8Array) {
                    socket.send(data);
                },
                close() {
                    socket.close();
                },
                terminate() {
                    socket.terminate();
                }
            },
            req.socket.remoteAddress ?? 'unknown'
        );

        // idlescape: the front server's relay promotes the browser's cs_owner cookie to this
        // header (server/src/proxy/ws.ts). The login block is RSA-encrypted end to end, so
        // this is the only channel that can tell the engine which account owns the socket;
        // PlayerLoading.load checks it against the name it decrypts.
        const ownerHeader = req.headers[OWNER_HEADER];
        client.ownerHeader = typeof ownerHeader === 'string' ? ownerHeader : null;
```

and add the import beside the other `#/server/...` imports:

```ts
import { OWNER_HEADER } from '#/idlescape/ownerAssertion.js';
```

- [ ] **Step 6: Replace `src/engine/entity/PlayerLoading.ts` — verify and stamp**

Copy `engine/server/src/engine/entity/PlayerLoading.ts` verbatim, then apply hunk 1 of 3 (hunks
2 and 3 arrive in Task 8). Anchor: `static load(name, sav, client)`, immediately after the
`const player = client ? new NetworkPlayer(...) : new Player(...)` line.

```ts
    static load(name: string, sav: Packet, client: ClientSocket | null) {
        const hash64 = toBase37(name); // username or email.
        const name37 = toBase37(name); // always username.
        const safeName = fromBase37(name37); // always safe username.

        const player = client ? new NetworkPlayer(safeName, name37, hash64, client) : new Player(safeName, name37, hash64);

        // idlescape: bind this login to the Firebase account that owns the character. The
        // assertion arrived on the WebSocket upgrade (src/web.ts); safeName is the name the
        // engine decrypted from the login block, so this comparison is the binding. Throwing
        // here is answered by World.onLoginMessage with login response 13.
        const owner = verifyOwnerHeader(client?.ownerHeader ?? null, safeName, idlescapeConfig.ownerSecret);
        if (owner) {
            setOwnerKey(player, owner.uid);
        } else if (idlescapeConfig.requireOwner) {
            throw new OwnerAssertionError(`login for '${safeName}' carried no valid owner assertion`);
        }

        player.lastConnected = World.currentTick;
```

with the imports added to the existing block:

```ts
import { idlescapeConfig } from '#/idlescape/config.js';
import { OwnerAssertionError, verifyOwnerHeader } from '#/idlescape/ownerAssertion.js';
import { setOwnerKey } from '#/idlescape/owner.js';
```

- [ ] **Step 7: Record the patches**

`engine-custom/manifest.json` — add `src/server/ClientSocket.ts`, `src/web.ts` and
`src/engine/entity/PlayerLoading.ts` as `"kind": "replace"` with their pre-overlay sha256, and
the three new `src/idlescape/*.ts` files as `"kind": "new"`. Add an anchor entry:

```json
{ "path": "src/engine/World.ts", "sha256": "<hex>", "why": "PlayerLoading.load's throw relies on the try/catch in onLoginMessage answering with login response 13; World.cycle is wrapped at runtime" }
```

`engine-custom/PATCHES.md` — one section per replacement, each naming the anchor above, plus:

```sh
grep -c "ownerHeader: string | null = null;"                 src/server/ClientSocket.ts            # 1
grep -c "client.ownerHeader = typeof ownerHeader === 'string'" src/web.ts                          # 1
grep -c "verifyOwnerHeader(client?.ownerHeader ?? null"      src/engine/entity/PlayerLoading.ts    # 1
```

- [ ] **Step 8: Run typecheck and tests**

Run: `pwsh scripts/engine-overlay.ps1 && cd engine/server && npx tsc --noEmit && npx tsx --test src/idlescape/*.test.ts`
Expected: clean typecheck, all suites pass.

- [ ] **Step 9: Commit**

```bash
git add engine-custom
git commit -m "feat(engine-overlay): verify the relayed owner assertion against the decrypted login name"
```

---

### Task 6: Production hardening — staff level and the deploy configuration

**Files:**
- Create: `engine-custom/src/server/login/LoginThread.ts` (replacement), `engine-custom/src/idlescape/staff.ts`, `engine-custom/src/idlescape/staff.test.ts`
- Modify: `engine-custom/manifest.json`, `engine-custom/PATCHES.md`

**Interfaces:**
- Produces:
  ```ts
  // engine-custom/src/idlescape/staff.ts
  export function staffLevelFor(username: string, production: boolean, devStaffLevel: number, staff: Record<string, number>): number;
  ```

**Ruling (record in PATCHES.md):** the assertion does **not** carry a staff level in v1. The
login worker runs in a worker thread and never sees the socket, so the only value it can source
is the username; staff level therefore comes from an explicit allow-list in
`data/config/idlescape.json` (`{"staff": {"someadmin": 2}}`), defaulting to **0** for everyone.
`IDLESCAPE_DEV_STAFF` is the escape hatch for local play and is forced to 0 whenever
`node.production` is true (`config.ts`, Task 2). Upstream's blanket `staffmodlevel = 4` when
`!production` is deleted from both branches.

- [ ] **Step 1: Write the failing test**

```ts
// engine-custom/src/idlescape/staff.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { staffLevelFor } from './staff.js';

test('everyone is level 0 by default, in dev and in production', () => {
    assert.equal(staffLevelFor('bob', false, 0, {}), 0);
    assert.equal(staffLevelFor('bob', true, 0, {}), 0);
});

test('the allow-list applies in both modes and is case-insensitive', () => {
    assert.equal(staffLevelFor('Admin', true, 0, { admin: 2 }), 2);
    assert.equal(staffLevelFor('admin', false, 0, { admin: 2 }), 2);
});

test('the dev override applies only outside production and never beats a higher allow-list entry', () => {
    assert.equal(staffLevelFor('bob', false, 4, {}), 4);
    assert.equal(staffLevelFor('bob', true, 4, {}), 0);
    assert.equal(staffLevelFor('admin', false, 1, { admin: 3 }), 3);
});

test('an out-of-range allow-list value cannot exceed 4 or go negative', () => {
    assert.equal(staffLevelFor('x', false, 0, { x: 99 }), 4);
    assert.equal(staffLevelFor('x', false, 0, { x: -1 }), 0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pwsh scripts/engine-overlay.ps1 && cd engine/server && npx tsx --test src/idlescape/staff.test.ts`
Expected: FAIL — cannot resolve `./staff.js`.

- [ ] **Step 3: Write the module**

```ts
// engine-custom/src/idlescape/staff.ts

/**
 * Upstream gives every player staffmodlevel 4 whenever node.production is false
 * (LoginThread.ts, both branches), which makes `::give coins 2147483647` available to anyone
 * -- fine for a single-developer world, fatal for a shared economy. This is the replacement
 * policy: nobody is staff unless the world's own config says so.
 */
export function staffLevelFor(username: string, production: boolean, devStaffLevel: number, staff: Record<string, number>): number {
    const listed = staff[username.toLowerCase()];
    const fromList = Number.isInteger(listed) ? Math.max(0, Math.min(4, listed)) : 0;
    const fromDev = production ? 0 : Math.max(0, Math.min(4, devStaffLevel));
    return Math.max(fromList, fromDev);
}
```

- [ ] **Step 4: Replace `src/server/login/LoginThread.ts`**

Copy `engine/server/src/server/login/LoginThread.ts` verbatim, then two hunks.

Hunk 1 — anchor: the multiworld branch of `case 'player_login'`, the block that reads
`if (!Environment.node.production) { response.staffmodlevel = 4; // dev (destructive commands) }`
directly after `await client.playerLogin(...)`. Replace with:

```ts
                // idlescape: never hand out staff level 4 for being a dev build. See
                // engine-custom/src/idlescape/staff.ts.
                response.staffmodlevel = staffLevelFor(username, Environment.node.production, idlescapeConfig.devStaffLevel, idlescapeConfig.staff);
```

Hunk 2 — anchor: the single-world `else` branch, the four lines
`let staffmodlevel = 0; if (!Environment.node.production) { staffmodlevel = 4; // dev (destructive commands) }`
directly above `const profile = Environment.node.profile;`. Replace with:

```ts
                const staffmodlevel = staffLevelFor(username, Environment.node.production, idlescapeConfig.devStaffLevel, idlescapeConfig.staff);
```

and add the imports next to the existing `Environment` import:

```ts
import { idlescapeConfig } from '#/idlescape/config.js';
import { staffLevelFor } from '#/idlescape/staff.js';
```

- [ ] **Step 5: Record the patch**

`engine-custom/manifest.json` — `src/server/login/LoginThread.ts` as `"kind": "replace"` plus
the two new `src/idlescape` files.

`engine-custom/PATCHES.md`:

```markdown
### `src/server/login/LoginThread.ts` — staff level is an allow-list, not a build flag

Two hunks, both deleting an upstream `staffmodlevel = 4` that fires whenever
`node.production` is false: one in the multiworld branch just after `client.playerLogin(...)`,
one in the single-world branch just above `const profile = Environment.node.profile;`. Both
now call `staffLevelFor(username, ...)`. The login worker never sees the socket, so the owner
assertion cannot reach it; the allow-list in `data/config/idlescape.json` is the only source
of a non-zero level, plus `IDLESCAPE_DEV_STAFF` which `config.ts` forces to 0 in production.
```

```sh
grep -c "staffLevelFor(username, Environment.node.production" src/server/login/LoginThread.ts   # 2
grep -c "staffmodlevel = 4"                                   src/server/login/LoginThread.ts   # 0
```

- [ ] **Step 6: Verify the world still starts and nobody is staff**

Run (PowerShell): `scripts/start-stack.ps1` in one terminal; then in Git Bash log in through
`http://localhost:8787` as a guest and type `::give coins 100` in game.
Expected: with `IDLESCAPE_DEV_STAFF=4` exported by `start-stack.ps1` (dev path) the cheat still
works; re-run with `$env:IDLESCAPE_DEV_STAFF=''` before `start-stack.ps1 -Prod` and the cheat
does nothing. Note in the task report which was observed.

- [ ] **Step 7: Run typecheck and tests**

Run: `pwsh scripts/engine-overlay.ps1 && pwsh scripts/engine-overlay.ps1 -Check && cd engine/server && npx tsc --noEmit && npx tsx --test src/idlescape/*.test.ts`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add engine-custom
git commit -m "feat(engine-overlay): staff level from an allow-list, never 4 for being a dev build"
```

---
### Task 7: Bank op types and the pure `applyOps` (tab invariant included)

**Files:**
- Create: `engine-custom/src/idlescape/types.ts`, `engine-custom/src/idlescape/ops.ts`, `engine-custom/src/idlescape/ops.test.ts`
- Modify: `engine-custom/manifest.json`

**Interfaces:**
- Consumes: `Inventory` (`#/engine/Inventory.js`), `ObjType` (`#/cache/config/ObjType.js`).
- Produces:
  ```ts
  // engine-custom/src/idlescape/types.ts
  export interface BankSlotDto { slot: number; obj: number; count: number }
  export interface OwnerBankFile { version: number; tabs: number[]; slots: BankSlotDto[]; migrated: string[] }
  export type BankOp =
    | { op: 'delta'; obj: number; count: number }        // + adds, - removes; server-internal (SP9)
    | { op: 'swap'; a: number; b: number }
    | { op: 'insert'; from: number; to: number }
    | { op: 'moveToTab'; slot: number; tab: number }     // tab 0 = main, 1..9 = a tab
    | { op: 'setTabs'; sizes: number[] }
    | { op: 'sort'; tab: number; by: 'value' | 'name' | 'id' };
  export const MAX_TABS = 9;
  export const LAYOUT_OPS = ['swap', 'insert', 'moveToTab', 'setTabs', 'sort'] as const;
  export type BankApplyError = 'bad_op' | 'bad_slot' | 'bad_tab' | 'tab_invariant' | 'insufficient' | 'full';
  ```
  ```ts
  // engine-custom/src/idlescape/ops.ts
  export interface ApplyResult { ok: true; tabs: number[]; changed: boolean } | { ok: false; error: BankApplyError }
  export function normaliseOp(raw: unknown): BankOp | null;
  export function applyOps(inv: Inventory, tabs: number[], ops: BankOp[]): ApplyResult;
  export function lastUsedSlot(inv: Inventory): number;      // highest occupied index + 1, 0 when empty
  export function tabRanges(tabs: number[]): Array<{ start: number; end: number }>;
  ```

**Rulings this task records (in `engine-custom/PATCHES.md`, "Owner bank semantics"):**

1. **Tab invariant.** `tabs.length <= 9`; every size is `>= 1`; `sum(sizes) <= lastUsedSlot(inv)`.
   SP8b says "sum ≤ used slots"; a 274 bank is not required to be hole-free (a withdrawal
   leaves a gap), so "used" is read as *the highest occupied slot index + 1* — the OSRS
   meaning of "tabs cannot extend past the items". A `setTabs` that breaks it is rejected
   whole with `tab_invariant`; the batch is atomic.
2. **Insert across a tab boundary.** `insert` moves one slot and shifts the rest; if `from`
   and `to` fall in different tab ranges the op is rejected with `tab_invariant` unless the
   same batch also carries a `setTabs` that makes the move legal (order matters — the batch
   is applied in sequence and validated after every op).
3. **Empty tabs.** After each op, any tab whose size reaches 0 is dropped and later tabs shift
   left, exactly as OSRS does.
4. **`sort by: 'value'`** uses the engine's only price signal, High Alchemy
   (`max(floor(ObjType.cost * 6 / 10), 1)`, verified against `alchemy.rs2:25`). SP9 can pass a
   market price map later; the engine never guesses one.
5. **`delta`.** `{ op: 'delta', obj, count }`; the spec's `{ obj, delta }` shorthand is
   accepted by `normaliseOp` and normalised to it. A negative count that exceeds the held
   amount fails with `insufficient` and rolls the batch back; a positive count that does not
   fit fails with `full`. Nothing is ever dropped on the floor (unlike `INV_ADD`).

- [ ] **Step 1: Write the failing test**

```ts
// engine-custom/src/idlescape/ops.test.ts
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';
import { Inventory } from '#/engine/Inventory.js';

import { applyOps, lastUsedSlot, normaliseOp, tabRanges } from './ops.js';

before(() => {
    InvType.load('data/pack');
    ObjType.load('data/pack');
});

function bank(entries: Array<[number, number, number]>): Inventory {
    const inv = Inventory.fromType(95);
    for (const [slot, obj, count] of entries) inv.set(slot, { id: obj, count });
    inv.resetTracking();
    return inv;
}

test('lastUsedSlot is the highest occupied index plus one, holes included', () => {
    assert.equal(lastUsedSlot(bank([])), 0);
    assert.equal(lastUsedSlot(bank([[0, 995, 1]])), 1);
    assert.equal(lastUsedSlot(bank([[0, 995, 1], [5, 1038, 1]])), 6);
});

test('tabRanges turns sizes into contiguous ranges and leaves the rest to the main tab', () => {
    assert.deepEqual(tabRanges([2, 3]), [{ start: 0, end: 2 }, { start: 2, end: 5 }]);
    assert.deepEqual(tabRanges([]), []);
});

test('swap exchanges two slots and marks the inventory dirty', () => {
    const inv = bank([[0, 995, 10], [1, 1038, 1]]);
    const res = applyOps(inv, [], [{ op: 'swap', a: 0, b: 1 }]);
    assert.equal(res.ok, true);
    assert.equal(inv.get(0)?.id, 1038);
    assert.equal(inv.get(1)?.id, 995);
    assert.equal(inv.update, true);
});

test('swap with an empty slot moves the item and leaves a hole behind', () => {
    const inv = bank([[0, 995, 10]]);
    assert.equal(applyOps(inv, [], [{ op: 'swap', a: 0, b: 7 }]).ok, true);
    assert.equal(inv.get(0), null);
    assert.equal(inv.get(7)?.id, 995);
});

test('insert shifts the intervening slots in both directions', () => {
    const inv = bank([[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1]]);
    assert.equal(applyOps(inv, [], [{ op: 'insert', from: 0, to: 2 }]).ok, true);
    assert.deepEqual([0, 1, 2, 3].map(s => inv.get(s)?.id), [2, 3, 1, 4]);
    assert.equal(applyOps(inv, [], [{ op: 'insert', from: 2, to: 0 }]).ok, true);
    assert.deepEqual([0, 1, 2, 3].map(s => inv.get(s)?.id), [1, 2, 3, 4]);
});

test('a slot outside the container is refused', () => {
    const inv = bank([[0, 995, 1]]);
    assert.deepEqual(applyOps(inv, [], [{ op: 'swap', a: 0, b: 240 }]), { ok: false, error: 'bad_slot' });
    assert.deepEqual(applyOps(inv, [], [{ op: 'insert', from: -1, to: 0 }]), { ok: false, error: 'bad_slot' });
});

test('setTabs enforces nine tabs, positive sizes and the used-slot ceiling', () => {
    const inv = bank([[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1]]);
    assert.deepEqual(applyOps(inv, [], [{ op: 'setTabs', sizes: [2, 2] }]), { ok: true, tabs: [2, 2], changed: true });
    assert.deepEqual(applyOps(inv, [], [{ op: 'setTabs', sizes: [3, 3] }]), { ok: false, error: 'tab_invariant' });
    assert.deepEqual(applyOps(inv, [], [{ op: 'setTabs', sizes: [1, 0, 1] }]), { ok: false, error: 'tab_invariant' });
    assert.deepEqual(applyOps(inv, [], [{ op: 'setTabs', sizes: Array(10).fill(1) }]), { ok: false, error: 'tab_invariant' });
});

test('an insert that would cross a tab boundary is refused, and allowed when the batch resizes first', () => {
    const inv = bank([[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1]]);
    assert.deepEqual(applyOps(inv, [2, 2], [{ op: 'insert', from: 0, to: 3 }]), { ok: false, error: 'tab_invariant' });
    const res = applyOps(inv, [2, 2], [{ op: 'setTabs', sizes: [1, 3] }, { op: 'insert', from: 0, to: 3 }]);
    assert.equal(res.ok, true);
    assert.deepEqual([0, 1, 2, 3].map(s => inv.get(s)?.id), [2, 3, 4, 1]);
});

test('a failing op inside a batch rolls the whole batch back', () => {
    const inv = bank([[0, 1, 1], [1, 2, 1]]);
    const before = [0, 1].map(s => inv.get(s)?.id);
    assert.deepEqual(applyOps(inv, [], [{ op: 'swap', a: 0, b: 1 }, { op: 'swap', a: 0, b: 999 }]), { ok: false, error: 'bad_slot' });
    assert.deepEqual([0, 1].map(s => inv.get(s)?.id), before);
});

test('moveToTab appends to the end of a tab and grows it, main tab included', () => {
    const inv = bank([[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1]]);
    const res = applyOps(inv, [2, 2], [{ op: 'moveToTab', slot: 3, tab: 1 }]);
    assert.deepEqual(res, { ok: true, tabs: [3, 1], changed: true });
    assert.deepEqual([0, 1, 2, 3].map(s => inv.get(s)?.id), [1, 2, 4, 3]);
});

test('a tab emptied by moveToTab is removed and later tabs shift left', () => {
    const inv = bank([[0, 1, 1], [1, 2, 1], [2, 3, 1]]);
    const res = applyOps(inv, [1, 1], [{ op: 'moveToTab', slot: 0, tab: 2 }]);
    assert.deepEqual(res, { ok: true, tabs: [1], changed: true });
});

test('sort orders a tab by id, name and High Alchemy value without touching other tabs', () => {
    // 995 coins (cost 1), 1038 red partyhat (cost 1), 1618 uncut diamond (cost 200 in 274 data)
    const inv = bank([[0, 1618, 1], [1, 995, 5], [2, 1038, 1], [3, 4151, 1]]);
    assert.equal(applyOps(inv, [3], [{ op: 'sort', tab: 1, by: 'id' }]).ok, true);
    assert.deepEqual([0, 1, 2].map(s => inv.get(s)?.id), [995, 1038, 1618]);
    assert.equal(inv.get(3)?.id, 4151, 'the main tab is untouched');

    assert.equal(applyOps(inv, [3], [{ op: 'sort', tab: 1, by: 'value' }]).ok, true);
    const values = [0, 1, 2].map(s => Math.max(Math.floor((ObjType.get(inv.get(s)!.id).cost * 6) / 10), 1));
    assert.deepEqual(values, [...values].sort((a, b) => b - a), 'value sort is descending');

    assert.equal(applyOps(inv, [3], [{ op: 'sort', tab: 1, by: 'name' }]).ok, true);
    const names = [0, 1, 2].map(s => ObjType.get(inv.get(s)!.id).name ?? '');
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
});

test('delta adds and removes a stack, and refuses to overdraw', () => {
    const inv = bank([[0, 995, 100]]);
    assert.equal(applyOps(inv, [], [{ op: 'delta', obj: 995, count: -40 }]).ok, true);
    assert.equal(inv.getItemCount(995), 60);
    assert.deepEqual(applyOps(inv, [], [{ op: 'delta', obj: 995, count: -61 }]), { ok: false, error: 'insufficient' });
    assert.equal(inv.getItemCount(995), 60, 'the failed removal did not partially apply');
    assert.equal(applyOps(inv, [], [{ op: 'delta', obj: 995, count: 40 }]).ok, true);
    assert.equal(inv.getItemCount(995), 100);
});

test('delta refuses to overflow a full bank instead of dropping items on the floor', () => {
    const inv = Inventory.fromType(95);
    for (let slot = 0; slot < 240; slot++) inv.set(slot, { id: 1038, count: 1 });
    inv.resetTracking();
    assert.deepEqual(applyOps(inv, [], [{ op: 'delta', obj: 1618, count: 1 }]), { ok: false, error: 'full' });
    assert.equal(inv.update, false);
});

test('normaliseOp accepts the spec shorthand and rejects junk', () => {
    assert.deepEqual(normaliseOp({ obj: 995, delta: -5 }), { op: 'delta', obj: 995, count: -5 });
    assert.deepEqual(normaliseOp({ op: 'swap', a: 1, b: 2 }), { op: 'swap', a: 1, b: 2 });
    assert.deepEqual(normaliseOp({ op: 'sort', tab: 0, by: 'value' }), { op: 'sort', tab: 0, by: 'value' });
    for (const bad of [null, 42, {}, { op: 'nope' }, { op: 'swap', a: 1 }, { op: 'swap', a: 1.5, b: 2 }, { op: 'sort', tab: 0, by: 'colour' }, { op: 'setTabs', sizes: 'x' }]) {
        assert.equal(normaliseOp(bad), null);
    }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pwsh scripts/engine-overlay.ps1 && cd engine/server && npx tsx --test src/idlescape/ops.test.ts`
Expected: FAIL — cannot resolve `./ops.js`.

- [ ] **Step 3: Write `types.ts`**

Exactly the interface block above, plus:

```ts
// engine-custom/src/idlescape/types.ts
export const BANK_INV_NAME = 'bank';
export const BANK_CAPACITY_FALLBACK = 240;

export function isLayoutOp(op: BankOp): boolean {
    return op.op !== 'delta';
}
```

- [ ] **Step 4: Write `ops.ts`**

```ts
// engine-custom/src/idlescape/ops.ts
import ObjType from '#/cache/config/ObjType.js';
import { Inventory } from '#/engine/Inventory.js';

import { MAX_TABS, type BankApplyError, type BankOp } from './types.js';

type Item = { id: number; count: number };
export type ApplyResult = { ok: true; tabs: number[]; changed: boolean } | { ok: false; error: BankApplyError };

function isInt(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value);
}

export function normaliseOp(raw: unknown): BankOp | null {
    if (typeof raw !== 'object' || raw === null) {
        return null;
    }
    const r = raw as Record<string, unknown>;

    // Spec section 7 spells a delta as { obj, delta }; the richer SP8b op set uses a tagged
    // union. Accept both, emit one.
    if (r.op === undefined && isInt(r.obj) && isInt(r.delta)) {
        return { op: 'delta', obj: r.obj, count: r.delta };
    }

    switch (r.op) {
        case 'delta':
            return isInt(r.obj) && isInt(r.count) && r.count !== 0 ? { op: 'delta', obj: r.obj, count: r.count } : null;
        case 'swap':
            return isInt(r.a) && isInt(r.b) ? { op: 'swap', a: r.a, b: r.b } : null;
        case 'insert':
            return isInt(r.from) && isInt(r.to) ? { op: 'insert', from: r.from, to: r.to } : null;
        case 'moveToTab':
            return isInt(r.slot) && isInt(r.tab) ? { op: 'moveToTab', slot: r.slot, tab: r.tab } : null;
        case 'setTabs':
            return Array.isArray(r.sizes) && r.sizes.every(isInt) ? { op: 'setTabs', sizes: r.sizes as number[] } : null;
        case 'sort':
            return isInt(r.tab) && (r.by === 'value' || r.by === 'name' || r.by === 'id') ? { op: 'sort', tab: r.tab, by: r.by } : null;
        default:
            return null;
    }
}

/** Highest occupied slot index + 1 (0 when the bank is empty). Holes are inside it. */
export function lastUsedSlot(inv: Inventory): number {
    for (let slot = inv.capacity - 1; slot >= 0; slot--) {
        if (inv.get(slot)) {
            return slot + 1;
        }
    }
    return 0;
}

export function tabRanges(tabs: number[]): Array<{ start: number; end: number }> {
    const out: Array<{ start: number; end: number }> = [];
    let start = 0;
    for (const size of tabs) {
        out.push({ start, end: start + size });
        start += size;
    }
    return out;
}

/** Which tab a slot belongs to: 1..9 for a real tab, 0 for the main tab beyond them. */
function tabOfSlot(tabs: number[], slot: number): number {
    const ranges = tabRanges(tabs);
    for (let i = 0; i < ranges.length; i++) {
        if (slot >= ranges[i].start && slot < ranges[i].end) {
            return i + 1;
        }
    }
    return 0;
}

function tabsValid(tabs: number[], used: number): boolean {
    if (tabs.length > MAX_TABS) return false;
    let sum = 0;
    for (const size of tabs) {
        if (size < 1) return false;
        sum += size;
    }
    return sum <= used;
}

function dropEmptyTabs(tabs: number[]): number[] {
    return tabs.filter(size => size > 0);
}

function alchValue(id: number): number {
    return Math.max(Math.floor((ObjType.get(id).cost * 6) / 10), 1);
}

function snapshot(inv: Inventory): Array<Item | null> {
    const out: Array<Item | null> = new Array(inv.capacity).fill(null);
    for (let slot = 0; slot < inv.capacity; slot++) {
        const item = inv.get(slot);
        out[slot] = item ? { id: item.id, count: item.count } : null;
    }
    return out;
}

function restore(inv: Inventory, items: Array<Item | null>): void {
    for (let slot = 0; slot < inv.capacity; slot++) {
        inv.set(slot, items[slot]);
    }
}

function moveWithin(items: Array<Item | null>, from: number, to: number): void {
    const moving = items[from];
    if (from < to) {
        for (let slot = from; slot < to; slot++) items[slot] = items[slot + 1];
    } else {
        for (let slot = from; slot > to; slot--) items[slot] = items[slot - 1];
    }
    items[to] = moving;
}

/**
 * Applies a batch atomically to `inv` (an Inventory the caller owns; every write goes through
 * Inventory.set, so dirty-slot tracking and the next inv_transmit diff come for free) and
 * returns the tab layout the batch leaves behind. On any failure nothing is written.
 */
export function applyOps(inv: Inventory, tabs: number[], ops: BankOp[]): ApplyResult {
    const original = snapshot(inv);
    let items = snapshot(inv);
    let nextTabs = dropEmptyTabs([...tabs]);
    let changed = false;

    const fail = (error: BankApplyError): ApplyResult => ({ ok: false, error });
    const valid = (slot: number) => slot >= 0 && slot < inv.capacity;

    for (const op of ops) {
        switch (op.op) {
            case 'swap': {
                if (!valid(op.a) || !valid(op.b)) return fail('bad_slot');
                const tmp = items[op.a];
                items[op.a] = items[op.b];
                items[op.b] = tmp;
                changed = true;
                break;
            }
            case 'insert': {
                if (!valid(op.from) || !valid(op.to)) return fail('bad_slot');
                if (tabOfSlot(nextTabs, op.from) !== tabOfSlot(nextTabs, op.to)) return fail('tab_invariant');
                moveWithin(items, op.from, op.to);
                changed = true;
                break;
            }
            case 'moveToTab': {
                if (!valid(op.slot)) return fail('bad_slot');
                if (op.tab < 0 || op.tab > MAX_TABS) return fail('bad_tab');
                const from = tabOfSlot(nextTabs, op.slot);
                if (from === op.tab) break;

                const sizes = [...nextTabs];
                while (sizes.length < op.tab) sizes.push(0);
                if (from > 0) sizes[from - 1] -= 1;

                // Destination is the end of the target tab; the main tab appends after them all.
                const ranges = tabRanges(sizes.map((s, i) => (i === op.tab - 1 ? s : s)));
                const target = op.tab === 0 ? Math.max(sizes.reduce((a, b) => a + b, 0), 0) : ranges[op.tab - 1].end;
                if (op.tab > 0) sizes[op.tab - 1] += 1;

                const dest = Math.min(Math.max(target, 0), inv.capacity - 1);
                moveWithin(items, op.slot, dest);
                nextTabs = dropEmptyTabs(sizes);
                changed = true;
                break;
            }
            case 'setTabs': {
                nextTabs = dropEmptyTabs([...op.sizes]);
                changed = true;
                break;
            }
            case 'sort': {
                if (op.tab < 0 || op.tab > MAX_TABS) return fail('bad_tab');
                const ranges = tabRanges(nextTabs);
                const range = op.tab === 0
                    ? { start: nextTabs.reduce((a, b) => a + b, 0), end: inv.capacity }
                    : ranges[op.tab - 1];
                if (!range) return fail('bad_tab');

                const held = items.slice(range.start, range.end).filter((item): item is Item => item !== null);
                held.sort((a, b) => {
                    if (op.by === 'id') return a.id - b.id;
                    if (op.by === 'name') return (ObjType.get(a.id).name ?? '').localeCompare(ObjType.get(b.id).name ?? '');
                    return alchValue(b.id) - alchValue(a.id);
                });
                for (let i = range.start; i < range.end; i++) {
                    items[i] = held[i - range.start] ?? null;
                }
                changed = true;
                break;
            }
            case 'delta': {
                // Applied through a scratch Inventory so stacking, the 0x7fffffff clamp and
                // "how many actually fitted" come from the engine's own container logic.
                const scratch = new Inventory(inv.type, inv.capacity, inv.stackType);
                restore(scratch, items);
                if (op.count > 0) {
                    if (scratch.add(op.obj, op.count) !== op.count) return fail('full');
                } else {
                    if (scratch.remove(op.obj, -op.count) !== -op.count) return fail('insufficient');
                }
                items = snapshot(scratch);
                changed = true;
                break;
            }
            default:
                return fail('bad_op');
        }

        // The invariant is checked after every op, not once at the end, so a batch cannot
        // pass through an illegal intermediate state and land somewhere plausible.
        const used = items.reduce((acc, item, slot) => (item ? slot + 1 : acc), 0);
        if (!tabsValid(nextTabs, used)) return fail('tab_invariant');
    }

    if (changed) {
        restore(inv, items);
    } else {
        restore(inv, original);
        inv.resetTracking();
    }
    return { ok: true, tabs: nextTabs, changed };
}
```

- [ ] **Step 5: Run the suite until green**

Run: `pwsh scripts/engine-overlay.ps1 && cd engine/server && npx tsc --noEmit && npx tsx --test src/idlescape/ops.test.ts`
Expected: all pass. If the `sort by value` fixture is ambiguous (two items with the same
`cost`), replace `1038`/`4151` with ids whose `cost` differs — print
`ObjType.get(id).cost` for the four fixture ids first and pick accordingly.

- [ ] **Step 6: Commit**

```bash
git add engine-custom
git commit -m "feat(engine-overlay): bank op types and atomic applyOps with the OSRS tab invariant"
```

---

### Task 8: `OwnerBankStore` — containers, persistence, versions, migration

**Files:**
- Create: `engine-custom/src/idlescape/ownerBank.ts`, `engine-custom/src/idlescape/ownerBank.test.ts`
- Modify: `engine-custom/manifest.json`

**Interfaces:**
- Consumes: `Inventory`, `InvType`, `applyOps`, `normaliseOp`, `lastUsedSlot`, `OwnerBankFile`, `idlescapeConfig`.
- Produces:
  ```ts
  // engine-custom/src/idlescape/ownerBank.ts
  export interface BankSnapshotDto { ownerKey: string; version: number; capacity: number; tabs: number[]; slots: BankSlotDto[] }
  export type ApplyOutcome =
    | { ok: true; version: number }
    | { ok: false; reason: 'conflict'; version: number }
    | { ok: false; reason: BankApplyError };
  export class OwnerBankStore {
    constructor(dir: string, capacity?: number);
    get(ownerKey: string): Inventory;                 // loads from disk on first touch
    tabs(ownerKey: string): number[];
    setTabs(ownerKey: string, tabs: number[]): void;  // from the in-game varps
    version(ownerKey: string): number;
    snapshot(ownerKey: string): BankSnapshotDto;
    apply(ownerKey: string, expectedVersion: number | null, ops: BankOp[]): ApplyOutcome;
    migrate(ownerKey: string, username: string, objs: BankSlotDto[]): boolean;  // true when it merged
    bumpDirty(): string[];                            // owners whose container changed; bumps versions
    flush(): void;                                    // persist every dirty owner, atomically
    evict(keep: (ownerKey: string) => boolean): number;
    loaded(): string[];
  }
  export const OWNER_KEY_RE: RegExp;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// engine-custom/src/idlescape/ownerBank.test.ts
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';

import { OwnerBankStore } from './ownerBank.js';

let dir = '';

before(() => {
    InvType.load('data/pack');
    ObjType.load('data/pack');
});

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idlescape-banks-'));
});

test('a fresh owner gets an empty 240-slot container at version 0', () => {
    const store = new OwnerBankStore(dir);
    const inv = store.get('uidA');
    assert.equal(inv.capacity, 240);
    assert.equal(store.version('uidA'), 0);
    assert.deepEqual(store.snapshot('uidA'), { ownerKey: 'uidA', version: 0, capacity: 240, tabs: [], slots: [] });
});

test('every character of one owner gets the same container object', () => {
    const store = new OwnerBankStore(dir);
    assert.equal(store.get('uidA'), store.get('uidA'));
    assert.notEqual(store.get('uidA'), store.get('uidB'));
});

test('a mutation bumps the version once per bumpDirty, and flush writes a versioned file', () => {
    const store = new OwnerBankStore(dir);
    store.get('uidA').add(995, 500);
    assert.deepEqual(store.bumpDirty(), ['uidA']);
    assert.equal(store.version('uidA'), 1);
    assert.deepEqual(store.bumpDirty(), [], 'a second sweep with no change bumps nothing');

    store.flush();
    const file = JSON.parse(fs.readFileSync(path.join(dir, 'uidA.json'), 'utf8'));
    assert.equal(file.version, 1);
    assert.deepEqual(file.slots, [{ slot: 0, obj: 995, count: 500 }]);
    assert.deepEqual(file.tabs, []);
});

test('a second store instance reads the file back, slots, tabs, version and all', () => {
    const first = new OwnerBankStore(dir);
    first.get('uidA').add(995, 500);
    first.bumpDirty();
    first.setTabs('uidA', [1]);
    first.flush();

    const second = new OwnerBankStore(dir);
    assert.equal(second.get('uidA').getItemCount(995), 500);
    assert.deepEqual(second.tabs('uidA'), [1]);
    assert.equal(second.version('uidA'), 1);
});

test('apply honours expectedVersion and answers a stale one with conflict', () => {
    const store = new OwnerBankStore(dir);
    store.get('uidA').add(995, 100);
    store.bumpDirty();                                   // version 1

    assert.deepEqual(store.apply('uidA', 0, [{ op: 'delta', obj: 995, count: -50 }]), { ok: false, reason: 'conflict', version: 1 });
    assert.equal(store.get('uidA').getItemCount(995), 100, 'a conflict changes nothing');

    assert.deepEqual(store.apply('uidA', 1, [{ op: 'delta', obj: 995, count: -50 }]), { ok: true, version: 2 });
    assert.equal(store.get('uidA').getItemCount(995), 50);

    assert.deepEqual(store.apply('uidA', null, [{ op: 'delta', obj: 995, count: -50 }]), { ok: true, version: 3 });
});

test('a rejected op leaves the version and the contents alone', () => {
    const store = new OwnerBankStore(dir);
    store.get('uidA').add(995, 10);
    store.bumpDirty();
    assert.deepEqual(store.apply('uidA', 1, [{ op: 'delta', obj: 995, count: -11 }]), { ok: false, reason: 'insufficient' });
    assert.equal(store.version('uidA'), 1);
    assert.equal(store.get('uidA').getItemCount(995), 10);
});

test('apply persists immediately, so an offline owner survives a crash', () => {
    const store = new OwnerBankStore(dir);
    assert.deepEqual(store.apply('uidOffline', null, [{ op: 'delta', obj: 995, count: 25 }]), { ok: true, version: 1 });
    const file = JSON.parse(fs.readFileSync(path.join(dir, 'uidOffline.json'), 'utf8'));
    assert.deepEqual(file.slots, [{ slot: 0, obj: 995, count: 25 }]);
});

test('setTabs from the in-game varps is recorded and bumps the version through bumpDirty', () => {
    const store = new OwnerBankStore(dir);
    store.get('uidA').add(995, 1);
    store.bumpDirty();
    store.setTabs('uidA', [1]);
    assert.deepEqual(store.bumpDirty(), ['uidA']);
    assert.deepEqual(store.tabs('uidA'), [1]);
});

test('migration merges a .sav bank once per character, first character keeping slot order', () => {
    const store = new OwnerBankStore(dir);
    assert.equal(store.migrate('uidA', 'alice', [{ slot: 3, obj: 995, count: 100 }, { slot: 0, obj: 1038, count: 1 }]), true);
    assert.equal(store.get('uidA').get(3)?.id, 995);
    assert.equal(store.get('uidA').get(0)?.id, 1038);

    // the same character logging in again never re-merges
    assert.equal(store.migrate('uidA', 'alice', [{ slot: 0, obj: 1038, count: 1 }]), false);
    assert.equal(store.get('uidA').getItemCount(1038), 1);

    // a second character's bank is appended, stacking where it can and filling holes otherwise
    assert.equal(store.migrate('uidA', 'bob', [{ slot: 0, obj: 995, count: 50 }, { slot: 1, obj: 1618, count: 2 }]), true);
    assert.equal(store.get('uidA').getItemCount(995), 150);
    assert.equal(store.get('uidA').getItemCount(1618), 2);

    store.flush();
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'uidA.json'), 'utf8')).migrated, ['alice', 'bob']);
});

test('a bad owner key never reaches the filesystem', () => {
    const store = new OwnerBankStore(dir);
    for (const bad of ['../escape', 'a/b', '', 'x'.repeat(65), 'a b']) {
        assert.throws(() => store.get(bad), /owner key/);
    }
});

test('a corrupt bank file is quarantined rather than losing the world', () => {
    fs.writeFileSync(path.join(dir, 'uidBad.json'), '{ not json');
    const store = new OwnerBankStore(dir);
    assert.equal(store.get('uidBad').getItemCount(995), 0);
    assert.equal(fs.existsSync(path.join(dir, 'uidBad.json.corrupt')), true);
});

test('evict drops containers nobody is using and keeps the ones the predicate holds', () => {
    const store = new OwnerBankStore(dir);
    store.get('uidA');
    store.get('uidB').add(995, 1);
    store.bumpDirty();
    store.flush();
    assert.equal(store.evict(key => key === 'uidB'), 1);
    assert.deepEqual(store.loaded(), ['uidB']);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pwsh scripts/engine-overlay.ps1 && cd engine/server && npx tsx --test src/idlescape/ownerBank.test.ts`
Expected: FAIL — cannot resolve `./ownerBank.js`.

- [ ] **Step 3: Write the store**

```ts
// engine-custom/src/idlescape/ownerBank.ts
import fs from 'node:fs';
import path from 'node:path';

import InvType from '#/cache/config/InvType.js';
import { Inventory } from '#/engine/Inventory.js';

import { applyOps, lastUsedSlot } from './ops.js';
import { BANK_CAPACITY_FALLBACK, BANK_INV_NAME, type BankApplyError, type BankOp, type BankSlotDto, type OwnerBankFile } from './types.js';

export const OWNER_KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface BankSnapshotDto {
    ownerKey: string;
    version: number;
    capacity: number;
    tabs: number[];
    slots: BankSlotDto[];
}

export type ApplyOutcome = { ok: true; version: number } | { ok: false; reason: 'conflict'; version: number } | { ok: false; reason: BankApplyError };

interface Entry {
    inv: Inventory;
    tabs: number[];
    version: number;
    migrated: string[];
    dirtyFile: boolean;
    tabsChanged: boolean;
}

export function bankInvId(): number {
    const id = InvType.getByName(BANK_INV_NAME) ? InvType.getId(BANK_INV_NAME) : -1;
    return id;
}

/**
 * The account-level bank (spec section 7). One Inventory per Firebase uid, shared by every
 * character of that account that is online, persisted as one JSON file per owner.
 *
 * Mutations are never queued: the engine is single-threaded and World.cycle is synchronous, so
 * an HTTP handler on the management port necessarily runs *between* ticks and can never
 * interleave with script execution. That is the same atomicity the spec's "applied on the
 * world tick" asks for, without a queue to drain.
 */
export class OwnerBankStore {
    private readonly entries = new Map<string, Entry>();

    constructor(
        private readonly dir: string,
        private readonly capacity: number = InvType.getByName(BANK_INV_NAME) ? InvType.get(InvType.getId(BANK_INV_NAME)).size : BANK_CAPACITY_FALLBACK
    ) {}

    private fileFor(ownerKey: string): string {
        return path.join(this.dir, `${ownerKey}.json`);
    }

    private assertKey(ownerKey: string): void {
        if (!OWNER_KEY_RE.test(ownerKey)) {
            throw new Error(`bad owner key: ${JSON.stringify(ownerKey)}`);
        }
    }

    private entry(ownerKey: string): Entry {
        this.assertKey(ownerKey);
        const existing = this.entries.get(ownerKey);
        if (existing) {
            return existing;
        }

        const inv = new Inventory(bankInvId(), this.capacity, Inventory.ALWAYS_STACK);
        const entry: Entry = { inv, tabs: [], version: 0, migrated: [], dirtyFile: false, tabsChanged: false };

        const file = this.fileFor(ownerKey);
        if (fs.existsSync(file)) {
            try {
                const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as OwnerBankFile;
                entry.version = Number.isSafeInteger(parsed.version) && parsed.version >= 0 ? parsed.version : 0;
                entry.tabs = Array.isArray(parsed.tabs) ? parsed.tabs.filter(n => Number.isInteger(n) && n > 0) : [];
                entry.migrated = Array.isArray(parsed.migrated) ? parsed.migrated.filter(n => typeof n === 'string') : [];
                for (const slot of Array.isArray(parsed.slots) ? parsed.slots : []) {
                    if (Number.isInteger(slot?.slot) && slot.slot >= 0 && slot.slot < this.capacity && Number.isInteger(slot.obj) && Number.isInteger(slot.count) && slot.count > 0) {
                        inv.set(slot.slot, { id: slot.obj, count: slot.count });
                    }
                }
            } catch (err) {
                // Never take the world down for one unreadable file, and never silently
                // overwrite it either: park it and start empty so the owner can be restored.
                const quarantine = `${file}.corrupt`;
                try { fs.renameSync(file, quarantine); } catch { /* best effort */ }
                console.error(`[idlescape] bank file for ${ownerKey} was unreadable, moved to ${quarantine}:`, err);
            }
        }

        inv.resetTracking();
        this.entries.set(ownerKey, entry);
        return entry;
    }

    get(ownerKey: string): Inventory {
        return this.entry(ownerKey).inv;
    }

    tabs(ownerKey: string): number[] {
        return [...this.entry(ownerKey).tabs];
    }

    setTabs(ownerKey: string, tabs: number[]): void {
        const entry = this.entry(ownerKey);
        const next = tabs.filter(n => Number.isInteger(n) && n > 0).slice(0, 9);
        if (next.length === entry.tabs.length && next.every((n, i) => n === entry.tabs[i])) {
            return;
        }
        entry.tabs = next;
        entry.tabsChanged = true;
    }

    version(ownerKey: string): number {
        return this.entry(ownerKey).version;
    }

    snapshot(ownerKey: string): BankSnapshotDto {
        const entry = this.entry(ownerKey);
        const slots: BankSlotDto[] = [];
        for (let slot = 0; slot < entry.inv.capacity; slot++) {
            const item = entry.inv.get(slot);
            if (item) {
                slots.push({ slot, obj: item.id, count: item.count });
            }
        }
        return { ownerKey, version: entry.version, capacity: entry.inv.capacity, tabs: [...entry.tabs], slots };
    }

    apply(ownerKey: string, expectedVersion: number | null, ops: BankOp[]): ApplyOutcome {
        const entry = this.entry(ownerKey);
        if (expectedVersion !== null && expectedVersion !== entry.version) {
            return { ok: false, reason: 'conflict', version: entry.version };
        }

        const result = applyOps(entry.inv, entry.tabs, ops);
        if (!result.ok) {
            return { ok: false, reason: result.error };
        }

        entry.tabs = result.tabs;
        entry.version += 1;
        entry.dirtyFile = true;
        entry.tabsChanged = false;
        // An external apply may target an owner with nobody online, so it cannot wait for the
        // next tick's flush.
        this.writeEntry(ownerKey, entry);
        return { ok: true, version: entry.version };
    }

    /**
     * One-time merge of a character's .sav bank into the owner store. The first character
     * seen keeps its slot order exactly; later characters are appended (stacking where the
     * container allows, otherwise into the next free slot).
     */
    migrate(ownerKey: string, username: string, objs: BankSlotDto[]): boolean {
        const entry = this.entry(ownerKey);
        if (entry.migrated.includes(username)) {
            return false;
        }
        entry.migrated.push(username);

        for (const obj of objs) {
            if (!Number.isInteger(obj.obj) || !Number.isInteger(obj.count) || obj.count <= 0) continue;
            if (obj.slot >= 0 && obj.slot < entry.inv.capacity && entry.inv.get(obj.slot) === null && entry.inv.getItemIndex(obj.obj) === -1) {
                entry.inv.set(obj.slot, { id: obj.obj, count: obj.count });
            } else {
                entry.inv.add(obj.obj, obj.count);
            }
        }

        entry.dirtyFile = true;
        entry.inv.resetTracking();   // migration is not a change any client needs a diff for
        this.writeEntry(ownerKey, entry);
        return true;
    }

    /**
     * Called once per tick, AFTER client output: every container whose Inventory reports
     * `update` (that is: some RuneScript touched it this tick) gets one version bump and one
     * persistence mark, and the tracking is reset. Upstream's processCleanup only resets
     * `player.invs`, and an owner bank deliberately lives outside those maps, so this is the
     * only thing that resets it -- see PATCHES.md, "Owner bank semantics".
     */
    bumpDirty(): string[] {
        const changed: string[] = [];
        for (const [ownerKey, entry] of this.entries) {
            if (!entry.inv.update && !entry.tabsChanged) continue;
            entry.version += 1;
            entry.dirtyFile = true;
            entry.tabsChanged = false;
            entry.inv.resetTracking();
            changed.push(ownerKey);
        }
        return changed;
    }

    flush(): void {
        for (const [ownerKey, entry] of this.entries) {
            if (entry.dirtyFile) {
                this.writeEntry(ownerKey, entry);
            }
        }
    }

    evict(keep: (ownerKey: string) => boolean): number {
        let dropped = 0;
        for (const [ownerKey, entry] of [...this.entries]) {
            if (keep(ownerKey) || entry.dirtyFile || entry.inv.update) continue;
            this.entries.delete(ownerKey);
            dropped++;
        }
        return dropped;
    }

    loaded(): string[] {
        return [...this.entries.keys()];
    }

    private writeEntry(ownerKey: string, entry: Entry): void {
        const payload: OwnerBankFile = {
            version: entry.version,
            tabs: [...entry.tabs],
            slots: this.snapshotSlots(entry),
            migrated: [...entry.migrated]
        };
        fs.mkdirSync(this.dir, { recursive: true });
        const target = this.fileFor(ownerKey);
        const tmp = `${target}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
        fs.renameSync(tmp, target);       // atomic replace: a crash never leaves a half file
        entry.dirtyFile = false;
    }

    private snapshotSlots(entry: Entry): BankSlotDto[] {
        const slots: BankSlotDto[] = [];
        for (let slot = 0; slot < entry.inv.capacity; slot++) {
            const item = entry.inv.get(slot);
            if (item) slots.push({ slot, obj: item.id, count: item.count });
        }
        return slots;
    }
}
```

Note: `lastUsedSlot` is imported for use by `management.ts` in Task 10; if the linter flags it
as unused here, drop the import from this file and import it there instead.

- [ ] **Step 4: Run until green**

Run: `pwsh scripts/engine-overlay.ps1 && cd engine/server && npx tsc --noEmit && npx tsx --test src/idlescape/*.test.ts`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add engine-custom
git commit -m "feat(engine-overlay): owner bank store with versions, atomic persistence and .sav migration"
```

---
### Task 9: Route inventory 95 to the owner store — the runtime patches

**Files:**
- Modify: `engine-custom/src/idlescape/install.ts`, `engine-custom/src/engine/entity/PlayerLoading.ts` (hunks 2 and 3), `engine-custom/manifest.json`, `engine-custom/PATCHES.md`
- Create: `engine-custom/src/idlescape/tabVarps.ts`, `engine-custom/src/idlescape/install.test.ts`, `content-custom/scripts/interface_bank/configs/banktab.varp`

**Interfaces:**
- Consumes: `Player` (`#/engine/entity/Player.js`), `World` (`#/engine/World.js`), `VarPlayerType` (`#/cache/config/VarPlayerType.js`), `OwnerBankStore`, `getOwnerKey`.
- Produces:
  ```ts
  // engine-custom/src/idlescape/install.ts
  export function installIdlescape(): void;
  export function ownerBanks(): OwnerBankStore;              // the singleton the routes use
  export function afterCycle(): void;                        // exported for the test
  export function notifyBankChanged(ownerKey: string, version: number): void;
  ```
  ```ts
  // engine-custom/src/idlescape/tabVarps.ts
  export const TAB_VARP_NAMES: readonly string[];            // banktab_size_1 .. banktab_size_9
  export function readTabVarps(player: Player): number[];    // trailing zeroes trimmed
  export function writeTabVarps(player: Player, tabs: number[]): void;
  ```

**Rulings this task records:**

1. **`Player.prototype.getInventory` is patched at runtime, not replaced.** Upstream's method
   is 24 lines inside a 2 304-line file; a whole-file replacement would carry 2 280 lines of
   upstream code we do not change and would rot invisibly on a revision bump. The patch is
   recorded in `manifest.json`'s `anchors` so `-Check` fails when `Player.ts` moves.
2. **`Player.save()` needs no patch at all.** It iterates `this.invs` (`Player.ts:229-231`);
   an owner-stamped player never has 95 in that map because `getInventory` returns the store's
   container without inserting it. Verified by test.
3. **`World.cycle` is wrapped, not replaced.** It reschedules itself with
   `setTimeout(this.cycle.bind(this), ...)`, so an own-property override on the singleton is
   picked up from the very next tick, provided `install.ts` runs before `World.start()` —
   which is why the replaced `app.ts` imports it first.
4. **Cross-character updates are live, not stale.** The spec (section 7) accepts one
   character's bank interface going stale while another banks. It does not have to: upstream
   resets inv tracking only for `player.invs` (`World.processCleanup`, `World.ts:1147-1159`),
   and the owner container is deliberately outside those maps, so the overlay owns the reset —
   done in the post-cycle hook, *after* `processClientsOut` has run for every player. Both
   online characters therefore receive the same `UpdateInvPartial` in the same tick. The spec's
   accepted staleness is recorded as no longer applicable; SP8b can rely on live updates.
5. **Tab varps.** Nine `scope=perm` varps `banktab_size_1..9` are seeded from the store at
   login and read back once per tick for owner-stamped players; a difference updates the store
   (which the next `bumpDirty` turns into a version bump and a change-hook post).

- [ ] **Step 1: Write the failing test**

```ts
// engine-custom/src/idlescape/install.test.ts
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';
import VarPlayerType from '#/cache/config/VarPlayerType.js';
import Player from '#/engine/entity/Player.js';
import Packet from '#/io/Packet.js';
import { toBase37 } from '#/util/JString.js';

import { installIdlescape, ownerBanks } from './install.js';
import { setOwnerKey } from './owner.js';
import { readTabVarps, writeTabVarps } from './tabVarps.js';

function makePlayer(name: string): Player {
    const name37 = toBase37(name);
    return new Player(name, name37, name37);
}

before(() => {
    InvType.load('data/pack');
    ObjType.load('data/pack');
    VarPlayerType.load('data/pack');
    installIdlescape();
});

beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idlescape-install-'));
    process.env.IDLESCAPE_BANK_DIR = dir;   // read by install.ts on first ownerBanks() call
});

test('an owner-stamped player resolves inv 95 to the shared container', () => {
    const alice = makePlayer('alice');
    const bob = makePlayer('bob');
    setOwnerKey(alice, 'uidShared');
    setOwnerKey(bob, 'uidShared');

    const aliceBank = alice.getInventory(95);
    assert.ok(aliceBank);
    assert.equal(aliceBank, bob.getInventory(95), 'two characters of one owner share one Inventory');
    assert.equal(aliceBank, ownerBanks().get('uidShared'));
});

test('a player with no owner key keeps the upstream per-player bank', () => {
    const solo = makePlayer('solo');
    const bank = solo.getInventory(95);
    assert.ok(bank);
    assert.notEqual(bank, ownerBanks().get('uidShared'));
    assert.equal(solo.invs.get(95), bank, 'unstamped players still populate player.invs');
});

test('every other inventory is untouched by the patch', () => {
    const alice = makePlayer('alice2');
    setOwnerKey(alice, 'uidOther');
    const inv = alice.getInventory(93);
    assert.ok(inv);
    assert.equal(alice.invs.get(93), inv);
    assert.equal(alice.getInventory(-1), null);
});

test('the owner bank never lands in player.invs, so Player.save() cannot write it', () => {
    const alice = makePlayer('alice3');
    setOwnerKey(alice, 'uidSave');
    alice.getInventory(95)!.add(995, 1000);
    alice.getInventory(93)!.add(995, 7);
    assert.equal(alice.invs.has(95), false);

    // Decode the sav's inventory section and assert type 95 is absent.
    const sav = new Packet(alice.save().data);
    const types = decodeSavInvTypes(sav);
    assert.deepEqual(types.includes(95), false);
    assert.deepEqual(types.includes(93), true);
});

test('tab varps round-trip through the player and trim trailing zeroes', () => {
    const alice = makePlayer('alice4');
    writeTabVarps(alice, [3, 2]);
    assert.deepEqual(readTabVarps(alice), [3, 2]);
    writeTabVarps(alice, []);
    assert.deepEqual(readTabVarps(alice), []);
});

// Mirrors Player.save()'s layout (Player.ts:190-262) closely enough to find the inv section.
function decodeSavInvTypes(sav: Packet): number[] {
    sav.pos = 0;
    sav.g2(); sav.g2();                        // magic, version
    sav.g2(); sav.g2(); sav.g1();              // x, z, level
    for (let i = 0; i < 7; i++) sav.g1();      // body
    for (let i = 0; i < 5; i++) sav.g1();      // colors
    sav.g1(); sav.g2(); sav.g4();              // gender, runenergy, playtime
    for (let i = 0; i < 21; i++) { sav.g4(); sav.g1(); }
    const varps = sav.g2();
    for (let i = 0; i < varps; i++) { sav.g2(); sav.gVarInt(); }
    const invCount = sav.g1();
    const types: number[] = [];
    for (let i = 0; i < invCount; i++) {
        const type = sav.g2();
        const size = sav.g2();
        types.push(type);
        for (let slot = 0; slot < size; slot++) {
            const id = sav.g2() - 1;
            if (id === -1) continue;
            const count = sav.g1();
            if (count === 255) sav.g4();
        }
    }
    return types;
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pwsh scripts/engine-overlay.ps1 && cd engine/server && npx tsx --test src/idlescape/install.test.ts`
Expected: FAIL — `ownerBanks` is not exported, and `getInventory(95)` returns a per-player container.

If `decodeSavInvTypes` mis-parses (the layout is version-dependent), simplify the assertion to
`assert.equal(alice.invs.has(95), false)` plus `assert.ok(alice.save().data.length > 0)` and note
the reason in the task report — the `invs` map is the load-bearing fact.

- [ ] **Step 3: Write `tabVarps.ts`**

```ts
// engine-custom/src/idlescape/tabVarps.ts
import VarPlayerType from '#/cache/config/VarPlayerType.js';
import type Player from '#/engine/entity/Player.js';

import { MAX_TABS } from './types.js';

/**
 * Nine scope=perm varps mirroring the owner store's tab sizes, so the in-game bank interface
 * (SP8b's content overlay) and the web bank agree. Defined in
 * content-custom/scripts/interface_bank/configs/banktab.varp.
 */
export const TAB_VARP_NAMES: readonly string[] = Array.from({ length: MAX_TABS }, (_, i) => `banktab_size_${i + 1}`);

let ids: number[] | null = null;

function varpIds(): number[] {
    if (ids) {
        return ids;
    }
    ids = TAB_VARP_NAMES.map(name => {
        const id = VarPlayerType.getId(name);
        if (id === -1) {
            console.warn(`[idlescape] varp ${name} is missing; bank tabs will not reach the game client`);
        }
        return id;
    });
    return ids;
}

export function readTabVarps(player: Player): number[] {
    const sizes = varpIds().map(id => (id === -1 ? 0 : Math.max(0, player.getVar(id) as number)));
    while (sizes.length > 0 && sizes[sizes.length - 1] === 0) {
        sizes.pop();
    }
    return sizes;
}

export function writeTabVarps(player: Player, tabs: number[]): void {
    const list = varpIds();
    for (let i = 0; i < list.length; i++) {
        if (list[i] === -1) continue;
        player.setVar(list[i], tabs[i] ?? 0);
    }
}
```

`content-custom/scripts/interface_bank/configs/banktab.varp` (nine entries, following the
existing `.varp` syntax in `engine/content/scripts/**/configs/*.varp` — read one first to copy
the exact key names):

```
[banktab_size_1]
scope=perm
protect=no

[banktab_size_2]
scope=perm
protect=no

[banktab_size_3]
scope=perm
protect=no

[banktab_size_4]
scope=perm
protect=no

[banktab_size_5]
scope=perm
protect=no

[banktab_size_6]
scope=perm
protect=no

[banktab_size_7]
scope=perm
protect=no

[banktab_size_8]
scope=perm
protect=no

[banktab_size_9]
scope=perm
protect=no
```

Add its path to `content-custom/manifest.json` with `"baseSha256": null` (a new file, no
upstream base). The engine repacks the cache on startup, so no manual pack step is needed.

- [ ] **Step 4: Fill in `install.ts`**

```ts
// engine-custom/src/idlescape/install.ts
import InvType from '#/cache/config/InvType.js';
import Player from '#/engine/entity/Player.js';
import type { Inventory } from '#/engine/Inventory.js';
import World from '#/engine/World.js';
import { printInfo } from '#/util/Logger.js';

import { idlescapeConfig } from './config.js';
import { getOwnerKey } from './owner.js';
import { OwnerBankStore } from './ownerBank.js';
import { readTabVarps, writeTabVarps } from './tabVarps.js';
import { BANK_INV_NAME } from './types.js';

let installed = false;
let store: OwnerBankStore | null = null;
let bankInv = -1;

/** The one owner bank store; created lazily so the packed cache is loaded before it reads sizes. */
export function ownerBanks(): OwnerBankStore {
    if (!store) {
        store = new OwnerBankStore(process.env.IDLESCAPE_BANK_DIR ?? idlescapeConfig.bankDir);
    }
    return store;
}

function bankInvId(): number {
    if (bankInv === -1) {
        bankInv = InvType.getByName(BANK_INV_NAME) ? InvType.getId(BANK_INV_NAME) : -1;
    }
    return bankInv;
}

/** Posts the change hook the front server listens on; failures are logged, never fatal. */
export function notifyBankChanged(ownerKey: string, version: number): void {
    const url = idlescapeConfig.hookUrl;
    if (!url) {
        return;
    }
    void fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-idlescape-mgmt': idlescapeConfig.ownerSecret },
        body: JSON.stringify({ ownerKey, version }),
        signal: AbortSignal.timeout(2000)
    }).catch(err => console.warn(`[idlescape] bank change hook failed for ${ownerKey}:`, err));
}

/**
 * Runs after every World.cycle, i.e. after processClientsOut has written each player's
 * inv_transmit diff and after processCleanup has reset the per-player containers. The owner
 * bank is deliberately not in player.invs, so this is the only place its dirty tracking is
 * reset -- and because it happens after client output, every online character of the owner
 * received the same diff first.
 */
export function afterCycle(): void {
    const banks = ownerBanks();

    // Mirror the in-game tab varps into the store before the sweep, so a tab change made by
    // RuneScript is picked up by the same version bump as the item movement that caused it.
    for (const player of World.playerLoop.all()) {
        const ownerKey = getOwnerKey(player);
        if (ownerKey) {
            banks.setTabs(ownerKey, readTabVarps(player));
        }
    }

    for (const ownerKey of banks.bumpDirty()) {
        notifyBankChanged(ownerKey, banks.version(ownerKey));
        // Push the (possibly store-side) tab layout back out to every online character.
        for (const player of World.playerLoop.all()) {
            if (getOwnerKey(player) === ownerKey) {
                writeTabVarps(player, banks.tabs(ownerKey));
            }
        }
    }

    if (World.currentTick % 100 === 0) {
        banks.flush();
    }

    if (World.currentTick % 1500 === 0) {
        const online = new Set<string>();
        for (const player of World.playerLoop.all()) {
            const ownerKey = getOwnerKey(player);
            if (ownerKey) online.add(ownerKey);
        }
        banks.evict(key => online.has(key));
    }
}

export function installIdlescape(): void {
    if (installed) {
        return;
    }
    installed = true;

    // --- Patch 1: route inventory 95 to the owner store -----------------------
    // Upstream Player.getInventory (Player.ts:1467-1490) branches on InvType scope; this adds
    // one branch in front of it. Returning the store's container WITHOUT putting it in
    // this.invs is what keeps Player.save() (which iterates this.invs) from writing the bank
    // back into the .sav.
    const originalGetInventory = Player.prototype.getInventory;
    Player.prototype.getInventory = function (this: Player, inv: number): Inventory | null {
        const ownerKey = getOwnerKey(this);
        if (ownerKey !== null && inv !== -1 && inv === bankInvId()) {
            return ownerBanks().get(ownerKey);
        }
        return originalGetInventory.call(this, inv);
    };

    // --- Patch 2: wrap the world tick ----------------------------------------
    // cycle() reschedules itself with setTimeout(this.cycle.bind(this), ...), so an own
    // property on the singleton takes effect from the next tick. Installed before
    // World.start() by the replaced src/app.ts.
    const originalCycle = World.cycle.bind(World);
    World.cycle = (): void => {
        originalCycle();
        try {
            afterCycle();
        } catch (err) {
            console.error('[idlescape] afterCycle failed:', err);
        }
    };

    printInfo(`[idlescape] overlay active (requireOwner=${idlescapeConfig.requireOwner}, banks=${idlescapeConfig.bankDir})`);
}

installIdlescape();
```

- [ ] **Step 5: `PlayerLoading.ts` hunks 2 and 3**

Hunk 2 — anchor: the inventory-loading loop, the block reading
`if (invType.scope === InvType.SCOPE_PERM) { const inv = player.getInventory(type); ... }`.
Replace with:

```ts
            if (invType.scope === InvType.SCOPE_PERM) {
                // idlescape: an owner-stamped player's bank lives in the account store, not in
                // this .sav. Hand the decoded slots to the one-time migration instead of
                // writing them into the shared container on every login.
                if (ownerKey !== null && type === InvType.getId('bank')) {
                    pendingBank = objs.map(o => ({ slot: o.slot, obj: o.id, count: o.count }));
                    continue;
                }

                const inv = player.getInventory(type);
                if (inv) {
                    for (const obj of objs) {
                        inv.set(obj.slot, { id: obj.id, count: obj.count });
                    }
                }
            }
```

with `let pendingBank: BankSlotDto[] = [];` declared next to the `const player = ...` line in
hunk 1 and `const ownerKey = owner ? owner.uid : null;` right after `setOwnerKey`.

Hunk 3 — anchor: the tail of `load`, the two lines
`player.combatLevel = player.getCombatLevel(); return player;`. Replace with:

```ts
        // idlescape: fold this character's old .sav bank into the account store (once per
        // character, ever), then seed the in-game tab varps from the store so the bank
        // interface and the web bank agree from the first tick.
        if (ownerKey !== null) {
            const banks = ownerBanks();
            if (pendingBank.length > 0) {
                banks.migrate(ownerKey, safeName, pendingBank);
            }
            writeTabVarps(player, banks.tabs(ownerKey));
        }

        player.combatLevel = player.getCombatLevel();

        return player;
```

with the imports:

```ts
import { ownerBanks } from '#/idlescape/install.js';
import { writeTabVarps } from '#/idlescape/tabVarps.js';
import type { BankSlotDto } from '#/idlescape/types.js';
```

- [ ] **Step 6: Record the patches**

`engine-custom/manifest.json` — add the new `src/idlescape` files; add anchors:

```json
{ "path": "src/engine/entity/Player.ts", "sha256": "<hex>", "why": "getInventory is wrapped at runtime by src/idlescape/install.ts; save() must keep iterating this.invs" },
{ "path": "src/engine/Inventory.ts", "sha256": "<hex>", "why": "applyOps and the store rely on set()/markDirty()/resetTracking() semantics" }
```

`engine-custom/PATCHES.md` — a new "Runtime patches" section covering the two patches and the
five rulings above, plus:

```sh
grep -c "Player.prototype.getInventory = function"  src/idlescape/install.ts                     # 1
grep -c "World.cycle = ()"                          src/idlescape/install.ts                     # 1
grep -c "banks.migrate(ownerKey, safeName, pendingBank)" src/engine/entity/PlayerLoading.ts      # 1
grep -c "getInventory(inv: number): Inventory | null {"  src/engine/entity/Player.ts             # 1  (anchor still present)
grep -c "for (const inv of player.invs.values())"        src/engine/World.ts                     # 1  (anchor still present)
```

- [ ] **Step 7: Run everything**

Run:
```sh
pwsh scripts/engine-overlay.ps1 && pwsh scripts/content-overlay.ps1
cd engine/server && npx tsc --noEmit && npx tsx --test src/idlescape/*.test.ts
```
Expected: pass. Then start the stack once (`scripts/start-stack.ps1`) and confirm
`[idlescape] overlay active` appears in `logs/engine.log` before `World ready`.

- [ ] **Step 8: Commit**

```bash
git add engine-custom content-custom
git commit -m "feat(engine-overlay): route inventory 95 to the owner bank, migrate .sav banks, mirror tab varps"
```

---
### Task 10: Engine management routes — `GET /owner/:key/bank`, `POST /owner/:key/bank/apply`

**Files:**
- Create: `engine-custom/src/idlescape/management.ts`, `engine-custom/src/idlescape/management.test.ts`
- Modify: `engine-custom/src/web.ts` (hunks 2 and 3), `engine-custom/manifest.json`, `engine-custom/PATCHES.md`

**Interfaces:**
- Consumes: `FastifyInstance` from `fastify`; `ownerBanks`, `notifyBankChanged` from `./install`; `normaliseOp`; `OWNER_KEY_RE`.
- Produces:
  ```ts
  // engine-custom/src/idlescape/management.ts
  export function registerOwnerBankRoutes(app: FastifyInstance): void;
  export function authorised(header: string | string[] | undefined, secret: string): boolean;
  export interface ApplyBody { expectedVersion?: number | null; ops?: unknown[] }
  export function parseApplyBody(body: unknown): { ok: true; expectedVersion: number | null; ops: BankOp[] } | { ok: false; error: string };
  ```

**Contract (record in PATCHES.md):**

| Route | Body | 200 | Errors |
|---|---|---|---|
| `GET /owner/:key/bank` | – | `{ ownerKey, version, capacity, tabs, slots }` | 400 `bad_key`, 401 `unauthorised` |
| `POST /owner/:key/bank/apply` | `{ expectedVersion, ops }` | `{ ownerKey, version }` | 400 `bad_key` / `bad_ops`, 401 `unauthorised`, 409 `{ error: 'version', version }`, 422 `{ error: <BankApplyError> }` |

`expectedVersion` may be `null` to force. Both bind to `127.0.0.1` with the rest of the
management app and require `x-idlescape-mgmt` to equal the shared secret; when the secret is
empty the routes are **not registered at all**, so a misconfigured world exposes nothing.

- [ ] **Step 1: Write the failing test**

```ts
// engine-custom/src/idlescape/management.test.ts
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Fastify from 'fastify';
import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';

import { authorised, parseApplyBody, registerOwnerBankRoutes } from './management.js';
import { ownerBanks } from './install.js';

before(() => {
    InvType.load('data/pack');
    ObjType.load('data/pack');
});

beforeEach(() => {
    process.env.IDLESCAPE_BANK_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'idlescape-mgmt-'));
    process.env.OWNER_ASSERTION_SECRET = 's'.repeat(32);
});

function app() {
    const f = Fastify();
    registerOwnerBankRoutes(f);
    return f;
}

const AUTH = { 'x-idlescape-mgmt': 's'.repeat(32) };

test('authorised is a constant-time exact match and refuses an empty secret', () => {
    assert.equal(authorised('abc', 'abc'), true);
    assert.equal(authorised('abcd', 'abc'), false);
    assert.equal(authorised(undefined, 'abc'), false);
    assert.equal(authorised(['abc'], 'abc'), false);
    assert.equal(authorised('', ''), false);
});

test('parseApplyBody normalises ops and rejects junk', () => {
    assert.deepEqual(parseApplyBody({ expectedVersion: 3, ops: [{ obj: 995, delta: -5 }] }),
        { ok: true, expectedVersion: 3, ops: [{ op: 'delta', obj: 995, count: -5 }] });
    assert.deepEqual(parseApplyBody({ ops: [] }), { ok: true, expectedVersion: null, ops: [] });
    assert.equal(parseApplyBody({ ops: [{ op: 'nope' }] }).ok, false);
    assert.equal(parseApplyBody({ ops: 'x' }).ok, false);
    assert.equal(parseApplyBody(null).ok, false);
    assert.equal(parseApplyBody({ ops: new Array(201).fill({ op: 'swap', a: 0, b: 1 }) }).ok, false);
});

test('GET returns an empty bank for an owner that has never banked', async () => {
    const res = await app().inject({ method: 'GET', url: '/owner/uidA/bank', headers: AUTH });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { ownerKey: 'uidA', version: 0, capacity: 240, tabs: [], slots: [] });
});

test('both routes refuse a missing or wrong management header', async () => {
    const f = app();
    assert.equal((await f.inject({ method: 'GET', url: '/owner/uidA/bank' })).statusCode, 401);
    assert.equal((await f.inject({ method: 'POST', url: '/owner/uidA/bank/apply', payload: { ops: [] }, headers: { 'x-idlescape-mgmt': 'nope' } })).statusCode, 401);
});

test('a traversal-shaped owner key is refused before it reaches the filesystem', async () => {
    const res = await app().inject({ method: 'GET', url: '/owner/..%2Fescape/bank', headers: AUTH });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: 'bad_key' });
});

test('apply moves items for an offline owner and returns the new version', async () => {
    const f = app();
    const res = await f.inject({ method: 'POST', url: '/owner/uidOffline/bank/apply', headers: AUTH, payload: { expectedVersion: 0, ops: [{ obj: 995, delta: 250 }] } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { ownerKey: 'uidOffline', version: 1 });

    const read = await f.inject({ method: 'GET', url: '/owner/uidOffline/bank', headers: AUTH });
    assert.deepEqual(read.json().slots, [{ slot: 0, obj: 995, count: 250 }]);
    assert.equal(fs.existsSync(path.join(process.env.IDLESCAPE_BANK_DIR!, 'uidOffline.json')), true);
});

test('a stale expectedVersion gets 409 with the current version and changes nothing', async () => {
    const f = app();
    await f.inject({ method: 'POST', url: '/owner/uidC/bank/apply', headers: AUTH, payload: { expectedVersion: 0, ops: [{ obj: 995, delta: 10 }] } });
    const res = await f.inject({ method: 'POST', url: '/owner/uidC/bank/apply', headers: AUTH, payload: { expectedVersion: 0, ops: [{ obj: 995, delta: 10 }] } });
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.json(), { error: 'version', version: 1 });
    assert.equal(ownerBanks().get('uidC').getItemCount(995), 10);
});

test('an unsatisfiable op gets 422 and leaves the version alone', async () => {
    const f = app();
    await f.inject({ method: 'POST', url: '/owner/uidD/bank/apply', headers: AUTH, payload: { ops: [{ obj: 995, delta: 10 }] } });
    const res = await f.inject({ method: 'POST', url: '/owner/uidD/bank/apply', headers: AUTH, payload: { expectedVersion: 1, ops: [{ obj: 995, delta: -11 }] } });
    assert.equal(res.statusCode, 422);
    assert.deepEqual(res.json(), { error: 'insufficient' });
    assert.equal(ownerBanks().version('uidD'), 1);
});

test('layout ops apply and are reflected in tabs', async () => {
    const f = app();
    await f.inject({ method: 'POST', url: '/owner/uidE/bank/apply', headers: AUTH, payload: { ops: [{ obj: 995, delta: 1 }, { obj: 1038, delta: 1 }] } });
    const res = await f.inject({ method: 'POST', url: '/owner/uidE/bank/apply', headers: AUTH, payload: { expectedVersion: 1, ops: [{ op: 'setTabs', sizes: [1] }] } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual((await f.inject({ method: 'GET', url: '/owner/uidE/bank', headers: AUTH })).json().tabs, [1]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pwsh scripts/engine-overlay.ps1 && cd engine/server && npx tsx --test src/idlescape/management.test.ts`
Expected: FAIL — cannot resolve `./management.js`.

- [ ] **Step 3: Write the routes**

```ts
// engine-custom/src/idlescape/management.ts
import { timingSafeEqual } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import { idlescapeConfig } from './config.js';
import { ownerBanks } from './install.js';
import { normaliseOp } from './ops.js';
import { OWNER_KEY_RE } from './ownerBank.js';
import type { BankOp } from './types.js';

const MAX_OPS = 200;

export function authorised(header: string | string[] | undefined, secret: string): boolean {
    if (secret.length === 0 || typeof header !== 'string' || header.length !== secret.length) {
        return false;
    }
    return timingSafeEqual(Buffer.from(header), Buffer.from(secret));
}

export function parseApplyBody(body: unknown): { ok: true; expectedVersion: number | null; ops: BankOp[] } | { ok: false; error: string } {
    if (typeof body !== 'object' || body === null) {
        return { ok: false, error: 'bad_ops' };
    }
    const b = body as { expectedVersion?: unknown; ops?: unknown };

    let expectedVersion: number | null = null;
    if (b.expectedVersion !== undefined && b.expectedVersion !== null) {
        if (!Number.isSafeInteger(b.expectedVersion) || (b.expectedVersion as number) < 0) {
            return { ok: false, error: 'bad_ops' };
        }
        expectedVersion = b.expectedVersion as number;
    }

    if (!Array.isArray(b.ops) || b.ops.length > MAX_OPS) {
        return { ok: false, error: 'bad_ops' };
    }

    const ops: BankOp[] = [];
    for (const raw of b.ops) {
        const op = normaliseOp(raw);
        if (!op) {
            return { ok: false, error: 'bad_ops' };
        }
        ops.push(op);
    }
    return { ok: true, expectedVersion, ops };
}

/**
 * The seam the front server owns the economy through (spec section 7). Registered on the
 * management app, which binds to 127.0.0.1 -- these routes can move any item in any account's
 * bank, so they are never reachable from the internet, and they additionally require the
 * shared secret. With no secret configured they are not registered at all.
 */
export function registerOwnerBankRoutes(app: FastifyInstance): void {
    const secret = idlescapeConfig.ownerSecret;
    if (secret.length === 0) {
        console.warn('[idlescape] no OWNER_ASSERTION_SECRET: owner bank management routes are disabled');
        return;
    }

    app.get<{ Params: { key: string } }>('/owner/:key/bank', async (req, reply) => {
        if (!authorised(req.headers['x-idlescape-mgmt'], secret)) {
            return reply.status(401).send({ error: 'unauthorised' });
        }
        if (!OWNER_KEY_RE.test(req.params.key)) {
            return reply.status(400).send({ error: 'bad_key' });
        }
        return ownerBanks().snapshot(req.params.key);
    });

    app.post<{ Params: { key: string }; Body: unknown }>('/owner/:key/bank/apply', async (req, reply) => {
        if (!authorised(req.headers['x-idlescape-mgmt'], secret)) {
            return reply.status(401).send({ error: 'unauthorised' });
        }
        const { key } = req.params;
        if (!OWNER_KEY_RE.test(key)) {
            return reply.status(400).send({ error: 'bad_key' });
        }

        const parsed = parseApplyBody(req.body);
        if (!parsed.ok) {
            return reply.status(400).send({ error: parsed.error });
        }

        // No queue: the engine is single-threaded and World.cycle is synchronous, so this
        // handler necessarily runs between ticks. That is the atomicity the spec's "applied on
        // the world tick" is asking for.
        const outcome = ownerBanks().apply(key, parsed.expectedVersion, parsed.ops);
        if (outcome.ok) {
            return { ownerKey: key, version: outcome.version };
        }
        if (outcome.reason === 'conflict') {
            return reply.status(409).send({ error: 'version', version: outcome.version });
        }
        return reply.status(422).send({ error: outcome.reason });
    });
}
```

**Note on the change hook for external applies:** `OwnerBankStore.apply` bumps the version
itself and does not go through `bumpDirty`, so the post-cycle sweep would not post the hook for
a web-driven change. Add the notification at the end of the successful branch above:

```ts
        if (outcome.ok) {
            notifyBankChanged(key, outcome.version);
            return { ownerKey: key, version: outcome.version };
        }
```
(with `notifyBankChanged` imported from `./install.js`). The in-game path is covered by
`afterCycle`, this covers the web path, and the two cannot double-post because `apply` resets
the container's tracking as part of writing.

If `applyOps`'s writes leave `inv.update` true after an external apply (they do — every write
goes through `Inventory.set`), the next `bumpDirty` would bump a second time for the same
change. Prevent that in `OwnerBankStore.apply` by calling `entry.inv.resetTracking()` after
`writeEntry` — **but only after** the current tick's `processClientsOut` has run. Since `apply`
runs between ticks, the diff has not been sent yet; so instead leave tracking alone and have
`bumpDirty` skip an entry whose `version` already changed this tick. Implement with a
`bumpedAtTick` field on `Entry`:

```ts
        // in apply(), after writeEntry:
        entry.bumpedAtTick = World.currentTick;
        // in bumpDirty(), first line of the loop body:
        if (entry.bumpedAtTick === World.currentTick) { entry.inv.resetTracking(); entry.tabsChanged = false; continue; }
```
Add the matching assertion to `ownerBank.test.ts`:

```ts
test('an external apply is not double-counted by the next tick sweep', () => {
    const store = new OwnerBankStore(dir);
    assert.deepEqual(store.apply('uidX', null, [{ op: 'delta', obj: 995, count: 5 }]), { ok: true, version: 1 });
    assert.deepEqual(store.bumpDirty(), []);
    assert.equal(store.version('uidX'), 1);
});
```
(`World.currentTick` does not advance inside a test, which is exactly the condition being
asserted; the live path advances between an apply and the next sweep only when a tick has
actually run, which is the case the guard is written for.)

- [ ] **Step 4: `web.ts` hunks 2 and 3**

Hunk 2 — anchor: the management route block, immediately after
`management.get('/setup/config', ...)`'s closing `});` and before `management.put('/setup/config'`
— or simply directly above `export async function startManagementWeb()`:

```ts
// idlescape: the owner-keyed shared bank seam (spec section 7). Loopback + shared secret.
registerOwnerBankRoutes(management);
```

Hunk 3 — anchor: `startManagementWeb`'s `management.listen({ port: ..., host: '0.0.0.0' })`:

```ts
export async function startManagementWeb() {
    // idlescape: the management port now carries routes that can move any account's items.
    // README has always said "never expose it publicly"; this makes that true by default.
    await management.listen({ port: Environment.web.managementPort, host: idlescapeConfig.managementHost });
}
```

plus the imports:

```ts
import { idlescapeConfig } from '#/idlescape/config.js';
import { registerOwnerBankRoutes } from '#/idlescape/management.js';
```

- [ ] **Step 5: Record the patch**

`engine-custom/PATCHES.md` — add the route contract table above under a "Management routes"
heading, note the `0.0.0.0` → `idlescapeConfig.managementHost` change as a deploy-visible
behaviour change, and:

```sh
grep -c "registerOwnerBankRoutes(management);"                     src/web.ts   # 1
grep -c "host: idlescapeConfig.managementHost"                     src/web.ts   # 1
grep -c "host: '0.0.0.0'"                                          src/web.ts   # 1  (the game web server, unchanged)
```

- [ ] **Step 6: Run everything**

Run: `pwsh scripts/engine-overlay.ps1 && cd engine/server && npx tsc --noEmit && npx tsx --test src/idlescape/*.test.ts`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add engine-custom
git commit -m "feat(engine-overlay): loopback owner-bank management routes with versions and 409 conflicts"
```

---

### Task 11: Front server — management client, bank routes and the change hook

**Files:**
- Create: `server/src/engine/managementClient.ts`, `server/src/engine/managementClient.test.ts`, `server/src/bank/routes.ts`, `server/src/bank/routes.test.ts`
- Modify: `server/src/router.ts`, `server/src/router.test.ts`, `server/src/index.ts`, `server/src/types.ts`

**Interfaces:**
- Consumes: `Env`, `Principal`, `Route`.
- Produces:
  ```ts
  // server/src/types.ts
  export interface BankSlot { slot: number; obj: number; count: number }
  export interface BankSnapshot { ownerKey: string; version: number; capacity: number; tabs: number[]; slots: BankSlot[] }
  export type BankOp =
    | { op: 'delta'; obj: number; count: number }
    | { op: 'swap'; a: number; b: number }
    | { op: 'insert'; from: number; to: number }
    | { op: 'moveToTab'; slot: number; tab: number }
    | { op: 'setTabs'; sizes: number[] }
    | { op: 'sort'; tab: number; by: 'value' | 'name' | 'id' };
  export const BANK_LAYOUT_OPS = ['swap', 'insert', 'moveToTab', 'setTabs', 'sort'] as const;
  ```
  ```ts
  // server/src/engine/managementClient.ts
  export type ApplyResult =
    | { ok: true; version: number }
    | { ok: false; kind: 'conflict'; version: number }
    | { ok: false; kind: 'rejected'; error: string }
    | { ok: false; kind: 'unavailable' };
  export interface ManagementClient {
    getBank(ownerKey: string): Promise<BankSnapshot | null>;
    applyBank(ownerKey: string, expectedVersion: number | null, ops: BankOp[]): Promise<ApplyResult>;
  }
  export function createManagementClient(opts: { baseUrl: string; secret: string; fetchImpl?: typeof fetch }): ManagementClient;
  ```
  ```ts
  // server/src/bank/routes.ts
  export interface BankRoutes {
    handle(req: Request, route: Route & { kind: 'bank' }, principal: Principal): Promise<Response>;
    handleHook(req: Request, ip: string): Promise<Response>;
    versionOf(ownerKey: string): number | null;      // last version the engine reported
  }
  export function createBankRoutes(deps: { client: ManagementClient; secret: string }): BankRoutes;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// server/src/engine/managementClient.test.ts
import { describe, expect, test } from 'bun:test';
import { createManagementClient } from './managementClient';

function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) => Promise.resolve(handler(String(input), init))) as unknown as typeof fetch;
}

describe('engine management client', () => {
  test('getBank sends the secret header and returns the snapshot', async () => {
    let seen = '';
    const client = createManagementClient({
      baseUrl: 'http://127.0.0.1:8897', secret: 'sec',
      fetchImpl: fakeFetch((url, init) => {
        expect(url).toBe('http://127.0.0.1:8897/owner/uidA/bank');
        seen = new Headers(init?.headers).get('x-idlescape-mgmt') ?? '';
        return Response.json({ ownerKey: 'uidA', version: 3, capacity: 240, tabs: [2], slots: [{ slot: 0, obj: 995, count: 5 }] });
      })
    });
    expect(await client.getBank('uidA')).toEqual({ ownerKey: 'uidA', version: 3, capacity: 240, tabs: [2], slots: [{ slot: 0, obj: 995, count: 5 }] });
    expect(seen).toBe('sec');
  });

  test('getBank returns null when the engine is unreachable or answers badly', async () => {
    const down = createManagementClient({ baseUrl: 'http://x', secret: 's', fetchImpl: fakeFetch(() => { throw new Error('ECONNREFUSED'); }) });
    expect(await down.getBank('uidA')).toBeNull();
    const bad = createManagementClient({ baseUrl: 'http://x', secret: 's', fetchImpl: fakeFetch(() => new Response('nope', { status: 500 })) });
    expect(await bad.getBank('uidA')).toBeNull();
  });

  test('applyBank maps 200, 409, 422 and transport failure onto the result union', async () => {
    const mk = (res: () => Response) => createManagementClient({ baseUrl: 'http://x', secret: 's', fetchImpl: fakeFetch(res) });
    expect(await mk(() => Response.json({ ownerKey: 'u', version: 4 })).applyBank('u', 3, [])).toEqual({ ok: true, version: 4 });
    expect(await mk(() => Response.json({ error: 'version', version: 9 }, { status: 409 })).applyBank('u', 3, [])).toEqual({ ok: false, kind: 'conflict', version: 9 });
    expect(await mk(() => Response.json({ error: 'insufficient' }, { status: 422 })).applyBank('u', 3, [])).toEqual({ ok: false, kind: 'rejected', error: 'insufficient' });
    expect(await mk(() => { throw new Error('down'); }).applyBank('u', 3, [])).toEqual({ ok: false, kind: 'unavailable' });
  });

  test('applyBank posts expectedVersion and ops verbatim', async () => {
    let body: unknown = null;
    const client = createManagementClient({
      baseUrl: 'http://x', secret: 's',
      fetchImpl: fakeFetch((_url, init) => { body = JSON.parse(String(init?.body)); return Response.json({ ownerKey: 'u', version: 1 }); })
    });
    await client.applyBank('u', null, [{ op: 'swap', a: 1, b: 2 }]);
    expect(body).toEqual({ expectedVersion: null, ops: [{ op: 'swap', a: 1, b: 2 }] });
  });
});
```

```ts
// server/src/bank/routes.test.ts
import { describe, expect, test } from 'bun:test';
import { createBankRoutes } from './routes';
import type { ManagementClient } from '../engine/managementClient';
import type { BankOp } from '../types';

const human = { kind: 'human' as const, uid: 'uidA', isAnonymous: false, authTime: Date.now() };
const agent = { kind: 'agent' as const, uid: 'uidA', tokenId: 't', mode: 'read' as const, characters: 'all' as const, contracts: 'deny' as const };

function stubClient(over: Partial<ManagementClient> = {}): ManagementClient {
  return {
    getBank: async ownerKey => ({ ownerKey, version: 2, capacity: 240, tabs: [], slots: [] }),
    applyBank: async () => ({ ok: true, version: 3 }),
    ...over
  };
}

describe('bank routes', () => {
  test('GET returns the caller\'s own bank, keyed by their uid', async () => {
    let asked = '';
    const routes = createBankRoutes({ client: stubClient({ getBank: async k => { asked = k; return { ownerKey: k, version: 2, capacity: 240, tabs: [], slots: [] }; } }), secret: 's' });
    const res = await routes.handle(new Request('http://x/api/bank'), { kind: 'bank', sub: 'get' }, human);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ownerKey: 'uidA', version: 2, capacity: 240 });
    expect(asked).toBe('uidA');
  });

  test('an agent bearer may read but never write', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's' });
    expect((await routes.handle(new Request('http://x/api/bank'), { kind: 'bank', sub: 'get' }, agent)).status).toBe(200);
    const write = await routes.handle(
      new Request('http://x/api/bank/ops', { method: 'POST', body: JSON.stringify({ expectedVersion: 2, ops: [{ op: 'swap', a: 0, b: 1 }] }) }),
      { kind: 'bank', sub: 'ops' }, agent);
    expect(write.status).toBe(403);
    expect(await write.json()).toEqual({ error: 'human_only' });
  });

  test('layout ops are forwarded with the caller\'s expectedVersion', async () => {
    let sent: { key: string; version: number | null; ops: BankOp[] } | null = null;
    const routes = createBankRoutes({ client: stubClient({ applyBank: async (key, version, ops) => { sent = { key, version, ops }; return { ok: true, version: 3 }; } }), secret: 's' });
    const res = await routes.handle(
      new Request('http://x/api/bank/ops', { method: 'POST', body: JSON.stringify({ expectedVersion: 2, ops: [{ op: 'insert', from: 0, to: 3 }] }) }),
      { kind: 'bank', sub: 'ops' }, human);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 3 });
    expect(sent).toEqual({ key: 'uidA', version: 2, ops: [{ op: 'insert', from: 0, to: 3 }] });
  });

  test('a delta op is refused: the browser can reorder the bank, never change what is in it', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's' });
    const res = await routes.handle(
      new Request('http://x/api/bank/ops', { method: 'POST', body: JSON.stringify({ expectedVersion: 2, ops: [{ op: 'delta', obj: 995, count: 1_000_000 }] }) }),
      { kind: 'bank', sub: 'ops' }, human);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'layout_only' });
  });

  test('a malformed body and a missing expectedVersion are 400', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's' });
    for (const body of ['not json', JSON.stringify({ ops: [{ op: 'swap', a: 0, b: 1 }] }), JSON.stringify({ expectedVersion: 2, ops: 'x' }), JSON.stringify({ expectedVersion: 2, ops: [{ op: 'nope' }] })]) {
      const res = await routes.handle(new Request('http://x/api/bank/ops', { method: 'POST', body }), { kind: 'bank', sub: 'ops' }, human);
      expect(res.status).toBe(400);
    }
  });

  test('a 409 from the engine is passed through with the engine\'s version', async () => {
    const routes = createBankRoutes({ client: stubClient({ applyBank: async () => ({ ok: false, kind: 'conflict', version: 11 }) }), secret: 's' });
    const res = await routes.handle(
      new Request('http://x/api/bank/ops', { method: 'POST', body: JSON.stringify({ expectedVersion: 2, ops: [{ op: 'swap', a: 0, b: 1 }] }) }),
      { kind: 'bank', sub: 'ops' }, human);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'version', version: 11 });
  });

  test('an unreachable engine is 503, a rejected op is 422', async () => {
    const down = createBankRoutes({ client: stubClient({ applyBank: async () => ({ ok: false, kind: 'unavailable' }) }), secret: 's' });
    const bad = createBankRoutes({ client: stubClient({ applyBank: async () => ({ ok: false, kind: 'rejected', error: 'tab_invariant' }) }), secret: 's' });
    const body = JSON.stringify({ expectedVersion: 2, ops: [{ op: 'swap', a: 0, b: 1 }] });
    expect((await down.handle(new Request('http://x/api/bank/ops', { method: 'POST', body }), { kind: 'bank', sub: 'ops' }, human)).status).toBe(503);
    expect((await bad.handle(new Request('http://x/api/bank/ops', { method: 'POST', body }), { kind: 'bank', sub: 'ops' }, human)).status).toBe(422);
  });

  test('the change hook records the version, and refuses a non-loopback caller or a wrong secret', async () => {
    const routes = createBankRoutes({ client: stubClient(), secret: 's' });
    const post = (ip: string, secret: string) => routes.handleHook(
      new Request('http://x/internal/bank-changed', { method: 'POST', headers: { 'x-idlescape-mgmt': secret }, body: JSON.stringify({ ownerKey: 'uidA', version: 7 }) }), ip);

    expect((await post('203.0.113.9', 's')).status).toBe(403);
    expect((await post('127.0.0.1', 'nope')).status).toBe(401);
    expect((await post('127.0.0.1', 's')).status).toBe(204);
    expect(routes.versionOf('uidA')).toBe(7);
    expect(routes.versionOf('uidB')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server && ~/.bun/bin/bun test src/engine src/bank`
Expected: FAIL — neither module exists.

- [ ] **Step 3: Write the management client**

```ts
// server/src/engine/managementClient.ts
import type { BankOp, BankSnapshot } from '../types';

export type ApplyResult =
  | { ok: true; version: number }
  | { ok: false; kind: 'conflict'; version: number }
  | { ok: false; kind: 'rejected'; error: string }
  | { ok: false; kind: 'unavailable' };

export interface ManagementClient {
  getBank(ownerKey: string): Promise<BankSnapshot | null>;
  applyBank(ownerKey: string, expectedVersion: number | null, ops: BankOp[]): Promise<ApplyResult>;
}

const TIMEOUT_MS = 3000;

/**
 * Typed client for the engine overlay's owner-bank routes (engine-custom/src/idlescape/
 * management.ts), reached over ENGINE_MANAGEMENT_HTTP on loopback. SP8b's spec calls this
 * module `server/src/bank/engine.ts`; it is this file -- SP8b imports it rather than adding a
 * second client. SP9's Contracts settlement uses `applyBank` directly with `delta` ops, which
 * the browser-facing route refuses.
 */
export function createManagementClient(opts: { baseUrl: string; secret: string; fetchImpl?: typeof fetch }): ManagementClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const headers = { 'content-type': 'application/json', 'x-idlescape-mgmt': opts.secret };

  return {
    async getBank(ownerKey) {
      try {
        const res = await fetchImpl(`${opts.baseUrl}/owner/${encodeURIComponent(ownerKey)}/bank`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) return null;
        return (await res.json()) as BankSnapshot;
      } catch {
        return null;
      }
    },

    async applyBank(ownerKey, expectedVersion, ops) {
      let res: Response;
      try {
        res = await fetchImpl(`${opts.baseUrl}/owner/${encodeURIComponent(ownerKey)}/bank/apply`, {
          method: 'POST', headers, body: JSON.stringify({ expectedVersion, ops }), signal: AbortSignal.timeout(TIMEOUT_MS)
        });
      } catch {
        return { ok: false, kind: 'unavailable' };
      }

      if (res.ok) {
        const body = (await res.json()) as { version: number };
        return { ok: true, version: body.version };
      }
      if (res.status === 409) {
        const body = (await res.json()) as { version: number };
        return { ok: false, kind: 'conflict', version: body.version };
      }
      if (res.status === 422 || res.status === 400) {
        const body = (await res.json()) as { error?: string };
        return { ok: false, kind: 'rejected', error: body.error ?? 'rejected' };
      }
      return { ok: false, kind: 'unavailable' };
    }
  };
}
```

- [ ] **Step 4: Write the bank routes**

```ts
// server/src/bank/routes.ts
import { timingSafeEqual } from 'node:crypto';

import type { Principal } from '../auth/principal';
import type { ManagementClient } from '../engine/managementClient';
import type { Route } from '../router';
import { BANK_LAYOUT_OPS, type BankOp } from '../types';

type BankRoute = Route & { kind: 'bank' };

export interface BankRoutes {
  handle(req: Request, route: BankRoute, principal: Principal): Promise<Response>;
  handleHook(req: Request, ip: string): Promise<Response>;
  versionOf(ownerKey: string): number | null;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const MAX_OPS = 200;

function sameSecret(a: string | null, b: string): boolean {
  if (!a || b.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function isInt(v: unknown): v is number { return typeof v === 'number' && Number.isInteger(v); }

/** Shape-checks an op and refuses anything that would change what the bank contains. */
function layoutOp(raw: unknown): BankOp | 'not_layout' | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.op === 'delta' || (r.op === undefined && r.obj !== undefined)) return 'not_layout';
  if (typeof r.op !== 'string' || !(BANK_LAYOUT_OPS as readonly string[]).includes(r.op)) return null;
  switch (r.op) {
    case 'swap': return isInt(r.a) && isInt(r.b) ? { op: 'swap', a: r.a, b: r.b } : null;
    case 'insert': return isInt(r.from) && isInt(r.to) ? { op: 'insert', from: r.from, to: r.to } : null;
    case 'moveToTab': return isInt(r.slot) && isInt(r.tab) ? { op: 'moveToTab', slot: r.slot, tab: r.tab } : null;
    case 'setTabs': return Array.isArray(r.sizes) && r.sizes.every(isInt) ? { op: 'setTabs', sizes: r.sizes as number[] } : null;
    case 'sort': return isInt(r.tab) && (r.by === 'value' || r.by === 'name' || r.by === 'id') ? { op: 'sort', tab: r.tab, by: r.by } : null;
    default: return null;
  }
}

export function createBankRoutes(deps: { client: ManagementClient; secret: string }): BankRoutes {
  // Last version the engine reported per owner. SP8b turns this into an SSE stream; SP8 keeps
  // it as the record that proves the hook arrived.
  const versions = new Map<string, number>();

  return {
    async handle(req, route, principal) {
      const ownerKey = principal.uid;

      if (route.sub === 'get') {
        if (req.method !== 'GET') return new Response(null, { status: 405 });
        const snapshot = await deps.client.getBank(ownerKey);
        if (!snapshot) return Response.json({ error: 'engine_unavailable' }, { status: 503 });
        if (versions.get(ownerKey) !== snapshot.version) versions.set(ownerKey, snapshot.version);
        return Response.json(snapshot);
      }

      if (req.method !== 'POST') return new Response(null, { status: 405 });
      // Reordering is a human action from the bank window; item movement is Contracts' job
      // and goes through the management client server-side, never through a browser request.
      if (principal.kind !== 'human') return Response.json({ error: 'human_only' }, { status: 403 });

      let body: { expectedVersion?: unknown; ops?: unknown };
      try { body = (await req.json()) as typeof body; } catch { return Response.json({ error: 'bad_body' }, { status: 400 }); }
      if (!isInt(body.expectedVersion) || body.expectedVersion < 0) return Response.json({ error: 'bad_version' }, { status: 400 });
      if (!Array.isArray(body.ops) || body.ops.length > MAX_OPS) return Response.json({ error: 'bad_ops' }, { status: 400 });

      const ops: BankOp[] = [];
      for (const raw of body.ops) {
        const op = layoutOp(raw);
        if (op === 'not_layout') return Response.json({ error: 'layout_only' }, { status: 403 });
        if (!op) return Response.json({ error: 'bad_ops' }, { status: 400 });
        ops.push(op);
      }

      const result = await deps.client.applyBank(ownerKey, body.expectedVersion, ops);
      if (result.ok) {
        versions.set(ownerKey, result.version);
        return Response.json({ version: result.version });
      }
      if (result.kind === 'conflict') {
        versions.set(ownerKey, result.version);
        return Response.json({ error: 'version', version: result.version }, { status: 409 });
      }
      if (result.kind === 'rejected') return Response.json({ error: result.error }, { status: 422 });
      return Response.json({ error: 'engine_unavailable' }, { status: 503 });
    },

    async handleHook(req, ip) {
      // The engine posts this from the same machine; nothing else may.
      if (!LOOPBACK.has(ip)) return Response.json({ error: 'forbidden' }, { status: 403 });
      if (!sameSecret(req.headers.get('x-idlescape-mgmt'), deps.secret)) return Response.json({ error: 'unauthorized' }, { status: 401 });
      let body: { ownerKey?: unknown; version?: unknown };
      try { body = (await req.json()) as typeof body; } catch { return Response.json({ error: 'bad_body' }, { status: 400 }); }
      if (typeof body.ownerKey !== 'string' || !isInt(body.version)) return Response.json({ error: 'bad_body' }, { status: 400 });
      versions.set(body.ownerKey, body.version);
      return new Response(null, { status: 204 });
    },

    versionOf(ownerKey) {
      return versions.get(ownerKey) ?? null;
    }
  };
}
```

- [ ] **Step 5: Wire the routes**

`server/src/router.ts`:
```ts
  | { kind: 'bank'; sub: 'get' | 'ops' }
  | { kind: 'bankHook' }
```
```ts
  if (pathname === '/api/bank') return { kind: 'bank', sub: 'get' };
  if (pathname === '/api/bank/ops') return { kind: 'bank', sub: 'ops' };
  if (pathname === '/internal/bank-changed') return { kind: 'bankHook' };
```
```ts
    case 'bank': return 'either';      // reads for agents, writes gated inside the handler
    case 'bankHook': return 'none';    // loopback + shared secret, no Firebase identity
```
Add the matching `router.test.ts` cases (three new paths classify correctly; `/api/bank/nope`
is `notfound`).

`server/src/index.ts`:
```ts
const managementClient = createManagementClient({ baseUrl: env.engineManagementHttp, secret: env.ownerAssertionSecret });
const bankRoutes = createBankRoutes({ client: managementClient, secret: env.ownerAssertionSecret });
```
in the gate-exempt switch (next to `case 'health'`), because the engine has no gate cookie:
```ts
      case 'bankHook':
        return req.method === 'POST' ? bankRoutes.handleHook(req, clientIp(req, srv)) : new Response(null, { status: 405 });
```
and in the post-principal switch:
```ts
      case 'bank': return bankRoutes.handle(req, route, principal as Principal);
```

- [ ] **Step 6: Run the suite**

Run: `cd server && ~/.bun/bin/bun run typecheck && ~/.bun/bin/bun test`
Expected: pass (emulators up).

- [ ] **Step 7: Commit**

```bash
git add server/src
git commit -m "feat(server): engine management client, /api/bank read and layout-only ops, loopback change hook"
```

---
### Task 12: Stack integration — two characters, one bank; a web apply while online; 409

**Files:**
- Create: `web/e2e/bank.pw.test.ts`, `engine-custom/src/idlescape/shared.test.ts`
- Modify: `web/e2e/helpers.ts` (one helper), `engine-custom/manifest.json`

**Interfaces:**
- Consumes: `openGate`, `clientState`, `uniqueName`, `SIGNUP_PASSWORD` from `web/e2e/helpers.ts`;
  `GET /api/bank`, `POST /api/bank/ops` from Task 11; the loopback management port (8897) for
  the seeding step.
- Produces (`web/e2e/helpers.ts`):
  ```ts
  export async function createCharacterFromPanel(page: Page, name: string): Promise<void>;
  ```

- [ ] **Step 1: Write the engine-side integration test**

```ts
// engine-custom/src/idlescape/shared.test.ts
// The two-characters-in-one-tick case from spec section 11, at the level the engine actually
// decides it: two Players stamped with the same owner key, one container, one dirty sweep.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';
import Player from '#/engine/entity/Player.js';
import { toBase37 } from '#/util/JString.js';

import { installIdlescape, ownerBanks } from './install.js';
import { setOwnerKey } from './owner.js';

before(() => {
    InvType.load('data/pack');
    ObjType.load('data/pack');
    installIdlescape();
});

beforeEach(() => {
    process.env.IDLESCAPE_BANK_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'idlescape-shared-'));
});

function stamped(name: string, ownerKey: string): Player {
    const n37 = toBase37(name);
    const player = new Player(name, n37, n37);
    setOwnerKey(player, ownerKey);
    return player;
}

test('a deposit by one character is visible to the other immediately and dirties one container', () => {
    const alice = stamped('alice', 'uidPair');
    const bob = stamped('bob', 'uidPair');

    alice.getInventory(95)!.add(995, 1000);
    assert.equal(bob.getInventory(95)!.getItemCount(995), 1000);

    // Both characters' inv listeners resolve the same Inventory, so both see the same dirty
    // slots in the same tick -- the reset happens once, in afterCycle, AFTER client output.
    const inv = ownerBanks().get('uidPair');
    assert.equal(inv.update, true);
    assert.deepEqual(inv.getDirtySlots(), [0]);

    assert.deepEqual(ownerBanks().bumpDirty(), ['uidPair']);
    assert.equal(inv.update, false, 'the overlay owns the reset; upstream processCleanup never sees this container');
    assert.equal(ownerBanks().version('uidPair'), 1);
});

test('interleaved writes from two characters both land, and produce one version bump per sweep', () => {
    const alice = stamped('alice2', 'uidPair2');
    const bob = stamped('bob2', 'uidPair2');

    alice.getInventory(95)!.add(995, 10);
    bob.getInventory(95)!.add(1038, 1);
    alice.getInventory(95)!.remove(995, 4);

    assert.equal(ownerBanks().get('uidPair2').getItemCount(995), 6);
    assert.equal(ownerBanks().get('uidPair2').getItemCount(1038), 1);
    assert.deepEqual(ownerBanks().bumpDirty(), ['uidPair2']);
    assert.equal(ownerBanks().version('uidPair2'), 1, 'one tick is one version, however many writes it contained');
});

test('a web apply between ticks is serialised against in-game writes', () => {
    const alice = stamped('alice3', 'uidPair3');
    alice.getInventory(95)!.add(995, 100);
    ownerBanks().bumpDirty();                                   // version 1, tick boundary

    assert.deepEqual(ownerBanks().apply('uidPair3', 1, [{ op: 'swap', a: 0, b: 5 }]), { ok: true, version: 2 });
    assert.equal(alice.getInventory(95)!.get(5)?.count, 100, 'the online character sees the web reorder at once');
});
```

- [ ] **Step 2: Run it**

Run: `pwsh scripts/engine-overlay.ps1 && cd engine/server && npx tsx --test src/idlescape/shared.test.ts`
Expected: pass.

- [ ] **Step 3: Add the e2e helper**

`web/e2e/helpers.ts`:

```ts
/** Creates a character from the in-game Characters panel and waits for it to appear. */
export async function createCharacterFromPanel(page: Page, name: string): Promise<void> {
  await page.locator('[data-panel="characters"]').click();
  await page.locator('#char-panel-name').fill(name);
  await page.locator('#char-panel-create button[type="submit"]').click();
  await expect(page.locator(`[data-char-row]:has-text("${name}")`)).toBeVisible({ timeout: 15_000 });
}
```

- [ ] **Step 4: Write the browser e2e**

```ts
// web/e2e/bank.pw.test.ts
import { expect, request as playwrightRequest, test } from '@playwright/test';
import { SIGNUP_PASSWORD, clientState, createCharacterFromPanel, openGate, signUp, uniqueName } from './helpers';

// The management port is loopback-only and never reachable from the browser; the test process
// talks to it directly to seed items, standing in for the Contracts service that will do it
// for real in SP9. Everything the *browser* does goes through the front server.
const MANAGEMENT = process.env.E2E_ENGINE_MANAGEMENT ?? 'http://127.0.0.1:8897';
const SECRET = process.env.OWNER_ASSERTION_SECRET ?? '';

test('every character of one account shares one bank, and a web reorder is versioned', async ({ page }) => {
  test.skip(SECRET === '', 'OWNER_ASSERTION_SECRET is not configured for this stack');

  await openGate(page);
  const first = uniqueName('bankone');
  await signUp(page, first);
  await expect(page.locator('#screen-characters')).toBeVisible();
  await page.locator('#char-name').fill(first);
  await page.locator('#btn-char-create').click();
  await expect(page.locator('#screen-frame')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.idlescape?.client?.getState().loggedIn ?? false), { timeout: 90_000 }).toBe(true);

  // 1. The account's bank exists and is keyed by the Firebase uid, not by the character.
  const empty = await (await page.request.get('/api/bank')).json();
  expect(empty).toMatchObject({ capacity: 240, version: 0, tabs: [], slots: [] });
  const ownerKey: string = empty.ownerKey;
  expect(ownerKey.length).toBeGreaterThan(0);

  // 2. Seed items the way Contracts will: an engine apply for an owner who IS online.
  const mgmt = await playwrightRequest.newContext({ extraHTTPHeaders: { 'x-idlescape-mgmt': SECRET } });
  const seeded = await mgmt.post(`${MANAGEMENT}/owner/${ownerKey}/bank/apply`, {
    data: { expectedVersion: 0, ops: [{ obj: 995, delta: 500 }, { obj: 1038, delta: 1 }] }
  });
  expect(seeded.status()).toBe(200);

  const seen = await (await page.request.get('/api/bank')).json();
  expect(seen.version).toBeGreaterThan(0);
  expect(seen.slots).toEqual([{ slot: 0, obj: 995, count: 500 }, { slot: 1, obj: 1038, count: 1 }]);

  // 3. A layout op from the browser is applied by the engine and bumps the version.
  const swap = await page.request.post('/api/bank/ops', { data: { expectedVersion: seen.version, ops: [{ op: 'swap', a: 0, b: 1 }] } });
  expect(swap.status()).toBe(200);
  const afterSwap = await (await page.request.get('/api/bank')).json();
  expect(afterSwap.slots).toEqual([{ slot: 0, obj: 1038, count: 1 }, { slot: 1, obj: 995, count: 500 }]);

  // 4. A stale version is refused with 409 and the engine's current version.
  const stale = await page.request.post('/api/bank/ops', { data: { expectedVersion: seen.version, ops: [{ op: 'swap', a: 0, b: 1 }] } });
  expect(stale.status()).toBe(409);
  expect(await stale.json()).toEqual({ error: 'version', version: afterSwap.version });

  // 5. The browser may never change what the bank contains.
  const cheat = await page.request.post('/api/bank/ops', { data: { expectedVersion: afterSwap.version, ops: [{ obj: 995, delta: 1_000_000 }] } });
  expect(cheat.status()).toBe(403);

  // 6. A second character of the same account sees the same bank and the same owner key.
  const second = uniqueName('banktwo');
  await createCharacterFromPanel(page, second);
  await page.locator(`[data-char-row]:has-text("${second}") [data-char-switch]`).click();
  await expect.poll(async () => (await clientState(page)).gameName, { timeout: 90_000 }).toBe(second);

  const asSecond = await (await page.request.get('/api/bank')).json();
  expect(asSecond.ownerKey).toBe(ownerKey);
  expect(asSecond.slots).toEqual(afterSwap.slots);
  await mgmt.dispose();
});

test('a different account gets a different bank', async ({ page }) => {
  test.skip(SECRET === '', 'OWNER_ASSERTION_SECRET is not configured for this stack');
  await openGate(page);
  const name = uniqueName('bankalt');
  await signUp(page, name);
  await page.locator('#char-name').fill(name);
  await page.locator('#btn-char-create').click();
  await expect(page.locator('#screen-frame')).toBeVisible();
  const bank = await (await page.request.get('/api/bank')).json();
  expect(bank.slots).toEqual([]);
});
```

(`SIGNUP_PASSWORD` is imported because `signUp` uses it; drop the import if the helper already
closes over it.)

- [ ] **Step 5: Run the whole stack**

Run (PowerShell): emulators via `Start-Process cmd.exe "/c npm run emulators"` in `firebase/`,
then `scripts/start-stack.ps1 -Prod`; wait for `/api/health` `engine: up`. Confirm
`logs/engine.log` contains `[idlescape] overlay active` and that
`curl -H "x-idlescape-mgmt: $OWNER_ASSERTION_SECRET" http://127.0.0.1:8897/owner/test/bank`
returns a snapshot while `curl http://127.0.0.1:8897/owner/test/bank` returns 401.

Then Git Bash: `cd web && npm run build:e2e && npx playwright test`
Expected: the four existing specs plus the two new ones pass. `OWNER_ASSERTION_SECRET` must be
in the environment of the Playwright process as well as in `server/.env` — export it in the
shell before running, or add it to `web/playwright.config.ts`'s `use.extraHTTPHeaders`-adjacent
env plumbing if that is cleaner.

- [ ] **Step 6: Verify the login binding by hand (no automated seam for it)**

With the stack up and `login.requireOwner` forced on
(`$env:OWNER_REQUIRE_ASSERTION='true'` before `start-stack.ps1`):
1. Log in normally through the shell — succeeds.
2. In devtools, delete the `cs_owner` cookie and reload; log in — the client shows the login
   failure for response 13 and `logs/engine.log` records
   `login for '<name>' carried no valid owner assertion`.
3. Connect the original Java client over TCP (43596) — refused for the same reason.
Record all three in the task report.

- [ ] **Step 7: Commit**

```bash
git add engine-custom web/e2e
git commit -m "test: shared bank across an account's characters, versioned web applies and 409 conflicts"
```

---

### Task 13: Documentation — README, deploy notes, roadmap, credits

**Files:**
- Modify: `README.md`, `CREDITS.md`, `docs/superpowers/specs/2026-09-05-idlescape-roadmap-and-handoff.md`, `docs/superpowers/specs/2026-09-05-multi-character-platform-design.md`

**Interfaces:** none (documentation only). **Do not touch `deploy/`** — another agent owns it;
this task writes the note that agent needs.

- [ ] **Step 1: README — ports, env, and how it fits together**

Port table: add a note under it that the management port is now bound to `127.0.0.1` by the
engine overlay (`IDLESCAPE_MANAGEMENT_HOST` to change it) and that it carries the owner-bank
routes as well as `/prometheus`.

Front server env table: add

| Variable | Default | What it is |
|---|---|---|
| `OWNER_ASSERTION_SECRET` | – | 32+ char HMAC secret shared with the engine overlay. Signs the `cs_owner` owner assertion the relay puts on the engine handshake, and authenticates the front server to the engine's owner-bank routes and the engine's change hook back. Empty disables owner binding entirely (dev only). |

"How it fits together": a new bullet after the `content-custom/` one:

```markdown
- `engine-custom/` is the same idea for the server half: `scripts/engine-overlay.ps1` copies it
  over the pinned `engine/server` clone before the engine starts, and
  `scripts/engine-overlay.ps1 -Check` fails the build when an upstream file a patch depends on
  has changed. It delivers three things. **Owner binding**: the front server signs
  `{uid, character, exp}` when it mints a character session, parks it in an `HttpOnly`
  `cs_owner` cookie, the relay promotes it to `X-Idlescape-Owner` on the engine handshake, and
  the engine checks it against the name it decrypts from the RSA login block — the relay
  cannot do that check itself because it never sees the name. **Staff level**: upstream hands
  everyone level 4 whenever `node.production` is false; the overlay replaces that with an
  allow-list in `engine/server/data/config/idlescape.json`, so nobody can `::give` themselves
  two billion coins. **The shared bank**: inventory 95 leaves the per-character `.sav` and
  becomes one container per Firebase account, persisted at
  `engine/server/data/banks/<uid>.json` with a version, migrated once from each character's old
  `.sav`, and reachable from the front server at `GET /api/bank` (read) and
  `POST /api/bank/ops` (reorder only — items enter and leave the bank in game, or through
  Contracts).
```

- [ ] **Step 2: README — a "Deploy: engine overlay and production hardening" section**

Place it next to "Deploy: origin configuration":

```markdown
## Deploy: engine overlay and production hardening

The deploy pipeline (owned separately, under `deploy/`) needs four changes for SP8. None of
them are made by this sub-project, which never edits `deploy/` or the dev `world.json`.

1. **Run the overlay.** `scripts/engine-overlay.ps1` must run after the engine checkout and
   before the engine starts, exactly where `scripts/content-overlay.ps1` already runs. A
   deploy that skips it ships an unpatched engine: no owner binding, no shared bank, and staff
   level 4 for every player.
2. **`node.production: true`** in the deployed `engine/server/data/config/world.json`. This is
   the spec's precondition for any economy feature. Two consequences to plan for:
   - It is what turns on the `lostcity_active_players` Prometheus gauge
     (`World.ts:477-478` only calls `trackPlayerCount.set` under `node.production`), so the
     home page's live player count starts working at the same time.
   - It turns on the login rate limits. **Every** browser login reaches the engine from the
     relay's loopback address, so `node.rateLimitAddressLogin` (default 30 per 60 s per
     address) becomes a global cap of 30 logins per minute for the whole world. Set it to `0`
     (disabled) or a number well above peak concurrent logins, and leave
     `node.rateLimitDeviceLogin` alone (it is keyed by the client's own uid).
   - Consider `node.debug: false` at the same time; it re-enables the engine's idle-logout
     handler, which SP7's client patches expect.
3. **`OWNER_ASSERTION_SECRET`** — one 32+ character secret, present in the front server's
   environment *and* in the engine process's environment (or in
   `engine/server/data/config/idlescape.json` as `ownerSecret`). If they differ, every login is
   refused. Generate with `openssl rand -base64 48`.
4. **Engine environment** for the overlay, alongside the secret:
   - `IDLESCAPE_HOOK_URL=http://127.0.0.1:<front server port>/internal/bank-changed`
   - `IDLESCAPE_BANK_DIR` if the bank files should not live at `engine/server/data/banks`
     (**back this directory up: it is the account bank, and it is not in the `.sav` files**)
   - `IDLESCAPE_MANAGEMENT_HOST` only if the management port must not be loopback-only
   - never set `IDLESCAPE_DEV_STAFF` in production (it is ignored there anyway)
   Staff accounts go in `engine/server/data/config/idlescape.json`:
   `{ "staff": { "somename": 2 } }`.
```

- [ ] **Step 3: Roadmap and spec amendments**

`docs/superpowers/specs/2026-09-05-idlescape-roadmap-and-handoff.md` — add the SP8 row to the
sequence table pointing at this plan.

`docs/superpowers/specs/2026-09-05-multi-character-platform-design.md` — append to section 7 a
short "As built (SP8)" note recording the three places the implementation differs from the
design:
- the assertion travels in an `HttpOnly` cookie the relay promotes to a header, because the 274
  client builds its own WebSocket URL and cannot carry one;
- applies are serialised by the engine's single thread between ticks rather than queued onto a
  tick, which gives the same atomicity;
- the "other character's bank interface goes stale until reopened" caveat does **not** apply:
  because the owner container lives outside `player.invs`, the overlay owns its dirty-tracking
  reset and does it after client output, so every online character of the owner receives the
  same `inv_transmit` diff in the same tick.

- [ ] **Step 4: CREDITS**

`CREDITS.md` — no third-party code is vendored by SP8 (the overlay is our own code sitting on
top of Engine-TS, which is already credited). Add one line under the Engine-TS entry noting
that `engine-custom/` modifies it and that `engine-custom/PATCHES.md` lists every change, for
the same reason `client/PATCHES.md` is referenced there. If any task ended up copying a helper
from another project, credit it here instead of silently vendoring it.

- [ ] **Step 5: Full verification**

Run (PowerShell): `scripts/verify.ps1`
Expected: all seven steps pass, including the new engine overlay/typecheck/test step and the
two new Playwright specs.

- [ ] **Step 6: Commit**

```bash
git add README.md CREDITS.md docs/superpowers/specs
git commit -m "docs(sp8): engine overlay, owner assertion and shared bank; deploy notes for production hardening"
```

---

## Self-review notes

**Spec coverage.** Platform spec section 3 ruling 1 (engine overlay mechanism mirroring
`content-custom/`, `scripts/engine-overlay.ps1`, `engine-custom/PATCHES.md`) → Tasks 1, 2, and
a `PATCHES.md`/`manifest.json` step in every task that touches the engine. Ruling 2
(`node.production=true` before any economy feature) → Task 6 (the behaviour it was protecting
against is removed regardless of the flag) and Task 13 step 2 (the deploy change itself, which
SP8 documents rather than makes). Decision 13 (signed `{uid, character, exp}` injected into the
upgrade, engine patch verifying it against the decrypted login name) → Tasks 3, 4, 5, with the
hand-verification in Task 12 step 6. Section 7: `World.ownerBanks` → `OwnerBankStore` (Task 8);
`Player.getInventory(95)` routing → Task 9; save/load skipping 95 → Task 9 (and the `Player.save`
test that proves no patch is needed); one-time `.sav` migration → Tasks 8, 9; persistence with
`version` → Task 8; `GET /owner/:key/bank` and `POST /owner/:key/bank/apply` with
`expectedVersion` and 409 → Task 10; offline apply → Tasks 8, 10; capacity 240 → Global
Constraints, asserted in Tasks 2, 7, 8, 10, 12. Section 10 SP8 row → the whole plan. Section 11
tests: engine overlay `apply` with version conflicts → Tasks 8, 10, 12; two characters of one
owner banking in one tick → Task 12 step 1; the browser slice → Task 12 step 4.

SP8b's requirements on SP8: `tabs: number[]` in the store (≤ 9, sum ≤ used) → Tasks 7, 8;
`apply` accepting `swap`, `insert`, `moveToTab`, `setTabs`, `sort` with the invariant → Task 7;
a change hook posting `{ ownerKey, version }` on every mutation tick → Task 9 (`afterCycle`) and
Task 10 (external applies), consumed in Task 11; nine `scope=perm` tab varps seeded at login and
written back → Task 9. The in-game tab UI is explicitly **not** here.

**Not in SP8 by design:** the bank window, icons, SSE, search (SP8b); Contracts, escrow and any
`delta` op issued by product code (SP9); wealth (SP10); the `.sav` deletion route SP6's soft
delete is waiting on (kept out to hold this sub-project to one seam — note it for SP8c);
placeholders and bank fillers (SP8b section 7.4 defers them to an engine change).

**Type consistency.** `BankOp`, `BankSlot`/`BankSlotDto` and `BankSnapshot` are declared twice
by necessity — once in `engine-custom/src/idlescape/types.ts` and once in `server/src/types.ts`
— with identical field names and the same tagged-union tags; Task 11's tests pin the wire shape
from the front-server side and Task 10's pin it from the engine side, so a divergence fails a
suite rather than production. The assertion string format is likewise mirrored
(`server/src/auth/ownerAssertion.ts` and `engine-custom/src/idlescape/ownerAssertion.ts`); the
engine test rebuilds a signature with `createHmac` by hand so the two implementations are
compared, not just each to itself. `ApplyOutcome` (engine) → `ApplyResult` (front server) is a
deliberate rename at the HTTP boundary: the engine's `BankApplyError` values travel as strings.

**Known limitations carried forward.** (1) An owner-stamped player's bank is not in the `.sav`,
so a character restored from a `.sav` backup taken before SP8 will re-run its migration if its
name is missing from the store's `migrated` list — back up `data/banks/` and `data/players/`
together. (2) `IDLESCAPE_DEV_STAFF=4` is exported by `start-stack.ps1`'s dev path so local
`::give` still works; anyone running the dev stack has staff level 4, exactly as before, and the
hardening only bites in production. (3) The change hook is fire-and-forget: a front server that
was down during a mutation learns the new version on its next `GET /api/bank`, which is why
SP8b's fallback poll exists.
