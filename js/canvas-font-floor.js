/* canvas-font-floor.js — 手機橫放時，畫布上的字實際顯示至少 9 px
 *
 * 11/27 站長選 A：手機橫放（LabDeck 的 drawer 模式）時，畫布顯示寬 ÷ 繪圖寬至少 0.7，
 * 但副畫布常剛好卡在 0.7：12 px 的字只剩 8.4 px、11 px 只剩 7.7 px，看不清楚。
 * 這支檔在設定 ctx.font 的當下，把「字級 × 畫布顯示縮放 × 目前變換倍數」算成實際顯示的大小；
 * 低於 9.2 px 的字放大到剛好 9.2 px（最多放大到原字級的 1.35 倍），本來就夠大的字不動。
 * 只在 html 有 labdeck-drawer 類別（手機橫放）時放大，直放與電腦版的字不變；不在網頁上的畫布（3D 標籤貼圖）不動。
 * 需要重畫時送出 resize 與 lab:fontfloor；只看繪圖寬重畫的頁面要監聽 lab:fontfloor（11/27 Antigravity 複驗查出 10 站沒重畫）。
 * 由需要的實驗頁自己引入（放在畫圖程式之前），不改共用的 labdeck.js、drawkit.js。
 */
(function () {
  'use strict';
  if (typeof CanvasRenderingContext2D === 'undefined') return;
  const P = CanvasRenderingContext2D.prototype;
  const desc = Object.getOwnPropertyDescriptor(P, 'font');
  if (!desc || !desc.set || P.__labFontFloor) return;
  Object.defineProperty(P, '__labFontFloor', { value: true });

  const FLOOR = 9.2, CAP = 1.35, root = document.documentElement;
  const cache = new WeakMap();
  const dpr = function () { return window.devicePixelRatio || 1; };
  const drawer = function () { return root.classList.contains('labdeck-drawer'); };

  // 畫布顯示寬改變（操作台在畫字之後才把畫布縮窄）、或剛切換成橫放時，先前畫的字是照舊縮放算的：
  // 送一次 resize 和 lab:fontfloor 讓頁面重畫（合併 150 ms 內的變化；3 秒內最多 6 次，避免和版面調整互相觸發）。
  // 只看「繪圖寬」重畫的頁面（ResizeObserver 版），繪圖寬沒變時不理 resize，要另外監聽 lab:fontfloor。
  let pending = 0, kicks = [], force = false;
  function kick(always) {
    if (always) force = true;
    if (pending) return;
    pending = setTimeout(function () {
      pending = 0;
      const now = performance.now(), f = force;
      force = false;
      kicks = kicks.filter(function (t) { return now - t < 3000; });
      if (kicks.length >= 6 || !(f || drawer())) return;
      kicks.push(now);
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('lab:fontfloor'));
    }, 150);
  }
  // 操作台切換擺法（加上或拿掉 labdeck-drawer）時，畫好的字要照新規則重畫
  let wasDrawer = drawer();
  if (typeof MutationObserver === 'function') new MutationObserver(function () {
    const d = drawer();
    if (d !== wasDrawer) { wasDrawer = d; kick(true); }
  }).observe(root, { attributes: true, attributeFilter: ['class'] });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(function (list) {
    list.forEach(function (it) {
      const c = it.target, e = cache.get(c);
      if (!e) return;
      const s = measure(c);
      if (e.s > 0 && s > 0 && Math.abs(s - e.s) / e.s > 0.03 && e.used) kick();
      e.s = s; e.used = false;
    });
  }) : null;

  function measure(c) {
    const w = c.getBoundingClientRect().width;
    return w > 0 && c.width ? w / (c.width / dpr()) : 0;
  }
  // 畫布顯示縮放（CSS 顯示寬 ÷ 繪圖邏輯寬）；寬度改變由 ResizeObserver 更新
  function displayScale(c) {
    if (!c || !c.isConnected || !c.width) return 0;
    let e = cache.get(c);
    if (!e || e.cw !== c.width || !ro) {
      e = { s: measure(c), cw: c.width, used: false };
      if (!cache.has(c) && ro) ro.observe(c);
      cache.set(c, e);
    }
    e.used = true;
    return e.s;
  }

  Object.defineProperty(P, 'font', {
    configurable: true,
    enumerable: desc.enumerable,
    get: desc.get,
    set: function (v) {
      if (typeof v === 'string') {
        // 直放時也先記下這張畫布（之後轉成橫放、縮窄時才知道要重畫），但只有橫放才放大
        const s = displayScale(this.canvas);
        if (s > 0 && drawer()) {
          let t = 1;
          try { const m = this.getTransform(); t = Math.hypot(m.a, m.b) / dpr() || 1; } catch (err) { t = 1; }
          const eff = s * t;
          v = v.replace(/(\d*\.?\d+)px/, function (all, n) {
            const px = +n;
            if (!(px > 0) || px * eff >= FLOOR) return all;
            return (Math.round(Math.min(px * CAP, FLOOR / eff) * 10) / 10) + 'px';
          });
        }
      }
      desc.set.call(this, v);
    }
  });
})();
