'use strict';

/*
 * Simulation builds: Admin, Loket and TV for macOS (arm64) and Ubuntu (x64), so a developer can
 * simulate a branch on a laptop without the real Windows PCs. scripts/build.mjs --platform mac|linux
 * bakes extraMetadata.bankNttSimulation = true together with a separate identity per role
 * (name, appId, package name, settings folder) so a simulation app never shares settings with,
 * or replaces, a real installation. At runtime a simulation build:
 *   - never registers itself to start at login (the developer's laptop is not taken over),
 *   - shows "(Simulasi)" in its name and in every window title.
 * Windows builds are never simulation builds.
 */
const SUFFIX = ' (Simulasi)';
const MARK = '(Simulasi)';

/** Packaged: only the baked flag counts. Development: `--simulation` or BANKNTT_SIMULATION=1 too. */
function resolveSimulation({ packaged, argv = [], env = {}, pkg = {} }) {
  if (pkg.bankNttSimulation === true) return true;
  if (packaged) return false;
  return argv.includes('--simulation') || env.BANKNTT_SIMULATION === '1';
}

/** "BANK NTT TV" -> "BANK NTT TV (Simulasi)"; idempotent. */
function simulationName(name) {
  const text = String(name || '').trim();
  return text.endsWith(MARK) ? text : `${text}${SUFFIX}`;
}

/** Window title that always says it is a simulation: "Mock admin" -> "Mock admin (Simulasi)". */
function simulationTitle(title, appName) {
  const text = String(title || '').trim() || String(appName || '').trim();
  return text.includes(MARK) ? text : `${text}${SUFFIX}`;
}

/**
 * Identity of the simulation app of a role (see src/roles.js):
 * BANK NTT Admin / id.bankntt.antrian.admin / bankntt-admin ->
 * BANK NTT Admin (Simulasi) / id.bankntt.antrian.admin.sim / bankntt-admin-sim.
 */
function simulationIdentity(role) {
  return Object.freeze({
    productName: simulationName(role.productName),
    appId: `${role.appId}.sim`,
    packageName: `${role.packageName}-sim`,
    userData: `${role.userData}-sim`,
    artifactBase: `${role.artifactBase.replace(/-Setup$/, '')}-Simulasi`,
  });
}

module.exports = { SUFFIX, resolveSimulation, simulationName, simulationTitle, simulationIdentity };
