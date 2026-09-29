# scripts/verify.ps1 — full verification: every unit suite, then a production-shaped build,
# then the browser e2e against a freshly built revision-274 stack.
#
# Suites (in order): the 400-line ceiling (scripts/line-ceiling.ps1, a static check that costs a
# second), then the engine-custom overlay (apply + drift check) and the engine
# typecheck, then the client fork (tsc --noEmit over the whole package), then client hooks,
# client-tier plugins and the vendored rs-sdk bot module
# (bun test), server (bun test, with the auth+firestore emulators up so pair/bridge suites
# pass), web (typecheck + lint + vitest, where the typecheck covers three programs: src,
# e2e and the tests), firebase rules (its own self-contained
# emulators:exec), wiki (typecheck + bun test, fixtures only). Then scripts/build.ps1, which
# also builds the wiki reader database, then bring up emulators +
# the dev engine (274, Node/tsx) + a post-engine-up client rebuild + the front server on 8787,
# and run Playwright against that. Every process this script starts is stopped in a `finally`
# block by Stop-ProcessTree: `taskkill /T` asks, `/T /F` follows (never `Stop-Process`), so a
# wrapper's whole child tree (npx's node child, firebase's node hub + java Firestore child) goes
# with it; see docs/superpowers/ledgers/2026-09-04-idlescape-platform.md (Task 14) for the
# orphaned-emulator-children issue. Never touches the separate live PoC instance (port 8888).

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $root 'logs'
New-Item -ItemType Directory -Force $logs | Out-Null

function Get-Bun {
    $cmd = Get-Command bun -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $fallback = Join-Path $env:USERPROFILE '.bun\bin\bun.exe'
    if (Test-Path $fallback) { return $fallback }
    throw 'bun not found on PATH or at ~/.bun/bin/bun.exe'
}
$bun = Get-Bun

# Step labels come from one place so adding a step is one constant edit rather than eleven string
# edits. Before this the file carried eleven hardcoded [n/7] strings, and eight claims across five
# documents quoted the count (see the plan's ruling R14); this entry moves it three times.
$TotalSteps = 10
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

function Stop-ProcessTree {
    param([System.Diagnostics.Process]$Process)
    if ($null -eq $Process) { return }
    # Ruling R16: /T asks, /T /F takes. /F is TerminateProcess, so the engine's safeExit and its
    # owner-bank flush (every 100 ticks) never run and up to about 60 seconds of bank state is lost.
    #
    # Two things measured on this machine on 2026-09-08, both of which the shape below exists for.
    # First, `taskkill /T` on a windowless console child REFUSES ("can only be terminated forcefully
    # (with /F option)"), writes that to stderr and exits 128; under $ErrorActionPreference = 'Stop'
    # a native command's stderr is a TERMINATING error even with `*> $null`, so one try/catch around
    # both phases would let the polite ask skip the escalation behind it and leave the engine
    # running for the rest of the session. Each phase gets its own catch, with 'Continue' locally.
    # Second, because a refusal is visible in the exit code, the five second wait is spent only when
    # the ask was actually accepted; a refused ask escalates at once and costs nothing.
    try { if ($Process.HasExited) { return } } catch { return }
    $prior = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $global:LASTEXITCODE = 0
        try { & taskkill /PID $Process.Id /T *> $null } catch {}
        if ($LASTEXITCODE -eq 0) {
            $wait = (Get-Date).AddSeconds(5)
            while (-not $Process.HasExited -and (Get-Date) -lt $wait) { Start-Sleep -Milliseconds 250 }
        }
        try { if (-not $Process.HasExited) { & taskkill /PID $Process.Id /T /F *> $null } } catch {}
    } finally { $ErrorActionPreference = $prior }
}

function Wait-Port {
    param([string]$HostName = '127.0.0.1', [int]$Port, [int]$TimeoutSec = 60)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    do {
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $iar = $client.BeginConnect($HostName, $Port, $null, $null)
            $ok = $iar.AsyncWaitHandle.WaitOne(500) -and $client.Connected
            $client.Close()
            if ($ok) { return $true }
        } catch {}
    } until ((Get-Date) -gt $deadline)
    return $false
}

