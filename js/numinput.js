/*
 * numinput.js — 點擊滑桿旁的數字即可直接輸入數值
 *
 * 自動套用到每一個 <input type="range">（找同一個 .slider 裡的 <output>，或 #<id>o、output[for=<id>]）。
 * - 點一下（或按 Enter / 空白鍵）數字 → 變成輸入框；Enter 或點別處確定，Esc 取消。
 * - 超出範圍自動限制在最小／最大值，並短暫提示範圍。
 * - 打字的精度可以比滑桿更細：range 的 data-decimals="2" 表示最多到小數第 2 位
 *   （預設為滑桿 step 的小數位數再多 1 位）。拖曳滑桿時仍是原本的間隔。
 * - 負數範圍會多一個「±」按鈕（iPhone 的數字鍵盤沒有負號）。
 *
 * 模組讀值請改用 LabNum.value(rangeEl)：打字輸入的精確值會保留，拖曳滑桿後自動回到滑桿值。
 * 對數刻度或其他非線性滑桿，用 LabNum.register(rangeEl, {
 *   toValue: pos => 實際值, toPos: 實際值 => 滑桿位置, min, max, decimals
 * }) 告訴元件如何換算；LabNum.value() 會傳回實際值。
 * 輸入完成時會對 range 觸發 input 與 change 事件，模組原本的事件處理會照常更新畫面。
 * 程式（例如預設情境按鈕）改變滑桿時，請用 LabNum.set(range, 實際值)，或改 range.value 前呼叫 LabNum.clear(range)。
 */
