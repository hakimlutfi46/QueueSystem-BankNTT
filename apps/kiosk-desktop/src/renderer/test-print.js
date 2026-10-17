'use strict';

(() => {
  const params = new URLSearchParams(location.search);
  document.getElementById('printer').textContent = params.get('printer') || '-';
  document.getElementById('app').textContent = params.get('app') || '';
  document.getElementById('server').textContent = params.get('server') || '-';
  document.getElementById('time').textContent = new Date().toLocaleString('id-ID');
})();
