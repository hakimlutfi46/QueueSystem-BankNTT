'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { BrowserWindow, shell } = require('electron');
const log = require('./logger');

const JOB_TIMEOUT_MS = 15_000;
const SETTLE_MS = 300;
const DEFAULT_WIDTH_MM = 80;
const FALLBACK_HEIGHT_MM = 297;
const MIN_HEIGHT_MM = 40;
const MAX_HEIGHT_MM = 1000;
const EXTRA_FEED_MM = 4;
const PX_PER_MM = 96 / 25.4;
const VIEWPORT_HEIGHT_PX = 120; // short, so `height: 100%` pages do not inflate the measurement

/*
 * Page size decision
 * ------------------
 * The ticket page declares `@page { size: <width>mm auto; margin: 0 }`.
 * "80mm auto" is not a valid value for the CSS `size` property (it accepts one
 * or two lengths, or a keyword), so Chromium drops the declaration, and in any
 * case a *silent* webContents.print() lays out on the paper size from the
 * print settings, not on CSS @page (preferCSSPageSize exists only for
 * printToPDF). Left alone, Chromium would use the printer default (often A4 or
 * "80 x 297 mm") and scale/shift the ticket.
 *
 * So we compute the size ourselves and pass `pageSize` in microns:
 *   width  = the @page width found in the page's CSS (CSSOM first, then the raw
 *            text of <style>/<link rel=stylesheet>, so the invalid-but-intended
 *            "80mm auto" is still read); default 80 mm.
 *   height = the rendered content height at that width (+4 mm feed), clamped to
 *            40..1000 mm. If measuring fails we use 297 mm and rely on the
 *            thermal driver's "cut at end of document / skip blank" behaviour.
 * Measured height (instead of always 297 mm) avoids feeding ~20 cm of blank
 * paper on drivers that do not trim trailing white space.
 *
 * Escape hatch: config.json "usePrinterDefaultPageSize": true uses the paper
 * size configured in the Windows driver instead (for drivers that reject
 * custom sizes).
 */
// Content height in CSS px. documentElement.scrollHeight is never smaller than
// the viewport, so it is not used; the hidden window is also kept short.
const CONTENT_HEIGHT = `Math.ceil(Math.max(
  document.documentElement.getBoundingClientRect().height,
  document.body ? document.body.scrollHeight : 0
))`;

const MEASURE_SCRIPT = `(async () => {
  const toMm = (value) => {
    const m = /^\\s*([\\d.]+)\\s*(mm|cm|in|px)?\\s*$/i.exec(value || '');
    if (!m) return null;
    const n = parseFloat(m[1]);
    const unit = (m[2] || 'px').toLowerCase();
    return unit === 'mm' ? n : unit === 'cm' ? n * 10 : unit === 'in' ? n * 25.4 : n / ${PX_PER_MM};
  };
  const fromSize = (size) => {
    if (!size) return null;
    const first = String(size).trim().split(/\\s+/)[0];
    return toMm(first);
  };
  const fromText = (text) => {
    const re = /@page[^{]*\\{([^}]*)\\}/gi;
    let m;
    while ((m = re.exec(text))) {
      const s = /(?:^|;|\\s)size\\s*:\\s*([^;}]+)/i.exec(m[1]);
      const mm = s && fromSize(s[1]);
      if (mm) return mm;
    }
    return null;
  };
  const walk = (rules) => {
    for (const rule of rules || []) {
      if (rule.type === 6 /* PAGE_RULE */) {
        const mm = fromSize(rule.style && rule.style.getPropertyValue('size')) || fromText(rule.cssText);
        if (mm) return mm;
      }
      if (rule.cssRules) {
        const mm = walk(rule.cssRules);
        if (mm) return mm;
      }
    }
    return null;
  };
  let widthMm = null;
  for (const sheet of Array.from(document.styleSheets)) {
    try { widthMm = walk(sheet.cssRules); } catch (e) {}
    if (widthMm) break;
  }
  if (!widthMm) {
    widthMm = fromText(Array.from(document.querySelectorAll('style')).map((s) => s.textContent).join('\\n'));
  }
  if (!widthMm) {
    for (const link of Array.from(document.querySelectorAll('link[rel~="stylesheet"]'))) {
      try {
        const text = await (await fetch(link.href, { credentials: 'same-origin' })).text();
        widthMm = fromText(text);
      } catch (e) {}
      if (widthMm) break;
    }
  }
  const imgs = Array.from(document.images).filter((img) => !img.complete);
  await Promise.race([
    Promise.all(imgs.map((img) => new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); }))),
    new Promise((r) => setTimeout(r, 5000)),
  ]);
  try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2000))]); } catch (e) {}
  return { widthMm, heightPx: ${CONTENT_HEIGHT}, path: location.pathname };
})()`;

