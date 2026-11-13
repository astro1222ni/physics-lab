/* central-place.js — 「中地理論：門檻、商品圈與六角形市場區」的畫面與互動
 * 門檻、商品圈、均衡間距與中地格子全部在 central-place-core.js（CentralCore）；這裡只負責操作、繪圖與讀數。 */
(function () {
  'use strict';
  const K = window.CentralCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FONT = D.FONT;
  const R3 = K.R3;
  const RANK = [null, ['村', 'village'], ['鎮', 'town'], ['市', 'city'], ['區域中心', 'regional capital']];
  const rankName = function (L) { return L ? T(RANK[L][0], RANK[L][1]) : ''; };

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = { rho: $('rho'), thr: $('thr'), rng: $('rng'), d1: $('d1'), gT: $('gT'), gR: $('gR') };
  const pow10 = function (x) { return Math.pow(10, x); };
  function regLog(r) { if (window.LabNum) window.LabNum.register(r, { toValue: pow10, toPos: Math.log10, min: pow10(+r.min), max: pow10(+r.max), decimals: 0 }); }
  regLog(el.thr); regLog(el.gT);
  const LIM = { rho: [10, 1000], T: [50, 100000], R: [0.5, 20], d1: [1, 20], gT: [100, 1e7], gR: [1, 100] };
  const clamp = function (v, a) { return Math.max(a[0], Math.min(a[1], v)); };
  const state = {
    mode: 'single', view: 'map',
    rho: 100, T: 2000, R: 5,
    k: 3, N: 3, d1: 6, show: 2, roads: false, gT: 10000, gR: 30,
    grow: { s: null, run: false },
    probe: null,
    az: -0.5, el: 0.62, acted: false
  };
  let S1 = null, H = null, G = null, syncing = false;
  function recompute() {
    S1 = K.single(state.rho, state.T, state.R);
    H = K.hierarchy(state.rho, state.d1, state.k, state.N);
    G = K.goodIn(state.rho, state.d1, state.k, state.N, state.gT, state.gR);
  }
  /** 一種商品模式現在的店距（動畫中是 grow.s，其他時候是均衡間距） */
  function spacingNow() { return state.grow.s != null ? state.grow.s : S1.d; }

  // ---------- 顏色與格式 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--cp-l1', '--cp-l2', '--cp-l3', '--cp-l4', '--cp-served', '--cp-gap', '--cp-range', '--cp-thr', '--cp-road', '--cp-probe', '--cp-ground', '--text', '--muted', '--border', '--surface', '--bg', '--accent']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    groundTile = null;
  }
  const lc = function (L) { return C['cp-l' + Math.max(1, Math.min(4, L))]; };
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    const s = v.toFixed(d == null ? 0 : d);
    return (/^-0(\.0*)?$/.test(s) ? s.slice(1) : s).replace(/^-/, '−');
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
  function area(v) {
    if (v == null || !isFinite(v)) return '—';
    return grp(v, v >= 100 ? 0 : v >= 10 ? 1 : 2) + T(' 平方公里', ' km²');
  }
  const people = function (v) { return grp(v, 0) + T(' 人', ''); };
  const pct = function (v, d) { return num(100 * v, d == null ? 1 : d) + '%'; };
  function setText(id, s) { const e = $(id); if (e && e.textContent !== s) e.textContent = s; }
  function setHTML(id, s) { const e = $(id); if (e && e.innerHTML !== s) e.innerHTML = s; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function setStatus(s) { $('status').innerHTML = s; }
  function fsz() { return (window.LabSettings && window.LabSettings.get && +window.LabSettings.get('fs')) || 1; }
  const font = function (px, w) { return (w ? w + ' ' : '') + Math.round(px * Math.min(fsz(), 1.35)) + 'px ' + FONT; };
  function niceStep(x) {
    const p = Math.pow(10, Math.floor(Math.log10(x))), m = x / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }

  // =====================================================================
  // 畫布與座標
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let size = { w: 600, h: 490 };
  function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || 300, h = cv.clientHeight || 250;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    size = { w: w, h: h };
  }
  /** 地圖的半寬（公里）：一種商品看商品圈，中地體系看最高一級的間距 */
  function halfWidth() {
    if (state.mode === 'hier') return 1.2 * K.levelSpacing(state.d1, state.k, state.N);
    if (S1.status === 'none') return Math.max(2.6 * Math.max(S1.rT, state.R), 1);
    return Math.max(2.2 * S1.d, Math.min(2.4 * state.R, 8 * S1.d));
  }
  function mapView() {
    const w = size.w, h = size.h, W = halfWidth();
    const s = (Math.min(w, h) / 2 - 6) / W;
    return { w: w, h: h, W: W, s: s, cx: w / 2, cy: h / 2, x0: -(w / 2) / s, x1: (w / 2) / s, y0: -(h / 2) / s, y1: (h / 2) / s };
  }
  const SX = function (v, x) { return v.cx + x * v.s; };
  const SY = function (v, y) { return v.cy - y * v.s; };

  // ---------- 地面材質 ----------
  let groundTile = null;
  function ground() {
    if (groundTile) return groundTile;
    const n = 64, c = document.createElement('canvas');
    c.width = c.height = n;
    const t = c.getContext('2d');
    t.fillStyle = C['cp-ground']; t.fillRect(0, 0, n, n);
    let seed = 11;
    const rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 110; i++) {
      t.fillStyle = D.alpha(rnd() < 0.5 ? '#000000' : '#ffffff', (D.dark ? 0.07 : 0.05) + rnd() * 0.05);
      t.fillRect(Math.floor(rnd() * n), Math.floor(rnd() * n), 1 + Math.floor(rnd() * 2), 1);
    }
    groundTile = ctx.createPattern(c, 'repeat');
    return groundTile;
  }
  function backdrop(v) {
    ctx.fillStyle = ground();
    ctx.fillRect(0, 0, v.w, v.h);
  }
  function hexPath(c, pts, v) {
    c.moveTo(SX(v, pts[0][0]), SY(v, pts[0][1]));
    for (let m = 1; m < 6; m++) c.lineTo(SX(v, pts[m][0]), SY(v, pts[m][1]));
    c.closePath();
  }
  /** 店或中地的小圓點（帶一點立體光影） */
  function dot(x, y, r, color, ring) {
    ctx.save();
    ctx.fillStyle = D.alpha('#000000', D.dark ? 0.45 : 0.22);
    ctx.beginPath(); ctx.arc(x + r * 0.25, y + r * 0.35, r, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, D.mix(color, '#ffffff', 0.45));
    g.addColorStop(1, D.shade(color, -0.2));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.strokeStyle = ring || D.alpha(D.dark ? '#000000' : '#ffffff', 0.85); ctx.lineWidth = r > 3 ? 1.3 : 0.8;
    ctx.stroke();
    ctx.restore();
  }
  function scaleBar(v) {
    const target = v.w * 0.22 / v.s, st = niceStep(target), L = st * v.s;
    const x = 12, y = v.h - 14;
    ctx.save();
    ctx.font = font(12, 600);
    const lab = km(st).replace(/\.00 km$/, ' km');
    const tw = Math.max(L, ctx.measureText(lab).width) + 16;
    D.roundRect(ctx, x - 6, y - 24, tw, 32, 8);
    ctx.fillStyle = D.alpha(C.surface, 0.82); ctx.fill();
    ctx.strokeStyle = C.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + L, y); ctx.lineTo(x + L, y - 4); ctx.stroke();
    ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(lab, x, y - 8);
    ctx.restore();
  }
  function tag(text, x, y, color, align) {
    D.haloText(ctx, text, x, y, color || C.text, align || 'center', 'alphabetic', font(12, 600));
  }

  // =====================================================================
  // 一種商品：店、商品圈、門檻圈、六邊形
  // =====================================================================
  function shopsIn(v, s) { return K.centersIn(v.x0 - s, v.y0 - s, v.x1 + s, v.y1 + s, s, 3, 1); }
  function drawSingle() {
    const v = mapView();
    backdrop(v);
    const R = state.R, rT = S1.rT;
    if (S1.status === 'none') {
      // 開不了店：整片都買不到；中間畫一家「想開的店」
      ctx.fillStyle = D.alpha(C['cp-gap'], 0.75); ctx.fillRect(0, 0, v.w, v.h);
      ctx.save();
      ctx.fillStyle = D.alpha(C['cp-served'], 0.9);
      ctx.beginPath(); ctx.arc(v.cx, v.cy, R * v.s, 0, 7); ctx.fill();
      ctx.strokeStyle = C['cp-range']; ctx.lineWidth = 2; ctx.stroke();
      ctx.setLineDash([6, 4]); ctx.strokeStyle = C['cp-thr']; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(v.cx, v.cy, rT * v.s, 0, 7); ctx.stroke();
      ctx.restore();
      dot(v.cx, v.cy, 6, D.mix(C.muted, C['cp-gap'], 0.3));
      ctx.save(); ctx.strokeStyle = C['cp-thr']; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(v.cx - 9, v.cy - 9); ctx.lineTo(v.cx + 9, v.cy + 9); ctx.moveTo(v.cx + 9, v.cy - 9); ctx.lineTo(v.cx - 9, v.cy + 9); ctx.stroke(); ctx.restore();
      tag(T('門檻半徑', 'threshold radius'), v.cx, v.cy - rT * v.s - 8, C['cp-thr']);
      tag(T('商品圈', 'range'), v.cx, v.cy + R * v.s + 18, C['cp-range']);
      drawProbe(v); scaleBar(v);
      return;
    }
    const s = spacingNow(), shops = shopsIn(v, s), c = s / R3;
    // 底色：先全部塗「買不到」，再在每個六邊形裡塗商品圈以內的部分
    ctx.fillStyle = D.alpha(C['cp-gap'], 0.75); ctx.fillRect(0, 0, v.w, v.h);
    ctx.save();
    ctx.fillStyle = D.alpha(C['cp-served'], 0.92);
    shops.forEach(function (p) {
      ctx.save();
      ctx.beginPath(); hexPath(ctx, K.hexAround(p.x, p.y, s, 3, 1), v); ctx.clip();
      ctx.beginPath(); ctx.arc(SX(v, p.x), SY(v, p.y), R * v.s, 0, 7); ctx.fill();
      ctx.restore();
    });
    ctx.restore();
    // 商品圈（圓）：還沒擠成六邊形時看得出重疊；中間那家畫清楚，其他的淡淡的
    ctx.save();
    ctx.strokeStyle = D.alpha(C['cp-range'], 0.28); ctx.lineWidth = 1;
    ctx.beginPath();
    shops.forEach(function (p) { const x = SX(v, p.x), y = SY(v, p.y); ctx.moveTo(x + R * v.s, y); ctx.arc(x, y, R * v.s, 0, 7); });
    ctx.stroke();
    // 市場區邊界（六邊形）
    ctx.strokeStyle = D.alpha(C.text, D.dark ? 0.5 : 0.55); ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
    ctx.beginPath(); shops.forEach(function (p) { hexPath(ctx, K.hexAround(p.x, p.y, s, 3, 1), v); }); ctx.stroke();
    // 中間那家店：商品圈與門檻圈
    ctx.strokeStyle = C['cp-range']; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(v.cx, v.cy, R * v.s, 0, 7); ctx.stroke();
    ctx.setLineDash([6, 4]); ctx.strokeStyle = C['cp-thr']; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(v.cx, v.cy, rT * v.s, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    const r = Math.max(3, Math.min(7, s * v.s * 0.07));
    shops.forEach(function (p) { dot(SX(v, p.x), SY(v, p.y), r, C['cp-l2']); });
    // 中間那家店的標示
    if (c * v.s > 40 && !state.probe) {
      ctx.save(); ctx.strokeStyle = D.alpha(C.text, 0.7); ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
      const a = Math.PI / 6, ex = c * Math.cos(a), ey = c * Math.sin(a);
      ctx.beginPath(); ctx.moveTo(v.cx, v.cy); ctx.lineTo(SX(v, ex), SY(v, ey)); ctx.stroke(); ctx.restore();
      tag(T('最遠 ', 'farthest ') + km(c), SX(v, ex * 0.55), SY(v, ey * 0.55) - 8, C.text);
    }
    drawProbe(v); scaleBar(v);
  }

  // =====================================================================
  // 中地體系：平面圖
  // =====================================================================
  function latUV(x, y, L) {
    const dL = K.levelSpacing(state.d1, state.k, L), al = K.levelAngle(state.k, L);
    const b1 = [dL * Math.cos(al), dL * Math.sin(al)], b2 = [dL * Math.cos(al + Math.PI / 3), dL * Math.sin(al + Math.PI / 3)];
    const det = b1[0] * b2[1] - b1[1] * b2[0];
    return [Math.round((x * b2[1] - y * b2[0]) / det), Math.round((b1[0] * y - b1[1] * x) / det)];
  }
  function shadeColor(L, x, y) {
    const uv = latUV(x, y, L), m = (((uv[0] - uv[1]) % 3) + 3) % 3;
    return D.alpha(lc(L), [0.16, 0.28, 0.4][m] * (D.dark ? 1.25 : 1));
  }
  /** 第 L 級格子上相鄰中地的連線（每條只畫一次） */
  function roadEdges(places, L) {
    const dL = K.levelSpacing(state.d1, state.k, L), al = K.levelAngle(state.k, L), out = [];
    places.forEach(function (p) {
      if (p.L < L) return;
      for (let m = 0; m < 3; m++) {
        const a = al + m * Math.PI / 3;
        out.push([p.x, p.y, p.x + dL * Math.cos(a), p.y + dL * Math.sin(a)]);
      }
    });
    return out;
  }
  function placesIn(v, pad) {
    return K.centersIn(v.x0 - pad, v.y0 - pad, v.x1 + pad, v.y1 + pad, state.d1, state.k, state.N);
  }
  function placeRadius(L, v) {
    const base = Math.max(1.6, Math.min(4, state.d1 * v.s * 0.13));
    return base * (1 + 0.55 * (L - 1));
  }
  function drawHierMap() {
    const v = mapView();
    backdrop(v);
    const N = state.N, show = Math.min(state.show, N);
    const pad = K.levelSpacing(state.d1, state.k, Math.max(1, show));
    const places = placesIn(v, pad);
    // 市場區塗色
    if (show > 0) {
      ctx.save();
      places.forEach(function (p) {
        if (p.L < show) return;
        ctx.fillStyle = shadeColor(show, p.x, p.y);
        ctx.beginPath(); hexPath(ctx, K.hexAround(p.x, p.y, state.d1, state.k, show), v); ctx.fill();
      });
      ctx.strokeStyle = D.alpha(D.shade(lc(show), D.dark ? 0.2 : -0.25), 0.85); ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
      ctx.beginPath();
      places.forEach(function (p) { if (p.L >= show) hexPath(ctx, K.hexAround(p.x, p.y, state.d1, state.k, show), v); });
      ctx.stroke();
      ctx.restore();
    }
    // 道路
    if (state.roads && N >= 2) {
      ctx.save(); ctx.lineCap = 'round';
      for (let L = 2; L <= N; L++) {
        const w = 1.2 + 1.1 * (L - 2);
        ctx.strokeStyle = D.alpha(D.shade(C['cp-road'], D.dark ? -0.35 : -0.25), 0.55); ctx.lineWidth = w + 1.6;
        const E = roadEdges(places, L);
        ctx.beginPath(); E.forEach(function (e) { ctx.moveTo(SX(v, e[0]), SY(v, e[1])); ctx.lineTo(SX(v, e[2]), SY(v, e[3])); }); ctx.stroke();
        ctx.strokeStyle = C['cp-road']; ctx.lineWidth = w;
        ctx.beginPath(); E.forEach(function (e) { ctx.moveTo(SX(v, e[0]), SY(v, e[1])); ctx.lineTo(SX(v, e[2]), SY(v, e[3])); }); ctx.stroke();
      }
      ctx.restore();
    }
    // 商品的商品圈（畫在中間的最高級中地）
    if (G.L) {
      ctx.save(); ctx.setLineDash([7, 5]); ctx.strokeStyle = C['cp-range']; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(v.cx, v.cy, state.gR * v.s, 0, 7); ctx.stroke(); ctx.restore();
    }
    // 中地：由低到高畫，高級的蓋在上面
    for (let L = 1; L <= N; L++) {
      const r = placeRadius(L, v);
      places.forEach(function (p) {
        if (p.L !== L) return;
        const x = SX(v, p.x), y = SY(v, p.y);
        if (x < -10 || x > v.w + 10 || y < -10 || y > v.h + 10) return;
        dot(x, y, r, lc(L));
      });
    }
    if (G.L) {
      const ry = v.cy - state.gR * v.s - 8;
      if (ry > 14) D.pill(ctx, T('商品圈 ', 'range ') + km(state.gR), v.cx, ry + 4, D.shade(C['cp-range'], D.dark ? 0.2 : -0.2), 'center', font(12, 600));
    }
    drawProbe(v); scaleBar(v);
  }

  // =====================================================================
  // 中地體系：立體等級（柱子高度 ∝ 等級）
  // =====================================================================
  function draw3D() {
    const w = size.w, h = size.h;
    const N = state.N, W = 1.2 * K.levelSpacing(state.d1, state.k, N);
    const ca = Math.cos(state.az), sa = Math.sin(state.az), se = Math.sin(state.el), ce = Math.cos(state.el);
    const zU = W * 0.06, RIM0 = W * 1.02, ZT = N * zU * ce;
    const sc = Math.min(w / (2 * RIM0 * 1.06), (h - 56) / (2 * RIM0 * se + ZT));
    const cy0 = 22 + (h - 56 - sc * (2 * RIM0 * se + ZT)) / 2 + sc * (RIM0 * se + ZT);
    const P = function (x, y, z) {
      const xr = x * ca - y * sa, yr = x * sa + y * ca;
      return [w / 2 + xr * sc, cy0 - yr * sc * se - (z || 0) * sc * ce, yr];
    };
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, D.alpha(C.accent, D.dark ? 0.1 : 0.06)); sky.addColorStop(1, D.alpha(C.accent, 0));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    // 地面：以原點為中心的圓盤（半徑 W）
    const RIM = W * 1.02;
    ctx.save();
    ctx.beginPath();
    for (let m = 0; m <= 72; m++) { const a = m / 72 * 2 * Math.PI, q = P(RIM * Math.cos(a), RIM * Math.sin(a), 0); m ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
    ctx.closePath();
    ctx.fillStyle = D.alpha('#000000', D.dark ? 0.35 : 0.12);
    ctx.save(); ctx.translate(0, 6); ctx.fill(); ctx.restore();
    ctx.fillStyle = ground(); ctx.fill();
    ctx.clip();
    const places = K.centersIn(-RIM - 1e-9, -RIM - 1e-9, RIM, RIM, state.d1, state.k, N).filter(function (p) { return Math.hypot(p.x, p.y) <= RIM; });
    const show = Math.min(state.show, N);
    if (show > 0) {
      const big = K.centersIn(-RIM * 1.6, -RIM * 1.6, RIM * 1.6, RIM * 1.6, state.d1, state.k, N).filter(function (p) { return p.L >= show; });
      big.forEach(function (p) {
        const pts = K.hexAround(p.x, p.y, state.d1, state.k, show);
        ctx.beginPath();
        pts.forEach(function (q, m) { const s = P(q[0], q[1], 0); m ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); });
        ctx.closePath();
        ctx.fillStyle = shadeColor(show, p.x, p.y); ctx.fill();
        ctx.strokeStyle = D.alpha(D.shade(lc(show), D.dark ? 0.2 : -0.25), 0.8); ctx.lineWidth = 1.2; ctx.stroke();
      });
    }
    if (state.roads && N >= 2) {
      ctx.lineCap = 'round';
      for (let L = 2; L <= N; L++) {
        ctx.strokeStyle = C['cp-road']; ctx.lineWidth = 1 + 0.9 * (L - 2);
        ctx.beginPath();
        roadEdges(places, L).forEach(function (e) { const a = P(e[0], e[1], 0), b = P(e[2], e[3], 0); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); });
        ctx.stroke();
      }
    }
    ctx.restore();
    // 邊緣的厚度
    ctx.save();
    ctx.strokeStyle = D.alpha(C.text, 0.25); ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let m = 0; m <= 72; m++) { const a = m / 72 * 2 * Math.PI, q = P(RIM * Math.cos(a), RIM * Math.sin(a), 0); m ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
    ctx.stroke(); ctx.restore();
    // 柱子：由遠到近
    const rad = Math.max(1.4, Math.min(5, state.d1 * sc * 0.12));
    const items = places.map(function (p) { const b = P(p.x, p.y, 0); return { p: p, b: b, depth: b[2] }; });
    items.sort(function (a, b) { return b.depth - a.depth; }); // 畫面上方（yr 大）比較遠，先畫
    items.forEach(function (it) {
      const L = it.p.L, r = rad * (1 + 0.45 * (L - 1)), top = P(it.p.x, it.p.y, L * zU);
      const col = lc(L), x = it.b[0];
      // 影子
      ctx.fillStyle = D.alpha('#000000', D.dark ? 0.35 : 0.18);
      ctx.beginPath(); ctx.ellipse(x + r * 0.4, it.b[1] + r * 0.2, r * 1.2, r * 1.2 * se, 0, 0, 7); ctx.fill();
      // 柱身
      const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
      g.addColorStop(0, D.shade(col, -0.25)); g.addColorStop(0.45, D.mix(col, '#ffffff', 0.25)); g.addColorStop(1, D.shade(col, -0.4));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - r, it.b[1]); ctx.lineTo(x - r, top[1]);
      ctx.ellipse(x, top[1], r, r * se, 0, Math.PI, 0, false);
      ctx.lineTo(x + r, it.b[1]);
      ctx.ellipse(x, it.b[1], r, r * se, 0, 0, Math.PI, false);
      ctx.fill();
      // 頂面
      ctx.fillStyle = D.mix(col, '#ffffff', 0.35);
      ctx.beginPath(); ctx.ellipse(x, top[1], r, r * se, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = D.alpha(D.shade(col, -0.45), 0.7); ctx.lineWidth = 0.8; ctx.stroke();
    });
    // 消費者
    if (state.probe) {
      const b = P(state.probe.x, state.probe.y, 0), t = P(state.probe.x, state.probe.y, zU * 0.9);
      ctx.save();
      ctx.strokeStyle = C['cp-probe']; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(t[0], t[1]); ctx.stroke();
      dot(t[0], t[1], 5, C['cp-probe']);
      ctx.restore();
    }
    // 圖例：高度＝等級
    D.pill(ctx, T('柱子高度＝中地的等級', 'Column height = rank'), 10, h - 10, C.text, 'left', font(12, 600));
  }

  // =====================================================================
  // 消費者標記
  // =====================================================================
  function nearestShops(x, y) {
    if (state.mode !== 'single' || S1.status === 'none') return [];
    const s = spacingNow();
    return K.nearest(x, y, s, 3, 1, 3);
  }
  function placeAt(x, y) {
    const d1 = state.d1, j = y / (d1 * K.HEX), i = x / d1 - j / 2;
    const ri = Math.round(i), rj = Math.round(j);
    if (Math.abs(i - ri) > 1e-6 || Math.abs(j - rj) > 1e-6) return 0;
    return K.orderOf(ri, rj, state.k, state.N);
  }
  /** 消費者到每一級最近中地的距離，以及有幾個一樣近（差 1% 以內） */
  function probeLevels(x, y) {
    const out = [];
    for (let L = 1; L <= state.N; L++) {
      const list = K.nearest(x, y, state.d1, state.k, L, 7), d0 = list[0].dist;
      const ties = list.filter(function (p) { return p.dist <= d0 * 1.01 + 1e-6; });
      out.push({ L: L, dist: d0, ties: ties.length, pts: ties });
    }
    return out;
  }
  function drawProbe(v) {
    const p = state.probe;
    if (!p) return;
    const x = SX(v, p.x), y = SY(v, p.y);
    ctx.save();
    ctx.lineCap = 'round';
    if (state.mode === 'hier') {
      probeLevels(p.x, p.y).forEach(function (q) {
        if (q.dist < 1e-6) return;
        ctx.strokeStyle = D.alpha(lc(q.L), 0.9); ctx.lineWidth = 1.2 + 0.5 * q.L;
        ctx.setLineDash([5, 4]);
        q.pts.forEach(function (t) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(SX(v, t.x), SY(v, t.y)); ctx.stroke(); });
      });
    } else {
      const near = nearestShops(p.x, p.y);
      if (near.length) {
        const d0 = near[0].dist;
        near.forEach(function (t, m) {
          if (m > 0 && t.dist > d0 * 1.01 + 1e-6) return;
          ctx.strokeStyle = D.alpha(t.dist <= state.R + 1e-9 ? C['cp-range'] : C['cp-thr'], 0.95); ctx.lineWidth = 2;
          ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(SX(v, t.x), SY(v, t.y)); ctx.stroke();
        });
      }
    }
    ctx.setLineDash([]);
    // 標記：一根小旗竿上的圓頭
    ctx.strokeStyle = D.shade(C['cp-probe'], -0.45); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 16); ctx.stroke();
    ctx.restore();
    dot(x, y - 18, 6, C['cp-probe']);
    ctx.save(); ctx.fillStyle = D.shade(C['cp-probe'], -0.45);
    ctx.beginPath(); ctx.ellipse(x, y, 4, 2, 0, 0, 7); ctx.fill(); ctx.restore();
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  const STATUS = {
    none: ['開不了店：商品圈比門檻半徑還小，願意走來的人湊不滿門檻。', 'No shop survives: the range is smaller than the threshold radius, so too few people will come.'],
    gaps: ['開得了店，但六邊形的角落太遠，住在那裡的人買不到。', 'Shops open, but the corners of each hexagon are out of range: people there cannot buy it.'],
    full: ['人人買得到：市場區是剛好裝下門檻人數的六邊形。', 'Everyone can buy it: each market area is a hexagon holding exactly the threshold.']
  };
  function updateSingle() {
    setText('sRT', km(S1.rT));
    setText('sStatus', T(STATUS[S1.status][0], STATUS[S1.status][1]));
    const ok = S1.status !== 'none';
    setText('sD', ok ? km(S1.d) : '—');
    setText('sA', ok ? area(S1.area) : '—');
    setText('sN', ok ? num(S1.perK, S1.perK >= 100 ? 0 : 1) + T(' 家', ' shops') : T('0 家', 'none'));
    setText('sFar', ok ? km(S1.d / R3) + (S1.status === 'gaps' ? T('（買不到）', ' (cannot buy)') : '') : '—');
    setText('sMean', S1.mean != null ? km(S1.mean) : '—');
    setText('sCov', pct(S1.coverage, 1));
    const growing = state.grow.s != null && ok;
    $('sGrow').hidden = !growing;
    if (growing) {
      const s = state.grow.s, cu = K.customers(s, state.R, state.rho);
      setText('sS', km(s));
      setText('sCus', people(cu) + T('（門檻 ', ' (threshold ') + grp(state.T) + T('，多 ', ', excess ') + grp(Math.max(0, cu - state.T)) + T('）', ')'));
    }
    const run = $('run');
    run.textContent = state.grow.run ? T('暫停', 'Pause') : (growing && state.grow.s > S1.d + 1e-9 ? T('繼續', 'Resume') : T('看商店開張', 'Watch shops open'));
    run.disabled = !ok;
    $('rewind').disabled = !ok;
    const step = growing && !state.grow.run;
    $('denser').hidden = !step; $('looser').hidden = !step;
    $('denser').disabled = !step || state.grow.s <= S1.d + 1e-9;
    $('looser').disabled = !step || state.grow.s >= S1.start - 1e-9;
  }
  function hierTable() {
    let html = '<tr><th>' + T('級', 'Rank') + '</th><th>' + T('間距<br>(km)', 'Spacing<br>(km)') + '</th><th>' + T('市場區<br>(km²)', 'Area<br>(km²)') + '</th><th>' + T('人口', 'Pop.') + '</th><th>' + T('個數', 'No.') + '</th></tr>';
    H.forEach(function (h) {
      html += '<tr' + (G.L === h.L ? ' class="hl"' : '') + '><td><i style="background:var(--cp-l' + h.L + ')"></i>' + h.L + ' ' + rankName(h.L) + '</td><td>' + num(h.d, h.d >= 100 ? 0 : 1) + '</td><td>' + grp(h.area, h.area >= 100 ? 0 : 1) + '</td><td>' + grp(h.pop, 0) + '</td><td>' + grp(h.centers, 0) + '</td></tr>';
    });
    return html;
  }
  function updateHier() {
    setHTML('hTab', hierTable());
    if (G.L) {
      setText('gL', T('第 ' + G.L + ' 級（' + rankName(G.L) + '）以上', 'Rank ' + G.L + ' (' + rankName(G.L) + ') and up'));
      setText('gPop', people(G.pop));
      setText('gFill', pct(G.fill, 1));
      setText('gFar', km(H[G.L - 1].far));
      setText('gCov', pct(G.coverage, 1) + (G.coverage < 1 - 1e-9 ? T('（角落太遠）', ' (corners too far)') : ''));
    } else {
      setText('gL', T('沒有地方賣：最高一級的市場區也湊不滿門檻', 'Nowhere: even the top rank\'s market is below the threshold'));
      ['gPop', 'gFill', 'gFar', 'gCov'].forEach(function (id) { setText(id, '—'); });
    }
    document.querySelectorAll('#showSeg button').forEach(function (b) {
      const n = +b.getAttribute('data-show');
      b.hidden = n > state.N;
      b.setAttribute('aria-pressed', n === Math.min(state.show, state.N) ? 'true' : 'false');
    });
  }
  function updateProbe() {
    const p = state.probe;
    $('pHint').hidden = !!p;
    if (!p) { setHTML('pTab', ''); return; }
    let html = '';
    if (state.mode === 'hier') {
      const lv = probeLevels(p.x, p.y), at = placeAt(p.x, p.y);
      html += '<tr><th>' + T('最近的', 'Nearest') + '</th><th>' + T('距離', 'Distance') + '</th><th>' + T('一樣近', 'Tied') + '</th></tr>';
      lv.forEach(function (q) {
        html += '<tr><td><i style="background:var(--cp-l' + q.L + ')"></i>' + T('第 ' + q.L + ' 級以上', 'Rank ' + q.L + '+') + '</td><td>' + (q.dist < 1e-6 ? T('就在這裡', 'right here') : km(q.dist)) + '</td><td>' + (q.dist < 1e-6 ? '—' : q.ties + T(' 個', '')) + '</td></tr>';
      });
      if (at) html += '<tr><td colspan="3">' + T('消費者站在一個第 ' + at + ' 級中地（' + rankName(at) + '）上', 'The shopper stands on a rank-' + at + ' place (' + rankName(at) + ')') + '</td></tr>';
    } else {
      const near = nearestShops(p.x, p.y);
      if (!near.length) html = '<tr><td>' + T('這裡沒有店，買不到。', 'There is no shop: nobody can buy it.') + '</td></tr>';
      else {
        html += '<tr><th>' + T('最近的店', 'Nearest shops') + '</th><th>' + T('距離', 'Distance') + '</th><th>' + T('買得到？', 'In range?') + '</th></tr>';
        near.forEach(function (t, m) {
          html += '<tr><td>' + T('第 ' + (m + 1) + ' 近', '#' + (m + 1)) + '</td><td>' + km(t.dist) + '</td><td>' + (m === 0 ? (t.dist <= state.R + 1e-9 ? T('買得到', 'yes') : T('太遠', 'too far')) : '') + '</td></tr>';
        });
      }
    }
    setHTML('pTab', html);
  }
  function updateReadouts() {
    setOut(el.rho, grp(state.rho));
    setOut(el.thr, grp(state.T)); setOut(el.rng, num(state.R, state.R < 10 ? 2 : 1));
    setOut(el.d1, num(state.d1, state.d1 < 10 ? 2 : 1));
    setOut(el.gT, grp(state.gT)); setOut(el.gR, num(state.gR, state.gR < 10 ? 2 : 1));
    const single = state.mode === 'single';
    $('cardS').hidden = !single; $('cardH').hidden = single; $('cardG').hidden = single;
    $('playbar').hidden = !single; $('legS').hidden = !single; $('legH').hidden = single;
    $('viewSeg').hidden = single;
    document.querySelectorAll('#modeSeg button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-mode') === state.mode ? 'true' : 'false'); });
    document.querySelectorAll('#viewSeg button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-view') === state.view ? 'true' : 'false'); });
    document.querySelectorAll('#kSeg button').forEach(function (b) { b.setAttribute('aria-pressed', +b.getAttribute('data-k') === state.k ? 'true' : 'false'); });
    document.querySelectorAll('#nSeg button').forEach(function (b) { b.setAttribute('aria-pressed', +b.getAttribute('data-n') === state.N ? 'true' : 'false'); });
    $('roads').setAttribute('aria-pressed', state.roads ? 'true' : 'false');
    cv.classList.toggle('rot', !single && state.view === '3d');
    if (single) updateSingle(); else updateHier();
    updateProbe();
    $('srNow').textContent = single
      ? T(STATUS[S1.status][0], STATUS[S1.status][1])
      : (G.L ? T('這種商品在第 ' + G.L + ' 級以上的中地賣。', 'This good is sold at rank ' + G.L + ' and up.') : T('這種商品沒有地方賣。', 'This good is not sold anywhere.'));
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function snapshot(act) {
    const p = state.probe;
    let probe = null;
    if (p) {
      probe = { x: p.x, y: p.y };
      if (state.mode === 'hier') {
        probe.place = placeAt(p.x, p.y);
        probe.levels = probeLevels(p.x, p.y).map(function (q) { return { L: q.L, dist: q.dist, ties: q.ties }; });
      } else {
        const near = nearestShops(p.x, p.y);
        probe.near = near.map(function (t) { return t.dist; });
        probe.buy = near.length > 0 && near[0].dist <= state.R + 1e-9;
        probe.spread = near.length >= 3 && near[0].dist > 1e-9 ? (near[2].dist - near[0].dist) / near[0].dist : null;
      }
    }
    const g = state.grow;
    return {
      act: act || 'param', mode: state.mode, view: state.view,
      rho: state.rho, T: state.T, R: state.R, single: S1,
      grow: { s: g.s, run: g.run, atEq: g.s == null || (S1.d != null && Math.abs(g.s - S1.d) <= 1e-9 * Math.max(1, S1.d)) },
      k: state.k, N: state.N, d1: state.d1, show: Math.min(state.show, state.N), roads: state.roads,
      H: H, gT: state.gT, gR: state.gR, good: G, probe: probe
    };
  }
  let lastEmit = 0, emitTimer = 0;
  function emit(data) { if (state.acted && window.LabMission) window.LabMission.emit('cp', data); }
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

  let raf = 0, lastT = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(t) {
    raf = 0;
    if (state.mode === 'single' && state.grow.run) tick(t);
    else lastT = 0;
    if (state.mode === 'single') drawSingle();
    else if (state.view === '3d') draw3D();
    else drawHierMap();
    if (state.mode === 'single' && state.grow.run) requestDraw();
  }

  // ---------- 開店動畫：間距從 2R（商品圈剛好相切）縮到均衡間距 ----------
  const GROW_SECONDS = 7;
  function tick(t) {
    const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0;
    lastT = t;
    const g = state.grow, a = S1.start, b = S1.d;
    g.s = Math.max(b, g.s - (a - b) / GROW_SECONDS * dt);
    if (g.s <= b + 1e-12) {
      g.s = b; g.run = false; lastT = 0;
      setStatus(S1.status === 'full'
        ? T('不再有新店：每家店的六邊形剛好裝下 ' + grp(state.T) + ' 位顧客，沒有多賺。', 'No more shops: each hexagon holds exactly ' + grp(state.T) + ' customers, with no excess profit.')
        : T('不再有新店：每家店剛好 ' + grp(state.T) + ' 位顧客，但六邊形的角落還是太遠，買不到。', 'No more shops: each has exactly ' + grp(state.T) + ' customers, but the hexagon corners are still out of range.'));
      afterChange(true, 'opened');
      return;
    }
    updateSingle();
    if (t - lastEmit > 250) { lastEmit = t; emit(snapshot('grow')); }
  }
  $('run').addEventListener('click', function () {
    if (S1.status === 'none') return;
    acted();
    const g = state.grow;
    if (g.run) {
      g.run = false;
      setStatus(T('暫停：現在每家店有 ' + grp(K.customers(g.s, state.R, state.rho)) + ' 位顧客。可以用「店靠近一點／分開一點」微調。', 'Paused: each shop now has ' + grp(K.customers(g.s, state.R, state.rho)) + ' customers. Fine-tune with “Shops closer / apart”.'));
      afterChange(true, 'pause');
      return;
    }
    if (g.s == null || g.s <= S1.d + 1e-9) g.s = S1.start;
    g.run = true; lastT = 0;
    setStatus(T('第一批店的商品圈剛好相切；只要顧客比門檻多，就會有新店擠進來。', 'The first shops\' ranges just touch; while customers exceed the threshold, new shops squeeze in.'));
    afterChange(true, 'play');
  });
  $('rewind').addEventListener('click', function () {
    if (S1.status === 'none') return;
    acted();
    state.grow.s = S1.start; state.grow.run = false;
    setStatus(T('回到一開始：商品圈剛好相切，相切點之間的空隙買不到。', 'Back to the start: the ranges just touch, and the gaps between them cannot buy.'));
    afterChange(true, 'rewind');
  });
  function nudge(dir) {
    const g = state.grow;
    if (g.s == null || g.run) return;
    acted();
    const st = Math.min((S1.start - S1.d) / 400, g.s * 0.002);
    g.s = Math.max(S1.d, Math.min(S1.start, g.s + dir * st));
    afterChange(true, 'nudge');
  }
  $('denser').addEventListener('click', function () { nudge(-1); });
  $('looser').addEventListener('click', function () { nudge(1); });

  // =====================================================================
  // 控制項
  // =====================================================================
  function loadSliders() {
    syncing = true;
    const set = function (inp, v) { if (window.LabNum) window.LabNum.set(inp, v); else inp.value = v; };
    if (window.LabNum) { set(el.thr, state.T); set(el.gT, state.gT); }
    else { el.thr.value = Math.log10(state.T); el.gT.value = Math.log10(state.gT); }
    set(el.rho, state.rho); set(el.rng, state.R); set(el.d1, state.d1); set(el.gR, state.gR);
    syncing = false;
  }
  function readSliders() {
    state.rho = clamp(Math.round(val(el.rho)), LIM.rho);
    state.T = clamp(Math.round(window.LabNum ? val(el.thr) : pow10(+el.thr.value)), LIM.T);
    state.R = clamp(Math.round(val(el.rng) * 100) / 100, LIM.R);
    state.d1 = clamp(Math.round(val(el.d1) * 100) / 100, LIM.d1);
    state.gT = clamp(Math.round(window.LabNum ? val(el.gT) : pow10(+el.gT.value)), LIM.gT);
    state.gR = clamp(Math.round(val(el.gR) * 100) / 100, LIM.gR);
  }
  function sayHier() {
    if (!G.L) { setStatus(T('門檻比最高一級的市場區人口還多：這種商品在這個區域沒有地方賣。', 'The threshold is bigger than the top rank\'s market: nowhere in this region sells the good.')); return; }
    setStatus(T('這種商品在第 ' + G.L + ' 級以上的中地賣：每個市場區有 ' + grp(G.pop) + ' 人，門檻占 ' + pct(G.fill, 0) + '。', 'Sold at rank ' + G.L + ' and up: each market area has ' + grp(G.pop) + ' people, and the threshold is ' + pct(G.fill, 0) + ' of it.'));
  }
  function sliderChanged(e) {
    if (syncing) return;
    acted();
    const before = [state.rho, state.T, state.R];
    readSliders();
    if (before[0] !== state.rho || before[1] !== state.T || before[2] !== state.R) { state.grow.s = null; state.grow.run = false; }
    afterChange(e && e.type === 'change', 'param');
    if (e && e.type === 'change') {
      if (state.mode === 'single') setStatus(T(STATUS[S1.status][0], STATUS[S1.status][1]));
      else sayHier();
    }
  }
  Object.keys(el).forEach(function (k) { el[k].addEventListener('input', sliderChanged); el[k].addEventListener('change', sliderChanged); });

  function segClick(sel, attr, apply) {
    document.querySelectorAll(sel + ' button').forEach(function (b) {
      b.addEventListener('click', function () { acted(); apply(b.getAttribute(attr)); });
    });
  }
  segClick('#modeSeg', 'data-mode', function (m) {
    if (m === state.mode) return;
    state.mode = m; state.probe = null; state.grow.run = false;
    if (m === 'hier') { setStatus(T('最低級的中地（村）排成三角形格子；每升一級，間距變成 √k 倍。', 'The lowest-rank places (villages) form a triangular grid; each rank up, the spacing grows by √k.')); }
    else setStatus(T(STATUS[S1.status][0], STATUS[S1.status][1]));
    afterChange(true, 'mode');
  });
  segClick('#viewSeg', 'data-view', function (v) {
    state.view = v;
    if (v === '3d') setStatus(T('柱子越高，中地的等級越高：少數幾根高柱，周圍是一圈圈較矮的柱子。拖曳可以轉動。', 'Taller columns are higher-rank places: a few tall ones surrounded by rings of shorter ones. Drag to turn.'));
    afterChange(true, 'view');
  });
  const PRINC = {
    3: ['市場原則：低級中地在三個高級中地的中間，消費者有三個一樣近的選擇。', 'Market principle: lower places sit between three higher places, so shoppers have three equally near choices.'],
    4: ['交通原則：低級中地在兩個高級中地之間的道路中點，打開道路看看。', 'Transport principle: lower places sit halfway along the road between two higher places. Turn on the roads.'],
    7: ['行政原則：每個低級中地完全屬於一個高級中地，方便畫行政區界。', 'Administrative principle: each lower place belongs to exactly one higher place, which makes boundaries easy to draw.']
  };
  segClick('#kSeg', 'data-k', function (k) {
    state.k = +k;
    setStatus(T(PRINC[k][0], PRINC[k][1]));
    afterChange(true, 'k');
  });
  segClick('#nSeg', 'data-n', function (n) {
    state.N = +n;
    if (state.probe) state.probe = snapToPlace(state.probe.x, state.probe.y, 0) || state.probe;
    afterChange(true, 'n');
    sayHier();
  });
  segClick('#showSeg', 'data-show', function (n) {
    state.show = +n;
    if (state.show > 0) {
      const h = H[Math.min(state.show, state.N) - 1];
      setStatus(T('第 ' + h.L + ' 級的市場區：每個 ' + area(h.area) + '，一個最高級市場區裡有 ' + grp(h.areas) + ' 個。', 'Rank-' + h.L + ' market areas: ' + area(h.area) + ' each, ' + grp(h.areas) + ' of them in one top-rank area.'));
    }
    afterChange(true, 'show');
  });
  $('roads').addEventListener('click', function () {
    acted();
    state.roads = !state.roads;
    if (state.roads) setStatus(state.k === 4
      ? T('交通原則：每一個低一級的中地都剛好在道路上。', 'Transport principle: every lower-rank place lies right on a road.')
      : T('道路連接相鄰的第 2 級以上中地；越高級的道路越寬。', 'Roads link neighbouring places of rank 2 and up; higher ranks get wider roads.'));
    afterChange(true, 'roads');
  });

  // ---------- 消費者（點、拖曳、方向鍵） ----------
  function snapToPlace(x, y, px) {
    const v = mapView(), tol = (px || 0) / v.s;
    if (state.mode === 'hier') {
      const q = K.nearest(x, y, state.d1, state.k, 1, 1)[0];
      if (q.dist <= Math.max(tol, 1e-9)) return { x: q.x, y: q.y };
      return null;
    }
    if (S1.status === 'none') return null;
    const s = spacingNow(), q = K.nearest(x, y, s, 3, 1, 1)[0];
    if (q.dist <= Math.max(tol, 1e-9)) return { x: q.x, y: q.y };
    // 六邊形的角（三個市場區的交會點）
    let best = null;
    K.hexAround(q.x, q.y, s, 3, 1).forEach(function (c) {
      const d = Math.hypot(c[0] - x, c[1] - y);
      if (d <= tol * 0.7 && (!best || d < best.d)) best = { x: c[0], y: c[1], d: d };
    });
    return best ? { x: best.x, y: best.y } : null;
  }
  function setProbe(x, y, act, force, snapPx) {
    const W = halfWidth() * 3;
    x = Math.max(-W, Math.min(W, x)); y = Math.max(-W, Math.min(W, y));
    const sn = snapPx ? snapToPlace(x, y, snapPx) : null;
    state.probe = sn || { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
    afterChange(force, act || 'probe');
  }
  function probeStatus() {
    const p = state.probe;
    if (!p) return;
    if (state.mode === 'hier') {
      const lv = probeLevels(p.x, p.y), at = placeAt(p.x, p.y);
      const q = lv[Math.min(1, lv.length - 1)];
      if (at && lv.length > 1 && at < state.N) {
        const up = lv[at];
        setStatus(T('站在第 ' + at + ' 級中地上：要買更高級的東西，最近的第 ' + (at + 1) + ' 級中地有 ' + up.ties + ' 個一樣近（' + km(up.dist) + '）。', 'On a rank-' + at + ' place: for higher goods, ' + up.ties + ' rank-' + (at + 1) + ' place' + (up.ties > 1 ? 's are' : ' is') + ' equally near (' + km(up.dist) + ').'));
      } else if (at) setStatus(T('站在最高一級的中地上：什麼都買得到，不用出門。', 'On a top-rank place: everything is sold right here.'));
      else setStatus(T('到最近的村 ' + km(lv[0].dist) + '；到最近的第 2 級以上中地 ' + km(q.dist) + '。', 'Nearest village: ' + km(lv[0].dist) + '; nearest place of rank 2 or more: ' + km(q.dist) + '.'));
    } else {
      const near = nearestShops(p.x, p.y);
      if (!near.length) { setStatus(T('這裡沒有店。', 'There are no shops.')); return; }
      setStatus(near[0].dist <= state.R + 1e-9
        ? T('最近的店 ' + km(near[0].dist) + '，在商品圈 ' + km(state.R) + ' 以內：買得到。', 'The nearest shop is ' + km(near[0].dist) + ' away, within the ' + km(state.R) + ' range: this shopper can buy it.')
        : T('最近的店 ' + km(near[0].dist) + '，超過商品圈 ' + km(state.R) + '：太遠，不買了。', 'The nearest shop is ' + km(near[0].dist) + ' away, beyond the ' + km(state.R) + ' range: too far, no purchase.'));
    }
  }
  let drag = null;
  function local(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  cv.addEventListener('pointerdown', function (e) {
    acted();
    const q = local(e);
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    if (state.mode === 'hier' && state.view === '3d') { drag = { mode: 'rot', x: q[0], y: q[1], az: state.az, el: state.el }; return; }
    const v = mapView();
    drag = { mode: 'probe' };
    setProbe((q[0] - v.cx) / v.s, (v.cy - q[1]) / v.s, 'probe', false, 12);
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drag) return;
    const q = local(e);
    if (drag.mode === 'rot') {
      state.az = drag.az - (q[0] - drag.x) * 0.01;
      state.el = Math.max(0.3, Math.min(1.3, drag.el + (q[1] - drag.y) * 0.006));
      requestDraw();
    } else {
      const v = mapView();
      setProbe((q[0] - v.cx) / v.s, (v.cy - q[1]) / v.s, 'probe', false, 12);
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

  if (window.LabKeys) window.LabKeys.attach(cv, {
    label: T('平原的地圖。方向鍵移動消費者（Shift 一次 10 格），靠近商店或中地時會對準。', 'Map of the plain. Arrow keys move the shopper (Shift for 10 steps); it snaps onto nearby shops or places.'),
    items: [{
      name: function () { return T('消費者', 'The shopper'); },
      move: function (dx, dy, big) {
        acted();
        const v = mapView(), st = niceStep(v.W / 40) * (big ? 10 : 1), p = state.probe || { x: 0, y: 0 };
        setProbe(p.x + dx * st, p.y + dy * st, 'probe', true, 4);
        probeStatus();
        return true;
      },
      describe: function () { return $('status').textContent; }
    }],
    onChange: function () { requestDraw(); }
  });

  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      return { m: state.mode, v: state.view, k: state.k, n: state.N, sh: state.show, rd: state.roads ? 1 : 0, p: state.probe ? [state.probe.x, state.probe.y] : null };
    },
    set: function (o) {
      if (!o) return;
      if (o.m === 'single' || o.m === 'hier') state.mode = o.m;
      if (o.v === 'map' || o.v === '3d') state.view = o.v;
      if ([3, 4, 7].indexOf(+o.k) >= 0) state.k = +o.k;
      if ([2, 3, 4].indexOf(+o.n) >= 0) state.N = +o.n;
      if (isFinite(o.sh)) state.show = Math.max(0, Math.min(4, Math.round(+o.sh)));
      state.roads = o.rd === 1;
      if (Array.isArray(o.p) && isFinite(o.p[0]) && isFinite(o.p[1])) state.probe = { x: +o.p[0], y: +o.p[1] };
      readSliders();
      state.grow.s = null; state.grow.run = false;
      recompute(); updateReadouts(); requestDraw();
    }
  });

  window.__cp = { state: state, K: K, snapshot: snapshot, get S1() { return S1; }, get G() { return G; }, setProbe: setProbe, redraw: requestDraw };

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
  setStatus(T('一種商品、門檻 2,000 人、商品圈 5 公里：店排成三角形格子，市場區是六邊形。按「看商店開張」看它怎麼形成。', 'One good, threshold 2,000 people, range 5 km: the shops form a triangular grid with hexagonal market areas. Press “Watch shops open” to see how.'));
  requestDraw();
})();
