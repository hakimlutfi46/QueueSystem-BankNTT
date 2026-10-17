# Panduan Lengkap Sistem Antrian Bank NTT

Dokumen ini menjelaskan seluruh proyek dalam satu tempat: apa saja bagiannya, bagaimana dipakai sehari-hari, cara memasang, cara merawat, dan di mana kodenya. Baca dari atas bila baru mengenal proyek ini, atau langsung lompat ke bagian yang dibutuhkan.

Dokumen lain yang lebih rinci:

| Dokumen | Isi |
| --- | --- |
| [README.md](../README.md) | Langkah teknis memasang dan menjalankan |
| [TESTING.md](../TESTING.md) | Cara menjalankan semua uji dan daftar periksa manual |
| [DECISIONS.md](../DECISIONS.md) | Catatan keputusan desain beserta alasannya |
| [PLAN.md](../PLAN.md) | Spesifikasi awal proyek |
| [apps/kiosk-desktop/README.md](../apps/kiosk-desktop/README.md) | Rincian aplikasi kiosk Windows |

## Daftar isi

1. [Gambaran singkat](#1-gambaran-singkat)
2. [Istilah](#2-istilah)
3. [Alur sehari-hari](#3-alur-sehari-hari)
4. [Siapa membuka apa](#4-siapa-membuka-apa)
5. [Menu Admin satu per satu](#5-menu-admin-satu-per-satu)
6. [Kiosk dan TV](#6-kiosk-dan-tv)
7. [Aplikasi kiosk Windows (BANK NTT Ticket)](#7-aplikasi-kiosk-windows-bank-ntt-ticket)
8. [Keamanan](#8-keamanan)
9. [Menjalankan di laptop](#9-menjalankan-di-laptop)
10. [Memasang di server cabang](#10-memasang-di-server-cabang)
11. [Backup dan pemulihan](#11-backup-dan-pemulihan)
12. [Isi berkas .env](#12-isi-berkas-env)
13. [Daftar perintah](#13-daftar-perintah)
14. [Peta folder dan kode](#14-peta-folder-dan-kode)
15. [Cara kerja di balik layar](#15-cara-kerja-di-balik-layar)
16. [Tabel database](#16-tabel-database)
17. [Pengujian](#17-pengujian)
18. [Pemecahan masalah](#18-pemecahan-masalah)

---

## 1. Gambaran singkat

Satu aplikasi web (Next.js + PostgreSQL) yang berjalan di satu **server cabang**. Semua layar lain membuka server itu lewat jaringan lokal cabang, tanpa perlu internet.

```
                         ┌──────────────────────────────┐
                         │        SERVER CABANG         │
                         │  Aplikasi web (port 3000)    │
                         │  + database PostgreSQL       │
                         └──────────────┬───────────────┘
                                        │ jaringan lokal (LAN / Wi-Fi)
        ┌───────────────┬───────────────┼────────────────┬────────────────┐
        │               │               │                │                │
  ┌─────┴─────┐   ┌─────┴─────┐   ┌─────┴─────┐    ┌─────┴─────┐    ┌─────┴─────┐
  │  KIOSK    │   │   TV      │   │  LOKET    │    │  LOKET    │    │  ADMIN    │
  │ ambil     │   │ tampil &  │   │ petugas   │    │ petugas   │    │ panel     │
  │ nomor +   │   │ bacakan   │   │ CS 1      │    │ Teller 1  │    │ cabang    │
  │ cetak     │   │ panggilan │   │  …        │    │  …        │    │           │
  └───────────┘   └───────────┘   └───────────┘    └───────────┘    └───────────┘
  tanpa login     tanpa login     login petugas    login petugas    login admin
  (perangkat      (perangkat
   terdaftar)      terdaftar)
```

Lima bagian yang dipakai orang:

| Bagian | Dipakai oleh | Fungsi |
| --- | --- | --- |
| **Kiosk tiket** (`/kiosk`) | Nasabah | Pilih layanan, dapat nomor, tiket tercetak |
| **Layar TV** (`/display`) | Nasabah di ruang tunggu | Menampilkan dan membacakan nomor yang dipanggil, serta status semua loket |
| **Loket petugas** (`/counter`) | Petugas CS dan Teller | Buka loket, panggil nomor berikutnya, selesai, tidak hadir, istirahat |
| **Panel admin** (`/admin`) | Admin/supervisor cabang | Atur loket, layanan, petugas, perangkat, tampilan, pengaturan; lihat laporan |
| **Aplikasi kiosk Windows** | PC kiosk ber-Windows | Membuka kiosk layar penuh terkunci dan mencetak tanpa dialog (opsional; kiosk juga bisa lewat browser) |

---

## 2. Istilah

| Istilah | Arti |
| --- | --- |
| **Layanan** | Jenis keperluan nasabah, misalnya Customer Service (huruf **A**) dan Teller (huruf **B**). Huruf awalan menjadi awal nomor tiket. |
| **Nomor/tiket** | Nomor antrian yang diambil nasabah, misalnya **A001**. Urutan mulai lagi dari 001 setiap hari, per layanan. |
| **Loket** | Meja pelayanan, misalnya CS 1 atau Teller 3. Satu loket melayani satu atau beberapa layanan. |
| **Petugas** | Akun yang bekerja di loket (peran **Petugas**). |
| **Admin** | Akun yang mengatur cabang (peran **Admin**). Admin juga bisa bekerja di loket. |
| **Perangkat** | Kiosk atau TV yang didaftarkan di Admin → Perangkat. Perangkat tidak login; izinnya berupa token. |
| **Token perangkat** | Kunci rahasia acak milik satu perangkat. Disimpan perangkat di cookie; server hanya menyimpan sidiknya (hash). |
| **Tautan pemasangan** | Alamat `…/kiosk?token=…` atau `…/display?token=…` yang dibuka sekali di perangkat untuk memasang token. |
| **Kode pemasangan** | Kode pendek 6 karakter (misalnya `4K7-Q2M`) untuk memasangkan aplikasi kiosk Windows, pengganti tautan. |
| **Tanggal layanan** | Tanggal menurut zona waktu cabang (WIB/WITA/WIT), dipakai untuk penomoran dan laporan. |
| **Tutup hari** | Proses otomatis saat tanggal berganti: tiket yang belum dilayani menjadi kedaluwarsa. |

---

## 3. Alur sehari-hari

### Perjalanan satu nasabah

```
 Nasabah                Kiosk                 Server                TV               Loket
   │  sentuh "Teller"     │                      │                    │                  │
   │─────────────────────>│  minta nomor         │                    │                  │
   │                      │─────────────────────>│ buat B007 (WAITING)│                  │
   │   tiket B007 keluar  │<─────────────────────│                    │                  │
   │<─────────────────────│                      │                    │                  │
   │                      │                      │      petugas tekan "Panggil berikutnya"
   │                      │                      │<──────────────────────────────────────│
   │                      │                      │ B007 → SERVING di Teller 2            │
   │                      │                      │───────────────────>│ tampil + suara   │
   │  "Nomor antrian B007, silakan menuju loket Teller 2"            │                  │
   │                      │                      │      petugas tekan "Selesai…"         │
   │                      │                      │<──────────────────────────────────────│
   │                      │                      │ B007 → DONE                           │
```

### Status tiket

```
  WAITING ──(dipanggil)──> SERVING ──(selesai)──────> DONE
     │                        └────(tidak hadir)────> NO_SHOW
     └──(tanggal berganti, belum dipanggil)─────────> EXPIRED
```

| Status | Arti |
| --- | --- |
| `WAITING` | Menunggu dipanggil |
| `SERVING` | Sedang dilayani di satu loket |
| `DONE` | Selesai dilayani |
| `NO_SHOW` | Dipanggil tapi nasabah tidak datang |
| `EXPIRED` | Hari berganti sebelum dipanggil |

Hanya perpindahan di atas yang diizinkan. Satu tiket tidak mungkin diambil dua loket, dan satu loket hanya melayani satu tiket pada satu waktu (dijaga database, bukan hanya tampilan).

### Status loket

| Status | Arti | Di TV |
| --- | --- | --- |
| **Tutup** (`CLOSED`) | Tidak ada petugas | Tampil sebagai tutup |
| **Buka** (`OPEN`) | Petugas bertugas dan bisa memanggil | Tampil nomor yang dilayani |
| **Istirahat** (`PAUSED`) | Petugas rehat sebentar, loket tetap atas namanya | Tampil istirahat |

Loket yang **nonaktif** (diatur Admin) berbeda dengan **tutup**: loket nonaktif disembunyikan dari pilihan petugas dan dari TV sampai diaktifkan lagi. Tutup hanya berarti sedang tidak dipakai.

### Hari kerja petugas

1. Buka `/counter`, masuk, pilih loket. Loket kini atas nama petugas itu.
2. Tekan **Panggil berikutnya** (atau tombol `Spasi`). Nomor tertua dari layanan loket itu dipanggil, TV membacakannya, timer mulai.
3. Setelah melayani: **Selesai dan panggil berikutnya**, atau **Selesai tanpa memanggil**.
4. Bila nasabah tidak datang: **Panggil ulang** (dibatasi sesuai pengaturan), lalu **Tidak hadir**.
5. **Istirahat** bila rehat; **Tutup loket** saat selesai bertugas, lalu keluar.

### Tutup hari

Berjalan sendiri, dicek tiap menit oleh server. Saat tanggal cabang berganti, tiket yang masih menunggu menjadi `EXPIRED`, dan tiket yang masih terbuka di loket ditandai selesai otomatis (tidak dihitung dalam rata-rata laporan). Nomor esok hari mulai lagi dari 001.

---

## 4. Siapa membuka apa

| Alamat | Siapa | Perlu |
| --- | --- | --- |
| `/` | Siapa saja | Halaman awal |
| `/login` | Petugas dan admin | Nama pengguna + kata sandi. Admin diarahkan ke `/admin`, petugas ke `/counter` |
| `/account/password` | Petugas dan admin | Ganti kata sandi sendiri |
| `/counter` | Petugas (dan admin) | Login |
| `/admin/…` | Admin | Login dengan peran Admin |
| `/kiosk` | Kiosk | Token perangkat kiosk |
| `/display` | TV | Token perangkat TV |
| `/print/[id]` | Admin | Cetak ulang tiket dari laporan |
| `/device-required` | — | Halaman "Perangkat belum diizinkan" untuk kiosk/TV tanpa token sah |
| `/styleguide` | Pengembang | Contoh warna dan komponen tampilan |
| `/api/health` | Pemantauan | Jawab `{ ok: true }` bila server dan database hidup |

Satu browser hanya memegang satu akun. Untuk mencoba beberapa akun di satu komputer, pakai jendela Incognito atau browser lain.

---

## 5. Menu Admin satu per satu

| Menu | Untuk apa |
| --- | --- |
| **Dasbor** | Ringkasan hari ini secara langsung: total tiket, menunggu, sedang ditangani, selesai, tidak hadir, rata-rata tunggu dan penanganan, loket buka, dan keadaan tiap loket |
| **Laporan** | Laporan harian dan rentang tanggal: jumlah per layanan/loket/petugas, waktu tunggu dan layanan. Bisa diunduh (Excel/CSV). Tombol **Ulang** mencetak ulang tiket. |
| **Loket** | Tambah, ganti nama, aktif/nonaktifkan loket; atur layanan yang dilayani tiap loket; tutup paksa loket yang ditinggal |
| **Layanan** | Tambah layanan dan huruf awalannya, urutan di kiosk, aktif/nonaktif; **Atur loket** untuk memilih loket yang melayaninya |
| **Petugas** | Tambah akun (sandi sementara), ubah nama/peran, reset sandi, nonaktifkan. Akun tidak dihapus supaya laporan lama utuh. Tanda **Wajib ganti sandi** untuk akun yang belum mengganti sandi. |
| **Perangkat** | Daftarkan kiosk dan TV, tautan pemasangan, **Kode aplikasi** untuk aplikasi Windows, cabut izin, status tersambung. Panel **Aplikasi kiosk Windows**: nama, ikon, build, dan unduh installer. |
| **Identitas & tampilan** | Nama lembaga, slogan, logo, dan warna merek (untuk lembaga selain Bank NTT) |
| **Pengaturan** | Nama cabang, teks berjalan di TV, suara panggilan, batas panggil ulang, target lama layanan, catatan kaki dan lebar tiket (58/80 mm), zona waktu |

Aksi yang sulit dibatalkan (menonaktifkan, mencabut, mengganti zona waktu, dan sebagainya) selalu meminta konfirmasi dulu.

---

## 6. Kiosk dan TV

Kiosk dan TV **tidak login**. Setiap perangkat didaftarkan di **Admin → Perangkat** dan menyimpan tokennya sendiri, jadi satu cabang bisa punya beberapa kiosk dan TV, dan masing-masing bisa dicabut sendiri.

### Cara memasang (lewat browser)

1. Admin → Perangkat → pilih **Kiosk tiket** atau **Layar TV**, isi nama (misalnya "Kiosk Lobi"), tekan **Buat tautan pemasangan**.
2. Bila Admin dibuka lewat `localhost`, ganti **Alamat server** di dialog dengan IP server (misalnya `http://192.168.1.10:3000`).
3. Buka tautan itu sekali di perangkat, atau jalankan perintah Chrome layar penuh dari dialog:
   - Kiosk: `google-chrome --kiosk --kiosk-printing --app="…/kiosk?token=…"`
   - TV: `google-chrome --kiosk --autoplay-policy=no-user-gesture-required --app="…/display?token=…"`
4. Status perangkat berubah menjadi **Tersambung**.

Tautan hanya tampil sekali. Bila hilang, tekan **Tautan baru** (tautan lama langsung mati). **Cabut** mematikan izin perangkat yang hilang atau dipindah.

| Status di Admin | Arti |
| --- | --- |
| Tersambung | Menghubungi server dalam 3 menit terakhir |
| Belum dipasang | Tautan/kode belum pernah dipakai |
| Tidak aktif | Pernah tersambung, tapi lebih dari 3 menit diam |
| Dicabut | Izin dicabut admin |

### Kiosk

- Nasabah menyentuh layanan; satu sentuhan = satu nomor = satu cetakan (sentuhan ganda tidak membuat nomor kedua).
- Tombol menyesuaikan ukuran layar; nama layanan yang panjang mengecil otomatis supaya tidak terpotong.
- Keluaran tiket diatur `TICKET_OUTPUT`: `printer` (cetak ke printer thermal) atau `pdf` (unduh PDF, untuk mencoba tanpa printer). Kosong: `npm run dev` memakai PDF, produksi memakai printer.
- Di browser biasa, sentuhan pertama membuat kiosk layar penuh.

### TV

- Kiri: nomor yang sedang dipanggil (besar) dan beberapa panggilan sebelumnya. Kanan: semua loket beserta statusnya.
- Panggilan dibacakan dalam bahasa Indonesia ("Nomor antrian B007, silakan menuju loket Teller 2") memakai rekaman suara di `public/audio`. Panggilan yang datang berdekatan dibacakan berurutan.
- Browser butuh satu ketukan untuk mengizinkan suara, kecuali Chrome dijalankan dengan `--autoplay-policy=no-user-gesture-required`.
- Teks berjalan dan nama cabang diatur di Admin → Pengaturan.

---

## 7. Aplikasi kiosk Windows (BANK NTT Ticket)

Pengganti Chrome untuk **PC kiosk ber-Windows (10/11, 64-bit)**. TV dan kiosk non-Windows tetap memakai tautan. Kode aplikasinya ada di `apps/kiosk-desktop` (Electron).

**Kelebihannya dibanding browser:**
- Layar penuh terkunci: Alt+F4, F5, F11, F12, Esc, klik kanan, pindah situs, dan jendela baru diblokir; jendela yang tertutup dibuka lagi.
- Menyala otomatis saat Windows login.
- Mencetak tiket langsung ke printer pilihan tanpa dialog.
- Membaca status printer: bila offline atau kertas habis, kiosk menampilkan "Mohon hubungi petugas" dan **tidak** membuat nomor.

### Membuat installer (sekali, di server)

- Dari Admin → Perangkat → panel **Aplikasi kiosk Windows** → **Build installer**, atau dari terminal `npm run kiosk:build`.
- Hasil: `downloads/BANK-NTT-Ticket-Setup.exe` (sekitar 100 MB, tidak masuk git). Unduh dari tombol **Unduh installer (.exe)** di panel yang sama.
- Nama dan ikon bisa diganti lewat **Ubah** → **Simpan & build ulang**. Bawaannya "BANK NTT Ticket" dengan simbol logo Bank NTT (`public/brand/kiosk-app-icon.png`).
- Build pertama butuh internet (mengunduh Electron); berikutnya bisa offline, sekitar setengah sampai tiga menit.
- Satu installer untuk **semua** kiosk. Build ulang hanya bila nama/ikon/kode aplikasi berubah, **bukan** setiap menambah kiosk.
- Tombol build hanya ada bila server berjalan dari folder proyek lengkap. Di Docker, build di komputer lain lalu salin isi `downloads/` ke server.

### Memasang di PC kiosk

1. Unduh dan jalankan installer. Installer belum ditandatangani, jadi bila muncul "Windows protected your PC": **More info → Run anyway**.
2. Di Admin → Perangkat, daftarkan kiosk lalu tekan **Kode aplikasi**. Muncul alamat server dan kode 6 karakter (berlaku 30 menit, sekali pakai).
3. Di aplikasi, isi form **Pemasangan BANK NTT Ticket**:

   | Kolom | Isi |
   | --- | --- |
   | Alamat server | Misalnya `10.70.10.67:3000` |
   | Kode pemasangan | Kode dari Admin, misalnya `4K7-Q2M` |
   | Printer tiket | Printer thermal; tekan **Cetak uji** untuk mencoba |
   | PIN admin (2×) | Minimal 4 angka, untuk keluar dari kiosk |

4. **Simpan & pasangkan**. Kiosk terbuka dan status di Admin menjadi Tersambung.

Setelah itu aplikasi langsung membuka kiosk setiap menyala, **tanpa** form dan **tanpa** PIN.

### Keluar atau mengubah pengaturan

Tekan **Ctrl + Shift + Alt + K** → masukkan PIN → **Keluar aplikasi**, **Ubah pengaturan**, atau **Batal**. Salah PIN 5 kali: terkunci 60 detik.

Lupa PIN: tutup aplikasi lewat Task Manager, hapus `%APPDATA%\kiosk-antrian\config.json`, buka lagi aplikasinya untuk memasang ulang. Log ada di `%APPDATA%\kiosk-antrian\logs\kiosk.log`.

### Penguncian penuh Windows

Tombol Windows dan Ctrl+Alt+Del tidak bisa diblokir aplikasi apa pun. Untuk mesin yang benar-benar tertutup: akun Windows khusus (bukan administrator) dengan auto-login, matikan Task Manager lewat Group Policy, dan bila Windows Pro/Enterprise pakai Shell Launcher. Langkahnya di [apps/kiosk-desktop/README.md](../apps/kiosk-desktop/README.md).

---

## 8. Keamanan

| Hal | Cara kerjanya |
| --- | --- |
| **Login** | Nama pengguna + kata sandi (disimpan sebagai hash argon2). Sesi berupa cookie; peran dan status akun dibaca ulang dari database setiap permintaan, jadi akun yang dinonaktifkan langsung keluar. |
| **Batas percobaan** | 5 sandi salah per akun per komputer → ditolak 15 menit. 20 salah untuk satu akun dari komputer mana pun, atau 50 salah dari satu komputer, juga dikunci 15 menit. Restart server membuka kunci. |
| **Wajib ganti sandi** | Sandi bawaan (`Password123`, `change-me`), umum, memuat nama pengguna, atau kurang dari 8 karakter; akun baru dan sandi yang direset admin. Sampai diganti, loket dan admin tertutup dan pengguna dibawa ke `/account/password`. |
| **Sandi baru** | Minimal 8 karakter, berbeda dari yang lama, tidak mudah ditebak. |
| **Perangkat** | Token acak per perangkat, hanya hash yang disimpan, bisa dicabut satu per satu. Token kiosk tidak bisa membuka TV dan sebaliknya. |
| **Kode pemasangan** | 6 karakter tanpa huruf/angka yang mirip, 30 menit, sekali pakai, dibatasi percobaannya. |
| **Rahasia server** | `AUTH_SECRET` wajib diisi string acak panjang; Docker menolak menyala tanpanya. |

Lupa kata sandi petugas: admin mereset dari Admin → Petugas; petugas wajib menggantinya saat masuk.

---

## 9. Menjalankan di laptop

Butuh Node.js 20.9+ dan PostgreSQL 16+.

```bash
npm install
cp .env.example .env          # lalu isi DATABASE_URL dan AUTH_SECRET
createdb -h 127.0.0.1 queue_dev
npm run db:deploy             # buat/perbarui tabel
npm run db:seed               # admin, layanan, pengaturan awal
SEED_DEMO_HISTORY_DAYS=0 npm run db:seed:demo   # 5 loket CS, 5 loket Teller, 10 petugas
npm run dev                   # buka http://localhost:3000
```

**Setiap kali menarik kode baru** (git pull), jalankan `npm install` dan `npm run db:deploy` sebelum `npm run dev`. Bila lupa, halaman bisa error karena kolom database baru belum ada.

Dari HP, kiosk, atau TV di jaringan yang sama, buka pakai IP laptop, misalnya `http://192.168.1.97:3000`.

Mulai dari data kosong: `npx prisma migrate reset --force`, lalu ulangi seed. Kiosk dan TV harus didaftarkan ulang.

Rincian lengkap: [README.md](../README.md#menjalankan-di-laptop-localhost).

---

## 10. Memasang di server cabang

Dua pilihan:

| Cara | Kapan dipakai | Catatan |
| --- | --- | --- |
| **Docker Compose** (`docker compose up --build -d`) | Paling mudah dirawat | Database, migrasi, aplikasi, dan backup harian dalam satu perintah. Tombol build installer kiosk tidak tersedia. |
| **Node langsung** (`npm run build` lalu `npm run start`) | Butuh build installer dari Admin | PostgreSQL dipasang terpisah; jadwalkan `npm run db:backup` sendiri |

### Daftar periksa sebelum dipakai nasabah

- [ ] `.env`: `AUTH_SECRET` acak, `APP_TIMEZONE` sesuai cabang, `SEED_ADMIN_PASSWORD`/`SEED_STAFF_PASSWORD` bukan bawaan.
- [ ] `KIOSK_TOKEN` dan `DISPLAY_TOKEN` dikosongkan setelah semua perangkat didaftarkan dari Admin.
- [ ] `AUTH_ALLOW_WEAK_PASSWORDS` **tidak** diisi.
- [ ] Server memakai IP tetap di jaringan cabang.
- [ ] Admin → Pengaturan: nama cabang, teks berjalan, zona waktu, lebar tiket.
- [ ] Admin → Loket dan Layanan sesuai cabang; akun petugas dibuat dan masing-masing sudah mengganti sandi.
- [ ] Kiosk terpasang (aplikasi Windows atau Chrome), **Cetak uji** rapi, satu tiket sungguhan tercetak.
- [ ] TV terpasang, suara panggilan terdengar.
- [ ] Backup harian berjalan dan pernah dicoba dipulihkan ke database terpisah.

---

## 11. Backup dan pemulihan

```bash
npm run db:backup
```

Membuat `backups/queue-YYYYMMDD-HHMMSS.dump`, memeriksa berkasnya bisa dibaca, dan menghapus cadangan lebih dari 30 hari (`BACKUP_KEEP_DAYS`). Jadwalkan tiap malam:

- Linux/Mac: `crontab -e` → `30 22 * * * cd /opt/antrian && npm run db:backup >> backups/backup.log 2>&1`
- Windows: Task Scheduler → Daily → `cmd.exe /c cd /d C:\antrian && npm run db:backup >> backups\backup.log 2>&1`
- Docker: layanan `backup` sudah mencadangkan tiap 24 jam ke `./backups`.

Salin folder `backups` ke tempat lain secara berkala (flashdisk, NAS, kantor pusat).

Memulihkan (menimpa database, hentikan aplikasi dulu):

```bash
pg_restore --clean --if-exists --no-owner --dbname="postgresql://USER:SANDI@127.0.0.1:5432/queue" backups/queue-20261017-223000.dump
```

Versi Docker ada di [README.md](../README.md#backup-database).

---

## 12. Isi berkas .env

| Variabel | Wajib | Isi |
| --- | --- | --- |
| `DATABASE_URL` | Ya | Alamat database PostgreSQL |
| `AUTH_SECRET` | Ya | String acak panjang (`openssl rand -base64 32`) untuk sesi login |
| `APP_TIMEZONE` | Ya | `Asia/Jakarta` (WIB), `Asia/Makassar` (WITA), `Asia/Jayapura` (WIT). Bisa diganti di Admin → Pengaturan. |
| `SEED_ADMIN_PASSWORD` | Saat seed | Sandi awal akun `admin` |
| `SEED_STAFF_PASSWORD` | Saat seed | Sandi awal akun petugas contoh |
| `SEED_ORG_NAME` | Tidak | Nama lembaga bila bukan Bank NTT |
| `KIOSK_TOKEN`, `DISPLAY_TOKEN` | Tidak | Token cadangan kiosk/TV. Kosongkan di cabang bila semua perangkat terdaftar dari Admin. Dipakai uji e2e. |
| `TICKET_OUTPUT` | Tidak | `printer` atau `pdf` |
| `KIOSK_INSTALLER_PATH` | Tidak | Lokasi `.exe` bila tidak di `downloads/` |
| `BACKUP_DIR`, `BACKUP_KEEP_DAYS` | Tidak | Folder dan masa simpan backup |
| `AUTH_ALLOW_WEAK_PASSWORDS` | **Jangan** di cabang | Hanya untuk uji e2e |

---

## 13. Daftar perintah

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Menjalankan mode pengembangan di port 3000 |
| `npm run build` lalu `npm run start` | Build dan menjalankan mode produksi |
| `npm run db:deploy` | Menerapkan migrasi database (aman, tidak menghapus data) |
| `npm run db:seed` | Data awal: admin, layanan A/B, pengaturan |
| `npm run db:seed:demo` | Data contoh 10 loket + 10 petugas (+ riwayat; `SEED_DEMO_HISTORY_DAYS=0` tanpa riwayat). Jangan di server cabang. |
| `npm run db:backup` | Cadangkan database |
| `npm run kiosk:build` | Membuat installer aplikasi kiosk Windows |
| `npm run lint` | Pemeriksaan gaya kode |
| `npm run typecheck` | Pemeriksaan tipe TypeScript |
| `npm test` | Uji unit dan integrasi (database `queue_test`) |
| `npm run test:e2e` | Uji end-to-end di browser (database `queue_e2e`) |
| `npx prisma migrate reset --force` | **Menghapus semua data** dan membuat ulang tabel |

---

## 14. Peta folder dan kode

```
.
├── src/
│   ├── app/                      Halaman dan API (Next.js App Router)
│   │   ├── kiosk/                Layar kiosk + halaman cetak tiket
│   │   ├── display/              Layar TV
│   │   ├── counter/              Layar loket petugas
│   │   ├── admin/                Panel admin (dasbor, laporan, loket, layanan, petugas, perangkat, …)
│   │   ├── login/, account/      Masuk dan ganti kata sandi
│   │   ├── print/                Cetak ulang tiket dari laporan
│   │   └── api/                  API: tiket, loket, admin, laporan, stream realtime, pairing kiosk
│   ├── lib/                      Logika inti (tanpa tampilan)
│   │   ├── queue/                Ambil nomor, panggil, selesai, tidak hadir, tutup hari, aturan status
│   │   ├── realtime/             Sinyal langsung: LISTEN/NOTIFY PostgreSQL → SSE ke layar
│   │   ├── auth/                 Login, sesi, token perangkat, kode pemasangan, batas percobaan, aturan sandi
│   │   ├── admin/                CRUD loket, layanan, petugas, pengaturan
│   │   ├── reports/              Query laporan dan ekspor Excel/CSV
│   │   ├── print/                Tiket thermal, PDF, jembatan ke aplikasi kiosk Windows
│   │   ├── kiosk/                Tata letak kiosk, installer dan build aplikasi Windows
│   │   ├── speech/               Kalimat panggilan, angka ke kata ("tujuh"), pemutar suara
│   │   ├── display/, counters/   Tata letak TV, tampilan loket
│   │   └── db.ts, env.ts         Koneksi database, zona waktu
│   ├── components/               Komponen tampilan bersama (tombol, panel, ikon, logo, tiket)
│   ├── styles/tokens.css         Warna, ukuran huruf, dan gaya merek
│   ├── proxy.ts                  Penjaga akses: login untuk loket/admin, token untuk kiosk/TV
│   └── auth.ts                   Konfigurasi login (Auth.js)
├── prisma/
│   ├── schema.prisma             Struktur database
│   ├── migrations/               Riwayat perubahan database
│   ├── seed.ts, seed-demo.ts     Data awal dan data contoh
├── apps/kiosk-desktop/           Aplikasi kiosk Windows (Electron)
│   ├── src/main.js               Jendela kiosk, penguncian, IPC, autostart
│   ├── src/printing.js           Cetak senyap ke printer
│   ├── src/printer-status.js     Membaca status printer Windows
│   ├── src/renderer/             Layar pemasangan, PIN admin, halaman offline
│   └── scripts/build-and-copy.mjs  Membuat installer ke downloads/
├── public/                       Logo, ikon aplikasi, rekaman suara panggilan
├── scripts/backup-db.mjs         Backup database
├── tests/                        unit/, integration/, e2e/
├── docs/PANDUAN.md               Dokumen ini
├── downloads/   (tidak di git)   Installer .exe hasil build
└── backups/     (tidak di git)   Cadangan database
```

Mencari sesuatu di kode:

| Ingin mengubah… | Lihat |
| --- | --- |
| Cara nomor dibuat | `src/lib/queue/issue-ticket.ts` |
| Logika "Panggil berikutnya" | `src/lib/queue/call-next.ts`, query di `src/lib/queue/sql.ts` |
| Buka/istirahat/tutup loket | `src/lib/queue/desk.ts` |
| Tampilan kiosk | `src/app/kiosk/kiosk-screen.tsx` |
| Tampilan TV | `src/app/display/display-screen.tsx` |
| Tampilan loket | `src/app/counter/counter-screen.tsx` |
| Isi tiket cetak | `src/components/print/ticket-slip.tsx`, `src/lib/print/ticket-pdf.ts` |
| Kalimat suara panggilan | `src/lib/speech/announcement.ts` |
| Isi laporan | `src/lib/reports/query.ts` |
| Siapa boleh membuka apa | `src/proxy.ts`, `src/lib/auth/session.ts` |
| Warna dan gaya | `src/styles/tokens.css`, Admin → Identitas & tampilan |

---

## 15. Cara kerja di balik layar

- **Satu sumber kebenaran.** Semua nomor dan status ada di PostgreSQL. Layar tidak menyimpan antrean sendiri.
- **Penomoran.** Tabel `daily_sequences` menyimpan urutan per layanan per tanggal, dinaikkan dalam transaksi, jadi dua kiosk yang menekan bersamaan tetap mendapat nomor berbeda.
- **Panggil berikutnya.** Mengambil tiket `WAITING` tertua dari layanan loket dengan kunci baris (`FOR UPDATE SKIP LOCKED`), jadi dua loket yang menekan bersamaan tidak mendapat nomor yang sama.
- **Realtime.** Setiap perubahan mengirim `pg_notify`. Server mendengarkan (`LISTEN`) dan meneruskannya ke semua layar lewat Server-Sent Events (`/api/stream`). Layar lalu mengambil keadaan terbaru dari `/api/queue/state`. Bila koneksi putus, layar menyambung ulang sendiri.
- **Zona waktu.** Koneksi database selalu UTC; tanggal layanan dan jam di layar/tiket dihitung dengan zona waktu cabang dari Pengaturan.
- **Cetak tiket.** Di browser: halaman `/kiosk/print/[id]` dicetak lewat iframe tersembunyi (Chrome `--kiosk-printing` tanpa dialog). Di aplikasi Windows: halaman yang sama dimuat di jendela tersembunyi lalu dicetak senyap ke printer pilihan, dengan ukuran kertas 58/80 mm.
- **Akses perangkat.** `src/proxy.ts` memeriksa setiap permintaan ke kiosk/TV: token dari `?token=` dipindah ke cookie lalu alamatnya dibersihkan; token dicocokkan dengan hash di tabel `devices`.
- **Identitas lembaga.** Nama, logo, dan warna disimpan di tabel `settings`, jadi aplikasi yang sama bisa dipakai lembaga lain tanpa mengubah kode.

---

## 16. Tabel database

| Tabel | Isi |
| --- | --- |
| `services` | Layanan (nama, huruf awalan, urutan, aktif) |
| `counters` | Loket (nama, nomor tampil, status, petugas yang memegang, aktif) |
| `counter_services` | Layanan apa saja yang dilayani tiap loket |
| `users` | Akun petugas/admin (hash sandi, peran, aktif, wajib ganti sandi) |
| `tickets` | Tiket (nomor, layanan, tanggal, status, loket, petugas, waktu ambil/panggil/selesai) |
| `ticket_events` | Jejak setiap kejadian tiket (dipanggil, panggil ulang, selesai, tidak hadir, kedaluwarsa) untuk laporan |
| `daily_sequences` | Penghitung nomor per layanan per hari |
| `devices` | Kiosk dan TV terdaftar (hash token, kode pemasangan, terakhir aktif, dicabut) |
| `settings` | Pengaturan cabang, identitas lembaga, nama/ikon aplikasi kiosk |

Struktur lengkap ada di `prisma/schema.prisma`. Perubahan struktur selalu lewat berkas baru di `prisma/migrations/` dan diterapkan dengan `npm run db:deploy`.

---

## 17. Pengujian

| Jenis | Perintah | Database |
| --- | --- | --- |
| Unit + integrasi (Vitest) | `npm test` | `queue_test` (dibuat otomatis) |
| End-to-end (Playwright) | `npm run test:e2e` | `queue_e2e` (disiapkan sendiri) |
| Lint + tipe | `npm run lint`, `npm run typecheck` | — |

Aturan penting:
- **Matikan `npm run dev` sebelum menjalankan e2e**, atau jalankan e2e di port lain (`NEXT_DIST_DIR=.next-e2e npm run build` lalu `E2E_PORT=3100 npm run test:e2e`). Uji tidak boleh menyentuh database kerja `queue_dev`.
- Uji e2e masuk dengan sandi `change-me`; Playwright otomatis menyalakan server dengan `AUTH_ALLOW_WEAK_PASSWORDS=true`.

Cara lengkap dan daftar periksa manual: [TESTING.md](../TESTING.md).

---

## 18. Pemecahan masalah

| Gejala | Penyebab dan solusi |
| --- | --- |
| Halaman error setelah `git pull` | Migrasi baru belum diterapkan: matikan dev, `npm run db:deploy`, nyalakan lagi |
| Selalu dibawa ke "Ganti kata sandi" | Sandi masih bawaan/lemah/sementara. Ganti dengan sandi minimal 8 karakter yang tidak mudah ditebak |
| "Terlalu banyak percobaan yang salah" | Tunggu sesuai waktu di pesan, atau restart server |
| Kiosk/TV: "Perangkat belum diizinkan" | Token dicabut atau belum dipasang. Admin → Perangkat → **Tautan baru** / **Kode aplikasi** |
| Kiosk/TV: "Menyambung ulang…" terus | Server mati atau IP berubah. Cek server dan alamat di perangkat |
| TV tidak bersuara | Ketuk layar sekali, atau jalankan Chrome dengan `--autoplay-policy=no-user-gesture-required`; cek **Suara panggilan** di Pengaturan |
| Tiket tidak tercetak (browser) | Printer thermal harus printer default, Chrome dengan `--kiosk-printing`, `TICKET_OUTPUT` bukan `pdf` |
| Kiosk Windows: "Mohon hubungi petugas — Printer…" | Printer offline/kertas habis/tidak ditemukan. Perbaiki printer; kiosk pulih sendiri dalam 10 detik |
| Jam di tiket salah | Atur zona waktu di Admin → Pengaturan |
| Tombol "Build installer" tidak ada | Server berjalan di Docker (tanpa `apps/kiosk-desktop`). Build di komputer lain, salin `downloads/` |
| Build installer gagal | Lihat catatan build di panel. Build pertama butuh internet |
| SmartScreen memblokir installer | **More info → Run anyway**; installer belum ditandatangani |
| Dev dimuat ulang terus ("Compiled in 0ms") | Matikan dev, hapus folder `.next`, nyalakan lagi |
| Lupa PIN aplikasi kiosk | Task Manager → tutup aplikasi → hapus `%APPDATA%\kiosk-antrian\config.json` → pasang ulang dengan kode baru |
| Lupa sandi admin | Admin lain mereset dari Admin → Petugas. Bila tidak ada admin lain, minta pengembang mereset sandi akun itu langsung di database (`npm run db:seed` tidak mengubah akun yang sudah ada) |
