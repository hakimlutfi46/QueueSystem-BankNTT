'use strict';

const log = require('./logger');

const TIMEOUT_MS = 10_000;

/**
 * POST {server}/api/devices/pair  { code }  ->  200 { token, kind, name }
 * Errors: 400/404/410/429 { error: { code, message } } -> message shown to staff.
 * Runs in the main process (Node fetch) so no CORS and the token never touches
 * a renderer.
 */
async function pair(server, code) {
  const url = `${server}/api/devices/pair`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    log.warn('pairing: server tidak dapat dihubungi', server, err.name, err.cause?.code || err.message);
    const timeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    return {
      ok: false,
      field: 'server',
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
    if (body.kind && body.kind !== 'kiosk') {
      log.warn('pairing: kode bukan untuk kiosk, kind =', body.kind);
      return { ok: false, field: 'code', message: 'Kode ini bukan untuk perangkat kiosk.' };
    }
    log.info('pairing: berhasil', server, 'nama perangkat =', body.name || '-');
    return { ok: true, token: body.token, name: typeof body.name === 'string' ? body.name : '' };
  }

  const message =
    body && body.error && typeof body.error.message === 'string' && body.error.message
      ? body.error.message
      : `Pemasangan gagal (HTTP ${res.status}).`;
  log.warn('pairing: ditolak', server, 'status =', res.status, 'kode error =', body?.error?.code || '-');
  return { ok: false, field: 'code', message };
}

module.exports = { pair };
