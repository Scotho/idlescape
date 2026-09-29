# Idempotent bootstrap: ensures upstream clones exist at pinned shas (274), npm-installs the
# engine (Node/tsx, not Bun), writes engine/server/data/config/world.json if absent, overlays
# custom content (scripts/content-overlay.ps1, after checkout and before the pack so the
# packed cache reflects it), packs the cache once, then bun-installs the client fork.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$bun = "$env:USERPROFILE\.bun\bin\bun.exe"
if (-not (Test-Path $bun)) { throw "Bun not found at $bun. Install: irm bun.sh/install.ps1 | iex" }

# A native command's non-zero exit does NOT throw under $ErrorActionPreference = 'Stop', and a
# .ps1 invoked with `&` that runs `exit 1` sets $LASTEXITCODE without throwing either. This file
# had nine such calls and read none of them, so tools/pack/BuildOverlay.ts's process.exit(1), the
# whole output of the pack-id guard, ended with "setup complete". Audit C23.
function Invoke-Native {
    param([string]$Description)
    if ($LASTEXITCODE -ne 0) { throw "$Description failed (exit $LASTEXITCODE)" }
}

$repos = @{
  'engine/server'  = 'https://github.com/LostCityRS/Engine-TS'
  'engine/content' = 'https://github.com/LostCityRS/Content'
}
$branch = '274'

# Parsed by the shared library, which rejects an all-comment or malformed lock rather than handing
# back an empty hashtable. Assert-ClonePins is deliberately NOT called here: this is the script that
# creates and re-pins the clones, so asserting the pin before it has run would refuse to bootstrap a
# fresh checkout.
. (Join-Path $PSScriptRoot 'lib\UpstreamLock.ps1')
Assert-LockParsing
$lock = Read-UpstreamLock -Path (Join-Path $root 'scripts\upstream.lock')

foreach ($rel in $repos.Keys) {
  $dir = Join-Path $root $rel
  $sha = $lock[$rel]
  if (-not $sha) { throw "No pinned sha for $rel in scripts/upstream.lock" }

  if (-not (Test-Path "$dir\.git")) {
    Write-Host "== cloning $rel @ $branch"
    git clone --single-branch -b $branch $repos[$rel] $dir
    Invoke-Native "git clone ($rel)"
  } else {
    # Existing clones may predate 274 (e.g. a single-branch 225 clone) and lack the ref;
    # explicitly fetching the branch by name works even under --single-branch.
    Write-Host "== fetching $branch into existing $rel clone"
    git -C $dir fetch --depth 1 origin $branch
    Invoke-Native "git fetch ($rel)"
  }

  # Force checkout: the pack step below regenerates tracked build artifacts under
  # public/client/ (bzip2.wasm, client.js, tinymidipcm.wasm), which leaves an existing clone's
  # working tree dirty after a prior run. This is a pinned, read-only clone (no source we
  # author lives here), so discarding those regenerated files on re-pin is safe and required
  # for setup.ps1 to stay unattended-idempotent.
  Write-Host "== pinning $rel to $sha"
  git -C $dir checkout -q -f $sha
  Invoke-Native "git checkout ($rel @ $sha)"
}

# 274 engine is Node/npm (tsx), not Bun.
$engine = Join-Path $root 'engine\server'
Push-Location $engine
npm install
Pop-Location
Invoke-Native 'npm install (engine/server)'

# world.json (data/config/world.json), loaded by src/util/WorldConfig.ts. Only the keys we
# override are written; the loader fills in every other default. Never clobber an existing file
# (e.g. one hand-edited via the /setup management page before entry 2 authenticated it). That page
# now needs the x-idlescape-mgmt header (engine-custom/src/idlescape/management.ts, audit C07), and
# no browser can attach one, so /setup is reachable only by a scripted request such as curl; the
# page's own fetch of /setup/config would 401 as well. Edit this file directly instead. A local
# world with no ENGINE_MANAGEMENT_SECRET has no setup page at all either way.
$worldConfigPath = Join-Path $engine 'data\config\world.json'
if (-not (Test-Path $worldConfigPath)) {
  Write-Host "== writing $worldConfigPath"
  New-Item -ItemType Directory -Force (Split-Path $worldConfigPath -Parent) | Out-Null

  $worldConfig = [ordered]@{
    website = [ordered]@{
      registration = $false
    }
    web = [ordered]@{
      port          = 8899
      allowedOrigin = 'http://localhost:8787'
      managementPort = 8897
    }
    node = [ordered]@{
      port       = 43596
      profile    = 'main'
      debug      = $true
      production = $false
    }
    login = [ordered]@{
      enabled = $false
    }
    friend = [ordered]@{
      enabled = $false
    }
    logger = [ordered]@{
      enabled = $false
    }
    db = [ordered]@{
      backend = 'sqlite'
    }
  }

  # Write BOM-less UTF-8: Set-Content/Out-File's utf8 encoding on Windows PowerShell 5.1 emits a
  # BOM, which WorldConfig.ts's JSON.parse rejects (falls back to defaults, silently discarding
  # our overrides).
  $json = $worldConfig | ConvertTo-Json -Depth 5
  [System.IO.File]::WriteAllText($worldConfigPath, $json + "`n", (New-Object System.Text.UTF8Encoding($false)))
} else {
  Write-Host "== $worldConfigPath already exists, leaving it alone"
}

# Custom content overlay: content-custom/** over engine/content/, before the pack so the
# packed cache reflects any overlay files. Guarded in case the script is ever absent.
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

# Pack the cache once. This uses the overlay's own entry point rather than `npm run build`
# (tools/pack/Build.ts): content-custom adds varps the original 2004 cache does not have, and
# upstream's pack aborts with ".varp checksum mismatch!" unless build.verify is off - which
# this world cannot set through BUILD_VERIFY, because loadWorldConfig() ignores the environment
# whenever data/config/world.json exists. See engine-custom/PATCHES.md, "Packing a config the
# 2004 cache does not have". The engine also auto-packs on first `tsx src/app.ts` if this is
# skipped, but doing it here front-loads the ~7 minute cost.
Push-Location $engine
npx tsx tools/pack/BuildOverlay.ts
Pop-Location
# After Pop-Location so a failing pack still leaves the location stack balanced; Pop-Location is a
# cmdlet and does not touch $LASTEXITCODE. This is the call whose exit code was the pack-id guard's
# only output.
Invoke-Native 'pack (BuildOverlay)'

Push-Location (Join-Path $root 'client')
& $bun install
Pop-Location
Invoke-Native 'bun install (client)'

# The wiki package is in verify.ps1 now (its typecheck and its own bun test suites), and
# build.ps1 builds the reader database from it, so a fresh clone that skipped this would fail with
# `Cannot find package 'marked'` and read as a broken gate rather than a missing install.
Push-Location (Join-Path $root 'wiki')
& $bun install
Pop-Location
Invoke-Native 'bun install (wiki)'

Write-Host "setup complete"
