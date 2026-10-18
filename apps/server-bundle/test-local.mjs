#!/usr/bin/env node
// Local (macOS/Linux) checks of the server bundle logic that does not need Windows:
//
//   node apps/server-bundle/test-local.mjs [--keep]
//
// Needs a local PostgreSQL reachable as PGHOST/PGUSER (default 127.0.0.1, current user) and a built
// apps/server-bundle/dist/server. Creates throwaway databases queue_bundle_t1/t2 and drops them at the
// end (--keep leaves them). Never touches any other database. Uses port 3199, never 3000.
//
//   1. migrate.js on an empty DB -> schema identical to `prisma migrate deploy`, status up to date
//   2. upgrade: Prisma applied part, migrate.js applies the rest; a failing migration rolls back
//   3. seed.cjs (from a temp copy with the host argon2 prebuild) creates admin, services, settings
//   4. launcher.js end to end on port 3199 with a read-only app folder: health, login page, discovery
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const bundleRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(bundleRoot, "..", "..");
const dist = path.join(bundleRoot, "dist", "server");
const keep = process.argv.includes("--keep");
const host = process.env.PGHOST || "127.0.0.1";
const user = process.env.PGUSER || os.userInfo().username;
const FORBIDDEN = new Set(["queue", "queue_dev", "queue_e2e"]);
const urlFor = (db) => {
  if (FORBIDDEN.has(db) || !db.startsWith("queue_bundle_")) throw new Error(`refusing to use database ${db}`);
  return `postgresql://${user}@${host}:5432/${db}`;
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bankntt-bundle-"));
let failures = 0;

function check(condition, message) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${message}`);
  if (!condition) failures += 1;
}

function sh(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"], ...options });
}

function psql(db, sql) {
  return sh("psql", ["-h", host, "-U", user, "-d", db, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql]).trim();
}

function recreate(db) {
  urlFor(db);
  spawnSync("dropdb", ["-h", host, "-U", user, "--if-exists", db]);
  sh("createdb", ["-h", host, "-U", user, db]);
}

function prisma(args, db, migrationsDir) {
  const config = path.join(tmp, `prisma-${db}.config.mjs`);
  fs.writeFileSync(
    config,
    `export default ${JSON.stringify({
      schema: path.join(repoRoot, "prisma", "schema.prisma"),
      migrations: { path: migrationsDir || path.join(repoRoot, "prisma", "migrations") },
      datasource: { url: urlFor(db) },
    })};\n`,
  );
  const result = spawnSync(path.join(repoRoot, "node_modules", ".bin", "prisma"), [...args, "--config", config], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function migrate(db, extraEnv = {}) {
  return spawnSync(process.execPath, [path.join(dist, "tools", "migrate.js")], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: urlFor(db), BANKNTT_DATA_DIR: path.join(tmp, "data"), ...extraEnv },
  });
}

function schemaDump(db) {
  return sh("pg_dump", ["-h", host, "-U", user, "-s", "-O", "-x", db])
    .split("\n")
    .filter((line) => !line.startsWith("\\restrict") && !line.startsWith("\\unrestrict") && !line.startsWith("--"))
    .join("\n");
}

/** Copy of dist/server whose argon2 has the host prebuild instead of win32-x64 (local test only). */
function hostCopy() {
  const copy = path.join(tmp, "server");
  fs.cpSync(dist, copy, { recursive: true, filter: (src) => !/[\\/]pgsql$|\.exe$/.test(src) });
  const target = path.join(copy, "app", "node_modules", "argon2", "prebuilds");
  const hostPrebuild = `${process.platform}-${process.arch}`;
  fs.cpSync(path.join(repoRoot, "node_modules", "argon2", "prebuilds", hostPrebuild), path.join(target, hostPrebuild), { recursive: true });
  return copy;
}

async function waitFor(url, seconds) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

function discover(port, extra = []) {
  return spawnSync(process.execPath, [path.join(dist, "tools", "discover-test.mjs"), "127.0.0.1", String(port), ...extra], {
    encoding: "utf8",
  });
}

async function main() {
  if (!fs.existsSync(path.join(dist, "tools", "migrate.js"))) throw new Error("build the bundle first: npm run server:bundle");

  // 1. fresh database
  recreate("queue_bundle_t1");
  recreate("queue_bundle_t2");
  let result = migrate("queue_bundle_t1");
  check(result.status === 0, `migrate.js applies all migrations on an empty database\n${result.stdout}${result.stderr}`.trim());
  result = migrate("queue_bundle_t1");
  check(result.status === 0 && /up to date/.test(result.stdout), "migrate.js is a no-op on the second run");
  const status = prisma(["migrate", "status"], "queue_bundle_t1");
  check(status.status === 0 && /Database schema is up to date/.test(status.output), "prisma migrate status: up to date");
  const deploy = prisma(["migrate", "deploy"], "queue_bundle_t1");
  check(/No pending migrations/.test(deploy.output), "prisma migrate deploy: no pending migrations");
  prisma(["migrate", "deploy"], "queue_bundle_t2");
  check(schemaDump("queue_bundle_t1") === schemaDump("queue_bundle_t2"), "schema identical to a database migrated by Prisma");
  const rowsOurs = psql("queue_bundle_t1", "SELECT migration_name, checksum, applied_steps_count, logs IS NULL FROM _prisma_migrations ORDER BY 1");
  const rowsPrisma = psql("queue_bundle_t2", "SELECT migration_name, checksum, applied_steps_count, logs IS NULL FROM _prisma_migrations ORDER BY 1");
  check(rowsOurs === rowsPrisma, "_prisma_migrations rows (name, checksum, steps, logs) identical to Prisma's");

  // 2. upgrade from a Prisma-migrated database with fewer migrations, then a failing migration
  recreate("queue_bundle_t2");
  const partial = path.join(tmp, "migrations-partial");
  const all = fs.readdirSync(path.join(repoRoot, "prisma", "migrations")).sort();
  fs.mkdirSync(partial);
  for (const name of all.filter((entry) => entry !== "migration_lock.toml").slice(0, 2).concat("migration_lock.toml")) {
    fs.cpSync(path.join(repoRoot, "prisma", "migrations", name), path.join(partial, name), { recursive: true });
  }
  prisma(["migrate", "deploy"], "queue_bundle_t2", partial);
  result = migrate("queue_bundle_t2");
  const appliedNow = (result.stdout.match(/^applied /gm) || []).length;
  check(result.status === 0 && appliedNow === all.length - 3, `upgrade applies only the ${all.length - 3} missing migrations`);
  const bad = path.join(tmp, "migrations-bad");
  fs.cpSync(path.join(repoRoot, "prisma", "migrations"), bad, { recursive: true });
  fs.mkdirSync(path.join(bad, "29991231000000_broken"));
  fs.writeFileSync(path.join(bad, "29991231000000_broken", "migration.sql"), "CREATE TABLE should_vanish (id int);\nSELECT * FROM no_such_table;\n");
  result = migrate("queue_bundle_t2", { BANKNTT_MIGRATIONS_DIR: bad });
  check(result.status === 1 && /rolled back/.test(result.stderr), "failing migration exits 1 and reports rollback");
  check(psql("queue_bundle_t2", "SELECT to_regclass('should_vanish') IS NULL") === "t", "failing migration left no table behind");
  check(
    psql("queue_bundle_t2", "SELECT count(*) FROM _prisma_migrations WHERE migration_name = '29991231000000_broken'") === "0",
    "failing migration left no _prisma_migrations row",
  );
  check(prisma(["migrate", "status"], "queue_bundle_t2").status === 0, "prisma migrate status still clean after the failure");

  // 3. seed bundle
  const server = hostCopy();
  const seedEnv = { ...process.env, DATABASE_URL: urlFor("queue_bundle_t1"), SEED_ADMIN_PASSWORD: "Password123", SEED_STAFF_PASSWORD: "" };
  result = spawnSync(process.execPath, [path.join(server, "tools", "seed.cjs")], { encoding: "utf8", env: seedEnv, cwd: tmp });
  check(result.status === 0, `seed.cjs runs\n${result.stderr}`.trim());
  result = spawnSync(process.execPath, [path.join(server, "tools", "seed.cjs")], { encoding: "utf8", env: seedEnv, cwd: tmp });
  check(result.status === 0, "seed.cjs is idempotent (second run)");
  check(psql("queue_bundle_t1", "SELECT string_agg(username || ':' || role, ',' ORDER BY username) FROM users") === "admin:ADMIN", "only the admin account exists (no staff)");
  check(psql("queue_bundle_t1", "SELECT count(*) FROM services") === "2", "two services seeded");
  check(psql("queue_bundle_t1", "SELECT count(*) FROM counters") === "4", "four counters seeded");
  check(psql("queue_bundle_t1", "SELECT value #>> '{}' FROM settings WHERE key = 'branch_name'") === "Bank NTT", "branch_name setting seeded");
  check(psql("queue_bundle_t1", "SELECT password_hash LIKE '$argon2%' FROM users WHERE username = 'admin'") === "t", "admin password is an argon2 hash");

  // 4. launcher end to end (fresh database, read-only app folder, port 3199)
  recreate("queue_bundle_t2");
  const dataDir = path.join(tmp, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, "server.env"),
    [
      "# test",
      `DATABASE_URL=${urlFor("queue_bundle_t2")}`,
      `AUTH_SECRET=${"ab".repeat(32)}`,
      "PORT=3199",
      "SEED_ADMIN_PASSWORD=Password123",
      "SEED_ORG_NAME=Cabang Uji",
      "",
    ].join("\n"),
  );
  spawnSync("chmod", ["-R", "a-w", path.join(server, "app")]);
  const env = { ...process.env, BANKNTT_DATA_DIR: dataDir, BANKNTT_DISCOVERY_PORT: "41299", HOSTNAME: "my-mac.local" };
  for (const key of ["DATABASE_URL", "AUTH_SECRET", "PORT", "NODE_ENV"]) delete env[key];
  const child = spawn(process.execPath, [path.join(server, "tools", "launcher.js")], { env, stdio: "ignore" });
  try {
    const health = await waitFor("http://127.0.0.1:3199/api/health", 90);
    check(Boolean(health), "launcher: migrations + seed + server, /api/health answers on 3199");
    if (health) {
      const login = await fetch("http://127.0.0.1:3199/login");
      const html = await login.text();
      check(login.status === 200 && html.includes("/_next/static/"), "login page renders with static assets");
      const asset = /\/_next\/static\/[^"']+\.css/.exec(html);
      if (asset) check((await fetch(`http://127.0.0.1:3199${asset[0]}`)).status === 200, `static asset served (${asset[0]})`);
      check((await fetch("http://127.0.0.1:3199/kiosk")).status < 500, "kiosk page does not error");
      result = discover(41299, ["--bad"]);
      const replies = result.stdout.split("\n").filter((line) => line.startsWith("server "));
      check(result.status === 0 && replies.length === 1, `discovery answers exactly once and ignores bad datagrams\n${result.stdout}`.trim());
      check(/"name":"Cabang Uji"/.test(result.stdout) && /"port":3199/.test(result.stdout), "discovery reply carries branch name and port");
      // Rate limit: 30 requests in a burst get at most ~10 replies.
      const burst = spawnSync(
        process.execPath,
        [
          "-e",
          `const d=require("node:dgram");const s=d.createSocket("udp4");let n=0;s.on("message",()=>n++);
           s.bind(0,()=>{for(let i=0;i<30;i++)s.send('{"type":"bankntt-discover","v":1}',41299,"127.0.0.1");
           setTimeout(()=>{console.log(n);s.close()},800)});`,
        ],
        { encoding: "utf8" },
      );
      const count = Number(burst.stdout.trim());
      check(count >= 1 && count <= 11, `discovery rate limit (${count} replies to 30 requests)`);
      const log = fs.readFileSync(path.join(dataDir, "logs", "server.log"), "utf8");
      check(/\[launcher\] starting web server/.test(log) && /seed done/.test(log), "server.log written by the launcher");
      check(!/EACCES|EROFS|permission denied/i.test(log), "no write errors with a read-only app folder");
    }
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    spawnSync("chmod", ["-R", "u+w", path.join(server, "app")]);
  }

  if (!keep) {
    for (const db of ["queue_bundle_t1", "queue_bundle_t2"]) spawnSync("dropdb", ["-h", host, "-U", user, "--if-exists", db]);
    fs.rmSync(tmp, { recursive: true, force: true });
  } else console.log(`kept ${tmp} and databases queue_bundle_t1/t2`);
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