function Invoke-Native {
    param([string]$Description)
    if ($LASTEXITCODE -ne 0) { throw "$Description failed (exit $LASTEXITCODE)" }
}

# Reads one KEY=value out of server/.env, the single source of truth for both halves of the
# stack: scripts/start-stack.ps1 exports these into the engine process and web/playwright.config.ts
# reads the same file for the bank spec. The unquoting mirrors start-stack.ps1's exactly, so the
# value this returns is the value the engine was given. Returns '' when the file or key is absent.
# The value is never printed by this script -- only its length and the HTTP status it earns.
function Get-ServerEnv {
    param([string]$Key)
    $file = Join-Path $root 'server\.env'
    if (-not (Test-Path -LiteralPath $file)) { return '' }
    $line = Select-String -LiteralPath $file -Pattern "^$Key=" | Select-Object -First 1
    if (-not $line) { return '' }
    return (($line.Line -replace "^$Key=", '').Trim('"').Trim("'"))
}

# --- 1. Static gate: the 400-line ceiling ------------------------------------
# First, deliberately: it is a second of work, and a file over the ceiling should not cost the ten
# minutes of suites below it before anyone hears about it. Audit C16.
Write-Step 'line ceiling (scripts/line-ceiling.ps1)'
& (Join-Path $PSScriptRoot 'line-ceiling.ps1')
Invoke-Native 'line ceiling'

# --- 2. Overlays: the clone pins, then apply, then fail on upstream drift ----
Write-Step 'engine and content overlays (pins, apply, drift)'

# First, because everything below it is only meaningful on a clone at the pinned revision: both
# -Check implementations resolve the CLONE's HEAD, so a stale clone makes every recorded hash agree
# with the blob it was taken from and both checks pass vacuously. Audit C23.
. (Join-Path $PSScriptRoot 'lib\UpstreamLock.ps1')
Assert-LockParsing
Assert-ClonePins -Root $root

& (Join-Path $PSScriptRoot 'engine-overlay.ps1')
Invoke-Native 'engine overlay apply'
& (Join-Path $PSScriptRoot 'engine-overlay.ps1') -Check
Invoke-Native 'engine overlay drift check'

# The content half, which until audit C23 was fixed had no gate at all: nothing in verify.ps1
# applied the content overlay, and content-overlay.ps1 -Check hashed the post-apply working tree
# and exited 0 whatever it found. Both call sites read their exit code, which the apply path can
# only answer honestly because it now ends in an explicit `exit 0`.
Write-SubStep '(cont.) content overlay (apply + drift check)'
& (Join-Path $PSScriptRoot 'content-overlay.ps1')
Invoke-Native 'content overlay apply'
& (Join-Path $PSScriptRoot 'content-overlay.ps1') -Check
Invoke-Native 'content overlay drift check'

# Every manifest path must be a tracked file, in either clone. The overlay is copied into
# engine/server or engine/content, each a pristine throwaway clone that scripts/setup.ps1
# recreates, so an overlay file that was never
# `git add`ed still applies and still passes every suite on THIS machine while being absent from
# the repository -- and the next checkout silently loses the patch. The manifest is the list of
# what the overlay is, so it is the list this checks. (Carry from the Task 5 review.)
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
        # `--error-unmatch` writes to stderr for a path git does not know, and under
        # $ErrorActionPreference = 'Stop' a native command's stderr is turned into a terminating
        # error, so the `if ($LASTEXITCODE ...)` below would never run and the listing under it
        # would be dead code: the script would die on the FIRST offender with git's own message
        # instead of naming all of them. Suppressed locally rather than globally so the rest of
        # the script keeps its fail-fast behaviour.
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

# Audit C24: the patch records lived in shell fences under a heading claiming they verified every
# patch, and nothing ever ran them. Here rather than beside the client typecheck because the engine
# half of the record reads engine/server, which is only ours once the overlay above has applied.
Write-SubStep '(cont.) patch records (scripts/patches-check.ps1)'
& (Join-Path $PSScriptRoot 'patches-check.ps1')
Invoke-Native 'patch records'

