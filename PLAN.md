# Plan Rancangan Sistem Antrian CS dan Teller

Oct 7, 2026 · @Hakim

Sistem antrian berbasis web untuk loket CS dan teller: nasabah mengambil tiket bernomor di kiosk, TV menampilkan nomor yang sedang dipanggil, dan petugas memanggil nomor berikutnya dengan satu tombol. Dibangun dengan Next.js dan PostgreSQL, jumlah loket diatur dinamis dari halaman admin, dan tampilannya mengikuti standar branding Bank NTT.

Dokumen ini adalah spesifikasi kerja untuk AI agentic. Kerjakan per fase sesuai bagian Tahapan implementasi, dan jangan lanjut ke fase berikutnya sebelum kriteria selesai fase itu terpenuhi.

## Sekilas alur

&#91;embedded content: alur sistem antrian · 3 layar, 1 server, 1 admin\]

Angka 1 sampai 3 adalah perjalanan satu tiket: diambil di kiosk, dipanggil dari loket, lalu diumumkan di TV. Admin mengatur jumlah loket dan membaca laporan dari data yang sama.

## Ruang lingkup

Sistem terdiri dari empat tampilan dalam satu aplikasi Next.js. Ukuran layar kiosk dan TV mengikuti spesifikasi dokumen branding: mesin antrian memakai LCD sentuh 19 inci (hal. 76) dan booth TV memakai TV 42 inci (hal. 79).

| Tampilan | Route | Pengguna | Perangkat | Fungsi |
| --- | --- | --- | --- | --- |
| Kiosk tiket | `/kiosk` | Nasabah | Layar sentuh 19 inci + printer thermal | Pilih layanan, sistem memberi nomor, tiket tercetak |
| Display TV | `/display` | Nasabah di ruang tunggu | TV 42 inci, landscape 1920×1080 | Menampilkan nomor yang dipanggil per loket, memutar suara panggilan |
| Loket | `/counter` | Petugas CS atau teller | PC di meja loket | Selesai dan panggil nomor berikutnya, panggil ulang, tandai tidak hadir |
| Admin | `/admin` | Admin atau supervisor | PC | Kelola layanan, loket, petugas, pengaturan; lihat laporan |

Istilah yang dipakai di seluruh dokumen dan kode:

- **Layanan** (`service`): jenis antrian, misalnya Customer Service atau Teller. Tiap layanan punya huruf awalan sendiri.
- **Loket** (`counter`): satu meja petugas, misalnya CS 1 atau Teller 2. Jumlahnya bebas ditambah atau dikurangi dari Admin.
- **Tiket** (`ticket`): satu nomor antrian milik satu nasabah pada satu hari.

Di luar lingkup versi pertama: multi-cabang, antrian prioritas, ambil nomor dari HP, notifikasi SMS/WhatsApp, dan integrasi core banking.

## Stack dan arsitektur

Satu aplikasi Next.js dan satu database PostgreSQL, dijalankan dengan Docker Compose di server lokal cabang. Tidak ada layanan tambahan seperti Redis atau server WebSocket terpisah.

| Lapisan | Pilihan | Alasan |
| --- | --- | --- |
| Framework | Next.js versi stabil terbaru, App Router, TypeScript mode strict | Permintaan pengguna; satu codebase untuk empat tampilan dan API |
| Database | PostgreSQL 16 atau lebih baru | Permintaan pengguna; transaksi dan row lock menjamin urutan |
| Akses data | Prisma untuk CRUD; SQL mentah (`$queryRaw`) untuk transaksi antrian | Logika antrian butuh `FOR UPDATE SKIP LOCKED` dan `ON CONFLICT` |
| Realtime | Server-Sent Events, dipicu PostgreSQL `LISTEN/NOTIFY` lewat driver `pg` | Aliran data hanya satu arah, dari server ke layar |
| UI | Tailwind CSS + shadcn/ui, warna dari token di bagian Design system | Komponen siap pakai yang mudah diberi tema |
| Validasi | Zod di setiap input API | Satu skema untuk server dan klien |
| Login | Auth.js (Credentials), hash password argon2 | Hanya petugas dan admin yang login |
| Grafik | Recharts | Grafik laporan harian |
| Ekspor | ExcelJS untuk `.xlsx`, CSV bawaan | Laporan bisa diunduh |
| Pengujian | Vitest (unit dan integrasi dengan PostgreSQL asli), Playwright (end-to-end) | Uji konkurensi wajib memakai database sungguhan |
| Deploy | Docker Compose: `app` (Node, `output: 'standalone'`) + `db` | Jalan di jaringan lokal, tetap hidup tanpa internet |

Aturan arsitektur yang wajib diikuti:

