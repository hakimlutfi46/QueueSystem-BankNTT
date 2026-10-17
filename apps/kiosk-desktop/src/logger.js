'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES = 1024 * 1024; // rotate at ~1 MB
const KEEP_FILES = 3; // kiosk.log.1 .. kiosk.log.3

let logDir = null;
let logFile = null;

function init(userDataDir) {
  logDir = path.join(userDataDir, 'logs');
  logFile = path.join(logDir, 'kiosk.log');
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch {
    // logging must never crash the kiosk
  }
}

/**
 * Remove secrets before anything reaches the disk. The kiosk URL carries the
 * device token as a query parameter, and error objects may echo request
 * bodies, so every line goes through this.
 */
function redact(text) {
  return String(text)
    .replace(/([?&]token=)[^&#\s"')]*/gi, '$1***')
    .replace(/("?(?:token|pin|pinHash|pinConfirm)"?\s*[:=]\s*)"[^"]*"/gi, '$1"***"');
}

function rotateIfNeeded() {
  try {
    const { size } = fs.statSync(logFile);
    if (size < MAX_BYTES) return;
  } catch {
    return; // file does not exist yet
  }
  try {
    for (let i = KEEP_FILES - 1; i >= 1; i -= 1) {
      const from = `${logFile}.${i}`;
      if (fs.existsSync(from)) fs.renameSync(from, `${logFile}.${i + 1}`);
    }
    fs.renameSync(logFile, `${logFile}.1`);
  } catch {
    // ignore rotation errors
  }
}

function format(value) {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function write(level, parts) {
  const line = `${new Date().toISOString()} [${level}] ${redact(parts.map(format).join(' '))}\n`;
  if (!process.env.KIOSK_QUIET) process.stdout.write(line);
  if (!logFile) return;
  try {
    rotateIfNeeded();
    fs.appendFileSync(logFile, line);
  } catch {
    // ignore
  }
}

module.exports = {
  init,
  redact,
  info: (...parts) => write('INFO', parts),
  warn: (...parts) => write('WARN', parts),
  error: (...parts) => write('ERROR', parts),
  get file() {
    return logFile;
  },
};
