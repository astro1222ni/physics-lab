/* gis-overlay.js — 「圖層疊合與選址」的畫面與互動
 * 圖層、布林疊合、加權疊合全部在 gis-overlay-core.js（GisCore）；這裡只負責操作、繪圖與讀數。 */
(function () {
  'use strict';
  const K = window.GisCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FONT = D.FONT;
  const NX = K.NX, NY = K.NY, CELL = K.CELL, N = NX * NY;
  const L = K.layers();
  const CR = ['slope', 'flood', 'fault', 'road', 'town'];
  const LAND_NAME = [['水域', 'water'], ['住宅', 'housing'], ['農地', 'farmland'], ['森林', 'forest'], ['保護區', 'reserve']];
  const FAC = { incinerator: ['焚化廠', 'incinerator'], school: ['學校', 'school'], solar: ['太陽能場', 'solar farm'] };
  const CNAME = {
    slope: ['坡度', 'Slope'], flood: ['淹水', 'Flooding'], fault: ['斷層', 'Fault'], road: ['道路', 'Road'], town: ['住家', 'Homes'], land: ['土地使用', 'Land use']
  };
  const cn = function (c) { return T(CNAME[c][0], CNAME[c][1]); };

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = {
    stage: $('flStage'),
    slope: $('cSlope'), flood: $('cFlood'), fault: $('cFault'), road: $('cRoad'), town: $('cTown'),
    wslope: $('wSlope'), wflood: $('wFlood'), wfault: $('wFault'), wroad: $('wRoad'), wtown: $('wTown')
  };
  const LIM = { stage: [0, 6], slope: [0, 40], flood: [0, 3], fault: [0, 4000], road: [100, 5000], town: [0, 5000], w: [0, 5] };
  const clamp = function (v, a) { return Math.max(a[0], Math.min(a[1], v)); };
  const state = { fac: 'incinerator', method: 'bool', view: 'map', layer: 'result', cfg: null, w: null, probe: -1, tilt: 0.55, acted: false };
  function loadPreset(f) { const p = K.preset(f); state.cfg = p; state.w = p.w; delete state.cfg.w; }
  loadPreset('incinerator');
  let B = null, W = null, FL = null, syncing = false;
  function recompute() {
    B = K.boolean(state.cfg);
    W = K.weighted(state.cfg, state.w);
    FL = K.floodStats(state.cfg.stage);
  }

  // ---------- 顏色與格式 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--go-water', '--go-town', '--go-farm', '--go-forest', '--go-reserve', '--go-ok', '--go-no', '--go-flood', '--go-fault', '--go-road', '--go-roadedge', '--go-river', '--go-probe', '--text', '--muted', '--border', '--surface', '--bg', '--accent']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    shadeImg = null; imgKey = '';
  }
  const landCol = function (u) { return C['go-' + ['water', 'town', 'farm', 'forest', 'reserve'][u]]; };
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    const s = v.toFixed(d == null ? 0 : d);
    return (/^-0(\.0*)?$/.test(s) ? s.slice(1) : s).replace(/^-/, '−');
  }
  function grp(v, d) {
    if (v == null || !isFinite(v)) return '—';
    const s = Math.abs(v).toFixed(d || 0).split('.');
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (v < 0 ? '−' : '') + s.join('.');
  }
  const meters = function (v) { return v >= 1000 ? num(v / 1000, 2) + ' km' : grp(v) + ' m'; };
  const area = function (v) { return num(v, v >= 10 ? 1 : 2) + T(' 平方公里', ' km²'); };
  function setText(id, s) { const e = $(id); if (e && e.textContent !== s) e.textContent = s; }
  function setHTML(id, s) { const e = $(id); if (e && e.innerHTML !== s) e.innerHTML = s; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function setStatus(s) { $('status').innerHTML = s; }
  function fsz() { return (window.LabSettings && window.LabSettings.get && +window.LabSettings.get('fs')) || 1; }
  const font = function (px, w) { return (w ? w + ' ' : '') + Math.round(px * Math.min(fsz(), 1.35)) + 'px ' + FONT; };
  function rgbOf(c) { return D.rgb(c); }
  function ramp(stops, t) {
    t = Math.max(0, Math.min(1, t));
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const a = stops[i - 1], b = stops[i], u = (t - a[0]) / (b[0] - a[0] || 1);
        return [a[1][0] + (b[1][0] - a[1][0]) * u, a[1][1] + (b[1][1] - a[1][1]) * u, a[1][2] + (b[1][2] - a[1][2]) * u];
      }
    }
    return stops[stops.length - 1][1];
  }
  const HYPSO = [[0, [92, 160, 96]], [0.12, [168, 196, 110]], [0.3, [222, 208, 140]], [0.55, [196, 150, 96]], [0.8, [150, 110, 80]], [1, [236, 232, 226]]];
  const SCORE = [[0, [68, 1, 84]], [0.25, [59, 82, 139]], [0.5, [33, 145, 140]], [0.75, [94, 201, 98]], [1, [253, 231, 37]]];
  const HEAT = [[0, [255, 247, 220]], [0.35, [253, 190, 110]], [0.7, [230, 100, 50]], [1, [150, 30, 30]]];
  const BLUES = [[0, [205, 228, 250]], [0.4, [110, 170, 230]], [1, [20, 60, 150]]];

  // =====================================================================
  // 圖層影像（64 × 48 的小圖，畫的時候放大）
  // =====================================================================
  let shadeImg = null, imgKey = '', layerImg = null;
  const ZMAX = (function () { let m = 0; for (let k = 0; k < N; k++) m = Math.max(m, L.z[k]); return m; })();
  function makeCanvas(fill) {
    const c = document.createElement('canvas');
    c.width = NX; c.height = NY;
    const g = c.getContext('2d'), id = g.createImageData(NX, NY);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i, o = ((NY - 1 - j) * NX + i) * 4, col = fill(k);
      id.data[o] = col[0]; id.data[o + 1] = col[1]; id.data[o + 2] = col[2]; id.data[o + 3] = col[3] == null ? 255 : col[3];
    }
    g.putImageData(id, 0, 0);
    return c;
  }
  /** 地形陰影（由西北方打光） */
  function hillshade() {
    if (shadeImg) return shadeImg;
    const sun = [-0.5, 0.55, 0.67];
    shadeImg = makeCanvas(function (k) {
      const i = k % NX, j = (k - i) / NX;
      const zx = (L.z[j * NX + Math.min(NX - 1, i + 1)] - L.z[j * NX + Math.max(0, i - 1)]) / (2 * CELL * 1000) * 3;
      const zy = (L.z[Math.min(NY - 1, j + 1) * NX + i] - L.z[Math.max(0, j - 1) * NX + i]) / (2 * CELL * 1000) * 3;
      const nrm = [-zx, -zy, 1], len = Math.hypot(nrm[0], nrm[1], nrm[2]);
      const lam = (nrm[0] * sun[0] + nrm[1] * sun[1] + nrm[2] * sun[2]) / len;
      const v = lam > 0.67 ? 255 : 0, a = Math.min(160, Math.abs(lam - 0.67) * 420);
      return [v, v, v, L.land[k] === 0 ? 0 : a];
    });
    return shadeImg;
  }
  /** 某一個條件是否通過（給畫面用） */
  const pass = function (k, c) { return K.passes(L, k, state.cfg, c); };
  function critOn(c) { return state.cfg[c] && state.cfg[c].on; }
  function baseLand(k, f) {
    const c = rgbOf(landCol(L.land[k]));
    return f == null ? c : [c[0] * f, c[1] * f, c[2] * f];
  }
  function layerColor(name, k) {
    const dark = D.dark;
    const dim = function (col, c) { // 沒通過的格子調暗、偏灰
      if (!critOn(c) || pass(k, c)) return col;
      const g = (col[0] + col[1] + col[2]) / 3;
      const m = dark ? 0.35 : 0.5;
      return [(col[0] * 0.3 + g * 0.7) * m, (col[1] * 0.3 + g * 0.7) * m, (col[2] * 0.3 + g * 0.7) * m];
    };
    switch (name) {
      case 'z': return L.land[k] === 0 ? rgbOf(C['go-water']) : ramp(HYPSO, Math.pow(L.z[k] / ZMAX, 0.6));
      case 'slope': return dim(ramp(HEAT, L.slope[k] / 30), 'slope');
      case 'flood': {
        if (L.land[k] === 0) return rgbOf(C['go-water']);
        const d = K.depthAt(L, k, state.cfg.stage);
        return dim(d > 0 ? ramp(BLUES, Math.min(1, d / 3)) : baseLand(k, dark ? 0.9 : 1), 'flood');
      }
      case 'fault': return dim(ramp(HEAT, 1 - Math.min(1, L.fault[k] / 4000)), 'fault');
      case 'road': return dim(ramp([[0, [70, 70, 80]], [0.15, [140, 140, 150]], [1, [238, 236, 230]]], Math.min(1, L.road[k] / 4000)), 'road');
      case 'town': return dim(L.land[k] === 1 ? rgbOf(C['go-town']) : ramp([[0, [240, 170, 140]], [1, [245, 243, 236]]], Math.min(1, L.town[k] / 4000)), 'town');
      case 'land': return dim(baseLand(k), 'land');
      case 'result':
        if (state.method === 'bool') {
          if (B.mask[k]) return rgbOf(C['go-ok']);
          const g = baseLand(k), m = dark ? 0.42 : 0.62, gg = (g[0] + g[1] + g[2]) / 3;
          return [(g[0] * 0.35 + gg * 0.65) * m + (dark ? 10 : 70), (g[1] * 0.35 + gg * 0.65) * m + (dark ? 10 : 70), (g[2] * 0.35 + gg * 0.65) * m + (dark ? 12 : 72)];
        }
        if (W.score[k] <= 0) { const g = baseLand(k); const gg = (g[0] + g[1] + g[2]) / 3; return dark ? [gg * 0.45 + 22, gg * 0.45 + 22, gg * 0.45 + 26] : [gg * 0.55 + 90, gg * 0.55 + 90, gg * 0.55 + 92]; }
        return ramp(SCORE, W.score[k] / 100);
    }
    return baseLand(k);
  }
  function layerImage(name) {
    return makeCanvas(function (k) { const c = layerColor(name, k); return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), 255]; });
  }
  function cfgKey() { return JSON.stringify([state.cfg, state.w, state.method, state.layer, D.dark]); }

  // =====================================================================
  // 畫布
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let size = { w: 600, h: 470 };
  function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || 300, h = cv.clientHeight || 230;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    size = { w: w, h: h, dpr: dpr };
  }
  function mapView() {
    const pad = 8, s = Math.min((size.w - 2 * pad) / (NX * CELL), (size.h - 2 * pad) / (NY * CELL));
    const W0 = NX * CELL * s, H0 = NY * CELL * s;
    return { s: s, x0: (size.w - W0) / 2, y0: (size.h - H0) / 2, W: W0, H: H0 };
  }
  const SX = function (v, x) { return v.x0 + x * v.s; };
  const SY = function (v, y) { return v.y0 + v.H - y * v.s; };
  function polyline(v, pts) {
    ctx.beginPath();
    pts.forEach(function (p, m) { const x = SX(v, p[0]), y = SY(v, p[1]); m ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  }
  function riverPts() { const out = []; for (let x = 0.75; x <= NX * CELL + 1e-9; x += 0.1) out.push([x, K.riverY(x)]); return out; }
  const RIVER = riverPts();
  /** 通過／不通過的交界線 */
  function boundary(v, test, color, width) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i, a = test(k);
      if (i + 1 < NX && a !== test(k + 1)) { const x = SX(v, (i + 1) * CELL); ctx.moveTo(x, SY(v, j * CELL)); ctx.lineTo(x, SY(v, (j + 1) * CELL)); }
      if (j + 1 < NY && a !== test(k + NX)) { const y = SY(v, (j + 1) * CELL); ctx.moveTo(SX(v, i * CELL), y); ctx.lineTo(SX(v, (i + 1) * CELL), y); }
    }
    ctx.stroke(); ctx.restore();
  }
  function drawVectors(v) {
    // 河
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    polyline(v, RIVER); ctx.strokeStyle = D.alpha(C['go-river'], 0.95); ctx.lineWidth = Math.max(2, v.s * 0.12); ctx.stroke();
    // 道路：外框＋路面
    K.ROADS.forEach(function (r) { polyline(v, r); ctx.strokeStyle = C['go-roadedge']; ctx.lineWidth = Math.max(3, v.s * 0.1); ctx.stroke(); });
    K.ROADS.forEach(function (r) { polyline(v, r); ctx.strokeStyle = C['go-road']; ctx.lineWidth = Math.max(1.6, v.s * 0.055); ctx.stroke(); });
    // 活動斷層
    polyline(v, K.FAULT); ctx.setLineDash([8, 5]); ctx.strokeStyle = C['go-fault']; ctx.lineWidth = 2.4; ctx.stroke(); ctx.setLineDash([]);
    // 海岸線
    ctx.strokeStyle = D.alpha(C['go-river'], 0.6); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(SX(v, 0.75), SY(v, 0)); ctx.lineTo(SX(v, 0.75), SY(v, NY * CELL)); ctx.stroke();
    ctx.restore();
    const f = font(12, 600);
    D.pill(ctx, T('城', 'Town'), SX(v, K.TOWN.x), SY(v, K.TOWN.y + 0.3), C.text, 'center', f);
    D.pill(ctx, T('村', 'Village'), SX(v, K.VILLAGE.x), SY(v, K.VILLAGE.y + 0.15), C.text, 'center', f);
    D.pill(ctx, T('活動斷層', 'Active fault'), SX(v, 3.9), SY(v, 10.9), C['go-fault'], 'left', f);
    D.pill(ctx, T('海', 'Sea'), SX(v, 0.38), SY(v, 1.0), D.shade(C['go-river'], D.dark ? 0.3 : -0.3), 'center', f);
    D.pill(ctx, T('河', 'River'), SX(v, 13.6), SY(v, K.riverY(13.6) + 0.25), D.shade(C['go-river'], D.dark ? 0.3 : -0.3), 'center', f);
  }
  function scaleBar(v, right) {
    // right：最高分的格子在左下角時，比例尺改放右下角，免得蓋住
    const L2 = 2 * v.s, x = right ? v.x0 + v.W - L2 - 16 : v.x0 + 10, y = v.y0 + v.H - 10;
    ctx.save();
    D.roundRect(ctx, x - 6, y - 24, L2 + 16, 30, 8); ctx.fillStyle = D.alpha(C.surface, 0.85); ctx.fill();
    ctx.strokeStyle = C.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + L2, y); ctx.lineTo(x + L2, y - 4); ctx.stroke();
    ctx.fillStyle = C.text; ctx.font = font(12, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('2 km', x, y - 8);
    // 指北
    const nx = v.x0 + v.W - 18, ny = v.y0 + 30;
    D.roundRect(ctx, nx - 13, ny - 26, 26, 40, 8); ctx.fillStyle = D.alpha(C.surface, 0.85); ctx.fill();
    ctx.fillStyle = C.text; ctx.beginPath(); ctx.moveTo(nx, ny - 20); ctx.lineTo(nx + 6, ny - 6); ctx.lineTo(nx - 6, ny - 6); ctx.closePath(); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillText(T('北', 'N'), nx, ny + 9);
    ctx.restore();
  }
  function ensureImage() {
    const key = cfgKey();
    if (key !== imgKey) { imgKey = key; layerImg = layerImage(state.layer); }
    return layerImg;
  }
  function drawMap() {
    const v = mapView();
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, size.w, size.h);
    ctx.save();
    ctx.fillStyle = D.alpha('#000000', D.dark ? 0.4 : 0.15);
    D.roundRect(ctx, v.x0 + 2, v.y0 + 4, v.W, v.H, 6); ctx.fill();
    ctx.beginPath(); D.roundRect(ctx, v.x0, v.y0, v.W, v.H, 6); ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(ensureImage(), v.x0, v.y0, v.W, v.H);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = state.layer === 'z' || state.layer === 'land' || state.layer === 'flood' ? 0.55 : 0.32;
    ctx.drawImage(hillshade(), v.x0, v.y0, v.W, v.H);
    ctx.globalAlpha = 1;
    // 交界線
    const c = state.layer;
    if (c === 'result' && state.method === 'bool') boundary(v, function (k) { return B.mask[k]; }, D.shade(C['go-ok'], D.dark ? 0.35 : -0.45), 2);
    else if (CNAME[c] && critOn(c)) boundary(v, function (k) { return pass(k, c); }, D.dark ? '#ffffff' : '#222222', 1.6);
    drawVectors(v);
    ctx.restore();
    ctx.strokeStyle = D.alpha(C.text, 0.35); ctx.lineWidth = 1;
    D.roundRect(ctx, v.x0, v.y0, v.W, v.H, 6); ctx.stroke();
    drawProbe(v);
    const showBest = c === 'result' && state.method === 'weight' && W.bestK >= 0, bp = showBest ? K.xyOf(W.bestK) : null;
    scaleBar(v, showBest && bp[0] < 3.2 && bp[1] < 1.6);
    if (showBest) {
      const p = K.xyOf(W.bestK);
      ctx.save(); ctx.strokeStyle = D.dark ? '#ffffff' : '#111111'; ctx.lineWidth = 2.5;
      ctx.strokeRect(SX(v, p[0] - CELL / 2) - 2, SY(v, p[1] + CELL / 2) - 2, CELL * v.s + 4, CELL * v.s + 4); ctx.restore();
      const top = SY(v, p[1] + CELL / 2) - 6, low = top > v.y0 + v.H - 40;
      D.pill(ctx, T('最高 ', 'best ') + num(W.best, 1), SX(v, p[0]) + (low ? 10 : 0), low ? SY(v, p[1] + CELL / 2) - 24 : top, C.text, low ? 'left' : 'center', font(11, 600));
    }
  }
  function drawProbe(v) {
    if (state.probe < 0) return;
    const p = K.xyOf(state.probe), x = SX(v, p[0] - CELL / 2), y = SY(v, p[1] + CELL / 2), s = CELL * v.s;
    ctx.save();
    ctx.lineWidth = 3; ctx.strokeStyle = D.dark ? '#000000' : '#ffffff'; ctx.strokeRect(x - 1, y - 1, s + 2, s + 2);
    ctx.lineWidth = 2; ctx.strokeStyle = C['go-probe']; ctx.strokeRect(x - 1, y - 1, s + 2, s + 2);
    ctx.restore();
    const cx = x + s / 2, cy = y;
    ctx.save(); ctx.strokeStyle = D.shade(C['go-probe'], -0.45); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 14); ctx.stroke(); ctx.restore();
    ctx.save();
    const g = ctx.createRadialGradient(cx - 2, cy - 18, 1, cx, cy - 16, 6);
    g.addColorStop(0, D.mix(C['go-probe'], '#ffffff', 0.5)); g.addColorStop(1, D.shade(C['go-probe'], -0.2));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy - 16, 6, 0, 7); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
  }

  // ---------- 立體：圖層一層層疊起來 ----------
  const STACK = ['land', 'slope', 'flood', 'fault', 'road', 'town', 'result'];
  let stackImgs = {}, stackKey = '';
  function stackImage(name) {
    const key = cfgKey();
    if (key !== stackKey) { stackKey = key; stackImgs = {}; }
    if (!stackImgs[name]) stackImgs[name] = makeCanvas(function (k) {
      if (name === 'result') { const c = layerColor('result', k); return [c[0], c[1], c[2], 255]; }
      if (name === 'land' && critOn('land')) {
        const ok = pass(k, 'land'), c = baseLand(k);
        return ok ? [c[0], c[1], c[2], 255] : [c[0] * 0.35, c[1] * 0.35, c[2] * 0.35, 255];
      }
      const on = critOn(name), ok = !on || pass(k, name);
      const base = layerColor(name, k);
      return ok ? [base[0], base[1], base[2], 255] : [base[0], base[1], base[2], 110];
    });
    return stackImgs[name];
  }
  function draw3D() {
    const w = size.w, h = size.h;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, D.alpha(C.accent, D.dark ? 0.1 : 0.06)); sky.addColorStop(1, D.alpha(C.accent, 0));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    const t = state.tilt, k = 0.36, n = STACK.length;
    const ct = Math.cos(t), st = Math.sin(t);
    const X0 = NX * CELL / 2, Y0 = NY * CELL / 2;
    // 一層的投影寬高（公里 → 像素）
    const spanX = Math.abs(ct) * NX * CELL + Math.abs(st) * NY * CELL;
    const spanY = (Math.abs(st) * NX * CELL + Math.abs(ct) * NY * CELL) * k;
    const s = Math.min((w - 150) / spanX, (h - 34) / (spanY + (n - 1) * 0.9));
    const gap = Math.min(spanY * s * 0.75, (h - 34 - spanY * s) / (n - 1));   // 剩下的高度平均分給層與層之間
    const cx = (w - 128) / 2 + 6, cyTop = 16 + spanY * s / 2 + Math.max(0, (h - 34 - spanY * s - (n - 1) * gap) / 2);
    const P = function (x, y, lvl) {
      const xr = x - X0, yr = y - Y0;
      return [cx + s * (ct * xr - st * yr), cyTop + (n - 1 - lvl) * gap - s * k * (st * xr + ct * yr)];
    };
    const corners = [[0, 0], [NX * CELL, 0], [NX * CELL, NY * CELL], [0, NY * CELL]];
    ctx.save();
    for (let lvl = 0; lvl < n; lvl++) {
      const name = STACK[lvl];
      const q = corners.map(function (c) { return P(c[0], c[1], lvl); });
      // 影子
      ctx.fillStyle = D.alpha('#000000', D.dark ? 0.3 : 0.12);
      ctx.beginPath(); q.forEach(function (p, m) { m ? ctx.lineTo(p[0] + 4, p[1] + 6) : ctx.moveTo(p[0] + 4, p[1] + 6); }); ctx.closePath(); ctx.fill();
      // 影像：仿射變換把 64 × 48 的圖貼到平行四邊形
      const o = P(0, NY * CELL, lvl), ax = P(CELL, NY * CELL, lvl), by = P(0, NY * CELL - CELL, lvl);
      ctx.save();
      const dpr = size.dpr || 1;
      ctx.setTransform(dpr * (ax[0] - o[0]), dpr * (ax[1] - o[1]), dpr * (by[0] - o[0]), dpr * (by[1] - o[1]), dpr * o[0], dpr * o[1]);
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = lvl === n - 1 ? 1 : 0.92;
      ctx.drawImage(stackImage(name), 0, 0);
      ctx.restore();
      ctx.strokeStyle = lvl === n - 1 ? D.alpha(C.accent, 0.9) : D.alpha(C.text, 0.35); ctx.lineWidth = lvl === n - 1 ? 2 : 1;
      ctx.beginPath(); q.forEach(function (p, m) { m ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.stroke();
      // 標籤
      const right = q.reduce(function (a, p) { return p[0] > a[0] ? p : a; });
      const lab = name === 'result' ? (state.method === 'bool' ? T('結果：可以蓋', 'Result: suitable') : T('結果：適宜度', 'Result: score')) : cn(name) + (critOn(name) ? '' : T('（不用）', ' (off)'));
      D.pill(ctx, lab, Math.min(w - 4, right[0] + 8), right[1] + 8, name === 'result' ? C.accent : C.text, 'left', font(11, 600));
    }
    // 消費者 → 這一格：一根柱子貫穿每一層
    if (state.probe >= 0) {
      const p = K.xyOf(state.probe), a = P(p[0], p[1], 0), b = P(p[0], p[1], n - 1);
      ctx.strokeStyle = C['go-probe']; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1] - 16); ctx.stroke();
      for (let lvl = 0; lvl < n; lvl++) {
        const q = P(p[0], p[1], lvl), nm = STACK[lvl];
        const ok = nm === 'result' ? (state.method === 'bool' ? !!B.mask[state.probe] : true) : (!critOn(nm) || pass(state.probe, nm));
        ctx.fillStyle = ok ? C['go-ok'] : C['go-fault'];
        ctx.beginPath(); ctx.arc(q[0], q[1], 4, 0, 7); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.stroke();
      }
    }
    ctx.restore();
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function legendHTML() {
    const sw = function (c, txt) { return '<span style="color:var(--muted)"><i style="background:' + c + '"></i>' + txt + '</span>'; };
    const grad = function (stops, a, b) {
      const css = 'linear-gradient(90deg,' + stops.map(function (s) { return 'rgb(' + s[1].map(Math.round).join(',') + ') ' + Math.round(100 * s[0]) + '%'; }).join(',') + ')';
      return '<span style="color:var(--muted)">' + a + ' <i style="width:70px;background:' + css + '"></i> ' + b + '</span>';
    };
    let h = '';
    switch (state.layer) {
      case 'result':
        h = state.method === 'bool' ? sw('var(--go-ok)', T('每一條都通過', 'passes every rule')) + sw('var(--go-no)', T('至少一條沒通過', 'fails a rule'))
          : grad(SCORE, '0', '100') + sw('var(--go-no)', T('土地使用不准（0 分）', 'land use not allowed (0)'));
        break;
      case 'z': h = grad(HYPSO, '0 m', grp(ZMAX) + ' m'); break;
      case 'slope': h = grad(HEAT, '0%', '30%+'); break;
      case 'flood': h = grad(BLUES, '0 m', '3 m+'); break;
      case 'fault': h = grad(HEAT.slice().reverse().map(function (s) { return [1 - s[0], s[1]]; }), '0', '4 km+'); break;
      case 'road': h = grad([[0, [70, 70, 80]], [0.15, [140, 140, 150]], [1, [238, 236, 230]]], '0', '4 km+'); break;
      case 'town': h = sw('var(--go-town)', T('住宅區', 'housing')) + grad([[0, [240, 170, 140]], [1, [245, 243, 236]]], '0', '4 km+'); break;
      case 'land': h = [0, 1, 2, 3, 4].map(function (u) { return sw('var(--go-' + ['water', 'town', 'farm', 'forest', 'reserve'][u] + ')', T(LAND_NAME[u][0], LAND_NAME[u][1])); }).join(''); break;
    }
    if (CNAME[state.layer] && critOn(state.layer)) h += '<span style="color:var(--muted)">' + T('暗的格子：這一條沒通過', 'dark cells fail this rule') + '</span>';
    h += '<span style="color:var(--go-fault)"><i class="dash"></i>' + T('活動斷層', 'active fault') + '</span>';
    return h;
  }
  function critText(c) {
    const q = state.cfg[c];
    switch (c) {
      case 'slope': return T('坡度 ≤ ' + num(q.v, 1) + '%', 'slope ≤ ' + num(q.v, 1) + '%');
      case 'flood': return T('淹水 ≤ ' + num(q.v, 2) + ' m', 'flood ≤ ' + num(q.v, 2) + ' m');
      case 'fault': return T('離斷層 ≥ ' + meters(q.v), 'fault ≥ ' + meters(q.v));
      case 'road': return T('離道路 ≤ ' + meters(q.v), 'road ≤ ' + meters(q.v));
      case 'town': return q.near ? T('離住家 ≤ ' + meters(q.v), 'homes ≤ ' + meters(q.v)) : T('離住家 ≥ ' + meters(q.v), 'homes ≥ ' + meters(q.v));
      case 'land': return T('土地：' + q.v.map(function (u) { return LAND_NAME[u][0]; }).join('、'), 'land: ' + q.v.map(function (u) { return LAND_NAME[u][1]; }).join(', '));
    }
    return '';
  }
  function cellValue(c, k) {
    switch (c) {
      case 'slope': return num(L.slope[k], 1) + '%';
      case 'flood': return num(K.depthAt(L, k, state.cfg.stage), 2) + ' m';
      case 'fault': return meters(L.fault[k]);
      case 'road': return meters(L.road[k]);
      case 'town': return L.land[k] === 1 ? T('住宅區裡', 'in housing') : meters(L.town[k]);
      case 'land': return T(LAND_NAME[L.land[k]][0], LAND_NAME[L.land[k]][1]);
    }
    return '';
  }
  function updateReadouts() {
    const cfg = state.cfg;
    setOut(el.stage, num(cfg.stage, 1));
    setOut(el.slope, num(cfg.slope.v, cfg.slope.v % 1 ? 1 : 0)); setOut(el.flood, num(cfg.flood.v, 2));
    setOut(el.fault, grp(cfg.fault.v)); setOut(el.road, grp(cfg.road.v)); setOut(el.town, grp(cfg.town.v));
    CR.forEach(function (c) { setOut(el['w' + c], String(state.w[c] || 0)); });
    setText('rFlood', area(FL.area) + T('（住宅 ', ' (housing ') + area(FL.town) + T('）', ')'));
    document.querySelectorAll('.crit').forEach(function (box) {
      const c = box.getAttribute('data-c'), q = cfg[c];
      box.classList.toggle('off', !q.on);
      box.querySelector('.ck').setAttribute('aria-pressed', q.on ? 'true' : 'false');
      const f = box.querySelector('.fail');
      const nf = B.fail[c];
      f.textContent = q.on ? T(nf + ' 格不通過', nf + ' cells fail') : T('不用', 'off');
      box.querySelectorAll('.wt').forEach(function (e) { e.hidden = state.method !== 'weight' || c === 'land'; });
    });
    setText('townTxt', cfg.town.near ? T('離住家不超過', 'Homes within') : T('離住家至少', 'Away from homes, at least'));
    document.querySelectorAll('#landChips button').forEach(function (b) { b.setAttribute('aria-pressed', cfg.land.v.indexOf(+b.getAttribute('data-land')) >= 0 ? 'true' : 'false'); });
    setText('critHint', state.method === 'weight'
      ? T('加權疊合：每一條換成 0–1 的分數（門檻處 0.5 分），乘上權重相加；土地使用不准的地方一律 0 分。', 'Weighted: each rule becomes a 0–1 score (0.5 at its threshold), multiplied by its weight and added; disallowed land scores 0.')
      : T('布林疊合：每一條都通過的格子才算可以蓋。', 'Boolean: a cell is suitable only if it passes every rule.'));
    $('rBool').hidden = state.method !== 'bool'; $('rWeight').hidden = state.method !== 'weight';
    setText('rArea', area(B.area) + T('（' + B.cells + ' 格）', ' (' + B.cells + ' cells)'));
    setText('rPatch', B.patches + T(' 塊', ''));
    setText('rLargest', area(B.largest));
    setText('rBig', B.sitesBig + T(' 塊', ''));
    if (W.bestK >= 0) {
      const p = K.xyOf(W.bestK);
      setText('rBest', num(W.best, 1));
      setText('rBestAt', T('東 ' + num(p[0], 2) + ' km、北 ' + num(p[1], 2) + ' km', num(p[0], 2) + ' km east, ' + num(p[1], 2) + ' km north'));
      setText('rBestOk', B.mask[W.bestK] ? T('通過', 'yes') : T('沒有：' + K.CRIT.filter(function (c) { return !pass(W.bestK, c); }).map(cn).join('、') + '不通過', 'no: fails ' + K.CRIT.filter(function (c) { return !pass(W.bestK, c); }).map(cn).join(', ')));
    } else { setText('rBest', '—'); setText('rBestAt', '—'); setText('rBestOk', '—'); }
    setText('rHi', area(W.area70));
    document.querySelectorAll('#facSeg button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-fac') === state.fac ? 'true' : 'false'); });
    document.querySelectorAll('#methodSeg button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-method') === state.method ? 'true' : 'false'); });
    document.querySelectorAll('#viewSeg button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-view') === state.view ? 'true' : 'false'); });
    document.querySelectorAll('#layerSeg button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-layer') === state.layer ? 'true' : 'false'); });
    $('layerSeg').hidden = state.view !== 'map';
    cv.classList.toggle('rot', state.view === '3d');
    setHTML('legend', legendHTML());
    updateProbe();
    $('srNow').textContent = state.method === 'bool'
      ? T('可以蓋的面積 ' + area(B.area) + '，分成 ' + B.patches + ' 塊。', 'Suitable area ' + area(B.area) + ' in ' + B.patches + ' pieces.')
      : T('最高分 ' + num(W.best, 1) + '。', 'Best score ' + num(W.best, 1) + '.');
  }
  function updateProbe() {
    const k = state.probe;
    $('pHint').hidden = k >= 0;
    if (k < 0) { setHTML('pTab', ''); return; }
    const p = K.xyOf(k);
    let h = '<tr><th>' + T('圖層', 'Layer') + '</th><th>' + T('這一格', 'Here') + '</th><th>' + T('條件', 'Rule') + '</th></tr>';
    h += '<tr><td>' + T('位置', 'Position') + '</td><td colspan="2">' + T('東 ' + num(p[0], 2) + ' km、北 ' + num(p[1], 2) + ' km', num(p[0], 2) + ' km E, ' + num(p[1], 2) + ' km N') + '</td></tr>';
    h += '<tr><td>' + T('高程', 'Elevation') + '</td><td>' + num(L.z[k], 1) + ' m</td><td class="off">—</td></tr>';
    K.CRIT.forEach(function (c) {
      const on = critOn(c), ok = pass(k, c);
      h += '<tr><td>' + cn(c) + '</td><td>' + cellValue(c, k) + '</td><td class="' + (!on ? 'off' : ok ? 'ok' : 'no') + '">' + (!on ? T('不用', 'off') : (ok ? '✓ ' : '✗ ') + (state.method === 'weight' && c !== 'land' ? num(K.score(L, k, state.cfg, c), 2) : '')) + '</td></tr>';
    });
    h += '<tr><td><b>' + T('結果', 'Result') + '</b></td><td colspan="2"><b>' + (state.method === 'bool'
      ? (B.mask[k] ? T('可以蓋', 'suitable') : T('不可以', 'not suitable'))
      : T('適宜度 ', 'score ') + num(W.score[k], 1)) + '</b></td></tr>';
    setHTML('pTab', h);
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function snapshot(act) {
    const k = state.probe;
    let probe = null;
    if (k >= 0) {
      probe = K.inspect(k, state.cfg);
      probe.score = W.score[k];
      probe.ok = !!B.mask[k];
    }
    return {
      act: act || 'param', fac: state.fac, method: state.method, view: state.view, layer: state.layer,
      cfg: JSON.parse(JSON.stringify(state.cfg)), w: Object.assign({}, state.w),
      bool: { cells: B.cells, area: B.area, patches: B.patches, largest: B.largest, sitesBig: B.sitesBig, fail: Object.assign({}, B.fail) },
      weight: { best: W.best, bestK: W.bestK, area70: W.area70, bestOk: W.bestK >= 0 && !!B.mask[W.bestK] },
      flood: FL, probe: probe
    };
  }
  let lastEmit = 0, emitTimer = 0;
  function emit(data) { if (state.acted && window.LabMission) window.LabMission.emit('go', data); }
  function acted() { state.acted = true; }
  function afterChange(force, act) {
    recompute();
    updateReadouts();
    requestDraw();
    const now = performance.now();
    clearTimeout(emitTimer);
    if (force || now - lastEmit > 250) { lastEmit = now; emit(snapshot(act)); }
    else emitTimer = setTimeout(function () { lastEmit = performance.now(); emit(snapshot(act)); }, 270);
  }
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame() { raf = 0; if (state.view === '3d') draw3D(); else drawMap(); }

  // =====================================================================
  // 控制項
  // =====================================================================
  function loadSliders() {
    syncing = true;
    const set = function (inp, v) { if (window.LabNum) window.LabNum.set(inp, v); else inp.value = v; };
    set(el.stage, state.cfg.stage);
    CR.forEach(function (c) { set(el[c], state.cfg[c].v); set(el['w' + c], state.w[c] || 0); });
    syncing = false;
  }
  function readSliders() {
    const cfg = state.cfg;
    cfg.stage = clamp(Math.round(val(el.stage) * 100) / 100, LIM.stage);
    cfg.slope.v = clamp(Math.round(val(el.slope) * 10) / 10, LIM.slope);
    cfg.flood.v = clamp(Math.round(val(el.flood) * 100) / 100, LIM.flood);
    cfg.fault.v = clamp(Math.round(val(el.fault)), LIM.fault);
    cfg.road.v = clamp(Math.round(val(el.road)), LIM.road);
    cfg.town.v = clamp(Math.round(val(el.town)), LIM.town);
    CR.forEach(function (c) { state.w[c] = clamp(Math.round(val(el['w' + c])), LIM.w); });
  }
  function say() {
    if (state.method === 'bool') {
      setStatus(B.cells
        ? T('可以蓋' + T(FAC[state.fac][0], '') + '的地：' + area(B.area) + '，分成 ' + B.patches + ' 塊，最大一塊 ' + area(B.largest) + '。', 'Suitable for a ' + FAC[state.fac][1] + ': ' + area(B.area) + ' in ' + B.patches + ' pieces; the largest is ' + area(B.largest) + '.')
        : T('沒有任何一格同時通過每一條：條件太嚴了，放寬一條試試看。', 'No cell passes every rule: the rules are too strict. Try relaxing one.'));
    } else {
      setStatus(W.bestK >= 0 ? T('適宜度最高 ' + num(W.best, 1) + ' 分；70 分以上的地有 ' + area(W.area70) + '。', 'Best score ' + num(W.best, 1) + '; ' + area(W.area70) + ' scores 70 or more.') : T('每一格都是 0 分：沒有允許的土地使用。', 'Every cell scores 0: no land use is allowed.'));
    }
  }
  function sliderChanged(e) {
    if (syncing) return;
    acted();
    readSliders();
    afterChange(e && e.type === 'change', 'param');
    if (e && e.type === 'change') say();
  }
  Object.keys(el).forEach(function (k) { el[k].addEventListener('input', sliderChanged); el[k].addEventListener('change', sliderChanged); });
  document.querySelectorAll('.crit .ck').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      const c = b.closest('.crit').getAttribute('data-c');
      state.cfg[c].on = !state.cfg[c].on;
      afterChange(true, 'toggle');
      setStatus((state.cfg[c].on ? T('用上「', 'Using “') : T('不用「', 'Dropped “')) + critText(c) + T('」。', '”. ') + (state.method === 'bool' ? T('可以蓋的面積變成 ' + area(B.area) + '。', 'Suitable area is now ' + area(B.area) + '.') : ''));
    });
  });
  document.querySelectorAll('#landChips button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      const u = +b.getAttribute('data-land'), v = state.cfg.land.v, i = v.indexOf(u);
      if (i >= 0) v.splice(i, 1); else { v.push(u); v.sort(); }
      afterChange(true, 'land');
      say();
    });
  });
  function segClick(sel, attr, apply) {
    document.querySelectorAll(sel + ' button').forEach(function (b) {
      b.addEventListener('click', function () { acted(); apply(b.getAttribute(attr)); });
    });
  }
  const FAC_SAY = {
    incinerator: ['焚化廠：要平坦、不淹水、遠離斷層、靠近道路，而且離住家至少 2.5 km。', 'Incinerator: flat, flood-free, away from the fault, near a road and at least 2.5 km from homes.'],
    school: ['學校：要平坦、不淹水、遠離斷層、靠近道路，而且離住家不超過 600 m。', 'School: flat, flood-free, away from the fault, near a road and within 600 m of homes.'],
    solar: ['太陽能場：要平坦、不淹水的農地，離道路不超過 500 m。', 'Solar farm: flat, flood-free farmland within 500 m of a road.']
  };
  segClick('#facSeg', 'data-fac', function (f) {
    state.fac = f; loadPreset(f); loadSliders();
    afterChange(true, 'fac');
    setStatus(T(FAC_SAY[f][0], FAC_SAY[f][1]) + ' ' + $('srNow').textContent);
  });
  $('reset').addEventListener('click', function () {
    acted(); loadPreset(state.fac); loadSliders();
    afterChange(true, 'reset');
    setStatus(T(FAC_SAY[state.fac][0], FAC_SAY[state.fac][1]));
  });
  segClick('#methodSeg', 'data-method', function (m) {
    state.method = m;
    afterChange(true, 'method');
    say();
  });
  segClick('#viewSeg', 'data-view', function (v) {
    state.view = v;
    afterChange(true, 'view');
    if (v === '3d') setStatus(T('每一層是一個條件：暗的格子沒通過。從上往下看，只有每一層都亮的格子才留在最上面的結果裡。拖曳可以轉動。', 'Each slab is one rule; dark cells fail it. Only cells bright in every slab survive in the result on top. Drag to turn.'));
  });
  const LAYER_SAY = {
    z: ['高程：西邊是海岸平原，東邊是山，河谷是一條低地。', 'Elevation: a coastal plain in the west, mountains in the east and a low river valley.'],
    slope: ['坡度：由相鄰格子的高程差算出來；山區最陡。', 'Slope: worked out from height differences between neighbouring cells; steepest in the mountains.'],
    flood: ['淹水：靠近河、又比河床高不了多少的地方會淹。', 'Flooding: low ground close to the river goes under water.'],
    fault: ['離活動斷層的距離：越紅越近。', 'Distance to the active fault: the redder, the closer.'],
    road: ['離道路的距離：越深越近。', 'Distance to a road: the darker, the closer.'],
    town: ['離住家的距離：住宅區本身是 0。', 'Distance to homes: housing itself is 0.'],
    land: ['土地使用：水域、住宅、農地、森林、保護區。', 'Land use: water, housing, farmland, forest and reserve.'],
    result: ['結果：把每一層疊起來。', 'Result: all layers stacked together.']
  };
  segClick('#layerSeg', 'data-layer', function (l) {
    state.layer = l;
    afterChange(true, 'layer');
    setStatus(T(LAYER_SAY[l][0], LAYER_SAY[l][1]) + (CNAME[l] && critOn(l) ? T('（條件：' + critText(l) + '；暗的格子沒通過）', ' (rule: ' + critText(l) + '; dark cells fail)') : ''));
  });

  // ---------- 點格子（點、拖曳、方向鍵） ----------
  function setProbe(k, act, force) {
    if (k < 0 || k >= N) return;
    state.probe = k;
    afterChange(force, act || 'probe');
  }
  function probeStatus() {
    const k = state.probe;
    if (k < 0) return;
    const bad = K.CRIT.filter(function (c) { return !pass(k, c); });
    if (state.method === 'weight') setStatus(T('這一格的適宜度 ' + num(W.score[k], 1) + ' 分。', 'This cell scores ' + num(W.score[k], 1) + '.'));
    else setStatus(bad.length ? T('這一格不行：' + bad.map(function (c) { return cn(c); }).join('、') + '沒通過。', 'Not here: fails ' + bad.map(function (c) { return cn(c).toLowerCase(); }).join(', ') + '.') : T('這一格每一條都通過，可以蓋。', 'This cell passes every rule.'));
  }
  let drag = null;
  function local(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function cellFromPx(q) {
    const v = mapView();
    return K.cellAt((q[0] - v.x0) / v.s, (v.y0 + v.H - q[1]) / v.s);
  }
  cv.addEventListener('pointerdown', function (e) {
    acted();
    const q = local(e);
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    if (state.view === '3d') { drag = { mode: 'rot', x: q[0], t: state.tilt }; return; }
    drag = { mode: 'probe' };
    const k = cellFromPx(q);
    if (k >= 0) setProbe(k, 'probe', false);
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drag) return;
    const q = local(e);
    if (drag.mode === 'rot') { state.tilt = Math.max(-1.2, Math.min(1.2, drag.t + (q[0] - drag.x) * 0.006)); requestDraw(); }
    else { const k = cellFromPx(q); if (k >= 0 && k !== state.probe) setProbe(k, 'probe', false); }
  });
  function endDrag() {
    if (!drag) return;
    const m = drag.mode; drag = null;
    if (m === 'probe') { probeStatus(); afterChange(true, 'probe'); } else afterChange(true, 'rotate');
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  if (window.LabKeys) window.LabKeys.attach(cv, {
    label: T('虛構縣的地圖。方向鍵一次移動一格（Shift 一次 5 格）。', 'Map of the invented county. Arrow keys move one cell (Shift for 5).'),
    items: [{
      name: function () { return T('查看的格子', 'Inspected cell'); },
      move: function (dx, dy, big) {
        acted();
        const k = state.probe >= 0 ? state.probe : (24 * NX + 32), st = big ? 5 : 1;
        const i = Math.max(0, Math.min(NX - 1, k % NX + dx * st)), j = Math.max(0, Math.min(NY - 1, Math.floor(k / NX) + dy * st));
        setProbe(j * NX + i, 'probe', true);
        probeStatus();
        return true;
      },
      describe: function () { return $('status').textContent; }
    }],
    onChange: function () { requestDraw(); }
  });

  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      const on = {};
      K.CRIT.forEach(function (c) { on[c] = state.cfg[c].on ? 1 : 0; });
      return { f: state.fac, m: state.method, v: state.view, l: state.layer, on: on, land: state.cfg.land.v.slice(), p: state.probe };
    },
    set: function (o) {
      if (!o) return;
      if (FAC[o.f]) { state.fac = o.f; loadPreset(o.f); }
      if (o.m === 'bool' || o.m === 'weight') state.method = o.m;
      if (o.v === 'map' || o.v === '3d') state.view = o.v;
      if (STACK.indexOf(o.l) >= 0 || o.l === 'z') state.layer = o.l;
      if (o.on) K.CRIT.forEach(function (c) { if (o.on[c] != null) state.cfg[c].on = o.on[c] === 1; });
      if (Array.isArray(o.land)) state.cfg.land.v = o.land.filter(function (u) { return u >= 0 && u <= 4; }).map(Number);
      if (isFinite(o.p) && o.p >= -1 && o.p < N) state.probe = Math.round(o.p);
      readSliders();
      recompute(); updateReadouts(); requestDraw();
    }
  });

  window.__go = { state: state, K: K, snapshot: snapshot, get B() { return B; }, get W() { return W; }, setProbe: setProbe, redraw: requestDraw };

  readColors();
  loadSliders();
  readSliders();
  fit();
  recompute();
  updateReadouts();
  function themeChanged() { readColors(); updateReadouts(); requestDraw(); }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  let rsTimer = 0;
  window.addEventListener('resize', function () { clearTimeout(rsTimer); rsTimer = setTimeout(function () { fit(); requestDraw(); }, 60); });
  if (window.ResizeObserver) new ResizeObserver(function () { fit(); requestDraw(); }).observe(cv);
  setStatus(T(FAC_SAY.incinerator[0], FAC_SAY.incinerator[1]) + ' ' + T('綠色的格子每一條都通過。', 'Green cells pass every rule.'));
  requestDraw();
})();
