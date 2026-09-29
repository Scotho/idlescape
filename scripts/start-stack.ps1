# Local dev stack: emulators, engine (274, Node/tsx), client build, front server, vite dev.
#
# IMPORTANT ordering: the client bundle is built AFTER the dev engine is up (the engine's
# BUILD_STARTUP step regenerates its own public/client, and if client/out is absent the front
# server falls back to the engine's hookless client). Order here: emulators -> engine ->
# (wait for it) -> build client -> front server -> vite dev.
#
# -Prod skips emulators and vite dev (front server serves the built web/dist instead).
param([switch]$Prod, [switch]$DevStaff)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$bun = "$env:USERPROFILE\.bun\bin\bun.exe"
New-Item -ItemType Directory -Force "$root\logs" | Out-Null

$procs = @()

# A native command's non-zero exit does NOT throw under $ErrorActionPreference = 'Stop', and a
# .ps1 invoked with `&` that runs `exit 1` sets $LASTEXITCODE without throwing either. This file
# made three such calls and read none of them, so an overlay that refused to apply, or a client
# build that failed, started the stack anyway. Audit C23.
function Invoke-Native {
    param([string]$Description)
    if ($LASTEXITCODE -ne 0) { throw "$Description failed (exit $LASTEXITCODE)" }
}

# Ruling R16. Ask for a clean close first and escalate only if it is ignored. `taskkill /T /F` is
# TerminateProcess: the engine's safeExit never runs and the owner-bank flush, which runs every 100
# ticks, is skipped, so up to about 60 seconds of bank state is discarded. Audit C23 named this at
# start-stack.ps1 and verify.ps1 both.
#
# `taskkill /T` on a windowless console child REFUSES it ("can only be terminated forcefully (with
# /F option)"), writes that to stderr and exits 128, and under $ErrorActionPreference = 'Stop' a
# native command's stderr is a terminating error even with `*> $null` -- hence the per-call catch
# and the local 'Continue'. Because a refusal is visible in the exit code, the five second wait is
# spent only when at least one ask was accepted; when every one is refused the escalation is
# immediate and costs nothing. Measured on this machine on 2026-09-08: the engine refuses.
#
# It is defined here, above the FIRST Start-Process, because the try below wants it in scope from
# the first tracked process onwards; it reads $procs from this scope at call time, so it sees
# whatever has been appended by the time it runs.
function Stop-Tracked {
  $prior = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $accepted = 0
    foreach ($p in $procs) {
      try {
        if (-not $p.HasExited) {
          $global:LASTEXITCODE = 0
          & taskkill /PID $p.Id /T *> $null
          if ($LASTEXITCODE -eq 0) { $accepted = $accepted + 1 }
        }
      } catch {}
    }
    if ($accepted -gt 0) {
      $wait = (Get-Date).AddSeconds(5)
      do {
        $alive = @($procs | Where-Object { try { -not $_.HasExited } catch { $false } })
        if ($alive.Count -eq 0) { break }
        Start-Sleep -Milliseconds 250
      } until ((Get-Date) -gt $wait)
    }
    foreach ($p in $procs) { try { if (-not $p.HasExited) { & taskkill /PID $p.Id /T /F *> $null } } catch {} }
  } finally { $ErrorActionPreference = $prior }
}

# Before either overlay, because both -Check implementations resolve the CLONE's own HEAD: on a
# stale clone every recorded hash agrees with the blob it was taken from, so the drift checks pass
# vacuously and the stack comes up on the wrong revision. Audit C23.
. (Join-Path $PSScriptRoot 'lib\UpstreamLock.ps1')
Assert-LockParsing
Assert-ClonePins -Root $root

# Custom content overlay: content-custom/** over engine/content/, before the engine starts so
# its content watcher sees a consistent tree from the first pack. Guarded in case the script
# is ever absent.
$overlay = Join-Path $root 'scripts\content-overlay.ps1'
if (Test-Path $overlay) {
  Write-Host "== running content overlay"
  & $overlay
  Invoke-Native 'content overlay'
} else {
  Write-Host "== scripts/content-overlay.ps1 not present, skipping overlay"
}

