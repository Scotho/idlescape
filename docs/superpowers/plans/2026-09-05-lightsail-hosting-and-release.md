# Lightsail Hosting and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the idlescape stack on a 2 GB Lightsail box and give this repo an operator-run provision / release / preview / cutover process driven from this PC.

**Architecture:** Four thin PowerShell scripts under `deploy/lightsail/` orchestrate the AWS CLI, ssh/scp, and a handful of bash helpers that live in the repo and run on the box. Source ships as a `git archive` of HEAD; images are built on the box with the existing `deploy/docker` compose stack, whose cloudflared service is switched to a mounted config plus credentials and gated behind a compose profile so cutover is explicit.

**Tech Stack:** AWS CLI v2 (Lightsail), Windows OpenSSH, Docker Engine + compose plugin on Ubuntu 24.04, cloudflared.

**Spec:** `docs/superpowers/specs/2026-09-05-lightsail-hosting-and-release-design.md`

## Global Constraints

- AWS profile `idlescape`, region `ca-central-1`, zone `ca-central-1a`, bundle `small_3_0`, blueprint `ubuntu_24_04`.
- Lightsail key pair `idlescape-lightsail`, private key `~/.ssh/idlescape-lightsail` (RSA 4096, already imported).
- Box user is `ubuntu`; app root on the box is `/opt/idlescape` with `src/` (extracted archive) and `secrets/` (mode 700).
- Every file that runs on the box (`*.sh`, env files written by the scripts) must be LF-terminated. `core.autocrlf` is `true` on this PC, so `.gitattributes` pins `*.sh` to LF and PowerShell writes env files with `[IO.File]::WriteAllText` and explicit `"`n"` joins.
- Remote commands passed through `ssh` must not contain double quotes (PowerShell 5.1 native-arg quoting breaks them). Put anything non-trivial in a `deploy/lightsail/box/*.sh` helper and call it by path.
- `PUBLIC_ORIGIN` and the engine's `web.allowedOrigin` are both `https://osrs.scotho.com`.
- Tunnel id `00000000-0000-0000-0000-000000000000`; its credentials JSON lives in `%USERPROFILE%\.cloudflared` and is copied to the box by provision, never committed.
- Do not touch the PC's `idlescape-live-engine` task; cutover only stops `idlescape-tunnel` (and the `cloudflared` Windows service if present).

---

### Task 1: Box-side helpers, cloud-init, tunnel config, line endings

**Files:**
- Create: `.gitattributes`
- Create: `deploy/lightsail/user-data.sh`
- Create: `deploy/lightsail/cloudflared.yml`
- Create: `deploy/lightsail/box/extract.sh`
- Create: `deploy/lightsail/box/up.sh`
- Create: `deploy/lightsail/box/health.sh`
- Create: `deploy/lightsail/box/logs.sh`
- Create: `deploy/lightsail/box/public.sh`
- Create: `deploy/lightsail/box/preview.sh`

**Interfaces:**
- Produces: `extract.sh <sha>` (expects `/opt/idlescape/release.tgz`), `up.sh`, `health.sh` (prints health JSON), `logs.sh`, `public.sh`, `preview.sh [stop]`. All read `/opt/idlescape/secrets/compose.env`.

- [ ] **Step 1: `.gitattributes`**

```
* text=auto
*.sh text eol=lf
*.yml text eol=lf
*.template text eol=lf
```

- [ ] **Step 2: `deploy/lightsail/user-data.sh`**

```bash
#!/bin/bash
# deploy/lightsail/user-data.sh -- cloud-init for the idlescape Lightsail box (Ubuntu 24.04).
# Runs once as root on first boot. provision.ps1 passes it via --user-data and waits for
# /opt/idlescape/.bootstrap-done before pushing secrets.
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive

# 4 GB swap: the engine image build packs the game cache, which can spike past the box's 2 GB.
if ! swapon --show --noheadings | grep -q '^/swapfile'; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Docker Engine + compose plugin (official convenience script).
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
usermod -aG docker ubuntu

# Keep container logs bounded on the 60 GB disk.
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }
EOF
systemctl restart docker

mkdir -p /opt/idlescape/secrets /opt/idlescape/src
chown -R ubuntu:ubuntu /opt/idlescape
chmod 700 /opt/idlescape/secrets

touch /opt/idlescape/.bootstrap-done
```

