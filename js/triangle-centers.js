/* triangle-centers.js — 「三角形的四心與歐拉線」的畫面與互動（數學計算在 triangle-centers-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 拖曳頂點 A、B、C（靠近 0.5 的格點會吸附，其餘取到 0.05；點空白處最近的頂點移過去；鍵盤 Enter 切換頂點、方向鍵 0.1、Shift 0.5）。
 * 看哪一心：全部（四心＋歐拉線）、重心（三條中線）、外心（三條中垂線＋外接圓）、內心（三條角平分線＋內切圓）、垂心（三條高）。
 * 顯示：歐拉線、九點圓（九個點都畫出來）、四心的軌跡、角度。
 * 挑戰「這是哪一心」：隨機三角形上標一個點，選 G、O、I、H。 */
(function () {
  'use strict';
  const M = window.TCCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const alpha = D.alpha;
  const clampv = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  const r6 = function (v) { const w = Math.round(v * 1e6) / 1e6; return w === 0 ? 0 : w; };
  const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const VN = ['A', 'B', 'C'];
  const KS = ['G', 'O', 'I', 'H'];

  // ---------- 狀態 ----------
  const state = {
    focus: 'all',
    P: { A: [0, 0], B: [7, 0], C: [2.5, 5] },
    showEuler: true, showNine: false, showTrace: false, showAng: true,
    trace: [], run: null,
    log: [], chal: null, streak: 0, times: [], round: 0,
    drag: null
  };
  let rand = function () { return Math.random(); };

  // ---------- 色彩與字 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'tc-g', 'tc-o', 'tc-i', 'tc-h', 'tc-n', 'tc-e', 'tc-tri', 'tc-ok', 'tc-bad']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  const KCOL = function (k) { return C['tc-' + k.toLowerCase()]; };
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
  const NAME = function (k) { return { G: T('重心', 'centroid'), O: T('外心', 'circumcentre'), I: T('內心', 'incentre'), H: T('垂心', 'orthocentre') }[k]; };

  // ---------- 目前的三角形 ----------
  let cache = null;
  function current() {
    if (cache) return cache;
    const P = state.chal ? { A: state.chal.g.P[0], B: state.chal.g.P[1], C: state.chal.g.P[2] } : state.P;
    const c = M.centers(P.A, P.B, P.C);
    cache = { P: P, c: c, ok: !c.degenerate, f: c.degenerate ? { ok: false } : M.features(P.A, P.B, P.C) };
    return cache;
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

  const sub = M.sub, add = M.add, mulv = M.mul, len = function (p) { return Math.hypot(p[0], p[1]); };

  // ---------- 視野（等比例；框住三角形與看得到的心、圓；拖曳時固定） ----------
  let viewCur = null, viewTween = null;
  function contentBox() {
    const cur = current(), pts = [cur.P.A, cur.P.B, cur.P.C];
    if (cur.ok) {
      const c = cur.c;
      if (state.chal) pts.push(state.chal.g.at);
      else {
        const showO = state.focus === 'all' || state.focus === 'O', showH = state.focus === 'all' || state.focus === 'H';
        if (showO && c.R < 30) pts.push([c.O[0] - c.R, c.O[1] - c.R], [c.O[0] + c.R, c.O[1] + c.R]);
        if (showH && len(sub(c.H, c.G)) < 40) pts.push(c.H);
        if (state.showEuler && state.focus === 'all' && c.R < 30) pts.push(c.O);
        if (state.showNine && c.R < 30) pts.push([c.N[0] - c.nineR, c.N[1] - c.nineR], [c.N[0] + c.nineR, c.N[1] + c.nineR]);
      }
    }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    pts.forEach(function (p) { if (!isFinite(p[0]) || !isFinite(p[1])) return; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    const span = Math.max(x1 - x0, y1 - y0, 3);
    const pad = 0.1 * span + 0.6;
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
    c.lineWidth = 1; c.strokeStyle = alpha(C.text, D.dark ? 0.07 : 0.075);
    c.beginPath();
    for (let g = Math.ceil(invX(b.x) / st) * st; g <= invX(b.x + b.w); g += st) { c.moveTo(snap(X(g)), b.y); c.lineTo(snap(X(g)), b.y + b.h); }
    for (let g = Math.ceil(invY(b.y + b.h) / st) * st; g <= invY(b.y); g += st) { c.moveTo(b.x, snap(Y(g))); c.lineTo(b.x + b.w, snap(Y(g))); }
    c.stroke();

    const cur = current(), labels = [];
    if (state.chal) drawChal(c, cur, labels);
    else if (!cur.ok) drawFlat(c, labels);
    else drawAll(c, cur, labels);
    placeLabels(c, labels);
    c.restore();
    D.pill(c, T('格線間距 ', 'Grid spacing ') + fmt(st), b.x + 8, b.y + b.h - 6, C.muted, 'left', fnt(10.5, 600));
    if (state.chal && !state.chal.done) D.pill(c, T('挑戰：標著「？」的是哪一心？', 'Challenge: which centre is marked “?”'), b.x + b.w / 2, b.y + 28, C.accent, 'center', fnt(12.5, 700));
    if (kb && kb.focused()) {
      c.strokeStyle = C.accent; c.lineWidth = 1.5; c.setLineDash([5, 4]);
      D.roundRect(c, b.x + 2, b.y + 2, b.w - 4, b.h - 4, 7); c.stroke(); c.setLineDash([]);
    }
  }
  function poly(c, pts) { c.beginPath(); pts.forEach(function (p, i) { const q = XY(p); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.closePath(); }
  function seg(c, p, q) { const a = XY(p), b2 = XY(q); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b2[0], b2[1]); c.stroke(); }
  /** 過 p、方向 d 的整條直線（畫到畫面外） */
  function fullLine(c, p, d) {
    const L = len(d); if (L < 1e-12) return;
    const u = mulv(d, 1 / L), far = 4 * Math.max(PR.w, PR.h) / viewCur.s;
    seg(c, add(p, mulv(u, -far)), add(p, mulv(u, far)));
  }
  function circle(c, O, r) { c.beginPath(); c.arc(X(O[0]), Y(O[1]), r * viewCur.s, 0, Math.PI * 2); }
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
  function angleArc(c, V, P, Q, col, rp) {
    const v = XY(V), p = XY(P), q = XY(Q);
    const a1 = Math.atan2(p[1] - v[1], p[0] - v[0]), a2 = Math.atan2(q[1] - v[1], q[0] - v[0]);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    c.strokeStyle = alpha(col, 0.8); c.lineWidth = 1.6;
    c.fillStyle = alpha(col, D.dark ? 0.14 : 0.1);
    c.beginPath(); c.moveTo(v[0], v[1]); c.arc(v[0], v[1], rp, a1, a1 + d, d < 0); c.closePath(); c.fill();
    c.beginPath(); c.arc(v[0], v[1], rp, a1, a1 + d, d < 0); c.stroke();
    const mid = a1 + d / 2;
    return [v[0] + Math.cos(mid) * (rp + 15), v[1] + Math.sin(mid) * (rp + 15)];
  }
  /** 直角記號：在 F，沿 u、v 兩個方向 */
  function rightMark(c, F, u, v, col) {
    const k = 9 / viewCur.s, f = XY(F);
    const p1 = XY(add(F, mulv(u, k))), p3 = XY(add(F, mulv(v, k))), p2 = XY(add(add(F, mulv(u, k)), mulv(v, k)));
    c.strokeStyle = alpha(col, 0.85); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.lineTo(p3[0], p3[1]); c.stroke();
    void f;
  }
  const unit = function (d) { const L = len(d) || 1; return [d[0] / L, d[1] / L]; };

  function drawTriangle(c, P, focusCol) {
    poly(c, [P.A, P.B, P.C]);
    const g = c.createLinearGradient(X(Math.min(P.A[0], P.B[0], P.C[0])), Y(Math.max(P.A[1], P.B[1], P.C[1])), X(Math.max(P.A[0], P.B[0], P.C[0])), Y(Math.min(P.A[1], P.B[1], P.C[1])));
    g.addColorStop(0, alpha(focusCol || C['tc-tri'], D.dark ? 0.2 : 0.13));
    g.addColorStop(1, alpha(focusCol || C['tc-tri'], D.dark ? 0.08 : 0.05));
    c.fillStyle = g; c.fill();
    c.strokeStyle = alpha(C['tc-tri'], 0.9); c.lineWidth = 2.6; c.lineJoin = 'round'; c.stroke();
  }
  function drawVertices(c, P, labels, big) {
    const ctr = mulv(add(add(P.A, P.B), P.C), 1 / 3);
    VN.forEach(function (k) {
      const p = P[k], d = sub(p, ctr), L = len(d) || 1;
      const q = add(p, mulv(d, 18 / viewCur.s / L));
      D.ball(c, X(p[0]), Y(p[1]), big ? 8 : 6, C['tc-tri'], { glow: state.drag && state.drag.k === k ? 0.65 : 0.3 });
      labels.push({ x: X(q[0]), y: Y(q[1]), text: k, col: C['tc-tri'], pri: 5, center: true, font: fnt(13, 800) });
    });
  }
  function centerDot(c, k, p, labels, faint, text) {
    const col = KCOL(k);
    if (faint) { D.ball(c, X(p[0]), Y(p[1]), 3.5, alpha(col, 0.45), { glow: 0 }); return; }
    D.ball(c, X(p[0]), Y(p[1]), 6, col, { glow: 0.45 });
    lbl(labels, p, text || k, col, 4, { font: fnt(12.5, 800) });
  }

  function drawAll(c, cur, labels) {
    const P = cur.P, cc = cur.c, f = state.focus;
    // 軌跡
    if (state.showTrace && state.trace.length > 1) {
      KS.forEach(function (k) {
        if (f !== 'all' && f !== k) return;
        c.strokeStyle = alpha(KCOL(k), 0.55); c.lineWidth = 2; c.lineJoin = 'round'; c.lineCap = 'round';
        c.beginPath();
        let started = false;
        state.trace.forEach(function (t) {
          const q = t[k];
          if (!q || Math.abs(q[0]) > 1e4 || Math.abs(q[1]) > 1e4) { started = false; return; }
          const x = X(q[0]), y = Y(q[1]);
          if (started) c.lineTo(x, y); else { c.moveTo(x, y); started = true; }
        });
        c.stroke();
      });
    }
    drawTriangle(c, P, f === 'all' ? null : KCOL(f));
    const V = [P.A, P.B, P.C];
    // 作圖線
    if (f === 'G') {
      c.strokeStyle = alpha(C['tc-g'], 0.85); c.lineWidth = 1.6;
      cc.mids.forEach(function (Mp, k) { seg(c, V[k], Mp); D.ball(c, X(Mp[0]), Y(Mp[1]), 3.5, C['tc-g'], { glow: 0 }); });
      // 2 : 1 的刻度：從頂點到 G、G 到中點
      const k0 = 0, gm = len(sub(cc.mids[k0], cc.G)), ag = len(sub(V[k0], cc.G));
      lbl(labels, mulv(add(V[k0], cc.G), 0.5), fmt(ag, 2), C['tc-g'], 1, { center: true, font: fnt(10.5, 700) });
      lbl(labels, mulv(add(cc.mids[k0], cc.G), 0.5), fmt(gm, 2), C['tc-g'], 1, { center: true, font: fnt(10.5, 700) });
    } else if (f === 'O') {
      c.strokeStyle = alpha(C['tc-o'], 0.7); c.lineWidth = 1.3; c.setLineDash([6, 5]);
      const S = [[P.B, P.C], [P.C, P.A], [P.A, P.B]];
      S.forEach(function (s, k) { const d = sub(s[1], s[0]); fullLine(c, cc.mids[k], [-d[1], d[0]]); });
      c.setLineDash([]);
      S.forEach(function (s, k) { const u = unit(sub(s[1], s[0])); rightMark(c, cc.mids[k], u, [-u[1], u[0]], C['tc-o']); });
      c.strokeStyle = alpha(C['tc-o'], 0.8); c.lineWidth = 1.8; circle(c, cc.O, cc.R); c.stroke();
      c.strokeStyle = alpha(C['tc-o'], 0.35); c.lineWidth = 1; V.forEach(function (p) { seg(c, cc.O, p); });
      lbl(labels, mulv(add(cc.O, P.A), 0.5), 'R = ' + fmt(cc.R, 3), C['tc-o'], 1, { center: true, font: fnt(11, 700) });
    } else if (f === 'I') {
      c.strokeStyle = alpha(C['tc-i'], 0.85); c.lineWidth = 1.5;
      V.forEach(function (p, k) {
        // 角平分線畫到對邊
        const U = V[(k + 1) % 3], W = V[(k + 2) % 3];
        const dU = len(sub(U, p)), dW = len(sub(W, p));
        const Q = add(U, mulv(sub(W, U), dU / (dU + dW)));
        seg(c, p, Q);
      });
      c.strokeStyle = alpha(C['tc-i'], 0.85); c.lineWidth = 1.8; circle(c, cc.I, cc.r); c.stroke();
      c.fillStyle = alpha(C['tc-i'], D.dark ? 0.1 : 0.07); c.fill();
      [[P.B, P.C], [P.C, P.A], [P.A, P.B]].forEach(function (s) { const F = M.foot(cc.I, s[0], s[1]); D.ball(c, X(F[0]), Y(F[1]), 3, C['tc-i'], { glow: 0 }); c.strokeStyle = alpha(C['tc-i'], 0.4); c.lineWidth = 1; seg(c, cc.I, F); });
      lbl(labels, add(cc.I, [0, -cc.r * 0.5]), 'r = ' + fmt(cc.r, 3), C['tc-i'], 1, { center: true, font: fnt(11, 700) });
    } else if (f === 'H') {
      V.forEach(function (p, k) {
        const U = V[(k + 1) % 3], W = V[(k + 2) % 3], F = cc.feet[k];
        c.strokeStyle = alpha(C['tc-h'], 0.85); c.lineWidth = 1.6; seg(c, p, F);
        // 延長到 H（鈍角時在外面）
        c.setLineDash([4, 4]); c.lineWidth = 1.2; c.strokeStyle = alpha(C['tc-h'], 0.6);
        const t = (sub(cc.H, p)[0] * sub(F, p)[0] + sub(cc.H, p)[1] * sub(F, p)[1]) / Math.max(1e-12, len(sub(F, p)) * len(sub(F, p)));
        if (t > 1 + 1e-9 || t < -1e-9) seg(c, t > 1 ? F : p, cc.H);
        // 垂足在邊的延長線上時，把邊延長
        const tt = ((F[0] - U[0]) * (W[0] - U[0]) + (F[1] - U[1]) * (W[1] - U[1])) / Math.max(1e-12, len(sub(W, U)) * len(sub(W, U)));
        if (tt < -1e-9) seg(c, U, F); else if (tt > 1 + 1e-9) seg(c, W, F);
        c.setLineDash([]);
        const u = unit(sub(W, U)), n = unit(sub(p, F));
        if (len(sub(p, F)) > 1e-6) rightMark(c, F, tt > 0.5 ? mulv(u, -1) : u, n, C['tc-h']);
        D.ball(c, X(F[0]), Y(F[1]), 3, C['tc-h'], { glow: 0 });
      });
    }
    // 九點圓
    if (state.showNine) {
      c.strokeStyle = alpha(C['tc-n'], 0.85); c.lineWidth = 1.7; c.setLineDash([2, 4]); circle(c, cc.N, cc.nineR); c.stroke(); c.setLineDash([]);
      cc.mids.concat(cc.feet, cc.eul).forEach(function (p) { D.ball(c, X(p[0]), Y(p[1]), 3.4, C['tc-n'], { glow: 0 }); });
      D.ball(c, X(cc.N[0]), Y(cc.N[1]), 4, C['tc-n'], { glow: 0.2 });
      lbl(labels, cc.N, 'N', C['tc-n'], 3, { font: fnt(12, 800) });
    }
    // 歐拉線
    const eq = !(cc.OH > 1e-6);
    if (state.showEuler && !eq && f === 'all') {
      c.strokeStyle = alpha(C['tc-e'], 0.75); c.lineWidth = 1.6; c.setLineDash([9, 6]);
      fullLine(c, cc.O, sub(cc.H, cc.O)); c.setLineDash([]);
      // OG、GH 兩段加粗
      c.lineWidth = 3.2; c.lineCap = 'round';
      c.strokeStyle = alpha(C['tc-e'], 0.55); seg(c, cc.O, cc.G);
      c.strokeStyle = alpha(C['tc-e'], 0.35); seg(c, cc.G, cc.H);
      if (cc.OH * viewCur.s > 70) {
        lbl(labels, mulv(add(cc.O, cc.G), 0.5), fmt(cc.OG, 2), C['tc-e'], 1, { center: true, font: fnt(10.5, 700) });
        lbl(labels, mulv(add(cc.G, cc.H), 0.5), fmt(cc.GH, 2), C['tc-e'], 1, { center: true, font: fnt(10.5, 700) });
      }
    }
    // 角度
    if (state.showAng) {
      const m = cc.m, rp = clampv(Math.min(m.a, m.b, m.c) * viewCur.s * 0.16, 13, 24);
      [['A', P.A, P.B, P.C, m.A], ['B', P.B, P.C, P.A, m.B], ['C', P.C, P.A, P.B, m.C]].forEach(function (z) {
        const at = angleArc(c, z[1], z[2], z[3], C['tc-tri'], rp);
        labels.push({ x: at[0], y: at[1], text: deg(z[4], 1), col: C['tc-tri'], pri: 1, center: true, font: fnt(10.5, 700) });
      });
    }
    drawVertices(c, P, labels, true);
    // 四心
    if (eq) {
      centerDot(c, 'G', cc.G, labels, false, 'G = O = I = H');
    } else {
      KS.forEach(function (k) { if (f === 'all' || f === k) centerDot(c, k, cc[k], labels, false); else centerDot(c, k, cc[k], labels, true); });
    }
  }
  function drawFlat(c, labels) {
    c.strokeStyle = C['tc-tri']; c.lineWidth = 3;
    seg(c, state.P.A, state.P.B); seg(c, state.P.B, state.P.C); seg(c, state.P.C, state.P.A);
    drawVertices(c, state.P, labels, true);
  }
  function drawChal(c, cur, labels) {
    drawTriangle(c, cur.P, null);
    const at = state.chal.g.at;
    drawVertices(c, cur.P, labels, false);
    const x = X(at[0]), y = Y(at[1]), col = state.chal.done ? KCOL(state.chal.g.ask) : C.accent;
    c.fillStyle = alpha(col, 0.18); c.beginPath(); c.arc(x, y, 13, 0, Math.PI * 2); c.fill();
    D.ball(c, x, y, 6.5, col, { glow: 0.5 });
    if (!state.chal.done) { lbl(labels, at, '？', C.accent, 6, { font: fnt(14, 800) }); return; }
    const cc = cur.c, ask = state.chal.g.ask;
    KS.forEach(function (k) {
      if (k === ask) return;
      D.ball(c, X(cc[k][0]), Y(cc[k][1]), 4.5, alpha(KCOL(k), 0.75), { glow: 0 });
      lbl(labels, cc[k], k, KCOL(k), 3, { font: fnt(11.5, 800) });
    });
    lbl(labels, at, ask + T('（', ' (') + NAME(ask) + T('）', ')'), KCOL(ask), 6, { font: fnt(13, 800) });
  }

  // ---------- 讀數 ----------
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  let eqKey = null;
  function kindText(f) {
    if (!f || !f.ok) return '—';
    let t = { acute: T('銳角三角形', 'acute'), right: T('直角三角形', 'right-angled'), obtuse: T('鈍角三角形', 'obtuse') }[f.kind];
    if (f.equi) t = T('正三角形', 'equilateral');
    else if (f.iso) t = T('等腰', 'isosceles ') + t;
    return t;
  }
  function whereText(w) {
    const W = { in: T('內', 'in'), on: T('邊上', 'on'), out: T('外', 'out') };
    return KS.map(function (k) { return k + ' ' + W[w[k]]; }).join(T('・', ' · '));
  }
  function updateReadouts() {
    const cur = current(), f = cur.f, hide = !!state.chal;
    const ids = ['rAngs', 'rKind', 'rWhere', 'rOGH', 'rRr', 'rOI', 'rNine'];
    if (hide || !f.ok) {
      ids.forEach(function (id) { setHTML(id, hide ? T('（挑戰中）', '(challenge)') : '—'); });
      if (!hide) setHTML('rKind', T('三點共線', 'collinear'));
    } else {
      setHTML('rAngs', deg(f.A) + T('、', ', ') + deg(f.B) + T('、', ', ') + deg(f.C));
      setHTML('rKind', kindText(f));
      setHTML('rWhere', whereText(f.where));
      setHTML('rOGH', f.OH > 1e-9 ? fmt(f.OG, 3) + T('、', ', ') + fmt(f.GH, 3) + T('（1 : ', ' (1 : ') + fmt(f.GH / f.OG, 3) + T('）', ')') : T('0（四心重合）', '0 (all four coincide)'));
      setHTML('rRr', fmt(f.R, 3) + T('、', ', ') + fmt(f.r, 3) + T('、', ', ') + fmt(f.Rr, 4));
      setHTML('rOI', fmt(f.OI, 3));
      setHTML('rNine', fmt(f.nineR, 3) + T('（= R／2）', ' (= R／2)'));
    }
    const k2 = JSON.stringify([f.ok && [f.OG, f.GH, f.OI, f.R, f.r], hide, window.LabSettings ? LabSettings.get('lang') : '']);
    if (eqKey !== k2) {
      eqKey = k2;
      let tex;
      const n = function (v) { return fmt(v, 3).replace(/−/g, '-'); };
      if (hide) tex = '\\text{' + T('重心、外心、內心、垂心？', 'Centroid, circumcentre, incentre or orthocentre?') + '}';
      else if (!f.ok) tex = '\\text{' + T('三點共線，沒有三角形', 'Collinear: no triangle') + '}';
      else tex = '\\begin{gathered}OG : GH = ' + (f.OH > 1e-9 ? n(f.OG) + ' : ' + n(f.GH) + ' = 1 : 2' : '0 : 0') +
        '\\\\ OI^2 = R(R - 2r)\\\\ ' + n(f.OI * f.OI) + ' = ' + n(f.R) + '\\times' + n(f.R - 2 * f.r) + '\\end{gathered}';
      const el = $('rEq');
      if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); } catch (e) { el.textContent = tex; } }
      else el.textContent = tex;
    }
  }
  function focusNote() {
    const N = {
      all: ['四心一起看。虛線是歐拉線：O、G、H 永遠在這條線上，而且 OG : GH = 1 : 2。', 'All four together. The dashed line is the Euler line: O, G and H always lie on it with OG : GH = 1 : 2.'],
      G: ['三條中線（頂點連到對邊中點）交於重心 G，把每條中線分成 2 : 1。', 'The three medians (corner to the midpoint across) meet at G, which cuts each of them 2 : 1.'],
      O: ['三條中垂線交於外心 O，它到三個頂點一樣遠，是外接圓的圓心。', 'The three perpendicular bisectors meet at O, equally far from all three corners: the centre of the circumcircle.'],
      I: ['三條內角平分線交於內心 I，它到三邊一樣遠，是內切圓的圓心。', 'The three angle bisectors meet at I, equally far from all three sides: the centre of the incircle.'],
      H: ['三條高（或延長線）交於垂心 H。鈍角三角形的垂心在外面。', 'The three altitudes (or their extensions) meet at H. In an obtuse triangle H is outside.']
    }[state.focus];
    $('focusNote').textContent = T(N[0], N[1]);
  }

  // ---------- 狀態列 ----------
  function setStatus(t) { $('status').textContent = t || ''; }
  function describe() {
    if (state.chal) return;
    const cur = current(), f = cur.f;
    if (!f.ok) { setStatus(T('三點在一直線上，不是三角形。', 'The three points are on a line: no triangle.')); return; }
    let msg;
    if (f.equi || f.OH < 1e-6) msg = T('正三角形：四心重合，沒有歐拉線。', 'Equilateral: all four centres coincide and there is no Euler line.');
    else {
      msg = kindText(f) + T('：', ': ');
      msg += { acute: T('外心、垂心都在裡面。', 'O and H are both inside.'), right: T('外心在斜邊中點，垂心在直角頂點。', 'O is the midpoint of the hypotenuse and H is at the right angle.'), obtuse: T('外心、垂心都跑到外面了。', 'O and H have both left the triangle.') }[f.kind];
      if (f.iso) msg += T(' 等腰時內心也在歐拉線上。', ' In an isosceles triangle I is on the Euler line too.');
    }
    if (state.showTrace && state.run && state.run.hi - state.run.lo > 1e-9) msg += T(' 沿平行線走了 ', ' Moved along a parallel line for ') + fmt(state.run.hi - state.run.lo, 2) + T('。', '.');
    setStatus(msg.charAt(0).toUpperCase() + msg.slice(1));
  }

  // ---------- 控制項 ----------
  function showPanels() {
    document.querySelectorAll('#modes button').forEach(function (b) { b.setAttribute('aria-pressed', String(!state.chal && b.getAttribute('data-focus') === state.focus)); });
    focusNote();
  }
  function refresh() { cache = null; updateReadouts(); describe(); requestDraw(); }
  let lastKind = null;
  function soundCheck() {
    const cur = current();
    const k = cur.ok ? cur.f.kind : 'none';
    if (lastKind !== null && k !== lastKind) blip(k === 'right' ? 784 : k === 'obtuse' ? 392 : k === 'none' ? 220 : 523, k === 'none' ? 'triangle' : 'sine', 0.12);
    lastKind = k;
  }
  function edited(src) { refresh(); soundCheck(); emitState(src); }
  document.querySelectorAll('#modes button').forEach(function (b) {
    b.addEventListener('click', function () {
      const f = b.getAttribute('data-focus');
      if (state.chal) { if (state.chal.done) endReview(); else quitChal(true); }
      state.focus = f;
      showPanels(); blip(523, 'sine', 0.1);
      edited('focus');
    });
  });
  ['showEuler', 'showNine', 'showTrace', 'showAng'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      state[id] = $(id).checked;
      if (id === 'showTrace') { state.trace = []; state.run = null; if (state.showTrace) pushTrace(); }
      cache = null; requestDraw(); describe();
      emitState('check');
    });
  });

  // ---------- 軌跡與「沿平行線走」 ----------
  function pushTrace() {
    const cur = current();
    if (!cur.ok) { state.trace.push({}); return; }
    const c = cur.c;
    state.trace.push({ G: c.G, O: c.O, I: c.I, H: c.H });
    if (state.trace.length > 4000) state.trace.shift();
  }
  /** 一個頂點從 p0 移到 p1、另外兩個不動：在同一條「平行對邊」的直線上就延長這一段 */
  function trackRun(prev) {
    if (!state.showTrace) return;
    const moved = VN.filter(function (k) { return prev[k][0] !== state.P[k][0] || prev[k][1] !== state.P[k][1]; });
    if (moved.length !== 1) { state.run = null; return; }
    const k = moved[0], U = state.P[VN[(VN.indexOf(k) + 1) % 3]], W = state.P[VN[(VN.indexOf(k) + 2) % 3]];
    const d = sub(W, U), L = len(d);
    if (L < 1e-9) { state.run = null; return; }
    const hOf = function (p) { return M.cross(U, W, p) / L; }, sOf = function (p) { return ((p[0] - U[0]) * d[0] + (p[1] - U[1]) * d[1]) / L; };
    const h1 = hOf(state.P[k]), s1 = sOf(state.P[k]);
    const R = state.run;
    const same = R && R.k === k && R.U[0] === U[0] && R.U[1] === U[1] && R.W[0] === W[0] && R.W[1] === W[1];
    if (same && Math.abs(h1 - R.h) <= 0.06) { R.lo = Math.min(R.lo, s1); R.hi = Math.max(R.hi, s1); return; }
    const h0 = hOf(prev[k]), s0 = sOf(prev[k]);
    if (Math.abs(h1 - h0) <= 0.06) state.run = { k: k, U: U.slice(), W: W.slice(), h: h0, lo: Math.min(s0, s1), hi: Math.max(s0, s1) };
    else state.run = { k: k, U: U.slice(), W: W.slice(), h: h1, lo: s1, hi: s1 };
  }
  function moveVertex(k, p) {
    const prev = { A: state.P.A, B: state.P.B, C: state.P.C };
    state.P = Object.assign({}, state.P); state.P[k] = p;
    cache = null;
    trackRun(prev);
    if (state.showTrace) pushTrace();
  }

  // ---------- 記下、全部清除 ----------
  function renderLog() {
    const t = $('log');
    if (!state.log.length) { t.innerHTML = ''; $('logEmpty').hidden = false; return; }
    $('logEmpty').hidden = true;
    let h = '<thead><tr><th>#</th><th>A</th><th>B</th><th>C</th><th>OG</th><th>GH</th><th>R</th><th>r</th><th>OI</th></tr></thead><tbody>';
    state.log.forEach(function (r, i) { h += '<tr><td>' + (i + 1) + '</td><td>' + r.join('</td><td>') + '</td></tr>'; });
    t.innerHTML = h + '</tbody>';
  }
  $('mark').addEventListener('click', function () {
    if (state.chal) { setStatus(T('挑戰中先不記錄。', 'Not during a challenge.')); return; }
    const f = current().f;
    if (!f.ok) { setStatus(T('三點共線，沒辦法記。', 'There is no triangle to record.')); return; }
    state.log.push([deg(f.A, 1), deg(f.B, 1), deg(f.C, 1), fmt(f.OG, 3), fmt(f.GH, 3), fmt(f.R, 3), fmt(f.r, 3), fmt(f.OI, 3)]);
    if (state.log.length > 40) state.log.shift();
    renderLog(); blip(659, 'sine', 0.1);
    setStatus(T('記下第 ', 'Recorded #') + state.log.length + T(' 組。', '.'));
  });
  $('clear').addEventListener('click', function () {
    state.log = []; renderLog();
    state.trace = []; state.run = null; if (state.showTrace) pushTrace();
    if (state.chal) { if (state.chal.done) endReview(); else quitChal(true); }
    state.streak = 0; state.times = []; state.round = 0;
    setChalMsg(''); $('newChal').textContent = T('出一題', 'New problem');
    blip(330); refresh();
    setStatus(T('記錄、軌跡與挑戰都清除了；三角形保留。', 'Records, traces and the challenge are cleared; the triangle is kept.'));
  });

  // ---------- 畫布操作 ----------
  function evPos(ev) { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  function snapPt(x, y, pxTol) {
    const tol = pxTol / viewCur.s;
    const hx = Math.round(x * 2) / 2, hy = Math.round(y * 2) / 2;
    if (Math.hypot(hx - x, hy - y) < tol) return [hx, hy];
    return [r6(Math.round(x * 20) / 20), r6(Math.round(y * 20) / 20)];
  }
  function hitTest(p) {
    if (!viewCur || state.chal) return null;
    let best = null, bd = 22;
    VN.forEach(function (k) { const q = state.P[k], d = Math.hypot(p.x - X(q[0]), p.y - Y(q[1])); if (d < bd) { bd = d; best = k; } });
    return best;
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
    const s = snapPt(invX(p.x), invY(p.y), 10), np = [clampv(s[0], -20, 30), clampv(s[1], -20, 30)], o = state.P[state.drag.k];
    if (np[0] === o[0] && np[1] === o[1]) return;
    moveVertex(state.drag.k, np);
    refresh(); soundCheck();
  });
  function endDrag(ev) {
    const dr = state.drag, down = downAt;
    state.drag = null; downAt = null;
    if (!dr) {
      if (ev && ev.type === 'pointerup' && down && viewCur && !state.chal) {
        const p = evPos(ev);
        if (Math.hypot(p.x - down.x, p.y - down.y) < 6) {
          const x = invX(p.x), y = invY(p.y);
          let best = 'A', bd = Infinity;
          VN.forEach(function (k) { const q = state.P[k], d = Math.hypot(q[0] - x, q[1] - y); if (d < bd) { bd = d; best = k; } });
          const s = snapPt(x, y, 12);
          moveVertex(best, [clampv(s[0], -20, 30), clampv(s[1], -20, 30)]);
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

  // ---------- 鍵盤 ----------
  let kb = null;
  if (window.LabKeys) {
    const mover = function (k) {
      return function (dx, dy, big) {
        if (state.chal) return false;
        const st = big ? 0.5 : 0.1, p = state.P[k];
        moveVertex(k, [r6(clampv(Math.round((p[0] + dx * st) * 1e4) / 1e4, -20, 30)), r6(clampv(Math.round((p[1] + dy * st) * 1e4) / 1e4, -20, 30))]);
        blip(494, 'sine', 0.08); edited('key'); return true;
      };
    };
    kb = window.LabKeys.attach(cv, {
      label: T('三角形畫布。Enter 切換頂點 A、B、C，方向鍵移動 0.1，Shift 移 0.5。', 'Triangle canvas. Enter switches between the corners A, B and C; arrow keys move by 0.1, Shift by 0.5.'),
      items: VN.map(function (k) {
        return {
          name: function () { return T('頂點 ', 'corner ') + k; }, move: mover(k),
          describe: function () {
            const f = current().f;
            const p = state.P[k];
            if (!f.ok) return k + ' = (' + fmt(p[0], 2) + ', ' + fmt(p[1], 2) + ')';
            return k + ' = (' + fmt(p[0], 2) + ', ' + fmt(p[1], 2) + T(')，角 ', '), angle ') + k + ' = ' + deg(f[k]) + T('；', '; ') + whereText(f.where);
          }
        };
      }),
      onChange: function () { requestDraw(); }
    });
  }

  // ---------- 挑戰 ----------
  const chalMsg = $('chalMsg');
  function setChalMsg(msg, cls) { chalMsg.textContent = msg || ''; chalMsg.classList.toggle('ok', cls === 'ok'); chalMsg.classList.toggle('bad', cls === 'bad'); }
  function startChal() {
    const g = M.challenge(rand);
    state.chal = { g: g, t0: performance.now() };
    state.round++;
    cache = null; viewCur = null;
    showPanels();
    $('picks').hidden = false; $('quitChal').hidden = false;
    $('newChal').textContent = T('換一題', 'Another one');
    setChalMsg(T('第 ', 'Problem ') + state.round + T(' 題：標著「？」的點是哪一心？', ': which centre is marked “?”'));
    setStatus('');
    blip(523);
    refresh();
  }
  function quitChal(silent) {
    if (!state.chal) return;
    state.chal = null; state.streak = 0; state.times = [];
    $('picks').hidden = true; $('quitChal').hidden = true;
    $('newChal').textContent = T('出一題', 'New problem');
    setChalMsg(silent ? '' : T('放棄這題，連續答對中斷。', 'Gave up: the streak is broken.'));
    cache = null; viewCur = null;
    showPanels(); refresh();
  }
  $('newChal').addEventListener('click', function () { if (state.chal && !state.chal.done) { state.streak = 0; state.times = []; } startChal(); });
  function endReview() {
    state.chal = null;
    $('picks').hidden = true; $('quitChal').hidden = true;
    cache = null; viewCur = null;
  }
  $('quitChal').addEventListener('click', function () { quitChal(false); });
  document.querySelectorAll('#picks button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!state.chal || state.chal.done) return;
      const pick = b.getAttribute('data-pick'), g = state.chal.g, secs = (performance.now() - state.chal.t0) / 1000;
      const right = pick === g.ask;
      if (right) {
        state.streak++; state.times.push(secs); if (state.times.length > 10) state.times.shift();
        setChalMsg(T('答對了！是', 'Correct! It is the ') + NAME(g.ask) + ' ' + g.ask + T('，用了 ', ', in ') + secs.toFixed(1) + T(' 秒，連續答對 ', ' s. Streak: ') + state.streak + T(' 題。', '.'), 'ok');
        chime();
      } else {
        state.streak = 0; state.times = [];
        setChalMsg(T('不對：那是', 'Not quite: it is the ') + NAME(g.ask) + ' ' + g.ask + T('。', '.'), 'bad');
        blip(220, 'triangle', 0.14);
      }
      const last10 = state.streak >= 10 ? state.times.slice(-10).reduce(function (s, x) { return s + x; }, 0) : NaN;
      emit('guess', { correct: right, streak: state.streak, secs: secs, last10: last10, ask: g.ask });
      // 答完：留在這個三角形上看答案（四心都畫出來），按「看哪一心」或「出下一題」離開；不回報 'tc'
      state.chal.done = true; state.chal.pick = pick;
      $('picks').hidden = true; $('quitChal').hidden = true;
      $('newChal').textContent = T('出下一題', 'Next problem');
      cache = null;
      showPanels(); refresh();
    });
  });

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
  function stateData(src) {
    const f = current().f;
    return Object.assign({}, f, { src: src, focus: state.focus, showNine: state.showNine, showTrace: state.showTrace, showEuler: state.showEuler,
      runSpan: state.showTrace && state.run ? state.run.hi - state.run.lo : 0 });
  }
  function emitState(src) { if (!state.chal) emit('tc', stateData(src)); }

  // 給測試用的介面（不影響畫面）
  window.__tc = {
    state: state, current: function () { cache = null; return current(); },
    xy: function (x, y) { return viewCur ? [X(x), Y(y)] : null; },
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
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'lang') themeChanged(); });
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe($('stage'));
  } else window.addEventListener('resize', resize);
  resize();
  refresh();
  soundCheck();
})();
