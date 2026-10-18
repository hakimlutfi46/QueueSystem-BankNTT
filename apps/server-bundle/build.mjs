#!/usr/bin/env node
// Builds the offline Windows x64 server bundle on macOS/Linux:
//
//   npm run server:bundle                 full build
//   npm run server:bundle -- --skip-next  reuse the last Next.js build in .next-bundle/
//
// Output: apps/server-bundle/dist/server/ (see README.md for the layout and the installer contract).
// Downloads (Node.js, PostgreSQL, VC++ runtime, WinSW) are cached in apps/server-bundle/.cache/, so
// a rebuild works offline once the cache is filled.
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const bundleRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(bundleRoot, "..", "..");
const cacheDir = process.env.BUNDLE_CACHE_DIR ? path.resolve(process.env.BUNDLE_CACHE_DIR) : path.join(bundleRoot, ".cache");
const outDir = path.join(bundleRoot, "dist", "server");
const appOut = path.join(outDir, "app");
// Separate dist dir so the build never touches .next of a running `npm run dev`.
const NEXT_DIST_DIR = ".next-bundle";
const nextDist = path.join(repoRoot, NEXT_DIST_DIR);

const args = new Set(process.argv.slice(2));
const skipNext = args.has("--skip-next");

// Pinned runtime downloads. Update version + sha256 together.
const NODE = {
  version: process.env.BUNDLE_NODE_VERSION || "24.22.0",
  // sha256 is checked against the official SHASUMS256.txt (cached next to the zip).
};
const POSTGRES = {
  version: "16.15-1",
  url: "https://get.enterprisedb.com/postgresql/postgresql-16.15-1-windows-x64-binaries.zip",
  file: "postgresql-16.15-1-windows-x64-binaries.zip",
  sha256: null,
};
const WINSW = {
  version: "2.12.0",
  // .NET Framework 4.6.1 build: Windows 10 ships .NET Framework 4.8, so this 0.6 MB exe needs nothing
  // extra (the self-contained WinSW-x64.exe is ~17 MB for the same features).
  url: "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW.NET461.exe",
  file: "WinSW.NET461-2.12.0.exe",
  sha256: null,
};
const VCREDIST = {
  // Microsoft only publishes the evergreen link; the cached file is reused and its hash recorded.
  url: "https://aka.ms/vs/17/release/vc_redist.x64.exe",
  file: "vc_redist.x64.exe",
};

const PG_BIN_KEEP = new Set([
  "postgres.exe",
  "initdb.exe",
  "pg_ctl.exe",
  "psql.exe",
  "pg_dump.exe",
  "pg_restore.exe",
  "pg_isready.exe",
  "pg_controldata.exe",
]);

// ---------------------------------------------------------------------------------------------

