/* projectile.js — 「拋體運動」模組的畫面與互動（物理計算在 projectile-core.js） */
(function () {
  'use strict';
  const PC = window.ProjectileCore;
  const $ = function (id) { return document.getElementById(id); };
  // 介面文字：英文模式用第二個字串（settings.js）
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };

  const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 4, 8];
  const MAX_GHOSTS = 5;
  const GHOST_COLORS = ['neg', 'equi', 'pos', 'field', 'probe'];
  const MARGIN = { l: 44, r: 12, t: 12, b: 30 }; // 畫布邊距（CSS px），留給刻度數字

  const state = {
    v0: 20, theta: 45, h0: 0, g: 9.8, k: 0.01, drag: false,
    speed: 1,
    show: { pred: true, v: true, comp: true, dots: true },
    fly: null,         // { s, trail, running, launched, landed }
    ghosts: [],        // 已落地的軌跡
    launches: 0,
    status: ''
  };

  /** 目前的物理參數（關閉阻力時 k = 0） */
  function params() {
    return { v0: state.v0, theta: state.theta, h0: state.h0, g: state.g, k: state.drag ? state.k : 0 };
  }

  // ---------- 由參數算出的快取：預測軌跡、理想拋物線、最佳仰角 ----------
  let cache = null;
  let optKey = '', optCache = null;
  function compute() {
    const p = params();
    const pred = PC.predict(p);
    const ideal = state.drag ? PC.predict(Object.assign({}, p, { k: 0 })) : pred;
    const key = [p.v0, p.h0, p.g, p.k].join(',');
    if (key !== optKey) { optKey = key; optCache = PC.optimalAngle(p); }
    // 速度箭頭的比例：以無阻力落地速率（整段飛行中最大的速率）為基準
    const vref = Math.max(1, Math.sqrt(p.v0 * p.v0 + 2 * p.g * p.h0));
    cache = { p: p, pred: pred, ideal: ideal, opt: optCache, vref: vref };
  }

  function newFlight() {
    const p = params();
    state.fly = { s: PC.initialState(p), trail: [], running: false, launched: false, landed: false };
    state.fly.trail.push([state.fly.s.x, state.fly.s.y, 0]);
  }

  // ---------- 畫布 ----------
  const cv = $('cv');
  const main = cv.getContext('2d');
  let ctx = main; // 目前繪圖對象（畫靜態圖層時暫時換成離屏畫布）
  let dpr = 1, cw = 300, ch = 200;
  let view = null, viewLocked = false;

  let colors = {}, colorsVer = 0, dark = false;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--grid', '--accent', '--accent-soft',
      '--pos', '--neg', '--equi', '--field', '--probe', '--surface']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    const b = rgbOf(colors['canvas-bg']);
    dark = (0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2]) < 128;
    colorsVer++; // 顏色或字體大小改變：靜態圖層與小圖（sprite）要重畫
  }

  /** 由色彩代號產生半透明或調亮／調暗的顏色，不另外發明色相 */
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
  /** 兩個色彩代號之間內插（u = 0 → a，u = 1 → b） */
  function mix(a, b, u) {
    const p = rgbOf(a), q = rgbOf(b);
    return 'rgb(' + p.map(function (x, i) { return Math.round(x + (q[i] - x) * u); }).join(',') + ')';
  }
  function roundRect(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
  /** 線條對齊實體像素（寬 wPhys 個實體像素），避免糊掉 */
  function snap(v, wPhys) { return (Math.round(v * dpr) + (wPhys % 2 ? 0.5 : 0)) / dpr; }

  // 尊重「減少動態效果」：關掉純裝飾的落地揚塵與閃光
  const reduceMotionMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduceMotion() { return !!(reduceMotionMQ && reduceMotionMQ.matches); }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = cv.clientWidth;
    ch = cv.clientHeight || Math.round(cw * 2 / 3);
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    view = null;
    viewLocked = false;
    draw();
  }

  /** 1、2、5 × 10^n 的「好看」刻度間距 */
  function niceStep(raw) {
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  }

  /** 自動縮放：讓預測軌跡、理想拋物線、比較軌跡與目前軌跡都放得進畫面，x、y 等比例 */
  function computeView() {
    let xmax = 1, ymax = Math.max(1, state.h0);
    function scan(pts) {
      for (let i = 0; i < pts.length; i++) {
        if (pts[i][0] > xmax) xmax = pts[i][0];
        if (pts[i][1] > ymax) ymax = pts[i][1];
      }
    }
    scan(cache.pred.points);
    if (state.drag) scan(cache.ideal.points);
    state.ghosts.forEach(function (g) { scan(g.pts); });
    if (state.fly) scan(state.fly.trail);
    const plotW = cw - MARGIN.l - MARGIN.r, plotH = ch - MARGIN.t - MARGIN.b;
    const xlo = -0.05 * xmax;
    const scale = Math.min(plotW / (xmax * 1.1 - xlo), plotH / (ymax * 1.12));
    return {
      scale: scale,
      ox: MARGIN.l - xlo * scale,
      oy: ch - MARGIN.b,
      xlo: xlo,
      xhi: xlo + plotW / scale,
      yhi: plotH / scale,
      plotW: plotW,
      plotH: plotH
    };
  }

  function toPx(x, y) { return [view.ox + x * view.scale, view.oy - y * view.scale]; }

  // ---------- 繪圖 ----------
  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }

  const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

  /**
   * 向量箭頭：箭尖正好落在 (x1, y1)（長度 ∝ 速度，比例不變）。
   * 全頁一致的幾何：箭身寬 lw、箭頭長約 4 倍箭身寬、兩側略帶弧度；底下一圈背景色描邊讓箭頭浮在軌跡之上。
   */
  function arrow(x0, y0, x1, y1, color, width, label, lx, ly, sub) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    if (L < 2) return;
    const ux = dx / L, uy = dy / L;
    const head = Math.min(4 * width, L * 0.45), hw = Math.min(1.75 * width, head * 0.5);
    const bx = x1 - ux * head, by = y1 - uy * head;  // 箭頭底部中心
    const nx = -uy, ny = ux;                          // 法向量
    const headPath = function () {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(x1 - ux * head * 0.45 + nx * hw * 0.35, y1 - uy * head * 0.45 + ny * hw * 0.35, bx + nx * hw, by + ny * hw);
      ctx.lineTo(bx + ux * head * 0.22, by + uy * head * 0.22);
      ctx.lineTo(bx - nx * hw, by - ny * hw);
      ctx.quadraticCurveTo(x1 - ux * head * 0.45 - nx * hw * 0.35, y1 - uy * head * 0.45 - ny * hw * 0.35, x1, y1);
      ctx.closePath();
    };
    const sx = bx + ux * head * 0.3, sy = by + uy * head * 0.3; // 箭身終點（藏在箭頭裡）
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 背景色描邊（halo）
    ctx.strokeStyle = alpha(colors['canvas-bg'], 0.75);
    ctx.lineWidth = width + 3;
    if (L > head) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(sx, sy); ctx.stroke(); }
    headPath();
    ctx.lineWidth = 3;
    ctx.stroke();
    // 箭身與箭頭
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    if (L > head) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(sx, sy); ctx.stroke(); }
    headPath();
    ctx.fill();
    // 箭身上緣細高光，帶出一點圓柱感
    if (L > head + 3) {
      ctx.strokeStyle = alpha(shade(color, 0.55), dark ? 0.35 : 0.5);
      ctx.lineWidth = Math.max(0.8, width * 0.32);
      const o = width * 0.2;
      ctx.beginPath();
      ctx.moveTo(x0 + ux * width - nx * o * Math.sign(ny || 1), y0 + uy * width - ny * o * Math.sign(ny || 1));
      ctx.lineTo(bx - nx * o * Math.sign(ny || 1), by - ny * o * Math.sign(ny || 1));
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    if (label) {
      const px = lx === undefined ? x1 + ux * 11 : x1 + lx, py = ly === undefined ? y1 + uy * 11 : y1 + ly;
      vecLabel(label, sub, px, py, color);
    }
  }

  /** 向量名稱（例如 v、vₓ）：主字＋下標，置中於 (x, y)，背景色描邊 */
  function vecLabel(text, sub, x, y, color) {
    const fMain = 'italic 600 13px ' + FONT, fSub = '600 9.5px ' + FONT;
    ctx.font = fMain;
    const w1 = ctx.measureText(text).width;
    let w2 = 0;
    if (sub) { ctx.font = fSub; w2 = ctx.measureText(sub).width + 0.5; }
    const x0 = x - (w1 + w2) / 2;
    haloText(text, x0, y, color, 'left', 'middle', fMain);
    if (sub) haloText(sub, x0 + w1 + 0.5, y + 4, color, 'left', 'middle', fSub);
  }

  function haloText(text, x, y, color, align, base, font) {
    ctx.font = font || '12px ' + FONT;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = base || 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = alpha(colors['canvas-bg'], 0.92);
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  /** 文字高度（已含 settings.js 的字體縮放） */
  function textHeight(m, fallback) {
    return m.fontBoundingBoxAscent > 0 ? m.fontBoundingBoxAscent + m.fontBoundingBoxDescent : fallback;
  }

  /**
   * 圓角底框標籤（pill）：align 為 left/center/right，(x, yb) 是底框底邊的參考點。
   * 傳回底框範圍，方便避開。
   */
  function pill(text, x, yb, color, align, font) {
    ctx.font = font || '600 12px ' + FONT;
    const m = ctx.measureText(text), tw = m.width, th = textHeight(m, 15);
    const pw = tw + 12, ph = th + 3;
    const bx = align === 'center' ? x - pw / 2 : align === 'right' ? x - pw : x;
    const by = yb - ph;
    roundRect(bx, by, pw, ph, ph / 2);
    ctx.fillStyle = alpha(colors['canvas-bg'], dark ? 0.86 : 0.9);
    ctx.fill();
    ctx.strokeStyle = alpha(color, dark ? 0.45 : 0.35);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + pw / 2, by + ph / 2 + 0.5);
    return { x: bx, y: by, w: pw, h: ph };
  }

  function polyline(pts) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const q = toPx(pts[i][0], pts[i][1]);
      if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
    }
    ctx.stroke();
  }

  function fmtTick(v, step) {
    const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    return num(v, d);
  }

  // ---------- 靜態圖層（天空、地面、格線、座標軸、發射台）：只在畫面比例或顏色改變時重畫 ----------
  const bgCv = document.createElement('canvas');
  const bgCtx = bgCv.getContext('2d');
  let bgKey = '';

  function renderStatic() {
    const key = [cw, ch, dpr, view.scale, view.ox, view.oy, view.xlo, state.h0, colorsVer].join('|');
    if (key === bgKey) return;
    bgKey = key;
    bgCv.width = cv.width;
    bgCv.height = cv.height;
    ctx = bgCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackdrop();
    drawAxes();
    drawPlatform();
    ctx = main;
  }

  function drawBackdrop() {
    const oy = view.oy;
    ctx.fillStyle = colors['canvas-bg'];
    ctx.fillRect(0, 0, cw, ch);
    // 天空：上方極淡的藍色調，往地平線漸淡
    let g = ctx.createLinearGradient(0, 0, 0, oy);
    g.addColorStop(0, alpha(colors.neg, dark ? 0.085 : 0.06));
    g.addColorStop(0.7, alpha(colors.neg, dark ? 0.02 : 0.012));
    g.addColorStop(1, alpha(colors.neg, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, oy);
    // 地平線附近一層淡淡的霧氣（亮）
    g = ctx.createLinearGradient(0, oy - Math.min(60, view.plotH * 0.25), 0, oy);
    g.addColorStop(0, alpha(colors.surface, 0));
    g.addColorStop(1, alpha(colors.surface, dark ? 0.04 : 0.55));
    ctx.fillStyle = g;
    ctx.fillRect(0, oy - Math.min(60, view.plotH * 0.25), cw, Math.min(60, view.plotH * 0.25));
    // 地面：泥土色調（--equi），越深越淡
    g = ctx.createLinearGradient(0, oy, 0, ch);
    g.addColorStop(0, alpha(colors.equi, dark ? 0.1 : 0.13));
    g.addColorStop(1, alpha(colors.equi, dark ? 0.03 : 0.04));
    ctx.fillStyle = g;
    ctx.fillRect(0, oy, cw, ch - oy);
    // 地面下緣的陰影，讓地表有厚度
    g = ctx.createLinearGradient(0, oy, 0, oy + 8);
    g.addColorStop(0, alpha(dark ? '#000000' : colors.text, dark ? 0.35 : 0.1));
    g.addColorStop(1, alpha(dark ? '#000000' : colors.text, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, oy, cw, 8);
    // 暈影：中心亮、四角略暗
    g = ctx.createRadialGradient(cw * 0.5, ch * 0.42, Math.min(cw, ch) * 0.25, cw * 0.5, ch * 0.5, Math.hypot(cw, ch) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, dark ? 'rgba(0,0,0,0.22)' : alpha(colors.text, 0.05));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
  }

  function drawAxes() {
    const step = niceStep(56 / view.scale);
    const top = MARGIN.t, right = cw - MARGIN.r;
    const minor = step / (Math.abs(step / Math.pow(10, Math.floor(Math.log10(step) + 1e-9)) - 2) < 1e-9 ? 4 : 5);
    // 次格線（極淡）
    if (minor * view.scale >= 6) {
      ctx.strokeStyle = colors.grid;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1 / dpr;
      ctx.beginPath();
      for (let i = Math.ceil(view.xlo / minor); i * minor <= view.xhi + 1e-9; i++) {
        if (Math.abs(i * minor / step - Math.round(i * minor / step)) < 1e-6) continue;
        const px = snap(view.ox + i * minor * view.scale, 1);
        ctx.moveTo(px, top); ctx.lineTo(px, view.oy);
      }
      for (let j = 1; j * minor <= view.yhi + 1e-9; j++) {
        if (Math.abs(j * minor / step - Math.round(j * minor / step)) < 1e-6) continue;
        const py = snap(view.oy - j * minor * view.scale, 1);
        ctx.moveTo(MARGIN.l, py); ctx.lineTo(right, py);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 主格線
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.grid;
    ctx.globalAlpha = dark ? 1.25 : 1.4;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (let i = Math.ceil(view.xlo / step); i * step <= view.xhi + 1e-9; i++) {
      if (i === 0) continue;
      const px = snap(view.ox + i * step * view.scale, dpr);
      ctx.moveTo(px, top); ctx.lineTo(px, view.oy);
    }
    for (let j = 1; j * step <= view.yhi + 1e-9; j++) {
      const py = snap(view.oy - j * step * view.scale, dpr);
      ctx.moveTo(MARGIN.l, py); ctx.lineTo(right, py);
    }
    ctx.stroke();

    // y 軸（發射點正下方）
    ctx.strokeStyle = alpha(colors.muted, 0.8);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const yx = snap(view.ox, dpr);
    ctx.moveTo(yx, top); ctx.lineTo(yx, view.oy);
    ctx.stroke();
    // 刻度短線
    ctx.strokeStyle = alpha(colors.muted, 0.7);
    ctx.beginPath();
    for (let i = Math.ceil(view.xlo / step); i * step <= view.xhi + 1e-9; i++) {
      const px = snap(view.ox + i * step * view.scale, dpr);
      ctx.moveTo(px, view.oy); ctx.lineTo(px, view.oy + 4);
    }
    for (let j = 1; j * step <= view.yhi + 1e-9; j++) {
      const py = snap(view.oy - j * step * view.scale, dpr);
      ctx.moveTo(yx - 4, py); ctx.lineTo(yx, py);
    }
    ctx.stroke();
    // 地面：雙層線條（深色地表＋上緣細高光）
    ctx.lineCap = 'round';
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(MARGIN.l, view.oy); ctx.lineTo(right, view.oy);
    ctx.stroke();
    ctx.strokeStyle = alpha(colors.surface, dark ? 0.12 : 0.55);
    ctx.lineWidth = 1 / dpr;
    ctx.beginPath();
    ctx.moveTo(MARGIN.l + 1, view.oy - 1.5); ctx.lineTo(right - 1, view.oy - 1.5);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // 刻度數字
    ctx.fillStyle = colors.muted;
    ctx.font = '11px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = Math.ceil(view.xlo / step); i * step <= view.xhi + 1e-9; i++) {
      const px = view.ox + i * step * view.scale;
      if (px > right - 36) continue; // 留位置給軸名稱
      ctx.fillText(fmtTick(i * step, step), px, view.oy + 6);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const fsk = 1 + ((window.LabSettings && +window.LabSettings.get('fs')) || 1) * 0.7 - 0.7; // settings.js 的畫布字體倍率
    const clearTop = top + 14 * (fsk > 1 ? fsk * 1.15 : 1); // 不和「y (m)」重疊（字體放大時也一樣）
    for (let j = 0; j * step <= view.yhi + 1e-9; j++) {
      const py = view.oy - j * step * view.scale;
      if (py < clearTop) continue;
      ctx.fillText(fmtTick(j * step, step), MARGIN.l - 6, py);
    }
    ctx.font = '600 12px ' + FONT;
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('x (m)', right, view.oy + 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('y (m)', MARGIN.l - 6, top - 2);
  }

  /** 發射台：位置與尺寸照舊（右上角就是發射點），加上石材漸層、頂蓋、斜角高光與接地陰影 */
  function drawPlatform() {
    if (state.h0 <= 0) return;
    const a = toPx(0, state.h0), w = Math.min(16, Math.max(6, a[0] - MARGIN.l));
    const x = a[0] - w, y = a[1], h = view.oy - a[1];
    const stone = mix(colors.border, colors.muted, dark ? 0.32 : 0.28);
    // 接地陰影
    let g = ctx.createRadialGradient(x + w / 2, view.oy, 0, x + w / 2, view.oy, w * 1.2);
    g.addColorStop(0, alpha(dark ? '#000000' : colors.text, dark ? 0.45 : 0.22));
    g.addColorStop(1, alpha(dark ? '#000000' : colors.text, 0));
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(0, view.oy);
    ctx.scale(1, 0.3);
    ctx.beginPath(); ctx.arc(x + w / 2, 0, w * 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 塔身：左亮右暗的橫向漸層（光從左上方來）
    g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, shade(stone, dark ? 0.16 : 0.32));
    g.addColorStop(0.45, stone);
    g.addColorStop(1, shade(stone, dark ? -0.3 : -0.16));
    ctx.fillStyle = g;
    roundRect(x, y, w, h, Math.min(2, h / 2));
    ctx.fill();
    // 石塊接縫
    if (h > 10) {
      ctx.save();
      roundRect(x, y, w, h, Math.min(2, h / 2));
      ctx.clip();
      ctx.strokeStyle = alpha(dark ? '#000000' : colors.text, dark ? 0.28 : 0.1);
      ctx.lineWidth = 1 / dpr;
      ctx.beginPath();
      const row = 9;
      for (let k = 1, yy = y + 4 + row; yy < view.oy - 1; k++, yy += row) {
        ctx.moveTo(x, snap(yy, 1)); ctx.lineTo(x + w, snap(yy, 1));
        const jx = snap(x + w * (k % 2 ? 0.5 : 0.25), 1);
        ctx.moveTo(jx, yy); ctx.lineTo(jx, Math.min(yy + row, view.oy));
      }
      ctx.stroke();
      ctx.restore();
    }
    // 外框、左緣高光
    ctx.strokeStyle = alpha(dark ? '#000000' : colors.text, dark ? 0.55 : 0.3);
    ctx.lineWidth = 1;
    roundRect(x + 0.5, y + 0.5, w - 1, h - 1, Math.min(2, h / 2));
    ctx.stroke();
    ctx.strokeStyle = alpha(colors.surface, dark ? 0.12 : 0.6);
    ctx.lineWidth = 1 / dpr;
    ctx.beginPath(); ctx.moveTo(x + 1.5, y + 4); ctx.lineTo(x + 1.5, view.oy - 1); ctx.stroke();
    // 頂蓋：較亮的石板（不超出發射點右側）
    const capH = Math.min(4, h);
    g = ctx.createLinearGradient(0, y, 0, y + capH);
    g.addColorStop(0, shade(stone, dark ? 0.3 : 0.5));
    g.addColorStop(1, shade(stone, dark ? 0.02 : 0.1));
    ctx.fillStyle = g;
    roundRect(x - 1.5, y, w + 1.5, capH, 1.5);
    ctx.fill();
    ctx.strokeStyle = alpha(dark ? '#000000' : colors.text, dark ? 0.5 : 0.28);
    ctx.lineWidth = 1 / dpr;
    ctx.beginPath(); ctx.moveTo(x - 1.5, y + capH); ctx.lineTo(x + w, y + capH); ctx.stroke();
  }

  // ---------- 小圖（sprite）：球的陰影與光暈預先畫好，每幀只貼圖 ----------
  const BALL_R = 7;
  let ballSprite = null, ballKey = '';
  function getBallSprite() {
    const key = dpr + '|' + colorsVer;
    if (ballSprite && key === ballKey) return ballSprite;
    ballKey = key;
    const pad = 12, S = (BALL_R + pad) * 2;
    const c = document.createElement('canvas');
    c.width = Math.round(S * dpr); c.height = Math.round(S * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const cx = S / 2, cy = S / 2, r = BALL_R, acc = colors.accent;
    // 深色模式：淡淡的光暈
    if (dark) {
      const gl = g.createRadialGradient(cx, cy, r * 0.6, cx, cy, r + pad);
      gl.addColorStop(0, alpha(acc, 0.32));
      gl.addColorStop(1, alpha(acc, 0));
      g.fillStyle = gl;
      g.beginPath(); g.arc(cx, cy, r + pad, 0, Math.PI * 2); g.fill();
    }
    // 投影
    g.save();
    g.shadowColor = dark ? 'rgba(0,0,0,0.55)' : alpha(colors.text, 0.32);
    g.shadowBlur = 6;
    g.shadowOffsetY = 2;
    g.fillStyle = acc;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.restore();
    // 球體：亮點在左上方
    const gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.38, r * 0.08, cx, cy, r);
    gr.addColorStop(0, shade(acc, 0.72));
    gr.addColorStop(0.35, shade(acc, 0.18));
    gr.addColorStop(0.8, acc);
    gr.addColorStop(1, shade(acc, -0.38));
    g.fillStyle = gr;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    // 右下的反光（rim light）
    g.strokeStyle = alpha(shade(acc, 0.6), 0.55);
    g.lineWidth = 0.9;
    g.beginPath(); g.arc(cx, cy, r - 1.1, Math.PI * 0.05, Math.PI * 0.7); g.stroke();
    // 細外框（與軌跡分開）
    g.strokeStyle = alpha(colors.surface, dark ? 0.55 : 0.9);
    g.lineWidth = 1.2;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    ballSprite = { cv: c, size: S };
    return ballSprite;
  }

  /** 地面上的接觸陰影：離地越高越淡、越大（純裝飾，不影響位置） */
  function drawContactShadow(px, surfaceY, heightPx) {
    const u = clamp01(heightPx / Math.max(40, view.plotH * 0.75));
    const a = (dark ? 0.5 : 0.26) * (1 - 0.85 * u);
    const rx = BALL_R * (1.05 + 1.4 * u), ry = 2.4 + 1.6 * u;
    if (a < 0.01) return;
    ctx.save();
    ctx.translate(px, surfaceY);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, alpha(dark ? '#000000' : colors.text, a));
    g.addColorStop(1, alpha(dark ? '#000000' : colors.text, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /** 比較軌跡的編號徽章：帶立體漸層的小圓 */
  function badge(x, y, col, n) {
    ctx.fillStyle = alpha(dark ? '#000000' : colors.text, dark ? 0.4 : 0.18);
    ctx.beginPath(); ctx.arc(x, y + 1.3, 8.4, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(x - 2.8, y - 3, 0.6, x, y, 8);
    g.addColorStop(0, shade(col, 0.42));
    g.addColorStop(0.55, col);
    g.addColorStop(1, shade(col, -0.25));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = alpha(colors.surface, dark ? 0.35 : 0.85);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = colors.surface;
    ctx.font = '700 11px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), x, y + 0.5);
  }

  function drawGhosts() {
    const placed = [];
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    state.ghosts.forEach(function (g) {
      const col = colors[GHOST_COLORS[g.color]];
      // 底層較粗較淡、上層細線：柔和的「管狀」軌跡
      ctx.strokeStyle = alpha(col, dark ? 0.14 : 0.1);
      ctx.lineWidth = 6;
      polyline(g.pts);
      ctx.strokeStyle = alpha(col, dark ? 0.6 : 0.55);
      ctx.lineWidth = 2;
      polyline(g.pts);
      // 落點的小圓點
      const e = toPx(g.pts[g.pts.length - 1][0], g.pts[g.pts.length - 1][1]);
      ctx.fillStyle = alpha(col, 0.7);
      ctx.beginPath(); ctx.arc(e[0], e[1], 2.6, 0, Math.PI * 2); ctx.fill();
    });
    state.ghosts.forEach(function (g) {
      const col = colors[GHOST_COLORS[g.color]];
      // 編號標在該軌跡的最高點（互補角射程相同但最高點不同，才不會疊在一起）；
      // 水平或向下發射時最高點就是發射點，改標在落地點
      let top = g.pts[0];
      g.pts.forEach(function (pt) { if (pt[1] > top[1]) top = pt; });
      const atLanding = top === g.pts[0];
      if (atLanding) top = g.pts[g.pts.length - 1];
      const q = toPx(top[0], top[1]);
      if (atLanding) q[1] -= 11;
      while (placed.some(function (o) { return Math.hypot(o[0] - q[0], o[1] - q[1]) < 17; })) q[0] += 18;
      placed.push(q);
      badge(q[0], q[1], col, g.n);
    });
    ctx.lineCap = 'butt';
  }

  function drawPrediction() {
    if (!state.show.pred) return;
    const pr = cache.pred;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (state.drag) {
      ctx.strokeStyle = colors.muted;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 6]);
      polyline(cache.ideal.points);
    }
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4.5, 6.5]);
    ctx.globalAlpha = 0.8;
    polyline(pr.points);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // 最高點：到地面的細虛線（標出 H）＋圓環標記＋圓角標籤
    if (pr.tApex > 0) {
      const xa = interpX(pr.points, pr.tApex);
      const q = toPx(xa, pr.H);
      ctx.strokeStyle = alpha(colors.accent, 0.3);
      ctx.lineWidth = 1;
      ctx.setLineDash([1.5, 4]);
      ctx.beginPath(); ctx.moveTo(q[0], q[1] + 5); ctx.lineTo(q[0], view.oy - 1); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = colors['canvas-bg'];
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(q[0], q[1], 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = colors.accent;
      ctx.beginPath(); ctx.arc(q[0], q[1], 1.5, 0, Math.PI * 2); ctx.fill();
      pill('H = ' + num(pr.H, 2) + ' m', q[0], q[1] - 8, colors.accent, 'center');
    }
    // 落地點：地面上的小三角旗標＋圓角標籤
    if (pr.R > 0) {
      const q = toPx(pr.R, 0);
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(q[0], q[1] - 7); ctx.lineTo(q[0], q[1] + 4); ctx.stroke();
      ctx.fillStyle = colors.accent;
      ctx.beginPath();
      ctx.moveTo(q[0] - 4, q[1] - 11); ctx.lineTo(q[0] + 4, q[1] - 11); ctx.lineTo(q[0], q[1] - 6.5);
      ctx.closePath(); ctx.fill();
      const right = q[0] > cw - 90;
      pill('R = ' + num(pr.R, 2) + ' m', q[0] + (right ? -7 : 7), q[1] - 5, colors.accent, right ? 'right' : 'left');
    }
    ctx.lineCap = 'butt';
  }

  function drawAngle() {
    const a = toPx(0, state.h0), r = 30, th = state.theta * Math.PI / 180;
    // 扇形淡色填滿
    if (th > 0) {
      const g = ctx.createRadialGradient(a[0], a[1], 0, a[0], a[1], r);
      g.addColorStop(0, alpha(colors.accent, 0));
      g.addColorStop(1, alpha(colors.accent, dark ? 0.16 : 0.1));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.arc(a[0], a[1], r, -th, 0); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]); ctx.lineTo(a[0] + r + 12, a[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(a[0], a[1], r, -th, 0);
    ctx.stroke();
    ctx.lineCap = 'butt';
    const mid = th / 2;
    haloText(fmtVal(state.theta, 1, 0) + '°', a[0] + (r + 14) * Math.cos(mid), a[1] - (r + 10) * Math.sin(mid) + 4, colors.muted, 'left', 'middle', '12px ' + FONT);
  }

  /** 發射器：沿仰角方向的短砲管＋轉軸（拖曳瞄準時加光暈） */
  function drawLauncher() {
    const a = toPx(0, state.h0), th = state.theta * Math.PI / 180;
    const len = 17, ex = a[0] + len * Math.cos(th), ey = a[1] - len * Math.sin(th);
    const metal = mix(colors.muted, colors.text, 0.25);
    if (aiming) {
      const g = ctx.createRadialGradient(a[0], a[1], 4, a[0], a[1], 26);
      g.addColorStop(0, alpha(colors.accent, 0.3));
      g.addColorStop(1, alpha(colors.accent, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(a[0], a[1], 26, 0, Math.PI * 2); ctx.fill();
    }
    ctx.lineCap = 'round';
    ctx.strokeStyle = shade(metal, dark ? -0.35 : -0.15);
    ctx.lineWidth = 6.5;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = shade(metal, dark ? 0.2 : 0.55);
    ctx.lineWidth = 2;
    const ox = -Math.sin(th) * 1.4, oy = -Math.cos(th) * 1.4; // 往左上方偏移的高光
    ctx.beginPath(); ctx.moveTo(a[0] + ox, a[1] + oy); ctx.lineTo(ex + ox, ey + oy); ctx.stroke();
    ctx.lineCap = 'butt';
    const g = ctx.createRadialGradient(a[0] - 1.5, a[1] - 1.5, 0.5, a[0], a[1], 5);
    g.addColorStop(0, shade(metal, 0.5));
    g.addColorStop(1, shade(metal, -0.2));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(a[0], a[1], 4.5, 0, Math.PI * 2); ctx.fill();
  }

  /** 等時距標記的時間間隔（秒）；沒有飛行時傳回 0 */
  function markerStep() {
    const Tf = cache.pred.T;
    return Tf > 0 ? niceStep(Tf / 12) : 0;
  }

  function interpX(pts, t) {
    for (let i = 1; i < pts.length; i++) {
      if (pts[i][2] >= t) {
        const a = pts[i - 1], b = pts[i], f = b[2] > a[2] ? (t - a[2]) / (b[2] - a[2]) : 0;
        return a[0] + (b[0] - a[0]) * f;
      }
    }
    return pts[pts.length - 1][0];
  }

  /** 目前軌跡：完整路徑（管狀雙層線）＋靠近球的一段漸亮、漸粗的拖尾光 */
  function drawTrail(tr, tNow) {
    if (tr.length < 2) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 拖尾光：最近一段時間內，越新越亮、越粗（平頭端點，避免重疊處變深）
    ctx.lineCap = 'butt';
    const tw = Math.max(0.12, 0.16 * (cache.pred.T || 1));
    let i0 = tr.length - 1;
    while (i0 > 0 && tr[i0 - 1][2] >= tNow - tw) i0--;
    let prev = toPx(tr[Math.max(0, i0 - 1)][0], tr[Math.max(0, i0 - 1)][1]);
    for (let i = Math.max(1, i0); i < tr.length; i++) {
      const q = toPx(tr[i][0], tr[i][1]);
      const u = clamp01(1 - (tNow - tr[i][2]) / tw);
      ctx.strokeStyle = alpha(colors.accent, (dark ? 0.26 : 0.16) * u);
      ctx.lineWidth = 3 + 4.5 * u;
      ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      prev = q;
    }
    // 主線
    ctx.lineCap = 'round';
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2.5;
    polyline(tr);
    // 上緣細高光
    ctx.strokeStyle = alpha(shade(colors.accent, 0.6), dark ? 0.35 : 0.45);
    ctx.lineWidth = 0.8;
    ctx.save();
    ctx.translate(0, -0.55);
    polyline(tr);
    ctx.restore();
    ctx.lineCap = 'butt';
  }

  /** 等時距標記：白色小珠子（陰影＋外環＋中心點） */
  function dot(x, y) {
    ctx.fillStyle = alpha(dark ? '#000000' : colors.text, dark ? 0.35 : 0.14);
    ctx.beginPath(); ctx.arc(x, y + 1, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = colors.surface;
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = alpha(colors.accent, 0.6);
    ctx.beginPath(); ctx.arc(x, y, 1.25, 0, Math.PI * 2); ctx.fill();
  }

  // ---------- 落地揚塵（純裝飾，0.45 s 淡出；減少動態效果時不顯示） ----------
  let puff = null, puffRaf = 0;
  const PUFF_MS = 450;
  const DUST = [[-0.95, 0.3], [-0.7, 0.75], [-0.3, 1], [0.35, 1], [0.75, 0.7], [1, 0.25]]; // 固定方向，每次一樣
  function startPuff(x, v) {
    if (reduceMotion()) return;
    puff = { x: x, t0: performance.now(), k: 0.7 + 0.6 * clamp01(Math.log10(1 + v) / Math.log10(1 + 60)) };
    cancelAnimationFrame(puffRaf);
    const loop = function () {
      if (!puff) return;
      if (!state.fly.running) draw(); // 飛行中由主迴圈負責重畫
      if (puff && performance.now() - puff.t0 < PUFF_MS) puffRaf = requestAnimationFrame(loop);
      else { puff = null; if (!state.fly.running) draw(); }
    };
    puffRaf = requestAnimationFrame(loop);
  }
  function drawPuff() {
    if (!puff) return;
    const u = (performance.now() - puff.t0) / PUFF_MS;
    if (u < 0 || u >= 1) return;
    const e = 1 - Math.pow(1 - u, 3), fade = 1 - u, k = puff.k;
    const q = toPx(puff.x, 0);
    // 閃光
    const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], 20 * k);
    g.addColorStop(0, alpha(dark ? colors.text : colors.surface, 0.7 * fade * fade));
    g.addColorStop(0.4, alpha(colors.accent, 0.28 * fade));
    g.addColorStop(1, alpha(colors.accent, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(q[0], q[1], 20 * k, 0, Math.PI * 2); ctx.fill();
    // 擴散的地面波紋（扁橢圓）
    ctx.save();
    ctx.translate(q[0], q[1]);
    ctx.scale(1, 0.28);
    ctx.strokeStyle = alpha(colors.accent, 0.55 * fade);
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, (6 + 28 * e) * k, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    // 塵土顆粒
    const dust = mix(colors.equi, colors.muted, 0.4);
    ctx.fillStyle = alpha(dust, 0.75 * fade);
    DUST.forEach(function (d, i) {
      const dist = (10 + 18 * e) * k * (0.8 + 0.1 * (i % 3));
      const px = q[0] + d[0] * dist, py = q[1] - d[1] * dist * 0.6 + 10 * u * u;
      if (py > q[1]) return;
      ctx.beginPath(); ctx.arc(px, py, 2.3 - 1 * u, 0, Math.PI * 2); ctx.fill();
    });
  }

  /** 右上角的時間資訊卡（t 與標記間隔） */
  function drawClock(showDt, dt) {
    const right = cw - MARGIN.r - 4, top = MARGIN.t + 2;
    const f1 = '600 13px ' + FONT, f2 = '12px ' + FONT;
    const s1 = 't = ' + num(state.fly.s.t, 2) + ' s';
    const s2 = showDt ? T('標記間隔 ', 'Marker interval ') + num(dt, dt < 0.1 ? 2 : dt < 1 ? 1 : 0) + ' s' : '';
    ctx.font = f1;
    const m1 = ctx.measureText(s1), h1 = textHeight(m1, 16);
    let w = m1.width, h2 = 0;
    if (s2) { ctx.font = f2; const m2 = ctx.measureText(s2); w = Math.max(w, m2.width); h2 = textHeight(m2, 15); }
    const pw = w + 16, ph = h1 + (s2 ? h2 + 2 : 0) + 8;
    const bx = right - pw + 6, by = top - 1;
    ctx.fillStyle = alpha(dark ? '#000000' : colors.text, dark ? 0.25 : 0.06);
    roundRect(bx, by + 1.5, pw, ph, 8); ctx.fill();
    roundRect(bx, by, pw, ph, 8);
    ctx.fillStyle = alpha(colors.surface, dark ? 0.78 : 0.86);
    ctx.fill();
    ctx.strokeStyle = alpha(colors.border, dark ? 0.9 : 1);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = f1;
    ctx.fillStyle = colors.text;
    ctx.fillText(s1, bx + pw - 8, by + 4);
    if (s2) {
      ctx.font = f2;
      ctx.fillStyle = colors.muted;
      ctx.fillText(s2, bx + pw - 8, by + 6 + h1);
    }
  }

  function drawFlight() {
    const f = state.fly, s = f.s;
    drawTrail(f.trail, s.t);
    // 等時距標記：相鄰兩點相隔相同時間
    let dtShown = 0;
    if (state.show.dots && f.trail.length > 1) {
      const dt = markerStep();
      if (dt > 0) {
        dtShown = dt;
        let m = 1;
        const tr = f.trail;
        for (let i = 1; i < tr.length; i++) {
          while (m * dt <= tr[i][2] + 1e-9) {
            const a = tr[i - 1], b = tr[i], u = b[2] > a[2] ? (m * dt - a[2]) / (b[2] - a[2]) : 1;
            const q = toPx(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u);
            dot(q[0], q[1]);
            m++;
          }
        }
      }
    }

    // 速度向量與分量
    const q = toPx(s.x, s.y);
    const k = 0.2 * Math.min(view.plotW, view.plotH) / cache.vref; // px per (m/s)
    if (state.show.comp) {
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = alpha(colors.muted, 0.85);
      ctx.lineWidth = 1;
      if (state.show.v) {
        ctx.beginPath();
        ctx.moveTo(q[0] + s.vx * k, q[1]); ctx.lineTo(q[0] + s.vx * k, q[1] - s.vy * k);
        ctx.moveTo(q[0], q[1] - s.vy * k); ctx.lineTo(q[0] + s.vx * k, q[1] - s.vy * k);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // 分量的標籤放在箭頭旁邊（vx 在下方、vy 在左方），避免和 v 的標籤重疊
      arrow(q[0], q[1], q[0] + s.vx * k, q[1], colors.neg, 2.5, 'v', -8, 12, 'x');
      arrow(q[0], q[1], q[0], q[1] - s.vy * k, colors.equi, 2.5, 'v', -14, s.vy > 0 ? 6 : -6, 'y');
    }
    if (state.show.v) arrow(q[0], q[1], q[0] + s.vx * k, q[1] - s.vy * k, colors.pos, 3, 'v');

    const sp = getBallSprite();
    ctx.drawImage(sp.cv, q[0] - sp.size / 2, q[1] - sp.size / 2, sp.size, sp.size);

    drawClock(dtShown > 0, dtShown);
  }

  function draw() {
    if (!cache) compute();
    if (!state.fly) newFlight();
    if (!view || !viewLocked) view = computeView();
    renderStatic();
    ctx = main;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bgCv, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 球的接觸陰影（球在發射台上時投在台頂）
    const s = state.fly.s, q = toPx(s.x, s.y), a0 = toPx(0, state.h0);
    const onTower = state.h0 > 0 && q[0] <= a0[0] + 0.5 && s.y >= state.h0 - 1e-9;
    const surf = onTower ? a0[1] : view.oy;
    drawContactShadow(q[0], surf, surf - q[1]);
    drawGhosts();
    drawPrediction();
    drawAngle();
    drawLauncher();
    drawPuff();
    drawFlight();
    updateReadout();
  }

  // ---------- 數字格式 ----------
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }

  function updateReadout() {
    const s = state.fly.s, p = cache.p, pr = cache.pred;
    $('rt').textContent = num(s.t, 2) + ' s';
    $('rx').textContent = num(s.x, 2) + ' m';
    $('ry').textContent = num(s.y, 2) + ' m';
    $('rvx').textContent = num(s.vx, 2) + ' m/s';
    $('rvy').textContent = num(s.vy, 2) + ' m/s';
    $('rv').textContent = num(Math.hypot(s.vx, s.vy), 2) + ' m/s';
    $('rE').textContent = num(PC.energyPerMass(p, s), 1) + ' J/kg';

    $('method').textContent = state.drag ? T('數值解（RK4）', 'Numerical (RK4)') : T('解析解', 'Analytical');
    const id = cache.ideal;
    const extra = function (v, d, unit) { return state.drag ? '<br><small>' + T('無阻力時 ', 'No drag: ') + num(v, d) + ' ' + unit + '</small>' : ''; };
    $('pT').innerHTML = num(pr.T, 2) + ' s' + extra(id.T, 2, 's');
    $('pR').innerHTML = num(pr.R, 2) + ' m' + extra(id.R, 2, 'm');
    $('pH').innerHTML = num(pr.H, 2) + ' m' + extra(id.H, 2, 'm');
    $('pOpt').innerHTML = num(cache.opt.theta, 1) + '°<br><small>' + T('此時 R = ', 'giving R = ') + num(cache.opt.R, 2) + ' m</small>';
    $('rVt').textContent = state.drag ? num(PC.terminalSpeed(p), 1) + ' m/s' : '—';
    $('status').textContent = state.status;
  }

  function renderGhosts() {
    const ul = $('ghosts');
    if (!state.ghosts.length) {
      ul.innerHTML = '<li class="none"><span class="empty">' +
        T('尚無紀錄：按「發射」，落地後的軌跡會保留在這裡。', 'Nothing saved yet: press “Launch”, and each trajectory is kept here after it lands.') + '</span></li>';
      return;
    }
    const gap = T('　', '&emsp;');
    ul.innerHTML = state.ghosts.map(function (g) {
      return '<li><span class="sw" style="background:var(--' + GHOST_COLORS[g.color] + ')">' + g.n + '</span>' +
        '<span>' + g.desc + '<br><span class="meta">R ' + num(g.R, 2) + ' m' + gap + 'H ' + num(g.H, 2) + ' m' + gap + 'T ' + num(g.T, 2) + ' s</span></span></li>';
    }).join('');
  }

  // ---------- 音效（sound.js；音效關閉或沒有載入時完全不呼叫） ----------
  function sound() {
    const S = window.LabSound;
    return S && S.enabled() ? S : null;
  }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  /** 發射「咻」：上滑音加一點氣流噪音；初速越大越響、音越高 */
  function launchSound(v0) {
    const S = sound(); if (!S) return;
    const n = clamp01(Math.log(1 + v0) / Math.log(1 + 50));
    S.sweep({ from: 280 + 120 * n, to: 650 + 650 * n, dur: 0.16 + 0.08 * n, type: 'triangle', gain: 0.35 + 0.35 * n });
    S.noise({ dur: 0.14 + 0.08 * n, gain: 0.15 + 0.25 * n, filter: 1500 + 1800 * n, q: 0.8, attack: 0.03 });
  }
  /**
   * 落地「咚」：音量隨落地速率增加（取對數壓縮，輕落地也聽得到）；
   * 落地越猛，噪音成分越亮、越短促。主要頻率 ≥ 250 Hz，加一個泛音讓小喇叭也有厚度。
   */
  function landSound(v) {
    const S = sound(); if (!S) return;
    const hard = clamp01(Math.log10(1 + v) / Math.log10(1 + 60));
    const gain = 0.45 + 0.5 * hard;
    S.noise({ dur: 0.1 + 0.06 * (1 - hard), gain: gain, filter: 700 + 1600 * hard, q: 0.7, filterType: 'lowpass' });
    const f0 = 255 + 70 * hard;
    S.sweep({ from: f0 * 1.35, to: f0, dur: 0.14, type: 'triangle', gain: gain * 0.75 });
    S.tone({ freq: f0 * 2.02, dur: 0.07, type: 'sine', gain: gain * 0.3 });
  }
  /** 等時距標記的輕「滴」聲：音高隨高度（離地越高越高），很小聲 */
  let lastTickAt = -1;
  function markerSound(y) {
    const S = sound(); if (!S) return;
    const now = performance.now();
    if (now - lastTickAt < 70) return; // 高倍速播放時避免連成一串
    lastTickAt = now;
    const top = Math.max(1e-6, cache.pred.H);
    const u = clamp01(y / top);
    S.tone({ freq: 700 + 500 * u, dur: 0.035, type: 'sine', gain: 0.16 });
  }

  // ---------- 動畫 ----------
  let lastT = 0, rafId = 0;
  function tick(now) {
    const f = state.fly;
    if (!f.running) return;
    const dt = Math.min((now - lastT) / 1000, 1 / 30) * state.speed;
    lastT = now;
    const t0 = f.s.t;
    const landed = PC.advance(cache.p, f.s, dt, { trail: f.trail });
    if (landed) {
      // 落地聲：在模擬時間跨過落地時刻的那一格發出一次（任何播放速度、暫停後繼續都一樣）
      if (f.s.t > 0) landSound(Math.hypot(f.s.vx, f.s.vy));
      land();
    } else if (state.show.dots) {
      const step = markerStep();
      if (step > 0 && Math.floor(f.s.t / step + 1e-9) > Math.floor(t0 / step + 1e-9)) markerSound(f.s.y);
    }
    draw();
    if (f.running) rafId = requestAnimationFrame(tick);
  }

  function land() {
    const f = state.fly, s = f.s, p = cache.p;
    f.running = false;
    f.landed = true;
    $('run').textContent = T('再發射一次', 'Launch again');
    state.launches++;
    // 抽樣保留軌跡（最多約 600 點）
    const every = Math.max(1, Math.ceil(f.trail.length / 600));
    const pts = f.trail.filter(function (pt, i) { return i % every === 0; });
    pts.push(f.trail[f.trail.length - 1]);
    let H = 0;
    f.trail.forEach(function (pt) { if (pt[1] > H) H = pt[1]; });
    state.ghosts.push({
      n: state.launches,
      color: (state.launches - 1) % GHOST_COLORS.length,
      pts: pts,
      R: s.x, H: Math.max(H, cache.pred.H), T: s.t,
      desc: fmtVal(p.theta, 1, 0) + '°' + T('，', ', ') + 'v<sub>0</sub> = ' + fmtVal(p.v0, 2, 1) + ' m/s' + T('，', ', ') + 'g = ' + fmtVal(p.g, 2, 2) +
        (p.k > 0 ? T('，有阻力 k/m = ', ', drag k/m = ') + fmtK(p.k) : T('，無阻力', ', no drag')) +
        (p.h0 > 0 ? T('，', ', ') + 'h<sub>0</sub> = ' + fmtVal(p.h0, 2, 1) + ' m' : '')
    });
    startPuff(s.x, Math.hypot(s.vx, s.vy)); // 落地揚塵（純裝飾）
    if (state.ghosts.length > MAX_GHOSTS) state.ghosts.shift();
    renderGhosts();
    // 任務模式（missions.js）：回報這次落地的結果
    if (window.LabMission) {
      window.LabMission.emit('landed', {
        v0: p.v0, theta: p.theta, h0: p.h0, g: p.g, k: p.k, drag: p.k > 0,
        R: s.x, H: Math.max(H, cache.pred.H), T: s.t, vImpact: Math.hypot(s.vx, s.vy),
        optTheta: cache.opt ? cache.opt.theta : null, n: state.launches
      });
    }
    state.status = T('第 ' + state.launches + ' 次發射落地：t = ' + num(s.t, 2) + ' s，射程 ' + num(s.x, 2) + ' m。',
      'Flight ' + state.launches + ' landed: t = ' + num(s.t, 2) + ' s, range ' + num(s.x, 2) + ' m.');
  }

  function start() {
    const f = state.fly;
    if (!f.launched) launchSound(cache.p.v0); // 只在真正發射時「咻」一聲，暫停後繼續不再發聲
    f.running = true;
    f.launched = true;
    $('run').textContent = T('暫停', 'Pause');
    state.status = state.drag && state.g === PC.G_PRESETS.moon
      ? T('提醒：月球沒有大氣，這裡的阻力只是假想比較。', 'Note: the Moon has no atmosphere, so drag here is only a hypothetical comparison.')
      : T('飛行中…', 'In flight…');
    lastT = performance.now();
    cancelAnimationFrame(rafId); // 確保只有一個動畫迴圈
    rafId = requestAnimationFrame(tick);
  }

  function resetFlight(msg) {
    newFlight();
    $('run').textContent = T('發射', 'Launch');
    state.status = msg || '';
    requestDraw();
  }

  /** 任一參數改變：停止目前的飛行並重新預測 */
  function paramsChanged() {
    cache = null;
    resetFlight();
  }

  // ---------- 控制項 ----------
  /** k/m 的顯示：最多到小數第 4 位（與打字輸入的精度相同），去掉多餘的 0 */
  function fmtK(k) { return fmtVal(k, 4, 0) + ' m<sup>−1</sup>'; }
  /** 顯示到 maxD 位小數、去掉尾端的 0，但至少保留 minD 位（不少於滑桿間隔的位數） */
  function fmtVal(v, maxD, minD) {
    let s = num(v, maxD);
    if (maxD > minD && s.indexOf('.') >= 0) {
      const dot = s.indexOf('.');
      while (s.length > dot + 1 + minD && s.charAt(s.length - 1) === '0') s = s.slice(0, -1);
      if (s.charAt(s.length - 1) === '.') s = s.slice(0, -1);
    }
    return s;
  }

  // 滑桿讀值：點數字打字輸入的精確值由 numinput.js 保留（LabNum），拖曳後回到滑桿值
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  // 非線性滑桿：阻力係數（對數刻度）與播放速度（倍率表）
  if (window.LabNum) {
    window.LabNum.register($('k'), {
      toValue: function (pos) { return Math.pow(10, pos); },
      toPos: function (v) { return Math.log10(v); },
      min: 0.001, max: Number(Math.pow(10, +$('k').max).toFixed(4)), decimals: 4
    });
    window.LabNum.register($('speed'), {
      toValue: function (pos) { return SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, Math.round(pos)))]; },
      toPos: function (v) {
        let best = 0;
        SPEEDS.forEach(function (s, i) { if (Math.abs(Math.log(s / v)) < Math.abs(Math.log(SPEEDS[best] / v))) best = i; });
        return best;
      },
      min: SPEEDS[0], max: SPEEDS[SPEEDS.length - 1], decimals: 2
    });
  }
  /** 阻力係數：拖曳滑桿時取 3 位有效數字（與原本相同）；打字輸入時用輸入的精確值 */
  function kOf(el) {
    const fromPos = Math.pow(10, +el.value), v = val(el);
    return Math.abs(v - fromPos) > 1e-12 ? v : Number(fromPos.toPrecision(3));
  }

  function bindSlider(id, fmt, onInput) {
    const el = $(id), out = $(id + 'o');
    const update = function () { out.innerHTML = fmt(val(el)); };
    el.addEventListener('input', function () { update(); onInput(val(el)); });
    update();
    return { el: el, set: function (v) { if (window.LabNum) window.LabNum.clear(el); el.value = v; update(); } };
  }

  bindSlider('v0', function (v) { return fmtVal(v, 2, 1) + ' m/s'; }, function (v) { state.v0 = v; paramsChanged(); });
  const sTheta = bindSlider('theta', function (v) { return fmtVal(v, 1, 0) + '°'; }, function (v) { state.theta = v; paramsChanged(); });
  bindSlider('h0', function (v) { return fmtVal(v, 2, 1) + ' m'; }, function (v) { state.h0 = v; paramsChanged(); });
  const sG = bindSlider('g', function (v) { return fmtVal(v, 2, 2) + ' m/s<sup>2</sup>'; }, function (v) { state.g = v; syncPresets(); paramsChanged(); });
  bindSlider('k', function () { return fmtK(kOf($('k'))); }, function () { state.k = kOf($('k')); if (state.drag) paramsChanged(); });
  bindSlider('speed', function (v) { return fmtVal(v, 2, 0) + '×'; }, function (v) { state.speed = v; });
  state.k = kOf($('k'));

  const presetBtns = document.querySelectorAll('[data-g]');
  function syncPresets() {
    presetBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.g - state.g) < 1e-9)); });
  }
  presetBtns.forEach(function (b) {
    b.addEventListener('click', function () { state.g = +b.dataset.g; sG.set(state.g); syncPresets(); paramsChanged(); });
  });
  syncPresets();

  $('drag').addEventListener('change', function (ev) {
    state.drag = ev.target.checked;
    $('k').disabled = !state.drag;
    $('dragBox').classList.toggle('dim', !state.drag);
    $('legIdeal').style.display = state.drag ? '' : 'none';
    paramsChanged();
  });
  $('legIdeal').style.display = 'none';

  [['showPred', 'pred'], ['showV', 'v'], ['showComp', 'comp'], ['showDots', 'dots']].forEach(function (pair) {
    $(pair[0]).addEventListener('change', function (ev) { state.show[pair[1]] = ev.target.checked; requestDraw(); });
  });

  $('run').addEventListener('click', function () {
    const f = state.fly;
    if (f.running) {
      f.running = false;
      $('run').textContent = T('繼續', 'Resume');
      state.status = T('已暫停', 'Paused');
      requestDraw();
      return;
    }
    if (f.landed) newFlight();
    start();
  });
  $('reset').addEventListener('click', function () { resetFlight(); });
  // 全部清除：目前的飛行與軌跡、所有比較軌跡（含清單與編號）、落地效果，回到可發射狀態；滑桿設定保留
  $('clearAll').addEventListener('click', function () {
    cancelAnimationFrame(rafId);
    cancelAnimationFrame(puffRaf);
    puff = null;
    state.ghosts = [];
    state.launches = 0;
    renderGhosts();
    view = null;
    viewLocked = false;
    resetFlight(T('已全部清除，可以重新發射。', 'Everything cleared: ready to launch.'));
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
  $('clearGhosts').addEventListener('click', function () {
    state.ghosts = [];
    renderGhosts();
    requestDraw();
  });

  // ---------- 在畫布上拖曳調整仰角 ----------
  let aiming = false;
  function aim(ev) {
    const r = cv.getBoundingClientRect();
    const a = toPx(0, state.h0);
    const dx = ev.clientX - r.left - a[0], dy = a[1] - (ev.clientY - r.top);
    if (Math.hypot(dx, dy) < 8) return;
    let deg = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
    if (deg < 0) deg = dx >= 0 ? 0 : 90;
    deg = Math.min(90, Math.max(0, deg));
    if (deg === state.theta) return;
    state.theta = deg;
    sTheta.set(deg);
    paramsChanged();
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (!view) return;
    aiming = true;
    viewLocked = true; // 拖曳時固定縮放，避免畫面跟著跳動
    cv.setPointerCapture(ev.pointerId);
    aim(ev);
    ev.preventDefault();
  });
  cv.addEventListener('pointermove', function (ev) { if (aiming) aim(ev); });
  const endAim = function () {
    if (!aiming) return;
    aiming = false;
    viewLocked = false;
    requestDraw();
  };
  cv.addEventListener('pointerup', endAim);
  cv.addEventListener('pointercancel', endAim);

  // ---------- 啟動 ----------
  readColors();
  renderGhosts();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { readColors(); requestDraw(); });
  // 齒輪設定切換深淺色時也重畫（settings.js）
  window.addEventListener('lab:themechange', function () { readColors(); requestDraw(); });
  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);
  else window.addEventListener('resize', resize);
  resize();
})();
