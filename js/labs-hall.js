/* 全科模擬實驗室大廳（labs.html）：四大類開合記憶、科目鍵等高、登入後在科目鍵上顯示各科星星。
   11/21 由首頁 home.js 搬來（站長：科目要點進「實驗室」方框才看得到）。 */
(function () {
  'use strict';
  const root = document.querySelector('.subject-groups'); if (!root) return;
  function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; } }
  function equalKeys() {
    const cards = [...root.querySelectorAll('.subject-card')].filter(a => a.offsetParent);
    root.style.removeProperty('--subject-key-min');
    if (cards.length) root.style.setProperty('--subject-key-min', Math.ceil(Math.max(...cards.map(a => a.getBoundingClientRect().height))) + 'px');
  }
  // 11/15 站長：四大類區塊點開才展開；記住每個人上次開了哪幾塊（只存在這台裝置，沿用首頁時期的鍵）
  root.querySelectorAll('details.subject-group').forEach(d => {
    if (read('labHomeGroups', {})[d.dataset.group]) d.open = true;
    d.addEventListener('toggle', () => {
      const o = read('labHomeGroups', {}); o[d.dataset.group] = d.open ? 1 : 0;
      try { localStorage.setItem('labHomeGroups', JSON.stringify(o)); } catch (e) {}
      if (d.open) equalKeys();
    });
  });
  // 從首頁舊錨點 #group-xxx 進來時，直接展開那一類
  const hash = decodeURIComponent(location.hash.slice(1)), target = /^group-/.test(hash) && document.getElementById(hash);
  if (target && target.closest('details')) target.closest('details').open = true;
  let seq = 0;
  async function stars(e) {
    const user = (e && e.detail || {}).user, turn = ++seq;
    let score = null;
    if (user && window.LabAccount) { try { score = (await LabAccount.readHome(user.uid)).score || {}; } catch (err) { score = null; } }
    if (turn !== seq) return;
    root.querySelectorAll('.subject-card').forEach(a => {
      const n = +(score && score.s && score.s[a.dataset.subject]) || 0, star = a.querySelector('.subject-stars');
      if (!star) return; star.hidden = !n; star.textContent = n ? '★ ' + n.toLocaleString() : '';
    });
    equalKeys();
  }
  window.addEventListener('lab:account', stars);
  window.addEventListener('resize', equalKeys);
  if (document.fonts) document.fonts.ready.then(equalKeys);
  requestAnimationFrame(equalKeys);
})();
