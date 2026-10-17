#!/usr/bin/env node
// Builds the Windows x64 NSIS installer and copies it to <repo>/downloads/.
//
//   npm run kiosk:build                                   # default name + Bank NTT icon
//   npm run kiosk:build -- --name "BANK NTT Ticket" --icon path/to/icon.png
//
// The admin panel runs this same script (Admin → Perangkat → Build ulang installer).
// Works on macOS, Linux and Windows without wine: electron-builder edits the exe icon and
// metadata in pure JS (resedit); only code signing is skipped (win.signExecutable=false).
// Electron-builder is called through its API, never a shell, so the name cannot inject commands.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appDir, '..', '..');
const outDir = path.join(repoRoot, 'downloads');
const manifestPath = path.join(outDir, 'kiosk-installer.json');

const DEFAULT_NAME = 'BANK NTT Ticket';
// Bank NTT symbol; the web admin previews the same file.
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

const name = (option('--name') ?? process.env.KIOSK_APP_NAME ?? DEFAULT_NAME).trim().replace(/\s+/g, ' ');
const icon = path.resolve(option('--icon') ?? process.env.KIOSK_APP_ICON ?? DEFAULT_ICON);
if (!NAME_PATTERN.test(name)) {
  fail('Nama aplikasi 2–40 karakter: huruf, angka, spasi, titik, strip, atau garis bawah.');
}
if (!existsSync(icon)) fail(`Ikon tidak ditemukan: ${icon}`);

const artifactBase = `${name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}-Setup`;

// Dependencies: install only when missing, so repeated builds from the admin panel are fast and
// work offline once the Electron download is cached. --include=dev because the server may run
// with NODE_ENV=production, which would otherwise skip electron and electron-builder.
const builderCli = path.join(appDir, 'node_modules', 'electron-builder', 'package.json');
if (!existsSync(builderCli)) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const hasLock = existsSync(path.join(appDir, 'package-lock.json'));
  console.log(`\n> npm ${hasLock ? 'ci' : 'install'} (apps/kiosk-desktop)`);
  const res = spawnSync(npm, [hasLock ? 'ci' : 'install', '--include=dev', '--no-audit', '--no-fund'], {
    cwd: appDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (res.status !== 0) fail(`npm install (exit ${res.status ?? res.signal})`);
}

const require = createRequire(path.join(appDir, 'package.json'));
const builder = require('electron-builder');
const pkg = JSON.parse(readFileSync(path.join(appDir, 'package.json'), 'utf8'));

// The icon ships inside the app too, for the window icon and the setup screen.
const brandDir = path.join(appDir, 'dist', 'brand');
rmSync(brandDir, { recursive: true, force: true });
mkdirSync(brandDir, { recursive: true });
copyFileSync(icon, path.join(brandDir, 'icon.png'));

console.log(`\n> electron-builder --win nsis --x64  (nama="${name}", ikon=${path.relative(repoRoot, icon)})`);
const config = {
  ...pkg.build,
  productName: name,
  artifactName: `${artifactBase}.\${ext}`,
  extraMetadata: { productName: name },
  extraResources: [{ from: path.join(brandDir, 'icon.png'), to: 'brand-icon.png' }],
  win: { ...pkg.build.win, icon },
  nsis: { ...pkg.build.nsis, shortcutName: name },
};
try {
  await builder.build({
    projectDir: appDir,
    targets: builder.Platform.WINDOWS.createTarget('nsis', builder.Arch.x64),
    config,
    publish: 'never',
  });
} catch (error) {
  fail(`electron-builder: ${error?.message ?? error}`);
}

const built = path.join(appDir, 'dist', `${artifactBase}.exe`);
if (!existsSync(built)) fail(`Installer tidak ditemukan: ${built}`);
mkdirSync(outDir, { recursive: true });
const target = path.join(outDir, `${artifactBase}.exe`);
copyFileSync(built, `${target}.tmp`);
renameSync(`${target}.tmp`, target);

// Remove the previous installer when the name (and so the file name) changed.
try {
  const previous = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (previous.file && previous.file !== path.basename(target)) rmSync(path.join(outDir, path.basename(previous.file)), { force: true });
} catch {
  // first build
}
const size = statSync(target).size;
writeFileSync(
  manifestPath,
  `${JSON.stringify({ file: path.basename(target), name, version: pkg.version, size, builtAt: new Date().toISOString() }, null, 2)}\n`,
);
console.log(`\nSelesai: ${path.relative(repoRoot, target)} (${(size / 1024 / 1024).toFixed(1)} MB)`);
