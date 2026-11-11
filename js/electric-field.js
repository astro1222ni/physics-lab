/* electric-field.js — 「電場與等位線」模組的畫面與互動（物理計算在 field-core.js） */
(function () {
  'use strict';
  const FC = window.FieldCore;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };

  // ---------- 世界座標（cm，y 向上） ----------
  const W = 12, H = 8;
  const VIEW = { x0: 0, x1: W, y0: 0, y1: H };
  const LINE_BOUNDS = { x0: -8, x1: W + 8, y0: -8, y1: H + 8 };
  const GRID_N = { x: 240, y: 160 }; // 等位線／色階的格點數
  const LEVELS = [100, 200, 400, 800, 1600, 3200, 6400, 12800];

  const state = {
    charges: [
      { x: 4, y: 4, q: 3, label: 'A' },
      { x: 8, y: 4, q: -3, label: 'B' }
    ],
    show: { lines: true, equi: true, heat: true, grid: true },
    probe: { x: 6, y: 6, vx: 0, vy: 0, q: 1, m: 1, home: { x: 6, y: 6 }, trail: [] },
    running: false,
    ended: false,
    released: false,   // 從起點釋放後為 true（區分「釋放」與「繼續」）
    status: ''
  };

  // ---------- 畫布 ----------
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let scale = 1, dpr = 1;
  const heatCanvas = document.createElement('canvas');
  heatCanvas.width = GRID_N.x + 1;
  heatCanvas.height = GRID_N.y + 1;
  const heatCtx = heatCanvas.getContext('2d');
  // 不變的圖層（背景、色階、格線、等位線、電力線）先畫在離屏畫布，只在參數改變時重畫
  const staticCanvas = document.createElement('canvas');
  const sctx = staticCanvas.getContext('2d');
  let staticDirty = true;
  let arrowPts = [];   // 電力線箭頭的位置（px），等位標籤避開

  // 減少動態效果：關掉純裝飾的動畫（撞擊波紋）
  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reducedMotion = !!(motionQuery && motionQuery.matches);
  if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener('change', function () { reducedMotion = motionQuery.matches; });

  // ---------- 顏色（全部來自 CSS 代號） ----------
  let colors = {}, rgb = {};
  const TOKENS = ['--canvas-bg', '--pos', '--neg', '--field', '--equi', '--grid', '--probe', '--text', '--muted', '--surface',
    '--ef-shadow', '--ef-vignette', '--ef-glow', '--ef-pill'];
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    TOKENS.forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    rgb = {};
    ['canvas-bg', 'pos', 'neg', 'field', 'equi', 'grid', 'probe', 'text', 'muted', 'surface', 'ef-shadow', 'ef-vignette', 'ef-pill']
      .forEach(function (k) { rgb[k] = parseColor(colors[k]); });
    const g = parseFloat(colors['ef-glow']);
    colors.glow = isFinite(g) ? g : 0.4;
    // 背景亮度判斷深色模式（深色時光暈稍強、陰影改用更深的黑）
    const b = rgb['canvas-bg'];
    colors.dark = (0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2]) / 255 < 0.5;
    heatLut = null;
    staticDirty = true;
  }
  /** '#rgb'、'#rrggbb'、'rgb(…)'、'rgba(…)' → [r, g, b, a] */
  function parseColor(s) {
    s = (s || '').trim();
    if (s[0] === '#') {
      const h = s.slice(1);
      const n = parseInt(h.length === 3 ? h.split('').map(function (c) { return c + c; }).join('') : h.slice(0, 6), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }
    return [128, 128, 128, 1];
  }
  function rgba(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a === undefined ? c[3] : a).toFixed(3) + ')'; }
  /** 往白（t > 0）或往黑（t < 0）調整明暗，保持原色相 */
  function shade(c, t) {
    const k = t >= 0 ? 255 : 0, a = Math.abs(t);
    return [c[0] + (k - c[0]) * a, c[1] + (k - c[1]) * a, c[2] + (k - c[2]) * a, c[3]];
  }
  function mixRgb(c1, c2, t) { return [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t, 1]; }

  // ---------- OKLab：感知均勻的色彩內插（色階亮度單調變化） ----------
  function s2l(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function l2s(c) { c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.round(Math.max(0, Math.min(1, c)) * 255); }
  function toLab(c) {
    const r = s2l(c[0]), g = s2l(c[1]), b = s2l(c[2]);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function fromLab(L, A, B) {
    const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
    const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
    const s = Math.pow(L - 0.0894841775 * A - 1.2914855480 * B, 3);
    return [l2s(4.0767416621 * l - 3.3077085835 * m + 0.2309667191 * s),
      l2s(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      l2s(-0.0041960771 * l - 0.7034186147 * m + 1.7076147010 * s)];
  }

  function toPx(x, y) { return [x * scale, (H - y) * scale]; }
  function toWorld(px, py) { return [px / scale, H - py / scale]; }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = cv.clientWidth;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(w * H / W * dpr);
    scale = w / W;
    staticCanvas.width = cv.width;
    staticCanvas.height = cv.height;
    staticDirty = true;
    draw();
  }

  // ---------- 由場源電荷算出的快取：格點電位、電力線 ----------
  let cache = null;
  function compute() {
    const nx = GRID_N.x, ny = GRID_N.y, dx = W / nx, dy = H / ny;
    const grid = new Float64Array((nx + 1) * (ny + 1));
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        let v = FC.potentialAt(state.charges, i * dx, j * dy);
        if (!isFinite(v)) v = v > 0 ? 1e7 : -1e7;
        grid[j * (nx + 1) + i] = v;
      }
    }
    paintHeat(grid, nx, ny, dx, dy);

    const contours = [];
    LEVELS.forEach(function (L) {
      [L, -L].forEach(function (lv) {
        const segs = FC.contourSegments(grid, nx, ny, 0, 0, dx, dy, lv);
        if (segs.length) contours.push({ level: lv, polys: stitch(segs) });
      });
    });
    const hasPos = state.charges.some(function (c) { return c.q > 0; });
    const hasNeg = state.charges.some(function (c) { return c.q < 0; });
    if (hasPos && hasNeg) contours.push({ level: 0, polys: stitch(FC.contourSegments(grid, nx, ny, 0, 0, dx, dy, 0)) });

    const lines = FC.fieldLines(state.charges, { bounds: LINE_BOUNDS, step: 0.04, maxSteps: 2500 });
    // 線寬隨 |E| 微調（純視覺）：每隔幾點取樣一次電場強度
    lines.forEach(function (line) {
      const p = line.points, w = new Float32Array(p.length);
      let last = 0;
      for (let i = 0; i < p.length; i++) {
        if (i % 4 === 0) {
          const e = FC.fieldAt(state.charges, p[i][0], p[i][1]);
          const m = Math.hypot(e.ex, e.ey);
          last = isFinite(m) && m > 0 ? Math.max(0, Math.min(1, (Math.log10(m) - 3.5) / 2)) : 1;
        }
        w[i] = last;
      }
      line.strength = w;
    });
    cache = { contours: contours, lines: lines };
    staticDirty = true;
  }
  function invalidate() { cache = null; requestDraw(); }

  /**
   * 電位色階：tanh 壓縮讓近處與遠處都看得出差異；
   * 在 OKLab 中由背景色往正（紅）或負（藍）內插，兩臂的亮度都隨 |V| 單調變化（發散型色階）。
   * 另外疊一層極淡的「地形光影」（光從左上方來），讓高電位像山丘、低電位像凹谷。
   */
  // 色階查表（RGB）：[正負兩臂][|t| 的 257 階][光影 17 階]，只在顏色改變時重建
  const LUT_N = 256, LUT_S = 16;
  let heatLut = null;
  function buildHeatLut() {
    const AMAX = 0.5, relief = colors.dark ? 0.035 : 0.03;
    const bgL = toLab(rgb['canvas-bg']), arms = [toLab(rgb.pos), toLab(rgb.neg)];
    heatLut = new Uint8ClampedArray(2 * (LUT_N + 1) * (LUT_S + 1) * 3);
    let o = 0;
    for (let s = 0; s < 2; s++) {
      const tgt = arms[s];
      for (let k = 0; k <= LUT_N; k++) {
        const a = k / LUT_N * AMAX;
        const L = bgL[0] + (tgt[0] - bgL[0]) * a, A = bgL[1] + (tgt[1] - bgL[1]) * a, B = bgL[2] + (tgt[2] - bgL[2]) * a;
        for (let h = 0; h <= LUT_S; h++) {
          const c = fromLab(L + (h / LUT_S * 2 - 1) * relief, A, B);
          heatLut[o++] = c[0]; heatLut[o++] = c[1]; heatLut[o++] = c[2];
        }
      }
    }
  }
  function paintHeat(grid, nx, ny, dx, dy) {
    if (!heatLut) buildHeatLut();
    const W1 = nx + 1;
    const u = new Float32Array(grid.length);
    for (let i = 0; i < grid.length; i++) u[i] = Math.tanh(grid[i] / 2500);
    const img = heatCtx.createImageData(nx + 1, ny + 1), d = img.data;
    for (let j = 0; j <= ny; j++) {
      const jm = Math.max(0, j - 1) * W1, jp = Math.min(ny, j + 1) * W1, ddy = dy * ((j > 0 && j < ny) ? 2 : 1);
      for (let i = 0; i <= nx; i++) {
        const id = j * W1 + i, t = u[id];
        const s = t >= 0 ? 0 : 1, k = Math.min(LUT_N, Math.round(Math.abs(t) * LUT_N));
        // 斜率（每 cm，中央差分）；光源方向（世界座標）(−1, +1)
        const ux = (u[j * W1 + Math.min(nx, i + 1)] - u[j * W1 + Math.max(0, i - 1)]) / (dx * ((i > 0 && i < nx) ? 2 : 1));
        const uy = (u[jp + i] - u[jm + i]) / ddy;
        const lit = Math.tanh((ux - uy) * 0.7071 * 1.2); // −1 … 1
        const h = Math.round((lit + 1) / 2 * LUT_S);
        const o = ((s * (LUT_N + 1) + k) * (LUT_S + 1) + h) * 3;
        const q = ((ny - j) * W1 + i) * 4; // 影像的列由上往下
        d[q] = heatLut[o]; d[q + 1] = heatLut[o + 1]; d[q + 2] = heatLut[o + 2]; d[q + 3] = 255;
      }
    }
    heatCtx.putImageData(img, 0, 0);
  }

  /** 把 marching squares 的小線段接成連續折線（虛線圖樣才會沿線連續） */
  function stitch(segs) {
    const Q = 1e4;
    const key = function (x, y) { return Math.round(x * Q) * 1e6 + Math.round(y * Q); };
    const ends = new Map();
    function add(k, v) { const a = ends.get(k); if (a) a.push(v); else ends.set(k, [v]); }
    for (let i = 0; i < segs.length; i++) {
      add(key(segs[i][0], segs[i][1]), i * 2);
      add(key(segs[i][2], segs[i][3]), i * 2 + 1);
    }
    const used = new Uint8Array(segs.length);
    function other(end) { const s = segs[end >> 1]; return (end & 1) ? [s[0], s[1]] : [s[2], s[3]]; }
    function nextFrom(pt) {
      const a = ends.get(key(pt[0], pt[1]));
      if (!a) return -1;
      for (let i = 0; i < a.length; i++) if (!used[a[i] >> 1]) return a[i];
      return -1;
    }
    const polys = [];
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = 1;
      const fwd = [[segs[i][2], segs[i][3]]], back = [[segs[i][0], segs[i][1]]];
      let e;
      while ((e = nextFrom(fwd[fwd.length - 1])) >= 0) { used[e >> 1] = 1; fwd.push(other(e)); }
      while ((e = nextFrom(back[back.length - 1])) >= 0) { used[e >> 1] = 1; back.push(other(e)); }
      polys.push(back.reverse().concat(fwd));
    }
    return polys;
  }

  // ---------- 繪圖 ----------
  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }

  /** 全頁一致的箭頭：尖端在 (x, y)，兩側微凸、底邊內凹的三角形 */
  function arrowHead(c, x, y, ux, uy, len, half) {
    const nx = -uy, ny = ux, bx = x - ux * len, by = y - uy * len;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x - ux * len * 0.45 + nx * half * 0.6, y - uy * len * 0.45 + ny * half * 0.6, bx + nx * half, by + ny * half);
    c.quadraticCurveTo(x - ux * len * 0.68, y - uy * len * 0.68, bx - nx * half, by - ny * half);
    c.quadraticCurveTo(x - ux * len * 0.45 - nx * half * 0.6, y - uy * len * 0.45 - ny * half * 0.6, x, y);
    c.closePath();
    c.fill();
  }

  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  /** 字的高度（跟著字體設定縮放） */
  function textH(c) {
    const m = c.measureText('Mg');
    const h = (m.fontBoundingBoxAscent || 0) + (m.fontBoundingBoxDescent || 0);
    return h > 0 ? h : parseFloat(c.font) * 1.2;
  }

  // ---------- 靜態圖層 ----------
  function drawStatic() {
    const c = sctx;
    const wpx = W * scale, hpx = H * scale;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.fillStyle = colors['canvas-bg'];
    c.fillRect(0, 0, wpx, hpx);

    if (state.show.heat) {
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(heatCanvas, 0, 0, wpx, hpx);
    }

    // 極淡的徑向暈影：中心亮、四角暗
    const diag = Math.hypot(wpx, hpx) / 2;
    const vg = c.createRadialGradient(wpx / 2, hpx * 0.46, diag * 0.35, wpx / 2, hpx / 2, diag * 1.05);
    vg.addColorStop(0, rgba(rgb['ef-vignette'], 0));
    vg.addColorStop(1, colors['ef-vignette']);
    c.fillStyle = vg;
    c.fillRect(0, 0, wpx, hpx);

    if (state.show.grid) {
      // 對齊裝置像素的 1 px 細線：主格線 1 cm，次格線 0.2 cm（格子夠大時才畫）
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.lineWidth = 1;
      const g = rgb.grid, sp = scale * dpr;
      const line = function (step, alpha, skipMajor) {
        c.strokeStyle = rgba(g, alpha);
        c.beginPath();
        for (let k = 1; k * step < W - 1e-9; k++) {
          if (skipMajor && k % 5 === 0) continue;
          const X = Math.round(k * step * sp) + 0.5; c.moveTo(X, 0); c.lineTo(X, cv.height);
        }
        for (let k = 1; k * step < H - 1e-9; k++) {
          if (skipMajor && k % 5 === 0) continue;
          const Y = Math.round(k * step * sp) + 0.5; c.moveTo(0, Y); c.lineTo(cv.width, Y);
        }
        c.stroke();
      };
      if (scale * 0.2 >= 10) line(0.2, g[3] * 0.45, true);
      line(1, g[3] * 1.35, false);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    arrowPts = [];
    if (state.show.equi) drawEquipotentials(c);
    if (state.show.lines) drawFieldLines(c);
    // 標籤最後畫，底框蓋在線上才清楚；拖曳電荷時先不標（放開後再排），畫面較安定也較快
    if (state.show.equi && !(drag && drag.type === 'charge')) drawLevelLabels(c);
    staticDirty = false;
  }

  function fmtLevel(v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + ' V'; }

  function drawEquipotentials(c) {
    const eq = rgb.equi;
    // 1) 線：連續虛線；V = 0 用較長的虛線並稍粗
    cache.contours.forEach(function (ct) {
      c.setLineDash(ct.level === 0 ? [10, 5] : [6, 4.5]);
      c.lineWidth = ct.level === 0 ? 1.6 : 1.25;
      c.strokeStyle = rgba(eq, 0.95);
      c.beginPath();
      ct.polys.forEach(function (poly) {
        for (let i = 0; i < poly.length; i++) {
          const x = poly[i][0] * scale, y = (H - poly[i][1]) * scale;
          if (i) c.lineTo(x, y); else c.moveTo(x, y);
        }
      });
      c.stroke();
    });
    c.setLineDash([]);
  }

  /** 把點放進 8 px 的格子，方便查「附近有沒有別的線」 */
  function bucketize(list) {
    const B = new Map();
    list.forEach(function (item) {
      const k = Math.floor(item[0] / 8) * 4096 + Math.floor(item[1] / 8);
      const a = B.get(k); if (a) a.push(item); else B.set(k, [item]);
    });
    return B;
  }
  function near(B, x, y, r, fn) {
    const n = Math.ceil(r / 8), cx = Math.floor(x / 8), cy = Math.floor(y / 8);
    for (let i = cx - n; i <= cx + n; i++) {
      for (let j = cy - n; j <= cy + n; j++) {
        const a = B.get(i * 4096 + j);
        if (!a) continue;
        for (let k = 0; k < a.length; k++) {
          if (Math.hypot(a[k][0] - x, a[k][1] - y) < r && fn(a[k]) === false) return false;
        }
      }
    }
    return true;
  }

  /**
   * 電位標籤：每個等級最多一個，放在不擁擠的地方——
   * 離電荷、畫面邊緣、其他標籤夠遠，旁邊沒有其他等位線或電力線箭頭，盡量少壓到電力線。
   */
  function drawLevelLabels(c) {
    const eq = rgb.equi;
    c.font = '600 10.5px system-ui, sans-serif';
    const th = textH(c), ph = th + 3;
    const placed = [];
    const chargesPx = state.charges.map(function (q) { return toPx(q.x, q.y); });
    const wpx = W * scale, hpx = H * scale;
    const minSep = Math.max(54, 1.9 * scale);
    // 其他等位線的點（標記屬於哪一條）、電力線的點、箭頭位置
    const eqPts = [], flPts = [];
    cache.contours.forEach(function (ct, ci) {
      ct.polys.forEach(function (poly) { poly.forEach(function (p) { eqPts.push([p[0] * scale, (H - p[1]) * scale, ci]); }); });
    });
    if (state.show.lines) {
      cache.lines.forEach(function (line, li) {
        const p = line.points;
        for (let i = 0; i < p.length; i += 2) flPts.push([p[i][0] * scale, (H - p[i][1]) * scale, li]);
      });
    }
    const eqB = bucketize(eqPts), flB = bucketize(flPts), arB = bucketize(arrowPts);
    const order = cache.contours.map(function (ct, ci) { return { ct: ct, ci: ci }; })
      .sort(function (a, b) { return Math.abs(a.ct.level) - Math.abs(b.ct.level); });
    order.forEach(function (o) {
      const ct = o.ct, ci = o.ci;
      const text = fmtLevel(ct.level), tw = c.measureText(text).width, pw = tw + 10;
      const rad = pw / 2 + 2;
      let best = null, bestScore = -Infinity;
      ct.polys.forEach(function (poly) {
        // 太短（小圓圈）的線不標，避免擁擠
        let len = 0;
        const px = poly.map(function (p) { return [p[0] * scale, (H - p[1]) * scale]; });
        for (let i = 1; i < px.length; i++) len += Math.hypot(px[i][0] - px[i - 1][0], px[i][1] - px[i - 1][1]);
        if (len < pw * 3.2) return;
        const stepN = Math.max(1, Math.round(10 / Math.max(0.5, scale * W / GRID_N.x)));
        for (let i = 2; i < px.length - 2; i += stepN) {
          const x = px[i][0], y = px[i][1];
          if (x < rad + 4 || x > wpx - rad - 4 || y < rad + 4 || y > hpx - rad - 4) continue;
          if (x < 120 && y > hpx - 44) continue; // 比例尺的位置
          let dmin = Infinity;
          for (let k = 0; k < chargesPx.length; k++) {
            if (state.charges[k].q === 0) continue;
            dmin = Math.min(dmin, Math.hypot(x - chargesPx[k][0], y - chargesPx[k][1]) - 30 - rad);
          }
          if (dmin < 0) continue;
          let dl = Infinity;
          for (let k = 0; k < placed.length; k++) dl = Math.min(dl, Math.hypot(x - placed[k][0], y - placed[k][1]) - minSep - (rad + placed[k][2]) * 0.5);
          if (dl < 0) continue;
          // 底框範圍內不可有其他等位線、電力線箭頭
          if (!near(eqB, x, y, rad + 3, function (q) { return q[2] === ci; })) continue;
          if (!near(arB, x, y, rad + 6, function () { return false; })) continue;
          let crossing = 0;
          const seen = {};
          near(flB, x, y, rad, function (q) { if (!seen[q[2]]) { seen[q[2]] = 1; crossing++; } });
          // 偏好：遠離電荷與其他標籤，並稍微偏向畫面上半部
          const score = Math.min(dmin, 90) + Math.min(dl, 140) * 0.6 - y * 0.08 - crossing * 40;
          if (score > bestScore) {
            bestScore = score;
            const a = px[Math.max(0, i - 2)], b = px[Math.min(px.length - 1, i + 2)];
            let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
            if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
            best = [x, y, rad, ang, text, pw];
          }
        }
      });
      if (best) placed.push(best);
    });
    placed.forEach(function (L) {
      c.save();
      c.translate(L[0], L[1]);
      c.rotate(L[3]);
      roundRect(c, -L[5] / 2, -ph / 2, L[5], ph, ph / 2);
      c.fillStyle = colors['ef-pill'];
      c.fill();
      c.lineWidth = 1;
      c.strokeStyle = rgba(eq, 0.55);
      c.stroke();
      c.fillStyle = colors.equi;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(L[4], 0, 0.5);
      c.restore();
    });
  }

  function drawFieldLines(c) {
    const fc = colors.field;
    const arrowEvery = 2.2; // cm
    const wMin = 0.85, wMax = 2.1;
    const aLen = Math.max(6.5, Math.min(8.5, scale * 0.12)), aHalf = aLen * 0.42;
    c.strokeStyle = fc;
    c.fillStyle = fc;
    cache.lines.forEach(function (line) {
      const p = line.points, s = line.strength;
      // 每 6 點一段，線寬依該段的 |E| 決定（實色、圓端，接縫看不出）
      for (let i = 0; i < p.length - 1; i += 6) {
        const j = Math.min(p.length - 1, i + 6);
        c.lineWidth = wMin + (wMax - wMin) * s[Math.min(p.length - 1, i + 3)];
        c.beginPath();
        c.moveTo(p[i][0] * scale, (H - p[i][1]) * scale);
        for (let k = i + 1; k <= j; k++) c.lineTo(p[k][0] * scale, (H - p[k][1]) * scale);
        c.stroke();
      }
      // 箭頭：標示真正的電場方向（從負電荷描出的線要反向）
      let acc = arrowEvery * 0.55;
      for (let i = 1; i < p.length - 1; i++) {
        const sx = p[i][0] - p[i - 1][0], sy = p[i][1] - p[i - 1][1];
        acc += Math.hypot(sx, sy);
        if (acc < arrowEvery) continue;
        acc = 0;
        if (p[i][0] < 0.2 || p[i][0] > W - 0.2 || p[i][1] < 0.2 || p[i][1] > H - 0.2) continue;
        const len = Math.hypot(sx, sy) || 1;
        const ux = line.dir * sx / len, uy = -line.dir * sy / len;
        const x = p[i][0] * scale, y = (H - p[i][1]) * scale;
        arrowHead(c, x + ux * aLen * 0.55, y + uy * aLen * 0.55, ux, uy, aLen, aHalf);
        arrowPts.push([x, y]);
      }
    });
  }

  // ---------- 動態圖層 ----------
  let hover = -1;          // 游標下的場源電荷
  const ripples = [];      // 撞擊時的短暫波紋（裝飾，不影響物理）

  function drawCharge(c, ch, i) {
    const p = toPx(ch.x, ch.y);
    const active = hover === i || (drag && drag.type === 'charge' && drag.i === i);
    const r = 13 * (active ? 1.08 : 1);
    const base = ch.q > 0 ? rgb.pos : ch.q < 0 ? rgb.neg : rgb.muted;
    const mag = Math.min(1, Math.abs(ch.q) / 5);
    const dark = colors.dark;

    // 光暈：大小與亮度隨 |q| 增加
    if (ch.q !== 0) {
      const gr = r * (1.7 + 1.5 * mag);
      const g = c.createRadialGradient(p[0], p[1], r * 0.7, p[0], p[1], gr);
      const a = colors.glow * (0.45 + 0.55 * mag) * (active ? 1.25 : 1);
      g.addColorStop(0, rgba(base, a));
      g.addColorStop(0.45, rgba(base, a * 0.35));
      g.addColorStop(1, rgba(base, 0));
      c.fillStyle = g;
      c.beginPath(); c.arc(p[0], p[1], gr, 0, Math.PI * 2); c.fill();
    }
    // 柔和投影（球浮在平面上方）
    const sh = rgb['ef-shadow'];
    const sg = c.createRadialGradient(p[0] + 1.5, p[1] + 4, r * 0.3, p[0] + 1.5, p[1] + 4, r * 1.25);
    sg.addColorStop(0, rgba(sh, sh[3]));
    sg.addColorStop(1, rgba(sh, 0));
    c.fillStyle = sg;
    c.beginPath(); c.arc(p[0] + 1.5, p[1] + 4, r * 1.25, 0, Math.PI * 2); c.fill();

    if (ch.q !== 0) {
      // 球體：亮點偏左上，邊緣加深
      const g = c.createRadialGradient(p[0] - r * 0.34, p[1] - r * 0.38, r * 0.08, p[0], p[1], r * 1.05);
      g.addColorStop(0, rgba(shade(base, 0.62), 1));
      g.addColorStop(0.32, rgba(shade(base, 0.16), 1));
      g.addColorStop(0.78, rgba(base, 1));
      g.addColorStop(1, rgba(shade(base, -0.38), 1));
      c.fillStyle = g;
      c.beginPath(); c.arc(p[0], p[1], r, 0, Math.PI * 2); c.fill();
      // 右下的細亮邊（rim light）
      c.lineWidth = 1.3;
      c.strokeStyle = rgba(shade(base, 0.55), dark ? 0.75 : 0.6);
      c.beginPath(); c.arc(p[0], p[1], r - 1.1, -0.1 * Math.PI, 0.72 * Math.PI); c.stroke();
      // 外緣細暗線
      c.lineWidth = 1;
      c.strokeStyle = rgba(shade(base, -0.5), 0.55);
      c.beginPath(); c.arc(p[0], p[1], r - 0.5, 0, Math.PI * 2); c.stroke();
      // 高光
      const hg = c.createRadialGradient(p[0] - r * 0.36, p[1] - r * 0.42, 0, p[0] - r * 0.36, p[1] - r * 0.42, r * 0.42);
      hg.addColorStop(0, 'rgba(255,255,255,0.85)');
      hg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = hg;
      c.beginPath(); c.arc(p[0], p[1], r, 0, Math.PI * 2); c.fill();
      // 正負號（線條畫，不依賴字型）
      const L = r * 0.46;
      c.lineCap = 'round';
      c.lineWidth = 2.6;
      c.strokeStyle = rgba(shade(base, -0.55), 0.35);
      c.beginPath();
      c.moveTo(p[0] - L, p[1] + 0.8); c.lineTo(p[0] + L, p[1] + 0.8);
      if (ch.q > 0) { c.moveTo(p[0], p[1] - L + 0.8); c.lineTo(p[0], p[1] + L + 0.8); }
      c.stroke();
      c.strokeStyle = '#fff';
      c.beginPath();
      c.moveTo(p[0] - L, p[1]); c.lineTo(p[0] + L, p[1]);
      if (ch.q > 0) { c.moveTo(p[0], p[1] - L); c.lineTo(p[0], p[1] + L); }
      c.stroke();
    } else {
      // 不帶電：半透明的玻璃球與「0」
      const g = c.createRadialGradient(p[0] - r * 0.34, p[1] - r * 0.38, r * 0.08, p[0], p[1], r * 1.05);
      g.addColorStop(0, rgba(rgb.surface, 0.95));
      g.addColorStop(1, rgba(mixRgb(rgb.surface, base, 0.35), 0.9));
      c.fillStyle = g;
      c.beginPath(); c.arc(p[0], p[1], r, 0, Math.PI * 2); c.fill();
      c.lineWidth = 1.6;
      c.strokeStyle = rgba(base, 0.9);
      c.stroke();
      c.fillStyle = colors.muted;
      c.font = '700 13px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('0', p[0], p[1] + 0.5);
    }
    // 滑過或拖曳中：外框光暈
    if (active) {
      c.lineWidth = 2;
      c.strokeStyle = rgba(ch.q === 0 ? rgb.text : shade(base, dark ? 0.3 : 0), 0.55);
      c.beginPath(); c.arc(p[0], p[1], r + 4.5, 0, Math.PI * 2); c.stroke();
    }

    // 標籤（pill）：「A  +3.0 nC」
    c.font = '700 12.5px system-ui, sans-serif';
    const tA = ch.label, wA = c.measureText(tA).width;
    c.font = '600 12.5px system-ui, sans-serif';
    const tQ = fmtQ(ch.q), wQ = c.measureText(tQ).width;
    const th = textH(c), ph = th + 6, gap = 6, pw = 10 + wA + gap + wQ + 10;
    const wpx = W * scale, hpx = H * scale;
    let ly = p[1] - r - 8 - ph / 2;
    if (ly - ph / 2 < 3) ly = p[1] + r + 8 + ph / 2; // 太靠上就改放下方
    let lx = Math.max(pw / 2 + 3, Math.min(wpx - pw / 2 - 3, p[0]));
    if (ly + ph / 2 > hpx - 3) ly = hpx - 3 - ph / 2;
    roundRect(c, lx - pw / 2, ly - ph / 2, pw, ph, ph / 2);
    c.fillStyle = colors['ef-pill'];
    c.fill();
    c.lineWidth = 1;
    c.strokeStyle = rgba(base, 0.6);
    c.stroke();
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.font = '700 12.5px system-ui, sans-serif';
    c.fillStyle = ch.q === 0 ? colors.muted : rgba(shade(base, dark ? 0.1 : -0.08), 1);
    c.fillText(tA, lx - pw / 2 + 10, ly + 0.5);
    c.font = '600 12.5px system-ui, sans-serif';
    c.fillStyle = colors.text;
    c.fillText(tQ, lx - pw / 2 + 10 + wA + gap, ly + 0.5);
  }

  /** 軌跡：越舊越淡、越細（分段畫） */
  function drawTrail(c, tr) {
    const n = tr.length;
    if (n < 2) return;
    const pc = rgb.probe, bands = Math.min(48, n - 1);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (let b = 0; b < bands; b++) {
      const i0 = Math.floor(b * (n - 1) / bands), i1 = Math.floor((b + 1) * (n - 1) / bands);
      if (i1 <= i0) continue;
      const f = (b + 1) / bands;
      c.lineWidth = 1.1 + 1.6 * f;
      c.strokeStyle = rgba(pc, 0.18 + 0.67 * f * f);
      c.beginPath();
      for (let i = i0; i <= i1; i++) {
        const x = tr[i][0] * scale, y = (H - tr[i][1]) * scale;
        if (i === i0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }
  }

  function drawProbe(c, pr, e) {
    const pp = toPx(pr.x, pr.y), pc = rgb.probe, dark = colors.dark;
    // 起點標記（已移動時）
    if (pr.trail.length > 1 && Math.hypot(pr.x - pr.home.x, pr.y - pr.home.y) > 0.15) {
      const h = toPx(pr.home.x, pr.home.y);
      c.setLineDash([2.5, 2.5]);
      c.lineWidth = 1.3;
      c.strokeStyle = rgba(pc, 0.8);
      c.beginPath(); c.arc(h[0], h[1], 5.5, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
    }
    // 受力方向箭頭（固定長度，只表示方向）
    const fx = pr.q * e.ex, fy = pr.q * e.ey, fm = Math.hypot(fx, fy);
    if (fm > 0 && isFinite(fm)) {
      const L = 44, ux = fx / fm, uy = -fy / fm, shaft = 2.6, hl = shaft * 4, hw = hl * 0.46;
      const tipX = pp[0] + ux * (L + 6), tipY = pp[1] + uy * (L + 6);
      c.lineCap = 'round';
      // 底下一圈背景色的描邊，壓在任何底色上都清楚
      c.strokeStyle = rgba(rgb['canvas-bg'], 0.75);
      c.lineWidth = shaft + 3;
      c.beginPath(); c.moveTo(pp[0], pp[1]); c.lineTo(tipX - ux * hl * 0.6, tipY - uy * hl * 0.6); c.stroke();
      c.fillStyle = rgba(rgb['canvas-bg'], 0.75);
      arrowHead(c, tipX + ux * 1.4, tipY + uy * 1.4, ux, uy, hl + 3, hw + 1.6);
      c.strokeStyle = colors.probe;
      c.lineWidth = shaft;
      c.beginPath(); c.moveTo(pp[0], pp[1]); c.lineTo(tipX - ux * hl * 0.6, tipY - uy * hl * 0.6); c.stroke();
      c.fillStyle = colors.probe;
      arrowHead(c, tipX, tipY, ux, uy, hl, hw);
      // 「F」標籤
      c.font = 'italic 700 13px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      // 預設放在箭頭尖端前方；超出畫面時改放在箭身旁
      const wpx = W * scale, hpx = H * scale;
      let lx = tipX + ux * 9, ly = tipY + uy * 9;
      if (lx < 8 || lx > wpx - 8 || ly < 8 || ly > hpx - 8) {
        const side = (pp[0] - uy * 12 > 8 && pp[0] - uy * 12 < wpx - 8) ? -1 : 1;
        lx = pp[0] + ux * (L * 0.55) + side * uy * 12;
        ly = pp[1] + uy * (L * 0.55) - side * ux * 12;
      }
      c.lineJoin = 'round';
      c.lineWidth = 4;
      c.strokeStyle = rgba(rgb['canvas-bg'], 0.9);
      c.strokeText('F', lx, ly);
      c.fillStyle = colors.probe;
      c.fillText('F', lx, ly);
    }
    // 試探電荷：小光暈 + 光滑小球
    const r = 7;
    const gg = c.createRadialGradient(pp[0], pp[1], r * 0.6, pp[0], pp[1], r * 2.6);
    gg.addColorStop(0, rgba(pc, colors.glow * (state.running ? 1.1 : 0.8)));
    gg.addColorStop(1, rgba(pc, 0));
    c.fillStyle = gg;
    c.beginPath(); c.arc(pp[0], pp[1], r * 2.6, 0, Math.PI * 2); c.fill();
    const sh = rgb['ef-shadow'];
    const sg = c.createRadialGradient(pp[0] + 1, pp[1] + 2.5, r * 0.3, pp[0] + 1, pp[1] + 2.5, r * 1.25);
    sg.addColorStop(0, rgba(sh, sh[3] * 0.9));
    sg.addColorStop(1, rgba(sh, 0));
    c.fillStyle = sg;
    c.beginPath(); c.arc(pp[0] + 1, pp[1] + 2.5, r * 1.25, 0, Math.PI * 2); c.fill();
    const g = c.createRadialGradient(pp[0] - r * 0.35, pp[1] - r * 0.4, r * 0.05, pp[0], pp[1], r * 1.05);
    g.addColorStop(0, rgba(shade(pc, 0.7), 1));
    g.addColorStop(0.35, rgba(shade(pc, 0.15), 1));
    g.addColorStop(0.8, rgba(pc, 1));
    g.addColorStop(1, rgba(shade(pc, -0.4), 1));
    c.fillStyle = g;
    c.beginPath(); c.arc(pp[0], pp[1], r, 0, Math.PI * 2); c.fill();
    c.lineWidth = 1.2;
    c.strokeStyle = rgba(dark ? shade(pc, -0.6) : rgb.surface, 0.9);
    c.beginPath(); c.arc(pp[0], pp[1], r + 0.6, 0, Math.PI * 2); c.stroke();
  }

  /** 比例尺：半透明 pill 底框，橫條長度正好 1 cm */
  function drawScaleBar(c) {
    const hpx = H * scale;
    c.font = '600 12px system-ui, sans-serif';
    const label = '1 cm', tw = c.measureText(label).width, th = textH(c);
    const ph = Math.max(22, th + 8), pw = 12 + scale + 8 + tw + 12;
    const x0 = 10, y0 = hpx - 10 - ph;
    roundRect(c, x0, y0, pw, ph, ph / 2);
    c.fillStyle = colors['ef-pill'];
    c.fill();
    c.lineWidth = 1;
    c.strokeStyle = rgba(rgb.text, 0.15);
    c.stroke();
    const by = Math.round(y0 + ph / 2) + 0.5, bx = x0 + 12;
    c.strokeStyle = colors.text;
    c.lineCap = 'butt';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(bx, by); c.lineTo(bx + scale, by);
    c.moveTo(bx, by - 4); c.lineTo(bx, by + 4);
    c.moveTo(bx + scale, by - 4); c.lineTo(bx + scale, by + 4);
    c.stroke();
    c.lineCap = 'round';
    c.fillStyle = colors.text;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(T('1 cm', '1 cm'), bx + scale + 8, by + 0.5);
  }

  function drawRipples(c, now) {
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i], f = (now - rp.t0) / 380;
      if (f >= 1 || f < 0) { ripples.splice(i, 1); continue; }
      const p = toPx(rp.x, rp.y), e = 1 - Math.pow(1 - f, 3);
      c.lineWidth = 2.5 * (1 - f) + 0.5;
      c.strokeStyle = rgba(rgb.probe, 0.8 * (1 - f));
      c.beginPath(); c.arc(p[0], p[1], 14 + 22 * e, 0, Math.PI * 2); c.stroke();
    }
  }

  function draw() {
    if (!cv.width || !cv.height) return;
    if (!cache) compute();
    if (staticDirty) drawStatic();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(staticCanvas, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 試探電荷軌跡
    const pr = state.probe;
    drawTrail(ctx, pr.trail);

    // 場源電荷
    state.charges.forEach(function (c, i) { drawCharge(ctx, c, i); });

    // 試探電荷與受力方向
    const e = FC.fieldAt(state.charges, pr.x, pr.y);
    drawProbe(ctx, pr, e);

    if (ripples.length) drawRipples(ctx, performance.now());

    // 比例尺
    drawScaleBar(ctx);

    updateReadout(e);
  }
  function rippleLoop() {
    requestDraw();
    if (ripples.length) requestAnimationFrame(rippleLoop);
  }

  // ---------- 數字格式 ----------
  // 科學記號用 HTML <sup> 排版，不依賴特殊上標字元（部分裝置字型缺字）
  function sci(v, unit) {
    if (!isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a === 0) return '0 ' + unit;
    if (a >= 0.01 && a < 1e4) return Number(v.toPrecision(3)).toLocaleString('en-US').replace('-', '−') + ' ' + unit;
    const ex = Math.floor(Math.log10(a));
    const m = v / Math.pow(10, ex);
    return m.toFixed(2).replace('-', '−') + ' × 10<sup>' + String(ex).replace('-', '−') + '</sup> ' + unit;
  }
  // 能量固定以 μJ、小數三位顯示，總能量守恆時數字才會「看得出」不變
  function fmtJ(j) {
    if (!isFinite(j)) return '—';
    const u = j * 1e6;
    return (Math.abs(u) < 0.0005 ? '0.000' : u.toFixed(3)).replace('-', '−') + ' μJ';
  }
  /** 滑桿數字：可直接輸入到小數第 2 位，顯示時去掉多餘的 0，但至少保留 1 位小數（與滑桿間隔一致） */
  function fmtNum(v) { return Math.abs(v).toFixed(2).replace(/0$/, ''); }
  function fmtQ(q) { const s = fmtNum(q); return (s === '0.0' ? '' : q > 0 ? '+' : q < 0 ? '−' : '') + s + ' nC'; }

  function updateReadout(e) {
    const pr = state.probe;
    const em = Math.hypot(e.ex, e.ey);
    $('rE').innerHTML = sci(em, 'N/C');
    if (em > 0 && isFinite(em)) {
      let deg = Math.atan2(e.ey, e.ex) * 180 / Math.PI;
      if (deg < 0) deg += 360;
      $('rDir').textContent = deg.toFixed(1) + T('°（由 +x 逆時針）', '° (CCW from +x)');
    } else {
      $('rDir').textContent = '—';
    }
    $('rV').innerHTML = sci(FC.potentialAt(state.charges, pr.x, pr.y), 'V');
    $('rF').innerHTML = sci(Math.abs(pr.q) * FC.NC * em, 'N');
    const en = FC.energy(state.charges, pr);
    $('rv').innerHTML = sci(Math.hypot(pr.vx, pr.vy) * 100, 'cm/s');
    $('rK').textContent = fmtJ(en.K);
    $('rU').textContent = fmtJ(en.U);
    $('rT').textContent = fmtJ(en.total);
    $('status').textContent = state.status;
  }

  // ---------- 音效（sound.js；音效關閉或沒有載入時完全不呼叫） ----------
  function sound() {
    const S = window.LabSound;
    return S && S.enabled() ? S : null;
  }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  /** 釋放：柔和的兩聲上行提示音 */
  function releaseSound() {
    const S = sound(); if (!S) return;
    S.tone({ freq: 587, dur: 0.12, type: 'sine', gain: 0.4 });
    S.tone({ freq: 880, dur: 0.16, type: 'sine', gain: 0.32, delay: 0.07 });
  }
  /**
   * 撞上場源電荷：短促的「滋」電擊聲（高頻噪音 + 下滑的方波 + 鋸齒波嗡聲）。
   * 音量隨撞擊速率增加（cm/s 取對數壓縮），撞得越快越亮。
   */
  function zapSound(v) {
    const S = sound(); if (!S) return;
    const hard = clamp01(Math.log10(1 + v * 100) / Math.log10(1 + 100));
    const gain = 0.45 + 0.5 * hard;
    S.noise({ dur: 0.07 + 0.07 * hard, gain: gain, filter: 2600 + 2200 * hard, q: 1.6 });
    S.sweep({ from: 1300 + 700 * hard, to: 420, dur: 0.1, type: 'square', gain: gain * 0.45 });
    S.tone({ freq: 330 + 110 * hard, dur: 0.09 + 0.05 * hard, type: 'sawtooth', gain: gain * 0.4 });
  }
  /** 離開畫面：柔和的下滑音 */
  function exitSound() {
    const S = sound(); if (!S) return;
    S.sweep({ from: 760, to: 300, dur: 0.4, type: 'triangle', gain: 0.45 });
  }


  // ---------- 動畫 ----------
  let lastT = 0;
  function tick(t) {
    if (!state.running) return;
    const dt = Math.min((t - lastT) / 1000, 1 / 30);
    lastT = t;
    const pr = state.probe;
    const stop = FC.advance(state.charges, pr, dt, { bounds: VIEW, stopRadius: 0.3 });
    pr.trail.push([pr.x, pr.y]);
    if (pr.trail.length > 4000) pr.trail.shift();
    if (stop) {
      state.running = false;
      state.ended = true;
      if (stop.reason === 'hit') zapSound(Math.hypot(pr.vx, pr.vy)); else exitSound();
      // 撞擊瞬間的短暫波紋（純裝飾；減少動態效果時不畫）
      if (stop.reason === 'hit' && !reducedMotion) {
        const hc = state.charges[stop.charge];
        ripples.push({ x: hc.x, y: hc.y, t0: performance.now() });
        requestAnimationFrame(rippleLoop);
      }
      $('run').textContent = T('釋放', 'Release');
      state.status = stop.reason === 'hit'
        ? T('試探電荷撞上了電荷 ' + state.charges[stop.charge].label + '。',
          'The test charge hit charge ' + state.charges[stop.charge].label + '.')
        : T('試探電荷離開了畫面。', 'The test charge left the screen.');
    }
    draw();
    if (state.running) requestAnimationFrame(tick);
  }
  function setRunning(on) {
    state.running = on;
    $('run').textContent = on ? T('暫停', 'Pause') : T('繼續', 'Resume');
    if (on) {
      state.status = T('運動中…（總能量應保持不變）', 'Moving… (the total energy should stay constant)');
      lastT = performance.now();
      requestAnimationFrame(tick);
    }
  }
  function resetProbe(x, y) {
    const pr = state.probe;
    if (x !== undefined) { pr.home = { x: x, y: y }; }
    pr.x = pr.home.x; pr.y = pr.home.y; pr.vx = 0; pr.vy = 0; pr.trail = [[pr.x, pr.y]];
    state.running = false;
    state.ended = false;
    state.released = false;
    $('run').textContent = T('釋放', 'Release');
    state.status = '';
    requestDraw();
  }

  // ---------- 控制項 ----------
  // 讀滑桿值：numinput.js 打字輸入的精確值會保留（data-decimals 決定精度）
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  function bindSlider(id, fmt, onInput) {
    const el = $(id), out = $(id + 'o');
    const update = function () { out.textContent = fmt(val(el)); };
    el.addEventListener('input', function () { update(); onInput(val(el)); });
    update();
    return {
      el: el,
      // 程式改滑桿（預設情境）：先清掉打字的精確值，再設定滑桿位置
      set: function (v) { if (window.LabNum) window.LabNum.clear(el); el.value = v; update(); }
    };
  }
  const fmtCm = function (v) { return fmtNum(v) + ' cm'; };
  const sA = bindSlider('qA', fmtQ, function (v) { state.charges[0].q = v; invalidate(); });
  const sB = bindSlider('qB', fmtQ, function (v) { state.charges[1].q = v; invalidate(); });
  const sSep = bindSlider('sep', fmtCm, function (v) { placeSymmetric(v); invalidate(); });
  bindSlider('qp', fmtQ, function (v) { state.probe.q = v; requestDraw(); });
  bindSlider('mp', function (v) { return fmtNum(v) + ' g'; }, function (v) { state.probe.m = v; requestDraw(); });

  function placeSymmetric(d) {
    state.charges[0].x = W / 2 - d / 2; state.charges[0].y = H / 2;
    state.charges[1].x = W / 2 + d / 2; state.charges[1].y = H / 2;
  }
  function syncSeparation() {
    const c = state.charges;
    const d = Math.hypot(c[0].x - c[1].x, c[0].y - c[1].y);
    if (window.LabNum) window.LabNum.clear(sSep.el);
    sSep.el.value = Math.min(9, Math.max(1, d));
    $('sepo').textContent = fmtCm(d);
  }

  const PRESETS = {
    dipole: { a: 3, b: -3, d: 4 },
    like: { a: 3, b: 3, d: 4 },
    unequal: { a: 4, b: -2, d: 4 },
    single: { a: 3, b: 0, d: 0 }
  };
  document.querySelectorAll('[data-preset]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const p = PRESETS[btn.dataset.preset];
      state.charges[0].q = p.a; state.charges[1].q = p.b;
      sA.set(p.a); sB.set(p.b);
      if (p.d) { placeSymmetric(p.d); sSep.set(p.d); }
      else { state.charges[0].x = W / 2; state.charges[0].y = H / 2; state.charges[1].x = W - 1.5; state.charges[1].y = 1.5; syncSeparation(); }
      resetProbe(W / 2 + (p.d ? 0 : 2), p.d ? H / 2 + 2 : H / 2);
      invalidate();
    });
  });

  [['showLines', 'lines'], ['showEqui', 'equi'], ['showHeat', 'heat'], ['showGrid', 'grid']].forEach(function (pair) {
    $(pair[0]).addEventListener('change', function (ev) { state.show[pair[1]] = ev.target.checked; staticDirty = true; requestDraw(); });
  });

  $('run').addEventListener('click', function () {
    if (state.running) {
      state.running = false;
      $('run').textContent = T('繼續', 'Resume');
      state.status = T('已暫停', 'Paused');
      requestDraw();
      return;
    }
    if (state.ended) resetProbe(); // 上一次已撞上電荷或離開畫面：從起點重新釋放
    if (!state.released) { state.released = true; releaseSound(); } // 只在從起點釋放時發聲，暫停後繼續不再發聲
    setRunning(true);
  });
  $('resetProbe').addEventListener('click', function () { resetProbe(); });
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

  // ---------- 拖曳 ----------
  let drag = null;
  function eventWorld(ev) {
    const r = cv.getBoundingClientRect();
    const w = toWorld(ev.clientX - r.left, ev.clientY - r.top);
    return [Math.min(W, Math.max(0, w[0])), Math.min(H, Math.max(0, w[1]))];
  }
  /** 游標附近（22 px 內）最近的場源電荷，沒有則 −1 */
  function chargeAt(w) {
    const hitR = 22 / scale;
    let best = -1, bd = Infinity;
    state.charges.forEach(function (c, i) {
      const d = Math.hypot(c.x - w[0], c.y - w[1]);
      if (d < hitR && d < bd) { bd = d; best = i; }
    });
    return best;
  }
  function setHover(i) {
    if (i !== hover) { hover = i; requestDraw(); }
    cv.style.cursor = drag && drag.type === 'charge' ? 'grabbing' : i >= 0 ? 'grab' : '';
  }
  cv.addEventListener('pointerdown', function (ev) {
    const w = eventWorld(ev);
    const best = chargeAt(w);
    if (best >= 0) {
      drag = { type: 'charge', i: best };
      setHover(best);
      requestDraw();
    } else {
      drag = { type: 'probe' };
      resetProbe(w[0], w[1]);
    }
    cv.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  cv.addEventListener('pointermove', function (ev) {
    const w = eventWorld(ev);
    if (!drag) { if (ev.pointerType !== 'touch') setHover(chargeAt(w)); return; }
    if (drag.type === 'charge') {
      state.charges[drag.i].x = w[0];
      state.charges[drag.i].y = w[1];
      syncSeparation();
      invalidate();
    } else {
      resetProbe(w[0], w[1]);
    }
  });
  const endDrag = function (ev) {
    const wasCharge = drag && drag.type === 'charge';
    drag = null;
    if (wasCharge) staticDirty = true; // 補畫電位標籤
    if (ev && ev.pointerType === 'mouse') setHover(chargeAt(eventWorld(ev)));
    else setHover(-1);
    if (wasCharge) requestDraw();
  };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (!drag) setHover(-1); });

  // ---------- 啟動 ----------
  readColors();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { readColors(); invalidate(); });
  // 齒輪設定切換深淺色（以及語言、字體大小）時也重畫（settings.js）
  window.addEventListener('lab:themechange', function () { readColors(); invalidate(); });
  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);
  else window.addEventListener('resize', resize);
  resize();
})();
