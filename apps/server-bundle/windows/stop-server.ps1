<#
.SYNOPSIS
    Menghentikan layanan server antrian Bank NTT (tanpa menghapusnya).

.DESCRIPTION
    Dipakai installer sebelum menimpa berkas program saat pembaruan: node.exe dan berkas PostgreSQL
    yang sedang berjalan terkunci dan tidak bisa diganti. Layanan dijalankan lagi oleh
    install-server.ps1, atau otomatis saat PC dinyalakan.
#>
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'server-common.ps1')

if (Invoke-As64Bit -ScriptPath $PSCommandPath -BoundParameters $PSBoundParameters) { exit $LASTEXITCODE }

try {
    Assert-Administrator
    Start-ScriptLog -Name 'install.log'
    Stop-ServiceIfRunning -Name $script:ServerServiceName
    Stop-ServiceIfRunning -Name $script:PgServiceName
    Write-Log 'Layanan server antrian dihentikan'
    exit 0
} catch {
    Write-Log ('GAGAL: ' + $_.Exception.Message)
    exit 1
}
