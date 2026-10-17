'use strict';

(() => {
  const params = new URLSearchParams(location.search);
  const retry = Math.max(1, Number(params.get('retry')) || 5);
  document.getElementById('server').textContent = params.get('server') || '-';
  const countdown = document.getElementById('countdown');
  let left = retry;
  const tick = () => {
    countdown.textContent = `Mencoba lagi dalam ${left} detik…`;
    left = left <= 1 ? retry : left - 1;
  };
  tick();
  setInterval(tick, 1000);
})();
