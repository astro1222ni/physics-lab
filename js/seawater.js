/* seawater.js — 「海水的溫度、鹽度與密度：T–S 圖與水團」的畫面與互動
 * 物理計算全部在 seawater-core.js；3D 密度曲面在 seawater-3d.js，切換到 3D 時才載入。 */
(function () {
  'use strict';
  const K = window.SeawaterCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const FONT = D.FONT;
  const T_LO = -2.5, T_HI = 32, MAX_PINS = 8;
  const RANGES = { ocean: [30, 40], full: [0, 42] };
  const PROF_KEYS = ['wpac', 'natl', 'npac', 'wedd'];

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = { tA: $('tA'), sA: $('sA'), tB: $('tB'), sB: $('sB'), mf: $('mf'), sel: $('massSel') };
  const state = {
    A: { T: 2, S: 34.5 }, B: { T: 20, S: 35.5 }, f: 0.5, range: 'ocean', prof: 'wpac', pick: '', pins: [],
    dragging: '', acted: false
  };
  let internal = false;
  function setRange(r, v) { internal = true; if (window.LabNum) window.LabNum.set(r, v); else r.value = String(v); internal = false; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function readSliders() {
    state.A.T = val(el.tA); state.A.S = val(el.sA);
    state.B.T = val(el.tB); state.B.S = val(el.sB);
    state.f = val(el.mf);
  }
  // 剖面的 σθ 表（每 1 m），和 SeawaterCore.settle 用同一個演算法，只是先算好
  const profTab = {};
  function tabOf(key) {
    if (!profTab[key]) { const a = new Float64Array(K.Z_MAX + 1); for (let z = 0; z <= K.Z_MAX; z++) a[z] = K.profileSigma(key, z); profTab[key] = a; }
    return profTab[key];
  }
  function settle(Tc, Sc) {
    const s = K.sigma(Sc, Tc, 0), a = tabOf(state.prof);
    if (s <= a[0]) return { z: 0, where: 'surface', sigma: s };
    for (let z = 1; z <= K.Z_MAX; z++) if (a[z] >= s) { const f = (s - a[z - 1]) / ((a[z] - a[z - 1]) || 1e-12); return { z: z - 1 + f, where: 'mid', sigma: s }; }
    return { z: K.Z_MAX, where: 'bottom', sigma: s };
  }
  let cur = null;
  function compute() {
    const A = state.A, B = state.B, M = K.mix(A, B, state.f);
    const c = {
      A: A, B: B, M: M,
      sA: K.sigma(A.S, A.T, 0), sB: K.sigma(B.S, B.T, 0), sM: K.sigma(M.S, M.T, 0),
      fA: K.freezing(A.S), fB: K.freezing(B.S), fM: K.freezing(M.S),
      zA: settle(A.T, A.S), zB: settle(B.T, B.S), zM: settle(M.T, M.S),
      tmdA: K.tMaxDensity(A.S), alA: K.alpha(A.S, A.T, 0), beA: K.beta(A.S, A.T, 0)
    };
    c.lin = (1 - state.f) * c.sA + state.f * c.sB;
    c.excess = c.sM - c.lin;
    c.over = c.sM - Math.max(c.sA, c.sB);
    cur = c;
    return c;
  }
  function massById(id) { for (let i = 0; i < K.MASSES.length; i++) if (K.MASSES[i].id === id) return K.MASSES[i]; return null; }

  // =====================================================================
  // 格式
  // =====================================================================
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function zShort(z) { return z.where === 'surface' ? T('海面', 'surface') : z.where === 'bottom' ? T('海底', 'floor') : num(z.z, 0) + ' m'; }
  function zText(z) { return z.where === 'surface' ? T('浮在海面', 'surface') : z.where === 'bottom' ? T('沉到海底', 'sea floor') : num(z.z, 0) + ' m'; }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function outNum(v, d) { return Number(v.toFixed(d)).toString().replace('-', '−'); }

  // =====================================================================
  // 顏色
  // =====================================================================
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--surface',
      '--sw-a', '--sw-b', '--sw-m', '--sw-ice', '--sw-iso', '--sw-tmd', '--sw-sea1', '--sw-sea2', '--sw-prof', '--sw-mass']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }

  // =====================================================================
  // 主畫布：T–S 圖
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const gr = $('gr'), gtx = gr.getContext('2d');
  let cvSize = null, grSize = null;
  function fit(c, g) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300, h = c.clientHeight || 300;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h, dpr: dpr };
  }
  function resizeCv() { cvSize = fit(cv, ctx); grSize = fit(gr, gtx); bgKey = ''; requestDraw(); }
  function lay() {
    const W = cvSize.w, H = cvSize.h, narrow = W < 520, R = RANGES[state.range];
    const xl = narrow ? 42 : 52, xr = W - (narrow ? 12 : 18), yt = 30, yb = H - (narrow ? 42 : 44);
    return { W: W, H: H, narrow: narrow, xl: xl, xr: xr, yt: yt, yb: yb, S0: R[0], S1: R[1],
      px: function (S) { return xl + (S - R[0]) / (R[1] - R[0]) * (xr - xl); },
      py: function (t) { return yb - (t - T_LO) / (T_HI - T_LO) * (yb - yt); },
      sOf: function (x) { return R[0] + (x - xl) / (xr - xl) * (R[1] - R[0]); },
      tOf: function (y) { return T_LO + (yb - y) / (yb - yt) * (T_HI - T_LO); } };
  }
  /** 等密度線：給 σ 與溫度，解出鹽度（σ 隨 S 單調增加；牛頓法） */
  function sOnIso(sig, t, s0) {
    let s = s0 != null ? s0 : 35;
    for (let i = 0; i < 30; i++) {
      const f = K.sigma(Math.max(0, s), t, 0) - sig;
      const d = (K.sigma(Math.max(0, s) + 0.01, t, 0) - K.sigma(Math.max(0, s), t, 0)) / 0.01;
      const ns = s - f / d;
      if (Math.abs(ns - s) < 1e-7) { s = ns; break; }
      s = ns;
    }
    return s;
  }
  function isoPath(L, sig) {
    const pts = [];
    let s = null;
    for (let t = T_LO; t <= T_HI + 1e-9; t += 0.25) {
      s = sOnIso(sig, t, s);
      if (!isFinite(s) || s < -1 || s > 46) { pts.push(null); s = null; continue; }
      pts.push([L.px(s), L.py(t), s, t]);
    }
    return pts;
  }
  function strokePts(g, pts) {
    g.beginPath(); let pen = false;
    pts.forEach(function (p) { if (!p) { pen = false; return; } if (pen) g.lineTo(p[0], p[1]); else { g.moveTo(p[0], p[1]); pen = true; } });
    g.stroke();
  }
  function isoLevels() {
    if (state.range === 'ocean') { const a = []; for (let s = 18; s <= 30.01; s += 0.5) a.push(+s.toFixed(1)); return { all: a, major: 1 }; }
    const a = []; for (let s = -4; s <= 34; s += 2) a.push(s); return { all: a, major: 4 };
  }
  // 背景（密度色場、等密度線、冰點、最大密度線、軸）放在離屏畫布，尺寸、範圍、語言或深淺色變了才重畫
  let bgCanvas = null, bgKey = '';
  function drawBackground(L) {
    const key = [L.W, L.H, cvSize.dpr, state.range, T('a', 'b'), C['canvas-bg'], C.text].join('|');
    if (bgCanvas && key === bgKey) return bgCanvas;
    bgKey = key;
    const c = bgCanvas || document.createElement('canvas');
    c.width = Math.round(L.W * cvSize.dpr); c.height = Math.round(L.H * cvSize.dpr);
    const g = c.getContext('2d');
    g.setTransform(cvSize.dpr, 0, 0, cvSize.dpr, 0, 0);
    const fs = L.narrow ? 10.5 : 11.5;
    g.fillStyle = C['canvas-bg']; g.fillRect(0, 0, L.W, L.H);
    // 密度色場（越重越深藍），低解析度再放大
    const nx = 90, ny = 80, img = document.createElement('canvas');
    img.width = nx; img.height = ny;
    const ig = img.getContext('2d'), id = ig.createImageData(nx, ny);
    const lv = isoLevels(), smin = state.range === 'ocean' ? 18 : -4, smax = state.range === 'ocean' ? 29 : 34;
    const c1 = hexRGB(C['sw-sea1']), c2 = hexRGB(C['sw-sea2']);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const Sx = L.S0 + (i + 0.5) / nx * (L.S1 - L.S0), Ty = T_HI - (j + 0.5) / ny * (T_HI - T_LO);
      const u = clamp((K.sigma(Sx, Ty, 0) - smin) / (smax - smin), 0, 1), k = (j * nx + i) * 4;
      const w = Math.pow(u, 0.9);
      id.data[k] = c1[0] + (c2[0] - c1[0]) * w; id.data[k + 1] = c1[1] + (c2[1] - c1[1]) * w; id.data[k + 2] = c1[2] + (c2[2] - c1[2]) * w;
      id.data[k + 3] = D.dark ? 150 : 110;
    }
    ig.putImageData(id, 0, 0);
    g.save();
    D.roundRect(g, L.xl, L.yt, L.xr - L.xl, L.yb - L.yt, 6); g.clip();
    g.imageSmoothingEnabled = true;
    g.drawImage(img, L.xl, L.yt, L.xr - L.xl, L.yb - L.yt);
    // 格線
    g.strokeStyle = D.alpha(C.text, 0.07); g.lineWidth = 1;
    for (let t = 0; t <= 30; t += 5) { const y = Math.round(L.py(t)) + 0.5; g.beginPath(); g.moveTo(L.xl, y); g.lineTo(L.xr, y); g.stroke(); }
    const sStep = state.range === 'ocean' ? 1 : 5;
    for (let s = Math.ceil(L.S0 / sStep) * sStep; s <= L.S1; s += sStep) { const x = Math.round(L.px(s)) + 0.5; g.beginPath(); g.moveTo(x, L.yt); g.lineTo(x, L.yb); g.stroke(); }
    // 等密度線
    const labels = [];
    lv.all.forEach(function (sig) {
      const pts = isoPath(L, sig), major = Math.abs(sig / lv.major - Math.round(sig / lv.major)) < 1e-6;
      g.strokeStyle = D.alpha(C['sw-iso'], major ? 0.75 : 0.35); g.lineWidth = major ? 1.2 : 0.8;
      strokePts(g, pts);
      if (major) {
        // 標籤：放在線離開繪圖區上緣或右緣的地方
        let lab = null;
        for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; if (p && p[0] >= L.xl + 8 && p[0] <= L.xr - 14 && p[1] >= L.yt + 8 && p[1] <= L.yb - 8) { lab = p; break; } }
        if (lab) labels.push([lab[0], lab[1], sig]);
      }
    });
    // 冰點以下（會結冰）：白色斜線
    g.save();
    g.beginPath(); g.moveTo(L.xl, L.yb);
    for (let s = L.S0; s <= L.S1 + 1e-9; s += (L.S1 - L.S0) / 80) g.lineTo(L.px(s), L.py(K.freezing(s)));
    g.lineTo(L.xr, L.yb); g.closePath();
    g.fillStyle = D.alpha(D.dark ? '#e0f2fe' : '#f8fafc', D.dark ? 0.22 : 0.65); g.fill();
    g.clip();
    g.strokeStyle = D.alpha(C['sw-ice'], 0.45); g.lineWidth = 1;
    for (let x = L.xl - 40; x < L.xr + 40; x += 7) { g.beginPath(); g.moveTo(x, L.yb); g.lineTo(x + 30, L.yb - 30); g.stroke(); }
    g.restore();
    g.strokeStyle = C['sw-ice']; g.lineWidth = 1.8;
    g.beginPath(); for (let s = L.S0, i = 0; s <= L.S1 + 1e-9; s += (L.S1 - L.S0) / 80, i++) { const x = L.px(s), y = L.py(K.freezing(s)); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
    // 最大密度的溫度
    g.save(); g.setLineDash([2, 3]); g.strokeStyle = C['sw-tmd']; g.lineWidth = 1.6;
    g.beginPath(); let pen = false;
    for (let s = L.S0; s <= L.S1 + 1e-9; s += (L.S1 - L.S0) / 120) {
      const t = K.tMaxDensity(s); if (t < T_LO) { pen = false; continue; }
      const x = L.px(s), y = L.py(t); if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; }
    }
    g.stroke(); g.restore();
    g.restore();
    // 等密度線的數字
    labels.forEach(function (q) { D.haloText(g, num(q[2], 0), q[0] + 3, q[1] - 7, D.mix(C['sw-iso'], C.text, 0.35), 'left', 'middle', '600 ' + (fs - 1) + 'px ' + FONT); });
    // 冰點、最大密度的標籤
    const sIce = state.range === 'ocean' ? 30.6 : 6;
    D.haloText(g, T('冰點', 'Freezing'), L.px(sIce), L.py(K.freezing(sIce)) + (state.range === 'ocean' ? -9 : 10), C['sw-ice'], 'left', 'middle', '700 ' + (fs - 0.5) + 'px ' + FONT);
    if (state.range === 'full') {
      D.haloText(g, T('最大密度的溫度', 'Temperature of max density'), L.px(14), L.py(K.tMaxDensity(14)) - 10, C['sw-tmd'], 'left', 'middle', '700 ' + (fs - 0.5) + 'px ' + FONT);
    }
    // 框與軸
    g.strokeStyle = D.alpha(C.text, 0.35); g.lineWidth = 1;
    D.roundRect(g, L.xl, L.yt, L.xr - L.xl, L.yb - L.yt, 6); g.stroke();
    for (let t = 0; t <= 30; t += 5) D.haloText(g, String(t), L.xl - 6, L.py(t), C.muted, 'right', 'middle', '500 ' + (fs - 0.5) + 'px ' + FONT);
    const tickS = state.range === 'ocean' ? 2 : (L.narrow ? 10 : 5);
    for (let s = Math.ceil(L.S0 / tickS) * tickS; s <= L.S1; s += tickS) D.haloText(g, String(s), L.px(s), L.yb + 13, C.muted, 'center', 'middle', '500 ' + (fs - 0.5) + 'px ' + FONT);
    D.haloText(g, T('鹽度（實用鹽度）', 'Salinity (practical salinity)'), (L.xl + L.xr) / 2, L.H - 10, C.muted, 'center', 'middle', '600 ' + fs + 'px ' + FONT);
    g.save(); g.translate(12, (L.yt + L.yb) / 2); g.rotate(-Math.PI / 2);
    D.haloText(g, T('溫度（°C）', 'Temperature (°C)'), 0, 0, C.muted, 'center', 'middle', '600 ' + fs + 'px ' + FONT);
    g.restore();
    D.haloText(g, T('灰線：等密度線 σ（kg/m³ − 1000）', 'Grey lines: equal density σ (kg/m³ − 1000)'), L.xr, 13, C.muted, 'right', 'middle', '600 ' + (fs - 1) + 'px ' + FONT);
    bgCanvas = c;
    return c;
  }
  function hexRGB(h) {
    h = (h || '#000000').trim();
    if (h[0] !== '#') { const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(h); return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0]; }
    if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function inView(L, S, t) { return S >= L.S0 && S <= L.S1 && t >= T_LO && t <= T_HI; }
  function drawMain() {
    if (!cvSize || !cur) return;
    const L = lay(), g = ctx, W = L.W, H = L.H, fs = L.narrow ? 10.5 : 11.5, c = cur;
    g.clearRect(0, 0, W, H);
    g.drawImage(drawBackground(L), 0, 0, W, H);
    g.save();
    D.roundRect(g, L.xl, L.yt, L.xr - L.xl, L.yb - L.yt, 6); g.clip();
    // 目前剖面的 T–S 曲線（深度點）
    const rows = K.PROFILES[state.prof].rows;
    g.save(); g.strokeStyle = D.alpha(C['sw-prof'], 0.9); g.lineWidth = 2; g.lineJoin = 'round';
    g.beginPath(); rows.forEach(function (r, i) { const x = L.px(r[2]), y = L.py(r[1]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); g.restore();
    rows.forEach(function (r) {
      if (!inView(L, r[2], r[1])) return;
      const x = L.px(r[2]), y = L.py(r[1]);
      g.fillStyle = C['sw-prof']; g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill();
      if ([0, 200, 1000, 4000].indexOf(r[0]) >= 0 && !(L.narrow && r[0] === 200)) D.haloText(g, r[0] + ' m', x + 5, y + (r[0] === 0 ? -8 : 8), C['sw-prof'], 'left', 'middle', '600 ' + (fs - 1.5) + 'px ' + FONT);
    });
    // 水團
    K.MASSES.forEach(function (m) {
      if (!inView(L, m.S, m.T)) return;
      const x = L.px(m.S), y = L.py(m.T), on = m.id === state.pick;
      g.save(); g.translate(x, y); g.rotate(Math.PI / 4);
      g.fillStyle = on ? C.accent : D.alpha(C['sw-mass'], 0.85); g.strokeStyle = C['canvas-bg']; g.lineWidth = 1.2;
      g.fillRect(-4.2, -4.2, 8.4, 8.4); g.strokeRect(-4.2, -4.2, 8.4, 8.4); g.restore();
      if (on || !L.narrow || ['aabw', 'nadw', 'mw'].indexOf(m.id) >= 0) D.haloText(g, m.short, x + 7, y - 7, on ? C.accent : C['sw-mass'], 'left', 'middle', '600 ' + (fs - 1.5) + 'px ' + FONT);
    });
    // 記號
    state.pins.forEach(function (q, i) {
      if (!inView(L, q.S, q.T)) return;
      const x = L.px(q.S), y = L.py(q.T);
      g.strokeStyle = C['sw-a']; g.lineWidth = 1.4; g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.stroke();
      D.haloText(g, String(i + 1), x + 6, y + 7, C['sw-a'], 'left', 'middle', '700 ' + (fs - 2) + 'px ' + FONT);
    });
    // 通過 A、B、混合水的等密度線
    [[c.sA, C['sw-a']], [c.sB, C['sw-b']], [c.sM, C['sw-m']]].forEach(function (q) {
      g.save(); g.setLineDash([6, 4]); g.strokeStyle = D.alpha(q[1], 0.85); g.lineWidth = 1.5;
      strokePts(g, isoPath(L, q[0])); g.restore();
    });
    // 混合線
    const xA = L.px(c.A.S), yA = L.py(c.A.T), xB = L.px(c.B.S), yB = L.py(c.B.T), xM = L.px(c.M.S), yM = L.py(c.M.T);
    g.save(); g.strokeStyle = D.alpha(C['sw-m'], 0.9); g.lineWidth = 2; g.beginPath(); g.moveTo(xA, yA); g.lineTo(xB, yB); g.stroke(); g.restore();
    g.restore();
    // 點
    D.ball(g, xM, yM, 6, C['sw-m'], { glow: 6 });
    const hiA = state.dragging === 'A' || (kbFocus && kbIndex() === 0), hiB = state.dragging === 'B' || (kbFocus && kbIndex() === 1);
    D.ball(g, xA, yA, hiA ? 10 : 8.5, C['sw-a'], { glow: hiA ? 12 : 7 });
    D.ball(g, xB, yB, hiB ? 10 : 8.5, C['sw-b'], { glow: hiB ? 12 : 7 });
    if (kbFocus) {
      const k = kbIndex(), x = k === 0 ? xA : xB, y = k === 0 ? yA : yB;
      g.save(); g.setLineDash([4, 3]); g.strokeStyle = C.accent; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 16, 0, Math.PI * 2); g.stroke(); g.restore();
    }
    g.save(); g.font = '800 ' + (fs - 0.5) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 2; g.fillStyle = '#ffffff';
    g.fillText('A', xA, yA + 0.5); g.fillText('B', xB, yB + 0.5); g.restore();
    // 標籤：σ 值
    function lab(x, y, txt, col, below) {
      const right = x < W - 120;
      D.pill(g, txt, x + (right ? 12 : -12), y + (below ? 26 : -10), col, right ? 'left' : 'right', '700 ' + (fs - 0.5) + 'px ' + FONT);
    }
    lab(xA, yA, 'σ ' + num(c.sA, 2), C['sw-a'], yA < L.yt + 40);
    lab(xB, yB, 'σ ' + num(c.sB, 2), C['sw-b'], yB < L.yt + 40);
    const mtxt = T('混合 σ ', 'Mix σ ') + num(c.sM, 2);
    lab(xM, yM, mtxt, C['sw-m'], !(yM < L.yt + 40) ? true : false);
    // 選到的水團名稱
    const pm = massById(state.pick);
    if (pm && inView(L, pm.S, pm.T)) {
      const x = L.px(pm.S), y = L.py(pm.T), right = x < W - 160;
      D.pill(g, T(pm.zh, pm.en), x + (right ? 10 : -10), y + 22, C.accent, right ? 'left' : 'right', '600 ' + (fs - 0.5) + 'px ' + FONT);
    }
    // A 在冰點以下
    if (c.A.T < c.fA) D.pill(g, T('A 低於冰點：會結冰', 'A is below freezing: it will freeze'), L.xl + 8, L.yt + 26, C['sw-ice'], 'left', '700 ' + (fs - 0.5) + 'px ' + FONT);
  }

  // =====================================================================
  // 剖面圖
  // =====================================================================
  function zY(z, t, b) { return t + Math.sqrt(Math.max(0, z) / K.Z_MAX) * (b - t); }
  function plotBase(g, W, H) {
    g.fillStyle = C['canvas-bg']; g.fillRect(0, 0, W, H);
  }
  function profileBands(key) {
    // 溫躍層：dθ/dz > 0.02 °C/m；鹽躍層：dS/dz > 0.004 /m（示意的判斷）
    let th = null, ha = null;
    for (let z = 0; z < 1500; z += 5) {
      const a = K.profileAt(key, z), b = K.profileAt(key, z + 5);
      if ((a.T - b.T) / 5 > 0.02) { if (!th) th = [z, z + 5]; else th[1] = z + 5; }
      if ((b.S - a.S) / 5 > 0.004) { if (!ha) ha = [z, z + 5]; else ha[1] = z + 5; }
    }
    return { th: th, ha: ha };
  }
  function drawChart() {
    if (!grSize || !cur) return;
    const W = grSize.w, H = grSize.h, g = gtx, narrow = W < 520, fs = narrow ? 10.5 : 11.5, c = cur;
    g.clearRect(0, 0, W, H);
    plotBase(g, W, H);
    const l = narrow ? 48 : 56, r = W - (narrow ? 8 : 14), t = 26, b = H - 30;
    const gap = narrow ? 10 : 18, pw = (r - l - 2 * gap) / 3;
    const key = state.prof, rows = K.PROFILES[key].rows;
    let tmin = Infinity, tmax = -Infinity, smin = Infinity, smax = -Infinity, gmin = Infinity, gmax = -Infinity;
    rows.forEach(function (q) { tmin = Math.min(tmin, q[1]); tmax = Math.max(tmax, q[1]); smin = Math.min(smin, q[2]); smax = Math.max(smax, q[2]); });
    const tab = tabOf(key);
    gmin = tab[0]; gmax = tab[K.Z_MAX];
    [c.sA, c.sB, c.sM].forEach(function (s) { gmin = Math.min(gmin, s); gmax = Math.max(gmax, s); });
    gmin = Math.max(gmin, tab[0] - 1.5); gmax = Math.min(gmax, tab[K.Z_MAX] + 0.4);
    const pad = function (a, z) { const d = Math.max(z, (a[1] - a[0]) * 0.08); return [a[0] - d, a[1] + d]; };
    const panels = [
      { name: T('位溫 θ（°C）', 'θ (°C)'), color: '#ea580c', rng: pad([tmin, tmax], 0.5), get: function (z) { return K.profileAt(key, z).T; }, dec: 0 },
      { name: T('鹽度', 'Salinity'), color: C['sw-prof'], rng: pad([smin, smax], 0.1), get: function (z) { return K.profileAt(key, z).S; }, dec: 1 },
      { name: T('密度 σθ', 'Density σθ'), color: C.text, rng: pad([gmin, gmax], 0.05), get: function (z) { return tab[Math.round(z)]; }, dec: 1 }
    ];
    const bands = profileBands(key);
    // 深度軸
    [0, 100, 250, 500, 1000, 2000, 3000, 4000].forEach(function (z) {
      if (narrow && (z === 250 || z === 3000)) return;
      const y = zY(z, t, b);
      g.strokeStyle = D.alpha(C.text, 0.08); g.beginPath(); g.moveTo(l, Math.round(y) + 0.5); g.lineTo(r, Math.round(y) + 0.5); g.stroke();
      D.haloText(g, String(z), l - 5, y, C.muted, 'right', 'middle', '500 ' + (fs - 0.5) + 'px ' + FONT);
    });
    g.save(); g.translate(10, (t + b) / 2); g.rotate(-Math.PI / 2);
    D.haloText(g, T('深度（m）', 'Depth (m)'), 0, 0, C.muted, 'center', 'middle', '600 ' + (fs - 0.5) + 'px ' + FONT);
    g.restore();
    panels.forEach(function (P, i) {
      const x0 = l + i * (pw + gap), x1 = x0 + pw;
      const X = function (v) { return x0 + (v - P.rng[0]) / (P.rng[1] - P.rng[0]) * pw; };
      g.fillStyle = D.alpha(C.text, D.dark ? 0.04 : 0.025); g.fillRect(x0, t, pw, b - t);
      // 躍層
      const bd = i === 0 ? bands.th : i === 1 ? bands.ha : null;
      if (bd) {
        g.fillStyle = D.alpha(P.color, 0.12); g.fillRect(x0, zY(bd[0], t, b), pw, zY(bd[1], t, b) - zY(bd[0], t, b));
        D.haloText(g, i === 0 ? T('溫躍層', 'thermocline') : T('鹽躍層', 'halocline'), x1 - 3, (zY(bd[0], t, b) + zY(bd[1], t, b)) / 2, P.color, 'right', 'middle', '600 ' + (fs - 1.5) + 'px ' + FONT);
      }
      g.strokeStyle = D.alpha(C.text, 0.35); g.lineWidth = 1; g.strokeRect(Math.round(x0) + 0.5, t + 0.5, Math.round(pw), b - t);
      g.save(); g.beginPath(); g.rect(x0, t, pw, b - t); g.clip();
      g.strokeStyle = P.color; g.lineWidth = 2; g.lineJoin = 'round'; g.beginPath();
      for (let k = 0; k <= 200; k++) { const z = K.Z_MAX * (k / 200) * (k / 200), x = X(P.get(z)), y = zY(z, t, b); if (k) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke(); g.restore();
      D.haloText(g, P.name, (x0 + x1) / 2, t - 9, P.color, 'center', 'middle', '700 ' + (fs - 0.5) + 'px ' + FONT);
      D.haloText(g, num(P.rng[0] + (P.rng[1] - P.rng[0]) * 0.08, P.dec), x0 + 2, b + 11, C.muted, 'left', 'middle', '500 ' + (fs - 1.5) + 'px ' + FONT);
      D.haloText(g, num(P.rng[1] - (P.rng[1] - P.rng[0]) * 0.08, P.dec), x1 - 2, b + 11, C.muted, 'right', 'middle', '500 ' + (fs - 1.5) + 'px ' + FONT);
      // σ 面板：三團水的位置
      if (i === 2) {
        [[c.zA, c.sA, C['sw-a'], 'A'], [c.zB, c.sB, C['sw-b'], 'B'], [c.zM, c.sM, C['sw-m'], T('混', 'M')]].forEach(function (q) {
          const y = zY(q[0].z, t, b), x = clamp(X(q[1]), x0 + 4, x1 - 4);
          D.ball(g, x, clamp(y, t + 4, b - 4), 4.5, q[2], { glow: 4 });
        });
      }
    });
    // 停住的深度（橫線）
    const marks = [[c.zA, C['sw-a'], 'A'], [c.zB, C['sw-b'], 'B'], [c.zM, C['sw-m'], T('混合', 'Mix')]];
    const used = [];
    marks.forEach(function (q) {
      const y = clamp(zY(q[0].z, t, b), t + 1, b - 1);
      g.save(); g.setLineDash([5, 4]); g.strokeStyle = D.alpha(q[1], 0.85); g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(l, y); g.lineTo(r, y); g.stroke(); g.restore();
      const down = y < t + 40, step = down ? 13 : -13;
      let ly = down ? y + 9 : y - 8;
      while (used.some(function (u) { return Math.abs(u - ly) < 13; })) ly += step;
      used.push(ly);
      D.haloText(g, q[2] + ' ' + zText(q[0]), l + 4, clamp(ly, t + 7, b - 7), q[1], 'left', 'middle', '700 ' + (fs - 1) + 'px ' + FONT);
    });
  }

  // =====================================================================
  // 讀數、事件與音效
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function setStatus(s) { $('status').textContent = s; }
  function snapshot() {
    const c = cur || compute();
    return { TA: c.A.T, SA: c.A.S, TB: c.B.T, SB: c.B.S, f: state.f, TM: c.M.T, SM: c.M.S,
      sA: c.sA, sB: c.sB, sM: c.sM, fA: c.fA, tmdA: c.tmdA, excess: c.excess,
      zA: c.zA.z, wA: c.zA.where, zB: c.zB.z, wB: c.zB.where, zM: c.zM.z, wM: c.zM.where,
      prof: state.prof, range: state.range, pick: state.pick, pins: state.pins.length, dragging: state.dragging ? true : false };
  }
  let lastEmit = 0;
  function emitState(force) {
    const t = performance.now();
    if (force || t - lastEmit > 250) { lastEmit = t; emit('water', snapshot()); }
  }
  function refreshOutputs() {
    setOut(el.tA, outNum(state.A.T, 2)); setOut(el.sA, outNum(state.A.S, 2));
    setOut(el.tB, outNum(state.B.T, 2)); setOut(el.sB, outNum(state.B.S, 2));
    setOut(el.mf, outNum(state.f, 2));
  }
  function updateReadouts() {
    const c = cur;
    setHTML('rTA', num(c.A.T, 2)); setHTML('rTB', num(c.B.T, 2)); setHTML('rTM', num(c.M.T, 2));
    setHTML('rSA', num(c.A.S, 2)); setHTML('rSB', num(c.B.S, 2)); setHTML('rSM', num(c.M.S, 2));
    setHTML('rDA', num(c.sA, 3)); setHTML('rDB', num(c.sB, 3)); setHTML('rDM', num(c.sM, 3));
    setHTML('rFA', num(c.fA, 2)); setHTML('rFB', num(c.fB, 2)); setHTML('rFM', num(c.fM, 2));
    setHTML('rZA', zShort(c.zA)); setHTML('rZB', zShort(c.zB)); setHTML('rZM', zShort(c.zM));
    const ex = c.excess, over = c.over;
    setHTML('mixHint', T('混合水比「兩團水密度的平均」重 <b>' + num(ex, 3) + '</b> kg/m<sup>3</sup>（混合增密）' + (over > 0 ? '，而且比兩團都重！' : '。'),
      'The mixture is <b>' + num(ex, 3) + '</b> kg/m<sup>3</sup> heavier than the average of the two densities (cabbeling)' + (over > 0 ? ' — heavier than both parcels!' : '.')));
    const below = c.tmdA < c.fA;
    setHTML('aHint', T('A：熱膨脹係數 α = <b>' + num(c.alA * 1e4, 2) + '</b> × 10<sup>−4</sup> /K，鹽收縮係數 β = <b>' + num(c.beA * 1e4, 2) + '</b> × 10<sup>−4</sup>；最大密度的溫度 <b>' + num(c.tmdA, 2) + ' °C</b>' + (below ? '（低於冰點：冷到結冰都是越冷越重）' : '') + '。',
      'A: thermal expansion α = <b>' + num(c.alA * 1e4, 2) + '</b> × 10<sup>−4</sup> /K, haline contraction β = <b>' + num(c.beA * 1e4, 2) + '</b> × 10<sup>−4</sup>; densest at <b>' + num(c.tmdA, 2) + ' °C</b>' + (below ? ' (below freezing: it gets heavier all the way down to freezing)' : '') + '.'));
    const pm = massById(state.pick);
    if (pm) {
      const z = settle(pm.T, pm.S);
      setHTML('massHint', T(pm.zh + '・' + pm.short + '：θ ≈ ' + num(pm.T, 1) + ' °C、鹽度 ≈ ' + num(pm.S, 2) + '、σθ = <b>' + num(K.sigma(pm.S, pm.T, 0), 3) + '</b>；放進「' + K.PROFILES[state.prof].zh + '」會' + (z.where === 'mid' ? '停在 ' + num(z.z, 0) + ' m' : z.where === 'surface' ? '浮在海面' : '沉到海底') + '。',
        pm.en + ' · ' + pm.short + ': θ ≈ ' + num(pm.T, 1) + ' °C, S ≈ ' + num(pm.S, 2) + ', σθ = <b>' + num(K.sigma(pm.S, pm.T, 0), 3) + '</b>; in the “' + K.PROFILES[state.prof].en + '” profile it ' + (z.where === 'mid' ? 'settles at ' + num(z.z, 0) + ' m' : z.where === 'surface' ? 'floats at the surface' : 'sinks to the sea floor') + '.'));
    } else setHTML('massHint', T('點 T–S 圖上的灰色菱形，或從清單選一個。', 'Tap a grey diamond on the diagram or choose one from the list.'));
    $('toA').disabled = !pm;
    setHTML('chartHint', chartHint());
  }
  function chartHint() {
    const k = state.prof;
    if (k === 'wpac') return T('熱帶：表層又暖又輕，下面是很陡的溫躍層，密度主要由溫度決定。', 'Tropics: warm, light surface water over a sharp thermocline; density is set mainly by temperature.');
    if (k === 'natl') return T('副熱帶北大西洋：表層很鹹（蒸發多），200–600 m 是溫度幾乎相同的「18 度水」，再往下才是溫躍層。', 'Subtropical North Atlantic: very salty surface water (strong evaporation), the nearly uniform “18-degree water” at 200–600 m, then the thermocline.');
    if (k === 'npac') return T('北太平洋亞寒帶冬季：溫度往下幾乎不變，但表層很淡；是 100–200 m 的鹽躍層讓表層的水不會沉下去。', 'Subpolar North Pacific in winter: the temperature hardly changes with depth, but the surface water is fresh; the halocline at 100–200 m keeps it from sinking.');
    return T('南極威德爾海冬季：表層已冷到冰點，下面是稍暖、稍鹹的繞極深層水；整層密度差很小，一點點變重就能沉得很深。', 'Weddell Sea in winter: the surface is at freezing point over slightly warmer, saltier Circumpolar Deep Water; the column is so weakly stratified that a small density gain can sink very deep.');
  }
  let lastSay = 0;
  function sayNow(force) {
    const c = cur;
    const txt = T('A：' + num(c.A.T, 1) + ' 度、鹽度 ' + num(c.A.S, 2) + '、σ ' + num(c.sA, 2) + '；B：σ ' + num(c.sB, 2) + '；混合：σ ' + num(c.sM, 2),
      'A: ' + num(c.A.T, 1) + ' degrees, salinity ' + num(c.A.S, 2) + ', sigma ' + num(c.sA, 2) + '; B: sigma ' + num(c.sB, 2) + '; mixture: sigma ' + num(c.sM, 2));
    const t = performance.now();
    if (force || t - lastSay > 3000) { $('srNow').textContent = txt; lastSay = t; }
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  // 音效：A 越過冰點、混合水開始比兩團都重時各響一聲（預設關）
  let lastIce = null, lastOver = null;
  function soundCues() {
    const S = sound(), ice = cur.A.T < cur.fA, over = cur.over > 0;
    if (S && lastIce != null && ice !== lastIce) S.tone({ freq: ice ? 988 : 660, dur: 0.1, gain: 0.1 });
    if (S && lastOver != null && over !== lastOver && over) { S.tone({ freq: 523, dur: 0.09, gain: 0.09 }); setTimeout(function () { S.tone({ freq: 784, dur: 0.14, gain: 0.09 }); }, 90); }
    lastIce = ice; lastOver = over;
  }
  function refreshAll() { compute(); soundCues(); refreshOutputs(); updateReadouts(); requestDraw(); }

  // =====================================================================
  // 控制項
  // =====================================================================
  function setSeg(id, attr, v) {
    document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(v))); });
  }
  ['tA', 'sA', 'tB', 'sB', 'mf'].forEach(function (k) {
    el[k].addEventListener('input', function () { if (internal) return; acted(); readSliders(); autoRange(); refreshAll(); emitState(); sayNow(); });
    el[k].addEventListener('change', function () { if (internal) return; readSliders(); refreshAll(); emitState(true); });
  });
  function setRangeMode(r, quiet) {
    state.range = r; setSeg('rangeSeg', 'data-range', r); bgKey = '';
    requestDraw();
    if (!quiet) { emit('range', { range: r }); emitState(true); }
  }
  // 鹽度跑出「一般海水」的範圍時，自動切到全部鹽度，點才不會跑出圖外
  function autoRange() {
    const R = RANGES.ocean;
    if (state.range === 'ocean' && [state.A.S, state.B.S].some(function (s) { return s < R[0] || s > R[1]; })) {
      setRangeMode('full', true);
      setStatus(T('鹽度超出 30–40，已切到「全部鹽度」。', 'Salinity is outside 30–40, so the view switched to the full salinity range.'));
    }
  }
  document.querySelectorAll('#rangeSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      const r = b.getAttribute('data-range'), R = RANGES[r];
      let moved = false;
      ['A', 'B'].forEach(function (k) {
        const P = state[k], s = clamp(P.S, R[0], R[1]);
        if (s !== P.S) { P.S = s; setRange(k === 'A' ? el.sA : el.sB, s); moved = true; }
      });
      if (moved) refreshAll();
      setRangeMode(r);
      if (moved) setStatus(T('鹽度移回 30–40 的範圍內。', 'Salinity moved back into the 30–40 range.'));
    });
  });
  function setProf(p, quiet) {
    state.prof = p; setSeg('profSeg', 'data-prof', p);
    refreshAll();
    if (!quiet) {
      setStatus(T('剖面：' + K.PROFILES[p].zh, 'Profile: ' + K.PROFILES[p].en));
      emitState(true);
    }
  }
  document.querySelectorAll('#profSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); setProf(b.getAttribute('data-prof')); });
  });
  function fillSelect() {
    const keep = state.pick;
    let html = '<option value="">' + T('（選一個水團）', '(choose a water mass)') + '</option>';
    K.MASSES.forEach(function (m) { html += '<option value="' + m.id + '">' + mName(m) + '</option>'; });
    el.sel.innerHTML = html;
    el.sel.value = keep;
  }
  function mName(m) { return T(m.zh, m.en) + T('・', ' · ') + m.short; }
  function pickMass(id, from) {
    const m = massById(id);
    state.pick = m ? id : '';
    if (el.sel.value !== state.pick) el.sel.value = state.pick;
    updateReadouts(); requestDraw();
    if (m) {
      const S = sound(); if (S) S.tone({ freq: 523, dur: 0.08, gain: 0.08 });
      setStatus(T('水團：' + m.zh, 'Water mass: ' + m.en));
      emit('pick', { id: id, from: from });
    }
    emitState(true);
  }
  el.sel.addEventListener('change', function () { acted(); pickMass(el.sel.value, 'list'); });
  $('toA').addEventListener('click', function () {
    const m = massById(state.pick); if (!m) return;
    acted();
    state.A.T = m.T; state.A.S = m.S; setRange(el.tA, m.T); setRange(el.sA, m.S);
    if (m.S < RANGES[state.range][0]) setRangeMode('full', true);
    refreshAll(); emitState(true); sayNow(true);
    setStatus(T('水團 A 設成' + m.zh + '。', 'Parcel A set to ' + m.en + '.'));
  });
  $('pinBtn').addEventListener('click', function () {
    acted();
    if (state.pins.length >= MAX_PINS) state.pins.shift();
    state.pins.push({ T: state.A.T, S: state.A.S });
    const S = sound(); if (S) S.tone({ freq: 784, dur: 0.07, gain: 0.08 });
    setStatus(T('留下 A 的記號 #' + state.pins.length + '（最多 ' + MAX_PINS + ' 個）。', 'Marker #' + state.pins.length + ' for A placed (up to ' + MAX_PINS + ').'));
    requestDraw(); emit('pin', { n: state.pins.length }); emitState(true);
  });
  $('clearBtn').addEventListener('click', function () {
    acted();
    state.pins = []; state.pick = ''; el.sel.value = '';
    updateReadouts(); requestDraw();
    setStatus(T('已清除記號與選到的水團；A、B 與混合比例不變。', 'Markers and the chosen water mass cleared; A, B and the mixing ratio are unchanged.'));
    emitState(true);
  });
  $('soundBtn').addEventListener('click', function () {
    const on = !(window.LabSettings && window.LabSettings.get('sound'));
    if (window.LabSettings) window.LabSettings.set('sound', on);
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 拖曳 ----------
  let kbFocus = false, kb = null;
  function kbIndex() { return kb && kb.index ? kb.index() : 0; }
  function evXY(ev) { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  function placeParcel(L, who, x, y) {
    const P = state[who], R = RANGES[state.range];
    P.S = clamp(Math.round(L.sOf(clamp(x, L.xl, L.xr)) * 100) / 100, Math.max(0, R[0]), Math.min(42, R[1]));
    P.T = clamp(Math.round(L.tOf(clamp(y, L.yt, L.yb)) * 100) / 100, T_LO, T_HI);
    setRange(who === 'A' ? el.tA : el.tB, P.T); setRange(who === 'A' ? el.sA : el.sB, P.S);
    refreshAll();
  }
  function hitMass(L, x, y) {
    let best = null, bd = 12;
    K.MASSES.forEach(function (m) { if (!inView(L, m.S, m.T)) return; const d = Math.hypot(L.px(m.S) - x, L.py(m.T) - y); if (d < bd) { bd = d; best = m; } });
    return best;
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (view3 && view3.active) return;
    const L = lay(), p = evXY(ev);
    const dA = Math.hypot(L.px(state.A.S) - p.x, L.py(state.A.T) - p.y), dB = Math.hypot(L.px(state.B.S) - p.x, L.py(state.B.T) - p.y);
    let who = '';
    if (Math.min(dA, dB) < 26) who = dA <= dB ? 'A' : 'B';
    else {
      const m = hitMass(L, p.x, p.y);
      if (m) { acted(); pickMass(m.id === state.pick ? '' : m.id, 'chart'); ev.preventDefault(); return; }
      if (p.x < L.xl - 4 || p.x > L.xr + 4 || p.y < L.yt - 4 || p.y > L.yb + 4) return;
      who = dA <= dB ? 'A' : 'B';
    }
    acted(); state.dragging = who; cv.setPointerCapture(ev.pointerId);
    placeParcel(L, who, p.x, p.y); emitState(true);
    ev.preventDefault();
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!state.dragging) return;
    const L = lay(), p = evXY(ev);
    placeParcel(L, state.dragging, p.x, p.y); sayNow(); emitState();
  });
  function endDrag() { if (!state.dragging) return; state.dragging = ''; refreshAll(); sayNow(true); emitState(true); }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // ---------- 鍵盤 ----------
  function kbItem(who) {
    return {
      name: function () { return who === 'A' ? T('水團 A', 'Parcel A') : T('水團 B', 'Parcel B'); },
      move: function (dx, dy, big) {
        if (!dx && !dy) return false;
        acted(); kbFocus = true;
        const P = state[who], R = RANGES[state.range];
        P.S = clamp(Math.round((P.S + dx * (big ? 0.5 : 0.05)) * 100) / 100, Math.max(0, R[0]), Math.min(42, R[1]));
        P.T = clamp(Math.round((P.T + dy * (big ? 1 : 0.1)) * 100) / 100, T_LO, T_HI);
        setRange(who === 'A' ? el.tA : el.tB, P.T); setRange(who === 'A' ? el.sA : el.sB, P.S);
        refreshAll(); emitState(true); return true;
      },
      describe: function () { const P = state[who], s = who === 'A' ? cur.sA : cur.sB; return (who === 'A' ? T('水團 A：', 'Parcel A: ') : T('水團 B：', 'Parcel B: ')) + num(P.T, 2) + T(' 度，鹽度 ', ' degrees, salinity ') + num(P.S, 2) + T('，σ ', ', sigma ') + num(s, 2); }
    };
  }
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('T–S 圖。Enter 切換水團 A／B，左右方向鍵＝鹽度、上下＝溫度，Shift 走大步。', 'T–S diagram. Enter switches between parcels A and B; left/right = salinity, up/down = temperature; Shift for bigger steps.'),
      items: [kbItem('A'), kbItem('B')],
      onChange: function () { kbFocus = true; requestDraw(); }
    });
    cv.addEventListener('blur', function () { kbFocus = false; requestDraw(); });
  }

  // ---------- 分享 ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { r: state.range, p: state.prof, k: state.pick, pins: state.pins.map(function (q) { return [+q.T.toFixed(2), +q.S.toFixed(2)]; }) }; },
    set: function (o) {
      if (!o) return;
      if (RANGES[o.r]) setRangeMode(o.r, true);
      if (PROF_KEYS.indexOf(o.p) >= 0) { state.prof = o.p; setSeg('profSeg', 'data-prof', o.p); }
      if (typeof o.k === 'string') { state.pick = massById(o.k) ? o.k : ''; el.sel.value = state.pick; }
      if (Array.isArray(o.pins)) state.pins = o.pins.slice(0, MAX_PINS).filter(function (q) { return Array.isArray(q) && isFinite(+q[0]) && isFinite(+q[1]); })
        .map(function (q) { return { T: clamp(+q[0], T_LO, T_HI), S: clamp(+q[1], 0, 42) }; });
      readSliders();
      if (state.range === 'ocean' && [state.A.S, state.B.S].some(function (s) { return s < 30 || s > 40; })) setRangeMode('full', true);
      refreshAll();
    }
  });

  // =====================================================================
  // 繪圖迴圈
  // =====================================================================
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(loop); }
  function loop(tnow) {
    raf = 0;
    if (view3 && view3.active) view3.frame(tnow); else drawMain();
    drawChart();
    if (view3 && view3.active && view3.busy()) raf = requestAnimationFrame(loop);
  }

  // =====================================================================
  // 3D 檢視（切換時才載入 three.js 與 seawater-3d.js）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    K: K, T: T, D: D, state: state, colors: function () { return C; }, reducedMotion: reducedMotion,
    num: num, cur: function () { return cur; }, range: function () { return RANGES[state.range]; }, T_LO: T_LO, T_HI: T_HI, levels: isoLevels,
    sOnIso: sOnIso,
    request: function () { requestDraw(); },
    onCam: function (kind) { acted(); emit('cam', { preset: kind }); },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D T–S 圖。', 'The 3D graphics context was lost, so the view switched back to the 2D T–S diagram.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Seawater3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Seawater3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/seawater-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Seawater3D) throw new Error('seawater-3d.js did not load');
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function updateViewNotes() {
    const is3 = !!(view3 && view3.active);
    $('camBar').hidden = !is3;
    stage.classList.toggle('is3d', is3);
  }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable()) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D…', 'Loading 3D…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        view3 = window.Seawater3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        updateViewNotes();
        requestAnimationFrame(function () { if (view3) { view3.onShow(); requestDraw(); } });
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
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      updateViewNotes();
      resizeCv();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    setPressed('2d');
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D T–S 圖。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D T–S diagram is kept.');
    updateViewNotes();
    resizeCv();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); emit('view', { mode: '3d' }); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  ['Tilt', 'Top', 'Side'].forEach(function (k) {
    $('cam' + k).addEventListener('click', function () { if (view3) { view3.camTo(k.toLowerCase()); bridge.onCam(k.toLowerCase()); } });
  });

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  readSliders();
  fillSelect();
  updateSoundButton();
  function themeChanged() {
    readColors();
    bgKey = '';
    fillSelect();
    updateSoundButton(); compute(); updateReadouts();
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:langchange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lh = 0, gw = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lw || cv.clientHeight !== lh || gr.clientWidth !== gw) { lw = cv.clientWidth; lh = cv.clientHeight; gw = gr.clientWidth; if (gw > 0) resizeCv(); }
    }).observe(stage);
  } else window.addEventListener('resize', resizeCv);
  resizeCv();
  compute();
  lastIce = cur.A.T < cur.fA; lastOver = cur.over > 0;
  refreshOutputs();
  updateReadouts();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) requestDraw(); });
  setStatus(T('A 是冷而淡的水、B 是暖而鹹的水。拖曳它們，看等密度線與混合水。', 'A is cold, fresher water and B is warm, saltier water. Drag them and watch the density lines and the mixture.'));
  requestDraw();
  // 測試用（Playwright）
  window.__sw = { state: state, K: K, snapshot: snapshot, setView: setView, cur: function () { return cur; },
    set: function (who, t, s) { acted(); state[who].T = t; state[who].S = s; setRange(who === 'A' ? el.tA : el.tB, t); setRange(who === 'A' ? el.sA : el.sB, s); refreshAll(); emitState(true); },
    mixf: function (f) { acted(); state.f = f; setRange(el.mf, f); refreshAll(); emitState(true); },
    prof: function (p) { acted(); setProf(p); }, range: function (r) { acted(); setRangeMode(r); }, pick: function (id) { acted(); pickMass(id, 'test'); } };
})();
