'use strict';

/*
 * LAN discovery of the queue server (contract shared with the server):
 *
 *   client -> UDP <broadcast>:41234   {"type":"bankntt-discover","v":1}
 *   server -> UDP unicast reply       {"type":"bankntt-server","v":1,"name":string,"port":number,"version":string}
 *
 * The server URL is http://<reply source address>:<port>; every candidate is
 * confirmed with GET <url>/api/health -> {ok:true} before it is offered.
 * Requests go to 255.255.255.255, every IPv4 interface's directed broadcast
 * address, and 127.0.0.1 (the server may run on this same PC), once a second
 * for about four seconds.
 *
 * Plain Node (dgram + fetch), no Electron: unit-tested with `node --test`.
 */
const dgram = require('node:dgram');
const os = require('node:os');

const DISCOVERY_PORT = 41234;
const REQUEST = Object.freeze({ type: 'bankntt-discover', v: 1 });
const SCAN_MS = 4_000;
const INTERVAL_MS = 1_000;
const HEALTH_TIMEOUT_MS = 3_000;
const MAX_NAME = 100;
const MAX_VERSION = 50;

function buildRequest() {
  return Buffer.from(JSON.stringify(REQUEST));
}

function ipv4ToInt(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

function intToIpv4(value) {
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join('.');
}

/** 192.168.1.53 / 255.255.255.0 -> 192.168.1.255; null for invalid input or a /31-/32 mask. */
function directedBroadcast(address, netmask) {
  const ip = ipv4ToInt(address);
  const mask = ipv4ToInt(netmask);
  if (ip === null || mask === null) return null;
  // (ip | ~mask) in unsigned 32-bit arithmetic.
  const inverted = 0xffffffff - mask;
  if (inverted < 3) return null; // point-to-point / host route: no broadcast domain
  const broadcast = (((ip >>> 0) | inverted) >>> 0);
  return intToIpv4(broadcast);
}

const isIpv4Family = (family) => family === 'IPv4' || family === 4;

/** Non-internal IPv4 addresses of this machine. */
function localAddresses(interfaces = os.networkInterfaces()) {
  const out = [];
  for (const list of Object.values(interfaces || {})) {
    for (const entry of list || []) {
      if (entry && isIpv4Family(entry.family) && !entry.internal && entry.address) out.push(entry.address);
    }
  }
  return out;
}

/**
 * Where to send discovery requests: limited broadcast, each external IPv4
 * interface's directed broadcast, and loopback. Deduplicated, stable order.
 */
function broadcastTargets(interfaces = os.networkInterfaces()) {
  const targets = ['255.255.255.255'];
  for (const list of Object.values(interfaces || {})) {
    for (const entry of list || []) {
      if (!entry || !isIpv4Family(entry.family) || entry.internal) continue;
      const broadcast = directedBroadcast(entry.address, entry.netmask);
      if (broadcast) targets.push(broadcast);
    }
  }
  targets.push('127.0.0.1');
  return [...new Set(targets)];
}

function isLoopback(address) {
  return /^127\./.test(String(address));
}

/**
 * Validates one reply datagram. Returns
 * { name, port, version, address, url } or null when it is not a valid
 * bankntt-server reply (wrong type/version, bad port, non-IPv4 sender...).
 */
function parseReply(message, rinfo) {
  if (!rinfo || !isIpv4Family(rinfo.family) || ipv4ToInt(rinfo.address) === null) return null;
  const text = Buffer.isBuffer(message) ? message.toString('utf8') : String(message ?? '');
  if (!text || text.length > 4096) return null;
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (body.type !== 'bankntt-server' || body.v !== 1) return null;
  if (typeof body.name !== 'string') return null;
  // Strip control characters; the name is shown in the picker and matched on reconnect.
  const name = body.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME);
  if (!name) return null;
  if (!Number.isInteger(body.port) || body.port < 1 || body.port > 65535) return null;
  const version =
    typeof body.version === 'string' ? body.version.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_VERSION) : '';
  const address = rinfo.address;
  return { name, port: body.port, version, address, url: `http://${address}:${body.port}` };
}

