'use strict';

const fs = require('node:fs');
const path = require('node:path');
const log = require('./logger');

/**
 * Persisted shape (userData/config.json):
 * {
 *   server:     "http://192.168.1.53:3000",
 *   serverName: "<name announced by discovery, used to follow the server to a new IP>",
 *   token:      "<device token from /api/devices/pair>"   (TV only)
 *   pinHash:    "scrypt$N$r$p$salt$hash"                   (TV only)
 *   deviceName: "<name returned by the server>"            (TV only)
 * }
 */
const EMPTY = Object.freeze({ server: '', serverName: '', token: '', pinHash: '', deviceName: '' });

let configPath = null;

function init(userDataDir) {
  configPath = path.join(userDataDir, 'config.json');
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return { ...EMPTY, ...raw };
  } catch (err) {
    if (err.code !== 'ENOENT') log.warn('config: gagal membaca config.json:', err.message);
    return { ...EMPTY };
  }
}

function isComplete(cfg, role) {
  if (!cfg || !cfg.server) return false;
  if (role && role.pairing) return Boolean(cfg.token);
  return true;
}

/** Atomic write: temp file + rename so a power cut never leaves half a file. */
function save(cfg) {
  const data = { ...EMPTY, ...cfg };
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const tmp = `${configPath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, configPath);
  return data;
}

module.exports = { init, load, save, isComplete, get path() { return configPath; } };
