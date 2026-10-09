# Keputusan

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
