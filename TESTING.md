# Pengujian

Ada tiga lapis pengujian. Jalankan berurutan: yang cepat dulu, end-to-end terakhir.

| Lapis | Perintah | Database | Lama |
| --- | --- | --- | --- |
| Lint dan typecheck | `npm run lint`, `npm run typecheck` | Tidak perlu | < 1 menit |
| Unit dan integrasi (Vitest), ± 98 uji | `npm test` | `queue_test`, dibuat otomatis | ± 15 detik |
| End-to-end (Playwright), 15 uji | `npm run test:e2e` | `queue_e2e`, disiapkan sendiri | 1–2 menit |

Selain itu ada uji manual tampilan di bagian akhir. PLAN.md mewajibkannya untuk setiap layar.

## Yang perlu disiapkan

- PostgreSQL 16 atau lebih baru menyala di mesin ini.
- `.env` sudah diisi dari `.env.example`, terutama `DATABASE_URL` dan `AUTH_SECRET`. Untuk uji end-to-end, isi juga `KIOSK_TOKEN` dan `DISPLAY_TOKEN`. Di pemakaian biasa keduanya opsional, tapi uji e2e masih membuka kiosk dan TV dengan token cadangan ini.
- `npm install` sudah dijalankan.

## 1. Lint dan typecheck

```bash
npm run lint
npm run typecheck
```

`typecheck` menjalankan `prisma generate` lebih dulu, jadi client Prisma selalu sesuai skema.

## 2. Unit dan integrasi

```bash
npm test
```

Vitest menjalankan semua berkas di `tests/unit` dan `tests/integration`.

Uji integrasi memakai PostgreSQL sungguhan, bukan mock. Database-nya `queue_test` di server yang sama dengan `DATABASE_URL`. Database ini dibuat dan dimigrasi otomatis saat uji dimulai, lalu dikosongkan sebelum setiap kasus. Data di database kerja Anda tidak tersentuh. Untuk memakai server lain, isi `TEST_DATABASE_URL`.

Menjalankan satu berkas atau satu kasus:

```bash
npx vitest run tests/integration/queue.test.ts
npx vitest run -t "panggilan serentak"
```

Uji berjalan berurutan, tidak paralel, karena semua kasus berbagi satu database.

### Uji wajib di PLAN.md dan letaknya

