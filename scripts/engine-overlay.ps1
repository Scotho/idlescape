<#
.SYNOPSIS
  Applies the engine-custom/ overlay on top of the pinned engine/server clone, or checks
  whether the overlay has drifted from a since-changed upstream base.

.DESCRIPTION
  engine-custom/ is a tracked directory mirroring the layout of engine/server (see
  engine-custom/README.md). Every real file under one of its subdirectories is copied on top
  of the matching path in engine/server/, creating destination directories as needed.
  Re-running is safe: byte-identical files are left untouched and changed files are
  overwritten. A file DELETED from engine-custom/ is removed from the clone on the next
  apply, restored to upstream's copy where one exists and deleted where it does not. The
  record is a .overlay-manifest sidecar in the clone root, which is git-ignored and survives
  scripts/setup.ps1's force checkout. Every file here must be listed in manifest.json; one
  that is not fails the apply, because -Check only ever walks manifest entries and an
  unlisted file would be checked by nothing.

  engine-custom/manifest.json records two lists. "files" is every path the overlay
  contributes: kind "replace" pairs the path with the sha256 of the upstream file it was
  authored against, kind "new" has a null baseSha256 (no upstream file exists). "anchors" is
  every upstream file the overlay does NOT replace but whose code a runtime patch in
  src/idlescape/install.ts depends on (Player.getInventory, World.cycle, ...).

  Every recorded hash is the sha256 of the upstream GIT BLOB, i.e. of the bytes
  `git -c core.autocrlf=false show <sha>:<path>` emits, not of the file as it sits on disk.
  The clone is checked out with core.autocrlf=true, so those two differ (CRLF on disk, LF in
  the blob).

  -Check rehashes the blob for every recorded path at the clone's current HEAD and exits 1 if
  any of them no longer matches the recorded hash, or has vanished, or if a kind "new" entry
  names a path upstream now has a file at, so a revision bump that invalidates a patch fails
  the build instead of silently applying. It reads the blobs rather than the working tree
  precisely because the overlay has already overwritten the working-tree copy of every
  "replace" file by the time -Check runs.

.PARAMETER Check
  Report drift instead of copying. Does not touch engine/server.
#>
param(
  [switch]$Check
)

$ErrorActionPreference = 'Stop'

# The blob hashing this script's -Check rests on lives in scripts/lib/OverlayHash.ps1 so
# scripts/content-overlay.ps1 can use the same implementation instead of its own weaker twin
# (audit C23). Dot-sourced, never `&`-called. Assert-OverlayHashing is that library's self-test:
# it builds a throwaway repository and proves the hash does not move when the working tree does,
# and it runs on every invocation, apply and -Check alike, because a green from a check nobody has
# watched fail means nothing (the precedent is Assert-LineCounting in scripts/line-ceiling.ps1).
# Assert-OverlayRemoval is that same idea for Sync-OverlayRemovals below: against a throwaway
# repository it proves that a path dropped from the overlay source is restored from upstream where
# a blob exists and deleted where none does, and that the sidecar is rewritten so a later apply
# does not do it again.
. (Join-Path $PSScriptRoot 'lib\OverlayHash.ps1')
Assert-OverlayHashing
Assert-OverlayRemoval

$root = Split-Path $PSScriptRoot -Parent
$customRoot = Join-Path $root 'engine-custom'
$baseRoot = Join-Path $root 'engine\server'
$manifestPath = Join-Path $customRoot 'manifest.json'
# Root-level bookkeeping files are never copied into the clone.
$skipNames = @('README.md', 'PATCHES.md', 'manifest.json', '.gitkeep')

if (-not (Test-Path $customRoot)) { throw "engine-custom/ not found at $customRoot" }
if (-not (Test-Path $manifestPath)) { throw "Manifest not found: $manifestPath" }
if (-not (Test-Path $baseRoot)) { throw "Engine clone not found at $baseRoot. Run scripts/setup.ps1 first." }

function Get-EngineManifest {
  $raw = Get-Content -LiteralPath $manifestPath -Raw
  if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
  return ($raw | ConvertFrom-Json)
}

