/*
 * keys.js — 畫布上可拖曳物件的鍵盤操作（無障礙；WCAG 2.1.1 鍵盤可操作）
 *
 * 用法（在模組程式裡，畫布建立之後）：
 *   const kb = LabKeys.attach(canvas, {
 *     label: T('拋體實驗畫布。按 Enter 切換要移動的物件，方向鍵移動，Shift 加方向鍵移動得更多。', 'Projectile canvas. …'),
 *     items: [
 *       { name: function () { return T('發射台', 'Launcher'); },
 *         move: function (dx, dy, big) { … 依 dx、dy（-1、0、1）移動，big 為 true 時移動較多；回傳 true 表示有變動 },
 *         describe: function () { return T('發射台高度 2.0 m', 'Launcher height 2.0 m'); } },
 *       …
 *     ],
 *     onChange: function () { requestDraw(); }   // 選取或移動後重畫（可選）
 *   });
 *   畫圖時可用 kb.focused()、kb.index() 在被選取的物件周圍畫焦點框（用 --accent 色、虛線圓角框）。
 *
 * 按鍵：Enter／空白鍵 → 選下一個物件（Shift 反向）；方向鍵 → 移動；Shift＋方向鍵 → 大步；
 *       Esc → 離開畫布焦點。每次選取或移動，都把 describe() 的文字送到螢幕閱讀器（aria-live）。
 */
(function () {
  'use strict';
  const T = function (zh, en) { return window.LabSettings ? LabSettings.t(zh, en) : zh; };
  let live = null;
  function say(text) {
    if (!live) {
      live = document.createElement('div');
      live.className = 'sr-only';
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('role', 'status');
      document.body.appendChild(live);
    }
    live.textContent = '';
    setTimeout(function () { live.textContent = text; }, 30); // 先清空再寫，同樣的字也會再念一次
  }
  function attach(canvas, opts) {
    const items = opts.items || [];
    let sel = 0, focused = false;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-roledescription', T('互動實驗畫布', 'interactive simulation canvas'));
    canvas.setAttribute('aria-label', opts.label || T('實驗畫布：按 Enter 切換物件，方向鍵移動。', 'Simulation canvas: press Enter to pick an object, arrow keys to move it.'));
    canvas.classList.add('lab-kb-canvas');
    function nameOf(i) { const it = items[i]; return it ? (typeof it.name === 'function' ? it.name() : it.name) : ''; }
    function desc(i) { const it = items[i]; return it && it.describe ? it.describe() : nameOf(i); }
    function changed() { if (opts.onChange) opts.onChange(); }
    canvas.addEventListener('focus', function () {
      focused = true;
      if (items.length) say(T('已選取 ', 'Selected: ') + nameOf(sel) + T('。', '. ') + desc(sel));
      changed();
    });
    canvas.addEventListener('blur', function () { focused = false; changed(); });
    canvas.addEventListener('keydown', function (e) {
      if (!items.length) return;
      const k = e.key;
      if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        sel = (sel + (e.shiftKey ? items.length - 1 : 1)) % items.length;
        say(T('已選取 ', 'Selected: ') + nameOf(sel) + T('。', '. ') + desc(sel));
        changed();
        return;
      }
      if (k === 'Escape') { canvas.blur(); return; }
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[k];
      if (!d) return;
      e.preventDefault();
      const it = items[sel];
      if (it && it.move && it.move(d[0], d[1], e.shiftKey) !== false) {
        say(desc(sel));
        changed();
        // 讓統計與任務知道有操作（和滑鼠拖曳一樣）
        canvas.dispatchEvent(new CustomEvent('lab:keymove', { bubbles: true, detail: { index: sel } }));
      }
    });
    return {
      focused: function () { return focused; },
      index: function () { return sel; },
      select: function (i) { if (i >= 0 && i < items.length) { sel = i; changed(); } },
      say: say
    };
  }
  window.LabKeys = { attach: attach, say: say };
})();
