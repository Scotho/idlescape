# scripts/lib/OverlayHash.ps1 -- the upstream-blob hashing both overlay scripts need.
#
# WHY A BLOB AND NOT THE FILE ON DISK. By the time a -Check runs, the overlay has already
# overwritten the WORKING-TREE copy of every "replace" file with ours, so the working tree can no
# longer answer "what does upstream say?" -- only the committed blob can. scripts/engine-overlay.ps1
# has done this correctly since it was written; scripts/content-overlay.ps1 hashed the working tree
# instead and therefore reported pack/varp.pack as drifted on every run after an apply, then exited
# 0 anyway. Both halves wrong at once, and both documented as expected behaviour in four files.
# This is that code, extracted, with the clone root as a parameter.
#
# -c core.autocrlf=false hashes exactly the bytes git stores. Both clones are checked out with
# core.autocrlf=true, so a file on disk can be CRLF while its blob is LF and the two hash
# differently. Every baseSha256 in either manifest is therefore a BLOB hash. Verified when this
# landed: content-custom/manifest.json's recorded hash for pack/varp.pack equals
# `git -C engine/content -c core.autocrlf=false show HEAD:pack/varp.pack | sha256sum`, so nothing
# had to be re-recorded.
#
# Dot-source this file (`. (Join-Path $PSScriptRoot 'lib\OverlayHash.ps1')`), do not `&` it.
# Windows PowerShell 5.1 only.

function Get-ByteSha {
    # AllowEmptyCollection because a zero-byte blob is a legal upstream file, and a Mandatory
    # collection parameter otherwise refuses an empty array outright.
    param([Parameter(Mandatory = $true)][AllowEmptyCollection()][byte[]]$Bytes)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return (($sha.ComputeHash($Bytes) | ForEach-Object { $_.ToString('X2') }) -join '')
    } finally { $sha.Dispose() }
}

# Runs git inside a clone and returns its stdout as RAW BYTES. Capturing git through the pipeline
# would decode the output as text and normalise the line endings, which would make the hash depend
# on the reader's console encoding rather than on the blob.
function Invoke-GitInClone {
    param(
        [Parameter(Mandatory = $true)][string]$CloneRoot,
        [Parameter(Mandatory = $true)][string[]]$GitArgs
    )
    $quoted = @()
    foreach ($a in $GitArgs) {
        if ($a -match '[\s"]') { $quoted += ('"' + $a.Replace('"', '\"') + '"') } else { $quoted += $a }
    }
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'git'
    $psi.Arguments = ($quoted -join ' ')
    $psi.WorkingDirectory = $CloneRoot
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $proc = [System.Diagnostics.Process]::Start($psi)
    $buffer = New-Object System.IO.MemoryStream
    $proc.StandardOutput.BaseStream.CopyTo($buffer)
    $stderr = $proc.StandardError.ReadToEnd()
    $proc.WaitForExit()
    $exit = $proc.ExitCode
    $proc.Dispose()
    return [pscustomobject]@{ ExitCode = $exit; Bytes = $buffer.ToArray(); Stderr = $stderr }
}

function Get-CloneHead {
    param([Parameter(Mandatory = $true)][string]$CloneRoot)
    $result = Invoke-GitInClone -CloneRoot $CloneRoot -GitArgs @('rev-parse', 'HEAD')
    if ($result.ExitCode -ne 0) {
        throw "Could not read HEAD of the clone at $CloneRoot (git exit $($result.ExitCode)): $($result.Stderr)"
    }
    return ([System.Text.Encoding]::ASCII.GetString($result.Bytes)).Trim()
}

