/*
 * home.js — 首頁小分類（選修物理各章）：在每個章名按鈕上標出該章的實驗數量；兩大科目卡片標出各區實驗數。
 * 數量直接數頁面上的卡片，新增實驗時不必改這支程式；只要把卡片放進對應的 <section class="chapter">，
 * 並把該章的按鈕從 <span class="soon"> 改成 <a href="#ch-…">。
 */
(function () {
  'use strict';
  // 每章的寬度依實驗數分配（lab.css 的 --n），以實際卡片數為準
  document.querySelectorAll('.chapter').forEach(function (sec) {
    const n = sec.querySelectorAll('.module').length;
    if (n) sec.style.setProperty('--n', String(n));
  });
  document.querySelectorAll('.chapter-nav a[href^="#ch-"]').forEach(function (a) {
    const sec = document.getElementById(a.getAttribute('href').slice(1));
    const n = sec ? sec.querySelectorAll('.module').length : 0;
    if (!n) return;
    const b = document.createElement('span');
    b.className = 'n';
    b.setAttribute('aria-hidden', 'true');
    b.textContent = String(n);
    a.appendChild(b);
  });
  // 兩大科目（物理／地球科學）卡片上的實驗數：數該區已上線的卡片
  const T = function (zh, en) { return window.LabSettings ? LabSettings.t(zh, en) : zh; };
  document.querySelectorAll('.domain-count[data-domain]').forEach(function (el) {
    const dom = document.getElementById(el.getAttribute('data-domain'));
    const n = dom ? dom.querySelectorAll('.module.live').length : 0;
    el.textContent = n ? (n + T(' 個實驗', n === 1 ? ' lab' : ' labs')) : T('製作中', 'coming soon');
  });
})();
