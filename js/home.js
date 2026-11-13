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
  // 各科目（物理、化學、生物、地球科學、數學）卡片上的實驗數：數該區已上線的卡片
  const T = function (zh, en) { return window.LabSettings ? LabSettings.t(zh, en) : zh; };
  document.querySelectorAll('.domain-count[data-domain]').forEach(function (el) {
    const dom = document.getElementById(el.getAttribute('data-domain'));
    const n = dom ? dom.querySelectorAll('.module.live').length : 0;
    el.textContent = n ? (n + T(' 個實驗', n === 1 ? ' lab' : ' labs')) : T('製作中', 'coming soon');
  });
  // 回頂端浮動按鈕（11/13）：捲過科目選單才出現，按一下回到頁首、焦點移到標題
  (function () {
    const nav = document.querySelector('.domain-nav');
    const head = document.querySelector('.top h1');
    if (!nav || !head) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'to-top';
    b.setAttribute('aria-label', T('回到頁首', 'Back to top'));
    b.setAttribute('data-en-aria-label', 'Back to top');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span data-en="Top">' + T('回頂端', 'Top') + '</span>';
    b.tabIndex = -1;
    document.body.appendChild(b);
    let shown = false, raf = 0;
    function update() {
      raf = 0;
      const on = nav.getBoundingClientRect().bottom < 0;
      if (on === shown) return;
      shown = on;
      b.classList.toggle('show', on);
      b.tabIndex = on ? 0 : -1;
      b.setAttribute('aria-hidden', on ? 'false' : 'true');
    }
    addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
    addEventListener('resize', update);
    b.addEventListener('click', function () {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      head.setAttribute('tabindex', '-1');
      head.focus({ preventScroll: true });
    });
    update();
  })();
})();
