/* 數學實驗共用的八向微調小鍵盤（建在 js/vpad.js 上）。
 * 11/16 主串盤查：要精細定位的二維點（三角形頂點、向量終點、頂點 (h, k)…），手指會蓋住點、x／y 滑桿又離畫布遠，
 * 改成疊在畫布上的 3×3 小鍵盤：八個方向一次走一個步距，中央格切換要動的點，底下切換步距。
 *
 * LabMathPad.mount({
 *   id: '代號', canvas: 畫布,
 *   targets: () => [{ key, label: ['中文', 'English'], html?, point: () => ({ x, y })（畫布內的 CSS px）,
 *                     move?: (dx, dy) => {}（數學單位）, sliders?: ['x 滑桿 id', 'y 滑桿 id'] }],
 *   steps: [0.01, 0.1, 0.5], step: 0.1, unit: '',
 *   visible?: () => true, onSelect?: key => {}, home?: (w, h) => ({ x, y })
 * })
 * 有 sliders 沒有 move 時，直接把兩根滑桿加上 dx、dy（夾在 min／max 內）並送出 input、change，頁面原本的程式照常處理。
 * 回傳 { element, select(key), refresh() }：頁面在畫布上點選或拖曳別的點時呼叫 select，讓中央格跟著換。
 */
(function () {
  'use strict';
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function bump(id, d) {
    const el = document.getElementById(id);
    if (!el || el.disabled || !d) return;
    const cur = window.LabNum ? window.LabNum.value(el) : +el.value;
    const lo = +el.min, hi = +el.max;
    let v = cur + d;
    if (Number.isFinite(lo)) v = Math.max(lo, v);
    if (Number.isFinite(hi)) v = Math.min(hi, v);
    v = Math.round(v * 1e6) / 1e6;
    if (window.LabNum) window.LabNum.set(el, v); else el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function mount(o) {
    if (!window.LabVPad || !o.canvas) return null;
    const steps = o.steps || [0.01, 0.1, 0.5];
    let step = o.step || steps[1] || steps[0], cur = null;
    const list = function () { return (o.targets && o.targets()) || []; };
    const get = function () {
      const L = list();
      let t = null;
      for (let i = 0; i < L.length; i++) if (L[i].key === cur) t = L[i];
      if (!t && L.length) { t = L[0]; cur = t.key; }
      return t;
    };
    const name = function (t) { return t ? T(t.label[0], t.label[1]) : ''; };
    const pad = window.LabVPad.mount({
      id: o.id, canvas: o.canvas, lens: false, objects: ['m'], steps: [1], step: 1,
      selected: function () { return 'm'; }, select: function () {},
      move: function (dx, dy) {
        const t = get();
        if (!t) return;
        if (t.move) t.move(dx * step, dy * step);
        else if (t.sliders) { bump(t.sliders[0], dx * step); bump(t.sliders[1], dy * step); }
      },
      point: function () {
        const r = o.canvas.getBoundingClientRect(), t = get();
        const p = t ? t.point() : null;
        return p ? { x: r.left + p.x, y: r.top + p.y } : { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      },
      record: function () {},
      visible: function () { return list().length > 0 && (!o.visible || o.visible()); },
      home: o.home || function (w, h) {
        const r = o.canvas.getBoundingClientRect(), t = get(), p = t ? t.point() : null;
        // 放在離選取的點較遠的那一邊，不蓋住它
        const right = !p || p.x < r.width / 2;
        return { x: right ? r.right - w - 4 : r.left + 4, y: Math.max(r.top + 4, Math.min(innerHeight, r.bottom) - h - 4) };
      },
      viewport: function () {
        const d = document.querySelector('html.labdeck-drawer .labdeck');
        return { width: d ? d.getBoundingClientRect().left : innerWidth, height: innerHeight };
      }
    });
    const el = pad.element;
    el.classList.add('math-vpad');
    el.setAttribute('aria-label', T('八向微調小鍵盤', 'Eight-direction fine-move keypad'));
    const sel = document.createElement('button');
    sel.type = 'button'; sel.className = 'vpad-select math-pad-sel';
    sel.style.gridColumn = '2'; sel.style.gridRow = '2';
    function show() {
      const t = get(), L = list(), n = name(t);
      sel.innerHTML = (t && t.html ? t.html : esc(n)) + (L.length > 1 ? '<small> ⇄</small>' : '');
      sel.disabled = L.length < 2;
      sel.setAttribute('aria-label', T('目前微調：', 'Moving: ') + n + (L.length > 1 ? T('，點一下換下一個', '; tap to switch') : ''));
      el.querySelectorAll('[data-direction]').forEach(function (b) { b.setAttribute('aria-label', T('移動 ', 'Move ') + n + ' ' + b.textContent); });
    }
    sel.addEventListener('click', function () {
      const L = list();
      if (L.length < 2) return;
      let i = 0;
      for (let k = 0; k < L.length; k++) if (L[k].key === cur) i = k;
      cur = L[(i + 1) % L.length].key;
      show(); pad.refresh();
      if (o.onSelect) o.onSelect(cur);
    });
    const old = el.querySelector('.vpad-select');
    if (old) old.replaceWith(sel);
    const fine = document.createElement('button');
    fine.type = 'button'; fine.className = 'vpad-step';
    fine.setAttribute('aria-label', T('切換每按一下走多遠', 'Change the step'));
    function showStep() { fine.textContent = T('每步 ', 'step ') + step + (o.unit ? ' ' + o.unit : ''); }
    fine.addEventListener('click', function () { step = steps[(steps.indexOf(step) + 1) % steps.length]; showStep(); });
    const foot = el.querySelector('.vpad-footer');
    if (foot) foot.replaceChildren(fine);
    show(); showStep();
    // 第一次來先收成小圓鈕，不擋畫面；學生展開後照記住的狀態
    try { if (!localStorage.getItem('lab-vpad:' + o.id)) pad.collapse(true); } catch (e) { pad.collapse(true); }
    window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'lang') { show(); showStep(); } });
    return {
      element: el,
      select: function (key) { if (key != null && key !== cur) { cur = key; show(); pad.refresh(); } },
      refresh: function () { const before = cur; get(); if (before !== cur) show(); else show(); pad.refresh(); }
    };
  }
  window.LabMathPad = { mount: mount };
})();
