/* inscribed-angle.js — 「圓周角與圓冪」的畫面與互動（數學計算在 inscribed-angle-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 三種模式：
 *   圓周角：沿圓拖 A、B、P（可再放一點 P′），看 ∠APB 與圓心角 ∠AOB。
 *   內接四邊形：沿圓拖 A、B、C、D，看對角互補、對角線、托勒密。
 *   圓冪：拖點 Q，轉兩條過 Q 的直線，看 QA·QB = QC·QD = |OQ^2 − R^2|，圓外再畫切線。
 * 圓上的點：拖曳每次 0.5°（靠近 5° 的倍數 1° 以內會吸附），方向鍵 0.1°、Shift 1°；Q：靠近 0.5 的格點會吸附，其餘取到 0.05，方向鍵 0.1、Shift 0.5。
 * 挑戰：求出未知的角或長度（輸入數字）。 */
(function () {
  'use strict';
  const M = window.IACore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha;
  const clampv = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  const r6 = function (v) { const w = Math.round(v * 1e6) / 1e6; return w === 0 ? 0 : w; };
  const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const NAMES = { ins: ['A', 'B', 'P', 'P2'], quad: ['A', 'B', 'C', 'D'], pow: ['Q'] };
  const SHOWN = function (k) { return k === 'P2' ? 'P′' : k; };

  // ---------- 狀態 ----------
  const state = {
    mode: 'ins', R: 4,
    ins: { A: 200, B: 340, P: 80, P2: 140 },
    quad: [210, 300, 35, 120],
    Q: [6, 2.5], th1: 10, th2: 120,
    showCen: true, showP2: false, showDiag: true, show2: false, showTan: true,
    pRun: null,
    log: [], chal: null, streak: 0, times: [], round: 0,
    drag: null
  };
  let rand = function () { return Math.random(); };

  // ---------- 色彩與字 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'ia-c', 'ia-a', 'ia-o', 'ia-q', 'ia-l1', 'ia-l2', 'ia-t', 'ia-ok', 'ia-bad']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + px + 'px ' + FONT; }
  function fmt(v, d) {
    if (v == null || isNaN(v)) return '—';
    if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
    let s = (Math.round(v * 1e9) / 1e9).toFixed(d == null ? 3 : d);
    if (s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, '');
    if (s === '-0') s = '0';
    return s.replace('-', '−');
  }
  function deg(v, d) { return isNaN(v) ? '—' : fmt(v, d == null ? 2 : d) + '°'; }

  // ---------- 目前的圖形 ----------
  let cache = null;
  function posOf(k) { return state.mode === 'quad' ? state.quad['ABCD'.indexOf(k)] : state.ins[k]; }
  function current() {
    if (cache) return cache;
    const R = state.R, o = { mode: state.mode, R: R };
    if (state.mode === 'ins') {
      const s = state.ins;
      o.r = M.inscribed(R, s.A, s.B, s.P);
      o.r2 = state.showP2 ? M.inscribed(R, s.A, s.B, s.P2) : null;
      if (o.r.ok) { o.PA = M.dist(o.r.P, o.r.A); o.PB = M.dist(o.r.P, o.r.B); }
    } else if (state.mode === 'quad') {
      o.q = M.quad(R, state.quad);
    } else {
      const Q = state.Q;
      o.pw = M.power(R, Q); o.OQ = Math.hypot(Q[0], Q[1]);
      o.L1 = M.lineCircle(R, Q, state.th1);
      o.L2 = state.show2 ? M.lineCircle(R, Q, state.th2) : null;
      o.T = M.tangents(R, Q);
      o.QT = o.pw > 0 ? Math.sqrt(o.pw) : NaN;
      o.where = Math.abs(o.pw) < 1e-9 ? 'on' : o.pw < 0 ? 'in' : 'out';
    }
    cache = o;
    return o;
  }

  // ---------- 畫布與版面 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  let cw = 0, ch = 0, dpr = 1, PR = null;
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    ch = cw < 640 ? Math.round(clampv(cw * 1.02, 340, 560)) : 520;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    PR = { x: 6, y: 6, w: cw - 12, h: ch - 12 };
    viewCur = null;
    requestDraw();
  }
  let rafId = 0;
  function requestDraw() { if (!rafId) rafId = requestAnimationFrame(function () { rafId = 0; draw(); }); }

  // ---------- 視野（等比例；拖曳時固定） ----------
  let viewCur = null, viewTween = null;
  function contentBox() {
    if (state.chal) {
      const F = state.chal.F, R = F.R, pts = [[-R, -R], [R, R]];
      if (F.Q) pts.push(F.Q);
      return boxOf(pts, 0.14);
    }
    const R = state.R;
    if (state.mode !== 'pow') return boxOf([[-R, -R], [R, R]], 0.2);
    const cur = current(), pts = [[-R, -R], [R, R], state.Q];
    if (cur.T && state.showTan) pts.push(cur.T[0], cur.T[1]);
    return boxOf(pts, 0.14);
  }
  function boxOf(pts, padK) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    pts.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    const span = Math.max(x1 - x0, y1 - y0, 1);
    const pad = padK * span + 0.3;
    return [x0 - pad, x1 + pad, y0 - pad, y1 + pad];
  }
  function fitView(b) {
    const w = PR.w, h = PR.h;
    let sx = b[1] - b[0], sy = b[3] - b[2];
    const s = Math.min(w / sx, h / sy);
    sx = w / s; sy = h / s;
    const cx = (b[0] + b[1]) / 2, cy = (b[2] + b[3]) / 2;
    return { x0: cx - sx / 2, y0: cy - sy / 2, s: s };
  }
  function updateView(now) {
    if (state.drag && viewCur) return viewCur;
    const tv = fitView(contentBox());
    if (!viewCur || reduceMotion.matches) { viewCur = tv; viewTween = null; return viewCur; }
    const same = Math.abs(tv.x0 - viewCur.x0) < 1e-6 && Math.abs(tv.y0 - viewCur.y0) < 1e-6 && Math.abs(tv.s - viewCur.s) < 1e-6;
    if (same) { viewTween = null; return viewCur; }
    if (!viewTween || viewTween.to.x0 !== tv.x0 || viewTween.to.y0 !== tv.y0 || viewTween.to.s !== tv.s) viewTween = { from: viewCur, to: tv, t0: now };
    const u = clampv((now - viewTween.t0) / 240, 0, 1), e = 1 - Math.pow(1 - u, 3);
    viewCur = { x0: viewTween.from.x0 + (tv.x0 - viewTween.from.x0) * e, y0: viewTween.from.y0 + (tv.y0 - viewTween.from.y0) * e, s: viewTween.from.s * Math.pow(tv.s / viewTween.from.s, e) };
    if (u >= 1) { viewCur = tv; viewTween = null; }
    else requestDraw();
    return viewCur;
  }
  function X(x) { return PR.x + (x - viewCur.x0) * viewCur.s; }
  function Y(y) { return PR.y + PR.h - (y - viewCur.y0) * viewCur.s; }
  function invX(px) { return viewCur.x0 + (px - PR.x) / viewCur.s; }
  function invY(py) { return viewCur.y0 + (PR.y + PR.h - py) / viewCur.s; }
  function niceStep(span) {
    if (!(span > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(span)));
    const m = span / e;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e;
  }
  const XY = function (p) { return [X(p[0]), Y(p[1])]; };
  const sub = function (p, q) { return [p[0] - q[0], p[1] - q[1]]; };
  const add = function (p, q) { return [p[0] + q[0], p[1] + q[1]]; };
  const mulv = function (p, k) { return [p[0] * k, p[1] * k]; };
  const len = function (p) { return Math.hypot(p[0], p[1]); };
  const mid = function (p, q) { return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; };

  // ---------- 畫 ----------
  function draw() {
    const now = performance.now();
    if (!PR) return;
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, cw, ch);
    updateView(now);
    const b = PR;
    D.roundRect(c, b.x, b.y, b.w, b.h, 8);
    c.fillStyle = alpha(C.text, D.dark ? 0.03 : 0.022); c.fill();
    c.save();
    D.roundRect(c, b.x, b.y, b.w, b.h, 8); c.clip();
    const st = niceStep(60 / viewCur.s);
    const snap = function (v) { return (Math.round(v * dpr) + 0.5) / dpr; };
    c.lineWidth = 1; c.strokeStyle = alpha(C.text, D.dark ? 0.06 : 0.065);
    c.beginPath();
    for (let g = Math.ceil(invX(b.x) / st) * st; g <= invX(b.x + b.w); g += st) { c.moveTo(snap(X(g)), b.y); c.lineTo(snap(X(g)), b.y + b.h); }
    for (let g = Math.ceil(invY(b.y + b.h) / st) * st; g <= invY(b.y); g += st) { c.moveTo(b.x, snap(Y(g))); c.lineTo(b.x + b.w, snap(Y(g))); }
    c.stroke();

    const labels = [];
    if (state.chal) drawChal(c, labels);
    else if (state.mode === 'ins') drawIns(c, labels);
    else if (state.mode === 'quad') drawQuad(c, labels);
    else drawPow(c, labels);
    placeLabels(c, labels);
    c.restore();
    D.pill(c, T('格線間距 ', 'Grid spacing ') + fmt(st), b.x + 8, b.y + b.h - 6, C.muted, 'left', fnt(10.5, 600));
    if (state.chal && !state.chal.done) D.pill(c, T('挑戰：求出標著「？」的量', 'Challenge: find the value marked “?”'), b.x + b.w / 2, b.y + 28, C.accent, 'center', fnt(12.5, 700));
    if (kb && kb.focused()) {
      c.strokeStyle = C.accent; c.lineWidth = 1.5; c.setLineDash([5, 4]);
      D.roundRect(c, b.x + 2, b.y + 2, b.w - 4, b.h - 4, 7); c.stroke(); c.setLineDash([]);
    }
  }
  function seg(c, p, q) { const a = XY(p), b2 = XY(q); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b2[0], b2[1]); c.stroke(); }
  function fullLine(c, p, d) {
    const L = len(d); if (L < 1e-12) return;
    const u = mulv(d, 1 / L), far = 4 * Math.max(PR.w, PR.h) / viewCur.s;
    seg(c, add(p, mulv(u, -far)), add(p, mulv(u, far)));
  }
  function lbl(labels, p, text, col, pri, opts) { const q = XY(p); labels.push(Object.assign({ x: q[0], y: q[1], text: text, col: col, pri: pri || 0 }, opts || {})); }
  function placeLabels(c, labels) {
    const boxes = [];
    labels.sort(function (a, b2) { return b2.pri - a.pri; }).forEach(function (L) {
      c.font = L.font || fnt(11.5, 700);
      const w = c.measureText(L.text).width + 12, h = 18;
      const dx = L.dx || 0, dy = L.dy || 0;
      const cands = L.center ? [[-w / 2, -h / 2], [-w / 2, -h / 2 - 16], [-w / 2, -h / 2 + 16], [-w / 2 - 20, -h / 2], [-w / 2 + 20, -h / 2]]
        : [[10, -10 - h], [10, 8], [-10 - w, -10 - h], [-10 - w, 8], [-w / 2, -16 - h], [-w / 2, 14], [16, -h / 2], [-16 - w, -h / 2]];
      let pos = null;
      for (let k = 0; k < cands.length; k++) {
        const bx = L.x + dx + cands[k][0], by = L.y + dy + cands[k][1];
        if (bx < PR.x + 2 || by < PR.y + 2 || bx + w > PR.x + PR.w - 2 || by + h > PR.y + PR.h - 2) continue;
        if (boxes.some(function (o) { return bx < o.x + o.w && bx + w > o.x && by < o.y + o.h && by + h > o.y; })) continue;
        pos = { x: bx, y: by }; break;
      }
      if (!pos) {
        if (L.pri < 2) return;
        pos = { x: clampv(L.x + dx + 10, PR.x + 4, PR.x + PR.w - w - 4), y: clampv(L.y + dy - 10 - h, PR.y + 4, PR.y + PR.h - h - 4) };
      }
      boxes.push(D.pill(c, L.text, pos.x + w / 2, pos.y + h, L.col, 'center', L.font || fnt(11.5, 700)));
    });
  }
  /** 角 PVQ 的扇形記號；回傳放標籤的位置（畫素） */
  function angleArc(c, V, P, Q, col, rp, ccwFrom) {
    const v = XY(V), p = XY(P), q = XY(Q);
    const a1 = Math.atan2(p[1] - v[1], p[0] - v[0]), a2 = Math.atan2(q[1] - v[1], q[0] - v[0]);
    let d = a2 - a1;
    if (ccwFrom == null) { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; }
    else { // 指定方向（畫面座標 y 朝下：數學上的逆時針是負角）
      while (d > 0) d -= 2 * Math.PI;
      while (d <= -2 * Math.PI) d += 2 * Math.PI;
      if (!ccwFrom) d += 2 * Math.PI;
    }
    c.strokeStyle = alpha(col, 0.85); c.lineWidth = 1.7;
    c.fillStyle = alpha(col, D.dark ? 0.16 : 0.12);
    c.beginPath(); c.moveTo(v[0], v[1]); c.arc(v[0], v[1], rp, a1, a1 + d, d < 0); c.closePath(); c.fill();
    c.beginPath(); c.arc(v[0], v[1], rp, a1, a1 + d, d < 0); c.stroke();
    const m = a1 + d / 2;
    return [v[0] + Math.cos(m) * (rp + 16), v[1] + Math.sin(m) * (rp + 16)];
  }
  function rightMark(c, F, u, v, col) {
    const k = 9 / viewCur.s;
    const p1 = XY(add(F, mulv(u, k))), p3 = XY(add(F, mulv(v, k))), p2 = XY(add(add(F, mulv(u, k)), mulv(v, k)));
    c.strokeStyle = alpha(col, 0.85); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.lineTo(p3[0], p3[1]); c.stroke();
  }
  const unit = function (d) { const L = len(d) || 1; return [d[0] / L, d[1] / L]; };

  function drawCircle(c, R, labels) {
    const o = XY([0, 0]), rp = R * viewCur.s;
    const g = c.createRadialGradient(o[0] - rp * 0.3, o[1] - rp * 0.35, rp * 0.1, o[0], o[1], rp);
    g.addColorStop(0, alpha(C['ia-c'], D.dark ? 0.12 : 0.07));
    g.addColorStop(1, alpha(C['ia-c'], D.dark ? 0.04 : 0.02));
    c.beginPath(); c.arc(o[0], o[1], rp, 0, Math.PI * 2); c.fillStyle = g; c.fill();
    c.strokeStyle = alpha(C['ia-c'], 0.9); c.lineWidth = 2.4; c.stroke();
    D.ball(c, o[0], o[1], 4, C['ia-c'], { glow: 0 });
    lbl(labels, [0, 0], 'O', C['ia-c'], 3, { font: fnt(12, 800) });
  }
  /** 圓上一段弧（從角度 t0 逆時針走 span 度）加粗標示 */
  function arcOnCircle(c, R, t0, span, col, w) {
    const o = XY([0, 0]), rp = R * viewCur.s;
    c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round';
    c.beginPath(); c.arc(o[0], o[1], rp, -t0 * M.D2R, -(t0 + span) * M.D2R, true); c.stroke();
    c.lineCap = 'butt';
  }
  /** 圓上點的標籤放在圓外 */
  function ptLabel(labels, R, t, text, col, pri) {
    const k = 1 + 20 / (R * viewCur.s);
    lbl(labels, M.pt(R * k, t), text, col, pri == null ? 5 : pri, { center: true, font: fnt(13, 800) });
  }
  function dot(c, p, col, r, glow) { D.ball(c, X(p[0]), Y(p[1]), r || 7, col, { glow: glow == null ? 0.3 : glow }); }

  function drawIns(c, labels) {
    const cur = current(), R = state.R, s = state.ins, r = cur.r;
    drawCircle(c, R, labels);
    if (!r.ok) {
      ['A', 'B', 'P'].forEach(function (k) { dot(c, M.pt(R, s[k]), k === 'P' ? C['ia-a'] : C['ia-c']); ptLabel(labels, R, s[k], k, C['ia-c']); });
      return;
    }
    // 所對的弧
    const from = r.side === 1 ? s.B : s.A;
    arcOnCircle(c, R, from, r.arc, alpha(C['ia-a'], 0.45), 7);
    // 弦 AB
    c.strokeStyle = alpha(C['ia-c'], 0.7); c.lineWidth = 1.6; seg(c, r.A, r.B);
    // 圓心角
    if (state.showCen) {
      c.strokeStyle = alpha(C['ia-o'], 0.85); c.lineWidth = 1.8; seg(c, [0, 0], r.A); seg(c, [0, 0], r.B);
      const rp = clampv(R * viewCur.s * 0.2, 16, 30);
      const at = angleArc(c, [0, 0], M.pt(R, from), M.pt(R, from + r.arc), C['ia-o'], rp, true);
      labels.push({ x: at[0], y: at[1], text: deg(r.arc, 1), col: C['ia-o'], pri: 3, center: true, font: fnt(11, 700) });
    }
    // P′
    if (state.showP2 && cur.r2 && cur.r2.ok) {
      const r2 = cur.r2, col2 = alpha(C['ia-a'], 0.55);
      c.strokeStyle = col2; c.lineWidth = 1.6; c.setLineDash([6, 4]); seg(c, r2.P, r2.A); seg(c, r2.P, r2.B); c.setLineDash([]);
      const at = angleArc(c, r2.P, r2.A, r2.B, alpha(C['ia-a'], 0.7), clampv(R * viewCur.s * 0.13, 13, 22));
      labels.push({ x: at[0], y: at[1], text: deg(r2.ins, 1), col: alpha(C['ia-a'], 0.8), pri: 2, center: true, font: fnt(10.5, 700) });
    }
    // 圓周角
    c.strokeStyle = alpha(C['ia-a'], 0.95); c.lineWidth = 2.4; c.lineJoin = 'round';
    c.beginPath(); const pa = XY(r.A), pp = XY(r.P), pb = XY(r.B); c.moveTo(pa[0], pa[1]); c.lineTo(pp[0], pp[1]); c.lineTo(pb[0], pb[1]); c.stroke();
    const at = angleArc(c, r.P, r.A, r.B, C['ia-a'], clampv(R * viewCur.s * 0.15, 15, 26));
    labels.push({ x: at[0], y: at[1], text: deg(r.ins, 1), col: C['ia-a'], pri: 4, center: true, font: fnt(11.5, 800) });
    // 點
    const dragK = state.drag && state.drag.k;
    dot(c, r.A, C['ia-c'], 7, dragK === 'A' ? 0.65 : 0.3); dot(c, r.B, C['ia-c'], 7, dragK === 'B' ? 0.65 : 0.3);
    dot(c, r.P, C['ia-a'], 8, dragK === 'P' ? 0.7 : 0.4);
    ptLabel(labels, R, s.A, 'A', C['ia-c']); ptLabel(labels, R, s.B, 'B', C['ia-c']); ptLabel(labels, R, s.P, 'P', C['ia-a'], 6);
    if (state.showP2 && cur.r2 && cur.r2.ok) { dot(c, cur.r2.P, alpha(C['ia-a'], 0.75), 6.5, dragK === 'P2' ? 0.6 : 0.2); ptLabel(labels, R, s.P2, 'P′', C['ia-a']); }
    else if (state.showP2) { dot(c, M.pt(R, s.P2), alpha(C['ia-a'], 0.6), 6, 0); ptLabel(labels, R, s.P2, 'P′', C['ia-a']); }
  }

  function drawQuad(c, labels) {
    const cur = current(), R = state.R, q = cur.q, P = q.P, ts = state.quad;
    drawCircle(c, R, labels);
    const col = q.ok ? C['ia-q'] : C['ia-bad'];
    c.beginPath(); P.forEach(function (p, i) { const z = XY(p); if (i) c.lineTo(z[0], z[1]); else c.moveTo(z[0], z[1]); }); c.closePath();
    c.fillStyle = alpha(col, D.dark ? 0.16 : 0.1); c.fill();
    c.strokeStyle = alpha(col, 0.95); c.lineWidth = 2.4; c.lineJoin = 'round'; c.stroke();
    if (q.ok) {
      if (state.showDiag) {
        c.strokeStyle = alpha(C['ia-c'], 0.6); c.lineWidth = 1.4; c.setLineDash([6, 5]); seg(c, P[0], P[2]); seg(c, P[1], P[3]); c.setLineDash([]);
        if (q.X) {
          D.ball(c, X(q.X[0]), Y(q.X[1]), 3.5, C['ia-c'], { glow: 0 });
          if (Math.abs(q.diagAng - 90) <= 0.25) { const u = unit(sub(P[2], P[0])), v = unit(sub(P[3], P[1])); rightMark(c, q.X, u, v, C['ia-c']); }
        }
      }
      const cols = [C['ia-a'], C['ia-o'], C['ia-a'], C['ia-o']];
      const minSide = Math.min.apply(null, q.side), rp = clampv(minSide * viewCur.s * 0.18, 13, 24);
      for (let k = 0; k < 4; k++) {
        const at = angleArc(c, P[k], P[(k + 3) % 4], P[(k + 1) % 4], cols[k], rp);
        labels.push({ x: at[0], y: at[1], text: deg(q.ang[k], 1), col: cols[k], pri: 3, center: true, font: fnt(11, 800) });
      }
    }
    const dragK = state.drag && state.drag.k;
    'ABCD'.split('').forEach(function (k, i) { dot(c, P[i], C['ia-c'], 7, dragK === k ? 0.65 : 0.3); ptLabel(labels, R, ts[i], k, C['ia-c']); });
  }

  function drawPow(c, labels) {
    const cur = current(), R = state.R, Q = state.Q;
    drawCircle(c, R, labels);
    // 切線
    if (cur.T && state.showTan) {
      c.strokeStyle = alpha(C['ia-t'], 0.85); c.lineWidth = 2; c.setLineDash([7, 5]);
      cur.T.forEach(function (t) { seg(c, Q, t); });
      c.setLineDash([]);
      c.strokeStyle = alpha(C['ia-c'], 0.4); c.lineWidth = 1;
      cur.T.forEach(function (t) { seg(c, [0, 0], t); rightMark(c, t, unit(mulv(t, -1)), unit(sub(Q, t)), C['ia-t']); D.ball(c, X(t[0]), Y(t[1]), 4.5, C['ia-t'], { glow: 0 }); });
      lbl(labels, mid(Q, cur.T[0]), 'QT = ' + fmt(cur.QT, 3), C['ia-t'], 2, { center: true, font: fnt(11, 700) });
      lbl(labels, cur.T[0], 'T', C['ia-t'], 3, { font: fnt(12, 800) });
    }
    // 直線
    const lines = [[cur.L1, C['ia-l1'], 'A', 'B', state.th1]];
    if (cur.L2) lines.push([cur.L2, C['ia-l2'], 'C', 'D', state.th2]);
    lines.forEach(function (z) {
      const L = z[0], col = z[1];
      c.strokeStyle = alpha(col, 0.35); c.lineWidth = 1.3; fullLine(c, Q, L.u);
      if (L.n < 1) return;
      // QX、QY 兩段加粗（Q 在圓內時兩段方向相反，圓外時同向，長的那段畫淡一點）
      c.lineCap = 'round';
      c.strokeStyle = alpha(col, 0.95); c.lineWidth = 3; seg(c, Q, L.X);
      c.strokeStyle = alpha(col, cur.where === 'in' ? 0.95 : 0.45); c.lineWidth = cur.where === 'in' ? 3 : 5; seg(c, Q, L.Y);
      c.lineCap = 'butt';
      dot(c, L.X, col, 5.5, 0.2); if (L.n === 2) dot(c, L.Y, col, 5.5, 0.2);
      // 近的叫 A（C），遠的叫 B（D）
      const near = Math.abs(L.s[0]) <= Math.abs(L.s[1]) ? 0 : 1;
      const Pn = near === 0 ? L.X : L.Y, Pf = near === 0 ? L.Y : L.X;
      lbl(labels, Pn, z[2], col, 4, { font: fnt(12.5, 800) });
      if (L.n === 2) lbl(labels, Pf, z[3], col, 4, { font: fnt(12.5, 800) });
      lbl(labels, mid(Q, Pn), fmt(M.dist(Q, Pn), 2), col, 1, { center: true, font: fnt(10.5, 700) });
      if (L.n === 2 && cur.where === 'in') lbl(labels, mid(Q, Pf), fmt(M.dist(Q, Pf), 2), col, 1, { center: true, font: fnt(10.5, 700) });
    });
    // 圓心到 Q
    c.strokeStyle = alpha(C['ia-c'], 0.35); c.lineWidth = 1; c.setLineDash([3, 4]); seg(c, [0, 0], Q); c.setLineDash([]);
    const dragK = state.drag && state.drag.k;
    D.ball(c, X(Q[0]), Y(Q[1]), 8, C.accent, { glow: dragK === 'Q' ? 0.7 : 0.4 });
    lbl(labels, Q, 'Q', C.accent, 6, { font: fnt(13, 800) });
  }

  function drawChal(c, labels) {
    const ch0 = state.chal, g = ch0.g, F = ch0.F, R = F.R, done = ch0.done;
    const ansText = g.unit === 'deg' ? deg(g.answer, 2) : fmt(g.answer, 3);
    const qcol = done ? (ch0.right ? C['ia-ok'] : C['ia-bad']) : C.accent;
    const qtext = done ? ansText : '？';
    drawCircle(c, R, labels);
    if (g.type === 'ins' || g.type === 'cen') {
      const r = M.inscribed(R, F.a, F.b, F.p), from = r.side === 1 ? F.b : F.a;
      arcOnCircle(c, R, from, r.arc, alpha(C['ia-a'], 0.4), 6);
      c.strokeStyle = alpha(C['ia-c'], 0.6); c.lineWidth = 1.4; seg(c, r.A, r.B);
      c.strokeStyle = alpha(C['ia-o'], 0.85); c.lineWidth = 1.8; seg(c, [0, 0], r.A); seg(c, [0, 0], r.B);
      const at0 = angleArc(c, [0, 0], M.pt(R, from), M.pt(R, from + r.arc), C['ia-o'], clampv(R * viewCur.s * 0.2, 16, 30), true);
      c.strokeStyle = alpha(C['ia-a'], 0.95); c.lineWidth = 2.4; seg(c, r.P, r.A); seg(c, r.P, r.B);
      const at1 = angleArc(c, r.P, r.A, r.B, C['ia-a'], clampv(R * viewCur.s * 0.15, 15, 26));
      const L0 = g.type === 'cen' ? qtext : deg(g.given.cen, 1), L1 = g.type === 'ins' ? qtext : deg(g.given.ins, 2);
      labels.push({ x: at0[0], y: at0[1], text: L0, col: g.type === 'cen' ? qcol : C['ia-o'], pri: 6, center: true, font: fnt(12.5, 800) });
      labels.push({ x: at1[0], y: at1[1], text: L1, col: g.type === 'ins' ? qcol : C['ia-a'], pri: 6, center: true, font: fnt(12.5, 800) });
      dot(c, r.A, C['ia-c']); dot(c, r.B, C['ia-c']); dot(c, r.P, C['ia-a'], 8);
      ptLabel(labels, R, F.a, 'A', C['ia-c']); ptLabel(labels, R, F.b, 'B', C['ia-c']); ptLabel(labels, R, F.p, 'P', C['ia-a']);
      return;
    }
    if (g.type === 'quad') {
      const q = M.quad(R, F.ts), P = q.P;
      c.beginPath(); P.forEach(function (p, i) { const z = XY(p); if (i) c.lineTo(z[0], z[1]); else c.moveTo(z[0], z[1]); }); c.closePath();
      c.fillStyle = alpha(C['ia-q'], D.dark ? 0.16 : 0.1); c.fill(); c.strokeStyle = C['ia-q']; c.lineWidth = 2.4; c.stroke();
      const k = 'ABCD'.indexOf(g.given.v), j = 'ABCD'.indexOf(g.ask);
      const rp = clampv(Math.min.apply(null, q.side) * viewCur.s * 0.18, 13, 24);
      [[k, deg(g.given.ang, 2), C['ia-a']], [j, qtext, qcol]].forEach(function (z) {
        const at = angleArc(c, P[z[0]], P[(z[0] + 3) % 4], P[(z[0] + 1) % 4], z[2], rp);
        labels.push({ x: at[0], y: at[1], text: z[1], col: z[2], pri: 6, center: true, font: fnt(12.5, 800) });
      });
      'ABCD'.split('').forEach(function (n, i) { dot(c, P[i], C['ia-c']); ptLabel(labels, R, F.ts[i], n, C['ia-c']); });
      return;
    }
    // 長度題
    const Q = F.Q, G = g.given;
    const names = { A: G.QA, B: G.QB, C: G.QC, D: g.type === 'tangent' ? null : g.answer };
    F.lines.forEach(function (l, i) {
      const col = i ? C['ia-l2'] : C['ia-l1'];
      c.strokeStyle = alpha(col, 0.35); c.lineWidth = 1.2; fullLine(c, Q, sub(l.Y, Q));
      c.lineCap = 'round';
      c.strokeStyle = alpha(col, 0.95); c.lineWidth = 3; seg(c, Q, l.X);
      c.strokeStyle = alpha(col, g.type === 'chord' ? 0.95 : 0.45); c.lineWidth = g.type === 'chord' ? 3 : 5; seg(c, Q, l.Y);
      c.lineCap = 'butt';
      dot(c, l.X, col, 5.5, 0.2); dot(c, l.Y, col, 5.5, 0.2);
      lbl(labels, l.X, l.nx, col, 5, { font: fnt(12.5, 800) }); lbl(labels, l.Y, l.ny, col, 5, { font: fnt(12.5, 800) });
      [[l.nx, l.X], [l.ny, l.Y]].forEach(function (z) {
        const isAsk = z[0] === 'D';
        // 圓外：近的那段標在 Q 與近點中間，遠的標在近點與遠點中間（寫「QB = …」）
        const p = g.type === 'chord' ? mid(Q, z[1]) : (z[0] === l.nx ? mid(Q, z[1]) : mid(l.X, l.Y));
        const text = 'Q' + z[0] + ' = ' + (isAsk ? qtext : fmt(names[z[0]], 2));
        lbl(labels, p, text, isAsk ? qcol : col, isAsk ? 6 : 5, { center: true, font: fnt(11.5, 800) });
      });
    });
    if (F.T) {
      c.strokeStyle = alpha(C['ia-t'], 0.9); c.lineWidth = 2.6; seg(c, Q, F.T);
      c.strokeStyle = alpha(C['ia-c'], 0.4); c.lineWidth = 1; seg(c, [0, 0], F.T);
      rightMark(c, F.T, unit(mulv(F.T, -1)), unit(sub(Q, F.T)), C['ia-t']);
      dot(c, F.T, C['ia-t'], 5.5, 0.2);
      lbl(labels, F.T, 'T', C['ia-t'], 5, { font: fnt(12.5, 800) });
      lbl(labels, mid(Q, F.T), 'QT = ' + qtext, qcol, 6, { center: true, font: fnt(11.5, 800) });
    }
    D.ball(c, X(Q[0]), Y(Q[1]), 7.5, C.accent, { glow: 0.4 });
    lbl(labels, Q, 'Q', C.accent, 6, { font: fnt(13, 800) });
  }

  // ---------- 讀數 ----------
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  let eqKey = null;
  function rows(list) { return list.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join(''); }
  function updateReadouts() {
    const cur = current();
    let tex;
    const n = function (v, d) { return fmt(v, d == null ? 3 : d).replace(/−/g, '-'); };
    if (state.chal) {
      setHTML('readout', rows([[T('挑戰中', 'Challenge'), T('讀數先藏起來', 'readings hidden')]]));
      tex = '\\text{' + T('用定理算出「？」', 'Use a theorem to find “?”') + '}';
    } else if (state.mode === 'ins') {
      const r = cur.r;
      if (!r.ok) {
        setHTML('readout', rows([[T('圓周角', 'Inscribed angle'), T('有兩個點重合', 'two points coincide')]]));
        tex = '\\text{' + T('A、B、P 要是三個不同的點', 'A, B and P must be three different points') + '}';
      } else {
        const L = [
          [T('圓周角 ∠APB', 'Inscribed angle ∠APB'), deg(r.ins, 2)],
          [T('圓心角 ∠AOB（所對的弧）', 'Central angle ∠AOB (its arc)'), deg(r.arc, 2) + (r.arc > 180 ? T('（優角）', ' (reflex)') : '')],
          [T('弧長、弦長 AB', 'Arc and chord AB'), fmt(state.R * r.arc * M.D2R, 3) + T('、', ', ') + fmt(r.chord, 3)]
        ];
        if (state.showP2 && cur.r2) L.push([T('∠AP′B', '∠AP′B'), cur.r2.ok ? deg(cur.r2.ins, 2) + (cur.r2.side !== r.side ? T('（另一側：互補）', ' (other side: supplementary)') : T('（同一側：相等）', ' (same side: equal)')) : '—']);
        setHTML('readout', rows(L));
        tex = '\\begin{gathered}\\angle APB = \\tfrac12\\,\\angle AOB\\\\ ' + n(r.ins, 2) + '^\\circ = \\tfrac12\\times ' + n(r.arc, 2) + '^\\circ\\end{gathered}';
      }
    } else if (state.mode === 'quad') {
      const q = cur.q;
      if (!q.ok) {
        setHTML('readout', rows([[T('四邊形', 'Quadrilateral'), T('A、B、C、D 沒有依序繞圓', 'A, B, C, D are not in order round the circle')]]));
        tex = '\\text{' + T('四點要依序排在圓上', 'Put the four points in order round the circle') + '}';
      } else {
        setHTML('readout', rows([
          [T('∠A、∠B、∠C、∠D', '∠A, ∠B, ∠C, ∠D'), q.ang.map(function (a) { return deg(a, 1); }).join(T('、', ', '))],
          [T('∠A + ∠C、∠B + ∠D', '∠A + ∠C, ∠B + ∠D'), deg(q.ang[0] + q.ang[2], 2) + T('、', ', ') + deg(q.ang[1] + q.ang[3], 2)],
          [T('對角線夾角', 'Angle between diagonals'), deg(Math.min(q.diagAng, 180 - q.diagAng), 2)],
          ['AC·BD', fmt(q.diag[0] * q.diag[1], 3)],
          ['AB·CD + AD·BC', fmt(q.side[0] * q.side[2] + q.side[1] * q.side[3], 3)]
        ]));
        tex = '\\begin{gathered}\\angle A + \\angle C = ' + n(q.ang[0], 2) + '^\\circ + ' + n(q.ang[2], 2) + '^\\circ = 180^\\circ\\\\ \\angle B + \\angle D = ' + n(q.ang[1], 2) + '^\\circ + ' + n(q.ang[3], 2) + '^\\circ = 180^\\circ\\end{gathered}';
      }
    } else {
      const W = { in: T('圓內', 'inside'), on: T('圓上', 'on the circle'), out: T('圓外', 'outside') }[cur.where];
      const L = [
        [T('OQ（Q 在', 'OQ (Q is ') + W + T('）', ')'), fmt(cur.OQ, 3)],
        [T('圓冪 OQ<sup>2</sup> − R<sup>2</sup>', 'Power OQ<sup>2</sup> − R<sup>2</sup>'), fmt(cur.pw, 3)]
      ];
      const lineRow = function (Lc, a, b) {
        if (Lc.n < 1) return [T('第', 'Line ') + (a === 'A' ? T('一', '1') : T('二', '2')) + T('條線', ''), T('和圓不相交', 'misses the circle')];
        const near = Math.min(Math.abs(Lc.s[0]), Math.abs(Lc.s[1])), far = Math.max(Math.abs(Lc.s[0]), Math.abs(Lc.s[1]));
        return ['Q' + a + T('、', ', ') + 'Q' + b + T('、', ', ') + 'Q' + a + '·Q' + b, fmt(near, 3) + T('、', ', ') + fmt(far, 3) + T('、', ', ') + fmt(near * far, 3)];
      };
      L.push(lineRow(cur.L1, 'A', 'B'));
      if (cur.L2) L.push(lineRow(cur.L2, 'C', 'D'));
      if (cur.where === 'out') L.push([T('切線長 QT、QT<sup>2</sup>', 'Tangent QT, QT<sup>2</sup>'), fmt(cur.QT, 3) + T('、', ', ') + fmt(cur.pw, 3)]);
      setHTML('readout', rows(L));
      const pr = cur.L1.n >= 1 ? n(Math.min(Math.abs(cur.L1.s[0]), Math.abs(cur.L1.s[1]))) + '\\times ' + n(Math.max(Math.abs(cur.L1.s[0]), Math.abs(cur.L1.s[1]))) : '';
      tex = '\\begin{gathered}QA\\cdot QB = \\left|OQ^2 - R^2\\right|\\\\ ' + (pr ? pr + ' = ' : '') + '\\left|' + n(cur.OQ * cur.OQ) + ' - ' + n(state.R * state.R) + '\\right| = ' + n(Math.abs(cur.pw)) + '\\end{gathered}';
    }
    const k2 = tex + (window.LabSettings ? LabSettings.get('lang') : '');
    if (eqKey !== k2) {
      eqKey = k2;
      const el = $('rEq');
      if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); } catch (e) { el.textContent = tex; } }
      else el.textContent = tex;
    }
  }
  function modeNote() {
    const N = {
      ins: ['A、B、P 都在圓上。∠APB 只由「不含 P 的那段弧」決定，是那段弧所對圓心角的一半。', 'A, B and P are on the circle. ∠APB depends only on the arc not containing P: it is half of that arc’s central angle.'],
      quad: ['四個點依序排在圓上。對角加起來都是 180°，對角線乘積等於兩組對邊乘積的和（托勒密）。', 'Four points in order round the circle. Opposite angles add to 180°, and the product of the diagonals is the sum of the products of opposite sides (Ptolemy).'],
      pow: ['過 Q 的每一條線被圓截出兩段，兩段相乘都等於 |OQ<sup>2</sup> − R<sup>2</sup>|。', 'Every line through Q is cut by the circle into two pieces whose product is |OQ<sup>2</sup> − R<sup>2</sup>|.']
    }[state.mode];
    $('modeNote').innerHTML = T(N[0], N[1]);
    $('dragNote').textContent = state.mode === 'pow'
      ? T('在圖上拖 Q；用滑桿轉兩條線。', 'Drag Q on the picture; turn the lines with the sliders.')
      : T('沿著圓拖曳點（每次 0.5°）；點一下畫布上的焦點，再用方向鍵每次移 0.1°。', 'Drag the points along the circle (0.5° steps); focus the canvas and use the arrow keys for 0.1° steps.');
  }
  function legend() {
    const it = function (col, zh, en) { return '<span><i class="dot" style="background:var(' + col + ')"></i>' + T(zh, en) + '</span>'; };
    const L = {
      ins: [['--ia-a', '圓周角', 'inscribed angle'], ['--ia-o', '圓心角', 'central angle']],
      quad: [['--ia-a', '∠A、∠C', '∠A, ∠C'], ['--ia-o', '∠B、∠D', '∠B, ∠D'], ['--ia-q', '四邊形', 'quadrilateral']],
      pow: [['--ia-l1', '第一條線', 'line 1'], ['--ia-l2', '第二條線', 'line 2'], ['--ia-t', '切線', 'tangent']]
    }[state.chal ? (state.chal.g.unit === 'deg' ? (state.chal.g.type === 'quad' ? 'quad' : 'ins') : 'pow') : state.mode];
    setHTML('legend', L.map(function (z) { return it(z[0], z[1], z[2]); }).join(''));
  }

  // ---------- 狀態列 ----------
  function setStatus(t) { $('status').innerHTML = t || ''; }
  function describe() {
    if (state.chal) return;
    const cur = current();
    let msg;
    if (state.mode === 'ins') {
      const r = cur.r;
      if (!r.ok) msg = T('有兩個點重合了，拖開一點。', 'Two points coincide: drag them apart.');
      else {
        msg = Math.abs(r.ins - 90) < 1e-6 ? T('AB 是直徑：圓周角是直角。', 'AB is a diameter: the inscribed angle is a right angle.')
          : r.ins > 90 ? T('P 在短弧上：圓周角是鈍角，圓心角是優角。', 'P is on the short arc: the inscribed angle is obtuse and the central angle reflex.')
            : T('P 在長弧上：圓周角是銳角。', 'P is on the long arc: the inscribed angle is acute.');
        if (state.pRun && state.pRun.hi - state.pRun.lo > 1e-9) msg += T(' P 沿弧走了 ', ' P has travelled ') + fmt(state.pRun.hi - state.pRun.lo, 1) + T('°，角度沒變。', '° along the arc; the angle did not change.');
      }
    } else if (state.mode === 'quad') {
      const q = cur.q;
      if (!q.ok) msg = T('四點的順序交叉了：A、B、C、D 要依序繞圓一圈。', 'The order is crossed: A, B, C, D must go round the circle in order.');
      else msg = T('對角互補：∠A + ∠C = ∠B + ∠D = 180°。', 'Opposite angles are supplementary: ∠A + ∠C = ∠B + ∠D = 180°.');
    } else {
      msg = cur.where === 'in' ? T('Q 在圓內：相交弦，QA·QB = R<sup>2</sup> − OQ<sup>2</sup>。', 'Q is inside: intersecting chords, QA · QB = R<sup>2</sup> − OQ<sup>2</sup>.')
        : cur.where === 'on' ? T('Q 在圓上：圓冪是 0。', 'Q is on the circle: its power is 0.')
          : T('Q 在圓外：割線，QA·QB = OQ<sup>2</sup> − R<sup>2</sup> = QT<sup>2</sup>。', 'Q is outside: secants, QA · QB = OQ<sup>2</sup> − R<sup>2</sup> = QT<sup>2</sup>.');
    }
    setStatus(msg.charAt(0).toUpperCase() + msg.slice(1));
  }

  // ---------- 控制項 ----------
  const lab = $('lab');
  function showPanels() {
    document.querySelectorAll('#modes button').forEach(function (b) { b.setAttribute('aria-pressed', String(!state.chal && b.getAttribute('data-mode') === state.mode)); });
    const m = state.mode;
    $('powCtl').hidden = m !== 'pow';
    $('lCen').hidden = m !== 'ins'; $('lP2').hidden = m !== 'ins';
    $('lDiag').hidden = m !== 'quad';
    $('l2').hidden = m !== 'pow'; $('lTan').hidden = m !== 'pow';
    lab.setAttribute('data-mode', m);
    modeNote(); legend();
  }
  function refresh() { cache = null; refreshOutputs(); updateReadouts(); describe(); legend(); requestDraw(); }
  let lastKind = null;
  function kindOf() {
    const cur = current();
    if (state.mode === 'ins') return cur.r.ok ? (Math.abs(cur.r.ins - 90) < 1e-6 ? 'right' : cur.r.ins > 90 ? 'obtuse' : 'acute') : 'none';
    if (state.mode === 'quad') return cur.q.ok ? (Math.abs(cur.q.diagAng - 90) <= 0.25 ? 'perp' : 'ok') : 'none';
    return cur.where + (cur.L1.n === 1 ? 't' : '');
  }
  function soundCheck() {
    const k = state.mode + kindOf();
    if (lastKind !== null && k !== lastKind) blip(/right|perp|t$/.test(k) ? 784 : /none/.test(k) ? 220 : 523, /none/.test(k) ? 'triangle' : 'sine', 0.12);
    lastKind = k;
  }
  function edited(src) { refresh(); soundCheck(); emitState(src); }
  document.querySelectorAll('#modes button').forEach(function (b) {
    b.addEventListener('click', function () {
      const m = b.getAttribute('data-mode');
      if (state.chal) { if (state.chal.done) endReview(); else quitChal(true); }
      state.mode = m; state.pRun = null; viewCur = null;
      showPanels(); blip(523, 'sine', 0.1);
      edited('mode');
    });
  });
  ['showCen', 'showP2', 'showDiag', 'show2', 'showTan'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      state[id] = $(id).checked;
      edited('check');
    });
  });
  // 滑桿
  let applying = false;
  const sliders = { R: $('rad'), th1: $('th1'), th2: $('th2') };
  function refreshOutputs() {
    $('rado').textContent = fmt(state.R, 2);
    $('th1o').textContent = fmt(state.th1, 1) + '°';
    $('th2o').textContent = fmt(state.th2, 1) + '°';
  }
  Object.keys(sliders).forEach(function (k) {
    const e = sliders[k];
    e.addEventListener('input', function () { if (applying) return; state[k] = val(e); if (k === 'R') viewCur = null; refresh(); soundCheck(); });
    e.addEventListener('change', function () { if (applying) return; state[k] = val(e); edited('slider'); });
  });

  // ---------- 移動點 ----------
  /** P 沿著弧走：A、B 不動、P 留在同一側時累計走過的範圍（從 A 逆時針量） */
  function trackP(prevP) {
    const s = state.ins, R0 = state.pRun;
    const r = M.inscribed(state.R, s.A, s.B, s.P);
    if (!r.ok) { state.pRun = null; return; }
    const u = M.ccw(s.A, s.P);
    if (R0 && R0.A === s.A && R0.B === s.B && R0.side === r.side) { R0.lo = Math.min(R0.lo, u); R0.hi = Math.max(R0.hi, u); return; }
    const r0 = M.inscribed(state.R, s.A, s.B, prevP);
    if (r0.ok && r0.side === r.side) { const u0 = M.ccw(s.A, prevP); state.pRun = { A: s.A, B: s.B, side: r.side, lo: Math.min(u0, u), hi: Math.max(u0, u) }; }
    else state.pRun = { A: s.A, B: s.B, side: r.side, lo: u, hi: u };
  }
  function setAngle(k, t) {
    t = r6(M.norm360(Math.round(t * 10) / 10));
    if (state.mode === 'quad') { const i = 'ABCD'.indexOf(k); if (state.quad[i] === t) return false; state.quad = state.quad.slice(); state.quad[i] = t; }
    else {
      if (state.ins[k] === t) return false;
      const prevP = state.ins.P;
      state.ins = Object.assign({}, state.ins); state.ins[k] = t;
      if (k === 'P') trackP(prevP); else if (k !== 'P2') state.pRun = null;
    }
    cache = null;
    return true;
  }
  function snapAngle(t) {
    t = M.norm360(t);
    const f = Math.round(t / 5) * 5;
    if (Math.abs(f - t) <= 1) return M.norm360(f);
    return M.norm360(Math.round(t * 2) / 2);
  }
  function snapPt(x, y, pxTol) {
    const tol = pxTol / viewCur.s;
    const hx = Math.round(x * 2) / 2, hy = Math.round(y * 2) / 2;
    if (Math.hypot(hx - x, hy - y) < tol) return [hx, hy];
    return [r6(Math.round(x * 20) / 20), r6(Math.round(y * 20) / 20)];
  }
  const QLIM = 30;
  function setQ(p) { const np = [clampv(p[0], -QLIM, QLIM), clampv(p[1], -QLIM, QLIM)]; if (np[0] === state.Q[0] && np[1] === state.Q[1]) return false; state.Q = np; cache = null; return true; }
  function activeNames() { return state.mode === 'pow' ? ['Q'] : state.mode === 'quad' ? NAMES.quad : (state.showP2 ? NAMES.ins : ['A', 'B', 'P']); }
  function screenOf(k) { return k === 'Q' ? XY(state.Q) : XY(M.pt(state.R, posOf(k))); }

  // ---------- 記下、全部清除 ----------
  function renderLog() {
    const t = $('log');
    if (!state.log.length) { t.innerHTML = ''; $('logEmpty').hidden = false; return; }
    $('logEmpty').hidden = true;
    let h = '<thead><tr><th>#</th><th>' + T('模式', 'Mode') + '</th><th>' + T('量', 'Measured') + '</th><th>' + T('定理的另一邊', 'Theorem gives') + '</th></tr></thead><tbody>';
    state.log.forEach(function (r, i) { h += '<tr><td>' + (i + 1) + '</td><td>' + r.join('</td><td>') + '</td></tr>'; });
    t.innerHTML = h + '</tbody>';
  }
  $('mark').addEventListener('click', function () {
    if (state.chal) { setStatus(T('挑戰中先不記錄。', 'Not during a challenge.')); return; }
    const cur = current();
    let row = null;
    if (state.mode === 'ins' && cur.r.ok) row = [T('圓周角', 'Inscribed'), '∠APB = ' + deg(cur.r.ins, 2), '½∠AOB = ' + deg(cur.r.arc / 2, 2)];
    else if (state.mode === 'quad' && cur.q.ok) row = [T('四邊形', 'Cyclic'), '∠A + ∠C = ' + deg(cur.q.ang[0] + cur.q.ang[2], 2), '∠B + ∠D = ' + deg(cur.q.ang[1] + cur.q.ang[3], 2)];
    else if (state.mode === 'pow' && cur.L1.n >= 1) row = [T('圓冪', 'Power'), 'QA·QB = ' + fmt(cur.L1.prod, 3), '|OQ<sup>2</sup> − R<sup>2</sup>| = ' + fmt(Math.abs(cur.pw), 3)];
    if (!row) { setStatus(T('現在沒有可以記的量。', 'Nothing to record right now.')); return; }
    state.log.push(row);
    if (state.log.length > 40) state.log.shift();
    renderLog(); blip(659, 'sine', 0.1);
    setStatus(T('記下第 ', 'Recorded #') + state.log.length + T(' 組。', '.'));
  });
  $('clear').addEventListener('click', function () {
    state.log = []; renderLog();
    state.pRun = null;
    if (state.chal) { if (state.chal.done) endReview(); else quitChal(true); }
    state.streak = 0; state.times = []; state.round = 0;
    setChalMsg(''); $('newChal').textContent = T('出一題', 'New problem');
    blip(330); refresh();
    setStatus(T('記錄與挑戰都清除了；圖形保留。', 'Records and the challenge are cleared; the figure is kept.'));
  });

  // ---------- 畫布操作 ----------
  function evPos(ev) { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  function hitTest(p) {
    if (!viewCur || state.chal) return null;
    let best = null, bd = 22;
    activeNames().forEach(function (k) { const q = screenOf(k), d = Math.hypot(p.x - q[0], p.y - q[1]); if (d < bd) { bd = d; best = k; } });
    return best;
  }
  function moveTo(k, x, y, pxTol) {
    if (k === 'Q') { const s = snapPt(x, y, pxTol); return setQ(s); }
    return setAngle(k, snapAngle(Math.atan2(y, x) / M.D2R));
  }
  let downAt = null;
  cv.addEventListener('pointerdown', function (ev) {
    if (!viewCur) return;
    const p = evPos(ev), h = hitTest(p);
    downAt = { x: p.x, y: p.y };
    if (h) {
      state.drag = { k: h, moved: false };
      try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 無妨 */ }
      ev.preventDefault(); requestDraw();
    }
  });
  cv.addEventListener('pointermove', function (ev) {
    const p = evPos(ev);
    if (!state.drag) { cv.style.cursor = hitTest(p) ? 'grab' : (state.chal ? 'default' : 'crosshair'); return; }
    if (!state.drag.moved && downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) < 4) return;
    state.drag.moved = true;
    if (moveTo(state.drag.k, invX(p.x), invY(p.y), 10)) { refresh(); soundCheck(); }
  });
  function endDrag(ev) {
    const dr = state.drag, down = downAt;
    state.drag = null; downAt = null;
    if (!dr) {
      if (ev && ev.type === 'pointerup' && down && viewCur && !state.chal) {
        const p = evPos(ev);
        if (Math.hypot(p.x - down.x, p.y - down.y) < 6) {
          const x = invX(p.x), y = invY(p.y);
          let k = 'Q';
          if (state.mode !== 'pow') {
            // 最靠近點擊方向的點移過去
            const t = Math.atan2(y, x) / M.D2R;
            let bd = Infinity;
            activeNames().forEach(function (n) { const d = Math.min(M.ccw(posOf(n), t), M.ccw(t, posOf(n))); if (d < bd) { bd = d; k = n; } });
          }
          moveTo(k, x, y, 12);
          blip(494, 'sine', 0.08);
          edited('tap');
        }
      }
      return;
    }
    if (dr.moved) { blip(494, 'sine', 0.08); edited('drag'); }
    else requestDraw();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // ---------- 鍵盤：四個位置，依模式對應到 A、B、P、P′／A、B、C、D／Q ----------
  let kb = null;
  function slotName(i) { const L = activeNames(); return L[i % L.length]; }
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('圓周角畫布。Enter 切換要移動的點，方向鍵沿圓移動 0.1°（Shift 1°）；圓冪模式移動 Q 0.1（Shift 0.5）。', 'Circle canvas. Enter switches the point to move; arrow keys move it 0.1° along the circle (Shift: 1°); in Power of a point they move Q by 0.1 (Shift: 0.5).'),
      items: [0, 1, 2, 3].map(function (i) {
        return {
          name: function () { return T('點 ', 'point ') + SHOWN(slotName(i)); },
          move: function (dx, dy, big) {
            if (state.chal) return false;
            const k = slotName(i);
            let ch2;
            if (k === 'Q') { const st = big ? 0.5 : 0.1; ch2 = setQ([r6(Math.round((state.Q[0] + dx * st) * 1e4) / 1e4), r6(Math.round((state.Q[1] + dy * st) * 1e4) / 1e4)]); }
            else { const dir = dx + dy > 0 ? 1 : -1; ch2 = setAngle(k, posOf(k) + dir * (big ? 1 : 0.1)); }
            if (!ch2) return false;
            blip(494, 'sine', 0.08); edited('key'); return true;
          },
          describe: function () {
            const k = slotName(i);
            if (k === 'Q') return 'Q = (' + fmt(state.Q[0], 2) + ', ' + fmt(state.Q[1], 2) + T(')，圓冪 ', '), power ') + fmt(current().pw, 3);
            const cur = current();
            let extra = '';
            if (state.mode === 'ins' && cur.r.ok) extra = T('，∠APB = ', ', ∠APB = ') + deg(cur.r.ins, 2);
            if (state.mode === 'quad' && cur.q.ok) extra = T('，∠A + ∠C = ', ', ∠A + ∠C = ') + deg(cur.q.ang[0] + cur.q.ang[2], 2);
            return SHOWN(k) + T(' 在 ', ' at ') + deg(posOf(k), 1) + extra;
          }
        };
      }),
      onChange: function () { requestDraw(); }
    });
  }

  // ---------- 挑戰 ----------
  const chalMsg = $('chalMsg');
  function setChalMsg(msg, cls) { chalMsg.textContent = msg || ''; chalMsg.classList.toggle('ok', cls === 'ok'); chalMsg.classList.toggle('bad', cls === 'bad'); }
  function askText(g) {
    const G = g.given;
    if (g.type === 'ins') return T('圓心角 ∠AOB = ', 'The central angle ∠AOB = ') + deg(G.cen, 0) + T('，求圓周角 ∠APB（度）。', '. Find the inscribed angle ∠APB in degrees.');
    if (g.type === 'cen') return T('圓周角 ∠APB = ', 'The inscribed angle ∠APB = ') + deg(G.ins, 2) + T('，求圓心角 ∠AOB（度）。', '. Find the central angle ∠AOB in degrees.');
    if (g.type === 'quad') return T('圓內接四邊形 ABCD 中 ∠', 'In the cyclic quadrilateral ABCD, ∠') + G.v + ' = ' + deg(G.ang, 2) + T('，求 ∠', '. Find ∠') + g.ask + T('（度）。', ' in degrees.');
    if (g.type === 'chord') return T('弦 AB、CD 交於 Q：QA = ', 'Chords AB and CD meet at Q: QA = ') + fmt(G.QA, 2) + T('，QB = ', ', QB = ') + fmt(G.QB, 2) + T('，QC = ', ', QC = ') + fmt(G.QC, 2) + T('，求 QD。', '. Find QD.');
    if (g.type === 'secant') return T('從 Q 畫兩條割線：QA = ', 'Two secants from Q: QA = ') + fmt(G.QA, 2) + T('，QB = ', ', QB = ') + fmt(G.QB, 2) + T('，QC = ', ', QC = ') + fmt(G.QC, 2) + T('，求 QD。', '. Find QD.');
    return T('從 Q 畫割線與切線：QA = ', 'A secant and a tangent from Q: QA = ') + fmt(G.QA, 2) + T('，QB = ', ', QB = ') + fmt(G.QB, 2) + T('，求切線長 QT。', '. Find the tangent length QT.');
  }
  function startChal() {
    const g = M.challenge(rand);
    const F = g.unit === 'deg' ? (g.type === 'quad' ? { R: g.fig.R, ts: g.fig.ts } : { R: g.fig.R, a: g.fig.a, b: g.fig.b, p: g.fig.p }) : M.chalFig(g);
    state.chal = { g: g, F: F, t0: performance.now() };
    state.round++;
    cache = null; viewCur = null;
    showPanels();
    $('ansRow').hidden = false; $('quitChal').hidden = false; $('ans').value = '';
    $('newChal').textContent = T('換一題', 'Another one');
    setChalMsg(T('第 ', 'Problem ') + state.round + T(' 題：', ': ') + askText(g));
    setStatus('');
    blip(523);
    refresh();
  }
  function quitChal(silent) {
    if (!state.chal) return;
    state.chal = null; state.streak = 0; state.times = [];
    $('ansRow').hidden = true; $('quitChal').hidden = true;
    $('newChal').textContent = T('出一題', 'New problem');
    setChalMsg(silent ? '' : T('放棄這題，連續答對中斷。', 'Gave up: the streak is broken.'));
    cache = null; viewCur = null;
    showPanels(); refresh();
  }
  $('newChal').addEventListener('click', function () { if (state.chal && !state.chal.done) { state.streak = 0; state.times = []; } startChal(); });
  function endReview() {
    state.chal = null;
    $('ansRow').hidden = true; $('quitChal').hidden = true;
    cache = null; viewCur = null;
  }
  $('quitChal').addEventListener('click', function () { quitChal(false); });
  function parseAns(s) {
    s = String(s || '').replace(/[°度\s]/g, '').replace(/，/g, '.').replace(/,/g, '.').replace(/[−–]/g, '-');
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    return parseFloat(s);
  }
  function submit() {
    if (!state.chal || state.chal.done) return;
    const v = parseAns($('ans').value);
    if (!isFinite(v)) { setChalMsg(T('請輸入一個數字。', 'Please type a number.'), 'bad'); return; }
    const g = state.chal.g, secs = (performance.now() - state.chal.t0) / 1000;
    const right = M.answerOK(v, g);
    const ansText = g.unit === 'deg' ? deg(g.answer, 2) : fmt(g.answer, 3);
    if (right) {
      state.streak++; state.times.push(secs); if (state.times.length > 10) state.times.shift();
      setChalMsg(T('答對了！答案是 ', 'Correct! The answer is ') + ansText + T('，用了 ', ', in ') + secs.toFixed(1) + T(' 秒，連續答對 ', ' s. Streak: ') + state.streak + T(' 題。', '.'), 'ok');
      chime();
    } else {
      state.streak = 0; state.times = [];
      setChalMsg(T('不對：答案是 ', 'Not quite: the answer is ') + ansText + T('（你答 ', ' (you said ') + fmt(v, 3) + T('）。', ').'), 'bad');
      blip(220, 'triangle', 0.14);
    }
    const last10 = state.streak >= 10 ? state.times.slice(-10).reduce(function (s, x) { return s + x; }, 0) : NaN;
    emit('guess', { correct: right, streak: state.streak, secs: secs, last10: last10, type: g.type });
    state.chal.done = true; state.chal.right = right;
    $('ansRow').hidden = true; $('quitChal').hidden = true;
    $('newChal').textContent = T('出下一題', 'Next problem');
    cache = null;
    showPanels(); refresh();
  }
  $('answer').addEventListener('click', submit);
  $('ans').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });

  // ---------- 音效 ----------
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function blip(freq, type, gain) { const S = sound(); if (S) S.tone({ freq: freq, dur: 0.08, type: type || 'triangle', gain: gain || 0.14 }); }
  function chime() {
    const S = sound(); if (!S) return;
    S.tone({ freq: 659.25, dur: 0.16, type: 'sine', gain: 0.22 });
    S.tone({ freq: 880, dur: 0.22, type: 'sine', gain: 0.18, delay: 0.09 });
    S.tone({ freq: 1318.5, dur: 0.12, type: 'sine', gain: 0.06, delay: 0.1 });
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 任務模式（missions.js）：回報數學量 ----------
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  /** 一條線的量：交點數、圓心距、弦長、近段、遠段 */
  function lineData(L) {
    if (!L) return null;
    if (L.n < 1) return { n: 0, d: L.d };
    return { n: L.n, d: L.d, chord: L.chord, near: Math.min(Math.abs(L.s[0]), Math.abs(L.s[1])), far: Math.max(Math.abs(L.s[0]), Math.abs(L.s[1])) };
  }
  function stateData(src) {
    const cur = current(), R = state.R;
    const o = { src: src, mode: state.mode, R: R };
    if (state.mode === 'ins') {
      const r = cur.r, s = state.ins;
      Object.assign(o, { a: s.A, b: s.B, p: s.P, insOK: r.ok, showCen: state.showCen, showP2: state.showP2, pSpan: state.pRun ? state.pRun.hi - state.pRun.lo : 0 });
      if (r.ok) Object.assign(o, { ins: r.ins, arc: r.arc, side: r.side, PA: cur.PA, PB: cur.PB, eqPP: Math.abs(cur.PA - cur.PB) / r.chord,
        p2Other: !!(state.showP2 && cur.r2 && cur.r2.ok && cur.r2.side !== r.side) });
    } else if (state.mode === 'quad') {
      const q = cur.q;
      o.qok = q.ok; o.ts = state.quad.slice(); o.showDiag = state.showDiag;
      if (q.ok) Object.assign(o, { ang: q.ang, arcs: q.arcs, diagAng: q.diagAng, harm: q.harm, pitot: q.pitot, kite: q.kite,
        poly4: M.polyDev(q.arcs, 4), poly5: M.polyDev(q.arcs, 5), poly7: M.polyDev(q.arcs, 7),
        par: Math.min(Math.abs(q.arcs[1] - q.arcs[3]), Math.abs(q.arcs[0] - q.arcs[2])),
        rectDev: Math.max.apply(null, q.ang.map(function (a) { return Math.abs(a - 90); })) });
    } else {
      Object.assign(o, { Q: state.Q.slice(), th1: state.th1, th2: state.th2, show2: state.show2, showTan: state.showTan,
        power: cur.pw, OQ: cur.OQ, where: cur.where, QT: cur.QT, L1: lineData(cur.L1), L2: lineData(cur.L2) });
    }
    return o;
  }
  function emitState(src) { if (!state.chal) emit('ia', stateData(src)); }

  // 給測試用的介面（不影響畫面）
  window.__ia = {
    state: state, current: function () { cache = null; return current(); },
    xy: function (x, y) { return viewCur ? [X(x), Y(y)] : null; },
    pt: function (t) { return viewCur ? XY(M.pt(state.R, t)) : null; },
    data: function () { return stateData('test'); },
    seed: function (s) { let v = s >>> 0 || 1; rand = function () { v = (v * 16807) % 2147483647; return (v - 1) / 2147483646; }; }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  showPanels(); renderLog(); updateSoundButton();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    eqKey = null;
    renderLog(); showPanels(); updateReadouts(); describe(); updateSoundButton();
    $('newChal').textContent = state.chal ? T('換一題', 'Another one') : state.round ? T('出下一題', 'Next problem') : T('出一題', 'New problem');
    if (state.chal && !state.chal.done) setChalMsg(T('第 ', 'Problem ') + state.round + T(' 題：', ': ') + askText(state.chal.g));
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'lang') themeChanged(); });
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe($('stage'));
  } else window.addEventListener('resize', resize);
  // 滑桿起始值
  state.R = val(sliders.R); state.th1 = val(sliders.th1); state.th2 = val(sliders.th2);
  resize();
  refresh();
  soundCheck();
})();
