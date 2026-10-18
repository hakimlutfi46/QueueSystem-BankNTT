#!/bin/bash
# Reset Database Fresh Sistem Antrian Bank NTT (macOS)
cd "$(dirname "$0")"

clear
echo "======================================================="
echo "   RESET DATABASE FRESH - SISTEM ANTRIAN BANK NTT      "
echo "======================================================="
echo ""
echo "PERHATIAN:"
echo "Perintah ini akan MENGHAPUS BERSIH seluruh data tiket,"
echo "log panggilan, dan mengembalikan nomor antrian ke 001."
echo "Hanya data default bawaan (Admin, Layanan, Loket) yang tersisa."
echo ""
read -p "Ketik Y lalu Enter untuk melanjutkan reset [Y/N]: " CONFIRM

if [ "$CONFIRM" != "Y" ] && [ "$CONFIRM" != "y" ]; then
    echo ""
    echo "Reset dibatalkan."
    exit 0
fi

echo ""
node scripts/reset-fresh.mjs

echo ""
read -n 1 -s -r -p "Tekan sembarang tombol untuk keluar..."
echo ""
