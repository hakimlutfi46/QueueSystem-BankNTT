# Shared helpers for install-server.ps1, uninstall-server.ps1, status-server.ps1 and stop-server.ps1.
# Windows PowerShell 5.1 compatible. Keep this file ASCII only (PS 5.1 reads BOM-less files as ANSI).

$script:ServerDir = $PSScriptRoot
$script:DataDir = Join-Path $env:ProgramData 'BankNTT'
$script:EnvFile = Join-Path $script:DataDir 'server.env'
$script:PgData = Join-Path $script:DataDir 'pgdata'
$script:LogsDir = Join-Path $script:DataDir 'logs'
$script:BackupsDir = Join-Path $script:DataDir 'backups'
$script:PgBin = Join-Path $script:ServerDir 'pgsql\bin'
$script:NodeExe = Join-Path $script:ServerDir 'node.exe'
$script:WinSWExe = Join-Path $script:ServerDir 'BankNTT-Server.exe'

$script:PgServiceName = 'BankNTT-PostgreSQL'
$script:ServerServiceName = 'BankNTT-Server'
$script:BackupTaskName = 'BankNTT-Backup'
$script:FirewallRules = @('BankNTT-Server-TCP-3000', 'BankNTT-Discovery-UDP-41234')

# Well-known SIDs, so the scripts work on non-English Windows too.
$script:SidSystem = '*S-1-5-18'
$script:SidAdmins = '*S-1-5-32-544'
$script:SidNetworkService = '*S-1-5-20'

$script:LogFile = $null

function Write-Log {
    param([string]$Message)
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Write-Host $line
    if ($script:LogFile) {
        try { Add-Content -LiteralPath $script:LogFile -Value $line -Encoding ASCII } catch { }
    }
}

function Start-ScriptLog {
    param([string]$Name)
    try {
        if (-not (Test-Path -LiteralPath $script:LogsDir)) {
            New-Item -ItemType Directory -Path $script:LogsDir -Force | Out-Null
        }
        $script:LogFile = Join-Path $script:LogsDir $Name
    } catch {
        $script:LogFile = $null
    }
}

# A 32-bit host (the NSIS installer stub is 32-bit) sees SysWOW64 instead of System32 and the
# 32-bit registry view. Re-run the calling script in 64-bit PowerShell in that case.
# Returns $true when the script was re-launched; the caller must then exit with $global:LASTEXITCODE.
function Invoke-As64Bit {
    param([string]$ScriptPath, [System.Collections.IDictionary]$BoundParameters)
    if (-not [Environment]::Is64BitOperatingSystem) { return $false }
    if ([Environment]::Is64BitProcess) { return $false }
    $ps64 = Join-Path $env:windir 'sysnative\WindowsPowerShell\v1.0\powershell.exe'
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $ScriptPath)
    foreach ($key in $BoundParameters.Keys) {
        $value = $BoundParameters[$key]
        if ($value -is [System.Management.Automation.SwitchParameter]) {
            if ($value.IsPresent) { $argList += "-$key" }
        } elseif ($null -ne $value -and "$value" -ne '') {
            $argList += "-$key"
            $argList += "$value"
        }
    }
    & $ps64 @argList | Out-Host
    return $true
}

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Jalankan skrip ini sebagai Administrator.'
    }
}

# Runs a native program, logs its output, returns the exit code. Stderr output of native programs
# must not become a terminating error under $ErrorActionPreference = 'Stop' (PS 5.1 behaviour).
function Invoke-Native {
    param([string]$FilePath, [string[]]$Arguments, [switch]$Quiet)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $FilePath @Arguments 2>&1 | ForEach-Object { "$_" }
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    if (-not $Quiet) {
        foreach ($line in $output) {
            if ("$line".Trim() -ne '') { Write-Log ('    ' + $line) }
        }
    }
    return [int]$code
}

# Like Invoke-Native but returns the output lines (exit code in $script:LastNativeExitCode).
function Get-NativeOutput {
    param([string]$FilePath, [string[]]$Arguments)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $FilePath @Arguments 2>&1 | ForEach-Object { "$_" }
        $script:LastNativeExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    return $output
}

function Read-ServerEnv {
    $values = @{}
    if (-not (Test-Path -LiteralPath $script:EnvFile)) { return $values }
    foreach ($raw in Get-Content -LiteralPath $script:EnvFile -Encoding UTF8) {
        $line = $raw.Trim()
        if ($line -eq '' -or $line.StartsWith('#')) { continue }
        $index = $line.IndexOf('=')
        if ($index -lt 1) { continue }
        $key = $line.Substring(0, $index).Trim()
        $value = $line.Substring($index + 1).Trim()
        if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $values[$key] = $value
    }
    return $values
}

function Get-ServiceImagePath {
    param([string]$Name)
    $key = 'HKLM:\SYSTEM\CurrentControlSet\Services\' + $Name
    if (-not (Test-Path -LiteralPath $key)) { return $null }
    return (Get-ItemProperty -LiteralPath $key -Name ImagePath -ErrorAction SilentlyContinue).ImagePath
}

function Wait-ServiceStatus {
    param([string]$Name, [string]$Status, [int]$Seconds = 60)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
        if ($null -eq $service) { return ($Status -eq 'Missing') }
        if ($service.Status.ToString() -eq $Status) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Stop-ServiceIfRunning {
    param([string]$Name, [int]$Seconds = 60)
    $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if ($null -eq $service) { return }
    if ($service.Status.ToString() -ne 'Stopped') {
        Write-Log "Menghentikan layanan $Name"
        try { Stop-Service -Name $Name -Force -ErrorAction Stop } catch { Write-Log "    $($_.Exception.Message)" }
        if (-not (Wait-ServiceStatus -Name $Name -Status 'Stopped' -Seconds $Seconds)) {
            Write-Log "    $Name belum berhenti setelah $Seconds detik"
        }
    }
}

# Removes a service and waits until Windows has really deleted it (it stays "marked for deletion"
# while e.g. services.msc keeps a handle open).
function Remove-ServiceCompletely {
    param([string]$Name)
    if ($null -eq (Get-Service -Name $Name -ErrorAction SilentlyContinue)) { return }
    Stop-ServiceIfRunning -Name $Name
    Invoke-Native -FilePath 'sc.exe' -Arguments @('delete', $Name) | Out-Null
    if (-not (Wait-ServiceStatus -Name $Name -Status 'Missing' -Seconds 30)) {
        Write-Log "    Layanan $Name ditandai untuk dihapus; tutup jendela Services lalu ulangi bila perlu."
    }
}
