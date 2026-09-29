<#
.SYNOPSIS
  Applies the content-custom/ overlay on top of the pinned engine/content clone, or checks
  whether the overlay has drifted from a since-changed upstream base.

.DESCRIPTION
  content-custom/ is a tracked directory mirroring the top-level layout of engine/content
  (see content-custom/README.md). Every real file placed under one of its subdirectories is
  copied on top of the matching path in engine/content/, creating destination directories as
  needed. Re-running is safe: files whose content already matches are left untouched and
  changed files are overwritten. A file DELETED from content-custom/ is removed from the
  clone on the next apply, restored to upstream's copy where one exists and deleted where it
  does not. The record is a .overlay-manifest sidecar in the clone root, which is git-ignored
  and survives scripts/setup.ps1's force checkout. Every file here must be listed in
  manifest.json; one that is not fails the apply, because -Check only ever walks manifest
  entries and an unlisted file would be checked by nothing.

  content-custom/manifest.json records every file the overlay contributes: kind "replace"
  pairs the path with the sha256 of the upstream (engine/content) file it was authored
  against, kind "new" has a null baseSha256 because no upstream file exists.

  Every recorded hash is the sha256 of the upstream GIT BLOB, i.e. of the bytes
  `git -c core.autocrlf=false show <sha>:<path>` emits, not of the file as it sits on disk.

  -Check rehashes the blob for every recorded path at the clone's current HEAD and exits 1 if
  any of them no longer matches the recorded hash, or has vanished, or if a kind "new" entry
  names a path upstream now has a file at, so a revision bump (scripts/upstream.lock) that
  invalidates an override fails the build instead of being silently applied. It reads the
  blobs rather than the working tree precisely because the overlay has already overwritten the
  working-tree copy of every "replace" file by the time -Check runs. Audit C23: this used to
  hash the working tree and exit 0 either way.

.PARAMETER Check
  Report drift instead of copying. Does not touch engine/content.
#>
param(
  [switch]$Check
)

$ErrorActionPreference = 'Stop'

# The same blob hashing scripts/engine-overlay.ps1 uses, so the two -Checks answer the same
# question the same way. Dot-sourced, never `&`-called. Assert-OverlayHashing is that library's
# self-test: it builds a throwaway repository and proves the hash does not move when the working
# tree does, which is exactly the defect this script carried, and it runs on every invocation,
# apply and -Check alike. Assert-OverlayRemoval is that same idea for Sync-OverlayRemovals below:
# against a throwaway repository it proves that a path dropped from the overlay source is restored
# from upstream where a blob exists and deleted where none does, and that the sidecar is rewritten
# so a later apply does not do it again.
. (Join-Path $PSScriptRoot 'lib\OverlayHash.ps1')
Assert-OverlayHashing
Assert-OverlayRemoval

$root = Split-Path $PSScriptRoot -Parent
$customRoot = Join-Path $root 'content-custom'
$baseRoot = Join-Path $root 'engine\content'
$manifestPath = Join-Path $customRoot 'manifest.json'

if (-not (Test-Path $customRoot)) {
  throw "content-custom/ not found at $customRoot"
}
if (-not (Test-Path $manifestPath)) {
  throw "Manifest not found: $manifestPath"
}

# Returns the whole parsed manifest, not only its files, because -Check reads `base` too.
# Mirrors Get-EngineManifest in scripts/engine-overlay.ps1.
function Get-ContentManifest {
  $raw = Get-Content -LiteralPath $manifestPath -Raw
  if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
  return ($raw | ConvertFrom-Json)
}

