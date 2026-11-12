/* measurement.js — 「測量與不確定度（游標尺與螺旋測微器）」的畫面與互動（讀數演算法、統計在 measurement-core.js） */
(function () {
  'use strict';
  const MC = window.MeasurementCore;
  const $ = function (id) { return document.getElementById(id); };
  // 介面文字：英文模式用第二個字串（settings.js）
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  // 滑桿讀值：打字輸入的精確值（numinput.js）優先
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const LD = window.LabDraw;
  const FONT = LD.FONT;
  const alpha = LD.alpha, shade = LD.shade, mix = LD.mix, roundRect = LD.roundRect;

  // ======================= 儀器尺寸（mm，依比例繪製） =======================
  // 游標尺：主尺 0 刻線＝固定外測爪的內面（x = 0）；y 往下為正，主尺上緣 y = 0。
  const CAL = {
    head: -24, top: 0, bot: 18, sy: 13,          // 主尺左端、上下緣、主尺與副尺的交界線
    plateBot: 21, bodyBot: 25.5, rim: -3.5,       // 副尺板下緣、滑框下緣、滑框頂邊
    BE: 150, sMax: 90,                            // 主尺右端（深度桿由此伸出）、最大張開
    ojTip: 64, ojW: 12, ijTip: -16, ijW: 3.4,     // 外測爪、內測爪
    rodY: 9, rodH: 1.8                            // 深度桿（在主尺背面的槽內）
  };
  // 螺旋測微器：測砧面 x = 0，軸線 y = 0；套筒 0 刻線在 x = xz；讀數 R 時套管邊緣在 xz + R。
  const MIC = { anvil: -6.5, rS: 3.2, arm: 28.5, boss: 37, rBoss: 5.6, rSl: 4.6, xz: 39.5, rTh: 8.4, rCh: 5.0, ch: 2.4, thL: 30, knurl: 15, rRa: 4.6, raL: 10, range: 25 };
  const ZOOM_BASE = 12.5;   // 放大鏡 ×1 = 12.5 px/mm
  const RATCHET = 0.01;     // 測軸碰到物體後，每多轉 0.01 mm 棘輪「喀」一聲

  // ======================= 狀態 =======================
  const rng = MC.mulberry32((Date.now() ^ 0x5bd1e995) >>> 0);
  const state = {
    mode: 'vernier', names: true, zoomV: 4, zoomM: 2,
    v: { N: 20, kind: 'outer', zeroOn: false, item: null, s: 30, zeroCheck: false, pan: null, overlay: null, anim: null, touching: false, checked: false },
    m: { kind: 'wire', zeroOn: false, item: null, s: 3, zeroCheck: false, overlay: null, anim: null, touching: false, clicks: 0, push: 0, checked: false },
    x: { instr: 'v20', sigma: 0.02, bias: 0, uMode: 'AB', rod: null, rodId: 0, sets: { v20: [], v50: [], micro: [] }, last: { v20: null, v50: null, micro: null } },
    score: null,
    fx: []
  };
  function newScore() {
    return {
      v: { ok: 0, tries: 0, run: [], best: 0 }, m: { ok: 0, tries: 0, run: [], best: 0 },
      count: { outer: 0, inner: 0, depth: 0, v20: 0, v50: 0, micro: 0, vPos: 0, vNeg: 0, mPos: 0, mNeg: 0 }
    };
  }
  state.score = newScore();
  const isVernierScene = function () { return state.mode === 'vernier' || (state.mode === 'multi' && state.x.instr !== 'micro'); };

  // ======================= 色彩（lab.css 代號衍生） =======================
  let C = {};
  function readColors() {
    const c = LD.c, d = LD.dark;
    const mu = c.muted, eq = c.equi, bg = c['canvas-bg'];
    C = {
      dark: d, bg: bg, text: c.text, muted: mu, accent: c.accent, pos: c.pos, neg: c.neg, probe: c.probe, equi: eq, surface: c.surface, border: c.border,
      steelHi: d ? shade(mu, 0.32) : shade(mu, 0.9),
      steel: d ? shade(mu, -0.05) : shade(mu, 0.66),
      steelLo: d ? shade(mu, -0.42) : shade(mu, 0.28),
      plate: d ? shade(mu, 0.1) : shade(mu, 0.78),
      body: d ? shade(mu, -0.22) : shade(mu, 0.5),
      ink: d ? shade(bg, -0.5) : shade(c.text, -0.45),
      enamel: d ? shade(c.neg, -0.42) : shade(c.neg, -0.3),
      plaque: d ? shade(eq, -0.35) : shade(eq, 0.8),
      brass: d ? shade(eq, -0.18) : shade(eq, 0.3),
      copper: d ? mix(eq, c.pos, 0.5) : shade(mix(eq, c.pos, 0.45), 0.05),
      paper: d ? mix(eq, bg, 0.45) : shade(eq, 0.86),
      wood: d ? shade(eq, -0.45) : shade(eq, 0.5),
      woodLo: d ? shade(eq, -0.62) : shade(eq, 0.22),
      rod: d ? mix(shade(mu, 0.05), c.neg, 0.18) : mix(shade(mu, 0.45), c.neg, 0.12),
      hole: d ? shade(bg, -0.4) : shade(mu, -0.55)
    };
  }

  // ======================= 數字格式 =======================
  const minus = function (s) { return String(s).replace('-', '−'); };
  const fx = function (x, d) { return minus(MC.fixed(x, d)); };
  const fxs = function (x, d) { const s = MC.fixed(x, d); return (/^-/.test(s) ? '−' + s.slice(1) : (parseFloat(s) === 0 ? '' : '+') + s); };
  const mmStr = function (um, d) { return fx(um / 1000, d); };
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 3;
    return v.toFixed(dec);
  }

  // ======================= 畫布 =======================
  const cv = $('cv'), cx = cv.getContext('2d');
  const hcv = $('hcv'), hx = hcv.getContext('2d');
  function setupCanvas(el, h) {
    const w = el.clientWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (el.style.height !== h + 'px') el.style.height = h + 'px';
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (el.width !== W) el.width = W;
    if (el.height !== H) el.height = H;
    return { w: w, h: h, dpr: dpr };
  }
  /** 刻線：寬 w（CSS px）的豎線，對齊裝置像素，確保銳利 */
  function vline(c, x, y0, y1, w) {
    const dpr = L.dpr;
    const wd = Math.max(1, Math.round(w * dpr));
    const xl = Math.round(x * dpr - wd / 2) / dpr;
    c.fillRect(xl, Math.min(y0, y1), wd / dpr, Math.abs(y1 - y0));
  }
  function hline(c, x0, x1, y, w) {
    const dpr = L.dpr;
    const wd = Math.max(1, Math.round(w * dpr));
    const yt = Math.round(y * dpr - wd / 2) / dpr;
    c.fillRect(Math.min(x0, x1), yt, Math.abs(x1 - x0), wd / dpr);
  }

  let L = null; // 版面
  function layout() {
    const W = cv.clientWidth || 360;
    const narrow = W < 560;
    const magH = isVernierScene() ? (narrow ? 150 : 176) : (narrow ? 230 : 260);
    let view, mainH;
    if (!isVernierScene()) {
      const k = Math.min((W - 16) / 122, 6.4);
      mainH = Math.round(47 * k) + 14;
      const ox = (W - 122 * k) / 2 + 22 * k;
      view = { k: k, kx: k, ky: k, X: function (x) { return ox + x * k; }, Y: function (y) { return 8 + (y + 13) * k; }, xinv: function (px) { return (px - ox) / k; } };
    } else {
      const depth = state.mode === 'vernier' && state.v.kind === 'depth';
      const span = depth ? 228 : 136;
      const k = Math.min((W - 16) / span, 3.6);
      mainH = Math.round(92 * k) + 14;
      let ox = 8 + 26 * k;
      if (W - 16 >= 228 * k) ox += ((W - 16) - 228 * k) / 2; // 整支放得下就置中
      view = { k: k, kx: k, ky: k, X: function (x) { return ox + x * k; }, Y: function (y) { return 7 + (y + 26) * k; }, xinv: function (px) { return (px - ox) / k; } };
    }
    const top = mainH + 22;
    const H = top + magH + 8;
    const s = setupCanvas(cv, H);
    L = { W: W, H: H, dpr: s.dpr, narrow: narrow, view: view, mainH: mainH, mag: { x: 8, y: top, w: W - 16, h: magH } };
  }
  function zoomNow() { return isVernierScene() ? state.zoomV : state.zoomM; }

  // ======================= 游標尺：繪圖 =======================
  function vScene() {
    if (state.mode === 'multi') {
      const X = state.x, I = MC.INSTR[X.instr], tr = X.rod.trueUm / 1000, last = X.last[X.instr];
      return { N: I.N, kind: 'outer', s: last == null ? tr + 7 : tr, e: last == null ? 0 : (last - X.rod.trueUm) / 1000, size: tr, obj: 'rod', showObj: true, overlay: null, wall: 3, shadeSeed: 0.4 };
    }
    const V = state.v;
    return { N: V.N, kind: V.kind, s: V.s, e: V.item.zeroUm / 1000, size: V.item.sizeUm / 1000, obj: V.kind, showObj: !V.zeroCheck, overlay: V.overlay, wall: V.item.wallUm / 1000, shadeSeed: V.item.shade };
  }
  function sliderRight(N) { return MC.VERNIER[N].span + 9; }
  function steelGrad(c, y0, y1, hi, mid, lo) {
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, hi); g.addColorStop(0.18, mid); g.addColorStop(0.42, mix(mid, hi, 0.55)); g.addColorStop(0.62, mid); g.addColorStop(1, lo);
    return g;
  }
  function polyMM(c, V, pts) {
    c.beginPath();
    pts.forEach(function (p, i) { if (i) c.lineTo(V.X(p[0]), V.Y(p[1])); else c.moveTo(V.X(p[0]), V.Y(p[1])); });
    c.closePath();
  }
  function fillSteel(c, V, pts, y0, y1, edge) {
    polyMM(c, V, pts);
    c.fillStyle = steelGrad(c, V.Y(y0), V.Y(y1), C.steelHi, C.steel, C.steelLo);
    c.fill();
    c.strokeStyle = edge || alpha(C.steelLo, C.dark ? 0.9 : 0.75);
    c.lineWidth = 1;
    c.stroke();
  }
  function engr(V) { return Math.max(1 / L.dpr, Math.min(4, 0.07 * V.kx)); }

  /** 主尺（含刻度）與副尺（含副尺刻度）。mag：放大鏡（只畫刻度附近） */
  function drawBeamAndScales(c, V, d, mag) {
    const N = d.N, VN = MC.VERNIER[N], s = d.s, z0 = s + d.e;
    const xa = V.xinv(-4), xb = V.xinv(L.W + 4);
    // 主尺
    const b0 = Math.max(CAL.head, xa - 2), b1 = Math.min(CAL.BE, xb + 2);
    c.fillStyle = steelGrad(c, V.Y(CAL.top), V.Y(CAL.bot), C.steelHi, C.steel, C.steelLo);
    c.fillRect(V.X(b0), V.Y(CAL.top), V.X(b1) - V.X(b0), V.Y(CAL.bot) - V.Y(CAL.top));
    // 細緻的拉絲紋（只在放大鏡）
    if (mag) {
      c.save();
      c.globalAlpha = C.dark ? 0.06 : 0.08;
      c.fillStyle = C.dark ? '#000' : '#fff';
      for (let i = 0; i < 26; i++) {
        const yy = V.Y(CAL.top + 0.35 + i * 0.5 + ((i * 7919) % 5) * 0.05);
        c.fillRect(L.mag.x, yy, L.mag.w, 1 / L.dpr);
      }
      c.restore();
    }
    c.fillStyle = alpha('#ffffff', C.dark ? 0.12 : 0.55);
    c.fillRect(V.X(b0), V.Y(CAL.top), V.X(b1) - V.X(b0), Math.max(1 / L.dpr, 0.25 * V.ky));
    c.fillStyle = alpha(C.steelLo, 0.8);
    c.fillRect(V.X(b0), V.Y(CAL.bot) - 1, V.X(b1) - V.X(b0), 1);
    // 主尺刻度：每 1 mm 一條，5 mm 較長，10 mm 最長並標數字（cm）
    c.fillStyle = C.ink;
    const w = engr(V);
    const dense = V.kx < 1.9;
    const m0 = Math.max(0, Math.ceil(xa)), m1 = Math.min(CAL.BE - 3, Math.floor(xb));
    for (let m = m0; m <= m1; m++) {
      if (dense && m % 5) continue;
      const len = m % 10 === 0 ? 4.4 : m % 5 === 0 ? 3.0 : 2.0;
      vline(c, V.X(m), V.Y(CAL.sy - len), V.Y(CAL.sy), w);
    }
    const fsMain = mag ? 13 : Math.max(7.5, Math.min(11, 2.7 * V.k));
    c.font = '700 ' + fsMain + 'px ' + FONT;
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    for (let m = Math.ceil(m0 / 10) * 10; m <= m1; m += 10) c.fillText(String(m / 10), V.X(m), V.Y(CAL.sy - 4.4) - (mag ? 4 : 1.5));
    if (!mag && V.k >= 2) {
      c.font = '600 ' + (fsMain * 0.8) + 'px ' + FONT;
      c.textAlign = 'left';
      c.fillText('cm', V.X(Math.min(m1, CAL.BE - 6)) + 2, V.Y(CAL.sy - 4.4) - 1.5);
    }

    // 副尺：頂邊、副尺板、下方本體
    const R = sliderRight(N);
    if (!mag) {
      fillSteel(c, V, [[s - 6, CAL.rim], [s + R - 2, CAL.rim], [s + R - 2, CAL.top], [s - 6, CAL.top]], CAL.rim, CAL.top);
      // 固定螺絲
      const sx = s + Math.min(15, R - 8);
      c.fillStyle = steelGrad(c, V.Y(-7.5), V.Y(CAL.rim), C.steelHi, C.steel, C.steelLo);
      roundRect(c, V.X(sx - 3), V.Y(-7.5), 6 * V.kx, (7.5 + CAL.rim) * V.ky, Math.min(3, 1.2 * V.kx)); c.fill();
      c.strokeStyle = alpha(C.steelLo, 0.8); c.lineWidth = 1; c.stroke();
      c.strokeStyle = alpha(C.steelLo, 0.55);
      for (let i = 1; i < 6; i++) { const xx = V.X(sx - 3 + i); c.beginPath(); c.moveTo(xx, V.Y(-7.2)); c.lineTo(xx, V.Y(CAL.rim - 0.3)); c.stroke(); }
    }
    // 副尺板
    const pg = c.createLinearGradient(0, V.Y(CAL.sy), 0, V.Y(CAL.plateBot));
    pg.addColorStop(0, shade(C.plate, 0.12)); pg.addColorStop(0.5, C.plate); pg.addColorStop(1, shade(C.plate, -0.1));
    c.fillStyle = pg;
    c.fillRect(V.X(s - 7), V.Y(CAL.sy), (R + 7) * V.kx, (CAL.plateBot - CAL.sy) * V.ky);
    // 本體（副尺板下方）
    c.fillStyle = steelGrad(c, V.Y(CAL.plateBot), V.Y(CAL.bodyBot), shade(C.body, 0.25), C.body, shade(C.body, -0.25));
    c.beginPath();
    c.moveTo(V.X(s), V.Y(CAL.plateBot)); c.lineTo(V.X(s + R), V.Y(CAL.plateBot));
    c.lineTo(V.X(s + R), V.Y(CAL.bodyBot - 1.5));
    c.quadraticCurveTo(V.X(s + R), V.Y(CAL.bodyBot), V.X(s + R - 1.5), V.Y(CAL.bodyBot));
    c.lineTo(V.X(s), V.Y(CAL.bodyBot)); c.closePath(); c.fill();
    // 副尺板的邊線（斜面感）
    c.fillStyle = alpha('#ffffff', C.dark ? 0.18 : 0.6);
    c.fillRect(V.X(s - 7), V.Y(CAL.sy), (R + 7) * V.kx, Math.max(1 / L.dpr, 0.12 * V.ky));
    c.fillStyle = alpha(C.steelLo, 0.85);
    c.fillRect(V.X(s - 7), V.Y(CAL.plateBot) - 1 / L.dpr, (R + 7) * V.kx, 1 / L.dpr);
    vline(c, V.X(s - 7), V.Y(CAL.sy), V.Y(CAL.plateBot), 1 / L.dpr);
    vline(c, V.X(s + R), V.Y(CAL.sy), V.Y(CAL.bodyBot - 1), 1 / L.dpr);
    if (!mag) {
      // 拇指輪
      const tx = s + R - 7, ty = CAL.bodyBot + 0.6, tr = 3.6;
      const g = c.createRadialGradient(V.X(tx - 1), V.Y(ty - 1), 0.5, V.X(tx), V.Y(ty), tr * V.k);
      g.addColorStop(0, C.steelHi); g.addColorStop(1, C.steelLo);
      c.fillStyle = g;
      c.beginPath(); c.arc(V.X(tx), V.Y(ty), tr * V.k, 0, Math.PI); c.fill();
      c.strokeStyle = alpha(C.steelLo, 0.7); c.lineWidth = 1;
      for (let i = 1; i < 8; i++) { const a = Math.PI * i / 8; c.beginPath(); c.moveTo(V.X(tx) + Math.cos(a) * tr * V.k * 0.55, V.Y(ty) + Math.sin(a) * tr * V.k * 0.55); c.lineTo(V.X(tx) + Math.cos(a) * tr * V.k, V.Y(ty) + Math.sin(a) * tr * V.k); c.stroke(); }
    }
    // 副尺刻度：第 k 條在 z0 + k (N − 1)/N
    c.fillStyle = C.ink;
    if (V.kx * VN.div >= 1.4) {
      for (let k = 0; k <= N; k++) {
        const x = z0 + k * VN.div;
        if (x < xa - 1 || x > xb + 1) continue;
        const len = k % VN.label === 0 ? 3.0 : 2.0;
        vline(c, V.X(x), V.Y(CAL.sy), V.Y(CAL.sy + len), w);
      }
    }
    const showLab = mag || V.k >= 2.3;
    if (showLab) {
      const fsV = mag ? 12 : Math.max(6.5, Math.min(9, 2.3 * V.k));
      c.font = '700 ' + fsV + 'px ' + FONT;
      c.textAlign = 'center'; c.textBaseline = 'top';
      for (let k = 0; k <= N; k += VN.label) {
        const x = z0 + k * VN.div;
        if (x < xa - 2 || x > xb + 2) continue;
        c.fillText(String(k / VN.label), V.X(x), V.Y(CAL.sy + 3.0) + (mag ? 3 : 0.5));
      }
      if (mag || V.k >= 3) {
        c.font = '600 ' + (fsV * 0.85) + 'px ' + FONT;
        c.textAlign = 'left';
        c.fillText(N === 20 ? '0.05 mm' : '0.02 mm', V.X(z0 + N * VN.div) + (mag ? 10 : 3), V.Y(CAL.sy + 3.0) + (mag ? 3 : 0.5));
      }
    }
  }

  /** 外測爪、內測爪、深度桿與待測物（只在主畫面） */
  function drawCaliperParts(c, V, d) {
    const s = d.s, R = sliderRight(d.N);
    // ---- 內徑：圓管剖面（後壁先畫） ----
    if (d.showObj && d.obj === 'inner') {
      const D = d.size, w = d.wall;
      c.fillStyle = alpha(C.brass, C.dark ? 0.35 : 0.3);
      c.fillRect(V.X(0), V.Y(-21), D * V.k, 19.5 * V.k);
      const g = c.createLinearGradient(V.X(0), 0, V.X(D), 0);
      g.addColorStop(0, alpha(C.dark ? '#000' : C.text, 0.18)); g.addColorStop(0.5, alpha(C.dark ? '#000' : C.text, 0.02)); g.addColorStop(1, alpha(C.dark ? '#000' : C.text, 0.18));
      c.fillStyle = g;
      c.fillRect(V.X(0), V.Y(-21), D * V.k, 19.5 * V.k);
    }
    // ---- 深度：有孔木塊（剖面） ----
    if (d.obj === 'depth' && d.showObj) {
      const D = d.size, x0 = CAL.BE, x1 = CAL.BE + D + 14, y0 = -6, y1 = 24, hy0 = CAL.rodY - 4, hy1 = CAL.rodY + 4;
      LD.contactShadow(c, V.X((x0 + x1) / 2), V.Y(y1), (x1 - x0) * V.k * 0.5, 0);
      c.save();
      c.beginPath();
      c.rect(V.X(x0), V.Y(y0), (x1 - x0) * V.k, (y1 - y0) * V.k);
      c.rect(V.X(x0), V.Y(hy0), D * V.k, (hy1 - hy0) * V.k);
      const g = c.createLinearGradient(0, V.Y(y0), 0, V.Y(y1));
      g.addColorStop(0, shade(C.wood, 0.12)); g.addColorStop(1, C.woodLo);
      c.fillStyle = g;
      c.fill('evenodd');
      c.clip('evenodd');
      c.strokeStyle = alpha(C.woodLo, C.dark ? 0.7 : 0.45);
      c.lineWidth = 1;
      for (let t = -40; t < 80; t += 2.2) { c.beginPath(); c.moveTo(V.X(x0 + t), V.Y(y1)); c.lineTo(V.X(x0 + t + 30), V.Y(y0)); c.stroke(); }
      c.restore();
      c.fillStyle = C.hole;
      c.fillRect(V.X(x0), V.Y(hy0), D * V.k, (hy1 - hy0) * V.k);
      c.strokeStyle = alpha(C.woodLo, 0.9); c.lineWidth = 1;
      c.strokeRect(V.X(x0) + 0.5, V.Y(y0) + 0.5, (x1 - x0) * V.k - 1, (y1 - y0) * V.k - 1);
    }
    // ---- 固定外測爪（主尺左端） ----
    fillSteel(c, V, [[CAL.head, CAL.top], [0, CAL.top], [0, CAL.top], [0, 58], [-1.6, CAL.ojTip], [-4.5, CAL.ojTip - 1], [-CAL.ojW, 40], [-CAL.ojW, CAL.bot], [CAL.head, CAL.bot]], 0, CAL.ojTip);
    // 固定內測爪（量測面在左邊 x = 0）
    fillSteel(c, V, [[0, CAL.top], [0, CAL.ijTip + 1.5], [0.5, CAL.ijTip], [CAL.ijW, CAL.ijTip + 5.5], [CAL.ijW, CAL.top]], CAL.ijTip, CAL.top);
    // 主尺左端的圓角頭
    c.fillStyle = steelGrad(c, V.Y(CAL.top), V.Y(CAL.bot), C.steelHi, C.steel, C.steelLo);
    roundRect(c, V.X(CAL.head), V.Y(CAL.top), 6 * V.k, (CAL.bot - CAL.top) * V.k, 2 * V.k); c.fill();
    // ---- 深度桿 ----
    if (s > 0.01) {
      const x0 = CAL.BE, x1 = CAL.BE + s;
      const g = c.createLinearGradient(0, V.Y(CAL.rodY - CAL.rodH / 2), 0, V.Y(CAL.rodY + CAL.rodH / 2));
      g.addColorStop(0, C.steelHi); g.addColorStop(1, C.steelLo);
      c.fillStyle = g;
      c.fillRect(V.X(x0), V.Y(CAL.rodY - CAL.rodH / 2), (x1 - x0) * V.k, CAL.rodH * V.k);
    }
    // 主尺右端面
    c.fillStyle = alpha(C.steelLo, 0.9);
    c.fillRect(V.X(CAL.BE) - 1, V.Y(CAL.top), 1.5, (CAL.bot - CAL.top) * V.k);
  }
  function drawMovingJaws(c, V, d) {
    const s = d.s;
    // 活動內測爪（量測面在右邊 x = s）
    fillSteel(c, V, [[s, CAL.rim], [s, CAL.ijTip + 1.5], [s - 0.5, CAL.ijTip], [s - CAL.ijW, CAL.ijTip + 5.5], [s - CAL.ijW, CAL.rim]], CAL.ijTip, CAL.rim);
    // 活動外測爪（量測面在左邊 x = s）
    fillSteel(c, V, [[s, CAL.bodyBot - 0.5], [s, 58], [s + 1.6, CAL.ojTip], [s + 4.5, CAL.ojTip - 1], [s + CAL.ojW, 40], [s + CAL.ojW, CAL.bodyBot - 0.5]], CAL.bodyBot, CAL.ojTip);
  }
  /** 圓棒往畫面後方延伸的側面（斜投影）：畫在游標尺之前，才會被夾爪擋住 */
  function drawRodBack(c, V, d) {
    if (!d.showObj || (d.obj !== 'outer' && d.obj !== 'rod')) return;
    const r = d.size / 2, xc = r, yc = CAL.plateBot + r + 1.2, R = r * V.k;
    const ox = Math.min(5, r * 0.5) * V.k * 0.62, oy = -Math.min(5, r * 0.5) * V.k * 0.5;
    const a0 = Math.atan2(-ox, oy) , a1 = a0 + Math.PI; // 與位移方向垂直的兩個切點
    const g = c.createLinearGradient(V.X(xc) + R * Math.cos(a0), V.Y(yc) + R * Math.sin(a0), V.X(xc) + R * Math.cos(a1), V.Y(yc) + R * Math.sin(a1));
    g.addColorStop(0, shade(C.rod, 0.25)); g.addColorStop(0.5, shade(C.rod, -0.1)); g.addColorStop(1, shade(C.rod, -0.45));
    c.fillStyle = g;
    c.beginPath();
    c.arc(V.X(xc) + ox, V.Y(yc) + oy, R, a0, a1, false);
    c.arc(V.X(xc), V.Y(yc), R, a1, a0, false);
    c.closePath(); c.fill();
    c.strokeStyle = alpha(shade(C.rod, -0.55), 0.6); c.lineWidth = 1;
    c.beginPath(); c.arc(V.X(xc) + ox, V.Y(yc) + oy, R - 0.5, a0, a1, false); c.stroke();
  }
  function drawVernierObjects(c, V, d) {
    if (!d.showObj) return;
    if (d.obj === 'outer' || d.obj === 'rod') {
      // 圓棒的端面（軸線垂直畫面），夾在外測爪之間
      const r = d.size / 2, xc = r, yc = CAL.plateBot + r + 1.2;
      const R = r * V.k;
      const g = c.createRadialGradient(V.X(xc) - R * 0.3, V.Y(yc) - R * 0.35, R * 0.05, V.X(xc), V.Y(yc), R);
      g.addColorStop(0, shade(C.rod, 0.55)); g.addColorStop(0.55, C.rod); g.addColorStop(1, shade(C.rod, -0.3));
      c.fillStyle = g;
      c.beginPath(); c.arc(V.X(xc), V.Y(yc), R, 0, Math.PI * 2); c.fill();
      // 車削的同心紋
      c.strokeStyle = alpha(shade(C.rod, -0.4), 0.25); c.lineWidth = 1;
      for (let q = 0.3; q < 1; q += 0.22) { c.beginPath(); c.arc(V.X(xc), V.Y(yc), R * q, 0, Math.PI * 2); c.stroke(); }
      c.strokeStyle = alpha(shade(C.rod, -0.5), 0.8);
      c.beginPath(); c.arc(V.X(xc), V.Y(yc), R - 0.5, 0, Math.PI * 2); c.stroke();
    } else if (d.obj === 'inner') {
      // 圓管剖面的兩道管壁（剖面線）
      const D = d.size, w = d.wall;
      [[-w, 0], [D, D + w]].forEach(function (p) {
        c.save();
        c.beginPath(); c.rect(V.X(p[0]), V.Y(-21), (p[1] - p[0]) * V.k, 19.5 * V.k);
        const g = c.createLinearGradient(V.X(p[0]), 0, V.X(p[1]), 0);
        g.addColorStop(0, shade(C.brass, 0.25)); g.addColorStop(1, shade(C.brass, -0.15));
        c.fillStyle = g; c.fill();
        c.clip();
        c.strokeStyle = alpha(shade(C.brass, -0.5), 0.55); c.lineWidth = 1;
        for (let t = -25; t < 25; t += 1.6) { c.beginPath(); c.moveTo(V.X(p[0] + t), V.Y(-1.5)); c.lineTo(V.X(p[0] + t + 20), V.Y(-21.5)); c.stroke(); }
        c.restore();
        c.strokeStyle = alpha(shade(C.brass, -0.55), 0.9); c.lineWidth = 1;
        c.strokeRect(V.X(p[0]) + 0.5, V.Y(-21) + 0.5, (p[1] - p[0]) * V.k - 1, 19.5 * V.k - 1);
      });
    }
  }

  /** 標籤（部件名稱）：帶引線的小底框 */
  function tag(c, text, ax, ay, lx, ly, align, color) {
    c.save();
    c.strokeStyle = alpha(color || C.muted, 0.7);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(lx, ly); c.stroke();
    c.fillStyle = color || C.muted;
    c.beginPath(); c.arc(ax, ay, 1.8, 0, Math.PI * 2); c.fill();
    c.restore();
    const fs = L.narrow ? 10.5 : 11.5;
    return LD.pill(c, text, align === 'right' ? lx + 2 : align === 'left' ? lx - 2 : lx, ly + (fs + 4) / 2, color || C.text, align, '600 ' + fs + 'px ' + FONT);
  }

  function drawVernierMain(c) {
    const d = vScene(), V = L.view;
    c.save();
    c.beginPath(); c.rect(0, 0, L.W, L.mainH); c.clip();
    drawRodBack(c, V, d);
    drawCaliperParts(c, V, d);
    drawBeamAndScales(c, V, d, false);
    drawMovingJaws(c, V, d);
    drawVernierObjects(c, V, d);
    // 接觸的瞬間：小波紋
    drawFx(c);
    // 放大鏡的取景框
    const z = ZOOM_BASE * state.zoomV, half = L.mag.w / 2 / z, cxm = magCenterV(d);
    const fx0 = V.X(cxm - half), fx1 = V.X(cxm + half);
    const fw = Math.max(8, fx1 - fx0), fxm = (fx0 + fx1) / 2;
    c.strokeStyle = C.accent; c.lineWidth = 1.5;
    roundRect(c, fxm - fw / 2, V.Y(CAL.sy - 5.2), fw, (CAL.plateBot - CAL.sy + 5.8) * V.k, 3);
    c.fillStyle = alpha(C.accent, 0.07); c.fill(); c.stroke();
    // 鍵盤操作：被選取的物件加虛線焦點框
    if (kbOn(0) && state.mode === 'vernier') { const R = sliderRight(d.N); kbFrame(c, V.X(d.s - 7) - 4, V.Y(-8) - 4, (R + 7) * V.k + 8, (CAL.bodyBot + 8) * V.k + 8); }
    if (kbOn(1) && state.mode === 'vernier') kbFrame(c, fxm - fw / 2 - 4, V.Y(CAL.sy - 5.2) - 4, fw + 8, (CAL.plateBot - CAL.sy + 5.8) * V.k + 8);
    // 讀數說明的記號（主畫面：副尺 0 與對齊的刻線）
    if (d.overlay) {
      const o = d.overlay, VN = MC.VERNIER[d.N];
      const z0 = d.s + d.e, xk = z0 + o.k * VN.div;
      marker(c, V.X(z0), V.Y(CAL.plateBot) + 2, C.neg, false);
      marker(c, V.X(xk), V.Y(CAL.sy - 4.6) - 2, C.pos, true);
    }
    // 部件名稱
    if (state.names && state.mode === 'vernier') {
      const s = d.s, R = sliderRight(d.N);
      const right = V.xinv(L.W - 8);
      const ms = Math.min(CAL.BE - 30, right - 22);
      tag(c, T('主尺', 'Main scale'), V.X(ms), V.Y(4), V.X(ms + 4), V.Y(-9), 'left');
      tag(c, T('副尺', 'Vernier'), V.X(s + R - 3), V.Y(CAL.plateBot - 1), V.X(s + R + 4), V.Y(CAL.bodyBot + 7), 'left');
      if (d.kind !== 'depth') tag(c, T('外測爪', 'Outside jaws'), V.X(s + 6), V.Y(48), V.X(s + 18), V.Y(52), 'left');
      if (d.kind !== 'depth') {
        const ix = d.kind === 'inner' && d.showObj ? d.size + d.wall + 2 : s + 3;
        tag(c, T('內測爪', 'Inside jaws'), V.X(s - 1.5), V.Y(-11), V.X(Math.max(ix, s + 5)), V.Y(d.kind === 'inner' && d.showObj ? -10.5 : -17), 'left');
      }
      if (d.kind === 'depth' || V.X(CAL.BE + 10) < L.W) {
        const rx = CAL.BE + Math.max(1.5, Math.min(s, 30) * 0.5);
        tag(c, T('深度桿', 'Depth rod'), V.X(rx), V.Y(CAL.rodY), V.X(rx + 3), V.Y(d.kind === 'depth' ? 32 : 30), 'left');
      }
    }
    // 待測物名稱
    if (d.showObj) {
      const lbl = { outer: T('圓棒（量外徑）', 'Rod (outside diameter)'), rod: T('圓棒', 'Rod'), inner: T('圓管剖面（量內徑）', 'Tube, cut open (inside diameter)'), depth: T('有孔木塊剖面（量深度）', 'Block with a hole, cut open (depth)') }[d.obj];
      if (d.obj === 'outer' || d.obj === 'rod') { const r = d.size / 2; LD.pill(c, lbl, V.X(r), Math.min(L.mainH - 4, V.Y(CAL.plateBot + 2 * r + 1.2) + 18), C.text, 'center', '600 ' + (L.narrow ? 10.5 : 11.5) + 'px ' + FONT); }
      else if (d.obj === 'inner') pillIn(c, lbl, V.X(d.size + d.wall) + 6, V.Y(-19), C.text, 'left', '600 ' + (L.narrow ? 10.5 : 11.5) + 'px ' + FONT, 4, L.W - 4);
      else LD.pill(c, lbl, Math.min(L.W - 6, V.X(CAL.BE + d.size + 14)), V.Y(-6) - 3, C.text, 'right', '600 ' + (L.narrow ? 10.5 : 11.5) + 'px ' + FONT);
    } else if (state.mode === 'vernier') {
      pillIn(c, T('零點檢查：物件已移開', 'Zero check: object removed'), V.X(CAL.ojW + 6), V.Y(44), C.accent, 'left', '700 ' + (L.narrow ? 10.5 : 12) + 'px ' + FONT, 4, L.W - 4);
    }
    if (state.mode === 'multi') multiPill(c);
    c.restore();
  }
  /** 三角形記號：down = 尖端朝下 */
  function marker(c, x, y, color, down) {
    c.fillStyle = color;
    c.strokeStyle = alpha(C.bg, 0.9);
    c.lineWidth = 1.5;
    c.beginPath();
    if (down) { c.moveTo(x, y + 6); c.lineTo(x - 5, y - 3); c.lineTo(x + 5, y - 3); }
    else { c.moveTo(x, y - 6); c.lineTo(x - 5, y + 3); c.lineTo(x + 5, y + 3); }
    c.closePath(); c.stroke(); c.fill();
  }
  function multiPill(c) {
    const X = state.x, arr = X.sets[X.instr], last = X.last[X.instr];
    const I = MC.INSTR[X.instr];
    const text = last == null ? T('按「量一次」開始測量', 'Press “Measure once” to start') : T('第 ', 'Reading ') + arr.length + T(' 次讀數：', ': ') + mmStr(last, I.decimals) + ' mm';
    LD.pill(c, text, L.W - 8, 24, last == null ? C.muted : C.accent, 'right', '700 ' + (L.narrow ? 11 : 12.5) + 'px ' + FONT);
  }

  // ---------- 游標尺的放大鏡 ----------
  function magCenterV(d) {
    const V = state.v;
    const z = ZOOM_BASE * state.zoomV, half = L.mag.w / 2 / z;
    const z0 = d.s + d.e;
    if (V.pan == null || state.mode === 'multi') return z0 + half - 1.4;
    return z0 + V.pan;
  }
  function clampPan() {
    const V = state.v, VN = MC.VERNIER[V.N];
    const z = ZOOM_BASE * state.zoomV, half = L.mag.w / 2 / z;
    if (V.pan == null) V.pan = half - 1.4;
    V.pan = Math.max(Math.min(half - 2, VN.span / 2), Math.min(Math.max(VN.span - half + 2, VN.span / 2), V.pan));
  }
  function drawMagFrame(c, title) {
    const M = L.mag;
    c.save();
    c.shadowColor = C.dark ? 'rgba(0,0,0,0.5)' : alpha(C.text, 0.22);
    c.shadowBlur = 10; c.shadowOffsetY = 2;
    roundRect(c, M.x, M.y, M.w, M.h, 12);
    c.fillStyle = C.bg; c.fill();
    c.restore();
    const fs = L.narrow ? 11 : 12;
    LD.haloText(c, title, M.x + 4, M.y - 8, C.accent, 'left', 'alphabetic', '700 ' + fs + 'px ' + FONT);
  }
  function drawMagGlass(c) {
    const M = L.mag;
    c.save();
    roundRect(c, M.x, M.y, M.w, M.h, 12); c.clip();
    const g = c.createLinearGradient(0, M.y, 0, M.y + M.h);
    g.addColorStop(0, alpha('#ffffff', C.dark ? 0.06 : 0.22)); g.addColorStop(0.18, alpha('#ffffff', 0)); g.addColorStop(1, alpha('#000000', C.dark ? 0.12 : 0.05));
    c.fillStyle = g; c.fillRect(M.x, M.y, M.w, M.h);
    c.restore();
    roundRect(c, M.x + 0.75, M.y + 0.75, M.w - 1.5, M.h - 1.5, 11.5);
    c.strokeStyle = alpha(C.accent, 0.75); c.lineWidth = 1.5; c.stroke();
  }
  function drawVernierMag(c) {
    const d = vScene(), M = L.mag;
    const z = ZOOM_BASE * state.zoomV;
    const cxm = magCenterV(d);
    const ky = (M.h - 14) / (CAL.plateBot + 0.4 - 4.2);
    const V = {
      k: z, kx: z, ky: ky,
      X: function (x) { return M.x + M.w / 2 + (x - cxm) * z; },
      Y: function (y) { return M.y + 7 + (y - 4.2) * ky; },
      xinv: function (px) { return cxm + (px - M.x - M.w / 2) / z; }
    };
    drawMagFrame(c, T('放大鏡 ×', 'Magnifier ×') + state.zoomV + (state.mode === 'vernier' ? T('　左右拖曳可移動', ' · drag sideways to move') : ''));
    c.save();
    roundRect(c, M.x, M.y, M.w, M.h, 12); c.clip();
    c.fillStyle = C.dark ? shade(C.bg, -0.2) : shade(C.bg, -0.03);
    c.fillRect(M.x, M.y, M.w, M.h);
    drawBeamAndScales(c, V, d, true);
    if (d.overlay) drawVernierOverlay(c, V, d);
    c.restore();
    drawMagGlass(c);
  }
  function drawVernierOverlay(c, V, d) {
    const o = d.overlay, VN = MC.VERNIER[d.N];
    const z0 = d.s + d.e, xk = z0 + o.k * VN.div, xm = o.mainMm + o.k;
    const fs = L.narrow ? 10.5 : 11.5;
    // 對齊的刻線（紅色光暈，跨過主尺與副尺）
    c.save();
    c.fillStyle = alpha(C.pos, 0.18);
    c.fillRect(V.X(xk) - 7, V.Y(CAL.sy - 4.6), 14, (7.6) * V.ky);
    c.fillStyle = C.pos;
    vline(c, V.X(xk), V.Y(CAL.sy - 2.0), V.Y(CAL.sy + 2.0), Math.max(2, engr(V) + 1));
    c.restore();
    const lbl = T('第 ', 'Line ') + o.k + T(' 條對齊', ' lines up');
    LD.pill(c, lbl, V.X(xk), V.Y(CAL.plateBot) + 1, C.pos, 'center', '700 ' + fs + 'px ' + FONT);
    void xm;
    // 副尺 0 刻線與主尺讀數 M
    if (V.X(z0) > L.mag.x - 20 && V.X(z0) < L.mag.x + L.mag.w + 20) {
      c.fillStyle = C.neg;
      vline(c, V.X(z0), V.Y(CAL.sy), V.Y(CAL.sy + 3.0), Math.max(2, engr(V) + 1));
      if (V.X(o.mainMm) > L.mag.x) {
        vline(c, V.X(o.mainMm), V.Y(CAL.sy - 2.0), V.Y(CAL.sy), Math.max(2, engr(V) + 1));
        LD.pill(c, 'M = ' + minus(o.mainMm) + ' mm', Math.max(L.mag.x + 40, V.X(o.mainMm)), V.Y(CAL.sy - 4.4) - 16, C.neg, 'center', '700 ' + fs + 'px ' + FONT);
      }
    }
  }

  // ======================= 螺旋測微器：繪圖 =======================
  function mScene() {
    if (state.mode === 'multi') {
      const X = state.x, tr = X.rod.trueUm / 1000, last = X.last.micro;
      return { R: last == null ? tr + 1.2 : last / 1000, s: last == null ? tr + 1.2 : tr, obj: 'rod', size: tr, showObj: true, overlay: null };
    }
    const M = state.m;
    return { R: M.s + M.item.zeroUm / 1000, s: M.s, obj: M.kind, size: M.item.sizeUm / 1000, showObj: !M.zeroCheck, overlay: M.overlay };
  }
  /** 水平圓柱（軸線 y = yc、半徑 r），由上而下的金屬漸層 */
  function cylinder(c, V, x0, x1, r, base, opts) {
    opts = opts || {};
    const y0 = V.Y(-r), y1 = V.Y(r);
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, shade(base, -0.25)); g.addColorStop(0.2, shade(base, 0.35)); g.addColorStop(0.32, shade(base, 0.6));
    g.addColorStop(0.5, base); g.addColorStop(0.85, shade(base, -0.3)); g.addColorStop(1, shade(base, -0.5));
    c.fillStyle = g;
    c.fillRect(V.X(x0), y0, (x1 - x0) * V.k, y1 - y0);
    if (opts.edge !== false) {
      c.fillStyle = alpha(shade(base, -0.6), 0.7);
      c.fillRect(V.X(x0), y0, (x1 - x0) * V.k, 1 / L.dpr);
      c.fillRect(V.X(x0), y1 - 1 / L.dpr, (x1 - x0) * V.k, 1 / L.dpr);
    }
  }
  function drawFrame(c, V) {
    const P = function (x, y) { return [V.X(x), V.Y(y)]; };
    c.save();
    c.beginPath();
    let p = P(-15.5, -5.8); c.moveTo(p[0], p[1]);
    p = P(-17, 18); c.lineTo(p[0], p[1]);
    let q = P(-17, 31), r = P(-4, 31); c.quadraticCurveTo(q[0], q[1], r[0], r[1]);
    p = P(27, 31); c.lineTo(p[0], p[1]);
    q = P(38.5, 31); r = P(38.5, 18); c.quadraticCurveTo(q[0], q[1], r[0], r[1]);
    p = P(38.5, -MIC.rBoss); c.lineTo(p[0], p[1]);
    p = P(MIC.arm, -MIC.rBoss); c.lineTo(p[0], p[1]);
    p = P(MIC.arm, 4.5); c.lineTo(p[0], p[1]);
    q = P(MIC.arm, 22.5); r = P(18, 22.5); c.quadraticCurveTo(q[0], q[1], r[0], r[1]);
    p = P(3, 22.5); c.lineTo(p[0], p[1]);
    q = P(-6, 22.5); r = P(-6, 12); c.quadraticCurveTo(q[0], q[1], r[0], r[1]);
    p = P(-6, -5.8); c.lineTo(p[0], p[1]);
    c.closePath();
    c.shadowColor = C.dark ? 'rgba(0,0,0,0.5)' : alpha(C.text, 0.25);
    c.shadowBlur = 10; c.shadowOffsetY = 3;
    const g = c.createLinearGradient(0, V.Y(-6), 0, V.Y(31));
    g.addColorStop(0, shade(C.enamel, 0.28)); g.addColorStop(0.45, C.enamel); g.addColorStop(1, shade(C.enamel, -0.3));
    c.fillStyle = g; c.fill();
    c.shadowColor = 'transparent';
    c.strokeStyle = alpha(shade(C.enamel, 0.55), 0.6); c.lineWidth = 1.2; c.stroke();
    c.restore();
    // 隔熱板與規格
    const px0 = V.X(-1), py0 = V.Y(24.3), pw = 23 * V.k, ph = 5 * V.k;
    LD.block(c, px0, py0, pw, ph, C.plaque, { r: Math.min(4, 1.2 * V.k), shadow: false });
    if (V.k >= 2.2) {
      c.fillStyle = shade(C.plaque, C.dark ? 0.6 : -0.65);
      c.font = '700 ' + Math.max(7, Math.min(12, 2.3 * V.k)) + 'px ' + FONT;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('0–25 mm   0.01 mm', px0 + pw / 2, py0 + ph / 2 + 0.5);
    }
  }
  function drawMicrometer(c, V, d, mag) {
    const xe = MIC.xz + d.R;
    const turns = d.R / MC.MICRO.pitch;
    const dDiv = ((turns % 1) + 1) % 1 * 50; // 對齊基準線的格數（0–50）
    drawFrame(c, V);
    // 測砧與測軸（拋光鋼、端面鑲硬質合金）
    cylinder(c, V, MIC.anvil, 0, MIC.rS, C.steel);
    c.fillStyle = shade(C.steelLo, -0.2); c.fillRect(V.X(-0.5), V.Y(-MIC.rS), 0.5 * V.k, 2 * MIC.rS * V.k);
    cylinder(c, V, d.s, MIC.arm, MIC.rS, C.steel);
    c.fillStyle = shade(C.steelLo, -0.2); c.fillRect(V.X(d.s), V.Y(-MIC.rS), 0.5 * V.k, 2 * MIC.rS * V.k);
    // 待測物
    if (d.showObj && !mag) drawMicroObject(c, V, d);
    if (d.showObj && mag && d.obj !== 'rod' && d.obj !== 'ball') drawMicroObject(c, V, d);
    // 軸承座（框架的一部分）與固定鈕
    c.fillStyle = steelGrad(c, V.Y(-MIC.rBoss), V.Y(MIC.rBoss), shade(C.enamel, 0.3), C.enamel, shade(C.enamel, -0.3));
    c.fillRect(V.X(MIC.arm), V.Y(-MIC.rBoss), (MIC.boss + 1.5 - MIC.arm) * V.k, 2 * MIC.rBoss * V.k);
    c.fillStyle = steelGrad(c, V.Y(-9.6), V.Y(-MIC.rBoss), C.steelHi, C.steel, C.steelLo);
    roundRect(c, V.X(31), V.Y(-9.6), 4.5 * V.k, (9.6 - MIC.rBoss) * V.k, Math.min(3, 1.2 * V.k)); c.fill();
    c.strokeStyle = alpha(C.steelLo, 0.8); c.lineWidth = 1; c.stroke();
    // 套筒：基準線＋上排整毫米、下排半毫米刻線
    cylinder(c, V, MIC.boss + 1.5, xe + 1, MIC.rSl, C.plate);
    c.fillStyle = C.ink;
    const w = Math.max(1 / L.dpr, Math.min(3, 0.06 * V.k));
    hline(c, V.X(MIC.xz - 0.8), V.X(xe), V.Y(0), w);
    const visible = function (x) { return V.X(x) < V.X(xe) + 0.5 && V.X(x) > -10 && V.X(x) < L.W + 10; };
    for (let m = 0; m <= MIC.range; m++) {
      const x = MIC.xz + m;
      if (visible(x)) vline(c, V.X(x), V.Y(-1.5), V.Y(0), w);
      const xh = x + 0.5;
      if (m < MIC.range && visible(xh)) vline(c, V.X(xh), V.Y(0), V.Y(1.3), w);
    }
    const fsS = mag ? 13 : Math.max(6.5, Math.min(11, 1.9 * V.k));
    if (mag || V.k >= 3.2) {
      c.font = '700 ' + fsS + 'px ' + FONT;
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      for (let m = 0; m <= MIC.range; m += 5) { const x = MIC.xz + m; if (visible(x + 0.3)) c.fillText(String(m), V.X(x), V.Y(-1.5) - (mag ? 5 : 1.5)); }
    }
    // 套管：倒角上的 50 格刻度（依圓柱面位置 y = −r sin φ 畫出），數字每 5 格
    const x1 = xe + MIC.ch, x2 = xe + MIC.thL;
    c.save();
    c.beginPath();
    c.moveTo(V.X(xe), V.Y(-MIC.rCh)); c.lineTo(V.X(x1), V.Y(-MIC.rTh)); c.lineTo(V.X(x2), V.Y(-MIC.rTh));
    c.lineTo(V.X(x2), V.Y(MIC.rTh)); c.lineTo(V.X(x1), V.Y(MIC.rTh)); c.lineTo(V.X(xe), V.Y(MIC.rCh)); c.closePath();
    c.shadowColor = C.dark ? 'rgba(0,0,0,0.45)' : alpha(C.text, 0.25); c.shadowBlur = 6; c.shadowOffsetX = -1;
    const tg = c.createLinearGradient(0, V.Y(-MIC.rTh), 0, V.Y(MIC.rTh));
    tg.addColorStop(0, shade(C.steel, -0.3)); tg.addColorStop(0.2, shade(C.steelHi, 0.15)); tg.addColorStop(0.34, C.steelHi);
    tg.addColorStop(0.55, C.steel); tg.addColorStop(0.88, shade(C.steel, -0.3)); tg.addColorStop(1, shade(C.steel, -0.5));
    c.fillStyle = tg; c.fill();
    c.restore();
    // 倒角的亮面
    c.fillStyle = alpha('#ffffff', C.dark ? 0.06 : 0.22);
    c.beginPath(); c.moveTo(V.X(xe), V.Y(-MIC.rCh)); c.lineTo(V.X(x1), V.Y(-MIC.rTh)); c.lineTo(V.X(x1), V.Y(MIC.rTh)); c.lineTo(V.X(xe), V.Y(MIC.rCh)); c.closePath(); c.fill();
    vline(c, V.X(x1), V.Y(-MIC.rTh), V.Y(MIC.rTh), 1 / L.dpr);
    // 滾花
    c.save();
    c.beginPath(); c.rect(V.X(xe + MIC.knurl), V.Y(-MIC.rTh), (MIC.thL - MIC.knurl) * V.k, 2 * MIC.rTh * V.k); c.clip();
    c.fillStyle = alpha(shade(C.steelLo, -0.3), 0.55);
    const ph = dDiv / 50 * 2 * Math.PI;
    for (let q = 0; q < 72; q++) {
      const a = q / 72 * 2 * Math.PI - ph, ca = Math.cos(a);
      if (ca < 0.05) continue;
      const yy = V.Y(-MIC.rTh * Math.sin(a));
      c.globalAlpha = 0.25 + 0.6 * ca;
      c.fillRect(V.X(xe + MIC.knurl), yy, (MIC.thL - MIC.knurl) * V.k, Math.max(1 / L.dpr, 0.12 * V.k * ca));
    }
    c.restore();
    // 刻度
    c.strokeStyle = C.ink; c.fillStyle = C.ink;
    const lw = Math.max(1 / L.dpr, Math.min(3, 0.065 * V.k));
    const fsT = mag ? 13 : Math.max(6.5, Math.min(10.5, 1.55 * V.k));
    c.lineCap = 'butt';
    for (let j = 0; j < 50; j++) {
      let ph2 = (j - dDiv) / 50 * 2 * Math.PI;
      while (ph2 > Math.PI) ph2 -= 2 * Math.PI;
      while (ph2 <= -Math.PI) ph2 += 2 * Math.PI;
      const ca = Math.cos(ph2);
      if (ca < 0.06) continue;
      const sn = Math.sin(ph2);
      const ext = j % 5 === 0 ? 1.7 : 0.8;
      c.globalAlpha = Math.min(1, 0.25 + ca);
      c.lineWidth = lw * (0.55 + 0.45 * ca);
      c.beginPath();
      c.moveTo(V.X(xe), V.Y(-MIC.rCh * sn));
      c.lineTo(V.X(x1), V.Y(-MIC.rTh * sn));
      c.lineTo(V.X(x1 + ext), V.Y(-MIC.rTh * sn));
      c.stroke();
      if (j % 5 === 0 && ca > 0.3 && (mag || V.k >= 2.6)) {
        c.save();
        c.translate(V.X(x1 + ext + 0.4) + fsT * 0.9, V.Y(-MIC.rTh * sn));
        c.scale(1, ca);
        c.font = '700 ' + fsT + 'px ' + FONT;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(j), 0, 0);
        c.restore();
      }
    }
    c.globalAlpha = 1;
    // 棘輪
    const r0 = x2, r1 = x2 + MIC.raL;
    cylinder(c, V, r0, r1, MIC.rRa, C.steel);
    c.save();
    c.beginPath(); c.rect(V.X(r0 + 1), V.Y(-MIC.rRa), (MIC.raL - 2.5) * V.k, 2 * MIC.rRa * V.k); c.clip();
    c.fillStyle = alpha(shade(C.steelLo, -0.3), 0.5);
    for (let q = 0; q < 36; q++) {
      const a = q / 36 * 2 * Math.PI - ph * 0.0, ca = Math.cos(a);
      if (ca < 0.05) continue;
      c.globalAlpha = 0.3 + 0.6 * ca;
      c.fillRect(V.X(r0 + 1), V.Y(-MIC.rRa * Math.sin(a)), (MIC.raL - 2.5) * V.k, Math.max(1 / L.dpr, 0.14 * V.k * ca));
    }
    c.restore();
    c.fillStyle = steelGrad(c, V.Y(-MIC.rRa + 0.6), V.Y(MIC.rRa - 0.6), C.steelHi, C.steel, C.steelLo);
    roundRect(c, V.X(r1 - 1.2), V.Y(-MIC.rRa + 0.6), 2.2 * V.k, 2 * (MIC.rRa - 0.6) * V.k, Math.min(4, 1 * V.k)); c.fill();
  }
  function drawMicroObject(c, V, d) {
    const D = d.size;
    if (d.obj === 'wire') {
      const g = c.createLinearGradient(V.X(0), 0, V.X(D), 0);
      g.addColorStop(0, shade(C.copper, -0.35)); g.addColorStop(0.35, shade(C.copper, 0.4)); g.addColorStop(1, shade(C.copper, -0.3));
      c.fillStyle = g;
      roundRect(c, V.X(0), V.Y(-12.5), Math.max(1, D * V.k), 33 * V.k, Math.min(D * V.k / 2, 3)); c.fill();
    } else if (d.obj === 'sheet') {
      c.fillStyle = shade(C.paper, -0.12);
      c.fillRect(V.X(0), V.Y(-11), Math.max(1, D * V.k), 27 * V.k);
      c.fillStyle = C.paper;
      c.fillRect(V.X(0) + Math.max(1, D * V.k) * 0.25, V.Y(-11), Math.max(0.6, D * V.k * 0.5), 27 * V.k);
      c.strokeStyle = alpha(shade(C.paper, -0.5), 0.6); c.lineWidth = 1;
      c.strokeRect(V.X(0) + 0.5, V.Y(-11) + 0.5, Math.max(1, D * V.k) - 1, 27 * V.k - 1);
    } else {
      const R = D / 2 * V.k, x = V.X(D / 2), y = V.Y(0);
      const g = c.createRadialGradient(x - R * 0.35, y - R * 0.38, R * 0.06, x, y, R);
      const base = d.obj === 'rod' ? C.rod : C.steel;
      g.addColorStop(0, shade(base, 0.75)); g.addColorStop(0.35, shade(base, 0.2)); g.addColorStop(0.8, base); g.addColorStop(1, shade(base, -0.4));
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fill();
      c.strokeStyle = alpha(shade(base, -0.5), 0.8); c.lineWidth = 1;
      c.beginPath(); c.arc(x, y, R - 0.5, 0, Math.PI * 2); c.stroke();
    }
  }
  /** 放大鏡的左緣（mm）：套管邊緣放在鏡面中央，但左緣不超過軸承座右邊 1 mm（讀數小時套筒露出的部分本來就短） */
  function mMagX0(d) {
    const fw = L.mag.w / (ZOOM_BASE * state.zoomM);
    return Math.max(MIC.xz + d.R - 0.5 * fw, MIC.boss + 0.5);
  }
  function mMagView() {
    const M = L.mag, z = ZOOM_BASE * state.zoomM, x0 = mMagX0(mScene());
    return {
      k: z, kx: z, ky: z,
      X: function (x) { return M.x + (x - x0) * z; },
      Y: function (y) { return M.y + M.h / 2 + y * z; },
      xinv: function (px) { return x0 + (px - M.x) / z; }
    };
  }
  function drawMicroMain(c) {
    const d = mScene(), V = L.view;
    c.save();
    c.beginPath(); c.rect(0, 0, L.W, L.mainH); c.clip();
    drawMicrometer(c, V, d, false);
    drawFx(c);
    // 放大鏡取景框
    const z = ZOOM_BASE * state.zoomM, xe = MIC.xz + d.R, M = L.mag;
    const fw = M.w / z, fh = M.h / z;
    const x0 = mMagX0(d);
    c.strokeStyle = C.accent; c.lineWidth = 1.5;
    roundRect(c, V.X(x0), V.Y(-fh / 2), Math.max(8, fw * V.k), Math.max(8, fh * V.k), 3);
    c.fillStyle = alpha(C.accent, 0.06); c.fill(); c.stroke();
    if (kbOn(0) && state.mode === 'micro') kbFrame(c, V.X(xe) - 5, V.Y(-MIC.rTh) - 5, (MIC.thL + MIC.raL) * V.k + 10, 2 * MIC.rTh * V.k + 10);
    const fs = L.narrow ? 10.5 : 11.5;
    if (state.names && state.mode === 'micro') {
      tag(c, T('測砧', 'Anvil'), V.X(-3.5), V.Y(-MIC.rS), V.X(-9), V.Y(-11.5), 'right');
      tag(c, T('測軸', 'Spindle'), V.X((d.s + MIC.arm) / 2 + 2), V.Y(-MIC.rS), V.X((d.s + MIC.arm) / 2 + 2), V.Y(-11.5), 'center');
      tag(c, T('套筒', 'Sleeve'), V.X(MIC.boss + 2.5), V.Y(MIC.rSl), V.X(MIC.boss + 3), V.Y(13.5), 'right');
      tag(c, T('套管', 'Thimble'), V.X(xe + 8), V.Y(MIC.rTh - 0.5), V.X(xe + 8), V.Y(13.5), 'left');
      tag(c, T('棘輪', 'Ratchet'), V.X(xe + MIC.thL + 5), V.Y(-MIC.rRa), V.X(xe + MIC.thL + 3), V.Y(-11.5), 'left');
      tag(c, T('弓形架', 'Frame'), V.X(MIC.arm), V.Y(15), V.X(MIC.arm - 3), V.Y(19.5), 'right');
    }
    if (d.showObj) {
      const lbl = { wire: T('細線', 'Thin wire'), sheet: T('薄片', 'Thin sheet'), ball: T('鋼珠', 'Steel ball'), rod: T('圓棒', 'Rod') }[d.obj];
      if (d.obj === 'ball' || d.obj === 'rod') LD.pill(c, lbl, V.X(d.size / 2), Math.min(V.Y(21), V.Y(d.size / 2) + 18), C.text, 'center', '600 ' + fs + 'px ' + FONT);
      else LD.pill(c, lbl, V.X(d.size) + 6, V.Y(9), C.text, 'left', '600 ' + fs + 'px ' + FONT);
    } else if (state.mode === 'micro') {
      pillIn(c, T('零點檢查：物件已移開', 'Zero check: object removed'), V.X(11), V.Y(13), C.accent, 'center', '700 ' + (L.narrow ? 10.5 : 12) + 'px ' + FONT, 4, L.W - 4);
    }
    if (state.mode === 'micro' && state.m.clicks > 0 && state.m.touching) {
      LD.pill(c, T('棘輪打滑「喀」×', 'Ratchet slipping “click” ×') + state.m.clicks, V.X(MIC.xz + d.R + MIC.thL + MIC.raL), V.Y(-MIC.rRa) - 4, C.accent, 'right', '700 ' + fs + 'px ' + FONT);
    }
    if (state.mode === 'multi') multiPill(c);
    c.restore();
  }
  function drawMicroMag(c) {
    const d = mScene(), M = L.mag, V = mMagView();
    drawMagFrame(c, T('放大鏡 ×', 'Magnifier ×') + state.zoomM + (state.mode === 'micro' ? T('　上下拖曳套管可轉動', ' · drag the thimble up or down to turn it') : ''));
    c.save();
    roundRect(c, M.x, M.y, M.w, M.h, 12); c.clip();
    c.fillStyle = C.dark ? shade(C.bg, -0.2) : shade(C.bg, -0.03);
    c.fillRect(M.x, M.y, M.w, M.h);
    drawMicrometer(c, V, d, true);
    if (d.overlay) {
      const o = d.overlay, fs = L.narrow ? 10.5 : 11.5;
      const xs = MIC.xz + o.sleeveUm / 1000, xe = MIC.xz + d.R;
      c.fillStyle = C.neg;
      const w = Math.max(2.5, Math.min(4, 0.1 * V.k));
      if (o.sleeveUm >= 0) {
        const half = o.halfShown;
        vline(c, V.X(xs), V.Y(half ? 0 : -1.5), V.Y(half ? 1.3 : 0), w);
        pillIn(c, 'S = ' + fx(o.sleeveUm / 1000, 1) + ' mm', V.X(xs), Math.max(M.y + 22, Math.min(M.y + M.h - 5, half ? V.Y(1.3) + 22 : V.Y(-1.5) - 8)), C.neg, 'center', '700 ' + fs + 'px ' + FONT, M.x + 4, M.x + M.w - 4);
      }
      c.fillStyle = alpha(C.pos, 0.2);
      c.fillRect(V.X(xe), V.Y(0) - 3, (MIC.ch + 2) * V.k, 6);
      c.fillStyle = C.pos;
      hline(c, V.X(xe), V.X(xe + MIC.ch + 1.5), V.Y(0), 2);
      pillIn(c, 'n = ' + (o.div10 / 10).toFixed(1) + T(' 格', ' div'), V.X(xe + MIC.ch + 2.1) + 3.2 * fs + 6, V.Y(0) + 10, C.pos, 'left', '700 ' + fs + 'px ' + FONT, M.x + 4, M.x + M.w - 4);
    }
    c.restore();
    drawMagGlass(c);
  }

  // ---------- 小特效（接觸波紋；減少動態效果時不畫） ----------
  function drawFx(c) {
    const now = performance.now();
    state.fx = state.fx.filter(function (f) { return now - f.t0 < f.dur; });
    state.fx.forEach(function (f) {
      const p = f.where();
      LD.ripple(c, p[0], p[1], 6, (now - f.t0) / f.dur, C.accent);
    });
  }
  function addFx(where) {
    if (reducedMotion) return;
    state.fx.push({ t0: performance.now(), dur: 380, where: where });
    requestDraw();
  }

  // ======================= 主繪圖 =======================
  let pending = false;
  function requestDraw() { if (!pending) { pending = true; requestAnimationFrame(frame); } }
  let lastT = 0;
  function frame(t) {
    pending = false;
    const dt = lastT ? Math.min(1 / 30, (t - lastT) / 1000) : 1 / 60;
    lastT = t;
    let busy = stepAnim(dt);
    draw();
    if (state.fx.length) busy = true;
    if (busy) requestDraw(); else lastT = 0;
  }
  function draw() {
    if (!L) layout();
    const c = cx;
    c.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    LD.backdrop(c, L.W, L.H);
    if (isVernierScene()) { drawVernierMain(c); drawVernierMag(c); }
    else { drawMicroMain(c); drawMicroMag(c); }
  }

  // ======================= 游標尺：操作 =======================
  function vLimit() { const V = state.v; return V.zeroCheck ? 0 : V.item.sizeUm / 1000; }
  function vRange() {
    const V = state.v, lim = vLimit();
    if (V.zeroCheck || V.kind === 'outer') return [lim, CAL.sMax];
    return [0, lim];
  }
  function vSetS(sNew) {
    const V = state.v, r = vRange(), lim = vLimit();
    const s = Math.max(r[0], Math.min(r[1], sNew));
    const moved = Math.abs(s - V.s) > 1e-9;
    V.s = s;
    const touch = Math.abs(s - lim) < 1e-9;
    if (touch && !V.touching) {
      V.s = lim;
      clampSound();
      const V2 = L.view;
      addFx(function () { const d = vScene(); return V.kind === 'outer' || V.zeroCheck ? [V2.X(d.s), V2.Y(V.zeroCheck ? CAL.ojTip - 4 : CAL.plateBot + d.size / 2 + 1.2)] : V.kind === 'inner' ? [V2.X(d.s), V2.Y(-12)] : [V2.X(CAL.BE + d.s), V2.Y(CAL.rodY)]; });
    }
    V.touching = touch;
    if (moved && V.overlay) { V.overlay = null; clearFeedback(); }
    return moved;
  }
  function vInitS() {
    const V = state.v, D = V.item.sizeUm / 1000;
    V.s = V.kind === 'outer' ? D + 7 : V.kind === 'inner' ? Math.max(1.2, D - 7) : Math.max(0, D - 9);
    V.touching = false;
  }
  function newVernierItem() {
    const V = state.v;
    V.item = MC.makeVernierItem(rng, V.N, V.kind, V.zeroOn);
    V.zeroCheck = false; V.overlay = null; V.anim = null; V.pan = null; V.checked = false;
    vInitS();
    $('ans').value = '';
    clearFeedback();
    updateLabels();
  }

  // ======================= 螺旋測微器：操作 =======================
  function mLimit() { const M = state.m; return M.zeroCheck ? 0 : M.item.sizeUm / 1000; }
  /** 轉動套管：d（mm，負 = 測軸往前夾緊）。碰到物體後再往前轉，棘輪打滑 */
  function mMove(dmm) {
    const M = state.m, lim = mLimit();
    let s = M.s + dmm;
    if (s < lim - 1e-12) {
      const over = lim - s;
      s = lim;
      if (M.touching || Math.abs(M.s - lim) < 1e-9) {
        M.push += over;
        while (M.push >= RATCHET - 1e-9) { M.push -= RATCHET; ratchetClick(); }
      }
    }
    s = Math.min(MIC.range, s);
    const moved = Math.abs(s - M.s) > 1e-9;
    M.s = s;
    const touch = Math.abs(s - lim) < 1e-9;
    if (touch && !M.touching) {
      M.s = lim;
      clampSound();
      const V2 = L.view;
      addFx(function () { return [V2.X(state.m.s), V2.Y(0)]; });
    }
    if (!touch) { M.push = 0; if (s > lim + 0.0005) M.clicks = 0; }
    M.touching = touch;
    if (moved && M.overlay) { M.overlay = null; clearFeedback(); }
    return moved;
  }
  function ratchetClick() {
    const M = state.m;
    M.clicks++;
    ratchetSound();
    emit('ratchet', { clicks: M.clicks });
  }
  function newMicroItem() {
    const M = state.m;
    M.item = MC.makeMicroItem(rng, M.kind, M.zeroOn);
    M.zeroCheck = false; M.overlay = null; M.anim = null; M.clicks = 0; M.push = 0; M.checked = false;
    M.s = Math.min(MIC.range, M.item.sizeUm / 1000 + 1.2);
    M.touching = false;
    $('ans').value = '';
    clearFeedback();
    updateLabels();
  }

  // ---------- 動畫（介面動作：夾緊、鬆開、轉一圈；不是物理運動） ----------
  function startAnim(which, target, speed) {
    const o = which === 'v' ? state.v : state.m;
    if (reducedMotion) {
      if (which === 'v') vSetS(target); else mMove(target - o.s);
      afterMove();
      return;
    }
    o.anim = { target: target, speed: speed };
    requestDraw();
  }
  function stepAnim(dt) {
    let busy = false;
    [['v', state.v], ['m', state.m]].forEach(function (p) {
      const o = p[1], a = o.anim;
      if (!a) return;
      const ds = a.target - o.s, step = a.speed * dt;
      let moved;
      if (Math.abs(ds) <= step) {
        moved = p[0] === 'v' ? vSetS(a.target) : mMove(a.target - o.s);
        o.anim = null;
      } else {
        moved = p[0] === 'v' ? vSetS(o.s + Math.sign(ds) * step) : mMove(Math.sign(ds) * step);
        if (!moved) o.anim = null;
      }
      afterMove();
      if (o.anim) busy = true;
    });
    return busy;
  }
  function afterMove() { updateButtons(); }

  // ======================= 指標操作（拖曳副尺、平移放大鏡、轉動套管） =======================
  let drag = null;
  function pt(ev) { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function inMag(p) { const M = L.mag; return p[0] >= M.x && p[0] <= M.x + M.w && p[1] >= M.y && p[1] <= M.y + M.h; }
  function hitSlider(p) {
    if (state.mode !== 'vernier') return false;
    const V = L.view, d = vScene(), R = sliderRight(d.N);
    const x0 = V.X(d.s - 7) - 6, x1 = V.X(d.s + R) + 6;
    if (p[0] >= x0 && p[0] <= x1 && p[1] >= V.Y(-8) - 4 && p[1] <= V.Y(CAL.bodyBot + 4) && p[1] <= L.mainH) return true;
    if (state.v.kind !== 'depth' && p[0] >= V.X(d.s) - 4 && p[0] <= V.X(d.s + CAL.ojW) + 4 && p[1] >= V.Y(CAL.bodyBot) && p[1] <= Math.min(L.mainH, V.Y(CAL.ojTip))) return true;
    return false;
  }
  function hitLens(p) {
    if (state.mode !== 'vernier') return false;
    const V = L.view, d = vScene();
    const z = ZOOM_BASE * state.zoomV, half = L.mag.w / 2 / z, c0 = magCenterV(d);
    const x0 = V.X(c0 - half), x1 = V.X(c0 + half), xm = (x0 + x1) / 2, w = Math.max(16, x1 - x0);
    return p[0] >= xm - w / 2 && p[0] <= xm + w / 2 && p[1] >= V.Y(CAL.sy - 5.2) && p[1] <= V.Y(CAL.sy - 1);
  }
  function hitThimble(p) {
    if (state.mode !== 'micro') return false;
    const V = L.view, d = mScene(), xe = MIC.xz + d.R;
    return p[0] >= V.X(xe) - 4 && p[0] <= V.X(xe + MIC.thL + MIC.raL) + 6 && p[1] >= V.Y(-MIC.rTh) - 6 && p[1] <= V.Y(MIC.rTh) + 6 && p[1] <= L.mainH;
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (!L) return;
    const p = pt(ev);
    let type = null;
    if (state.mode === 'vernier') {
      if (inMag(p)) type = 'pan';
      else if (hitLens(p)) type = 'lens';
      else if (hitSlider(p)) type = 'slide';
    } else if (state.mode === 'micro') {
      if (inMag(p)) type = 'spinMag';
      else if (hitThimble(p)) type = 'spin';
    }
    if (!type) return;
    ev.preventDefault();
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    state.v.anim = null; state.m.anim = null;
    if (state.mode === 'vernier' && state.v.pan == null) clampPan();
    drag = { type: type, id: ev.pointerId, x: p[0], y: p[1], x0: p[0], y0: p[1], axis: type === 'spinMag' ? 'y' : null };
    if (type === 'lens') lensTo(p[0]);
    cv.style.cursor = 'grabbing';
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!L) return;
    const p = pt(ev);
    if (!drag) { cv.style.cursor = hoverCursor(p); return; }
    if (ev.pointerId !== drag.id) return;
    const dx = p[0] - drag.x, dy = p[1] - drag.y;
    drag.x = p[0]; drag.y = p[1];
    if (drag.type === 'slide') { vSetS(state.v.s + dx / L.view.k); afterMove(); }
    else if (drag.type === 'pan') { state.v.pan -= dx / (ZOOM_BASE * state.zoomV); clampPan(); }
    else if (drag.type === 'lens') lensTo(p[0]);
    else {
      if (!drag.axis) {
        if (Math.hypot(p[0] - drag.x0, p[1] - drag.y0) < 5) return;
        drag.axis = Math.abs(p[0] - drag.x0) > Math.abs(p[1] - drag.y0) ? 'x' : 'y';
        // 已累積的位移一次補上
        if (drag.axis === 'x') mMove((p[0] - drag.x0) / L.view.k); else mMove(spinMm(p[1] - drag.y0, drag.type === 'spinMag'));
      } else if (drag.axis === 'x') mMove(dx / (drag.type === 'spinMag' ? ZOOM_BASE * state.zoomM : L.view.k));
      else mMove(spinMm(dy, drag.type === 'spinMag'));
      afterMove();
    }
    requestDraw();
  });
  /** 在套管表面上下拖曳 dy 像素 → 讀數改變（mm）：表面移動一格的距離是 2πr/50 */
  function spinMm(dy, mag) {
    const k = mag ? ZOOM_BASE * state.zoomM : L.view.k;
    const divPx = 2 * Math.PI * MIC.rTh / 50 * k;
    return dy / divPx * 0.01;
  }
  function endDrag(ev) {
    if (!drag || (ev && ev.pointerId !== drag.id)) return;
    drag = null;
    cv.style.cursor = '';
    requestDraw();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (!drag) cv.style.cursor = ''; });
  function hoverCursor(p) {
    if (state.mode === 'vernier') { if (inMag(p) || hitLens(p) || hitSlider(p)) return 'ew-resize'; }
    else if (state.mode === 'micro') { if (inMag(p) || hitThimble(p)) return 'ns-resize'; }
    return '';
  }
  function lensTo(px) {
    const d = vScene();
    state.v.pan = L.view.xinv(px) - (d.s + d.e);
    clampPan();
    requestDraw();
  }

  // ======================= 核對讀數 =======================
  function clearFeedback() { const f = $('feedback'); f.className = 'feedback'; f.innerHTML = ''; }
  function setStatus(t) { $('status').textContent = t || ''; }
  const NUM = function (s) { return '<span class="num">' + s + '</span>'; };
  function check() {
    if (state.mode === 'vernier') checkVernier();
    else if (state.mode === 'micro') checkMicro();
  }
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }

  function checkVernier() {
    const V = state.v, it = V.item, N = V.N, c = MC.VERNIER[N].cUm;
    const str = $('ans').value;
    if (!V.touching) {
      setStatus(V.zeroCheck ? T('還沒合攏：先讓兩個外測爪碰在一起（可按「夾緊」）。', 'Not closed yet: bring the jaws together first (or press “Close”).')
        : T('還沒夾好：先讓夾爪（或深度桿）輕輕碰到物體（可按「夾緊」）。', 'Not in contact yet: bring the jaws (or the depth rod) gently against the object first (or press “Close on the object”).'));
      return;
    }
    const exp = MC.expectedUm(it, V.zeroCheck);
    const res = MC.checkVernier(str, exp);
    if (!res.parsed) { setStatus(T('請輸入讀數，例如 23.45（單位 mm）。', 'Type a reading such as 23.45 (in mm).')); return; }
    setStatus('');
    const rUm = V.zeroCheck ? it.zeroUm : it.readingUm;
    const rd = MC.vernierRead(rUm, N);
    V.overlay = { k: rd.k, mainMm: rd.mainMm, readingUm: rUm };
    // 放大鏡移到對齊的刻線
    const VN = MC.VERNIER[N], z = ZOOM_BASE * state.zoomV, half = L.mag.w / 2 / z;
    const xk = rd.k * VN.div;
    V.pan = (xk + 1.2 < 2 * half - 2.4) ? Math.max(half - 1.4, xk / 2) : xk;
    clampPan();
    // 說明
    const cmm = N === 20 ? '0.05' : '0.02';
    const steps = [];
    if (rd.mainMm >= 0) steps.push(T('主尺：副尺 0 刻線左邊最近的毫米刻線 → ', 'Main scale: the last millimetre line left of the vernier 0 → ') + NUM('M = ' + rd.mainMm + ' mm'));
    else steps.push(T('副尺 0 刻線在主尺 0 的左邊 → ', 'The vernier 0 is left of the main-scale 0 → ') + NUM('M = −1 mm'));
    steps.push(T('與主尺刻線對齊的是副尺第 ', 'The vernier line that lines up is line ') + NUM(rd.k) + T(' 條 → ', ' → ') + NUM(rd.k + ' × ' + cmm + ' mm = ' + fx(rd.k * c / 1000, 2) + ' mm'));
    const rStr = fx(rUm / 1000, 2);
    steps.push((V.zeroCheck ? T('零點讀數 ', 'Zero reading ') + NUM('e = ') : T('讀數 ', 'Reading ') + NUM('R = ')) + NUM(minus(rd.mainMm) + ' + ' + fx(rd.k * c / 1000, 2) + ' = ' + rStr + ' mm') +
      (rUm < 0 ? T('（也就是 −(', ' (that is −(') + N + ' − ' + rd.k + ') × ' + cmm + T(' mm）', ' mm)') : ''));
    if (!V.zeroCheck && it.zeroUm !== 0) steps.push(T('修正零點誤差：', 'Correct the zero error: ') + NUM('e = ' + fxs(it.zeroUm / 1000, 2) + ' mm') + T('，', ', ') + NUM('L = R − e = ' + rStr + ' − (' + fxs(it.zeroUm / 1000, 2) + ') = ' + fx(exp / 1000, 2) + ' mm'));
    let verdict, cls, why = '';
    if (res.ok) { verdict = T('正確！', 'Correct!'); cls = 'ok'; }
    else if (res.valueOk) {
      verdict = T('數值對了，但位數不對', 'Right value, wrong number of digits'); cls = 'warn';
      why = res.parsed.decimals < 2
        ? T('游標尺讀到 0.01 mm 位，要寫成 ', 'A vernier caliper reads to 0.01 mm, so write ') + NUM(fx(exp / 1000, 2) + ' mm') + T('：末位的 0 也是有效數字，表示這一位量過了。', ': the final 0 is a significant figure — it says that digit was measured.')
        : T('游標尺只讀得到 0.01 mm 位，多寫的位數沒有意義。', 'A vernier caliper only reads to 0.01 mm; extra digits mean nothing.');
    } else {
      verdict = T('再看看', 'Not quite'); cls = 'bad';
      why = diagnoseV(res.parsed, it, V.zeroCheck, N);
    }
    const f = $('feedback');
    f.className = 'feedback ' + cls;
    f.innerHTML = '<span class="verdict">' + verdict + '</span>' + (why ? '<div>' + why + '</div>' : '') + '<ol>' + steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>';
    resultSound(res.ok);
    // 成績
    const S = state.score, sv = S.v;
    if (!V.zeroCheck) {
      sv.tries++;
      if (res.ok) {
        sv.ok++;
        sv.run.push({ N: N, kind: V.kind, zeroOn: V.zeroOn, zeroMm: it.zeroUm / 1000 });
        if (sv.run.length > 40) sv.run.shift();
        S.count[V.kind]++; S.count['v' + N]++;
        if (it.zeroUm > 0) S.count.vPos++;
        if (it.zeroUm < 0) S.count.vNeg++;
      } else sv.run = [];
      sv.best = Math.max(sv.best, sv.run.length);
    }
    V.checked = true;
    updateScore();
    updateButtons();
    requestDraw();
    emit('check', {
      instr: 'vernier', N: N, kind: V.zeroCheck ? 'zero' : V.kind, zeroOn: V.zeroOn, zeroMm: it.zeroUm / 1000, zeroCheck: V.zeroCheck,
      readingMm: rUm / 1000, expectedMm: exp / 1000, sizeMm: it.sizeUm / 1000, answer: res.parsed.value, answerStr: res.parsed.str,
      ok: res.ok, valueOk: res.valueOk, formatOk: res.formatOk, exact: res.ok, intMm: rUm % 1000 === 0,
      runV: S.v.run.slice(), runM: S.m.run.slice(), count: Object.assign({}, S.count)
    });
  }
  function diagnoseV(p, it, zeroCheck, N) {
    const c = MC.VERNIER[N].cUm, exp = MC.expectedUm(it, zeroCheck), R = it.readingUm, e = it.zeroUm;
    const a = Math.round(p.value * 1000);
    if (!zeroCheck && e !== 0) {
      if (a === R) return T('你寫的是儀器上的讀數 R，還要減去零點誤差：L = R − e。', 'That is the reading R on the scale; you still have to subtract the zero error: L = R − e.');
      if (a === R + e) return T('零點誤差的正負號弄反了：L = R − e（e 為正就減，e 為負就加）。', 'The sign of the zero error is reversed: L = R − e (subtract a positive e, add a negative one).');
    }
    const diff = a - exp;
    if (Math.abs(Math.abs(diff) - 1000) < 1) return T('剛好差 1 mm：主尺要讀副尺「0 刻線」左邊最近的那條毫米刻線。', 'Exactly 1 mm off: the main-scale reading is the last millimetre line to the left of the vernier’s 0 line.');
    if (Math.abs(diff) < 1000 && Math.abs(diff % c) < 1e-6) return T('差了 ', 'Off by ') + Math.round(Math.abs(diff) / c) + T(' 格：用放大鏡沿著副尺再找一次，和主尺刻線對得最齊的是哪一條？', ' vernier division(s): look along the vernier with the magnifier again — which line matches a main-scale line best?');
    if (Math.abs(a % c) > 1e-6) return T('游標尺的讀數一定是精度的整數倍（20 格：0.05 mm；50 格：0.02 mm）。', 'A vernier reading is always a whole number of divisions (20 div: 0.05 mm; 50 div: 0.02 mm).');
    return T('先讀主尺（副尺 0 刻線左邊的毫米刻線），再找對齊的副尺刻線。', 'Read the main scale first (the millimetre line left of the vernier 0), then find the vernier line that lines up.');
  }

  function checkMicro() {
    const M = state.m, it = M.item;
    const str = $('ans').value;
    if (!M.touching) {
      setStatus(M.zeroCheck ? T('還沒合攏：轉到測軸碰到測砧（可按「轉到接觸」）。', 'Not closed yet: turn until the spindle touches the anvil (or press “Turn to contact”).')
        : T('測軸還沒碰到物體：轉到接觸、聽到棘輪「喀」一聲（可按「轉到接觸」）。', 'The spindle is not touching the object yet: turn until the ratchet clicks (or press “Turn to contact”).'));
      return;
    }
    const exp = MC.expectedUm(it, M.zeroCheck);
    const res = MC.checkMicro(str, exp);
    if (!res.parsed) { setStatus(T('請輸入讀數，例如 2.874（單位 mm）。', 'Type a reading such as 2.874 (in mm).')); return; }
    setStatus('');
    const rUm = M.zeroCheck ? it.zeroUm : it.readingUm;
    const rd = MC.microRead(rUm);
    M.overlay = { sleeveUm: rd.sleeveUm, halfShown: rd.halfShown, div10: rd.divInt * 10 + rd.tenth, readingUm: rUm };
    const steps = [];
    const n = (rd.divInt + rd.tenth / 10).toFixed(1);
    if (rUm >= 0) {
      steps.push(T('套筒：套管邊緣左邊露出的最後一條刻線 → ', 'Sleeve: the last line showing left of the thimble edge → ') + NUM('S = ' + fx(rd.sleeveUm / 1000, 1) + ' mm') +
        (rd.halfShown ? T('（下排的半毫米刻線已經露出來）', ' (the lower half-millimetre line is showing)') : T('（下排的半毫米刻線還沒露出來）', ' (the lower half-millimetre line is not showing yet)')));
      steps.push(T('套管：基準線對著 ', 'Thimble: the reference line is at ') + NUM(n) + T(' 格（估讀到十分之一格）→ ', ' divisions (estimated to a tenth) → ') + NUM(n + ' × 0.01 mm = ' + fx((rUm - rd.sleeveUm) / 1000, 3) + ' mm'));
      steps.push((M.zeroCheck ? T('零點讀數 ', 'Zero reading ') + NUM('e = ') : T('讀數 ', 'Reading ') + NUM('R = ')) + NUM(fx(rd.sleeveUm / 1000, 1) + ' + ' + fx((rUm - rd.sleeveUm) / 1000, 3) + ' = ' + fx(rUm / 1000, 3) + ' mm'));
    } else {
      steps.push(T('套管邊緣蓋過了套筒的 0 刻線（還沒退到 0）：讀數是負的。', 'The thimble edge covers the 0 line on the sleeve (it has not got back to 0): the reading is negative.'));
      steps.push(T('基準線對著 ', 'The reference line is at ') + NUM(n) + T(' 格 → ', ' divisions → ') + NUM('e = −(50 − ' + n + ') × 0.01 mm = ' + fx(rUm / 1000, 3) + ' mm'));
    }
    if (!M.zeroCheck && it.zeroUm !== 0) steps.push(T('修正零點誤差：', 'Correct the zero error: ') + NUM('e = ' + fxs(it.zeroUm / 1000, 3) + ' mm') + T('，', ', ') + NUM('L = R − e = ' + fx(rUm / 1000, 3) + ' − (' + fxs(it.zeroUm / 1000, 3) + ') = ' + fx(exp / 1000, 3) + ' mm'));
    let verdict, cls, why = '';
    if (res.ok) {
      verdict = res.exact ? T('完全正確！連估讀的那一位都對。', 'Exactly right — even the estimated digit!') : T('正確！（估讀的最後一位差 1，在容許範圍內）', 'Correct! (the estimated last digit is 1 off, which is acceptable)');
      cls = 'ok';
    } else if (res.valueOk) {
      verdict = T('數值接近，但位數不對', 'Close, but the wrong number of digits'); cls = 'warn';
      why = res.parsed.decimals < 3 ? T('螺旋測微器要估讀到 0.001 mm（寫 3 位小數），例如 ', 'A micrometer is read to 0.001 mm (3 decimal places), e.g. ') + NUM(fx(exp / 1000, 3) + ' mm') + T('。', '.')
        : T('只能估讀到 0.001 mm，多寫的位數沒有意義。', 'You can only estimate to 0.001 mm; extra digits mean nothing.');
    } else { verdict = T('再看看', 'Not quite'); cls = 'bad'; why = diagnoseM(res.parsed, it, M.zeroCheck); }
    const f = $('feedback');
    f.className = 'feedback ' + cls;
    f.innerHTML = '<span class="verdict">' + verdict + '</span>' + (why ? '<div>' + why + '</div>' : '') + '<ol>' + steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>';
    resultSound(res.ok);
    const S = state.score, sm = S.m;
    if (!M.zeroCheck) {
      sm.tries++;
      if (res.ok) {
        sm.ok++;
        sm.run.push({ kind: M.kind, zeroOn: M.zeroOn, zeroMm: it.zeroUm / 1000, exact: res.exact });
        if (sm.run.length > 40) sm.run.shift();
        S.count.micro++;
        if (it.zeroUm > 0) S.count.mPos++;
        if (it.zeroUm < 0) S.count.mNeg++;
      } else sm.run = [];
      sm.best = Math.max(sm.best, sm.run.length);
    }
    M.checked = true;
    updateScore();
    updateButtons();
    requestDraw();
    emit('check', {
      instr: 'micro', N: 0, kind: M.zeroCheck ? 'zero' : M.kind, zeroOn: M.zeroOn, zeroMm: it.zeroUm / 1000, zeroCheck: M.zeroCheck,
      readingMm: rUm / 1000, expectedMm: exp / 1000, sizeMm: it.sizeUm / 1000, answer: res.parsed.value, answerStr: res.parsed.str,
      ok: res.ok, valueOk: res.valueOk, formatOk: res.formatOk, exact: !!res.exact, intMm: rUm % 1000 === 0,
      runV: S.v.run.slice(), runM: S.m.run.slice(), count: Object.assign({}, S.count)
    });
  }
  function diagnoseM(p, it, zeroCheck) {
    const exp = MC.expectedUm(it, zeroCheck), R = it.readingUm, e = it.zeroUm;
    const a = p.value * 1000;
    if (!zeroCheck && e !== 0) {
      if (Math.abs(a - R) <= 1) return T('你寫的是儀器上的讀數 R，還要減去零點誤差：L = R − e。', 'That is the reading R; you still have to subtract the zero error: L = R − e.');
      if (Math.abs(a - (R + e)) <= 1) return T('零點誤差的正負號弄反了：L = R − e。', 'The sign of the zero error is reversed: L = R − e.');
    }
    const diff = a - exp, ad = Math.abs(diff);
    if (Math.abs(ad - 500) <= 2) return T('剛好差 0.5 mm：下排的半毫米刻線露出來了沒有？套管讀數接近 0 時剛露出，接近 50 時還沒露出。', 'Exactly 0.5 mm off: is the lower half-millimetre line showing? Just showing when the thimble reads near 0; not yet when it reads near 50.');
    if (Math.abs(ad - 1000) <= 2) return T('剛好差 1 mm：上排的整毫米刻線數錯了。', 'Exactly 1 mm off: recount the whole-millimetre lines on top.');
    if (ad < 500 && Math.abs(ad / 10 - Math.round(ad / 10)) < 0.25) return T('套管讀數差了約 ', 'The thimble reading is about ') + Math.round(ad / 10) + T(' 格：看清楚基準線對著哪一格。', ' division(s) off: check which division sits on the reference line.');
    if (ad < 10) return T('估讀差了一點：基準線落在兩格之間的什麼位置？', 'The estimate is a little off: where between two divisions does the reference line fall?');
    return T('先讀套筒（套管邊緣左邊露出的刻線，別漏了半毫米），再讀套管對著基準線的格數。', 'Read the sleeve first (the lines left of the thimble edge — don’t miss the half-millimetre line), then the thimble division on the reference line.');
  }

  // ======================= 多次測量 =======================
  function newRod() {
    const X = state.x;
    X.rodId++;
    X.rod = { trueUm: MC.randInt(rng, 6000, 20000) };
    X.sets = { v20: [], v50: [], micro: [] };
    X.last = { v20: null, v50: null, micro: null };
  }
  function measure(n) {
    const X = state.x;
    const arr = X.sets[X.instr];
    for (let i = 0; i < n && arr.length < 500; i++) {
      const r = MC.simulateReading(X.rod.trueUm, X.instr, X.sigma, X.bias, rng);
      arr.push(r);
      X.last[X.instr] = r;
    }
    if (arr.length >= 500) setStatus(T('這台儀器已經量了 500 次，夠多了；按「全部清除」重新開始。', 'This instrument already has 500 readings — enough. Press “Clear all” to start again.'));
    else setStatus('');
    clampSound();
    if (n > 1) for (let i = 1; i < Math.min(n, 6); i++) setTimeout(clampSound, i * 55);
    const V2 = L.view;
    if (isVernierScene()) addFx(function () { const d = vScene(); return [V2.X(d.s), V2.Y(CAL.plateBot + d.size / 2 + 1.2)]; });
    else addFx(function () { return [V2.X(state.x.rod.trueUm / 1000), V2.Y(0)]; });
    updateMulti();
    requestDraw();
    announceMulti();
    emitStats();
  }
  /** 螢幕閱讀器：每次「量一次／量 10 次」之後念出最新讀數與結果（離散事件，不是每格動畫） */
  function announceMulti() {
    const X = state.x, I = MC.INSTR[X.instr], arr = X.sets[X.instr];
    if (!arr.length) return;
    const S = MC.summarize(arr, X.instr, X.rod.trueUm / 1000, X.uMode);
    let t = T('第 ', 'Reading ') + arr.length + T(' 次讀數 ', ': ') + mmStr(arr[arr.length - 1], I.decimals) + ' mm' + T('。', '. ');
    if (S.result) t += T('平均值 ', 'Mean ') + fx(S.mean, I.decimals + 3) + T(' mm，標準差 ', ' mm, standard deviation ') + fx(S.s, I.decimals + 3) + T(' mm，測量結果 ', ' mm, result ') + minus(S.result.best) + ' ± ' + S.result.unc + ' mm' + T('。', '.');
    $('liveOut').textContent = t;
  }
  function summaries() {
    const X = state.x, out = {};
    ['v20', 'v50', 'micro'].forEach(function (k) { out[k] = MC.summarize(X.sets[k], k, X.rod.trueUm / 1000, 'AB'); });
    return out;
  }
  function emitStats() {
    const X = state.x, S = summaries(), cur = S[X.instr];
    if (!cur.n) return;
    const sets = {};
    Object.keys(S).forEach(function (k) {
      const s = S[k];
      sets[k] = { n: s.n, mean: s.mean, s: s.s, u: s.uAB, best: s.resultAB ? s.resultAB.bestValue : NaN, unc: s.resultAB ? s.resultAB.uncValue : NaN, contains: s.contains };
    });
    emit('stats', {
      instr: X.instr, n: cur.n, mean: cur.mean, s: cur.s, uA: cur.uA, uB: cur.uB, u: cur.uAB, trueMm: X.rod.trueUm / 1000,
      sigma: X.sigma, bias: X.bias, allSame: cur.allSame, precise: cur.precise, accurate: cur.accurate, contains: cur.contains,
      rodId: X.rodId, sets: sets
    });
  }
  function dataChanged(msg) {
    const X = state.x;
    const any = X.sets.v20.length || X.sets.v50.length || X.sets.micro.length;
    X.sets = { v20: [], v50: [], micro: [] };
    X.last = { v20: null, v50: null, micro: null };
    if (any) setStatus(msg);
    updateMulti();
    requestDraw();
  }

  // ---------- 直方圖與四個靶 ----------
  let LH = null;
  function layoutH() {
    const W = hcv.clientWidth || 360;
    const narrow = W < 560;
    const H = narrow ? 400 : 340;
    const s = setupCanvas(hcv, H);
    LH = narrow
      ? { W: W, H: H, dpr: s.dpr, narrow: true, hist: { x: 0, y: 0, w: W, h: 250 }, tg: { x: 0, y: 250, w: W, h: 150 } }
      : { W: W, H: H, dpr: s.dpr, narrow: false, hist: { x: 0, y: 0, w: W * 0.63, h: H }, tg: { x: W * 0.63, y: 0, w: W * 0.37, h: H } };
  }
  /** 標籤底框，但整個框都留在 [x0, x1] 之內 */
  function pillIn(c, text, x, yb, color, align, font, x0, x1) {
    c.font = font;
    const w = c.measureText(text).width + 12;
    let bx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    bx = Math.max(x0, Math.min(x1 - w, bx));
    return LD.pill(c, text, bx, yb, color, 'left', font);
  }
  function niceStep(raw) {
    if (!(raw > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  }
  function decOf(step) { return step >= 1 ? 0 : Math.min(5, Math.ceil(-Math.log10(step) - 1e-9)); }
  function drawHist() {
    if (state.mode !== 'multi') return;
    if (!LH) layoutH();
    const c = hx;
    c.setTransform(LH.dpr, 0, 0, LH.dpr, 0, 0);
    LD.backdrop(c, LH.W, LH.H);
    const X = state.x, I = MC.INSTR[X.instr], ys = X.sets[X.instr].map(function (u) { return u / 1000; });
    const S = MC.summarize(X.sets[X.instr], X.instr, X.rod.trueUm / 1000, X.uMode);
    const tr = X.rod.trueUm / 1000;
    const A = LH.hist, ml = 44, mr = 14, mt = 66, mb = 40;
    const px0 = A.x + ml, px1 = A.x + A.w - mr, py0 = A.y + mt, py1 = A.y + A.h - mb;
    const fs = LH.narrow ? 10.5 : 11.5;
    // 範圍與分組
    const step0 = I.stepUm / 1000;
    let lo = tr, hi = tr;
    ys.forEach(function (v) { lo = Math.min(lo, v); hi = Math.max(hi, v); });
    if (S.n >= 2) { lo = Math.min(lo, S.mean - 2.5 * Math.max(S.s, step0)); hi = Math.max(hi, S.mean + 2.5 * Math.max(S.s, step0)); }
    let bw = step0;
    const factors = [1, 2, 5, 10, 20, 50, 100, 200];
    for (let i = 0; i < factors.length; i++) { bw = step0 * factors[i]; if ((hi - lo) / bw <= 34) break; }
    const pad = Math.max(3 * bw, (hi - lo) * 0.12);
    lo -= pad; hi += pad;
    const bins = MC.histogram(ys, bw, -bw / 2);
    let cmax = 1;
    bins.forEach(function (b) { cmax = Math.max(cmax, b.count); });
    const pdfPeak = S.n >= 2 && S.s > 0 ? S.n * bw / (S.s * Math.sqrt(2 * Math.PI)) : 0;
    const ymax = Math.max(cmax, Math.min(pdfPeak, cmax * 1.6)) * 1.15 + 0.5;
    const Xp = function (v) { return px0 + (v - lo) / (hi - lo) * (px1 - px0); };
    const Yp = function (n) { return py1 - n / ymax * (py1 - py0); };
    // 座標軸與格線
    const xs = niceStep((hi - lo) / (LH.narrow ? 4 : 6)), xd = decOf(xs);
    c.save();
    c.strokeStyle = alpha(C.text, C.dark ? 0.1 : 0.08); c.lineWidth = 1;
    c.font = '600 ' + (fs - 0.5) + 'px ' + FONT; c.fillStyle = C.muted;
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let v = Math.ceil(lo / xs) * xs; v <= hi + 1e-12; v += xs) {
      const x = Math.round(Xp(v)) + 0.5;
      c.beginPath(); c.moveTo(x, py0); c.lineTo(x, py1); c.stroke();
      c.fillText(fx(v, xd), x, py1 + 5);
    }
    const ystep = Math.max(1, niceStep(ymax / 4));
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let n = 0; n <= ymax; n += ystep) {
      const y = Math.round(Yp(n)) + 0.5;
      c.beginPath(); c.moveTo(px0, y); c.lineTo(px1, y); c.stroke();
      c.fillText(String(n), px0 - 6, y);
    }
    c.strokeStyle = alpha(C.text, 0.45);
    c.beginPath(); c.moveTo(px0 + 0.5, py0); c.lineTo(px0 + 0.5, py1 + 0.5); c.lineTo(px1, py1 + 0.5); c.stroke();
    c.fillStyle = C.muted; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillText(T('讀數 x（mm）', 'Reading x (mm)'), (px0 + px1) / 2, A.y + A.h - 4);
    c.save(); c.translate(A.x + 11, (py0 + py1) / 2); c.rotate(-Math.PI / 2); c.textBaseline = 'middle';
    c.fillText(T('次數', 'Count'), 0, 0); c.restore();
    c.restore();
    if (!ys.length) {
      LD.pill(c, T('按「量一次」或「量 10 次」開始收集數據', 'Press “Measure once” or “Measure 10 times” to collect data'), (px0 + px1) / 2, (py0 + py1) / 2 + 8, C.muted, 'center', '600 ' + fs + 'px ' + FONT);
    }
    // ±s 帶
    if (S.n >= 2 && S.s > 0) {
      c.fillStyle = alpha(C.accent, C.dark ? 0.1 : 0.08);
      c.fillRect(Xp(S.mean - S.s), py0, Xp(S.mean + S.s) - Xp(S.mean - S.s), py1 - py0);
    }
    // 長條
    bins.forEach(function (b) {
      if (!b.count) return;
      const x0 = Xp(b.x0) + 1, x1 = Xp(b.x1) - 1, y = Yp(b.count);
      LD.block(c, x0, y, Math.max(2, x1 - x0), py1 - y, C.accent, { r: Math.min(3, (x1 - x0) / 3), shadow: false });
    });
    // 常態分布曲線
    if (S.n >= 2 && S.s > 0) {
      c.save();
      c.beginPath(); c.rect(px0, py0 - 4, px1 - px0, py1 - py0 + 4); c.clip();
      c.strokeStyle = C.pos; c.lineWidth = 2; c.lineJoin = 'round';
      c.beginPath();
      for (let i = 0; i <= 160; i++) {
        const v = lo + (hi - lo) * i / 160, z = (v - S.mean) / S.s;
        const n = S.n * bw / (S.s * Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z);
        const x = Xp(v), y = Yp(n);
        if (i) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.stroke();
      c.restore();
    }
    // 真值（虛線）與平均值（實線）
    c.save();
    c.strokeStyle = C.probe; c.lineWidth = 2; c.setLineDash([6, 4]);
    c.beginPath(); c.moveTo(Xp(tr), py0 - 6); c.lineTo(Xp(tr), py1); c.stroke();
    c.restore();
    const meanRight = S.n >= 1 && S.mean >= tr;
    pillIn(c, T('真值 ', 'True ') + fx(tr, 3), Xp(tr) + (meanRight ? -4 : 4), py0 - 6, C.probe, meanRight ? 'right' : 'left', '700 ' + fs + 'px ' + FONT, A.x + 2, A.x + A.w - 2);
    if (S.n >= 1) {
      c.strokeStyle = C.text; c.lineWidth = 2;
      c.beginPath(); c.moveTo(Xp(S.mean), py0 + 10); c.lineTo(Xp(S.mean), py1); c.stroke();
      pillIn(c, T('平均 ', 'Mean ') + fx(S.mean, I.decimals + 2), Xp(S.mean) + (meanRight ? 4 : -4), py0 + 22, C.text, meanRight ? 'left' : 'right', '700 ' + fs + 'px ' + FONT, px0 + 2, px1);
    }
    // 測量結果 X ± ΔX 的區間
    if (S.result) {
      const xa = Xp(S.result.bestValue - S.result.uncValue), xb = Xp(S.result.bestValue + S.result.uncValue), yb = py0 - 40;
      c.strokeStyle = C.accent; c.lineWidth = 2.5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(xa, yb); c.lineTo(xb, yb); c.moveTo(xa, yb - 5); c.lineTo(xa, yb + 5); c.moveTo(xb, yb - 5); c.lineTo(xb, yb + 5); c.stroke();
      c.fillStyle = C.accent; c.beginPath(); c.arc(Xp(S.result.bestValue), yb, 3.5, 0, Math.PI * 2); c.fill();
      const txt = 'X ± ΔX = ' + minus(S.result.best) + ' ± ' + S.result.unc + ' mm';
      const left = (xa + xb) / 2 > (px0 + px1) / 2;
      pillIn(c, txt, left ? Math.min(xa, px1) - 8 : Math.max(xb, px0) + 8, yb + 8, C.accent, left ? 'right' : 'left', '700 ' + fs + 'px ' + FONT, A.x + 2, A.x + A.w - 2);
    }
    drawTargets(c, S);
  }
  // 四個靶（示意）：準確又精密、精密但不準確、準確但不精密、都不
  const TGT = [
    { key: 'ap', zh: '準確又精密', en: 'Accurate & precise', ox: 0, oy: 0, sp: 0.09 },
    { key: 'p', zh: '精密但不準確', en: 'Precise, not accurate', ox: 0.46, oy: -0.32, sp: 0.08 },
    { key: 'a', zh: '準確但不精密', en: 'Accurate, not precise', ox: 0, oy: 0, sp: 0.36 },
    { key: 'n', zh: '不準確也不精密', en: 'Neither', ox: 0.4, oy: 0.36, sp: 0.3 }
  ];
  function drawTargets(c, S) {
    const A = LH.tg;
    const cls = S.n >= 2 ? (S.precise ? (S.accurate ? 'ap' : 'p') : (S.accurate ? 'a' : 'n')) : null;
    const cols = LH.narrow ? 4 : 2, rows = LH.narrow ? 1 : 2;
    const cw = A.w / cols, ch = A.h / rows;
    const fs = LH.narrow ? 9.5 : 11.5;
    TGT.forEach(function (t, i) {
      const cx0 = A.x + (i % cols) * cw, cy0 = A.y + Math.floor(i / cols) * ch;
      const R = Math.max(10, Math.min(cw / 2 - 8, (ch - (LH.narrow ? 34 : 40)) / 2));
      const xc = cx0 + cw / 2, yc = cy0 + 8 + R + (LH.narrow ? 2 : 6);
      const on = cls === t.key;
      if (on) {
        roundRect(c, cx0 + 3, cy0 + 3, cw - 6, ch - 6, 10);
        c.fillStyle = alpha(C.accent, C.dark ? 0.16 : 0.1); c.fill();
        c.strokeStyle = C.accent; c.lineWidth = 2; c.stroke();
      }
      // 靶環
      for (let k = 5; k >= 1; k--) {
        c.fillStyle = k % 2 ? (C.dark ? shade(C.pos, -0.35) : shade(C.pos, 0.55)) : (C.dark ? shade(C.surface, 0.05) : C.surface);
        c.beginPath(); c.arc(xc, yc, R * k / 5, 0, Math.PI * 2); c.fill();
      }
      c.strokeStyle = alpha(C.text, 0.25); c.lineWidth = 1;
      c.beginPath(); c.arc(xc, yc, R, 0, Math.PI * 2); c.stroke();
      // 箭（示意，固定位置）
      const g = MC.mulberry32(101 + i * 17);
      for (let j = 0; j < 9; j++) {
        const dx = (t.ox + t.sp * MC.gaussian(g)) * R, dy = (t.oy + t.sp * MC.gaussian(g)) * R;
        LD.ball(c, xc + dx, yc + dy, Math.max(2, R * 0.06), C.neg, { shadow: false });
      }
      c.font = (on ? '700 ' : '600 ') + fs + 'px ' + FONT;
      c.fillStyle = on ? C.accent : C.muted;
      c.textAlign = 'center'; c.textBaseline = 'top';
      const lbl = T(t.zh, t.en);
      if (LH.narrow && T('', 'x') === 'x') {
        const parts = lbl.split(/, | & /);
        parts.forEach(function (p, k) { c.fillText(p + (k < parts.length - 1 ? (lbl.indexOf('&') >= 0 ? ' &' : ',') : ''), xc, yc + R + 5 + k * (fs + 2)); });
      } else c.fillText(lbl, xc, yc + R + 5);
      if (on) LD.pill(c, T('你的數據', 'Your data'), xc, cy0 + 20, C.accent, 'center', '700 ' + fs + 'px ' + FONT);
    });
  }

  // ---------- 多次測量的表格與讀數 ----------
  function updateMulti() {
    if (state.mode !== 'multi') return;
    const X = state.x, I = MC.INSTR[X.instr], arr = X.sets[X.instr];
    const S = MC.summarize(arr, X.instr, X.rod.trueUm / 1000, X.uMode);
    const dec = I.decimals;
    // 數據表（最新的在最上面）
    let h = '<thead><tr><th>' + T('次', '#') + '</th><th>' + T('讀數 x', 'Reading x') + '<br><small>(mm)</small></th><th>' + T('與平均值的差', 'Deviation') + '<br><small>(mm)</small></th></tr></thead><tbody>';
    // 沒有數據時的提示用 <th>，classroom.js 的「下載 CSV」才會維持停用
    if (!arr.length) h += '<tr class="empty"><th colspan="3">' + T('還沒有數據', 'No data yet') + '</th></tr>';
    for (let i = arr.length - 1; i >= 0; i--) {
      const x = arr[i] / 1000, dv = x - S.mean;
      h += '<tr' + (i === arr.length - 1 ? ' class="latest"' : '') + '><th>' + (i + 1) + '</th><td>' + fx(x, dec) + '</td><td class="' + (dv > 1e-12 ? 'pos' : dv < -1e-12 ? 'neg' : '') + '">' + (arr.length >= 2 ? fxs(dv, dec + 1) : '—') + '</td></tr>';
    }
    $('tbl').innerHTML = h + '</tbody>';
    // 統計
    const row = function (dt, dd) { return '<dt>' + dt + '</dt><dd>' + dd + '</dd>'; };
    let o = '';
    o += row(T('儀器的精度（最小讀數）d', 'Precision (smallest reading) d'), I.lc.toFixed(2) + ' mm');
    o += row(T('次數 n', 'Readings n'), String(S.n));
    o += row(T('平均值 <span class="xbar">x</span>', 'Mean <span class="xbar">x</span>'), S.n ? fx(S.mean, dec + 3) + ' mm' : '—');
    o += row(T('樣本標準差 s<small>分母 n − 1</small>', 'Sample std. dev. s<small>divide by n − 1</small>'), S.n >= 2 ? fx(S.s, dec + 3) + ' mm' : '—');
    o += row(T('標準差 s<sub>n</sub><small>分母 n；不是滑桿的 σ</small>', 'Std. dev. s<sub>n</sub><small>divide by n; not the slider’s σ</small>'), S.n >= 1 ? fx(S.sp, dec + 3) + ' mm' : '—');
    o += row('<span class="f">' + T('A 類', 'Type A') + ' u<sub>A</sub> = s/√n</span>', S.n >= 2 ? fx(S.uA, dec + 3) + ' mm' : '—');
    o += row('<span class="f">' + T('B 類', 'Type B') + ' u<sub>B</sub> = d/(2√3)</span>', fx(S.uB, dec + 3) + ' mm');
    o += row('<span class="f">' + T('組合', 'Combined') + ' √(u<sub>A</sub><sup>2</sup> + u<sub>B</sub><sup>2</sup>)</span>', S.n >= 2 ? fx(S.uAB, dec + 3) + ' mm' : '—');
    if (S.result) {
      o += '<dd class="big">' + minus(S.result.best) + ' ± ' + S.result.unc + ' mm</dd>';
      o += '<dd class="note">' + T('ΔX：', 'ΔX: ') + fx(S.u, 6) + T(' 無條件進位取 2 位有效數字 → ', ' rounded up to 2 significant figures → ') + S.result.unc +
        T(' mm；X：平均值四捨五入到小數第 ', ' mm. X: the mean rounded to ') + S.result.decimals + T(' 位 → ', ' decimal places → ') + minus(S.result.best) +
        T(' mm（', ' mm (') + S.result.sig + T(' 位有效數字）。', ' significant figures).') + (X.uMode === 'A' ? T('（只算 A 類）', ' (Type A only)') : T('（A、B 類組合）', ' (A and B combined)')) + '</dd>';
    } else if (S.n === 1) o += '<dd class="note">' + T('至少要量 2 次才能算標準差。', 'You need at least 2 readings for a standard deviation.') + '</dd>';
    else if (S.n >= 2 && X.uMode === 'A' && !(S.uA > 0)) o += '<dd class="note">' + T('每次讀數都一樣，A 類不確定度是 0：這時要靠 B 類（儀器的精度）來估計。', 'Every reading is the same, so Type A is 0: the uncertainty must then come from Type B (the instrument’s precision).') + '</dd>';
    o += row(T('真值<small>只有模擬知道</small>', 'True value<small>only the simulation knows</small>'), fx(X.rod.trueUm / 1000, 3) + ' mm');
    if (S.n) o += row(T('平均值 − 真值', 'Mean − true value'), fxs(S.mean - X.rod.trueUm / 1000, dec + 3) + ' mm');
    if (S.n >= 2) {
      o += '<dd class="' + (S.precise ? 'ok' : 'warn') + '">' + (S.precise ? T('精密：s ≤ 2d = ', 'Precise: s ≤ 2d = ') : T('不精密：s > 2d = ', 'Not precise: s > 2d = ')) + fx(S.tau, 2) + ' mm</dd>';
      o += '<dd class="' + (S.accurate ? 'ok' : 'warn') + '">' + (S.accurate ? T('準確：平均值與真值相差不到 2√(u<sub>A</sub><sup>2</sup> + u<sub>B</sub><sup>2</sup>) = ', 'Accurate: the mean is within 2√(u<sub>A</sub><sup>2</sup> + u<sub>B</sub><sup>2</sup>) = ') : T('不準確：平均值與真值相差超過 2√(u<sub>A</sub><sup>2</sup> + u<sub>B</sub><sup>2</sup>) = ', 'Not accurate: the mean is more than 2√(u<sub>A</sub><sup>2</sup> + u<sub>B</sub><sup>2</sup>) = ')) + fx(2 * S.uAB, dec + 3) + ' mm' + (S.accurate ? '' : T('（有系統誤差）', ' from the true value (systematic error)')) + (S.accurate ? T('', ' of the true value') : '') + '</dd>';
    }
    $('statOut').innerHTML = o;
    // 三種儀器比較
    const all = summaries();
    const names = { v20: T('游標尺 0.05', 'Vernier 0.05'), v50: T('游標尺 0.02', 'Vernier 0.02'), micro: T('測微器', 'Micrometer') };
    let t = '<thead><tr><th>' + T('儀器', 'Instrument') + '</th><th>n</th><th>X ± ΔX (mm)</th><th>' + T('含真值', 'Contains') + '</th></tr></thead><tbody>';
    ['v20', 'v50', 'micro'].forEach(function (k) {
      const s = all[k], r = s.resultAB;
      t += '<tr' + (k === X.instr ? ' class="cur"' : '') + '><td>' + names[k] + '</td><td>' + s.n + '</td><td>' + (r ? minus(r.best) + ' ± ' + r.unc : '—') + '</td><td class="' + (r ? (s.contains ? 'yes' : 'no') : '') + '">' + (r ? (s.contains ? '✓' : '✗') : '') + '</td></tr>';
    });
    $('cmpTbl').innerHTML = t + '</tbody>';
    // 直方圖畫布的文字說明（螢幕閱讀器）
    const cls = S.n >= 2 ? (S.precise ? (S.accurate ? T('準確又精密', 'accurate and precise') : T('精密但不準確', 'precise but not accurate')) : (S.accurate ? T('準確但不精密', 'accurate but not precise') : T('不準確也不精密', 'neither accurate nor precise'))) : '';
    hcv.setAttribute('aria-label', S.n
      ? T('讀數的直方圖：', 'Histogram of the readings: ') + S.n + T(' 次，平均值 ', ' readings, mean ') + fx(S.mean, dec + 3) + T(' mm，真值 ', ' mm, true value ') + fx(X.rod.trueUm / 1000, 3) + ' mm' +
        (S.n >= 2 ? T('，標準差 ', ', standard deviation ') + fx(S.s, dec + 3) + T(' mm；數據屬於「', ' mm; the data are ') + cls + T('」。', '.') : T('。', '.'))
      : T('讀數的直方圖：還沒有數據。', 'Histogram of the readings: no data yet.'));
    drawHist();
  }

  // ======================= 介面 =======================
  function updateScore() {
    const S = state.score, s = state.mode === 'micro' ? S.m : S.v;
    const row = function (dt, dd) { return '<dt>' + dt + '</dt><dd>' + dd + '</dd>'; };
    let o = row(T('讀對／核對', 'Correct / checked'), s.ok + ' / ' + s.tries);
    o += row(T('目前連續讀對', 'Current streak'), String(s.run.length));
    o += row(T('最長連續讀對', 'Best streak'), String(s.best));
    $('scoreOut').innerHTML = o + '<dd class="note">' + T('零點讀數的核對不列入成績。', 'Checking a zero reading does not count here.') + '</dd>';
  }
  function updateLabels() {
    const m = state.mode;
    const o = m === 'micro' ? state.m : state.v;
    let lbl = T('讀數（mm）', 'Reading (mm)');
    if (o.zeroCheck) lbl = T('零點讀數 e（mm）', 'Zero reading e (mm)');
    else if (o.zeroOn) lbl = T('修正後的長度 L（mm）', 'Corrected length L (mm)');
    $('ansLabel').textContent = lbl;
    $('ans').placeholder = m === 'micro' ? T('例如 2.874', 'e.g. 2.874') : T('例如 23.45', 'e.g. 23.45');
    $('zeroBtn').textContent = o.zeroCheck ? T('放回物件', 'Put the object back') : T('檢查零點', 'Check the zero');
    $('closeBtn').textContent = m === 'micro' ? T('轉到接觸', 'Turn to contact') : (state.v.zeroCheck ? T('合攏', 'Close') : T('夾緊', 'Close on the object'));
    $('openBtn').textContent = m === 'micro' ? T('退開', 'Back off') : T('鬆開', 'Open');
    if (m === 'vernier') {
      const N = state.v.N;
      $('vHint').textContent = (N === 20 ? T('20 格副尺總長 19 mm，每格 0.95 mm：比主尺每格短 0.05 mm。', 'The 20 vernier divisions span 19 mm, 0.95 mm each — 0.05 mm shorter than a main-scale division.')
        : T('50 格副尺總長 49 mm，每格 0.98 mm：比主尺每格短 0.02 mm。', 'The 50 vernier divisions span 49 mm, 0.98 mm each — 0.02 mm shorter than a main-scale division.')) +
        T('副尺上的數字 1、2、3……代表 0.1、0.2、0.3 mm。', ' The vernier numbers 1, 2, 3 … mean 0.1, 0.2, 0.3 mm.');
    }
  }
  function updateButtons() {
    const m = state.mode;
    if (m === 'vernier') {
      $('closeBtn').disabled = state.v.touching;
    } else if (m === 'micro') {
      $('closeBtn').disabled = state.m.touching;
    }
  }
  function applyMode() {
    const m = state.mode;
    document.querySelectorAll('.modebar button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === m)); });
    $('cardV').hidden = m !== 'vernier';
    $('cardM').hidden = m !== 'micro';
    $('cardX').hidden = m !== 'multi';
    $('cardScore').hidden = m === 'multi';
    $('howV').hidden = m !== 'vernier';
    $('howM').hidden = m !== 'micro';
    $('howX').hidden = m !== 'multi';
    $('jawBtns').hidden = m === 'multi';
    $('rotBox').hidden = m !== 'micro';
    $('measBtns').hidden = m !== 'multi';
    $('ansBox').hidden = m === 'multi';
    $('labStats').hidden = m !== 'multi';
    $('namesBtn').hidden = m === 'multi';
    cv.classList.toggle('spin', m === 'micro');
    syncKeys();
    syncZoomButtons();
    updateLabels();
    updateScore();
    updateButtons();
    clearFeedback();
    setStatus('');
    $('sceneHint').textContent = m === 'vernier'
      ? T('依比例繪製（主畫面縮小、放大鏡放大）。拖曳副尺夾住物體；在放大鏡上左右拖曳，可以沿著副尺找對齊的刻線。', 'Drawn to scale (the main view is reduced, the magnifier enlarged). Drag the slider to close the jaws; drag the magnifier sideways to look along the vernier for the line that lines up.')
      : m === 'micro'
        ? T('依比例繪製。套管上下拖曳轉動（一格 0.01 mm）、左右拖曳快轉；碰到物體後再轉，棘輪就會打滑「喀喀」響。', 'Drawn to scale. Drag the thimble up or down to turn it (0.01 mm per division), sideways to spin it fast; once the spindle touches, the ratchet slips and clicks.')
        : T('每按一次就量一次；讀數 = 真值 + 系統誤差 + 隨機誤差，再取到儀器讀得出的值。', 'Each press takes one reading: reading = true value + systematic error + random error, rounded to what the instrument can show.');
    L = null; LH = null;
    layout();
    if (m === 'multi') { layoutH(); updateMulti(); }
    requestDraw();
  }
  function syncZoomButtons() {
    const z = zoomNow();
    document.querySelectorAll('.seg5 button').forEach(function (b) {
      const v = +b.getAttribute('data-zoom');
      b.setAttribute('aria-pressed', String(v === z));
      b.disabled = !isVernierScene() && v === 16;
    });
  }

  // ---------- 按鈕 ----------
  document.querySelectorAll('.modebar button').forEach(function (b) {
    b.addEventListener('click', function () {
      const m = b.getAttribute('data-mode');
      if (m === state.mode) return;
      state.v.anim = null; state.m.anim = null;
      state.mode = m;
      applyMode();
    });
  });
  document.querySelectorAll('.seg5 button').forEach(function (b) {
    b.addEventListener('click', function () {
      const z = +b.getAttribute('data-zoom');
      if (isVernierScene()) {
        // 保持放大鏡中心不變
        const d = vScene(), c0 = magCenterV(d);
        state.zoomV = z;
        if (state.mode === 'vernier') { state.v.pan = c0 - (d.s + d.e); clampPan(); }
      } else state.zoomM = z;
      syncZoomButtons();
      requestDraw();
    });
  });
  $('namesBtn').addEventListener('click', function () {
    state.names = !state.names;
    $('namesBtn').setAttribute('aria-pressed', String(state.names));
    requestDraw();
  });
  $('closeBtn').addEventListener('click', function () {
    if (state.mode === 'vernier') { const lim = vLimit(); startAnim('v', lim, 45); }
    else if (state.mode === 'micro') { startAnim('m', mLimit(), Math.max(3, Math.abs(state.m.s - mLimit()) * 2.5)); }
  });
  $('openBtn').addEventListener('click', function () {
    if (state.mode === 'vernier') {
      const V = state.v, out = V.kind === 'outer' || V.zeroCheck;
      startAnim('v', out ? Math.min(CAL.sMax, V.s + 6) : Math.max(0, V.s - 6), 45);
    } else if (state.mode === 'micro') startAnim('m', Math.min(MIC.range, state.m.s + 1), 6);
  });
  $('zeroBtn').addEventListener('click', function () {
    if (state.mode === 'vernier') {
      const V = state.v;
      V.zeroCheck = !V.zeroCheck; V.overlay = null; V.anim = null;
      const D = V.item.sizeUm / 1000;
      if (!V.zeroCheck) {
        if (V.kind === 'outer' && V.s < D + 0.5) V.s = D + 7;
        if (V.kind !== 'outer' && V.s > D - 0.5) V.s = Math.max(V.kind === 'inner' ? 1.2 : 0, D - 7);
      }
      V.touching = Math.abs(V.s - vLimit()) < 1e-9;
      setStatus(V.zeroCheck ? T('物件移開了：把夾爪合攏，讀出零點讀數 e。', 'Object removed: close the jaws and read the zero reading e.') : T('物件放回去了。', 'The object is back.'));
    } else if (state.mode === 'micro') {
      const M = state.m;
      M.zeroCheck = !M.zeroCheck; M.overlay = null; M.anim = null; M.clicks = 0; M.push = 0;
      const D = M.item.sizeUm / 1000;
      if (!M.zeroCheck && M.s < D + 0.05) M.s = Math.min(MIC.range, D + 1.2);
      M.touching = Math.abs(M.s - mLimit()) < 1e-9;
      setStatus(M.zeroCheck ? T('物件移開了：轉到測軸碰到測砧，讀出零點讀數 e。', 'Object removed: turn until the spindle meets the anvil and read the zero reading e.') : T('物件放回去了。', 'The object is back.'));
    }
    $('ans').value = '';
    clearFeedback();
    updateLabels(); updateButtons();
    requestDraw();
  });
  $('newBtn').addEventListener('click', function () {
    if (state.mode === 'vernier') newVernierItem(); else newMicroItem();
    setStatus(T('換了一個新的物件。', 'Here is a new object.'));
    updateButtons();
    requestDraw();
  });
  document.querySelectorAll('#rotBox button').forEach(function (b) {
    b.addEventListener('click', function () {
      const n = +b.getAttribute('data-rot');
      if (Math.abs(n) >= 50) startAnim('m', state.m.s + n * 0.01, 3);
      else { mMove(n * 0.01); afterMove(); requestDraw(); }
    });
  });
  $('ansBox').addEventListener('submit', function (ev) { ev.preventDefault(); check(); });
  // 游標尺設定
  document.querySelectorAll('[data-n]').forEach(function (b) {
    b.addEventListener('click', function () {
      const N = +b.getAttribute('data-n');
      if (N === state.v.N) return;
      state.v.N = N;
      state.zoomV = N === 20 ? 4 : 8;
      document.querySelectorAll('[data-n]').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      newVernierItem(); syncZoomButtons(); updateButtons(); requestDraw();
    });
  });
  document.querySelectorAll('[data-kind]').forEach(function (b) {
    b.addEventListener('click', function () {
      const k = b.getAttribute('data-kind');
      if (k === state.v.kind) return;
      state.v.kind = k;
      document.querySelectorAll('[data-kind]').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      newVernierItem();
      L = null; layout(); updateButtons(); requestDraw();
    });
  });
  $('zeroOnV').addEventListener('change', function (ev) {
    state.v.zeroOn = ev.target.checked;
    newVernierItem();
    setStatus(state.v.zeroOn ? T('這把游標尺有零點誤差：先檢查零點，再修正讀數。', 'This caliper has a zero error: check the zero first, then correct your reading.') : '');
    updateButtons(); requestDraw();
  });
  // 螺旋測微器設定
  document.querySelectorAll('[data-obj]').forEach(function (b) {
    b.addEventListener('click', function () {
      const k = b.getAttribute('data-obj');
      if (k === state.m.kind) return;
      state.m.kind = k;
      document.querySelectorAll('[data-obj]').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      newMicroItem(); updateButtons(); requestDraw();
    });
  });
  $('zeroOnM').addEventListener('change', function (ev) {
    state.m.zeroOn = ev.target.checked;
    newMicroItem();
    setStatus(state.m.zeroOn ? T('這支測微器有零點誤差：先檢查零點，再修正讀數。', 'This micrometer has a zero error: check the zero first, then correct your reading.') : '');
    updateButtons(); requestDraw();
  });
  // 多次測量設定
  const elSig = $('sig'), elBias = $('bias');
  function refreshOutputs() {
    $('sigo').textContent = fmtSlider(val(elSig), elSig) + ' mm';
    const b = val(elBias);
    $('biaso').textContent = (b > 0 ? '+' : b < 0 ? '−' : '') + fmtSlider(Math.abs(b), elBias) + ' mm';
  }
  elSig.addEventListener('input', function () {
    state.x.sigma = Math.max(0, val(elSig));
    refreshOutputs();
    dataChanged(T('隨機誤差改了：重新開始收集數據。', 'The random error changed: collecting a new set of data.'));
  });
  elBias.addEventListener('input', function () {
    state.x.bias = val(elBias);
    refreshOutputs();
    dataChanged(T('系統誤差改了：重新開始收集數據。', 'The systematic error changed: collecting a new set of data.'));
  });
  document.querySelectorAll('[data-instr]').forEach(function (b) {
    b.addEventListener('click', function () {
      const k = b.getAttribute('data-instr');
      if (k === state.x.instr) return;
      state.x.instr = k;
      document.querySelectorAll('[data-instr]').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      syncZoomButtons();
      L = null; layout(); updateMulti(); requestDraw();
    });
  });
  document.querySelectorAll('[data-u]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.x.uMode = b.getAttribute('data-u');
      document.querySelectorAll('[data-u]').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      updateMulti();
    });
  });
  $('newRod').addEventListener('click', function () {
    newRod();
    setStatus(T('換了一根新的圓棒：重新開始收集數據。', 'A new rod: collecting a new set of data.'));
    updateMulti(); requestDraw();
  });
  $('meas1').addEventListener('click', function () { measure(1); });
  $('meas10').addEventListener('click', function () { measure(10); });

  // 全部清除：多次測量的所有數據與讀數成績（設定不變）
  $('clearAll').addEventListener('click', function () {
    const X = state.x;
    X.sets = { v20: [], v50: [], micro: [] };
    X.last = { v20: null, v50: null, micro: null };
    state.score = newScore();
    state.v.overlay = null; state.m.overlay = null; state.m.clicks = 0;
    clearFeedback();
    setStatus(T('已全部清除：多次測量的數據與讀數成績都清空了，設定不變。', 'Everything is cleared: the repeated-measurement data and the reading scores; the settings are kept.'));
    updateScore();
    updateMulti();
    requestDraw();
  });

  // ======================= 音效（sound.js；音效關閉時完全不呼叫） =======================
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  let lastClick = 0;
  /** 夾爪碰到物體：清脆的「喀」 */
  function clampSound() {
    const S = sound(); if (!S) return;
    const now = performance.now();
    if (now - lastClick < 40) return;
    lastClick = now;
    S.noise({ dur: 0.025, gain: 0.45, filter: 3400, q: 2.2 });
    S.tone({ freq: 1850, dur: 0.03, type: 'triangle', gain: 0.22 });
    S.tone({ freq: 620, dur: 0.035, type: 'sine', gain: 0.16 });
  }
  /** 棘輪打滑：較輕、較高的「嗒」 */
  let lastRatchet = 0;
  function ratchetSound() {
    const S = sound(); if (!S) return;
    const now = performance.now();
    if (now - lastRatchet < 35) return;
    lastRatchet = now;
    S.noise({ dur: 0.012, gain: 0.3, filter: 5200, q: 2.5 });
    S.tone({ freq: 2900, dur: 0.012, type: 'triangle', gain: 0.12 });
  }
  /** 核對：答對是輕柔的上行兩音，答錯是輕柔的下行兩音（都在 300 Hz 以上） */
  function resultSound(ok) {
    const S = sound(); if (!S) return;
    if (ok) { S.tone({ freq: 784, dur: 0.14, gain: 0.16 }); S.tone({ freq: 1175, dur: 0.2, gain: 0.14, delay: 0.1 }); }
    else { S.tone({ freq: 440, dur: 0.16, gain: 0.13 }); S.tone({ freq: 349, dur: 0.22, gain: 0.12, delay: 0.12 }); }
  }
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

  // ======================= 鍵盤操作（keys.js）與分享狀態（classroom.js） =======================
  let kb = null;
  const kbItems = [];
  function kbOn(i) { return !!(kb && kb.focused() && kb.index() === i); }
  function kbFrame(c, x, y, w, h) {
    c.save();
    c.setLineDash([5, 4]);
    c.strokeStyle = C.accent; c.lineWidth = 2;
    roundRect(c, x, y, w, h, 8); c.stroke();
    c.restore();
  }
  const KB_SLIDER = {
    name: function () { return T('副尺（夾爪）', 'slider (jaws)'); },
    move: function (dx, dy, big) {
      // 右、上 = 往右（量外徑是張開，量內徑、深度是往物體推）；與拖曳完全相同的限制
      const moved = vSetS(state.v.s + (dx || dy) * (big ? 2 : 0.2));
      afterMove(); requestDraw();
      return moved;
    },
    describe: function () {
      const V = state.v;
      return V.touching ? (V.zeroCheck ? T('兩個外測爪已經合攏，可以讀零點。', 'The jaws are closed: read the zero.') : T('已經碰到物體，可以讀數。', 'Touching the object: take the reading.'))
        : T('還沒碰到物體。', 'Not touching yet.');
    }
  };
  const KB_LENS = {
    name: function () { return T('放大鏡', 'magnifier'); },
    move: function (dx, dy, big) {
      const V = state.v, VN = MC.VERNIER[V.N];
      if (V.pan == null) clampPan();
      const before = V.pan;
      V.pan += (dx || dy) * (big ? 5 : 1) * VN.div;
      clampPan(); requestDraw();
      return Math.abs(V.pan - before) > 1e-9;
    },
    describe: function () {
      const V = state.v, VN = MC.VERNIER[V.N], z = ZOOM_BASE * state.zoomV, half = L.mag.w / 2 / z;
      if (V.pan == null) clampPan();
      const a = Math.max(0, Math.ceil((V.pan - half) / VN.div)), b = Math.min(V.N, Math.floor((V.pan + half) / VN.div));
      return T('放大鏡裡看得到副尺第 ', 'The magnifier shows vernier lines ') + a + T(' 到第 ', ' to ') + b + T(' 條刻線。', '.');
    }
  };
  const KB_THIMBLE = {
    name: function () { return T('套管', 'thimble'); },
    move: function (dx, dy, big) {
      // 左、下 = 夾緊（測軸前進）；右、上 = 退開。每次 1 格（0.01 mm），Shift 一圈（0.5 mm）
      const moved = mMove((dx || dy) * (big ? 0.5 : 0.01));
      afterMove(); requestDraw();
      return moved || state.m.touching;
    },
    describe: function () {
      const M = state.m;
      if (!M.touching) return T('測軸還沒碰到物體。', 'The spindle is not touching yet.');
      return (M.zeroCheck ? T('測軸已碰到測砧。', 'The spindle is on the anvil.') : T('測軸已碰到物體。', 'The spindle is touching the object.')) +
        (M.clicks ? T('棘輪「喀」了 ', ' The ratchet has clicked ') + M.clicks + T(' 次。', ' times.') : '');
    }
  };
  /** 依模式更新鍵盤可操作的物件、畫布的角色與說明 */
  function syncKeys() {
    const m = state.mode;
    kbItems.length = 0;
    if (m === 'vernier') kbItems.push(KB_SLIDER, KB_LENS);
    else if (m === 'micro') kbItems.push(KB_THIMBLE);
    if (kb) kb.select(0);
    if (m === 'multi') {
      cv.setAttribute('role', 'img');
      cv.removeAttribute('aria-roledescription');
      cv.tabIndex = -1;
      cv.setAttribute('aria-label', T('多次測量的畫面：儀器夾著圓棒，右上角是最新一次的讀數。', 'Repeated measurements: the instrument on the rod, with the latest reading at the top right.'));
    } else {
      cv.setAttribute('role', 'application');
      cv.setAttribute('aria-roledescription', T('互動實驗畫布', 'interactive simulation canvas'));
      cv.tabIndex = 0;
      cv.setAttribute('aria-label', m === 'vernier'
        ? T('游標尺畫布：上方是整支游標尺與待測物，下方是讀刻度用的放大鏡。按 Enter 切換「副尺」與「放大鏡」；方向鍵移動，右、上是往右，每次 0.2 mm（放大鏡每次一格副尺刻度）；Shift 加方向鍵移動得更多。',
          'Vernier caliper: the whole caliper with the object above, a magnifier for reading the scale below. Press Enter to switch between the slider and the magnifier; the arrow keys move it, right or up to the right, by 0.2 mm (one vernier division for the magnifier); hold Shift for bigger steps.')
        : T('螺旋測微器畫布：上方是整支測微器與待測物，下方是讀刻度用的放大鏡。方向鍵轉動套管：左、下是夾緊，右、上是退開，每次 1 格（0.01 mm）；Shift 加方向鍵每次 1 圈（0.5 mm）。碰到物體後再夾緊，棘輪會打滑。',
          'Micrometer: the whole micrometer with the object above, a magnifier for reading the scale below. The arrow keys turn the thimble: left or down closes, right or up opens, one division (0.01 mm) a step; Shift with an arrow key turns one full turn (0.5 mm). Once it touches, closing further makes the ratchet slip.'));
    }
  }
  if (window.LabKeys) kb = window.LabKeys.attach(cv, { items: kbItems, onChange: requestDraw });

  // 分享連結：目前的待測物、夾爪與套管位置、多次測量的圓棒（按鈕、勾選框、滑桿由 classroom.js 自動記錄）
  const intIn = function (v, a, b) { v = Math.round(+v); return isFinite(v) && v >= a && v <= b ? v : null; };
  // classroom.js 由 settings.js 在 DOMContentLoaded 時才載入：還沒有 LabShare 就等 window load 再登記（還原在 load 之後才做）
  let shareOn = false;
  function registerShare() {
    if (shareOn || !window.LabShare) return;
    shareOn = true;
    window.LabShare.register(shareHooks);
  }
  const shareHooks = {
    get: function () {
      const V = state.v, M = state.m;
      return {
        v: { size: V.item.sizeUm, zero: V.item.zeroUm, s: Math.round(V.s * 1000), z: V.zeroCheck ? 1 : 0 },
        m: { size: M.item.sizeUm, zero: M.item.zeroUm, s: Math.round(M.s * 1000), z: M.zeroCheck ? 1 : 0 },
        rod: state.x.rod.trueUm, names: state.names ? 1 : 0
      };
    },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      const V = state.v, M = state.m;
      if (o.v && typeof o.v === 'object') {
        const c = MC.VERNIER[V.N].cUm, r = MC.V_RANGE[V.kind], zmax = c * (V.N === 20 ? 6 : 10);
        const size = intIn(o.v.size, r[0], r[1]), zero = intIn(o.v.zero, -zmax, zmax);
        if (size != null && size % c === 0) V.item.sizeUm = size;
        if (!V.zeroOn) V.item.zeroUm = 0;
        else if (zero != null && zero !== 0 && zero % c === 0) V.item.zeroUm = zero;
        V.item.readingUm = V.item.sizeUm + V.item.zeroUm;
        V.zeroCheck = o.v.z === 1; V.overlay = null; V.anim = null; V.pan = null; V.checked = false;
        vInitS();
        const sv = intIn(o.v.s, 0, CAL.sMax * 1000);
        if (sv != null) { const rg = vRange(); V.s = Math.max(rg[0], Math.min(rg[1], sv / 1000)); }
        V.touching = Math.abs(V.s - vLimit()) < 1e-9;
      }
      if (o.m && typeof o.m === 'object') {
        const r = MC.M_RANGE[M.kind];
        const size = intIn(o.m.size, r[0], r[1]), zero = intIn(o.m.zero, -15, 15);
        if (size != null) M.item.sizeUm = size;
        if (!M.zeroOn) M.item.zeroUm = 0;
        else if (zero != null && Math.abs(zero) >= 2) M.item.zeroUm = zero;
        M.item.readingUm = M.item.sizeUm + M.item.zeroUm;
        M.zeroCheck = o.m.z === 1; M.overlay = null; M.anim = null; M.clicks = 0; M.push = 0; M.checked = false;
        const sm = intIn(o.m.s, 0, MIC.range * 1000);
        M.s = Math.max(mLimit(), Math.min(MIC.range, sm != null ? sm / 1000 : M.item.sizeUm / 1000 + 1.2));
        M.touching = Math.abs(M.s - mLimit()) < 1e-9;
      }
      const rod = intIn(o.rod, 6000, 20000);
      if (rod != null && rod !== state.x.rod.trueUm) {
        state.x.rod = { trueUm: rod };
        state.x.sets = { v20: [], v50: [], micro: [] };
        state.x.last = { v20: null, v50: null, micro: null };
      }
      if (o.names === 0 || o.names === 1) { state.names = o.names === 1; $('namesBtn').setAttribute('aria-pressed', String(state.names)); }
      $('ans').value = '';
      clearFeedback();
      updateLabels(); updateButtons(); updateMulti();
      requestDraw();
    }
  };
  registerShare();
  if (!shareOn) window.addEventListener('load', registerShare);

  // ======================= 啟動 =======================
  readColors();
  state.x.sigma = val(elSig);
  state.x.bias = val(elBias);
  refreshOutputs();
  newVernierItem();
  newMicroItem();
  newRod();
  updateSoundButton();
  applyMode();
  setStatus(T('先按「夾緊」或拖曳副尺夾住圓棒，再從放大鏡讀出讀數。', 'Press “Close on the object” or drag the slider onto the rod, then read the scale in the magnifier.'));
  function themeChanged() { readColors(); requestDraw(); if (state.mode === 'multi') drawHist(); }
  if (window.matchMedia) {
    const dm = window.matchMedia('(prefers-color-scheme: dark)');
    if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  }
  window.addEventListener('lab:themechange', themeChanged);
  const widths = new WeakMap();
  function observe(el, fn) {
    if (window.ResizeObserver) new ResizeObserver(function () { if (el.clientWidth !== widths.get(el)) { widths.set(el, el.clientWidth); fn(); } }).observe(el);
    window.addEventListener('resize', fn);
  }
  observe(cv, function () { L = null; layout(); if (state.mode === 'vernier' && state.v.pan != null) clampPan(); requestDraw(); });
  observe(hcv, function () { LH = null; if (state.mode === 'multi') drawHist(); });

  // 測試介面：只在自動化測試（Playwright，navigator.webdriver）時提供，學生的瀏覽器裡沒有
  if (navigator.webdriver) window.__ms = {
    state: state,
    clamp: function () {
      if (state.mode === 'vernier') { vSetS(vLimit()); } else if (state.mode === 'micro') { mMove(mLimit() - state.m.s); }
      afterMove(); requestDraw();
    },
    expected: function () {
      if (state.mode === 'vernier') return MC.fixed(MC.expectedUm(state.v.item, state.v.zeroCheck) / 1000, 2);
      return MC.fixed(MC.expectedUm(state.m.item, state.m.zeroCheck) / 1000, 3);
    },
    answer: function (str) { $('ans').value = str; check(); },
    measure: measure
  };
})();