function step(message) {
  console.log(`\n==> ${message}`);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { stdio: "inherit", cwd: repoRoot, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(" ")} exited with ${result.status}`);
}

function sha256File(file) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buffer = Buffer.alloc(1024 * 1024);
  try {
    for (;;) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (read === 0) break;
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else if (entry.isFile()) total += fs.statSync(full).size;
  }
  return total;
}

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    visit(full, entry);
    if (entry.isDirectory()) walk(full, visit);
  }
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function download(url, target) {
  if (fs.existsSync(target)) return target;
  console.log(`    downloading ${url}`);
  const partialFile = `${target}.partial`;
  // curl resumes interrupted downloads of large files (PostgreSQL is ~330 MB); fetch is the fallback.
  const curl = spawnSync(
    "curl",
    ["-fL", "--retry", "5", "--retry-all-errors", "--retry-delay", "3", "-C", "-", "-sS", "-o", partialFile, url],
    { stdio: "inherit" },
  );
  if (!curl.error && curl.status === 0) {
    fs.renameSync(partialFile, target);
    return target;
  }
  if (!curl.error) {
    throw new Error(
      `curl failed with ${curl.status}: ${url}\n` +
        `  Without internet access, download it elsewhere and place it at ${target}`,
    );
  }
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`download failed ${response.status} ${response.statusText}: ${url}`);
  const partial = `${target}.partial`;
  const out = fs.createWriteStream(partial);
  const reader = response.body.getReader();
  let received = 0;
  let lastReport = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (!out.write(value)) await new Promise((resolve) => out.once("drain", resolve));
    if (received - lastReport > 50 * 1024 * 1024) {
      lastReport = received;
      console.log(`    ${mb(received)}`);
    }
  }
  await new Promise((resolve, reject) => out.end((error) => (error ? reject(error) : resolve())));
  fs.renameSync(partial, target);
  return target;
}

/** Verifies a pinned hash, or pins on first download (trust on first use) in <file>.sha256. */
function verifyHash(file, expected, label) {
  const actual = sha256File(file);
  const sidecar = `${file}.sha256`;
  if (expected) {
    if (actual !== expected) throw new Error(`${label}: sha256 mismatch\n  expected ${expected}\n  actual   ${actual}`);
  } else if (fs.existsSync(sidecar)) {
    const pinned = fs.readFileSync(sidecar, "utf8").trim();
    if (pinned !== actual) throw new Error(`${label}: cached file changed (sha256 ${actual}, pinned ${pinned})`);
  } else {
    fs.writeFileSync(sidecar, `${actual}\n`);
    console.log(`    ${label}: no published hash, pinned ${actual}`);
  }
  return actual;
}

function assertPortableExecutable(file) {
  const fd = fs.openSync(file, "r");
  const head = Buffer.alloc(2);
  fs.readSync(fd, head, 0, 2, 0);
  fs.closeSync(fd);
  if (head.toString("latin1") !== "MZ") throw new Error(`${file} is not a Windows executable`);
}

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, dereference: false, verbatimSymlinks: true });
}

/** PowerShell 5.1 reads BOM-less scripts as ANSI: keep them ASCII and use CRLF for Notepad. */
function copyWindowsText(from, to) {
  const text = fs.readFileSync(from, "utf8");
  const nonAscii = [...text].findIndex((char) => char.charCodeAt(0) > 127);
  if (nonAscii !== -1) throw new Error(`${from} contains non-ASCII text at offset ${nonAscii}`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, text.replace(/\r?\n/g, "\r\n"));
}

function gitCommit() {
  try {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: repoRoot, encoding: "utf8" }).trim();
    return dirty ? `${commit}-dirty` : commit;
  } catch {
    return "unknown";
  }
}

// ---------------------------------------------------------------------------------------------

async function buildNext() {
  step("prisma generate");
  run(path.join(repoRoot, "node_modules", ".bin", "prisma"), ["generate"]);

  if (skipNext && fs.existsSync(path.join(nextDist, "standalone", "server.js"))) {
    step(`next build skipped (--skip-next), reusing ${NEXT_DIST_DIR}/`);
    return;
  }
  step(`next build (distDir ${NEXT_DIST_DIR})`);
  const env = { ...process.env, NEXT_DIST_DIR, NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "production" };
  run(path.join(repoRoot, "node_modules", ".bin", "next"), ["build"], { env });
}

function assembleApp() {
  step("assemble standalone app");
  const standalone = path.join(nextDist, "standalone");
  if (!fs.existsSync(path.join(standalone, "server.js"))) throw new Error(`missing ${standalone}/server.js`);
  copy(standalone, appOut);
  copy(path.join(nextDist, "static"), path.join(appOut, NEXT_DIST_DIR, "static"));
  copy(path.join(repoRoot, "public"), path.join(appOut, "public"));

  // The standalone package.json is a copy of the repo one (scripts, devDependencies); keep only identity.
  const rootPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  fs.writeFileSync(
    path.join(appOut, "package.json"),
    `${JSON.stringify({ name: rootPackage.name, version: rootPackage.version, private: true }, null, 2)}\n`,
  );

  // Never ship secrets: Next.js copies the repo's .env files into standalone.
  walk(appOut, (full, entry) => {
    if (entry.isFile() && /^\.env/.test(entry.name)) fs.rmSync(full);
  });
}

/**
 * Turbopack links server externals as <distDir>/node_modules/<name>-<hash> -> ../../node_modules/<name>.
 * Symlinks do not survive the Windows installer, so point the chunks at the plain package names
 * (resolved from app/node_modules, the same target the symlinks had) and drop the links.
 */
function replaceExternalSymlinks() {
  step("replace Turbopack external symlinks");
  const linkRoot = path.join(appOut, NEXT_DIST_DIR, "node_modules");
  if (!fs.existsSync(linkRoot)) return;
  const renames = new Map();
  walk(linkRoot, (full, entry) => {
    if (!entry.isSymbolicLink()) return;
    const hashed = path.relative(linkRoot, full).split(path.sep).join("/");
    const match = /^(.+)-[0-9a-f]{16}$/.exec(hashed);
    if (!match) throw new Error(`unexpected external link ${hashed}`);
    const target = path.resolve(path.dirname(full), fs.readlinkSync(full));
    const expected = path.join(appOut, "node_modules", match[1]);
    if (target !== expected) throw new Error(`external ${hashed} points to ${target}, expected ${expected}`);
    renames.set(hashed, match[1]);
  });
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const pattern = new RegExp(`(["'\`])(${[...renames.keys()].map(escape).join("|")})(?=["'\`/])`, "g");
  let files = 0;
  walk(path.join(appOut, NEXT_DIST_DIR), (full, entry) => {
    if (!entry.isFile() || !/\.(c?js|mjs|json)$/.test(entry.name)) return;
    const text = fs.readFileSync(full, "utf8");
    const next = text.replace(pattern, (_, quote, name) => `${quote}${renames.get(name)}`);
    if (next !== text) {
      fs.writeFileSync(full, next);
      files += 1;
    }
  });
  fs.rmSync(linkRoot, { recursive: true, force: true });
  console.log(`    ${renames.size} externals (${[...renames.values()].join(", ")}) rewritten in ${files} files`);
}

function fixNativeModules() {
  step("native modules for win32-x64");
  // argon2: keep only the Windows prebuild, copied from the repo's full package.
  const prebuilds = path.join(appOut, "node_modules", "argon2", "prebuilds");
  fs.rmSync(prebuilds, { recursive: true, force: true });
  copy(path.join(repoRoot, "node_modules", "argon2", "prebuilds", "win32-x64"), path.join(prebuilds, "win32-x64"));
  for (const file of fs.readdirSync(path.join(prebuilds, "win32-x64"))) {
    if (file.endsWith(".node")) assertPortableExecutable(path.join(prebuilds, "win32-x64", file));
  }
  // sharp is only used by next/image optimisation (/_next/image), which this app does not use. Next.js
  // requires it lazily, so removing it saves ~19 MB of macOS binaries and a Windows download.
  for (const name of ["sharp", "@img"]) fs.rmSync(path.join(appOut, "node_modules", name), { recursive: true, force: true });
}

async function bundleSeed() {
  step("bundle prisma/seed.ts -> tools/seed.cjs");
  const esbuild = await import("esbuild");
  // @prisma/adapter-pg is bundled too: Next.js traces only its ESM entry, which require() cannot load.
  const external = ["pg", "argon2"];
  const appDeps = {
    name: "app-deps",
    setup(build) {
      // dotenv/config would read a .env from the working directory; the launcher passes the env instead.
      build.onResolve({ filter: /^dotenv(\/config)?$/ }, () => ({ path: "dotenv", namespace: "empty" }));
      build.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "", loader: "js" }));
      // Native/driver packages come from app\node_modules (same copies the web server uses).
      const filter = new RegExp(`^(${external.map((name) => name.replace(/[/]/g, "\\/")).join("|")})$`);
      build.onResolve({ filter }, (resolveArgs) => ({ path: resolveArgs.path, namespace: "app-dep" }));
      build.onLoad({ filter: /.*/, namespace: "app-dep" }, (loadArgs) => ({
        contents: `module.exports = __appRequire(${JSON.stringify(loadArgs.path)});`,
        loader: "js",
      }));
    },
  };
  await esbuild.build({
    entryPoints: [path.join(repoRoot, "prisma", "seed.ts")],
    outfile: path.join(outDir, "tools", "seed.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    logLevel: "warning",
    legalComments: "none",
    tsconfig: path.join(repoRoot, "tsconfig.json"),
    plugins: [appDeps],
    define: { "import.meta.url": "__importMetaUrl" },
    banner: {
      js: [
        "// Generated by apps/server-bundle/build.mjs from prisma/seed.ts. Do not edit.",
        'const __importMetaUrl = require("node:url").pathToFileURL(__filename).href;',
        'const __appRequire = require("node:module").createRequire(require("node:path").join(__dirname, "..", "app", "package.json"));',
      ].join("\n"),
    },
  });
}

