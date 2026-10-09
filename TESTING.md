# Pengujian

Ada tiga lapis pengujian. Jalankan berurutan: yang cepat dulu, end-to-end terakhir.

| Lapis | Perintah | Database | Lama |
| --- | --- | --- | --- |
| Lint dan typecheck | `npm run lint`, `npm run typecheck` | Tidak perlu | < 1 menit |
| Unit dan integrasi (Vitest) | `npm test` | `queue_test`, dibuat otomatis | ± 10 detik |
| End-to-end (Playwright) | `npm run test:e2e` | `queue_e2e`, disiapkan sendiri | 1–2 menit |

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
| Identitas lembaga: bawaan Bank NTT, simpan nama lain, unggah dan hapus logo | `tests/integration/branding.test.ts` |
| Warna merek: aturan kontras PLAN.md dan CSS penimpa hanya berisi hex yang sah | `tests/unit/branding-colors.test.ts` |
| End-to-end dan loket dinamis di TV | `tests/e2e/journey.spec.ts`, `tests/e2e/admin.spec.ts` |
| Daftarkan, buka, dan cabut perangkat | `tests/e2e/devices.spec.ts` |

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
| `kiosk.spec.ts` | Satu sentuhan menghasilkan satu tiket dan satu cetakan; permintaan gagal tidak mencetak |
| `counter.spec.ts` | Dua petugas di dua loket mendapat nomor berbeda; sandi salah ditolak |
| `display.spec.ts` | Panggilan tampil di TV; dua panggilan berdekatan dibacakan berurutan |
| `admin.spec.ts` | Loket baru dari Admin muncul di layar petugas dan TV tanpa muat ulang |
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

## 4. Uji manual tampilan

Supaya dasbor, laporan, dan grafik langsung terisi, jalankan dulu `npm run db:seed:demo` (lihat bagian Data contoh di README). Lalu jalankan `npm run dev`, masuk sebagai admin, buka **Admin → Perangkat**, daftarkan satu kiosk dan satu TV, lalu salin tautan dari dialog yang muncul. Buka di jendela terpisah dengan ukuran target:

| Layar | Ukuran target | Alamat |
| --- | --- | --- |
| Kiosk | 1280 × 1024 | tautan kiosk dari Admin → Perangkat |
| TV | 1920 × 1080 | tautan TV dari Admin → Perangkat |
| Loket | 1366 × 768 | `/counter` |
| Admin | 1440 × 900 dan 390 lebar (HP) | `/admin` |

Di Chrome, ukuran layar diatur dari DevTools → Toggle device toolbar.

### Daftar periksa

**Alur antrian**

- [ ] Kiosk: sentuh satu layanan. Nomor besar tampil bersama "n antrian di depan Anda", lalu layar kembali ke awal setelah 4 detik.
- [ ] Loket: masuk sebagai `petugas.cs`, buka CS 1, tekan **Panggil berikutnya** atau `Spasi`. Nomor tampil di loket.
- [ ] TV: tekan **Aktifkan suara** sekali. Nomor yang dipanggil berkedip, lonceng berbunyi, lalu kalimat panggilan dibacakan. Kartu loket yang memanggil diberi garis oranye.
- [ ] Loket: **Panggil ulang** (`R`) sampai batas di Pengaturan. Setelah batas, tombol mati dan muncul "batas panggil ulang tercapai".
- [ ] Loket: timer berubah oranye setelah melewati target lama penanganan.

**Loket dinamis**

- [ ] Admin → Loket → **Tambah beberapa loket**: pilih Teller, jumlah 2. Pratinjau menampilkan nomor lanjutan, misalnya Teller 3 dan Teller 4.
- [ ] Setelah disimpan, kedua loket muncul di layar pilih loket petugas tanpa muat ulang.
- [ ] Tambah loket dengan nama yang sudah dipakai loket aktif. Penyimpanan ditolak dengan pesan "sudah ada".
- [ ] Buka loket baru dari layar petugas. Status di Admin → Loket berubah menjadi Buka, dan loket muncul di TV.
- [ ] Loket yang sedang buka menampilkan **Tutup paksa**, bukan Nonaktifkan. Tutup paksa saat petugas sedang melayani: layar petugas kembali ke Pilih loket, dan nomornya tampil "Selesai (tutup otomatis)" di laporan harian.

