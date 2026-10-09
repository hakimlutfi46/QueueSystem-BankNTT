# Keputusan

## 2026-10-09 — Konfirmasi untuk aksi sensitif

PLAN hanya meminta konfirmasi untuk Tidak hadir dan Tutup loket. Atas permintaan pengguna, aksi lain yang sulit dibatalkan atau berdampak ke layar lain kini juga meminta konfirmasi lewat satu komponen bersama (`src/components/ui/confirm.tsx`): keluar dari akun (dengan peringatan bila loket masih buka), menonaktifkan atau mengaktifkan loket dan layanan, membuat tautan perangkat baru, menyimpan petugas yang dinonaktifkan, diganti perannya, atau diganti sandinya, menghapus logo unggahan, dan mengganti zona waktu. Tombol utama layar loket (Panggil berikutnya) sengaja tetap tanpa konfirmasi supaya pelayanan tidak melambat.

## 2026-10-09 — TV: dua panel, tanpa kolom antrean

Atas permintaan pengguna, kolom antrean per layanan dihapus dari TV karena loket sudah menampilkan nomor yang sedang dilayani. TV dibagi dua: nomor yang dipanggil dan empat panggilan sebelumnya di kiri, semua loket di kanan dalam dua kolom yang diisi per kolom (dua belas per halaman). Dengan urutan nama, loket CS berada di kolom kiri dan Teller di kolom kanan. Susunan tiga kolom dengan loket di kedua sisi sempat dicoba lalu ditolak pengguna. `nextNumber` per layanan ikut dihapus dari state karena tidak dipakai lagi. Di kiosk, ukuran huruf tombol paling besar 32 px dan jumlah menunggu hanya tampil bila ada antrean.

## 2026-10-09 — Sesi database selalu UTC

Adapter `@prisma/adapter-pg` membuang offset zona waktu saat membaca `timestamptz` dari `$queryRaw`. Pada server PostgreSQL ber-TimeZone `Asia/Jakarta`, `15:31+07` terbaca sebagai `15:31Z`, sehingga waktu tiket, timer loket, dan status perangkat maju tujuh jam. Semua koneksi aplikasi dan uji integrasi kini membuka sesi dengan `-c TimeZone=UTC` (`DB_SESSION_OPTIONS` di `src/lib/db.ts`), jadi offset selalu nol. Tanggal dan jam cabang tetap dihitung dengan `AT TIME ZONE` dan `APP_TIMEZONE` atau pilihan Admin, tidak bergantung pada zona sesi.

## 2026-10-09 — Tombol kiosk menyesuaikan jumlah layanan

PLAN menetapkan tombol layanan setinggi minimal 160 px dengan nama, huruf awalan, dan jumlah menunggu. Dengan delapan layanan bank, tombol setinggi itu meluber dari layar dan menutupi judul. Kiosk sekarang menghitung jumlah kolom dan baris dari ruang yang tersedia (`src/lib/kiosk/layout.ts`), sehingga semua tombol sama besar dan muat tanpa digulir; bila tombol akan lebih pendek dari 96 px, kiosk beralih ke daftar yang bisa digulir. Ukuran huruf tiap tombol dikecilkan otomatis sampai nama dan jumlah menunggu muat utuh, jadi tulisan tidak pernah terpotong. Atas permintaan pengguna, huruf awalan tidak ditampilkan di tombol; nomor tiket tetap memakainya.

## 2026-10-09 — Layanan dihubungkan ke loket dari dua arah

Loket memanggil tiket paling awal di antara layanan yang terhubung dengannya; aturan ini tidak berubah. Selain dari Admin → Loket, hubungan bisa diatur dari Admin → Layanan lewat `PUT /api/admin/services/:id/counters`. Penyimpanan mengunci baris layanan dan semua loket yang terlibat (urut id) dalam satu transaksi, dan menolak perubahan yang membuat sebuah loket tanpa layanan. `updateCounter` ikut mengunci barisnya, jadi dua admin yang mengubah dari dua arah bersamaan tidak bisa meninggalkan loket tanpa layanan.

## 2026-10-09 — TV menampilkan semua loket beserta statusnya

TV kini menampilkan semua loket aktif dengan status Buka, Istirahat, atau Tutup, bukan hanya yang buka. Nomor berikutnya hanya tampil per layanan di kolom Antrian, tidak per loket, karena beberapa loket bisa melayani layanan yang sama dan `FOR UPDATE SKIP LOCKED` menentukan loket mana yang mengambilnya.

## 2026-10-09 — Suara TV menyala sendiri

