'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, ipcMain, Menu, session, powerMonitor, shell } = require('electron');

const log = require('./logger');
const config = require('./config');
const { hashPin, verifyPin, isValidPin } = require('./pin');
const { pair } = require('./pairing');
const { normaliseServer, normaliseCode, isValidCode, sameOrigin, isValidTicketId } = require('./server-url');
const { lockKeyboard } = require('./keys');
const { createPrintQueue, createPdfPrinterStatus } = require('./printing');
const { createPrinterStatus } = require('./printer-status');

// --dev (or KIOSK_DEV=1): windowed instead of kiosk/fullscreen, DevTools allowed.
const DEV = process.argv.includes('--dev') || process.env.KIOSK_DEV === '1';
// --no-printer (or KIOSK_NO_PRINTER=1): tickets are saved as PDF files instead of printed, for
// trying the kiosk on a laptop without a thermal printer. Ignored in a packaged (installed) app,
// so a branch kiosk can never hand out numbers without a printed ticket.
const NO_PRINTER_REQUESTED = process.argv.includes('--no-printer') || process.env.KIOSK_NO_PRINTER === '1';
const NO_PRINTER = NO_PRINTER_REQUESTED && !app.isPackaged;
const RENDERER = path.join(__dirname, 'renderer');
const PRELOAD = path.join(__dirname, 'preload');
const RETRY_MS = 5_000;
const UNRESPONSIVE_GRACE_MS = 10_000;
const ADMIN_MAX_FAILURES = 5;
const ADMIN_LOCK_MS = 60_000;

// Settings live in a fixed folder (%APPDATA%\kiosk-antrian), not one named after productName, so a
// rebuild with another app name from the admin panel keeps the pairing, printer, and PIN.
app.setPath(
  'userData',
  process.env.KIOSK_USER_DATA ? path.resolve(process.env.KIOSK_USER_DATA) : path.join(app.getPath('appData'), 'kiosk-antrian'),
);

// Name and icon are chosen when the installer is built (scripts/build-and-copy.mjs).
const APP_NAME = app.getName();
const BRAND_ICON = app.isPackaged
  ? path.join(process.resourcesPath, 'brand-icon.png')
  : path.join(__dirname, '..', '..', '..', 'public', 'brand', 'kiosk-app-icon.png');
// The "Ticket + Server" installer (build-and-copy.mjs --with-server) ships the queue server in
// resources/server and runs it as a Windows service on this PC, so setup starts from 127.0.0.1.
const BUNDLED_SERVER = app.isPackaged
  ? fs.existsSync(path.join(process.resourcesPath, 'server', 'bundle-manifest.json'))
  : process.env.KIOSK_BUNDLED_SERVER === '1';
const LOCAL_SERVER = 'http://127.0.0.1:3000';
const windowIcon = () => (fs.existsSync(BRAND_ICON) ? BRAND_ICON : undefined);

function brandIconDataUrl() {
  try {
    return `data:image/png;base64,${fs.readFileSync(BRAND_ICON).toString('base64')}`;
  } catch {
    return null;
  }
}

// A packaged kiosk must never expose a debugging port.
if (app.isPackaged && (app.commandLine.hasSwitch('remote-debugging-port') || app.commandLine.hasSwitch('remote-debugging-pipe'))) {
  app.exit(1);
}

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}

const state = {
  config: null,
  kioskWin: null,
  setupWin: null,
  setupMode: null,
  adminWin: null,
  quitting: false, // authorised exit in progress
  allowKioskClose: false, // switching to settings
  offline: false,
  retryTimer: null,
  unresponsiveTimer: null,
  adminFailures: 0,
  adminLockedUntil: 0,
};

const printers = NO_PRINTER
  ? createPdfPrinterStatus()
  : createPrinterStatus({ getPrinterName: () => state.config?.printerName || '' });
