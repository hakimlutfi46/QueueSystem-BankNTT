# Keputusan

## 2026-10-08 — Notifikasi tiket kedaluwarsa

Daftar event realtime di plan belum menyebut tiket `EXPIRED`. Tutup hari tetap menulis jejak `EXPIRED` dan mengirim `pg_notify` bertipe `TICKET_EXPIRED`, supaya layar nanti bisa memuat ulang dari sinyal yang sama dengan event antrian lain.

## 2026-10-07 — Cache Components Next.js dimatikan

Template Next.js 16 menyalakan `cacheComponents`. Mode itu menolak `export const runtime` dan `export const dynamic` di route handler.

Spesifikasi mewajibkan runtime Node dan `dynamic = 'force-dynamic'` pada aliran SSE, karena koneksi `LISTEN` harus hidup lama. `cacheComponents` dimatikan supaya pengaturan route itu tetap bisa dipakai.

## 2026-10-07 — Partial index ditulis di schema Prisma

PLAN.md meminta partial index ditambahkan lewat SQL di file migration, karena saat dokumen ditulis fitur itu tidak bisa dinyatakan di `schema.prisma`.

Prisma ORM 7.10 bisa menyatakan partial index lewat preview feature `partialIndexes`. Index `tickets_waiting_idx` dan `tickets_one_active_per_counter` ditulis di schema dengan `where: raw(...)`, supaya migrasi berikutnya tidak mencoba menghapusnya. Kondisi dan nama index tetap sama dengan spesifikasi.
