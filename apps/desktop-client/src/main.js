'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, Menu, session, powerMonitor, powerSaveBlocker, dialog } = require('electron');

const pkg = require('../package.json');
const log = require('./logger');
const config = require('./config');
const discovery = require('./discovery');
const { resolveRole } = require('./roles');
const { hashPin, verifyPin, isValidPin } = require('./pin');
const { pair } = require('./pairing');
const { normaliseServer, normaliseCode, isValidCode, sameOrigin, hostOf } = require('./server-url');
const { lockKeyboard, isLockdown, quitShortcutAction } = require('./keys');
const { parseDeviceRequired, deviceRequiredAction, repairAllowed, repairDelay, deviceRequiredUrl } = require('./device-required');
const { resolveSimulation, simulationName, simulationTitle, simulationIdentity } = require('./simulation');

// --dev (or BANKNTT_DEV=1): TV runs windowed instead of kiosk, DevTools allowed.
const DEV = process.argv.includes('--dev') || process.env.BANKNTT_DEV === '1';
const RENDERER = path.join(__dirname, 'renderer');
const PRELOAD = path.join(__dirname, 'preload');
const RETRY_MS = 5_000;
const RELOCATE_MS = 30_000;
const UNRESPONSIVE_GRACE_MS = 10_000;
const PIN_MAX_FAILURES = 5;
const PIN_LOCK_MS = 60_000;

// The role (admin / loket / tv) is baked into package.json by scripts/build.mjs. In development
// `--role=tv` or BANKNTT_ROLE=tv picks one. There is no runtime mode picker.
const ROLE = resolveRole({ packaged: app.isPackaged, argv: process.argv, env: process.env, pkg });
if (!ROLE) {
  dialog.showErrorBox('Aplikasi tidak valid', 'Peran aplikasi (admin/loket/tv) tidak ditemukan di paket. Pasang ulang dari installer resmi.');
  process.exit(1);
}

// Simulation build (macOS / Ubuntu developer laptop, see src/simulation.js); `--simulation` in dev.
const SIMULATION = resolveSimulation({ packaged: app.isPackaged, argv: process.argv, env: process.env, pkg });
const IS_MAC = process.platform === 'darwin';
// TV production lockdown (packaged, non-simulation): window close, Alt+F4 and Ctrl+Q / Cmd+Q never
// quit; only "Keluar aplikasi" (PIN prompt or settings) or OS shutdown does. BANKNTT_LOCKDOWN=1
// tries the production behaviour in development. Admin and Loket are normal windows.
const LOCKDOWN =
  ROLE.kiosk && isLockdown({ packaged: app.isPackaged, simulation: SIMULATION, lockdownEnv: process.env.BANKNTT_LOCKDOWN });

// Discovery port: fixed in packaged builds; overridable in development to test against a mock.
const DISCOVERY_PORT =
  !app.isPackaged && Number(process.env.BANKNTT_DISCOVERY_PORT) > 0 ? Number(process.env.BANKNTT_DISCOVERY_PORT) : discovery.DISCOVERY_PORT;

// Settings live in a fixed folder per role (%APPDATA%\bankntt-admin, -loket, -tv), not one named
// after productName, so a rebuild under another name keeps the saved server (and the TV pairing).
// The single-instance lock is per userData folder, so Admin and Loket may run side by side.
// Simulation builds use <role>-sim so they never share settings with a real installation.
if (!app.isPackaged) app.setName(SIMULATION ? simulationName(ROLE.productName) : ROLE.productName);
const USER_DATA_DIR = SIMULATION ? simulationIdentity(ROLE).userData : ROLE.userData;
app.setPath(
  'userData',
  process.env.BANKNTT_USER_DATA ? path.resolve(process.env.BANKNTT_USER_DATA) : path.join(app.getPath('appData'), USER_DATA_DIR),
);

// The TV announces calls by voice and chime without anyone touching it.
if (ROLE.kiosk) app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const APP_NAME = app.getName();

/** Shown when macOS keeps this app off the local network (see discovery.localNetworkBlocked). */
function localNetworkHint() {
  return `macOS memblokir ${APP_NAME} dari jaringan lokal. Buka System Settings → Privacy & Security → Local Network, nyalakan ${APP_NAME}, lalu tekan Cari ulang.`;
}
const BRAND_ICON = app.isPackaged
  ? path.join(process.resourcesPath, 'brand-icon.png')
  : path.join(__dirname, '..', '..', '..', 'public', 'brand', 'kiosk-app-icon.png');
const windowIcon = () => (fs.existsSync(BRAND_ICON) ? BRAND_ICON : undefined);

function brandIconDataUrl() {
  try {
    return `data:image/png;base64,${fs.readFileSync(BRAND_ICON).toString('base64')}`;
  } catch {
    return null;
  }
}

// A packaged app must never expose a debugging port.
if (app.isPackaged && (app.commandLine.hasSwitch('remote-debugging-port') || app.commandLine.hasSwitch('remote-debugging-pipe'))) {
  app.exit(1);
}

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}

