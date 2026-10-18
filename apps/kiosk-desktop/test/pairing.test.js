'use strict';

process.env.KIOSK_QUIET = '1';
process.env.BANKNTT_QUIET = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { pair, pairPayload, defaultDeviceName } = require('../src/pairing');
const config = require('../src/config');

const INSTALL_ID = '4b0e7c4e-3f3a-4f43-9d55-2f1f2b6c7a10';

/** Mock pairing server: replies come from `respond(body)` -> [status, json]. */
async function mockServer(t, respond) {
  const bodies = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw);
      bodies.push(body);
      const [status, json] = respond(body);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  return { url: `http://127.0.0.1:${server.address().port}`, bodies };
}

test('pair payload: automatic registration carries kind, name and installId; code flow sends code + installId', () => {
  assert.deepEqual(pairPayload({ installId: INSTALL_ID, name: 'Kiosk A' }), { kind: 'kiosk', name: 'Kiosk A', installId: INSTALL_ID });
  assert.deepEqual(pairPayload({ code: 'ABC234', installId: INSTALL_ID }), { code: 'ABC234', installId: INSTALL_ID });
  assert.equal(pairPayload({ installId: INSTALL_ID }).name, defaultDeviceName());
  assert.equal(defaultDeviceName('PC-LOBI'), 'Kiosk Tiket (PC-LOBI)');
  assert.equal(defaultDeviceName(''), 'Kiosk Tiket');
  assert.ok(defaultDeviceName('x'.repeat(200)).length <= 60);
});

test('pair sends installId and handles approved true/false', async (t) => {
  let approved = false;
  const { url, bodies } = await mockServer(t, () => [200, { token: 'tok-1', kind: 'kiosk', name: 'Kiosk Lobi', approved }]);
  assert.deepEqual(await pair(url, '', { installId: INSTALL_ID }), { ok: true, token: 'tok-1', name: 'Kiosk Lobi', approved: false });
  assert.equal(bodies[0].installId, INSTALL_ID);
  assert.equal(bodies[0].kind, 'kiosk');
  assert.equal(bodies[0].code, undefined);
  approved = true;
  assert.equal((await pair(url, 'ABC234', { installId: INSTALL_ID })).approved, true);
  assert.deepEqual(bodies[1], { code: 'ABC234', installId: INSTALL_ID });
});

test('pair treats a missing approved field (older server) as approved', async (t) => {
  const { url } = await mockServer(t, () => [200, { token: 'tok-2', kind: 'kiosk', name: 'K' }]);
  assert.equal((await pair(url, '', { installId: INSTALL_ID })).approved, true);
});

test('pair reports DEVICE_REVOKED and RATE_LIMITED with the server message', async (t) => {
  let reply;
  const { url } = await mockServer(t, () => reply);
  reply = [403, { error: { code: 'DEVICE_REVOKED', message: 'Perangkat ini dicabut admin.' } }];
  assert.deepEqual(await pair(url, '', { installId: INSTALL_ID }), { ok: false, code: 'DEVICE_REVOKED', message: 'Perangkat ini dicabut admin.' });
  reply = [429, { error: { code: 'RATE_LIMITED', message: 'Coba lagi dalam 1 menit.' } }];
  assert.deepEqual(await pair(url, '', { installId: INSTALL_ID }), { ok: false, code: 'RATE_LIMITED', message: 'Coba lagi dalam 1 menit.' });
  reply = [404, { error: { code: 'NOT_FOUND', message: 'Kode pemasangan tidak ditemukan.' } }];
  const missing = await pair(url, 'ZZZ234', { installId: INSTALL_ID });
  assert.equal(missing.field, 'code');
  assert.equal(missing.message, 'Kode pemasangan tidak ditemukan.');
  reply = [200, { token: 't', kind: 'display', name: 'TV' }];
  assert.equal((await pair(url, 'ABC234', { installId: INSTALL_ID })).ok, false);
  const down = await pair('http://127.0.0.1:1', '', { installId: INSTALL_ID, timeoutMs: 1000 });
  assert.equal(down.field, 'server');
});

test('installId is generated once, saved, and only shown masked', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiosk-cfg-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  config.init(dir);
  const first = config.ensureInstallId(config.load());
  assert.match(first.installId, /^[0-9a-f-]{36}$/);
  assert.equal(config.load().installId, first.installId);
  const again = config.ensureInstallId(config.load());
  assert.equal(again.installId, first.installId);
  assert.equal(config.maskInstallId(first.installId), `${first.installId.slice(0, 8)}…`);
  assert.notEqual(config.ensureInstallId({ installId: 'bogus' }, { persist: (c) => c }).installId, 'bogus');
});

test('sends the local device key only with automatic registration', () => {
  const { pairPayload } = require('../src/pairing');
  assert.equal(pairPayload({ installId: 'abcdef12-0000', localKey: 'k'.repeat(64) }).localKey, 'k'.repeat(64));
  assert.equal('localKey' in pairPayload({ installId: 'abcdef12-0000' }), false);
  assert.equal('localKey' in pairPayload({ code: 'ABC234', installId: 'abcdef12-0000', localKey: 'k'.repeat(64) }), false);
});
