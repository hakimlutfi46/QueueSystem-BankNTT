<#
.SYNOPSIS
    Menampilkan keadaan server antrian Bank NTT: layanan, database, server web, cadangan, log.

.DESCRIPTION
    Tidak mengubah apa pun. Kode keluar 0 bila server web menjawab /api/health, 1 bila tidak.
    Sebagian informasi (server.env, log) hanya terbaca bila dijalankan sebagai Administrator.
#>
param(
    [int]$LogLines = 20
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'server-common.ps1')

if (Invoke-As64Bit -ScriptPath $PSCommandPath -BoundParameters $PSBoundParameters) { exit $LASTEXITCODE }

function Show-Line {
    param([string]$Label, [string]$Value)
    Write-Host (('{0,-22} {1}' -f $Label, $Value))
}

Write-Host 'Server antrian Bank NTT'
Write-Host '-----------------------'
$manifestPath = Join-Path $script:ServerDir 'bundle-manifest.json'
if (Test-Path -LiteralPath $manifestPath) {
    try {
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        Show-Line 'Versi' ("$($manifest.appVersion) (commit $($manifest.gitCommit), dibuat $($manifest.builtAt))")
    } catch { Show-Line 'Versi' 'bundle-manifest.json tidak terbaca' }
}
Show-Line 'Program' $script:ServerDir
Show-Line 'Data' $script:DataDir

foreach ($name in @($script:PgServiceName, $script:ServerServiceName)) {
    $service = Get-Service -Name $name -ErrorAction SilentlyContinue
    if ($null -eq $service) {
        Show-Line $name 'TIDAK TERPASANG'
    } else {
        $startType = ''
        try { $startType = (Get-WmiObject -Class Win32_Service -Filter "Name='$name'").StartMode } catch { }
        Show-Line $name ("$($service.Status) (start: $startType)")
    }
}

$config = @{}
try { $config = Read-ServerEnv } catch { }
if ($config.Count -eq 0) {
    Show-Line 'server.env' 'tidak ada / tidak terbaca (jalankan sebagai Administrator)'
} else {
    Show-Line 'server.env' $script:EnvFile
}

$pgPort = '5432'
if ($config.ContainsKey('PG_PORT')) { $pgPort = $config['PG_PORT'] }
$isReady = Join-Path $script:PgBin 'pg_isready.exe'
if (Test-Path -LiteralPath $isReady) {
    $code = Invoke-Native -FilePath $isReady -Arguments @('-h', '127.0.0.1', '-p', $pgPort, '-q') -Quiet
    if ($code -eq 0) { Show-Line 'PostgreSQL' "siap di 127.0.0.1:$pgPort" } else { Show-Line 'PostgreSQL' "TIDAK SIAP di 127.0.0.1:$pgPort (kode $code)" }
}

$healthy = $false
try {
    $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/health' -UseBasicParsing -TimeoutSec 5
    $healthy = ($response.StatusCode -eq 200)
    Show-Line 'Server web' ("http://127.0.0.1:3000/api/health -> $($response.StatusCode) $($response.Content)")
} catch {
    Show-Line 'Server web' ('TIDAK MENJAWAB: ' + $_.Exception.Message)
}

try {
    $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' } |
        ForEach-Object { 'http://' + $_.IPAddress + ':3000' }
    if ($addresses) { Show-Line 'Alamat di jaringan' (($addresses | Select-Object -Unique) -join ', ') }
} catch { }

try {
    $task = Get-ScheduledTask -TaskName $script:BackupTaskName -ErrorAction SilentlyContinue
    if ($null -eq $task) {
        Show-Line 'Cadangan harian' 'TIDAK TERPASANG'
    } else {
        $info = Get-ScheduledTaskInfo -TaskName $script:BackupTaskName
        Show-Line 'Cadangan harian' ("$($task.State), terakhir $($info.LastRunTime) (hasil $($info.LastTaskResult)), berikutnya $($info.NextRunTime)")
    }
} catch { }
if (Test-Path -LiteralPath $script:BackupsDir) {
    $latest = Get-ChildItem -LiteralPath $script:BackupsDir -Filter '*.dump' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($null -ne $latest) {
        Show-Line 'Cadangan terbaru' ("$($latest.Name) ($([math]::Round($latest.Length / 1KB)) KB, $($latest.LastWriteTime))")
    }
}

foreach ($name in $script:FirewallRules) {
    $rule = Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue
    if ($null -eq $rule) { Show-Line $name 'TIDAK ADA' } else { Show-Line $name ("aktif: $($rule.Enabled)") }
}

$serverLog = Join-Path $script:LogsDir 'server.log'
if ($LogLines -gt 0 -and (Test-Path -LiteralPath $serverLog)) {
    Write-Host ''
    Write-Host "$LogLines baris terakhir $serverLog"
    try { Get-Content -LiteralPath $serverLog -Tail $LogLines | ForEach-Object { Write-Host "  $_" } } catch { Write-Host '  (tidak terbaca)' }
}

if ($healthy) { exit 0 }
exit 1