Write-SubStep '(cont.) engine typecheck (tsc --noEmit)'
Push-Location (Join-Path $root 'engine\server')
try {
    npx tsc --noEmit; Invoke-Native 'engine typecheck'
} finally { Pop-Location }

# PowerShell does not expand a glob for a native command, so the suite paths are enumerated
# here and passed to tsx explicitly. They MUST be passed RELATIVE to engine/server, never as
# $_.FullName.
#
# Why: $_.FullName is built from the current location STRING, whose drive and directory casing
# is whatever the caller typed, while node canonicalises the `#/...` subpath imports against the
# real on-disk casing. When the two differ (here: a location of `c:\projects\...` against a real
# `C:\Projects\...`) node holds two specifiers for the same file and evaluates the engine's
# circular module graph twice, so src/idlescape/install.js runs its body mid-cycle. The three
# suites that import it (install, management, shared) then die at LOAD with
# `ReferenceError: Cannot access 'Player' before initialization`: 78 pass, 3 files fail, exit 1.
# Reproduced both ways from the same checkout; relative paths give 112 passing and exit 0
# because node resolves them against its own canonical cwd, so only one specifier ever exists.
# See the header of engine-custom/src/idlescape/install.ts for why that module has to root the
# graph in the first place.
#
# --test-force-exit is required, not cosmetic: importing src/idlescape/install.js pulls in
# #/engine/World.js, which spawns the engine's worker threads, and node:test then waits for an
# event loop that never drains. Without it this step hangs until the whole verification is
# killed. Every SP8 task ran the suite with it by hand; this makes verify.ps1 agree.
Write-SubStep '(cont.) engine unit tests (node:test via tsx)'
Push-Location (Join-Path $root 'engine\server')
try {
    npx tsx --test --test-force-exit (Get-ChildItem 'src\idlescape\*.test.ts' | ForEach-Object { "src/idlescape/$($_.Name)" })
    Invoke-Native 'engine unit tests'
} finally { Pop-Location }

# --- 3. Client typecheck (the fork's own tsc --noEmit over its 123 source files) ----
# Audit C16: client/ had no typecheck script at all, while client/PATCHES.md claimed that
# every upstream bump re-ran one. `bun test` checks only what it imports and `bun run build`
# transpiles without checking, so a type error in the fork could reach a bundle unseen.
# The script is scoped by client/tsconfig.check.json, not here: the pristine tsconfig.json
# declares no include or exclude, so its default glob would sweep in the git-ignored out/
# bundler output and make this step's program depend on whether a build had run.
Write-Step 'client typecheck (tsc --noEmit)'
Push-Location (Join-Path $root 'client')
try {
    & $bun run typecheck
    Invoke-Native 'client typecheck'
} finally { Pop-Location }

# --- 4. Client unit tests (bun:test: hooks, client-tier plugins, vendored bot) ------
Write-Step 'client unit tests (bun test src/hooks src/plugins src/vendor)'
Push-Location (Join-Path $root 'client')
try {
    & $bun test src/hooks src/plugins src/vendor
    Invoke-Native 'client unit tests'
} finally { Pop-Location }

# --- 5. Server typecheck + unit tests (needs auth+firestore emulators: pair/bridge suites) ----
Write-Step 'server typecheck'
# Standalone gate: `bun test` type-checks only what it actually imports, so a type error in a
# file no test touches can slip through it silently. `bun run typecheck` (tsc --noEmit) checks
# the whole server package regardless of what's under test. Doesn't need the emulators.
Push-Location (Join-Path $root 'server')
try {
    & $bun run typecheck
    Invoke-Native 'server typecheck'
} finally { Pop-Location }