const state = {
  config: null,
  mainWin: null,
  setupWin: null,
  setupMode: null,
  pinWin: null,
  quitting: false, // authorised exit in progress (TV) or normal quit
  allowMainClose: false, // TV: switching to settings
  offline: false,
  retryTimer: null,
  relocateTimer: null,
  unresponsiveTimer: null,
  scanJob: null,
  knownServers: new Map(), // url -> { name, url, ... } from discovery replies
  pinFailures: 0,
  pinLockedUntil: 0,
  blockerId: null,
  lastRepairAt: 0, // TV: last automatic pairing attempt (ms), at most one per minute
  repairing: null, // TV: pending automatic pairing promise
  repairTimer: null,
  pairBlocked: false, // TV: server answered DEVICE_REVOKED, no automatic pairing until settings are saved
  lastDeviceState: '',
};

process.on('uncaughtException', (err) => log.error('uncaughtException:', err));
process.on('unhandledRejection', (err) => log.error('unhandledRejection:', err));

/* ------------------------------------------------------------------ helpers */

function baseWebPreferences(preload) {
  return {
    preload: preload ? path.join(PRELOAD, preload) : undefined,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    webviewTag: false,
    spellcheck: false,
    devTools: DEV,
    backgroundThrottling: false,
  };
}

const rendererFile = (name) => path.join(RENDERER, name);
const isComplete = () => config.isComplete(state.config, ROLE);
const alive = (win) => Boolean(win && !win.isDestroyed());

function enableAutoStart() {
  if (!ROLE.kiosk) return;
  if (SIMULATION) {
    log.info('autostart: dilewati (simulasi)');
    return;
  }
  if (!app.isPackaged) {
    log.info('autostart: dilewati (mode pengembangan)');
    return;
  }
  try {
    app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
    log.info('autostart: aktif');
  } catch (err) {
    log.warn('autostart: gagal', err.message);
  }
}

function targetUrl() {
  const base = `${state.config.server}${ROLE.path}`;
  return ROLE.pairing && state.config.token ? `${base}?token=${encodeURIComponent(state.config.token)}` : base;
}

/* ---------------------------------------------------------------- discovery */

/**
 * One shared scan at a time; late subscribers get the servers found so far.
 * Every healthy reply is remembered so a saved server keeps its announced name.
 */
function runScan(onFound) {
  if (!state.scanJob) {
    const job = { found: [], listeners: new Set() };
    job.promise = discovery
      .scan({
        port: DISCOVERY_PORT,
        log,
        onFound: (server) => {
          state.knownServers.set(server.url, server);
          job.found.push(server);
          for (const fn of job.listeners) fn(server);
        },
      })
      .finally(() => {
        if (state.scanJob === job) state.scanJob = null;
      });
    state.scanJob = job;
    log.info(`discovery: memindai jaringan (port ${DISCOVERY_PORT})`);
  }
  const job = state.scanJob;
  if (onFound) {
    job.found.forEach(onFound);
    job.listeners.add(onFound);
  }
  return job.promise;
}

/** Name announced by the server at `url`: from earlier scans, else ask that host directly. */
async function learnServerName(url) {
  const known = state.knownServers.get(url);
  if (known) return known.name;
  const host = hostOf(url);
  if (discovery.ipv4ToInt(host) === null) return '';
  const replies = await discovery.scan({ port: DISCOVERY_PORT, targets: [host], durationMs: 1_500, intervalMs: 500, healthCheck: false });
  const match = replies.find((s) => s.url === url);
  return match ? match.name : '';
}

/* -------------------------------------------------------------- main window */

function stopRetry() {
  clearRepairTimer();
  if (state.retryTimer) clearInterval(state.retryTimer);
  if (state.relocateTimer) clearInterval(state.relocateTimer);
  state.retryTimer = null;
  state.relocateTimer = null;
}

/**
 * TV automatic pairing without a code: { kind, name, installId }. The server reuses the device row
 * of this installId, so this never creates duplicates. Callers respect the once-per-minute limit.
 */
function autoPair(reason) {
  if (state.repairing) return state.repairing;
  state.lastRepairAt = Date.now();
  const server = state.config.server;
  log.info(`${ROLE.id}: pemasangan otomatis (${reason}) installId=${config.maskInstallId(state.config.installId)}`);
  state.repairing = pair(server, '', { expectedKind: ROLE.expectedKind, installId: state.config.installId })
    .then((res) => {
      if (res.ok && state.config.server === server) {
        state.pairBlocked = false;
        state.config = config.save({ ...state.config, token: res.token, deviceName: res.name || state.config.deviceName });
        if (!res.approved) log.info(`${ROLE.id}: menunggu persetujuan admin di Admin → Perangkat`);
      } else if (res.code === 'DEVICE_REVOKED') {
        state.pairBlocked = true;
        log.warn(`${ROLE.id}: instalasi ini dicabut admin, tidak ada pemasangan ulang otomatis`);
      }
      return res;
    })
    .finally(() => {
      state.repairing = null;
    });
  return state.repairing;
}

function clearRepairTimer() {
  if (state.repairTimer) clearTimeout(state.repairTimer);
  state.repairTimer = null;
}

/** Reload the page once the next automatic pairing is allowed (the reload re-checks the token). */
function scheduleRepair() {
  if (state.repairTimer) return;
  const ms = Math.max(repairDelay(state.lastRepairAt), 1_000);
  log.info(`${ROLE.id}: pemasangan ulang otomatis dicoba lagi dalam ${Math.ceil(ms / 1000)} detik`);
  state.repairTimer = setTimeout(() => {
    state.repairTimer = null;
    if (!state.offline) loadMain();
  }, ms);
}

