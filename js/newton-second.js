/* newton-second.js — 「牛頓第二定律（力學車實驗）」模組的畫面與互動（物理計算在 newton-second-core.js） */
(function () {
  'use strict';
  const NS = window.NewtonSecondCore;
  const $ = function (id) { return document.getElementById(id); };
  // 介面文字：英文模式用第二個字串（settings.js）
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  // 滑桿讀值：打字輸入的精確值（numinput.js）優先
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const G = NS.G, DEG = NS.DEG;

  // ---------- 裝置尺寸（m，依比例繪製） ----------
  const D = 0.50;             // 小車由起點到擋板的距離
  const PIVOT_X = -0.06;      // 軌道靠滑輪一端（支點）的位置；桌子右緣在 x = 0
  const TRACK_S0 = -1.00;     // 軌道左端（軌道長 1.00 m）
  const RAIL_H = 0.018;       // 軌道高度
  const CART_L = 0.17, WHEEL_R = 0.012;
  const BODY_B = 0.024, BODY_T = 0.062; // 車身下緣、上緣（離軌道底部）
  const HOOK_H = 0.045;       // 繩子的高度（與軌道平行）
  const S_REAR0 = -0.90;      // 小車尾端的起點
  const S_END = S_REAR0 + CART_L + D; // 擋板位置（小車前端停在這裡）
  const S_TICK = -0.955;      // 打點針的位置
  const TAPE_H = 0.032;       // 紙帶高度
  const PULLEY_R = 0.025, PULLEY_S = 0.07; // 滑輪半徑、繩子在滑輪頂端的切點（軌道座標）
  const HANG0 = 0.06;         // 吊鉤起始時在滑輪中心下方的距離
  const M_CART0 = 0.20;       // 空車質量（車上砝碼 = M − 0.20 kg）
  const BAR_KG = 0.25, BAR_W = 0.072, BAR_H = 0.010; // 車上的鐵條砝碼
  const M_HOOK = 0.010;       // 掛鉤質量
  const STACK_PER_KG = 0.10;  // 槽碼堆疊高度：每 1 kg 約 10 cm
  const GATE_X = [0.10, 0.35], FLAG_W = 0.02, FLAG_S = 0.004; // 光電閘位置（小車位移）、遮光片寬度、遮光片離車尾
  const SIGMA = 3e-4;         // 讀數誤差（點位置的標準差）
  const SLOW = 0.25;
  const HOLD = 1.2;           // 拉不動時計時器空打的時間（s）
  const VIEW = { x0: -1.10, x1: 0.10, y0: -0.66, y1: 0.24 }; // 世界座標視窗

  const state = {
    M: 0.5, m: 0.05, muSet: 0.02, thDeg: 0, attached: true, v0: 0.3,
    freq: 60, N: 6, noise: false,
    mystery: false, muHidden: 0.03, mysteryId: 0,
    phase: 'ready',     // ready（在起點）／running／paused／done（跑完）
    t: 0, x: 0,
    run: null, tape: null, // tape：{ run, dots, printed, freq, snap（當時的條件）}
    slow: false,
    show: { fbd: true, gates: false },
    exp: 1, axis: { 1: 'F', 2: 'inv' },
    series: { 1: [], 2: [] },
    latest: { 1: -1, 2: -1 },
    runCount: 0,
    fx: []
  };

  function mu() { return state.mystery ? state.muHidden : state.muSet; }
  function physParams() {
    return { M: state.M, m: state.m, mu: mu(), theta: state.thDeg * DEG, attached: state.attached };
  }

  // ---------- 色彩（lab.css 代號）與共用繪圖工具（js/drawkit.js 的 LabDraw） ----------
  const LD = window.LabDraw;
  const FF = LD.FONT;
  const alpha = LD.alpha, shade = LD.shade, mix = LD.mix, roundRect = LD.roundRect;
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface',
      '--pos', '--neg', '--equi', '--field', '--probe', '--b-mech']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    colors.dark = isDark();
    const d = colors.dark;
    colors.paper = d ? mix(shade(colors.equi, 0.55), colors['canvas-bg'], 0.22) : shade(colors.equi, 0.9);
    colors.paperEdge = d ? shade(colors.equi, -0.2) : shade(colors.equi, 0.55);
    colors.ink = d ? shade(colors['canvas-bg'], -0.2) : shade(colors.field, -0.25);
    colors.metalHi = d ? shade(colors.muted, 0.15) : shade(colors.muted, 0.72);
    colors.metal = d ? shade(colors.muted, -0.25) : shade(colors.muted, 0.42);
    colors.metalLo = d ? shade(colors.muted, -0.55) : shade(colors.muted, 0.05);
    colors.rubber = d ? shade(colors.muted, -0.62) : shade(colors.field, -0.15);
    colors.woodHi = d ? shade(colors.equi, -0.35) : shade(colors.equi, 0.5);
    colors.wood = d ? shade(colors.equi, -0.52) : shade(colors.equi, 0.28);
    colors.woodLo = d ? shade(colors.equi, -0.68) : shade(colors.equi, 0.02);
    colors.brass = d ? shade(colors.equi, -0.05) : shade(colors.equi, 0.35);
    colors.dev = d ? shade(colors.muted, -0.55) : shade(colors.field, 0.08);
    colors.devHi = d ? shade(colors.muted, -0.3) : shade(colors.field, 0.3);
    colors.steel = d ? shade(colors.muted, -0.12) : shade(colors.muted, 0.3);
    colors.string = d ? shade(colors.muted, 0.3) : shade(colors.muted, -0.3);
    colors.panel = d ? shade(colors.surface, 0.02) : colors.surface;
  }
  function isDark() {
    const r = LD.rgb(getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg'));
    return (r[0] + r[1] + r[2]) / 3 < 100;
  }

  // ---------- 數字格式 ----------
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  /** 有效數字（讀數用） */
  function sig(v, n) {
    if (!isFinite(v)) return '—';
    if (v === 0) return '0';
    const d = Math.max(0, Math.min(6, n - 1 - Math.floor(Math.log10(Math.abs(v)))));
    return num(v, d);
  }
  /** 滑桿數字：顯示到可輸入的精度（去掉多餘的 0，但不少於滑桿間隔的位數） */
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s;
  }
  const MS2 = ' m/s<sup>2</sup>';

  // ---------- 共用繪圖工具（LabDraw 的薄包裝，保留本模組原本的呼叫方式） ----------
  /** 標籤高度（與 LabDraw.pill 的底框一致） */
  function pillH(c, text, font) {
    c.font = font || '600 12px ' + FF;
    return LD.textHeight(c.measureText(text), 15) + 3;
  }
  /**
   * 圓角底框標籤（LabDraw.pill，全站同款：半透明底＋語意色細框）。
   * 對齊由 c.textAlign 決定（left：文字從 x 開始；right：文字結束在 x），y 為垂直中心；傳回底框 {x, y, w, h}。
   */
  function pill(c, text, x, y, color, font) {
    const al = c.textAlign === 'center' ? 'center' : (c.textAlign === 'right' || c.textAlign === 'end') ? 'right' : 'left';
    font = font || '600 12px ' + FF;
    const ph = pillH(c, text, font);
    const bx = al === 'left' ? x - 6 : al === 'right' ? x + 6 : x;
    const r = LD.pill(c, text, bx, y + ph / 2, color, al, font);
    c.textAlign = al;
    return r;
  }
  function textW(c, text, font) { c.font = font; return c.measureText(text).width; }

  /**
   * 向量箭頭（LabDraw.arrow：略帶弧度的箭頭、背景色描邊、箭身高光；全站幾何一致）。
   * 尖端位置 = 起點 + 方向 × len，與物理比例一致。
   * broken 為 true 時在箭身畫截斷記號（箭頭太長、未依比例）；dashed 為 true 時箭身用虛線。
   * gapColor：截斷處的底色（預設受力圖面板色）。
   */
  function arrow(c, x0, y0, ux, uy, len, lw, color, broken, dashed, gapColor) {
    if (len < 1) return;
    LD.arrow(c, x0, y0, x0 + ux * len, y0 + uy * len, color, lw, dashed ? { dash: [lw * 2, lw * 1.8] } : null);
    if (broken) {
      const nx = -uy, ny = ux;
      const mx = x0 + ux * len * 0.5, my = y0 + uy * len * 0.5, s = 2.2 * lw;
      c.save();
      c.lineCap = 'round';
      c.strokeStyle = gapColor || colors.panel;
      c.lineWidth = lw + 4;
      c.beginPath(); c.moveTo(mx - ux * 2.5, my - uy * 2.5); c.lineTo(mx + ux * 2.5, my + uy * 2.5); c.stroke();
      c.strokeStyle = color;
      c.lineWidth = 1.5;
      c.beginPath();
      [-3.5, 3.5].forEach(function (o) {
        const bx = mx + ux * o, by = my + uy * o;
        c.moveTo(bx - nx * s + ux * 2, by - ny * s + uy * 2);
        c.lineTo(bx + nx * s - ux * 2, by + ny * s - uy * 2);
      });
      c.stroke();
      c.restore();
    }
  }
  /** 便宜的投影（不用 shadowBlur）：同形狀往右下偏移、低透明度，疊兩層 */
  function softDrop(c, path, a, dx, dy) {
    c.save();
    c.fillStyle = LD.shadowInk(a * 0.5);
    c.translate(dx * 1.8, dy * 1.8); path(c); c.fill();
    c.fillStyle = LD.shadowInk(a);
    c.translate(-dx * 0.8, -dy * 0.8); path(c); c.fill();
    c.restore();
  }

  function niceStep(raw) {
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  }
  function niceMax(v, n) {
    if (!(v > 0)) return 1;
    const st = niceStep(v / (n || 5));
    return Math.ceil(v / st - 1e-9) * st;
  }
  function decOf(step) { return step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step) - 1e-9)); }

  /** 畫布：依 devicePixelRatio 設定實際像素 */
  function setupCanvas(cv, h) {
    const w = cv.clientWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (cv.style.height !== h + 'px') cv.style.height = h + 'px';
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W) cv.width = W;
    if (cv.height !== H) cv.height = H;
    return { w: w, h: h, dpr: dpr };
  }

  // ======================= 實驗裝置畫布 =======================
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let A = null; // 版面
  const bg = document.createElement('canvas');
  const bgc = bg.getContext('2d');

  function layoutA() {
    const w = cv.clientWidth;
    const k = w / (VIEW.x1 - VIEW.x0);
    const narrow = w < 560;
    // 窄畫面時往下多留一些空間給受力圖
    const h = Math.round((VIEW.y1 - VIEW.y0) * k + (narrow ? 0.3 * k : 0));
    return { w: w, h: h, k: k, narrow: narrow };
  }
  function X(x) { return (x - VIEW.x0) * A.k; }
  function Y(y) { return (VIEW.y1 - y) * A.k; }
  /** 軌道座標 (s 沿軌道往滑輪方向、h 垂直軌道向上) → 世界座標 */
  function L2W(s, h) {
    const th = state.thDeg * DEG, c = Math.cos(th), sn = Math.sin(th);
    return [PIVOT_X + s * c + h * sn, -s * sn + h * c];
  }
  function L2P(s, h) { const w = L2W(s, h); return [X(w[0]), Y(w[1])]; }
  /** 把 ctx 切到軌道座標：之後用 (s·k, −h·k) 畫圖 */
  function railFrame(c) {
    const p = L2P(0, 0);
    c.translate(p[0], p[1]);
    c.rotate(state.thDeg * DEG);
  }
  function pulleyCenter() { return L2W(PULLEY_S, HOOK_H - PULLEY_R); }

  function resizeA() {
    if (!cv.clientWidth) return;
    A = layoutA();
    const s = setupCanvas(cv, A.h);
    A.dpr = s.dpr;
    // 受力圖區：桌面下方左側
    const top = Y(-0.06), bot = A.h - 6;
    const left = X(-1.085), right = A.narrow ? X(-0.02) : X(-0.095);
    const gap = A.narrow ? 6 : 10;
    const wC = Math.round((right - left - gap) * 0.57);
    A.fbdC = { x: left, y: top, w: wC, h: bot - top };
    A.fbdH = { x: left + wC + gap, y: top, w: right - left - wC - gap, h: bot - top };
    buildBg();
    drawA();
  }

  /** 不變的圖層：背景、牆面格線、桌子、軌道、墊木、打點計時器、擋板、滑輪支架、受力圖面板（傾角、主題、受力圖開關改變時重畫） */
  function buildBg() {
    bg.width = cv.width; bg.height = cv.height;
    const c = bgc, k = A.k, dk = colors.dark;
    c.setTransform(A.dpr, 0, 0, A.dpr, 0, 0);
    c.clearRect(0, 0, A.w, A.h);
    // 背景：--canvas-bg 加極淡暈影（LabDraw.backdrop）
    LD.backdrop(c, A.w, A.h);
    const yT = Y(0), slab = 0.03 * k;
    const xL = -2, xR = X(0);
    // 牆面格線（依比例：主格線 10 cm、次格線 2 cm，與桌緣對齊），只畫在桌面上方，越往上越淡
    c.save();
    c.beginPath(); c.rect(0, 0, A.w, yT); c.clip();
    c.globalAlpha = 0.75;
    LD.grid(c, 0, 0, A.w, yT, 0.1 * k, 0.02 * k, X(0), yT);
    c.globalAlpha = 1;
    const fade = c.createLinearGradient(0, 0, 0, yT * 0.7);
    fade.addColorStop(0, alpha(colors['canvas-bg'], 0.75));
    fade.addColorStop(1, alpha(colors['canvas-bg'], 0));
    c.fillStyle = fade;
    c.fillRect(0, 0, A.w, yT * 0.7);
    c.restore();

    // 桌腳（桌面下方、受力圖面板後面；純裝飾）：在桌面的陰影裡，顏色偏暗、往下漸漸融入背景
    const lx0 = X(-0.078), lx1 = X(-0.056);
    const legC = mix(colors.wood, colors['canvas-bg'], dk ? 0.35 : 0.45);
    const lg = c.createLinearGradient(lx0, 0, lx1, 0);
    lg.addColorStop(0, shade(legC, -0.12));
    lg.addColorStop(0.35, shade(legC, 0.12));
    lg.addColorStop(1, shade(legC, -0.3));
    c.fillStyle = lg;
    c.fillRect(lx0, yT + slab, lx1 - lx0, A.h - yT - slab + 2);
    const lfade = c.createLinearGradient(0, yT + slab, 0, A.h);
    lfade.addColorStop(0, alpha(colors['canvas-bg'], 0));
    lfade.addColorStop(1, alpha(colors['canvas-bg'], 0.7));
    c.fillStyle = lfade;
    c.fillRect(lx0 - 1, yT + slab, lx1 - lx0 + 2, A.h - yT - slab + 2);
    // 桌面下的柔和陰影（壓在桌腳上方）
    const sg = c.createLinearGradient(0, yT + slab, 0, yT + slab + 0.07 * k);
    sg.addColorStop(0, LD.shadowInk(dk ? 0.42 : 0.16));
    sg.addColorStop(1, LD.shadowInk(0));
    c.fillStyle = sg;
    c.fillRect(xL, yT + slab, xR - xL + 2, 0.07 * k);
    // 桌面前緣：上亮下暗的木頭漸層、頂邊高光、底邊暗線、極淡木紋
    const wg = c.createLinearGradient(0, yT, 0, yT + slab);
    wg.addColorStop(0, colors.woodHi);
    wg.addColorStop(0.3, colors.wood);
    wg.addColorStop(1, colors.woodLo);
    c.fillStyle = wg;
    roundRect(c, xL, yT, xR - xL, slab, 3);
    c.fill();
    c.save();
    roundRect(c, xL, yT, xR - xL, slab, 3);
    c.clip();
    c.strokeStyle = alpha(colors.woodLo, dk ? 0.35 : 0.22);
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < 4; i++) {
      const yy = yT + slab * (0.3 + 0.18 * i);
      c.moveTo(xL, yy);
      c.bezierCurveTo(xR * 0.3, yy - 1.5 + i * 0.5, xR * 0.62, yy + 1.5, xR, yy - 0.5);
    }
    c.stroke();
    c.fillStyle = alpha(shade(colors.woodHi, 0.45), dk ? 0.45 : 0.8);
    c.fillRect(xL, Math.round(yT), xR - xL, 1);
    c.fillStyle = alpha(shade(colors.woodLo, -0.45), 0.6);
    c.fillRect(xL, yT + slab - 1, xR - xL, 1);
    // 右端的端面（較亮的一窄條，像看到桌角）
    const eg = c.createLinearGradient(xR - 4, 0, xR, 0);
    eg.addColorStop(0, alpha(shade(colors.woodHi, 0.3), 0));
    eg.addColorStop(1, alpha(shade(colors.woodHi, 0.3), dk ? 0.35 : 0.55));
    c.fillStyle = eg;
    c.fillRect(xR - 4, yT, 4, slab);
    c.restore();

    const th = state.thDeg * DEG;
    // 墊木：撐起軌道遠離滑輪的一端
    if (state.thDeg > 0.001) {
      const sR = -0.90, sL = -0.965;
      const hR = -sR * Math.sin(th); // 墊木右緣上方軌道底部的高度
      const x0 = X(PIVOT_X + sL * Math.cos(th)), x1 = X(PIVOT_X + sR * Math.cos(th));
      const yTop = Y(hR);
      LD.contactShadow(c, (x0 + x1) / 2, yT, (x1 - x0) / 2, 0);
      LD.block(c, x0, yTop, x1 - x0, yT - yTop, colors.wood, { r: 2, shadow: false, stroke: alpha(colors.woodLo, 0.7) });
      if (yT - yTop > 6) {
        c.strokeStyle = alpha(colors.woodLo, 0.3);
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x0 + 2, yTop + (yT - yTop) * 0.4); c.lineTo(x1 - 2, yTop + (yT - yTop) * 0.45);
        c.stroke();
      }
    }

    // 軌道（鋁軌）
    c.save();
    railFrame(c);
    const rs0 = TRACK_S0 * k, rw = -TRACK_S0 * k, rh = RAIL_H * k;
    // 接觸陰影：軌道下緣的柔和暗帶
    const cs = c.createLinearGradient(0, -1, 0, 4);
    cs.addColorStop(0, LD.shadowInk(dk ? 0.5 : 0.22));
    cs.addColorStop(1, LD.shadowInk(0));
    c.fillStyle = cs;
    c.fillRect(rs0 + 2, -1, rw - 4, 5);
    const rg2 = c.createLinearGradient(0, -rh, 0, 0);
    rg2.addColorStop(0, colors.metalHi);
    rg2.addColorStop(0.18, shade(colors.metalHi, dk ? 0.08 : 0.25));
    rg2.addColorStop(0.5, colors.metal);
    rg2.addColorStop(1, colors.metalLo);
    c.fillStyle = rg2;
    roundRect(c, rs0, -rh, rw, rh, 2.5);
    c.fill();
    c.save();
    roundRect(c, rs0, -rh, rw, rh, 2.5);
    c.clip();
    // 下方的凸緣線與兩端的端蓋
    c.fillStyle = alpha(colors.metalLo, 0.55);
    c.fillRect(rs0, -rh * 0.3, rw, 1);
    c.fillStyle = alpha(shade(colors.metalHi, 0.6), dk ? 0.35 : 0.6);
    c.fillRect(rs0, -rh * 0.3 + 1, rw, 1);
    const capW = Math.max(3, 0.01 * k);
    [rs0, -capW].forEach(function (x) {
      const g = c.createLinearGradient(0, -rh, 0, 0);
      g.addColorStop(0, shade(colors.rubber, 0.3));
      g.addColorStop(1, colors.rubber);
      c.fillStyle = g;
      c.fillRect(x, -rh, capW, rh);
    });
    c.restore();
    c.strokeStyle = alpha(shade(colors.metalHi, 0.5), dk ? 0.5 : 0.85);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(rs0 + 3, -rh + 0.5); c.lineTo(-3, -rh + 0.5); c.stroke();
    roundRect(c, rs0 + 0.5, -rh + 0.5, rw - 1, rh - 1, 2.5);
    c.strokeStyle = alpha(colors.metalLo, 0.6);
    c.stroke();
    // 尺規：由小車前端的起點量起，每 1 cm 一小格、5 cm 中格、10 cm 標數字
    const sFront0 = S_REAR0 + CART_L;
    const cm = 0.01 * k;
    c.strokeStyle = alpha(colors.text, dk ? 0.5 : 0.45);
    c.lineWidth = 1;
    c.lineCap = 'butt';
    c.beginPath();
    for (let i = 0; i <= D * 100; i++) {
      const xx = (sFront0 + i * 0.01) * k;
      const len = i % 10 === 0 ? rh * 0.62 : i % 5 === 0 ? rh * 0.45 : rh * 0.28;
      if (i % 5 !== 0 && cm < 2.6) continue;
      c.moveTo(Math.round(xx) + 0.5, -rh + 1);
      c.lineTo(Math.round(xx) + 0.5, -rh + 1 + len);
    }
    c.stroke();
    if (!A.narrow) {
      c.font = '600 9px ' + FF;
      c.fillStyle = alpha(colors.text, dk ? 0.85 : 0.75);
      c.textAlign = 'center';
      c.textBaseline = 'bottom';
      for (let i = 0; i <= D * 100; i += 10) c.fillText(String(i), (sFront0 + i * 0.01) * k, -1);
      c.textAlign = 'left';
      c.fillText('cm', (sFront0 + D + 0.012) * k, -1);
    }
    // 擋板（橡皮）與固定座
    const bx = S_END * k, bh = 0.05 * k;
    c.fillStyle = colors.metalLo;
    roundRect(c, bx + 0.012 * k, -rh - 0.012 * k, 0.016 * k, 0.012 * k + 1, 1.5);
    c.fill();
    c.fillStyle = alpha(shade(colors.metalHi, 0.4), 0.6);
    c.fillRect(bx + 0.012 * k, -rh - 0.012 * k, 0.016 * k, 1);
    LD.block(c, bx, -bh, 0.016 * k, bh - rh + 1, colors.rubber, { r: 3, shadow: false });
    // 打點計時器（機身；振動臂每一幀另外畫）
    drawTicker(c, k);
    c.restore();

    // 滑輪支架：夾在桌子右緣
    const pc = pulleyCenter();
    const px = X(pc[0]), py = Y(pc[1]);
    const rod = c.createLinearGradient(px - 3, 0, px + 3, 0);
    rod.addColorStop(0, colors.metalHi);
    rod.addColorStop(0.5, colors.metal);
    rod.addColorStop(1, colors.metalLo);
    c.strokeStyle = rod;
    c.lineWidth = Math.max(2.5, 0.006 * k);
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(X(-0.003), yT + slab * 0.5); c.lineTo(px, py); c.stroke();
    LD.block(c, X(-0.012), yT - 3, X(0.006) - X(-0.012), slab + 6, colors.steel, { r: 2 });
    c.fillStyle = alpha(colors.metalLo, 0.9);
    c.beginPath(); c.arc((X(-0.012) + X(0.006)) / 2, yT + slab * 0.5, Math.max(1.2, 0.0025 * k), 0, Math.PI * 2); c.fill();

    // 受力圖面板（卡片：淡漸層、柔和投影、頂邊高光）
    if (state.show.fbd) [A.fbdC, A.fbdH].forEach(function (R) { drawPanelCard(c, R); });
  }

  function drawPanelCard(c, R) {
    const dk = colors.dark;
    c.save();
    c.shadowColor = dk ? 'rgba(0,0,0,0.45)' : alpha(colors.text, 0.13);
    c.shadowBlur = 14;
    c.shadowOffsetY = 3;
    roundRect(c, R.x, R.y, R.w, R.h, 10);
    const g = c.createLinearGradient(0, R.y, 0, R.y + R.h);
    g.addColorStop(0, shade(colors.panel, dk ? 0.03 : 0));
    g.addColorStop(1, mix(colors.panel, colors['canvas-bg'], dk ? 0.35 : 0.55));
    c.fillStyle = g;
    c.fill();
    c.restore();
    c.strokeStyle = alpha(colors.text, dk ? 0.12 : 0.09);
    c.lineWidth = 1;
    roundRect(c, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 10);
    c.stroke();
    c.strokeStyle = alpha('#ffffff', dk ? 0.06 : 0.9);
    c.beginPath(); c.moveTo(R.x + 10, R.y + 1.5); c.lineTo(R.x + R.w - 10, R.y + 1.5); c.stroke();
  }

  /** 打點計時器機身（在軌道座標中畫，放在靜態圖層） */
  function drawTicker(c, k) {
    const s0 = -0.995 * k, s1 = -0.925 * k, h0 = -RAIL_H * k, h1 = -0.075 * k;
    const top = h1 + 0.012 * k;
    // 底座的接觸陰影
    LD.contactShadow(c, (s0 + s1) / 2, h0, (s1 - s0) / 2, 0);
    LD.block(c, s0, top, s1 - s0, h0 - top, colors.dev, { r: 3 });
    // 機身側面的散熱條紋
    c.strokeStyle = alpha(shade(colors.dev, -0.4), 0.45);
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < 3; i++) {
      const xx = Math.round(s1 - 0.008 * k - i * 0.005 * k) + 0.5;
      c.moveTo(xx, top + 0.012 * k); c.lineTo(xx, h0 - 0.02 * k);
    }
    c.stroke();
    // 線圈窗（銅線圈）
    const wx = s0 + 0.008 * k, wy = h1 + 0.022 * k, ww = 0.022 * k, wh = 0.018 * k;
    const cg = c.createLinearGradient(0, wy, 0, wy + wh);
    cg.addColorStop(0, shade(colors.brass, 0.35));
    cg.addColorStop(0.5, colors.brass);
    cg.addColorStop(1, shade(colors.brass, -0.3));
    c.fillStyle = cg;
    roundRect(c, wx, wy, ww, wh, 2);
    c.fill();
    c.strokeStyle = alpha(shade(colors.brass, -0.45), 0.5);
    c.beginPath();
    for (let y = wy + 2; y < wy + wh - 1; y += 2) { c.moveTo(wx + 1, Math.round(y) + 0.5); c.lineTo(wx + ww - 1, Math.round(y) + 0.5); }
    c.stroke();
    // 紙帶通過的縫
    c.fillStyle = alpha(shade(colors.dev, -0.5), 0.8);
    c.fillRect(s0 - 1, -TAPE_H * k - 1.5, s1 - s0 + 2, 3);
    // 複寫紙圓盤
    const cx = S_TICK * k, cy = -(TAPE_H + 0.008) * k, r = 0.009 * k;
    const dg = c.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    dg.addColorStop(0, shade(colors.rubber, 0.4));
    dg.addColorStop(0.7, colors.rubber);
    dg.addColorStop(1, shade(colors.rubber, -0.3));
    c.fillStyle = dg;
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = alpha(colors.metalHi, 0.8);
    c.beginPath(); c.arc(cx, cy, Math.max(0.8, r * 0.22), 0, Math.PI * 2); c.fill();
  }
  /** 打點計時器的振動臂（每一幀畫）；arm：往下打的程度 0–1 */
  function drawTickerArm(c, k, arm) {
    const s0 = -0.995 * k, h1 = -0.075 * k;
    const cx = S_TICK * k;
    const ay = h1 + 0.008 * k + (arm ? 0.004 * k * arm : 0);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = shade(colors.metalLo, -0.2);
    c.lineWidth = Math.max(2, 0.004 * k) + 1;
    c.beginPath(); c.moveTo(s0 + 0.01 * k, h1 + 0.012 * k); c.lineTo(cx, ay); c.lineTo(cx, ay + 0.006 * k); c.stroke();
    c.strokeStyle = colors.metalHi;
    c.lineWidth = Math.max(2, 0.004 * k) - 0.6;
    c.stroke();
    c.fillStyle = colors.metalLo;
    c.beginPath(); c.arc(s0 + 0.01 * k, h1 + 0.012 * k, Math.max(1.4, 0.003 * k), 0, Math.PI * 2); c.fill();
  }

  // ---------- 裝置：每一幀的動態部分 ----------
  let drawPendingA = false;
  function requestDraw() {
    if (drawPendingA) return;
    drawPendingA = true;
    requestAnimationFrame(function () { drawPendingA = false; drawAll(); });
  }
  function drawAll() { drawA(); drawTape(); drawGraph(); updateReadouts(); }

  function curX() { return state.x; }

  function drawA() {
    if (!A) return;
    const c = ctx, k = A.k;
    c.setTransform(A.dpr, 0, 0, A.dpr, 0, 0);
    c.clearRect(0, 0, A.w, A.h);
    c.drawImage(bg, 0, 0, A.w, A.h);
    const x = curX();
    const sR = S_REAR0 + x;

    // 光電閘（在小車後面）
    if (state.show.gates) drawGates(c, k, x, false);

    c.save();
    railFrame(c);
    // 紙帶：計時器左邊的尾巴、穿過計時器到車尾
    drawTapeOnTrack(c, k, sR, x);
    drawCart(c, k, sR);
    c.restore();
    if (state.show.gates) drawGates(c, k, x, true);

    // 打點計時器的振動臂（打點瞬間往下壓一下）與打點的小波紋（純裝飾）
    c.save();
    railFrame(c);
    const armOn = state.phase === 'running' && !reducedMotion ? tickerArm() : 0;
    drawTickerArm(c, k, armOn);
    if (armOn > 0.05) LD.ripple(c, S_TICK * k, -TAPE_H * k, Math.max(2, 0.004 * k), 1 - armOn, colors.ink);
    c.restore();

    drawPulleyString(c, k, x);
    drawLabels(c, k, x);
    drawFx(c);
    if (state.show.fbd) drawFBD(c);
  }

  /** 打點瞬間振動臂往下壓（純裝飾） */
  function tickerArm() {
    if (!state.tape) return 0;
    const f = state.tape.freq, ph = (state.t * f) % 1;
    return ph < 0.35 ? 1 - ph / 0.35 : 0;
  }

  function drawTapeOnTrack(c, k, sR, x) {
    const hT = -TAPE_H * k, tw = Math.max(2, 0.006 * k);
    c.lineJoin = 'round';
    // 尾巴：從計時器左邊垂下
    c.strokeStyle = colors.paperEdge;
    c.lineWidth = tw + 1;
    c.lineCap = 'butt';
    c.beginPath();
    c.moveTo(-0.93 * k, hT);
    c.lineTo(-1.0 * k, hT);
    c.bezierCurveTo(-1.035 * k, hT, -1.045 * k, hT + 0.02 * k, -1.04 * k, hT + 0.06 * k);
    c.stroke();
    c.strokeStyle = colors.paper;
    c.lineWidth = tw;
    c.stroke();
    // 計時器到車尾
    c.strokeStyle = colors.paperEdge;
    c.lineWidth = tw + 1;
    c.beginPath(); c.moveTo(-0.925 * k, hT); c.lineTo(sR * k, hT); c.stroke();
    c.strokeStyle = colors.paper;
    c.lineWidth = tw;
    c.stroke();
    // 紙面上緣的細高光（紙帶有一點厚度）
    c.strokeStyle = alpha('#ffffff', colors.dark ? 0.18 : 0.6);
    c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(-0.925 * k, hT - tw / 2 + 0.6); c.lineTo(sR * k, hT - tw / 2 + 0.6); c.stroke();
    // 紙帶上的點（隨小車移動）：第 k 點在 s = 打點針 + (x − x_k)
    const tp = state.tape;
    if (!tp || !tp.printed) return;
    c.fillStyle = colors.ink;
    const r = Math.max(0.9, Math.min(1.6, 0.0022 * k));
    c.beginPath();
    for (let i = 0; i < tp.printed; i++) {
      const s = S_TICK + (x - tp.trueX[i]);
      if (s > sR - 0.002 || s < -0.93) continue;
      c.moveTo(s * k + r, hT); c.arc(s * k, hT, r, 0, Math.PI * 2);
    }
    c.fill();
  }

  function drawCart(c, k, sR) {
    const x0 = sR * k, x1 = (sR + CART_L) * k;
    const yB = -BODY_B * k, yT = -BODY_T * k;
    const wy = -(RAIL_H + WHEEL_R) * k, wr = WHEEL_R * k;
    const wheels = [sR + 0.032, sR + CART_L - 0.032];
    const dk = colors.dark;
    // 接觸陰影：車身下方一片柔和的影子、每個輪子與軌道接觸處一小片
    LD.contactShadow(c, (x0 + x1) / 2, -RAIL_H * k, (x1 - x0) * 0.52, 0.3);
    wheels.forEach(function (s) { LD.contactShadow(c, s * k, -RAIL_H * k, wr * 0.95, 0); });
    // 車身：上亮下暗的立體方塊（LabDraw.block：頂邊高光、底邊暗線、輕微投影）
    const body = colors['b-mech'];
    LD.block(c, x0, yT, x1 - x0, yB - yT, body, { r: Math.max(3, 0.008 * k) });
    // 側面刻出來的凹槽（上暗下亮）與兩端的螺絲
    const ym = Math.round((yT + yB) / 2) + 0.5;
    c.lineWidth = 1;
    c.lineCap = 'round';
    c.strokeStyle = alpha(shade(body, -0.45), 0.55);
    c.beginPath(); c.moveTo(x0 + 0.014 * k, ym); c.lineTo(x1 - 0.014 * k, ym); c.stroke();
    c.strokeStyle = alpha(shade(body, 0.55), dk ? 0.35 : 0.5);
    c.beginPath(); c.moveTo(x0 + 0.014 * k, ym + 1); c.lineTo(x1 - 0.014 * k, ym + 1); c.stroke();
    if (k * 0.0025 >= 1) {
      [x0 + 0.0075 * k, x1 - 0.0075 * k].forEach(function (bx) {
        LD.ball(c, bx, ym, Math.max(1.2, 0.0024 * k), colors.steel, { shadow: false, glow: 0 });
      });
    }
    // 前方掛鉤、尾端紙帶夾
    c.strokeStyle = colors.metalLo;
    c.lineWidth = Math.max(1.5, 0.003 * k);
    c.beginPath(); c.arc(x1 + 0.005 * k, -HOOK_H * k, Math.max(2, 0.004 * k), -Math.PI * 0.6, Math.PI * 0.6); c.stroke();
    LD.block(c, x0 - 0.006 * k, -(TAPE_H + 0.006) * k, 0.008 * k, 0.012 * k, colors.steel, { r: 1.5, shadow: false });
    // 車上的鐵條砝碼（每條 0.25 kg，兩欄往上疊，最後一條依比例變薄）
    const load = Math.max(0, state.M - M_CART0);
    const nFull = Math.floor(load / BAR_KG + 1e-9), rem = load - nFull * BAR_KG;
    const slots = [];
    for (let i = 0; i < nFull; i++) slots.push(1);
    if (rem > 0.004) slots.push(rem / BAR_KG);
    const colW = BAR_W * k, gap = 0.006 * k, cxm = (x0 + x1) / 2;
    const tops = [yT, yT];
    slots.forEach(function (fr, i) {
      const col = i % 2;
      const bxl = col === 0 ? cxm - gap / 2 - colW : cxm + gap / 2;
      const hh = Math.max(1.5, BAR_H * k * fr);
      const yy = tops[col] - hh;
      tops[col] = yy;
      LD.block(c, bxl, yy, colW, hh, colors.steel, { r: Math.min(2, hh / 2), shadow: false, stroke: alpha(colors.metalLo, 0.85) });
    });
    // 車輪（隨位移轉動）：橡膠輪胎、金屬輪框、三支輻條、左上的高光弧
    const ang = state.x / WHEEL_R;
    wheels.forEach(function (s) {
      const cx = s * k;
      const wg = c.createRadialGradient(cx - wr * 0.3, wy - wr * 0.35, wr * 0.1, cx, wy, wr);
      wg.addColorStop(0, shade(colors.rubber, 0.38));
      wg.addColorStop(0.72, colors.rubber);
      wg.addColorStop(1, shade(colors.rubber, -0.35));
      c.fillStyle = wg;
      c.beginPath(); c.arc(cx, wy, wr, 0, Math.PI * 2); c.fill();
      const hg = c.createRadialGradient(cx - wr * 0.18, wy - wr * 0.2, 0, cx, wy, wr * 0.56);
      hg.addColorStop(0, shade(colors.metalHi, 0.35));
      hg.addColorStop(0.6, colors.metalHi);
      hg.addColorStop(1, colors.metal);
      c.fillStyle = hg;
      c.beginPath(); c.arc(cx, wy, wr * 0.56, 0, Math.PI * 2); c.fill();
      c.strokeStyle = alpha(colors.metalLo, 0.9);
      c.lineWidth = Math.max(0.8, wr * 0.08);
      c.stroke();
      c.lineWidth = Math.max(1, wr * 0.12);
      c.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = ang + i * Math.PI * 2 / 3;
        c.moveTo(cx, wy); c.lineTo(cx + Math.cos(a) * wr * 0.5, wy + Math.sin(a) * wr * 0.5);
      }
      c.stroke();
      c.fillStyle = colors.metalLo;
      c.beginPath(); c.arc(cx, wy, Math.max(1, wr * 0.13), 0, Math.PI * 2); c.fill();
      c.strokeStyle = alpha('#ffffff', dk ? 0.14 : 0.3);
      c.lineWidth = Math.max(0.8, wr * 0.1);
      c.beginPath(); c.arc(cx, wy, wr * 0.82, Math.PI * 1.08, Math.PI * 1.45); c.stroke();
    });
    // 光電閘用的遮光片（車頭的細桿上，前緣與車頭對齊）
    if (state.show.gates) {
      const fx1 = x1, fx0 = x1 - FLAG_W * k, fy0 = -0.103 * k, fy1 = -0.128 * k;
      c.strokeStyle = colors.metalLo;
      c.lineWidth = Math.max(1.5, 0.003 * k);
      c.beginPath(); c.moveTo(fx1 - 0.006 * k, yT); c.lineTo(fx1 - 0.006 * k, fy0); c.stroke();
      LD.block(c, fx0, fy1, fx1 - fx0, fy0 - fy1, colors.rubber, { r: 1.5, shadow: false });
    }
  }

  /** 光電閘：front = false 畫在小車後方的支桿與 U 形頭的後臂，true 畫前臂（半透明）、光束與指示燈 */
  function drawGates(c, k, x, front) {
    c.save();
    railFrame(c);
    GATE_X.forEach(function (gx, i) {
      const s = (S_REAR0 + CART_L + gx) * k; // 光束位置：遮光片前緣（車頭）到這裡時開始遮光
      const blocked = x >= gx && x <= gx + FLAG_W;
      const h0 = -0.098 * k, h1 = -0.138 * k, hw = 0.014 * k;
      if (!front) {
        // 支桿（夾在軌道側面）與後臂
        const rg = c.createLinearGradient(s + hw * 0.6 - 2, 0, s + hw * 0.6 + 2, 0);
        rg.addColorStop(0, colors.metalHi);
        rg.addColorStop(1, colors.metalLo);
        c.strokeStyle = rg;
        c.lineWidth = Math.max(2, 0.004 * k);
        c.lineCap = 'round';
        c.beginPath(); c.moveTo(s + hw * 0.6, -RAIL_H * k * 0.5); c.lineTo(s + hw * 0.6, h1); c.stroke();
        LD.block(c, s - hw, h1, 2 * hw, h0 - h1, shade(colors.dev, -0.12), { r: 3, shadow: false });
        return; // 標號在 drawLabels 最後畫（避開小車質量標籤）
      }
      // 前臂：半透明，看得到後面的遮光片
      const g = c.createLinearGradient(0, h1, 0, h0);
      g.addColorStop(0, alpha(shade(colors.dev, 0.35), 0.62));
      g.addColorStop(1, alpha(shade(colors.dev, 0.02), 0.62));
      c.fillStyle = g;
      roundRect(c, s - hw, h1, 2 * hw, h0 - h1, 3);
      c.fill();
      c.strokeStyle = alpha(shade(colors.dev, -0.3), 0.5);
      c.lineWidth = 1;
      roundRect(c, s - hw + 0.5, h1 + 0.5, 2 * hw - 1, h0 - h1 - 1, 3);
      c.stroke();
      c.strokeStyle = alpha(shade(colors.dev, 0.7), 0.7);
      c.beginPath(); c.moveTo(s - hw + 3, h1 + 1.5); c.lineTo(s + hw - 3, h1 + 1.5); c.stroke();
      // 光束（虛線）
      const yb = -0.116 * k;
      c.strokeStyle = alpha(blocked ? colors.pos : colors.probe, 0.9);
      c.lineWidth = 1.2;
      c.setLineDash([2, 2]);
      c.beginPath(); c.moveTo(s - hw + 2, yb); c.lineTo(s + hw - 2, yb); c.stroke();
      c.setLineDash([]);
      // 指示燈：被遮住時變紅、亮起光暈
      const lc = blocked ? colors.pos : colors.probe, lr = Math.max(1.8, 0.0035 * k);
      LD.ball(c, s, h1 + 0.007 * k, lr, lc, { shadow: false, glow: blocked && !reducedMotion ? 0.75 : 0 });
    });
    c.restore();
  }

  function drawPulleyString(c, k, x) {
    const th = state.thDeg * DEG, dk = colors.dark;
    const pc = pulleyCenter(), px = X(pc[0]), py = Y(pc[1]), R = PULLEY_R * k;
    // 繩子
    if (state.attached) {
      const hook = L2P(S_REAR0 + x + CART_L + 0.009, HOOK_H);
      const tan = L2P(PULLEY_S, HOOK_H);
      const yHook = Y(pc[1] - HANG0 - x);
      c.strokeStyle = colors.string;
      c.lineWidth = Math.max(1.2, 0.0025 * k);
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(hook[0], hook[1]);
      c.lineTo(tan[0], tan[1]);
      c.arc(px, py, R, -Math.PI / 2 + th, 0, false);
      c.lineTo(px + R, yHook);
      c.stroke();
      drawHanger(c, k, px + R, yHook);
    }
    // 滑輪（隨繩子轉動）：投影、金屬漸層、輪溝、四支輻條、輪軸
    const disc = function (g) { g.beginPath(); g.arc(px, py, R, 0, Math.PI * 2); };
    softDrop(c, disc, dk ? 0.35 : 0.13, 1, 1.6);
    const g = c.createRadialGradient(px - R * 0.35, py - R * 0.38, R * 0.08, px, py, R);
    g.addColorStop(0, shade(colors.metalHi, 0.4));
    g.addColorStop(0.35, colors.metalHi);
    g.addColorStop(0.8, colors.metal);
    g.addColorStop(1, colors.metalLo);
    c.fillStyle = g;
    disc(c); c.fill();
    c.strokeStyle = alpha(colors.metalLo, 0.95);
    c.lineWidth = Math.max(1, R * 0.12);
    c.beginPath(); c.arc(px, py, R * 0.82, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = alpha(shade(colors.metalHi, 0.5), dk ? 0.3 : 0.6);
    c.lineWidth = 1;
    c.beginPath(); c.arc(px, py, R * 0.82 + Math.max(1, R * 0.12) * 0.5 + 0.5, Math.PI * 1.05, Math.PI * 1.55); c.stroke();
    const ang = x / PULLEY_R;
    c.strokeStyle = alpha(colors.metalLo, 0.9);
    c.lineWidth = Math.max(1, R * 0.1);
    c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = ang + i * Math.PI / 2;
      c.moveTo(px + Math.cos(a) * R * 0.2, py + Math.sin(a) * R * 0.2);
      c.lineTo(px + Math.cos(a) * R * 0.74, py + Math.sin(a) * R * 0.74);
    }
    c.stroke();
    LD.ball(c, px, py, Math.max(2, R * 0.2), colors.steel, { shadow: false, glow: 0 });
  }

  /** 吊掛物：掛鉤、細桿、底盤與槽碼（依質量疊高） */
  function drawHanger(c, k, x, yTop) {
    const hookH = 0.018 * k, dk = colors.dark;
    const stack = Math.max(0, state.m - M_HOOK) * STACK_PER_KG * k;
    const rodL = Math.max(0.05 * k, stack + 0.014 * k);
    const yBase = yTop + hookH + rodL;
    const discW = 0.034 * k, baseH = Math.max(2, 0.005 * k);
    // 掛鉤
    c.strokeStyle = colors.metalLo;
    c.lineWidth = Math.max(1.5, 0.003 * k);
    c.lineCap = 'round';
    c.beginPath();
    c.arc(x - 0.004 * k, yTop + 0.006 * k, 0.004 * k, -Math.PI / 2, Math.PI * 0.9, false);
    c.moveTo(x, yTop + 0.006 * k); c.lineTo(x, yTop + hookH);
    c.stroke();
    // 細桿
    const rg = c.createLinearGradient(x - 2, 0, x + 2, 0);
    rg.addColorStop(0, colors.metalHi);
    rg.addColorStop(1, colors.metalLo);
    c.strokeStyle = rg;
    c.lineWidth = Math.max(2, 0.004 * k);
    c.beginPath(); c.moveTo(x, yTop + hookH); c.lineTo(x, yBase); c.stroke();
    // 槽碼與底盤的投影（掛在空中，只有很淡的偏移影子）
    const yS = yBase - stack;
    softDrop(c, function (g) { roundRect(g, x - discW / 2 - 1, yS, discW + 2, stack + baseH, 2); }, dk ? 0.3 : 0.1, 1, 1.4);
    // 槽碼：每 10 g 一片，片太薄時改成每 50 g、100 g 一條分隔線；橫向漸層＝圓柱的光澤
    if (stack > 0.5) {
      const gb = c.createLinearGradient(x - discW / 2, 0, x + discW / 2, 0);
      gb.addColorStop(0, shade(colors.brass, -0.22));
      gb.addColorStop(0.28, shade(colors.brass, 0.38));
      gb.addColorStop(0.45, shade(colors.brass, 0.12));
      gb.addColorStop(1, shade(colors.brass, -0.38));
      c.fillStyle = gb;
      roundRect(c, x - discW / 2, yS, discW, stack, Math.min(2, stack / 2));
      c.fill();
      const per = [0.01, 0.05, 0.1, 0.2].find(function (q) { return q * STACK_PER_KG * k >= 3; }) || 0.2;
      c.strokeStyle = alpha(shade(colors.brass, -0.5), 0.55);
      c.lineWidth = 1;
      c.beginPath();
      for (let q = per; q < state.m - M_HOOK - 1e-9; q += per) {
        const yy = Math.round(yBase - q * STACK_PER_KG * k) + 0.5;
        c.moveTo(x - discW / 2 + 1, yy); c.lineTo(x + discW / 2 - 1, yy);
      }
      c.stroke();
      // 每片的上緣細高光
      c.strokeStyle = alpha(shade(colors.brass, 0.7), dk ? 0.25 : 0.45);
      c.beginPath();
      for (let q = per; q < state.m - M_HOOK - 1e-9; q += per) {
        const yy = Math.round(yBase - q * STACK_PER_KG * k) + 1.5;
        c.moveTo(x - discW / 2 + 2, yy); c.lineTo(x + discW / 2 - 2, yy);
      }
      c.stroke();
      // 中間的缺口（槽）
      c.fillStyle = alpha(shade(colors.brass, -0.55), 0.5);
      c.fillRect(x - 1, yS, 2, stack);
      roundRect(c, x - discW / 2 + 0.5, yS + 0.5, discW - 1, stack - 1, Math.min(2, stack / 2));
      c.strokeStyle = alpha(shade(colors.brass, -0.45), 0.45);
      c.stroke();
    }
    // 底盤
    LD.block(c, x - discW / 2 - 1, yBase, discW + 2, baseH, colors.steel, { r: baseH / 2, shadow: false });
    A.hangerBox = { x: x, y0: yTop, y1: yBase + baseH };
  }

  function drawLabels(c, k, x) {
    const small = A.narrow ? 11 : 12;
    const f = '600 ' + small + 'px ' + FF;
    const fb = '700 ' + small + 'px ' + FF;
    const used = []; // 角落標籤的位置，小車標籤要避開
    const ph = pillH(c, 'θ 0', f);
    // 左上角：傾角與慢動作
    let yy = 5 + ph / 2;
    c.textAlign = 'left';
    if (state.thDeg > 0.001) {
      used.push(pill(c, 'θ = ' + num(state.thDeg, 2) + '°' + T('（墊高 ', ' (raised ') + num(NS.heightFromAngle(state.thDeg * DEG, 1) * 100, 1) + T(' cm）', ' cm)'),
        10, yy, colors.text, f));
      yy += ph + 4;
    }
    if (state.slow) used.push(pill(c, T('慢動作 0.25×', 'Slow motion 0.25×'), 10, yy, colors.accent, f));
    // 右上角：時間與速度
    if (state.run && state.phase !== 'ready') {
      const v = NS.vAt(state.run, state.t);
      c.textAlign = 'right';
      used.push(pill(c, 't = ' + num(state.t, 3) + ' s', A.w - 10, 5 + ph / 2, colors.text, f));
      used.push(pill(c, 'v = ' + num(v, 3) + ' m/s', A.w - 10, 9 + ph * 1.5, colors.text, f));
    }
    // 寬畫面：打點計時器的名稱（先畫，小車標籤要避開它）
    if (!A.narrow) {
      const tk = L2P(-0.96, 0.08);
      c.textAlign = 'left';
      used.push(pill(c, T('打點計時器', 'Ticker timer'), tk[0] - 0.035 * k, tk[1] - 8, colors.muted, f));
    }
    // 小車質量（跟著小車走；碰到角落標籤時往旁邊讓開，不可跑出畫面）
    const rows = Math.ceil(Math.max(0, state.M - M_CART0 - 0.004) / BAR_KG / 2);
    const top = L2P(S_REAR0 + x + CART_L / 2, BODY_T + 0.012 + rows * BAR_H + (state.show.gates ? 0.07 : 0));
    const mt = 'M = ' + num(state.M, 3) + ' kg';
    const w = textW(c, mt, fb) + 12, h = pillH(c, mt, fb);
    let cy = Math.max(h / 2 + 2, top[1] - 4);
    const hit = function (q) {
      return used.some(function (r) { return cy + h / 2 > r.y - 2 && cy - h / 2 < r.y + r.h + 2 && q + w / 2 + 3 > r.x && q - w / 2 - 3 < r.x + r.w; });
    };
    const inside = function (q) { return q - w / 2 >= 2 && q + w / 2 <= A.w - 2; };
    let cx = Math.max(w / 2 + 2, Math.min(A.w - w / 2 - 2, top[0]));
    if (hit(cx)) {
      const cands = [];
      used.forEach(function (r) { cands.push(r.x + r.w + w / 2 + 5, r.x - w / 2 - 5); });
      cands.sort(function (a, b) { return Math.abs(a - top[0]) - Math.abs(b - top[0]); });
      const ok = cands.find(function (q) { return inside(q) && !hit(q); });
      if (ok !== undefined) cx = ok;
    }
    // 真的放不下（窄畫面＋大字＋角落標籤很多）：受力圖打開時省略（小車受力圖的副標已寫 M）；
    // 受力圖關閉時桌面下方是空的，改放在小車正下方的桌子底下。都不蓋住其他文字。
    let skipM = false;
    if (hit(cx)) {
      if (state.show.fbd) skipM = true;
      else { cy = Y(0) + 0.03 * k + h / 2 + 6; cx = Math.max(w / 2 + 2, Math.min(A.w - w / 2 - 2, top[0])); }
    }
    c.textAlign = 'center';
    const mBox = skipM ? null : pill(c, mt, cx, cy, colors['b-mech'], fb);
    // 光電閘標號（閘的正上方）：被小車質量標籤擋住時暫時不畫，不讓文字疊在一起
    if (state.show.gates) {
      const gf = '700 11px ' + FF, gh = pillH(c, '2', gf) - 3;
      GATE_X.forEach(function (gx, i) {
        const p = L2P(S_REAR0 + CART_L + gx, 0.138 + 3 / k);
        const gb = { x: p[0] - 7, y: p[1] - gh - 1, w: 14, h: gh + 2 };
        if (mBox && overlaps(gb, mBox)) return;
        LD.haloText(c, String(i + 1), p[0], p[1], colors.muted, 'center', 'bottom', gf);
      });
    }
    // 吊掛物質量（受力圖關閉時才標在畫面上；打開時寫在受力圖標題）
    if (state.attached && A.hangerBox && !state.show.fbd) {
      c.textAlign = 'right';
      pill(c, 'm = ' + num(state.m, 3) + ' kg', A.hangerBox.x - 0.03 * k, (A.hangerBox.y0 + A.hangerBox.y1) / 2,
        shade(colors.equi, colors.dark ? 0.15 : -0.15), fb);
    }
    // 打點計時器：機身上印頻率；寬畫面在上方加名稱
    if (!A.narrow) {
      c.save();
      railFrame(c);
      c.font = '700 9px ' + FF;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = colors.dark ? alpha(colors.text, 0.9) : alpha(colors['canvas-bg'], 0.95);
      c.fillText(state.freq + ' Hz', -0.96 * k + 0.012 * k, -0.05 * k);
      c.restore();
    }
  }

  function drawFx(c) {
    const now = performance.now();
    state.fx = state.fx.filter(function (e) { return now - e.t0 < e.dur; });
    state.fx.forEach(function (e) {
      const u = (now - e.t0) / e.dur;
      if (e.type === 'hit') {
        // 撞上擋板：短暫閃光＋兩圈向外淡出的波紋
        const p = L2P(S_END, 0.04);
        if (u < 0.45) {
          const fr = 4 + 16 * u, fa = 0.55 * (1 - u / 0.45);
          const fg = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], fr);
          fg.addColorStop(0, alpha(shade(colors['b-mech'], 0.5), fa));
          fg.addColorStop(1, alpha(colors['b-mech'], 0));
          c.fillStyle = fg;
          c.beginPath(); c.arc(p[0], p[1], fr, 0, Math.PI * 2); c.fill();
        }
        LD.ripple(c, p[0], p[1], 9, u, colors['b-mech']);
        LD.ripple(c, p[0], p[1], 5, Math.min(1, u * 1.5), colors['b-mech']);
      } else if (e.type === 'push') {
        const p = L2P(S_REAR0 - 0.01, 0.045);
        c.globalAlpha = 1 - u;
        arrow(c, p[0] - 30, p[1], Math.cos(state.thDeg * DEG), Math.sin(state.thDeg * DEG), 26, 2.4, colors['b-mech']);
        c.globalAlpha = 1;
      }
    });
    if (state.fx.length) requestDraw();
  }

  // ---------- 受力圖 ----------
  function fbdForces() {
    const d = NS.dynamics(physParams());
    const out = { th: state.thDeg * DEG, Mg: state.M * G, N: d.N, Wpar: d.Wpar, attached: state.attached, mystery: state.mystery };
    if (state.attached) {
      out.mg = d.W;
      if (d.startsFromRest) {
        out.mode = 'move'; out.T = d.T; out.f = d.f; out.net = state.M * d.aMove; out.netH = state.m * d.aMove;
      } else {
        out.mode = 'static'; out.T = d.W; out.f = d.drive; out.net = 0; out.netH = 0;
      }
    } else {
      const stoppedRest = state.phase === 'done' && state.run && state.run.stopped && state.run.moves;
      if (stoppedRest) { out.mode = 'rest'; out.T = 0; out.f = d.Wpar; out.net = 0; }
      else { out.mode = 'push'; out.T = 0; out.f = d.f; out.net = state.M * d.aMove; }
    }
    return out;
  }

  /** 字型大小自動縮小到放得下 maxW */
  function fitFont(c, text, weight, size, maxW, minSize) {
    let fsz = size;
    const lo = minSize || 8;
    c.font = weight + ' ' + fsz + 'px ' + FF;
    while (fsz - 0.5 >= lo && c.measureText(text).width > maxW) { fsz -= 0.5; c.font = weight + ' ' + fsz + 'px ' + FF; }
    return c.font;
  }
  /**
   * 受力圖面板的標題與副標（面板本身的卡片畫在靜態圖層）。titles：[完整標題, 放不下時的短標題]；
   * 副標 = sub（質量）＋ status（運動狀態），放不下時先省略狀態。傳回標題區的底緣（y）。
   */
  function panel(c, R, titles, sub, status) {
    const fs = A.narrow ? 11 : 13, fss = 11, room = R.w - 18;
    c.textAlign = 'left';
    c.textBaseline = 'top';
    let title = titles[0];
    if (textW(c, title, '700 ' + fs + 'px ' + FF) > room && titles[1]) title = titles[1];
    fitFont(c, title, '700', fs, room);
    // 行高 ≈ 1.2 em（fontBoundingBox 約 1.33 em）
    const th = 0.9 * LD.textHeight(c.measureText(title), fs * 1.33);
    const y0 = R.y + 6;
    c.fillStyle = colors.text;
    c.fillText(title, R.x + 9, y0);
    let bottom = y0 + th;
    if (sub) {
      let line = status ? sub + T('，', ', ') + status : sub;
      if (status && textW(c, line, '600 ' + fss + 'px ' + FF) > room) line = sub;
      fitFont(c, line, '600', fss, room);
      c.fillStyle = colors.muted;
      c.fillText(line, R.x + 9, bottom);
      bottom += 0.9 * LD.textHeight(c.measureText(line), fss * 1.33);
    }
    return bottom + 1;
  }

  /** 多行標籤的總高度（第一行完整行高，之後每行略緊） */
  function linesH(lh, n) { return lh + lh * 0.86 * (n - 1) + 3; }
  /**
   * 多行圓角底框標籤（與 LabDraw.pill 同款）。align：left（x 為文字左緣）／right（文字右緣）／center；y 為垂直中心。
   * pad：左右內距（預設 6，與 LabDraw.pill 相同；空間很緊時可用 4）。
   */
  function pillLines(c, lines, x, y, color, font, align, pad) {
    pad = pad == null ? 6 : pad;
    c.font = font;
    const lh = LD.textHeight(c.measureText(lines[0]), 15);
    let tw = 0;
    lines.forEach(function (l) { tw = Math.max(tw, c.measureText(l).width); });
    const pw = tw + 2 * pad, ph = linesH(lh, lines.length);
    const bx = align === 'center' ? x - pw / 2 : align === 'right' ? x + 6 - pw : x - 6;
    const by = y - ph / 2;
    roundRect(c, bx, by, pw, ph, Math.min(ph / 2, 8));
    c.fillStyle = alpha(colors['canvas-bg'], colors.dark ? 0.86 : 0.9);
    c.fill();
    c.strokeStyle = alpha(color, colors.dark ? 0.45 : 0.35);
    c.lineWidth = 1;
    c.stroke();
    c.fillStyle = color;
    c.textBaseline = 'middle';
    c.textAlign = align === 'center' ? 'center' : align;
    const tx = align === 'center' ? bx + pw / 2 : align === 'right' ? bx + pw - pad : bx + pad;
    lines.forEach(function (l, i) { c.fillText(l, tx, by + 1.5 + lh * 0.5 + lh * 0.86 * i + 0.5); });
    return { x: bx, y: by, w: pw, h: ph };
  }
  function overlaps(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

  /**
   * 箭頭旁的標籤，依序嘗試幾個位置，取第一個在面板內、又不碰到 avoid（比例尺、其他標籤、箭頭）的位置：
   *  水平的箭頭：尖端外側 → 尖端內側的上方或下方（alt = −1 先試上方、1 先試下方）
   *  垂直的箭頭：尖端外側（置中）→ 尖端旁的右側或左側（pref = 'left' 先試左側）
   * top：標題區底緣（標籤不可蓋到標題）。dry 為 true 時只傳回會放的位置、不畫。
   */
  function forceLabel(c, text, x, y, ux, uy, color, font, R, alt, top, avoid, pref, dry) {
    c.font = font;
    const w = c.measureText(text).width + 12, h = pillH(c, text, font);
    top = top || R.y + 2;
    avoid = avoid || [];
    const clampY = function (v) { return Math.max(top + h / 2, Math.min(R.y + R.h - h / 2 - 2, v)); };
    const boxOf = function (q) {
      const bx = q.a === 'center' ? q.x - w / 2 : q.a === 'right' ? q.x + 6 - w : q.x - 6;
      return { x: bx, y: q.y - h / 2, w: w, h: h };
    };
    const inPanel = function (b) { return b.x >= R.x + 1.5 && b.x + b.w <= R.x + R.w - 1.5; }; // 留 0.5 px 容差（浮點誤差）
    const hits = function (b) { return avoid.some(function (r) { return r && overlaps(b, r); }); };
    const cands = [];
    if (Math.abs(ux) > 0.5) {
      cands.push({ a: ux > 0 ? 'left' : 'right', x: x + ux * 10, y: clampY(y + uy * 10) });
      const inward = ux > 0 ? 'right' : 'left';
      const xi = ux > 0 ? Math.min(x + 4, R.x + R.w - 6) : Math.max(x - 4, R.x + 6);
      const d = (alt || -1) * (h / 2 + 5);
      cands.push({ a: inward, x: xi, y: clampY(y + d) });
      cands.push({ a: inward, x: xi, y: clampY(y - d) });
    } else {
      const ly = clampY(y + uy * (h / 2 + 2));
      const coversTip = uy < 0 ? ly + h / 2 > y + 3 : ly - h / 2 < y - 3;
      if (!coversTip) cands.push({ a: 'center', x: Math.max(R.x + w / 2 + 4, Math.min(R.x + R.w - w / 2 - 4, x)), y: ly });
      // 尖端旁：往上的箭頭放在尖端下方一點，往下的放在尖端上方一點
      const yy = uy < 0 ? clampY(y + h / 2 - 2) : clampY(y - h / 2 + 2);
      const sides = [{ a: 'left', x: Math.min(x + 12, R.x + R.w - w + 4), y: yy }, { a: 'right', x: Math.max(x - 12, R.x + w - 4), y: yy }];
      if (pref === 'left') sides.reverse();
      cands.push(sides[0], sides[1]);
    }
    // 放在箭頭旁的標籤不可橫跨箭身（會蓋住箭頭尖端）
    const crosses = function (q, b) { return q.a !== 'center' && Math.abs(ux) <= 0.5 && b.x < x && b.x + b.w > x; };
    const clean = cands.find(function (q) { const b = boxOf(q); return inPanel(b) && !hits(b) && !crosses(q, b); });
    const pick = clean || cands.find(function (q) { return inPanel(boxOf(q)); }) || cands[cands.length > 1 ? 1 : 0];
    if (dry) { const bb = boxOf(pick); bb.q = pick; bb.clean = !!clean; return bb; }
    c.textAlign = pick.a;
    return pill(c, text, pick.x, pick.y, color, font);
  }

  function drawFBD(c) {
    const fb = fbdForces();
    const RC = A.fbdC, RH = A.fbdH;
    const fs = A.narrow ? 11 : 12;
    const font = '600 ' + fs + 'px ' + FF;
    const fontS = '600 11px ' + FF;
    const lw = A.narrow ? 2.2 : 2.8;
    const unit = ' N';
    const st = {
      move: T('運動中', 'moving'),
      static: T('靜止（拉不動）', 'at rest'),
      push: T('推出後運動中', 'moving'),
      rest: T('停下後靜止', 'at rest')
    }[fb.mode];
    const hbC = panel(c, RC, [T('小車受力圖', 'Forces on the cart'), T('小車受力圖', 'Cart forces')], 'M = ' + num(state.M, 3) + ' kg', st);
    const hbH = panel(c, RH, [T('吊掛物受力圖', 'Forces on the hanger'), T('吊掛物受力圖', 'Hanger forces')], fb.attached ? 'm = ' + num(state.m, 3) + ' kg' : '', st);

    // 比例：小的力（T、f、Mg sinθ、合力、吊掛物的 mg）共用一個比例，讓它們看得清楚
    // 標題區高度與原本相同；字體放大時才加高，箭頭不會蓋到標題
    // 底部比例尺區：字體放大時跟著加高，Mg 的標籤才不會壓到比例尺（字體 ×1 時與原本相同）
    const ks = 1 + (((window.LabSettings && LabSettings.get('fs')) || 1) - 1) * 0.7;
    // 字體放大時標題區也加高：被截斷的 N 箭頭尖端上方只留 16 px，要放得下 N 的標籤（字體 ×1 時與原本相同）
    const hLab = ks > 1 ? pillH(c, 'N', font) - 13 : 0;
    const hdr = Math.max(A.narrow ? 38 : 48, Math.ceil(hbC - RC.y + hLab), Math.ceil(hbH - RH.y + hLab));
    const foot = ks > 1 ? Math.ceil(22 * ks + 2) : 22;
    const cxC = RC.x + RC.w / 2, topC = RC.y + hdr, botC = RC.y + RC.h - foot;
    const cyC = (topC + botC) / 2;
    const halfW = RC.w / 2 - 14, halfV = (botC - topC) / 2 - 16;
    const cxH = fb.attached ? RH.x + RH.w * (A.narrow ? 0.36 : 0.42) : RH.x + RH.w / 2, topH = RH.y + hdr, botH = RH.y + RH.h - 6;
    const cyH = (topH + botH) / 2;
    const halfVH = (botH - topH) / 2 - 16;
    const smallC = Math.max(fb.T || 0, fb.f || 0, fb.Wpar || 0, Math.abs(fb.net) || 0);
    let kF = smallC > 1e-9 ? (halfW - 6) / smallC : 1e9;
    if (fb.attached && fb.mg > 0) kF = Math.min(kF, (halfVH - 4) / fb.mg);
    if (!(kF < 1e8)) kF = halfV / Math.max(fb.Mg, 1e-9);
    kF = Math.min(kF, 400);
    const myst = fb.mystery;
    const nominal = Math.min(halfW * 0.6, 46); // 未知摩擦時的示意長度
    const lenOf = function (F) { return myst ? (F > 1e-9 ? nominal : 0) : F * kF; };
    const vtxt = function (F) { return myst ? '' : ' = ' + sig(F, 3) + unit; };

    // 比例尺／示意說明（左下角，半透明底框）：先算好位置，力的標籤要避開
    const footY = RC.y + RC.h - 10;
    let footRect, sv = 0, sl = 0, footText;
    if (myst) {
      footText = T('示意圖（未依比例）：μ 未知', 'Not to scale: μ unknown');
      const f2 = fitFont(c, footText, '600', 11, RC.w - 24);
      const bh = pillH(c, footText, f2);
      footRect = { x: RC.x + 6, y: footY - bh / 2, w: textW(c, footText, f2) + 12, h: bh, font: f2 };
    } else {
      const cands = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10];
      sv = cands[0];
      cands.forEach(function (q) { if (q * kF <= Math.min(60, RC.w * 0.3)) sv = q; });
      sl = sv * kF;
      footText = num(sv, sv < 0.1 ? 2 : sv < 1 ? 1 : 0) + ' N';
      const bh = pillH(c, footText, fontS);
      footRect = { x: RC.x + 5, y: footY - bh / 2, w: sl + textW(c, footText, fontS) + 24, h: bh, font: fontS };
    }

    const th = fb.th, ux = Math.cos(th), uy = Math.sin(th); // 沿軌道朝滑輪（畫布座標）
    const nx = Math.sin(th), ny = -Math.cos(th);             // 垂直軌道向上
    // 小車：示意方塊（隨軌道傾斜）、接觸面（細線＋斜線）
    const bw = A.narrow ? 28 : 46, bh = A.narrow ? 14 : 24;
    c.save();
    c.translate(cxC, cyC);
    c.rotate(th);
    c.lineCap = 'round';
    c.strokeStyle = alpha(colors.muted, 0.6);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(-bw, bh / 2 + 0.5); c.lineTo(bw, bh / 2 + 0.5); c.stroke();
    c.strokeStyle = alpha(colors.muted, 0.28);
    c.beginPath();
    for (let xh = -bw + 5; xh <= bw; xh += 5) { c.moveTo(xh, bh / 2 + 1.5); c.lineTo(xh - 4, bh / 2 + 5.5); }
    c.stroke();
    c.globalAlpha = colors.dark ? 0.6 : 0.5;
    LD.block(c, -bw / 2, -bh / 2, bw, bh, colors['b-mech'], { r: 4, shadow: false });
    c.globalAlpha = 1;
    c.restore();

    // ---- 箭頭（先畫全部箭頭，標籤最後畫在上面）----
    const bigs = [];
    const big = function (F, dx, dy, color, label) {
      const full = F * kF, maxL = halfV;
      const brk = full > maxL;
      const len = Math.min(full, maxL);
      arrow(c, cxC, cyC, dx, dy, len, lw, color, brk, false, colors.panel);
      bigs.push({ text: label + ' = ' + sig(F, 3) + unit + (brk ? ' ≈' : ''), x: cxC + dx * len, y: cyC + dy * len, dx: dx, dy: dy, color: color });
    };
    big(fb.N, nx, ny, colors.neg, 'N');
    big(fb.Mg, 0, 1, colors.pos, 'Mg');
    const lT = fb.T > 1e-9 ? lenOf(fb.T) : 0, lf = fb.f > 1e-9 ? lenOf(fb.f) : 0;
    if (lT) arrow(c, cxC, cyC, ux, uy, lT, lw, colors.accent);
    if (lf) arrow(c, cxC, cyC, -ux, -uy, lf, lw, colors.equi);
    const offW = A.narrow ? 7 : 9;
    const lWp = fb.Wpar > 1e-9 ? fb.Wpar * kF : 0;
    const oxW = -nx * offW, oyW = -ny * offW;
    if (lWp) arrow(c, cxC + oxW, cyC + oyW, ux, uy, Math.min(lWp, halfW), lw * 0.75, alpha(colors.pos, 0.85), lWp > halfW, true, colors.panel);
    // 合力（虛線）：畫在方塊上方，平行軌道
    const offN = 24;
    const nxp = cxC + nx * offN, nyp = cyC + ny * offN;
    const sgn = fb.net > 0 ? 1 : -1;
    const lN = Math.abs(fb.net) > 1e-9 ? (myst ? nominal * 0.7 : Math.abs(fb.net) * kF) : 0;
    if (lN) arrow(c, nxp, nyp, ux * sgn, uy * sgn, lN, lw * 0.8, colors['b-mech'], false, true);
    // 受力點（方塊中心）
    LD.ball(c, cxC, cyC, lw * 1.1, colors.text, { shadow: false, glow: 0 });

    // ---- 標籤 ----
    const placed = [footRect];
    const fText = lf ? (fb.mode === 'static' || fb.mode === 'rest' ? T('f（靜）', 'f (static)') : 'f') + (myst ? ' = ?' : vtxt(fb.f)) : '';
    const wText = lWp ? 'Mg sinθ' + (myst ? '' : ' = ' + sig(fb.Wpar, 2) + unit) : '';
    if (A.narrow) {
      // 窄畫面：沿軌道的力的標籤排在中心線左右兩側，由軸往外堆疊、互不重疊；放不下就拆成兩行（名稱／= 數值）。
      // N、Mg 的標籤先找好位置；沿軌道的標籤碰到它們時，先看 N／Mg 的標籤能不能換到別處（不碰任何標籤），不行就換下一個備案。
      const lanes = { R: { up: cyC - 3, dn: cyC + 3 }, L: { up: cyC - 3, dn: cyC + 3 } };
      const bigPref = function (b) { return lN && sgn > 0 && b.dy < 0 ? 'left' : 'right'; };
      const dryBig = function (i, avoid) {
        const b = bigs[i];
        return forceLabel(c, b.text, b.x, b.y, b.dx, b.dy, null, font, RC, -1, hbC, avoid, bigPref(b), true);
      };
      const bigB = [dryBig(0, [footRect]), null];
      bigB[1] = dryBig(1, [footRect, bigB[0]]);
      const bigsMove = function (box) {
        for (let i = 0; i < 2; i++) {
          if (!overlaps(box, bigB[i])) continue;
          const t = dryBig(i, [footRect, bigB[1 - i], box].concat(placed));
          if (!t.clean) return false;
          bigB[i] = t;
        }
        return true;
      };
      const stackLabel = function (text, sideR, dir, pref, limit, color, force, at) {
        const lane = lanes[sideR ? 'R' : 'L'];
        const x = sideR ? cxC + 3 : cxC - 3;
        const room = (sideR ? RC.x + RC.w - 2 - x : x - RC.x - 2) - 12;
        // 一行 → 一行（內距縮小）→ 兩行（名稱／= 數值）→ 兩行（內距縮小）→ 兩行並縮小字體（實際字級不小於 11 px）
        let lines = [text], f2 = font, pad = 6;
        const tw = textW(c, text, font), minF = 11 / ks;
        const cut = text.indexOf(' = ');
        const two = cut > 0 ? [text.slice(0, cut), text.slice(cut + 1)] : null;
        const tw2 = two ? Math.max(textW(c, two[0], font), textW(c, two[1], font)) : Infinity;
        if (tw <= room) { /* 一行 */ }
        else if (tw <= room + 4) pad = 4;
        else if (two && tw2 <= room) lines = two;
        else if (two && tw2 <= room + 4) { lines = two; pad = 4; }
        else if (two) { lines = two; pad = 4; f2 = fitFont(c, textW(c, two[0], font) > textW(c, two[1], font) ? two[0] : two[1], '600', fs, room + 4, minF); }
        else f2 = fitFont(c, text, '600', fs, room, minF);
        c.font = f2;
        const h = linesH(LD.textHeight(c.measureText(lines[0]), 15), lines.length);
        let cy;
        if (at != null) cy = at(h); // 指定位置（備案）
        else if (dir < 0) cy = Math.min(pref, Math.min(lane.up, limit == null ? Infinity : limit) - h / 2);
        else cy = Math.max(pref, Math.max(lane.dn, limit == null ? -Infinity : limit) + h / 2);
        c.font = f2;
        const pw = Math.max.apply(null, lines.map(function (l) { return c.measureText(l).width; })) + 2 * pad;
        const box = { x: sideR ? x : x - pw, y: cy - h / 2, w: pw, h: h };
        if (!force) {
          if (box.y < hbC || box.y + box.h > RC.y + RC.h - 2) return false;
          if ([footRect].concat(placed).some(function (r) { return overlaps(box, r); })) return false;
          if (!bigsMove(box)) return false;
        }
        if (dir < 0) lane.up = Math.min(lane.up, box.y - 3); else lane.dn = Math.max(lane.dn, box.y + h + 3);
        const xx = sideR ? x + 6 : x - 6, al = sideR ? 'left' : 'right';
        placed.push(pillLines(c, lines, xx, cy, color, f2, al, pad));
        return true;
      };
      const atNyp = function () { return nyp; };
      const aboveN = function (h) { return bigB[0].y - 2 - h / 2; };
      const belowMg = function (h) { return bigB[1].y + bigB[1].h + 2 + h / 2; };
      // 合力：窄畫面省略「合力」兩字（虛線箭頭在圖例中已說明）。依序試：緊貼在合力箭頭上方 →
      // 箭頭起點另一側、與箭頭同高 → N 標籤的上方
      if (lN) {
        const mt = 'Ma' + vtxt(Math.abs(fb.net)), mc = colors['b-mech'];
        stackLabel(mt, sgn > 0, -1, Infinity, nyp - 3, mc) ||
          stackLabel(mt, sgn < 0, -1, Infinity, null, mc, false, atNyp) ||
          stackLabel(mt, sgn > 0, -1, Infinity, null, mc, false, aboveN) ||
          stackLabel(mt, sgn < 0, -1, Infinity, null, mc, false, aboveN) ||
          stackLabel(mt, sgn > 0, -1, Infinity, nyp - 3, mc, true);
      } else {
        const zt = T('合力 = 0', 'net force = 0'), mc = colors['b-mech'];
        stackLabel(zt, true, -1, nyp - 6, null, mc) || stackLabel(zt, false, -1, nyp - 6, null, mc) ||
          stackLabel(zt, true, -1, nyp - 6, null, mc, true);
      }
      // T：放在 T 箭頭下方（上方是合力箭頭與它的標籤）；軌道傾斜時也要在 Mg sinθ 的虛線箭頭下方
      const dnR = lWp ? cyC + offW + 4 + Math.max(0, uy * Math.min(lWp, halfW)) : cyC + 3 + Math.max(0, uy * lT);
      if (lT) stackLabel('T' + vtxt(fb.T), true, 1, -Infinity, dnR, colors.accent) || stackLabel('T' + vtxt(fb.T), true, 1, -Infinity, dnR, colors.accent, true);
      if (lf) stackLabel(fText, false, 1, cyC + 13, null, colors.equi) || stackLabel(fText, false, 1, cyC + 13, null, colors.equi, true);
      if (lWp) {
        stackLabel(wText, true, 1, cyC + 24, cyC + offW + 4, colors.pos) ||
          stackLabel(wText, false, 1, cyC + 24, cyC + offW + 4, colors.pos) ||
          stackLabel(wText, true, 1, cyC + 24, null, colors.pos, false, belowMg) ||
          stackLabel(wText, false, 1, cyC + 24, null, colors.pos, false, belowMg) ||
          stackLabel(wText, true, 1, cyC + 24, cyC + offW + 4, colors.pos, true);
      }
      // N、Mg 的標籤：畫在上面找好的位置
      bigs.forEach(function (b, i) { c.textAlign = bigB[i].q.a; pill(c, b.text, bigB[i].q.x, bigB[i].q.y, b.color, font); });
    } else {
      // 寬畫面：標籤放在箭頭尖端外側；放不下時改放在尖端內側的上方或下方，並避開其他標籤與合力箭頭
      if (lN) {
        // 合力：放得下就放在箭頭尖端外側，否則放在箭頭上方
        const nt = T('合力 Ma', 'net Ma') + vtxt(Math.abs(fb.net)), nw = textW(c, nt, font) + 12;
        const tipX = nxp + ux * sgn * lN, tipY = nyp + uy * sgn * lN;
        placed.push({ x: Math.min(nxp, tipX) - 2, y: Math.min(nyp, tipY) - 4, w: Math.abs(tipX - nxp) + 4, h: Math.abs(tipY - nyp) + 8 });
        if (sgn > 0 && tipX + 8 + nw <= RC.x + RC.w - 4) { c.textAlign = 'left'; placed.push(pill(c, nt, tipX + 10, tipY - 1, colors['b-mech'], font)); }
        else if (sgn < 0 && tipX - 8 - nw >= RC.x + 4) { c.textAlign = 'right'; placed.push(pill(c, nt, tipX - 10, tipY - 1, colors['b-mech'], font)); }
        else {
          c.textAlign = 'left';
          const lx = Math.max(RC.x + 12, Math.min(RC.x + RC.w - nw, Math.min(nxp, tipX) + 11));
          placed.push(pill(c, nt, lx, Math.min(nyp, tipY) - 14, colors['b-mech'], font));
        }
      } else {
        c.textAlign = 'left';
        placed.push(pill(c, T('合力 = 0', 'net force = 0'), cxC + bw / 2 + 10, nyp - 4, colors['b-mech'], font));
      }
      if (lWp && lWp > 14) {
        c.textAlign = 'left';
        placed.push(pill(c, wText, cxC + oxW + ux * Math.min(lWp, halfW) * 0.5 - 6, cyC + oyW + uy * Math.min(lWp, halfW) * 0.5 + 13, colors.pos, fontS));
      }
      if (lT) placed.push(forceLabel(c, 'T' + vtxt(fb.T), cxC + ux * lT, cyC + uy * lT, ux, uy, colors.accent, font, RC, -1, hbC, placed));
      if (lf) placed.push(forceLabel(c, fText, cxC - ux * lf, cyC - uy * lf, -ux, -uy, colors.equi, font, RC, 1, hbC, placed));
    }
    // N、Mg 的標籤（寬畫面）：放在尖端外側；被標題、比例尺或其他標籤擋住時改放在尖端旁（先試合力標籤的另一側）
    if (!A.narrow) {
      bigs.forEach(function (b) {
        forceLabel(c, b.text, b.x, b.y, b.dx, b.dy, b.color, font, RC, -1, hbC, placed, lN && sgn > 0 && b.dy < 0 ? 'left' : 'right');
      });
    }
    // 比例尺／示意說明
    roundRect(c, footRect.x, footRect.y, footRect.w, footRect.h, footRect.h / 2);
    c.fillStyle = alpha(colors['canvas-bg'], colors.dark ? 0.8 : 0.88);
    c.fill();
    c.strokeStyle = alpha(colors.muted, 0.3);
    c.lineWidth = 1;
    c.stroke();
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillStyle = colors.muted;
    if (myst) {
      c.font = footRect.font;
      c.fillText(footText, footRect.x + 6, footY + 0.5);
    } else {
      const x0 = footRect.x + 7;
      c.strokeStyle = colors.muted;
      c.lineWidth = 1.5;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x0, footY - 3); c.lineTo(x0, footY + 3);
      c.moveTo(x0, footY); c.lineTo(x0 + sl, footY);
      c.moveTo(x0 + sl, footY - 3); c.lineTo(x0 + sl, footY + 3);
      c.stroke();
      c.font = fontS;
      c.fillText(footText, x0 + sl + 6, footY + 0.5);
    }

    // 吊掛物
    if (!fb.attached) {
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '600 ' + fs + 'px ' + FF;
      c.fillStyle = colors.muted;
      c.fillText(T('已取下', 'removed'), RH.x + RH.w / 2, RH.y + RH.h / 2);
      return;
    }
    const hw = A.narrow ? 14 : 18, hh = A.narrow ? 20 : 26;
    c.globalAlpha = colors.dark ? 0.65 : 0.55;
    LD.block(c, cxH - hw / 2, cyH - hh / 2, hw, hh, colors.brass, { r: 3, shadow: false });
    c.globalAlpha = 1;
    const lTH = lenOf(fb.T), lW = myst ? nominal * 1.1 : fb.mg * kF;
    arrow(c, cxH, cyH, 0, -1, lTH, lw, colors.accent);
    arrow(c, cxH, cyH, 0, 1, lW, lw, colors.pos);
    const lNH = fb.netH > 1e-9 ? (myst ? nominal * 0.4 : fb.netH * kF) : 0, oxH = cxH + hw / 2 + 12;
    if (lNH) arrow(c, oxH, cyH, 0, 1, lNH, lw * 0.8, colors['b-mech'], false, true);
    LD.ball(c, cxH, cyH, lw * 1.1, colors.text, { shadow: false, glow: 0 });
    const placedH = [];
    const tTxt = 'T' + vtxt(fb.T), mgTxt = 'mg' + (myst ? '' : ' = ' + sig(fb.mg, 3) + unit);
    if (lNH) {
      // 合力標籤：放在虛線箭頭尖端下方；會碰到 mg 的標籤時（合力很大、箭頭很長），改放在箭頭起點上方
      const mt = (A.narrow ? 'ma' : T('合力 ma', 'net ma')) + vtxt(fb.netH);
      const mw = textW(c, mt, fontS) + 12;
      const room = RH.x + RH.w - 2 - (cxH + 6);
      const cut = mt.indexOf(' = ');
      const lines = mw <= room || cut < 0 ? [mt] : [mt.slice(0, cut), mt.slice(cut + 1)];
      c.font = fontS;
      let lwid = 0;
      lines.forEach(function (l) { lwid = Math.max(lwid, c.measureText(l).width + 12); });
      const lh = lines.length > 1 ? linesH(LD.textHeight(c.measureText(lines[0]), 15), lines.length) : pillH(c, mt, fontS);
      const lx = lines.length > 1 ? cxH + 12 : Math.max(cxH + 12, Math.min(oxH + 2, RH.x + RH.w - mw + 4));
      let ly = cyH + lNH + 15 + (lines.length > 1 ? 7 : 0);
      const mgB = forceLabel(c, mgTxt, cxH, cyH + lW, 0, 1, null, font, RH, 1, hbH, [], null, true);
      const tB = forceLabel(c, tTxt, cxH, cyH - lTH, 0, -1, null, font, RH, -1, hbH, [], null, true);
      const boxAt = function (y) { return { x: lx - 6, y: y - lh / 2, w: lwid, h: lh }; };
      if (overlaps(boxAt(ly), mgB) || ly + lh / 2 > RH.y + RH.h - 2) {
        // 備案一：箭頭起點上方；備案二：蓋在虛線箭頭中段（箭頭夠長，起點與尖端仍看得到）
        const alt = cyH - 3 - lh / 2, mid = cyH + lNH / 2;
        if (!overlaps(boxAt(alt), tB)) ly = alt;
        else if (lNH > lh + 16 && !overlaps(boxAt(mid), mgB) && !overlaps(boxAt(mid), tB)) ly = mid;
      }
      if (lines.length > 1) placedH.push(pillLines(c, lines, lx, ly, colors['b-mech'], fontS, 'left'));
      else { c.textAlign = 'left'; placedH.push(pill(c, mt, lx, ly, colors['b-mech'], fontS)); }
    }
    forceLabel(c, tTxt, cxH, cyH - lTH, 0, -1, colors.accent, font, RH, -1, hbH, placedH);
    forceLabel(c, mgTxt, cxH, cyH + lW, 0, 1, colors.pos, font, RH, 1, hbH, placedH);
  }

  // ======================= 紙帶與 v–t 圖 =======================
  const tcv = $('tapeCv');
  const tctx = tcv.getContext('2d');
  let TL = null;

  function resizeT() {
    if (!tcv.clientWidth) return;
    const w = tcv.clientWidth, narrow = w < 560;
    const h = narrow ? 360 : 350;
    const s = setupCanvas(tcv, h);
    TL = { w: w, h: h, dpr: s.dpr, narrow: narrow };
    drawTape();
  }

  /** 目前紙帶的分析（剪成每 N 個間隔一條） */
  function analysis() {
    const tp = state.tape;
    if (!tp) return null;
    const dots = tp.dots.slice(0, tp.printed);
    if (!dots.length) return null;
    const st = NS.strips(dots, state.N, tp.freq, tp.run.stopped && tp.run.moves ? tp.run.tStop : null);
    return { dots: dots, st: st, freq: tp.freq, N: state.N, done: tp.done };
  }

  /** 置中的提示文字（半透明圓角底框，可換行） */
  function noteBox(c, text, cx, cy, maxW, color, font) {
    c.font = font;
    const lines = wrapLines(c, text, maxW - 24);
    const lh = LD.textHeight(c.measureText(lines[0] || ''), 15);
    let tw = 0;
    lines.forEach(function (l) { tw = Math.max(tw, c.measureText(l).width); });
    const pw = tw + 28, ph = lh * lines.length + 14;
    roundRect(c, cx - pw / 2, cy - ph / 2, pw, ph, 10);
    c.fillStyle = alpha(colors['canvas-bg'], colors.dark ? 0.82 : 0.88);
    c.fill();
    c.strokeStyle = alpha(colors.muted, 0.28);
    c.lineWidth = 1;
    c.setLineDash([4, 3]);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = color;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    lines.forEach(function (l, i) { c.fillText(l, cx, cy + (i - (lines.length - 1) / 2) * lh + 0.5); });
  }

  function drawTape() {
    if (!TL) return;
    const c = tctx, W = TL.w, H = TL.h, dk = colors.dark;
    c.setTransform(TL.dpr, 0, 0, TL.dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    LD.backdrop(c, W, H);

    const an = analysis();
    const fs = 11;
    const font = '600 ' + fs + 'px ' + FF;
    const fontT = '600 11px ' + FF; // 刻度數字
    // ---- 上方：紙帶 ----
    const m0 = 14, tapeY = 42, tapeH = TL.narrow ? 22 : 26;
    const kx = (W - 2 * m0 - 16) / D;
    const X0 = m0 + 8;
    // 紙帶本體：紙的漸層、柔和投影、上緣高光、兩端撕開的鋸齒
    const tapePath = function (g) {
      g.beginPath();
      g.moveTo(m0, tapeY);
      g.lineTo(W - m0, tapeY);
      for (let i = 0; i <= 6; i++) g.lineTo(W - m0 + (i % 2 ? -2.5 : 0), tapeY + tapeH * i / 6);
      g.lineTo(m0, tapeY + tapeH);
      for (let i = 6; i >= 0; i--) g.lineTo(m0 + (i % 2 ? 2.5 : 0), tapeY + tapeH * i / 6);
      g.closePath();
    };
    c.save();
    c.shadowColor = dk ? 'rgba(0,0,0,0.5)' : alpha(colors.text, 0.18);
    c.shadowBlur = 6;
    c.shadowOffsetY = 2;
    const pg = c.createLinearGradient(0, tapeY, 0, tapeY + tapeH);
    pg.addColorStop(0, shade(colors.paper, 0.2));
    pg.addColorStop(0.6, colors.paper);
    pg.addColorStop(1, shade(colors.paper, -0.05));
    c.fillStyle = pg;
    tapePath(c);
    c.fill();
    c.restore();
    c.strokeStyle = alpha(colors.paperEdge, 0.85);
    c.lineWidth = 1;
    tapePath(c);
    c.stroke();
    c.fillStyle = alpha('#ffffff', dk ? 0.12 : 0.7);
    c.fillRect(m0 + 3, tapeY + 1, W - 2 * m0 - 6, 1);
    const cy = tapeY + tapeH / 2;
    if (an) {
      const N = an.N, J = an.st.list.length;
      // 紙條區塊交錯淡色、編號
      for (let j = 0; j < J; j++) {
        const s = an.st.list[j];
        const a = X0 + an.dots[j * N].x * kx, b = X0 + an.dots[(j + 1) * N].x * kx;
        if (j % 2 === 0) { c.fillStyle = alpha(colors.accent, dk ? 0.16 : 0.09); c.fillRect(a, tapeY + 1, b - a, tapeH - 2); }
        if (b - a >= (TL.narrow ? 12 : 14)) LD.haloText(c, String(s.j + 1), (a + b) / 2, tapeY - 4, colors.accent, 'center', 'bottom', '700 ' + fs + 'px ' + FF);
      }
      // 剪開的虛線
      c.strokeStyle = alpha(colors.text, dk ? 0.55 : 0.45);
      c.setLineDash([3, 3]);
      c.lineWidth = 1;
      c.beginPath();
      for (let j = 0; j <= J; j++) {
        const xx = Math.round(X0 + an.dots[j * N].x * kx) + 0.5;
        c.moveTo(xx, tapeY - 2); c.lineTo(xx, tapeY + tapeH + 2);
      }
      c.stroke();
      c.setLineDash([]);
      // 點：計數點（每 N 點）較大，外加一圈極淡的墨暈
      c.fillStyle = alpha(colors.ink, 0.18);
      c.beginPath();
      an.dots.forEach(function (q, i) { if (i % N === 0) { const xx = X0 + q.x * kx; c.moveTo(xx + 3.6, cy); c.arc(xx, cy, 3.6, 0, Math.PI * 2); } });
      c.fill();
      c.fillStyle = colors.ink;
      c.beginPath();
      an.dots.forEach(function (q, i) {
        const xx = X0 + q.x * kx, r = i % N === 0 ? 2.3 : 1.5;
        c.moveTo(xx + r, cy); c.arc(xx, cy, r, 0, Math.PI * 2);
      });
      c.fill();
      // 上方說明：左「第 0 點＝放開的瞬間」、右「點數與打點間隔」；放不下時改用短句，再放不下就只留左邊
      c.font = font;
      const room = W - 2 * m0 - 14;
      let tL = T('← 第 0 點＝放開的瞬間', '← dot 0 = moment of release');
      let tR = an.dots.length + T(' 點，每 1/', ' dots, one every 1/') + an.freq + T(' s 一點', ' s');
      if (c.measureText(tL).width + c.measureText(tR).width > room) {
        tL = T('← 第 0 點＝放開', '← dot 0 = release');
        tR = an.dots.length + T(' 點・每 1/', ' dots · 1/') + an.freq + ' s';
      }
      const showR = c.measureText(tL).width + c.measureText(tR).width <= room;
      LD.haloText(c, tL, m0, 13, colors.muted, 'left', 'middle', font);
      if (showR) LD.haloText(c, tR, W - m0, 13, colors.muted, 'right', 'middle', font);
    } else {
      noteBox(c, T('放開小車後，打點的紙帶會出現在這裡', 'The dotted tape appears here after you release the cart'), W / 2, cy, W - 2 * m0 - 10, colors.muted, font);
    }
    // 尺：每 1 cm 一格，每 5 cm 標數字
    const ry = tapeY + tapeH + 2;
    c.strokeStyle = alpha(colors.text, dk ? 0.45 : 0.38);
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i <= D * 100; i++) {
      const xx = Math.round(X0 + i * 0.01 * kx) + 0.5;
      const len = i % 10 === 0 ? 7 : i % 5 === 0 ? 5 : 3;
      if (i % 5 !== 0 && kx * 0.01 < 3) continue;
      c.moveTo(xx, ry); c.lineTo(xx, ry + len);
    }
    c.stroke();
    c.font = fontT;
    c.fillStyle = alpha(colors.text, dk ? 0.7 : 0.62);
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (let i = 10; i < D * 100; i += 10) c.fillText(i + ' cm', X0 + i * 0.01 * kx, ry + 7);

    // ---- 下方：剪下的紙條並排貼成 v–t 圖 ----
    const top = tapeY + tapeH + 56, bot = H - 30;
    const left = TL.narrow ? 40 : 48, right = W - (TL.narrow ? 44 : 54);
    const P = { x: left, y: top, w: right - left, h: bot - top };
    // 圖區底板（極淡）
    roundRect(c, P.x - 1, P.y - 6, P.w + 2, P.h + 6, 4);
    c.fillStyle = alpha(colors.surface, dk ? 0.28 : 0.55);
    c.fill();
    if (!an || an.st.list.length === 0) {
      noteBox(c, an ? T('紙條還不夠長，等小車多跑一段……', 'Not a full strip yet…') : T('紙條會依序貼在這裡，排成 v–t 圖', 'The strips will be pasted here, side by side, to form the v–t graph'),
        P.x + P.w / 2, (top + bot) / 2, P.w - 10, colors.muted, font);
      return;
    }
    const st = an.st, tau = st.tau, list = st.list;
    const tMax = Math.max(list.length, 4) * tau;
    let Lmax = 0;
    list.forEach(function (s) { Lmax = Math.max(Lmax, s.L); });
    if (st.fit) Lmax = Math.max(Lmax, (st.fit.slope * tMax + st.fit.intercept) * tau);
    const yMaxCm = niceMax(Math.max(Lmax * 100, 0.5), 4);
    const tx = function (t) { return P.x + t / tMax * P.w; };
    const ly = function (Lm) { return P.y + P.h - (Lm * 100) / yMaxCm * P.h; };
    // 兩級格線：主格線（每個刻度）與次格線
    const yStep = niceStep(yMaxCm / 4);
    const tStep = niceStep(tMax / (TL.narrow ? 4 : 6));
    const ySub = yStep / (P.h * yStep / yMaxCm >= 40 ? 5 : 2);
    const gridLines = function (step, a, vert) {
      c.strokeStyle = alpha(colors.text, a);
      c.beginPath();
      for (let v = step; v <= yMaxCm + 1e-9; v += step) { const yy = Math.round(ly(v / 100)) + 0.5; c.moveTo(P.x, yy); c.lineTo(P.x + P.w, yy); }
      if (vert) for (let t = vert; t <= tMax + 1e-9; t += vert) { const xx = Math.round(tx(t)) + 0.5; c.moveTo(xx, P.y); c.lineTo(xx, P.y + P.h); }
      c.stroke();
    };
    c.lineWidth = 1;
    gridLines(ySub, dk ? 0.05 : 0.04, 0);
    gridLines(yStep, dk ? 0.11 : 0.1, tStep);
    // 紙條：右下的淡影子（貼在紙上的感覺）、紙的漸層、細框、上緣高光
    const gapPx = Math.min(3, P.w / list.length * 0.08);
    list.forEach(function (s) {
      const xa = tx(s.t0) + gapPx / 2, xb = tx(s.t1) - gapPx / 2;
      const yb = ly(0), yt = ly(Math.max(0, s.L));
      const hgt = yb - yt;
      if (hgt > 0.5) {
        c.fillStyle = LD.shadowInk(dk ? 0.28 : 0.1);
        c.fillRect(xa + 1.5, yt + 1.5, xb - xa, hgt - 1.5);
      }
      const g = c.createLinearGradient(xa, 0, xb, 0);
      g.addColorStop(0, shade(colors.paper, 0.16));
      g.addColorStop(0.5, shade(colors.paper, 0.05));
      g.addColorStop(1, shade(colors.paper, -0.06));
      c.fillStyle = g;
      c.fillRect(xa, yt, xb - xa, hgt);
      c.strokeStyle = alpha(colors.paperEdge, 0.9);
      c.strokeRect(Math.round(xa) + 0.5, Math.round(yt) + 0.5, Math.max(0, Math.round(xb - xa) - 1), Math.max(0, Math.round(hgt) - 1));
      if (hgt > 3) { c.fillStyle = alpha('#ffffff', dk ? 0.1 : 0.55); c.fillRect(xa + 1, yt + 1, xb - xa - 2, 1); }
      // 紙條上的點（剪下後轉成直的）
      const mid = (xa + xb) / 2;
      c.fillStyle = alpha(colors.ink, 0.85);
      c.beginPath();
      const d0 = an.dots[s.j * an.N].x;
      for (let i = s.j * an.N; i <= (s.j + 1) * an.N; i++) {
        const yy = yb - (an.dots[i].x - d0) / Math.max(s.L, 1e-12) * hgt;
        const r = i % an.N === 0 ? 1.8 : 1.2;
        c.moveTo(mid + r, yy); c.arc(mid, yy, r, 0, Math.PI * 2);
      }
      c.fill();
    });
    // 最佳直線（虛線，底下墊一層背景色讓它在紙條上也清楚）
    if (st.fit) {
      c.save();
      c.beginPath(); c.rect(P.x, P.y - 4, P.w, P.h + 4); c.clip();
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(tx(0), ly((st.fit.intercept) * tau));
      c.lineTo(tx(tMax), ly((st.fit.slope * tMax + st.fit.intercept) * tau));
      c.strokeStyle = alpha(colors['canvas-bg'], 0.7);
      c.lineWidth = 4.5;
      c.stroke();
      c.strokeStyle = colors.pos;
      c.lineWidth = 2;
      c.setLineDash([7, 5]);
      c.stroke();
      c.setLineDash([]);
      c.restore();
    }
    // 紙條頂端中點（立體小球）
    const rb = TL.narrow ? 3 : 3.4;
    list.forEach(function (s) { LD.ball(c, tx(s.t), ly(s.L), rb, colors.accent); });
    // 座標軸
    c.strokeStyle = alpha(colors.muted, 0.85);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(P.x + 0.5, P.y - 4); c.lineTo(P.x + 0.5, P.y + P.h + 0.5); c.lineTo(P.x + P.w, P.y + P.h + 0.5);
    c.moveTo(P.x + P.w + 0.5, P.y - 4); c.lineTo(P.x + P.w + 0.5, P.y + P.h);
    for (let t = 0; t <= tMax + 1e-9; t += tStep) { const xx = Math.round(tx(t)) + 0.5; c.moveTo(xx, P.y + P.h); c.lineTo(xx, P.y + P.h + 3.5); }
    c.stroke();
    c.font = fontT;
    c.fillStyle = colors.muted;
    c.textBaseline = 'middle';
    const dY = decOf(yStep);
    for (let v = 0; v <= yMaxCm + 1e-9; v += yStep) {
      c.textAlign = 'right';
      c.fillText(num(v, dY), P.x - 4, ly(v / 100));
      c.textAlign = 'left';
      c.fillText(sig(v / 100 / tau, 2), P.x + P.w + 4, ly(v / 100));
    }
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (let t = 0; t <= tMax + 1e-9; t += tStep) c.fillText(num(t, decOf(tStep)), tx(t), P.y + P.h + 5);
    const tf = '700 ' + fs + 'px ' + FF;
    LD.haloText(c, 'Δx (cm)', 4, P.y - 9, colors.text, 'left', 'bottom', tf);
    LD.haloText(c, 'v (m/s)', W - 4, P.y - 9, colors.text, 'right', 'bottom', tf);
    LD.haloText(c, 't (s)', P.x + P.w, P.y + P.h + 17, colors.text, 'right', 'top', tf);
    // 斜率標籤：放在資料比較少的那一角（加速時左上、減速時右上）
    if (st.fit) {
      const sTxt = T('斜率 = 加速度 a = ', 'slope = acceleration a = ') + num(st.fit.slope, 3) + ' m/s²';
      const sf = '700 ' + fs + 'px ' + FF;
      const onRight = st.fit.slope < 0;
      c.textAlign = onRight ? 'right' : 'left';
      const xP = onRight ? P.x + P.w - 10 : P.x + 10;
      const b = pill(c, sTxt, xP, P.y + 10, colors.pos, sf);
      if (!TL.narrow) { c.textAlign = onRight ? 'right' : 'left'; pill(c, 'τ = ' + num(tau, 3) + ' s', xP, b.y + b.h + 4 + b.h / 2, colors.muted, font); }
    }
  }

  // ======================= a–F／a–1/(M+m) 圖 =======================
  const gcv = $('gcv');
  const gctx = gcv.getContext('2d');
  let GL = null;

  function resizeG() {
    if (!gcv.clientWidth) return;
    const w = gcv.clientWidth, narrow = w < 560;
    const h = narrow ? 300 : 340;
    const s = setupCanvas(gcv, h);
    GL = { w: w, h: h, dpr: s.dpr, narrow: narrow };
    drawGraph();
  }

  function xOf(p, exp, ax) {
    if (exp === 1) return ax === 'm' ? p.m : p.F;
    return ax === 'invM' ? 1 / p.M : 1 / p.Mtot;
  }
  function allSame(list, key, tol) {
    return list.length > 0 && list.every(function (p) { return Math.abs(p[key] - list[0][key]) <= tol; });
  }
  function seriesInfo(exp) {
    const pts = state.series[exp], ax = state.axis[exp];
    const xs = pts.map(function (p) { return xOf(p, exp, ax); }), ys = pts.map(function (p) { return p.a; });
    const fit = pts.length >= 2 ? NS.fitLine(xs, ys) : null;
    return {
      pts: pts, ax: ax, xs: xs, ys: ys, fit: fit,
      sameTot: allSame(pts, 'Mtot', 5e-4), sameM: allSame(pts, 'M', 5e-4), samem: allSame(pts, 'm', 5e-4),
      balanced: pts.every(function (p) { return p.mystery || Math.abs(Math.tan(p.thDeg * DEG) - p.mu) <= 0.0015; }),
      anyMyst: pts.some(function (p) { return p.mystery; })
    };
  }

  /** 畫布文字加上手動上標（例如 kg 的 −1 次方）：parts = [[文字, 是否上標], …] */
  function richText(c, parts, x, y, font, color, align) {
    c.font = font;
    const sz = parseFloat(/(\d+(?:\.\d+)?)px/.exec(c.font)[1]);
    const supFont = font.replace(/(\d+(?:\.\d+)?)px/, function (m, n) { return (n * 0.72).toFixed(1) + 'px'; });
    let total = 0;
    parts.forEach(function (p) { c.font = p[1] ? supFont : font; total += c.measureText(p[0]).width; });
    let xx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
    c.textAlign = 'left';
    c.fillStyle = color;
    parts.forEach(function (p) {
      c.font = p[1] ? supFont : font;
      c.fillText(p[0], xx, p[1] ? y - sz * 0.38 : y);
      xx += c.measureText(p[0]).width;
    });
  }

  let gPulse = null, gAnim = false; // 新數據點的波紋（純裝飾）
  function pulseGraph() {
    if (reducedMotion) return;
    gPulse = { t0: performance.now(), exp: state.exp };
    if (gAnim) return;
    gAnim = true;
    const step = function () {
      drawGraph();
      if (gPulse && performance.now() - gPulse.t0 < 650) requestAnimationFrame(step);
      else { gPulse = null; gAnim = false; drawGraph(); }
    };
    requestAnimationFrame(step);
  }

  function drawGraph() {
    if (!GL) return;
    const c = gctx, W = GL.w, H = GL.h, exp = state.exp, dk = colors.dark;
    c.setTransform(GL.dpr, 0, 0, GL.dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    LD.backdrop(c, W, H);
    const fs = 11;
    const font = '600 ' + fs + 'px ' + FF;
    const si = seriesInfo(exp);
    const P = { x: GL.narrow ? 46 : 58, y: 34, w: 0, h: 0 };
    P.w = W - P.x - 16; P.h = H - P.y - 44;

    // 範圍
    let xMax = 0, yMax = 0, yMin = 0;
    si.xs.forEach(function (x) { xMax = Math.max(xMax, x); });
    si.ys.forEach(function (y) { yMax = Math.max(yMax, y); yMin = Math.min(yMin, y); });
    if (!si.pts.length) {
      xMax = exp === 1 ? (si.ax === 'm' ? 0.1 : 1) : 5;
      yMax = 2;
    }
    xMax = niceMax(xMax * 1.1, 5);
    let ref = null; // 近似（課本）曲線：a = mg/M
    if (si.pts.length && exp === 1 && si.sameM && !si.sameTot) {
      const M = si.pts[0].M;
      ref = { label: T('近似 a = mg/M', 'approx. a = mg/M'), f: function (x) { return si.ax === 'm' ? G * x / M : x / M; } };
    }
    if (si.pts.length && exp === 2 && si.ax === 'invM' && si.samem) {
      const mg = si.pts[0].m * G;
      ref = { label: T('近似 a = mg/M', 'approx. a = mg/M'), f: function (x) { return mg * x; } };
    }
    if (si.fit) { yMin = Math.min(yMin, si.fit.intercept); }
    if (ref) yMax = Math.max(yMax, Math.min(ref.f(xMax), yMax * 1.6));
    yMax = niceMax(Math.max(yMax * 1.1, 0.1), 5);
    if (yMin < 0) yMin = -niceMax(-yMin * 1.15, 4);
    const px = function (x) { return P.x + x / xMax * P.w; };
    const py = function (y) { return P.y + P.h - (y - yMin) / (yMax - yMin) * P.h; };
    // 圖區底板（極淡）
    roundRect(c, P.x - 1, P.y - 1, P.w + 2, P.h + 2, 4);
    c.fillStyle = alpha(colors.surface, dk ? 0.28 : 0.55);
    c.fill();
    // 兩級格線：主格線（每個刻度）透明度約 0.10，次格線（刻度的一半）約 0.04
    const xs = niceStep(xMax / (GL.narrow ? 4 : 6)), ys = niceStep((yMax - yMin) / 5);
    c.lineWidth = 1;
    [[dk ? 0.05 : 0.04, xs / 2, ys / 2], [dk ? 0.11 : 0.1, xs, ys]].forEach(function (lv) {
      c.strokeStyle = alpha(colors.text, lv[0]);
      c.beginPath();
      for (let x = lv[1]; x <= xMax + 1e-9; x += lv[1]) { const xx = Math.round(px(x)) + 0.5; c.moveTo(xx, P.y); c.lineTo(xx, P.y + P.h); }
      for (let y = Math.ceil(yMin / lv[2]) * lv[2]; y <= yMax + 1e-9; y += lv[2]) { const yy = Math.round(py(y)) + 0.5; c.moveTo(P.x, yy); c.lineTo(P.x + P.w, yy); }
      c.stroke();
    });
    // 座標軸與刻度
    c.strokeStyle = alpha(colors.muted, 0.9);
    c.beginPath();
    const ax0 = Math.round(px(0)) + 0.5, ay0 = Math.round(py(0)) + 0.5;
    c.moveTo(ax0, P.y); c.lineTo(ax0, P.y + P.h);
    c.moveTo(P.x, ay0); c.lineTo(P.x + P.w, ay0);
    for (let x = 0; x <= xMax + 1e-9; x += xs) { const xx = Math.round(px(x)) + 0.5; c.moveTo(xx, P.y + P.h); c.lineTo(xx, P.y + P.h + 3.5); }
    c.stroke();
    c.font = font;
    c.fillStyle = colors.muted;
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (let x = 0; x <= xMax + 1e-9; x += xs) c.fillText(num(x, decOf(xs)), px(x), P.y + P.h + 5);
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    for (let y = Math.ceil(yMin / ys - 1e-9) * ys; y <= yMax + 1e-9; y += ys) c.fillText(num(y, decOf(ys)), P.x - 6, py(y));
    // 軸標題
    const tf = '700 ' + (fs + 1) + 'px ' + FF;
    LD.haloText(c, 'a (m/s²)', 6, P.y - 10, colors.text, 'left', 'bottom', tf);
    c.textBaseline = 'top';
    const xt = exp === 1 ? (si.ax === 'm' ? [[T('m（吊掛物質量，kg）', 'm (hanging mass, kg)'), 0]] : [['F = mg (N)', 0]])
      : si.ax === 'invM' ? [['1/M (kg', 0], ['−1', 1], [')', 0]] : [['1/(M+m) (kg', 0], ['−1', 1], [')', 0]];
    richText(c, xt, P.x + P.w, P.y + P.h + 21, tf, colors.text, 'right');

    if (!si.pts.length) {
      const msg = exp === 1
        ? T('實驗一：固定 M + m，用「移動 10 g 槽碼」改變拉力，每跑一次加一點', 'Experiment 1: keep M + m fixed and use “Move 10 g” to change the force; each run adds a point')
        : T('實驗二：固定 m，改變小車質量 M，每跑一次加一點', 'Experiment 2: keep m fixed and change the cart mass M; each run adds a point');
      noteBox(c, msg, P.x + P.w / 2, P.y + P.h / 2, Math.min(P.w - 20, 420), colors.muted, font);
      return;
    }
    c.save();
    c.beginPath(); c.rect(P.x, P.y - 2, P.w + 2, P.h + 4); c.clip();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    // 近似曲線（虛線）
    if (ref) {
      c.beginPath();
      for (let i = 0; i <= 60; i++) { const x = xMax * i / 60, y = ref.f(x); if (i) c.lineTo(px(x), py(y)); else c.moveTo(px(x), py(y)); }
      c.strokeStyle = alpha(colors['canvas-bg'], 0.7);
      c.lineWidth = 4;
      c.stroke();
      c.strokeStyle = alpha(colors.muted, 0.95);
      c.lineWidth = 1.6;
      c.setLineDash([6, 5]);
      c.stroke();
      c.setLineDash([]);
    }
    // 最佳直線（底下墊一層背景色）
    if (si.fit) {
      const x0 = 0, x1 = xMax;
      c.beginPath(); c.moveTo(px(x0), py(si.fit.intercept)); c.lineTo(px(x1), py(si.fit.slope * x1 + si.fit.intercept));
      c.strokeStyle = alpha(colors['canvas-bg'], 0.75);
      c.lineWidth = 5.5;
      c.stroke();
      c.strokeStyle = colors.accent;
      c.lineWidth = 2.4;
      c.stroke();
    }
    // 數據點（立體小球）；最新的一點加外圈，剛加入時有一圈波紋
    const r = GL.narrow ? 4.8 : 5.6;
    si.pts.forEach(function (p, i) {
      const x = px(si.xs[i]), y = py(si.ys[i]);
      const col = colors['b-mech'];
      if (i === state.latest[exp]) {
        c.strokeStyle = alpha(col, 0.55);
        c.lineWidth = 1.5;
        c.beginPath(); c.arc(x, y, r + 4.5, 0, Math.PI * 2); c.stroke();
        if (gPulse && gPulse.exp === exp) LD.ripple(c, x, y, r + 3, (performance.now() - gPulse.t0) / 650, col);
      }
      LD.ball(c, x, y, r, col);
    });
    c.restore();
    // 圖例
    c.textAlign = 'left';
    let lx = P.x + 10;
    const lyy = P.y + 13;
    if (si.fit) {
      const txt = T('最佳直線', 'best fit');
      c.strokeStyle = colors.accent; c.lineWidth = 2.4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(lx, lyy); c.lineTo(lx + 16, lyy); c.stroke();
      c.textAlign = 'left';
      const b = pill(c, txt, lx + 28, lyy, colors.accent, font);
      lx = b.x + b.w + 10;
    }
    if (ref) {
      c.strokeStyle = colors.muted; c.lineWidth = 1.6; c.setLineDash([5, 4]);
      c.beginPath(); c.moveTo(lx, lyy); c.lineTo(lx + 16, lyy); c.stroke(); c.setLineDash([]);
      c.textAlign = 'left';
      pill(c, ref.label, lx + 28, lyy, colors.muted, font);
    }
  }

  /** 把文字依寬度拆成多行（中文逐字、英文逐詞） */
  function wrapLines(c, text, maxW) {
    const cjk = /[㐀-鿿]/.test(text);
    const words = cjk ? Array.from(text) : text.split(' ');
    const sep = cjk ? '' : ' ';
    const lines = [];
    let line = '';
    words.forEach(function (w) {
      const test = line ? line + sep + w : w;
      if (c.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }
  function wrapText(c, text, x, y, maxW, lh) {
    const lines = wrapLines(c, text, maxW);
    lines.forEach(function (l, i) { c.fillText(l, x, y + (i - (lines.length - 1) / 2) * lh); });
  }

  // ---------- 數據表 ----------
  function updateTable() {
    const exp = state.exp, si = seriesInfo(exp);
    const fixTot = si.pts.length > 1 && si.sameTot, fixm = si.pts.length > 1 && si.samem, fixM = si.pts.length > 1 && si.sameM;
    let h = '<thead><tr><th>#</th><th>M<br><small>(kg)</small></th><th>m<br><small>(kg)</small></th><th>M + m<br><small>(kg)</small></th><th>F = mg<br><small>(N)</small></th><th>a<br><small>(m/s<sup>2</sup>)</small></th></tr></thead><tbody>';
    if (!si.pts.length) h += '<tr class="empty"><td colspan="6">' + T('還沒有數據', 'No data yet') + '</td></tr>';
    si.pts.forEach(function (p, i) {
      h += '<tr' + (i === state.latest[exp] ? ' class="latest"' : '') + '><td>' + (i + 1) + '</td>' +
        '<td' + (fixM ? ' class="fixed"' : '') + '>' + num(p.M, 3) + '</td>' +
        '<td' + (fixm ? ' class="fixed"' : '') + '>' + num(p.m, 3) + '</td>' +
        '<td' + (fixTot ? ' class="fixed"' : '') + '>' + num(p.Mtot, 3) + '</td>' +
        '<td>' + num(p.F, 3) + '</td><td>' + num(p.a, 3) + '</td></tr>';
    });
    h += '</tbody>';
    if (lastText.tbl !== h) { lastText.tbl = h; $('tbl').innerHTML = h; }
    $('undo').disabled = !si.pts.length;
  }

  // ======================= 讀數 =======================
  const lastText = {};
  function setHTML(id, html) {
    if (lastText[id] === html) return;
    lastText[id] = html;
    $(id).innerHTML = html;
  }

  function updateReadouts() {
    const p = physParams(), d = NS.dynamics(p);
    const myst = state.mystery, q = '?';
    // 理論值
    const moves = state.attached ? d.startsFromRest : true;
    const a = state.attached ? (d.startsFromRest ? d.aMove : 0) : d.aMove;
    setHTML('tA', myst ? q : num(a, 3) + MS2 + (state.attached && !d.startsFromRest ? '<small>' + T('拉不動（mg ≤ 最大靜摩擦）', 'does not move (mg ≤ max. static friction)') + '</small>' : (!state.attached ? '<small>' + T('取下吊掛物：a = g(sin θ − μ cos θ)', 'no hanging mass: a = g(sin θ − μ cos θ)') + '</small>' : '')));
    const Tn = state.attached ? (moves ? d.T : d.W) : 0;
    setHTML('tT', !state.attached ? '0 N' : myst ? q : sig(Tn, 4) + ' N');
    setHTML('tW', state.attached ? sig(d.W, 4) + ' N' : '—');
    if (state.attached && !myst) {
      const err = (d.W - Tn) / d.W;
      setHTML('tDiff', num(err * 100, 2) + ' %<small>mg − T = ' + sig(d.W - Tn, 3) + ' N</small>');
    } else setHTML('tDiff', state.attached ? q : '—');
    setHTML('tF', myst ? q : sig(d.f, 3) + ' N' + '<small>N = ' + sig(d.N, 4) + ' N</small>');
    setHTML('tWp', sig(d.Wpar, 3) + ' N<small>tan θ = ' + num(Math.tan(p.theta), 4) + '</small>');
    setHTML('tNet', myst ? q : sig(state.M * a, 3) + ' N');

    // 紙帶量測
    const an = analysis();
    const tp = state.tape;
    if (an) {
      setHTML('rDots', an.dots.length + ' ／ ' + an.st.list.length);
      setHTML('rTau', num(an.st.tau, 3) + ' s<small>' + an.N + ' × 1/' + an.freq + ' s</small>');
      if (an.st.fit && an.st.used >= 2) {
        setHTML('rSlope', num(an.st.fit.slope, 3) + MS2 + (an.st.used < 3 ? '<small>' + T('紙條太少，不準', 'too few strips') + '</small>' : ''));
        setHTML('rIcpt', num(an.st.fit.intercept, 3) + ' m/s');
        const dd = an.st.diffs;
        const avg = dd.length ? dd.reduce(function (s, v) { return s + v; }, 0) / dd.length : NaN;
        setHTML('rDD', isFinite(avg) ? num(avg * 100, 3) + ' cm<small>a = ' + num(avg / (an.st.tau * an.st.tau), 3) + MS2 + '</small>' : '—');
      } else { setHTML('rSlope', '—'); setHTML('rIcpt', '—'); setHTML('rDD', '—'); }
      const r = tp.run;
      setHTML('rTime', tp.done ? (r.reachedEnd ? num(r.tEnd, 3) + ' s' : r.moves ? T('中途停下（', 'stopped (') + num(r.tEnd, 3) + ' s）' : T('沒有動', 'did not move')) : '…');
    } else {
      ['rDots', 'rTau', 'rSlope', 'rIcpt', 'rDD', 'rTime'].forEach(function (id) { setHTML(id, '—'); });
      setHTML('rTau', num(state.N / state.freq, 3) + ' s<small>' + state.N + ' × 1/' + state.freq + ' s</small>');
    }
    // 光電閘
    $('gateBox').hidden = !state.show.gates;
    if (state.show.gates) {
      if (tp && tp.done && tp.run.moves) {
        const g = NS.gates(tp.run, GATE_X[0], GATE_X[1], FLAG_W);
        const row = function (dt, v) { return isFinite(dt) ? 'Δt = ' + num(dt * 1000, 1) + ' ms<small>v = ' + num(v, 3) + ' m/s</small>' : T('沒有通過', 'not reached'); };
        setHTML('rG1', row(g.dt1, g.v1));
        setHTML('rG2', row(g.dt2, g.v2));
        setHTML('rGa', isFinite(g.a) ? num(g.a, 3) + MS2 + '<small>d = 25 cm，t<sub>12</sub> = ' + num(g.t12, 3) + ' s</small>' : '—');
      } else { setHTML('rG1', '—'); setHTML('rG2', '—'); setHTML('rGa', '—'); }
    }
    updateFit();
    updateTable();
  }

  function updateFit() {
    const exp = state.exp, si = seriesInfo(exp);
    let h = '<dt>' + T('數據點', 'Data points') + '</dt><dd>' + si.pts.length + '</dd>';
    if (si.fit) {
      const unit = exp === 1 ? (si.ax === 'm' ? ' m/(s<sup>2</sup>·kg)' : ' kg<sup>−1</sup>') : ' N';
      h += '<dt>' + T('斜率', 'Slope') + '</dt><dd>' + sig(si.fit.slope, 4) + unit + '</dd>';
      h += '<dt>' + T('截距（a 軸）', 'Intercept (a axis)') + '</dt><dd>' + num(si.fit.intercept, 3) + MS2 + '</dd>';
      h += '<dt>r<sup>2</sup></dt><dd>' + num(si.fit.r2, 5) + '</dd>';
      if (exp === 1 && si.ax === 'F' && si.sameTot) {
        h += '<dt>' + T('斜率的倒數', '1 / slope') + '</dt><dd>' + num(1 / si.fit.slope, 3) + ' kg<small>' + T('比較 M + m = ', 'compare M + m = ') + num(si.pts[0].Mtot, 3) + ' kg</small></dd>';
      }
      if (exp === 1 && si.ax === 'm' && si.sameTot) {
        h += '<dt>' + T('g = 斜率 × (M + m)', 'g = slope × (M + m)') + '</dt><dd>' + num(si.fit.slope * si.pts[0].Mtot, 3) + MS2 + '</dd>';
      }
      if (exp === 2 && si.ax === 'inv' && si.samem) {
        h += '<dt>' + T('斜率 → 拉力', 'Slope → force') + '</dt><dd>' + num(si.fit.slope, 3) + ' N<small>' + T('比較 mg = ', 'compare mg = ') + num(si.pts[0].m * G, 3) + ' N</small></dd>';
      }
    }
    const warn = [];
    if (si.pts.length >= 2) {
      if (exp === 1 && !si.sameTot) warn.push(si.sameM ? T('只改變了 m（M 固定），總質量 M + m 跟著變：圖形會彎曲。', 'Only m changed (M fixed), so M + m changes too: the graph bends.') : T('各點的總質量 M + m 不同。', 'The points have different total masses M + m.'));
      if (exp === 2 && !si.samem) warn.push(T('各點的吊掛物質量 m 不同（拉力不固定）。', 'The points have different hanging masses m (the force is not fixed).'));
      if (exp === 2 && si.ax === 'invM') warn.push(T('以 1/M 為橫軸時忽略了吊掛物也被加速，所以不是直線。', 'With 1/M on the axis the hanging mass is ignored, so the graph is not straight.'));
      if (!si.balanced && !si.anyMyst) warn.push(T('有些點沒有平衡摩擦力（tan θ ≠ μ），直線不會通過原點。', 'Some points were taken without balancing friction (tan θ ≠ μ), so the line misses the origin.'));
      if (!warn.length) h += '<dd class="ok">' + (exp === 1 ? T('總質量固定，摩擦已平衡 ✓', 'Total mass fixed, friction balanced ✓') : T('拉力固定，摩擦已平衡 ✓', 'Force fixed, friction balanced ✓')) + '</dd>';
    }
    warn.forEach(function (w) { h += '<dd class="warn">' + w + '</dd>'; });
    setHTML('fitOut', h);
    updateGraphLabel(si);
  }

  // ======================= 音效（sound.js；音效關閉時完全不呼叫） =======================
  function sound() {
    const S = window.LabSound;
    return S && S.enabled() ? S : null;
  }
  /** 打點的「嗒」聲；計數點（每 N 點）較響、較低，聽得出每條紙條的時間 */
  function tickSound(accent) {
    const S = sound(); if (!S) return;
    if (accent) {
      S.tone({ freq: 1480, dur: 0.03, type: 'square', gain: 0.22 });
      S.tone({ freq: 740, dur: 0.045, type: 'triangle', gain: 0.22 });
    } else {
      S.tone({ freq: 2350, dur: 0.012, type: 'square', gain: 0.12 });
    }
    S.noise({ dur: 0.008, gain: 0.1, filter: 4200, q: 1.2 });
  }
  /** 撞上擋板的悶響：力度隨撞擊速率 */
  function thudSound(v) {
    const S = sound(); if (!S) return;
    const k = Math.max(0.25, Math.min(1, v / 1.2));
    S.noise({ dur: 0.08, gain: 0.55 * k, filter: 850, q: 0.8 });
    S.tone({ freq: 310, dur: 0.14, type: 'sine', gain: 0.5 * k });
    S.tone({ freq: 520, dur: 0.06, type: 'triangle', gain: 0.25 * k, delay: 0.005 });
  }
  let lastClickAt = -1;
  function clicksFor(k0, k1) {
    // (k0, k1] 之間新打的點：實際每秒打點數太多時只取樣，計數點一定響；每一幀最多兩聲
    if (!sound()) return;
    const rate = state.tape.freq * (state.slow ? SLOW : 1);
    const stride = rate <= 22 ? 1 : Math.ceil(rate / 18);
    let n = 0;
    for (let k = k0 + 1; k <= k1 && n < 2; k++) {
      const accent = k % state.N === 0;
      if (!accent && k % stride !== 0) continue;
      const now = performance.now();
      if (!accent && now - lastClickAt < 40) continue;
      lastClickAt = now;
      tickSound(accent);
      n++;
    }
  }

  // ======================= 任務模式（missions.js） =======================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function runData() {
    const tp = state.tape, an = analysis(), r = tp.run, s = tp.snap;
    const fit = an && an.st.fit;
    return Object.assign({}, s, {
      moved: r.moves, reachedEnd: r.reachedEnd, stopped: r.stopped && r.moves, xEnd: r.xEnd, vEnd: r.vEnd, tEnd: r.tEnd,
      aMeas: fit ? fit.slope : NaN, intercept: fit ? fit.intercept : NaN, r2: fit ? fit.r2 : NaN,
      nStrips: an ? an.st.used : 0, nDots: an ? an.dots.length : 0, N: state.N, tau: state.N / tp.freq
    });
  }

  // ======================= 實驗流程 =======================
  function setStatus(msg) { $('status').textContent = msg || ''; }

  // ---------- 無障礙：讀數播報與畫布說明 ----------
  // 跑完一次的量測結果寫在 #status（aria-live）；改完條件後的理論值、移除數據點寫進 #srSay（aria-live）
  let sayTimer = 0, theoryTimer = 0;
  function say(msg) {
    const el = $('srSay');
    if (!el) return;
    clearTimeout(sayTimer);
    el.textContent = '';
    sayTimer = setTimeout(function () { el.textContent = msg; }, 60); // 先清空再寫，同樣的字也會再念一次
  }
  const MS2T = ' m/s²';
  function theoryText() {
    const d = NS.dynamics(physParams());
    if (state.mystery) return T('未知摩擦的軌道：理論值隱藏，放開小車，用紙帶量出加速度。', 'Mystery track: the theoretical values are hidden. Run the cart and measure the acceleration from the tape.');
    if (!state.attached) {
      return T('取下吊掛物：推出後的加速度 a = ', 'No hanging mass: after the push a = ') + num(d.aMove, 3) + MS2T +
        T('（tan θ = ', ' (tan θ = ') + num(Math.tan(state.thDeg * DEG), 4) + T('，μ = ', ', μ = ') + num(mu(), 3) + T('）。', ').');
    }
    if (!d.startsFromRest) return T('拉力不夠：mg 沒有超過最大靜摩擦力，小車不會動。', 'Not enough pull: mg does not exceed the maximum static friction, so the cart will not move.');
    return T('理論加速度 a = ', 'Theoretical acceleration a = ') + num(d.aMove, 3) + MS2T + T('，繩張力 T = ', ', string tension T = ') + sig(d.T, 4) +
      ' N' + T('（mg = ', ' (mg = ') + sig(d.W, 4) + ' N' + T('）。', ').');
  }
  /** 改完條件後播報理論值（連續改動時只念最後一次） */
  function sayTheory() {
    clearTimeout(theoryTimer);
    theoryTimer = setTimeout(function () { say(theoryText()); }, 350);
  }
  /** 畫布的文字說明（role="img"）：條件改變時更新 */
  const labels = {};
  function setLabel(canvas, text) {
    if (labels[canvas.id] === text) return;
    labels[canvas.id] = text;
    canvas.removeAttribute('data-en-aria-label'); // 改由程式依語言更新
    canvas.setAttribute('aria-label', text);
  }
  function updateSceneLabel() {
    setLabel(cv, T('力學車實驗裝置側視圖：軌道傾角 ' + num(state.thDeg, 2) + '°，小車質量 M = ' + num(state.M, 3) + ' kg' +
      (state.attached ? '，細繩經滑輪掛著 m = ' + num(state.m, 3) + ' kg 的吊掛物' : '，沒有吊掛物（推一下，初速 ' + num(state.v0, 2) + ' m/s）') +
      '；打點計時器每秒打 ' + state.freq + ' 點。左下方是小車' + (state.attached ? '與吊掛物' : '') + '的受力圖。',
    'Side view of the apparatus: track tilted at ' + num(state.thDeg, 2) + '°, cart mass M = ' + num(state.M, 3) + ' kg' +
      (state.attached ? ', pulled over a pulley by a hanging mass m = ' + num(state.m, 3) + ' kg' : ', no hanging mass (pushed at ' + num(state.v0, 2) + ' m/s)') +
      '; the ticker prints ' + state.freq + ' dots per second. Free-body diagrams at the lower left.'));
  }
  function updateGraphLabel(si) {
    const exp = state.exp;
    const name = exp === 1 ? T('實驗一 a–F 圖', 'Experiment 1, a–F graph') : T('實驗二 a–1/(M+m) 圖', 'Experiment 2, a–1/(M+m) graph');
    const unit = exp === 1 ? (si.ax === 'm' ? ' m/(s²·kg)' : ' 1/kg') : ' N';
    const fit = si.fit ? T('，最佳直線斜率 ', ', best-fit slope ') + sig(si.fit.slope, 4) + unit + T('、截距 ', ', intercept ') + num(si.fit.intercept, 3) + MS2T : '';
    setLabel(gcv, name + T('：', ': ') + si.pts.length + T(' 個數據點', si.pts.length === 1 ? ' data point' : ' data points') + fit + T('。', '.'));
  }

  function updateButtons() {
    const go = $('go');
    const label = {
      ready: state.attached ? T('放開小車', 'Release the cart') : T('推一下小車', 'Push the cart'),
      running: T('暫停', 'Pause'),
      paused: T('繼續', 'Resume'),
      done: T('放回起點', 'Back to start')
    }[state.phase];
    go.textContent = label;
  }

  function snapshot() {
    const p = physParams(), d = NS.dynamics(p);
    return {
      attached: state.attached, M: state.M, m: state.attached ? state.m : 0, Mtot: state.M + (state.attached ? state.m : 0),
      mu: mu(), thDeg: state.thDeg, tanTheta: Math.tan(state.thDeg * DEG), mystery: state.mystery, mysteryId: state.mysteryId,
      v0: state.attached ? 0 : state.v0, a: d.startsFromRest || !state.attached ? d.aMove : 0,
      T: state.attached ? (d.startsFromRest ? d.T : d.W) : 0, W: d.W, f: d.f, freq: state.freq, noise: state.noise
    };
  }

  function release() {
    const p = physParams();
    const run = NS.makeRun(p, { v0: state.attached ? 0 : state.v0, D: D, hold: HOLD });
    state.runCount++;
    const seed = (Math.random() * 4294967296) >>> 0;
    const dots = NS.dots(run, state.freq, state.noise ? { sigma: SIGMA, seed: seed } : null);
    const trueX = dots.map(function (q) { return NS.xAt(run, q.t); });
    state.run = run;
    state.tape = { run: run, dots: dots, trueX: trueX, printed: 0, freq: state.freq, done: false, snap: snapshot() };
    state.t = 0;
    state.x = 0;
    state.phase = 'running';
    state.fx = state.fx.filter(function (e) { return e.type !== 'hit'; });
    if (!state.attached && !reducedMotion) state.fx.push({ type: 'push', t0: performance.now(), dur: 500 });
    setStatus(state.attached ? T('打點中……', 'Ticking…') : T('推出去了！看看紙帶上的點間距。', 'Pushed! Watch the spacing of the dots.'));
    updateButtons();
    startLoop();
  }

  function finish() {
    const tp = state.tape, r = tp.run;
    state.phase = 'done';
    tp.done = true;
    tp.printed = tp.dots.length;
    if (r.reachedEnd) {
      thudSound(r.vEnd);
      if (!reducedMotion) state.fx.push({ type: 'hit', t0: performance.now(), dur: 380 });
    }
    const an = analysis();
    const used = an ? an.st.used : 0;
    const aM = an && an.st.fit ? an.st.fit.slope : NaN;
    let msg = '';
    if (!r.moves) {
      msg = T('小車沒有動：拉力沒有超過最大靜摩擦力，紙帶上的點全疊在同一個位置。', 'The cart did not move: the pull did not exceed the maximum static friction, so all the dots landed on the same spot.');
    } else if (!state.tape.snap.attached) {
      if (r.stopped) msg = T('小車在 ', 'The cart stopped after ') + num(r.xEnd * 100, 1) + T(' cm 處停下來：摩擦力大於重力沿軌道的分量，軌道可以再墊高一點。', ' cm: friction is larger than the weight component along the track — raise the track a little more.');
      else if (Math.abs(aM) <= 0.01) msg = T('a = ', 'a = ') + num(aM, 3) + T(' m/s²：點的間距相等，小車等速前進——摩擦力已經平衡了！', ' m/s²: the dots are equally spaced and the cart moves at constant velocity — friction is balanced!');
      else if (aM < 0) msg = T('a = ', 'a = ') + num(aM, 3) + T(' m/s²：小車在減速，摩擦力還比較大，把軌道再墊高一點。', ' m/s²: the cart slows down, friction still wins — raise the track a little more.');
      else msg = T('a = ', 'a = ') + num(aM, 3) + T(' m/s²：小車在加速，軌道墊得太高了。', ' m/s²: the cart speeds up — the track is tilted too much.');
    } else if (used < 3) {
      msg = T('只剪出 ', 'Only ') + used + T(' 條紙條，無法可靠地求斜率（沒有加入圖表）：把 N 調小或提高打點頻率。', ' strips — too few for a reliable slope (not added to the graph). Use a smaller N or a higher dot frequency.');
    } else {
      const pt = addPoint(tp.snap, aM);
      pulseGraph();
      msg =T('撞上擋板。紙帶量得 a = ', 'Hit the end stop. From the tape a = ') + num(aM, 3) + T(' m/s²，已加入實驗', ' m/s², added to Experiment ') + (state.exp === 1 ? T('一', '1') : T('二', '2')) + T('（第 ', ' (point ') + (pt + 1) + T(' 點）。', ').');
    }
    setStatus(msg);
    updateButtons();
    drawAll();
    emit('run', runData());
    if (r.moves && tp.snap.attached && used >= 3) emitSeries();
  }

  function addPoint(s, a) {
    const list = state.series[state.exp];
    const pt = { M: s.M, m: s.m, Mtot: s.Mtot, F: s.m * G, a: a, mu: s.mu, thDeg: s.thDeg, mystery: s.mystery, mysteryId: s.mysteryId, noise: s.noise };
    // 同樣的 M 與 m 再做一次：取代舊的那一點
    let i = list.findIndex(function (q) { return Math.abs(q.M - pt.M) < 1e-9 && Math.abs(q.m - pt.m) < 1e-9; });
    if (i >= 0) list[i] = pt; else { list.push(pt); i = list.length - 1; }
    state.latest[state.exp] = i;
    return i;
  }
  function emitSeries() {
    const exp = state.exp;
    emit('series', { exp: exp, axis: state.axis[exp], n: state.series[exp].length, points: state.series[exp].map(function (p) { return Object.assign({}, p); }) });
  }

  /** 回到起點（紙帶保留到下一次放開） */
  function backToStart(keepTape) {
    state.phase = 'ready';
    state.t = 0;
    state.x = 0;
    state.run = null;
    if (!keepTape) state.tape = null;
    updateButtons();
  }

  // ---------- 動畫 ----------
  let lastT = 0, loopOn = false;
  function tick(now) {
    if (state.phase !== 'running') { loopOn = false; return; }
    const dt = Math.min((now - lastT) / 1000, 1 / 30) * (state.slow ? SLOW : 1);
    lastT = now;
    const r = state.run, tp = state.tape;
    state.t = Math.min(state.t + dt, r.tEnd);
    state.x = NS.xAt(r, state.t);
    const k0 = tp.printed - 1;
    let k = tp.printed;
    while (k < tp.dots.length && tp.dots[k].t <= state.t + 1e-12) k++;
    tp.printed = k;
    if (k - 1 > k0) clicksFor(k0, k - 1);
    if (state.t >= r.tEnd - 1e-12) { finish(); loopOn = false; return; }
    drawA(); drawTape(); updateReadouts(); // 跑的途中圖表不變，不必重畫
    requestAnimationFrame(tick);
  }
  function startLoop() {
    if (loopOn) return;
    loopOn = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }

  $('go').addEventListener('click', function () {
    if (state.phase === 'ready') release();
    else if (state.phase === 'running') { state.phase = 'paused'; updateButtons(); setStatus(T('暫停中。', 'Paused.')); requestDraw(); }
    else if (state.phase === 'paused') { state.phase = 'running'; setStatus(''); updateButtons(); startLoop(); }
    else { backToStart(true); setStatus(T('小車放回起點了（上一條紙帶還留著），按「', 'The cart is back at the start (the last tape is kept). Press “') + (state.attached ? T('放開小車', 'Release the cart') : T('推一下小車', 'Push the cart')) + T('」再做一次。', '” to run again.')); requestDraw(); }
  });

  // 全部清除：紙帶、兩張圖表的數據與小車位置（滑桿設定不變）
  $('clearAll').addEventListener('click', function () {
    backToStart(false);
    state.series = { 1: [], 2: [] };
    state.latest = { 1: -1, 2: -1 };
    state.fx = [];
    setStatus(T('已全部清除：紙帶與圖表都清空了，滑桿設定不變。', 'Everything is cleared: the tape and both graphs are empty; the slider settings are kept.'));
    drawAll();
  });

  $('undo').addEventListener('click', function () {
    const list = state.series[state.exp];
    if (!list.length) return;
    const i = state.latest[state.exp] >= 0 ? state.latest[state.exp] : list.length - 1;
    list.splice(i, 1);
    state.latest[state.exp] = -1;
    drawAll();
    say(T('已移除一個數據點，剩 ', 'Removed a data point; ') + list.length + T(' 點。', list.length === 1 ? ' point left.' : ' points left.'));
  });

  $('slow').addEventListener('change', function (ev) { state.slow = ev.target.checked; requestDraw(); });

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
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
  });
  updateSoundButton();

  // ---------- 條件改變 ----------
  /** 物理條件改變：跑到一半就取消這一次（紙帶作廢）；跑完的話小車放回起點、紙帶留著 */
  function physChanged() {
    if (state.phase === 'running' || state.phase === 'paused') {
      backToStart(false);
      setStatus(T('條件改變了，小車放回起點。', 'The settings changed, so the cart was put back at the start.'));
    } else if (state.phase === 'done') {
      backToStart(true);
      setStatus('');
    }
    updateButtons();
    requestDraw();
  }

  const elM = $('M'), elm = $('m'), elMu = $('mu'), elTh = $('th'), elN = $('N'), elV0 = $('v0');
  function showOut(el, unit) { $(el.id + 'o').textContent = fmtSlider(val(el), el) + unit; }
  function refreshOutputs() {
    showOut(elM, ' kg');
    showOut(elm, ' kg');
    showOut(elMu, '');
    showOut(elTh, '°');
    showOut(elN, '');
    showOut(elV0, ' m/s');
    const th = state.thDeg * DEG;
    setHTML('tiltInfo', 'tan θ = ' + num(Math.tan(th), 4) + (state.mystery ? T('（μ 未知）', ' (μ unknown)') : T('（μ = ', ' (μ = ') + num(state.muSet, 3) + T('）', ')')) +
      '<br>' + T('墊高 h = ', 'raised by h = ') + num(NS.heightFromAngle(th, 1) * 100, 2) + T(' cm（軌道長 1.00 m）', ' cm (track 1.00 m long)'));
    setHTML('tauInfo', T('每條紙條的時間 τ = N/f = ', 'Time per strip τ = N/f = ') + num(state.N / state.freq, 4) + ' s');
    setHTML('freqInfo', {
      60: T('60 Hz（預設）：接臺灣的家用電源，每 1/60 s 打一點；每 6 個間隔恰好 0.1 s。', '60 Hz (default): runs on Taiwan’s 60 Hz mains, one dot every 1/60 s; 6 intervals make exactly 0.1 s.'),
      50: T('50 Hz：使用 50 Hz 電源的地區（例如中國大陸、歐洲），每 1/50 s 打一點；每 5 個間隔是 0.1 s。', '50 Hz: regions with 50 Hz mains (e.g. Europe, mainland China), one dot every 1/50 s; 5 intervals make 0.1 s.'),
      20: T('20 Hz：每 0.05 s 打一點（點比較少，方便數）。', '20 Hz: one dot every 0.05 s (fewer dots, easy to count).'),
      10: T('10 Hz：每 0.1 s 打一點，每個間隔就是 0.1 s。', '10 Hz: one dot every 0.1 s, so each interval is 0.1 s.')
    }[state.freq]);
    // 移動槽碼按鈕
    $('toHang').disabled = !state.attached || state.M - 0.01 < 0.2 - 1e-9 || state.m + 0.01 > 0.5 + 1e-9;
    $('toCart').disabled = !state.attached || state.m - 0.01 < 0.01 - 1e-9 || state.M + 0.01 > 2 + 1e-9;
    if (state.mystery) $('muo').textContent = '?';
    updateSceneLabel();
  }
  function readSliders() {
    state.M = val(elM);
    state.m = val(elm);
    state.muSet = val(elMu);
    state.thDeg = val(elTh);
    state.v0 = val(elV0);
  }
  let lastTh = null;
  [elM, elm, elMu, elTh, elV0].forEach(function (el) {
    el.addEventListener('input', function () {
      readSliders();
      refreshOutputs();
      if (el === elTh && lastTh !== state.thDeg) { lastTh = state.thDeg; if (A) buildBg(); }
      physChanged();
    });
  });
  // 讀數播報：放開滑桿或打完數字後，念出新的理論值
  [elM, elm, elMu, elTh, elV0].forEach(function (el) { el.addEventListener('change', sayTheory); });
  elN.addEventListener('input', function () {
    state.N = Math.max(1, Math.round(val(elN)));
    refreshOutputs();
    requestDraw();
  });
  // 任務：同一條紙帶重新剪（放開滑桿或打完數字後）
  elN.addEventListener('change', function () {
    if (state.tape && state.tape.done && state.tape.run.moves) emit('recut', runData());
  });

  // 移動 10 g 槽碼（M + m 不變）
  function move(dm) {
    const M = Math.round((state.M - dm) * 1000) / 1000, m = Math.round((state.m + dm) * 1000) / 1000;
    if (M < 0.2 - 1e-9 || M > 2 + 1e-9 || m < 0.01 - 1e-9 || m > 0.5 + 1e-9) return;
    if (window.LabNum) { window.LabNum.set(elM, M); window.LabNum.set(elm, m); }
    else { elM.value = M; elm.value = m; elM.dispatchEvent(new Event('input')); elm.dispatchEvent(new Event('input')); }
  }
  $('toHang').addEventListener('click', function () { move(0.01); });
  $('toCart').addEventListener('click', function () { move(-0.01); });

  function setMode(att) {
    if (att === state.attached) return;
    state.attached = att;
    $('modeHang').setAttribute('aria-pressed', String(att));
    $('modePush').setAttribute('aria-pressed', String(!att));
    $('boxm').hidden = !att;
    $('moveBox').hidden = !att;
    $('moveHint').hidden = !att;
    $('boxv0').hidden = att;
    refreshOutputs();
    physChanged();
    sayTheory();
  }
  $('modeHang').addEventListener('click', function () { setMode(true); });
  $('modePush').addEventListener('click', function () { setMode(false); });

  $('mystery').addEventListener('change', function (ev) {
    state.mystery = ev.target.checked;
    if (state.mystery) {
      state.mysteryId++;
      state.muHidden = Math.round((0.015 + Math.random() * 0.03) * 1000) / 1000;
    }
    $('boxmu').classList.toggle('locked', state.mystery);
    elMu.disabled = state.mystery;
    refreshOutputs();
    if (!state.mystery) showOut(elMu, '');
    physChanged();
    sayTheory();
  });

  document.querySelectorAll('.seg4 button[data-f]').forEach(function (b) {
    b.addEventListener('click', function () {
      const f = +b.getAttribute('data-f');
      if (f === state.freq) return;
      state.freq = f;
      document.querySelectorAll('.seg4 button[data-f]').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      // 換頻率時，每條紙條的間隔數換成最接近 0.1 s 的值
      const n = Math.max(1, Math.min(12, Math.round(0.1 * f)));
      if (window.LabNum) window.LabNum.set(elN, n); else { elN.value = n; elN.dispatchEvent(new Event('input')); }
      refreshOutputs();
      physChanged();
    });
  });
  $('noise').addEventListener('change', function (ev) { state.noise = ev.target.checked; physChanged(); });
  $('gatesOn').addEventListener('change', function (ev) { state.show.gates = ev.target.checked; requestDraw(); });
  $('fbdOn').addEventListener('change', function (ev) { state.show.fbd = ev.target.checked; if (A) buildBg(); requestDraw(); });

  // 圖表：選擇實驗與橫軸
  function setExp(e) {
    state.exp = e;
    $('exp1').setAttribute('aria-pressed', String(e === 1));
    $('exp2').setAttribute('aria-pressed', String(e === 2));
    $('axis1').hidden = e !== 1;
    $('axis2').hidden = e !== 2;
    requestDraw();
  }
  $('exp1').addEventListener('click', function () { setExp(1); });
  $('exp2').addEventListener('click', function () { setExp(2); });
  [1, 2].forEach(function (e) {
    $('axis' + e).querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.axis[e] = b.getAttribute('data-ax');
        $('axis' + e).querySelectorAll('button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
        requestDraw();
        if (state.series[e].length) emitSeries();
      });
    });
  });

  // 分享目前設定：第二個實驗區（圖表）的「實驗一／二」與橫軸選擇不在 classroom.js 自動記錄的範圍，另外登記
  // （classroom.js 在 DOMContentLoaded 之後才動態載入，所以等 load 再登記；還原在 load 之後兩格畫面才進行）
  function shareReady(fn) {
    if (window.LabShare) fn(window.LabShare);
    else window.addEventListener('load', function () { if (window.LabShare) fn(window.LabShare); });
  }
  shareReady(function (LS) {
    LS.register({
      get: function () { return { e: state.exp, a1: state.axis[1], a2: state.axis[2] }; },
      set: function (o) {
        if (!o || typeof o !== 'object') return;
        [1, 2].forEach(function (e) {
          const ax = o['a' + e];
          if (typeof ax !== 'string' || ax === state.axis[e]) return;
          const b = Array.prototype.find.call($('axis' + e).querySelectorAll('button[data-ax]'), function (x) { return x.getAttribute('data-ax') === ax; });
          if (b) b.click();
        });
        if (o.e === 1 || o.e === 2) setExp(o.e);
      }
    });
  });

  // ---------- 啟動 ----------
  readColors();
  readSliders();
  lastTh = state.thDeg;
  refreshOutputs();
  updateButtons();
  setStatus(T('準備好了：按「放開小車」。打點計時器會在放開的瞬間打下第一點。', 'Ready: press “Release the cart”. The ticker prints its first dot at the instant of release.'));
  function themeChanged() { readColors(); if (A) buildBg(); requestDraw(); }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  const widths = new WeakMap();
  function observe(el, fn) {
    if (window.ResizeObserver) {
      new ResizeObserver(function () { if (el.clientWidth !== widths.get(el)) { widths.set(el, el.clientWidth); fn(); } }).observe(el);
    }
    window.addEventListener('resize', fn);
  }
  observe(cv, resizeA);
  observe(tcv, resizeT);
  observe(gcv, resizeG);
  resizeA(); resizeT(); resizeG();
  updateReadouts();
})();
