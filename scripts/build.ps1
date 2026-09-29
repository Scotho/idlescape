# scripts/build.ps1 — production build for idlescape.
#
# Builds the three shippable artifacts:
#   1. The front web app (Vite)     -> web/dist        (served as / and /assets/*)
#   1c. The wiki reader database    -> wiki/build      (served as /wiki and /api/wiki)
#   2. The game client fork (Bun)   -> client/out      (served as /client/*)
#
# The front server (server/) runs straight off Bun and needs no build step; it serves
# /client/<file> from client/out (see server/src/static.ts), falling back to the engine's
# shipped companions (deps.js, soundfont) for anything the client build does not produce.
#
# Revision 274 client artifacts (SP1b): client.js, ondemandworker.js (OnDemandWorker chunk,
# new in 274), mapview.js, and tinymidipcm.wasm. 274 dropped the bzip2 wasm — it now uses a
# pure-JS BZip2 (src/io/BZip2.js) and fflate for gunzip — so no bzip2.wasm is emitted.

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$client = Join-Path $root 'client'
$web = Join-Path $root 'web'

function Get-Bun {
    $cmd = Get-Command bun -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $fallback = Join-Path $env:USERPROFILE '.bun\bin\bun.exe'
    if (Test-Path $fallback) { return $fallback }
    throw 'bun not found on PATH or at ~/.bun/bin/bun.exe'
}

$bun = Get-Bun
Write-Host "Using bun: $bun"

# --- 1. Front web app (Vite) -------------------------------------------------
Write-Host "`n== Building front web app (web/) =="
Push-Location $web
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "web build failed (exit $LASTEXITCODE)" }
} finally {
    Pop-Location
}

# --- 1b. Generated map data must match the pinned engine content --------------
# atlas.json, collision.bin, doors.json and the Tutorial Island step list are committed output of
# scripts/gen. A content bump that nobody regenerated would leave the shell fetching data that no
# longer describes the map, and a tutorial script matching on titles the content no longer shows,
# and nothing else in the build would notice.
#
# The generators are also typechecked here. Bun strips their types without checking them and
# web/tsconfig.json covers only web/src, so scripts/gen/tsconfig.json is the only thing standing
# between the generators' IO half and silent type drift. It borrows web's TypeScript.
Write-Host "`n== Checking generated map data (scripts/gen)"
Push-Location $web
try {
    & npx tsc --project ../scripts/gen/tsconfig.json
    if ($LASTEXITCODE -ne 0) { throw 'scripts/gen does not typecheck (run: npx tsc -p ../scripts/gen/tsconfig.json from web/)' }
} finally {
    Pop-Location
}
Push-Location $root
try {
    & $bun 'scripts/gen/atlas.ts' '--check'
    if ($LASTEXITCODE -ne 0) { throw 'atlas.json is out of date with engine/content (run: bun scripts/gen/atlas.ts)' }
    & $bun 'scripts/gen/collision.ts' '--check'
    if ($LASTEXITCODE -ne 0) { throw 'collision.bin/doors.json are out of date with engine/content (run: bun scripts/gen/collision.ts)' }
    & $bun 'scripts/gen/tutorial-steps.ts' '--check'
    if ($LASTEXITCODE -ne 0) { throw 'tutorialIsland/steps.ts is out of date with engine/content (run: bun scripts/gen/tutorial-steps.ts)' }
} finally {
    Pop-Location
}

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

# --- 2. Game client fork (Bun) ----------------------------------------------
Write-Host "`n== Building game client (client/) =="
Push-Location $client
try {
    & $bun run build
    if ($LASTEXITCODE -ne 0) { throw "client build failed (exit $LASTEXITCODE)" }
} finally {
    Pop-Location
}

# --- 3. Verify the client artifacts the front server serves from client/out --
$out = Join-Path $client 'out'
$required = @('client.js', 'ondemandworker.js', 'tinymidipcm.wasm')
$missing = @()
foreach ($f in $required) {
    if (-not (Test-Path (Join-Path $out $f))) { $missing += $f }
}
if ($missing.Count -gt 0) {
    throw "client build is missing required artifacts in client/out: $($missing -join ', ')"
}

# --- 3b. The minified bundle still carries the reserved hook names -----------
# client/bundle.ts:82 opens terser's `reserved` list (it closes at :184), and a name that
# falls out of it is mangled. For an OUTPUT name that shows up as undefined in the web; for an
# INPUT field name such as optionIndex it is worse: the action dispatches with the field dropped
# (client/PATCHES.md, patch 21). Nothing in any gate had ever looked inside the minified bundle.
#
# It runs HERE and not in verify.ps1 because verify.ps1 step 10 starts start-stack.ps1 -Prod, which
# reaches an unconditional `bun run build:dev` and OVERWRITES client/out with an unminified bundle.
# An assertion after step 9 would be reading the wrong artifact.
#
# What this is NOT is the release path. deploy/lightsail/release.ps1 builds nothing locally: it
# ships `git archive HEAD` to the box and the box runs `docker compose build`, so the client.js
# that actually reaches production is built by deploy/docker/server.Dockerfile's client-build
# stage. That stage carries a mirror of both assertions below, next to the existence check it
# already mirrored. The artifact checked here is a proxy for that one, same bundle.ts and same
# terser on a different machine, so a name that falls out of the list is caught in both places.
$clientJs = Join-Path $out 'client.js'
$bundleText = [System.IO.File]::ReadAllText($clientJs)

# First prove this really is the minified artifact, or the name check below would pass happily
# against a dev bundle that never ran terser at all. Measured when this landed: prod is about
# 403829 bytes per line (terser emits the whole bundle on one line), dev about 32. The floor sits
# well below prod and well above dev.
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

Write-Host "`nBuild complete."
Write-Host "  web/dist   : front web app"
Write-Host "  client/out : $((Get-ChildItem $out -File | Where-Object { $_.Name -notlike '*.map' } | ForEach-Object { $_.Name }) -join ', ')"
Write-Host "  wiki/build : wiki.db ($wikiMiB MiB)"