- [ ] **Step 3: `deploy/lightsail/cloudflared.yml`**

```yaml
# deploy/lightsail/cloudflared.yml -- locally-managed config for the `idlescape` tunnel as run
# by the cloudflared container in deploy/docker/docker-compose.yml. Mounted read-only at
# /etc/cloudflared/config.yml; the credentials JSON is mounted beside it from the box's secrets
# directory (TUNNEL_CREDENTIALS_FILE in compose.env). `server` resolves inside the compose
# network to the front server container.
tunnel: 00000000-0000-0000-0000-000000000000
credentials-file: /etc/cloudflared/credentials.json
ingress:
  - hostname: osrs.scotho.com
    service: http://server:8787
  - service: http_status:404
```

- [ ] **Step 4: box helpers**

`deploy/lightsail/box/extract.sh`:
```bash
#!/bin/bash
# Unpack /opt/idlescape/release.tgz into a fresh src/ (previous tree kept as src.old until the
# next release). Usage: extract.sh <commit-sha>
set -euo pipefail
ROOT=/opt/idlescape
SHA="${1:?commit sha required}"
rm -rf "$ROOT/src.new"
mkdir -p "$ROOT/src.new"
tar -xzf "$ROOT/release.tgz" -C "$ROOT/src.new"
echo "$SHA" > "$ROOT/src.new/.release-sha"
rm -rf "$ROOT/src.old"
if [ -d "$ROOT/src" ]; then mv "$ROOT/src" "$ROOT/src.old"; fi
mv "$ROOT/src.new" "$ROOT/src"
rm -f "$ROOT/release.tgz"
echo "extracted $SHA to $ROOT/src"
```

`deploy/lightsail/box/up.sh`:
```bash
#!/bin/bash
# Build and start the compose stack from the current src/. Keeps the public cloudflared
# connector running if a previous cutover started it (compose profile "public").
set -euo pipefail
cd /opt/idlescape/src/deploy/docker
ENV_FILE=/opt/idlescape/secrets/compose.env
PROFILE=()
if docker ps --format '{{.Names}}' | grep -q '^idlescape-cloudflared'; then PROFILE=(--profile public); fi
docker compose --env-file "$ENV_FILE" "${PROFILE[@]}" build
docker compose --env-file "$ENV_FILE" "${PROFILE[@]}" up -d --remove-orphans
```

`deploy/lightsail/box/health.sh`:
```bash
#!/bin/bash
# Print the front server's /api/health JSON, fetched from inside the server container.
set -euo pipefail
cd /opt/idlescape/src/deploy/docker
exec docker compose --env-file /opt/idlescape/secrets/compose.env exec -T server \
  bun -e 'fetch("http://localhost:8787/api/health").then(r => r.text()).then(t => console.log(t))'
```

`deploy/lightsail/box/logs.sh`:
```bash
#!/bin/bash
set -euo pipefail
cd /opt/idlescape/src/deploy/docker
exec docker compose --env-file /opt/idlescape/secrets/compose.env --profile public logs --tail "${1:-60}"
```

`deploy/lightsail/box/public.sh`:
```bash
#!/bin/bash
# Start the public cloudflared connector (compose profile "public"). Called by cutover.ps1.
set -euo pipefail
cd /opt/idlescape/src/deploy/docker
exec docker compose --env-file /opt/idlescape/secrets/compose.env --profile public up -d cloudflared
```

`deploy/lightsail/box/preview.sh`:
```bash
#!/bin/bash
# Expose the front server on the box's loopback:18787 via a socat sidecar on the compose network,
# for an ssh -L port-forward from the operator's PC. Usage: preview.sh [stop]
set -euo pipefail
docker rm -f idlescape-preview >/dev/null 2>&1 || true
if [ "${1:-}" = "stop" ]; then echo "preview stopped"; exit 0; fi
docker run -d --rm --name idlescape-preview --network idlescape_internal \
  -p 127.0.0.1:18787:18787 alpine/socat TCP-LISTEN:18787,fork,reuseaddr TCP:server:8787 >/dev/null
echo "preview listening on 127.0.0.1:18787 (box)"
```

