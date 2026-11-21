/* 手機操作台（共用）
 * 站長 11/16：「手機的頁面，將可以操縱切換的鈕……儘可能全部集中在同一頁，或者至少最多跨一頁？不要跨到好幾頁，
 * 如果捲動到最下面才找得到，這對手機使用者非常不友善。」「旋鈕跟滑桿的間距要縮小」
 * 用法：要搬的卡片加 data-deck="中文|English"（可加 data-deck-order 排序），放操作台的位置加一個 data-deck-anchor 元素。
 * 寬度 ≤ 880 px（.lab 變單欄）時，卡片搬進錨點後面的分頁操作台，一次顯示一張；變寬就搬回原位。卡片內的 id、事件、狀態都不變。
 * 分頁按鈕有 aria-controls，步驟指引（stepguide）要指的控制項在別的分頁時，會先指分頁按鈕。 */
(function () {
  'use strict';
  const doc = document;
  const T = function (a, b) { return window.LabSettings ? LabSettings.t(a, b) : a; };
  /* 三種擺法（站長 11/16：「萬一手機跟平板是橫着放的時候……單一個畫面不卷動太多……呈現所有的操作按鈕跟按鍵，還有拉條」）
   *   stack  ：寬度 ≤ 880 px（手機、平板直放）→ 操作台在主畫布正下方
   *   drawer ：橫放、螢幕高 ≤ 600 px（手機橫放；電腦視窗很矮時也一樣）→ 操作台固定在右側一整條、自己捲動；左邊畫布依螢幕高度縮放，畫布＋播放列剛好一屏
   *   panel  ：寬度 > 880 px（平板橫放、電腦）→ 操作台放在右欄最上面，右欄黏在螢幕上、自己捲動
   *   站長 11/16：「電腦的版面配置，改則與手機或平板的橫式版面配置雷同。」所以不再只限觸控裝置。 */
  const MM = function (q) { return window.matchMedia ? matchMedia(q) : { matches: false }; };
  const mq = MM('(max-width: 880px)');
  const mqDrawer = MM('(orientation: landscape) and (max-height: 600px)');
  const mqPanel = MM('(min-width: 881px)');
  let anchorEl = null, mode = 'off', fitT = 0, fitN = 0;
  let deck = null, tabs = [], panes = [], cards = [], cur = 0, moved = false, offClass = '';
  const KEY = 'labdeck:' + location.pathname;

  /* 自動模式（站長 11/16：「必須所有的實驗室都要做這樣的優化設定」）
   * 頁面沒有手動標 data-deck 時，把各 .lab 右欄（.panel）裡有控制項的卡片自動收進分頁，分頁名＝卡片標題。
   * 不收：只有範例鍵的卡、沒有控制項的讀數卡（讀數留在操作台正下方）。
   * 錨點自動放在第一個 .stage 的記錄列（.playbar）與狀態列之後；沒有記錄列就放在 .stage 最後。
   * 不想要的頁面在 <body> 加 data-deck-auto="off"。 */
  function headText(c) {
    const h = c.querySelector(':scope > h2, :scope > h3, :scope > header h2');
    if (!h) return null;
    const src = h.hasAttribute('data-en') || h.hasAttribute('data-en-html') ? h
      : (h.firstElementChild && h.firstElementChild.hasAttribute('data-en') ? h.firstElementChild : h);
    const zh = src.textContent.replace(/\s+/g, ' ').trim();
    let en = src.getAttribute('data-en') || (src.getAttribute('data-en-html') || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    return zh ? [zh, en || zh] : null;
  }
  function autoCards() {
    if (doc.body && doc.body.dataset.deckAuto === 'off') return [];
    const out = [];
    let k = 0;
    doc.querySelectorAll('.lab > .panel .card, .lab > .panel > section').forEach(function (c) {
      if (c.closest('[data-deck]')) return;
      const host = c.closest('.lab > .panel');
      if (!host || c.parentElement.closest('.card, .lab > .panel') !== host) return; // 卡片裡的卡片跟著外層走
      const ctl = Array.prototype.filter.call(c.querySelectorAll('input, select, textarea, button'), function (e) {
        return e.type !== 'hidden' && !e.closest('.ex-bar');
      });
      if (!ctl.length) return;
      const name = headText(c) || ['操作 ' + (++k), 'Controls ' + k];
      // 包在切換區（例如「彈簧／單擺」各一組卡片）裡的卡：記下外層，外層被藏起來時，操作台裡的這張也藏
      const wraps = []; for (let w = c.parentElement; w && w !== host; w = w.parentElement) wraps.push(w);
      c._deckWraps = wraps;
      c.dataset.deck = name[0] + '|' + name[1];
      c.dataset.deckAuto = '';
      out.push(c);
    });
    return out;
  }
  function autoAnchor() {
    const st = doc.querySelector('.lab > .stage');
    if (!st) return null;
    const a = doc.createElement('div'); a.setAttribute('data-deck-anchor', ''); a.hidden = true;
    const kids = Array.prototype.slice.call(st.children);
    // 以第一個畫布為準：接在它後面的按鍵列、狀態列、圖例之後（記錄列在畫布上方的頁面也不會把操作台塞到畫布上面）
    let ref = null;
    for (let i = 0; i < kids.length; i++) if (kids[i].matches('canvas, svg') || kids[i].querySelector('canvas')) { ref = kids[i]; break; }
    if (!ref) { const bars = st.querySelectorAll(':scope > .playbar'); ref = bars.length ? bars[bars.length - 1] : null; }
    // 畫布後面緊接的東西先跳過：按鍵列、狀態列、圖例、藏起來的容器（例如 3D 檢視）、矮的控制列；遇到第二張圖就停（操作台放在圖前面）
    const toolbarLike = function (e) {
      if (e.matches('.playbar, .playbar2, .bar, .controls, .btns, .status, [aria-live], .legend, .view-msg, .sr-only')) return true;
      if (e.hidden || getComputedStyle(e).display === 'none' || e.getBoundingClientRect().height < 2) return true; // 藏起來或還空著
      if (e.matches('p, h2, h3, section, .card, details, table, .tablewrap, dl, canvas, svg') || e.querySelector('canvas, svg:not(button svg)')) return false;
      return !!e.querySelector('button, input, select') && e.getBoundingClientRect().height < 140;
    };
    while (ref && ref.nextElementSibling && toolbarLike(ref.nextElementSibling)) ref = ref.nextElementSibling;
    if (ref) ref.parentNode.insertBefore(a, ref.nextSibling); else st.appendChild(a);
    return a;
  }
  function build() {
    let anchor = doc.querySelector('[data-deck-anchor]');
    cards = Array.prototype.slice.call(doc.querySelectorAll('[data-deck]'));
    if (!cards.length) { cards = autoCards(); if (cards.length && !anchor) anchor = autoAnchor(); } // 11/21：只放了 data-deck-anchor、卡片沒標 data-deck 時，照樣自動收卡放到錨點（數學串回報）
    if (!anchor || !cards.length) return false;
    if (cards.length && cards[0].hasAttribute('data-deck-auto')) doc.documentElement.classList.add('labdeck-auto');
    offClass = anchor.dataset.deckOff || '';
    cards.sort(function (a, b) { return (+a.dataset.deckOrder || 0) - (+b.dataset.deckOrder || 0); });
    deck = doc.createElement('section'); deck.className = 'labdeck'; deck.hidden = true;
    deck.setAttribute('aria-label', T('操作台', 'Controls'));
    const bar = doc.createElement('div'); bar.className = 'labdeck-tabs'; bar.setAttribute('role', 'tablist');
    const byName = {};
    cards.forEach(function (c) {
      const key = c.dataset.deck;
      if (byName[key] == null) {
        const i = tabs.length, name = key.split('|');
        const b = doc.createElement('button'); b.type = 'button'; b.id = 'labdeck-tab-' + i; b.setAttribute('role', 'tab');
        b.textContent = T(name[0], name[1] || name[0]); if (name[1]) b.dataset.en = name[1];
        const p = doc.createElement('div'); p.className = 'labdeck-pane'; p.id = 'labdeck-pane-' + i; p.setAttribute('role', 'tabpanel');
        p.setAttribute('aria-labelledby', b.id); b.setAttribute('aria-controls', p.id);
        b.addEventListener('click', function () { select(i, true); });
        bar.appendChild(b); tabs.push(b); panes.push(p); byName[key] = i;
      }
      c._deckPane = byName[key];
      const ph = doc.createComment('labdeck-home'); c.parentNode.insertBefore(ph, c); c._deckHome = ph;
    });
    try { cur = Math.max(0, Math.min(tabs.length - 1, +localStorage.getItem(KEY) || 0)); } catch (e) { cur = 0; }
    bar.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const n = (cur + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; select(n, true); tabs[n].focus(); e.preventDefault();
    });
    if (tabs.length === 1) bar.hidden = true;
    deck.appendChild(bar); panes.forEach(function (p) { deck.appendChild(p); });
    // 卡片被頁面程式藏起來（hidden 或 display:none）時，對應分頁也藏起來
    if (window.MutationObserver) {
      const mo = new MutationObserver(syncTabs);
      cards.forEach(function (c) {
        mo.observe(c, { attributes: true, attributeFilter: ['hidden', 'style'] });
        (c._deckWraps || []).forEach(function (w) { mo.observe(w, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] }); });
      });
      // 切換模式常改 html、body、.lab 上的 class 或 data-*
      const mo2 = new MutationObserver(syncSoon);
      [doc.documentElement, doc.body].concat(Array.prototype.slice.call(doc.querySelectorAll('.lab'))).forEach(function (el) { mo2.observe(el, { attributes: true }); });
    }
    // 學生按了任何鍵、改了選項之後再對一次（模式切換可能只改了某個祖先元素）
    doc.addEventListener('click', syncSoon, true);
    doc.addEventListener('change', syncSoon, true);
    anchorEl = anchor;
    anchor.parentNode.insertBefore(deck, anchor.nextSibling);
    return true;
  }
  let syncing = false, syncT = 0;
  // 卡片是否顯示：看實際算出來的樣式（很多頁用 html／body 的模式 class 藏卡片，不是 hidden 屬性）
  function shown(c) { return !c.hidden && getComputedStyle(c).display !== 'none'; }
  function syncSoon() { clearTimeout(syncT); syncT = setTimeout(syncTabs, 0); setTimeout(syncTabs, 150); }
  function syncTabs() {
    if (syncing || !moved) return; syncing = true;
    cards.forEach(function (c) {
      const gone = (c._deckWraps || []).some(function (w) { return w.hidden || getComputedStyle(w).display === 'none'; });
      c.classList.toggle('labdeck-gone', gone);
    });
    const vis = tabs.map(function (b, i) {
      return cards.some(function (c) { return c._deckPane === i && shown(c); });
    });
    tabs.forEach(function (b, i) { if (b.hidden === vis[i]) b.hidden = !vis[i]; });
    // 每個分頁第一張看得到的卡不顯示標題（分頁名就是它），後面的卡留標題和分隔線
    panes.forEach(function (p) {
      let first = true;
      Array.prototype.forEach.call(p.children, function (c) {
        const on = shown(c);
        c.classList.toggle('labdeck-first', on && first); if (on) first = false;
      });
    });
    if (!vis[cur]) { const n = vis.indexOf(true); if (n >= 0) select(n, false); }
    syncing = false;
  }
  function select(i, user) {
    cur = i;
    tabs.forEach(function (b, k) { b.setAttribute('aria-selected', String(k === i)); b.tabIndex = k === i ? 0 : -1; });
    // 沒選到的分頁不用 display:none：裡面的畫布量到寬度 0 會畫出負半徑而出錯；改成隱形、不佔高度、照樣有寬度
    panes.forEach(function (p, k) { const away = k !== i; p.classList.toggle('labdeck-away', away); if (away) p.setAttribute('inert', ''); else p.removeAttribute('inert'); });
    if (user) { try { localStorage.setItem(KEY, String(i)); } catch (e) { /* 無法儲存時照常使用 */ } dispatchEvent(new Event('resize')); }
  }
  function wantMode() {
    if (offClass && doc.documentElement.classList.contains(offClass)) return 'off';
    if (mqDrawer.matches) return 'drawer';
    if (mqPanel.matches) return 'panel';
    if (mq.matches) return 'stack';
    return 'off';
  }
  function hostPanel() { return doc.querySelector('.lab > .panel'); }
  function place() {
    const m = wantMode();
    if (m === mode) { fitSoon(); return; }
    const was = mode; mode = m;
    const on = m !== 'off';
    if (on !== moved) {
      moved = on;
      cards.forEach(function (c) {
        if (on) panes[c._deckPane].appendChild(c);
        else if (c._deckHome) c._deckHome.parentNode.insertBefore(c, c._deckHome.nextSibling);
      });
    }
    // 操作台本身放哪裡
    if (m === 'panel' && hostPanel()) hostPanel().insertBefore(deck, hostPanel().firstChild);
    else if (m === 'drawer') doc.body.appendChild(deck);
    else if (anchorEl && anchorEl.parentNode) anchorEl.parentNode.insertBefore(deck, anchorEl.nextSibling);
    deck.hidden = !on;
    const h = doc.documentElement;
    h.classList.toggle('labdeck-on', on);
    ['stack', 'drawer', 'panel'].forEach(function (k) { h.classList.toggle('labdeck-' + k, m === k); });
    const hp = hostPanel(); if (hp) hp.classList.toggle('labdeck-host', m === 'panel');
    if (on) { select(cur, false); syncTabs(); }
    // 晚一拍才通知畫布重算：同一刻別的程式（例如 lab-layout.js 的兩欄恢復）也在聽視窗變化，等它們排好再量，不會量到一條縫
    setTimeout(function () {
      if (was === 'drawer' || m === 'drawer') { fitN = 0; fit(); }
      dispatchEvent(new Event('resize'));
      fitSoon();
    }, 0);
  }
  /* 手機橫放：主畫布太高時只把「畫布那一塊」縮窄置中，讓畫布整個放得進螢幕高度（照原比例，不變形）；
     播放列、按鈕照原寬一排排開，不跟著擠成好幾排 */
  let fitEl = null;
  function unfit() {
    if (!fitEl) return;
    fitEl.style.maxWidth = ''; fitEl.style.marginLeft = ''; fitEl.style.marginRight = '';
    fitEl = null; dispatchEvent(new Event('resize'));
  }
  function fit() {
    const lab = doc.querySelector('.lab');
    if (!lab || mode !== 'drawer') { unfit(); return; }
    const st = lab.querySelector(':scope > .stage');
    const cv = st && Array.prototype.find.call(st.querySelectorAll('canvas'), function (c) { const r = c.getBoundingClientRect(); return r.width > 150 && r.height > 80; });
    if (!cv) { unfit(); return; }
    let blk = cv;
    while (blk.parentElement && blk.parentElement !== st) blk = blk.parentElement;
    if (fitEl && fitEl !== blk) unfit();
    if (blk._deckNoFit) return;
    const r = cv.getBoundingClientRect(), br = blk.getBoundingClientRect();
    // 先記下原寬時的畫布大小；縮窄後畫布沒有跟著變矮（高度寫死、或有最小高度）就退回原寬，不要變成又窄又高
    if (!blk.style.maxWidth) blk._deckBase = { w: r.width, h: r.height };
    else if (blk._deckBase && r.height > blk._deckBase.h * (r.width / blk._deckBase.w) * 1.2 + 8) {
      blk._deckNoFit = true; fitEl = blk; unfit(); return;
    }
    const aspect = r.height / r.width, avail = innerHeight - 16;
    const extraW = br.width - r.width;                                       // 畫布那一塊裡、畫布以外的左右邊距
    const full = st.clientWidth - (parseFloat(getComputedStyle(st).paddingLeft) || 0) - (parseFloat(getComputedStyle(st).paddingRight) || 0);
    const w = Math.round(Math.min(full, Math.max(full * 0.45, avail / aspect + extraW)));
    const cur = parseFloat(blk.style.maxWidth) || full;
    if (Math.abs(cur - w) > 3) {
      fitEl = blk;
      if (w >= full - 3) { blk.style.maxWidth = ''; blk.style.marginLeft = ''; blk.style.marginRight = ''; }
      else { blk.style.maxWidth = w + 'px'; blk.style.marginLeft = 'auto'; blk.style.marginRight = 'auto'; }
      dispatchEvent(new Event('resize')); if (++fitN < 4) fitSoon();
    }
  }
  function fitSoon() { clearTimeout(fitT); fitT = setTimeout(fit, 180); }
  /** 讓某個控制項所在的分頁顯示出來（步驟指引或「還差什麼」要指它時用） */
  function reveal(el) {
    if (!moved || !el) return false;
    for (let i = 0; i < panes.length; i++) if (panes[i].contains(el)) { if (i !== cur) select(i, true); return true; }
    return false;
  }
  function start() {
    if (!build()) return;
    place();
    [mq, mqDrawer, mqPanel].forEach(function (q) { if (q.addEventListener) q.addEventListener('change', place); else if (q.addListener) q.addListener(place); });
    addEventListener('orientationchange', function () { setTimeout(place, 250); });
    // 手機橫放時網址列收放會改變可用高度：真的換了視窗大小才重算（自己發的 resize 不重算）
    let lastWH = innerWidth + 'x' + innerHeight;
    addEventListener('resize', function () { const k = innerWidth + 'x' + innerHeight; if (k !== lastWH) { lastWH = k; fitN = 0; if (mode === 'drawer') fitSoon(); } });
    // 例如自學模式（html 加上 data-deck-off 指定的 class）時不用操作台，搬回原位
    if (offClass && window.MutationObserver) new MutationObserver(place).observe(doc.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
  window.LabDeck = { reveal: reveal, select: function (i) { if (moved) select(i, true); }, get active() { return moved; }, get mode() { return mode; } };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})();
