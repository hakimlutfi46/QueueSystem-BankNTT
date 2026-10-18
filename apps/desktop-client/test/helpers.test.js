'use strict';

process.env.BANKNTT_QUIET = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { normaliseServer, normaliseCode, isValidCode, sameOrigin } = require('../src/server-url');
const { resolveRole, ROLES } = require('../src/roles');
const { pair } = require('../src/pairing');

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

  assert.deepEqual(await pair(url, 'ABC234', { expectedKind: 'display' }), { ok: true, token: 't-display', kind: 'display', name: 'TV Lobi' });
  const wrong = await pair(url, 'KSK234', { expectedKind: 'display' });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.field, 'code');
  assert.match(wrong.message, /TV antrian/);
  const missing = await pair(url, 'ZZZ234', { expectedKind: 'display' });
  assert.deepEqual(missing, { ok: false, field: 'code', message: 'Kode pemasangan tidak ditemukan.' });
  const down = await pair('http://127.0.0.1:1', 'ABC234', { expectedKind: 'display', timeoutMs: 1000 });
  assert.equal(down.field, 'server');
});
