<#
deploy/lightsail/preview.ps1 -- open the not-yet-public stack in a local browser.
Starts a socat sidecar on the box (box/preview.sh) and an ssh port-forward, then blocks;
Ctrl+C ends the forward. Run again with -Stop to remove the sidecar.
  http://localhost:18787
#>
[CmdletBinding()]
param(
  [string]$InstanceName = 'idlescape',
  [string]$Region = 'ca-central-1',
  [string]$Profile = 'idlescape',
  [string]$KeyFile = (Join-Path $HOME '.ssh\idlescape-lightsail'),
  [int]$LocalPort = 18787,
  [switch]$Stop
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$ip = Get-BoxIp
if ($Stop) { Invoke-Ssh -Ip $ip -Command 'bash /opt/idlescape/src/deploy/lightsail/box/preview.sh stop' | Write-Host; return }
Invoke-Ssh -Ip $ip -Command 'bash /opt/idlescape/src/deploy/lightsail/box/preview.sh' | Write-Host
Write-Host "forwarding http://localhost:$LocalPort -> box:18787 (Ctrl+C to stop)"
& ssh @SshOpts -N -L "${LocalPort}:127.0.0.1:18787" "ubuntu@$ip"
