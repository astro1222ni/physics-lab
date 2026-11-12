/* perceptron.js — 「感知器：一條線分兩類」的畫面與操作
 * 計算全部在 js/perceptron-core.js（Session、Trainer、maxMargin）；這裡只負責畫、操作、音效、送任務事件。
 * 3D 檢視（加權和斜面）在 js/perceptron-3d.js，按「3D 加權和」時才載入（three.js 也是那時才 import）。
 */
(function () {
  'use strict';
  const PC = window.PerceptronCore, D = window.LabDraw;
  if (!PC || !D) return;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const alpha = D.alpha, shade = D.shade;
  const G = PC.GRID;
  const L = 1.12;               // 特徵平面畫出 [−L, L]²（資料點只能放在 [−1, 1]²）
  const TRAIL_MAX = 400;        // 權重軌跡最多保留幾個點（超過就每隔一個留一個）
  const fnt = function (px, w) { return (w || 500) + ' ' + px + 'px ' + FONT; };
  const now = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };

  // =====================================================================
  // 狀態
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d'), cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  const stage = $('stage');
  const state = {
    cls: 1, playing: false, rate: 6, acc: 0, lastT: 0, showBand: false, rotated: false,
    trainerRef: null, trail: [], last: null, lastAt: 0, prevW: null, prevAt: 0, lastFinish: null,
    hover: -1, drag: null, down: null, cursor: { gx: 0, gy: 0 }, sndAt: 0, boxAt: 0, boxDirty: false
  };
  let C = {};
  let view3 = null;
  const bridge = { rev: 0 };   // 3D 檢視用（下面補齊）

  const S = new PC.Session({ emit: onEmit });
  S.loadPreset('and', true);    // 一打開是 AND（不送任何任務事件）

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['pos', 'neg', 'line', 'w', 'wrong', 'cur', 'ok', 'panel', 'band'].forEach(function (k) { C[k] = cs.getPropertyValue('--pc-' + k).trim() || '#888888'; });
    C.text = D.c.text; C.muted = D.c.muted; C.bg = D.c['canvas-bg']; C.border = D.c.border; C.accent = D.c.accent; C.surface = D.c.surface;
    heatKey = '';
  }

  // =====================================================================
  // 數字格式
  // =====================================================================
  function sci(a) { let e = Math.floor(Math.log10(a)), m = (a / Math.pow(10, e)).toFixed(2); if (m === '10.00') { m = '1.00'; e++; } return { m: m, e: e }; }
  /** HTML（負號用 −，科學記號用 <sup>） */
  function num(v) {
    if (!isFinite(v)) return '∞';
    if (Math.abs(v) < 1e-12) return '0';
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e5 || a < 1e-3) { const q = sci(a); return s + q.m + ' × 10<sup>' + (q.e < 0 ? '−' : '') + Math.abs(q.e) + '</sup>'; }
    return s + (a >= 100 ? a.toFixed(1) : a >= 10 ? a.toFixed(2) : a.toFixed(3));
  }
  /** 畫布用的純文字（沒有上標，太大或太小時改用 3 位有效數字） */
  function numTxt(v, d) {
    if (!isFinite(v)) return '∞';
    if (Math.abs(v) < 1e-12) return '0';
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e5 || a < 1e-3) return s + a.toPrecision(3).replace('e+', 'e');
    return s + a.toFixed(d == null ? (a >= 100 ? 1 : a >= 10 ? 2 : 3) : d);
  }
  /** KaTeX 用 */
  function numTex(v) {
    if (!isFinite(v)) return '\\infty';
    if (Math.abs(v) < 1e-12) return '0';
    const a = Math.abs(v), s = v < 0 ? '-' : '';
    if (a >= 1e5 || a < 1e-3) { const q = sci(a); return s + q.m + '\\times 10^{' + q.e + '}'; }
    return s + (a >= 100 ? a.toFixed(1) : a >= 10 ? a.toFixed(2) : a.toFixed(3));
  }
  function coordTxt(p) { return '(' + numTxt(p.x, 2) + ', ' + numTxt(p.y, 2) + ')'; }
  function clsTxt(c) { return c > 0 ? '+1' : '−1'; }
  function boundHtml(mm) { return mm.separable ? (mm.bound >= 1e5 ? num(mm.bound) : mm.bound >= 100 ? mm.bound.toFixed(1) : mm.bound.toFixed(2)) : '—'; }
  function niceCeil(v) { if (!(v > 0)) return 1; const e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e; }
  function tex(s) { return window.katex ? window.katex.renderToString(s, { throwOnError: false }) : s; }
  const SET_NAME = function (s) {
    return { and: 'AND', or: 'OR', nand: 'NAND', xor: 'XOR', sep: T('隨機可分', 'Random separable'), noisy: T('有雜訊', 'Noisy'),
      custom: T('自訂', 'Custom'), empty: T('空的', 'Empty') }[s] || s;
  };

  // =====================================================================
  // 版面
  // =====================================================================
  let W = 600, H = 520, dpr = 1, cw2 = 0, ch2 = 150;
  const P = { x: 8, y: 8, s: 400, k: 100 };          // 特徵平面
  const WR = { x: 0, y: 0, w: 200, h: 200 };          // 權重空間
  const GR = { x: 0, y: 0, w: 200, h: 200 };          // 每個點的 y·z
  let wide = true;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = Math.max(280, cv.clientWidth || 600);
    wide = W >= 620;
    if (wide) {
      const side = Math.max(200, Math.min(250, W * 0.3));
      P.s = Math.min(W - side - 28, 560);
      P.x = 8; P.y = 8;
      H = P.s + 16;
      const cx = P.x + P.s + 16, cw = W - cx - 8;
      WR.x = cx; WR.y = 8; WR.w = cw; WR.h = Math.min(cw + 30, P.s * 0.56);
      GR.x = cx; GR.y = WR.y + WR.h + 10; GR.w = cw; GR.h = P.s - WR.h - 10;
    } else {
      P.s = W - 12; P.x = 6; P.y = 6;
      const hw = (W - 12 - 8) / 2;
      WR.x = 6; WR.y = P.y + P.s + 10; WR.w = hw; WR.h = 196;
      GR.x = 6 + hw + 8; GR.y = WR.y; GR.w = hw; GR.h = 196;
      H = WR.y + WR.h + 6;
    }
    P.k = P.s / (2 * L);
    cv.style.height = H + 'px';
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cw2 = Math.max(260, cv2.clientWidth || W); ch2 = 150;
    cv2.width = Math.round(cw2 * dpr); cv2.height = Math.round(ch2 * dpr);
    heatKey = '';
    draw(); drawChart();
  }
  const X = function (x) { return P.x + P.s / 2 + x * P.k; };
  const Y = function (y) { return P.y + P.s / 2 - y * P.k; };
  const dataOf = function (px, py) { return { x: (px - P.x - P.s / 2) / P.k, y: (P.y + P.s / 2 - py) / P.k }; };
  function ptR() { return Math.max(6.5, Math.min(10.5, P.k * 0.055)); }

  // =====================================================================
  // 學習狀態（頁面這一側）
  // =====================================================================
  function trainer() { return S.trainer; }
  function wNow() { return S.trainer.weights(); }
  function wrongNow() { const t = S.trainer; return S.points.map(function (p) { return t.isWrong(p); }); }
  /** 任何操作之後呼叫：換了一個新的感知器（重來、改資料、改設定）就清掉頁面上的軌跡 */
  function sync() {
    if (S.trainer !== state.trainerRef) {
      state.trainerRef = S.trainer;
      state.trail = [S.trainer.weights()];
      state.last = null; state.prevW = null; state.lastFinish = null;
      state.boxDirty = true;
    }
    bridge.rev++;
    updateReadouts();
    updatePresetButtons();
    requestDraw();
  }
  function record(r, animate) {
    state.last = r;
    if (r.wrong) {
      state.trail.push(r.after);
      if (state.trail.length > TRAIL_MAX) state.trail = state.trail.filter(function (w, i, a) { return i === 0 || i === a.length - 1 || i % 2 === 0; });
      if (animate) { state.prevW = r.before; state.prevAt = now(); }
    }
    if (animate) state.lastAt = now();
    state.boxDirty = true;
  }

  // =====================================================================
  // 任務事件（Session 送出來的事件原封不動轉送；'step' 加上 3D 檢視的狀態）
  // =====================================================================
  function onEmit(type, data) {
    if (type === 'step') { data.view3d = !!(view3 && view3.active); data.rotated = state.rotated; }
    if (type === 'train') { state.lastFinish = data; renderLog(); sndFinish(data.converged); }
    if (window.LabMission) window.LabMission.emit(type, data);
  }

  // =====================================================================
  // 音效（預設關；連續學習時節流）
  // =====================================================================
  function sound() { const s = window.LabSound; return s && s.enabled() ? s : null; }
  function sndStep(r, fast) {
    const s = sound(); if (!s) return;
    const t = now();
    if (fast && t - state.sndAt < 70) return;
    state.sndAt = t;
    if (r.wrong) {
      s.tone({ freq: 880, dur: 0.07, type: 'triangle', gain: 0.15 });
      s.sweep({ from: 520, to: r.p.c > 0 ? 780 : 340, dur: 0.12, type: 'sine', gain: 0.08, delay: 0.03 });
    } else s.tone({ freq: r.p.c > 0 ? 660 : 440, dur: 0.05, type: 'sine', gain: 0.08 });
  }
  function sndFinish(ok) {
    const s = sound(); if (!s) return;
    if (ok) [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { s.tone({ freq: f, dur: 0.16, type: 'sine', gain: 0.18, delay: 0.1 + i * 0.09 }); });
    else s.sweep({ from: 400, to: 260, dur: 0.4, type: 'sawtooth', gain: 0.07, delay: 0.08 });
  }
  function sndPoint(add) { const s = sound(); if (s) s.tone({ freq: add ? 990 : 520, dur: 0.035, type: 'triangle', gain: 0.1 }); }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // =====================================================================
  // 文字說明
  // =====================================================================
  let sayTimer = 0;
  function say(msg) { clearTimeout(sayTimer); sayTimer = setTimeout(function () { $('status').textContent = msg || ''; }, 20); }
  function finishMsg() {
    const t = S.trainer, mm = S.mm;
    if (t.converged) {
      return T('收斂了！第 ' + t.errs.length + ' 輪一個點都沒有分錯。總共修正 k = ' + t.updates + ' 次' +
        (t.zeroInit && mm.separable ? '，收斂定理的上界 (R/γ)² = ' + numTxt(mm.bound, mm.bound >= 100 ? 1 : 2) + '。' : '。'),
      'Converged! In round ' + t.errs.length + ' no point was wrong. Corrections in total: k = ' + t.updates +
        (t.zeroInit && mm.separable ? '; the convergence bound (R/γ)² = ' + numTxt(mm.bound, mm.bound >= 100 ? 1 : 2) + '.' : '.'));
    }
    if (t.limit) {
      const cyc = t.cycle ? T('權重每 ' + t.cycle.period + ' 輪就回到同一個值，一直在繞圈。', ' The weights return to the same value every ' + t.cycle.period + ' round' + (t.cycle.period > 1 ? 's' : '') + ': it is going round in circles.') : '';
      if (!mm.separable) return T('學滿 ' + t.errs.length + ' 輪還是有點分錯：這份資料不能用一條直線分開。', 'After ' + t.errs.length + ' rounds some points are still wrong: no straight line can separate this data.') + cyc;
      return T('學滿 ' + t.errs.length + ' 輪還沒收斂（資料其實分得開，只是間隔太小，需要更多輪）。', 'Not converged after ' + t.errs.length + ' rounds (the data can be separated, but the margin is so small that it needs more rounds).');
    }
    return '';
  }
  function stepMsg(r) {
    const p = r.p;
    const head = T('第 ' + r.epoch + ' 輪第 ' + r.posInEpoch + ' 個點 ' + coordTxt(p) + '，類別 ' + clsTxt(p.c) + '：z = ' + numTxt(r.z) + '，',
      'Round ' + r.epoch + ', point ' + r.posInEpoch + ' ' + coordTxt(p) + ', class ' + clsTxt(p.c) + ': z = ' + numTxt(r.z) + ', ');
    if (r.wrong) return head + (Math.abs(r.s) === 0 && S.trainer.zeroInit ? T('剛好在線上（算分錯），修正權重。', 'exactly on the line (counts as wrong), so the weights are corrected.') : T('分錯了，修正權重。', 'wrong, so the weights are corrected.'));
    return head + T('分對了，不修正。', 'correct, no change.');
  }
  function presetMsg(name) {
    return {
      and: T('AND：只有 (1,1) 是 +1。按「單步」看感知器怎麼學。', 'AND: only (1,1) is +1. Press “Step” to watch the perceptron learn.'),
      or: T('OR：只要有一個輸入是 1 就是 +1。', 'OR: +1 whenever at least one input is 1.'),
      nand: T('NAND：AND 的相反，只有 (1,1) 是 −1。', 'NAND: the opposite of AND; only (1,1) is −1.'),
      xor: T('XOR：兩個輸入不一樣時是 +1。它學得會嗎？', 'XOR: +1 when the two inputs differ. Can it be learned?'),
      sep: T('隨機可分（第 ' + S.serial.sep + ' 份）：兩類之間一定有一條走廊。', 'Random separable (set ' + S.serial.sep + '): there is always a corridor between the two classes.'),
      noisy: T('有雜訊（第 ' + S.serial.noisy + ' 份）：有幾個點的類別被標反了，一條直線分不開。', 'Noisy (set ' + S.serial.noisy + '): a few points carry the wrong label, so no straight line separates them.')
    }[name] || '';
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h, cls) {
    const el = $(id);
    if (lastHTML[id] !== h) { lastHTML[id] = h; el.innerHTML = h; }
    if (cls !== undefined && el.className !== cls) el.className = cls;
  }
  function updateReadouts() {
    const t = S.trainer, mm = S.mm, cnt = S.counts(), n = S.points.length, w = t.weights();
    setHTML('rN', n + T('（' + cnt.pos + '／' + cnt.neg + '）', ' (' + cnt.pos + ' / ' + cnt.neg + ')'));
    setHTML('rSep', n ? (mm.separable ? T('可以', 'Yes') : T('不行', 'No')) : '—', n ? (mm.separable ? 'ok' : 'bad') : '');
    setHTML('rGamma', mm.separable ? mm.gamma.toFixed(3) : '—');
    setHTML('rR', n ? mm.R.toFixed(3) : '—');
    setHTML('rBound', boundHtml(mm));
    setHTML('rW', '(' + num(w[0]) + ', ' + num(w[1]) + ')');
    setHTML('rB', S.cfg.bias ? num(w[2]) : T('不使用（0）', 'not used (0)'));
    setHTML('rEpoch', n ? String(t.done() ? t.errs.length : t.epoch) : '—');
    setHTML('rErr', n && !t.done() ? String(t.errThis) : '—');
    setHTML('rK', String(t.updates));
    const wr = wrongNow().filter(Boolean).length;
    setHTML('rWrong', n ? wr + ' / ' + n : '—', n ? (wr ? 'bad' : 'ok') : '');
    // 分界線方程式
    let eq;
    if (Math.abs(w[0]) < 1e-12 && Math.abs(w[1]) < 1e-12) {
      eq = Math.abs(w[2]) < 1e-12
        ? T('權重都是 0：還沒有分界線', 'All weights are 0: no dividing line yet')
        : T('<i>w</i><sub>1</sub> = <i>w</i><sub>2</sub> = 0：沒有分界線，整個平面都是 ' + (w[2] > 0 ? '+1' : '−1') + ' 區',
          '<i>w</i><sub>1</sub> = <i>w</i><sub>2</sub> = 0: no dividing line; the whole plane is the ' + (w[2] > 0 ? '+1' : '−1') + ' side');
    } else {
      const term = function (c, v, first) { const s = numTex(c); if (s === '0') return ''; const neg = s[0] === '-'; const body = (neg ? s.slice(1) : s) + (v ? '\\,' + v : ''); return first ? (neg ? '-' : '') + body : (neg ? ' - ' : ' + ') + body; };
      let s = term(w[0], 'x_1', true);
      s += term(w[1], 'x_2', !s);
      if (S.cfg.bias) s += term(w[2], '', !s);
      eq = T('分界線：', 'Dividing line: ') + tex(s + ' = 0');
    }
    setHTML('lineEq', eq);
    updateStepBox(false);
    $('playBtn').textContent = state.playing ? T('暫停', 'Pause') : T('連續學習', 'Keep learning');
    $('playBtn').setAttribute('aria-pressed', String(state.playing));
  }
  function updateStepBox(force) {
    if (!state.boxDirty && !force) return;
    if (state.playing && now() - state.boxAt < 160 && !force) { state.boxPending = true; return; }
    state.boxAt = now(); state.boxDirty = false; state.boxPending = false;
    const r = state.last, t = S.trainer;
    let h;
    if (!S.points.length) h = '<span class="muted">' + T('沒有資料點：在左邊的平面上點一下放點。', 'No points: tap the plane to place some.') + '</span>';
    else if (!r) h = '<span class="muted">' + T('按「單步」：感知器看下一個點，算出 z，分錯就修正權重。', 'Press “Step”: the perceptron looks at the next point, computes z and corrects the weights if it is wrong.') + '</span>';
    else {
      const p = r.p, yz = p.c * r.z;
      h = tex('\\mathbf{x} = (' + numTex(p.x) + ',\\ ' + numTex(p.y) + '),\\ y = ' + (p.c > 0 ? '+1' : '-1')) + '<br>' +
        tex('z = w_1x_1 + w_2x_2' + (S.cfg.bias ? ' + b' : '') + ' = ' + numTex(r.z) + ',\\quad y\\,z = ' + numTex(yz) + (r.wrong ? ' \\le 0' : ' > 0')) + ' ' +
        (r.wrong ? '<span class="tag bad">' + T('分錯，修正', 'wrong: correct it') + '</span>' : '<span class="tag ok">' + T('分對，不改', 'correct: no change') + '</span>');
      if (r.wrong) {
        const a = r.after;
        h += '<br>' + tex('\\mathbf{w} \\leftarrow \\mathbf{w} + \\eta\\,y\\,\\mathbf{x} = (' + numTex(a[0]) + ',\\ ' + numTex(a[1]) + ')') +
          (S.cfg.bias ? T('，', ', ') + tex('b \\leftarrow b + \\eta\\,y = ' + numTex(a[2])) : '');
      }
      if (t.done()) h += '<br><span class="muted">' + (t.converged ? T('已經收斂。', 'Converged.') : T('已經學滿 1000 輪。', 'Reached 1000 rounds.')) + '</span>';
    }
    setHTML('stepBox', h);
  }

  // =====================================================================
  // 學習紀錄表
  // =====================================================================
  function renderLog() {
    const h = S.history, tb = $('hist');
    $('histEmpty').hidden = h.length > 0;
    if (!h.length) { tb.innerHTML = ''; return; }
    let s = '<thead><tr><th>' + T('資料', 'Data') + '</th><th>n</th><th>η</th><th>' + T('初始', 'Start') + '</th><th>' + T('順序', 'Order') + '</th><th>b</th><th>' +
      T('結果', 'Result') + '</th><th>' + T('輪數', 'Rounds') + '</th><th>' + T('修正 k', 'Corrections k') + '</th><th>' + T('上界', 'Bound') + '</th></tr></thead><tbody>';
    for (let i = h.length - 1; i >= 0; i--) {
      const e = h[i];
      s += '<tr><td>' + SET_NAME(e.set) + '</td><td>' + e.n + '</td><td>' + (+e.eta).toPrecision(3) + '</td><td>' + (e.init === 'zero' ? T('零', 'zero') : T('隨機', 'random') + ' #' + e.seed) +
        '</td><td>' + (e.order === 'fixed' ? T('固定', 'fixed') : T('打亂', 'shuffled') + ' #' + e.seed) + '</td><td>' + (e.bias ? T('有', 'yes') : T('無', 'no')) + '</td>' +
        (e.converged ? '<td class="ok">' + T('收斂', 'converged') + '</td>' : '<td class="bad">' + T('沒收斂', 'not converged') + '</td>') +
        '<td>' + e.epochs + '</td><td>' + e.updates + '</td><td>' + boundHtml({ separable: e.separable, bound: e.bound }) + '</td></tr>';
    }
    tb.innerHTML = s + '</tbody>';
  }

  // =====================================================================
  // 2D 繪圖
  // =====================================================================
  let heatKey = '', heatCv = null;
  /** 加權和 z 的色階（只在權重方向改變時重算）：z > 0 偏 +1 色、z < 0 偏 −1 色，越遠越濃 */
  function heat(w) {
    const nrm = Math.hypot(w[0], w[1], w[2]);
    if (!(nrm > 1e-12)) return null;
    const key = [w[0] / nrm, w[1] / nrm, w[2] / nrm].map(function (v) { return v.toFixed(4); }).join(',') + '|' + D.ver + '|' + C.pos + C.neg;
    if (key === heatKey && heatCv) return heatCv;
    heatKey = key;
    const N = 120;
    if (!heatCv) heatCv = document.createElement('canvas');
    heatCv.width = N; heatCv.height = N;
    const g = heatCv.getContext('2d'), img = g.createImageData(N, N), d = img.data;
    const bg = D.rgb(C.bg), cp = D.rgb(C.pos), cn = D.rgb(C.neg);
    let zmax = 0;
    [[-L, -L], [-L, L], [L, -L], [L, L]].forEach(function (q) { zmax = Math.max(zmax, Math.abs(w[0] * q[0] + w[1] * q[1] + w[2])); });
    zmax = zmax || 1;
    const base = D.dark ? 0.1 : 0.07, span = D.dark ? 0.26 : 0.24;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -L + (i + 0.5) * 2 * L / N, y = L - (j + 0.5) * 2 * L / N;
      const u = (w[0] * x + w[1] * y + w[2]) / zmax;
      const c = u >= 0 ? cp : cn, a = Math.abs(u) < 1e-9 ? 0 : base + span * Math.pow(Math.min(1, Math.abs(u)), 0.85);
      const o = (j * N + i) * 4;
      d[o] = bg[0] + (c[0] - bg[0]) * a; d[o + 1] = bg[1] + (c[1] - bg[1]) * a; d[o + 2] = bg[2] + (c[2] - bg[2]) * a; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return heatCv;
  }
  function lineThrough(c, coef, color, width, dash, a) {
    const seg = PC.clipLine(coef, L);
    if (!seg) return null;
    c.save();
    c.globalAlpha = a == null ? 1 : a;
    c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round';
    if (dash) c.setLineDash(dash);
    c.beginPath(); c.moveTo(X(seg[0][0]), Y(seg[0][1])); c.lineTo(X(seg[1][0]), Y(seg[1][1])); c.stroke();
    c.restore();
    return seg;
  }
  /** 平行帶（a·x + b·y + c 介於 lo 與 hi 之間）填色，裁在平面內 */
  function fillBand(c, a, b, cc, lo, hi, color) {
    const n2 = a * a + b * b; if (!(n2 > 1e-18)) return;
    const n = Math.sqrt(n2), dx = -b / n, dy = a / n;
    const p = function (v) { return [-(cc - v) * a / n2, -(cc - v) * b / n2]; };
    const A = p(lo), B = p(hi), F = 5;
    c.beginPath();
    c.moveTo(X(A[0] - F * dx), Y(A[1] - F * dy)); c.lineTo(X(A[0] + F * dx), Y(A[1] + F * dy));
    c.lineTo(X(B[0] + F * dx), Y(B[1] + F * dy)); c.lineTo(X(B[0] - F * dx), Y(B[1] - F * dy));
    c.closePath();
    c.fillStyle = color; c.fill();
  }
  function drawPlus(c, x, y, s, color) { c.save(); c.strokeStyle = color; c.lineWidth = Math.max(1.6, s * 0.32); c.lineCap = 'round'; c.beginPath(); c.moveTo(x - s, y); c.lineTo(x + s, y); c.moveTo(x, y - s); c.lineTo(x, y + s); c.stroke(); c.restore(); }
  function drawMinus(c, x, y, s, color) { c.save(); c.strokeStyle = color; c.lineWidth = Math.max(1.6, s * 0.32); c.lineCap = 'round'; c.beginPath(); c.moveTo(x - s, y); c.lineTo(x + s, y); c.stroke(); c.restore(); }
  function drawPoint(c, p, r, opts) {
    opts = opts || {};
    const x = X(p.x), y = Y(p.y);
    const col = p.c > 0 ? C.pos : C.neg;
    if (opts.hover) { c.save(); c.fillStyle = alpha(col, 0.18); c.beginPath(); c.arc(x, y, r + 7, 0, Math.PI * 2); c.fill(); c.restore(); }
    if (p.c > 0) { D.ball(c, x, y, r, col); drawPlus(c, x, y, r * 0.48, '#ffffff'); }
    else { const s = r * 1.72; D.block(c, x - s / 2, y - s / 2, s, s, col, { r: 3 }); drawMinus(c, x, y, r * 0.5, '#ffffff'); }
  }
  function ring(c, x, y, r, color, width, dash, a) {
    c.save(); c.globalAlpha = a == null ? 1 : a; c.strokeStyle = color; c.lineWidth = width; if (dash) c.setLineDash(dash);
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); c.restore();
  }

  let rafId = 0;
  function requestDraw() { if (!rafId) rafId = requestAnimationFrame(frame); }
  function frame(tm) {
    rafId = 0;
    if (state.playing) playTick(tm);
    draw();
    drawChart();
    if (state.boxPending) updateStepBox(false);
    if (view3 && view3.active) view3.frame();
    const t = now();
    if (state.playing || (!reducedMotion && (t - state.lastAt < 1100 || t - state.prevAt < 1300))) requestDraw();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    D.backdrop(ctx, W, H);
    drawPlane();
    drawWeights(WR);
    drawGauge(GR);
  }

  function drawPlane() {
    const c = ctx, t = S.trainer, w = t.weights(), r = ptR();
    const x0 = P.x, y0 = P.y, s = P.s;
    // 平面底板（浮起的卡片）
    c.save();
    c.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : alpha(C.text, 0.16);
    c.shadowBlur = 12; c.shadowOffsetY = 3;
    D.roundRect(c, x0, y0, s, s, 10);
    c.fillStyle = C.bg; c.fill();
    c.restore();
    c.save();
    D.roundRect(c, x0, y0, s, s, 10);
    c.clip();
    const hm = heat(w);
    if (hm) { c.imageSmoothingEnabled = true; c.drawImage(hm, x0, y0, s, s); }
    D.grid(c, x0, y0, x0 + s, y0 + s, P.k * 0.5, P.k * 0.1, X(0), Y(0));
    // 資料範圍 [−1, 1]² 與座標軸
    c.strokeStyle = alpha(C.text, D.dark ? 0.32 : 0.28); c.lineWidth = 1;
    c.beginPath(); c.moveTo(x0, Y(0) + 0.5); c.lineTo(x0 + s, Y(0) + 0.5); c.moveTo(X(0) + 0.5, y0); c.lineTo(X(0) + 0.5, y0 + s); c.stroke();
    c.save(); c.setLineDash([3, 4]); c.strokeStyle = alpha(C.text, 0.22);
    c.strokeRect(X(-1), Y(1), 2 * P.k, 2 * P.k); c.restore();
    // z 的等高線（和分界線平行）
    if (Math.abs(w[0]) > 1e-12 || Math.abs(w[1]) > 1e-12) {
      let zmax = 0;
      [[-L, -L], [-L, L], [L, -L], [L, L]].forEach(function (q) { zmax = Math.max(zmax, Math.abs(w[0] * q[0] + w[1] * q[1] + w[2])); });
      [-0.75, -0.5, -0.25, 0.25, 0.5, 0.75].forEach(function (f) { lineThrough(c, [w[0], w[1], w[2] - f * zmax], f > 0 ? C.pos : C.neg, 1, [2, 5], 0.35); });
    }
    // 最寬的走廊（最大間隔）
    const mm = S.mm;
    if (state.showBand && mm.separable && mm.u) {
      const u = mm.u, gm = mm.gamma;
      c.save(); fillBand(c, u[0], u[1], u[2], -gm, gm, alpha(C.band, D.dark ? 0.16 : 0.12)); c.restore();
      lineThrough(c, [u[0], u[1], u[2] - gm], C.band, 1.3, [6, 4], 0.85);
      lineThrough(c, [u[0], u[1], u[2] + gm], C.band, 1.3, [6, 4], 0.85);
      lineThrough(c, [u[0], u[1], u[2]], C.band, 1.2, [1.5, 4], 0.9);
    }
    // 上一條線（剛修正前）淡出
    const tt = now();
    if (state.prevW && tt - state.prevAt < 1300) {
      const f = reducedMotion ? 0.5 : 1 - (tt - state.prevAt) / 1300;
      lineThrough(c, state.prevW, C.line, 2, [5, 5], 0.55 * f);
    }
    // 分界線
    const seg = PC.clipLine(w, L);
    if (seg) {
      D.tube(c, function (g) { g.moveTo(X(seg[0][0]), Y(seg[0][1])); g.lineTo(X(seg[1][0]), Y(seg[1][1])); }, C.line, 5);
    }
    c.restore();   // 結束裁切

    // 平面外框與刻度
    c.save();
    D.roundRect(c, x0 + 0.5, y0 + 0.5, s - 1, s - 1, 10);
    c.strokeStyle = alpha(C.border, 0.9); c.lineWidth = 1; c.stroke();
    c.restore();
    [-1, -0.5, 0.5, 1].forEach(function (v) {
      const lab = v === -1 ? '−1' : v === -0.5 ? '−0.5' : String(v);
      D.haloText(c, lab, X(v), Y(0) + 13, C.muted, 'center', 'middle', fnt(10.5));
      D.haloText(c, lab, X(0) - 5, Y(v), C.muted, 'right', 'middle', fnt(10.5));
    });
    // 軸名稱：附近有資料點（例如放在 (1, 0)、(0, 1)）就往外挪，不被點蓋住
    const near = function (lx, ly) { return S.points.some(function (p) { return Math.hypot(X(p.x) - lx, Y(p.y) - ly) < 24; }); };
    D.vecLabel(c, 'x', '1', x0 + s - 14, near(x0 + s - 14, Y(0) - 11) ? Y(0) - 28 : Y(0) - 11, C.text);
    D.vecLabel(c, 'x', '2', near(X(0) + 15, y0 + 13) ? X(0) + 32 : X(0) + 15, y0 + 13, C.text);

    // 兩側標籤與權重方向
    const nw = Math.hypot(w[0], w[1]);
    if (seg && nw > 1e-12) {
      const mx = (seg[0][0] + seg[1][0]) / 2, my = (seg[0][1] + seg[1][1]) / 2;
      // 原點在線上的投影（落在平面內就用它，否則用線段中點）
      const t0 = -(w[2]) / (nw * nw);
      let ax = w[0] * t0, ay = w[1] * t0;
      if (Math.abs(ax) > 0.95 || Math.abs(ay) > 0.95) { ax = mx; ay = my; }
      const ux = w[0] / nw, uy = w[1] / nw;
      const sx = X(ax), sy = Y(ay);
      D.arrow(c, sx, sy, sx + ux * 44, sy - uy * 44, C.w, 3, { label: 'w' });
      // 兩側的「+1 區」「−1 區」：沿著線找幾個候選位置（法線方向各 28 px），選離資料點、w 箭頭最遠的
      const avoid = S.points.map(function (p) { return [X(p.x), Y(p.y)]; }).concat([[sx + ux * 22, sy - uy * 22], [sx + ux * 50, sy - uy * 50]]);
      const side = function (sign, text, col) {
        let best = null, bd = -1;
        [0.14, 0.3, 0.5, 0.7, 0.86].forEach(function (f) {
          const lx = X(seg[0][0] + (seg[1][0] - seg[0][0]) * f), ly = Y(seg[0][1] + (seg[1][1] - seg[0][1]) * f);
          const px = Math.max(x0 + 34, Math.min(x0 + s - 34, lx + sign * ux * 28)), py = Math.max(y0 + 16, Math.min(y0 + s - 12, ly - sign * uy * 28));
          // 夾回平面內之後仍要在正確的一側
          if (sign * (w[0] * dataOf(px, py).x + w[1] * dataOf(px, py).y + w[2]) <= 0) return;
          let dmin = 1e9;
          avoid.forEach(function (a) { dmin = Math.min(dmin, Math.hypot((a[0] - px) * 0.7, a[1] - py)); });
          if (dmin > bd) { bd = dmin; best = [px, py]; }
        });
        if (best) D.pill(c, text, best[0], best[1] + 9, col, 'center', fnt(11.5, 700));
      };
      side(1, T('+1 區', '+1 side'), C.pos);
      side(-1, T('−1 區', '−1 side'), C.neg);
    }
    if (state.showBand && mm.separable && mm.u) {
      const u = mm.u, n2 = u[0] * u[0] + u[1] * u[1];
      if (n2 > 1e-12) {
        let cx = -u[2] * u[0] / n2, cy = -u[2] * u[1] / n2;
        cx = Math.max(-0.75, Math.min(0.75, cx)); cy = Math.max(-0.85, Math.min(0.85, cy));
        D.pill(c, 'γ = ' + mm.gamma.toFixed(3), X(cx) + 30, Y(cy) - 14, C.band, 'left', fnt(11.5, 700));
      }
    }

    // 資料點
    const wrong = wrongNow();
    const pts = S.points, last = state.last, lastIdx = last ? pts.indexOf(last.p) : -1;
    let nextIdx = -1;
    if (!t.done() && pts.length) nextIdx = t.order[t.pos];
    pts.forEach(function (p, i) {
      D.contactShadow(c, X(p.x), Y(p.y) + r * 0.9, r * 0.8, 0.2);
    });
    pts.forEach(function (p, i) { drawPoint(c, p, r, { hover: i === state.hover || (state.drag && state.drag.i === i) }); });
    pts.forEach(function (p, i) {
      const x = X(p.x), y = Y(p.y);
      if (wrong[i]) ring(c, x, y, r + 4.5, C.wrong, 1.8, [3.5, 3]);
      if (state.showBand && mm.separable && mm.support && mm.support.indexOf(i) >= 0) ring(c, x, y, r + 8, C.band, 1.4, null, 0.8);
      if (p.label && !p.moved) D.haloText(c, p.label, x, y + r + 17, C.muted, 'center', 'middle', fnt(11, 600));
    });
    if (nextIdx >= 0 && nextIdx !== lastIdx) {
      const p = pts[nextIdx];
      ring(c, X(p.x), Y(p.y), r + 9, C.cur, 1.5, [2, 3], 0.9);
      if (!state.playing) D.pill(c, T('下一個', 'next'), X(p.x), Y(p.y) - r - 10, C.cur, 'center', fnt(10.5, 700));
    }
    if (lastIdx >= 0) {
      const p = pts[lastIdx], x = X(p.x), y = Y(p.y);
      const age = (tt - state.lastAt) / 900;
      const pulse = reducedMotion ? 0 : Math.max(0, 1 - age);
      ring(c, x, y, r + 7 + pulse * 3, C.cur, 2.6);
      if (last.wrong && !reducedMotion && age < 1) D.ripple(c, x, y, r + 6, age, C.wrong);
    }
    // 鍵盤游標
    if (kb && kb.focused()) {
      const x = X(state.cursor.gx / G), y = Y(state.cursor.gy / G);
      c.save(); c.strokeStyle = C.accent; c.lineWidth = 1.5; c.setLineDash([4, 3]);
      c.beginPath(); c.arc(x, y, r + 6, 0, Math.PI * 2); c.moveTo(x - r - 12, y); c.lineTo(x - r - 3, y); c.moveTo(x + r + 3, y); c.lineTo(x + r + 12, y);
      c.moveTo(x, y - r - 12); c.lineTo(x, y - r - 3); c.moveTo(x, y + r + 3); c.lineTo(x, y + r + 12); c.stroke(); c.restore();
    }
    // 提示
    let msg = '';
    if (!pts.length) msg = T('點一下平面放點（現在放 ' + clsTxt(state.cls) + ' 類）', 'Tap the plane to place a point (class ' + clsTxt(state.cls) + ')');
    else if (Math.abs(w[0]) < 1e-12 && Math.abs(w[1]) < 1e-12) msg = Math.abs(w[2]) < 1e-12 ? T('權重全是 0：還沒有分界線，每個點的 z 都是 0', 'All weights are 0: no line yet, every point has z = 0')
      : T('w 是 0：沒有分界線，整個平面都判成 ' + (w[2] > 0 ? '+1' : '−1'), 'w is 0: no line; the whole plane is classed as ' + (w[2] > 0 ? '+1' : '−1'));
    if (msg) D.pill(c, msg, x0 + s / 2, y0 + s - 6, C.muted, 'center', fnt(wide ? 12 : 11, 600));
  }

  /** 權重空間：w = (w1, w2) 的軌跡、每次修正加上的 ηyx，以及偏差 b 的直條 */
  function panelCard(R, title) {
    const c = ctx;
    c.save();
    c.shadowColor = D.dark ? 'rgba(0,0,0,0.45)' : alpha(C.text, 0.12);
    c.shadowBlur = 10; c.shadowOffsetY = 2;
    D.roundRect(c, R.x, R.y, R.w, R.h, 10);
    c.fillStyle = C.panel; c.fill();
    c.restore();
    D.roundRect(c, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 10);
    c.strokeStyle = alpha(C.border, 0.9); c.lineWidth = 1; c.stroke();
    D.haloText(c, title, R.x + 10, R.y + 18, C.text, 'left', 'alphabetic', fnt(12.5, 700));
  }
  function drawWeights(R) {
    const c = ctx, x0 = R.x, y0 = R.y, pw = R.w, ph = R.h;
    if (pw < 110) return;
    panelCard(R, T('權重空間', 'Weight space'));
    const tr = state.trail, w = wNow();
    let m = Math.max(Math.abs(w[0]), Math.abs(w[1]), Math.abs(w[2]));
    tr.forEach(function (q) { m = Math.max(m, Math.abs(q[0]), Math.abs(q[1]), Math.abs(q[2])); });
    const wm = niceCeil(m * 1.05 || 1);
    // 方形區（左）＋ b 直條（右）
    const barW = wide ? 30 : 22, gap = wide ? 8 : 6;
    const q = Math.max(70, Math.min(pw - barW - gap - 20, ph - 50));
    const qx = x0 + 10 + Math.max(0, (pw - barW - gap - 20 - q) / 2), qy = y0 + 30 + Math.max(0, (ph - 50 - q) / 2);
    const cx = qx + q / 2, cy = qy + q / 2, sc = (q / 2) / wm;
    const WX = function (v) { return cx + v * sc; }, WY = function (v) { return cy - v * sc; };
    c.save();
    D.roundRect(c, qx, qy, q, q, 6);
    c.fillStyle = alpha(C.bg, 0.85); c.fill();
    c.clip();
    D.grid(c, qx, qy, qx + q, qy + q, q / 4, q / 20, cx, cy);
    c.strokeStyle = alpha(C.text, 0.3); c.lineWidth = 1;
    c.beginPath(); c.moveTo(qx, cy + 0.5); c.lineTo(qx + q, cy + 0.5); c.moveTo(cx + 0.5, qy); c.lineTo(cx + 0.5, qy + q); c.stroke();
    // 軌跡（越舊越淡）
    if (tr.length > 1) {
      for (let i = 1; i < tr.length; i++) {
        const a = 0.15 + 0.6 * (i / (tr.length - 1));
        c.strokeStyle = alpha(C.w, a); c.lineWidth = 1.6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(WX(tr[i - 1][0]), WY(tr[i - 1][1])); c.lineTo(WX(tr[i][0]), WY(tr[i][1])); c.stroke();
      }
      const dots = tr.length > 120 ? [] : tr;
      dots.forEach(function (p, i) { c.fillStyle = alpha(C.w, 0.25 + 0.5 * i / tr.length); c.beginPath(); c.arc(WX(p[0]), WY(p[1]), 2, 0, Math.PI * 2); c.fill(); });
    }
    c.restore();
    D.roundRect(c, qx + 0.5, qy + 0.5, q - 1, q - 1, 6);
    c.strokeStyle = alpha(C.border, 0.8); c.stroke();
    // 目前的 w 與上一次修正 Δw = ηyx
    const last = state.last;
    if (last && last.wrong && Math.hypot(last.after[0] - last.before[0], last.after[1] - last.before[1]) * sc > 4) {
      D.arrow(c, WX(last.before[0]), WY(last.before[1]), WX(last.after[0]), WY(last.after[1]), last.p.c > 0 ? C.pos : C.neg, 2.2, { dash: [4, 3] });
    }
    if (Math.hypot(w[0], w[1]) * sc > 3) D.arrow(c, cx, cy, WX(w[0]), WY(w[1]), C.w, 2.8);
    D.ball(c, WX(w[0]), WY(w[1]), 4.5, C.w);
    D.vecLabel(c, 'w', '1', qx + q - 12, cy - 10, C.muted);
    D.vecLabel(c, 'w', '2', cx + 13, qy + 11, C.muted);
    const wt = wm >= 1e5 || wm < 1e-3 ? numTxt(wm) : String(+wm.toPrecision(3));
    D.haloText(c, wt, qx + q - 3, cy + 12, C.muted, 'right', 'middle', fnt(10));
    D.haloText(c, wt, cx - 4, qy + 9, C.muted, 'right', 'middle', fnt(10));
    // b 直條（同一個比例）
    const bx = qx + q + gap + 4, bw = wide ? 14 : 12;
    D.roundRect(c, bx, qy, bw, q, 7);
    c.fillStyle = alpha(C.bg, 0.85); c.fill();
    c.strokeStyle = alpha(C.border, 0.8); c.stroke();
    c.strokeStyle = alpha(C.text, 0.3); c.beginPath(); c.moveTo(bx - 3, cy + 0.5); c.lineTo(bx + bw + 3, cy + 0.5); c.stroke();
    if (S.cfg.bias && Math.abs(w[2]) * sc > 0.5) {
      const top = Math.min(cy, WY(w[2])), hh = Math.abs(w[2]) * sc;
      const g = c.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, shade(C.w, 0.25)); g.addColorStop(0.6, C.w); g.addColorStop(1, shade(C.w, -0.2));
      D.roundRect(c, bx + 2, top, bw - 4, Math.max(2, hh), 4);
      c.fillStyle = g; c.fill();
    }
    D.haloText(c, 'b', bx + bw / 2, qy - 8, S.cfg.bias ? C.text : C.muted, 'center', 'alphabetic', 'italic 600 13px ' + FONT);
    if (!S.cfg.bias) D.haloText(c, T('不用', 'off'), bx + bw / 2, cy + 16, C.muted, 'center', 'middle', fnt(10));
    // 說明
    const cap = last && last.wrong ? T('虛線：剛加上的 ηyx', 'dashed: the ηyx just added') : T('每次修正：w 加上 ηyx', 'each correction adds ηyx');
    D.haloText(c, cap, x0 + pw / 2, y0 + ph - 7, C.muted, 'center', 'alphabetic', fnt(wide ? 11 : 10.5));
  }

  /** 每個點的 y·z（> 0 才算分對）：感知器要把每一根長條都推到 0 的右邊 */
  function drawGauge(R) {
    const c = ctx, x0 = R.x, y0 = R.y, pw = R.w, ph = R.h;
    if (pw < 110 || ph < 90) return;
    panelCard(R, T('每個點的 y·z', 'y·z of each point'));
    D.haloText(c, T('> 0 分對，≤ 0 分錯', '> 0 correct, ≤ 0 wrong'), x0 + 10, y0 + 34, C.muted, 'left', 'alphabetic', fnt(wide ? 11 : 10.5));
    const t = S.trainer, pts = S.points, n = pts.length;
    const top = y0 + 44, bot = y0 + ph - 22, left = x0 + (wide ? 26 : 22), right = x0 + pw - 10;
    if (!n) { D.haloText(c, T('沒有點', 'no points'), x0 + pw / 2, (top + bot) / 2, C.muted, 'center', 'middle', fnt(11.5)); return; }
    const vals = pts.map(function (p) { return p.c * t.zOf(p).z; });
    const wrong = wrongNow();
    let M = 0;
    vals.forEach(function (v) { M = Math.max(M, Math.abs(v)); });
    M = M > 1e-12 ? M : 1;
    const zx = left + (right - left) / 2, half = (right - left) / 2 - 2;
    const rowH = Math.min(16, (bot - top) / n);
    const lastIdx = state.last ? pts.indexOf(state.last.p) : -1;
    c.save();
    c.strokeStyle = alpha(C.text, 0.12); c.lineWidth = 1;
    c.strokeRect(left + 0.5, top - 2 + 0.5, right - left - 1, rowH * n + 4);
    for (let i = 0; i < n; i++) {
      const y = top + i * rowH, v = vals[i], bh = Math.max(1, rowH * 0.66);
      if (i === lastIdx) { D.roundRect(c, left + 1, y, right - left - 2, rowH, 3); c.fillStyle = alpha(C.cur, 0.18); c.fill(); }
      const wpx = Math.abs(v) / M * half;
      if (wpx > 0.3) {
        const x = v >= 0 ? zx : zx - wpx, colr = wrong[i] ? C.wrong : C.ok;
        const g = c.createLinearGradient(0, y + (rowH - bh) / 2, 0, y + (rowH + bh) / 2);
        g.addColorStop(0, shade(colr, 0.25)); g.addColorStop(1, shade(colr, -0.1));
        D.roundRect(c, x, y + (rowH - bh) / 2, wpx, bh, Math.min(3, bh / 2));
        c.fillStyle = g; c.fill();
      } else if (wrong[i]) {
        c.fillStyle = C.wrong; c.beginPath(); c.arc(zx, y + rowH / 2, Math.max(1.5, Math.min(3, rowH * 0.3)), 0, Math.PI * 2); c.fill();
      }
      if (rowH >= 7) {
        const mx = x0 + (wide ? 15 : 12), my = y + rowH / 2, rr = Math.min(4.5, rowH * 0.32);
        if (pts[i].c > 0) D.ball(c, mx, my, rr, C.pos, { shadow: false });
        else { c.fillStyle = C.neg; c.fillRect(mx - rr, my - rr, rr * 2, rr * 2); }
      }
    }
    c.strokeStyle = alpha(C.text, 0.55); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(zx + 0.5, top - 4); c.lineTo(zx + 0.5, top + rowH * n + 4); c.stroke();
    c.restore();
    const ly = Math.min(bot + 14, top + rowH * n + 18);
    D.haloText(c, '0', zx, ly, C.muted, 'center', 'alphabetic', fnt(10));
    D.haloText(c, '−' + numTxt(M, M >= 100 ? 0 : M >= 10 ? 1 : 2), left + 2, ly, C.muted, 'left', 'alphabetic', fnt(10));
    D.haloText(c, '+' + numTxt(M, M >= 100 ? 0 : M >= 10 ? 1 : 2), right - 2, ly, C.muted, 'right', 'alphabetic', fnt(10));
  }

  /** 每輪錯誤數圖 */
  function drawChart() {
    const c = ctx2, w = cw2, h = ch2, t = S.trainer;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    D.backdrop(c, w, h);
    const l = 36, r = 12, top = 26, bot = 22, pw = w - l - r, ph = h - top - bot;
    const errs = t.errs.slice();
    const partial = !t.done() && t.pos > 0 ? t.errThis : null;
    const E = errs.length + (partial != null ? 1 : 0);
    D.haloText(c, T('每輪分錯幾個', 'Mistakes per round'), l, 15, C.text, 'left', 'alphabetic', fnt(12, 700));
    const mm = S.mm;
    const right = T('修正 k = ' + t.updates, 'corrections k = ' + t.updates) + '  ／  ' +
      (mm.separable ? T('上界 ', 'bound ') + numTxt(mm.bound, mm.bound >= 100 ? 0 : 2) : T('不可分：沒有上界', 'not separable: no bound'));
    D.haloText(c, right, w - r, 15, C.muted, 'right', 'alphabetic', fnt(11.5, 600));
    let ymax = Math.max(1, partial || 0);
    errs.forEach(function (v) { ymax = Math.max(ymax, v); });
    const YY = function (v) { return top + ph - v / ymax * ph; };
    c.strokeStyle = alpha(C.text, 0.25); c.lineWidth = 1;
    c.beginPath(); c.moveTo(l, top + ph + 0.5); c.lineTo(l + pw, top + ph + 0.5); c.stroke();
    c.strokeStyle = alpha(C.text, 0.08); c.beginPath(); c.moveTo(l, YY(ymax) + 0.5); c.lineTo(l + pw, YY(ymax) + 0.5); c.stroke();
    D.haloText(c, String(ymax), l - 6, YY(ymax), C.muted, 'right', 'middle', fnt(10.5));
    D.haloText(c, '0', l - 6, YY(0), C.muted, 'right', 'middle', fnt(10.5));
    if (!E) {
      D.haloText(c, T('還沒開始學', 'Not started yet'), l + pw / 2, top + ph / 2, C.muted, 'center', 'middle', fnt(12));
      return;
    }
    const slots = Math.max(E, 12);
    const bwid = pw / slots;
    const errCol = C.cur;
    if (E <= 60) {
      for (let i = 0; i < E; i++) {
        const v = i < errs.length ? errs[i] : partial, x = l + i * bwid + bwid * 0.15, bw = bwid * 0.7;
        if (v > 0) {
          const y = YY(v), g = c.createLinearGradient(0, y, 0, top + ph);
          g.addColorStop(0, shade(errCol, 0.2)); g.addColorStop(1, shade(errCol, -0.15));
          c.globalAlpha = i < errs.length ? 1 : 0.45;
          D.roundRect(c, x, y, bw, top + ph - y, Math.min(3, bw / 3));
          c.fillStyle = g; c.fill();
          c.globalAlpha = 1;
        } else if (i < errs.length) {
          D.ball(c, x + bw / 2, top + ph - 5, Math.min(5, bwid * 0.35), C.ok, { shadow: false });
        }
      }
    } else {
      c.beginPath();
      c.moveTo(l, top + ph);
      for (let i = 0; i < E; i++) { const v = i < errs.length ? errs[i] : partial; c.lineTo(l + (i + 0.5) * pw / E, YY(v)); }
      c.lineTo(l + pw, top + ph); c.closePath();
      c.fillStyle = alpha(errCol, 0.35); c.fill();
      c.beginPath();
      for (let i = 0; i < E; i++) { const v = i < errs.length ? errs[i] : partial; const x = l + (i + 0.5) * pw / E; if (i) c.lineTo(x, YY(v)); else c.moveTo(x, YY(v)); }
      c.strokeStyle = errCol; c.lineWidth = 1.4; c.stroke();
      if (t.converged) D.ball(c, l + pw - 5, top + ph - 5, 5, C.ok, { shadow: false });
    }
    // 橫軸：第 1 輪與最後一輪
    const unit = function (k) { return T(k + ' 輪', k === 1 ? 'round 1' : 'round ' + k); };
    if (E > 1) D.haloText(c, '1', l + (E <= 60 ? bwid / 2 : pw / E / 2), h - 8, C.muted, 'center', 'alphabetic', fnt(10.5));
    D.haloText(c, unit(E), E <= 60 ? Math.min(l + (E - 0.5) * bwid, l + pw - 26) : l + pw, h - 8, C.muted, E <= 60 ? 'center' : 'right', 'alphabetic', fnt(10.5));
    if (t.converged) D.pill(c, T('收斂', 'converged'), Math.min(l + pw - 30, E <= 60 ? l + (errs.length - 0.5) * bwid : l + pw - 30), top + ph - 12, C.ok, 'center', fnt(11, 700));
  }

  // =====================================================================
  // 學習操作
  // =====================================================================
  function needPoints() { if (!S.points.length) { say(T('還沒有資料點：先在平面上放點，或選一份預設資料。', 'There are no points yet: place some on the plane or pick a preset.')); return true; } return false; }
  function alreadyDone() {
    const t = S.trainer;
    if (!t.done()) return false;
    say((t.converged ? T('已經收斂了。', 'Already converged.') : T('已經學滿 1000 輪。', 'Already reached 1000 rounds.')) + T('按「重來」可以從頭再學一次。', ' Press “Restart” to learn again from the start.'));
    return true;
  }
  function doStep() {
    if (needPoints() || alreadyDone()) return;
    const r = S.step(true);
    if (!r) return;
    record(r, true);
    sndStep(r, false);
    say(S.trainer.done() ? stepMsg(r) + ' ' + finishMsg() : stepMsg(r));
    sync();
  }
  function doEpoch() {
    if (needPoints() || alreadyDone()) return;
    stopPlay();
    let r, last = null;
    while ((r = S.step(false))) { record(r, false); last = r; if (r.epochEnd) break; }
    if (!last) return;
    state.lastAt = now();
    if (S.trainer.done()) say(finishMsg());
    else say(T('第 ' + last.epoch + ' 輪結束：分錯 ' + last.errors + ' 個點（修正 ' + last.errors + ' 次）。', 'Round ' + last.epoch + ' finished: ' + last.errors + ' point' + (last.errors === 1 ? ' was' : 's were') + ' wrong (and corrected).'));
    if (!S.trainer.done()) { const s = sound(); if (s) s.tone({ freq: last.errors ? 500 : 780, dur: 0.08, type: 'triangle', gain: 0.12 }); }
    sync();
  }
  function doLearn() {
    if (needPoints() || alreadyDone()) return;
    stopPlay();
    let r, guard = 0;
    const lim = S.cfg.maxEpochs * Math.max(1, S.points.length) + 10;
    while (guard++ < lim && (r = S.step(false))) record(r, false);
    state.lastAt = now();
    say(finishMsg());
    sync();
  }
  function playTick(tm) {
    if (!state.lastT) state.lastT = tm;
    const dt = Math.min(0.25, Math.max(0, (tm - state.lastT) / 1000));
    state.lastT = tm;
    state.acc += dt * state.rate;
    let n = Math.floor(state.acc);
    state.acc -= n;
    n = Math.min(n, 60);
    let r = null, any = false;
    for (let i = 0; i < n; i++) {
      r = S.step(false);
      if (!r) break;
      any = true;
      record(r, true);
      sndStep(r, true);
      if (S.trainer.done()) break;
    }
    if (any) {
      if (S.trainer.done()) { say(finishMsg()); stopPlay(); }
      else if (r) say(stepMsg(r));
      sync();
    } else if (S.trainer.done()) stopPlay();
  }
  function startPlay() {
    if (needPoints() || alreadyDone()) return;
    state.playing = true; state.lastT = 0; state.acc = 1;
    updateReadouts();
    requestDraw();
  }
  function stopPlay() {
    if (!state.playing) return;
    state.playing = false;
    updateStepBox(true);
    updateReadouts();
  }
  $('stepBtn').addEventListener('click', function () { stopPlay(); doStep(); });
  $('epochBtn').addEventListener('click', doEpoch);
  $('learnBtn').addEventListener('click', doLearn);
  $('playBtn').addEventListener('click', function () { if (state.playing) stopPlay(); else startPlay(); });
  $('restartBtn').addEventListener('click', function () {
    stopPlay();
    S.resetTraining();
    say(T('權重回到起點，可以重新學。', 'The weights are back at the start; learn again.'));
    sync();
  });
  $('wipeBtn').addEventListener('click', function () {
    stopPlay();
    S.history.length = 0;
    S.resetTraining();
    renderLog();
    say(T('已清除學習紀錄、權重軌跡與每輪錯誤數；資料與設定保留。', 'The learning log, the weight trail and the mistakes chart were cleared; data and settings are kept.'));
    sync();
  });

  // =====================================================================
  // 資料
  // =====================================================================
  function updatePresetButtons() {
    document.querySelectorAll('.presets [data-set]').forEach(function (b) { b.setAttribute('aria-pressed', String(S.set === b.getAttribute('data-set'))); });
  }
  document.querySelectorAll('.presets [data-set]').forEach(function (b) {
    b.addEventListener('click', function () {
      const name = b.getAttribute('data-set');
      S.loadPreset(name);
      say(presetMsg(name));
      sync();
    });
  });
  function setCls(c) {
    state.cls = c;
    $('clsPos').setAttribute('aria-pressed', String(c > 0));
    $('clsNeg').setAttribute('aria-pressed', String(c < 0));
    requestDraw();
  }
  $('clsPos').addEventListener('click', function () { setCls(1); });
  $('clsNeg').addEventListener('click', function () { setCls(-1); });
  $('clearPts').addEventListener('click', function () {
    S.clear();
    say(T('資料清空了。點一下平面放點；用「放 +1 類」「放 −1 類」切換類別。', 'All points removed. Tap the plane to place points; switch the class with “Place +1” and “Place −1”.'));
    sync();
  });
  function addAt(gx, gy, c) {
    if (S.points.length >= PC.MAX_POINTS) { say(T('最多 ' + PC.MAX_POINTS + ' 個點。', 'At most ' + PC.MAX_POINTS + ' points.')); return false; }
    if (!S.addPoint(gx, gy, c)) return false;
    sndPoint(true);
    const p = S.points[S.points.length - 1];
    say(T('放了一個 ' + clsTxt(c) + ' 類的點 ' + coordTxt(p) + '，共 ' + S.points.length + ' 個點。', 'Placed a class ' + clsTxt(c) + ' point at ' + coordTxt(p) + '; ' + S.points.length + ' points in all.'));
    sync();
    return true;
  }
  function removeIdx(i) {
    const p = S.points[i];
    if (!p || !S.removeAt(i)) return false;
    sndPoint(false);
    say(T('移除了 ' + coordTxt(p) + ' 的點，剩下 ' + S.points.length + ' 個。', 'Removed the point at ' + coordTxt(p) + '; ' + S.points.length + ' left.'));
    state.hover = -1;
    sync();
    return true;
  }

  // ---------- 畫布：放點、移除、拖曳 ----------
  function evPos(e) { const b = cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; }
  function hitPoint(px, py) {
    const r = ptR() + 7;
    let best = -1, bd = r;
    S.points.forEach(function (p, i) { const d = Math.hypot(X(p.x) - px, Y(p.y) - py); if (d <= bd) { bd = d; best = i; } });
    return best;
  }
  function inPlane(px, py) { const d = dataOf(px, py); return Math.abs(d.x) <= 1.03 && Math.abs(d.y) <= 1.03; }
  function snap(px, py) { const d = dataOf(px, py); return { gx: PC.toGrid(d.x), gy: PC.toGrid(d.y) }; }
  cv.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    const b = cv.getBoundingClientRect(), t = e.touches[0];
    if (hitPoint(t.clientX - b.left, t.clientY - b.top) >= 0) e.preventDefault();   // 按在點上：拖曳點，不捲動頁面
  }, { passive: false });
  cv.addEventListener('pointerdown', function (e) {
    if (e.button != null && e.button !== 0) return;
    const q = evPos(e);
    const i = hitPoint(q.x, q.y);
    state.down = { x: q.x, y: q.y, i: i, moved: false, id: e.pointerId };
    if (i >= 0) {
      state.drag = { i: i, id: S.points[i].id };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      cv.style.cursor = 'grabbing';
      requestDraw();
    }
  });
  cv.addEventListener('pointermove', function (e) {
    const q = evPos(e);
    const dn = state.down;
    if (dn && Math.hypot(q.x - dn.x, q.y - dn.y) > 6) dn.moved = true;
    if (state.drag && dn && dn.moved) {
      const i = S.points.findIndex(function (p) { return p.id === state.drag.id; });
      if (i < 0) { state.drag = null; return; }
      const g = snap(q.x, q.y);
      const p = S.points[i];
      if (g.gx !== p.gx || g.gy !== p.gy) {
        if (S.movePoint(i, g.gx, g.gy)) { stopPlay(); sync(); }
      }
      return;
    }
    if (!dn) {
      const h = hitPoint(q.x, q.y);
      if (h !== state.hover) { state.hover = h; requestDraw(); }
      cv.style.cursor = h >= 0 ? 'pointer' : (inPlane(q.x, q.y) ? 'crosshair' : 'default');
    }
  });
  function endPointer(e, cancel) {
    const dn = state.down;
    state.down = null;
    const drag = state.drag;
    state.drag = null;
    cv.style.cursor = '';
    if (!dn || cancel) { requestDraw(); return; }
    const q = evPos(e);
    if (drag) {
      if (!dn.moved) {
        const i = S.points.findIndex(function (p) { return p.id === drag.id; });
        if (i >= 0) { stopPlay(); removeIdx(i); }
      } else {
        const p = S.points.find(function (pp) { return pp.id === drag.id; });
        if (p) say(T('把點移到 ' + coordTxt(p) + '。', 'Moved the point to ' + coordTxt(p) + '.'));
      }
      requestDraw();
      return;
    }
    if (!dn.moved && Math.hypot(q.x - dn.x, q.y - dn.y) < 8 && inPlane(q.x, q.y)) {
      const g = snap(q.x, q.y);
      stopPlay();
      if (S.indexAt(g.gx, g.gy) < 0) addAt(g.gx, g.gy, state.cls);
    }
    requestDraw();
  }
  cv.addEventListener('pointerup', function (e) { endPointer(e, false); });
  cv.addEventListener('pointercancel', function (e) { endPointer(e, true); });
  cv.addEventListener('pointerleave', function () { if (!state.down && state.hover !== -1) { state.hover = -1; requestDraw(); } });

  // ---------- 鍵盤：游標、放點、移除 ----------
  function cursorDesc() {
    const i = S.indexAt(state.cursor.gx, state.cursor.gy);
    const pos = '(' + numTxt(state.cursor.gx / G, 2) + ', ' + numTxt(state.cursor.gy / G, 2) + ')';
    return i >= 0 ? T('游標在 ' + pos + '，這裡有一個 ' + clsTxt(S.points[i].c) + ' 類的點。', 'Cursor at ' + pos + ': a class ' + clsTxt(S.points[i].c) + ' point is here.')
      : T('游標在 ' + pos + '，這裡沒有點。', 'Cursor at ' + pos + ': no point here.');
  }
  cv.addEventListener('keydown', function (e) {
    const k = e.key;
    const cur = state.cursor;
    let handled = true;
    if (k === 'Enter' || k === ' ') {
      const i = S.indexAt(cur.gx, cur.gy);
      if (i >= 0) removeIdx(i); else addAt(cur.gx, cur.gy, state.cls);
    } else if (k === '+' || k === '=') { if (S.indexAt(cur.gx, cur.gy) < 0) addAt(cur.gx, cur.gy, 1); }
    else if (k === '-' || k === '_') { if (S.indexAt(cur.gx, cur.gy) < 0) addAt(cur.gx, cur.gy, -1); }
    else if (k === 'Delete' || k === 'Backspace') { const i = S.indexAt(cur.gx, cur.gy); if (i >= 0) removeIdx(i); }
    else handled = false;
    if (handled) { e.preventDefault(); e.stopImmediatePropagation(); stopPlay(); requestDraw(); }
  });
  const kb = window.LabKeys ? window.LabKeys.attach(cv, {
    label: T('特徵平面畫布：兩類資料點、目前的分界線與權重方向；旁邊是權重空間。點空白處放一個點，點一下已有的點把它移除，拖曳可以移動點。鍵盤：方向鍵移動游標，Enter 在游標處放點或移除，加號放 +1 類、減號放 −1 類。',
      'Feature-plane canvas: the two classes of points, the current dividing line and the direction of the weights, with the weight space beside it. Tap an empty spot to place a point, tap a point to remove it, drag to move it. Keyboard: arrow keys move a cursor, Enter places or removes a point there, plus places class +1 and minus places class −1.'),
    items: [{
      name: function () { return T('游標', 'Cursor'); },
      move: function (dx, dy, big) {
        const st = big ? 5 : 1;
        state.cursor.gx = Math.max(-G, Math.min(G, state.cursor.gx + dx * st));
        state.cursor.gy = Math.max(-G, Math.min(G, state.cursor.gy + dy * st));
        return true;
      },
      describe: cursorDesc
    }],
    onChange: function () { requestDraw(); }
  }) : null;

  // =====================================================================
  // 設定
  // =====================================================================
  const elEta = $('eta'), elSeed = $('seed'), elRate = $('rate');
  const etaOf = function (pos) { return +Math.pow(10, -2 + pos / 100).toPrecision(3); };
  if (window.LabNum) window.LabNum.register(elEta, { toValue: etaOf, toPos: function (v) { return 100 * (Math.log10(v) + 2); }, min: 0.01, max: 10, decimals: 3 });
  function readEta() { const v = val(elEta); return +Math.max(0.01, Math.min(10, v)).toPrecision(3); }
  function readSeed() { return Math.max(1, Math.min(999, Math.round(val(elSeed)))); }
  function refreshOutputs() {
    $('etao').textContent = readEta().toPrecision(3);
    $('seedo').textContent = String(readSeed());
    $('rateo').textContent = String(Math.round(val(elRate)));
  }
  function setCfg(k, v, msg) {
    if (S.setCfg(k, v)) { if (msg) say(msg); sync(); }
  }
  elEta.addEventListener('input', function () {
    refreshOutputs();
    setCfg('eta', readEta(), T('學習率 η = ' + readEta().toPrecision(3) + '，從頭學起。', 'Learning rate η = ' + readEta().toPrecision(3) + '; learning starts again.'));
  });
  elSeed.addEventListener('input', function () {
    refreshOutputs();
    setCfg('seed', readSeed(), T('亂數種子 ' + readSeed() + '，從頭學起。', 'Random seed ' + readSeed() + '; learning starts again.'));
  });
  elRate.addEventListener('input', function () { refreshOutputs(); state.rate = Math.max(1, Math.round(val(elRate))); });
  function seg2(a, b, key, va, vb, ma, mb) {
    const set = function (v) {
      $(a).setAttribute('aria-pressed', String(v === va));
      $(b).setAttribute('aria-pressed', String(v === vb));
      setCfg(key, v, v === va ? ma() : mb());
    };
    $(a).addEventListener('click', function () { set(va); });
    $(b).addEventListener('click', function () { set(vb); });
  }
  seg2('initZero', 'initRand', 'init', 'zero', 'random',
    function () { return T('初始權重全部是 0，從頭學起。', 'Starting weights are all 0; learning starts again.'); },
    function () { return T('初始權重用亂數（由種子決定），從頭學起。', 'Starting weights are random (set by the seed); learning starts again.'); });
  seg2('orderFixed', 'orderShuffle', 'order', 'fixed', 'shuffle',
    function () { return T('每一輪都照放點的先後順序看。', 'Every round looks at the points in the order they were placed.'); },
    function () { return T('每一輪都把順序打亂（由種子決定）。', 'Every round shuffles the order (set by the seed).'); });
  $('useBias').addEventListener('change', function () {
    const on = $('useBias').checked;
    setCfg('bias', on, on ? T('使用偏差 b：分界線可以放在任何地方。', 'Using the bias b: the line can be anywhere.')
      : T('不用偏差：b 固定是 0，分界線一定要經過原點。', 'No bias: b stays 0, so the line must pass through the origin.'));
  });
  $('showBand').addEventListener('change', function () {
    state.showBand = $('showBand').checked;
    if (state.showBand) say(S.mm.separable ? T('青色走廊：能把兩類分開的最寬走廊，寬度一半就是 γ（用增廣向量算）。圈起來的點剛好碰到走廊邊緣。', 'Cyan corridor: the widest corridor that separates the two classes; half its width is γ (computed with augmented vectors). Circled points touch its edges.')
      : T('這份資料不能用一條直線分開，所以沒有走廊。', 'This data cannot be separated by a line, so there is no corridor.'));
    bridge.rev++;
    requestDraw();
  });

  // =====================================================================
  // 3D 檢視：切換到 3D 時才載入 js/perceptron-3d.js 與 three.js
  // =====================================================================
  let threeLib = null, loadToken = 0;
  const host3 = $('view3'), viewMsg = $('viewMsg');
  Object.assign(bridge, {
    T: T, D: D, PC: PC, reducedMotion: reducedMotion,
    colors: function () { return C; },
    points: function () { return S.points; },
    weights: function () { return wNow(); },
    wrong: function () { return wrongNow(); },
    bias: function () { return S.cfg.bias; },
    current: function () { return state.last ? S.points.indexOf(state.last.p) : -1; },
    lastWrong: function () { return !!(state.last && state.last.wrong); },
    band: function () { return state.showBand && S.mm.separable ? { u: S.mm.u, gamma: S.mm.gamma } : null; },
    num: numTxt,
    onRotate: function () { if (!state.rotated) { state.rotated = true; } },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    }
  });
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Perceptron3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Perceptron3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/perceptron-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Perceptron3D) throw new Error('perceptron-3d.js did not load');
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable()) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        view3 = window.Perceptron3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        say(T('3D：斜面的高度就是加權和 z，斜面切過地面的地方就是分界線。拖曳可以轉動視角。', '3D: the height of the sheet is the weighted sum z, and the line where it cuts the ground is the dividing line. Drag to turn the view.'));
        requestDraw();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      if (view3) { view3.dispose(); view3 = null; }
      stage.classList.remove('is3d');
      $('resetCam').hidden = true;
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resize();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ---------- 測試用介面（Playwright 腳本使用；不影響一般操作） ----------
  window.PerceptronLab = {
    session: S, state: state,
    add: function (x, y, c) { return addAt(PC.toGrid(x), PC.toGrid(y), c); },
    removeAt: function (x, y) { return removeIdx(S.indexAt(PC.toGrid(x), PC.toGrid(y))); },
    setView: setView,
    view3: function () { return view3; }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    state.boxDirty = true;
    updateReadouts();
    renderLog();
    updateSoundButton();
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  readColors();
  S.setCfg('eta', readEta());
  S.setCfg('seed', readSeed());
  S.setCfg('bias', $('useBias').checked);
  state.rate = Math.max(1, Math.round(val(elRate)));
  state.showBand = $('showBand').checked;
  refreshOutputs();
  sync();
  renderLog();
  updateSoundButton();
  say(presetMsg('and'));
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW || cv2.clientWidth !== cw2) { lastW = cv.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopPlay(); });
  resize();
})();
