<#
.SYNOPSIS
    Memasang atau memperbarui server antrian Bank NTT di PC ini (PostgreSQL + server web).

.DESCRIPTION
    Dijalankan oleh installer kiosk (elevated) setiap kali aplikasi dipasang atau diperbarui.
    Aman diulang: data di C:\ProgramData\BankNTT (database, server.env, log, cadangan) tidak dihapus,
    dan migrasi database baru dijalankan otomatis saat server mulai.

    Langkah:
      1. Visual C++ 2015-2022 x64 runtime (bila vcruntime140.dll belum ada)
      2. Folder data + hak akses
      3. server.env (sekali saja: AUTH_SECRET dan kata sandi database acak)
      4. initdb bila pgdata kosong, layanan BankNTT-PostgreSQL (hanya 127.0.0.1)
      5. role dan database "queue"
      6. layanan BankNTT-Server (WinSW, mulai otomatis, restart bila gagal)
      7. aturan firewall TCP 3000 dan UDP 41234 (LocalSubnet)
      8. tugas terjadwal BankNTT-Backup tiap hari 22:30

.PARAMETER AdminPassword
    Kata sandi awal akun admin (hanya dipakai saat database baru). Admin wajib menggantinya saat masuk.

.PARAMETER BranchName
    Nama lembaga/cabang untuk data awal. Kosong berarti "Bank NTT".

.PARAMETER TimeZone
    Zona waktu bawaan: Asia/Jakarta (WIB), Asia/Makassar (WITA) atau Asia/Jayapura (WIT).

.EXAMPLE
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Program Files\BANK NTT Ticket\resources\server\install-server.ps1"
#>
param(
    [string]$AdminPassword = 'Password123',
    [string]$BranchName = '',
    [string]$TimeZone = 'Asia/Makassar'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'server-common.ps1')

if (Invoke-As64Bit -ScriptPath $PSCommandPath -BoundParameters $PSBoundParameters) { exit $LASTEXITCODE }

function New-RandomHex {
    param([int]$Bytes)
    $buffer = New-Object byte[] $Bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
    return (($buffer | ForEach-Object { $_.ToString('x2') }) -join '')
}

function Test-PortListening {
    param([int]$Port)
    try {
        $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if ($listeners) { return $true }
    } catch { }
    $listener = $null
    try {
        $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
        $listener.ExclusiveAddressUse = $true
        $listener.Start()
        return $false
    } catch {
        return $true
    } finally {
        if ($null -ne $listener) { try { $listener.Stop() } catch { } }
    }
}

function Write-Utf8File {
    param([string]$Path, [string]$Text)
    [System.IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding($false)))
}

function Set-Acl-Icacls {
    param([string]$Path, [string[]]$Arguments)
    $code = Invoke-Native -FilePath 'icacls.exe' -Arguments (@($Path) + $Arguments + @('/C', '/Q'))
    if ($code -ne 0) { throw "icacls $Path gagal (kode $code)" }
}

# --- 1. Visual C++ runtime -------------------------------------------------------------------
function Install-VcRuntime {
    $system32 = Join-Path $env:windir 'System32'
    $needed = @('vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll')
    $missing = @($needed | Where-Object { -not (Test-Path -LiteralPath (Join-Path $system32 $_)) })
    if ($missing.Count -eq 0) {
        Write-Log 'Visual C++ runtime sudah terpasang'
        return
    }
    $installer = Join-Path $script:ServerDir 'vc_redist.x64.exe'
    if (-not (Test-Path -LiteralPath $installer)) { throw "vc_redist.x64.exe tidak ditemukan di $script:ServerDir" }
    Write-Log ('Memasang Visual C++ runtime (belum ada: ' + ($missing -join ', ') + ')')
    $process = Start-Process -FilePath $installer -ArgumentList @('/install', '/quiet', '/norestart') -Wait -PassThru
    # 1638 = versi yang sama atau lebih baru sudah ada, 3010 = perlu restart (runtime tetap bisa dipakai).
    if (@(0, 1638, 3010) -notcontains $process.ExitCode) {
        throw "vc_redist.x64.exe gagal dengan kode $($process.ExitCode)"
    }
    Write-Log "    selesai (kode $($process.ExitCode))"
}

