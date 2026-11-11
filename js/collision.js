/* collision.js — 「一維碰撞」模組的畫面與互動（物理計算在 collision-core.js） */
(function () {
  'use strict';
  const CC = window.CollisionCore;
  const $ = function (id) { return document.getElementById(id); };
  // 介面文字：英文模式取英文，其餘取中文（簡體由 settings.js 自動轉換）
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };

  // ---------- 世界座標（m，向右為正） ----------
  const L = 12;           // 畫面中軌道長度
  const XC = L / 2;       // 碰撞點安排在軌道中央
  const MARGIN = 0.3;     // 起始位置距畫面邊緣
  const LEAD = 2;         // 理想的碰撞前時間（s）
  const AFTER = 3.5;      // 碰撞後再播放多久（s）
  const STROBE = 0.25;    // 質心標記間隔（s）
  const ARROW_M_PER_MPS = 0.4; // 速度箭頭：1 m/s 畫成 0.4 m 長

  /** 車長（m）隨質量略增，只是為了看得出輕重 */
  function cartWidth(m) { return 0.6 + 0.3 * Math.cbrt(m); }
  const W_MAX = cartWidth(10);

  const state = {
    p: { m1: 2, m2: 3, v1: 3, v2: -1, e: 1 },
    sim: null,
    sum: null,
    t: 0,
    tEnd: 4,
    running: false,
    ended: false,
    slow: false,
    cmFrame: false,
    mode: 'bars',
    scales: null
  };

  // ---------- 由參數建立模擬 ----------
  function setup() {
    const p = state.p;
    const w1 = cartWidth(p.m1), w2 = cartWidth(p.m2);
    let x1, x2;
    if (CC.approaching(p.v1, p.v2)) {
      // 讓兩車在 T0 秒後恰好於 XC 接觸，並確保起點都在畫面內
      const c1 = XC - w1 / 2, c2 = XC + w2 / 2;
      let T0 = LEAD;
      [[c1, p.v1, w1], [c2, p.v2, w2]].forEach(function (a) {
        const c = a[0], v = a[1], w = a[2];
        const lo = MARGIN + w / 2, hi = L - MARGIN - w / 2;
        if (v > 0) T0 = Math.min(T0, (c - lo) / v);
        else if (v < 0) T0 = Math.min(T0, (hi - c) / -v);
      });
      x1 = c1 - p.v1 * T0;
      x2 = c2 - p.v2 * T0;
    } else {
      x1 = XC - 1.2 - w1 / 2;
      x2 = XC + 1.2 + w2 / 2;
    }
    state.sim = CC.createSim({ m1: p.m1, m2: p.m2, v1: p.v1, v2: p.v2, e: p.e, w1: w1, w2: w2, x1: x1, x2: x2 });
    state.sum = CC.summary(p.m1, p.m2, p.v1, p.v2, p.e);
    state.tEnd = isFinite(state.sim.tc) ? state.sim.tc + AFTER : 4;
    state.t = 0;
    state.running = false;
    state.ended = false;
    computeScales();
    updatePlayButton();
    updateTable();
    requestDraw();
  }

  // 圖表的刻度在一次模擬中固定，長條才不會在播放中忽大忽小
  function niceMax(v) {
    if (!(v > 0)) return 1;
    const ex = Math.floor(Math.log10(v)), f = v / Math.pow(10, ex);
    const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return n * Math.pow(10, ex);
  }
  function computeScales() {
    const b = state.sum.before, a = state.sum.after;
    state.scales = {
      p: axis([0, b.p1, b.p2, b.p, a.p1, a.p2, a.p]),
      K: axis([0, b.K1, b.K2, b.K, a.K1, a.K2, a.K])
    };
  }
  /** 含 0 的座標範圍，刻度間隔取 1、2、2.5、5 × 10 的整數次方 */
  function axis(vals) {
    let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi - lo < 1e-9) hi = lo + 1;
    const step = niceMax((hi - lo) / 3);
    lo = Math.floor(lo / step + 1e-9) * step;
    hi = Math.ceil(hi / step - 1e-9) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
    return { lo: lo, hi: hi, ticks: ticks };
  }

  // ---------- 數字格式（負號用 U+2212） ----------
  function num(v, d, signed) {
    if (!isFinite(v)) return '—';
    if (Math.abs(v) < 0.5 * Math.pow(10, -d)) v = 0;
    const s = Math.abs(v).toFixed(d);
    if (v < 0) return '−' + s;
    return (signed && v > 0 ? '+' : '') + s;
  }

  // ---------- 畫布與顏色 ----------
  const track = $('track'), tctx = track.getContext('2d');
  const chart = $('chart'), cctx = chart.getContext('2d');
  let dpr = 1;
  const size = { track: { w: 0, h: 0 }, chart: { w: 0, h: 0 } };

  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--pos', '--neg', '--field', '--equi', '--grid', '--text', '--muted', '--border', '--surface', '--accent']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }

  function fit(cv, s) {
    dpr = window.devicePixelRatio || 1;
    s.w = cv.clientWidth;
    s.h = cv.clientHeight;
    cv.width = Math.round(s.w * dpr);
    cv.height = Math.round(s.h * dpr);
  }
  function resize() {
    fit(track, size.track);
    fit(chart, size.chart);
    draw();
  }

  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }

  function arrowHead(ctx, x, y, ux, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + ux * size, y);
    ctx.lineTo(x - ux * size * 0.6, y - size * 0.6);
    ctx.lineTo(x - ux * size * 0.6, y + size * 0.6);
    ctx.closePath();
    ctx.fill();
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
  function haloText(ctx, text, x, y, color) {
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = colors['canvas-bg'];
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function draw() {
    if (!state.sim || !size.track.w) return;
    const st = CC.stateAt(state.sim, state.t);
    drawTrack(st);
    if (state.mode === 'bars') drawBars(st); else drawTime(st);
    updateReadout(st);
  }

  // ---------- 軌道動畫 ----------
  function drawTrack(st) {
    const ctx = tctx, w = size.track.w, h = size.track.h, sim = state.sim;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors['canvas-bg'];
    ctx.fillRect(0, 0, w, h);

    const k = w / L;                        // px / m
    const narrow = k < 45;
    // 質心參考系：鏡頭跟著質心移動
    const off = state.cmFrame ? st.xcm - XC : 0;
    const X = function (x) { return (x - off) * k; };
    const vShift = state.cmFrame ? st.vcm : 0;

    const trackY = Math.round(h * 0.74);
    const baseH = Math.max(22, Math.min(58, h * 0.2));
    const wheelR = Math.max(3, baseH * 0.13);

    // 尺規（每 1 m 一格）
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const first = Math.ceil(off), last = Math.floor(off + L);
    for (let m = first; m <= last; m++) { ctx.moveTo(X(m), 0); ctx.lineTo(X(m), trackY); }
    ctx.stroke();
    ctx.fillStyle = colors.muted;
    ctx.strokeStyle = colors.muted;
    ctx.font = (narrow ? 10 : 12) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.beginPath();
    const labeled = [], rulerY = Math.min(h - 6, trackY + 38);
    for (let m = first; m <= last; m++) {
      ctx.moveTo(X(m), trackY + 3); ctx.lineTo(X(m), trackY + 8);
      if ((!narrow || m % 2 === 0) && X(m) > 12 && X(m) < w - 12) labeled.push(m);
    }
    ctx.stroke();
    labeled.forEach(function (m, i) {
      ctx.fillText(String(m).replace('-', '−'), X(m), rulerY);
      if (i === labeled.length - 1) { ctx.textAlign = 'left'; ctx.fillText(' m', X(m) + ctx.measureText(String(m)).width / 2, rulerY); ctx.textAlign = 'center'; }
    });

    // 軌道
    ctx.strokeStyle = colors.field;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, trackY + 1); ctx.lineTo(w, trackY + 1);
    ctx.stroke();

    // 質心頻閃標記：等時間間隔、等距離 → 等速度
    ctx.fillStyle = colors.equi;
    for (let ts = 0; ts <= state.t + 1e-9; ts += STROBE) {
      const s = CC.stateAt(sim, ts);
      ctx.beginPath();
      ctx.arc(X(s.xcm), trackY + 1, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 兩台車
    const carts = [
      { x: st.x1, w: sim.w1, v: st.v1, m: sim.m1, color: colors.pos, label: '1', side: -1 },
      { x: st.x2, w: sim.w2, v: st.v2, m: sim.m2, color: colors.neg, label: '2', side: 1 }
    ];
    carts.forEach(function (c) {
      const cw = c.w * k, ch = baseH * c.w / W_MAX;
      const left = X(c.x) - cw / 2, top = trackY - 2 * wheelR - ch;
      c.px = X(c.x); c.top = top; c.cw = cw;
      ctx.fillStyle = c.color;
      roundRect(ctx, left, top, cw, ch, 5);
      ctx.fill();
      ctx.fillStyle = colors.field;
      [0.25, 0.75].forEach(function (f) {
        ctx.beginPath();
        ctx.arc(left + cw * f, trackY - wheelR, wheelR, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = colors['canvas-bg'];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const showMass = cw >= 50 && ch >= 36;
      ctx.font = '700 ' + Math.round(Math.min(18, ch * 0.42)) + 'px system-ui, sans-serif';
      ctx.fillText(c.label, c.px, top + ch * (showMass ? 0.36 : 0.52));
      if (showMass) {
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.fillText(num(c.m, 1) + ' kg', c.px, top + ch * 0.72);
      }
    });

    // 碰撞瞬間的閃光
    if (isFinite(sim.tc)) {
      const age = state.t - sim.tc;
      if (age >= 0 && age < 0.25) {
        const s = CC.stateAt(sim, sim.tc);
        const cx = X(s.x1 + sim.w1 / 2), cy = trackY - 2 * wheelR - baseH * 0.45;
        const r = 6 + age * 60;
        ctx.strokeStyle = colors.equi;
        ctx.globalAlpha = 1 - age / 0.25;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          ctx.moveTo(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5);
          ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // 速度箭頭與數值（在質心參考系中為相對質心的速度）
    const unit = k * ARROW_M_PER_MPS;
    carts.forEach(function (c) {
      const v = c.v - vShift;
      const ay = c.top - 10;
      if (Math.abs(v) > 1e-9) {
        const len = Math.max(8, Math.abs(v) * unit), ux = Math.sign(v);
        ctx.strokeStyle = c.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(c.px, ay);
        ctx.lineTo(c.px + ux * (len - 6), ay);
        ctx.stroke();
        arrowHead(ctx, c.px + ux * (len - 6), ay, ux, 8, c.color);
      } else {
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.arc(c.px, ay, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // 數值往外側對齊：兩車相碰時標籤不會重疊
      ctx.font = '600 ' + (narrow ? 11 : 13) + 'px system-ui, sans-serif';
      ctx.textBaseline = 'alphabetic';
      if (c.px + c.cw / 2 < 0 || c.px - c.cw / 2 > w) return; // 車子已離開畫面
      const name = narrow ? '' : (state.cmFrame ? 'v' + c.label + ' − vcm = ' : 'v' + c.label + ' = ');
      const text = name + num(v, narrow ? 1 : 2, true) + ' m/s';
      const tw = ctx.measureText(text).width;
      // 車 1 的標籤靠右對齊在車 1 右緣、車 2 靠左對齊在車 2 左緣（向外延伸），再限制在畫面內
      let tx = c.side < 0 ? c.px + c.cw / 2 - tw : c.px - c.cw / 2;
      tx = Math.max(4, Math.min(w - 4 - tw, tx));
      ctx.textAlign = 'left';
      haloText(ctx, text, tx, ay - 9, colors.text);
    });

    // 質心標記：軌道下方的三角形 + 虛線
    const cx = X(st.xcm);
    ctx.strokeStyle = colors.equi;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, trackY - 2 * wheelR - baseH - 2);
    ctx.lineTo(cx, trackY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colors.equi;
    ctx.beginPath();
    ctx.moveTo(cx, trackY + 4);
    ctx.lineTo(cx - 7, trackY + 16);
    ctx.lineTo(cx + 7, trackY + 16);
    ctx.closePath();
    ctx.fill();
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    haloText(ctx, T('質心', 'CM'), cx + 10, trackY + 12, colors.text);

    // 左上角：時間與參考系
    ctx.font = (narrow ? 11 : 13) + 'px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    haloText(ctx, 't = ' + num(state.t, 2) + ' s' + (state.cmFrame ? T('　質心參考系', '   CM frame') : ''), 8, 7, colors.muted);
  }

  // ---------- 圖表共用 ----------
  const SERIES = [
    { key: '1', label: T('車 1', 'Cart 1') },
    { key: '2', label: T('車 2', 'Cart 2') },
    { key: '', label: T('總和', 'Total') }
  ];
  function seriesColor(i) { return [colors.pos, colors.neg, colors.field][i]; }
  function valuesOf(q, kind) { return kind === 'p' ? [q.p1, q.p2, q.p] : [q.K1, q.K2, q.K]; }

  const TITLE_P = T('動量 p（kg·m/s）', 'Momentum p (kg·m/s)');
  const TITLE_K = T('動能 K（J）', 'Kinetic energy K (J)');

  // ---------- 長條圖 ----------
  function drawBars(st) {
    const ctx = cctx, w = size.chart.w, h = size.chart.h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors['canvas-bg'];
    ctx.fillRect(0, 0, w, h);
    const half = w / 2;
    barPanel(ctx, 0, 0, half, h, 'p', TITLE_P, st);
    barPanel(ctx, half, 0, half, h, 'K', TITLE_K, st);
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(half, 10); ctx.lineTo(half, h - 10); ctx.stroke();
  }

  function barPanel(ctx, x0, y0, pw, ph, kind, title, st) {
    const ax = state.scales[kind], lo = ax.lo, hi = ax.hi;
    const small = pw < 220;
    const top = y0 + 34, bottom = y0 + ph - 26;
    const left = x0 + (small ? 8 : 14), right = x0 + pw - (small ? 8 : 14);
    const Y = function (v) { return bottom - (v - lo) / (hi - lo) * (bottom - top); };

    ctx.font = '600 ' + (small ? 12 : 13) + 'px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = colors.text;
    ctx.fillText(title, left, y0 + 8);

    // 刻度格線
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ax.ticks.forEach(function (v) { if (v !== 0) { ctx.moveTo(left, Y(v)); ctx.lineTo(right, Y(v)); } });
    ctx.stroke();

    const vals = valuesOf(st, kind), ghost = valuesOf(state.sum.before, kind);
    const slot = (right - left) / 3, bw = Math.min(48, slot * 0.56);
    const y0v = Y(0);
    for (let i = 0; i < 3; i++) {
      const cx = left + slot * (i + 0.5);
      const v = vals[i], yv = Y(v);
      // 資料端圓角、基線端直角
      if (Math.abs(yv - y0v) > 0.5) {
        ctx.fillStyle = seriesColor(i);
        const up = v > 0, r = Math.min(4, Math.abs(yv - y0v) / 2);
        ctx.beginPath();
        if (up) {
          ctx.moveTo(cx - bw / 2, y0v); ctx.lineTo(cx - bw / 2, yv + r);
          ctx.arcTo(cx - bw / 2, yv, cx - bw / 2 + r, yv, r);
          ctx.lineTo(cx + bw / 2 - r, yv); ctx.arcTo(cx + bw / 2, yv, cx + bw / 2, yv + r, r);
          ctx.lineTo(cx + bw / 2, y0v);
        } else {
          ctx.moveTo(cx - bw / 2, y0v); ctx.lineTo(cx - bw / 2, yv - r);
          ctx.arcTo(cx - bw / 2, yv, cx - bw / 2 + r, yv, r);
          ctx.lineTo(cx + bw / 2 - r, yv); ctx.arcTo(cx + bw / 2, yv, cx + bw / 2, yv - r, r);
          ctx.lineTo(cx + bw / 2, y0v);
        }
        ctx.closePath();
        ctx.fill();
      }
      // 碰撞前數值的虛線外框
      if (st.collided && Math.abs(ghost[i] - v) > 1e-9) {
        ctx.strokeStyle = colors.muted;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);
        const yg = Y(ghost[i]);
        ctx.strokeRect(cx - bw / 2 - 3, Math.min(yg, y0v), bw + 6, Math.abs(yg - y0v));
        ctx.setLineDash([]);
      }
      // 數值標籤：放在長條末端外側
      ctx.font = '600 ' + (small ? 11 : 12) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const below = v < 0;
      ctx.textBaseline = below ? 'top' : 'bottom';
      let ty = below ? yv + 3 : yv - 3;
      if (!below) ty = Math.max(ty, top - 2 + 12);
      haloText(ctx, num(v, small ? 1 : 2, kind === 'p'), cx, ty, colors.text);
      // 類別標籤
      ctx.font = (small ? 11 : 12) + 'px system-ui, sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = colors.muted;
      ctx.fillText(SERIES[i].label, cx, y0 + ph - 8);
    }
    // 零基線
    ctx.strokeStyle = colors.field;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(left, y0v); ctx.lineTo(right, y0v); ctx.stroke();
  }

  // ---------- 時間圖 ----------
  function drawTime(st) {
    const ctx = cctx, w = size.chart.w, h = size.chart.h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors['canvas-bg'];
    ctx.fillRect(0, 0, w, h);
    if (w >= 520) {
      timePanel(ctx, 0, 0, w / 2, h, 'p', TITLE_P, st);
      timePanel(ctx, w / 2, 0, w / 2, h, 'K', TITLE_K, st);
    } else {
      timePanel(ctx, 0, 0, w, h / 2, 'p', TITLE_P, st);
      timePanel(ctx, 0, h / 2, w, h / 2, 'K', TITLE_K, st);
    }
  }

  function timePanel(ctx, x0, y0, pw, ph, kind, title, st) {
    const sim = state.sim, ax = state.scales[kind], lo = ax.lo, hi = ax.hi;
    const left = x0 + 44, right = x0 + pw - 26, top = y0 + 28, bottom = y0 + ph - 22;
    const tMax = state.tEnd;
    const X = function (t) { return left + t / tMax * (right - left); };
    const Y = function (v) { return bottom - (v - lo) / (hi - lo) * (bottom - top); };

    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = colors.text;
    ctx.fillText(title, x0 + 8, y0 + 6);
    const titleRight = x0 + 8 + ctx.measureText(title).width;

    // 軸與刻度
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    const ticks = ax.ticks;
    ctx.beginPath();
    ticks.forEach(function (v) { ctx.moveTo(left, Y(v)); ctx.lineTo(right, Y(v)); });
    ctx.stroke();
    ctx.fillStyle = colors.muted;
    ticks.forEach(function (v) { ctx.fillText(num(v, Number.isInteger(v) ? 0 : Number.isInteger(v * 10) ? 1 : 2), left - 5, Y(v)); });
    ctx.strokeStyle = colors.field;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(left, Y(0)); ctx.lineTo(right, Y(0)); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const step = tMax > 5 ? 2 : 1;
    for (let t = 0; t <= tMax + 1e-9; t += step) ctx.fillText(String(t), X(t), bottom + 4);
    ctx.textAlign = 'right';
    ctx.fillText(T('t（s）', 't (s)'), left - 5, bottom + 4);

    // 碰撞時刻
    if (isFinite(sim.tc)) {
      ctx.strokeStyle = colors.equi;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(X(sim.tc), top - 4); ctx.lineTo(X(sim.tc), bottom); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = colors.muted;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const label = T('碰撞', 'Collision'), lx = X(sim.tc);
      // 窄畫面上標籤若會壓到圖表標題，改放在虛線右側
      if (lx - ctx.measureText(label).width / 2 < titleRight + 6) {
        ctx.textAlign = 'left';
        ctx.fillText(label, Math.max(lx + 4, titleRight + 6), top - 4);
      } else {
        ctx.fillText(label, lx, top - 4);
      }
    }

    // 數值曲線（碰撞前後各為常數，碰撞瞬間跳躍）
    const before = valuesOf(state.sum.before, kind), after = valuesOf(state.sum.after, kind);
    const t = state.t, hit = isFinite(sim.tc) && t >= sim.tc;
    const ends = [];
    for (let i = 2; i >= 0; i--) {
      // 總和畫成較粗的半透明底線，與車 1 或車 2 重疊時仍看得見
      ctx.strokeStyle = seriesColor(i);
      ctx.lineWidth = i === 2 ? 6 : 2;
      ctx.globalAlpha = i === 2 ? 0.45 : 1;
      ctx.beginPath();
      ctx.moveTo(X(0), Y(before[i]));
      ctx.lineTo(X(hit ? sim.tc : t), Y(before[i]));
      if (hit) {
        ctx.stroke();
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(X(sim.tc), Y(before[i])); ctx.lineTo(X(sim.tc), Y(after[i])); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(X(sim.tc), Y(after[i]));
        ctx.lineTo(X(t), Y(after[i]));
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      ends.push({ i: i, y: Y(hit ? after[i] : before[i]) });
    }
    // 線尾的直接標籤（避開重疊）
    ends.sort(function (a, b) { return a.y - b.y; });
    for (let j = 1; j < ends.length; j++) if (ends[j].y - ends[j - 1].y < 12) ends[j].y = ends[j - 1].y + 12;
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ends.forEach(function (e) {
      const xx = Math.min(X(t) + 4, right + 2);
      ctx.fillStyle = seriesColor(e.i);
      ctx.fillRect(xx, e.y - 1, 5, 2);
      haloText(ctx, ['1', '2', T('總', 'Σ')][e.i], xx + 7, e.y, colors.text);
    });
  }

  // ---------- 文字數值 ----------
  function updateReadout(st) {
    $('rt').textContent = num(state.t, 2) + ' s';
    $('rv1').textContent = num(st.v1, 2, true) + ' m/s';
    $('rv2').textContent = num(st.v2, 2, true) + ' m/s';
    $('rvcm').textContent = num(st.vcm, 2, true) + ' m/s';
    $('rp').textContent = num(st.p, 2, true) + ' kg·m/s';
    $('rK').textContent = num(st.K, 2) + ' J';

    const sim = state.sim, s = state.sum;
    let msg;
    if (!s.collides) {
      msg = T('兩車沒有互相接近（v1 ≤ v2），不會碰撞。', 'The carts are not approaching each other (v1 ≤ v2), so they will not collide.');
    } else if (state.t < sim.tc) {
      msg = T('兩車互相接近，將在 t = ' + num(sim.tc, 2) + ' s 相撞。',
        'The carts are approaching each other and will collide at t = ' + num(sim.tc, 2) + ' s.');
    } else {
      const pct = num(100 * s.lost / s.before.K, 1);
      msg = T('t = ' + num(sim.tc, 2) + ' s 碰撞：總動量不變，' +
        (s.lost > 1e-9 ? '動能減少 ' + num(s.lost, 2) + ' J（' + pct + '%）。' : '總動能也不變（彈性碰撞）。'),
        'Collision at t = ' + num(sim.tc, 2) + ' s: total momentum is unchanged; ' +
        (s.lost > 1e-9 ? 'kinetic energy falls by ' + num(s.lost, 2) + ' J (' + pct + '%).' : 'total kinetic energy is unchanged too (elastic collision).'));
    }
    if (state.running && !state.ended && state.slow) msg += T('（慢動作）', ' (slow motion)');
    $('status').textContent = msg;
  }

  function updateTable() {
    const s = state.sum, b = s.before, a = s.after;
    const rows = [['v1', 2, true], ['v2', 2, true], ['p1', 2, true], ['p2', 2, true], ['p', 2, true], ['K1', 2, false], ['K2', 2, false], ['K', 2, false]];
    rows.forEach(function (r) {
      const k = r[0];
      $('t' + k + 'b').textContent = num(b[k], r[1], r[2]);
      $('t' + k + 'a').textContent = num(a[k], r[1], r[2]);
      $('t' + k + 'd').textContent = num(a[k] - b[k], r[1], true);
    });
    $('lost').innerHTML = s.collides
      ? '<strong>' + num(s.lost, 3) + ' J</strong>' + T('（', ' (') + (b.K > 0 ? num(100 * s.lost / b.K, 1) : '0.0') + T('%）', '%)')
      : '0 J';
    $('lostF').textContent = s.collides ? num(s.lostFormula, 3) + ' J' : '—';
    $('eBack').textContent = s.collides ? num(s.eMeasured, 2) : '—';
    $('tableNote').textContent = s.collides
      ? T('碰撞後的數值由公式直接算出；播放動畫後，「即時數值」會與此表的碰撞後數值相同。',
        'The “After” values come straight from the formulas; once the animation has played, the live readings match the “After” column of this table.')
      : T('兩車不會碰撞，所以「碰撞後」與「碰撞前」相同。', 'The carts do not collide, so “After” is the same as “Before”.');
  }

  // ---------- 音效（sound.js；音效關閉時 LabSound 什麼都不做） ----------
  /**
   * 碰撞聲：音量隨碰撞的「激烈程度」增加，音色隨 e 改變。
   * 激烈程度用質心系中的動能 ½μ(v1 − v2)²（可用來碰撞的能量），取對數壓縮並設上限，避免刺耳。
   * e 接近 1 → 短而清脆（濾波頻率高）；e 接近 0 → 低沉而較長的悶響（濾波頻率低）。
   */
  function impactSound() {
    const S = window.LabSound;
    if (!S || !S.enabled()) return;
    const sim = state.sim, u = sim.v1 - sim.v2;
    const eCm = 0.5 * CC.reducedMass(sim.m1, sim.m2) * u * u;
    const hard = Math.max(0, Math.min(1, Math.log10(1 + eCm) / Math.log10(1 + 150)));
    const gain = 0.08 + 0.42 * hard;
    const e = sim.e;
    S.noise({ dur: 0.04 + 0.18 * (1 - e), gain: gain, filter: 300 + 2700 * e * e, q: 0.8 + 0.8 * e });
    S.tone({ freq: 110 + 1000 * e, dur: 0.03 + 0.12 * (1 - e), type: e > 0.5 ? 'triangle' : 'sine', gain: gain * (0.25 + 0.25 * (1 - e)) });
  }
  function playSound() {
    const S = window.LabSound;
    if (S && S.enabled()) S.tone({ freq: 660, dur: 0.07, gain: 0.08 });
  }

  // ---------- 動畫 ----------
  let lastT = 0;
  function offscreen(st) {
    const off = state.cmFrame ? st.xcm - XC : 0;
    const out = function (x, w) { return x - w / 2 - off > L + 0.2 || x + w / 2 - off < -0.2; };
    return out(st.x1, state.sim.w1) && out(st.x2, state.sim.w2);
  }
  function tick(now) {
    if (!state.running) return;
    const dt = Math.min((now - lastT) / 1000, 1 / 30) * (state.slow ? 0.25 : 1);
    lastT = now;
    const prevT = state.t;
    state.t = Math.min(state.tEnd, state.t + dt);
    // 碰撞聲：動畫時間跨過碰撞時刻的那一格發出一次（慢動作、重播也一樣）
    if (prevT < state.sim.tc && state.t >= state.sim.tc) impactSound();
    const st = CC.stateAt(state.sim, state.t);
    if (state.t >= state.tEnd || (state.t > state.sim.tc && offscreen(st)) || (!isFinite(state.sim.tc) && offscreen(st))) {
      state.running = false;
      state.ended = true;
    }
    updatePlayButton();
    draw();
    if (state.running) requestAnimationFrame(tick);
  }
  function updatePlayButton() {
    $('play').textContent = state.running ? T('暫停', 'Pause') : state.ended ? T('重新播放', 'Replay') : state.t > 0 ? T('繼續', 'Resume') : T('播放', 'Play');
  }
  $('play').addEventListener('click', function () {
    if (state.running) {
      state.running = false;
      updatePlayButton();
      requestDraw();
      return;
    }
    if (state.ended) { state.t = 0; state.ended = false; }
    state.running = true;
    playSound();
    updatePlayButton();
    lastT = performance.now();
    requestAnimationFrame(tick);
  });
  $('reset').addEventListener('click', function () {
    state.running = false;
    state.ended = false;
    state.t = 0;
    updatePlayButton();
    requestDraw();
  });
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
  $('slow').addEventListener('change', function (ev) { state.slow = ev.target.checked; requestDraw(); });
  $('cmFrame').addEventListener('change', function (ev) { state.cmFrame = ev.target.checked; requestDraw(); });

  function setMode(m) {
    state.mode = m;
    $('modeBars').setAttribute('aria-pressed', String(m === 'bars'));
    $('modeTime').setAttribute('aria-pressed', String(m === 'time'));
    $('ghostLegend').hidden = m !== 'bars';
    requestDraw();
  }
  $('modeBars').addEventListener('click', function () { setMode('bars'); });
  $('modeTime').addEventListener('click', function () { setMode('time'); });

  // ---------- 控制項 ----------
  function bindSlider(id, fmt) {
    const el = $(id), out = $(id + 'o');
    const update = function () { out.textContent = fmt(+el.value); };
    el.addEventListener('input', function () { update(); state.p[id] = +el.value; setup(); });
    update();
    state.p[id] = +el.value;
    return { set: function (v) { el.value = v; update(); state.p[id] = v; } };
  }
  const fmtM = function (v) { return num(v, 1) + ' kg'; };
  const fmtV = function (v) { return num(v, 1, true) + ' m/s'; };
  const sliders = {
    m1: bindSlider('m1', fmtM),
    m2: bindSlider('m2', fmtM),
    v1: bindSlider('v1', fmtV),
    v2: bindSlider('v2', fmtV),
    e: bindSlider('e', function (v) { return num(v, 2); })
  };

  const PRESETS = {
    elastic: { m1: 2, m2: 3, v1: 3, v2: -1, e: 1 },
    inelastic: { m1: 2, m2: 3, v1: 3, v2: -1, e: 0 },
    swap: { m1: 2, m2: 2, v1: 3, v2: 0, e: 1 },
    heavy: { m1: 6, m2: 1, v1: 3, v2: 0, e: 1 },
    light: { m1: 1, m2: 6, v1: 3, v2: 0, e: 1 }
  };
  document.querySelectorAll('[data-preset]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const p = PRESETS[btn.dataset.preset];
      Object.keys(p).forEach(function (k) { sliders[k].set(p[k]); });
      setup();
    });
  });

  // ---------- 啟動 ----------
  readColors();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { readColors(); requestDraw(); });
  // 齒輪設定切換深淺色時也重畫（settings.js）
  window.addEventListener('lab:themechange', function () { readColors(); requestDraw(); });
  setup();
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(resize);
    ro.observe(track);
    ro.observe(chart);
  } else {
    window.addEventListener('resize', resize);
  }
  resize();
})();
