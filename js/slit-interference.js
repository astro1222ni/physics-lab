/* slit-interference.js — 「雙狹縫干涉與單狹縫繞射」模組的畫面與互動（物理計算在 slit-interference-core.js） */
(function () {
  'use strict';
  const SC = window.SlitCore;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  // 波長顏色名稱的英文（core 只回傳中文）
  const COLOR_EN = { '紫光': 'violet', '藍光': 'blue', '青光': 'cyan', '綠光': 'green', '黃光': 'yellow', '橙光': 'orange', '紅光': 'red' };
  const NM = 1e-9, UM = 1e-6, MM = 1e-3;
  const ZOOMS = [2, 5, 10, 20, 30, 50, 80, 120, 200, 300, 500]; // 屏幕顯示範圍 ±Y（mm）
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = {
    mode: 'double',  // single | double | grating
    N: 5,            // 光柵模式的狹縫數
    lam: 550,        // nm
    white: false,    // true = 白光（各波長光強相加）
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
  // 白光模式：讀數與級數標示以 550 nm 為參考波長，與波長有關的量另列 400 nm 與 700 nm 的值
  const REF_NM = 550, WL_LO = 400, WL_HI = 700;
  const SPEC = SC.whiteSpectrum(75, 380, 750, 6500); // 380–750 nm 共 75 個波長（波數等間隔），6500 K 黑體光譜加權
  const wtmp = [0, 0, 0, 0];
  function params() {
    return { N: slitCount(), a: state.a * UM, d: state.d * UM, lambda: (state.white ? REF_NM : state.lam) * NM, L: state.L };
  }
  function withLam(p, nm) { return Object.assign({}, p, { lambda: nm * NM }); }
  /** 屏幕上 y 處的相對光強：單色光或白光總和 */
  function Itot(p, y) { return state.white ? SC.whiteAt(p, y, SPEC, wtmp)[0] : SC.intensity(p, y); }
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
  /** lab.css 色彩代號（#rgb、#rrggbb 或 rgb()）→ [r, g, b] */
  function tokenRGB(name) {
    const v = (colors[name] || '').trim();
    let m = v.match(/^#([0-9a-f]{3,8})$/i);
    if (m) {
      let h = m[1];
      if (h.length < 6) h = h.split('').map(function (c) { return c + c; }).join('');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    m = v.match(/rgba?\(([^)]+)\)/);
    if (m) return m[1].split(',').slice(0, 3).map(function (x) { return parseFloat(x); });
    return [128, 128, 128];
  }
  /** 畫布背景是否為深色（深色模式下光暈稍強、淺色模式下陰影稍強） */
  function darkCanvas() { const c = tokenRGB('canvas-bg'); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] < 110; }
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

  function lamPxOf(nm, s) { return (7 + 7 * (nm - 380) / 370) * Math.max(0.75, s); }
  // 白光示意圖：用藍、綠、紅三個波長的波疊加（顏色取接近原色，三色波峰重疊處為白色）
  const WHITE_COMPS = [
    { nm: 460, col: [70, 110, 255] },
    { nm: 535, col: [70, 235, 70] },
    { nm: 640, col: [255, 70, 60] }
  ];
  function sceneGeometry() {
    const W = scene.w, H = scene.h;
    const s = H / 400;
    const lamPx = lamPxOf(state.white ? REF_NM : state.lam, s);
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

  // cos、sin 查表（示意圖用，相位誤差 < 0.002 rad，肉眼看不出差別）
  const LUT_N = 4096, LUT_K = LUT_N / (2 * Math.PI);
  const COS = new Float32Array(LUT_N), SIN = new Float32Array(LUT_N);
  for (let i = 0; i < LUT_N; i++) { COS[i] = Math.cos(i / LUT_K); SIN[i] = Math.sin(i / LUT_K); }

  function computeField() {
    const g = sceneGeometry();
    const gw = Math.ceil(g.W / CELL), gh = Math.ceil(g.H / CELL);
    const s = g.H / 400;
    const specs = state.white
      ? WHITE_COMPS.map(function (c) { return { lamPx: lamPxOf(c.nm, s), col: c.col, scale: 0.62 }; })
      : [{ lamPx: g.lamPx, col: null, scale: 1 }];
    const comps = computeComponents(g, gw, gh, specs);
    const slits = [];
    for (let i = 0; i < g.N; i++) slits.push(g.cy + (i - (g.N - 1) / 2) * g.dPx);
    fieldImg.width = gw; fieldImg.height = gh;
    field = { gw: gw, gh: gh, bxCell: Math.ceil(g.bx / CELL), comps: comps, g: g, slits: slits,
      img: fieldCtx.createImageData(gw, gh) };
  }

  // 各波長成分的子波疊加振幅（複數 re + i·im）；所有成分共用同一組子波源，一次算完
  // spec.col 為 null 時用目前波長的顏色
  function computeComponents(g, gw, gh, specs) {
    const nc = specs.length;
    const minLam = Math.min.apply(null, specs.map(function (c) { return c.lamPx; }));
    // 每條狹縫切成 ns 個子波源，間距不超過 λ/3，避免出現假的「光柵」繞射
    let ns = Math.max(1, Math.ceil(g.aPx / (minLam / 3)));
    ns = Math.min(ns, 12, Math.max(2, Math.floor(72 / g.N)));
    if (g.aPx < minLam / 3) ns = 1;
    const src = [];
    for (let i = 0; i < g.N; i++) {
      const c = g.cy + (i - (g.N - 1) / 2) * g.dPx;
      for (let j = 0; j < ns; j++) src.push(ns === 1 ? c : c - g.aPx / 2 + (j + 0.5) * g.aPx / ns);
    }
    const n = gw * gh;
    const out = specs.map(function (c) {
      return { k: 2 * Math.PI / c.lamPx, lamPx: c.lamPx, col: c.col, scale: c.scale,
        re: new Float32Array(n), im: new Float32Array(n), avg: new Float32Array(n), norm: 0 };
    });
    const kk = new Float64Array(nc), sr = new Float64Array(nc), si = new Float64Array(nc);
    for (let c = 0; c < nc; c++) kk[c] = out[c].k * LUT_K;
    const bxCell = Math.ceil(g.bx / CELL);
    for (let cx = bxCell; cx < gw; cx++) {
      const x = (cx + 0.5) * CELL - g.bx;
      for (let cy = 0; cy < gh; cy++) {
        const y = (cy + 0.5) * CELL;
        for (let c = 0; c < nc; c++) { sr[c] = 0; si[c] = 0; }
        for (let q = 0; q < src.length; q++) {
          const dy = y - src[q];
          const r = Math.sqrt(x * x + dy * dy) + 0.5;
          const w = 1 / Math.sqrt(r);
          for (let c = 0; c < nc; c++) {
            const idx = (kk[c] * r) & (LUT_N - 1); // 相位 k·r 換成查表索引（k·r > 0）
            sr[c] += w * COS[idx];
            si[c] += w * SIN[idx];
          }
        }
        const o = cy * gw + cx;
        for (let c = 0; c < nc; c++) {
          const f = out[c];
          const dist = Math.sqrt(x + f.lamPx); // 補償 1/√r 的衰減，讓遠處也看得到波前
          f.re[o] = sr[c] * dist; f.im[o] = si[c] * dist;
          const m2 = f.re[o] * f.re[o] + f.im[o] * f.im[o];
          if (x > 2 * f.lamPx && m2 > f.norm) f.norm = m2;
        }
      }
    }
    out.forEach(function (f) {
      const norm = Math.sqrt(f.norm) || 1;
      for (let o = 0; o < n; o++) {
        f.re[o] /= norm; f.im[o] /= norm;
        f.avg[o] = Math.min(1, f.re[o] * f.re[o] + f.im[o] * f.im[o]);
      }
    });
    return out;
  }

  const phases = [0, 0, 0]; // 各波長成分的相位 ωt
  function drawScene() {
    if (!scene.w) return;
    if (!field) computeField();
    const ctx = scene.ctx, g = field.g, W = scene.w, H = scene.h;
    ctx.setTransform(scene.dpr, 0, 0, scene.dpr, 0, 0);

    // 波場影像
    const img = field.img, data = img.data, gw = field.gw, gh = field.gh;
    const comps = field.comps, nc = comps.length;
    const cols = [], cps = [], sps = [];
    for (let c = 0; c < nc; c++) {
      const col = comps[c].col || waveRGB();
      cols.push([col[0] * comps[c].scale, col[1] * comps[c].scale, col[2] * comps[c].scale]);
      cps.push(Math.cos(phases[c])); sps.push(Math.sin(phases[c]));
    }
    for (let cy = 0; cy < gh; cy++) {
      for (let cx = 0; cx < gw; cx++) {
        const o = cy * gw + cx;
        let R = 0, G = 0, B = 0;
        for (let c = 0; c < nc; c++) {
          const f = comps[c];
          let b;
          if (cx < field.bxCell) {
            // 入射的平面波：cos(k(x − x_b) − ωt)
            const v = Math.cos(f.k * ((cx + 0.5) * CELL - g.bx) - phases[c]);
            // 白光的入射光：三色以較柔和的波峰疊在明亮的白色光束上
            b = nc > 1 ? 0.5 * Math.max(0, v) + 0.42 : 0.85 * Math.max(0, v) + 0.22;
          } else {
            const v = f.re[o] * cps[c] + f.im[o] * sps[c]; // Re(A e^(−iωt))
            b = 0.85 * Math.max(0, v) + 0.22 * f.avg[o];
          }
          if (b > 1) b = 1;
          R += cols[c][0] * b; G += cols[c][1] * b; B += cols[c][2] * b;
        }
        const p = o * 4;
        data[p] = R; data[p + 1] = G; data[p + 2] = B; data[p + 3] = 255; // Uint8ClampedArray 自動截在 255
      }
    }
    fieldCtx.putImageData(img, 0, 0);
    ctx.fillStyle = DARK.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fieldImg, 0, 0, gw * CELL, gh * CELL);
    if (nc > 1) beamDepth(g, H);

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
    label(state.white ? T('入射光：白光', 'Incident light: white') : T('入射光', 'Incident light') + '  λ = ' + state.lam + ' nm', 8, 8, DARK.label);
    ctx.textAlign = 'right';
    label(T('屏幕', 'Screen'), g.sx - 6, 8, DARK.label);
    ctx.textAlign = 'center';
    label(state.mode === 'single' ? T('單狹縫', 'Single slit') : state.mode === 'double' ? T('雙狹縫', 'Double slit') : T(slitCount() + ' 條狹縫', slitCount() + ' slits'), g.bx, H - 40, DARK.label);

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
    label(T('示意圖（未依比例）', 'Schematic (not to scale)'), 8, 26, DARK.dim);

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

  // 白光入射光束的立體感：光束上下緣漸暗、靠近擋板處有極淡的光暈（只在入射區域，波峰位置不變）
  function beamDepth(g, H) {
    const ctx = scene.ctx;
    const v = ctx.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, 'rgba(5, 8, 10, 0.55)');
    v.addColorStop(0.22, 'rgba(5, 8, 10, 0.08)');
    v.addColorStop(0.5, 'rgba(5, 8, 10, 0)');
    v.addColorStop(0.78, 'rgba(5, 8, 10, 0.08)');
    v.addColorStop(1, 'rgba(5, 8, 10, 0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, g.bx, H);
    const glow = ctx.createLinearGradient(g.bx - 26, 0, g.bx, 0);
    glow.addColorStop(0, 'rgba(255, 255, 255, 0)');
    glow.addColorStop(1, 'rgba(255, 255, 255, 0.14)');
    ctx.fillStyle = glow;
    ctx.fillRect(g.bx - 26, 0, 26, H);
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
    field.comps.forEach(function (c, i) { phases[i] = (phases[i] + c.k * v * dt) % (2 * Math.PI); });
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

    // ---- 取樣（參數改變時才重算；移動游標只重畫） ----
    const S = sampleCache(p, l, dpr, Y);
    const cols = S.cols, physPerCol = S.physPerCol, resolved = S.resolved;
    const avg = S.avg, mn = S.mn, mx = S.mx, mid = S.mid;
    $('densityHint').hidden = resolved;
    $('lgComp').hidden = !S.comp; // 白光的單色成分曲線只在條紋可分辨時畫出

    // ---- 屏幕（正面看）：亮度正比於 I（在線性亮度空間相乘，再轉回 sRGB） ----
    ctx.fillStyle = colors.muted;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(T('屏幕上看到的條紋', 'Fringes seen on the screen'), l.PL, l.ST - 11);
    const strip = S.strip;
    if (!S.stripDone) {
      const sctx = strip.getContext('2d');
      const simg = sctx.createImageData(cols, 1);
      for (let i = 0; i < cols; i++) {
        // 白光：各波長顏色加權相加後的線性 RGB；單色光：亮度正比於 I
        simg.data[i * 4] = SC.linearToSrgb(S.rgb ? S.rgb[i * 3] : lin[0] * avg[i]);
        simg.data[i * 4 + 1] = SC.linearToSrgb(S.rgb ? S.rgb[i * 3 + 1] : lin[1] * avg[i]);
        simg.data[i * 4 + 2] = SC.linearToSrgb(S.rgb ? S.rgb[i * 3 + 2] : lin[2] * avg[i]);
        simg.data[i * 4 + 3] = 255;
      }
      sctx.putImageData(simg, 0, 0);
      S.stripDone = true;
    }
    ctx.fillStyle = DARK.bg;
    ctx.fillRect(l.PL - 4, l.ST, l.PW + 8, l.SH);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(strip, l.PL, l.ST, l.PW, l.SH);
    ctx.imageSmoothingEnabled = true;
    if (state.white) stripDepth(l);
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
    ctx.fillText(T('y（mm）', 'y (mm)'), l.PL + l.PW, l.H - 1);
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
      if (state.white) spectralFill(S, l);
      else { ctx.fillStyle = rgba(col, 0.38); ctx.fill(); }
      // 白光：淡淡畫出三個單色成分各自的 I/I0
      if (S.comp) S.comp.forEach(function (c) {
        ctx.beginPath();
        for (let i = 0; i < cols; i++) { if (i) ctx.lineTo(xc(i), iy(c.v[i])); else ctx.moveTo(xc(i), iy(c.v[i])); }
        ctx.strokeStyle = rgba(c.rgb, 0.75);
        ctx.lineWidth = 1.1;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      });
      ctx.beginPath();
      for (let i = 0; i < cols; i++) { if (i) ctx.lineTo(xc(i), iy(mid[i])); else ctx.moveTo(xc(i), iy(mid[i])); }
      if (state.white) tubeStroke(1.8);
      else {
        ctx.strokeStyle = colors.field;
        ctx.lineWidth = 1.6;
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    } else {
      // 條紋太密：每一欄畫出該欄內強度的最小值到最大值
      ctx.beginPath();
      for (let i = 0; i < cols; i++) { if (i) ctx.lineTo(xc(i), iy(mx[i])); else ctx.moveTo(xc(i), iy(mx[i])); }
      for (let i = cols - 1; i >= 0; i--) ctx.lineTo(xc(i), iy(mn[i]));
      ctx.closePath();
      if (state.white) spectralFill(S, l);
      else { ctx.fillStyle = rgba(col, 0.55); ctx.fill(); }
      ctx.beginPath();
      for (let i = 0; i < cols; i++) { if (i) ctx.lineTo(xc(i), iy(mx[i])); else ctx.moveTo(xc(i), iy(mx[i])); }
      if (state.white) tubeStroke(1.2);
      else {
        ctx.strokeStyle = colors.field;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    // 單狹縫包絡線（虛線）
    if (state.showEnv && p.N > 1) {
      ctx.beginPath();
      for (let i = 0; i < cols; i += Math.max(1, Math.round(dpr))) {
        const ye = -Y + (i + 0.5) * physPerCol;
        const v = state.white ? SC.whiteEnvelope(p, ye, SPEC) : SC.envelope(p, ye);
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

  // ---------- 白光圖形的質感（只是疊在上面的裝飾，不改變任何位置與比例） ----------
  // 屏幕條紋的立體感：上下緣略暗（像被照亮的屏幕表面）、頂邊 1 px 高光、底邊 1 px 暗線。
  // 每一列都乘上同一個係數，所以沿 y 方向的相對亮度不變。
  function stripDepth(l) {
    const ctx = pat.ctx, x = l.PL - 4, w = l.PW + 8, y = l.ST, h = l.SH;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(0, 0, 0, 0.30)');
    g.addColorStop(0.3, 'rgba(0, 0, 0, 0)');
    g.addColorStop(0.62, 'rgba(0, 0, 0, 0)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0.38)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(x, y, w, 1);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(x, y + h - 1, w, 1);
  }

  // 強度曲線下方以該處的實際顏色（色度，亮度拉到最大）填色，往基線逐漸淡出，呈現光譜的層次。
  // 色度圖每組參數只算一次；淺色模式稍微壓暗，讓白色的中央亮紋在淺底上仍看得見。
  function hueImage(S, dark) {
    const f = dark ? 1 : 0.8;
    S.hue = S.hue || {};
    if (S.hue[f]) return S.hue[f];
    const cv = document.createElement('canvas');
    cv.width = S.cols; cv.height = 1;
    const c2 = cv.getContext('2d'), img = c2.createImageData(S.cols, 1);
    for (let i = 0; i < S.cols; i++) {
      // 填色只用來提示色調：在線性 RGB 中把彩度略為提高 1.5 倍（屏幕條紋本身仍是未加工的顏色）
      const r0 = S.rgb[i * 3], g0 = S.rgb[i * 3 + 1], b0 = S.rgb[i * 3 + 2], mean = (r0 + g0 + b0) / 3;
      const r = Math.max(0, mean + 1.5 * (r0 - mean)), g = Math.max(0, mean + 1.5 * (g0 - mean)), b = Math.max(0, mean + 1.5 * (b0 - mean));
      const m = Math.max(r, g, b);
      const k = m > 1e-6 ? f / m : 0;
      img.data[i * 4] = SC.linearToSrgb(m > 1e-6 ? r * k : 0.5 * f);
      img.data[i * 4 + 1] = SC.linearToSrgb(m > 1e-6 ? g * k : 0.5 * f);
      img.data[i * 4 + 2] = SC.linearToSrgb(m > 1e-6 ? b * k : 0.5 * f);
      img.data[i * 4 + 3] = 255;
    }
    c2.putImageData(img, 0, 0);
    return (S.hue[f] = cv);
  }
  // 以目前路徑為範圍（呼叫前已建立好封閉路徑）
  function spectralFill(S, l) {
    const ctx = pat.ctx, dark = darkCanvas(), bg = tokenRGB('canvas-bg');
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = dark ? 0.72 : 0.85;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(hueImage(S, dark), l.PL, l.GT, l.PW, l.GB - l.GT);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(0, l.GT, 0, l.GB);
    g.addColorStop(0, rgba(bg, 0));
    g.addColorStop(1, rgba(bg, dark ? 0.45 : 0.35));
    ctx.fillStyle = g;
    ctx.fillRect(l.PL, l.GT, l.PW, l.GB - l.GT);
    ctx.restore();
  }
  // 總光強曲線畫成兩層（底層背景色描邊把曲線與填色、成分曲線隔開；深色模式另加極淡光暈），沿用目前路徑
  function tubeStroke(w) {
    const ctx = pat.ctx, dark = darkCanvas(), fc = tokenRGB('field');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (dark) { ctx.strokeStyle = rgba(fc, 0.16); ctx.lineWidth = w + 5; ctx.stroke(); }
    ctx.strokeStyle = rgba(tokenRGB('canvas-bg'), 0.85);
    ctx.lineWidth = w + 2.4;
    ctx.stroke();
    ctx.strokeStyle = colors.field;
    ctx.lineWidth = w;
    ctx.stroke();
  }

  // 取樣：每個裝置像素一欄（白光最多 1.5 倍 CSS 像素，以免計算太久）；
  // 條紋比像素細時，在欄內多點取樣求平均與最大、最小值
  let sCache = null;
  function sampleCache(p, l, dpr, Y) {
    const white = state.white;
    const cols = Math.max(2, Math.round(l.PW * (white ? Math.min(dpr, 1.5) : dpr)));
    const key = [white, p.N, p.a, p.d, p.lambda, p.L, Y, cols, l.PW].join('|');
    if (sCache && sCache.key === key) return sCache;
    const physPerCol = 2 * Y / cols;
    const lamMin = white ? SPEC.lambda[0] : p.lambda; // 白光最細的條紋由最短波長決定
    const feature = p.N === 1 ? lamMin * p.L / p.a : lamMin * p.L / (p.N * p.d);
    const K = Math.max(1, Math.min(white ? 16 : 64, Math.ceil(6 * physPerCol / feature)));
    const resolved = feature / (2 * Y / l.PW) >= 4; // 最細的特徵至少 4 個 CSS 像素
    const avg = new Float32Array(cols), mn = new Float32Array(cols), mx = new Float32Array(cols), mid = new Float32Array(cols);
    const rgb = white ? new Float32Array(cols * 3) : null;
    const w = [0, 0, 0, 0];
    for (let i = 0; i < cols; i++) {
      const y0 = -Y + i * physPerCol;
      let s = 0, lo = Infinity, hi = -Infinity, R = 0, G = 0, B = 0;
      for (let j = 0; j < K; j++) {
        const yy = y0 + (j + 0.5) * physPerCol / K;
        let v;
        if (white) { SC.whiteAt(p, yy, SPEC, w); v = w[0]; R += w[1]; G += w[2]; B += w[3]; }
        else v = SC.intensity(p, yy);
        s += v; if (v < lo) lo = v; if (v > hi) hi = v;
      }
      avg[i] = s / K; mn[i] = lo; mx[i] = hi;
      if (white) { rgb[i * 3] = R / K; rgb[i * 3 + 1] = G / K; rgb[i * 3 + 2] = B / K; }
      mid[i] = K === 1 ? s : Itot(p, y0 + 0.5 * physPerCol);
    }
    let comp = null;
    if (white && resolved) {
      comp = [450, 550, 650].map(function (nm) {
        const q = withLam(p, nm), v = new Float32Array(cols);
        for (let i = 0; i < cols; i++) v[i] = SC.intensity(q, -Y + (i + 0.5) * physPerCol);
        return { v: v, rgb: SC.wavelengthToRGB(nm) };
      });
    }
    const strip = document.createElement('canvas');
    strip.width = cols; strip.height = 1;
    sCache = { key: key, cols: cols, physPerCol: physPerCol, resolved: resolved, avg: avg, mn: mn, mx: mx, mid: mid,
      rgb: rgb, comp: comp, strip: strip, stripDone: false };
    return sCache;
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
      title = T('暗紋 m', 'min m');
      marks = SC.singleSlitDarks(p).filter(function (o) { return Math.abs(o.y) <= Y; });
    } else {
      title = T('亮紋 m', 'max m');
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
      ctx.fillText(T('點擊或拖曳讀取數值', 'Click or drag to read values'), l.PL + l.PW - 4, l.GT + 2);
      return;
    }
    const y = state.cursorY;
    if (Math.abs(y) > halfRange()) return;
    const ctx = pat.ctx, l = layout;
    const x = yToX(y);
    const I = Itot(p, y);
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
    if (state.white) {
      // 白光沒有單一波長：程差以長度表示
      $('cPd').textContent = fmtLen(p.d * s);
      $('cPa').textContent = fmtLen(p.a * s);
      $('cI').textContent = Itot(p, y).toFixed(3) + T('（各色總和）', ' (all colours)');
    } else {
      $('cPd').textContent = (p.d * s / p.lambda).toFixed(2).replace('-', '−') + ' λ';
      $('cPa').textContent = (p.a * s / p.lambda).toFixed(2).replace('-', '−') + ' λ';
      $('cI').textContent = SC.intensity(p, y).toFixed(3);
    }
  }

  // ---------- 條紋特徵讀數 ----------
  // 白光：與波長有關的量列出 400 nm 與 700 nm 的值，例如「3.33–5.83 mm」
  function fmtRange(v1, v2) {
    if (!isFinite(v1) || !isFinite(v2)) return '—';
    const m = Math.max(Math.abs(v1), Math.abs(v2));
    const u = m < 0.01 * MM ? [UM, ' μm'] : m < 1 ? [MM, ' mm'] : [1, ' m'];
    return num(v1 / u[0]) + '–' + num(v2 / u[0]) + u[1];
  }
  function lenOf(p, fn) {
    if (!state.white) return fmtLen(fn(p));
    return fmtRange(fn(withLam(p, WL_LO)), fn(withLam(p, WL_HI)));
  }
  function updateReadout() {
    const p = params();
    ['rW', 'rWx', 'rWs', 'rDy', 'rY1'].forEach(function (id) { $(id).classList.toggle('nw', state.white); });
    $('rW').textContent = lenOf(p, SC.centralWidth);
    const wx = SC.centralWidthExact(state.white ? withLam(p, WL_HI) : p);
    $('rWx').textContent = isFinite(wx) ? lenOf(p, SC.centralWidthExact) : T('沒有暗紋（a ≤ λ）', 'no dark fringes (a ≤ λ)');
    $('rWs').textContent = lenOf(p, function (q) { return q.lambda * q.L / q.a; });
    if (p.N > 1) {
      $('rDy').textContent = lenOf(p, SC.fringeSpacing);
      const s1 = (state.white ? WL_HI * NM : p.lambda) / p.d;
      $('rY1').textContent = s1 < 1 ? lenOf(p, function (q) { return SC.yFromSin(q.lambda / q.d, q.L); }) : '—';
      const k = SC.missingOrderStep(p.d, p.a);
      $('rRatio').textContent = k ? String(k) + T('（整數）', ' (integer)') : (p.d / p.a).toFixed(2);
      const nc = SC.fringesInCentral(p);
      $('rCount').textContent = T(nc + ' 條', String(nc));
      const miss = $('rMissing');
      if (k) {
        const list = [];
        for (let m = k; m * p.lambda < p.d && list.length < 3; m += k) list.push('±' + m);
        miss.textContent = list.length ? T(list.join('、') + (list.length === 3 ? '… 級' : ' 級'), list.join(', ') + (list.length === 3 ? ', …' : '')) : '—';
        miss.classList.add('flag');
      } else {
        miss.textContent = T('無（d/a 不是整數）', 'none (d/a is not an integer)');
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
      v + ' nm <span class="sub">' + T('（' + SC.colorName(v) + '）', '(' + COLOR_EN[SC.colorName(v)] + ')') + '</span>';
  }
  const sLam = bindSlider('lam', lamLabel, function (v) { state.lam = v; invalidateScene(); }, true);
  const sA = bindSlider('a', function (v) { return v + ' μm'; }, function (v) {
    state.a = v;
    if (state.mode !== 'single' && state.d <= v) {
      state.d = Math.min(400, v + 1); sD.set(state.d);
      setStatus(T('縫距 d 必須大於縫寬 a，已自動加大 d。', 'The slit separation d must be larger than the slit width a, so d has been increased.'));
    } else setStatus('');
    invalidateScene();
  });
  const sD = bindSlider('d', function (v) { return v + ' μm'; }, function (v) {
    state.d = v;
    if (state.a >= v) {
      state.a = Math.max(5, v - 1); sA.set(state.a);
      if (state.d <= state.a) { state.d = state.a + 1; sD.set(state.d); }
      setStatus(T('縫寬 a 必須小於縫距 d，已自動縮小 a。', 'The slit width a must be smaller than the slit separation d, so a has been reduced.'));
    } else setStatus('');
    invalidateScene();
  });
  bindSlider('L', function (v) { return v.toFixed(2) + ' m'; }, function (v) { state.L = v; requestDraw(); });
  bindSlider('N', function (v) { return T(v + ' 條', String(v)); }, function (v) { state.N = v; invalidateScene(); });
  const sZoom = bindSlider('zoom', function (v) { return fmtZoom(ZOOMS[v]); }, function (v) { state.zoom = v; requestDraw(); });
  function setStatus(t) { $('status').textContent = t; }

  document.querySelectorAll('[data-lam]').forEach(function (btn) {
    btn.addEventListener('click', function () { state.lam = +btn.dataset.lam; sLam.set(state.lam); invalidateScene(); });
  });

  $('autoZoom').addEventListener('click', function () {
    const p = state.white ? withLam(params(), WL_HI) : params();
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

  function setSource(src) {
    state.white = src === 'white';
    document.querySelectorAll('[data-src]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.src === src)); });
    $('monoRows').hidden = state.white;
    $('whiteRows').hidden = !state.white;
    $('whiteNote').hidden = !state.white;
    invalidateScene();
  }
  document.querySelectorAll('[data-src]').forEach(function (b) {
    b.addEventListener('click', function () { setSource(b.dataset.src); });
  });

  $('showEnv').addEventListener('change', function (ev) { state.showEnv = ev.target.checked; requestDraw(); });
  $('showOrders').addEventListener('change', function (ev) { state.showOrders = ev.target.checked; requestDraw(); });

  function syncAnimButton() { $('anim').textContent = state.anim ? T('暫停動畫', 'Pause animation') : T('播放動畫', 'Play animation'); }
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
    document.querySelectorAll('.spectrum').forEach(function (e) { e.style.background = 'linear-gradient(90deg,' + stops.join(',') + ')'; });
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