# --- 2. Data folders and permissions -----------------------------------------------------------
function Initialize-DataDirs {
    foreach ($dir in @($script:DataDir, $script:PgData, $script:LogsDir, $script:BackupsDir)) {
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    }
    # Root: no inherited "Users: Read" from ProgramData, because server.env holds the secrets.
    Set-Acl-Icacls -Path $script:DataDir -Arguments @('/inheritance:r', '/grant:r',
        ($script:SidSystem + ':(OI)(CI)F'), ($script:SidAdmins + ':(OI)(CI)F'), ($script:SidNetworkService + ':(OI)(CI)RX'))
    # PostgreSQL runs as NetworkService and must own its data directory.
    Set-Acl-Icacls -Path $script:PgData -Arguments @('/grant', ($script:SidNetworkService + ':(OI)(CI)F'))
    Set-Acl-Icacls -Path $script:LogsDir -Arguments @('/grant', ($script:SidNetworkService + ':(OI)(CI)M'))
    Set-Acl-Icacls -Path $script:BackupsDir -Arguments @('/grant', ($script:SidNetworkService + ':(OI)(CI)M'))
}

# --- 3. server.env ------------------------------------------------------------------------------
function Initialize-ServerEnv {
    $pgInitialized = Test-Path -LiteralPath (Join-Path $script:PgData 'PG_VERSION')
    if (Test-Path -LiteralPath $script:EnvFile) {
        $values = Read-ServerEnv
        foreach ($key in @('PG_PORT', 'PG_SUPERUSER_PASSWORD', 'QUEUE_DB_PASSWORD', 'DATABASE_URL', 'AUTH_SECRET')) {
            if (-not $values.ContainsKey($key) -or $values[$key] -eq '') { throw "server.env tidak lengkap: $key kosong ($script:EnvFile)" }
        }
        Write-Log 'server.env sudah ada, dipakai apa adanya'
        return
    }
    if ($pgInitialized) {
        throw ("Database sudah ada di $script:PgData tetapi server.env hilang, jadi kata sandinya tidak diketahui. " +
            'Pulihkan server.env dari cadangan, atau pindahkan folder pgdata lalu jalankan ulang (database baru, data lama tidak terpakai).')
    }

    $port = 5432
    while (Test-PortListening -Port $port) {
        Write-Log "Port $port sudah dipakai program lain"
        $port = $port + 1
        if ($port -gt 5440) { throw 'Tidak ada port bebas untuk PostgreSQL (5432-5440)' }
    }
    $superPassword = New-RandomHex -Bytes 24
    $queuePassword = New-RandomHex -Bytes 24
    $authSecret = New-RandomHex -Bytes 32
    $orgName = $BranchName.Trim()
    $lines = @(
        # Parenthesised: in an array literal the comma binds tighter than +, so without them this line
        # would swallow every following element into one space-joined string.
        ('# Konfigurasi server antrian Bank NTT. Dibuat oleh install-server.ps1 pada ' + (Get-Date -Format 'yyyy-MM-dd HH:mm') + '.'),
        '# JANGAN DIHAPUS: tanpa berkas ini database tidak bisa dibuka. Simpan salinannya di tempat aman.',
        '',
        '# PostgreSQL lokal (hanya 127.0.0.1).',
        "PG_PORT=$port",
        "PG_SUPERUSER_PASSWORD=$superPassword",
        "QUEUE_DB_PASSWORD=$queuePassword",
        "DATABASE_URL=postgresql://queue:$queuePassword@127.0.0.1:$port/queue",
        '',
        '# Rahasia sesi login. Bila diganti, semua pengguna harus masuk ulang.',
        "AUTH_SECRET=$authSecret",
        '',
        '# Port web tetap 3000 (aturan firewall memakai port ini).',
        'PORT=3000',
        "APP_TIMEZONE=$TimeZone",
        'TICKET_OUTPUT=',
        '',
        '# Cadangan harian (tugas BankNTT-Backup, 22:30).',
        ('BACKUP_DIR=' + $script:BackupsDir),
        'BACKUP_KEEP_DAYS=30',
        '',
        '# Data awal: hanya dipakai saat database masih kosong. Admin wajib mengganti sandi saat masuk pertama.',
        "SEED_ADMIN_PASSWORD=$AdminPassword",
        "SEED_ORG_NAME=$orgName"
    )
    Write-Utf8File -Path $script:EnvFile -Text (($lines -join "`r`n") + "`r`n")
    Write-Log "server.env dibuat (PostgreSQL port $port)"
}