- [ ] **Step 5: Verify LF and commit**

Run: `git add -A deploy/lightsail .gitattributes && git ls-files --eol deploy/lightsail | grep -v 'w/lf'`
Expected: no `*.sh` line listed with `w/crlf`.

```bash
git commit -m "feat(deploy): Lightsail box helpers, cloud-init, tunnel config"
```

---

### Task 2: Compose stack changes

**Files:**
- Modify: `deploy/docker/docker-compose.yml`

**Interfaces:**
- Consumes: `deploy/lightsail/cloudflared.yml` (Task 1).
- Produces: compose project name `idlescape` (network `idlescape_internal`, container `idlescape-cloudflared-1`); env vars `SERVER_ENV_FILE`, `FIREBASE_ADMIN_FILE`, `TUNNEL_CREDENTIALS_FILE`; profile `public` on `cloudflared`.

- [ ] **Step 1: Edit compose**

Add at top level (before `services:`): `name: idlescape`.

`server.env_file` becomes:
```yaml
    env_file:
      - ${SERVER_ENV_FILE:-../../server/.env}
```

`secrets.firebase-admin.json.file` becomes `${FIREBASE_ADMIN_FILE:-../../server/secrets/firebase-admin.json}`.

`cloudflared` service becomes:
```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    # Locally-managed run: config + the tunnel's credentials JSON are mounted in (see
    # deploy/lightsail/cloudflared.yml). Behind the "public" compose profile so a plain
    # `up -d` never exposes a stack that hasn't been health-checked; deploy/lightsail/cutover.ps1
    # starts it deliberately via box/public.sh.
    command: tunnel --no-autoupdate --config /etc/cloudflared/config.yml run
    volumes:
      - ../lightsail/cloudflared.yml:/etc/cloudflared/config.yml:ro
      - ${TUNNEL_CREDENTIALS_FILE:?path to the tunnel credentials JSON, see deploy/lightsail/README.md}:/etc/cloudflared/credentials.json:ro
    profiles: [public]
    restart: unless-stopped
    depends_on: [server]
    networks: [internal]
```

Update the header comment to name Lightsail instead of the Oracle VM.

- [ ] **Step 2: Verify and commit**

Run (on the box, later, in Task 4 the build proves it). Locally: `git diff --stat deploy/docker/docker-compose.yml`.

```bash
git commit -am "feat(deploy): compose reads secrets by env path; cloudflared behind public profile"
```

---

### Task 3: `common.ps1` and `provision.ps1`, then provision the box

**Files:**
- Create: `deploy/lightsail/common.ps1`
- Create: `deploy/lightsail/provision.ps1`

**Interfaces:**
- Produces (common.ps1, dot-sourced; relies on caller's `$Region`, `$Profile`, `$InstanceName`, `$KeyFile`): `Invoke-Aws [args]` → parsed JSON; `Get-BoxIp` → string; `Invoke-Ssh -Ip -Command` → output lines (throws on non-zero); `Copy-ToBox -Ip -Local -Remote`; `Write-Lf -Path -Text`; `Wait-RemoteHealth -Ip -TimeoutSec`; `$RepoRoot`.

- [ ] **Step 1: `common.ps1`**

```powershell
# deploy/lightsail/common.ps1 -- helpers dot-sourced by provision/release/preview/cutover.
# Callers define $Region, $Profile, $InstanceName, $KeyFile before dot-sourcing.
$awsDir = Join-Path $env:LOCALAPPDATA 'Programs\Amazon\AWSCLIV2'
if (Test-Path $awsDir) { $env:PATH = "$awsDir;$env:PATH" }
$env:PYTHONUTF8 = '1'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$SshOpts = @('-i', $KeyFile, '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=15', '-o', 'BatchMode=yes')

function Invoke-Aws {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$AwsArgs)
  $out = & aws @AwsArgs --region $Region --profile $Profile --output json
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
  $out = & ssh @SshOpts "ubuntu@$Ip" $Command
  if ($LASTEXITCODE -ne 0 -and -not $AllowFailure) { throw "ssh failed ($LASTEXITCODE): $Command" }
  return $out
}

function Copy-ToBox {
  param([string]$Ip, [string]$Local, [string]$Remote)
  & scp @SshOpts -q $Local "ubuntu@${Ip}:$Remote"
  if ($LASTEXITCODE -ne 0) { throw "scp $Local -> $Remote failed ($LASTEXITCODE)" }
}

function Write-Lf {
  param([string]$Path, [string]$Text)
  [IO.File]::WriteAllText($Path, ($Text -replace "`r`n", "`n"), (New-Object System.Text.UTF8Encoding($false)))
}