function copyTools() {
  step("tools, migrations and Windows scripts");
  const toolsSrc = path.join(bundleRoot, "tools");
  for (const name of fs.readdirSync(toolsSrc)) {
    if (/\.(c?js|mjs)$/.test(name)) copy(path.join(toolsSrc, name), path.join(outDir, "tools", name));
  }
  const migrationsSrc = path.join(repoRoot, "prisma", "migrations");
  for (const entry of fs.readdirSync(migrationsSrc, { withFileTypes: true })) {
    copy(path.join(migrationsSrc, entry.name), path.join(outDir, "migrations", entry.name));
  }
  const windowsSrc = path.join(bundleRoot, "windows");
  for (const name of fs.readdirSync(windowsSrc)) {
    copyWindowsText(path.join(windowsSrc, name), path.join(outDir, name));
  }
}

async function addNode() {
  step(`Node.js ${NODE.version} win-x64`);
  const name = `node-v${NODE.version}-win-x64`;
  const zip = await download(`https://nodejs.org/dist/v${NODE.version}/${name}.zip`, path.join(cacheDir, `${name}.zip`));
  const sums = await download(
    `https://nodejs.org/dist/v${NODE.version}/SHASUMS256.txt`,
    path.join(cacheDir, `node-v${NODE.version}-SHASUMS256.txt`),
  );
  const line = fs
    .readFileSync(sums, "utf8")
    .split("\n")
    .find((entry) => entry.trim().endsWith(`  ${name}.zip`));
  if (!line) throw new Error(`${name}.zip not listed in SHASUMS256.txt`);
  const sha256 = verifyHash(zip, line.split(/\s+/)[0], `${name}.zip`);
  execFileSync("unzip", ["-q", "-o", "-j", zip, `${name}/node.exe`, `${name}/LICENSE`, "-d", path.join(cacheDir, name)]);
  copy(path.join(cacheDir, name, "node.exe"), path.join(outDir, "node.exe"));
  copy(path.join(cacheDir, name, "LICENSE"), path.join(outDir, "licenses", "node-LICENSE.txt"));
  assertPortableExecutable(path.join(outDir, "node.exe"));
  return { version: NODE.version, sha256 };
}