/** TV without a token: pair first. Returns a /device-required state to show instead, or null. */
async function pairWithoutToken() {
  if (state.pairBlocked) return 'revoked';
  if (!repairAllowed(state.lastRepairAt)) return null; // the server answers "unknown"; retried later
  const res = await autoPair('belum ada token');
  if (res.ok) return null;
  if (res.code === 'DEVICE_REVOKED') return 'revoked';
  if (res.code === 'RATE_LIMITED') return 'limited';
  return null; // unreachable server: loading fails and the offline page takes over
}

/**
 * The server shows /device-required?state=pending|revoked|unknown|limited when this TV may not
 * open /display. Only "unknown" (token unknown, e.g. database reset) re-pairs, at most once a
 * minute; pending and limited pages re-check by themselves, revoked stays as it is.
 */
async function handleDeviceRequired(url) {
  if (!ROLE.pairing) return;
  const info = parseDeviceRequired(url, state.config.server);
  if (!info) {
    state.lastDeviceState = '';
    return;
  }
  const action = deviceRequiredAction(url, {
    server: state.config.server,
    lastRepairAt: state.lastRepairAt,
    blocked: state.pairBlocked,
  });
  if (state.lastDeviceState !== info.state) {
    state.lastDeviceState = info.state;
    log.info(`${ROLE.id}: server menampilkan status perangkat "${info.state || '-'}" -> ${action}`);
  }
  if (action === 'repair') {
    const res = await autoPair('token tidak dikenal server');
    if (res.ok) loadMain();
    else if (res.code !== 'DEVICE_REVOKED') scheduleRepair();
  } else if (action === 'wait' && info.state === 'unknown') {
    scheduleRepair();
  }
}

async function loadMain() {
  const win = state.mainWin;
  if (!alive(win)) return;
  stopRetry();
  state.offline = false;
  if (ROLE.pairing && !state.config.token) {
    const blocked = await pairWithoutToken();
    if (!alive(win)) return;
    if (blocked) {
      log.info(`${ROLE.id}: menampilkan status perangkat "${blocked}" dari server`);
      win.loadURL(deviceRequiredUrl(state.config.server, ROLE.expectedKind, blocked)).catch(() => {});
      return;
    }
  }
  log.info(`${ROLE.id}: memuat`, targetUrl());
  win.loadURL(targetUrl()).catch(() => {
    // did-fail-load handles the UI; the promise rejection is expected here.
  });
}

function offlineStatus(text) {
  const win = state.mainWin;
  if (alive(win) && state.offline) win.webContents.send('offline:status', String(text));
}

/**
 * Offline: look for the saved server by its announced name. A server that comes back at a new
 * address (DHCP) is adopted and saved automatically. Returns true when the main page was reloaded.
 */
async function relocate() {
  const { server, serverName } = state.config;
  offlineStatus(serverName ? `Mencari server "${serverName}" di jaringan…` : 'Mencari server antrian di jaringan…');
  const servers = await runScan();
  if (!state.offline) return true;
  if (servers.some((s) => s.url === server)) {
    log.info('discovery: server tersimpan menjawab lagi', server);
    loadMain();
    return true;
  }
  const moved = serverName ? servers.find((s) => s.name === serverName && s.url !== server) : null;
  if (moved) {
    log.info(`discovery: server "${serverName}" pindah alamat ${server} -> ${moved.url}`);
    state.config = config.save({ ...state.config, server: moved.url });
    offlineStatus(`Server ditemukan di alamat baru ${moved.url}. Menyambung…`);
    loadMain();
    return true;
  }
  if (!serverName) offlineStatus(servers.length ? `${servers.length} server lain ditemukan di jaringan.` : 'Tidak ada server antrian ditemukan di jaringan.');
  else offlineStatus(`Server "${serverName}" belum ditemukan di jaringan.`);
  return false;
}

function showOffline(reason) {
  const win = state.mainWin;
  if (!alive(win)) return;
  log.warn(`${ROLE.id}: server tidak dapat dijangkau:`, reason);
  if (!state.offline) {
    state.offline = true;
    win
      .loadFile(rendererFile('offline.html'), {
        query: { server: state.config.server, retry: String(RETRY_MS / 1000), app: APP_NAME, role: ROLE.id },
      })
      .catch(() => {});
  }
  if (!state.retryTimer) {
    let busy = false;
    state.retryTimer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        if (await discovery.checkHealth(state.config.server)) {
          log.info(`${ROLE.id}: server kembali tersedia`);
          loadMain();
        }
      } finally {
        busy = false;
      }
    }, RETRY_MS);
    // Background discovery right away and then every 30 s while offline.
    setTimeout(() => state.offline && relocate().catch((err) => log.warn('discovery:', err.message)), 1_000);
    state.relocateTimer = setInterval(() => {
      if (state.offline) relocate().catch((err) => log.warn('discovery:', err.message));
    }, RELOCATE_MS);
  }
}

function guardNavigation(wc, label) {
  const guard = (event, url) => {
    if (!sameOrigin(url, state.config.server)) {
      event.preventDefault();
      log.warn(`${label}: navigasi diblokir ke`, url);
    }
  };
  wc.on('will-navigate', guard);
  wc.on('will-redirect', guard);
  wc.on('will-frame-navigate', (event) => {
    if (!event.isMainFrame && !sameOrigin(event.url, state.config.server) && !String(event.url).startsWith('about:')) {
      event.preventDefault();
    }
  });
}

