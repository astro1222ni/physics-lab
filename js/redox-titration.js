/* redox-titration.js — 「氧化還原滴定（過錳酸鉀）」的畫面與互動（化學計算全部在 redox-titration-core.js） */
(function () {
  'use strict';
  const K = window.RedoxCore;
  const LD = window.LabDraw;
  if (!K || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FF = LD.FONT;
  const reduced = LD.reducedMotion();

  // ---------- 固定的數值 ----------
  const U = K.UNITS_PER_ML;       // 體積一律記成「半滴」的整數倍：1 單位 = 0.025 mL，一滴 = 2 單位
  const DROP = 2, HALF = 1;
  const VT_MAX = 290;             // 錐形瓶最多裝到 290 mL
  const STREAM_RATE = 0.6;        // 流速超過 0.6 mL/s 時，液滴連成細流
  const G_PX = 9800;              // 液滴下落的重力加速度（畫面上每秒平方 px）
  const STIR_W = 2 * Math.PI * 2; // 攪拌子每秒 2 轉（畫面效果）
  const FF_SPEED = 20;            // 快轉等待：時間快 20 倍
  const HOLD = 30;                // 粉紅色維持 30 秒算終點
  const VIS = 1.6;                // 畫面上的顏色加強（穿透率取 1.6 次方，淡粉紅色在螢幕上才看得出來；不影響任何計算）

  // ======================= 格式 =======================
  function vRead(units) { return (Math.round(units * 2.5) / 100).toFixed(2); }
  function num(x, d) { const s = Math.abs(x).toFixed(d); return (x < 0 && +s !== 0 ? '−' : '') + s; }
  function signed(x, d) {
    const s = Math.abs(x).toFixed(d);
    if (+s === 0) return '±' + s;
    return (x > 0 ? '+' : '−') + s;
  }
  function fE(E) { return E == null || !isFinite(E) ? '—' : E.toFixed(3); }
  /** 濃度：三位有效數字 */
  function conc(c) {
    if (!(c > 0) || !isFinite(c)) return '—';
    const d = Math.max(0, Math.min(6, 2 - Math.floor(Math.log10(c) + 1e-9)));
    return c.toFixed(d);
  }
  function roundSig(v, n) {
    if (!(v > 0)) return v;
    const p = Math.pow(10, n - 1 - Math.floor(Math.log10(v)));
    return Math.round(v * p) / p;
  }
  function sigf(x, sig) {
    if (x == null || !isFinite(x)) return '—';
    if (x === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(x)));
    return num(x, Math.max(0, Math.min(8, (sig || 3) - 1 - e)));
  }
  /** 科學記號：{ m 尾數字串, e 次方（null = 不用科學記號） } */
  function sciParts(x, sig) {
    if (x == null || !isFinite(x) || x === 0) return { m: x === 0 ? '0' : '—', e: null };
    const e = Math.floor(Math.log10(Math.abs(x)));
    if (e >= -2 && e < 4) return { m: sigf(x, sig), e: null };
    const m = x / Math.pow(10, e);
    if (Math.abs(+m.toFixed((sig || 3) - 1)) >= 10) return sciParts(Math.sign(x) * Math.pow(10, e + 1), sig);
    return { m: num(m, (sig || 3) - 1), e: e };
  }
  function sciHTML(x, sig) { const p = sciParts(x, sig); return p.e == null ? p.m : p.m + ' × 10<sup>' + num(p.e, 0) + '</sup>'; }

  // ======================= 名稱 =======================
  const SYS = {
    fe: { name: ['亞鐵離子', 'iron(II)'], f: 'Fe^2+' },
    ox: { name: ['草酸', 'oxalic acid'], f: 'H2C2O4' },
    std: { name: ['草酸（標定用）', 'oxalic acid (standard)'], f: 'H2C2O4' },
    mx: { name: ['未知亞鐵', 'unknown iron(II)'], f: 'Fe^2+' }
  };
  const isFe = function (sys) { return K.isFe(sys); };
  const mysteryHidden = function () { const s = state.run.p.sys; return (s === 'std' || s === 'mx') && !state.S.sample.revealed; };

  // ======================= 狀態 =======================
  const state = {
    S: K.createSession(), sys: 'fe', Ca: 0.1, mass: 0.1576, Va: 25, Vacid: 10, Cb: 0.02, T: 25, rate: 0.5,
    meter: true, theory: false, deriv: false, tap: false, ff: false, acc: 0, cock: 0, stir: 0,
    drops: [], plumes: [], ripples: [], bubbles: [], flash: 0, flashCol: null, tag: null, pendingSettle: false, streamSnd: 0
  };
  Object.defineProperty(state, 'run', { get: function () { return state.S.run; } });
  // 先放一瓶預設的溶液（後面讀完滑桿再換成正式的一瓶），載入時的事件處理才有東西可讀
  K.newRun(state.S, { sys: 'fe', Ca: 0.1, Va: 25, Vacid: 10, Cb: 0.02, T: 25, mass: 0.1576, meter: true }, false);

  // ======================= 色彩 =======================
  let C = {};
  function readColors() {
    LD.refresh();
    C = Object.assign({}, LD.c);
    const cs = getComputedStyle(document.documentElement);
    C.chem = cs.getPropertyValue('--b-acidbase').trim() || C.pos;
    C.unknown = cs.getPropertyValue('--b-matter').trim() || C.chem;
    C.dark = LD.dark;
    C.bench = C.dark ? LD.mix(C.surface, C.text, 0.07) : LD.mix(C.surface, C.muted, 0.15);
    C.metal = C.dark ? LD.mix(C.muted, C.text, 0.3) : LD.mix(C.muted, C.surface, 0.3);
    C.metalDark = LD.shade(C.metal, -0.35);
    C.iron = C.dark ? LD.mix(C.surface, C.text, 0.2) : LD.mix(C.text, C.surface, 0.22);
    C.housing = C.dark ? LD.mix(C.surface, C.text, 0.14) : LD.mix(C.surface, C.muted, 0.09);
    C.ceramic = C.dark ? LD.mix(C.surface, C.text, 0.32) : LD.mix(C.surface, C.text, 0.14);
    C.glassEdge = C.dark ? LD.alpha(C.text, 0.5) : LD.alpha(C.field, 0.5);
    C.glassTint = C.dark ? LD.alpha(C.text, 0.06) : LD.alpha(C.neg, 0.05);
    // 白光穿過溶液（錐形瓶下墊白紙）看到的底色；溶液的顏色 = 底色 × 穿透率
    C.water = C.dark ? LD.mix(C.text, C.neg, 0.06) : LD.mix(C.surface, C.neg, 0.04);
    C.paper = C.dark ? LD.mix(C.text, C.surface, 0.14) : C.surface;
    C.ptfe = C.dark ? LD.mix(C.text, C.surface, 0.06) : LD.mix(C.surface, C.muted, 0.1);
    C.lcd = C.dark ? LD.shade(C['canvas-bg'], -0.4) : LD.shade(C.field, -0.55);
    C.lcdInk = C.dark ? C.probe : LD.shade(C.probe, 0.35);
    C.platinum = C.dark ? LD.mix(C.text, C.muted, 0.35) : LD.mix(C.muted, C.surface, 0.45);
    C.glow = C.pos;
    C.sys = { fe: C.neg, ox: C.pos, std: C.probe, mx: C.unknown };
  }
  const rgbStr = function (c, a) { return a == null ? 'rgb(' + c.join(',') + ')' : 'rgba(' + c.join(',') + ',' + a + ')'; };
  function tint(T3) {
    const w = LD.rgb(C.water);
    return [0, 1, 2].map(function (i) { return Math.round(w[i] * Math.pow(T3[i], VIS)); });
  }
  /** 滴定管裡的 KMnO4（顏色很深）；cm 是看穿的厚度 */
  function titrantRGB(cm) { return tint(K.mnO4Transmit(state.run.p.Cb, cm)); }
  /** 錐形瓶中溶液的顏色：核心的吸光度（比爾定律）；畫面上只把 MnO4- 的部分加強 1.6 倍（淡粉紅才看得出來），
   *  MnO2 是懸浮的顆粒，顏色用飽和的濃度（看起來是棕色，不會變成黑色）。其他物種照原值。 */
  function flaskRGB(f) {
    const V = K.vTot(f), A = K.absorbance(f), cM = f.nMnO4 / V, c2 = f.nMnO2 / V, c2v = c2 / (1 + c2 / 1e-3);
    const w = LD.rgb(C.water);
    return [0, 1, 2].map(function (i) {
      const a = A[i] + (VIS - 1) * K.ABS.MnO4[i] * cM * K.PATH_CM - K.ABS.MnO2[i] * (c2 - c2v) * K.PATH_CM;
      return Math.round(w[i] * Math.pow(10, -Math.min(6, Math.max(0, a))));
    });
  }
  function brownRGB() { return tint(K.ABS.MnO2.map(function (a) { return Math.pow(10, -a * 0.004); })); }

  // ======================= 錐形瓶的形狀（真實 250 mL 錐形瓶） =======================
  const FL = { Rb: 4.25, Rn: 1.7, Hc: 10.5, Hn: 3.0, px: 12, k: 0.2 };
  function volAt(y) {
    if (y <= FL.Hc) { const r = FL.Rb - (FL.Rb - FL.Rn) * y / FL.Hc; return Math.PI / 3 * y * (FL.Rb * FL.Rb + FL.Rb * r + r * r); }
    return volAt(FL.Hc) + Math.PI * FL.Rn * FL.Rn * (y - FL.Hc);
  }
  const hCache = new Map();
  function hPx(V) {
    const key = Math.round(V * 40);
    let h = hCache.get(key);
    if (h == null) {
      let lo = 0, hi = FL.Hc + FL.Hn;
      for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (volAt(m) < V) lo = m; else hi = m; }
      h = (lo + hi) / 2 * FL.px;
      if (hCache.size > 4000) hCache.clear();
      hCache.set(key, h);
    }
    return h;
  }
  function rAt(h) {
    const Hc = FL.Hc * FL.px;
    return h <= Hc ? (FL.Rb - (FL.Rb - FL.Rn) * h / Hc) * FL.px : FL.Rn * FL.px;
  }

  // ======================= 版面（設計座標，依寬度等比縮放；文字不縮放） =======================
  const LAY = {
    wide: { W: 820, H: 524, rod: 280, base: [254, 528], xb: 388, stirHalf: 82,
      mag: [166, 156, 76], meter: [586, 384, 742, 494], post: 598, bottle: [520, 430, 574, 494], strip: 1 },
    narrow: { W: 370, H: 540, rod: 118, base: [100, 290], xb: 200, stirHalf: 66,
      mag: [60, 116, 52], meter: [294, 410, 366, 494], post: 304, bottle: [262, 440, 294, 494], strip: 2 }
  };
  const VY = { top: 16, y0: 40, y50: 240, tubeEnd: 250, cock: 262, tip: 298, by: 436, stirTop: 446, plate: 480, bench: 494, clamp: 108, arm: 178 };
  const MLPX = (VY.y50 - VY.y0) / 50;

  const cv = $('cv'), ctx = cv.getContext('2d');
  const stat = document.createElement('canvas'), sctx = stat.getContext('2d');
  const front = document.createElement('canvas'), fctx = front.getContext('2d');
  let L = null;

  function resizeBench() {
    const W = cv.clientWidth;
    if (!W) return;
    const D = W >= 600 ? LAY.wide : LAY.narrow;
    const s = W / D.W, H = Math.round(D.H * s);
    if (cv.style.height !== H + 'px') cv.style.height = H + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    [cv, stat, front].forEach(function (c) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
    L = Object.assign({}, D, { s: s, Wpx: W, Hpx: H, dpr: dpr, wide: D === LAY.wide });
    buildStatic();
  }

  function flaskDims() {
    const cx = L.xb, by = VY.by, Rb = FL.Rb * FL.px, Rn = FL.Rn * FL.px, Hc = FL.Hc * FL.px, Hn = FL.Hn * FL.px;
    return { cx: cx, by: by, Rb: Rb, Rn: Rn, Hc: Hc, Hn: Hn, ys: by - Hc, yn: by - Hc - Hn, k: FL.k };
  }
  function flaskOutline(g, F) {
    g.beginPath();
    g.moveTo(F.cx - F.Rb, F.by);
    g.lineTo(F.cx - F.Rn - 2.5, F.ys + 6);
    g.quadraticCurveTo(F.cx - F.Rn, F.ys + 1, F.cx - F.Rn, F.ys - 5);
    g.lineTo(F.cx - F.Rn, F.yn + 3);
    g.quadraticCurveTo(F.cx - F.Rn, F.yn, F.cx - F.Rn - 3, F.yn);
    g.lineTo(F.cx + F.Rn + 3, F.yn);
    g.quadraticCurveTo(F.cx + F.Rn, F.yn, F.cx + F.Rn, F.yn + 3);
    g.lineTo(F.cx + F.Rn, F.ys - 5);
    g.quadraticCurveTo(F.cx + F.Rn, F.ys + 1, F.cx + F.Rn + 2.5, F.ys + 6);
    g.lineTo(F.cx + F.Rb, F.by);
    g.ellipse(F.cx, F.by, F.Rb, F.k * F.Rb, 0, 0, Math.PI, false);
    g.closePath();
  }
  /** 加熱板的發熱程度（0–1）：30 °C 以上才看得出來 */
  function heat() { return Math.max(0, Math.min(1, (state.run.p.T - 30) / 65)); }

  // ======================= 靜態圖層 =======================
  function buildStatic() {
    const g = sctx, s = L.s;
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    LD.backdrop(g, L.Wpx, L.Hpx);
    g.setTransform(L.dpr * s, 0, 0, L.dpr * s, 0, 0);
    const W = L.W, H = L.H;
    // 實驗桌
    const bg = g.createLinearGradient(0, VY.bench, 0, H);
    bg.addColorStop(0, LD.shade(C.bench, C.dark ? 0.06 : 0.04));
    bg.addColorStop(1, LD.shade(C.bench, C.dark ? -0.25 : -0.1));
    g.fillStyle = bg; g.fillRect(0, VY.bench, W, H - VY.bench);
    g.fillStyle = LD.alpha(LD.shade(C.bench, 0.5), 0.6); g.fillRect(0, VY.bench, W, 1);
    const sh = g.createLinearGradient(0, VY.bench - 14, 0, VY.bench);
    sh.addColorStop(0, LD.shadowInk(0)); sh.addColorStop(1, LD.shadowInk(C.dark ? 0.18 : 0.06));
    g.fillStyle = sh; g.fillRect(0, VY.bench - 14, W, 14);

    // 鐵架
    LD.contactShadow(g, (L.base[0] + L.base[1]) / 2, VY.bench, (L.base[1] - L.base[0]) / 2, 0);
    LD.block(g, L.base[0], VY.plate, L.base[1] - L.base[0], VY.bench - VY.plate, C.iron, { r: 3 });
    LD.tube(g, function (c) { c.moveTo(L.rod, VY.plate); c.lineTo(L.rod, 22); }, C.metal, 9);
    LD.ball(g, L.rod, 21, 5, C.metal, { shadow: false, glow: 0 });
    LD.tube(g, function (c) { c.moveTo(L.rod + 6, VY.clamp); c.lineTo(L.xb - 13, VY.clamp); }, C.metal, 5);
    LD.block(g, L.rod - 9, VY.clamp - 9, 18, 18, C.metalDark, { r: 3 });
    LD.ball(g, L.rod - 13, VY.clamp, 4.5, C.metalDark, { shadow: false, glow: 0 });

    // 加熱磁石攪拌器：機身、陶瓷加熱面（發熱時透出橘紅色）
    const sx0 = L.xb - L.stirHalf, sx1 = L.xb + L.stirHalf, ht = heat();
    LD.block(g, sx0, VY.stirTop + 3, sx1 - sx0, VY.plate - VY.stirTop - 3, C.housing, { r: 6 });
    const top = ht > 0 ? LD.mix(C.ceramic, C.glow, 0.15 + 0.5 * ht) : C.ceramic;
    LD.block(g, sx0 + 3, VY.stirTop - 2, sx1 - sx0 - 6, 7, top, { r: 2, shadow: false });
    if (ht > 0) {
      const gl = g.createRadialGradient(L.xb, VY.stirTop, 4, L.xb, VY.stirTop, L.stirHalf * 1.2);
      gl.addColorStop(0, LD.alpha(C.glow, 0.28 * ht)); gl.addColorStop(1, LD.alpha(C.glow, 0));
      g.fillStyle = gl; g.fillRect(sx0 - 20, VY.stirTop - 40, sx1 - sx0 + 40, 48);
    }
    // 兩個旋鈕：左「加熱」、右「攪拌」；中間是溫度顯示窗
    [sx0 + 18, sx1 - 18].forEach(function (x, i) {
      LD.ball(g, x, VY.plate - 14, 7, LD.mix(C.housing, i ? C.text : C.glow, i ? 0.35 : 0.45), { shadow: false, glow: 0 });
      g.strokeStyle = LD.alpha(C.text, 0.35); g.lineWidth = 1;
      g.beginPath(); g.arc(x, VY.plate - 14, 10.5, Math.PI * 0.8, Math.PI * 2.2); g.stroke();
    });
    const tw = L.wide ? 52 : 40;
    LD.roundRect(g, L.xb - tw / 2, VY.plate - 24, tw, 17, 3);
    g.fillStyle = C.lcd; g.fill();
    LD.ball(g, sx0 + 34, VY.plate - 26, 2.4, ht > 0 ? C.glow : LD.mix(C.housing, C.text, 0.3), { shadow: false, glow: ht > 0 ? 0.7 : 0 });

    // 錐形瓶：瓶後的玻璃
    const F = flaskDims();
    LD.contactShadow(g, F.cx, VY.stirTop - 2, F.Rb, 0);
    flaskOutline(g, F);
    const fg = g.createLinearGradient(F.cx - F.Rb, 0, F.cx + F.Rb, 0);
    fg.addColorStop(0, LD.alpha(C.text, C.dark ? 0.06 : 0.035));
    fg.addColorStop(0.5, C.glassTint);
    fg.addColorStop(1, LD.alpha(C.text, C.dark ? 0.08 : 0.05));
    g.fillStyle = fg; g.fill();
    g.strokeStyle = LD.alpha(C.text, C.dark ? 0.16 : 0.12); g.lineWidth = 1;
    g.beginPath(); g.ellipse(F.cx, F.by, F.Rb - 1, F.k * (F.Rb - 1), 0, Math.PI, Math.PI * 2, false); g.stroke();

    // 滴定管的玻璃管（後面）
    const xb = L.xb;
    const tg = g.createLinearGradient(xb - 10, 0, xb + 10, 0);
    tg.addColorStop(0, LD.alpha(C.text, C.dark ? 0.12 : 0.08));
    tg.addColorStop(0.5, C.glassTint);
    tg.addColorStop(1, LD.alpha(C.text, C.dark ? 0.14 : 0.1));
    g.fillStyle = tg;
    g.beginPath(); g.moveTo(xb - 12, VY.top); g.lineTo(xb - 10, VY.top + 5); g.lineTo(xb - 10, VY.tubeEnd); g.lineTo(xb + 10, VY.tubeEnd); g.lineTo(xb + 10, VY.top + 5); g.lineTo(xb + 12, VY.top); g.closePath(); g.fill();

    // 電位計本體、電極支架的立柱、蒸餾水燒杯（電極不用時泡在裡面）
    const M = L.meter;
    LD.contactShadow(g, (M[0] + M[2]) / 2, VY.bench, (M[2] - M[0]) / 2, 0);
    LD.block(g, M[0], M[1], M[2] - M[0], M[3] - M[1], C.housing, { r: 8 });
    const lc = lcdRect();
    LD.roundRect(g, lc.x - 4, lc.y - 4, lc.w + 8, lc.h + 8, 5);
    g.fillStyle = LD.mix(C.housing, C.text, C.dark ? 0.25 : 0.4); g.fill();
    const bw = (M[2] - M[0] - 24) / 3, byy = lc.y + lc.h + (L.wide ? 14 : 9), bh = L.wide ? 14 : 10;
    for (let i = 0; i < 3; i++) LD.block(g, M[0] + 8 + i * (bw + 4), byy, bw, bh, LD.mix(C.housing, i === 2 ? C.accent : C.text, C.dark ? 0.3 : 0.18), { r: 3, shadow: false });
    LD.tube(g, function (c) { c.moveTo(L.post, M[1] + 2); c.lineTo(L.post, VY.arm - 4); }, C.metal, 7);
    LD.block(g, L.post - 7, M[1] - 4, 14, 8, C.metalDark, { r: 2, shadow: false });
    const b = L.bottle;
    LD.contactShadow(g, (b[0] + b[2]) / 2, b[3], (b[2] - b[0]) / 2, 0);
    g.fillStyle = LD.alpha(C.text, C.dark ? 0.08 : 0.05);
    LD.roundRect(g, b[0], b[1], b[2] - b[0], b[3] - b[1], 3); g.fill();
    g.fillStyle = LD.alpha(C.neg, C.dark ? 0.14 : 0.08);
    LD.roundRect(g, b[0] + 2, b[1] + (b[3] - b[1]) * 0.4, b[2] - b[0] - 4, (b[3] - b[1]) * 0.6 - 2, 2); g.fill();
    // 放大鏡的把手與陰影
    const mx = L.mag[0], my = L.mag[1], R = L.mag[2];
    LD.tube(g, function (c) { c.moveTo(mx - (R + 4) * 0.707, my + (R + 4) * 0.707); c.lineTo(mx - (R + 4 + R * 0.5) * 0.707, my + (R + 4 + R * 0.5) * 0.707); }, C.iron, Math.max(7, R * 0.13));
    g.save();
    g.shadowColor = LD.shadowInk(C.dark ? 0.5 : 0.25); g.shadowBlur = 10; g.shadowOffsetY = 3;
    g.fillStyle = C['canvas-bg'];
    g.beginPath(); g.arc(mx, my, R + 3, 0, Math.PI * 2); g.fill();
    g.restore();
    buildFront();
  }

  /** 前景靜態圖層：滴定管玻璃與刻度、活栓座、管夾、錐形瓶前面的玻璃與刻度、燒杯、數字 */
  function buildFront() {
    const g = fctx, s = L.s;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, front.width, front.height);
    g.setTransform(L.dpr * s, 0, 0, L.dpr * s, 0, 0);
    drawBuretteGlass(g);
    drawFlaskFront(g);
    drawBeakerFront(g);
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    for (let i = 0; i <= 50; i += 5) {
      LD.haloText(g, String(i), (L.xb - 12) * s, (VY.y0 + i * MLPX) * s, LD.alpha(C.text, 0.85), 'right', 'middle', (i % 10 ? '' : '600 ') + '10px ' + FF);
    }
    const F = flaskDims();
    [100, 200].forEach(function (V) {
      const h = hPx(V), rr = rAt(h), y = F.by - h + F.k * rr * Math.sin(Math.PI * 0.62);
      LD.haloText(g, String(V), (F.cx + rr * Math.cos(Math.PI * 0.62) + 3) * s, (y + 1) * s, LD.alpha(C.text, 0.6), 'left', 'middle', '9px ' + FF);
    });
  }

  // ======================= 每一幀的畫面 =======================
  function lcdRect() {
    const M = L.meter, m = L.wide ? 16 : 8;
    return { x: M[0] + m, y: M[1] + (L.wide ? 16 : 10), w: M[2] - M[0] - 2 * m, h: L.wide ? 40 : 26 };
  }
  function electrodeGeom() {
    const len = VY.by - 3 - (VY.arm + 10);
    if (state.meter) return { x0: L.xb + 17, y0: VY.arm + 10, x1: L.xb + 13, y1: VY.by - 3, inFlask: true, armY: VY.arm };
    const b = L.bottle, x = (b[0] + b[2]) / 2, y1 = b[3] - 5;
    return { x0: x, y0: y1 - len, x1: x, y1: y1, inFlask: false, armY: y1 - len - 10 };
  }
  function vtLanded() { const r = state.run; return r.p.Va + r.p.Vacid + r.u / U; }
  function surfaceY() { return VY.by - hPx(vtLanded()); }

  function drawArmAndCable(g) {
    const e = electrodeGeom(), M = L.meter;
    const jx = M[0] + 12, jy = M[1] + 4;
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = LD.shade(C.iron, -0.2); g.lineWidth = 3.2;
    g.beginPath(); g.moveTo(e.x0, e.y0 - 26);
    g.bezierCurveTo(e.x0, e.y0 - 70, jx - 30, jy - 120, jx, jy);
    g.stroke();
    g.strokeStyle = LD.alpha(LD.shade(C.iron, 0.5), 0.5); g.lineWidth = 1;
    g.beginPath(); g.moveTo(e.x0 - 0.8, e.y0 - 26);
    g.bezierCurveTo(e.x0 - 0.8, e.y0 - 70, jx - 31, jy - 121, jx - 0.8, jy);
    g.stroke();
    g.restore();
    LD.tube(g, function (c) { c.moveTo(L.post, e.armY); c.lineTo(e.x0 + 7, e.armY); }, C.metal, 5);
    LD.ball(g, L.post, e.armY, 5, C.metalDark, { shadow: false, glow: 0 });
  }

  /** 鉑複合電極：玻璃管身、內部的導線、尖端的鉑片 */
  function drawElectrode(g, e) {
    const ang = Math.atan2(e.x1 - e.x0, e.y1 - e.y0), len = Math.hypot(e.x1 - e.x0, e.y1 - e.y0);
    g.save();
    g.translate(e.x0, e.y0);
    g.rotate(-ang);
    const gg = g.createLinearGradient(-3.4, 0, 3.4, 0);
    gg.addColorStop(0, LD.alpha(C.text, C.dark ? 0.35 : 0.28));
    gg.addColorStop(0.35, LD.alpha(C.surface, 0.55));
    gg.addColorStop(1, LD.alpha(C.text, C.dark ? 0.4 : 0.32));
    g.fillStyle = gg;
    LD.roundRect(g, -3.3, 0, 6.6, len - 9, 2); g.fill();
    g.strokeStyle = C.glassEdge; g.lineWidth = 0.7; g.stroke();
    g.strokeStyle = LD.alpha(C.platinum, 0.9); g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(0, 2); g.lineTo(0, len - 6); g.stroke();
    // 鉑片
    const pg = g.createLinearGradient(-3, 0, 3, 0);
    pg.addColorStop(0, LD.shade(C.platinum, -0.25)); pg.addColorStop(0.45, LD.mix(C.platinum, C.surface, 0.6)); pg.addColorStop(1, LD.shade(C.platinum, -0.3));
    g.fillStyle = pg;
    g.fillRect(-2.6, len - 8, 5.2, 7);
    g.strokeStyle = LD.alpha(C.text, 0.4); g.lineWidth = 0.5; g.strokeRect(-2.6, len - 8, 5.2, 7);
    LD.block(g, -4.6, -26, 9.2, 26, C.iron, { r: 2.5, shadow: false });
    g.fillStyle = LD.alpha(C.platinum, 0.95); g.fillRect(-4.6, -9, 9.2, 2.5);
    g.restore();
    LD.block(g, e.x0 - 7, e.armY - 5, 14, 10, C.metalDark, { r: 2, shadow: false });
  }

  function drawBuretteLiquid(g) {
    const r = state.run, xb = L.xb, ym = VY.y0 + r.fill / U * MLPX;
    if (r.fill >= K.BURETTE_UNITS) return drawTipLiquid(g, false);
    const col = titrantRGB(0.05);
    const lg = g.createLinearGradient(xb - 7.5, 0, xb + 7.5, 0);
    lg.addColorStop(0, rgbStr(LD.rgb(LD.shade(rgbStr(col), -0.3)), 0.95));
    lg.addColorStop(0.4, rgbStr(col, 0.93));
    lg.addColorStop(1, rgbStr(LD.rgb(LD.shade(rgbStr(col), -0.4)), 0.95));
    g.fillStyle = lg;
    // KMnO4 太深，看不到彎月面的最低點：液面在管壁處的上緣就是讀數的位置
    g.beginPath();
    g.moveTo(xb - 7.5, ym);
    g.quadraticCurveTo(xb, ym + 4.4, xb + 7.5, ym);
    g.lineTo(xb + 7.5, VY.tubeEnd + 2); g.lineTo(xb + 3, VY.cock - 6); g.lineTo(xb + 3, VY.cock + 8);
    g.lineTo(xb + 1.4, VY.tip - 1); g.lineTo(xb - 1.4, VY.tip - 1); g.lineTo(xb - 3, VY.cock + 8); g.lineTo(xb - 3, VY.cock - 6);
    g.lineTo(xb - 7.5, VY.tubeEnd + 2);
    g.closePath(); g.fill();
    g.strokeStyle = LD.alpha(C.surface, C.dark ? 0.35 : 0.6); g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(xb - 7.5, ym + 0.4); g.quadraticCurveTo(xb, ym + 4.8, xb + 7.5, ym + 0.4); g.stroke();
    // 管壁的反光條（液體前面）
    g.fillStyle = LD.alpha(C.surface, C.dark ? 0.18 : 0.35); g.fillRect(xb - 6, ym + 3, 1.4, VY.tubeEnd - ym - 4);
  }
  function drawTipLiquid(g) {
    // 流空了：管中只剩管壁的一點紫色
    const xb = L.xb;
    g.fillStyle = rgbStr(titrantRGB(0.006), 0.35);
    g.fillRect(xb - 7.5, VY.y0, 15, VY.tubeEnd - VY.y0);
  }

  function drawBuretteGlass(g) {
    const xb = L.xb;
    g.strokeStyle = C.glassEdge; g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(xb - 12, VY.top); g.lineTo(xb - 10, VY.top + 5); g.lineTo(xb - 10, VY.tubeEnd); g.quadraticCurveTo(xb - 10, VY.cock - 8, xb - 4.5, VY.cock - 7);
    g.moveTo(xb + 12, VY.top); g.lineTo(xb + 10, VY.top + 5); g.lineTo(xb + 10, VY.tubeEnd); g.quadraticCurveTo(xb + 10, VY.cock - 8, xb + 4.5, VY.cock - 7);
    g.stroke();
    g.fillStyle = LD.alpha(C.surface, C.dark ? 0.25 : 0.7); g.fillRect(xb - 7.5, VY.top + 6, 1.8, VY.tubeEnd - VY.top - 10);
    g.fillStyle = LD.alpha(C.surface, C.dark ? 0.12 : 0.35); g.fillRect(xb + 5, VY.top + 6, 1, VY.tubeEnd - VY.top - 10);
    g.strokeStyle = LD.alpha(C.text, C.dark ? 0.75 : 0.7);
    g.beginPath();
    for (let i = 0; i <= 50; i++) {
      const y = VY.y0 + i * MLPX, len = i % 10 === 0 ? 11 : i % 5 === 0 ? 8 : 4.5;
      g.moveTo(xb - 9, y); g.lineTo(xb - 9 + len, y);
    }
    g.lineWidth = 0.7; g.stroke();
    g.fillStyle = LD.alpha(C.text, C.dark ? 0.12 : 0.07);
    g.beginPath(); g.moveTo(xb - 4, VY.cock + 7); g.lineTo(xb - 1.8, VY.tip); g.lineTo(xb + 1.8, VY.tip); g.lineTo(xb + 4, VY.cock + 7); g.closePath(); g.fill();
    g.strokeStyle = C.glassEdge; g.lineWidth = 0.9; g.stroke();
    // 玻璃活栓的座（酸式滴定管：KMnO4 會氧化橡皮管）
    LD.roundRect(g, xb - 11, VY.cock - 7, 22, 14, 6);
    const cg = g.createLinearGradient(0, VY.cock - 7, 0, VY.cock + 7);
    cg.addColorStop(0, LD.alpha(C.surface, 0.6)); cg.addColorStop(1, LD.alpha(C.text, C.dark ? 0.25 : 0.18));
    g.fillStyle = cg; g.fill();
    g.strokeStyle = C.glassEdge; g.lineWidth = 1; g.stroke();
    LD.block(g, xb - 15, VY.clamp - 9, 6, 18, C.iron, { r: 2, shadow: false });
    LD.block(g, xb + 9, VY.clamp - 9, 6, 18, C.iron, { r: 2, shadow: false });
  }
  function drawCockHandle(g) {
    const xb = L.xb;
    g.save();
    g.translate(xb, VY.cock); g.rotate(-state.cock * Math.PI / 2);
    LD.block(g, 2, -3.2, 20, 6.4, C.ptfe, { r: 3, shadow: false, stroke: LD.alpha(C.text, 0.35) });
    g.restore();
    LD.ball(g, xb, VY.cock, 4.6, C.ptfe, { shadow: false, glow: 0, ring: LD.alpha(C.text, 0.4) });
  }

  function dropRadius(n) { return n >= DROP ? 2.7 : 2.15; }

  function drawHangingAndDrops(g) {
    const xb = L.xb, ys = surfaceY(), col = rgbStr(titrantRGB(0.02));
    if (state.tap && state.rate > STREAM_RATE && !reduced) {
      const w = 0.9 + 1.3 * (state.rate - STREAM_RATE) / (2 - STREAM_RATE), t = performance.now() / 1000;
      g.save(); g.lineCap = 'round';
      g.strokeStyle = col; g.lineWidth = w;
      g.beginPath(); g.moveTo(xb, VY.tip);
      for (let y = VY.tip; y <= ys; y += 6) g.lineTo(xb + 0.5 * Math.sin(y * 0.35 - t * 20) * (y - VY.tip) / 60, y);
      g.lineTo(xb, ys); g.stroke();
      g.strokeStyle = LD.alpha(C.surface, 0.5); g.lineWidth = Math.max(0.4, w * 0.3);
      g.beginPath(); g.moveTo(xb - w * 0.2, VY.tip + 2); g.lineTo(xb - w * 0.2, ys - 2); g.stroke();
      g.restore();
    } else if (state.tap) {
      const rr = Math.round(dropRadius(DROP) * Math.cbrt(Math.max(0.05, Math.min(1, state.acc / DROP))) * 4) / 4;
      LD.ball(g, xb, VY.tip + rr * 0.85, rr, col, { shadow: false, glow: 0 });
    }
    state.drops.forEach(function (d) {
      const R = dropRadius(d.n);
      if (d.phase === 'grow') {
        const rr = Math.round(R * Math.cbrt(Math.max(0.08, d.t / d.growT)) * 4) / 4;
        LD.ball(g, xb, VY.tip + rr * 0.85, rr, col, { shadow: false, glow: 0 });
      } else if (!(state.tap && state.rate > STREAM_RATE)) {
        LD.ball(g, xb, d.y, R, col, { shadow: false, glow: 0 });
      }
    });
  }

  // MnO2 顆粒的位置（固定的亂數，跟著攪拌轉）
  const SPECKS = [];
  (function () { let s = 11; const rnd = function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; for (let i = 0; i < 70; i++) SPECKS.push({ r: Math.sqrt(rnd()), a: rnd() * Math.PI * 2, h: rnd(), z: 0.6 + rnd() * 0.9 }); })();

  function drawFlask(g) {
    const r = state.run, f = r.f, F = flaskDims(), Vt = vtLanded(), h = hPx(Vt), rs = rAt(h), ys = F.by - h;
    const col = flaskRGB(f), turb = K.transmit(f).turb;
    // ---- 液體的側面 ----
    g.save();
    g.beginPath();
    g.moveTo(F.cx - F.Rb + 1, F.by);
    g.ellipse(F.cx, F.by, F.Rb - 1, F.k * (F.Rb - 1), 0, Math.PI, 0, true);
    g.lineTo(F.cx + rs - 1, ys);
    g.ellipse(F.cx, ys, rs - 1, F.k * (rs - 1), 0, 0, Math.PI, false);
    g.closePath();
    const sg = g.createLinearGradient(F.cx - F.Rb, 0, F.cx + F.Rb, 0);
    sg.addColorStop(0, rgbStr(LD.rgb(LD.shade(rgbStr(col), -0.2)), 0.92));
    sg.addColorStop(0.45, rgbStr(col, 0.9));
    sg.addColorStop(1, rgbStr(LD.rgb(LD.shade(rgbStr(col), -0.28)), 0.92));
    g.fillStyle = sg; g.fill();
    // MnO2 混濁：散射使溶液變得不透明，並有棕色顆粒
    if (turb > 0.01) {
      g.clip();
      const br = brownRGB();
      g.fillStyle = rgbStr(br, 0.35 * turb); g.fillRect(F.cx - F.Rb, ys - 4, 2 * F.Rb, F.by - ys + 12);
      const n = Math.round(SPECKS.length * Math.min(1, 0.25 + turb));
      for (let i = 0; i < n; i++) {
        const q = SPECKS[i], a = q.a + state.stir * 0.12 * q.z;
        const yy = ys + 4 + q.h * (F.by - ys - 6);
        const rr = rAt(F.by - yy) - 3;
        const x = F.cx + q.r * rr * Math.cos(a);
        g.fillStyle = rgbStr(LD.rgb(LD.shade(rgbStr(br), -0.25)), 0.45 + 0.4 * turb);
        g.beginPath(); g.arc(x, yy + F.k * q.r * 6 * Math.sin(a), 0.7 + 0.6 * q.z, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();
    // ---- CO2 氣泡（草酸的反應）----
    state.bubbles.forEach(function (b) {
      const rr = rAt(F.by - b.y) - 4;
      const x = F.cx + b.x * rr;
      g.strokeStyle = LD.alpha(C.surface, 0.75); g.lineWidth = 0.7;
      g.beginPath(); g.arc(x, b.y, b.r, 0, Math.PI * 2); g.stroke();
      g.fillStyle = LD.alpha(C.surface, 0.25); g.fill();
    });
    // ---- 攪拌子 ----
    const th = state.stir, Lb = 13, hb = 4;
    const ex = Lb * Math.cos(th), ey = F.k * Lb * Math.sin(th);
    g.save(); g.lineCap = 'round';
    g.strokeStyle = LD.mix(C.ptfe, rgbStr(col), 0.35); g.lineWidth = 6;
    g.beginPath(); g.moveTo(F.cx - ex, F.by - hb - ey); g.lineTo(F.cx + ex, F.by - hb + ey); g.stroke();
    g.strokeStyle = LD.alpha(C.surface, 0.55); g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(F.cx - ex * 0.8, F.by - hb - 1.6 - ey * 0.8); g.lineTo(F.cx + ex * 0.8, F.by - hb - 1.6 + ey * 0.8); g.stroke();
    g.restore();
    // ---- 液面 ----
    const top = LD.mix(rgbStr(col), C.dark ? C.text : C.surface, 0.18);
    g.fillStyle = LD.alpha(top, 0.8);
    g.beginPath(); g.ellipse(F.cx, ys, rs - 1, F.k * (rs - 1), 0, 0, Math.PI * 2); g.fill();
    g.save();
    g.beginPath(); g.ellipse(F.cx, ys, rs - 1.5, F.k * (rs - 1.5), 0, 0, Math.PI * 2); g.clip();
    state.plumes.forEach(function (pl) {
      const u = pl.t / pl.life, fade = 1 - u;
      for (let j = 0; j < 5; j++) {
        const rad = (rs - 4) * Math.min(1, Math.pow(u, 0.55)) * (0.25 + 0.75 * j / 4);
        const ang = pl.a0 + state.stir * 0.35 - j * 0.6;
        const px = F.cx + rad * Math.cos(ang), py = ys + F.k * rad * Math.sin(ang);
        const bw = 5 + 9 * u + 2 * j;
        g.fillStyle = rgbStr(pl.rgb, 0.6 * fade * (1 - j * 0.12));
        g.beginPath(); g.ellipse(px, py, bw, bw * F.k * 1.4, 0, 0, Math.PI * 2); g.fill();
      }
    });
    const vr = Math.min(rs * 0.3, 13);
    g.fillStyle = LD.alpha(LD.shade(rgbStr(col), -0.35), 0.35);
    g.beginPath(); g.ellipse(F.cx, ys + 0.6, vr, vr * F.k * 0.9, 0, 0, Math.PI * 2); g.fill();
    if (!reduced) {
      g.strokeStyle = LD.alpha(C.surface, C.dark ? 0.2 : 0.45); g.lineWidth = 0.8;
      for (let j = 0; j < 2; j++) {
        const rr = rs * (0.45 + 0.25 * j), a0 = state.stir * 0.5 + j * Math.PI;
        g.beginPath(); g.ellipse(F.cx, ys, rr, rr * F.k, 0, a0, a0 + 1.1); g.stroke();
      }
    }
    if (state.flash > 0) {
      g.fillStyle = LD.alpha(state.flashCol || C.surface, 0.45 * state.flash);
      g.fillRect(F.cx - rs, ys - F.k * rs, 2 * rs, 2 * F.k * rs);
    }
    g.restore();
    state.ripples.forEach(function (rp) {
      const u = rp.t / 0.35, rr = 2 + 16 * u;
      g.strokeStyle = LD.alpha(C.surface, 0.7 * (1 - u)); g.lineWidth = 1.2 * (1 - u) + 0.3;
      g.beginPath(); g.ellipse(F.cx, ys, rr, rr * F.k, 0, 0, Math.PI * 2); g.stroke();
    });
    // ---- 電極（插在瓶中時）：液面以下的部分隔著液體看 ----
    const e = electrodeGeom();
    if (e.inFlask) {
      drawElectrode(g, e);
      g.save();
      g.beginPath(); g.rect(F.cx - F.Rb, ys + F.k * 6, 2 * F.Rb, F.by - ys + F.k * F.Rb); g.clip();
      g.strokeStyle = rgbStr(col, 0.5); g.lineWidth = 10; g.lineCap = 'round';
      g.beginPath(); g.moveTo(e.x0, e.y0); g.lineTo(e.x1, e.y1); g.stroke();
      g.restore();
    }
    // ---- 蒸氣（50 °C 以上）----
    if (!reduced && r.p.T >= 50) {
      const a = Math.min(1, (r.p.T - 45) / 40), t = performance.now() / 1000;
      g.save(); g.lineCap = 'round';
      for (let j = 0; j < 3; j++) {
        const ph = (t * 0.45 + j / 3) % 1, x0 = F.cx - 8 + j * 8;
        g.strokeStyle = LD.alpha(C.dark ? C.text : C.muted, 0.28 * a * Math.sin(Math.PI * ph));
        g.lineWidth = 2.2 + 3 * ph;
        g.beginPath();
        for (let k = 0; k <= 8; k++) {
          const y = F.yn - 4 - (ph * 46) - k * 3.2;
          const x = x0 + 4 * Math.sin(k * 0.9 + t * 2.2 + j * 2) * (0.3 + ph);
          if (k) g.lineTo(x, y); else g.moveTo(x, y);
        }
        g.stroke();
      }
      g.restore();
    }
  }

  function drawFlaskFront(g) {
    const F = flaskDims();
    flaskOutline(g, F);
    g.strokeStyle = C.glassEdge; g.lineWidth = 1.3; g.stroke();
    g.strokeStyle = C.glassEdge; g.lineWidth = 1;
    g.beginPath(); g.ellipse(F.cx, F.yn, F.Rn + 3, F.k * (F.Rn + 3), 0, 0, Math.PI * 2); g.stroke();
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = LD.alpha(C.surface, C.dark ? 0.28 : 0.75); g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(F.cx - F.Rb + 9, F.by - 8); g.lineTo(F.cx - F.Rn - 4, F.ys + 14); g.stroke();
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(F.cx - F.Rn + 3.5, F.ys - 6); g.lineTo(F.cx - F.Rn + 3.5, F.yn + 6); g.stroke();
    g.strokeStyle = LD.alpha(C.surface, C.dark ? 0.12 : 0.35); g.lineWidth = 1;
    g.beginPath(); g.moveTo(F.cx + F.Rb - 7, F.by - 6); g.lineTo(F.cx + F.Rn + 5, F.ys + 12); g.stroke();
    g.restore();
    g.strokeStyle = LD.alpha(C.text, C.dark ? 0.5 : 0.45); g.lineWidth = 0.8;
    [50, 100, 150, 200].forEach(function (V) {
      const h = hPx(V), r = rAt(h), y = F.by - h;
      g.beginPath();
      g.ellipse(F.cx, y, r, F.k * r, 0, Math.PI * 0.62, Math.PI * 0.8, false);
      g.stroke();
    });
  }
  function drawBeakerFront(g) {
    const b = L.bottle;
    LD.roundRect(g, b[0], b[1], b[2] - b[0], b[3] - b[1], 3);
    g.strokeStyle = C.glassEdge; g.lineWidth = 1; g.stroke();
    g.beginPath(); g.moveTo(b[0] - 2, b[1]); g.lineTo(b[0] + 3, b[1] + 1); g.stroke();   // 燒杯的嘴
    g.fillStyle = LD.alpha(C.surface, C.dark ? 0.15 : 0.5);
    g.fillRect(b[0] + 2.5, b[1] + 4, 1.5, b[3] - b[1] - 8);
  }

  // ---------- 七段顯示器 ----------
  const SEG = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '' };
  function seg7(g, ch, x, y, w, h, on, off) {
    const t = Math.max(1.2, w * 0.2), hh = h / 2;
    const P = {
      a: [x + t * 0.6, y, w - t * 1.2, t], d: [x + t * 0.6, y + h - t, w - t * 1.2, t], g: [x + t * 0.6, y + hh - t / 2, w - t * 1.2, t],
      f: [x, y + t * 0.6, t, hh - t * 0.9], b: [x + w - t, y + t * 0.6, t, hh - t * 0.9],
      e: [x, y + hh + t * 0.3, t, hh - t * 0.9], c: [x + w - t, y + hh + t * 0.3, t, hh - t * 0.9]
    };
    const lit = SEG[ch] || '';
    'abcdefg'.split('').forEach(function (k) {
      const r = P[k];
      g.fillStyle = lit.indexOf(k) >= 0 ? on : off;
      LD.roundRect(g, r[0], r[1], r[2], r[3], t * 0.45); g.fill();
    });
  }
  /** 電位計顯示的字串：「1.357」；電極不在瓶中或讀數不穩定時「-.---」 */
  function lcdText() {
    const E = state.run.E;
    if (!state.meter || E == null) return '-.---';
    return Math.max(-0.999, Math.min(1.999, E)).toFixed(3);
  }
  function drawLCD(g) {
    const lc = lcdRect();
    LD.roundRect(g, lc.x, lc.y, lc.w, lc.h, 3);
    const lg = g.createLinearGradient(0, lc.y, 0, lc.y + lc.h);
    lg.addColorStop(0, LD.shade(C.lcd, 0.06)); lg.addColorStop(1, C.lcd);
    g.fillStyle = lg; g.fill();
    const digits = lcdText().replace('.', '');
    g.font = '700 ' + (L.wide ? 11 : 9) + 'px ' + FF;
    const n = digits.length, pad = lc.w * 0.06, unitW = Math.max(lc.w * 0.14, (g.measureText('V').width + 6) / L.s);
    const cw = (lc.w - 2 * pad - unitW) / n, w = cw * 0.72, hgt = lc.h * 0.66, y = lc.y + (lc.h - hgt) / 2;
    const on = C.lcdInk, off = LD.alpha(C.lcdInk, 0.07);
    g.save();
    g.translate(lc.x + pad, 0);
    g.transform(1, 0, -0.08, 1, 0, 0);
    for (let i = 0; i < n; i++) seg7(g, digits[i], i * cw + (cw - w) / 2 + y * 0.08, y, w, hgt, on, off);
    g.fillStyle = on;
    g.beginPath(); g.arc(cw - cw * 0.08 + (y + hgt) * 0.08, y + hgt - 1, Math.max(1, w * 0.13), 0, Math.PI * 2); g.fill();
    g.restore();
  }

  // ---------- 放大鏡：滴定管液面的特寫（讀上緣） ----------
  function drawMagnifier(g) {
    const r = state.run, mx = L.mag[0], my = L.mag[1], R = L.mag[2];
    const vr = r.fill / U, ym = VY.y0 + vr * MLPX, xb = L.xb;
    g.strokeStyle = LD.alpha(C.accent, 0.75); g.lineWidth = 1;
    LD.roundRect(g, xb - 12, ym - 1.7 * MLPX, 24, 3.4 * MLPX, 3); g.stroke();
    const ang = Math.atan2(ym - my, xb - 12 - mx);
    g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(mx + (R + 3) * Math.cos(ang), my + (R + 3) * Math.sin(ang)); g.lineTo(xb - 12, ym); g.stroke();
    g.setLineDash([]);
    g.save();
    g.beginPath(); g.arc(mx, my, R - 1, 0, Math.PI * 2); g.clip();
    const zp = R / 1.7, tw = R * 0.5;
    const tg = g.createLinearGradient(mx - tw, 0, mx + tw, 0);
    tg.addColorStop(0, LD.alpha(C.text, C.dark ? 0.16 : 0.1)); tg.addColorStop(0.5, C.glassTint); tg.addColorStop(1, LD.alpha(C.text, C.dark ? 0.18 : 0.12));
    g.fillStyle = tg; g.fillRect(mx - tw, my - R, 2 * tw, 2 * R);
    if (r.fill < K.BURETTE_UNITS) {
      const md = R * 0.22, col = titrantRGB(0.05);
      const lg = g.createLinearGradient(mx - tw, 0, mx + tw, 0);
      lg.addColorStop(0, rgbStr(LD.rgb(LD.shade(rgbStr(col), -0.3)), 0.96)); lg.addColorStop(0.4, rgbStr(col, 0.95)); lg.addColorStop(1, rgbStr(LD.rgb(LD.shade(rgbStr(col), -0.4)), 0.96));
      g.fillStyle = lg;
      // 上緣（貼著管壁的地方）在視線上；中間凹下去的最低點被深色的溶液擋住看不到
      g.beginPath(); g.moveTo(mx - tw, my); g.quadraticCurveTo(mx, my + 2 * md, mx + tw, my); g.lineTo(mx + tw, my + R); g.lineTo(mx - tw, my + R); g.closePath(); g.fill();
      g.strokeStyle = LD.alpha(C.surface, C.dark ? 0.4 : 0.65); g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(mx - tw, my + 1.5); g.quadraticCurveTo(mx, my + 2 * md + 1.5, mx + tw, my + 1.5); g.stroke();
    }
    g.strokeStyle = LD.alpha(C.text, C.dark ? 0.85 : 0.8);
    g.font = '700 ' + Math.round(R * 0.17) + 'px ' + FF;
    g.textAlign = 'left'; g.textBaseline = 'middle';
    const i0 = Math.ceil((vr - 1.9) * 10), i1 = Math.floor((vr + 1.9) * 10);
    for (let i = Math.max(0, i0); i <= Math.min(500, i1); i++) {
      const y = my + (i / 10 - vr) * zp;
      const len = i % 10 === 0 ? tw * 1.25 : i % 5 === 0 ? tw * 0.8 : tw * 0.45;
      const onLiquid = y > my && r.fill < K.BURETTE_UNITS;
      g.strokeStyle = onLiquid ? LD.alpha(C.surface, 0.85) : LD.alpha(C.text, C.dark ? 0.85 : 0.8);
      g.lineWidth = i % 10 === 0 ? 1.4 : 1;
      g.beginPath(); g.moveTo(mx - tw, y); g.lineTo(mx - tw + len, y); g.stroke();
      if (i % 10 === 0) {
        g.fillStyle = onLiquid ? C.surface : LD.alpha(C.text, 0.9);
        g.fillText(String(i / 10), mx - tw + len + 3, y);
      }
    }
    g.fillStyle = LD.alpha(C.surface, C.dark ? 0.2 : 0.6); g.fillRect(mx - tw + 3, my - R, 2.5, 2 * R);
    // 視線（與液面上緣同高）
    g.strokeStyle = LD.alpha(C.accent, 0.9); g.lineWidth = 1.2; g.setLineDash([5, 4]);
    g.beginPath(); g.moveTo(mx - R, my); g.lineTo(mx + R, my); g.stroke();
    g.setLineDash([]);
    const lg2 = g.createRadialGradient(mx - R * 0.35, my - R * 0.4, R * 0.05, mx, my, R);
    lg2.addColorStop(0, LD.alpha(C.surface, C.dark ? 0.12 : 0.3)); lg2.addColorStop(0.6, LD.alpha(C.surface, 0)); lg2.addColorStop(1, LD.shadowInk(C.dark ? 0.25 : 0.08));
    g.fillStyle = lg2; g.fillRect(mx - R, my - R, 2 * R, 2 * R);
    g.restore();
    g.strokeStyle = C.metalDark; g.lineWidth = 6;
    g.beginPath(); g.arc(mx, my, R + 1, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = LD.alpha(LD.shade(C.metal, 0.5), 0.8); g.lineWidth = 1.2;
    g.beginPath(); g.arc(mx, my, R + 2, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
  }

  // ---------- 文字層（不隨畫面縮放） ----------
  /** 化學式：字母後的數字是下標、^ 之後是上標；parts = [{ t }, { f }] */
  const RICH = /([A-Za-z()·]+)|(\d+)|\^(\S+?)(?=$|\s)/g;
  function richWidth(g, parts, px) {
    let w = 0;
    parts.forEach(function (p) {
      if (p.t != null) { g.font = '600 ' + px + 'px ' + FF; w += g.measureText(p.t).width; return; }
      p.f.replace(RICH, function (m, a, d, sup) {
        g.font = (a ? '600 ' + px : '600 ' + (px * 0.72).toFixed(1)) + 'px ' + FF;
        w += g.measureText(a || d || sup).width;
        return m;
      });
    });
    return w;
  }
  function richText(g, parts, x, y, color, px, align) {
    const w = richWidth(g, parts, px);
    let cx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    const draw = function (txt, font, dy) {
      g.font = font; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = LD.alpha(C['canvas-bg'], 0.9);
      g.strokeText(txt, cx, y + dy); g.fillStyle = color; g.fillText(txt, cx, y + dy);
      cx += g.measureText(txt).width;
    };
    parts.forEach(function (p) {
      if (p.t != null) { draw(p.t, '600 ' + px + 'px ' + FF, 0); return; }
      p.f.replace(RICH, function (m, a, d, sup) {
        if (a) draw(a, '600 ' + px + 'px ' + FF, 0);
        else if (d) draw(d, '600 ' + (px * 0.72).toFixed(1) + 'px ' + FF, px * 0.22);
        else draw(sup, '600 ' + (px * 0.72).toFixed(1) + 'px ' + FF, -px * 0.4);
        return m;
      });
    });
    return w;
  }
  /** 化學式的圓角標籤（左邊對齊 x，底邊在 yb；超出畫布時往左移） */
  function richPill(g, parts, x, yb, color) {
    const w = richWidth(g, parts, 12) + 12, h = 19;
    const xx = Math.max(4, Math.min(L.Wpx - w - 4, x));
    LD.roundRect(g, xx, yb - h, w, h, h / 2);
    g.fillStyle = LD.alpha(C['canvas-bg'], C.dark ? 0.86 : 0.9); g.fill();
    g.strokeStyle = LD.alpha(color, C.dark ? 0.45 : 0.35); g.lineWidth = 1; g.stroke();
    richText(g, parts, xx + 6, yb - 5.5, color, 12, 'left');
  }
  function pillClamp(g, text, x, yb, color, align) {
    g.font = '600 12px ' + FF;
    const w = g.measureText(text).width + 12;
    let xx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    xx = Math.max(4, Math.min(L.Wpx - w - 4, xx));
    return LD.pill(g, text, xx, yb, color, 'left');
  }
  function flaskParts() {
    const p = state.run.p, sys = p.sys, parts = [{ t: T('錐形瓶：', 'Flask: ') }];
    if (sys === 'std') {
      parts.push({ t: T('草酸晶體 ', 'oxalic acid ') + p.mass.toFixed(4) + ' g' + T('＋水 ', ' + water ') + p.Va.toFixed(1) + ' mL' });
    } else {
      parts.push({ f: SYS[sys].f });
      parts.push({ t: (sys === 'mx' ? T(' 濃度未知', ' (unknown c)') : ' ' + conc(p.Ca) + ' M') + T('・', ' · ') + p.Va.toFixed(2) + ' mL' });
    }
    parts.push({ t: p.Vacid > 0 ? T('＋3 M ', ' + 3 M ') : T('，沒有加酸', ', no acid') });
    if (p.Vacid > 0) { parts.push({ f: 'H2SO4' }); parts.push({ t: ' ' + p.Vacid.toFixed(1) + ' mL' }); }
    return parts;
  }

  function drawLabels(g) {
    const s = L.s, r = state.run, p = r.p;
    // 滴定管
    const bur = [{ t: T('滴定管：', 'Burette: ') }, { f: 'KMnO4' }, { t: (p.sys === 'std' || p.sys === 'mx') ? T(' 濃度待標定', ' (to be standardised)') : ' ' + conc(p.Cb) + ' M' }];
    richPill(g, bur, (L.xb + 16) * s, (VY.top + 56) * s, C.text);
    // 放大鏡的讀數
    pillClamp(g, T('讀上緣 ', 'Top edge ') + vRead(r.fill) + ' mL', L.mag[0] * s, (L.mag[1] + L.mag[2] + 24) * s, C.accent, 'center');
    // 電位計
    const lc = lcdRect();
    LD.haloText(g, 'V', (lc.x + lc.w - 3) * s, (lc.y + lc.h - 4) * s, LD.alpha(C.lcdInk, 0.95), 'right', 'alphabetic', '700 ' + (L.wide ? 11 : 9) + 'px ' + FF);
    let mlab = '';
    if (!state.meter) mlab = T('電極在蒸餾水中', 'electrode in water');
    else if (r.E == null) mlab = T('讀數不穩定', 'reading unstable');
    else if (L.wide) mlab = T('鉑電極 E（對 SHE）', 'Pt electrode, E vs SHE');
    if (mlab) LD.haloText(g, mlab, ((L.meter[0] + L.meter[2]) / 2) * s, (L.meter[3] - (L.wide ? 8 : 6)) * s, C.muted, 'center', 'alphabetic', '10px ' + FF);
    // 加熱板的溫度顯示
    LD.haloText(g, p.T.toFixed(0) + ' °C', L.xb * s, (VY.plate - 15.5) * s, p.T > 30 ? LD.mix(C.lcdInk, C.glow, 0.6) : C.lcdInk, 'center', 'middle', '700 ' + (L.wide ? 11 : 9) + 'px ' + FF);
    // 桌子前緣：錐形瓶裡有什麼
    const px = 12, line1 = VY.bench * s + 17, line2 = VY.bench * s + 35;
    const parts = flaskParts();
    const note = T('示意圖（未依比例）', 'Not to scale');
    g.font = '11px ' + FF;
    const wNote = g.measureText(note).width + 14, wMain = richWidth(g, parts, px), room = L.Wpx - 16;
    if (wMain + wNote <= room) {
      richText(g, parts, 8, line1, C.text, px, 'left');
      LD.haloText(g, note, L.Wpx - 8, line1, C.muted, 'right', 'alphabetic', '11px ' + FF);
    } else if (L.strip === 2) {
      // 窄版：酸的部分放第二行
      const k = parts.findIndex(function (q) { return q.t != null && /3 M|沒有加酸|no acid/.test(q.t); });
      const a = parts.slice(0, k), b = parts.slice(k).map(function (q, i) { return i === 0 && q.t ? { t: q.t.replace(/^[，, ]+/, '').replace(/^＋/, '＋').replace(/^ \+ /, '+ ') } : q; });
      const fitA = richWidth(g, a, px) <= room ? px : 11;
      richText(g, a, 8, line1, C.text, fitA, 'left');
      richText(g, b, 8, line2, C.text, px, 'left');
      LD.haloText(g, note, L.Wpx - 8, line2, C.muted, 'right', 'alphabetic', '11px ' + FF);
    } else {
      richText(g, parts, 8, line1, C.text, 11, 'left');
    }
    // 變色與計時的提示
    const F = flaskDims();
    const tx = (F.cx + F.Rb + 6) * s;
    if (state.tag && state.tag.t > 0) {
      g.save(); g.globalAlpha = Math.min(1, state.tag.t / 0.4);
      pillClamp(g, state.tag.text, tx, (VY.by - 40) * s, C.chem, 'left');
      g.restore();
    }
    if (K.pink(r.f) && r.u > 0) {
      const hd = K.held(r.f);
      pillClamp(g, (r.f.nA <= 0 ? T('粉紅色 ', 'pink ') : T('紫色持續 ', 'purple ')) + (hd >= 600 ? T('10 分鐘以上', '10 min +') : hd.toFixed(hd < 10 ? 1 : 0) + ' s') + (state.ff ? T('（快轉）', ' (fast)') : ''),
        tx, (VY.by - 16) * s, hd >= HOLD && r.f.nA <= 0 ? C.probe : C.muted, 'left');
    }
  }

  function drawBench() {
    if (!L) return;
    const g = ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(stat, 0, 0);
    g.setTransform(L.dpr * L.s, 0, 0, L.dpr * L.s, 0, 0);
    drawArmAndCable(g);
    drawBuretteLiquid(g);
    drawHangingAndDrops(g);
    drawFlask(g);
    const e = electrodeGeom();
    if (!e.inFlask) drawElectrode(g, e);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(front, 0, 0);
    g.setTransform(L.dpr * L.s, 0, 0, L.dpr * L.s, 0, 0);
    drawCockHandle(g);
    drawLCD(g);
    drawMagnifier(g);
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    drawLabels(g);
  }

  // ======================= 動畫、時間與液滴 =======================
  let raf = 0, lastT = 0, lastGraph = 0, onScreen = true, skip = false, inFrame = false;
  /** 瓶中還在變化（草酸還在反應、正在分解、粉紅色計時中）：時間要繼續走 */
  function chemBusy() {
    const r = state.run, f = r.f;
    if (r.u === 0) return false;
    if (!isFe(r.p.sys) && f.nA > 0 && (f.nMnO4 > 0 || r.p.T > K.T_DEC)) return true;
    return K.pink(f) && K.held(f) < HOLD + 1;
  }
  function busy() {
    return state.tap || state.ff || state.pendingSettle || state.drops.length > 0 || state.plumes.length > 0 || state.ripples.length > 0 ||
      state.bubbles.length > 0 || state.flash > 0 || (state.tag && state.tag.t > 0) || Math.abs(state.cock - (state.tap ? 1 : 0)) > 1e-3 || chemBusy();
  }
  function frame(now) {
    raf = 0;
    const raw = Math.max(0, (now - lastT) / 1000);
    lastT = now;
    inFrame = true;
    try { step(Math.min(1 / 30, raw), Math.min(0.25, raw)); } finally { inFrame = false; }
    const b = busy();
    if (onScreen && (b || !skip || reduced)) drawBench();
    skip = !skip;
    if (graphDirty && now - lastGraph > 150) { lastGraph = now; drawGraph(); renderReadouts(); }
    if (!raf && !document.hidden && (onScreen ? (b || !reduced) : b)) raf = requestAnimationFrame(frame);
  }
  function kick() {
    // frame() 執行中不另開一條動畫迴圈：frame 結束時自己會排下一幀
    if (inFrame) return;
    if (raf || document.hidden) { if (!raf) drawBench(); return; }
    if (!onScreen && !busy()) { drawBench(); return; }
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (es) { onScreen = es[es.length - 1].isIntersecting; if (onScreen) kick(); }).observe(cv);
  }

  function step(dt, flowDt) {
    if (flowDt == null) flowDt = dt;
    if (!reduced) state.stir = (state.stir + STIR_W * dt) % (Math.PI * 200);
    const target = state.tap ? 1 : 0;
    state.cock += Math.sign(target - state.cock) * Math.min(Math.abs(target - state.cock), dt / 0.15);
    if (state.tap) {
      state.acc += state.rate * U * flowDt;
      while (state.acc >= DROP && state.tap) { state.acc -= DROP; release(DROP, false); }
      if (state.rate > STREAM_RATE) { state.streamSnd -= dt; if (state.streamSnd <= 0) { state.streamSnd = 0.11; sndStream(); } }
    }
    const ys = L ? surfaceY() : VY.by;
    const landed = [];
    state.drops = state.drops.filter(function (d) {
      if (d.phase === 'grow') {
        d.t += dt;
        if (d.t >= d.growT) { d.phase = 'fall'; d.y = VY.tip + dropRadius(d.n); d.v = 0; }
        return true;
      }
      d.v += G_PX * dt; d.y += d.v * dt;
      if (d.y >= ys) { landed.push(d); return false; }
      return true;
    });
    landed.forEach(land);
    // 化學的時間：瓶中的反應、粉紅色維持多久（快轉時 ×20）
    advanceChem(flowDt * (state.ff ? FF_SPEED : 1));
    state.plumes = state.plumes.filter(function (p) { p.t += dt; return p.t < p.life; });
    state.ripples = state.ripples.filter(function (p) { p.t += dt; return p.t < 0.35; });
    stepBubbles(dt);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt / 0.6);
    if (state.tag && state.tag.t > 0) state.tag.t -= dt;
    if (state.pendingSettle && !state.tap && state.drops.length === 0) { state.pendingSettle = false; settle(); }
  }
  function stepBubbles(dt) {
    if (!L) return;
    const r = state.run, F = flaskDims(), ys = surfaceY();
    state.bubbles = state.bubbles.filter(function (b) { b.y -= b.v * dt; b.x += 0.06 * Math.sin(b.y * 0.2) * dt; return b.y > ys + 2; });
    if (reduced || isFe(r.p.sys)) return;
    // CO2：每反應 1 mmol MnO4- 生成 5 mmol CO2（畫面上的氣泡數只是示意）
    const want = Math.min(40, r.f.rate * 4000) * dt;
    let k = Math.floor(want) + (Math.random() < want % 1 ? 1 : 0);
    while (k-- > 0 && state.bubbles.length < 60) state.bubbles.push({ x: (Math.random() * 2 - 1) * 0.8, y: F.by - 5 - Math.random() * 10, v: 30 + Math.random() * 25, r: 0.8 + Math.random() * 1.2 });
  }

  let lastChemDraw = 0;
  function advanceChem(dt) {
    const r = state.run;
    if (!(dt > 0) || r.u === 0) return;
    const wasHeld = K.held(r.f);
    const ev = K.tick(state.S, dt);
    handleFades(ev);
    // 草酸：電位與顏色隨時間改變，最後一個數據點跟著更新
    if (!isFe(r.p.sys)) {
      const last = r.rows[r.rows.length - 1];
      if (last && last.u === r.u) { last.E = state.meter ? r.E : null; last.pink = K.pink(r.f); last.c = flaskRGB(r.f); }
      const lp = r.pts[r.pts.length - 1];
      if (lp && lp.u === r.u) lp.c = flaskRGB(r.f);
      const now = performance.now();
      if (now - lastChemDraw > 250) { lastChemDraw = now; graphDirty = true; }
    }
    // 終點的粉紅色維持 30 秒
    const hd = K.held(r.f);
    if (r.f.nA <= 0 && K.pink(r.f) && wasHeld < HOLD && hd >= HOLD && !r.chimed30) {
      r.chimed30 = true;
      sndHold();
      state.tag = { text: T('30 秒不褪色', 'Lasted 30 s'), t: 2 };
      setStatus(T('淡粉紅色維持 30 秒都沒有褪去：這就是終點，按「記錄終點」。', 'The faint pink has lasted 30 s: this is the end point — press “Record end point”.'));
      if (state.ff) setFF(false);
      renderReadouts();
    }
  }
  function handleFades(list) {
    const r = state.run;
    list.forEach(function (e) {
      emit('fade', K.fadeData(state.S, e, state.meter));
      if (!isFe(r.p.sys)) {
        if (e.first) setStatus(T('第一段紫色等了 ' + e.dur.toFixed(1) + ' 秒才褪去。之後生成的 Mn2+ 會讓反應越來越快。', 'The first purple took ' + e.dur.toFixed(1) + ' s to fade. The Mn2+ it produced will make the next drops go faster.'));
        else if (e.dur >= 3) routineStatus(T('紫色 ' + e.dur.toFixed(1) + ' 秒後褪去了。', 'The purple faded after ' + e.dur.toFixed(1) + ' s.'));
      } else if (r.f.nA > 0 && e.dur > 0.5) {
        routineStatus(T('粉紅色褪去了：瓶中還有 Fe2+。', 'The pink has gone: there is still Fe2+ in the flask.'));
      }
    });
  }

  /** 從滴定管放出 n 個單位（一滴 2、半滴 1） */
  function release(n, fromButton) {
    const r = state.run;
    const left = K.BURETTE_UNITS - r.fill;
    if (left <= 0) { closeTap(); emptyNotice(); return 0; }
    if (r.p.Va + r.p.Vacid + (r.out + n) / U > VT_MAX) {
      closeTap();
      setStatus(T('錐形瓶快滿了（' + VT_MAX + ' mL）。換一瓶，或減少待測液、提高 KMnO4 的濃度。', 'The flask is almost full (' + VT_MAX + ' mL). Start a new flask, or use less sample or a more concentrated KMnO4.'), true);
      return 0;
    }
    n = K.release(state.S, n, state.meter);
    if (!n) return 0;
    const d = { n: n, phase: fromButton ? 'grow' : 'fall', t: 0, growT: n >= DROP ? 0.12 : 0.09, y: VY.tip + dropRadius(n), v: 0 };
    if (reduced) land(d); else state.drops.push(d);
    if (r.fill >= K.BURETTE_UNITS) { closeTap(); emptyNotice(); }
    state.pendingSettle = true;
    kick();
    return n;
  }

  let lastPlume = 0;
  /** 液滴落進錐形瓶 */
  function land(d) {
    const r = state.run, f = r.f;
    const wasPink = K.pink(f), wasExcess = f.nA <= 0, hadMnO2 = f.nMnO2 / K.vTot(f) >= K.MNO2_SEEN;
    const ev = K.land(state.S, d.n, state.meter);
    const col = flaskRGB(f);
    r.pts[r.pts.length - 1].c = col;
    state.pendingSettle = true;
    sndDrop(d.n);
    if (!reduced) {
      state.ripples.push({ t: 0 });
      const nowMs = performance.now();
      if (nowMs - lastPlume > (state.tap && state.rate > STREAM_RATE ? 120 : 0)) {
        lastPlume = nowMs;
        state.plumes.push({ t: 0, life: isFe(r.p.sys) ? 0.8 : 1.2, a0: Math.random() * Math.PI * 2, rgb: tint(K.mnO4Transmit(r.p.Cb * 0.05, 4)) });
        if (state.plumes.length > 8) state.plumes.shift();
      }
    }
    handleFades(ev);
    if (!hadMnO2 && f.nMnO2 / K.vTot(f) >= K.MNO2_SEEN) {
      setStatus(T('溶液出現棕色混濁：酸不夠，MnO4− 只還原成 MnO2。', 'The solution turns brown and cloudy: there is not enough acid, so MnO4− is reduced only to MnO2.'), true);
    } else if (!wasExcess && f.nA <= 0 && K.pink(f)) {
      colourChanged();
    } else if (!isFe(r.p.sys) && !wasPink && K.pink(f) && f.nA > 0 && !r.oxHint) {
      r.oxHint = true;
      setStatus(r.p.T < 50
        ? T('紫色遲遲不褪：室溫下草酸和 MnO4− 反應很慢。把加熱板調到 60–70 °C 試試。', 'The purple will not fade: oxalic acid reacts very slowly with MnO4− at room temperature. Try 60–70 °C on the hot plate.')
        : T('第一滴的紫色要等一會兒才褪：瓶中還沒有催化反應的 Mn2+。等它褪了再加下一滴。', 'The first drop takes a while to fade: there is no Mn2+ yet to catalyse the reaction. Wait for it before adding more.'));
    }
    graphDirty = true;
  }
  function colourChanged() {
    state.flash = reduced ? 0 : 1;
    state.flashCol = rgbStr(flaskRGB(state.run.f));
    state.tag = { text: T('出現粉紅色！', 'Pink!'), t: 1.8 };
    sndColour();
    setStatus(T('整瓶溶液變成淡粉紅色：多出來的 MnO4− 沒有東西可以反應了。等 30 秒不褪色，就按「記錄終點」。', 'The whole flask has turned faint pink: the extra MnO4− has nothing left to react with. If it lasts 30 s, press “Record end point”.'));
  }
  function emptyNotice() {
    sndEmpty();
    setStatus(T('滴定管流空了（50.00 mL）。按「補充滴定液」重新裝滿再繼續。', 'The burette is empty (50.00 mL). Press “Refill burette” to fill it up and carry on.'), true);
  }
  function closeTap() {
    if (!state.tap) return;
    state.tap = false; state.acc = 0;
    updateButtons();
  }
  function setFF(on) {
    state.ff = on;
    if (on) closeTap();
    updateButtons();
    kick();
  }

  // ======================= 任務事件 =======================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  /** 加入的液體全部落進瓶中、停下來了：記一列數據、回報任務事件 */
  function settle() {
    const r = state.run;
    const data = K.settle(state.S, state.meter);
    const last = r.rows[r.rows.length - 1];
    if (last) last.c = flaskRGB(r.f);
    latestRow = true;
    renderAll();
    routineStatus(T('滴定管讀數 ' + vRead(r.fill) + ' mL', 'Burette reading ' + vRead(r.fill) + ' mL') +
      (state.meter ? (r.E == null ? T('，電位不穩定', ', potential unstable') : T('，E = ' + fE(r.E) + ' V', ', E = ' + fE(r.E) + ' V')) : '') +
      T('，溶液' + colourName(r.f) + '。', ', solution ' + colourName(r.f) + '.'));
    emit('settle', data);
  }
  function colourName(f) {
    const V = K.vTot(f), c = f.nMnO4 / V;
    const brown = f.nMnO2 / V >= K.MNO2_SEEN;
    let s;
    if (c >= 3e-4) s = T('紫色', 'purple');
    else if (c >= 4e-5) s = T('紫紅色', 'magenta');
    else if (c >= K.PINK_M) s = T('淡粉紅色', 'faint pink');
    else if (isFe(f.p.sys) && f.nP / V >= 0.01) s = T('淡黃色', 'pale yellow');
    else s = T('無色', 'colourless');
    return brown ? T('棕色混濁（', 'brown and cloudy (') + s + T('）', ')') : s;
  }

  // ======================= 圖：電位滴定曲線 =======================
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  let G = null, graphDirty = true, hover = null;
  function resizeGraph() {
    const W = gcv.clientWidth;
    if (!W) return;
    const H = Math.round(Math.max(280, Math.min(400, W * 0.58)));
    if (gcv.style.height !== H + 'px') gcv.style.height = H + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    gcv.width = Math.round(W * dpr); gcv.height = Math.round(H * dpr);
    G = { W: W, H: H, dpr: dpr };
    drawGraph();
  }
  const NICE = [5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250];
  function xMax() {
    const r = state.run;
    let m = mysteryHidden() ? 50 : Math.max(10, 2 * r.Veq);
    state.S.archive.concat([r]).forEach(function (q) { m = Math.max(m, q.u / U * 1.06); });
    for (let i = 0; i < NICE.length; i++) if (NICE[i] >= m - 1e-9) return NICE[i];
    return 250;
  }
  function xStep(xmax) {
    const st = [0.5, 1, 2, 5, 10, 20, 25, 50];
    for (let i = 0; i < st.length; i++) if (xmax / st[i] <= 10.5) return st[i];
    return 50;
  }
  const EMIN = 0.4, EMAX = 1.7;
  const theoryCache = { key: '', pts: null };
  /** 理論曲線：同一瓶溶液一點一點加（Fe2+ 瞬間反應）；草酸只畫過了當量點的部分 */
  function theoryPts(p, xmax) {
    const key = [p.sys, p.Ca, p.Va, p.Vacid, p.Cb, p.mass, xmax].join('|');
    if (theoryCache.key === key) return theoryCache.pts;
    const Veq = K.Veq(p), pts = [];
    if (isFe(p.sys)) {
      const xs = [];
      for (let i = 1; i <= 400; i++) xs.push(xmax * i / 400);
      for (let v = Math.max(0.01, Veq - 0.6); v <= Math.min(xmax, Veq + 0.6); v += 0.01) xs.push(v);
      xs.sort(function (a, b) { return a - b; });
      const f = K.createFlask(p);
      pts.push({ v: 0, E: K.potential(f) });
      xs.forEach(function (v) {
        if (v - f.V > 1e-9) { K.addTitrant(f, v - f.V); pts.push({ v: v, E: K.potential(f) }); }
      });
    } else {
      for (let i = 0; i <= 60; i++) {
        const v = Veq + 0.005 + (xmax - Veq) * i / 60;
        if (v > xmax) break;
        const E = K.E_at(p, v);
        if (E != null) pts.push({ v: v, E: E });
      }
    }
    theoryCache.key = key; theoryCache.pts = pts;
    return pts;
  }
  function slopes(r) {
    const m = r.pts.filter(function (q) { return q.m && q.E != null; }), out = [];
    for (let i = 1; i < m.length; i++) {
      const dv = (m[i].u - m[i - 1].u) / U;
      if (dv > 0 && dv <= 2.5) out.push({ v: (m[i].u + m[i - 1].u) / 2 / U, d: (m[i].E - m[i - 1].E) / dv });
    }
    return out;
  }
  function maxSlope(r) {
    const s = slopes(r);
    if (s.length < 2) return null;
    let best = s[0];
    s.forEach(function (q) { if (q.d > best.d) best = q; });
    return best.d > 0 ? best : null;
  }

  function drawGraph() {
    if (!G) return;
    graphDirty = false;
    const g = gctx, W = G.W, H = G.H, r = state.run, p = r.p, hid = mysteryHidden();
    g.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    LD.backdrop(g, W, H);
    const x0 = 46, x1 = W - (state.deriv ? 50 : 14), y0 = 14, y1 = H - 60;
    const xmax = xMax();
    const X = function (v) { return x0 + v / xmax * (x1 - x0); };
    const Y = function (E) { return y1 - (E - EMIN) / (EMAX - EMIN) * (y1 - y0); };
    G.X = X; G.Y = Y; G.x0 = x0; G.x1 = x1; G.y0 = y0; G.y1 = y1; G.xmax = xmax;
    g.fillStyle = LD.alpha(C.surface, C.dark ? 0.2 : 0.55); g.fillRect(x0, y0, x1 - x0, y1 - y0);
    const xs = xStep(xmax);
    const gridLines = function (major) {
      g.beginPath();
      for (let k = 4; k <= 17; k++) if ((k % 2 === 0) === major) { const y = Math.round(Y(k / 10)) + 0.5; g.moveTo(x0, y); g.lineTo(x1, y); }
      for (let i = 0; i * xs / 2 <= xmax + 1e-9; i++) if ((i % 2 === 0) === major) { const x = Math.round(X(i * xs / 2)) + 0.5; g.moveTo(x, y0); g.lineTo(x, y1); }
      g.strokeStyle = LD.alpha(C.text, major ? (C.dark ? 0.11 : 0.1) : (C.dark ? 0.05 : 0.04)); g.lineWidth = 1; g.stroke();
    };
    gridLines(false); gridLines(true);
    // 兩個標準還原電位
    g.setLineDash([4, 4]); g.lineWidth = 1;
    g.strokeStyle = LD.alpha(C.neg, 0.55);
    g.beginPath(); g.moveTo(x0, Math.round(Y(K.E_FE)) + 0.5); g.lineTo(x1, Math.round(Y(K.E_FE)) + 0.5); g.stroke();
    g.strokeStyle = LD.alpha(C.chem, 0.55);
    g.beginPath(); g.moveTo(x0, Math.round(Y(K.E_MN)) + 0.5); g.lineTo(x1, Math.round(Y(K.E_MN)) + 0.5); g.stroke();
    g.setLineDash([]);
    graphRich(g, [{ t: 'E°(' }, { f: 'Fe^3+' }, { t: '/' }, { f: 'Fe^2+' }, { t: ') = 0.771 V' }], x1 - 6, Y(K.E_FE) - 5, C.neg, 'right');
    graphRich(g, [{ t: 'E°(' }, { f: 'MnO4^−' }, { t: '/' }, { f: 'Mn^2+' }, { t: ') = 1.507 V' }], x1 - 6, Y(K.E_MN) - 5, C.chem, 'right');
    // 草酸：當量點前沒有可逆電對
    const Vnow = r.u / U;
    if (!isFe(p.sys)) {
      const xe = hid ? x1 : Math.min(x1, X(r.Veq));
      g.fillStyle = LD.alpha(C.muted, C.dark ? 0.1 : 0.08);
      g.fillRect(x0, y0, xe - x0, y1 - y0);
      LD.haloText(g, T('當量點前：草酸／CO2 不是可逆電對，電位不穩定', 'Before equivalence: oxalic acid/CO2 is not a reversible couple, so the potential drifts'), x0 + 8, Y(1.05), C.muted, 'left', 'alphabetic', '11px ' + FF);
    }
    // 理論曲線
    if (state.theory && !hid) {
      const tp = theoryPts(p, xmax);
      g.save(); g.setLineDash([6, 4]); g.strokeStyle = LD.alpha(C.sys[p.sys], 0.75); g.lineWidth = 1.5; g.lineJoin = 'round';
      g.beginPath(); tp.forEach(function (q, i) { const x = X(q.v), y = Y(Math.max(EMIN - 0.05, Math.min(EMAX + 0.05, q.E))); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
      g.restore();
    }
    g.save(); g.beginPath(); g.rect(x0, y0 - 2, x1 - x0, y1 - y0 + 4); g.clip();
    state.S.archive.slice().reverse().forEach(function (q) { drawRunCurve(g, q, X, Y, true); });
    drawRunCurve(g, r, X, Y, false);
    g.restore();
    // 斜率 ΔE/ΔV
    if (state.deriv) {
      const sl = slopes(r);
      let dmax = 0; sl.forEach(function (q) { dmax = Math.max(dmax, Math.abs(q.d)); });
      const dTop = niceUp(Math.max(0.1, dmax * 1.08));
      const YD = function (d) { return y1 - Math.abs(d) / dTop * (y1 - y0); };
      g.save(); g.strokeStyle = C.accent; g.lineWidth = 1.6; g.lineJoin = 'round';
      g.beginPath(); sl.forEach(function (q, i) { const x = X(q.v), y = YD(q.d); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
      g.restore();
      g.fillStyle = C.accent; g.font = '11px ' + FF; g.textAlign = 'left'; g.textBaseline = 'middle';
      for (let i = 0; i <= 4; i++) { const d = dTop * i / 4; g.fillText(fmtAxis(d), x1 + 5, YD(d)); }
      LD.haloText(g, T('|ΔE/ΔV|（V/mL）', '|ΔE/ΔV| (V/mL)'), x1 - 6, y0 + 30, C.accent, 'right', 'alphabetic', '600 11px ' + FF);
    }
    // 半當量點、當量點、終點
    if (!hid) {
      if (isFe(p.sys) && (state.theory || Vnow >= r.Veq / 2)) {
        const vh = r.Veq / 2, E = K.E_at(p, vh), px = X(vh), py = Y(E);
        g.save(); g.setLineDash([3, 3]); g.strokeStyle = LD.alpha(C.text, 0.45); g.lineWidth = 1;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px, y1); g.stroke(); g.restore();
        LD.ball(g, px, py, 4, C.sys[p.sys], { shadow: false });
        pillGraph(g, T('半當量點 ' + fE(E) + ' V', 'half-equivalence ' + fE(E) + ' V'), px - 6, py + 26, C.text, 'right', x0, x1);
      }
      if (state.theory || Vnow >= r.Veq) {
        const px = X(r.Veq);
        const Ep = isFe(p.sys) ? r.Eeq : null;
        if (px <= x1 + 0.5) {
          g.save(); g.setLineDash([3, 3]); g.strokeStyle = LD.alpha(C.text, 0.45); g.lineWidth = 1;
          g.beginPath(); g.moveTo(px, Ep != null ? Y(Ep) : y0); g.lineTo(px, y1); g.stroke(); g.restore();
          if (Ep != null) LD.ball(g, px, Y(Ep), 4.8, C.sys[p.sys], { shadow: false });
          const lab = Ep != null ? T('當量點 ' + r.Veq.toFixed(2) + ' mL・' + fE(Ep) + ' V', 'equivalence ' + r.Veq.toFixed(2) + ' mL, ' + fE(Ep) + ' V') : T('當量點 ' + r.Veq.toFixed(2) + ' mL', 'equivalence ' + r.Veq.toFixed(2) + ' mL');
          pillGraph(g, lab, px + 8, Ep != null ? Y(Ep) + 26 : y0 + 56, C.text, 'left', x0, x1);
        }
      }
    }
    if (r.endpoint != null) {
      const px = X(r.endpoint);
      if (px <= x1) {
        g.strokeStyle = C.equi; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(px, y0); g.lineTo(px, y1); g.stroke();
        pillGraph(g, T('你的終點 ', 'your end point ') + vRead(r.endpoint * U) + ' mL', px + 5, y0 + 18, C.equi, 'left', x0, x1);
      }
    }
    // 座標軸
    g.strokeStyle = LD.alpha(C.text, 0.6); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0, y1); g.lineTo(x1, y1); if (state.deriv) g.lineTo(x1, y0); g.stroke();
    g.fillStyle = C.text; g.font = '11px ' + FF; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let k = 4; k <= 17; k += 2) g.fillText((k / 10).toFixed(1), x0 - 6, Y(k / 10));
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    for (let v = 0; v <= xmax + 1e-9; v += xs) g.fillText(fmtAxis(v), X(v), y1 + 32);
    LD.haloText(g, T('E（V，對 SHE）', 'E (V vs SHE)'), x0 + 6, y0 + 14, C.text, 'left', 'alphabetic', '700 12px ' + FF);
    graphRich(g, [{ t: T('加入的 ', 'Volume of ') }, { f: 'KMnO4' }, { t: T(' 體積 V（mL）', ' added, V (mL)') }], (x0 + x1) / 2, H - 8, C.muted, 'center', 12);
    // 瓶中顏色的色條
    const sy = y1 + 5, shh = 11;
    g.fillStyle = LD.alpha(C.text, 0.06); g.fillRect(x0, sy, x1 - x0, shh);
    const pts = r.pts, n = pts.length;
    const paint = function (q, a, b) {
      if (!q.c) return;
      g.fillStyle = rgbStr(q.c);
      g.fillRect(a, sy, Math.max(1, Math.min(x1, b) - a + 0.5), shh);
    };
    let segX = null, segQ = null;
    for (let i = 0; i < n; i++) {
      const a = X(pts[i].u / U);
      if (a > x1) break;
      if (segX === null) { segX = a; segQ = pts[i]; continue; }
      if (a - segX >= 1) { paint(segQ, segX, a); segX = a; }
      segQ = pts[i];
    }
    if (segQ) paint(segQ, segX, segX + 3);
    g.strokeStyle = LD.alpha(C.text, 0.25); g.lineWidth = 1; g.strokeRect(x0 + 0.5, sy + 0.5, x1 - x0 - 1, shh - 1);
    if (hover) drawHover(g, X, Y);
  }
  function graphRich(g, parts, x, y, color, align, px) { richText(g, parts, x, y, color, px || 11, align); }
  function fmtAxis(v) { return Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(v < 1 ? 2 : 1); }
  function niceUp(v) {
    const e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e;
  }
  function pillGraph(g, text, x, yb, color, align, xa, xb2) {
    g.font = '600 12px ' + FF;
    const w = g.measureText(text).width + 12;
    let xx = align === 'right' ? x - w : x;
    if (xx + w > xb2 - 2) xx = xb2 - 2 - w;
    if (xx < xa + 2) xx = xa + 2;
    yb = Math.max(G.y0 + 18, Math.min(G.y1 - 2, yb));
    LD.pill(g, text, xx, yb, color, 'left');
  }
  function drawRunCurve(g, r, X, Y, old) {
    const col = C.sys[r.p.sys];
    g.save();
    g.strokeStyle = old ? LD.alpha(col, 0.45) : col;
    g.lineWidth = old ? 1.5 : 2.4; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath();
    let pen = false, lastX = 0, lastY = 0;
    r.pts.forEach(function (q) {
      if (!q.m || q.E == null) { pen = false; return; }
      const x = X(q.u / U), y = Y(q.E);
      if (pen) g.lineTo(x, y); else g.moveTo(x, y);
      pen = true; lastX = x; lastY = y;
    });
    g.stroke();
    if (!old) {
      g.fillStyle = col;
      r.rows.forEach(function (q) { if (q.E != null) { g.beginPath(); g.arc(X(q.u / U), Y(q.E), 2.4, 0, Math.PI * 2); g.fill(); } });
    } else if (r.no && pen) {
      LD.haloText(g, '#' + r.no, Math.min(lastX + 4, G.x1 - 18), lastY - 4, col, 'left', 'alphabetic', '600 11px ' + FF);
    }
    g.restore();
  }
  function drawHover(g, X, Y) {
    const r = state.run;
    let best = null, bd = 28;
    r.pts.forEach(function (q) { if (q.m && q.E != null) { const d = Math.abs(X(q.u / U) - hover.x); if (d < bd) { bd = d; best = q; } } });
    let v, E, lab;
    if (best) { v = best.u / U; E = best.E; lab = 'V = ' + vRead(best.u) + ' mL' + T('・', ', ') + 'E = ' + fE(E) + ' V'; }
    else if (state.theory && !mysteryHidden()) {
      v = Math.max(0, Math.min(G.xmax, (hover.x - G.x0) / (G.x1 - G.x0) * G.xmax));
      E = K.E_at(r.p, v);
      if (E == null) return;
      lab = T('理論：', 'theory: ') + 'V = ' + v.toFixed(2) + ' mL' + T('・', ', ') + 'E = ' + fE(E) + ' V';
    } else return;
    const x = X(v), y = Y(E);
    g.strokeStyle = LD.alpha(C.text, 0.4); g.lineWidth = 1;
    g.beginPath(); g.moveTo(x + 0.5, G.y0); g.lineTo(x + 0.5, G.y1); g.stroke();
    LD.ball(g, x, y, 4, C.accent, { shadow: false });
    pillGraph(g, lab, x + 8, y - 8, C.text, 'left', G.x0, G.x1);
  }
  function hoverAt(e) {
    const rc = gcv.getBoundingClientRect();
    hover = { x: e.clientX - rc.left, y: e.clientY - rc.top };
    drawGraph();
  }
  gcv.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') hoverAt(e); });
  gcv.addEventListener('pointerdown', hoverAt);
  gcv.addEventListener('pointerleave', function () { if (hover) { hover = null; drawGraph(); } });

  // ======================= 讀數、分析、數據表 =======================
  function dl(rows) {
    return rows.map(function (q) {
      return '<dt>' + q[0] + '</dt><dd' + (q[2] ? ' class="' + q[2] + '"' : '') + '>' + q[1] + '</dd>';
    }).join('');
  }
  function renderReadouts() {
    const r = state.run, p = r.p, f = r.f, hid = mysteryHidden(), rows = [], V = K.vTot(f);
    rows.push([T('滴定管讀數（上緣）', 'Burette reading (top edge)'), vRead(r.fill) + ' mL', 'big']);
    if (r.out !== r.fill) rows.push([T('這一瓶累計流出', 'Run out into this flask'), vRead(r.out) + ' mL']);
    rows.push([T('錐形瓶中的溶液', 'Solution in the flask'), V.toFixed(1) + ' mL']);
    rows.push([T('溫度（加熱板）', 'Temperature (hot plate)'), p.T.toFixed(0) + ' °C']);
    if (state.meter) {
      rows.push([T('電位 E（鉑電極）', 'Potential E (Pt electrode)'), r.E == null ? T('不穩定', 'unstable') + '<small>' + T('草酸還沒反應完', 'oxalic acid still left') + '</small>' : fE(r.E) + ' V', 'big']);
    } else {
      rows.push([T('電位 E', 'Potential E'), '—<small>' + T('電極不在瓶中', 'electrode not in the flask') + '</small>']);
    }
    rows.push(['[H<sup>+</sup>]', sciHTML(K.hFree(f), 2) + ' M']);
    rows.push([T('溶液的顏色', 'Colour of the solution'), colourName(f)]);
    if (K.pink(f) && r.u > 0) {
      const hd = K.held(f);
      rows.push([T(f.nA <= 0 ? '粉紅色已維持' : '紫色已持續', f.nA <= 0 ? 'Pink has lasted' : 'Purple has lasted'), (hd >= 600 ? '> 600' : hd.toFixed(1)) + ' s', f.nA <= 0 && hd >= HOLD ? 'good' : '']);
    }
    if (!hid) {
      const red = isFe(p.sys) ? T('Fe<sup>2+</sup> 已氧化', 'Fe<sup>2+</sup> oxidised') : T('草酸已氧化', 'Oxalic acid oxidised');
      rows.push([red, Math.min(100, (1 - f.nA / p.nA) * 100).toFixed(1) + '%']);
      const ex = f.nMnO4 / p.Cb;
      if (f.nA <= 0 && ex > 0) rows.push([T('過量的 KMnO<sub>4</sub>', 'Excess KMnO<sub>4</sub>'), ex.toFixed(2) + ' mL']);
    }
    const red2 = f.nMnO2 + f.nMn2;
    if (f.nMnO2 / V >= K.MNO2_SEEN) rows.push([T('還原成 MnO<sub>2</sub> 的比例', 'Reduced only to MnO<sub>2</sub>'), (f.nMnO2 / red2 * 100).toFixed(0) + '%', 'warn']);
    if (!isFe(p.sys) && f.dec > 1e-9) rows.push([T('分解掉的草酸', 'Oxalic acid decomposed'), (f.dec / p.nA * 100).toFixed(1) + '%', 'warn']);
    $('readout').innerHTML = dl(rows);
  }
  function renderAnalysis() {
    const r = state.run, p = r.p, hid = mysteryHidden(), rows = [], fe = isFe(p.sys);
    rows.push([T('莫耳數比', 'Mole ratio') + '<small>' + (fe ? 'n(MnO<sub>4</sub><sup>−</sup>) : n(Fe<sup>2+</sup>)' : 'n(MnO<sub>4</sub><sup>−</sup>) : n(H<sub>2</sub>C<sub>2</sub>O<sub>4</sub>)') + '</small>', fe ? '1 : 5' : '2 : 5']);
    rows.push([T('當量點體積（理論）', 'Equivalence volume (theory)') + '<small>' + (fe ? 'V<sub>eq</sub> = c<sub>Fe</sub>V<sub>Fe</sub> / 5c<sub>Mn</sub>' : 'V<sub>eq</sub> = 2n<sub>ox</sub> / 5c<sub>Mn</sub>') + '</small>', hid ? '？' : r.Veq.toFixed(2) + ' mL']);
    if (fe) {
      rows.push([T('半當量點的電位', 'E at half-equivalence') + '<small>= E°(Fe<sup>3+</sup>/Fe<sup>2+</sup>)</small>', hid ? '？' : fE(K.E_at(p, r.Veq / 2)) + ' V']);
      rows.push([T('當量點的電位（加權平均）', 'E at equivalence (weighted mean)') + '<small>(E°<sub>Fe</sub> + 5E°′<sub>Mn</sub>) / 6</small>', hid ? '？' : fE(r.Eeq) + ' V']);
    }
    if (p.sys === 'std') rows.push([T('草酸', 'Oxalic acid') + '<small>n = m / 126.07</small>', (p.nA).toFixed(4) + ' mmol']);
    if (r.endpoint != null) {
      rows.push([T('你記錄的終點', 'Your end point'), vRead(r.endpoint * U) + ' mL', 'good']);
      if (!hid) {
        const err = r.endpoint - r.Veq;
        rows.push([T('終點 − 當量點', 'End point − equivalence'), signed(err, 3) + ' mL', Math.abs(err) <= 0.1 + 1e-9 ? 'good' : 'warn']);
      } else {
        rows.push([T('計算', 'Work it out') + '<small>' + (p.sys === 'std' ? 'c<sub>Mn</sub> = 2n<sub>ox</sub> / 5V' : 'c<sub>Fe</sub> = 5c<sub>Mn</sub>V / V<sub>Fe</sub>') + '</small>', T('用你的終點', 'use your end point')]);
      }
    } else rows.push([T('你記錄的終點', 'Your end point'), T('還沒記錄', 'not yet')]);
    const ms = maxSlope(r);
    rows.push([T('數據中斜率最大處', 'Steepest point in your data') + '<small>' + T('相鄰兩點 ΔE/ΔV 最大', 'largest ΔE/ΔV between neighbours') + '</small>', ms ? 'V ≈ ' + ms.v.toFixed(3) + ' mL' : '—']);
    if ((p.sys === 'std' || p.sys === 'mx') && state.S.sample.revealed) {
      rows.push([T('KMnO<sub>4</sub> 的真正濃度', 'True c(KMnO<sub>4</sub>)'), state.S.sample.Cb.toFixed(4) + ' M', 'good']);
      rows.push([T('未知 Fe<sup>2+</sup> 的真正濃度', 'True c(Fe<sup>2+</sup>)'), state.S.sample.CFe.toFixed(3) + ' M', 'good']);
    }
    $('anaOut').innerHTML = dl(rows);
  }
  let latestRow = false;
  function renderTable() {
    const r = state.run;
    let h = '<thead><tr><th>#</th><th>V<br><small>(mL)</small></th><th>E<br><small>(V)</small></th><th class="d">ΔE/ΔV<br><small>(V/mL)</small></th><th>' + T('顏色', 'Colour') + '</th></tr></thead><tbody>';
    let prev = null;
    r.rows.forEach(function (q, i) {
      let d = '—', jump = false;
      if (q.E != null && prev && q.u > prev.u) { const dd = (q.E - prev.E) / ((q.u - prev.u) / U); d = dd.toFixed(Math.abs(dd) >= 10 ? 1 : Math.abs(dd) >= 1 ? 2 : 3); jump = dd >= 2; }
      const cls = (latestRow && i === r.rows.length - 1 ? 'latest' : '') + (jump ? ' jump' : '');
      const col = q.c || flaskRGB(i === 0 ? K.createFlask(r.p) : r.f);
      h += '<tr' + (cls.trim() ? ' class="' + cls.trim() + '"' : '') + '><td>' + i + '</td><td>' + vRead(q.u) + '</td><td>' + (q.E == null ? '—' : fE(q.E)) + '</td><td class="d">' + d + '</td><td class="col"><i style="background:' + rgbStr(col) + '"></i>' + (q.pink ? T('粉紅', 'pink') : '') + '</td></tr>';
      if (q.E != null) prev = q;
    });
    h += '</tbody>';
    $('tbl').innerHTML = h;
    const wrap = $('tblWrap');
    if (latestRow) wrap.scrollTop = wrap.scrollHeight;
  }
  function sysLabelHTML(p) {
    if (p.sys === 'std') return T('草酸 ', 'oxalic acid ') + p.mass.toFixed(4) + ' g';
    if (p.sys === 'mx') return T('未知 Fe<sup>2+</sup>', 'unknown Fe<sup>2+</sup>');
    return (p.sys === 'fe' ? 'Fe<sup>2+</sup> ' : 'H<sub>2</sub>C<sub>2</sub>O<sub>4</sub> ') + conc(p.Ca) + ' M';
  }
  function runLabel(r, current) {
    const p = r.p;
    return (current ? (r.no ? T('目前（#' + r.no + '）：', 'Now (#' + r.no + '): ') : T('目前：', 'Now: ')) : '#' + r.no + ' ') + sysLabelHTML(p) + T('＋硫酸 ', ' + acid ') + p.Vacid.toFixed(1) + ' mL' + T('・', ', ') + p.T.toFixed(0) + ' °C';
  }
  function renderLegend() {
    const items = [], r = state.run, col = C.sys[r.p.sys];
    items.push('<span style="color:' + col + '"><i class="ln" style="background:' + col + '"></i>' + runLabel(r, true) + '</span>');
    if (state.theory && !mysteryHidden()) items.push('<span style="color:' + col + '"><i class="ln dash"></i>' + T('理論曲線', 'theoretical curve') + '</span>');
    state.S.archive.forEach(function (q) {
      const c = C.sys[q.p.sys];
      items.push('<span><i class="ln old" style="background:' + c + '"></i>' + runLabel(q, false) + '</span>');
    });
    if (state.deriv) items.push('<span style="color:' + C.accent + '"><i class="ln" style="background:' + C.accent + '"></i>|ΔE/ΔV|</span>');
    if (r.endpoint != null) items.push('<span style="color:' + C.equi + '"><i class="ln" style="background:' + C.equi + '"></i>' + T('你的終點', 'your end point') + '</span>');
    $('curveLegend').innerHTML = items.join('');
  }
  function setLabel(id, zh, en) {
    const el = $(id);
    el.removeAttribute('data-en');
    el.setAttribute('data-en-html', en);
    el.innerHTML = T(zh, en);
  }
  function renderSysInfo() {
    const sys = state.sys;
    const eq = {
      fe: 'MnO<sub>4</sub><sup>−</sup> + 5Fe<sup>2+</sup> + 8H<sup>+</sup> → Mn<sup>2+</sup> + 5Fe<sup>3+</sup> + 4H<sub>2</sub>O',
      ox: '2MnO<sub>4</sub><sup>−</sup> + 5H<sub>2</sub>C<sub>2</sub>O<sub>4</sub> + 6H<sup>+</sup> → 2Mn<sup>2+</sup> + 10CO<sub>2</sub> + 8H<sub>2</sub>O'
    };
    const info = {
      fe: eq.fe + '<br>' + T('反應瞬間完成；溶液由淺綠（Fe<sup>2+</sup>）漸漸變成淡黃（Fe<sup>3+</sup>）。', 'Instant reaction; the solution goes from pale green (Fe<sup>2+</sup>) to pale yellow (Fe<sup>3+</sup>).'),
      ox: eq.ox + '<br>' + T('室溫下很慢，要加熱到 60–70 °C；生成的 Mn<sup>2+</sup> 會催化反應。', 'Slow at room temperature: heat to 60–70 °C. The Mn<sup>2+</sup> produced catalyses the reaction.'),
      std: eq.ox + '<br>' + T('精稱草酸晶體 H<sub>2</sub>C<sub>2</sub>O<sub>4</sub>·2H<sub>2</sub>O（126.07 g/mol），求出 KMnO<sub>4</sub> 的濃度；答案欄在電位滴定曲線旁（手機在下方）。', 'Weigh oxalic acid dihydrate (126.07 g/mol) and work out c(KMnO<sub>4</sub>); the answer box is next to the titration curve (below it on a phone).'),
      mx: eq.fe + '<br>' + T('25.00 mL 濃度未知的 Fe<sup>2+</sup>，用同一瓶 KMnO<sub>4</sub>（先標定）；答案欄在電位滴定曲線旁。', '25.00 mL of iron(II) of unknown concentration, with the same KMnO<sub>4</sub> (standardise it first); the answer box is next to the titration curve.')
    }[sys];
    $('sysInfo').innerHTML = info;
    $('caRow').hidden = sys === 'std' || sys === 'mx';
    $('massRow').hidden = sys !== 'std';
    $('cbRow').hidden = sys === 'std' || sys === 'mx';
    $('mysCard').hidden = !(sys === 'std' || sys === 'mx');
    if (sys === 'ox') setLabel('caLabel', '草酸 H<sub>2</sub>C<sub>2</sub>O<sub>4</sub> 的濃度', 'Concentration of oxalic acid H<sub>2</sub>C<sub>2</sub>O<sub>4</sub>');
    else setLabel('caLabel', 'Fe<sup>2+</sup> 的濃度', 'Concentration of Fe<sup>2+</sup>');
    if (sys === 'std') setLabel('vaLabel', '溶解草酸用的蒸餾水', 'Distilled water to dissolve it');
    else setLabel('vaLabel', '待測液的體積（移液管）', 'Volume of the sample (pipette)');
    const th = $('theory');
    th.disabled = mysteryHidden();
    th.checked = !th.disabled && state.theory;
    th.parentElement.style.opacity = th.disabled ? '0.5' : '';
    th.parentElement.title = th.disabled ? T('KMnO4 的濃度揭曉後才能看理論曲線', 'Available after the answers are revealed') : '';
  }
  function renderAll() {
    renderReadouts(); renderAnalysis(); renderTable(); renderLegend(); renderSysInfo(); updateButtons();
    drawGraph(); kick();
  }
  function updateButtons() {
    const r = state.run;
    if (!r) return;
    const tb = $('tap');
    tb.setAttribute('aria-pressed', String(state.tap));
    tb.textContent = state.tap ? T('關閉活栓', 'Close stopcock') : T('打開活栓', 'Open stopcock');
    $('ffBtn').setAttribute('aria-pressed', String(state.ff));
    $('ffBtn').textContent = state.ff ? T('快轉等待中（按一下停止）', 'Fast-forward on (tap to stop)') : T('快轉等待', 'Fast-forward');
    ['drop', 'half', 'tap'].forEach(function (id) { $(id).disabled = state.ff; });
    $('endBtn').disabled = r.endpoint != null;
    $('endBtn').title = r.endpoint != null ? T('這一瓶的終點已經記錄了；要重做請按「換一瓶」', 'The end point of this flask is recorded; press “New flask” to repeat') : '';
  }

  // ======================= 狀態列 =======================
  let holdUntil = 0;
  function showStatus(msg, warn) {
    const el = $('status');
    el.textContent = msg;
    el.classList.toggle('warn', !!warn);
  }
  function setStatus(msg, warn) { showStatus(msg, warn); holdUntil = performance.now() + 3500; }
  function routineStatus(msg) { if (performance.now() >= holdUntil) showStatus(msg, false); }

  // ======================= 音效（預設關閉；主要頻率都在 300 Hz 以上） =======================
  const SND = function () { return window.LabSound; };
  let lastDrop = 0;
  function sndDrop(n) {
    const now = performance.now();
    if (now - lastDrop < 75 || (state.tap && state.rate > STREAM_RATE)) return;
    lastDrop = now;
    if (SND()) SND().sweep({ from: n >= DROP ? 650 : 850, to: n >= DROP ? 1400 : 1750, dur: 0.07, type: 'sine', gain: 0.16 });
  }
  function sndStream() { if (SND()) SND().noise({ dur: 0.12, gain: 0.06, filter: 2400, q: 0.8 }); }
  function sndColour() {
    if (!SND()) return;
    SND().tone({ freq: 784, dur: 0.32, type: 'sine', gain: 0.13 });
    SND().tone({ freq: 1047, dur: 0.36, type: 'sine', gain: 0.11, delay: 0.07 });
    SND().tone({ freq: 1319, dur: 0.42, type: 'triangle', gain: 0.07, delay: 0.14 });
  }
  function sndHold() {
    if (!SND()) return;
    SND().tone({ freq: 1047, dur: 0.18, type: 'sine', gain: 0.1 });
    SND().tone({ freq: 1568, dur: 0.3, type: 'sine', gain: 0.09, delay: 0.12 });
  }
  function sndRecord() { if (SND()) SND().tone({ freq: 1000, dur: 0.12, type: 'square', gain: 0.1 }); }
  function sndEmpty() { if (SND()) SND().sweep({ from: 520, to: 300, dur: 0.25, type: 'triangle', gain: 0.14 }); }
  function sndRefill() { if (SND()) SND().noise({ dur: 0.4, gain: 0.12, filter: 1300, q: 0.9 }); }
  function sndClick() { if (SND()) SND().tone({ freq: 1320, dur: 0.03, type: 'square', gain: 0.08 }); }
  function sndCheck(ok) {
    if (!SND()) return;
    if (ok) { SND().tone({ freq: 880, dur: 0.14, type: 'sine', gain: 0.12 }); SND().tone({ freq: 1320, dur: 0.2, type: 'sine', gain: 0.1, delay: 0.1 }); }
    else SND().sweep({ from: 600, to: 380, dur: 0.22, type: 'triangle', gain: 0.12 });
  }

  // ======================= 控制項 =======================
  const caEl = $('ca'), massEl = $('mass'), vaEl = $('va'), vacidEl = $('vacid'), cbEl = $('cb'), tempEl = $('temp'), rateEl = $('rate');
  // 濃度：對數刻度（滑桿位置 0–300，兩個數量級）
  function logMap(lo) {
    return {
      toValue: function (pos) { return roundSig(lo * Math.pow(10, pos / 150), 3); },
      toPos: function (v) { return 150 * Math.log10(Math.max(lo, v) / lo); },
      min: lo, max: lo * 100, decimals: 4
    };
  }
  if (window.LabNum) { window.LabNum.register(caEl, logMap(0.005)); window.LabNum.register(cbEl, logMap(0.001)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function readSliders() {
    state.Ca = clamp(val(caEl), 0.005, 0.5);
    state.mass = clamp(val(massEl), 0.05, 0.4);
    state.Va = clamp(val(vaEl), 5, 50);
    state.Vacid = clamp(val(vacidEl), 0, 20);
    state.Cb = clamp(val(cbEl), 0.001, 0.1);
    state.T = clamp(Math.round(val(tempEl)), 20, 95);
    state.rate = clamp(val(rateEl), 0.1, 2);
    $('cao').textContent = conc(state.Ca) + ' M';
    $('masso').textContent = state.mass.toFixed(4) + ' g';
    $('vao').textContent = state.Va.toFixed(2) + ' mL';
    $('vacido').textContent = state.Vacid.toFixed(1) + ' mL';
    $('cbo').textContent = conc(state.Cb) + ' M';
    $('tempo').textContent = state.T.toFixed(0) + ' °C';
    $('rateo').textContent = state.rate.toFixed(2) + ' mL/s';
  }
  function runOpts() {
    return { sys: state.sys, Ca: state.Ca, Va: state.Va, Vacid: state.Vacid, Cb: state.Cb, T: state.T, mass: state.mass, meter: state.meter };
  }
  function newRun(keepOld) {
    closeTap();
    state.drops = []; state.plumes = []; state.ripples = []; state.bubbles = []; state.pendingSettle = false; state.tag = null; state.flash = 0;
    if (state.ff) setFF(false);
    K.newRun(state.S, runOpts(), keepOld);
    const r = state.run;
    r.pts[0].c = flaskRGB(r.f);
    r.rows[0].c = r.pts[0].c;
    latestRow = false;
    if (L) buildStatic();
  }
  function settingsChanged() {
    const p = state.run.p;
    if (p.Va !== state.Va || p.Vacid !== state.Vacid || p.T !== state.T) return true;
    if (state.sys === 'std') return p.mass !== state.mass;
    if (state.sys === 'mx') return false;
    return p.Ca !== state.Ca || p.Cb !== state.Cb;
  }
  function freshFlaskNote() {
    const r = state.run, p = r.p, room = VT_MAX - p.Va - p.Vacid, hid = mysteryHidden();
    if (!hid && r.Veq > room) return T('注意：當量點需要的 KMnO4 超過錐形瓶的容量，到不了當量點。', 'Note: the flask cannot hold enough KMnO4 to reach the equivalence point.');
    if (!hid && r.Veq > K.BURETTE_ML) return T('當量點需要 ' + r.Veq.toFixed(2) + ' mL，超過滴定管的 50 mL：中途要按「補充滴定液」。', 'The equivalence point needs ' + r.Veq.toFixed(2) + ' mL, more than the 50 mL burette holds: refill it on the way.');
    if (p.Vacid === 0) return T('沒有加硫酸：看看會發生什麼事。', 'No sulfuric acid: see what happens.');
    if (!isFe(p.sys) && p.T > K.T_DEC) return T('超過 85 °C：草酸會慢慢分解，結果會偏低。', 'Above 85 °C oxalic acid slowly decomposes and the result comes out low.');
    if (!isFe(p.sys) && p.T < 50) return T('提醒：草酸要加熱到 60–70 °C 才反應得夠快。', 'Tip: oxalic acid needs 60–70 °C to react fast enough.');
    return '';
  }
  [caEl, massEl, vaEl, vacidEl, cbEl, tempEl].forEach(function (el) {
    const on = function () {
      readSliders();
      if (!settingsChanged()) return;
      const had = state.run.u > 0;
      newRun();
      renderAll();
      const note = freshFlaskNote();
      setStatus(note || (had ? T('換了一瓶新的溶液，上一瓶的曲線留在圖上。', 'A fresh flask; the previous curve stays on the graph.') : T('換了一瓶新的溶液。', 'A fresh flask.')), /85|容量|hold enough/.test(note));
    };
    el.addEventListener('input', on);
    el.addEventListener('change', on);
  });
  rateEl.addEventListener('input', readSliders);
  rateEl.addEventListener('change', readSliders);

  function pressGroup(sel, attr, value) {
    document.querySelectorAll(sel).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(value))); });
  }
  document.querySelectorAll('#sysSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      const sys = b.getAttribute('data-sys');
      if (sys === state.sys) return;
      state.sys = sys;
      pressGroup('#sysSeg button', 'data-sys', sys);
      // 標定、未知 Fe2+：取樣 25.00 mL（標定時是溶解草酸的水），硫酸 10 mL；草酸類預設加熱到 65 °C
      if (sys === 'mx' || sys === 'std') { if (window.LabNum) { window.LabNum.set(vaEl, 25); } }
      if (!isFe(sys) && state.T < 50 && window.LabNum) window.LabNum.set(tempEl, 65);
      if (isFe(sys) && state.T !== 25 && window.LabNum) window.LabNum.set(tempEl, 25);
      readSliders();
      newRun();
      renderAll();
      const note = freshFlaskNote();
      const tips = {
        fe: T('Fe2+＋KMnO4：每一滴立刻褪色，多出來的第一滴讓整瓶變粉紅。', 'Fe2+ + KMnO4: every drop loses its colour at once, and the first one in excess turns the flask pink.'),
        ox: T('草酸＋KMnO4：加熱板調到 65 °C 了。注意第一滴褪色要多久，之後又多快。', 'Oxalic acid + KMnO4: the hot plate is at 65 °C. Watch how long the first drop takes to fade, and how fast later ones go.'),
        std: T('標定：精稱的草酸晶體溶在水中，加硫酸、加熱，用濃度未知的 KMnO4 滴定。', 'Standardisation: weighed oxalic acid dissolved in water, acidified and heated, titrated with the KMnO4 of unknown concentration.'),
        mx: T('未知 Fe2+：用同一瓶 KMnO4 滴定 25.00 mL 的未知樣品。', 'Unknown Fe2+: titrate 25.00 mL of the unknown with the same KMnO4.')
      };
      setStatus(note && /容量|hold enough/.test(note) ? note : tips[sys], false);
    });
  });
  $('meter').addEventListener('change', function () {
    state.meter = $('meter').checked;
    const r = state.run;
    if (state.meter) {
      if (r.u > 0) {
        r.meterUsed = true;
        r.pts.push({ u: r.u, E: r.E, m: true, c: flaskRGB(r.f) });
        settleIfIdle();
      } else { r.pts[0].m = true; r.rows[0].E = r.E; }
    } else if (r.u === 0) { r.pts[0].m = false; r.rows[0].E = null; }
    sndClick();
    renderAll();
    if (!state.meter) setStatus(T('鉑電極放回蒸餾水中了：現在只能看溶液的顏色判斷終點。', 'The platinum electrode is back in the distilled water: now only the colour tells you the end point.'));
  });
  function settleIfIdle() {
    if (state.tap || state.drops.length) { state.pendingSettle = true; return; }
    settle();
  }
  $('theory').addEventListener('change', function () { state.theory = $('theory').checked; renderLegend(); drawGraph(); });
  $('deriv').addEventListener('change', function () { state.deriv = $('deriv').checked; renderLegend(); drawGraph(); });

  // ---- 加滴定液 ----
  function addButton(n) {
    if (state.ff) return;
    const r = state.run;
    const left = K.BURETTE_UNITS - r.fill;
    if (left <= 0) { emptyNotice(); return; }
    if (n > left) setStatus(T('滴定管只剩半滴了。', 'Only half a drop left in the burette.'));
    release(n, true);
  }
  $('drop').addEventListener('click', function () { addButton(DROP); });
  $('half').addEventListener('click', function () { addButton(HALF); });
  $('tap').addEventListener('click', function () {
    if (state.ff) return;
    if (state.tap) {
      closeTap();
      const air = state.drops.reduce(function (s, d) { return s + d.n; }, 0) / U;
      setStatus(air >= 0.05
        ? T('活栓關上了，滴定管讀數 ' + vRead(state.run.fill) + ' mL。已經在空中的約 ' + air.toFixed(2) + ' mL 還會落進瓶裡，讀數已經算進去了。', 'Stopcock closed at a burette reading of ' + vRead(state.run.fill) + ' mL. About ' + air.toFixed(2) + ' mL already in the air will still fall into the flask; the reading already includes it.')
        : T('活栓關上了，滴定管讀數 ' + vRead(state.run.fill) + ' mL。', 'Stopcock closed at a burette reading of ' + vRead(state.run.fill) + ' mL.'));
      kick(); return;
    }
    if (K.BURETTE_UNITS - state.run.fill <= 0) { emptyNotice(); return; }
    state.tap = true; state.acc = 0;
    sndClick();
    updateButtons();
    setStatus(isFe(state.run.p.sys)
      ? T('活栓打開了，流速 ' + state.rate.toFixed(2) + ' mL/s。快到終點前記得關上，改成一滴一滴加。', 'Stopcock open at ' + state.rate.toFixed(2) + ' mL/s. Close it before the end point and go drop by drop.')
      : T('活栓打開了，流速 ' + state.rate.toFixed(2) + ' mL/s。草酸一開始反應很慢，太快加紫色會積起來。', 'Stopcock open at ' + state.rate.toFixed(2) + ' mL/s. Oxalic acid reacts slowly at first: add too fast and the purple builds up.'));
    kick();
  });
  $('ffBtn').addEventListener('click', function () {
    const on = !state.ff;
    if (on && state.run.u === 0) { setStatus(T('還沒有加入 KMnO4，沒有東西要等。', 'No KMnO4 added yet: nothing to wait for.')); return; }
    setFF(on);
    sndClick();
    if (on) setStatus(T('快轉等待：時間快 20 倍（活栓關上，暫時不能加液）。再按一下停止。', 'Fast-forward: time runs 20 times faster (stopcock closed, no titrant can be added). Tap again to stop.'));
  });
  $('endBtn').addEventListener('click', function () {
    const r = state.run;
    if (r.endpoint != null) return;
    if (r.out === 0) { setStatus(T('還沒有加入 KMnO4。', 'No KMnO4 has been added yet.'), true); return; }
    closeTap();
    if (state.ff) setFF(false);
    // 空中的液滴先落下（終點體積是滴定管流出的總量）
    state.drops.splice(0).forEach(land);
    if (state.pendingSettle) { state.pendingSettle = false; settle(); }
    const d = K.endpoint(state.S, state.meter);
    sndRecord();
    renderAll();
    const hid = mysteryHidden();
    setStatus(T('記錄終點：' + vRead(r.out) + ' mL', 'End point recorded: ' + vRead(r.out) + ' mL') +
      (hid ? T('。用它算出濃度，再填進答案欄。', '. Use it to work out the concentration and fill in the answer box.') :
        T('；當量點 ' + r.Veq.toFixed(2) + ' mL，相差 ' + signed(d.err, 3) + ' mL。', '; equivalence point ' + r.Veq.toFixed(2) + ' mL, difference ' + signed(d.err, 3) + ' mL.')) +
      (!d.pink ? T('（溶液還沒有變粉紅色）', ' (the solution is not pink yet)') : (d.held < HOLD ? T('（粉紅色還沒維持 30 秒）', ' (the pink has not lasted 30 s yet)') : '')));
    emit('endpoint', d);
  });
  $('refill').addEventListener('click', function () {
    const r = state.run;
    if (r.fill === 0) { setStatus(T('滴定管已經是滿的（0.00 mL）。', 'The burette is already full (0.00 mL).')); return; }
    closeTap();
    r.fill = 0;
    sndRefill();
    renderAll();
    setStatus(T('滴定管重新裝滿、調到 0.00 mL。終點的體積是每一管流出的量加起來（這裡自動累計）。', 'Burette refilled to 0.00 mL. The end-point volume is the sum of what each filling delivered (added up automatically here).'));
  });
  $('newFlask').addEventListener('click', function () {
    const had = state.run.u > 0;
    newRun();
    renderAll();
    const note = freshFlaskNote();
    setStatus(note || (had ? T('換上一瓶新的溶液（上一瓶的曲線留在圖上），滴定管也重新裝滿了。', 'A fresh flask (the previous curve stays on the graph), and the burette is refilled.') : T('換上一瓶新的溶液。', 'A fresh flask.')));
  });
  $('clearAll').addEventListener('click', function () {
    closeTap();
    if (state.ff) setFF(false);
    state.drops = []; state.plumes = []; state.ripples = []; state.bubbles = []; state.pendingSettle = false;
    K.clearAll(state.S, runOpts());
    const r = state.run;
    r.pts[0].c = flaskRGB(r.f); r.rows[0].c = r.pts[0].c;
    hover = null; latestRow = false;
    if (L) buildStatic();
    renderAll();
    setStatus(T('曲線、數據表與終點都清除了；濃度、體積與溫度的設定沒有改變。', 'Curves, data table and end point cleared; the concentrations, volumes and temperature are unchanged.'));
  });

  // ---- 未知樣品 ----
  function parseNum(s) {
    s = String(s || '').trim().replace(/[，,]/g, '.').replace(/[×x]\s*10\^?\s*([−-]?\d+)/i, 'e$1').replace(/−/g, '-').replace(/\s*M$/i, '');
    if (!s) return NaN;
    const v = Number(s);
    return isFinite(v) ? v : NaN;
  }
  $('check').addEventListener('click', function () {
    const s = state.S.sample;
    const cMn = parseNum($('ansMn').value), cFe = parseNum($('ansFe').value);
    const okMn = cMn > 0, okFe = cFe > 0;
    if (!okMn && !okFe) { $('mysOut').innerHTML = T('請填入 KMnO<sub>4</sub> 或 Fe<sup>2+</sup> 的濃度（M）。', 'Enter a concentration (M) for KMnO<sub>4</sub> or Fe<sup>2+</sup>.'); return; }
    const d = K.answer(state.S, okMn ? cMn : NaN, okFe ? cFe : NaN);
    const parts = [];
    if (okMn) parts.push(Math.abs(d.errMn) <= 0.005 ? '<span class="ok">' + T('KMnO<sub>4</sub>：誤差在 0.5% 以內 ✓', 'KMnO<sub>4</sub>: within 0.5% ✓') + '</span>' : '<span class="no">' + T('KMnO<sub>4</sub>：誤差超過 0.5%', 'KMnO<sub>4</sub>: more than 0.5% off') + '</span>');
    if (okFe) parts.push(Math.abs(d.errFe) <= 0.01 ? '<span class="ok">' + T('Fe<sup>2+</sup>：誤差在 1% 以內 ✓', 'Fe<sup>2+</sup>: within 1% ✓') + '</span>' : '<span class="no">' + T('Fe<sup>2+</sup>：誤差超過 1%', 'Fe<sup>2+</sup>: more than 1% off') + '</span>');
    parts.push(T('這組樣品：標定用了 ' + s.flasks.std + ' 瓶，未知 Fe<sup>2+</sup> 用了 ' + s.flasks.mx + ' 瓶。', 'This set: ' + s.flasks.std + ' standardisation flask' + (s.flasks.std === 1 ? '' : 's') + ', ' + s.flasks.mx + ' unknown iron(II) flask' + (s.flasks.mx === 1 ? '' : 's') + '.') + (s.revealed ? T('（已揭曉，不算任務）', ' (revealed: no missions)') : ''));
    $('mysOut').innerHTML = parts.join('<br>');
    sndCheck((!okMn || Math.abs(d.errMn) <= 0.005) && (!okFe || Math.abs(d.errFe) <= 0.01));
    emit('answer', d);
  });
  $('reveal').addEventListener('click', function () {
    const s = state.S.sample;
    s.revealed = true;
    renderAll();
    $('mysOut').innerHTML = T('答案：c(KMnO<sub>4</sub>) = ', 'Answer: c(KMnO<sub>4</sub>) = ') + s.Cb.toFixed(4) + ' M' + T('、c(Fe<sup>2+</sup>) = ', ', c(Fe<sup>2+</sup>) = ') + s.CFe.toFixed(3) + ' M' +
      T('。圖上已標出當量點。', '. The equivalence point is now marked on the graph.');
  });
  $('newMys').addEventListener('click', function () {
    K.newSample(state.S);
    if (state.sys === 'std' || state.sys === 'mx') newRun();
    $('ansMn').value = ''; $('ansFe').value = '';
    $('mysOut').textContent = T('換了一組新的未知樣品（第 ' + state.S.sample.no + ' 組）：KMnO4 和 Fe2+ 的濃度都換了。', 'A new set of unknowns (set ' + state.S.sample.no + '): both the KMnO4 and the Fe2+ concentrations have changed.');
    renderAll();
  });
  ['ansMn', 'ansFe'].forEach(function (id) {
    $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('check').click(); } });
  });

  // ---- 喇叭按鈕 ----
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

  /** 換一瓶新的，直接加到 u 個單位（滴定管讀數 f 個單位）：分享連結還原、縮圖用；不回報任務事件、不留下任務用的紀錄 */
  function jumpTo(u, fill) {
    newRun(false);
    const S = state.S, r = state.run, p = r.p;
    const maxU = Math.floor((VT_MAX - p.Va - p.Vacid) * U);
    u = Math.max(0, Math.min(maxU, Math.round(+u || 0)));
    const keepFirsts = S.firsts.slice(), keepAt2 = S.at2.slice(), keepNo = S.flaskNo, sample = r.sample;
    if (sample) r.sample = null;
    for (let k = 0; k < u;) {
      const n = Math.min(DROP, u - k);
      K.release(S, n, state.meter);
      if (r.fill >= K.BURETTE_UNITS) r.fill = 0;
      K.land(S, n, state.meter);
      r.pts[r.pts.length - 1].c = flaskRGB(r.f);
      k += n;
    }
    if (!isFe(p.sys) && u > 0) { K.tick(S, 3600); r.pts[r.pts.length - 1].c = flaskRGB(r.f); }
    r.fill = Math.max(0, Math.min(K.BURETTE_UNITS, Math.round(fill == null ? r.out : +fill || 0)));
    if (u > 0) {
      r.rows.push({ u: r.u, E: state.meter ? r.E : null, pink: K.pink(r.f), c: flaskRGB(r.f) });
      r.f.ep = r.f.ep ? Object.assign(r.f.ep, { t0: r.f.t }) : null;   // 粉紅色從現在開始計時
    }
    r.sample = sample;
    S.firsts = keepFirsts; S.at2 = keepAt2; S.flaskNo = Math.max(keepNo, r.no || 0);
    r.halfSeen = false; r.firstDur = null;
    renderAll();
  }
  // 縮圖工具（tools/make-thumbs.cjs）用：__rt.jump(25.05) 直接加到 25.05 mL
  window.__rt = { jump: function (mL) { jumpTo(Math.round(mL * U)); } };

  // ---------- 分享目前設定：已加入的滴定液（標定與未知樣品不分享，免得洩漏答案） ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      const r = state.run;
      return (state.sys === 'std' || state.sys === 'mx') ? null : { u: r.u, f: r.fill };
    },
    set: function (o) {
      if (!o || typeof o !== 'object' || state.sys === 'std' || state.sys === 'mx') return;
      jumpTo(o.u, o.f);
    }
  });

  // ======================= 啟動 =======================
  readColors();
  // 預設：0.100 M Fe2+ 25.00 mL＋3 M 硫酸 10 mL、0.0200 M KMnO4、25 °C、鉑電極在瓶中（直接設滑桿，載入時不回報任務事件）
  if (window.LabNum) { window.LabNum.set(caEl, 0.1); window.LabNum.set(cbEl, 0.02); window.LabNum.set(massEl, 0.1576); }
  readSliders();
  pressGroup('#sysSeg button', 'data-sys', state.sys);
  $('meter').checked = true; $('theory').checked = false; $('deriv').checked = false;
  newRun(false);
  updateSoundButton();
  function themeChanged() { readColors(); if (L) buildStatic(); renderAll(); }
  window.addEventListener('lab:themechange', themeChanged);
  if (window.matchMedia) {
    const dm = window.matchMedia('(prefers-color-scheme: dark)');
    if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  }
  const widths = new WeakMap();
  function observe(el, fn) {
    if (window.ResizeObserver) new ResizeObserver(function () { if (el.clientWidth !== widths.get(el)) { widths.set(el, el.clientWidth); fn(); } }).observe(el);
    window.addEventListener('resize', fn);
  }
  observe(cv, function () { resizeBench(); drawBench(); kick(); });
  observe(gcv, resizeGraph);
  resizeBench(); resizeGraph();
  renderAll();
  setStatus(T('預設：0.100 M Fe2+ 25.00 mL 加 10 mL 硫酸，滴定管裝 0.0200 M KMnO4。先打開活栓快速加，接近 25 mL 時改成一滴一滴。', 'Default: 25.00 mL of 0.100 M Fe2+ with 10 mL of sulfuric acid, 0.0200 M KMnO4 in the burette. Open the stopcock to add quickly, then go drop by drop near 25 mL.'));
  drawBench();
  kick();
})();