const MEASURE_HEIGHT_SCRIPT = CONTENT_HEIGHT;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function translateFailure(reason) {
  const r = String(reason || '');
  if (/cancel/i.test(r)) return 'Pencetakan dibatalkan.';
  if (/invalid printer settings/i.test(r)) return 'Pengaturan printer tidak valid. Periksa printer di Pengaturan.';
  if (/invalid deviceName/i.test(r)) return 'Printer tidak ditemukan.';
  return 'Gagal mencetak tiket. Periksa printer.';
}

/**
 * Loads `url` in a hidden window and prepares it for printing.
 * Uses the default session so the kiosk's httpOnly cookie is sent.
 */
async function preparePage(win, url, { allowedOrigin, expectPathPrefix }) {
  const wc = win.webContents;
  let httpStatus = 200;
  wc.on('did-navigate', (_e, _url, code) => {
    httpStatus = code;
  });
  wc.on('will-navigate', (e, target) => {
    if (allowedOrigin && new URL(target).origin !== allowedOrigin) e.preventDefault();
  });
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));

  await win.loadURL(url);
  if (httpStatus >= 400) {
    throw Object.assign(new Error(`HTTP ${httpStatus}`), {
      userMessage:
        httpStatus === 404
          ? 'Tiket tidak ditemukan.'
          : httpStatus === 401 || httpStatus === 403
            ? 'Sesi kiosk tidak valid. Hubungi petugas.'
            : `Halaman tiket gagal dimuat (HTTP ${httpStatus}).`,
    });
  }

  // Measure with print styles applied (@media print), like the real output.
  try {
    wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'print' });
  } catch {
    // not fatal: screen styles are a close enough approximation
  }
  await wait(SETTLE_MS);
  const info = await wc.executeJavaScript(MEASURE_SCRIPT, true);
  if (expectPathPrefix && !String(info.path || '').startsWith(expectPathPrefix)) {
    // Redirected somewhere else (e.g. a sign-in page): the cookie session is gone.
    throw Object.assign(new Error(`redirected to ${info.path}`), {
      userMessage: 'Sesi kiosk tidak valid. Muat ulang kiosk atau hubungi petugas.',
    });
  }

  const widthMm = info.widthMm && info.widthMm >= 30 && info.widthMm <= 120 ? info.widthMm : DEFAULT_WIDTH_MM;
  let heightPx = info.heightPx;
  const widthPx = Math.round(widthMm * PX_PER_MM);
  const [currentWidth] = win.getContentSize();
  if (currentWidth !== widthPx) {
    // Re-layout at the real paper width before measuring the height.
    win.setContentSize(widthPx, VIEWPORT_HEIGHT_PX);
    await wait(150);
    heightPx = await wc.executeJavaScript(MEASURE_HEIGHT_SCRIPT, true);
  }

  let heightMm = Number.isFinite(heightPx) && heightPx > 0 ? heightPx / PX_PER_MM + EXTRA_FEED_MM : FALLBACK_HEIGHT_MM;
  heightMm = Math.min(MAX_HEIGHT_MM, Math.max(MIN_HEIGHT_MM, heightMm));

  return {
    widthMm,
    heightMm,
    // Electron expects microns.
    pageSize: { width: Math.round(widthMm * 1000), height: Math.round(heightMm * 1000) },
  };
}

function createHiddenWindow(widthMm = DEFAULT_WIDTH_MM) {
  return new BrowserWindow({
    show: false,
    useContentSize: true,
    width: Math.round(widthMm * PX_PER_MM),
    height: VIEWPORT_HEIGHT_PX,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      javascript: true,
      backgroundThrottling: false,
      spellcheck: false,
      devTools: false,
    },
  });
}