/** Same-origin window.open (Admin: ticket reprint) opens a locked child window; everything else is denied. */
function windowOpenHandler(label) {
  return ({ url }) => {
    if (ROLE.childWindows && sameOrigin(url, state.config.server)) {
      log.info(`${label}: jendela anak dibuka`, url);
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 960,
          height: 820,
          autoHideMenuBar: true,
          backgroundColor: '#ffffff',
          icon: windowIcon(),
          webPreferences: baseWebPreferences(null),
        },
      };
    }
    log.warn(`${label}: jendela baru diblokir`, url);
    return { action: 'deny' };
  };
}

function secureChildWindow(child) {
  child.setMenu(null);
  const wc = child.webContents;
  guardNavigation(wc, 'jendela anak');
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function createMainWindow() {
  const kiosk = ROLE.kiosk && !DEV;
  const win = new BrowserWindow({
    show: false,
    kiosk,
    fullscreen: kiosk,
    frame: !ROLE.kiosk,
    width: 1366,
    height: 820,
    minWidth: ROLE.kiosk ? undefined : 900,
    minHeight: ROLE.kiosk ? undefined : 600,
    backgroundColor: '#ffffff',
    autoHideMenuBar: ROLE.kiosk,
    title: APP_NAME,
    icon: windowIcon(),
    webPreferences: baseWebPreferences('main.js'),
  });
  if (ROLE.kiosk) win.setMenu(null);
  state.mainWin = win;
  const wc = win.webContents;

  if (ROLE.kiosk) lockKeyboard(wc, { onAdmin: openAdminMenu, onQuit: handleQuitShortcut });

  win.once('ready-to-show', () => {
    if (!ROLE.kiosk) win.maximize();
    win.show();
    win.focus();
  });

  if (ROLE.kiosk) {
    win.on('close', (event) => {
      if (state.quitting || state.allowMainClose) return;
      if (LOCKDOWN) {
        event.preventDefault();
        log.info('tv: penutupan jendela diblokir');
        return;
      }
      state.quitting = true;
      app.quit();
    });
    win.on('leave-full-screen', () => {
      if (!DEV && !state.quitting) setTimeout(() => alive(win) && win.setKiosk(true), 100);
    });
    win.on('session-end', () => {
      state.quitting = true;
    });
  }
  win.on('closed', () => {
    if (state.mainWin === win) state.mainWin = null;
    stopRetry();
    // TV: a page calling window.close() bypasses the 'close' guard, so bring it straight back.
    if (ROLE.kiosk && !state.quitting && !state.allowMainClose && isComplete()) {
      log.warn('tv: jendela tertutup tanpa izin, dibuka kembali');
      setImmediate(() => {
        if (!state.quitting && !state.mainWin && !state.setupWin) openMain();
      });
    }
  });

  guardNavigation(wc, ROLE.id);
  wc.setWindowOpenHandler(windowOpenHandler(ROLE.id));
  wc.on('did-create-window', secureChildWindow);

  wc.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 /* ERR_ABORTED */) return;
    if (String(validatedURL).startsWith('file:')) return;
    showOffline(`${errorCode} ${errorDescription} (${validatedURL})`);
  });
  wc.on('did-navigate', (_e, url, httpResponseCode) => {
    if (httpResponseCode >= 502 && httpResponseCode <= 504 && sameOrigin(url, state.config.server)) {
      showOffline(`HTTP ${httpResponseCode}`);
      return;
    }
    handleDeviceRequired(url).catch((err) => log.warn(`${ROLE.id}: status perangkat:`, err.message));
  });
  wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
    if (isMainFrame) handleDeviceRequired(url).catch((err) => log.warn(`${ROLE.id}: status perangkat:`, err.message));
  });
  if (ROLE.kiosk) {
    wc.on('did-finish-load', () => {
      wc.setVisualZoomLevelLimits(1, 1).catch(() => {});
    });
  }

  wc.on('render-process-gone', (_e, details) => {
    log.error(`${ROLE.id}: renderer berhenti:`, details.reason, 'exitCode =', details.exitCode);
    if (state.quitting || win.isDestroyed()) return;
    setTimeout(() => {
      if (win.isDestroyed()) return;
      if (state.offline) {
        state.offline = false;
        showOffline('reload setelah crash');
      } else {
        loadMain();
      }
    }, 1_000);
  });
  win.on('unresponsive', () => {
    log.warn(`${ROLE.id}: halaman tidak merespons`);
    clearTimeout(state.unresponsiveTimer);
    state.unresponsiveTimer = setTimeout(() => {
      if (win.isDestroyed()) return;
      log.error(`${ROLE.id}: masih tidak merespons, renderer dimulai ulang`);
      wc.forcefullyCrashRenderer(); // -> render-process-gone -> reload
    }, UNRESPONSIVE_GRACE_MS);
  });
  win.on('responsive', () => clearTimeout(state.unresponsiveTimer));

  loadMain();
  return win;
}

function openMain() {
  if (alive(state.mainWin)) {
    state.mainWin.focus();
    return;
  }
  createMainWindow();
}