| Uji wajib | Berkas |
| --- | --- |
| Penomoran serentak (100 tiket) | `tests/integration/queue.test.ts` |
| Panggilan serentak (5 loket, 50 tiket) | `tests/integration/queue.test.ts` |
| Urutan FIFO | `tests/integration/queue.test.ts` |
| Satu tiket aktif per loket | `tests/integration/queue.test.ts` |
| Reset harian di `APP_TIMEZONE` | `tests/integration/queue.test.ts` |
| Idempotensi `requestId` | `tests/integration/queue.test.ts`, `tests/integration/tickets.test.ts` |
| Transisi status | `tests/integration/queue.test.ts`, `tests/unit/transitions.test.ts` |
| Hak akses loket | `tests/integration/queue.test.ts`, `tests/integration/desk.test.ts` |
| Durasi dan hitungan laporan | `tests/integration/reports.test.ts` |
| Terbilang | `tests/unit/speech.test.ts` |
| Realtime di bawah 2 detik dan pulih setelah putus | `tests/integration/realtime.test.ts` |
| Loket dinamis: tambah beberapa loket, nama unik | `tests/integration/admin.test.ts`, `tests/unit/counter-names.test.ts` |
| CRUD Admin: pesan galat, akun nonaktif, tutup paksa loket | `tests/integration/admin-crud.test.ts` |
| Tidak ada warna hex di luar `tokens.css` | `tests/unit/tokens.test.ts` |
| Perangkat terdaftar: token hanya disimpan hash-nya, tautan baru mematikan tautan lama, cabut menolak perangkat, token cadangan `.env` tetap diterima | `tests/integration/devices.test.ts`, `tests/unit/device.test.ts` |
| Kode pemasangan aplikasi kiosk Windows: sekali pakai, kedaluwarsa, hanya kode terbaru, batas percobaan; kiosk memakai printer aplikasi dan tidak membuat nomor saat printer tidak siap | `tests/integration/devices.test.ts`, `tests/unit/pairing.test.ts`, `tests/e2e/devices.spec.ts`, `tests/e2e/kiosk.spec.ts` |
| Nama dan ikon aplikasi kiosk Windows: bawaan BANK NTT Ticket, nama aman untuk berkas Windows, ikon harus PNG persegi minimal 256 px | `tests/integration/kiosk-app.test.ts` |
| Identitas lembaga: bawaan Bank NTT, simpan nama lain, unggah dan hapus logo | `tests/integration/branding.test.ts` |
| Warna merek: aturan kontras PLAN.md dan CSS penimpa hanya berisi hex yang sah | `tests/unit/branding-colors.test.ts` |
| End-to-end dan loket dinamis di TV | `tests/e2e/journey.spec.ts`, `tests/e2e/admin.spec.ts` |
| Daftarkan, buka, dan cabut perangkat | `tests/e2e/devices.spec.ts` |
| Layanan dihubungkan ke loket; loket yang tidak terhubung tidak bisa memanggil; dua admin menyimpan bersamaan | `tests/integration/service-counters.test.ts` |
| Waktu dari database terbaca benar walau PostgreSQL ber-TimeZone selain UTC (jam tiket, timer loket) | `tests/integration/timestamps.test.ts` |
| Zona waktu dari Admin dipakai untuk tanggal antrian | `tests/integration/admin.test.ts`, `tests/unit/env.test.ts` |
| Tata letak TV (kanvas, halaman loket) dan kiosk (kolom tombol, mode gulir) | `tests/unit/display.test.ts`, `tests/unit/kiosk-layout.test.ts` |
| Tiket PDF dan pilihan printer atau PDF | `tests/unit/ticket-pdf.test.ts` |
| Nomor permintaan kiosk di HTTP biasa (tanpa `crypto.randomUUID`) | `tests/unit/request-id.test.ts` |
| Aliran realtime langsung terbuka (tidak menunggu heartbeat) | `tests/unit/realtime.test.ts` |

## 3. End-to-end

Uji end-to-end membuka browser sungguhan dan **menulis ke database** di `DATABASE_URL`: membuat tiket, membuka loket, dan menambah loket "CS Khusus". Jangan jalankan terhadap database kerja atau database cabang. Siapkan database terpisah.

### Sekali saja: pasang browser

```bash
npx playwright install chromium
```

### Siapkan database `queue_e2e`

Uji masuk dengan kata sandi `change-me` untuk `admin`, `petugas.cs`, dan `petugas.teller`. Seed database e2e dengan kata sandi itu:

```bash
createdb -h 127.0.0.1 queue_e2e

export DATABASE_URL=postgresql://USER@127.0.0.1:5432/queue_e2e
export SEED_ADMIN_PASSWORD=change-me
export SEED_STAFF_PASSWORD=change-me

npx prisma migrate deploy
npx prisma db seed
```

Ganti `USER` dengan pengguna PostgreSQL Anda. Variabel yang di-`export` di terminal mengalahkan isi `.env`, jadi `.env` tidak perlu diubah.

### Jalankan

**Matikan dulu `npm run dev` yang sedang berjalan.** Bila port 3000 sudah terpakai, Playwright memakai server itu, padahal server itu tersambung ke database kerja Anda.

Di terminal yang sama dengan langkah `export` di atas:

```bash
npm run test:e2e
```

Playwright menyalakan `next dev` sendiri di port 3000 dengan `DATABASE_URL` dari terminal itu, menjalankan semua uji satu per satu, lalu mematikan server.

