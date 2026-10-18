<#
.SYNOPSIS
    Menghapus layanan server antrian Bank NTT dari PC ini.

.DESCRIPTION
    Menghentikan dan menghapus layanan BankNTT-Server dan BankNTT-PostgreSQL, tugas terjadwal
    BankNTT-Backup, dan aturan firewall. Data di C:\ProgramData\BankNTT (database, server.env,
    log, cadangan) TETAP disimpan, kecuali dengan -RemoveData.

.PARAMETER RemoveData
    Hapus juga seluruh C:\ProgramData\BankNTT. Semua data antrian hilang permanen.

.EXAMPLE
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Program Files\BANK NTT Ticket\resources\server\uninstall-server.ps1"
#>
param(
    [switch]$RemoveData
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'server-common.ps1')

if (Invoke-As64Bit -ScriptPath $PSCommandPath -BoundParameters $PSBoundParameters) { exit $LASTEXITCODE }

$failed = $false
try {
    Assert-Administrator
} catch {
    Write-Log ('GAGAL: ' + $_.Exception.Message)
    exit 1
}
if (-not $RemoveData) { Start-ScriptLog -Name 'uninstall.log' }
Write-Log "Menghapus server antrian Bank NTT ($script:ServerDir)"

# Web server first (it depends on PostgreSQL).
try {
    if ($null -ne (Get-Service -Name $script:ServerServiceName -ErrorAction SilentlyContinue)) {
        Stop-ServiceIfRunning -Name $script:ServerServiceName
        $code = 1
        if (Test-Path -LiteralPath $script:WinSWExe) {
            $code = Invoke-Native -FilePath $script:WinSWExe -Arguments @('uninstall')
        }
        if ($code -ne 0) { Remove-ServiceCompletely -Name $script:ServerServiceName }
        Wait-ServiceStatus -Name $script:ServerServiceName -Status 'Missing' -Seconds 30 | Out-Null
        Write-Log "Layanan $script:ServerServiceName dihapus"
    }
} catch {
    $failed = $true
    Write-Log ("Gagal menghapus $script:ServerServiceName" + ': ' + $_.Exception.Message)
}

try {
    if ($null -ne (Get-Service -Name $script:PgServiceName -ErrorAction SilentlyContinue)) {
        Stop-ServiceIfRunning -Name $script:PgServiceName
        $code = 1
        $pgCtl = Join-Path $script:PgBin 'pg_ctl.exe'
        if (Test-Path -LiteralPath $pgCtl) {
            $code = Invoke-Native -FilePath $pgCtl -Arguments @('unregister', '-N', $script:PgServiceName)
        }
        if ($code -ne 0) { Remove-ServiceCompletely -Name $script:PgServiceName }
        Wait-ServiceStatus -Name $script:PgServiceName -Status 'Missing' -Seconds 30 | Out-Null
        Write-Log "Layanan $script:PgServiceName dihapus"
    }
} catch {
    $failed = $true
    Write-Log ("Gagal menghapus $script:PgServiceName" + ': ' + $_.Exception.Message)
}

try {
    if ($null -ne (Get-ScheduledTask -TaskName $script:BackupTaskName -ErrorAction SilentlyContinue)) {
        Unregister-ScheduledTask -TaskName $script:BackupTaskName -Confirm:$false
        Write-Log "Tugas terjadwal $script:BackupTaskName dihapus"
    }
} catch {
    $failed = $true
    Write-Log ('Gagal menghapus tugas terjadwal: ' + $_.Exception.Message)
}

foreach ($name in $script:FirewallRules) {
    try {
        if ($null -ne (Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue)) {
            Remove-NetFirewallRule -Name $name
            Write-Log "Aturan firewall $name dihapus"
        }
    } catch {
        $failed = $true
        Write-Log ("Gagal menghapus aturan firewall $name" + ': ' + $_.Exception.Message)
    }
}

if ($RemoveData) {
    try {
        if (Test-Path -LiteralPath $script:DataDir) {
            Remove-Item -LiteralPath $script:DataDir -Recurse -Force
            Write-Host "Data $script:DataDir dihapus"
        }
    } catch {
        $failed = $true
        Write-Host ('Gagal menghapus data: ' + $_.Exception.Message)
    }
} else {
    Write-Log "Data tetap disimpan di $script:DataDir"
}

if ($failed) { exit 1 }
Write-Log 'Selesai.'
exit 0
