#!/usr/bin/env node
// Tiny stand-in for the queue server, for trying the Admin/Loket/TV apps without the real
// backend or database. NOT used in production. Never use port 3000 (the real dev server).
//
//   node scripts/mock-server.mjs [httpPort] [--udp-port 41234] [--name "Cabang Uji"] [--host 127.0.0.1]
//
// HTTP: /api/health, /admin (download + reprint + external links), /counter, /display (token ->
// cookie like the real proxy), /print/:id, /api/reports/export, POST /api/devices/pair,
// /__requests (log). Pairing codes: ABC234 -> display, KSK234 -> kiosk, EXP234 -> 410, else 404.
// UDP: answers {"type":"bankntt-discover","v":1} with {"type":"bankntt-server",...}.
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

const TOKEN = 'mock-display-token-123';
const COOKIE = 'display_session';
const requests = [];

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
      let code = '';
      try {
        code = JSON.parse(raw).code;
      } catch {}
      requests.at(-1).code = code;
      if (code === 'ABC234') return json(res, 200, { token: TOKEN, kind: 'display', name: 'TV Ruang Tunggu' });
      if (code === 'KSK234') return json(res, 200, { token: 'kiosk-token', kind: 'kiosk', name: 'Kiosk Lobi' });
      if (code === 'EXP234') return json(res, 410, { error: { code: 'code_expired', message: 'Kode pemasangan sudah kedaluwarsa.' } });
      return json(res, 404, { error: { code: 'code_not_found', message: 'Kode pemasangan tidak ditemukan.' } });
    });
    return;
  }

  if (url.pathname === '/__requests') return json(res, 200, requests);

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
      if (token !== TOKEN) return send(res, 401, html('Token', '<h1>Token tidak valid</h1>'));
      return send(res, 302, '', { location: '/display', 'set-cookie': `${COOKIE}=s1; HttpOnly; Path=/; SameSite=Lax` });
    }
    if (!session) return send(res, 302, '', { location: '/device-required' });
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

  if (url.pathname === '/device-required') return send(res, 200, html('Perangkat', '<h1>Perangkat belum terdaftar</h1>'));
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
