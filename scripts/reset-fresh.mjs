#!/usr/bin/env node
// Reset database antrian Bank NTT ke kondisi fresh bawaan pabrik (default seeder):
//   1. Memastikan seluruh migrasi tabel terpasang (prisma migrate deploy)
//   2. Menghapus bersih seluruh data transaksi testing:
//      - Tiket antrian (tickets)
//      - Riwayat panggilan / log event (ticket_events)
//      - Nomor urut antrian harian (daily_sequences) -> Reset ke awal
//      - Data perangkat terhubung lama (devices) -> Reset auto-pairing
//   3. Mengembalikan status seluruh loket ke 'CLOSED'
//   4. Menjalankan default seeder (prisma db seed) agar akun admin, layanan, loket, dan pengaturan awal siap pakai.
import "dotenv/config";
import { spawnSync } from "node:child_process";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Gagal: DATABASE_URL belum diatur di file .env.");
  process.exit(1);
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));

function runCommand(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(`Gagal menjalankan ${command} ${args.join(" ")}`);
    process.exit(1);
  }
}

async function main() {
  console.log("\n=======================================================");
  console.log("   RESET DATABASE FRESH - SISTEM ANTRIAN BANK NTT      ");
  console.log("=======================================================\n");

  console.log(`> Menghubungkan ke database '${databaseName}'...`);
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
  } catch (error) {
    console.error(`\nGagal terhubung ke PostgreSQL (${error.message}).`);
    console.error("Pastikan service PostgreSQL di PC/laptop sudah aktif.");
    process.exit(1);
  }

  // 1. Jalankan migrasi jika ada yang tertunda
  console.log("> Memeriksa dan memperbarui struktur tabel migrasi...");
  runCommand(npx, ["prisma", "migrate", "deploy"]);

  // 2. Bersihkan seluruh data transaksi dan nomor antrian
  console.log("> Membersihkan data tiket, log panggilan, nomor urut, dan perangkat...");
  await client.query(`
    BEGIN;
    TRUNCATE TABLE ticket_events, tickets, daily_sequences, devices RESTART IDENTITY CASCADE;
    UPDATE counters SET status = 'CLOSED', current_user_id = NULL;
    COMMIT;
  `);

  // 3. Jalankan default seeder
  console.log("> Menyiapkan data seeder default (Akun Admin, Layanan & Loket awal)...");
  runCommand(npx, ["prisma", "db", "seed"]);

  // 4. Verifikasi kondisi akhir
  const countRes = await client.query(`
    SELECT
      (SELECT count(*)::int FROM tickets) AS tickets,
      (SELECT count(*)::int FROM daily_sequences) AS sequences,
      (SELECT count(*)::int FROM devices) AS devices,
      (SELECT count(*)::int FROM services WHERE is_active = true) AS services,
      (SELECT count(*)::int FROM counters WHERE is_active = true) AS counters,
      (SELECT count(*)::int FROM users WHERE role = 'ADMIN') AS admins;
  `);
  await client.end();

  const info = countRes.rows[0];

  console.log("\n=======================================================");
  console.log("   DATABASE BERHASIL DI-RESET KE KONDISI FRESH!        ");
  console.log("=======================================================");
  console.log(`✓ Jumlah Tiket Antrian      : ${info.tickets} (Bersih Total)`);
  console.log(`✓ Nomor Antrian Berikutnya  : Mulai dari awal (001)`);
  console.log(`✓ Status Loket              : Semua loket CLOSED`);
  console.log(`✓ Layanan Aktif             : ${info.services} layanan`);
  console.log(`✓ Loket Aktif               : ${info.counters} loket`);
  console.log(`✓ Akun Admin Siap Pakai     : username 'admin' (Password123)`);
  console.log("-------------------------------------------------------");
  console.log("Sistem antrian siap dipakai untuk operasional produksi / testing baru.\n");
}

main().catch((err) => {
  console.error("Terjadi kesalahan:", err);
  process.exit(1);
});
