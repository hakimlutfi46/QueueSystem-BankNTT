@echo off
chcp 65001 >nul
title Reset Database Fresh - Bank NTT

echo =======================================================
echo    RESET DATABASE FRESH - SISTEM ANTRIAN BANK NTT
echo =======================================================
echo.
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