function Wait-RemoteHealth {
  param([string]$Ip, [int]$TimeoutSec = 600)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    $json = Invoke-Ssh -Ip $Ip -Command 'bash /opt/idlescape/src/deploy/lightsail/box/health.sh' -AllowFailure
    if ($json -and ($json -join '') -match '"engine":"up"') { return ($json -join '') }
    Write-Host "  waiting for engine: $((($json -join '') -replace '\s+', ' '))"
    Start-Sleep -Seconds 15
  } while ((Get-Date) -lt $deadline)
  Invoke-Ssh -Ip $Ip -Command 'bash /opt/idlescape/src/deploy/lightsail/box/logs.sh 40' -AllowFailure | Write-Host
  throw "engine did not report up within $TimeoutSec s"
}
```

- [ ] **Step 2: `provision.ps1`**

```powershell
<#
deploy/lightsail/provision.ps1 -- create (or reuse) the idlescape Lightsail box and push its secrets.

Idempotent by instance name. First run creates the instance from user-data.sh, attaches a static
IP, restricts the firewall to SSH, waits for cloud-init, then copies:
  server.env               (generated production env for the front server)
  firebase-admin.json      (server/secrets/firebase-admin.json)
  tunnel-credentials.json  (%USERPROFILE%\.cloudflared\<tunnel id>.json)
into /opt/idlescape/secrets on the box. Re-running with -SecretsOnly just re-pushes those.

  .\deploy\lightsail\provision.ps1 -GatePassword '<real beta password>'
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
  [string]$GatePassword,
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
do {
  $ok = Invoke-Ssh -Ip $ip -Command 'test -f /opt/idlescape/.bootstrap-done && echo ready' -AllowFailure
  if ($ok -match 'ready') { break }
  Start-Sleep -Seconds 15
} while ((Get-Date) -lt $deadline)
if ($ok -notmatch 'ready') { throw 'box did not finish bootstrap within 10 minutes' }

if (-not $GatePassword) { throw 'pass -GatePassword (the beta gate password players will type)' }
$secret = -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
$serverEnv = @(
  'PORT=8787',
  'GATE_ENABLED=true',
  "GATE_PASSWORD=$GatePassword",
  "GATE_SECRET=$secret",
  "FIREBASE_PROJECT_ID=$FirebaseProjectId",
  'FIREBASE_EMULATORS=false',
  "PUBLIC_ORIGIN=$PublicOrigin"
) -join "`n"
$tmp = Join-Path $env:TEMP "idlescape-server.env"
Write-Lf -Path $tmp -Text ($serverEnv + "`n")

Copy-ToBox -Ip $ip -Local $tmp -Remote /opt/idlescape/secrets/server.env
Copy-ToBox -Ip $ip -Local $firebaseKey -Remote /opt/idlescape/secrets/firebase-admin.json
Copy-ToBox -Ip $ip -Local $tunnelCreds -Remote /opt/idlescape/secrets/tunnel-credentials.json
Invoke-Ssh -Ip $ip -Command 'chmod 600 /opt/idlescape/secrets/*' | Out-Null
Remove-Item $tmp -Force

