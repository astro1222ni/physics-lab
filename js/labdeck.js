/* 手機操作台（共用）
 * 站長 11/16：「手機的頁面，將可以操縱切換的鈕……儘可能全部集中在同一頁，或者至少最多跨一頁？不要跨到好幾頁，
 * 如果捲動到最下面才找得到，這對手機使用者非常不友善。」「旋鈕跟滑桿的間距要縮小」
 * 用法：要搬的卡片加 data-deck="中文|English"（可加 data-deck-order 排序），放操作台的位置加一個 data-deck-anchor 元素。
 * 寬度 < 768 px 時，卡片搬進錨點後面的分頁操作台，一次顯示一張；變寬就搬回原位。卡片內的 id、事件、狀態都不變。
 * 分頁按鈕有 aria-controls，步驟指引（stepguide）要指的控制項在別的分頁時，會先指分頁按鈕。 */
(function () {
  'use strict';
  const doc = document;
  const T = function (a, b) { return window.LabSettings ? LabSettings.t(a, b) : a; };
  const mq = window.matchMedia ? matchMedia('(max-width: 767px)') : null;
  let deck = null, tabs = [], panes = [], cards = [], cur = 0, moved = false, offClass = '';
  const KEY = 'labdeck:' + location.pathname;

  function build() {
    const anchor = doc.querySelector('[data-deck-anchor]');
    cards = Array.prototype.slice.call(doc.querySelectorAll('[data-deck]'));
    if (!anchor || !cards.length) return false;
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
    deck.appendChild(bar); panes.forEach(function (p) { deck.appendChild(p); });
    anchor.parentNode.insertBefore(deck, anchor.nextSibling);
    return true;
  }
  function select(i, user) {
    cur = i;
    tabs.forEach(function (b, k) { b.setAttribute('aria-selected', String(k === i)); b.tabIndex = k === i ? 0 : -1; });
    panes.forEach(function (p, k) { p.hidden = k !== i; });
    if (user) { try { localStorage.setItem(KEY, String(i)); } catch (e) { /* 無法儲存時照常使用 */ } dispatchEvent(new Event('resize')); }
  }
  function place() {
    const on = !!(mq && mq.matches) && !(offClass && doc.documentElement.classList.contains(offClass));
    if (on === moved) return;
    moved = on;
    cards.forEach(function (c) {
      if (on) panes[c._deckPane].appendChild(c);
      else if (c._deckHome) c._deckHome.parentNode.insertBefore(c, c._deckHome.nextSibling);
    });
    deck.hidden = !on;
    doc.documentElement.classList.toggle('labdeck-on', on);
    if (on) select(cur, false);
    dispatchEvent(new Event('resize'));
  }
  /** 讓某個控制項所在的分頁顯示出來（步驟指引或「還差什麼」要指它時用） */
  function reveal(el) {
    if (!moved || !el) return false;
    for (let i = 0; i < panes.length; i++) if (panes[i].contains(el)) { if (i !== cur) select(i, true); return true; }
    return false;
  }
  function start() {
    if (!build()) return;
    place();
    if (mq) { if (mq.addEventListener) mq.addEventListener('change', place); else mq.addListener(place); }
    // 例如自學模式（html 加上 data-deck-off 指定的 class）時不用操作台，搬回原位
    if (offClass && window.MutationObserver) new MutationObserver(place).observe(doc.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
  window.LabDeck = { reveal: reveal, select: function (i) { if (moved) select(i, true); }, get active() { return moved; } };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})();
