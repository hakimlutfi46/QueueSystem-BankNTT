#!/usr/bin/env node
// Builds the Windows x64 NSIS installers of BANK NTT Admin, Loket and TV from this one codebase
// and copies them to <repo>/downloads/ together with downloads/desktop-apps.json.
//
//   npm run apps:build                                        # all three, default names + icon
//   node apps/desktop-client/scripts/build.mjs --app tv
//   node apps/desktop-client/scripts/build.mjs --app all --offline       # no internet: cached Electron zip
//   node apps/desktop-client/scripts/build.mjs --app admin --name "BANK NTT Admin" --icon path/to/icon.png
//   node apps/desktop-client/scripts/build.mjs --app all --platform mac    # simulation: macOS arm64 .dmg
//   node apps/desktop-client/scripts/build.mjs --app all --platform linux  # simulation: x64 AppImage + deb
//
// --platform win (default) is the real branch build. mac and linux are simulation builds for a
// developer laptop (see src/simulation.js): name "… (Simulasi)", appId "….sim", package name
// "…-sim", output in <repo>/downloads/simulasi/ with its own desktop-apps.json. They never touch
// downloads/desktop-apps.json or the Windows installers.
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
const { simulationIdentity, simulationName } = require('./src/simulation.js');
const { getPlatform, artifactFiles, simulationConfig } = require('./scripts/targets.cjs');

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

const platformId = (option('--platform') ?? 'win').trim().toLowerCase();
const platform = getPlatform(platformId);
if (!platform) fail(`--platform harus win, mac, atau linux (bukan "${platformId}").`);

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
  const zip = `electron-v${electronVersion}-${platform.electron}.zip`;
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
if (offline && !electronDist) fail(`Mode --offline: file Electron ${platform.electron} belum ada di cache. Jalankan sekali dengan internet.`);

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

/* ------------------------------------------------ simulation builds (mac / linux) */

const simOutDir = path.join(outDir, 'simulasi');
const simManifestPath = path.join(simOutDir, 'desktop-apps.json');

function readSimManifest() {
  try {
    const data = JSON.parse(readFileSync(simManifestPath, 'utf8'));
    return data && typeof data.builds === 'object' && data.builds ? data : { simulation: true, builds: {} };
  } catch {
    return { simulation: true, builds: {} };
  }
}

async function buildSimulation(role) {
  const sim = simulationIdentity(role);
  const plain = (customName ?? role.productName).trim().replace(/\s+/g, ' ');
  if (!NAME_PATTERN.test(plain)) fail('Nama aplikasi 2–40 karakter: huruf, angka, spasi, titik, strip, atau garis bawah.');
  const name = simulationName(plain);
  const base = customName ? `${plain.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}-Simulasi` : sim.artifactBase;
  const files = artifactFiles(platform.id, base);
  const roleOut = path.join(appDir, 'dist', `simulasi-${platform.id}`, role.id);
  rmSync(roleOut, { recursive: true, force: true });

  const brandDir = path.join(appDir, 'dist', `brand-${role.id}`);
  rmSync(brandDir, { recursive: true, force: true });
  mkdirSync(brandDir, { recursive: true });
  copyFileSync(icon, path.join(brandDir, 'icon.png'));

  const description = `${name}: simulasi aplikasi ${role.label} sistem antrian BANK NTT untuk komputer pengembang.`;
  console.log(`\n> electron-builder ${platform.label}  (simulasi, app=${role.id}, nama="${name}", ikon=${path.relative(repoRoot, icon)})`);
  const { extraMetadata: platformMetadata, ...platformConfig } = simulationConfig({
    platformId: platform.id,
    base,
    productName: name,
    packageName: sim.packageName,
    icon,
    description,
    electronFuses: pkg.build.electronFuses,
    toolsets: pkg.build.toolsets,
  });
  const config = {
    ...pkg.build,
    appId: sim.appId,
    productName: name,
    artifactName: `${base}.\${ext}`,
    directories: { ...pkg.build.directories, output: roleOut },
    // bankNttSimulation -> no autostart, "(Simulasi)" in titles, userData <role>-sim (src/simulation.js).
    extraMetadata: {
      name: sim.packageName,
      productName: name,
      description,
      bankNttRole: role.id,
      bankNttSimulation: true,
      ...platformMetadata,
    },
    extraResources: [{ from: path.join(brandDir, 'icon.png'), to: 'brand-icon.png' }],
    ...platformConfig,
    ...(electronDist ? { electronDist } : {}),
  };
  const targets =
    platform.id === 'mac'
      ? builder.Platform.MAC.createTarget('dmg', builder.Arch.arm64)
      : builder.Platform.LINUX.createTarget(['AppImage', 'deb'], builder.Arch.x64);
  try {
    await builder.build({ projectDir: appDir, targets, config, publish: 'never' });
  } catch (error) {
    fail(`electron-builder (${platform.id}/${role.id}): ${error?.message ?? error}`);
  }

  mkdirSync(simOutDir, { recursive: true });
  const copied = [];
  for (const entry of files) {
    const built = path.join(roleOut, entry.file);
    if (!existsSync(built)) fail(`Installer tidak ditemukan: ${built}`);
    const target = path.join(simOutDir, entry.file);
    copyFileSync(built, `${target}.tmp`);
    renameSync(`${target}.tmp`, target);
    copied.push({ ...entry, size: statSync(target).size });
  }

  const manifest = readSimManifest();
  const key = `${platform.id}/${role.id}`;
  // Remove files of the previous build of this app/platform whose names changed.
  for (const old of manifest.builds[key]?.files ?? []) {
    if (old?.file && !copied.some((c) => c.file === old.file)) rmSync(path.join(simOutDir, path.basename(old.file)), { force: true });
  }
  manifest.simulation = true;
  manifest.builds[key] = {
    platform: platform.id,
    role: role.id,
    name,
    appId: sim.appId,
    version: pkg.version,
    files: copied,
    builtAt: new Date().toISOString(),
  };
  writeFileSync(`${simManifestPath}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
  renameSync(`${simManifestPath}.tmp`, simManifestPath);
  for (const c of copied) console.log(`\nSelesai: ${path.relative(repoRoot, path.join(simOutDir, c.file))} (${(c.size / 1024 / 1024).toFixed(1)} MB)`);
}

for (const id of roleIds) await (platform.simulation ? buildSimulation(ROLES[id]) : buildRole(ROLES[id]));