Satu AudioContext dipakai bersama untuk semua pengumuman. Sebelumnya setiap pengumuman membuat konteks baru yang ditahan browser di luar klik, sehingga hanya panggilan pertama berbunyi dan antrean macet; panggil ulang tidak pernah terdengar. Lonceng, ucapan, dan rekaman kini punya batas waktu supaya antrean tidak bisa macet. TV mencoba menyalakan suara saat dibuka; dengan Chrome `--autoplay-policy=no-user-gesture-required` suara langsung aktif, dan tombol Aktifkan suara hanya muncul bila browser menolak.

## 2026-10-09 — Layar TV berpusat pada antrean

PLAN membagi TV menjadi panggilan terakhir (kiri) dan grid loket (kanan) yang berganti halaman setelah 8 loket. Dengan 9 loket atau lebih, sebagian loket tersembunyi dan jumlah menunggu nyaris tidak terlihat. TV sekarang berupa kanvas tetap 1920×1080 yang diskalakan ke layar apa pun, dengan tiga kolom: panggilan terakhir dan 4 panggilan sebelumnya, antrean per layanan (jumlah menunggu dan nomor berikutnya, 7 layanan per halaman), dan loket (12 per halaman). `GET /api/queue/state` ikut membawa `nextNumber` per layanan dan `recentCalls`. Loket yang buka tanpa nomor aktif menampilkan "—", bukan "Siap", supaya nasabah tidak mengira loket itu menerima siapa saja.

## 2026-10-09 — Zona waktu diatur dari Admin

`APP_TIMEZONE` di `.env` sulit diganti oleh admin cabang, dan salah zona membuat jam tiket, kiosk, TV, serta pergantian nomor harian bergeser satu atau dua jam. Admin → Pengaturan sekarang memilih WIB, WITA, atau WIT, disimpan di `settings` dengan kunci `time_zone`. `appTimezone()` membaca pilihan itu dari cache server yang diisi saat pengaturan disimpan dan diperbarui tiap menit; bila kosong tetap memakai `APP_TIMEZONE`, lalu Asia/Makassar. Uji otomatis selalu memakai WITA lewat `vitest.config.mts`.

## 2026-10-09 — Tiket tanpa nama lembaga dan slogan

PLAN mencetak logo, nama cabang, dan slogan di tiket. Atas permintaan pengguna, tiket cukup memuat logo di atas NOMOR ANTRIAN; nama lembaga dan slogan tidak dicetak. Pada PDF, nama cabang hanya muncul bila logo tidak bisa disisipkan (misalnya logo unggahan berformat SVG), supaya tiket tetap berkop.

## 2026-10-09 — Tiket sebagai PDF saat belum ada printer

PLAN mencetak tiket lewat dialog cetak Chrome ke printer thermal. Untuk mencoba kiosk tanpa printer, `TICKET_OUTPUT=pdf` membuat tiket sebagai PDF seukuran kertas thermal (80 atau 58 mm) di server dengan `pdf-lib`, lalu kiosk mengunduhnya. Isinya sama dengan halaman cetak. Bila variabel kosong, `npm run dev` memakai PDF dan build produksi memakai printer, jadi server cabang tetap mencetak langsung tanpa pengaturan tambahan. `printTicket()` tetap satu-satunya jalur ke printer sesuai PLAN.

## 2026-10-09 — Perangkat didaftarkan dari Admin

PLAN.md memakai dua token tetap di `.env`, `KIOSK_TOKEN` dan `DISPLAY_TOKEN`. Cara itu cukup untuk satu kiosk dan satu TV, tapi tidak untuk pemakaian sungguhan: satu cabang bisa punya beberapa kiosk dan beberapa TV, dan satu perangkat yang hilang atau tautannya tersebar tidak bisa dicabut tanpa mengganti token semua perangkat dan menyalakan ulang server.

Halaman Admin → Perangkat (`/admin/devices`) sekarang mendaftarkan setiap kiosk dan TV dengan nama sendiri. Server membuat token acak 32 byte (base64url) dan menampilkannya sekali di tautan pemasangan. Yang disimpan hanya hash SHA-256 dan empat karakter terakhir untuk dikenali di daftar. Admin bisa mengganti nama, membuat tautan baru (token lama langsung tidak berlaku, perangkat yang dicabut aktif lagi), dan mencabut izin. Logikanya di `src/lib/auth/devices.ts`. Cookie di perangkat sekarang berisi token perangkat itu sendiri.

`src/proxy.ts` dan `/api/stream` memeriksa token ke database lewat `deviceMatcher()`. Di Next.js 16, proxy berjalan di runtime Node.js, jadi proxy boleh membuka koneksi database. Ini menggantikan catatan di entri "Sesi dibaca ulang dari database" bahwa proxy tidak menyentuh database. Waktu terakhir aktif dicatat paling sering sekali per menit per perangkat, supaya setiap permintaan tidak menulis ke database.

