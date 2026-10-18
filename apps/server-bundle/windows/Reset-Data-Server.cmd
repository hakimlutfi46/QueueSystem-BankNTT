@echo off
rem Klik dua kali untuk mengosongkan data server antrian Bank NTT (meminta izin Administrator).
rem Cadangan dibuat lebih dulu di C:\ProgramData\BankNTT\backups.
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0reset-server.ps1"
echo.
pause
