/* ripple-tank.js — 「水波槽實驗」的畫面與互動（物理計算在 ripple-tank-core.js；3D 在 ripple-tank-3d.js；共用繪圖工具 LabDraw 在 drawkit.js） */
(function () {
  'use strict';
  const RC = window.RippleCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const TANK = RC.TANK;
  const W = TANK.W, H = TANK.H;
  const DEG = Math.PI / 180;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const alpha = D.alpha, shade = D.shade, mix = D.mix;

  // ---------- 固定的器材尺寸（m） ----------
  const BAR_LEN = 0.16, BAR_THICK = 0.012;     // 厚壓克力塊（直條障礙物）
  const ARC_CHORD = 0.16, ARC_THICK = 0.008;   // 圓弧形障礙物
  const STRIP_THICK = 0.006;                   // 長條形障礙物（繞射）
  const PLATE_LEN = 0.6;                       // 薄壓克力板夠長，轉斜後仍跨過整個水槽
  const LEVEL_OK = 0.03;                       // 度：水平儀氣泡在中央的範圍
  // 鍵盤操作（keys.js）：kbItems 依實驗項目與起波器即時更新
  let kb = null;
  const kbItems = [];

  // 含誤差：每次打開頁面隨機決定（旋鈕刻度的偏差、槽底一開始的傾斜）
  function rnd(a, b) { return a + (b - a) * Math.random(); }
  function sgn() { return Math.random() < 0.5 ? -1 : 1; }
  const ERR = {
    f: sgn() * rnd(0.03, 0.06),
    tx: sgn() * rnd(0.12, 0.3) * DEG,
    ty: sgn() * rnd(0.1, 0.25) * DEG
  };

  const state = {
    part: 1,
    mode: 'ideal',
    src: 'bar',
    dial: 10, amp: 0.12, d: 0.05,
    pt: { x: 0.1, y: H / 2 }, pair: { x: 0.09, y: H / 2 },
    gen: true,
    strobe: false, fs: 8, speedSel: 0.25, speedBeforeStrobe: 0.25,
    running: !reducedMotion,
    h: 0.008, sponge: true,
    screw: { x: 0, y: 0 },        // 調水平螺絲（rad）
    light: 'parallel', lampH: 0.6,
    shape: 'straight', beta: 30, R: 0.14,
    barC: { x: 0.25, y: H / 2 }, cavV: { x: 0.31, y: H / 2 }, vexV: { x: 0.22, y: H / 2 },
    alpha: 30, h2: 0.002, pw: 0.12, plateC: { x: 0.21, y: H / 2 },
    diff: 'slit', obsL: 0.04, slitA: 0.03, diffX: 0.15, obsY: H / 2,
    ruler: null,                  // { a: {x, y}, b: {x, y} }（水面座標，m）
    rulerEnd: 'b',
    probe: { x: 0.25, y: H / 2 + 0.05 },
    N: 5,
    Muser: 1,
    tables: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    flags: {},
    status: ''
  };

  // ======================================================================
  // 場景
  // ======================================================================
  function trueF() { return state.dial * (state.mode === 'real' ? 1 + ERR.f : 1); }
  function tiltRad() {
    if (state.mode !== 'real') return { x: 0, y: 0 };
    return { x: ERR.tx + state.screw.x, y: ERR.ty + state.screw.y };
  }
  function tiltDeg() { const t = tiltRad(); return Math.hypot(t.x, t.y) / DEG; }
  function magnif() { return state.light === 'point' ? RC.magnification(state.lampH, TANK.paper) : 1; }
  function arcObj() {
    const R = state.R, half = Math.asin(Math.min(1, ARC_CHORD / 2 / R));
    if (state.shape === 'concave') { const v = state.cavV; return { kind: 'arc', cx: v.x - R, cy: v.y, R: R, half: half, thick: ARC_THICK, ang: 0, vx: v.x, vy: v.y }; }
    const v = state.vexV;
    return { kind: 'arc', cx: v.x + R, cy: v.y, R: R, half: half, thick: ARC_THICK, ang: Math.PI, vx: v.x, vy: v.y };
  }
  function barObj() {
    return { kind: 'rect', cx: state.barC.x, cy: state.barC.y, len: BAR_LEN, thick: BAR_THICK, ang: (90 + state.beta) * DEG };
  }
  function plateObj() {
    return { cx: state.plateC.x, cy: state.plateC.y, w: state.pw, len: PLATE_LEN, ang: state.alpha * DEG, h2: state.h2 };
  }
  function diffSolids() {
    const x = state.diffX;
    if (state.diff === 'obstacle') return [{ kind: 'rect', cx: x, cy: state.obsY, len: state.obsL, thick: STRIP_THICK, ang: 90 * DEG }];
    const a = state.slitA, y0 = -0.02, y1 = H / 2 - a / 2, y2 = H / 2 + a / 2, y3 = H + 0.02;
    return [
      { kind: 'rect', cx: x, cy: (y0 + y1) / 2, len: y1 - y0, thick: STRIP_THICK, ang: 90 * DEG },
      { kind: 'rect', cx: x, cy: (y2 + y3) / 2, len: y3 - y2, thick: STRIP_THICK, ang: 90 * DEG }
    ];
  }
  function sourcePoints() {
    if (state.src === 'point') return [[state.pt.x, state.pt.y]];
    if (state.src === 'pair') return [[state.pair.x, state.pair.y - state.d / 2], [state.pair.x, state.pair.y + state.d / 2]];
    return [];
  }
  function buildScene() {
    const t = tiltRad();
    const sc = { W: W, H: H, f: trueF(), h: state.h, tiltX: t.x, tiltY: t.y, sponge: state.sponge, amp: state.amp, solids: [], plate: null };
    if (state.src === 'bar') sc.source = { type: 'bar', x: TANK.bar, y0: 0, y1: H };
    else if (state.src === 'point') sc.source = { type: 'point', x: state.pt.x, y: state.pt.y };
    else sc.source = { type: 'pair', x: state.pair.x, y: state.pair.y, d: state.d };
    if (state.part === 2) sc.solids = [state.shape === 'straight' ? barObj() : arcObj()];
    else if (state.part === 3) sc.plate = plateObj();
    else if (state.part === 4) sc.solids = diffSolids();
    return sc;
  }
  /** 真實的波長（m）：(x, y) 處的水深與真實頻率 */
  function lamAt(x, y) { return RC.wavelength(trueF(), RC.depthAt(buildScene(), x, y)); }
  function lamDeep() { return RC.wavelength(trueF(), state.h); }

  // ======================================================================
  // 模擬
  // ======================================================================
  let sim = null, simKey = '', maxCells = 90000;
  let simBorn = 0;              // 這次模擬開始時的真實時間（ms），用來判斷波是否已經填滿
  const perf = { msPerStep: 0.2, lastDowngrade: 0, slowSince: 0 };
  let strobeBuf = null, strobeNext = 0, strobeHas = false;
  let Ibuf = null;
  function keyOf(sc) {
    return [sc.f.toFixed(5), sc.h.toFixed(5), sc.plate ? sc.plate.h2.toFixed(5) : '-', sc.tiltX.toFixed(7), sc.tiltY.toFixed(7), maxCells].join('|');
  }
  function syncSim(force) {
    const sc = buildScene();
    const key = keyOf(sc);
    if (!sim || force || key !== simKey) {
      sim = RC.createSim(sc, { maxCells: maxCells });
      simKey = key;
      simBorn = performance.now();
      const N = sim.NX * sim.NY;
      strobeBuf = new Float32Array(N);
      Ibuf = new Float32Array(N);
      strobeHas = false;
      strobeNext = 0;
      sim.setDriving(state.gen);
      allocImage();
      updateGridInfo();
      if (view3) view3.onRebuild();
    } else {
      sim.setGeometry(sc);
      if (view3) view3.onGeometry();
    }
    imgDirty = true;
    requestDraw();
  }

  // ======================================================================
  // 投影影像（每一格一個像素，畫到畫布時平滑放大）
  // ======================================================================
  const img = document.createElement('canvas');
  const imgCtx = img.getContext('2d');
  let imgData = null, imgDirty = true;
  const LUTN = 1024;
  let lut = new Uint8Array(LUTN * 3);
  let solidRGB = [0, 0, 0], spongeRGB = [0, 0, 0], baseRGB = [0, 0, 0];
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface', '--pos', '--neg', '--equi', '--field', '--probe', '--b-wave', '--b-optics', '--bg']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    colors.dark = D.dark;
    buildLUT();
    imgDirty = true;
  }
  /** 亮度 I → 顏色：紙面的亮度與 I 成正比（I = 1 為沒有波時的亮度），波峰會聚成細細的亮線、波谷較暗；
   *  最亮處偏燈光的暖白，最暗處偏深灰 */
  const I_MAX = 8.4;
  function buildLUT() {
    const dk = colors.dark;
    const black = D.rgb(dk ? shade(colors['canvas-bg'], -0.55) : mix(colors['canvas-bg'], colors.text, 0.86));
    const mid = D.rgb(dk ? mix(colors['canvas-bg'], '#d8d2bf', 0.36) : mix('#fffdf6', colors.text, 0.42));
    const bright = D.rgb(dk ? '#fff4d8' : '#fffef8');
    for (let i = 0; i < LUTN; i++) {
      const I = (i + 0.5) / LUTN * I_MAX;
      const L = Math.min(1, 0.45 * Math.pow(I, 1.2));     // 紙上的相對亮度
      let c;
      if (L < 0.45) { const u = L / 0.45; c = [0, 1, 2].map(function (q) { return black[q] + (mid[q] - black[q]) * Math.pow(u, 0.9); }); }
      else { const u = (L - 0.45) / 0.55; c = [0, 1, 2].map(function (q) { return mid[q] + (bright[q] - mid[q]) * u; }); }
      lut[3 * i] = c[0]; lut[3 * i + 1] = c[1]; lut[3 * i + 2] = c[2];
    }
    solidRGB = D.rgb(dk ? shade(colors['canvas-bg'], -0.6) : mix(colors['canvas-bg'], colors.text, 0.82));
    const q1 = Math.floor(LUTN / I_MAX);
    baseRGB = [lut[3 * q1], lut[3 * q1 + 1], lut[3 * q1 + 2]];
    spongeRGB = D.rgb(dk ? shade(colors['canvas-bg'], -0.3) : mix(colors['canvas-bg'], colors.text, 0.5));
  }
  function allocImage() {
    img.width = sim.nx; img.height = sim.ny;
    imgData = imgCtx.createImageData(sim.nx, sim.ny);
    const a = imgData.data;
    for (let i = 3; i < a.length; i += 4) a[i] = 255;
  }
  function kappa() { return RC.kappaOf(TANK.paper); }
  function renderImage() {
    if (!sim || !imgData) return;
    const field = state.strobe ? (strobeHas ? strobeBuf : null) : sim.u;
    const nx = sim.nx, ny = sim.ny, NX = sim.NX, dx = sim.dx, a = imgData.data;
    if (field) RC.intensity(sim, field, kappa(), Ibuf);
    const spW = state.sponge ? TANK.sponge : 0;
    const LS = LUTN / I_MAX;
    for (let j = 1; j <= ny; j++) {
      const y = (j - 0.5) * dx;
      let o = (ny - j) * nx * 4;
      for (let i = 1; i <= nx; i++, o += 4) {
        const k = j * NX + i;
        let r, g, b;
        if (sim.solid[k]) { r = baseRGB[0]; g = baseRGB[1]; b = baseRGB[2]; }
        else {
          let I = field ? Ibuf[k] : 1;
          let q = Math.floor(I * LS); if (q >= LUTN) q = LUTN - 1; else if (q < 0) q = 0;
          r = lut[3 * q]; g = lut[3 * q + 1]; b = lut[3 * q + 2];
          if (spW) {
            const x = (i - 0.5) * dx, dw = Math.min(x, W - x, y, ny * dx - y);
            if (dw < spW) { r = spongeRGB[0]; g = spongeRGB[1]; b = spongeRGB[2]; }
          }
        }
        a[o] = r; a[o + 1] = g; a[o + 2] = b;
      }
    }
    imgCtx.putImageData(imgData, 0, 0);
    imgDirty = false;
    if (view3) view3.onImage();
  }

  // ======================================================================
  // 2D 畫布與版面
  // ======================================================================
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 232;
  let L = null;
  const bg = document.createElement('canvas');
  const bgctx = bg.getContext('2d');
  let bgKey = '';

  function layout() {
    const m = Math.max(8, Math.min(20, cw * 0.028));
    const ft = Math.max(5, Math.min(13, cw * 0.016));
    const aw = cw - 2 * (m + ft), ah = ch - 2 * (m + ft);
    const s = Math.min(aw / W, ah / H);
    const ox = (cw - W * s) / 2, oy = (ch - H * s) / 2;
    return { m: m, ft: ft, s: s, ox: ox, oy: oy, narrow: cw < 560 };
  }
  function X(x) { return L.ox + x * L.s; }
  function Y(y) { return L.oy + (H - y) * L.s; }
  function wx(px) { return (px - L.ox) / L.s; }
  function wy(py) { return H - (py - L.oy) / L.s; }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + px + 'px ' + FONT; }

  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = w;
    ch = Math.round(w * 31 / 40);
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    L = layout();
    bgKey = '';
    draw();
  }

  /** 不變的背景：白紙、水槽框的影子、海綿、比例尺 */
  function buildBackground() {
    const M = magnif();
    const key = [cw, ch, dpr, D.ver, state.sponge, M.toFixed(4), window.LabSettings ? window.LabSettings.lang : ''].join('|');
    if (key === bgKey) return;
    bgKey = key;
    bg.width = cv.width; bg.height = cv.height;
    const c = bgctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 白紙（燈光直接照到的地方最亮）
    D.backdrop(c, cw, ch);
    const pg = c.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.2, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.6);
    pg.addColorStop(0, colors.dark ? alpha('#fff3d0', 0.07) : alpha('#fff8e6', 0.6));
    pg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = pg; c.fillRect(0, 0, cw, ch);
    // 水槽框的影子（金屬框不透光）
    const x0 = X(0), y0 = Y(H), x1 = X(W), y1 = Y(0), ft = L.ft;
    c.save();
    c.shadowColor = colors.dark ? 'rgba(0,0,0,0.6)' : alpha(colors.text, 0.25);
    c.shadowBlur = 10; c.shadowOffsetY = 2;
    D.roundRect(c, x0 - ft, y0 - ft, x1 - x0 + 2 * ft, y1 - y0 + 2 * ft, 6);
    c.fillStyle = colors.dark ? shade(colors['canvas-bg'], -0.55) : mix(colors['canvas-bg'], colors.text, 0.72);
    c.fill();
    c.restore();
    // 框的細邊（玻璃槽壁的折光）
    c.strokeStyle = alpha(colors.dark ? '#ffffff' : colors.text, colors.dark ? 0.12 : 0.25);
    c.lineWidth = 1;
    c.strokeRect(x0 - 0.5, y0 - 0.5, x1 - x0 + 1, y1 - y0 + 1);
    // 比例尺（紙上的長度）：5 cm
    const pxPerPaperCm = L.s / M / 100;
    const len = 5 * pxPerPaperCm;
    const bx = x0, by = Math.min(ch - 4, y1 + ft + L.m * 0.65);
    if (by < ch - 2 && L.m >= 10) {
      c.strokeStyle = colors.text; c.lineWidth = 1.5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + len, by); c.moveTo(bx, by - 3); c.lineTo(bx, by + 2); c.moveTo(bx + len, by - 3); c.lineTo(bx + len, by + 2); c.stroke();
      D.haloText(c, T('紙上 5 cm', '5 cm on paper'), bx + len + 6, by + 1, colors.muted, 'left', 'middle', fnt(11));
    }
  }

  // ---------- 畫面上的物件（座標轉換後畫在影像上方） ----------
  function polyRect(c, o, pad) {
    const ca = Math.cos(o.ang), sa = Math.sin(o.ang), hl = o.len / 2 + (pad || 0), ht = o.thick / 2 + (pad || 0);
    const pts = [[-hl, -ht], [hl, -ht], [hl, ht], [-hl, ht]].map(function (p) { return [o.cx + p[0] * ca - p[1] * sa, o.cy + p[0] * sa + p[1] * ca]; });
    c.beginPath();
    pts.forEach(function (p, i) { if (i) c.lineTo(X(p[0]), Y(p[1])); else c.moveTo(X(p[0]), Y(p[1])); });
    c.closePath();
  }
  /** 圓弧形障礙物的輪廓（有厚度的扇環） */
  function arcBand(c, o) {
    const n = 48, ro = o.R + o.thick / 2, ri = o.R - o.thick / 2;
    c.beginPath();
    for (let i = 0; i <= n; i++) { const a = o.ang - o.half + 2 * o.half * i / n; const x = X(o.cx + ro * Math.cos(a)), y = Y(o.cy + ro * Math.sin(a)); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    for (let i = n; i >= 0; i--) { const a = o.ang - o.half + 2 * o.half * i / n; c.lineTo(X(o.cx + ri * Math.cos(a)), Y(o.cy + ri * Math.sin(a))); }
    c.closePath();
  }
  function arcPath(c, o, rr) {
    c.beginPath();
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const a = o.ang - o.half + 2 * o.half * i / n;
      const x = o.cx + rr * Math.cos(a), y = o.cy + rr * Math.sin(a);
      if (i) c.lineTo(X(x), Y(y)); else c.moveTo(X(x), Y(y));
    }
  }
  /** 障礙物的影子（不透光）：以向量圖形填滿，邊緣平滑 */
  function solidEdge(c) {
    c.fillStyle = 'rgb(' + solidRGB.join(',') + ')';
    c.fill();
    c.strokeStyle = colors.dark ? alpha('#ffffff', 0.28) : alpha(colors.text, 0.55);
    c.lineWidth = 1;
    c.stroke();
  }
  function handle(c, x, y, r, color, hot) {
    c.save();
    c.beginPath(); c.arc(x, y, r + (hot ? 3 : 0), 0, Math.PI * 2);
    c.fillStyle = alpha(color, hot ? 0.3 : 0.16); c.fill();
    c.lineWidth = 1.5; c.strokeStyle = color; c.stroke();
    c.beginPath(); c.arc(x, y, 2.2, 0, Math.PI * 2); c.fillStyle = color; c.fill();
    c.restore();
  }
  function label(c, text, x, y, color, align) {
    D.pill(c, text, x, y, color || colors.text, align || 'center', fnt(11.5, 600));
  }
  /** 旋轉把手的位置（直條：右上端外側；壓克力板：沿板邊往上） */
  function barRotHandle() {
    const o = barObj(), ca = Math.cos(o.ang), sa = Math.sin(o.ang), r = o.len / 2 + 0.016;
    return { x: o.cx + r * ca, y: o.cy + r * sa };
  }
  function plateRotHandle() {
    const p = plateObj(), a = p.ang + Math.PI / 2;
    return { x: p.cx + 0.075 * Math.cos(a), y: p.cy + 0.075 * Math.sin(a) };
  }

  function drawObjects(c) {
    const ink = colors.dark ? '#000000' : colors.text;
    const lab = function (t, x, y, col) { if (showLabels) label(c, t, x, y, col); };
    // 直線起波器的影子（棒子在水面上方）
    if (state.src === 'bar') {
      const x = X(TANK.bar), w = Math.max(3, 0.008 * L.s);
      c.save();
      c.fillStyle = alpha(ink, colors.dark ? 0.85 : 0.72);
      D.roundRect(c, x - w / 2, Y(H - 0.004), w, (H - 0.008) * L.s, w / 2);
      c.fill();
      c.restore();
      lab(T('直線起波器', 'Straight generator'), x + 6, Y(H - 0.035), colors.text);
    } else {
      sourcePoints().forEach(function (p, i, arr) {
        const r = Math.max(3.5, TANK.dipR * 1.4 * L.s);
        c.save();
        c.beginPath(); c.arc(X(p[0]), Y(p[1]), r, 0, Math.PI * 2);
        c.fillStyle = alpha(ink, 0.8); c.fill();
        c.restore();
        if (hover === 'src') handle(c, X(p[0]), Y(p[1]), r + 4, colors.accent, true);
        if (arr.length === 2) D.vecLabel(c, 'S', String(i + 1), X(p[0]) - r - 10, Y(p[1]) - r - 6, colors.text);
        else D.vecLabel(c, 'S', '', X(p[0]) - r - 8, Y(p[1]) - r - 6, colors.text);
      });
    }
    // 各實驗項目的障礙物
    if (state.part === 2) {
      if (state.shape === 'straight') {
        const o = barObj();
        polyRect(c, o, 0); solidEdge(c);
        const hp = barRotHandle();
        handle(c, X(hp.x), Y(hp.y), 7, colors.accent, hover === 'barRot');
        if (hover === 'bar') { polyRect(c, o, 0.002); c.strokeStyle = colors.accent; c.lineWidth = 2; c.stroke(); }
        // 法線（虛線）與 β
        const n = [Math.cos(state.beta * DEG), Math.sin(state.beta * DEG)];
        c.save(); c.setLineDash([4, 4]); c.strokeStyle = alpha(colors.text, 0.45); c.lineWidth = 1;
        c.beginPath(); c.moveTo(X(o.cx - 0.07 * n[0]), Y(o.cy - 0.07 * n[1])); c.lineTo(X(o.cx), Y(o.cy)); c.stroke(); c.restore();
        lab(T('厚壓克力塊', 'Thick acrylic block'), X(o.cx + 0.05 * Math.cos(o.ang)) + 40, Y(o.cy + 0.05 * Math.sin(o.ang)), colors.text);
      } else {
        const o = arcObj();
        arcBand(c, o); solidEdge(c);
        if (hover === 'arc') { arcPath(c, o, o.R); c.strokeStyle = colors.accent; c.lineWidth = 3; c.stroke(); }
        handle(c, X(o.vx), Y(o.vy), 6, colors.accent, hover === 'arc');
        if (state.shape === 'concave' && showLabels) {
          // 焦點的位置不畫出來（讓學生自己找），只標頂點
          lab(T('凹弧（頂點）', 'Concave arc (vertex)'), X(o.vx) + 8, Y(o.vy + ARC_CHORD / 2) - 6, colors.text);
        } else lab(T('凸弧（頂點）', 'Convex arc (vertex)'), X(o.vx) - 8, Y(o.vy + ARC_CHORD / 2) - 6, colors.text);
      }
    } else if (state.part === 3) {
      const p = plateObj();
      const pr = { cx: p.cx, cy: p.cy, len: p.len, thick: p.w, ang: p.ang + Math.PI / 2 };
      c.save();
      c.beginPath(); c.rect(X(0), Y(H), W * L.s, H * L.s); c.clip();
      polyRect(c, pr, 0);
      c.fillStyle = alpha(colors.accent, colors.dark ? 0.1 : 0.07); c.fill();
      c.setLineDash([7, 5]); c.lineWidth = hover === 'plate' ? 2.4 : 1.5; c.strokeStyle = colors.accent; c.stroke();
      c.restore();
      const hp = plateRotHandle();
      handle(c, X(hp.x), Y(hp.y), 7, colors.accent, hover === 'plateRot');
      lab(T('淺水區（薄壓克力板）', 'Shallow (thin plate)'), X(p.cx), Y(p.cy) + 4, colors.accent);
    } else if (state.part === 4) {
      c.save();
      c.beginPath(); c.rect(X(0), Y(H), W * L.s, H * L.s); c.clip();
      diffSolids().forEach(function (o) { polyRect(c, o, 0); solidEdge(c); if (hover === 'diff') { polyRect(c, o, 0.002); c.strokeStyle = colors.accent; c.lineWidth = 2; c.stroke(); } });
      c.restore();
      if (state.diff === 'obstacle') {
        handle(c, X(state.diffX), Y(state.obsY), 6, colors.accent, hover === 'diff');
        lab(T('長條形障礙物', 'Strip barrier'), X(state.diffX), Y(state.obsY + state.obsL / 2) - 8, colors.text);
      } else {
        handle(c, X(state.diffX), Y(H / 2 + state.slitA / 2 + 0.03), 6, colors.accent, hover === 'diff');
        lab(T('狹縫', 'Slit'), X(state.diffX) + 34, Y(H / 2 - state.slitA / 2 - 0.012), colors.text);
      }
    }
    // 探針 P（干涉）
    if (state.part === 5) drawProbe(c);
  }
  function drawProbe(c) {
    const P = state.probe, pts = sourcePoints();
    const px = X(P.x), py = Y(P.y);
    c.save();
    c.setLineDash([5, 4]);
    c.lineWidth = 1.4;
    pts.forEach(function (s, i) {
      c.strokeStyle = alpha(i ? colors.neg : colors.pos, 0.85);
      c.beginPath(); c.moveTo(X(s[0]), Y(s[1])); c.lineTo(px, py); c.stroke();
    });
    c.restore();
    const hot = hover === 'probe' || (drag && drag.kind === 'probe') || kbSel() === 'probe';
    D.ball(c, px, py, hot ? 7.5 : 6.5, colors.equi, { glow: colors.dark ? 0.35 : 0 });
    D.haloText(c, 'P', px + 10, py - 9, colors.equi, 'left', 'middle', fnt(14, 700));
  }

  // ---------- 直尺 ----------
  function rulerPaperLen() {
    const r = state.ruler;
    return r ? Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y) * magnif() : 0;
  }
  function drawRuler(c) {
    const r = state.ruler;
    if (!r) return;
    const ax = X(r.a.x), ay = Y(r.a.y), bx = X(r.b.x), by = Y(r.b.y);
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 2) return;
    const ux = (bx - ax) / len, uy = (by - ay) / len, nx = -uy, ny = ux;
    const wid = 16;
    const col = colors['b-wave'];
    c.save();
    // 透明的塑膠尺（尺身在線的一側）
    c.beginPath();
    c.moveTo(ax, ay); c.lineTo(bx, by); c.lineTo(bx + nx * wid, by + ny * wid); c.lineTo(ax + nx * wid, ay + ny * wid); c.closePath();
    c.fillStyle = alpha(col, colors.dark ? 0.16 : 0.12); c.fill();
    c.strokeStyle = alpha(col, 0.5); c.lineWidth = 1; c.stroke();
    // 刻度：紙上的公分與公釐
    const pxPerPaperCm = L.s / magnif() / 100;
    const cm = len / pxPerPaperCm;
    const showMm = pxPerPaperCm / 10 >= 2.4;
    c.strokeStyle = alpha(colors.text, 0.75); c.lineWidth = 1;
    c.beginPath();
    for (let q = 0; q <= cm * 10 + 1e-6; q++) {
      const big = q % 10 === 0, mid = q % 5 === 0;
      if (!big && !mid && !showMm) continue;
      const t = q / 10 * pxPerPaperCm;
      const tl = big ? 8 : mid ? 5.5 : 3.2;
      c.moveTo(ax + ux * t, ay + uy * t); c.lineTo(ax + ux * t + nx * tl, ay + uy * t + ny * tl);
    }
    c.stroke();
    // 量測邊（亮線）
    c.strokeStyle = col; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
    c.restore();
    // 端點
    [['a', ax, ay], ['b', bx, by]].forEach(function (e) {
      const hot = hover === 'ruler' + e[0] || (drag && drag.kind === 'ruler' + e[0]);
      c.beginPath(); c.arc(e[1], e[2], hot ? 7 : 5, 0, Math.PI * 2);
      c.fillStyle = alpha(col, 0.25); c.fill();
      c.lineWidth = state.rulerEnd === e[0] ? 2.2 : 1.4; c.strokeStyle = col; c.stroke();
    });
    // 讀數
    const rd = readRuler();
    const tx = (ax + bx) / 2 + nx * (wid + 12), ty = (ay + by) / 2 + ny * (wid + 12);
    label(c, rd.lenText + (rd.angText ? '　' + rd.angText : ''), tx, ty + 9, col);
  }

  // ---------- 放大鏡（拖曳直尺端點或探針時） ----------
  function drawLoupe(c) {
    if (!drag || !/^ruler[ab]$|^probe$|^newRuler$/.test(drag.kind) || !drag.px) return;
    const R = Math.min(56, cw * 0.13), zoom = 2.6;
    let lx = drag.px, ly = drag.py - R - 34;
    if (ly - R < 2) ly = drag.py + R + 34;
    lx = Math.max(R + 2, Math.min(cw - R - 2, lx));
    c.save();
    c.beginPath(); c.arc(lx, ly, R, 0, Math.PI * 2);
    c.shadowColor = alpha('#000000', 0.35); c.shadowBlur = 10;
    c.fillStyle = colors['canvas-bg']; c.fill();
    c.shadowColor = 'transparent';
    c.clip();
    const sw = 2 * R / zoom;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(cv, (drag.px - sw / 2) * dpr, (drag.py - sw / 2) * dpr, sw * dpr, sw * dpr, (lx - R) * dpr, (ly - R) * dpr, 2 * R * dpr, 2 * R * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.strokeStyle = alpha(colors.text, 0.5); c.lineWidth = 1;
    c.beginPath(); c.moveTo(lx - 8, ly); c.lineTo(lx + 8, ly); c.moveTo(lx, ly - 8); c.lineTo(lx, ly + 8); c.stroke();
    c.restore();
    c.beginPath(); c.arc(lx, ly, R, 0, Math.PI * 2); c.strokeStyle = colors['b-wave']; c.lineWidth = 2; c.stroke();
  }

  // ---------- 畫面角落的狀態標籤 ----------
  function drawHud(c) {
    const y = L.oy - L.ft - 2;
    const items = [];
    if (state.strobe) {
      const fz = frozenInfo();
      items.push([T('閃頻 ', 'Strobe ') + state.fs.toFixed(2) + ' Hz' + (fz.frozen ? T('：靜止', ': frozen') : ''), fz.frozen ? colors.probe : colors.equi]);
    } else items.push([speedText(), colors.muted]);
    if (!state.gen) items.push([T('起波器關', 'Generator off'), colors.pos]);
    if (state.light === 'point') items.push([T('點光源 L = ', 'Point lamp L = ') + Math.round(state.lampH * 100) + ' cm', colors.muted]);
    if (!state.running) items.push([T('暫停', 'Paused'), colors.pos]);
    let x = cw - L.m * 0.5;
    const yb = Math.max(15, y);
    for (let i = 0; i < items.length; i++) {
      const b = D.pill(c, items[i][0], x, yb, items[i][1], 'right', fnt(11, 600));
      x = b.x - 5;
      if (x < cw * 0.3) break;
    }
  }
  function speedText() {
    const s = state.speedSel;
    if (s >= 1) return T('真實速度', 'Real time');
    return T('慢動作 ×1/', 'Slow motion ×1/') + Math.round(1 / s);
  }

  let showLabels = true;
  function draw() {
    if (!L || !sim) return;
    buildBackground();
    if (imgDirty) renderImage();
    const c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(bg, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(img, X(0), Y(H), sim.nx * sim.dx * L.s, sim.ny * sim.dx * L.s);
    // 海綿的質感（多孔的影子）
    if (state.sponge) drawSponge(c);
    drawObjects(c);
    drawRuler(c);
    drawHud(c);
    drawKbFocus(c);
    drawLoupe(c);
  }
  let spongePat = null, spongeKey = '';
  function drawSponge(c) {
    const key = D.ver + '|' + dpr;
    if (key !== spongeKey) {
      spongeKey = key;
      const p = document.createElement('canvas');
      p.width = p.height = Math.round(24 * dpr);
      const g = p.getContext('2d');
      g.scale(dpr, dpr);
      g.fillStyle = alpha(colors.dark ? '#c9a24a' : '#8a6a1c', colors.dark ? 0.16 : 0.22);
      g.fillRect(0, 0, 24, 24);
      g.fillStyle = alpha(colors.dark ? '#000000' : colors.text, 0.22);
      [[4, 5, 1.6], [14, 3, 1.1], [19, 12, 1.8], [8, 16, 1.3], [16, 20, 1], [2, 21, 1.2], [11, 10, 0.9]].forEach(function (d) { g.beginPath(); g.arc(d[0], d[1], d[2], 0, Math.PI * 2); g.fill(); });
      spongePat = c.createPattern(p, 'repeat');
      if (spongePat && spongePat.setTransform) spongePat.setTransform(new DOMMatrix().scale(1 / dpr));
    }
    const sw = TANK.sponge * L.s, x0 = X(0), y0 = Y(H), w = W * L.s, h = H * L.s;
    c.save();
    c.beginPath();
    c.rect(x0, y0, w, h);
    c.rect(x0 + sw, y0 + sw, w - 2 * sw, h - 2 * sw);
    c.fillStyle = spongePat || alpha(colors.equi, 0.2);
    c.fill('evenodd');
    c.restore();
    if (showLabels && cw > 420) D.haloText(c, T('海綿', 'Sponge'), x0 + w - sw / 2, y0 + h * 0.5, colors.muted, 'center', 'middle', fnt(10.5, 600));
  }

  // ======================================================================
  // 讀數
  // ======================================================================
  function fine() { return state.mode !== 'real'; }
  /** 直尺的讀數：紙上長度（cm）與參考方向的夾角（度） */
  function readRuler() {
    const r = state.ruler;
    if (!r) return { len: null, ang: null, lenText: '', angText: '' };
    const lcm = rulerPaperLen() * 100;
    const len = fine() ? Math.round(lcm * 100) / 100 : Math.round(lcm * 10) / 10;
    const dir = Math.atan2(r.b.y - r.a.y, r.b.x - r.a.x);
    const ref = refDir();
    let ang = null;
    if (ref) {
      let a = Math.abs(D_wrap(dir - ref.dir)) / DEG;
      if (a > 90) a = 180 - a;
      ang = fine() ? Math.round(a * 10) / 10 : Math.round(a);
    }
    const lenText = len.toFixed(fine() ? 2 : 1) + ' cm';
    const angText = ang != null ? ang.toFixed(fine() ? 1 : 0) + '°' : '';
    return { len: len, ang: ang, lenText: lenText, angText: angText, refName: ref ? ref.name : '', dirDeg: dir / DEG };
  }
  function D_wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  /** 量角度的參考線：反射用障礙物、折射用板邊、繞射用前進方向（+x） */
  function refDir() {
    if (state.part === 2) {
      if (state.shape === 'straight') return { dir: (90 + state.beta) * DEG, name: T('與障礙物的夾角', 'angle to the barrier') };
      return { dir: 90 * DEG, name: T('與圓弧弦的夾角', 'angle to the chord of the arc') };
    }
    if (state.part === 3) return { dir: (state.alpha + 90) * DEG, name: T('與板邊的夾角', 'angle to the plate edge') };
    if (state.part === 4) return { dir: 0, name: T('與前進方向的夾角', 'angle to the forward direction') };
    return { dir: 90 * DEG, name: T('與起波器的夾角', 'angle to the generator') };
  }
  function probeRead() {
    const P = state.probe, s = sourcePoints(), M = magnif();
    if (s.length < 2) return null;
    const r = function (v) { const cm = v * M * 100; return fine() ? Math.round(cm * 100) / 100 : Math.round(cm * 10) / 10; };
    const a = r(Math.hypot(P.x - s[0][0], P.y - s[0][1])), b = r(Math.hypot(P.x - s[1][0], P.y - s[1][1]));
    return { ps1: a, ps2: b, dlt: Math.abs(a - b) };
  }
  function frozenInfo() {
    const f = trueF(), fs = state.fs;
    const n = Math.max(1, Math.round(f / fs));
    const drift = Math.abs(f - n * fs); // 條紋每秒移動的週期數（模擬時間）
    return { frozen: state.strobe && drift < 0.02 * Math.max(1, n) && n <= 4, n: n, drift: drift };
  }
  const nf = function (v, d) { return isFinite(v) ? (+v).toFixed(d).replace('-', '−') : '—'; };
  let lastReadHTML = '';
  function updateReadouts() {
    const rows = [];
    const add = function (k, v) { rows.push('<div class="r"><span>' + k + '</span><b>' + v + '</b></div>'); };
    const rd = readRuler();
    if (state.ruler) {
      add(T('直尺：紙上長度 ℓ′', 'Ruler: paper length ℓ′'), rd.lenText);
      if (rd.angText && state.part !== 1 && state.part !== 5) add(rd.refName, rd.angText);
      if (state.part === 1 || state.part === 3 || state.part === 4 || state.part === 5) add('ℓ′ / N' + T('（N = ', ' (N = ') + state.N + T('）', ')'), nf(rd.len / state.N, fine() ? 3 : 2) + ' cm');
    } else add(T('直尺', 'Ruler'), T('在畫面上拖曳拉出', 'drag on the picture'));
    if (state.part === 5) {
      const p = probeRead();
      if (p) {
        add('PS<sub>1</sub>′', nf(p.ps1, fine() ? 2 : 1) + ' cm');
        add('PS<sub>2</sub>′', nf(p.ps2, fine() ? 2 : 1) + ' cm');
        add('|PS<sub>1</sub>′ − PS<sub>2</sub>′|', nf(p.dlt, fine() ? 2 : 1) + ' cm');
      } else add(T('探針 P', 'Probe P'), T('需要兩個點波源', 'needs two dippers'));
    }
    if (state.strobe) {
      const fz = frozenInfo();
      add(T('條紋', 'Pattern'), fz.frozen ? T('靜止', 'frozen') : T('每秒移動 ', 'moves ') + nf(fz.drift, 2) + T(' 個波長', ' λ per second'));
    }
    add(state.mode === 'real' ? T('起波器旋鈕刻度', 'Generator dial') : T('起波器頻率', 'Generator frequency'), nf(state.dial, 2) + ' Hz');
    if (state.light === 'point') add(T('燈到水面 L／水面到紙 d', 'Lamp height L / paper d'), Math.round(state.lampH * 100) + ' cm / 25 cm');
    const html = rows.join('');
    if (html !== lastReadHTML) { $('readbox').innerHTML = html; lastReadHTML = html; }
  }

  // ======================================================================
  // 數據表與分析
  // ======================================================================
  const REC = {
    1: [{ id: 'lam', zh: '記錄波長 λ′', en: 'Record wavelength λ′' }],
    2: [{ id: 'ti', zh: '記錄入射角 θ<sub>i</sub>', en: 'Record incidence θ<sub>i</sub>' }, { id: 'tr', zh: '記錄反射角 θ<sub>r</sub>', en: 'Record reflection θ<sub>r</sub>' }],
    3: [{ id: 't1', zh: '記錄 θ<sub>1</sub>（深水）', en: 'Record θ<sub>1</sub> (deep)' }, { id: 't2', zh: '記錄 θ<sub>2</sub>（淺水）', en: 'Record θ<sub>2</sub> (shallow)' },
      { id: 'l1', zh: '記錄 λ<sub>1</sub>′（深水）', en: 'Record λ<sub>1</sub>′ (deep)' }, { id: 'l2', zh: '記錄 λ<sub>2</sub>′（淺水）', en: 'Record λ<sub>2</sub>′ (shallow)' }],
    4: [{ id: 'a', zh: '記錄縫寬 a′', en: 'Record slit width a′' }, { id: 'lam', zh: '記錄波長 λ′', en: 'Record wavelength λ′' }, { id: 'th', zh: '記錄暗線方向 θ', en: 'Record dark-line angle θ' }],
    5: [{ id: 'lam', zh: '記錄波長 λ′', en: 'Record wavelength λ′' }, { id: 'node', zh: 'P 在節線上：記錄', en: 'Record P on a nodal line' }, { id: 'anti', zh: 'P 在腹線上：記錄', en: 'Record P on an antinodal line' }]
  };
  const COLS = {
    1: ['f', 'l', 'N', 'lp'],
    2: ['ti', 'tr'],
    3: ['t1', 't2', 'l1', 'l2'],
    4: ['a', 'lam', 'th'],
    5: ['type', 'lam', 'ps1', 'ps2']
  };
  function buildRecButtons() {
    const box = $('recs');
    box.innerHTML = '';
    REC[state.part].forEach(function (r) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rec';
      b.innerHTML = T(r.zh, r.en);
      b.addEventListener('click', function () { record(r.id); });
      box.appendChild(b);
    });
    $('nRow').hidden = !(state.part === 1 || state.part === 3 || state.part === 4 || state.part === 5);
    $('mRow').hidden = state.part !== 1;
    const hints = {
      1: T('直尺從一條亮紋的中央拉到 N 條亮紋之後的亮紋中央，再按「記錄波長」。', 'Lay the ruler from the middle of one bright band to the middle of the band N wavelengths further on, then press “Record wavelength”.'),
      2: T('直尺沿著入射波前（亮紋）擺放，按「記錄入射角」；再沿著反射波前擺放，按「記錄反射角」。', 'Lay the ruler along an incident wavefront (a bright band) and record θi; then along a reflected wavefront and record θr.'),
      3: T('角度：直尺沿著板外（深水）或板上（淺水）的波前；波長：直尺跨過 N 個波長。', 'Angles: lay the ruler along a wavefront outside (deep) or over the plate (shallow). Wavelengths: span N wavelengths.'),
      4: T('縫寬：直尺量狹縫的開口；波長：跨過 N 個波長；θ：直尺從狹縫中央沿著第一條暗線擺放。', 'Slit: measure the opening. Wavelength: span N wavelengths. θ: lay the ruler from the middle of the slit along the first dark line.'),
      5: T('先量波長；再拖曳探針 P 到節線（灰色、幾乎不動）或腹線上記錄。', 'Measure λ first; then drag the probe P onto a nodal line (grey, almost still) or an antinodal line and record.')
    };
    $('recHint').textContent = hints[state.part];
  }
  function curRow(tbl, col) {
    const last = tbl[tbl.length - 1];
    if (last && last[col] == null && !(state.part === 5)) return last;
    const row = {};
    tbl.push(row);
    return row;
  }
  function soundRec(complete) {
    const S = sound(); if (!S) return;
    S.tone({ freq: 1180, dur: 0.04, type: 'sine', gain: 0.35 });
    if (complete) { S.tone({ freq: 660, dur: 0.12, type: 'sine', gain: 0.3, delay: 0.06 }); S.tone({ freq: 990, dur: 0.16, type: 'sine', gain: 0.28, delay: 0.14 }); }
  }
  function record(id) {
    const tbl = state.tables[state.part];
    const rd = readRuler();
    const needRuler = !(state.part === 5 && (id === 'node' || id === 'anti'));
    if (needRuler && !state.ruler) { setStatus(T('先在畫面上拖曳出一把直尺。', 'First drag on the picture to lay down a ruler.')); return; }
    if (needRuler && !(rd.len > 0)) { setStatus(T('直尺太短了。', 'The ruler is too short.')); return; }
    const p = state.part;
    let row;
    const lamPaper = rd.len / state.N;
    if (p === 1) {
      const useStrobe = state.strobe;
      row = { f: useStrobe ? state.fs : state.dial, fsrc: useStrobe ? 'strobe' : 'dial', l: rd.len, N: state.N, lp: lamPaper };
      tbl.push(row);
    } else if (p === 2) {
      row = curRow(tbl, id);
      row[id] = rd.ang;
      row['b_' + id] = state.shape === 'straight' ? state.beta : null;
    } else if (p === 3) {
      row = curRow(tbl, id);
      if (id === 't1' || id === 't2') row[id] = rd.ang; else { row[id] = lamPaper; row[id + 'N'] = state.N; row[id + 'l'] = rd.len; }
      row.alpha = state.alpha;
    } else if (p === 4) {
      row = curRow(tbl, id);
      if (id === 'a') row.a = rd.len;
      else if (id === 'lam') { row.lam = lamPaper; row.lamN = state.N; }
      else row.th = rd.ang;
      row.slitA = state.diff === 'slit' ? state.slitA : null;
      // 真實值（紙上 cm）：給任務檢查量測準不準
      row.lamTrue = lamDeep() * magnif() * 100;
      row.aTrue = state.diff === 'slit' ? state.slitA * magnif() * 100 : null;
    } else {
      if (id === 'lam') row = { type: 'lam', lam: lamPaper };
      else {
        const pr = probeRead();
        if (!pr) { setStatus(T('干涉需要兩個點波源。', 'Interference needs two dippers.')); return; }
        const sp = sourcePoints(), P = state.probe;
        row = { type: id, ps1: pr.ps1, ps2: pr.ps2, d: state.d, f: trueF(),
          trueOrder: Math.abs(Math.hypot(P.x - sp[0][0], P.y - sp[0][1]) - Math.hypot(P.x - sp[1][0], P.y - sp[1][1])) / lamDeep() };
      }
      tbl.push(row);
    }
    const complete = rowComplete(p, row);
    soundRec(complete);
    renderTable();
    renderAnalysis();
    updateSteps();
    setStatus(recordText(id, row));
    emitRecord(id, row);
  }
  /** 記錄後的狀態列（aria-live）：說出這次記下的量 */
  function recordText(id, row) {
    const fd = fine() ? 1 : 0, fl = fine() ? 2 : 1;
    const deg = function (v) { return nf(v, fd) + '°'; };
    let q = '';
    if (state.part === 1) q = 'λ′ = ' + nf(row.lp, fine() ? 3 : 2) + ' cm' + T('（f = ', ' (f = ') + nf(row.f, 2) + ' Hz' + T('）', ')');
    else if (state.part === 2) q = (id === 'ti' ? T('入射角 θi = ', 'incidence θi = ') : T('反射角 θr = ', 'reflection θr = ')) + deg(row[id]);
    else if (state.part === 3) q = id === 't1' ? 'θ1 = ' + deg(row.t1) : id === 't2' ? 'θ2 = ' + deg(row.t2) : (id === 'l1' ? 'λ1′ = ' : 'λ2′ = ') + nf(row[id], fine() ? 3 : 2) + ' cm';
    else if (state.part === 4) q = id === 'a' ? T('縫寬 a′ = ', 'slit width a′ = ') + nf(row.a, fl) + ' cm' : id === 'lam' ? 'λ′ = ' + nf(row.lam, fine() ? 3 : 2) + ' cm' : T('暗線方向 θ = ', 'dark-line angle θ = ') + deg(row.th);
    else if (row.type === 'lam') q = 'λ′ = ' + nf(row.lam, fine() ? 3 : 2) + ' cm';
    else q = (row.type === 'node' ? T('節線：', 'nodal line: ') : T('腹線：', 'antinodal line: ')) + 'PS1′ = ' + nf(row.ps1, fl) + ' cm' + T('、', ', ') + 'PS2′ = ' + nf(row.ps2, fl) + ' cm' + T('，相差 ', ', difference ') + nf(Math.abs(row.ps1 - row.ps2), fl) + ' cm';
    return T('已記錄：', 'Recorded: ') + q + T('。', '.');
  }
  function rowComplete(p, r) {
    if (p === 1) return true;
    if (p === 2) return r.ti != null && r.tr != null;
    if (p === 3) return (r.t1 != null && r.t2 != null) || (r.l1 != null && r.l2 != null);
    if (p === 4) return r.a != null && r.lam != null;
    return true;
  }
  function lastLam5() {
    const t = state.tables[5];
    for (let i = t.length - 1; i >= 0; i--) if (t[i].type === 'lam') return t[i].lam;
    return null;
  }
  function renderTable() {
    const p = state.part, tbl = state.tables[p], dig = fine() ? 2 : 1, adig = fine() ? 1 : 0;
    const c = function (v, d) { return v == null ? '<td class="empty">—</td>' : '<td>' + nf(v, d) + '</td>'; };
    let head = '', body = '';
    if (p === 1) {
      head = '<th>#</th><th>f (Hz)</th><th>ℓ′ (cm)</th><th>N</th><th>λ′ (cm)</th><th>λ = λ′/M (cm)</th><th>v = fλ (cm/s)</th>';
      tbl.forEach(function (r, i) {
        const lam = r.lp / state.Muser;
        body += '<tr><td>' + (i + 1) + '</td>' + c(r.f, 2).replace('</td>', r.fsrc === 'strobe' ? '<small> ' + T('閃頻', 'strobe') + '</small></td>' : '<small> ' + T('旋鈕', 'dial') + '</small></td>') +
          c(r.l, dig) + '<td>' + r.N + '</td>' + c(r.lp, dig + 1) + c(lam, dig + 1) + c(r.f * lam, 1) + '</tr>';
      });
    } else if (p === 2) {
      head = '<th>#</th><th>θ<sub>i</sub> (°)</th><th>θ<sub>r</sub> (°)</th><th>θ<sub>r</sub> − θ<sub>i</sub> (°)</th>';
      tbl.forEach(function (r, i) {
        body += '<tr' + (i === tbl.length - 1 && !rowComplete(2, r) ? ' class="cur"' : '') + '><td>' + (i + 1) + '</td>' + c(r.ti, adig) + c(r.tr, adig) + c(r.ti != null && r.tr != null ? r.tr - r.ti : null, adig) + '</tr>';
      });
    } else if (p === 3) {
      head = '<th>#</th><th>θ<sub>1</sub> (°)</th><th>θ<sub>2</sub> (°)</th><th>sinθ<sub>1</sub>/sinθ<sub>2</sub></th><th>λ<sub>1</sub>′ (cm)</th><th>λ<sub>2</sub>′ (cm)</th><th>λ<sub>1</sub>/λ<sub>2</sub></th>';
      tbl.forEach(function (r, i) {
        const sr = r.t1 != null && r.t2 != null && r.t2 > 0 ? Math.sin(r.t1 * DEG) / Math.sin(r.t2 * DEG) : null;
        const lr = r.l1 != null && r.l2 != null ? r.l1 / r.l2 : null;
        body += '<tr' + (i === tbl.length - 1 && !rowComplete(3, r) ? ' class="cur"' : '') + '><td>' + (i + 1) + '</td>' + c(r.t1, adig) + c(r.t2, adig) + c(sr, 3) + c(r.l1, dig + 1) + c(r.l2, dig + 1) + c(lr, 3) + '</tr>';
      });
    } else if (p === 4) {
      head = '<th>#</th><th>a′ (cm)</th><th>λ′ (cm)</th><th>λ/a</th><th>θ (°)</th><th>sinθ</th>';
      tbl.forEach(function (r, i) {
        body += '<tr' + (i === tbl.length - 1 && !rowComplete(4, r) ? ' class="cur"' : '') + '><td>' + (i + 1) + '</td>' + c(r.a, dig) + c(r.lam, dig + 1) + c(r.a != null && r.lam != null ? r.lam / r.a : null, 2) + c(r.th, adig) + c(r.th != null ? Math.sin(r.th * DEG) : null, 3) + '</tr>';
      });
    } else {
      head = '<th>#</th><th>' + T('類型', 'Type') + '</th><th>λ′ (cm)</th><th>PS<sub>1</sub>′</th><th>PS<sub>2</sub>′</th><th>|Δ|′ (cm)</th><th>|Δ|/λ</th>';
      let lam = null;
      tbl.forEach(function (r, i) {
        if (r.type === 'lam') lam = r.lam;
        const dl = r.type === 'lam' ? null : Math.abs(r.ps1 - r.ps2);
        const tname = r.type === 'lam' ? T('波長', 'λ') : r.type === 'node' ? T('節線', 'nodal') : T('腹線', 'antinodal');
        body += '<tr><td>' + (i + 1) + '</td><td>' + tname + '</td>' + c(r.type === 'lam' ? r.lam : lam, dig + 1) + c(r.ps1, dig) + c(r.ps2, dig) + c(dl, dig) + c(dl != null && lam ? dl / lam : null, 2) + '</tr>';
      });
    }
    if (!tbl.length) body = '<tr><td colspan="7" class="empty" style="text-align:left">' + T('還沒有數據：量好之後按上面的記錄按鈕。', 'No data yet: measure, then press a record button above.') + '</td></tr>';
    $('dataTable').innerHTML = '<thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody>';
    $('undo').disabled = !tbl.length;
  }

  // ---------- 分析圖 ----------
  const gcv = $('graph');
  const gctx = gcv.getContext('2d');
  function plot(o) {
    const np = (o.pts || []).length;
    gcv.setAttribute('aria-label', T('分析圖：', 'Analysis graph: ') + o.yl + T(' 對 ', ' against ') + o.xl + T('，', '; ') + np + T(' 個數據點', ' data points') +
      (o.fit && isFinite(o.fit.m) ? T('，最佳直線斜率 ', '; best-fit slope ') + nf(o.fit.m, 3) : '') + (o.ref ? T('；虛線是理論曲線', '; the dashed curve is the theory') : '') + T('。', '.'));
    const w = gcv.clientWidth;
    if (!w) return;
    const h = Math.round(w * 0.75), r = Math.min(window.devicePixelRatio || 1, 2);
    if (gcv.width !== Math.round(w * r)) { gcv.width = Math.round(w * r); gcv.height = Math.round(h * r); }
    const c = gctx;
    c.setTransform(r, 0, 0, r, 0, 0);
    D.backdrop(c, w, h);
    const pl = 44, pr = 12, pt = 14, pb = 34;
    const gx = function (x) { return pl + (x - o.x0) / (o.x1 - o.x0) * (w - pl - pr); };
    const gy = function (y) { return h - pb - (y - o.y0) / (o.y1 - o.y0) * (h - pt - pb); };
    // 格線與刻度
    const ticks = function (a, b) { const span = b - a, raw = span / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; const st = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; const out = []; for (let v = Math.ceil(a / st - 1e-9) * st; v <= b + 1e-9; v += st) out.push(+v.toFixed(10)); return { list: out, st: st }; };
    const tx = ticks(o.x0, o.x1), ty = ticks(o.y0, o.y1);
    c.strokeStyle = alpha(colors.text, colors.dark ? 0.11 : 0.1); c.lineWidth = 1;
    c.beginPath();
    tx.list.forEach(function (v) { const X0 = Math.round(gx(v)) + 0.5; c.moveTo(X0, pt); c.lineTo(X0, h - pb); });
    ty.list.forEach(function (v) { const Y0 = Math.round(gy(v)) + 0.5; c.moveTo(pl, Y0); c.lineTo(w - pr, Y0); });
    c.stroke();
    c.strokeStyle = alpha(colors.text, 0.7);
    c.beginPath(); c.moveTo(pl + 0.5, pt); c.lineTo(pl + 0.5, h - pb + 0.5); c.lineTo(w - pr, h - pb + 0.5); c.stroke();
    const dec = function (st) { return st >= 1 ? 0 : st >= 0.1 ? 1 : st >= 0.01 ? 2 : 3; };
    tx.list.forEach(function (v) { D.haloText(c, nf(v, dec(tx.st)), gx(v), h - pb + 13, colors.muted, 'center', 'middle', fnt(10.5)); });
    ty.list.forEach(function (v) { D.haloText(c, nf(v, dec(ty.st)), pl - 5, gy(v), colors.muted, 'right', 'middle', fnt(10.5)); });
    D.haloText(c, o.xl, (pl + w - pr) / 2, h - 6, colors.text, 'center', 'alphabetic', fnt(11.5, 600));
    c.save(); c.translate(11, (pt + h - pb) / 2); c.rotate(-Math.PI / 2);
    D.haloText(c, o.yl, 0, 0, colors.text, 'center', 'middle', fnt(11.5, 600));
    c.restore();
    c.save();
    c.beginPath(); c.rect(pl, pt, w - pl - pr, h - pt - pb); c.clip();
    // 理論（參考）曲線
    if (o.ref) {
      c.setLineDash([6, 5]); c.strokeStyle = colors.muted; c.lineWidth = 1.6;
      c.beginPath();
      for (let i = 0; i <= 80; i++) { const x = o.x0 + (o.x1 - o.x0) * i / 80, y = o.ref(x); if (i) c.lineTo(gx(x), gy(y)); else c.moveTo(gx(x), gy(y)); }
      c.stroke(); c.setLineDash([]);
    }
    if (o.fit) {
      c.strokeStyle = colors.accent; c.lineWidth = 2.2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(gx(o.x0), gy(o.fit.m * o.x0 + o.fit.b)); c.lineTo(gx(o.x1), gy(o.fit.m * o.x1 + o.fit.b)); c.stroke();
    }
    c.restore();
    (o.pts || []).forEach(function (p) { D.ball(c, gx(p[0]), gy(p[1]), 4.5, p[2] || colors.pos, { shadow: false }); });
    if (!o.pts || !o.pts.length) D.haloText(c, T('記錄數據後在這裡作圖', 'Your data will be plotted here'), (pl + w - pr) / 2, (pt + h - pb) / 2, colors.muted, 'center', 'middle', fnt(12));
    if (o.legend) {
      let yy = pt + 8;
      o.legend.forEach(function (lg) {
        c.strokeStyle = lg[1]; c.lineWidth = 2; if (lg[2]) c.setLineDash([5, 4]);
        c.beginPath(); c.moveTo(pl + 8, yy); c.lineTo(pl + 26, yy); c.stroke(); c.setLineDash([]);
        D.haloText(c, lg[0], pl + 31, yy, colors.text, 'left', 'middle', fnt(10.5));
        yy += 15;
      });
    }
  }
  function pctText(v) { return isFinite(v) ? (v * 100).toFixed(1) + ' %' : '—'; }
  /** 目前設定下的理論值（真實頻率、水深；給分析與任務比較用） */
  function theory() {
    const f = trueF(), h1 = state.h, h2 = state.h2;
    return { f: f, v1: RC.phaseSpeed(f, h1), v2: RC.phaseSpeed(f, h2), lam1: RC.wavelength(f, h1), lam2: RC.wavelength(f, h2) };
  }
  let analysis = {};
  function renderAnalysis() {
    const p = state.part, tbl = state.tables[p], out = [];
    const dt = function (k, v) { out.push('<dt>' + k + '</dt><dd>' + v + '</dd>'); };
    let hint = '';
    analysis = { part: p };
    if (p === 1) {
      const rows = tbl.filter(function (r) { return r.lp > 0; });
      const pts = rows.map(function (r) { return [r.f, r.f * r.lp / state.Muser * 100]; });
      const th = theory();
      const vt = function (f) { return RC.phaseSpeed(f, state.h) * 100; };
      const ys = pts.map(function (q) { return q[1]; });
      const ymax = Math.max(40, ys.length ? Math.max.apply(null, ys) * 1.15 : 0);
      plot({ x0: 4, x1: 21, y0: 0, y1: ymax, xl: T('頻率 f (Hz)', 'Frequency f (Hz)'), yl: T('波速 v (cm/s)', 'Speed v (cm/s)'), pts: pts, ref: vt, legend: [[T('理論 v(f)（目前水深）', 'Theory v(f) at this depth'), colors.muted, true]] });
      if (rows.length) {
        const last = rows[rows.length - 1], vMeas = last.f * last.lp / state.Muser;
        const vTrue = RC.phaseSpeed(trueF(), state.h);
        dt(T('最後一筆的 λ', 'Last λ'), nf(last.lp / state.Muser * 100, 3) + ' cm');
        dt(T('最後一筆的 v = fλ', 'Last v = fλ'), nf(vMeas * 100, 1) + ' cm/s');
        dt(T('理論波速（目前頻率與水深）', 'Accepted speed (this f and depth)'), nf(vTrue * 100, 1) + ' cm/s');
        dt(T('百分誤差', 'Percent error'), pctText(Math.abs(vMeas / vTrue - 1)));
        analysis.v = vMeas; analysis.vTrue = vTrue; analysis.err = Math.abs(vMeas / vTrue - 1);
      } else dt(T('理論', 'Theory'), T('記錄後比較', 'record to compare'));
      hint = state.light === 'point'
        ? T('點光源時白紙上的影像被放大了：請自己算出放大率 M 填在上面，λ = λ′/M。', 'With a point lamp the paper image is enlarged: work out the magnification M yourself and type it above; λ = λ′/M.')
        : T('平行光時 M = 1。換幾個頻率量量看：水波的波速會隨頻率改變（色散）。', 'With parallel light M = 1. Try several frequencies: the speed of ripples depends on frequency (dispersion).');
      void th;
    } else if (p === 2) {
      const rows = tbl.filter(function (r) { return r.ti != null && r.tr != null; });
      const xs = rows.map(function (r) { return r.ti; }), ys = rows.map(function (r) { return r.tr; });
      const fit = xs.length ? RC.fitThroughOrigin(xs, ys) : null;
      plot({ x0: 0, x1: 90, y0: 0, y1: 90, xl: T('入射角 θi (°)', 'Incidence θi (°)'), yl: T('反射角 θr (°)', 'Reflection θr (°)'), pts: xs.map(function (x, i) { return [x, ys[i]]; }), ref: function (x) { return x; }, fit: fit, legend: [['θr = θi', colors.muted, true], [T('最佳直線', 'Best fit'), colors.accent]] });
      if (fit) {
        dt(T('組數', 'Rows'), String(rows.length));
        dt(T('最佳直線斜率（過原點）', 'Best-fit slope (through 0)'), nf(fit.m, 3));
        dt(T('與 1 相差', 'Difference from 1'), pctText(Math.abs(fit.m - 1)));
        const md = xs.reduce(function (a, x, i) { return a + Math.abs(ys[i] - x); }, 0) / xs.length;
        dt(T('平均 |θr − θi|', 'Mean |θr − θi|'), nf(md, 1) + '°');
        analysis.slope = fit.m; analysis.n = rows.length;
      }
      hint = T('反射定律：反射角等於入射角，斜率應該是 1。', 'Law of reflection: θr = θi, so the slope should be 1.');
    } else if (p === 3) {
      const rows = tbl.filter(function (r) { return r.t1 != null && r.t2 != null; });
      const xs = rows.map(function (r) { return Math.sin(r.t1 * DEG); }), ys = rows.map(function (r) { return Math.sin(r.t2 * DEG); });
      const fit = xs.length ? RC.fitThroughOrigin(xs, ys) : null;
      const th = theory(), ratio = th.v2 / th.v1;
      const lrows = tbl.filter(function (r) { return r.l1 != null && r.l2 != null; });
      const lr = lrows.length ? lrows.reduce(function (a, r) { return a + r.l2 / r.l1; }, 0) / lrows.length : null;
      plot({ x0: 0, x1: 1, y0: 0, y1: 1, xl: 'sin θ1', yl: 'sin θ2', pts: xs.map(function (x, i) { return [x, ys[i]]; }), ref: function (x) { return ratio * x; }, fit: fit,
        legend: [[T('理論斜率 v2/v1', 'Theory slope v2/v1'), colors.muted, true], [T('最佳直線', 'Best fit'), colors.accent]] });
      if (fit) { dt(T('sinθ2 對 sinθ1 的斜率', 'Slope of sinθ2 vs sinθ1'), nf(fit.m, 3)); analysis.slope = fit.m; analysis.n = rows.length; analysis.r2 = fit.r2; }
      if (lr != null) { dt('λ2′ / λ1′', nf(lr, 3)); analysis.lr = lr; }
      dt(T('理論 v2/v1（目前頻率與水深）', 'Accepted v2/v1 (this f and depths)'), nf(ratio, 3));
      if (fit) dt(T('斜率的百分誤差', 'Slope percent error'), pctText(Math.abs(fit.m / ratio - 1)));
      if (lr != null) dt(T('波長比的百分誤差', 'Wavelength-ratio error'), pctText(Math.abs(lr / ratio - 1)));
      analysis.ratio = ratio;
      hint = T('司乃耳定律：sinθ1/sinθ2 = v1/v2 = λ1/λ2；斜率與波長比應該都等於 v2/v1。', 'Snell’s law: sinθ1/sinθ2 = v1/v2 = λ1/λ2, so the slope and the wavelength ratio should both equal v2/v1.');
    } else if (p === 4) {
      const rows = tbl.filter(function (r) { return r.a != null && r.lam != null && r.th != null; });
      const xs = rows.map(function (r) { return r.lam / r.a; }), ys = rows.map(function (r) { return Math.sin(r.th * DEG); });
      const fit = xs.length ? RC.fitThroughOrigin(xs, ys) : null;
      plot({ x0: 0, x1: Math.max(1.2, xs.length ? Math.max.apply(null, xs) * 1.15 : 0), y0: 0, y1: 1.05, xl: 'λ / a', yl: 'sin θ', pts: xs.map(function (x, i) { return [x, ys[i]]; }), ref: function (x) { return x; }, fit: fit,
        legend: [['a sinθ = λ', colors.muted, true], [T('最佳直線', 'Best fit'), colors.accent]] });
      const last = tbl.filter(function (r) { return r.a != null && r.lam != null; }).pop();
      if (last) dt(T('最後一筆 λ/a', 'Last λ/a'), nf(last.lam / last.a, 2) + (last.lam / last.a >= 1 ? T('（繞射很明顯）', ' (strong diffraction)') : last.lam / last.a < 0.4 ? T('（繞射不明顯）', ' (weak diffraction)') : ''));
      if (fit) { dt(T('sinθ 對 λ/a 的斜率', 'Slope of sinθ vs λ/a'), nf(fit.m, 2)); analysis.slope = fit.m; }
      hint = T('λ/a 愈大，波散得愈開；第一條暗線大約在 a sinθ = λ 的方向（只在 λ < a 時存在）。', 'The larger λ/a, the more the waves spread; the first dark line is near a sinθ = λ (only when λ < a).');
    } else {
      const lam = lastLam5();
      const rows = tbl.filter(function (r) { return r.type !== 'lam'; });
      const pts = [], xs = [], ys = [];
      if (lam) rows.forEach(function (r) {
        const dl = Math.abs(r.ps1 - r.ps2), q = dl / lam;
        const m = r.type === 'node' ? Math.max(0.5, Math.round(q - 0.5) + 0.5) : Math.round(q);
        xs.push(m); ys.push(dl); pts.push([m, dl, r.type === 'node' ? colors.neg : colors.pos]);
      });
      const fit = xs.length ? RC.fitThroughOrigin(xs, ys) : null;
      plot({ x0: 0, x1: Math.max(4, xs.length ? Math.max.apply(null, xs) + 0.5 : 0), y0: 0, y1: Math.max(4 * (lam || 2.5), ys.length ? Math.max.apply(null, ys) * 1.15 : 0), xl: T('級數 m（節線 n − ½，腹線 n）', 'Order m (nodal n − ½, antinodal n)'), yl: "|Δ|′ (cm)", pts: pts, fit: fit,
        legend: [[T('最佳直線：斜率 = λ′', 'Best fit: slope = λ′'), colors.accent]] });
      if (lam) dt(T('直尺量的波長 λ′', 'λ′ from the ruler'), nf(lam, 2) + ' cm');
      if (fit) { analysis.slope = fit.m; dt(T('由斜率得 λ′', 'λ′ from the slope'), nf(fit.m, 2) + ' cm'); if (lam) dt(T('兩者相差', 'Difference'), pctText(Math.abs(fit.m / lam - 1))); }
      if (state.src === 'pair') {
        const n = RC.nodalLineCount(state.d, lamDeep());
        dt(T('預測的節線數 2⌊d/λ + ½⌋', 'Predicted nodal lines 2⌊d/λ + ½⌋'), String(n));
      }
      hint = T('節線：|Δ| = (n − ½)λ；腹線：|Δ| = nλ。點的顏色：藍 = 節線、紅 = 腹線。', 'Nodal: |Δ| = (n − ½)λ; antinodal: |Δ| = nλ. Blue dots = nodal, red = antinodal.');
    }
    $('anaOut').innerHTML = out.join('');
    $('anaHint').textContent = hint;
  }

  // ======================================================================
  // 步驟清單
  // ======================================================================
  function stepsOf(p) {
    const t = state.tables[p], F = state.flags;
    const frozen = frozenInfo().frozen && state.gen;
    if (p === 1) return [
      [state.mode === 'real' ? T('用水平儀把槽底調水平（氣泡在中央）', 'Level the tank with the spirit level (bubble centred)') : T('槽底已調水平（選「含誤差」可以自己調）', 'Tank already level (choose “With errors” to do it yourself)'), state.mode !== 'real' || tiltDeg() < LEVEL_OK],
      [T('槽壁四周放海綿', 'Put sponges along the walls'), state.sponge],
      [T('打開直線起波器', 'Switch on the straight generator'), state.gen && state.src === 'bar'],
      [T('打開閃頻儀，調到條紋靜止', 'Switch on the strobe and make the bands stand still'), frozen],
      [T('直尺跨過好幾條亮紋，記錄波長', 'Lay the ruler across several bright bands and record λ'), t.length >= 1],
      [T('換一個頻率再量一次', 'Measure again at another frequency'), new Set(t.map(function (r) { return r.f.toFixed(2); })).size >= 2]
    ];
    if (p === 2) return [
      [T('把直條障礙物斜放（β 至少 10°）', 'Set the straight block at an angle (β ≥ 10°)'), state.shape === 'straight' && state.beta >= 10],
      [T('用閃頻儀讓條紋靜止', 'Freeze the pattern with the strobe'), frozen],
      [T('直尺沿入射波前，記錄 θi', 'Ruler along an incident wavefront: record θi'), t.some(function (r) { return r.ti != null; })],
      [T('直尺沿反射波前，記錄 θr', 'Ruler along a reflected wavefront: record θr'), t.some(function (r) { return r.ti != null && r.tr != null; })],
      [T('換角度，共記錄 3 組', 'Change the angle: 3 rows in all'), t.filter(function (r) { return r.ti != null && r.tr != null; }).length >= 3],
      [T('換凹弧、凸弧觀察反射', 'Look at reflection from the concave and convex arcs'), !!(F.concave && F.convex)]
    ];
    if (p === 3) return [
      [T('放薄壓克力板，板邊與起波器平行（α = 0）', 'Place the thin plate with its edge parallel to the generator (α = 0)'), !!F.alpha0],
      [T('記錄深水與淺水的波長 λ1′、λ2′', 'Record the deep and shallow wavelengths λ1′, λ2′'), t.some(function (r) { return r.l1 != null && r.l2 != null; })],
      [T('把板轉斜（α 至少 15°）', 'Turn the plate (α ≥ 15°)'), state.alpha >= 15 || !!F.alpha15],
      [T('記錄入射角 θ1 與折射角 θ2', 'Record θ1 and θ2'), t.some(function (r) { return r.t1 != null && r.t2 != null; })],
      [T('換角度，共記錄 3 組', 'Change the angle: 3 rows in all'), t.filter(function (r) { return r.t1 != null && r.t2 != null; }).length >= 3]
    ];
    if (p === 4) return [
      [T('放短障礙物，觀察後方的波', 'Look behind a short barrier'), !!F.obstacle],
      [T('改變障礙物長度', 'Change the barrier length'), !!F.obsLen],
      [T('換成狹縫，記錄縫寬 a′ 與波長 λ′', 'Make a slit and record a′ and λ′'), t.some(function (r) { return r.a != null && r.lam != null; })],
      [T('改變縫寬或頻率，再記錄一組', 'Change the slit or the frequency and record again'), new Set(t.filter(function (r) { return r.a != null && r.lam != null; }).map(function (r) { return (r.lam / r.a).toFixed(2); })).size >= 2],
      [T('（進階）記錄第一條暗線的方向 θ', '(Extra) record the direction θ of the first dark line'), t.some(function (r) { return r.th != null; })]
    ];
    return [
      [T('換成兩個點波源', 'Change to two dippers'), state.src === 'pair'],
      [T('讓條紋靜止，記錄波長 λ′', 'Freeze the pattern and record λ′'), t.some(function (r) { return r.type === 'lam'; })],
      [T('探針放在節線上記錄', 'Record P on a nodal line'), t.some(function (r) { return r.type === 'node'; })],
      [T('探針放在腹線上記錄', 'Record P on an antinodal line'), t.some(function (r) { return r.type === 'anti'; })],
      [T('改變頻率，數數看節線', 'Change f and count the nodal lines'), !!F.f5],
      [T('改變兩波源的間距 d', 'Change the separation d'), !!F.d5]
    ];
  }
  let lastStepsHTML = '';
  function updateSteps() {
    const list = stepsOf(state.part);
    let cur = list.findIndex(function (s) { return !s[1]; });
    const html = list.map(function (s, i) { return '<li class="' + (s[1] ? 'done' : i === cur ? 'now' : '') + '">' + s[0] + '</li>'; }).join('');
    if (html !== lastStepsHTML) { $('steps').innerHTML = html; lastStepsHTML = html; }
  }

  // ======================================================================
  // 動畫
  // ======================================================================
  let rafOn = false, lastNow = 0, simDebt = 0, realAcc = 0, simAcc = 0, speedNow = 0;
  function requestDraw() {
    if (rafOn) return;
    rafOn = true;
    requestAnimationFrame(frame);
  }
  function frame(now) {
    rafOn = false;
    if (!sim || !L) return;
    const dtr = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0;
    lastNow = now;
    let stepped = 0;
    const animating = state.running && !document.hidden;
    if (animating && dtr > 0) {
      const target = state.speedSel;
      simDebt += dtr * target;
      let want = Math.floor(simDebt / sim.dt);
      const budget = Math.max(1, Math.floor(9 / Math.max(0.01, perf.msPerStep)));
      if (want > budget) { want = budget; simDebt = Math.min(simDebt, (budget + 1) * sim.dt); }
      const t0 = performance.now();
      for (let s = 0; s < want; s++) {
        sim.step(1);
        if (state.strobe) {
          if (strobeNext <= sim.t - sim.dt || strobeNext <= 0) strobeNext = Math.ceil(sim.t * state.fs) / state.fs;
          if (sim.t >= strobeNext) {
            sim.snapshot(strobeBuf, strobeNext);
            strobeHas = true;
            strobeNext += 1 / state.fs;
          }
        }
      }
      stepped = want;
      simDebt -= want * sim.dt;
      if (want > 0) perf.msPerStep = 0.85 * perf.msPerStep + 0.15 * (performance.now() - t0) / want;
      realAcc += dtr; simAcc += want * sim.dt;
      if (realAcc > 0.6) {
        speedNow = simAcc / realAcc;
        realAcc = 0; simAcc = 0;
        updateSpeedInfo();
        adapt(target);
      }
      generatorSound();
    }
    if (stepped > 0) imgDirty = true;
    if (view3 && view3.active) view3.frame();
    else draw();
    if (stepped > 0 && Math.round(now / 250) !== frame.q) { frame.q = Math.round(now / 250); updateReadouts(); updateSteps(); }
    if (animating || drag) requestDraw();
  }
  /** 太慢時把格子變粗（只降不升，至少 25000 格） */
  function adapt(target) {
    const now = performance.now();
    if (speedNow < 0.45 * target && perf.msPerStep * Math.ceil(target / 60 / sim.dt) > 9) {
      if (!perf.slowSince) perf.slowSince = now;
      if (now - perf.slowSince > 2500 && now - perf.lastDowngrade > 6000 && maxCells > 25000) {
        maxCells = Math.max(25000, Math.round(maxCells * 0.7));
        perf.lastDowngrade = now; perf.slowSince = 0;
        syncSim(true);
        setStatus(T('這台裝置算得比較慢，方格已自動變粗以保持流暢。', 'This device is a bit slow, so the grid was made coarser to keep things smooth.'));
      }
    } else perf.slowSince = 0;
  }
  function updateSpeedInfo() {
    $('speedInfo').textContent = state.running ? '×' + (speedNow >= 0.95 ? nf(speedNow, 2) : nf(speedNow, 3)) + T('（目標 ', ' (target ') + (state.speedSel >= 1 ? '1' : '1/' + Math.round(1 / state.speedSel)) + T('）', ')') : T('暫停', 'paused');
  }
  function updateGridInfo() {
    $('gridInfo').textContent = sim.nx + ' × ' + sim.ny + T('，每波長 ', ', ') + Math.round(sim.ppw) + T(' 格', ' cells per λ');
  }

  // ---------- 音效（sound.js；音效關閉時完全不呼叫） ----------
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  let hum = null;
  function generatorSound() {
    const S = sound();
    const want = !!S && state.gen && state.running;
    if (!want) { if (hum) { hum.stop(0.15); hum = null; } return; }
    const fq = 220 + 18 * state.dial;
    if (!hum) hum = S.voice({ freq: fq, type: 'triangle', gain: 0.06 });
    else hum.set({ freq: fq, gain: 0.06 }, 0.08);
  }
  function stopHum() { if (hum) { hum.stop(0.1); hum = null; } }
  let wasFrozen = false;
  function frozenChime() {
    const fz = frozenInfo().frozen && state.gen;
    if (fz && !wasFrozen) { const S = sound(); if (S) { S.tone({ freq: 784, dur: 0.12, type: 'sine', gain: 0.25 }); S.tone({ freq: 1175, dur: 0.18, type: 'sine', gain: 0.22, delay: 0.09 }); } }
    wasFrozen = fz;
  }

  // ======================================================================
  // 任務模式（missions.js）
  // ======================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function common() {
    const t = theory();
    return {
      part: state.part, mode: state.mode, src: state.src, shape: state.shape, diff: state.diff,
      f: t.f, dial: state.dial, fs: state.fs, strobe: state.strobe, gen: state.gen, sponge: state.sponge,
      h: state.h, h2: state.h2, alpha: state.alpha, beta: state.beta, R: state.R, d: state.d, slitA: state.slitA, obsL: state.obsL,
      light: state.light, lampH: state.lampH, M: magnif(), Muser: state.Muser, tilt: tiltDeg(),
      lam1: t.lam1, lam2: t.lam2, v1: t.v1, v2: t.v2, nodal: state.src === 'pair' ? RC.nodalLineCount(state.d, t.lam1) : null,
      frozen: frozenInfo().frozen && state.gen, frozenN: frozenInfo().n,
      elapsed: (performance.now() - simBorn) / 1000
    };
  }
  function emitRecord(col, row) {
    const d = common();
    d.col = col;
    d.row = Object.assign({}, row);
    d.table = state.tables[state.part].map(function (r) { return Object.assign({}, r); });
    d.fit = Object.assign({}, analysis);
    // 真實值（紙上）：給任務檢查量測準不準
    d.truePaperLam = lamDeep() * magnif() * 100;
    if (state.part === 1) { d.trueV = RC.phaseSpeed(trueF(), state.h); d.vMeas = row.f * row.lp / state.Muser / 100; }
    if (state.part === 2 && state.shape === 'straight') d.trueTheta = state.beta;
    if (state.part === 3) d.theta2 = RC.snell(state.alpha * DEG, d.v1, d.v2) / DEG;
    if (state.part === 5 && row.type !== 'lam') {
      const s = sourcePoints(), P = state.probe;
      const dl = Math.abs(Math.hypot(P.x - s[0][0], P.y - s[0][1]) - Math.hypot(P.x - s[1][0], P.y - s[1][1]));
      d.trueOrder = dl / lamDeep();
    }
    emit('record', d);
  }
  function emitConfig() {
    const d = common();
    if (state.src === 'point' && state.part === 2 && state.shape === 'concave') {
      const o = arcObj();
      d.focusDist = Math.hypot(state.pt.x - (o.vx - o.R / 2), state.pt.y - o.vy);
    }
    emit('config', d);
  }
  function emitStrobe() { emit('strobe', common()); }
  function emitRuler() {
    const r = state.ruler;
    if (!r) return;
    const d = common();
    d.A = { x: r.a.x, y: r.a.y }; d.B = { x: r.b.x, y: r.b.y };
    d.lenWater = Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y);
    if (state.part === 2 && state.shape !== 'straight') {
      const o = arcObj();
      d.vertex = { x: o.vx, y: o.vy };
      d.focus = { x: state.shape === 'concave' ? o.vx - o.R / 2 : o.vx + o.R / 2, y: o.vy };
    }
    emit('ruler', d);
  }

  // ======================================================================
  // 拖曳與鍵盤
  // ======================================================================
  let drag = null, hover = null;
  function evPos(ev) { const b = cv.getBoundingClientRect(); return { x: ev.clientX - b.left, y: ev.clientY - b.top }; }
  function dist2seg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  }
  function hit(px, py, touch) {
    const tol = touch ? 22 : 13;
    const r = state.ruler;
    if (r) {
      if (Math.hypot(px - X(r.b.x), py - Y(r.b.y)) < tol) return 'rulerb';
      if (Math.hypot(px - X(r.a.x), py - Y(r.a.y)) < tol) return 'rulera';
    }
    if (state.part === 5 && Math.hypot(px - X(state.probe.x), py - Y(state.probe.y)) < tol + 4) return 'probe';
    const x = wx(px), y = wy(py), tw = tol / L.s;
    if (state.part === 2) {
      if (state.shape === 'straight') {
        const hp = barRotHandle();
        if (Math.hypot(px - X(hp.x), py - Y(hp.y)) < tol) return 'barRot';
        if (RC.inRect(Object.assign({}, barObj(), { thick: BAR_THICK + 2 * tw, len: BAR_LEN + tw }), x, y)) return 'bar';
      } else {
        const o = arcObj();
        if (Math.hypot(px - X(o.vx), py - Y(o.vy)) < tol || RC.inArc(Object.assign({}, o, { thick: ARC_THICK + 2 * tw }), x, y)) return 'arc';
      }
    }
    if (state.part === 3) {
      const hp = plateRotHandle();
      if (Math.hypot(px - X(hp.x), py - Y(hp.y)) < tol) return 'plateRot';
    }
    if (state.part === 4) {
      if (diffSolids().some(function (o) { return RC.inRect(Object.assign({}, o, { thick: STRIP_THICK + 2 * tw }), x, y); })) return 'diff';
      const hy = state.diff === 'obstacle' ? state.obsY : H / 2 + state.slitA / 2 + 0.03;
      if (Math.hypot(px - X(state.diffX), py - Y(hy)) < tol) return 'diff';
    }
    if (state.src !== 'bar' && sourcePoints().some(function (p) { return Math.hypot(px - X(p[0]), py - Y(p[1])) < tol; })) return 'src';
    if (r && dist2seg(px, py, X(r.a.x), Y(r.a.y), X(r.b.x), Y(r.b.y)) < (touch ? 12 : 7)) return 'ruler';
    if (state.part === 3) {
      const p = plateObj();
      const edgeD = Math.abs((x - p.cx) * Math.cos(p.ang) + (y - p.cy) * Math.sin(p.ang)) - p.w / 2;
      if (Math.abs(edgeD) < tw) return 'plate';
    }
    return null;
  }
  const clampX = function (x) { return Math.max(0, Math.min(W, x)); };
  const clampY = function (y) { return Math.max(0, Math.min(H, y)); };
  cv.addEventListener('pointerdown', function (ev) {
    if (!L) return;
    const p = evPos(ev), touch = ev.pointerType !== 'mouse';
    const k = hit(p.x, p.y, touch);
    const x = clampX(wx(p.x)), y = clampY(wy(p.y));
    drag = { kind: k || 'newRuler', x0: x, y0: y, px: p.x, py: p.y, moved: false, touch: touch };
    if (drag.kind === 'ruler') drag.orig = JSON.parse(JSON.stringify(state.ruler));
    if (drag.kind === 'src') drag.orig = state.src === 'point' ? Object.assign({}, state.pt) : Object.assign({}, state.pair);
    if (drag.kind === 'bar') drag.orig = Object.assign({}, state.barC);
    if (drag.kind === 'arc') drag.orig = Object.assign({}, state.shape === 'concave' ? state.cavV : state.vexV);
    if (drag.kind === 'plate') drag.orig = Object.assign({}, state.plateC);
    if (drag.kind === 'diff') drag.orig = { x: state.diffX, y: state.obsY };
    if (drag.kind === 'rulera' || drag.kind === 'rulerb') state.rulerEnd = drag.kind.slice(-1);
    cv.setPointerCapture(ev.pointerId);
    ev.preventDefault();
    requestDraw();
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!L) return;
    const p = evPos(ev);
    if (!drag) {
      const h = hit(p.x, p.y, ev.pointerType !== 'mouse');
      if (h !== hover) { hover = h; cv.style.cursor = h ? (h === 'barRot' || h === 'plateRot' ? 'grab' : 'move') : 'crosshair'; requestDraw(); }
      return;
    }
    const x = clampX(wx(p.x)), y = clampY(wy(p.y));
    drag.px = p.x; drag.py = p.y;
    const dx = x - drag.x0, dy = y - drag.y0;
    if (Math.hypot(dx, dy) * L.s > 3) drag.moved = true;
    const k = drag.kind;
    if (k === 'newRuler') {
      if (drag.moved) { state.ruler = { a: { x: drag.x0, y: drag.y0 }, b: { x: x, y: y } }; state.rulerEnd = 'b'; drag.kind = 'rulerb'; }
    } else if (k === 'rulera' || k === 'rulerb') {
      state.ruler[k.slice(-1)] = { x: x, y: y };
    } else if (k === 'ruler') {
      const o = drag.orig;
      state.ruler = { a: { x: o.a.x + dx, y: o.a.y + dy }, b: { x: o.b.x + dx, y: o.b.y + dy } };
    } else if (k === 'probe') {
      state.probe = { x: x, y: y };
    } else if (k === 'src') {
      const o = drag.orig;
      const nx = Math.max(0.035, Math.min(W - 0.035, o.x + dx)), ny = Math.max(0.035, Math.min(H - 0.035, o.y + dy));
      if (state.src === 'point') state.pt = { x: nx, y: ny }; else state.pair = { x: nx, y: ny };
      geometryChanged();
    } else if (k === 'bar') {
      state.barC = { x: Math.max(0.1, Math.min(W - 0.05, drag.orig.x + dx)), y: Math.max(0.05, Math.min(H - 0.05, drag.orig.y + dy)) };
      geometryChanged();
    } else if (k === 'barRot') {
      // β：障礙物與波前（鉛直方向）的夾角
      let a = Math.atan2(y - state.barC.y, x - state.barC.x) / DEG - 90;
      while (a < -90) a += 180; while (a > 90) a -= 180;
      a = Math.max(0, Math.min(70, Math.round(Math.abs(a))));
      if (a !== state.beta) { state.beta = a; setSlider($('beta'), a); geometryChanged(); }
    } else if (k === 'arc') {
      const v = { x: Math.max(0.12, Math.min(W - 0.04, drag.orig.x + dx)), y: Math.max(0.06, Math.min(H - 0.06, drag.orig.y + dy)) };
      if (state.shape === 'concave') state.cavV = v; else state.vexV = v;
      geometryChanged();
    } else if (k === 'plate') {
      state.plateC = { x: Math.max(0.1, Math.min(W - 0.06, drag.orig.x + dx)), y: Math.max(0.04, Math.min(H - 0.04, drag.orig.y + dy)) };
      geometryChanged();
    } else if (k === 'plateRot') {
      let a = Math.atan2(y - state.plateC.y, x - state.plateC.x) / DEG - 90;
      while (a < -90) a += 180; while (a > 90) a -= 180;
      a = Math.max(0, Math.min(60, Math.round(Math.abs(a))));
      if (a !== state.alpha) { state.alpha = a; setSlider($('alpha'), a); if (a >= 15) state.flags.alpha15 = true; if (a === 0) state.flags.alpha0 = true; geometryChanged(); }
    } else if (k === 'diff') {
      state.diffX = Math.max(0.09, Math.min(W - 0.08, drag.orig.x + dx));
      if (state.diff === 'obstacle') state.obsY = Math.max(0.05, Math.min(H - 0.05, drag.orig.y + dy));
      geometryChanged();
    }
    updateReadouts();
    requestDraw();
  });
  function endDrag() {
    if (!drag) return;
    const k = drag.kind;
    if (k === 'newRuler' && !drag.moved) {
      // 點一下：沒有直尺時在這裡放一把預設長度的直尺
      if (!state.ruler) { state.ruler = { a: { x: drag.x0, y: drag.y0 }, b: { x: Math.min(W, drag.x0 + 0.06), y: drag.y0 } }; state.rulerEnd = 'b'; }
    }
    if (/^ruler/.test(k) || k === 'newRuler') emitRuler();
    if (k === 'probe') emit('probe', Object.assign(common(), { P: Object.assign({}, state.probe) }));
    if (k === 'src' || k === 'bar' || k === 'barRot' || k === 'arc' || k === 'plate' || k === 'plateRot' || k === 'diff') { emitConfig(); updateSteps(); }
    drag = null;
    updateReadouts();
    requestDraw();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (!drag && hover) { hover = null; requestDraw(); } });
  // ---------- 鍵盤：每個可拖曳的物體都能選取、移動；位置限制與任務事件和拖曳相同 ----------
  const KB_STEP = 0.001, KB_BIG = 0.01; // 方向鍵 1 mm，Shift 1 cm（水面座標）；角度 1°，Shift 5°
  const kbTimers = {};
  /** 和放開滑鼠時一樣送出任務事件；連按方向鍵時，停下來 0.4 s 才送一次 */
  function kbLater(k, fn) { clearTimeout(kbTimers[k]); kbTimers[k] = setTimeout(fn, 400); }
  function kbCfg() { geometryChanged(); kbLater('cfg', function () { emitConfig(); updateSteps(); }); }
  function posText(q) { return '(' + nf(q.x * 100, 1) + T(' cm、', ' cm, ') + nf(q.y * 100, 1) + ' cm)'; }
  function stepPt(o, dx, dy, big, x0, x1, y0, y1) {
    const d = big ? KB_BIG : KB_STEP;
    const q = { x: Math.max(x0, Math.min(x1, o.x + dx * d)), y: Math.max(y0, Math.min(y1, o.y + dy * d)) };
    return Math.abs(q.x - o.x) < 1e-12 && Math.abs(q.y - o.y) < 1e-12 ? null : q;
  }
  function rulerText() {
    const rd = readRuler();
    if (!state.ruler) return T('還沒有直尺：按方向鍵放一把。', 'No ruler yet: press an arrow key to lay one.');
    return T('直尺長 ', 'Ruler length ') + rd.lenText + (rd.angText && state.part !== 1 && state.part !== 5 ? T('，', ', ') + rd.refName + ' ' + rd.angText : '') + T('。', '.');
  }
  /** 沒有直尺時，第一次按方向鍵先放一把預設的直尺（和舊版鍵盤操作相同） */
  function kbNewRuler() {
    if (state.ruler) return false;
    state.ruler = { a: { x: 0.12, y: H / 2 }, b: { x: 0.2, y: H / 2 } };
    updateReadouts(); kbLater('ruler', emitRuler);
    return true;
  }
  function rulerEndItem(e) {
    return {
      id: 'r' + e, name: function () { return T('直尺端點 ', 'Ruler end ') + e.toUpperCase(); },
      on: function () { return true; },
      move: function (dx, dy, big) {
        state.rulerEnd = e;
        if (kbNewRuler()) return true;
        const q = stepPt(state.ruler[e], dx, dy, big, 0, W, 0, H);
        if (!q) return false;
        state.ruler[e] = q;
        updateReadouts(); kbLater('ruler', emitRuler);
        return true;
      },
      describe: function () { return state.ruler ? T('端點 ', 'End ') + e.toUpperCase() + T(' 在 ', ' at ') + posText(state.ruler[e]) + T('；', '; ') + rulerText() : rulerText(); }
    };
  }
  const KB_ALL = [
    rulerEndItem('a'), rulerEndItem('b'),
    { id: 'ruler', name: function () { return T('整把直尺', 'Whole ruler'); }, on: function () { return true; },
      move: function (dx, dy, big) {
        if (kbNewRuler()) return true;
        const r = state.ruler, d = big ? KB_BIG : KB_STEP;
        const mx = Math.max(-Math.min(r.a.x, r.b.x), Math.min(W - Math.max(r.a.x, r.b.x), dx * d));
        const my = Math.max(-Math.min(r.a.y, r.b.y), Math.min(H - Math.max(r.a.y, r.b.y), dy * d));
        if (Math.abs(mx) < 1e-12 && Math.abs(my) < 1e-12) return false;
        state.ruler = { a: { x: r.a.x + mx, y: r.a.y + my }, b: { x: r.b.x + mx, y: r.b.y + my } };
        updateReadouts(); kbLater('ruler', emitRuler);
        return true;
      },
      describe: function () { return state.ruler ? T('直尺從 ', 'Ruler from ') + posText(state.ruler.a) + T(' 到 ', ' to ') + posText(state.ruler.b) + T('；', '; ') + rulerText() : rulerText(); } },
    { id: 'probe', name: function () { return T('探針 P', 'Probe P'); }, on: function () { return state.part === 5; },
      move: function (dx, dy, big) {
        const q = stepPt(state.probe, dx, dy, big, 0, W, 0, H);
        if (!q) return false;
        state.probe = q;
        updateReadouts();
        kbLater('probe', function () { emit('probe', Object.assign(common(), { P: Object.assign({}, state.probe) })); });
        return true;
      },
      describe: function () {
        const pr = probeRead(), fl = fine() ? 2 : 1;
        return T('探針 P 在 ', 'Probe P at ') + posText(state.probe) + (pr ? T('；PS1′ = ', '; PS1′ = ') + nf(pr.ps1, fl) + T(' cm、PS2′ = ', ' cm, PS2′ = ') + nf(pr.ps2, fl) + T(' cm，相差 ', ' cm, difference ') + nf(pr.dlt, fl) + ' cm' : '') + T('。', '.');
      } },
    { id: 'src', name: function () { return state.src === 'pair' ? T('兩個點波源', 'The two dippers') : T('點波源 S', 'Dipper S'); }, on: function () { return state.src !== 'bar'; },
      move: function (dx, dy, big) {
        const o = state.src === 'point' ? state.pt : state.pair;
        const q = stepPt(o, dx, dy, big, 0.035, W - 0.035, 0.035, H - 0.035);
        if (!q) return false;
        if (state.src === 'point') state.pt = q; else state.pair = q;
        kbCfg();
        return true;
      },
      describe: function () {
        return state.src === 'pair' ? T('兩個點波源的中點在 ', 'Midpoint of the two dippers at ') + posText(state.pair) + T('，間距 d = ', ', spacing d = ') + nf(state.d * 100, 1) + ' cm' + T('。', '.')
          : T('點波源 S 在 ', 'Dipper S at ') + posText(state.pt) + T('。', '.');
      } },
    { id: 'bar', name: function () { return T('厚壓克力塊', 'Thick acrylic block'); }, on: function () { return state.part === 2 && state.shape === 'straight'; },
      move: function (dx, dy, big) {
        const q = stepPt(state.barC, dx, dy, big, 0.1, W - 0.05, 0.05, H - 0.05);
        if (!q) return false;
        state.barC = q; kbCfg();
        return true;
      },
      describe: function () { return T('厚壓克力塊的中心在 ', 'Centre of the block at ') + posText(state.barC) + T('，β = ', ', β = ') + state.beta + '°' + T('。', '.'); } },
    { id: 'barRot', name: function () { return T('壓克力塊的轉向把手', 'Turning handle of the block'); }, on: function () { return state.part === 2 && state.shape === 'straight'; },
      move: function (dx, dy, big) {
        const a = Math.max(0, Math.min(70, Math.round(state.beta + (dx || dy) * (big ? 5 : 1))));
        if (a === state.beta) return false;
        state.beta = a; setSlider($('beta'), a); kbCfg();
        return true;
      },
      describe: function () { return T('障礙物與波前的夾角 β = ', 'Angle between the block and the wavefronts β = ') + state.beta + '°' + T('（0°～70°）。', ' (0° to 70°).'); } },
    { id: 'arc', name: function () { return state.shape === 'concave' ? T('凹弧障礙物', 'Concave arc') : T('凸弧障礙物', 'Convex arc'); }, on: function () { return state.part === 2 && state.shape !== 'straight'; },
      move: function (dx, dy, big) {
        const o = state.shape === 'concave' ? state.cavV : state.vexV;
        const q = stepPt(o, dx, dy, big, 0.12, W - 0.04, 0.06, H - 0.06);
        if (!q) return false;
        if (state.shape === 'concave') state.cavV = q; else state.vexV = q;
        kbCfg();
        return true;
      },
      describe: function () { return T('圓弧的頂點在 ', 'Vertex of the arc at ') + posText(state.shape === 'concave' ? state.cavV : state.vexV) + T('。', '.'); } },
    { id: 'plate', name: function () { return T('薄壓克力板', 'Thin acrylic plate'); }, on: function () { return state.part === 3; },
      move: function (dx, dy, big) {
        const q = stepPt(state.plateC, dx, dy, big, 0.1, W - 0.06, 0.04, H - 0.04);
        if (!q) return false;
        state.plateC = q; kbCfg();
        return true;
      },
      describe: function () { return T('薄壓克力板的中心在 ', 'Centre of the plate at ') + posText(state.plateC) + T('，α = ', ', α = ') + state.alpha + '°' + T('。', '.'); } },
    { id: 'plateRot', name: function () { return T('薄板的轉向把手', 'Turning handle of the plate'); }, on: function () { return state.part === 3; },
      move: function (dx, dy, big) {
        const a = Math.max(0, Math.min(60, Math.round(state.alpha + (dx || dy) * (big ? 5 : 1))));
        if (a === state.alpha) return false;
        state.alpha = a; setSlider($('alpha'), a);
        if (a >= 15) state.flags.alpha15 = true;
        if (a === 0) state.flags.alpha0 = true;
        kbCfg();
        return true;
      },
      describe: function () { return T('板邊與波前的夾角 α = ', 'Angle between the plate edge and the wavefronts α = ') + state.alpha + '°' + T('（0°～60°）。', ' (0° to 60°).'); } },
    { id: 'diff', name: function () { return state.diff === 'obstacle' ? T('長條形障礙物', 'Strip barrier') : T('狹縫', 'Slit'); }, on: function () { return state.part === 4; },
      move: function (dx, dy, big) {
        const o = { x: state.diffX, y: state.obsY };
        const q = stepPt(o, dx, state.diff === 'obstacle' ? dy : 0, big, 0.09, W - 0.08, 0.05, H - 0.05);
        if (!q) return false;
        state.diffX = q.x; if (state.diff === 'obstacle') state.obsY = q.y;
        kbCfg();
        return true;
      },
      describe: function () {
        return state.diff === 'obstacle' ? T('長條形障礙物在 ', 'Strip barrier at ') + posText({ x: state.diffX, y: state.obsY }) + T('。', '.')
          : T('狹縫在 x = ', 'Slit at x = ') + nf(state.diffX * 100, 1) + T(' cm（只能左右移）。', ' cm (it moves left and right only).');
      } }
  ];
  /** 依目前的實驗項目、起波器與障礙物更新可選的物體（保留原本選取的那一個） */
  function kbFill() {
    const ids = KB_ALL.filter(function (it) { return it.on(); });
    if (ids.map(function (it) { return it.id; }).join() === kbItems.map(function (it) { return it.id; }).join()) return;
    const was = kbSel();
    kbItems.length = 0;
    ids.forEach(function (it) { kbItems.push(it); });
    if (kb) {
      let i = 0;
      kbItems.forEach(function (it, n) { if (it.id === was) i = n; });
      if (i !== kb.index() || kb.index() >= kbItems.length) kb.select(i);
    }
  }
  function kbSel() { const it = kb ? kbItems[kb.index()] : null; return it ? it.id : null; }
  /** 鍵盤焦點框（--accent 虛線圓角框） */
  function drawKbFocus(c) {
    if (!kb || !kb.focused()) return;
    const id = kbSel();
    if (!id) return;
    const pts = [];
    let pad = 12;
    const r = state.ruler;
    if ((id === 'ra' || id === 'rb') && r) pts.push(r[id.slice(1)]);
    else if (id === 'ruler' && r) { pts.push(r.a, r.b); }
    else if (id === 'probe') { pts.push(state.probe); pad = 14; }
    else if (id === 'src') sourcePoints().forEach(function (q) { pts.push({ x: q[0], y: q[1] }); });
    else if (id === 'bar') {
      const o = barObj(), ca = Math.cos(o.ang), sa = Math.sin(o.ang);
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (k) { pts.push({ x: o.cx + k[0] * o.len / 2 * ca - k[1] * o.thick / 2 * sa, y: o.cy + k[0] * o.len / 2 * sa + k[1] * o.thick / 2 * ca }); });
      pad = 6;
    } else if (id === 'barRot') pts.push(barRotHandle());
    else if (id === 'arc') { const o = arcObj(); pts.push({ x: o.vx, y: o.vy }); pad = 14; }
    else if (id === 'plate') {
      const p = plateObj(), ca = Math.cos(p.ang), sa = Math.sin(p.ang);
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (k) { pts.push({ x: p.cx + k[0] * p.w / 2 * ca - k[1] * 0.03 * sa, y: p.cy + k[0] * p.w / 2 * sa + k[1] * 0.03 * ca }); });
      pad = 4;
    } else if (id === 'plateRot') pts.push(plateRotHandle());
    else if (id === 'diff') pts.push({ x: state.diffX, y: state.diff === 'obstacle' ? state.obsY : H / 2 + state.slitA / 2 + 0.03 });
    c.save();
    c.setLineDash([5, 4]); c.strokeStyle = colors.accent; c.lineWidth = 2;
    if (pts.length) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      pts.forEach(function (q) { const px = X(q.x), py = Y(q.y); x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); });
      x0 = Math.max(X(0) + 2, x0 - pad); y0 = Math.max(Y(H) + 2, y0 - pad);
      x1 = Math.min(X(W) - 2, x1 + pad); y1 = Math.min(Y(0) - 2, y1 + pad);
      D.roundRect(c, x0, y0, Math.max(8, x1 - x0), Math.max(8, y1 - y0), 6);
    } else D.roundRect(c, X(0) + 3, Y(H) + 3, W * L.s - 6, H * L.s - 6, 8); // 還沒有直尺：框住整個水槽
    c.stroke();
    c.restore();
  }
  if (window.LabKeys) {
    // 先更新清單，keys.js 再處理按鍵（同一個元素上依註冊順序執行）
    cv.addEventListener('focus', kbFill);
    cv.addEventListener('keydown', kbFill);
    kbFill();
    kb = window.LabKeys.attach(cv, {
      label: T('水波槽俯視圖：白紙上的亮暗紋投影。在畫面上拖曳可以拉出直尺。鍵盤：Enter 依序選直尺端點 A、B、整把直尺、探針與障礙物，方向鍵移動 1 mm（Shift 1 cm），轉向把手每次轉 1°（Shift 5°）。',
        'Top view of the ripple tank: the bright and dark bands projected onto the paper. Drag on the picture to lay down a ruler. Keyboard: Enter picks ruler end A, end B, the whole ruler, the probe and the barriers in turn; the arrow keys move by 1 mm (Shift: 1 cm), and a turning handle turns by 1° (Shift: 5°).'),
      items: kbItems,
      onChange: function () { const id = kbSel(); if (id === 'ra' || id === 'rb') state.rulerEnd = id.slice(1); requestDraw(); }
    });
  }
  let geoPending = false;
  function geometryChanged() {
    if (geoPending) return;
    geoPending = true;
    requestAnimationFrame(function () { geoPending = false; syncSim(false); });
  }

  // ======================================================================
  // 控制項
  // ======================================================================
  function setStatus(s) { state.status = s; $('status').textContent = s; }
  function setSlider(el, v) { if (window.LabNum) window.LabNum.set(el, v); else el.value = v; showOuts(); }
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s.replace('-', '−');
  }
  const SL = {
    f: ['Hz'], amp: ['mm'], d: ['cm'], fs: ['Hz'], beta: ['°'], R: ['cm'], alpha: ['°'], h2: ['mm'], pw: ['cm'], slit: ['cm'], obsL: ['cm'], h: ['mm'], tx: ['°'], ty: ['°'], lamp: ['cm']
  };
  function showOuts() {
    Object.keys(SL).forEach(function (id) { const el = $(id); $(id + 'o').textContent = fmtSlider(val(el), el) + ' ' + SL[id][0]; });
  }
  function readSliders() {
    state.dial = val($('f')); state.amp = val($('amp')); state.d = val($('d')) / 100; state.fs = val($('fs'));
    state.beta = val($('beta')); state.R = val($('R')) / 100; state.alpha = val($('alpha')); state.h2 = val($('h2')) / 1000;
    state.pw = val($('pw')) / 100; state.slitA = val($('slit')) / 100; state.obsL = val($('obsL')) / 100;
    state.h = val($('h')) / 1000; state.screw = { x: val($('tx')) * DEG, y: val($('ty')) * DEG }; state.lampH = val($('lamp')) / 100;
    // 壓克力板要被水蓋住：板上方水深不超過水深 − 1 mm
    if (state.h2 > state.h - 0.001) state.h2 = state.h - 0.001;
  }
  function onSliderInput(id) {
    readSliders();
    showOuts();
    if (sim) sim.scene.amp = state.amp;
    if (id === 'amp') { imgDirty = true; requestDraw(); return; }
    if (id === 'fs') { strobeNext = 0; updateReadouts(); requestDraw(); return; }
    if (id === 'lamp') { bgKey = ''; updateReadouts(); requestDraw(); if (view3) view3.onGeometry(); return; }
    if (id === 'alpha') { if (state.alpha >= 15) state.flags.alpha15 = true; if (state.alpha === 0 && state.part === 3) state.flags.alpha0 = true; }
    if (id === 'obsL' && state.part === 4) state.flags.obsLen = true;
    if (id === 'f' && state.part === 5) state.flags.f5 = true;
    if (id === 'd' && state.part === 5) state.flags.d5 = true;
    if (id === 'tx' || id === 'ty') drawLevel();
    syncSim(false);
    updateReadouts();
    updateSteps();
    renderAnalysis();
  }
  Object.keys(SL).forEach(function (id) {
    const el = $(id);
    el.addEventListener('input', function () { onSliderInput(id); });
    el.addEventListener('change', function () {
      if (id === 'fs' || id === 'f') { emitStrobe(); frozenChime(); }
      if (id === 'tx' || id === 'ty') emit('level', common());
      emitConfig();
    });
  });

  function setPressed(ids, on) { ids.forEach(function (id) { $(id).setAttribute('aria-pressed', String(id === on)); }); }
  function setPart(p, user) {
    state.part = p;
    setPressed(['part1', 'part2', 'part3', 'part4', 'part5'], 'part' + p);
    // 每個項目預設的起波器
    const defSrc = p === 5 ? 'pair' : 'bar';
    if (user && state.src !== defSrc) setSource(defSrc, false);
    if (p === 4 && state.diff === 'obstacle') state.flags.obstacle = true;
    if (p === 3 && state.alpha === 0) state.flags.alpha0 = true;
    $('objCard').hidden = !(p === 2 || p === 3 || p === 4);
    $('objRefl').hidden = p !== 2; $('objRefr').hidden = p !== 3; $('objDiff').hidden = p !== 4;
    $('objH').textContent = p === 3 ? T('薄壓克力板（淺水區）', 'Thin acrylic plate (shallow water)') : T('障礙物', 'Barrier');
    $('objHint').textContent = p === 2 ? T('拖曳障礙物可以移動，拖曳圓形把手可以旋轉。', 'Drag a barrier to move it; drag the round handle to turn it.')
      : p === 3 ? T('拖曳板邊可以移動，拖曳圓形把手可以轉動板子。', 'Drag the plate edge to move it; drag the round handle to turn it.')
        : T('拖曳障礙物可以左右移動。', 'Drag the barrier to move it.');
    if (p === 5 && state.ruler) { /* 保留直尺 */ }
    buildRecButtons();
    syncSim(false);
    renderTable();
    renderAnalysis();
    updateReadouts();
    updateSteps();
    if (user) emitConfig();
  }
  [1, 2, 3, 4, 5].forEach(function (p) { $('part' + p).addEventListener('click', function () { setPart(p, true); }); });

  function setSource(s, user) {
    state.src = s;
    setPressed(['srcBar', 'srcPoint', 'srcPair'], { bar: 'srcBar', point: 'srcPoint', pair: 'srcPair' }[s]);
    $('boxD').hidden = s !== 'pair';
    syncSim(false);
    updateReadouts(); updateSteps(); renderAnalysis();
    if (user) emitConfig();
  }
  $('srcBar').addEventListener('click', function () { setSource('bar', true); });
  $('srcPoint').addEventListener('click', function () { setSource('point', true); });
  $('srcPair').addEventListener('click', function () { setSource('pair', true); });

  function setShape(s) {
    state.shape = s;
    setPressed(['shStraight', 'shConcave', 'shConvex'], { straight: 'shStraight', concave: 'shConcave', convex: 'shConvex' }[s]);
    $('boxBeta').hidden = s !== 'straight'; $('boxR').hidden = s === 'straight';
    if (s === 'concave') state.flags.concave = true;
    if (s === 'convex') state.flags.convex = true;
    syncSim(false);
    updateReadouts(); updateSteps();
    emitConfig();
  }
  $('shStraight').addEventListener('click', function () { setShape('straight'); });
  $('shConcave').addEventListener('click', function () { setShape('concave'); });
  $('shConvex').addEventListener('click', function () { setShape('convex'); });

  function setDiff(s) {
    state.diff = s;
    setPressed(['dfObs', 'dfSlit'], s === 'obstacle' ? 'dfObs' : 'dfSlit');
    $('boxSlit').hidden = s !== 'slit'; $('boxObs').hidden = s !== 'obstacle';
    if (s === 'obstacle') state.flags.obstacle = true;
    syncSim(false);
    updateSteps();
    emitConfig();
  }
  $('dfObs').addEventListener('click', function () { setDiff('obstacle'); });
  $('dfSlit').addEventListener('click', function () { setDiff('slit'); });

  function setMode(m, user) {
    state.mode = m;
    setPressed(['modeIdeal', 'modeReal'], m === 'ideal' ? 'modeIdeal' : 'modeReal');
    $('levelBox').hidden = m !== 'real';
    $('fLabel').textContent = m === 'real' ? T('起波器旋鈕刻度 f', 'Generator dial f') : T('頻率 f', 'Frequency f');
    $('modeHint').textContent = m === 'real'
      ? T('含誤差：槽底沒調水平、旋鈕刻度不準（要靠閃頻儀）、讀數只到 1 mm 與 1°。點光源時紙上影像會放大。', 'With errors: the tank is not level, the dial is not exact (trust the strobe), readings are to 1 mm and 1°. A point lamp enlarges the paper image.')
      : T('理想：槽底水平、頻率準確、讀數精細。', 'Ideal: level tank, exact frequency, fine readings.');
    if (m === 'real' && state.light === 'parallel' && !state.lightTouched) setLight('point', false);
    if (m === 'ideal' && state.light === 'point' && !state.lightTouched) setLight('parallel', false);
    drawLevel();
    syncSim(false);
    renderTable(); renderAnalysis(); updateReadouts(); updateSteps();
    if (user) emitConfig();
  }
  $('modeIdeal').addEventListener('click', function () { setMode('ideal', true); });
  $('modeReal').addEventListener('click', function () { setMode('real', true); });

  function setLight(l, user) {
    state.light = l;
    if (user) state.lightTouched = true;
    setPressed(['lightPar', 'lightPt'], l === 'parallel' ? 'lightPar' : 'lightPt');
    $('boxLamp').hidden = l !== 'point';
    bgKey = '';
    updateReadouts(); renderAnalysis(); requestDraw();
    if (view3) view3.onGeometry();
    if (user) emitConfig();
  }
  $('lightPar').addEventListener('click', function () { setLight('parallel', true); });
  $('lightPt').addEventListener('click', function () { setLight('point', true); });

  function setSpeed(s, user) {
    state.speedSel = s;
    setPressed(['spd1', 'spd4', 'spd10'], s >= 1 ? 'spd1' : s >= 0.2 ? 'spd4' : 'spd10');
    simDebt = 0;
    if (user && state.strobe) state.speedBeforeStrobe = s;
    requestDraw();
  }
  $('spd1').addEventListener('click', function () { setSpeed(1, true); });
  $('spd4').addEventListener('click', function () { setSpeed(0.25, true); });
  $('spd10').addEventListener('click', function () { setSpeed(0.1, true); });

  function updateButtons() {
    const g = $('gen');
    g.classList.toggle('on', state.gen); g.setAttribute('aria-pressed', String(state.gen));
    g.textContent = state.gen ? T('起波器：開', 'Wave generator: on') : T('起波器：關', 'Wave generator: off');
    const s = $('strobe');
    s.classList.toggle('on', state.strobe); s.setAttribute('aria-pressed', String(state.strobe));
    s.textContent = state.strobe ? T('閃頻儀：開', 'Stroboscope: on') : T('閃頻儀：關', 'Stroboscope: off');
    $('play').textContent = state.running ? T('暫停', 'Pause') : T('播放', 'Play');
    $('play').classList.toggle('primary', !state.running);
  }
  $('gen').addEventListener('click', function () {
    state.gen = !state.gen;
    if (sim) sim.setDriving(state.gen);
    if (state.gen) setStatus(T('起波器開了：水波大約 2 秒（模擬時間）後填滿水槽。', 'Generator on: the waves fill the tank in about 2 s (simulated time).'));
    else { setStatus(T('起波器關了：水面上的波會傳走、被海綿吸收。', 'Generator off: the waves travel away and are soaked up by the sponges.')); stopHum(); }
    updateButtons(); updateSteps(); updateReadouts();
    if (!state.running) { state.running = true; updateButtons(); }
    emitConfig();
    requestDraw();
  });
  $('strobe').addEventListener('click', function () {
    state.strobe = !state.strobe;
    strobeHas = false; strobeNext = 0;
    if (state.strobe) {
      state.speedBeforeStrobe = state.speedSel;
      if (state.speedSel < 1) { setSpeed(1, false); setStatus(T('閃頻儀開啟：改用真實速度播放；只在閃光的瞬間看得到水面。', 'Strobe on: playing in real time; you only see the surface at the flashes.')); }
    } else {
      if (state.speedBeforeStrobe !== state.speedSel) setSpeed(state.speedBeforeStrobe, false);
      setStatus('');
    }
    imgDirty = true;
    updateButtons(); updateReadouts(); updateSteps();
    emitStrobe(); frozenChime();
    requestDraw();
  });
  $('play').addEventListener('click', function () {
    state.running = !state.running;
    if (!state.running) stopHum();
    lastNow = 0;
    updateButtons(); updateSpeedInfo();
    requestDraw();
  });
  $('reset').addEventListener('click', function () {
    state.tables = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    state.ruler = null;
    if (sim) { sim.clear(); strobeHas = false; strobeNext = 0; simBorn = performance.now(); }
    renderTable(); renderAnalysis(); updateReadouts(); updateSteps();
    setStatus(T('已清除數據表、直尺與水面上的波（滑桿設定不變）。', 'Cleared the tables, the ruler and the waves (settings kept).'));
    imgDirty = true; requestDraw();
  });
  $('undo').addEventListener('click', function () {
    const t = state.tables[state.part];
    if (!t.length) return;
    const last = t[t.length - 1];
    const keys = Object.keys(last).filter(function (k) { return COLS[state.part].indexOf(k) >= 0 && last[k] != null; });
    if (state.part === 2 || state.part === 3 || state.part === 4) {
      // 只刪掉這一列最後填入的格子；整列空了就刪掉這一列
      t.pop();
    } else t.pop();
    void keys;
    renderTable(); renderAnalysis(); updateSteps();
  });
  $('sponge').addEventListener('change', function (ev) { state.sponge = ev.target.checked; syncSim(false); bgKey = ''; updateSteps(); emitConfig(); });
  $('nMinus').addEventListener('click', function () { state.N = Math.max(1, state.N - 1); $('nOut').textContent = state.N; updateReadouts(); });
  $('nPlus').addEventListener('click', function () { state.N = Math.min(20, state.N + 1); $('nOut').textContent = state.N; updateReadouts(); });
  $('mInput').addEventListener('input', function () {
    const v = parseFloat(String($('mInput').value).replace(',', '.'));
    state.Muser = v >= 1 && v <= 5 ? v : 1;
    renderTable(); renderAnalysis();
  });

  // ---------- 喇叭按鈕 ----------
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
    if (!on) stopHum();
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 水平儀（圓形氣泡） ----------
  const lcv = $('levelCv'), lctx = lcv.getContext('2d');
  function drawLevel() {
    if (state.mode !== 'real') return;
    const r = Math.min(window.devicePixelRatio || 1, 2), S = 84;
    if (lcv.width !== S * r) { lcv.width = S * r; lcv.height = S * r; }
    const c = lctx;
    c.setTransform(r, 0, 0, r, 0, 0);
    c.clearRect(0, 0, S, S);
    const cx = S / 2, cy = S / 2, R = 36;
    const g = c.createRadialGradient(cx - 8, cy - 10, 4, cx, cy, R);
    g.addColorStop(0, shade('#b8e07a', colors.dark ? -0.2 : 0.3)); g.addColorStop(1, shade('#7fae3c', colors.dark ? -0.35 : 0));
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = colors.dark ? '#3a4448' : '#6b7478'; c.stroke();
    c.lineWidth = 1.2; c.strokeStyle = alpha('#1d2a10', 0.7);
    c.beginPath(); c.arc(cx, cy, 9, 0, Math.PI * 2); c.stroke();
    // 氣泡往高的一邊跑：槽底向 +x 變深（tiltX > 0）表示右邊低 → 氣泡往左
    const t = tiltRad(), k = 22 / (0.3 * DEG);
    let bx = -t.x * k, by = t.y * k;
    const m = Math.hypot(bx, by), lim = R - 10;
    if (m > lim) { bx *= lim / m; by *= lim / m; }
    const bgr = c.createRadialGradient(cx + bx - 2, cy + by - 3, 1, cx + bx, cy + by, 8);
    bgr.addColorStop(0, '#ffffff'); bgr.addColorStop(1, alpha('#f4ffe6', 0.75));
    c.beginPath(); c.arc(cx + bx, cy + by, 7.5, 0, Math.PI * 2); c.fillStyle = bgr; c.fill();
    c.lineWidth = 1; c.strokeStyle = alpha('#2b3a14', 0.6); c.stroke();
    const tdeg = tiltDeg();
    $('levelText').innerHTML = T('槽底傾斜 ', 'Bottom tilt ') + '<b>' + nf(tdeg, 2) + '°</b><br>' + (tdeg < LEVEL_OK ? T('氣泡在中央：已調水平。', 'Bubble centred: level.') : T('氣泡偏向較高的一邊；調螺絲把它移到圓圈中央。', 'The bubble drifts to the high side; turn the screws to bring it into the ring.'));
  }

  // ======================================================================
  // 3D 檢視（three.js，切換到 3D 時才以 import() 動態載入 vendor/three/）
  // ======================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  /** 給 3D 檢視讀取的介面（同一個模擬、同一張投影影像） */
  const bridge = {
    sim: function () { return sim; },
    state: state, T: T, colors: function () { return colors; },
    image: function () { if (imgDirty) renderImage(); return img; },
    /** 目前要顯示的水面位移：閃頻儀開著時是最近一次閃光的瞬間 */
    field: function () { return !sim ? null : state.strobe ? (strobeHas ? strobeBuf : null) : sim.u; },
    magnif: magnif, arcObj: arcObj, barObj: barObj, plateObj: plateObj, diffSolids: diffSolids, sourcePoints: sourcePoints, tiltRad: tiltRad,
    drive: function () { return sim ? sim.drive(sim.t) || 0 : 0; },
    lost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    }
  };
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed(['view2d', 'view3d'], 'view3d');
      if (!webglAvailable() || !window.RippleTank3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        view3 = window.RippleTank3D.create(lib, host3, bridge);
        stage.classList.add('is3d');
        $('resetCam').hidden = false;
        viewMsg.textContent = '';
        requestDraw();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed(['view2d', 'view3d'], 'view2d');
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
    setPressed(['view2d', 'view3d'], 'view2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D。', 'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ======================================================================
  // 啟動
  // ======================================================================
  function themeChanged() {
    readColors();
    bgKey = ''; spongeKey = '';
    drawLevel();
    renderAnalysis();
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  // 分享連結：畫布上拖曳出來的狀態（直尺、探針、波源與障礙物的位置）
  function shareGet() {
    const r3 = function (q) { return [Math.round(q.x * 1e4) / 1e4, Math.round(q.y * 1e4) / 1e4]; };
    return {
      r: state.ruler ? [r3(state.ruler.a), r3(state.ruler.b)] : null, p: r3(state.probe), pt: r3(state.pt), pair: r3(state.pair),
      bar: r3(state.barC), cav: r3(state.cavV), vex: r3(state.vexV), plate: r3(state.plateC), diff: r3({ x: state.diffX, y: state.obsY })
    };
  }
  function shareSet(o) {
    if (!o || typeof o !== 'object') return;
    const pt = function (a, x0, x1, y0, y1) {
      if (!Array.isArray(a) || a.length !== 2 || typeof a[0] !== 'number' || typeof a[1] !== 'number' || !isFinite(a[0]) || !isFinite(a[1])) return null;
      return { x: Math.max(x0, Math.min(x1, a[0])), y: Math.max(y0, Math.min(y1, a[1])) };
    };
    if (o.r === null) state.ruler = null;
    else if (Array.isArray(o.r)) { const a = pt(o.r[0], 0, W, 0, H), b = pt(o.r[1], 0, W, 0, H); if (a && b) state.ruler = { a: a, b: b }; }
    let q;
    if ((q = pt(o.p, 0, W, 0, H))) state.probe = q;
    if ((q = pt(o.pt, 0.035, W - 0.035, 0.035, H - 0.035))) state.pt = q;
    if ((q = pt(o.pair, 0.035, W - 0.035, 0.035, H - 0.035))) state.pair = q;
    if ((q = pt(o.bar, 0.1, W - 0.05, 0.05, H - 0.05))) state.barC = q;
    if ((q = pt(o.cav, 0.12, W - 0.04, 0.06, H - 0.06))) state.cavV = q;
    if ((q = pt(o.vex, 0.12, W - 0.04, 0.06, H - 0.06))) state.vexV = q;
    if ((q = pt(o.plate, 0.1, W - 0.06, 0.04, H - 0.04))) state.plateC = q;
    if ((q = pt(o.diff, 0.09, W - 0.08, 0.05, H - 0.05))) { state.diffX = q.x; state.obsY = q.y; }
    syncSim(false);
    updateReadouts();
    requestDraw();
  }
  function regShare() {
    if (!window.LabShare) return false;
    window.LabShare.register({ get: shareGet, set: shareSet });
    return true;
  }
  if (!regShare()) window.addEventListener('load', regShare);

  readColors();
  readSliders();
  showOuts();
  syncSim(true);
  setPart(1, false);
  setSource('bar', false);
  updateButtons();
  updateSoundButton();
  setMode('ideal');
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopHum(); else { lastNow = 0; requestDraw(); } });
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } renderAnalysis(); }).observe(cv);
  } else window.addEventListener('resize', resize);
  resize();
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：按「播放」開始。', 'Reduced motion is on: press “Play” to start.'));
  updateSpeedInfo();
  requestDraw();
})();
