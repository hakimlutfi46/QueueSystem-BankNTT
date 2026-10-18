#!/usr/bin/env node
// Answers LAN discovery for a server run from the repo (`npm run dev` / `npm run start`), so the
// Admin, Loket, TV and kiosk apps find it without typing an IP address. The Windows server bundle
// does the same inside its launcher; this script reuses that responder.
//
//   npm run discovery                 # announce port 3000
//   npm run discovery -- --port 3100  # announce another web port
import "dotenv/config";
import { createRequire } from "node:module";
import os from "node:os";
import pg from "pg";

const require = createRequire(import.meta.url);
const { startDiscovery } = require("../apps/server-bundle/tools/discovery.js");
const { version } = require("../package.json");

const portIndex = process.argv.indexOf("--port");
const httpPort = Number(portIndex > -1 ? process.argv[portIndex + 1] : process.env.PORT || 3000);
if (!Number.isInteger(httpPort) || httpPort < 1 || httpPort > 65535) {
  console.error("Port tidak valid. Contoh: npm run discovery -- --port 3000");
  process.exit(1);
}

// Branch name from Admin → Identitas & tampilan, refreshed every minute; hostname until the database answers.
let name = "";
async function refreshName() {
  if (!process.env.DATABASE_URL) return;
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const result = await client.query("SELECT value FROM settings WHERE key = 'branch_name'");
    const value = result.rows[0]?.value;
    if (typeof value === "string" && value.trim()) name = value.trim().slice(0, 100);
  } catch {
    // keep the last known name
  } finally {
    await client.end().catch(() => undefined);
  }
}
await refreshName();
setInterval(refreshName, 60_000).unref();

try {
  await startDiscovery({ getName: () => name || os.hostname(), httpPort, version });
} catch (error) {
  console.error(
    error?.code === "EADDRINUSE"
      ? "UDP 41234 sudah dipakai: responder lain (atau server bundle) sedang berjalan."
      : `Discovery gagal: ${error?.message ?? error}`,
  );
  process.exit(1);
}

const addresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((item) => item && item.family === "IPv4" && !item.internal)
  .map((item) => `http://${item.address}:${httpPort}`);
console.log(`Server "${name || os.hostname()}" diumumkan di jaringan: ${addresses.join(", ") || `http://127.0.0.1:${httpPort}`}`);
console.log("Biarkan berjalan berdampingan dengan npm run dev. Ctrl+C untuk berhenti.");