- Server adalah satu-satunya sumber kebenaran. Layar tidak pernah menghitung nomor atau urutan sendiri.
- Semua perubahan antrian lewat satu modul `src/lib/queue/`. Route handler hanya memvalidasi input lalu memanggil modul itu.
- Pakai runtime Node, bukan Edge atau serverless, karena koneksi `LISTEN` dan SSE harus hidup lama.
- Semua waktu disimpan sebagai `timestamptz`. Tanggal antrian dihitung di zona waktu `APP_TIMEZONE`, default `Asia/Makassar`.
- Loket dan layanan tidak pernah dihapus permanen, hanya dinonaktifkan, supaya laporan lama tetap utuh.

```text
src/
  app/
    kiosk/                 # layar ambil tiket + halaman cetak
    display/               # layar TV
    counter/               # layar petugas loket
    admin/                 # dashboard, layanan, loket, petugas, pengaturan, laporan
    login/
    api/                   # route handler tipis
  lib/
    queue/                 # issue-ticket, call-next, recall, finish, no-show, close-day
    realtime/              # listener pg + penyebar SSE
    reports/               # query agregat laporan
    print/                 # antarmuka cetak tiket
    speech/                # terbilang + antrean pengumuman suara
  components/
    brand/ ui/ kiosk/ display/ counter/ admin/
  styles/tokens.css        # token warna merek
prisma/                    # schema, migrations, seed
tests/                     # unit, integration, e2e
docker-compose.yml
```

## Aturan antrian

Nomor dan urutan ditentukan sistem sepenuhnya: nasabah hanya memilih layanan, dan petugas hanya menekan tombol panggil. Tidak ada cara memilih atau melompati nomor.

1. **Format nomor**: huruf awalan layanan + tiga digit, misalnya `A001`. Default awal: `A` untuk Customer Service, `B` untuk Teller.
2. **Reset harian**: nomor kembali ke `001` setiap ganti hari, terpisah per layanan.
3. **Urutan ketat (FIFO)**: dalam satu layanan, tiket dipanggil persis sesuai urutan nomor. Loket yang melayani lebih dari satu layanan mengambil tiket yang paling awal diambil di antara layanannya.
4. **Siapa yang memanggil menentukan loket tujuan**: tiket berikutnya otomatis terikat ke loket petugas yang menekan tombol.
5. **Satu loket, satu tiket aktif**: loket tidak bisa memanggil nomor baru sebelum tiket aktifnya ditutup. Tombol utama menutup dan memanggil dalam satu langkah.
6. **Tidak hadir**: petugas boleh memanggil ulang sampai 3 kali (bisa diatur), lalu menandai Tidak hadir. Tiket itu hangus dan tidak kembali ke antrian.
7. **Tutup hari**: tiket yang masih menunggu saat ganti hari menjadi `EXPIRED`. Tiket yang lupa ditutup petugas menjadi `DONE` dengan tanda `auto_closed` dan tidak ikut dihitung dalam rata-rata.

| Status | Arti | Berubah saat |
| --- | --- | --- |
| `WAITING` | Menunggu dipanggil | Tiket dibuat di kiosk |
| `SERVING` | Sudah dipanggil dan sedang ditangani di loket | Petugas memanggil |
| `DONE` | Selesai dilayani | Petugas menekan Selesai |
| `NO_SHOW` | Dipanggil tetapi nasabah tidak datang | Petugas menekan Tidak hadir |
| `EXPIRED` | Tidak sempat dipanggil sampai hari berganti | Proses tutup hari |

Perpindahan yang sah hanya `WAITING → SERVING → DONE`, `SERVING → NO_SHOW`, dan `WAITING → EXPIRED`. Perpindahan lain harus ditolak di server.

### Membuat tiket

Nomor urut diambil dan tiket disimpan dalam satu transaksi. Row lock pada `daily_sequences` menjamin tidak ada nomor ganda atau terlewat walau dua kiosk menekan bersamaan.

```sql
BEGIN;
INSERT INTO daily_sequences (service_id, service_date, last_number)
VALUES ($service_id, $today, 1)
ON CONFLICT (service_id, service_date)
DO UPDATE SET last_number = daily_sequences.last_number + 1
RETURNING last_number;                     -- menjadi seq tiket

INSERT INTO tickets (service_id, service_date, seq, number, request_id)
VALUES ($service_id, $today, $seq, $prefix || lpad($seq::text, 3, '0'), $request_id);

INSERT INTO ticket_events (ticket_id, type) VALUES ($ticket_id, 'ISSUED');
SELECT pg_notify('queue_events', $payload);
COMMIT;
```

`$today` adalah `(now() AT TIME ZONE $APP_TIMEZONE)::date`. `request_id` adalah UUID dari kiosk; bila permintaan yang sama terkirim dua kali, server mengembalikan tiket yang sudah ada.

### Selesai dan panggil berikutnya

Satu transaksi menutup tiket aktif loket lalu mengambil tiket menunggu paling awal. `FOR UPDATE SKIP LOCKED` membuat dua loket yang menekan bersamaan mendapat dua tiket berbeda, masing-masing tetap yang paling awal.