# The sha256 of the pristine upstream bytes for a path at a revision. $null when the path does not
# exist at that revision, which the caller reports as "removed upstream" rather than as drift.
function Get-UpstreamBlobSha {
    param(
        [Parameter(Mandatory = $true)][string]$CloneRoot,
        [Parameter(Mandatory = $true)][string]$Rev,
        [Parameter(Mandatory = $true)][string]$RelPath
    )
    $spec = $Rev + ':' + ($RelPath -replace '\\', '/')
    $result = Invoke-GitInClone -CloneRoot $CloneRoot -GitArgs @('-c', 'core.autocrlf=false', 'show', $spec)
    if ($result.ExitCode -ne 0) { return $null }
    return (Get-ByteSha $result.Bytes)
}

# The permanent form of the defect this library exists to remove: a check that hashes the working
# tree instead of the blob. Builds a throwaway repository, commits one file, then makes the working
# tree disagree with it, and asserts the answer did not move. Runs on every invocation of either
# overlay script, costs about a second, and never reads this repository, so a corrupt working tree
# cannot make it pass by accident (the precedent is Assert-LineCounting in scripts/line-ceiling.ps1).
function Assert-OverlayHashing {
    $dir = Join-Path $env:TEMP ('overlay-hash-selftest-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $dir | Out-Null
    try {
        $file = Join-Path $dir 'a.txt'
        [System.IO.File]::WriteAllText($file, "one`ntwo`n")

        Push-Location $dir
        try {
            # git init and git commit write progress and hints to stderr, and the callers of this
            # library run with $ErrorActionPreference = 'Stop', which turns a native command's
            # stderr into a terminating error. Suppressed locally, the way verify.ps1 does it for
            # `git ls-files --error-unmatch`, so the exit code below is what decides.
            $ErrorActionPreference = 'Continue'
            & git init -q . *> $null
            & git config core.autocrlf false *> $null
            & git config user.email 'selftest@example.invalid' *> $null
            & git config user.name 'selftest' *> $null
            & git add a.txt *> $null
            & git -c core.safecrlf=false commit -q -m selftest *> $null
            if ($LASTEXITCODE -ne 0) { throw "Assert-OverlayHashing could not build its fixture repository (git exit $LASTEXITCODE)" }
        } finally {
            $ErrorActionPreference = 'Stop'
            Pop-Location
        }

        $expected = Get-ByteSha ([System.Text.Encoding]::ASCII.GetBytes("one`ntwo`n"))
        $head = Get-CloneHead -CloneRoot $dir

        $blob = Get-UpstreamBlobSha -CloneRoot $dir -Rev $head -RelPath 'a.txt'
        if ($blob -ne $expected) { throw "Assert-OverlayHashing: the committed blob hashed $blob, expected $expected" }

        # Make the working tree disagree, in both content and line endings. The answer must not move.
        [System.IO.File]::WriteAllText($file, "one`r`ntwo`r`nthree`r`n")
        $after = Get-UpstreamBlobSha -CloneRoot $dir -Rev $head -RelPath 'a.txt'
        if ($after -ne $expected) {
            throw "Assert-OverlayHashing: the hash moved to $after after the WORKING TREE changed, so this is reading the file on disk and not the blob. That is audit C23's content-overlay defect, back again."
        }

        $absent = Get-UpstreamBlobSha -CloneRoot $dir -Rev $head -RelPath 'nope.txt'
        if ($null -ne $absent) { throw "Assert-OverlayHashing: an absent path must hash to `$null, got $absent" }
    } finally {
        Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# THE REMOVAL PATH. Both overlay scripts only ever copied, and both README files said so:
# "nothing is ever duplicated or removed". scripts/setup.ps1's `git checkout -q -f <sha>` restores
# TRACKED files and leaves untracked ones, so an overlay file deleted from engine-custom/ or
# content-custom/ survives in the clone on the machine that had applied it, and nowhere else.
# Nobody else sees it, and nobody sees that it is gone. Audit C23.
#
# The record is a `.overlay-manifest` sidecar in the clone root. Both clone roots are under
# /engine/, which .gitignore:8 covers, so it is never tracked, and checkout -f leaves it alone,
# which is what makes it useful across a re-pin. On each apply, every path in the previous sidecar
# that is no longer in the current source set is RESTORED from the clone's git objects if git knows
# it, and DELETED if git says it does not know the path (a "new" overlay file has no upstream
# counterpart). Any OTHER git failure is fatal rather than a deletion; see the branch below.
#
# A removal does not prune a directory it empties, so engine/content/scripts/foo/ can outlive the
# last file the overlay put in it. Deliberate: the residue is one empty directory in a git-ignored
# clone that scripts/setup.ps1 recreates, and pruning upwards is how a script deletes more than it
# meant to.
#
# Call it as `@(Sync-OverlayRemovals ...)`: PowerShell unrolls a returned array, so an empty result
# comes back as $null and a one-element result as a bare string unless the caller re-wraps it.
function Sync-OverlayRemovals {
    param(
        [Parameter(Mandatory = $true)][string]$CloneRoot,
        [AllowEmptyCollection()][string[]]$CurrentPaths
    )
    $sidecar = Join-Path $CloneRoot '.overlay-manifest'
    $removed = New-Object System.Collections.Generic.List[string]

    $current = New-Object System.Collections.Generic.HashSet[string]
    foreach ($p in $CurrentPaths) { [void]$current.Add($p) }

    if (Test-Path -LiteralPath $sidecar) {
        foreach ($raw in @(Get-Content -LiteralPath $sidecar)) {
            $p = $raw.Trim()
            if ($p.Length -eq 0) { continue }
            if ($current.Contains($p)) { continue }

            $full = Join-Path $CloneRoot ($p -replace '/', '\')
            $restore = Invoke-GitInClone -CloneRoot $CloneRoot -GitArgs @('checkout', '--', $p)
            if ($restore.ExitCode -eq 0) {
                $removed.Add("$p (restored from upstream)")
            } elseif ($restore.Stderr -match 'did not match any file') {
                # The ONLY non-zero exit that means "git does not know this path", which is what
                # makes deleting the right answer. Every other failure -- no .git, a corrupt object
                # store, an index.lock another process holds, git missing -- also exits non-zero,
                # and treating those as "no upstream file" would delete every overlay-owned path in
                # the clone and print the lot as an ordinary removal list. start-stack.ps1 applies
                # on every start, so that is 36 tracked engine files, silently.
                if (Test-Path -LiteralPath $full) { Remove-Item -LiteralPath $full -Force }
                $removed.Add("$p (deleted; no upstream file)")
            } else {
                throw "Sync-OverlayRemovals: git checkout of $p in $CloneRoot failed for a reason other than an unknown path (exit $($restore.ExitCode)): $($restore.Stderr)"
            }
        }
    }

    [System.IO.File]::WriteAllLines($sidecar, [string[]]$CurrentPaths)
    return $removed.ToArray()
}

# Proves the removal path both removes and restores, against a throwaway repository. Without this
# the function's first real run would be its first test, on a clone somebody cares about. Runs on
# every invocation of either overlay script, beside Assert-OverlayHashing, and never reads this
# repository.
function Assert-OverlayRemoval {
    $dir = Join-Path $env:TEMP ('overlay-removal-selftest-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $dir | Out-Null
    try {
        $tracked = Join-Path $dir 'tracked.txt'
        [System.IO.File]::WriteAllText($tracked, "upstream`n")
        Push-Location $dir
        try {
            # Same local 'Continue' the fixture in Assert-OverlayHashing needs, and for the same
            # reason: git init and git commit write to stderr, and both callers of this library run
            # with $ErrorActionPreference = 'Stop', which turns that into a terminating error.
            $ErrorActionPreference = 'Continue'
            & git init -q . *> $null
            & git config core.autocrlf false *> $null
            & git config user.email 'selftest@example.invalid' *> $null
            & git config user.name 'selftest' *> $null
            & git add tracked.txt *> $null
            & git -c core.safecrlf=false commit -q -m selftest *> $null
            if ($LASTEXITCODE -ne 0) { throw "Assert-OverlayRemoval could not build its fixture repository (git exit $LASTEXITCODE)" }
        } finally {
            $ErrorActionPreference = 'Stop'
            Pop-Location
        }

        # Apply one: the overlay owns a replaced file and a brand new one.
        [System.IO.File]::WriteAllText($tracked, "ours`n")
        $untracked = Join-Path $dir 'ours.txt'
        [System.IO.File]::WriteAllText($untracked, "ours`n")
        $none = @(Sync-OverlayRemovals -CloneRoot $dir -CurrentPaths @('tracked.txt', 'ours.txt'))
        if ($none.Count -ne 0) { throw "Assert-OverlayRemoval: a first apply removed $($none.Count) file(s), expected 0" }

        # Apply two: both are gone from the overlay source.
        $gone = @(Sync-OverlayRemovals -CloneRoot $dir -CurrentPaths @())
        if ($gone.Count -ne 2) { throw "Assert-OverlayRemoval: expected 2 removals, got $($gone.Count): $($gone -join ', ')" }
        # Restore first, then deletion, so a mutation that breaks one is named by its own message
        # rather than by the other's.
        $restored = [System.IO.File]::ReadAllText($tracked)
        if ($restored -ne "upstream`n") { throw "Assert-OverlayRemoval: a replaced file must go back to upstream's bytes, got '$restored'" }
        if (Test-Path -LiteralPath $untracked) { throw 'Assert-OverlayRemoval: a new overlay file with no upstream counterpart must be deleted' }

        # Apply three: nothing owned, nothing left to remove. Proves the sidecar was rewritten by
        # apply two rather than left holding the two paths it has just dealt with, which would make
        # every later apply re-run a `git checkout` for files the overlay no longer mentions.
        $again = @(Sync-OverlayRemovals -CloneRoot $dir -CurrentPaths @())
        if ($again.Count -ne 0) { throw "Assert-OverlayRemoval: a repeat apply removed $($again.Count) file(s), so the sidecar was not rewritten" }

        Assert-OverlayRemovalRefusesBrokenGit
    } finally {
        Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# The half of the removal path that must NOT act: a git failure that is not "git does not know this
# path". A clone can fail a checkout for reasons that have nothing to do with the path -- a broken
# or absent .git, a corrupt object store, an index.lock another process holds -- and the first cut
# of Sync-OverlayRemovals discriminated on the exit code alone, so every one of those deleted the
# file and printed it as an ordinary removal. The fixture is the cheapest reproduction of that
# class: a directory holding a sidecar, a real file, and a `.git` gitfile pointing at a directory
# that is not there, which is exactly what a half-deleted clone looks like. A gitfile rather than
# no `.git` at all, because git walks upwards, and an empty directory inside a repository would
# find that repository and fail with an unknown-path error instead, which is the other branch.
function Assert-OverlayRemovalRefusesBrokenGit {
    $dir = Join-Path $env:TEMP ('overlay-removal-brokengit-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $dir | Out-Null
    try {
        $keep = Join-Path $dir 'upstream.txt'
        [System.IO.File]::WriteAllText($keep, "upstream`n")
        [System.IO.File]::WriteAllText((Join-Path $dir '.git'), "gitdir: ./not-a-directory`n")
        [System.IO.File]::WriteAllLines((Join-Path $dir '.overlay-manifest'), [string[]]@('upstream.txt'))

        $threw = $false
        try { [void](Sync-OverlayRemovals -CloneRoot $dir -CurrentPaths @()) } catch { $threw = $true }
        if (-not (Test-Path -LiteralPath $keep)) {
            throw 'Assert-OverlayRemoval: a git failure that is not an unknown path must not delete the file. Sync-OverlayRemovals is discriminating on the exit code alone again, which strips every overlay-owned path out of a clone whose git is broken.'
        }
        if (-not $threw) { throw 'Assert-OverlayRemoval: a git failure that is not an unknown path must throw, not be reported as a normal removal' }
    } finally {
        Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