/** Menu item "Muat ulang": retry right away when offline, else reload the page. */
function reloadMain() {
  if (!alive(state.mainWin)) return;
  if (state.offline) loadMain();
  else state.mainWin.webContents.reload();
}

/* ------------------------------------------------------------- setup window */

function openSetup(mode) {
  if (alive(state.setupWin)) {
    state.setupWin.focus();
    return;
  }
  state.setupMode = mode;
  // Admin/Loket "Ganti server" keeps the main window open behind a modal picker.
  const parent = !ROLE.kiosk && mode === 'edit' && alive(state.mainWin) ? state.mainWin : undefined;
  const win = new BrowserWindow({
    parent,
    modal: Boolean(parent),
    show: false,
    width: 900,
    height: ROLE.pairing ? 920 : 760,
    minWidth: 640,
    minHeight: 560,
    backgroundColor: '#0a4ea3',
    autoHideMenuBar: true,
    title: `Pengaturan ${APP_NAME}`,
    icon: windowIcon(),
    webPreferences: baseWebPreferences('setup.js'),
  });
  win.setMenu(null);
  state.setupWin = win;
  lockKeyboard(win.webContents, { allowEscape: true, onQuit: ROLE.kiosk ? handleQuitShortcut : undefined });
  if (ROLE.kiosk) {
    win.on('session-end', () => {
      state.quitting = true;
    });
  }
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.once('ready-to-show', () => {
    if (ROLE.kiosk && !DEV) win.maximize();
    win.show();
    win.focus();
  });
  win.on('closed', () => {
    if (state.setupWin === win) state.setupWin = null;
    // Closing the settings window in edit mode returns to the main page.
    if (!state.quitting && isComplete() && !state.mainWin) openMain();
  });
  win.loadFile(rendererFile('setup.html'));
}

function closeSetup() {
  const win = state.setupWin;
  state.setupWin = null;
  if (alive(win)) win.close();
}

/* ------------------------------------------------------- TV admin PIN window */

function pinLockSeconds() {
  return Math.max(0, Math.ceil((state.pinLockedUntil - Date.now()) / 1000));
}

function closePin() {
  const win = state.pinWin;
  state.pinWin = null;
  if (alive(win)) win.destroy();
}

function authorisedExit(reason = 'PIN benar') {
  log.info(`admin: keluar aplikasi (${reason})`);
  state.quitting = true;
  closePin();
  app.quit();
}

/** TV Ctrl+Q / Cmd+Q / Alt+F4: quick quit in simulation and development, blocked in production. */
function handleQuitShortcut() {
  if (quitShortcutAction(LOCKDOWN) === 'quit') {
    authorisedExit('pintasan keluar, bukan mode produksi');
    return;
  }
  log.info('tv: pintasan keluar diblokir (pakai Ctrl+Shift+Alt+K)');
}

/** TV Ctrl+Shift+Alt+K: the settings window (server, Keluar aplikasi). The admin PIN is no longer used. */
function openAdminMenu() {
  openSettingsFromTv();
}

function openSettingsFromTv() {
  log.info('tv: membuka pengaturan');
  closePin();
  openSetup('edit');
  const main = state.mainWin;
  if (alive(main)) {
    state.allowMainClose = true;
    main.destroy();
    state.allowMainClose = false;
  }
  state.mainWin = null;
}

/* ------------------------------------------------------------ app menu (Admin/Loket) */

function changeServer() {
  log.info('menu: ganti server');
  openSetup('edit');
}

function showAbout() {
  const parent = BrowserWindow.getFocusedWindow() || state.mainWin || undefined;
  dialog
    .showMessageBox(parent, {
      type: 'info',
      title: `Tentang ${APP_NAME}`,
      message: `${APP_NAME} v${app.getVersion()}`,
      detail: [
        `Server: ${state.config.server || '-'}${state.config.serverName ? ` (${state.config.serverName})` : ''}`,
        `Pengaturan: ${config.path}`,
        `Log: ${log.file || '-'}`,
        ...(SIMULATION ? ['Mode simulasi: tidak berjalan otomatis saat login.'] : []),
      ].join('\n'),
      buttons: ['Tutup'],
    })
    .catch(() => {});
}

// macOS only puts Cmd+C/V/X/A into text fields through Edit menu roles.
const EDIT_MENU = {
  label: 'Edit',
  submenu: [
    { label: 'Urungkan', role: 'undo' },
    { label: 'Ulangi', role: 'redo' },
    { type: 'separator' },
    { label: 'Potong', role: 'cut' },
    { label: 'Salin', role: 'copy' },
    { label: 'Tempel', role: 'paste' },
    { label: 'Pilih semua', role: 'selectAll' },
  ],
};