async function addPostgres() {
  step(`PostgreSQL ${POSTGRES.version} win-x64 (trimmed)`);
  const zip = await download(POSTGRES.url, path.join(cacheDir, POSTGRES.file));
  const sha256 = verifyHash(zip, POSTGRES.sha256, POSTGRES.file);
  const extracted = path.join(cacheDir, `pgsql-${POSTGRES.version}`);
  if (!fs.existsSync(path.join(extracted, ".complete"))) {
    fs.rmSync(extracted, { recursive: true, force: true });
    fs.mkdirSync(extracted, { recursive: true });
    // Only bin, lib and share are extracted; pgAdmin 4, StackBuilder, docs, headers and symbols are skipped.
    execFileSync("unzip", ["-q", zip, "pgsql/bin/*", "pgsql/lib/*", "pgsql/share/*", "-d", extracted]);
    fs.writeFileSync(path.join(extracted, ".complete"), "");
  }
  const source = path.join(extracted, "pgsql");
  const target = path.join(outDir, "pgsql");
  fs.mkdirSync(path.join(target, "bin"), { recursive: true });
  for (const file of fs.readdirSync(path.join(source, "bin"))) {
    const lower = file.toLowerCase();
    if (PG_BIN_KEEP.has(lower) || lower.endsWith(".dll")) copy(path.join(source, "bin", file), path.join(target, "bin", file));
  }
  for (const exe of PG_BIN_KEEP) {
    if (!fs.existsSync(path.join(target, "bin", exe))) throw new Error(`pgsql/bin/${exe} missing from ${POSTGRES.file}`);
  }
  // lib: runtime extension DLLs only (no import .lib, static .a, or debug symbols).
  copy(path.join(source, "lib"), path.join(target, "lib"));
  copy(path.join(source, "share"), path.join(target, "share"));
  fs.rmSync(path.join(target, "share", "locale"), { recursive: true, force: true }); // message translations
  fs.rmSync(path.join(target, "share", "doc"), { recursive: true, force: true });
  walk(target, (full, entry) => {
    if (entry.isFile() && /\.(pdb|lib|a|pc)$/i.test(entry.name)) fs.rmSync(full);
  });
  for (const dir of [path.join(target, "lib", "pkgconfig"), path.join(target, "lib", "pgxs")]) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return { version: POSTGRES.version, sha256 };
}

