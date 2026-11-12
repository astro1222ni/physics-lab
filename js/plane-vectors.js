/* plane-vectors.js — 「平面向量的線性組合與內積」的畫面與互動（數學計算在 plane-vectors-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 線性組合：a、b 鋪出斜坐標格子，P = x a + y b 沿著 x a、再 y b 走過去；可以標出 x + y = 1、x, y ≥ 0、平行四邊形、三角形等範圍。
 *   a、b 平行時格子塌成一條直線，P 只能在直線上。
 * 內積：a、b 的夾角、b 在 a 上的正射影（銳角綠、鈍角紅）、兩向量張出的平行四邊形。
 * 挑戰「走到星星」：新的 a、b 與目標點，只能用 x、y 的滑桿。 */
(function () {
  'use strict';
  const M = window.PlaneVecCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha;

  // ---------- 狀態 ----------
  const state = {
    mode: 'lin',
    a: [2, 1], b: [1, 2], x: 1, y: 1, region: 'none', grid: true, proj: true, area: false,
    chal: null, round: 0, streak: [], log: []
  };
  let rand = M.rng(((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0);
  let lastChal = null;
  let applying = false;

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'pv-a', 'pv-b', 'pv-p', 'pv-grid', 'pv-pos', 'pv-neg', 'pv-area', 'pv-t']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight, italic) { return (italic ? 'italic ' : '') + (weight ? weight + ' ' : '') + px + 'px ' + FONT; }

  // ---------- 數字 ----------
  function fmt(v, d) {
    if (v == null || isNaN(v)) return '—';
    let s = (Math.round(v * 1e9) / 1e9).toFixed(d == null ? 3 : d);
    if (s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, '');
    if (s === '-0') s = '0';
    return s.replace('-', '−');
  }
  const fmtT = function (v, d) { return fmt(v, d).replace('−', '-'); };
  const vecStr = function (u, d) { return '(' + fmt(u[0], d) + ', ' + fmt(u[1], d) + ')'; };
  const vecT = function (u, d) { return '(' + fmtT(u[0], d) + ',\\ ' + fmtT(u[1], d) + ')'; };
  /** 根號：整數平方和寫成 √n（完全平方數直接開出來） */
  function sqrtStr(n) { const r = Math.round(Math.sqrt(n)); return r * r === n ? String(r) : '√' + n; }
  function sqrtTex(n) { const r = Math.round(Math.sqrt(n)); return r * r === n ? String(r) : '\\sqrt{' + n + '}'; }
  const r3 = function (v) { return Math.round(v * 1000) / 1000; };

  // ---------- 目前的量 ----------
  function P() { return M.comb(state.a, state.b, state.x, state.y); }
  function QL() {
    const d = M.det(state.a, state.b);
    return { det: d, P: P(), inside: M.inRegion(state.region, state.x, state.y, 1e-9) };
  }
  function QD() {
    const a = state.a, b = state.b;
    return { dot: M.dot(a, b), det: M.det(a, b), aa: M.dot(a, a), bb: M.dot(b, b), th: M.angleDeg(a, b), pr: M.proj(b, a) };
  }

  // ---------- 畫布 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 480, F = null;
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    const narrow = cw < 600;
    ch = narrow ? Math.round(Math.max(340, Math.min(cw * 1.05, 440))) : 500;
    const P0 = { x0: 6, x1: cw - 6, y0: 6, y1: ch - 6 };
    const s = (P0.y1 - P0.y0) / 13.2; // 縱向 −6.6 到 6.6
    F = { narrow: narrow, P: P0, s: s, cx: (P0.x0 + P0.x1) / 2, cy: (P0.y0 + P0.y1) / 2 };
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    requestDraw();
  }
  const X = function (x) { return F.cx + x * F.s; };
  const Y = function (y) { return F.cy - y * F.s; };
  const xAt = function (px) { return (px - F.cx) / F.s; };
  const yAt = function (py) { return (F.cy - py) / F.s; };
  function xr() { return (F.P.x1 - F.P.x0) / 2 / F.s; }
  let rafId = 0;
  function requestDraw() { if (!rafId) rafId = requestAnimationFrame(function () { rafId = 0; draw(); }); }
  function clipP(c) { const P0 = F.P; c.beginPath(); D.roundRect(c, P0.x0, P0.y0, P0.x1 - P0.x0, P0.y1 - P0.y0, 8); c.clip(); }

  function baseGrid(c) {
    const P0 = F.P;
    D.roundRect(c, P0.x0, P0.y0, P0.x1 - P0.x0, P0.y1 - P0.y0, 8);
    c.fillStyle = alpha(C.text, D.dark ? 0.03 : 0.022); c.fill();
    c.save(); clipP(c);
    const W = Math.ceil(xr()) + 1, H = 7;
    c.lineWidth = 1;
    for (let i = -W; i <= W; i++) { c.strokeStyle = alpha(C.text, 0.06); c.beginPath(); c.moveTo(X(i), P0.y0); c.lineTo(X(i), P0.y1); c.stroke(); }
    for (let j = -H; j <= H; j++) { c.strokeStyle = alpha(C.text, 0.06); c.beginPath(); c.moveTo(P0.x0, Y(j)); c.lineTo(P0.x1, Y(j)); c.stroke(); }
    c.strokeStyle = alpha(C.text, 0.38); c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(P0.x0, Y(0)); c.lineTo(P0.x1, Y(0)); c.moveTo(X(0), P0.y0); c.lineTo(X(0), P0.y1); c.stroke();
    // 刻度數字（每 2 格）
    c.font = fnt(10); c.fillStyle = alpha(C.muted, 0.9); c.textAlign = 'center'; c.textBaseline = 'top';
    for (let i = -W; i <= W; i++) if (i && i % 2 === 0 && X(i) > P0.x0 + 10 && X(i) < P0.x1 - 10) c.fillText(String(i).replace('-', '−'), X(i), Y(0) + 3);
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let j = -6; j <= 6; j++) if (j && j % 2 === 0) c.fillText(String(j).replace('-', '−'), X(0) - 4, Y(j));
    c.restore();
  }
  function arrow(c, from, to, color, width, head) {
    const x0 = X(from[0]), y0 = Y(from[1]), x1 = X(to[0]), y1 = Y(to[1]);
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (L < 1) return;
    const ux = (x1 - x0) / L, uy = (y1 - y0) / L, h = Math.min(head || 13, L * 0.45);
    c.strokeStyle = color; c.fillStyle = color; c.lineWidth = width; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1 - ux * h * 0.8, y1 - uy * h * 0.8); c.stroke();
    c.beginPath(); c.moveTo(x1, y1);
    c.lineTo(x1 - ux * h - uy * h * 0.45, y1 - uy * h + ux * h * 0.45);
    c.lineTo(x1 - ux * h + uy * h * 0.45, y1 - uy * h - ux * h * 0.45);
    c.closePath(); c.fill();
    c.lineCap = 'butt';
  }
  /** 向量的名字標在箭頭旁邊（法線方向） */
  function vecLabel(c, u, name, color) {
    const L = Math.hypot(u[0], u[1]);
    if (!L) { D.haloText(c, name + ' = 0', X(0) + 10, Y(0) - 12, color, 'left', 'middle', fnt(14, 700, true)); return; }
    const nx = -u[1] / L, ny = u[0] / L;
    D.haloText(c, name, X(u[0] * 0.55) + nx * 14, Y(u[1] * 0.55) - ny * 14, color, 'center', 'middle', fnt(16, 700, true));
  }
  function tipBall(c, u, color) { D.ball(c, X(u[0]), Y(u[1]), 7, color, { glow: 0.3 }); }
  /** 直線 p + t d 在畫面裡的兩端 */
  function lineEnds(p, d) {
    const big = 40;
    return [[p[0] - d[0] * big, p[1] - d[1] * big], [p[0] + d[0] * big, p[1] + d[1] * big]];
  }
  function star(c, x, y, r, color) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const t = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      if (i) c.lineTo(x + rr * Math.cos(t), y + rr * Math.sin(t)); else c.moveTo(x + rr * Math.cos(t), y + rr * Math.sin(t));
    }
    c.closePath();
    c.fillStyle = alpha(color, 0.9); c.fill();
    c.strokeStyle = C['canvas-bg']; c.lineWidth = 1.5; c.stroke();
  }

  // =====================================================================
  // 線性組合
  // =====================================================================
  function drawLin(c) {
    const P0 = F.P, a = state.a, b = state.b, q = QL();
    baseGrid(c);
    c.save(); clipP(c);
    if (q.det !== 0) {
      // 斜坐標格子：四個角的係數範圍
      if (state.grid) {
        const cs = [[xAt(P0.x0), yAt(P0.y0)], [xAt(P0.x1), yAt(P0.y0)], [xAt(P0.x0), yAt(P0.y1)], [xAt(P0.x1), yAt(P0.y1)]].map(function (p) { return M.solve(a, b, p); });
        const xs = cs.map(function (s) { return s.x; }), ys = cs.map(function (s) { return s.y; });
        const xlo = Math.max(-60, Math.floor(Math.min.apply(null, xs))), xhi = Math.min(60, Math.ceil(Math.max.apply(null, xs)));
        const ylo = Math.max(-60, Math.floor(Math.min.apply(null, ys))), yhi = Math.min(60, Math.ceil(Math.max.apply(null, ys)));
        c.lineWidth = 1;
        for (let k = ylo; k <= yhi; k++) { // 平行 a、經過 k b
          const e = lineEnds(M.mul(k, b), a);
          c.strokeStyle = alpha(C['pv-grid'], k === 0 ? 0.6 : 0.22); c.lineWidth = k === 0 ? 1.6 : 1;
          c.beginPath(); c.moveTo(X(e[0][0]), Y(e[0][1])); c.lineTo(X(e[1][0]), Y(e[1][1])); c.stroke();
        }
        for (let k = xlo; k <= xhi; k++) { // 平行 b、經過 k a
          const e = lineEnds(M.mul(k, a), b);
          c.strokeStyle = alpha(C['pv-grid'], k === 0 ? 0.6 : 0.22); c.lineWidth = k === 0 ? 1.6 : 1;
          c.beginPath(); c.moveTo(X(e[0][0]), Y(e[0][1])); c.lineTo(X(e[1][0]), Y(e[1][1])); c.stroke();
        }
      }
      // 範圍
      const poly = M.regionPolygon(state.region, 60);
      if (poly) {
        c.fillStyle = alpha(C['pv-grid'], D.dark ? 0.2 : 0.16);
        c.beginPath();
        poly.forEach(function (pq, i) { const pt = M.comb(a, b, pq[0], pq[1]); if (i) c.lineTo(X(pt[0]), Y(pt[1])); else c.moveTo(X(pt[0]), Y(pt[1])); });
        c.closePath(); c.fill();
        c.strokeStyle = alpha(C['pv-grid'], 0.85); c.lineWidth = 2; c.stroke();
      } else if (state.region === 'line') {
        const e = lineEnds(a, M.sub(b, a));
        c.strokeStyle = alpha(C['pv-grid'], 0.9); c.lineWidth = 3; c.setLineDash([9, 5]);
        c.beginPath(); c.moveTo(X(e[0][0]), Y(e[0][1])); c.lineTo(X(e[1][0]), Y(e[1][1])); c.stroke(); c.setLineDash([]);
      }
    } else {
      // 平行：只張出一條直線
      const u = !M.isZero(a) ? a : b;
      if (!M.isZero(u)) {
        const e = lineEnds([0, 0], u);
        c.strokeStyle = alpha(C['pv-grid'], 0.75); c.lineWidth = 3; c.setLineDash([9, 5]);
        c.beginPath(); c.moveTo(X(e[0][0]), Y(e[0][1])); c.lineTo(X(e[1][0]), Y(e[1][1])); c.stroke(); c.setLineDash([]);
      }
    }
    c.restore();
    // 挑戰的星星
    if (state.chal) star(c, X(state.chal.T[0]), Y(state.chal.T[1]), 13, C['pv-t']);
    // 走法：O → x a → x a + y b
    const xa = M.mul(state.x, a), Pp = q.P;
    c.save(); c.globalAlpha = 0.85;
    c.setLineDash([6, 4]);
    arrow(c, [0, 0], xa, C['pv-a'], 2.4, 10);
    arrow(c, xa, Pp, C['pv-b'], 2.4, 10);
    c.setLineDash([]);
    c.restore();
    if (Math.hypot(X(xa[0]) - X(0), Y(xa[1]) - Y(0)) > 34 && state.x !== 1) D.pill(c, fmt(state.x) + 'a', X(xa[0] / 2), Y(xa[1] / 2) + 16, C['pv-a'], 'center', fnt(11.5, 700));
    if (Math.hypot(X(Pp[0]) - X(xa[0]), Y(Pp[1]) - Y(xa[1])) > 34) D.pill(c, fmt(state.y) + 'b', X((xa[0] + Pp[0]) / 2), Y((xa[1] + Pp[1]) / 2) + 16, C['pv-b'], 'center', fnt(11.5, 700));
    // 向量
    arrow(c, [0, 0], a, C['pv-a'], 3.6, 15);
    arrow(c, [0, 0], b, C['pv-b'], 3.6, 15);
    vecLabel(c, a, 'a', C['pv-a']); vecLabel(c, b, 'b', C['pv-b']);
    tipBall(c, a, C['pv-a']); tipBall(c, b, C['pv-b']);
    if (state.region === 'line' || state.region === 'tri' || state.region === 'para') {
      D.haloText(c, 'A', X(a[0]) + 10, Y(a[1]) + 12, C['pv-a'], 'left', 'middle', fnt(13, 700));
      D.haloText(c, 'B', X(b[0]) + 10, Y(b[1]) + 12, C['pv-b'], 'left', 'middle', fnt(13, 700));
    }
    // P
    const px = X(Pp[0]), py = Y(Pp[1]);
    D.ball(c, px, py, 8, C['pv-p'], { glow: 0.4 });
    const lab = 'P = ' + fmt(state.x) + 'a ' + (state.y < 0 ? '− ' + fmt(-state.y) : '+ ' + fmt(state.y)) + 'b';
    D.pill(c, lab, Math.max(F.P.x0 + 6, Math.min(F.P.x1 - 6, px + (px > F.P.x1 - 140 ? -12 : 12))), Math.max(F.P.y0 + 22, py - 12), C['pv-p'], px > F.P.x1 - 140 ? 'right' : 'left', fnt(12, 700));
  }

  // =====================================================================
  // 內積
  // =====================================================================
  function drawDot(c) {
    const a = state.a, b = state.b, q = QD();
    baseGrid(c);
    c.save(); clipP(c);
    // 平行四邊形
    if (state.area) {
      const s = M.add(a, b);
      c.fillStyle = alpha(C['pv-area'], D.dark ? 0.22 : 0.18);
      c.beginPath(); c.moveTo(X(0), Y(0)); c.lineTo(X(a[0]), Y(a[1])); c.lineTo(X(s[0]), Y(s[1])); c.lineTo(X(b[0]), Y(b[1])); c.closePath(); c.fill();
      c.strokeStyle = alpha(C['pv-area'], 0.8); c.lineWidth = 1.5; c.setLineDash([5, 4]);
      c.beginPath(); c.moveTo(X(a[0]), Y(a[1])); c.lineTo(X(s[0]), Y(s[1])); c.lineTo(X(b[0]), Y(b[1])); c.stroke(); c.setLineDash([]);
    }
    // a 所在的直線
    if (!M.isZero(a)) {
      const e = lineEnds([0, 0], a);
      c.strokeStyle = alpha(C['pv-a'], 0.3); c.lineWidth = 1.2; c.setLineDash([3, 5]);
      c.beginPath(); c.moveTo(X(e[0][0]), Y(e[0][1])); c.lineTo(X(e[1][0]), Y(e[1][1])); c.stroke(); c.setLineDash([]);
    }
    c.restore();
    // 正射影
    if (state.proj && q.pr && !M.isZero(b)) {
      const f = q.pr.v, col = q.dot > 0 ? C['pv-pos'] : q.dot < 0 ? C['pv-neg'] : C.muted;
      c.save();
      c.strokeStyle = alpha(C.text, 0.55); c.lineWidth = 1.4; c.setLineDash([4, 4]);
      c.beginPath(); c.moveTo(X(b[0]), Y(b[1])); c.lineTo(X(f[0]), Y(f[1])); c.stroke(); c.setLineDash([]);
      // 直角記號
      const La = Math.sqrt(q.aa), ux = a[0] / La, uy = a[1] / La, db = M.sub(b, f), Lb = Math.hypot(db[0], db[1]);
      if (Lb > 0.2) {
        const vx = db[0] / Lb, vy = db[1] / Lb, k = 10 / F.s;
        const p1 = [f[0] + vx * k, f[1] + vy * k], p2 = [p1[0] + ux * k * Math.sign(-q.pr.k || 1), p1[1] + uy * k * Math.sign(-q.pr.k || 1)], p3 = [f[0] + ux * k * Math.sign(-q.pr.k || 1), f[1] + uy * k * Math.sign(-q.pr.k || 1)];
        c.strokeStyle = alpha(C.text, 0.6); c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(X(p1[0]), Y(p1[1])); c.lineTo(X(p2[0]), Y(p2[1])); c.lineTo(X(p3[0]), Y(p3[1])); c.stroke();
      }
      c.globalAlpha = 0.6;
      arrow(c, [0, 0], f, col, 9, 18);
      c.restore();
    }
    // 夾角
    if (q.th != null) {
      const ta = Math.atan2(a[1], a[0]), tb = Math.atan2(b[1], b[0]);
      let d = tb - ta; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const r = 26;
      c.strokeStyle = alpha(C.accent, 0.9); c.lineWidth = 2;
      c.beginPath(); c.arc(X(0), Y(0), r, -ta, -(ta + d), d > 0); c.stroke();
      const tm = ta + d / 2;
      D.pill(c, 'θ = ' + fmt(q.th, 1) + '°', X(0) + Math.cos(tm) * (r + 30), Y(0) - Math.sin(tm) * (r + 30) + 5, C.accent, 'center', fnt(12, 700));
    }
    arrow(c, [0, 0], a, C['pv-a'], 3.6, 15);
    arrow(c, [0, 0], b, C['pv-b'], 3.6, 15);
    vecLabel(c, a, 'a', C['pv-a']); vecLabel(c, b, 'b', C['pv-b']);
    tipBall(c, a, C['pv-a']); tipBall(c, b, C['pv-b']);
    if (state.area) {
      const s = M.add(a, b);
      D.pill(c, T('面積 ', 'area ') + fmt(Math.abs(q.det)), X(s[0] / 2), Y(s[1] / 2) + 5, C['pv-area'], 'center', fnt(12, 700));
    }
  }

  // ---------- 主畫面 ----------
  let kb = null;
  function draw() {
    if (!F) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(ctx, cw, ch);
    if (state.mode === 'lin') drawLin(ctx); else drawDot(ctx);
    if (kb && kb.focused()) {
      const i = kb.index(), u = i === 0 ? state.a : i === 1 ? state.b : P();
      ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(X(u[0]), Y(u[1]), 14, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // =====================================================================
  // 讀數與算式
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  const eqKey = {};
  function setEq(id, tex) {
    if (eqKey[id] === tex) return;
    eqKey[id] = tex;
    const el = $(id);
    if (!tex) { el.textContent = ''; return; }
    if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); } catch (e) { el.textContent = tex; } }
    else el.textContent = tex;
  }
  const REG_NAME = function (r) {
    return r === 'line' ? T('直線 AB（x + y = 1）', 'the line AB (x + y = 1)') : r === 'cone' ? T('角 AOB（x, y ≥ 0）', 'the angle AOB (x, y ≥ 0)') : r === 'para' ? T('平行四邊形', 'the parallelogram') : r === 'tri' ? T('三角形 OAB', 'the triangle OAB') : '';
  };
  function updateReadouts() {
    const a = state.a, b = state.b;
    if (state.mode === 'lin') {
      const q = QL();
      setHTML('rXY', fmt(state.x) + T('、', ', ') + fmt(state.y));
      setHTML('rP', vecStr(q.P));
      setHTML('rDet', fmt(q.det) + (q.det === 0 ? T('（平行）', ' (parallel)') : ''));
      setHTML('rIn', state.region === 'none' ? '—' : q.inside ? T('在', 'yes') : T('不在', 'no'));
      setEq('rEq', '\\vec p = ' + fmtT(state.x) + '\\,' + vecT(a) + (state.y < 0 ? ' - ' + fmtT(-state.y) : ' + ' + fmtT(state.y)) + '\\,' + vecT(b) + ' = ' + vecT(q.P));
      if (q.det !== 0) setEq('rEq2', 'x = \\frac{\\det(\\vec p, \\vec b)}{\\det(\\vec a, \\vec b)} = \\frac{' + fmtT(M.det(q.P, b)) + '}{' + fmtT(q.det) + '},\\quad y = \\frac{\\det(\\vec a, \\vec p)}{\\det(\\vec a, \\vec b)} = \\frac{' + fmtT(M.det(a, q.P)) + '}{' + fmtT(q.det) + '}');
      else setEq('rEq2', '\\det(\\vec a, \\vec b) = ' + fmtT(a[0]) + '\\cdot' + (b[1] < 0 ? '(' + fmtT(b[1]) + ')' : fmtT(b[1])) + ' - ' + (a[1] < 0 ? '(' + fmtT(a[1]) + ')' : fmtT(a[1])) + '\\cdot' + (b[0] < 0 ? '(' + fmtT(b[0]) + ')' : fmtT(b[0])) + ' = 0');
    } else {
      const q = QD();
      setHTML('rLen', sqrtStr(q.aa) + T('、', ', ') + sqrtStr(q.bb));
      setHTML('rDot', fmt(q.dot));
      setHTML('rAng', q.th == null ? '—' : fmt(q.th, 2) + '°');
      setHTML('rProj', q.pr ? vecStr(q.pr.v, 3) : '—');
      setHTML('rArea', fmt(Math.abs(q.det)));
      setEq('rEq', '\\vec a \\cdot \\vec b = ' + fmtT(a[0]) + '\\cdot' + (b[0] < 0 ? '(' + fmtT(b[0]) + ')' : fmtT(b[0])) + ' + ' + (a[1] < 0 ? '(' + fmtT(a[1]) + ')' : fmtT(a[1])) + '\\cdot' + (b[1] < 0 ? '(' + fmtT(b[1]) + ')' : fmtT(b[1])) + ' = ' + fmtT(q.dot) +
        (q.th != null ? ',\\quad \\cos\\theta = \\frac{' + fmtT(q.dot) + '}{' + sqrtTex(q.aa) + '\\cdot ' + sqrtTex(q.bb) + '}' : ''));
      setEq('rEq2', q.pr ? '\\text{proj}_{\\vec a}\\vec b = \\frac{' + fmtT(q.dot) + '}{' + q.aa + '}\\,' + vecT(a) + ' = ' + vecT(q.pr.v, 3) + ',\\quad |\\det(\\vec a, \\vec b)| = ' + fmtT(Math.abs(q.det)) : '');
    }
    setHTML('status', statusText());
  }
  function statusText() {
    const a = state.a, b = state.b;
    if (state.mode === 'lin') {
      const q = QL();
      if (state.chal) return T('只用 x、y 的滑桿（或打字）把 P 移到星星上：沿著格子先走 x 個 a、再走 y 個 b。', 'Use only the x and y sliders (or type) to put P on the star: walk x steps of a along the grid, then y steps of b.');
      if (q.det === 0) {
        if (M.isZero(a) && M.isZero(b)) return T('a、b 都是零向量：只能到原點。', 'a and b are both zero: only the origin can be reached.');
        return T('a、b 平行（det = 0）：x a + y b 只能落在這條直線上，直線外的點到不了；直線上的點有無限多種寫法。', 'a and b are parallel (det = 0): x a + y b stays on this line. Points off the line cannot be reached; points on it can be written in infinitely many ways.');
      }
      if (state.region !== 'none') return (q.inside ? T('P 在', 'P is in ') : T('P 不在', 'P is not in ')) + REG_NAME(state.region) + T('上。', '.') + (state.region === 'line' && q.inside ? T('AP : PB = ' + fmt(state.y) + ' : ' + fmt(state.x) + '。', ' AP : PB = ' + fmt(state.y) + ' : ' + fmt(state.x) + '.') : '');
      return T('a、b 不平行，平面上每一點都有唯一的 (x, y)。拖曳 P 或 a、b 看看。', 'a and b are not parallel, so every point has exactly one pair (x, y). Drag P, a or b.');
    }
    const q = QD();
    if (q.th == null) return T('有零向量：夾角沒有定義。', 'One vector is zero: the angle is undefined.');
    if (q.dot === 0) return T('a · b = 0：兩向量垂直，b 在 a 上的影子縮成一個點。', 'a · b = 0: the vectors are perpendicular and the shadow of b on a shrinks to a point.');
    if (q.det === 0) return T('a、b 平行：|a · b| = |a||b|，柯西不等式的等號成立，平行四邊形面積是 0。', 'a and b are parallel: |a · b| = |a||b| (equality in the Cauchy inequality) and the parallelogram has area 0.');
    return q.dot > 0 ? T('夾角是銳角：a · b > 0，影子和 a 同方向（綠色）。', 'Acute angle: a · b > 0 and the shadow points along a (green).') : T('夾角是鈍角：a · b < 0，影子和 a 反方向（紅色）。', 'Obtuse angle: a · b < 0 and the shadow points against a (red).');
  }

  // =====================================================================
  // 音效
  // =====================================================================
  function sound() { return window.LabSound && window.LabSound.enabled() ? window.LabSound : null; }
  function chime(ok) {
    const S = sound(); if (!S) return;
    if (ok) {
      S.tone({ freq: 659.25, dur: 0.16, type: 'sine', gain: 0.26 });
      S.tone({ freq: 987.77, dur: 0.24, type: 'sine', gain: 0.22, delay: 0.11 });
    } else S.tone({ freq: 311.13, dur: 0.14, type: 'triangle', gain: 0.2 });
  }
  function blip(freq, type, gain) { const S = sound(); if (S) S.tone({ freq: freq, dur: 0.08, type: type || 'triangle', gain: gain || 0.14 }); }
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
  /** 變成平行、垂直時發聲 */
  let lastPar = null, lastPerp = null;
  function specialSound() {
    const par = M.det(state.a, state.b) === 0, perp = M.dot(state.a, state.b) === 0 && !M.isZero(state.a) && !M.isZero(state.b);
    if (lastPar != null && par && !lastPar) blip(330, 'sawtooth', 0.1);
    if (lastPerp != null && perp && !lastPerp && state.mode === 'dot') chime(true);
    lastPar = par; lastPerp = perp;
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function emitLin() { const q = QL(); emit('lin', { a: state.a.slice(), b: state.b.slice(), x: state.x, y: state.y, det: q.det, region: state.region, inside: q.inside, chal: !!state.chal }); }
  function emitDot() { const q = QD(); emit('dot', { a: state.a.slice(), b: state.b.slice(), dot: q.dot, det: q.det, aa: q.aa, bb: q.bb }); }
  function emitMode() { if (state.mode === 'lin') emitLin(); else emitDot(); }

  // =====================================================================
  // 控制項
  // =====================================================================
  const lab = $('lab');
  const el = { ax: $('ax'), ay: $('ay'), bx: $('bx'), by: $('by'), cx: $('cx'), cy: $('cy') };
  function readOne(k) {
    const v = val(el[k]);
    if (k === 'ax') state.a = [Math.round(v), state.a[1]];
    else if (k === 'ay') state.a = [state.a[0], Math.round(v)];
    else if (k === 'bx') state.b = [Math.round(v), state.b[1]];
    else if (k === 'by') state.b = [state.b[0], Math.round(v)];
    else if (k === 'cx') state.x = r3(v);
    else if (k === 'cy') state.y = r3(v);
  }
  function refreshOutputs() {
    $('axo').textContent = fmt(state.a[0]); $('ayo').textContent = fmt(state.a[1]);
    $('bxo').textContent = fmt(state.b[0]); $('byo').textContent = fmt(state.b[1]);
    $('cxo').textContent = fmt(state.x); $('cyo').textContent = fmt(state.y);
  }
  function refresh() { refreshOutputs(); updateReadouts(); specialSound(); requestDraw(); }
  Object.keys(el).forEach(function (k) {
    el[k].addEventListener('input', function () { if (applying) return; readOne(k); refresh(); });
    el[k].addEventListener('change', function () { if (applying) return; readOne(k); refresh(); emitMode(); });
  });
  function setSlider(e, v) {
    applying = true;
    if (window.LabNum) window.LabNum.set(e, v); else e.value = v;
    applying = false;
  }
  function syncVecSliders() { setSlider(el.ax, state.a[0]); setSlider(el.ay, state.a[1]); setSlider(el.bx, state.b[0]); setSlider(el.by, state.b[1]); }
  function syncCoefSliders() { setSlider(el.cx, state.x); setSlider(el.cy, state.y); }
  document.querySelectorAll('#regPick button').forEach(function (bt) {
    bt.addEventListener('click', function () {
      state.region = bt.getAttribute('data-reg');
      document.querySelectorAll('#regPick button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === bt)); });
      refresh(); emitLin(); blip(494);
    });
  });
  $('gridC').addEventListener('change', function () { state.grid = $('gridC').checked; requestDraw(); });
  $('projC').addEventListener('change', function () { state.proj = $('projC').checked; requestDraw(); blip(440); });
  $('areaC').addEventListener('change', function () { state.area = $('areaC').checked; $('lgArea').hidden = !state.area; requestDraw(); blip(440); });
  function setMode(m) {
    if (m === state.mode) return;
    if (state.chal) quitChal(true);
    state.mode = m;
    lab.setAttribute('data-mode', m);
    document.querySelectorAll('.modes button').forEach(function (bt) { bt.setAttribute('aria-pressed', String(bt.getAttribute('data-mode') === m)); });
    for (const id in eqKey) delete eqKey[id];
    lastPerp = null;
    refresh(); emitMode();
  }
  document.querySelectorAll('.modes button').forEach(function (bt) { bt.addEventListener('click', function () { setMode(bt.getAttribute('data-mode')); }); });

  // ---------- 全部清除 ----------
  $('clear').addEventListener('click', function () {
    if (state.chal) quitChal(true);
    state.log = []; state.streak = []; state.round = 0; lastChal = null;
    state.x = 1; state.y = 1; syncCoefSliders();
    setChalMsg(''); renderLog();
    for (const id in eqKey) delete eqKey[id];
    refresh();
    blip(392);
  });

  // ---------- 在圖上拖曳 ----------
  let drag = null;
  function posOf(ev) { const rc = cv.getBoundingClientRect(); return { px: ev.clientX - rc.left, py: ev.clientY - rc.top }; }
  function clampv(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function hitTest(px, py, R) {
    const cands = [];
    if (!state.chal) { cands.push({ what: 'a', u: state.a }); cands.push({ what: 'b', u: state.b }); }
    if (state.mode === 'lin' && !state.chal) cands.push({ what: 'p', u: P() });
    let best = null, bd = Infinity;
    cands.forEach(function (cd) {
      const d = Math.hypot(X(cd.u[0]) - px, Y(cd.u[1]) - py) - (cd.what === 'p' ? 0 : 2);
      if (d < bd) { bd = d; best = cd; }
    });
    return best && bd <= R ? best.what : null;
  }
  function dragTo(what, px, py) {
    if (what === 'a' || what === 'b') {
      const u = [Math.round(clampv(xAt(px), -5, 5)), Math.round(clampv(yAt(py), -5, 5))];
      const old = state[what];
      if (u[0] === old[0] && u[1] === old[1]) return;
      state[what] = u;
      syncVecSliders();
      blip(392 + 30 * (u[0] + u[1] + 10), 'sine', 0.08);
    } else if (what === 'p') {
      const a = state.a, b = state.b, d = M.det(a, b);
      const p = [xAt(px), yAt(py)];
      let x, y;
      if (d !== 0) {
        const s = M.solve(a, b, p);
        x = s.x; y = s.y;
        // 靠近 0.5 倍數的格點（畫面上 9 px 以內）就吸過去
        const sx = Math.round(x * 2) / 2, sy = Math.round(y * 2) / 2, sp = M.comb(a, b, sx, sy);
        if (Math.hypot(X(sp[0]) - px, Y(sp[1]) - py) <= 9) { if (sx !== state.x || sy !== state.y) blip(587.33, 'sine', 0.1); x = sx; y = sy; }
      } else {
        const u = !M.isZero(a) ? a : b;
        if (M.isZero(u)) return;
        const k = M.dot(p, u) / M.dot(u, u);
        if (!M.isZero(a)) { x = k; y = 0; } else { x = 0; y = k; }
      }
      state.x = r3(clampv(x, -4, 4)); state.y = r3(clampv(y, -4, 4));
      syncCoefSliders();
    }
    refresh();
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (!F) return;
    const p = posOf(ev), touch = ev.pointerType === 'touch' || ev.pointerType === 'pen';
    const what = hitTest(p.px, p.py, touch ? 22 : 14);
    if (!what) return;
    ev.preventDefault();
    drag = { id: ev.pointerId, what: what };
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!F) return;
    const p = posOf(ev);
    if (!drag) { cv.style.cursor = hitTest(p.px, p.py, 14) ? 'grab' : 'default'; return; }
    if (drag.id !== ev.pointerId) return;
    dragTo(drag.what, p.px, p.py);
  });
  function endDrag(ev) {
    if (!drag || drag.id !== ev.pointerId) return;
    drag = null;
    emitMode();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // ---------- 鍵盤 ----------
  if (window.LabKeys) {
    const vecItem = function (w) {
      return {
        name: function () { return T('向量 ', 'vector ') + w; },
        move: function (dx, dy, big) {
          if (state.chal) return false;
          const st = big ? 2 : 1, u = state[w];
          state[w] = [clampv(u[0] + dx * st, -5, 5), clampv(u[1] + dy * st, -5, 5)];
          syncVecSliders(); refresh(); emitMode(); return true;
        },
        describe: function () { return w + ' = ' + vecStr(state[w]); }
      };
    };
    kb = window.LabKeys.attach(cv, {
      label: T('平面向量畫布。Enter 切換 a、b、P，方向鍵移動，Shift 移動得更多。P 的左右改 x、上下改 y。', 'Plane vector canvas. Enter switches between a, b and P, the arrow keys move it, Shift for bigger steps. For P, left and right change x, up and down change y.'),
      items: [vecItem('a'), vecItem('b'), {
        name: function () { return 'P'; },
        move: function (dx, dy, big) {
          if (state.mode !== 'lin') return false;
          const st = big ? 0.5 : 0.1;
          state.x = r3(clampv(state.x + dx * st, -4, 4)); state.y = r3(clampv(state.y + dy * st, -4, 4));
          syncCoefSliders(); refresh(); emitLin(); return true;
        },
        describe: function () { return 'P = ' + fmt(state.x) + ' a + ' + fmt(state.y) + ' b'; }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 挑戰：走到星星
  // =====================================================================
  const chalMsg = $('chalMsg');
  function setChalMsg(msg, cls) { chalMsg.textContent = msg || ''; chalMsg.classList.toggle('ok', cls === 'ok'); chalMsg.classList.toggle('bad', cls === 'bad'); }
  function lockVecs(on) { ['ax', 'ay', 'bx', 'by'].forEach(function (k) { el[k].disabled = on; }); }
  function startChal(forced) {
    if (state.mode !== 'lin') setMode('lin');
    const c = forced || M.genChallenge(rand, lastChal);
    if (!c) { setChalMsg(T('出不了題，請再按一次。', 'Could not make a challenge; please try again.')); return; }
    state.round++;
    state.chal = { a: c.a, b: c.b, x: c.x, y: c.y, T: c.T, t0: performance.now(), round: state.round, tries: 0 };
    lastChal = c;
    state.a = c.a.slice(); state.b = c.b.slice(); state.x = 0; state.y = 0;
    syncVecSliders(); syncCoefSliders(); lockVecs(true);
    setChalMsg(T('第 ' + state.round + ' 題：星星在 ' + vecStr(c.T) + '。', 'Challenge ' + state.round + ': the star is at ' + vecStr(c.T) + '.'));
    $('submitC').hidden = false; $('quitChal').hidden = false;
    $('newChal').textContent = T('換一題', 'Another one');
    for (const id in eqKey) delete eqKey[id];
    refresh();
  }
  function submitC() {
    const chg = state.chal;
    if (!chg) return;
    chg.tries++;
    const okx = Math.abs(state.x - chg.x) < 1e-9, oky = Math.abs(state.y - chg.y) < 1e-9;
    if (!(okx && oky)) {
      state.streak = [];
      chime(false);
      setChalMsg(okx ? T('x 對了，y 還不對。（連續答對重新計算）', 'x is right, y is not yet. (The streak starts over.)') : oky ? T('y 對了，x 還不對。（連續答對重新計算）', 'y is right, x is not yet. (The streak starts over.)') : T('x、y 都還不對：沿著斜的格子數一數。（連續答對重新計算）', 'Neither x nor y is right yet: count along the slanted grid. (The streak starts over.)'), 'bad');
      return;
    }
    const time = (performance.now() - chg.t0) / 1000;
    state.log.push({ round: chg.round, a: chg.a, b: chg.b, x: chg.x, y: chg.y, time: time, first: chg.tries === 1 });
    state.streak.push(time);
    const last3 = state.streak.length >= 3 ? state.streak.slice(-3).reduce(function (s, x) { return s + x; }, 0) : null;
    state.chal = null;
    lockVecs(false);
    $('submitC').hidden = true; $('quitChal').hidden = true;
    $('newChal').textContent = T('出下一題', 'Next challenge');
    setChalMsg(T('答對了！用了 ', 'Correct! In ') + time.toFixed(1) + T(' 秒。', ' s.'), 'ok');
    chime(true);
    renderLog();
    for (const id in eqKey) delete eqKey[id];
    refresh();
    emit('challenge', { time: time, streak: state.streak.length, last3: last3 });
  }
  function quitChal(silent) {
    const chg = state.chal;
    if (!chg) return;
    state.log.push({ round: chg.round, a: chg.a, b: chg.b, x: chg.x, y: chg.y, time: null });
    state.chal = null; state.streak = [];
    lockVecs(false);
    $('submitC').hidden = true; $('quitChal').hidden = true;
    $('newChal').textContent = T('出一題', 'New challenge');
    setChalMsg(silent ? '' : T('這題放棄了，答案是 x = ' + fmt(chg.x) + '、y = ' + fmt(chg.y) + '；連續答對重新計算。', 'Given up. The answer was x = ' + fmt(chg.x) + ', y = ' + fmt(chg.y) + '; the streak starts over.'));
    renderLog();
    for (const id in eqKey) delete eqKey[id];
    refresh();
  }
  $('newChal').addEventListener('click', function () { if (state.chal) quitChal(true); startChal(); });
  $('submitC').addEventListener('click', submitC);
  $('quitChal').addEventListener('click', function () { quitChal(false); });
  function renderLog() {
    const t = $('log');
    $('logEmpty').hidden = state.log.length > 0;
    if (!state.log.length) { t.innerHTML = ''; return; }
    let h = '<tr><th>' + T('題', '#') + '</th><th>a</th><th>b</th><th>x</th><th>y</th><th>' + T('秒', 's') + '</th></tr>';
    state.log.slice(-8).reverse().forEach(function (r) {
      h += '<tr><td>' + r.round + '</td><td>' + vecStr(r.a) + '</td><td>' + vecStr(r.b) + '</td><td>' + fmt(r.x) + '</td><td>' + fmt(r.y) + '</td><td>' + (r.time == null ? T('放棄', 'gave up') : r.time.toFixed(1) + (r.first ? '' : '*')) + '</td></tr>';
    });
    t.innerHTML = h;
  }

  // 給測試用的介面（不影響畫面）
  window.__pv = {
    state: state, QL: QL, QD: QD, P: P,
    startChal: function (c) { startChal(c); },
    seed: function (s) { rand = M.rng(s); },
    toScreen: function (u) { return [X(u[0]), Y(u[1])]; }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  syncVecSliders(); syncCoefSliders();
  state.grid = $('gridC').checked; state.proj = $('projC').checked; state.area = $('areaC').checked;
  $('lgArea').hidden = !state.area;
  renderLog();
  updateSoundButton();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    for (const id in eqKey) delete eqKey[id];
    renderLog(); refreshOutputs(); updateReadouts(); updateSoundButton();
    $('newChal').textContent = state.chal ? T('換一題', 'Another one') : state.log.length ? T('出下一題', 'Next challenge') : T('出一題', 'New challenge');
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
  refreshOutputs();
  updateReadouts();
  specialSound();
})();