function buildMenu() {
  // TV on macOS: only the Edit menu (paste the pairing code in settings); no Quit item. The kiosk
  // window blocks Cmd shortcuts in before-input-event, and before-quit refuses to quit anyway.
  if (ROLE.kiosk) return IS_MAC ? Menu.buildFromTemplate([{ label: APP_NAME, submenu: [] }, EDIT_MENU]) : null;
  const view = [
    { label: 'Muat ulang', accelerator: 'CmdOrCtrl+R', click: reloadMain },
    { label: 'Muat ulang', accelerator: 'F5', click: reloadMain, visible: false, acceleratorWorksWhenHidden: true },
    { type: 'separator' },
    { label: 'Perbesar', role: 'zoomIn', accelerator: 'CmdOrCtrl+=' },
    { label: 'Perbesar', role: 'zoomIn', accelerator: 'CmdOrCtrl+Plus', visible: false, acceleratorWorksWhenHidden: true },
    { label: 'Perkecil', role: 'zoomOut', accelerator: 'CmdOrCtrl+-' },
    { label: 'Ukuran normal', role: 'resetZoom', accelerator: 'CmdOrCtrl+0' },
    { type: 'separator' },
    { label: 'Layar penuh', role: 'togglefullscreen', accelerator: 'F11' },
  ];
  if (DEV) view.push({ type: 'separator' }, { label: 'DevTools', role: 'toggleDevTools' });
  if (IS_MAC) {
    // A normal macOS app menu: the first menu is the app menu (named after the app).
    return Menu.buildFromTemplate([
      {
        label: APP_NAME,
        submenu: [
          { label: `Tentang ${APP_NAME}`, click: showAbout },
          { type: 'separator' },
          { label: 'Ganti server…', accelerator: 'Cmd+Shift+S', click: changeServer },
          { type: 'separator' },
          { label: `Sembunyikan ${APP_NAME}`, role: 'hide' },
          { label: 'Sembunyikan lainnya', role: 'hideOthers' },
          { label: 'Tampilkan semua', role: 'unhide' },
          { type: 'separator' },
          { label: `Keluar dari ${APP_NAME}`, role: 'quit', accelerator: 'Cmd+Q' },
        ],
      },
      EDIT_MENU,
      { label: 'Tampilan', submenu: view },
      {
        label: 'Jendela',
        submenu: [
          { label: 'Kecilkan', role: 'minimize' },
          { label: 'Perbesar jendela', role: 'zoom' },
          { type: 'separator' },
          { label: 'Bawa semua ke depan', role: 'front' },
        ],
      },
    ]);
  }
  return Menu.buildFromTemplate([
    {
      label: 'Aplikasi',
      submenu: [
        { label: 'Ganti server…', accelerator: 'CmdOrCtrl+Shift+S', click: changeServer },
        { label: `Tentang ${APP_NAME}`, click: showAbout },
        { type: 'separator' },
        { label: 'Keluar', role: 'quit', accelerator: 'Alt+F4' },
      ],
    },
    EDIT_MENU,
    { label: 'Tampilan', submenu: view },
  ]);
}

/* ---------------------------------------------------------------- downloads */