# Custom engine overlay: engine-custom/** over engine/server/, after the checkout so the
# clone is pristine underneath it. Guarded in case the script is ever absent.
$engineOverlay = Join-Path $root 'scripts\engine-overlay.ps1'
if (Test-Path $engineOverlay) {
  Write-Host "== running engine overlay"
  & $engineOverlay
  Invoke-Native 'engine overlay'
} else {
  Write-Host "== scripts/engine-overlay.ps1 not present, skipping engine overlay"
}

# Everything from here to the last Start-Process runs inside a try, and the catch stops every
# tracked process before rethrowing. Not decoration: the client build below throws on a non-zero
# exit, and before this wrapper that throw ended the script with the engine still holding 8899 and,
# in dev mode, the emulators still holding 9099 and 8080, orphaned and tracked by nothing. Under
# verify.ps1 step 10 it is worse, because this script IS the child powershell verify tracks, so
# once it dies verify's own Stop-ProcessTree reaches the dead wrapper and nothing else. The wrapper
# is what makes that true of every future throw in the region as well, rather than of the ones
# somebody remembered.
try {
  # Routed through cmd.exe /c: on this machine (and any install where npm/npx resolve to the
  # .ps1 shim rather than .cmd) Start-Process's direct CreateProcess call on a bare "npm"/"npx"
  # fails with "is not a valid Win32 application" -- Start-Process does not do PATHEXT-style
  # resolution the way the `&` call operator or a real shell does. cmd.exe /c does that
  # resolution correctly and finds npm.cmd/npx.cmd regardless of which shim is first on PATH.
  if (-not $Prod) {
    $procs += Start-Process -PassThru -NoNewWindow -WorkingDirectory "$root\firebase" -FilePath "cmd.exe" -ArgumentList "/c","npm","run","emulators" -RedirectStandardOutput "$root\logs\emulators.log"
  }

  # The engine reads OWNER_ASSERTION_SECRET and ENGINE_MANAGEMENT_SECRET from its process env
  # (see engine-custom/src/idlescape/config.ts); server/.env is the single source of truth for
  # both, so the front server and the engine can never disagree about either value. An absent
  # ENGINE_MANAGEMENT_SECRET leaves the engine's owner-bank management routes unregistered.
  $serverEnv = Join-Path $root 'server\.env'
  if (Test-Path $serverEnv) {
    foreach ($key in @('OWNER_ASSERTION_SECRET', 'ENGINE_MANAGEMENT_SECRET')) {
      $line = Select-String -LiteralPath $serverEnv -Pattern "^$key=" | Select-Object -First 1
      if ($line) { Set-Item -Path "env:$key" -Value (($line.Line -replace "^$key=", '').Trim('"').Trim("'")) }
    }
  }
  $env:IDLESCAPE_HOOK_URL = 'http://127.0.0.1:8787/internal/bank-changed'
  # Dev only: `::give`, `::setstat` and `::tele` need staffmodlevel 4, which
  # engine-custom/src/idlescape/staff.ts grants only from this variable and only when the engine
  # is not in production mode. verify.ps1 passes -Prod -DevStaff so the e2e harness can seed a
  # character without playing it to a pickaxe; a deployed world forces devStaffLevel to 0.
  if ((-not $Prod) -or $DevStaff) { $env:IDLESCAPE_DEV_STAFF = '4' }

  # 274 engine runs under Node via tsx, not `bun run src/app.ts`.
  #
  # Stderr goes to its own log rather than to whatever console started this script. An engine that
  # dies before "World ready" says WHY on stderr (a Node stack, `EADDRINUSE`, a tsx resolution
  # failure), and under verify.ps1 that stream was landing in logs/verify-stack.err.log mixed with
  # PowerShell's own error records. The throw below names this file, so the reason is one `cat` away.
  $engineProc = Start-Process -PassThru -NoNewWindow -WorkingDirectory "$root\engine\server" -FilePath "cmd.exe" -ArgumentList "/c","npx","tsx","src/app.ts" -RedirectStandardOutput "$root\logs\engine.log" -RedirectStandardError "$root\logs\engine.err.log"
  $procs += $engineProc

  Write-Host "waiting for the engine to come up (first run packs the cache, ~7 min)..."
  $deadline = (Get-Date).AddMinutes(10)
  $engineUp = $false
  do {
    Start-Sleep 3
    # HasExited, not only the log: a crash in the first three seconds used to be waited on for ten
    # minutes and then warned about. app.ts's packAll path exits 1 on a pack-id violation, and this
    # is the only place that would ever see it.
    if ($engineProc.HasExited) {
      # The exit code is asked for and very often is not there. Measured on 2026-09-08, on Windows
      # PowerShell 5.1: the object `Start-Process -PassThru` returns answers HasExited correctly and
      # answers ExitCode as EMPTY, before and after WaitForExit() and Refresh(), for a process that
      # really did exit 1. So the code is reported when the host gives one and the word "unknown"
      # when it does not, rather than printing "code  " and reading as a truncated message. The
      # stderr log below is what actually carries the reason.
      $code = 'unknown'
      try { $engineProc.WaitForExit() } catch {}
      try { if ($null -ne $engineProc.ExitCode) { $code = $engineProc.ExitCode } } catch {}
      throw "the engine exited (code $code) before reporting 'World ready'. The reason is in logs/engine.err.log; logs/engine.log has whatever it managed to print first. A pack-id violation exits 1 from src/app.ts."
    }
    if (Test-Path "$root\logs\engine.log") {
      $log = Get-Content "$root\logs\engine.log" -Raw -ErrorAction SilentlyContinue
      if ($log -and $log -match 'World ready') { $engineUp = $true }
    }
  } until ($engineUp -or (Get-Date) -gt $deadline)
  if (-not $engineUp) {
    # This used to print "continuing anyway" and start the front server on a dead world. It is false
    # green 2 in docs/VERIFICATION.md, and nothing below this line can work without the engine.
    throw "the engine did not report 'World ready' within 10 minutes. See logs/engine.log and logs/engine.err.log."
  }

  # Build the client bundle now that the engine (and its content pack) is up.
  Push-Location "$root\client"
  & $bun run build:dev
  Pop-Location
  # After Pop-Location so a failing build still leaves the location stack balanced; Pop-Location is a
  # cmdlet and does not touch $LASTEXITCODE.
  Invoke-Native 'client build:dev'

  $procs += Start-Process -PassThru -NoNewWindow -WorkingDirectory "$root\server" -FilePath $bun -ArgumentList "run","src/index.ts" -RedirectStandardOutput "$root\logs\server.log"

  if (-not $Prod) {
    $procs += Start-Process -PassThru -NoNewWindow -WorkingDirectory "$root\web" -FilePath "cmd.exe" -ArgumentList "/c","npm","run","dev" -RedirectStandardOutput "$root\logs\web.log"
    Write-Host "dev: http://localhost:5173  (front server http://localhost:8787, engine http://localhost:8899)"
  } else {
    Write-Host "prod: http://localhost:8787"
  }
} catch {
  Stop-Tracked
  throw
}

Write-Host "logs in $root\logs. Ctrl+C stops everything."
# taskkill /T (not Stop-Process) on every tracked pid: several of these are cmd.exe wrapping a
# real child (npm.cmd/npx.cmd -> node.exe) per the routing above, and killing just the wrapper
# would orphan the node process underneath it. Stop-Tracked asks with /T and escalates to /T /F
# after five seconds (ruling R16), so Ctrl+C, which is how a local session ends, gives the engine's
# safeExit and its owner-bank flush the chance to run instead of being terminated mid-tick.
try { Wait-Process -Id ($procs | ForEach-Object Id) } finally { Stop-Tracked }
