'use strict';

/*
 * Pure build presets for scripts/build.mjs --platform win|mac|linux (unit-tested, no I/O).
 *
 *   win    Windows x64 NSIS installer, the real branch apps (unchanged behaviour)
 *   mac    macOS arm64 .dmg, simulation build, unsigned (identity null, no hardened runtime)
 *   linux  Ubuntu x64 AppImage + deb, simulation build
 *
 * Simulation artifacts carry the electron-builder architecture spelling of each format:
 * BANK-NTT-Admin-Simulasi-mac-arm64.dmg, BANK-NTT-TV-Simulasi-linux-x86_64.AppImage,
 * BANK-NTT-Loket-Simulasi-linux-amd64.deb.
 */
const PLATFORMS = Object.freeze({
  win: Object.freeze({ id: 'win', simulation: false, electron: 'win32-x64', label: 'Windows x64 (NSIS)' }),
  mac: Object.freeze({ id: 'mac', simulation: true, electron: 'darwin-arm64', label: 'macOS arm64 (dmg)' }),
  linux: Object.freeze({ id: 'linux', simulation: true, electron: 'linux-x64', label: 'Linux x64 (AppImage + deb)' }),
});

// deb needs a maintainer with an e-mail address; package.json "author" has none.
const DEB_MAINTAINER = 'Kiosk Antrian <antrian@bankntt.local>';
// deb also needs a homepage (package.json has none): the project repository.
const HOMEPAGE = 'https://github.com/hakimlutfi46/QueueSystem-BankNTT';

function getPlatform(id) {
  return Object.prototype.hasOwnProperty.call(PLATFORMS, id) ? PLATFORMS[id] : null;
}

/** File names produced for one app on one platform, in build order. */
function artifactFiles(platformId, base) {
  switch (platformId) {
    case 'win':
      return [{ file: `${base}.exe`, target: 'nsis', arch: 'x64' }];
    case 'mac':
      return [{ file: `${base}-mac-arm64.dmg`, target: 'dmg', arch: 'arm64' }];
    case 'linux':
      return [
        { file: `${base}-linux-x86_64.AppImage`, target: 'AppImage', arch: 'x86_64' },
        { file: `${base}-linux-amd64.deb`, target: 'deb', arch: 'amd64' },
      ];
    default:
      throw new Error(`unknown platform ${platformId}`);
  }
}

/**
 * Platform part of the electron-builder config for a simulation build (mac or linux), merged over
 * package.json "build". `executableName` has no spaces (Linux binary, deb package, .desktop file).
 * `extraMetadata` is merged into the packaged package.json by the caller.
 */
function simulationConfig({ platformId, base, productName, packageName, icon, description, electronFuses = {}, toolsets = {} }) {
  const [first, second] = artifactFiles(platformId, base);
  if (platformId === 'mac') {
    return {
      mac: {
        target: [{ target: 'dmg', arch: ['arm64'] }],
        icon,
        category: 'public.app-category.business',
        identity: null,
        hardenedRuntime: false,
        // Text of the macOS "find devices on your local network" prompt (UDP discovery).
        extendInfo: { NSLocalNetworkUsageDescription: 'Mencari server antrian BANK NTT di jaringan lokal.' },
      },
      dmg: { artifactName: first.file, title: productName, sign: false },
      // Flipping the fuses edits the Electron binary; arm64 refuses to run it unless the
      // ad-hoc signature is renewed (codesign --sign -), which needs no certificate.
      electronFuses: { ...electronFuses, resetAdHocDarwinSignature: true },
    };
  }
  if (platformId === 'linux') {
    return {
      linux: {
        target: [
          { target: 'AppImage', arch: ['x64'] },
          { target: 'deb', arch: ['x64'] },
        ],
        icon,
        category: 'Office',
        maintainer: DEB_MAINTAINER,
        executableName: packageName,
        synopsis: productName,
        description,
        syncDesktopName: true,
      },
      appImage: { artifactName: first.file },
      deb: { artifactName: second.file, packageName },
      // AppImage toolset 1.0.3 (official electron-builder-binaries, static runtime 20251108) ships
      // native darwin-arm64 mksquashfs; the default legacy toolset is x86_64-only and needs Rosetta
      // on Apple Silicon. Its AppRun adds --no-sandbox only when user namespaces are blocked
      // (Ubuntu 24.04 AppArmor).
      toolsets: { ...toolsets, appimage: '1.0.3' },
      // Electron uses desktopName as the Wayland app_id / WM_CLASS; syncDesktopName makes the
      // .desktop file match so the dock links the running window to its launcher.
      extraMetadata: { desktopName: `${packageName}.desktop`, homepage: HOMEPAGE },
    };
  }
  throw new Error(`${platformId} is not a simulation platform`);
}

module.exports = { PLATFORMS, DEB_MAINTAINER, HOMEPAGE, getPlatform, artifactFiles, simulationConfig };
