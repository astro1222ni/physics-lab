/* 科目頁：章節數量、科目切換、分支黏頂列與回頁首。 */
(function () {
  'use strict';
  const T = (zh, en) => window.LabSettings ? LabSettings.t(zh, en) : zh;
  const domain = document.querySelector('section.domain'); if (!domain) return;
  document.querySelectorAll('.chapter').forEach(sec => { const n = sec.querySelectorAll('.module').length; if (n) sec.style.setProperty('--n', n); });
  document.querySelectorAll('.chapter-nav a[href^="#ch-"]').forEach(a => { const sec = document.getElementById(a.hash.slice(1)), n = sec ? sec.querySelectorAll('.module.live').length : 0; if (n) { const b = document.createElement('span'); b.className = 'n'; b.setAttribute('aria-hidden', 'true'); b.textContent = n; a.appendChild(b); } });
  const count = document.querySelector('.subject-count'), n = domain.querySelectorAll('.module.live').length, chapters = domain.querySelectorAll('.chapter').length;
  count.textContent = T(n + ' 個實驗・' + chapters + ' 章', n + ' labs · ' + chapters + ' chapters');
  const switching = document.querySelector('.subject-switch'), current = switching.querySelector('[aria-current="page"]');
  const switchWrap = document.createElement('div'); switchWrap.className = 'scroll-cue subject-switch-wrap'; switching.before(switchWrap); switchWrap.appendChild(switching);
  function fades(scroller, wrap) { wrap.classList.toggle('can-left', scroller.scrollLeft > 1); wrap.classList.toggle('can-right', scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft > 1); }
  switching.addEventListener('scroll', () => fades(switching, switchWrap), { passive: true });
  function center() { switching.scrollLeft = Math.max(0, current.offsetLeft - switching.offsetLeft - (switching.clientWidth - current.offsetWidth) / 2); fades(switching, switchWrap); }
  requestAnimationFrame(center);
  const nav = document.querySelector('.branch-nav'), branches = [...document.querySelectorAll('.branch')];
  const bar = document.createElement('nav'); bar.className = 'subjbar scroll-cue'; bar.setAttribute('aria-label', T('跳到分支', 'Jump to a field'));
  const inner = document.createElement('div'); inner.className = 'subjbar-in'; bar.appendChild(inner);
  [...nav.querySelectorAll('a')].forEach(a => { const chip = a.cloneNode(true); chip.className = 'subjbar-chip'; chip.tabIndex = -1; inner.appendChild(chip); });
  inner.addEventListener('scroll', () => fades(inner, bar), { passive: true });
  const top = document.createElement('button'); top.type = 'button'; top.className = 'to-top'; top.textContent = '↑'; top.setAttribute('aria-label', T('回到頁首', 'Back to top')); top.tabIndex = -1;
  document.body.append(bar, top); document.documentElement.classList.add('has-subjbar');
  let shown, active = '', raf = false;
  function update() {
    raf = false; const on = nav.getBoundingClientRect().bottom < 0;
    if (shown !== on) { shown = on; [bar, top].forEach(e => { e.classList.toggle('show', on); e.setAttribute('aria-hidden', String(!on)); }); top.tabIndex = on ? 0 : -1; inner.querySelectorAll('a').forEach(a => a.tabIndex = on ? 0 : -1); }
    let id = branches[0]?.id;
    branches.forEach(b => { if (b.getBoundingClientRect().top < bar.offsetHeight + 40) id = b.id; });
    fades(inner, bar); if (active === id) return; active = id;
    inner.querySelectorAll('a').forEach(a => { const match = a.hash === '#' + id; a.classList.toggle('on', match); if (match) { a.setAttribute('aria-current', 'location'); inner.scrollLeft = a.offsetLeft - (inner.clientWidth - a.offsetWidth) / 2; } else a.removeAttribute('aria-current'); }); fades(inner, bar);
  }
  addEventListener('scroll', () => { if (!raf) { raf = true; requestAnimationFrame(update); } }, { passive: true }); addEventListener('resize', () => { center(); update(); });
  top.onclick = () => { scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); history.replaceState(null, '', location.pathname + location.search); const h = document.querySelector('h1'); h.tabIndex = -1; h.focus({ preventScroll: true }); };
  const control = document.querySelector('.textbook-control');
  if (control?.dataset.source) fetch(control.dataset.source).then(r => { if (!r.ok) throw new Error('not ready'); return r.json(); }).then(book => {
    if (!book) return; control.hidden = false;
    const key = 'labTextbook:' + document.body.dataset.subject;
    let saved = {}; try { saved = JSON.parse(localStorage.getItem(key)) || {}; } catch (e) {}
    const params = new URLSearchParams(location.search); let view = params.get('view') || saved.view || 'domain';
    const select = control.querySelector('select'); if (saved.edition) select.value = saved.edition;
    function apply() { control.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view))); if (view === 'textbook') params.set('view', view); else params.delete('view'); history.replaceState(null, '', location.pathname + (params.size ? '?' + params : '') + location.hash); try { localStorage.setItem(key, JSON.stringify({ view, edition: select.value })); } catch (e) {} }
    control.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { view = b.dataset.view; apply(); }); select.onchange = apply; apply();
  }).catch(() => { control.hidden = true; });
  update();
})();
