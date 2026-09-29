# scripts/line-ceiling.ps1 -- the 400-line ceiling, enforced.
#
# CLAUDE.md, the sprint spec, the roadmap, the sprint handoff and the design skill all assert that
# every file we wrote stays under 400 lines including tests. Audit C16: nothing enforced it, and
# CLAUDE.md said so. This is the authority. web/eslint.config.js carries the same number as an
# editor convenience for web/, and this script asserts the two carry the same number.
#
# WHAT A LINE IS. Every line, blank ones and comment-only ones included, which is what eslint's
# max-lines counts with skipBlankLines and skipComments both false. Carrying the same NUMBER is
# only half of not drifting: the two halves also have to measure the same THING, and the first
# cut of this gate did not. `Get-Content | Measure-Object -Line` drops empty strings from the
# pipeline, so it returns the count of NON-BLANK lines: a 401-line file with alternating blank
# lines passed this script while eslint errored on it. Measure-FileLines below is the one place
# that counts, and Assert-LineCounting proves on every run that it still counts blanks, because
# a mutation built from uniform `// x` lines cannot see this class of bug.
#
# SCOPE: tracked source files WE wrote, by extension. Enumerated with `git ls-files`, so
# node_modules, dist, engine/, wiki/build/ and live/ are excluded for free and an untracked scratch
# file cannot fail the gate.
#
# EXEMPTIONS, all of them, in one place. Nothing else is exempt, and adding one means editing this
# header and the list below together.
#
#   1. web/src/vendor/** and client/src/vendor/**  -- vendored third party (rs-sdk, pinned at
#      56b73e0); deviations are logged in each vendor/PATCHES.md, and web/src/vendor/** is already
#      in eslint.config.js's ignores. Largest today: web/src/vendor/rs-sdk/sdk/actions.ts at 4,817.
#      client/src/vendor/** is outside the include list as well (exemption 2), and is named here so
#      that widening the include list cannot silently pull it in.
#   2. client/** outside src/hooks/ and src/plugins/   -- the pristine 274 client fork, its root
#      build files included: bundle.ts (223), identifier.js (upstream's minifier), rsa.ts,
#      eslint.config.ts. bundle.ts is upstream's file carrying our terser `reserved` block, so it
#      is ours only through client/PATCHES.md's numbered patches, the same standing as
#      client/src/client/Client.ts, which is 14,481 lines and holds 28 of them. The ceiling is not
#      ours to apply to upstream's tree. This one is expressed by the include list rather than by
#      the exemption list: only client/src/hooks/ and client/src/plugins/ are scanned.
#   3. Generated output -- wiki/data/**, web/src/data/**, content-custom/pack/**. Extension
#      filtering and the include list remove all of it. The one generated SOURCE file inside the
#      include list is web/src/tasks/library/tutorialIsland/steps.ts (82 lines today), named below
#      so a future regeneration that crosses 400 is a known exemption rather than a surprise.
#   4. web/styleguide.html, 504 lines -- decision D12 and shell v2 ruling R31: a single static demo
#      page whose value is that every component family is on ONE scrollable page. The only
#      exemption that is load-bearing today, meaning the only one that is inside the include list
#      and over the ceiling.
#   5. Prose -- every .md. engine-custom/PATCHES.md is past 900 and docs/** is far larger. The ceiling
#      has never applied to prose; the SDD convention's "ledgers under 400 lines" is a different
#      rule with a different enforcement point.
#   6. engine-custom/src/web.ts, 374 lines -- a whole-file replacement of an upstream file, so its
#      size is upstream's choice. It passes today; recorded so a future upstream bump does not turn
#      an unrelated file into a gate failure. Audit C16 names this one explicitly.
#
# That list is exhaustive only if the include list reaches everything else we wrote, so it does:
# `.js` is an included extension for the sake of web/eslint.config.js, the one .js file we wrote
# outside the client fork, and engine-custom/tools/ is an include prefix for BuildOverlay.ts and
# packGuard.ts. The tracked source outside all of it is exactly exemptions 1, 2, 3 and 5 plus
# package.json/tsconfig.json, which have no ceiling to break.
#
# WHERE IT RUNS: early in scripts/verify.ps1, not in build.ps1. It is a second of work, so failing
# at step 1 costs nothing while failing at step 9 costs every suite before it, and build.ps1 is
# about producing shippable bundles. This overrides C16's literal wording.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$Ceiling = 400

$includeExt = @('.ts', '.js', '.css', '.html', '.ps1', '.sh', '.rules')
$includeDirs = @(
    'web/', 'server/src/', 'engine-custom/src/', 'engine-custom/tools/',
    'client/src/hooks/', 'client/src/plugins/',
    'scripts/', 'wiki/gen/', 'firebase/', 'deploy/'
)
$exempt = @(
    'web/src/vendor/', 'client/src/vendor/',
    'web/styleguide.html',
    'web/src/tasks/library/tutorialIsland/steps.ts',
    'engine-custom/src/web.ts'
)

