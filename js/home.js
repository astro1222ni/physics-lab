/*
 * home.js — 首頁小分類（選修物理各章）：在每個章名按鈕上標出該章的實驗數量。
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
})();
