/* dc-circuit.js — 「直流電路」模組的畫面與互動（物理計算在 dc-circuit-core.js；繪圖用 js/drawkit.js 的 LabDraw） */
(function () {
  'use strict';
  const K = window.DCCircuitCore;
  const D = window.LabDraw;
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
    corners: {}              // 畫成圓角的導線轉角（純畫法）
  };

  // ---------- 色彩（lab.css 代號；drawkit 先載入，主題切換時已先更新） ----------
  let colors = {};
  const alpha = D.alpha, shade = D.shade, mix = D.mix, rgbOf = D.rgb, roundRect = D.roundRect, FONT = D.FONT;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface',
      '--pos', '--neg', '--field', '--equi', '--probe', '--b-em']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    colors.dark = D.dark;
    sprites = {};
  }
  /** 導線的顏色：電位低 → 偏藍、高 → 偏紅（淡淡的，主體仍是金屬色） */
  function potColor(V, floating) {
    const metal = colors.dark ? shade(colors.field, -0.25) : shade(colors.field, 0.12);
    if (!state.show.pot || floating || !isFinite(V)) return metal;
    const vmax = Math.max(1e-9, emf());
    const t = Math.max(0, Math.min(1, V / vmax));
    return t < 0.5 ? mix(metal, colors.neg, (0.5 - t) * 2 * 0.62) : mix(metal, colors.pos, (t - 0.5) * 2 * 0.62);
  }
  /** 亮面金屬（接線柱、刀片、插孔）：深淺色都看得出金屬光澤 */
  function chrome() { return colors.dark ? shade(colors.field, -0.12) : shade(colors.field, 0.5); }
  /** 黃銅（燈座與檢流計的接線螺絲） */
  function brass() { return colors.dark ? shade(colors.equi, -0.1) : shade(colors.equi, 0.3); }
  function shadowCol(a) { return colors.dark ? 'rgba(0,0,0,' + Math.min(1, a * 2) + ')' : alpha(colors.text, a); }

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
  pr.setAttribute('aria-label', T('輸出功率對負載電阻的關係圖', 'Graph of output power against load resistance')); // 圖畫出來時再換成含數值的說明
  let dpr = 1, cw = 300, ch = 300, L = null;
  const bg = document.createElement('canvas'), bgc = bg.getContext('2d');
  const under = document.createElement('canvas'), uc = under.getContext('2d');  // 導線、探針線
  const over = document.createElement('canvas'), oc = over.getContext('2d');    // 元件、標示、探針、電表
  let sprites = {};
  let kb = null; // 鍵盤操作（LabKeys）

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

  /** 加一個圓角矩形到目前的路徑（不 beginPath，可把好幾塊合成一個外形） */
  function rrPath(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /** 背景：中心亮、四角暗的電路板，像麵包板的點陣格；下方是放電表的桌面 */
  function buildBackground() {
    const c = bgc;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    const base = colors['canvas-bg'];
    c.save();
    roundRect(c, 0, 0, cw, L.schH, 10); c.clip();
    D.backdrop(c, cw, L.schH);
    // 點陣格：每 0.5 格一點，整數格稍明顯（像麵包板的插孔）
    const u = L.u;
    for (let i = -2; i <= 14; i++) for (let j = -2; j <= 10; j++) {
      const x = L.ox + i * u / 2, y = L.oy + j * u / 2;
      if (x < 6 || x > cw - 6 || y < 6 || y > L.schH - 6) continue;
      const major = i % 2 === 0 && j % 2 === 0;
      const sx = Math.round(x * dpr) / dpr + 0.5 / dpr, sy = Math.round(y * dpr) / dpr + 0.5 / dpr;
      if (major) { // 插孔：暗點＋右下的一點亮邊（凹下去的感覺）
        c.fillStyle = alpha(colors.dark ? '#ffffff' : colors.text, colors.dark ? 0.05 : 0.06);
        c.beginPath(); c.arc(sx + 0.6, sy + 0.6, 1.9, 0, Math.PI * 2); c.fill();
        c.fillStyle = alpha(colors.dark ? '#000000' : colors.text, colors.dark ? 0.55 : 0.17);
        c.beginPath(); c.arc(sx, sy, 1.4, 0, Math.PI * 2); c.fill();
      } else {
        c.fillStyle = alpha(colors.text, colors.dark ? 0.06 : 0.07);
        c.beginPath(); c.arc(sx, sy, 0.85, 0, Math.PI * 2); c.fill();
      }
    }
    c.restore();
    // 電表區：桌面（上亮下暗）
    c.save();
    roundRect(c, 0, L.schH + 6, cw, L.stripH - 6, 10); c.clip();
    const g = c.createLinearGradient(0, L.schH + 6, 0, ch);
    g.addColorStop(0, shade(base, colors.dark ? 0.03 : -0.01));
    g.addColorStop(1, shade(base, colors.dark ? -0.32 : -0.06));
    c.fillStyle = g;
    c.fillRect(0, L.schH + 6, cw, L.stripH - 6);
    c.restore();
    c.strokeStyle = alpha(colors.text, colors.dark ? 0.1 : 0.08);
    c.lineWidth = 1;
    roundRect(c, 0.5, 0.5, cw - 1, L.schH - 1, 10); c.stroke();
    roundRect(c, 0.5, L.schH + 6.5, cw - 1, L.stripH - 7, 10); c.stroke();
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
  function switchR0() { return Math.max(3.5, Math.min(0.075 * L.u, 6)); }

  // ---------- 導線轉角（純畫法：只有兩段導體垂直相接的接點畫成圓角；連接關係、電位、電流都不變） ----------
  /** 由接點到元件本體之間「裸露的導線」長度 */
  function freeLen(e, g) {
    if (e.type === 'wire') return g.len;
    const pad = e.type === 'switch' ? switchR0() + 6 : 2;
    return g.len / 2 - g.hb - pad;
  }
  function computeCorners() {
    const inc = [];
    for (let n = 0; n < state.c.n; n++) inc.push([]);
    state.c.elements.forEach(function (e) {
      const g = geom(e), f = freeLen(e, g);
      inc[e.a].push({ d: [g.ux, g.uy], free: f });
      inc[e.b].push({ d: [-g.ux, -g.uy], free: f });
    });
    const out = {};
    inc.forEach(function (list, n) {
      if (list.length !== 2) return;
      const a = list[0], b = list[1];
      if (Math.abs(a.d[0] * b.d[0] + a.d[1] * b.d[1]) > 0.05) return; // 一直線穿過，不是轉角
      const rho = Math.min(0.2 * L.u, 16, 0.45 * a.free, 0.45 * b.free);
      if (!(rho >= 4)) return;
      const p = P(n), k = rho * (1 - Math.SQRT1_2);
      out[n] = { N: p, a: a.d, b: b.d, rho: rho, vis: [p[0] + (a.d[0] + b.d[0]) * k, p[1] + (a.d[1] + b.d[1]) * k] };
    });
    state.corners = out;
  }
  /** 接點畫在畫面上的位置：轉角處在圓弧的中點，其餘就是格點 */
  function vis(n) { const k = state.corners[n]; return k ? k.vis : P(n); }
  /** 轉角附近的點移到圓弧上：沿方向 d 離接點 s（s < rho） */
  function onBend(k, d, s) {
    const o = (Math.abs(k.a[0] - d[0]) + Math.abs(k.a[1] - d[1]) < 1e-6) ? k.b : k.a;
    const phi = (k.rho - s) / (2 * k.rho) * Math.PI / 2;
    const cx = k.N[0] + k.rho * (k.a[0] + k.b[0]), cy = k.N[1] + k.rho * (k.a[1] + k.b[1]);
    return [cx - k.rho * (o[0] * Math.cos(phi) + d[0] * Math.sin(phi)), cy - k.rho * (o[1] * Math.cos(phi) + d[1] * Math.sin(phi))];
  }

  // ======================= 圖層：導線 =======================
  function buildUnder() {
    const c = uc, s = state.sol, w = wireW();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    computeCorners();
    drawCables(c);
    // 同一個電位（同一種顏色）的導線合成一條路徑，一次描邊：交接處不會重疊變色
    const paths = {};
    const pathOf = function (col) { return paths[col] || (paths[col] = new Path2D()); };
    const seg = function (col, nA, A, B, nB) {
      const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy);
      if (len < 0.5) return;
      const ux = dx / len, uy = dy / len;
      let a = A, b = B;
      if (nA != null && state.corners[nA]) { const r = state.corners[nA].rho; a = [A[0] + ux * r, A[1] + uy * r]; }
      if (nB != null && state.corners[nB]) { const r = state.corners[nB].rho; b = [B[0] - ux * r, B[1] - uy * r]; }
      const p = pathOf(col);
      p.moveTo(a[0], a[1]); p.lineTo(b[0], b[1]);
    };
    state.c.elements.forEach(function (e) {
      const g = geom(e);
      const ca = potColor(s.ok ? s.V[e.a] : NaN, s.floating[e.a]), cb = potColor(s.ok ? s.V[e.b] : NaN, s.floating[e.b]);
      if (e.type === 'wire') { seg(ca, e.a, g.A, g.B, e.b); return; }
      seg(ca, e.a, g.A, along(g, -g.hb), null);
      seg(cb, null, along(g, g.hb), g.B, e.b);
    });
    Object.keys(state.corners).forEach(function (n) {
      const k = state.corners[n], p = pathOf(potColor(s.ok ? s.V[n] : NaN, s.floating[n]));
      p.moveTo(k.N[0] + k.a[0] * k.rho, k.N[1] + k.a[1] * k.rho);
      p.arcTo(k.N[0], k.N[1], k.N[0] + k.b[0] * k.rho, k.N[1] + k.b[1] * k.rho, k.rho);
    });
    const cols = Object.keys(paths);
    c.lineCap = 'round'; c.lineJoin = 'round';
    // 1. 落在電路板上的影子
    c.save(); c.translate(0.8, 1.8);
    c.strokeStyle = shadowCol(colors.dark ? 0.2 : 0.13); c.lineWidth = w + 1.6;
    cols.forEach(function (col) { c.stroke(paths[col]); });
    c.restore();
    // 2. 外緣（較暗）→ 3. 本體 → 4. 左上方的亮線：看起來是圓柱形的導線
    cols.forEach(function (col) { c.strokeStyle = shade(col, -0.34); c.lineWidth = w; c.stroke(paths[col]); });
    cols.forEach(function (col) { c.strokeStyle = shade(col, -0.06); c.lineWidth = w * 0.68; c.stroke(paths[col]); });
    c.save(); c.translate(-w * 0.15, -w * 0.15);
    cols.forEach(function (col) { c.strokeStyle = alpha(shade(col, 0.62), colors.dark ? 0.6 : 0.85); c.lineWidth = Math.max(0.9, w * 0.24); c.stroke(paths[col]); });
    c.restore();
  }

  // ======================= 圖層：元件、標示 =======================
  function softShadow(c, fn, blur, dy) {
    c.save();
    c.shadowColor = colors.dark ? 'rgba(0,0,0,0.55)' : alpha(colors.text, 0.26);
    c.shadowBlur = blur == null ? 8 : blur; c.shadowOffsetY = (dy == null ? 3 : dy) * dpr;
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
  /** 同上，但讓局部的「上方」（−y）一律朝畫面的上方或左方：光從左上方來，明暗方向一致（只用在上下對稱的元件） */
  function localLit(c, g, fn) {
    c.save();
    c.translate(g.C[0], g.C[1]);
    c.rotate(g.ang);
    if (g.uy - g.ux > 0) c.scale(1, -1);
    fn();
    c.restore();
  }
  function selGlow(c, g, round, strong) {
    local(c, g, function () {
      const pad = strong ? 7 : 6;
      c.save();
      c.shadowColor = alpha(colors.accent, strong ? 0.55 : 0.3);
      c.shadowBlur = strong ? 10 : 6;
      c.strokeStyle = alpha(colors.accent, strong ? 0.8 : 0.35);
      c.lineWidth = strong ? 2.4 : 2;
      c.beginPath();
      if (round) c.arc(0, 0, g.hw + pad, 0, Math.PI * 2);
      else rrPath(c, -g.hb - pad, -g.hw - pad, 2 * g.hb + 2 * pad, 2 * g.hw + 2 * pad, g.hw + pad);
      c.stroke();
      c.restore();
    });
  }

  // ---------- 電阻：米色碳膜電阻，色碼依電阻值（IEC 60062） ----------
  // 色碼的顏色是元件上的標準標示（不是介面配色），所以照標準色寫在這裡
  const BAND = ['#1e1e1e', '#7a4a26', '#c8302c', '#ec6c12', '#f2cf2e', '#2f8c3f', '#2361c4', '#7c44ad', '#8f9295', '#f3f3f1'];
  const BAND_GOLD = '#c9a13b', BAND_SILVER = '#b9bfc5';
  /** 色環：2 位有效數字（四環，金色 ±5%）或 3 位（五環，棕色 ±1%）；放不下（例如 12.34 Ω）就不畫色環 */
  function resistorBands(R) {
    for (let nd = 2; nd <= 3; nd++) {
      for (let m = -2; m <= 2; m++) {
        const x = R / Math.pow(10, m), xr = Math.round(x);
        if (Math.abs(x - xr) > 1e-6 * Math.max(1, x)) continue;
        if (xr < Math.pow(10, nd - 1) || xr >= Math.pow(10, nd)) continue;
        const out = String(xr).split('').map(function (d) { return BAND[+d]; });
        out.push(m === -2 ? BAND_SILVER : m === -1 ? BAND_GOLD : BAND[m]);
        out.push(nd === 2 ? BAND_GOLD : BAND[1]);
        return out;
      }
    }
    return null;
  }
  function drawResistor(c, e, g) {
    const hb = g.hb, hw = g.hw;
    const body = mix(colors.surface, colors.equi, colors.dark ? 0.36 : 0.3);
    const capL = Math.min(hb * 0.3, hw * 1.7), neck = hw * 0.8;
    const outline = function () {
      c.beginPath();
      rrPath(c, -hb, -hw, capL, 2 * hw, hw * 0.78);
      rrPath(c, hb - capL, -hw, capL, 2 * hw, hw * 0.78);
      rrPath(c, -hb + capL * 0.6, -neck, 2 * hb - capL * 1.2, 2 * neck, neck * 0.5);
    };
    localLit(c, g, function () {
      softShadow(c, function () { outline(); c.fillStyle = body; c.fill(); }, 7, 2.5);
      // 外緣暗線（先描粗線，填色後只剩外圍一圈）
      outline();
      c.strokeStyle = alpha(shade(body, -0.55), colors.dark ? 0.9 : 0.6); c.lineWidth = 2; c.stroke();
      const lg = c.createLinearGradient(0, -hw, 0, hw);
      lg.addColorStop(0, shade(body, 0.55)); lg.addColorStop(0.28, shade(body, 0.18));
      lg.addColorStop(0.62, body); lg.addColorStop(1, shade(body, -0.38));
      c.fillStyle = lg; c.fill();
      // 色環
      const bands = resistorBands(e.R);
      if (bands) {
        c.save(); outline(); c.clip();
        const bw = Math.max(2.2, Math.min(hb * 0.085, 6)), sp = bw * 1.85;
        const xs = -hb + capL * 0.42;
        bands.forEach(function (col, i) {
          const x = i < bands.length - 1 ? xs + i * sp : hb - capL * 0.42 - bw;
          c.fillStyle = col; c.fillRect(x, -hw - 1, bw, 2 * hw + 2);
        });
        // 色環也要有圓柱的明暗
        const sh = c.createLinearGradient(0, -hw, 0, hw);
        sh.addColorStop(0, 'rgba(255,255,255,0.42)'); sh.addColorStop(0.3, 'rgba(255,255,255,0.08)');
        sh.addColorStop(0.62, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.38)');
        c.fillStyle = sh;
        bands.forEach(function (col, i) {
          const x = i < bands.length - 1 ? xs + i * sp : hb - capL * 0.42 - bw;
          c.fillRect(x, -hw - 1, bw, 2 * hw + 2);
        });
        c.restore();
      }
      // 頂端的細高光
      c.strokeStyle = 'rgba(255,255,255,' + (colors.dark ? 0.22 : 0.6) + ')';
      c.lineWidth = 1; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-hb + capL * 0.35, -hw * 0.62); c.lineTo(-hb + capL * 0.8, -hw * 0.62);
      c.moveTo(-hb + capL * 1.1, -neck * 0.6); c.lineTo(hb - capL * 1.1, -neck * 0.6);
      c.moveTo(hb - capL * 0.8, -hw * 0.62); c.lineTo(hb - capL * 0.35, -hw * 0.62); c.stroke();
    });
    // 可變電阻：斜箭頭（電路符號）
    if (e.kind === 'load') {
      local(c, g, function () { D.arrow(c, -hb * 0.72, hw + 8, hb * 0.66, -hw - 10, colors.accent, 1.9); });
    }
  }

  /** 燈泡的暖色光：把 --equi（琥珀色）調到最亮、保持色相 */
  function warm() {
    const c = rgbOf(colors.equi), k = 255 / Math.max(1, c[0], c[1], c[2]);
    return 'rgb(' + c.map(function (x) { return Math.round(Math.min(255, x * k)); }).join(',') + ')';
  }
  /** 小燈泡（由上往下看）：圓形燈座、兩顆接線螺絲、玻璃燈泡與燈絲；亮度 ∝ 消耗功率 */
  function drawBulb(c, e, g, k) {
    const s = state.sol, R = g.hw, x = g.C[0], y = g.C[1];
    const Pw = s.ok ? s.P[k] : 0;
    const b = Math.max(0, Math.min(1, Pw / P_FULL));
    const W = warm(), hot = mix(W, '#ffffff', 0.55);
    // 光暈（亮度 ∝ 功率）
    if (b > 0.002) {
      c.save();
      c.globalCompositeOperation = colors.dark ? 'lighter' : 'source-over';
      const Rh = R * (1.6 + 2.4 * b);
      const hg = c.createRadialGradient(x, y, R * 0.2, x, y, Rh);
      hg.addColorStop(0, alpha(hot, (colors.dark ? 0.75 : 0.6) * b));
      hg.addColorStop(0.45, alpha(W, (colors.dark ? 0.35 : 0.3) * b));
      hg.addColorStop(1, alpha(W, 0));
      c.fillStyle = hg;
      c.beginPath(); c.arc(x, y, Rh, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    // 燈座（塑膠圓座）
    const sock = colors.dark ? shade(colors.surface, 0.16) : mix(colors.surface, colors.muted, 0.22);
    softShadow(c, function () { c.fillStyle = sock; c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fill(); });
    const sg = c.createLinearGradient(x - R, y - R, x + R, y + R);
    sg.addColorStop(0, shade(sock, colors.dark ? 0.2 : 0.55)); sg.addColorStop(0.55, sock); sg.addColorStop(1, shade(sock, -0.3));
    c.fillStyle = sg; c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = alpha(shade(sock, -0.5), 0.6); c.lineWidth = 1;
    c.beginPath(); c.arc(x, y, R - 0.5, 0, Math.PI * 2); c.stroke();
    // 接線螺絲（導線從兩邊接進來）
    [-1, 1].forEach(function (sg2) { const p = along(g, sg2 * R * 0.86); D.ball(c, p[0], p[1], Math.max(2.4, R * 0.12), brass(), { shadow: false, glow: 0 }); });
    // 玻璃燈泡
    const Rg = R * 0.74;
    c.save();
    c.shadowColor = colors.dark ? 'rgba(0,0,0,0.5)' : alpha(colors.text, 0.25); c.shadowBlur = 4; c.shadowOffsetY = 1.5 * dpr;
    c.fillStyle = colors['canvas-bg'];
    c.beginPath(); c.arc(x, y, Rg, 0, Math.PI * 2); c.fill();
    c.restore();
    const gl = c.createRadialGradient(x - Rg * 0.35, y - Rg * 0.4, Rg * 0.1, x, y, Rg);
    gl.addColorStop(0, alpha(mix(colors.surface, hot, b), 0.95));
    gl.addColorStop(0.7, alpha(mix(colors.surface, W, 0.15 + 0.6 * b), colors.dark ? 0.4 : 0.62));
    gl.addColorStop(1, alpha(mix(colors.muted, W, b), colors.dark ? 0.5 : 0.42));
    c.fillStyle = gl;
    c.beginPath(); c.arc(x, y, Rg, 0, Math.PI * 2); c.fill();
    // 燈絲：兩根支架＋中間的線圈
    localLit(c, g, function () {
      const r = Rg;
      c.strokeStyle = alpha(colors.text, 0.5); c.lineWidth = 1.1; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-r * 0.95, 0.15 * r); c.lineTo(-r * 0.5, r * 0.2); c.lineTo(-r * 0.42, -r * 0.12);
      c.moveTo(r * 0.95, 0.15 * r); c.lineTo(r * 0.5, r * 0.2); c.lineTo(r * 0.42, -r * 0.12);
      c.stroke();
      const fil = b > 0.002 ? mix(colors.muted, hot, Math.min(1, 0.35 + b)) : alpha(colors.text, 0.62);
      if (b > 0.02) {
        const cg = c.createRadialGradient(0, -r * 0.15, 0, 0, -r * 0.15, r * 0.65);
        cg.addColorStop(0, alpha(hot, 0.9 * b)); cg.addColorStop(1, alpha(hot, 0));
        c.fillStyle = cg;
        c.beginPath(); c.arc(0, -r * 0.15, r * 0.65, 0, Math.PI * 2); c.fill();
      }
      c.strokeStyle = fil; c.lineWidth = 1.2 + 0.6 * b;
      c.beginPath();
      const n = 5, x0 = -r * 0.42, x1 = r * 0.42;
      c.moveTo(x0, -r * 0.12);
      for (let i = 0; i < n; i++) {
        const xa = x0 + (i + 0.5) * (x1 - x0) / n;
        c.quadraticCurveTo(xa, -r * 0.46, x0 + (i + 1) * (x1 - x0) / n, -r * 0.12);
      }
      c.stroke();
    });
    // 玻璃的外框、反光
    c.strokeStyle = alpha(colors.text, colors.dark ? 0.4 : 0.32);
    c.lineWidth = 1.1;
    c.beginPath(); c.arc(x, y, Rg, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,' + (colors.dark ? 0.4 : 0.85) + ')';
    c.lineWidth = Math.max(1.2, Rg * 0.09); c.lineCap = 'round';
    c.beginPath(); c.arc(x, y, Rg * 0.8, Math.PI * 1.1, Math.PI * 1.42); c.stroke();
    c.fillStyle = 'rgba(255,255,255,' + (colors.dark ? 0.35 : 0.75) + ')';
    c.beginPath(); c.arc(x + Rg * 0.42, y + Rg * 0.38, Math.max(0.8, Rg * 0.06), 0, Math.PI * 2); c.fill();
  }

  /** 檢流計：金屬外框、零點在中央的刻度、指針（a→b 方向的電流使指針往右偏） */
  function drawGalv(c, e, g, k) {
    const s = state.sol, R = g.hw, x = g.C[0], y = g.C[1];
    const Ig = s.ok ? s.I[k] : 0;
    // 接線柱
    [-1, 1].forEach(function (sg) { const p = along(g, sg * R * 0.98); D.ball(c, p[0], p[1], Math.max(2.8, R * 0.13), brass(), { glow: 0 }); });
    // 外框（金屬環）
    const met = chrome();
    softShadow(c, function () { c.fillStyle = met; c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fill(); }, 9, 3);
    const rim = c.createLinearGradient(x - R, y - R, x + R, y + R);
    rim.addColorStop(0, shade(met, 0.6)); rim.addColorStop(0.5, met); rim.addColorStop(1, shade(met, -0.4));
    c.fillStyle = rim; c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fill();
    // 錶面（凹進去：上緣有內陰影）
    const Rf = R * 0.84;
    const face = colors.dark ? shade(colors.surface, 0.14) : mix(colors.surface, colors.equi, 0.04);
    const fg = c.createRadialGradient(x - Rf * 0.3, y - Rf * 0.35, Rf * 0.1, x, y, Rf);
    fg.addColorStop(0, shade(face, 0.35)); fg.addColorStop(1, shade(face, -0.1));
    c.fillStyle = fg; c.beginPath(); c.arc(x, y, Rf, 0, Math.PI * 2); c.fill();
    const ins = c.createLinearGradient(0, y - Rf, 0, y - Rf * 0.6);
    ins.addColorStop(0, shadowCol(colors.dark ? 0.25 : 0.14)); ins.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = ins; c.beginPath(); c.arc(x, y, Rf, 0, Math.PI * 2); c.fill();
    // 刻度：零在中央
    const px = x, py = y + R * 0.34, rr = R * 0.82;
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = alpha(colors.accent, 0.4); c.lineWidth = 2.2;
    c.beginPath(); c.arc(px, py, rr * 0.97, -Math.PI / 2 - 50 * Math.PI / 180, -Math.PI / 2 + 50 * Math.PI / 180); c.stroke();
    c.strokeStyle = alpha(colors.text, 0.7); c.lineWidth = 1;
    for (let i = -4; i <= 4; i++) {
      const a = -Math.PI / 2 + i * (50 / 4) * Math.PI / 180, l = i === 0 ? 0.24 : 0.13;
      c.lineWidth = i === 0 ? 1.5 : 1;
      c.beginPath();
      c.moveTo(px + rr * Math.cos(a), py + rr * Math.sin(a));
      c.lineTo(px + rr * (1 - l) * Math.cos(a), py + rr * (1 - l) * Math.sin(a));
      c.stroke();
    }
    const dir = g.ux >= 0 ? 1 : -1;
    const defl = Math.max(-1, Math.min(1, dir * Ig / G_FULL)) * 50 * Math.PI / 180;
    const na = -Math.PI / 2 + defl, nl = rr * 0.95;
    c.strokeStyle = shadowCol(0.18); c.lineWidth = 2;
    c.beginPath(); c.moveTo(px + 1, py + 1.5); c.lineTo(px + 1 + nl * Math.cos(na), py + 1.5 + nl * Math.sin(na)); c.stroke();
    c.strokeStyle = colors.pos; c.lineWidth = 1.8;
    c.beginPath(); c.moveTo(px, py); c.lineTo(px + nl * Math.cos(na), py + nl * Math.sin(na)); c.stroke();
    c.restore();
    D.ball(c, px, py, Math.max(2.2, R * 0.09), chrome(), { shadow: false, glow: 0 });
    c.font = '700 ' + Math.round(R * 0.36) + 'px ' + FONT;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = alpha(colors.text, 0.5);
    c.fillText('G', px, y + R * 0.66);
    // 玻璃反光
    c.save();
    c.beginPath(); c.arc(x, y, Rf, 0, Math.PI * 2); c.clip();
    const gr = c.createLinearGradient(x - Rf, y - Rf, x, y);
    gr.addColorStop(0, 'rgba(255,255,255,' + (colors.dark ? 0.16 : 0.5) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr;
    c.beginPath(); c.ellipse(x - Rf * 0.25, y - Rf * 0.45, Rf * 0.9, Rf * 0.42, -0.5, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  function leverAngle(e) {
    const target = e.closed ? 0 : -0.55;
    const a = state.lever[e.id];
    return a == null ? target : a;
  }
  /** 閘刀開關：絕緣底座、鉸鏈、金屬刀片、夾片與絕緣握把（接通綠、斷開紅） */
  function drawSwitch(c, e, g) {
    const a = leverAngle(e), r0 = switchR0(), hb = g.hb;
    const base = mix(colors.surface, colors['b-em'], colors.dark ? 0.22 : 0.12);
    const met = chrome();
    local(c, g, function () {
      D.block(c, -hb - r0 - 4, -r0 - 4, 2 * hb + 2 * r0 + 8, 2 * r0 + 8, base, { r: r0 + 4 });
      // 底座上的兩顆固定螺絲
      [-1, 1].forEach(function (sg) {
        const sx = sg * hb * 0.42;
        c.fillStyle = alpha(shade(base, -0.45), 0.55);
        c.beginPath(); c.arc(sx, 0, Math.max(1.6, r0 * 0.34), 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,' + (colors.dark ? 0.12 : 0.6) + ')';
        c.beginPath(); c.arc(sx - 0.4, -0.4, Math.max(0.8, r0 * 0.15), 0, Math.PI * 2); c.fill();
      });
      // b 端的夾片（刀片接通時插進去）
      const jw = wireW() * 0.5 + 1.6;
      c.fillStyle = shade(met, -0.15);
      roundRect(c, hb - 5, -jw - 1.6, 9, 2.2, 1); c.fill();
      roundRect(c, hb - 5, jw - 0.6, 9, 2.2, 1); c.fill();
    });
    // 兩個接線柱
    [-hb, hb].forEach(function (sx) { const p = along(g, sx); D.ball(c, p[0], p[1], r0, met, { glow: 0 }); });
    local(c, g, function () {
      // 刀片：從 a 端的鉸鏈轉動
      const lx = 2 * hb, ex = -hb + lx * Math.cos(a), ey = lx * Math.sin(a);
      const w = wireW() * 0.95;
      c.save();
      c.strokeStyle = shadowCol(colors.dark ? 0.2 : 0.12); c.lineWidth = w + 1.5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-hb + 1, 2.2); c.lineTo(ex + 1.5, ey + 2.8 - a * 6); c.stroke();
      c.restore();
      D.tube(c, function (cc) { cc.moveTo(-hb, 0); cc.lineTo(ex, ey); }, shade(met, colors.dark ? -0.05 : 0.05), w);
      // 握把
      const hx = -hb + lx * 0.66 * Math.cos(a), hy = lx * 0.66 * Math.sin(a);
      c.save(); c.translate(hx, hy); c.rotate(a);
      D.block(c, -8, -4.2, 16, 8.4, e.closed ? colors.probe : colors.pos, { r: 4.2 });
      c.restore();
    });
    // 鉸鏈軸
    const h = along(g, -hb); D.ball(c, h[0], h[1], r0 * 0.55, shade(met, 0.2), { shadow: false, glow: 0 });
  }

  /** 一節乾電池（局部座標，−x 為負極、+x 為正極）：外皮有圓柱明暗、正極端有銅色環與凸頭 */
  function cell(c, x0, x1, hc) {
    const jacket = colors['b-em'], cap = colors.equi, met = chrome();
    const nubL = Math.max(2.5, hc * 0.22), nubH = hc * 0.42, xb = x1 - nubL;
    const shadeY = function (col) {
      const g = c.createLinearGradient(0, -hc, 0, hc);
      g.addColorStop(0, shade(col, 0.45)); g.addColorStop(0.22, shade(col, 0.14));
      g.addColorStop(0.6, col); g.addColorStop(1, shade(col, -0.45));
      return g;
    };
    // 正極凸頭
    c.fillStyle = shadeY(met);
    roundRect(c, xb - 1, -nubH, nubL + 1, 2 * nubH, Math.min(2, nubL / 2)); c.fill();
    // 外皮
    c.fillStyle = shadeY(jacket);
    roundRect(c, x0, -hc, xb - x0, 2 * hc, Math.min(4, hc * 0.25)); c.fill();
    // 正極端的銅色環
    const bandL = (xb - x0) * 0.3;
    c.save();
    roundRect(c, x0, -hc, xb - x0, 2 * hc, Math.min(4, hc * 0.25)); c.clip();
    c.fillStyle = shadeY(cap); c.fillRect(xb - bandL, -hc, bandL, 2 * hc);
    // 負極端的金屬底
    c.fillStyle = shadeY(met); c.fillRect(x0, -hc, 2, 2 * hc);
    c.restore();
    c.strokeStyle = alpha(shade(jacket, -0.6), 0.5); c.lineWidth = 0.8;
    roundRect(c, x0 + 0.4, -hc + 0.4, xb - x0 - 0.8, 2 * hc - 0.8, Math.min(4, hc * 0.25)); c.stroke();
    // 印在外皮上的「＋」（線條，不用字型）
    const px = xb - bandL * 0.5, ps = Math.min(hc * 0.32, bandL * 0.3);
    c.strokeStyle = alpha(shade(cap, -0.65), 0.85); c.lineWidth = Math.max(1, ps * 0.32); c.lineCap = 'round';
    c.beginPath(); c.moveTo(px - ps, 0); c.lineTo(px + ps, 0); c.moveTo(px, -ps); c.lineTo(px, ps); c.stroke();
  }
  /** 電池盒：兩節乾電池串聯，盒子的標籤窗印著內電阻 r；虛線外框的意思是「整顆電池」 */
  function drawBattery(c, e, g) {
    const hb = g.hb, hw = g.hw;
    const xr0 = -hb + 6, xr1 = -hb * 0.36, xc0 = -hb * 0.3, xc1 = hb - 5;
    localLit(c, g, function () {
      const hold = colors.dark ? shade(colors.surface, 0.1) : mix(colors.text, colors.surface, 0.18);
      D.block(c, -hb, -hw, 2 * hb, 2 * hw, hold, { r: Math.min(9, hw * 0.4) });
      // 內槽
      c.fillStyle = shadowCol(colors.dark ? 0.22 : 0.2);
      roundRect(c, -hb + 3, -hw + 3, 2 * hb - 6, 2 * hw - 6, Math.min(7, hw * 0.33)); c.fill();
      // 盒內的金屬接片
      const met = chrome(), w = Math.max(2, wireW() * 0.55);
      c.strokeStyle = met; c.lineWidth = w; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-hb, 0); c.lineTo(xr0, 0);
      c.moveTo(xr1, 0); c.lineTo(xc0, 0);
      c.moveTo(xc1, 0); c.lineTo(hb, 0);
      c.stroke();
      // 內電阻 r 的標籤窗（r = 0 時畫成直線）
      const lab = colors.dark ? shade(colors.surface, 0.28) : mix(colors.surface, colors.equi, 0.06);
      const wy = Math.min(hw * 0.5, 13);
      D.block(c, xr0, -wy, xr1 - xr0, 2 * wy, lab, { r: 3, shadow: false });
      c.strokeStyle = alpha(colors.text, 0.8); c.lineWidth = 1.5; c.lineJoin = 'round';
      c.beginPath();
      const z0 = xr0 + 3, z1 = xr1 - 3;
      if (e.r > 0) {
        const n = 6, amp = wy * 0.55;
        c.moveTo(z0, 0);
        for (let i = 0; i < n; i++) c.lineTo(z0 + (i + 0.5) * (z1 - z0) / n, (i % 2 ? 1 : -1) * amp);
        c.lineTo(z1, 0);
      } else { c.moveTo(z0, 0); c.lineTo(z1, 0); }
      c.stroke();
      // 兩節乾電池（由 − 往 + 排列）
      const hc = Math.min(hw * 0.64, hw - 5), gap = 2, Lc = (xc1 - xc0 - gap) / 2;
      cell(c, xc0, xc0 + Lc, hc);
      cell(c, xc0 + Lc + gap, xc1, hc);
    });
    // 虛線外框：電動勢 ε 與內電阻 r 合起來就是「整顆電池」
    local(c, g, function () {
      c.strokeStyle = alpha(colors['b-em'], colors.dark ? 0.6 : 0.5);
      c.setLineDash([5, 4]); c.lineWidth = 1.2;
      c.beginPath(); rrPath(c, -hb - 4, -hw - 4, 2 * hb + 8, 2 * hw + 8, 11); c.stroke();
      c.setLineDash([]);
    });
    // 標示（不旋轉）：+、−、ε、r
    const nx = -g.uy, ny = g.ux; // 垂直方向
    const side = nx >= 0 ? -1 : 1; // 標在右側（電路內部）
    const sx = function (s, off) { const p = along(g, s); return [p[0] - nx * off * side, p[1] - ny * off * side]; };
    const fB = '700 ' + (L.fs + 2) + 'px ' + FONT, fI = 'italic 600 ' + (L.fs + 1.5) + 'px ' + FONT;
    let q = sx(hb * 0.92, hw + 12); D.haloText(c, '+', q[0], q[1], colors.pos, 'center', 'middle', fB);
    q = sx(-hb * 0.92, hw + 12); D.haloText(c, '−', q[0], q[1], colors.neg, 'center', 'middle', fB);
    q = sx((xc0 + xc1) / 2, hw + 12); D.haloText(c, 'ε', q[0], q[1], colors.text, 'center', 'middle', fI);
    q = sx((xr0 + xr1) / 2, hw + 12); D.haloText(c, 'r', q[0], q[1], colors.text, 'center', 'middle', fI);
  }

  /** 兩行的標籤：上行名稱與電阻（淡色），下行電流（粗體） */
  function pill2(c, l1, l2, x, y, align, col2) {
    const f1 = L.fs + 'px ' + FONT, f2 = '700 ' + (L.fs + 0.5) + 'px ' + FONT;
    c.font = f1; const w1 = c.measureText(l1).width;
    c.font = f2; const m2 = c.measureText(l2 || l1), w2 = l2 ? m2.width : 0;
    const lh = (m2.fontBoundingBoxAscent > 0 ? m2.fontBoundingBoxAscent + m2.fontBoundingBoxDescent : L.fs * 1.3) * 1.02, tw = Math.max(w1, w2), pw = tw + 12, ph = (l2 ? 2 : 1) * lh + 6;
    let bx = align === 'center' ? x - pw / 2 : align === 'right' ? x - pw : x;
    bx = Math.max(3, Math.min(cw - pw - 3, bx)); // 不超出畫布
    const by = y - ph / 2;
    c.save();
    c.shadowColor = colors.dark ? 'rgba(0,0,0,0.4)' : alpha(colors.text, 0.12); c.shadowBlur = 6; c.shadowOffsetY = 1.5 * dpr;
    c.fillStyle = alpha(colors['canvas-bg'], colors.dark ? 0.88 : 0.92);
    roundRect(c, bx, by, pw, ph, 7); c.fill();
    c.restore();
    c.strokeStyle = alpha(col2 && col2 !== colors.text ? col2 : colors.muted, colors.dark ? 0.4 : 0.3); c.lineWidth = 1;
    roundRect(c, bx + 0.5, by + 0.5, pw - 1, ph - 1, 6.5); c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = f1; c.fillStyle = colors.muted;
    c.fillText(l1, bx + pw / 2, by + 3 + lh / 2);
    if (l2) { c.font = f2; c.fillStyle = col2 || colors.text; c.fillText(l2, bx + pw / 2, by + 3 + lh * 1.5); }
    return { x: bx, y: by, w: pw, h: ph };
  }

  /** 元件旁的電流方向箭頭（傳統電流；與全站的向量箭頭同一種樣式） */
  function chevron(c, g, I) {
    if (Math.abs(I) < 5e-7) return;
    const sgn = I > 0 ? 1 : -1;
    const d = g.hb + Math.max(9, 0.17 * L.u);
    const s = Math.max(4, Math.min(0.08 * L.u, 6.5));
    const p0 = along(g, sgn * (d - s * 1.5)), p1 = along(g, sgn * (d + s * 1.5));
    D.arrow(c, p0[0], p0[1], p1[0], p1[1], colors.pos, Math.max(2, Math.min(2.6, s * 0.42)));
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
      const f = '600 ' + L.fs + 'px ' + FONT;
      const yy = side === 'b' ? g.C[1] + g.hw + L.fs : side === 't' ? g.C[1] - g.hw - L.fs : g.C[1];
      const plate = switchR0() + 9;
      const xx = side === 'l' ? g.C[0] - plate : side === 'r' ? g.C[0] + plate : g.C[0];
      D.haloText(c, e.id, xx, yy, e.closed ? colors.muted : colors.pos, align === 'center' ? 'center' : align, 'middle', f);
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
    if (!L || !state.c) return;
    const c = oc, s = state.sol;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    const els = state.c.elements;
    // 節點（接點）：分支點是較大的焊點，其他是小接線點
    const deg = new Array(state.c.n).fill(0);
    els.forEach(function (e) { deg[e.a]++; deg[e.b]++; });
    const met = colors.dark ? shade(colors.field, -0.1) : shade(colors.field, 0.15);
    for (let n = 0; n < state.c.n; n++) {
      const p = vis(n), big = deg[n] >= 3;
      const col = potColor(s.ok ? s.V[n] : NaN, s.floating[n]);
      const r = big ? Math.max(4.5, Math.min(0.085 * L.u, 7.5)) : Math.max(3, Math.min(0.05 * L.u, 4.5));
      if (state.hover === -2 - n) {
        c.fillStyle = alpha(colors.probe, 0.22); c.beginPath(); c.arc(p[0], p[1], r + 8, 0, Math.PI * 2); c.fill();
        c.strokeStyle = alpha(colors.probe, 0.6); c.lineWidth = 1.5; c.beginPath(); c.arc(p[0], p[1], r + 8, 0, Math.PI * 2); c.stroke();
      }
      D.ball(c, p[0], p[1], r, big ? shade(col, -0.1) : met, { shadow: big, glow: 0 });
    }
    // 元件
    els.forEach(function (e, k) {
      if (e.type === 'wire') return;
      const g = geom(e);
      const round = e.kind === 'bulb' || e.kind === 'galv';
      if (k === state.sel) selGlow(c, g, round, true);
      else if (k === state.hover) selGlow(c, g, round, false);
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
    D.haloText(c, '0 V', g0[0] + 13, g0[1] + Math.max(15, 0.26 * L.u), colors.muted, 'left', 'middle', '600 ' + L.fs + 'px ' + FONT);
    if (!s.ok && s.short) D.pill(c, T('短路！', 'Short circuit!'), cw / 2, L.oy + 2 * L.u + 10, colors.pos, 'center', '700 ' + (L.fs + 2) + 'px ' + FONT);
    drawMeter(c);
    drawFocus(c);
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
  // 探針筆的方向（純畫法）：紅筆往右下、黑筆往左下，筆尖在接點上
  const PEN = [[0.5, 0.866], [-0.5, 0.866]], PEN_LEN = 26;
  function penEnd(i) { const p = vis(state.probes[i]), d = PEN[i]; return [p[0] + d[0] * PEN_LEN, p[1] + d[1] * PEN_LEN]; }
  /** 探針線：從電表插孔接到探針筆的尾端（畫在電路「下面」，像放在桌上的電線） */
  function drawCables(c) {
    const jacks = jackPos();
    state.probes.forEach(function (n, i) {
      if (n == null) return;
      const p = penEnd(i), j = jacks[i], col = probeColor(i), d = PEN[i];
      const sag = Math.max(30, Math.abs(p[1] - j[1]) * 0.35);
      const path = function (cc) {
        cc.moveTo(j[0], j[1]);
        cc.bezierCurveTo(j[0] + 26 + i * 10, j[1] + sag * 0.2, p[0] + d[0] * 18, p[1] + d[1] * 18 + sag * 0.4, p[0], p[1]);
      };
      c.save();
      c.lineCap = 'round';
      c.strokeStyle = shadowCol(colors.dark ? 0.18 : 0.1); c.lineWidth = 4.5;
      c.translate(1, 2); c.beginPath(); path(c); c.stroke();
      c.restore();
      D.tube(c, path, col, 3.6);
    });
  }
  /** 探針筆：金屬針尖、護指環、有顏色的握柄；接點周圍一圈光環表示量測點 */
  function drawPen(c, i) {
    const p = vis(state.probes[i]), d = PEN[i], col = probeColor(i);
    c.fillStyle = alpha(col, 0.2); c.beginPath(); c.arc(p[0], p[1], 11, 0, Math.PI * 2); c.fill();
    c.strokeStyle = col; c.lineWidth = 2;
    c.beginPath(); c.arc(p[0], p[1], 8.5, 0, Math.PI * 2); c.stroke();
    c.save();
    c.translate(p[0], p[1]);
    c.rotate(Math.atan2(d[1], d[0]));
    // 針尖
    const met = chrome();
    const tg = c.createLinearGradient(0, -1.5, 0, 1.5);
    tg.addColorStop(0, shade(met, 0.5)); tg.addColorStop(1, shade(met, -0.35));
    c.fillStyle = tg;
    c.beginPath(); c.moveTo(1.5, 0); c.lineTo(9, -1.4); c.lineTo(9, 1.4); c.closePath(); c.fill();
    // 握柄與護指環
    D.block(c, 11, -3, PEN_LEN - 11, 6, col, { r: 3 });
    D.block(c, 9, -4.6, 3, 9.2, shade(col, -0.25), { r: 1.2, shadow: false });
    c.restore();
  }
  /** 依寬度縮小字級，讓文字放得下 */
  function fitFont(c, text, weight, size, family, maxW) {
    let f = size;
    c.font = weight + f + 'px ' + family;
    while (f > 7 && c.measureText(text).width > maxW) { f -= 0.5; c.font = weight + f + 'px ' + family; }
  }
  function drawMeter(c) {
    const M = meterBox();
    // 外殼：琥珀色的防撞護套＋深色面板（像手持三用電表）
    const hol = colors.dark ? shade(colors.equi, -0.3) : shade(colors.equi, 0.32);
    D.block(c, M.x, M.y, M.w, M.h, hol, { r: 12 });
    const face = colors.dark ? shade(colors.surface, 0.12) : mix(colors.field, colors.text, 0.35);
    D.block(c, M.x + 4, M.y + 3.5, M.w - 8, M.h - 7, face, { r: 9, shadow: false });
    // 液晶顯示
    const jackW = 64;
    const lx = M.x + 10, ly = M.y + 8, lw = M.w - 20 - jackW, lh = M.h - 16;
    const lcdBg = colors.dark ? mix(colors['canvas-bg'], colors.probe, 0.12) : mix(colors.surface, colors.probe, 0.14);
    const lg = c.createLinearGradient(0, ly, 0, ly + lh);
    lg.addColorStop(0, shade(lcdBg, colors.dark ? -0.15 : -0.06)); lg.addColorStop(0.25, lcdBg); lg.addColorStop(1, shade(lcdBg, colors.dark ? 0.04 : 0.06));
    c.fillStyle = lg; roundRect(c, lx, ly, lw, lh, 5); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; roundRect(c, lx + 0.5, ly + 0.5, lw - 1, lh - 1, 5); c.stroke();
    const dV = probeDV();
    const lcdText = colors.dark ? shade(colors.probe, 0.3) : shade(colors.probe, -0.5);
    c.textAlign = 'left'; c.textBaseline = 'middle';
    const t1 = T('電壓表（紅 − 黑）', 'Voltmeter (red − black)');
    fitFont(c, t1, '', L.fs - 0.5, FONT, lw - 16);
    c.fillStyle = alpha(lcdText, 0.8);
    c.fillText(t1, lx + 8, ly + lh * 0.27);
    const both = state.probes[0] != null && state.probes[1] != null;
    c.save();
    if (colors.dark) { c.shadowColor = alpha(colors.probe, 0.55); c.shadowBlur = 6; }
    if (both) {
      const t3 = isFinite(dV) ? fmtV(dV) : T('— 沒有定義', '— undefined');
      fitFont(c, t3, '700 ', L.narrow ? 17 : 20, 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', lw - 16);
      c.fillStyle = lcdText;
      c.fillText(t3, lx + 8, ly + lh * 0.68);
    } else {
      const t2 = state.probes[0] == null ? T('點一個接點放紅探針', 'Tap a junction (red)') : T('再點一個接點放黑探針', 'Tap another (black)');
      fitFont(c, t2, '', L.fs, FONT, lw - 16);
      c.fillStyle = alpha(lcdText, 0.85);
      c.fillText(t2, lx + 8, ly + lh * 0.68);
    }
    c.restore();
    // 插孔（凹進去的插座）
    const jp = jackPos(), jx = jp[0][0];
    const jcol = [colors.pos, colors.dark ? colors.muted : shade(colors.field, -0.2)];
    jp.forEach(function (j, i) {
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.arc(j[0], j[1] + 0.6, 7.5, 0, Math.PI * 2); c.fill();
      const rg = c.createLinearGradient(0, j[1] - 6.5, 0, j[1] + 6.5);
      rg.addColorStop(0, shade(jcol[i], -0.35)); rg.addColorStop(1, shade(jcol[i], 0.3));
      c.fillStyle = rg; c.beginPath(); c.arc(j[0], j[1], 6.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#000000'; c.beginPath(); c.arc(j[0], j[1], 2.6, 0, Math.PI * 2); c.fill();
    });
    c.font = '600 ' + (L.fs - 2) + 'px ' + FONT;
    c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillStyle = alpha(colors.dark ? colors.text : '#ffffff', 0.78);
    c.fillText('+', jx - 11, jp[0][1]); c.fillText('COM', jx - 11, jp[1][1]);
    // 探針線在電表面板上的一段（其餘畫在電路下面）、插頭
    // 只在插孔那一欄畫出來（液晶上的字不被電線蓋住），其餘部分在電表「下面」
    c.save(); c.beginPath(); c.rect(lx + lw + 1, M.y, M.x + M.w - lx - lw - 1, M.h); c.clip(); drawCables(c); c.restore();
    jp.forEach(function (j, i) { if (state.probes[i] != null) D.ball(c, j[0], j[1], 4.6, jcol[i], { glow: 0 }); });
    // 探針筆
    state.probes.forEach(function (n, i) { if (n != null) drawPen(c, i); });
    // 電位色條
    if (state.show.pot) {
      const bx0 = M.x + M.w + 14, bx1 = cw - 14;
      if (bx1 - bx0 > 70) {
        const by = M.y + M.h * 0.6, bh = 8;
        const metal = colors.dark ? shade(colors.field, -0.25) : shade(colors.field, 0.12);
        const g = c.createLinearGradient(bx0, 0, bx1, 0);
        g.addColorStop(0, mix(metal, colors.neg, 0.62)); g.addColorStop(0.5, metal); g.addColorStop(1, mix(metal, colors.pos, 0.62));
        softShadow(c, function () { c.fillStyle = g; roundRect(c, bx0, by - bh / 2, bx1 - bx0, bh, bh / 2); c.fill(); }, 4, 1);
        c.fillStyle = 'rgba(255,255,255,' + (colors.dark ? 0.15 : 0.4) + ')';
        roundRect(c, bx0 + 3, by - bh / 2 + 1, bx1 - bx0 - 6, 2, 1); c.fill();
        c.strokeStyle = alpha(colors.text, 0.35); c.lineWidth = 1;
        c.beginPath();
        for (let i = 0; i <= 4; i++) { const x = Math.round(bx0 + (bx1 - bx0) * i / 4) + 0.5; c.moveTo(x, by + bh / 2 + 1); c.lineTo(x, by + bh / 2 + (i % 2 ? 3 : 5)); }
        c.stroke();
        const f = (L.fs - 0.5) + 'px ' + FONT;
        D.haloText(c, T('電位', 'Potential'), bx0, M.y + M.h * 0.2, colors.muted, 'left', 'middle', '600 ' + f);
        D.haloText(c, '0 V', bx0, by + bh / 2 + 6, colors.muted, 'left', 'top', f);
        D.haloText(c, fmtV(emf()), bx1, by + bh / 2 + 6, colors.muted, 'right', 'top', f);
      }
    }
  }
  /** 鍵盤操作時，被選取的探針周圍畫焦點框（還沒放上時框住電表插孔） */
  function drawFocus(c) {
    if (!kb || !kb.focused()) return;
    const i = kb.index(), n = state.probes[i];
    const p = n != null ? vis(n) : jackPos()[i];
    const r = n != null ? 15 : 11;
    c.save();
    c.strokeStyle = colors.accent; c.lineWidth = 2; c.setLineDash([4, 3]);
    roundRect(c, p[0] - r, p[1] - r, 2 * r, 2 * r, 6); c.stroke();
    c.restore();
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
    D.ball(c, m, m, r, colors.dark ? shade(col, 0.15) : col, { shadow: false, glow: 0 });
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
      const ka = state.corners[e.a], kb2 = state.corners[e.b];
      ctx.globalAlpha = moving ? 0.95 : 0.35;
      const off = ((state.offs[k] % sp) + sp) % sp;
      carrierSegments(e, g).forEach(function (seg) {
        // 以元件中心為原點，沿 a→b；電荷位置 = off + j·sp，對齊全域格點避免兩段之間跳動
        const start = Math.ceil((seg[0] - off) / sp);
        for (let j = start; ; j++) {
          const x = off + j * sp;
          if (x > seg[1]) break;
          if (x < seg[0]) continue;
          let p = along(g, x);
          const sa = x + g.len / 2, sb = g.len / 2 - x;
          if (ka && sa < ka.rho) p = onBend(ka, [g.ux, g.uy], sa);        // 轉角：沿圓弧走
          else if (kb2 && sb < kb2.rho) p = onBend(kb2, [-g.ux, -g.uy], sb);
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
    c.save(); roundRect(c, 0, 0, gw, gh, 10); c.clip();
    D.backdrop(c, gw, gh);
    c.restore();
    c.strokeStyle = alpha(colors.text, colors.dark ? 0.1 : 0.08); c.lineWidth = 1;
    roundRect(c, 0.5, 0.5, gw - 1, gh - 1, 10); c.stroke();
    const narrow = gw < 420;
    const m = { l: narrow ? 44 : 52, r: narrow ? 40 : 48, t: 28, b: 34 };
    const W = gw - m.l - m.r, H = gh - m.t - m.b;
    const lx = function (Rv) { return m.l + W * Math.log(Rv / R_MIN) / Math.log(R_MAX / R_MIN); };
    let pmax = 0;
    for (let i = 0; i <= 200; i++) pmax = Math.max(pmax, K.loadPower(E.emf, E.r, R_MIN * Math.pow(R_MAX / R_MIN, i / 200)));
    const top = niceTop(pmax * 1.08);
    const ly = function (Pv) { return m.t + H * (1 - Pv / top); };
    const px = function (v) { return Math.round(v * dpr) / dpr + 0.5 / dpr; };
    // 格線（主格線＋對數刻度的次格線）
    c.lineWidth = 1 / dpr;
    c.font = (L.fs - 0.5) + 'px ' + FONT;
    c.fillStyle = colors.muted;
    [0.6, 0.7, 0.8, 0.9, 3, 4, 6, 7, 8, 9, 30, 40, 60, 70, 80, 90].forEach(function (v) {
      const x = px(lx(v));
      c.strokeStyle = alpha(colors.text, colors.dark ? 0.05 : 0.04);
      c.beginPath(); c.moveTo(x, m.t); c.lineTo(x, m.t + H); c.stroke();
    });
    [0.5, 1, 2, 5, 10, 20, 50, 100].forEach(function (v) {
      const x = px(lx(v));
      c.strokeStyle = alpha(colors.text, colors.dark ? 0.11 : 0.1);
      c.beginPath(); c.moveTo(x, m.t); c.lineTo(x, m.t + H); c.stroke();
      c.textAlign = 'center'; c.textBaseline = 'top';
      c.fillText(String(v), x, m.t + H + 4);
    });
    for (let i = 0; i <= 4; i++) {
      const Pv = top * i / 4, y = px(ly(Pv));
      c.strokeStyle = alpha(colors.text, i === 0 ? 0.3 : (colors.dark ? 0.11 : 0.1));
      c.beginPath(); c.moveTo(m.l, y); c.lineTo(m.l + W, y); c.stroke();
      c.textAlign = 'right'; c.textBaseline = 'middle';
      c.fillText(trim(num(Pv, top < 4 ? 2 : 1)), m.l - 5, y);
      c.textAlign = 'left';
      c.fillText((25 * i) + '%', m.l + W + 5, y);
    }
    c.lineWidth = 1;
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left'; c.fillStyle = colors.text; c.font = '600 ' + (L.fs) + 'px ' + FONT;
    c.fillText(T('輸出功率 P (W)', 'Output power P (W)'), 8, 17);
    c.textAlign = 'right'; c.fillStyle = colors.accent;
    c.fillText(T('效率 η', 'Efficiency η'), gw - 8, 17);
    c.fillStyle = colors.muted; c.font = (L.fs - 0.5) + 'px ' + FONT;
    c.fillText(T('負載電阻 R (Ω，對數刻度)', 'Load R (Ω, log scale)'), m.l + W, gh - 4);
    // 效率曲線 η = R/(R + r)
    c.save(); c.beginPath(); c.rect(m.l, m.t - 2, W, H + 4); c.clip();
    c.strokeStyle = alpha(colors.accent, 0.8); c.lineWidth = 1.6; c.setLineDash([5, 4]); c.lineCap = 'round';
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
    fill.addColorStop(0, alpha(colors['b-em'], colors.dark ? 0.28 : 0.22)); fill.addColorStop(1, alpha(colors['b-em'], 0));
    c.fillStyle = fill;
    c.beginPath(); c.moveTo(pts[0][0], m.t + H);
    pts.forEach(function (p) { c.lineTo(p[0], p[1]); });
    c.lineTo(pts[pts.length - 1][0], m.t + H); c.closePath(); c.fill();
    D.tube(c, function (cc) { pts.forEach(function (p, i) { if (i) cc.lineTo(p[0], p[1]); else cc.moveTo(p[0], p[1]); }); }, colors['b-em'], 3.4);
    c.restore();
    if (E.r >= R_MIN) D.haloText(c, 'R = r', lx(E.r), m.t + 2, colors.muted, 'center', 'top', (L.fs - 0.5) + 'px ' + FONT);
    // 目前的負載
    const on = state.c.elements.every(function (e) { return e.type !== 'switch' || e.closed; });
    const Pnow = K.loadPower(E.emf, E.r, R), x0 = lx(R), y0 = ly(Pnow);
    c.globalAlpha = on ? 1 : 0.45;
    const halo = c.createRadialGradient(x0, y0, 0, x0, y0, 14);
    halo.addColorStop(0, alpha(colors.pos, 0.35)); halo.addColorStop(1, alpha(colors.pos, 0));
    c.fillStyle = halo; c.beginPath(); c.arc(x0, y0, 14, 0, Math.PI * 2); c.fill();
    D.ball(c, x0, y0, 5.5, colors.pos, { glow: 0 });
    const right = x0 > m.l + W * 0.6;
    D.haloText(c, 'P = ' + fmtP(Pnow) + (on ? '' : T('（開關斷開）', ' (switch open)')), x0 + (right ? -10 : 10), Math.max(m.t + 8, y0 - 12), colors.text, right ? 'right' : 'left', 'middle', '600 ' + L.fs + 'px ' + FONT);
    c.globalAlpha = 1;
    // 給螢幕閱讀器的圖說（參數改變時更新）
    const lab = T('輸出功率對負載電阻的關係圖：目前 R = ', 'Graph of output power against load resistance: now R = ') + fmtR(R) + T('，P = ', ', P = ') + fmtP(Pnow) +
      (E.r >= R_MIN ? T('；R = r = ', '; the peak is at R = r = ') + fmtR(E.r) + T(' 時輸出功率最大。', '.') : T('。', '.'));
    if (pr.getAttribute('aria-label') !== lab) pr.setAttribute('aria-label', lab);
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
      setHTML('dV', fmtV(b.Vt) + '<small>ε = ' + fmtV(E.emf) + T('，', ', ') + 'Ir = ' + fmtV(b.I * E.r) + '</small>');
      setHTML('dPe', fmtP(b.Pemf));
      setHTML('dPi', fmtP(b.Pint));
      setHTML('dPo', fmtP(b.Pout) + '<small>= ΣI<sup>2</sup>R</small>');
      setHTML('dEta', b.Pemf > 1e-12 ? num(b.eta * 100, 1) + '%' : T('—（沒有電流）', '— (no current)'));
    }
    const p = state.probes, dV = probeDV();
    if (p[0] == null || p[1] == null) setHTML('dProbe', T('—（點兩個接點）', '— (tap two junctions)'));
    else if (!isFinite(dV)) setHTML('dProbe', T('—（有一端與電池斷開）', '— (a probe is cut off from the battery)'));
    else setHTML('dProbe', fmtV(dV) + '<small>V<sub>' + T('紅', 'red') + '</sub> = ' + fmtV(s.V[p[0]]) + T('，', ', ') + 'V<sub>' + T('黑', 'black') + '</sub> = ' + fmtV(s.V[p[1]]) + '</small>');
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

  // ---------- 讀數播報（離散事件後，寫進 aria-live 的 #srLive；連續拖曳滑桿時不念） ----------
  let announceTimer = 0;
  function announce() {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(function () {
      const el = $('srLive'); if (!el || !state.sol) return;
      const s = state.sol, b = state.rep;
      let t;
      if (!s.ok) t = T('短路：電流無限大。', 'Short circuit: the current is unlimited.');
      else {
        t = T('總電流 I = ', 'Total current I = ') + fmtI(b.I) + T('，端電壓 V = ', ', terminal voltage V = ') + fmtV(b.Vt) +
          T('，輸出功率 ', ', output power ') + fmtP(b.Pout);
        const gk = elId('G');
        if (gk >= 0) t += T('，檢流計 ', ', galvanometer ') + fmtI(Math.abs(s.I[gk]));
        const dV = probeDV();
        if (state.probes[0] != null && state.probes[1] != null) t += T('，電壓表 ', ', voltmeter ') + (isFinite(dV) ? fmtV(dV) : T('沒有定義', 'undefined'));
        t += T('。', '.');
      }
      el.textContent = t;
    }, 350);
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
  function showOut(el, unit) {
    const out = $(el.id + 'o');
    out.textContent = fmtSlider(val(el), el) + ' ' + unit;
    // 數字按鈕的提示與無障礙名稱跟著標籤走：換選取的元件（R1 → R2…）或換語言時標籤會變，
    // 共用的 numinput.js 只在載入時設一次 title，所以在這裡同步（名稱含目前的值）
    const lab = document.querySelector('label[for="' + el.id + '"]');
    if (!lab) return;
    const name = lab.textContent.replace(/\s+/g, ' ').trim();
    out.setAttribute('title', T('點擊輸入數值：', 'Click to type a value: ') + name);
    out.setAttribute('aria-label', name + T('：', ': ') + out.textContent + T('（點擊輸入數值）', ' (click to type a value)'));
  }
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
    if (action) { emitMission(action, prevI); announce(); }
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
      announce();
    });
  });
  [2, 3].forEach(function (n) {
    $('count' + n).addEventListener('click', function () {
      if (state.count === n) return;
      setPreset(state.preset, n);
      emitMission('count', NaN);
      announce();
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
      const p = vis(n), d = Math.hypot(p[0] - x, p[1] - y);
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
    if (p[0] == null && p[1] != null) { if (n === p[1]) return; state.probes = [n, p[1]]; } // 只有黑探針（鍵盤先放的）：補上紅探針
    else if (p[0] == null || (p[0] != null && p[1] != null)) { state.probes = [n, null]; }
    else if (n === p[0]) return;
    else state.probes = [p[0], n];
    probeSound(state.probes[1] == null ? 0 : 1);
    rebuild();
    afterProbe();
  }
  function afterProbe() {
    if (state.probes[0] == null || state.probes[1] == null) {
      setStatus(state.probes[0] == null
        ? T('黑色探針（COM）已放好，再放紅色探針（＋）。', 'Black probe (COM) placed. Now place the red probe (+).')
        : T('紅色探針（＋）已放好，再點一個接點放黑色探針（COM）。', 'Red probe (+) placed. Tap another junction for the black probe (COM).'));
      return;
    }
    const dV = probeDV();
    setStatus(isFinite(dV) ? T('電壓表讀數 ', 'Voltmeter reads ') + fmtV(dV) + T('（紅 − 黑）。', ' (red − black).') : T('有一支探針接在與電池斷開的部分，電位差沒有定義。', 'One probe is on a part cut off from the battery, so the potential difference is undefined.'));
    emitMission('probe', currentI());
  }

  // ---------- 鍵盤操作（LabKeys）：Enter 切換紅、黑探針，方向鍵移到該方向最近的接點 ----------
  /** 從接點 from 往畫面方向 (dx, dy)（y 向下為正）找最近的接點；夾角超過 60° 的不算，skip 是另一支探針所在的接點 */
  function nodeStep(from, dx, dy, skip) {
    const p = P(from);
    let best = -1, bs = Infinity;
    for (let n = 0; n < state.c.n; n++) {
      if (n === from || n === skip) continue;
      const q = P(n), vx = q[0] - p[0], vy = q[1] - p[1], dist = Math.hypot(vx, vy);
      if (dist < 1) continue;
      const cos = (vx * dx + vy * dy) / dist;
      if (cos < 0.5) continue;
      const score = dist * (1 + 2.5 * (1 - cos));
      if (score < bs) { bs = score; best = n; }
    }
    return best;
  }
  function keyMove(i, dx, dy, big) {
    if (!state.c) return false;
    const p = state.probes;
    let n = p[i];
    if (n == null) {
      const E = state.c.elements[0];
      n = i === 0 ? E.b : E.a;              // 紅探針先放在電池正極、黑探針放在負極
      if (n === p[1 - i]) n = i === 0 ? E.a : E.b;
    } else {
      let steps = big ? 2 : 1, moved = false;
      while (steps--) { const m = nodeStep(n, dx, -dy, p[1 - i]); if (m < 0) break; n = m; moved = true; }
      if (!moved) return false;
    }
    const np = p.slice(); np[i] = n;
    state.probes = np;
    probeSound(i);
    rebuild();
    afterProbe();
    return true;
  }
  /** 接點的文字描述：電位相同（以導線相連）的部分接著哪些元件 */
  function nodeDesc(n) {
    const s = state.sol, cl = s.cluster[n], names = [];
    state.c.elements.forEach(function (e) {
      if (e.type === 'wire') return;
      const ia = s.cluster[e.a] === cl, ib = s.cluster[e.b] === cl;
      if (!ia && !ib) return;
      if (e.type === 'battery') names.push(ib ? T('電池正極', 'battery +') : T('電池負極', 'battery −'));
      else if (names.indexOf(e.id) < 0) names.push(e.id);
    });
    const V = s.ok && !s.floating[n] ? fmtV(s.V[n]) : T('沒有定義', 'undefined');
    return T('接在 ', 'on the junction of ') + names.join(T('、', ', ')) + T('（電位 ', ' (potential ') + V + T('）', ')');
  }
  function probeDescribe(i) {
    const n = state.probes[i];
    let t = (i === 0 ? T('紅探針', 'Red probe') : T('黑探針', 'Black probe')) + T('：', ': ') +
      (n == null ? T('還沒放上，按方向鍵放到電池', 'not placed yet; press an arrow key to put it on the battery') : nodeDesc(n));
    const dV = probeDV();
    if (state.probes[0] != null && state.probes[1] != null) t += T('；電壓表 ', '; voltmeter ') + (isFinite(dV) ? fmtV(dV) : T('沒有定義', 'undefined'));
    return t + T('。', '.');
  }
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('直流電路畫布：按 Enter 切換紅、黑探針，方向鍵把探針移到那個方向最近的接點，Shift 加方向鍵一次移兩個接點。電阻、燈泡與開關請用「元件」區的按鈕。',
        'DC circuit canvas: press Enter to switch between the red and black probes; the arrow keys move the probe to the nearest junction in that direction, Shift + arrow moves two junctions. Use the Components buttons for resistors, bulbs and switches.'),
      items: [
        { name: function () { return T('紅探針（＋）', 'Red probe (+)'); }, move: function (dx, dy, big) { return keyMove(0, dx, dy, big); }, describe: function () { return probeDescribe(0); } },
        { name: function () { return T('黑探針（COM）', 'Black probe (COM)'); }, move: function (dx, dy, big) { return keyMove(1, dx, dy, big); }, describe: function () { return probeDescribe(1); } }
      ],
      onChange: function () { if (L && state.c) { buildOver(); requestDraw(); } }
    });
  }

  // ---------- 分享目前設定：各元件的電阻、開關、探針位置、選取的元件（滑桿與電路按鈕由 classroom.js 記錄） ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      const R = {}, sw = {};
      state.c.elements.forEach(function (e) {
        if (e.type === 'R') R[e.id] = e.R;
        else if (e.type === 'switch') sw[e.id] = e.closed ? 1 : 0;
      });
      const sel = selected();
      return { p: state.preset, n: state.count, R: R, sw: sw, pr: state.probes.slice(), sel: sel ? sel.id : null };
    },
    set: function (o) {
      if (!o || typeof o !== 'object' || !state.c) return;
      if (typeof o.p === 'string' && o.p !== state.preset) return; // 電路沒有還原成同一個，就不套用
      if ((o.n === 2 || o.n === 3) && o.n !== state.count && (state.preset === 'series' || state.preset === 'parallel')) return;
      const els = state.c.elements;
      if (o.R && typeof o.R === 'object') els.forEach(function (e) {
        const v = +o.R[e.id];
        if (e.type === 'R' && isFinite(v)) e.R = Math.round(Math.min(R_MAX, Math.max(R_MIN, v)) * 100) / 100;
      });
      if (o.sw && typeof o.sw === 'object') els.forEach(function (e) { if (e.type === 'switch' && o.sw[e.id] != null) e.closed = !!o.sw[e.id]; });
      if (Array.isArray(o.pr)) {
        state.probes = [0, 1].map(function (i) { const n = o.pr[i]; return Number.isInteger(n) && n >= 0 && n < state.c.n ? n : null; });
        if (state.probes[0] != null && state.probes[0] === state.probes[1]) state.probes[1] = null;
      }
      if (o.sel != null) { const k = elId(String(o.sel)); if (k >= 0 && els[k].type === 'R') state.sel = k; }
      state.lever = {};
      solve();
      renderChips();
      refreshSelUI();
      rebuild();
      updateHum();
      announce();
    }
  });

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
  function themeChanged() {
    readColors();
    if (L) { buildBackground(); rebuild(); }
    // 換語言也會發 themechange：重寫「選取：R1」標籤與數字按鈕名稱
    refreshBatteryUI(); refreshSelUI();
  }
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
