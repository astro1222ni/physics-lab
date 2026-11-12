/*
 * 實驗台版面平衡（11/12 站長：「中間有很大的空空洞的地方是沒有使用到的……和實驗室都一樣」）
 *
 * 寬螢幕（881 px 以上）的實驗台是「左邊畫布、右邊 320 px 控制面板」兩欄。
 * 面板卡片很多時，右欄比畫布長很多，畫布下方就空出一大片。
 * 這支程式把面板「尾端」的卡片一張一張搬到畫布下方的 .lab-spill（排成兩欄以上），
 * 每搬一張就重新量一次，左右兩欄最接近時停下；窄螢幕（單欄）時全部放回原位。
 *
 * 規則：
 * - 只搬面板尾端連續的 .card（搬的是同一段尾巴，閱讀順序不變）；第一張看得到的卡片不搬。
 * - 含有目前焦點的卡片不搬（避免打字、拖滑桿時卡片被搬走）；按著滑鼠時延到放開再調整。
 * - 頁面自訂 grid-template-areas 的實驗台（atwood、collision、oscillation……）：
 *   每一列最後一欄都是面板時，在最下面加一列「labspill 面板」；條件不符就不動。
 * - .lab-spill 也帶 panel class，頁面裡「.panel X」的樣式照樣有效。
 * - 卡片加 data-keep 或實驗台加 data-no-spill 可以不參與。
 * 由 settings.js 自動載入，每頁不必改 HTML。
 */
