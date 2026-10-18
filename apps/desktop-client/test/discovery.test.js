'use strict';

process.env.BANKNTT_QUIET = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const http = require('node:http');

const {
  DISCOVERY_PORT,
  buildRequest,
  directedBroadcast,
  broadcastTargets,
  localAddresses,
  parseReply,
  checkHealth,
  sortServers,
  scan,
} = require('../src/discovery');

const RINFO = { address: '192.168.1.53', family: 'IPv4', port: 41234, size: 0 };
const reply = (obj) => Buffer.from(JSON.stringify(obj));
const VALID = { type: 'bankntt-server', v: 1, name: 'Cabang Kupang', port: 3000, version: '1.4.0' };

test('request datagram matches the contract', () => {
  assert.equal(DISCOVERY_PORT, 41234);
  assert.deepEqual(JSON.parse(buildRequest().toString('utf8')), { type: 'bankntt-discover', v: 1 });
});

test('directedBroadcast computes the broadcast address of a subnet', () => {
  assert.equal(directedBroadcast('192.168.1.53', '255.255.255.0'), '192.168.1.255');
  assert.equal(directedBroadcast('10.70.10.67', '255.255.0.0'), '10.70.255.255');
  assert.equal(directedBroadcast('172.16.5.4', '255.255.240.0'), '172.16.15.255');
  assert.equal(directedBroadcast('10.0.0.1', '255.0.0.0'), '10.255.255.255');
  assert.equal(directedBroadcast('192.168.1.130', '255.255.255.128'), '192.168.1.255');
  assert.equal(directedBroadcast('200.1.2.3', '255.255.255.252'), '200.1.2.3');
});

test('directedBroadcast rejects invalid input and host routes', () => {
  assert.equal(directedBroadcast('192.168.1.53', '255.255.255.255'), null);
  assert.equal(directedBroadcast('192.168.1.53', '255.255.255.254'), null);
  assert.equal(directedBroadcast('192.168.1', '255.255.255.0'), null);
  assert.equal(directedBroadcast('192.168.1.300', '255.255.255.0'), null);
  assert.equal(directedBroadcast('fe80::1', 'ffff:ffff:ffff:ffff::'), null);
  assert.equal(directedBroadcast(undefined, undefined), null);
});

test('broadcastTargets uses limited, directed (non-internal IPv4) and loopback addresses', () => {
  const interfaces = {
    lo0: [
      { address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', internal: true },
      { address: '::1', netmask: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', family: 'IPv6', internal: true },
    ],
    Ethernet: [
      { address: '192.168.1.53', netmask: '255.255.255.0', family: 'IPv4', internal: false },
      { address: 'fe80::1234', netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', internal: false },
    ],
    'Wi-Fi': [{ address: '10.70.10.67', netmask: '255.255.0.0', family: 4, internal: false }],
    Duplicate: [{ address: '192.168.1.99', netmask: '255.255.255.0', family: 'IPv4', internal: false }],
    VPN: [{ address: '100.64.0.5', netmask: '255.255.255.255', family: 'IPv4', internal: false }],
  };
  assert.deepEqual(broadcastTargets(interfaces), ['255.255.255.255', '192.168.1.255', '10.70.255.255', '127.0.0.1']);
  assert.deepEqual(localAddresses(interfaces), ['192.168.1.53', '10.70.10.67', '192.168.1.99', '100.64.0.5']);
  assert.deepEqual(broadcastTargets({}), ['255.255.255.255', '127.0.0.1']);
});

test('parseReply accepts a valid reply and builds the URL from the sender address', () => {
  assert.deepEqual(parseReply(reply(VALID), RINFO), {
    name: 'Cabang Kupang',
    port: 3000,
    version: '1.4.0',
    address: '192.168.1.53',
    url: 'http://192.168.1.53:3000',
  });
  // family as number (older Node), missing version, name trimmed and control chars removed
  const parsed = parseReply(reply({ type: 'bankntt-server', v: 1, name: '  Cabang\n Atambua ', port: 8080 }), {
    address: '10.0.0.7',
    family: 4,
  });
  assert.equal(parsed.name, 'Cabang Atambua');
  assert.equal(parsed.version, '');
  assert.equal(parsed.url, 'http://10.0.0.7:8080');
});

test('parseReply rejects anything outside the contract', () => {
  const bad = [
    'not json',
    '',
    '[]',
    'null',
    JSON.stringify({ ...VALID, type: 'bankntt-discover' }),
    JSON.stringify({ ...VALID, v: 2 }),
    JSON.stringify({ ...VALID, v: '1' }),
    JSON.stringify({ ...VALID, name: '' }),
    JSON.stringify({ ...VALID, name: '   ' }),
    JSON.stringify({ ...VALID, name: 42 }),
    JSON.stringify({ ...VALID, port: 0 }),
    JSON.stringify({ ...VALID, port: 65536 }),
    JSON.stringify({ ...VALID, port: 3000.5 }),
    JSON.stringify({ ...VALID, port: '3000' }),
    'x'.repeat(5000),
  ];
  for (const text of bad) assert.equal(parseReply(Buffer.from(text), RINFO), null, text.slice(0, 60));
  assert.equal(parseReply(reply(VALID), { address: 'fe80::1', family: 'IPv6' }), null);
  assert.equal(parseReply(reply(VALID), null), null);
  assert.equal(parseReply(reply({ ...VALID, name: 'x'.repeat(300) }), RINFO).name.length, 100);
});

test('sortServers puts LAN addresses before loopback', () => {
  const list = sortServers([
    { name: 'B', address: '127.0.0.1', url: 'http://127.0.0.1:3000' },
    { name: 'B', address: '192.168.1.53', url: 'http://192.168.1.53:3000' },
    { name: 'A', address: '192.168.1.60', url: 'http://192.168.1.60:3000' },
  ]);
  assert.deepEqual(list.map((s) => s.url), ['http://192.168.1.60:3000', 'http://192.168.1.53:3000', 'http://127.0.0.1:3000']);
});

/* ---------------------------------------------------------- integration */

function startHttp(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function healthyHandler(req, res) {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }
  res.writeHead(404);
  res.end();
}

/** Fake server-side responder bound to 127.0.0.1 on an ephemeral UDP port. */
function startResponder(replyFor) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const received = [];
    socket.on('message', (msg, rinfo) => {
      let body = null;
      try {
        body = JSON.parse(msg.toString('utf8'));
      } catch {
        return;
      }
      received.push(body);
      if (body.type !== 'bankntt-discover' || body.v !== 1) return;
      for (const out of [].concat(replyFor(rinfo))) socket.send(Buffer.from(out), rinfo.port, rinfo.address);
    });
    socket.bind(0, '127.0.0.1', () => resolve({ socket, port: socket.address().port, received }));
  });
}

