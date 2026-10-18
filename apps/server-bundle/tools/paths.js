"use strict";
// Shared locations of the Windows server bundle.
//
//   <installDir>\server\            program files, replaced on every update (read-only at runtime)
//     node.exe, app\, pgsql\, tools\, migrations\, scripts\
//   C:\ProgramData\BankNTT\         data, survives updates and uninstall
//     server.env, pgdata\, logs\, backups\
//
// BANKNTT_DATA_DIR overrides the data folder (used by local tests on macOS).

const path = require("node:path");
const { createRequire } = require("node:module");

const serverDir = path.resolve(__dirname, "..");
const appDir = path.join(serverDir, "app");
const migrationsDir = path.join(serverDir, "migrations");
const pgBinDir = path.join(serverDir, "pgsql", "bin");

function defaultDataDir() {
  if (process.env.BANKNTT_DATA_DIR) return path.resolve(process.env.BANKNTT_DATA_DIR);
  const programData = process.env.ProgramData || process.env.PROGRAMDATA || "C:\\ProgramData";
  return path.join(programData, "BankNTT");
}

const dataDir = defaultDataDir();

/** Resolves packages (pg, argon2, ...) from the Next.js standalone node_modules in app\. */
const appRequire = createRequire(path.join(appDir, "package.json"));

function pgTool(name) {
  return path.join(pgBinDir, process.platform === "win32" ? `${name}.exe` : name);
}

module.exports = {
  serverDir,
  appDir,
  migrationsDir,
  pgBinDir,
  dataDir,
  envFile: path.join(dataDir, "server.env"),
  logsDir: path.join(dataDir, "logs"),
  backupsDir: path.join(dataDir, "backups"),
  appRequire,
  pgTool,
};
