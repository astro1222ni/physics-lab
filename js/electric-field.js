/* electric-field.js — 「電場與等位線」模組的畫面與互動（物理計算在 field-core.js）
 * 2D 畫布是預設檢視；3D 檢視（等位面與立體電力線）在 js/electric-field-3d.js，
 * three.js（vendor/three/）只有切換到 3D 時才以 import() 動態載入。 */
(function () {
  'use strict';
  const FC = window.FieldCore;
  const LD = window.LabDraw; // 共用繪圖工具（js/drawkit.js）：立體球、箭頭、標籤底框、格線
  const FONT = LD.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  let view3 = null;      // 目前的 3D 檢視（切回 2D 時釋放）
  let kb = null;         // 鍵盤操作（js/keys.js）：0 = 電荷 A、1 = 電荷 B、2 = 試探電荷

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
    run: null,         // 這一趟的起點資料（任務模式用）：{ x0, y0, V0, total0, clean, maxD, returned }
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
  let levelBoxes = []; // 電位標籤佔的範圍（px，外接矩形），受力標籤 F 避開

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
      // 兩級格線（drawkit）：主格線 1 cm，次格線 0.2 cm（格子夠大時才畫）；對齊裝置像素的 1 px 細線
      // 範圍內縮半個像素：畫面邊緣（x = 0、12 cm；y = 0、8 cm）不畫線
      LD.grid(c, 0.5, 0.5, wpx - 0.5, hpx - 0.5, scale, scale * 0.2 >= 10 ? scale * 0.2 : 0, 0, 0);
    }

    arrowPts = [];
    levelBoxes = [];
    if (state.show.equi) drawEquipotentials(c);
    if (state.show.lines) drawFieldLines(c);
    // 標籤最後畫，底框蓋在線上才清楚；拖曳電荷時先不標（放開後再排），畫面較安定也較快
    if (state.show.equi && !(drag && drag.type === 'charge')) drawLevelLabels(c);
    staticDirty = false;
  }

  function fmtLevel(v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + ' V'; }

  function drawEquipotentials(c) {
    const eq = rgb.equi;
    const trace = function (ct) {
      c.beginPath();
      ct.polys.forEach(function (poly) {
        for (let i = 0; i < poly.length; i++) {
          const x = poly[i][0] * scale, y = (H - poly[i][1]) * scale;
          if (i) c.lineTo(x, y); else c.moveTo(x, y);
        }
      });
    };
    // 0) 極淡的實線底（虛線的空隙也看得出整條等位線，像描在紙上的鉛筆線）
    c.setLineDash([]);
    c.lineWidth = 3;
    c.strokeStyle = rgba(eq, colors.dark ? 0.1 : 0.08);
    cache.contours.forEach(function (ct) { trace(ct); c.stroke(); });
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
    c.font = '600 11px ' + FONT;
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
      const ca = Math.abs(Math.cos(L[3])), sa = Math.abs(Math.sin(L[3]));
      const hx = ca * L[5] / 2 + sa * ph / 2, hy = sa * L[5] / 2 + ca * ph / 2;
      levelBoxes.push({ x: L[0] - hx, y: L[1] - hy, w: 2 * hx, h: 2 * hy });
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
  const CHARGE_R = 13;     // 電荷小球的半徑（px，示意大小）
  const PROBE_R = 7;       // 試探電荷小球的半徑（px）
  let chargeBoxes = [];    // 這一幀電荷小球與標籤佔的位置（受力標籤 F 要避開）

  /** 矩形 rc 與圓 (x, y, r) 是否重疊 */
  function rectHitsCircle(rc, x, y, r) {
    const cx = Math.max(rc.x, Math.min(x, rc.x + rc.w)), cy = Math.max(rc.y, Math.min(y, rc.y + rc.h));
    return Math.hypot(cx - x, cy - y) < r;
  }
  function rectsHit(a, b, pad) {
    pad = pad || 0;
    return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
  }

  /** 場源電荷：電量光暈 → 立體球（drawkit，正負各自的色調）→ 正負號；標籤最後統一排（避開另一個電荷與標籤） */
  function drawCharges(c) {
    const geo = state.charges.map(function (ch, i) {
      const p = toPx(ch.x, ch.y);
      const active = hover === i || (drag && drag.type === 'charge' && drag.i === i);
      return { ch: ch, i: i, x: p[0], y: p[1], r: CHARGE_R * (active ? 1.08 : 1), active: active,
        col: ch.q > 0 ? colors.pos : ch.q < 0 ? colors.neg : colors.muted };
    });
    // 光暈：大小與亮度隨 |q| 增加（深色模式較強）
    geo.forEach(function (g) {
      if (g.ch.q === 0) return;
      const mag = Math.min(1, Math.abs(g.ch.q) / 5), gr = g.r * (1.7 + 1.5 * mag);
      const a = colors.glow * (0.45 + 0.55 * mag) * (g.active ? 1.25 : 1);
      const gg = c.createRadialGradient(g.x, g.y, g.r * 0.7, g.x, g.y, gr);
      gg.addColorStop(0, LD.alpha(g.col, a));
      gg.addColorStop(0.45, LD.alpha(g.col, a * 0.35));
      gg.addColorStop(1, LD.alpha(g.col, 0));
      c.fillStyle = gg;
      c.beginPath(); c.arc(g.x, g.y, gr, 0, Math.PI * 2); c.fill();
    });
    geo.forEach(function (g) {
      const x = g.x, y = g.y, r = g.r;
      if (g.ch.q !== 0) {
        LD.ball(c, x, y, r, g.col, { glow: 0 });
        // 正負號（線條畫，不依賴字型）：先畫一道淡淡的暗影，再畫白色
        const L = r * 0.46;
        const sign = function (oy) {
          c.beginPath();
          c.moveTo(x - L, y + oy); c.lineTo(x + L, y + oy);
          if (g.ch.q > 0) { c.moveTo(x, y - L + oy); c.lineTo(x, y + L + oy); }
        };
        c.lineCap = 'round';
        c.lineWidth = 2.6;
        c.strokeStyle = LD.alpha(LD.shade(g.col, -0.55), 0.38);
        sign(0.9); c.stroke();
        c.strokeStyle = '#ffffff';
        sign(0); c.stroke();
      } else {
        // 不帶電：半透明的玻璃球與「0」
        LD.contactShadow(c, x, y + r * 0.9, r * 0.8, 0.3);
        const gg = c.createRadialGradient(x - r * 0.34, y - r * 0.38, r * 0.08, x, y, r * 1.05);
        gg.addColorStop(0, LD.alpha(colors.surface, 0.95));
        gg.addColorStop(1, LD.alpha(LD.mix(colors.surface, colors.muted, 0.35), 0.9));
        c.fillStyle = gg;
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
        c.lineWidth = 1.6;
        c.strokeStyle = LD.alpha(colors.muted, 0.9);
        c.stroke();
        c.fillStyle = colors.muted;
        c.font = '700 13px ' + FONT;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('0', x, y + 0.5);
      }
      // 滑過或拖曳中：外框光暈
      if (g.active) {
        c.lineWidth = 2;
        c.strokeStyle = LD.alpha(g.ch.q === 0 ? colors.text : LD.shade(g.col, colors.dark ? 0.3 : 0), 0.55);
        c.beginPath(); c.arc(x, y, r + 4.5, 0, Math.PI * 2); c.stroke();
      }
    });
    // 標籤（pill）：「A  +3.0 nC」；上方優先，放不下（出界、壓到另一個電荷、標籤、試探電荷或它的受力箭頭）就改放下方、右方、左方
    const wpx = W * scale, hpx = H * scale;
    const fg = forceGeom(), avoid = [[fg.x, fg.y, PROBE_R + 3]];
    if (fg.tip) for (let a = 0; a <= 50; a += 6) avoid.push([fg.x + fg.ux * a, fg.y + fg.uy * a, 4]);
    chargeBoxes = geo.map(function (g) { return { x: g.x - g.r - 3, y: g.y - g.r - 3, w: 2 * g.r + 6, h: 2 * g.r + 6 }; });
    geo.forEach(function (g) {
      const fA = '700 12.5px ' + FONT, fQ = '600 12.5px ' + FONT;
      c.font = fA;
      const tA = g.ch.label, wA = c.measureText(tA).width;
      c.font = fQ;
      const tQ = fmtQ(g.ch.q), mQ = c.measureText(tQ), wQ = mQ.width;
      const ph = LD.textHeight(mQ, 15) + 6, gap = 6, pw = 10 + wA + gap + wQ + 10;
      const cands = [[g.x, g.y - g.r - 8 - ph / 2], [g.x, g.y + g.r + 8 + ph / 2],
        [g.x + g.r + 8 + pw / 2, g.y], [g.x - g.r - 8 - pw / 2, g.y]];
      let best = null;
      for (let k = 0; k < cands.length; k++) {
        const cx = Math.max(pw / 2 + 3, Math.min(wpx - pw / 2 - 3, cands[k][0]));
        const cy = Math.max(ph / 2 + 3, Math.min(hpx - ph / 2 - 3, cands[k][1]));
        const rc = { x: cx - pw / 2, y: cy - ph / 2, w: pw, h: ph, cx: cx, cy: cy };
        if (!best) best = rc;
        const bad = rectHitsCircle(rc, g.x, g.y, g.r + 3) ||
          geo.some(function (o) { return o !== g && rectHitsCircle(rc, o.x, o.y, o.r + 4); }) ||
          chargeBoxes.some(function (b, j) { return j >= geo.length && rectsHit(rc, b, 3); }) ||
          avoid.some(function (a) { return rectHitsCircle(rc, a[0], a[1], a[2]); });
        if (!bad) { best = rc; break; }
      }
      chargeBoxes.push(best);
      LD.roundRect(c, best.x, best.y, pw, ph, ph / 2);
      c.fillStyle = colors['ef-pill'];
      c.fill();
      c.lineWidth = 1;
      c.strokeStyle = LD.alpha(g.col, 0.6);
      c.stroke();
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.font = fA;
      c.fillStyle = g.ch.q === 0 ? colors.muted : LD.shade(g.col, colors.dark ? 0.1 : -0.08);
      c.fillText(tA, best.x + 10, best.cy + 0.5);
      c.font = fQ;
      c.fillStyle = colors.text;
      c.fillText(tQ, best.x + 10 + wA + gap, best.cy + 0.5);
    });
  }

  /** 軌跡：底下一層柔和光暈（最新一段較亮），上面越舊越淡、越細（分段畫） */
  function drawTrail(c, tr) {
    const n = tr.length;
    if (n < 2) return;
    const pc = colors.probe, bands = Math.min(48, n - 1);
    const path = function (i0, i1) {
      c.beginPath();
      for (let i = i0; i <= i1; i++) {
        const x = tr[i][0] * scale, y = (H - tr[i][1]) * scale;
        if (i === i0) c.moveTo(x, y); else c.lineTo(x, y);
      }
    };
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = LD.alpha(pc, colors.dark ? 0.13 : 0.07);
    c.lineWidth = 6;
    path(0, n - 1); c.stroke();
    c.strokeStyle = LD.alpha(pc, colors.dark ? 0.2 : 0.1);
    c.lineWidth = 9;
    path(Math.max(0, n - 70), n - 1); c.stroke();
    for (let b = 0; b < bands; b++) {
      const i0 = Math.floor(b * (n - 1) / bands), i1 = Math.floor((b + 1) * (n - 1) / bands);
      if (i1 <= i0) continue;
      const f = (b + 1) / bands;
      c.lineWidth = 1.1 + 1.6 * f;
      c.strokeStyle = LD.alpha(pc, 0.18 + 0.67 * f * f);
      path(i0, i1); c.stroke();
    }
  }

  /** 試探電荷的位置（px）與受力方向的單位向量（畫面座標，y 向下）；受力為零時 tip = false */
  function forceGeom() {
    const pr = state.probe, pp = toPx(pr.x, pr.y), e = FC.fieldAt(state.charges, pr.x, pr.y);
    const fx = pr.q * e.ex, fy = pr.q * e.ey, fm = Math.hypot(fx, fy);
    const ok = fm > 0 && isFinite(fm);
    return { x: pp[0], y: pp[1], ux: ok ? fx / fm : 0, uy: ok ? -fy / fm : 0, tip: ok };
  }
  function drawProbe(c, pr, e) {
    const pp = toPx(pr.x, pr.y), pc = colors.probe;
    const wpx = W * scale, hpx = H * scale;
    // 起點標記（已移動時）
    if (pr.trail.length > 1 && Math.hypot(pr.x - pr.home.x, pr.y - pr.home.y) > 0.15) {
      const h = toPx(pr.home.x, pr.home.y);
      c.setLineDash([2.5, 2.5]);
      c.lineWidth = 1.3;
      c.strokeStyle = LD.alpha(pc, 0.8);
      c.beginPath(); c.arc(h[0], h[1], 5.5, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
    }
    // 受力方向箭頭（drawkit；固定長度 50 px，只表示方向）
    const fx = pr.q * e.ex, fy = pr.q * e.ey, fm = Math.hypot(fx, fy);
    if (fm > 0 && isFinite(fm)) {
      const L = 50, ux = fx / fm, uy = -fy / fm;
      const tipX = pp[0] + ux * L, tipY = pp[1] + uy * L;
      // 「F」標籤：尖端前方優先；出界或壓到電荷（及其標籤）時改放箭身兩側或試探電荷後方
      const nx = -uy, ny = ux, lw = 16, lh = 18;
      const cands = [[ux * 11, uy * 11], [nx * 13 - ux * 18, ny * 13 - uy * 18], [-nx * 13 - ux * 18, -ny * 13 - uy * 18],
        [nx * 13 - ux * 38, ny * 13 - uy * 38], [-nx * 13 - ux * 38, -ny * 13 - uy * 38], [-ux * (L + 15), -uy * (L + 15)]];
      let off = cands[0];
      for (let k = 0; k < cands.length; k++) {
        const x = tipX + cands[k][0], y = tipY + cands[k][1];
        const rc = { x: x - lw / 2, y: y - lh / 2, w: lw, h: lh };
        if (x < 9 || x > wpx - 9 || y < 9 || y > hpx - 9) continue;
        if (chargeBoxes.some(function (b) { return rectsHit(rc, b, 1); })) continue;
        if (levelBoxes.some(function (b) { return rectsHit(rc, b, 0); })) continue;
        off = cands[k]; break;
      }
      LD.arrow(c, pp[0], pp[1], tipX, tipY, pc, 2.6, { label: 'F', lx: off[0], ly: off[1] });
    }
    // 試探電荷：立體小球（drawkit）＋光暈（運動中稍亮）
    LD.ball(c, pp[0], pp[1], PROBE_R, pc, { glow: colors.dark ? (state.running ? 0.55 : 0.4) : (state.running ? 0.3 : 0.2) });
  }

  /** 比例尺：半透明圓角底框，橫條長度正好 1 cm */
  function drawScaleBar(c) {
    const hpx = H * scale;
    c.font = '600 12px ' + FONT;
    const label = '1 cm', m = c.measureText(label), tw = m.width, th = LD.textHeight(m, 15);
    const ph = Math.max(22, th + 8), pw = 12 + scale + 8 + tw + 12;
    const x0 = 10, y0 = hpx - 10 - ph;
    c.save();
    c.shadowColor = colors.dark ? 'rgba(0,0,0,0.45)' : LD.alpha(colors.text, 0.16);
    c.shadowBlur = 6;
    c.shadowOffsetY = 1;
    LD.roundRect(c, x0, y0, pw, ph, ph / 2);
    c.fillStyle = colors['ef-pill'];
    c.fill();
    c.restore();
    c.lineWidth = 1;
    c.strokeStyle = LD.alpha(colors.text, 0.15);
    LD.roundRect(c, x0, y0, pw, ph, ph / 2);
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
    c.fillText(label, bx + scale + 8, by + 0.5);
  }

  function drawRipples(c, now) {
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i], f = (now - rp.t0) / 380;
      if (f >= 1 || f < 0) { ripples.splice(i, 1); continue; }
      const p = toPx(rp.x, rp.y);
      LD.ripple(c, p[0], p[1], CHARGE_R + 1, 1 - Math.pow(1 - f, 3), colors.probe);
    }
  }

  /** 鍵盤選取的物件周圍畫焦點框（--accent 虛線圓角框） */
  function drawKeyFocus(c) {
    if (!kb || !kb.focused()) return;
    const i = kb.index();
    let x, y, r;
    if (i < 2) { const ch = state.charges[i], p = toPx(ch.x, ch.y); x = p[0]; y = p[1]; r = CHARGE_R + 7; }
    else { const p = toPx(state.probe.x, state.probe.y); x = p[0]; y = p[1]; r = PROBE_R + 8; }
    c.save();
    c.strokeStyle = LD.c.accent;
    c.lineWidth = 2;
    c.setLineDash([5, 4]);
    LD.roundRect(c, x - r, y - r, 2 * r, 2 * r, 8);
    c.stroke();
    c.restore();
  }

  function draw() {
    if (view3 && view3.active) { draw3(); return; }
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

    // 場源電荷（含標籤）
    drawCharges(ctx);

    // 試探電荷與受力方向
    const e = FC.fieldAt(state.charges, pr.x, pr.y);
    drawProbe(ctx, pr, e);

    if (ripples.length) drawRipples(ctx, performance.now());

    // 比例尺、鍵盤焦點框
    drawScaleBar(ctx);
    drawKeyFocus(ctx);

    updateReadout(e);
  }
  function rippleLoop() {
    requestDraw();
    if (ripples.length) requestAnimationFrame(rippleLoop);
  }
  /** 3D 檢視時：2D 的格點電位、等位線（z = 0 截面）照常計算，交給 3D 畫在 z = 0 平面上 */
  function draw3() {
    if (!cache) compute();
    view3.frame();
    updateReadout(FC.fieldAt(state.charges, state.probe.x, state.probe.y));
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
    // 狀態列有 aria-live：只在文字真的改變時才寫（每一幀重寫會讓螢幕閱讀器重複念）
    if ($('status').textContent !== state.status) $('status').textContent = state.status;
    // 運動中的速率與總能量：寫進另一個 .sr-only 狀態列，至少間隔 1 秒才更新
    if (state.running) {
      const t = performance.now();
      if (t - srNowAt >= 1000) {
        srNowAt = t;
        const el = $('srNow');
        if (el) el.textContent = T('速率 ', 'Speed ') + plain(Math.hypot(pr.vx, pr.vy) * 100) + ' cm/s' +
          T('，總能量 ', ', total energy ') + fmtJ(en.total);
      }
    }
  }
  let srNowAt = -1e9;

  // ---------- 無障礙：讀數播報 ----------
  // 撞上電荷或離開畫面寫進可見的 #status（aria-live）；放好試探電荷、移動場源或改電量後（停止調整約 0.9 s），
  // 把試探電荷所在處的 E、V 寫進 .sr-only 的 #srSay
  /** 給螢幕閱讀器的數字：三位有效數字、千分位，不用上標 */
  function plain(v) {
    if (!isFinite(v)) return '—';
    return Number(v.toPrecision(3)).toLocaleString('en-US', { maximumFractionDigits: 6 }).replace('-', '−');
  }
  function fieldText() {
    const pr = state.probe, info = FC.probeInfo(state.charges, pr.x, pr.y);
    const dir = info.E > 0 && isFinite(info.E) ? ((Math.atan2(info.ey, info.ex) * 180 / Math.PI + 360) % 360).toFixed(0) : null;
    return T('試探電荷在 (' + pr.x.toFixed(1) + ', ' + pr.y.toFixed(1) + ') cm：電場 ' + plain(info.E) + ' N/C' +
      (dir !== null ? '，方向 ' + dir + '°' : '') + '，電位 ' + plain(info.V) + ' V。',
    'Test charge at (' + pr.x.toFixed(1) + ', ' + pr.y.toFixed(1) + ') cm: field ' + plain(info.E) + ' N/C' +
      (dir !== null ? ', direction ' + dir + '°' : '') + ', potential ' + plain(info.V) + ' V.');
  }
  let sayTimer = 0, sayLaterTimer = 0;
  function say(msg) {
    const el = $('srSay');
    if (!el || !msg) return;
    clearTimeout(sayTimer);
    el.textContent = '';
    sayTimer = setTimeout(function () { el.textContent = msg; }, 60); // 先清空再寫，同樣的字也會再念一次
  }
  function sayField() {
    clearTimeout(sayLaterTimer);
    sayLaterTimer = setTimeout(function () { if (!state.running) say(fieldText()); }, 900);
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


  // ---------- 任務模式（missions.js）：回報物理量 ----------
  /** 場源與試探電荷在 (x, y) 的完整狀態（位置 cm、電量 nC、E N/C、V V） */
  function snapshot(x, y) {
    const c = state.charges, pr = state.probe;
    const info = FC.probeInfo(c, x, y);
    return {
      qA: c[0].q, qB: c[1].q, xA: c[0].x, yA: c[0].y, xB: c[1].x, yB: c[1].y,
      d: Math.hypot(c[0].x - c[1].x, c[0].y - c[1].y),
      x: x, y: y, q: pr.q, m: pr.m,
      ex: info.ex, ey: info.ey, E: info.E, Esum: info.Esum, dir: info.dir, V: info.V, Vsum: info.Vsum
    };
  }
  /** 場源的「指紋」：判斷兩趟是不是在同樣的場中 */
  function sourceSig() {
    return state.charges.map(function (c) { return [c.x, c.y, c.q].join(','); }).join(';');
  }
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  /** 試探電荷沒有在運動時，回報目前的靜態配置（使用者放好試探電荷或改了場源之後） */
  function emitProbe(key) {
    if (!window.LabMission || state.running) return;
    emit('probe', Object.assign(snapshot(state.probe.x, state.probe.y), { key: key }));
  }
  /** 這一趟運動中改了電量、質量或場源：能量不再守恆，這一趟不算 */
  function taint() { if (state.run && !state.ended) state.run.clean = false; }
  /** 一趟運動的共同資料：起點、起點電位與總能量、是否乾淨 */
  function runData() {
    const pr = state.probe, r = state.run, en = FC.energy(state.charges, pr);
    return Object.assign(snapshot(pr.x, pr.y), {
      x0: r.x0, y0: r.y0, V0: r.V0, total0: r.total0, clean: r.clean, sig: sourceSig(),
      v: Math.hypot(pr.vx, pr.vy) * 100, K: en.K, U: en.U, total: en.total
    });
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
    const run = state.run;
    if (run) {
      // 離開起點至少 1 cm 後又回到起點附近（靜止釋放 → 回到同一條等位線時速度為零，沿原路折返）
      const dist = Math.hypot(pr.x - run.x0, pr.y - run.y0);
      run.maxD = Math.max(run.maxD, dist);
      if (!run.returned && run.maxD >= 1 && dist < 0.15) {
        run.returned = true;
        emit('return', { x0: run.x0, y0: run.y0, dist: dist, maxDist: run.maxD,
          qA: state.charges[0].q, qB: state.charges[1].q, q: pr.q, m: pr.m, clean: run.clean });
      }
    }
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
      if (run) {
        emit('end', Object.assign(runData(), {
          reason: stop.reason,
          hit: stop.reason === 'hit' ? stop.charge : -1,
          hitQ: stop.reason === 'hit' ? state.charges[stop.charge].q : 0
        }));
      }
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
    state.run = null;
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
    el.addEventListener('input', function () { update(); onInput(val(el)); taint(); });
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
  // 放開滑桿（或打字輸入完成）時回報新的場源配置
  [['qA', 'qA'], ['qB', 'qB'], ['sep', 'sep']].forEach(function (pair) {
    $(pair[0]).addEventListener('change', function () { emitProbe(pair[1]); sayField(); });
  });

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
      sayField();
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
      if (state.run) emit('pause', runData());
      return;
    }
    if (state.ended) resetProbe(); // 上一次已撞上電荷或離開畫面：從起點重新釋放
    if (!state.released) { // 只在從起點釋放時發聲，暫停後繼續不再發聲
      state.released = true;
      releaseSound();
      const pr = state.probe;
      state.run = { x0: pr.x, y0: pr.y, V0: FC.potentialAt(state.charges, pr.x, pr.y),
        total0: FC.energy(state.charges, pr).total, clean: true, maxD: 0, returned: false };
      emit('release', Object.assign(snapshot(pr.x, pr.y), { V0: state.run.V0, total0: state.run.total0 }));
    }
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
      if (kb) kb.select(best); // 鍵盤接著操作剛拖曳的物件
      requestDraw();
    } else {
      drag = { type: 'probe' };
      if (kb) kb.select(2);
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
      taint();
      syncSeparation();
      invalidate();
    } else {
      resetProbe(w[0], w[1]);
    }
  });
  const endDrag = function (ev) {
    const wasCharge = drag && drag.type === 'charge';
    const wasProbe = drag && drag.type === 'probe';
    drag = null;
    if (wasCharge || wasProbe) { emitProbe(wasCharge ? 'drag' : 'probe'); sayField(); }
    if (wasCharge) staticDirty = true; // 補畫電位標籤
    if (ev && ev.pointerType === 'mouse') setHover(chargeAt(eventWorld(ev)));
    else setHover(-1);
    if (wasCharge) requestDraw();
  };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (!drag) setHover(-1); });

  // ---------- 鍵盤操作（js/keys.js）：Enter 切換電荷 A、電荷 B、試探電荷，方向鍵移動 ----------
  // 限制與拖曳完全相同（畫面範圍 0–12 cm × 0–8 cm），觸發相同的任務事件（放開拖曳時的 probe 事件）與重畫
  const STEP = 0.1, STEP_BIG = 1; // cm
  const clampX = function (x) { return Math.min(W, Math.max(0, x)); };
  const clampY = function (y) { return Math.min(H, Math.max(0, y)); };
  const r6 = function (v) { return Math.round(v * 1e6) / 1e6; }; // 去掉浮點誤差（1e-6 cm）
  function chargeName(i) { return T('電荷 ', 'Charge ') + state.charges[i].label; }
  function chargeDesc(i) {
    const c = state.charges[i];
    return chargeName(i) + T('：位置 (', ': position (') + c.x.toFixed(1) + ', ' + c.y.toFixed(1) + ') cm' +
      T('，電量 ', ', charge ') + fmtQ(c.q) + T('。', '.');
  }
  function keyMoveCharge(i, dx, dy, big) {
    const c = state.charges[i], s = big ? STEP_BIG : STEP;
    const x = clampX(r6(c.x + dx * s)), y = clampY(r6(c.y + dy * s));
    if (x === c.x && y === c.y) return false;
    c.x = x; c.y = y;
    taint();
    syncSeparation();
    invalidate();
    emitProbe('drag');
    sayField();
    return true;
  }
  function keyMoveProbe(dx, dy, big) {
    const pr = state.probe, s = big ? STEP_BIG : STEP;
    // 從畫面上看到的位置出發（運動中或停下來的地方），和用滑鼠在那裡按下去一樣：重新放置、回到靜止
    const x = clampX(r6(clampX(pr.x) + dx * s)), y = clampY(r6(clampY(pr.y) + dy * s));
    if (x === pr.x && y === pr.y && x === pr.home.x && y === pr.home.y && !state.running) return false;
    resetProbe(x, y);
    emitProbe('probe');
    sayField();
    return true;
  }
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('電場模擬畫布：電荷 A、B 的電力線、等位線與電位色階，以及試探電荷與它的受力方向。拖曳電荷改變位置，點擊空白處放置試探電荷；鍵盤操作：Enter 切換電荷 A、電荷 B、試探電荷，方向鍵移動 0.1 cm，Shift 加方向鍵移動 1 cm。',
        'Electric field canvas: the field lines, equipotentials and potential shading of charges A and B, and the test charge with the direction of the force on it. Drag a charge to move it, click an empty spot to place the test charge. Keyboard: Enter picks charge A, charge B or the test charge, the arrow keys move it 0.1 cm, Shift with an arrow key 1 cm.'),
      items: [0, 1].map(function (i) {
        return {
          name: function () { return chargeName(i); },
          move: function (dx, dy, big) { return keyMoveCharge(i, dx, dy, big); },
          describe: function () { return chargeDesc(i); }
        };
      }).concat([{
        name: function () { return T('試探電荷', 'Test charge'); },
        move: keyMoveProbe,
        describe: fieldText
      }]),
      onChange: requestDraw
    });
  }

  // ---------- 分享連結（classroom.js）：畫布上拖曳出來的狀態 ----------
  // 電量、間距、顯示選項由滑桿與勾選框自動記錄；這裡補上兩個電荷的實際位置與試探電荷的起點
  // 頁面程式執行時 classroom.js 還沒載入：用佇列寫法，classroom.js 載入時會補登記（分享連結在 load 之後才還原）
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      return { c: state.charges.map(function (c) { return [r6(c.x), r6(c.y)]; }), p: [r6(state.probe.home.x), r6(state.probe.home.y)] };
    },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      const pt = function (a) {
        return Array.isArray(a) && a.length >= 2 && typeof a[0] === 'number' && typeof a[1] === 'number' && isFinite(a[0]) && isFinite(a[1])
          ? [clampX(a[0]), clampY(a[1])] : null;
      };
      if (Array.isArray(o.c)) {
        o.c.slice(0, state.charges.length).forEach(function (a, i) {
          const q = pt(a);
          if (q) { state.charges[i].x = q[0]; state.charges[i].y = q[1]; }
        });
        syncSeparation();
      }
      const p = pt(o.p);
      if (p) resetProbe(p[0], p[1]); else resetProbe();
      invalidate();
    }
  });

  // =====================================================================
  // 3D 檢視（three.js，切換到 3D 時才以 import() 動態載入 vendor/three/；場景在 js/electric-field-3d.js）
  // =====================================================================
  let threeLib = null;   // { THREE, OrbitControls }
  let loadToken = 0;
  let cut3 = false;      // 剖半：拿掉 z > 0 的上半部，看等位面的內部
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');

  function webglAvailable() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function create3D(lib) {
    return window.ElectricField3D.create(lib, {
      host: host3, W: W, H: H, Z: 4, levels: LEVELS, state: state,
      getCache: function () { if (!cache) compute(); return cache; },
      heatCanvas: heatCanvas,
      colors: function () { return colors; },
      rgb: function () { return rgb; },
      T: T, fmtQ: fmtQ,
      reducedMotion: function () { return reducedMotion; },
      potKey: $('potKey'),
      isCut: function () { return cut3; },
      onLost: function () {
        setView('2d');
        viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
      }
    });
  }
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function updateViewTools() {
    const is3 = !!(view3 && view3.active);
    $('resetCam').hidden = !is3;
    $('cut3d').hidden = !is3;
    $('cut3d').setAttribute('aria-pressed', String(cut3));
  }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable() || !window.ElectricField3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return; // 載入期間已切回 2D
        // 先讓「載入中」的訊息畫出來，再計算等位面（約零點一秒）
        requestAnimationFrame(function () {
          if (token !== loadToken) return;
          try {
            stage.classList.add('is3d');
            if (!cache) compute();
            view3 = create3D(lib);
          } catch (err) {
            if (window.console) console.warn('3D view unavailable:', err);
            fail3D();
            return;
          }
          viewMsg.textContent = '';
          updateViewTools();
          draw();
        });
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      if (view3) { view3.dispose(); view3 = null; }
      stage.classList.remove('is3d');
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      updateViewTools();
      staticDirty = true;
      resize();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    updateViewTools();
    staticDirty = true;
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  $('cut3d').addEventListener('click', function () {
    cut3 = !cut3;
    updateViewTools();
    if (view3) view3.setCut(cut3);
  });

  // ---------- 啟動 ----------
  function onTheme() {
    readColors();
    invalidate();
    if (view3 && view3.active) view3.onTheme();
  }
  readColors();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme);
  // 齒輪設定切換深淺色（以及語言、字體大小）時也重畫（settings.js）
  window.addEventListener('lab:themechange', onTheme);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);
  else window.addEventListener('resize', resize);
  resize();
})();
