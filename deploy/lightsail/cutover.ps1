#Requires -RunAsAdministrator
<#
deploy/lightsail/cutover.ps1 -- point osrs.scotho.com at the Lightsail stack.
  1. require the box's front server to meet the release gate (common.ps1's Get-HealthGaps)
  2. start the box's cloudflared connector (compose profile "public")
  3. stop + disable this PC's idlescape-tunnel task and cloudflared service, if present, so
     only one connector with one ingress serves the tunnel
  4. poll https://osrs.scotho.com/api/health until it meets that same gate, not "engine":"up" alone
Elevated because step 3 manages scheduled tasks/services. Does not touch idlescape-live-engine.
#>
[CmdletBinding()]
param(
  [string]$InstanceName = 'idlescape',
  [string]$Region = 'ca-central-1',
  [string]$Profile = 'idlescape',
  [string]$KeyFile = (Join-Path $HOME '.ssh\idlescape-lightsail'),
  [string]$PublicOrigin = 'https://osrs.scotho.com'
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$ip = Get-BoxIp

$health = Wait-RemoteHealth -Ip $ip -TimeoutSec 60
Write-Host "box healthy: $health"

Invoke-Ssh -Ip $ip -Command 'bash /opt/idlescape/src/deploy/lightsail/box/public.sh' | Write-Host

$task = Get-ScheduledTask -TaskName 'idlescape-tunnel' -ErrorAction SilentlyContinue
if ($task) {
  Stop-ScheduledTask -TaskName 'idlescape-tunnel'
  Disable-ScheduledTask -TaskName 'idlescape-tunnel' | Out-Null
  Write-Host 'stopped + disabled PC task idlescape-tunnel'
}
$svc = Get-Service -Name 'cloudflared' -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq 'Running') {
  Stop-Service -Name 'cloudflared'
  Set-Service -Name 'cloudflared' -StartupType Disabled
  Write-Host 'stopped + disabled PC service cloudflared'
}

# The public probe is held to the SAME gate as the box probe above (common.ps1's Get-HealthGaps),
# not to `"engine":"up"` alone. That field is a HEAD /rs2.cgi probe and reported green for months
# against a stack with no engine overlay, an unreachable management link and no wiki database
# (audit C07 and C09, decision D75). This is the only check in the release path that runs against
# the public hostname, so it is the last place a stock-shaped health response could read as
# success.
$deadline = (Get-Date).AddMinutes(3)
$gaps = @('no public health response yet')
do {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$PublicOrigin/api/health" -TimeoutSec 10
    $gaps = @(Get-HealthGaps -Body $r.Content)
    if ($gaps.Count -eq 0) { Write-Host "public: $($r.Content)"; return }
    Write-Host "  public still missing $($gaps -join '; '): $($r.Content)"
  } catch { Write-Host "  public not ready: $($_.Exception.Message)" }
  Start-Sleep -Seconds 10
} while ((Get-Date) -lt $deadline)
throw "$PublicOrigin did not meet the release gate within 3 minutes; still missing: $($gaps -join '; '); check box/logs.sh and the Cloudflare tunnel connectors"