**Petugas**

- [ ] Nonaktifkan petugas yang sedang memegang loket: ditolak dengan nama loketnya.
- [ ] Nonaktifkan petugas yang sedang masuk tapi tidak memegang loket, lalu muat ulang layarnya: petugas langsung diarahkan ke halaman masuk.
- [ ] Isi nama pengguna dengan spasi atau kata sandi kurang dari 6 karakter: pesan galat menyebut kolom yang salah.

**Perangkat**

- [ ] Admin → Perangkat: daftarkan kiosk "Kiosk Lobi" dan TV "TV Ruang Tunggu". Dialog menampilkan tautan dan perintah Chrome; ganti **Alamat server** dan keduanya ikut berubah.
- [ ] Tutup dialog. Tautan tidak bisa dilihat lagi; daftar hanya menampilkan empat karakter terakhir token.
- [ ] Buka tautan kiosk dan TV. Dalam 30 detik, tanpa muat ulang, status keduanya di Admin → Perangkat berubah dari Belum dipasang menjadi Tersambung.
- [ ] **Tautan baru** pada kiosk, lalu buka tautan lama di jendela privat: halaman menampilkan "Perangkat belum diizinkan". Tautan baru bisa dibuka.
- [ ] **Cabut** TV yang sedang tampil: layar TV menampilkan "Perangkat belum diizinkan", dan perangkat pindah ke daftar Dicabut. **Aktifkan lagi** memberi tautan baru.

**Identitas lembaga**

- [ ] Admin → Identitas & tampilan: ganti nama lembaga dan slogan, lalu **Simpan identitas**. Kiosk dan TV yang terbuka ikut berubah tanpa muat ulang.
- [ ] Kosongkan slogan dan simpan: slogan hilang dari kiosk, TV, dan tiket.
- [ ] Unggah logo PNG atau SVG. Logo baru tampil di kiosk, TV, dan layar petugas. Berkas lebih dari 512 KB ditolak.
- [ ] **Pakai logo bawaan** mengembalikan logo Bank NTT.
- [ ] Ganti warna Utama dengan warna pucat, misalnya `#cfe8ff`. Bagian Keterbacaan menandai pasangan yang gagal dengan rasio dan batas minimalnya, tapi penyimpanan tetap bisa.
- [ ] Ganti beberapa warna dan simpan. Pratinjau, kiosk, dan TV memakai warna baru tanpa muat ulang.
- [ ] **Kembali ke warna bawaan**, lalu simpan. Warna Bank NTT kembali.

**Admin dan laporan**

- [ ] Dasbor: angka berubah sendiri saat tiket diambil, tanpa muat ulang.
- [ ] Layanan: tambah layanan baru, misalnya Kredit dengan huruf `C`. Tombolnya langsung muncul di kiosk.
- [ ] Pengaturan: ubah teks berjalan dan nama cabang. TV dan kiosk ikut berubah setelah disimpan.
- [ ] Laporan harian: klik **Ulang** pada satu tiket. Halaman cetak terbuka dengan tanda "CETAK ULANG".
- [ ] Laporan harian: **Unduh Excel** dan **Unduh CSV** terbuka dengan benar.

**Tampilan** (bandingkan dengan bagian Design system di PLAN.md)

- [ ] Tidak ada yang terpotong atau perlu digulir di kiosk dan TV pada ukuran target.
- [ ] Oranye hanya dipakai sebagai aksen: nomor terbaru di TV, garis diagonal, dan peringatan target.
- [ ] Nomor di TV terbaca dari jarak 5–10 meter.
- [ ] Admin tetap rapi di lebar HP: menu pindah ke atas, kartu tersusun satu kolom.

## Sebelum commit

PLAN.md meminta setiap fase ditutup dengan lint, typecheck, dan seluruh uji. Urutan singkatnya:

```bash
npm run lint && npm run typecheck && npm test
```

Lalu jalankan `npm run test:e2e` dengan database `queue_e2e` bila perubahan menyentuh layar.
