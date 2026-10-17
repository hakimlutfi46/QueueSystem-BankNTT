'use strict';

const { execFile } = require('node:child_process');
const { BrowserWindow, webContents: allWebContents } = require('electron');
const log = require('./logger');

/*
 * Printer readiness.
 *
 * Electron's PrinterInfo (v44) only has { name, displayName, description, options }.
 * The old numeric `status` field was removed upstream, and on Windows `options`
 * carries no state at all. So:
 *
 *  - Existence: always from webContents.getPrintersAsync() (fast, in-process).
 *  - Windows state: a background PowerShell probe (every POLL_MS) reads the
 *    print queue through .NET System.Printing (PrintQueue.QueueStatus is the raw
 *    Win32 PRINTER_STATUS_* bit field) and WMI Win32_Printer (WorkOffline,
 *    PrinterStatus, DetectedErrorState). printerStatus() only reads the cached
 *    result, so it answers in well under 1 s. PowerShell start-up takes ~0.5-1.5 s,
 *    which is why it is never on the request path.
 *  - If a future Electron exposes `status` again we honour it as PRINTER_STATUS_* flags.
 *  - macOS/Linux (dev only): CUPS `printer-state` / `printer-state-reasons` options.
 *
 * Win32 PRINTER_STATUS_* flags (winspool.h) and how we treat them:
 *   0x00000001 PAUSED            -> not ready "Printer sedang dijeda."
 *   0x00000002 ERROR             -> not ready "Printer mengalami gangguan."
 *   0x00000004 PENDING_DELETION  -> not ready "Printer tidak tersedia."
 *   0x00000008 PAPER_JAM         -> not ready "Kertas macet."
 *   0x00000010 PAPER_OUT         -> not ready "Kertas habis."
 *   0x00000040 PAPER_PROBLEM     -> not ready "Ada masalah pada kertas printer."
 *   0x00000080 OFFLINE           -> not ready "Printer sedang offline."
 *   0x00001000 NOT_AVAILABLE     -> not ready "Printer tidak tersedia."
 *   0x00100000 USER_INTERVENTION -> not ready "Printer memerlukan tindakan petugas."
 *   0x00400000 DOOR_OPEN         -> not ready "Tutup printer terbuka."
 *   everything else (BUSY 0x200, PRINTING 0x400, IO_ACTIVE 0x100, WAITING 0x2000,
 *   PROCESSING 0x4000, INITIALIZING 0x8000, WARMING_UP 0x10000, TONER_LOW 0x20000,
 *   NO_TONER 0x40000, OUTPUT_BIN_FULL 0x800, MANUAL_FEED 0x20, POWER_SAVE 0x1000000,
 *   PAGE_PUNT 0x80000, OUT_OF_MEMORY 0x200000, SERVER_UNKNOWN 0x800000) -> ready.
 *
 * WMI Win32_Printer:
 *   WorkOffline = true                    -> offline
 *   PrinterStatus 7 (Offline)             -> offline
 *   DetectedErrorState 4 (No Paper)       -> paper out
 *                      8 (Jammed)         -> paper jam
 *                      9 (Offline)        -> offline
 *                      7 (Door Open)      -> door open
 *                      10 (Service Req.)  -> needs staff
 *   other values (0 Unknown, 1 Other, 2 No Error, 3 Low Paper, ...) -> ready.
 *
 * Note: many USB thermal drivers only report OFFLINE when Windows' "Use Printer
 * Offline" is ticked or the USB port vanishes; paper-out is often not reported
 * at all. Unknown / missing data is treated as READY so tickets are never
 * blocked on uncertain information (the raw values are logged).
 */

const FLAG_MESSAGES = [
  [0x00000010, 'Kertas habis.'],
  [0x00000008, 'Kertas macet.'],
  [0x00400000, 'Tutup printer terbuka.'],
  [0x00000080, 'Printer sedang offline.'],
  [0x00001000, 'Printer tidak tersedia.'],
  [0x00000004, 'Printer tidak tersedia.'],
  [0x00000040, 'Ada masalah pada kertas printer.'],
  [0x00100000, 'Printer memerlukan tindakan petugas.'],
  [0x00000002, 'Printer mengalami gangguan.'],
  [0x00000001, 'Printer sedang dijeda.'],
];

