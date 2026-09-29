# scripts/lib/UpstreamLock.ps1 -- scripts/upstream.lock, parsed once and compared to reality.
#
# The lock pins three shas and nothing ever compared a clone to it. That matters more than it
# looks: scripts/engine-overlay.ps1 -Check resolves the CLONE's own HEAD and hashes that revision's
# blobs, which is right, but on a STALE clone HEAD is the revision every recorded hash was taken
# from, so every comparison agrees and the check passes vacuously while verify.ps1 prints
# "verify passed". Both clones happen to be current today, which is the only reason this has been
# invisible. Audit C23.
#
# Windows PowerShell 5.1 only. Dot-source, do not `&`.

function Read-UpstreamLock {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { throw "upstream lock not found: $Path" }

    $lock = @{}
    foreach ($raw in (Get-Content -LiteralPath $Path)) {
        $line = $raw.Trim()
        if ($line.Length -eq 0) { continue }
        if ($line.StartsWith('#')) { continue }
        $parts = $line -split '\s+'
        if ($parts.Length -ne 2) { throw "upstream lock line is not '<key> <sha>': $line" }
        $lock[$parts[0]] = $parts[1]
    }
    if ($lock.Count -eq 0) { throw "upstream lock $Path has no entries" }
    return $lock
}

# The two clones scripts/setup.ps1 creates must sit at the shas the lock names. Reports BOTH before
# throwing, so a bump that moved one and not the other is one message rather than two runs.
function Assert-ClonePins {
    param([Parameter(Mandatory = $true)][string]$Root)
    . (Join-Path $PSScriptRoot 'OverlayHash.ps1')

    $lock = Read-UpstreamLock -Path (Join-Path $Root 'scripts\upstream.lock')
    $wrong = New-Object System.Collections.Generic.List[string]
    foreach ($rel in @('engine/server', 'engine/content')) {
        $dir = Join-Path $Root ($rel -replace '/', '\')
        if (-not (Test-Path -LiteralPath (Join-Path $dir '.git'))) {
            $wrong.Add("$rel is not a clone at $dir; run scripts/setup.ps1")
            continue
        }
        $pinned = [string]$lock[$rel]
        if ([string]::IsNullOrEmpty($pinned)) {
            $wrong.Add("$rel has no pinned sha in scripts/upstream.lock")
            continue
        }
        $head = Get-CloneHead -CloneRoot $dir
        if ($head -ne $pinned) {
            $wrong.Add("$rel is at $head, scripts/upstream.lock pins $pinned")
        }
    }

    if ($wrong.Count -gt 0) {
        foreach ($w in $wrong) { Write-Host "    $w" }
        throw "the pinned clones do not match scripts/upstream.lock; run scripts/setup.ps1 to re-pin. Every overlay drift check resolves the CLONE's HEAD, so on a stale clone it compares each recorded hash against the blob it was taken from and can only agree."
    }
    Write-Host "  engine/server and engine/content match scripts/upstream.lock."
}

# Two shapes a hand-edited lock takes, and the empty file that would make Assert-ClonePins skip
# everything silently. Runs before any real parse, and never reads this repository.
function Assert-LockParsing {
    $dir = Join-Path $env:TEMP ('upstream-lock-selftest-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $dir | Out-Null
    try {
        $good = Join-Path $dir 'good.lock'
        [System.IO.File]::WriteAllLines($good, @('# a comment', '', 'engine/server abc123', 'client def456'))
        $parsed = Read-UpstreamLock -Path $good
        if ($parsed.Count -ne 2) { throw "Assert-LockParsing: expected 2 entries, got $($parsed.Count)" }
        if ($parsed['engine/server'] -ne 'abc123') { throw "Assert-LockParsing: engine/server parsed as $($parsed['engine/server'])" }

        $empty = Join-Path $dir 'empty.lock'
        [System.IO.File]::WriteAllLines($empty, @('# nothing but comments'))
        $threw = $false
        try { Read-UpstreamLock -Path $empty } catch { $threw = $true }
        if (-not $threw) { throw "Assert-LockParsing: an all-comment lock must throw, or Assert-ClonePins would silently check nothing" }

        $malformed = Join-Path $dir 'bad.lock'
        [System.IO.File]::WriteAllLines($malformed, @('engine/server abc123 extra'))
        $threw = $false
        try { Read-UpstreamLock -Path $malformed } catch { $threw = $true }
        if (-not $threw) { throw "Assert-LockParsing: a three-field line must throw" }
    } finally {
        Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