`KIOSK_TOKEN` dan `DISPLAY_TOKEN` tetap diterima bila diisi, sebagai token cadangan. Keduanya sekarang opsional. Uji end-to-end masih memakainya. Panel tautan di Pengaturan (entri "Tautan perangkat di Pengaturan") diganti tautan ke Perangkat dan Identitas.

Perubahan skema: tabel baru `devices` dan enum `device_kind`, lewat migrasi `20261009090000_add_devices`.

## 2026-10-09 — Identitas lembaga bisa diganti

Aplikasi ini juga ingin dipakai lembaga selain Bank NTT. Ini menyimpang dari PLAN.md, yang menetapkan design system Bank NTT tanpa pilihan. Bawaannya tetap Bank NTT: nama, slogan, logo, dan warna sama seperti sebelumnya bila tidak ada yang diubah.

Halaman Admin → Identitas & tampilan (`/admin/branding`) mengatur nama lembaga, slogan, logo, dan lima warna merek. Nilainya disimpan di tabel `settings` dengan kunci `org_name`, `org_tagline`, `brand_colors`, dan `brand_logo`, jadi skema tidak berubah. `src/styles/tokens.css` menyimpan warna bawaan sebagai `--default-*`, dan `--brand-*` menunjuk ke sana. Layout akar menulis `<style>` penimpa dari database di setiap permintaan, sehingga semua halaman menjadi dinamis. Kiosk, TV, dan layar petugas ikut berubah lewat `CONFIG_CHANGED`.

Hanya lima warna yang bisa diganti: Utama, Sekunder, Aksen terang, Sorotan, dan Latar TV. Warna teks, latar halaman, sukses, bahaya, dan abu-abu tetap, supaya tulisan selalu terbaca dan arti status tidak berubah. Kontras diperiksa dengan aturan di PLAN.md (`src/lib/branding-colors.ts`), tapi hanya diperingatkan, tidak diblokir. Warna merek lembaga kadang memang gagal satu pasangan, dan keputusannya diserahkan ke admin.

Logo (PNG, JPG, WebP, atau SVG, paling besar 512 KB) disimpan di database, bukan di disk. Docker tidak butuh volume tambahan, dan logo ikut tercadang bersama database. Logo dilayani di `/api/brand/logo?v=<hash>` dengan cache panjang. SVG dikirim dengan CSP sandbox supaya skrip di dalamnya tidak jalan.

`prisma/seed.ts` membaca `SEED_ORG_NAME` (bawaan "Bank NTT") untuk nama lembaga, nama cabang, dan teks berjalan awal.

## 2026-10-09 — Sesi dibaca ulang dari database

Sesi Auth.js berupa cookie JWT yang berlaku 30 hari dan sebelumnya dipercaya begitu saja. Akibatnya petugas yang dinonaktifkan, admin yang diturunkan menjadi petugas, atau nama yang diganti baru berlaku setelah sesi habis. `currentUser()` di `src/lib/auth/session.ts` sekarang membaca nama, peran, dan status aktif dari tabel `users` di setiap permintaan. Akun nonaktif langsung kehilangan akses ke loket dan Admin.

Proxy di `src/proxy.ts` tetap memakai cookie untuk mengizinkan baca `GET /api/queue/state` dan `/api/stream`, karena proxy tidak membuka koneksi database. Isinya hanya data yang juga tampil di TV.

## 2026-10-09 — Tutup paksa loket dari Admin

Hanya petugas pemegang loket yang bisa menutup loketnya, dan Admin tidak bisa menonaktifkan loket yang masih buka. Bila petugas pulang tanpa menutup loket, Admin tidak punya jalan keluar. Admin sekarang bisa menutup paksa lewat `POST /api/admin/counters/:id/close`, ditangani `forceCloseCounter()` di `src/lib/queue/desk.ts`.

Tiket yang masih dilayani loket itu ditutup sebagai `DONE` dengan `auto_closed`, sama seperti tiket yang lupa ditutup saat ganti hari. Tiket itu tetap tampil di laporan dengan tanda tutup otomatis dan tidak masuk rata-rata. Jejaknya dicatat di `ticket_events` atas nama admin.

Petugas yang masih memegang loket tidak bisa dinonaktifkan. Admin diminta menutup paksa loketnya dulu, supaya tidak ada loket buka tanpa petugas aktif.

## 2026-10-09 — Data contoh terpisah dari seed