```sql
BEGIN;
UPDATE tickets SET status = 'DONE', finished_at = now()
WHERE counter_id = $counter_id AND status = 'SERVING';

WITH next AS (
  SELECT id FROM tickets
  WHERE status = 'WAITING'
    AND service_date = $today
    AND service_id IN (SELECT service_id FROM counter_services WHERE counter_id = $counter_id)
  ORDER BY created_at, id
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
UPDATE tickets t
SET status = 'SERVING', counter_id = $counter_id, served_by = $user_id,
    called_at = now(), call_count = 1
FROM next WHERE t.id = next.id
RETURNING t.*;                             -- kosong berarti antrian habis

-- catat ticket_events (DONE, CALLED) dan pg_notify
COMMIT;
```

Sebelum transaksi, server memeriksa bahwa loket berstatus `OPEN` dan sedang dipegang petugas yang login. Aksi lain memakai pola yang sama: Panggil ulang menaikkan `call_count` dan mengirim notifikasi, Selesai menutup tanpa memanggil, Tidak hadir menutup sebagai `NO_SHOW` lalu memanggil berikutnya.

## Skema database

Delapan tabel. Dua constraint paling penting adalah `UNIQUE (service_id, service_date, seq)`, yang mencegah nomor ganda, dan partial unique index pada `counter_id`, yang mencegah satu loket punya dua tiket aktif.

| Tabel | Isi |
| --- | --- |
| `services` | Jenis layanan dan huruf awalannya |
| `counters` | Loket: nama, nomor tampil, status buka/tutup, petugas yang sedang bertugas |
| `counter_services` | Layanan apa saja yang dilayani tiap loket |
| `users` | Petugas dan admin |
| `daily_sequences` | Nomor terakhir per layanan per hari |
| `tickets` | Tiket beserta tiga cap waktu: diambil, dipanggil, selesai |
| `ticket_events` | Jejak audit setiap aksi pada tiket |
| `settings` | Pengaturan cabang dalam bentuk key–value |

```sql
CREATE TYPE ticket_status  AS ENUM ('WAITING','SERVING','DONE','NO_SHOW','EXPIRED');
CREATE TYPE counter_status AS ENUM ('CLOSED','OPEN','PAUSED');
CREATE TYPE user_role      AS ENUM ('ADMIN','STAFF');

CREATE TABLE services (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,                 -- 'Customer Service'
  prefix     VARCHAR(2) NOT NULL UNIQUE,    -- 'A'
  sort_order INT NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'STAFF',
  is_active     BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE counters (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,            -- 'CS 1', 'Teller 2'
  display_number  INT NOT NULL,             -- angka yang tampil di TV dan dibacakan
  status          counter_status NOT NULL DEFAULT 'CLOSED',
  current_user_id INT REFERENCES users(id),
  is_active       BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE counter_services (
  counter_id INT NOT NULL REFERENCES counters(id),
  service_id INT NOT NULL REFERENCES services(id),
  PRIMARY KEY (counter_id, service_id)
);

CREATE TABLE daily_sequences (
  service_id   INT  NOT NULL REFERENCES services(id),
  service_date DATE NOT NULL,
  last_number  INT  NOT NULL,
  PRIMARY KEY (service_id, service_date)
);

CREATE TABLE tickets (
  id           BIGSERIAL PRIMARY KEY,
  request_id   UUID NOT NULL UNIQUE,        -- idempotensi dari kiosk
  service_id   INT  NOT NULL REFERENCES services(id),
  service_date DATE NOT NULL,
  seq          INT  NOT NULL,
  number       TEXT NOT NULL,               -- 'A012'
  status       ticket_status NOT NULL DEFAULT 'WAITING',
  counter_id   INT REFERENCES counters(id),
  served_by    INT REFERENCES users(id),
  call_count   INT NOT NULL DEFAULT 0,
  auto_closed  BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),   -- tiket diambil
  called_at    TIMESTAMPTZ,                          -- dipanggil ke loket
  finished_at  TIMESTAMPTZ,                          -- selesai atau tidak hadir
  UNIQUE (service_id, service_date, seq)
);
CREATE INDEX tickets_waiting_idx ON tickets (service_date, service_id, created_at, id)
  WHERE status = 'WAITING';
CREATE UNIQUE INDEX tickets_one_active_per_counter ON tickets (counter_id)
  WHERE status = 'SERVING';
CREATE INDEX tickets_report_idx ON tickets (service_date, status);

CREATE TABLE ticket_events (
  id         BIGSERIAL PRIMARY KEY,
  ticket_id  BIGINT NOT NULL REFERENCES tickets(id),
  type       TEXT NOT NULL,   -- ISSUED | CALLED | RECALLED | DONE | NO_SHOW | EXPIRED
  counter_id INT REFERENCES counters(id),
  user_id    INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
```

Partial index tidak bisa ditulis di `schema.prisma`; tambahkan lewat SQL di file migration. Kunci `settings` awal: `branch_name`, `running_text`, `voice_enabled`, `max_recall` (3), `target_service_minutes` (10), `ticket_footer`, `ticket_width_mm` (80).