function Protect-ServerEnv {
    Set-Acl-Icacls -Path $script:EnvFile -Arguments @('/inheritance:r', '/grant:r',
        ($script:SidSystem + ':F'), ($script:SidAdmins + ':F'), ($script:SidNetworkService + ':R'))
}

# --- 4. PostgreSQL ------------------------------------------------------------------------------
function Initialize-Database {
    param([hashtable]$Config)
    if (Test-Path -LiteralPath (Join-Path $script:PgData 'PG_VERSION')) {
        Write-Log 'Database PostgreSQL sudah ada'
    } else {
        if (@(Get-ChildItem -LiteralPath $script:PgData -Force).Count -gt 0) {
            throw "$script:PgData tidak kosong tetapi bukan database PostgreSQL. Periksa atau pindahkan isinya."
        }
        Write-Log 'Membuat database PostgreSQL baru (initdb)'
        # initdb drops the Administrators group from its own token (PostgreSQL does this on Windows), so it
        # runs as the plain installing user: the password file lives in that user's TEMP, and the user gets
        # temporary access to pgdata, which inherits only SYSTEM/Administrators/NetworkService.
        $me = '*' + [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
        $pwFile = Join-Path ([System.IO.Path]::GetTempPath()) ('bankntt-initdb-' + [guid]::NewGuid().ToString('N') + '.tmp')
        Set-Acl-Icacls -Path $script:PgData -Arguments @('/grant', ($me + ':(OI)(CI)F'))
        try {
            Write-Utf8File -Path $pwFile -Text $Config['PG_SUPERUSER_PASSWORD']
            $code = Invoke-Native -FilePath (Join-Path $script:PgBin 'initdb.exe') -Arguments @(
                '-D', $script:PgData, '-U', 'postgres', ('--pwfile=' + $pwFile),
                '-E', 'UTF8', '--locale=C', '-A', 'scram-sha-256')
            if ($code -ne 0) { throw "initdb gagal (kode $code)" }
        } finally {
            Remove-Item -LiteralPath $pwFile -Force -ErrorAction SilentlyContinue
            Set-Acl-Icacls -Path $script:PgData -Arguments @('/remove:g', $me, '/T')
        }
    }
    # Files written by initdb (as Administrator) must also be writable by NetworkService.
    Set-Acl-Icacls -Path $script:PgData -Arguments @('/grant', ($script:SidNetworkService + ':(OI)(CI)F'), '/T')

    # Managed settings block in postgresql.conf, replaced on every run.
    $confPath = Join-Path $script:PgData 'postgresql.conf'
    $conf = [System.IO.File]::ReadAllText($confPath)
    $conf = [regex]::Replace($conf, '(?s)\r?\n?# BEGIN BankNTT.*?# END BankNTT\r?\n?', "`n")
    $block = @(
        '# BEGIN BankNTT (dikelola install-server.ps1, jangan diubah manual)',
        "listen_addresses = '127.0.0.1'",
        ('port = ' + $Config['PG_PORT']),
        'max_connections = 50',
        'shared_buffers = 128MB',
        'logging_collector = on',
        "log_directory = 'log'",
        "log_filename = 'postgresql-%a.log'",
        'log_truncate_on_rotation = on',
        'log_rotation_age = 1d',
        "lc_messages = 'C'",
        '# END BankNTT'
    ) -join "`n"
    Write-Utf8File -Path $confPath -Text ($conf.TrimEnd() + "`n`n" + $block + "`n")
}

function Register-PostgresService {
    $pgCtl = Join-Path $script:PgBin 'pg_ctl.exe'
    $imagePath = Get-ServiceImagePath -Name $script:PgServiceName
    # pg_ctl stores the data directory with forward slashes; compare normalized paths.
    $normalized = $null
    if ($null -ne $imagePath) { $normalized = $imagePath.Replace('/', '\').ToLower() }
    if ($null -ne $normalized -and $normalized.Contains($pgCtl.ToLower()) -and $normalized.Contains($script:PgData.ToLower())) {
        Write-Log "Layanan $script:PgServiceName sudah terdaftar"
    } else {
        if ($null -ne $imagePath) {
            Write-Log "Layanan $script:PgServiceName menunjuk ke lokasi lama, didaftarkan ulang"
            Remove-ServiceCompletely -Name $script:PgServiceName
        }
        Write-Log "Mendaftarkan layanan $script:PgServiceName"
        $code = Invoke-Native -FilePath $pgCtl -Arguments @('register', '-N', $script:PgServiceName, '-D', $script:PgData,
            '-S', 'auto', '-U', 'NT AUTHORITY\NetworkService', '-w')
        if ($code -ne 0) { throw "pg_ctl register gagal (kode $code)" }
    }
    Invoke-Native -FilePath 'sc.exe' -Arguments @('failure', $script:PgServiceName, 'reset=', '3600',
        'actions=', 'restart/10000/restart/30000/restart/60000') | Out-Null
}

function Start-PostgresService {
    param([hashtable]$Config)
    # Restart so a changed postgresql.conf (port, listen address) is applied.
    Stop-ServiceIfRunning -Name $script:PgServiceName
    Write-Log "Menjalankan layanan $script:PgServiceName"
    Start-Service -Name $script:PgServiceName
    if (-not (Wait-ServiceStatus -Name $script:PgServiceName -Status 'Running' -Seconds 60)) {
        throw "Layanan $script:PgServiceName tidak mau berjalan. Lihat $script:PgData\log"
    }
    $isReady = Join-Path $script:PgBin 'pg_isready.exe'
    $deadline = (Get-Date).AddSeconds(60)
    while ($true) {
        $code = Invoke-Native -FilePath $isReady -Arguments @('-h', '127.0.0.1', '-p', $Config['PG_PORT'], '-q') -Quiet
        if ($code -eq 0) { break }
        if ((Get-Date) -gt $deadline) { throw 'PostgreSQL tidak siap setelah 60 detik' }
        Start-Sleep -Seconds 1
    }
    Write-Log "    PostgreSQL siap di 127.0.0.1:$($Config['PG_PORT'])"
}

function Invoke-Psql {
    param([hashtable]$Config, [string]$Sql)
    $previous = $env:PGPASSWORD
    $env:PGPASSWORD = $Config['PG_SUPERUSER_PASSWORD']
    try {
        $output = Get-NativeOutput -FilePath (Join-Path $script:PgBin 'psql.exe') -Arguments @(
            '-h', '127.0.0.1', '-p', $Config['PG_PORT'], '-U', 'postgres', '-d', 'postgres',
            '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-c', $Sql)
    } finally {
        $env:PGPASSWORD = $previous
    }
    if ($script:LastNativeExitCode -ne 0) {
        throw ('psql gagal: ' + (($output | ForEach-Object { "$_" }) -join ' '))
    }
    return (($output | ForEach-Object { "$_" }) -join "`n").Trim()
}

function Initialize-QueueDatabase {
    param([hashtable]$Config)
    $password = $Config['QUEUE_DB_PASSWORD']
    if ($password -notmatch '^[0-9a-fA-F]+$') { throw 'QUEUE_DB_PASSWORD harus berupa heksadesimal' }
    $role = Invoke-Psql -Config $Config -Sql "SELECT 1 FROM pg_roles WHERE rolname = 'queue'"
    if ($role -eq '1') {
        Invoke-Psql -Config $Config -Sql "ALTER ROLE queue WITH LOGIN PASSWORD '$password'" | Out-Null
        Write-Log 'Role queue sudah ada (kata sandi diselaraskan dengan server.env)'
    } else {
        Invoke-Psql -Config $Config -Sql "CREATE ROLE queue WITH LOGIN PASSWORD '$password'" | Out-Null
        Write-Log 'Role queue dibuat'
    }
    $database = Invoke-Psql -Config $Config -Sql "SELECT 1 FROM pg_database WHERE datname = 'queue'"
    if ($database -eq '1') {
        Write-Log 'Database queue sudah ada'
    } else {
        Invoke-Psql -Config $Config -Sql "CREATE DATABASE queue OWNER queue ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0" | Out-Null
        Write-Log 'Database queue dibuat'
    }
}

# --- 6. Node.js server service (WinSW) ---------------------------------------------------------
function Register-ServerService {
    foreach ($file in @($script:WinSWExe, ($script:WinSWExe -replace '\.exe$', '.xml'), $script:NodeExe)) {
        if (-not (Test-Path -LiteralPath $file)) { throw "Berkas tidak ditemukan: $file" }
    }
    $imagePath = Get-ServiceImagePath -Name $script:ServerServiceName
    if ($null -ne $imagePath -and $imagePath.ToLower().Contains($script:WinSWExe.ToLower())) {
        Write-Log "Layanan $script:ServerServiceName sudah terdaftar"
        Stop-ServiceIfRunning -Name $script:ServerServiceName
    } else {
        if ($null -ne $imagePath) {
            Write-Log "Layanan $script:ServerServiceName menunjuk ke lokasi lama, didaftarkan ulang"
            Remove-ServiceCompletely -Name $script:ServerServiceName
        }
        Write-Log "Mendaftarkan layanan $script:ServerServiceName"
        $code = Invoke-Native -FilePath $script:WinSWExe -Arguments @('install')
        if ($code -ne 0) { throw "BankNTT-Server.exe install gagal (kode $code)" }
    }
    # Least privilege: the web server only needs to read its program files and server.env, and to
    # write logs. Built-in accounts take an empty password.
    $service = Get-WmiObject -Class Win32_Service -Filter "Name='$($script:ServerServiceName)'"
    if ($null -eq $service) { throw "Layanan $script:ServerServiceName tidak ditemukan setelah dipasang" }
    $result = $service.Change($null, $null, $null, $null, $null, $null, 'NT AUTHORITY\NetworkService', '', $null, $null, $null)
    if ($result.ReturnValue -ne 0) { throw "Gagal mengatur akun layanan $script:ServerServiceName (kode $($result.ReturnValue))" }
    Invoke-Native -FilePath 'sc.exe' -Arguments @('failure', $script:ServerServiceName, 'reset=', '3600',
        'actions=', 'restart/10000/restart/30000/restart/60000') | Out-Null
    # Program files must be readable by NetworkService even outside Program Files.
    Set-Acl-Icacls -Path $script:ServerDir -Arguments @('/grant', ($script:SidNetworkService + ':(OI)(CI)RX'))
}

function Start-ServerService {
    if (Test-PortListening -Port 3000) {
        Write-Log 'PERINGATAN: port 3000 sudah dipakai program lain (mungkin server lama atau tugas terjadwal manual). Hentikan program itu.'
    }
    Write-Log "Menjalankan layanan $script:ServerServiceName"
    Start-Service -Name $script:ServerServiceName
    if (-not (Wait-ServiceStatus -Name $script:ServerServiceName -Status 'Running' -Seconds 60)) {
        throw "Layanan $script:ServerServiceName tidak mau berjalan. Lihat $script:LogsDir"
    }
    # First start applies migrations and the seed, so allow some time.
    $deadline = (Get-Date).AddSeconds(120)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/health' -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) {
                Write-Log '    Server web siap: http://127.0.0.1:3000'
                return
            }
        } catch { }
        Start-Sleep -Seconds 2
    }
    Write-Log "PERINGATAN: server web belum menjawab /api/health setelah 120 detik. Lihat $script:LogsDir\server.log"
}

