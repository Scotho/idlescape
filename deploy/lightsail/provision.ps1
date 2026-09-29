<#
deploy/lightsail/provision.ps1 -- create (or reuse) the idlescape Lightsail box and push its secrets.

Idempotent by instance name. First run creates the instance from user-data.sh, attaches a static
IP, restricts the firewall to SSH, waits for cloud-init, then copies:
  server.env               (generated production env for the front server)
  firebase-admin.json      (server/secrets/firebase-admin.json)
  tunnel-credentials.json  (%USERPROFILE%\.cloudflared\<tunnel id>.json)
into /opt/idlescape/secrets on the box. Re-running with -SecretsOnly just re-pushes those
(note: that regenerates OWNER_ASSERTION_SECRET and ENGINE_MANAGEMENT_SECRET, so every assertion a
logged-in session is holding stops verifying and both containers must be restarted together).

server.env is the single source of truth for the two secrets the front server and the ENGINE
share: deploy/docker/docker-compose.yml env_files this same file into both services, so neither
value is ever a literal in this repo and the two halves cannot disagree. Container topology
(ENGINE_HTTP/WS, ENGINE_MANAGEMENT_HTTP, IDLESCAPE_MANAGEMENT_HOST, IDLESCAPE_HOOK_URL,
IDLESCAPE_BANK_DIR) is NOT written here: the compose file sets it and overrides this file.

  .\deploy\lightsail\provision.ps1
