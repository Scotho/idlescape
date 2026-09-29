<#
.SYNOPSIS
  Runs the machine-readable patch assertions in the four patch records, and checks the pristine-274
  claim client/PATCHES.md makes about the rest of the fork.

.DESCRIPTION
  Audit C24: 28 numbered patches inside a 14,481-line file rested on grep lines in a shell fence
  that no script ran, and one of them (patch 9) had no runnable proof at all while the block's own
  heading said "How to verify all patches are present".

  WHY NOT PARSE THE OLD `grep -c "..." file  # N` LINES. The dialect they used has five shapes:
  plain substring, BRE-escaped brackets, a `^` anchor, a `\|` alternation, and one `grep -A5 ... |
  grep -c` pipeline. The audit proposed running each with Select-String -SimpleMatch, which is
  wrong for eight of the 104 lines: seven become false failures and one, the assertion that packet
  logging and auto-login were never vendored from rs-sdk, becomes a false PASS. The repository had
  already shipped one such defect: client/PATCHES.md's patch 28 table row escaped a table-cell pipe
  as `\|`, which grep reads as alternation and answers 7 instead of 1. So the rows carry the
  LITERAL text and express anchoring structurally, and this script never sees a shell command.

  THE ROW GRAMMAR. Inside a ```patches-check fence: one `root: <path>` directive, then
      <tag> | <mode> | <expected> | <file> | <literal>
  split on the FIRST FOUR pipes only, so a literal containing a pipe survives verbatim. Blank lines
  and lines starting with # are notes. Modes:
      contains      <expected> lines contain the literal
      startswith    <expected> lines start with it (the old ^ anchored greps)
      after:<n>     <expected> lines within <n> lines AFTER the previous row's matches contain it
                    (the old grep -A5 pipeline; patch 27's polarity check)
  The literal is everything after the fourth pipe with ONE leading space removed and trailing
  whitespace trimmed, so an indent-sensitive literal is written with its indent after that space.

  A row whose target file does not exist is a FAILURE, never a skip. engine/server is a git-ignored
  clone, so on a tree where scripts/setup.ps1 has not run the engine record's targets are absent,
  and a skip that reads as green is exactly what this exists to remove.

  THE FOUR RECORDS. client/PATCHES.md (the fork's numbered patches, with a coverage assertion),
  engine-custom/PATCHES.md (the engine overlay, no numbered table so no coverage set), and the two
  vendor records under client/src/vendor and web/src/vendor, which pin the rs-sdk sha and its
  licence. Beyond the rows, the client half also diffs client/ against the import commit recorded as
  client-import in scripts/upstream.lock, which is what makes "everything else is pristine 274"
  mechanical rather than remembered.

  Windows PowerShell 5.1 only.

.PARAMETER Only
  'client' (the fork's record, the two vendor records and the pristine check) or 'engine' (the
  overlay's record). Default: every record, and the pristine check.
#>
param([ValidateSet('client', 'engine')][string]$Only)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function ConvertTo-PatchRows {
    # AllowEmptyString is load-bearing: a Mandatory [string[]] rejects an array that contains an
    # empty element, and every one of these documents has blank lines. Without it the parser dies
    # on the FIRST real record with a parameter-binding error and only the blank-line-free fixture
    # in Assert-PatchMatching ever gets through.
    param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string[]]$Lines,
        [Parameter(Mandatory = $true)][string]$Source
    )
    $rows = New-Object System.Collections.Generic.List[psobject]
    $inFence = $false
    $fenceRoot = ''

    for ($i = 0; $i -lt $Lines.Count; $i++) {
        $line = $Lines[$i]
        $trimmed = $line.Trim()

        if (-not $inFence) {
            # Only a patches-check fence. engine-custom/PATCHES.md carries two other fenced blocks,
            # a repro command and a packing recipe, which a runner that treated every fence as
            # assertions would try to execute.
            if ($trimmed -eq '```patches-check') { $inFence = $true; $fenceRoot = '' }
            continue
        }
        if ($trimmed -eq '```') { $inFence = $false; continue }
        if ($trimmed.Length -eq 0) { continue }
        if ($trimmed.StartsWith('#')) { continue }
        if ($trimmed.StartsWith('root:')) { $fenceRoot = $trimmed.Substring(5).Trim(); continue }

        $parts = $line -split '\|', 5
        if ($parts.Count -ne 5) { throw "${Source}:$($i + 1): a row needs 5 pipe-separated fields, got $($parts.Count): $trimmed" }
        if ($fenceRoot.Length -eq 0) { throw "${Source}:$($i + 1): this fence has no 'root:' line" }

        $expectedText = $parts[2].Trim()
        $expected = 0
        if (-not [int]::TryParse($expectedText, [ref]$expected)) { throw "${Source}:$($i + 1): expected count '$expectedText' is not an integer" }

        $literal = $parts[4]
        if ($literal.StartsWith(' ')) { $literal = $literal.Substring(1) }
        $literal = $literal.TrimEnd()
        if ($literal.Length -eq 0) { throw "${Source}:$($i + 1): the literal is empty" }

        $rows.Add([pscustomobject]@{
            Source   = $Source
            Line     = $i + 1
            Tag      = $parts[0].Trim()
            Mode     = $parts[1].Trim()
            Expected = $expected
            Root     = $fenceRoot
            File     = $parts[3].Trim()
            Literal  = $literal
        })
    }

    if ($inFence) { throw "${Source}: a patches-check fence is never closed" }
    return $rows.ToArray()
}