const enqueuePrint = createPrintQueue(NO_PRINTER ? { pdfDir: path.join(app.getPath('downloads'), 'kiosk-tiket-pdf') } : {});

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

function rendererFile(name) {
  return path.join(RENDERER, name);
}

function enableAutoStart() {
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

function kioskUrl() {
  return `${state.config.server}/kiosk?token=${encodeURIComponent(state.config.token)}`;
}

/* ------------------------------------------------------------- kiosk window */

function stopRetry() {
  if (state.retryTimer) clearInterval(state.retryTimer);
  state.retryTimer = null;
}

function loadKiosk() {
  const win = state.kioskWin;
  if (!win || win.isDestroyed()) return;
  stopRetry();
  state.offline = false;
  log.info('kiosk: memuat', state.config.server);
  win.loadURL(kioskUrl()).catch(() => {
    // did-fail-load handles the UI; the promise rejection is expected here.
  });
}

async function serverReachable() {
  try {
    const res = await fetch(`${state.config.server}/kiosk`, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(4_000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

function showOffline(reason) {
  const win = state.kioskWin;
  if (!win || win.isDestroyed()) return;
  log.warn('kiosk: server tidak dapat dijangkau:', reason);
  if (!state.offline) {
    state.offline = true;
    win
      .loadFile(rendererFile('offline.html'), { query: { server: state.config.server, retry: String(RETRY_MS / 1000) } })
      .catch(() => {});
  }
  if (!state.retryTimer) {
    let busy = false;
    state.retryTimer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        if (await serverReachable()) {
          log.info('kiosk: server kembali tersedia');
          loadKiosk();
        }
      } finally {
        busy = false;
      }
    }, RETRY_MS);
  }
}

function createKioskWindow() {
  const win = new BrowserWindow({
    show: false,
    kiosk: !DEV,
    fullscreen: !DEV,
    frame: false,
    width: 1280,
    height: 800,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    title: APP_NAME,
    icon: windowIcon(),
    webPreferences: {
      ...baseWebPreferences('kiosk.js'),
      additionalArguments: [`--kiosk-app-version=${app.getVersion()}`],
    },
  });
  win.setMenu(null);
  state.kioskWin = win;
  const wc = win.webContents;

  lockKeyboard(wc, { onAdmin: openAdmin });

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  win.on('close', (event) => {
    if (!state.quitting && !state.allowKioskClose) {
      event.preventDefault();
      log.info('kiosk: penutupan jendela diblokir');
    }
  });
  win.on('closed', () => {
    if (state.kioskWin === win) state.kioskWin = null;
    stopRetry();
    // A page calling window.close() destroys the WebContents directly and
    // bypasses the 'close' guard above, so bring the kiosk straight back.
    if (!state.quitting && !state.allowKioskClose && config.isComplete(state.config)) {
      log.warn('kiosk: jendela tertutup tanpa izin, dibuka kembali');
      setImmediate(() => {
        if (!state.quitting && !state.kioskWin && !state.setupWin) openKiosk();
      });
    }
  });
  // Windows log-off / shutdown must not be blocked by the close guard.
  win.on('session-end', () => {
    state.quitting = true;
  });
  win.on('leave-full-screen', () => {
    if (!DEV && !state.quitting) setTimeout(() => !win.isDestroyed() && win.setKiosk(true), 100);
  });

  // Navigation lockdown: only the configured server's origin.
  const guard = (event, url) => {
    if (!sameOrigin(url, state.config.server)) {
      event.preventDefault();
      log.warn('kiosk: navigasi diblokir ke', url);
    }
  };
  wc.on('will-navigate', guard);
  wc.on('will-redirect', guard);
  wc.on('will-frame-navigate', (event) => {
    if (!event.isMainFrame && !sameOrigin(event.url, state.config.server) && !String(event.url).startsWith('about:')) {
      event.preventDefault();
    }
  });
  wc.setWindowOpenHandler(({ url }) => {
    log.warn('kiosk: jendela baru diblokir', url);
    return { action: 'deny' };
  });

  wc.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 /* ERR_ABORTED */) return;
    if (String(validatedURL).startsWith('file:')) return;
    showOffline(`${errorCode} ${errorDescription} (${validatedURL})`);
  });
  wc.on('did-navigate', (_e, url, httpResponseCode) => {
    if (httpResponseCode >= 502 && httpResponseCode <= 504 && sameOrigin(url, state.config.server)) {
      showOffline(`HTTP ${httpResponseCode}`);
    }
  });
  wc.on('did-finish-load', () => {
    wc.setVisualZoomLevelLimits(1, 1).catch(() => {});
  });

  wc.on('render-process-gone', (_e, details) => {
    log.error('kiosk: renderer berhenti:', details.reason, 'exitCode =', details.exitCode);
    if (state.quitting || win.isDestroyed()) return;
    setTimeout(() => {
      if (win.isDestroyed()) return;
      if (state.offline) {
        state.offline = false;
        showOffline('reload setelah crash');
      } else {
        loadKiosk();
      }
    }, 1_000);
  });
  win.on('unresponsive', () => {
    log.warn('kiosk: halaman tidak merespons');
    clearTimeout(state.unresponsiveTimer);
    state.unresponsiveTimer = setTimeout(() => {
      if (win.isDestroyed()) return;
      log.error('kiosk: masih tidak merespons, renderer dimulai ulang');
      wc.forcefullyCrashRenderer(); // -> render-process-gone -> reload
    }, UNRESPONSIVE_GRACE_MS);
  });
  win.on('responsive', () => {
    clearTimeout(state.unresponsiveTimer);
  });

  loadKiosk();
  return win;
}