function Get-Sha {
  param([string]$Path)
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

if ($Check) {
  $manifest = Get-EngineManifest
  $entries = @()
  if ($manifest -and $manifest.PSObject.Properties['files'] -and $manifest.files) { $entries += @($manifest.files) }
  if ($manifest -and $manifest.PSObject.Properties['anchors'] -and $manifest.anchors) {
    foreach ($a in @($manifest.anchors)) {
      $entries += [pscustomobject]@{ path = $a.path; kind = 'anchor'; baseSha256 = $a.sha256 }
    }
  }

  if ($entries.Count -eq 0) {
    throw "engine-custom/manifest.json lists no files and no anchors. A -Check with nothing to check is a green that means nothing."
  }

  # Resolve the clone's checked-out commit and use THAT as the upstream revision, rather than
  # manifest.base. manifest.base is the sha the recorded hashes were authored against; the
  # clone is at whatever scripts/upstream.lock currently pins. Hashing manifest.base's own
  # blobs would compare the recorded hash against the blob it was taken from, which can only
  # ever agree -- and on a revision bump the old commit is not even present, because
  # setup.ps1 clones with --depth 1. Hashing HEAD's blobs is what actually answers the
  # question -Check exists to ask: "has the upstream file this patch was written against
  # changed under us?"
  $head = Get-CloneHead -CloneRoot $baseRoot

  $drifted = New-Object System.Collections.Generic.List[string]
  $gone = New-Object System.Collections.Generic.List[string]
  $collided = New-Object System.Collections.Generic.List[string]
  $handEdited = New-Object System.Collections.Generic.List[string]
  foreach ($entry in $entries) {
    $relPath = [string]$entry.path
    if ([string]::IsNullOrEmpty($relPath)) { continue }
    # The exit-1 decision rests entirely on the upstream blob. The working-tree file is not
    # consulted for it: after an overlay run that file is our own copy.
    $upstreamHash = Get-UpstreamBlobSha -CloneRoot $baseRoot -Rev $head -RelPath $relPath

    # A "new" entry has no hash to compare, which is exactly why it is asked the other question:
    # does upstream have a file there NOW? A replace entry relabelled "new", or a bump that adds
    # the path, would otherwise be overwritten on every apply and checked by nothing.
    if ([string]$entry.kind -eq 'new') {
      if ($null -ne $upstreamHash) { $collided.Add($relPath) }
      continue
    }
    $recorded = [string]$entry.baseSha256
    if ([string]::IsNullOrEmpty($recorded)) {
      # Was a silent `continue`, so a replace entry with its hash blanked passed as checked.
      throw "engine-custom/manifest.json: $relPath has kind '$($entry.kind)' and no recorded sha256. An entry with no hash is uncheckable; give it a hash or mark it kind 'new'."
    }

    if ($null -eq $upstreamHash) { $gone.Add("$relPath ($($entry.kind))"); continue }
    if ($upstreamHash -ne $recorded) { $drifted.Add("$relPath ($($entry.kind))"); continue }

    # Secondary, non-fatal: the clone is meant to be pristine except where our overlay has
    # written. Flag a working-tree file that matches neither upstream nor our overlay copy,
    # which means somebody hand-edited engine/server (those edits are lost on the next setup).
    $basePath = Join-Path $baseRoot $relPath
    if (-not (Test-Path -LiteralPath $basePath)) { continue }
    $customPath = Join-Path $customRoot $relPath
    if ((Test-Path -LiteralPath $customPath) -and ((Get-Sha $basePath) -eq (Get-Sha $customPath))) { continue }
    $diskResult = Invoke-GitInClone -CloneRoot $baseRoot -GitArgs @('status', '--porcelain', '--', $relPath)
    if ($diskResult.ExitCode -eq 0 -and $diskResult.Bytes.Length -gt 0) {
      $handEdited.Add("$relPath ($($entry.kind))")
    }
  }

  Write-Host "engine-overlay -Check: $($entries.Count) manifest entry(ies) checked against the clone's pinned blobs (HEAD $head)."
  if ($manifest.base -and ($manifest.base -ne $head)) {
    Write-Host "  note: manifest base is $($manifest.base); the clone is at $head. Hashes below are compared against the clone."
  }
  if ($gone.Count -gt 0) {
    Write-Host "  base file removed upstream:"
    foreach ($p in $gone) { Write-Host "    $p" }
  }
  if ($drifted.Count -gt 0) {
    Write-Host "  base file changed upstream since the patch was recorded (re-apply per engine-custom/PATCHES.md):"
    foreach ($p in $drifted) { Write-Host "    $p" }
  }
  if ($collided.Count -gt 0) {
    Write-Host "  recorded as kind 'new' but upstream has a file at that path (make it a replace entry with the upstream blob's sha256, after reading what it overwrites):"
    foreach ($p in $collided) { Write-Host "    $p" }
  }
  if ($handEdited.Count -gt 0) {
    Write-Host "  warning (not fatal): clone working tree differs from both upstream and our overlay copy, so it was hand-edited and will be lost on the next scripts/setup.ps1 run:"
    foreach ($p in $handEdited) { Write-Host "    $p" }
  }
  if ($gone.Count -eq 0 -and $drifted.Count -eq 0 -and $collided.Count -eq 0) {
    Write-Host "  no drift detected."
    exit 0
  }
  exit 1
}

# --- Default mode: copy engine-custom/** over engine/server/ ----------------
$sourceFiles = @(Get-ChildItem -LiteralPath $customRoot -Recurse -File | Where-Object {
  $_.DirectoryName -ne $customRoot -and $skipNames -notcontains $_.Name
})
$sourcePaths = @($sourceFiles | ForEach-Object { $_.FullName.Substring($customRoot.Length + 1).Replace('\', '/') })

# ABOVE the copy loop on purpose. This was a printed note BELOW it, which was harmless while it
# only printed. As a throw it is not: the stray file would be copied into the clone first, and the
# throw would then skip Sync-OverlayRemovals, so the sidecar would never learn about it and the
# stray would sit in engine/server/ forever.
$manifest = Get-EngineManifest
$manifestPaths = New-Object System.Collections.Generic.HashSet[string]
if ($manifest -and $manifest.files) { foreach ($e in @($manifest.files)) { if ($e.path) { [void]$manifestPaths.Add([string]$e.path) } } }
$unlisted = @($sourcePaths | Where-Object { -not $manifestPaths.Contains($_) })
if ($unlisted.Count -gt 0) {
  foreach ($p in $unlisted) { Write-Host "    not in manifest.json: $p" }
  # An overlay file that is not in the manifest is copied over upstream on every apply and is
  # checked by NOTHING, forever: -Check only ever walks manifest entries, and verify.ps1's
  # git-tracked check reads the same list. The manifest is the definition of what the overlay is,
  # so a file outside it is not an overlay file. Audit C23.
  throw "engine-custom holds $($unlisted.Count) file(s) that engine-custom/manifest.json does not list; add them with a kind and a baseSha256, or delete them"
}

$copied = 0
$unchanged = 0
$copiedPaths = New-Object System.Collections.Generic.List[string]

foreach ($file in $sourceFiles) {
  $relPath = $file.FullName.Substring($customRoot.Length + 1)
  $destPath = Join-Path $baseRoot $relPath
  $destDir = Split-Path $destPath -Parent
  if (-not (Test-Path -LiteralPath $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }

  $needsCopy = $true
  if (Test-Path -LiteralPath $destPath) {
    if ((Get-Sha $file.FullName) -eq (Get-Sha $destPath)) { $needsCopy = $false }
  }

  if ($needsCopy) {
    Copy-Item -LiteralPath $file.FullName -Destination $destPath -Force
    $copied++
    $copiedPaths.Add($relPath.Replace('\', '/'))
  } else {
    $unchanged++
  }
}

Write-Host "engine-overlay: $($sourceFiles.Count) overlay file(s), $copied copied, $unchanged unchanged."
foreach ($p in $copiedPaths) { Write-Host "  copied: $p" }

# The removal path. Anything the last apply owned that this one does not is taken back out of the
# clone: restored from upstream's blob where git has one, deleted where it does not. Without it a
# file deleted from engine-custom/ survived in the clone on the machine that had applied it and
# nowhere else, because scripts/setup.ps1's `git checkout -q -f <sha>` restores tracked files and
# leaves untracked ones alone. Audit C23.
$removed = @(Sync-OverlayRemovals -CloneRoot $baseRoot -CurrentPaths $sourcePaths)
if ($removed.Count -gt 0) {
  Write-Host "  removed from the clone (no longer in engine-custom/):"
  foreach ($p in $removed) { Write-Host "    $p" }
}

# Explicit success exit, so this script's exit code is the apply's own answer rather than whatever
# the last native command inside it happened to leave behind. Assert-OverlayHashing at the top of
# this file runs git, so $LASTEXITCODE is already 0 by the time the apply path ends; the guard is
# for the next native call added to this path, whose exit code would otherwise silently become this
# script's. Both -Check paths already exit explicitly; this makes the apply path do the same, so
# the contract is simply "exit code 0 means the apply worked". The mutation that discriminates
# between having this line and not having it is recorded at the tail of scripts/content-overlay.ps1;
# reading $LASTEXITCODE after a bare `& scripts/engine-overlay.ps1` is not that mutation.
exit 0
