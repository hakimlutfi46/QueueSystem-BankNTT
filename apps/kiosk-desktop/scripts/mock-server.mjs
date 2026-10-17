#!/usr/bin/env node
// Tiny stand-in for the queue server, for trying the kiosk app without the
// real backend or database. NOT used in production.
//
//   node scripts/mock-server.mjs [port]      (default 4545)
//
// Pairing codes: ABC234 -> ok, EXP234 -> 410 expired, anything else -> 404.
import http from 'node:http';

const port = Number(process.argv[2] || process.env.PORT || 4545);
const TOKEN = 'mock-device-token-123';
const COOKIE = 'kiosk_session';
const requests = [];

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
      let code = '';
      try {
        code = JSON.parse(raw).code;
      } catch {}
      requests.at(-1).code = code;
      const json = (status, obj) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      if (code === 'ABC234') return json(200, { token: TOKEN, kind: 'kiosk', name: 'Kiosk Lobi Utama' });
      if (code === 'EXP234') return json(410, { error: { code: 'code_expired', message: 'Kode pemasangan sudah kedaluwarsa.' } });
      return json(404, { error: { code: 'code_not_found', message: 'Kode pemasangan tidak ditemukan.' } });
    });
    return;
  }

  if (url.pathname === '/__requests') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(requests));
    return;
  }

  if (url.pathname === '/kiosk') {
    const token = url.searchParams.get('token');
    if (token) {
      if (token !== TOKEN) return send(res, 401, html('<h1>Token tidak valid</h1>'));
      return send(res, 302, '', { location: '/kiosk', 'set-cookie': `${COOKIE}=s1; HttpOnly; Path=/; SameSite=Lax` });
    }
    if (!session) return send(res, 302, '', { location: '/login' });
    return send(res, 200, KIOSK_PAGE);
  }

  const m = /^\/kiosk\/print\/([^/]+)$/.exec(url.pathname);
  if (m) {
    if (!session) return send(res, 302, '', { location: '/login' });
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
