#!/usr/bin/env node
// Tiny stand-in for the queue server, for trying the Admin/Loket/TV apps without the real
// backend or database. NOT used in production. Never use port 3000 (the real dev server).
//
//   node scripts/mock-server.mjs [httpPort] [--udp-port 41234] [--name "Cabang Uji"] [--host 127.0.0.1]
//                                [--approve-after 10] [--revoked]
//
// HTTP: /api/health, /admin (download + reprint + external links), /counter, /display (token ->
// cookie like the real proxy), /print/:id, /api/reports/export, POST /api/devices/pair,
// /__requests (log). Pairing codes: ABC234 -> display, KSK234 -> kiosk, EXP234 -> 410, else 404.
// Without a code: { kind, name, installId } -> one device per installId (re-pairing returns a fresh
// token for the same device), approved after --approve-after seconds (0 = right away); --revoked
// answers 403 DEVICE_REVOKED. /display?token= -> cookie, or
// /device-required?kind=display&state=pending|revoked|unknown. Helpers: /__revoke, /__approve,
// /__forget (forget all tokens, like a database reset -> "unknown").
// UDP: answers {"type":"bankntt-discover","v":1} with {"type":"bankntt-server",...}.
import crypto from 'node:crypto';
import dgram from 'node:dgram';
import http from 'node:http';

function option(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index > -1 ? process.argv[index + 1] : fallback;
}

const positional = process.argv.slice(2).find((a, i, all) => /^\d+$/.test(a) && !String(all[i - 1] || '').startsWith('--'));
const port = Number(positional || process.env.PORT || 4646);
const udpPort = Number(option('--udp-port', process.env.MOCK_DISCOVERY_PORT || 41234));
const serverName = option('--name', 'Cabang Uji (mock)');
const host = option('--host', '127.0.0.1');
if (port === 3000) {
  console.error('Port 3000 dipakai server dev asli; pilih port lain.');
  process.exit(1);
}

const APPROVE_AFTER_MS = Number(option('--approve-after', 10)) * 1000;
const REVOKE_ALL = process.argv.includes('--revoked');
const COOKIE = 'display_session';
const requests = [];
const devices = new Map(); // installId -> { kind, name, createdAt, approved, revoked }
const tokens = new Map(); // token -> installId

function deviceState(token) {
  const id = token ? tokens.get(token) : null;
  const device = id ? devices.get(id) : null;
  if (!device || device.kind !== 'display') return 'unknown';
  if (device.revoked) return 'revoked';
  if (!device.approved && Date.now() - device.createdAt >= APPROVE_AFTER_MS) device.approved = true;
  return device.approved ? 'ok' : 'pending';
}

function issueToken(installId) {
  const token = `mock-${crypto.randomUUID()}`;
  for (const [t, id] of tokens) if (id === installId) tokens.delete(t);
  tokens.set(token, installId);
  return token;
}

const html = (title, body) =>
  `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

function cookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || '')
      .split(';')
      .map((c) => c.trim().split('='))
      .filter(([k]) => k),
  );
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(body);
}

const json = (res, status, obj) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
};

const KEYLOG = `<pre id="keys"></pre><script>
  window.__keys = [];
  addEventListener('keydown', (e) => { window.__keys.push((e.ctrlKey ? 'Ctrl+' : '') + (e.shiftKey ? 'Shift+' : '') + e.key); document.getElementById('keys').textContent = window.__keys.join(' '); });
