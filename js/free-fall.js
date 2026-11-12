/* free-fall.js — 「自由落體與斜面上的運動」課本實驗的畫面與互動（物理計算在 free-fall-core.js） */
(function () {
  'use strict';
  const FF = window.FreeFallCore;
  const $ = function (id) { return document.getElementById(id); };
  // 介面文字：英文模式用第二個字串（settings.js）
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  // 滑桿讀值：打字輸入的精確值（numinput.js）優先
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const G = FF.G, L = FF.L_TRACK;

  // ---------- 實驗常數 ----------
  const SIGMA = 3e-4;      // 尺的讀數誤差（標準差 0.3 mm）
  const RES = 1e-4;        // 讀數取到 0.1 mm
  const T_POST = 0.3;      // 撞到擋板（落地）後計時器再打的時間（s）
  const T_STILL = 0.8;     // 不會動時計時器空打的時間（s）
  const CAL_MAX = 30;      // ① 最長拉 30 s
  const MAX_ROWS = 30;     // 表格最多 30 個計數點
  const CLEAR_GAP = 0.0012; // 點痕分得開的最小距離

  // ---------- 裝置尺寸（m，依比例繪製） ----------
  const TH = 0.03;                       // 軌道高度
  const TRACK_Z0 = 0.02, TRACK_Z1 = 0.10; // 軌道前後
  const HF = 0.018;                      // 軌道右端的橡皮腳
  const S_FOOT = L - 0.05, X_FOOT = 1.30; // 橡皮腳的位置（軌道座標、世界座標）
  const S_BAR = 0.05;                    // 左端支撐橫桿的位置
  const S_TICK = 0.075;                  // 計時器（打點針）在軌道上的位置
  const VT = 0.024;                      // 紙帶離計時器底面（軌道面）的高度
  const TZ = 0.06, TW = 0.016;           // 紙帶中心的深度、紙帶寬度
  const CART_L = 0.17, S_TAIL0 = 0.17, WR = 0.011;
  const S_STOP = S_TAIL0 + CART_L + FF.D_INCLINE; // 擋板（滑車前端停在這裡）
  // 自由落體
  const XT = 0.16, Y_TICK = 1.30, YB0 = 1.10; // 紙帶的 x、打點針高度、重物底面的起點
  const ROD_X = -0.11, ROD_Z = 0.24;
  const Y_ROLL = Y_TICK + 0.16, ROLL_FR = 0.03; // 自由落體：紙帶捲的軸心高度、半徑（滿捲）
  const Y_SAND = YB0 - FF.D_FALL;              // 沙箱表面（重物底面落到這裡）
  // ① 計時器校正
  const XC = 0.52, ROLL_X = 0.88, ROLL_R = 0.048, ROLL_Y = 0.062;

  const DX = 0.5, DY = 0.3; // 斜投影：深度 z 往右上方畫

  const state = {
    mode: 'incline',
    freq: 60, fHidden: 30, timerId: 1,
    ideal: true, errRead: true, errReact: true,
    f: 0.05, mu: 0.01, kG: 0.4,
    h: 0.20, M: 0.5, m: 0.2,
    n: 4, j0: 3, dtSrc: 'nom', showTheory: true,
    speed: 0.25,
    exp: { incline: newExp(), fall: newExp() },
    cal: { phase: 'ready', t: 0, T: 0, r1: 0, r2: 0, phase0: 0, dt: 1 / 60, pull: null, last: null, trials: [], beeped: 0 },
    summary: [],
    runCount: 0,
    fx: []
  };
  function newExp() { return { phase: 'ready', clock: 0, t: 0, live: null, run: null }; }
  function cur() { return state.exp[state.mode]; }
  function dtTrueNow() { return state.freq ? 1 / state.freq : 1 / state.fHidden; }

  /** 目前設定的物理參數（理想時沒有摩擦與空氣阻力） */
  function physParams(mode) {
    const real = !state.ideal;
    return {
      mode: mode, h: state.h, L: L, m: mode === 'incline' ? state.M : state.m,
      mu: real && mode === 'incline' ? state.mu : 0, f: real ? state.f : 0, k: real ? state.kG / 1000 : 0
    };
  }

  // ---------- 色彩（lab.css 代號）與共用繪圖工具（js/drawkit.js 的 LabDraw） ----------
  const LD = window.LabDraw;
  const FONT = LD.FONT;
  const alpha = LD.alpha, shade = LD.shade, mix = LD.mix, roundRect = LD.roundRect;
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface',
      '--pos', '--neg', '--equi', '--field', '--probe', '--b-mech', '--b-em']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    const r = LD.rgb(colors['canvas-bg']);
    const d = colors.dark = (r[0] + r[1] + r[2]) / 3 < 100;
    const bg = colors['canvas-bg'], eq = colors.equi, mu = colors.muted, fi = colors.field;
    colors.paper = d ? mix(shade(eq, 0.55), bg, 0.22) : shade(eq, 0.9);
    colors.paperEdge = d ? shade(eq, -0.2) : shade(eq, 0.55);
    colors.ink = d ? shade(bg, -0.2) : shade(fi, -0.25);
    colors.metalHi = d ? shade(mu, 0.15) : shade(mu, 0.72);
    colors.metal = d ? shade(mu, -0.25) : shade(mu, 0.42);
    colors.metalLo = d ? shade(mu, -0.55) : shade(mu, 0.05);
    colors.alu = d ? shade(mu, -0.12) : shade(mu, 0.6);
    colors.rubber = d ? shade(mu, -0.62) : shade(fi, -0.15);
    colors.wood = d ? shade(eq, -0.5) : shade(eq, 0.42);
    colors.woodLo = d ? shade(eq, -0.66) : shade(eq, 0.12);
    colors.brass = d ? shade(eq, -0.05) : shade(eq, 0.35);
    colors.dev = d ? shade(mu, -0.5) : shade(fi, 0.12);
    colors.devHi = d ? shade(mu, -0.3) : shade(fi, 0.35);
    colors.steel = d ? shade(mu, -0.12) : shade(mu, 0.3);
    colors.cart = colors['b-mech'];
    colors.skin = d ? mix(shade(eq, 0.2), bg, 0.3) : mix(eq, '#ffffff', 0.7);
    colors.sand = d ? mix(eq, bg, 0.5) : mix(eq, '#ffffff', 0.6);
    colors.lcd = d ? mix(colors.probe, bg, 0.82) : mix(colors.probe, '#ffffff', 0.86);
    colors.lcdInk = d ? shade(colors.probe, 0.2) : shade(fi, -0.2);
    colors.panel = d ? shade(colors.surface, 0.02) : colors.surface;
  }

  // ---------- 數字格式 ----------
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function sig(v, n) {
    if (!isFinite(v)) return '—';
    if (v === 0) return '0';
    const d = Math.max(0, Math.min(6, n - 1 - Math.floor(Math.log10(Math.abs(v)))));
    return num(v, d);
  }
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s;
  }
  function pct(v) { return isFinite(v) ? (v > 0 ? '+' : '') + num(v, 2) + ' %' : '—'; }
  const MS2 = ' m/s<sup>2</sup>', CMS2 = ' cm/s<sup>2</sup>';

  function niceStep(raw) {
    if (!(raw > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  }
  function decOf(step) { return step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step) - 1e-9)); }

  function setupCanvas(cv, h) {
    const w = cv.clientWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (cv.style.height !== h + 'px') cv.style.height = h + 'px';
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W) cv.width = W;
    if (cv.height !== H) cv.height = H;
    return { w: w, h: h, dpr: dpr };
  }

  // ======================= 立體繪圖（斜投影） =======================
  let A = null; // 裝置畫布版面 { w, h, dpr, k, ox, oy, narrow, inset }
  /** 世界座標（X 右、Y 上、Z 往畫面裡）→ 畫布座標 */
  function P(X, Y, Z) { Z = Z || 0; return [A.ox + (X + Z * DX) * A.k, A.oy - (Y + Z * DY) * A.k]; }
  function path(c, pts) {
    c.beginPath();
    for (let i = 0; i < pts.length; i++) { if (i) c.lineTo(pts[i][0], pts[i][1]); else c.moveTo(pts[i][0], pts[i][1]); }
    c.closePath();
  }
  /**
   * 立體稜柱：XY 平面上的多邊形（世界座標）沿 Z 由 z0（前）擠出到 z1（後）。
   * 先畫看得見的側面（朝上的較亮、朝右的較暗），再畫正面（上亮下暗的漸層）。
   * opts：{ front（正面顏色）, top（朝上面的顏色）, edge（外框透明度）}
   */
  function prism(c, xy, z0, z1, color, opts) {
    opts = opts || {};
    let area = 0;
    for (let i = 0; i < xy.length; i++) { const a = xy[i], b = xy[(i + 1) % xy.length]; area += a[0] * b[1] - b[0] * a[1]; }
    if (area < 0) xy = xy.slice().reverse();
    const n = xy.length;
    const F = xy.map(function (p) { return P(p[0], p[1], z0); });
    const B = xy.map(function (p) { return P(p[0], p[1], z1); });
    const dk = colors.dark;
    for (let i = 0; i < n; i++) {
      const a = xy[i], b = xy[(i + 1) % n];
      const ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey);
      if (len < 1e-9) continue;
      const nx = ey / len, ny = -ex / len; // 逆時針多邊形的外法向量
      if (nx * DX + ny * DY <= 1e-6) continue;
      const lit = 0.3 * Math.max(0, ny) - 0.24 * Math.max(0, nx) - 0.12 * Math.max(0, -ny);
      const base = ny > 0.5 && opts.top ? opts.top : color;
      path(c, [F[i], F[(i + 1) % n], B[(i + 1) % n], B[i]]);
      c.fillStyle = shade(base, dk ? lit * 0.8 : lit);
      c.fill();
      c.strokeStyle = alpha(shade(base, -0.45), dk ? 0.5 : 0.3);
      c.lineWidth = 0.8;
      c.stroke();
    }
    // 正面
    let y0 = Infinity, y1 = -Infinity;
    F.forEach(function (p) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    const fc = opts.front || color;
    const g = c.createLinearGradient(0, y0, 0, Math.max(y0 + 1, y1));
    g.addColorStop(0, shade(fc, 0.1));
    g.addColorStop(1, shade(fc, -0.12));
    path(c, F);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = alpha(shade(fc, -0.5), opts.edge == null ? (dk ? 0.55 : 0.4) : opts.edge);
    c.lineWidth = 0.9;
    c.stroke();
    // 正面與上側面交界的高光
    c.strokeStyle = alpha(shade(fc, 0.75), dk ? 0.3 : 0.6);
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const a = xy[i], b = xy[(i + 1) % n];
      const ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey);
      if (len < 1e-9 || -ex / len < 0.5) continue;
      c.moveTo(F[i][0], F[i][1] + 0.6); c.lineTo(F[(i + 1) % n][0], F[(i + 1) % n][1] + 0.6);
    }
    c.stroke();
  }
  function box(c, x0, x1, y0, y1, z0, z1, color, opts) { prism(c, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z1, color, opts); }

  /** 沿 Z 的圓柱（輪子、紙帶捲、橫桿）：圓心 (X, Y)、半徑 r、由 z0 到 z1 */
  function cylZ(c, X, Y, r, z0, z1, color, opts) {
    opts = opts || {};
    const f = P(X, Y, z0), b = P(X, Y, z1), R = r * A.k;
    const dx = b[0] - f[0], dy = b[1] - f[1], dl = Math.hypot(dx, dy) || 1;
    const nx = -dy / dl, ny = dx / dl;
    c.fillStyle = shade(color, -0.3);
    c.beginPath(); c.arc(b[0], b[1], R, 0, Math.PI * 2); c.fill();
    c.beginPath();
    c.moveTo(f[0] + nx * R, f[1] + ny * R); c.lineTo(b[0] + nx * R, b[1] + ny * R);
    c.lineTo(b[0] - nx * R, b[1] - ny * R); c.lineTo(f[0] - nx * R, f[1] - ny * R); c.closePath();
    c.fill();
    const g = c.createRadialGradient(f[0] - R * 0.35, f[1] - R * 0.35, R * 0.1, f[0], f[1], R);
    g.addColorStop(0, shade(color, 0.35));
    g.addColorStop(0.7, color);
    g.addColorStop(1, shade(color, -0.25));
    c.fillStyle = g;
    c.beginPath(); c.arc(f[0], f[1], R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = alpha(shade(color, -0.5), 0.5);
    c.lineWidth = 0.8;
    c.stroke();
    if (opts.hub) {
      c.fillStyle = opts.hub;
      c.beginPath(); c.arc(f[0], f[1], Math.max(1, R * 0.35), 0, Math.PI * 2); c.fill();
    }
  }
  /** 鉛直圓柱（鐵架的桿子、重物）：中心 (X, Z)、半徑 r、由 y0 到 y1；上面的圓蓋看起來是斜的橢圓 */
  function cylY(c, X, Z, r, y0, y1, color, opts) {
    opts = opts || {};
    const N = 28, th1 = Math.atan(DX);
    const ring = function (y, from, to) {
      const out = [];
      for (let i = 0; i <= N; i++) {
        const ph = from + (to - from) * i / N;
        out.push(P(X + r * Math.cos(ph), y, Z + r * Math.sin(ph)));
      }
      return out;
    };
    // 輪廓：底圈前半（靠近觀看者 sin < 0）＋頂圈前半反向
    const bot = ring(y0, th1 + Math.PI, th1 + 2 * Math.PI);
    const top = ring(y1, th1 + 2 * Math.PI, th1 + Math.PI);
    const xs = bot.concat(top).map(function (p) { return p[0]; });
    const xa = Math.min.apply(null, xs), xb = Math.max.apply(null, xs);
    const g = c.createLinearGradient(xa, 0, xb, 0);
    g.addColorStop(0, shade(color, -0.25));
    g.addColorStop(0.32, shade(color, 0.38));
    g.addColorStop(0.55, color);
    g.addColorStop(1, shade(color, -0.4));
    path(c, bot.concat(top));
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = alpha(shade(color, -0.5), 0.45);
    c.lineWidth = 0.8;
    c.stroke();
    if (opts.cap !== false) {
      path(c, ring(y1, 0, Math.PI * 2));
      c.fillStyle = shade(color, colors.dark ? 0.12 : 0.28);
      c.fill();
      c.stroke();
    }
  }
  /** 細桿（不需要圓蓋的細圓柱，用管狀線條畫） */
  function rod(c, a, b, color, width) {
    LD.tube(c, function (g) { g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }, color, width);
  }
  /** 平放在某個平面上的紙帶：四個角（世界座標＋深度） */
  function band(c, pts, color, edge) {
    path(c, pts);
    c.fillStyle = color;
    c.fill();
    c.strokeStyle = edge;
    c.lineWidth = 0.7;
    c.stroke();
  }

  // ---------- 斜面：軌道座標 ----------
  function trig() { const s = state.h / L; return { s: s, c: Math.sqrt(1 - s * s) }; }
  /** 軌道座標 (s 沿軌道向下、n 垂直軌道向上) → 世界座標 [X, Y] */
  function Wt(s, n) {
    const t = trig();
    return [X_FOOT + (s - S_FOOT) * t.c + n * t.s, HF - (s - S_FOOT) * t.s + n * t.c];
  }
  function Pt(s, n, z) { const w = Wt(s, n); return P(w[0], w[1], z); }

  // ======================= 裝置畫布 =======================
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  const stat = document.createElement('canvas');
  const statc = stat.getContext('2d');
  let statKey = '';

  const SCENES = {
    incline: { x0: -0.2, x1: 1.6, y0: -0.07, y1: 0.86, hWide: 350, hNarrow: 204 },
    fall: { x0: -0.36, x1: 0.62, y0: -0.07, y1: 1.56, hWide: 480, hNarrow: 470 },
    calib: { x0: -0.06, x1: 1.12, y0: -0.07, y1: 0.24, hWide: 330, hNarrow: 250 }
  };
  function layoutA() {
    const w = cv.clientWidth, narrow = w < 560;
    const S = SCENES[state.mode];
    const h = narrow ? S.hNarrow : S.hWide;
    let rx = 0, rw = w, top = 56, inset = null;
    if (state.mode === 'fall') {
      top = 8;
      if (!narrow) { rw = Math.round(w * 0.5); inset = { x: rw + 4, y: 14, w: w - rw - 18, h: h - 28 }; }
    }
    if (state.mode === 'calib') top = narrow ? 110 : 30;
    if (state.mode === 'incline') top = narrow ? 46 : 40;
    // 斜面：高度差小時把鏡頭拉近（上方不留大片空白），墊高時再拉遠
    const y1 = state.mode === 'incline' ? Math.max(0.4, state.h + 0.22) : S.y1;
    const k = Math.min((rw - 16) / (S.x1 - S.x0), (h - top - 6) / (y1 - S.y0));
    const ox = rx + (rw - k * (S.x1 - S.x0)) / 2 - S.x0 * k;
    const oy = h - 6 + S.y0 * k; // 場景貼齊下緣，上方留給讀數
    return { w: w, h: h, k: k, ox: ox, oy: oy, narrow: narrow, inset: inset };
  }
  function resizeA() {
    if (!cv.clientWidth) return;
    A = layoutA();
    const s = setupCanvas(cv, A.h);
    A.dpr = s.dpr;
    statKey = '';
    drawA();
  }

  // ---------- 靜態圖層 ----------
  function staticKey() {
    return [state.mode, A.w, A.h, A.dpr, LD.ver, colors.dark, state.mode === 'incline' ? state.h : 0, state.mode === 'fall' ? state.m : 0].join('|');
  }
  function buildStatic() {
    stat.width = cv.width; stat.height = cv.height;
    const c = statc;
    c.setTransform(A.dpr, 0, 0, A.dpr, 0, 0);
    c.clearRect(0, 0, A.w, A.h);
    LD.backdrop(c, A.w, A.h);
    if (state.mode === 'incline') staticIncline(c);
    else if (state.mode === 'fall') staticFall(c);
    else staticCalib(c);
    statKey = staticKey();
  }

  /** 實驗桌（木頭桌面＋前緣） */
  function table(c, x0, x1, z0, z1) {
    box(c, x0, x1, -0.035, 0, z0, z1, colors.wood, { top: shade(colors.wood, colors.dark ? 0.08 : 0.12), edge: 0.35 });
    // 桌面木紋（極淡）
    c.save();
    path(c, [P(x0, 0, z0), P(x1, 0, z0), P(x1, 0, z1), P(x0, 0, z1)]);
    c.clip();
    c.strokeStyle = alpha(shade(colors.wood, -0.4), colors.dark ? 0.18 : 0.12);
    c.lineWidth = 1;
    c.beginPath();
    for (let z = z0 + 0.03; z < z1; z += 0.045) {
      const a = P(x0, 0, z), b = P(x1, 0, z + 0.008);
      c.moveTo(a[0], a[1]); c.bezierCurveTo(a[0] + (b[0] - a[0]) * 0.3, a[1] - 1.5, a[0] + (b[0] - a[0]) * 0.7, b[1] + 1.5, b[0], b[1]);
    }
    c.stroke();
    c.restore();
  }

  /** 水平型打點計時器的機身（u 沿紙帶出口方向、v 往上；F(u, v) → 世界座標） */
  function timerBody(c, F) {
    const q = function (u0, u1, v0, v1) { return [F(u0, v0), F(u1, v0), F(u1, v1), F(u0, v1)]; };
    // 底座
    prism(c, q(-0.06, 0.06, 0, VT - 0.002), 0.012, 0.108, colors.dev, { top: colors.devHi });
    // 電源接頭（紅、黑兩個接線柱，在底座正面）
    [[-0.045, colors.pos], [-0.03, colors.field]].forEach(function (t) {
      const p = F(t[0], VT * 0.45);
      const s = P(p[0], p[1], 0.012), R = Math.max(1.6, 0.0045 * A.k);
      const g = c.createRadialGradient(s[0] - R * 0.3, s[1] - R * 0.3, R * 0.1, s[0], s[1], R);
      g.addColorStop(0, shade(t[1], 0.5)); g.addColorStop(1, shade(t[1], -0.2));
      c.fillStyle = g; c.beginPath(); c.arc(s[0], s[1], R, 0, Math.PI * 2); c.fill();
    });
    // 線圈外殼（紙帶後方）
    prism(c, q(-0.05, 0.045, VT - 0.002, VT + 0.042), 0.078, 0.106, colors.dev, { top: colors.devHi });
    // 線圈窗（銅線圈）
    const w = q(-0.038, 0.0, VT + 0.008, VT + 0.032).map(function (p) { return P(p[0], p[1], 0.078); });
    path(c, w);
    const ys = w.map(function (p) { return p[1]; });
    const cg = c.createLinearGradient(0, Math.min.apply(null, ys), 0, Math.max.apply(null, ys));
    cg.addColorStop(0, shade(colors.brass, 0.35)); cg.addColorStop(0.5, colors.brass); cg.addColorStop(1, shade(colors.brass, -0.3));
    c.fillStyle = cg; c.fill();
    c.save(); c.clip();
    c.strokeStyle = alpha(shade(colors.brass, -0.45), 0.55);
    c.lineWidth = 0.8;
    c.beginPath();
    for (let i = 1; i < 9; i++) {
      const a = F(-0.038 + i * 0.0042, VT + 0.008), b = F(-0.038 + i * 0.0042, VT + 0.032);
      const pa = P(a[0], a[1], 0.078), pb = P(b[0], b[1], 0.078);
      c.moveTo(pa[0], pa[1]); c.lineTo(pb[0], pb[1]);
    }
    c.stroke();
    c.restore();
  }
  /** 振片與複寫紙圓盤（每一幀畫；dip：打點時往下壓的程度 0–1） */
  function timerHead(c, F, dip) {
    // 複寫紙圓盤：平放在紙帶上方
    const N = 24, r = 0.012, v = VT + 0.004;
    const pts = [];
    for (let i = 0; i < N; i++) { const ph = i / N * Math.PI * 2; const p = F(r * Math.cos(ph), v); pts.push(P(p[0], p[1], TZ + r * Math.sin(ph))); }
    path(c, pts);
    c.fillStyle = shade(colors.rubber, colors.dark ? 0.1 : 0.15);
    c.fill();
    c.strokeStyle = alpha(shade(colors.rubber, -0.4), 0.6);
    c.lineWidth = 0.8;
    c.stroke();
    // 振片（鋼片）：由線圈外殼伸到圓盤正上方，末端有打點針
    const a = F(0.03, VT + 0.04), b = F(0.0, VT + 0.022 - 0.006 * (dip || 0));
    const pa = P(a[0], a[1], 0.085), pb = P(b[0], b[1], TZ);
    const tip = F(0.0, v + 0.002);
    const pt = P(tip[0], tip[1], TZ);
    c.lineCap = 'round';
    c.strokeStyle = shade(colors.metalLo, -0.2);
    c.lineWidth = Math.max(2.2, 0.0045 * A.k) + 1;
    c.beginPath(); c.moveTo(pa[0], pa[1]); c.lineTo(pb[0], pb[1]); c.lineTo(pt[0], pt[1] - (dip || 0) * 1.5); c.stroke();
    c.strokeStyle = colors.metalHi;
    c.lineWidth = Math.max(2.2, 0.0045 * A.k) - 0.8;
    c.stroke();
    c.fillStyle = colors.metalLo;
    c.beginPath(); c.arc(pa[0], pa[1], Math.max(1.6, 0.003 * A.k), 0, Math.PI * 2); c.fill();
  }

  // ---------- ② 斜面：靜態 ----------
  function staticIncline(c) {
    const k = A.k;
    table(c, -0.2, 1.48, -0.03, 0.3);
    // 左端的鐵架：底座、立桿、雙口夾與橫桿（橫桿頂住軌道底面）
    const bar = Wt(S_BAR, 0);
    const rx = bar[0] - 0.035;
    box(c, rx - 0.07, rx + 0.07, 0, 0.014, 0.16, 0.3, colors.metal, { top: colors.metalHi });
    const rodTop = Math.max(0.3, bar[1] + 0.12);
    cylY(c, rx, ROD_Z, 0.0065, 0.014, rodTop, colors.steel);
    // 夾頭
    box(c, rx - 0.016, rx + 0.016, bar[1] - 0.03, bar[1] + 0.006, ROD_Z - 0.02, ROD_Z + 0.02, colors.metalLo, { top: colors.metal });
    // 橫桿（沿 z，從夾頭伸到軌道前方）：先畫後半段（在軌道後面）
    const yb = bar[1] - 0.006;
    cylZ(c, bar[0], yb, 0.006, 0.0, ROD_Z, colors.steel);
    // 軌道右端的橡皮腳
    box(c, X_FOOT - 0.025, X_FOOT + 0.025, 0, HF, 0.03, 0.09, colors.rubber);
    LD.contactShadow(c, P(X_FOOT, 0, 0.06)[0], P(X_FOOT, 0, 0.06)[1], 0.03 * k, 0);
    // 軌道（鋁軌，頂面有兩條溝槽）
    prism(c, [Wt(0, 0), Wt(L, 0), Wt(L, TH), Wt(0, TH)], TRACK_Z0, TRACK_Z1, colors.alu, { top: shade(colors.alu, 0.08) });
    c.strokeStyle = alpha(shade(colors.alu, -0.45), colors.dark ? 0.6 : 0.45);
    c.lineWidth = 1;
    c.beginPath();
    [0.036, 0.084].forEach(function (z) { const a = Pt(0.005, TH, z), b = Pt(L - 0.005, TH, z); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); });
    c.stroke();
    // 軌道側面的刻度（每 10 cm）
    c.strokeStyle = alpha(colors.text, colors.dark ? 0.35 : 0.3);
    c.beginPath();
    for (let s = 0.2; s < L - 0.01; s += 0.1) { const a = Pt(s, TH * 0.35, TRACK_Z0), b = Pt(s, TH * 0.75, TRACK_Z0); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
    c.stroke();
    // 擋板（下端，前面有橡皮墊）
    prism(c, [Wt(S_STOP + 0.006, TH), Wt(S_STOP + 0.03, TH), Wt(S_STOP + 0.03, TH + 0.06), Wt(S_STOP + 0.006, TH + 0.06)], 0.016, 0.104, colors.dev, { top: colors.devHi });
    prism(c, [Wt(S_STOP, TH + 0.012), Wt(S_STOP + 0.006, TH + 0.012), Wt(S_STOP + 0.006, TH + 0.05), Wt(S_STOP, TH + 0.05)], 0.03, 0.09, colors.rubber);
    // 計時器機身
    timerBody(c, function (u, v) { return Wt(S_TICK + u, TH + v); });
    // 橫桿前半段（在軌道前面）
    const f0 = P(bar[0], yb, 0.0);
    c.fillStyle = shade(colors.steel, 0.1);
    c.beginPath(); c.arc(f0[0], f0[1], Math.max(2, 0.006 * k), 0, Math.PI * 2); c.fill();
    // 高度差 h 與傾角 θ（尺寸標示）
    const L0 = Wt(0, 0), R0 = Wt(L, 0);
    const pL = P(L0[0], L0[1], TRACK_Z0), pR = P(R0[0], R0[1], TRACK_Z0), pB = P(L0[0], R0[1], TRACK_Z0);
    c.save();
    c.setLineDash([4, 4]);
    c.strokeStyle = alpha(colors.muted, 0.8);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(pR[0], pR[1]); c.lineTo(pB[0] - 14, pB[1]); c.stroke();
    c.setLineDash([]);
    c.restore();
    // 尺寸線放在軌道左端的左側（避開垂下的紙帶）
    const dxh = pB[0] - 0.13 * k;
    c.save();
    c.setLineDash([3, 3]);
    c.strokeStyle = alpha(colors.accent, 0.6);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(pL[0] - 4, pL[1]); c.lineTo(dxh - 6, pL[1]); c.moveTo(pB[0] - 14, pB[1]); c.lineTo(dxh - 6, pB[1]); c.stroke();
    c.restore();
    if (pB[1] - pL[1] > 14) {
      LD.arrow(c, dxh, (pL[1] + pB[1]) / 2, dxh, pL[1] + 1, colors.accent, 1.6);
      LD.arrow(c, dxh, (pL[1] + pB[1]) / 2, dxh, pB[1] - 1, colors.accent, 1.6);
    }
    const hTxt = 'h = ' + num(state.h * 100, 1) + ' cm';
    c.font = '700 12px ' + FONT;
    const hW = c.measureText(hTxt).width + 12;
    if (dxh - 8 - hW >= 4) LD.pill(c, hTxt, dxh - 8, (pL[1] + pB[1]) / 2 + 5, colors.accent, 'right', '700 12px ' + FONT);
    else LD.pill(c, hTxt, 4, pB[1] + 24, colors.accent, 'left', '700 12px ' + FONT);
    // 角度弧
    const th = Math.asin(state.h / L), rA = Math.min(46, 0.25 * k);
    c.strokeStyle = colors.accent;
    c.lineWidth = 1.4;
    c.beginPath(); c.arc(pR[0], pR[1], rA, Math.PI, Math.PI + th, false); c.stroke();
    LD.haloText(c, 'θ = ' + num(th * 180 / Math.PI, 1) + '°', pR[0] - rA - 6, pR[1] + 15, colors.accent, 'right', 'alphabetic', '700 12px ' + FONT);
    // 標籤
    if (!A.narrow) {
      const pt = Pt(S_TICK - 0.02, TH + 0.075, 0.06);
      LD.pill(c, T('打點計時器', 'Ticker timer'), pt[0], pt[1] - 4, colors.muted, 'center', '600 11.5px ' + FONT);
      const ps = Pt(S_STOP + 0.04, TH + 0.035, 0.1);
      LD.pill(c, T('擋板', 'End stop'), ps[0] + 6, ps[1], colors.muted, 'left', '600 11.5px ' + FONT);
    }
  }

  // ---------- ③ 自由落體：靜態 ----------
  function weightDims() { return { h: 0.035 + 0.045 * state.m, r: 0.014 + 0.008 * state.m }; }
  function staticFall(c) {
    table(c, -0.34, 0.5, -0.03, 0.34);
    // 鐵架底座與立桿
    box(c, ROD_X - 0.09, ROD_X + 0.16, 0, 0.016, 0.12, 0.33, colors.metal, { top: colors.metalHi });
    cylY(c, ROD_X, ROD_Z, 0.0075, 0.016, 1.5, colors.steel);
    // 沙箱：木箱，沙面比箱緣低 1.2 cm（重物落到沙面上）
    const sx0 = XT - 0.09, sx1 = XT + 0.09, sz0 = 0.0, sz1 = 0.16;
    box(c, sx0, sx1, 0, Y_SAND + 0.012, sz0, sz1, colors.wood, { top: shade(colors.wood, 0.1) });
    const sand = [P(sx0 + 0.01, Y_SAND, sz0 + 0.01), P(sx1 - 0.01, Y_SAND, sz0 + 0.01), P(sx1 - 0.01, Y_SAND, sz1 - 0.01), P(sx0 + 0.01, Y_SAND, sz1 - 0.01)];
    path(c, sand);
    const sg = c.createLinearGradient(0, sand[2][1], 0, sand[0][1]);
    sg.addColorStop(0, shade(colors.sand, -0.12)); sg.addColorStop(1, shade(colors.sand, 0.1));
    c.fillStyle = sg; c.fill();
    // 沙粒
    const rnd = FF.mulberry32(7);
    c.fillStyle = alpha(shade(colors.sand, -0.45), 0.45);
    for (let i = 0; i < 90; i++) {
      const p = P(sx0 + 0.015 + rnd() * (sx1 - sx0 - 0.03), Y_SAND, sz0 + 0.015 + rnd() * (sz1 - sz0 - 0.03));
      c.fillRect(p[0], p[1], 1, 1);
    }
    // 箱子內壁的陰影（前緣在沙面上投下的暗帶）
    c.fillStyle = LD.shadowInk(colors.dark ? 0.3 : 0.12);
    path(c, [sand[0], sand[1], P(sx1 - 0.01, Y_SAND, sz0 + 0.03), P(sx0 + 0.01, Y_SAND, sz0 + 0.03)]);
    c.fill();
    // 紙帶捲的支架（立桿 → 捲軸）
    const ra = P(ROD_X, Y_ROLL, ROD_Z), rb = P(XT - ROLL_FR, Y_ROLL, TZ + 0.012);
    rod(c, ra, rb, colors.steel, Math.max(2.5, 0.008 * A.k));
    box(c, ROD_X - 0.014, ROD_X + 0.014, Y_ROLL - 0.012, Y_ROLL + 0.016, ROD_Z - 0.018, ROD_Z + 0.018, colors.metalLo, { top: colors.metal });
    // 直尺（落下距離，0 在重物底面的起點）
    const rx0 = XT + 0.075, rx1 = XT + 0.105;
    box(c, rx0, rx1, Y_SAND - 0.03, YB0 + 0.04, 0.0, 0.006, colors.paper, { top: colors.paper, front: shade(colors.paper, 0.05), edge: 0.5 });
    c.strokeStyle = alpha(colors.text, 0.7);
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i <= 90; i += 1) {
      const y = YB0 - i / 100;
      const len = i % 10 === 0 ? 0.016 : i % 5 === 0 ? 0.011 : 0.006;
      if (i % 5 !== 0 && A.k * 0.01 < 4) continue;
      const a = P(rx0, y, 0), b = P(rx0 + len, y, 0);
      c.moveTo(a[0], Math.round(a[1]) + 0.5); c.lineTo(b[0], Math.round(b[1]) + 0.5);
    }
    c.stroke();
    c.font = '600 ' + (A.k > 250 ? 10 : 9) + 'px ' + FONT;
    c.fillStyle = alpha(colors.text, 0.75);
    c.textAlign = 'left'; c.textBaseline = 'middle';
    for (let i = 0; i <= 90; i += 10) { const p = P(rx1 + 0.006, YB0 - i / 100, 0); LD.haloText(c, String(i), p[0], p[1], alpha(colors.text, 0.8), 'left', 'middle', '600 10px ' + FONT); }
    const pu = P(rx1 + 0.004, YB0 + 0.06, 0);
    LD.haloText(c, 'cm', pu[0], pu[1], colors.muted, 'left', 'middle', '600 10px ' + FONT);
    // 計時器（垂直夾在立桿上，機身在紙帶後方）
    // 夾臂：立桿 → 計時器背面
    const a = P(ROD_X, Y_TICK + 0.01, ROD_Z), b = P(XT - 0.03, Y_TICK + 0.01, 0.13);
    rod(c, a, b, colors.steel, Math.max(3, 0.011 * A.k));
    box(c, ROD_X - 0.016, ROD_X + 0.016, Y_TICK - 0.01, Y_TICK + 0.03, ROD_Z - 0.02, ROD_Z + 0.02, colors.metalLo, { top: colors.metal });
    box(c, XT - 0.04, XT + 0.04, Y_TICK - 0.065, Y_TICK + 0.07, 0.068, 0.15, colors.dev, { top: colors.devHi });
    // 線圈窗
    const w0 = P(XT - 0.03, Y_TICK + 0.058, 0.068), w1 = P(XT - 0.004, Y_TICK + 0.018, 0.068);
    const cg = c.createLinearGradient(0, w0[1], 0, w1[1]);
    cg.addColorStop(0, shade(colors.brass, 0.35)); cg.addColorStop(0.5, colors.brass); cg.addColorStop(1, shade(colors.brass, -0.3));
    c.fillStyle = cg;
    roundRect(c, w0[0], w0[1], w1[0] - w0[0], w1[1] - w0[1], 2); c.fill();
    c.strokeStyle = alpha(shade(colors.brass, -0.45), 0.55);
    c.lineWidth = 0.8;
    c.beginPath();
    for (let y = w0[1] + 2; y < w1[1] - 1; y += 2) { c.moveTo(w0[0] + 1, Math.round(y) + 0.5); c.lineTo(w1[0] - 1, Math.round(y) + 0.5); }
    c.stroke();
    // 電源接頭
    [[XT + 0.022, colors.pos], [XT + 0.022, colors.field]].forEach(function (t, i) {
      const s = P(t[0], Y_TICK + 0.05 - i * 0.022, 0.068), R = Math.max(1.6, 0.0045 * A.k);
      c.fillStyle = t[1]; c.beginPath(); c.arc(s[0], s[1], R, 0, Math.PI * 2); c.fill();
    });
    const pt = P(XT + 0.045, Y_TICK - 0.01, 0.068);
    LD.pill(c, T('打點計時器', 'Ticker timer'), pt[0] + 4, pt[1] + 9, colors.muted, 'left', '600 11.5px ' + FONT);
    const ps = P(sx1, Y_SAND * 0.45, sz0);
    LD.pill(c, T('沙箱', 'Sand tray'), ps[0] + 6, ps[1], colors.muted, 'left', '600 11.5px ' + FONT);
    if (!A.narrow) {
      const pr = P(XT - ROLL_FR - 0.03, Y_ROLL + 0.04, TZ);
      LD.pill(c, T('紙帶捲', 'Tape roll'), pr[0], pr[1], colors.muted, 'right', '600 11.5px ' + FONT);
    }
  }

  // ---------- ① 計時器校正：靜態 ----------
  function staticCalib(c) {
    table(c, -0.06, 1.1, -0.03, 0.3);
    timerBody(c, function (u, v) { return [XC - u, v]; });
    // 紙帶捲的支架
    box(c, ROLL_X - 0.05, ROLL_X + 0.05, 0, 0.01, 0.04, 0.13, colors.metal, { top: colors.metalHi });
    box(c, ROLL_X - 0.006, ROLL_X + 0.006, 0.01, ROLL_Y, 0.12, 0.13, colors.steel);
    // 紙帶捲
    cylZ(c, ROLL_X, ROLL_Y, ROLL_R, TZ - TW / 2, TZ + TW / 2, colors.paper, { hub: colors.metal });
    const f = P(ROLL_X, ROLL_Y, TZ - TW / 2);
    c.strokeStyle = alpha(colors.paperEdge, 0.5);
    c.lineWidth = 0.6;
    for (let r = 0.016; r < ROLL_R; r += 0.006) { c.beginPath(); c.arc(f[0], f[1], r * A.k, 0, Math.PI * 2); c.stroke(); }
    if (!A.narrow) {
      const pt = P(XC, 0.085, 0.07);
      LD.pill(c, T('打點計時器', 'Ticker timer'), pt[0], pt[1], colors.muted, 'center', '600 11.5px ' + FONT);
      const pr = P(ROLL_X, ROLL_Y + ROLL_R + 0.02, 0.07);
      LD.pill(c, T('紙帶捲', 'Tape roll'), pr[0], pr[1], colors.muted, 'center', '600 11.5px ' + FONT);
    }
  }

  // ---------- 每一幀 ----------
  let pending = false;
  function requestDraw() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; drawAll(); });
  }
  function drawAll() { drawA(); drawTape(); drawGraph(); updateReadouts(); }

  function drawA() {
    if (!A) return;
    if (statKey !== staticKey()) buildStatic();
    const c = ctx;
    c.setTransform(A.dpr, 0, 0, A.dpr, 0, 0);
    c.clearRect(0, 0, A.w, A.h);
    c.drawImage(stat, 0, 0, A.w, A.h);
    if (state.mode === 'incline') dynIncline(c);
    else if (state.mode === 'fall') dynFall(c);
    else dynCalib(c);
    drawFx(c);
  }

  /** 計時器目前的振片位置（打點瞬間往下壓，純裝飾） */
  function armDip(clock, dt, on) {
    if (!on || reducedMotion) return 0;
    const ph = (clock / dt) % 1;
    return ph < 0.35 ? 1 - ph / 0.35 : 0;
  }

  /** 目前畫面上的運動狀態 { tape（紙帶紀錄）, x, t, v, clock, on（計時器開著）, done } */
  function sceneState() {
    const e = cur();
    if (e.phase === 'ready') return { x: 0, t: 0, v: 0, clock: 0, on: false, nStack: 0, rec: null };
    if (e.phase === 'ticking') return { x: 0, t: 0, v: 0, clock: e.clock, on: true, nStack: Math.floor(e.clock / dtTrueNow() + 1e-9) + 1, rec: null };
    const r = e.phase === 'done' ? e.run : e.live;
    const mo = r.mo;
    const t = e.phase === 'done' ? Math.min(r.tape.tEnd, mo.tEnd) : e.t;
    return { x: FF.xAt(mo, t), t: t, v: FF.vAt(mo, t), clock: r.tape.tPre + e.t, on: e.phase !== 'done', nStack: r.tape.nStack, rec: r, done: e.phase === 'done' };
  }
  /** 到時刻 t 為止已打的點（紙帶座標，第 0 個是起點的重疊點痕） */
  function printedDots(rec, t, done) {
    const tp = rec.tape, out = [];
    for (let i = 0; i < tp.dots.length; i++) { if (!done && tp.dots[i].t > t + 1e-12) break; out.push(tp.dots[i]); }
    return out;
  }
  /** 這條紙帶上的計數點（紙帶處理的設定），只有跑完才有 */
  function countPts(rec) {
    if (!rec || !rec.mo.moves) return [];
    return FF.countingPoints(rec.tape, state.j0, state.n).slice(0, MAX_ROWS);
  }

  function dynIncline(c) {
    const k = A.k, ss = sceneState(), e = cur();
    const sTail = S_TAIL0 + ss.x;
    const nt = TH + VT;
    const bw = function (s0, s1) { return [Pt(s0, nt, TZ - TW / 2), Pt(s1, nt, TZ - TW / 2), Pt(s1, nt, TZ + TW / 2), Pt(s0, nt, TZ + TW / 2)]; };
    // 紙帶：鬆的那一段從軌道上端垂到桌上，摺成一疊（剩下愈少，疊得愈薄）
    const remain = Math.max(0.05, FF.TAPE_LEN - (S_TAIL0 - S_TICK) - ss.x);
    const top = Wt(0, nt), pTop = P(top[0], top[1], TZ);
    const pile = Math.max(1, Math.round(remain / 0.12));
    const px = top[0] - 0.09, pb = P(px, 0, TZ);
    c.strokeStyle = colors.paperEdge;
    c.lineWidth = Math.max(2.5, TW * A.k * 0.45) + 1;
    c.lineCap = 'butt';
    c.beginPath(); c.moveTo(pTop[0], pTop[1]);
    c.bezierCurveTo(pTop[0] - 0.05 * k, pTop[1], pb[0] + 0.02 * k, pb[1] - (top[1] * 0.4) * k, pb[0] + 0.02 * k, pb[1] - pile * 1.6 - 2);
    c.stroke();
    c.strokeStyle = colors.paper;
    c.lineWidth -= 1;
    c.stroke();
    // 摺成一疊的紙帶（每摺約 12 cm）
    for (let i = 0; i < pile; i++) {
      const y = 0.001 + i * 0.003, d = (i % 2) * 0.006;
      prism(c, [[px - 0.07 + d, y], [px + 0.03 + d, y], [px + 0.03 + d, y + 0.0022], [px - 0.07 + d, y + 0.0022]], TZ - TW, TZ + TW, i % 2 ? colors.paper : shade(colors.paper, -0.03), { top: shade(colors.paper, 0.06), edge: 0.5 });
    }
    // 軌道上的紙帶：上端 → 計時器 → 滑車尾部
    band(c, bw(0.0, sTail), colors.paper, alpha(colors.paperEdge, 0.9));
    // 紙帶上的點：第 j 點在 s = 打點針 + (x − x_j)
    const rDot = Math.max(0.9, Math.min(1.7, 0.0018 * k));
    c.fillStyle = colors.ink;
    c.beginPath();
    const drawDot = function (s) { if (s > sTail - 0.002 || s < S_TICK - 1e-4) return; const p = Pt(s, nt, TZ); c.moveTo(p[0] + rDot, p[1]); c.ellipse(p[0], p[1], rDot, rDot * 0.75, 0, 0, Math.PI * 2); };
    if (ss.nStack) drawDot(S_TICK + ss.x);
    if (ss.rec) printedDots(ss.rec, ss.t, ss.done).forEach(function (d) { drawDot(S_TICK + ss.x - d.x); });
    c.fill();
    if (ss.nStack) { const p = Pt(S_TICK + ss.x, nt, TZ); c.fillStyle = colors.ink; c.beginPath(); c.ellipse(p[0], p[1], rDot * 1.6, rDot * 1.25, 0, 0, Math.PI * 2); c.fill(); }
    // 跑完後：計數線（紅線，與紙帶畫布相同）
    if (ss.done) {
      const cp = countPts(ss.rec);
      c.strokeStyle = colors.pos;
      c.lineWidth = 1.4;
      c.beginPath();
      cp.forEach(function (q) {
        const s = S_TICK + ss.x - q.x;
        const a = Pt(s, nt, TZ - TW * 0.9), b = Pt(s, nt, TZ + TW * 0.9);
        c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
      });
      c.stroke();
    }
    // 計時器的振片與複寫紙
    timerHead(c, function (u, v) { return Wt(S_TICK + u, TH + v); }, armDip(ss.clock, dtTrueNow(), ss.on));
    if (ss.on && !reducedMotion && armDip(ss.clock, dtTrueNow(), ss.on) > 0.4) {
      const p = Pt(S_TICK, nt, TZ);
      LD.ripple(c, p[0], p[1], Math.max(2, 0.004 * k), 1 - armDip(ss.clock, dtTrueNow(), true), colors.ink);
    }
    drawCart(c, sTail);
    // 讀數
    hud(c, ss, 'x');
  }

  function drawCart(c, sTail) {
    const s0 = sTail, s1 = sTail + CART_L, k = A.k;
    const wheels = [s0 + 0.035, s1 - 0.035];
    // 車底在軌道頂面的影子
    path(c, [Pt(s0 + 0.01, TH + 0.0005, 0.03), Pt(s1 - 0.01, TH + 0.0005, 0.03), Pt(s1 - 0.01, TH + 0.0005, 0.092), Pt(s0 + 0.01, TH + 0.0005, 0.092)]);
    c.fillStyle = LD.shadowInk(colors.dark ? 0.35 : 0.14);
    c.fill();
    wheels.forEach(function (s) { const w = Wt(s, TH + WR); cylZ(c, w[0], w[1], WR, 0.09, 0.1, colors.rubber, { hub: colors.metal }); });
    // 車上的鐵條砝碼（每 0.25 kg 一條；車本身 0.5 kg）
    const bars = Math.max(0, Math.round((state.M - 0.5) / 0.25));
    // 車身
    prism(c, [Wt(s0, TH + 0.013), Wt(s1, TH + 0.013), Wt(s1, TH + 0.05), Wt(s0, TH + 0.05)], 0.026, 0.094, colors.cart, { top: shade(colors.cart, 0.12) });
    // 側面凹槽與螺絲
    c.strokeStyle = alpha(shade(colors.cart, -0.5), 0.55);
    c.lineWidth = 1;
    c.beginPath();
    const g0 = Pt(s0 + 0.012, TH + 0.032, 0.026), g1 = Pt(s1 - 0.012, TH + 0.032, 0.026);
    c.moveTo(g0[0], g0[1]); c.lineTo(g1[0], g1[1]);
    c.stroke();
    c.strokeStyle = alpha(shade(colors.cart, 0.6), 0.5);
    c.beginPath(); c.moveTo(g0[0], g0[1] + 1); c.lineTo(g1[0], g1[1] + 1); c.stroke();
    for (let i = 0; i < bars; i++) {
      prism(c, [Wt(s0 + 0.03, TH + 0.05 + i * 0.011), Wt(s1 - 0.03, TH + 0.05 + i * 0.011), Wt(s1 - 0.03, TH + 0.06 + i * 0.011), Wt(s0 + 0.03, TH + 0.06 + i * 0.011)], 0.034, 0.086, colors.steel, { top: colors.metalHi });
    }
    // 尾端的紙帶夾
    prism(c, [Wt(s0 - 0.007, TH + 0.016), Wt(s0, TH + 0.016), Wt(s0, TH + 0.034), Wt(s0 - 0.007, TH + 0.034)], 0.045, 0.075, colors.metalLo, { top: colors.metal });
    // 前方的輪子
    wheels.forEach(function (s) { const w = Wt(s, TH + WR); cylZ(c, w[0], w[1], WR, 0.02, 0.03, colors.rubber, { hub: colors.metalHi }); });
    if (!A.narrow) {
      const p = Pt(s0 + CART_L / 2, TH + 0.06 + bars * 0.011, 0.06);
      LD.pill(c, T('滑車 M = ', 'Cart M = ') + num(state.M, 2) + ' kg', p[0], p[1] - 6, colors.cart, 'center', '700 11.5px ' + FONT);
    }
  }

  /** 左上角的即時讀數 */
  function hud(c, ss, sym) {
    const e = cur();
    const f = '600 12px ' + FONT, x0 = 10;
    let y = A.narrow ? 24 : 26;
    const items = [];
    if (e.phase === 'ticking') items.push([T('計時器打點中：放手前已打 ', 'Timer on: ') + ss.nStack + T(' 點（疊在一起）', ' dots so far, all on one spot'), colors.ink]);
    if (ss.rec) {
      items.push(['t = ' + num(ss.t, 3) + ' s', colors.text]);
      items.push([sym + ' = ' + num(ss.x * 100, 1) + ' cm', colors.text]);
      items.push(['v = ' + num(ss.v, 2) + ' m/s', colors.pos]);
    }
    if (A.narrow && items.length > 1) {
      const line = items.map(function (q) { return q[0]; }).join('   ');
      LD.pill(c, line, x0, y, colors.text, 'left', f);
    } else items.forEach(function (q) { LD.pill(c, q[0], x0, y, q[1], 'left', f); y += 21; });
    if (state.speed < 1 && (e.phase === 'running' || e.phase === 'after' || e.phase === 'ticking')) {
      LD.pill(c, T('慢動作 ', 'Slow motion ') + (state.speed === 0.25 ? '¼×' : '1/10×'), A.inset ? A.inset.x - 10 : A.w - 10, A.narrow ? 48 : 26, colors.accent, 'right', '700 12px ' + FONT);
    }
    // 比例尺
    const len = 0.1 * A.k, sx = A.w - 14 - len, sy = A.narrow && state.mode === 'incline' ? 24 : 18;
    if (state.mode !== 'fall' || A.narrow) {
      c.strokeStyle = alpha(colors.text, 0.6);
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + len, sy); c.moveTo(sx, sy - 4); c.lineTo(sx, sy + 4); c.moveTo(sx + len, sy - 4); c.lineTo(sx + len, sy + 4); c.stroke();
      LD.haloText(c, '10 cm', sx + len / 2, sy - 6, colors.muted, 'center', 'alphabetic', '600 11px ' + FONT);
    }
  }

  // ---------- ③ 自由落體：每一幀 ----------
  function dynFall(c) {
    const k = A.k, ss = sceneState();
    const wd = weightDims();
    const yb = YB0 - ss.x, yTop = yb + wd.h;
    const tw = TW / 2;
    // 紙帶捲：放出的紙帶愈多，捲得愈細（面積守恆），並跟著轉動
    const RI = 0.012, rr = Math.sqrt(RI * RI + (ROLL_FR * ROLL_FR - RI * RI) * Math.max(0, 1 - ss.x / 1.6));
    const rcx = XT - ROLL_FR;
    cylZ(c, rcx, Y_ROLL, rr, TZ - tw, TZ + tw, colors.paper, { hub: colors.metal });
    const rc = P(rcx, Y_ROLL, TZ - tw);
    c.strokeStyle = alpha(colors.paperEdge, 0.55);
    c.lineWidth = 0.6;
    for (let r = RI + 0.004; r < rr - 0.001; r += 0.004) { c.beginPath(); c.arc(rc[0], rc[1], r * k, 0, Math.PI * 2); c.stroke(); }
    const ang = -ss.x / ((rr + RI) / 2);
    c.strokeStyle = alpha(colors.ink, 0.5);
    c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(rc[0] + Math.cos(ang) * RI * k, rc[1] + Math.sin(ang) * RI * k); c.lineTo(rc[0] + Math.cos(ang) * rr * k, rc[1] + Math.sin(ang) * rr * k); c.stroke();
    // 捲軸 → 計時器上方的導夾（略斜的一小段）
    band(c, [P(rcx + rr - tw, Y_ROLL, TZ), P(rcx + rr + tw, Y_ROLL, TZ), P(XT + tw, Y_TICK + 0.07, TZ), P(XT - tw, Y_TICK + 0.07, TZ)], colors.paper, alpha(colors.paperEdge, 0.9));
    // 紙帶：由計時器上方垂到重物頂端（正面朝向觀看者）
    const t0 = P(XT - tw, Y_TICK + 0.07, TZ), t1 = P(XT + tw, yTop + 0.012, TZ);
    const pg = c.createLinearGradient(t0[0], 0, t1[0], 0);
    pg.addColorStop(0, shade(colors.paper, -0.05)); pg.addColorStop(0.5, shade(colors.paper, 0.06)); pg.addColorStop(1, shade(colors.paper, -0.07));
    c.fillStyle = pg;
    c.fillRect(t0[0], t0[1], t1[0] - t0[0], t1[1] - t0[1]);
    c.strokeStyle = alpha(colors.paperEdge, 0.9);
    c.lineWidth = 0.7;
    c.strokeRect(t0[0] + 0.35, t0[1], t1[0] - t0[0] - 0.7, t1[1] - t0[1]);
    // 點：第 j 點在 y = 打點針 − (x − x_j)
    const rDot = Math.max(1, Math.min(1.8, 0.0035 * k));
    c.fillStyle = colors.ink;
    c.beginPath();
    const dot = function (yy) { if (yy < yTop + 0.012 || yy > Y_TICK + 1e-4) return; const p = P(XT, yy, TZ); c.moveTo(p[0] + rDot, p[1]); c.arc(p[0], p[1], rDot, 0, Math.PI * 2); };
    if (ss.nStack) dot(Y_TICK - ss.x);
    if (ss.rec) printedDots(ss.rec, ss.t, ss.done).forEach(function (d) { dot(Y_TICK - ss.x + d.x); });
    c.fill();
    if (ss.nStack && Y_TICK - ss.x >= yTop + 0.012) { const p = P(XT, Y_TICK - ss.x, TZ); c.beginPath(); c.arc(p[0], p[1], rDot * 1.6, 0, Math.PI * 2); c.fill(); }
    // 跑完後：頻閃影像（每個計數點時重物的位置）與紙帶上的計數線
    if (ss.done) {
      const cp = countPts(ss.rec);
      c.strokeStyle = colors.pos;
      c.lineWidth = 1.4;
      c.beginPath();
      cp.forEach(function (q) { const yy = Y_TICK - ss.x + q.x; const a = P(XT - tw * 1.8, yy, TZ), b = P(XT + tw * 1.8, yy, TZ); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); });
      c.stroke();
      // 頻閃影像：每個計數點時刻重物所在的位置（標上是第幾點）
      let lastY = -1e9;
      cp.forEach(function (q, i) {
        const y0 = YB0 - q.x;
        const a = P(XT - wd.r, y0, TZ), b = P(XT + wd.r, y0 + wd.h, TZ);
        c.strokeStyle = alpha(shade(colors.brass, colors.dark ? 0.2 : -0.2), 0.8 - 0.4 * i / Math.max(1, cp.length));
        c.lineWidth = 1;
        c.strokeRect(a[0] - 0.5, b[1], b[0] - a[0], a[1] - b[1]);
        const p = P(XT - wd.r - 0.012, y0 + wd.h / 2, TZ);
        if (p[1] - lastY >= 12) {
          LD.haloText(c, i ? String(i * state.n) : T('第0點', 'dot 0'), p[0], p[1], colors.pos, 'right', 'middle', '700 10.5px ' + FONT);
          lastY = p[1];
        }
      });
    }
    // 複寫紙圓盤與振片（在紙帶前方）
    const dip = armDip(ss.clock, dtTrueNow(), ss.on);
    cylZ(c, XT, Y_TICK, 0.011, 0.045, 0.052, colors.rubber, { hub: shade(colors.rubber, 0.3) });
    const ap = P(XT + 0.04, Y_TICK + 0.03, 0.06), bp = P(XT + 0.004 - dip * 0.004, Y_TICK + 0.004, 0.035);
    c.lineCap = 'round';
    c.strokeStyle = shade(colors.metalLo, -0.2);
    c.lineWidth = Math.max(2, 0.008 * k) + 1;
    c.beginPath(); c.moveTo(ap[0], ap[1]); c.lineTo(bp[0], bp[1]); c.stroke();
    c.strokeStyle = colors.metalHi;
    c.lineWidth -= 1.6;
    c.stroke();
    if (ss.on && !reducedMotion && dip > 0.4) { const p = P(XT, Y_TICK, TZ); LD.ripple(c, p[0], p[1], 3, 1 - dip, colors.ink); }
    // 紙帶導夾（上下兩個）
    [Y_TICK - 0.05, Y_TICK + 0.055].forEach(function (y) { box(c, XT - 0.016, XT + 0.016, y - 0.005, y + 0.005, 0.044, 0.068, colors.metal, { top: colors.metalHi }); });
    // 重物：銅圓柱＋上方的夾子
    const landed = ss.done || (ss.rec && ss.t >= ss.rec.mo.tEnd);
    LD.contactShadow(c, P(XT, Y_SAND, TZ)[0], P(XT, Y_SAND, TZ)[1], wd.r * k * 1.2, landed ? 0 : Math.min(1, ss.x / 0.6 + (1 - ss.x / 0.9) * 0.6));
    cylY(c, XT, TZ, wd.r, yb, yTop, colors.brass);
    box(c, XT - 0.006, XT + 0.006, yTop, yTop + 0.014, TZ - 0.004, TZ + 0.004, colors.metalLo, { top: colors.metal });
    // 重物的標籤放在直尺數字的右邊，用細線指向重物
    const lw = P(XT + 0.155, yb + wd.h / 2, TZ), lp = P(XT + wd.r + 0.004, yb + wd.h / 2, TZ);
    c.strokeStyle = alpha(colors.muted, 0.6);
    c.lineWidth = 1;
    c.setLineDash([2, 3]);
    c.beginPath(); c.moveTo(lp[0], lp[1]); c.lineTo(lw[0] - 4, lw[1]); c.stroke();
    c.setLineDash([]);
    const wTxt = T('重物 m = ', 'Weight m = ') + num(state.m, 2) + ' kg';
    c.font = '700 11.5px ' + FONT;
    LD.pill(c, wTxt, Math.min(lw[0], (A.inset ? A.inset.x : A.w) - 6 - c.measureText(wTxt).width - 12), lw[1] + 9, shade(colors.brass, colors.dark ? 0.2 : -0.35), 'left', '700 11.5px ' + FONT);
    hud(c, ss, 'y');
    if (A.inset) drawInset(c, A.inset, ss);
  }

  /** 打點計時器的放大示意圖（只在寬畫面的自由落體顯示） */
  function drawInset(c, R, ss) {
    const dk = colors.dark;
    c.save();
    roundRect(c, R.x, R.y, R.w, R.h, 12);
    const g = c.createLinearGradient(0, R.y, 0, R.y + R.h);
    g.addColorStop(0, alpha(colors.panel, dk ? 0.9 : 0.94));
    g.addColorStop(1, alpha(shade(colors.panel, dk ? -0.1 : -0.03), 0.94));
    c.fillStyle = g;
    c.shadowColor = dk ? 'rgba(0,0,0,0.5)' : alpha(colors.text, 0.15);
    c.shadowBlur = 10; c.shadowOffsetY = 3;
    c.fill();
    c.restore();
    c.strokeStyle = alpha(colors.text, dk ? 0.14 : 0.1);
    c.lineWidth = 1;
    roundRect(c, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 12); c.stroke();
    fitText(c, T('打點計時器（示意圖，未依比例）', 'Inside the ticker timer (schematic, not to scale)'), R.x + 14, R.y + 22, R.w - 28, colors.text, 700, 13);
    const f = state.freq || 0;
    fitText(c, f ? T('交流電使振片每秒振動 ', 'AC makes the strip strike ') + f + T(' 次，每 1/' + f + ' s 打一點', ' times a second: a dot every 1/' + f + ' s') : T('電鈴式：振片的頻率未知，要先量', 'Buzzer type: unknown frequency, measure it first'), R.x + 14, R.y + 42, R.w - 28, colors.muted, 600, 12);
    // 幾何（上半部：計時器構造；下半部：相鄰兩點的時間與間距）
    const base = R.y + 136;
    const tapeY = base + 26, tapeH = 22;
    const stylusX = R.x + R.w * 0.62;
    // 紙帶（往下移動 → 在示意圖中往左移動）
    const tg = c.createLinearGradient(0, tapeY, 0, tapeY + tapeH);
    tg.addColorStop(0, shade(colors.paper, 0.1)); tg.addColorStop(1, shade(colors.paper, -0.06));
    c.fillStyle = tg;
    c.fillRect(R.x + 14, tapeY, R.w - 28, tapeH);
    c.strokeStyle = alpha(colors.paperEdge, 0.9);
    c.strokeRect(R.x + 14.5, tapeY + 0.5, R.w - 29, tapeH - 1);
    // 點（依真實的點距放大：示意圖寬度 ≈ 12 cm 的紙帶）
    const kin = (R.w - 28) / 0.12;
    c.save();
    c.beginPath(); c.rect(R.x + 14, tapeY, R.w - 28, tapeH); c.clip();
    c.fillStyle = colors.ink;
    const dotAt = function (dx) { const xx = stylusX - dx * kin; c.beginPath(); c.arc(xx, tapeY + tapeH / 2, 2.6, 0, Math.PI * 2); c.fill(); };
    if (ss.nStack) { dotAt(ss.x); c.beginPath(); c.arc(stylusX - ss.x * kin, tapeY + tapeH / 2, 3.6, 0, Math.PI * 2); c.fill(); }
    const shown = ss.rec ? printedDots(ss.rec, ss.t, ss.done) : [];
    shown.forEach(function (d) { if (ss.x - d.x < 0.13) dotAt(ss.x - d.x); });
    c.restore();
    // 最近幾個間距（真實的毫米數）
    c.strokeStyle = alpha(colors.accent, 0.8);
    c.lineWidth = 1.2;
    let nb = 0;
    for (let i = shown.length - 1; i > 0 && nb < 3; i--) {
      const xa = stylusX - (ss.x - shown[i].x) * kin, xb = stylusX - (ss.x - shown[i - 1].x) * kin;
      if (xb < R.x + 16 || xa - xb < 26) break;
      const yb = tapeY + tapeH + 6;
      c.beginPath(); c.moveTo(xb + 2, yb); c.lineTo(xb + 2, yb + 5); c.lineTo(xa - 2, yb + 5); c.lineTo(xa - 2, yb); c.stroke();
      LD.haloText(c, num((shown[i].x - shown[i - 1].x) * 1000, 1) + ' mm', (xa + xb) / 2, yb + 16, colors.accent, 'center', 'middle', '600 11px ' + FONT);
      nb++;
    }
    const ay = tapeY + tapeH + 36;
    LD.arrow(c, R.x + R.w - 150, ay, R.x + R.w - 230, ay, colors.muted, 1.4);
    LD.haloText(c, T('紙帶的運動方向', 'Tape moves this way'), R.x + R.w - 144, ay, colors.muted, 'left', 'middle', '600 11px ' + FONT);
    drawRhythm(c, { x: R.x + 14, y: tapeY + tapeH + 56, w: R.w - 28, h: R.y + R.h - (tapeY + tapeH + 56) - 12 }, ss, shown);
    // 電磁鐵（線圈）
    const mx = R.x + R.w * 0.24, my = base - 64, mw = R.w * 0.2, mh = 34;
    LD.block(c, mx, my, mw, mh, colors.brass, { r: 5 });
    c.strokeStyle = alpha(shade(colors.brass, -0.45), 0.5);
    c.lineWidth = 1;
    c.beginPath();
    for (let x = mx + 4; x < mx + mw - 2; x += 3) { c.moveTo(Math.round(x) + 0.5, my + 3); c.lineTo(Math.round(x) + 0.5, my + mh - 3); }
    c.stroke();
    LD.block(c, mx + mw * 0.15, my + mh, mw * 0.7, 8, colors.steel, { r: 2, shadow: false });
    LD.haloText(c, T('電磁鐵', 'Electromagnet'), mx + mw / 2, my - 8, colors.muted, 'center', 'alphabetic', '600 11.5px ' + FONT);
    // 振片：左端固定，右端帶打點針；依時刻上下振動
    const dip = armDip(ss.clock, dtTrueNow(), ss.on);
    const fixX = R.x + 26, fixY = base - 14;
    const endX = stylusX, endY = base - 6 + dip * 10;
    LD.block(c, fixX - 10, fixY - 16, 14, 30, colors.dev, { r: 2 });
    c.lineCap = 'round';
    c.strokeStyle = shade(colors.metalLo, -0.2);
    c.lineWidth = 6;
    c.beginPath(); c.moveTo(fixX, fixY); c.quadraticCurveTo((fixX + endX) / 2, fixY + dip * 3, endX, endY); c.stroke();
    c.strokeStyle = colors.metalHi;
    c.lineWidth = 3;
    c.stroke();
    // 打點針
    c.strokeStyle = colors.metalLo;
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(endX, endY); c.lineTo(endX, endY + 14); c.stroke();
    LD.haloText(c, T('振片', 'Steel strip'), (fixX + endX) / 2, fixY + 22 + dip * 2, colors.muted, 'center', 'alphabetic', '600 11.5px ' + FONT);
    // 複寫紙
    c.fillStyle = shade(colors.rubber, 0.1);
    roundRect(c, stylusX - 26, tapeY - 6, 52, 6, 3); c.fill();
    LD.haloText(c, T('複寫紙', 'Carbon disc'), stylusX + 32, tapeY - 12, colors.muted, 'left', 'middle', '600 11.5px ' + FONT);
    if (ss.on && dip > 0.5 && !reducedMotion) LD.ripple(c, stylusX, tapeY + tapeH / 2, 5, 1 - dip, colors.ink);
  }
  /** 字太長時縮小字級，讓它放得進 maxW */
  function fitText(c, text, x, y, maxW, color, weight, size) {
    c.font = weight + ' ' + size + 'px ' + FONT;
    const w = c.measureText(text).width;
    const s = w > maxW ? Math.max(9, size * maxW / w) : size;
    LD.haloText(c, text, x, y, color, 'left', 'middle', weight + ' ' + s.toFixed(1) + 'px ' + FONT);
  }
  /** 時間相等、間距不等：上排是等間隔的時刻，下排是同一點在紙帶上的位置，用線連起來 */
  function drawRhythm(c, R, ss, shown) {
    if (R.h < 90) return;
    const f = state.freq;
    fitText(c, T('最近 8 個點：時間間隔相同，間距卻愈來愈大', 'The last 8 dots: equal times, growing gaps'), R.x, R.y + 10, R.w, colors.text, 700, 12);
    const yT = R.y + 34, yX = R.y + R.h - 22;
    LD.haloText(c, T('時刻', 'time'), R.x, yT - 12, colors.muted, 'left', 'middle', '600 11px ' + FONT);
    LD.haloText(c, T('每格 ', 'each step ') + (f ? '1/' + f + ' s' : 'Δt'), R.x + R.w, yT - 12, colors['b-em'], 'right', 'middle', '700 11px ' + FONT);
    LD.haloText(c, T('紙帶上的位置', 'position on the tape'), R.x, yX + 16, colors.muted, 'left', 'middle', '600 11px ' + FONT);
    c.strokeStyle = alpha(colors.text, 0.35);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(R.x, yT); c.lineTo(R.x + R.w, yT); c.moveTo(R.x, yX); c.lineTo(R.x + R.w, yX); c.stroke();
    const pts = shown.slice(-8);
    if (pts.length < 2) {
      LD.haloText(c, T('放手之後，這裡會比較相鄰各點的時間與間距', 'After the release this compares the times and gaps of neighbouring dots'), R.x + R.w / 2, (yT + yX) / 2, colors.muted, 'center', 'middle', '600 11.5px ' + FONT);
      return;
    }
    const n = pts.length, ta = pts[0].t, tb = pts[n - 1].t, xa = pts[0].x, xb = pts[n - 1].x;
    const X1 = function (t) { return R.x + 8 + (t - ta) / (tb - ta) * (R.w - 16); };
    const X2 = function (x) { return R.x + 8 + (x - xa) / Math.max(1e-9, xb - xa) * (R.w - 16); };
    pts.forEach(function (p, i) {
      const u = X1(p.t), v = X2(p.x);
      c.strokeStyle = alpha(colors.accent, 0.5);
      c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(u, yT + 4); c.lineTo(v, yX - 4); c.stroke();
      LD.ball(c, u, yT, 3.5, colors['b-em'], { shadow: false });
      c.fillStyle = colors.text;
      c.beginPath(); c.arc(v, yX, 3, 0, Math.PI * 2); c.fill();
    });
    const g0 = pts[1].x - pts[0].x, g1 = pts[n - 1].x - pts[n - 2].x;
    LD.haloText(c, T('間距 ', 'gap ') + num(g0 * 1000, 1) + ' mm → ' + num(g1 * 1000, 1) + ' mm', R.x + R.w, yX + 16, colors.accent, 'right', 'middle', '700 11px ' + FONT);
  }

  // ---------- ① 計時器校正：每一幀 ----------
  function dynCalib(c) {
    const k = A.k, cal = state.cal;
    const s = calTapeShift();
    const yT = VT;
    // 紙帶：紙帶捲 → 計時器 → 往左被拉出
    const rollBottom = P(ROLL_X, ROLL_Y - ROLL_R, TZ);
    const xL = -0.06;
    band(c, [P(xL, yT, TZ - TW / 2), P(ROLL_X - 0.03, yT, TZ - TW / 2), P(ROLL_X - 0.03, yT, TZ + TW / 2), P(xL, yT, TZ + TW / 2)], colors.paper, alpha(colors.paperEdge, 0.9));
    // 從捲筒底部接到桌上的紙帶
    const a0 = P(ROLL_X - 0.03, yT, TZ);
    c.strokeStyle = colors.paperEdge;
    c.lineWidth = Math.max(2, TW * k * 0.35) + 1;
    c.beginPath(); c.moveTo(a0[0], a0[1]); c.quadraticCurveTo(rollBottom[0] - 0.01 * k, a0[1], rollBottom[0], rollBottom[1]); c.stroke();
    c.strokeStyle = colors.paper; c.lineWidth -= 1; c.stroke();
    // 點
    const rDot = Math.max(0.9, Math.min(1.6, 0.0016 * k));
    c.fillStyle = colors.ink;
    c.beginPath();
    calDots().forEach(function (sd) {
      const X = XC - (s - sd);
      if (X < xL || X > XC + 1e-4) return;
      const p = P(X, yT, TZ);
      c.moveTo(p[0] + rDot, p[1]); c.ellipse(p[0], p[1], rDot, rDot * 0.75, 0, 0, Math.PI * 2);
    });
    c.fill();
    const on = cal.phase === 'running';
    timerHead(c, function (u, v) { return [XC - u, v]; }, armDip(cal.t, cal.dt, on));
    // 手：捏著紙帶往左拉（拉一段後換手重新捏住）
    if (cal.phase !== 'ready' || true) {
      const span = 0.32, x0 = XC - 0.12;
      const hx = cal.phase === 'ready' ? x0 : x0 - (s % span);
      drawHand(c, P(hx, yT, TZ), k);
    }
    drawStopwatch(c);
    // 讀數
    const n = calDots().length;
    const f = '600 12px ' + FONT;
    LD.pill(c, T('點痕數 N = ', 'Dots N = ') + n, 10, A.narrow ? 24 : 26, colors.ink, 'left', f);
    if (cal.phase === 'running' || cal.phase === 'stopping') LD.pill(c, T('實際經過 ', 'Real time ') + num(cal.t, 2) + ' s', 10, A.narrow ? 46 : 48, colors.muted, 'left', f);
    if (!A.narrow) {
      const p = P(0.2, 0, 0.012);
      LD.pill(c, T('← 用手拉紙帶', '← pull the tape by hand'), p[0], p[1] + 2, colors.muted, 'center', '600 11.5px ' + FONT);
    }
  }
  /** 手（捏住紙帶的拇指與食指，示意） */
  function drawHand(c, p, k) {
    const s = Math.max(0.6, Math.min(1.1, k / 780));
    const x = p[0], y = p[1];
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    const skin = colors.skin, dk = colors.dark;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    // 圓頭粗線條畫的手：先畫深色外框，再畫本色，最後在上緣加一道亮光（立體感）
    const limb = function (pts, w, col) {
      const line = function () { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); };
      line(); c.strokeStyle = shade(col, dk ? -0.5 : -0.38); c.lineWidth = w + 2; c.stroke();
      line(); c.strokeStyle = col; c.lineWidth = w; c.stroke();
      c.save(); c.translate(-w * 0.12, -w * 0.2);
      line(); c.strokeStyle = alpha(shade(col, 0.45), dk ? 0.35 : 0.6); c.lineWidth = w * 0.32; c.stroke();
      c.restore();
    };
    const sleeve = shade(colors.neg, dk ? -0.35 : 0.15);
    limb([[-100, -74], [-44, -36]], 26, sleeve);                 // 前臂（袖子）
    limb([[-50, -40], [-44, -36]], 28, shade(sleeve, -0.12));     // 袖口
    limb([[-12, -31], [7, -25], [11, -12]], 8.5, shade(skin, -0.1)); // 中指（在後方）
    limb([[-38, -32], [-16, -19]], 26, skin);                     // 手背
    limb([[-16, -26], [1, -19], [4, -5]], 9, skin);               // 食指：指尖壓在紙帶上
    limb([[-26, -12], [-10, -3], [1, -1]], 9, shade(skin, 0.04)); // 拇指
    c.restore();
  }
  /** 碼錶（畫在右上角，不依比例） */
  function drawStopwatch(c) {
    const cal = state.cal, dk = colors.dark;
    const R = A.narrow ? 40 : 50;
    const cx = A.narrow ? A.w - R - 16 : A.w - R - 30, cy = A.narrow ? R + 22 : R + 26;
    // 掛繩孔與按鈕
    LD.block(c, cx - 7, cy - R - 12, 14, 12, colors.metal, { r: 3 });
    LD.block(c, cx + R * 0.62, cy - R * 0.92, 12, 9, colors.metal, { r: 3 });
    // 外殼
    c.save();
    c.shadowColor = dk ? 'rgba(0,0,0,0.55)' : alpha(colors.text, 0.25);
    c.shadowBlur = 10; c.shadowOffsetY = 3;
    const g = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    g.addColorStop(0, shade(colors.neg, dk ? -0.1 : 0.35));
    g.addColorStop(0.75, shade(colors.neg, dk ? -0.35 : -0.05));
    g.addColorStop(1, shade(colors.neg, dk ? -0.55 : -0.3));
    c.fillStyle = g;
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
    c.restore();
    c.strokeStyle = alpha('#ffffff', dk ? 0.15 : 0.4);
    c.lineWidth = 1.2;
    c.beginPath(); c.arc(cx, cy, R - 2, Math.PI * 1.1, Math.PI * 1.65); c.stroke();
    // 液晶螢幕
    const lw = R * 1.5, lh = R * 0.62;
    roundRect(c, cx - lw / 2, cy - lh / 2 + 2, lw, lh, 5);
    const lg = c.createLinearGradient(0, cy - lh / 2, 0, cy + lh / 2);
    lg.addColorStop(0, shade(colors.lcd, 0.06)); lg.addColorStop(1, shade(colors.lcd, -0.06));
    c.fillStyle = lg; c.fill();
    c.strokeStyle = alpha(shade(colors.lcd, -0.5), 0.6); c.lineWidth = 1; c.stroke();
    const tShow = stopwatchShow();
    const mm = Math.floor(tShow / 60), sec = tShow - mm * 60;
    const txt = (mm < 10 ? '0' : '') + mm + ':' + (sec < 10 ? '0' : '') + sec.toFixed(2);
    const mono = 'px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
    let fsz = R * 0.34;
    c.font = '700 ' + fsz.toFixed(1) + mono;
    const tw0 = c.measureText(txt).width;
    if (tw0 > lw - 12) { fsz *= (lw - 12) / tw0; c.font = '700 ' + fsz.toFixed(1) + mono; }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = colors.lcdInk;
    c.fillText(txt, cx, cy + 3);
    LD.haloText(c, T('碼錶', 'Stopwatch'), cx, cy + R + 16, colors.muted, 'center', 'alphabetic', '700 12px ' + FONT);
    if ((cal.phase === 'running' || cal.phase === 'stopping') && tShow > 0) {
      c.fillStyle = colors.pos;
      c.beginPath(); c.arc(cx - lw / 2 + 8, cy - lh / 2 + 9, 2.5, 0, Math.PI * 2); c.fill();
    }
  }

  // ---------- 事件特效 ----------
  function drawFx(c) {
    const now = performance.now();
    state.fx = state.fx.filter(function (e) { return now - e.t0 < e.dur; });
    state.fx.forEach(function (e) {
      const u = (now - e.t0) / e.dur;
      if (e.mode !== state.mode) return;
      const p = e.at();
      LD.ripple(c, p[0], p[1], 10, u, colors.pos);
      LD.ripple(c, p[0], p[1], 5, Math.min(1, u * 1.4), colors.equi);
      if (e.dust) {
        c.fillStyle = alpha(shade(colors.sand, -0.3), 0.6 * (1 - u));
        for (let i = 0; i < 9; i++) {
          const a = Math.PI * (0.1 + 0.8 * i / 8), d = 6 + 26 * u;
          c.beginPath(); c.arc(p[0] + Math.cos(a) * d * 1.4, p[1] - Math.sin(a) * d * 0.8 + 18 * u * u, 1.6, 0, Math.PI * 2); c.fill();
        }
      }
    });
    if (state.fx.length) requestDraw();
  }

  // ======================= ① 計時器校正的運動 =======================
  function calTapeShift() {
    const cal = state.cal;
    if (!cal.pull) return 0;
    const tt = cal.phase === 'running' ? cal.t : cal.T;
    return cal.pull.s(tt);
  }
  /** 已打的點在紙帶上的位置（拉出的長度座標） */
  function calDots() {
    const cal = state.cal, out = [];
    if (!cal.pull) return out;
    const tt = cal.phase === 'running' ? cal.t : cal.T;
    const N = Math.min(20000, FF.dotsInPull(tt, cal.dt, cal.phase0)); // 與記錄時的點數 N 用同一個公式
    for (let j = 0; j < N; j++) out.push(cal.pull.s(cal.phase0 + j * cal.dt));
    return out;
  }
  function stopwatchShow() {
    const cal = state.cal;
    if (cal.phase === 'ready') return 0;
    if (cal.phase === 'done') return cal.last ? cal.last.Tmeas : 0;
    const t = cal.phase === 'running' ? cal.t : cal.t;
    const shown = Math.min(t, cal.phase === 'stopping' ? cal.T + cal.r2 : Infinity) - cal.r1;
    return Math.max(0, Math.floor(shown * 100 + 1e-7) / 100);
  }

  // ======================= 紙帶畫布 =======================
  const tcv = $('tcv');
  const tctx = tcv.getContext('2d');
  let TL = null;
  function tapeHeight(w) {
    const narrow = w < 560;
    if (state.mode === 'calib') {
      const rows = calRows(w).rows;
      return 46 + rows * (narrow ? 30 : 34) + 10;
    }
    return narrow ? 270 : 250;
  }
  function resizeT() {
    if (!tcv.clientWidth) return;
    const w = tcv.clientWidth;
    const s = setupCanvas(tcv, tapeHeight(w));
    TL = { w: w, h: s.h, dpr: s.dpr, narrow: w < 560 };
    drawTape();
  }
  function calRows(w) {
    const cal = state.cal;
    const len = cal.pull && cal.phase !== 'ready' ? calTapeShift() : 0;
    const ppm = w < 560 ? 2000 : 2400; // 放大到點距約 1 cm，數得清楚
    let rowLen = (w - 40) / ppm;
    let rows = Math.max(1, Math.ceil((len + 0.02) / rowLen));
    if (rows > 12) { rows = 12; rowLen = (len + 0.02) / 12; }
    return { rows: rows, rowLen: rowLen, len: len };
  }

  /** 目前紙帶（②③）的分析 */
  function dtUsedFor(rec) {
    if (!rec) return NaN;
    const cm = calMean(rec.snap.timerId);
    if (state.dtSrc === 'cal' || !rec.snap.dtNom) return cm ? cm.dt : NaN;
    return rec.snap.dtNom;
  }
  function readingsFor(rec) {
    const pts = countPts(rec);
    const err = rec.snap.readErr;
    return { pts: pts, xs: FF.readPoints(pts, err ? { sigma: SIGMA, res: RES, seed: rec.seed } : null) };
  }
  function analysisFor(rec) {
    if (!rec || !rec.mo.moves) return null;
    const rd = readingsFor(rec);
    const dtU = dtUsedFor(rec);
    const rows = Math.min(rec.rows, rd.pts.length);
    const an = isFinite(dtU) && rows ? FF.analyze(rd.xs.slice(0, rows), state.n * dtU) : null;
    return { pts: rd.pts, xs: rd.xs, rows: rows, avail: rd.pts.length, dtU: dtU, tau: state.n * dtU, an: an };
  }

  function drawTape() {
    if (!TL) return;
    const want = tapeHeight(tcv.clientWidth);
    if (want !== TL.h) { resizeT(); return; }
    const c = tctx, W = TL.w, H = TL.h;
    c.setTransform(TL.dpr, 0, 0, TL.dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const base = colors['canvas-bg'];
    const bgg = c.createLinearGradient(0, 0, 0, H);
    bgg.addColorStop(0, base);
    bgg.addColorStop(1, shade(base, colors.dark ? -0.25 : -0.04));
    c.fillStyle = bgg;
    roundRect(c, 0, 0, W, H, 8);
    c.fill();
    if (state.mode === 'calib') drawCalTape(c, W, H);
    else drawRunTape(c, W, H);
  }

  function paperStrip(c, x, y, w, h) {
    c.save();
    c.shadowColor = colors.dark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.14)';
    c.shadowBlur = 5; c.shadowOffsetY = 1.5;
    const pg = c.createLinearGradient(0, y, 0, y + h);
    pg.addColorStop(0, shade(colors.paper, 0.15));
    pg.addColorStop(1, colors.paper);
    c.fillStyle = pg;
    c.fillRect(x, y, w, h);
    c.restore();
    c.strokeStyle = alpha(colors.paperEdge, 0.8);
    c.lineWidth = 1;
    c.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
  }

  function drawRunTape(c, W, H) {
    const e = cur(), rec = e.run;
    const fs = TL.narrow ? 10.5 : 11.5;
    const font = '600 ' + fs + 'px ' + FONT;
    const m0 = 12, tapeY = 44, tapeH = TL.narrow ? 24 : 28;
    const D = state.mode === 'incline' ? FF.D_INCLINE : FF.D_FALL;
    const span = D + 0.04;
    const X0 = m0 + 10, kx = (W - 2 * m0 - 20) / span;
    const X = function (x) { return X0 + x * kx; };
    paperStrip(c, m0, tapeY, W - 2 * m0, tapeH);
    const cy = tapeY + tapeH / 2;
    if (!rec) {
      LD.haloText(c, T('放開滑車（或重物）之後，取下的紙帶會出現在這裡', 'The tape appears here after a run'), W / 2, cy, colors.muted, 'center', 'middle', font);
      return;
    }
    const tp = rec.tape;
    // 點
    c.fillStyle = colors.ink;
    c.beginPath();
    c.arc(X(0), cy, 2.8, 0, Math.PI * 2);
    tp.dots.forEach(function (d) { c.moveTo(X(d.x) + 1.6, cy); c.arc(X(d.x), cy, 1.6, 0, Math.PI * 2); });
    if (tp.nEnd > 0 && rec.mo.moves) { c.moveTo(X(tp.D) + 2.8, cy); c.arc(X(tp.D), cy, 2.8, 0, Math.PI * 2); }
    c.fill();
    c.textBaseline = 'middle';
    LD.haloText(c, T('← 起點（放手前的 ', '← start (') + tp.nStack + T(' 點疊在一起）', ' dots on one spot)'), m0, 14, colors.muted, 'left', 'middle', font);
    if (!rec.mo.moves) {
      LD.haloText(c, T('物體沒有動：所有的點都打在同一處', 'The object did not move: every dot is on one spot'), W / 2, tapeY + tapeH + 30, colors.pos, 'center', 'middle', '700 ' + fs + 'px ' + FONT);
      return;
    }
    if (!TL.narrow) LD.haloText(c, T('放手後 ', 'After release: ') + tp.dots.length + T(' 點，每 ', ' dots, one every ') + (rec.snap.dtNom ? '1/' + Math.round(1 / rec.snap.dtNom) + ' s' : 'Δt') + (tp.nEnd ? T('；終點又疊了 ', '; ') + tp.nEnd + T(' 點', ' more at the end') : ''), W - m0, 14, colors.muted, 'right', 'middle', font);
    const A2 = analysisFor(rec);
    const pts = A2.pts;
    // 計數線與標籤
    let lastLx = -1e9;
    pts.forEach(function (q, i) {
      const xx = Math.round(X(q.x)) + 0.5;
      const done = i < A2.rows;
      c.strokeStyle = done ? colors.pos : alpha(colors.pos, 0.55);
      c.lineWidth = done ? 1.6 : 1.1;
      c.setLineDash(done ? [] : [3, 2]);
      c.beginPath(); c.moveTo(xx, tapeY - 5); c.lineTo(xx, tapeY + tapeH + 5); c.stroke();
      c.setLineDash([]);
      const label = i === 0 ? T('第0點', 'dot 0') : String(i * state.n);
      c.font = '700 ' + fs + 'px ' + FONT;
      const lw = c.measureText(label).width;
      if (xx - lw / 2 > lastLx + 4 && xx + lw / 2 < W - 2) {
        LD.haloText(c, label, Math.max(lw / 2 + 2, xx), tapeY - 12, done ? colors.pos : alpha(colors.pos, 0.7), 'center', 'middle', '700 ' + fs + 'px ' + FONT);
        lastLx = xx + lw / 2;
      }
    });
    // 尺：0 對齊第 0 點
    const ry = tapeY + tapeH + 8, rh = TL.narrow ? 22 : 24;
    const x0m = pts.length ? pts[0].x : 0;
    const rx0 = X(x0m - 0.01), rx1 = W - m0;
    LD.block(c, rx0, ry, rx1 - rx0, rh, colors.paper, { r: 3, shadow: true, stroke: alpha(colors.paperEdge, 0.9) });
    c.strokeStyle = alpha(colors.text, 0.6);
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; ; i++) {
      const xx = X(x0m + i * 0.01);
      if (xx > rx1 - 2) break;
      const len = i % 10 === 0 ? 9 : i % 5 === 0 ? 6 : 3.5;
      if (i % 5 !== 0 && kx * 0.01 < 3.2) continue;
      c.moveTo(Math.round(xx) + 0.5, ry); c.lineTo(Math.round(xx) + 0.5, ry + len);
    }
    c.stroke();
    const step = kx * 0.1 < 40 ? 20 : 10;
    for (let i = 0; ; i += step) {
      const xx = X(x0m + i * 0.01);
      if (xx > rx1 - 30) break;
      LD.haloText(c, String(i), xx, ry + rh - 6, alpha(colors.text, 0.8), 'center', 'middle', '600 ' + (fs - 1) + 'px ' + FONT);
    }
    LD.haloText(c, 'cm', rx1 - 4, ry + rh - 6, colors.muted, 'right', 'middle', '600 ' + (fs - 1) + 'px ' + FONT);
    drawMagnifier(c, W, H, ry + rh + 10, A2, rec);
  }

  /** 讀數放大鏡：下一個要記錄的計數點，配毫米刻度 */
  function drawMagnifier(c, W, H, top, A2, rec) {
    const R = { x: 12, y: top, w: W - 24, h: H - top - 8 };
    if (R.h < 60) return;
    const dk = colors.dark;
    roundRect(c, R.x, R.y, R.w, R.h, 10);
    c.fillStyle = alpha(colors.panel, dk ? 0.85 : 0.95);
    c.fill();
    c.strokeStyle = alpha(colors.accent, 0.35);
    c.lineWidth = 1;
    c.stroke();
    const fs = TL.narrow ? 10.5 : 11.5;
    if (!A2.pts.length) {
      LD.haloText(c, T('紙帶太短，沒有計數點：把 n 或第 0 點調小', 'Tape too short for counting points: reduce n or dot 0'), W / 2, R.y + R.h / 2, colors.pos, 'center', 'middle', '600 ' + fs + 'px ' + FONT);
      return;
    }
    const i = Math.min(A2.rows, A2.pts.length - 1);
    const q = A2.pts[i];
    const reading = A2.xs[i];
    const x0 = A2.pts[0].x;
    const field = TL.narrow ? 0.016 : 0.03;      // 放大鏡的視野（m）
    const kz = (R.w - 20) / field;                // px/m
    const cxp = R.x + R.w / 2;
    const X = function (x) { return cxp + (x - q.x) * kz; };
    const ty = R.y + 26, th = TL.narrow ? 22 : 26;
    c.save();
    roundRect(c, R.x + 1, R.y + 1, R.w - 2, R.h - 2, 9);
    c.clip();
    paperStrip(c, R.x - 2, ty, R.w + 4, th);
    // 點（直徑約 0.6 mm 的墨點，略不規則）
    const rr = Math.max(2.5, 0.0003 * kz);
    rec.tape.dots.forEach(function (d) {
      const xx = X(d.x);
      if (xx < R.x - 10 || xx > R.x + R.w + 10) return;
      const g = c.createRadialGradient(xx - rr * 0.3, ty + th / 2 - rr * 0.3, rr * 0.1, xx, ty + th / 2, rr);
      g.addColorStop(0, alpha(colors.ink, 0.75)); g.addColorStop(1, alpha(colors.ink, 1));
      c.fillStyle = g;
      c.beginPath(); c.ellipse(xx, ty + th / 2, rr * 1.05, rr * 0.92, 0.4, 0, Math.PI * 2); c.fill();
    });
    if (X(0) > R.x - 10) { c.fillStyle = colors.ink; c.beginPath(); c.arc(X(0), ty + th / 2, rr * 1.5, 0, Math.PI * 2); c.fill(); }
    // 計數線
    c.strokeStyle = colors.pos;
    c.lineWidth = 1.6;
    A2.pts.forEach(function (p) { const xx = X(p.x); if (xx > R.x && xx < R.x + R.w) { c.beginPath(); c.moveTo(xx, ty - 4); c.lineTo(xx, ty + th + 4); c.stroke(); } });
    // 毫米尺
    const ry = ty + th + 4, rh = Math.min(38, R.y + R.h - ry - 22);
    LD.block(c, R.x - 4, ry, R.w + 8, Math.max(16, rh), colors.paper, { r: 0, shadow: false, stroke: alpha(colors.paperEdge, 0.9) });
    c.strokeStyle = alpha(colors.text, 0.7);
    c.lineWidth = 1;
    c.beginPath();
    const mm0 = Math.floor((q.x - x0 - field / 2) * 1000) - 1, mm1 = Math.ceil((q.x - x0 + field / 2) * 1000) + 1;
    for (let mm = mm0; mm <= mm1; mm++) {
      const xx = Math.round(X(x0 + mm / 1000)) + 0.5;
      const len = mm % 10 === 0 ? 14 : mm % 5 === 0 ? 10 : 6;
      c.moveTo(xx, ry); c.lineTo(xx, ry + len);
    }
    c.stroke();
    for (let mm = Math.ceil(mm0 / 10) * 10; mm <= mm1; mm += 10) {
      if (mm < 0) continue;
      LD.haloText(c, String(mm / 10), X(x0 + mm / 1000), ry + 22, alpha(colors.text, 0.85), 'center', 'middle', '700 ' + fs + 'px ' + FONT);
    }
    // 讀數記號（理想時就在點的中心）
    const rx = X(x0 + reading);
    c.fillStyle = colors.accent;
    c.beginPath(); c.moveTo(rx, ry + 1); c.lineTo(rx - 5, ry - 7); c.lineTo(rx + 5, ry - 7); c.closePath(); c.fill();
    c.restore();
    const real = rec.snap.readErr;
    const lbl = (i === 0 ? T('第 0 點（尺的 0 刻度對準它）', 'Dot 0 (the zero of the ruler is on it)') : T('第 ', 'Dot ') + i * state.n + T(' 點', '')) + T('：', ': ') + 'x = ' + num(reading * 100, real ? 2 : 3) + ' cm';
    LD.haloText(c, T('放大鏡 ', 'Magnifier ') + '· ' + lbl, R.x + 10, R.y + 13, colors.accent, 'left', 'middle', '700 ' + fs + 'px ' + FONT);
    if (!TL.narrow) LD.haloText(c, real ? T('視線垂直尺面，估讀到 0.1 mm', 'Look straight down; estimate to 0.1 mm') : T('理想讀數（沒有誤差）', 'Ideal reading (no error)'), R.x + R.w - 10, R.y + 13, colors.muted, 'right', 'middle', '600 ' + fs + 'px ' + FONT);
    if (i === A2.rows && A2.rows < A2.avail) LD.haloText(c, T('按「記錄」記下這一點', 'Press “Record” to log this dot'), R.x + R.w - 10, R.y + R.h - 10, colors.accent, 'right', 'middle', '600 ' + fs + 'px ' + FONT);
    if (i === 0 && q.x < CLEAR_GAP * 1.2) LD.haloText(c, T('這一點和起點的點痕擠在一起，不容易分辨', 'This dot is crowded against the starting blob'), R.x + 10, R.y + R.h - 10, colors.pos, 'left', 'middle', '600 ' + fs + 'px ' + FONT);
  }

  function drawCalTape(c, W, H) {
    const cal = state.cal;
    const fs = TL.narrow ? 10.5 : 11.5;
    const font = '600 ' + fs + 'px ' + FONT;
    const info = calRows(W);
    const dots = cal.phase === 'ready' ? [] : calDots();
    const n = dots.length;
    LD.haloText(c, n ? T('點痕數 N = ', 'Dots N = ') + n + T('（每 10 點標一個數字，方便數）', ' (every 10th dot is numbered to help counting)') : T('拉動紙帶之後，打了點的紙帶會出現在這裡', 'The dotted tape appears here after you pull it'), 14, 16, n ? colors.text : colors.muted, 'left', 'middle', font);
    const rowH = TL.narrow ? 30 : 34, tapeH = TL.narrow ? 16 : 18;
    const X0 = 20, kx = (W - 40) / info.rowLen;
    for (let r = 0; r < info.rows; r++) {
      const y = 40 + r * rowH;
      const segLen = Math.min(info.rowLen, Math.max(0.02, info.len + 0.02 - r * info.rowLen));
      paperStrip(c, X0 - 6, y, segLen * kx + 12, tapeH);
    }
    if (!n) return;
    const s0 = dots[0] - 0.01;
    c.fillStyle = colors.ink;
    dots.forEach(function (sd, i) {
      const u = sd - s0, r = Math.min(info.rows - 1, Math.floor(u / info.rowLen));
      const xx = X0 + (u - r * info.rowLen) * kx, yy = 40 + r * rowH + tapeH / 2;
      c.fillStyle = colors.ink;
      c.beginPath(); c.arc(xx, yy, (i + 1) % 10 === 0 ? 1.9 : 1.3, 0, Math.PI * 2); c.fill();
      if ((i + 1) % 10 === 0) {
        LD.haloText(c, String(i + 1), xx, yy + tapeH / 2 + 6, colors.accent, 'center', 'middle', '700 ' + (fs - 1.5) + 'px ' + FONT);
      }
    });
  }

  // ======================= 圖表畫布 =======================
  const gcv = $('gcv');
  const gctx = gcv.getContext('2d');
  let GL = null;
  function graphHeight(w) {
    if (state.mode === 'calib') return w < 560 ? 260 : 300;
    return w < 640 ? 4 * 212 + 3 * 10 : 2 * 236 + 12;
  }
  function resizeG() {
    if (!gcv.clientWidth) return;
    const w = gcv.clientWidth;
    const s = setupCanvas(gcv, graphHeight(w));
    GL = { w: w, h: s.h, dpr: s.dpr, narrow: w < 560 };
    drawGraph();
  }

  /** 一張座標圖。o = { title, xl, yl, xMax, yMin, yMax, pts:[[x,y]], color, line:{slope, intercept, color, label}, curve:{f, color}, hline:{y,color,label}, refLine, msg, x0 } */
  function plot(c, R, o) {
    const dk = colors.dark;
    roundRect(c, R.x, R.y, R.w, R.h, 10);
    c.fillStyle = alpha(colors.panel, dk ? 0.6 : 0.85);
    c.fill();
    c.strokeStyle = alpha(colors.text, dk ? 0.12 : 0.09);
    c.lineWidth = 1;
    c.stroke();
    const fs = GL.narrow ? 10.5 : 11;
    LD.haloText(c, o.title, R.x + 12, R.y + 16, colors.text, 'left', 'middle', '700 ' + (fs + 1.5) + 'px ' + FONT);
    const P0 = { x: R.x + 46, y: R.y + 52, w: R.w - 46 - 16, h: R.h - 52 - 36 };
    const x0 = o.x0 || 0;
    const xMax = o.xMax > x0 ? o.xMax : x0 + 1;
    let yMin = o.yMin, yMax = o.yMax;
    if (!(yMax > yMin)) { yMin = 0; yMax = 1; }
    const xs = niceStep((xMax - x0) / (GL.narrow ? 4 : 5)), ys = o.yStep || niceStep((yMax - yMin) / 4);
    yMin = Math.floor(yMin / ys + 1e-9) * ys; yMax = Math.ceil(yMax / ys - 1e-9) * ys;
    const X = function (x) { return P0.x + (x - x0) / (xMax - x0) * P0.w; };
    const Y = function (y) { return P0.y + P0.h - (y - yMin) / (yMax - yMin) * P0.h; };
    // 格線
    c.lineWidth = 1;
    c.strokeStyle = alpha(colors.text, dk ? 0.1 : 0.08);
    c.beginPath();
    for (let v = yMin; v <= yMax + ys * 1e-6; v += ys) { const yy = Math.round(Y(v)) + 0.5; c.moveTo(P0.x, yy); c.lineTo(P0.x + P0.w, yy); }
    for (let v = x0 + xs; v <= xMax + xs * 1e-6; v += xs) { const xx = Math.round(X(v)) + 0.5; c.moveTo(xx, P0.y); c.lineTo(xx, P0.y + P0.h); }
    c.stroke();
    // 軸
    c.strokeStyle = alpha(colors.muted, 0.85);
    c.beginPath();
    const yAx = Y(Math.max(yMin, Math.min(yMax, 0)));
    c.moveTo(P0.x + 0.5, P0.y - 2); c.lineTo(P0.x + 0.5, P0.y + P0.h);
    c.moveTo(P0.x, Math.round(yAx) + 0.5); c.lineTo(P0.x + P0.w + 4, Math.round(yAx) + 0.5);
    c.stroke();
    c.font = '600 ' + (fs - 0.5) + 'px ' + FONT;
    c.fillStyle = colors.muted;
    c.textAlign = 'right'; c.textBaseline = 'middle';
    const dy = decOf(ys), dxx = decOf(xs);
    for (let v = yMin; v <= yMax + ys * 1e-6; v += ys) c.fillText(num(v, dy), P0.x - 5, Y(v));
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let v = x0; v <= xMax + xs * 1e-6; v += xs) c.fillText(num(v, dxx), X(v), P0.y + P0.h + 4);
    c.font = '700 ' + fs + 'px ' + FONT;
    c.fillStyle = colors.text;
    c.textAlign = 'right'; c.textBaseline = 'top';
    c.fillText(o.xl, P0.x + P0.w + 4, P0.y + P0.h + 17);
    c.textAlign = 'left'; c.textBaseline = 'middle';
    LD.haloText(c, o.yl, R.x + 10, R.y + 38, colors.text, 'left', 'middle', '700 ' + fs + 'px ' + FONT);
    c.save();
    c.beginPath(); c.rect(P0.x, P0.y - 6, P0.w + 6, P0.h + 8); c.clip();
    // 理論曲線（虛線）
    if (o.curve) {
      c.strokeStyle = alpha(o.curve.color || colors.muted, 0.85);
      c.lineWidth = 1.6;
      c.setLineDash([5, 4]);
      c.beginPath();
      const N = 80;
      for (let i = 0; i <= N; i++) { const x = (o.curve.from != null ? o.curve.from : x0) + ((o.curve.to != null ? o.curve.to : xMax) - (o.curve.from != null ? o.curve.from : x0)) * i / N; const y = o.curve.f(x); if (i) c.lineTo(X(x), Y(y)); else c.moveTo(X(x), Y(y)); }
      c.stroke();
      c.setLineDash([]);
    }
    if (o.hline) {
      c.strokeStyle = o.hline.color;
      c.lineWidth = 1.4;
      c.setLineDash([2, 3]);
      c.beginPath(); c.moveTo(P0.x, Y(o.hline.y)); c.lineTo(P0.x + P0.w, Y(o.hline.y)); c.stroke();
      c.setLineDash([]);
    }
    if (o.line) {
      c.strokeStyle = o.line.color;
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(X(x0), Y(o.line.intercept + o.line.slope * x0)); c.lineTo(X(xMax), Y(o.line.intercept + o.line.slope * xMax)); c.stroke();
    }
    if (o.quad) {
      c.strokeStyle = o.quad.color;
      c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i <= 60; i++) { const x = x0 + (xMax - x0) * i / 60; const y = o.quad.c0 + o.quad.c1 * x + o.quad.c2 * x * x; if (i) c.lineTo(X(x), Y(y)); else c.moveTo(X(x), Y(y)); }
      c.stroke();
    }
    c.restore();
    // 數據點
    (o.pts || []).forEach(function (p, i) {
      const col = p[2] || o.color;
      LD.ball(c, X(p[0]), Y(p[1]), i === o.latest ? 5 : 4, col, { shadow: true });
    });
    if (o.label) LD.pill(c, o.label, P0.x + 10, P0.y + 14, o.labelColor || colors.text, 'left', '700 ' + fs + 'px ' + FONT);
    if (o.label2) LD.pill(c, o.label2, P0.x + 10, P0.y + 36, colors.muted, 'left', '600 ' + fs + 'px ' + FONT);
    if (o.msg) LD.haloText(c, o.msg, P0.x + P0.w / 2, P0.y + P0.h / 2, colors.muted, 'center', 'middle', '600 ' + fs + 'px ' + FONT);
  }

  function drawGraph() {
    if (!GL) return;
    if (graphHeight(gcv.clientWidth) !== GL.h) { resizeG(); return; }
    const c = gctx, W = GL.w, H = GL.h;
    c.setTransform(GL.dpr, 0, 0, GL.dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    if (state.mode === 'calib') { drawCalGraph(c, W, H); return; }
    const two = W >= 640;
    const gap = two ? 12 : 10;
    const pw = two ? (W - gap) / 2 : W, ph = two ? (H - gap) / 2 : (H - 3 * gap) / 4;
    const R = function (i) { return two ? { x: (i % 2) * (pw + gap), y: Math.floor(i / 2) * (ph + gap), w: pw, h: ph } : { x: 0, y: i * (ph + gap), w: pw, h: ph }; };
    const rec = cur().run;
    const A2 = analysisFor(rec);
    const an = A2 && A2.an;
    const theory = state.showTheory && rec && rec.mo.moves;
    const tTo = rec && rec.mo.moves ? Math.max(0, rec.mo.tEnd - (A2 && A2.pts.length ? A2.pts[0].t : 0)) : 0;
    const t0 = A2 && A2.pts.length ? A2.pts[0].t : 0;
    const mo = rec ? rec.mo : null;
    const tMax = A2 && A2.avail > 1 && isFinite(A2.tau) ? (A2.avail - 1) * A2.tau * 1.04 : 1;
    const noData = !rec ? T('還沒有紙帶', 'No tape yet') : !rec.mo.moves ? T('物體沒有動', 'The object did not move') : !isFinite(A2.dtU) ? T('先在 ① 量出 Δt', 'Measure Δt in Part 1 first') : T('按「記錄」把第 0 點記進表格', 'Press “Record” to log dot 0');
    // x–t
    const pX = an ? an.t.map(function (t, i) { return [t, an.x[i] * 100]; }) : [];
    const xEnd = A2 && A2.avail ? (A2.xs[A2.avail - 1] || 0) * 100 : 1;
    plot(c, R(0), {
      title: T('x–t 圖（位置）', 'x–t graph (position)'), xl: 't (s)', yl: 'x (cm)', xMax: tMax, yMin: 0, yMax: Math.max(1, xEnd * 1.05),
      pts: pX, color: colors.accent, latest: pX.length - 1,
      quad: an && an.xfit ? { c0: an.xfit.c0 * 100, c1: an.xfit.c1 * 100, c2: an.xfit.c2 * 100, color: alpha(colors.accent, 0.7) } : null,
      curve: theory ? { f: function (t) { return (FF.xAt(mo, Math.min(t0 + t, mo.tEnd)) - FF.xAt(mo, t0)) * 100; }, color: colors.muted, from: 0, to: tTo } : null,
      label: an && an.xfit ? T('二次曲線：a = 2 × ', 'parabola: a = 2 × ') + num(an.xfit.c2 * 100, 1) + ' = ' + num(2 * an.xfit.c2 * 100, 1) + ' cm/s²' : null,
      labelColor: colors.accent,
      msg: pX.length ? null : noData
    });
    // v–t
    const pV = an ? an.v.map(function (v, i) { return [an.tv[i], v * 100]; }) : [];
    let vMax = 1;
    if (A2 && A2.avail > 1) for (let i = 0; i + 1 < A2.avail; i++) vMax = Math.max(vMax, (A2.xs[i + 1] - A2.xs[i]) / A2.tau * 100);
    const vf = an && an.vfit;
    plot(c, R(1), {
      title: T('v–t 圖（平均速度畫在中點時刻）', 'v–t graph (average velocity at mid-time)'), xl: 't (s)', yl: 'v (cm/s)', xMax: tMax, yMin: 0, yMax: vMax * 1.08,
      pts: pV, color: colors.pos, latest: pV.length - 1,
      line: vf ? { slope: vf.slope * 100, intercept: vf.intercept * 100, color: colors.pos } : null,
      curve: theory ? { f: function (t) { return FF.vAt(mo, Math.min(t0 + t, mo.tEnd)) * 100; }, color: colors.muted, from: 0, to: tTo } : null,
      label: vf ? T('斜率 = 加速度 a = ', 'slope = acceleration a = ') + num(vf.slope * 100, 1) + ' cm/s²' : null,
      label2: vf ? T('截距 = 第 0 點的速度 ', 'intercept = velocity at dot 0: ') + num(vf.intercept * 100, 1) + ' cm/s' : null,
      labelColor: colors.pos,
      msg: pV.length ? null : (an ? T('記錄兩點以上，才算得出平均速度', 'Log at least two dots to get a velocity') : noData)
    });
    // a–t
    const pA = an ? an.a.map(function (a, i) { return [an.ta[i], a * 100]; }) : [];
    let aHi = 0;
    pA.forEach(function (p) { aHi = Math.max(aHi, p[1]); });
    if (rec && rec.mo.moves) aHi = Math.max(aHi, FF.aAt(rec.mo, t0) * 100);
    if (!(aHi > 0)) aHi = 100;
    let aLo = 0;
    pA.forEach(function (p) { aLo = Math.min(aLo, p[1]); });
    plot(c, R(2), {
      title: T('a–t 圖（平均加速度）', 'a–t graph (average acceleration)'), xl: 't (s)', yl: 'a (cm/s²)', xMax: tMax, yMin: aLo, yMax: aHi * 1.25,
      pts: pA, color: colors['b-em'], latest: pA.length - 1,
      hline: an && pA.length ? { y: an.aMean * 100, color: colors['b-em'] } : null,
      curve: theory ? { f: function (t) { return FF.aAt(mo, Math.min(t0 + t, mo.tEnd)) * 100; }, color: colors.muted, from: 0, to: tTo } : null,
      label: pA.length ? T('平均 ā = ', 'mean ā = ') + num(an.aMean * 100, 1) + ' cm/s²' : null,
      labelColor: colors['b-em'],
      msg: pA.length ? null : (an ? T('記錄三點以上，才算得出平均加速度', 'Log at least three dots to get an acceleration') : noData)
    });
    // a–sinθ
    const S = state.summary;
    const pS = S.map(function (p) { return [p.sin, p.a, p.mode === 'fall' ? colors.pos : colors.accent]; });
    const fit = sumFit();
    let sHi = 10, sLo = 0;
    S.forEach(function (p) { sHi = Math.max(sHi, p.a * 1.02); sLo = Math.min(sLo, p.a); });
    plot(c, R(3), {
      title: T('a–sinθ 圖（各次實驗）', 'a–sinθ graph (all runs)'), xl: 'sinθ', yl: 'a (m/s²)', xMax: 1.04, yMin: sLo, yMax: sHi, yStep: sHi <= 12 && sLo >= -2 ? 2 : 0,
      pts: pS, color: colors.accent, latest: pS.length - 1,
      curve: { f: function (s) { return G * s; }, color: colors.muted, from: 0, to: 1 },
      line: fit ? { slope: fit.slope, intercept: fit.intercept, color: colors.equi } : null,
      label: fit ? T('斜率 = ', 'slope = ') + num(fit.slope, 3) + ' m/s²' : T('虛線：a = g sinθ', 'dashed: a = g sinθ'),
      labelColor: fit ? colors.equi : colors.muted,
      label2: fit ? T('截距 = ', 'intercept = ') + num(fit.intercept, 3) + ' m/s²' : null,
      msg: S.length ? null : T('記錄完一整張表，這次的 a 會加進來', 'Complete a table to add its a here')
    });
  }
  function drawCalGraph(c, W, H) {
    const tr = calTrials();
    const pts = tr.map(function (q) { return [q.T, q.dt * 1000]; });
    let lo = Infinity, hi = -Infinity;
    pts.forEach(function (p) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); });
    const ref = state.freq ? 1000 / state.freq : NaN;
    if (isFinite(ref)) { lo = Math.min(lo, ref); hi = Math.max(hi, ref); }
    if (!isFinite(lo)) { lo = 0; hi = 50; }
    const pad = Math.max((hi - lo) * 0.3, 0.02 * hi, 0.05);
    let tMax = 6;
    tr.forEach(function (q) { tMax = Math.max(tMax, q.T * 1.1); });
    const cm = calMean(state.timerId);
    plot(c, { x: 0, y: 0, w: W, h: H }, {
      title: T('各次量得的 Δt（拉得愈久，愈接近真實值）', 'Δt from each pull (longer pulls are closer to the true value)'), xl: T('碼錶時間 T (s)', 'stopwatch time T (s)'), yl: 'Δt (ms)',
      xMax: tMax, yMin: Math.max(0, lo - pad), yMax: hi + pad, pts: pts, color: colors.accent, latest: pts.length - 1,
      hline: isFinite(ref) ? { y: ref, color: colors.muted } : null,
      label: cm ? T('平均 Δt = ', 'mean Δt = ') + num(cm.dt * 1000, 3) + ' ms' : null, labelColor: colors.accent,
      label2: isFinite(ref) ? T('虛線：標示值 1/f = ', 'dashed: rated 1/f = ') + num(ref, 3) + ' ms' : T('頻率未知：沒有標示值可比較', 'Unknown frequency: no rated value'),
      msg: pts.length ? null : T('拉完紙帶後按「記錄」，這一次的 Δt 會畫在這裡', 'Pull the tape, then press “Record” to plot its Δt')
    });
  }

  // ======================= 數據表 =======================
  function setHTML(id, html) {
    const el = $(id);
    if (el && el.__html !== html) { el.innerHTML = html; el.__html = html; }
  }
  function updateTable() {
    if (state.mode === 'calib') { calTable(); return; }
    const rec = cur().run;
    const A2 = analysisFor(rec);
    const real = rec && rec.snap.readErr;
    const head = '<thead><tr><th>' + T('計數點', 'Dot') + '</th><th>' + T('時間', 'Time') + ' t<small>(s)</small></th><th>' + T('位置', 'Position') + ' x<small>(cm)</small></th><th>' + T('位移', 'Displacement') + ' Δx<small>(cm)</small></th><th>' + T('平均速度', 'Avg. velocity') + ' v̄<small>(cm/s)</small></th><th>' + T('平均加速度', 'Avg. accel.') + ' ā<small>(cm/s<sup>2</sup>)</small></th></tr></thead>';
    if (!A2 || !A2.an) {
      const msg = !rec ? T('還沒有紙帶。先做實驗，再把紙帶上的點記錄到這裡。', 'No tape yet. Do a run first, then log the dots here.')
        : !rec.mo.moves ? T('物體沒有動，紙帶上沒有可以分析的點。', 'The object did not move; there is nothing to analyse.')
          : !isFinite(A2.dtU) ? T('不知道相鄰兩點的時間 Δt：先到 ① 量出這台計時器的 Δt 並記錄。', 'The time between dots Δt is unknown: measure it in Part 1 and record it first.')
            : T('按「記錄」，從第 0 點開始依序記下各計數點的時間與位置。', 'Press “Record” to log the time and position of each counting dot, starting with dot 0.');
      setHTML('tbl', head + '<tbody><tr class="empty"><td colspan="6">' + msg + '</td></tr></tbody>');
      return;
    }
    const an = A2.an, n = an.n;
    const dX = real ? 2 : 3;
    const rows = [];
    for (let i = 0; i < 2 * n; i++) rows.push('');
    for (let p = 0; p < n; p++) {
      const r0 = 2 * p, r1 = 2 * p + 1;
      rows[r0] += '<th rowspan="2">' + T('第 ', '') + p * state.n + T(' 點', '') + '</th><td rowspan="2">' + num(an.t[p], 4) + '</td><td rowspan="2">' + num(an.x[p] * 100, dX) + '</td>';
      if (p === 0) rows[r0] += '<td class="gap"></td><td class="gap"></td>';
      if (p >= 1 && p - 1 < an.a.length) rows[r0] += '<td rowspan="2" class="acc">' + num(an.a[p - 1] * 100, 1) + '</td>';
      else rows[r0] += '<td rowspan="2" class="gap"></td>';
      if (p < n - 1) rows[r1] += '<td rowspan="2" class="mid">' + num(an.dx[p] * 100, dX) + '</td><td rowspan="2" class="mid">' + num(an.v[p] * 100, 1) + '</td>';
      else rows[r1] += '<td class="gap"></td><td class="gap"></td>';
    }
    let body = '<tbody>' + rows.map(function (r, i) { return '<tr' + (i >= 2 * n - 2 ? ' class="latest"' : '') + '>' + r + '</tr>'; }).join('') + '</tbody>';
    const foot = '<tfoot><tr><td colspan="6">' + T('已記錄 ', 'Logged ') + n + ' / ' + A2.avail + T(' 個計數點', ' counting dots') + T('　', '   ') + 'τ = ' + state.n + ' × Δt = ' + num(A2.tau, 4) + ' s' +
      (A2.avail >= MAX_ROWS ? T('（表格最多 30 點）', ' (table limited to 30 dots)') : '') + '</td></tr></tfoot>';
    setHTML('tbl', head + body + foot);
  }
  /** 這台計時器的校正是不是每一次都含碼錶反應時間 */
  function calReactFor(timerId) {
    const tr = state.cal.trials.filter(function (q) { return q.timerId === timerId; });
    return tr.length > 0 && tr.every(function (q) { return q.react; });
  }
  function calTrials() { return state.cal.trials.filter(function (q) { return q.timerId === state.timerId; }); }
  function calMean(timerId) {
    const tr = state.cal.trials.filter(function (q) { return q.timerId === timerId; });
    if (!tr.length) return null;
    let s = 0;
    tr.forEach(function (q) { s += q.dt; });
    return { dt: s / tr.length, n: tr.length };
  }
  function calTable() {
    const tr = calTrials();
    const head = '<thead><tr><th>' + T('次', 'Trial') + '</th><th>' + T('碼錶時間', 'Stopwatch') + ' T<small>(s)</small></th><th>' + T('點痕數', 'Dots') + ' N</th><th>N − 1</th><th>Δt = T/(N − 1)<small>(s)</small></th><th>f = 1/Δt<small>(Hz)</small></th></tr></thead>';
    if (!tr.length) {
      setHTML('tbl', head + '<tbody><tr class="empty"><td colspan="6">' + T('拉完紙帶後按「記錄」，把這一次的 T 與 N 填進表格。', 'After a pull, press “Record” to enter its T and N.') + '</td></tr></tbody>');
      return;
    }
    const body = '<tbody>' + tr.map(function (q, i) {
      return '<tr' + (i === tr.length - 1 ? ' class="latest"' : '') + '><th>' + (i + 1) + '</th><td>' + num(q.T, 2) + '</td><td>' + q.N + '</td><td>' + (q.N - 1) + '</td><td>' + num(q.dt, 5) + '</td><td>' + num(1 / q.dt, 2) + '</td></tr>';
    }).join('') + '</tbody>';
    const cm = calMean(state.timerId);
    const foot = '<tfoot><tr><td colspan="6">' + T('平均 Δt = ', 'Mean Δt = ') + num(cm.dt, 5) + ' s' + T('　', '   ') + 'f = ' + num(1 / cm.dt, 2) + ' Hz</td></tr></tfoot>';
    setHTML('tbl', head + body + foot);
  }

  // ======================= 讀數卡片 =======================
  function updateReadouts() {
    updateTable();
    updateSteps();
    if (state.mode === 'calib') { calReadout(); updateButtons(); return; }
    const rec = cur().run;
    const A2 = analysisFor(rec);
    const an = A2 && A2.an;
    const fall = state.mode === 'fall';
    let h = '';
    const row = function (dt, dd) { h += '<dt>' + dt + '</dt><dd>' + dd + '</dd>'; };
    if (!rec) h = '<dd class="note">' + T('做完一次實驗後，這裡會顯示由紙帶算出的結果。', 'Results from the tape appear here after a run.') + '</dd>';
    else if (!rec.mo.moves) h = '<dd class="warn">' + (fall ? T('重物沒有落下：紙帶的摩擦力大於重量。', 'The weight did not fall: the tape friction exceeds its weight.') : T('滑車沒有滑動：重力沿斜面的分量不大於摩擦力，把軌道墊高一點。', 'The cart did not move: gravity along the track is not larger than friction. Raise the track.')) + '</dd>';
    else {
      const src = state.dtSrc === 'cal' || !rec.snap.dtNom ? T('（步驟①）', ' (Part 1)') : T('（標示值）', ' (rated)');
      row(T('相鄰兩點的時間 Δt', 'Time between dots Δt'), isFinite(A2.dtU) ? num(A2.dtU, 5) + ' s<small>' + src + '</small>' : '—');
      row(T('計數點的間隔 τ = nΔt', 'Counting interval τ = nΔt'), isFinite(A2.tau) ? num(A2.tau, 4) + ' s' : '—');
      row(T('已記錄的計數點', 'Dots logged'), A2.rows + ' / ' + A2.avail);
      if (an && an.vfit) {
        row(T('v–t 圖斜率（加速度 a）', 'Slope of v–t (acceleration a)'), num(an.vfit.slope, 3) + MS2 + '<small>' + num(an.vfit.slope * 100, 1) + CMS2 + '</small>');
        row(T('v–t 圖截距（第 0 點的速度）', 'Intercept (velocity at dot 0)'), num(an.vfit.intercept * 100, 1) + ' cm/s');
        if (an.a.length) row(T('平均加速度的平均 ā', 'Mean of the average accelerations ā'), num(an.aMean, 3) + MS2);
        const sin = rec.snap.sin;
        const acc = G * sin;
        if (fall) {
          row(T('量得的 g', 'Measured g'), num(an.vfit.slope, 3) + MS2);
          row(T('與公認值 9.8 的誤差', 'Error against 9.8'), pct(FF.percentError(an.vfit.slope, G)));
        } else {
          row(T('推算 g = a / sinθ', 'Inferred g = a / sinθ'), num(an.vfit.slope / sin, 3) + MS2);
          row(T('與 g sinθ = ', 'Error against g sinθ = ') + num(acc, 3) + T(' 的誤差', ''), pct(FF.percentError(an.vfit.slope, acc)));
        }
        const dtT = rec.snap.dtTrue;
        if (isFinite(A2.dtU) && Math.abs(A2.dtU - dtT) / dtT > 1e-6 && state.dtSrc === 'cal') h += '<dd class="note">' + T('用的是量得的 Δt（與真實值差 ', 'Using the measured Δt (off by ') + pct(FF.percentError(A2.dtU, dtT)) + T('），加速度的誤差約為它的 −2 倍。', '); the error in a is about −2 times that.') + '</dd>';
      } else if (!isFinite(A2.dtU)) h += '<dd class="warn">' + T('這台計時器的頻率未知：先到 ① 量出 Δt 並按「記錄」。', 'This timer’s frequency is unknown: measure Δt in Part 1 and record it.') + '</dd>';
      else h += '<dd class="note">' + T('記錄兩點以上就有 v–t 圖與加速度。', 'Log two or more dots to get the v–t graph and the acceleration.') + '</dd>';
    }
    setHTML('resOut', h);
    // 理論值
    h = '';
    const sn = rec ? rec.snap : snapNow();
    const Fz = FF.forces(sn.params);
    if (fall) {
      row(T('重力加速度 g', 'Gravity g'), num(G, 2) + MS2);
      row(T('紙帶摩擦造成的減速 f/m', 'Slowing by tape friction f/m'), num(sn.params.f / sn.params.m, 3) + MS2);
      row(T('理論加速度 a = g − f/m', 'Theory a = g − f/m'), (Fz.moves ? num(Fz.g0, 3) : '0') + MS2);
    } else {
      row('sinθ = h/L', num(Fz.sin, 4) + '<small>θ = ' + num(Fz.theta * 180 / Math.PI, 2) + '°</small>');
      row(T('無摩擦 g sinθ', 'Frictionless g sinθ'), num(Fz.gPar, 3) + MS2);
      row(T('軌道摩擦 μg cosθ', 'Track friction μg cosθ'), num(sn.params.mu * G * Fz.cos, 3) + MS2);
      row(T('紙帶摩擦 f/M', 'Tape friction f/M'), num(sn.params.f / sn.params.m, 3) + MS2);
      row(T('理論加速度 a', 'Theory a'), (Fz.moves ? num(Fz.g0, 3) : '0') + MS2);
    }
    if (sn.params.k > 0 && Fz.moves) row(T('空氣阻力：終端速度 v<sub>T</sub>', 'Air resistance: terminal speed v<sub>T</sub>'), num(Fz.vT, 1) + ' m/s');
    if (rec && rec.mo.moves) row(fall ? T('落到沙箱的時間、速率', 'Time and speed at landing') : T('撞到擋板的時間、速率', 'Time and speed at the end stop'), num(rec.mo.tEnd, 3) + ' s<small>' + num(rec.mo.vEnd, 3) + ' m/s</small>');
    setHTML('thOut', h);
    $('theoryTitle').textContent = rec ? T('理論值（這條紙帶的條件）', 'Theory (conditions of this tape)') : T('理論值（目前的設定）', 'Theory (current settings)');
    // a–sinθ
    h = '';
    const S = state.summary, fit = sumFit();
    row(T('數據點', 'Points'), String(S.length));
    if (fit) {
      row(T('斜率', 'Slope'), num(fit.slope, 3) + MS2);
      row(T('截距', 'Intercept'), num(fit.intercept, 3) + MS2);
      row(T('斜率與 g 的誤差', 'Slope against g'), pct(FF.percentError(fit.slope, G)));
    } else if (S.length) h += '<dd class="note">' + T('再用一個不同的高度差（或自由落體）做一次，就有最佳直線。', 'One more run at a different height (or a free fall) gives the best-fit line.') + '</dd>';
    setHTML('sumOut', h);
    updateButtons();
  }
  function calReadout() {
    const cal = state.cal, last = cal.last;
    let h = '';
    const row = function (dt, dd) { h += '<dt>' + dt + '</dt><dd>' + dd + '</dd>'; };
    const dtT = dtTrueNow();
    row(T('計時器', 'Timer'), state.freq ? state.freq + ' Hz' : T('頻率未知', 'unknown frequency'));
    if (last) {
      row(T('碼錶時間 T', 'Stopwatch time T'), num(last.Tmeas, 2) + ' s');
      row(T('點痕數 N', 'Dots N'), String(last.N));
      row('Δt = T/(N − 1)', num(last.dt, 5) + ' s');
      row('f = 1/Δt', num(1 / last.dt, 2) + ' Hz');
      if (state.freq) row(T('與標示值 1/f 的誤差', 'Error against the rated 1/f'), pct(FF.percentError(last.dt, dtT)));
      if (last.react) h += '<dd class="note">' + T('實際拉了 ', 'Actually pulled for ') + num(last.T, 3) + T(' s；碼錶慢了 ', ' s; the stopwatch started ') + num(last.r1, 2) + T(' s 才按下、慢了 ', ' s late and stopped ') + num(last.r2, 2) + T(' s 才停。', ' s late.') + '</dd>';
      if (!last.recorded) h += '<dd class="ok">' + T('按「記錄」把這一次填進表格。', 'Press “Record” to enter this pull in the table.') + '</dd>';
    } else h += '<dd class="note">' + T('按「開始拉紙帶」：計時器、拉紙帶與碼錶同時開始；按「停止」三者同時停止。', 'Press “Start pulling”: the timer, the pull and the stopwatch start together; “Stop” stops all three.') + '</dd>';
    const cm = calMean(state.timerId);
    if (cm) {
      row(T('已記錄次數', 'Pulls recorded'), String(cm.n));
      row(T('平均 Δt', 'Mean Δt'), num(cm.dt, 5) + ' s<small>f = ' + num(1 / cm.dt, 2) + ' Hz</small>');
    }
    setHTML('calOut', h);
  }

  // ======================= 步驟清單 =======================
  const STEPS = {
    calib: [
      ['啟動計時器、開始拉紙帶，同時按下碼錶', 'Start the timer, pull the tape and start the stopwatch together'],
      ['拉一段時間後按「停止」，讀出碼錶的時間 T', 'After a while press “Stop” and read the stopwatch time T'],
      ['數出點痕數 N，按「記錄」算出 Δt = T/(N − 1)', 'Count the dots N and press “Record”: Δt = T/(N − 1)'],
      ['再做幾次（拉久一點），取平均', 'Repeat a few times (pull longer) and average']
    ],
    incline: [
      ['調整高度差 h，把軌道架成斜面', 'Set the height difference h to make the incline'],
      ['啟動打點計時器', 'Switch on the ticker timer'],
      ['放開滑車，讓它滑到擋板', 'Let go of the cart and let it run to the end stop'],
      ['選定第 0 點，每隔 n 個點畫一條線', 'Choose dot 0 and draw a line every n dots'],
      ['按「記錄」記下各點的 t、x → x–t 圖', 'Press “Record” to log t and x of each dot → x–t graph'],
      ['各段位移 ÷ τ ＝ 平均速度 → v–t 圖', 'Displacement ÷ τ = average velocity → v–t graph'],
      ['相鄰速度差 ÷ τ ＝ 平均加速度 → a–t 圖', 'Change of velocity ÷ τ = average acceleration → a–t graph']
    ],
    fall: [
      ['把計時器垂直架好，紙帶下端接上重物', 'Clamp the timer upright and hang the weight from the tape'],
      ['啟動打點計時器', 'Switch on the ticker timer'],
      ['放開重物，讓它落到沙箱', 'Let go of the weight and let it fall into the sand'],
      ['選定第 0 點，每隔 n 個點畫一條線', 'Choose dot 0 and draw a line every n dots'],
      ['按「記錄」記下各點的 t、y → y–t 圖', 'Press “Record” to log t and y of each dot → y–t graph'],
      ['各段位移 ÷ τ ＝ 平均速度 → v–t 圖', 'Displacement ÷ τ = average velocity → v–t graph'],
      ['相鄰速度差 ÷ τ ＝ 平均加速度 → a–t 圖', 'Change of velocity ÷ τ = average acceleration → a–t graph']
    ]
  };
  function stepIndex() {
    if (state.mode === 'calib') {
      const cal = state.cal;
      if (cal.phase === 'ready') return calTrials().length ? 3 : 0;
      if (cal.phase === 'running') return 1;
      if (cal.phase === 'stopping') return 1;
      return cal.last && !cal.last.recorded ? 2 : 3;
    }
    const e = cur();
    if (e.phase === 'ticking') return 2;
    if (e.phase === 'running' || e.phase === 'after') return 2;
    if (e.phase === 'ready' && !e.run) return 1;
    const A2 = analysisFor(e.run);
    if (!A2 || !e.run.mo.moves) return 1;
    if (A2.rows === 0) return 3;
    if (A2.rows < 2) return 4;
    if (A2.rows < 3) return 5;
    if (A2.rows < A2.avail) return 6;
    return 7;
  }
  function updateSteps() {
    const list = STEPS[state.mode], now = stepIndex();
    const html = list.map(function (s, i) { return '<li class="' + (i < now ? 'done' : i === now ? 'now' : '') + '">' + T(s[0], s[1]) + '</li>'; }).join('');
    setHTML('steps', html);
    let note = '';
    if (state.mode !== 'calib' && !state.freq && !calMean(state.timerId)) note = T('這台計時器的頻率未知，請先做 ①。', 'This timer’s frequency is unknown — do Part 1 first.');
    else if (state.mode !== 'calib' && now >= 7) note = T('完成了！換一個高度差或做自由落體，比較 a–sinθ 圖。', 'Done! Try another height or the free fall and compare them in the a–sinθ graph.');
    else if (state.mode === 'calib') note = T('計時器頻率已知時，① 是用來驗證標示值；選「未知」時就一定要先做 ①。', 'With a known frequency Part 1 checks the rated value; with the “Unknown” timer it is required.');
    $('stepNote').textContent = note;
  }

  // ======================= 音效（sound.js；音效關閉時完全不呼叫） =======================
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  let lastClickAt = -1;
  function tickSound() {
    const S = sound(); if (!S) return;
    const now = performance.now();
    if (now - lastClickAt < 45) return; // 每秒最多約 20 聲（點太密時只取樣）
    lastClickAt = now;
    S.tone({ freq: 2300, dur: 0.012, type: 'square', gain: 0.13 });
    S.noise({ dur: 0.008, gain: 0.1, filter: 4200, q: 1.2 });
  }
  function thudSound(v, sand) {
    const S = sound(); if (!S) return;
    const k = Math.max(0.3, Math.min(1, v / 3));
    if (sand) {
      S.noise({ dur: 0.16, gain: 0.55 * k, filter: 900, q: 0.6 });
      S.tone({ freq: 280, dur: 0.12, type: 'sine', gain: 0.4 * k });
    } else {
      S.noise({ dur: 0.07, gain: 0.5 * k, filter: 1400, q: 0.9 });
      S.tone({ freq: 420, dur: 0.1, type: 'triangle', gain: 0.4 * k });
      S.tone({ freq: 760, dur: 0.05, type: 'triangle', gain: 0.2 * k, delay: 0.004 });
    }
  }
  function beepSound(hi) {
    const S = sound(); if (!S) return;
    S.tone({ freq: hi ? 2700 : 2200, dur: 0.07, type: 'square', gain: 0.18 });
  }

  // ======================= 任務模式（missions.js） =======================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function recordData(rec) {
    const A2 = analysisFor(rec), an = A2 && A2.an, s = rec.snap;
    const first = A2 && A2.pts.length ? A2.pts[0] : null;
    return {
      mode: s.mode, ideal: s.ideal, readErr: s.readErr, h: s.h, sin: s.sin, mass: s.params.m, mu: s.params.mu, f: s.params.f, k: s.params.k,
      freq: s.freq, timerId: s.timerId, dtTrue: s.dtTrue, dtUsed: A2 ? A2.dtU : NaN, dtSrc: state.dtSrc === 'cal' || !s.dtNom ? 'cal' : 'nom',
      dtErrPct: A2 && isFinite(A2.dtU) ? FF.percentError(A2.dtU, s.dtTrue) : NaN,
      n: state.n, j0: state.j0, tau: A2 ? A2.tau : NaN, rows: A2 ? A2.rows : 0, avail: A2 ? A2.avail : 0,
      complete: !!(A2 && A2.avail >= 3 && A2.rows === A2.avail),
      aFit: an && an.vfit ? an.vfit.slope : NaN, intercept: an && an.vfit ? an.vfit.intercept : NaN,
      aMean: an && an.a.length ? an.aMean : NaN, aFirst: an && an.a.length ? an.a[0] : NaN, aLast: an && an.a.length ? an.a[an.a.length - 1] : NaN, nA: an ? an.a.length : 0,
      aQuad: an && an.xfit ? 2 * an.xfit.c2 : NaN,
      gEst: an && an.vfit ? an.vfit.slope / s.sin : NaN,
      errPct: an && an.vfit ? FF.percentError(an.vfit.slope, G * s.sin) : NaN,
      aTheory: rec.mo.moves ? rec.mo.g0 : 0,
      x0: first ? first.x : NaN, clear0: !!(first && first.x >= CLEAR_GAP),
      runId: rec.id, calReact: calReactFor(s.timerId)
    };
  }
  function emitRecord() {
    const rec = cur().run;
    if (rec && rec.mo.moves) emit('record', recordData(rec));
  }

  // ======================= 實驗流程 =======================
  function setStatus(msg) { $('status').textContent = msg || ''; }
  function goLabel() {
    if (state.mode === 'calib') {
      return { ready: T('開始拉紙帶（同時按碼錶）', 'Start pulling (and the stopwatch)'), running: T('停止', 'Stop'), stopping: T('停止', 'Stop'), done: T('再拉一次', 'Pull again') }[state.cal.phase];
    }
    const fall = state.mode === 'fall';
    return {
      ready: T('啟動打點計時器', 'Switch on the timer'),
      ticking: fall ? T('放開重物', 'Let go of the weight') : T('放開滑車', 'Let go of the cart'),
      running: T('跑動中……', 'Moving…'), after: T('跑動中……', 'Moving…'),
      done: fall ? T('掛回重物（換新紙帶）', 'Hang the weight again (new tape)') : T('放回滑車（換新紙帶）', 'Put the cart back (new tape)')
    }[cur().phase];
  }
  function updateButtons() {
    const go = $('go');
    go.textContent = goLabel();
    const e = state.mode === 'calib' ? null : cur();
    go.disabled = !!(e && (e.phase === 'running' || e.phase === 'after')) || state.cal.phase === 'stopping' && state.mode === 'calib';
    const rec = $('rec'), all = $('recAll'), undo = $('undoRow');
    if (state.mode === 'calib') {
      rec.textContent = T('記錄這一次', 'Record this pull');
      rec.disabled = !(state.cal.phase === 'done' && state.cal.last && !state.cal.last.recorded && state.cal.last.N >= 2);
      all.hidden = true;
      undo.textContent = T('刪除最後一次', 'Delete the last pull');
      undo.disabled = !calTrials().length;
    } else {
      const A2 = analysisFor(cur().run);
      const can = !!(A2 && isFinite(A2.dtU) && A2.rows < A2.avail);
      rec.textContent = A2 && A2.rows < A2.avail ? T('記錄', 'Record') + (A2.rows === 0 ? T('第 0 點', ' dot 0') : T('第 ', ' dot ') + A2.rows * state.n + T(' 點', '')) : T('記錄', 'Record');
      rec.disabled = !can;
      all.hidden = false;
      all.disabled = !can;
      undo.textContent = T('刪除最後一列', 'Delete the last row');
      undo.disabled = !(A2 && A2.rows > 0);
    }
    $('undoSum').disabled = !state.summary.length;
    updateAria();
  }

  // ---------- 畫布的文字說明（螢幕閱讀器用；實驗階段或參數改變時更新，不是每格動畫） ----------
  function setAria(el, text) { if (el.getAttribute('aria-label') !== text) el.setAttribute('aria-label', text); }
  function phaseText() {
    if (state.mode === 'calib') {
      const c = state.cal;
      if (c.phase === 'running' || c.phase === 'stopping') return T('正在拉紙帶。', 'The tape is being pulled.');
      if (c.phase === 'done' && c.last) return T('已拉完：碼錶 T = ', 'Pull finished: stopwatch T = ') + num(c.last.Tmeas, 2) + T(' s，點痕 N = ', ' s, dots N = ') + c.last.N + T('。', '.');
      return T('準備好了。', 'Ready.');
    }
    const p = cur().phase;
    if (p === 'ticking') return T('計時器正在打點，物體還沒放開。', 'The timer is ticking; the object has not been released.');
    if (p === 'running' || p === 'after') return T('物體正在運動。', 'The object is moving.');
    if (p === 'done') return T('跑完了，紙帶已取下。', 'Run finished; the tape has been taken off.');
    return T('準備好了。', 'Ready.');
  }
  function updateAria() {
    const m = state.mode;
    const timer = (state.freq ? state.freq + ' Hz ' : T('頻率未知的', 'unknown-frequency ')) + T('打點計時器', 'ticker timer');
    let a;
    if (m === 'calib') a = T('實驗裝置圖（① 計時器的時距）：用手拉紙帶穿過', 'Apparatus (Part 1, timer interval): a tape pulled by hand through the ') + timer + T('，旁邊是碼錶。', ', with a stopwatch. ');
    else if (m === 'incline') a = T('實驗裝置圖（② 斜面）：長 1.20 m 的軌道，兩端高度差 ', 'Apparatus (Part 2, incline): a 1.20 m track whose ends differ in height by ') + num(state.h * 100, 1) + T(' cm（θ = ', ' cm (θ = ') + num(Math.asin(state.h / L) * 180 / Math.PI, 2) + T('°），', '°); a ') + num(state.M, 2) + T(' kg 的滑車拖著紙帶穿過', ' kg cart pulls the tape through the ') + timer + T('。', '. ');
    else a = T('實驗裝置圖（③ 自由落體）：垂直架設的', 'Apparatus (Part 3, free fall): an upright ') + timer + T('，紙帶下端接 ', ' with a ') + num(state.m, 2) + T(' kg 的重物，落下 90 cm 到沙箱。', ' kg weight on the tape, falling 90 cm into a sand tray. ');
    setAria(cv, a + phaseText());
    // 紙帶
    let t;
    if (m === 'calib') {
      const c = state.cal;
      t = T('拉出來的紙帶：', 'The pulled tape: ') + (c.last ? T('共 ', '') + c.last.N + T(' 個點痕，間距不均勻。', ' dots, unevenly spaced.') : T('還沒有紙帶。', 'no tape yet.'));
    } else {
      const rec = cur().run, A2 = analysisFor(rec);
      if (!rec) t = T('紙帶：還沒有紙帶，先做一次實驗。', 'Tape: no tape yet — do a run first.');
      else if (!rec.mo.moves) t = T('紙帶：物體沒有動，點痕都疊在同一處。', 'Tape: the object did not move, so all the dots lie on one spot.');
      else t = T('紙帶：共 ', 'Tape: ') + rec.tape.dots.length + T(' 個點；第 0 點是放手後第 ', ' dots; dot 0 is dot ') + state.j0 + T(' 個點，每隔 ', ' after the release, with a counting line every ') + state.n + T(' 個點畫一條計數線；已記錄 ', ' dots; ') + (A2 ? A2.rows + ' / ' + A2.avail : '0') + T(' 個計數點。', ' counting dots logged.');
    }
    setAria(tcv, t);
    // 圖表
    let g;
    if (m === 'calib') {
      const cm = calMean(state.timerId);
      g = T('圖表：各次量得的 Δt。', 'Graph: Δt of each pull. ') + (cm ? T('已記錄 ', '') + cm.n + T(' 次，平均 Δt = ', ' pulls recorded, mean Δt = ') + num(cm.dt * 1000, 3) + ' ms' + T('。', '.') : T('還沒有數據。', 'No data yet.'));
    } else {
      const A2 = analysisFor(cur().run), an = A2 && A2.an, fit = sumFit();
      g = T('圖表：由數據表畫出的 x–t、v–t、a–t 圖', 'Graphs: x–t, v–t and a–t from the data table') + (an && an.vfit ? T('；v–t 圖斜率（加速度）= ', '; slope of v–t (acceleration) = ') + num(an.vfit.slope, 3) + ' m/s²' : T('（還沒有數據）', ' (no data yet)')) +
        T('；a–sinθ 圖有 ', '; the a–sinθ graph has ') + state.summary.length + T(' 個點', ' points') + (fit ? T('，最佳直線斜率 ', ', best-fit slope ') + num(fit.slope, 3) + ' m/s²' : '') + T('。', '.');
    }
    setAria(gcv, g);
  }

  function snapNow() {
    const mode = state.mode === 'calib' ? 'incline' : state.mode;
    const p = physParams(mode);
    const Fz = FF.forces(p);
    return {
      mode: mode, params: p, h: mode === 'incline' ? state.h : NaN, sin: Fz.sin, ideal: state.ideal, readErr: !state.ideal && state.errRead,
      freq: state.freq, timerId: state.timerId, dtTrue: dtTrueNow(), dtNom: state.freq ? 1 / state.freq : null
    };
  }

  function startTimer() {
    const e = cur();
    e.phase = 'ticking';
    e.clock = 0;
    e.t = 0;
    e.live = null;
    setStatus(T('計時器開始打點了：物體還沒動，點都打在同一個地方。', 'The timer is ticking: the object has not moved, so the dots pile up on one spot.'));
    updateButtons();
    startLoop();
  }
  function release() {
    const e = cur();
    const snap = snapNow();
    const mo = FF.makeMotion(snap.params);
    const tape = FF.makeTape(mo, snap.dtTrue, e.clock, mo.moves ? T_POST : T_STILL);
    e.live = { mo: mo, tape: tape, snap: snap, seed: (Math.random() * 4294967296) >>> 0 };
    e.phase = 'running';
    e.t = 0;
    setStatus(mo.moves ? T('放手了！', 'Released!') : T('放手了……可是它沒有動。', 'Released… but it does not move.'));
    updateButtons();
    startLoop();
  }
  function finish() {
    const e = cur();
    const L0 = e.live;
    state.runCount++;
    const rec = { id: state.runCount, mo: L0.mo, tape: L0.tape, snap: L0.snap, seed: L0.seed, rows: 0 };
    e.run = rec;
    e.live = null;
    e.phase = 'done';
    // 自動選第 0 點：第一個分得開的點
    if (rec.mo.moves) {
      const j = Math.min(+$('j0').max, FF.firstClearDot(rec.tape, CLEAR_GAP));
      autoJ0 = true;
      if (window.LabNum) window.LabNum.set($('j0'), j); else { $('j0').value = j; $('j0').dispatchEvent(new Event('input')); }
      autoJ0 = false;
      state.j0 = j;
    }
    let msg;
    if (!rec.mo.moves) msg = state.mode === 'fall' ? T('重物沒有落下：紙帶的摩擦力比重量大。', 'The weight did not fall: the tape friction is larger than its weight.') : T('滑車沒有動：軌道太平，重力沿斜面的分量贏不過摩擦力。', 'The cart did not move: the track is too flat for gravity along it to beat friction.');
    else msg = T('關掉計時器、取下紙帶了。第 0 點自動選在放手後第 ', 'Timer off, tape removed. Dot 0 was set to dot ') + state.j0 + T(' 個點（可以自己改）；按「記錄」開始讀數。', ' after the release (you can change it). Press “Record” to start reading.');
    if (rec.mo.moves && !isFinite(dtUsedFor(rec))) msg += T(' 這台計時器的頻率未知，要先到 ① 量出 Δt。', ' The timer’s frequency is unknown: measure Δt in Part 1 first.');
    setStatus(msg);
    updateButtons();
    drawAll();
    emit('run', Object.assign(recordData(rec), { moved: rec.mo.moves, nStack: rec.tape.nStack, nDots: rec.tape.dots.length, tEnd: rec.mo.tEnd, vEnd: rec.mo.vEnd }));
  }
  function backToReady() {
    const e = cur();
    e.phase = 'ready';
    e.clock = 0; e.t = 0; e.live = null;
    updateButtons();
  }

  // ① 計時器校正
  function calStart() {
    const cal = state.cal;
    const react = !state.ideal && state.errReact;
    cal.phase = 'running';
    cal.t = 0; cal.T = 0;
    cal.dt = dtTrueNow();
    cal.phase0 = Math.random() * cal.dt;
    cal.pull = FF.handPull((Math.random() * 4294967296) >>> 0);
    cal.r1 = react ? 0.1 + 0.2 * Math.random() : 0;
    cal.r2 = react ? 0.1 + 0.2 * Math.random() : 0;
    cal.react = react;
    cal.beeped = 0;
    cal.last = null;
    setStatus(T('拉動中……計時器每 Δt 打一點；按「停止」結束。', 'Pulling… the timer prints a dot every Δt. Press “Stop” to finish.'));
    updateButtons();
    startLoop();
  }
  function calStop() {
    const cal = state.cal;
    cal.T = cal.t;
    cal.phase = 'stopping';
    updateButtons();
  }
  function calFinish() {
    const cal = state.cal;
    cal.phase = 'done';
    const N = FF.dotsInPull(cal.T, cal.dt, cal.phase0);
    const Tmeas = FF.stopwatch(cal.T, cal.r1, cal.r2);
    cal.last = { T: cal.T, Tmeas: Tmeas, N: N, dt: FF.dtFromCount(Tmeas, N), r1: cal.r1, r2: cal.r2, react: cal.react, recorded: false, timerId: state.timerId };
    if (N >= 2) setStatus(T('碼錶 T = ', 'Stopwatch T = ') + num(Tmeas, 2) + T(' s，點痕 N = ', ' s, dots N = ') + N + T('，Δt = T/(N − 1) = ', ', Δt = T/(N − 1) = ') + num(cal.last.dt, 5) + T(' s。按「記錄」填進表格。', ' s. Press “Record” to enter it.'));
    else setStatus(T('拉得太短了，點不到兩個。', 'Too short: fewer than two dots.'));
    updateButtons();
    drawAll();
    emit('calib', { T: cal.T, Tmeas: Tmeas, N: N, dt: cal.last.dt, dtTrue: cal.dt, errPct: FF.percentError(cal.last.dt, cal.dt), freq: state.freq, react: cal.react, ideal: state.ideal, timerId: state.timerId });
  }

  // ---------- 動畫 ----------
  let lastT = 0, loopOn = false;
  function busy() {
    if (state.mode === 'calib') return state.cal.phase === 'running' || state.cal.phase === 'stopping';
    const p = cur().phase;
    return p === 'ticking' || p === 'running' || p === 'after';
  }
  function tick(now) {
    if (!busy()) { loopOn = false; drawAll(); return; }
    const wall = Math.min((now - lastT) / 1000, 1 / 30);
    lastT = now;
    if (state.mode === 'calib') {
      const cal = state.cal;
      const t0 = cal.t;
      cal.t += wall;
      // 打點聲
      const k0 = Math.floor((t0 - cal.phase0) / cal.dt), k1 = Math.floor((Math.min(cal.t, cal.phase === 'stopping' ? cal.T : cal.t) - cal.phase0) / cal.dt);
      if (cal.phase === 'running' && k1 > k0) tickSound();
      if (cal.beeped === 0 && cal.t >= cal.r1) { cal.beeped = 1; beepSound(true); }
      if (cal.phase === 'running' && cal.t >= CAL_MAX) calStop();
      if (cal.phase === 'stopping' && cal.t >= cal.T + cal.r2) { beepSound(false); calFinish(); loopOn = false; return; }
      drawA(); drawTape();
      requestAnimationFrame(tick);
      return;
    }
    const e = cur();
    const dt = wall * state.speed;
    const dtT = e.live ? e.live.snap.dtTrue : dtTrueNow();
    const c0 = e.clock;
    e.clock += dt;
    if (Math.floor(e.clock / dtT + 1e-9) > Math.floor(c0 / dtT + 1e-9)) tickSound();
    if (e.phase === 'running' || e.phase === 'after') {
      const L0 = e.live;
      e.t += dt;
      const tEnd = L0.mo.moves ? L0.mo.tEnd : 0;
      if (e.phase === 'running' && L0.mo.moves && e.t >= tEnd) {
        e.phase = 'after';
        thudSound(L0.mo.vEnd, state.mode === 'fall');
        if (!reducedMotion) {
          const mode = state.mode;
          state.fx.push({ mode: mode, t0: performance.now(), dur: 450, dust: mode === 'fall', at: mode === 'fall' ? function () { return P(XT, Y_SAND, TZ); } : function () { return Pt(S_STOP, TH + 0.03, TZ); } });
        }
      }
      if (e.t >= tEnd + L0.tape.tPost) { finish(); loopOn = false; return; }
    }
    drawA(); drawTape(); updateHud();
    requestAnimationFrame(tick);
  }
  function updateHud() { /* 即時讀數畫在畫布上 */ }
  function startLoop() {
    if (loopOn) return;
    loopOn = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }

  $('go').addEventListener('click', function () {
    if (state.mode === 'calib') {
      const cal = state.cal;
      if (cal.phase === 'ready') calStart();
      else if (cal.phase === 'running') calStop();
      else if (cal.phase === 'done') { cal.phase = 'ready'; cal.pull = null; setStatus(T('準備好了：按「開始拉紙帶」。', 'Ready: press “Start pulling”.')); updateButtons(); drawAll(); }
      return;
    }
    const e = cur();
    if (e.phase === 'ready') startTimer();
    else if (e.phase === 'ticking') release();
    else if (e.phase === 'done') { backToReady(); setStatus(T('換上新的紙帶了（上一條紙帶的分析還留著）。按「啟動打點計時器」再做一次。', 'A new tape is in (the last tape’s analysis is kept). Press “Switch on the timer” to go again.')); requestDraw(); }
  });

  // 記錄
  $('rec').addEventListener('click', function () {
    if (state.mode === 'calib') {
      const last = state.cal.last;
      if (!last || last.recorded || last.N < 2) return;
      last.recorded = true;
      state.cal.trials.push({ T: last.Tmeas, N: last.N, dt: last.dt, timerId: last.timerId, Ttrue: last.T, react: !!last.react });
      const cm = calMean(state.timerId);
      setStatus(T('已記錄。平均 Δt = ', 'Recorded. Mean Δt = ') + num(cm.dt, 5) + ' s');
      drawAll();
      emit('calrec', { n: cm.n, meanDt: cm.dt, dtTrue: dtTrueNow(), errPct: FF.percentError(cm.dt, dtTrueNow()), freq: state.freq, timerId: state.timerId, lastT: last.Tmeas, lastErrPct: FF.percentError(last.dt, dtTrueNow()) });
      return;
    }
    addRows(1);
  });
  $('recAll').addEventListener('click', function () { addRows(Infinity); });
  function addRows(k) {
    const rec = cur().run;
    const A2 = analysisFor(rec);
    if (!A2 || !isFinite(A2.dtU) || A2.rows >= A2.avail) return;
    rec.rows = Math.min(A2.avail, A2.rows + k);
    const B = analysisFor(rec);
    if (B.rows === B.avail && B.avail >= 3 && B.an && B.an.vfit) addSummary(rec, B);
    // 讀數播報（離散事件：按下記錄）
    let msg = T('已記錄 ', 'Logged ') + B.rows + ' / ' + B.avail + T(' 個計數點。', ' counting dots.');
    if (B.an && B.an.vfit) msg += (state.mode === 'fall' ? T('量得的 g = ', ' Measured g = ') : T('v–t 圖斜率 a = ', ' Slope of v–t: a = ')) + num(B.an.vfit.slope, 3) + ' m/s²' + T('。', '.');
    setStatus(msg);
    drawAll();
    emitRecord();
  }
  $('undoRow').addEventListener('click', function () {
    if (state.mode === 'calib') {
      const tr = calTrials();
      if (!tr.length) return;
      state.cal.trials.splice(state.cal.trials.lastIndexOf(tr[tr.length - 1]), 1);
      drawAll();
      return;
    }
    const rec = cur().run;
    if (rec && rec.rows > 0) { rec.rows = Math.min(rec.rows, analysisFor(rec).avail) - 1; drawAll(); }
  });
  function addSummary(rec, B) {
    const s = rec.snap;
    const pt = {
      runId: rec.id, mode: s.mode, sin: s.sin, a: B.an.vfit.slope, ideal: s.ideal, readErr: s.readErr, mu: s.params.mu, f: s.params.f, k: s.params.k, mass: s.params.m, h: s.h,
      freq: s.freq, timerId: s.timerId, dtSrc: state.dtSrc === 'cal' || !s.dtNom ? 'cal' : 'nom', calReact: calReactFor(s.timerId), dtErrPct: FF.percentError(B.dtU, s.dtTrue), n: state.n, rows: B.rows
    };
    const i = state.summary.findIndex(function (q) { return q.runId === rec.id; });
    if (i >= 0) state.summary[i] = pt; else state.summary.push(pt);
    const fit = sumFit();
    emit('summary', { n: state.summary.length, points: state.summary.map(function (q) { return Object.assign({}, q); }), slope: fit ? fit.slope : NaN, intercept: fit ? fit.intercept : NaN });
  }
  function sumFit() {
    const S = state.summary;
    if (S.length < 2) return null;
    return FF.fitLine(S.map(function (p) { return p.sin; }), S.map(function (p) { return p.a; }));
  }
  $('undoSum').addEventListener('click', function () { state.summary.pop(); drawAll(); });

  // 全部清除：紙帶、表格、圖表、校正、a–sinθ（滑桿設定不變）
  $('clearAll').addEventListener('click', function () {
    state.exp = { incline: newExp(), fall: newExp() };
    const cal = state.cal;
    cal.phase = 'ready'; cal.pull = null; cal.last = null; cal.trials = []; cal.t = 0;
    state.summary = [];
    state.fx = [];
    setStatus(T('已全部清除：紙帶、表格、圖表與校正都清空了，滑桿設定不變。', 'Everything is cleared: tapes, tables, graphs and the calibration; the slider settings are kept.'));
    updateButtons();
    drawAll();
  });

  // 喇叭按鈕：切換全站音效設定（齒輪面板也能切換，兩邊同步）
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

  // ---------- 模式 ----------
  function cancelBusy() {
    if (state.cal.phase === 'running' || state.cal.phase === 'stopping') { state.cal.phase = 'ready'; state.cal.pull = null; }
    ['incline', 'fall'].forEach(function (m) {
      const e = state.exp[m];
      if (e.phase === 'ticking' || e.phase === 'running' || e.phase === 'after') { e.phase = 'ready'; e.live = null; e.clock = 0; e.t = 0; }
    });
  }
  function setMode(m) {
    if (m === state.mode) return;
    cancelBusy();
    state.mode = m;
    document.querySelectorAll('.modebar button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === m)); });
    applyVisibility();
    setStatus('');
    statKey = '';
    resizeA(); resizeT(); resizeG();
    refreshOutputs();
    drawAll();
  }
  function applyVisibility() {
    const m = state.mode, cal = m === 'calib';
    $('boxH').hidden = m !== 'incline';
    $('boxM').hidden = m !== 'incline';
    $('boxm').hidden = m !== 'fall';
    $('boxMu').hidden = m !== 'incline';
    $('boxF').hidden = cal;
    $('boxK').hidden = cal;
    $('boxRead').hidden = cal;
    $('boxReact').hidden = !cal;
    $('speedBox').hidden = cal;
    $('cardTape').hidden = cal;
    $('cardRes').hidden = cal;
    $('cardTheory').hidden = cal;
    $('cardSum').hidden = cal;
    $('cardCal').hidden = !cal;
    $('sumBtns').hidden = cal;
    $('setupInfo').hidden = cal;
    $('tapeTitle').textContent = cal ? T('拉出來的紙帶', 'The pulled tape') : T('紙帶', 'The paper tape');
    $('tapeHint').textContent = cal
      ? T('紙帶被手拉得忽快忽慢，點的間距不均勻；但相鄰兩點的時間都是 Δt。數出點數 N，Δt = T/(N − 1)。', 'The hand pulls unevenly, so the gaps differ — but every gap takes the same time Δt. Count the dots N: Δt = T/(N − 1).')
      : T('紙帶取下後攤平：左端是放手前疊在一起的點，紅線是每隔 n 點畫的計數線，直尺的 0 對準第 0 點。下方的放大鏡顯示下一個要讀的點。', 'The tape laid flat: the blob on the left is where the dots piled up before the release, the red lines mark every n-th dot, and the ruler’s zero is on dot 0. The magnifier shows the next dot to read.');
    $('graphTitle').textContent = cal ? T('圖表：各次的 Δt', 'Graph: Δt of each pull') : T('圖表', 'Graphs');
    $('graphHint').textContent = cal
      ? T('點痕數只能數到整數，碼錶也有反應時間；拉得愈久，相對誤差愈小。', 'The dot count is a whole number and the stopwatch has a reaction time, so longer pulls give smaller relative errors.')
      : T('實心點是表格裡的數據，實線是最佳直線（或曲線），灰色虛線是理論值。a–sinθ 圖收集每一次完成的表格。', 'Solid points come from the table, solid lines are best fits, grey dashed lines show the theory. The a–sinθ graph collects every completed table.');
    $('sceneHint').textContent = m === 'calib'
      ? T('側視斜投影、依比例繪製（碼錶除外）。計時器、拉紙帶與碼錶同時開始、同時停止。', 'Oblique view, drawn to scale (except the stopwatch). The timer, the pull and the stopwatch start and stop together.')
      : m === 'incline'
        ? T('側視斜投影、依比例繪製：軌道長 1.20 m，滑車從起點滑 80 cm 到擋板。計時器固定在高的一端，紙帶夾在滑車尾部。', 'Oblique view, drawn to scale: the track is 1.20 m long and the cart runs 80 cm to the end stop. The timer sits at the high end; the tape is clipped to the back of the cart.')
        : T('依比例繪製：重物從起點落下 90 cm 到沙箱，旁邊的直尺標出落下的距離。跑完後顯示每個計數點的「頻閃」位置。', 'Drawn to scale: the weight falls 90 cm into the sand tray; the ruler shows the distance fallen. After the run the outlines show the weight at each counting dot, like a strobe photo.');
  }

  // ---------- 條件改變 ----------
  function physChanged() {
    if (state.mode === 'calib') return;
    const e = cur();
    if (e.phase === 'running' || e.phase === 'after') {
      backToReady();
      setStatus(T('條件改變了，這一次作廢，放回起點。', 'The settings changed, so this run was cancelled.'));
    } else if (e.phase === 'done') {
      backToReady();
      setStatus(T('條件改變了，換上新紙帶（上一條紙帶的分析還留著）。', 'Settings changed; a new tape is in (the last tape’s analysis is kept).'));
    }
    requestDraw();
  }
  const elH = $('h'), elM = $('M'), elm = $('m'), elF = $('fr'), elMu = $('mu'), elK = $('kg'), elN = $('n'), elJ = $('j0');
  function showOut(el, text) { $(el.id + 'o').textContent = text; }
  function refreshOutputs() {
    showOut(elH, fmtSlider(val(elH), elH) + ' cm');
    showOut(elM, fmtSlider(val(elM), elM) + ' kg');
    showOut(elm, fmtSlider(val(elm), elm) + ' kg');
    showOut(elF, fmtSlider(val(elF), elF) + ' N');
    showOut(elMu, fmtSlider(val(elMu), elMu));
    showOut(elK, fmtSlider(val(elK), elK) + ' g/m');
    showOut(elN, String(state.n));
    showOut(elJ, String(state.j0));
    const s = state.h / L;
    if (state.mode === 'incline') setHTML('setupInfo', 'sinθ = h/L = ' + num(s, 4) + T('　', '   ') + 'θ = ' + num(Math.asin(s) * 180 / Math.PI, 2) + '°<br>' + T('理想時 a = g sinθ = ', 'Ideal: a = g sinθ = ') + num(G * s, 3) + MS2);
    else if (state.mode === 'fall') setHTML('setupInfo', T('理想時 a = g = 9.8', 'Ideal: a = g = 9.8') + MS2 + (state.ideal ? '' : '<br>f/m = ' + num(state.f / state.m, 3) + MS2));
    setHTML('freqInfo', {
      60: T('60 Hz（預設）：接臺灣的家用電源，每 1/60 s 打一點。', '60 Hz (default): runs on Taiwan’s 60 Hz mains, one dot every 1/60 s.'),
      50: T('50 Hz：接 50 Hz 電源的地區，每 1/50 s 打一點。', '50 Hz: regions with 50 Hz mains, one dot every 1/50 s.'),
      20: T('20 Hz：每 0.05 s 打一點（點比較少，方便數）。', '20 Hz: one dot every 0.05 s (fewer dots, easier to count).'),
      0: T('電鈴式計時器：頻率未知（每次選它都不同），要先在 ① 量出 Δt。', 'Buzzer-type timer: unknown frequency (different every time you choose it). Measure Δt in Part 1 first.')
    }[state.freq]);
    const cm = calMean(state.timerId);
    const rec = state.mode !== 'calib' ? cur().run : null;
    const dtU = rec ? dtUsedFor(rec) : (state.dtSrc === 'cal' || !state.freq ? (cm ? cm.dt : NaN) : 1 / state.freq);
    setHTML('tauInfo', 'τ = n × Δt = ' + state.n + ' × ' + (isFinite(dtU) ? num(dtU, 5) + ' s = ' + num(state.n * dtU, 4) + ' s' : '?'));
    $('dtNom').disabled = !state.freq;
    $('dtCal').disabled = !cm;
    const src = !state.freq ? 'cal' : (state.dtSrc === 'cal' && cm ? 'cal' : 'nom');
    $('dtNom').setAttribute('aria-pressed', String(src === 'nom'));
    $('dtCal').setAttribute('aria-pressed', String(src === 'cal'));
  }
  function readSliders() {
    state.h = val(elH) / 100;
    state.M = val(elM);
    state.m = val(elm);
    state.f = val(elF);
    state.mu = val(elMu);
    state.kG = val(elK);
  }
  [elH, elM, elm, elF, elMu, elK].forEach(function (el) {
    el.addEventListener('input', function () {
      readSliders();
      refreshOutputs();
      if (el === elH && state.mode === 'incline') resizeA();
      physChanged();
    });
  });
  let autoJ0 = false;
  function tapeSettingChanged() {
    ['incline', 'fall'].forEach(function (m) { const r = state.exp[m].run; if (r) r.rows = 0; });
    refreshOutputs();
    requestDraw();
  }
  elN.addEventListener('input', function () { state.n = Math.max(1, Math.round(val(elN))); tapeSettingChanged(); });
  elJ.addEventListener('input', function () { state.j0 = Math.max(1, Math.round(val(elJ))); if (!autoJ0) tapeSettingChanged(); else refreshOutputs(); });
  $('dtNom').addEventListener('click', function () { state.dtSrc = 'nom'; refreshOutputs(); drawAll(); });
  $('dtCal').addEventListener('click', function () { state.dtSrc = 'cal'; refreshOutputs(); drawAll(); });

  document.querySelectorAll('.modebar button').forEach(function (b) { b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); }); });
  document.querySelectorAll('.speedbox button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.speed = +b.getAttribute('data-speed');
      document.querySelectorAll('.speedbox button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      requestDraw();
    });
  });
  document.querySelectorAll('.seg4 button[data-f]').forEach(function (b) {
    b.addEventListener('click', function () {
      const f = +b.getAttribute('data-f');
      if (f === state.freq && f !== 0) return;
      cancelBusy();
      state.freq = f;
      if (f === 0) state.fHidden = Math.round((22 + 16 * Math.random()) * 10) / 10;
      state.timerId++;
      if (state.cal.phase === 'done') { state.cal.phase = 'ready'; state.cal.pull = null; state.cal.last = null; }
      document.querySelectorAll('.seg4 button[data-f]').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      ['incline', 'fall'].forEach(function (m) { const e = state.exp[m]; if (e.phase === 'done') { e.phase = 'ready'; } });
      setStatus(f ? T('換成 ', 'Switched to the ') + f + T(' Hz 的計時器。', ' Hz timer.') : T('換成頻率未知的電鈴式計時器：先在 ① 量出它的 Δt。', 'Switched to a buzzer timer of unknown frequency: measure its Δt in Part 1 first.'));
      refreshOutputs();
      statKey = '';
      drawAll();
    });
  });
  function setIdeal(v) {
    state.ideal = v;
    $('idealBtn').setAttribute('aria-pressed', String(v));
    $('realBtn').setAttribute('aria-pressed', String(!v));
    $('errBox').hidden = v;
    refreshOutputs();
    physChanged();
  }
  $('idealBtn').addEventListener('click', function () { if (!state.ideal) setIdeal(true); });
  $('realBtn').addEventListener('click', function () { if (state.ideal) setIdeal(false); });
  $('errRead').addEventListener('change', function (ev) { state.errRead = ev.target.checked; physChanged(); });
  $('errReact').addEventListener('change', function (ev) { state.errReact = ev.target.checked; });

  // ---------- 啟動 ----------
  readColors();
  readSliders();
  state.n = Math.round(val(elN));
  state.j0 = Math.round(val(elJ));
  applyVisibility();
  refreshOutputs();
  updateButtons();
  setStatus(T('準備好了：先按「啟動打點計時器」，再放開滑車。', 'Ready: switch on the timer, then let go of the cart.'));
  function themeChanged() { readColors(); statKey = ''; requestDraw(); }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  const widths = new WeakMap();
  function observe(el, fn) {
    if (window.ResizeObserver) new ResizeObserver(function () { if (el.clientWidth !== widths.get(el)) { widths.set(el, el.clientWidth); fn(); } }).observe(el);
    window.addEventListener('resize', fn);
  }
  observe(cv, resizeA);
  observe(tcv, resizeT);
  observe(gcv, resizeG);
  resizeA(); resizeT(); resizeG();
  updateReadouts();
})();
