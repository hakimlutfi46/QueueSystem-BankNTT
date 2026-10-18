#!/usr/bin/env node
// Menjalankan server antrian BANK NTT mode PRODUKSI di macOS / Linux:
//   - Menggunakan database produksi (DATABASE_URL dari .env)
//   - Menjalankan migrasi database
//   - Menjalankan Next.js server produksi (next start) di port 3000 (0.0.0.0)
//   - Menyalakan discovery LAN di UDP 41234, sehingga perangkat lain (Mac / Windows)
//     langsung menemukan server ini secara otomatis tanpa perlu ketik IP manual.
//
// Cara menjalankan:
//   npm run prod
//   atau double-click Mulai-Server-Mac.command
import "dotenv/config";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import pg from "pg";

const require = createRequire(import.meta.url);
const { startDiscovery } = require("../apps/server-bundle/tools/discovery.js");
const { version } = require("../package.json");

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const port = Number(portIndex > -1 ? args[portIndex + 1] : process.env.PORT || 3000);
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function fail(message) {
  console.error(`\nGagal: ${message}`);
  process.exit(1);
}

if (!Number.isInteger(port) || port < 1 || port > 65535) fail("Port tidak valid. Contoh: npm run prod -- --port 3000");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) fail("DATABASE_URL belum diatur di file .env.");

const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));

async function checkDatabase() {
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    await client.end();
  } catch (error) {
    fail(`PostgreSQL tidak bisa dihubungi (${error.message}). Pastikan service PostgreSQL sudah berjalan.`);
  }
}

function run(command, commandArgs, env) {
  const result = spawnSync(command, commandArgs, { stdio: "inherit", env });
  if (result.status !== 0) fail(`${command} ${commandArgs.join(" ")} (exit ${result.status ?? result.signal})`);
}

console.log("\n=======================================================");
console.log("   SISTEM ANTRIAN BANK NTT - SERVER PRODUKSI (MAC/LAN)  ");
console.log("=======================================================\n");

console.log(`> Memeriksa koneksi database (${databaseName})...`);
await checkDatabase();

const env = {
  ...process.env,
  PORT: String(port),
  NODE_ENV: "production",
};

console.log("> Menjalankan migrasi database...");
run(npx, ["prisma", "migrate", "deploy"], env);

// Cek apakah build produksi (.next/BUILD_ID) sudah ada
const buildIdFile = path.join(process.cwd(), ".next", "BUILD_ID");
if (!existsSync(buildIdFile) || args.includes("--rebuild")) {
  console.log("> Membangun aplikasi Next.js produksi (next build)...");
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
    // keep previous name
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
      ? "Peringatan: Port UDP 41234 sedang dipakai proses lain. Discovery otomatis dinonaktifkan."
      : `Peringatan: Discovery gagal (${error?.message ?? error}).`,
  );
}

const lan = Object.values(os.networkInterfaces())
  .flat()
  .filter((item) => item && item.family === "IPv4" && !item.internal)
  .map((item) => `http://${item.address}:${port}`);

console.log(`
-------------------------------------------------------
✓ SERVER PRODUKSI BERJALAN DENGAN SUKSES!
-------------------------------------------------------
  Nama Cabang       : ${name || os.hostname()}
  Akses di Mac ini  : http://localhost:${port}
  Akses dari Mac lain: ${lan.join(", ") || "(periksa koneksi Wi-Fi / LAN)"}
  Discovery Otomatis : ${discovery ? "AKTIF (UDP 41234) - Perangkat lain akan auto-koneksi" : "NONAKTIF"}
-------------------------------------------------------
Aplikasi Kiosk / TV / Loket / Admin di Mac lain akan
otomatis mendeteksi IP ini dan terhubung tanpa input manual.
Tekan Ctrl+C untuk menghentikan server.
-------------------------------------------------------
`);

const standaloneServer = path.join(process.cwd(), ".next", "standalone", "server.js");
const serverCmd = existsSync(standaloneServer) ? process.execPath : npx;
const serverArgs = existsSync(standaloneServer)
  ? [standaloneServer]
  : ["next", "start", "-H", "0.0.0.0", "-p", String(port)];

const serverEnv = {
  ...env,
  HOSTNAME: "0.0.0.0",
  PORT: String(port),
};

const server = spawn(serverCmd, serverArgs, {
  stdio: "inherit",
  env: serverEnv,
});

const stop = () => server.kill("SIGINT");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", async (code) => {
  await discovery?.close();
  process.exit(code ?? 0);
});
