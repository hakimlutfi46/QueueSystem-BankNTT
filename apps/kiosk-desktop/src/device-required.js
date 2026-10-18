'use strict';

/*
 * The server shows /device-required?kind=kiosk|display&state=pending|revoked|unknown|limited when
 * this device may not open its page. What the app does about it:
 *   pending  -> 'wait'   (waiting for admin approval; the page re-checks every 5 s by itself)
 *   limited  -> 'wait'   (server rate limit; the page retries by itself)
 *   revoked  -> 'none'   (admin revoked this installation; never re-pair automatically)
 *   unknown  -> 'repair' (saved token unknown to the server, e.g. database reset): re-pair with the
 *               installId at most once per REPAIR_INTERVAL_MS, otherwise 'wait'
 * Any other URL (or a missing / unrecognised state) -> 'none'.
 */
const REPAIR_INTERVAL_MS = 60_000;
const PATH = '/device-required';
const STATES = Object.freeze(['pending', 'revoked', 'unknown', 'limited']);

/** { state, kind } for a /device-required URL on `server` (when given), else null. */
function parseDeviceRequired(url, server) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (server && parsed.origin !== server) return null;
  if (parsed.pathname.replace(/\/+$/, '') !== PATH) return null;
  const state = String(parsed.searchParams.get('state') || '').toLowerCase();
  return { state: STATES.includes(state) ? state : '', kind: parsed.searchParams.get('kind') || '' };
}

/**
 * Pure decision for a page URL. `lastRepairAt` is the time (ms) of the previous automatic
 * re-pair attempt (0 = never); `blocked` is true after the server answered DEVICE_REVOKED.
 */
function deviceRequiredAction(url, { server, lastRepairAt = 0, now = Date.now(), blocked = false } = {}) {
  const info = parseDeviceRequired(url, server);
  if (!info) return 'none';
  switch (info.state) {
    case 'pending':
    case 'limited':
      return 'wait';
    case 'unknown':
      if (blocked) return 'none';
      return repairAllowed(lastRepairAt, now) ? 'repair' : 'wait';
    default:
      return 'none';
  }
}

function repairAllowed(lastRepairAt, now = Date.now()) {
  return !lastRepairAt || now - lastRepairAt >= REPAIR_INTERVAL_MS;
}

/** Milliseconds until the next automatic re-pair is allowed (0 = now). */
function repairDelay(lastRepairAt, now = Date.now()) {
  return repairAllowed(lastRepairAt, now) ? 0 : lastRepairAt + REPAIR_INTERVAL_MS - now;
}

function deviceRequiredUrl(server, kind, state) {
  const url = new URL(PATH, server);
  url.searchParams.set('kind', kind);
  url.searchParams.set('state', state);
  return url.href;
}

module.exports = {
  REPAIR_INTERVAL_MS,
  parseDeviceRequired,
  deviceRequiredAction,
  repairAllowed,
  repairDelay,
  deviceRequiredUrl,
};