(function () {
  'use strict';

  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const reg = new WeakMap();   // range → { toValue, toPos, min, max, decimals }
  const exact = new WeakMap(); // range → { v, pos }：打字輸入的精確值與當時的滑桿位置

  function decimalsOf(x) {
    const s = String(x);
    if (/e-/i.test(s)) return parseInt(s.split(/e-/i)[1], 10);
    const i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
  }
  function info(range) {
    const r = reg.get(range) || {};
    const min = r.min != null ? r.min : (r.toValue ? r.toValue(+range.min) : +range.min);
    const max = r.max != null ? r.max : (r.toValue ? r.toValue(+range.max) : +range.max);
    let dec = r.decimals;
    if (dec == null && range.dataset.decimals != null) dec = parseInt(range.dataset.decimals, 10);
    if (dec == null) dec = range.step && range.step !== 'any' ? decimalsOf(range.step) + 1 : 3;
    return { min: Math.min(min, max), max: Math.max(min, max), decimals: Math.max(0, Math.min(6, dec)), r: r };
  }

  function value(range) {
    const e = exact.get(range);
    if (e && e.pos === range.value) return e.v;
    const r = reg.get(range);
    return r && r.toValue ? r.toValue(+range.value) : +range.value;
  }
  function decimals(range) { return info(range).decimals; }

  function parse(text) {
    let s = String(text || '').normalize('NFKC').trim()
      .replace(/[，,]/g, '.').replace(/[−–—]/g, '-').replace(/\s+/g, '');
    s = s.replace(/×10\^?/i, 'e');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
    return parseFloat(s);
  }
  function fmt(v, dec) {
    let s = v.toFixed(dec);
    if (dec > 0) s = s.replace(/\.?0+$/, '');
    return s === '-0' ? '0' : s;
  }
  function show(v, dec) { return fmt(v, dec).replace('-', '−'); } // 提示文字用真正的負號

  function setValue(range, v) {
    const inf = info(range);
    const p = Math.pow(10, inf.decimals);
    v = Math.round(Math.min(inf.max, Math.max(inf.min, v)) * p) / p;
    const pos = inf.r.toPos ? inf.r.toPos(v) : v;
    range.value = String(pos);
    exact.set(range, { v: v, pos: range.value });
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
    return v;
  }

  // 使用者拖曳滑桿時，清除打字的精確值
  document.addEventListener('input', function (e) {
    if (e.isTrusted && e.target && e.target.type === 'range') exact.delete(e.target);
  }, true);

  function findOutput(range) {
    const box = range.closest('.slider');
    return (box && box.querySelector('output')) ||
      (range.id && (document.getElementById(range.id + 'o') || document.querySelector('output[for~="' + range.id + '"]'))) || null;
  }

  let hintTimer = 0;
  function hint(anchor, text) {
    let h = document.getElementById('lab-num-hint');
    if (!h) {
      h = document.createElement('div');
      h.id = 'lab-num-hint';
      h.className = 'lab-num-hint';
      h.setAttribute('role', 'status');
      document.body.appendChild(h);
    }
    h.textContent = text;
    const r = anchor.getBoundingClientRect();
    h.style.left = Math.max(8, Math.min(window.innerWidth - 220, r.left + window.scrollX)) + 'px';
    h.style.top = (r.bottom + window.scrollY + 6) + 'px';
    h.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { h.hidden = true; }, 2200);
  }

  function edit(range, out) {
    if (out.dataset.editing) return;
    const inf = info(range);
    const start = value(range);
    out.dataset.editing = '1';
    out.hidden = true;

    const wrap = document.createElement('span');
    wrap.className = 'lab-num-edit';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.inputMode = inf.min < 0 ? 'text' : 'decimal';
    inp.setAttribute('enterkeyhint', 'done');
    inp.autocomplete = 'off';
    inp.spellcheck = false;
    inp.value = fmt(start, inf.decimals);
    inp.setAttribute('aria-label', T('輸入數值，範圍 ', 'Enter a value, range ') + fmt(inf.min, inf.decimals) + T(' 到 ', ' to ') + fmt(inf.max, inf.decimals));
    wrap.appendChild(inp);
    if (inf.min < 0) {
      const pm = document.createElement('button');
      pm.type = 'button';
      pm.className = 'lab-num-pm';
      pm.textContent = '±';
      pm.setAttribute('aria-label', T('切換正負號', 'Toggle sign'));
      pm.addEventListener('pointerdown', function (e) { e.preventDefault(); });
      pm.addEventListener('click', function () {
        const v = inp.value.trim();
        inp.value = v.charAt(0) === '-' ? v.slice(1) : v ? '-' + v.replace(/^\+/, '') : '-';
        inp.focus();
      });
      wrap.appendChild(pm);
    }
    out.insertAdjacentElement('afterend', wrap);
    inp.focus();
    inp.select();

    let done = false;
    function finish(commit) {
      if (done) return;
      done = true;
      if (commit) {
        const v = parse(inp.value);
        if (!isNaN(v)) {
          const set = setValue(range, v);
          const p = Math.pow(10, inf.decimals);
          if (Math.round(v * p) / p !== set) {
            hint(out, T('範圍 ', 'Range ') + show(inf.min, inf.decimals) + T(' ～ ', ' to ') + show(inf.max, inf.decimals));
          }
        } else if (inp.value.trim() !== '') {
          hint(out, T('請輸入數字', 'Please enter a number'));
        }
      }
      wrap.remove();
      out.hidden = false;
      delete out.dataset.editing;
    }
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); out.focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); out.focus(); }
    });
    inp.addEventListener('blur', function () { setTimeout(function () { finish(true); }, 0); });
  }

  function enhance(range) {
    if (range.dataset.numinput) return;
    const out = findOutput(range);
    if (!out) return;
    range.dataset.numinput = '1';
    out.classList.add('lab-num');
    out.tabIndex = 0;
    out.setAttribute('role', 'button');
    const label = function () {
      const lab = range.id && document.querySelector('label[for="' + range.id + '"]');
      return T('點擊輸入數值', 'Click to type a value') + (lab ? T('：', ': ') + lab.textContent.trim() : '');
    };
    out.setAttribute('title', label());
    out.addEventListener('click', function () { edit(range, out); });
    out.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); edit(range, out); }
    });
  }

  function scan(root) { (root || document).querySelectorAll('input[type="range"]').forEach(enhance); }

  window.LabNum = {
    value: value,
    decimals: decimals,
    register: function (range, opts) { reg.set(range, opts || {}); },
    set: setValue,
    // 預設情境等程式直接改 range.value 時，請先呼叫 clear（或直接用 LabNum.set）
    clear: function (range) { exact.delete(range); },
    scan: scan
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { scan(); });
  else scan();
})();