function safeFileName(name) {
  const cleaned = String(name || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim();
  return cleaned || 'unduhan';
}

/**
 * Admin only: reports (Excel/PDF) and installers from the server origin. Electron shows a save
 * dialog because no save path is set; it starts in the user's Downloads folder.
 */
function handleDownload(event, item, wc) {
  const url = item.getURL();
  const pageUrl = wc && !wc.isDestroyed() ? wc.getURL() : '';
  const fromServer =
    sameOrigin(url, state.config.server) ||
    ((url.startsWith('blob:') || url.startsWith('data:')) && sameOrigin(pageUrl, state.config.server));
  if (!ROLE.downloads || !fromServer) {
    event.preventDefault();
    log.warn('keamanan: unduhan diblokir', url.slice(0, 200));
    return;
  }
  const fileName = safeFileName(item.getFilename());
  item.setSaveDialogOptions({
    title: 'Simpan file',
    defaultPath: path.join(app.getPath('downloads'), fileName),
    buttonLabel: 'Simpan',
  });
  log.info('unduhan: mulai', fileName);
  const win = state.mainWin;
  item.on('updated', () => {
    const total = item.getTotalBytes();
    if (alive(win) && total > 0) win.setProgressBar(item.getReceivedBytes() / total);
  });
  item.once('done', (_e, result) => {
    if (alive(win)) win.setProgressBar(-1);
    if (result === 'completed') {
      log.info('unduhan: selesai', item.getSavePath());
    } else if (result === 'cancelled') {
      log.info('unduhan: dibatalkan', fileName);
    } else {
      log.warn('unduhan: gagal', fileName, result);
      dialog.showMessageBox(alive(win) ? win : undefined, {
        type: 'error',
        title: 'Unduhan gagal',
        message: `File ${fileName} gagal diunduh.`,
        detail: 'Periksa koneksi ke server lalu coba lagi.',
        buttons: ['Tutup'],
      }).catch(() => {});
    }
  });
}

/* ---------------------------------------------------------------------- IPC */

const fromSetup = (event) => Boolean(state.setupWin && event.sender === state.setupWin.webContents);
const fromPin = (event) => Boolean(state.pinWin && event.sender === state.pinWin.webContents);
function fromOfflinePage(event) {
  const win = state.mainWin;
  if (!alive(win) || event.sender !== win.webContents) return false;
  const url = String(event.senderFrame?.url || '');
  return url.startsWith('file:') && url.split('?')[0].endsWith('/offline.html');
}

function registerIpc() {
  ipcMain.handle('offline:rescan', async (event) => {
    if (!fromOfflinePage(event)) throw new Error('forbidden');
    log.info('offline: cari ulang server (tombol)');
    const reconnected = await relocate();
    // Admin/Loket: nothing matched, so let the user choose a server.
    if (!reconnected && !ROLE.kiosk) openSetup('edit');
    return { ok: true, reconnected };
  });

  ipcMain.handle('setup:init', async (event) => {
    if (!fromSetup(event)) throw new Error('forbidden');
    const cfg = state.config;
    return {
      mode: state.setupMode,
      role: ROLE.id,
      pairing: ROLE.pairing,
      label: ROLE.label,
      version: app.getVersion(),
      appName: APP_NAME,
      icon: brandIconDataUrl(),
      server: cfg.server,
      serverName: cfg.serverName,
      deviceName: cfg.deviceName,
      hasPin: Boolean(cfg.pinHash),
      lockdown: LOCKDOWN,
      logFile: log.file,
    };
  });

  ipcMain.handle('setup:scan', async (event) => {
    if (!fromSetup(event)) throw new Error('forbidden');
    const sender = event.sender;
    const toPlain = (s) => ({ name: s.name, url: s.url, address: s.address, version: s.version, local: discovery.isLoopback(s.address) });
    const servers = await runScan((s) => {
      if (!sender.isDestroyed()) sender.send('setup:found', toPlain(s));
    });
    return servers.map(toPlain);
  });

  ipcMain.handle('setup:check', async (event, input) => {
    if (!fromSetup(event)) throw new Error('forbidden');
    const server = normaliseServer(input);
    if (!server) return { ok: false, message: 'Alamat server tidak valid. Contoh: 192.168.1.10:3000' };
    const ok = await discovery.checkHealth(server);
    if (ok) return { ok: true, server };
    const message = discovery.localNetworkBlocked()
      ? localNetworkHint()
      : `Server ${server} tidak menjawab (${discovery.lastNetworkError() || 'tidak ada jawaban'}). Periksa alamat dan jaringan.`;
    log.warn('setup: server tidak menjawab', server, discovery.lastNetworkError());
    return { ok: false, server, message };
  });

  ipcMain.handle('setup:network', async (event) => {
    if (!fromSetup(event)) throw new Error('forbidden');
    return discovery.localNetworkBlocked() ? { blocked: true, message: localNetworkHint() } : { blocked: false };
  });

  ipcMain.handle('setup:cancel', async (event) => {
    if (!fromSetup(event)) throw new Error('forbidden');
    if (state.setupMode !== 'edit' || !isComplete()) return { ok: false };
    log.info('setup: dibatalkan');
    openMain();
    closeSetup();
    return { ok: true };
  });

  // TV "Keluar aplikasi" in the settings window: reaching edit-mode settings already needed the
  // PIN (when one is set), so this is an authorised exit.
  ipcMain.handle('setup:exit', async (event) => {
    if (!fromSetup(event)) throw new Error('forbidden');
    if (!ROLE.kiosk || state.setupMode !== 'edit' || !isComplete()) return { ok: false };
    setImmediate(() => authorisedExit('dari pengaturan'));
    return { ok: true };
  });

  ipcMain.handle('setup:submit', async (event, form) => {
    if (!fromSetup(event)) throw new Error('forbidden');
    const cfg = state.config;

    const server = normaliseServer(form.server);
    if (!server) return { ok: false, field: 'server', message: 'Alamat server tidak valid. Contoh: 192.168.1.10:3000' };

    const code = ROLE.pairing ? normaliseCode(form.code || '') : '';
    if (code && !isValidCode(code)) {
      return { ok: false, field: 'code', message: 'Kode pemasangan harus 6 karakter (huruf dan angka).' };
    }
    // TV: the PIN stays optional (recommended); when typed it must be valid and confirmed.
    const pinGiven = ROLE.pairing && (form.pin !== '' || form.pinConfirm !== '');
    if (pinGiven) {
      if (!isValidPin(form.pin)) return { ok: false, field: 'pin', message: 'PIN admin minimal 4 angka (hanya angka).' };
      if (form.pin !== form.pinConfirm) return { ok: false, field: 'pinConfirm', message: 'Konfirmasi PIN tidak sama.' };
    }

    if (!(await discovery.checkHealth(server))) {
      return { ok: false, field: 'server', message: `Server ${server} tidak menjawab. Periksa alamat dan jaringan.` };
    }
    const serverName = await learnServerName(server).catch(() => '');

    let { token, deviceName } = cfg;
    let approved = true;
    if (ROLE.pairing) {
      // The same server at a new address (same announced name) keeps its device token.
      const sameServer = server === cfg.server || Boolean(serverName && serverName === cfg.serverName);
      if (code || !token || !sameServer) {
        log.info(`setup: ${code ? 'memasangkan perangkat dengan kode' : 'menyambungkan TV otomatis'} ke`, server);
        const result = await pair(server, code, { expectedKind: ROLE.expectedKind, installId: cfg.installId });
        if (!result.ok) return { ok: false, field: result.field, message: result.message };
        token = result.token;
        deviceName = result.name || deviceName;
        approved = result.approved;
        state.pairBlocked = false;
        state.lastRepairAt = Date.now();
      }
    }

    const pinHash = pinGiven ? await hashPin(form.pin) : cfg.pinHash || '';
    const changed = server !== cfg.server || token !== cfg.token;
    state.config = config.save({ ...cfg, server, serverName, token, pinHash, deviceName });
    log.info(`setup: pengaturan disimpan server=${server} nama="${serverName || '-'}" perangkat="${deviceName || '-'}"`);
    enableAutoStart();

    // Open the main window first so the app never has zero windows.
    if (alive(state.mainWin)) {
      if (changed || state.offline) loadMain();
    } else {
      openMain();
    }
    closeSetup();
    return { ok: true, deviceName, serverName, approved };
  });

  ipcMain.handle('pin:state', async (event) => {
    if (!fromPin(event)) throw new Error('forbidden');
    return { lockedSeconds: pinLockSeconds(), deviceName: state.config.deviceName, version: app.getVersion() };
  });

  ipcMain.handle('pin:cancel', async (event) => {
    if (!fromPin(event)) throw new Error('forbidden');
    closePin();
    return { ok: true };
  });

  ipcMain.handle('pin:submit', async (event, pin, action) => {
    if (!fromPin(event)) throw new Error('forbidden');
    if (action !== 'exit' && action !== 'settings') return { ok: false, message: 'Aksi tidak dikenal.' };
    const locked = pinLockSeconds();
    if (locked > 0) return { ok: false, lockedSeconds: locked, message: `Terlalu banyak percobaan. Coba lagi dalam ${locked} detik.` };

    const valid = await verifyPin(pin, state.config.pinHash);
    if (!valid) {
      state.pinFailures += 1;
      log.warn(`admin: PIN salah (${state.pinFailures}/${PIN_MAX_FAILURES})`);
      if (state.pinFailures >= PIN_MAX_FAILURES) {
        state.pinFailures = 0;
        state.pinLockedUntil = Date.now() + PIN_LOCK_MS;
        log.warn('admin: prompt PIN dikunci 60 detik');
        return { ok: false, lockedSeconds: pinLockSeconds(), message: 'PIN salah 5 kali. Dikunci selama 60 detik.' };
      }
      const left = PIN_MAX_FAILURES - state.pinFailures;
      return { ok: false, message: `PIN salah. Sisa ${left} percobaan.` };
    }

    state.pinFailures = 0;
    // Defer so the IPC reply is delivered before the window goes away.
    setImmediate(() => (action === 'exit' ? authorisedExit() : openSettingsFromTv()));
    return { ok: true };
  });
}

/* --------------------------------------------------------------- lifecycle */

// Admin/Loket pages may go fullscreen and copy text (pair codes) on the server origin. The TV
// needs no permission at all (speech synthesis and autoplay are not permission-gated).
const ALLOWED_PERMISSIONS = ROLE.kiosk ? new Set() : new Set(['fullscreen', 'clipboard-sanitized-write']);

function hardenSessions() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const allowed = ALLOWED_PERMISSIONS.has(permission) && sameOrigin(details?.requestingUrl, state.config.server);
    if (!allowed) log.info('keamanan: izin ditolak', permission);
    callback(allowed);
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    return ALLOWED_PERMISSIONS.has(permission) && sameOrigin(requestingOrigin, state.config.server);
  });
  ses.on('will-download', handleDownload);
  // Simulation: every window title (pages set their own <title>) says "(Simulasi)".
  if (SIMULATION) {
    app.on('browser-window-created', (_e, win) => {
      win.setTitle(simulationTitle(win.getTitle(), APP_NAME));
      win.on('page-title-updated', (event, title) => {
        event.preventDefault();
        win.setTitle(simulationTitle(title, APP_NAME));
      });
    });
  }
  app.on('web-contents-created', (_e, wc) => {
    wc.on('will-attach-webview', (event) => event.preventDefault());
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
}

app.on('second-instance', () => {
  const win = state.pinWin || state.setupWin || state.mainWin;
  if (alive(win)) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});

app.on('window-all-closed', () => {
  // TV: quit only on an authorised exit or when closing the first-run setup. Admin/Loket: always.
  if (!ROLE.kiosk || state.quitting || !isComplete()) app.quit();
});

app.on('before-quit', (event) => {
  // Production TV: once set up, only an authorised exit or OS shutdown / session end may quit.
  // Simulation / development TV and Admin/Loket quit normally.
  if (LOCKDOWN && !state.quitting && isComplete()) {
    event.preventDefault();
    log.info('aplikasi: permintaan keluar diblokir');
    return;
  }
  state.quitting = true;
  stopRetry();
  if (state.blockerId !== null && powerSaveBlocker.isStarted(state.blockerId)) powerSaveBlocker.stop(state.blockerId);
  log.info('aplikasi: keluar');
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildMenu());
  log.init(app.getPath('userData'), `${ROLE.id}.log`);
  config.init(app.getPath('userData'));
  if (process.platform === 'win32') app.setAppUserModelId(ROLE.appId);
  log.info(
    `aplikasi: mulai ${APP_NAME} (${ROLE.id}) versi ${app.getVersion()} ${DEV ? '(dev)' : ''}${SIMULATION ? ' (simulasi)' : ''}${LOCKDOWN ? ' (terkunci)' : ''} userData=${app.getPath('userData')}`,
  );

  powerMonitor.on('shutdown', () => {
    state.quitting = true;
    app.quit();
  });

  hardenSessions();
  registerIpc();
  state.config = ROLE.pairing ? config.ensureInstallId(config.load()) : config.load();

  if (ROLE.kiosk) {
    state.blockerId = powerSaveBlocker.start('prevent-display-sleep');
    log.info('tv: layar dijaga tetap menyala');
  }

  if (isComplete()) {
    enableAutoStart();
    openMain();
  } else {
    openSetup('first');
  }
});