function openKiosk() {
  if (state.kioskWin && !state.kioskWin.isDestroyed()) {
    state.kioskWin.focus();
    return;
  }
  createKioskWindow();
}

/* ------------------------------------------------------------- setup window */

function openSetup(mode) {
  if (state.setupWin && !state.setupWin.isDestroyed()) {
    state.setupWin.focus();
    return;
  }
  state.setupMode = mode;
  const win = new BrowserWindow({
    show: false,
    width: 980,
    height: 900,
    minWidth: 720,
    minHeight: 640,
    backgroundColor: '#0a4ea3',
    autoHideMenuBar: true,
    title: `Pengaturan ${APP_NAME}`,
    icon: windowIcon(),
    webPreferences: baseWebPreferences('setup.js'),
  });
  win.setMenu(null);
  state.setupWin = win;
  lockKeyboard(win.webContents, { allowEscape: true });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.once('ready-to-show', () => {
    if (!DEV) win.maximize();
    win.show();
    win.focus();
  });
  win.on('closed', () => {
    if (state.setupWin === win) state.setupWin = null;
    // Closing the settings window in edit mode returns to the kiosk.
    if (!state.quitting && config.isComplete(state.config) && !state.kioskWin) openKiosk();
  });
  win.loadFile(rendererFile('setup.html'));
}

function closeSetup() {
  const win = state.setupWin;
  state.setupWin = null;
  if (win && !win.isDestroyed()) win.close();
}

/* ------------------------------------------------------------- admin window */

function adminLockSeconds() {
  return Math.max(0, Math.ceil((state.adminLockedUntil - Date.now()) / 1000));
}

function openAdmin() {
  if (state.adminWin && !state.adminWin.isDestroyed()) {
    state.adminWin.focus();
    return;
  }
  const parent = state.kioskWin && !state.kioskWin.isDestroyed() ? state.kioskWin : undefined;
  const win = new BrowserWindow({
    parent,
    modal: Boolean(parent),
    show: false,
    width: 480,
    height: 600,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#ffffff',
    title: 'Admin Kiosk',
    icon: windowIcon(),
    webPreferences: baseWebPreferences('admin.js'),
  });
  win.setMenu(null);
  win.setAlwaysOnTop(true, 'screen-saver');
  state.adminWin = win;
  lockKeyboard(win.webContents, { allowEscape: true });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.once('ready-to-show', () => {
    win.center();
    win.show();
    win.focus();
  });
  win.on('closed', () => {
    if (state.adminWin === win) state.adminWin = null;
  });
  win.loadFile(rendererFile('admin.html'));
  log.info('admin: prompt PIN dibuka');
}