Data awal dari `prisma/seed.ts`: layanan Customer Service (`A`) dan Teller (`B`), loket CS 1, CS 2, Teller 1, Teller 2, satu admin dengan password dari env `SEED_ADMIN_PASSWORD`, dan dua petugas contoh.

## Rancangan tiap tampilan

Kiosk dan TV berjalan layar penuh tanpa login dan tanpa scroll. Loket dan Admin butuh login.

### Kiosk tiket (`/kiosk`)

- Target layar 1280×1024 (LCD sentuh 19 inci), tetap rapi di 1920×1080.
- Header: logo, nama cabang, tanggal dan jam berjalan.
- Isi: judul “Silakan pilih layanan” dan satu tombol besar per layanan aktif. Tinggi tombol minimal 160 px, berisi nama layanan, huruf awalan, dan jumlah yang sedang menunggu.
- Sentuh tombol → `POST /api/tickets` → panel konfirmasi menampilkan nomor besar dan “n antrian di depan Anda” → tiket tercetak → kembali ke awal setelah 4 detik.
- Tombol dikunci sampai server menjawab, supaya sentuhan ganda tidak membuat dua tiket.
- Daftar tombol mengikuti data layanan dari server; layanan baru dari Admin langsung muncul.
- Jika server tidak terjangkau, tampilkan “Mohon hubungi petugas” dan jangan cetak apa pun.

### Display TV (`/display`)

- Target layar 1920×1080 landscape, dibaca dari jarak 5–10 meter.
- Panel kiri, sekitar 60% lebar: panggilan terakhir. Nomor sangat besar (tinggi huruf minimal 220 px) dan nama loket di bawahnya.
- Panel kanan: daftar semua loket yang buka dengan nomor yang sedang ditangani. Loket tanpa tiket menampilkan “—”.
- Grid loket menyesuaikan jumlah: sampai 4 loket satu kolom, 5–8 loket dua kolom, lebih dari 8 berganti halaman otomatis tiap 8 detik.
- Bawah: teks berjalan dari pengaturan. Atas: logo, nama cabang, jam.
- Saat ada panggilan baru: nomor berkedip tiga kali, bunyi lonceng, lalu suara pengumuman.
- Muat pertama menampilkan tombol “Aktifkan suara”, karena browser menolak audio tanpa interaksi.
- Jika koneksi putus, tampilkan indikator kecil dan sambung ulang otomatis.

### Loket petugas (`/counter`)

- Alur masuk: login → pilih loket yang belum dipakai → Buka loket.
- Tampilan utama: nomor yang sedang ditangani, nama layanan, timer berjalan sejak dipanggil, dan jumlah yang menunggu untuk layanan loket ini.
- Tombol utama **Selesai dan panggil berikutnya**. Saat loket belum punya tiket aktif, labelnya menjadi Panggil berikutnya.
- Tombol lain: Panggil ulang, Tidak hadir, Selesai tanpa memanggil, Istirahat, Tutup loket.
- Tombol utama dikunci 1,5 detik setelah ditekan untuk mencegah panggilan ganda. Konfirmasi hanya untuk Tidak hadir dan Tutup loket.
- Pintasan keyboard: `Spasi` untuk tombol utama, `R` untuk panggil ulang.
- Antrian kosong: tampilkan “Belum ada antrian”; tombol aktif sendiri begitu ada tiket baru.
- Di bawah: 10 tiket terakhir yang ditangani loket ini hari ini, beserta lama penanganannya.
- Loket tidak bisa ditutup selama masih ada tiket aktif.

### Admin (`/admin`)

- **Dashboard**: angka hari ini (total tiket, menunggu, sedang ditangani, selesai, tidak hadir, rata-rata tunggu, rata-rata penanganan) dan tabel loket langsung berisi petugas, nomor aktif, dan lama ditangani.
- **Loket**: tambah, ubah, nonaktifkan. Isian: nama, nomor tampil, layanan yang dilayani. Inilah tempat jumlah CS dan teller diatur; perubahan langsung terlihat di TV dan layar petugas tanpa muat ulang.
- **Layanan**: tambah, ubah, nonaktifkan. Isian: nama, huruf awalan, urutan tampil.
- **Petugas**: tambah, ubah, nonaktifkan, reset password, atur peran.
- **Pengaturan**: nama cabang, teks berjalan, suara hidup/mati, batas panggil ulang, target lama penanganan, teks kaki tiket, lebar kertas.
- **Laporan**: lihat bagian Laporan.

## Cetak tiket

Versi pertama mencetak lewat browser ke printer thermal 80 mm, tanpa dialog cetak. Cara ini murni web dan tidak butuh program tambahan di kiosk.

