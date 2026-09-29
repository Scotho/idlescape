# deploy/windows/unregister-tasks.ps1 — stop and remove the two product Scheduled Tasks
# registered by deploy/windows/register-tasks.ps1 (idlescape-engine, idlescape-server).
#
# This is the operator's rollback / maintenance script, run manually as Administrator when the
# product needs to come down (e.g. before an upgrade, or to fall back to the live PoC). It does
# NOT touch the live-PoC tasks (`idlescape-live-engine`, `idlescape-tunnel`) or the
# cloudflared service -- only the two product task names above. Run
# deploy/windows/install-tunnel.ps1's own stop step (`Stop-Service cloudflared`) separately if
# the tunnel needs to come down too.
#
# Authored only -- not run as part of writing it.

$ErrorActionPreference = 'Continue'

$tasks = @('idlescape-engine', 'idlescape-server')

foreach ($name in $tasks) {
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if (-not $task) {
        Write-Host "$name : not registered, nothing to do"
        continue
    }

    try {
        Stop-ScheduledTask -TaskName $name -ErrorAction Stop
        Write-Host "$name : stopped"
    } catch {
        Write-Host "$name : stop failed or was not running ($($_.Exception.Message))"
    }

    try {
        Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction Stop
        Write-Host "$name : unregistered"
    } catch {
        Write-Host "$name : unregister failed ($($_.Exception.Message))"
    }
}

Write-Host ""
Write-Host "Done. The live PoC tasks (idlescape-live-engine, idlescape-tunnel) were not touched."
