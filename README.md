# Sistem Antrian Bank NTT

Satu aplikasi untuk kiosk tiket, loket petugas, layar TV, dan admin cabang. Nomor antrian disimpan di PostgreSQL. Kiosk dan TV tidak memakai login; keduanya dibuka sekali dengan token perangkat.

## Yang perlu disiapkan

- Komputer server di jaringan cabang, dengan [Docker](https://docs.docker.com/get-docker/) dan Docker Compose.
- Satu PC kiosk dengan Chrome, layar sentuh, dan printer thermal 80 mm sebagai printer default.
- Satu PC atau mini PC untuk TV, dengan Chrome.
- Alamat IP server yang bisa dijangkau kedua perangkat, misalnya `192.168.1.10`.

## Server

Dari folder proyek:

```bash
cp .env.example .env
```

Isi `.env` sebelum dinyalakan:

- `AUTH_SECRET`: string acak yang panjang.
- `SEED_ADMIN_PASSWORD` dan `SEED_STAFF_PASSWORD`: kata sandi awal. Ganti lagi dari halaman Admin setelah masuk.
- `KIOSK_TOKEN` dan `DISPLAY_TOKEN`: dua string acak yang berbeda. Jangan disamakan.
- `APP_TIMEZONE`: `Asia/Makassar` untuk WITA. Ganti ke `Asia/Jakarta` bila cabang memakai WIB.

Lalu jalankan:

```bash
docker compose up --build -d
```

Compose menyalakan Postgres, menjalankan migrasi dan data awal, lalu aplikasi di port 3000. Buka `http://localhost:3000` di server.

Masuk admin di `http://localhost:3000/login` dengan nama pengguna `admin` dan kata sandi dari `SEED_ADMIN_PASSWORD`. Petugas awal adalah `petugas.cs` dan `petugas.teller`, dengan kata sandi dari `SEED_STAFF_PASSWORD`.

Data awal berisi layanan Customer Service (`A`) dan Teller (`B`), plus loket CS 1, CS 2, Teller 1, dan Teller 2. Loket baru ditambah dari Admin dan langsung muncul di TV setelah petugas membukanya.

Tutup hari berjalan sendiri. Saat tanggal cabang berganti, tiket yang masih menunggu menjadi kedaluwarsa, dan tiket yang masih terbuka di loket ditandai selesai otomatis. Tiket selesai otomatis tidak masuk rata-rata laporan.

## Kiosk

Di PC kiosk, jadikan printer thermal sebagai printer default. Chrome harus mencetak tanpa dialog.

Ganti `TOKEN` dengan `KIOSK_TOKEN` dan `192.168.1.10` dengan IP server:

```bash
google-chrome --kiosk --kiosk-printing --app=http://192.168.1.10:3000/kiosk?token=TOKEN
```

Buka tautan itu sekali. Browser menyimpan izinnya sebagai cookie, lalu alamatnya bersih dari token. Kalau kiosk dibuka tanpa token, halaman menolak perangkat itu.

Nasabah memilih layanan. Satu sentuhan menghasilkan satu nomor dan satu cetakan. Sentuhan ganda tidak membuat nomor kedua.

## TV

Di PC TV, ganti `TOKEN` dengan `DISPLAY_TOKEN`:

```bash
google-chrome --kiosk --autoplay-policy=no-user-gesture-required --app=http://192.168.1.10:3000/display?token=TOKEN
```

Pada tayangan pertama, tekan **Aktifkan suara** supaya nomor yang dipanggil dibacakan. Dua panggilan yang berdekatan dibacakan berurutan.

## Loket petugas

Petugas membuka `http://192.168.1.10:3000/counter`, masuk, lalu memilih loket. Tombol utama memanggil nomor berikutnya. Nomor yang sama tidak bisa diambil dua loket.