Write-SubStep 'server unit tests (auth+firestore emulators up)'
$serverEmu = Start-Process -PassThru -NoNewWindow -WorkingDirectory (Join-Path $root 'firebase') `
    -FilePath 'cmd.exe' -ArgumentList '/c', 'npm', 'run', 'emulators' `
    -RedirectStandardOutput (Join-Path $logs 'verify-server-emulators.log') `
    -RedirectStandardError (Join-Path $logs 'verify-server-emulators.err.log')
try {
    if (-not (Wait-Port -Port 9099 -TimeoutSec 60)) { throw 'auth emulator (9099) did not come up' }
    if (-not (Wait-Port -Port 8080 -TimeoutSec 60)) { throw 'firestore emulator (8080) did not come up' }
    Push-Location (Join-Path $root 'server')
    try {
        & $bun test
        Invoke-Native 'server unit tests'
    } finally { Pop-Location }
} finally {
    Stop-ProcessTree $serverEmu
}

# --- 6. Web unit tests (typecheck, lint, vitest) -----------------------------
Write-Step 'web unit tests (typecheck, lint, vitest)'
Push-Location (Join-Path $root 'web')
try {
    npm run typecheck; Invoke-Native 'web typecheck'
    npm run lint; Invoke-Native 'web lint'
    npm test; Invoke-Native 'web vitest'
} finally { Pop-Location }

# --- 7. Firebase rules tests (self-contained: emulators:exec) ----------------
Write-Step 'firebase rules tests'
Push-Location (Join-Path $root 'firebase')
try {
    npm test
    Invoke-Native 'firebase rules tests'
} finally { Pop-Location }

# --- 8. Wiki package (typecheck + its own suites) ----------------------------
# 31 test files, 121 tests, about 5 seconds, fixtures only: no emulator, no stack, no server.
# Audit C09: this package sat outside every gate while server/src/wiki served /wiki from it. The
# one slow suite (a full re-extract, WIKI_CHECK_FULL=1) skips itself here; it is tier 3.
Write-Step 'wiki typecheck + tests'
Push-Location (Join-Path $root 'wiki')
try {
    & $bun run typecheck
    Invoke-Native 'wiki typecheck'
    & $bun test
    Invoke-Native 'wiki tests'
} finally { Pop-Location }

# --- 9. Build (client, web, wiki database, server typecheck) -----------------
Write-Step 'build (scripts/build.ps1)'
& (Join-Path $PSScriptRoot 'build.ps1')
Invoke-Native 'build (scripts/build.ps1)'

# --- 10. Browser e2e against a freshly built 274 stack ------------------------
Write-Step 'e2e: emulators + dev engine (274) + front server (8787)'

$e2eEmu = Start-Process -PassThru -NoNewWindow -WorkingDirectory (Join-Path $root 'firebase') `
    -FilePath 'cmd.exe' -ArgumentList '/c', 'npm', 'run', 'emulators' `
    -RedirectStandardOutput (Join-Path $logs 'verify-e2e-emulators.log') `
    -RedirectStandardError (Join-Path $logs 'verify-e2e-emulators.err.log')
