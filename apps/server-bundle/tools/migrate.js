"use strict";
// Applies prisma/migrations/*/migration.sql without the Prisma CLI or schema engine.
//
// Bookkeeping is identical to `prisma migrate deploy`: same _prisma_migrations table, checksum =
// sha256 hex of the migration.sql bytes, applied_steps_count = 1, logs NULL on success. A later
// `prisma migrate deploy` / `prisma migrate status` therefore sees these migrations as applied.
// Differences: each migration runs inside its own transaction (all-or-nothing), so a failed
// migration leaves no half-applied schema and no failed row behind.
//
//   node tools/migrate.js              (DATABASE_URL from env or C:\ProgramData\BankNTT\server.env)
//   node tools/migrate.js --status     list applied/pending, change nothing

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// Same advisory lock key Prisma Migrate uses, so the two never run at the same time.
const PRISMA_ADVISORY_LOCK = 72707369;

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum"              VARCHAR(64) NOT NULL,
    "finished_at"           TIMESTAMPTZ,
    "migration_name"        VARCHAR(255) NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        TIMESTAMPTZ,
    "started_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count"   INTEGER NOT NULL DEFAULT 0
)`;

/** Migration folders sorted by name (Prisma names them <timestamp>_<name>). */
function listMigrations(migrationsDir) {
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(migrationsDir, entry.name, "migration.sql")))
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const bytes = fs.readFileSync(path.join(migrationsDir, name, "migration.sql"));
      return {
        name,
        sql: bytes.toString("utf8"),
        checksum: crypto.createHash("sha256").update(bytes).digest("hex"),
      };
    });
}

/**
 * @param {object} options
 * @param {string} options.connectionString
 * @param {string} options.migrationsDir
 * @param {(line: string) => void} [options.log]
 * @param {boolean} [options.dryRun] only report, apply nothing
 * @param {object} [options.pg] the `pg` module (resolved from app\node_modules by default)
 * @returns {Promise<{ applied: string[], pending: string[] }>}
 */
async function runMigrations(options) {
  const log = options.log || ((line) => console.log(line));
  const pg = options.pg || require("./paths").appRequire("pg");
  const migrations = listMigrations(options.migrationsDir);
  const client = new pg.Client({ connectionString: options.connectionString, application_name: "bankntt-migrate" });
  await client.connect();
  const applied = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [PRISMA_ADVISORY_LOCK]);
    try {
      if (!options.dryRun) await client.query(CREATE_TABLE_SQL);
      const exists = await client.query("SELECT to_regclass('_prisma_migrations') IS NOT NULL AS ok");
      const rows = exists.rows[0].ok
        ? (
            await client.query(
              `SELECT migration_name, checksum, finished_at, rolled_back_at
                 FROM "_prisma_migrations" ORDER BY started_at`,
            )
          ).rows
        : [];

      // Same rule as Prisma (P3009): a failed, not rolled back migration blocks everything.
      const failed = rows.filter((row) => row.finished_at === null && row.rolled_back_at === null);
      if (failed.length > 0) {
        throw new Error(
          `Migration ${failed.map((row) => row.migration_name).join(", ")} failed earlier and is not resolved. ` +
            "Fix the database, then mark it with `prisma migrate resolve`.",
        );
      }

      const done = new Map();
      for (const row of rows) {
        if (row.finished_at !== null && row.rolled_back_at === null) done.set(row.migration_name, row.checksum);
      }
      const known = new Set(migrations.map((migration) => migration.name));
      for (const name of done.keys()) {
        if (!known.has(name)) log(`warning: migration ${name} is in the database but not in this bundle`);
      }

      const pending = [];
      for (const migration of migrations) {
        const checksum = done.get(migration.name);
        if (checksum === undefined) pending.push(migration);
        else if (checksum !== migration.checksum) {
          log(`warning: migration ${migration.name} was modified after it was applied (checksum differs)`);
        }
      }

      if (options.dryRun) {
        return { applied, pending: pending.map((migration) => migration.name) };
      }
      if (pending.length === 0) {
        log(`database is up to date (${migrations.length} migrations)`);
        return { applied, pending: [] };
      }

      for (const migration of pending) {
        const started = Date.now();
        log(`applying migration ${migration.name}`);
        const id = crypto.randomUUID();
        await client.query("BEGIN");
        try {
          await client.query(
            `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, applied_steps_count)
             VALUES ($1, $2, $3, now(), 0)`,
            [id, migration.checksum, migration.name],
          );
          // No parameters: pg uses the simple query protocol, which accepts multiple statements.
          await client.query(migration.sql);
          await client.query(
            `UPDATE "_prisma_migrations" SET finished_at = clock_timestamp(), applied_steps_count = 1 WHERE id = $1`,
            [id],
          );
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK").catch(() => undefined);
          const message = error && error.message ? error.message : String(error);
          throw new Error(`migration ${migration.name} failed and was rolled back: ${message}`);
        }
        applied.push(migration.name);
        log(`applied ${migration.name} in ${Date.now() - started} ms`);
      }
      return { applied, pending: [] };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [PRISMA_ADVISORY_LOCK]).catch(() => undefined);
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

module.exports = { runMigrations, listMigrations, PRISMA_ADVISORY_LOCK };

if (require.main === module) {
  const paths = require("./paths");
  require("./env-file").loadEnvFile(paths.envFile);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set (env or server.env)");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--status");
  const migrationsDir = process.env.BANKNTT_MIGRATIONS_DIR || paths.migrationsDir;
  runMigrations({ connectionString, migrationsDir, dryRun })
    .then((result) => {
      if (dryRun) {
        console.log(result.pending.length ? `pending: ${result.pending.join(", ")}` : "database is up to date");
      }
    })
    .catch((error) => {
      console.error(error && error.message ? error.message : error);
      process.exit(1);
    });
}