Write-Host "provisioned. next: .\deploy\lightsail\release.ps1"
```

Note: `-SecretsOnly` regenerates `GATE_SECRET`, which invalidates existing gate cookies. Acceptable; documented in README.

- [ ] **Step 3: Run provision**

Run: `.\deploy\lightsail\provision.ps1 -GatePassword '<chosen>'`
Expected: prints `state: running`, `box: ubuntu@<ip>`, `provisioned.`
Verify: `ssh -i ~/.ssh/idlescape-lightsail ubuntu@<ip> 'docker --version; free -m | grep Swap; ls -la /opt/idlescape/secrets'` shows Docker, 4 GB swap, three files at mode 600.

- [ ] **Step 4: Commit**

```bash
git add deploy/lightsail/common.ps1 deploy/lightsail/provision.ps1
git commit -m "feat(deploy): Lightsail provision script (instance, static IP, secrets)"
```

---

### Task 4: `release.ps1`, then first release

**Files:**
- Create: `deploy/lightsail/release.ps1`

**Interfaces:**
- Consumes: `common.ps1`, `box/extract.sh`, `box/up.sh`, `box/health.sh`.
- Produces: `/opt/idlescape/secrets/compose.env` on the box; `/opt/idlescape/src/.release-sha`.

- [ ] **Step 1: `release.ps1`**

```powershell
<#
deploy/lightsail/release.ps1 -- ship HEAD of this repo to the Lightsail box and bring it up.

  1. refuse if tracked files have uncommitted changes (HEAD is what ships; -Force overrides)
  2. write compose.env on the box: engine/content shas from HEAD's scripts/upstream.lock, the
     public Firebase web config from web/.env.local, and the secrets paths
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
  [switch]$Force
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

function Get-LockSha([string[]]$Lines, [string]$Key) {
  foreach ($l in $Lines) { if ($l -match "^$([regex]::Escape($Key))\s+([0-9a-f]{40})") { return $Matches[1] } }
  throw "scripts/upstream.lock at HEAD has no '$Key' line"
}
function Get-EnvValue([string[]]$Lines, [string]$Key) {
  foreach ($l in $Lines) { if ($l -match "^$Key=(.*)$") { return $Matches[1].Trim() } }
  throw "web/.env.local has no $Key"
}

