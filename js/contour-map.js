/* contour-map.js — 「等高線與 3D 地形」的畫面與互動
 * 數學全部在 contour-map-core.js；3D 在 contour-map-3d.js（切換到 3D 時才載入）。 */
(function () {
  'use strict';
  const K = window.ContourCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const FONT = D.FONT;
  const SIZE = K.SIZE, N = K.N, CELL = K.CELL;
  const RIVER_KM2 = 0.35;
  const IVS = [10, 20, 25, 50, 100];

  const NAMES = {
    twin: ['雙峰島', 'Twin-peak island'], volcano: ['火山島', 'Volcanic island'],
    valley: ['河谷島', 'Valley island'], terrace: ['海階島', 'Terrace island']
  };
  const CRIT = { peak: ['山頂', 'a summit'], pit: ['窪地的底', 'the bottom of a hollow'], saddle: ['鞍部', 'a saddle'] };
  const DIR8 = [['北', 'north'], ['東北', 'north-east'], ['東', 'east'], ['東南', 'south-east'], ['南', 'south'], ['西南', 'south-west'], ['西', 'west'], ['西北', 'north-west']];
  const CLS_TXT = ['', '≤ 5%', '5–15%', '15–30%', '30–40%', '40–55%', '> 55%'];
  const CLS_ZH = ['', '一級坡', '二級坡', '三級坡', '四級坡', '五級坡', '六級坡'];

  /** 河道平滑：位置做兩次 1-2-3-2-1 加權平均（約 ±40 m），去掉谷底小雜訊造成的鋸齒；兩端點不動 */
  function smoothRiver(pts) {
    let p = pts;
    const W = [1, 2, 3, 2, 1];
    for (let it = 0; it < 2; it++) {
      if (p.length < 5) return p;
      const q = p.map(function (v) { return v.slice(); });
      for (let i = 1; i < p.length - 1; i++) {
        let sx = 0, sy = 0, sw = 0;
        for (let o = -2; o <= 2; o++) {
          const k = i + o;
          if (k < 0 || k >= p.length) continue;
          sx += W[o + 2] * p[k][0]; sy += W[o + 2] * p[k][1]; sw += W[o + 2];
        }
        q[i][0] = sx / sw; q[i][1] = sy / sw;
      }
      p = q;
    }
    return p;
  }

  // 地形快取（每座島只算一次）
  const cache = {};
  function terrain(id) {
    if (cache[id]) return cache[id];
    const TR = K.make(id);
    // 網格上的梯度（陰影、坡度著色用）
    const g = TR.grid, gx = new Float32Array(N * N), gy = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(N - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(N - 1, j + 1);
      gx[j * N + i] = (g[j * N + i1] - g[j * N + i0]) / ((i1 - i0) * CELL);
      gy[j * N + i] = (g[j1 * N + i] - g[j0 * N + i]) / ((j1 - j0) * CELL);
    }
    TR.gx = gx; TR.gy = gy;
    TR.rivers = K.riverLines(TR, RIVER_KM2).map(smoothRiver);
    TR.levels = {};
    cache[id] = TR;
    return TR;
  }

  // =====================================================================
  // 狀態與控制項
  // =====================================================================
  const el = { sea: $('sea'), vexag: $('vexag'), slice: $('slice') };
  const DEF = { A: [100, 6500], B: [7750, 1750], probe: [4300, 5300] };
  const state = {
    preset: 'twin', iv: 50, tint: 'height', shade: true, lines: true, rivers: true,
    sea: 0, vexag: 2, slice: 600,
    probe: DEF.probe.slice(), A: DEF.A.slice(), B: DEF.B.slice(),
    acted: false
  };
  let TR = terrain('twin');
  function readSliders() {
    state.sea = Math.max(0, Math.min(1000, val(el.sea)));
    state.vexag = Math.max(1, Math.min(10, val(el.vexag)));
    state.slice = Math.max(0, Math.min(1000, val(el.slice)));
  }
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--cm-sea', '--cm-sea2', '--cm-coast', '--cm-line', '--cm-index', '--cm-river', '--cm-prof', '--cm-see', '--cm-block', '--cm-slice', '--cm-probe', '--cm-paper',
      '--text', '--muted', '--border', '--surface', '--bg', '--accent']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    const s = v.toFixed(d == null ? 0 : d);
    return s === '-0' || /^-0\.0*$/.test(s) ? s.slice(1) : s;
  }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function km(m, d) { return num(m / 1000, d == null ? 2 : d) + ' km'; }
  function dirName(az) { if (az == null) return null; const k = Math.round(az / 45) % 8; return T(DIR8[k][0], DIR8[k][1]); }

  // 高度色階（公尺）與坡度分級的顏色：淺色、深色兩組
  const RAMP_L = [[-1, '#8fbf7a'], [100, '#b6d48b'], [250, '#e3e1a1'], [450, '#e3c27f'], [650, '#c99a63'], [850, '#a77a56'], [1000, '#ece5da']];
  const RAMP_D = [[-1, '#3d6a3c'], [100, '#55763f'], [250, '#787a46'], [450, '#7c6541'], [650, '#6c4f35'], [850, '#5b4435'], [1000, '#8a8379']];
  const CLS_L = ['#3a9d5d', '#9ccc65', '#f1d14a', '#f59f3a', '#e2572e', '#ad2340'];
  const CLS_D = ['#2c7a49', '#6d9a44', '#b39a33', '#b6732a', '#a5411f', '#87233a'];
  let rampRGB = [], clsRGB = [];
  function buildPalettes() {
    const R = D.dark ? RAMP_D : RAMP_L, Cl = D.dark ? CLS_D : CLS_L;
    rampRGB = R.map(function (s) { return [s[0], D.rgb(s[1])]; });
    clsRGB = Cl.map(function (c) { return D.rgb(c); });
  }
  function rampAt(h) {
    const R = rampRGB;
    if (h <= R[0][0]) return R[0][1];
    for (let k = 1; k < R.length; k++) if (h <= R[k][0]) {
      const t = (h - R[k - 1][0]) / (R[k][0] - R[k - 1][0]), a = R[k - 1][1], b = R[k][1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
    return R[R.length - 1][1];
  }

  // =====================================================================
  // 畫布與地圖座標（地圖是正方形，置中；上方是北）
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const pf = $('pf'), pctx = pf.getContext('2d');
  let cvSize = { w: 300, h: 300, dpr: 1 }, pfSize = { w: 300, h: 200, dpr: 1 };
  function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || 300, h = cv.clientHeight || 300;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cvSize = { w: w, h: h, dpr: dpr };
    const pw = pf.clientWidth || 300, ph = pf.clientHeight || 200;
    pf.width = Math.round(pw * dpr); pf.height = Math.round(ph * dpr);
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pfSize = { w: pw, h: ph, dpr: dpr };
    rasterKey = ''; pathKey = '';
  }
  function geom() {
    const m = cvSize.w < 520 ? 6 : 10;
    const side = Math.max(60, Math.min(cvSize.w - 2 * m, cvSize.h - 2 * m));
    return { ox: (cvSize.w - side) / 2, oy: (cvSize.h - side) / 2, side: side, sc: side / SIZE };
  }
  function toS(p, g) { return [g.ox + p[0] * g.sc, g.oy + (SIZE - p[1]) * g.sc]; }
  function fromS(x, y, g) { return [(x - g.ox) / g.sc, SIZE - (y - g.oy) / g.sc]; }
  function clampXY(p) { return [Math.max(0, Math.min(SIZE, p[0])), Math.max(0, Math.min(SIZE, p[1]))]; }

  // =====================================================================
  // 底圖點陣：分層設色／坡度分級＋陰影＋海（依海平面）
  // =====================================================================
  let raster = null, rasterKey = '', interacting = false, refineTimer = 0;
  function beginInteract() {
    interacting = true;
    clearTimeout(refineTimer);
    refineTimer = setTimeout(function () { interacting = false; requestDraw(); }, 180);
  }
  function bil(arr, fx, fy) {
    const i = Math.min(N - 2, Math.floor(fx)), j = Math.min(N - 2, Math.floor(fy)), tx = fx - i, ty = fy - j;
    const k = j * N + i;
    return arr[k] * (1 - tx) * (1 - ty) + arr[k + 1] * tx * (1 - ty) + arr[k + N] * (1 - tx) * ty + arr[k + N + 1] * tx * ty;
  }
  /** 畫出 px × px 的底圖（不含線條） */
  function renderRaster(px, opt) {
    opt = opt || {};
    const key = [TR.id, state.sea, state.tint, state.shade, D.dark, px, opt.tex ? 1 : 0].join('|');
    if (!opt.tex && raster && rasterKey === key) return raster;
    const c = document.createElement('canvas'); c.width = px; c.height = px;
    const g = c.getContext('2d'), id = g.createImageData(px, px), o = id.data;
    const sea1 = D.rgb(C['cm-sea']), sea2 = D.rgb(C['cm-sea2']), paper = D.rgb(C['cm-paper']);
    const dark = D.dark;
    // 陽光從西北方、仰角 45° 照下來；地形垂直放大 2 倍讓陰影明顯
    const z = 2, lx = -Math.SQRT1_2 * Math.SQRT1_2, ly = Math.SQRT1_2 * Math.SQRT1_2, lz = Math.SQRT1_2;
    const sea = state.sea, f = (N - 1) / px;
    for (let j = 0; j < px; j++) {
      const fy = (px - 1 - j + 0.5) * f;            // 影像第 j 列 → 北方在上
      for (let i = 0; i < px; i++) {
        const fx = (i + 0.5) * f;
        const h = bil(TR.grid, fx, fy);
        const gx = bil(TR.gx, fx, fy), gy = bil(TR.gy, fx, fy);
        let col;
        let lit = 1;
        if (state.shade || h <= sea) {
          const nx = -z * gx, ny = -z * gy, nn = Math.hypot(nx, ny, 1);
          const sh = Math.max(0, (nx * lx + ny * ly + lz) / nn);
          lit = Math.max(0.35, Math.min(1.25, 1 + (sh - lz) * 1.15));
        }
        if (h <= sea) {
          const depth = sea - h, t = 1 - Math.exp(-depth / 70);
          col = [sea1[0] + (sea2[0] - sea1[0]) * t, sea1[1] + (sea2[1] - sea1[1]) * t, sea1[2] + (sea2[2] - sea1[2]) * t];
          lit = 1 + (lit - 1) * 0.35 * (1 - t);   // 淺海底的起伏淡淡看得到
        } else if (state.tint === 'slope') {
          const pct = Math.hypot(gx, gy) * 100;
          col = clsRGB[K.slopeClass(pct) - 1];
        } else if (state.tint === 'height') col = rampAt(h);
        else col = paper;
        if (h > sea && !state.shade) lit = 1;
        else if (h > sea && state.tint === 'none') lit = 1 + (lit - 1) * 0.7;
        const k = (j * px + i) * 4;
        if (dark && h > sea) lit = 1 + (lit - 1) * 0.9;
        o[k] = Math.min(255, col[0] * lit); o[k + 1] = Math.min(255, col[1] * lit); o[k + 2] = Math.min(255, col[2] * lit); o[k + 3] = 255;
      }
    }
    g.putImageData(id, 0, 0);
    if (!opt.tex) { raster = c; rasterKey = key; }
    return c;
  }

  // =====================================================================
  // 等高線（每座島、每種等高距只描一次）與畫布上的路徑
  // =====================================================================
  function levelsOf(TRr, iv) {
    if (TRr.levels[iv]) return TRr.levels[iv];
    const out = [];
    for (let L = iv; L < TRr.max; L += iv) {
      const lines = K.contours(TRr, L);
      out.push({ level: L, index: L % (iv * 5) === 0, lines: lines, dep: lines.map(function (ln) { return K.isDepressionLoop(TRr, ln); }) });
    }
    TRr.levels[iv] = out;
    return out;
  }
  let paths = null, pathKey = '';
  function linePath(lines, g) {
    const p = new Path2D();
    lines.forEach(function (ln) {
      ln.pts.forEach(function (q, i) { const s = toS(q, g); if (i) p.lineTo(s[0], s[1]); else p.moveTo(s[0], s[1]); });
    });
    return p;
  }
  function getPaths(g) {
    const key = [TR.id, state.iv, g.side, g.ox, g.oy].join('|');
    if (paths && key === pathKey) return paths;
    paths = levelsOf(TR, state.iv).map(function (L) { return { level: L.level, index: L.index, path: linePath(L.lines, g), L: L }; });
    pathKey = key;
    return paths;
  }
  let coast = null, coastKey = '', sliceL = null, sliceKey = '';
  function coastLines() {
    const key = TR.id + '|' + state.sea;
    if (coast && coastKey === key) return coast;
    coast = K.contours(TR, state.sea + 1e-6); coastKey = key;
    return coast;
  }
  function sliceLines() {
    const key = TR.id + '|' + state.slice;
    if (sliceL && sliceKey === key) return sliceL;
    sliceL = state.slice < TR.max ? K.contours(TR, state.slice + 1e-6) : []; sliceKey = key;
    return sliceL;
  }

  /** 把等高線、海岸線、河流、切面線畫到 c（螢幕或 3D 貼圖）；g 是地圖幾何 */
  function drawLines(c, g, opt) {
    opt = opt || {};
    const k = opt.scale || 1;
    c.save();
    c.beginPath(); c.rect(g.ox, g.oy, g.side, g.side); c.clip();
    c.lineJoin = 'round'; c.lineCap = 'round';
    // 河流（只畫在海面以上的部分；越下游越粗）
    if (state.rivers) {
      c.strokeStyle = C['cm-river'];
      TR.rivers.forEach(function (ln) {
        for (let i = 1; i < ln.length; i++) {
          const p0 = ln[i - 1], p1 = ln[i];
          if (p0[3] <= state.sea && p1[3] <= state.sea) continue;
          const a = toS(p0, g), b = toS(p1, g);
          c.lineWidth = Math.min(3.4, 0.6 + 1.2 * Math.sqrt(p1[2])) * k;
          c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
        }
      });
    }
    // 等高線
    if (state.lines) {
      const P = opt.paths || getPaths(g);
      const dark = D.dark;
      P.forEach(function (L) {
        if (L.level <= state.sea) return;
        c.strokeStyle = L.index ? C['cm-index'] : D.alpha(C['cm-line'], dark ? 0.8 : 0.85);
        c.lineWidth = (L.index ? 1.5 : 0.75) * k;
        c.stroke(L.path);
      });
      // 窪地的示坡線：在封閉環上每隔一段畫一小段指向低處的短線
      P.forEach(function (L) {
        if (L.level <= state.sea) return;
        L.L.lines.forEach(function (ln, idx) {
          if (!L.L.dep[idx]) return;
          c.strokeStyle = L.index ? C['cm-index'] : C['cm-line'];
          c.lineWidth = 0.9 * k;
          let acc = 0;
          for (let i = 1; i < ln.pts.length; i++) {
            const a = toS(ln.pts[i - 1], g), b = toS(ln.pts[i], g), seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
            acc += seg;
            if (acc < 9 * k) continue;
            acc = 0;
            const q = ln.pts[i], gr = K.grad(TR, q[0], q[1]), m = Math.hypot(gr[0], gr[1]) || 1;
            const s0 = toS(q, g);
            c.beginPath(); c.moveTo(s0[0], s0[1]); c.lineTo(s0[0] - gr[0] / m * 4.5 * k, s0[1] + gr[1] / m * 4.5 * k); c.stroke();
          }
        });
      });
    }
    // 海岸線（目前海平面的等高線）
    c.strokeStyle = C['cm-coast']; c.lineWidth = 1.3 * k;
    c.stroke(linePath(coastLines(), g));
    // 水平切面的等高線
    const sl = sliceLines();
    if (sl.length) {
      c.strokeStyle = D.alpha(C['surface'] || '#fff', 0.85); c.lineWidth = 4.2 * k;
      const sp = linePath(sl, g);
      c.setLineDash(state.slice <= state.sea ? [6 * k, 5 * k] : []);
      c.stroke(sp);
      c.strokeStyle = C['cm-slice']; c.lineWidth = 2.2 * k;
      c.stroke(sp);
      c.setLineDash([]);
    }
    c.restore();
  }

  /** 計曲線的高度標示：沿線放，字的上方朝向高處（地形圖的習慣），彼此不重疊 */
  function drawLabels(c, g) {
    if (!state.lines) return;
    const P = getPaths(g), placed = [], fs = cvSize.w < 520 ? 10 : 11;
    const font = '600 ' + fs + 'px ' + FONT;
    c.save();
    c.beginPath(); c.rect(g.ox, g.oy, g.side, g.side); c.clip();
    P.forEach(function (L) {
      if (!L.index || L.level <= state.sea) return;
      L.L.lines.forEach(function (ln) {
        let run = 60;
        for (let i = 1; i < ln.pts.length - 1; i++) {
          const a = toS(ln.pts[i - 1], g), b = toS(ln.pts[i], g);
          run += Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (run < 170) continue;
          const q = toS(ln.pts[i + 1], g);
          const x = b[0], y = b[1];
          if (x < g.ox + 18 || x > g.ox + g.side - 18 || y < g.oy + 12 || y > g.oy + g.side - 12) continue;
          if (placed.some(function (p) { return Math.hypot(p[0] - x, p[1] - y) < 46; })) continue;
          let ang = Math.atan2(q[1] - a[1], q[0] - a[0]);
          const gr = K.grad(TR, ln.pts[i][0], ln.pts[i][1]);
          const up = [Math.sin(ang), -Math.cos(ang)];                    // 字的上方（螢幕座標）
          if (up[0] * gr[0] + up[1] * (-gr[1]) < 0) ang += Math.PI;      // 讓字的上方朝高處
          placed.push([x, y]); run = 0;
          c.save(); c.translate(x, y); c.rotate(ang);
          D.haloText(c, String(L.level), 0, 0, C['cm-index'], 'center', 'middle', font);
          c.restore();
        }
      });
    });
    c.restore();
  }

  // =====================================================================
  // 地圖
  // =====================================================================
  function drawMap() {
    const g = geom();
    const W = cvSize.w, H = cvSize.h;
    ctx.clearRect(0, 0, W, H);
    D.backdrop(ctx, W, H);
    // 地圖的紙張陰影
    ctx.save();
    ctx.shadowColor = D.shadowInk(0.28); ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
    ctx.fillStyle = C['cm-paper']; ctx.fillRect(g.ox, g.oy, g.side, g.side);
    ctx.restore();
    const px = Math.min(1100, Math.round(g.side * cvSize.dpr * (interacting ? 0.5 : 1)));
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(renderRaster(px), g.ox, g.oy, g.side, g.side);
    // 公里格線
    ctx.save();
    ctx.strokeStyle = D.alpha(C['text'], 0.13); ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 1; k < 8; k++) {
      const x = Math.round(g.ox + k * 1000 * g.sc) + 0.5, y = Math.round(g.oy + k * 1000 * g.sc) + 0.5;
      ctx.moveTo(x, g.oy); ctx.lineTo(x, g.oy + g.side); ctx.moveTo(g.ox, y); ctx.lineTo(g.ox + g.side, y);
    }
    ctx.stroke();
    ctx.restore();
    drawLines(ctx, g);
    drawLabels(ctx, g);
    // 外框
    ctx.strokeStyle = D.alpha(C['text'], 0.55); ctx.lineWidth = 1.2;
    ctx.strokeRect(g.ox + 0.5, g.oy + 0.5, g.side - 1, g.side - 1);
    drawScaleNorth(g);
    drawProfileLine(g);
    drawProbe(g);
  }
  function drawScaleNorth(g) {
    const small = g.side < 360;
    // 比例尺 0–2 km（左下）
    const x0 = g.ox + 12, y0 = g.oy + g.side - 14, L = 2000 * g.sc;
    ctx.save();
    ctx.fillStyle = D.alpha(C['surface'], 0.82);
    ctx.fillRect(x0 - 6, y0 - 22, L + 12 + (small ? 18 : 22), 30);
    ctx.fillStyle = C['text']; ctx.strokeStyle = C['text']; ctx.lineWidth = 1;
    ctx.fillRect(x0, y0 - 4, L / 2, 4);
    ctx.strokeRect(x0 + 0.5, y0 - 4 + 0.5, L - 1, 4);
    ctx.font = '600 ' + (small ? 10 : 11) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('0', x0, y0 - 8); ctx.fillText('1', x0 + L / 2, y0 - 8); ctx.fillText('2 km', x0 + L + (small ? 6 : 8), y0 - 8);
    // 指北針（右上）
    const nx = g.ox + g.side - 18, ny = g.oy + 16;
    ctx.fillStyle = D.alpha(C['surface'], 0.82);
    ctx.beginPath(); ctx.arc(nx, ny + 6, 14, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = C['text'];
    ctx.beginPath(); ctx.moveTo(nx, ny - 4); ctx.lineTo(nx + 5, ny + 11); ctx.lineTo(nx, ny + 7); ctx.lineTo(nx - 5, ny + 11); ctx.closePath(); ctx.fill();
    ctx.font = '700 9px ' + FONT; ctx.fillText('N', nx, ny + 21 > g.oy + 34 ? ny - 6 : ny - 6);
    ctx.restore();
  }
  function drawProfileLine(g) {
    if (!state.A || !state.B) return;
    const a = toS(state.A, g), b = toS(state.B, g);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = D.alpha(C['surface'], 0.9); ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.strokeStyle = C['cm-prof']; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    // 視線被擋住的地方
    const P = prof();
    if (P && !P.visible && P.L > 0) {
      const t = P.grazeAt / P.L, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      ctx.strokeStyle = D.alpha(C['surface'], 0.9); ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke();
      ctx.strokeStyle = C['cm-block']; ctx.lineWidth = 2.4; ctx.stroke();
    }
    [['A', a], ['B', b]].forEach(function (e) {
      const p = e[1];
      ctx.fillStyle = C['cm-prof'];
      ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = C['surface']; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = D.dark ? '#1b1530' : '#fff';
      ctx.font = '700 12px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(e[0], p[0], p[1] + 0.5);
    });
    ctx.restore();
  }
  function drawProbe(g) {
    if (!state.probe) return;
    const p = toS(state.probe, g), s = K.slope(TR, state.probe[0], state.probe[1]);
    ctx.save();
    // 下坡方向的箭頭（長度跟坡度成正比）
    const m = Math.hypot(s.gx, s.gy);
    if (m > 0.005) {
      const len = Math.min(34, 8 + 40 * m), ux = -s.gx / m, uy = s.gy / m;
      const tx = p[0] + ux * len, ty = p[1] + uy * len;
      D.arrow(ctx, p[0] + ux * 9, p[1] + uy * 9, tx, ty, C['cm-probe'], 2.2);
    }
    ctx.strokeStyle = D.alpha(C['surface'], 0.95); ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.arc(p[0], p[1], 7.5, 0, 2 * Math.PI); ctx.stroke();
    ctx.strokeStyle = C['cm-probe']; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.fillStyle = C['cm-probe'];
    ctx.beginPath(); ctx.arc(p[0], p[1], 2.4, 0, 2 * Math.PI); ctx.fill();
    const h = TR.h(state.probe[0], state.probe[1]);
    const txt = num(h, 0) + ' m · ' + num(s.pct, 1) + '%';
    const right = p[0] < g.ox + g.side - 110;
    D.pill(ctx, txt, p[0] + (right ? 12 : -12), p[1] - 12, C['cm-probe'], right ? 'left' : 'right', '600 11px ' + FONT);
    ctx.restore();
  }

  // =====================================================================
  // 剖面圖（真實比例 × 垂直誇大）
  // =====================================================================
  let profCache = null, profKey = '';
  function prof() {
    if (!state.A || !state.B) return null;
    const key = [TR.id, state.A, state.B, state.sea].join('|');
    if (profCache && profKey === key) return profCache;
    profCache = K.profile(TR, state.A, state.B, 400, state.sea); profKey = key;
    return profCache;
  }
  function niceStep(range, n) {
    const raw = range / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  function drawProfile() {
    const W = pfSize.w, H = pfSize.h, c = pctx;
    c.clearRect(0, 0, W, H);
    D.backdrop(c, W, H);
    const P = prof();
    c.save();
    c.font = '500 12px ' + FONT; c.fillStyle = C['muted']; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (!P || P.L < 20) {
      c.fillText(T('在地圖上拖一條線，這裡就會畫出地形剖面', 'Drag a line across the map to draw its profile here'), W / 2, H / 2);
      c.restore(); return;
    }
    const pl = 46, pr = 14, pt = 24, pb = 26;
    const aw = W - pl - pr, ah = H - pt - pb;
    const lo = Math.min(P.minH, state.sea) - 10, hi = Math.max(P.maxH + K.EYE, state.sea) + 10;
    const V = state.vexag;
    const s = Math.min(aw / P.L, ah / (V * (hi - lo)));
    const pw = P.L * s, ph = V * (hi - lo) * s;
    const x0 = pl, yb = pt + ah;                 // 剖面圖的左下角
    const X = function (d) { return x0 + d * s; }, Y = function (h) { return yb - (h - lo) * V * s; };
    // 高度格線與刻度
    const hs = niceStep(hi - lo, Math.max(2, Math.floor(ph / 34)));
    c.strokeStyle = D.alpha(C['text'], 0.1); c.lineWidth = 1;
    c.fillStyle = C['muted']; c.font = '500 10.5px ' + FONT; c.textAlign = 'right';
    for (let v = Math.ceil(lo / hs) * hs; v <= hi; v += hs) {
      const y = Math.round(Y(v)) + 0.5;
      c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + pw, y); c.stroke();
      c.fillText(num(v, 0), x0 - 5, y);
    }
    c.save(); c.translate(11, yb - ph / 2); c.rotate(-Math.PI / 2); c.textAlign = 'center';
    c.fillText(T('高度（m）', 'height (m)'), 0, 0); c.restore();
    const ds = niceStep(P.L, Math.max(2, Math.floor(pw / 70)));
    c.textAlign = 'center'; c.textBaseline = 'top';
    const ticks = [];
    for (let d = 0; d <= P.L + 1e-6; d += ds) ticks.push(d);
    ticks.forEach(function (d, i) {
      const x = Math.round(X(d)) + 0.5, last = i === ticks.length - 1;
      c.beginPath(); c.moveTo(x, yb); c.lineTo(x, yb + 4); c.strokeStyle = D.alpha(C['text'], 0.4); c.stroke();
      const t = num(d / 1000, ds < 1000 ? 1 : 0) + (last ? ' km' : '');
      if (last) { c.textAlign = x + c.measureText(t).width / 2 > W - 2 ? 'right' : 'center'; c.fillText(t, c.textAlign === 'right' ? Math.min(W - 2, x + 10) : x, yb + 6); }
      else c.fillText(t, x, yb + 6);
    });
    // 水（地面低於海平面的地方）
    const n = P.h.length - 1;
    c.fillStyle = D.alpha(C['cm-sea2'], D.dark ? 0.7 : 0.45);
    c.beginPath(); c.moveTo(X(0), Y(state.sea));
    for (let i = 0; i <= n; i++) c.lineTo(X(P.d[i]), Y(Math.min(P.h[i], state.sea)));
    c.lineTo(X(P.L), Y(state.sea)); c.closePath(); c.fill();
    // 地面：用高度色階的漸層填滿
    const grd = c.createLinearGradient(0, Y(Math.max(lo, 0)), 0, Y(Math.min(hi, 1000)));
    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(function (t) {
      const h = Math.max(lo, 0) + (Math.min(hi, 1000) - Math.max(lo, 0)) * t, col = rampAt(h);
      grd.addColorStop(t, 'rgb(' + col.map(Math.round).join(',') + ')');
    });
    c.fillStyle = grd;
    c.beginPath(); c.moveTo(X(0), yb);
    for (let i = 0; i <= n; i++) c.lineTo(X(P.d[i]), Y(P.h[i]));
    c.lineTo(X(P.L), yb); c.closePath(); c.fill();
    c.strokeStyle = D.dark ? '#e9dfcf' : '#4a3520'; c.lineWidth = 1.6; c.lineJoin = 'round';
    c.beginPath();
    for (let i = 0; i <= n; i++) { if (i) c.lineTo(X(P.d[i]), Y(P.h[i])); else c.moveTo(X(P.d[i]), Y(P.h[i])); }
    c.stroke();
    // 海平面線
    if (P.minH < state.sea) {
      c.strokeStyle = C['cm-coast']; c.lineWidth = 1; c.setLineDash([4, 3]);
      c.beginPath(); c.moveTo(X(0), Y(state.sea)); c.lineTo(X(P.L), Y(state.sea)); c.stroke(); c.setLineDash([]);
    }
    // 水平切面高度
    if (state.slice > lo && state.slice < hi) {
      c.strokeStyle = D.alpha(C['cm-slice'], 0.75); c.lineWidth = 1; c.setLineDash([2, 3]);
      c.beginPath(); c.moveTo(X(0), Y(state.slice)); c.lineTo(X(P.L), Y(state.slice)); c.stroke(); c.setLineDash([]);
    }
    // 視線：A、B 眼睛之間的直線
    const eA = Math.max(P.hA, state.sea) + K.EYE, eB = Math.max(P.hB, state.sea) + K.EYE;
    c.lineWidth = 1.8;
    if (P.visible) {
      c.strokeStyle = C['cm-see']; c.setLineDash([6, 4]);
      c.beginPath(); c.moveTo(X(0), Y(eA)); c.lineTo(X(P.L), Y(eB)); c.stroke(); c.setLineDash([]);
    } else {
      const t = P.grazeAt / P.L, ym = eA + (eB - eA) * t;
      c.strokeStyle = C['cm-block']; c.setLineDash([6, 4]);
      c.beginPath(); c.moveTo(X(0), Y(eA)); c.lineTo(X(P.grazeAt), Y(ym)); c.stroke();
      c.globalAlpha = 0.35; c.beginPath(); c.moveTo(X(P.grazeAt), Y(ym)); c.lineTo(X(P.L), Y(eB)); c.stroke(); c.globalAlpha = 1;
      c.setLineDash([]);
      const bx = X(P.grazeAt), by = Y(ym);
      c.lineWidth = 2.2; c.beginPath(); c.moveTo(bx - 4, by - 4); c.lineTo(bx + 4, by + 4); c.moveTo(bx + 4, by - 4); c.lineTo(bx - 4, by + 4); c.stroke();
    }
    // 最陡的一段：真實角度與圖上看起來的角度
    let mi = 1, ms = 0;
    for (let i = 1; i <= n; i++) { const v = Math.abs(P.h[i] - P.h[i - 1]); if (v > ms) { ms = v; mi = i; } }
    if (ms > 0) {
      const xa = X(P.d[mi - 1]), ya = Y(P.h[mi - 1]), xb = X(P.d[mi]), yb2 = Y(P.h[mi]);
      c.fillStyle = C['cm-block'];
      c.beginPath(); c.arc((xa + xb) / 2, (ya + yb2) / 2, 3.2, 0, 2 * Math.PI); c.fill();
      const app = K.apparentDeg(P.maxDeg, V);
      const lbl = T('最陡 ', 'steepest ') + num(P.maxDeg, 0) + '°' + (V > 1 ? T('，圖上看起來 ', ', looks ') + num(app, 0) + '°' : '');
      const lx = Math.max(x0 + 60, Math.min(x0 + pw - 60, (xa + xb) / 2));
      D.pill(c, lbl, lx, Math.max(pt - 6, Math.min(yb - 4, Math.min(ya, yb2) - 10)), C['cm-block'], 'center', '600 10.5px ' + FONT);
    }
    // A、B 標示與垂直誇大
    c.font = '700 12px ' + FONT; c.fillStyle = C['cm-prof']; c.textBaseline = 'bottom';
    c.textAlign = 'left'; c.fillText('A', X(0) + 3, Math.max(14, Y(Math.max(P.hA, state.sea)) - 6));
    c.textAlign = 'right'; c.fillText('B', X(P.L) - 3, Math.max(14, Y(Math.max(P.hB, state.sea)) - 6));
    c.font = '600 11px ' + FONT; c.fillStyle = C['muted']; c.textAlign = 'right'; c.textBaseline = 'top';
    c.fillText(T('垂直誇大 ×', 'vertical exaggeration ×') + num(V, V % 1 ? 1 : 0), W - pr, 5);
    c.restore();
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function refreshOutputs() {
    setOut(el.sea, num(state.sea, state.sea % 1 ? 1 : 0) + ' m');
    setOut(el.vexag, '×' + num(state.vexag, state.vexag % 1 ? (Math.abs(state.vexag * 10 % 1) > 1e-6 ? 2 : 1) : 0));
    setOut(el.slice, num(state.slice, state.slice % 1 ? 1 : 0) + ' m');
    document.querySelectorAll('#terrainBtns button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-terrain') === state.preset)); });
    document.querySelectorAll('#ivSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-iv') === state.iv)); });
    document.querySelectorAll('#tintSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-tint') === state.tint)); });
    $('tShade').setAttribute('aria-pressed', String(state.shade));
    $('tLines').setAttribute('aria-pressed', String(state.lines));
    $('tRivers').setAttribute('aria-pressed', String(state.rivers));
    const nLines = levelsOf(TR, state.iv).filter(function (L) { return L.level > state.sea; }).length;
    setHTML('ivHint', T('計曲線每 <b>' + state.iv * 5 + ' m</b> 一條（每 5 條加粗並標高度）；海面以上共 <b>' + nLines + '</b> 條等高線。',
      'An index contour every <b>' + state.iv * 5 + ' m</b> (every fifth line, thicker and labelled); <b>' + nLines + '</b> contour lines above the sea.'));
    // 色階說明
    const ramp = $('ramp');
    ramp.hidden = state.tint === 'none';
    ramp.classList.toggle('cls', state.tint === 'slope');
    if (state.tint === 'height') {
      const stops = [];
      for (let k = 0; k <= 10; k++) { const col = rampAt(k / 10 * TR.max); stops.push('rgb(' + col.map(Math.round).join(',') + ') ' + (k * 10) + '%'); }
      $('rampBar').style.background = 'linear-gradient(90deg,' + stops.join(',') + ')';
      $('rampLo').textContent = '0 m'; $('rampHi').textContent = num(TR.max, 0) + ' m';
      $('rampChips').innerHTML = '';
    } else if (state.tint === 'slope') {
      $('rampLo').textContent = T('坡度分級：', 'Slope class:'); $('rampHi').textContent = '';
      $('rampChips').innerHTML = clsRGB.map(function (c, i) {
        return '<span><b style="background:rgb(' + c.map(Math.round).join(',') + ')"></b>' + T(CLS_ZH[i + 1], 'Class ' + (i + 1)) + ' ' + CLS_TXT[i + 1] + '</span>';
      }).join('');
    }
  }
  function updateReadouts() {
    setHTML('rMax', num(TR.max, 0) + ' m');
    const isl = K.islands(TR, state.sea);
    setHTML('rIsl', String(isl.count));
    setHTML('rLand', num(isl.area, 2) + ' km²');
    setHTML('rFrac', num(isl.frac * 100, 1) + '%');
    if (state.probe) {
      const x = state.probe[0], y = state.probe[1], h = TR.h(x, y), s = K.slope(TR, x, y), cr = K.crit(TR, x, y);
      setHTML('rPos', num(x / 1000, 2) + ', ' + num(y / 1000, 2));
      setHTML('rH', num(h, 1) + ' m' + (h <= state.sea ? T('（在海面下 ', ' (') + num(state.sea - h, 1) + T(' m）', ' m under the sea)') : ''));
      setHTML('rSl', num(s.pct, 1) + '%（' + num(s.deg, 1) + '°）');
      setHTML('rCls', T(CLS_ZH[s.cls], 'Class ' + s.cls) + '（' + CLS_TXT[s.cls] + '）');
      setHTML('rAsp', s.aspect == null || s.pct < 0.5 ? T('幾乎是平的', 'almost flat') : T('朝' + dirName(s.aspect), 'faces ' + dirName(s.aspect)) + ' ' + num(s.aspect, 0) + '°');
      const dep = K.depression(TR, x, y);
      let land = cr ? T(CRIT[cr][0], CRIT[cr][1]) : (s.pct < 3 ? T('平地', 'flat ground') : T('山坡', 'a slope'));
      if (dep > 1) land += T('（在窪地裡，比出口低 ' + num(dep, 0) + ' m）', ' (inside a hollow, ' + num(dep, 0) + ' m below its rim)');
      setHTML('rCrit', land);
      setHTML('rGap', s.pct > 0.5 ? T('約 <b>' + num(state.iv / (s.pct / 100), 0) + ' m</b>（等高距 ' + state.iv + ' m ÷ 坡度 ' + num(s.pct, 1) + '%）', 'about <b>' + num(state.iv / (s.pct / 100), 0) + ' m</b> (interval ' + state.iv + ' m ÷ slope ' + num(s.pct, 1) + '%)')
        : T('坡度很小，等高線相距很遠', 'very gentle — the contours are far apart'));
      const cat = K.catchment(TR, x, y);
      setHTML('rCat', num(cat, cat < 1 ? 3 : 2) + ' km²' + (cat >= RIVER_KM2 && h > state.sea ? T('（在河道上）', ' (on a river)') : ''));
    } else ['rPos', 'rH', 'rSl', 'rCls', 'rAsp', 'rCrit', 'rGap', 'rCat'].forEach(function (id) { setHTML(id, '—'); });
    const P = prof();
    if (P && P.L >= 20) {
      setHTML('rL', km(P.L));
      setHTML('rAB', num(P.hA, 0) + ' m → ' + num(P.hB, 0) + ' m');
      setHTML('rAvg', num(P.avg, 1) + '%（' + num(Math.atan(P.avg / 100) * 180 / Math.PI, 1) + '°）');
      setHTML('rMaxS', num(P.maxSlope, 0) + '%（' + num(P.maxDeg, 1) + '°）');
      const app = K.apparentDeg(P.maxDeg, state.vexag);
      setHTML('rApp', state.vexag > 1 ? T('<b>' + num(app, 1) + '°</b>（垂直誇大 ' + num(state.vexag, 1) + ' 倍，比真實的 ' + num(P.maxDeg, 1) + '° 陡）', '<b>' + num(app, 1) + '°</b> (exaggerated ' + num(state.vexag, 1) + ' times — steeper than the real ' + num(P.maxDeg, 1) + '°)')
        : T('<b>' + num(app, 1) + '°</b>（真實比例，沒有誇大）', '<b>' + num(app, 1) + '°</b> (true scale, not exaggerated)'));
      setHTML('rAsc', num(P.ascent, 0) + ' m ／ ' + num(P.descent, 0) + ' m');
      setHTML('rVis', P.visible ? T('<b>看得見</b>：視線最低處離地 ' + num(P.clear, 1) + ' m', '<b>Yes</b>: the sightline clears the ground by ' + num(P.clear, 1) + ' m')
        : T('<b>看不見</b>：在離 A ' + km(P.grazeAt) + ' 處被擋住（視線低了 ' + num(-P.clear, 1) + ' m）', '<b>No</b>: blocked ' + km(P.grazeAt) + ' from A (the sightline is ' + num(-P.clear, 1) + ' m too low)'));
    } else ['rL', 'rAB', 'rAvg', 'rMaxS', 'rApp', 'rAsc', 'rVis'].forEach(function (id) { setHTML(id, '—'); });
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function setStatus(s) { $('status').innerHTML = s; }
  function snapshot() {
    return K.snapshot(TR, {
      preset: state.preset, interval: state.iv, vexag: state.vexag, sea: state.sea, slice: state.slice,
      layers: { tint: state.tint, shade: state.shade, lines: state.lines, rivers: state.rivers },
      view: view3 && view3.active ? '3d' : '2d',
      probe: state.probe, A: state.A, B: state.B
    });
  }
  let lastEmit = 0, emitTimer = 0;
  function afterChange(force) {
    updateReadouts();
    requestDraw();
    const tNow = performance.now();
    clearTimeout(emitTimer);
    if (force || tNow - lastEmit > 220) { lastEmit = tNow; emit('terrain', snapshot()); }
    else emitTimer = setTimeout(function () { lastEmit = performance.now(); emit('terrain', snapshot()); }, 240);
    if (view3 && view3.active) view3.onChange();
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  function setSlider(inp, v) { if (window.LabNum) window.LabNum.set(inp, v); else inp.value = v; }
  function selectTerrain(id) {
    if (!NAMES[id]) return;
    acted();
    state.preset = id; TR = terrain(id);
    rasterKey = ''; pathKey = ''; coastKey = ''; sliceKey = ''; profKey = '';
    refreshOutputs();
    setStatus(T('換成「' + NAMES[id][0] + '」：最高點 ' + num(TR.max, 0) + ' m。', 'Switched to the ' + NAMES[id][1] + ': highest point ' + num(TR.max, 0) + ' m.'));
    if (view3 && view3.active) view3.onTerrain();
    afterChange(true);
  }
  document.querySelectorAll('#terrainBtns button').forEach(function (b) {
    b.addEventListener('click', function () { selectTerrain(b.getAttribute('data-terrain')); });
  });
  document.querySelectorAll('#ivSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); state.iv = +b.getAttribute('data-iv'); pathKey = '';
      refreshOutputs();
      setStatus(T('等高距 ' + state.iv + ' m：相鄰兩條線差 ' + state.iv + ' m。', 'Contour interval ' + state.iv + ' m: neighbouring lines differ by ' + state.iv + ' m.'));
      if (view3 && view3.active) view3.onLook();
      afterChange(true);
    });
  });
  document.querySelectorAll('#tintSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); state.tint = b.getAttribute('data-tint'); refreshOutputs(); if (view3 && view3.active) view3.onLook(); afterChange(true); });
  });
  [['tShade', 'shade'], ['tLines', 'lines'], ['tRivers', 'rivers']].forEach(function (p) {
    $(p[0]).addEventListener('click', function () { acted(); state[p[1]] = !state[p[1]]; refreshOutputs(); if (view3 && view3.active) view3.onLook(); afterChange(true); });
  });
  ['sea', 'vexag', 'slice'].forEach(function (k) {
    el[k].addEventListener('input', function () {
      acted(); readSliders(); if (k === 'sea') beginInteract();
      refreshOutputs(); afterChange();
      if (view3 && view3.active) view3.onLook();
    });
    el[k].addEventListener('change', function () {
      readSliders(); refreshOutputs(); afterChange(true);
      if (view3 && view3.active) view3.onLook();
      if (k === 'sea') {
        const isl = K.islands(TR, state.sea);
        setStatus(T('海平面 ' + num(state.sea, 0) + ' m：剩下 ' + isl.count + ' 座島，陸地 ' + num(isl.area, 2) + ' km²（原來的 ' + num(isl.frac * 100, 1) + '%）。',
          'Sea level ' + num(state.sea, 0) + ' m: ' + isl.count + ' island' + (isl.count === 1 ? '' : 's') + ' left, ' + num(isl.area, 2) + ' km² of land (' + num(isl.frac * 100, 1) + '% of the original).'));
      }
    });
  });
  $('clear').addEventListener('click', function () {
    acted();
    state.A = null; state.B = null; state.probe = null;
    setStatus(T('已清除剖面線與量測點。點一下地圖放量測點，拖一條線畫剖面。', 'Profile line and measuring point cleared. Tap the map for a point, drag a line for a profile.'));
    afterChange(true);
  });

  // ---------- 在地圖上拖曳與點擊 ----------
  let drag = null;
  function ptr(ev) { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function hitHandle(x, y) {
    const g = geom(), R = cvSize.w < 520 ? 22 : 16;
    let best = null, bd = R;
    const cand = [];
    if (state.A) cand.push(['A', state.A]);
    if (state.B) cand.push(['B', state.B]);
    if (state.probe) cand.push(['P', state.probe]);
    cand.forEach(function (e) { const s = toS(e[1], g), d = Math.hypot(s[0] - x, s[1] - y); if (d < bd) { bd = d; best = e[0]; } });
    return best;
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (ev.button > 0) return;
    const q = ptr(ev), h = hitHandle(q[0], q[1]);
    drag = h ? { kind: h, moved: false } : { kind: 'new', x0: q[0], y0: q[1], moved: false };
    cv.setPointerCapture(ev.pointerId); cv.classList.add('dragging'); ev.preventDefault();
  });
  cv.addEventListener('pointermove', function (ev) {
    const q = ptr(ev);
    if (!drag) { cv.style.cursor = hitHandle(q[0], q[1]) ? 'move' : ''; return; }
    const g = geom(), p = clampXY(fromS(q[0], q[1], g));
    if (drag.kind === 'new') {
      if (!drag.moved && Math.hypot(q[0] - drag.x0, q[1] - drag.y0) < 8) return;
      if (!drag.moved) { drag.moved = true; state.A = clampXY(fromS(drag.x0, drag.y0, g)); }
      acted(); state.B = p;
    } else {
      drag.moved = true; acted();
      if (drag.kind === 'A') state.A = p; else if (drag.kind === 'B') state.B = p; else state.probe = p;
    }
    afterChange();
  });
  function endDrag(ev) {
    if (!drag) return;
    const d = drag; drag = null;
    cv.classList.remove('dragging');
    const g = geom(), q = ptr(ev);
    if (d.kind === 'new' && !d.moved) {
      const p = fromS(q[0], q[1], g);
      if (p[0] >= 0 && p[0] <= SIZE && p[1] >= 0 && p[1] <= SIZE) {
        acted(); state.probe = p;
        const s = K.slope(TR, p[0], p[1]);
        setStatus(T('量測點：高度 ' + num(TR.h(p[0], p[1]), 0) + ' m，坡度 ' + num(s.pct, 1) + '%（' + num(s.deg, 1) + '°），' + CLS_ZH[s.cls] + '。',
          'Measuring point: height ' + num(TR.h(p[0], p[1]), 0) + ' m, slope ' + num(s.pct, 1) + '% (' + num(s.deg, 1) + '°), class ' + s.cls + '.'));
      }
    } else if (state.A && state.B && (d.kind === 'new' || d.kind === 'A' || d.kind === 'B')) {
      const P = prof();
      if (P && P.L >= 20) setStatus(T('剖面 ' + km(P.L) + '：平均坡度 ' + num(P.avg, 1) + '%，最陡 ' + num(P.maxDeg, 1) + '°；A、B ' + (P.visible ? '看得到' : '看不到') + '彼此。',
        'Profile ' + km(P.L) + ': average slope ' + num(P.avg, 1) + '%, steepest ' + num(P.maxDeg, 1) + '°; A and B ' + (P.visible ? 'can' : 'cannot') + ' see each other.'));
    }
    afterChange(true);
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', function () { drag = null; cv.classList.remove('dragging'); requestDraw(); });

  // ---------- 鍵盤 ----------
  if (window.LabKeys) {
    const step = function (p, dx, dy, big) { const s = big ? 100 : 10; return clampXY([p[0] + dx * s, p[1] + dy * s]); };
    const where = function (p) { return num(p[0] / 1000, 2) + ', ' + num(p[1] / 1000, 2) + ' km'; };
    window.LabKeys.attach(cv, {
      label: T('等高線地圖。方向鍵移動量測點（每步 10 m，Shift 100 m）；Enter 換成移動剖面的 A 或 B。', 'Contour map. Arrow keys move the measuring point (10 m a step, Shift 100 m); Enter switches to moving A or B of the profile.'),
      items: [{
        name: function () { return T('量測點', 'Measuring point'); },
        move: function (dx, dy, big) { acted(); state.probe = step(state.probe || [SIZE / 2, SIZE / 2], dx, dy, big); afterChange(true); return true; },
        describe: function () {
          if (!state.probe) return T('還沒有量測點', 'no measuring point yet');
          const s = K.slope(TR, state.probe[0], state.probe[1]);
          return where(state.probe) + T('，高度 ', ', height ') + num(TR.h(state.probe[0], state.probe[1]), 0) + ' m' + T('，坡度 ', ', slope ') + num(s.pct, 1) + '%';
        }
      }, {
        name: function () { return T('剖面起點 A', 'Profile start A'); },
        move: function (dx, dy, big) { acted(); if (!state.A) { state.A = DEF.A.slice(); state.B = state.B || DEF.B.slice(); } state.A = step(state.A, dx, dy, big); afterChange(true); return true; },
        describe: function () { return state.A ? 'A ' + where(state.A) + T('，高度 ', ', height ') + num(TR.h(state.A[0], state.A[1]), 0) + ' m' : T('沒有剖面線', 'no profile line'); }
      }, {
        name: function () { return T('剖面終點 B', 'Profile end B'); },
        move: function (dx, dy, big) { acted(); if (!state.B) { state.B = DEF.B.slice(); state.A = state.A || DEF.A.slice(); } state.B = step(state.B, dx, dy, big); afterChange(true); return true; },
        describe: function () {
          const P = prof();
          return state.B ? 'B ' + where(state.B) + T('，高度 ', ', height ') + num(TR.h(state.B[0], state.B[1]), 0) + ' m' + (P ? T('，平均坡度 ', ', average slope ') + num(P.avg, 1) + '%' + T(P.visible ? '，看得到 A' : '，看不到 A', P.visible ? ', can see A' : ', cannot see A') : '') : T('沒有剖面線', 'no profile line');
        }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // ---------- 分享：島嶼、設定、量測點、剖面線 ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      const r = function (p) { return p ? [Math.round(p[0]), Math.round(p[1])] : null; };
      return { t: state.preset, iv: state.iv, ti: state.tint, sh: state.shade ? 1 : 0, li: state.lines ? 1 : 0, rv: state.rivers ? 1 : 0, p: r(state.probe), A: r(state.A), B: r(state.B) };
    },
    set: function (o) {
      if (!o) return;
      const pt = function (a) { return Array.isArray(a) && a.length === 2 && isFinite(a[0]) && isFinite(a[1]) ? clampXY([+a[0], +a[1]]) : null; };
      if (NAMES[o.t]) { state.preset = o.t; TR = terrain(o.t); }
      if (IVS.indexOf(o.iv) >= 0) state.iv = o.iv;
      if (['height', 'slope', 'none'].indexOf(o.ti) >= 0) state.tint = o.ti;
      state.shade = o.sh !== 0; state.lines = o.li !== 0; state.rivers = o.rv !== 0;
      state.probe = pt(o.p); state.A = pt(o.A); state.B = pt(o.B);
      if (!state.A || !state.B) { state.A = null; state.B = null; }
      readSliders();
      rasterKey = ''; pathKey = ''; coastKey = ''; sliceKey = ''; profKey = '';
      refreshOutputs(); updateReadouts(); requestDraw();
      if (view3 && view3.active) view3.onTerrain();
    }
  });

  // =====================================================================
  // 繪圖迴圈
  // =====================================================================
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(loop); }
  function loop(tnow) {
    raf = 0;
    let busy = false;
    if (view3 && view3.active) { view3.frame(tnow); busy = view3.busy(); }
    else drawMap();
    drawProfile();
    if (busy) raf = requestAnimationFrame(loop);
  }

  // =====================================================================
  // 3D 檢視（切換時才載入 three.js 與 contour-map-3d.js）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  /** 3D 用的地圖貼圖：底色、陰影、等高線、河流與切面線（不含標籤與 UI） */
  function mapTexture(px, opt) {
    const c = document.createElement('canvas'); c.width = px; c.height = px;
    const g2 = c.getContext('2d');
    g2.drawImage(renderRaster(px, { tex: true }), 0, 0);
    const g = { ox: 0, oy: 0, side: px, sc: px / SIZE };
    const P = levelsOf(TR, state.iv).map(function (L) { return { level: L.level, index: L.index, path: linePath(L.lines, g), L: L }; });
    drawLines(g2, g, { paths: P, scale: px / 520 * (opt && opt.lineScale || 1) });
    return c;
  }
  const bridge = {
    K: K, T: T, D: D, state: state, colors: function () { return C; }, reducedMotion: reducedMotion, num: num,
    terrain: function () { return TR; }, mapTexture: mapTexture, sliceLines: sliceLines, prof: prof, rampAt: rampAt,
    name: function () { return T(NAMES[TR.id][0], NAMES[TR.id][1]); },
    request: function () { requestDraw(); },
    onCam: function (kind) { acted(); emit('cam', { preset: kind }); },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.ContourMap3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.ContourMap3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/contour-map-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.ContourMap3D) throw new Error('contour-map-3d.js did not load');
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function updateViewNotes() {
    const is3 = !!(view3 && view3.active);
    $('camBar').hidden = !is3;
    stage.classList.toggle('is3d', is3);
  }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable()) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 地形…', 'Loading the 3D terrain…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        view3 = window.ContourMap3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        updateViewNotes();
        requestAnimationFrame(function () { if (view3) { view3.onShow(); requestDraw(); } });
        requestDraw();
        emit('terrain', snapshot());
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      if (view3) { view3.dispose(); view3 = null; }
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      updateViewNotes();
      fit(); requestDraw();
      emit('terrain', snapshot());
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    setPressed('2d');
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 地圖。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D map is kept.');
    updateViewNotes();
    fit(); requestDraw();
  }
  $('view2d').addEventListener('click', function () { acted(); setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  ['Tilt', 'Side', 'Top'].forEach(function (k) {
    $('cam' + k).addEventListener('click', function () { if (view3) { view3.camTo(k.toLowerCase()); bridge.onCam(k.toLowerCase()); } });
  });

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  buildPalettes();
  readSliders();
  refreshOutputs();
  updateReadouts();
  function themeChanged() {
    readColors(); buildPalettes(); rasterKey = '';
    refreshOutputs(); updateReadouts();
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lh = 0, pw = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lw || cv.clientHeight !== lh || pf.clientWidth !== pw) {
        lw = cv.clientWidth; lh = cv.clientHeight; pw = pf.clientWidth;
        if (pw > 0) { fit(); requestDraw(); }
      }
    }).observe(stage);
  } else window.addEventListener('resize', function () { fit(); requestDraw(); });
  fit();
  setStatus(T('這是雙峰島的等高線地圖：每條線差 50 m，粗線每 250 m 一條。點一下地圖量坡度，拖一條線畫剖面。', 'This is the contour map of the twin-peak island: 50 m between lines, a thick line every 250 m. Tap the map to measure the slope; drag a line to draw a profile.'));
  requestDraw();
  // 測試用（Playwright）
  window.__cm = { state: state, K: K, snapshot: snapshot, selectTerrain: selectTerrain, setView: setView,
    probe: function (x, y) { acted(); state.probe = [x, y]; afterChange(true); },
    line: function (A, B) { acted(); state.A = A; state.B = B; afterChange(true); },
    terrain: function () { return TR; },
    redraw: function () { interacting = false; rasterKey = ''; drawMap(); drawProfile(); } };
})();
