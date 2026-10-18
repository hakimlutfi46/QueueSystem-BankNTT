#!/usr/bin/env node
// Builds the Windows x64 NSIS installers of BANK NTT Admin, Loket and TV from this one codebase
// and copies them to <repo>/downloads/ together with downloads/desktop-apps.json.
//
//   npm run apps:build                                        # all three, default names + icon
//   node apps/desktop-client/scripts/build.mjs --app tv
//   node apps/desktop-client/scripts/build.mjs --app all --offline       # no internet: cached Electron zip
//   node apps/desktop-client/scripts/build.mjs --app admin --name "BANK NTT Admin" --icon path/to/icon.png
//
// The role is baked into the packaged package.json (extraMetadata.bankNttRole) together with its
// own package name (install folder), appId, product name, shortcut and icon, so the three apps
// install side by side. Works on macOS, Linux and Windows without wine (resedit edits the exe in
// pure JS; signing is skipped). Electron-builder is called through its API, never a shell.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appDir, '..', '..');
const outDir = path.join(repoRoot, 'downloads');
const manifestPath = path.join(outDir, 'desktop-apps.json');

const require = createRequire(path.join(appDir, 'package.json'));
const { ROLES } = require('./src/roles.js');

const DEFAULT_ICON = path.join(repoRoot, 'public', 'brand', 'kiosk-app-icon.png');
// Letters, digits, space, dot, dash, underscore: valid in Windows file names and shortcuts.
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]{1,39}$/;

function option(flag) {
  const index = process.argv.indexOf(flag);
  return index > -1 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  console.error(`\nGagal: ${message}`);
  process.exit(1);
}

const which = (option('--app') ?? 'all').trim().toLowerCase();
const roleIds = which === 'all' ? Object.keys(ROLES) : [which];
if (!roleIds.every((id) => ROLES[id])) fail(`--app harus admin, loket, tv, atau all (bukan "${which}").`);

const customName = option('--name');
if (customName !== undefined && roleIds.length > 1) fail('--name hanya bisa dipakai bersama --app admin|loket|tv.');
const icon = path.resolve(option('--icon') ?? DEFAULT_ICON);
if (!existsSync(icon)) fail(`Ikon tidak ditemukan: ${icon}`);

// Dependencies: install only when missing. --include=dev because the server may run with
// NODE_ENV=production, which would otherwise skip electron and electron-builder.
if (!existsSync(path.join(appDir, 'node_modules', 'electron-builder', 'package.json'))) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const hasLock = existsSync(path.join(appDir, 'package-lock.json'));
  console.log(`\n> npm ${hasLock ? 'ci' : 'install'} (apps/desktop-client)`);
  const res = spawnSync(npm, [hasLock ? 'ci' : 'install', '--include=dev', '--no-audit', '--no-fund'], {
    cwd: appDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (res.status !== 0) fail(`npm install (exit ${res.status ?? res.signal})`);
}

const builder = require('electron-builder');
const pkg = JSON.parse(readFileSync(path.join(appDir, 'package.json'), 'utf8'));

// --offline: build without internet (a branch server has none). Electron-builder normally
// re-downloads SHASUMS256.txt from GitHub to verify the cached Electron zip; with --offline it
// uses the zip already in the Electron download cache (checksum-verified when it was first
// downloaded) via `electronDist`.
function cachedElectronDir() {
  const electronVersion = require('electron/package.json').version;
  const zip = `electron-v${electronVersion}-win32-x64.zip`;
  const roots = [
    process.env.electron_config_cache,
    process.platform === 'darwin' && path.join(os.homedir(), 'Library', 'Caches', 'electron'),
    process.platform === 'win32' && path.join(process.env.LOCALAPPDATA || '', 'electron', 'Cache'),
    path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'electron'),
  ].filter(Boolean);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    if (existsSync(path.join(root, zip))) return root;
    for (const entry of readdirSync(root)) {
      const dir = path.join(root, entry);
      if (existsSync(path.join(dir, zip))) return dir;
    }
  }
  return null;
}
const offline = process.argv.includes('--offline');
const electronDist = offline ? cachedElectronDir() : null;
if (offline && !electronDist) fail('Mode --offline: file Electron win32-x64 belum ada di cache. Jalankan sekali dengan internet.');

function readManifest() {
  try {
    const data = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return data && typeof data.apps === 'object' && data.apps ? data : { apps: {} };
  } catch {
    return { apps: {} };
  }
}

async function buildRole(role) {
  const name = (customName ?? role.productName).trim().replace(/\s+/g, ' ');
  if (!NAME_PATTERN.test(name)) fail('Nama aplikasi 2–40 karakter: huruf, angka, spasi, titik, strip, atau garis bawah.');
  const artifactBase = customName
    ? `${name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}-Setup`
    : role.artifactBase;
  const roleOut = path.join(appDir, 'dist', role.id);

  // The icon ships inside the app too, for the window icon and the setup screen.
  const brandDir = path.join(appDir, 'dist', `brand-${role.id}`);
  rmSync(brandDir, { recursive: true, force: true });
  mkdirSync(brandDir, { recursive: true });
  copyFileSync(icon, path.join(brandDir, 'icon.png'));

  console.log(`\n> electron-builder --win nsis --x64  (app=${role.id}, nama="${name}", ikon=${path.relative(repoRoot, icon)})`);
  const config = {
    ...pkg.build,
    appId: role.appId,
    productName: name,
    artifactName: `${artifactBase}.\${ext}`,
    directories: { ...pkg.build.directories, output: roleOut },
    // name -> install folder %LOCALAPPDATA%\Programs\<name>; bankNttRole -> runtime role.
    extraMetadata: { name: role.packageName, productName: name, bankNttRole: role.id },
    extraResources: [{ from: path.join(brandDir, 'icon.png'), to: 'brand-icon.png' }],
    win: { ...pkg.build.win, icon },
    nsis: { ...pkg.build.nsis, shortcutName: name, uninstallDisplayName: name },
    ...(electronDist ? { electronDist } : {}),
  };
  try {
    await builder.build({
      projectDir: appDir,
      targets: builder.Platform.WINDOWS.createTarget('nsis', builder.Arch.x64),
      config,
      publish: 'never',
    });
  } catch (error) {
    fail(`electron-builder (${role.id}): ${error?.message ?? error}`);
  }

  const built = path.join(roleOut, `${artifactBase}.exe`);
  if (!existsSync(built)) fail(`Installer tidak ditemukan: ${built}`);
  mkdirSync(outDir, { recursive: true });
  const target = path.join(outDir, `${artifactBase}.exe`);
  copyFileSync(built, `${target}.tmp`);
  renameSync(`${target}.tmp`, target);

  const manifest = readManifest();
  const previous = manifest.apps[role.id];
  // Remove the previous installer of this app when the name (and so the file name) changed.
  if (previous?.file && previous.file !== path.basename(target)) rmSync(path.join(outDir, path.basename(previous.file)), { force: true });
  const size = statSync(target).size;
  manifest.apps[role.id] = {
    file: path.basename(target),
    name,
    appId: role.appId,
    version: pkg.version,
    size,
    builtAt: new Date().toISOString(),
  };
  writeFileSync(`${manifestPath}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
  renameSync(`${manifestPath}.tmp`, manifestPath);
  console.log(`\nSelesai: ${path.relative(repoRoot, target)} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

for (const id of roleIds) await buildRole(ROLES[id]);