const WMI_ERROR_STATE = {
  4: 'Kertas habis.',
  7: 'Tutup printer terbuka.',
  8: 'Kertas macet.',
  9: 'Printer sedang offline.',
  10: 'Printer memerlukan tindakan petugas.',
};

const LIST_TIMEOUT_MS = 700;
const LIST_CACHE_MS = 2_000;
const POLL_MS = 15_000;
const PS_TIMEOUT_MS = 8_000;

function messageFromFlags(flags) {
  if (!Number.isFinite(flags) || flags === 0) return null;
  for (const [bit, msg] of FLAG_MESSAGES) if (flags & bit) return msg;
  return null;
}

function messageFromCups(options) {
  if (!options) return null;
  const state = String(options['printer-state'] ?? '');
  const reasons = String(options['printer-state-reasons'] ?? '');
  if (/media-empty|media-needed/.test(reasons)) return 'Kertas habis.';
  if (/media-jam/.test(reasons)) return 'Kertas macet.';
  if (/door-open|cover-open/.test(reasons)) return 'Tutup printer terbuka.';
  if (/offline/.test(reasons)) return 'Printer sedang offline.';
  if (state === '5') return 'Printer sedang dijeda.'; // 5 = stopped
  return null;
}

function messageFromWindowsProbe(probe) {
  if (!probe) return null;
  const fromFlags = messageFromFlags(Number(probe.flags));
  if (fromFlags) return fromFlags;
  if (probe.workOffline === true || Number(probe.wmiStatus) === 7) return 'Printer sedang offline.';
  return WMI_ERROR_STATE[Number(probe.errorState)] || null;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

function anyWebContents() {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (win) return win.webContents;
  return allWebContents.getAllWebContents().find((wc) => !wc.isDestroyed()) || null;
}

/* PowerShell probe. The printer name is passed via an env var, never interpolated. */
const PS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$n = $env:KIOSK_PRINTER
$r = @{ name = $n }
try {
  Add-Type -AssemblyName System.Printing
  if ($n.StartsWith('\\\\')) {
    $i = $n.LastIndexOf('\\')
    $srv = New-Object System.Printing.PrintServer($n.Substring(0, $i))
    $q = $srv.GetPrintQueue($n.Substring($i + 1))
  } else {
    $srv = New-Object System.Printing.LocalPrintServer
    $q = $srv.GetPrintQueue($n)
  }
  $q.Refresh()
  $r.flags = [int]$q.QueueStatus
} catch { $r.queueError = $_.Exception.Message }
$w = Get-CimInstance -ClassName Win32_Printer | Where-Object { $_.Name -eq $n } | Select-Object -First 1
if ($w) {
  $r.workOffline = [bool]$w.WorkOffline
  $r.wmiStatus = [int]$w.PrinterStatus
  $r.errorState = [int]$w.DetectedErrorState
}
$d = Get-CimInstance -ClassName Win32_Printer -Filter 'Default=True' | Select-Object -First 1
if ($d) { $r.defaultPrinter = [string]$d.Name }
$r | ConvertTo-Json -Compress
`;

function runPowerShell(script, env) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: PS_TIMEOUT_MS, env: { ...process.env, ...env } },
      (err, stdout) => {
        if (err) {
          resolve({ error: err.message });
          return;
        }
        try {
          resolve(JSON.parse(String(stdout).trim() || '{}'));
        } catch {
          resolve({ error: 'output tidak valid' });
        }
      },
    );
  });
}

function runLpstatDefault() {
  return new Promise((resolve) => {
    execFile('lpstat', ['-d'], { timeout: 3_000 }, (err, stdout) => {
      if (err) return resolve(null);
      const m = /destination:\s*(\S+)/.exec(String(stdout));
      resolve(m ? m[1] : null);
    });
  });
}

function createPrinterStatus({ getPrinterName }) {
  let cachedList = null;
  let cachedAt = 0;
  let probe = null; // last Windows probe for the configured printer
  let probeFor = null;
  let probing = false;
  let timer = null;
  let lastReport = null;

  async function listPrinters({ fresh = false } = {}) {
    if (!fresh && cachedList && Date.now() - cachedAt < LIST_CACHE_MS) return cachedList;
    const wc = anyWebContents();
    if (!wc) return cachedList || [];
    try {
      cachedList = await withTimeout(wc.getPrintersAsync(), fresh ? 5_000 : LIST_TIMEOUT_MS);
      cachedAt = Date.now();
    } catch (err) {
      log.warn('printer: getPrintersAsync gagal/terlambat:', err.message);
    }
    return cachedList || [];
  }

  async function probeWindows() {
    if (process.platform !== 'win32' || probing) return;
    const name = getPrinterName();
    probing = true;
    try {
      const result = await runPowerShell(PS_SCRIPT, { KIOSK_PRINTER: name || '' });
      probe = result;
      probeFor = name;
      if (result.error || result.queueError) {
        log.warn('printer: probe Windows tidak lengkap:', result.error || result.queueError);
      }
    } finally {
      probing = false;
    }
  }

  async function defaultPrinterName() {
    if (process.platform === 'win32') {
      const r = await runPowerShell(
        "(Get-CimInstance -ClassName Win32_Printer -Filter 'Default=True' | Select-Object -First 1).Name | ConvertTo-Json -Compress",
        {},
      );
      return typeof r === 'string' ? r : null;
    }
    const list = await listPrinters();
    const flagged = list.find((p) => p.isDefault || p.options?.['is-default'] === 'true');
    if (flagged) return flagged.name;
    return runLpstatDefault();
  }

  function report(result, raw) {
    const key = `${result.ready}|${result.printer}|${result.message}`;
    if (key !== lastReport) {
      lastReport = key;
      log.info('printer: status berubah ->', result, 'raw =', raw);
    }
    return result;
  }

  /** Must be fast (< 1 s): only uses cached / in-process data. */
  async function status() {
    const configured = getPrinterName();
    const list = await listPrinters();
    let printer;
    if (configured) {
      printer = list.find((p) => p.name === configured) || list.find((p) => p.displayName === configured);
      if (!printer) {
        return report(
          { ready: false, printer: configured, message: `Printer ${configured} tidak ditemukan.` },
          { available: list.map((p) => p.name) },
        );
      }
    } else {
      printer = list.find((p) => p.isDefault) || (list.length === 1 ? list[0] : null);
      if (!list.length) {
        return report({ ready: false, printer: null, message: 'Printer tidak ditemukan.' }, { available: [] });
      }
    }

    const name = printer ? printer.name : configured || null;
    let message = null;
    let raw = {};
    if (printer && Number.isFinite(printer.status)) {
      raw.status = printer.status;
      message = messageFromFlags(printer.status);
    }
    if (!message && process.platform === 'win32') {
      if (probeFor === configured && probe) {
        raw = { ...raw, probe };
        message = messageFromWindowsProbe(probe);
      } else {
        raw.probe = 'belum tersedia';
      }
      // Keep the cache fresh without blocking this call.
      if (!probe || probeFor !== configured) probeWindows();
    } else if (!message && printer) {
      raw.options = {
        'printer-state': printer.options?.['printer-state'],
        'printer-state-reasons': printer.options?.['printer-state-reasons'],
      };
      message = messageFromCups(printer.options);
    }
    return report({ ready: !message, printer: name, message }, raw);
  }

  /** Is the given printer name present right now? */
  async function exists(name) {
    const list = await listPrinters({ fresh: true });
    return list.some((p) => p.name === name);
  }

  function start() {
    stop();
    probeWindows();
    timer = setInterval(() => {
      probeWindows().then(() => status()).catch(() => {});
    }, POLL_MS);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function invalidate() {
    probe = null;
    probeFor = null;
    cachedList = null;
    lastReport = null;
  }

  return { listPrinters, status, exists, defaultPrinterName, start, stop, invalidate };
}

module.exports = { createPrinterStatus, messageFromFlags, messageFromWindowsProbe, messageFromCups };
