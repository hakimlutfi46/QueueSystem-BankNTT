@echo off
chcp 65001 >nul
title Reset Database Fresh - Bank NTT

echo =======================================================
echo    RESET DATABASE FRESH - SISTEM ANTRIAN BANK NTT
echo =======================================================
echo.

rem PC yang hanya dipasangi aplikasi Ticket-Server tidak punya Node.js maupun repo:
rem pakai skrip reset bawaan server yang terpasang.
where node >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%ProgramFiles%\BANK NTT Ticket\resources\server\Reset-Data-Server.cmd" (
        echo Node.js tidak ada di PC ini. Menjalankan reset bawaan aplikasi Ticket-Server...
        call "%ProgramFiles%\BANK NTT Ticket\resources\server\Reset-Data-Server.cmd"
        exit /b
    )
    echo Node.js tidak ada di PC ini, dan aplikasi Ticket-Server tidak ditemukan.
    echo File ini hanya untuk folder repo. Di PC server, buka Start Menu,
    echo lalu BANK NTT Server - Reset Data Server.
    pause
    exit /b 1
)

echo PERHATIAN:
echo Perintah ini akan MENGHAPUS BERSIH seluruh data tiket,
echo log panggilan, dan mengembalikan nomor antrian ke 001.
echo Hanya data default bawaan (Admin, Layanan, Loket) yang tersisa.
echo.
set /p CONFIRM="Ketik Y lalu Enter untuk melanjutkan reset [Y/N]: "
if /i not "%CONFIRM%"=="Y" (
    echo.
    echo Reset dibatalkan.
    pause
    exit /b 0
)

echo.
cd /d "%~dp0"
node scripts\reset-fresh.mjs

echo.
echo Tekan sembarang tombol untuk menutup jendela ini...
pause >nul