`prisma/seed.ts` tetap berisi data awal yang aman untuk cabang, dan itu yang dijalankan Docker. Data contoh untuk mencoba aplikasi ada di `prisma/seed-demo.ts` (`npm run db:seed:demo`): delapan layanan bank, lima loket CS dan lima loket Teller, sepuluh petugas, dan riwayat tiket tujuh hari kerja terakhir. Hasilnya tetap sama setiap kali dijalankan, dan tanggal yang sudah punya tiket dilewati, jadi tidak pernah menimpa data sungguhan.

## 2026-10-08 — Loket dinamis per cabang

Halaman Admin → Loket bisa membuat beberapa loket sekaligus (misalnya Teller 3 sampai Teller 6) dalam satu transaksi lewat `POST /api/admin/counters` dengan isi `{ items: [...] }`. Bentuk lama dengan satu loket tetap diterima. Satu permintaan dibatasi 20 loket supaya satu salah ketik tidak membanjiri TV.

Nama loket aktif sekarang harus unik, tanpa membedakan huruf besar dan kecil. Dua loket bernama "CS 1" akan membingungkan nasabah di TV dan petugas di layar pilih loket. Aturan ini dicek di `src/lib/admin/counters.ts`, bukan lewat constraint database, karena loket nonaktif dengan nama yang sama tetap harus boleh ada untuk laporan lama. Skema tidak berubah.

Nama dan nomor tampil disarankan dari layanan yang dipilih: "Customer Service" menjadi "CS", lalu nomor berikutnya setelah angka tertinggi yang pernah dipakai, termasuk loket nonaktif.

## 2026-10-08 — Cetak ulang tiket dari Admin

PLAN meminta tiket bisa dicetak ulang dari Admin bila cetak di kiosk gagal. Halaman `/kiosk/print/[ticketId]` dijaga token kiosk, jadi Admin memakai halaman sendiri, `/print/[ticketId]`, yang hanya terbuka untuk sesi admin dan memberi tanda "CETAK ULANG" di kertas. Isi tiket dipakai bersama lewat `src/components/print/ticket-slip.tsx`. Tautannya ada di kolom terakhir tabel rincian laporan harian.

## 2026-10-08 — Tautan perangkat di Pengaturan

Halaman Pengaturan menampilkan tautan kiosk dan TV lengkap dengan token, tersamar sampai admin menekan Lihat. Admin cabang yang memasang perangkat tidak perlu membuka berkas `.env` di server.

## 2026-10-08 — Isi pengumuman di sinyal panggilan

Payload `pg_notify` untuk `TICKET_CALLED` dan `TICKET_RECALLED` juga memuat nomor tiket, nama loket, dan nomor tampil. Dua panggilan yang datang berdekatan tetap bisa dibacakan berurutan, meskipun layar hanya menyimpan satu panggilan terakhir.

## 2026-10-08 — Perubahan status loket

`COUNTER_CHANGED` hanya dikirim lewat `pg_notify`. Tabel `ticket_events` tetap untuk kejadian tiket, karena buka, istirahat, dan tutup loket tidak punya tiket.

## 2026-10-08 — Auth.js versi 5

Plan memakai Auth.js dengan login nama pengguna dan kata sandi. Rilis stabil `next-auth` 4 tidak memakai App Router. Yang dipasang adalah Auth.js 5 (`next-auth@5.0.0-beta.32`), karena versi itu yang mendukung sesi di App Router dan Next.js 16. Sesi disimpan di cookie JWT, tanpa tabel sesi baru.

## 2026-10-08 — Notifikasi tiket kedaluwarsa

Daftar event realtime di plan belum menyebut tiket `EXPIRED`. Tutup hari tetap menulis jejak `EXPIRED` dan mengirim `pg_notify` bertipe `TICKET_EXPIRED`, supaya layar nanti bisa memuat ulang dari sinyal yang sama dengan event antrian lain.

## 2026-10-07 — Cache Components Next.js dimatikan

Template Next.js 16 menyalakan `cacheComponents`. Mode itu menolak `export const runtime` dan `export const dynamic` di route handler.

Spesifikasi mewajibkan runtime Node dan `dynamic = 'force-dynamic'` pada aliran SSE, karena koneksi `LISTEN` harus hidup lama. `cacheComponents` dimatikan supaya pengaturan route itu tetap bisa dipakai.

## 2026-10-07 — Partial index ditulis di schema Prisma

PLAN.md meminta partial index ditambahkan lewat SQL di file migration, karena saat dokumen ditulis fitur itu tidak bisa dinyatakan di `schema.prisma`.

Prisma ORM 7.10 bisa menyatakan partial index lewat preview feature `partialIndexes`. Index `tickets_waiting_idx` dan `tickets_one_active_per_counter` ditulis di schema dengan `where: raw(...)`, supaya migrasi berikutnya tidak mencoba menghapusnya. Kondisi dan nama index tetap sama dengan spesifikasi.
