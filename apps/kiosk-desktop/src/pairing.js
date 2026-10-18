'use strict';

const os = require('node:os');
const log = require('./logger');

const TIMEOUT_MS = 10_000;
const KIND = 'kiosk';
const DEFAULT_NAME = 'Kiosk Tiket';
const NAME_MAX = 60;

/** "Kiosk Tiket (PC-LOBI)": helps the admin recognise the device in Admin → Perangkat. */
function defaultDeviceName(hostname = os.hostname()) {
  const host = String(hostname || '')
    .replace(/[^\w.-]/g, '')
    .slice(0, 40);
  return (host ? `${DEFAULT_NAME} (${host})` : DEFAULT_NAME).slice(0, NAME_MAX);
}

/** Request body: with a code the old pairing-code flow, without one automatic registration. */
function pairPayload({ code = '', installId, name } = {}) {
  if (code) return { code, installId };
  return { kind: KIND, name: name || defaultDeviceName(), installId };
}

/**
 * POST {server}/api/devices/pair
 *   without code: { kind: "kiosk", name, installId }   with code: { code, installId }
 *   200 { token, kind, name, approved }   approved=false: waits for approval in Admin → Perangkat;
 *                                          the token is still saved and used.
 *   403 { error: { code: "DEVICE_REVOKED" } }  this installation was revoked: no automatic retry.
 *   429 { error: { code: "RATE_LIMITED" } }    retry later.
 *   400/404/410 (code flow)                    message shown to staff.
 * Runs in the main process (Node fetch) so no CORS and the token never touches a renderer.
 * Failures return { ok: false, field?, code?, message }.
 */
async function pair(server, code = '', { installId, name, fetchImpl = fetch, timeoutMs = TIMEOUT_MS } = {}) {
  const url = `${server}/api/devices/pair`;
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(pairPayload({ code, installId, name })),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    log.warn('pairing: server tidak dapat dihubungi', server, err.name, err.cause?.code || err.message);
    const timeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    return {
      ok: false,
      field: 'server',
      code: 'UNREACHABLE',
      message: timeout
        ? `Server ${server} tidak merespons. Periksa alamat dan jaringan.`
        : `Tidak dapat terhubung ke server ${server}. Periksa alamat dan jaringan.`,
    };
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (res.ok && body && typeof body.token === 'string' && body.token) {
    if (body.kind && body.kind !== KIND) {
      log.warn('pairing: kode bukan untuk kiosk, kind =', body.kind);
      return { ok: false, field: 'code', message: 'Kode ini bukan untuk perangkat kiosk.' };
    }
    // Older servers do not send `approved`; their devices are usable right away.
    const approved = body.approved !== false;
    log.info('pairing: berhasil', server, 'nama perangkat =', body.name || '-', approved ? '' : '(menunggu persetujuan admin)');
    return { ok: true, token: body.token, name: typeof body.name === 'string' ? body.name : '', approved };
  }

  const errorCode = typeof body?.error?.code === 'string' ? body.error.code : '';
  const serverMessage = typeof body?.error?.message === 'string' && body.error.message ? body.error.message : '';
  log.warn('pairing: ditolak', server, 'status =', res.status, 'kode error =', errorCode || '-');
  if (errorCode === 'DEVICE_REVOKED' || (!errorCode && res.status === 403)) {
    return {
      ok: false,
      code: 'DEVICE_REVOKED',
      message: serverMessage || 'Perangkat ini dicabut oleh admin. Hubungi admin untuk memulihkannya di Admin → Perangkat.',
    };
  }
  if (errorCode === 'RATE_LIMITED' || (!errorCode && res.status === 429)) {
    return { ok: false, code: 'RATE_LIMITED', message: serverMessage || 'Terlalu banyak percobaan. Coba lagi nanti.' };
  }
  const failure = { ok: false, field: code ? 'code' : undefined, message: serverMessage || `Pemasangan gagal (HTTP ${res.status}).` };
  if (errorCode) failure.code = errorCode;
  return failure;
}

module.exports = { pair, pairPayload, defaultDeviceName };
