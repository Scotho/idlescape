<#
deploy/lightsail/release.ps1 -- ship HEAD of this repo to the Lightsail box and bring it up.

  1. refuse if tracked files have uncommitted changes (HEAD is what ships; -Force overrides),
     and name them again, loudly, just before the archive is cut - any of them under deploy/
     refuses the release on its own, because the box reads those files directly. That second
     refusal is NOT covered by -Force; its own opt-out is -AllowDirtyDeploy
  2. write compose.env on the box: engine/content shas from HEAD's scripts/upstream.lock, the
     public Firebase web config from HEAD's web/.env.production, and the secrets paths
  3. git archive HEAD -> scp -> box/extract.sh (previous tree kept as src.old)
  4. box/up.sh: docker compose build + up -d
  5. poll box/health.sh until the front server reports the engine up

The public tunnel connector is NOT started here; see cutover.ps1.
#>
[CmdletBinding()]
param(
  [string]$InstanceName = 'idlescape',
  [string]$Region = 'ca-central-1',
  [string]$Profile = 'idlescape',
  [string]$KeyFile = (Join-Path $HOME '.ssh\idlescape-lightsail'),
  [string]$PublicOrigin = 'https://osrs.scotho.com',
  [int]$HealthTimeoutSec = 600,
  # The box's public IP, when known. Skips the `aws lightsail get-instance` lookup, which needs a
  # live `aws login` session; SSH and the health poll use the key file only, so a static Lightsail
  # IP (203.0.113.10 since 2026-09-05) lets an unattended release run without one.
  [string]$BoxIp,
  [switch]$Force,
  # -Force accepts that HEAD ships instead of the working tree. It does NOT accept losing a dirty
  # file under deploy/, which the box reads directly; only this switch does, and it is meaningful
  # only alongside -Force (see the deploy/ block below).
  [switch]$AllowDirtyDeploy
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

function Get-LockSha([string[]]$Lines, [string]$Key) {
  foreach ($l in $Lines) { if ($l -match "^$([regex]::Escape($Key))\s+([0-9a-f]{40})") { return $Matches[1] } }
  throw "scripts/upstream.lock at HEAD has no '$Key' line"
}
function Get-EnvValue([string[]]$Lines, [string]$Key) {
  foreach ($l in $Lines) { if ($l -match "^$Key=(.*)$") { return $Matches[1].Trim() } }
  throw "web/.env.production has no $Key"
}

Push-Location $RepoRoot
try {
  $dirty = git status --porcelain --untracked-files=no
  if ($dirty -and -not $Force) { throw "uncommitted changes to tracked files; commit them (HEAD is what ships) or pass -Force:`n$($dirty -join "`n")" }
  $sha = (git rev-parse HEAD).Trim()
  $ip = if ($BoxIp) { $BoxIp } else { Get-BoxIp }
  Write-Host "releasing $sha -> $InstanceName ($ip)"

  $lock = git show "HEAD:scripts/upstream.lock"
  # Production Firebase web config comes from the tracked web/.env.production at HEAD (the same
  # file `vite build` loads), never from web/.env.local, which holds the emulator's demo values.
  $webEnv = git show "HEAD:web/.env.production"
  if ($LASTEXITCODE -ne 0) { throw 'web/.env.production is missing at HEAD' }
  $vite = @{}
  foreach ($k in 'VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID', 'VITE_FIREBASE_MESSAGING_SENDER_ID') {
    $v = Get-EnvValue $webEnv $k
    if (-not $v -or $v -like 'placeholder*' -or $v -like 'demo*') { throw "$k in web/.env.production is empty or an emulator/placeholder value ('$v')" }
    $vite[$k] = $v
  }
  if ((Get-EnvValue $webEnv 'VITE_USE_FIREBASE_EMULATORS') -ne 'false') { throw 'web/.env.production must set VITE_USE_FIREBASE_EMULATORS=false' }
  $composeEnv = @(
    "ENGINE_SHA=$(Get-LockSha $lock 'engine/server')",
    "CONTENT_SHA=$(Get-LockSha $lock 'engine/content')",
    "VITE_FIREBASE_API_KEY=$($vite.VITE_FIREBASE_API_KEY)",
    "VITE_FIREBASE_AUTH_DOMAIN=$($vite.VITE_FIREBASE_AUTH_DOMAIN)",
    "VITE_FIREBASE_PROJECT_ID=$($vite.VITE_FIREBASE_PROJECT_ID)",
    "VITE_FIREBASE_APP_ID=$($vite.VITE_FIREBASE_APP_ID)",
    "VITE_FIREBASE_MESSAGING_SENDER_ID=$($vite.VITE_FIREBASE_MESSAGING_SENDER_ID)",
    "PUBLIC_ORIGIN=$PublicOrigin",
    'SERVER_ENV_FILE=/opt/idlescape/secrets/server.env',
    'FIREBASE_ADMIN_FILE=/opt/idlescape/secrets/firebase-admin.json',
    'TUNNEL_CREDENTIALS_FILE=/opt/idlescape/secrets/tunnel-credentials.json'
  ) -join "`n"
  $envTmp = Join-Path $env:TEMP 'idlescape-compose.env'
  Write-Lf -Path $envTmp -Text ($composeEnv + "`n")
  Copy-ToBox -Ip $ip -Local $envTmp -Remote /opt/idlescape/secrets/compose.env
  Remove-Item $envTmp -Force

  # HEAD is what ships, so every dirty tracked file is silently ABSENT from the archive below.
  # Name them here rather than only in the guard above, because the guard is skippable and this
  # is the last moment before the tree leaves the PC. deploy/ is called out separately and
  # refuses on its own: the box reads several files from that directory directly rather than
  # through a build, so an unshipped edit there is not a missing improvement, it is a revert.
  # deploy/lightsail/cloudflared.yml is the sharp one - it is bind-mounted into the connector
  # (deploy/docker/docker-compose.yml), and box/up.sh re-applies the public profile whenever a
  # cloudflared container is already running, so shipping HEAD's copy over a newer working-tree
  # copy DELETES the ingress the tunnel is serving rather than merely failing to add it.
  # Audit C08 and decision D15.
  $dirtyPaths = @()
  foreach ($line in @($dirty)) {
    if ($line.Length -le 3) { continue }
    $path = $line.Substring(3).Trim()
    # A rename porcelain line is "old -> new"; the destination is the path that matters.
    if ($path -match ' -> ') { $path = ($path -split ' -> ')[-1] }
    $dirtyPaths += $path.Trim().Trim('"')
  }
  if ($dirtyPaths.Count -gt 0) {
    Write-Host "$($dirtyPaths.Count) dirty tracked file(s) will NOT be in this release (HEAD is what ships):"
    foreach ($p in $dirtyPaths) { Write-Host "  $p" }
  }
  $deployDirty = @($dirtyPaths | Where-Object { $_ -like 'deploy/*' -or $_ -like 'deploy\*' })
  if ($deployDirty.Count -gt 0) {
    Write-Warning '****************************************************************'
    Write-Warning "$($deployDirty.Count) uncommitted file(s) under deploy/ are about to be shipped WITHOUT:"
    foreach ($p in $deployDirty) { Write-Warning "    $p" }
    Write-Warning 'The box reads deploy/ files directly. HEAD''s copy REPLACES what is running there,'
    Write-Warning 'including the cloudflared ingress list. Commit them, or pass -AllowDirtyDeploy.'
    Write-Warning '****************************************************************'
    # This refusal is independent of -Force, and has to be: control only reaches this line when
    # -Force was passed (the guard at the top of the script throws on any dirty tracked file
    # otherwise), so a `-not $Force` test here could never fire. -Force means "I accept that HEAD
    # ships instead of my working tree"; under deploy/ that is a REVERT of what the box is running,
    # not a missing improvement, so it takes its own answer. -AllowDirtyDeploy is that answer, and
    # it exists only so this is an operator's explicit choice rather than a hard stop.
    if (-not $AllowDirtyDeploy) { throw "refusing to release with uncommitted changes under deploy/: $($deployDirty -join ', '). Commit them, or pass -AllowDirtyDeploy to ship HEAD's copies over what the box is running." }
  }

  $tgz = Join-Path $env:TEMP "idlescape-$sha.tgz"
  git archive --format=tar.gz -o $tgz HEAD
  if ($LASTEXITCODE -ne 0) { throw 'git archive failed' }
  Write-Host "  archive: $([math]::Round((Get-Item $tgz).Length / 1MB, 1)) MB"
  Copy-ToBox -Ip $ip -Local $tgz -Remote /opt/idlescape/release.tgz
  Copy-ToBox -Ip $ip -Local (Join-Path $PSScriptRoot 'box\extract.sh') -Remote /opt/idlescape/extract.sh
  Remove-Item $tgz -Force
  Invoke-Ssh -Ip $ip -Command "bash /opt/idlescape/extract.sh $sha" | Write-Host

  Write-Host 'building + starting on the box (first build takes several minutes)'
  Invoke-Ssh -Ip $ip -Command 'bash /opt/idlescape/src/deploy/lightsail/box/up.sh' | Write-Host

  Write-Host 'health check'
  $health = Wait-RemoteHealth -Ip $ip -TimeoutSec $HealthTimeoutSec
  Write-Host "released $sha : $health"
} finally { Pop-Location }