if ($Check) {
  if (-not (Test-Path $baseRoot)) {
    throw "Base content clone not found at $baseRoot. Run scripts/setup.ps1 first."
  }

  $manifest = Get-ContentManifest
  $entries = @()
  if ($manifest -and $manifest.PSObject.Properties['files'] -and $manifest.files) { $entries = @($manifest.files) }
  if ($entries.Count -eq 0) {
    throw "content-custom/manifest.json lists no files. A -Check with nothing to check is a green that means nothing."
  }

  # The clone's own HEAD, not manifest.base: base is the sha the recorded hashes were authored
  # against, and hashing its blobs would compare a hash against the blob it was taken from, which
  # can only ever agree. Hashing HEAD's blobs is what answers the question -Check exists to ask.
  # A stale clone makes that comparison vacuous, which is why scripts/verify.ps1 asserts the clone
  # shas against scripts/upstream.lock in the same step.
  $head = Get-CloneHead -CloneRoot $baseRoot

  $drifted = New-Object System.Collections.Generic.List[string]
  $gone = New-Object System.Collections.Generic.List[string]
  $collided = New-Object System.Collections.Generic.List[string]
  foreach ($entry in $entries) {
    $relPath = [string]$entry.path
    if ([string]::IsNullOrEmpty($relPath)) { continue }
    $upstream = Get-UpstreamBlobSha -CloneRoot $baseRoot -Rev $head -RelPath $relPath

    # A "new" entry has no hash to compare, which is exactly why it must be asked the other
    # question: does upstream have a file there NOW? A replace entry relabelled "new", or a bump
    # that adds the path, would otherwise be overwritten on every apply and checked by nothing.
    # Watched failing: relabelling pack/obj.pack as new passed this check before this branch.
    if ([string]$entry.kind -eq 'new') {
      if ($null -ne $upstream) { $collided.Add($relPath) }
      continue
    }

    $recorded = [string]$entry.baseSha256
    if ([string]::IsNullOrEmpty($recorded)) {
      throw "content-custom/manifest.json: $relPath has kind '$($entry.kind)' and no baseSha256. A replace entry with no recorded hash is uncheckable; give it a hash or mark it kind 'new'."
    }

    if ($null -eq $upstream) { $gone.Add($relPath); continue }
    if ($upstream -ne $recorded) { $drifted.Add($relPath) }
  }

  Write-Host "content-overlay -Check: $($entries.Count) manifest entry(ies) checked against the clone's pinned blobs (HEAD $head)."
  if ($manifest.base -and ($manifest.base -ne $head)) {
    Write-Host "  note: manifest base is $($manifest.base); the clone is at $head. Hashes below are compared against the clone."
  }
  if ($gone.Count -gt 0) {
    Write-Host "  base file removed upstream:"
    foreach ($p in $gone) { Write-Host "    $p" }
  }
  if ($drifted.Count -gt 0) {
    Write-Host "  base file changed upstream since the override was recorded (review it against the new content before trusting it):"
    foreach ($p in $drifted) { Write-Host "    $p" }
  }
  if ($collided.Count -gt 0) {
    Write-Host "  recorded as kind 'new' but upstream has a file at that path (make it a replace entry with the upstream blob's sha256, after reading what it overwrites):"
    foreach ($p in $collided) { Write-Host "    $p" }
  }
  if ($gone.Count -eq 0 -and $drifted.Count -eq 0 -and $collided.Count -eq 0) {
    Write-Host "  no drift detected."
    exit 0
  }
  exit 1
}

# --- Default mode: copy content-custom/** over engine/content/ --------------
if (-not (Test-Path $baseRoot)) {
  throw "Base content clone not found at $baseRoot. Run scripts/setup.ps1 first."
}