function closeAdmin() {
  const win = state.adminWin;
  state.adminWin = null;
  if (win && !win.isDestroyed()) win.destroy();
}

function authorisedExit() {
  log.info('admin: keluar aplikasi (PIN benar)');
  state.quitting = true;
  closeAdmin();
  app.quit();
}

function openSettingsFromKiosk() {
  log.info('admin: membuka pengaturan (PIN benar)');
  closeAdmin();
  openSetup('edit');
  const kiosk = state.kioskWin;
  if (kiosk && !kiosk.isDestroyed()) {
    state.allowKioskClose = true;
    kiosk.destroy();
    state.allowKioskClose = false;
  }
  state.kioskWin = null;
}

/* ---------------------------------------------------------------------- IPC */

function fromKiosk(event) {
  const win = state.kioskWin;
  return Boolean(
    win && !win.isDestroyed() && event.sender === win.webContents && sameOrigin(event.senderFrame?.url, state.config.server),
  );
}
const fromSetup = (event) => Boolean(state.setupWin && event.sender === state.setupWin.webContents);
const fromAdmin = (event) => Boolean(state.adminWin && event.sender === state.adminWin.webContents);

async function printerExists(name) {
  if (!name) return true;
  return printers.exists(name);
}

function registerIpc() {
  ipcMain.handle('kiosk:printer-status', async (event) => {
    if (!fromKiosk(event)) throw new Error('forbidden');
    return printers.status();
  });

  ipcMain.handle('kiosk:print-ticket', async (event, ticketId) => {
    if (!fromKiosk(event)) throw new Error('forbidden');
    if (!isValidTicketId(ticketId)) {
      log.warn('print: id tiket tidak valid');
      return { ok: false, message: 'Nomor tiket tidak valid.' };
    }
    const status = await printers.status();
    if (!status.ready) {
      log.warn(`print: dibatalkan, printer belum siap (${status.message}) tiket ${ticketId}`);
      return { ok: false, message: status.message };
    }
    return enqueuePrint({
      url: `${state.config.server}/kiosk/print/${encodeURIComponent(ticketId)}`,
      printerName: state.config.printerName,
      label: `tiket ${ticketId}`,
      allowedOrigin: state.config.server,
      expectPathPrefix: '/kiosk/print/',
      usePrinterDefaultPageSize: state.config.usePrinterDefaultPageSize === true,
    });
  });

  ipcMain.handle('setup:init', async (event) => {
    if (!fromSetup(event)) throw new Error('forbidden');
    const cfg = state.config;
    const [list, defaultPrinter] = await Promise.all([
      printers.listPrinters({ fresh: true }),
      printers.defaultPrinterName().catch(() => null),
    ]);
    return {
      mode: state.setupMode,
      version: app.getVersion(),
      appName: APP_NAME,
      icon: brandIconDataUrl(),
      server: cfg.server || (BUNDLED_SERVER ? LOCAL_SERVER : ''),
      bundledServer: BUNDLED_SERVER,
      printerName: cfg.printerName,
      deviceName: cfg.deviceName,
      printers: list.map((p) => ({ name: p.name, displayName: p.displayName || p.name })),
      defaultPrinter,
      logFile: log.file,
    };
  });

  ipcMain.handle('setup:printers', async (event) => {
    if (!fromSetup(event)) throw new Error('forbidden');
    const list = await printers.listPrinters({ fresh: true });
    return list.map((p) => ({ name: p.name, displayName: p.displayName || p.name }));
  });

  ipcMain.handle('setup:test-print', async (event, printerName) => {
    if (!fromSetup(event)) throw new Error('forbidden');
    if (!(await printerExists(printerName))) {
      return { ok: false, message: `Printer ${printerName} tidak ditemukan.` };
    }
    const url = pathToFileURL(rendererFile('test-print.html'));
    url.searchParams.set('printer', printerName || '(default)');
    url.searchParams.set('server', state.config.server || '-');
    url.searchParams.set('app', APP_NAME);
    return enqueuePrint({ url: url.href, printerName, label: 'cetak uji', allowedOrigin: 'null' });
  });

  // Opens Admin → Perangkat in the default browser so the pairing code can be made on this PC.
  ipcMain.handle('setup:open-admin', async (event, input) => {
    if (!fromSetup(event)) throw new Error('forbidden');
    const server = normaliseServer(input) || (BUNDLED_SERVER ? LOCAL_SERVER : null);
    if (!server) return { ok: false, message: 'Isi alamat server dulu.' };
    log.info('setup: membuka panel admin di browser', server);
    await shell.openExternal(`${server}/admin/devices`);
    return { ok: true };
  });

  ipcMain.handle('setup:cancel', async (event) => {
    if (!fromSetup(event)) throw new Error('forbidden');
    if (state.setupMode !== 'edit' || !config.isComplete(state.config)) return { ok: false };
    log.info('setup: dibatalkan, kembali ke kiosk');
    openKiosk();
    closeSetup();
    return { ok: true };
  });

  ipcMain.handle('setup:submit', async (event, form) => {
    if (!fromSetup(event)) throw new Error('forbidden');
    const cfg = state.config;
    const edit = state.setupMode === 'edit' && config.isComplete(cfg);

    const server = normaliseServer(form.server);
    if (!server) return { ok: false, field: 'server', message: 'Alamat server tidak valid. Contoh: 10.70.10.67:3000' };

    const code = normaliseCode(form.code);
    const needsCode = !edit || server !== cfg.server || !cfg.token;
    if (code || needsCode) {
      if (!code) return { ok: false, field: 'code', message: 'Kode pemasangan wajib diisi.' };
      if (!isValidCode(code)) {
        return { ok: false, field: 'code', message: 'Kode pemasangan harus 6 karakter (huruf dan angka).' };
      }
    }

    const pinGiven = form.pin !== '' || form.pinConfirm !== '';
    if (!edit || pinGiven) {
      if (!isValidPin(form.pin)) return { ok: false, field: 'pin', message: 'PIN admin minimal 4 angka (hanya angka).' };
      if (form.pin !== form.pinConfirm) return { ok: false, field: 'pinConfirm', message: 'Konfirmasi PIN tidak sama.' };
    }

    if (form.printerName && !(await printerExists(form.printerName))) {
      return { ok: false, field: 'printer', message: `Printer ${form.printerName} tidak ditemukan.` };
    }

    let token = cfg.token;
    let deviceName = cfg.deviceName;
    if (code) {
      log.info('setup: memasangkan perangkat ke', server);
      const result = await pair(server, code);
      if (!result.ok) return { ok: false, field: result.field, message: result.message };
      token = result.token;
      deviceName = result.name;
    }

    const pinHash = !edit || pinGiven ? await hashPin(form.pin) : cfg.pinHash;
    state.config = config.save({ ...cfg, server, token, printerName: form.printerName, pinHash, deviceName });
    printers.invalidate();
    printers.start();
    log.info(`setup: pengaturan disimpan server=${server} printer="${form.printerName || '(default)'}" perangkat="${deviceName || '-'}"`);
    enableAutoStart();

    // Open the kiosk first so the app never has zero windows.
    openKiosk();
    closeSetup();
    return { ok: true, deviceName };
  });

  ipcMain.handle('admin:state', async (event) => {
    if (!fromAdmin(event)) throw new Error('forbidden');
    return { lockedSeconds: adminLockSeconds(), deviceName: state.config.deviceName, version: app.getVersion() };
  });

  ipcMain.handle('admin:cancel', async (event) => {
    if (!fromAdmin(event)) throw new Error('forbidden');
    closeAdmin();
    return { ok: true };
  });

  ipcMain.handle('admin:submit', async (event, pin, action) => {
    if (!fromAdmin(event)) throw new Error('forbidden');
    if (action !== 'exit' && action !== 'settings') return { ok: false, message: 'Aksi tidak dikenal.' };
    const locked = adminLockSeconds();
    if (locked > 0) return { ok: false, lockedSeconds: locked, message: `Terlalu banyak percobaan. Coba lagi dalam ${locked} detik.` };

    const valid = await verifyPin(pin, state.config.pinHash);
    if (!valid) {
      state.adminFailures += 1;
      log.warn(`admin: PIN salah (${state.adminFailures}/${ADMIN_MAX_FAILURES})`);
      if (state.adminFailures >= ADMIN_MAX_FAILURES) {
        state.adminFailures = 0;
        state.adminLockedUntil = Date.now() + ADMIN_LOCK_MS;
        log.warn('admin: prompt PIN dikunci 60 detik');
        return { ok: false, lockedSeconds: adminLockSeconds(), message: 'PIN salah 5 kali. Dikunci selama 60 detik.' };
      }
      const left = ADMIN_MAX_FAILURES - state.adminFailures;
      return { ok: false, message: `PIN salah. Sisa ${left} percobaan.` };
    }

    state.adminFailures = 0;
    // Defer so the IPC reply is delivered before the window goes away.
    setImmediate(() => (action === 'exit' ? authorisedExit() : openSettingsFromKiosk()));
    return { ok: true };
  });
}