- Kiosk menjalankan Chrome dengan `--kiosk --kiosk-printing`, dan printer thermal diset sebagai printer default.
- Halaman cetak `/kiosk/print/[ticketId]` dimuat di iframe tersembunyi, lalu memanggil `window.print()`.
- CSS cetak: `@page { size: 80mm auto; margin: 0 }`, lebar isi 72 mm. Lebar 58 mm tersedia lewat pengaturan `ticket_width_mm`.
- Tiket hitam-putih saja; warna merek tidak dipakai di kertas thermal.
- Tiket disimpan ke database sebelum dicetak. Jika cetak gagal, nomornya tetap sah dan bisa dicetak ulang dari Admin.
- Bungkus pencetakan dalam satu fungsi `printTicket(ticket)` di `src/lib/print/`, supaya nanti bisa diganti ESC/POS tanpa mengubah layar kiosk.

Isi tiket dari atas ke bawah:

1. Logo versi satu warna dan nama cabang
2. Tulisan “NOMOR ANTRIAN”
3. Nomor, Arial Bold sekitar 72 pt, rata tengah
4. Nama layanan
5. Tanggal dan jam tiket diambil
6. “n antrian di depan Anda”
7. Teks kaki dari pengaturan, lalu slogan

## Realtime dan suara panggilan

Setiap perubahan antrian sampai ke semua layar dalam waktu kurang dari 2 detik lewat Server-Sent Events. Event hanya berfungsi sebagai sinyal; layar selalu mengambil ulang keadaan lengkap dari server.

- Setiap transaksi antrian memanggil `pg_notify('queue_events', payload)` sebelum commit. Payload kecil: `{ id, type, ticketId, counterId, serviceId }`.
- Server memegang satu koneksi `pg` khusus untuk `LISTEN`, dibuat sekali per proses dan menyambung ulang sendiri, lalu menyebarkan event ke semua klien SSE.
- `GET /api/stream` mengembalikan `text/event-stream` dengan heartbeat tiap 25 detik. Set `runtime = 'nodejs'` dan `dynamic = 'force-dynamic'`.
- Hook klien `useQueueState()`: ambil `GET /api/queue/state` saat mulai, ambil ulang setiap ada event, dan beralih ke polling 5 detik bila SSE putus.
- Jenis event: `TICKET_ISSUED`, `TICKET_CALLED`, `TICKET_RECALLED`, `TICKET_DONE`, `TICKET_NO_SHOW`, `COUNTER_CHANGED`, `CONFIG_CHANGED`.

Suara hanya diputar di Display TV, untuk event `TICKET_CALLED` dan `TICKET_RECALLED`:

- Urutan: bunyi lonceng, lalu kalimat “Nomor antrian A, dua belas. Silakan menuju loket CS satu.”
- Pakai `speechSynthesis` dengan `lang = 'id-ID'`. Jika suara Indonesia tidak tersedia di perangkat, pakai potongan audio rekaman di `public/audio/`.
- Pengumuman masuk antrean dan diputar satu per satu, tidak pernah bertumpuk.
- Setiap event punya `id`; event yang sudah diumumkan tidak diulang saat koneksi tersambung kembali.
- Buat fungsi `terbilang(n)` untuk membaca angka dalam bahasa Indonesia, lengkap dengan unit test.

## Laporan

Setiap tiket menyimpan tiga cap waktu, dan semua angka laporan diturunkan dari sana. Hitung di SQL, bukan di JavaScript.

| Ukuran | Rumus | Catatan |
| --- | --- | --- |
| Waktu tunggu | `called_at − created_at` | Dari ambil tiket sampai dipanggil |
| Lama penanganan | `finished_at − called_at` | Untuk tiket `DONE`; termasuk waktu nasabah berjalan ke loket |
| Lama penanganan berjalan | `now() − called_at` | Untuk tiket `SERVING`; tampil sebagai timer |
| Total waktu di cabang | `finished_at − created_at` | Dari ambil tiket sampai selesai |

Tiga laporan yang dibangun:

1. **Pantauan langsung** di dashboard Admin. Satu baris per loket: petugas, nomor aktif, lama ditangani yang terus berjalan. Baris diberi tanda oranye jika melewati `target_service_minutes`.
2. **Laporan harian** di `/admin/reports/daily?date=`. Berisi ringkasan, rekap per layanan, rekap per loket dan petugas, grafik batang jumlah tiket per jam, dan tabel rinci per nomor.
3. **Rekap rentang tanggal** di `/admin/reports/range?from=&to=`. Satu baris per hari, dengan grafik garis rata-rata tunggu dan rata-rata penanganan.

Kolom tabel rinci per nomor: nomor, layanan, loket, petugas, jam ambil, jam dipanggil, jam selesai, waktu tunggu, lama penanganan, jumlah panggilan, status.

Kolom ringkasan harian dan rekap rentang: total tiket, selesai, tidak hadir, kedaluwarsa, rata-rata dan terlama waktu tunggu, rata-rata dan terlama lama penanganan.

- Durasi ditampilkan sebagai `mm:ss`, atau `j:mm:ss` bila lebih dari satu jam. File ekspor juga memuat durasi dalam detik.
- Tiket `auto_closed` tetap tampil di tabel rinci dengan tanda khusus, tetapi dikeluarkan dari rata-rata.
- Setiap laporan bisa diunduh sebagai `.xlsx` dan `.csv`, dan punya tampilan cetak A4.
- Pengelompokan per hari dan per jam memakai `APP_TIMEZONE`.

