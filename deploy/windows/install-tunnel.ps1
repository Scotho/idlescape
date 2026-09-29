#Requires -RunAsAdministrator
#
# deploy/windows/install-tunnel.ps1 — install cloudflared as a Windows service, routing the
# existing `idlescape` tunnel's public hostname (osrs.scotho.com) to the product's front
# server at http://localhost:8787.
#
# This SUPERSEDES the live PoC's tunnel, which currently runs as the `idlescape-tunnel`
# Scheduled Task (`cloudflared tunnel run idlescape`, ingress -> http://localhost:8888, the
# raw 225 engine) rather than as a service. The tunnel itself (id
# 00000000-0000-0000-0000-000000000000, name `idlescape`) and the zone cert already exist --
# created for the PoC via `cloudflared tunnel login` + `cloudflared tunnel create idlescape`
# -- and are reused here, not recreated. This script only changes *where the tunnel points*
# (ingress) and *how it runs* (service vs. scheduled task).
#
# IMPORTANT / cutover ordering: a Cloudflare Tunnel can have more than one connector running
# concurrently (that's how cloudflared does HA), but every connector for the same tunnel id
# should be running the SAME ingress config -- the PoC's task currently runs the same tunnel id
# with ingress -> :8888. Starting the `cloudflared` service from this script while the
# `idlescape-tunnel` task is still running the old ingress -> :8888 config means two
# connectors for the same hostname disagree about where to send traffic, so requests to
# osrs.scotho.com will unpredictably land on the PoC (8888) or the product (8787) depending on
# which connector Cloudflare's edge picks. The operator MUST stop the `idlescape-tunnel`
# scheduled task (`Stop-ScheduledTask -TaskName idlescape-tunnel`) as part of the same cutover
# window before or immediately after starting this service -- do not run both indefinitely.
#
# This script is AUTHORED for the operator to run manually, as Administrator, at deploy time,
# once deploy/windows/register-tasks.ps1's tasks are confirmed healthy on localhost:8787. It is
# not run as part of authoring it.
#
# Prerequisite (already true on this machine, from the PoC setup): the zone cert exists at
# $env:USERPROFILE\.cloudflared\cert.pem (from `cloudflared tunnel login`), and the tunnel
# `idlescape` already exists with its credentials JSON alongside it.

$ErrorActionPreference = 'Stop'

$cf = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (-not (Test-Path $cf)) { throw "cloudflared.exe not found at $cf -- install cloudflared before running this script." }

$name = 'idlescape'
$hostname = 'osrs.scotho.com'
$userDir = "$env:USERPROFILE\.cloudflared"
$sysDir = "C:\Windows\System32\config\systemprofile\.cloudflared"

$existing = (& $cf tunnel list --output json | ConvertFrom-Json) | Where-Object { $_.name -eq $name }
if (-not $existing) {
    Write-Host "tunnel '$name' not found; creating it (expected it to already exist from the PoC setup)"
    & $cf tunnel create $name | Out-Null
    $existing = (& $cf tunnel list --output json | ConvertFrom-Json) | Where-Object { $_.name -eq $name }
}
$id = $existing.id
Write-Host "tunnel $name id $id"

# Point the hostname's DNS record at this tunnel (idempotent -- overwrites any existing CNAME
# for osrs.scotho.com, which today points at this same tunnel id since the PoC uses it too).
& $cf tunnel route dns --overwrite-dns $name $hostname

# The cloudflared service runs as SYSTEM and reads its config from the systemprofile's
# .cloudflared directory, not the interactive user's -- so the credentials, cert, and rendered
# config are copied there. Never committed (see .gitignore / README "Deploy").
New-Item -ItemType Directory -Force $sysDir | Out-Null
Copy-Item "$userDir\$id.json" "$sysDir\$id.json" -Force
Copy-Item "$userDir\cert.pem" "$sysDir\cert.pem" -Force

$templatePath = Join-Path $PSScriptRoot '..\cloudflared\config.yml.template'
$config = (Get-Content $templatePath -Raw).
    Replace('__TUNNEL_ID__', $id).
    Replace('__CREDENTIALS_FILE__', "$sysDir\$id.json")
Set-Content -Encoding ascii "$sysDir\config.yml" $config
Write-Host "wrote $sysDir\config.yml (ingress: $hostname -> http://localhost:8787)"

if (Get-Service cloudflared -ErrorAction SilentlyContinue) {
    Write-Host "cloudflared service already installed; reinstalling to pick up the new config"
    & $cf service uninstall
    Start-Sleep 2
}
& $cf service install
Start-Service cloudflared
Start-Sleep 5
Get-Service cloudflared | Select-Object Status

Write-Host ""
Write-Host "https://$hostname should now reach the front server, once idlescape-tunnel (the"
Write-Host "PoC's scheduled task) is stopped -- see the cutover-ordering note at the top of this"
Write-Host "script. It is NOT stopped automatically by this script."
