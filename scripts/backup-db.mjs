#!/usr/bin/env node
// Cadangkan database antrian dengan pg_dump, lalu hapus cadangan yang lebih lama dari BACKUP_KEEP_DAYS.
//
//   npm run db:backup
//
// Jalankan tiap hari lewat cron (Linux/Mac) atau Task Scheduler (Windows); lihat README bagian Backup.
// Variabel: DATABASE_URL (wajib), BACKUP_DIR (bawaan ./backups), BACKUP_KEEP_DAYS (bawaan 30).
// Hasilnya berformat custom pg_dump (.dump), dipulihkan dengan pg_restore.
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const DAY_MS = 24 * 60 * 60 * 1000;

function fail(message) {
  console.error(`Backup gagal: ${message}`);
  process.exit(1);
}

const raw = process.env.DATABASE_URL?.trim();
if (!raw) fail("DATABASE_URL belum diisi.");

// Prisma menerima parameter seperti ?schema=public yang ditolak pg_dump; sisakan parameter libpq saja.
const LIBPQ_PARAMS = new Set(["sslmode", "sslcert", "sslkey", "sslrootcert", "connect_timeout", "application_name"]);
let url;
try {
  url = new URL(raw);
} catch {
  fail("DATABASE_URL tidak valid.");
}
for (const key of [...url.searchParams.keys()]) if (!LIBPQ_PARAMS.has(key)) url.searchParams.delete(key);
const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres";

const keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? 30);
if (!Number.isFinite(keepDays) || keepDays < 1) fail("BACKUP_KEEP_DAYS harus angka 1 atau lebih.");
const dir = path.resolve(process.env.BACKUP_DIR?.trim() || "backups");
mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const safeName = database.replace(/[^A-Za-z0-9_-]/g, "_");
const target = path.join(dir, `${safeName}-${stamp}.dump`);
const partial = `${target}.partial`;

const dump = spawnSync("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--file=${partial}`, `--dbname=${url}`], {
  stdio: ["ignore", "inherit", "inherit"],
});
if (dump.error) {
  rmSync(partial, { force: true });
  fail(dump.error.code === "ENOENT" ? "pg_dump tidak ditemukan. Pasang PostgreSQL client tools." : dump.error.message);
}
if (dump.status !== 0) {
  rmSync(partial, { force: true });
  fail(`pg_dump berhenti dengan kode ${dump.status}.`);
}

// Pastikan berkas bisa dibaca pg_restore sebelum dianggap cadangan yang sah.
const check = spawnSync("pg_restore", ["--list", partial], { stdio: ["ignore", "ignore", "inherit"] });
if (check.status !== 0) {
  rmSync(partial, { force: true });
  fail("berkas cadangan tidak terbaca oleh pg_restore.");
}
renameSync(partial, target);
console.log(`Cadangan dibuat: ${target} (${(statSync(target).size / 1024).toFixed(0)} KB)`);

// Hapus cadangan lama milik database yang sama saja; berkas lain di folder itu tidak disentuh.
const pattern = new RegExp(`^${safeName}-\\d{8}-\\d{6}\\.dump$`);
const cutoff = Date.now() - keepDays * DAY_MS;
let removed = 0;
for (const name of readdirSync(dir)) {
  if (!pattern.test(name)) continue;
  const file = path.join(dir, name);
  if (file !== target && statSync(file).mtimeMs < cutoff) {
    rmSync(file);
    removed += 1;
  }
}
if (removed > 0) console.log(`${removed} cadangan lebih dari ${keepDays} hari dihapus.`);
