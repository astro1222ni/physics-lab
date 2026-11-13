/* gravity-model.js — 「重力模型與距離衰減」的畫面與互動
 * 距離、互動量、分界點、勢力範圍全部在 gravity-model-core.js（GravityCore）；這裡只負責操作、繪圖與讀數。 */
(function () {
  'use strict';
  const K = window.GravityCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FONT = D.FONT;
  const NC = K.CITIES.length;
  const NORTH = ['tpe', 'ntp', 'tyn', 'kee'];

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = { b: $('gB'), pop: $('gPop') };
  const state = { view: 'flows', mode: 'km', b: 2, from: 'txg', to: 'tpe', town: null, pop: 50, acted: false };
  let L = K.CITIES.slice(), flows = [], AR = null, arKey = '', syncing = false;
  const idx = function (id) { return L.findIndex(function (c) { return c.id === id; }); };
  const cname = function (c) { return T(c.zh, c.en); };
  const byId = function (id) { return L[idx(id)]; };
  function recompute() {
    L = K.withTown(state.town ? { lon: state.town.lon, lat: state.town.lat, pop: state.pop } : null);
    flows = K.flowsFrom(L, idx(state.from), state.b, state.mode);
    if (state.view === 'areas') {
      const key = state.b + '|' + state.mode + '|' + (state.town ? state.town.lon.toFixed(4) + ',' + state.town.lat.toFixed(4) + ',' + state.pop : '');
      if (key !== arKey) { AR = K.areas(L, state.b, state.mode, 3); arKey = key; areaImg = null; }
    }
  }

  // ---------- 顏色與格式 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--gm-land', '--gm-coast', '--gm-sea', '--gm-flow', '--gm-city', '--gm-town', '--gm-break', '--gm-hsr', '--text', '--muted', '--border', '--surface', '--bg', '--accent']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    areaImg = null;
  }
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    return v.toFixed(d == null ? 0 : d).replace(/^-/, '−');
  }
  const pct = function (s) { return s >= 0.0995 ? num(100 * s, 0) + '%' : s >= 0.00995 ? num(100 * s, 1) + '%' : num(100 * s, 2) + '%'; };
  const minutes = function (m) { return m >= 60 ? T(Math.floor(m / 60) + ' 小時 ' + Math.round(m % 60) + ' 分', Math.floor(m / 60) + ' h ' + Math.round(m % 60) + ' min') : T(Math.round(m) + ' 分', Math.round(m) + ' min'); };
  const dUnit = function (d) { return state.mode === 'km' ? num(d, 0) + ' km' : minutes(d); };
  function setText(id, s) { const e = $(id); if (e && e.textContent !== s) e.textContent = s; }
  function setHTML(id, s) { const e = $(id); if (e && e.innerHTML !== s) e.innerHTML = s; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function setStatus(s) { $('status').innerHTML = s; }
  function fsz() { return (window.LabSettings && window.LabSettings.get && +window.LabSettings.get('fs')) || 1; }
  const font = function (px, w) { return (w ? w + ' ' : '') + Math.round(px * Math.min(fsz(), 1.35)) + 'px ' + FONT; };
  /** 第 i 個城市的顏色（勢力範圍用；色相用黃金角分散） */
  const HUE = { tpe: 210, ntp: 340, kee: 50, tyn: 120, hsc: 280, hsz: 30, mia: 175, txg: 95, chw: 260, ntc: 15, yun: 150, cyi: 300, cyq: 235, tnn: 185, khh: 0, pif: 130, ila: 270, hua: 60, ttt: 200 };
  function hue(i) { return HUE[L[i].id] != null ? HUE[L[i].id] : (i * 137.508) % 360; }
  function cityCol(i, a) {
    if (L[i] && L[i].id === 'new') return a == null ? C['gm-town'] : D.alpha(C['gm-town'], a);
    const l = D.dark ? 58 : 62, s = D.dark ? 45 : 55;
    return 'hsla(' + hue(i).toFixed(0) + ',' + s + '%,' + l + '%,' + (a == null ? 1 : a) + ')';
  }

  // =====================================================================
  // 畫布
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let size = { w: 600, h: 450 };
  function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || 300, h = cv.clientHeight || 225;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    size = { w: w, h: h, dpr: dpr };
    areaImg = null;
  }
  // 地圖：平面 km（GravityCore.toXY）→ 畫面
  const BX = [0, 2.1 * K.KX], BY = [0, 3.55 * K.KY];
  function mapView() {
    const pad = 14, s = Math.min((size.w - 2 * pad) / (BX[1] - BX[0]), (size.h - 2 * pad) / (BY[1] - BY[0]));
    const W = (BX[1] - BX[0]) * s, H = (BY[1] - BY[0]) * s;
    return { s: s, x0: (size.w - W) / 2, y0: (size.h - H) / 2, W: W, H: H };
  }
  function P(v, c) { const q = K.toXY(c); return [v.x0 + (q[0] - BX[0]) * v.s, v.y0 + v.H - (q[1] - BY[0]) * v.s]; }
  function unP(v, x, y) { return K.fromXY((x - v.x0) / v.s + BX[0], (v.y0 + v.H - y) / v.s + BY[0]); }
  function coastPath(v) {
    ctx.beginPath();
    K.COAST.forEach(function (q, i) { const p = P(v, { lon: q[0], lat: q[1] }); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.closePath();
  }
  function drawBase(v) {
    D.backdrop(ctx, size.w, size.h);
    // 海
    ctx.save();
    D.roundRect(ctx, 4, 4, size.w - 8, size.h - 8, 10);
    const sea = ctx.createLinearGradient(0, 0, 0, size.h);
    sea.addColorStop(0, D.alpha(C['gm-sea'], 0.9)); sea.addColorStop(1, D.alpha(C['gm-sea'], 0.55));
    ctx.fillStyle = sea; ctx.fill();
    ctx.restore();
    // 陸地：陰影＋漸層
    ctx.save();
    coastPath(v);
    ctx.shadowColor = D.alpha('#000000', D.dark ? 0.5 : 0.22); ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
    const land = ctx.createLinearGradient(v.x0, v.y0, v.x0 + v.W, v.y0 + v.H);
    land.addColorStop(0, D.shade(C['gm-land'], D.dark ? 0.08 : 0.04)); land.addColorStop(1, D.shade(C['gm-land'], D.dark ? -0.1 : -0.06));
    ctx.fillStyle = land; ctx.fill();
    ctx.restore();
  }
  function drawCoast(v) { ctx.save(); coastPath(v); ctx.strokeStyle = C['gm-coast']; ctx.lineWidth = 1.4; ctx.stroke(); ctx.restore(); }
  function drawHsr(v) {
    const on = state.mode === 'hsr';
    ctx.save();
    ctx.beginPath();
    K.HSR.forEach(function (s, i) { const p = P(v, s); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.strokeStyle = D.alpha(C['gm-hsr'], on ? 0.9 : 0.35); ctx.lineWidth = on ? 3 : 1.5; ctx.lineJoin = 'round';
    if (!on) ctx.setLineDash([5, 4]);
    ctx.stroke(); ctx.setLineDash([]);
    if (on) K.HSR.forEach(function (s) { const p = P(v, s); ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, 2 * Math.PI); ctx.fillStyle = C.surface; ctx.fill(); ctx.strokeStyle = C['gm-hsr']; ctx.lineWidth = 1.6; ctx.stroke(); });
    ctx.restore();
  }
  const rCity = function (c) { return Math.max(3.5, Math.min(13, 1.4 * Math.sqrt(c.pop))) * Math.min(1.2, Math.max(0.75, size.h / 520)); };
  function drawCities(v, labels) {
    const small = size.w < 420;
    L.forEach(function (c, i) {
      const p = P(v, c), r = rCity(c), isA = c.id === state.from, isB = c.id === state.to;
      if (c.id === 'new') return;
      D.ball(ctx, p[0], p[1], r, isA ? C['gm-flow'] : isB ? C['gm-break'] : C['gm-city'], { shadow: true });
      if (isA || isB) { ctx.save(); ctx.strokeStyle = isA ? C['gm-flow'] : C['gm-break']; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p[0], p[1], r + 4, 0, 2 * Math.PI); ctx.stroke(); ctx.restore(); }
    });
    // 標籤：A、B、前幾名與大城市
    const show = {};
    show[state.from] = true; show[state.to] = true;
    (labels || []).forEach(function (id) { show[id] = true; });
    L.forEach(function (c) { if (c.id !== 'new' && (!small || c.pop >= 200) && c.pop >= 100) show[c.id] = true; });
    if (!small) L.forEach(function (c) { if (c.id !== 'new') show[c.id] = true; });
    const LEFT = { ntp: 1, tyn: 1, hsc: 1, chw: 1, cyq: 1, tnn: 1, khh: 1, yun: 1, mia: 1 };
    L.forEach(function (c) {
      if (!show[c.id] || c.id === 'new') return;
      const p = P(v, c), r = rCity(c), left = !!LEFT[c.id];
      const col = c.id === state.from ? C['gm-flow'] : c.id === state.to ? C['gm-break'] : C.text;
      D.haloText(ctx, cname(c), p[0] + (left ? -(r + 4) : r + 4), p[1] + (c.id === 'tpe' ? -6 : c.id === 'ntp' ? 6 : 0), col, left ? 'right' : 'left', 'middle', font(c.id === state.from || c.id === state.to ? 12 : 11, c.id === state.from || c.id === state.to ? 700 : 600));
    });
  }
  function drawTown(v) {
    if (!state.town) return;
    const c = L[L.length - 1], p = P(v, c), r = rCity(c) + 1;
    ctx.save();
    ctx.beginPath(); ctx.arc(p[0], p[1], r + 6, 0, 2 * Math.PI); ctx.strokeStyle = D.alpha(C['gm-town'], 0.5); ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    D.ball(ctx, p[0], p[1], r, C['gm-town'], { shadow: true, glow: 0.5 });
    D.pill(ctx, T('新市鎮', 'New town') + ' ' + state.pop + T(' 萬', '0k'), p[0], p[1] - r - 8, C['gm-town'], 'center', font(11, 700));
  }
  function drawBreak(v) {
    const a = byId(state.from), b = byId(state.to);
    if (!a || !b || a.id === b.id) return;
    const pa = P(v, a), pb = P(v, b), f = K.breakFrac(a.pop, b.pop, state.b);
    const x = pa[0] + f * (pb[0] - pa[0]), y = pa[1] + f * (pb[1] - pa[1]);
    ctx.save();
    ctx.setLineDash([6, 5]); ctx.strokeStyle = D.alpha(C['gm-break'], 0.8); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke(); ctx.setLineDash([]);
    // 垂直於連線的短線
    const dx = pb[0] - pa[0], dy = pb[1] - pa[1], n = Math.hypot(dx, dy) || 1, ux = -dy / n, uy = dx / n;
    ctx.strokeStyle = C['gm-break']; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - 9 * ux, y - 9 * uy); ctx.lineTo(x + 9 * ux, y + 9 * uy); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillStyle = C['gm-break']; ctx.fillRect(-4.5, -4.5, 9, 9); ctx.strokeStyle = C.surface; ctx.lineWidth = 1.5; ctx.strokeRect(-4.5, -4.5, 9, 9); ctx.restore();
    D.pill(ctx, T('分界點', 'Break point'), x + 12 * ux + (ux >= 0 ? 4 : -4), y + 12 * uy, C['gm-break'], ux >= 0 ? 'left' : 'right', font(11, 700));
  }
  function drawFlows() {
    const v = mapView();
    drawBase(v); drawCoast(v); drawHsr(v);
    const i0 = idx(state.from), a = L[i0], pa = P(v, a), mx = flows.length ? flows[0].share : 1;
    // 線：細的先畫
    flows.slice().reverse().forEach(function (o) {
      const pb = P(v, L[o.j]), w = 1 + 13 * o.share / mx, al = 0.25 + 0.65 * Math.sqrt(o.share / mx);
      ctx.save(); ctx.strokeStyle = o.j === L.length - 1 && state.town ? D.alpha(C['gm-town'], al) : D.alpha(C['gm-flow'], al); ctx.lineWidth = w; ctx.lineCap = 'round';
      // 微彎的弧線
      const mx2 = (pa[0] + pb[0]) / 2, my2 = (pa[1] + pb[1]) / 2, dx = pb[0] - pa[0], dy = pb[1] - pa[1];
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.quadraticCurveTo(mx2 - 0.12 * dy, my2 + 0.12 * dx, pb[0], pb[1]); ctx.stroke(); ctx.restore();
    });
    drawBreak(v);
    drawCities(v, flows.slice(0, 3).map(function (o) { return L[o.j].id; }));
    drawTown(v);
    // 前三名的占比
    flows.slice(0, 3).forEach(function (o) {
      const pb = P(v, L[o.j]), dx = pb[0] - pa[0], dy = pb[1] - pa[1];
      if (Math.hypot(dx, dy) < 70) return;   // 太近的不標，看右邊的表
      // 二次曲線在 t = 0.6 的位置
      const t = 0.6, cx = (pa[0] + pb[0]) / 2 - 0.12 * dy, cy = (pa[1] + pb[1]) / 2 + 0.12 * dx;
      const x = (1 - t) * (1 - t) * pa[0] + 2 * t * (1 - t) * cx + t * t * pb[0], y = (1 - t) * (1 - t) * pa[1] + 2 * t * (1 - t) * cy + t * t * pb[1];
      D.pill(ctx, pct(o.share), x, y + 5, C['gm-flow'], 'center', font(11, 700));
    });
    scaleBar(v);
  }
  function scaleBar(v) {
    const L50 = 50 * v.s, x = 14, y = size.h - 14;
    ctx.save();
    D.roundRect(ctx, x - 6, y - 24, L50 + 16, 30, 8); ctx.fillStyle = D.alpha(C.surface, 0.85); ctx.fill();
    ctx.strokeStyle = C.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + L50, y); ctx.lineTo(x + L50, y - 4); ctx.stroke();
    ctx.fillStyle = C.text; ctx.font = font(11, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText('50 km', x, y - 8);
    ctx.restore();
  }
  // ---------------- 勢力範圍 ----------------
  let areaImg = null;
  function buildAreas(v) {
    if (areaImg && areaImg.key === arKey + '|' + size.w + '|' + size.h + '|' + D.dark) return areaImg.cv;
    const g = AR.grid, off = document.createElement('canvas');
    off.width = Math.round(size.w * size.dpr); off.height = Math.round(size.h * size.dpr);
    const o = off.getContext('2d'); o.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    const cell = g.step * v.s, at = new Map();
    g.cells.forEach(function (c, q) { at.set(c.i * 1000 + c.j, q); });
    g.cells.forEach(function (c, q) {
      const x = v.x0 + (c.i * g.step - BX[0]) * v.s, y = v.y0 + v.H - ((c.j + 1) * g.step - BY[0]) * v.s;
      o.fillStyle = cityCol(AR.k[q]); o.fillRect(x - 0.3, y - 0.3, cell + 0.6, cell + 0.6);
    });
    // 填色整體半透明（格子之間不會有疊色的細縫）
    o.globalCompositeOperation = 'destination-in'; o.fillStyle = 'rgba(0,0,0,0.6)'; o.fillRect(0, 0, size.w, size.h); o.globalCompositeOperation = 'source-over';
    // 界線
    o.strokeStyle = D.alpha(C.text, 0.75); o.lineWidth = 1.3; o.beginPath();
    g.cells.forEach(function (c, q) {
      const x = v.x0 + (c.i * g.step - BX[0]) * v.s, y = v.y0 + v.H - ((c.j + 1) * g.step - BY[0]) * v.s;
      const r = at.get((c.i + 1) * 1000 + c.j), u = at.get(c.i * 1000 + c.j + 1);
      if (r != null && AR.k[r] !== AR.k[q]) { o.moveTo(x + cell, y); o.lineTo(x + cell, y + cell); }
      if (u != null && AR.k[u] !== AR.k[q]) { o.moveTo(x, y); o.lineTo(x + cell, y); }
    });
    o.stroke();
    areaImg = { key: arKey + '|' + size.w + '|' + size.h + '|' + D.dark, cv: off };
    return off;
  }
  function drawAreas() {
    const v = mapView();
    drawBase(v);
    ctx.save(); coastPath(v); ctx.clip();
    ctx.drawImage(buildAreas(v), 0, 0, size.w, size.h);
    ctx.restore();
    drawCoast(v); drawHsr(v);
    drawCities(v, []);
    drawTown(v);
    // 出發城市的面積
    const a = byId(state.from), p = P(v, a);
    D.pill(ctx, num(AR.area[idx(state.from)], 0) + ' km²', p[0], p[1] + rCity(a) + 14, C['gm-flow'], 'center', font(11, 700));
    scaleBar(v);
  }
  // ---------------- 距離衰減 ----------------
  function drawDecay() {
    D.backdrop(ctx, size.w, size.h);
    const f = Math.min(fsz(), 1.35), padL = Math.round(56 * f), padB = Math.round(46 * f), padT = 16, padR = 16;
    const x0 = padL, y0 = padT, W = size.w - padL - padR, H = size.h - padT - padB;
    const km = state.mode === 'km';
    const dmin = km ? 3 : 8, dmax = km ? 500 : 800;
    const lx0 = Math.log10(dmin), lx1 = Math.log10(dmax);
    const i0 = idx(state.from), A = L[i0];
    const ys = flows.map(function (o) { return Math.log10(o.T); });
    let ymax = Math.ceil(Math.max.apply(null, ys.concat([1])) + 0.3), ymin = Math.floor(Math.min.apply(null, ys) - 0.3);
    if (ymax - ymin < 3) ymin = ymax - 3;
    const X = function (d) { return x0 + (Math.log10(Math.max(dmin, Math.min(dmax, d))) - lx0) / (lx1 - lx0) * W; };
    const Y = function (ly) { return y0 + H - (ly - ymin) / (ymax - ymin) * H; };
    ctx.fillStyle = D.alpha(C.surface, 0.6); ctx.fillRect(x0, y0, W, H);
    ctx.strokeStyle = D.alpha(C.text, 0.1); ctx.lineWidth = 1; ctx.fillStyle = C.muted; ctx.font = font(11);
    const xt = km ? [3, 10, 30, 100, 300] : [10, 30, 60, 120, 300, 600];
    xt.forEach(function (d) { const x = X(d); ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + H); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(d), x, y0 + H + 4); });
    const step = (ymax - ymin) > 6 ? 2 : 1;
    for (let k = ymin; k <= ymax; k += step) { const y = Y(k); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + W, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(k >= 0 ? '1' + '0'.repeat(k) : '0.' + '0'.repeat(-k - 1) + '1', x0 - 5, y); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(km ? T('距離（km，對數刻度）', 'distance (km, log scale)') : T('交通時間（分鐘，對數刻度）', 'travel time (min, log scale)'), x0 + W / 2, y0 + H + 6 + Math.round(14 * f));
    ctx.save(); ctx.translate(14, y0 + H / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText(T('互動量 T（對數刻度）', 'interaction T (log scale)'), 0, 0); ctx.restore();
    // 參考線：對方人口 10、100、400 萬時，T = P_A P / d^b（斜率 −b）
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, W, H); ctx.clip();
    [10, 100, 400].forEach(function (pp) {
      const y1 = Math.log10(A.pop * pp) - state.b * lx0, y2 = Math.log10(A.pop * pp) - state.b * lx1;
      ctx.setLineDash([5, 4]); ctx.strokeStyle = D.alpha(C.text, 0.35); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x0, Y(y1)); ctx.lineTo(x0 + W, Y(y2)); ctx.stroke();
    });
    ctx.setLineDash([]);
    flows.forEach(function (o) {
      const c = L[o.j], x = X(o.d), y = Y(Math.log10(o.T));
      D.ball(ctx, x, y, Math.max(3, 0.8 * rCity(c)), c.id === 'new' ? C['gm-town'] : c.id === state.to ? C['gm-break'] : C['gm-city'], { shadow: false });
    });
    ctx.restore();
    const narrow = W < 330;
    if (!narrow) [10, 100, 400].forEach(function (pp) {
      const ly = Math.log10(A.pop * pp) - state.b * Math.log10(km ? 6 : 15);
      if (ly < ymax - 0.15 && ly > ymin) D.haloText(ctx, T('對方 ' + pp + ' 萬人', pp >= 100 ? (pp / 100) + ' million people' : (pp * 10) + 'k people'), X(km ? 6 : 15) + 4, Y(ly) - 4, C.muted, 'left', 'bottom', font(10, 600));
    });
    flows.slice(0, narrow ? 2 : 4).concat(flows.filter(function (o) { return L[o.j].id === state.to; })).forEach(function (o) {
      const c = L[o.j], x = X(o.d), right = x > x0 + 0.62 * W;
      D.haloText(ctx, cname(c), x + (right ? -8 : 6), Y(Math.log10(o.T)) + (right ? -9 : 0), c.id === state.to ? C['gm-break'] : C.text, right ? 'right' : 'left', 'middle', font(11, 600));
    });
    D.pill(ctx, narrow ? cname(A) + '　b = ' + num(state.b, 1) : T('從 ' + cname(A) + ' 出發；虛線斜率 = −b = −', 'From ' + cname(A) + '; dashed slope = −b = −') + num(state.b, 1), x0 + W - 6, y0 + 16, C['gm-flow'], 'right', font(11, 700));
    ctx.strokeStyle = D.alpha(C.text, 0.3); ctx.strokeRect(x0, y0, W, H);
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function legendHTML() {
    const sw = function (c, txt) { return '<span style="color:var(--muted)"><i style="background:' + c + '"></i>' + txt + '</span>'; };
    if (state.view === 'decay') return sw('var(--gm-city)', T('其他城市（越大越上面）', 'other cities (bigger sit higher)')) + sw('var(--gm-break)', T('比較對象 B', 'city B'));
    const base = sw('var(--gm-flow)', T('出發地 A', 'start A')) + sw('var(--gm-break)', T('比較對象 B', 'city B')) + sw('var(--gm-hsr)', T('高鐵', 'high-speed rail')) + (state.town ? sw('var(--gm-town)', T('新市鎮', 'new town')) : '');
    return state.view === 'areas' ? base + '<span style="color:var(--muted)">' + T('顏色＝引力最大的城市', 'colour = city with the strongest pull') + '</span>' : base;
  }
  function pairInfo() { return K.summary(stOf(), null).pair; }
  function updateReadouts() {
    setOut(el.b, num(state.b, 1)); setOut(el.pop, String(state.pop));
    const a = byId(state.from), pi = pairInfo();
    if (pi) {
      setText('rKm', num(pi.km, 0) + ' km');
      setText('rCar', minutes(pi.car));
      setText('rHsr', pi.hsr < pi.car - 0.5 ? minutes(pi.hsr) : T('不比開車快', 'no faster than driving'));
      setText('rBrk', num(pi.frac * pi.km, 0) + ' km（' + num(100 * pi.frac, 0) + '%）');
    } else ['rKm', 'rCar', 'rHsr', 'rBrk'].forEach(function (id) { setText(id, '—'); });
    setText('flowH', T(cname(a) + ' 的互動流向', 'Where ' + cname(a) + '’s interaction goes'));
    const mx = flows.length ? flows[0].share : 1;
    let h = '<colgroup><col style="width:30%"><col style="width:22%"><col style="width:28%"><col></colgroup><tr><th>' + T('城市', 'City') + '</th><th>' + (state.mode === 'km' ? T('距離', 'Dist.') : T('時間', 'Time')) + '</th><th></th><th>' + T('占比', 'Share') + '</th></tr>';
    flows.slice(0, 8).forEach(function (o) {
      const c = L[o.j];
      h += '<tr><td>' + cname(c) + '</td><td>' + dUnit(o.d) + '</td><td class="bar"><i style="width:' + Math.max(2, Math.round(100 * o.share / mx)) + '%' + (c.id === 'new' ? ';background:var(--gm-town)' : '') + '"></i></td><td>' + pct(o.share) + '</td></tr>';
    });
    setHTML('flowTab', h);
    setHTML('legend', legendHTML());
    $('townBtn').textContent = state.town ? T('－ 移除新市鎮', '－ Remove the new town') : T('＋ 加入新市鎮', '＋ Add a new town');
    $('townBtn').setAttribute('aria-pressed', String(!!state.town));
    $('popRow').hidden = !state.town; $('townHint').hidden = !state.town;
    setText('cvHint', state.view === 'decay' ? T('每一點是 A 和另一座城市；同樣人口的城市會落在同一條虛線上，越遠越低。', 'Each dot is A with another city; cities of equal size fall on one dashed line, lower the further away.') : T('點一座城市當作 A（原來的 A 變成 B）。', 'Tap a city to make it A (the old A becomes B).') + (state.town ? T('拖曳橘色的新市鎮。', ' Drag the orange new town.') : ''));
    $('srNow').textContent = cname(a) + ' → ' + (flows[0] ? cname(L[flows[0].j]) + ' ' + pct(flows[0].share) : '');
    ['selFrom', 'selTo'].forEach(function (id) { const s = $(id), want = id === 'selFrom' ? state.from : state.to; if (s.value !== want) s.value = want; });
  }
  function say() {
    const a = byId(state.from);
    if (!flows.length) return;
    const t = flows[0], c = L[t.j];
    setStatus(T(cname(a) + '的互動有 ' + pct(t.share) + ' 流向' + cname(c) + '（b = ' + num(state.b, 1) + '）。', pct(t.share) + ' of ' + cname(a) + '’s interaction goes to ' + cname(c) + ' (b = ' + num(state.b, 1) + ').'));
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function townInfo() { return K.summary(stOf(), null).town; }
  const stOf = function () { return { view: state.view, mode: state.mode, b: state.b, from: state.from, to: state.to, town: state.town, pop: state.pop }; };
  function snapshot(act) {
    const m = K.summary(stOf(), state.view === 'areas' ? AR : null);
    if (m.pair) delete m.pair.at;
    delete m.flows; delete m.list;
    m.act = act || 'param';
    return m;
  }
  let lastEmit = 0, emitTimer = 0;
  function emit(data) { if (state.acted && window.LabMission) window.LabMission.emit('grav', data); }
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
  function frame() { raf = 0; if (state.view === 'areas') drawAreas(); else if (state.view === 'decay') drawDecay(); else drawFlows(); }

  // =====================================================================
  // 控制項
  // =====================================================================
  const setSl = function (inp, v) { if (window.LabNum) window.LabNum.set(inp, v); else inp.value = v; };
  function readSliders() {
    state.b = Math.max(0.5, Math.min(3, Math.round(val(el.b) * 10) / 10));
    state.pop = Math.max(1, Math.min(300, Math.round(val(el.pop))));
  }
  function sliderChanged(e) {
    if (syncing) return;
    acted(); readSliders();
    afterChange(e.type === 'change', e.target === el.b ? 'b' : 'pop');
    if (e.type === 'change') say();
  }
  Object.keys(el).forEach(function (k) { el[k].addEventListener('input', sliderChanged); el[k].addEventListener('change', sliderChanged); });
  function fillSelects() {
    ['selFrom', 'selTo'].forEach(function (id) {
      const s = $(id), keep = s.value;
      s.innerHTML = '';
      K.CITIES.forEach(function (c) { const o = document.createElement('option'); o.value = c.id; o.textContent = cname(c); s.appendChild(o); });
      if (keep) s.value = keep;
    });
  }
  function setFrom(id, act) {
    if (id === state.from) return;
    state.to = state.from; state.from = id;
    afterChange(true, act || 'from'); say();
  }
  $('selFrom').addEventListener('change', function () { acted(); const v = $('selFrom').value; if (v === state.to) state.to = state.from; state.from = v; afterChange(true, 'from'); say(); });
  $('selTo').addEventListener('change', function () { acted(); const v = $('selTo').value; if (v === state.from) state.from = state.to; state.to = v; afterChange(true, 'to'); say(); });
  function syncSeg() {
    document.querySelectorAll('#viewSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === state.view)); });
    document.querySelectorAll('#distSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === state.mode)); });
    cv.classList.toggle('wide', state.view === 'decay');
  }
  document.querySelectorAll('#viewSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); state.view = b.getAttribute('data-view'); syncSeg(); afterChange(true, 'view');
      if (state.view === 'areas') setStatus(T('每一格歸給引力（人口 ÷ 距離的 b 次方）最大的城市。', 'Each cell goes to the city with the largest pull (population ÷ distance to the power b).'));
      else if (state.view === 'decay') setStatus(T('對數座標裡，距離衰減是一條斜率 −b 的直線。', 'On log–log axes, distance decay is a straight line of slope −b.'));
      else say();
    });
  });
  document.querySelectorAll('#distSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); state.mode = b.getAttribute('data-mode'); syncSeg(); afterChange(true, 'mode');
      setStatus(state.mode === 'hsr' ? T('距離改用交通時間：高鐵沿線的城市彼此靠近了。', 'Distance is now travel time: cities along the high-speed rail move closer.') : T('距離改回直線公里數。', 'Distance is straight-line kilometres again.'));
    });
  });
  $('townBtn').addEventListener('click', function () {
    acted();
    if (state.town) { state.town = null; if (state.from === 'new') state.from = 'tpe'; if (state.to === 'new') state.to = 'txg'; }
    else state.town = { lon: 120.95, lat: 23.6 };
    afterChange(true, 'town');
    setStatus(state.town ? T('新市鎮放在島的中央。拖曳它，或調整人口。', 'The new town is in the middle of the island. Drag it or change its population.') : T('新市鎮移除了。', 'The new town is gone.'));
  });

  // ---------- 拖曳與點選 ----------
  let drag = false;
  function local(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function moveTown(q) {
    const v = mapView(), p = unP(v, q[0], q[1]);
    if (!K.inside(p)) return false;
    state.town = { lon: Math.round(p.lon * 1e4) / 1e4, lat: Math.round(p.lat * 1e4) / 1e4 };
    return true;
  }
  cv.addEventListener('pointerdown', function (e) {
    acted();
    if (state.view === 'decay') return;
    const v = mapView(), q = local(e);
    if (state.town) {
      const pt = P(v, L[L.length - 1]);
      if (Math.hypot(q[0] - pt[0], q[1] - pt[1]) < 22) { drag = true; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ } return; }
    }
    let best = null, bd = 24;
    K.CITIES.forEach(function (c) { const p = P(v, c), d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = c.id; } });
    if (best) { setFrom(best, 'from'); return; }
    if (state.town && moveTown(q)) { drag = true; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ } afterChange(false, 'drag'); }
  });
  cv.addEventListener('pointermove', function (e) { if (!drag) return; if (moveTown(local(e))) afterChange(false, 'drag'); });
  function endDrag() {
    if (!drag) return; drag = false; afterChange(true, 'drag');
    const ti = townInfo();
    if (ti) setStatus(T('新市鎮受' + cname(byId(ti.dom)) + '吸引最大；它的互動最多流向' + cname(byId(ti.top)) + '。', 'The new town is pulled hardest by ' + cname(byId(ti.dom)) + '; most of its interaction goes to ' + cname(byId(ti.top)) + '.'));
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  if (window.LabKeys) window.LabKeys.attach(cv, {
    label: T('臺灣地圖。左右鍵換出發城市；有新市鎮時按 Enter 選它，用方向鍵移動（Shift 一次 10 km）。', 'Map of Taiwan. Left/right changes the starting city; with a new town, press Enter to select it and move it with the arrow keys (Shift for 10 km).'),
    items: [{
      name: function () { return T('出發城市', 'Starting city'); },
      move: function (dx, dy) {
        acted();
        const ids = K.CITIES.map(function (c) { return c.id; }), i = ids.indexOf(state.from);
        const n = ids[((i < 0 ? 0 : i) + (dx || -dy) + ids.length) % ids.length];
        setFrom(n, 'from'); return true;
      },
      describe: function () { return $('status').textContent; }
    }, {
      name: function () { return T('新市鎮', 'New town'); },
      move: function (dx, dy, big) {
        acted();
        if (!state.town) state.town = { lon: 120.95, lat: 23.6 };
        const st = big ? 10 : 2, q = K.toXY(state.town), p = K.fromXY(q[0] + dx * st, q[1] - dy * st);
        if (K.inside(p)) state.town = { lon: Math.round(p.lon * 1e4) / 1e4, lat: Math.round(p.lat * 1e4) / 1e4 };
        afterChange(true, 'drag'); return true;
      },
      describe: function () { const t = townInfo(); return t ? T('新市鎮受' + cname(byId(t.dom)) + '吸引最大', 'Pulled hardest by ' + cname(byId(t.dom))) : ''; }
    }],
    onChange: function () { requestDraw(); }
  });

  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { v: state.view, m: state.mode, f: state.from, t: state.to, n: state.town ? [state.town.lon, state.town.lat] : null }; },
    set: function (o) {
      if (!o) return;
      if (['flows', 'areas', 'decay'].indexOf(o.v) >= 0) state.view = o.v;
      if (['km', 'hsr'].indexOf(o.m) >= 0) state.mode = o.m;
      const ok = function (id) { return K.CITIES.some(function (c) { return c.id === id; }); };
      if (ok(o.f)) state.from = o.f;
      if (ok(o.t) && o.t !== state.from) state.to = o.t;
      if (Array.isArray(o.n) && o.n.length === 2 && K.inside({ lon: +o.n[0], lat: +o.n[1] })) state.town = { lon: +o.n[0], lat: +o.n[1] };
      readSliders(); syncSeg(); recompute(); updateReadouts(); requestDraw();
    }
  });

  window.__gm = { state: state, K: K, snapshot: snapshot, redraw: requestDraw, refresh: function (act) { readSliders(); syncSeg(); afterChange(true, act || 'param'); }, setFrom: setFrom };

  readColors();
  fillSelects();
  readSliders();
  syncSeg();
  fit();
  recompute();
  updateReadouts();
  function themeChanged() { readColors(); fillSelects(); updateReadouts(); requestDraw(); }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  let rsTimer = 0;
  window.addEventListener('resize', function () { clearTimeout(rsTimer); rsTimer = setTimeout(function () { fit(); requestDraw(); }, 60); });
  if (window.ResizeObserver) new ResizeObserver(function () { fit(); requestDraw(); }).observe(cv);
  say();
  requestDraw();
})();
