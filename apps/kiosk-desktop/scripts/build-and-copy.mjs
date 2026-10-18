#!/usr/bin/env node
// Builds the Windows x64 NSIS installer and copies it to <repo>/downloads/ (or, with --platform
// mac|linux, a simulation app for a laptop without a thermal printer; see below).
//
//   npm run kiosk:build                                   # default name + Bank NTT icon
//   npm run kiosk:build -- --name "BANK NTT Ticket" --icon path/to/icon.png
//   npm run kiosk:build -- --with-server                  # kiosk + queue server for the main ticket machine
//   npm run kiosk:build:mac                               # = --platform mac   (simulation .dmg, arm64)
//   npm run kiosk:build:linux                             # = --platform linux (simulation AppImage + deb, x64)
//
// --with-server embeds apps/server-bundle/dist/server (build it first with `npm run server:bundle`)
// and produces <Name>-Server-Setup.exe: a per-machine installer that also installs PostgreSQL and the
// queue server as Windows services. It is copied to downloads/ but not listed in kiosk-installer.json,
// so Admin → Perangkat keeps offering the plain kiosk installer for additional kiosks.
//
// --platform mac|linux builds a *simulation* app for a developer's MacBook or Ubuntu PC: productName
// "<Name> (Simulasi)", appId "<appId>.sim", and extraMetadata.bankNttSimulation=true, which makes the
// app save every ticket as a PDF (no thermal printer), skip autostart and use its own settings
// folder. Simulation builds go to downloads/simulasi/ and never touch downloads/kiosk-installer.json.
// The default (--platform win) is the production Windows installer.
//
// The admin panel runs this same script (Admin → Perangkat → Build ulang installer).
// Works on macOS, Linux and Windows without wine: electron-builder edits the exe icon and
// metadata in pure JS (resedit); only code signing is skipped (win.signExecutable=false).
// Electron-builder is called through its API, never a shell, so the name cannot inject commands.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

const withServer = process.argv.includes('--with-server') || process.env.KIOSK_WITH_SERVER === '1';
const serverDir = path.join(repoRoot, 'apps', 'server-bundle', 'dist', 'server');
const simulationDir = path.join(outDir, 'simulasi');

function option(flag) {
  const index = process.argv.indexOf(flag);
  return index > -1 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  console.error(`\nGagal: ${message}`);
  process.exit(1);
}

const platform = String(option('--platform') ?? process.env.KIOSK_PLATFORM ?? 'win').trim().toLowerCase();
if (!['win', 'mac', 'linux'].includes(platform)) fail(`--platform harus win, mac, atau linux (bukan "${platform}").`);
// Every non-Windows build is a simulation build.
const simulation = platform !== 'win';
if (simulation && withServer) fail('--with-server hanya untuk Windows: bundle server berisi PostgreSQL dan layanan Windows.');

const name = (option('--name') ?? process.env.KIOSK_APP_NAME ?? DEFAULT_NAME).trim().replace(/\s+/g, ' ');
const icon = path.resolve(option('--icon') ?? process.env.KIOSK_APP_ICON ?? DEFAULT_ICON);
if (!NAME_PATTERN.test(name)) {
  fail('Nama aplikasi 2–40 karakter: huruf, angka, spasi, titik, strip, atau garis bawah.');
}
if (!existsSync(icon)) fail(`Ikon tidak ditemukan: ${icon}`);

const artifactBase = `${name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}${withServer ? '-Server' : ''}-Setup`;
if (withServer && !existsSync(path.join(serverDir, 'bundle-manifest.json'))) {
  fail(`Bundle server belum ada di ${path.relative(repoRoot, serverDir)}. Jalankan dulu: npm run server:bundle`);
}

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

if (simulation) {
  await buildSimulation();
  process.exit(0);
}

// The icon ships inside the app too, for the window icon and the setup screen.
const brandDir = path.join(appDir, 'dist', 'brand');
rmSync(brandDir, { recursive: true, force: true });
mkdirSync(brandDir, { recursive: true });
copyFileSync(icon, path.join(brandDir, 'icon.png'));

