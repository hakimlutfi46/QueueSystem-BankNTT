#!/usr/bin/env node
// Tiny stand-in for the queue server, for trying the kiosk app without the
// real backend or database. NOT used in production.
//
//   node scripts/mock-server.mjs [port] [--approve-after 10] [--revoked]      (default port 4545)
//
// POST /api/devices/pair without a code: { kind, name, installId } -> one device per installId
// (re-pairing returns a fresh token for the same device). New devices are approved after
// --approve-after seconds (0 = right away). --revoked answers 403 DEVICE_REVOKED to every pair.
// Pairing codes: ABC234 -> ok, EXP234 -> 410 expired, anything else -> 404.
// /kiosk?token= -> cookie, or /device-required?kind=kiosk&state=pending|revoked|unknown.
// Test helpers: /__revoke (revoke all devices), /__forget (forget all tokens, like a database
// reset -> "unknown"), /__approve (approve all now), /__requests (log).
import crypto from 'node:crypto';
import http from 'node:http';

function option(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index > -1 ? process.argv[index + 1] : fallback;
}

const positional = process.argv.slice(2).find((a, i, all) => /^\d+$/.test(a) && !String(all[i - 1] || '').startsWith('--'));
const port = Number(positional || process.env.PORT || 4545);
if (port === 3000) {
  console.error('Port 3000 dipakai server dev asli; pilih port lain.');
  process.exit(1);
}
const APPROVE_AFTER_MS = Number(option('--approve-after', 10)) * 1000;
const REVOKE_ALL = process.argv.includes('--revoked');
const COOKIE = 'kiosk_session';
const requests = [];
const devices = new Map(); // installId -> { name, createdAt, approved, revoked }
const tokens = new Map(); // token -> installId

function deviceState(token) {
  const id = token ? tokens.get(token) : null;
  const device = id ? devices.get(id) : null;
  if (!device) return 'unknown';
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

const html = (body, head = '') =>
  `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Mock</title>${head}</head><body>${body}</body></html>`;

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

const KIOSK_PAGE = html(
  `<h1>Mock kiosk</h1>
  <p>Bridge: <b id="bridge"></b></p>
  <button id="print" onclick="doPrint()">Ambil tiket</button>
  <pre id="out"></pre>
  <a id="external" href="https://example.com/">tautan luar</a>
  <script>
    window.__keys = [];
    window.__loads = (Number(sessionStorage.getItem('loads')) || 0) + 1;
    sessionStorage.setItem('loads', String(window.__loads));
    document.getElementById('bridge').textContent = typeof window.kioskApp;
    addEventListener('keydown', (e) => window.__keys.push((e.ctrlKey ? 'Ctrl+' : '') + (e.shiftKey ? 'Shift+' : '') + (e.altKey ? 'Alt+' : '') + e.key));
    async function doPrint() {
      const status = await window.kioskApp.printerStatus();
      const result = await window.kioskApp.printTicket('T-0001');
      document.getElementById('out').textContent = JSON.stringify({ status, result }, null, 2);
    }
  </script>`,
);

const PRINT_PAGE = (id) =>
  html(
    `<div class="t"><div class="n">A-001</div><div>Tiket ${id}</div><img src="/slow.svg" width="120" height="40" alt=""><p>Terima kasih</p></div>`,
    `<style>@page { size: 58mm auto; margin: 0 } body { margin: 0; width: 58mm; font-family: Arial } .t { padding: 3mm; text-align: center } .n { font-size: 40px; font-weight: 700 } p { margin-bottom: 30mm }</style>`,
  );

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const session = cookies(req)[COOKIE];
  requests.push({ method: req.method, path: url.pathname, hasToken: url.searchParams.has('token'), session: Boolean(session) });

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
      const json = (status, obj) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      if (!installId) return json(400, { error: { code: 'VALIDATION', message: 'installId wajib diisi.' } });
      if (REVOKE_ALL || devices.get(installId)?.revoked) {
        return json(403, { error: { code: 'DEVICE_REVOKED', message: 'Perangkat ini dicabut oleh admin.' } });
      }
      if (code) {
        if (code === 'EXP234') return json(410, { error: { code: 'code_expired', message: 'Kode pemasangan sudah kedaluwarsa.' } });
        if (code !== 'ABC234') return json(404, { error: { code: 'code_not_found', message: 'Kode pemasangan tidak ditemukan.' } });
        devices.set(installId, { name: 'Kiosk Lobi Utama', createdAt: Date.now(), approved: true, revoked: false });
      } else if (!devices.has(installId)) {
        const approved = APPROVE_AFTER_MS <= 0;
        devices.set(installId, { name: body.name || 'Kiosk', createdAt: Date.now(), approved, revoked: false });
      }
      const device = devices.get(installId);
      const token = issueToken(installId);
      return json(200, { token, kind: 'kiosk', name: device.name, approved: deviceState(token) === 'ok' });
    });
    return;
  }

  if (url.pathname === '/__requests') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(requests));
    return;
  }
  if (url.pathname === '/__revoke' || url.pathname === '/__approve' || url.pathname === '/__forget') {
    if (url.pathname === '/__forget') tokens.clear();
    for (const device of devices.values()) {
      if (url.pathname === '/__revoke') device.revoked = true;
      if (url.pathname === '/__approve') device.approved = true;
    }
    return send(res, 200, html(`<h1>${url.pathname} ok</h1>`));
  }

  if (url.pathname === '/kiosk') {
    const token = url.searchParams.get('token');
    if (token) {
      const cookie = { 'set-cookie': `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax` };
      const st = deviceState(token);
      if (st === 'unknown') return send(res, 302, '', { location: '/device-required?kind=kiosk&state=unknown' });
      if (st !== 'ok') return send(res, 302, '', { location: `/device-required?kind=kiosk&state=${st}`, ...cookie });
      return send(res, 302, '', { location: '/kiosk', ...cookie });
    }
    const st = deviceState(session && decodeURIComponent(session));
    if (st !== 'ok') return send(res, 302, '', { location: `/device-required?kind=kiosk&state=${st}` });
    return send(res, 200, KIOSK_PAGE);
  }

  if (url.pathname === '/device-required') {
    const st = url.searchParams.get('state') || 'unknown';
    const texts = {
      pending: 'Menunggu persetujuan admin di Admin → Perangkat…',
      revoked: 'Perangkat ini dicabut oleh admin.',
      unknown: 'Perangkat belum dikenal server.',
      limited: 'Terlalu banyak percobaan. Mencoba lagi…',
    };
    const recheck = st === 'pending' || st === 'limited' ? `<script>setTimeout(() => location.replace('/kiosk'), 5000)</script>` : '';
    return send(res, 200, html(`<h1 id="state">${st}</h1><p>${texts[st] || ''}</p>${recheck}`));
  }

  const m = /^\/kiosk\/print\/([^/]+)$/.exec(url.pathname);
  if (m) {
    if (deviceState(session && decodeURIComponent(session)) !== 'ok') return send(res, 302, '', { location: '/login' });
    return send(res, 200, PRINT_PAGE(decodeURIComponent(m[1])));
  }

  if (url.pathname === '/slow.svg') {
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'image/svg+xml' });
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#000"/></svg>');
    }, 400);
    return;
  }

  if (url.pathname === '/login') return send(res, 200, html('<h1>Login</h1>'));
  send(res, 404, html('<h1>404</h1>'));
});

server.listen(port, '127.0.0.1', () => console.log(`mock server: http://127.0.0.1:${port}`));
