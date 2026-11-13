/* gps-trilateration.js — 「GPS 三邊定位與定位誤差」的畫面與互動
 * 距離、定位、DOP、散布全部在 gps-trilateration-core.js（GpsCore）；這裡只負責操作、繪圖與讀數。
 * 測站一律是虛擬地點：這個頁面不使用 Geolocation，也不讀取使用者的位置。 */
(function () {
  'use strict';
  const K = window.GpsCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FONT = D.FONT;
  const DEG = Math.PI / 180;
  const TW = K.TOWERS, NAMES = ['A', 'B', 'C', 'D', 'E'], TCOL = ['gp-a', 'gp-b', 'gp-c', 'gp-d', 'gp-e'];
  const NFIX = 300, SEED = 11, MP_EL = 20;

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = {
    tau: $('pTau'), guess: $('pGuess'), noise: $('pNoise'),
    lat: $('sLat'), lon: $('sLon'), t: $('sT'), mask: $('sMask'), wall: $('sWall'), mp: $('sMp'), sig: $('sSig'), ctau: $('sTau')
  };
  const LIM = { tau: [-40, 40], guess: [-40, 40], noise: [0, 500], lat: [-90, 90], lon: [-180, 180], t: [0, 2880], mask: [0, 40], wall: [0, 75], mp: [0, 30], sig: [0.5, 20], ctau: [-1, 1] };
  const clamp = function (v, a) { return Math.max(a[0], Math.min(a[1], v)); };
  const state = {
    mode: 'plane', view: 'globe', on: [true, true, true, false, false], rx: [17, 12], tau: 12, guess: 0, noise: 0, solved: false,
    lat: 23.5, lon: 121, t: 0, mask: 10, wall: 0, mp: 0, sig: 3, clock: 'solve', ctau: 0.2, excl: {}, yaw: 35, pitch: 18,
    playing: false, acted: false
  };
  let P = null, S = null, syncing = false;

  function towersOn() { return TW.filter(function (t, i) { return state.on[i]; }); }
  function idxOn() { const r = []; state.on.forEach(function (o, i) { if (o) r.push(i); }); return r; }
  function recomputePlane() {
    const ids = idxOn(), tw = ids.map(function (i) { return TW[i]; });
    const noise = ids.map(function (i) { return K.TOWER_NOISE[i] * state.noise / 1000; });
    const rho = K.pseudo2(tw, state.rx, state.tau, noise);
    const radius = rho.map(function (r) { return r - K.C * state.guess; });
    const fit = tw.length >= 2 ? K.solve2(tw, rho, state.guess) : null;
    const full = tw.length >= 3 ? K.solve2(tw, rho) : null;
    let X = null;
    if (tw.length === 2) X = K.circleX(tw[0], radius[0], tw[1], radius[1]);
    let near = Infinity, seg = null;
    tw.forEach(function (t) { near = Math.min(near, Math.hypot(t.x - state.rx[0], t.y - state.rx[1])); });
    if (tw.length === 2) seg = K.segDist(tw[0], tw[1], state.rx);
    P = {
      ids: ids, tw: tw, rho: rho, radius: radius, fit: fit, full: full, X: X, near: near, seg: seg,
      miss: fit ? fit.rms * 1000 : null,
      err: fit ? Math.hypot(fit.x - state.rx[0], fit.y - state.rx[1]) * 1000 : null,
      dop: tw.length >= 3 ? K.dop(K.geometry2(tw, state.rx)) : null
    };
  }
  function recomputeSky() {
    const all = K.sky({ lat: state.lat, lon: state.lon, t: state.t, mask: state.mask, canyon: state.wall > 0 ? { w: state.wall, dir: 0 } : null });
    const vis = all.filter(function (s) { return s.visible; });
    const used = vis.filter(function (s) { return !state.excl[s.id]; });
    const sc = K.scatter(used, state.sig, NFIX, SEED, state.mp > 0 ? { m: state.mp, el: MP_EL } : null, state.clock === 'assume' ? state.ctau : undefined);
    let maxEl = -90;
    used.forEach(function (s) { maxEl = Math.max(maxEl, s.el); });
    const dAll = vis.length >= 4 ? K.dop(K.geometry3(vis)) : null;
    S = { all: all, vis: vis, used: used, sc: sc, dop: sc ? sc.dop : null, maxEl: maxEl, pAll: dAll ? dAll.p : null };
  }
  function recompute() { recomputePlane(); recomputeSky(); }

  // ---------- 顏色與格式 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--gp-sat', '--gp-off', '--gp-sig', '--gp-block', '--gp-mp', '--gp-sea1', '--gp-sea2', '--gp-land', '--gp-land2', '--gp-orbit', '--gp-a', '--gp-b', '--gp-c', '--gp-d', '--gp-e', '--gp-rx', '--gp-fix', '--gp-wall', '--text', '--muted', '--border', '--surface', '--bg', '--accent']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
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
  const meters = function (v) { return v == null || !isFinite(v) ? '—' : v >= 10000 ? num(v / 1000, 1) + ' km' : v >= 1000 ? num(v / 1000, 2) + ' km' : num(v, v < 10 ? 1 : 0) + ' m'; };
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
  let size = { w: 600, h: 450 };
  function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || 300, h = cv.clientHeight || 225;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    size = { w: w, h: h, dpr: dpr };
  }

  // ---------------- 平面練習：島 ----------------
  const IW = K.ISLAND.w, IH = K.ISLAND.h;
  function planeView() {
    const pad = 8, s = Math.min((size.w - 2 * pad) / IW, (size.h - 2 * pad) / IH);
    return { s: s, x0: (size.w - IW * s) / 2, y0: (size.h - IH * s) / 2, W: IW * s, H: IH * s };
  }
  const PX = function (v, x) { return v.x0 + x * v.s; };
  const PY = function (v, y) { return v.y0 + v.H - y * v.s; };
  // 島的輪廓：橢圓加上幾個固定的波動（虛構的島）
  function shoreR(th, k) {
    return k * (1 + 0.05 * Math.sin(3 * th + 0.7) + 0.035 * Math.sin(5 * th + 2.1) + 0.025 * Math.sin(8 * th + 4));
  }
  function islandPath(v, k) {
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const th = 2 * Math.PI * i / 120, r = shoreR(th, k);
      const x = 20 + 21 * r * Math.cos(th), y = 15 + 15.5 * r * Math.sin(th);
      if (i) ctx.lineTo(PX(v, x), PY(v, y)); else ctx.moveTo(PX(v, x), PY(v, y));
    }
    ctx.closePath();
  }
  function drawTower(x, y, col, name, used) {
    ctx.save();
    ctx.globalAlpha = used ? 1 : 0.45;
    ctx.fillStyle = D.alpha('#000000', D.dark ? 0.35 : 0.18);
    ctx.beginPath(); ctx.ellipse(x + 3, y + 2, 9, 3, 0, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = D.shade(col, D.dark ? 0.1 : -0.25); ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x, y - 24); ctx.lineTo(x + 8, y); ctx.moveTo(x - 5, y - 9); ctx.lineTo(x + 5, y - 9); ctx.moveTo(x - 3, y - 16); ctx.lineTo(x + 3, y - 16); ctx.stroke();
    D.ball(ctx, x, y - 26, 4, col, { shadow: false });
    if (used) {
      ctx.strokeStyle = D.alpha(col, 0.7); ctx.lineWidth = 1.5;
      [8, 13].forEach(function (r) { ctx.beginPath(); ctx.arc(x, y - 26, r, -Math.PI * 0.8, -Math.PI * 0.2); ctx.stroke(); });
    }
    ctx.restore();
    D.pill(ctx, name, x + 10, y + 2, col, 'left', font(12, 700));
  }
  function drawHiker(x, y) {
    ctx.save();
    ctx.fillStyle = D.alpha('#000000', D.dark ? 0.35 : 0.2);
    ctx.beginPath(); ctx.ellipse(x + 2, y + 1, 8, 3, 0, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = C['gp-rx']; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.lineTo(x, y - 8); ctx.lineTo(x - 5, y); ctx.moveTo(x, y - 8); ctx.lineTo(x + 5, y); ctx.moveTo(x - 6, y - 14); ctx.lineTo(x + 6, y - 14); ctx.stroke();
    ctx.restore();
    D.ball(ctx, x, y - 22, 4.5, C['gp-rx'], { shadow: false });
    ctx.save(); ctx.fillStyle = C['gp-fix']; ctx.strokeStyle = D.shade(C['gp-fix'], -0.4); ctx.lineWidth = 1;
    D.roundRect(ctx, x + 5, y - 17, 7, 9, 2); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  function drawPlane() {
    const v = planeView();
    D.backdrop(ctx, size.w, size.h);
    ctx.save();
    D.roundRect(ctx, v.x0, v.y0, v.W, v.H, 8); ctx.clip();
    const sea = ctx.createLinearGradient(0, v.y0, 0, v.y0 + v.H);
    sea.addColorStop(0, C['gp-sea1']); sea.addColorStop(1, C['gp-sea2']);
    ctx.fillStyle = sea; ctx.fillRect(v.x0, v.y0, v.W, v.H);
    // 島：海岸線、內陸較高（深一點）
    islandPath(v, 1.04); ctx.fillStyle = D.alpha(C['gp-sea1'], 0.6); ctx.fill();
    islandPath(v, 1); ctx.fillStyle = C['gp-land']; ctx.fill();
    ctx.strokeStyle = D.shade(C['gp-land'], D.dark ? 0.2 : -0.25); ctx.lineWidth = 1.5; ctx.stroke();
    [0.72, 0.48, 0.26].forEach(function (k, i) {
      islandPath(v, k); ctx.fillStyle = D.mix(C['gp-land'], C['gp-land2'], 0.35 + 0.22 * i); ctx.fill();
      ctx.strokeStyle = D.alpha(C.text, 0.12); ctx.lineWidth = 1; ctx.stroke();
    });
    // 格線（每 5 km）
    ctx.strokeStyle = D.alpha(C.text, 0.08); ctx.lineWidth = 1;
    for (let x = 5; x < IW; x += 5) { ctx.beginPath(); ctx.moveTo(PX(v, x), v.y0); ctx.lineTo(PX(v, x), v.y0 + v.H); ctx.stroke(); }
    for (let y = 5; y < IH; y += 5) { ctx.beginPath(); ctx.moveTo(v.x0, PY(v, y)); ctx.lineTo(v.x0 + v.W, PY(v, y)); ctx.stroke(); }
    // 圓：半徑 = 虛擬距離 − c τ̂
    P.tw.forEach(function (t, i) {
      const r = P.radius[i], col = C[TCOL[P.ids[i]]];
      if (!(r > 0)) return;
      ctx.beginPath(); ctx.arc(PX(v, t.x), PY(v, t.y), r * v.s, 0, 2 * Math.PI);
      ctx.fillStyle = D.alpha(col, 0.05); ctx.fill();
      ctx.strokeStyle = D.alpha(col, 0.95); ctx.lineWidth = 2.5; ctx.stroke();
    });
    // 兩座塔：兩個交點
    if (P.X) P.X.forEach(function (p) {
      ctx.save(); ctx.strokeStyle = C['gp-fix']; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(PX(v, p[0]), PY(v, p[1]), 7, 0, 2 * Math.PI); ctx.stroke(); ctx.restore();
      if (P.X.length === 2) D.pill(ctx, '?', PX(v, p[0]) + 9, PY(v, p[1]) - 6, C['gp-fix'], 'left', font(12, 700));
    });
    // 估計的位置（τ̂ 固定時的最小平方點）
    if (P.fit && P.tw.length >= 3) {
      const fx = PX(v, P.fit.x), fy = PY(v, P.fit.y);
      if (P.err > 30) {
        ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = D.alpha(C.text, 0.6); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(PX(v, state.rx[0]), PY(v, state.rx[1]) - 10); ctx.stroke(); ctx.restore();
      }
      ctx.save(); ctx.strokeStyle = C['gp-fix']; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(fx - 8, fy - 8); ctx.lineTo(fx + 8, fy + 8); ctx.moveTo(fx + 8, fy - 8); ctx.lineTo(fx - 8, fy + 8); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
    ctx.strokeStyle = D.alpha(C.text, 0.3); ctx.lineWidth = 1; D.roundRect(ctx, v.x0, v.y0, v.W, v.H, 8); ctx.stroke();
    TW.forEach(function (t, i) { drawTower(PX(v, t.x), PY(v, t.y), C[TCOL[i]], NAMES[i], state.on[i]); });
    drawHiker(PX(v, state.rx[0]), PY(v, state.rx[1]));
    if (P.fit && P.tw.length >= 3) D.pill(ctx, T('估計位置', 'estimate'), PX(v, P.fit.x) + 10, PY(v, P.fit.y) + 18, C.text, 'left', font(11, 600));
    // 比例尺
    const L5 = 10 * v.s, x = v.x0 + 12, y = v.y0 + v.H - 12;
    ctx.save();
    D.roundRect(ctx, x - 6, y - 24, L5 + 16, 30, 8); ctx.fillStyle = D.alpha(C.surface, 0.85); ctx.fill();
    ctx.strokeStyle = C.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + L5, y); ctx.lineTo(x + L5, y - 4); ctx.stroke();
    ctx.fillStyle = C.text; ctx.font = font(12, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('10 km', x, y - 8);
    ctx.restore();
  }

  // ---------------- 地球與衛星 ----------------
  function cam() {
    const la = clamp(state.lat + state.pitch, [-89, 89]), lo = state.lon + state.yaw;
    return K.enuBasis(la, lo);
  }
  function globeView() {
    const R = Math.min(size.w, size.h) / 2 - 14, s = R / (K.RS * 1.04);
    return { cx: size.w / 2, cy: size.h / 2, s: s, re: K.RE * s };
  }
  function proj(B, g, p) {
    return [g.cx + g.s * (p[0] * B.e[0] + p[1] * B.e[1] + p[2] * B.e[2]), g.cy - g.s * (p[0] * B.n[0] + p[1] * B.n[1] + p[2] * B.n[2]), p[0] * B.u[0] + p[1] * B.u[1] + p[2] * B.u[2]];
  }
  /** 被地球擋住：在地球後面，而且投影落在地球圓盤裡 */
  function hidden(g, q) { return q[2] < 0 && Math.hypot(q[0] - g.cx, q[1] - g.cy) < g.re; }
  function drawGlobe() {
    const B = cam(), g = globeView();
    D.backdrop(ctx, size.w, size.h);
    // 星空的點（固定）
    ctx.fillStyle = D.alpha(C.text, D.dark ? 0.35 : 0.12);
    for (let i = 1; i <= 60; i++) ctx.fillRect((i * 0.6180339 % 1) * size.w, (i * 0.4142135 % 1) * size.h, 1.5, 1.5);
    // 軌道（後半段先畫）
    const orbitPts = [];
    for (let p = 0; p < K.PLANES; p++) {
      const pts = [];
      for (let k = 0; k <= 96; k++) {
        // 同一個軌道面上的點：用同一面的第 0 顆衛星，時間平移
        const tt = state.t + K.T_ORB * k / 96;
        const sp = K.satellite(p * K.PER, tt);
        // 平移時間會讓地球多轉；轉回目前時刻的地固座標
        const a = 2 * Math.PI * (tt - state.t) / K.T_SID, c = Math.cos(a), s = Math.sin(a);
        pts.push(proj(B, g, [sp[0] * c - sp[1] * s, sp[0] * s + sp[1] * c, sp[2]]));
      }
      orbitPts.push(pts);
    }
    function strokeOrbit(front) {
      ctx.lineWidth = 1.3;
      orbitPts.forEach(function (pts) {
        ctx.beginPath();
        let pen = false;
        pts.forEach(function (q) {
          const f = q[2] >= 0;
          if (f === front && !(front === false && hidden(g, q))) { if (pen) ctx.lineTo(q[0], q[1]); else { ctx.moveTo(q[0], q[1]); pen = true; } }
          else pen = false;
        });
        ctx.strokeStyle = D.alpha(C['gp-orbit'], front ? 0.55 : 0.22); ctx.stroke();
      });
    }
    strokeOrbit(false);
    // 衛星（後面的）
    const sats = S.all.map(function (s) { return { s: s, q: proj(B, g, s.pos) }; });
    sats.filter(function (o) { return o.q[2] < 0; }).forEach(function (o) { if (!hidden(g, o.q)) satDot(o); });
    // 地球
    const grd = ctx.createRadialGradient(g.cx - g.re * 0.35, g.cy - g.re * 0.4, g.re * 0.1, g.cx, g.cy, g.re);
    grd.addColorStop(0, D.mix(C['gp-sea1'], '#ffffff', D.dark ? 0.15 : 0.4)); grd.addColorStop(0.7, C['gp-sea2']); grd.addColorStop(1, D.shade(C['gp-sea2'], -0.35));
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.re, 0, 2 * Math.PI); ctx.fillStyle = grd; ctx.fill();
    // 經緯線（每 30°）
    ctx.save(); ctx.beginPath(); ctx.arc(g.cx, g.cy, g.re, 0, 2 * Math.PI); ctx.clip();
    ctx.strokeStyle = D.alpha(D.dark ? '#ffffff' : '#0b2540', 0.22); ctx.lineWidth = 1;
    const line = function (f) {
      ctx.beginPath(); let pen = false;
      for (let k = 0; k <= 72; k++) { const ll = f(k / 72), q = proj(B, g, K.station(ll[0], ll[1], 0)); if (q[2] >= 0) { if (pen) ctx.lineTo(q[0], q[1]); else { ctx.moveTo(q[0], q[1]); pen = true; } } else pen = false; }
      ctx.stroke();
    };
    for (let la = -60; la <= 60; la += 30) line(function (u) { return [la, -180 + 360 * u]; });
    for (let lo = -180; lo < 180; lo += 30) line(function (u) { return [-90 + 180 * u, lo]; });
    ctx.restore();
    ctx.strokeStyle = D.alpha(C.text, 0.25); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(g.cx, g.cy, g.re, 0, 2 * Math.PI); ctx.stroke();
    // 測站與視線
    const st = proj(B, g, K.station(state.lat, state.lon, 0));
    strokeOrbit(true);
    S.all.forEach(function (s, i) {
      if (s.el < 0) return;
      const q = sats[i].q, used = s.visible && !state.excl[s.id];
      ctx.save();
      if (!s.visible) { ctx.setLineDash([3, 4]); ctx.strokeStyle = D.alpha(C['gp-block'], 0.55); ctx.lineWidth = 1.2; }
      else if (!used) { ctx.setLineDash([2, 5]); ctx.strokeStyle = D.alpha(C['gp-off'], 0.8); ctx.lineWidth = 1.2; }
      else { ctx.strokeStyle = D.alpha(C['gp-sig'], 0.85); ctx.lineWidth = 1.8; }
      ctx.beginPath(); ctx.moveTo(st[0], st[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      ctx.restore();
    });
    sats.filter(function (o) { return o.q[2] >= 0; }).forEach(satDot);
    if (st[2] >= 0) {
      D.ball(ctx, st[0], st[1], 5.5, C['gp-fix'], { shadow: false });
      D.pill(ctx, T('虛擬測站', 'station'), st[0] + 8, st[1] - 6, C.text, 'left', font(11, 600));
    }
    if (size.w >= 520) D.pill(ctx, T('拖曳可以轉動地球', 'drag to turn'), 10, size.h - 8, C.muted, 'left', font(11, 500));
  }
  function satDot(o) {
    const s = o.s, used = s.visible && !state.excl[s.id], behind = o.q[2] < 0;
    const col = used ? C['gp-sat'] : C['gp-off'];
    ctx.save(); if (behind) ctx.globalAlpha = 0.45;
    // 太陽能板
    ctx.fillStyle = D.alpha(col, 0.7); ctx.fillRect(o.q[0] - 9, o.q[1] - 1.5, 18, 3);
    D.ball(ctx, o.q[0], o.q[1], used ? 4.5 : 3.5, col, { shadow: false });
    ctx.restore();
  }

  // ---------------- 天空圖 ----------------
  function skyView() {
    const R = Math.min(size.w, size.h) / 2 - 26;
    return { cx: size.w / 2, cy: size.h / 2 + 4, R: R };
  }
  function skyXY(v, el, az) { const r = v.R * (90 - el) / 90; return [v.cx + r * Math.sin(az * DEG), v.cy - r * Math.cos(az * DEG)]; }
  function drawSky() {
    const v = skyView();
    D.backdrop(ctx, size.w, size.h);
    const grd = ctx.createRadialGradient(v.cx, v.cy, 0, v.cx, v.cy, v.R);
    grd.addColorStop(0, D.dark ? '#1b2a44' : '#e8f2ff'); grd.addColorStop(1, D.dark ? '#101a2c' : '#bcd6f2');
    ctx.beginPath(); ctx.arc(v.cx, v.cy, v.R, 0, 2 * Math.PI); ctx.fillStyle = grd; ctx.fill();
    // 遮罩：仰角 0–mask
    if (state.mask > 0) {
      ctx.beginPath(); ctx.arc(v.cx, v.cy, v.R, 0, 2 * Math.PI); ctx.arc(v.cx, v.cy, v.R * (90 - state.mask) / 90, 0, 2 * Math.PI, true);
      ctx.fillStyle = D.alpha(C['gp-off'], 0.35); ctx.fill();
    }
    // 街谷的大樓：從地平線到建築頂的仰角
    if (state.wall > 0) {
      ctx.beginPath();
      for (let a = 0; a <= 360; a += 2) {
        const lim = Math.atan(Math.tan(state.wall * DEG) * Math.abs(Math.sin(a * DEG))) / DEG, p = skyXY(v, lim, a);
        if (a) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
      }
      ctx.closePath();
      ctx.arc(v.cx, v.cy, v.R, 0, 2 * Math.PI, true);
      ctx.fillStyle = D.alpha(C['gp-wall'], 0.55); ctx.fill('evenodd');
    }
    if (state.mp > 0) {
      ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = C['gp-mp']; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(v.cx, v.cy, v.R * (90 - MP_EL) / 90, 0, 2 * Math.PI); ctx.stroke(); ctx.restore();
    }
    // 仰角圈與方位
    ctx.strokeStyle = D.alpha(C.text, 0.22); ctx.lineWidth = 1;
    [0, 30, 60].forEach(function (e) { ctx.beginPath(); ctx.arc(v.cx, v.cy, v.R * (90 - e) / 90, 0, 2 * Math.PI); ctx.stroke(); });
    for (let a = 0; a < 360; a += 30) { const p = skyXY(v, 0, a); ctx.beginPath(); ctx.moveTo(v.cx, v.cy); ctx.lineTo(p[0], p[1]); ctx.stroke(); }
    ctx.fillStyle = C.muted; ctx.font = font(11); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    [30, 60].forEach(function (e) { const p = skyXY(v, e, 0); ctx.fillText(e + '°', p[0] + 3, p[1] + 8); });
    [[0, T('北', 'N')], [90, T('東', 'E')], [180, T('南', 'S')], [270, T('西', 'W')]].forEach(function (d) {
      const r = v.R + 13, x = v.cx + r * Math.sin(d[0] * DEG), y = v.cy - r * Math.cos(d[0] * DEG);
      D.haloText(ctx, d[1], x, y, C.text, 'center', 'middle', font(13, 700));
    });
    // 衛星的軌跡（前後一小時）
    S.all.forEach(function (s) {
      ctx.beginPath(); let pen = false;
      for (let k = -60; k <= 60; k += 4) {
        const o = K.sky({ lat: state.lat, lon: state.lon, t: state.t + k, mask: 0 })[s.id];
        if (o.el >= 0) { const p = skyXY(v, o.el, o.az); if (pen) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); pen = true; } } else pen = false;
      }
      ctx.strokeStyle = D.alpha(C['gp-orbit'], 0.35); ctx.lineWidth = 1.2; ctx.stroke();
    });
    // 衛星
    S.all.forEach(function (s) {
      if (s.el < 0) return;
      const p = skyXY(v, s.el, s.az), used = s.visible && !state.excl[s.id];
      if (s.visible && state.excl[s.id]) {
        ctx.save(); ctx.strokeStyle = C['gp-off']; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, 2 * Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p[0] - 6, p[1] - 6); ctx.lineTo(p[0] + 6, p[1] + 6); ctx.stroke(); ctx.restore();
      } else D.ball(ctx, p[0], p[1], used ? 9 : 7, used ? C['gp-sat'] : C['gp-off'], { shadow: false });
      if (used && state.mp > 0 && s.el < MP_EL) { ctx.save(); ctx.strokeStyle = C['gp-mp']; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], 12, 0, 2 * Math.PI); ctx.stroke(); ctx.restore(); }
      D.haloText(ctx, String(s.id + 1), p[0], p[1] + (used ? 18 : 16), used ? C.text : C.muted, 'center', 'middle', font(11, 700));
    });
    // 天頂：測站
    D.ball(ctx, v.cx, v.cy, 3, C.text, { shadow: false });
    if (size.w >= 520) D.pill(ctx, T('點衛星：不用／再用', 'tap a satellite to drop or use it'), 10, size.h - 8, C.muted, 'left', font(11, 500));
  }

  // ---------------- 定位點 ----------------
  function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x))), f = x / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }
  function drawFix() {
    D.backdrop(ctx, size.w, size.h);
    const sc = S.sc;
    if (!sc) {
      D.haloText(ctx, state.clock === 'solve' ? T('衛星不夠：四個未知數（東、北、高度、時鐘）至少要四顆衛星。', 'Too few satellites: four unknowns need at least four.') : T('衛星不夠：至少要三顆衛星。', 'Too few satellites: at least three are needed.'), size.w / 2, size.h / 2, C.text, 'center', 'middle', font(14, 600));
      return;
    }
    const side = Math.min(size.h - 40, size.w - 110), x0 = (size.w - side - 70) / 2, y0 = (size.h - side) / 2 + 6;
    const cx = x0 + side / 2, cy = y0 + side / 2;
    const Qh = sc.dop.Q, s2 = state.sig * state.sig;
    // 範圍：涵蓋 95% 橢圓與偏移
    const sxx = Qh[0][0] * s2, syy = Qh[1][1] * s2, sxy = Qh[0][1] * s2;
    const tr = sxx + syy, det = sxx * syy - sxy * sxy, l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det)), l2 = tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const k95 = Math.sqrt(5.991);
    const ext = Math.max(5, 1.15 * (Math.max(Math.abs(sc.bias[0]), Math.abs(sc.bias[1])) + k95 * Math.sqrt(l1)));
    const step = niceStep(ext / 2), half = Math.ceil(ext / step) * step, s = side / 2 / half;
    // 底與格線
    ctx.fillStyle = D.alpha(C.surface, 0.7); D.roundRect(ctx, x0, y0, side, side, 8); ctx.fill();
    ctx.strokeStyle = D.alpha(C.text, 0.1); ctx.lineWidth = 1;
    for (let g = -half; g <= half + 1e-9; g += step) {
      ctx.beginPath(); ctx.moveTo(cx + g * s, y0); ctx.lineTo(cx + g * s, y0 + side); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0, cy - g * s); ctx.lineTo(x0 + side, cy - g * s); ctx.stroke();
    }
    ctx.strokeStyle = D.alpha(C.text, 0.3); D.roundRect(ctx, x0, y0, side, side, 8); ctx.stroke();
    // 定位點
    ctx.save(); ctx.beginPath(); D.roundRect(ctx, x0, y0, side, side, 8); ctx.clip();
    ctx.fillStyle = D.alpha(C['gp-sat'], D.dark ? 0.75 : 0.6);
    sc.pts.forEach(function (p) { ctx.fillRect(cx + p[0] * s - 1.5, cy - p[1] * s - 1.5, 3, 3); });
    // 95% 橢圓（中心在固定偏移）
    const ang = Math.atan2(l1 - sxx, sxy || 1e-12);
    ctx.save(); ctx.translate(cx + sc.bias[0] * s, cy - sc.bias[1] * s); ctx.rotate(-(Math.abs(sxy) < 1e-12 ? (sxx >= syy ? 0 : Math.PI / 2) : ang));
    ctx.beginPath(); ctx.ellipse(0, 0, k95 * Math.sqrt(l1) * s, k95 * Math.sqrt(Math.max(l2, 0)) * s, 0, 0, 2 * Math.PI);
    ctx.strokeStyle = C['gp-fix']; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    ctx.restore();
    // 真正的位置與平均
    ctx.save(); ctx.strokeStyle = C.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy); ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10); ctx.stroke(); ctx.restore();
    if (sc.biasH > 0.05 * step) {
      const bx = cx + sc.bias[0] * s, by = cy - sc.bias[1] * s;
      D.arrow(ctx, cx, cy, bx, by, C['gp-block'], 2);
      D.pill(ctx, T('固定偏移 ', 'offset ') + meters(sc.biasH), bx + 8, by - 6, C['gp-block'], 'left', font(11, 600));
    }
    D.pill(ctx, T('真正的位置', 'true position'), cx, cy + 30, C.text, 'center', font(11, 600));
    D.haloText(ctx, T('東 ', 'E ') + grp(half) + ' m', x0 + side - 6, cy - 4, C.muted, 'right', 'bottom', font(11, 600));
    D.haloText(ctx, T('北 ', 'N ') + grp(half) + ' m', cx + 6, y0 + 4, C.muted, 'left', 'top', font(11, 600));
    D.haloText(ctx, T('格線 ', 'grid ') + grp(step) + ' m', x0 + 6, y0 + side - 6, C.muted, 'left', 'bottom', font(11, 600));
    // 高度誤差的直條
    const hx = x0 + side + 30, hs = side / 2 / Math.max(half, 1.15 * (Math.abs(sc.bias[2]) + 2.5 * sc.dop.v * state.sig)) ;
    ctx.fillStyle = D.alpha(C.surface, 0.7); D.roundRect(ctx, hx - 16, y0, 32, side, 8); ctx.fill();
    ctx.strokeStyle = D.alpha(C.text, 0.3); ctx.stroke();
    ctx.save(); ctx.beginPath(); D.roundRect(ctx, hx - 16, y0, 32, side, 8); ctx.clip();
    ctx.fillStyle = D.alpha(C['gp-b'], 0.55);
    sc.pts.forEach(function (p, i) { ctx.fillRect(hx - 10 + (i * 0.618 % 1) * 20, cy - p[2] * hs - 1, 2.5, 2.5); });
    ctx.restore();
    ctx.strokeStyle = C.text; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx - 16, cy); ctx.lineTo(hx + 16, cy); ctx.stroke();
    D.haloText(ctx, T('高度', 'height'), hx, y0 - 2, C.text, 'center', 'bottom', font(11, 700));
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function legendHTML() {
    const sw = function (c, txt, round) { return '<span style="color:var(--muted)"><i style="background:' + c + (round ? ';border-radius:50%' : '') + '"></i>' + txt + '</span>'; };
    if (state.mode === 'plane') return sw('var(--gp-fix)', T('× 估計位置（最小平方）', '× estimate (least squares)')) + sw('var(--gp-rx)', T('接收機真正的位置', 'true receiver position'));
    if (state.view === 'fix') return sw('var(--gp-sat)', T('每一次定位', 'each fix'), true) + sw('var(--gp-fix)', T('95% 的定位點在橢圓內', '95% of fixes inside the ellipse'));
    return sw('var(--gp-sat)', T('用到的衛星', 'satellite used'), true) + sw('var(--gp-off)', T('不用或被擋', 'not used or blocked'), true) + (state.view === 'skyplot' && state.wall > 0 ? sw('var(--gp-wall)', T('大樓', 'buildings')) : '') + (state.view === 'globe' ? sw('var(--gp-sig)', T('收得到的訊號', 'signal received')) : '');
  }
  function updateReadouts() {
    setOut(el.tau, num(state.tau, 1)); setOut(el.guess, num(state.guess, 2)); setOut(el.noise, grp(state.noise));
    setOut(el.lat, num(state.lat, 1)); setOut(el.lon, num(state.lon, 1)); setOut(el.t, grp(state.t));
    setOut(el.mask, num(state.mask)); setOut(el.wall, num(state.wall)); setOut(el.mp, num(state.mp)); setOut(el.sig, num(state.sig, 1)); setOut(el.ctau, num(state.ctau, 3));
    // 平面
    const mOk = P.miss != null && P.miss < 20;
    setText('rMiss', P.tw.length < 2 ? T('至少要兩座塔', 'need at least two towers') : P.tw.length === 2 ? T('兩個圓：' + (P.X.length === 2 ? '兩個交點' : P.X.length === 1 ? '剛好相切' : '沒有交點'), 'Two circles: ' + (P.X.length === 2 ? 'two crossings' : P.X.length === 1 ? 'they just touch' : 'no crossing')) : (mOk ? T('交在一點（差 ', 'Yes (off by ') + meters(P.miss) + T('）', ')') : T('沒有，差 ', 'No, off by ') + meters(P.miss)));
    $('rMiss').className = 'big ' + (P.tw.length >= 3 ? (mOk ? 'ok' : 'no') : '');
    setText('rErr', P.tw.length >= 3 && P.fit ? meters(P.err) : '—');
    setText('rTau', P.full ? num(P.full.tau, 2) + ' μs' + (Math.abs(P.full.tau) < 0.005 ? '' : P.full.tau > 0 ? T('（時鐘慢了）', ' (clock slow)') : T('（時鐘快了）', ' (clock fast)')) : T('至少要三座塔', 'need three towers'));
    // 天空
    const d = S.dop;
    setText('rSats', S.vis.length + ' ／ ' + S.used.length);
    setText('rP', d ? num(d.p, 2) : '—');
    setText('rHV', d ? num(d.h, 2) + ' ／ ' + num(d.v, 2) : '—');
    setText('rH', d ? meters(d.h * state.sig) + T('（模擬 ', ' (simulated ') + meters(S.sc.hrms) + T('）', ')') : T('衛星不夠', 'too few satellites'));
    setText('rBias', S.sc ? meters(S.sc.biasH) + ' ／ ' + meters(Math.abs(S.sc.bias[2])) : '—');
    setHTML('legend', legendHTML());
    setText('cvHint', state.mode === 'plane' ? T('拖曳登山客（或用方向鍵）移動接收機；點塔的按鈕選要用哪幾座。', 'Drag the hiker (or use the arrow keys); use the tower buttons to choose towers.') : state.view === 'skyplot' ? T('天空圖：中心是頭頂，外圈是地平線；點衛星可以不用它。', 'Sky plot: the centre is overhead and the rim is the horizon; tap a satellite to drop it.') : state.view === 'fix' ? T('同樣的衛星重複定位 ' + NFIX + ' 次：每一點是一次的結果。', 'The same satellites, ' + NFIX + ' repeated fixes: each dot is one result.') : T('拖曳轉動地球；方向鍵也可以。', 'Drag (or use the arrow keys) to turn the Earth.'));
    $('srNow').textContent = state.mode === 'plane' ? $('rMiss').textContent : T('用 ' + S.used.length + ' 顆衛星，PDOP ' + (d ? num(d.p, 2) : '—'), S.used.length + ' satellites, PDOP ' + (d ? num(d.p, 2) : '—'));
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function snapshot(act) {
    const d = S.dop;
    return {
      act: act || 'param', mode: state.mode, view: state.view,
      plane: {
        n: P.tw.length, on: P.ids.slice(), tau: state.tau, guess: state.guess, noise: state.noise, rx: state.rx.slice(),
        miss: P.miss, err: P.err, nX: P.X ? P.X.length : null,
        xErr: P.X && P.X.length ? Math.min.apply(null, P.X.map(function (p) { return Math.hypot(p[0] - state.rx[0], p[1] - state.rx[1]); })) * 1000 : null,
        near: P.near, seg: P.seg, solved: state.solved, fullTau: P.full ? P.full.tau : null, hdop: P.dop ? P.dop.h : null
      },
      sky: {
        lat: state.lat, lon: state.lon, t: state.t, mask: state.mask, wall: state.wall, mp: state.mp, sig: state.sig, clock: state.clock, ctau: state.ctau,
        nVis: S.vis.length, nUsed: S.used.length, nExcl: S.vis.length - S.used.length, maxEl: S.maxEl, pAll: S.pAll, playing: state.playing,
        dop: d ? { p: d.p, h: d.h, v: d.v, t: d.t } : null,
        hrms: S.sc ? S.sc.hrms : null, biasH: S.sc ? S.sc.biasH : null, biasV: S.sc ? Math.abs(S.sc.bias[2]) : null
      }
    };
  }
  let lastEmit = 0, emitTimer = 0;
  function emit(data) { if (state.acted && window.LabMission) window.LabMission.emit('gps', data); }
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
  function frame() {
    raf = 0;
    if (state.mode === 'plane') drawPlane();
    else if (state.view === 'skyplot') drawSky();
    else if (state.view === 'fix') drawFix();
    else drawGlobe();
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  const setSl = function (inp, v) { if (window.LabNum) window.LabNum.set(inp, v); else inp.value = v; };
  function loadSliders() {
    syncing = true;
    Object.keys(el).forEach(function (k) { setSl(el[k], state[k]); });
    syncing = false;
  }
  function readSliders() {
    state.tau = clamp(Math.round(val(el.tau) * 10) / 10, LIM.tau);
    state.guess = clamp(Math.round(val(el.guess) * 100) / 100, LIM.guess);
    state.noise = clamp(Math.round(val(el.noise)), LIM.noise);
    state.lat = clamp(Math.round(val(el.lat) * 10) / 10, LIM.lat);
    state.lon = clamp(Math.round(val(el.lon) * 10) / 10, LIM.lon);
    state.t = clamp(Math.round(val(el.t)), LIM.t);
    state.mask = clamp(Math.round(val(el.mask)), LIM.mask);
    state.wall = clamp(Math.round(val(el.wall)), LIM.wall);
    state.mp = clamp(Math.round(val(el.mp)), LIM.mp);
    state.sig = clamp(Math.round(val(el.sig) * 10) / 10, LIM.sig);
    state.ctau = clamp(Math.round(val(el.ctau) * 1000) / 1000, LIM.ctau);
  }
  function sayPlane() {
    if (P.tw.length < 2) { setStatus(T('一座塔只告訴你「在這個圓上某處」。再打開一座。', 'One tower only says “somewhere on this circle”. Turn on another.')); return; }
    if (P.tw.length === 2) { setStatus(T('兩個圓交在兩點：只靠兩座塔分不出你在哪一點（還要先知道時鐘準不準）。', 'Two circles cross at two points: two towers cannot tell which one (and the clock must already be right).')); return; }
    if (P.miss < 20) setStatus(T('時鐘修正對了：每一個圓都交在同一點，誤差 ' + meters(P.err) + '。', 'The clock correction is right: all circles meet at one point; error ' + meters(P.err) + '.'));
    else {
      const diff = state.tau - state.guess, dm = meters(Math.abs(diff) * K.C * 1000);
      setStatus(diff > 0
        ? T('圓沒有交在同一點：時鐘修正還少了 ' + num(diff, 2) + ' μs，每個圓的半徑都大了 ' + dm + '。', 'The circles do not meet: the correction is ' + num(diff, 2) + ' μs too small, so every circle is ' + dm + ' too big.')
        : T('圓沒有交在同一點：時鐘修正多了 ' + num(-diff, 2) + ' μs，每個圓的半徑都小了 ' + dm + '。', 'The circles do not meet: the correction is ' + num(-diff, 2) + ' μs too large, so every circle is ' + dm + ' too small.'));
    }
  }
  function saySky() {
    const d = S.dop;
    if (!d) { setStatus(state.clock === 'solve' ? T('只剩 ' + S.used.length + ' 顆衛星：四個未知數解不出來。', 'Only ' + S.used.length + ' satellites: four unknowns cannot be solved.') : T('只剩 ' + S.used.length + ' 顆衛星：至少要三顆。', 'Only ' + S.used.length + ' satellites: at least three are needed.')); return; }
    setStatus(T('用 ' + S.used.length + ' 顆衛星：PDOP ' + num(d.p, 2) + '，水平誤差大約 ' + meters(d.h * state.sig) + '。', S.used.length + ' satellites: PDOP ' + num(d.p, 2) + ', horizontal error about ' + meters(d.h * state.sig) + '.')
      + (S.sc.biasH > 1 ? T('另外有固定偏移 ' + meters(S.sc.biasH) + '，平均也去不掉。', ' Plus a fixed offset of ' + meters(S.sc.biasH) + ' that averaging cannot remove.') : ''));
  }
  function sliderChanged(e) {
    if (syncing) return;
    acted();
    readSliders();
    state.solved = false;
    const plane = [el.tau, el.guess, el.noise].indexOf(e.target) >= 0;
    afterChange(e.type === 'change', plane ? 'plane' : (e.target === el.t ? 'time' : 'sky'));
    if (e.type === 'change') { if (plane) sayPlane(); else saySky(); }
  }
  Object.keys(el).forEach(function (k) { el[k].addEventListener('input', sliderChanged); el[k].addEventListener('change', sliderChanged); });

  function segClick(sel, attr, apply) {
    document.querySelectorAll(sel + ' button').forEach(function (b) {
      b.addEventListener('click', function () { acted(); apply(b.getAttribute(attr)); });
    });
  }
  function syncSeg() {
    document.querySelectorAll('#modeSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === state.mode)); });
    document.querySelectorAll('#viewSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === state.view)); });
    document.querySelectorAll('#clockSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-clock') === state.clock)); });
    document.querySelectorAll('#towerChips button').forEach(function (b) { b.setAttribute('aria-pressed', String(state.on[+b.getAttribute('data-t')])); });
    $('viewSeg').hidden = state.mode !== 'sky';
    document.querySelectorAll('[data-for]').forEach(function (c) { c.hidden = c.getAttribute('data-for') !== state.mode; });
    $('tauRow').hidden = state.clock !== 'assume';
    cv.classList.toggle('rot', state.mode === 'sky' && state.view === 'globe');
    cv.classList.toggle('tall', state.mode === 'sky');
  }
  segClick('#modeSeg', 'data-mode', function (m) {
    state.mode = m; syncSeg(); if (m !== 'sky') stopPlay();
    afterChange(true, 'mode');
    if (m === 'sky') setStatus(T('24 顆衛星分在 6 個軌道面上，每顆大約 12 小時繞地球一圈。綠線是收得到的訊號。', '24 satellites in 6 orbital planes, each circling the Earth in about 12 hours. Green lines are signals received.'));
    else sayPlane();
  });
  segClick('#viewSeg', 'data-view', function (v) { state.view = v; syncSeg(); afterChange(true, 'view'); saySky(); });
  segClick('#clockSeg', 'data-clock', function (c) {
    state.clock = c; syncSeg(); afterChange(true, 'clock');
    if (c === 'assume') setStatus(T('接收機不解時鐘：三顆衛星就能算，但時鐘每偏 1 μs，每個距離就多 300 m。', 'The receiver skips the clock: three satellites suffice, but each microsecond of clock error adds 300 m to every distance.'));
    else saySky();
  });
  segClick('#towerChips', 'data-t', function (i) {
    state.on[+i] = !state.on[+i]; state.solved = false; syncSeg(); afterChange(true, 'tower'); sayPlane();
  });
  $('pSolve').addEventListener('click', function () {
    acted();
    if (P.tw.length < 3) { setStatus(T('時鐘也是未知數：平面上至少要三座塔才解得出來。', 'The clock is unknown too: on a plane, three towers are needed.')); afterChange(true, 'solve'); return; }
    const s = K.solve2(P.tw, P.rho);
    state.guess = clamp(Math.round(s.tau * 100) / 100, LIM.guess);
    syncing = true; setSl(el.guess, state.guess); syncing = false;
    state.solved = true;
    afterChange(true, 'solve');
    setStatus(T('接收機用最小平方法同時解出位置和時鐘：時鐘偏了 ' + num(s.tau, 2) + ' μs，位置誤差 ' + meters(P.err) + '。', 'Least squares finds the position and the clock together: clock off by ' + num(s.tau, 2) + ' μs, position error ' + meters(P.err) + '.'));
  });
  $('useAll').addEventListener('click', function () { acted(); state.excl = {}; afterChange(true, 'useall'); saySky(); });

  // ---------- 播放時間 ----------
  let playLast = 0, playRaf = 0;
  function stopPlay() { state.playing = false; cancelAnimationFrame(playRaf); $('play').setAttribute('aria-pressed', 'false'); $('play').textContent = T('▶ 時間前進', '▶ Run time'); }
  function playStep(ts) {
    if (!state.playing) return;
    const dt = playLast ? Math.min(0.1, (ts - playLast) / 1000) : 0; playLast = ts;
    state.t += dt * 30;
    if (state.t >= LIM.t[1]) { state.t = LIM.t[1]; stopPlay(); }
    syncing = true; setSl(el.t, Math.round(state.t)); syncing = false;
    afterChange(!state.playing, 'time');
    if (state.playing) playRaf = requestAnimationFrame(playStep);
    else { state.t = Math.round(state.t); saySky(); }
  }
  $('play').addEventListener('click', function () {
    acted();
    if (state.playing) { stopPlay(); state.t = Math.round(state.t); afterChange(true, 'time'); saySky(); return; }
    if (state.t >= LIM.t[1]) state.t = 0;
    state.playing = true; playLast = 0;
    $('play').setAttribute('aria-pressed', 'true'); $('play').textContent = T('❚❚ 暫停', '❚❚ Pause');
    playRaf = requestAnimationFrame(playStep);
  });

  // ---------- 畫布：拖曳接收機、轉動地球、點衛星 ----------
  let drag = null;
  function local(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function moveRx(x, y, act, force) {
    state.rx = [clamp(x, [0.5, IW - 0.5]), clamp(y, [0.5, IH - 0.5])];
    state.solved = false;
    afterChange(force, act);
  }
  cv.addEventListener('pointerdown', function (e) {
    acted();
    const q = local(e);
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    if (state.mode === 'plane') {
      const v = planeView();
      drag = { mode: 'rx' };
      moveRx((q[0] - v.x0) / v.s, (v.y0 + v.H - q[1]) / v.s + 0.3, 'drag', false);
    } else if (state.view === 'globe') drag = { mode: 'rot', x: q[0], y: q[1], yaw: state.yaw, pitch: state.pitch };
    else if (state.view === 'skyplot') {
      const v = skyView();
      let best = null, bd = 24;
      S.all.forEach(function (s) { if (!s.visible) return; const p = skyXY(v, s.el, s.az), d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; best = s; } });
      if (best) {
        if (state.excl[best.id]) delete state.excl[best.id]; else state.excl[best.id] = true;
        afterChange(true, 'sat');
        setStatus((state.excl[best.id] ? T('不用第 ' + (best.id + 1) + ' 號衛星。', 'Dropped satellite ' + (best.id + 1) + '. ') : T('重新用第 ' + (best.id + 1) + ' 號衛星。', 'Using satellite ' + (best.id + 1) + ' again. ')) + ' ' + (S.dop ? 'PDOP ' + num(S.dop.p, 2) : T('衛星不夠。', 'Too few satellites.')));
      }
    }
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drag) return;
    const q = local(e);
    if (drag.mode === 'rx') { const v = planeView(); moveRx((q[0] - v.x0) / v.s, (v.y0 + v.H - q[1]) / v.s + 0.3, 'drag', false); }
    else if (drag.mode === 'rot') { state.yaw = drag.yaw - (q[0] - drag.x) * 0.4; state.pitch = clamp(drag.pitch + (q[1] - drag.y) * 0.4, [-80, 80]); requestDraw(); }
  });
  function endDrag() {
    if (!drag) return;
    const m = drag.mode; drag = null;
    if (m === 'rx') { afterChange(true, 'drag'); sayPlane(); } else afterChange(true, 'rotate');
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  if (window.LabKeys) window.LabKeys.attach(cv, {
    label: T('GPS 畫布。平面練習時方向鍵移動接收機；地球畫面時方向鍵轉動地球（Shift 移動更多）。', 'GPS canvas. Arrow keys move the receiver in the tower practice, or turn the Earth (Shift for more).'),
    items: [{
      name: function () { return state.mode === 'plane' ? T('接收機', 'Receiver') : T('地球的視角', 'View of the Earth'); },
      move: function (dx, dy, big) {
        acted();
        if (state.mode === 'plane') { const st = big ? 2 : 0.5; moveRx(state.rx[0] + dx * st, state.rx[1] - dy * st, 'drag', true); sayPlane(); return true; }
        state.yaw += dx * (big ? 30 : 10); state.pitch = clamp(state.pitch - dy * (big ? 30 : 10), [-80, 80]);
        afterChange(true, 'rotate');
        return true;
      },
      describe: function () { return $('status').textContent; }
    }],
    onChange: function () { requestDraw(); }
  });

  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      return { m: state.mode, v: state.view, on: state.on.map(function (o) { return o ? 1 : 0; }), rx: state.rx.map(function (x) { return Math.round(x * 100) / 100; }), c: state.clock, x: Object.keys(state.excl).map(Number) };
    },
    set: function (o) {
      if (!o) return;
      if (o.m === 'plane' || o.m === 'sky') state.mode = o.m;
      if (['globe', 'skyplot', 'fix'].indexOf(o.v) >= 0) state.view = o.v;
      if (Array.isArray(o.on) && o.on.length === 5) state.on = o.on.map(function (b) { return b === 1; });
      if (Array.isArray(o.rx) && o.rx.length === 2 && o.rx.every(isFinite)) state.rx = [clamp(+o.rx[0], [0.5, IW - 0.5]), clamp(+o.rx[1], [0.5, IH - 0.5])];
      if (o.c === 'solve' || o.c === 'assume') state.clock = o.c;
      state.excl = {};
      if (Array.isArray(o.x)) o.x.forEach(function (i) { if (i >= 0 && i < K.NSAT) state.excl[Math.round(i)] = true; });
      readSliders(); syncSeg();
      recompute(); updateReadouts(); requestDraw();
    }
  });

  window.__gps = { state: state, K: K, snapshot: snapshot, get P() { return P; }, get S() { return S; }, moveRx: moveRx, redraw: requestDraw, refresh: function (act) { readSliders(); syncSeg(); afterChange(true, act || 'param'); } };

  readColors();
  loadSliders();
  readSliders();
  syncSeg();
  fit();
  recompute();
  updateReadouts();
  function themeChanged() { readColors(); updateReadouts(); requestDraw(); }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', function () { themeChanged(); if (!state.playing) $('play').textContent = T('▶ 時間前進', '▶ Run time'); });
  let rsTimer = 0;
  window.addEventListener('resize', function () { clearTimeout(rsTimer); rsTimer = setTimeout(function () { fit(); requestDraw(); }, 60); });
  if (window.ResizeObserver) new ResizeObserver(function () { fit(); requestDraw(); }).observe(cv);
  sayPlane();
  requestDraw();
})();