Push-Location $RepoRoot
try {
  $dirty = git status --porcelain --untracked-files=no
  if ($dirty -and -not $Force) { throw "uncommitted changes to tracked files; commit them (HEAD is what ships) or pass -Force:`n$($dirty -join "`n")" }
  $sha = (git rev-parse HEAD).Trim()
  $ip = Get-BoxIp
  Write-Host "releasing $sha -> $InstanceName ($ip)"

  $lock = git show "HEAD:scripts/upstream.lock"
  $webEnv = Get-Content (Join-Path $RepoRoot 'web\.env.local')
  $vite = @{}
  foreach ($k in 'VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID', 'VITE_FIREBASE_MESSAGING_SENDER_ID') {
    $v = Get-EnvValue $webEnv $k
    if (-not $v -or $v -like 'placeholder*') { throw "$k in web/.env.local is empty or a placeholder" }
    $vite[$k] = $v
  }
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
```

- [ ] **Step 2: Run the first release**

Run: `.\deploy\lightsail\release.ps1` (commit Tasks 1-3 first so the tree is clean).
Expected: ends with `released <sha> : {"engine":"up",...}`.
If the build fails, `ssh ... 'bash /opt/idlescape/src/deploy/lightsail/box/logs.sh 100'` and fix forward.

- [ ] **Step 3: Commit**

```bash
git add deploy/lightsail/release.ps1
git commit -m "feat(deploy): Lightsail release script (archive HEAD, build on box, health gate)"
```

---

### Task 5: `preview.ps1` and pre-cutover verification

**Files:**
- Create: `deploy/lightsail/preview.ps1`

- [ ] **Step 1: `preview.ps1`**

```powershell
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
```

- [ ] **Step 2: Verify through the forward**

Run `preview.ps1` in the background, then `curl http://localhost:18787/api/health` and `curl -I http://localhost:18787/rs2.cgi`.
Expected: health JSON with `"engine":"up"`; rs2.cgi 200 (or the gate page, 200).
Then `preview.ps1 -Stop`.

- [ ] **Step 3: Commit**

```bash
git add deploy/lightsail/preview.ps1
git commit -m "feat(deploy): Lightsail preview port-forward"
```

---

### Task 6: `cutover.ps1`, then cut over

**Files:**
- Create: `deploy/lightsail/cutover.ps1`

- [ ] **Step 1: `cutover.ps1`**

```powershell
#Requires -RunAsAdministrator
<#
deploy/lightsail/cutover.ps1 -- point osrs.scotho.com at the Lightsail stack.
  1. require the box's front server to report the engine up
  2. start the box's cloudflared connector (compose profile "public")
  3. stop + disable this PC's idlescape-tunnel task and cloudflared service, if present, so
     only one connector with one ingress serves the tunnel
  4. poll https://osrs.scotho.com/api/health until it reports the engine up
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
if ($task) { Stop-ScheduledTask -TaskName 'idlescape-tunnel'; Disable-ScheduledTask -TaskName 'idlescape-tunnel' | Out-Null; Write-Host 'stopped + disabled PC task idlescape-tunnel' }
$svc = Get-Service -Name 'cloudflared' -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq 'Running') { Stop-Service -Name 'cloudflared'; Set-Service -Name 'cloudflared' -StartupType Disabled; Write-Host 'stopped + disabled PC service cloudflared' }

$deadline = (Get-Date).AddMinutes(3)
do {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$PublicOrigin/api/health" -TimeoutSec 10
    if ($r.Content -match '"engine":"up"') { Write-Host "public: $($r.Content)"; return }
    Write-Host "  public: $($r.Content)"
  } catch { Write-Host "  public not ready: $($_.Exception.Message)" }
  Start-Sleep -Seconds 10
} while ((Get-Date) -lt $deadline)
throw "$PublicOrigin did not report the engine up within 3 minutes; check box/logs.sh and the Cloudflare tunnel connectors"
```

- [ ] **Step 2: Run elevated**

Run: `Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','C:\projects\osrs_test\deploy\lightsail\cutover.ps1'` (UAC prompt).
Expected: `public: {"engine":"up",...}`. Verify: `curl https://osrs.scotho.com/api/health`; `Get-ScheduledTask idlescape-tunnel` shows Disabled.

- [ ] **Step 3: Commit**

```bash
git add deploy/lightsail/cutover.ps1
git commit -m "feat(deploy): Lightsail cutover (start public connector, retire PC tunnel)"
```

---

### Task 7: Runbook and doc pointers

**Files:**
- Create: `deploy/lightsail/README.md`
- Modify: `deploy/docker/README.md` (header: superseded-by note; tunnel section)
- Modify: `README.md` (Deploy section pointer)

- [ ] **Step 1: `deploy/lightsail/README.md`** covering: what the box is (bundle, cost, plan expiry 2027-03-05 and the upgrade-or-lose-it rule), prerequisites on this PC (aws profile, key file, tunnel creds, firebase key, web/.env.local), the four scripts with one-line usage each, the release contract (HEAD ships; commit first), rollback (`ssh` then swap `src.old` back and run `up.sh`), secrets rotation (`provision.ps1 -SecretsOnly`), and how to retire the PC PoC tasks afterwards.

- [ ] **Step 2: Doc pointers** — top of `deploy/docker/README.md`: "The compose stack now runs on the Lightsail box; operator runbook is `deploy/lightsail/README.md`. The Oracle VM notes below are historical." Replace its tunnel-token paragraph with the mounted-config description. Root README: add a "Deploy (Lightsail)" line under Deploy pointing at the runbook.

- [ ] **Step 3: Commit**

```bash
git add deploy/lightsail/README.md deploy/docker/README.md README.md
git commit -m "docs(deploy): Lightsail runbook; mark Oracle VM notes historical"
```

## Self-review

- Spec coverage: machine/swap/firewall/static IP (Task 3), tunnel via mounted config (Tasks 1-2), archive transport + generated compose.env + health gate (Task 4), preview (Task 5), explicit cutover (Task 6), docs (Task 7). Rollback is documented rather than scripted (spec lists it under error handling as keeping `src.old`).
- Placeholders: none; `<chosen>` gate password and `<ip>` are runtime inputs.
- Names consistent: `idlescape_internal`, `idlescape-cloudflared-1`, `compose.env`, `server.env`, helper paths under `/opt/idlescape/src/deploy/lightsail/box/`.