function Measure-PatchRows {
    param([Parameter(Mandatory = $true)][psobject[]]$Rows, [Parameter(Mandatory = $true)][string]$Base)
    $failures = New-Object System.Collections.Generic.List[string]
    $lastHits = @()

    foreach ($row in $Rows) {
        $full = Join-Path (Join-Path $Base ($row.Root -replace '/', '\')) ($row.File -replace '/', '\')
        if (-not (Test-Path -LiteralPath $full)) {
            $failures.Add("$($row.Source):$($row.Line) [$($row.Tag)] file not found :: $($row.Root)/$($row.File)")
            $lastHits = @()
            continue
        }

        $lines = @(Get-Content -LiteralPath $full)
        $hits = New-Object System.Collections.Generic.List[int]

        if ($row.Mode -eq 'contains') {
            for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i].Contains($row.Literal)) { [void]$hits.Add($i) } }
        } elseif ($row.Mode -eq 'startswith') {
            for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i].StartsWith($row.Literal)) { [void]$hits.Add($i) } }
        } elseif ($row.Mode -like 'after:*') {
            $span = 0
            if (-not [int]::TryParse($row.Mode.Substring(6), [ref]$span)) { throw "$($row.Source):$($row.Line): 'after:' needs a line count" }
            foreach ($anchor in $lastHits) {
                $to = [Math]::Min($lines.Count - 1, $anchor + $span)
                for ($i = $anchor + 1; $i -le $to; $i++) { if ($lines[$i].Contains($row.Literal)) { [void]$hits.Add($i) } }
            }
        } else {
            throw "$($row.Source):$($row.Line): unknown mode '$($row.Mode)'"
        }

        if ($hits.Count -ne $row.Expected) {
            $failures.Add("$($row.Source):$($row.Line) [$($row.Tag)] expected $($row.Expected) got $($hits.Count) :: $($row.Literal) :: $($row.Root)/$($row.File)")
        }
        # An after: row measures against the PREVIOUS anchor row, so it must not become the anchor.
        if ($row.Mode -notlike 'after:*') { $lastHits = @($hits) }
    }

    return $failures.ToArray()
}