## Design system

Tampilan memakai lima warna korporat Bank NTT dari Gambar 2.4 dokumen standarisasi branding (hal. 10), huruf Arial Bold, dan motif garis miring yang muncul di papan nama dan booth.

### Palet warna

| Token | Pantone | CMYK di dokumen | Hex | Pemakaian di layar |
| --- | --- | --- | --- | --- |
| `brand-navy` | 2745C | C100 M70 Y0 K0 | `#004EA2` | Header, tombol utama, judul |
| `brand-blue` | 300C | C100 M40 Y0 K0 | `#0075C2` | Tombol sekunder, tautan, keadaan hover |
| `brand-sky` | 7461C | C100 M10 Y0 K0 | `#0097E0` | Aksen, garis miring, sorotan ringan |
| `brand-orange` | 716C | C0 M60 Y100 K0 | `#F08300` | Satu aksen per layar: nomor yang baru dipanggil, garis diagonal, peringatan target |
| `brand-grey` | 423C | C0 M0 Y0 K55 | `#898989` | Garis tepi, ikon, loket tutup |
| `brand-white` | Putih korporat | — | `#FFFFFF` | Latar utama, kartu |
| `brand-deep` | — | — | `#00088F` | Latar Display TV; biru papan nama pada Gambar 2.1 |

Nilai hex diambil dari warna swatch di PDF, bukan dari tabel konversi Pantone resmi. Simpan semuanya di satu file `src/styles/tokens.css` supaya mudah diganti bila bank punya nilai RGB resmi.

Warna tambahan di luar dokumen, hanya untuk kebutuhan antarmuka: teks utama `#1A2433`, teks sekunder `#5B6470`, latar halaman `#F4F6F9`, sukses `#147A3A`, bahaya `#C62828`.

```css
:root {
  --brand-navy:   #004EA2;
  --brand-blue:   #0075C2;
  --brand-sky:    #0097E0;
  --brand-orange: #F08300;
  --brand-grey:   #898989;
  --brand-white:  #FFFFFF;
  --brand-deep:   #00088F;
  --ink:          #1A2433;
  --ink-muted:    #5B6470;
  --surface:      #F4F6F9;
  --success:      #147A3A;
  --danger:       #C62828;
  --radius-card:  16px;
  --font-brand:   Arial, Helvetica, sans-serif;
}
```

### Aturan kontras

Rasio di bawah dihitung dengan rumus WCAG dari nilai hex di atas. Batas yang dipakai: 4,5:1 untuk teks biasa dan 3:1 untuk teks besar.

| Pasangan | Rasio | Aturan |
| --- | --- | --- |
| Putih di atas `brand-deep` | 14,7:1 | Boleh untuk semua ukuran |
| Putih di atas `brand-navy` | 8,0:1 | Boleh untuk semua ukuran |
| Putih di atas `brand-blue` | 4,9:1 | Boleh untuk semua ukuran |
| Putih di atas `brand-sky` | 3,2:1 | Hanya teks tebal 24 px ke atas |
| Putih di atas `brand-orange` | 2,6:1 | Dilarang |
| `ink` di atas `brand-orange` | 5,9:1 | Pakai ini untuk teks di atas oranye |
| `brand-orange` di atas `brand-deep` | 5,6:1 | Boleh; dipakai untuk nomor yang baru dipanggil di TV |
| `brand-grey` di atas putih | 3,5:1 | Hanya garis, ikon, dan teks besar; teks kecil pakai `ink-muted` (6,0:1) |

### Tipografi

- Dokumen menetapkan huruf papan nama adalah Arial Bold (hal. 9–10). Pakai `Arial, Helvetica, sans-serif` di semua layar; judul dan nomor selalu tebal.
- Nomor antrian memakai `font-variant-numeric: tabular-nums` supaya lebar angka tidak berubah-ubah.
- Ukuran minimal: nomor di TV 220 px, label tombol kiosk 40 px, nomor di layar petugas 96 px, teks isi 16 px.

### Motif dan bentuk

- **Garis miring**: deretan jajaran genjang navy, biru, sky, oranye, abu-abu, seperti kepala dan kaki halaman dokumen serta papan nama. Pakai sebagai tepi header dan strip kaki, dibuat dengan `clip-path` atau `skewX(-25deg)`.
- **Bidang biru dan putih dipisah garis oranye diagonal tipis**, seperti booth TV dan booth CRM (hal. 78 dan 80). Pakai untuk latar header kiosk dan panel kiri TV.
- **Permukaan putih mengilap dengan sudut membulat**, mengikuti furnitur glossy white. Kartu memakai radius 16 px dan bayangan tipis.
- **Cahaya biru di tepi**, mengikuti LED strip biru pada mesin antrian (hal. 76). Kartu aktif mendapat `box-shadow` biru lembut.
- **Logo**: pakai file logo resmi di `public/brand/`, jangan digambar ulang. Di atas latar biru pakai versi putih. Slogan “melayani lebih sungguh” ikut logo.