/* --------------------------------------------------------------- lifecycle */

function hardenSessions() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    log.info('keamanan: izin ditolak', permission);
    callback(false);
  });
  ses.setPermissionCheckHandler(() => false);
  ses.on('will-download', (event) => {
    event.preventDefault();
    log.warn('keamanan: unduhan diblokir');
  });
  app.on('web-contents-created', (_e, wc) => {
    wc.on('will-attach-webview', (event) => event.preventDefault());
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
}

app.on('second-instance', () => {
  const win = state.adminWin || state.setupWin || state.kioskWin;
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});

app.on('window-all-closed', () => {
  // Quit only on an authorised exit or when closing the first-run setup.
  if (state.quitting || !config.isComplete(state.config)) app.quit();
});

app.on('before-quit', (event) => {
  // Only an authorised exit (or OS shutdown) may quit while the kiosk is up.
  if (state.kioskWin && !state.quitting) {
    event.preventDefault();
    return;
  }
  printers.stop();
  log.info('aplikasi: keluar');
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  log.init(app.getPath('userData'));
  config.init(app.getPath('userData'));
  if (process.platform === 'win32') app.setAppUserModelId('id.kiosk-antrian.app');
  log.info(`aplikasi: mulai versi ${app.getVersion()} ${DEV ? '(dev)' : ''} userData=${app.getPath('userData')}`);
  if (NO_PRINTER) log.warn(`printer: mode tanpa printer, tiket disimpan sebagai PDF di ${path.join(app.getPath('downloads'), 'kiosk-tiket-pdf')}`);
  else if (NO_PRINTER_REQUESTED) log.warn('printer: --no-printer diabaikan karena aplikasi terpasang (bukan mode pengembangan)');

  powerMonitor.on('shutdown', () => {
    state.quitting = true;
    app.quit();
  });

  hardenSessions();
  registerIpc();
  state.config = config.load();

  if (config.isComplete(state.config)) {
    enableAutoStart();
    openKiosk();
  } else {
    openSetup('first');
  }
  printers.start();
});
