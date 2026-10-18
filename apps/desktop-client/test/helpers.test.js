'use strict';

process.env.BANKNTT_QUIET = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { normaliseServer, normaliseCode, isValidCode, sameOrigin } = require('../src/server-url');
const { resolveRole, ROLES } = require('../src/roles');
const { pair, pairPayload, defaultDeviceName } = require('../src/pairing');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const config = require('../src/config');

const INSTALL_ID = '4b0e7c4e-3f3a-4f43-9d55-2f1f2b6c7a10';

test('normaliseServer accepts host:port and full URLs, rejects junk', () => {
  assert.equal(normaliseServer('192.168.1.53:3000'), 'http://192.168.1.53:3000');
  assert.equal(normaliseServer(' http://192.168.1.53:3000/admin '), 'http://192.168.1.53:3000');
  assert.equal(normaliseServer('https://antrian.lokal'), 'https://antrian.lokal');
  assert.equal(normaliseServer(''), null);
  assert.equal(normaliseServer('ftp://x'), null);
  assert.equal(normaliseServer('http://user:pw@x'), null);
});

test('pair codes and origins', () => {
  assert.equal(normaliseCode('abc-234'), 'ABC234');
  assert.equal(isValidCode('ABC234'), true);
  assert.equal(isValidCode('ABC10O'), false);
  assert.equal(sameOrigin('http://a:3000/display?x', 'http://a:3000'), true);
  assert.equal(sameOrigin('blob:http://a:3000/1234', 'http://a:3000'), true);
  assert.equal(sameOrigin('http://b:3000/', 'http://a:3000'), false);
  assert.equal(sameOrigin('not a url', 'http://a:3000'), false);
  assert.equal(sameOrigin('http://a:3000/', ''), false);
});

test('role comes from the baked package.json when packaged; dev may override', () => {
  assert.equal(resolveRole({ packaged: true, pkg: { bankNttRole: 'tv' }, argv: ['--role=admin'], env: { BANKNTT_ROLE: 'loket' } }), ROLES.tv);
  assert.equal(resolveRole({ packaged: true, pkg: {} }), null);
  assert.equal(resolveRole({ packaged: true, pkg: { bankNttRole: 'toString' } }), null);
  assert.equal(resolveRole({ packaged: false, argv: ['--role=loket'], env: { BANKNTT_ROLE: 'tv' } }), ROLES.loket);
  assert.equal(resolveRole({ packaged: false, argv: [], env: { BANKNTT_ROLE: 'TV' } }), ROLES.tv);
  assert.equal(resolveRole({ packaged: false, argv: [], env: {} }), ROLES.admin);
  const ids = new Set(Object.values(ROLES).map((r) => r.appId));
  const dirs = new Set(Object.values(ROLES).map((r) => r.userData));
  const names = new Set(Object.values(ROLES).map((r) => r.packageName));
  assert.equal(ids.size, 3);
  assert.equal(dirs.size, 3);
  assert.equal(names.size, 3);
});

test('pair accepts only the expected device kind', async (t) => {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const { code } = JSON.parse(raw);
      res.setHeader('content-type', 'application/json');
      if (code === 'ABC234') return res.end(JSON.stringify({ token: 't-display', kind: 'display', name: 'TV Lobi' }));
      if (code === 'KSK234') return res.end(JSON.stringify({ token: 't-kiosk', kind: 'kiosk', name: 'Kiosk' }));
      res.statusCode = 404;
      res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Kode pemasangan tidak ditemukan.' } }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;

  assert.deepEqual(await pair(url, 'ABC234', { expectedKind: 'display' }), {
    ok: true,
    token: 't-display',
    kind: 'display',
    name: 'TV Lobi',
    approved: true,
  });
  const wrong = await pair(url, 'KSK234', { expectedKind: 'display' });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.field, 'code');
  assert.match(wrong.message, /TV antrian/);
  const missing = await pair(url, 'ZZZ234', { expectedKind: 'display' });
  assert.deepEqual(missing, { ok: false, field: 'code', code: 'NOT_FOUND', message: 'Kode pemasangan tidak ditemukan.' });
  const down = await pair('http://127.0.0.1:1', 'ABC234', { expectedKind: 'display', timeoutMs: 1000 });
  assert.equal(down.field, 'server');
});

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
  assert.deepEqual(pairPayload({ expectedKind: 'display', installId: INSTALL_ID, name: 'TV A' }), {
    kind: 'display',
    name: 'TV A',
    installId: INSTALL_ID,
  });
  assert.deepEqual(pairPayload({ code: 'ABC234', expectedKind: 'display', installId: INSTALL_ID }), { code: 'ABC234', installId: INSTALL_ID });
  assert.equal(defaultDeviceName('display', 'PC-TV'), 'Layar TV (PC-TV)');
  assert.ok(defaultDeviceName('display', 'x'.repeat(200)).length <= 60);
});

test('pair auto-registers without code, sends installId, handles approved=false', async (t) => {
  let approved = false;
  const { url, bodies } = await mockServer(t, (body) =>
    !body.code && body.kind === 'display'
      ? [200, { token: 't-auto-display', kind: 'display', name: 'Layar TV', approved }]
      : [400, { error: { code: 'INVALID', message: 'Gagal' } }],
  );
  assert.deepEqual(await pair(url, '', { expectedKind: 'display', installId: INSTALL_ID }), {
    ok: true,
    token: 't-auto-display',
    kind: 'display',
    name: 'Layar TV',
    approved: false,
  });
  assert.equal(bodies[0].installId, INSTALL_ID);
  assert.equal(bodies[0].code, undefined);
  approved = true;
  assert.equal((await pair(url, '', { expectedKind: 'display', installId: INSTALL_ID })).approved, true);
});

test('pair reports DEVICE_REVOKED and RATE_LIMITED with the server message', async (t) => {
  let reply;
  const { url } = await mockServer(t, () => reply);
  reply = [403, { error: { code: 'DEVICE_REVOKED', message: 'Perangkat ini dicabut admin.' } }];
  assert.deepEqual(await pair(url, '', { expectedKind: 'display', installId: INSTALL_ID }), {
    ok: false,
    code: 'DEVICE_REVOKED',
    message: 'Perangkat ini dicabut admin.',
  });
  reply = [429, { error: { code: 'RATE_LIMITED', message: 'Coba lagi dalam 1 menit.' } }];
  assert.deepEqual(await pair(url, '', { expectedKind: 'display', installId: INSTALL_ID }), {
    ok: false,
    code: 'RATE_LIMITED',
    message: 'Coba lagi dalam 1 menit.',
  });
});

test('installId is generated once, saved, and only shown masked', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-cfg-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  config.init(dir);
  const first = config.ensureInstallId(config.load());
  assert.match(first.installId, /^[0-9a-f-]{36}$/);
  assert.equal(config.ensureInstallId(config.load()).installId, first.installId);
  assert.equal(config.maskInstallId(first.installId), `${first.installId.slice(0, 8)}…`);
});