**Bila `npm run dev` harus tetap menyala**, jalankan uji di port lain dengan build produksi. Next.js hanya mengizinkan satu `next dev` per proyek, jadi uji memakai `next start`:

```bash
NEXT_DIST_DIR=.next-e2e npm run build
E2E_PORT=3100 npm run test:e2e
```

Perintah lain yang berguna:

```bash
npx playwright test tests/e2e/journey.spec.ts   # satu berkas
npx playwright test --headed                    # lihat browsernya
npx playwright test --ui                        # mode interaktif, bisa diulang per langkah
npx playwright show-report                      # buka laporan uji terakhir
```

### Isi uji end-to-end

| Berkas | Yang diuji |
| --- | --- |
| `journey.spec.ts` | Kiosk, loket, dan TV dalam tiga jendela; nomor tampil di TV dalam 2 detik dan masuk laporan harian |
| `kiosk.spec.ts` | Satu sentuhan menghasilkan satu tiket dan satu cetakan; tiket hanya memuat logo, tanpa nama lembaga dan slogan; permintaan gagal tidak mencetak |
| `counter.spec.ts` | Dua petugas di dua loket mendapat nomor berbeda; sandi salah ditolak |
| `display.spec.ts` | Panggilan tampil di TV; dua panggilan berdekatan dibacakan berurutan |
| `admin.spec.ts` | Loket baru dari Admin muncul di layar petugas dan TV tanpa muat ulang |
| `branding.spec.ts` | Nama lembaga dan slogan dari Admin tampil di beranda dan judul halaman |
| `devices.spec.ts` | Kiosk didaftarkan di Admin → Perangkat, tautannya dibuka, lalu dicabut sampai layar menolak perangkat |
| `reports.spec.ts` | Laporan harian, rekap rentang, dan unduhan Excel |
| `home.spec.ts`, `styleguide.spec.ts` | Beranda dan halaman panduan tampilan |

### Mengulang dari awal

Data uji menumpuk setiap kali dijalankan. Untuk mulai bersih:

```bash
dropdb -h 127.0.0.1 queue_e2e
```

Lalu ulangi langkah "Siapkan database `queue_e2e`".

### Bila gagal

| Gejala | Penyebab dan jalan keluar |
| --- | --- |
| `Executable doesn't exist ... chrome-headless-shell` | Browser belum dipasang. Jalankan `npx playwright install chromium`. |
| Login gagal, uji berhenti di `/login` | Database belum di-seed dengan `change-me`, atau Playwright memakai server dev yang tersambung ke database lain. Matikan `npm run dev` atau pakai `E2E_PORT`, lalu ulangi seed. |
| `Another next dev server is already running` | `E2E_PORT` hanya bisa dipakai bersama build produksi. Jalankan `NEXT_DIST_DIR=.next-e2e npm run build` dulu. |
| Halaman `npm run dev` dimuat ulang terus-menerus, log berisi "Compiled in 0ms" berulang | Cache dev di `.next` rusak, biasanya karena `npm run build` dijalankan ke `.next` saat dev hidup. Matikan dev, hapus folder `.next`, nyalakan lagi. Build untuk uji pakai `NEXT_DIST_DIR=.next-e2e`. |
| `KIOSK_TOKEN is not set` | Uji e2e masih memakai token cadangan. Isi `KIOSK_TOKEN` dan `DISPLAY_TOKEN` di `.env` dengan dua string acak yang berbeda. |
| Uji di layar TV atau loket habis waktu | Pastikan tidak ada loket yang tertinggal terbuka dari percobaan manual; ulangi dari database bersih. |
| Loket "CS Khusus" muncul di database kerja | Uji e2e pernah dijalankan saat `npm run dev` tersambung ke database kerja. Nonaktifkan dari Admin → Loket. |

## 4. Uji manual di localhost

Siapkan data bersih seperti di README bagian "Menjalankan di laptop":

