/* slit-interference.js — 「雙狹縫干涉與單狹縫繞射」模組的畫面與互動（物理計算在 slit-interference-core.js） */
(function () {
  'use strict';
  const SC = window.SlitCore;
  const LD = window.LabDraw; // js/drawkit.js：共用的立體球、方塊、標籤、背景
  const $ =function (id) { return document.getElementById(id); };
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
    zoom: 30,        // 屏幕顯示範圍 ±Y（mm）：滑桿為 ZOOMS 的索引，也可直接輸入任意值
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
  function halfRange() { return state.zoom * MM; }

  // ---------- 顏色 ----------
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--field', '--equi', '--grid', '--probe', '--surface', '--border', '--accent']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    Object.keys(DARK_TOKENS).forEach(function (k) { DARK[k] = cs.getPropertyValue(DARK_TOKENS[k][0]).trim() || DARK_TOKENS[k][1]; });
    overlay = null;
  }
  // 暗室（示意圖與屏幕）在淺色、深色模式下都是暗的：顏色來自本頁 <style> 的 --si-* 代號（兩種模式都有定義）
  const DARK = {};
  const DARK_TOKENS = { bg: ['--si-room', '#05080a'], label: ['--si-ink', 'rgba(232, 238, 240, 0.92)'], dim: ['--si-ink-dim', 'rgba(200, 212, 216, 0.74)'],
    plate: ['--si-plate', '#76838a'], plateHi: ['--si-plate-hi', '#b9c4c8'], plateLo: ['--si-plate-lo', '#2e373b'],
    screen: ['--si-screen', '#cfd6d9'], pill: ['--si-pill', 'rgba(8, 12, 14, 0.74)'], shadow: ['--si-shadow', 'rgba(20, 32, 38, 0.22)'] };

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
  function fmtZoom(mm) { return mm >= 100 ? '±' + trimNum(mm / 10, 2) + ' cm' : '±' + trimNum(mm, 1) + ' mm'; }
  /** 顯示到 dec 位小數，去掉多餘的 0（打字輸入的值可以比滑桿細） */
  function trimNum(v, dec) { let t = v.toFixed(dec); if (dec > 0) t = t.replace(/\.?0+$/, ''); return t; }

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
    fieldSerial++;
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

    // 波場影像（每一幀只重算這一層；擋板、屏幕、標示等不變的部分在 sceneOverlay 預先畫好）
    // 色調對應只改變亮度的呈現方式（單調函數），波峰位置與 Re(A e^(−iωt)) 完全相同：
    //   亮度 = 0.2·|A|²（時間平均，看得出干涉的亮帶）＋ 柔和的波峰；單色光最亮的波峰中心略偏白，像發光的光帶
    const img = field.img, data = img.data, gw = field.gw, gh = field.gh;
    const comps = field.comps, nc = comps.length, mono = nc === 1;
    const cols = [], cps = [], sps = [];
    for (let c = 0; c < nc; c++) {
      const col = comps[c].col || waveRGB();
      cols.push([col[0] * comps[c].scale, col[1] * comps[c].scale, col[2] * comps[c].scale]);
      cps.push(Math.cos(phases[c])); sps.push(Math.sin(phases[c]));
    }
    const hot = mono ? [(255 - cols[0][0]) * 0.42, (255 - cols[0][1]) * 0.42, (255 - cols[0][2]) * 0.42] : null;
    for (let cy = 0; cy < gh; cy++) {
      for (let cx = 0; cx < gw; cx++) {
        const o = cy * gw + cx;
        let R = 0, G = 0, B = 0, core = 0;
        for (let c = 0; c < nc; c++) {
          const f = comps[c];
          let b, cr;
          if (cx < field.bxCell) {
            // 入射的平面波：cos(k(x − x_b) − ωt)
            const v = Math.cos(f.k * ((cx + 0.5) * CELL - g.bx) - phases[c]);
            cr = v > 0 ? v : 0;
            // 白光的入射光：三色以較柔和的波峰疊在明亮的白色光束上
            b = mono ? 0.2 + 0.68 * cr * (1.5 - 0.5 * cr) : 0.5 * cr + 0.42;
          } else {
            const v = f.re[o] * cps[c] + f.im[o] * sps[c]; // Re(A e^(−iωt))
            cr = v > 0 ? (v < 1 ? v : 1) : 0;
            b = 0.2 * f.avg[o] + 0.8 * cr * (1.5 - 0.5 * cr);
          }
          if (b > 1) b = 1;
          if (mono && cr > 0.72) core = (cr - 0.72) * 3.57;
          R += cols[c][0] * b; G += cols[c][1] * b; B += cols[c][2] * b;
        }
        if (core > 0) { R += hot[0] * core; G += hot[1] * core; B += hot[2] * core; }
        const p = o * 4;
        data[p] = R; data[p + 1] = G; data[p + 2] = B; data[p + 3] = 255; // Uint8ClampedArray 自動截在 255
      }
    }
    fieldCtx.putImageData(img, 0, 0);
    ctx.fillStyle = DARK.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fieldImg, 0, 0, gw * CELL, gh * CELL);
    ctx.drawImage(sceneOverlay(), 0, 0, W, H);
  }

  // ---------- 示意圖中不變的圖層（擋板、屏幕、光暈、標示），參數或尺寸改變時才重畫 ----------
  let overlay = null, fieldSerial = 0;
  function sceneOverlay() {
    const key = fieldSerial + '|' + state.L + '|' + scene.cv.width + 'x' + scene.cv.height;
    if (overlay && overlay.key === key) return overlay.cv;
    const cv = overlay ? overlay.cv : document.createElement('canvas');
    cv.width = scene.cv.width; cv.height = scene.cv.height;
    const ctx = cv.getContext('2d');
    ctx.setTransform(scene.dpr, 0, 0, scene.dpr, 0, 0);
    ctx.clearRect(0, 0, scene.w, scene.h);
    drawSceneDecor(ctx);
    overlay = { key: key, cv: cv };
    return cv;
  }

  /** 光的顏色（亮度拉到最大，只用來做光暈與邊緣反光） */
  function lightTint() {
    if (state.white) return [255, 255, 255];
    const c = waveRGB(), m = Math.max(c[0], c[1], c[2]) || 1;
    return c.map(function (v) { return Math.round(v * 255 / m); });
  }

  function drawSceneDecor(ctx) {
    const g = field.g, W = g.W, H = g.H, s = H / 400;
    const tint = lightTint();
    beamDepth(ctx, g, H, tint);

    // 暗室的暈影：四角略暗，畫面有景深
    const vg = ctx.createRadialGradient(W * 0.55, H / 2, Math.min(W, H) * 0.3, W * 0.55, H / 2, Math.hypot(W, H) * 0.62);
    vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vg.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // ---- 擋板與狹縫：有厚度的拉絲金屬板（狹縫開口的位置與寬度不變，只畫在開口以外） ----
    const bw = Math.max(7, Math.round(10 * s)), x0 = g.bx - bw / 2;
    const segs = [];
    let top = 0;
    field.slits.forEach(function (c) {
      const y0 = c - g.aPx / 2, y1 = c + g.aPx / 2;
      if (y0 > top) segs.push([top, y0]);
      top = y1;
    });
    if (top < H) segs.push([top, H]);
    // 板的上表面：迎光的左緣最亮，往背光的右緣漸暗（圓角倒邊的金屬感）
    const body = ctx.createLinearGradient(x0, 0, x0 + bw, 0);
    body.addColorStop(0, DARK.plateHi);
    body.addColorStop(0.16, LD.mix(DARK.plateHi, DARK.plate, 0.45));
    body.addColorStop(0.5, DARK.plate);
    body.addColorStop(0.82, LD.mix(DARK.plate, DARK.plateLo, 0.65));
    body.addColorStop(1, DARK.plateLo);
    const cast = ctx.createLinearGradient(x0 + bw, 0, x0 + bw + 9, 0);
    cast.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    cast.addColorStop(1, 'rgba(0, 0, 0, 0)');
    // 拉絲紋：沿板長方向的細紋，亮暗交錯（固定的擬亂數，每次重畫都一樣）
    const brush = [];
    for (let k = 1.2; k < bw - 1; k += 1.1) {
      const r = Math.abs(Math.sin(k * 12.9898 + bw * 4.1) * 43758.5453) % 1;
      brush.push([k, r < 0.5 ? 'rgba(255, 255, 255,' + (0.04 + 0.1 * r).toFixed(3) + ')' : 'rgba(0, 0, 0,' + (0.04 + 0.12 * (r - 0.5)).toFixed(3) + ')']);
    }
    segs.forEach(function (sg, si) {
      const y0 = sg[0], y1 = sg[1], h = y1 - y0;
      if (h < 0.3) return;
      // 投影只往右（波的那一側）水平延伸，不會遮到狹縫開口
      ctx.fillStyle = cast;
      ctx.fillRect(x0 + bw, y0, 9, h);
      ctx.save();
      roundRect(ctx, x0, y0, bw, h, Math.min(2, h / 2));
      ctx.fillStyle = body;
      ctx.fill();
      ctx.clip();
      brush.forEach(function (b) { ctx.fillStyle = b[1]; ctx.fillRect(x0 + b[0], y0, 0.6, h); });
      ctx.restore();
      // 外緣細暗線讓板子輪廓清楚
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.lineWidth = 1;
      roundRect(ctx, x0 + 0.5, y0 + 0.5, bw - 1, Math.max(0, h - 1), Math.min(1.5, h / 2));
      ctx.stroke();
      // 迎光面（左緣）被入射光照亮；狹縫的上下切面（刀口）閃著光、帶一道倒角高光
      ctx.fillStyle = rgba(tint, 0.6);
      ctx.fillRect(x0, y0 + 1, 1.2, Math.max(0, h - 2));
      if (y0 > 0) {
        ctx.fillStyle = rgba(tint, 0.75); ctx.fillRect(x0 + 1, y0, bw - 2, 1);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)'; ctx.fillRect(x0 + 1, y0 + 1, bw - 3, 1);
      }
      if (y1 < H) {
        ctx.fillStyle = rgba(tint, 0.5); ctx.fillRect(x0 + 1, y1 - 1, bw - 2, 1);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'; ctx.fillRect(x0 + 1, y1 - 2, bw - 3, 1);
      }
      // 最上與最下兩段有固定螺絲（只是裝飾）
      if ((si === 0 || si === segs.length - 1) && h > 26 && bw >= 7) {
        const e = h > 40 * s ? 12 * s : h / 2;
        const cy = si === 0 ? y0 + e : y1 - e;
        screw(ctx, g.bx, cy, Math.max(2, bw * 0.3));
      }
    });

    // ---- 屏幕：有厚度的霧面白板；被照亮的位置顯示波場的時間平均亮度 ----
    const sx = g.sx, sw = Math.max(6, Math.round(9 * s));
    ctx.fillStyle = DARK.bg;
    ctx.fillRect(sx + 3, 0, W - sx - 3, H); // 屏幕後方沒有光
    const sb = ctx.createLinearGradient(sx, 0, sx + sw, 0);
    sb.addColorStop(0, DARK.screen);
    sb.addColorStop(0.3, LD.mix(DARK.screen, DARK.plateLo, 0.35));
    sb.addColorStop(1, DARK.plateLo);
    ctx.fillStyle = sb;
    ctx.fillRect(sx, 0, sw, H);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(sx + sw - 1, 0, 1, H); // 背面的邊
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(sx + 3, 0, 1, H);      // 白板側面的稜線
    const lit = screenLight(sx);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.92;
    ctx.drawImage(lit, sx, 0, 3, field.gh * CELL);
    ctx.globalCompositeOperation = 'lighter';
    [[3, 0.22], [6, 0.1], [10, 0.05]].forEach(function (q) {
      ctx.globalAlpha = q[1];
      ctx.drawImage(lit, sx - q[0], 0, q[0], field.gh * CELL);
    });
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(sx, 0, 1, H);

    // ---- 標示：一律放在半透明圓角底框上 ----
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.font = '12px system-ui, sans-serif';
    const inc = state.white ? T('入射光：白光', 'Incident light: white') : T('入射光', 'Incident light') + '  λ = ' + state.lam + ' nm';
    const r1 = pill(ctx, inc, 8, 8, 'left', { dot: state.white ? [244, 246, 248] : waveRGB() });
    ctx.font = '11px system-ui, sans-serif';
    pill(ctx, T('示意圖（未依比例）', 'Schematic (not to scale)'), 8, r1.y + r1.h + 4, 'left', { dim: true });
    ctx.font = '12px system-ui, sans-serif';
    pill(ctx, T('屏幕', 'Screen'), sx - 6, 8, 'right');

    // 尺寸：單狹縫標 a；多狹縫標正中央一對狹縫的 d（中心到中心），遠離上方的標示
    const bxL = x0 - 9;
    if (g.N === 1) {
      bracket(ctx, bxL, x0 - 1, g.cy - g.aPx / 2, g.cy + g.aPx / 2, 'a');
    } else {
      const i0 = Math.max(0, Math.floor((g.N - 2) / 2));
      bracket(ctx, bxL, x0 - 1, field.slits[i0], field.slits[i0 + 1], 'd');
    }

    const name = state.mode === 'single' ? T('單狹縫', 'Single slit') : state.mode === 'double' ? T('雙狹縫', 'Double slit') : T(slitCount() + ' 條狹縫', slitCount() + ' slits');
    const ly = H - 15;
    const rn = measurePill(ctx, name);
    pill(ctx, name, g.bx, ly - 12 - rn.h, 'center');

    // 屏幕距離 L
    const xa = x0 + bw + 3, xb = sx - 3;
    ctx.beginPath();
    ctx.moveTo(xa + 5, ly); ctx.lineTo(xb - 5, ly);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = DARK.label;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    arrowHead(ctx, xa, ly, -1); arrowHead(ctx, xb, ly, 1);
    pill(ctx, 'L = ' + state.L.toFixed(2) + ' m', (g.bx + sx) / 2, ly - rn.h / 2, 'center');
  }

  /** 屏幕上被照亮的亮度：取屏幕前一格的 |A|²（各成分顏色相加），1 × gh 的小圖 */
  function screenLight(sx) {
    const gh = field.gh, gw = field.gw, cx = Math.min(gw - 1, Math.max(0, Math.floor((sx - 1) / CELL)));
    const cv = document.createElement('canvas');
    cv.width = 1; cv.height = gh;
    const c2 = cv.getContext('2d'), im = c2.createImageData(1, gh);
    for (let cy = 0; cy < gh; cy++) {
      let R = 0, G = 0, B = 0;
      field.comps.forEach(function (f) {
        const col = f.col || waveRGB(), a = Math.min(1, 1.25 * f.avg[cy * gw + cx]) * f.scale * (f.col ? 1.3 : 1);
        R += col[0] * a; G += col[1] * a; B += col[2] * a;
      });
      im.data[cy * 4] = R; im.data[cy * 4 + 1] = G; im.data[cy * 4 + 2] = B; im.data[cy * 4 + 3] = 255;
    }
    c2.putImageData(im, 0, 0);
    return cv;
  }

  // ---------- 共用的繪圖小工具 ----------
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function textBox(ctx, t) {
    const m = ctx.measureText(t);
    const asc = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || 9;
    const desc = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent || 3;
    return { w: m.width, asc: asc, desc: desc };
  }
  function measurePill(ctx, t, dot) {
    const b = textBox(ctx, t), h = Math.round(b.asc + b.desc + 6);
    return { w: Math.round(b.w + 14 + (dot ? h - 4 : 0)), h: h, b: b };
  }
  /** 示意圖（暗室）上的標籤：半透明深色圓角底框＋細亮邊；y 為底框上緣 */
  function pill(ctx, t, x, y, align, o) {
    o = o || {};
    const m = measurePill(ctx, t, o.dot), w = m.w, h = m.h;
    const left = Math.round(align === 'right' ? x - w : align === 'center' ? x - w / 2 : x), top = Math.round(y);
    roundRect(ctx, left + 0.5, top + 0.5, w - 1, h - 1, h / 2);
    ctx.fillStyle = DARK.pill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
    let tx = left + 7;
    if (o.dot) {
      // 光的顏色小圓點（球形光澤）
      const r = (h - 10) / 2, cx = tx + r, cy = top + h / 2;
      const gr = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
      gr.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      gr.addColorStop(0.35, rgba(o.dot, 1));
      gr.addColorStop(1, rgba(o.dot.map(function (v) { return Math.round(v * 0.55); }), 1));
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = gr;
      ctx.fill();
      tx += h - 4;
    }
    ctx.fillStyle = o.dim ? DARK.dim : DARK.label;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(t, tx, top + 3 + m.b.asc);
    return { x: left, y: top, w: w, h: h };
  }
  // 略帶弧度的三角形箭頭（箭頭長度約為線寬的 4–5 倍）
  function arrowHead(ctx, x, y, dir) {
    const len = 7, half = 3.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - dir * len * 0.55, y - half * 0.55, x - dir * len, y - half);
    ctx.lineTo(x - dir * len * 0.78, y);
    ctx.lineTo(x - dir * len, y + half);
    ctx.quadraticCurveTo(x - dir * len * 0.55, y + half * 0.55, x, y);
    ctx.closePath();
    ctx.fillStyle = DARK.label;
    ctx.fill();
  }
  /** 尺寸括號：x 為括號線，xe 為擋板迎光面（短線指向狹縫中心或邊緣） */
  function bracket(ctx, x, xe, y1, y2, t) {
    ctx.beginPath();
    ctx.moveTo(xe, y1); ctx.lineTo(x, y1); ctx.lineTo(x, y2); ctx.lineTo(xe, y2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = DARK.label;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.font = 'italic 14px "Times New Roman", serif';
    const m = measurePill(ctx, t);
    pill(ctx, t, x - 3, (y1 + y2) / 2 - m.h / 2, 'right');
    ctx.font = '12px system-ui, sans-serif';
  }

  /** 一字螺絲頭（金屬圓頭＋刻槽），只是裝飾 */
  function screw(ctx, x, y, r) {
    const gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    gr.addColorStop(0, DARK.plateHi);
    gr.addColorStop(0.55, DARK.plate);
    gr.addColorStop(1, DARK.plateLo);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = gr;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r * 0.62, y + r * 0.3); ctx.lineTo(x + r * 0.62, y - r * 0.3);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = Math.max(0.7, r * 0.32);
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // 入射光束的立體感：光束上下緣漸暗、靠近擋板處有極淡的光暈（只在入射區域，波峰位置不變）
  function beamDepth(ctx, g, H, tint) {
    const v = ctx.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, 'rgba(5, 8, 10, 0.55)');
    v.addColorStop(0.22, 'rgba(5, 8, 10, 0.08)');
    v.addColorStop(0.5, 'rgba(5, 8, 10, 0)');
    v.addColorStop(0.78, 'rgba(5, 8, 10, 0.08)');
    v.addColorStop(1, 'rgba(5, 8, 10, 0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, g.bx, H);
    const glow = ctx.createLinearGradient(g.bx - 26, 0, g.bx, 0);
    glow.addColorStop(0, rgba(tint, 0));
    glow.addColorStop(1, rgba(tint, 0.14));
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
  function orderTitle(N) { return N === 1 ? T('暗紋 m', 'min m') : T('亮紋 m', 'max m'); }
  function patternLayout() {
    const W = pat.w, H = pat.h;
    // 左邊界至少容納級數標題與刻度數字（字體放大或英文較長時自動加寬，只影響版面，不影響數值）
    const ctx = pat.ctx;
    ctx.font = '11px system-ui, sans-serif';
    const need = Math.max(ctx.measureText(orderTitle(slitCount())).width + 7, ctx.measureText('0.5').width + 22);
    const PL = Math.max(42, Math.ceil(need)), PR = 14;
    const ST = 27; // 屏幕外框（BZ）與標題的空間
    const SH = Math.max(34, Math.min(64, Math.round(H * 0.17)));
    const GT = ST + SH + 30;
    const GB = H - 34;
    return { W: W, H: H, PL: PL, PR: PR, PW: W - PL - PR, ST: ST, SH: SH, GT: GT, GB: GB, BZ: 4 };
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
    const dark = darkCanvas();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(ctx, l.W, l.H); // 底色＋極淡的暈影（中央略亮、四角略暗）

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
    ctx.fillText(T('屏幕上看到的條紋', 'Fringes seen on the screen'), l.PL, l.ST - l.BZ - 9);
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
    const fx = l.PL - 4, fw = l.PW + 8;
    if (dark) {
      // 深色模式：亮紋的光微微溢出屏幕外框（同一張條紋圖拉高後淡出，水平位置完全相同）
      ctx.globalAlpha = 0.5;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(stripGlow(S), l.PL, l.ST - l.BZ - 9, l.PW, l.SH + 2 * l.BZ + 18);
      ctx.globalAlpha = 1;
    }
    screenFrame(l, fx, fw, dark);
    // 屏幕表面（霧面、略凹進外框）：條紋圖原封不動貼上，亮度正比於 I
    ctx.save();
    roundRect(ctx, fx, l.ST, fw, l.SH, 3);
    ctx.fillStyle = DARK.bg;
    ctx.fill();
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(strip, l.PL, l.ST, l.PW, l.SH);
    ctx.imageSmoothingEnabled = true;
    stripDepth(l);
    ctx.restore();

    // ---- 級數標示（條紋與強度圖之間） ----
    const rowY = l.ST + l.SH + l.BZ + 13;
    if (state.showOrders) drawOrderLabels(p, rowY);

    // ---- 強度圖座標格（線寬 1 個裝置像素，對齊像素中心） ----
    const gh = l.GB - l.GT;
    const iy = function (v) { return l.GB - v * gh; };
    const snap = function (v) { return (Math.floor(v * dpr) + 0.5) / dpr; };
    const gcol = tokenRGB('grid'), hair = 1 / dpr;
    const step = niceStep(2 * Y / MM, Math.max(3, Math.floor(l.PW / 64)));
    const lead = Math.round(step / Math.pow(10, Math.floor(Math.log10(step) + 1e-9)));
    const minor = step / (lead === 2 ? 4 : 5);
    const gridLines = function (alpha, xs, ys) {
      ctx.beginPath();
      xs.forEach(function (x) { const sx = snap(x); ctx.moveTo(sx, l.GT); ctx.lineTo(sx, l.GB); });
      ys.forEach(function (y) { const sy = snap(y); ctx.moveTo(l.PL, sy); ctx.lineTo(l.PL + l.PW, sy); });
      ctx.strokeStyle = rgba(gcol, alpha);
      ctx.lineWidth = hair;
      ctx.stroke();
    };
    const majX = [], minX = [];
    for (let t = Math.ceil(-Y / MM / step) * step; t <= Y / MM + 1e-9; t += step) majX.push(yToX(t * MM));
    if (minor / (2 * Y / MM) * l.PW >= 7) {
      for (let t = Math.ceil(-Y / MM / minor) * minor; t <= Y / MM + 1e-9; t += minor) {
        if (Math.abs(t / step - Math.round(t / step)) > 1e-6) minX.push(yToX(t * MM));
      }
    }
    const minY = [], majY = [iy(0.5), iy(1)];
    for (let k = 1; k < 10; k++) if (k !== 5) minY.push(iy(k / 10));
    gridLines(dark ? 0.06 : 0.07, minX, minY);
    gridLines(dark ? 0.13 : 0.15, majX, majY);
    // 座標軸與刻度
    ctx.beginPath();
    const bx0 = snap(l.GB);
    ctx.moveTo(l.PL, bx0); ctx.lineTo(l.PL + l.PW, bx0);
    majX.forEach(function (x) { const sx = snap(x); ctx.moveTo(sx, bx0); ctx.lineTo(sx, bx0 + 4); });
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = Math.max(1, Math.round(dpr)) / dpr;
    ctx.stroke();
    ctx.fillStyle = colors.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    [0, 0.5, 1].forEach(function (v) { ctx.fillText(String(v), l.PL - 6, iy(v)); });
    ctx.save();
    ctx.translate(11, iy(0.75));
    ctx.rotate(-Math.PI / 2);
    richText(ctx, [['I/I', 0], ['0', 1]], 0, 0, 'center');
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let t = Math.ceil(-Y / MM / step) * step; t <= Y / MM + 1e-9; t += step) {
      const v = Math.abs(t) < 1e-9 ? 0 : t;
      ctx.fillText(num(v, 4), yToX(v * MM), l.GB + 6);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(T('y（mm）', 'y (mm)'), l.PL + l.PW, l.H - 1);

    // ---- 強度曲線 ----
    const xc = function (i) { return l.PL + (i + 0.5) / cols * l.PW; };
    ctx.save();
    ctx.beginPath();
    ctx.rect(l.PL, l.GT - 6, l.PW, gh + 6);
    ctx.clip();
    if (resolved) {
      ctx.beginPath();
      ctx.moveTo(xc(0), l.GB);
      for (let i = 0; i < cols; i++) ctx.lineTo(xc(i), iy(mid[i]));
      ctx.lineTo(xc(cols - 1), l.GB);
      ctx.closePath();
      if (state.white) spectralFill(S, l);
      else monoFill(col, l);
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
      tubeStroke(state.white ? 1.8 : 1.7);
    } else {
      // 條紋太密：每一欄畫出該欄內強度的最小值到最大值
      ctx.beginPath();
      for (let i = 0; i < cols; i++) { if (i) ctx.lineTo(xc(i), iy(mx[i])); else ctx.moveTo(xc(i), iy(mx[i])); }
      for (let i = cols - 1; i >= 0; i--) ctx.lineTo(xc(i), iy(mn[i]));
      ctx.closePath();
      if (state.white) spectralFill(S, l);
      else monoFill(col, l);
      ctx.beginPath();
      for (let i = 0; i < cols; i++) { if (i) ctx.lineTo(xc(i), iy(mx[i])); else ctx.moveTo(xc(i), iy(mx[i])); }
      tubeStroke(1.2);
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
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = colors.muted;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    drawCursor(p);
    drawKeyFocus();
    updateCursorReadout(p);
  }

  // 焦點框只在用鍵盤操作時顯示（滑鼠點擊畫布也會讓它取得焦點，那時不畫）
  let keyMode = false;
  document.addEventListener('keydown', function () { keyMode = true; }, true);
  document.addEventListener('pointerdown', function () { keyMode = false; }, true);
  function keyFocusVisible() { return keyMode; }
  /** 鍵盤焦點框：用鍵盤操作游標時，在游標（尚未放置時為整個圖）周圍畫 --accent 色虛線圓角框 */
  function drawKeyFocus() {
    if (!kb || !kb.focused() || kb.index() !== 0 || !keyFocusVisible(pat.cv)) return;
    const ctx = pat.ctx, l = layout;
    let x, w, y = l.ST - l.BZ - 6, h = l.GB - y + 4;
    if (state.cursorY === null || Math.abs(state.cursorY) > halfRange()) { x = l.PL - l.BZ - 6; w = l.PW + 2 * l.BZ + 12; }
    else { const cx = yToX(state.cursorY); x = cx - 11; w = 22; }
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = colors.accent;
    roundRect(ctx, x, y, w, h, 7);
    ctx.stroke();
    ctx.restore();
  }

  /** 文字中夾下標（例如 I/I0 的 0）：parts = [[文字, 是否下標], …]；回傳總寬度 */
  function richText(ctx, parts, x, y, align, measureOnly) {
    const base = ctx.font, size = parseFloat((String(base).match(/(\d+(?:\.\d+)?)px/) || [0, 12])[1]);
    const subFont = String(base).replace(/(\d+(?:\.\d+)?)px/, (size * 0.74).toFixed(1) + 'px');
    let w = 0;
    const widths = parts.map(function (pt) { ctx.font = pt[1] ? subFont : base; const v = ctx.measureText(pt[0]).width; w += v; return v; });
    ctx.font = base;
    if (measureOnly) return w;
    const ta = ctx.textAlign;
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ctx.textAlign = 'left';
    parts.forEach(function (pt, i) {
      ctx.font = pt[1] ? subFont : base;
      ctx.fillText(pt[0], cx, pt[1] ? y + size * 0.3 : y);
      cx += widths[i];
    });
    ctx.font = base;
    ctx.textAlign = ta;
    return w;
  }

  /** 深色模式的條紋光暈圖：條紋圖拉高後上下淡出（每組參數只做一次） */
  function stripGlow(S) {
    if (S.glow) return S.glow;
    const cv = document.createElement('canvas');
    cv.width = S.cols; cv.height = 24;
    const c2 = cv.getContext('2d');
    c2.imageSmoothingEnabled = false;
    c2.drawImage(S.strip, 0, 0, S.cols, 24);
    c2.globalCompositeOperation = 'destination-in';
    const g = c2.createLinearGradient(0, 0, 0, 24);
    g.addColorStop(0, 'rgba(0, 0, 0, 0)');
    g.addColorStop(0.32, 'rgba(0, 0, 0, 1)');
    g.addColorStop(0.68, 'rgba(0, 0, 0, 1)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c2.fillStyle = g;
    c2.fillRect(0, 0, S.cols, 24);
    return (S.glow = cv);
  }

  /** 單色光的強度圖填色：用該波長的顏色（亮度拉到最大），由上往基線逐漸變淡；以目前路徑為範圍 */
  function monoFill(col, l) {
    const ctx = pat.ctx, dark = darkCanvas();
    const m = Math.max(col[0], col[1], col[2]) || 1, f = dark ? 1 : 0.86;
    const hue = col.map(function (v) { return Math.round(v * 255 / m * f); });
    const g = ctx.createLinearGradient(0, l.GT, 0, l.GB);
    g.addColorStop(0, rgba(hue, dark ? 0.66 : 0.6));
    g.addColorStop(0.55, rgba(hue, dark ? 0.36 : 0.36));
    g.addColorStop(1, rgba(hue, dark ? 0.1 : 0.12));
    ctx.fillStyle = g;
    ctx.fill();
  }

  // ---------- 圖形的質感（只是疊在上面的裝飾，不改變任何位置與比例；單色光與白光共用） ----------
  // 屏幕條紋的立體感：上下緣略暗（像被照亮的屏幕表面）、上緣是外框投下的內陰影、下緣一道細亮邊。
  // 每一列都乘上同一個係數，所以沿 y 方向（屏幕位置）的相對亮度不變。
  function stripDepth(l) {
    const ctx = pat.ctx, x = l.PL - 4, w = l.PW + 8, y = l.ST, h = l.SH;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(0, 0, 0, 0.34)');
    g.addColorStop(0.3, 'rgba(0, 0, 0, 0)');
    g.addColorStop(0.62, 'rgba(0, 0, 0, 0)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0.36)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x, y, w, 1.5);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fillRect(x, y + 1.5, w, 1.5);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect(x, y + h - 1, w, 1);
  }
  /** 屏幕的金屬外框：上亮下暗、下緣看得到框的厚度（側面較暗）、柔和投影；只畫在條紋區域的外面 */
  function screenFrame(l, fx, fw, dark) {
    const ctx = pat.ctx, bz = l.BZ, x = fx - bz, y = l.ST - bz, w = fw + 2 * bz, h = l.SH + 2 * bz;
    const side = ctx.createLinearGradient(0, y + h - 6, 0, y + h + 3);
    side.addColorStop(0, LD.shade(DARK.plate, -0.3));
    side.addColorStop(1, LD.shade(DARK.plate, -0.6));
    ctx.save();
    ctx.shadowColor = DARK.shadow;
    ctx.shadowBlur = dark ? 14 : 10;
    ctx.shadowOffsetY = 4;
    roundRect(ctx, x + 1, y + 4, w - 2, h - 1, 6);
    ctx.fillStyle = side;
    ctx.fill();
    ctx.restore();
    LD.block(ctx, x, y, w, h, DARK.plate, { r: 6, shadow: false, stroke: 'rgba(0, 0, 0, 0.45)' });
    // 外框正面的細拉絲紋（水平）
    ctx.save();
    roundRect(ctx, x, y, w, h, 6);
    ctx.clip();
    for (let k = 1.5; k < h - 1; k += 1.25) {
      const r = Math.abs(Math.sin(k * 7.13 + 1.7) * 43758.5453) % 1;
      ctx.fillStyle = r < 0.5 ? 'rgba(255, 255, 255,' + (0.03 + 0.08 * r).toFixed(3) + ')' : 'rgba(0, 0, 0,' + (0.03 + 0.08 * (r - 0.5)).toFixed(3) + ')';
      ctx.fillRect(x, y + k, w, 0.6);
    }
    ctx.restore();
    // 開口的倒角：上緣背光較暗、下緣迎光較亮
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    roundRect(ctx, fx - 0.5, l.ST - 0.5, fw + 1, l.SH + 1, 3.5);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(fx + 3, l.ST + l.SH + 1, fw - 6, 1);
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
      title = orderTitle(1);
      marks = SC.singleSlitDarks(p).filter(function (o) { return Math.abs(o.y) <= Y; });
    } else {
      title = orderTitle(p.N);
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
    const ctx = pat.ctx, l = layout, dark = darkCanvas();
    if (state.cursorY === null) {
      // 操作提示：放在右上角的半透明圓角底框裡；太長時折成兩行
      ctx.font = '12px system-ui, sans-serif';
      const t = T('點擊或拖曳讀取數值', 'Click or drag to read values');
      const lines = wrap2(ctx, t, l.PW * 0.44);
      const b = textBox(ctx, t), lh = Math.round(b.asc + b.desc + 2);
      const w = Math.max.apply(null, lines.map(function (s) { return ctx.measureText(s).width; })) + 16;
      const h = lh * lines.length + 8, x = l.PL + l.PW - 6 - w, y = l.GT + 4;
      roundRect(ctx, x + 0.5, y + 0.5, w, h, Math.min(h / 2, 12));
      ctx.fillStyle = rgba(tokenRGB('surface'), 0.86);
      ctx.fill();
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = colors.muted;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      lines.forEach(function (s, i) { ctx.fillText(s, x + 0.5 + w / 2, y + 5 + b.asc + i * lh); });
      return;
    }
    const y = state.cursorY;
    if (Math.abs(y) > halfRange()) return;
    const x = yToX(y);
    const I = Itot(p, y);
    const py = l.GB - I * (l.GB - l.GT);
    const pc = tokenRGB('probe');
    // 游標線：柔和光暈＋實線
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, l.ST); ctx.lineTo(x, l.ST + l.SH);
    ctx.moveTo(x, l.GT - 4); ctx.lineTo(x, l.GB);
    ctx.strokeStyle = rgba(pc, dark ? 0.28 : 0.18);
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = colors.probe;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 屏幕外框上下緣的小三角形指標
    [[l.ST - l.BZ, 1], [l.ST + l.SH + l.BZ + 3, -1]].forEach(function (q) {
      ctx.beginPath();
      ctx.moveTo(x, q[0] + q[1] * 4);
      ctx.lineTo(x - 4.5, q[0] - q[1] * 3);
      ctx.lineTo(x + 4.5, q[0] - q[1] * 3);
      ctx.closePath();
      ctx.fillStyle = colors.probe;
      ctx.fill();
      ctx.strokeStyle = colors['canvas-bg'];
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    // 曲線上的讀數點：光暈＋球形光澤＋背景色外框
    ctx.beginPath();
    ctx.arc(x, py, 9, 0, Math.PI * 2);
    ctx.fillStyle = rgba(pc, dark ? 0.24 : 0.16);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, py, 6.4, 0, Math.PI * 2);
    ctx.fillStyle = colors['canvas-bg'];
    ctx.fill();
    LD.ball(ctx, x, py, 5, colors.probe, { shadow: false });
    // 數值卡片：圓角、投影、左側游標色條
    ctx.font = '12px system-ui, sans-serif';
    const t1 = 'y = ' + fmtLen(y), t2 = [['I/I', 0], ['0', 1], [' = ' + I.toFixed(3), 0]];
    const b = textBox(ctx, t1), lh = Math.round(b.asc + b.desc + 3);
    const w = Math.ceil(Math.max(ctx.measureText(t1).width, richText(ctx, t2, 0, 0, 'left', true))) + 22;
    const h = lh * 2 + 10;
    // 卡片放在游標右側或左側；優先選不會蓋住強度曲線的一側
    const S = sCache, top = function (x0) {
      if (!S) return 0;
      const i0 = Math.max(0, Math.floor((x0 - l.PL) / l.PW * S.cols)), i1 = Math.min(S.cols - 1, Math.ceil((x0 + w - l.PL) / l.PW * S.cols));
      let m = 0;
      for (let i = i0; i <= i1; i++) m = Math.max(m, S.resolved ? S.mid[i] : S.mx[i]);
      return m;
    };
    // 候選位置：游標右側、左側、圖的左上角、右上角（後兩者在窄螢幕上避免蓋住中央亮紋）
    const clear = 1 - (h + 6) / (l.GB - l.GT); // 卡片下緣對應的 I/I0
    const cands = [x + 10, x - 10 - w, l.PL + 4, l.PL + l.PW - 4 - w].filter(function (c) {
      return c >= l.PL && c + w <= l.PL + l.PW && (c + w <= x - 8 || c >= x + 8);
    });
    let bx = cands.length ? cands[0] : x - 10 - w, best = Infinity;
    for (let k = 0; k < cands.length; k++) {
      const t = top(cands[k]);
      if (t <= clear) { bx = cands[k]; break; }
      if (t < best) { best = t; bx = cands[k]; }
    }
    bx = Math.round(bx);
    const by = l.GT + 2;
    ctx.save();
    ctx.shadowColor = DARK.shadow;
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    roundRect(ctx, bx + 0.5, by + 0.5, w, h, 7);
    ctx.fillStyle = colors.surface;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.stroke();
    roundRect(ctx, bx + 5, by + 6, 3, h - 11, 1.5);
    ctx.fillStyle = colors.probe;
    ctx.fill();
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(t1, bx + 14, by + 5 + b.asc);
    richText(ctx, t2, bx + 14, by + 5 + b.asc + lh, 'left');
  }

  /** 文字太寬時折成兩行（英文在空白處、中文在中間附近） */
  function wrap2(ctx, t, maxW) {
    if (ctx.measureText(t).width <= maxW) return [t];
    const sp = [];
    for (let i = 1; i < t.length - 1; i++) if (t[i] === ' ') sp.push(i);
    const mid = t.length / 2;
    let k = Math.round(mid);
    if (sp.length) k = sp.reduce(function (a, b) { return Math.abs(b - mid) < Math.abs(a - mid) ? b : a; });
    return [t.slice(0, k).trim(), t.slice(k).trim()];
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

  // ---------- 無障礙：示意圖的文字描述、讀數播報 ----------
  function modeName() {
    return state.mode === 'single' ? T('單狹縫', 'Single slit') : state.mode === 'double' ? T('雙狹縫', 'Double slit') : T(slitCount() + ' 條狹縫（光柵）', slitCount() + ' slits (grating)');
  }
  /** 俯視示意圖（沒有可拖曳的物件）：role="img"，參數改變時更新描述 */
  function updateSceneLabel() {
    const src = state.white ? T('白光', 'white light') : T('波長 ' + state.lam + ' nm 的' + SC.colorName(state.lam), 'light of wavelength ' + state.lam + ' nm (' + COLOR_EN[SC.colorName(state.lam)] + ')');
    const geo = T('縫寬 a = ' + trimNum(state.a, 1) + ' μm', 'slit width a = ' + trimNum(state.a, 1) + ' μm') +
      (state.mode === 'single' ? '' : T('，縫距 d = ' + trimNum(state.d, 1) + ' μm', ', slit separation d = ' + trimNum(state.d, 1) + ' μm')) +
      T('，屏幕距離 L = ', ', screen distance L = ') + state.L.toFixed(2) + ' m';
    const t = T('俯視示意圖（未依比例）：' + src + '射向' + modeName() + '，' + geo + '。光波通過狹縫後向外擴散，在屏幕前互相干涉。',
      'Top view (schematic, not to scale): ' + src + ' falls on ' + (state.mode === 'single' ? 'a single slit' : state.mode === 'double' ? 'a double slit' : slitCount() + ' slits (a grating)') + ', ' + geo + '. The waves spread out from the slits and interfere before reaching the screen.');
    if (scene.cv.getAttribute('aria-label') !== t) scene.cv.setAttribute('aria-label', t);
  }
  /** 改參數後播報最重要的結果（aria-live="polite"；停止變動 0.8 秒後才念，內容沒變就不念） */
  let sayTimer = 0, lastSaid = '';
  function resultText() {
    const g = function (id) { return $(id).textContent; };
    const head = (state.white ? T('白光、', 'White light, ') : state.lam + ' nm' + T('、', ', ')) + modeName() + T('：', ': ');
    if (state.mode === 'single') {
      return head + T('中央亮帶寬度 ≈ ', 'central maximum width ≈ ') + g('rW') + T('，兩側亮帶寬度 ≈ ', ', side maxima width ≈ ') + g('rWs') + T('。', '.');
    }
    return head + T('亮紋間距 Δy ≈ ', 'fringe spacing Δy ≈ ') + g('rDy') + T('，中央亮帶寬度 ≈ ', ', central maximum width ≈ ') + g('rW') +
      T('，中央亮帶內有 ', ', bright fringes in the central maximum: ') + g('rCount') + T('，缺級：', '; missing orders: ') + g('rMissing') + T('。', '.');
  }
  function scheduleSay() {
    clearTimeout(sayTimer);
    sayTimer = setTimeout(function () {
      const t = resultText();
      if (t === lastSaid) return;
      const first = !lastSaid;
      lastSaid = t;
      if (!first && userActed) $('srSay').textContent = t; // 載入頁面時不念
    }, 800);
  }
  // 拖曳游標時的讀數：另一個 .sr-only 狀態列，至少間隔 1 秒才更新；放開時再更新一次
  let srLast = 0, srTimer = 0;
  function sayCursor(now) {
    clearTimeout(srTimer);
    const t = performance.now();
    if (now || t - srLast >= 1000) { srLast = t; $('srNow').textContent = cursorDesc(); }
    else srTimer = setTimeout(function () { sayCursor(true); }, 1000 - (t - srLast));
  }

  // ---------- 重畫排程 ----------
  let pending = false;
  function requestDraw() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () {
      pending = false;
      updateReadout();
      updateSceneLabel();
      scheduleSay();
      drawPattern();
      if (!state.anim || !sceneVisible) drawScene();
      scheduleMission();
    });
  }
  function invalidateScene() { field = null; requestDraw(); }

  // ---------- 控制項 ----------
  // 滑桿數字可點擊輸入（js/numinput.js）：讀值一律用 LabNum.value，保留打字輸入的精確值
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  function bindSlider(id, fmt, onInput, html) {
    const el = $(id), out = $(id + 'o');
    const update = function () { if (html) out.innerHTML = fmt(val(el)); else out.textContent = fmt(val(el)); };
    el.addEventListener('input', function () { onInput(val(el)); update(); });
    update();
    // 程式改變滑桿（預設按鈕、d > a 的限制）：LabNum.set 會觸發 input，由上面的處理更新狀態與顯示
    return { el: el, set: function (v) {
      if (window.LabNum) window.LabNum.set(el, v); else { el.value = v; el.dispatchEvent(new Event('input')); }
    } };
  }
  function lamLabel(v) {
    return '<span class="swatch" style="background:rgb(' + SC.wavelengthToRGB(v).join(',') + ')"></span>' +
      v + ' nm <span class="sub">' + T('（' + SC.colorName(v) + '）', '(' + COLOR_EN[SC.colorName(v)] + ')') + '</span>';
  }
  const sLam = bindSlider('lam', lamLabel, function (v) { state.lam = v; invalidateScene(); }, true);
  const sA = bindSlider('a', function (v) { return trimNum(v, 1) + ' μm'; }, function (v) {
    state.a = v;
    if (state.mode !== 'single' && state.d <= v) {
      sD.set(Math.min(400, v + 1));
      setStatus(T('縫距 d 必須大於縫寬 a，已自動加大 d。', 'The slit separation d must be larger than the slit width a, so d has been increased.'));
    } else setStatus('');
    invalidateScene();
  });
  const sD = bindSlider('d', function (v) { return trimNum(v, 1) + ' μm'; }, function (v) {
    state.d = v;
    if (state.a >= v) {
      sA.set(Math.max(5, v - 1));
      if (state.d <= state.a) sD.set(state.a + 1);
      setStatus(T('縫寬 a 必須小於縫距 d，已自動縮小 a。', 'The slit width a must be smaller than the slit separation d, so a has been reduced.'));
    } else setStatus('');
    invalidateScene();
  });
  bindSlider('L', function (v) { return v.toFixed(2) + ' m'; }, function (v) { state.L = v; requestDraw(); });
  bindSlider('N', function (v) { return T(v + ' 條', String(v)); }, function (v) { state.N = v; invalidateScene(); });
  // 顯示範圍是非線性滑桿（索引 → ZOOMS 的 mm 值）；打字可輸入 2–500 mm 之間的任意值
  if (window.LabNum) window.LabNum.register($('zoom'), {
    toValue: function (pos) { return ZOOMS[Math.round(pos)]; },
    toPos: function (mm) {
      let best = 0;
      ZOOMS.forEach(function (z, i) { if (Math.abs(Math.log(z / mm)) < Math.abs(Math.log(ZOOMS[best] / mm))) best = i; });
      return best;
    },
    min: ZOOMS[0], max: ZOOMS[ZOOMS.length - 1], decimals: 1
  });
  const sZoom = bindSlider('zoom', fmtZoom, function (v) { state.zoom = v; requestDraw(); });
  function setStatus(t) { $('status').textContent = t; }

  document.querySelectorAll('[data-lam]').forEach(function (btn) {
    btn.addEventListener('click', function () { sLam.set(+btn.dataset.lam); });
  });

  $('autoZoom').addEventListener('click', function () {
    const p = state.white ? withLam(params(), WL_HI) : params();
    let target = SC.centralWidthExact(p) / 2 * 2.05;
    if (!isFinite(target)) target = Infinity;
    let i = 0;
    while (i < ZOOMS.length - 1 && ZOOMS[i] * MM < target) i++;
    sZoom.set(ZOOMS[i]);
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
    if (!single && state.d <= state.a) sD.set(Math.min(400, state.a + 1));
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
    sayCursor();
  }
  pat.cv.addEventListener('pointerdown', function (ev) {
    dragging = true;
    setCursorFromEvent(ev);
    try { pat.cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
  });
  pat.cv.addEventListener('pointermove', function (ev) {
    if (dragging || ev.pointerType === 'mouse') setCursorFromEvent(ev);
  });
  const endDrag = function () { if (dragging) sayCursor(true); dragging = false; scheduleMission(); };
  pat.cv.addEventListener('pointerup', endDrag);
  pat.cv.addEventListener('pointercancel', endDrag);

  // 鍵盤（js/keys.js）：左右方向鍵移動游標，每次 1 個圖寬像素（與滑鼠拖曳的解析度相同），Shift 為 10 倍；
  // 限制與拖曳相同（不超出屏幕顯示範圍）；Home 回到中央 y = 0
  function cursorDesc() {
    if (state.cursorY === null) return T('游標尚未放置，按左右方向鍵放在屏幕中央附近。', 'The cursor is not placed yet; press the left or right arrow key to put it near the centre.');
    const p = params(), y = state.cursorY, I = Itot(p, y), s = SC.sinTheta(y, p.L);
    let t = 'y = ' + fmtLen(y) + T('，相對光強 I/I0 = ', ', relative intensity I/I0 = ') + I.toFixed(3);
    if (!state.white && p.N > 1) t += T('，程差 d sinθ = ', ', path difference d sinθ = ') + (p.d * s / p.lambda).toFixed(2).replace('-', '−') + ' λ';
    return t;
  }
  function moveCursorBy(dx, big) {
    if (!dx || !layout) return false;
    const stepY = 2 * halfRange() / layout.PW * (big ? 10 : 1);
    const y = (state.cursorY === null ? 0 : state.cursorY) + dx * stepY;
    state.cursorY = Math.max(-halfRange(), Math.min(halfRange(), y));
    requestDraw();
    return true;
  }
  let kb = null;
  if (window.LabKeys) {
    kb = window.LabKeys.attach(pat.cv, {
      label: T('屏幕上的條紋與相對光強 I/I0 對位置 y 的關係圖。可點擊或拖曳放置游標；鍵盤：左右方向鍵移動游標（Shift 移動 10 倍），Home 回到中央，會念出位置與相對光強。',
        'Fringes on the screen and graph of relative intensity I/I0 against position y. Click or drag to place the cursor; keyboard: the left and right arrow keys move the cursor (Shift: 10 times as far), Home returns it to the centre, and the position and relative intensity are read out.'),
      items: [{ name: function () { return T('游標', 'Cursor'); }, move: function (dx, dy, big) { return moveCursorBy(dx, big); }, describe: cursorDesc }],
      onChange: requestDraw
    });
  }
  pat.cv.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Home' || !layout) return;
    ev.preventDefault();
    state.cursorY = 0;
    requestDraw();
    if (kb) kb.say(cursorDesc());
  });

  // 分享連結（classroom.js 的 LabShare）：還原游標位置（mm；null = 尚未放置），超出顯示範圍時限制在邊緣，與拖曳相同。
  // classroom.js 在 DOMContentLoaded 之後才載入，所以用佇列登記（載入時會補登記）
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { y: state.cursorY === null ? null : +(state.cursorY / MM).toFixed(4) }; },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      if (o.y === null) state.cursorY = null;
      else if (isFinite(+o.y) && o.y !== '' && typeof o.y !== 'boolean') state.cursorY = Math.max(-halfRange(), Math.min(halfRange(), +o.y * MM));
      else return;
      requestDraw();
    }
  });

  // ---------- 任務模式（missions.js）：設定與游標穩定下來後回報一次 ----------
  // 只在使用者親自操作之後才回報（預設狀態不會意外完成任務）；拖曳游標時不回報，放開後才回報。
  let missionTimer = 0, userActed = false;
  ['input', 'change', 'click', 'pointerdown', 'keydown'].forEach(function (t) {
    document.querySelector('.lab').addEventListener(t, function (e) { if (e.isTrusted) userActed = true; }, true);
  });
  function scheduleMission() {
    if (!window.LabMission || !userActed) return;
    clearTimeout(missionTimer);
    if (dragging) return;
    missionTimer = setTimeout(function () {
      const p = params(), pi = SC.patternInfo(p), mm = function (m) { return m / MM; };
      const data = {
        mode: state.mode, N: p.N, white: state.white, lam: state.white ? NaN : state.lam,
        a: state.a, d: p.N > 1 ? state.d : NaN, L: state.L,
        dy: mm(pi.dy), y1: mm(pi.y1), W: mm(pi.W), k: pi.k, nCentral: pi.nCentral, y400: mm(pi.y400), y700: mm(pi.y700),
        cursor: state.cursorY !== null
      };
      if (data.cursor) {
        const c = SC.pointInfo(p, state.cursorY, state.white ? SPEC : null);
        Object.assign(data, {
          y: mm(state.cursorY), theta: c.theta * 180 / Math.PI, pathD: c.pathD / NM, pathA: c.pathA / NM,
          pd: c.pd, pa: c.pa, I: c.I, R: c.R, G: c.G, B: c.B
        });
      }
      window.LabMission.emit('setup', data);
    }, 300);
  }

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
    updateSceneLabel();
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
