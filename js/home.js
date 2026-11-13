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
  // 捲動時的頂端科目列與回頂端按鈕（11/13 站長選「方案一」）：
  // 捲過科目選單才出現；科目列標出目前在哪一科、點了直接跳，手機可左右滑；回頂端按鈕在右下角
  (function () {
    const nav = document.querySelector('.domain-nav');
    const head = document.querySelector('.top h1');
    if (!nav || !head) return;
    document.documentElement.classList.add('has-subjbar');
    const doms = Array.prototype.slice.call(document.querySelectorAll('section.domain[id]'));
    const bar = document.createElement('nav');
    bar.className = 'subjbar';
    bar.setAttribute('aria-label', T('科目快速切換', 'Jump to a subject'));
    bar.setAttribute('data-en-aria-label', 'Jump to a subject');
    const inner = document.createElement('div');
    inner.className = 'subjbar-in';
    bar.appendChild(inner);
    const chips = {};
    nav.querySelectorAll('a.domain-tab[href^="#"]').forEach(function (tab) {
      const id = tab.getAttribute('href').slice(1);
      if (!document.getElementById(id)) return;
      const name = tab.querySelector('.domain-name > span[data-en]');
      const a = document.createElement('a');
      a.className = 'subjbar-chip';
      a.href = '#' + id;
      a.setAttribute('style', tab.getAttribute('style') || '');
      const ico = tab.querySelector('svg');
      if (ico) a.appendChild(ico.cloneNode(true));
      const t = document.createElement('span');
      t.textContent = name ? name.textContent : id;
      if (name && name.getAttribute('data-en')) t.setAttribute('data-en', name.getAttribute('data-en'));
      a.appendChild(t);
      a.tabIndex = -1;
      inner.appendChild(a);
      chips[id] = a;
    });
    document.body.appendChild(bar);

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'to-top';
    b.setAttribute('aria-label', T('回到頁首', 'Back to top'));
    b.setAttribute('data-en-aria-label', 'Back to top');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span data-en="Top">' + T('回頂端', 'Top') + '</span>';
    b.tabIndex = -1;
    document.body.appendChild(b);

    let shown = null, cur = '', raf = 0;
    function show(on) {
      if (on === shown) return;
      shown = on;
      [bar, b].forEach(function (el) { el.classList.toggle('show', on); el.setAttribute('aria-hidden', on ? 'false' : 'true'); });
      b.tabIndex = on ? 0 : -1;
      Object.keys(chips).forEach(function (k) { chips[k].tabIndex = on ? 0 : -1; });
    }
    function update() {
      raf = 0;
      show(nav.getBoundingClientRect().bottom < 0);
      // 目前的科目：標題已經捲到科目列下方的最後一科
      const line = bar.offsetHeight + 24;
      let id = '';
      doms.forEach(function (d) { if (d.getBoundingClientRect().top <= line) id = d.id; });
      if (id === cur) return;
      if (cur && chips[cur]) { chips[cur].classList.remove('on'); chips[cur].removeAttribute('aria-current'); }
      cur = id;
      const c = chips[id];
      if (!c) return;
      c.classList.add('on');
      c.setAttribute('aria-current', 'true');
      // 手機上把目前的科目捲進科目列的可見範圍（只捲科目列，不動整頁）
      const x = c.offsetLeft - (inner.clientWidth - c.offsetWidth) / 2;
      inner.scrollTo({ left: Math.max(0, x), behavior: 'auto' });
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
