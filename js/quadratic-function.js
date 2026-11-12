/* quadratic-function.js — 「二次函數：頂點、判別式與配方」的畫面與互動（數學計算在 quadratic-function-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 圖形：拖曳頂點；一般式與頂點式一起變；對稱軸、根、y 截距與它的對稱點、判別式；可以限制定義域看最大最小值。
 * 拋物線與直線：聯立後的判別式決定交點個數，等於 0 是切線。
 * 配方：x² + p x 拼成正方形加長方形，長方形切半、搬一半到下面、補上角落，四個步驟有動畫。
 * 挑戰「看圖寫二次函數」：虛線拋物線、標出頂點和另一點，讓圖形重合。 */
(function () {
  'use strict';
  const M = window.QuadCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha;
  const r6 = M.r6;
  const clampv = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };

  // ---------- 狀態 ----------
  const state = {
    mode: 'graph', form: 'std',
    a: 1, b: -2, c: -3,
    dom: false, dp: -1, dq: 2,
    m: 1, n: 1,
    p: 4, q: 12, x: 1, step: 1,
    chal: null, round: 0, streak: [], log: []
  };
  let rand = M.rng(((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0);
  let lastChal = null;
  let applying = false;
  let anim = null; // 配方步驟的動畫 { from, to, t0 }
  const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'qf-curve', 'qf-vtx', 'qf-root', 'qf-axis', 'qf-line', 'qf-max', 'qf-min', 'qf-sq', 'qf-rect', 'qf-corner', 'qf-target', 'qf-ok', 'qf-bad']
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
  const par = function (v) { return v < 0 ? '(' + fmtT(v) + ')' : fmtT(v); };
  const pt = function (x, y, d) { return '(' + fmt(x, d) + ', ' + fmt(y, d) + ')'; };

  // ---------- 目前的量 ----------
  function QG() {
    const a = state.a, b = state.b, c = state.c;
    const v = M.vertex(a, b, c), Dv = M.disc(a, b, c);
    return { h: r6(v.h), k: r6(v.k), D: Dv, s: M.sgnD(Dv), roots: M.roots(a, b, c), dom: state.dom ? M.rangeOn(a, b, c, state.dp, state.dq) : null };
  }
  function QLn() { return M.intersect(state.a, state.b, state.c, state.m, state.n); }
  function QS() { return M.completeSquare(state.p, state.q); }

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
    const s = (P0.y1 - P0.y0) / 16.6; // 縱向 −8.3 到 8.3
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
  const inView = function (x, y) { return X(x) >= F.P.x0 && X(x) <= F.P.x1 && Y(y) >= F.P.y0 && Y(y) <= F.P.y1; };

  function baseGrid(c) {
    const P0 = F.P;
    D.roundRect(c, P0.x0, P0.y0, P0.x1 - P0.x0, P0.y1 - P0.y0, 8);
    c.fillStyle = alpha(C.text, D.dark ? 0.03 : 0.022); c.fill();
    c.save(); clipP(c);
    const W = Math.ceil(xr()) + 1, H = 9;
    c.lineWidth = 1;
    for (let i = -W; i <= W; i++) { c.strokeStyle = alpha(C.text, 0.06); c.beginPath(); c.moveTo(X(i), P0.y0); c.lineTo(X(i), P0.y1); c.stroke(); }
    for (let j = -H; j <= H; j++) { c.strokeStyle = alpha(C.text, 0.06); c.beginPath(); c.moveTo(P0.x0, Y(j)); c.lineTo(P0.x1, Y(j)); c.stroke(); }
    c.strokeStyle = alpha(C.text, 0.38); c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(P0.x0, Y(0)); c.lineTo(P0.x1, Y(0)); c.moveTo(X(0), P0.y0); c.lineTo(X(0), P0.y1); c.stroke();
    c.font = fnt(10); c.fillStyle = alpha(C.muted, 0.9); c.textAlign = 'center'; c.textBaseline = 'top';
    for (let i = -W; i <= W; i++) if (i && i % 2 === 0 && X(i) > P0.x0 + 10 && X(i) < P0.x1 - 10) c.fillText(String(i).replace('-', '−'), X(i), Y(0) + 3);
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let j = -8; j <= 8; j++) if (j && j % 2 === 0) c.fillText(String(j).replace('-', '−'), X(0) - 4, Y(j));
    c.restore();
  }
  /** y = A x² + B x + C 從 xa 到 xb */
  function curve(c, A, B, Cc, xa, xb, color, w, dash) {
    const pa = Math.max(X(xa), F.P.x0), pb = Math.min(X(xb), F.P.x1);
    if (!(pb > pa)) return;
    c.save(); clipP(c);
    c.strokeStyle = color; c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round';
    if (dash) c.setLineDash(dash);
    c.beginPath();
    for (let px = pa, first = true; ; px += 2) {
      const qx = Math.min(px, pb), yy = clampv(Y(M.evalQ(A, B, Cc, xAt(qx))), -4000, ch + 4000);
      if (first) { c.moveTo(qx, yy); first = false; } else c.lineTo(qx, yy);
      if (qx >= pb) break;
    }
    c.stroke();
    c.restore();
  }
  function ring(c, x, y, r, color) {
    c.strokeStyle = color; c.lineWidth = 2.2;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
  }
  function hollow(c, x, y, color) {
    c.fillStyle = C['canvas-bg']; c.strokeStyle = color; c.lineWidth = 2;
    c.beginPath(); c.arc(x, y, 4.5, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  /** 畫面上方的判別式徽章 */
  function dBadge(c, Dv, label) {
    const s = M.sgnD(Dv);
    const txt = label + ' = ' + fmt(Dv, 3) + (s > 0 ? ' > 0' : s < 0 ? ' < 0' : '');
    const col = s > 0 ? C['qf-root'] : s === 0 ? C['qf-ok'] : C.muted;
    D.pill(c, txt, F.P.x0 + 10, F.P.y0 + 18, col, 'left', fnt(12.5, 700));
  }
  /** 標籤不要跑出畫布 */
  function pillIn(c, text, x, y, color, font) {
    const right = x > F.P.x1 - 120;
    D.pill(c, text, clampv(x + (right ? -12 : 12), F.P.x0 + 6, F.P.x1 - 6), clampv(y, F.P.y0 + 34, F.P.y1 - 10), color, right ? 'right' : 'left', font || fnt(12, 700));
  }

  // =====================================================================
  // 圖形
  // =====================================================================
  function drawGraph(c) {
    const a = state.a, b = state.b, cc = state.c, q = QG();
    baseGrid(c);
    const XL = -xr() - 1, XR = xr() + 1;
    // 挑戰的題目
    if (state.chal) {
      const g = state.chal;
      curve(c, g.a, g.b, g.c, XL, XR, alpha(C['qf-target'], 0.85), 3, [8, 6]);
      ring(c, X(g.h), Y(g.k), 9, C['qf-target']);
      ring(c, X(g.pt[0]), Y(g.pt[1]), 9, C['qf-target']);
      D.pill(c, pt(g.h, g.k), X(g.h), Y(g.k) + (g.a > 0 ? 26 : -18), C['qf-target'], 'center', fnt(12, 700));
      D.pill(c, pt(g.pt[0], g.pt[1]), X(g.pt[0]), Y(g.pt[1]) + (g.a > 0 ? -18 : 26), C['qf-target'], 'center', fnt(12, 700));
    }
    // 對稱軸
    if (X(q.h) > F.P.x0 && X(q.h) < F.P.x1) {
      c.save(); clipP(c);
      c.strokeStyle = alpha(C['qf-axis'], 0.75); c.lineWidth = 1.6; c.setLineDash([7, 5]);
      c.beginPath(); c.moveTo(X(q.h), F.P.y0); c.lineTo(X(q.h), F.P.y1); c.stroke(); c.setLineDash([]);
      c.restore();
      D.haloText(c, 'x = ' + fmt(q.h), X(q.h) + 6, F.P.y1 - 12, C['qf-axis'], 'left', 'middle', fnt(12, 700));
    }
    // 定義域
    if (q.dom) {
      const lo = q.dom.lo, hi = q.dom.hi;
      c.save(); clipP(c);
      c.fillStyle = alpha(C.accent, D.dark ? 0.08 : 0.07);
      c.fillRect(X(lo), F.P.y0, X(hi) - X(lo), F.P.y1 - F.P.y0);
      c.strokeStyle = alpha(C.accent, 0.55); c.lineWidth = 1.2; c.setLineDash([4, 4]);
      c.beginPath(); c.moveTo(X(lo), F.P.y0); c.lineTo(X(lo), F.P.y1); c.moveTo(X(hi), F.P.y0); c.lineTo(X(hi), F.P.y1); c.stroke(); c.setLineDash([]);
      c.restore();
      curve(c, a, b, cc, XL, XR, alpha(C['qf-curve'], 0.3), 2.2);
      curve(c, a, b, cc, lo, hi, C['qf-curve'], 4);
    } else curve(c, a, b, cc, XL, XR, C['qf-curve'], 3.6);
    // y 截距與它對稱軸另一邊的點
    if (inView(0, cc)) {
      if (Math.abs(q.h) > 0.05 && inView(2 * q.h, cc)) {
        c.save(); c.strokeStyle = alpha(C['qf-axis'], 0.7); c.lineWidth = 1.3; c.setLineDash([2, 4]);
        c.beginPath(); c.moveTo(X(0), Y(cc)); c.lineTo(X(2 * q.h), Y(cc)); c.stroke(); c.restore();
        hollow(c, X(2 * q.h), Y(cc), C['qf-axis']);
      }
      hollow(c, X(0), Y(cc), C['qf-axis']);
    }
    // 根
    q.roots.forEach(function (r, i) {
      if (!inView(r, 0)) return;
      D.ball(c, X(r), Y(0), q.roots.length === 1 ? 7.5 : 6.5, C['qf-root'], { glow: q.roots.length === 1 ? 0.5 : 0.25 });
      const lab = q.roots.length === 1 ? T('二重根 ', 'double root ') + fmt(r, 3) : fmt(r, 3);
      D.pill(c, lab, X(r), Y(0) + (a > 0 ? 22 : -16) * (q.k * a > 0 ? 1 : 1), C['qf-root'], q.roots.length === 2 ? (i === 0 ? 'right' : 'left') : 'center', fnt(11.5, 700));
    });
    // 區間上的最大最小
    if (q.dom) {
      const mk = function (xs, v, col, name, up) {
        xs.forEach(function (x) {
          if (!inView(x, v)) return;
          D.ball(c, X(x), Y(v), 6.5, col, { glow: 0.35 });
        });
        const x0 = xs[0];
        if (inView(x0, v)) D.pill(c, name + ' ' + fmt(v, 3), X(x0), Y(v) + (up ? -16 : 24), col, 'center', fnt(11.5, 700));
      };
      if (Math.abs(q.dom.max - q.dom.min) > 1e-9) {
        mk(q.dom.maxAt, q.dom.max, C['qf-max'], T('最大', 'max'), a < 0);
        mk(q.dom.minAt, q.dom.min, C['qf-min'], T('最小', 'min'), a < 0);
      }
    }
    // 頂點
    if (inView(q.h, q.k)) {
      D.ball(c, X(q.h), Y(q.k), 8, C['qf-vtx'], { glow: 0.45 });
      const show = !(q.dom && (q.dom.maxAt.concat(q.dom.minAt).some(function (x) { return Math.abs(x - q.h) < 1e-9; })));
      if (show) pillIn(c, T('頂點 ', 'vertex ') + pt(q.h, q.k), X(q.h), Y(q.k) + (a > 0 ? 24 : -16), C['qf-vtx']);
    } else {
      D.haloText(c, T('頂點在畫面外 ', 'vertex off screen ') + pt(q.h, q.k), F.P.x1 - 10, F.P.y0 + 18, C['qf-vtx'], 'right', 'middle', fnt(12, 700));
    }
    dBadge(c, q.D, 'D');
  }

  // =====================================================================
  // 拋物線與直線
  // =====================================================================
  function drawLine(c) {
    const a = state.a, b = state.b, cc = state.c, q = QG(), I = QLn();
    baseGrid(c);
    const XL = -xr() - 1, XR = xr() + 1;
    curve(c, a, b, cc, XL, XR, C['qf-curve'], 3.6);
    // 直線
    c.save(); clipP(c);
    c.strokeStyle = C['qf-line']; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(X(XL), Y(state.m * XL + state.n)); c.lineTo(X(XR), Y(state.m * XR + state.n)); c.stroke();
    c.restore();
    // 頂點
    if (inView(q.h, q.k)) D.ball(c, X(q.h), Y(q.k), 7, C['qf-vtx'], { glow: 0.35 });
    // 交點
    I.pts.forEach(function (p, i) {
      if (!inView(p[0], p[1])) return;
      D.ball(c, X(p[0]), Y(p[1]), I.pts.length === 1 ? 8 : 6.5, I.pts.length === 1 ? C['qf-ok'] : C['qf-root'], { glow: I.pts.length === 1 ? 0.6 : 0.3 });
      const lab = (I.pts.length === 1 ? T('切點 ', 'tangent point ') : '') + pt(p[0], p[1], 3);
      pillIn(c, lab, X(p[0]), Y(p[1]) + (i === 0 ? -16 : 24), I.pts.length === 1 ? C['qf-ok'] : C['qf-root']);
    });
    // 直線和 y 軸的交點（可以拖）
    if (inView(0, state.n)) {
      D.ball(c, X(0), Y(state.n), 7.5, C['qf-line'], { glow: 0.4 });
      D.haloText(c, 'n = ' + fmt(state.n), X(0) - 12, Y(state.n), C['qf-line'], 'right', 'middle', fnt(12, 700));
    }
    dBadge(c, I.D, 'D');
  }

  // =====================================================================
  // 配方
  // =====================================================================
  const ease = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
  function stepView() {
    if (!anim) return state.step;
    const t = (performance.now() - anim.t0) / 650;
    if (t >= 1) { anim = null; return state.step; }
    requestDraw();
    return anim.from + (anim.to - anim.from) * ease(t);
  }
  let SQ = null; // 配方圖的座標（拖曳用）
  function drawSquare(c) {
    const P0 = F.P, p = state.p, x = state.x, half = p / 2, cs = QS();
    D.roundRect(c, P0.x0, P0.y0, P0.x1 - P0.x0, P0.y1 - P0.y0, 8);
    c.fillStyle = alpha(C.text, D.dark ? 0.03 : 0.022); c.fill();
    const sv = stepView();
    const split = clampv(sv - 1, 0, 1), rot = clampv(sv - 2, 0, 1), fill = clampv(sv - 3, 0, 1);
    // 第 1、2 步要放得下 x + p 寬的長條；第 3、4 步只要 x + p/2（跟著旋轉動畫平滑地換）
    const er = ease(rot);
    const spanW = Math.max(1, Math.max(x + p, cs.S + half) * (1 - er) + Math.max(x + half, cs.S) * er), spanH = Math.max(x + half, cs.S, 1);
    const mL = 40, mT = 34, mR = 16, mB = 34;
    const u = Math.min((P0.x1 - P0.x0 - mL - mR) / spanW, (P0.y1 - P0.y0 - mT - mB) / spanH);
    const ox = P0.x0 + mL + Math.max(0, ((P0.x1 - P0.x0 - mL - mR) - spanW * u) / 2), oy = P0.y0 + mT;
    SQ = { ox: ox, oy: oy, u: u };
    const SX = function (v) { return ox + v * u; }, SY = function (v) { return oy + v * u; };
    const rectP = function (x0, y0, w, h, fillC, strokeC, dash) {
      c.beginPath(); c.rect(SX(x0), SY(y0), w * u, h * u);
      if (fillC) { c.fillStyle = fillC; c.fill(); }
      if (strokeC) { c.strokeStyle = strokeC; c.lineWidth = 1.8; if (dash) c.setLineDash(dash); c.stroke(); c.setLineDash([]); }
    };
    const fa = D.dark ? 0.3 : 0.24;
    // 目標正方形（面積 q + (p/2)²）
    const tgtA = clampv(sv - 2, 0, 1);
    if (cs.S > 0 && tgtA > 0) {
      c.save(); c.globalAlpha = tgtA;
      rectP(0, 0, cs.S, cs.S, null, alpha(C['qf-target'], 0.9), [7, 5]);
      c.restore();
    }
    // x² 的正方形
    rectP(0, 0, x, x, alpha(C['qf-sq'], fa), C['qf-sq']);
    // 第一半長方形（固定在右邊）
    rectP(x, 0, half, x, alpha(C['qf-rect'], fa), split > 0 ? C['qf-rect'] : null);
    // 第二半：從右邊轉到下面
    {
      const e = ease(rot);
      const c0 = [x + half + half / 2, x / 2], c1 = [x / 2, x + half / 2];
      const cx = c0[0] + (c1[0] - c0[0]) * e, cy = c0[1] + (c1[1] - c0[1]) * e;
      c.save();
      c.translate(SX(cx), SY(cy)); c.rotate(-e * Math.PI / 2);
      c.beginPath(); c.rect(-half / 2 * u, -x / 2 * u, half * u, x * u);
      c.fillStyle = alpha(C['qf-rect'], fa); c.fill();
      if (split > 0) { c.strokeStyle = alpha(C['qf-rect'], split); c.lineWidth = 1.8; c.stroke(); }
      c.restore();
    }
    if (split < 1) { c.save(); c.globalAlpha = 1 - split; rectP(x, 0, p, x, null, C['qf-rect']); c.restore(); }
    if (split > 0 && rot === 0) { // 切開的線
      c.save(); c.strokeStyle = alpha(C['qf-rect'], split); c.lineWidth = 2; c.setLineDash([5, 4]);
      c.beginPath(); c.moveTo(SX(x + half), SY(0)); c.lineTo(SX(x + half), SY(x)); c.stroke(); c.restore();
    }
    // 缺的角
    if (rot > 0.5 && half > 0) {
      c.save(); c.globalAlpha = Math.min(1, (rot - 0.5) * 2);
      rectP(x, x, half, half, fill > 0 ? alpha(C['qf-corner'], (D.dark ? 0.42 : 0.34) * fill) : null, C['qf-corner'], fill >= 1 ? null : [4, 4]);
      c.restore();
    }
    // 邊長
    const side = function (txt, x0, y0, col, align) { D.haloText(c, txt, x0, y0, col, align || 'center', 'middle', fnt(13, 700, true)); };
    if (x * u > 14) { side('x', SX(x / 2), SY(0) - 14, C['qf-sq']); side('x', SX(0) - 14, SY(x / 2), C['qf-sq']); }
    if (split < 0.5) side('p = ' + fmt(p), SX(x + half), SY(0) - 14, C['qf-rect']);
    else {
      side(fmt(half), SX(x + half / 2), SY(0) - 14, C['qf-rect']);
      if (rot < 0.5) side(fmt(half), SX(x + half * 1.5), SY(0) - 14, C['qf-rect']);
      else side(fmt(half), SX(0) - 14, SY(x + half / 2), C['qf-rect']);
    }
    // 面積
    const area = function (t1, t2, x0, y0, w, h, col) {
      if (w * u < 30 || h * u < 24) return;
      const two = h * u >= 42 && w * u >= 46;
      D.haloText(c, t1, SX(x0 + w / 2), SY(y0 + h / 2) - (two ? 9 : 0), col, 'center', 'middle', fnt(13, 700));
      if (two) D.haloText(c, t2, SX(x0 + w / 2), SY(y0 + h / 2) + 10, col, 'center', 'middle', fnt(11.5, 600));
    };
    area('x²', fmt(x * x, 3), 0, 0, x, x, C['qf-sq']);
    if (split < 0.5) area('px', fmt(p * x, 3), x, 0, p, x, C['qf-rect']);
    else {
      area(fmt(half) + 'x', fmt(half * x, 3), x, 0, half, x, C['qf-rect']);
      if (rot >= 1) area(fmt(half) + 'x', fmt(half * x, 3), 0, x, x, half, C['qf-rect']);
      else if (rot === 0) area(fmt(half) + 'x', fmt(half * x, 3), x + half, 0, half, x, C['qf-rect']);
    }
    if (rot >= 1) { if (fill > 0) area(fmt(half) + '²', fmt(half * half, 3), x, x, half, half, C['qf-corner']); else area('?', '', x, x, half, half, C['qf-corner']); }
    // 目標正方形的說明
    if (cs.S > 0 && tgtA >= 1) {
      const lab = T('面積 ', 'area ') + fmt(state.q) + ' + ' + fmt(cs.corner, 3) + ' = ' + fmt(cs.S2, 3);
      D.pill(c, lab, Math.min(SX(cs.S), P0.x1 - 8), Math.min(SY(cs.S) + 18, P0.y1 - 10), C['qf-target'], 'right', fnt(11.5, 700));
    }
    // 對上了
    const match = state.step === 4 && !anim && state.q > 0 && Math.abs(x - cs.root) < 5e-4;
    if (match) {
      c.save(); c.shadowColor = C['qf-ok']; c.shadowBlur = 14;
      rectP(0, 0, x + half, x + half, null, C['qf-ok']);
      c.restore();
    }
    // 拖曳點
    D.ball(c, SX(x), SY(x), 7.5, C['qf-sq'], { glow: 0.45 });
  }

  // ---------- 主畫面 ----------
  let kb = null;
  function draw() {
    if (!F) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(ctx, cw, ch);
    if (state.mode === 'graph') drawGraph(ctx); else if (state.mode === 'line') drawLine(ctx); else drawSquare(ctx);
    if (kb && kb.focused()) {
      const i = kb.index();
      let p = null;
      if (i === 0 && state.mode !== 'square') { const q = QG(); p = [X(q.h), Y(q.k)]; }
      else if (i === 1 && state.mode === 'line') p = [X(0), Y(state.n)];
      else if (i === 2 && state.mode === 'square' && SQ) p = [SQ.ox + state.x * SQ.u, SQ.oy + state.x * SQ.u];
      if (p) {
        ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.arc(p[0], p[1], 14, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
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
  const SEP = function () { return T('、', ', '); };
  function rootsHTML(a, q) {
    if (q.s > 0) return fmt(q.roots[0], 4) + SEP() + fmt(q.roots[1], 4);
    if (q.s === 0) return fmt(q.roots[0], 4) + T('（二重根）', ' (double)');
    const im = Math.sqrt(-q.D) / (2 * Math.abs(a));
    return T('沒有（虛根 ', 'none (complex roots ') + fmt(q.h, 3) + ' ± ' + fmt(im, 3) + '<i>i</i>' + T('）', ')');
  }
  function updateReadouts() {
    const a = state.a, b = state.b, cc = state.c;
    if (state.mode === 'graph') {
      const q = QG();
      setHTML('rV', pt(q.h, q.k, 4));
      setHTML('rAx', 'x = ' + fmt(q.h, 4));
      setHTML('rExt', a > 0 ? T('向上，最小值 ', 'up; minimum ') + fmt(q.k, 4) : T('向下，最大值 ', 'down; maximum ') + fmt(q.k, 4));
      setHTML('rD', fmt(q.D, 4) + (q.s > 0 ? '（&gt; 0）' : q.s < 0 ? '（&lt; 0）' : '（= 0）').replace('（', T('（', ' (')).replace('）', T('）', ')')));
      setHTML('rRoots', rootsHTML(a, q));
      setHTML('rY', fmt(cc, 4));
      if (q.dom) {
        setHTML('rMax', fmt(q.dom.max, 4) + T('（x = ', ' (x = ') + q.dom.maxAt.map(function (x) { return fmt(x, 3); }).join(SEP()) + T('）', ')'));
        setHTML('rMin', fmt(q.dom.min, 4) + T('（x = ', ' (x = ') + q.dom.minAt.map(function (x) { return fmt(x, 3); }).join(SEP()) + T('）', ')'));
      }
      setEq('rEq', 'y = ' + M.quadTex(a, b, cc) + ' = ' + M.vertexTex(a, q.h, q.k));
      let e2 = 'D = b^2 - 4ac = ' + par(b) + '^2 - 4\\cdot' + par(a) + '\\cdot' + par(cc) + ' = ' + fmtT(q.D, 4);
      if (q.s > 0) e2 += ',\\quad x = \\frac{' + fmtT(-b) + ' \\pm \\sqrt{' + fmtT(q.D, 4) + '}}{' + fmtT(2 * a) + '}';
      setEq('rEq2', e2);
    } else if (state.mode === 'line') {
      const I = QLn(), s = M.sgnD(I.D);
      setHTML('rLD', fmt(I.D, 4) + (s > 0 ? ' &gt; 0' : s < 0 ? ' &lt; 0' : ' = 0'));
      setHTML('rLX', I.pts.length ? I.pts.map(function (p) { return pt(p[0], p[1], 3); }).join(SEP()) : T('沒有', 'none'));
      setEq('rEq', M.quadTex(a, b, cc) + ' = ' + (M.quadTex(0, state.m, state.n)) + '\\;\\Rightarrow\\; ' + M.quadTex(a, r6(b - state.m), r6(cc - state.n)) + ' = 0');
      setEq('rEq2', 'D = (b - m)^2 - 4a(c - n) = ' + par(r6(b - state.m)) + '^2 - 4\\cdot' + par(a) + '\\cdot' + par(r6(cc - state.n)) + ' = ' + fmtT(I.D, 4));
    } else {
      const p = state.p, x = state.x, cs = QS(), half = p / 2;
      setHTML('rS1', fmt(x * x, 4));
      setHTML('rS2', fmt(p * x, 4) + ' = 2 × ' + fmt(half * x, 4));
      setHTML('rS3', fmt(x * x + p * x, 4) + T('（q = ', ' (q = ') + fmt(state.q) + T('）', ')'));
      setHTML('rS4', state.step >= 3 ? fmt(cs.corner, 4) : '—');
      setHTML('rS5', state.step >= 4 ? fmt(cs.root, 6) : T('補完正方形就知道', 'complete the square'));
      let e1 = 'x^2 + ' + fmtT(p) + 'x = ' + fmtT(state.q);
      if (state.step >= 2) e1 = 'x^2 + 2\\cdot' + fmtT(half) + 'x = ' + fmtT(state.q);
      if (state.step >= 4) e1 = 'x^2 + ' + fmtT(p) + 'x + ' + par(half) + '^2 = ' + fmtT(state.q) + ' + ' + par(half) + '^2 \\;\\Rightarrow\\; (x + ' + fmtT(half) + ')^2 = ' + fmtT(cs.S2, 4);
      setEq('rEq', e1);
      setEq('rEq2', state.step >= 4 ? 'x + ' + fmtT(half) + ' = \\sqrt{' + fmtT(cs.S2, 4) + '} = ' + fmtT(cs.S, 6) + ',\\quad x = ' + fmtT(cs.root, 6) : '');
    }
    setHTML('status', statusText());
  }
  function statusText() {
    const a = state.a;
    if (state.mode === 'graph') {
      const q = QG();
      if (state.chal) return T('讓你的圖形和虛線重合：先把頂點拖到標出的頂點上，再調 a 讓圖形經過另一個點。', 'Make your graph lie on the dashed one: drag the vertex onto the marked vertex, then adjust a so that the graph passes through the other point.');
      let s;
      if (q.s > 0) s = T('D > 0：圖形穿過 x 軸兩次，兩個根在對稱軸 x = ' + fmt(q.h) + ' 的兩側、距離一樣遠。', 'D > 0: the graph crosses the x-axis twice, the two roots equally far from the axis x = ' + fmt(q.h) + '.');
      else if (q.s === 0) s = T('D = 0：頂點剛好在 x 軸上，兩個根合成一個二重根。', 'D = 0: the vertex sits on the x-axis and the two roots merge into a double root.');
      else s = a > 0 ? T('D < 0 而且 a > 0：整條圖形都在 x 軸上方，f(x) 永遠大於 0。', 'D < 0 and a > 0: the whole graph is above the x-axis, so f(x) > 0 for every x.') : T('D < 0 而且 a < 0：整條圖形都在 x 軸下方，f(x) 永遠小於 0。', 'D < 0 and a < 0: the whole graph is below the x-axis, so f(x) < 0 for every x.');
      if (q.dom) s = (q.dom.vertexIn ? T('頂點在 [p, q] 裡：', 'The vertex is inside [p, q]: ') : T('頂點不在 [p, q] 裡：最大值和最小值都在兩端。', 'The vertex is outside [p, q]: both extremes are at the ends. ')) + T('最大值 ' + fmt(q.dom.max) + '、最小值 ' + fmt(q.dom.min) + '。', 'maximum ' + fmt(q.dom.max) + ', minimum ' + fmt(q.dom.min) + '.');
      return s;
    }
    if (state.mode === 'line') {
      const I = QLn(), s = M.sgnD(I.D);
      if (s > 0) return T('聯立的判別式 > 0：直線和拋物線交於兩點。', 'Discriminant > 0: the line meets the parabola at two points.');
      if (s === 0) return T('聯立的判別式 = 0：直線只碰到拋物線一點，這就是切線。切點的斜率 2ax + b = ' + fmt(2 * a * I.xs[0] + state.b) + '，剛好等於 m。', 'Discriminant = 0: the line touches the parabola at a single point — a tangent. The slope there, 2ax + b = ' + fmt(2 * a * I.xs[0] + state.b) + ', equals m.');
      return T('聯立的判別式 < 0：直線和拋物線沒有交點。', 'Discriminant < 0: the line misses the parabola.');
    }
    const cs = QS(), x = state.x, tot = x * x + state.p * x, gap = state.q - tot;
    if (state.step < 4) {
      const head = state.step === 1 ? T('步驟 1：x² + px 是一個正方形加一個長方形。', 'Step 1: x² + px is a square and a rectangle. ') : state.step === 2 ? T('步驟 2：長方形切成兩半，每一半是 ' + fmt(state.p / 2) + ' × x。', 'Step 2: cut the rectangle into two halves, each ' + fmt(state.p / 2) + ' × x. ') : T('步驟 3：一半搬到下面，拼成缺了一角的 L 形，面積還是 x² + px。', 'Step 3: move one half below; the L-shape still has area x² + px. ');
      return head + T('按「下一步」。', 'Press “Next step”.');
    }
    const sqEq = Math.abs(cs.S - Math.round(cs.S * 1000) / 1000) < 1e-9 ? ' = ' + fmt(cs.S, 3) : ' ≈ ' + fmt(cs.S, 4);
    if (state.q > 0 && Math.abs(x - cs.root) < 5e-4) return T('補上角落後，大正方形剛好填滿虛線：x + ' + fmt(state.p / 2) + ' = √' + fmt(cs.S2, 3) + sqEq + '，所以 x = ' + fmt(cs.root, 4) + '。', 'With the corner filled, the big square fills the dashed one exactly: x + ' + fmt(state.p / 2) + ' = √' + fmt(cs.S2, 3) + sqEq + ', so x = ' + fmt(cs.root, 4) + '.');
    return T('步驟 4：補上角落，L 形變成邊長 x + ' + fmt(state.p / 2) + ' 的正方形。拖曳藍色的角，讓它填滿虛線的正方形（x² + px 還差 ' + fmt(gap, 3) + '）。', 'Step 4: fill the corner and the L becomes a square of side x + ' + fmt(state.p / 2) + '. Drag the blue corner until it fills the dashed square (x² + px is short by ' + fmt(gap, 3) + ').');
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
  /** 判別式改變正負時發聲：0 是清脆的和弦，兩個根是高音，沒有根是低音 */
  let lastS = null, lastMatch = false;
  function specialSound() {
    let s = null;
    if (state.mode === 'graph') s = QG().s; else if (state.mode === 'line') s = M.sgnD(QLn().D);
    if (s != null && lastS != null && s !== lastS) { if (s === 0) chime(true); else blip(s > 0 ? 523.25 : 293.66, 'triangle', 0.14); }
    lastS = s;
    const cs = QS(), match = state.mode === 'square' && state.step === 4 && state.q > 0 && Math.abs(state.x - cs.root) < 5e-4;
    if (match && !lastMatch) chime(true);
    lastMatch = match;
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function emitGraph() {
    const q = QG();
    emit('graph', { a: state.a, b: state.b, c: state.c, h: q.h, k: q.k, D: q.D, roots: q.roots.slice(), dom: q.dom ? { p: q.dom.lo, q: q.dom.hi, max: q.dom.max, min: q.dom.min, vertexIn: q.dom.vertexIn } : null, chal: !!state.chal });
  }
  function emitLine() {
    const q = QG(), I = QLn();
    emit('line', { a: state.a, b: state.b, c: state.c, h: q.h, k: q.k, m: state.m, n: state.n, D: I.D, xs: I.xs.slice() });
  }
  function emitSquare() { emit('square', { p: state.p, q: state.q, x: state.x, step: state.step, root: QS().root }); }
  function emitMode() { if (state.mode === 'graph') emitGraph(); else if (state.mode === 'line') emitLine(); else emitSquare(); }

  // =====================================================================
  // 控制項
  // =====================================================================
  const lab = $('lab');
  const el = { qa: $('qa'), qb: $('qb'), qc: $('qc'), qh: $('qh'), qk: $('qk'), dp: $('dp'), dq: $('dq'), lm: $('lm'), ln: $('ln'), sp: $('sp'), sq: $('sq'), sx: $('sx') };
  function setVertex(h, k) { const bc = M.fromVertex(state.a, h, k); state.b = r6(bc.b); state.c = r6(bc.c); }
  function readOne(k) {
    const v = val(el[k]);
    if (k === 'qa') {
      let a = r6(v);
      if (Math.abs(a) < 0.05) a = state.a < 0 ? -0.1 : 0.1;
      if (state.form === 'vtx') { const q = QG(); state.a = a; setVertex(q.h, q.k); } else state.a = a;
      if (a !== r6(v)) setSlider(el.qa, a);
    } else if (k === 'qb') state.b = r6(v);
    else if (k === 'qc') state.c = r6(v);
    else if (k === 'qh') { const q = QG(); setVertex(r6(v), q.k); }
    else if (k === 'qk') { const q = QG(); setVertex(q.h, r6(v)); }
    else if (k === 'dp') state.dp = r6(v);
    else if (k === 'dq') state.dq = r6(v);
    else if (k === 'lm') state.m = r6(v);
    else if (k === 'ln') state.n = r6(v);
    else if (k === 'sp') state.p = r6(v);
    else if (k === 'sq') state.q = r6(v);
    else if (k === 'sx') state.x = r6(v);
  }
  function refreshOutputs() {
    const q = QG();
    $('qao').textContent = fmt(state.a); $('qbo').textContent = fmt(state.b); $('qco').textContent = fmt(state.c);
    $('qho').textContent = fmt(q.h); $('qko').textContent = fmt(q.k);
    $('dpo').textContent = fmt(state.dp); $('dqo').textContent = fmt(state.dq);
    $('lmo').textContent = fmt(state.m); $('lno').textContent = fmt(state.n);
    $('spo').textContent = fmt(state.p); $('sqo').textContent = fmt(state.q); $('sxo').textContent = fmt(state.x);
  }
  function refresh() { refreshOutputs(); updateReadouts(); specialSound(); requestDraw(); }
  function setSlider(e, v) {
    applying = true;
    if (window.LabNum) window.LabNum.set(e, v); else e.value = v;
    applying = false;
  }
  /** 一般式和頂點式互相換算出來的值可能超出另一組滑桿的範圍（例如 a = 0.1、b = 4 時 h = −20）：
   *  這時把那個滑桿的範圍放寬到包住它（取整數），回到預設範圍內就縮回來；滑桿上的數字和實際值永遠一致，也不會擋住任何調整。 */
  const BASE = { qb: 20, qc: 20, qh: 10, qk: 20 };
  function fitRange(k, v) {
    const R = Math.max(BASE[k], Math.ceil(Math.abs(v) - 1e-9));
    if (+el[k].max !== R) { el[k].min = String(-R); el[k].max = String(R); }
  }
  function syncFn() {
    const q = QG();
    fitRange('qb', state.b); fitRange('qc', state.c); fitRange('qh', q.h); fitRange('qk', q.k);
    setSlider(el.qa, state.a); setSlider(el.qb, state.b); setSlider(el.qc, state.c); setSlider(el.qh, q.h); setSlider(el.qk, q.k);
  }
  Object.keys(el).forEach(function (k) {
    el[k].addEventListener('input', function () { if (applying) return; readOne(k); if (/^q/.test(k)) syncOther(k); refresh(); });
    el[k].addEventListener('change', function () { if (applying) return; readOne(k); if (/^q/.test(k)) syncOther(k); refresh(); emitMode(); });
  });
  /** 一般式改了就更新頂點式的滑桿，反之亦然 */
  function syncOther(k) {
    const q = QG();
    if (k === 'qb' || k === 'qc' || k === 'qa') { fitRange('qh', q.h); fitRange('qk', q.k); setSlider(el.qh, q.h); setSlider(el.qk, q.k); }
    if (k === 'qh' || k === 'qk' || k === 'qa') { fitRange('qb', state.b); fitRange('qc', state.c); setSlider(el.qb, state.b); setSlider(el.qc, state.c); }
  }
  document.querySelectorAll('#formPick button').forEach(function (bt) {
    bt.addEventListener('click', function () {
      state.form = bt.getAttribute('data-form');
      lab.setAttribute('data-form', state.form);
      document.querySelectorAll('#formPick button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === bt)); });
      blip(494);
    });
  });
  $('domC').addEventListener('change', function () {
    state.dom = $('domC').checked;
    lab.setAttribute('data-dom', state.dom ? '1' : '0');
    for (const id in lastHTML) delete lastHTML[id];
    refresh(); emitGraph(); blip(440);
  });
  function setStep(s) {
    if (s === state.step) return;
    if (!reduceMotion.matches) anim = { from: anim ? stepView() : state.step, to: s, t0: performance.now() };
    state.step = s;
    document.querySelectorAll('#stepPick button').forEach(function (o) { o.setAttribute('aria-pressed', String(+o.getAttribute('data-step') === s)); });
    blip(392 + 66 * s, 'sine', 0.12);
    refresh(); emitSquare();
    if (anim) setTimeout(function () { refresh(); }, 700);
  }
  document.querySelectorAll('#stepPick button').forEach(function (bt) { bt.addEventListener('click', function () { setStep(+bt.getAttribute('data-step')); }); });
  $('nextStep').addEventListener('click', function () { setStep(state.step % 4 + 1); });
  function setMode(m) {
    if (m === state.mode) return;
    if (state.chal) quitChal(true);
    state.mode = m;
    lab.setAttribute('data-mode', m);
    document.querySelectorAll('.modes button').forEach(function (bt) { bt.setAttribute('aria-pressed', String(bt.getAttribute('data-mode') === m)); });
    for (const id in eqKey) delete eqKey[id];
    lastS = null;
    refresh(); emitMode();
  }
  document.querySelectorAll('.modes button').forEach(function (bt) { bt.addEventListener('click', function () { setMode(bt.getAttribute('data-mode')); }); });

  // ---------- 全部清除 ----------
  $('clear').addEventListener('click', function () {
    if (state.chal) quitChal(true);
    state.log = []; state.streak = []; state.round = 0; lastChal = null;
    anim = null; state.step = 1;
    document.querySelectorAll('#stepPick button').forEach(function (o) { o.setAttribute('aria-pressed', String(o.getAttribute('data-step') === '1')); });
    setChalMsg(''); renderLog();
    for (const id in eqKey) delete eqKey[id];
    refresh();
    blip(392);
  });

  // ---------- 在圖上拖曳 ----------
  let drag = null;
  function posOf(ev) { const rc = cv.getBoundingClientRect(); return { px: ev.clientX - rc.left, py: ev.clientY - rc.top }; }
  /** 0.1 一格，靠近 0.5 的倍數（9 px 以內）就吸過去 */
  function snapX(px) { const v = xAt(px), s = Math.round(v * 2) / 2; return Math.abs(X(s) - px) <= 9 ? s : Math.round(v * 10) / 10; }
  function snapY(py) { const v = yAt(py), s = Math.round(v * 2) / 2; return Math.abs(Y(s) - py) <= 9 ? s : Math.round(v * 10) / 10; }
  function hitTest(px, py, R) {
    const cands = [];
    if (state.mode === 'square') {
      if (SQ) cands.push({ what: 'x', sx: SQ.ox + state.x * SQ.u, sy: SQ.oy + state.x * SQ.u });
    } else {
      const q = QG();
      cands.push({ what: 'v', sx: X(q.h), sy: Y(q.k) });
      if (state.mode === 'line') cands.push({ what: 'n', sx: X(0), sy: Y(state.n) });
    }
    let best = null, bd = Infinity;
    cands.forEach(function (cd) { const d = Math.hypot(cd.sx - px, cd.sy - py); if (d < bd) { bd = d; best = cd; } });
    return best && bd <= R ? best.what : null;
  }
  function dragTo(what, px, py) {
    if (what === 'v') {
      const q = QG();
      const h = clampv(snapX(px), -6, 6), k = clampv(snapY(py), -8, 8);
      if (h === q.h && k === q.k) return;
      const bc = M.fromVertex(state.a, h, k);
      if (Math.abs(bc.b) > 20 + 1e-9 || Math.abs(bc.c) > 20 + 1e-9) return;
      state.b = r6(bc.b); state.c = r6(bc.c);
      syncFn();
      if (h % 0.5 === 0 && k % 0.5 === 0) blip(440 + 20 * (h + k), 'sine', 0.06);
    } else if (what === 'n') {
      const n = clampv(snapY(py), -10, 10);
      if (n === state.n) return;
      state.n = n; setSlider(el.ln, n);
    } else if (what === 'x' && SQ) {
      const v = ((px - SQ.ox) + (py - SQ.oy)) / 2 / SQ.u;
      let x = Math.round(v * 100) / 100;
      const s = Math.round(v * 2) / 2;
      if (Math.abs(s - v) * SQ.u <= 7) x = s;
      x = clampv(x, 0, 10);
      if (x === state.x) return;
      state.x = x; setSlider(el.sx, x);
    }
    refresh();
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (!F) return;
    const p = posOf(ev), touch = ev.pointerType === 'touch' || ev.pointerType === 'pen';
    const what = hitTest(p.px, p.py, touch ? 24 : 15);
    if (!what) return;
    ev.preventDefault();
    drag = { id: ev.pointerId, what: what };
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!F) return;
    const p = posOf(ev);
    if (!drag) { cv.style.cursor = hitTest(p.px, p.py, 15) ? 'grab' : 'default'; return; }
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
    kb = window.LabKeys.attach(cv, {
      label: T('二次函數畫布。Enter 切換頂點、直線、正方形的邊，方向鍵移動，Shift 移動得更多。', 'Quadratic canvas. Enter switches between the vertex, the line and the side of the square; the arrow keys move it, Shift for bigger steps.'),
      items: [{
        name: function () { return T('頂點', 'vertex'); },
        move: function (dx, dy, big) {
          if (state.mode === 'square') return false;
          const q = QG(), st = big ? 0.5 : 0.1;
          const h = r6(clampv(q.h + dx * st, -6, 6)), k = r6(clampv(q.k + dy * st, -8, 8));
          const bc = M.fromVertex(state.a, h, k);
          if (Math.abs(bc.b) > 20 + 1e-9 || Math.abs(bc.c) > 20 + 1e-9) return false;
          state.b = r6(bc.b); state.c = r6(bc.c);
          syncFn(); refresh(); emitMode(); return true;
        },
        describe: function () { const q = QG(); return T('頂點 ', 'vertex ') + pt(q.h, q.k); }
      }, {
        name: function () { return T('直線', 'line'); },
        move: function (dx, dy, big) {
          if (state.mode !== 'line') return false;
          const st = big ? 0.5 : 0.1;
          state.m = r6(clampv(state.m + dx * st, -6, 6)); state.n = r6(clampv(state.n + dy * st, -10, 10));
          setSlider(el.lm, state.m); setSlider(el.ln, state.n); refresh(); emitLine(); return true;
        },
        describe: function () { return 'y = ' + fmt(state.m) + 'x + ' + fmt(state.n); }
      }, {
        name: function () { return T('正方形的邊 x', 'side x'); },
        move: function (dx, dy, big) {
          if (state.mode !== 'square') return false;
          const st = big ? 0.1 : 0.01;
          state.x = r6(clampv(state.x + (dx || dy) * st, 0, 10));
          setSlider(el.sx, state.x); refresh(); emitSquare(); return true;
        },
        describe: function () { return 'x = ' + fmt(state.x); }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 挑戰：看圖寫二次函數
  // =====================================================================
  const chalMsg = $('chalMsg');
  function setChalMsg(msg, cls) { chalMsg.textContent = msg || ''; chalMsg.classList.toggle('ok', cls === 'ok'); chalMsg.classList.toggle('bad', cls === 'bad'); }
  function startChal(forced) {
    if (state.mode !== 'graph') setMode('graph');
    const g = forced || M.genChallenge(rand, lastChal);
    if (!g) { setChalMsg(T('出不了題，請再按一次。', 'Could not make a challenge; please try again.')); return; }
    state.round++;
    state.chal = { a: g.a, b: g.b, c: g.c, h: g.h, k: g.k, pt: g.pt, t0: performance.now(), round: state.round, tries: 0 };
    lastChal = g;
    // 你的函數從 y = x² 開始（頂點在原點，一定在畫面裡）
    state.a = 1; state.b = 0; state.c = 0; syncFn();
    $('lgTarget').hidden = false;
    setChalMsg(T('第 ' + state.round + ' 題：頂點 ' + pt(g.h, g.k) + '，還經過 ' + pt(g.pt[0], g.pt[1]) + '。', 'Challenge ' + state.round + ': vertex ' + pt(g.h, g.k) + ', also through ' + pt(g.pt[0], g.pt[1]) + '.'));
    $('submitC').hidden = false; $('quitChal').hidden = false;
    $('newChal').textContent = T('換一題', 'Another one');
    for (const id in eqKey) delete eqKey[id];
    refresh();
  }
  function submitC() {
    const g = state.chal;
    if (!g) return;
    g.tries++;
    const q = QG();
    const okV = Math.abs(q.h - g.h) < 1e-6 && Math.abs(q.k - g.k) < 1e-6, okA = Math.abs(state.a - g.a) < 1e-6;
    if (!(okV && okA)) {
      state.streak = [];
      chime(false);
      setChalMsg(okV ? T('頂點對了，開口的大小 a 還不對。（連續答對重新計算）', 'The vertex is right, but a is not yet. (The streak starts over.)') : okA ? T('a 對了，頂點還不對。（連續答對重新計算）', 'a is right, but the vertex is not yet. (The streak starts over.)') : T('頂點和 a 都還不對。（連續答對重新計算）', 'Neither the vertex nor a is right yet. (The streak starts over.)'), 'bad');
      return;
    }
    const time = (performance.now() - g.t0) / 1000;
    state.log.push({ round: g.round, a: g.a, b: g.b, c: g.c, time: time, first: g.tries === 1 });
    state.streak.push(time);
    const last3 = state.streak.length >= 3 ? state.streak.slice(-3).reduce(function (s, x) { return s + x; }, 0) : null;
    state.chal = null;
    $('lgTarget').hidden = true;
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
    const g = state.chal;
    if (!g) return;
    state.log.push({ round: g.round, a: g.a, b: g.b, c: g.c, time: null });
    state.chal = null; state.streak = [];
    $('lgTarget').hidden = true;
    $('submitC').hidden = true; $('quitChal').hidden = true;
    $('newChal').textContent = T('出一題', 'New challenge');
    setChalMsg(silent ? '' : T('這題放棄了，答案是 y = ', 'Given up. The answer was y = ') + polyText(g.a, g.b, g.c) + T('；連續答對重新計算。', '; the streak starts over.'));
    renderLog();
    for (const id in eqKey) delete eqKey[id];
    refresh();
  }
  /** 純文字的一般式（表格與訊息用） */
  function polyText(a, b, c) {
    return M.quadTex(a, b, c).replace(/\^2/g, '²').replace(/-/g, '−');
  }
  $('newChal').addEventListener('click', function () { if (state.chal) quitChal(true); startChal(); });
  $('submitC').addEventListener('click', submitC);
  $('quitChal').addEventListener('click', function () { quitChal(false); });
  function renderLog() {
    const t = $('log');
    $('logEmpty').hidden = state.log.length > 0;
    if (!state.log.length) { t.innerHTML = ''; return; }
    let h = '<tr><th>' + T('題', '#') + '</th><th>' + T('答案', 'answer') + '</th><th>' + T('秒', 's') + '</th></tr>';
    state.log.slice(-8).reverse().forEach(function (r) {
      h += '<tr><td>' + r.round + '</td><td>y = ' + polyText(r.a, r.b, r.c) + '</td><td>' + (r.time == null ? T('放棄', 'gave up') : r.time.toFixed(1) + (r.first ? '' : '*')) + '</td></tr>';
    });
    t.innerHTML = h;
  }

  // 給測試用的介面（不影響畫面）
  window.__qf = {
    state: state, QG: QG, QLn: QLn, QS: QS,
    startChal: function (g) { startChal(g); },
    seed: function (s) { rand = M.rng(s); },
    toScreen: function (u) { return [X(u[0]), Y(u[1])]; },
    sqCorner: function () { return SQ ? [SQ.ox + state.x * SQ.u, SQ.oy + state.x * SQ.u, SQ.u] : null; }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  syncFn();
  setSlider(el.dp, state.dp); setSlider(el.dq, state.dq); setSlider(el.lm, state.m); setSlider(el.ln, state.n);
  setSlider(el.sp, state.p); setSlider(el.sq, state.q); setSlider(el.sx, state.x);
  state.dom = $('domC').checked; lab.setAttribute('data-dom', state.dom ? '1' : '0');
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