async function addVcRedist() {
  step("Visual C++ 2015-2022 x64 runtime");
  const file = await download(VCREDIST.url, path.join(cacheDir, VCREDIST.file));
  assertPortableExecutable(file);
  const sha256 = verifyHash(file, null, VCREDIST.file);
  copy(file, path.join(outDir, "vc_redist.x64.exe"));
  return { sha256 };
}

async function addWinSW() {
  step(`WinSW ${WINSW.version} (service wrapper)`);
  const file = await download(WINSW.url, path.join(cacheDir, WINSW.file));
  assertPortableExecutable(file);
  const sha256 = verifyHash(file, WINSW.sha256, WINSW.file);
  // WinSW reads <exe name>.xml next to the exe; the XML comes from windows/BankNTT-Server.xml.
  copy(file, path.join(outDir, "BankNTT-Server.exe"));
  return { version: WINSW.version, sha256 };
}

function verifyBundle() {
  step("verify bundle");
  const problems = [];
  walk(outDir, (full, entry) => {
    const rel = path.relative(outDir, full);
    if (entry.isSymbolicLink()) problems.push(`symlink: ${rel}`);
    if (/^\.env/.test(entry.name)) problems.push(`env file: ${rel}`);
    if (entry.isFile() && /\.(node|dylib|so)$/.test(entry.name)) {
      const fd = fs.openSync(full, "r");
      const head = Buffer.alloc(4);
      fs.readSync(fd, head, 0, 4, 0);
      fs.closeSync(fd);
      if (head.subarray(0, 2).toString("latin1") !== "MZ") problems.push(`non-Windows binary: ${rel}`);
    }
  });
  for (const required of [
    "node.exe",
    "BankNTT-Server.exe",
    "BankNTT-Server.xml",
    "install-server.ps1",
    "uninstall-server.ps1",
    "status-server.ps1",
    "vc_redist.x64.exe",
    "app/server.js",
    `app/${NEXT_DIST_DIR}/BUILD_ID`,
    "app/node_modules/argon2/prebuilds/win32-x64",
    "pgsql/bin/postgres.exe",
    "tools/launcher.js",
    "tools/seed.cjs",
    "tools/migrate.js",
    "tools/discovery.js",
    "tools/backup.js",
    "migrations/migration_lock.toml",
  ]) {
    if (!fs.existsSync(path.join(outDir, required))) problems.push(`missing: ${required}`);
  }
  // Values of the developer's .env (secrets, dev database URL) must not appear anywhere in the bundle.
  const devEnv = path.join(repoRoot, ".env");
  if (fs.existsSync(devEnv)) {
    const secrets = fs
      .readFileSync(devEnv, "utf8")
      .split(/\r?\n/)
      .map((line) => /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?/.exec(line))
      .filter((match) => match && /SECRET|PASSWORD|TOKEN|DATABASE_URL|KEY/.test(match[1]) && match[2].trim().length >= 8)
      .map((match) => match[2].trim())
      .filter((value) => value !== "Password123");
    const textFile = /\.(c?js|mjs|json|html|txt|xml|ps1|toml|sql|rsc|map|body|meta)$/;
    walk(outDir, (full, entry) => {
      if (!secrets.length || !entry.isFile() || !textFile.test(entry.name) || fs.statSync(full).size > 20 * 1024 * 1024) return;
      const text = fs.readFileSync(full, "utf8");
      if (secrets.some((secret) => text.includes(secret))) problems.push(`value from .env found in ${path.relative(outDir, full)}`);
    });
    console.log(`    scanned for ${secrets.length} secret values from the repo .env`);
  }
  const remaining = JSON.stringify(fs.readdirSync(path.join(appOut, NEXT_DIST_DIR)));
  if (remaining.includes("node_modules")) problems.push(`${NEXT_DIST_DIR}/node_modules still present`);
  if (problems.length) throw new Error(`bundle check failed:\n  ${problems.join("\n  ")}`);
  console.log("    no .env files, no symlinks, no macOS binaries");
}