</script>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const session = cookies(req)[COOKIE];
  requests.push({ method: req.method, path: url.pathname, hasToken: url.searchParams.has('token'), session: Boolean(session) });

  if (url.pathname === '/api/health') return json(res, 200, { ok: true });

  if (req.method === 'POST' && url.pathname === '/api/devices/pair') {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let body = {};
      try {
        body = JSON.parse(raw) || {};
      } catch {}
      const { code, installId } = body;
      requests.at(-1).code = code;
      requests.at(-1).installId = installId ? `${String(installId).slice(0, 8)}…` : null;
      if (!installId) return json(res, 400, { error: { code: 'VALIDATION', message: 'installId wajib diisi.' } });
      if (REVOKE_ALL || devices.get(installId)?.revoked) {
        return json(res, 403, { error: { code: 'DEVICE_REVOKED', message: 'Perangkat ini dicabut oleh admin.' } });
      }
      if (code) {
        if (code === 'EXP234') return json(res, 410, { error: { code: 'code_expired', message: 'Kode pemasangan sudah kedaluwarsa.' } });
        if (code === 'ABC234') devices.set(installId, { kind: 'display', name: 'TV Ruang Tunggu', createdAt: Date.now(), approved: true, revoked: false });
        else if (code === 'KSK234') devices.set(installId, { kind: 'kiosk', name: 'Kiosk Lobi', createdAt: Date.now(), approved: true, revoked: false });
        else return json(res, 404, { error: { code: 'code_not_found', message: 'Kode pemasangan tidak ditemukan.' } });
      } else if (!devices.has(installId)) {
        const kind = body.kind === 'kiosk' ? 'kiosk' : 'display';
        devices.set(installId, { kind, name: body.name || 'Layar TV', createdAt: Date.now(), approved: APPROVE_AFTER_MS <= 0, revoked: false });
      }
      const device = devices.get(installId);
      const token = issueToken(installId);
      const approved = device.kind === 'display' ? deviceState(token) === 'ok' : true;
      return json(res, 200, { token, kind: device.kind, name: device.name, approved });
    });
    return;
  }

  if (url.pathname === '/__requests') return json(res, 200, requests);
  if (url.pathname === '/__revoke' || url.pathname === '/__approve' || url.pathname === '/__forget') {
    if (url.pathname === '/__forget') tokens.clear();
    for (const device of devices.values()) {
      if (url.pathname === '/__revoke') device.revoked = true;
      if (url.pathname === '/__approve') device.approved = true;
    }
    return send(res, 200, html('Mock', `<h1>${url.pathname} ok</h1>`));
  }

  if (url.pathname === '/admin') {
    return send(
      res,
      200,
      html(
        'Mock admin',
        `<h1>Mock admin</h1>
        <p><a id="export" href="/api/reports/export?format=xlsx">Ekspor laporan</a></p>
        <p><a id="reprint" href="/print/T-1" target="_blank" rel="noreferrer">Cetak ulang</a></p>
        <p><a id="external" href="https://example.com/" target="_blank">Tautan luar (diblokir)</a></p>
        <p><a id="nav-external" href="https://example.com/">Navigasi luar (diblokir)</a></p>${KEYLOG}`,
      ),
    );
  }
  if (url.pathname === '/api/reports/export') {
    res.writeHead(200, {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': 'attachment; filename="laporan-uji.xlsx"',
    });
    res.end(Buffer.from('mock xlsx content'));
    return;
  }
  const print = /^\/print\/([^/]+)$/.exec(url.pathname);
  if (print) return send(res, 200, html('Cetak ulang', `<h1>Tiket ${decodeURIComponent(print[1])}</h1>`));

  if (url.pathname === '/counter') return send(res, 200, html('Mock loket', `<h1>Mock loket</h1><p>Tekan Spasi untuk memanggil.</p>${KEYLOG}`));

  if (url.pathname === '/display') {
    const token = url.searchParams.get('token');
    if (token) {
      const cookie = { 'set-cookie': `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax` };
      const st = deviceState(token);
      if (st === 'unknown') return send(res, 302, '', { location: '/device-required?kind=display&state=unknown' });
      if (st !== 'ok') return send(res, 302, '', { location: `/device-required?kind=display&state=${st}`, ...cookie });
      return send(res, 302, '', { location: '/display', ...cookie });
    }
    const st = deviceState(session && decodeURIComponent(session));
    if (st !== 'ok') return send(res, 302, '', { location: `/device-required?kind=display&state=${st}` });
    return send(
      res,
      200,
      html(
        'Mock TV',
        `<h1>Mock TV</h1><p id="autoplay"></p><script>
          const ctx = new AudioContext();
          document.getElementById('autoplay').textContent = 'AudioContext: ' + ctx.state;
          window.__audioState = ctx.state;
        </script>${KEYLOG}`,
      ),
    );
  }

  if (url.pathname === '/device-required') {
    const st = url.searchParams.get('state') || 'unknown';
    const texts = {
      pending: 'Menunggu persetujuan admin di Admin → Perangkat…',
      revoked: 'Perangkat ini dicabut oleh admin.',
      unknown: 'Perangkat belum dikenal server.',
      limited: 'Terlalu banyak percobaan. Mencoba lagi…',
    };
    const recheck = st === 'pending' || st === 'limited' ? `<script>setTimeout(() => location.replace('/display'), 5000)</script>` : '';
    return send(res, 200, html('Perangkat', `<h1 id="state">${st}</h1><p>${texts[st] || ''}</p>${recheck}`));
  }
  send(res, 404, html('404', '<h1>404</h1>'));
});

server.listen(port, host, () => console.log(`mock server: http://${host}:${port}`));

const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
udp.on('message', (msg, rinfo) => {
  let body = null;
  try {
    body = JSON.parse(msg.toString('utf8'));
  } catch {
    return;
  }
  if (body?.type !== 'bankntt-discover' || body.v !== 1) return;
  const reply = Buffer.from(JSON.stringify({ type: 'bankntt-server', v: 1, name: serverName, port, version: '0.0.0-mock' }));
  udp.send(reply, rinfo.port, rinfo.address);
});
udp.on('error', (err) => {
  console.error(`mock discovery: UDP ${udpPort} gagal: ${err.code || err.message}`);
  udp.close();
});
udp.bind(udpPort, () => console.log(`mock discovery: UDP ${udpPort} ("${serverName}")`));
