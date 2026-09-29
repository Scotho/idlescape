# deploy/lightsail/common.ps1 -- helpers dot-sourced by provision/release/preview/cutover.
# Callers define $Region, $Profile, $InstanceName, $KeyFile before dot-sourcing.
$awsDir = Join-Path $env:LOCALAPPDATA 'Programs\Amazon\AWSCLIV2'
if (Test-Path $awsDir) { $env:PATH = "$awsDir;$env:PATH" }
$env:PYTHONUTF8 = '1'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$SshOpts = @('-i', $KeyFile, '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=15', '-o', 'BatchMode=yes', '-o', 'LogLevel=ERROR')

# Windows PowerShell 5.1 turns a native command's stderr into terminating errors when
# $ErrorActionPreference is Stop and output is redirected. Run natives with it relaxed and judge
# by exit code instead.
function Invoke-Native {
  param([scriptblock]$Block)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $Block } finally { $ErrorActionPreference = $prev }
}

function Invoke-Aws {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$AwsArgs)
  $out = Invoke-Native { & aws @AwsArgs --region $Region --profile $Profile --output json }
  if ($LASTEXITCODE -ne 0) { throw "aws $($AwsArgs -join ' ') failed with exit $LASTEXITCODE" }
  if ($out) { return ($out -join "`n") | ConvertFrom-Json }
}

function Get-BoxIp {
  $inst = Invoke-Aws lightsail get-instance --instance-name $InstanceName
  if (-not $inst.instance.publicIpAddress) { throw "instance $InstanceName has no public IP (state: $($inst.instance.state.name))" }
  return $inst.instance.publicIpAddress
}

function Invoke-Ssh {
  param([string]$Ip, [string]$Command, [switch]$AllowFailure)
  $out = Invoke-Native { & ssh @SshOpts "ubuntu@$Ip" $Command }
  if ($LASTEXITCODE -ne 0 -and -not $AllowFailure) { throw "ssh failed ($LASTEXITCODE): $Command" }
  return $out
}

function Copy-ToBox {
  param([string]$Ip, [string]$Local, [string]$Remote)
  Invoke-Native { & scp @SshOpts -q $Local "ubuntu@${Ip}:$Remote" } | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "scp $Local -> $Remote failed ($LASTEXITCODE)" }
}

function Write-Lf {
  param([string]$Path, [string]$Text)
  [IO.File]::WriteAllText($Path, ($Text -replace "`r`n", "`n"), (New-Object System.Text.UTF8Encoding($false)))
}

# The release gate. `"engine":"up"` alone is a probe of /rs2.cgi and nothing else, which is how
# audit C07 stayed invisible: every gate in this directory reported green while the front server
# talked to no management port at all. Three more fields from server/src/health.ts and
# HealthSnapshot (server/src/types.ts) close the part a health response can close:
#
#   players  is a NUMBER only when the front server actually reached the ENGINE's management port
#            (/prometheus, the upstream lostcity_active_players gauge, at ENGINE_MANAGEMENT_HTTP).
#            That is the seam C07 found pointing at loopback inside the server container. It is
#            also what proves IDLESCAPE_MANAGEMENT_HOST is set, because the overlay NARROWS the
#            management bind to 127.0.0.1 by default where upstream 274 binds 0.0.0.0.
#   wiki     is "up" only when the wiki database is present in the server image (audit C09).
#   management is "up" only when the engine answers ITS OWN secret-gated route, GET /owner/health,
#            which upstream 274 does not have. One green field therefore proves three things at
#            once: the running image carries engine-custom, ENGINE_MANAGEMENT_HTTP reaches the
#            engine, and both halves hold the same ENGINE_MANAGEMENT_SECRET. This closes the hole
#            decision D75 named: players proves the management PORT is reachable, but upstream
#            binds that port itself, so it was never proof of the overlay.
#
# All three are checked for their real values, never for the key merely being present:
# `"players":null`, `"wiki":"missing"` and `"management":"unconfigured"` are what a broken release
# actually returns.
#
# What the four fields together still cannot see is listed in this directory's README.md, under
# "What the release gate still cannot see", and in docs/VERIFICATION.md's tier 3.
function Get-HealthGaps {
  param([string]$Body)
  $gaps = @()
  if ($Body -notmatch '"engine"\s*:\s*"up"') { $gaps += 'engine up' }
  if ($Body -notmatch '"players"\s*:\s*\d+') { $gaps += 'players (front server cannot reach the engine management port: ENGINE_MANAGEMENT_HTTP or IDLESCAPE_MANAGEMENT_HOST unset)' }
  if ($Body -notmatch '"wiki"\s*:\s*"up"') { $gaps += 'wiki (no wiki database in the server image)' }
  if ($Body -notmatch '"management"\s*:\s*"up"') { $gaps += 'management (the running engine image is not carrying engine-custom, or the two halves hold different ENGINE_MANAGEMENT_SECRETs, or the front server cannot reach the management port; "unconfigured" means the front server has no secret at all)' }
  return $gaps
}

function Wait-RemoteHealth {
  param([string]$Ip, [int]$TimeoutSec = 600)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $gaps = @('no health response yet')
  do {
    $json = Invoke-Ssh -Ip $Ip -Command 'bash /opt/idlescape/src/deploy/lightsail/box/health.sh' -AllowFailure
    $body = ($json -join '')
    $gaps = @(Get-HealthGaps -Body $body)
    if ($gaps.Count -eq 0) { return $body }
    Write-Host "  waiting for $($gaps -join '; '): $($body -replace '\s+', ' ')"
    Start-Sleep -Seconds 15
  } while ((Get-Date) -lt $deadline)
  Invoke-Ssh -Ip $Ip -Command 'bash /opt/idlescape/src/deploy/lightsail/box/logs.sh 40' -AllowFailure | Write-Host
  throw "release gate not met within $TimeoutSec s; still missing: $($gaps -join '; ')"
}