### Penerapan per layar

| Layar | Latar | Elemen utama | Aksen oranye |
| --- | --- | --- | --- |
| Kiosk | Putih, header navy bergaris miring | Tombol layanan navy dengan teks putih | Garis diagonal header |
| Display TV | `brand-deep` | Kartu loket putih, nomor navy | Nomor panggilan terbaru |
| Loket | `surface`, header navy | Tombol utama navy, nomor aktif navy | Timer yang melewati target |
| Admin | `surface`, sidebar navy | Tabel dan kartu putih | Baris yang melewati target |
| Tiket cetak | Putih | Hitam saja | Tidak ada |

## Endpoint API

Semua endpoint memvalidasi input dengan Zod dan mengembalikan galat dalam bentuk `{ error: { code, message } }`.

| Method dan path | Akses | Fungsi |
| --- | --- | --- |
| `POST /api/tickets` | Kiosk | Isi `{ serviceId, requestId }`; mengembalikan tiket baru dan jumlah antrian di depannya |
| `GET /api/queue/state` | Kiosk, TV, petugas | Keadaan lengkap: layanan dan jumlah menunggu, loket dan tiket aktifnya, panggilan terakhir, pengaturan tampilan |
| `GET /api/stream` | Kiosk, TV, petugas | Aliran SSE |
| `POST /api/counters/:id/open` | Petugas | Buka loket dan ikat ke petugas yang login |
| `POST /api/counters/:id/pause` | Petugas | Istirahat; ditolak bila masih ada tiket aktif |
| `POST /api/counters/:id/close` | Petugas | Tutup loket; ditolak bila masih ada tiket aktif |
| `POST /api/counters/:id/next` | Petugas | Selesai dan panggil berikutnya |
| `POST /api/counters/:id/recall` | Petugas | Panggil ulang tiket aktif |
| `POST /api/counters/:id/finish` | Petugas | Selesai tanpa memanggil |
| `POST /api/counters/:id/no-show` | Petugas | Tandai tidak hadir, lalu panggil berikutnya |
| `GET, POST, PATCH /api/admin/services` | Admin | Kelola layanan |
| `GET, POST, PATCH /api/admin/counters` | Admin | Kelola loket dan layanannya |
| `GET, POST, PATCH /api/admin/users` | Admin | Kelola petugas |
| `GET, PUT /api/admin/settings` | Admin | Baca dan simpan pengaturan |
| `GET /api/reports/daily?date=` | Admin | Data laporan harian |
| `GET /api/reports/range?from=&to=` | Admin | Data rekap rentang tanggal |
| `GET /api/reports/export?date=&format=` | Admin | Unduh `.xlsx` atau `.csv` |

- Endpoint petugas memeriksa bahwa loket `:id` memang sedang dipegang petugas yang login.
- Kiosk dan TV tidak login. Aksesnya dibatasi token perangkat dari env `KIOSK_TOKEN` dan `DISPLAY_TOKEN`, dikirim sekali lewat `?token=` lalu disimpan sebagai cookie.
- Setiap perubahan dari Admin mengirim event `COUNTER_CHANGED` atau `CONFIG_CHANGED` supaya layar ikut berubah.

## Tahapan implementasi

Sepuluh fase berurutan, dari 0 sampai 9. Mesin antrian dan pengujiannya dibangun sebelum layar apa pun, karena semua layar bergantung padanya.

| Fase | Yang dibangun | Kriteria selesai |
| --- | --- | --- |
| 0. Fondasi | Proyek Next.js + TypeScript, Docker Compose, Prisma schema dan migration termasuk partial index, seed, ESLint, Vitest, Playwright | `docker compose up` menjalankan aplikasi dan database; migration dan seed berhasil; lint, typecheck, dan build lolos |
| 1. Design system | `tokens.css`, tema Tailwind, komponen merek (header bergaris miring, kartu, tombol, tampilan nomor), halaman contoh `/styleguide` | Halaman contoh menampilkan semua token dan komponen; tidak ada warna hex yang ditulis langsung di komponen |
| 2. Mesin antrian | Modul `lib/queue/`: buat tiket, panggil berikutnya, panggil ulang, selesai, tidak hadir, tutup hari | Semua uji penomoran, urutan, dan konkurensi di bagian Pengujian wajib lolos |
| 3. Realtime | Listener `pg`, endpoint SSE, `GET /api/queue/state`, hook `useQueueState()` | Perubahan di database tampil di klien uji dalam waktu kurang dari 2 detik; klien pulih sendiri setelah koneksi diputus |
| 4. Kiosk dan cetak | Layar `/kiosk`, halaman cetak, `printTicket()` | Sentuh tombol menghasilkan satu tiket dan satu cetakan; sentuhan ganda tidak membuat tiket kedua |
| 5. Login dan loket | Auth.js, layar `/counter`, semua endpoint petugas | Dua petugas di dua loket memanggil bergantian dan tidak pernah mendapat nomor yang sama |
| 6. Display TV | Layar `/display`, animasi panggilan, antrean suara, `terbilang()` | Panggilan dari loket tampil dan terdengar di TV; dua panggilan berdekatan dibacakan berurutan |
| 7. Admin | Dashboard langsung, kelola layanan, loket, petugas, pengaturan | Loket baru dari Admin muncul di TV dan bisa dipilih petugas tanpa muat ulang halaman |
| 8. Laporan | Laporan harian, rekap rentang, ekspor, tampilan cetak | Angka laporan cocok dengan hitungan manual pada data uji; file `.xlsx` terbuka dengan benar |
| 9. Pengerasan | Tutup hari otomatis, token perangkat, penanganan galat, uji end-to-end, README pemasangan | Seluruh uji lolos; README menjelaskan pemasangan server, kiosk, dan TV dari nol |

