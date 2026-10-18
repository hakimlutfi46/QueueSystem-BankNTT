# Bundle server Windows (offline)

Paket server antrian lengkap untuk PC Windows di dalam mesin tiket: PostgreSQL, Node.js, dan aplikasi
web sudah ada di dalamnya. PC tujuan tidak perlu internet, npm, atau Docker. Bundle ini nanti
dimasukkan ke installer aplikasi kiosk (`apps/kiosk-desktop`).

Target: Windows 10/11 x64, RAM 4 GB, tanpa Visual C++ runtime (ikut dipasang).

## Membuat bundle (di Mac/Linux)

```bash
npm run server:bundle                 # build lengkap
npm run server:bundle -- --skip-next  # pakai ulang build Next.js terakhir (.next-bundle/)
node apps/server-bundle/test-local.mjs  # uji migrasi, seed, launcher, discovery di mesin ini
```

Hasilnya `apps/server-bundle/dist/server/`. Build Next.js memakai folder `.next-bundle/`, jadi
`npm run dev` yang sedang berjalan tidak terganggu. Unduhan (Node.js, PostgreSQL, VC++ runtime,
WinSW) disimpan di `apps/server-bundle/.cache/`; setelah itu build bisa diulang tanpa internet.
Hash Node.js dicocokkan dengan `SHASUMS256.txt` resmi; berkas lain yang tidak punya hash resmi
dikunci saat pertama kali diunduh (`<berkas>.sha256` di cache).

Build gagal bila bundle memuat berkas `.env`, symlink, binary macOS, atau nilai rahasia dari
`.env` repo.

## Isi bundle

```
server\
  node.exe                 Node.js 24 LTS win-x64
  app\                     Next.js standalone (server.js, .next-bundle\, public\, node_modules\)
  pgsql\                   PostgreSQL 16 (bin, lib, share; tanpa pgAdmin, dokumen, header, simbol)
  migrations\              salinan prisma\migrations
  tools\                   launcher.js, migrate.js, seed.cjs, discovery.js, backup.js, discover-test.mjs
  BankNTT-Server.exe/.xml  WinSW 2.12 (pembungkus layanan Windows) + konfigurasinya
  vc_redist.x64.exe        Visual C++ 2015-2022 x64 runtime
  install-server.ps1       pasang / perbarui (aman diulang)
  uninstall-server.ps1     hapus layanan (data tetap disimpan kecuali -RemoveData)
  stop-server.ps1          hentikan layanan sebelum berkas program ditimpa
  status-server.ps1        keadaan layanan, database, /api/health, cadangan, log
  reset-server.ps1         kosongkan data (mulai dari awal), cadangan dibuat lebih dulu
  Reset-Data-Server.cmd    klik dua kali untuk reset-server.ps1 (meminta izin Administrator)
  server-common.ps1        fungsi bersama skrip di atas
  bundle-manifest.json     versi, commit, waktu build, ukuran
```

