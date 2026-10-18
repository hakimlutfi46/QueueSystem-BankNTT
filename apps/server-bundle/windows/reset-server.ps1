<#
.SYNOPSIS
    Mengosongkan data server antrian Bank NTT (mulai dari awal), misalnya sebelum go-live.

.DESCRIPTION
    Membuat cadangan lebih dulu (backups\sebelum-reset-*.dump), lalu menghapus dan membuat ulang
    database queue. Saat layanan server menyala lagi, migrasi dan data awal berjalan sendiri: akun
    admin dengan sandi awal dari server.env (wajib diganti saat masuk), layanan CS dan Teller, loket
    contoh, tanpa petugas. Semua tiket, laporan, petugas, perangkat, dan pengaturan Admin terhapus;
    kiosk dan TV mendaftar ulang sendiri dan menunggu persetujuan di Admin -> Perangkat.

    server.env (kata sandi database dan rahasia login) tidak diubah.

.PARAMETER Force
    Tanpa pertanyaan konfirmasi (untuk otomatisasi).
#>
param([switch]$Force)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'server-common.ps1')

if (Invoke-As64Bit -ScriptPath $PSCommandPath -BoundParameters $PSBoundParameters) { exit $LASTEXITCODE }

function Invoke-PgTool {
    param([hashtable]$Config, [string]$Tool, [string[]]$Arguments)
    $previous = $env:PGPASSWORD
    $env:PGPASSWORD = $Config['PG_SUPERUSER_PASSWORD']
    try {
        $output = Get-NativeOutput -FilePath (Join-Path $script:PgBin $Tool) -Arguments $Arguments
    } finally {
        $env:PGPASSWORD = $previous
    }
    if ($script:LastNativeExitCode -ne 0) {
        throw ("$Tool gagal: " + (($output | ForEach-Object { "$_" }) -join ' '))
    }
    return $output
}

function Wait-Postgres {
    param([hashtable]$Config)
    $service = Get-Service -Name $script:PgServiceName -ErrorAction SilentlyContinue
    if ($null -eq $service) { throw "Layanan $script:PgServiceName tidak ada. Pasang server dulu." }
    if ($service.Status.ToString() -ne 'Running') {
        Write-Log "Menjalankan layanan $script:PgServiceName"
        Start-Service -Name $script:PgServiceName
    }
    $isReady = Join-Path $script:PgBin 'pg_isready.exe'
    $deadline = (Get-Date).AddSeconds(60)
    while ((Invoke-Native -FilePath $isReady -Arguments @('-h', '127.0.0.1', '-p', $Config['PG_PORT'], '-q') -Quiet) -ne 0) {
        if ((Get-Date) -gt $deadline) { throw 'PostgreSQL tidak siap setelah 60 detik' }
        Start-Sleep -Seconds 1
    }
}

try {
    Assert-Administrator
    Start-ScriptLog -Name 'reset.log'

    $config = Read-ServerEnv
    foreach ($key in @('PG_PORT', 'PG_SUPERUSER_PASSWORD', 'QUEUE_DB_PASSWORD')) {
        if (-not $config.ContainsKey($key) -or $config[$key] -eq '') { throw "server.env tidak lengkap: $key kosong ($script:EnvFile)" }
    }

    if (-not $Force) {
        Write-Host ''
        Write-Host 'PERINGATAN: semua data antrian akan dihapus (tiket, laporan, petugas, perangkat, pengaturan).'
        Write-Host 'Cadangan dibuat lebih dulu di' $script:BackupsDir
        $answer = Read-Host 'Ketik RESET untuk melanjutkan'
        if ($answer -ne 'RESET') {
            Write-Log 'Reset dibatalkan'
            exit 2
        }
    }

    Write-Log 'Reset data server antrian dimulai'
    Wait-Postgres -Config $config
    Stop-ServiceIfRunning -Name $script:ServerServiceName

    if (-not (Test-Path -LiteralPath $script:BackupsDir)) { New-Item -ItemType Directory -Path $script:BackupsDir -Force | Out-Null }
    $backup = Join-Path $script:BackupsDir ('sebelum-reset-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
    Invoke-PgTool -Config $config -Tool 'pg_dump.exe' -Arguments @(
        '-h', '127.0.0.1', '-p', $config['PG_PORT'], '-U', 'postgres', '-F', 'c', '--no-owner', '--no-privileges',
        '-f', $backup, 'queue') | Out-Null
    Write-Log "Cadangan dibuat: $backup"

    Invoke-PgTool -Config $config -Tool 'psql.exe' -Arguments @(
        '-h', '127.0.0.1', '-p', $config['PG_PORT'], '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-q',
        '-c', 'DROP DATABASE IF EXISTS queue WITH (FORCE)', '-c', 'CREATE DATABASE queue OWNER queue') | Out-Null
    Write-Log 'Database queue dikosongkan'

    Write-Log "Menjalankan layanan $script:ServerServiceName (migrasi dan data awal)"
    Start-Service -Name $script:ServerServiceName
    $healthy = $false
    $deadline = (Get-Date).AddSeconds(180)
    while (-not $healthy -and (Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 2
        try { $healthy = (Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/health' -UseBasicParsing -TimeoutSec 5).Content -match '"ok"\s*:\s*true' } catch { }
    }
    if (-not $healthy) { throw "Server tidak menjawab setelah reset. Lihat $script:LogsDir\server.log" }

    Write-Log 'Selesai. Masuk sebagai admin dengan sandi awal dari server.env (SEED_ADMIN_PASSWORD), lalu ganti sandi.'
    Write-Log 'Kiosk dan TV mendaftar ulang sendiri; setujui di Admin -> Perangkat.'
    exit 0
} catch {
    Write-Log ('GAGAL: ' + $_.Exception.Message)
    exit 1
}