Aturan kerja untuk agent:

- Selesaikan satu fase, jalankan lint, typecheck, dan seluruh uji, lalu buat satu commit sebelum pindah fase.
- Jangan mengubah aturan antrian atau skema tanpa mencatat alasannya di `DECISIONS.md`.
- Jika sebuah asumsi di bagian terakhir dokumen ini ternyata salah, berhenti dan tanyakan, jangan menebak.

## Pengujian wajib

Uji di bawah ini adalah bukti bahwa urutan antrian benar. Uji integrasi memakai PostgreSQL sungguhan, bukan mock.

- [ ] **Penomoran serentak**: 100 permintaan tiket bersamaan untuk satu layanan menghasilkan `seq` 1 sampai 100, tanpa ganda dan tanpa lompat.
- [ ] **Panggilan serentak**: 5 loket memanggil bersamaan atas 50 tiket; setiap tiket terpanggil tepat sekali.
- [ ] **Urutan**: pada setiap saat, tidak ada tiket `WAITING` yang nomornya lebih kecil dari tiket yang sudah dipanggil dalam layanan yang sama.
- [ ] **Satu tiket aktif**: upaya membuat tiket `SERVING` kedua pada loket yang sama ditolak database.
- [ ] **Reset harian**: tiket pertama pada tanggal baru bernomor `001`, dengan pergantian hari dihitung di `APP_TIMEZONE`.
- [ ] **Idempotensi**: dua permintaan dengan `requestId` sama mengembalikan tiket yang sama.
- [ ] **Transisi status**: setiap perpindahan yang tidak sah ditolak.
- [ ] **Hak akses**: petugas tidak bisa memanggil dari loket yang dipegang petugas lain.
- [ ] **Durasi**: waktu tunggu dan lama penanganan dihitung benar pada data uji dengan cap waktu yang ditentukan.
- [ ] **Terbilang**: 1, 10, 11, 21, 100, 101, 110, 999 dibaca benar.
- [ ] **End-to-end**: tiga jendela browser (kiosk, loket, TV); ambil tiket, panggil, nomor tampil di TV dalam waktu kurang dari 2 detik, selesai, lalu tiket muncul di laporan harian dengan durasi yang masuk akal.
- [ ] **Loket dinamis**: tambah loket dari Admin, loket muncul di TV tanpa muat ulang.
- [ ] **Tampilan**: tangkapan layar tiap layar pada resolusi targetnya, diperiksa terhadap bagian Design system.

## Asumsi dan pertanyaan terbuka

Plan ini memakai sepuluh asumsi di bawah. Ubah barisnya sebelum diberikan ke agent bila ada yang tidak sesuai.

| Topik | Asumsi yang dipakai | Yang perlu Anda putuskan |
| --- | --- | --- |
| Layanan awal | Customer Service (`A`) dan Teller (`B`) | Apakah ada layanan lain, misalnya Kredit atau Prioritas? |
| Jumlah lokasi | Satu cabang, satu server | Apakah perlu multi-cabang dengan data terpusat? |
| Urutan | FIFO ketat, tanpa jalur prioritas | Apakah lansia, disabilitas, atau nasabah prioritas perlu didahulukan? |
| Lama penanganan | Dihitung sejak nomor dipanggil | Apakah perlu tombol Mulai layani terpisah supaya waktu jalan ke loket tidak ikut terhitung? |
| Tidak hadir | Tiket hangus setelah ditandai | Apakah nasabah yang terlambat boleh dimasukkan lagi ke antrian? |
| Printer | Thermal 80 mm, cetak lewat Chrome mode kiosk | Merek dan lebar kertas printer yang sebenarnya |
| Zona waktu | `Asia/Makassar` (WITA) | Ganti ke `Asia/Jakarta` bila dipakai di wilayah WIB |
| Server | Komputer lokal di jaringan cabang, Docker | Apakah harus di cloud atau server pusat? |
| Logo | File logo resmi disediakan pengguna | Kirim file SVG atau PNG logo warna dan logo putih |
| Nilai warna | Hex diambil dari swatch di PDF | Apakah ada nilai RGB atau hex resmi dari bank? |