try {
    if (-not (Wait-Port -Port 9099 -TimeoutSec 60)) { throw 'auth emulator (9099) did not come up for e2e' }
    if (-not (Wait-Port -Port 8080 -TimeoutSec 60)) { throw 'firestore emulator (8080) did not come up for e2e' }

    # start-stack.ps1 -Prod already does exactly what the e2e stack needs: content overlay ->
    # engine overlay -> dev engine (npx tsx, 274) -> wait for "World ready" -> rebuild the
    # client bundle now that the engine (and its content pack) is up -> front server on 8787
    # (reads server/.env: FIREBASE_EMULATORS=true, PUBLIC_ORIGIN=http://localhost:8787).
    # -Prod skips emulators and vite dev, which is why we start emulators
    # ourselves, above, first.
    # The front server reads WEB_DIST from server/.env, which is untracked: on a fresh checkout
    # it falls back to ../web/dist -- the PRODUCTION bundle step 8 just built, against real
    # Firebase. Playwright needs the emulator-mode bundle built below, so set it for the stack
    # process we start here (bun lets a real environment variable win over server/.env).
    $priorWebDist = $env:WEB_DIST
    $env:WEB_DIST = '../web/dist-e2e'
    $stack = Start-Process -PassThru -NoNewWindow -FilePath 'powershell' `
        -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'start-stack.ps1'), '-Prod', '-DevStaff' `
        -RedirectStandardOutput (Join-Path $logs 'verify-stack.log') `
        -RedirectStandardError (Join-Path $logs 'verify-stack.err.log')
    try {
        Write-Host 'waiting for /api/health (engine up)...'
        $deadline = (Get-Date).AddMinutes(10)
        $up = $false
        do {
            Start-Sleep 3
            $up = try { (Invoke-RestMethod 'http://localhost:8787/api/health' -TimeoutSec 3).engine -eq 'up' } catch { $false }
        } until ($up -or (Get-Date) -gt $deadline)
        # engine.err.log first: the engine's own stderr, so EADDRINUSE is there and nowhere else.
        if (-not $up) { throw 'front server / engine did not report healthy within the deadline (see logs/engine.err.log, logs/engine.log, logs/verify-stack.log)' }

        # The bank spec (web/e2e/bank.pw.test.ts) seeds through the engine's loopback management
        # port and SKIPS ITSELF when ENGINE_MANAGEMENT_SECRET is missing. A skip reads as green,
        # so without this gate a typo in the key, a value the engine never received, or an absent
        # server/.env would all silently drop the one spec that proves the shared bank works.
        # Three things are checked, none of which prints the value:
        #   1. it exists and clears the 32-character floor server/src/env.ts enforces;
        #   2. the engine ANSWERS it -- a 200 from the management port means the engine loaded the
        #      same string, so a quoting or export mismatch is a failure here, not a skip later;
        #   3. it is exported into this process, so the Playwright run below uses exactly the
        #      value that just earned that 200 rather than re-parsing the file for itself.
        Write-Host 'checking the engine management secret before the e2e run...'
        $mgmtSecret = Get-ServerEnv 'ENGINE_MANAGEMENT_SECRET'
        if ($mgmtSecret.Length -lt 32) {
            throw "ENGINE_MANAGEMENT_SECRET is missing or shorter than 32 characters in server/.env (length $($mgmtSecret.Length)). web/e2e/bank.pw.test.ts would skip itself and the shared bank would go unverified; see server/.env.example."
        }
        $mgmtBase = Get-ServerEnv 'ENGINE_MANAGEMENT_HTTP'
        if (-not $mgmtBase) { $mgmtBase = 'http://127.0.0.1:8897' }
        $probe = try {
            (Invoke-WebRequest -Uri "$mgmtBase/owner/health" -Headers @{ 'x-idlescape-mgmt' = $mgmtSecret } -UseBasicParsing -TimeoutSec 5).StatusCode
        } catch {
            if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode.value__ } else { -1 }
        }
        if ($probe -ne 200) {
            throw "the engine's owner health route answered $probe at $mgmtBase (401 = the engine holds a different ENGINE_MANAGEMENT_SECRET, 404 = it started without one, -1 = unreachable). scripts/start-stack.ps1 exports it from server/.env; the bank e2e cannot run without it."
        }
        Write-Host '  owner health route answered 200 for the configured secret.'
        $priorMgmtSecret = $env:ENGINE_MANAGEMENT_SECRET
        $env:ENGINE_MANAGEMENT_SECRET = $mgmtSecret

        Push-Location (Join-Path $root 'web')
        try {
            # Step 8's build.ps1 produced a PRODUCTION bundle (web/.env.production: the real
            # Firebase web app, emulators off). Playwright runs against the local emulators, so
            # the bundle it loads has to be rebuilt in mode e2e (tracked web/.env.e2e) or the
            # shell signs in against real Firebase and the front server rejects the token.
            npm run build:e2e
            Invoke-Native 'web e2e build'
            npx playwright test
            Invoke-Native 'e2e (playwright)'
        } finally {
            Pop-Location
            $env:ENGINE_MANAGEMENT_SECRET = $priorMgmtSecret
        }
    } finally {
        Stop-ProcessTree $stack
        $env:WEB_DIST = $priorWebDist
    }
} finally {
    Stop-ProcessTree $e2eEmu
}

Write-Host "`nverify passed"
