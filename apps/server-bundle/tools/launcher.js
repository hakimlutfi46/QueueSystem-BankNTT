"use strict";
// Entry point of the Windows server service (run by WinSW as `node.exe tools\launcher.js`).
//
//   1. load C:\ProgramData\BankNTT\server.env
//   2. wait until PostgreSQL accepts connections
//   3. apply pending migrations (tools/migrate.js)
//   4. run the idempotent seed (tools/seed.cjs, child process)
//   5. start the UDP discovery responder (tools/discovery.js)
//   6. start the Next.js standalone server (app/server.js) on 0.0.0.0:3000
//
// Any fatal error exits with code 1 so the service manager restarts the process.

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const paths = require("./paths");
const { loadEnvFile } = require("./env-file");
const { createFileLog } = require("./log");

const logger = createFileLog({ file: path.join(paths.logsDir, "server.log") });
logger.captureConsole();

function log(line) {
  console.log(`[launcher] ${line}`);
}

function fatal(message) {
  console.error(`[launcher] FATAL ${message}`);
  logger.flush();
  process.exit(1);
}

// Only for the startup phase; once Next.js runs, its own handlers (or Node's defaults) apply.
const onUncaught = (error) => fatal(`uncaught exception: ${error && error.stack ? error.stack : error}`);
const onUnhandled = (error) => fatal(`unhandled rejection: ${error && error.stack ? error.stack : error}`);
process.on("uncaughtException", onUncaught);
process.on("unhandledRejection", onUnhandled);
process.on("exit", () => logger.flush());

function readVersion() {
  for (const file of [path.join(paths.serverDir, "bundle-manifest.json"), path.join(paths.appDir, "package.json")]) {
    try {
      const json = JSON.parse(fs.readFileSync(file, "utf8"));
      const version = json.appVersion || json.version;
      if (version) return String(version);
    } catch {
      // try the next file
    }
  }
  return "0.0.0";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDatabase(pg, connectionString) {
  const deadline = Date.now() + Number(process.env.BANKNTT_DB_WAIT_SECONDS || 180) * 1000;
  for (let attempt = 1; ; attempt += 1) {
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      if (attempt > 1) log(`database is ready after ${attempt} attempts`);
      return;
    } catch (error) {
      await client.end().catch(() => undefined);
      if (attempt === 1 || attempt % 10 === 0) log(`waiting for database: ${error.message}`);
      if (Date.now() > deadline) throw new Error(`database not reachable: ${error.message}`);
      await sleep(2000);
    }
  }
}

function runSeed(env) {
  const seed = path.join(__dirname, "seed.cjs");
  if (!fs.existsSync(seed)) {
    log("seed.cjs not found, skipping seed");
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [seed], { cwd: __dirname, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    child.stdout.on("data", (data) => process.stdout.write(`[seed] ${data}`));
    child.stderr.on("data", (data) => process.stderr.write(`[seed] ${data}`));
    const timer = setTimeout(() => child.kill(), 120000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`seed exited with ${signal || code}`));
    });
  });
}

/** Branch name for discovery replies, refreshed in the background (cheap single query). */
function trackBranchName(pg, connectionString) {
  let name = "";
  async function refresh() {
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
    try {
      await client.connect();
      const result = await client.query("SELECT value FROM settings WHERE key = 'branch_name'");
      const value = result.rows[0] && result.rows[0].value;
      if (typeof value === "string" && value.trim()) name = value.trim().slice(0, 100);
    } catch {
      // keep the last known name
    } finally {
      await client.end().catch(() => undefined);
    }
  }
  const timer = setInterval(refresh, 60000);
  timer.unref();
  return { refresh, get: () => name || os.hostname() };
}

async function main() {
  const loaded = loadEnvFile(paths.envFile);
  log(`starting (data ${paths.dataDir}, config ${loaded ? "server.env" : "environment only"}, node ${process.version})`);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) fatal(`DATABASE_URL is not set; run install-server.ps1 to create ${paths.envFile}`);
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) fatal("AUTH_SECRET is missing or shorter than 32 characters");

  process.env.NODE_ENV = "production";
  process.env.NEXT_TELEMETRY_DISABLED = "1";
  process.env.APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Jakarta";
  process.env.BACKUP_DIR = process.env.BACKUP_DIR || paths.backupsDir;
  // Never create staff accounts on a branch server; admins add their own officers.
  delete process.env.SEED_STAFF_PASSWORD;
  const httpPort = Number(process.env.PORT || 3000);
  process.env.PORT = String(httpPort);
  // HOSTNAME inherited from a shell is the machine name; only BANKNTT_HOSTNAME may change the bind address.
  process.env.HOSTNAME = process.env.BANKNTT_HOSTNAME || "0.0.0.0";

  const pg = paths.appRequire("pg");
  await waitForDatabase(pg, connectionString);

  const { runMigrations } = require("./migrate");
  await runMigrations({ connectionString, migrationsDir: paths.migrationsDir, log: (line) => log(`migrate: ${line}`), pg });

  if (process.env.BANKNTT_SKIP_SEED === "1") log("seed skipped (BANKNTT_SKIP_SEED=1)");
  else {
    try {
      await runSeed({ ...process.env });
      log("seed done");
    } catch (error) {
      // An existing database keeps working without the seed; a fresh one needs it for the admin account.
      log(`seed failed: ${error.message}`);
    }
  }

  const version = readVersion();
  const branch = trackBranchName(pg, connectionString);
  await branch.refresh();
  if (process.env.BANKNTT_DISCOVERY !== "0") {
    const { startDiscovery } = require("./discovery");
    try {
      await startDiscovery({
        port: Number(process.env.BANKNTT_DISCOVERY_PORT || 41234),
        httpPort,
        version,
        getName: branch.get,
        log,
      });
    } catch (error) {
      log(`discovery disabled: ${error.message}`);
    }
  }

  log(`starting web server ${version} on ${process.env.HOSTNAME}:${httpPort}`);
  process.off("uncaughtException", onUncaught);
  process.off("unhandledRejection", onUnhandled);
  require(path.join(paths.appDir, "server.js"));
}

main().catch((error) => fatal(error && error.stack ? error.stack : String(error)));
