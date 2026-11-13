/* von-thunen.js — 「杜能的農業區位圈」的畫面與互動
 * 地租、圈的邊界、河流的最省路線全部在 von-thunen-core.js（VonCore）；這裡只負責操作、繪圖與讀數。 */
(function () {
  'use strict';
  const K = window.VonCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FONT = D.FONT;
  const IDS = K.IDS;
  const NAME = {
    veg: ['蔬菜與牛奶', 'Vegetables and dairy'], wood: ['林木', 'Forestry'],
    grain: ['穀物', 'Grain'], live: ['放牧', 'Grazing']
  };
  const nm = function (id) { return id ? T(NAME[id][0], NAME[id][1]) : T('荒野', 'Wilderness'); };

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = { Y: $('cY'), p: $('cP'), c: $('cC'), f: $('cF'), m: $('tm'), k: $('tk') };
  const state = {
    crops: K.defaults(), sel: 'veg', m: 1, river: { on: false, k: 0.4 },
    view: 'map', zoom: 0, probe: { x: 20, y: 24 },
    az: -0.6, el: 0.62, acted: false
  };
  let S = null, syncing = false;
  function recompute() { S = K.summary({ crops: state.crops, m: state.m, river: state.river, probe: state.probe }); }
  function paramsKey() {
    return JSON.stringify([state.crops, state.m, state.river.on, state.river.k]);
  }

  // ---------- 顏色與格式 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--vt-veg', '--vt-wood', '--vt-grain', '--vt-live', '--vt-wild', '--vt-river', '--vt-city', '--vt-probe', '--text', '--muted', '--border', '--surface', '--bg', '--accent', '--canvas-bg']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    C.veg = C['vt-veg']; C.wood = C['vt-wood']; C.grain = C['vt-grain']; C.live = C['vt-live'];
    patterns = {}; wildTile = null;
  }
  const col = function (id) { return id ? C[id] : C['vt-wild']; };
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    const s = v.toFixed(d == null ? 0 : d);
    return (s === '-0' || /^-0\.0*$/.test(s) ? s.slice(1) : s).replace(/^-/, '−');
  }
  function grp(v, d) {
    if (v == null || !isFinite(v)) return '—';
    const s = Math.abs(v).toFixed(d || 0).split('.');
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (v < 0 && Math.abs(v) >= 0.5 * Math.pow(10, -(d || 0)) ? '−' : '') + s.join('.');
  }
  function km(v) {
    if (v == null || !isFinite(v)) return '—';
    return (v >= 100 ? grp(v, 0) : v >= 10 ? num(v, 1) : num(v, 2)) + ' km';
  }
  const money = function (v) { return grp(v, Math.abs(v) >= 100 ? 0 : 1) + T(' 元', ' yuan'); };
  const perHa = function (v) { return grp(v, Math.abs(v) >= 100 ? 0 : 1) + T(' 元／公頃', ' yuan/ha'); };
  function area(v) {
    if (!(v > 0)) return T('0 平方公里', '0 km²');
    return grp(v, v >= 100 ? 0 : 1) + T(' 平方公里', ' km²');
  }
  function setText(id, s) { const e = $(id); if (e && e.textContent !== s) e.textContent = s; }
  function setHTML(id, s) { const e = $(id); if (e && e.innerHTML !== s) e.innerHTML = s; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function setStatus(s) { $('status').innerHTML = s; }
  function fsz() { return (window.LabSettings && window.LabSettings.get && +window.LabSettings.get('fs')) || 1; }
  const font = function (px, w) { return (w ? w + ' ' : '') + Math.round(px * Math.min(fsz(), 1.35)) + 'px ' + FONT; };

  // =====================================================================
  // 畫布
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const gr = $('gr'), gctx = gr.getContext('2d');
  let size = { w: 600, h: 480, dpr: 1 }, gsize = { w: 600, h: 220, dpr: 1 };
  function fitOne(c, cx) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300, h = c.clientHeight || 200;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h, dpr: dpr };
  }
  function fit() { size = fitOne(cv, ctx); gsize = fitOne(gr, gctx); layerKey = ''; }

  // ---------- 材質（每種土地一小塊重複的花紋） ----------
  let patterns = {}, wildTile = null;
  function tile(id) {
    if (patterns[id]) return patterns[id];
    const n = 14, c = document.createElement('canvas');
    c.width = c.height = n * 2;
    const t = c.getContext('2d');
    t.scale(2, 2);
    const dk = D.alpha('#000000', D.dark ? 0.32 : 0.16), lt = D.alpha('#ffffff', D.dark ? 0.12 : 0.28);
    t.lineCap = 'round';
    if (id === 'veg') {          // 菜畦：一行一行的小點
      t.fillStyle = dk;
      for (let y = 2; y < n; y += 5) for (let x = 1.5; x < n; x += 3.5) { t.beginPath(); t.arc(x, y, 0.9, 0, 7); t.fill(); }
      t.strokeStyle = lt; t.lineWidth = 0.6;
      for (let y = 4; y < n; y += 5) { t.beginPath(); t.moveTo(0, y); t.lineTo(n, y); t.stroke(); }
    } else if (id === 'wood') {  // 樹冠
      [[3.5, 3.5, 2.6], [10.5, 5, 2.4], [6.5, 10.5, 2.7], [13.5, 12.5, 2.0], [0.5, 12.5, 2.0]].forEach(function (q) {
        t.fillStyle = dk; t.beginPath(); t.arc(q[0] + 0.6, q[1] + 0.8, q[2], 0, 7); t.fill();
        t.fillStyle = lt; t.beginPath(); t.arc(q[0] - 0.5, q[1] - 0.6, q[2] * 0.55, 0, 7); t.fill();
      });
    } else if (id === 'grain') { // 斜的田壟
      t.strokeStyle = dk; t.lineWidth = 0.7;
      for (let k = -n; k < n * 2; k += 3.5) { t.beginPath(); t.moveTo(k, 0); t.lineTo(k + n, n); t.stroke(); }
      t.strokeStyle = lt; t.lineWidth = 0.5;
      for (let k = -n + 1.6; k < n * 2; k += 3.5) { t.beginPath(); t.moveTo(k, 0); t.lineTo(k + n, n); t.stroke(); }
    } else {                     // 草原上零星的草叢
      t.strokeStyle = dk; t.lineWidth = 0.7;
      [[3, 4], [10, 2.5], [7, 9.5], [12.5, 11.5], [1.5, 12]].forEach(function (q) {
        t.beginPath(); t.moveTo(q[0] - 1.2, q[1] + 1); t.lineTo(q[0], q[1] - 1); t.lineTo(q[0] + 1.2, q[1] + 1); t.stroke();
      });
    }
    patterns[id] = ctx.createPattern(c, 'repeat');
    return patterns[id];
  }
  function wild() {
    if (wildTile) return wildTile;
    const n = 48, c = document.createElement('canvas');
    c.width = c.height = n;
    const t = c.getContext('2d');
    let seed = 7;
    const rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 70; i++) {
      t.fillStyle = D.alpha(rnd() < 0.5 ? '#000000' : '#ffffff', (D.dark ? 0.08 : 0.06) + rnd() * 0.05);
      t.fillRect(Math.floor(rnd() * n), Math.floor(rnd() * n), 1 + Math.floor(rnd() * 2), 1);
    }
    wildTile = ctx.createPattern(c, 'repeat');
    return wildTile;
  }

  // ---------- 地圖的座標 ----------
  function autoH() { return S.frontier > 0 ? Math.max(4, S.frontier * 1.1) : 100; }
  function mapView() {
    const w = size.w, h = size.h, H = state.zoom || autoH();
    const s = (Math.min(w, h) / 2 - 8) / H;
    return { w: w, h: h, H: H, s: s, cx: w / 2, cy: h / 2 };
  }
  const toS = function (v, x, y) { return [v.cx + x * v.s, v.cy - y * v.s]; };
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }
  function pathOf(c, v, r) {
    const pts = K.levelPath(r, state.river, 160);
    c.beginPath();
    pts.forEach(function (q, i) { const p = toS(v, q[0], q[1]); if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
    c.closePath();
  }

  // =====================================================================
  // 平面圖
  // =====================================================================
  let layer = null, layerKey = '';
  function drawMapStatic(c, v) {
    const w = v.w, h = v.h;
    // 荒野：底色、細小的斑點、四角稍暗
    c.fillStyle = C['vt-wild']; c.fillRect(0, 0, w, h);
    c.fillStyle = wild(); c.fillRect(0, 0, w, h);
    // 圈：由外往內塗，內圈蓋過外圈
    for (let i = S.rings.length - 1; i >= 0; i--) {
      const s = S.rings[i], base = col(s.id);
      pathOf(c, v, s.to);
      const r0 = Math.max(1, s.from * v.s), r1 = Math.max(r0 + 1, s.to * v.s);
      const g = c.createRadialGradient(v.cx, v.cy, r0, v.cx, v.cy, r1);
      g.addColorStop(0, D.shade(base, D.dark ? 0.06 : 0.14));
      g.addColorStop(1, D.shade(base, D.dark ? -0.18 : -0.08));
      c.fillStyle = g; c.fill();
      c.fillStyle = tile(s.id); c.fill();
    }
    // 圈與圈的界線；最外緣加粗
    c.lineJoin = 'round';
    S.rings.forEach(function (s, i) {
      pathOf(c, v, s.to);
      const last = i === S.rings.length - 1;
      c.strokeStyle = D.alpha(D.dark ? '#000000' : '#3a2f1c', last ? 0.5 : 0.32);
      c.lineWidth = last ? 1.6 : 1;
      if (last) c.setLineDash([5, 4]);
      c.stroke();
      c.setLineDash([]);
      // 界線內側一圈細的亮邊，讓每一圈像一塊略微隆起的臺地
      pathOf(c, v, Math.max(0, s.to - 1.2 / v.s));
      c.strokeStyle = D.alpha('#ffffff', D.dark ? 0.08 : 0.22); c.lineWidth = 1; c.stroke();
    });
    // 四角暈影
    const vg = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, D.dark ? 'rgba(0,0,0,0.3)' : 'rgba(40,30,10,0.10)');
    c.fillStyle = vg; c.fillRect(0, 0, w, h);
    // 河流
    if (state.river.on) {
      const rw = Math.max(4, Math.min(9, w / 90));
      const g = c.createLinearGradient(0, v.cy - rw, 0, v.cy + rw);
      g.addColorStop(0, D.shade(C['vt-river'], -0.25)); g.addColorStop(0.45, D.shade(C['vt-river'], 0.25)); g.addColorStop(1, D.shade(C['vt-river'], -0.3));
      c.fillStyle = D.alpha('#000000', D.dark ? 0.35 : 0.14);
      c.fillRect(0, v.cy - rw / 2 + 1.5, w, rw + 1);
      c.fillStyle = g;
      c.fillRect(0, v.cy - rw / 2, w, rw);
      c.strokeStyle = D.alpha('#ffffff', D.dark ? 0.25 : 0.55); c.lineWidth = 0.8;
      c.setLineDash([6, 10]);
      c.beginPath(); c.moveTo(0, v.cy - rw * 0.12); c.lineTo(w, v.cy - rw * 0.12); c.stroke();
      c.setLineDash([]);
    }
    // 南方的距離刻度：每一條界線離城多遠（城市正南方，運輸距離 = 直線距離）
    c.strokeStyle = D.alpha(C.text, 0.35); c.lineWidth = 1;
    const yEnd = Math.min(h - 4, v.cy + S.frontier * v.s);
    if (S.frontier > 0) { c.beginPath(); c.moveTo(v.cx + 0.5, v.cy + 10); c.lineTo(v.cx + 0.5, yEnd); c.stroke(); }
    let lastY = -1e9;
    S.rings.forEach(function (s, i) {
      const y = v.cy + s.to * v.s;
      if (y > h - 10) return;
      c.beginPath(); c.moveTo(v.cx - 4, y + 0.5); c.lineTo(v.cx + 4, y + 0.5); c.stroke();
      if (y - lastY < 15 * Math.min(fsz(), 1.35) && i < S.rings.length - 1) return;
      lastY = y;
      D.haloText(c, km(s.to), v.cx + 7, y + 4, C.text, 'left', 'alphabetic', font(11));
    });
    // 圈的名稱：放在城市正北方，每一圈的中間（夠寬才寫）
    S.rings.forEach(function (s) {
      const y0 = v.cy - s.from * v.s, y1 = v.cy - s.to * v.s, ym = (y0 + y1) / 2;
      if (y0 - y1 < 17 * Math.min(fsz(), 1.35) || ym < 12 || ym > v.cy - 20) return;
      D.pill(c, nm(s.id), v.cx, ym + 9 * Math.min(fsz(), 1.35), D.shade(col(s.id), D.dark ? 0.35 : -0.45), 'center', font(11, 600));
    });
    // 沿河伸出畫面時，在右邊標出延伸到哪裡
    if (state.river.on && S.frontier > 0 && S.frontierRiver * v.s > w / 2 - 6) {
      D.pill(c, T('沿河延伸到 ', 'Along the river to ') + km(S.frontierRiver) + ' →', w - 6, v.cy - 8, D.shade(C['vt-river'], D.dark ? 0.3 : -0.35), 'right', font(11, 600));
    }
    if (!S.rings.length) D.pill(c, T('沒有任何作物划算：整片都是荒野', 'No crop pays anywhere: it is all wilderness'), w / 2, h / 2 - 22, C.text, 'center', font(12, 600));
    // 城市
    drawCity(c, v.cx, v.cy);
    // 比例尺與指北
    const sk = niceStep(v.w / v.s / 5), sl = sk * v.s, bx = 12, by = h - 14;
    c.fillStyle = D.alpha(C['canvas-bg'], 0.8);
    D.roundRect(c, bx - 6, by - 20 * Math.min(fsz(), 1.35), sl + 12, 26 * Math.min(fsz(), 1.35), 6); c.fill();
    c.strokeStyle = C.text; c.lineWidth = 2; c.lineCap = 'butt';
    c.beginPath(); c.moveTo(bx, by - 4); c.lineTo(bx, by); c.lineTo(bx + sl, by); c.lineTo(bx + sl, by - 4); c.stroke();
    D.haloText(c, grp(sk) + ' km', bx + sl / 2, by - 6, C.text, 'center', 'alphabetic', font(11));
    const nx = w - 18, ny = 16;
    c.fillStyle = C.text;
    c.beginPath(); c.moveTo(nx, ny - 8); c.lineTo(nx + 5, ny + 5); c.lineTo(nx, ny + 2); c.lineTo(nx - 5, ny + 5); c.closePath(); c.fill();
    D.haloText(c, T('北', 'N'), nx, ny + 18, C.text, 'center', 'alphabetic', font(11, 600));
  }
  function drawCity(c, x, y) {
    const r = Math.max(6, Math.min(10, size.w / 60));
    const g0 = c.createRadialGradient(x, y + r * 0.5, 0, x, y + r * 0.5, r * 1.8);
    g0.addColorStop(0, D.shadowInk(0.35)); g0.addColorStop(1, D.shadowInk(0));
    c.fillStyle = g0; c.beginPath(); c.ellipse(x, y + r * 0.5, r * 1.8, r * 1.1, 0, 0, 7); c.fill();
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, D.shade(C['vt-city'], 0.5)); g.addColorStop(1, D.shade(C['vt-city'], -0.2));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    c.strokeStyle = D.alpha('#ffffff', 0.85); c.lineWidth = 1.5; c.stroke();
    // 城裡的幾棟房子
    c.fillStyle = D.alpha(D.dark ? '#1b1f26' : '#ffffff', 0.9);
    [[-0.45, -0.1, 0.3, 0.45], [-0.08, -0.4, 0.28, 0.75], [0.27, -0.2, 0.26, 0.55]].forEach(function (b) {
      c.fillRect(x + b[0] * r, y + b[1] * r, b[2] * r, b[3] * r);
    });
    D.pill(c, T('城市', 'City'), x - r - 5, y + 8 * Math.min(fsz(), 1.35), C.text, 'right', font(11, 600));
  }
  function drawProbeMap(c, v) {
    const pr = S.probe;
    if (!pr) return;
    const p = toS(v, pr.x, pr.y);
    c.save();
    c.lineCap = 'round';
    // 運輸路線：陸路（虛線）＋河運（亮藍）
    c.strokeStyle = D.alpha(C['vt-probe'], 0.9); c.lineWidth = 2; c.setLineDash([5, 4]);
    c.beginPath(); c.moveTo(p[0], p[1]);
    if (pr.usesRiver) {
      const q = toS(v, pr.landing, 0);
      c.lineTo(q[0], q[1]); c.stroke(); c.setLineDash([]);
      c.strokeStyle = D.shade(C['vt-river'], D.dark ? 0.55 : 0.75); c.lineWidth = 3;
      c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(v.cx, v.cy); c.stroke();
      // 上岸的夾角：陸路段和「背向城市的河道」之間，cos θ = k
      const rr = 16, a0 = pr.landing >= 0 ? 0 : Math.PI, a1 = Math.atan2(p[1] - q[1], p[0] - q[0]);
      let da = a1 - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da <= -Math.PI) da += 2 * Math.PI;
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) > rr + 6) {
        c.strokeStyle = D.alpha(C.text, 0.7); c.lineWidth = 1;
        c.beginPath(); c.arc(q[0], q[1], rr, a0, a0 + da, da < 0); c.stroke();
        const am = a0 + da / 2;
        D.haloText(c, num(pr.angle, 0) + '°', q[0] + Math.cos(am) * (rr + 13), q[1] + Math.sin(am) * (rr + 13) + 4, C.text, 'center', 'alphabetic', font(11));
      }
    } else {
      c.lineTo(v.cx, v.cy); c.stroke(); c.setLineDash([]);
    }
    // 標記：大頭針
    const g0 = c.createRadialGradient(p[0], p[1] + 1, 0, p[0], p[1] + 1, 7);
    g0.addColorStop(0, D.shadowInk(0.4)); g0.addColorStop(1, D.shadowInk(0));
    c.fillStyle = g0; c.beginPath(); c.ellipse(p[0], p[1] + 1, 7, 3.5, 0, 0, 7); c.fill();
    const hx = p[0], hy = p[1] - 17;
    c.fillStyle = D.shade(C['vt-probe'], -0.15);
    c.beginPath(); c.moveTo(p[0], p[1]); c.quadraticCurveTo(hx - 7, hy + 6, hx - 7, hy); c.arc(hx, hy, 7, Math.PI, 0); c.quadraticCurveTo(hx + 7, hy + 6, p[0], p[1]); c.fill();
    const g = c.createRadialGradient(hx - 2.5, hy - 2.5, 0.5, hx, hy, 7);
    g.addColorStop(0, D.shade(C['vt-probe'], 0.55)); g.addColorStop(1, C['vt-probe']);
    c.fillStyle = g; c.beginPath(); c.arc(hx, hy, 6, 0, 7); c.fill();
    c.fillStyle = col(pr.id); c.beginPath(); c.arc(hx, hy, 2.6, 0, 7); c.fill();
    if (kb && kb.focused()) {
      c.strokeStyle = C.accent; c.lineWidth = 1.5; c.setLineDash([4, 3]);
      c.beginPath(); c.arc(hx, hy - 1, 12, 0, 7); c.stroke(); c.setLineDash([]);
    }
    c.restore();
  }
  function drawMap() {
    const v = mapView();
    const key = paramsKey() + '|' + v.w + 'x' + v.h + '|' + state.zoom + '|' + D.ver + '|' + T('z', 'e') + fsz();
    if (key !== layerKey || !layer) {
      if (!layer) layer = document.createElement('canvas');
      layer.width = Math.round(v.w * size.dpr); layer.height = Math.round(v.h * size.dpr);
      const lc = layer.getContext('2d');
      lc.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      drawMapStatic(lc, v);
      layerKey = key;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, 0, 0);
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    drawProbeMap(ctx, v);
  }

  // =====================================================================
  // 立體地租曲面
  // =====================================================================
  let surf = null, surfKey = '';
  function buildSurface() {
    // 轉動時用粗的網格（畫得快），停下來再用細的
    const n = drag && drag.mode === 'rot' ? 48 : 112;
    const H = state.zoom || autoH(), key = paramsKey() + '|' + H + '|' + n;
    if (key === surfKey && surf) return surf;
    const z = new Float32Array((n + 1) * (n + 1)), ids = new Array(n * n);
    let top = 0;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const x = -H + 2 * H * i / n, y = -H + 2 * H * j / n;
      const b = K.bestAt(state.crops, K.costDist(x, y, state.river), state.m);
      z[j * (n + 1) + i] = b.rent; if (b.rent > top) top = b.rent;
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -H + 2 * H * (i + 0.5) / n, y = -H + 2 * H * (j + 0.5) / n;
      ids[j * n + i] = K.bestAt(state.crops, K.costDist(x, y, state.river), state.m).id;
    }
    surf = { n: n, H: H, z: z, ids: ids, top: top };
    surfKey = key;
    return surf;
  }
  function proj3(sf) {
    const ca = Math.cos(state.az), sa = Math.sin(state.az), se = Math.sin(state.el), ce = Math.cos(state.el);
    const zs = 0.85 / Math.max(1, sf.top);
    const f = function (X, Y, Z) {      // X、Y 已除以 H（−1…1）；Z 是地租
      const xr = X * ca - Y * sa, yr = X * sa + Y * ca;
      return [xr, -(yr * se + Z * zs * ce), yr];
    };
    // 依畫面大小縮放：底面四角與城市上方的最高點都要放得下
    const pts = [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [0, 0, sf.top]].map(function (q) { return f(q[0], q[1], q[2]); });
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    pts.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    const w = size.w, h = size.h, pad = 18;
    const sc = Math.min((w - 2 * pad) / (x1 - x0), (h - 2 * pad - 10) / (y1 - y0));
    const ox = w / 2 - sc * (x0 + x1) / 2, oy = h / 2 + 6 - sc * (y0 + y1) / 2;
    return function (X, Y, Z) { const p = f(X, Y, Z); return [ox + sc * p[0], oy + sc * p[1], p[2]]; };
  }
  let s3Key = '', s3 = null;
  function draw3D() {
    const sf = buildSurface(), n = sf.n, P = proj3(sf);
    const key = surfKey + '|' + state.az.toFixed(4) + '|' + state.el.toFixed(4) + '|' + size.w + 'x' + size.h + '|' + D.ver + '|' + T('z', 'e') + fsz();
    if (key !== s3Key || !s3) {
      if (!s3) s3 = document.createElement('canvas');
      s3.width = Math.round(size.w * size.dpr); s3.height = Math.round(size.h * size.dpr);
      const c = s3.getContext('2d');
      c.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      D.backdrop(c, size.w, size.h);
      const N1 = n + 1, zt = Math.max(1, sf.top);
      const sp = new Array(N1 * N1);
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) sp[j * N1 + i] = P(-1 + 2 * i / n, -1 + 2 * j / n, sf.z[j * N1 + i]);
      // 每一格是一個面；顏色交界的格子再細分成 3×3（高度照樣精確計算），交界才不會像鋸齒
      const faces = [], fine = n > 60 ? 3 : 1, cid = sf.ids, H = sf.H;
      const at = function (X, Y) { return K.bestAt(state.crops, K.costDist(X * H, Y * H, state.river), state.m); };
      const pushFace = function (pa, pb, pd, pe, za, zb, zd, ze, cell, id) {
        faces.push({ p: [pa, pb, pe, pd], z: [za, zb, zd, ze], cell: cell, id: id, depth: (pa[2] + pb[2] + pd[2] + pe[2]) / 4 });
      };
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = j * N1 + i, b = a + 1, d = a + N1, e = d + 1, q = j * n + i;
        const mixed = fine > 1 && ((i > 0 && cid[q - 1] !== cid[q]) || (i < n - 1 && cid[q + 1] !== cid[q]) || (j > 0 && cid[q - n] !== cid[q]) || (j < n - 1 && cid[q + n] !== cid[q]));
        if (!mixed) { pushFace(sp[a], sp[b], sp[d], sp[e], sf.z[a], sf.z[b], sf.z[d], sf.z[e], 2 / n, cid[q]); continue; }
        const X0 = -1 + 2 * i / n, Y0 = -1 + 2 * j / n, st = 2 / n / fine, zz = [], pp = [];
        for (let v = 0; v <= fine; v++) for (let u = 0; u <= fine; u++) {
          const X = X0 + st * u, Y = Y0 + st * v, r = (u === 0 && v === 0) ? sf.z[a] : (u === fine && v === 0) ? sf.z[b] : (u === 0 && v === fine) ? sf.z[d] : (u === fine && v === fine) ? sf.z[e] : at(X, Y).rent;
          zz.push(r); pp.push(P(X, Y, r));
        }
        const F1 = fine + 1;
        for (let v = 0; v < fine; v++) for (let u = 0; u < fine; u++) {
          const k0 = v * F1 + u;
          pushFace(pp[k0], pp[k0 + 1], pp[k0 + F1], pp[k0 + F1 + 1], zz[k0], zz[k0 + 1], zz[k0 + F1], zz[k0 + F1 + 1], st, at(X0 + st * (u + 0.5), Y0 + st * (v + 0.5)).id);
        }
      }
      // 由遠到近畫（畫家演算法）
      faces.sort(function (f1, f2) { return f2.depth - f1.depth; });
      const L = [-0.45, 0.5, 0.74], ln = Math.hypot(L[0], L[1], L[2]);
      const rgbOf = {};
      IDS.concat([null]).forEach(function (id) { rgbOf[id] = D.rgb(col(id)); });
      const zsc = 0.85 / zt;
      c.lineJoin = 'round';
      faces.forEach(function (f) {
        const cell = f.cell, za = f.z[0] * zsc, zb = f.z[1] * zsc, zd = f.z[2] * zsc, ze = f.z[3] * zsc;
        // 法向量（兩條對角線的外積）
        const ux = cell, uy = cell, uz = ze - za, vx = -cell, vy = cell, vz = zd - zb;
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        const lit = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / ln);
        const base = rgbOf[f.id];
        const k = (D.dark ? 0.5 : 0.62) + (D.dark ? 0.55 : 0.45) * lit;
        const fill = 'rgb(' + base.map(function (x) { return Math.max(0, Math.min(255, Math.round(x * k))); }).join(',') + ')';
        const p = f.p;
        c.beginPath(); c.moveTo(p[0][0], p[0][1]); c.lineTo(p[1][0], p[1][1]); c.lineTo(p[2][0], p[2][1]); c.lineTo(p[3][0], p[3][1]); c.closePath();
        c.fillStyle = fill; c.fill();
        c.strokeStyle = fill; c.lineWidth = 0.5; c.stroke();
      });
      // 每隔幾格畫一條淡淡的網格線，讓曲面的起伏更容易看
      c.strokeStyle = D.alpha(D.dark ? '#000000' : '#2a2416', D.dark ? 0.28 : 0.13); c.lineWidth = 0.7;
      const gs = n / 8;
      for (let j = 0; j <= n; j += gs) { c.beginPath(); for (let i = 0; i <= n; i++) { const p = sp[j * N1 + i]; if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); } c.stroke(); }
      for (let i = 0; i <= n; i += gs) { c.beginPath(); for (let j = 0; j <= n; j++) { const p = sp[j * N1 + i]; if (j) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); } c.stroke(); }
      // 河：在曲面上沿 y = 0 畫一條藍線
      if (state.river.on) {
        c.strokeStyle = D.shade(C['vt-river'], D.dark ? 0.2 : 0); c.lineWidth = 2.5; c.lineCap = 'round';
        c.beginPath();
        for (let i = 0; i <= n; i++) { const p = sp[(n / 2) * N1 + i]; if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }
        c.stroke();
      }
      // 靠近觀看者的兩個側面（像切開的蛋糕），讓高度更明顯
      const edges = [[0, 0, 1, 0], [1, 0, 0, 1], [0, 1, 1, 0], [0, 0, 0, 1]].map(function (E) {
        const i0 = E[0] * n, j0 = E[1] * n, di = E[2], dj = E[3];
        const mid = sp[(j0 + dj * n / 2) * N1 + i0 + di * n / 2];
        return { i0: i0, j0: j0, di: di, dj: dj, depth: mid[2] };
      }).sort(function (a, b) { return b.depth - a.depth; }).slice(2);
      edges.forEach(function (E) {
        c.beginPath();
        for (let t = 0; t <= n; t++) { const q = (E.j0 + E.dj * t) * N1 + E.i0 + E.di * t, p = sp[q]; if (t) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }
        for (let t = n; t >= 0; t--) {
          const i = E.i0 + E.di * t, j = E.j0 + E.dj * t, p = P(-1 + 2 * i / n, -1 + 2 * j / n, 0);
          c.lineTo(p[0], p[1]);
        }
        c.closePath();
        c.fillStyle = D.alpha(D.dark ? '#000000' : '#5a4a32', D.dark ? 0.42 : 0.22); c.fill();
        c.strokeStyle = D.alpha(C.text, 0.25); c.lineWidth = 0.8; c.stroke();
      });
      // 城市的位置與最高的地租
      const pc = P(0, 0, sf.top);
      c.fillStyle = C['vt-city']; c.beginPath(); c.arc(pc[0], pc[1], 4, 0, 7); c.fill();
      c.strokeStyle = '#ffffff'; c.lineWidth = 1.2; c.stroke();
      if (sf.top > 0) D.pill(c, T('城市：', 'City: ') + perHa(sf.top), pc[0] + 8, pc[1] - 6, C.text, 'left', font(11, 600));
      else D.pill(c, T('地租處處 ≤ 0：沒有人耕種', 'Rent ≤ 0 everywhere: nobody farms'), size.w / 2, size.h / 2, C.text, 'center', font(12, 600));
      // 指北（底面的北邊）
      const pn = P(0, 1.08, 0), pn0 = P(0, 0.9, 0);
      D.arrow(c, pn0[0], pn0[1], pn[0], pn[1], C.text, 1.6);
      D.haloText(c, T('北', 'N'), pn[0], pn[1] - 5, C.text, 'center', 'alphabetic', font(11, 600));
      D.haloText(c, T('高度＝地租；邊長 ', 'Height = rent; side ') + km(2 * sf.H), 10, size.h - 10, C.muted, 'left', 'alphabetic', font(11));
      s3Key = key;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(s3, 0, 0);
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    // 這塊地：從地面立一根針到曲面上
    const pr = S.probe;
    if (pr && Math.abs(pr.x) <= sf.H && Math.abs(pr.y) <= sf.H) {
      const p0 = P(pr.x / sf.H, pr.y / sf.H, 0), p1 = P(pr.x / sf.H, pr.y / sf.H, pr.rent);
      ctx.strokeStyle = C['vt-probe']; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1] - 6); ctx.stroke();
      ctx.fillStyle = C['vt-probe']; ctx.beginPath(); ctx.arc(p1[0], p1[1] - 8, 5, 0, 7); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.stroke();
    }
  }

  // =====================================================================
  // 地租線圖
  // =====================================================================
  function grGeom() {
    const fs = Math.min(fsz(), 1.35);
    return { pl: Math.round(54 * fs), pr: 12, pt: Math.round(14 * fs), pb: Math.round(50 * fs), w: gsize.w, h: gsize.h };
  }
  function grRange() {
    let ymax = 0;
    IDS.forEach(function (id) { const c = S.crops[id]; if (c.on && c.A > ymax) ymax = c.A; });
    ymax = ymax > 0 ? niceStep(ymax * 1.08 / 4) * Math.ceil(ymax * 1.08 / niceStep(ymax * 1.08 / 4)) : 1000;
    const xmax = S.frontier > 0 ? Math.max(1, S.frontier * 1.15) : 100;
    return { xmax: xmax, ymax: ymax, ymin: -0.12 * ymax };
  }
  function drawGraph() {
    const c = gctx, g = grGeom(), R = grRange(), w = g.w, h = g.h;
    const X = function (d) { return g.pl + (w - g.pl - g.pr) * d / R.xmax; };
    const Y = function (r) { return g.pt + (h - g.pt - g.pb) * (R.ymax - r) / (R.ymax - R.ymin); };
    D.backdrop(c, w, h);
    // 格線
    const xs = niceStep(R.xmax / (w < 480 ? 4 : 5)), ys = niceStep(R.ymax / (h < 240 ? 3 : 4));
    c.lineWidth = 1;
    for (let x = 0; x <= R.xmax + 1e-9; x += xs) {
      const px = Math.round(X(x)) + 0.5;
      c.strokeStyle = D.alpha(C.text, 0.08); c.beginPath(); c.moveTo(px, g.pt); c.lineTo(px, Y(R.ymin)); c.stroke();
      D.haloText(c, grp(x, xs < 1 ? 1 : 0), px, h - 4 - 20 * Math.min(fsz(), 1.35), C.muted, 'center', 'alphabetic', font(11));
    }
    for (let y = 0; y <= R.ymax + 1e-9; y += ys) {
      const py = Math.round(Y(y)) + 0.5;
      c.strokeStyle = D.alpha(C.text, y === 0 ? 0.45 : 0.08); c.beginPath(); c.moveTo(g.pl, py); c.lineTo(w - g.pr, py); c.stroke();
      D.haloText(c, grp(y), g.pl - 5, py + 4, C.muted, 'right', 'alphabetic', font(11));
    }
    D.haloText(c, T('運輸距離（換成陸路，km）', 'Transport distance (over-land km)'), w - g.pr, h - 3, C.muted, 'right', 'alphabetic', font(11));
    D.haloText(c, T('地租（元／公頃）', 'Rent (yuan/ha)'), g.pl + 4, g.pt + 10, C.muted, 'left', 'alphabetic', font(11));
    // 圈的色帶（橫軸下方）
    const by = Y(0) + 4, bh = 7;
    c.fillStyle = D.alpha(C['vt-wild'], 0.9); c.fillRect(X(0), by, X(R.xmax) - X(0), bh);
    S.rings.forEach(function (s) { c.fillStyle = col(s.id); c.fillRect(X(s.from), by, Math.max(1, X(Math.min(s.to, R.xmax)) - X(s.from)), bh); });
    c.save();
    c.beginPath(); c.rect(g.pl, g.pt - 2, w - g.pl - g.pr, Y(R.ymin) - g.pt + 2); c.clip();
    // 每一種作物的地租線（細）
    c.lineCap = 'round';
    IDS.forEach(function (id) {
      const cr = S.crops[id];
      if (!cr.on) return;
      c.strokeStyle = D.alpha(col(id), 0.7); c.lineWidth = 1.3; c.setLineDash([5, 4]);
      c.beginPath(); c.moveTo(X(0), Y(cr.A)); c.lineTo(X(R.xmax), Y(cr.A - cr.B * R.xmax)); c.stroke();
    });
    c.setLineDash([]);
    // 上包絡（真正種下去的）：粗線
    S.rings.forEach(function (s) {
      c.strokeStyle = D.alpha(D.dark ? '#000000' : '#ffffff', 0.7); c.lineWidth = 5.5;
      c.beginPath(); c.moveTo(X(s.from), Y(s.rFrom)); c.lineTo(X(s.to), Y(s.rTo)); c.stroke();
      c.strokeStyle = D.shade(col(s.id), D.dark ? 0.05 : -0.1); c.lineWidth = 3.2;
      c.beginPath(); c.moveTo(X(s.from), Y(s.rFrom)); c.lineTo(X(s.to), Y(s.rTo)); c.stroke();
    });
    c.restore();
    // 交點
    S.rings.forEach(function (s, i) {
      if (!i) return;
      c.fillStyle = C['canvas-bg']; c.strokeStyle = C.text; c.lineWidth = 1.2;
      c.beginPath(); c.arc(X(s.from), Y(s.rFrom), 3.2, 0, 7); c.fill(); c.stroke();
    });
    // 作物名稱：放在它那一段的中間；沒出現的放在線的起點附近
    const boxes = [];
    const place = function (txt, x, y, color) {
      c.font = font(11, 600);
      const tw = c.measureText(txt).width + 12, lh = 15 * Math.min(fsz(), 1.35);
      x = Math.max(g.pl + tw / 2 + 2, Math.min(w - g.pr - tw / 2 - 2, x));
      let yy = y;
      const hit = function (yv) { return boxes.some(function (b) { return Math.abs(b.y - yv) < lh + 2 && Math.abs(b.x - x) < (b.w + tw) / 2 + 4; }); };
      for (let t = 1; t < 10 && hit(yy); t++) yy = y + (lh + 2) * (t % 2 ? -Math.ceil(t / 2) : Math.ceil(t / 2));
      yy = Math.max(g.pt + lh, Math.min(Y(0) - 2, yy));
      const b = D.pill(c, txt, x, yy, color, 'center', font(11, 600));
      boxes.push({ x: x, y: yy, w: b.w });
    };
    S.rings.forEach(function (s) {
      const xm = (s.from + Math.min(s.to, R.xmax)) / 2, r = s.rFrom + (s.rTo - s.rFrom) * (xm - s.from) / (s.to - s.from);
      place(nm(s.id), X(xm), Y(r) - 6, D.shade(col(s.id), D.dark ? 0.3 : -0.45));
    });
    IDS.forEach(function (id) {
      const cr = S.crops[id];
      if (!cr.on || S.present[id]) return;
      const xd = cr.A > 0 ? Math.min(cr.d0, R.xmax) * 0.3 : R.xmax * 0.1;
      const yv = cr.A - cr.B * xd;
      if (yv < R.ymin) return;
      place(nm(id) + T('（沒出現）', ' (not grown)'), X(xd), Math.max(g.pt + 14, Y(yv) - 6), D.alpha(D.shade(col(id), D.dark ? 0.3 : -0.4), 0.8));
    });
    // 這塊地的距離
    const pr = S.probe;
    if (pr && pr.D <= R.xmax) {
      const px = X(pr.D);
      c.strokeStyle = D.alpha(C['vt-probe'], 0.85); c.lineWidth = 1.5; c.setLineDash([4, 3]);
      c.beginPath(); c.moveTo(px, g.pt); c.lineTo(px, Y(0) + 12); c.stroke(); c.setLineDash([]);
      c.fillStyle = C['vt-probe']; c.beginPath(); c.arc(px, Y(Math.max(0, pr.rent)), 4.5, 0, 7); c.fill();
      c.strokeStyle = '#ffffff'; c.lineWidth = 1.2; c.stroke();
    }
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function ringText(id) {
    const cr = S.crops[id];
    if (!cr.on) return T('沒有種', 'not grown');
    if (!S.present[id]) return cr.A <= 0 ? T('沒出現：價格不夠付生產成本', 'none: the price does not cover the cost') : T('沒出現：每個地方都有別的作物付得更多', 'none: everywhere another crop pays more');
    return km(S.inner[id]).replace(' km', '') + '–' + km(S.outer[id]) + T('，占農地 ', ', ') + num(100 * S.share[id], 1) + T('%', '% of farmland');
  }
  function updateReadouts() {
    const cr = S.crops[state.sel];
    setText('rA', perHa(cr.A));
    setText('rB', perHa(cr.B));
    setText('rD0', cr.A > 0 ? km(cr.d0) : T('城裡就虧本', 'loses money even in the city'));
    setText('rRing', ringText(state.sel));
    $('grow').setAttribute('aria-pressed', cr.on ? 'true' : 'false');
    setText('growTxt', cr.on ? T('種植中：' + nm(state.sel), 'Grown: ' + nm(state.sel)) : T('不種：' + nm(state.sel) + '（按一下恢復）', 'Not grown: ' + nm(state.sel) + ' (tap to bring back)'));
    setOut(el.Y, num(cr.Y, cr.Y < 1 ? 2 : 1)); setOut(el.p, grp(cr.p)); setOut(el.c, grp(cr.c)); setOut(el.f, num(cr.f, 1));
    setOut(el.m, num(state.m, 2)); setOut(el.k, num(state.river.k, 2));
    $('riverBtn').setAttribute('aria-pressed', state.river.on ? 'true' : 'false');
    $('kRow').hidden = !state.river.on;
    setText('rStretch', state.river.on ? (state.river.k < 1 ? num(1 / state.river.k, 2) + T(' 倍（到 ', '× (to ') + km(S.frontierRiver) + T('）', ')') : T('1 倍：河運沒有比較便宜', '1×: shipping is no cheaper')) : T('—（沒有河）', '— (no river)'));
    setText('rAreaF', state.river.on ? num(S.S, 3) + T(' 倍', '×') : T('1 倍', '1×'));
    // 這塊地
    const pr = S.probe;
    if (pr) {
      setText('pDist', km(pr.dist));
      setText('pRoute', pr.usesRiver
        ? T('走陸路 ' + km(pr.land) + ' 到河邊（和河夾 ' + num(pr.angle, 1) + '°），再坐船 ' + km(pr.water), 'Walk ' + km(pr.land) + ' to the river (meeting it at ' + num(pr.angle, 1) + '°), then ship ' + km(pr.water))
        : (state.river.on && state.river.k < 1 ? T('直接走陸路 ' + km(pr.dist) + '（坐船反而比較貴）', 'Straight over land, ' + km(pr.dist) + ' (the boat would cost more)') : T('直接走陸路 ' + km(pr.dist), 'Straight over land, ' + km(pr.dist))));
      setText('pD', km(pr.D));
      setText('pCrop', nm(pr.id));
      setText('pRent', pr.id ? perHa(pr.rent) : T('0（沒有作物划算）', '0 (no crop pays)'));
      let html = '<tr><th>' + T('作物', 'Crop') + '</th><th>' + T('在這裡的地租', 'Rent here') + '</th></tr>';
      IDS.forEach(function (id) {
        const c = S.crops[id];
        if (!c.on) return;
        const r = c.A - c.B * pr.D, best = id === pr.id;
        html += '<tr><td><span class="nm"><i style="background:var(--vt-' + id + ')"></i>' + (best ? '<b>' + nm(id) + '</b>' : nm(id)) + '</span></td><td' + (r <= 0 ? ' class="off"' : '') + '>' + (best ? '<b>' + perHa(r) + '</b>' : perHa(r)) + '</td></tr>';
      });
      setHTML('pTab', html);
    }
    // 圈
    let html = '<tr><th>' + T('由內而外', 'Inside out') + '</th><th>' + T('範圍（km）', 'Range (km)') + '</th><th>' + T('面積', 'Area') + '</th></tr>';
    S.rings.forEach(function (s) {
      html += '<tr><td><span class="nm"><i style="background:var(--vt-' + s.id + ')"></i>' + nm(s.id) + '</span></td><td>' + num(s.from, s.from >= 100 ? 0 : 1) + '–' + num(s.to, s.to >= 100 ? 0 : 1) + '</td><td>' + num(100 * S.share[s.id], 1) + '%</td></tr>';
    });
    IDS.forEach(function (id) {
      if (S.present[id]) return;
      html += '<tr><td class="off"><span class="nm"><i style="background:var(--vt-' + id + ');opacity:.45"></i>' + nm(id) + '</span></td><td class="off" colspan="2">' + (S.crops[id].on ? T('沒出現', 'not on the map') : T('沒有種', 'not grown')) + '</td></tr>';
    });
    setHTML('ringTab', html);
    setText('rFront', S.frontier > 0 ? km(S.frontier) + (state.river.on && state.river.k < 1 ? T('（沿河 ', ' (along the river ') + km(S.frontierRiver) + T('）', ')') : '') : T('沒有農業', 'no farming'));
    setText('rFarm', area(S.farm));
    setText('rTotal', T(num(S.totalRent / 1e8, 2) + ' 億元／年', num(S.totalRent / 1e6, 0) + ' million yuan a year') +
      T('（杜能設定的 ' + num(S.totalRent / K.TOTAL0, 2) + ' 倍）', ' (' + num(S.totalRent / K.TOTAL0, 2) + '× von Thünen\'s)'));
    $('srNow').textContent = S.rings.length
      ? T('由內而外：' + S.rings.map(function (s) { return nm(s.id) + ' 到 ' + km(s.to); }).join('，'), 'From the inside out: ' + S.rings.map(function (s) { return nm(s.id) + ' to ' + km(s.to); }).join(', '))
      : T('沒有任何作物划算。', 'No crop pays anywhere.');
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function snapshot(act) {
    return Object.assign({ act: act || 'param', view: state.view, zoom: state.zoom, sel: state.sel }, S);
  }
  let lastEmit = 0, emitTimer = 0;
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function afterChange(force, act) {
    recompute();
    updateReadouts();
    requestDraw();
    const now = performance.now();
    clearTimeout(emitTimer);
    if (force || now - lastEmit > 250) { lastEmit = now; emit('vt', snapshot(act)); }
    else emitTimer = setTimeout(function () { lastEmit = performance.now(); emit('vt', snapshot(act)); }, 270);
  }

  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame() {
    raf = 0;
    if (state.view === '3d') draw3D(); else drawMap();
    drawGraph();
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  function loadCropSliders() {
    const cr = state.crops[state.sel];
    syncing = true;
    if (window.LabNum) { LabNum.set(el.Y, cr.Y); LabNum.set(el.p, cr.p); LabNum.set(el.c, cr.c); LabNum.set(el.f, cr.f); }
    else { el.Y.value = cr.Y; el.p.value = cr.p; el.c.value = cr.c; el.f.value = cr.f; }
    syncing = false;
    document.querySelectorAll('#cropSeg button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-crop') === state.sel ? 'true' : 'false'); });
  }
  function loadOtherSliders() {
    syncing = true;
    if (window.LabNum) { LabNum.set(el.m, state.m); LabNum.set(el.k, state.river.k); }
    else { el.m.value = state.m; el.k.value = state.river.k; }
    syncing = false;
  }
  const Lm = K.LIMITS;
  function cropChanged(e) {
    if (syncing) return;
    acted();
    const cr = state.crops[state.sel];
    cr.Y = K.clamp(Math.round(val(el.Y) * 100) / 100, Lm.Y[0], Lm.Y[1]);
    cr.p = K.clamp(Math.round(val(el.p)), Lm.p[0], Lm.p[1]);
    cr.c = K.clamp(Math.round(val(el.c)), Lm.c[0], Lm.c[1]);
    cr.f = K.clamp(Math.round(val(el.f) * 100) / 100, Lm.f[0], Lm.f[1]);
    afterChange(e && e.type === 'change', 'param');
    if (e && e.type === 'change') say();
  }
  [el.Y, el.p, el.c, el.f].forEach(function (inp) { inp.addEventListener('input', cropChanged); inp.addEventListener('change', cropChanged); });
  function transportChanged(e) {
    if (syncing) return;
    acted();
    state.m = K.clamp(Math.round(val(el.m) * 1000) / 1000, Lm.m[0], Lm.m[1]);
    state.river.k = K.clamp(Math.round(val(el.k) * 1000) / 1000, Lm.k[0], Lm.k[1]);
    afterChange(e && e.type === 'change', 'param');
    if (e && e.type === 'change') say();
  }
  [el.m, el.k].forEach(function (inp) { inp.addEventListener('input', transportChanged); inp.addEventListener('change', transportChanged); });
  // 改完設定後，用一句話說明圈的變化
  function say() {
    if (!S.rings.length) { setStatus(T('每一種作物在城裡就已經虧本，整片平原都是荒野。', 'Every crop loses money even at the city: the whole plain is wilderness.')); return; }
    setStatus(T('由內而外：', 'From the inside out: ') + S.rings.map(function (s) { return '<b>' + nm(s.id) + '</b> ' + T('到 ', 'to ') + km(s.to); }).join(T('，', ', ')) + T('。', '.'));
  }
  document.querySelectorAll('#cropSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      state.sel = b.getAttribute('data-crop');
      loadCropSliders();
      afterChange(true, 'crop');
    });
  });
  $('grow').addEventListener('click', function () {
    acted();
    const cr = state.crops[state.sel];
    cr.on = !cr.on;
    setStatus(cr.on ? T('又開始種' + nm(state.sel) + '。', nm(state.sel) + ' is back.') : T('不再種' + nm(state.sel) + '：它的地讓給付得起第二高地租的作物。', 'No more ' + nm(state.sel).toLowerCase() + ': its land goes to whichever crop pays the next-highest rent.'));
    afterChange(true, 'grow');
  });
  $('riverBtn').addEventListener('click', function () {
    acted();
    state.river.on = !state.river.on;
    setStatus(state.river.on ? T('一條河從城市流過：坐船比走陸路便宜，每一個圈都沿著河拉長。', 'A river flows through the city: shipping is cheaper than carting, so every ring stretches along it.') : T('拿掉河流，圈又變回圓形。', 'Without the river the rings are circles again.'));
    afterChange(true, 'river');
  });
  document.querySelectorAll('#viewSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      state.view = b.getAttribute('data-view');
      document.querySelectorAll('#viewSeg button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      cv.classList.toggle('rot', state.view === '3d');
      $('hintMap').hidden = state.view !== 'map'; $('hint3d').hidden = state.view !== '3d';
      if (state.view === '3d') setStatus(T('每一塊地的地租畫成高度：一座以城市為頂點、一層一層的山。拖曳可以轉動。', 'Rent drawn as height: a stepped hill with the city at the top. Drag to turn it.'));
      afterChange(true, 'view');
    });
  });
  document.querySelectorAll('#zoomSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      state.zoom = +b.getAttribute('data-zoom');
      document.querySelectorAll('#zoomSeg button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      afterChange(true, 'zoom');
    });
  });
  $('reset').addEventListener('click', function () {
    acted();
    state.crops = K.defaults(); state.m = 1; state.river.on = false; state.river.k = 0.4;
    loadCropSliders(); loadOtherSliders();
    setStatus(T('回到杜能的設定：蔬菜牛奶、林木、穀物、放牧四個圈。', 'Back to von Thünen\'s settings: vegetables and dairy, forestry, grain and grazing.'));
    afterChange(true, 'reset');
  });

  // ---------- 這塊地（點、拖曳、方向鍵） ----------
  function setProbe(x, y, act, force) {
    const lim = 5000;
    state.probe = { x: Math.max(-lim, Math.min(lim, Math.round(x * 100) / 100)), y: Math.max(-lim, Math.min(lim, Math.round(y * 100) / 100)) };
    afterChange(force, act || 'probe');
  }
  function probeStatus() {
    const pr = S.probe;
    if (!pr) return;
    setStatus(pr.id ? T('這塊地種<b>' + nm(pr.id) + '</b>：每公頃付得起 ' + perHa(pr.rent) + '，比其他作物都多。', 'This field grows <b>' + nm(pr.id).toLowerCase() + '</b>: it can pay ' + perHa(pr.rent) + ', more than any other crop.')
      : T('這塊地太遠了，任何作物的收入都付不起運費：荒野。', 'Too far: no crop earns enough to pay the freight. Wilderness.'));
  }
  let drag = null;
  cv.addEventListener('pointerdown', function (e) {
    acted();
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    if (state.view === '3d') { drag = { mode: 'rot', x: x, y: y, az: state.az, el: state.el }; return; }
    const v = mapView();
    drag = { mode: 'probe' };
    setProbe((x - v.cx) / v.s, (v.cy - y) / v.s, 'probe', false);
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drag) return;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (drag.mode === 'rot') {
      state.az = drag.az - (x - drag.x) * 0.012;
      state.el = Math.max(0.25, Math.min(1.25, drag.el + (y - drag.y) * 0.006));
      requestDraw();
    } else {
      const v = mapView();
      setProbe((x - v.cx) / v.s, (v.cy - y) / v.s, 'probe', false);
    }
  });
  function endDrag() {
    if (!drag) return;
    const m = drag.mode; drag = null;
    if (m === 'probe') { probeStatus(); afterChange(true, 'probe'); }
    else afterChange(true, 'rotate');
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  gr.addEventListener('pointerdown', function (e) {
    const r = gr.getBoundingClientRect(), g = grGeom(), R = grRange();
    const d = (e.clientX - r.left - g.pl) / (g.w - g.pl - g.pr) * R.xmax;
    if (d < 0 || d > R.xmax * 1.02) return;
    acted();
    setProbe(0, Math.max(0, d), 'probe', true);
    probeStatus();
  });

  const kb = window.LabKeys ? window.LabKeys.attach(cv, {
    label: T('平原的地圖。方向鍵移動「這塊地」的標記（Shift 一次 10 格）。', 'Map of the plain. Arrow keys move the field marker (Shift for 10 steps).'),
    items: [{
      name: function () { return T('這塊地', 'The field'); },
      move: function (dx, dy, big) {
        acted();
        const st = niceStep((state.zoom || autoH()) / 100) * (big ? 10 : 1), p = state.probe || { x: 0, y: 0 };
        setProbe(p.x + dx * st, p.y + dy * st, 'probe', true);
        probeStatus();
        return true;
      },
      describe: function () {
        const pr = S.probe;
        return pr ? T('離城 ' + km(pr.dist) + '，種' + nm(pr.id), km(pr.dist) + ' from the city: ' + nm(pr.id)) : '';
      }
    }],
    onChange: function () { requestDraw(); }
  }) : null;

  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      const c = {};
      IDS.forEach(function (id) { const q = state.crops[id]; c[id] = [q.Y, q.p, q.c, q.f, q.on ? 1 : 0]; });
      return { c: c, m: state.m, r: state.river.on ? 1 : 0, k: state.river.k, s: state.sel, p: state.probe ? [state.probe.x, state.probe.y] : null };
    },
    set: function (o) {
      if (!o) return;
      if (o.c) IDS.forEach(function (id) {
        const a = o.c[id];
        if (!Array.isArray(a)) return;
        const q = state.crops[id];
        if (isFinite(a[0])) q.Y = K.clamp(+a[0], Lm.Y[0], Lm.Y[1]);
        if (isFinite(a[1])) q.p = K.clamp(+a[1], Lm.p[0], Lm.p[1]);
        if (isFinite(a[2])) q.c = K.clamp(+a[2], Lm.c[0], Lm.c[1]);
        if (isFinite(a[3])) q.f = K.clamp(+a[3], Lm.f[0], Lm.f[1]);
        q.on = a[4] !== 0;
      });
      if (isFinite(o.m)) state.m = K.clamp(+o.m, Lm.m[0], Lm.m[1]);
      if (isFinite(o.k)) state.river.k = K.clamp(+o.k, Lm.k[0], Lm.k[1]);
      state.river.on = o.r === 1;
      if (IDS.indexOf(o.s) >= 0) state.sel = o.s;
      if (Array.isArray(o.p) && isFinite(o.p[0]) && isFinite(o.p[1])) state.probe = { x: +o.p[0], y: +o.p[1] };
      loadCropSliders(); loadOtherSliders();
      recompute(); updateReadouts(); requestDraw();
    }
  });

  window.__vt = { state: state, K: K, snapshot: snapshot, get S() { return S; }, setProbe: setProbe, redraw: requestDraw };

  readColors();
  recompute();
  loadCropSliders(); loadOtherSliders();
  fit();
  recompute();
  updateReadouts();
  function themeChanged() { readColors(); layerKey = ''; s3Key = ''; updateReadouts(); requestDraw(); }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  let rsTimer = 0;
  window.addEventListener('resize', function () { clearTimeout(rsTimer); rsTimer = setTimeout(function () { fit(); requestDraw(); }, 60); });
  if (window.ResizeObserver) new ResizeObserver(function () { fit(); requestDraw(); }).observe(cv);
  setStatus(T('杜能的設定：城市外面依序是蔬菜牛奶、林木、穀物、放牧，再外面是荒野。點地圖看每一塊地為什麼種那樣作物。', 'Von Thünen\'s settings: around the city come vegetables and dairy, forestry, grain and grazing, then wilderness. Tap the map to see why each field grows what it does.'));
  requestDraw();
})();
