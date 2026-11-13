/* law-of-cosines.js — 「正弦定理、餘弦定理與解三角形」的畫面與互動（數學計算在 law-of-cosines-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 模式：
 *   拖曳：自由拖曳頂點 A、B、C（靠近 0.5 的格點會吸附，其餘取到 0.05）。
 *   SSS、SAS、ASA、SSA：用滑桿給三個已知條件，三角形由核心算出來（A 在原點、B 在正 x 軸上、C 在上方）。
 *     SSA 會畫出以 C 為圓心、半徑 a 的圓與射線 AB，0、1 或 2 個交點；兩解時可以切換看另一個解。
 * 圖層：三邊上的正方形（銳角三角形時，三條高把每個正方形切成兩塊，靠同一個頂點的兩塊等面積 → 餘弦定理）、
 *       外接圓與 2R、角度、高。
 * 挑戰「解三角形」：給三個已知量，打字算出問號那一個。 */
(function () {
  'use strict';
  const M = window.LCCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha;
  const clampv = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  const r6 = function (v) { const w = Math.round(v * 1e6) / 1e6; return w === 0 ? 0 : w; };
  const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const D2R = M.D2R;
  const VN = ['A', 'B', 'C'];

  // ---------- 狀態 ----------
  const state = {
    mode: 'free',
    P: { A: [0, 0], B: [6, 0], C: [1.5, 4] },
    inp: { a: 5, b: 6, c: 7, A: 70, B: 60 },
    ssaSel: 0,
    showSq: true, showCirc: true, showAng: true, showH: false,
    log: [], chal: null, streak: 0, times: [], round: 0,
    drag: null
  };
  let rand = function () { return Math.random(); };
  let applying = false;

  // ---------- 色彩與字 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'lc-a', 'lc-b', 'lc-c', 'lc-tri', 'lc-circ', 'lc-h', 'lc-ok', 'lc-bad']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  const VCOL = function (v) { return C['lc-' + v.toLowerCase()]; };
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

  // ---------- 目前的三角形 ----------
  /** 依模式算出要畫的三角形；ok = false 時 fail 說明為什麼圍不起來 */
  let cache = null;
  function current() {
    if (cache) return cache;
    const I = state.inp;
    let out = { ok: false, P: null, m: null, nSol: 1, why: '', fail: null, ghost: null, sols: [] };
    if (state.chal) {
      const s = state.chal.g.sol, P = M.place(s.a, s.b, s.c);
      out.ok = true; out.P = P;
    } else if (state.mode === 'free') {
      out.P = { A: state.P.A, B: state.P.B, C: state.P.C };
      out.ok = M.measure(out.P.A, out.P.B, out.P.C).area > 1e-9;
      if (!out.ok) out.fail = { type: 'flat' };
    } else if (state.mode === 'sss') {
      const s = M.solveSSS(I.a, I.b, I.c);
      out.sols = s;
      if (s.length) { out.ok = true; out.P = M.place(I.a, I.b, I.c); }
      else out.fail = { type: 'sss' };
    } else if (state.mode === 'sas') {
      const s = M.solveSAS(I.b, I.c, I.A);
      out.sols = s;
      if (s.length) { out.ok = true; out.P = M.place(s[0].a, s[0].b, s[0].c); }
    } else if (state.mode === 'asa') {
      const s = M.solveASA(I.A, I.B, I.c);
      out.sols = s;
      if (s.length) { out.ok = true; out.P = M.place(s[0].a, s[0].b, s[0].c); }
      else out.fail = { type: 'asa' };
    } else {
      const s = M.solveSSA(I.A, I.b, I.a), cs = M.ssaCase(I.A, I.b, I.a, 1e-9);
      out.sols = s; out.nSol = s.length; out.why = cs.why;
      const Cp = [I.b * Math.cos(I.A * D2R), I.b * Math.sin(I.A * D2R)];
      if (s.length) {
        const k = Math.min(state.ssaSel, s.length - 1);
        out.ok = true; out.P = { A: [0, 0], B: [s[k].c, 0], C: Cp };
        if (s.length === 2) out.ghost = [s[1 - k].c, 0];
      } else { out.fail = { type: 'ssa' }; out.P = { A: [0, 0], B: null, C: Cp }; }
    }
    if (out.ok) out.m = M.measure(out.P.A, out.P.B, out.P.C);
    cache = out;
    return out;
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

  // ---------- 幾何小工具 ----------
  const sub = function (p, q) { return [p[0] - q[0], p[1] - q[1]]; };
  const add = function (p, q) { return [p[0] + q[0], p[1] + q[1]]; };
  const mulv = function (p, k) { return [p[0] * k, p[1] * k]; };
  const len = function (p) { return Math.hypot(p[0], p[1]); };
  /** 邊 PQ 上、往遠離 R 那一側的正方形（四個頂點，從 P 開始） */
  function squareOn(P, Q, R) {
    const d = sub(Q, P), L = len(d);
    let n = [-d[1] / L, d[0] / L];
    if ((R[0] - P[0]) * n[0] + (R[1] - P[1]) * n[1] > 0) n = mulv(n, -1);
    return { pts: [P, Q, add(Q, mulv(n, L)), add(P, mulv(n, L))], n: n, L: L };
  }
  /** R 在直線 PQ 上的垂足 */
  function foot(P, Q, R) {
    const d = sub(Q, P), t = ((R[0] - P[0]) * d[0] + (R[1] - P[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1]);
    return { F: add(P, mulv(d, t)), t: t };
  }
  /** 三個邊的資料：邊名、兩端、對頂點 */
  function sidesOf(P) {
    return [
      { name: 'a', v: 'A', P: P.B, Q: P.C, R: P.A, pn: 'B', qn: 'C' },
      { name: 'b', v: 'B', P: P.C, Q: P.A, R: P.B, pn: 'C', qn: 'A' },
      { name: 'c', v: 'C', P: P.A, Q: P.B, R: P.C, pn: 'A', qn: 'B' }
    ];
  }

  // ---------- 視野（等比例，框住三角形、外接圓與正方形；拖曳時固定） ----------
  let viewCur = null, viewTween = null;
  function contentBox() {
    const cur = current(), pts = [];
    if (cur.P) ['A', 'B', 'C'].forEach(function (k) { if (cur.P[k]) pts.push(cur.P[k]); });
    if (cur.ghost) pts.push(cur.ghost);
    if (cur.ok && !state.chal) {
      if (state.showSq) sidesOf(cur.P).forEach(function (s) { const q = squareOn(s.P, s.Q, s.R); pts.push(q.pts[2], q.pts[3]); });
      if (state.showCirc && cur.m.R < 40) {
        const O = M.circumcenter(cur.P.A, cur.P.B, cur.P.C);
        if (O) pts.push([O[0] - cur.m.R, O[1] - cur.m.R], [O[0] + cur.m.R, O[1] + cur.m.R]);
      }
    }
    if (!cur.ok && !state.chal) {
      const I = state.inp;
      if (state.mode === 'sss') pts.push([-I.b, -I.b], [I.c + I.a, Math.max(I.a, I.b)], [0, 0], [I.c, 0]);
      if (state.mode === 'asa') pts.push([0, 0], [I.c, 0], [I.c / 2, I.c * 0.8]);
      if (state.mode === 'ssa') { const Cp = cur.P.C; pts.push([0, 0], [Cp[0] - I.a, Cp[1] - I.a], [Cp[0] + I.a, Cp[1] + I.a], [Math.max(I.b, Cp[0] + I.a) + 1, 0]); }
      if (state.mode === 'free') ['A', 'B', 'C'].forEach(function (k) { pts.push(state.P[k]); });
    }
    if (state.mode === 'ssa' && !state.chal && cur.P) { const Cp = cur.P.C, I = state.inp; pts.push([Cp[0] - I.a, Cp[1] - I.a], [Cp[0] + I.a, Math.max(0, Cp[1] - I.a)]); }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    pts.forEach(function (p) { if (!isFinite(p[0]) || !isFinite(p[1])) return; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    if (!isFinite(x0)) { x0 = -1; x1 = 7; y0 = -1; y1 = 5; }
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
    // 格線
    const st = niceStep(60 / viewCur.s);
    const snap = function (v) { return (Math.round(v * dpr) + 0.5) / dpr; };
    c.lineWidth = 1; c.strokeStyle = alpha(C.text, D.dark ? 0.07 : 0.075);
    c.beginPath();
    for (let g = Math.ceil(invX(b.x) / st) * st; g <= invX(b.x + b.w); g += st) { c.moveTo(snap(X(g)), b.y); c.lineTo(snap(X(g)), b.y + b.h); }
    for (let g = Math.ceil(invY(b.y + b.h) / st) * st; g <= invY(b.y); g += st) { c.moveTo(b.x, snap(Y(g))); c.lineTo(b.x + b.w, snap(Y(g))); }
    c.stroke();

    const cur = current(), labels = [];
    if (state.chal) drawChal(c, cur, labels);
    else {
      if (!cur.ok) drawFail(c, cur, labels);
      if (state.mode === 'ssa') drawSSA(c, cur, labels);
      if (cur.ok) drawTri(c, cur, labels);
    }
    placeLabels(c, labels);
    c.restore();
    D.pill(c, T('格線間距 ', 'Grid spacing ') + fmt(st), b.x + 8, b.y + b.h - 6, C.muted, 'left', fnt(10.5, 600));
    if (state.chal) D.pill(c, T('挑戰：算出問號的值', 'Challenge: work out the value marked ?'), b.x + b.w / 2, b.y + 28, C.accent, 'center', fnt(12.5, 700));
    if (kb && kb.focused()) {
      c.strokeStyle = C.accent; c.lineWidth = 1.5; c.setLineDash([5, 4]);
      D.roundRect(c, b.x + 2, b.y + 2, b.w - 4, b.h - 4, 7); c.stroke(); c.setLineDash([]);
    }
  }
  function poly(c, pts) { c.beginPath(); pts.forEach(function (p, i) { const q = XY(p); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.closePath(); }
  function seg(c, p, q) { const a = XY(p), b2 = XY(q); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b2[0], b2[1]); c.stroke(); }
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
  /** 頂點 v 的角弧：從 v 往 p、q 兩個方向；半徑 rp 像素 */
  function angleArc(c, V, P, Q, col, rp, right) {
    const v = XY(V), p = XY(P), q = XY(Q);
    let a1 = Math.atan2(p[1] - v[1], p[0] - v[0]), a2 = Math.atan2(q[1] - v[1], q[0] - v[0]);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    c.strokeStyle = col; c.lineWidth = 2;
    if (right) {
      const u1 = [Math.cos(a1), Math.sin(a1)], u2 = [Math.cos(a2), Math.sin(a2)], k = rp * 0.62;
      c.beginPath(); c.moveTo(v[0] + u1[0] * k, v[1] + u1[1] * k); c.lineTo(v[0] + (u1[0] + u2[0]) * k, v[1] + (u1[1] + u2[1]) * k); c.lineTo(v[0] + u2[0] * k, v[1] + u2[1] * k); c.stroke();
    } else {
      c.fillStyle = alpha(col, D.dark ? 0.18 : 0.14);
      c.beginPath(); c.moveTo(v[0], v[1]); c.arc(v[0], v[1], rp, a1, a1 + d, d < 0); c.closePath(); c.fill();
      c.beginPath(); c.arc(v[0], v[1], rp, a1, a1 + d, d < 0); c.stroke();
    }
    const mid = a1 + d / 2;
    return [v[0] + Math.cos(mid) * (rp + 16), v[1] + Math.sin(mid) * (rp + 16)];
  }

  function drawTri(c, cur, labels) {
    const P = cur.P, m = cur.m;
    const S = sidesOf(P);
    const acute = M.kind(m, 1e-9) !== 'obtuse';
    // 三邊上的正方形
    if (state.showSq) {
      S.forEach(function (s) {
        const q = squareOn(s.P, s.Q, s.R);
        if (acute) {
          // 由對頂點 R 作高，垂足 F 把正方形切成兩個長方形：靠 P 的那塊面積 = |PF|·|PQ| = (鄰邊)(本邊) cos P
          const f = foot(s.P, s.Q, s.R).F, fo = add(f, mulv(q.n, q.L));
          [[s.P, f, fo, q.pts[3], s.pn], [f, s.Q, q.pts[2], fo, s.qn]].forEach(function (r) {
            const col = VCOL(r[4]);
            poly(c, r.slice(0, 4)); c.fillStyle = alpha(col, D.dark ? 0.2 : 0.15); c.fill();
            c.strokeStyle = alpha(col, 0.45); c.lineWidth = 1; c.stroke();
          });
          c.strokeStyle = alpha(C['lc-h'], 0.7); c.lineWidth = 1.2; c.setLineDash([5, 4]); seg(c, f, fo); c.setLineDash([]);
        } else {
          poly(c, q.pts); c.fillStyle = alpha(C['lc-tri'], D.dark ? 0.12 : 0.1); c.fill();
        }
        poly(c, q.pts); c.strokeStyle = alpha(C.text, 0.35); c.lineWidth = 1.2; c.stroke();
        const ctr = mulv(add(add(q.pts[0], q.pts[1]), add(q.pts[2], q.pts[3])), 0.25);
        if (q.L * viewCur.s > 46) lbl(labels, ctr, s.name + '^2 = ' + fmt(q.L * q.L, 2), C.text, 0, { center: true, font: fnt(11, 700) });
      });
    }
    // 外接圓
    if (state.showCirc) {
      const O = M.circumcenter(P.A, P.B, P.C);
      if (O && m.R * viewCur.s < 4000) {
        c.strokeStyle = alpha(C['lc-circ'], 0.75); c.lineWidth = 1.6; c.setLineDash([6, 5]);
        c.beginPath(); c.arc(X(O[0]), Y(O[1]), m.R * viewCur.s, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
        c.strokeStyle = alpha(C['lc-circ'], 0.4); c.lineWidth = 1;
        ['A', 'B', 'C'].forEach(function (k) { seg(c, O, P[k]); });
        D.ball(c, X(O[0]), Y(O[1]), 4, C['lc-circ'], { glow: 0 });
        lbl(labels, O, 'O：2R = ' + fmt(2 * m.R, 3), C['lc-circ'], 1);
      }
    }
    // 三角形
    poly(c, [P.A, P.B, P.C]);
    c.fillStyle = alpha(C['lc-tri'], D.dark ? 0.16 : 0.13); c.fill();
    S.forEach(function (s) { c.strokeStyle = VCOL(s.v); c.lineWidth = 3; c.lineCap = 'round'; seg(c, s.P, s.Q); });
    // 高
    if (state.showH) {
      S.forEach(function (s) {
        const f = foot(s.P, s.Q, s.R);
        c.strokeStyle = alpha(C['lc-h'], 0.85); c.lineWidth = 1.4; c.setLineDash([4, 4]);
        seg(c, s.R, f.F);
        if (f.t < 0 || f.t > 1) seg(c, f.t < 0 ? s.P : s.Q, f.F);
        c.setLineDash([]);
        D.ball(c, X(f.F[0]), Y(f.F[1]), 3, C['lc-h'], { glow: 0 });
      });
    }
    // 角
    if (state.showAng) {
      const rp = clampv(Math.min(m.a, m.b, m.c) * viewCur.s * 0.22, 16, 30);
      [['A', P.A, P.B, P.C, m.A], ['B', P.B, P.C, P.A, m.B], ['C', P.C, P.A, P.B, m.C]].forEach(function (z) {
        const right = Math.abs(z[4] - 90) < 1e-6;
        const at = angleArc(c, z[1], z[2], z[3], VCOL(z[0]), rp, right);
        labels.push({ x: at[0], y: at[1], text: deg(z[4]), col: VCOL(z[0]), pri: 2, center: true, font: fnt(11, 700) });
      });
    }
    // 邊長
    S.forEach(function (s) {
      const mid = mulv(add(s.P, s.Q), 0.5);
      const out = squareOn(s.P, s.Q, s.R).n;
      const q = add(mid, mulv(out, 14 / viewCur.s));
      lbl(labels, state.showSq ? mid : q, s.name + ' = ' + fmt(len(sub(s.Q, s.P)), 3), VCOL(s.v), 3, { center: true });
    });
    // 頂點
    ['A', 'B', 'C'].forEach(function (k) {
      const p = P[k], ctr = mulv(add(add(P.A, P.B), P.C), 1 / 3);
      const d = sub(p, ctr), L = len(d) || 1;
      const q = add(p, mulv(d, 18 / viewCur.s / L));
      D.ball(c, X(p[0]), Y(p[1]), state.mode === 'free' ? 8 : 6, VCOL(k), { glow: state.drag && state.drag.k === k ? 0.65 : 0.3 });
      labels.push({ x: X(q[0]), y: Y(q[1]), text: k, col: VCOL(k), pri: 4, center: true, font: fnt(13, 800) });
    });
  }
  /** SSA：射線、以 C 為圓心半徑 a 的圓、高 h、另一個解 */
  function drawSSA(c, cur, labels) {
    const I = state.inp, Cp = cur.P.C;
    const xr = Math.max(invX(PR.x + PR.w), 1);
    c.strokeStyle = alpha(C.text, 0.55); c.lineWidth = 1.6;
    seg(c, [0, 0], [xr, 0]);
    // 圓
    c.strokeStyle = alpha(C['lc-a'], 0.8); c.lineWidth = 1.6; c.setLineDash([6, 5]);
    c.beginPath(); c.arc(X(Cp[0]), Y(Cp[1]), I.a * viewCur.s, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    // 高 h = b sin A
    const h = I.b * Math.sin(I.A * D2R);
    c.strokeStyle = alpha(C['lc-h'], 0.9); c.lineWidth = 1.4; c.setLineDash([4, 4]); seg(c, Cp, [Cp[0], 0]); c.setLineDash([]);
    lbl(labels, [Cp[0], h / 2], 'h = b sin A = ' + fmt(h, 3), C['lc-h'], 2);
    if (cur.ghost) {
      c.strokeStyle = alpha(C['lc-a'], 0.45); c.lineWidth = 2; c.setLineDash([3, 5]); seg(c, Cp, cur.ghost); c.setLineDash([]);
      c.strokeStyle = alpha(C['lc-b'], 0.45); seg(c, [0, 0], cur.ghost);
      D.ball(c, X(cur.ghost[0]), Y(cur.ghost[1]), 5, alpha(C['lc-b'], 0.55), { glow: 0 });
      lbl(labels, cur.ghost, T('另一個解', 'other solution'), C.muted, 1);
    }
    if (!cur.ok) {
      c.strokeStyle = C['lc-c']; c.lineWidth = 3; seg(c, [0, 0], Cp);
      D.ball(c, X(0), Y(0), 6, C['lc-a'], { glow: 0.3 }); D.ball(c, X(Cp[0]), Y(Cp[1]), 6, C['lc-c'], { glow: 0.3 });
      lbl(labels, [0, 0], 'A', C['lc-a'], 4); lbl(labels, Cp, 'C', C['lc-c'], 4);
      lbl(labels, [Cp[0] + I.a * 0.7, Cp[1] + I.a * 0.7], 'a = ' + fmt(I.a, 3), C['lc-a'], 3);
    }
  }
  function drawFail(c, cur, labels) {
    const I = state.inp;
    if (state.mode === 'sss') {
      // 邊 c 放好，以 A 為圓心半徑 b、以 B 為圓心半徑 a 的兩個圓碰不到
      c.strokeStyle = C['lc-c']; c.lineWidth = 3; seg(c, [0, 0], [I.c, 0]);
      c.setLineDash([6, 5]); c.lineWidth = 1.6;
      c.strokeStyle = alpha(C['lc-b'], 0.8); c.beginPath(); c.arc(X(0), Y(0), I.b * viewCur.s, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = alpha(C['lc-a'], 0.8); c.beginPath(); c.arc(X(I.c), Y(0), I.a * viewCur.s, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
      D.ball(c, X(0), Y(0), 6, C['lc-a'], { glow: 0.3 }); D.ball(c, X(I.c), Y(0), 6, C['lc-b'], { glow: 0.3 });
      lbl(labels, [0, 0], 'A', C['lc-a'], 4); lbl(labels, [I.c, 0], 'B', C['lc-b'], 4);
      lbl(labels, [0, I.b], 'b = ' + fmt(I.b, 3), C['lc-b'], 3); lbl(labels, [I.c, I.a], 'a = ' + fmt(I.a, 3), C['lc-a'], 3);
    } else if (state.mode === 'asa') {
      c.strokeStyle = C['lc-c']; c.lineWidth = 3; seg(c, [0, 0], [I.c, 0]);
      const L = 3 * I.c;
      c.lineWidth = 2; c.setLineDash([6, 5]);
      c.strokeStyle = alpha(C['lc-a'], 0.8); seg(c, [0, 0], [L * Math.cos(I.A * D2R), L * Math.sin(I.A * D2R)]);
      c.strokeStyle = alpha(C['lc-b'], 0.8); seg(c, [I.c, 0], [I.c - L * Math.cos(I.B * D2R), L * Math.sin(I.B * D2R)]);
      c.setLineDash([]);
      D.ball(c, X(0), Y(0), 6, C['lc-a'], { glow: 0.3 }); D.ball(c, X(I.c), Y(0), 6, C['lc-b'], { glow: 0.3 });
      lbl(labels, [0, 0], 'A', C['lc-a'], 4); lbl(labels, [I.c, 0], 'B', C['lc-b'], 4);
    } else if (state.mode === 'free') {
      c.strokeStyle = C['lc-tri']; c.lineWidth = 3;
      seg(c, state.P.A, state.P.B); seg(c, state.P.B, state.P.C); seg(c, state.P.C, state.P.A);
      ['A', 'B', 'C'].forEach(function (k) { const p = state.P[k]; D.ball(c, X(p[0]), Y(p[1]), 8, VCOL(k), { glow: 0.3 }); lbl(labels, p, k, VCOL(k), 4); });
    }
  }
  function drawChal(c, cur, labels) {
    const P = cur.P, g = state.chal.g, s = g.sol;
    poly(c, [P.A, P.B, P.C]);
    c.fillStyle = alpha(C['lc-tri'], D.dark ? 0.16 : 0.13); c.fill();
    sidesOf(P).forEach(function (sd) { c.strokeStyle = VCOL(sd.v); c.lineWidth = 3; seg(c, sd.P, sd.Q); });
    const rp = clampv(Math.min(s.a, s.b, s.c) * viewCur.s * 0.22, 18, 30);
    const show = function (k) { return k in g.given || k === g.ask; };
    const txt = function (k) { return k === g.ask ? k + ' = ?' : k + ' = ' + (/[ABC]/.test(k) ? fmt(g.given[k], 3) + '°' : fmt(g.given[k], 3)); };
    [['A', P.A, P.B, P.C], ['B', P.B, P.C, P.A], ['C', P.C, P.A, P.B]].forEach(function (z) {
      if (!show(z[0])) return;
      const col = z[0] === g.ask ? C.accent : VCOL(z[0]);
      const at = angleArc(c, z[1], z[2], z[3], col, rp, false);
      labels.push({ x: at[0], y: at[1], text: txt(z[0]), col: col, pri: 3, center: true, font: fnt(12, 700) });
    });
    sidesOf(P).forEach(function (sd) {
      if (!show(sd.name)) return;
      const mid = mulv(add(sd.P, sd.Q), 0.5), out = squareOn(sd.P, sd.Q, sd.R).n;
      lbl(labels, add(mid, mulv(out, 16 / viewCur.s)), txt(sd.name), sd.name === g.ask ? C.accent : VCOL(sd.v), 3, { center: true, font: fnt(12, 700) });
    });
    ['A', 'B', 'C'].forEach(function (k) {
      const p = P[k], ctr = mulv(add(add(P.A, P.B), P.C), 1 / 3);
      const d = sub(p, ctr), L = len(d) || 1;
      D.ball(c, X(p[0]), Y(p[1]), 6, VCOL(k), { glow: 0.3 });
      const q = add(p, mulv(d, 18 / viewCur.s / L));
      labels.push({ x: X(q[0]), y: Y(q[1]), text: k, col: VCOL(k), pri: 4, center: true, font: fnt(13, 800) });
    });
  }

  // ---------- 讀數 ----------
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  let eqKey = null;
  function kindText(m) {
    if (!m) return '—';
    const k = M.kind(m, 1e-6);
    let t = { acute: T('銳角三角形', 'acute'), right: T('直角三角形', 'right-angled'), obtuse: T('鈍角三角形', 'obtuse'), degenerate: T('退化（一直線）', 'degenerate (a line)') }[k];
    const eq = function (u, v) { return Math.abs(u - v) <= 1e-6 * Math.max(1, u, v); };
    if (eq(m.a, m.b) && eq(m.b, m.c)) t = T('正三角形', 'equilateral');
    else if (eq(m.a, m.b) || eq(m.b, m.c) || eq(m.c, m.a)) t = T('等腰', 'isosceles ') + t;
    return t;
  }
  function updateReadouts() {
    const cur = current(), m = cur.ok ? cur.m : null, hide = !!state.chal;
    if (!m || hide) {
      ['rSides', 'rAngs', 'rKind', 'rArea', 'rPer', 'rSine', 'rR'].forEach(function (id) { setHTML(id, hide ? T('（挑戰中）', '(challenge)') : '—'); });
      if (!hide) setHTML('rKind', T('圍不起來', 'no triangle'));
    } else {
      setHTML('rSides', fmt(m.a, 3) + T('、', ', ') + fmt(m.b, 3) + T('、', ', ') + fmt(m.c, 3));
      setHTML('rAngs', deg(m.A) + T('、', ', ') + deg(m.B) + T('、', ', ') + deg(m.C));
      setHTML('rKind', kindText(m) + (state.mode === 'ssa' ? T('（', ' (') + cur.nSol + T(' 個解）', cur.nSol === 1 ? ' solution)' : ' solutions)') : ''));
      setHTML('rArea', fmt(m.area, 3));
      setHTML('rPer', fmt(m.perimeter, 3));
      setHTML('rSine', [m.a / Math.sin(m.A * D2R), m.b / Math.sin(m.B * D2R), m.c / Math.sin(m.C * D2R)].map(function (v) { return fmt(v, 3); }).join(T('、', ', ')));
      setHTML('rR', fmt(m.R, 3) + T('（2R = ', ' (2R = ') + fmt(2 * m.R, 3) + T('）', ')'));
    }
    const vtx = state.mode === 'sas' || state.mode === 'ssa' ? 'A' : 'C';
    const k2 = JSON.stringify([m && [m.a, m.b, m.c], vtx, hide, window.LabSettings ? LabSettings.get('lang') : '']);
    if (eqKey !== k2) {
      eqKey = k2;
      let tex;
      if (hide) tex = '\\text{' + T('用正弦定理或餘弦定理', 'Use the law of sines or cosines') + '}';
      else if (!m) tex = state.mode === 'sss' ? 'a + b > c,\\ b + c > a,\\ c + a > b' : state.mode === 'asa' ? 'A + B < 180^\\circ' : 'a \\ge h = b\\sin A';
      else {
        const sd = vtx === 'A' ? ['a', 'b', 'c', m.a, m.b, m.c, m.A] : ['c', 'a', 'b', m.c, m.a, m.b, m.C];
        const term = 2 * sd[4] * sd[5] * Math.cos(sd[6] * D2R);
        const n = function (v) { return fmt(v, 2).replace(/−/g, '-'); };
        tex = '\\begin{gathered}' + sd[0] + '^2 = ' + sd[1] + '^2 + ' + sd[2] + '^2 - 2' + sd[1] + sd[2] + '\\cos ' + vtx + '\\\\ ' + n(sd[3] * sd[3]) + ' = ' + n(sd[4] * sd[4]) + ' + ' + n(sd[5] * sd[5]) +
          (term >= 0 ? ' - ' + n(term) : ' + ' + n(-term)) + '\\end{gathered}';
      }
      const el = $('rEq');
      if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); } catch (e) { el.textContent = tex; } }
      else el.textContent = tex;
    }
  }
  function modeNote() {
    const N = {
      free: ['拖曳 A、B、C（靠近 0.5 的格點會吸附）。點三角形外面，最近的頂點會移過去。', 'Drag A, B and C (they snap to the half-unit grid). Tap outside the triangle and the nearest corner jumps there.'],
      sss: ['三邊 a、b、c：任兩邊的和要大於第三邊，角用餘弦定理求。', 'Three sides: each must be shorter than the other two together; the angles come from the law of cosines.'],
      sas: ['兩邊 b、c 與夾角 A：餘弦定理先求出 a。', 'Two sides b, c and the angle A between them: the law of cosines gives a first.'],
      asa: ['兩角 A、B 與夾邊 c：C = 180° − A − B，再用正弦定理。', 'Two angles A, B and the side c between them: C = 180° − A − B, then the law of sines.'],
      ssa: ['角 A、鄰邊 b、對邊 a：以 C 為圓心、半徑 a 的圓和射線可能交 0、1、2 點。', 'Angle A, the side b next to it and the side a opposite: a circle of radius a about C may meet the ray 0, 1 or 2 times.']
    }[state.mode];
    $('modeNote').textContent = T(N[0], N[1]);
  }

  // ---------- 狀態列 ----------
  function setStatus(t) { $('status').textContent = t || ''; }
  function describe() {
    if (state.chal) return;
    const cur = current(), I = state.inp;
    if (!cur.ok) {
      if (state.mode === 'sss') {
        const s = [I.a, I.b, I.c].slice().sort(function (x, y) { return x - y; });
        setStatus(T('圍不起來：兩個短邊加起來 ', 'No triangle: the two shorter sides add up to ') + fmt(s[0] + s[1], 3) + T('，不比最長的 ', ', not more than the longest, ') + fmt(s[2], 3) + T(' 長。兩個圓碰不到（或只碰在線上）。', '. The two circles do not meet (or meet only on the line).'));
      } else if (state.mode === 'asa') setStatus(T('圍不起來：A + B = ', 'No triangle: A + B = ') + deg(I.A + I.B) + T('，兩條射線不會相交。', ', so the two rays never meet.'));
      else if (state.mode === 'ssa') setStatus(I.A >= 90 ? T('A 是鈍角或直角時，a 必須比 b 長才圍得起來。', 'With A obtuse or right, a must be longer than b.') : T('a = ', 'a = ') + fmt(I.a, 3) + T(' 比高 h = b sin A = ', ' is shorter than the height h = b sin A = ') + fmt(I.b * Math.sin(I.A * D2R), 3) + T(' 還短，圓碰不到射線：無解。', ': the circle misses the ray, no solution.'));
      else setStatus(T('三點在一直線上，不是三角形。', 'The three points are on a line: no triangle.'));
      return;
    }
    const m = cur.m, k = M.kind(m, 1e-6);
    const big = m.A >= m.B && m.A >= m.C ? 'A' : m.B >= m.C ? 'B' : 'C';
    const where = { acute: T('外心在三角形裡面', 'the circumcentre is inside'), right: T('外心剛好在斜邊的中點', 'the circumcentre is the midpoint of the hypotenuse'), obtuse: T('外心跑到三角形外面', 'the circumcentre is outside') }[k];
    let msg = T('最大角 ', 'Largest angle ') + big + ' = ' + deg(m[big]) + T('，', ', ') + kindText(m) + T('；', '; ') + where + T('。', '.');
    if (state.mode === 'ssa') {
      const why = { two: T('h < a < b，兩解（B 的兩個角互補）。', 'h < a < b: two solutions (the two angles B add to 180°).'), right: T('a = h，一解，而且是直角。', 'a = h: one solution, with a right angle.'), big: T('a ≥ b，只有一解。', 'a ≥ b: one solution.') }[cur.why] || '';
      msg = why + ' ' + msg;
    }
    if (state.showSq && k === 'obtuse') msg += T(' 鈍角時 −2ab cos C 變成加，正方形不再切成六塊。', ' With an obtuse angle, −2ab cos C becomes an addition and the squares are no longer cut into six pieces.');
    setStatus(msg);
  }

  // ---------- 控制項 ----------
  const el = { ga: $('ga'), gb: $('gb'), sa: $('sa'), sb: $('sb'), sc: $('sc') };
  const KEY = { ga: 'A', gb: 'B', sa: 'a', sb: 'b', sc: 'c' };
  function setSlider(e, v) { applying = true; if (window.LabNum) window.LabNum.set(e, v); else e.value = v; applying = false; }
  function syncSliders() { Object.keys(KEY).forEach(function (id) { setSlider(el[id], state.inp[KEY[id]]); }); refreshOutputs(); }
  function refreshOutputs() {
    Object.keys(KEY).forEach(function (id) { $(id + 'o').textContent = fmt(state.inp[KEY[id]], 3); });
  }
  const USE = { free: [], sss: ['sa', 'sb', 'sc'], sas: ['ga', 'sb', 'sc'], asa: ['ga', 'gb', 'sc'], ssa: ['ga', 'sb', 'sa'] };
  function showPanels() {
    document.querySelectorAll('#modes button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === state.mode)); });
    $('cardGiven').hidden = state.mode === 'free' || !!state.chal;
    ['A', 'B', 'a', 'b', 'c'].forEach(function (k) {
      const id = { A: 'ga', B: 'gb', a: 'sa', b: 'sb', c: 'sc' }[k];
      $('box' + k).hidden = USE[state.mode].indexOf(id) < 0;
    });
    // 依模式排順序：角在前、邊在後（SSA：A、b、a）
    $('ssaRow').hidden = !(state.mode === 'ssa' && current().nSol === 2);
    modeNote();
  }
  function refresh() { cache = null; refreshOutputs(); updateReadouts(); describe(); $('ssaRow').hidden = !(state.mode === 'ssa' && !state.chal && current().nSol === 2); requestDraw(); }
  let lastKind = null, lastN = null;
  function soundCheck() {
    const cur = current();
    const k = cur.ok ? M.kind(cur.m, 1e-6) : 'none';
    if (lastKind !== null && k !== lastKind) blip(k === 'right' ? 784 : k === 'obtuse' ? 392 : k === 'none' ? 220 : 523, k === 'none' ? 'triangle' : 'sine', 0.12);
    lastKind = k;
    if (state.mode === 'ssa') { if (lastN !== null && cur.nSol !== lastN) blip(330 + 165 * cur.nSol, 'sine', 0.14); lastN = cur.nSol; }
    else lastN = null;
  }
  /** 使用者改了東西：回報任務 */
  function edited(src) {
    refresh();
    soundCheck();
    emitState(src);
  }
  Object.keys(KEY).forEach(function (id) {
    el[id].addEventListener('input', function () { if (applying) return; state.inp[KEY[id]] = r6(val(el[id])); refresh(); });
    el[id].addEventListener('change', function () { if (applying) return; state.inp[KEY[id]] = r6(val(el[id])); edited('slider'); });
  });
  document.querySelectorAll('#modes button').forEach(function (b) {
    b.addEventListener('click', function () {
      const m = b.getAttribute('data-mode');
      if (m === state.mode && !state.chal) return;
      if (state.chal) quitChal(true);
      state.mode = m; state.ssaSel = 0;
      cache = null; viewCur = null;
      showPanels(); blip(523, 'sine', 0.1);
      edited('mode');
    });
  });
  $('ssaSel').addEventListener('click', function () { state.ssaSel = 1 - state.ssaSel; blip(659, 'sine', 0.1); edited('ssaSel'); });
  ['showSq', 'showCirc', 'showAng', 'showH'].forEach(function (id) {
    $(id).addEventListener('change', function () { state[id] = $(id).checked; cache = null; requestDraw(); describe(); });
  });

  // ---------- 記下、全部清除 ----------
  function renderLog() {
    const t = $('log');
    if (!state.log.length) { t.innerHTML = ''; $('logEmpty').hidden = false; return; }
    $('logEmpty').hidden = true;
    let h = '<thead><tr><th>#</th><th>' + T('已知', 'Given') + '</th><th>a</th><th>b</th><th>c</th><th>A</th><th>B</th><th>C</th></tr></thead><tbody>';
    state.log.forEach(function (r, i) { h += '<tr><td>' + (i + 1) + '</td><td>' + r.g + '</td><td>' + r.v.join('</td><td>') + '</td></tr>'; });
    t.innerHTML = h + '</tbody>';
  }
  $('mark').addEventListener('click', function () {
    if (state.chal) { setStatus(T('挑戰中先不記錄。', 'Not during a challenge.')); return; }
    const cur = current();
    if (!cur.ok) { setStatus(T('圍不起來的三角形沒辦法記。', 'There is no triangle to record.')); return; }
    const m = cur.m;
    state.log.push({ g: { free: T('拖曳', 'drag'), sss: 'SSS', sas: 'SAS', asa: 'ASA', ssa: 'SSA' }[state.mode], v: [fmt(m.a, 3), fmt(m.b, 3), fmt(m.c, 3), deg(m.A), deg(m.B), deg(m.C)] });
    if (state.log.length > 40) state.log.shift();
    renderLog(); blip(659, 'sine', 0.1);
    setStatus(T('記下第 ', 'Recorded #') + state.log.length + T(' 組。', '.'));
  });
  $('clear').addEventListener('click', function () {
    state.log = []; renderLog();
    if (state.chal) quitChal(true);
    state.streak = 0; state.times = []; state.round = 0;
    setChalMsg(''); $('newChal').textContent = T('出一題', 'New problem');
    blip(330); setStatus(T('記錄與挑戰都清除了；三角形與滑桿保留。', 'Records and the challenge are cleared; the triangle and the sliders are kept.'));
    refresh();
  });

  // ---------- 畫布操作（拖曳模式） ----------
  function evPos(ev) { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  function snapPt(x, y, pxTol) {
    const tol = pxTol / viewCur.s;
    const hx = Math.round(x * 2) / 2, hy = Math.round(y * 2) / 2;
    if (Math.hypot(hx - x, hy - y) < tol) return [hx, hy];
    return [r6(Math.round(x * 20) / 20), r6(Math.round(y * 20) / 20)];
  }
  function hitTest(p) {
    if (!viewCur || state.mode !== 'free' || state.chal) return null;
    let best = null, bd = 22;
    ['A', 'B', 'C'].forEach(function (k) { const q = state.P[k], d = Math.hypot(p.x - X(q[0]), p.y - Y(q[1])); if (d < bd) { bd = d; best = k; } });
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
    if (!state.drag) { cv.style.cursor = hitTest(p) ? 'grab' : (state.mode === 'free' && !state.chal ? 'crosshair' : 'default'); return; }
    if (!state.drag.moved && downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) < 4) return;
    state.drag.moved = true;
    const s = snapPt(invX(p.x), invY(p.y), 10);
    state.P[state.drag.k] = [clampv(s[0], -20, 30), clampv(s[1], -20, 30)];
    refresh(); soundCheck();
  });
  function endDrag(ev) {
    const dr = state.drag, down = downAt;
    state.drag = null; downAt = null;
    if (!dr) {
      // 拖曳模式下點一下空白處：最近的頂點移過去
      if (ev && ev.type === 'pointerup' && down && viewCur && state.mode === 'free' && !state.chal) {
        const p = evPos(ev);
        if (Math.hypot(p.x - down.x, p.y - down.y) < 6) {
          const x = invX(p.x), y = invY(p.y);
          let best = 'A', bd = Infinity;
          ['A', 'B', 'C'].forEach(function (k) { const q = state.P[k], d = Math.hypot(q[0] - x, q[1] - y); if (d < bd) { bd = d; best = k; } });
          const s = snapPt(x, y, 12);
          state.P[best] = [clampv(s[0], -20, 30), clampv(s[1], -20, 30)];
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
        if (state.mode !== 'free' || state.chal) return false;
        const st = big ? 0.5 : 0.1, p = state.P[k];
        state.P[k] = [r6(clampv(Math.round((p[0] + dx * st) * 1e4) / 1e4, -20, 30)), r6(clampv(Math.round((p[1] + dy * st) * 1e4) / 1e4, -20, 30))];
        blip(494, 'sine', 0.08); edited('key'); return true;
      };
    };
    kb = window.LabKeys.attach(cv, {
      label: T('三角形畫布。拖曳模式下 Enter 切換頂點 A、B、C，方向鍵移動 0.1，Shift 移 0.5。', 'Triangle canvas. In drag mode Enter switches between the corners A, B and C; arrow keys move by 0.1, Shift by 0.5.'),
      items: VN.map(function (k) {
        return {
          name: function () { return T('頂點 ', 'corner ') + k; }, move: mover(k),
          describe: function () {
            const cur = current();
            if (!cur.ok) return T('目前沒有三角形', 'There is no triangle now');
            return k + ' = (' + fmt(cur.P[k][0], 2) + ', ' + fmt(cur.P[k][1], 2) + T(')，角 ', '), angle ') + k + ' = ' + deg(cur.m[k]);
          }
        };
      }),
      onChange: function () { requestDraw(); }
    });
  }

  // ---------- 挑戰 ----------
  const chalMsg = $('chalMsg');
  function setChalMsg(msg, cls) { chalMsg.textContent = msg || ''; chalMsg.classList.toggle('ok', cls === 'ok'); chalMsg.classList.toggle('bad', cls === 'bad'); }
  function askName(k) { return /[ABC]/.test(k) ? T('角 ', 'angle ') + k + T('（度）', ' (degrees)') : T('邊 ', 'side ') + k; }
  function startChal() {
    const g = M.challenge(rand);
    state.chal = { g: g, t0: performance.now() };
    state.round++;
    cache = null; viewCur = null;
    showPanels();
    $('ansRow').hidden = false; $('quitChal').hidden = false;
    $('ansLabel').textContent = g.ask + ' =';
    $('ans').value = '';
    $('newChal').textContent = T('換一題', 'Another one');
    setChalMsg(T('第 ', 'Problem ') + state.round + T(' 題（', ' (') + g.type + T('）：求 ', '): find ') + askName(g.ask) + T('。', '.'));
    setStatus('');
    blip(523);
    refresh();
  }
  function quitChal(silent) {
    if (!state.chal) return;
    state.chal = null; state.streak = 0;
    $('ansRow').hidden = true; $('quitChal').hidden = true;
    $('newChal').textContent = T('出一題', 'New problem');
    setChalMsg(silent ? '' : T('放棄這題，連續答對中斷。', 'Gave up: the streak is broken.'));
    cache = null; viewCur = null;
    showPanels(); refresh();
  }
  $('newChal').addEventListener('click', function () { if (state.chal) state.streak = 0; startChal(); });
  $('quitChal').addEventListener('click', function () { quitChal(false); });
  function submit() {
    if (!state.chal) return;
    const raw = String($('ans').value).trim().replace(/[−–]/g, '-').replace(/[°度\s]/g, '').replace('，', '.');
    const v = raw === '' ? NaN : Number(raw);
    if (!isFinite(v)) { setChalMsg(T('請打一個數字。', 'Please type a number.'), 'bad'); return; }
    const g = state.chal.g, secs = (performance.now() - state.chal.t0) / 1000;
    const right = M.answerOK(v, g.ask, g.answer);
    const ans = /[ABC]/.test(g.ask) ? fmt(g.answer, 2) + '°' : fmt(g.answer, 3);
    if (right) {
      state.streak++; state.times.push(secs); if (state.times.length > 5) state.times.shift();
      setChalMsg(T('答對了！', 'Correct! ') + g.ask + ' = ' + ans + T('，用了 ', ', in ') + secs.toFixed(1) + T(' 秒，連續答對 ', ' s. Streak: ') + state.streak + T(' 題。', '.'), 'ok');
      chime();
    } else {
      state.streak = 0; state.times = [];
      setChalMsg(T('不對：', 'Not quite: ') + g.ask + ' = ' + ans + T('。', '.'), 'bad');
      blip(220, 'triangle', 0.14);
    }
    const last5 = state.streak >= 5 ? state.times.slice(-5).reduce(function (s, x) { return s + x; }, 0) : NaN;
    emit('guess', { correct: right, streak: state.streak, secs: secs, last5: last5, type: g.type });
    state.chal = null;
    $('ansRow').hidden = true; $('quitChal').hidden = true;
    $('newChal').textContent = T('出下一題', 'Next problem');
    cache = null; viewCur = null;
    showPanels(); refresh();
  }
  $('submitC').addEventListener('click', submit);
  $('ans').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); submit(); } });

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
    const cur = current(), m = cur.m, I = state.inp;
    const d = { src: src, mode: state.mode, chal: !!state.chal, ok: cur.ok, nSol: state.mode === 'ssa' ? cur.nSol : (cur.ok ? 1 : 0), why: cur.why, sel: state.ssaSel,
      inp: { a: I.a, b: I.b, c: I.c, A: I.A, B: I.B } };
    if (m) Object.assign(d, { a: m.a, b: m.b, c: m.c, A: m.A, B: m.B, C: m.C, area: m.area, perimeter: m.perimeter, R: m.R, r: m.r, kind: M.kind(m, 1e-6) });
    if (state.mode === 'ssa' && cur.sols.length) d.ssaRight = cur.sols.map(function (s) { return [s.A, s.B, s.C].some(function (x) { return Math.abs(x - 90) <= 0.3; }); });
    return d;
  }
  function emitState(src) { if (!state.chal) emit('tri', stateData(src)); }

  // 給測試用的介面（不影響畫面）
  window.__lc = {
    state: state, current: function () { cache = null; return current(); },
    xy: function (x, y) { return viewCur ? [X(x), Y(y)] : null; },
    seed: function (s) { let v = s >>> 0 || 1; rand = function () { v = (v * 16807) % 2147483647; return (v - 1) / 2147483646; }; }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  syncSliders(); showPanels(); renderLog(); updateSoundButton();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    eqKey = null;
    renderLog(); showPanels(); refreshOutputs(); updateReadouts(); describe(); updateSoundButton();
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
