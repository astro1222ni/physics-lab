/* slit-interference.js — 「雙狹縫干涉與單狹縫繞射」模組的畫面與互動（物理計算在 slit-interference-core.js） */
(function () {
  'use strict';
  const SC = window.SlitCore;
  const $ = function (id) { return document.getElementById(id); };
  const NM = 1e-9, UM = 1e-6, MM = 1e-3;
  const ZOOMS = [2, 5, 10, 20, 30, 50, 80, 120, 200, 300, 500]; // 屏幕顯示範圍 ±Y（mm）
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = {
    mode: 'double',  // single | double | grating
    N: 5,            // 光柵模式的狹縫數
    lam: 550,        // nm
    a: 40,           // μm
    d: 120,          // μm
    L: 1,            // m
    zoom: 4,
    showEnv: true,
    showOrders: true,
    cursorY: null,   // m；null 表示尚未放置游標
    anim: !reducedMotion
  };

  function slitCount() { return state.mode === 'single' ? 1 : state.mode === 'double' ? 2 : state.N; }
  function params() {
    return { N: slitCount(), a: state.a * UM, d: state.d * UM, lambda: state.lam * NM, L: state.L };
  }
  function halfRange() { return ZOOMS[state.zoom] * MM; }

  // ---------- 顏色 ----------
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--field', '--equi', '--grid', '--probe', '--surface', '--border', '--accent']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  // 暗室（示意圖與屏幕）在淺色、深色模式下都是暗的，用固定顏色
  const DARK = { bg: '#05080a', label: 'rgba(232, 238, 240, 0.9)', dim: 'rgba(200, 212, 216, 0.62)', barrier: '#7d8a8f', screen: '#cfd6d9' };

  function waveRGB() { return SC.wavelengthToRGB(state.lam); }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  // ---------- 數字格式（不使用上標數字字元） ----------
  function num(v, digits) {
    return Number(v.toPrecision(digits || 3)).toString().replace('-', '−');
  }
  function fmtLen(m) {
    if (!isFinite(m)) return '—';
    const a = Math.abs(m);
    if (a === 0) return '0 mm';
    if (a < 0.01 * MM) return num(m / UM) + ' μm';
    if (a < 1) return num(m / MM) + ' mm';
    return num(m) + ' m';
  }
  function fmtZoom(mm) { return mm >= 100 ? '±' + mm / 10 + ' cm' : '±' + mm + ' mm'; }

  // ---------- 畫布 ----------
  function makeCanvas(id) { const cv = $(id); return { cv: cv, ctx: cv.getContext('2d'), w: 0, h: 0, dpr: 1 }; }
  const scene = makeCanvas('scene');
  const pat = makeCanvas('pattern');
  function sizeCanvas(o) {
    o.dpr = window.devicePixelRatio || 1;
    o.w = o.cv.clientWidth;
    o.h = o.cv.clientHeight;
    o.cv.width = Math.max(1, Math.round(o.w * o.dpr));
    o.cv.height = Math.max(1, Math.round(o.h * o.dpr));
  }

  // ====================================================================
  // 俯視示意圖：惠更斯子波疊加（振幅預先算好，動畫時只需乘上 e^(−iωt)）
  // ====================================================================
  const CELL = 3; // 每個計算格點佔 3 × 3 CSS 像素
  let field = null;  // { gw, gh, bxCell, re, im, avg, kpx, slits, geom }
  const fieldImg = document.createElement('canvas');
  const fieldCtx = fieldImg.getContext('2d');

  function sceneGeometry() {
    const W = scene.w, H = scene.h;
    const s = H / 400;
    const lamPx = (7 + 7 * (state.lam - 380) / 370) * Math.max(0.75, s);
    const N = slitCount();
    let dPx = 0, aPx;
    if (N === 1) {
      const t = Math.log(state.a / 5) / Math.log(20);
      aPx = (6 + 52 * t) * s;
    } else {
      const t = Math.log(state.d / 10) / Math.log(40);
      dPx = (24 + 86 * t) * s;
      dPx = Math.min(dPx, (H * 0.78) / (N - 1));
      aPx = Math.max(2, Math.min(dPx - 2, dPx * state.a / state.d));
    }
    return { W: W, H: H, bx: Math.round(W * 0.2), sx: W - 16, lamPx: lamPx, dPx: dPx, aPx: aPx, N: N, cy: H / 2 };
  }

  function computeField() {
    const g = sceneGeometry();
    const gw = Math.ceil(g.W / CELL), gh = Math.ceil(g.H / CELL);
    const k = 2 * Math.PI / g.lamPx;
    // 每條狹縫切成 ns 個子波源，間距不超過 λ/3，避免出現假的「光柵」繞射
    let ns = Math.max(1, Math.ceil(g.aPx / (g.lamPx / 3)));
    ns = Math.min(ns, 12, Math.max(2, Math.floor(72 / g.N)));
    if (g.aPx < g.lamPx / 3) ns = 1;
    const src = [];
    const slits = [];
    for (let i = 0; i < g.N; i++) {
      const c = g.cy + (i - (g.N - 1) / 2) * g.dPx;
      slits.push(c);
      for (let j = 0; j < ns; j++) src.push(ns === 1 ? c : c - g.aPx / 2 + (j + 0.5) * g.aPx / ns);
    }
    const n = gw * gh;
    const re = new Float32Array(n), im = new Float32Array(n), avg = new Float32Array(n);
    const bxCell = Math.ceil(g.bx / CELL);
    let norm = 0;
    for (let cx = bxCell; cx < gw; cx++) {
      const x = (cx + 0.5) * CELL - g.bx;
      const dist = Math.sqrt(x + g.lamPx); // 補償 1/√r 的衰減，讓遠處也看得到波前
      for (let cy = 0; cy < gh; cy++) {
        const y = (cy + 0.5) * CELL;
        let sr = 0, si = 0;
        for (let q = 0; q < src.length; q++) {
          const dy = y - src[q];
          const r = Math.sqrt(x * x + dy * dy) + 0.5;
          const w = 1 / Math.sqrt(r);
          const ph = k * r;
          sr += w * Math.cos(ph);
          si += w * Math.sin(ph);
        }
        const o = cy * gw + cx;
        re[o] = sr * dist; im[o] = si * dist;
        const m2 = re[o] * re[o] + im[o] * im[o];
        if (x > 2 * g.lamPx && m2 > norm) norm = m2;
      }
    }
    norm = Math.sqrt(norm) || 1;
    for (let o = 0; o < n; o++) {
      re[o] /= norm; im[o] /= norm;
      avg[o] = Math.min(1, re[o] * re[o] + im[o] * im[o]);
    }
    fieldImg.width = gw; fieldImg.height = gh;
    field = { gw: gw, gh: gh, bxCell: bxCell, re: re, im: im, avg: avg, k: k, g: g, slits: slits,
      img: fieldCtx.createImageData(gw, gh) };
  }

  let phase = 0;
  function drawScene() {
    if (!scene.w) return;
    if (!field) computeField();
    const ctx = scene.ctx, g = field.g, W = scene.w, H = scene.h;
    ctx.setTransform(scene.dpr, 0, 0, scene.dpr, 0, 0);

    // 波場影像
    const col = waveRGB();
    const img = field.img, data = img.data, gw = field.gw, gh = field.gh;
    const cp = Math.cos(phase), sp = Math.sin(phase);
    for (let cy = 0; cy < gh; cy++) {
      for (let cx = 0; cx < gw; cx++) {
        const o = cy * gw + cx;
        let b;
        if (cx < field.bxCell) {
          // 入射的平面波：cos(k(x − x_b) − ωt)
          const v = Math.cos(field.k * ((cx + 0.5) * CELL - g.bx) - phase);
          b = 0.85 * Math.max(0, v) + 0.22;
        } else {
          const v = field.re[o] * cp + field.im[o] * sp; // Re(A e^(−iωt))
          b = 0.85 * Math.max(0, v) + 0.22 * field.avg[o];
        }
        if (b > 1) b = 1;
        const p = o * 4;
        data[p] = col[0] * b; data[p + 1] = col[1] * b; data[p + 2] = col[2] * b; data[p + 3] = 255;
      }
    }
    fieldCtx.putImageData(img, 0, 0);
    ctx.fillStyle = DARK.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fieldImg, 0, 0, gw * CELL, gh * CELL);

    // 擋板與狹縫
    ctx.fillStyle = DARK.barrier;
    const bw = 6, x0 = g.bx - bw / 2;
    const gaps = field.slits.map(function (c) { return [c - g.aPx / 2, c + g.aPx / 2]; });
    let top = 0;
    gaps.forEach(function (gp) { if (gp[0] > top) ctx.fillRect(x0, top, bw, gp[0] - top); top = gp[1]; });
    if (top < H) ctx.fillRect(x0, top, bw, H - top);

    // 屏幕
    ctx.fillStyle = DARK.screen;
    ctx.fillRect(g.sx, 0, 5, H);

    // 標示
    ctx.font = '12px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    label('入射光  λ = ' + state.lam + ' nm', 8, 8, DARK.label);
    ctx.textAlign = 'right';
    label('屏幕', g.sx - 6, 8, DARK.label);
    ctx.textAlign = 'center';
    label(state.mode === 'single' ? '單狹縫' : state.mode === 'double' ? '雙狹縫' : slitCount() + ' 條狹縫', g.bx, H - 40, DARK.label);

    // 尺寸：a 或 d
    ctx.strokeStyle = DARK.label;
    ctx.lineWidth = 1;
    const bxL = g.bx - 12;
    if (g.N === 1) {
      bracket(bxL, g.cy - g.aPx / 2, g.cy + g.aPx / 2, 'a');
    } else if (g.N === 2) {
      bracket(bxL, field.slits[0], field.slits[1], 'd');
    } else {
      bracket(bxL, field.slits[0], field.slits[1], 'd');
    }

    // 屏幕距離 L
    const ly = H - 16;
    ctx.beginPath();
    ctx.moveTo(g.bx + 4, ly); ctx.lineTo(g.sx - 2, ly);
    ctx.stroke();
    arrow(g.bx + 4, ly, -1); arrow(g.sx - 2, ly, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lt = 'L = ' + state.L.toFixed(2) + ' m';
    const tw = ctx.measureText(lt).width + 10;
    const lx = (g.bx + g.sx) / 2;
    ctx.fillStyle = DARK.bg;
    ctx.fillRect(lx - tw / 2, ly - 9, tw, 18);
    ctx.fillStyle = DARK.label;
    ctx.fillText(lt, lx, ly);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '11px system-ui, sans-serif';
    label('示意圖（未依比例）', 8, 26, DARK.dim);

    function label(t, x, y, c) {
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(5, 8, 10, 0.75)';
      ctx.strokeText(t, x, y);
      ctx.fillStyle = c;
      ctx.fillText(t, x, y);
    }
    function arrow(x, y, dir) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - dir * 6, y - 3.5);
      ctx.lineTo(x - dir * 6, y + 3.5);
      ctx.closePath();
      ctx.fillStyle = DARK.label;
      ctx.fill();
    }
    function bracket(x, y1, y2, t) {
      ctx.strokeStyle = DARK.label;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 4, y1); ctx.lineTo(x, y1); ctx.lineTo(x, y2); ctx.lineTo(x + 4, y2);
      ctx.stroke();
      ctx.font = 'italic 13px "Times New Roman", serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      label(t, x - 4, (y1 + y2) / 2, DARK.label);
      ctx.font = '12px system-ui, sans-serif';
    }
  }

  // 動畫：只在示意圖可見、分頁在前景、且使用者未暫停時執行
  let sceneVisible = true, animReq = 0, lastT = 0;
  function animLoop(t) {
    animReq = 0;
    if (!state.anim || !sceneVisible || document.hidden) return;
    const dt = Math.min(0.05, (t - (lastT || t)) / 1000);
    lastT = t;
    if (!field) computeField();
    const v = 34; // 波前前進速率（CSS px/s）
    phase = (phase + field.k * v * dt) % (2 * Math.PI);
    drawScene();
    animReq = requestAnimationFrame(animLoop);
  }
  function startAnim() {
    if (animReq || !state.anim) return;
    lastT = 0;
    if (!field) computeField();
    animReq = requestAnimationFrame(animLoop);
  }

  // ====================================================================
  // 屏幕條紋與強度圖
  // ====================================================================
  let layout = null;
  function patternLayout() {
    const W = pat.w, H = pat.h;
    const PL = 42, PR = 14;
    const ST = 22;
    const SH = Math.max(34, Math.min(64, Math.round(H * 0.17)));
    const GT = ST + SH + 26;
    const GB = H - 34;
    return { W: W, H: H, PL: PL, PR: PR, PW: W - PL - PR, ST: ST, SH: SH, GT: GT, GB: GB };
  }
  function xToY(px) { const l = layout; return ((px - l.PL) / l.PW * 2 - 1) * halfRange(); }
  function yToX(y) { const l = layout; return l.PL + (y / halfRange() + 1) / 2 * l.PW; }

  function drawPattern() {
    if (!pat.w) return;
    layout = patternLayout();
    const l = layout, ctx = pat.ctx, dpr = pat.dpr;
    const p = params();
    const Y = halfRange();
    const col = waveRGB();
    const lin = col.map(SC.srgbToLinear);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors['canvas-bg'];
    ctx.fillRect(0, 0, l.W, l.H);

    // ---- 取樣：每個裝置像素一欄；條紋比像素細時，在欄內多點取樣求平均與最大、最小值 ----
    const cols = Math.max(2, Math.round(l.PW * dpr));
    const physPerCol = 2 * Y / cols;
    const feature = p.N === 1 ? p.lambda * p.L / p.a : p.lambda * p.L / (p.N * p.d);
    const K = Math.max(1, Math.min(64, Math.ceil(6 * physPerCol / feature)));
    const resolved = feature / (2 * Y / l.PW) >= 4; // 最細的特徵至少 4 個 CSS 像素
    $('densityHint').hidden = resolved;
    const avg = new Float32Array(cols), mn = new Float32Array(cols), mx = new Float32Array(cols), mid = new Float32Array(cols);
    for (let i = 0; i < cols; i++) {
      const y0 = -Y + i * physPerCol;
      let s = 0, lo = Infinity, hi = -Infinity;
      for (let j = 0; j < K; j++) {
        const v = SC.intensity(p, y0 + (j + 0.5) * physPerCol / K);
        s += v; if (v < lo) lo = v; if (v > hi) hi = v;
      }
      avg[i] = s / K; mn[i] = lo; mx[i] = hi;
      mid[i] = SC.intensity(p, y0 + 0.5 * physPerCol);
    }

    // ---- 屏幕（正面看）：亮度正比於 I（在線性亮度空間相乘，再轉回 sRGB） ----
    ctx.fillStyle = colors.muted;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('屏幕上看到的條紋', l.PL, l.ST - 11);
    const strip = document.createElement('canvas');
    strip.width = cols; strip.height = 1;
    const sctx = strip.getContext('2d');
    const simg = sctx.createImageData(cols, 1);
    for (let i = 0; i < cols; i++) {
      simg.data[i * 4] = SC.linearToSrgb(lin[0] * avg[i]);
      simg.data[i * 4 + 1] = SC.linearToSrgb(lin[1] * avg[i]);
      simg.data[i * 4 + 2] = SC.linearToSrgb(lin[2] * avg[i]);
      simg.data[i * 4 + 3] = 255;
    }
    sctx.putImageData(simg, 0, 0);
    ctx.fillStyle = DARK.bg;
    ctx.fillRect(l.PL - 4, l.ST, l.PW + 8, l.SH);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(strip, l.PL, l.ST, l.PW, l.SH);
    ctx.imageSmoothingEnabled = true;
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(l.PL - 4.5, l.ST - 0.5, l.PW + 9, l.SH + 1);

    // ---- 級數標示（條紋與強度圖之間） ----
    const rowY = l.ST + l.SH + 13;
    if (state.showOrders) drawOrderLabels(p, rowY);

    // ---- 強度圖座標格 ----
    const gh = l.GB - l.GT;
    const iy = function (v) { return l.GB - v * gh; };
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    [0.25, 0.5, 0.75, 1].forEach(function (v) { ctx.moveTo(l.PL, Math.round(iy(v)) + 0.5); ctx.lineTo(l.PL + l.PW, Math.round(iy(v)) + 0.5); });
    const step = niceStep(2 * Y / MM, Math.max(3, Math.floor(l.PW / 64)));
    for (let t = Math.ceil(-Y / MM / step) * step; t <= Y / MM + 1e-9; t += step) {
      const x = Math.round(yToX(t * MM)) + 0.5;
      ctx.moveTo(x, l.GT); ctx.lineTo(x, l.GB);
    }
    ctx.stroke();
    ctx.fillStyle = colors.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    [0, 0.5, 1].forEach(function (v) { ctx.fillText(String(v), l.PL - 6, iy(v)); });
    ctx.save();
    ctx.translate(11, (l.GT + l.GB) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('I / I0', 0, 0);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let t = Math.ceil(-Y / MM / step) * step; t <= Y / MM + 1e-9; t += step) {
      const v = Math.abs(t) < 1e-9 ? 0 : t;
      ctx.fillText(num(v, 4), yToX(v * MM), l.GB + 5);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('y（mm）', l.PL + l.PW, l.H - 1);
    ctx.strokeStyle = colors.muted;
    ctx.beginPath();
    ctx.moveTo(l.PL, l.GB + 0.5); ctx.lineTo(l.PL + l.PW, l.GB + 0.5);
    ctx.stroke();

    // ---- 強度曲線 ----
    const xc = function (i) { return l.PL + (i + 0.5) / cols * l.PW; };
    ctx.save();
    ctx.beginPath();
    ctx.rect(l.PL, l.GT - 4, l.PW, gh + 4);
    ctx.clip();
    if (resolved) {
      ctx.beginPath();
      ctx.moveTo(xc(0), l.GB);
      for (let i = 0; i < cols; i++) ctx.lineTo(xc(i), iy(mid[i]));
      ctx.lineTo(xc(cols - 1), l.GB);
      ctx.closePath();
      ctx.fillStyle = rgba(col, 0.38);
      ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < cols; i++) { if (i) ctx.lineTo(xc(i), iy(mid[i])); else ctx.moveTo(xc(i), iy(mid[i])); }
      ctx.strokeStyle = colors.field;
      ctx.lineWidth = 1.6;
      ctx.lineJoin = 'round';
      ctx.stroke();
    } else {
      // 條紋太密：每一欄畫出該欄內強度的最小值到最大值
      ctx.beginPath();
      for (let i = 0; i < cols; i++) { if (i) ctx.lineTo(xc(i), iy(mx[i])); else ctx.moveTo(xc(i), iy(mx[i])); }
      for (let i = cols - 1; i >= 0; i--) ctx.lineTo(xc(i), iy(mn[i]));
      ctx.closePath();
      ctx.fillStyle = rgba(col, 0.55);
      ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < cols; i++) { if (i) ctx.lineTo(xc(i), iy(mx[i])); else ctx.moveTo(xc(i), iy(mx[i])); }
      ctx.strokeStyle = colors.field;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // 單狹縫包絡線（虛線）
    if (state.showEnv && p.N > 1) {
      ctx.beginPath();
      for (let i = 0; i < cols; i += Math.max(1, Math.round(dpr))) {
        const v = SC.envelope(p, -Y + (i + 0.5) * physPerCol);
        if (i) ctx.lineTo(xc(i), iy(v)); else ctx.moveTo(xc(i), iy(v));
      }
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = colors.muted;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    drawCursor(p);
    updateCursorReadout(p);
  }

  function niceStep(span, maxTicks) {
    const raw = span / maxTicks;
    const p10 = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p10;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p10;
  }

  function drawOrderLabels(p, rowY) {
    const ctx = pat.ctx, l = layout, Y = halfRange();
    let marks, title;
    if (p.N === 1) {
      title = '暗紋 m';
      marks = SC.singleSlitDarks(p).filter(function (o) { return Math.abs(o.y) <= Y; });
    } else {
      title = '亮紋 m';
      // 只取 |y| ≤ Y 的級數，避免數百個級數全都計算
      const sMax = SC.sinTheta(Y, p.L);
      const mMax = Math.floor(sMax * p.d / p.lambda);
      const k = SC.missingOrderStep(p.d, p.a);
      marks = [];
      for (let m = -mMax; m <= mMax; m++) {
        const s = m * p.lambda / p.d;
        if (Math.abs(s) >= 1) continue;
        marks.push({ m: m, y: SC.yFromSin(s, p.L), missing: k > 0 && m !== 0 && m % k === 0 });
      }
    }
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillStyle = colors.muted;
    ctx.fillText(title, l.PL - 6, rowY);
    if (marks.length === 0) return;
    // 間距太小時只標示每第 n 級
    const pxPer = marks.length > 1 ? Math.abs(yToX(marks[1].y) - yToX(marks[0].y)) : Infinity;
    let every = 1;
    while (pxPer * every < 22) every = every < 2 ? 2 : every < 5 ? 5 : every * 2;
    ctx.textAlign = 'center';
    marks.forEach(function (o) {
      if (o.m % every !== 0) return;
      const x = yToX(o.y);
      const t = String(o.m).replace('-', '−');
      const tw = ctx.measureText(t).width;
      if (x - tw / 2 < l.PL - 4 || x + tw / 2 > l.W - 2) return; // 不與左側標題重疊、不超出畫布
      if (o.missing) {
        ctx.fillStyle = colors.equi;
        ctx.fillText(t, x, rowY);
        const w = ctx.measureText(t).width;
        ctx.strokeStyle = colors.equi;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x - w / 2 - 2, rowY + 1); ctx.lineTo(x + w / 2 + 2, rowY + 1);
        ctx.stroke();
      } else {
        ctx.fillStyle = o.m === 0 ? colors.text : colors.muted;
        ctx.fillText(t, x, rowY);
      }
    });
  }

  function drawCursor(p) {
    if (state.cursorY === null) {
      const ctx = pat.ctx, l = layout;
      ctx.fillStyle = colors.muted;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('點擊或拖曳讀取數值', l.PL + l.PW - 4, l.GT + 2);
      return;
    }
    const y = state.cursorY;
    if (Math.abs(y) > halfRange()) return;
    const ctx = pat.ctx, l = layout;
    const x = yToX(y);
    const I = SC.intensity(p, y);
    const py = l.GB - I * (l.GB - l.GT);
    ctx.strokeStyle = colors.probe;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, l.ST - 3); ctx.lineTo(x, l.ST + l.SH + 3);
    ctx.moveTo(x, l.GT - 4); ctx.lineTo(x, l.GB);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, py, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = colors.probe;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = colors['canvas-bg'];
    ctx.stroke();
    // 數值標籤
    const t1 = 'y = ' + fmtLen(y), t2 = 'I/I0 = ' + I.toFixed(3);
    ctx.font = '12px system-ui, sans-serif';
    const w = Math.max(ctx.measureText(t1).width, ctx.measureText(t2).width) + 12;
    let bx = x + 8;
    if (bx + w > l.PL + l.PW) bx = x - 8 - w;
    const by = l.GT + 2;
    ctx.fillStyle = colors.surface;
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(bx + 0.5, by + 0.5, w, 36);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(t1, bx + 6, by + 3);
    ctx.fillText(t2, bx + 6, by + 19);
  }

  function updateCursorReadout(p) {
    const y = state.cursorY;
    if (y === null) {
      ['cY', 'cTh', 'cPd', 'cPa', 'cI'].forEach(function (id) { $(id).textContent = '—'; });
      return;
    }
    const s = SC.sinTheta(y, p.L);
    $('cY').textContent = fmtLen(y);
    $('cTh').textContent = (Math.asin(s) * 180 / Math.PI).toFixed(3).replace('-', '−') + '°';
    $('cPd').textContent = (p.d * s / p.lambda).toFixed(2).replace('-', '−') + ' λ';
    $('cPa').textContent = (p.a * s / p.lambda).toFixed(2).replace('-', '−') + ' λ';
    $('cI').textContent = SC.intensity(p, y).toFixed(3);
  }

  // ---------- 條紋特徵讀數 ----------
  function updateReadout() {
    const p = params();
    $('rW').textContent = fmtLen(SC.centralWidth(p));
    const wx = SC.centralWidthExact(p);
    $('rWx').textContent = isFinite(wx) ? fmtLen(wx) : '沒有暗紋（a ≤ λ）';
    $('rWs').textContent = fmtLen(p.lambda * p.L / p.a);
    if (p.N > 1) {
      $('rDy').textContent = fmtLen(SC.fringeSpacing(p));
      const s1 = p.lambda / p.d;
      $('rY1').textContent = s1 < 1 ? fmtLen(SC.yFromSin(s1, p.L)) : '—';
      const k = SC.missingOrderStep(p.d, p.a);
      $('rRatio').textContent = k ? String(k) + '（整數）' : (p.d / p.a).toFixed(2);
      $('rCount').textContent = SC.fringesInCentral(p) + ' 條';
      const miss = $('rMissing');
      if (k) {
        const list = [];
        for (let m = k; m * p.lambda < p.d && list.length < 3; m += k) list.push('±' + m);
        miss.textContent = list.length ? list.join('、') + (list.length === 3 ? '… 級' : ' 級') : '—';
        miss.classList.add('flag');
      } else {
        miss.textContent = '無（d/a 不是整數）';
        miss.classList.remove('flag');
      }
    }
  }

  // ---------- 重畫排程 ----------
  let pending = false;
  function requestDraw() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () {
      pending = false;
      updateReadout();
      drawPattern();
      if (!state.anim || !sceneVisible) drawScene();
    });
  }
  function invalidateScene() { field = null; requestDraw(); }

  // ---------- 控制項 ----------
  function bindSlider(id, fmt, onInput, html) {
    const el = $(id), out = $(id + 'o');
    const update = function () { if (html) out.innerHTML = fmt(+el.value); else out.textContent = fmt(+el.value); };
    el.addEventListener('input', function () { onInput(+el.value); update(); });
    update();
    return { el: el, set: function (v) { el.value = v; update(); } };
  }
  function lamLabel(v) {
    return '<span class="swatch" style="background:rgb(' + SC.wavelengthToRGB(v).join(',') + ')"></span>' +
      v + ' nm <span class="sub">（' + SC.colorName(v) + '）</span>';
  }
  const sLam = bindSlider('lam', lamLabel, function (v) { state.lam = v; invalidateScene(); }, true);
  const sA = bindSlider('a', function (v) { return v + ' μm'; }, function (v) {
    state.a = v;
    if (state.mode !== 'single' && state.d <= v) {
      state.d = Math.min(400, v + 1); sD.set(state.d);
      setStatus('縫距 d 必須大於縫寬 a，已自動加大 d。');
    } else setStatus('');
    invalidateScene();
  });
  const sD = bindSlider('d', function (v) { return v + ' μm'; }, function (v) {
    state.d = v;
    if (state.a >= v) {
      state.a = Math.max(5, v - 1); sA.set(state.a);
      if (state.d <= state.a) { state.d = state.a + 1; sD.set(state.d); }
      setStatus('縫寬 a 必須小於縫距 d，已自動縮小 a。');
    } else setStatus('');
    invalidateScene();
  });
  bindSlider('L', function (v) { return v.toFixed(2) + ' m'; }, function (v) { state.L = v; requestDraw(); });
  bindSlider('N', function (v) { return v + ' 條'; }, function (v) { state.N = v; invalidateScene(); });
  const sZoom = bindSlider('zoom', function (v) { return fmtZoom(ZOOMS[v]); }, function (v) { state.zoom = v; requestDraw(); });
  function setStatus(t) { $('status').textContent = t; }

  document.querySelectorAll('[data-lam]').forEach(function (btn) {
    btn.addEventListener('click', function () { state.lam = +btn.dataset.lam; sLam.set(state.lam); invalidateScene(); });
  });

  $('autoZoom').addEventListener('click', function () {
    const p = params();
    let target = SC.centralWidthExact(p) / 2 * 2.05;
    if (!isFinite(target)) target = Infinity;
    let i = 0;
    while (i < ZOOMS.length - 1 && ZOOMS[i] * MM < target) i++;
    state.zoom = i; sZoom.set(i);
    requestDraw();
  });

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll('[data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === mode)); });
    const single = mode === 'single';
    $('nRow').hidden = mode !== 'grating';
    $('dRow').hidden = single;
    $('lgEnv').hidden = single;
    $('showEnv').disabled = single;
    document.querySelectorAll('[data-m="multi"]').forEach(function (e) { e.hidden = single; });
    document.querySelectorAll('[data-m="single"]').forEach(function (e) { e.hidden = !single; });
    if (!single && state.d <= state.a) { state.d = Math.min(400, state.a + 1); sD.set(state.d); }
    invalidateScene();
  }
  document.querySelectorAll('[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); });
  });

  $('showEnv').addEventListener('change', function (ev) { state.showEnv = ev.target.checked; requestDraw(); });
  $('showOrders').addEventListener('change', function (ev) { state.showOrders = ev.target.checked; requestDraw(); });

  function syncAnimButton() { $('anim').textContent = state.anim ? '暫停動畫' : '播放動畫'; }
  $('anim').addEventListener('click', function () {
    state.anim = !state.anim;
    syncAnimButton();
    if (state.anim) startAnim(); else requestDraw();
  });

  // ---------- 強度圖上的游標（滑鼠、觸控、鍵盤） ----------
  let dragging = false;
  function setCursorFromEvent(ev) {
    if (!layout) return;
    const r = pat.cv.getBoundingClientRect();
    const x = Math.min(layout.PL + layout.PW, Math.max(layout.PL, ev.clientX - r.left));
    state.cursorY = xToY(x);
    requestDraw();
  }
  pat.cv.addEventListener('pointerdown', function (ev) {
    dragging = true;
    setCursorFromEvent(ev);
    try { pat.cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
  });
  pat.cv.addEventListener('pointermove', function (ev) {
    if (dragging || ev.pointerType === 'mouse') setCursorFromEvent(ev);
  });
  const endDrag = function () { dragging = false; };
  pat.cv.addEventListener('pointerup', endDrag);
  pat.cv.addEventListener('pointercancel', endDrag);
  pat.cv.addEventListener('keydown', function (ev) {
    if (!layout) return;
    const stepY = 2 * halfRange() / layout.PW * (ev.shiftKey ? 10 : 1);
    let y = state.cursorY === null ? 0 : state.cursorY;
    if (ev.key === 'ArrowLeft') y -= stepY;
    else if (ev.key === 'ArrowRight') y += stepY;
    else if (ev.key === 'Home') y = 0;
    else return;
    ev.preventDefault();
    state.cursorY = Math.max(-halfRange(), Math.min(halfRange(), y));
    requestDraw();
  });

  // ---------- 光譜色帶 ----------
  (function () {
    const stops = [];
    for (let w = 380; w <= 750; w += 10) {
      stops.push('rgb(' + SC.wavelengthToRGB(w).join(',') + ') ' + ((w - 380) / 370 * 100).toFixed(1) + '%');
    }
    $('spectrum').style.background = 'linear-gradient(90deg,' + stops.join(',') + ')';
  })();

  // ---------- 啟動 ----------
  readColors();
  syncAnimButton();
  setMode(state.mode);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { readColors(); requestDraw(); });
  // 齒輪設定切換深淺色時也重畫（settings.js）
  window.addEventListener('lab:themechange', function () { readColors(); requestDraw(); });

  function onResize() {
    sizeCanvas(scene);
    sizeCanvas(pat);
    field = null;
    updateReadout();
    drawPattern();
    drawScene();
  }
  if (window.ResizeObserver) {
    let roPending = false;
    const ro = new ResizeObserver(function () {
      if (roPending) return;
      roPending = true;
      requestAnimationFrame(function () { roPending = false; onResize(); });
    });
    ro.observe(scene.cv);
    ro.observe(pat.cv);
  } else {
    window.addEventListener('resize', onResize);
  }
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      sceneVisible = entries[entries.length - 1].isIntersecting;
      if (sceneVisible) startAnim();
    }).observe(scene.cv);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) startAnim(); });
  onResize();
  startAnim();
})();
