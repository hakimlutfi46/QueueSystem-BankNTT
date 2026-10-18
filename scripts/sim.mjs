#!/usr/bin/env node
// Runs the queue server on a Mac or Ubuntu PC the way a branch ticket machine runs it, for trying the
// Ticket, Admin, Loket and TV apps (simulation installers) without Windows hardware:
//   - its own database (queue_sim by default), migrated and seeded like a new branch: only the admin
//     account, no staff, so the dev data in DATABASE_URL is never touched;
//   - tickets as PDF (no thermal printer);
//   - LAN discovery on UDP 41234, so the apps find this server by themselves.
//
//   npm run sim                 # next dev on port 3000
//   npm run sim -- --prod       # production build in .next-sim, then next start (closest to a branch)
//   npm run sim -- --reset      # drop and recreate the simulation database first
//   npm run sim -- --port 3100
//
// SIM_DATABASE_URL overrides the database; otherwise DATABASE_URL from .env with the name queue_sim.
import "dotenv/config";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import pg from "pg";

const require = createRequire(import.meta.url);
const { startDiscovery } = require("../apps/server-bundle/tools/discovery.js");
const { version } = require("../package.json");

const args = process.argv.slice(2);
const prod = args.includes("--prod");
const reset = args.includes("--reset");
const portIndex = args.indexOf("--port");
const port = Number(portIndex > -1 ? args[portIndex + 1] : 3000);
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function fail(message) {
  console.error(`\nGagal: ${message}`);
  process.exit(1);
}

if (!Number.isInteger(port) || port < 1 || port > 65535) fail("Port tidak valid. Contoh: npm run sim -- --port 3100");

function simulationUrl() {
  if (process.env.SIM_DATABASE_URL) return process.env.SIM_DATABASE_URL;
  if (!process.env.DATABASE_URL) fail("DATABASE_URL belum ada di .env.");
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = "/queue_sim";
  return url.toString();
}

const databaseUrl = simulationUrl();
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
if (!/^[A-Za-z0-9_]+$/.test(databaseName)) fail(`Nama database tidak valid: ${databaseName}`);
if (process.env.DATABASE_URL && new URL(process.env.DATABASE_URL).pathname === `/${databaseName}` && !process.env.SIM_DATABASE_URL) {
  fail("Database simulasi tidak boleh sama dengan DATABASE_URL.");
}

async function prepareDatabase() {
  const admin = new URL(databaseUrl);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString(), connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
  } catch (error) {
    fail(`PostgreSQL tidak bisa dihubungi (${error.message}). Pastikan PostgreSQL menyala.`);
  }
  try {
    const exists = (await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName])).rowCount > 0;
    if (exists && reset) {
      console.log(`> hapus database ${databaseName}`);
      await client.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    }
    if (!exists || reset) {
      console.log(`> buat database ${databaseName}`);
      await client.query(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await client.end();
  }
}

function run(command, commandArgs, env) {
  const result = spawnSync(command, commandArgs, { stdio: "inherit", env });
  if (result.status !== 0) fail(`${command} ${commandArgs.join(" ")} (exit ${result.status ?? result.signal})`);
}

await prepareDatabase();

const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  TICKET_OUTPUT: "pdf",
  // Like a new branch: the seed creates only the admin account.
  SEED_STAFF_PASSWORD: "",
  PORT: String(port),
  ...(prod ? { NEXT_DIST_DIR: ".next-sim" } : {}),
};

console.log("> migrasi dan data awal");
run(npx, ["prisma", "migrate", "deploy"], env);
run(npx, ["prisma", "db", "seed"], env);
if (prod) {
  console.log("> build produksi (.next-sim)");
  run(npx, ["next", "build"], env);
}

let name = "";
async function refreshName() {
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const value = (await client.query("SELECT value FROM settings WHERE key = 'branch_name'")).rows[0]?.value;
    if (typeof value === "string" && value.trim()) name = value.trim().slice(0, 100);
  } catch {
    // keep the last known name
  } finally {
    await client.end().catch(() => undefined);
  }
}
await refreshName();
setInterval(refreshName, 60_000).unref();

let discovery = null;
try {
  discovery = await startDiscovery({ getName: () => name || os.hostname(), httpPort: port, version, log: () => {} });
} catch (error) {
  console.warn(
    error?.code === "EADDRINUSE"
      ? "Peringatan: UDP 41234 sudah dipakai (npm run discovery lain?). Aplikasi harus diisi alamat manual."
      : `Peringatan: discovery gagal (${error?.message ?? error}).`,
  );
}

const lan = Object.values(os.networkInterfaces())
  .flat()
  .filter((item) => item && item.family === "IPv4" && !item.internal)
  .map((item) => `http://${item.address}:${port}`);
console.log(`
Simulasi cabang (${prod ? "produksi" : "dev"}), database ${databaseName}, tiket sebagai PDF.
  Di komputer ini : http://localhost:${port}
  Dari perangkat lain: ${lan.join(", ") || "(tidak ada jaringan)"}
  Admin           : admin, sandi dari SEED_ADMIN_PASSWORD (bawaan Password123), wajib diganti saat masuk
  Discovery       : ${discovery ? "aktif di UDP 41234" : "mati"}
`);

const server = spawn(npx, prod ? ["next", "start", "-H", "0.0.0.0", "-p", String(port)] : ["next", "dev", "-H", "0.0.0.0", "-p", String(port)], {
  stdio: "inherit",
  env,
});
const stop = () => server.kill("SIGINT");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", async (code) => {
  await discovery?.close();
  process.exit(code ?? 0);
});