async function main() {
  const started = Date.now();
  if (Number(process.versions.node.split(".")[0]) < 20) throw new Error("Node.js 20 or newer is required to build");
  fs.mkdirSync(cacheDir, { recursive: true });

  await buildNext();
  fs.rmSync(path.join(bundleRoot, "dist"), { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  assembleApp();
  replaceExternalSymlinks();
  fixNativeModules();
  await bundleSeed();
  copyTools();
  const node = await addNode();
  const postgres = await addPostgres();
  const vcredist = await addVcRedist();
  const winsw = await addWinSW();

  const rootPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const sizes = {};
  for (const part of ["app", "pgsql", "tools", "node.exe", "vc_redist.x64.exe", "BankNTT-Server.exe"]) {
    const full = path.join(outDir, part);
    sizes[part] = fs.statSync(full).isDirectory() ? dirSize(full) : fs.statSync(full).size;
  }
  const manifest = {
    name: "bankntt-server",
    appVersion: rootPackage.version,
    gitCommit: gitCommit(),
    builtAt: new Date().toISOString(),
    platform: "win32-x64",
    nextDistDir: NEXT_DIST_DIR,
    httpPort: 3000,
    discoveryPort: 41234,
    node,
    postgres,
    winsw,
    vcredist,
    next: JSON.parse(fs.readFileSync(path.join(appOut, "node_modules", "next", "package.json"), "utf8")).version,
    migrations: fs
      .readdirSync(path.join(outDir, "migrations"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(),
    sizes,
  };
  fs.writeFileSync(path.join(outDir, "bundle-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  verifyBundle();

  const total = dirSize(outDir);
  step(`done in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  for (const [part, size] of Object.entries(sizes)) console.log(`    ${part.padEnd(20)} ${mb(size)}`);
  console.log(`    ${"total".padEnd(20)} ${mb(total)}  ->  ${path.relative(repoRoot, outDir)}`);
}

main().catch((error) => {
  console.error(`\nserver bundle build failed: ${error && error.message ? error.message : error}`);
  process.exit(1);
});
