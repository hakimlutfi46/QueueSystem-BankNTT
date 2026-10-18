'use strict';

process.env.BANKNTT_QUIET = '1';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ROLES } = require('../src/roles');
const { resolveSimulation, simulationName, simulationTitle, simulationIdentity } = require('../src/simulation');
const { isAdminShortcut, isBlocked } = require('../src/keys');
const { PLATFORMS, getPlatform, artifactFiles, simulationConfig, DEB_MAINTAINER } = require('../scripts/targets.cjs');

test('simulation flag: baked in packaged builds, --simulation / env only in development', () => {
  assert.equal(resolveSimulation({ packaged: true, pkg: { bankNttSimulation: true } }), true);
  assert.equal(resolveSimulation({ packaged: true, pkg: {}, argv: ['--simulation'], env: { BANKNTT_SIMULATION: '1' } }), false);
  assert.equal(resolveSimulation({ packaged: true, pkg: { bankNttSimulation: 'true' } }), false);
  assert.equal(resolveSimulation({ packaged: false, argv: ['--simulation'] }), true);
  assert.equal(resolveSimulation({ packaged: false, env: { BANKNTT_SIMULATION: '1' } }), true);
  assert.equal(resolveSimulation({ packaged: false }), false);
});

test('simulation names and titles always say (Simulasi), once', () => {
  assert.equal(simulationName('BANK NTT TV'), 'BANK NTT TV (Simulasi)');
  assert.equal(simulationName('BANK NTT TV (Simulasi)'), 'BANK NTT TV (Simulasi)');
  assert.equal(simulationTitle('Panel Admin', 'BANK NTT Admin (Simulasi)'), 'Panel Admin (Simulasi)');
  assert.equal(simulationTitle('BANK NTT Admin (Simulasi)', 'x'), 'BANK NTT Admin (Simulasi)');
  assert.equal(simulationTitle('', 'BANK NTT Admin (Simulasi)'), 'BANK NTT Admin (Simulasi)');
});

test('simulation identity differs from the real app for every role', () => {
  assert.deepEqual({ ...simulationIdentity(ROLES.admin) }, {
    productName: 'BANK NTT Admin (Simulasi)',
    appId: 'id.bankntt.antrian.admin.sim',
    packageName: 'bankntt-admin-sim',
    userData: 'bankntt-admin-sim',
    artifactBase: 'BANK-NTT-Admin-Simulasi',
  });
  const sims = Object.values(ROLES).map(simulationIdentity);
  for (const key of ['appId', 'packageName', 'userData', 'artifactBase']) {
    const values = new Set([...sims.map((s) => s[key]), ...Object.values(ROLES).map((r) => r[key])]);
    assert.equal(values.size, 6, key);
  }
  // deb package names: lowercase, no spaces.
  for (const s of sims) assert.match(s.packageName, /^[a-z0-9][a-z0-9-]+$/);
});

test('platforms and artifact names', () => {
  assert.equal(getPlatform('win'), PLATFORMS.win);
  assert.equal(getPlatform('toString'), null);
  assert.equal(PLATFORMS.win.simulation, false);
  assert.equal(PLATFORMS.mac.simulation, true);
  assert.equal(PLATFORMS.linux.simulation, true);
  assert.deepEqual(artifactFiles('win', 'BANK-NTT-TV-Setup').map((f) => f.file), ['BANK-NTT-TV-Setup.exe']);
  assert.deepEqual(artifactFiles('mac', 'BANK-NTT-Admin-Simulasi').map((f) => f.file), ['BANK-NTT-Admin-Simulasi-mac-arm64.dmg']);
  assert.deepEqual(artifactFiles('linux', 'BANK-NTT-TV-Simulasi').map((f) => f.file), [
    'BANK-NTT-TV-Simulasi-linux-x86_64.AppImage',
    'BANK-NTT-TV-Simulasi-linux-amd64.deb',
  ]);
  assert.throws(() => artifactFiles('android', 'x'));
});

test('electron-builder config for mac and linux simulation builds', () => {
  const common = { base: 'BANK-NTT-Loket-Simulasi', productName: 'BANK NTT Loket (Simulasi)', packageName: 'bankntt-loket-sim', icon: '/i.png', description: 'd' };
  const mac = simulationConfig({ ...common, platformId: 'mac', electronFuses: { runAsNode: false } });
  assert.deepEqual(mac.mac.target, [{ target: 'dmg', arch: ['arm64'] }]);
  assert.equal(mac.mac.identity, null);
  assert.equal(mac.mac.hardenedRuntime, false);
  assert.equal(mac.dmg.artifactName, 'BANK-NTT-Loket-Simulasi-mac-arm64.dmg');
  assert.deepEqual(mac.electronFuses, { runAsNode: false, resetAdHocDarwinSignature: true });

  const linux = simulationConfig({ ...common, platformId: 'linux' });
  assert.deepEqual(linux.linux.target.map((t) => [t.target, t.arch]), [['AppImage', ['x64']], ['deb', ['x64']]]);
  assert.equal(linux.linux.category, 'Office');
  assert.equal(linux.linux.executableName, 'bankntt-loket-sim');
  assert.equal(linux.linux.maintainer, DEB_MAINTAINER);
  assert.match(DEB_MAINTAINER, /<[^@\s]+@[^>\s]+>$/);
  assert.equal(linux.appImage.artifactName, 'BANK-NTT-Loket-Simulasi-linux-x86_64.AppImage');
  assert.equal(linux.deb.artifactName, 'BANK-NTT-Loket-Simulasi-linux-amd64.deb');
  assert.equal(linux.deb.packageName, 'bankntt-loket-sim');
  assert.equal(linux.toolsets.appimage, '1.0.3');
  assert.equal(linux.extraMetadata.desktopName, 'bankntt-loket-sim.desktop');
  assert.match(linux.extraMetadata.homepage, /^https:\/\//);
  assert.equal(mac.toolsets, undefined);
  assert.throws(() => simulationConfig({ ...common, platformId: 'win' }));
});

test('TV exit shortcut works with Ctrl (Windows/Linux/Mac) and Cmd (Mac), also when Option changes the key', () => {
  const base = { type: 'keyDown', shift: true, alt: true, code: 'KeyK' };
  assert.equal(isAdminShortcut({ ...base, control: true, key: 'K' }), true);
  // macOS: Option+K types "˚"; the physical key code still identifies K.
  assert.equal(isAdminShortcut({ ...base, control: true, meta: false, key: '˚' }), true);
  assert.equal(isAdminShortcut({ ...base, control: false, meta: true, key: '˚' }), true);
  assert.equal(isAdminShortcut({ ...base, control: true, alt: false, key: 'K' }), false);
  assert.equal(isAdminShortcut({ ...base, type: 'keyUp', control: true, key: 'K' }), false);
  // macOS kiosk: Cmd+Q / Cmd+W / Cmd+H / Cmd+M are blocked like their Ctrl counterparts.
  for (const key of ['q', 'w', 'h', 'm']) assert.equal(isBlocked({ type: 'keyDown', meta: true, key, code: `Key${key.toUpperCase()}` }), true, key);
  assert.equal(isBlocked({ type: 'keyDown', meta: true, key: 'v', code: 'KeyV' }), false);
});
