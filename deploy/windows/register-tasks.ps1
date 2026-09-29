#Requires -RunAsAdministrator
#
# deploy/windows/register-tasks.ps1 — register the REAL product as two Scheduled Tasks:
#   idlescape-engine  : the 274 engine, Node 24 + tsx  (`npx tsx src/app.ts` in engine/server)
#   idlescape-server  : the front server, Bun          (`bun run src/index.ts` in server/)
#
# This SUPERSEDES the separate live-PoC tasks (`idlescape-live-engine`, a raw 225 engine on
# port 8888, and `idlescape-tunnel`, its tunnel) that this machine may still be running.
# Registering these product tasks does NOT touch the PoC tasks in any way — they are a
# different pair of task names with their own working directories and ports. Cutting the
# public tunnel over from the PoC to the product (Task 4 below, deploy/windows/install-tunnel.ps1)
# and retiring the PoC tasks are separate, deliberate operator actions, done later, once this
# stack has been verified locally on its own ports.
#
# This script is AUTHORED for the operator to run manually, as Administrator, at deploy time.
# It is not run as part of authoring it, and it must never be invoked from an unattended CI
# step — deploy is a deliberate, gated action taken by a human with the console in front of
# them (see README.md "Deploy (this PC)").
#
# Before running this for the first time:
#   - `npm run build` must have produced web/dist and client/out (Task 15's build.ps1).
#   - server/.env must exist with production values. There is no template for these in the repo on
#     purpose (audit C17): deploy/lightsail/provision.ps1 GENERATES the box's secrets/server.env,
#     including both 48-character engine secrets, and deploy/docker/.env.example documents the
#     compose side. Anything hand-copied drifts from the generator within one release.
#   - engine/server/data/config/world.json's `web.allowedOrigin` must already be
#     "https://osrs.scotho.com" (see README.md "Deploy: origin configuration").
#   - Any manual/dev instances of the engine or front server on these same ports (8899, 8787)
#     must already be stopped so the ports are free.
#
# Idempotent: re-running replaces (`-Force`) both task definitions without touching the PoC.

$ErrorActionPreference = 'Stop'

$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null

function Get-Bun {
    # SYSTEM's PATH does not include the interactively-installed `%USERPROFILE%\.bun\bin`, so
    # the front server task needs bun's absolute path baked into its Action — matching the
    # resolution scripts/build.ps1 already uses (Get-Command first, then the default install
    # location) so this script behaves the same way regardless of which account installed bun.
    $cmd = Get-Command bun -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $fallback = Join-Path $env:USERPROFILE '.bun\bin\bun.exe'
    if (Test-Path $fallback) { return $fallback }
    throw 'bun not found on PATH or at ~/.bun/bin/bun.exe -- install bun before registering idlescape-server.'
}

$bun = Get-Bun
Write-Host "Using bun: $bun"
Write-Host "Using root: $root"

$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
$trigger = New-ScheduledTaskTrigger -AtStartup

# --- idlescape-engine: 274 engine, Node 24 + tsx (NOT bun -- see README "How it fits
# together"). Routed through cmd.exe /c: Task Scheduler's action resolution for a bare "npx"
# has the same PATHEXT problem start-stack.ps1 hit with Start-Process (npx resolves to a
# .ps1/.cmd shim, not a directly-executable .exe); cmd.exe /c does the right resolution and
# finds npx.cmd on the system-wide Node install's PATH entry, which SYSTEM does have (Node was
# installed system-wide at C:\Program Files\nodejs, unlike bun's per-user install).
$engineLog = Join-Path $logDir 'engine.log'
$engineAction = New-ScheduledTaskAction -Execute 'cmd.exe' `
    -Argument "/c `"npx tsx src/app.ts >> `"$engineLog`" 2>&1`"" `
    -WorkingDirectory (Join-Path $root 'engine\server')
Register-ScheduledTask -TaskName 'idlescape-engine' -Action $engineAction -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Host "registered idlescape-engine (npx tsx src/app.ts, engine\server, logs\engine.log)"

# --- idlescape-server: Bun front server, proxies to the engine and serves web/dist + client/out.
$serverLog = Join-Path $logDir 'server.log'
$serverAction = New-ScheduledTaskAction -Execute 'cmd.exe' `
    -Argument "/c `"`"$bun`" run src/index.ts >> `"$serverLog`" 2>&1`"" `
    -WorkingDirectory (Join-Path $root 'server')
Register-ScheduledTask -TaskName 'idlescape-server' -Action $serverAction -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Host "registered idlescape-server (bun run src/index.ts, server\, logs\server.log)"

Start-ScheduledTask -TaskName 'idlescape-engine'
Write-Host "started idlescape-engine; waiting for the world to load before starting the front server..."
Start-Sleep 5
Start-ScheduledTask -TaskName 'idlescape-server'

Write-Host ""
Write-Host "tasks registered and started; logs in $logDir"
Write-Host "verify: Get-ScheduledTask idlescape-* | Select TaskName, State   (expect Running)"
Write-Host "        curl http://localhost:8787/api/health                     (expect engine: up"
Write-Host "                                                                   once the world finishes loading)"
Write-Host ""
Write-Host "The live PoC tasks (idlescape-live-engine, idlescape-tunnel) are untouched by"
Write-Host "this script and keep running on their own ports until an operator retires them."
