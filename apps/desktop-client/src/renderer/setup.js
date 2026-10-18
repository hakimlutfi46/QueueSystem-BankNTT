'use strict';

(() => {
  const api = window.setupApi;
  const $ = (id) => document.getElementById(id);
  const form = $('form');
  const alertBox = $('alert');
  const submitBtn = $('submit');
  const serverInput = $('server');
  const list = $('server-list');
  const scanBox = $('scan-status');
  const scanText = $('scan-text');
  const rescanBtn = $('rescan');
  let mode = 'first';
  let pairing = false;
  let appName = 'Aplikasi';
  let touched = false; // the user typed an address or picked a server themselves
  let busy = false;
  const servers = new Map(); // url -> server

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
    const input = el.querySelector('input');
    if (input) input.focus();
  }

  /** Same normalisation as the main process, only for highlighting the matching list entry. */
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
    // LAN addresses first, "PC ini" (127.0.0.1) last.
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
    const total = servers.size;
    scanText.textContent = total
      ? `${total} server ditemukan. Pilih salah satu.`
      : 'Tidak ada server ditemukan. Pastikan PC server menyala, atau ketik alamatnya di bawah.';
    if (total >= 1 && !touched) {
      const serverList = [...servers.values()];
      const best = serverList.find((s) => !s.local) || serverList[0];
      select(best.url, { byUser: false });
      scanText.textContent = `Server ditemukan: ${best.name}.`;
      if (mode === 'first') {
        showAlert('info', `Server "${best.name}" ditemukan. Menyambung otomatis…`);
        form.requestSubmit();
      }
    }
  }

  function formValues() {
    return {
      server: serverInput.value.trim(),
    };
  }

  function validateLocally(v) {
    if (!v.server) return ['server', 'Pilih server dari daftar atau ketik alamatnya.'];
    if (!originOf(v.server)) return ['server', 'Alamat server tidak valid. Contoh: 192.168.1.53:3000'];
    return null;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    clearErrors();
    const values = formValues();
    const local = validateLocally(values);
    if (local) {
      hideAlert();
      setError(local[0], local[1]);
      return;
    }
    busy = true;
    submitBtn.disabled = true;
    const label = submitBtn.textContent;
    submitBtn.textContent = 'Menghubungkan…';
    try {
      const result = await api.submit(values);
      if (result.ok) {
        showAlert('ok', result.deviceName ? `Berhasil. Terdaftar sebagai "${result.deviceName}". Membuka ${appName}…` : `Tersambung. Membuka ${appName}…`);
        return;
      }
      hideAlert();
      if (result.field) setError(result.field, result.message);
      else showAlert('error', result.message);
    } catch {
      showAlert('error', 'Terjadi kesalahan. Coba lagi.');
    } finally {
      busy = false;
      submitBtn.disabled = false;
      submitBtn.textContent = label;
    }
  });

  $('check').addEventListener('click', async () => {
    clearErrors();
    hideAlert();
    if (!serverInput.value.trim()) {
      setError('server', 'Ketik alamat server dulu, misalnya 192.168.1.53:3000.');
      return;
    }
    const btn = $('check');
    btn.disabled = true;
    try {
      const r = await api.check(serverInput.value);
      if (r.ok) {
        serverInput.value = r.server;
        markSelected();
        showAlert('ok', `Server ${r.server} menjawab.`);
      } else {
        setError('server', r.message);
      }
    } catch {
      setError('server', 'Pemeriksaan gagal. Coba lagi.');
    } finally {
      btn.disabled = false;
    }
  });

  serverInput.addEventListener('input', () => {
    touched = true;
    markSelected();
  });
  form.addEventListener('input', (e) => {
    const field = e.target.closest('.field');
    if (field) field.classList.remove('invalid');
  });

  rescanBtn.addEventListener('click', () => {
    hideAlert();
    scan();
  });
  $('cancel').addEventListener('click', () => api.cancel());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mode === 'edit') api.cancel();
  });

  api.onFound(addServer);

  api.init().then((init) => {
    mode = init.mode === 'edit' ? 'edit' : 'first';
    appName = init.appName || appName;
    serverInput.value = init.server || '';
    document.title = `Pengaturan ${appName}`;
    if (init.icon) {
      $('logo').src = init.icon;
      $('logo').hidden = false;
    }
    $('footer').textContent = `${appName} v${init.version}${init.logFile ? ` · Log: ${init.logFile}` : ''}`;

    $('title').textContent = `Sambungkan ${appName}`;
    $('subtitle').textContent = `Pilih server antrian untuk membuka ${init.label || 'aplikasi'}.`;
    submitBtn.textContent = 'Simpan & sambungkan';

    if (mode === 'edit') {
      $('cancel').hidden = false;
      submitBtn.textContent = 'Simpan';
      $('title').textContent = 'Ganti server';
      $('subtitle').textContent = init.serverName
        ? `Saat ini tersambung ke "${init.serverName}" (${init.server}).`
        : `Saat ini tersambung ke ${init.server || '-'}.`;
      // Keep the current address unless the user picks another one.
      touched = true;
    }
    serverInput.focus();
    scan();
  });
})();
