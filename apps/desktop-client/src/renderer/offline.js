'use strict';

(() => {
  const params = new URLSearchParams(location.search);
  const retry = Math.max(1, Number(params.get('retry')) || 5);
  const role = params.get('role') || '';
  document.getElementById('server').textContent = params.get('server') || '-';
  if (params.get('app')) document.title = `${params.get('app')}: menyambung ke server`;
  if (role === 'tv') {
    document.getElementById('hint').textContent = 'Jika berlangsung lama, hubungi petugas.';
  }

  const countdown = document.getElementById('countdown');
  let left = retry;
  const tick = () => {
    countdown.textContent = `Mencoba lagi dalam ${left} detik…`;
    left = left <= 1 ? retry : left - 1;
  };
  tick();
  setInterval(tick, 1000);

  const status = document.getElementById('status');
  const button = document.getElementById('rescan');
  const api = window.offlineApi;
  if (!api) {
    button.hidden = true;
    return;
  }
  api.onStatus((text) => {
    status.textContent = text;
  });
  button.addEventListener('click', async () => {
    button.disabled = true;
    const label = button.textContent;
    button.textContent = 'Mencari…';
    try {
      await api.rescan();
    } catch {
      status.textContent = 'Pencarian gagal. Coba lagi.';
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });
})();
