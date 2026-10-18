'use strict';

/*
 * The three apps built from this codebase. The role is baked into the packaged
 * package.json at build time (extraMetadata.bankNttRole, see scripts/build.mjs);
 * there is deliberately no mode picker at runtime.
 *
 *   id          role key, also the build flag (--app admin|loket|tv)
 *   appId       Windows AppUserModelID / electron-builder appId
 *   packageName package.json "name": decides the install folder
 *               (%LOCALAPPDATA%\Programs\<packageName>) so the apps never overwrite each other
 *   userData    fixed folder under %APPDATA%, independent of the (renamable) product name
 *   path        page loaded from the server
 *   kiosk       locked fullscreen (TV) instead of a normal window
 *   pairing     needs a device token from POST /api/devices/pair; expectedKind is the only accepted kind
 *   downloads   allow will-download from the server origin (reports, installers)
 *   childWindows allow same-origin window.open (ticket reprint) in a locked child window
 */
const ROLES = Object.freeze({
  admin: Object.freeze({
    id: 'admin',
    appId: 'id.bankntt.antrian.admin',
    productName: 'BANK NTT Admin',
    packageName: 'bankntt-admin',
    artifactBase: 'BANK-NTT-Admin-Setup',
    userData: 'bankntt-admin',
    path: '/admin',
    label: 'panel admin',
    kiosk: false,
    pairing: false,
    expectedKind: null,
    downloads: true,
    childWindows: true,
  }),
  loket: Object.freeze({
    id: 'loket',
    appId: 'id.bankntt.antrian.loket',
    productName: 'BANK NTT Loket',
    packageName: 'bankntt-loket',
    artifactBase: 'BANK-NTT-Loket-Setup',
    userData: 'bankntt-loket',
    path: '/counter',
    label: 'halaman loket',
    kiosk: false,
    pairing: false,
    expectedKind: null,
    downloads: false,
    childWindows: false,
  }),
  tv: Object.freeze({
    id: 'tv',
    appId: 'id.bankntt.antrian.tv',
    productName: 'BANK NTT TV',
    packageName: 'bankntt-tv',
    artifactBase: 'BANK-NTT-TV-Setup',
    userData: 'bankntt-tv',
    path: '/display',
    label: 'layar TV antrian',
    kiosk: true,
    pairing: true,
    expectedKind: 'display',
    downloads: false,
    childWindows: false,
  }),
});

function getRole(id) {
  return Object.prototype.hasOwnProperty.call(ROLES, id) ? ROLES[id] : null;
}

/**
 * Packaged: only the baked package.json field counts. Development: `--role=tv`
 * or BANKNTT_ROLE=tv may override it so one checkout can run all three.
 */
function resolveRole({ packaged, argv = [], env = {}, pkg = {} }) {
  if (!packaged) {
    const arg = argv.find((a) => typeof a === 'string' && a.startsWith('--role='));
    const fromArg = arg ? arg.slice('--role='.length) : '';
    const wanted = fromArg || env.BANKNTT_ROLE || pkg.bankNttRole || 'admin';
    return getRole(String(wanted).toLowerCase());
  }
  return getRole(pkg.bankNttRole);
}

module.exports = { ROLES, getRole, resolveRole };