/** GET <url>/api/health -> true only for HTTP 2xx with JSON {ok:true}. */
async function checkHealth(url, { timeoutMs = HEALTH_TIMEOUT_MS, fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(`${url}/api/health`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return false;
    const body = await res.json().catch(() => null);
    return Boolean(body && body.ok === true);
  } catch {
    return false;
  }
}

/** LAN addresses first (they work for other devices too), loopback last, then by name. */
function sortServers(list) {
  return [...list].sort((a, b) => {
    const la = isLoopback(a.address) ? 1 : 0;
    const lb = isLoopback(b.address) ? 1 : 0;
    if (la !== lb) return la - lb;
    return a.name.localeCompare(b.name) || a.url.localeCompare(b.url);
  });
}

/**
 * One discovery scan. Resolves with the healthy servers found (deduplicated by
 * URL, sorted). `onFound(server)` fires as soon as each one passes its health
 * check, so a picker can show results before the scan ends.
 */
function scan({
  port = DISCOVERY_PORT,
  durationMs = SCAN_MS,
  intervalMs = INTERVAL_MS,
  targets = broadcastTargets(),
  healthCheck = true,
  healthTimeoutMs = HEALTH_TIMEOUT_MS,
  fetchImpl = fetch,
  onFound,
  log,
} = {}) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: 'udp4' });
    const seen = new Set();
    const found = new Map();
    const pending = new Set();
    let sendTimer = null;
    let endTimer = null;
    let finished = false;
    const request = buildRequest();

    const finish = async () => {
      if (finished) return;
      finished = true;
      clearInterval(sendTimer);
      clearTimeout(endTimer);
      try {
        socket.close();
      } catch {
        // already closed
      }
      await Promise.allSettled([...pending]);
      resolve(sortServers([...found.values()]));
    };

    const failedTargets = new Set();
    const sendAll = () => {
      for (const target of targets) {
        socket.send(request, port, target, (err) => {
          // Unreachable networks / blocked broadcast on one interface are normal (macOS may answer
          // EHOSTUNREACH for 255.255.255.255, e.g. before Local Network access is granted, while
          // the directed broadcasts and 127.0.0.1 still work). Logged once per target per scan.
          if (!err || !log || failedTargets.has(target)) return;
          failedTargets.add(target);
          log.warn(`discovery: kirim ke ${target} gagal:`, err.code || err.message);
        });
      }
    };

    socket.on('error', (err) => {
      if (log) log.warn('discovery: soket error:', err.code || err.message);
      finish();
    });

    socket.on('message', (message, rinfo) => {
      const server = parseReply(message, rinfo);
      if (!server || seen.has(server.url)) return;
      seen.add(server.url);
      const accept = () => {
        if (found.has(server.url)) return;
        found.set(server.url, server);
        if (onFound) {
          try {
            onFound(server);
          } catch {
            // a UI callback must not break the scan
          }
        }
      };
      if (!healthCheck) {
        accept();
        return;
      }
      const job = checkHealth(server.url, { timeoutMs: healthTimeoutMs, fetchImpl })
        .then((ok) => {
          if (ok) accept();
          else if (log) log.warn('discovery: health check gagal untuk', server.url);
        })
        .finally(() => pending.delete(job));
      pending.add(job);
    });

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true);
      } catch (err) {
        if (log) log.warn('discovery: setBroadcast gagal:', err.message);
      }
      sendAll();
      sendTimer = setInterval(sendAll, intervalMs);
      endTimer = setTimeout(finish, durationMs);
    });
  });
}

module.exports = {
  DISCOVERY_PORT,
  REQUEST,
  buildRequest,
  ipv4ToInt,
  directedBroadcast,
  localAddresses,
  broadcastTargets,
  isLoopback,
  parseReply,
  checkHealth,
  sortServers,
  scan,
};