# --- 7. Firewall --------------------------------------------------------------------------------
function Set-FirewallRules {
    foreach ($name in $script:FirewallRules) {
        Remove-NetFirewallRule -Name $name -ErrorAction SilentlyContinue
    }
    New-NetFirewallRule -Name 'BankNTT-Server-TCP-3000' -DisplayName 'BankNTT Server (TCP 3000)' `
        -Description 'Server antrian Bank NTT untuk kiosk, TV dan loket di jaringan lokal.' `
        -Direction Inbound -Protocol TCP -LocalPort 3000 -RemoteAddress LocalSubnet -Profile Any -Action Allow | Out-Null
    New-NetFirewallRule -Name 'BankNTT-Discovery-UDP-41234' -DisplayName 'BankNTT Discovery (UDP 41234)' `
        -Description 'Pencarian otomatis server antrian Bank NTT di jaringan lokal.' `
        -Direction Inbound -Protocol UDP -LocalPort 41234 -RemoteAddress LocalSubnet -Profile Any -Action Allow | Out-Null
    Write-Log 'Aturan firewall TCP 3000 dan UDP 41234 (LocalSubnet) dipasang'
}

# --- 8. Daily backup ----------------------------------------------------------------------------
function Register-BackupTask {
    $backupScript = Join-Path $script:ServerDir 'tools\backup.js'
    $action = New-ScheduledTaskAction -Execute $script:NodeExe -Argument ('"' + $backupScript + '"') -WorkingDirectory (Join-Path $script:ServerDir 'tools')
    $trigger = New-ScheduledTaskTrigger -Daily -At '22:30'
    $principal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\NETWORKSERVICE' -LogonType ServiceAccount -RunLevel Limited
    # StartWhenAvailable: a PC that was off at 22:30 makes the backup at the next start.
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $script:BackupTaskName -Action $action -Trigger $trigger -Principal $principal `
        -Settings $settings -Description 'Cadangan harian database antrian Bank NTT (pg_dump).' -Force | Out-Null
    Write-Log "Tugas terjadwal $script:BackupTaskName (tiap hari 22:30) dipasang"
}

# --- main ---------------------------------------------------------------------------------------
try {
    Assert-Administrator
    Initialize-DataDirs
    Start-ScriptLog -Name 'install.log'
    $manifestPath = Join-Path $script:ServerDir 'bundle-manifest.json'
    $version = 'unknown'
    if (Test-Path -LiteralPath $manifestPath) {
        $version = (Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json).appVersion
    }
    Write-Log "Memasang server antrian Bank NTT $version dari $script:ServerDir"

    Install-VcRuntime
    Initialize-ServerEnv
    Protect-ServerEnv
    $config = Read-ServerEnv
    Initialize-Database -Config $config
    Register-PostgresService
    Start-PostgresService -Config $config
    Initialize-QueueDatabase -Config $config
    Register-ServerService
    Set-FirewallRules
    Register-BackupTask
    Start-ServerService
    Write-Log 'Selesai.'
    exit 0
} catch {
    Write-Log ('GAGAL: ' + $_.Exception.Message)
    exit 1
}