```bash
npx prisma migrate reset --force
npm run db:seed
SEED_DEMO_HISTORY_DAYS=0 npm run db:seed:demo
npm run dev
```

Hasilnya dua layanan, Customer Service (A001…) di CS 1–5 dan Teller (B001…) di Teller 1–5, sepuluh petugas, dan nol tiket. Untuk menguji dasbor dan laporan dengan angka, jalankan `npm run db:seed:demo` tanpa `SEED_DEMO_HISTORY_DAYS=0`; riwayat tujuh hari ikut terisi.

Masuk sebagai admin, buka **Admin → Perangkat**, daftarkan satu kiosk dan satu TV, ganti **Alamat server** dengan IP laptop bila kiosk atau TV ada di perangkat lain, lalu buka tautannya. Buka setiap layar di jendela terpisah, petugas di jendela Incognito:

| Layar | Ukuran target | Alamat |
| --- | --- | --- |
| Kiosk | 1280 × 1024 | tautan kiosk dari Admin → Perangkat |
| TV | 1920 × 1080 | tautan TV dari Admin → Perangkat |
| Loket | 1366 × 768 | `/counter` |
| Admin | 1440 × 900 dan 390 lebar (HP) | `/admin` |

Di Chrome, ukuran layar diatur dari DevTools → Toggle device toolbar. TV dan kiosk tetap rapi di ukuran lain; ukuran di atas adalah perangkat sebenarnya.

### Daftar periksa

**Kiosk dan tiket**

- [ ] Kiosk menampilkan dua tombol, Customer Service dan Teller, tanpa huruf awalan. Tidak ada tulisan yang terpotong; jumlah menunggu hanya muncul bila ada antrean.
- [ ] Sentuh Customer Service: nomor A001 tampil bersama "n antrian di depan Anda", lalu layar kembali ke awal setelah 4 detik. Teller memberi B001.
- [ ] Dengan `TICKET_OUTPUT=printer`, tiket tercetak ke printer default. Tanpa `--kiosk-printing`, Chrome menampilkan dialog cetak; dengan flag itu, tiket tercetak langsung.
- [ ] Isi tiket: logo, NOMOR ANTRIAN, nomor, layanan, tanggal dan jam, jumlah di depan, teks kaki. Jamnya sama dengan jam di laptop dan TV.
- [ ] Sentuh dua kali cepat: hanya satu nomor dan satu cetakan.

**Loket**

- [ ] Masuk sebagai `petugas.cs`, buka CS 1, tekan **Panggil berikutnya** atau `Spasi`. Nomor A tampil, dan timer berjalan dari 00:00.
- [ ] Di CS 1, tiket Teller (B) tidak pernah terpanggil. Bila hanya ada tiket B, CS 1 menampilkan "Belum ada antrian".
- [ ] **Panggil ulang** (`R`) sampai batas di Pengaturan. Setelah batas, tombol mati dan muncul "batas panggil ulang tercapai".
- [ ] Timer berubah oranye setelah melewati target lama penanganan.
- [ ] **Tidak hadir** dan **Tutup loket** meminta konfirmasi. **Keluar** juga meminta konfirmasi dan memperingatkan bila loket masih buka.

**TV**

- [ ] Dibuka dengan perintah Chrome dari Admin → Perangkat, suara langsung menyala tanpa tombol. Di browser biasa, tombol **Aktifkan suara** muncul.
- [ ] Panggil nomor dari loket: dalam 2 detik nomor tampil besar di kiri, berkedip, lonceng berbunyi, lalu kalimat panggilan dibacakan. Kartu loket yang memanggil diberi bingkai oranye.
- [ ] **Panggil ulang** dibacakan lagi, berkali-kali. Dua panggilan berdekatan dibacakan berurutan.
- [ ] Panel kanan menampilkan semua loket: CS 1–5 di kolom kiri, Teller 1–5 di kolom kanan, dengan status Buka, Istirahat, atau Tutup.
- [ ] Empat panggilan sebelumnya tampil di bawah nomor yang sedang dipanggil.

