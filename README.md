# Sistem Antrian Bank NTT

Satu aplikasi untuk kiosk tiket, loket petugas, layar TV, dan admin cabang. Nomor antrian disimpan di PostgreSQL. Kiosk dan TV tidak memakai login; setiap perangkat didaftarkan dari Admin dan dibuka sekali dengan tautannya sendiri.

**Baru mengenal proyek ini?** Mulai dari [docs/PANDUAN.md](docs/PANDUAN.md): gambaran lengkap, alur sehari-hari, menu admin, kiosk dan TV, aplikasi kiosk Windows, keamanan, backup, daftar perintah, peta kode, dan pemecahan masalah dalam satu dokumen.

## Menjalankan di laptop (localhost)

Untuk mencoba atau mengembangkan aplikasi tanpa Docker.

**Yang perlu terpasang:** Node.js 20.9 atau lebih baru, dan PostgreSQL 16 atau lebih baru yang menyala di laptop.

**Sekali saja:**

```bash
npm install
cp .env.example .env
createdb -h 127.0.0.1 queue_dev
```

Lalu ubah `.env`:

- `DATABASE_URL`: arahkan ke database tadi, misalnya `postgresql://USER@127.0.0.1:5432/queue_dev` (ganti `USER` dengan pengguna PostgreSQL Anda).
- `AUTH_SECRET`: string acak, misalnya hasil `openssl rand -base64 32`.
- `APP_TIMEZONE`: `Asia/Jakarta` bila laptop memakai WIB. Bisa diganti lagi dari Admin → Pengaturan.
- `TICKET_OUTPUT=printer` bila kiosk sudah tersambung ke printer thermal. Bila kosong, `npm run dev` mengunduh tiket sebagai PDF.

**Isi database dan nyalakan:**

```bash
npm run db:deploy                          # buat tabel
npm run db:seed                            # data awal: admin, layanan, pengaturan
SEED_DEMO_HISTORY_DAYS=0 npm run db:seed:demo   # 5 loket CS, 5 loket Teller, 10 petugas, tanpa riwayat
npm run dev
```

Buka `http://localhost:3000`. Dari kiosk, TV, atau HP di jaringan yang sama, pakai IP laptop, misalnya `http://192.168.1.97:3000`. IP laptop ada di pengaturan Wi-Fi.

| Halaman | Alamat | Masuk dengan |
| --- | --- | --- |
| Admin | `/admin` | `admin`, kata sandi dari `SEED_ADMIN_PASSWORD` |
| Loket petugas | `/counter` | `petugas.cs` … `petugas.cs5`, `petugas.teller` … `petugas.teller5`, kata sandi dari `SEED_STAFF_PASSWORD` |
| Kiosk dan TV | tautan dari Admin → Perangkat | tidak perlu masuk |

Satu browser hanya bisa memegang satu akun. Untuk mencoba admin dan beberapa petugas di satu laptop, pakai jendela Incognito atau browser lain.

**Mulai lagi dari data kosong:**

```bash
npx prisma migrate reset --force
npm run db:seed
SEED_DEMO_HISTORY_DAYS=0 npm run db:seed:demo
```

Semua tiket, perangkat terdaftar, dan pengaturan ikut terhapus. Daftarkan ulang kiosk dan TV di Admin → Perangkat, lalu restart `npm run dev`.

**Bila halaman dev dimuat ulang terus-menerus** dan log berisi "Compiled in 0ms" berulang, cache dev di folder `.next` rusak. Matikan `npm run dev`, hapus folder `.next`, lalu nyalakan lagi.

## Server cabang: yang perlu disiapkan

