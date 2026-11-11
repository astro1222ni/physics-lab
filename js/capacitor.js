/* capacitor.js — 「平行板電容器」模組的畫面與互動（物理計算在 capacitor-core.js） */
(function () {
  'use strict';
  const K = window.CapacitorCore;
  const $ = function (id) { return document.getElementById(id); };
  // 介面文字：英文模式用第二個字串（settings.js）
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  // 滑桿讀值：打字輸入的精確值（numinput.js）優先
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------- 固定比例（畫面上有說明） ----------
  const A_MAX = 0.04;       // m²：最大面積（邊長 0.2 m）
  const D_MAX = 0.010;      // m：最大板距
  const E_REF = 5000;       // V/m：預設狀態（10 V、2 mm）的電場，作為電場線與電荷疏密的基準
  const Q_DOT = 4.4271e-10 / 14; // C：每個流動的「電子點」與每一聲「嗒」代表的電量（預設 Q 的 1/14）
  const TAU = reducedMotion ? 0 : 0.32; // s：RC 充電慢動作示意的時間常數
  const OX = 0.24, OY = 0.13; // 斜視的深度方向：每 1 單位深度向右 OX、向上 OY（以平板邊長為單位）

  // 介電質預設值與畫面色調（只用 lab.css 代號）
  const MATERIALS = [
    { k: 1, zh: '空氣', en: 'air', col: null },
    { k: 3.5, zh: '紙', en: 'paper', col: 'equi' },
    { k: 5, zh: '玻璃', en: 'glass', col: 'b-wave' },
    { k: 6, zh: '雲母', en: 'mica', col: 'b-mech' },
    { k: 80, zh: '水', en: 'water', col: 'neg' }
  ];

  const state = {
    A: 0.01, d: 0.002, Vb: 10, kappa: 1, f: 1,
    mode: 'V',           // 'V'：接上電池；'Q'：充電後斷開
    Qfix: 0,             // 斷開時固定的電量
    q: 0,                // 畫面上的電量（接上電池時以 RC 慢動作趨近 Q = CV）
    flowPhase: 0,        // 導線中電子點的位置（px）
    flowI: 0,            // 目前的電流（C/s，示意）
    acc: 0,              // 累積流過的電量，用來每 Q_DOT 發一聲
    show: { lines: true, fringe: false, bound: true, dip: true, flow: true },
    base: null,          // 前一狀態（最近一次改變之前）的讀數
    gesture: null,       // 目前這次改變：{ key, t, from }
    hover: null, drag: null,
    fx: []               // 純裝飾效果（開關的火花）
  };

  function params() { return { A: state.A, d: state.d, kappa: state.kappa, f: state.kappa > 1 ? state.f : 0 }; }
  function eq() { return K.solve(params(), state.mode, state.mode === 'V' ? state.Vb : state.Qfix); }
  function disp() { return K.solve(params(), 'Q', state.q); } // 畫面上目前的電荷所對應的狀態

  // ---------- 色彩（lab.css 代號） ----------
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface',
      '--pos', '--neg', '--equi', '--field', '--b-em', '--b-mech', '--b-wave', '--b-optics']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    colors.dark = isDark();
  }
  function rgbOf(c) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(c).trim());
    if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    const n = String(c).match(/[\d.]+/g);
    return n && n.length >= 3 ? [+n[0], +n[1], +n[2]] : [128, 128, 128];
  }
  function alpha(c, a) { const r = rgbOf(c); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + a + ')'; }
  /** f > 0 往白色混合、f < 0 往黑色混合 */
  function shade(c, f) {
    const r = rgbOf(c), t = f > 0 ? 255 : 0, k = Math.abs(f);
    return 'rgb(' + r.map(function (x) { return Math.round(x + (t - x) * k); }).join(',') + ')';
  }
  /** 兩色混合：t = 0 為 a，t = 1 為 b */
  function mix(a, b, t) {
    const x = rgbOf(a), y = rgbOf(b);
    return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(x[i] + (y[i] - x[i]) * t); }).join(',') + ')';
  }
  function isDark() {
    const r = rgbOf(getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg'));
    return (r[0] + r[1] + r[2]) / 3 < 100;
  }
  function material() {
    for (let i = 0; i < MATERIALS.length; i++) if (Math.abs(MATERIALS[i].k - state.kappa) < 1e-9) return MATERIALS[i];
    return null;
  }
  function slabColor() { const m = material(); return colors[m && m.col ? m.col : 'b-optics']; }

  // ---------- 數字格式 ----------
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  const PREFIX = { '-15': 'f', '-12': 'p', '-9': 'n', '-6': 'μ', '-3': 'm', '0': '', '3': 'k', '6': 'M' };
  /** 三位有效數字＋SI 字首，例如 44.3 pF */
  function si(v, unit) {
    if (v == null || !isFinite(v)) return '—';
    if (v === 0) return '0 ' + unit;
    let e = Math.floor(Math.log10(Math.abs(v)) / 3) * 3;
    e = Math.max(-15, Math.min(6, e));
    let m = v / Math.pow(10, e);
    let s = m.toPrecision(3);
    if (Math.abs(+s) >= 1000 && e < 6) { e += 3; m = v / Math.pow(10, e); s = m.toPrecision(3); }
    if (s.indexOf('e') >= 0) s = (+s).toString();
    return s.replace('-', '−') + ' ' + PREFIX[String(e)] + unit;
  }
  function ratioText(r) {
    if (!isFinite(r)) return '';
    const s = r >= 100 ? r.toFixed(0) : r >= 10 ? r.toFixed(1) : r >= 0.1 ? r.toFixed(2) : r.toPrecision(2);
    return '×' + s;
  }
  /** 滑桿數字：顯示到可輸入的精度（去掉多餘的 0，但不少於滑桿間隔的位數） */
  function fmtSlider(v, el, stepDec) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    if (stepDec == null) stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s;
  }

  // ---------- 畫布與版面 ----------
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 300;
  let L = null; // 版面
  const bg = document.createElement('canvas');
  const bgctx = bg.getContext('2d');

  function fontPx(n, w) { return (w || '600') + ' ' + n + 'px system-ui, sans-serif'; }
  function textH(font) {
    ctx.font = font;
    const m = ctx.measureText('Ag測');
    return m.fontBoundingBoxAscent > 0 ? m.fontBoundingBoxAscent + m.fontBoundingBoxDescent : 15;
  }

  function layout() {
    const narrow = cw < 560;
    const fs = narrow ? 11 : 12;
    const lab = fontPx(fs);
    ctx.font = lab;
    const dW = narrow ? Math.max(ctx.measureText('d =').width, ctx.measureText('10.0 mm').width)
      : ctx.measureText('d = 10.0 mm').width;
    const xw = narrow ? 14 : 24;                      // 左側導線
    const x0 = Math.round(xw + Math.max(dW + 34, narrow ? 64 : 96)); // 平板左端
    // px/m（水平與深度）：最大平板加上約一半板長的介電質（全部抽出時，最大平板的介電質會有一部分在畫面外）
    const kx = (cw - x0 - 10) / (Math.sqrt(A_MAX) * (1.55 + OX));
    const Lmax = Math.sqrt(A_MAX) * kx;
    const Gmax = narrow ? 132 : Math.max(170, Math.min(220, cw * 0.25));
    const ky = Gmax / D_MAX;                          // px/m（板距方向，放大）
    const pt = narrow ? 11 : 14;                      // 平板厚度（示意）
    const lh = textH(fontPx(narrow ? 11.5 : 12.5)) + 2;
    const yw1 = narrow ? 14 : 18;
    const topZone = yw1 + 24 + OY * Lmax + 10;        // 上板在最大板距時的頂面
    const yBT = Math.round(topZone + pt + Gmax);      // 下板頂面（固定）
    const ovH = 5 * lh + 12;
    const bottomZone = Math.max(narrow ? 84 : 92, ovH + 18);
    const yw2 = Math.round(yBT + pt + bottomZone - (narrow ? 26 : 30));
    return {
      narrow: narrow, fs: fs, lab: lab, xw: xw, x0: x0, kx: kx, ky: ky, Lmax: Lmax, pt: pt,
      yw1: yw1, yBT: yBT, yw2: yw2, lh: lh, ovH: ovH,
      H: yBT + pt + bottomZone,
      g0: narrow ? 15 : 22,                           // 預設電場時的電場線間距（px）
      rc: narrow ? 2.7 : 3.3,                         // 電荷符號半徑
      dip: narrow ? 13 : 16
    };
  }
  /** 目前參數下的幾何位置 */
  function geo() {
    const p = params();
    const Lp = Math.sqrt(p.A) * L.kx;
    const gap = p.d * L.ky;
    const yTB = L.yBT - gap, yTT = yTB - L.pt;
    const ox = OX * Lp, oy = OY * Lp;
    const xs0 = L.x0 + Lp * (1 - state.f);
    return {
      Lp: Lp, gap: gap, x0: L.x0, x1: L.x0 + Lp, yTB: yTB, yTT: yTT, yBT: L.yBT, yBB: L.yBT + L.pt,
      ox: ox, oy: oy, xs0: xs0, xs1: xs0 + Lp,
      xa: L.x0 + 0.3 * Lp,                             // 導線接點
      slab: state.kappa > 1
    };
  }

  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    L = layout();
    ch = Math.round(L.H);
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    buildBackground();
    draw();
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

  /** 不變的圖層：底色暈影與極淡的格點（主題或尺寸改變時才重畫） */
  function buildBackground() {
    bg.width = cv.width;
    bg.height = cv.height;
    const c = bgctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    const base = colors['canvas-bg'];
    const rg = c.createRadialGradient(cw * 0.55, ch * 0.45, Math.min(cw, ch) * 0.1, cw * 0.55, ch * 0.45, Math.max(cw, ch) * 0.75);
    rg.addColorStop(0, colors.dark ? shade(base, 0.035) : base);
    rg.addColorStop(1, shade(base, colors.dark ? -0.35 : -0.05));
    c.fillStyle = rg;
    roundRect(c, 0, 0, cw, ch, 8);
    c.fill();
    // 極淡的點陣，增加質感
    c.fillStyle = alpha(colors.text, colors.dark ? 0.05 : 0.06);
    const s = L.narrow ? 16 : 20;
    for (let y = s / 2; y < ch; y += s) for (let x = s / 2; x < cw; x += s) c.fillRect(Math.round(x), Math.round(y), 1, 1);
    c.strokeStyle = alpha(colors.text, 0.08);
    c.lineWidth = 1;
    roundRect(c, 0.5, 0.5, cw - 1, ch - 1, 8);
    c.stroke();
  }

  // ---------- 繪圖工具 ----------
  /** 有半透明圓角底框的標籤；ctx.textAlign 決定水平對齊，垂直置中於 y */
  function pill(text, x, y, color, font, bgAlpha) {
    ctx.font = font || L.lab;
    ctx.textBaseline = 'middle';
    const m = ctx.measureText(text), tw = m.width;
    const fh = m.fontBoundingBoxAscent > 0 ? m.fontBoundingBoxAscent + m.fontBoundingBoxDescent : 15;
    const ph = fh + 3, pw = tw + 10;
    const al = ctx.textAlign;
    const bx = al === 'center' ? x - pw / 2 : al === 'right' ? x - tw - 5 : x - 5;
    ctx.fillStyle = alpha(colors['canvas-bg'], bgAlpha == null ? 0.86 : bgAlpha);
    roundRect(ctx, bx, y - ph / 2, pw, ph, ph / 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, x, y + 0.5);
    return { x: bx, y: y - ph / 2, w: pw, h: ph };
  }

  /** 兩層線條的「管子」：底層粗而暗，上層細而亮、略偏上 */
  function tube(pts, w, base, light) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = base;
    ctx.lineWidth = w;
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.stroke();
    ctx.strokeStyle = light;
    ctx.lineWidth = Math.max(0.8, w * 0.36);
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0] - w * 0.15, p[1] - w * 0.2); else ctx.moveTo(p[0] - w * 0.15, p[1] - w * 0.2); });
    ctx.stroke();
  }

  /** 小箭頭（略帶弧度的三角形），尖端在 (x, y)，方向 (ux, uy) */
  function head(x, y, ux, uy, size, color) {
    const nx = -uy, ny = ux, hw = size * 0.45;
    const xh = x - ux * size, yh = y - uy * size;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - ux * size * 0.45 + nx * hw * 0.35, y - uy * size * 0.45 + ny * hw * 0.35, xh + nx * hw, yh + ny * hw);
    ctx.lineTo(xh + ux * size * 0.2, yh + uy * size * 0.2);
    ctx.lineTo(xh - nx * hw, yh - ny * hw);
    ctx.quadraticCurveTo(x - ux * size * 0.45 - nx * hw * 0.35, y - uy * size * 0.45 - ny * hw * 0.35, x, y);
    ctx.closePath();
    ctx.fill();
  }

  // 電荷小球 sprite（徑向漸層＋亮邊＋正負號），每種顏色與大小預先畫好
  const sprites = {};
  function chargeSprite(sign, r, hollow) {
    const key = sign + ':' + r + ':' + (hollow ? 1 : 0) + ':' + dpr + ':' + colors.pos + colors.neg + colors['b-optics'] + colors.dark;
    if (sprites[key]) return sprites[key];
    const S = Math.ceil((r + 2) * 2 * dpr);
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const m = S / dpr / 2;
    const base = sign > 0 ? colors.pos : colors.neg;
    if (hollow) {
      // 束縛電荷：空心圓環（形狀與自由電荷不同，不只靠顏色區分）
      g.fillStyle = alpha(colors['canvas-bg'], 0.55);
      g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = mix(base, colors['b-optics'], 0.35);
      g.lineWidth = Math.max(1, r * 0.32);
      g.beginPath(); g.arc(m, m, r - g.lineWidth / 2, 0, Math.PI * 2); g.stroke();
    } else {
      const gr = g.createRadialGradient(m - r * 0.35, m - r * 0.38, r * 0.1, m, m, r);
      gr.addColorStop(0, shade(base, 0.6));
      gr.addColorStop(0.5, base);
      gr.addColorStop(1, shade(base, -0.38));
      g.fillStyle = gr;
      g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.fill();
    }
    // 正負號
    g.strokeStyle = hollow ? mix(base, colors['b-optics'], 0.35) : 'rgba(255,255,255,0.92)';
    g.lineWidth = Math.max(0.9, r * 0.28);
    g.lineCap = 'round';
    const a = r * 0.5;
    g.beginPath();
    g.moveTo(m - a, m); g.lineTo(m + a, m);
    if (sign > 0) { g.moveTo(m, m - a); g.lineTo(m, m + a); }
    g.stroke();
    sprites[key] = { c: c, h: S / dpr / 2 };
    return sprites[key];
  }
  function putCharge(x, y, sign, r, hollow) {
    const s = chargeSprite(sign, r, hollow);
    ctx.drawImage(s.c, x - s.h, y - s.h, s.h * 2, s.h * 2);
  }

  /**
   * 一段區域 [a, b] 的電荷符號位置：間距 s（px，與面密度成反比）。太密時排成 2–3 列（錯開半格），
   * 仍放不下時以最小間距畫，並回報 capped。
   */
  function chargeRows(a, b, s, rmax) {
    const smin = 2 * L.rc + 1.4;
    if (!(s > 0) || !isFinite(s) || b - a < 1) return { pts: [], capped: false };
    let rows = 1;
    while (s * rows < smin && rows < rmax) rows++;
    let step = s * rows, capped = false;
    if (step < smin) { step = smin; capped = true; }
    const n = Math.floor((b - a) / step + 1e-9);
    const pts = [];
    if (n < 1) {
      // 區域比間距短：應有的個數 ≥ 0.5 才在中間畫一個（四捨五入）
      if ((b - a) >= step * 0.5) pts.push({ x: (a + b) / 2, row: 0 });
      return { pts: pts, capped: capped };
    }
    const off = a + ((b - a) - (n - 1) * step) / 2;
    for (let r = 0; r < rows; r++) {
      const sh = rows > 1 ? (r - (rows - 1) / 2) * step / rows : 0;
      for (let i = 0; i < n; i++) {
        const x = off + i * step + sh;
        if (x >= a + L.rc * 0.6 && x <= b - L.rc * 0.6) pts.push({ x: x, row: r });
      }
    }
    return { pts: pts, capped: capped };
  }

  /** 金屬平板（斜視的立體盒子）：正面、頂面、右側面 */
  function plateBox(x, yT, w, h, ox, oy, tint, hl) {
    const metal = colors.dark ? '#8d9aa0' : '#a9b4b8';
    const baseC = mix(metal, tint, 0.12);
    // 頂面
    ctx.beginPath();
    ctx.moveTo(x, yT); ctx.lineTo(x + ox, yT - oy); ctx.lineTo(x + w + ox, yT - oy); ctx.lineTo(x + w, yT); ctx.closePath();
    const gt = ctx.createLinearGradient(x, yT - oy, x + w, yT);
    gt.addColorStop(0, shade(baseC, 0.42));
    gt.addColorStop(1, shade(baseC, 0.18));
    ctx.fillStyle = gt;
    ctx.fill();
    // 右側面
    ctx.beginPath();
    ctx.moveTo(x + w, yT); ctx.lineTo(x + w + ox, yT - oy); ctx.lineTo(x + w + ox, yT - oy + h); ctx.lineTo(x + w, yT + h); ctx.closePath();
    ctx.fillStyle = shade(baseC, -0.28);
    ctx.fill();
    // 正面：上亮下暗
    const gf = ctx.createLinearGradient(0, yT, 0, yT + h);
    gf.addColorStop(0, shade(baseC, 0.1));
    gf.addColorStop(1, shade(baseC, -0.18));
    ctx.fillStyle = gf;
    ctx.fillRect(x, yT, w, h);
    // 拉絲金屬的細紋
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let yy = yT + 3.5; yy < yT + h - 1; yy += 3) { ctx.moveTo(x + 1, Math.round(yy) + 0.5); ctx.lineTo(x + w - 1, Math.round(yy) + 0.5); }
    ctx.stroke();
    // 高光與暗線
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath(); ctx.moveTo(x, yT + 0.5); ctx.lineTo(x + w, yT + 0.5); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.moveTo(x, yT + h - 0.5); ctx.lineTo(x + w, yT + h - 0.5); ctx.stroke();
    if (hl) {
      ctx.save();
      ctx.strokeStyle = alpha(colors.accent, 0.75);
      ctx.lineWidth = 2;
      ctx.shadowColor = alpha(colors.accent, 0.6);
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(x, yT + h); ctx.lineTo(x, yT); ctx.lineTo(x + ox, yT - oy); ctx.lineTo(x + w + ox, yT - oy);
      ctx.lineTo(x + w + ox, yT - oy + h); ctx.lineTo(x + w, yT + h); ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---------- 主繪圖 ----------
  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }

  function wirePath(G) {
    // 由上板接點出發 → 上方導線 → 左側導線（開關）→ 下方導線（電池）→ 下板接點
    const xt = G.xa + G.ox * 0.5, yt = G.yTT - G.oy * 0.5;
    return [[xt, yt], [xt, L.yw1], [L.xw, L.yw1], [L.xw, L.yw2], [G.xa, L.yw2], [G.xa, G.yBB]];
  }
  function switchGeo() {
    const y1 = L.yw1 + (L.narrow ? 22 : 28);
    return { x: L.xw, yc: y1, yp: y1 + (L.narrow ? 24 : 30) }; // yc：接點，yp：轉軸
  }
  function batteryGeo(G) {
    const bw = L.narrow ? 40 : 54, bh = L.narrow ? 18 : 22;
    const cx = (L.xw + G.xa) / 2;
    return { x: cx - bw / 2, y: L.yw2 - bh / 2, w: bw, h: bh, cx: cx };
  }

  function draw() {
    if (!L) return;
    const G = geo(), S = disp(), Q = eq();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(bg, 0, 0, cw, ch);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    drawCircuit(G);
    // 下板
    plateBox(G.x0, G.yBT, G.Lp, L.pt, G.ox, G.oy, colors.neg, false);
    const info = { capped: false, linesCapped: false };
    if (state.show.lines) drawLines(G, S, info, true);
    if (state.show.lines && state.show.fringe) drawFringe(G, S);
    if (G.slab) drawSlab(G, S, info);
    if (state.show.lines) drawLines(G, S, info, false);
    drawPlateCharges(G, S, info, -1);
    // 上板（可拖曳）
    plateBox(G.x0, G.yTT, G.Lp, L.pt, G.ox, G.oy, colors.pos, state.hover === 'plate' || (state.drag && state.drag.what === 'plate'));
    drawPlateCharges(G, S, info, +1);
    drawLabels(G);
    drawOverlay(G, Q);
    drawNotes(G, info);
    drawEffects();
  }

  /** 電池、開關、導線與導線中流動的電子 */
  function drawCircuit(G) {
    const P = wirePath(G), sw = switchGeo(), B = batteryGeo(G);
    const w = L.narrow ? 3 : 3.6;
    const base = colors.dark ? '#6f7a7e' : '#8b979b';
    const light = colors.dark ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.75)';
    // 導線：開關處斷開兩段
    tube([P[0], P[1], P[2], [sw.x, sw.yc]], w, base, light);
    tube([[sw.x, sw.yp], P[3], P[4], P[5]], w, base, light);
    // 接點的小焊點
    [P[0], P[5]].forEach(function (p) {
      ctx.fillStyle = shade(base, -0.2);
      ctx.beginPath(); ctx.arc(p[0], p[1], w * 0.9, 0, Math.PI * 2); ctx.fill();
    });

    // 電子流動（只在電荷改變時出現）
    if (state.show.flow && !reducedMotion && state.mode === 'V' && Math.abs(state.flowI) > 0) drawElectrons(P, B);

    // 開關：接點、轉軸與刀片
    const open = state.mode === 'Q';
    const ang = open ? -0.72 : 0; // 斷開時刀片向右上轉開
    const len = sw.yp - sw.yc;
    const tx = sw.x + Math.sin(-ang) * len, ty = sw.yp - Math.cos(ang) * len;
    const hov = state.hover === 'switch';
    if (hov) {
      ctx.fillStyle = alpha(colors.accent, 0.14);
      ctx.beginPath(); ctx.arc(sw.x + (open ? len * 0.3 : 0), (sw.yc + sw.yp) / 2, len * 0.95, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = shade(base, -0.25);
    ctx.beginPath(); ctx.arc(sw.x, sw.yc, w * 1.15, 0, Math.PI * 2); ctx.fill();
    tube([[sw.x, sw.yp], [tx, ty]], w * 0.95, open ? colors.muted : shade(colors.accent, -0.1), light);
    const pg = ctx.createRadialGradient(sw.x - 1.5, sw.yp - 1.5, 0.5, sw.x, sw.yp, w * 1.6);
    pg.addColorStop(0, shade(base, 0.5)); pg.addColorStop(1, shade(base, -0.35));
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(sw.x, sw.yp, w * 1.6, 0, Math.PI * 2); ctx.fill();
    // 開關標籤
    ctx.textAlign = 'left';
    pill(open ? T('開關：斷開', 'Switch: open') : T('開關：接上', 'Switch: closed'), sw.x + (L.narrow ? 9 : 12), (sw.yc + sw.yp) / 2 + (open ? 6 : 0),
      open ? colors.muted : colors.accent, fontPx(L.narrow ? 10.5 : 11.5), 0.8);

    // 電池：橫放的圓柱形電池，左端為正極（接上板）
    const bodyC = colors['b-em'];
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,' + (colors.dark ? 0.5 : 0.22) + ')';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    const gb = ctx.createLinearGradient(0, B.y, 0, B.y + B.h);
    gb.addColorStop(0, shade(bodyC, 0.45));
    gb.addColorStop(0.35, bodyC);
    gb.addColorStop(1, shade(bodyC, -0.45));
    ctx.fillStyle = gb;
    roundRect(ctx, B.x, B.y, B.w, B.h, 4);
    ctx.fill();
    ctx.restore();
    // 負極端的金屬環
    const gm = ctx.createLinearGradient(0, B.y, 0, B.y + B.h);
    gm.addColorStop(0, '#e6eaec'); gm.addColorStop(0.4, '#b9c1c4'); gm.addColorStop(1, '#6e787c');
    ctx.fillStyle = gm;
    roundRect(ctx, B.x + B.w - 6, B.y, 6, B.h, 3); ctx.fill();
    // 正極凸起
    roundRect(ctx, B.x - 4, L.yw2 - B.h * 0.22, 5, B.h * 0.44, 1.5); ctx.fill();
    // 高光
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(B.x + 3, B.y + 2.5); ctx.lineTo(B.x + B.w - 8, B.y + 2.5); ctx.stroke();
    // 正負號
    ctx.font = fontPx(L.narrow ? 11 : 13, '700');
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText('+', B.x + 7, L.yw2 + 0.5);
    ctx.fillText('−', B.x + B.w - 13, L.yw2 + 0.5);
    ctx.textAlign = 'center';
    pill(T('電池 ', 'Battery ') + fmtV(state.Vb), B.cx, B.y - (L.narrow ? 11 : 13), open ? colors.muted : colors['b-em'], fontPx(L.narrow ? 10.5 : 11.5), 0.8);
  }
  function fmtV(v) { return (Math.abs(v - Math.round(v)) < 1e-9 ? num(v, 0) : num(v, 2).replace(/0$/, '')) + ' V'; }

  /** 沿導線移動的電子點（帶光暈），電池內部被電池本體蓋住 */
  function drawElectrons(P, B) {
    const segs = [];
    let total = 0;
    for (let i = 1; i < P.length; i++) {
      const l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      segs.push({ a: P[i - 1], b: P[i], s0: total, l: l });
      total += l;
    }
    const sp = L.narrow ? 13 : 16;
    const iRef = Q_DOT / 0.06; // 這個電流以上全亮
    const a = Math.min(1, Math.abs(state.flowI) / iRef);
    if (a < 0.03) return;
    const r = L.narrow ? 2.2 : 2.6;
    const ph = ((state.flowPhase % sp) + sp) % sp;
    for (let s = ph; s < total; s += sp) {
      let k = 0;
      while (k < segs.length - 1 && s > segs[k].s0 + segs[k].l) k++;
      const sg = segs[k], u = (s - sg.s0) / sg.l;
      const x = sg.a[0] + (sg.b[0] - sg.a[0]) * u, y = sg.a[1] + (sg.b[1] - sg.a[1]) * u;
      const fade = Math.min(1, s / 10, (total - s) / 10);
      const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      halo.addColorStop(0, alpha(colors.neg, 0.45 * a * fade));
      halo.addColorStop(1, alpha(colors.neg, 0));
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = alpha(shade(colors.neg, colors.dark ? 0.35 : 0.1), a * fade);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  /**
   * 兩板間的電場線：間距 = g0 · E_REF / E（與 E 成反比），由上板（＋）指向下板（－）。
   * back = true 時畫在深度中間的淡線，增加立體感。
   */
  function lineXs(G, S) {
    if (!(S.E > 0)) return { xs: [], capped: false };
    let g = L.g0 * E_REF / S.E, capped = false;
    if (g < 4) { g = 4; capped = true; }
    const n = Math.floor(G.Lp / g + 1e-9);
    const xs = [];
    if (n < 1) return { xs: xs, capped: capped, g: g };
    const off = G.x0 + (G.Lp - (n - 1) * g) / 2;
    for (let i = 0; i < n; i++) xs.push(off + i * g);
    return { xs: xs, capped: capped, g: g };
  }
  function drawLines(G, S, info, back) {
    const LX = lineXs(G, S);
    if (LX.capped) info.linesCapped = true;
    if (!LX.xs.length) return;
    const col = colors.field;
    if (back) {
      const dx = G.ox * 0.5, dy = -G.oy * 0.5;
      ctx.strokeStyle = alpha(col, colors.dark ? 0.16 : 0.13);
      ctx.lineWidth = 1;
      ctx.beginPath();
      LX.xs.forEach(function (x) { ctx.moveTo(x + dx, G.yTB + dy); ctx.lineTo(x + dx, G.yBT + dy); });
      ctx.stroke();
      return;
    }
    const lw = L.narrow ? 1.3 : 1.6;
    ctx.strokeStyle = alpha(col, colors.dark ? 0.78 : 0.72);
    ctx.lineWidth = lw;
    ctx.beginPath();
    LX.xs.forEach(function (x) { ctx.moveTo(x, G.yTB + 1); ctx.lineTo(x, G.yBT - 1); });
    ctx.stroke();
    if (G.gap >= 16) {
      const hs = Math.min(4 * lw + 1, G.gap * 0.35);
      const ym = (G.yTB + G.yBT) / 2 + hs / 2;
      LX.xs.forEach(function (x) { head(x, ym, 0, 1, hs, alpha(col, 0.9)); });
    }
  }

  /** 邊緣場（示意）：平板兩端向外彎曲的弧線 */
  function drawFringe(G, S) {
    const LX = lineXs(G, S);
    if (!LX.xs.length) return;
    const n = Math.max(1, Math.min(3, Math.round(G.gap / Math.max(LX.g, 1) * 0.8) || 1));
    const col = colors.field;
    [-1, 1].forEach(function (side) {
      const xe = side < 0 ? G.x0 : G.x1;
      for (let i = 1; i <= n; i++) {
        const bulge = (0.35 + 0.42 * i) * G.gap * 0.55 + 4 * i;
        const a = 0.5 - i * 0.12;
        ctx.strokeStyle = alpha(col, a);
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        const y0 = G.yTB - Math.min(L.pt * 0.5, 2 * i), y1 = G.yBT + Math.min(L.pt * 0.5, 2 * i);
        ctx.moveTo(xe, y0);
        ctx.bezierCurveTo(xe + side * bulge, y0, xe + side * bulge, y1, xe, y1);
        ctx.stroke();
        ctx.setLineDash([]);
        head(xe + side * bulge * 0.75, (y0 + y1) / 2 + 3, 0, 1, 6, alpha(col, a + 0.1));
      }
    });
  }

  /** 準隨機數（固定種子），讓「未極化」分子的方向不會每一幀亂跳 */
  function hash(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

  /** 介電質板：半透明的立體板，內部有極化分子（示意），上下表面有束縛電荷 */
  function drawSlab(G, S, info) {
    const col = slabColor();
    const x = G.xs0, w = G.Lp, yT = G.yTB, h = G.gap, ox = G.ox, oy = G.oy;
    const hov = state.hover === 'slab' || (state.drag && state.drag.what === 'slab');
    ctx.save();
    // 輕微投影
    ctx.shadowColor = 'rgba(0,0,0,' + (colors.dark ? 0.45 : 0.18) + ')';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = alpha(col, colors.dark ? 0.2 : 0.16);
    ctx.fillRect(x, yT, w, h);
    ctx.restore();
    // 頂面（只看得到平板外面的部分；平板下面的部分稍後被上板蓋住）
    ctx.beginPath();
    ctx.moveTo(x, yT); ctx.lineTo(x + ox, yT - oy); ctx.lineTo(x + w + ox, yT - oy); ctx.lineTo(x + w, yT); ctx.closePath();
    ctx.fillStyle = alpha(shade(col, 0.35), colors.dark ? 0.42 : 0.38);
    ctx.fill();
    // 右側面
    ctx.beginPath();
    ctx.moveTo(x + w, yT); ctx.lineTo(x + w + ox, yT - oy); ctx.lineTo(x + w + ox, yT - oy + h); ctx.lineTo(x + w, yT + h); ctx.closePath();
    ctx.fillStyle = alpha(shade(col, -0.25), colors.dark ? 0.5 : 0.42);
    ctx.fill();
    // 正面：上亮下暗的玻璃質感
    const gf = ctx.createLinearGradient(0, yT, 0, yT + h);
    gf.addColorStop(0, alpha(shade(col, 0.3), colors.dark ? 0.34 : 0.3));
    gf.addColorStop(0.5, alpha(col, colors.dark ? 0.2 : 0.18));
    gf.addColorStop(1, alpha(shade(col, -0.2), colors.dark ? 0.34 : 0.3));
    ctx.fillStyle = gf;
    ctx.fillRect(x, yT, w, h);
    // 斜向反光
    ctx.save();
    ctx.beginPath(); ctx.rect(x, yT, w, h); ctx.clip();
    const gl = ctx.createLinearGradient(x, yT, x + Math.min(w, h * 2), yT + h);
    gl.addColorStop(0, 'rgba(255,255,255,0)');
    gl.addColorStop(0.45, 'rgba(255,255,255,' + (colors.dark ? 0.07 : 0.16) + ')');
    gl.addColorStop(0.6, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(x, yT, w, h);

    // 極化分子（示意）：平板之間沿電場排列（＋端朝下板），平板外面沒有電場，方向雜亂
    if (state.show.dip && h >= 14) {
      const sp = L.dip, lc = sp * 0.52, wd = Math.max(2.6, sp * 0.2);
      const align = 1 - Math.exp(-S.E / (0.25 * E_REF));
      const rowsN = Math.max(1, Math.floor((h - 6) / sp));
      const y0 = yT + (h - (rowsN - 1) * sp) / 2;
      const nC = Math.floor(w / sp);
      const xOff = x + (w - (nC - 1) * sp) / 2;
      for (let r = 0; r < rowsN; r++) {
        for (let i = 0; i < nC; i++) {
          const xx = xOff + i * sp + (r % 2 ? sp * 0.25 : -sp * 0.25) * 0.5, yy = y0 + r * sp;
          const inside = xx < G.x1 - 2;
          const rnd = (hash(i * 7.3 + r * 13.1) - 0.5) * 2 * Math.PI;
          const th = inside ? rnd * (1 - align) : rnd; // th = 0：＋端朝下
          drawDipole(xx, yy, th, lc, wd, inside ? 1 : 0.55);
        }
      }
    }
    ctx.restore();

    // 束縛電荷：只有平板之間的部分（有電場）才有，面密度 σb = (κ − 1)ε0E
    if (state.show.bound && S.sigmaBound > 0) {
      const a = Math.max(x, G.x0), b = Math.min(x + w, G.x1);
      if (b - a > 1) {
        const s = L.g0 * (K.EPS0 * E_REF) / S.sigmaBound;
        const rb = L.rc * 0.95;
        const R = chargeRows(a, b, s, 2);
        if (R.capped) info.capped = true;
        R.pts.forEach(function (p) {
          const dy = rb + 1.5 + p.row * rb * 1.5;
          if (h > 2 * (dy + rb)) {
            putCharge(p.x, yT + dy, -1, rb, true);
            putCharge(p.x, G.yBT - dy, +1, rb, true);
          }
        });
      }
    }

    // 外框與高光
    ctx.strokeStyle = alpha(shade(col, colors.dark ? 0.35 : -0.15), hov ? 0.95 : 0.6);
    ctx.lineWidth = hov ? 2 : 1;
    if (hov) { ctx.save(); ctx.shadowColor = alpha(colors.accent, 0.6); ctx.shadowBlur = 8; }
    ctx.beginPath();
    ctx.moveTo(x, yT + h); ctx.lineTo(x, yT); ctx.lineTo(x + ox, yT - oy); ctx.lineTo(x + w + ox, yT - oy);
    ctx.lineTo(x + w + ox, yT - oy + h); ctx.lineTo(x + w, yT + h); ctx.closePath();
    ctx.moveTo(x, yT); ctx.lineTo(x + w, yT); ctx.lineTo(x + w + ox, yT - oy);
    ctx.moveTo(x + w, yT); ctx.lineTo(x + w, yT + h);
    ctx.stroke();
    if (hov) ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,' + (colors.dark ? 0.25 : 0.6) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 1, yT + 1.5); ctx.lineTo(x + w - 1, yT + 1.5); ctx.stroke();
  }

  /** 極化分子：一端偏正（紅）、一端偏負（藍）的小膠囊；th = 0 時＋端朝下 */
  function drawDipole(x, y, th, len, wd, a) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(th);
    ctx.globalAlpha = a * (colors.dark ? 0.75 : 0.7);
    const g = ctx.createLinearGradient(0, -len / 2, 0, len / 2);
    g.addColorStop(0, colors.neg);
    g.addColorStop(0.5, mix(colors.neg, colors.pos, 0.5));
    g.addColorStop(1, colors.pos);
    ctx.fillStyle = g;
    roundRect(ctx, -wd / 2, -len / 2, wd, len, wd / 2);
    ctx.fill();
    ctx.restore();
  }

  /** 平板內側表面的自由電荷（sign = +1 上板、−1 下板）：空氣部分 σ = ε0E，介電質部分 κε0E */
  function drawPlateCharges(G, S, info, sign) {
    if (!(S.Q > 0)) return;
    const segs = [];
    const xd = G.slab ? Math.max(G.x0, Math.min(G.x1, G.xs0)) : G.x1;
    if (xd > G.x0) segs.push([G.x0, xd, S.sigmaAir]);
    if (G.slab && xd < G.x1) segs.push([xd, G.x1, S.sigmaDiel]);
    const sigRef = K.EPS0 * E_REF;
    const LX = lineXs(G, S);
    segs.forEach(function (sg) {
      const s = L.g0 * sigRef / sg[2];
      let pts;
      if (sg[2] === S.sigmaAir && !LX.capped && Math.abs(s - LX.g) < 1e-6) {
        // 空氣部分：電荷與電場線一一對應（每條電場線由一個正電荷出發、終止於一個負電荷）
        pts = LX.xs.filter(function (x) { return x >= sg[0] - 0.01 && x <= sg[1] + 0.01; }).map(function (x) { return { x: x, row: 0 }; });
      } else {
        const R = chargeRows(sg[0], sg[1], s, 3);
        if (R.capped) info.capped = true;
        pts = R.pts;
      }
      pts.forEach(function (p) {
        const dy = L.rc + 0.6 + p.row * L.rc * 1.25;
        putCharge(p.x, sign > 0 ? G.yTB - dy : G.yBT + dy, sign, L.rc, false);
      });
    });
  }

  function drawLabels(G) {
    const fs = L.narrow ? 11 : 12;
    // 板距 d 的標示
    const xm = G.x0 - 9;
    ctx.strokeStyle = alpha(colors.text, 0.6);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xm - 4, G.yTB + 0.5); ctx.lineTo(xm + 4, G.yTB + 0.5);
    ctx.moveTo(xm - 4, G.yBT - 0.5); ctx.lineTo(xm + 4, G.yBT - 0.5);
    ctx.moveTo(xm, G.yTB + 1); ctx.lineTo(xm, G.yBT - 1);
    ctx.stroke();
    if (G.gap > 14) {
      head(xm, G.yTB + 1, 0, -1, 5, alpha(colors.text, 0.6));
      head(xm, G.yBT - 1, 0, 1, 5, alpha(colors.text, 0.6));
    }
    const dTxt = num(state.d * 1000, 1) + ' mm';
    ctx.textAlign = 'right';
    const ym = (G.yTB + G.yBT) / 2;
    if (L.narrow) {
      pill('d', xm - 7, ym - 8, colors.text, fontPx(fs, '700'), 0.8);
      pill(dTxt, xm - 7, ym + 8, colors.text, fontPx(fs), 0.8);
    } else pill('d = ' + dTxt, xm - 7, ym, colors.text, fontPx(fs), 0.8);

    // 面積 A：放得下就畫在上板頂面，否則畫在頂面上方；與「+Q」標籤錯開
    const aTxt = 'A = ' + num(state.A * 1e4, 0) + ' cm²';
    ctx.font = fontPx(fs);
    const aw = ctx.measureText(aTxt).width + 10;
    ctx.font = fontPx(fs + 1, '700');
    const qw = ctx.measureText('+Q').width + 10;
    let qx = G.xa + G.ox * 0.5 - 7; // +Q 標籤的右緣（在上方導線左邊）
    const yAbove = G.yTT - G.oy - 11;
    let aBox;
    if (aw < G.Lp * 0.6 && G.oy > 13) {
      ctx.textAlign = 'center';
      aBox = pill(aTxt, G.x0 + G.ox * 0.5 + G.Lp * 0.66, G.yTT - G.oy * 0.5, colors.text, fontPx(fs), 0.6);
    } else {
      let ac = Math.max(G.x0 + G.Lp * 0.62 + G.ox * 0.6, G.xa + G.ox * 0.5 + 6 + aw / 2);
      ac = Math.min(cw - 6 - aw / 2, ac);
      if (ac - aw / 2 < G.xa + G.ox * 0.5 + 4) qx = Math.min(qx, ac - aw / 2 - 6);
      ctx.textAlign = 'center';
      aBox = pill(aTxt, ac, yAbove, colors.text, fontPx(fs), 0.8);
    }
    ctx.textAlign = 'right';
    pill('+Q', Math.max(qw + 2, qx), yAbove, colors.pos, fontPx(fs + 1, '700'), 0.8);
    pill('−Q', G.xa - 7, G.yBB + 12, colors.neg, fontPx(fs + 1, '700'), 0.8);

    // 介電質標籤：優先放在平板外的那段介電質上；放不下時放在介電質板頂面上方；最後才放在平板之間
    if (G.slab) {
      const m = material();
      const name = m ? T(m.zh, m.en) : T('介電質', 'dielectric');
      const txt = 'κ = ' + fmtK(state.kappa) + (L.narrow ? '' : T('（' + name + '）', ' (' + name + ')'));
      ctx.font = fontPx(fs, '700');
      const w2 = ctx.measureText(txt).width + 12;
      const outA = Math.max(G.xs0, G.x1 + 4), outB = Math.min(G.xs1, cw - 4);
      const yAboveSlab = G.yTB - G.oy - 10;
      let xx, yy;
      const xr = G.xs1 + G.ox + 6 + w2 / 2, aboveX = Math.max(G.x1 + G.ox + 4 + w2 / 2, Math.min(cw - 4 - w2 / 2, (Math.max(G.xs0, G.x1) + G.xs1) / 2 + G.ox * 0.5));
      const hitsA = aBox && aboveX - w2 / 2 < aBox.x + aBox.w + 4 && Math.abs(yAboveSlab - (aBox.y + aBox.h / 2)) < aBox.h + 2;
      if (outB - outA >= w2 + 4 && G.gap >= 18) { xx = (outA + outB) / 2; yy = G.yTB + G.gap / 2; }
      else if (xr + w2 / 2 <= cw - 4) { xx = xr; yy = G.yTB + G.gap / 2 - G.oy * 0.5; }
      else if (G.xs1 > G.x1 + 8 && G.x1 + G.ox + 4 + w2 <= cw - 4 && !hitsA) { xx = aboveX; yy = yAboveSlab; }
      else { xx = Math.max(G.xs0 + w2 / 2, Math.min(G.xs1 - w2 / 2, (G.xs0 + G.xs1) / 2)); yy = G.yTB + G.gap / 2; }
      ctx.textAlign = 'center';
      pill(txt, Math.min(cw - w2 / 2 - 4, xx), yy, shade(slabColor(), colors.dark ? 0.35 : -0.35), fontPx(fs, '700'), 0.82);
    }
  }
  function fmtK(k) { return Math.abs(k - Math.round(k)) < 1e-9 ? num(k, 0) : num(k, 2).replace(/0$/, ''); }

  /** 右下角：C、Q、V、E、U 的最終值與相對於前一狀態的變化（三角形箭頭＋倍率） */
  function drawOverlay(G, Q) {
    const rows = [
      ['C', si(Q.C, 'F'), 'C'], ['Q', si(Q.Q, 'C'), 'Q'], ['V', si(Q.V, 'V'), 'V'],
      ['E', si(Q.E, 'V/m'), 'E'], ['U', si(Q.U, 'J'), 'U']
    ];
    const font = fontPx(L.narrow ? 11.5 : 12.5);
    const fontB = fontPx(L.narrow ? 11.5 : 12.5, '700');
    ctx.font = font;
    let wv = 0;
    rows.forEach(function (r) { wv = Math.max(wv, ctx.measureText(r[1]).width); });
    ctx.font = fontB;
    const wl = ctx.measureText('W').width;
    ctx.font = fontPx(L.narrow ? 10.5 : 11.5, '700');
    const wr = ctx.measureText('×0.50').width;
    const boxL = G.xa + 14;
    let showRatio = true;
    let W = 10 + wl + 8 + wv + 10 + 10 + 4 + wr + 8;
    if (cw - 8 - W < boxL) { showRatio = false; W = 10 + wl + 8 + wv + 10 + 12; }
    const x = cw - 8 - W, y = L.yBT + L.pt + Math.max(10, (L.H - L.yBT - L.pt - L.ovH) / 2 - 2);
    ctx.fillStyle = alpha(colors['canvas-bg'], 0.82);
    roundRect(ctx, x, y, W, L.ovH, 8);
    ctx.fill();
    ctx.strokeStyle = alpha(colors.text, 0.12);
    ctx.lineWidth = 1;
    roundRect(ctx, x + 0.5, y + 0.5, W - 1, L.ovH - 1, 8);
    ctx.stroke();
    ctx.textBaseline = 'middle';
    rows.forEach(function (r, i) {
      const yy = y + 6 + L.lh * (i + 0.5);
      ctx.textAlign = 'left';
      ctx.font = fontB;
      ctx.fillStyle = colors.muted;
      ctx.fillText(r[0], x + 10, yy);
      ctx.font = font;
      ctx.fillStyle = colors.text;
      ctx.textAlign = 'right';
      const xv = x + 10 + wl + 8 + wv;
      ctx.fillText(r[1], xv, yy);
      // 變化箭頭
      const b = state.base, tr = b ? K.trend(b[r[2]], Q[r[2]], 1e-6) : null;
      const xa = xv + 12;
      if (tr === 'up' || tr === 'down') {
        const c = tr === 'up' ? colors.pos : colors.neg, s = 4.5;
        ctx.fillStyle = c;
        ctx.beginPath();
        if (tr === 'up') { ctx.moveTo(xa, yy - s); ctx.lineTo(xa + s, yy + s * 0.7); ctx.lineTo(xa - s, yy + s * 0.7); }
        else { ctx.moveTo(xa, yy + s); ctx.lineTo(xa + s, yy - s * 0.7); ctx.lineTo(xa - s, yy - s * 0.7); }
        ctx.closePath(); ctx.fill();
        if (showRatio) {
          ctx.textAlign = 'left';
          ctx.font = fontPx(L.narrow ? 10.5 : 11.5, '700');
          ctx.fillText(ratioText(Q[r[2]] / b[r[2]]), xa + 8, yy);
        }
      } else if (tr === 'same') {
        ctx.strokeStyle = colors.muted;
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(xa - 4, yy - 2); ctx.lineTo(xa + 4, yy - 2); ctx.moveTo(xa - 4, yy + 2); ctx.lineTo(xa + 4, yy + 2); ctx.stroke();
        if (showRatio) {
          ctx.textAlign = 'left';
          ctx.fillStyle = colors.muted;
          ctx.font = fontPx(L.narrow ? 10.5 : 11.5, '600');
          ctx.fillText(T('不變', 'same'), xa + 8, yy);
        }
      }
    });
  }

  /** 右上角：比例說明、充放電狀態、畫不下時的提示 */
  function drawNotes(G, info) {
    const f = fontPx(L.narrow ? 10.5 : 11.5);
    const fac = L.ky / L.kx;
    const facR = fac >= 10 ? Math.round(fac / 5) * 5 : Math.round(fac);
    let y = L.narrow ? 12 : 14;
    const step = L.lh + 2;
    ctx.textAlign = 'right';
    pill(T('示意圖：板距放大約 ' + facR + ' 倍', 'Not to scale: gap ×' + facR), cw - 8, y, colors.muted, f, 0.75);
    y += step;
    if (state.mode === 'V' && Math.abs(state.flowI) * TAU > Q_DOT * 0.2) {
      pill(state.flowI > 0 ? T('充電中：電子由上板流向下板', 'Charging: electrons flow from top plate to bottom plate')
        : T('放電中：電子流回上板', 'Discharging: electrons flow back to the top plate'), cw - 8, y, colors.neg, fontPx(L.narrow ? 10.5 : 11.5, '700'), 0.8);
      y += step;
    }
    if (info.capped) { pill(T('≈ 電荷太密，未全部畫出', '≈ charges too dense to draw them all'), cw - 8, y, colors.muted, f, 0.75); y += step; }
    if (info.linesCapped) { pill(T('≈ 電場線太密，未全部畫出', '≈ field lines too dense to draw them all'), cw - 8, y, colors.muted, f, 0.75); }
  }

  function drawEffects() {
    const tNow = performance.now();
    state.fx = state.fx.filter(function (e) { return tNow - e.t0 < e.dur; });
    state.fx.forEach(function (e) {
      const u = (tNow - e.t0) / e.dur;
      ctx.strokeStyle = alpha(colors.equi, 0.8 * (1 - u));
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(e.x, e.y, 4 + 14 * u, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = e.a0 + i * Math.PI / 3, r1 = 3 + 10 * u, r2 = r1 + 4;
        ctx.beginPath(); ctx.moveTo(e.x + Math.cos(a) * r1, e.y + Math.sin(a) * r1); ctx.lineTo(e.x + Math.cos(a) * r2, e.y + Math.sin(a) * r2); ctx.stroke();
      }
    });
  }

  // ---------- 讀數 ----------
  const lastText = {};
  function setHTML(id, html) {
    if (lastText[id] === html) return;
    lastText[id] = html;
    $(id).innerHTML = html;
  }
  function trendHTML(key, cur) {
    const b = state.base;
    if (!b || b[key] == null || cur == null) return '<span class="tr none">—</span>';
    const tr = K.trend(b[key], cur, 1e-6);
    if (tr === 'same') return '<span class="tr same">＝ ' + T('不變', 'same') + '</span>';
    const r = ratioText(cur / b[key]);
    return tr === 'up' ? '<span class="tr up">↑ ' + r + '</span>' : '<span class="tr down">↓ ' + r + '</span>';
  }
  function snapshot() {
    const s = eq();
    return { C: s.C, Q: s.Q, V: s.V, E: s.E, U: s.U, u: s.f < 1 ? s.uAir : s.uDiel, F: s.F,
      A: s.A, d: s.d, kappa: s.kappa, f: s.f, Vb: state.Vb, mode: state.mode, airOnly: s.airOnly };
  }
  /** 任務模式（missions.js）：回報這次改變後的狀態與改變前的狀態 */
  function emitChange() {
    if (!window.LabMission || !state.gesture) return;
    const s = eq();
    window.LabMission.emit('change', {
      key: state.gesture.key, mode: state.mode, A: s.A, d: s.d, Vb: state.Vb, kappa: s.kappa, f: s.f,
      C: s.C, Cair: K.cAir(s.A, s.d), Q: s.Q, V: s.V, E: s.E, U: s.U, F: s.F, airOnly: s.airOnly,
      base: state.base
    });
  }
  function updateReadout() {
    const s = eq();
    const supU = function (u) { return u.replace('m2', 'm<sup>2</sup>').replace('m3', 'm<sup>3</sup>'); };
    setHTML('rC', si(s.C, 'F') + trendHTML('C', s.C));
    setHTML('rQ', si(s.Q, 'C') + trendHTML('Q', s.Q));
    setHTML('rV', si(s.V, 'V') + trendHTML('V', s.V));
    setHTML('rE', si(s.E, 'V/m') + trendHTML('E', s.E));
    setHTML('rU', si(s.U, 'J') + trendHTML('U', s.U) + '<small>= QV/2 = Q<sup>2</sup>/2C</small>');
    const both = s.kappa > 1 && s.f > 0 && s.f < 1;
    const uMain = s.f < 1 || s.kappa === 1 ? s.uAir : s.uDiel;
    setHTML('ru', supU(si(uMain, 'J/m3')) + trendHTML('u', uMain) +
      (both ? '<small>' + T('空氣中', 'in air') + '</small><small>' + T('介電質中 ', 'in the dielectric ') + supU(si(s.uDiel, 'J/m3')) + '</small>'
        : s.kappa > 1 && s.f === 1 ? '<small>' + T('介電質中', 'in the dielectric') + '</small>' : ''));
    if (s.F != null) setHTML('rF', si(s.F, 'N') + trendHTML('F', s.F));
    else setHTML('rF', '—<small>' + T('只計算空氣間隙', 'air gap only') + '</small>');
    let sHTML = supU(si(s.sigmaAir, 'C/m2'));
    if (s.kappa > 1 && s.f > 0) {
      sHTML = (s.f < 1 ? sHTML + '<small>' + T('空氣部分', 'air part') + '</small>' : '') +
        '<small>' + T('介電質部分 ', 'dielectric part ') + supU(si(s.sigmaDiel, 'C/m2')) + '</small>' +
        '<small>' + T('束縛電荷 σ<sub>b</sub> ', 'bound σ<sub>b</sub> ') + supU(si(s.sigmaBound, 'C/m2')) + '</small>';
      if (s.f === 1) sHTML = '<small style="display:inline;color:inherit;font-size:inherit">' + supU(si(s.sigmaDiel, 'C/m2')) + '</small>' + sHTML.replace(/^<small>[^<]*<\/small>/, '');
    }
    setHTML('rS', sHTML);
    setHTML('modeLine', state.mode === 'V'
      ? T('目前：接上電池，<b>V 固定</b> = ', 'Now: battery connected, <b>V fixed</b> = ') + fmtV(state.Vb)
      : T('目前：已斷開，<b>Q 固定</b> = ', 'Now: disconnected, <b>Q fixed</b> = ') + si(state.Qfix, 'C'));
    $('boxV').classList.toggle('off', state.mode === 'Q');
  }

  // ---------- 改變的紀錄（前一狀態） ----------
  let holding = null; // 正在按住的滑桿
  const LABELS = {
    A: function () { return T('面積 A', 'area A'); },
    d: function () { return T('板距 d', 'separation d'); },
    Vb: function () { return T('電池電壓 V<sub>0</sub>', 'battery voltage V<sub>0</sub>'); },
    k: function () { return T('介電常數 κ', 'dielectric constant κ'); },
    f: function () { return T('插入比例', 'fraction inserted'); },
    mode: function () { return T('連接方式', 'connection'); }
  };
  function describe(key) {
    switch (key) {
      case 'A': return num(state.A * 1e4, 1).replace(/\.0$/, '') + ' cm²';
      case 'd': return num(state.d * 1000, 2).replace(/0$/, '') + ' mm';
      case 'Vb': return fmtV(state.Vb);
      case 'k': return fmtK(state.kappa);
      case 'f': return num(state.f * 100, 0) + '%';
      case 'mode': return state.mode === 'V' ? T('接上電池', 'battery connected') : T('斷開', 'disconnected');
    }
    return '';
  }
  /** 改變之前呼叫：同一個控制項連續的改變（按住拖曳、或間隔不到 0.9 秒）算作一次 */
  function beginChange(key, force) {
    const t = performance.now(), g = state.gesture;
    const dragging = state.drag && ((state.drag.what === 'plate' && key === 'd') || (state.drag.what === 'slab' && key === 'f'));
    if (force || key === 'mode' || !g || g.key !== key || !(holding === key || dragging || t - g.t < 900)) {
      state.base = snapshot();
      state.gesture = { key: key, t: t, from: describe(key) };
    }
    state.gesture.t = t;
  }
  function endChange() {
    const g = state.gesture;
    if (!g) return;
    const to = describe(g.key);
    const modeTxt = state.mode === 'V' ? T('（V 固定）', ' (V fixed)') : T('（Q 固定）', ' (Q fixed)');
    $('lastStep').innerHTML = g.from === to ? '' : // 只含程式產生的文字（V<sub>0</sub> 下標不可用 Unicode 下標字元）
      T('前一狀態 → 現在：', 'Previous → now: ') + LABELS[g.key]() + ' ' + g.from + ' → ' + to + (g.key === 'mode' ? '' : modeTxt);
  }

  // ---------- 音效（sound.js；音效關閉時完全不呼叫） ----------
  function sound() {
    const S = window.LabSound;
    return S && S.enabled() ? S : null;
  }
  let lastTickAt = 0;
  /** 每流過 Q_DOT 的電量一聲輕「嗒」：充電音高較高、放電較低（主要頻率都在 250 Hz 以上） */
  function tickSound(charging) {
    const S = sound(); if (!S) return false;
    S.tone({ freq: charging ? 1480 : 990, dur: 0.028, type: 'sine', gain: 0.2 });
    S.noise({ dur: 0.01, gain: 0.05, filter: 4200, q: 1.5 });
    return true;
  }
  /** 開關的「咔」聲：接上較亮、斷開較低 */
  function switchSound(closing) {
    const S = sound(); if (!S) return;
    S.noise({ dur: 0.03, gain: 0.5, filter: closing ? 3000 : 2000, q: 1.1 });
    S.tone({ freq: closing ? 880 : 520, dur: 0.06, type: 'triangle', gain: 0.3 });
  }

  // ---------- 動畫（只在電荷流動、拖曳或特效時執行） ----------
  let lastT = 0, loopOn = false;
  function busy() {
    const s = eq();
    const transient = state.mode === 'V' && Math.abs(state.q - s.Q) > Math.max(1e-6 * s.Q, Q_DOT * 0.01);
    return transient || Math.abs(state.flowI) > 0 || state.fx.length > 0;
  }
  function tick(tNow) {
    const dt = Math.min((tNow - lastT) / 1000, 1 / 30);
    lastT = tNow;
    const s = eq();
    if (state.mode === 'V') {
      const q0 = state.q;
      state.q = K.relax(q0, s.Q, dt, TAU);
      if (Math.abs(state.q - s.Q) <= Math.max(1e-6 * s.Q, Q_DOT * 0.01)) state.q = s.Q;
      const dq = state.q - q0;
      state.flowI = dt > 0 ? dq / dt : 0;
      // 電子點的速度與電流成正比（太快時限速，只是示意）
      const sp = L.narrow ? 13 : 16;
      const v = Math.max(-900, Math.min(900, state.flowI / Q_DOT * sp * 0.6));
      state.flowPhase += v * dt;
      state.acc += Math.abs(dq);
      if (state.acc >= Q_DOT && tNow - lastTickAt >= 55) {
        tickSound(dq > 0);
        lastTickAt = tNow;
        state.acc = Math.min(state.acc - Q_DOT, 4 * Q_DOT);
      }
      if (state.q === s.Q && Math.abs(dq) === 0) { state.flowI = 0; state.acc = 0; }
    } else { state.flowI = 0; }
    draw();
    if (busy()) requestAnimationFrame(tick); else { loopOn = false; draw(); }
  }
  function startLoop() {
    if (loopOn) return;
    loopOn = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }
  /** 參數改變後：接上電池時電荷以慢動作流動；斷開時 Q 不變 */
  function changed() {
    const s = eq();
    if (state.mode === 'Q') state.q = state.Qfix;
    else if (TAU === 0) state.q = s.Q;
    updateReadout();
    endChange();
    emitChange();
    if (busy()) startLoop();
    requestDraw();
  }

  function setStatus(msg) { $('status').innerHTML = msg || ''; } // 訊息都由程式產生；下標用 <sub>，不可用 Unicode 下標字元

  // ---------- 連接方式 ----------
  function setMode(m) {
    if (m === state.mode) return;
    beginChange('mode');
    if (m === 'Q') {
      state.Qfix = eq().Q;     // 斷開瞬間的電量（慢動作尚未結束時直接取平衡值）
      state.q = state.Qfix;
      state.flowI = 0;
      setStatus(T('開關斷開：電荷無處可去，Q 固定。改變 d、A 或 κ，看看 V、E、U 怎麼變。',
        'Switch open: the charge has nowhere to go, so Q is fixed. Change d, A or κ and watch V, E and U.'));
    } else {
      setStatus(T('開關接上：電池讓兩板間的電壓等於 V<sub>0</sub>，電荷流動直到 Q = CV<sub>0</sub>。',
        'Switch closed: the battery makes the voltage between the plates equal V<sub>0</sub>; charge flows until Q = CV<sub>0</sub>.'));
    }
    state.mode = m;
    switchSound(m === 'V');
    if (!reducedMotion) {
      const sw = switchGeo();
      state.fx.push({ x: sw.x, y: sw.yc, t0: performance.now(), dur: 320, a0: Math.random() });
    }
    $('modeV').setAttribute('aria-pressed', String(m === 'V'));
    $('modeQ').setAttribute('aria-pressed', String(m === 'Q'));
    changed();
  }
  $('modeV').addEventListener('click', function () { setMode('V'); });
  $('modeQ').addEventListener('click', function () { setMode('Q'); });

  // ---------- 滑桿 ----------
  const elA = $('A'), elD = $('d'), elV = $('Vb'), elK = $('k'), elF = $('f');
  // κ：對數刻度滑桿（1–100），位置 0–1000
  if (window.LabNum) {
    window.LabNum.register(elK, {
      toValue: function (p) { return Math.pow(10, 2 * p / 1000); },
      toPos: function (v) { return Math.round(500 * Math.log10(Math.max(1, v))); },
      min: 1, max: 100, decimals: 2
    });
  }
  function kVal() {
    if (window.LabNum) return window.LabNum.value(elK);
    return Math.pow(10, 2 * +elK.value / 1000);
  }
  function readSliders() {
    state.A = val(elA) * 1e-4;
    state.d = val(elD) * 1e-3;
    state.Vb = val(elV);
    let k = kVal();
    // 滑桿拖曳到預設值附近時對齊（例如 3.5、5、6、80）
    MATERIALS.forEach(function (m) { if (Math.abs(k - m.k) / m.k < 0.012) k = m.k; });
    if (Math.abs(k - Math.round(k * 100) / 100) > 0) k = Math.round(k * 100) / 100;
    state.kappa = Math.max(1, k);
    state.f = val(elF) / 100;
  }
  function refreshOutputs() {
    $('Ao').textContent = fmtSlider(state.A * 1e4, elA, 0) + ' cm²';
    $('do').textContent = fmtSlider(state.d * 1e3, elD, 1) + ' mm';
    $('Vbo').textContent = fmtSlider(state.Vb, elV, 1) + ' V';
    $('ko').textContent = fmtK(state.kappa);
    $('fo').textContent = fmtSlider(state.f * 100, elF, 0) + '%';
    const m = material();
    document.querySelectorAll('.presets button[data-k]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(!!m && Math.abs(+b.dataset.k - state.kappa) < 1e-9));
    });
    $('kCustom').setAttribute('aria-pressed', String(!m));
    $('boxF').classList.toggle('off', state.kappa === 1);
    $('fHint').textContent = state.kappa === 1
      ? T('目前兩板之間是空氣。選一種介電質，再拖曳介電質板或調整插入比例。', 'There is only air between the plates. Choose a dielectric, then drag the slab or change the fraction inserted.')
      : T('介電質板厚度等於板距；部分插入時，相當於「介電質部分」與「空氣部分」兩個電容器並聯。', 'The slab is as thick as the gap. Partly inserted, it acts as two capacitors in parallel (dielectric part and air part).');
  }
  const KEY = { A: 'A', d: 'd', Vb: 'Vb', k: 'k', f: 'f' };
  [elA, elD, elV, elK, elF].forEach(function (el) {
    el.addEventListener('input', function (ev) {
      // 打字輸入或預設按鈕（程式觸發、不是拖曳）一律算作新的一次改變
      beginChange(KEY[el.id], !ev.isTrusted && !state.drag);
      readSliders();
      refreshOutputs();
      if (el === elV && state.mode === 'Q') setStatus(T('開關已斷開，電池電壓不影響電容器；重新接上時才會充放電。', 'The switch is open, so the battery does not affect the capacitor until it is reconnected.'));
      changed();
    });
    el.addEventListener('pointerdown', function () { holding = KEY[el.id]; state.gesture = null; }); // 每次按下滑桿都是新的一次改變
  });
  window.addEventListener('pointerup', function () { holding = null; });
  window.addEventListener('pointercancel', function () { holding = null; });

  // 介電質預設按鈕
  document.querySelectorAll('.presets button[data-k]').forEach(function (b) {
    b.addEventListener('click', function () {
      const k = +b.dataset.k;
      if (window.LabNum) window.LabNum.set(elK, k); // 觸發 input → 記錄改變
      else { elK.value = Math.round(500 * Math.log10(k)); elK.dispatchEvent(new Event('input')); }
    });
  });

  // 重設
  $('reset').addEventListener('click', function () {
    const set = function (el, v) { if (window.LabNum) window.LabNum.clear(el); el.value = v; };
    set(elA, 100); set(elD, 2); set(elV, 10); set(elK, 0); set(elF, 100);
    state.mode = 'V';
    $('modeV').setAttribute('aria-pressed', 'true');
    $('modeQ').setAttribute('aria-pressed', 'false');
    readSliders();
    refreshOutputs();
    state.q = eq().Q;
    state.flowI = 0;
    state.base = null;
    state.gesture = null;
    $('lastStep').textContent = '';
    if (window.LabMission) window.LabMission.emit('reset', {});
    setStatus(T('已恢復預設值：接上 10 V 電池、A = 100 cm²、d = 2 mm、空氣。', 'Defaults restored: 10 V battery connected, A = 100 cm², d = 2 mm, air.'));
    updateReadout();
    requestDraw();
  });

  // 顯示選項
  [['showLines', 'lines'], ['showFringe', 'fringe'], ['showBound', 'bound'], ['showDip', 'dip'], ['showFlow', 'flow']].forEach(function (pair) {
    $(pair[0]).addEventListener('change', function (ev) { state.show[pair[1]] = ev.target.checked; requestDraw(); });
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
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
  });
  updateSoundButton();

  // ---------- 畫布上的拖曳：上板（板距）、介電質板（插入比例）、開關（連接方式） ----------
  function pointerPos(ev) {
    const r = cv.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }
  function inPoly(p, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > p.y) !== (b[1] > p.y) && p.x < (b[0] - a[0]) * (p.y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function boxPoly(x, yT, w, h, ox, oy, pad) {
    return [[x - pad, yT + h + pad], [x - pad, yT - pad], [x + ox - pad, yT - oy - pad], [x + w + ox + pad, yT - oy - pad],
      [x + w + ox + pad, yT - oy + h + pad], [x + w + pad, yT + h + pad]];
  }
  function hitTest(p) {
    if (!L) return null;
    const G = geo(), sw = switchGeo();
    const pad = L.narrow ? 6 : 4;
    if (Math.hypot(p.x - sw.x - 6, p.y - (sw.yc + sw.yp) / 2) < (sw.yp - sw.yc) * 0.75 + 6) return 'switch';
    if (inPoly(p, boxPoly(G.x0, G.yTT, G.Lp, L.pt, G.ox, G.oy, pad + 2))) return 'plate';
    if (G.slab && inPoly(p, boxPoly(G.xs0, G.yTB, G.Lp, G.gap, G.ox, G.oy, pad))) return 'slab';
    return null;
  }
  function setHover(h) {
    if (state.hover === h) return;
    state.hover = h;
    cv.style.cursor = h === 'plate' ? 'ns-resize' : h === 'slab' ? 'ew-resize' : h === 'switch' ? 'pointer' : 'default';
    requestDraw();
  }
  cv.addEventListener('pointermove', function (ev) {
    const p = pointerPos(ev);
    const D = state.drag;
    if (!D) { if (ev.pointerType !== 'touch') setHover(hitTest(p)); return; }
    if (D.what === 'plate') {
      const dmm = Math.max(1, Math.min(10, Math.round((L.yBT - (p.y + D.off)) / L.ky * 1000 * 10) / 10));
      if (Math.abs(dmm - val(elD)) > 1e-9) window.LabNum ? window.LabNum.set(elD, dmm) : (elD.value = dmm, elD.dispatchEvent(new Event('input')));
    } else if (D.what === 'slab') {
      const G = geo();
      const xs0 = p.x - D.off;
      const pct = Math.max(0, Math.min(100, Math.round((1 - (xs0 - G.x0) / G.Lp) * 100)));
      if (Math.abs(pct - val(elF)) > 1e-9) window.LabNum ? window.LabNum.set(elF, pct) : (elF.value = pct, elF.dispatchEvent(new Event('input')));
    }
  });
  cv.addEventListener('pointerdown', function (ev) {
    const p = pointerPos(ev), h = hitTest(p);
    if (!h) return;
    if (h === 'switch') { setMode(state.mode === 'V' ? 'Q' : 'V'); return; }
    ev.preventDefault();
    const G = geo();
    state.drag = { what: h, id: ev.pointerId, off: h === 'plate' ? G.yTB - p.y : p.x - G.xs0 };
    state.gesture = null; // 每次拖曳都是新的一次改變
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    setHover(h);
    requestDraw();
  });
  function endDrag() {
    if (!state.drag) return;
    state.drag = null;
    requestDraw();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (!state.drag) setHover(null); });
  // 觸控：按在上板或介電質板上時阻止頁面捲動，其他地方照常捲動
  cv.addEventListener('touchstart', function (ev) {
    const t = ev.touches[0];
    if (!t) return;
    const r = cv.getBoundingClientRect();
    const h = hitTest({ x: t.clientX - r.left, y: t.clientY - r.top });
    if (h === 'plate' || h === 'slab') ev.preventDefault();
  }, { passive: false });

  // ---------- 啟動 ----------
  readColors();
  readSliders();
  refreshOutputs();
  state.q = eq().Q;
  updateReadout();
  function themeChanged() {
    readColors();
    if (L) { L = layout(); buildBackground(); }
    refreshOutputs();
    updateReadout();
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
  } else window.addEventListener('resize', resize);
  window.addEventListener('resize', function () { resize(); });
  resize();
})();