function printWebContents(wc, options) {
  return new Promise((resolve) => {
    try {
      wc.print(options, (success, failureReason) => resolve({ success, failureReason }));
    } catch (err) {
      resolve({ success: false, failureReason: err.message });
    }
  });
}

/**
 * One print job. Resolves { ok, message } and never rejects.
 * `printerName` '' means the system default printer.
 */
async function runJob({ url, printerName, label, allowedOrigin, expectPathPrefix, usePrinterDefaultPageSize }) {
  const started = Date.now();
  const win = createHiddenWindow();
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, message: 'Waktu mencetak habis. Periksa printer.', timeout: true }), JOB_TIMEOUT_MS);
  });

  const job = (async () => {
    const page = await preparePage(win, url, { allowedOrigin, expectPathPrefix });
    const options = {
      silent: true,
      printBackground: false,
      color: false,
      margins: { marginType: 'none' },
      copies: 1,
    };
    if (printerName) options.deviceName = printerName;
    if (usePrinterDefaultPageSize) options.usePrinterDefaultPageSize = true;
    else options.pageSize = page.pageSize;

    const { success, failureReason } = await printWebContents(win.webContents, options);
    return success
      ? { ok: true, message: null, page }
      : { ok: false, message: translateFailure(failureReason), failureReason, page };
  })().catch((err) => ({
    ok: false,
    message: err.userMessage || 'Halaman tiket gagal dimuat. Periksa koneksi ke server.',
    failureReason: err.message,
  }));

  const result = await Promise.race([job, timeout]);
  clearTimeout(timer);
  if (!win.isDestroyed()) win.destroy();

  const ms = Date.now() - started;
  const size = result.page ? `${result.page.widthMm.toFixed(0)}x${result.page.heightMm.toFixed(0)}mm` : '-';
  if (result.ok) log.info(`print: OK ${label} printer="${printerName || '(default)'}" ukuran=${size} ${ms}ms`);
  else log.warn(`print: GAGAL ${label} printer="${printerName || '(default)'}" alasan="${result.failureReason || result.message}" ${ms}ms`);
  return { ok: result.ok, message: result.ok ? null : result.message };
}

/**
 * Development only (--no-printer): renders the same ticket page at the same paper size,
 * but saves it as a PDF in `outDir` and opens it instead of sending it to a printer.
 */
async function runPdfJob({ url, label, allowedOrigin, expectPathPrefix }, outDir) {
  const win = createHiddenWindow();
  try {
    const page = await preparePage(win, url, { allowedOrigin, expectPathPrefix });
    const data = await win.webContents.printToPDF({
      pageSize: { width: page.widthMm / 25.4, height: page.heightMm / 25.4 },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      printBackground: false,
    });
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(outDir, `${label.replace(/[^A-Za-z0-9_-]+/g, '-')}-${stamp}.pdf`);
    fs.writeFileSync(file, data);
    log.info(`print: PDF ${label} ukuran=${page.widthMm.toFixed(0)}x${page.heightMm.toFixed(0)}mm -> ${file}`);
    shell.openPath(file).catch(() => {});
    return { ok: true, message: null };
  } catch (err) {
    log.warn(`print: GAGAL PDF ${label} alasan="${err.message}"`);
    return { ok: false, message: err.userMessage || 'Halaman tiket gagal dimuat. Periksa koneksi ke server.' };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

/**
 * Serialises jobs so two quick tickets never race for the printer.
 * With `pdfDir` (development --no-printer), tickets are saved as PDF files there instead.
 */
function createPrintQueue({ pdfDir } = {}) {
  let tail = Promise.resolve();
  return function enqueue(job) {
    const run = tail.then(() => (pdfDir ? runPdfJob(job, pdfDir) : runJob(job)));
    tail = run.catch(() => {});
    return run;
  };
}

/** Development only (--no-printer): a single always-ready "PDF" printer. */
function createPdfPrinterStatus() {
  const printer = { name: '', displayName: 'PDF (mode pengembangan, tanpa printer)' };
  return {
    listPrinters: async () => [printer],
    status: async () => ({ ready: true, printer: printer.displayName, message: null }),
    exists: async (name) => !name,
    defaultPrinterName: async () => '',
    start() {},
    stop() {},
    invalidate() {},
  };
}

module.exports = { createPrintQueue, createPdfPrinterStatus, preparePage, createHiddenWindow, runJob };
