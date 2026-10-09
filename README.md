# Sistem Antrian Bank NTT

Satu aplikasi untuk kiosk tiket, loket petugas, layar TV, dan admin cabang. Nomor antrian disimpan di PostgreSQL. Kiosk dan TV tidak memakai login; setiap perangkat didaftarkan dari Admin dan dibuka sekali dengan tautannya sendiri.

## Yang perlu disiapkan

- Komputer server di jaringan cabang, dengan [Docker](https://docs.docker.com/get-docker/) dan Docker Compose.
- PC kiosk dengan Chrome, layar sentuh, dan printer thermal 80 mm sebagai printer default.
- PC atau mini PC untuk TV, dengan Chrome.
- Alamat IP server yang bisa dijangkau kiosk dan TV, misalnya `192.168.1.10`.

## Server

Dari folder proyek:

```bash
cp .env.example .env
```

Isi `.env` sebelum dinyalakan:

- `AUTH_SECRET`: string acak yang panjang.
- `SEED_ADMIN_PASSWORD` dan `SEED_STAFF_PASSWORD`: kata sandi awal. Ganti lagi dari halaman Admin setelah masuk.
- `APP_TIMEZONE`: `Asia/Makassar` untuk WITA. Ganti ke `Asia/Jakarta` bila cabang memakai WIB.
- `SEED_ORG_NAME` (opsional): nama lembaga bila bukan Bank NTT.

Tiga nilai pertama wajib. Compose menolak menyala dan menyebut nama variabelnya bila salah satunya kosong, supaya server tidak pernah berjalan dengan rahasia bawaan. String acak bisa dibuat dengan `openssl rand -base64 32`.

Lalu jalankan:

```bash
docker compose up --build -d
```

Compose menyalakan Postgres, menjalankan migrasi dan data awal, lalu aplikasi di port 3000. Buka `http://localhost:3000` di server.

Masuk admin di `http://localhost:3000/login` dengan nama pengguna `admin` dan kata sandi dari `SEED_ADMIN_PASSWORD`. Petugas awal adalah `petugas.cs` dan `petugas.teller`, dengan kata sandi dari `SEED_STAFF_PASSWORD`.

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

`KIOSK_TOKEN` dan `DISPLAY_TOKEN` di `.env` tidak wajib. Bila diisi, keduanya tetap diterima sebagai token cadangan di samping perangkat terdaftar, dengan tautan `/kiosk?token=KIOSK_TOKEN` dan `/display?token=DISPLAY_TOKEN`. Token cadangan tidak bisa dicabut dari Admin. Kosongkan keduanya di server cabang bila semua perangkat sudah didaftarkan dari Admin.

## Kiosk

Di PC kiosk, jadikan printer thermal sebagai printer default. Chrome harus mencetak tanpa dialog. Perintah dari dialog Perangkat bentuknya seperti ini:

```bash
google-chrome --kiosk --kiosk-printing --app="http://192.168.1.10:3000/kiosk?token=TOKEN"
```

Kalau kiosk dibuka tanpa token yang berlaku, halaman menolak perangkat itu.

Nasabah memilih layanan. Satu sentuhan menghasilkan satu nomor dan satu cetakan. Sentuhan ganda tidak membuat nomor kedua.

## TV

Perintah untuk TV dari dialog Perangkat:

```bash
google-chrome --kiosk --autoplay-policy=no-user-gesture-required --app="http://192.168.1.10:3000/display?token=TOKEN"
```

Pada tayangan pertama, tekan **Aktifkan suara** supaya nomor yang dipanggil dibacakan. Dua panggilan yang berdekatan dibacakan berurutan.

## Loket petugas

Petugas membuka `http://192.168.1.10:3000/counter`, masuk, lalu memilih loket. Tombol utama memanggil nomor berikutnya. Nomor yang sama tidak bisa diambil dua loket.

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

Perintah kedua menambah layanan Kredit (`C`) dan Pembukaan Rekening (`D`), loket CS 3, Teller 3, dan Kredit 1, enam petugas dan satu akun `supervisor` (admin), serta riwayat tiket tujuh hari kerja terakhir untuk laporan. Kata sandi semua akun tambahan sama dengan `SEED_STAFF_PASSWORD`. Jangan jalankan perintah ini di server cabang.

## Pengujian

Cara menjalankan lint, uji unit dan integrasi, uji end-to-end, dan daftar periksa tampilan ada di [TESTING.md](TESTING.md).