(function () {
  'use strict';
  if (window.__labLayout) return;
  const labs = Array.prototype.slice.call(document.querySelectorAll('.lab'));
  if (!labs.length) return;

  const WIDE = window.matchMedia('(min-width: 881px)');
  const SLACK = 120;     // 左右差在這個範圍內就不必搬
  const RECHECK = 200;   // 之後尺寸變動（換模式、展開說明、紀錄表變長）差超過這個才重新調整，避免學生操作時卡片一直跳
  const state = new Map();

  function shown(el) { return el.getClientRects().length > 0; }

  function panelOf(lab) {
    const kids = lab.children;
    for (let i = 0; i < kids.length; i++) {
      if (kids[i].classList.contains('panel') && !kids[i].classList.contains('lab-spill')) return kids[i];
    }
    return null;
  }

  // 右減左：面板內容的底 − 左欄所有東西的底（正數＝右邊比較長）
  function diff(lab, panel) {
    let left = -Infinity, right = -Infinity;
    const kids = lab.children;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      if (k === panel || !shown(k)) continue;
      left = Math.max(left, k.getBoundingClientRect().bottom);
    }
    const cards = panel.children;
    for (let i = 0; i < cards.length; i++) {
      if (shown(cards[i])) right = Math.max(right, cards[i].getBoundingClientRect().bottom);
    }
    if (left === -Infinity || right === -Infinity) return 0;
    return right - left;
  }

  // 這個實驗台要怎麼加一列：回傳要套用的 inline 樣式，不適合就回傳 null
  function plan(lab, panel) {
    if (lab.hasAttribute('data-no-spill')) return null;
    const cs = getComputedStyle(lab);
    if (cs.display !== 'grid') return null;
    const cols = cs.gridTemplateColumns.trim().split(/\s+/);
    if (cols.length !== 2) return null;
    const areas = cs.gridTemplateAreas;
    if (!areas || areas === 'none') {
      // 預設兩欄：只有畫布與面板
      const others = Array.prototype.filter.call(lab.children, function (k) { return k !== panel && !k.classList.contains('lab-spill'); });
      if (others.length !== 1) return null;
      return { stage: others[0], areas: '"labmain labpanel" "labspill labpanel"', rows: 'auto 1fr', panelArea: 'labpanel' };
    }
    const rows = areas.match(/"[^"]*"/g);
    if (!rows || !rows.length) return null;
    let p = null;
    for (let i = 0; i < rows.length; i++) {
      const t = rows[i].slice(1, -1).trim().split(/\s+/);
      if (t.length !== 2 || t[0] === t[1]) return null;
      if (p === null) p = t[1];
      else if (t[1] !== p) return null;
    }
    const pcs = getComputedStyle(panel);
    if (pcs.gridColumnStart !== p && pcs.gridRowStart !== p) return null;
    return { stage: null, areas: rows.join(' ') + ' "labspill ' + p + '"', rows: 'repeat(' + rows.length + ', auto) 1fr', panelArea: null };
  }

  function setup(lab, panel) {
    let s = state.get(lab);
    if (s && s.spill) return s;
    const pl = plan(lab, panel);
    if (!pl) return null;
    const spill = document.createElement('div');
    spill.className = 'panel lab-spill';
    // 報紙式分欄（不是格子）：卡片高矮不一時兩欄高度會自動拉平，不會在矮卡片下面留洞
    spill.style.cssText = 'grid-area: labspill; align-self: start; display: block; column-gap: 12px; min-width: 0;';
    panel.insertAdjacentElement('afterend', spill);
    lab.style.gridTemplateAreas = pl.areas;
    lab.style.gridTemplateRows = pl.rows;
    if (pl.stage) { pl.stage.style.gridArea = 'labmain'; panel.style.gridArea = pl.panelArea; }
    s = { spill: spill, panel: panel, stage: pl.stage };
    state.set(lab, s);
    lab.classList.add('lab-balanced');
    return s;
  }

  function teardown(lab) {
    const s = state.get(lab);
    if (!s || !s.spill) return;
    while (s.spill.firstElementChild) s.panel.appendChild(s.spill.firstElementChild);
    s.spill.remove();
    lab.style.gridTemplateAreas = '';
    lab.style.gridTemplateRows = '';
    if (s.stage) s.stage.style.gridArea = '';
    s.panel.style.gridArea = '';
    lab.classList.remove('lab-balanced');
    state.delete(lab);
  }

  function hasFocus(el) { const a = document.activeElement; return !!a && a !== document.body && el.contains(a); }

  // 版面分數（越小越好）：實驗台的高度，再加上畫布下方空洞高度的 0.3 倍
  // ——左欄寬、在畫面中間，空在那裡比右邊窄欄底下的空白顯眼（站長：「中間有很大的空空洞」）
  function cost(lab, panel) {
    const top = lab.getBoundingClientRect().top;
    let left = top, right = top;
    const kids = lab.children;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      if (k === panel || !shown(k)) continue;
      left = Math.max(left, k.getBoundingClientRect().bottom);
    }
    const cards = panel.children;
    for (let i = 0; i < cards.length; i++) {
      if (shown(cards[i])) right = Math.max(right, cards[i].getBoundingClientRect().bottom);
    }
    return Math.max(left, right) - top + 0.3 * Math.max(0, right - left);
  }

  // 欄數：每欄至少 280 px；只有一張看得到的卡片時用滿整個寬度
  function fitCols(s) {
    let n = 0;
    for (let k = s.spill.firstElementChild; k; k = k.nextElementSibling) if (shown(k)) n++;
    const w = s.spill.clientWidth || s.spill.getBoundingClientRect().width;
    const max = Math.max(1, Math.floor((w + 12) / (280 + 12)));
    const cols = Math.max(1, Math.min(n, max));
    if (s.spill.style.columnCount !== String(cols)) s.spill.style.columnCount = String(cols);
  }

  // 把卡片序列 C（面板＋畫布下方，原本的閱讀順序）切在 to：前 to 張在面板、其餘在畫布下方
  function splitAt(s, C, from, to) {
    if (to < from) { const ref = s.spill.firstChild; for (let i = to; i < from; i++) s.spill.insertBefore(C[i], ref); }
    else for (let i = from; i < to; i++) s.panel.appendChild(C[i]);
  }

  // 試每一種切法（搬 1 張、2 張……），挑版面分數最好的；差不多時搬得少的優先
  function balance(lab) {
    const panel = panelOf(lab);
    if (!panel || !shown(lab)) return false;
    const old = state.get(lab);
    const C = Array.prototype.slice.call(panel.children).concat(old && old.spill ? Array.prototype.slice.call(old.spill.children) : []);
    const cur = panel.children.length;
    // 可以切的最小位置：第一張看得到的卡片之後、所有不能搬的東西之後
    let lo = 0;
    for (let i = 0; i < C.length; i++) { if (shown(C[i])) { lo = i + 1; break; } }
    for (let i = 0; i < C.length; i++) { const c = C[i]; if (!c.classList.contains('card') || c.hasAttribute('data-keep')) lo = Math.max(lo, i + 1); }
    let hi = C.length;
    // 焦點所在的卡片不換位置
    for (let i = 0; i < C.length; i++) {
      if (!hasFocus(C[i])) continue;
      if (i < cur) lo = Math.max(lo, i + 1); else hi = Math.min(hi, i);
    }
    if (lo > hi) return false;
    const cands = [];
    for (let k = lo; k < C.length; k++) if (shown(C[k]) && k <= hi) cands.push(k);
    if (!cands.length && cur === C.length) return false;

    // 不搬時的高度
    let at = cur;
    if (old && old.spill) { splitAt(old, C, at, C.length); at = C.length; teardown(lab); }
    const h0 = cost(lab, panel);
    let best = C.length, bestH = h0;
    if (cands.length) {
      const s = setup(lab, panel);
      if (s) {
        for (let j = cands.length - 1; j >= 0; j--) {
          const k = cands[j];
          splitAt(s, C, at, k); at = k; fitCols(s);
          const h = cost(lab, panel);
          if (h < bestH - 8) { best = k; bestH = h; }
        }
        // 分數好不到 40 就不搬
        if (best !== C.length && bestH > h0 - 40) best = C.length;
        splitAt(s, C, at, best); at = best;
        if (best === C.length) teardown(lab); else fitCols(s);
      }
    }
    return best !== cur;
  }

  // 看得到哪些卡片（換模式時會變）：變了就一定重排
  const sigs = new Map();
  function sig(lab) {
    const panel = panelOf(lab), s = state.get(lab);
    if (!panel) return '';
    let out = '';
    for (let k = panel.firstElementChild; k; k = k.nextElementSibling) out += shown(k) ? '1' : '0';
    if (s && s.spill) for (let k = s.spill.firstElementChild; k; k = k.nextElementSibling) out += shown(k) ? '1' : '0';
    return out;
  }

  let busy = false;
  function run() {
    if (busy) return;
    busy = true;
    let changed = false;
    const ae = document.activeElement;
    try {
      labs.forEach(function (lab) {
        if (WIDE.matches) { if (balance(lab)) changed = true; }
        else if (state.has(lab)) { teardown(lab); changed = true; }
        sigs.set(lab, sig(lab));
      });
    } finally { busy = false; }
    // 試排時卡片搬來搬去會讓焦點掉了：放回原本的按鈕或滑桿（鍵盤操作的學生才不會迷路）
    if (ae && ae !== document.body && ae !== document.activeElement && document.contains(ae)) { try { ae.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ } }
    // 卡片變寬或變窄：讓頁面裡依寬度畫圖的小圖表重畫
    if (changed) { lastW = window.innerWidth; window.dispatchEvent(new Event('resize')); }
  }

  // 寬度改變（含轉向、投影模式）：從頭來
  let lastW = window.innerWidth, tW = 0;
  function onResize() {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    clearTimeout(tW);
    tW = setTimeout(function () { labs.forEach(teardown); run(); }, 250);
  }
  window.addEventListener('resize', onResize);
  if (WIDE.addEventListener) WIDE.addEventListener('change', function () { labs.forEach(teardown); run(); });

  // 內容高度改變（換模式、展開收合、讀數變多）：差太多才調整；按著滑鼠時等放開
  let pressing = false, tRO = 0;
  function later() {
    clearTimeout(tRO);
    tRO = setTimeout(function () {
      if (pressing) return;
      const need = labs.some(function (lab) {
        const panel = panelOf(lab);
        if (!panel || !WIDE.matches) return false;
        if (sig(lab) !== sigs.get(lab)) return true;
        const d = diff(lab, panel);
        return d > RECHECK || (state.has(lab) && d < -RECHECK);
      });
      if (need) run();
    }, 400);
  }
  document.addEventListener('pointerdown', function () { pressing = true; }, true);
  document.addEventListener('pointerup', function () { if (pressing) { pressing = false; later(); } }, true);
  document.addEventListener('pointercancel', function () { if (pressing) { pressing = false; later(); } }, true);
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(function () { if (!busy) later(); });
    labs.forEach(function (lab) { ro.observe(lab); const p = panelOf(lab); if (p) ro.observe(p); });
  }

  function start() { setTimeout(run, 300); setTimeout(run, 1500); }
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
  document.addEventListener('lab:langchange', function () { setTimeout(run, 300); });

  window.__labLayout = { run: run, reset: function () { labs.forEach(teardown); }, diff: function (i) { const l = labs[i || 0]; return diff(l, panelOf(l)); } };
})();
