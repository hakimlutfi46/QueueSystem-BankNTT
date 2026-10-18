"use strict";
// Daily database backup for the Windows server (same behaviour as scripts/backup-db.mjs, but uses
// pgsql\bin\pg_dump.exe from the bundle and C:\ProgramData\BankNTT\server.env, no dotenv needed).
//
//   node.exe tools\backup.js        (scheduled task "BankNTT-Backup", daily 22:30)
//
// Writes <BACKUP_DIR>\<db>-YYYYMMDD-HHMMSS.dump (pg_dump custom format, restore with pg_restore),
// verifies it with pg_restore --list, then deletes backups older than BACKUP_KEEP_DAYS (default 30).

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const paths = require("./paths");
const { loadEnvFile } = require("./env-file");
const { createFileLog } = require("./log");

const DAY_MS = 24 * 60 * 60 * 1000;
const LIBPQ_PARAMS = new Set(["sslmode", "sslcert", "sslkey", "sslrootcert", "connect_timeout", "application_name"]);

const logger = createFileLog({ file: path.join(paths.logsDir, "backup.log"), maxBytes: 1024 * 1024, keep: 2 });
logger.captureConsole();

function fail(message) {
  console.error(`Backup gagal: ${message}`);
  logger.flush();
  process.exit(1);
}

function pgBinary(name) {
  const bundled = paths.pgTool(name);
  return fs.existsSync(bundled) ? bundled : name;
}

function main() {
  loadEnvFile(paths.envFile);
  const raw = (process.env.DATABASE_URL || "").trim();
  if (!raw) fail("DATABASE_URL belum diisi.");

  let url;
  try {
    url = new URL(raw);
  } catch {
    fail("DATABASE_URL tidak valid.");
  }
  for (const key of [...url.searchParams.keys()]) if (!LIBPQ_PARAMS.has(key)) url.searchParams.delete(key);
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres";

  const keepDays = Number(process.env.BACKUP_KEEP_DAYS || 30);
  if (!Number.isFinite(keepDays) || keepDays < 1) fail("BACKUP_KEEP_DAYS harus angka 1 atau lebih.");
  const dir = path.resolve((process.env.BACKUP_DIR || "").trim() || paths.backupsDir);
  fs.mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const safeName = database.replace(/[^A-Za-z0-9_-]/g, "_");
  const target = path.join(dir, `${safeName}-${stamp}.dump`);
  const partial = `${target}.partial`;

  // The password goes through PGPASSWORD instead of the command line, so it never shows in process lists.
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
  url.password = "";
  const dump = spawnSync(
    pgBinary("pg_dump"),
    ["--format=custom", "--no-owner", "--no-privileges", `--file=${partial}`, `--dbname=${url}`],
    { stdio: ["ignore", "pipe", "pipe"], env, windowsHide: true },
  );
  if (dump.stderr && dump.stderr.length) process.stderr.write(dump.stderr);
  if (dump.error || dump.status !== 0) {
    fs.rmSync(partial, { force: true });
    fail(dump.error ? dump.error.message : `pg_dump berhenti dengan kode ${dump.status}.`);
  }

  const check = spawnSync(pgBinary("pg_restore"), ["--list", partial], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  if (check.status !== 0) {
    fs.rmSync(partial, { force: true });
    fail("berkas cadangan tidak terbaca oleh pg_restore.");
  }
  fs.renameSync(partial, target);
  console.log(`Cadangan dibuat: ${target} (${(fs.statSync(target).size / 1024).toFixed(0)} KB)`);

  const pattern = new RegExp(`^${safeName}-\\d{8}-\\d{6}\\.dump$`);
  const cutoff = Date.now() - keepDays * DAY_MS;
  let removed = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!pattern.test(name)) continue;
    const file = path.join(dir, name);
    if (file !== target && fs.statSync(file).mtimeMs < cutoff) {
      fs.rmSync(file);
      removed += 1;
    }
  }
  if (removed > 0) console.log(`${removed} cadangan lebih dari ${keepDays} hari dihapus.`);
  logger.flush();
}

main();
