/* earthquake.js — 「地震波與震央定位」的畫面與互動（物理計算在 earthquake-core.js；共用繪圖工具 LabDraw 在 drawkit.js） */
(function () {
  'use strict';
  const Q = window.QuakeCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const EN = !!(window.LabSettings && window.LabSettings.lang === 'en');
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const setVal = function (el, v) { if (window.LabNum) window.LabNum.set(el, v); else { el.value = v; el.dispatchEvent(new Event('input')); } };
  const reducedMotion = D.reducedMotion();
  const alpha = D.alpha, shade = D.shade, mix = D.mix;
  // 本檔的版本號（?v=）：切換到 3D 時動態載入的 js/earthquake-3d.js 沿用同一個版本號
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  const clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };

  // ---------- 色彩（lab.css 代號） ----------
  const C = {};
  const TOKENS = ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'pos', 'neg', 'equi', 'probe', 'field',
    'b-geo', 'b-ocean', 'b-wave', 'b-mech', 'b-optics', 'b-modern', 'b-em', 'b-thermo', 'd-earth'];
  const FALLBACK = { 'b-geo': 'equi', 'b-ocean': 'neg', 'b-wave': 'neg', 'b-mech': 'pos', 'b-optics': 'neg', 'b-modern': 'probe', 'b-em': 'neg', 'b-thermo': 'pos', 'd-earth': 'probe' };
  let colorsVer = 0;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    TOKENS.forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim(); });
    Object.keys(FALLBACK).forEach(function (k) { if (!C[k]) C[k] = C[FALLBACK[k]]; });
    C.dark = D.dark;
    C.P = C.neg; C.S = C.pos; C.R = C.equi;
    C.st = [C['b-optics'], C['b-mech'], C['b-modern'], C['b-em'], C['b-thermo']];
    C.rock = C.dark ? C['b-mech'] : C['b-geo']; // 岩石的色調（深色模式的琥珀色太亮，改用較暖的橙褐）
    colorsVer++;
  }
  function fnt(px, weight, italic) { return (italic ? 'italic ' : '') + (weight ? weight + ' ' : '') + px + 'px ' + FONT; }
  function fsk() { const f = window.LabSettings ? +window.LabSettings.get('fs') || 1 : 1; return 1 + (f - 1) * 0.7; }

  // ---------- 數字格式 ----------
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s;
  }
  function clock(sec) {
    sec = ((sec % 86400) + 86400) % 86400;
    const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = Math.floor(sec % 60);
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function minsec(t) {
    const r = Math.round(t), m = Math.floor(r / 60), s = r - 60 * m; // 先四捨五入到秒再拆，避免「18 分 60 秒」
    return EN ? m + ' min ' + num(s, 0) + ' s' : m + ' 分 ' + num(s, 0) + ' 秒';
  }

  // ---------- 畫布 ----------
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 300, L = null;
  const RAD = 9;
  function snap(v) { return (Math.round(v * dpr) + 0.5) / dpr; }
  function panel(c, R, fill) {
    D.roundRect(c, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, RAD);
    c.fillStyle = fill || alpha(C.surface, C.dark ? 0.5 : 0.75);
    c.fill();
    c.strokeStyle = alpha(C.text, C.dark ? 0.14 : 0.1);
    c.lineWidth = 1;
    c.stroke();
  }
  function clipR(c, R, r) { D.roundRect(c, R.x, R.y, R.w, R.h, r == null ? RAD : r); c.clip(); }
  function tag(c, text, x, yc, color, align, font) {
    c.font = font;
    const h = D.textHeight(c.measureText(text), 15) + 3;
    return D.pill(c, text, x, yc + h / 2, color, align, font);
  }
  function textW(c, text, font) { c.font = font; return c.measureText(text).width; }
  /** 主字＋小字下標（畫布不可用 Unicode 下標字元） */
  function subLabel(c, main, sub, x, y, color, px, align) {
    const f1 = fnt(px, 600, true), f2 = fnt(+(px * 0.72).toFixed(1), 600);
    const w1 = textW(c, main, f1), w2 = textW(c, sub, f2);
    const x0 = align === 'center' ? x - (w1 + w2) / 2 : align === 'right' ? x - w1 - w2 : x;
    D.haloText(c, main, x0, y, color, 'left', 'middle', f1);
    D.haloText(c, sub, x0 + w1 + 0.5, y + px * 0.3 * fsk(), color, 'left', 'middle', f2);
    return w1 + w2;
  }
  function star(c, x, y, r, color) {
    c.save();
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      if (i) c.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); else c.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
    }
    c.closePath();
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
    g.addColorStop(0, shade(color, 0.55));
    g.addColorStop(1, color);
    c.fillStyle = g;
    c.shadowColor = C.dark ? 'rgba(0,0,0,.5)' : alpha(C.text, 0.25);
    c.shadowBlur = 4; c.shadowOffsetY = 1;
    c.fill();
    c.shadowColor = 'transparent';
    c.strokeStyle = alpha(shade(color, -0.4), 0.9);
    c.lineWidth = 1;
    c.stroke();
    c.restore();
  }
  /** 地震站符號（倒三角形，立體） */
  function stationMark(c, x, y, s, color, hot) {
    c.save();
    if (hot) { c.fillStyle = alpha(color, 0.18); c.beginPath(); c.arc(x, y - s * 0.2, s * 1.45, 0, Math.PI * 2); c.fill(); }
    c.beginPath();
    c.moveTo(x - s, y - s * 0.9); c.lineTo(x + s, y - s * 0.9); c.lineTo(x, y + s * 0.85); c.closePath();
    const g = c.createLinearGradient(x - s, y - s, x + s, y + s);
    g.addColorStop(0, shade(color, 0.35)); g.addColorStop(0.55, color); g.addColorStop(1, shade(color, -0.3));
    c.fillStyle = g;
    c.shadowColor = C.dark ? 'rgba(0,0,0,.55)' : alpha(C.text, 0.3);
    c.shadowBlur = 5; c.shadowOffsetY = 1.5;
    c.fill();
    c.shadowColor = 'transparent';
    c.lineJoin = 'round';
    c.strokeStyle = alpha(C.surface, C.dark ? 0.6 : 0.95);
    c.lineWidth = 1.3;
    c.stroke();
    c.restore();
  }
  /** 你的震央標記：十字準星＋立體圓點（中心小白點就是標的位置）；hot = 拖曳中／游標在上面；sel = 兩個標記時微調鍵目前移動的那一個 */
  function drawMark(c, x, y, hot, sel) {
    c.save();
    if (hot) {
      const g = c.createRadialGradient(x, y, 4, x, y, 22);
      g.addColorStop(0, alpha(C.accent, 0.32)); g.addColorStop(1, alpha(C.accent, 0));
      c.fillStyle = g; c.beginPath(); c.arc(x, y, 22, 0, Math.PI * 2); c.fill();
    }
    if (sel) { c.setLineDash([3, 3]); c.strokeStyle = alpha(C.accent, 0.8); c.lineWidth = 1.3; c.beginPath(); c.arc(x, y, 13, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); }
    c.lineCap = 'round';
    const ticks = function () { c.beginPath(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { c.moveTo(x + d[0] * 9, y + d[1] * 9); c.lineTo(x + d[0] * 17, y + d[1] * 17); }); c.stroke(); };
    c.strokeStyle = alpha(C['canvas-bg'], 0.9); c.lineWidth = 4.2; ticks();
    c.strokeStyle = C.accent; c.lineWidth = 2; ticks();
    const g = c.createRadialGradient(x - 2.2, y - 2.2, 0.5, x, y, 7);
    g.addColorStop(0, shade(C.accent, 0.45)); g.addColorStop(0.7, C.accent); g.addColorStop(1, shade(C.accent, -0.25));
    c.shadowColor = C.dark ? 'rgba(0,0,0,.55)' : alpha(C.text, 0.3); c.shadowBlur = 5; c.shadowOffsetY = 1.5;
    c.fillStyle = g; c.beginPath(); c.arc(x, y, 6.5, 0, Math.PI * 2); c.fill();
    c.shadowColor = 'transparent';
    c.strokeStyle = alpha(C.surface, 0.95); c.lineWidth = 1.8; c.stroke();
    c.fillStyle = C.surface; c.beginPath(); c.arc(x, y, 1.6, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  function ringFx(c, fx, x, y, now) {
    const u = (now - fx.t0) / fx.dur;
    if (u >= 0 && u <= 1) D.ripple(c, x, y, fx.r || 10, u, fx.color);
  }

  // =====================================================================
  // 狀態
  // =====================================================================
  const S = {
    mode: 'waves',
    v3: false, // 3D 檢視開著：2D 畫布只畫紀錄、走時圖等輔助面板（主畫面由 3D 取代）
    slow: false,
    running: false,
    fx: [],
    w1: {
      h: 15, x: 60, vp: 6, vs: 3.5, medium: 'liquid', t: 0, tEnd: 60, user: false, done: false,
      show: { dots: true, fronts: true, ray: true }, arr: null, rec: null, chainSent: false
    },
    // marks：學生在地圖上點的震央標記（km）；nMarks：要標幾個（1 或 2，兩個可能位置時標 2 個）；mkActive：微調鍵移動的是哪一個
    // est：電腦的最小平方解（學生按「確認我的震央」之後才顯示；stale = 量測改過了，先藏起來）
    w2: { n: 3, quake: null, stations: [], rec: { t: 0, done: false }, est: null, history: [], vpc: 6, vsc: 3.5, chords: true, drag: null, active: null, seed: 1, ws: 0, we: 60,
      marks: [], nMarks: 1, mkActive: 0 },
    w3: { ready: false, wave: 'PS', takeoff: 20, deg: 60, fan: true, shadow: true, inner: true, t: 0, tEnd: 1320, user: false, done: false, logged: {} }
  };
  const SPEED1 = 4, SPEED2 = 8, SPEED3 = 60; // 畫面倍速（慢動作時再除以 4）
  let view3 = null; // 3D 檢視（js/earthquake-3d.js 建立；切回 2D 時釋放）

  // =====================================================================
  // 模式一：P 波、S 波與表面波
  // =====================================================================
  const X1 = { x0: -15, x1: 105, depth: 50 }; // 剖面範圍（km）；手機版在 layout1 改成 −8…102
  const CH = { L1: 30, L: 60, Tp: 2.2, t0: 0.4, rho1: 2.7, water: Q.WATER };
  let eigenTab = null, hv1 = 0.68, vr1 = 3.2;

  function w1Params() { return { vp: S.w1.vp, vs: S.w1.vs, h: S.w1.h, delta: S.w1.x, vr: vr1, hv: hv1, eigen: eigenAt }; }
  /** 雷利波的深度分布：預先算成表，畫面每幀查表（比每次解雷利方程式快） */
  function buildEigen() {
    const n = 120, tab = [];
    for (let i = 0; i <= n; i++) tab.push(Q.rayleighEigen(S.w1.vp, S.w1.vs, i / n * 1.2));
    eigenTab = tab;
    hv1 = tab[0].hv;
    vr1 = Q.rayleighSpeed(S.w1.vp, S.w1.vs);
  }
  function eigenAt(zl) {
    const n = eigenTab.length - 1, u = clamp(zl / 1.2, 0, 1) * n, i = Math.min(n - 1, Math.floor(u)), f = u - i;
    const a = eigenTab[i], b = eigenTab[i + 1];
    return { h: a.h + (b.h - a.h) * f, v: a.v + (b.v - a.v) * f };
  }
  /** 參數改變：重算到達時間與整段紀錄（50 Hz 取樣） */
  function recompute1() {
    const w = S.w1;
    buildEigen();
    w.arr = Q.arrivals(w.x, w.h, w.vp, w.vs);
    const tChain = CH.t0 + CH.L1 / w.vp + (CH.L - CH.L1) / (w.medium === 'liquid' ? CH.water.vp : w.vp) + CH.Tp;
    w.tEnd = Math.max(30, Math.ceil((Math.max(w.arr.tR + 20, tChain + 1)) / 5) * 5);
    const fs = 50, n = Math.round(w.tEnd * fs) + 1, z = new Float32Array(n), hh = new Float32Array(n);
    const o = w1Params();
    let mx = 1e-9;
    for (let i = 0; i < n; i++) {
      const u = Q.station1(i / fs, o);
      z[i] = u.z; hh[i] = u.h;
      mx = Math.max(mx, Math.abs(u.z), Math.abs(u.h));
    }
    w.rec = { fs: fs, z: z, h: hh, max: mx };
    w.coP = Q.interfaceCoeffs(CH.rho1, w.vp, w.medium === 'liquid' ? CH.water.rho : CH.rho1, w.medium === 'liquid' ? CH.water.vp : w.vp);
    w.coS = Q.interfaceCoeffs(CH.rho1, w.vs, w.medium === 'liquid' ? CH.water.rho : CH.rho1, w.medium === 'liquid' ? 0 : w.vs);
    readouts1();
  }
  function readouts1() {
    const w = S.w1, a = w.arr;
    $('r1R').textContent = num(a.R, 1) + ' km';
    $('r1P').textContent = num(a.tP, 2) + ' s';
    $('r1S').textContent = num(a.tS, 2) + ' s';
    $('r1SP').textContent = num(a.sp, 2) + ' s';
    $('r1k').innerHTML = num(Q.kFactor(w.vp, w.vs), 3) + ' km/s<small>kΔt = ' + num(Q.kFactor(w.vp, w.vs) * a.sp, 1) + ' km</small>';
    $('r1R2').textContent = num(a.tR, 2) + ' s';
    $('r1ratio').innerHTML = num(w.vp / w.vs, 3) + '<small>ν = ' + num(Q.poisson(w.vp, w.vs), 3) + (Math.abs(w.vp / w.vs - Math.sqrt(3)) < 0.003 ? T('（= √3）', ' (= √3)') : '') + '</small>';
    $('r1VR').innerHTML = num(vr1, 3) + ' km/s<small>V<sub>R</sub>/V<sub>S</sub> = ' + num(vr1 / w.vs, 4) + '</small>';
  }

  function layout1() {
    const W = cw, narrow = W < 560;
    X1.x0 = narrow ? -8 : -15; X1.x1 = narrow ? 102 : 105;
    const k = W / (X1.x1 - X1.x0);
    const sky = narrow ? 34 : 40;
    // 3D 檢視時剖面由 3D 畫，2D 畫布只留地震儀紀錄、地面運動軌跡與液體長條
    const secH = S.v3 ? 0 : Math.round(sky + X1.depth * k);
    const gap = narrow ? 6 : 8;
    const trH = narrow ? 132 : 150;
    const hs = narrow ? Math.min(trH, Math.round(W * 0.34)) : trH;
    const chainH = narrow ? 118 : 128;
    const y2 = S.v3 ? 0 : secH + gap, y3 = y2 + trH + gap;
    return {
      narrow: narrow, k: k, sky: sky, gap: gap,
      sec: { x: 0, y: 0, w: W, h: secH },
      tr: { x: 0, y: y2, w: W - hs - gap, h: trH },
      hodo: { x: W - hs, y: y2, w: hs, h: trH },
      chain: { x: 0, y: y3, w: W, h: chainH },
      H: y3 + chainH,
      dot: narrow ? 2.4 : 3
    };
  }
  function X1px(x) { return (x - X1.x0) * L.k; }
  function Y1px(d) { return L.sky + d * L.k; }

  // ---------- 模式一：不變的圖層 ----------
  const bg = document.createElement('canvas'), bgc = bg.getContext('2d');
  let bgKey = '';
  function rockColor(u) { return mix(C['canvas-bg'], C.rock, (C.dark ? 0.08 : 0.12) + u * (C.dark ? 0.09 : 0.13)); }
  function buildBg1() {
    const c = bgc, R = L.sec;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    D.backdrop(c, cw, ch);
    if (S.v3) return; // 3D 檢視：剖面在 3D 裡
    // 天空
    const sky = c.createLinearGradient(0, 0, 0, L.sky);
    sky.addColorStop(0, alpha(C['b-wave'], C.dark ? 0.1 : 0.08));
    sky.addColorStop(1, alpha(C['b-wave'], 0));
    c.fillStyle = sky; c.fillRect(0, 0, cw, L.sky);
    // 地殼（上淺下深）
    const g = c.createLinearGradient(0, L.sky, 0, R.h);
    g.addColorStop(0, rockColor(0)); g.addColorStop(1, rockColor(1));
    c.fillStyle = g; c.fillRect(0, L.sky, cw, R.h - L.sky);
    // 岩石紋理（純裝飾的細點）
    const r = Q.rng(7);
    for (let i = 0; i < (cw * (R.h - L.sky)) / 260; i++) {
      const x = r() * cw, y = L.sky + 2 + r() * (R.h - L.sky - 2), s = 0.6 + r() * 1.1;
      c.fillStyle = alpha(r() < 0.5 ? shade(C.rock, -0.3) : C.surface, C.dark ? 0.1 : 0.18);
      c.fillRect(x, y, s, s * 0.7);
    }
    // 深度刻度
    c.strokeStyle = alpha(C.text, C.dark ? 0.1 : 0.08);
    c.lineWidth = 1 / dpr;
    c.beginPath();
    for (let d = 10; d < X1.depth; d += 10) { const y = snap(Y1px(d)); c.moveTo(0, y); c.lineTo(cw, y); }
    c.stroke();
    const f = fnt(L.narrow ? 10.5 : 11.5);
    // 深度刻度：手機版震源就在左緣，刻度改放右緣，免得和「震源」標籤疊在一起
    for (let d = 10; d < X1.depth; d += 10) {
      if (L.narrow) D.haloText(c, d + ' km', cw - 4, Y1px(d) - 1, alpha(C.text, 0.62), 'right', 'bottom', f);
      else D.haloText(c, d + ' km', 4, Y1px(d) - 1, alpha(C.text, 0.62), 'left', 'bottom', f);
    }
    // 地表下的薄土層（靜態的淡色帶，讓地表有厚度）
    const soil = c.createLinearGradient(0, L.sky, 0, L.sky + 7);
    soil.addColorStop(0, alpha(shade(C.rock, C.dark ? -0.1 : -0.25), C.dark ? 0.32 : 0.26));
    soil.addColorStop(1, alpha(C.rock, 0));
    c.fillStyle = soil; c.fillRect(0, L.sky, cw, 7);
    // 距離刻度（沿地表，自震央量起）
    for (let x = 0; x <= X1.x1; x += 20) {
      const px = snap(X1px(x));
      c.strokeStyle = alpha(C.text, 0.35); c.lineWidth = 1;
      c.beginPath(); c.moveTo(px, L.sky - 4); c.lineTo(px, L.sky); c.stroke();
      if (x > 0 && px < cw - (L.narrow ? 30 : 120)) D.haloText(c, String(x), px, L.sky - 6, alpha(C.text, 0.55), 'center', 'bottom', f);
    }
    D.haloText(c, L.narrow ? 'km' : T('距震央 km', 'km from epicenter'), cw - 4, L.sky - 6, alpha(C.text, 0.55), 'right', 'bottom', f);
    D.haloText(c, T('均勻地殼（剖面，依比例）', 'Uniform crust (section, to scale)'), cw - 6, R.h - 6, alpha(C.text, 0.5), 'right', 'bottom', f);
  }

  // ---------- 模式一：繪圖 ----------
  function vis(u) { // 位移的放大（示意）：小振動也看得見，大振動不超過格距的一半
    const m = Math.hypot(u.ux, u.uy);
    if (m < 1e-9) return [0, 0];
    const s = Math.tanh(m / 0.55) * 0.48 / m;
    return [u.ux * s, -u.uy * s];
  }
  function draw1(now) {
    const w = S.w1, c = ctx, t = w.t, o = w1Params();
    const key = [cw, ch, dpr, colorsVer, D.ver, 'w1', S.v3].join('|');
    if (key !== bgKey) { buildBg1(); bgKey = key; }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(bg, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (S.v3) { drawTraces1(c); drawHodo1(c); drawChain(c, now); return; }
    const fx = X1px(0), fy = Y1px(w.h), sx = X1px(w.x), surf = L.sky;
    const sp = 8 * L.k; // 質點格距 px

    // 波前（只畫在地殼裡）：波前後方一條漸淡的光帶（剛被波經過的岩石），波前本身是一條清楚的細線
    c.save();
    c.beginPath(); c.rect(0, surf, cw, L.sec.h - surf); c.clip();
    if (w.show.fronts) {
      const band = L.narrow ? 9 : 13;
      [[w.vp, C.P, 'P'], [w.vs, C.S, 'S']].forEach(function (q) {
        const r = q[0] * t * L.k;
        if (r <= 1) return;
        const r0 = Math.max(0, r - band);
        const g = c.createRadialGradient(fx, fy, r0, fx, fy, r);
        g.addColorStop(0, alpha(q[1], 0));
        g.addColorStop(0.7, alpha(q[1], C.dark ? 0.12 : 0.09));
        g.addColorStop(1, alpha(q[1], C.dark ? 0.3 : 0.24));
        c.fillStyle = g;
        c.beginPath(); c.arc(fx, fy, r, 0, Math.PI * 2); if (r0 > 0) c.arc(fx, fy, r0, 0, Math.PI * 2, true); c.fill();
        c.strokeStyle = alpha(q[1], C.dark ? 0.22 : 0.16);
        c.lineWidth = 4;
        c.beginPath(); c.arc(fx, fy, r, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = alpha(q[1], 0.92);
        c.lineWidth = 1.6;
        c.beginPath(); c.arc(fx, fy, r, 0, Math.PI * 2); c.stroke();
      });
    }
    // 射線（震源 → 測站）
    if (w.show.ray) {
      c.setLineDash([5, 4]);
      c.strokeStyle = alpha(C.text, 0.55); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(fx, fy); c.lineTo(sx, surf); c.stroke();
      c.setLineDash([]);
    }
    // 質點
    if (w.show.dots) {
      const rock = C.dark ? mix(C.rock, C['canvas-bg'], 0.45) : shade(C.rock, -0.05);
      for (let d = 4; d < X1.depth; d += 8) {
        for (let x = X1.x0 + 4; x < X1.x1; x += 8) {
          const u = Q.sectionDisp(x, d, t, o), v = vis(u);
          const mP = Math.hypot(u.P.ux, u.P.uy), mS = Math.hypot(u.S.ux, u.S.uy), mR = Math.hypot(u.R.ux, u.R.uy);
          const mm = Math.max(mP, mS, mR);
          let col = rock;
          if (mm > 0.04) col = mm === mP ? C.P : mm === mS ? C.S : C.R;
          const px = X1px(x), py = Y1px(d), qx = px + v[0] * sp, qy = py + v[1] * sp;
          if (mm > 0.04) {
            c.strokeStyle = alpha(col, 0.55); c.lineWidth = 1;
            c.beginPath(); c.moveTo(px, py); c.lineTo(qx, qy); c.stroke();
          }
          D.ball(c, qx, qy, L.dot, col, { shadow: false, glow: 0 });
        }
      }
    }
    c.restore();

    // 地表（隨垂直位移起伏）＋表面波波前：地面隆起處補上岩石色、下陷處補回天空色，地表線畫成有厚度的管狀
    const ground = [];
    for (let px = 0; px <= cw + 2; px += 3) {
      const x = X1.x0 + px / L.k, u = Q.sectionDisp(x, 0, t, o), v = vis(u);
      ground.push([px, surf + v[1] * sp * 0.8]);
    }
    const groundPath = function () {
      c.beginPath();
      ground.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
    };
    c.save();
    c.beginPath(); c.rect(0, 0, cw, surf); c.clip();
    groundPath(); c.lineTo(cw + 2, surf); c.lineTo(0, surf); c.closePath();
    c.fillStyle = rockColor(0); c.fill();
    c.restore();
    c.save();
    c.beginPath(); c.rect(0, surf, cw, 30); c.clip();
    groundPath(); c.lineTo(cw + 2, surf); c.lineTo(0, surf); c.closePath();
    c.fillStyle = C['canvas-bg']; c.fill();
    c.restore();
    c.save();
    c.lineJoin = 'round'; c.lineCap = 'round';
    groundPath();
    c.strokeStyle = shade(C.rock, C.dark ? -0.1 : -0.35);
    c.lineWidth = 3.2;
    c.stroke();
    c.translate(0, -0.7);
    groundPath();
    c.strokeStyle = shade(C.rock, C.dark ? 0.35 : 0.05);
    c.lineWidth = 1.2;
    c.stroke();
    c.restore();
    if (w.show.fronts && t > w.h / w.vs) {
      const xr = vr1 * (t - w.h / w.vs);
      [xr, -xr].forEach(function (x) {
        const px = X1px(x);
        if (px < -10 || px > cw + 10) return;
        c.fillStyle = alpha(C.R, 0.85);
        c.beginPath(); c.arc(px, surf, 3.5, 0, Math.PI * 2); c.fill();
      });
    }

    // 波前標籤
    const fLab = fnt(L.narrow ? 11 : 12, 700);
    if (w.show.fronts) {
      const lab = [[w.vp, C.P, 'P'], [w.vs, C.S, 'S']];
      lab.forEach(function (q, i) {
        const r = q[0] * t;
        if (r < 1) return;
        // 在波前上找一個落在剖面裡的位置放標籤（P、S 用不同的角度，避免重疊；角度由 +x 軸逆時針量起，向下為負）
        const cands = i ? [205, 300, 230, 330, 345, 15] : [225, 318, 250, 340, 352, 25];
        for (let k = 0; k < cands.length; k++) {
          const a = cands[k] * Math.PI / 180, lx = fx + r * L.k * Math.cos(a), ly = fy - r * L.k * Math.sin(a);
          if (ly > surf + 10 && ly < L.sec.h - 26 && lx > 14 && lx < cw - 14) { tag(c, q[2], lx, ly, q[1], 'center', fLab); break; }
        }
      });
      if (t > w.h / w.vs) {
        const xr = vr1 * (t - w.h / w.vs), px = X1px(xr);
        if (px < cw - 30 && Math.abs(px - fx) > 52 && Math.abs(px - sx) > 52) tag(c, T('表面波', 'Surface'), px, surf - 12, C.R, 'center', fnt(L.narrow ? 10.5 : 11.5, 700));
      }
    }

    // 震央與震源
    const fS = fnt(L.narrow ? 11 : 12, 600);
    c.strokeStyle = alpha(C.text, 0.5); c.lineWidth = 1; c.setLineDash([2, 3]);
    c.beginPath(); c.moveTo(fx, surf); c.lineTo(fx, fy); c.stroke(); c.setLineDash([]);
    tag(c, T('震央', 'Epicenter'), fx, surf - 12, C.text, 'center', fS);
    if (S.drag1 === 'focus' || S.hover1 === 'focus') { c.fillStyle = alpha(C.pos, 0.15); c.beginPath(); c.arc(fx, fy, 15, 0, Math.PI * 2); c.fill(); }
    const glow = c.createRadialGradient(fx, fy, 0, fx, fy, L.narrow ? 16 : 20);
    glow.addColorStop(0, alpha(C.pos, C.dark ? 0.4 : 0.28)); glow.addColorStop(1, alpha(C.pos, 0));
    c.fillStyle = glow; c.beginPath(); c.arc(fx, fy, L.narrow ? 16 : 20, 0, Math.PI * 2); c.fill();
    star(c, fx, fy, L.narrow ? 8 : 9.5, C.pos);
    if (kbIs('focus')) kbBox(c, fx - 15, fy - 15, 30, 30);
    D.haloText(c, T('震源', 'Focus') + ' ' + num(w.h, w.h % 1 ? 1 : 0) + ' km', fx + 13, fy, C.text, 'left', 'middle', fS);
    if (w.show.ray && w.x > 6) {
      const mx = fx + (sx - fx) * 0.66, my = fy + (surf - fy) * 0.66;
      D.haloText(c, 'R = ' + num(w.arr.R, 1) + ' km', mx + 4, my + 11, alpha(C.text, 0.85), 'left', 'middle', fnt(L.narrow ? 10.5 : 11.5, 600, true));
    }
    // 地震儀
    drawSeismometer(c, sx, surf, now);

    // 時間
    tag(c, 't = ' + num(t, 1) + ' s' + (S.running && S.mode === 'waves' ? '  (' + (S.slow ? SPEED1 / 4 : SPEED1) + '×)' : ''), 6, L.sec.h - 13, C.text, 'left', fnt(L.narrow ? 11 : 12, 600));

    drawTraces1(c);
    drawHodo1(c);
    drawChain(c, now);
  }
  function drawSeismometer(c, x, y, now) {
    const s = L.narrow ? 7 : 8.5;
    const hot = S.drag1 === 'station' || S.hover1 === 'station';
    if (hot) { c.fillStyle = alpha(C.accent, 0.16); c.beginPath(); c.arc(x, y - s, s * 2.2, 0, Math.PI * 2); c.fill(); }
    S.fx.forEach(function (f) { if (f.where === 'st1') ringFx(c, f, x, y - s, now); });
    D.block(c, x - s, y - 2 * s, 2 * s, 2 * s, mix(C.text, C['canvas-bg'], C.dark ? 0.45 : 0.3), { r: 3 });
    // 擺錘記號
    c.strokeStyle = alpha(C.surface, 0.85); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x, y - 2 * s + 3); c.lineTo(x, y - s * 0.7); c.stroke();
    c.fillStyle = alpha(C.surface, 0.95); c.beginPath(); c.arc(x, y - s * 0.6, s * 0.28, 0, Math.PI * 2); c.fill();
    if (kbIs('station')) kbBox(c, x - s - 6, y - 2 * s - 6, 2 * s + 12, 2 * s + 10);
    tag(c, T('地震儀', 'Seismometer'), x, y - 2 * s - 12, C.text, x > cw - 60 ? 'right' : 'center', fnt(L.narrow ? 10.5 : 11.5, 600));
  }
  function drawTraces1(c) {
    const w = S.w1, R = L.tr, rec = w.rec;
    panel(c, R);
    const pad = 8, lab = L.narrow ? 46 : 64;
    const x0 = R.x + lab, x1 = R.x + R.w - pad;
    const rowH = (R.h - 22) / 2;
    const tx = function (t) { return x0 + (t / w.tEnd) * (x1 - x0); };
    const sc = rowH * 0.44 / rec.max;
    const fL = fnt(L.narrow ? 10.5 : 11.5, 600), fA = fnt(L.narrow ? 10 : 11);
    // 時間軸
    const yAx = R.y + 2 * rowH + 6;
    c.strokeStyle = alpha(C.text, 0.3); c.lineWidth = 1;
    c.beginPath(); c.moveTo(x0, snap(yAx)); c.lineTo(x1, snap(yAx)); c.stroke();
    const step = w.tEnd > 60 ? 20 : 10;
    // 刻度每 step 一根；數字的間距至少約 46 px（手機上不擠在一起）
    const every = Math.max(1, Math.ceil(46 / ((x1 - x0) * step / w.tEnd)));
    for (let s = 0, i = 0; s <= w.tEnd + 1e-9; s += step, i++) {
      const px = snap(tx(s));
      c.beginPath(); c.moveTo(px, yAx); c.lineTo(px, yAx + 4); c.stroke();
      if (i % every === 0) D.haloText(c, s + ' s', px, yAx + 5, alpha(C.text, 0.6), s === 0 ? 'left' : 'center', 'top', fA);
    }
    // 到達時刻
    const a = w.arr;
    [[a.tP, C.P, 'P'], [a.tS, C.S, 'S'], [a.tR, C.R, T('表面波', 'Surface')]].forEach(function (q) {
      if (q[0] > w.tEnd) return;
      const px = snap(tx(q[0])), on = w.t >= q[0];
      c.setLineDash([3, 3]);
      c.strokeStyle = alpha(q[1], on ? 0.75 : 0.25); c.lineWidth = 1;
      c.beginPath(); c.moveTo(px, R.y + 4); c.lineTo(px, yAx); c.stroke();
      c.setLineDash([]);
      if (on) tag(c, q[2], px + 3, R.y + 11, q[1], 'left', fnt(L.narrow ? 10 : 11, 700));
    });
    // 兩個分量
    [['z', T('垂直', 'Vertical'), T('上下', 'up–down')], ['h', T('水平', 'Horizontal'), T('前後', 'radial')]].forEach(function (comp, i) {
      const yc = R.y + rowH * (i + 0.5) + 4;
      c.strokeStyle = alpha(C.text, 0.12); c.lineWidth = 1;
      c.beginPath(); c.moveTo(x0, snap(yc)); c.lineTo(x1, snap(yc)); c.stroke();
      D.haloText(c, comp[1], R.x + 8, yc - 6, C.text, 'left', 'middle', fL);
      D.haloText(c, comp[2], R.x + 8, yc + 8, alpha(C.text, 0.55), 'left', 'middle', fA);
      const arr = rec[comp[0]], n = Math.min(arr.length - 1, Math.floor(w.t * rec.fs));
      if (n < 1) return;
      c.save();
      c.beginPath(); c.rect(x0, R.y + 2, x1 - x0, 2 * rowH); c.clip();
      c.beginPath();
      for (let k = 0; k <= n; k++) {
        const px = tx(k / rec.fs), py = yc - arr[k] * sc;
        if (k) c.lineTo(px, py); else c.moveTo(px, py);
      }
      c.lineJoin = 'round';
      c.strokeStyle = alpha(C.text, 0.85); c.lineWidth = 1.2;
      c.stroke();
      c.restore();
      // 筆
      const pxN = tx(n / rec.fs), pyN = yc - arr[n] * sc;
      if (w.t < w.tEnd) { c.fillStyle = C.accent; c.beginPath(); c.arc(pxN, pyN, 2.6, 0, Math.PI * 2); c.fill(); }
    });
    if (!L.narrow) D.haloText(c, T('地震儀紀錄', 'Seismogram'), x1, R.y + 11, alpha(C.text, 0.6), 'right', 'middle', fA);
  }
  function drawHodo1(c) {
    const w = S.w1, R = L.hodo, rec = w.rec;
    panel(c, R);
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2 + 6, half = Math.min(R.w, R.h) / 2 - 16;
    const sc = half / rec.max;
    const fA = fnt(L.narrow ? 9.5 : 10.5);
    c.strokeStyle = alpha(C.text, 0.18); c.lineWidth = 1;
    c.beginPath(); c.moveTo(snap(cx), cy - half); c.lineTo(snap(cx), cy + half); c.moveTo(cx - half, snap(cy)); c.lineTo(cx + half, snap(cy)); c.stroke();
    D.haloText(c, T('垂直', 'up'), cx + 3, cy - half + 2, alpha(C.text, 0.55), 'left', 'top', fA);
    D.haloText(c, T('水平', 'radial'), cx + half, cy + 3, alpha(C.text, 0.55), 'right', 'top', fA);
    D.haloText(c, T('地面運動軌跡', 'Ground motion'), R.x + 6, R.y + 10, alpha(C.text, 0.75), 'left', 'middle', fnt(L.narrow ? 9.5 : 11, 600));
    const n = Math.min(rec.z.length - 1, Math.floor(w.t * rec.fs));
    if (n < 1) return;
    const a = w.arr;
    let seg = -1;
    for (let k = 1; k <= n; k++) {
      const tk = k / rec.fs;
      const s2 = tk >= a.tR ? 2 : tk >= a.tS ? 1 : 0;
      if (s2 !== seg) {
        if (seg >= 0) c.stroke();
        seg = s2;
        c.beginPath();
        c.moveTo(cx + rec.h[k - 1] * sc, cy - rec.z[k - 1] * sc);
        c.strokeStyle = alpha([C.P, C.S, C.R][seg], 0.85);
        c.lineWidth = 1.3;
      }
      c.lineTo(cx + rec.h[k] * sc, cy - rec.z[k] * sc);
    }
    c.stroke();
    D.ball(c, cx + rec.h[n] * sc, cy - rec.z[n] * sc, 3.2, C.accent, { shadow: false });
  }
  function drawChain(c, now) {
    const w = S.w1, R = L.chain;
    panel(c, R);
    const lab = L.narrow ? 52 : 92, x0 = R.x + lab, x1 = R.x + R.w - 10;
    const k = (x1 - x0) / CH.L, xi = x0 + CH.L1 * k;
    const rowH = (R.h - 26) / 2;
    const liquid = w.medium === 'liquid';
    const v2p = liquid ? CH.water.vp : w.vp, v2s = liquid ? 0 : w.vs;
    const f = Q.pulse(CH.Tp), t = w.t - CH.t0;
    const fL = fnt(L.narrow ? 10.5 : 11.5, 700), fA = fnt(L.narrow ? 9.5 : 10.5);
    // 介質底色
    [0, 1].forEach(function (row) {
      const y0 = R.y + 20 + row * rowH, y1 = y0 + rowH - 4;
      const g1 = c.createLinearGradient(0, y0, 0, y1);
      g1.addColorStop(0, rockColor(0.2)); g1.addColorStop(1, rockColor(0.7));
      c.fillStyle = g1; D.roundRect(c, x0, y0, xi - x0, y1 - y0, 4); c.fill();
      const g2 = c.createLinearGradient(0, y0, 0, y1);
      if (liquid) { g2.addColorStop(0, alpha(C['b-ocean'], C.dark ? 0.24 : 0.14)); g2.addColorStop(1, alpha(C['b-ocean'], C.dark ? 0.36 : 0.24)); }
      else { g2.addColorStop(0, rockColor(0.2)); g2.addColorStop(1, rockColor(0.7)); }
      c.fillStyle = g2; D.roundRect(c, xi, y0, x1 - xi, y1 - y0, 4); c.fill();
    });
    c.strokeStyle = alpha(C.text, 0.45); c.lineWidth = 1.2; c.setLineDash([4, 3]);
    c.beginPath(); c.moveTo(snap(xi), R.y + 18); c.lineTo(snap(xi), R.y + R.h - 6); c.stroke(); c.setLineDash([]);
    D.haloText(c, T('岩石', 'Rock') + (L.narrow ? '' : '  ρ = 2.7'), x0 + 4, R.y + 10, alpha(C.text, 0.75), 'left', 'middle', fA);
    D.haloText(c, (liquid ? T('水（液體）', 'Water (liquid)') : T('岩石', 'Rock')) + (L.narrow ? '' : '  ρ = ' + (liquid ? '1.0' : '2.7')), xi + 6, R.y + 10, alpha(C.text, 0.75), 'left', 'middle', fA);
    // 兩列質點
    const step = 1.5, rows = [
      { name: T('P 波', 'P wave'), sub: T('縱波', 'long.'), v1: w.vp, v2: v2p, co: w.coP, col: C.P, dir: 'x' },
      { name: T('S 波', 'S wave'), sub: T('橫波', 'trans.'), v1: w.vs, v2: v2s, co: w.coS, col: C.S, dir: 'y' }
    ];
    rows.forEach(function (rw, i) {
      const yc = R.y + 20 + i * rowH + (rowH - 4) / 2;
      D.haloText(c, rw.name, R.x + 8, yc - 6, rw.col, 'left', 'middle', fL);
      D.haloText(c, rw.sub, R.x + 8, yc + 8, alpha(C.text, 0.55), 'left', 'middle', fA);
      const pts = [];
      for (let x = 0; x <= CH.L + 1e-9; x += step) {
        const u = Q.chainDisp(x, t, CH.L1, rw.v1, rw.v2, rw.co, f);
        const ux = rw.dir === 'x' ? u * k * 1.1 : 0, uy = rw.dir === 'y' ? -u * rowH * 0.26 : 0;
        pts.push([x0 + x * k + ux, yc + uy, Math.abs(u)]);
      }
      c.strokeStyle = alpha(C.text, 0.32); c.lineWidth = 1;
      c.beginPath(); pts.forEach(function (p, j) { if (j) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.stroke();
      pts.forEach(function (p) { D.ball(c, p[0], p[1], L.narrow ? 2.4 : 2.9, p[2] > 0.08 ? rw.col : shade(C.text, C.dark ? -0.3 : 0.35), { shadow: false, glow: 0 }); });
      // 係數
      const txt = rw.v2 > 0
        ? T('反射 r = ', 'r = ') + num(rw.co.r, 2) + T('　透射 τ = ', '   τ = ') + num(rw.co.t, 2)
        : T('全反射：液體不能剪切，S 波進不去', 'Totally reflected: a liquid cannot be sheared');
      if (rw.v2 === 0) tag(c, txt, x1 - 4, yc + rowH / 2 - 7, rw.col, 'right', fA); // 全反射的說明放在底框裡，不和質點混在一起
      else if (!L.narrow) D.haloText(c, txt, x1 - 4, yc + rowH / 2 - 7, alpha(C.text, 0.6), 'right', 'middle', fA);
    });
    S.fx.forEach(function (fx) { if (fx.where === 'chain') ringFx(c, fx, xi, R.y + 20 + rowH * 1.5 - 2, now); });
  }

  // ---------- 模式一：動畫中的事件 ----------
  function events1(t0, t1) {
    const w = S.w1, a = w.arr, now = performance.now();
    const hit = function (tt) { return t0 < tt && t1 >= tt; };
    if (hit(a.tP)) { rumble('P'); fxAdd('st1', C.P); }
    if (hit(a.tS)) { rumble('S'); fxAdd('st1', C.S); }
    if (hit(a.tR)) { rumble('R'); fxAdd('st1', C.R); }
    const tRefl = CH.t0 + CH.L1 / w.vs + CH.Tp / 2;
    if (hit(tRefl)) {
      fxAdd('chain', C.S);
      if (w.medium === 'liquid') setStatus(T('S 波碰到液體：液體不能剪切，S 波全部反射回去。P 波則穿進水中、變慢。', 'The S wave meets the liquid: a liquid cannot be sheared, so the S wave is totally reflected. The P wave goes on into the water, more slowly.'));
    }
    const tDone = CH.t0 + 2 * CH.L1 / w.vs + CH.Tp + 0.3;
    if (hit(tDone) && w.user && !w.chainSent) {
      w.chainSent = true;
      emit('chain', { medium: w.medium, vp: w.vp, vs: w.vs, rP: w.coP.r, tP: w.coP.t, rS: w.coS.r, tS: w.coS.t });
    }
    void now;
  }
  function fxAdd(where, color, r) { if (!reducedMotion) S.fx.push({ where: where, color: color, t0: performance.now(), dur: 520, r: r || 12 }); }
  function rumble(kind) {
    if (!window.LabSound) return;
    // 低沉的隆隆聲：濾波雜訊，主頻在 250 Hz 以上（手機小喇叭聽得到）
    if (kind === 'P') window.LabSound.noise({ dur: 0.35, gain: 0.32, filter: 380, q: 0.9 });
    else if (kind === 'S') window.LabSound.noise({ dur: 0.6, gain: 0.5, filter: 300, q: 0.8 });
    else window.LabSound.noise({ dur: 1.1, gain: 0.55, filter: 260, q: 0.6, attack: 0.08 });
  }
  function ding() {
    if (!window.LabSound) return;
    window.LabSound.tone({ freq: 1318.5, dur: 0.35, gain: 0.28 });
    window.LabSound.tone({ freq: 1975.5, dur: 0.3, gain: 0.12, delay: 0.02 });
  }

  // =====================================================================
  // 模式二：三站定位震央
  // =====================================================================
  const LETTERS = ['A', 'B', 'C', 'D', 'E'];
  const DEFAULT_CITIES = ['TPE', 'HUA', 'KHH', 'TXG', 'TTT'];
  const MAPX0 = (Q.MAP.lon0 - Q.LON0) * Q.KX, MAPX1 = (Q.MAP.lon1 - Q.LON0) * Q.KX;
  const MAPY0 = (Q.MAP.lat0 - Q.LAT0) * Q.KY, MAPY1 = (Q.MAP.lat1 - Q.LAT0) * Q.KY;
  const VP_TRUE = Q.CRUST.vp, VS_TRUE = Q.CRUST.vs;
  function city(id) { return Q.CITIES.find(function (c) { return c.id === id; }); }
  function cityName(cid) { const c = city(cid); return c ? T(c.zh, c.en) : ''; }

  function initStations() {
    S.w2.stations = DEFAULT_CITIES.map(function (id, i) {
      const c = city(id), p = Q.toXY(c.lon, c.lat);
      return { label: LETTERS[i], city: id, x: p.x, y: p.y, picks: { p: null, s: null, mp: false, ms: false, auto: false }, ver: 0 };
    });
  }
  function activeStations() { return S.w2.stations.slice(0, S.w2.n); }
  /** 新地震：source = 'random' | 'manual' | 'preset' */
  function newQuake(q, source) {
    const w = S.w2;
    w.seed = q.seed != null ? q.seed >>> 0 : (w.seed * 1103515245 + 12345 + Math.floor(Math.random() * 1e6)) >>> 0;
    const p = Q.toXY(q.lon, q.lat);
    w.quake = {
      lon: q.lon, lat: q.lat, x: p.x, y: p.y, h: q.h, source: source, revealed: source !== 'random',
      T0: q.T0 != null ? q.T0 : Math.floor(Math.random() * 86400), seed: w.seed
    };
    w.est = null;
    w.marks = []; w.mkActive = 0;
    w.stations.forEach(function (s) { resetPicks(s); });
    updateQuakeData();
    startRecording();
    buildKbItems();
    // 讀數一定要跟著新地震更新：「自己指定震央」「集集」一開始就顯示震央，舊地震的標記、電腦解、「還沒顯示」不可留在面板上
    refreshPicks();
  }
  function resetPicks(s) { s.picks = { p: null, s: null, mp: false, ms: false, auto: false }; }
  /** 每個測站的到達時間與紀錄（含誤差時：每條路徑的波速有 ±3% 的隨機誤差） */
  function stationData(s, i) {
    const q = S.w2.quake, err = $('errMode').checked;
    const r = Q.rng((q.seed ^ (i * 2654435761)) >>> 0);
    const ec = err ? (r() * 2 - 1) * 0.03 : 0, ep = err ? (r() * 2 - 1) * 0.004 : 0, es = err ? (r() * 2 - 1) * 0.004 : 0;
    const vp = VP_TRUE * (1 + ec + ep), vs = VS_TRUE * (1 + ec + es);
    const delta = Math.hypot(s.x - q.x, s.y - q.y), a = Q.arrivals(delta, q.h, vp, vs);
    s.arr = a; s.vp = vp; s.vs = vs; s.err = err;
    s.trace = Q.makeTrace({ tP: a.tP, tS: a.tS, tR: a.tR, R: a.R, delta: delta, h: q.h, seed: (q.seed + i * 977) >>> 0, noise: err ? 0.22 : 0.035 });
    s.ver++;
  }
  function updateQuakeData() {
    const w = S.w2;
    w.stations.forEach(stationData);
    updateWindow();
    refreshPicks();
  }
  function updateWindow() {
    const w = S.w2, st = activeStations();
    let mn = 1e9, mx = 0;
    st.forEach(function (s) { mn = Math.min(mn, s.arr.tP); mx = Math.max(mx, s.arr.tS); });
    w.ws = Math.max(0, Math.floor(mn - 6));
    w.we = Math.max(w.ws + 30, Math.ceil((mx + 14) / 5) * 5);
  }
  function startRecording() {
    const w = S.w2;
    w.rec = { t: reducedMotion ? w.we : w.ws, done: reducedMotion };
    S.fx = S.fx.filter(function (f) { return f.where.indexOf('st2') < 0; });
    if (!reducedMotion && S.mode === 'locate') { S.running = true; startLoop(); }
    updateButtons();
    requestDraw();
  }
  function kConv() { return Q.kFactor(S.w2.vpc, S.w2.vsc); }
  function pickedStations() {
    return activeStations().filter(function (s) { return s.picks.p != null && s.picks.s != null && s.picks.s > s.picks.p; });
  }
  function stationR(s) { return kConv() * (s.picks.s - s.picks.p); }

  function layout2() {
    const W = cw, narrow = W < 640;
    const spanX = MAPX1 - MAPX0, spanY = MAPY1 - MAPY0;
    let mw, mh, tr;
    const n = S.w2.n;
    if (S.v3) { // 3D 檢視：地圖在 3D 裡，2D 畫布只畫各站的地震紀錄（游標照樣拖曳）
      const rowH = narrow ? 74 : 84, axis = narrow ? 24 : 26;
      tr = { x: 0, y: 0, w: W, h: n * rowH + axis + 8 };
      return { narrow: narrow, map: { x: 0, y: 0, w: 0, h: 0 }, tr: tr, H: tr.h, s: 1, rowH: rowH, axis: axis };
    }
    if (narrow) {
      mw = W; mh = Math.round(W * spanY / spanX);
      const rowH = 74, axis = 24;
      tr = { x: 0, y: mh + 8, w: W, h: n * rowH + axis + 8 };
      return { narrow: true, map: { x: 0, y: 0, w: mw, h: mh }, tr: tr, H: tr.y + tr.h, s: mw / spanX, rowH: rowH, axis: axis };
    }
    mw = Math.round(Math.min(W * 0.47, 470)); mh = Math.round(mw * spanY / spanX);
    const rowH = Math.min(150, (mh - 36) / n);
    tr = { x: mw + 10, y: 0, w: W - mw - 10, h: mh };
    return { narrow: false, map: { x: 0, y: 0, w: mw, h: mh }, tr: tr, H: mh, s: mw / spanX, rowH: rowH, axis: 26 };
  }
  function MX(x) { return L.map.x + (x - MAPX0) * L.s; }
  function MY(y) { return L.map.y + (MAPY1 - y) * L.s; }
  function invM(px, py) { return { x: MAPX0 + (px - L.map.x) / L.s, y: MAPY1 - (py - L.map.y) / L.s }; }
  function llPx(lon, lat) { const p = Q.toXY(lon, lat); return [MX(p.x), MY(p.y)]; }

  function buildBg2() {
    const c = bgc, M = L.map;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    D.backdrop(c, cw, ch);
    if (S.v3) return;
    c.save();
    clipR(c, M);
    // 海
    const sea = c.createLinearGradient(M.x, M.y, M.x + M.w, M.y + M.h);
    sea.addColorStop(0, mix(C['canvas-bg'], C['b-ocean'], C.dark ? 0.2 : 0.1));
    sea.addColorStop(1, mix(C['canvas-bg'], C['b-ocean'], C.dark ? 0.32 : 0.2));
    c.fillStyle = sea; c.fillRect(M.x, M.y, M.w, M.h);
    const coast = function (pts) { c.beginPath(); pts.forEach(function (q, i) { const p = llPx(q[0], q[1]); if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.closePath(); };
    // 淺海（沿岸較淺的帶）
    c.lineJoin = 'round';
    [[16, 0.1], [8, 0.12]].forEach(function (q) {
      coast(Q.TAIWAN); c.strokeStyle = alpha(C['b-wave'], C.dark ? q[1] * 1.3 : q[1]); c.lineWidth = q[0]; c.stroke();
      coast(Q.PENGHU); c.stroke();
    });
    // 陸地
    const land = mix(C['canvas-bg'], C['d-earth'], C.dark ? 0.2 : 0.16);
    const lg = c.createLinearGradient(M.x, M.y, M.x + M.w * 0.7, M.y + M.h);
    lg.addColorStop(0, shade(land, C.dark ? 0.04 : 0.05)); lg.addColorStop(1, shade(land, C.dark ? -0.1 : -0.05));
    c.save();
    c.shadowColor = C.dark ? 'rgba(0,0,0,.55)' : alpha(C.text, 0.25); c.shadowBlur = 6; c.shadowOffsetY = 2;
    c.fillStyle = lg;
    coast(Q.TAIWAN); c.fill();
    coast(Q.PENGHU); c.fill();
    Q.ISLETS.forEach(function (it) { const p = llPx(it.lon, it.lat); c.beginPath(); c.ellipse(p[0], p[1], Math.max(1.5, it.r * L.s), Math.max(1.2, it.r * 0.8 * L.s), 0, 0, Math.PI * 2); c.fill(); });
    c.restore();
    // 中央山脈（示意的地形陰影）
    c.save();
    coast(Q.TAIWAN); c.clip();
    const ridge = [[121.62, 24.85], [121.38, 24.45], [121.24, 24.05], [121.08, 23.6], [120.97, 23.15], [120.86, 22.65], [120.79, 22.2]];
    [[18, 0.1], [9, 0.12], [3.5, 0.14]].forEach(function (q) {
      c.beginPath(); ridge.forEach(function (r, i) { const p = llPx(r[0], r[1]); if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
      c.strokeStyle = alpha(C.rock, C.dark ? q[1] * 0.8 : q[1]); c.lineWidth = q[0] * L.s * 1.2; c.lineCap = 'round'; c.stroke();
    });
    c.restore();
    c.strokeStyle = shade(land, C.dark ? 0.3 : -0.35); c.lineWidth = 1.1;
    coast(Q.TAIWAN); c.stroke(); coast(Q.PENGHU); c.stroke();
    // 經緯線
    const fA = fnt(L.narrow ? 10 : 10.5);
    c.strokeStyle = alpha(C.text, C.dark ? 0.12 : 0.1); c.lineWidth = 1 / dpr; c.setLineDash([3, 4]);
    c.beginPath();
    for (let lon = 120; lon <= 122; lon++) { const x = snap(llPx(lon, 23)[0]); c.moveTo(x, M.y); c.lineTo(x, M.y + M.h); }
    for (let lat = 22; lat <= 25; lat++) { const y = snap(llPx(121, lat)[1]); c.moveTo(M.x, y); c.lineTo(M.x + M.w, y); }
    c.stroke(); c.setLineDash([]);
    for (let lon = 120; lon <= 122; lon++) D.haloText(c, lon + '°E', llPx(lon, 23)[0] + 3, M.y + M.h - 6, alpha(C.text, 0.55), 'left', 'bottom', fA);
    for (let lat = 22; lat <= 25; lat++) D.haloText(c, lat + '°N', M.x + 4, llPx(121, lat)[1] - 3, alpha(C.text, 0.55), 'left', 'bottom', fA);
    // 比例尺與指北
    const sb = 50 * L.s, bx = M.x + 14, by = M.y + 34; // 比例尺放左上角（西北方的海上）
    c.fillStyle = alpha(C['canvas-bg'], 0.8); D.roundRect(c, bx - 8, by - 20, sb + 16, 28, 6); c.fill();
    c.strokeStyle = C.text; c.lineWidth = 2; c.lineCap = 'butt';
    c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + sb, by); c.moveTo(bx, by - 4); c.lineTo(bx, by + 2); c.moveTo(bx + sb, by - 4); c.lineTo(bx + sb, by + 2); c.stroke();
    D.haloText(c, '50 km', bx + sb / 2, by - 6, C.text, 'center', 'bottom', fnt(10.5, 600));
    const nx = M.x + M.w - 20, ny = M.y + 22;
    c.fillStyle = alpha(C.text, 0.75);
    c.beginPath(); c.moveTo(nx, ny - 12); c.lineTo(nx + 6, ny + 6); c.lineTo(nx, ny + 2); c.lineTo(nx - 6, ny + 6); c.closePath(); c.fill();
    D.haloText(c, 'N', nx, ny - 14, C.text, 'center', 'bottom', fnt(11, 700));
    c.restore();
    c.strokeStyle = alpha(C.text, C.dark ? 0.2 : 0.16); c.lineWidth = 1;
    D.roundRect(c, M.x + 0.5, M.y + 0.5, M.w - 1, M.h - 1, RAD); c.stroke();
  }

  function trRow(i) { return { x: L.tr.x, y: L.tr.y + 4 + i * L.rowH, w: L.tr.w, h: L.rowH - 6 }; }
  function trX0() { return L.tr.x + (L.narrow ? 8 : 10); }
  function trX1() { return L.tr.x + L.tr.w - 8; }
  function tToX(t) { const w = S.w2; return trX0() + (t - w.ws) / (w.we - w.ws) * (trX1() - trX0()); }
  function xToT(x) { const w = S.w2; return w.ws + (x - trX0()) / (trX1() - trX0()) * (w.we - w.ws); }
  function defaultCursor(which) { const w = S.w2; return w.ws + (which === 'p' ? 0.1 : 0.2) * (w.we - w.ws); }
  function cursorT(s, which) { return s.picks[which] != null ? s.picks[which] : defaultCursor(which); }

  /** 每條紀錄依像素欄取最小、最大值（地震紀錄的畫法），快取 */
  function traceCols(s) {
    const w = S.w2, x0 = trX0(), x1 = trX1(), n = Math.max(2, Math.round(x1 - x0));
    const key = [s.ver, w.ws, w.we, n].join('|');
    if (s.cache && s.cache.key === key) return s.cache;
    const mn = new Float32Array(n), mxa = new Float32Array(n), dt = (w.we - w.ws) / n, sub = 6;
    for (let i = 0; i < n; i++) {
      let lo = 1e9, hi = -1e9;
      for (let j = 0; j <= sub; j++) { const v = s.trace(w.ws + (i + j / sub) * dt); if (v < lo) lo = v; if (v > hi) hi = v; }
      mn[i] = lo; mxa[i] = hi;
    }
    s.cache = { key: key, mn: mn, mx: mxa, n: n };
    return s.cache;
  }

  function draw2(now) {
    const w = S.w2, c = ctx;
    const key = [cw, ch, dpr, colorsVer, D.ver, 'w2', L.map.w, S.v3].join('|');
    if (key !== bgKey) { buildBg2(); bgKey = key; }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(bg, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (S.v3) { drawTraces2(c, now); return; }
    const q = w.quake, st = activeStations(), picked = pickedStations();
    const fS = fnt(L.narrow ? 10.5 : 11.5, 600);
    c.save();
    clipR(c, L.map);
    // 真實震央的波前（顯示真實震央時）
    if (q.revealed && !w.rec.done) {
      [[VP_TRUE, C.P], [VS_TRUE, C.S]].forEach(function (pr) {
        const Rr = pr[0] * w.rec.t;
        if (Rr <= q.h) return;
        const rr = Math.sqrt(Rr * Rr - q.h * q.h) * L.s;
        c.strokeStyle = alpha(pr[1], 0.2); c.lineWidth = 6; c.beginPath(); c.arc(MX(q.x), MY(q.y), rr, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = alpha(pr[1], 0.75); c.lineWidth = 1.4; c.beginPath(); c.arc(MX(q.x), MY(q.y), rr, 0, Math.PI * 2); c.stroke();
      });
    }
    // 圓
    // 圓的內部：中心透明、往圓周漸濃（像由測站往外傳的距離圈），圓周是一條清楚的線
    picked.forEach(function (s) {
      const i = w.stations.indexOf(s), col = C.st[i], r = stationR(s) * L.s;
      const x = MX(s.x), y = MY(s.y);
      const g = c.createRadialGradient(x, y, r * 0.55, x, y, r);
      g.addColorStop(0, alpha(col, 0));
      g.addColorStop(1, alpha(col, C.dark ? 0.13 : 0.1));
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.strokeStyle = alpha(col, C.dark ? 0.22 : 0.16); c.lineWidth = 4.5;
      c.stroke();
      c.strokeStyle = alpha(col, 0.92); c.lineWidth = 1.8;
      c.stroke();
    });
    // 共同弦
    if (w.chords && picked.length >= 2) {
      c.setLineDash([6, 4]); c.strokeStyle = alpha(C.text, 0.6); c.lineWidth = 1.3;
      for (let i = 0; i < picked.length; i++) for (let j = i + 1; j < picked.length; j++) {
        const a = picked[i], b = picked[j];
        const cc = Q.commonChord({ x: a.x, y: a.y, R: stationR(a) }, { x: b.x, y: b.y, R: stationR(b) });
        if (!cc) continue;
        c.beginPath(); c.moveTo(MX(cc[0].x), MY(cc[0].y)); c.lineTo(MX(cc[1].x), MY(cc[1].y)); c.stroke();
      }
      c.setLineDash([]);
    }
    const est = liveEst(), grey = alpha(C.text, C.dark ? 0.62 : 0.55);
    const taken = []; // 已經放好的標籤 [x, y, w, h]（你的標記的標籤要避開它們）
    // 誤差三角形（含誤差時三個圓兩兩的交點；確認後與電腦解一起顯示）
    if (est && est.n >= 3 && !est.collinear) {
      const tri = Q.errorTriangle(picked.slice(0, 3).map(function (s) { return { x: s.x, y: s.y, R: stationR(s) }; }), est.x, est.y);
      if (tri.length === 3) {
        c.beginPath(); tri.forEach(function (p, i) { if (i) c.lineTo(MX(p.x), MY(p.y)); else c.moveTo(MX(p.x), MY(p.y)); }); c.closePath();
        c.fillStyle = alpha(C.text, C.dark ? 0.12 : 0.1); c.fill();
        c.strokeStyle = alpha(C.text, 0.45); c.lineWidth = 1; c.stroke();
      }
    }
    // 之前確認過的標記（小叉）
    w.history.forEach(function (hst, i) {
      if (i === w.history.length - 1 && est) return;
      (hst.marks || [hst]).forEach(function (m) {
        const x = MX(m.x), y = MY(m.y);
        c.strokeStyle = alpha(C.accent, 0.45); c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(x - 4, y - 4); c.lineTo(x + 4, y + 4); c.moveTo(x + 4, y - 4); c.lineTo(x - 4, y + 4); c.stroke();
      });
    });
    // 電腦的最小平方解（確認之後才顯示）：灰色虛線十字
    if (est) {
      const cands = est.candidates || [];
      cands.forEach(function (p, i) {
        const x = MX(p.x), y = MY(p.y);
        c.save();
        c.lineCap = 'round';
        const cross = function () {
          c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.stroke();
          c.beginPath(); c.moveTo(x - 13, y); c.lineTo(x - 3, y); c.moveTo(x + 3, y); c.lineTo(x + 13, y); c.moveTo(x, y - 13); c.lineTo(x, y - 3); c.moveTo(x, y + 3); c.lineTo(x, y + 13); c.stroke();
        };
        c.strokeStyle = alpha(C['canvas-bg'], 0.85); c.lineWidth = 3.8; cross(); // 底下一圈背景色的描邊，在任何底色上都看得清楚
        c.setLineDash([3, 2.5]);
        c.strokeStyle = grey; c.lineWidth = 1.6; cross();
        c.restore();
        const lab = T('電腦解', 'Computer') + (cands.length > 1 ? ' ' + (i + 1) : '');
        // 標籤放在左下（兩個時放在彼此的外側），你的標記的標籤在上方，兩者不打架
        const o = cands[1 - i], left = o ? p.x <= o.x : x - 90 > L.map.x, lw = textW(c, lab, fS) + 14;
        tag(c, lab, left ? x - 14 : x + 14, y + 17, grey, left ? 'right' : 'left', fS);
        taken.push([left ? x - 14 - lw : x + 14, y + 7, lw, 20]);
      });
    }
    // 真實震央（連到你的標記）
    if (q.revealed) {
      const x = MX(q.x), y = MY(q.y);
      if (w.marks.length === 1) {
        c.strokeStyle = alpha(C.text, 0.6); c.setLineDash([2, 3]); c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(x, y); c.lineTo(MX(w.marks[0].x), MY(w.marks[0].y)); c.stroke(); c.setLineDash([]);
      }
      star(c, x, y, 9, C.pos);
      const tl = T('真實震央', 'True epicenter') + ' · ' + num(q.h, q.h % 1 ? 1 : 0) + ' km', tw = textW(c, tl, fS) + 14;
      if (x - 12 - tw > L.map.x + 4) { tag(c, tl, x - 12, y + 18, C.pos, 'right', fS); taken.push([x - 12 - tw, y + 8, tw, 20]); }
      else { tag(c, tl, x + 12, y + 18, C.pos, 'left', fS); taken.push([x + 12, y + 8, tw, 20]); }
    }
    // 測站
    st.forEach(function (s, i) {
      const x = MX(s.x), y = MY(s.y), col = C.st[i];
      const hot = (w.drag && w.drag.kind === 'station' && w.drag.i === i) || (S.hover2 && S.hover2.kind === 'station' && S.hover2.i === i);
      S.fx.forEach(function (f) { if (f.where === 'st2-' + i) ringFx(c, f, x, y, now); });
      stationMark(c, x, y, L.narrow ? 7.5 : 8.5, col, hot);
      if (kbIs('station', i)) kbBox(c, x - 14, y - 14, 28, 28);
      const nm = s.label + (s.city ? ' ' + cityName(s.city) : ''), rt = x > L.map.x + L.map.w - 90, tw = textW(c, nm, fS) + 14;
      tag(c, nm, x + 11, y - 9, col, rt ? 'right' : 'left', fS);
      taken.push([rt ? x + 11 - tw : x + 11, y - 19, tw, 20], [x - 10, y - 10, 20, 20]);
    });
    // 你的震央標記（點地圖放置、可拖曳）；標籤依序試右上、左上、右下、左下，避開測站與真實震央的標籤（兩個標記時先試彼此的外側）
    const fM = fnt(L.narrow ? 10.5 : 11.5, 700);
    w.marks.forEach(function (m, i) {
      const x = MX(m.x), y = MY(m.y);
      const hot = (w.drag && w.drag.kind === 'mark' && w.drag.i === i) || (S.hover2 && S.hover2.kind === 'mark' && S.hover2.i === i);
      drawMark(c, x, y, hot, w.marks.length > 1 && w.mkActive === i);
      if (kbIs('mark', i)) kbBox(c, x - 18, y - 18, 36, 36);
      const lab = w.marks.length > 1 || w.nMarks > 1 ? T('標記 ', 'Marker ') + (i + 1) : T('我的震央', 'My epicenter');
      const tw = textW(c, lab, fM) + 14, o = w.marks[1 - i];
      const outerLeft = o ? m.x < o.x : x > L.map.x + L.map.w - 100;
      const cands = [[!outerLeft, -16], [outerLeft, -16], [!outerLeft, 19], [outerLeft, 19]].map(function (cd) {
        const toRight = cd[0], bx = toRight ? x + 15 : x - 15 - tw;
        return { toRight: toRight, dy: cd[1], r: [bx, y + cd[1] - 10, tw, 20] };
      }).filter(function (cd) { return cd.r[0] >= L.map.x + 2 && cd.r[0] + tw <= L.map.x + L.map.w - 2; });
      const hit = function (r) { return taken.some(function (t) { return r[0] < t[0] + t[2] && t[0] < r[0] + r[2] && r[1] < t[1] + t[3] && t[1] < r[1] + r[3]; }); };
      const pick = cands.filter(function (cd) { return !hit(cd.r); })[0] || cands[0] || { toRight: true, dy: -16, r: [x + 15, y - 26, tw, 20] };
      tag(c, lab, pick.toRight ? x + 15 : x - 15, y + pick.dy, C.accent, pick.toRight ? 'left' : 'right', fM);
      taken.push(pick.r);
    });
    c.restore();

    drawTraces2(c, now);
  }

  function drawTraces2(c, now) {
    const w = S.w2, st = activeStations(), x0 = trX0(), x1 = trX1();
    const fS = fnt(L.narrow ? 10.5 : 11.5, 700), fA = fnt(L.narrow ? 10 : 10.5);
    panel(c, L.tr);
    const tNow = w.rec.done ? w.we : w.rec.t;
    st.forEach(function (s, i) {
      const R = trRow(i), col = C.st[i];
      const yc = R.y + R.h / 2 + 6;
      // 列底
      c.fillStyle = alpha(col, C.dark ? 0.06 : 0.04);
      D.roundRect(c, R.x + 4, R.y, R.w - 8, R.h, 7); c.fill();
      // 紀錄
      const cols = traceCols(s), sc = (R.h * 0.4) / s.trace.peak;
      const nShow = Math.min(cols.n, Math.max(0, Math.round((tNow - w.ws) / (w.we - w.ws) * cols.n)));
      c.fillStyle = alpha(C.text, C.dark ? 0.85 : 0.8);
      const lim = R.h * 0.47;
      for (let k = 0; k < nShow; k++) {
        const a = clamp(-cols.mx[k] * sc, -lim, lim), b = clamp(-cols.mn[k] * sc, -lim, lim);
        c.fillRect(x0 + k, yc + a, 1, Math.max(1 / dpr, b - a));
      }
      if (!w.rec.done && nShow > 0) { c.fillStyle = C.accent; c.beginPath(); c.arc(x0 + nShow, yc, 2.6, 0, Math.PI * 2); c.fill(); }
      // 游標
      const tp = cursorT(s, 'p'), ts = cursorT(s, 's'), xp = tToX(tp), xs = tToX(ts);
      const both = s.picks.p != null && s.picks.s != null;
      if (both && ts > tp) {
        c.fillStyle = alpha(C.accent, 0.08);
        c.fillRect(xp, R.y + 2, xs - xp, R.h - 4);
      }
      [['p', xp, C.P, 'P'], ['s', xs, C.S, 'S']].forEach(function (cu) {
        const set = s.picks[cu[0]] != null;
        const active = w.drag && w.drag.kind === 'cursor' && w.drag.i === i && w.drag.which === cu[0];
        c.save();
        if (!set) c.setLineDash([4, 3]);
        c.strokeStyle = alpha(cu[2], set ? 0.95 : 0.5); c.lineWidth = active ? 2.4 : 1.6;
        c.beginPath(); c.moveTo(snap(cu[1]), R.y + 13); c.lineTo(snap(cu[1]), R.y + R.h - 2); c.stroke();
        c.restore();
        // 把手
        const hy = R.y + 7;
        c.fillStyle = set ? cu[2] : alpha(cu[2], 0.45);
        D.roundRect(c, cu[1] - 8, hy - 6, 16, 13, 4); c.fill();
        D.haloText(c, cu[3], cu[1], hy + 0.5, C.surface, 'center', 'middle', fnt(10.5, 700));
        if (kbIs('cursor', i, cu[0])) kbBox(c, cu[1] - 12, hy - 10, 24, R.h - hy + R.y + 8);
      });
      // 標籤
      const nm = s.label + (s.city ? ' ' + cityName(s.city) : '');
      const lb = both ? 'S−P = ' + num(s.picks.s - s.picks.p, 2) + ' s → d = ' + num(stationR(s), 1) + ' km' : T('拖曳 P、S 游標', 'Drag the P and S cursors');
      tag(c, nm, R.x + 8, R.y + R.h - 9, col, 'left', fS);
      const wNm = textW(c, nm, fS) + 22;
      if (x0 + wNm + textW(c, lb, fA) + 30 < x1) D.haloText(c, lb, R.x + 8 + wNm, R.y + R.h - 9, both ? C.text : alpha(C.text, 0.55), 'left', 'middle', fA);
      else D.haloText(c, lb, x1 - 2, R.y + R.h - 9, both ? C.text : alpha(C.text, 0.55), 'right', 'middle', fA);
      S.fx.forEach(function (f) { if (f.where === 'tr2-' + i) ringFx(c, f, x0 + nShow, yc, now); });
    });
    // 時間軸（時刻）
    const yAx = L.tr.y + 4 + st.length * L.rowH + 2;
    c.strokeStyle = alpha(C.text, 0.3); c.lineWidth = 1;
    c.beginPath(); c.moveTo(x0, snap(yAx)); c.lineTo(x1, snap(yAx)); c.stroke();
    // 主刻度間距：依「時:分:秒」標籤的寬度挑，窄螢幕（390 px）標籤才不會互相疊到
    const span = w.we - w.ws, pxPerS = (x1 - x0) / span, labW = textW(c, '00:00:00', fA) + 12;
    let step = span > 90 ? 20 : 10;
    while (step * pxPerS < labW && step < 600) step = step < 30 ? step + 10 : step * 2;
    const first = Math.ceil((w.ws + w.quake.T0) / step) * step - w.quake.T0;
    const minor = step / 5;
    for (let t = Math.ceil((w.ws + w.quake.T0) / minor) * minor - w.quake.T0; t <= w.we + 1e-6; t += minor) {
      const px = snap(tToX(t));
      c.beginPath(); c.moveTo(px, yAx); c.lineTo(px, yAx + 2.5); c.stroke();
    }
    for (let t = first; t <= w.we + 1e-6; t += step) {
      const px = snap(tToX(t));
      c.beginPath(); c.moveTo(px, yAx); c.lineTo(px, yAx + 5); c.stroke();
      if (px > x0 + 20 && px < x1 - 20) D.haloText(c, clock(w.quake.T0 + t), px, yAx + 6, alpha(C.text, 0.62), 'center', 'top', fA);
    }
    // 放大鏡
    if (w.drag && w.drag.kind === 'cursor') drawLoupe(c, w.drag.i, w.drag.which);
  }
  function drawLoupe(c, i, which) {
    const w = S.w2, s = activeStations()[i]; if (!s) return;
    const R = trRow(i), t0 = s.picks[which], col = which === 'p' ? C.P : C.S;
    if (t0 == null) return;
    const lw = Math.min(200, L.tr.w * 0.55), lh = Math.min(70, L.rowH * 0.85), half = 2.5;
    let lx = clamp(tToX(t0) - lw / 2, L.tr.x + 4, L.tr.x + L.tr.w - lw - 4);
    let ly = R.y - lh - 6;
    if (ly < L.tr.y + 2) ly = R.y + R.h + 4;
    c.save();
    c.shadowColor = C.dark ? 'rgba(0,0,0,.6)' : alpha(C.text, 0.3); c.shadowBlur = 10; c.shadowOffsetY = 3;
    D.roundRect(c, lx, ly, lw, lh, 8); c.fillStyle = C.surface; c.fill();
    c.restore();
    c.save();
    D.roundRect(c, lx, ly, lw, lh, 8); c.clip();
    c.strokeStyle = alpha(col, 0.8); c.lineWidth = 1.5;
    D.roundRect(c, lx + 0.75, ly + 0.75, lw - 1.5, lh - 1.5, 8); c.stroke();
    const yc = ly + lh / 2 + 4, sc = lh * 0.4 / Math.max(1e-9, s.trace.peak) * 2.2, lim = lh * 0.45;
    // 每 0.5 s 的細格線
    c.strokeStyle = alpha(C.text, 0.1); c.lineWidth = 1;
    for (let k = Math.ceil((t0 - half) * 2) / 2; k <= t0 + half; k += 0.5) { const px = snap(lx + (k - t0 + half) / (2 * half) * lw); c.beginPath(); c.moveTo(px, ly); c.lineTo(px, ly + lh); c.stroke(); }
    c.beginPath();
    for (let k = 0; k <= lw; k++) {
      const t = t0 - half + k / lw * 2 * half, v = clamp(-s.trace(t) * sc, -lim, lim);
      if (k) c.lineTo(lx + k, yc + v); else c.moveTo(lx + k, yc + v);
    }
    c.strokeStyle = C.text; c.lineWidth = 1.3; c.stroke();
    c.strokeStyle = col; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(snap(lx + lw / 2), ly); c.lineTo(snap(lx + lw / 2), ly + lh); c.stroke();
    const zoom = ((w.we - w.ws) / (trX1() - trX0())) / (2 * half / lw); // 主畫面每像素的秒數 ÷ 放大鏡每像素的秒數
    D.haloText(c, '×' + Math.round(zoom), lx + 6, ly + 10, alpha(C.text, 0.6), 'left', 'middle', fnt(10, 600));
    c.restore();
  }

  function refreshPicks() {
    const w = S.w2, st = activeStations(), m1 = w.marks.length === 1 ? w.marks[0] : null;
    // Δ：測站到「你的震央」標記的地圖距離（只標一個時）；Δ 比 d 大就不可能（震央一定在每個圓裡面）
    let html = '<tr><th>' + T('測站', 'Station') + '</th><th>S−P (s)</th><th>d (km)</th><th title="' + T('測站到你的震央標記的距離', 'Distance from the station to your marker') + '">Δ (km)</th></tr>';
    st.forEach(function (s, i) {
      const both = s.picks.p != null && s.picks.s != null && s.picks.s > s.picks.p;
      const nm = s.label + (s.city ? ' ' + cityName(s.city) : '');
      const dl = m1 ? Math.hypot(s.x - m1.x, s.y - m1.y) : null;
      html += '<tr><td><span class="sw" style="background:' + C.st[i] + '"></span>' + nm + '</td>' +
        (both ? '<td>' + num(s.picks.s - s.picks.p, 2) + '</td><td>' + num(stationR(s), 1) + '</td>' : '<td class="na">—</td><td class="na">—</td>') +
        (dl == null ? '<td class="na">—</td>' : '<td' + (both && dl > stationR(s) ? ' class="over"' : '') + '>' + num(dl, 1) + '</td>') + '</tr>';
    });
    $('picks').innerHTML = html;
    $('kc').textContent = num(kConv(), 3) + ' km/s';
    showEst();
  }
  function lonlatText(x, y) { const ll = Q.toLonLat(x, y); return num(ll.lat, 2) + '°N, ' + num(ll.lon, 2) + '°E'; }
  function circles2() { return pickedStations().map(function (s) { return { x: s.x, y: s.y, R: stationR(s) }; }); }
  /** 由「你的震央」標記推算深度：每站 h² = d² − Δ²，取平均（只標一個、量好兩站以上時） */
  function myDepth() {
    const w = S.w2, data = circles2();
    if (w.marks.length !== 1 || data.length < 2) return null;
    const r = Q.depthAt(data, w.marks[0].x, w.marks[0].y);
    r.n = data.length;
    r.outside = r.each.some(function (v) { return v < 0; });
    return r;
  }
  /** 目前看得到的電腦解（量測改過就藏起來，等再次確認） */
  function liveEst() { const e = S.w2.est; return e && !e.stale ? e : null; }
  function showEst() {
    const w = S.w2, q = w.quake, e = liveEst(), mk = w.marks, dep = myDepth();
    // 你的震央與推算的深度（即時）
    if (!mk.length) $('myPos').innerHTML = '—<small>' + T('在地圖上點一下，放上你的震央標記', 'Tap the map to place your epicenter marker') + '</small>';
    else $('myPos').innerHTML = mk.map(function (p) { return lonlatText(p.x, p.y); }).join('<br>') +
      (mk.length < w.nMarks ? '<small>' + T('還要再點一個標記', 'Place one more marker') + '</small>' : '');
    if (!dep) $('myH').innerHTML = '—' + (mk.length === 1 ? '<small>' + T('至少量好兩站', 'Measure two stations first') + '</small>' : '');
    else $('myH').innerHTML = num(dep.h, 1) + ' km<small>' + T('h = √(d² − Δ²)，' + dep.n + ' 站平均', 'h = √(d² − Δ²), mean of ' + dep.n + ' stations') +
      (dep.outside ? T('；標記在某個圓外面（Δ > d），不可能', '; the marker is outside a circle (Δ > d), which is impossible') : '') + '</small>';
    // 電腦的最小平方解：確認之後才顯示，當作對照
    if (!e) {
      $('estPos').innerHTML = '—<small>' + (w.est && w.est.stale ? T('量測改過了，按「確認我的震央」後再顯示', 'Measurements changed; it shows again after “Check my epicenter”')
        : T('按「確認我的震央」後顯示', 'Shown after “Check my epicenter”')) + '</small>';
      $('estH').textContent = '—';
    } else if (e.candidates.length > 1) {
      $('estPos').innerHTML = T('兩個可能：', 'Two possibilities:') + '<small>' + e.candidates.map(function (p) { return lonlatText(p.x, p.y); }).join('<br>') + '</small>';
      $('estH').textContent = '—';
    } else {
      $('estPos').innerHTML = lonlatText(e.x, e.y) + (mk.length === 1 ? '<small>' + T('和你的標記差 ', 'off your marker by ') + num(Math.hypot(e.x - mk[0].x, e.y - mk[0].y), 1) + ' km</small>' : '');
      $('estH').textContent = e.n >= 3 ? num(e.h, 1) + ' km' : '—';
    }
    const el = $('estErr');
    el.className = '';
    if (q.revealed) {
      $('truePos').innerHTML = lonlatText(q.x, q.y) + '<small>' + T('深度 ', 'depth ') + num(q.h, 1) + ' km</small>';
      if (mk.length) {
        const err = Math.min.apply(null, mk.map(function (p) { return Math.hypot(p.x - q.x, p.y - q.y); }));
        el.innerHTML = num(err, 1) + ' km' + (dep ? '<small>' + T('深度差 ', 'depth off by ') + num(Math.abs(dep.h - q.h), 1) + ' km</small>' : '');
        if (mk.length === 1) el.className = err <= 10 ? 'good' : err > 30 ? 'bad' : '';
      } else el.textContent = '—';
    } else {
      $('truePos').textContent = T('（還沒顯示）', '(hidden)');
      el.textContent = '—';
    }
    const hl = $('history');
    hl.innerHTML = w.history.map(function (hst) {
      return '<li>' + hst.n + T(' 站', ' stations') + (hst.nm === 2 ? T('、標 2 點', ', 2 markers') : '') +
        (q.revealed && hst.qid === q.seed ? T('，誤差 ', ', error ') + num(hst.err, 1) + ' km' : '') + (hst.auto ? T('（看過答案）', ' (answer seen)') : '') + '</li>';
    }).join('');
  }
  /** 「確認我的震央」：判定的是學生在地圖上標的位置；確認後才顯示電腦的最小平方解當對照 */
  function doLocate() {
    const w = S.w2, q = w.quake, picked = pickedStations();
    if (picked.length < 2) { setStatus(T('至少要在兩個測站量好 S−P（P、S 游標都要放）。', 'Measure S−P at two stations at least (place both the P and the S cursor).')); return; }
    if (!w.marks.length) {
      setStatus(T('先在地圖上點出你認為的震央（點一下地圖放標記，可以拖曳或用方向鍵微調），再按「確認我的震央」。', 'First tap the map where you think the epicenter is (drag the marker or use the arrow buttons to adjust it), then press “Check my epicenter”.'));
      return;
    }
    if (w.marks.length < w.nMarks) { setStatus(T('「我標的震央」選了 2 個：還要再點一個。', '“My markers” is set to 2: place one more.')); return; }
    const data = circles2();
    const r = Q.locate(data, { collinearKm: 4 });
    if (!r.ok || !r.candidates.length) {
      w.est = null; refreshPicks(); requestDraw();
      setStatus(T('兩個圓沒有交點：再檢查一下游標，或換算用的波速。', 'The two circles do not meet: check your cursors or the conversion speeds.'));
      return;
    }
    const peek = !!liveEst(); // 確認之前就看得到這組量測的電腦解
    const marks = w.marks.map(function (p) { return { x: p.x, y: p.y }; });
    const dq = function (p) { return Math.hypot(p.x - q.x, p.y - q.y); };
    const err = Math.min.apply(null, marks.map(dq));
    const dep = myDepth();
    const hEst = dep ? dep.h : NaN;
    const pe = Q.pairErr(marks, r.candidates);
    const solErr = r.candidates.length === 1 ? dq(r) : Math.min.apply(null, r.candidates.map(dq));
    const off = lineOffset(picked); // 測站離最佳直線的最大距離（判斷是否排成一直線）
    w.est = { x: r.x, y: r.y, h: r.h, n: picked.length, candidates: r.candidates, collinear: !!r.collinear, err: solErr, stale: false };
    const manual = !q.autoUsed && picked.every(function (s) { return s.picks.mp && s.picks.ms && !s.picks.auto; });
    const auto = !!q.autoUsed || peek || picked.some(function (s) { return s.picks.auto; });
    w.history.push({ x: marks[0].x, y: marks[0].y, marks: marks, nm: marks.length, n: picked.length, err: err, auto: auto, qid: q.seed });
    if (w.history.length > 30) w.history.shift();
    refreshPicks(); requestDraw(); ding();
    let msg;
    if (r.candidates.length > 1) {
      msg = r.collinear ? T('測站排成一直線：直線兩側的鏡像位置都符合資料，分不出是哪一個。', 'The stations are in a straight line: the mirror-image points on both sides fit the data equally well.')
        : T('只用兩站：兩個圓交於兩點，兩個都有可能是震央。', 'Only two stations: the circles cross at two points and either could be the epicenter.');
      if (marks.length === 1) msg += T('你只標了一個：把「我標的震央」改成 2 個，兩個交點都點出來。', ' You marked only one: set “My markers” to 2 and mark both crossing points.');
      else msg += pe <= 10 ? T('你兩個都找到了（灰色十字是電腦算的位置）。', ' You found both (the grey crosses are the computed points).')
        : T('灰色十字是電腦算的兩個位置，你的標記還差 ', ' The grey crosses are the computed points; your markers are off by ') + num(pe, 1) + ' km' + T('。', '.');
    } else if (marks.length === 2) {
      msg = T('三個以上、不在一直線上的測站只有一個答案：把「我標的震央」改回 1 個。', 'Three or more stations not in a line give one answer: set “My markers” back to 1.');
    } else {
      msg = T('你的震央：', 'Your epicenter: ') + lonlatText(marks[0].x, marks[0].y) + (dep ? T('，推算深度 ', ', depth ') + num(hEst, 1) + ' km' : '') +
        T('。灰色十字是電腦的最小平方解，和你的標記差 ', '. The grey cross is the computer’s least-squares solution, ') + num(Math.hypot(r.x - marks[0].x, r.y - marks[0].y), 1) + T(' km。', ' km from your marker.');
    }
    if (peek) msg += T('（確認前就看得到電腦解，這次不算自己定位）', ' (The computer’s solution was already showing, so this does not count as your own.)');
    setStatus(msg);
    emit('locate', {
      n: picked.length, marks: marks.length, err: err, hEst: hEst, hTrue: q.h, depthErr: Math.abs(hEst - q.h), candidates: r.candidates.length, pairErr: pe,
      collinear: !!r.collinear, lineOff: off, manual: manual, auto: auto, peek: peek, revealed: q.revealed, source: q.source, errMode: !!$('errMode').checked,
      k: kConv(), vpc: w.vpc, vsc: w.vsc, rms: r.rms || 0, solErr: solErr
    });
  }
  /** 「電腦解（看答案）」：確認之前按就算看過答案，這個地震之後的定位都不算自己定位（和自動判讀一樣） */
  function showSolution() {
    const w = S.w2, q = w.quake;
    if (pickedStations().length < 2) { setStatus(T('至少要在兩個測站量好 S−P，電腦才能算。', 'Measure S−P at two stations at least so the computer can solve it.')); return; }
    if (liveEst()) { setStatus(T('灰色十字就是電腦的最小平方解。', 'The grey cross is the computer’s least-squares solution.')); return; }
    const r = Q.locate(circles2(), { collinearKm: 4 });
    if (!r.ok || !r.candidates.length) { setStatus(T('兩個圓沒有交點：再檢查一下游標，或換算用的波速。', 'The two circles do not meet: check your cursors or the conversion speeds.')); return; }
    q.autoUsed = true;
    const dq = function (p) { return Math.hypot(p.x - q.x, p.y - q.y); };
    w.est = { x: r.x, y: r.y, h: r.h, n: r.n, candidates: r.candidates, collinear: !!r.collinear, err: r.candidates.length === 1 ? dq(r) : Math.min.apply(null, r.candidates.map(dq)), stale: false };
    refreshPicks(); requestDraw();
    setStatus(T('這是電腦用最小平方法算出的震央（灰色十字）。確認前看了答案，這個地震的定位不算自己定位；換一個地震再自己試試。', 'This is the computer’s least-squares epicenter (grey cross). Since you looked before checking, locating this earthquake no longer counts as your own; try another one.'));
  }
  /** 標記改了：表格的 Δ、推算深度、畫面都更新 */
  function marksChanged() { refreshPicks(); requestDraw(); }
  const clampMapX = function (x) { return clamp(x, MAPX0 + 1, MAPX1 - 1); }, clampMapY = function (y) { return clamp(y, MAPY0 + 1, MAPY1 - 1); };
  /** 在地圖上點一下：還沒標滿就新增一個，標滿了就把最近的那個移過來（2D 與 3D 共用） */
  function placeMark(x, y) {
    const w = S.w2, p = { x: clampMapX(x), y: clampMapY(y) };
    if (w.marks.length < w.nMarks) { w.marks.push(p); w.mkActive = w.marks.length - 1; buildKbItems(); }
    else {
      let bi = 0;
      w.marks.forEach(function (m, i) { if (Math.hypot(m.x - p.x, m.y - p.y) < Math.hypot(w.marks[bi].x - p.x, w.marks[bi].y - p.y)) bi = i; });
      w.marks[bi] = p; w.mkActive = bi;
    }
    marksChanged();
  }
  function moveMark(i, x, y) {
    const w = S.w2;
    if (!w.marks[i]) return;
    w.marks[i] = { x: clampMapX(x), y: clampMapY(y) };
    w.mkActive = i;
    marksChanged();
  }
  function lineOffset(st) {
    const n = st.length; if (n < 3) return Infinity;
    let mx = 0, my = 0; st.forEach(function (s) { mx += s.x / n; my += s.y / n; });
    let sxx = 0, sxy = 0, syy = 0;
    st.forEach(function (s) { sxx += (s.x - mx) ** 2; sxy += (s.x - mx) * (s.y - my); syy += (s.y - my) ** 2; });
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(th), uy = Math.sin(th);
    let off = 0; st.forEach(function (s) { off = Math.max(off, Math.abs(-(s.x - mx) * uy + (s.y - my) * ux)); });
    return off;
  }
  function picksChanged() {
    const w = S.w2;
    if (w.est) w.est.stale = true;
    refreshPicks();
    requestDraw();
  }

  function events2(t0, t1) {
    activeStations().forEach(function (s, i) {
      const col = C.st[i];
      if (t0 < s.arr.tP && t1 >= s.arr.tP) { rumble('P'); fxAdd('st2-' + i, C.P, 10); }
      if (t0 < s.arr.tS && t1 >= s.arr.tS) { rumble('S'); fxAdd('st2-' + i, C.S, 10); }
      void col;
    });
  }

  // =====================================================================
  // 模式三：地球內部與陰影區
  // =====================================================================
  const E = { shells: null, br: null, zones: null, fanP: [], fanS: [], hiP: null, hiS: null };
  function init3() {
    if (S.w3.ready) return;
    E.shells = Q.buildShells(5);
    E.br = Q.branches(E.shells, 1000, 600);
    E.zones = Q.shadowZonesExact(E.shells);
    E.curves = { P: [], S: [], PKP: [], PKIKP: [] };
    for (let i = 0; i <= 360; i++) {
      const deg = i / 2, arr = Q.arrivalsAt(E.br, deg, ['P', 'S', 'PKP', 'PKIKP']);
      ['P', 'S', 'PKP', 'PKIKP'].forEach(function (ph) {
        const a = arr.find(function (q) { return q.phase === ph; });
        E.curves[ph].push(a ? { deg: deg, T: a.T } : null);
      });
    }
    E.curves.P[0] = { deg: 0, T: 0 }; E.curves.S[0] = { deg: 0, T: 0 }; // 震源就在地表
    for (let a = 0.5; a <= 40.01; a += 1.5) E.fanP.push(Q.annotate(Q.traceRay(E.shells, Q.pFromTakeoff(E.shells, a, 'P'), 'P')));
    for (let a = 0.5; a <= 24.01; a += 1) E.fanS.push(Q.annotate(Q.traceRay(E.shells, Q.pFromTakeoff(E.shells, a, 'S'), 'S')));
    S.w3.ready = true;
    updateHi();
    readouts3();
  }
  function updateHi() {
    E.hiP = Q.annotate(Q.traceRay(E.shells, Q.pFromTakeoff(E.shells, S.w3.takeoff, 'P'), 'P'));
    E.hiS = Q.annotate(Q.traceRay(E.shells, Q.pFromTakeoff(E.shells, S.w3.takeoff, 'S'), 'S'));
  }
  function phaseName(ph) {
    return ({
      P: T('P（只經過地函）', 'P (mantle only)'), S: T('S（只經過地函）', 'S (mantle only)'), PKP: T('PKP（穿過外核）', 'PKP (through the outer core)'),
      PKIKP: T('PKIKP（穿過內核）', 'PKIKP (through the inner core)'), PKiKP: T('PKiKP（在內核表面反射）', 'PKiKP (reflected at the inner core)'),
      'S-blocked': T('S 波碰到液態外核，無法前進', 'S wave stopped by the liquid outer core'), SKIKS: 'SKIKS'
    })[ph] || ph;
  }
  function readouts3() {
    const w = S.w3, ray = w.wave === 'S' ? E.hiS : E.hiP;
    $('e3phase').textContent = phaseName(ray.phase);
    let d = ray.delta / Q.DEG;
    $('e3delta').innerHTML = ray.blocked ? '—' : (d > 180 ? num(360 - d, 1) + '°<small>' + T('繞過地心到另一側', 'past the antipode, on the other side') + '</small>' : num(d, 1) + '°');
    $('e3time').textContent = ray.blocked ? '—' : minsec(ray.time);
    $('e3deep').innerHTML = num(Q.RE - ray.turnR, 0) + ' km<small>r = ' + num(ray.turnR, 0) + ' km</small>';
    $('e3p').innerHTML = num(ray.p, 1) + ' s/rad<small>' + num(ray.p * Q.DEG, 3) + ' s/°</small>';
    const cx = ray.crossings.find(function (q) { return q.from !== 'oc' && q.to === 'oc'; });
    if (cx) {
      const i1 = Math.asin(cx.sinAbove) / Q.DEG, i2 = Math.asin(cx.sinBelow) / Q.DEG;
      $('e3cmb').innerHTML = T('入射角 ', 'incidence ') + num(i1, 2) + '° → ' + T('折射角 ', 'refraction ') + num(i2, 2) + '°<small>sin i<sub>1</sub>/v<sub>1</sub> = ' + num(cx.sinAbove / cx.vAbove, 5) + '<br>sin i<sub>2</sub>/v<sub>2</sub> = ' + num(cx.sinBelow / cx.vBelow, 5) + '</small>';
    } else if (ray.blocked) {
      $('e3cmb').textContent = T('S 波在此被擋住（外核 VS = 0）', 'S stops here (VS = 0 in the outer core)');
    } else $('e3cmb').textContent = T('沒有到達', 'not reached');
    // 測站
    const arr = arrivals3();
    const pA = arr.filter(function (a) { return a.phase === 'P' || a.phase === 'PKP'; });
    const ik = arr.filter(function (a) { return a.phase === 'PKIKP'; });
    const sA = arr.filter(function (a) { return a.phase === 'S'; });
    $('e3pa').innerHTML = pA.length ? minsec(pA[0].T) + '<small>' + pA[0].phase + T(' 先到', ' first') + '</small>' : '<b style="color:var(--pos)">' + T('收不到', 'none') + '</b>';
    $('e3ik').innerHTML = ik.length ? minsec(ik[0].T) : '—';
    $('e3sa').innerHTML = sA.length ? minsec(sA[0].T) : '<b style="color:var(--pos)">' + T('收不到', 'none') + '</b>';
    $('e3sz').textContent = T('', '> ') + num(E.zones.sMax, 1) + '°' + T(' 以外', '');
    $('e3pz').textContent = num(E.zones.pMax, 1) + '°–' + num(E.zones.pkpMin, 1) + '°';
  }
  function arrivals3() { return Q.arrivalsAt(E.br, S.w3.deg, ['P', 'PKP', 'PKIKP', 'S']); }
  /** 測站收到哪些波（給螢幕閱讀器與狀態列） */
  function station3Text() {
    const arr = arrivals3();
    const hasP = arr.some(function (a) { return a.phase === 'P' || a.phase === 'PKP'; }), hasS = arr.some(function (a) { return a.phase === 'S'; });
    const ik = arr.some(function (a) { return a.phase === 'PKIKP'; });
    return (hasP ? T('收得到 P 波', 'P waves arrive') : T('收不到 P 波', 'no P waves')) + T('，', ', ') +
      (hasS ? T('收得到 S 波', 'S waves arrive') : T('收不到 S 波', 'no S waves')) +
      (!hasP && ik ? T('，只有穿過內核的微弱 PKIKP', '; only the faint PKIKP through the inner core') : '') + T('。', '.');
  }

  function layout3() {
    const W = cw, narrow = W < 640;
    if (S.v3) { // 3D 檢視：地球剖面在 3D 裡，2D 畫布只畫走時曲線
      const chH = narrow ? Math.round(W * 0.72) : Math.round(Math.min(340, W * 0.4));
      return { narrow: narrow, disc: { x: 0, y: 0, w: 0, h: 0 }, chart: { x: 0, y: 0, w: W, h: chH }, H: chH };
    }
    if (narrow) {
      const Sd = W, chH = Math.round(W * 0.7);
      return { narrow: true, disc: { x: 0, y: 0, w: Sd, h: Sd }, chart: { x: 0, y: Sd + 8, w: W, h: chH }, H: Sd + 8 + chH };
    }
    const Sd = Math.round(Math.min(W * 0.58, 560));
    return { narrow: false, disc: { x: 0, y: 0, w: Sd, h: Sd }, chart: { x: Sd + 10, y: Math.round(Sd * 0.08), w: W - Sd - 10, h: Math.round(Sd * 0.84) }, H: Sd };
  }
  function geo3() {
    const R = L.disc, rp = R.w / 2 - (L.narrow ? 30 : 38);
    return { cx: R.x + R.w / 2, cy: R.y + R.h / 2 + 2, rp: rp, k: rp / Q.RE };
  }
  function polar(g, r, th) { return [g.cx + r * g.k * Math.sin(th), g.cy - r * g.k * Math.cos(th)]; }
  const bg3 = document.createElement('canvas'), bg3c = bg3.getContext('2d');
  let bg3Key = '';
  function buildBg3() {
    const c = bg3c, g = geo3(), w = S.w3;
    bg3.width = cv.width; bg3.height = cv.height;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    D.backdrop(c, cw, ch);
    if (S.v3) { drawChart3(c); return; }
    // 大氣般的淡淡光暈（純裝飾，畫在地表外側，不改變地球的大小）
    const halo = c.createRadialGradient(g.cx, g.cy, g.rp, g.cx, g.cy, g.rp + 14);
    halo.addColorStop(0, alpha(C['b-wave'], C.dark ? 0.2 : 0.12)); halo.addColorStop(1, alpha(C['b-wave'], 0));
    c.fillStyle = halo; c.beginPath(); c.arc(g.cx, g.cy, g.rp + 14, 0, Math.PI * 2); c.fill();
    // 分層
    const mantle = mix(C['canvas-bg'], C.rock, C.dark ? 0.12 : 0.2), mantleDeep = mix(C['canvas-bg'], C.rock, C.dark ? 0.2 : 0.3);
    const outer = mix(C['canvas-bg'], C.dark ? C['b-thermo'] : C['b-mech'], C.dark ? 0.2 : 0.26), inner = mix(C['canvas-bg'], C.equi, C.dark ? 0.34 : 0.42);
    c.save();
    c.shadowColor = C.dark ? 'rgba(0,0,0,.6)' : alpha(C.text, 0.28); c.shadowBlur = 14; c.shadowOffsetY = 4;
    c.fillStyle = mantle; c.beginPath(); c.arc(g.cx, g.cy, g.rp, 0, Math.PI * 2); c.fill();
    c.restore();
    let gr = c.createRadialGradient(g.cx, g.cy, Q.R_CMB * g.k, g.cx, g.cy, g.rp);
    gr.addColorStop(0, mantleDeep); gr.addColorStop(1, mantle);
    c.fillStyle = gr; c.beginPath(); c.arc(g.cx, g.cy, g.rp, 0, Math.PI * 2); c.fill();
    gr = c.createRadialGradient(g.cx - Q.R_CMB * g.k * 0.3, g.cy - Q.R_CMB * g.k * 0.35, Q.R_CMB * g.k * 0.1, g.cx, g.cy, Q.R_CMB * g.k);
    gr.addColorStop(0, shade(outer, 0.12)); gr.addColorStop(1, shade(outer, -0.08));
    c.fillStyle = gr; c.beginPath(); c.arc(g.cx, g.cy, Q.R_CMB * g.k, 0, Math.PI * 2); c.fill();
    gr = c.createRadialGradient(g.cx - Q.R_ICB * g.k * 0.3, g.cy - Q.R_ICB * g.k * 0.35, 1, g.cx, g.cy, Q.R_ICB * g.k);
    gr.addColorStop(0, shade(inner, 0.25)); gr.addColorStop(1, inner);
    c.fillStyle = gr; c.beginPath(); c.arc(g.cx, g.cy, Q.R_ICB * g.k, 0, Math.PI * 2); c.fill();
    // 界面
    c.strokeStyle = alpha(C.text, 0.4); c.lineWidth = 1.2;
    [Q.R_CMB, Q.R_ICB].forEach(function (r) { c.beginPath(); c.arc(g.cx, g.cy, r * g.k, 0, Math.PI * 2); c.stroke(); });
    c.setLineDash([2, 4]); c.strokeStyle = alpha(C.text, 0.2); c.lineWidth = 1;
    c.beginPath(); c.arc(g.cx, g.cy, 5701 * g.k, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    c.strokeStyle = shade(C.rock, C.dark ? 0.1 : -0.3); c.lineWidth = 2;
    c.beginPath(); c.arc(g.cx, g.cy, g.rp, 0, Math.PI * 2); c.stroke();
    // 角度刻度
    const fA = fnt(L.narrow ? 9.5 : 10.5);
    for (let a = 0; a < 360; a += 10) {
      const th = a * Q.DEG, p1 = polar(g, Q.RE, th), p2 = polar(g, Q.RE * (a % 30 ? 1.025 : 1.04), th);
      c.strokeStyle = alpha(C.text, a % 30 ? 0.3 : 0.55); c.lineWidth = 1;
      c.beginPath(); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.stroke();
      if (a % 30 === 0 && a !== 0) {
        const lab = (a <= 180 ? a : 360 - a) + '°', p3 = polar(g, Q.RE * 1.1, th);
        D.haloText(c, lab, p3[0], p3[1], alpha(C.text, 0.6), 'center', 'middle', fA);
      }
    }
    // 陰影區
    if (w.shadow) {
      const z = E.zones;
      const arcBand = function (a0, a1, rr, col, dash) {
        [1, -1].forEach(function (sg) {
          c.beginPath();
          c.arc(g.cx, g.cy, rr, -Math.PI / 2 + sg * a0 * Q.DEG, -Math.PI / 2 + sg * a1 * Q.DEG, sg < 0);
          c.strokeStyle = alpha(col, C.dark ? 0.4 : 0.32); c.lineWidth = 6; c.lineCap = 'butt'; c.stroke();
          if (dash) { c.setLineDash([3, 3]); c.strokeStyle = alpha(col, 0.95); c.lineWidth = 1.5; c.stroke(); c.setLineDash([]); }
        });
      };
      if (w.wave !== 'S') arcBand(z.pMax, z.pkpMin, g.rp + 7, C.P, true);
      if (w.wave !== 'P') arcBand(z.sMax, 180, g.rp + (w.wave === 'S' ? 7 : 15), C.S, true);
    }
    // 射線束
    if (w.fan) {
      c.lineJoin = 'round';
      const drawRay = function (ray, col, a) {
        if (!w.inner && ray.phase === 'PKIKP') return;
        [1, -1].forEach(function (sg) {
          c.beginPath();
          ray.pts.forEach(function (q, i) { const p = polar(g, q[0], sg * q[1]); if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
          c.strokeStyle = alpha(col, a); c.lineWidth = 1; c.stroke();
          if (ray.blocked) {
            const e = ray.pts[ray.pts.length - 1], p = polar(g, e[0], sg * e[1]);
            c.strokeStyle = alpha(col, 0.9); c.lineWidth = 1.4;
            c.beginPath(); c.moveTo(p[0] - 3, p[1] - 3); c.lineTo(p[0] + 3, p[1] + 3); c.moveTo(p[0] + 3, p[1] - 3); c.lineTo(p[0] - 3, p[1] + 3); c.stroke();
          }
        });
      };
      if (w.wave !== 'P') E.fanS.forEach(function (r) { drawRay(r, C.S, C.dark ? 0.6 : 0.5); });
      if (w.wave !== 'S') E.fanP.forEach(function (r) { drawRay(r, r.phase === 'P' ? C.P : shade(C.P, C.dark ? 0.35 : 0.3), C.dark ? 0.65 : 0.55); });
    }
    // 區域標籤
    const fL = fnt(L.narrow ? 10.5 : 12, 600);
    tag(c, T('地函（固態）', 'Mantle (solid)'), g.cx, g.cy + (Q.R_CMB + 1450) * g.k, C.text, 'center', fL);
    tag(c, T('外核（液態）', 'Outer core (liquid)'), g.cx, g.cy + (Q.R_ICB + 1150) * g.k, C.text, 'center', fL);
    tag(c, T('內核（固態）', 'Inner core (solid)'), g.cx, g.cy, C.text, 'center', fL);
    if (!L.narrow) {
      D.haloText(c, T('核幔界面 2891 km', 'Core–mantle 2891 km'), g.cx - Q.R_CMB * g.k * 0.71 - 4, g.cy + Q.R_CMB * g.k * 0.71 + 2, alpha(C.text, 0.6), 'right', 'top', fA);
      D.haloText(c, T('內外核界面 5150 km', 'Inner core 5150 km'), g.cx - Q.R_ICB * g.k * 0.71 - 2, g.cy + Q.R_ICB * g.k * 0.71 + 2, alpha(C.text, 0.6), 'right', 'top', fA);
    }
    drawChart3(c);
  }
  function drawChart3(c) {
    const R = L.chart, z = E.zones, w = S.w3;
    panel(c, R);
    const padL = 38, padB = 26, padT = 24, padR = 10;
    const x0 = R.x + padL, x1 = R.x + R.w - padR, y0 = R.y + R.h - padB, y1 = R.y + padT;
    const TMAX = 30;
    const X = function (d) { return x0 + d / 180 * (x1 - x0); }, Y = function (tm) { return y0 - tm / TMAX * (y0 - y1); };
    const fA = fnt(L.narrow ? 9.5 : 10.5);
    // 陰影區
    if (w.shadow) {
      if (w.wave !== 'S') { c.fillStyle = alpha(C.P, 0.1); c.fillRect(X(z.pMax), y1, X(z.pkpMin) - X(z.pMax), y0 - y1); }
      if (w.wave !== 'P') { c.fillStyle = alpha(C.S, 0.07); c.fillRect(X(z.sMax), y1, X(180) - X(z.sMax), y0 - y1); }
    }
    c.strokeStyle = alpha(C.text, 0.1); c.lineWidth = 1 / dpr;
    c.beginPath();
    for (let d = 30; d <= 180; d += 30) { const x = snap(X(d)); c.moveTo(x, y0); c.lineTo(x, y1); }
    for (let tm = 5; tm <= TMAX; tm += 5) { const y = snap(Y(tm)); c.moveTo(x0, y); c.lineTo(x1, y); }
    c.stroke();
    c.strokeStyle = alpha(C.text, 0.5); c.lineWidth = 1;
    c.beginPath(); c.moveTo(x0, y1); c.lineTo(x0, y0); c.lineTo(x1, y0); c.stroke();
    for (let d = 0; d <= 180; d += 30) D.haloText(c, d + '°', X(d), y0 + 4, alpha(C.text, 0.6), 'center', 'top', fA);
    for (let tm = 0; tm <= TMAX; tm += 10) D.haloText(c, String(tm), x0 - 4, Y(tm), alpha(C.text, 0.6), 'right', 'middle', fA);
    D.haloText(c, T('走時（分）', 'Time (min)'), R.x + 8, R.y + 12, alpha(C.text, 0.7), 'left', 'middle', fnt(L.narrow ? 10 : 11, 600));
    D.haloText(c, T('角距 Δ', 'Distance Δ'), x1, y0 - 6, alpha(C.text, 0.6), 'right', 'bottom', fA);
    // 走時曲線：每 0.5° 取各相位最先到的時間（高速層、低速層造成的三重走時分支不畫，只畫初達）
    const line = function (pts, col, dash, lw) {
      c.save();
      if (dash) c.setLineDash(dash);
      c.strokeStyle = col; c.lineWidth = lw || 1.8; c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath();
      let on = false;
      pts.forEach(function (p) {
        if (!p) { on = false; return; }
        const x = X(p.deg), y = Y(p.T / 60);
        if (on) c.lineTo(x, y); else c.moveTo(x, y);
        on = true;
      });
      c.stroke();
      c.restore();
    };
    const cv3 = E.curves;
    if (w.wave !== 'P') line(cv3.S, C.S);
    if (w.wave !== 'S') {
      line(cv3.P, C.P);
      line(cv3.PKP, C.P, [6, 3]);
      if (w.inner) line(cv3.PKIKP, alpha(C.P, 0.75), [2, 3], 1.4);
    }
    // 曲線名稱
    const fL = fnt(L.narrow ? 10 : 11, 700);
    const at = function (list, deg) { const p = list[Math.round(deg * 2)]; return p ? p.T / 60 : null; };
    if (w.wave !== 'S') {
      const tp = at(cv3.P, 70), tk = at(cv3.PKP, 165);
      if (tp != null) D.haloText(c, 'P', X(70) + 4, Y(tp) + 4, C.P, 'left', 'top', fL);
      if (tk != null) D.haloText(c, 'PKP', X(165), Y(tk) - 5, C.P, 'center', 'bottom', fL);
      const ti = at(cv3.PKIKP, 125);
      if (w.inner && ti != null && !L.narrow) D.haloText(c, 'PKIKP', X(125), Y(ti) + 5, alpha(C.P, 0.85), 'center', 'top', fnt(10, 600));
    }
    if (w.wave !== 'P') { const ts = at(cv3.S, 70); if (ts != null) D.haloText(c, 'S', X(70) - 5, Y(ts) - 3, C.S, 'right', 'bottom', fL); }
  }
  function draw3(now) {
    const c = ctx, w = S.w3, g = geo3();
    const key = [cw, ch, dpr, colorsVer, D.ver, w.wave, w.fan, w.shadow, w.inner, S.v3].join('|');
    if (key !== bg3Key) { buildBg3(); bg3Key = key; }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(bg3, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const arr = arrivals3();
    if (!S.v3) drawDisc3(c, now, g, arr);
    // 走時圖上的測站
    const R = L.chart, padL = 38, padB = 26, padT = 24, padR = 10;
    const x0 = R.x + padL, x1 = R.x + R.w - padR, y0 = R.y + R.h - padB, y1 = R.y + padT;
    const X = function (d) { return x0 + d / 180 * (x1 - x0); }, Y = function (tm) { return y0 - tm / 30 * (y0 - y1); };
    c.strokeStyle = alpha(C.accent, 0.85); c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(snap(X(w.deg)), y1); c.lineTo(snap(X(w.deg)), y0); c.stroke();
    arr.forEach(function (a) {
      if ((a.phase === 'S' && w.wave === 'P') || (a.phase !== 'S' && w.wave === 'S') || (a.phase === 'PKIKP' && !w.inner)) return;
      D.ball(c, X(w.deg), Y(a.T / 60), 3.6, a.phase === 'S' ? C.S : C.P, { shadow: false });
    });
    if (w.t > 0) { const yt = Y(w.t / 60); if (yt > y1) { c.strokeStyle = alpha(C.text, 0.35); c.setLineDash([4, 3]); c.beginPath(); c.moveTo(x0, yt); c.lineTo(x1, yt); c.stroke(); c.setLineDash([]); } }
  }
  /** 模式三的地球剖面（2D）：標示的射線、震源、測站、波前動畫 */
  function drawDisc3(c, now, g, arr) {
    const w = S.w3;
    // 標示的射線
    const his = [];
    if (w.wave !== 'S') his.push([E.hiP, C.P]);
    if (w.wave !== 'P') his.push([E.hiS, C.S]);
    his.forEach(function (h) {
      const ray = h[0];
      c.save();
      c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath();
      ray.pts.forEach(function (q, i) { const p = polar(g, q[0], q[1]); if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
      c.strokeStyle = alpha(C['canvas-bg'], 0.85); c.lineWidth = 5; c.stroke();
      c.strokeStyle = h[1]; c.lineWidth = 2.6; c.stroke();
      c.restore();
      // 核幔界面的入射角與折射角
      const cx = ray.crossings.find(function (q) { return q.from !== 'oc' && q.to === 'oc'; });
      if (cx && ray.wave === 'P') {
        const pt = ray.down[cx.index], P = polar(g, pt[0], pt[1]);
        const nx = Math.sin(pt[1]), ny = -Math.cos(pt[1]); // 向外的法線（畫面座標）
        c.setLineDash([3, 3]); c.strokeStyle = alpha(C.text, 0.7); c.lineWidth = 1;
        c.beginPath(); c.moveTo(P[0] - nx * 34, P[1] - ny * 34); c.lineTo(P[0] + nx * 34, P[1] + ny * 34); c.stroke(); c.setLineDash([]);
        subLabel(c, 'i', '1', P[0] + nx * 26 + 10, P[1] + ny * 26, C.text, 12, 'left');
        subLabel(c, 'i', '2', P[0] - nx * 26 + 10, P[1] - ny * 26, C.text, 12, 'left');
      }
      if (ray.blocked) {
        const e = ray.pts[ray.pts.length - 1], p = polar(g, e[0], e[1]);
        tag(c, T('S 波到此為止', 'S stops here'), p[0] + 10, p[1], C.S, 'left', fnt(11, 700));
      }
    });
    // 震源
    star(c, g.cx, g.cy - g.rp, 9, C.pos);
    // 測站
    const th = w.deg * Q.DEG, P = polar(g, Q.RE, th), nrm = [Math.sin(th), -Math.cos(th)];
    const hot = S.drag3 || S.hover3;
    S.fx.forEach(function (f) { if (f.where === 'rcv') ringFx(c, f, P[0], P[1], now); });
    c.save();
    c.translate(P[0] + nrm[0] * 9, P[1] + nrm[1] * 9);
    c.rotate(th);
    stationMark(c, 0, 0, L.narrow ? 7.5 : 8.5, C.accent, hot);
    if (kbIs('rcv')) kbBox(c, -15, -15, 30, 30);
    c.restore();
    const hasP = arr.some(function (a) { return a.phase === 'P' || a.phase === 'PKP'; }), hasS = arr.some(function (a) { return a.phase === 'S'; });
    const lab = num(w.deg, 1) + '°  ' + (w.wave !== 'S' ? 'P ' + (hasP ? '✓' : '✗') : '') + (w.wave === 'PS' ? '  ' : '') + (w.wave !== 'P' ? 'S ' + (hasS ? '✓' : '✗') : '');
    const lp = polar(g, Q.RE * 1.2, th);
    const fLab = fnt(L.narrow ? 10.5 : 11.5, 700), hw = textW(c, lab, fLab) / 2 + 9;
    tag(c, lab, clamp(lp[0], L.disc.x + hw + 2, L.disc.x + L.disc.w - hw - 2), clamp(lp[1], 12, L.disc.h - 12), C.accent, 'center', fLab);
    // 波前動畫
    if (w.t > 0) {
      const dots = function (ray, col) {
        if (!w.inner && ray.phase === 'PKIKP') return;
        const p = Q.positionAt(ray, w.t);
        if (!p) return;
        [1, -1].forEach(function (sg) {
          const x = g.cx + sg * p[0] * g.k, y = g.cy - p[1] * g.k;
          c.fillStyle = alpha(col, 0.25); c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill();
          c.fillStyle = col; c.beginPath(); c.arc(x, y, 2.4, 0, Math.PI * 2); c.fill();
        });
      };
      if (w.wave !== 'P') E.fanS.forEach(function (r) { dots(r, C.S); });
      if (w.wave !== 'S') E.fanP.forEach(function (r) { dots(r, C.P); });
      tag(c, 't = ' + minsec(w.t) + (S.running && S.mode === 'earth' ? '  (' + (S.slow ? SPEED3 / 4 : SPEED3) + '×)' : ''), 8, 14, C.text, 'left', fnt(L.narrow ? 11 : 12, 600));
    }
  }
  function events3(t0, t1) {
    const w = S.w3;
    arrivals3().forEach(function (a) {
      if (!(t0 < a.T && t1 >= a.T)) return;
      if ((a.phase === 'S' && w.wave === 'P') || (a.phase !== 'S' && w.wave === 'S') || (a.phase === 'PKIKP' && !w.inner)) return;
      if (window.LabSound) {
        if (a.phase === 'S') window.LabSound.noise({ dur: 0.5, gain: 0.45, filter: 300, q: 0.8 });
        else if (a.phase === 'PKIKP') window.LabSound.noise({ dur: 0.25, gain: 0.18, filter: 420, q: 1.2 });
        else window.LabSound.noise({ dur: 0.35, gain: 0.32, filter: 380, q: 0.9 });
      }
      fxAdd('rcv', a.phase === 'S' ? C.S : C.P, 10);
      setStatus(T('測站收到 ', 'The station receives ') + a.phase + T('（地震後 ', ' (') + minsec(a.T) + T('）', ' after the earthquake)'));
    });
  }

  // =====================================================================
  // 共用：版面、繪圖、動畫
  // =====================================================================
  function computeLayout() {
    L = S.mode === 'waves' ? layout1() : S.mode === 'locate' ? layout2() : layout3();
  }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    computeLayout();
    ch = Math.round(L.H);
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    bg.width = cv.width; bg.height = cv.height;
    bgKey = ''; bg3Key = '';
    draw();
  }
  let drawQueued = false;
  function requestDraw() { if (drawQueued) return; drawQueued = true; requestAnimationFrame(function () { drawQueued = false; draw(); }); }
  function draw() {
    if (!L) return;
    const now = performance.now();
    S.fx = S.fx.filter(function (f) { return now - f.t0 < f.dur; });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (S.mode === 'waves') draw1(now);
    else if (S.mode === 'locate') draw2(now);
    else draw3(now);
    if (view3 && view3.active) view3.frame(now);
  }

  let lastT = 0, loopOn = false;
  function tick(tNow) {
    const dtReal = Math.min((tNow - lastT) / 1000, 1 / 30);
    lastT = tNow;
    const slow = S.slow ? 0.25 : 1;
    if (S.running) {
      if (S.mode === 'waves') {
        const w = S.w1, t0 = w.t;
        w.t = Math.min(w.tEnd, w.t + dtReal * SPEED1 * slow);
        events1(t0, w.t);
        if (w.t >= w.tEnd) finish1();
      } else if (S.mode === 'locate') {
        const w = S.w2, t0 = w.rec.t;
        w.rec.t = Math.min(w.we, w.rec.t + dtReal * SPEED2 * slow);
        events2(t0, w.rec.t);
        if (w.rec.t >= w.we) { w.rec.done = true; S.running = false; setStatus(T('紀錄完成。在每條紀錄上拖曳 P、S 游標，量出 S−P 時間差。', 'Recording complete. Drag the P and S cursors on each record to measure the S−P time.')); updateButtons(); }
      } else {
        const w = S.w3, t0 = w.t;
        w.t = Math.min(w.tEnd, w.t + dtReal * SPEED3 * slow);
        events3(t0, w.t);
        if (w.t >= w.tEnd) { w.done = true; S.running = false; updateButtons(); }
      }
    }
    draw();
    if (S.running || S.fx.length || (view3 && view3.active && view3.busy())) requestAnimationFrame(tick); else loopOn = false;
  }
  function startLoop() {
    if (loopOn) return;
    loopOn = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }
  function finish1() {
    const w = S.w1;
    w.done = true; S.running = false;
    updateButtons();
    const a0 = w.arr;
    setStatus(T('紀錄完成：P 波 ', 'Record complete: P at ') + num(a0.tP, 2) + T(' s 先到、S 波 ', ' s, S at ') + num(a0.tS, 2) + T(' s（S−P = ', ' s (S−P = ') + num(a0.sp, 2) +
      T(' s，距離 R = ', ' s, so R = ') + num(a0.R, 1) + T(' km），表面波 ', ' km); the surface wave arrives last at ') + num(a0.tR, 1) + T(' s 最晚到但振幅最大。', ' s but is the largest.'));
    if (w.user) {
      const a = w.arr;
      emit('quake1', { h: w.h, x: w.x, R: a.R, vp: w.vp, vs: w.vs, ratio: w.vp / w.vs, tP: a.tP, tS: a.tS, sp: a.sp, tR: a.tR, medium: w.medium });
    }
  }

  function setStatus(msg) { $('status').textContent = msg || ''; }
  function updateButtons() {
    const m = S.mode;
    let playing = S.running, fresh;
    if (m === 'waves') fresh = S.w1.t === 0 || S.w1.done;
    else if (m === 'locate') fresh = S.w2.rec.done;
    else fresh = S.w3.t === 0 || S.w3.done;
    $('play').textContent = playing ? T('暫停', 'Pause') : fresh ? T('播放', 'Play') : T('繼續', 'Resume');
    $('quake').textContent = m === 'locate' ? T('隨機地震', 'Random earthquake') : T('發生地震', 'Make an earthquake');
    const lab = S.v3 ? { // 3D 檢視時 2D 畫布只有輔助面板
      waves: T('地震儀紀錄、地面運動軌跡，以及液體與固體中的 P、S 波（剖面在上方的 3D 檢視）', 'Seismogram, ground motion, and P and S waves in a liquid and a solid (the section is in the 3D view above)'),
      locate: T('各測站的地震紀錄；在紀錄上拖曳 P、S 游標（地圖在上方的 3D 檢視，在那裡點地圖放你的震央標記）', 'Seismograms of each station; drag the P and S cursors on the records (the map is in the 3D view above; tap it there to place your epicenter marker)'),
      earth: T('走時曲線；拖曳可移動測站（地球剖面在上方的 3D 檢視）', 'Travel-time curves; drag to move the station (the Earth is in the 3D view above)') }[m]
      : { waves: T('地震波模擬：地殼剖面、地震儀紀錄、地面運動軌跡，以及液體與固體中的 P、S 波', 'Seismic wave simulation: crust section, seismogram, ground motion, and P and S waves in a liquid and a solid'),
      locate: T('臺灣地圖與各測站的地震紀錄；拖曳測站移動，在紀錄上拖曳 P、S 游標，點地圖放你的震央標記', 'Map of Taiwan and the seismograms of each station; drag stations to move them, drag the P and S cursors on the records, and tap the map to place your epicenter marker'),
      earth: T('地球剖面、地震波射線與走時曲線；沿地表拖曳測站', 'Cross-section of the Earth with seismic rays and travel-time curves; drag the station around the surface') }[m];
    cv.setAttribute('aria-label', lab + T('。按 Enter 切換要移動的物件，方向鍵移動，Shift 加方向鍵移動得更多。', '. Press Enter to choose an object, arrow keys to move it, Shift + arrow for bigger steps.'));
  }

  // ---------- 模式切換 ----------
  function setMode(m) {
    if (m === S.mode) return;
    S.running = false;
    S.mode = m;
    document.querySelectorAll('[data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === m)); });
    document.querySelectorAll('[data-m]').forEach(function (e) { e.hidden = e.dataset.m.split(' ').indexOf(m) < 0; });
    if (m === 'earth') init3();
    if (m === 'locate') refreshPicks();
    buildKbItems();
    setStatus('');
    bgKey = ''; bg3Key = '';
    resize();
    updateButtons();
    if (m === 'locate' && !S.w2.rec.done && !reducedMotion) { S.running = true; startLoop(); }
  }
  document.querySelectorAll('[data-mode]').forEach(function (b) { b.addEventListener('click', function () { setMode(b.dataset.mode); }); });

  // ---------- 播放列 ----------
  $('play').addEventListener('click', function () {
    if (S.running) { S.running = false; updateButtons(); requestDraw(); return; }
    if (S.mode === 'waves') {
      const w = S.w1;
      if (w.done || w.t === 0) { w.t = 0; w.done = false; w.user = true; w.chainSent = false; }
    } else if (S.mode === 'locate') {
      const w = S.w2;
      if (w.rec.done) { w.rec.t = w.ws; w.rec.done = false; }
    } else {
      const w = S.w3;
      if (w.done || w.t === 0) { w.t = 0; w.done = false; w.user = true; }
    }
    S.running = true;
    setStatus('');
    updateButtons();
    startLoop();
  });
  $('quake').addEventListener('click', function () {
    if (S.mode === 'waves') {
      const w = S.w1;
      w.t = 0; w.done = false; w.user = true; w.chainSent = false;
    } else if (S.mode === 'locate') {
      newQuake(Q.randomQuake(Math.random), 'random');
      setStatus(T('新的地震！震央藏起來了，量 S−P 把它找出來。', 'A new earthquake! The epicenter is hidden — find it from the S−P times.'));
      return;
    } else {
      const w = S.w3;
      w.t = 0; w.done = false; w.user = true;
    }
    S.running = true;
    setStatus('');
    updateButtons();
    startLoop();
  });
  $('reset').addEventListener('click', function () {
    S.running = false;
    S.fx = [];
    if (S.mode === 'waves') { S.w1.t = 0; S.w1.done = false; S.w1.user = false; }
    else if (S.mode === 'locate') {
      const w = S.w2;
      w.stations.forEach(resetPicks);
      w.est = null; w.history = []; w.marks = []; w.mkActive = 0;
      refreshPicks();
      buildKbItems();
    } else { S.w3.t = 0; S.w3.done = false; }
    setStatus(T('已全部清除，滑桿設定不變。', 'Everything is cleared; the slider settings are kept.'));
    updateButtons();
    requestDraw();
  });
  $('slow').addEventListener('change', function (ev) { S.slow = ev.target.checked; requestDraw(); });

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
  updateSoundButton();

  // ---------- 模式一的控制項 ----------
  const elH = $('h1'), elX = $('x1'), elVp = $('vp1'), elVs = $('vs1');
  function showOut(el, unit) { $(el.id + 'o').textContent = fmtSlider(val(el), el) + ' ' + unit; }
  function readSliders1() {
    const w = S.w1;
    w.h = val(elH); w.x = val(elX); w.vp = val(elVp);
    let vs = val(elVs);
    const lim = w.vp * Math.sqrt(3) / 2 * 0.999; // Vp/Vs > 2/√3
    $('vsWarn').hidden = vs <= lim;
    if (vs > lim) vs = Math.floor(lim * 100) / 100;
    w.vs = vs;
  }
  function params1Changed() {
    readSliders1();
    const w = S.w1;
    w.t = 0; w.done = false; w.user = false; w.chainSent = false;
    if (S.mode === 'waves') S.running = false;
    recompute1();
    updateButtons();
    requestDraw();
  }
  let committed1 = null;
  function setting1() { const w = S.w1; return { vp: w.vp, vs: w.vs, ratio: w.vp / w.vs, nu: Q.poisson(w.vp, w.vs), h: w.h, x: w.x, medium: w.medium }; }
  function emitParams1() {
    const cur = setting1();
    if (committed1 && ['vp', 'vs', 'h', 'x', 'medium'].every(function (k) { return cur[k] === committed1[k]; })) return;
    const prev = committed1; committed1 = cur;
    emit('params1', Object.assign({ prev: prev }, cur));
  }
  [[elH, 'km'], [elX, 'km'], [elVp, 'km/s'], [elVs, 'km/s']].forEach(function (pr) {
    pr[0].addEventListener('input', function () { showOut(pr[0], pr[1]); params1Changed(); });
    pr[0].addEventListener('change', emitParams1);
  });
  function setMedium(m) {
    if (S.w1.medium === m) return;
    S.w1.medium = m;
    $('medLiquid').setAttribute('aria-pressed', String(m === 'liquid'));
    $('medSolid').setAttribute('aria-pressed', String(m === 'solid'));
    params1Changed();
    emitParams1();
  }
  $('medLiquid').addEventListener('click', function () { setMedium('liquid'); });
  $('medSolid').addEventListener('click', function () { setMedium('solid'); });
  [['showDots', 'dots'], ['showFronts', 'fronts'], ['showRay', 'ray']].forEach(function (pr) {
    $(pr[0]).addEventListener('change', function (ev) { S.w1.show[pr[1]] = ev.target.checked; requestDraw(); });
  });

  // ---------- 模式二的控制項 ----------
  document.querySelectorAll('[data-n]').forEach(function (b) {
    b.addEventListener('click', function () {
      const n = +b.dataset.n, w = S.w2;
      if (n === w.n) return;
      w.n = n;
      document.querySelectorAll('[data-n]').forEach(function (x) { x.setAttribute('aria-pressed', String(+x.dataset.n === n)); });
      if (w.est) w.est.stale = true;
      updateWindow();
      refreshPicks();
      buildKbItems();
      resize();
    });
  });
  const elVpc = $('vpc'), elVsc = $('vsc');
  [[elVpc, 'vpc'], [elVsc, 'vsc']].forEach(function (pr) {
    pr[0].addEventListener('input', function () {
      let v = val(pr[0]);
      S.w2[pr[1]] = v;
      if (S.w2.vsc >= S.w2.vpc * 0.98) S.w2.vsc = S.w2.vpc * 0.98;
      showOut(pr[0], 'km/s');
      picksChanged();
    });
  });
  $('errMode').addEventListener('change', function () {
    const w = S.w2;
    w.stations.forEach(resetPicks);
    w.est = null;
    updateQuakeData();
    startRecording();
    setStatus($('errMode').checked ? T('已加入誤差：紀錄有雜訊，每條路徑的波速也略有不同。', 'Errors on: the records are noisy and each path has a slightly different speed.') : T('已移除誤差。', 'Errors off.'));
  });
  $('rand').addEventListener('click', function () {
    newQuake(Q.randomQuake(Math.random), 'random');
    setStatus(T('新的地震！震央藏起來了，量 S−P 把它找出來。', 'A new earthquake! The epicenter is hidden — find it from the S−P times.'));
  });
  $('reveal').addEventListener('click', function () {
    const q = S.w2.quake;
    if (!q.revealed) { q.revealed = true; emit('reveal', { source: q.source }); }
    refreshPicks();
    requestDraw();
    const e = S.w2.est;
    setStatus(T('真實震央：', 'True epicenter: ') + lonlatText(q.x, q.y) + T('，深度 ', ', depth ') + num(q.h, 1) + ' km' +
      (e && e.candidates.length === 1 ? T('。你的估計差了 ', '. Your estimate is off by ') + num(e.err, 1) + ' km' : '') + T('。', '.'));
  });
  const elLon = $('qlon'), elLat = $('qlat'), elQh = $('qh');
  [[elLon, '°E'], [elLat, '°N'], [elQh, 'km']].forEach(function (pr) { pr[0].addEventListener('input', function () { showOut(pr[0], pr[1]); }); });
  $('applyQ').addEventListener('click', function () {
    newQuake({ lon: val(elLon), lat: val(elLat), h: val(elQh) }, 'manual');
    setStatus(T('已在指定的位置發生地震（震央顯示在地圖上）。', 'An earthquake at the chosen place (the epicenter is shown on the map).'));
  });
  $('chichi').addEventListener('click', function () {
    setVal(elLon, 120.82); setVal(elLat, 23.85); setVal(elQh, 8);
    newQuake({ lon: 120.82, lat: 23.85, h: 8 }, 'preset');
    setStatus(T('集集一帶的地震（1999 年 921 地震的震央附近）。', 'An earthquake near Chi-Chi (around the epicenter of the 1999 quake).'));
  });
  $('locateBtn').addEventListener('click', doLocate);
  $('solveBtn').addEventListener('click', showSolution);
  // 我的標記：1 個（一般）或 2 個（兩站、測站排成一直線時有兩個可能的位置）
  document.querySelectorAll('[data-mk]').forEach(function (b) {
    b.addEventListener('click', function () {
      const n = +b.dataset.mk, w = S.w2;
      if (n === w.nMarks) return;
      w.nMarks = n;
      if (w.marks.length > n) w.marks.length = n;
      w.mkActive = Math.min(w.mkActive, Math.max(0, w.marks.length - 1));
      document.querySelectorAll('[data-mk]').forEach(function (x) { x.setAttribute('aria-pressed', String(+x.dataset.mk === n)); });
      buildKbItems();
      marksChanged();
      setStatus(n === 2 ? T('在地圖上點出兩個可能的位置（兩個圓的兩個交點）。', 'Tap the two possible places on the map (where the two circles cross).') : '');
    });
  });
  // 微調鍵：每按一次移動 0.5 km
  document.querySelectorAll('[data-nudge]').forEach(function (b) {
    b.addEventListener('click', function () {
      const w = S.w2, m = w.marks[w.mkActive];
      if (!m) { setStatus(T('先在地圖上點一下，放上你的震央標記。', 'Tap the map first to place your epicenter marker.')); return; }
      const d = b.dataset.nudge.split(',');
      moveMark(w.mkActive, m.x + 0.5 * d[0], m.y + 0.5 * d[1]);
    });
  });
  $('clearMarks').addEventListener('click', function () {
    const w = S.w2;
    w.marks = []; w.mkActive = 0;
    buildKbItems();
    marksChanged();
  });
  $('autoPick').addEventListener('click', function () {
    S.w2.quake.autoUsed = true; // 這個地震看過答案了：之後的定位不算「自己量」
    activeStations().forEach(function (s) { s.picks = { p: s.arr.tP, s: s.arr.tS, mp: false, ms: false, auto: true }; });
    picksChanged();
    setStatus(T('已自動把游標放在 P、S 波真正到達的時刻（這是答案，任務不算）。', 'The cursors are placed at the true P and S arrivals (this is the answer; it does not count for missions).'));
  });
  $('showChords').addEventListener('change', function (ev) { S.w2.chords = ev.target.checked; requestDraw(); });

  // ---------- 模式三的控制項 ----------
  document.querySelectorAll('[data-wave]').forEach(function (b) {
    b.addEventListener('click', function () {
      S.w3.wave = b.dataset.wave;
      document.querySelectorAll('[data-wave]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.wave === S.w3.wave)); });
      readouts3(); requestDraw();
    });
  });
  const elTk = $('tko'), elRc = $('rcv');
  elTk.addEventListener('input', function () { showOut(elTk, '°'); S.w3.takeoff = val(elTk); if (S.w3.ready) { updateHi(); readouts3(); requestDraw(); } });
  elTk.addEventListener('change', function () {
    if (!S.w3.ready) return;
    const rays = [];
    if (S.w3.wave !== 'S') rays.push(E.hiP);
    if (S.w3.wave !== 'P') rays.push(E.hiS);
    rays.forEach(function (r) {
      emit('ray3', { wave: r.wave, takeoff: S.w3.takeoff, phase: r.phase, turnR: r.turnR, deepest: r.deepest, delta: r.delta / Q.DEG, blocked: !!r.blocked });
    });
  });
  elRc.addEventListener('input', function () { showOut(elRc, '°'); S.w3.deg = val(elRc); if (S.w3.ready) { readouts3(); requestDraw(); } });
  elRc.addEventListener('change', emitStation3);
  function emitStation3() {
    if (!S.w3.ready) return;
    const arr = arrivals3(), w = S.w3;
    setStatus(T('測站在 ', 'Station at ') + num(w.deg, 1) + '°' + T('：', ': ') + station3Text());
    emit('station3', {
      deg: w.deg, P: arr.some(function (a) { return a.phase === 'P' || a.phase === 'PKP'; }), S: arr.some(function (a) { return a.phase === 'S'; }),
      IK: arr.some(function (a) { return a.phase === 'PKIKP'; }), inner: w.inner, wave: w.wave, sMax: E.zones.sMax, pMax: E.zones.pMax, pkpMin: E.zones.pkpMin
    });
  }
  [['showFan', 'fan'], ['showShadow', 'shadow'], ['showInner', 'inner']].forEach(function (pr) {
    $(pr[0]).addEventListener('change', function (ev) { S.w3[pr[1]] = ev.target.checked; requestDraw(); });
  });

  // =====================================================================
  // 指標（滑鼠、觸控）
  // =====================================================================
  function pos(ev) { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  function hitTest(p) {
    if (!L) return null;
    if (S.mode === 'waves') {
      if (S.v3) return null; // 3D 檢視：震源與地震儀在 3D 裡拖曳
      const fx = X1px(0), fy = Y1px(S.w1.h), sx = X1px(S.w1.x), s = L.narrow ? 7 : 8.5;
      if (Math.hypot(p.x - fx, p.y - fy) < 22) return { kind: 'focus' };
      if (Math.abs(p.x - sx) < 22 && p.y > L.sky - 2 * s - 24 && p.y < L.sky + 14) return { kind: 'station' };
      return null;
    }
    if (S.mode === 'locate') {
      const st = activeStations(), mk = S.w2.marks;
      if (!S.v3) {
        // 標記比測站優先（標記常常要放在測站附近微調）；觸控時範圍大一點
        let bi = -1, bd = touchLike ? 26 : 20;
        mk.forEach(function (m, i) { const d = Math.hypot(p.x - MX(m.x), p.y - MY(m.y)); if (d < bd) { bd = d; bi = i; } });
        if (bi >= 0) return { kind: 'mark', i: bi, dx: MX(mk[bi].x) - p.x, dy: MY(mk[bi].y) - p.y };
        for (let i = st.length - 1; i >= 0; i--) if (Math.hypot(p.x - MX(st[i].x), p.y - MY(st[i].y)) < 22) return { kind: 'station', i: i };
      }
      for (let i = 0; i < st.length; i++) {
        const R = trRow(i);
        if (p.x >= L.tr.x && p.x <= L.tr.x + L.tr.w && p.y >= R.y - 2 && p.y <= R.y + R.h + 2) {
          const xp = tToX(cursorT(st[i], 'p')), xs = tToX(cursorT(st[i], 's'));
          return { kind: 'cursor', i: i, which: Math.abs(p.x - xp) <= Math.abs(p.x - xs) ? 'p' : 's' };
        }
      }
      // 地圖空白處：點一下放標記（不拖曳、不阻止捲動）
      if (!S.v3 && p.x >= L.map.x && p.x <= L.map.x + L.map.w && p.y >= L.map.y && p.y <= L.map.y + L.map.h) return { kind: 'map' };
      return null;
    }
    if (S.mode === 'earth' && S.w3.ready) {
      const g = geo3(), d = Math.hypot(p.x - g.cx, p.y - g.cy);
      if (!S.v3 && Math.abs(d - g.rp) < 26) return { kind: 'rcv' };
      const R = L.chart;
      if (p.x >= R.x + 30 && p.x <= R.x + R.w && p.y >= R.y && p.y <= R.y + R.h) return { kind: 'chart' };
    }
    return null;
  }
  let drag = null, tap = null, touchLike = false;
  cv.addEventListener('touchstart', function (ev) {
    const t = ev.touches[0]; if (!t) return;
    touchLike = true;
    const h = hitTest(pos(t));
    if (h && h.kind !== 'map') ev.preventDefault(); // 按在可拖曳的東西上才阻止捲動（地圖空白處只是點一下，照常可以捲動）
  }, { passive: false });
  cv.addEventListener('pointerdown', function (ev) {
    touchLike = ev.pointerType !== 'mouse';
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    const p = pos(ev), h = hitTest(p);
    tap = null;
    if (!h) return;
    if (h.kind === 'map') { tap = { x: p.x, y: p.y, id: ev.pointerId }; return; } // 放開時才放標記；移動超過 8 px 就當成捲動或拖曳，不放
    drag = h;
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    if (S.mode === 'waves') S.drag1 = h.kind;
    if (S.mode === 'locate') { S.w2.drag = h; if (h.kind === 'cursor') S.w2.active = { i: h.i, which: h.which }; if (h.kind === 'mark') { S.w2.mkActive = h.i; requestDraw(); } }
    if (S.mode === 'earth') S.drag3 = true;
    if (h.kind !== 'mark') moveDrag(p); // 標記按下去不跳動，移動時才跟著走
    ev.preventDefault();
  });
  cv.addEventListener('pointermove', function (ev) {
    const p = pos(ev);
    if (tap && (ev.pointerId !== tap.id || Math.hypot(p.x - tap.x, p.y - tap.y) > 8)) tap = null;
    if (!drag) {
      const h = hitTest(p);
      cv.style.cursor = h ? (h.kind === 'cursor' || h.kind === 'chart' ? 'ew-resize' : h.kind === 'map' ? 'crosshair' : 'grab') : 'default';
      const prev = JSON.stringify([S.hover1, S.hover2, S.hover3]);
      S.hover1 = S.mode === 'waves' && h ? h.kind : null;
      S.hover2 = S.mode === 'locate' && h && (h.kind === 'station' || h.kind === 'mark') ? { kind: h.kind, i: h.i } : null;
      S.hover3 = S.mode === 'earth' && h && h.kind === 'rcv';
      if (prev !== JSON.stringify([S.hover1, S.hover2, S.hover3])) requestDraw();
      return;
    }
    moveDrag(p);
  });
  function endDrag() {
    if (!drag) return;
    const h = drag;
    drag = null;
    if (S.mode === 'waves') { S.drag1 = null; emitParams1(); }
    if (S.mode === 'locate') {
      S.w2.drag = null;
      if (h.kind === 'cursor') picksChanged();
      if (h.kind === 'station') { updateWindow(); refreshPicks(); }
    }
    if (S.mode === 'earth') { S.drag3 = false; emitStation3(); }
    requestDraw();
  }
  cv.addEventListener('pointerup', function (ev) {
    // 地圖空白處點一下（沒有移動）：放上或移過來你的震央標記
    if (tap && ev.pointerId === tap.id && S.mode === 'locate' && !S.v3) {
      const p = pos(ev);
      if (Math.hypot(p.x - tap.x, p.y - tap.y) <= 8) {
        const q = invM(clamp(p.x, L.map.x, L.map.x + L.map.w), clamp(p.y, L.map.y, L.map.y + L.map.h));
        placeMark(q.x, q.y);
      }
    }
    tap = null;
    endDrag();
  });
  cv.addEventListener('pointercancel', function () { tap = null; endDrag(); });
  cv.addEventListener('lostpointercapture', endDrag);
  function moveDrag(p) {
    if (S.mode === 'waves') {
      if (drag.kind === 'focus') setVal(elH, Math.round(clamp((p.y - L.sky) / L.k, 2, 40)));
      else setVal(elX, Math.round(clamp((p.x / L.k) + X1.x0, 0, 100)));
      return;
    }
    if (S.mode === 'locate') {
      const w = S.w2, st = activeStations();
      if (drag.kind === 'station') {
        moveStation2(drag.i, invM(clamp(p.x, L.map.x + 4, L.map.x + L.map.w - 4), clamp(p.y, L.map.y + 4, L.map.y + L.map.h - 4)));
      } else if (drag.kind === 'mark') {
        // 保持按下時手指與標記中心的相對位置（標記不會跳到手指底下被遮住）
        const q = invM(clamp(p.x + drag.dx, L.map.x, L.map.x + L.map.w), clamp(p.y + drag.dy, L.map.y, L.map.y + L.map.h));
        moveMark(drag.i, q.x, q.y);
      } else {
        const s = st[drag.i];
        const t = clamp(xToT(p.x), w.ws, w.we);
        s.picks[drag.which] = Math.round(t * 100) / 100;
        s.picks[drag.which === 'p' ? 'mp' : 'ms'] = true;
        s.picks.auto = false;
        if (w.est) w.est.stale = true;
        requestDraw();
      }
      return;
    }
    if (S.mode === 'earth') {
      let deg;
      if (drag.kind === 'chart') {
        const R = L.chart, x0 = R.x + 38, x1 = R.x + R.w - 10;
        deg = clamp((p.x - x0) / (x1 - x0) * 180, 0, 180);
      } else {
        const g = geo3();
        deg = Math.abs(Math.atan2(p.x - g.cx, -(p.y - g.cy))) / Q.DEG;
      }
      setVal(elRc, Math.round(deg * 2) / 2);
    }
  }
  /** 模式二：把測站 i 移到 q = {x, y}（km）；靠近城市 7 km 內吸附過去（2D 與 3D 的拖曳共用） */
  function moveStation2(i, q) {
    const w = S.w2, s = activeStations()[i];
    if (!s) return;
    let cid = null;
    Q.CITIES.forEach(function (c) { const cp = Q.toXY(c.lon, c.lat); if (Math.hypot(cp.x - q.x, cp.y - q.y) < 7) { q = { x: cp.x, y: cp.y }; cid = c.id; } });
    if (q.x === s.x && q.y === s.y) return;
    s.x = q.x; s.y = q.y; s.city = cid;
    resetPicks(s);
    stationData(s, i);
    if (w.est) w.est.stale = true;
    requestDraw();
  }
  /** 3D 檢視的拖曳（由 earthquake-3d.js 呼叫）：與 2D 拖曳走同一條路（滑桿、測站資料、任務事件） */
  function drag3(kind, a, b) {
    if (kind === 'focus') setVal(elH, Math.round(clamp(a, 2, 40)));
    else if (kind === 'station1') setVal(elX, Math.round(clamp(a, 0, 100)));
    else if (kind === 'station2') moveStation2(a, { x: clamp(b.x, MAPX0 + 1, MAPX1 - 1), y: clamp(b.y, MAPY0 + 1, MAPY1 - 1) });
    else if (kind === 'rcv') setVal(elRc, Math.round(clamp(a, 0, 180) * 2) / 2);
    else if (kind === 'mark') moveMark(a, b.x, b.y);
  }
  function dragEnd3(kind) {
    if (kind === 'focus' || kind === 'station1') emitParams1();
    else if (kind === 'station2') { updateWindow(); refreshPicks(); }
    else if (kind === 'rcv') emitStation3();
    requestDraw();
  }

  // ---------- 鍵盤操作（js/keys.js）：Enter 切換物件、方向鍵移動、Shift 大步；限制與拖曳相同 ----------
  const kbItems = [];
  let kb = null;
  function kbIs(kind, i, which) {
    if (!kb || !kb.focused()) return false;
    const it = kbItems[kb.index()];
    return !!it && it.kind === kind && (i == null || it.i === i) && (which == null || it.which === which);
  }
  function stName(i) { const s = S.w2.stations[i]; return s.label + (s.city ? ' ' + cityName(s.city) : ''); }
  function buildKbItems() {
    kbItems.length = 0;
    if (S.mode === 'waves') {
      kbItems.push({
        kind: 'focus', name: function () { return T('震源', 'Focus'); },
        move: function (dx, dy, big) {
          if (!dy) return false;
          const v = clamp(val(elH) - dy * (big ? 5 : 1), 2, 40);
          if (v === val(elH)) return false;
          setVal(elH, v); emitParams1(); return true;
        },
        describe: function () { return T('震源深度 ', 'Focal depth ') + num(S.w1.h, 0) + ' km'; }
      });
      kbItems.push({
        kind: 'station', name: function () { return T('地震儀', 'Seismometer'); },
        move: function (dx, dy, big) {
          if (!dx) return false;
          const v = clamp(val(elX) + dx * (big ? 10 : 1), 0, 100);
          if (v === val(elX)) return false;
          setVal(elX, v); emitParams1(); return true;
        },
        describe: function () { return T('測站距震央 ', 'Station ') + num(S.w1.x, 0) + T(' km，S−P 時間差 ', ' km from the epicenter, S−P time ') + num(S.w1.arr.sp, 2) + ' s'; }
      });
    } else if (S.mode === 'locate') {
      activeStations().forEach(function (st, i) {
        kbItems.push({
          kind: 'station', i: i, name: function () { return T('測站 ', 'Station ') + stName(i); },
          move: function (dx, dy, big) {
            const s = S.w2.stations[i], step = big ? 10 : 2;
            const nx = clamp(s.x + dx * step, MAPX0 + 4 / L.s, MAPX1 - 4 / L.s), ny = clamp(s.y + dy * step, MAPY0 + 4 / L.s, MAPY1 - 4 / L.s);
            if (nx === s.x && ny === s.y) return false;
            s.x = nx; s.y = ny; s.city = null;
            Q.CITIES.forEach(function (c) { const cp = Q.toXY(c.lon, c.lat); if (Math.hypot(cp.x - nx, cp.y - ny) < 0.5) s.city = c.id; });
            resetPicks(s); stationData(s, i);
            if (S.w2.est) S.w2.est.stale = true;
            updateWindow(); refreshPicks(); return true;
          },
          describe: function () { const s = S.w2.stations[i]; return T('測站 ', 'Station ') + stName(i) + T('，位置 ', ' at ') + lonlatText(s.x, s.y); }
        });
        ['p', 's'].forEach(function (which) {
          kbItems.push({
            kind: 'cursor', i: i, which: which, name: function () { return stName(i) + ' ' + which.toUpperCase() + T(' 游標', ' cursor'); },
            move: function (dx, dy, big) {
              if (!dx) return false;
              const s = S.w2.stations[i], w = S.w2;
              s.picks[which] = Math.round(clamp(cursorT(s, which) + dx * (big ? 0.5 : 0.05), w.ws, w.we) * 100) / 100;
              s.picks[which === 'p' ? 'mp' : 'ms'] = true;
              s.picks.auto = false;
              picksChanged(); return true;
            },
            describe: function () {
              const s = S.w2.stations[i], both = s.picks.p != null && s.picks.s != null && s.picks.s > s.picks.p;
              return stName(i) + ' ' + which.toUpperCase() + T(' 游標在 ', ' cursor at ') + clock(S.w2.quake.T0 + cursorT(s, which)) + (both ? '；S−P = ' + num(s.picks.s - s.picks.p, 2) + ' s' : '');
            }
          });
        });
      });
      // 你的震央標記：方向鍵每次 0.5 km、Shift 5 km；還沒標滿時多一項「放一個標記」（先放在地圖中央）
      const w2 = S.w2, mkName = function (i) { return w2.nMarks > 1 ? T('標記 ', 'Marker ') + (i + 1) : T('我的震央', 'My epicenter'); };
      for (let i = 0; i < Math.min(w2.nMarks, w2.marks.length + 1); i++) {
        kbItems.push({
          kind: 'mark', i: i, name: function () { return mkName(i); },
          move: function (dx, dy, big) {
            const st = big ? 5 : 0.5;
            if (!w2.marks[i]) { placeMark((MAPX0 + MAPX1) / 2, (MAPY0 + MAPY1) / 2); return true; }
            const m = w2.marks[i];
            moveMark(i, m.x + dx * st, m.y + dy * st); // 上鍵 dy = +1 = 往北
            return true;
          },
          describe: function () {
            const m = w2.marks[i];
            if (!m) return mkName(i) + T('：按方向鍵放一個標記', ': press an arrow key to place a marker');
            const d = myDepth();
            return mkName(i) + T('在 ', ' at ') + lonlatText(m.x, m.y) + (d && w2.marks.length === 1 ? T('，推算深度 ', ', depth ') + num(d.h, 1) + ' km' : '');
          }
        });
      }
    } else {
      kbItems.push({
        kind: 'rcv', name: function () { return T('測站', 'Station'); },
        move: function (dx, dy, big) {
          const d = dx || -dy;
          if (!d) return false;
          const v = clamp(val(elRc) + d * (big ? 5 : 0.5), 0, 180);
          if (v === val(elRc)) return false;
          setVal(elRc, v); emitStation3(); return true;
        },
        describe: function () { return T('測站角距 ', 'Station at ') + num(S.w3.deg, 1) + '°' + (S.w3.ready ? '：' + station3Text() : ''); }
      });
    }
    if (kb && kb.index() >= kbItems.length) kb.select(0);
  }
  function kbBox(c, x, y, w, h) {
    c.save();
    c.setLineDash([4, 3]);
    c.strokeStyle = C.accent; c.lineWidth = 1.6;
    D.roundRect(c, x, y, w, h, 6); c.stroke();
    c.restore();
  }

  // =====================================================================
  // 3D 檢視：切換到 3D 時才載入 js/earthquake-3d.js 與 three.js（以 import() 動態載入）；切回 2D 時整個釋放。
  // 3D 畫的是同一份物理：bridge 把狀態 S 與核心 Q 交給它，幾何與時間全部由 earthquake-core.js 算。
  // =====================================================================
  let threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    Q: Q, T: T, D: D, S: S, E: E, EN: EN,
    colors: function () { return C; },
    reducedMotion: reducedMotion,
    num: num, minsec: minsec, clock: clock, cityName: cityName, lonlatText: lonlatText, phaseName: phaseName,
    // 模式一：與 2D 剖面同一組參數與同一個位移放大（vis）
    w1Params: w1Params, vis: vis, vr1: function () { return vr1; }, grid1: { x0: -15, x1: 105, depth: X1.depth },
    // 模式二：測站、量到的距離、地圖範圍、真實波速
    activeStations: activeStations, pickedStations: pickedStations, stationR: stationR, kConv: kConv,
    map: { x0: MAPX0, x1: MAPX1, y0: MAPY0, y1: MAPY1 }, VP: VP_TRUE, VS: VS_TRUE,
    // 模式三：測站收到的波
    arrivals3: arrivals3, station3Text: station3Text,
    speed: function (m) { return S.running && S.mode === m ? '  (' + ({ waves: SPEED1, locate: SPEED2, earth: SPEED3 })[m] / (S.slow ? 4 : 1) + '×)' : ''; },
    drag: drag3, dragEnd: dragEnd3,
    // 你的震央標記：3D 點地圖放置；推算的深度；確認後才看得到的電腦解
    placeMark: placeMark, myDepth: myDepth, liveEst: liveEst,
    request: requestDraw,
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Quake3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Quake3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/earthquake-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Quake3D) throw new Error('earthquake-3d.js did not load');
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function updateViewNotes() { $('resetCam').hidden = !(view3 && view3.active); }
  /** 3D 開關：2D 畫布改成只畫輔助面板（紀錄、走時圖），版面高度跟著變 */
  function setV3(on) {
    if (S.v3 === on) return;
    S.v3 = on;
    stage.classList.toggle('is3d', on);
    bgKey = ''; bg3Key = '';
    resize();
    updateButtons();
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
        view3 = window.Quake3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        setV3(true);
        updateViewNotes();
        requestAnimationFrame(function () { if (view3) { view3.onShow(); requestDraw(); } });
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
      setV3(false);
      updateViewNotes();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    setPressed('2d');
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    setV3(false);
    updateViewNotes();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  readSliders1();
  [[elH, 'km'], [elX, 'km'], [elVp, 'km/s'], [elVs, 'km/s'], [elVpc, 'km/s'], [elVsc, 'km/s'], [elLon, '°E'], [elLat, '°N'], [elQh, 'km'], [elTk, '°'], [elRc, '°']]
    .forEach(function (pr) { showOut(pr[0], pr[1]); });
  recompute1();
  committed1 = setting1();
  initStations();
  newQuake(Q.randomQuake(Math.random), 'random');
  S.running = false;
  function themeChanged() { readColors(); bgKey = ''; bg3Key = ''; if (S.mode === 'locate') refreshPicks(); if (view3 && view3.active) view3.onTheme(); requestDraw(); }
  window.addEventListener('lab:themechange', themeChanged);
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', themeChanged);
  }
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
  }
  window.addEventListener('resize', resize);
  if (window.LabKeys) kb = window.LabKeys.attach(cv, { items: kbItems, onChange: requestDraw });
  buildKbItems();
  // 分享連結：模式二的測站位置與地震（滑桿、勾選框、模式按鈕由 classroom.js 自動記錄）。
  // classroom.js 由 settings.js 在 DOMContentLoaded 時才載入，所以等它出現再登記（window load 時一定已載入，且早於它還原網址設定）
  let shareOn = false;
  function registerShare() {
    if (shareOn || !window.LabShare) return;
    shareOn = true;
    window.LabShare.register({
      get: function () {
        const q = S.w2.quake;
        return {
          st: S.w2.stations.map(function (s) { return [Math.round(s.x * 10) / 10, Math.round(s.y * 10) / 10]; }),
          q: [Math.round(q.lon * 1000) / 1000, Math.round(q.lat * 1000) / 1000, q.h, q.seed, q.T0, q.revealed ? 1 : 0]
        };
      },
      set: function (o) {
        if (!o || typeof o !== 'object') return;
        const okNum = function (v) { return typeof v === 'number' && isFinite(v); };
        if (Array.isArray(o.st)) {
          o.st.slice(0, S.w2.stations.length).forEach(function (pt, i) {
            if (!Array.isArray(pt) || !okNum(pt[0]) || !okNum(pt[1])) return;
            const s = S.w2.stations[i];
            s.x = clamp(pt[0], MAPX0, MAPX1); s.y = clamp(pt[1], MAPY0, MAPY1); s.city = null;
            Q.CITIES.forEach(function (c) { const cp = Q.toXY(c.lon, c.lat); if (Math.hypot(cp.x - s.x, cp.y - s.y) < 0.5) s.city = c.id; });
          });
        }
        const q = Array.isArray(o.q) ? o.q : null;
        if (q && okNum(q[0]) && okNum(q[1]) && okNum(q[2])) {
          newQuake({
            lon: clamp(q[0], Q.MAP.lon0, Q.MAP.lon1), lat: clamp(q[1], Q.MAP.lat0, Q.MAP.lat1), h: clamp(q[2], 0, 60),
            seed: okNum(q[3]) ? q[3] : null, T0: okNum(q[4]) ? clamp(Math.round(q[4]), 0, 86399) : null
          }, q[5] ? 'manual' : 'random');
        } else { updateQuakeData(); startRecording(); }
        buildKbItems();
        resize();
      }
    });
  }
  registerShare();
  document.addEventListener('DOMContentLoaded', registerShare);
  window.addEventListener('load', registerShare);
  resize();
  updateButtons();
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：按「播放」開始。', 'Reduced motion is on: press “Play” to start.'));
  else { S.running = true; startLoop(); } // 自動播放一次（不算任務）
  // 測試與縮圖用
  window.__eq = {
    S: S, Q: Q, E: E, setMode: setMode, locate: doLocate, draw: requestDraw, view3: function () { return view3; },
    // 地圖座標（km）→ 畫布上的像素（測試時用來「點」地圖）；第 i 站紀錄上時刻 t 的像素、游標目前的時刻
    mapPx: function (x, y) { return { x: MX(x), y: MY(y) }; },
    trPx: function (i, t) { const R = trRow(i); return { x: tToX(t), y: R.y + R.h / 2 }; },
    curT: function (i, which) { return cursorT(activeStations()[i], which); }
  };
})();