console.log(
  `\n> electron-builder --win nsis --x64  (nama="${name}", ikon=${path.relative(repoRoot, icon)}${withServer ? ', dengan server' : ''})`,
);
const extraResources = [{ from: path.join(brandDir, 'icon.png'), to: 'brand-icon.png' }];
if (withServer) extraResources.push({ from: serverDir, to: 'server' });
const config = {
  ...pkg.build,
  productName: name,
  artifactName: `${artifactBase}.\${ext}`,
  extraMetadata: { productName: name },
  extraResources,
  win: { ...pkg.build.win, icon },
  nsis: {
    ...pkg.build.nsis,
    shortcutName: name,
    // Services run from resources\server, so the program folder must be writable by admins only.
    ...(withServer ? { perMachine: true, include: path.join(appDir, 'build', 'installer-server.nsh') } : {}),
  },
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

if (withServer) {
  // Not served from Admin → Perangkat: the manifest keeps pointing at the plain kiosk installer.
  console.log(`\nSelesai: ${path.relative(repoRoot, target)} (${(statSync(target).size / 1024 / 1024).toFixed(1)} MB)`);
  process.exit(0);
}

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

/* ---------------------------------------------------------- simulation builds */

// macOS (.dmg, arm64, ad-hoc signed) or Ubuntu (AppImage + deb, x64, unsigned). Same app code; the baked
// bankNttSimulation flag switches it to PDF tickets (see src/main.js).
async function buildSimulation() {
  const productName = `${name} (Simulasi)`;
  const slug = `${name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}-Simulasi`;
  const simOut = path.join(appDir, 'dist', `simulasi-${platform}`);
  rmSync(simOut, { recursive: true, force: true });

  const brandDir = path.join(appDir, 'dist', 'brand-simulasi');
  rmSync(brandDir, { recursive: true, force: true });
  mkdirSync(brandDir, { recursive: true });
  copyFileSync(icon, path.join(brandDir, 'icon.png'));

  // ${arch} becomes arm64 for the dmg, x86_64 for the AppImage and amd64 for the deb.
  const config = {
    ...pkg.build,
    appId: `${pkg.build.appId}.sim`,
    productName,
    artifactName: `${slug}-${platform}-\${arch}.\${ext}`,
    directories: { ...pkg.build.directories, output: simOut },
    // name -> Linux package and executable name, so it never replaces a "kiosk-antrian" package.
    // homepage is required by the deb target; desktopName links Linux windows to the .desktop entry.
    extraMetadata: {
      name: 'kiosk-antrian-sim',
      productName,
      bankNttSimulation: true,
      description: 'Aplikasi kiosk tiket antrian BANK NTT versi simulasi: tiket disimpan sebagai PDF, tanpa printer thermal.',
      homepage: 'http://localhost',
      desktopName: 'kiosk-antrian-sim.desktop',
    },
    extraResources: [{ from: path.join(brandDir, 'icon.png'), to: 'brand-icon.png' }],
    mac: {
      target: [{ target: 'dmg', arch: ['arm64'] }],
      icon,
      // Ad-hoc signature ("-"), no certificate. identity: null leaves the fuse-flipped Electron
      // Framework with a broken signature, and Apple Silicon kills the app at launch.
      identity: '-',
      hardenedRuntime: false,
      category: 'public.app-category.business',
    },
    dmg: { sign: false },
    // The legacy AppImage toolset ships an x86_64-only mksquashfs for macOS, which cannot run on
    // Apple Silicon without Rosetta; 1.0.3 also uses the static runtime (no libfuse2 needed).
    toolsets: { ...pkg.build.toolsets, appimage: '1.0.3' },
    linux: {
      target: [
        { target: 'AppImage', arch: ['x64'] },
        { target: 'deb', arch: ['x64'] },
      ],
      icon,
      category: 'Office',
      executableName: 'kiosk-antrian-sim',
      maintainer: 'Bank NTT <noreply@localhost>',
      synopsis: 'Kiosk tiket antrian BANK NTT (simulasi, tiket PDF)',
    },
  };
  const targets =
    platform === 'mac'
      ? builder.Platform.MAC.createTarget('dmg', builder.Arch.arm64)
      : builder.Platform.LINUX.createTarget(['AppImage', 'deb'], builder.Arch.x64);
  console.log(
    `\n> electron-builder ${platform === 'mac' ? '--mac dmg --arm64' : '--linux AppImage deb --x64'}  (simulasi, nama="${productName}", ikon=${path.relative(repoRoot, icon)})`,
  );
  try {
    await builder.build({ projectDir: appDir, targets, config, publish: 'never' });
  } catch (error) {
    fail(`electron-builder: ${error?.message ?? error}`);
  }

  const files = readdirSync(simOut).filter((f) => f.startsWith(`${slug}-${platform}-`) && /\.(dmg|AppImage|deb)$/.test(f));
  if (!files.length) fail(`Installer simulasi tidak ditemukan di ${simOut}`);
  mkdirSync(simulationDir, { recursive: true });
  for (const file of files) {
    const target = path.join(simulationDir, file);
    copyFileSync(path.join(simOut, file), `${target}.tmp`);
    renameSync(`${target}.tmp`, target);
    console.log(`\nSelesai: ${path.relative(repoRoot, target)} (${(statSync(target).size / 1024 / 1024).toFixed(1)} MB)`);
  }
}