function Measure-FileLines {
    param([Parameter(Mandatory = $true)][string]$Path)
    # @(...) so a one-line file is an array rather than a bare string, and an empty file is 0.
    # Get-Content splits on newlines and keeps empty lines, and does not invent a final one for a
    # file that ends without a newline, which is exactly how eslint counts. Do NOT reach for
    # `Measure-Object -Line` here: it counts non-blank lines. See this file's header.
    return @(Get-Content -LiteralPath $Path).Count
}

function Assert-LineCounting {
    # The permanent form of the mutation that caught the first cut of this gate. Two fixtures,
    # because two different wrong implementations are one keystroke away: Measure-Object -Line
    # reports 4 for the first (it drops the two empty lines, keeping the whitespace-only one),
    # and splitting a -Raw read on newline reports 4 as well (a trailing empty field). The second
    # fixture ends without a newline, where that same -Raw split would report 3 correctly but
    # `wc -l` would report 2; eslint counts 3, so we count 3.
    $dir = Join-Path $env:TEMP ('line-ceiling-selftest-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $dir | Out-Null
    try {
        $withBlanks = Join-Path $dir 'blanks.txt'
        [System.IO.File]::WriteAllText($withBlanks, "a`r`n`r`nb`r`n `r`n`r`nc`r`n")
        $n = Measure-FileLines $withBlanks
        if ($n -ne 6) { throw "line counting is broken: a 6-line file with 3 blank lines measured $n, so this gate would under-count every file by its blank lines" }

        $unterminated = Join-Path $dir 'unterminated.txt'
        [System.IO.File]::WriteAllText($unterminated, "a`r`n`r`nb")
        $n = Measure-FileLines $unterminated
        if ($n -ne 3) { throw "line counting is broken: a 3-line file with no trailing newline measured $n, and eslint counts 3" }
    } finally {
        Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Assert-LineCounting

Push-Location $root
try {
    $tracked = & git ls-files
    if ($LASTEXITCODE -ne 0) { throw 'git ls-files failed' }
} finally { Pop-Location }

$offenders = @()
$scanned = 0
foreach ($rel in $tracked) {
    $path = $rel -replace '\\', '/'
    $inScope = $false
    foreach ($d in $includeDirs) { if ($path.StartsWith($d)) { $inScope = $true } }
    if (-not $inScope) { continue }
    if ($includeExt -notcontains [System.IO.Path]::GetExtension($path)) { continue }
    $skip = $false
    foreach ($e in $exempt) { if ($path.StartsWith($e) -or $path -eq $e) { $skip = $true } }
    if ($skip) { continue }

    $full = Join-Path $root ($path -replace '/', '\')
    if (-not (Test-Path -LiteralPath $full)) { continue }
    $n = Measure-FileLines $full
    $scanned = $scanned + 1
    if ($n -gt $Ceiling) { $offenders += "  ${path}: $n lines (ceiling $Ceiling)" }
}

# A scan that matched nothing would pass silently forever, which is the failure mode this whole
# entry exists to remove. The floor is well under the ~515 files in scope today.
if ($scanned -lt 200) { throw "line-ceiling scanned only $scanned files; the include list or the extension filter is wrong, and a green here would mean nothing" }

# The eslint convenience must carry the same number, or a developer's editor and this gate disagree.
$eslint = Get-Content -LiteralPath (Join-Path $root 'web\eslint.config.js') -Raw
if ($eslint -notmatch "'max-lines'\s*:\s*\[\s*'error'\s*,\s*\{\s*max:\s*$Ceiling\b") {
    throw "web/eslint.config.js does not carry a max-lines rule at $Ceiling; it and scripts/line-ceiling.ps1 must agree (see this file's header)"
}

if ($offenders.Count -gt 0) {
    Write-Host "`n$($offenders.Count) file(s) over the $Ceiling-line ceiling:"
    $offenders | ForEach-Object { Write-Host $_ }
    throw "split them; the exemption list is in the header of scripts/line-ceiling.ps1 and adding to it is a decision, not a fix"
}
Write-Host "line ceiling: $scanned file(s) scanned, none over $Ceiling"

# Explicit success exit, for the same reason scripts/engine-overlay.ps1 ends with one. This is
# verify.ps1's FIRST step, so nothing has set $LASTEXITCODE yet; falling off the end would leave it
# $null, and verify.ps1's `Invoke-Native` reads `$null -ne 0` as a failure. Every failure above is a
# `throw`, which is a terminating error under $ErrorActionPreference = 'Stop' and stops verify.ps1
# on its own, so reaching this line means the check passed.
exit 0