#>
[CmdletBinding()]
param(
  [string]$InstanceName = 'idlescape',
  [string]$Bundle = 'small_3_0',
  [string]$Blueprint = 'ubuntu_24_04',
  [string]$Zone = 'ca-central-1a',
  [string]$Region = 'ca-central-1',
  [string]$Profile = 'idlescape',
  [string]$KeyPairName = 'idlescape-lightsail',
  [string]$KeyFile = (Join-Path $HOME '.ssh\idlescape-lightsail'),
  [string]$TunnelId = '00000000-0000-0000-0000-000000000000',
  [string]$PublicOrigin = 'https://osrs.scotho.com',
  [string]$FirebaseProjectId = 'idlescape-osrs',
  [switch]$SecretsOnly
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$firebaseKey = Join-Path $RepoRoot 'server\secrets\firebase-admin.json'
$tunnelCreds = Join-Path $HOME ".cloudflared\$TunnelId.json"
foreach ($f in @($KeyFile, "$KeyFile.pub", $firebaseKey, $tunnelCreds)) {
  if (-not (Test-Path $f)) { throw "missing required file: $f" }
}

if (-not $SecretsOnly) {
  $existing = $null
  try { $existing = Invoke-Aws lightsail get-instance --instance-name $InstanceName } catch { $existing = $null }
  if ($existing) {
    Write-Host "instance $InstanceName exists (state $($existing.instance.state.name)); skipping create"
  } else {
    $userData = (Get-Content (Join-Path $PSScriptRoot 'user-data.sh') -Raw) -replace "`r`n", "`n"
    Write-Host "creating $InstanceName ($Bundle, $Blueprint, $Zone)"
    Invoke-Aws lightsail create-instances --instance-names $InstanceName --availability-zone $Zone `
      --blueprint-id $Blueprint --bundle-id $Bundle --key-pair-name $KeyPairName --user-data $userData | Out-Null
  }

  do {
    Start-Sleep -Seconds 10
    $state = (Invoke-Aws lightsail get-instance-state --instance-name $InstanceName).state.name
    Write-Host "  state: $state"
  } while ($state -ne 'running')

  $staticName = "$InstanceName-ip"
  $ips = Invoke-Aws lightsail get-static-ips
  $static = $ips.staticIps | Where-Object { $_.name -eq $staticName }
  if (-not $static) {
    Invoke-Aws lightsail allocate-static-ip --static-ip-name $staticName | Out-Null
    $static = (Invoke-Aws lightsail get-static-ip --static-ip-name $staticName).staticIp
  }
  if (-not $static.isAttached) {
    Invoke-Aws lightsail attach-static-ip --static-ip-name $staticName --instance-name $InstanceName | Out-Null
  }

  # SSH only. cloudflared dials out, so nothing else needs to be reachable.
  Invoke-Aws lightsail put-instance-public-ports --instance-name $InstanceName `
    --port-infos 'fromPort=22,toPort=22,protocol=tcp' | Out-Null
}

$ip = Get-BoxIp
Write-Host "box: ubuntu@$ip"

Write-Host 'waiting for ssh + cloud-init'
$deadline = (Get-Date).AddMinutes(10)
$ok = $null
do {
  $ok = Invoke-Ssh -Ip $ip -Command 'test -f /opt/idlescape/.bootstrap-done && echo ready' -AllowFailure
  if ($ok -match 'ready') { break }
  Start-Sleep -Seconds 15
} while ((Get-Date) -lt $deadline)
if ($ok -notmatch 'ready') { throw 'box did not finish bootstrap within 10 minutes' }

# Get-Random -Count samples WITHOUT replacement, so Length can never exceed the 62-character
# alphabet below.
function New-BoxSecret {
  param([int]$Length)
  return -join ((48..57 + 65..90 + 97..122) | Get-Random -Count $Length | ForEach-Object { [char]$_ })
}

# The engine half of the overlay reads these two out of this same file (see the header, and
# deploy/docker/docker-compose.yml's engine service). server/src/env.ts refuses either one at
# boot below 32 characters, and engine-custom/src/idlescape/config.ts refuses to start a
# production world with an empty OWNER_ASSERTION_SECRET, so an absent value fails loudly rather
# than verifying every owner assertion against "". Audit C07 and C17.
$ownerAssertionSecret = New-BoxSecret -Length 48
$engineManagementSecret = New-BoxSecret -Length 48
# The keys server/.env.example documents that this file deliberately does NOT write, because
# deploy/docker/docker-compose.yml sets them on the container or server/src/env.ts's default is
# already correct inside it. server/src/env.test.ts asserts that this line plus the array below
# covers server/.env.example exactly, so a newly required key cannot be added to the template and
# silently omitted from every box (audit C17).
# NOT-WRITTEN: CLIENT_OUT ENGINE_HTTP ENGINE_MANAGEMENT_HTTP ENGINE_PUBLIC ENGINE_WS GOOGLE_APPLICATION_CREDENTIALS WEB_DIST WIKI_DB
$serverEnv = @(
  'PORT=8787',
  "OWNER_ASSERTION_SECRET=$ownerAssertionSecret",
  "ENGINE_MANAGEMENT_SECRET=$engineManagementSecret",
  "FIREBASE_PROJECT_ID=$FirebaseProjectId",
  'FIREBASE_EMULATORS=false',
  "PUBLIC_ORIGIN=$PublicOrigin"
) -join "`n"
$tmp = Join-Path $env:TEMP 'idlescape-server.env'
Write-Lf -Path $tmp -Text ($serverEnv + "`n")

Copy-ToBox -Ip $ip -Local $tmp -Remote /opt/idlescape/secrets/server.env
Copy-ToBox -Ip $ip -Local $firebaseKey -Remote /opt/idlescape/secrets/firebase-admin.json
Copy-ToBox -Ip $ip -Local $tunnelCreds -Remote /opt/idlescape/secrets/tunnel-credentials.json
# The secrets directory itself is 700. The tunnel credentials must be world-readable inside it
# because the cloudflare/cloudflared image runs as a non-root user (uid 65532) and reads the
# bind-mounted file with its own uid; the other two are read by root inside their containers.
Invoke-Ssh -Ip $ip -Command 'chmod 600 /opt/idlescape/secrets/server.env /opt/idlescape/secrets/firebase-admin.json && chmod 644 /opt/idlescape/secrets/tunnel-credentials.json' | Out-Null
Remove-Item $tmp -Force

Write-Host 'provisioned. next: .\deploy\lightsail\release.ps1'
