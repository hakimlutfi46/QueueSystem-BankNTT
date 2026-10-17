'use strict';

(() => {
  const api = window.adminApi;
  const pin = document.getElementById('pin');
  const alertBox = document.getElementById('alert');
  const actionButtons = Array.from(document.querySelectorAll('[data-action]'));
  let lockTimer = null;

  function show(kind, text) {
    alertBox.className = `alert show ${kind}`;
    alertBox.textContent = text;
  }

  function lock(seconds) {
    clearInterval(lockTimer);
    let left = seconds;
    const tick = () => {
      if (left <= 0) {
        clearInterval(lockTimer);
        lockTimer = null;
        actionButtons.forEach((b) => (b.disabled = false));
        pin.disabled = false;
        alertBox.className = 'alert';
        pin.focus();
        return;
      }
      actionButtons.forEach((b) => (b.disabled = true));
      pin.disabled = true;
      show('error', `Terlalu banyak percobaan. Coba lagi dalam ${left} detik.`);
      left -= 1;
    };
    tick();
    lockTimer = setInterval(tick, 1000);
  }

  const pad = document.getElementById('pad');
  for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Hapus', '0', '⌫']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = key;
    b.addEventListener('click', () => {
      if (pin.disabled) return;
      if (key === 'Hapus') pin.value = '';
      else if (key === '⌫') pin.value = pin.value.slice(0, -1);
      else if (pin.value.length < 12) pin.value += key;
      pin.focus();
    });
    pad.append(b);
  }

  pin.addEventListener('input', () => {
    pin.value = pin.value.replace(/\D/g, '');
  });

  async function submit(action) {
    if (!pin.value) {
      show('error', 'Masukkan PIN admin.');
      pin.focus();
      return;
    }
    actionButtons.forEach((b) => (b.disabled = true));
    let r;
    try {
      r = await api.submit(pin.value, action);
    } catch {
      r = { ok: false, message: 'Terjadi kesalahan. Coba lagi.' };
    }
    if (r.ok) {
      show('ok', action === 'exit' ? 'Menutup aplikasi…' : 'Membuka pengaturan…');
      return;
    }
    pin.value = '';
    if (r.lockedSeconds) {
      lock(r.lockedSeconds);
      return;
    }
    actionButtons.forEach((b) => (b.disabled = false));
    show('error', r.message);
    pin.focus();
  }

  actionButtons.forEach((b) => b.addEventListener('click', () => submit(b.dataset.action)));
  document.getElementById('cancel').addEventListener('click', () => api.cancel());
  document.getElementById('form').addEventListener('submit', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') api.cancel();
  });

  api.state().then((s) => {
    document.getElementById('device').textContent = `${s.deviceName ? `Perangkat: ${s.deviceName} · ` : ''}v${s.version}`;
    if (s.lockedSeconds) lock(s.lockedSeconds);
    else pin.focus();
  });
})();