# The same skip list as scripts/engine-overlay.ps1, and at ANY depth rather than at the root only.
# Before this, content-custom/scripts/README.md would have landed in the clone locally and not in
# the image, a divergence nothing reported.
#
# It is NOT yet the same list as deploy/docker/engine.Dockerfile's content find at :51, which has no
# -mindepth, does not skip PATCHES.md, and matches README* case-insensitively. So a root-level file
# and a nested PATCHES.md still reach the image and not the clone, and a readme.txt still reaches
# the clone and not the image. Nothing in content-custom/ hits any of the three today. The engine
# half of that Dockerfile, its find at :67-68, does match scripts/engine-overlay.ps1 exactly.
$skipNames = @('README.md', 'PATCHES.md', 'manifest.json', '.gitkeep')
$sourceFiles = @(Get-ChildItem -LiteralPath $customRoot -Recurse -File | Where-Object {
  $_.DirectoryName -ne $customRoot -and $skipNames -notcontains $_.Name
})
$sourcePaths = @($sourceFiles | ForEach-Object { $_.FullName.Substring($customRoot.Length + 1).Replace('\', '/') })

# ABOVE the copy loop on purpose. This was a printed note BELOW it, which was harmless while it
# only printed. As a throw it is not: the stray file would be copied into the clone first, and the
# throw would then skip Sync-OverlayRemovals, so the sidecar would never learn about it and the
# stray .pack would sit in engine/content/pack/ forever, read by BuildOverlay.ts's pinned-id check
# and by app.ts's guard.
$manifest = Get-ContentManifest
$manifestPaths = New-Object System.Collections.Generic.HashSet[string]
if ($manifest -and $manifest.files) { foreach ($e in @($manifest.files)) { if ($e.path) { [void]$manifestPaths.Add([string]$e.path) } } }
$unlisted = @($sourcePaths | Where-Object { -not $manifestPaths.Contains($_) })
if ($unlisted.Count -gt 0) {
  foreach ($p in $unlisted) { Write-Host "    not in manifest.json: $p" }
  # An overlay file that is not in the manifest is copied over upstream on every apply and is
  # checked by NOTHING, forever: -Check only ever walks manifest entries, and verify.ps1's
  # git-tracked check reads the same list. The manifest is the definition of what the overlay is,
  # so a file outside it is not an overlay file. Audit C23.
  throw "content-custom holds $($unlisted.Count) file(s) that content-custom/manifest.json does not list; add them with a kind and a baseSha256, or delete them"
}

$copied = 0
$unchanged = 0
$copiedPaths = New-Object System.Collections.Generic.List[string]

foreach ($file in $sourceFiles) {
  $relPath = $file.FullName.Substring($customRoot.Length + 1)
  $destPath = Join-Path $baseRoot $relPath
  $destDir = Split-Path $destPath -Parent
  if (-not (Test-Path -LiteralPath $destDir)) {
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  }

  $needsCopy = $true
  if (Test-Path -LiteralPath $destPath) {
    $srcHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    $dstHash = (Get-FileHash -LiteralPath $destPath -Algorithm SHA256).Hash
    if ($srcHash -eq $dstHash) { $needsCopy = $false }
  }

  if ($needsCopy) {
    Copy-Item -LiteralPath $file.FullName -Destination $destPath -Force
    $copied++
    $copiedPaths.Add($relPath.Replace('\', '/'))
  } else {
    $unchanged++
  }
}

Write-Host "content-overlay: $($sourceFiles.Count) overlay file(s), $copied copied, $unchanged unchanged."
foreach ($p in $copiedPaths) { Write-Host "  copied: $p" }

# The removal path. Anything the last apply owned that this one does not is taken back out of the
# clone: restored from upstream's blob where git has one, deleted where it does not. Without it a
# file deleted from content-custom/ survived in the clone on the machine that had applied it and
# nowhere else, because scripts/setup.ps1's `git checkout -q -f <sha>` restores tracked files and
# leaves untracked ones alone. Audit C23.
$removed = @(Sync-OverlayRemovals -CloneRoot $baseRoot -CurrentPaths $sourcePaths)
if ($removed.Count -gt 0) {
  Write-Host "  removed from the clone (no longer in content-custom/):"
  foreach ($p in $removed) { Write-Host "    $p" }
}

# Explicit success exit, so this script's exit code is the apply's own answer rather than whatever
# the last native command inside it happened to leave behind. Assert-OverlayHashing at the top of
# this file runs git, so $LASTEXITCODE is already 0 by the time the apply path ends today; the
# guard is for the next native call added to this path, whose exit code would otherwise silently
# become this script's. Both -Check paths already exit explicitly; this makes the apply path do the
# same, so the contract is simply "exit code 0 means the apply worked".
#
# Proved by mutation, not by inspection: with `& cmd /c exit 7` inserted just above this line, a
# caller using verify.ps1's Invoke-Native pattern reads 0 while this `exit 0` is present, and dies
# with "content overlay apply failed (exit 7)" once it is deleted. Reading $LASTEXITCODE after a
# bare `& scripts/content-overlay.ps1` does NOT distinguish the two states: it is 0 either way,
# left by the self-test's last git call, so it is no evidence that this line is here.
exit 0
