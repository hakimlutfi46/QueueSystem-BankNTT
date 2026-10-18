'use strict';

(() => {
  const api = window.setupApi;
  const $ = (id) => document.getElementById(id);
  const form = $('form');
  const alertBox = $('alert');
  const submitBtn = $('submit');
  const testBtn = $('test-print');
  const testResult = $('test-result');
  const printerSelect = $('printer');
  const serverInput = $('server');
  const list = $('server-list');
  const scanBox = $('scan-status');
  const scanText = $('scan-text');
  const rescanBtn = $('rescan');
  let mode = 'first';
  let defaultPrinter = null;
  let touched = false;
  let busy = false;
  const servers = new Map();

  function showAlert(kind, text) {
    alertBox.className = `alert show ${kind}`;
    alertBox.textContent = text;
  }
  function hideAlert() {
    alertBox.className = 'alert';
    alertBox.textContent = '';
  }
  function clearErrors() {
    document.querySelectorAll('.field.invalid').forEach((el) => el.classList.remove('invalid'));
  }
  function setError(field, message) {
    const el = document.querySelector(`.field[data-field="${field}"]`);
    if (!el) {
      showAlert('error', message);
      return;
    }
    el.classList.add('invalid');
    el.querySelector('.error').textContent = message;
    const input = el.querySelector('input, select');
    if (input) input.focus();
  }

  function fillPrinters(printers, selected) {
    printerSelect.textContent = '';
    if (!printers.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Tidak ada printer terpasang (pakai printer bawaan sistem)';
      printerSelect.append(opt);
      return;
    }
    for (const p of printers) {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = p.name === defaultPrinter ? `${p.displayName} (bawaan sistem)` : p.displayName;
      printerSelect.append(opt);
    }
    const wanted = [selected, defaultPrinter].find((n) => n && printers.some((p) => p.name === n));
    printerSelect.value = wanted || printers[0].name;
  }

  function normaliseCodeInput(value) {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function originOf(value) {
    let v = String(value || '').trim();
    if (!v) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = `http://${v}`;
    try {
      return new URL(v).origin;
    } catch {
      return '';
    }
  }

  function markSelected() {
    const current = originOf(serverInput.value);
    for (const button of list.querySelectorAll('.server-item')) {
      button.setAttribute('aria-pressed', String(button.dataset.url === current));
    }
  }

  function select(url, { byUser = true } = {}) {
    serverInput.value = url;
    if (byUser) touched = true;
    serverInput.closest('.field').classList.remove('invalid');
    markSelected();
  }

  function addServer(server) {
    if (!server || servers.has(server.url)) return;
    servers.set(server.url, server);
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'server-item';
    button.dataset.url = server.url;
    button.setAttribute('aria-pressed', 'false');
    const text = document.createElement('span');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = server.name;
    const addr = document.createElement('span');
    addr.className = 'addr';
    addr.textContent = `${server.url}${server.version ? ` · v${server.version}` : ''}`;
    text.append(name, document.createElement('br'), addr);
    button.append(text);
    if (server.local) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'PC ini';
      button.append(tag);
    }
    button.addEventListener('click', () => {
      select(server.url);
    });
    li.append(button);
    if (server.local) list.append(li);
    else {
      const firstLocal = [...list.children].find((n) => n.querySelector('.tag'));
      list.insertBefore(li, firstLocal || null);
    }
    markSelected();
  }

  async function scan() {
    if (busy) return;
    rescanBtn.disabled = true;
    scanBox.classList.add('scanning');
    scanText.textContent = 'Mencari server antrian di jaringan…';
    let found = [];
    try {
      found = await api.scan();
      found.forEach(addServer);
    } catch {
      found = [];
    }
    scanBox.classList.remove('scanning');
    rescanBtn.disabled = false;
    if (servers.size === 0) {
      scanText.textContent = 'Tidak ada server ditemukan. Ketik alamat manual di bawah atau tekan Cari ulang.';
      const net = await api.network().catch(() => null);
      if (net && net.blocked) scanText.textContent = net.message;
    } else {
      const serverList = [...servers.values()];
      const best = serverList.find((s) => !s.local) || serverList[0];
      scanText.textContent = `${servers.size} server ditemukan: ${best.name}.`;
      if (!touched && (!serverInput.value || serverInput.value === 'http://127.0.0.1:3000')) {
        select(best.url, { byUser: false });
        // Connect right away on first run, unless staff already started typing a code or PIN.
        if (mode === 'first' && !$('code').value && !$('pin').value && !$('pinConfirm').value) {
          showAlert('info', `Server "${best.name}" ditemukan. Menyambung otomatis…`);
          form.requestSubmit();
        }
      }
    }
  }

  function formValues() {
    return {
      server: $('server').value.trim(),
      code: $('code').value.trim(),
      printerName: printerSelect.value,
      pin: $('pin').value,
      pinConfirm: $('pinConfirm').value,
    };
  }

  function validateLocally(v) {
    if (!v.server) return ['server', 'Alamat server wajib diisi.'];
    const code = normaliseCodeInput(v.code);
    if (code && code.length !== 6) return ['code', 'Kode pemasangan harus 6 karakter.'];
    if (v.pin || v.pinConfirm) {
      if (!/^\d{4,12}$/.test(v.pin)) return ['pin', 'PIN admin minimal 4 angka (hanya angka).'];
      if (v.pin !== v.pinConfirm) return ['pinConfirm', 'Konfirmasi PIN tidak sama.'];
    }
    return null;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors();
    hideAlert();
    const values = formValues();
    const local = validateLocally(values);
    if (local) {
      setError(local[0], local[1]);
      return;
    }
    submitBtn.disabled = true;
    const label = submitBtn.textContent;
    submitBtn.textContent = 'Menghubungkan…';
    try {
      const result = await api.submit(values);
      if (result.ok) {
        if (result.approved === false) {
          showAlert('info', 'Tersambung. Kiosk menunggu persetujuan admin di Admin → Perangkat…');
        } else {
          showAlert('ok', result.deviceName ? `Berhasil. Terdaftar sebagai "${result.deviceName}". Membuka kiosk…` : 'Tersimpan. Membuka kiosk…');
        }
        return;
      }
      if (result.field) setError(result.field, result.message);
      else showAlert('error', result.message);
    } catch {
      showAlert('error', 'Terjadi kesalahan. Coba lagi.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = label;
    }
  });

  $('code').addEventListener('input', (e) => {
    const raw = normaliseCodeInput(e.target.value).slice(0, 6);
    e.target.value = raw.length > 3 ? `${raw.slice(0, 3)}-${raw.slice(3)}` : raw;
  });
  for (const id of ['pin', 'pinConfirm']) {
    $(id).addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '');
    });
  }
  form.addEventListener('input', (e) => {
    const field = e.target.closest('.field');
    if (field) field.classList.remove('invalid');
  });

  testBtn.addEventListener('click', async () => {
    testBtn.disabled = true;
    testResult.className = 'hint';
    testResult.textContent = 'Mencetak…';
    try {
      const r = await api.testPrint(printerSelect.value);
      testResult.className = `hint ${r.ok ? 'ok' : 'fail'}`;
      testResult.textContent = r.ok ? 'Halaman uji dikirim ke printer.' : r.message;
    } catch {
      testResult.className = 'hint fail';
      testResult.textContent = 'Cetak uji gagal.';
    } finally {
      testBtn.disabled = false;
    }
  });

  $('refresh').addEventListener('click', async () => {
    const current = printerSelect.value;
    fillPrinters(await api.refreshPrinters(), current);
  });

  $('cancel').addEventListener('click', () => api.cancel());
  $('exit').addEventListener('click', async () => {
    $('exit').disabled = true;
    showAlert('info', 'Menutup aplikasi…');
    const result = await api.exit().catch(() => ({ ok: false }));
    if (!result.ok) {
      $('exit').disabled = false;
      showAlert('error', 'Aplikasi tidak dapat ditutup dari sini.');
    }
  });
  $('open-admin').addEventListener('click', async () => {
    const result = await api.openAdmin($('server').value.trim());
    if (!result.ok) setError('server', result.message);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mode === 'edit') api.cancel();
  });

  api.init().then((init) => {
    mode = init.mode === 'edit' ? 'edit' : 'first';
    defaultPrinter = init.defaultPrinter;
    $('server').value = init.server || '';
    fillPrinters(init.printers || [], init.printerName);
    const appName = init.appName || 'Kiosk';
    document.title = `Pengaturan ${appName}`;
    $('title').textContent = `Pemasangan ${appName}`;
    if (init.icon) {
      $('logo').src = init.icon;
      $('logo').hidden = false;
    }
    $('footer').textContent = `${appName} v${init.version}${init.logFile ? ` · Log: ${init.logFile}` : ''}`;
    if (init.simulation) {
      $('simulation').textContent = `${init.simulation.note} di ${init.simulation.pdfDir}. Bukan untuk kiosk cabang.`;
      $('simulation').hidden = false;
      $('simulation').classList.add('show');
    }
    if (mode !== 'edit' && init.bundledServer) {
      $('subtitle').textContent =
        'Server antrian berjalan di PC ini, jadi alamatnya sudah terisi. Setujui kiosk ini lewat Buka panel admin → Perangkat.';
    }
    if (init.hasPin) {
      $('pin-hint').textContent = 'PIN sudah dipasang. Kosongkan untuk tetap memakai PIN lama, atau isi untuk menggantinya.';
      $('pin').placeholder = 'Tidak diubah';
    }
    if (mode === 'edit') {
      $('title').textContent = 'Pengaturan Kiosk';
      $('subtitle').textContent = init.deviceName
        ? `Perangkat ini terdaftar sebagai "${init.deviceName}". Kosongkan kode dan PIN jika tidak ingin mengubahnya.`
        : 'Pengaturan server, printer, dan PIN admin.';
      $('code-hint').textContent = 'Isi hanya untuk memasangkan ulang dengan kode dari admin. Tanpa kode, kiosk tersambung otomatis.';
      $('cancel').hidden = false;
      $('exit').hidden = false;
      submitBtn.textContent = 'Simpan';
    }
    if (init.server) markSelected();
    $('server').focus();
    scan();
  });

  rescanBtn.addEventListener('click', () => scan());
  api.onFound((server) => addServer(server));
  serverInput.addEventListener('input', () => {
    touched = true;
    markSelected();
  });

  $('check').addEventListener('click', async () => {
    const input = serverInput.value.trim();
    if (!input) return;
    $('check').disabled = true;
    try {
      const res = await api.check(input);
      if (res.ok) {
        serverInput.value = res.server;
        markSelected();
        showAlert('ok', `Server ${res.server} aktif dan dapat dihubungi.`);
      } else {
        setError('server', res.message);
      }
    } finally {
      $('check').disabled = false;
    }
  });
})();
