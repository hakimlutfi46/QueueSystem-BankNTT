# Sistem Antrian Bank NTT

Satu aplikasi untuk kiosk tiket, loket petugas, layar TV, dan admin cabang. Nomor antrian disimpan di PostgreSQL. Kiosk dan TV tidak memakai login; setiap perangkat didaftarkan dari Admin dan dibuka sekali dengan tautannya sendiri.

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
- `SEED_ADMIN_PASSWORD` dan `SEED_STAFF_PASSWORD`: kata sandi awal. Bila kosong saat `npm run db:seed`, dipakai `Password123`. Ganti lagi dari halaman Admin setelah masuk.
- `APP_TIMEZONE`: `Asia/Makassar` untuk WITA, `Asia/Jakarta` untuk WIB, `Asia/Jayapura` untuk WIT. Setelah masuk, zona waktu juga bisa diganti dari Admin → Pengaturan.
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

Belum punya printer? Isi `TICKET_OUTPUT=pdf` di `.env`: setiap tiket diunduh sebagai PDF seukuran kertas thermal, dan tombol **Ulang** di laporan harian membuka PDF-nya. Bila kosong, `npm run dev` memakai PDF dan build produksi langsung mencetak ke printer. Isi `TICKET_OUTPUT=printer` untuk memaksa cetak ke printer.

## TV

Perintah untuk TV dari dialog Perangkat:

```bash
google-chrome --kiosk --autoplay-policy=no-user-gesture-required --app="http://192.168.1.10:3000/display?token=TOKEN"
```

Layar TV dibagi dua: nomor yang sedang dipanggil dan empat panggilan sebelumnya di kiri, semua loket beserta statusnya (Buka, Istirahat, Tutup) di kanan.

Suara menyala sendiri bila Chrome dijalankan dengan perintah di atas, karena `--autoplay-policy=no-user-gesture-required` mengizinkan suara tanpa sentuhan. Bila TV dibuka di browser biasa, tombol **Aktifkan suara** muncul; tekan sekali. Setiap panggilan dan panggil ulang dibacakan, dan dua panggilan berdekatan dibacakan berurutan.

## Loket petugas

Petugas membuka `http://192.168.1.10:3000/counter`, masuk, lalu memilih loket. Tombol utama (atau `Spasi`) memanggil nomor berikutnya, dan timer berjalan sejak nomor dipanggil. Nomor yang sama tidak bisa diambil dua loket.

Loket hanya memanggil tiket dari layanan yang terhubung dengannya. Hubungannya diatur dari Admin → Loket (per loket) atau Admin → Layanan → **Atur loket** (per layanan). Di data contoh, Customer Service (A001…) hanya dipanggil CS 1–5 dan Teller (B001…) hanya Teller 1–5.

Aksi yang sulit dibatalkan meminta konfirmasi lebih dulu: keluar dari akun, menonaktifkan loket atau layanan, membuat tautan perangkat baru, mengubah peran atau menonaktifkan petugas, menghapus logo, dan mengganti zona waktu.

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