Data yang tidak ikut terhapus saat pembaruan atau uninstall ada di `C:\ProgramData\BankNTT\`:

| Lokasi | Isi |
| --- | --- |
| `server.env` | DATABASE_URL, AUTH_SECRET, kata sandi database (dibuat sekali, acak). **Jangan hilang.** |
| `pgdata\` | database PostgreSQL |
| `logs\` | `server.log` (launcher + Next.js), log WinSW, `install.log`, `backup.log` |
| `backups\` | cadangan harian `queue-YYYYMMDD-HHMMSS.dump` (30 hari) |

## Yang dipasang `install-server.ps1`

| Bagian | Nama | Keterangan |
| --- | --- | --- |
| Layanan | `BankNTT-PostgreSQL` | pg_ctl, NetworkService, otomatis, hanya `127.0.0.1:5432` (5433 dst. bila 5432 dipakai) |
| Layanan | `BankNTT-Server` | WinSW + `node.exe tools\launcher.js`, NetworkService, otomatis (tertunda), restart bila gagal |
| Firewall | `BankNTT-Server-TCP-3000`, `BankNTT-Discovery-UDP-41234` | masuk, LocalSubnet, semua profil |
| Tugas terjadwal | `BankNTT-Backup` | tiap hari 22:30 (atau saat PC menyala bila terlewat), NetworkService |

Saat layanan server mulai, launcher menunggu PostgreSQL, menjalankan migrasi yang belum ada
(tercatat di `_prisma_migrations` persis seperti `prisma migrate deploy`), menjalankan seed (aman
diulang; tanpa akun petugas), menyalakan discovery UDP, lalu server web di `0.0.0.0:3000`.

Admin awal: `admin` / `Password123` (atau `-AdminPassword`), wajib diganti saat masuk pertama.

## Kontrak untuk installer kiosk

Salin `dist\server\` ke folder program yang hanya bisa ditulis Administrator, misalnya
`C:\Program Files\BANK NTT Ticket\resources\server\` (installer harus perMachine/elevated; folder
per pengguna di AppData bisa ditimpa pengguna biasa padahal dijalankan layanan).

Semua skrip dijalankan elevated, dengan PowerShell 64-bit (skrip menjalankan ulang dirinya sendiri
di 64-bit bila dipanggil dari stub NSIS 32-bit):

```
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<server>\install-server.ps1" [-AdminPassword <sandi>] [-BranchName <nama>] [-TimeZone Asia/Jakarta]
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<server>\stop-server.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<server>\uninstall-server.ps1" [-RemoveData]
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<server>\status-server.ps1"
```

- **Pasang dan perbarui:** sebelum menyalin berkas, hentikan layanan lama (`stop-server.ps1` dari
  folder lama, atau `net stop BankNTT-Server` lalu `net stop BankNTT-PostgreSQL`), karena berkas
  yang sedang berjalan terkunci. Setelah menyalin, jalankan `install-server.ps1`.
- **Uninstall:** `uninstall-server.ps1` tanpa `-RemoveData`. Pada pembaruan (uninstaller lama
  dipanggil oleh installer baru) boleh dilewati, karena `install-server.ps1` mendaftarkan ulang.
- Kode keluar: 0 berhasil, 1 gagal (rincian di `C:\ProgramData\BankNTT\logs\install.log`).
  `status-server.ps1` keluar 0 bila `/api/health` menjawab.

## Mengosongkan data (mulai dari awal)

Untuk membuang data uji sebelum dipakai di cabang. Uninstall **tidak** menghapus data, jadi pakai ini:

```
C:\Program Files\BANK NTT Ticket\resources\server\Reset-Data-Server.cmd      (klik dua kali)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<server>\reset-server.ps1" [-Force]
```

Skrip meminta konfirmasi (ketik `RESET`), membuat cadangan `backups\sebelum-reset-YYYYMMDD-HHMMSS.dump`,
menghentikan layanan server, menghapus dan membuat ulang database `queue`, lalu menyalakan layanan lagi.
Launcher menjalankan migrasi dan data awal: akun `admin` dengan sandi awal (`SEED_ADMIN_PASSWORD` di
`server.env`, wajib diganti saat masuk), layanan CS dan Teller, loket contoh, tanpa petugas. Tiket,
laporan, petugas, perangkat, dan pengaturan Admin terhapus; kiosk dan TV mendaftar ulang sendiri dan
menunggu **Setujui** di Admin -> Perangkat. `server.env` tidak berubah. Rincian di `logs\reset.log`.

Memulihkan cadangan (bila reset tidak disengaja): hentikan `BankNTT-Server`, lalu
`pgsql\bin\pg_restore.exe -h 127.0.0.1 -p <PG_PORT> -U postgres -d queue --clean --if-exists <berkas.dump>`
(sandi `PG_SUPERUSER_PASSWORD` dari `server.env`), dan nyalakan layanan lagi.

## Discovery di jaringan lokal

Klien mengirim `{"type":"bankntt-discover","v":1}` ke UDP 41234 (broadcast atau langsung). Server
membalas ke alamat dan port pengirim:
`{"type":"bankntt-server","v":1,"name":"<nama cabang>","port":3000,"version":"<versi>"}`.
Pesan lain diabaikan; balasan dibatasi 10 per detik per pengirim. Uji dari PC mana pun:
`node.exe tools\discover-test.mjs` (broadcast) atau `node.exe tools\discover-test.mjs 192.168.1.20`.

## Catatan

- `sharp` tidak ikut: hanya dipakai optimasi gambar `next/image`, yang tidak dipakai aplikasi ini.
- Versi mayor PostgreSQL di bundle harus tetap 16; ganti versi mayor butuh `pg_upgrade` atau
  pg_dump/pg_restore dari cadangan.
- Bila `server.env` hilang sementara `pgdata\` masih ada, `install-server.ps1` berhenti dengan pesan
  (kata sandi database tidak diketahui). Pulihkan `server.env` dari salinan.