# The precedent is Assert-LineCounting in scripts/line-ceiling.ps1: a gate whose first run is green
# and that nobody has watched fail is worth nothing. Four fixture rows for the three ways a row can
# be wrong plus one that must pass, and a FIFTH that is the regression test for the defect this
# grammar exists to remove: a literal containing a pipe. A self-test that only proved "a broken row
# is reported" would still have shipped the escaped-alternation bug.
#
# THE FIXTURE ALSO HAS TO TELL `contains` AND `startswith` APART, in both directions, or one of the
# three modes is exactly the unwatched gate this function exists to prevent. That does not happen by
# itself: every real startswith literal in client/PATCHES.md occurs once in Client.ts, so a matcher
# that ignored anchoring would answer 1 for all of them and stay green. So Sample.ts carries two
# lines that each match one mode and not the other:
#   * `        walkTo(...)`, deeper-indented, CONTAINS the `    walkTo` literal but does not START
#     with it, so degrading startswith to contains answers 2 against an expected 1.
#   * the objIconDataUrl signature is INDENTED, so its literal is not at the start of its line and
#     degrading contains to startswith answers 0 against an expected 1.
# Both mutations were run and both make the exact-failure-set assertion below throw.
function Assert-PatchMatching {
    $dir = Join-Path $env:TEMP ('patches-check-selftest-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path (Join-Path $dir 'zone') | Out-Null
    try {
        $sample = Join-Path (Join-Path $dir 'zone') 'Sample.ts'
        [System.IO.File]::WriteAllLines($sample, [string[]]@(
            '    private objIconDataUrl(id: number, count: number): string | null {',
            '    walkTo(x: number, z: number, opts: WalkOptions) {',
            '        walkTo(x: number, z: number, opts);',
            'if (!this.attended) {',
            '    // two stock assignments',
            '    this.out.p1isaac(ClientProt.IDLE_TIMER);',
            'present twice',
            'present twice'
        ))

        $doc = Join-Path $dir 'FIXTURE.md'
        [System.IO.File]::WriteAllLines($doc, [string[]]@(
            '```patches-check',
            'root: zone',
            '# a note the parser must ignore',
            'pipe-literal | contains | 1 | Sample.ts | private objIconDataUrl(id: number, count: number): string | null {',
            'indent | startswith | 1 | Sample.ts |     walkTo(x: number, z: number',
            'anchor | contains | 1 | Sample.ts | if (!this.attended) {',
            'context | after:5 | 1 | Sample.ts | ClientProt.IDLE_TIMER',
            'polarity | contains | 0 | Sample.ts | if (this.attended) {',
            'wrong-count | contains | 1 | Sample.ts | present twice',
            'absent | contains | 1 | Sample.ts | this literal is not in the file',
            'missing-file | contains | 1 | Nope.ts | anything at all',
            '```'
        ))

        $rows = ConvertTo-PatchRows -Lines (Get-Content -LiteralPath $doc) -Source 'FIXTURE.md'
        if ($rows.Count -ne 8) { throw "Assert-PatchMatching: parsed $($rows.Count) rows, expected 8 (a note line or the root directive was counted as a row)" }

        $failures = Measure-PatchRows -Rows $rows -Base $dir
        $reported = @($failures | ForEach-Object { ($_ -split '\[')[1] -replace '\].*', '' })
        $expected = @('wrong-count', 'absent', 'missing-file')
        $diff = Compare-Object -ReferenceObject $expected -DifferenceObject $reported
        if ($null -ne $diff) {
            throw "Assert-PatchMatching: reported [$($reported -join ', ')], expected exactly [$($expected -join ', ')]. Full output:`n$($failures -join "`n")"
        }
    } finally {
        Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# One record per patch log. Floor: a parse that matched nothing would pass forever, and this is the
# same guard scripts/line-ceiling.ps1 carries for the same reason. Raise a floor when a fence grows;
# the script PRINTS the real counts so no document has to quote one (the client-patch skill claimed
# "All 81 currently pass" against a mechanical count of 65).
$records = @(
    @{ Name = 'client'; Doc = 'client/PATCHES.md'; Floor = 60; Coverage = $true },
    @{ Name = 'engine'; Doc = 'engine-custom/PATCHES.md'; Floor = 40; Coverage = $false },
    @{ Name = 'client'; Doc = 'client/src/vendor/PATCHES.md'; Floor = 3; Coverage = $false },
    @{ Name = 'client'; Doc = 'web/src/vendor/PATCHES.md'; Floor = 2; Coverage = $false }
)

Assert-PatchMatching

$selected = $records
if ($Only) { $selected = @($records | Where-Object { $_.Name -eq $Only }) }
if ($selected.Count -eq 0) { throw "no patch record named '$Only'" }

$allFailures = New-Object System.Collections.Generic.List[string]
foreach ($record in $selected) {
    $docPath = Join-Path $root ($record.Doc -replace '/', '\')
    if (-not (Test-Path -LiteralPath $docPath)) { throw "patch record not found: $($record.Doc)" }

    $lines = @(Get-Content -LiteralPath $docPath)
    $rows = ConvertTo-PatchRows -Lines $lines -Source $record.Doc
    if ($rows.Count -lt $record.Floor) {
        throw "$($record.Doc) parsed $($rows.Count) assertion(s), floor $($record.Floor). A green from an empty parse would mean nothing; if the fences really shrank, lower the floor in scripts/patches-check.ps1 and say why."
    }

    foreach ($f in (Measure-PatchRows -Rows $rows -Base $root)) { $allFailures.Add($f) }

    $patchIds = @()
    if ($record.Coverage) {
        # Every numbered row in the patches table must have at least one assertion. This is what
        # catches patch 9, whose only "grep that proves it" lived in the table and in no fence, so a
        # copy-paste of the block verified 27 of 28 while reading as complete.
        $tableIds = New-Object System.Collections.Generic.List[string]
        foreach ($line in $lines) {
            if ($line -match '^\|\s*(\d+b?)\s*\|') { $tableIds.Add($Matches[1]) }
        }
        if ($tableIds.Count -lt 29) { throw "$($record.Doc): found $($tableIds.Count) numbered patch rows in the table, expected at least 29" }

        $tagged = New-Object System.Collections.Generic.HashSet[string]
        foreach ($rowItem in $rows) {
            if ($rowItem.Tag -match '^patch\s+(\d+b?)$') { [void]$tagged.Add($Matches[1]) }
        }
        foreach ($id in $tableIds) {
            if (-not $tagged.Contains($id)) {
                $allFailures.Add("$($record.Doc) [coverage] patch $id has no assertion row; add one to a patches-check fence")
            }
        }
        $patchIds = @($tableIds)
    }

    $summary = "  $($record.Doc): $($rows.Count) assertion(s)"
    if ($record.Coverage) {
        # The ROW count and the HIGH-WATER MARK are different numbers and both get printed, because
        # the two documents that quote one (the client-patch skill and docs/README.md) mean the mark.
        # 21b is a real table row, so the rows are 29 while the numbering is at 28; printing only the
        # row count would hand the next session a mechanical-looking 29 to reconcile against a
        # correct 28. Ruling R7: printed, never asserted, so patch 29 needs no constant edited.
        $maxPatch = 0
        foreach ($id in $patchIds) {
            $n = [int]($id -replace '[^0-9]', '')
            if ($n -gt $maxPatch) { $maxPatch = $n }
        }
        $summary = "$summary across $($patchIds.Count) numbered patch row(s); numbering is at $maxPatch"
    }
    Write-Host $summary
}

# client/PATCHES.md's "everything else in client/ is the pristine 274 tree except the call sites
# below" rested on nothing: the rows cover 28 anchors inside Client.ts and say nothing about the
# other ~97 files. Measured when this landed, `git diff --name-status <import> HEAD -- client/` was
# 32 paths: 6 modifications (PATCHES.md, bundle.ts, package.json, src/client/Client.ts and the two
# src/hooks/ files) and 26 additions, 25 of them inside the three directories that are ours and the
# 26th tsconfig.check.json. So an allowed-path set makes the claim mechanical with no exceptions to
# carve out: five named files plus three prefixes covers all 32.
#
# The lock's `client` row stays unenforced here, deliberately: Assert-ClonePins (in
# scripts/lib/UpstreamLock.ps1) iterates the two CLONES, and client/ is a tracked directory with no
# HEAD of its own. `client-import` stands in for it, and this block is the only thing that reads it.
if (-not $Only -or $Only -eq 'client') {
    . (Join-Path $PSScriptRoot 'lib\UpstreamLock.ps1')
    $lock = Read-UpstreamLock -Path (Join-Path $root 'scripts\upstream.lock')

    $importSha = [string]$lock['client-import']
    if ([string]::IsNullOrEmpty($importSha)) { throw "scripts/upstream.lock has no client-import row; the pristine-274 claim in client/PATCHES.md cannot be checked without it" }

    $allowedFiles = @(
        'client/PATCHES.md', 'client/bundle.ts', 'client/package.json', 'client/tsconfig.check.json',
        'client/src/client/Client.ts'
    )
    $allowedPrefixes = @('client/src/hooks/', 'client/src/plugins/', 'client/src/vendor/')

    # Against the WORKING TREE, not HEAD, like every other check in verify.ps1: a stray file that is
    # staged or merely on disk under client/ would otherwise pass this gate and be committed by the
    # same session on the strength of the green. `git diff <commit>` compares the commit to the
    # working tree; untracked files are invisible to it, so ls-files --others adds them.
    $changed = @()
    $untracked = @()
    try {
        $ErrorActionPreference = 'Continue'
        $changed = @(& git -C $root diff --name-only $importSha -- client/)
        $diffExit = $LASTEXITCODE
        $untracked = @(& git -C $root ls-files --others --exclude-standard -- client/)
    } finally { $ErrorActionPreference = 'Stop' }
    if ($diffExit -ne 0) { throw "git diff against the client import commit $importSha failed; is it still reachable from HEAD?" }
    if ($LASTEXITCODE -ne 0) { throw 'git ls-files --others under client/ failed' }
    $changed = @($changed + $untracked | Sort-Object -Unique)
    if ($changed.Count -eq 0) { throw "git diff against $importSha listed no changed paths under client/, which cannot be right: bundle.ts, package.json, PATCHES.md and Client.ts all carry our edits" }

    $strays = 0
    foreach ($p in $changed) {
        $path = $p.Replace('\', '/')
        if ($allowedFiles -contains $path) { continue }
        $ok = $false
        foreach ($prefix in $allowedPrefixes) { if ($path.StartsWith($prefix)) { $ok = $true } }
        if (-not $ok) {
            $strays++
            $allFailures.Add("client/PATCHES.md [pristine] $path differs from the 274 import $($importSha.Substring(0, 7)) and is not a numbered-patch file. Record it as a numbered patch, or add it to the allowed set in scripts/patches-check.ps1 with a reason.")
        }
    }
    $verdict = 'all inside the numbered-patch set'
    if ($strays -gt 0) { $verdict = "$strays outside the allowed set" }
    Write-Host "  client/: $($changed.Count) path(s) differ from the 274 import, $verdict."

    # The lock's rs-sdk row is otherwise read by nothing. Each vendor record's pin row asserts the
    # sha against its OWN provenance line, which is a different file from the lock, so without this
    # the three could drift apart silently and a bump could update one and not the others. The pin
    # rows are startswith over the whole provenance line, so bumping the lock alone fails here, and
    # bumping a row's literal alone fails that row against the line it is asserting.
    $rsSdk = [string]$lock['rs-sdk']
    if ([string]::IsNullOrEmpty($rsSdk)) { throw "scripts/upstream.lock has no rs-sdk row; the two vendor records pin a sha that nothing would then cross-check" }
    foreach ($vendorDoc in @('client\src\vendor\PATCHES.md', 'web\src\vendor\PATCHES.md')) {
        $vendorPath = Join-Path $root $vendorDoc
        if (-not (Test-Path -LiteralPath $vendorPath)) { throw "vendor record not found: $vendorDoc" }
        $vendorText = [System.IO.File]::ReadAllText($vendorPath)
        if (-not $vendorText.Contains($rsSdk)) {
            $allFailures.Add("$($vendorDoc.Replace('\', '/')) [lock] does not name the rs-sdk sha $($rsSdk.Substring(0, 7)) that scripts/upstream.lock pins")
        }
    }
    Write-Host "  rs-sdk: scripts/upstream.lock and both vendor records name the same sha."
}

if ($allFailures.Count -gt 0) {
    Write-Host "`n$($allFailures.Count) patch assertion(s) failed:"
    foreach ($f in $allFailures) { Write-Host "  $f" }
    throw "the patch records do not match the tree. Either a patch was lost (re-apply it) or the record is stale (update the row and say so in the patch table)."
}

Write-Host "patches-check: every assertion holds."
exit 0