test('checkHealth requires HTTP 2xx and {ok:true}', async (t) => {
  const good = await startHttp(healthyHandler);
  const notOk = await startHttp((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":false}');
  });
  const error = await startHttp((req, res) => {
    res.writeHead(500);
    res.end('{"ok":true}');
  });
  t.after(() => [good, notOk, error].forEach((s) => s.close()));
  assert.equal(await checkHealth(`http://127.0.0.1:${good.address().port}`), true);
  assert.equal(await checkHealth(`http://127.0.0.1:${notOk.address().port}`), false);
  assert.equal(await checkHealth(`http://127.0.0.1:${error.address().port}`), false);
  // nothing listening there (port of a closed server)
  const closed = await startHttp(healthyHandler);
  const closedPort = closed.address().port;
  await new Promise((r) => closed.close(r));
  assert.equal(await checkHealth(`http://127.0.0.1:${closedPort}`, { timeoutMs: 1000 }), false);
});

test('scan finds a fake responder on 127.0.0.1, health-checks and deduplicates it', async (t) => {
  const healthy = await startHttp(healthyHandler);
  const unhealthy = await startHttp((req, res) => {
    res.writeHead(503);
    res.end();
  });
  const httpPort = healthy.address().port;
  const responder = await startResponder(() => [
    JSON.stringify({ type: 'bankntt-server', v: 1, name: 'Cabang Uji', port: httpPort, version: '9.9.9' }),
    // a second (unhealthy) server and junk: must be filtered out
    JSON.stringify({ type: 'bankntt-server', v: 1, name: 'Rusak', port: unhealthy.address().port, version: '1' }),
    'garbage',
    JSON.stringify({ type: 'bankntt-server', v: 1, name: 'Port salah', port: 70000 }),
  ]);
  t.after(() => {
    responder.socket.close();
    healthy.close();
    unhealthy.close();
  });

  const announced = [];
  const started = Date.now();
  const servers = await scan({
    port: responder.port,
    targets: ['127.0.0.1'],
    durationMs: 1_600,
    intervalMs: 500,
    healthTimeoutMs: 1_000,
    onFound: (s) => announced.push(s.url),
  });
  const elapsed = Date.now() - started;

  assert.deepEqual(servers, [
    { name: 'Cabang Uji', port: httpPort, version: '9.9.9', address: '127.0.0.1', url: `http://127.0.0.1:${httpPort}` },
  ]);
  assert.deepEqual(announced, [`http://127.0.0.1:${httpPort}`]);
  // re-sent every interval (≈ 4 times in 1.6 s), all well-formed requests
  assert.ok(responder.received.length >= 3, `requests received: ${responder.received.length}`);
  assert.ok(responder.received.every((b) => b.type === 'bankntt-discover' && b.v === 1));
  assert.ok(elapsed >= 1_500 && elapsed < 4_000, `elapsed ${elapsed} ms`);
});

test('scan resolves with an empty list when nobody answers', async () => {
  // Bind and close to get a port with (almost certainly) no listener.
  const probe = dgram.createSocket('udp4');
  await new Promise((r) => probe.bind(0, '127.0.0.1', r));
  const port = probe.address().port;
  probe.close();
  const servers = await scan({ port, targets: ['127.0.0.1'], durationMs: 400, intervalMs: 200 });
  assert.deepEqual(servers, []);
});

test('remembers a macOS local-network block until a health check succeeds', async () => {
  const d = require('../src/discovery');
  d.noteNetworkError(Object.assign(new Error('x'), { cause: { code: 'EHOSTUNREACH' } }), 'win32');
  assert.equal(d.localNetworkBlocked(), false, 'only macOS has the Local Network permission');
  d.noteNetworkError(Object.assign(new Error('x'), { cause: { code: 'EHOSTUNREACH' } }), 'darwin');
  assert.equal(d.localNetworkBlocked(), true);
  assert.equal(d.lastNetworkError(), 'EHOSTUNREACH');
  const ok = await d.checkHealth('http://192.0.2.1:3000', {
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true }) }),
  });
  assert.equal(ok, true);
  assert.equal(d.localNetworkBlocked(), false);
});
