/* dc-circuit.js — 「直流電路」模組的畫面與互動（物理計算在 dc-circuit-core.js） */
(function () {
  'use strict';
  const K = window.DCCircuitCore;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------- 固定的畫面比例（畫面說明中有寫） ----------
  const CARRIER_SPEED = 0.7; // 每 1 A：每秒移動 0.7 格
  const CARRIER_MAX = 8;     // 速率上限：每秒 8 格（約 11 A）
  const P_FULL = 6;          // 燈泡 6 W 時最亮
  const G_FULL = 0.02;       // 檢流計滿刻度 ±20 mA
  const R_MIN = 0.5, R_MAX = 100;

  const state = {
    preset: 'single', count: 3,
    c: null, sol: null, rep: null,
    sel: -1,                 // 選取的電阻元件索引
    hover: -1,               // 滑鼠停留的元件（-2 起為節點：-2 - 節點）
    probes: [null, null],    // [紅, 黑] 節點
    running: !reducedMotion,
    electrons: false,
    show: { labels: true, pot: true },
    hum: false,
    offs: [],                // 每個元件上電荷的位移（px）
    lever: {},               // 開關撥桿的動畫角度（純介面過場）
  };

  // ---------- 色彩 ----------
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface',
      '--pos', '--neg', '--field', '--equi', '--probe', '--b-em']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    colors.dark = isDark();
    sprites = {};
  }
  function rgbOf(c) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(c).trim());
    if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    const n = String(c).match(/[\d.]+/g);
    return n && n.length >= 3 ? [+n[0], +n[1], +n[2]] : [128, 128, 128];
  }
  function alpha(c, a) { const r = rgbOf(c); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + a + ')'; }
  function shade(c, f) {
    const r = rgbOf(c), t = f > 0 ? 255 : 0, k = Math.abs(f);
    return 'rgb(' + r.map(function (x) { return Math.round(x + (t - x) * k); }).join(',') + ')';
  }
  function mix(c1, c2, f) {
    const a = rgbOf(c1), b = rgbOf(c2);
    return 'rgb(' + a.map(function (x, i) { return Math.round(x + (b[i] - x) * f); }).join(',') + ')';
  }
  function isDark() {
    const r = rgbOf(getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg'));
    return (r[0] + r[1] + r[2]) / 3 < 100;
  }
  /** 導線的顏色：電位低 → 偏藍、高 → 偏紅（淡淡的，主體仍是金屬色） */
  function potColor(V, floating) {
    const metal = colors.dark ? shade(colors.field, -0.25) : shade(colors.field, 0.12);
    if (!state.show.pot || floating || !isFinite(V)) return metal;
    const vmax = Math.max(1e-9, emf());
    const t = Math.max(0, Math.min(1, V / vmax));
    return t < 0.5 ? mix(metal, colors.neg, (0.5 - t) * 2 * 0.62) : mix(metal, colors.pos, (t - 0.5) * 2 * 0.62);
  }

  // ---------- 數字格式 ----------
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function trim(s) { return s.indexOf('.') >= 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s; }
  function fmtR(R) { return isFinite(R) ? trim(num(R, 2)) + ' Ω' : '∞'; }
  function fmtI(I) {
    const a = Math.abs(I);
    if (!isFinite(I)) return '∞';
    if (a < 5e-7) return '0 A';
    if (a < 0.1) return num(I * 1000, a < 0.01 ? 2 : 1) + ' mA';
    return num(I, a < 10 ? 3 : 2) + ' A';
  }
  function fmtV(V) { return isFinite(V) ? num(Math.abs(V) < 5e-6 ? 0 : V, 2) + ' V' : '—'; }
  function fmtP(P) { return isFinite(P) ? num(P, Math.abs(P) < 0.1 ? 3 : 2) + ' W' : '—'; }
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s;
  }

  // ---------- 元件名稱 ----------
  function kindName(e) {
    if (e.type === 'battery') return T('電池', 'Battery');
    if (e.type === 'switch') return T('開關', 'Switch');
    return { bulb: T('燈泡', 'Bulb'), res: T('電阻', 'Resistor'), load: T('負載電阻', 'Load resistor'), galv: T('檢流計', 'Galvanometer') }[e.kind] || '';
  }
  function emf() { return state.c ? state.c.elements[0].emf : 6; }

  // ======================= 電路與求解 =======================
  function loadPreset(name, count) {
    state.preset = name;
    state.count = count || state.count;
    state.c = K.preset(name, state.count);
    state.probes = state.c.probes ? state.c.probes.slice() : [null, null];
    state.offs = state.c.elements.map(function () { return 0; });
    state.lever = {};
    const first = state.c.elements.findIndex(function (e) { return e.type === 'R' && e.kind !== 'galv'; });
    state.sel = first;
    solve();
  }
  function solve() {
    state.sol = K.solve(state.c);
    state.rep = state.sol.ok ? K.batteryReport(state.c, state.sol, 0) : null;
  }
  function elId(id) { return K.indexOf(state.c, id); }

  /** 兩個探針之間的電位差（紅 − 黑）；探針在浮接部分時沒有定義 */
  function probeDV() {
    const p = state.probes, s = state.sol;
    if (p[0] == null || p[1] == null || !s || !s.ok) return NaN;
    if (s.floating[p[0]] || s.floating[p[1]]) return NaN;
    return s.V[p[0]] - s.V[p[1]];
  }
  /** 探針跨在哪些元件的兩端（以超節點判斷：被導線連在一起的點視為同一點） */
  function probeAcross() {
    const p = state.probes, s = state.sol;
    if (p[0] == null || p[1] == null || !s) return [];
    const c1 = s.cluster[p[0]], c2 = s.cluster[p[1]];
    if (c1 === c2) return [];
    return state.c.elements.filter(function (e) {
      if (e.type === 'wire') return false;
      const a = s.cluster[e.a], b = s.cluster[e.b];
      return (a === c1 && b === c2) || (a === c2 && b === c1);
    }).map(function (e) { return e.id; });
  }

  // ======================= 畫布與版面 =======================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const pr = $('pr'), pctx = pr.getContext('2d');
  let dpr = 1, cw = 300, ch = 300, L = null;
  const bg = document.createElement('canvas'), bgc = bg.getContext('2d');
  const under = document.createElement('canvas'), uc = under.getContext('2d');  // 導線
  const over = document.createElement('canvas'), oc = over.getContext('2d');    // 元件、標示、探針、電表
  let sprites = {};

  function layout() {
    const narrow = cw < 560;
    const stripH = narrow ? 70 : 76;
    const padX = narrow ? 26 : Math.max(44, cw * 0.075);
    const padT = narrow ? 26 : 50, padB = narrow ? 34 : 46; // 上方留給最上排燈泡的光暈與選取外框
    let schH = Math.round(cw * 0.62);
    let u = Math.min((cw - 2 * padX) / 6, (schH - padT - padB) / 4);
    if (narrow) { u = (cw - 2 * padX) / 6; schH = Math.round(4 * u + padT + padB); } // 手機：高度貼合電路，不留空白
    return {
      narrow: narrow, schH: schH, stripH: stripH, u: u,
      ox: (cw - 6 * u) / 2, oy: padT + ((schH - padT - padB) - 4 * u) / 2,
      fs: narrow ? 10.5 : 12
    };
  }
  function P(n) { const q = state.c.nodes[n]; return [L.ox + q.x * L.u, L.oy + q.y * L.u]; }

  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    L = layout();
    ch = L.schH + L.stripH;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    [cv, bg, under, over].forEach(function (c) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); });
    sprites = {};
    buildBackground();
    rebuild();
    resizeGraph();
  }

  function roundRect(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /** 背景：中心亮、四角暗的電路板，極淡的點陣格，下方電表區 */
  function buildBackground() {
    const c = bgc;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    const base = colors['canvas-bg'];
    const edge = shade(base, colors.dark ? -0.35 : -0.05);
    const rg = c.createRadialGradient(cw / 2, L.schH * 0.45, L.schH * 0.1, cw / 2, L.schH * 0.45, Math.max(cw, L.schH) * 0.7);
    rg.addColorStop(0, colors.dark ? shade(base, 0.035) : base);
    rg.addColorStop(1, edge);
    c.fillStyle = rg;
    roundRect(c, 0, 0, cw, L.schH, 8);
    c.fill();
    // 點陣格：每 0.5 格一點，整數格稍明顯
    const u = L.u;
    for (let i = -2; i <= 14; i++) for (let j = -2; j <= 10; j++) {
      const x = L.ox + i * u / 2, y = L.oy + j * u / 2;
      if (x < 6 || x > cw - 6 || y < 6 || y > L.schH - 6) continue;
      const major = i % 2 === 0 && j % 2 === 0;
      c.fillStyle = alpha(colors.text, major ? (colors.dark ? 0.12 : 0.13) : (colors.dark ? 0.05 : 0.06));
      c.beginPath(); c.arc(Math.round(x) + 0.5, Math.round(y) + 0.5, major ? 1.3 : 0.9, 0, Math.PI * 2); c.fill();
    }
    // 電表區
    const g = c.createLinearGradient(0, L.schH + 6, 0, ch);
    g.addColorStop(0, base);
    g.addColorStop(1, edge);
    c.fillStyle = g;
    roundRect(c, 0, L.schH + 6, cw, L.stripH - 6, 8);
    c.fill();
    c.strokeStyle = alpha(colors.text, 0.08);
    c.lineWidth = 1;
    roundRect(c, 0.5, 0.5, cw - 1, L.schH - 1, 8); c.stroke();
    roundRect(c, 0.5, L.schH + 6.5, cw - 1, L.stripH - 7, 8); c.stroke();
  }

  // ---------- 元件幾何 ----------
  function geom(e) {
    const A = P(e.a), B = P(e.b), u = L.u;
    const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy) || 1;
    const g = { A: A, B: B, len: len, ux: dx / len, uy: dy / len, C: [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], hb: 0, hw: 0 };
    g.ang = Math.atan2(g.uy, g.ux);
    if (e.type === 'R' && (e.kind === 'res' || e.kind === 'load')) {
      g.hb = Math.min(0.58 * u, len / 2 - 0.14 * u, 62); g.hw = Math.max(7, Math.min(0.16 * u, 15));
    } else if (e.type === 'R' && e.kind === 'bulb') {
      g.hb = g.hw = Math.max(14, Math.min(0.36 * u, 34));
    } else if (e.type === 'R' && e.kind === 'galv') {
      g.hb = g.hw = Math.max(16, Math.min(0.4 * u, 38));
    } else if (e.type === 'switch') {
      g.hb = Math.max(15, Math.min(0.42 * u, len / 2 - 0.1 * u, 42)); g.hw = g.hb * 0.6;
    } else if (e.type === 'battery') {
      g.hb = Math.min(1.05 * u, len / 2 - 0.25 * u); g.hw = Math.max(16, Math.min(0.36 * u, 36));
    }
    return g;
  }
  function along(g, s) { return [g.C[0] + g.ux * s, g.C[1] + g.uy * s]; }
  function wireW() { return Math.max(3, Math.min(0.075 * L.u, 7)); }

  /** 管狀導線：投影＋暗色底＋偏左上的亮線 */
  function tube(c, A, B, col, w) {
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(0,0,0,' + (colors.dark ? 0.35 : 0.13) + ')';
    c.lineWidth = w + 1.5;
    c.beginPath(); c.moveTo(A[0] + 0.8, A[1] + 1.8); c.lineTo(B[0] + 0.8, B[1] + 1.8); c.stroke();
    c.strokeStyle = shade(col, -0.18);
    c.lineWidth = w;
    c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
    const horiz = Math.abs(B[1] - A[1]) < Math.abs(B[0] - A[0]);
    const o = w * 0.22;
    c.strokeStyle = alpha(shade(col, 0.55), colors.dark ? 0.75 : 0.85);
    c.lineWidth = Math.max(0.9, w * 0.32);
    c.beginPath();
    c.moveTo(A[0] - (horiz ? 0 : o), A[1] - (horiz ? o : 0));
    c.lineTo(B[0] - (horiz ? 0 : o), B[1] - (horiz ? o : 0));
    c.stroke();
  }

  // ======================= 圖層：導線 =======================
  function buildUnder() {
    const c = uc, s = state.sol, w = wireW();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    drawCables(c);
    state.c.elements.forEach(function (e) {
      const g = geom(e);
      const Va = s.ok ? s.V[e.a] : NaN, Vb = s.ok ? s.V[e.b] : NaN;
      const ca = potColor(Va, s.floating[e.a]), cb = potColor(Vb, s.floating[e.b]);
      if (e.type === 'wire') { tube(c, g.A, g.B, ca, w); return; }
      tube(c, g.A, along(g, -g.hb), ca, w);
      tube(c, along(g, g.hb), g.B, cb, w);
    });
  }

  // ======================= 圖層：元件、標示 =======================
  function sphere(c, x, y, R, base) {
    const g = c.createRadialGradient(x - R * 0.33, y - R * 0.35, R * 0.1, x, y, R);
    g.addColorStop(0, shade(base, 0.6));
    g.addColorStop(0.5, base);
    g.addColorStop(1, shade(base, -0.45));
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fill();
  }
  function softShadow(c, fn) {
    c.save();
    c.shadowColor = 'rgba(0,0,0,' + (colors.dark ? 0.5 : 0.22) + ')';
    c.shadowBlur = 8; c.shadowOffsetY = 3;
    fn();
    c.restore();
  }
  /** 在元件的局部座標（x 沿元件 a→b）作畫 */
  function local(c, g, fn) {
    c.save();
    c.translate(g.C[0], g.C[1]);
    c.rotate(g.ang);
    fn();
    c.restore();
  }
  function selGlow(c, g, round) {
    local(c, g, function () {
      c.strokeStyle = alpha(colors.accent, 0.45);
      c.lineWidth = 5;
      if (round) { c.beginPath(); c.arc(0, 0, g.hw + 6, 0, Math.PI * 2); c.stroke(); }
      else { roundRect(c, -g.hb - 6, -g.hw - 6, 2 * g.hb + 12, 2 * g.hw + 12, g.hw + 6); c.stroke(); }
    });
  }

  function drawResistor(c, e, g) {
    const body = mix(colors.surface, colors.equi, colors.dark ? 0.4 : 0.32);
    softShadow(c, function () {
      local(c, g, function () {
        c.fillStyle = body;
        roundRect(c, -g.hb, -g.hw, 2 * g.hb, 2 * g.hw, g.hw * 0.9); c.fill();
      });
    });
    local(c, g, function () {
      const lg = c.createLinearGradient(0, -g.hw, 0, g.hw);
      lg.addColorStop(0, shade(body, 0.5));
      lg.addColorStop(0.35, body);
      lg.addColorStop(1, shade(body, -0.32));
      c.fillStyle = lg;
      roundRect(c, -g.hb, -g.hw, 2 * g.hb, 2 * g.hw, g.hw * 0.9); c.fill();
      // 印在本體上的鋸齒（電阻符號）
      c.strokeStyle = alpha(colors.text, colors.dark ? 0.55 : 0.6);
      c.lineWidth = 1.4; c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath();
      const n = 6, x0 = -g.hb * 0.72, x1 = g.hb * 0.72, a = g.hw * 0.52;
      c.moveTo(x0 - g.hb * 0.12, 0); c.lineTo(x0, 0);
      for (let i = 0; i < n; i++) c.lineTo(x0 + (i + 0.5) * (x1 - x0) / n, (i % 2 ? 1 : -1) * a);
      c.lineTo(x1, 0); c.lineTo(x1 + g.hb * 0.12, 0);
      c.stroke();
      // 兩端金屬帽
      [-1, 1].forEach(function (sgn) {
        c.fillStyle = alpha(colors.text, 0.18);
        c.fillRect(sgn > 0 ? g.hb - 4 : -g.hb + 1, -g.hw + 1.5, 3, 2 * g.hw - 3);
      });
      // 可變電阻：斜箭頭
      if (e.kind === 'load') {
        c.strokeStyle = colors.accent; c.fillStyle = colors.accent; c.lineWidth = 1.8;
        const L0 = [-g.hb * 0.75, g.hw + 7], L1 = [g.hb * 0.6, -g.hw - 8];
        c.beginPath(); c.moveTo(L0[0], L0[1]); c.lineTo(L1[0], L1[1]); c.stroke();
        const ang = Math.atan2(L1[1] - L0[1], L1[0] - L0[0]);
        c.beginPath();
        c.moveTo(L1[0] + 2 * Math.cos(ang), L1[1] + 2 * Math.sin(ang));
        c.lineTo(L1[0] - 7 * Math.cos(ang - 0.45), L1[1] - 7 * Math.sin(ang - 0.45));
        c.lineTo(L1[0] - 7 * Math.cos(ang + 0.45), L1[1] - 7 * Math.sin(ang + 0.45));
        c.closePath(); c.fill();
      }
      // 高光
      c.strokeStyle = 'rgba(255,255,255,' + (colors.dark ? 0.18 : 0.5) + ')';
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(-g.hb + g.hw * 0.8, -g.hw + 1.5); c.lineTo(g.hb - g.hw * 0.8, -g.hw + 1.5); c.stroke();
    });
  }

  /** 燈泡的暖色光：把 --equi（琥珀色）調到最亮、保持色相 */
  function warm() {
    const c = rgbOf(colors.equi), k = 255 / Math.max(1, c[0], c[1], c[2]);
    return 'rgb(' + c.map(function (x) { return Math.round(Math.min(255, x * k)); }).join(',') + ')';
  }
  function drawBulb(c, e, g, k) {
    const s = state.sol, R = g.hw;
    const Pw = s.ok ? s.P[k] : 0;
    const b = Math.max(0, Math.min(1, Pw / P_FULL));
    const W = warm(), hot = mix(W, '#ffffff', 0.55);
    // 光暈（亮度 ∝ 功率）
    if (b > 0.002) {
      c.save();
      c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
      const Rh = R * (1.6 + 2.4 * b);
      const hg = c.createRadialGradient(g.C[0], g.C[1], R * 0.2, g.C[0], g.C[1], Rh);
      hg.addColorStop(0, alpha(hot, (colors.dark ? 0.75 : 0.6) * b));
      hg.addColorStop(0.45, alpha(W, (colors.dark ? 0.35 : 0.3) * b));
      hg.addColorStop(1, alpha(W, 0));
      c.fillStyle = hg;
      c.beginPath(); c.arc(g.C[0], g.C[1], Rh, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    // 玻璃
    softShadow(c, function () {
      c.fillStyle = colors['canvas-bg'];
      c.beginPath(); c.arc(g.C[0], g.C[1], R, 0, Math.PI * 2); c.fill();
    });
    const gl = c.createRadialGradient(g.C[0] - R * 0.35, g.C[1] - R * 0.4, R * 0.1, g.C[0], g.C[1], R);
    gl.addColorStop(0, alpha(mix(colors.surface, hot, b), 0.95));
    gl.addColorStop(0.7, alpha(mix(colors.surface, W, 0.15 + 0.6 * b), colors.dark ? 0.35 : 0.6));
    gl.addColorStop(1, alpha(mix(colors.muted, W, b), colors.dark ? 0.45 : 0.4));
    c.fillStyle = gl;
    c.beginPath(); c.arc(g.C[0], g.C[1], R, 0, Math.PI * 2); c.fill();
    // 燈絲：兩根支架＋中間的線圈
    local(c, g, function () {
      const metal = alpha(colors.text, 0.55);
      c.strokeStyle = metal; c.lineWidth = 1.2; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-R, 0); c.lineTo(-R * 0.45, R * 0.15); c.lineTo(-R * 0.4, -R * 0.15);
      c.moveTo(R, 0); c.lineTo(R * 0.45, R * 0.15); c.lineTo(R * 0.4, -R * 0.15);
      c.stroke();
      const fil = b > 0.002 ? mix(colors.muted, hot, Math.min(1, 0.35 + b)) : alpha(colors.text, 0.6);
      if (b > 0.02) {
        const cg = c.createRadialGradient(0, -R * 0.15, 0, 0, -R * 0.15, R * 0.6);
        cg.addColorStop(0, alpha(hot, 0.85 * b)); cg.addColorStop(1, alpha(hot, 0));
        c.fillStyle = cg;
        c.beginPath(); c.arc(0, -R * 0.15, R * 0.6, 0, Math.PI * 2); c.fill();
      }
      c.strokeStyle = fil; c.lineWidth = 1.3 + 0.6 * b;
      c.beginPath();
      const n = 5, x0 = -R * 0.4, x1 = R * 0.4;
      c.moveTo(x0, -R * 0.15);
      for (let i = 0; i < n; i++) {
        const xa = x0 + (i + 0.5) * (x1 - x0) / n;
        c.quadraticCurveTo(xa, -R * 0.45, x0 + (i + 1) * (x1 - x0) / n, -R * 0.15);
      }
      c.stroke();
    });
    // 外框與亮邊
    c.strokeStyle = alpha(colors.text, colors.dark ? 0.45 : 0.4);
    c.lineWidth = 1.3;
    c.beginPath(); c.arc(g.C[0], g.C[1], R, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,' + (colors.dark ? 0.35 : 0.8) + ')';
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(g.C[0], g.C[1], R - 2.5, Math.PI * 1.08, Math.PI * 1.45); c.stroke();
  }

  function drawGalv(c, e, g, k) {
    const s = state.sol, R = g.hw;
    const Ig = s.ok ? s.I[k] : 0;
    const face = colors.dark ? shade(colors.surface, 0.1) : colors.surface;
    softShadow(c, function () {
      c.fillStyle = face;
      c.beginPath(); c.arc(g.C[0], g.C[1], R, 0, Math.PI * 2); c.fill();
    });
    const fg = c.createRadialGradient(g.C[0] - R * 0.3, g.C[1] - R * 0.35, R * 0.1, g.C[0], g.C[1], R);
    fg.addColorStop(0, shade(face, 0.4)); fg.addColorStop(1, shade(face, -0.12));
    c.fillStyle = fg;
    c.beginPath(); c.arc(g.C[0], g.C[1], R, 0, Math.PI * 2); c.fill();
    // 金屬外圈
    const rim = c.createLinearGradient(g.C[0], g.C[1] - R, g.C[0], g.C[1] + R);
    rim.addColorStop(0, shade(colors.field, colors.dark ? 0.1 : 0.55));
    rim.addColorStop(1, shade(colors.field, colors.dark ? -0.4 : 0));
    c.strokeStyle = rim; c.lineWidth = 2.6;
    c.beginPath(); c.arc(g.C[0], g.C[1], R - 1.3, 0, Math.PI * 2); c.stroke();
    // 刻度（零在中央）與指針；a→b 方向的電流使指針往右偏
    const px = g.C[0], py = g.C[1] + R * 0.34, rr = R * 0.86;
    c.strokeStyle = alpha(colors.text, 0.6); c.lineWidth = 1;
    for (let i = -4; i <= 4; i++) {
      const a = -Math.PI / 2 + i * (50 / 4) * Math.PI / 180, l = i === 0 ? 0.22 : 0.12;
      c.beginPath();
      c.moveTo(px + rr * Math.cos(a), py + rr * Math.sin(a));
      c.lineTo(px + rr * (1 - l) * Math.cos(a), py + rr * (1 - l) * Math.sin(a));
      c.stroke();
    }
    const dir = g.ux >= 0 ? 1 : -1;
    const defl = Math.max(-1, Math.min(1, dir * Ig / G_FULL)) * 50 * Math.PI / 180;
    const na = -Math.PI / 2 + defl;
    c.strokeStyle = colors.pos; c.lineWidth = 1.8; c.lineCap = 'round';
    c.beginPath(); c.moveTo(px, py); c.lineTo(px + rr * 0.95 * Math.cos(na), py + rr * 0.95 * Math.sin(na)); c.stroke();
    sphere(c, px, py, 2.6, colors.field);
    c.font = '700 ' + Math.round(R * 0.36) + 'px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = alpha(colors.text, 0.5);
    c.fillText('G', px, g.C[1] + R * 0.7);
  }

  function leverAngle(e) {
    const target = e.closed ? 0 : -0.55;
    const a = state.lever[e.id];
    return a == null ? target : a;
  }
  function drawSwitch(c, e, g) {
    const metal = colors.dark ? shade(colors.field, -0.1) : shade(colors.field, 0.2);
    const a = leverAngle(e);
    const r0 = Math.max(3.5, Math.min(0.075 * L.u, 6));
    // 底座：略為浮起的絕緣板
    const base = mix(colors.surface, colors['b-em'], colors.dark ? 0.18 : 0.1);
    softShadow(c, function () {
      local(c, g, function () { c.fillStyle = base; roundRect(c, -g.hb - r0 - 4, -r0 - 4, 2 * g.hb + 2 * r0 + 8, 2 * r0 + 8, r0 + 4); c.fill(); });
    });
    local(c, g, function () {
      const lg = c.createLinearGradient(0, -r0 - 4, 0, r0 + 4);
      lg.addColorStop(0, shade(base, 0.45)); lg.addColorStop(1, shade(base, -0.15));
      c.fillStyle = lg; roundRect(c, -g.hb - r0 - 4, -r0 - 4, 2 * g.hb + 2 * r0 + 8, 2 * r0 + 8, r0 + 4); c.fill();
      c.strokeStyle = alpha(colors.text, 0.12); c.lineWidth = 1;
      roundRect(c, -g.hb - r0 - 3.5, -r0 - 3.5, 2 * g.hb + 2 * r0 + 7, 2 * r0 + 7, r0 + 3.5); c.stroke();
    });
    local(c, g, function () {
      // 撥桿：從 a 端的支點轉動
      const lx = 2 * g.hb, ex = -g.hb + lx * Math.cos(a), ey = lx * Math.sin(a);
      const w = wireW() * 0.95;
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(0,0,0,' + (colors.dark ? 0.35 : 0.14) + ')';
      c.lineWidth = w + 1.5;
      c.beginPath(); c.moveTo(-g.hb + 1, 2); c.lineTo(ex + 1, ey + 2); c.stroke();
      c.strokeStyle = shade(metal, -0.15); c.lineWidth = w;
      c.beginPath(); c.moveTo(-g.hb, 0); c.lineTo(ex, ey); c.stroke();
      c.strokeStyle = alpha(shade(metal, 0.6), 0.85); c.lineWidth = Math.max(0.9, w * 0.32);
      c.beginPath(); c.moveTo(-g.hb, -w * 0.22); c.lineTo(ex, ey - w * 0.22); c.stroke();
    });
    // 兩個接線柱
    [-g.hb, g.hb].forEach(function (sx) { const p = along(g, sx); sphere(c, p[0], p[1], r0, metal); });
    // 撥桿的握把
    local(c, g, function () {
      const lx = 2 * g.hb * 0.62;
      const hx = -g.hb + lx * Math.cos(a), hy = lx * Math.sin(a);
      c.save(); c.translate(hx, hy); c.rotate(a);
      const hgr = c.createLinearGradient(0, -4, 0, 4);
      const col = e.closed ? colors.probe : colors.pos;
      hgr.addColorStop(0, shade(col, 0.4)); hgr.addColorStop(1, shade(col, -0.25));
      c.fillStyle = hgr;
      roundRect(c, -7, -3.5, 14, 7, 3.5); c.fill();
      c.restore();
    });
  }

  function drawBattery(c, e, g) {
    const hb = g.hb, hw = g.hw;
    local(c, g, function () {
      // 虛線外框：代表「整顆電池」，裡面是理想電池與內電阻 r
      c.fillStyle = alpha(colors['b-em'], colors.dark ? 0.1 : 0.06);
      roundRect(c, -hb, -hw, 2 * hb, 2 * hw, 8); c.fill();
      c.strokeStyle = alpha(colors['b-em'], 0.55);
      c.setLineDash([5, 4]); c.lineWidth = 1.3;
      roundRect(c, -hb, -hw, 2 * hb, 2 * hw, 8); c.stroke();
      c.setLineDash([]);
      // 內部導線
      const w = Math.max(2, wireW() * 0.6);
      const xr0 = -hb * 0.85, xr1 = -hb * 0.15, xc0 = hb * 0.05, xc1 = hb * 0.8;
      c.strokeStyle = colors.dark ? shade(colors.field, -0.2) : shade(colors.field, 0.15);
      c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(-hb, 0); c.lineTo(xr0, 0);
      c.moveTo(xr1, 0); c.lineTo(xc0, 0);
      c.moveTo(xc1, 0); c.lineTo(hb, 0);
      c.stroke();
      // 內電阻 r（鋸齒）；r = 0 時畫成直線
      c.beginPath();
      if (e.r > 0) {
        const n = 6, a = hw * 0.32;
        c.moveTo(xr0, 0);
        for (let i = 0; i < n; i++) c.lineTo(xr0 + (i + 0.5) * (xr1 - xr0) / n, (i % 2 ? 1 : -1) * a);
        c.lineTo(xr1, 0);
        c.lineWidth = 1.6;
        c.strokeStyle = alpha(colors.text, 0.75);
      } else { c.moveTo(xr0, 0); c.lineTo(xr1, 0); }
      c.stroke();
      // 兩節電池：長而細的是正極、短而粗的是負極（由 − 往 + 排列）
      const plates = [];
      const step = (xc1 - xc0) / 4;
      for (let i = 0; i < 2; i++) {
        plates.push({ x: xc0 + step * (2 * i + 0.75), len: hw * 0.5, th: 4.5, pos: false });
        plates.push({ x: xc0 + step * (2 * i + 1.45), len: hw * 0.95, th: 2, pos: true });
      }
      // 兩節之間的連線
      c.strokeStyle = colors.dark ? shade(colors.field, -0.2) : shade(colors.field, 0.15);
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(xc0, 0); c.lineTo(plates[0].x, 0);
      c.moveTo(plates[1].x, 0); c.lineTo(plates[2].x, 0);
      c.moveTo(plates[3].x, 0); c.lineTo(xc1, 0);
      c.stroke();
      plates.forEach(function (p) {
        const col = p.pos ? colors.pos : colors.neg;
        const lg = c.createLinearGradient(p.x - p.th, 0, p.x + p.th, 0);
        lg.addColorStop(0, shade(col, 0.35)); lg.addColorStop(1, shade(col, -0.3));
        c.fillStyle = lg;
        roundRect(c, p.x - p.th / 2, -p.len, p.th, 2 * p.len, Math.min(1.5, p.th / 2)); c.fill();
      });
    });
    // 標示（不旋轉）：+、−、ε、r
    c.font = '700 ' + (L.fs + 1) + 'px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const nx = -g.uy, ny = g.ux; // 垂直方向
    const side = nx * 1 + ny * 0 >= 0 ? -1 : 1; // 標在右側（電路內部）
    const sx = function (s, off) { const p = along(g, s); return [p[0] - nx * off * side, p[1] - ny * off * side]; };
    const xc = (g.hb * 0.05 + g.hb * 0.8) / 2, xr = -g.hb * 0.5;
    let q = sx(g.hb * 0.92, hw + 9); haloText(c, '+', q[0], q[1], colors.pos);
    q = sx(-g.hb * 0.92, hw + 9); haloText(c, '−', q[0], q[1], colors.neg);
    c.font = 'italic 600 ' + (L.fs + 1) + 'px system-ui, serif';
    q = sx(xc, hw + 9); haloText(c, 'ε', q[0], q[1], colors.text);
    q = sx(xr, hw + 9); haloText(c, 'r', q[0], q[1], colors.text);
  }
  function haloText(c, text, x, y, col) {
    c.lineJoin = 'round';
    c.strokeStyle = alpha(colors['canvas-bg'], 0.9);
    c.lineWidth = 3.5;
    c.strokeText(text, x, y);
    c.fillStyle = col;
    c.fillText(text, x, y);
  }

  /** 兩行的標籤：上行名稱與電阻（淡色），下行電流（粗體） */
  function pill2(c, l1, l2, x, y, align, col2) {
    const f1 = L.fs + 'px system-ui, sans-serif', f2 = '700 ' + (L.fs + 0.5) + 'px system-ui, sans-serif';
    c.font = f1; const w1 = c.measureText(l1).width;
    c.font = f2; const m2 = c.measureText(l2 || l1), w2 = l2 ? m2.width : 0;
    const lh = (m2.fontBoundingBoxAscent > 0 ? m2.fontBoundingBoxAscent + m2.fontBoundingBoxDescent : L.fs * 1.3) * 1.02, tw = Math.max(w1, w2), pw = tw + 10, ph = (l2 ? 2 : 1) * lh + 5;
    let bx = align === 'center' ? x - pw / 2 : align === 'right' ? x - pw : x;
    bx = Math.max(3, Math.min(cw - pw - 3, bx)); // 不超出畫布
    const by = y - ph / 2;
    c.fillStyle = alpha(colors['canvas-bg'], 0.88);
    roundRect(c, bx, by, pw, ph, 6); c.fill();
    c.strokeStyle = alpha(colors.text, 0.08); c.lineWidth = 1;
    roundRect(c, bx + 0.5, by + 0.5, pw - 1, ph - 1, 6); c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = f1; c.fillStyle = colors.muted;
    c.fillText(l1, bx + pw / 2, by + 2.5 + lh / 2);
    if (l2) { c.font = f2; c.fillStyle = col2 || colors.text; c.fillText(l2, bx + pw / 2, by + 2.5 + lh * 1.5); }
    return { x: bx, y: by, w: pw, h: ph };
  }

  /** 元件旁的電流方向箭頭（傳統電流） */
  function chevron(c, g, I) {
    if (Math.abs(I) < 5e-7) return;
    const sgn = I > 0 ? 1 : -1;
    const d = g.hb + Math.max(9, 0.17 * L.u);
    const p = along(g, sgn * d);
    const ux = g.ux * sgn, uy = g.uy * sgn, nx = -uy, ny = ux, s = Math.max(4, Math.min(0.08 * L.u, 6.5));
    c.fillStyle = colors.dark ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.95)';
    c.strokeStyle = alpha(colors.text, 0.75); c.lineWidth = 1.2; c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(p[0] + ux * s, p[1] + uy * s);
    c.lineTo(p[0] - ux * s * 0.8 + nx * s * 0.85, p[1] - uy * s * 0.8 + ny * s * 0.85);
    c.lineTo(p[0] - ux * s * 0.8 - nx * s * 0.85, p[1] - uy * s * 0.8 - ny * s * 0.85);
    c.closePath(); c.fill(); c.stroke();
  }

  function labelFor(c, e, g, k) {
    const s = state.sol;
    const side = e.side || 'b';
    const off = g.hw + (e.kind === 'load' ? 14 : 8);
    let x = g.C[0], y = g.C[1], align = 'center';
    if (side === 'l') { x -= off; align = 'right'; }
    else if (side === 'r') { x += off; align = 'left'; }
    else if (side === 't') y -= off + L.fs * 1.4;
    else y += off + L.fs * 1.4;
    if (e.type === 'switch') {
      c.font = '600 ' + L.fs + 'px system-ui, sans-serif';
      c.textAlign = align === 'center' ? 'center' : align; c.textBaseline = 'middle';
      const yy = side === 'b' ? g.C[1] + g.hw + L.fs : side === 't' ? g.C[1] - g.hw - L.fs : g.C[1];
      const plate = Math.max(3.5, Math.min(0.075 * L.u, 6)) + 9;
      const xx = side === 'l' ? g.C[0] - plate : side === 'r' ? g.C[0] + plate : g.C[0];
      haloText(c, e.id, xx, yy, e.closed ? colors.muted : colors.pos);
      return;
    }
    const I = s.ok ? s.I[k] : 0;
    const l1 = e.id + '  ' + fmtR(e.R);
    const l2 = state.show.labels ? fmtI(Math.abs(I)) : '';
    // 手機上直立的元件：旁邊放不下時，標籤放在元件「上游」那段導線上（箭頭在下游，不會重疊）
    if (L.narrow && (side === 'l' || side === 'r') && Math.abs(g.uy) > 0.9) {
      const h = (l2 ? 2.7 : 1.4) * L.fs + 5;
      if (g.len / 2 - g.hb >= h + 4) {
        const up = Math.abs(I) > 5e-7 ? -Math.sign(I) : -1;
        const q = along(g, up * (g.hb + 6 + h / 2));
        pill2(c, l1, l2, q[0], q[1], 'center', e.kind === 'galv' ? colors.pos : colors.text);
        return;
      }
    }
    pill2(c, l1, l2, x, y, align, e.kind === 'galv' ? colors.pos : colors.text);
  }

  function buildOver() {
    const c = oc, s = state.sol;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    const els = state.c.elements;
    // 節點（接點）：分支點較大，其他為小接線點
    const deg = new Array(state.c.n).fill(0);
    els.forEach(function (e) { deg[e.a]++; deg[e.b]++; });
    const metal = colors.dark ? shade(colors.field, -0.1) : shade(colors.field, 0.15);
    for (let n = 0; n < state.c.n; n++) {
      const p = P(n), big = deg[n] >= 3;
      const col = potColor(s.ok ? s.V[n] : NaN, s.floating[n]);
      const r = big ? Math.max(4.5, Math.min(0.085 * L.u, 7.5)) : Math.max(3, Math.min(0.05 * L.u, 4.5));
      if (state.hover === -2 - n) { c.fillStyle = alpha(colors.probe, 0.25); c.beginPath(); c.arc(p[0], p[1], r + 7, 0, Math.PI * 2); c.fill(); }
      sphere(c, p[0], p[1], r, big ? shade(col, -0.1) : metal);
    }
    // 元件
    els.forEach(function (e, k) {
      if (e.type === 'wire') return;
      const g = geom(e);
      const round = e.kind === 'bulb' || e.kind === 'galv';
      if (k === state.sel) selGlow(c, g, round);
      else if (k === state.hover) {
        local(c, g, function () {
          c.strokeStyle = alpha(colors.accent, 0.22); c.lineWidth = 4;
          if (round) { c.beginPath(); c.arc(0, 0, g.hw + 5, 0, Math.PI * 2); c.stroke(); }
          else { roundRect(c, -g.hb - 5, -g.hw - 5, 2 * g.hb + 10, 2 * g.hw + 10, g.hw + 5); c.stroke(); }
        });
      }
      if (e.type === 'battery') drawBattery(c, e, g);
      else if (e.type === 'switch') drawSwitch(c, e, g);
      else if (e.kind === 'bulb') drawBulb(c, e, g, k);
      else if (e.kind === 'galv') drawGalv(c, e, g, k);
      else drawResistor(c, e, g);
    });
    // 電流方向箭頭與標籤
    els.forEach(function (e, k) {
      if (e.type === 'wire' || e.type === 'battery') return;
      const g = geom(e);
      if (state.show.labels && e.type === 'R' && s.ok) chevron(c, g, s.I[k]);
      labelFor(c, e, g, k);
    });
    // 電池的電流方向
    if (state.show.labels && s.ok) chevron(c, geom(els[0]), s.I[0]);
    // 負極：0 V 參考點
    const g0 = P(els[0].a);
    c.textAlign = 'center';
    c.font = '600 ' + L.fs + 'px system-ui, sans-serif';
    c.textAlign = 'left';
    haloText(c, '0 V', g0[0] + 13, g0[1] + Math.max(15, 0.26 * L.u), colors.muted);
    if (!s.ok && s.short) {
      c.font = '700 ' + (L.fs + 2) + 'px system-ui, sans-serif';
      haloText(c, T('短路！', 'Short circuit!'), cw / 2, L.oy + 2 * L.u, colors.pos);
    }
    drawMeter(c);
  }

  // ---------- 三用電表（電壓檔）與探針 ----------
  function meterBox() {
    const narrow = L.narrow, y = L.schH + 12, h = L.stripH - 18;
    const w = narrow ? Math.round(cw * 0.6) : Math.min(320, Math.round(cw * 0.38));
    return { x: 10, y: y, w: w, h: h };
  }
  function jackPos() {
    const M = meterBox(), jx = M.x + M.w - 64 / 2 - 6;
    return [[jx, M.y + M.h * 0.32], [jx, M.y + M.h * 0.72]];
  }
  function probeColor(i) { return i === 0 ? colors.pos : (colors.dark ? colors.muted : shade(colors.field, -0.1)); }
  /** 探針線：從電表插孔垂下、繞到接點（畫在電路「下面」，像放在桌上的電線） */
  function drawCables(c) {
    const jacks = jackPos();
    state.probes.forEach(function (n, i) {
      if (n == null) return;
      const p = P(n), j = jacks[i], col = probeColor(i);
      const sag = Math.max(30, Math.abs(p[1] - j[1]) * 0.35);
      const path = function () {
        c.beginPath();
        c.moveTo(j[0], j[1]);
        c.bezierCurveTo(j[0] + 26 + i * 10, j[1] + sag * 0.2, p[0] + (i ? 14 : -14), p[1] + sag, p[0], p[1] + 9);
      };
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(0,0,0,' + (colors.dark ? 0.3 : 0.1) + ')'; c.lineWidth = 4;
      c.save(); c.translate(1, 2); path(); c.stroke(); c.restore();
      c.strokeStyle = alpha(shade(col, -0.1), 0.8); c.lineWidth = 3; path(); c.stroke();
      c.strokeStyle = alpha(shade(col, 0.5), 0.6); c.lineWidth = 1;
      c.save(); c.translate(-0.6, -0.8); path(); c.stroke(); c.restore();
    });
  }
  /** 依寬度縮小字級，讓文字放得下 */
  function fitFont(c, text, weight, size, family, maxW) {
    let f = size;
    c.font = weight + f + 'px ' + family;
    while (f > 7 && c.measureText(text).width > maxW) { f -= 0.5; c.font = weight + f + 'px ' + family; }
  }
  function drawMeter(c) {
    const M = meterBox(), s = state.sol;
    const body = colors.dark ? shade(colors.surface, 0.1) : shade(colors.field, 0.08);
    softShadow(c, function () { c.fillStyle = body; roundRect(c, M.x, M.y, M.w, M.h, 10); c.fill(); });
    const bgd = c.createLinearGradient(0, M.y, 0, M.y + M.h);
    bgd.addColorStop(0, shade(body, 0.18)); bgd.addColorStop(1, shade(body, -0.2));
    c.fillStyle = bgd; roundRect(c, M.x, M.y, M.w, M.h, 10); c.fill();
    // 液晶顯示
    const jackW = 64;
    const lx = M.x + 8, ly = M.y + 7, lw = M.w - 16 - jackW, lh = M.h - 14;
    const lcdBg = colors.dark ? mix(colors['canvas-bg'], colors.probe, 0.12) : mix('#ffffff', colors.probe, 0.12);
    c.fillStyle = lcdBg; roundRect(c, lx, ly, lw, lh, 6); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1; roundRect(c, lx + 0.5, ly + 0.5, lw - 1, lh - 1, 6); c.stroke();
    const dV = probeDV();
    const lcdText = colors.dark ? shade(colors.probe, 0.3) : shade(colors.probe, -0.45);
    c.textAlign = 'left'; c.textBaseline = 'middle';
    const t1 = T('電壓表（紅 − 黑）', 'Voltmeter (red − black)');
    fitFont(c, t1, '', L.fs - 0.5, 'system-ui, sans-serif', lw - 16);
    c.fillStyle = alpha(lcdText, 0.8);
    c.fillText(t1, lx + 8, ly + lh * 0.27);
    const both = state.probes[0] != null && state.probes[1] != null;
    if (both) {
      const t3 = isFinite(dV) ? fmtV(dV) : T('— 沒有定義', '— undefined');
      fitFont(c, t3, '700 ', L.narrow ? 17 : 20, 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', lw - 16);
      c.fillStyle = lcdText;
      c.fillText(t3, lx + 8, ly + lh * 0.68);
    } else {
      const t2 = state.probes[0] == null ? T('點一個接點放紅探針', 'Tap a junction (red)') : T('再點一個接點放黑探針', 'Tap another (black)');
      fitFont(c, t2, '', L.fs, 'system-ui, sans-serif', lw - 16);
      c.fillStyle = alpha(lcdText, 0.85);
      c.fillText(t2, lx + 8, ly + lh * 0.68);
    }
    // 插孔
    const jp = jackPos(), jx = jp[0][0];
    const jacks = [[jx, jp[0][1], colors.pos], [jx, jp[1][1], colors.dark ? colors.muted : shade(colors.field, -0.2)]];
    jacks.forEach(function (j) {
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(j[0], j[1], 7, 0, Math.PI * 2); c.fill();
      sphere(c, j[0], j[1], 5, j[2]);
    });
    c.font = '600 ' + (L.fs - 2) + 'px system-ui, sans-serif';
    c.textAlign = 'right'; c.fillStyle = alpha(colors.dark ? colors.text : '#ffffff', 0.75);
    c.fillText('+', jx - 10, jacks[0][1]); c.fillText('COM', jx - 10, jacks[1][1]);
    // 探針線在電表面板上的一段（其餘畫在電路下面）
    c.save(); roundRect(c, M.x, M.y, M.w, M.h, 10); c.clip(); drawCables(c); c.restore();
    jacks.forEach(function (j) { sphere(c, j[0], j[1], 5, j[2]); });
    // 探針頭
    state.probes.forEach(function (n, i) {
      if (n == null) return;
      const p = P(n), col = probeColor(i);
      c.fillStyle = alpha(col, 0.25); c.beginPath(); c.arc(p[0], p[1], 11, 0, Math.PI * 2); c.fill();
      c.strokeStyle = col; c.lineWidth = 2.2;
      c.beginPath(); c.arc(p[0], p[1], 8.5, 0, Math.PI * 2); c.stroke();
      sphere(c, p[0], p[1] + 9, 3.5, col);
    });
    // 電位色條
    if (state.show.pot) {
      const bx0 = M.x + M.w + 14, bx1 = cw - 14;
      if (bx1 - bx0 > 70) {
        const by = M.y + M.h * 0.62, bh = 8;
        const metal = colors.dark ? shade(colors.field, -0.25) : shade(colors.field, 0.12);
        const lg = c.createLinearGradient(bx0, 0, bx1, 0);
        lg.addColorStop(0, mix(metal, colors.neg, 0.62)); lg.addColorStop(0.5, metal); lg.addColorStop(1, mix(metal, colors.pos, 0.62));
        c.fillStyle = lg; roundRect(c, bx0, by - bh / 2, bx1 - bx0, bh, bh / 2); c.fill();
        c.font = (L.fs - 0.5) + 'px system-ui, sans-serif';
        c.fillStyle = colors.muted; c.textBaseline = 'middle';
        c.textAlign = 'left'; c.fillText(T('電位', 'Potential'), bx0, M.y + M.h * 0.22);
        c.textBaseline = 'top';
        c.fillText('0 V', bx0, by + bh / 2 + 3);
        c.textAlign = 'right'; c.fillText(fmtV(emf()), bx1, by + bh / 2 + 3);
      }
    }
  }

  // ======================= 電荷（每幀） =======================
  function carrierSprite(col) {
    const key = col;
    if (sprites[key]) return sprites[key];
    const r = Math.max(2.3, Math.min(0.05 * L.u, 4.3));
    const S = Math.ceil((r + 3) * 2 * dpr);
    const cvs = document.createElement('canvas'); cvs.width = cvs.height = S;
    const c = cvs.getContext('2d');
    c.scale(dpr, dpr);
    const m = S / dpr / 2;
    // 一圈底色的描邊，讓電荷在任何顏色的導線上都看得清楚
    c.fillStyle = alpha(colors['canvas-bg'], colors.dark ? 0.85 : 0.95);
    c.beginPath(); c.arc(m, m, r + 1.3, 0, Math.PI * 2); c.fill();
    sphere(c, m, m, r, colors.dark ? shade(col, 0.15) : col);
    sprites[key] = { cvs: cvs, half: m };
    return sprites[key];
  }
  function carrierSegments(e, g) {
    // 開關斷開時只有兩端的引線有電荷（撥桿不連通）
    if (e.type === 'switch' && !e.closed) return [[-g.len / 2, -g.hb], [g.hb, g.len / 2]];
    return [[-g.len / 2, g.len / 2]];
  }
  function drawCarriers() {
    const s = state.sol, sp = Math.max(14, 0.36 * L.u);
    const col = state.electrons ? colors.neg : colors.pos;
    const spr = carrierSprite(col);
    state.c.elements.forEach(function (e, k) {
      const g = geom(e);
      const moving = s.ok && Math.abs(s.I[k]) > 5e-7;
      ctx.globalAlpha = moving ? 0.95 : 0.35;
      const off = ((state.offs[k] % sp) + sp) % sp;
      carrierSegments(e, g).forEach(function (seg) {
        // 以元件中心為原點，沿 a→b；電荷位置 = off + j·sp，對齊全域格點避免兩段之間跳動
        const start = Math.ceil((seg[0] - off) / sp);
        for (let j = start; ; j++) {
          const x = off + j * sp;
          if (x > seg[1]) break;
          if (x < seg[0]) continue;
          const p = along(g, x);
          ctx.drawImage(spr.cvs, p[0] - spr.half, p[1] - spr.half, spr.half * 2, spr.half * 2);
        }
      });
    });
    ctx.globalAlpha = 1;
  }

  // ======================= 畫面 =======================
  function rebuild() {
    if (!L || !state.c) return;
    buildUnder();
    buildOver();
    requestDraw();
    drawGraph();
    updateReadout();
  }
  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }
  function draw() {
    if (!L) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(bg, 0, 0);
    ctx.drawImage(under, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCarriers();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(over, 0, 0);
  }

  // ---------- 輸出功率 P 與負載 R 的關係圖（電池內電阻電路） ----------
  let gw = 300, gh = 200;
  function resizeGraph() {
    if (pr.hidden) return;
    const w = pr.clientWidth; if (!w) return;
    gw = w; gh = L && L.narrow ? 190 : 220;
    pr.style.height = gh + 'px';
    pr.width = Math.round(gw * dpr); pr.height = Math.round(gh * dpr);
    drawGraph();
  }
  function drawGraph() {
    if (!L || pr.hidden || !state.c || state.preset !== 'internal') return;
    const c = pctx, E = state.c.elements[0], k = elId('R'), R = state.c.elements[k].R;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, gw, gh);
    const base = colors['canvas-bg'];
    const gg = c.createLinearGradient(0, 0, 0, gh);
    gg.addColorStop(0, base); gg.addColorStop(1, shade(base, colors.dark ? -0.35 : -0.05));
    c.fillStyle = gg; roundRect(c, 0, 0, gw, gh, 8); c.fill();
    const narrow = gw < 420;
    const m = { l: narrow ? 44 : 52, r: narrow ? 40 : 48, t: 28, b: 34 };
    const W = gw - m.l - m.r, H = gh - m.t - m.b;
    const lx = function (Rv) { return m.l + W * Math.log(Rv / R_MIN) / Math.log(R_MAX / R_MIN); };
    let pmax = 0;
    for (let i = 0; i <= 200; i++) pmax = Math.max(pmax, K.loadPower(E.emf, E.r, R_MIN * Math.pow(R_MAX / R_MIN, i / 200)));
    const top = niceTop(pmax * 1.08);
    const ly = function (Pv) { return m.t + H * (1 - Pv / top); };
    // 格線
    c.lineWidth = 1;
    c.font = (L.fs - 0.5) + 'px system-ui, sans-serif';
    c.fillStyle = colors.muted;
    [0.5, 1, 2, 5, 10, 20, 50, 100].forEach(function (v) {
      const x = Math.round(lx(v)) + 0.5;
      c.strokeStyle = alpha(colors.text, 0.08);
      c.beginPath(); c.moveTo(x, m.t); c.lineTo(x, m.t + H); c.stroke();
      c.textAlign = 'center'; c.textBaseline = 'top';
      c.fillText(String(v), x, m.t + H + 4);
    });
    for (let i = 0; i <= 4; i++) {
      const Pv = top * i / 4, y = Math.round(ly(Pv)) + 0.5;
      c.strokeStyle = alpha(colors.text, i === 0 ? 0.25 : 0.08);
      c.beginPath(); c.moveTo(m.l, y); c.lineTo(m.l + W, y); c.stroke();
      c.textAlign = 'right'; c.textBaseline = 'middle';
      c.fillText(trim(num(Pv, top < 4 ? 2 : 1)), m.l - 5, y);
      c.textAlign = 'left';
      c.fillText((25 * i) + '%', m.l + W + 5, y);
    }
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left'; c.fillStyle = colors.text; c.font = '600 ' + (L.fs) + 'px system-ui, sans-serif';
    c.fillText(T('輸出功率 P (W)', 'Output power P (W)'), 8, 17);
    c.textAlign = 'right'; c.fillStyle = colors.accent;
    c.fillText(T('效率 η', 'Efficiency η'), gw - 8, 17);
    c.fillStyle = colors.muted; c.font = (L.fs - 0.5) + 'px system-ui, sans-serif';
    c.fillText(T('負載電阻 R (Ω，對數刻度)', 'Load R (Ω, log scale)'), m.l + W, gh - 4);
    // 效率曲線 η = R/(R + r)
    c.save(); c.beginPath(); c.rect(m.l, m.t - 2, W, H + 4); c.clip();
    c.strokeStyle = alpha(colors.accent, 0.8); c.lineWidth = 1.6; c.setLineDash([5, 4]);
    c.beginPath();
    for (let i = 0; i <= 200; i++) {
      const Rv = R_MIN * Math.pow(R_MAX / R_MIN, i / 200), eta = Rv / (Rv + E.r);
      const x = lx(Rv), y = m.t + H * (1 - eta);
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.stroke(); c.setLineDash([]);
    // R = r：最大功率
    if (E.r >= R_MIN) {
      const x = lx(E.r);
      c.strokeStyle = alpha(colors.text, 0.35); c.lineWidth = 1; c.setLineDash([3, 4]);
      c.beginPath(); c.moveTo(x, m.t); c.lineTo(x, m.t + H); c.stroke(); c.setLineDash([]);
    }
    // 功率曲線（管狀）
    const pts = [];
    for (let i = 0; i <= 240; i++) {
      const Rv = R_MIN * Math.pow(R_MAX / R_MIN, i / 240);
      pts.push([lx(Rv), ly(K.loadPower(E.emf, E.r, Rv))]);
    }
    const fill = c.createLinearGradient(0, m.t, 0, m.t + H);
    fill.addColorStop(0, alpha(colors['b-em'], 0.22)); fill.addColorStop(1, alpha(colors['b-em'], 0));
    c.fillStyle = fill;
    c.beginPath(); c.moveTo(pts[0][0], m.t + H);
    pts.forEach(function (p) { c.lineTo(p[0], p[1]); });
    c.lineTo(pts[pts.length - 1][0], m.t + H); c.closePath(); c.fill();
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = colors['b-em']; c.lineWidth = 2.6;
    c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.stroke();
    c.restore();
    if (E.r >= R_MIN) {
      c.font = (L.fs - 0.5) + 'px system-ui, sans-serif'; c.fillStyle = colors.muted; c.textAlign = 'center';
      c.textBaseline = 'top';
      haloText(c, 'R = r', lx(E.r), m.t + 2, colors.muted);
    }
    // 目前的負載
    const on = state.c.elements.every(function (e) { return e.type !== 'switch' || e.closed; });
    const Pnow = K.loadPower(E.emf, E.r, R), x0 = lx(R), y0 = ly(Pnow);
    c.globalAlpha = on ? 1 : 0.45;
    const halo = c.createRadialGradient(x0, y0, 0, x0, y0, 14);
    halo.addColorStop(0, alpha(colors.pos, 0.35)); halo.addColorStop(1, alpha(colors.pos, 0));
    c.fillStyle = halo; c.beginPath(); c.arc(x0, y0, 14, 0, Math.PI * 2); c.fill();
    sphere(c, x0, y0, 5.5, colors.pos);
    c.font = '600 ' + L.fs + 'px system-ui, sans-serif';
    c.textAlign = x0 > m.l + W * 0.6 ? 'right' : 'left'; c.textBaseline = 'middle';
    haloText(c, 'P = ' + fmtP(Pnow) + (on ? '' : T('（開關斷開）', ' (switch open)')), x0 + (c.textAlign === 'right' ? -10 : 10), Math.max(m.t + 8, y0 - 12), colors.text);
    c.globalAlpha = 1;
  }
  function niceTop(v) {
    if (!(v > 0) || !isFinite(v)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  }

  // ======================= 讀數 =======================
  const lastHTML = {};
  function setHTML(id, html) { if (lastHTML[id] === html) return; lastHTML[id] = html; $(id).innerHTML = html; }
  function updateReadout() {
    const s = state.sol, b = state.rep, E = state.c.elements[0];
    if (!s.ok) {
      ['dReq', 'dI', 'dV', 'dPe', 'dPi', 'dPo', 'dEta'].forEach(function (id) { setHTML(id, '—'); });
      setHTML('dI', T('∞（短路）', '∞ (short circuit)'));
    } else {
      setHTML('dReq', isFinite(b.Req) ? fmtR(b.Req) : T('∞（斷路）', '∞ (open circuit)'));
      setHTML('dI', fmtI(b.I));
      setHTML('dV', fmtV(b.Vt) + '<small>ε = ' + fmtV(E.emf) + '，Ir = ' + fmtV(b.I * E.r) + '</small>');
      setHTML('dPe', fmtP(b.Pemf));
      setHTML('dPi', fmtP(b.Pint));
      setHTML('dPo', fmtP(b.Pout) + '<small>= ΣI<sup>2</sup>R</small>');
      setHTML('dEta', b.Pemf > 1e-12 ? num(b.eta * 100, 1) + '%' : T('—（沒有電流）', '— (no current)'));
    }
    const p = state.probes, dV = probeDV();
    if (p[0] == null || p[1] == null) setHTML('dProbe', T('—（點兩個接點）', '— (tap two junctions)'));
    else if (!isFinite(dV)) setHTML('dProbe', T('—（有一端與電池斷開）', '— (a probe is cut off from the battery)'));
    else setHTML('dProbe', fmtV(dV) + '<small>V<sub>' + T('紅', 'red') + '</sub> = ' + fmtV(s.V[p[0]]) + '，V<sub>' + T('黑', 'black') + '</sub> = ' + fmtV(s.V[p[1]]) + '</small>');
    // 各元件表
    let rows = '', sum = 0;
    state.c.elements.forEach(function (e, k) {
      if (e.type !== 'R') return;
      const I = s.ok ? s.I[k] : NaN, V = s.ok ? s.Vab[k] : NaN, Pw = s.ok ? s.P[k] : NaN;
      sum += Pw;
      rows += '<tr' + (k === state.sel ? ' class="sel"' : '') + '><td title="' + kindName(e) + '">' + e.id + '</td><td>' + trim(num(e.R, 2)) +
        '</td><td>' + num(Math.abs(I), Math.abs(I) < 0.1 ? 4 : 3) + '</td><td>' + num(Math.abs(V), 2) + '</td><td>' + num(Pw, Pw < 0.1 ? 4 : 3) + '</td></tr>';
    });
    if (s.ok) {
      rows += '<tr><td>' + T('內電阻 r', 'Internal r') + '</td><td>' + trim(num(E.r, 2)) + '</td><td>' + num(Math.abs(b.I), Math.abs(b.I) < 0.1 ? 4 : 3) +
        '</td><td>' + num(Math.abs(b.I * E.r), 2) + '</td><td>' + num(b.Pint, b.Pint < 0.1 ? 4 : 3) + '</td></tr>';
      rows += '<tr class="total"><td>' + T('合計', 'Total') + '</td><td></td><td></td><td></td><td>' + num(sum + b.Pint, 3) + '</td></tr>';
      rows += '<tr class="total"><td colspan="4">' + T('電池供給 εI', 'Battery supplies εI') + '</td><td>' + num(b.Pemf, 3) + '</td></tr>';
    }
    setHTML('partsBody', rows);
  }

  // ======================= 介面 =======================
  const elEmf = $('emf'), elRin = $('rin'), elSel = $('rsel');
  if (window.LabNum) {
    window.LabNum.register(elSel, {
      toValue: function (pos) {
        const v = R_MIN * Math.pow(R_MAX / R_MIN, pos / 1000);
        return v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
      },
      toPos: function (v) { return Math.round(1000 * Math.log(v / R_MIN) / Math.log(R_MAX / R_MIN)); },
      min: R_MIN, max: R_MAX, decimals: 2
    });
  }
  let quiet = false; // 程式設定滑桿時不算使用者操作
  function setSlider(el, v) {
    quiet = true;
    if (window.LabNum) window.LabNum.set(el, v); else el.value = v;
    quiet = false;
  }
  function selected() { return state.sel >= 0 ? state.c.elements[state.sel] : null; }

  function renderChips() {
    const box = $('chips');
    box.innerHTML = '';
    state.c.elements.forEach(function (e, k) {
      if (e.type !== 'R' && e.type !== 'switch') return;
      const b = document.createElement('button');
      b.type = 'button';
      if (e.type === 'switch') {
        b.className = 'sw ' + (e.closed ? 'on' : 'off');
        b.textContent = e.id + (e.closed ? T('：接通', ': closed') : T('：斷開', ': open'));
        b.setAttribute('aria-pressed', String(!e.closed));
        b.setAttribute('aria-label', kindName(e) + ' ' + e.id + (e.closed ? T('，接通（按一下斷開）', ', closed (press to open)') : T('，斷開（按一下接通）', ', open (press to close)')));
        b.addEventListener('click', function () { toggleSwitch(k); });
      } else {
        b.textContent = e.id;
        b.title = kindName(e) + ' ' + e.id;
        b.setAttribute('aria-pressed', String(k === state.sel));
        b.addEventListener('click', function () { select(k); });
      }
      box.appendChild(b);
    });
  }
  function refreshSelUI() {
    const e = selected();
    $('rBox').hidden = !e;
    if (!e) return;
    $('rselLabel').innerHTML = T('選取：', 'Selected: ') + '<span class="selname">' + kindName(e) + ' ' + e.id + '</span>';
    setSlider(elSel, e.R);
    showOut(elSel, 'Ω');
  }
  function showOut(el, unit) { $(el.id + 'o').textContent = fmtSlider(val(el), el) + ' ' + unit; }
  function refreshBatteryUI() {
    const E = state.c.elements[0];
    setSlider(elEmf, E.emf); setSlider(elRin, E.r);
    showOut(elEmf, 'V'); showOut(elRin, 'Ω');
  }

  function select(k) {
    if (k === state.sel) return;
    state.sel = k;
    renderChips();
    refreshSelUI();
    rebuild();
  }

  // ---------- 改變電路 ----------
  function changed(action, prevI) {
    solve();
    rebuild();
    updateHum();
    if (action) emitMission(action, prevI);
  }
  function currentI() { return state.rep ? state.rep.I : NaN; }

  function toggleSwitch(k) {
    const e = state.c.elements[k];
    const prevI = currentI();
    const from = leverAngle(e);
    e.closed = !e.closed;
    animateLever(e, from);
    clickSound(e.closed);
    renderChips();
    changed('switch', prevI);
    const b = state.rep;
    setStatus(e.closed ? T(e.id + ' 接通。', e.id + ' closed.') :
      (b && Math.abs(b.I) < 5e-7 ? T(e.id + ' 斷開：電路斷了，所有電流都停止。', e.id + ' open: the circuit is broken and all currents stop.')
        : T(e.id + ' 斷開：這條支路沒有電流，其他支路的電流重新分配。', e.id + ' open: no current in this branch; the other currents redistribute.')));
  }
  function animateLever(e, from) {
    const to = e.closed ? 0 : -0.55;
    if (reducedMotion) { delete state.lever[e.id]; return; }
    const t0 = performance.now(), dur = 180;
    function step(now) {
      const u = Math.min(1, (now - t0) / dur), ease = 1 - Math.pow(1 - u, 3);
      state.lever[e.id] = from + (to - from) * ease;
      buildOver(); requestDraw();
      if (u < 1) requestAnimationFrame(step); else delete state.lever[e.id];
    }
    requestAnimationFrame(step);
  }

  function setPreset(name, count) {
    loadPreset(name, count);
    document.querySelectorAll('[data-preset]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.preset === name)); });
    $('countBox').hidden = !(name === 'series' || name === 'parallel');
    $('count2').setAttribute('aria-pressed', String(state.count === 2));
    $('count3').setAttribute('aria-pressed', String(state.count === 3));
    $('pr').hidden = name !== 'internal';
    renderChips();
    refreshBatteryUI();
    refreshSelUI();
    resizeGraph();
    rebuild();
    updateHum();
    setStatus(presetHint(name));
  }
  function presetHint(name) {
    return {
      single: T('改變 R、ε 或 r，看電流 I = ε/(R + r) 怎麼變。', 'Change R, ε or r and see how the current I = ε/(R + r) changes.'),
      series: T('串聯：每個燈泡的電流相同，電壓依電阻比例分配。', 'Series: every bulb carries the same current; the voltage is shared in proportion to resistance.'),
      parallel: T('並聯：每個支路的電壓相同，電流相加。試著斷開某一個支路。', 'Parallel: every branch has the same voltage and the currents add up. Try opening one branch.'),
      mixed: T('L1 的電流 = L2 的電流 + L3 的電流（克希何夫電流定律）。', 'Current in L1 = current in L2 + current in L3 (Kirchhoff’s current law).'),
      internal: T('探針夾在電池兩極，量的是端電壓 V = ε − Ir。改變負載 R 看下方的功率圖。', 'The probes are on the battery terminals, so the meter shows the terminal voltage V = ε − Ir. Change the load R and watch the power graph below.'),
      wheatstone: T('調整電阻讓檢流計 G 的指針歸零：R1/R2 = R3/Rx。', 'Adjust the resistors until the galvanometer G reads zero: R1/R2 = R3/Rx.')
    }[name];
  }
  function setStatus(msg) { $('status').textContent = msg || ''; }

  document.querySelectorAll('[data-preset]').forEach(function (b) {
    b.addEventListener('click', function () {
      setPreset(b.dataset.preset, state.count);
      emitMission('preset', NaN);
    });
  });
  [2, 3].forEach(function (n) {
    $('count' + n).addEventListener('click', function () {
      if (state.count === n) return;
      setPreset(state.preset, n);
      emitMission('count', NaN);
    });
  });

  // 滑桿：input 即時更新畫面；change（放開滑桿或輸入完成）才算一次操作（任務判定用）
  let dragPrevI = NaN;
  function sliderInput(el, apply) {
    el.addEventListener('pointerdown', function () { dragPrevI = currentI(); });
    el.addEventListener('input', function () {
      if (quiet) return;
      if (!isFinite(dragPrevI)) dragPrevI = currentI();
      apply(val(el));
      changed(null);
    });
    el.addEventListener('change', function () {
      if (quiet) return;
      apply(val(el));
      changed(el === elSel ? 'R' : el === elEmf ? 'emf' : 'r', dragPrevI);
      dragPrevI = NaN;
    });
  }
  sliderInput(elEmf, function (v) { state.c.elements[0].emf = v; showOut(elEmf, 'V'); });
  sliderInput(elRin, function (v) { state.c.elements[0].r = v; showOut(elRin, 'Ω'); });
  sliderInput(elSel, function (v) {
    const e = selected(); if (!e) return;
    e.R = v; showOut(elSel, 'Ω');
  });

  $('showLabels').addEventListener('change', function (ev) { state.show.labels = ev.target.checked; rebuild(); });
  $('showPot').addEventListener('change', function (ev) { state.show.pot = ev.target.checked; rebuild(); });
  $('electrons').addEventListener('change', function (ev) {
    state.electrons = ev.target.checked;
    $('lgCarrier').innerHTML = state.electrons
      ? '<i class="dot" style="background:var(--neg)"></i>' + T('移動的電子（與電流方向相反）', 'Moving electrons (opposite to the current)')
      : '<i class="dot" style="background:var(--pos)"></i>' + T('移動的電荷（傳統電流方向）', 'Moving charge (conventional current)');
    requestDraw();
  });
  $('hum').addEventListener('change', function (ev) { state.hum = ev.target.checked; updateHum(); });

  $('clearProbe').addEventListener('click', function () {
    state.probes = [null, null];
    rebuild();
    setStatus(T('探針已移除。點兩個接點重新量測。', 'Probes removed. Tap two junctions to measure again.'));
  });

  $('play').addEventListener('click', function () {
    state.running = !state.running;
    updatePlay();
    if (state.running) startLoop();
  });
  function updatePlay() {
    const b = $('play');
    b.removeAttribute('data-en'); // 文字由程式決定（避免語言切換時被靜態英文覆蓋）
    b.textContent = state.running ? T('暫停', 'Pause') : T('播放', 'Play');
  }

  // ---------- 點擊畫布 ----------
  function hitTest(x, y) {
    if (!L) return null;
    const rN = Math.max(13, 0.2 * L.u);
    let best = null, bd = rN;
    for (let n = 0; n < state.c.n; n++) {
      const p = P(n), d = Math.hypot(p[0] - x, p[1] - y);
      if (d < bd) { bd = d; best = { node: n }; }
    }
    if (best) return best;
    for (let k = 0; k < state.c.elements.length; k++) {
      const e = state.c.elements[k];
      if (e.type === 'wire') continue;
      const g = geom(e), dx = x - g.C[0], dy = y - g.C[1];
      const a = dx * g.ux + dy * g.uy, pp = -dx * g.uy + dy * g.ux;
      let hit = false;
      if (e.kind === 'bulb' || e.kind === 'galv') hit = Math.hypot(dx, dy) <= g.hw + 8;
      else if (e.type === 'switch') hit = Math.abs(a) <= g.hb + 6 && pp <= 10 && pp >= -Math.max(0.55 * g.hb * 2 * 0.55, 18);
      else hit = Math.abs(a) <= g.hb + 6 && Math.abs(pp) <= Math.max(g.hw + 6, 16);
      if (hit) return { el: k };
    }
    return null;
  }
  function pos(ev) { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  cv.addEventListener('click', function (ev) {
    const p = pos(ev), h = hitTest(p[0], p[1]);
    if (!h) return;
    if (h.node != null) placeProbe(h.node);
    else {
      const e = state.c.elements[h.el];
      if (e.type === 'switch') toggleSwitch(h.el);
      else if (e.type === 'R') select(h.el);
      else if (e.type === 'battery') setStatus(T('電池：用右側的滑桿調整電動勢 ε 與內電阻 r。', 'Battery: use the sliders on the right to set the EMF ε and internal resistance r.'));
    }
  });
  cv.addEventListener('pointermove', function (ev) {
    if (ev.pointerType !== 'mouse') return;
    const p = pos(ev), h = hitTest(p[0], p[1]);
    const hv = !h ? -1 : h.node != null ? -2 - h.node : (state.c.elements[h.el].type === 'battery' ? -1 : h.el);
    cv.style.cursor = hv === -1 ? 'default' : 'pointer';
    if (hv !== state.hover) { state.hover = hv; buildOver(); requestDraw(); }
  });
  cv.addEventListener('pointerleave', function () { if (state.hover !== -1) { state.hover = -1; buildOver(); requestDraw(); } });

  function placeProbe(n) {
    const p = state.probes;
    if (p[0] == null || (p[0] != null && p[1] != null)) { state.probes = [n, null]; }
    else if (n === p[0]) return;
    else state.probes = [p[0], n];
    probeSound(state.probes[1] == null ? 0 : 1);
    rebuild();
    if (state.probes[1] == null) setStatus(T('紅色探針（＋）已放好，再點一個接點放黑色探針（COM）。', 'Red probe (+) placed. Tap another junction for the black probe (COM).'));
    else {
      const dV = probeDV();
      setStatus(isFinite(dV) ? T('電壓表讀數 ', 'Voltmeter reads ') + fmtV(dV) + T('（紅 − 黑）。', ' (red − black).') : T('有一支探針接在與電池斷開的部分，電位差沒有定義。', 'One probe is on a part cut off from the battery, so the potential difference is undefined.'));
      emitMission('probe', currentI());
    }
  }

  // ======================= 音效 =======================
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  /** 開關的「喀」聲：接通時較亮、斷開時較低 */
  function clickSound(closed) {
    const S = sound(); if (!S) return;
    S.noise({ dur: 0.018, gain: 0.5, filter: closed ? 3600 : 2400, q: 1.4 });
    S.tone({ freq: closed ? 1500 : 950, dur: 0.03, type: 'triangle', gain: 0.22 });
  }
  /** 放探針的輕「嗒」 */
  function probeSound(i) {
    const S = sound(); if (!S) return;
    S.tone({ freq: i ? 1046 : 1318, dur: 0.05, type: 'sine', gain: 0.18 });
  }
  /** 功率嗡嗡聲：固定音高（主要能量在 300 Hz 以上），音量隨電池總功率變大 */
  let humVoice = null;
  function updateHum() {
    const S = sound();
    const P = state.rep && isFinite(state.rep.Pemf) ? state.rep.Pemf : 0;
    const want = !!(S && state.hum && P > 1e-4 && document.visibilityState !== 'hidden');
    if (!want) { if (humVoice) { humVoice.stop(0.2); humVoice = null; } return; }
    const gain = 0.012 + 0.09 * Math.min(1, P / 30);
    if (!humVoice || !humVoice.playing) humVoice = S.voice({ freq: 330, type: 'triangle', gain: gain });
    else humVoice.set({ gain: gain }, 0.12);
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
    updateHum();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') { updateSoundButton(); if (!ev.detail.value) humVoice = null; updateHum(); }
  });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') humVoice = null; else updateHum(); });

  // ======================= 任務模式 =======================
  function emitMission(action, prevI) {
    if (!window.LabMission || !state.sol) return;
    const s = state.sol, b = state.rep || {}, E = state.c.elements[0];
    const parts = {};
    state.c.elements.forEach(function (e, k) {
      if (e.type === 'R') parts[e.id] = { kind: e.kind, R: e.R, I: s.ok ? Math.abs(s.I[k]) : NaN, Isigned: s.ok ? s.I[k] : NaN, V: s.ok ? Math.abs(s.Vab[k]) : NaN, P: s.ok ? s.P[k] : NaN };
      else if (e.type === 'switch') parts[e.id] = { kind: 'switch', closed: e.closed };
    });
    const gk = elId('G');
    let probe = null;
    if (state.probes[0] != null && state.probes[1] != null) {
      const across = probeAcross();
      probe = {
        a: state.probes[0], b: state.probes[1], dV: probeDV(), across: across,
        openSwitch: across.some(function (id) { const e = state.c.elements[elId(id)]; return e.type === 'switch' && !e.closed; })
      };
    }
    window.LabMission.emit('circuit', {
      action: action, preset: state.preset, count: state.count,
      emf: E.emf, r: E.r, ok: s.ok,
      I: b.I, Vt: b.Vt, Req: b.Req, Pemf: b.Pemf, Pint: b.Pint, Pout: b.Pout, eta: b.eta,
      prevI: prevI, Ig: gk >= 0 && s.ok ? s.I[gk] : null,
      allClosed: state.c.elements.every(function (e) { return e.type !== 'switch' || e.closed; }),
      parts: parts, probe: probe
    });
  }

  // ======================= 動畫 =======================
  let lastT = 0, loopOn = false;
  function tick(now) {
    if (!state.running) { loopOn = false; return; }
    const dt = Math.min((now - lastT) / 1000, 1 / 30);
    lastT = now;
    const s = state.sol;
    if (s && s.ok && L) {
      const sgn = state.electrons ? -1 : 1;
      state.c.elements.forEach(function (e, k) {
        const I = s.I[k];
        if (Math.abs(I) < 5e-7) return;
        const v = Math.sign(I) * Math.min(Math.abs(I) * CARRIER_SPEED, CARRIER_MAX) * L.u;
        state.offs[k] = (state.offs[k] + sgn * v * dt) % 1e6;
      });
    }
    draw();
    requestAnimationFrame(tick);
  }
  function startLoop() {
    if (loopOn) return;
    loopOn = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }

  // ======================= 啟動 =======================
  readColors();
  setPreset('single', 3);
  updatePlay();
  updateSoundButton();
  function themeChanged() { readColors(); if (L) { buildBackground(); rebuild(); } }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
  }
  window.addEventListener('resize', function () { resize(); });
  resize();
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：按「播放」讓電荷流動。', 'Reduced motion is on: press “Play” to set the charges moving.'));
  if (state.running) startLoop();
})();