- Komputer server di jaringan cabang, dengan [Docker](https://docs.docker.com/get-docker/) dan Docker Compose.
- PC kiosk dengan Chrome, layar sentuh, dan printer thermal 80 mm sebagai printer default.
- PC atau mini PC untuk TV, dengan Chrome.
- Alamat IP server yang bisa dijangkau kiosk dan TV, misalnya `192.168.1.10`.

## Server cabang: memasang dengan Docker

Dari folder proyek:

```bash
cp .env.example .env
```

Isi `.env` sebelum dinyalakan:

- `AUTH_SECRET`: string acak yang panjang.
- `SEED_ADMIN_PASSWORD`: kata sandi awal admin. Bila kosong saat `npm run db:seed`, dipakai `Password123`. Akun yang masuk dengan sandi bawaan atau lemah langsung diminta menggantinya (lihat **Kata sandi dan keamanan masuk**).
- `APP_TIMEZONE`: `Asia/Makassar` untuk WITA, `Asia/Jakarta` untuk WIB, `Asia/Jayapura` untuk WIT. Setelah masuk, zona waktu juga bisa diganti dari Admin → Pengaturan.
- `SEED_ORG_NAME` (opsional): nama lembaga bila bukan Bank NTT.

`AUTH_SECRET` dan `SEED_ADMIN_PASSWORD` wajib. Compose menolak menyala dan menyebut nama variabelnya bila salah satunya kosong, supaya server tidak pernah berjalan dengan rahasia bawaan. String acak bisa dibuat dengan `openssl rand -base64 32`.

Lalu jalankan:

```bash
docker compose up --build -d
```

Compose menyalakan Postgres, menjalankan migrasi dan data awal, lalu aplikasi di port 3000. Buka `http://localhost:3000` di server.

Masuk admin di `http://localhost:3000/login` dengan nama pengguna `admin` dan kata sandi dari `SEED_ADMIN_PASSWORD`. Data awal tidak berisi akun petugas; tambahkan sendiri dari Admin → Petugas.

Data awal berisi layanan Customer Service (`A`) dan Teller (`B`), plus loket CS 1, CS 2, Teller 1, dan Teller 2. Loket baru ditambah dari Admin dan langsung muncul di TV setelah petugas membukanya.

Tutup hari berjalan sendiri. Saat tanggal cabang berganti, tiket yang masih menunggu menjadi kedaluwarsa, dan tiket yang masih terbuka di loket ditandai selesai otomatis. Tiket selesai otomatis tidak masuk rata-rata laporan.

## Memasang kiosk dan TV

Kiosk dan TV didaftarkan dari Admin. Setiap perangkat punya tautan sendiri, jadi satu cabang bisa memakai beberapa kiosk dan beberapa TV.

1. Masuk sebagai admin, lalu buka **Admin → Perangkat**.
2. Di panel **Daftarkan perangkat**, pilih Kiosk tiket atau Layar TV, lalu isi nama, misalnya "Kiosk Lobi".
3. Dialog menampilkan tautan pemasangan dan perintah Chrome layar penuh. Bila Admin dibuka dari `localhost`, ganti **Alamat server** dengan IP server, misalnya `http://192.168.1.10:3000`. Tautan dan perintah ikut berubah.
4. Jalankan perintah itu di perangkat, atau buka tautannya sekali. Browser menyimpan izinnya sebagai cookie, lalu alamatnya bersih dari token.

Tautan hanya tampil sekali. Setelah dialog ditutup, token tidak bisa dilihat lagi, karena server hanya menyimpan hash-nya. Bila tautan hilang, tekan **Tautan baru** pada perangkat itu.

Status perangkat di halaman Perangkat:

| Status | Arti |
| --- | --- |
| Tersambung | Perangkat menghubungi server dalam 3 menit terakhir |
| Belum dipasang | Tautan belum pernah dibuka |
| Tidak aktif | Pernah dibuka, tapi lebih dari 3 menit tidak menghubungi server |
| Dicabut | Izin perangkat dicabut |

- **Tautan baru** membuat token baru. Tautan lama langsung tidak berlaku, jadi perangkat harus dibuka ulang dengan tautan baru. Pada perangkat yang dicabut, tombol ini bernama **Aktifkan lagi**.
- **Cabut** mencabut izin. Layar yang masih terbuka menampilkan "Perangkat belum diizinkan" pada permintaan berikutnya. Pakai ini bila perangkat hilang, dipindah, atau tautannya tersebar.
- **Hapus** muncul pada perangkat yang sudah dicabut, untuk membuangnya dari daftar. Perangkat yang masih aktif harus dicabut dulu.

`KIOSK_TOKEN` dan `DISPLAY_TOKEN` di `.env` tidak wajib. Bila diisi, keduanya tetap diterima sebagai token cadangan di samping perangkat terdaftar, dengan tautan `/kiosk?token=KIOSK_TOKEN` dan `/display?token=DISPLAY_TOKEN`. Token cadangan tidak bisa dicabut dari Admin. Kosongkan keduanya di server cabang bila semua perangkat sudah didaftarkan dari Admin.

## Kiosk

Di PC kiosk, jadikan printer thermal sebagai printer default. Chrome harus mencetak tanpa dialog. Perintah dari dialog Perangkat bentuknya seperti ini:

```bash
google-chrome --kiosk --kiosk-printing --app="http://192.168.1.10:3000/kiosk?token=TOKEN"
```

Kalau kiosk dibuka tanpa token yang berlaku, halaman menolak perangkat itu.

Perintah di atas membuat kiosk layar penuh tanpa bilah alamat. Bila kiosk dibuka di browser biasa, misalnya saat demo, sentuhan pertama membuatnya layar penuh; TV punya tombol **Layar penuh** di pojok kanan atas. Tombol itu hilang sendiri bila layar sudah penuh.

Nasabah memilih layanan. Satu sentuhan menghasilkan satu nomor dan satu cetakan. Sentuhan ganda tidak membuat nomor kedua.

Belum punya printer? Isi `TICKET_OUTPUT=pdf` di `.env`: setiap tiket diunduh sebagai PDF seukuran kertas thermal, dan tombol **Ulang** di laporan harian membuka PDF-nya. Bila kosong, `npm run dev` memakai PDF dan build produksi langsung mencetak ke printer. Isi `TICKET_OUTPUT=printer` untuk memaksa cetak ke printer.

## Kiosk dengan aplikasi Windows (disarankan)

PC kiosk yang memakai Windows bisa memakai aplikasi **BANK NTT Ticket** sebagai pengganti Chrome. Aplikasi ini membuka kiosk layar penuh yang terkunci (Alt+F4, F11, Esc, dan pindah ke situs lain diblokir), menyala otomatis saat Windows login, dan mencetak tiket langsung ke printer thermal pilihan tanpa dialog. Bila printer mati, offline, atau kertas habis, kiosk menampilkan "Mohon hubungi petugas" dan tidak membuat nomor. TV memakai tautan atau aplikasi **BANK NTT TV** (lihat bagian TV).

1. **Buat installer sekali di server cabang** (sekitar 100 MB, tidak masuk git). Di **Admin → Perangkat → Aplikasi kiosk Windows**, tekan **Build installer**, atau dari terminal:

   ```bash
   npm run kiosk:build
   ```

   Hasilnya `downloads/BANK-NTT-Ticket-Setup.exe`. Server menyajikannya dari **Unduh installer (.exe)** di halaman yang sama, jadi bisa diunduh dari PC kiosk lewat jaringan lokal tanpa internet. Bila berkasnya disimpan di tempat lain, isi `KIOSK_INSTALLER_PATH` di `.env`.

   Nama aplikasi bawaannya **BANK NTT Ticket** dengan ikon simbol logo Bank NTT. Keduanya bisa diganti lewat tombol **Ubah** di panel itu (unggah gambar apa saja, dibuat persegi otomatis), lalu **Simpan & build ulang**. Build memakan sekitar setengah sampai tiga menit; build pertama perlu internet untuk mengunduh Electron. Tombol build hanya ada bila server berjalan dari folder proyek lengkap (`npm run start`); image Docker tidak memuat `apps/kiosk-desktop`, jadi di sana build dilakukan di komputer lain lalu isi `downloads/` disalin ke server.
2. Di PC kiosk, unduh dan jalankan installer. Installer belum ditandatangani, jadi Windows SmartScreen bisa menampilkan "Windows protected your PC": klik **More info → Run anyway**.
3. Di Admin → Perangkat, daftarkan kiosk lalu tekan **Kode aplikasi** (tombol ini ada untuk kiosk dan TV). Dialog menampilkan alamat server dan kode 6 karakter, misalnya `4K7-Q2M`, yang berlaku 30 menit dan sekali pakai.
4. Di aplikasi, isi alamat server (misalnya `10.70.10.67:3000`) dan kode itu, pilih printer thermal, tekan **Cetak uji**, lalu buat PIN admin. Kiosk langsung terbuka dan status di Admin berubah menjadi Tersambung.

Untuk keluar atau mengubah pengaturan, tekan **Ctrl + Shift + Alt + K** di kiosk dan masukkan PIN admin. Tombol Windows dan Ctrl+Alt+Del tidak bisa diblokir aplikasi apa pun; untuk penguncian penuh pakai akun Windows khusus dengan auto-login dan Shell Launcher. Langkahnya ada di [`apps/kiosk-desktop/README.md`](apps/kiosk-desktop/README.md).

Tautan lama perangkat tetap berlaku sampai kode dipakai. Setelah itu hanya aplikasi yang dipasangkan yang bisa membuka kiosk atau TV itu. Kode yang salah dibatasi 10 kali per 10 menit per alamat IP.

## TV

Perintah untuk TV dari dialog Perangkat:

```bash
google-chrome --kiosk --autoplay-policy=no-user-gesture-required --app="http://192.168.1.10:3000/display?token=TOKEN"
```

Layar TV dibagi dua: nomor yang sedang dipanggil dan empat panggilan sebelumnya di kiri, semua loket beserta statusnya (Buka, Istirahat, Tutup) di kanan.

Suara menyala sendiri bila Chrome dijalankan dengan perintah di atas, karena `--autoplay-policy=no-user-gesture-required` mengizinkan suara tanpa sentuhan. Bila TV dibuka di browser biasa, tombol **Aktifkan suara** muncul; tekan sekali. Setiap panggilan dan panggil ulang dibacakan, dan dua panggilan berdekatan dibacakan berurutan.

PC TV yang memakai Windows bisa memakai aplikasi **BANK NTT TV** sebagai pengganti Chrome. Pemasangannya sama dengan aplikasi kiosk: di Admin → Perangkat, daftarkan TV lalu tekan **Kode aplikasi**, kemudian isi alamat server dan kode 6 karakter itu (berlaku 30 menit, sekali pakai) di aplikasi. Installer aplikasi TV tidak dibuat dari Admin.

## Loket petugas

Petugas membuka `http://192.168.1.10:3000/counter`, masuk, lalu memilih loket. Tombol utama (atau `Spasi`) memanggil nomor berikutnya, dan timer berjalan sejak nomor dipanggil. Nomor yang sama tidak bisa diambil dua loket.

Loket hanya memanggil tiket dari layanan yang terhubung dengannya. Hubungannya diatur dari Admin → Loket (per loket) atau Admin → Layanan → **Atur loket** (per layanan). Di data contoh, Customer Service (A001…) hanya dipanggil CS 1–5 dan Teller (B001…) hanya Teller 1–5.

Aksi yang sulit dibatalkan meminta konfirmasi lebih dulu: keluar dari akun, menonaktifkan loket atau layanan, membuat tautan perangkat baru, mengubah peran atau menonaktifkan petugas, menghapus logo, dan mengganti zona waktu.

## Kata sandi dan keamanan masuk

- **Wajib ganti sandi.** Akun yang masuk dengan sandi bawaan (`Password123`, `change-me`), sandi umum, sandi yang memuat nama pengguna, atau sandi kurang dari 8 karakter langsung dibawa ke halaman **Ganti kata sandi**. Begitu juga akun baru dan sandi yang direset admin: sandi dari admin bersifat sementara. Sampai sandi diganti, loket, panel admin, dan API-nya tidak bisa dibuka. Di Admin → Petugas, akun seperti ini bertanda **Wajib ganti sandi**.
- **Ganti sandi sendiri** kapan saja lewat ikon gembok di samping nama (panel admin dan layar loket), atau `/account/password`. Sandi baru minimal 8 karakter, berbeda dari yang lama, dan tidak mudah ditebak.
- **Batas percobaan.** Setelah 5 sandi salah untuk satu akun dari satu komputer, masuk ditolak 15 menit. Satu akun juga dikunci setelah 20 sandi salah dari komputer mana pun, dan satu komputer setelah 50 sandi salah untuk akun mana pun. Penghitungnya disimpan di memori server, jadi memulai ulang server membuka kunci.

`AUTH_ALLOW_WEAK_PASSWORDS=true` mematikan kewajiban ganti sandi lemah. Isian ini hanya dipakai uji end-to-end; jangan diisi di server cabang.

## Backup database

Cadangkan database tiap hari. Tanpa cadangan, kerusakan disk server menghapus seluruh riwayat antrian dan laporan.

```bash
npm run db:backup
```

Perintah ini membuat `backups/queue-YYYYMMDD-HHMMSS.dump` dengan `pg_dump`, memeriksa berkasnya bisa dibaca, lalu menghapus cadangan yang lebih tua dari 30 hari. Folder dan masa simpan bisa diatur dengan `BACKUP_DIR` dan `BACKUP_KEEP_DAYS` di `.env`. Butuh PostgreSQL client tools (`pg_dump`, `pg_restore`) di server, dengan versi yang sama atau lebih baru dari server database.

Jadwalkan tiap malam:

- **Linux/Mac (cron)**: `crontab -e`, lalu tambahkan `30 22 * * * cd /opt/antrian && npm run db:backup >> backups/backup.log 2>&1`.
- **Windows (Task Scheduler)**: Create Basic Task → Daily 22.30 → Start a program: `cmd.exe` dengan argumen `/c cd /d C:\antrian && npm run db:backup >> backups\backup.log 2>&1`.
- **Docker**: layanan `backup` di `docker-compose.yml` sudah mencadangkan tiap 24 jam ke folder `./backups` di server.

Salin folder `backups` secara berkala ke tempat lain (flashdisk, NAS, atau server kantor pusat). Cadangan yang hanya ada di disk server ikut hilang bila disk itu rusak.

**Memulihkan** (menimpa isi database; hentikan aplikasi dulu):

```bash
pg_restore --clean --if-exists --no-owner --dbname="postgresql://USER:SANDI@127.0.0.1:5432/queue" backups/queue-20261017-223000.dump
```

Dengan Docker: `docker compose stop app`, lalu `docker compose exec -T db pg_restore --clean --if-exists --no-owner -U queue -d queue < backups/queue-20261017-223000.dump`, lalu `docker compose start app`. Coba pemulihan sesekali ke database terpisah supaya yakin cadangannya bisa dipakai.

## Identitas lembaga

Bawaannya aplikasi memakai nama, logo, dan warna Bank NTT. Untuk lembaga lain, buka **Admin → Identitas & tampilan**:

- **Nama lembaga** dan **Slogan**. Kosongkan slogan untuk menyembunyikannya.
- **Logo**: PNG, JPG, WebP, atau SVG, paling besar 512 KB. Logo disimpan di database, jadi Docker tidak butuh volume tambahan. **Pakai logo bawaan** mengembalikan logo Bank NTT.
- **Warna**: lima warna merek (Utama, Sekunder, Aksen terang, Sorotan, Latar TV). Warna teks, latar halaman, sukses, dan bahaya tetap supaya tulisan selalu terbaca. Bagian Keterbacaan memeriksa kontras dan memberi peringatan bila ada pasangan yang sulit dibaca, tapi tetap boleh disimpan. **Kembali ke warna bawaan** memulihkan warna Bank NTT.

Setelah **Simpan identitas**, kiosk, TV, dan layar petugas ikut berubah tanpa muat ulang. Nama cabang dan teks berjalan tetap diatur dari Admin → Pengaturan.

Untuk data awal, isi `SEED_ORG_NAME` sebelum menjalankan `npm run db:seed`. Nilai itu dipakai untuk nama lembaga, nama cabang, dan teks berjalan "Selamat datang di ...". Bila kosong, dipakai "Bank NTT". Docker Compose juga meneruskan variabel ini ke seed pertama.

## Data contoh

Untuk mencoba aplikasi di laptop, isi database dengan data contoh:

```bash
npm run db:seed
npm run db:seed:demo
```

Perintah kedua mengisi cabang contoh yang hanya punya loket Teller dan Customer Service. Ada 2 layanan: **Customer Service** (nomor A001, A002, …) dilayani CS 1–5, dan **Teller** (nomor B001, B002, …) dilayani Teller 1–5. Ada 5 loket CS dan 5 loket Teller, 10 petugas (`petugas.cs` sampai `petugas.cs5` untuk CS 1–5, `petugas.teller` sampai `petugas.teller5` untuk Teller 1–5) dan satu akun `supervisor` (admin), serta riwayat tiket tujuh hari kerja terakhir untuk laporan. Kata sandi akun baru sama dengan `SEED_STAFF_PASSWORD`; kata sandi akun yang sudah ada tidak diubah. Layanan dengan awalan A dan B diberi nama baru, sedangkan layanan, loket, dan akun contoh lama lainnya dinonaktifkan, tidak dihapus. Jangan jalankan perintah ini di server cabang. Untuk memasang layanan, loket, dan petugas tanpa riwayat tiket contoh, jalankan `SEED_DEMO_HISTORY_DAYS=0 npm run db:seed:demo`.

## Pengujian

Cara menjalankan lint, uji unit dan integrasi, uji end-to-end, dan daftar periksa tampilan ada di [TESTING.md](TESTING.md).
