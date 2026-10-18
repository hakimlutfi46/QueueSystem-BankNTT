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
  let mode = 'first';
  let defaultPrinter = null;

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
    if (mode === 'first' && !code) return ['code', 'Kode pemasangan wajib diisi.'];
    if (code && code.length !== 6) return ['code', 'Kode pemasangan harus 6 karakter.'];
    if (mode === 'first' || v.pin || v.pinConfirm) {
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
        showAlert('ok', result.deviceName ? `Berhasil. Terdaftar sebagai "${result.deviceName}". Membuka kiosk…` : 'Tersimpan. Membuka kiosk…');
        return;
      }
      if (result.field && result.field !== 'server' && result.field !== 'code') setError(result.field, result.message);
      else if (result.field) setError(result.field, result.message);
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
        'Server antrian berjalan di PC ini, jadi alamatnya sudah terisi. Buka panel admin untuk membuat kode pemasangan.';
    }
    if (mode === 'edit') {
      $('title').textContent = 'Pengaturan Kiosk';
      $('subtitle').textContent = init.deviceName
        ? `Perangkat ini terdaftar sebagai "${init.deviceName}". Kosongkan kode dan PIN jika tidak ingin mengubahnya.`
        : 'Kosongkan kode dan PIN jika tidak ingin mengubahnya.';
      $('code-hint').textContent = 'Isi hanya untuk memasangkan ulang (wajib jika alamat server diubah).';
      $('pin-hint').textContent = 'Kosongkan untuk tetap memakai PIN lama.';
      $('pin').placeholder = 'Tidak diubah';
      $('cancel').hidden = false;
      submitBtn.textContent = 'Simpan';
    }
    $(mode === 'edit' ? 'server' : init.server ? 'code' : 'server').focus();
  });
})();