**Layanan dan loket**

- [ ] Admin → Layanan → **Atur loket** pada Customer Service: pilih CS 1–5 saja, simpan. Admin → Loket menampilkan hubungan yang sama.
- [ ] Coba melepas satu-satunya layanan dari sebuah loket: ditolak dengan nama loketnya.
- [ ] Admin → Loket → **Tambah beberapa loket**: pilih Teller, jumlah 2. Pratinjau menampilkan Teller 6 dan Teller 7. Setelah disimpan, keduanya muncul di layar pilih loket dan di TV tanpa muat ulang.
- [ ] Tambah loket dengan nama yang sudah dipakai loket aktif: ditolak dengan pesan "sudah ada".
- [ ] **Nonaktifkan** loket atau layanan meminta konfirmasi. Loket yang sedang buka menampilkan **Tutup paksa**; menutup paksa saat petugas melayani mengembalikan layar petugas ke Pilih loket, dan nomornya tercatat "Selesai (tutup otomatis)" di laporan.

**Petugas**

- [ ] Menyimpan petugas yang dinonaktifkan, diganti perannya, atau diganti sandinya meminta konfirmasi.
- [ ] Nonaktifkan petugas yang sedang memegang loket: ditolak dengan nama loketnya.
- [ ] Nonaktifkan petugas yang sedang masuk tanpa loket, lalu muat ulang layarnya: petugas diarahkan ke halaman masuk.
- [ ] Nama pengguna berspasi atau kata sandi kurang dari 6 karakter: pesan galat menyebut kolom yang salah.

**Perangkat**

- [ ] Tautan hanya tampil sekali; setelah dialog ditutup, daftar hanya menampilkan empat karakter terakhir token.
- [ ] Dalam 30 detik setelah tautan dibuka, status berubah dari Belum dipasang menjadi Tersambung.
- [ ] **Tautan baru** meminta konfirmasi; setelahnya tautan lama menampilkan "Perangkat belum diizinkan".
- [ ] **Cabut** TV yang sedang tampil: layar TV menampilkan "Perangkat belum diizinkan". **Aktifkan lagi** memberi tautan baru.
- [ ] Tombol **Salin** menyalin tautan juga saat Admin dibuka lewat `http://192.168.x.x`.

**Pengaturan dan identitas**

- [ ] Pengaturan → **Zona waktu**: ganti WIB ke WITA meminta konfirmasi; setelah disimpan, jam di kiosk dan TV maju satu jam.
- [ ] Ubah teks berjalan dan nama cabang: TV dan kiosk ikut berubah setelah disimpan.
- [ ] Identitas & tampilan: ganti nama lembaga, slogan, logo, dan warna. Kiosk dan TV ikut berubah tanpa muat ulang. **Pakai logo bawaan** meminta konfirmasi.
- [ ] Warna Utama yang pucat, misalnya `#cfe8ff`, ditandai di bagian Keterbacaan, tapi penyimpanan tetap bisa.

**Dasbor dan laporan**

- [ ] Dasbor: angka dan "Lama ditangani" berubah sendiri saat tiket diambil dan dipanggil.
- [ ] Laporan harian: tiket uji tampil dengan jam ambil, jam dipanggil, dan durasi yang benar.
- [ ] Klik **Ulang** pada satu tiket: halaman cetak terbuka dengan tanda "CETAK ULANG".
- [ ] **Unduh Excel** dan **Unduh CSV** terbuka dengan benar.

## Sebelum commit

PLAN.md meminta setiap fase ditutup dengan lint, typecheck, dan seluruh uji. Urutan singkatnya:

```bash
npm run lint && npm run typecheck && npm test
```

Lalu jalankan `npm run test:e2e` dengan database `queue_e2e` bila perubahan menyentuh layar.
