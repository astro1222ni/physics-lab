/* polynomial.js — 「多項式函數的圖形」的畫面與互動（數學計算在 polynomial-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 根與圖形：f(x) = a · Π (x − r)^m · [(x − p)² + q²]；根在 x 軸上可以拖曳，曲線依正負上色，下方是符號圖與不等式的解。
 * 勘根定理：五個多項式，區間 [l, r] 的兩端可以拖曳；異號時保證有根，二分法一步一步縮小，下方留下每一步的區間。
 * 平移與伸縮：y = a · f(b(x − h)) + k，對稱中心 (h, k) 可以拖曳；三次函數的對稱中心公式。
 * 挑戰「看圖寫多項式」：虛線圖形與一個整數點，調出完全相同的多項式。 */
(function () {
  'use strict';
  const M = window.PolyCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha;
  const MAXDEG = 6;

  // ---------- 狀態 ----------
  const state = {
    mode: 'roots',
    roots: [{ x: -1, m: 1 }, { x: 2, m: 1 }], sel: 0, a: 1, quad: false, qp: 0, qq: 1, op: '>',
    fn: 'w', l: 0, r: 1, start: null, steps: [], iz: false,
    base: 'cube', ta: 1, tb: 1, th: 0, tk: 0, tg: true,
    Y: { roots: 10, ivt: 10, trans: 10 },
    chal: null, round: 0, streak: [], log: []
  };
  let rand = M.rng(((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0);
  let lastChal = null;
  let applying = false;

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'pf-pos', 'pf-neg', 'pf-root', 'pf-sol', 'pf-target', 'pf-int', 'pf-base', 'pf-ctr', 'pf-bad']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight, italic) { return (italic ? 'italic ' : '') + (weight ? weight + ' ' : '') + px + 'px ' + FONT; }

  // ---------- 數字 ----------
  function fmt(v, sig) {
    if (v == null || isNaN(v)) return '—';
    if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
    if (v === 0) return '0';
    const a = Math.abs(v);
    let s;
    if (a >= 1e-4 && a < 1e7) { s = Number(v.toPrecision(sig || 6)).toString(); if (/e/.test(s)) s = v.toFixed(8); }
    else {
      const e = Math.floor(Math.log10(a)), m = Number((v / Math.pow(10, e)).toPrecision(3));
      return String(m).replace('-', '−') + ' × 10<sup>' + String(e).replace('-', '−') + '</sup>';
    }
    return s.replace('-', '−');
  }
  function fmtC(v, sig) { return fmt(v, sig).replace(/ × 10<sup>(.*)<\/sup>/, '×10^$1'); }
  function fmtT(v, sig) {
    const s = fmt(v, sig);
    return s.replace(/ × 10<sup>(.*)<\/sup>/, '\\times 10^{$1}').replace(/−/g, '-').replace('∞', '\\infty');
  }
  function niceStep(span, n) {
    const raw = span / (n || 5), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }
  function tickStr(v, step) {
    const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    let s = v.toFixed(Math.min(dec, 8));
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  const r1 = function (v) { return Math.round(v * 1e6) / 1e6; };

  // ---------- 目前的量 ----------
  function QR() {
    const mg = M.merge(state.roots), quad = state.quad ? { p: state.qp, q: state.qq } : null;
    const n = M.degreeOf(state.roots, quad);
    const coef = M.fromFactored(state.a, mg, quad);
    const sol = M.solve(state.op, state.a, mg);
    const maxMul = mg.reduce(function (s, r) { return Math.max(s, r.m); }, 0);
    return { mg: mg, quad: quad, n: n, coef: coef, sol: sol, maxMul: maxMul, f: function (x) { return M.evalFactored(state.a, mg, quad, x); } };
  }
  function QI() {
    const c = M.PRESETS[state.fn].c;
    const fl = M.evalP(c, state.l), fr = M.evalP(c, state.r);
    const inside = M.realRoots(c, state.l, state.r, 3000).filter(function (x) { return x > state.l + 1e-12 && x < state.r - 1e-12; }).length;
    return { c: c, fl: fl, fr: fr, inside: inside, f: function (x) { return M.evalP(c, x); } };
  }
  function transRoots(c) {
    const out = M.realRoots(c, -12, 12, 6000);
    const sc = Math.max(1, Math.abs(c[c.length - 1]));
    M.realRoots(M.deriv(c), -12, 12, 6000).forEach(function (x) { if (Math.abs(M.evalP(c, x)) < 1e-9 * sc) out.push(x); });
    out.sort(function (u, v) { return u - v; });
    return out.filter(function (x, i) { return i === 0 || Math.abs(x - out[i - 1]) > 1e-6; });
  }
  function QT() {
    const c = M.transform(state.base, state.ta, state.tb, state.th, state.tk);
    return { c: c, odd: M.BASES[state.base].odd, f: function (x) { return M.evalP(c, x); } };
  }

  // ---------- 畫布 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 480, F = null;
  const STRIP = 66;
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    const narrow = cw < 600;
    ch = narrow ? Math.round(Math.max(380, Math.min(cw * 1.15, 470))) : 500;
    layout();
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    requestDraw();
  }
  function layout() {
    const narrow = cw < 600, strip = state.mode === 'roots';
    const P = { x0: narrow ? 34 : 44, x1: cw - 10, y0: 12, y1: ch - 26 - (strip ? STRIP : 0) };
    F = { narrow: narrow, W: cw, H: ch, P: P, S: strip ? { y0: P.y1 + 30, y1: ch - 6 } : null };
  }
  let rafId = 0;
  function requestDraw() { if (!rafId) rafId = requestAnimationFrame(function () { rafId = 0; draw(); }); }
  function clipP(c) { const P = F.P; c.beginPath(); c.rect(P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0); c.clip(); }

  /** 目前模式的座標視窗 */
  function view() {
    const P = F.P;
    let x0, x1, y0, y1;
    if (state.mode === 'ivt' && state.iz) {
      const w = Math.max(state.r - state.l, 1e-12), q = QI();
      x0 = state.l - 0.3 * w; x1 = state.r + 0.3 * w;
      let m = 0;
      for (let i = 0; i <= 120; i++) m = Math.max(m, Math.abs(q.f(x0 + (x1 - x0) * i / 120)));
      m = Math.max(m * 1.25, 1e-12);
      y0 = -m; y1 = m;
    } else {
      const xw = state.mode === 'ivt' ? 3.2 : 6;
      x0 = -xw; x1 = xw;
      const Y = state.Y[state.mode];
      y0 = -Y; y1 = Y;
    }
    return {
      x0: x0, x1: x1, y0: y0, y1: y1,
      X: function (x) { return P.x0 + (x - x0) / (x1 - x0) * (P.x1 - P.x0); },
      Y: function (y) { return P.y1 - (y - y0) / (y1 - y0) * (P.y1 - P.y0); },
      xAt: function (px) { return x0 + (px - P.x0) / (P.x1 - P.x0) * (x1 - x0); },
      yAt: function (py) { return y0 + (P.y1 - py) / (P.y1 - P.y0) * (y1 - y0); }
    };
  }
  function grid(c, V) {
    const P = F.P;
    D.roundRect(c, P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0, 8);
    c.fillStyle = alpha(C.text, D.dark ? 0.03 : 0.022); c.fill();
    const xs = niceStep(V.x1 - V.x0, F.narrow ? 6 : 10), ys = niceStep(V.y1 - V.y0, F.narrow ? 6 : 8);
    c.save(); clipP(c);
    c.lineWidth = 1;
    for (let x = Math.ceil(V.x0 / xs) * xs; x <= V.x1 + 1e-12; x += xs) { c.strokeStyle = alpha(C.text, 0.055); c.beginPath(); c.moveTo(V.X(x), P.y0); c.lineTo(V.X(x), P.y1); c.stroke(); }
    for (let y = Math.ceil(V.y0 / ys) * ys; y <= V.y1 + 1e-12; y += ys) { c.strokeStyle = alpha(C.text, 0.055); c.beginPath(); c.moveTo(P.x0, V.Y(y)); c.lineTo(P.x1, V.Y(y)); c.stroke(); }
    c.strokeStyle = alpha(C.text, 0.42); c.lineWidth = 1.3;
    c.beginPath();
    if (V.y0 <= 0 && V.y1 >= 0) { c.moveTo(P.x0, V.Y(0)); c.lineTo(P.x1, V.Y(0)); }
    if (V.x0 <= 0 && V.x1 >= 0) { c.moveTo(V.X(0), P.y0); c.lineTo(V.X(0), P.y1); }
    c.stroke();
    c.restore();
    c.font = fnt(10.5); c.fillStyle = C.muted;
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let x = Math.ceil(V.x0 / xs) * xs; x <= V.x1 + 1e-12; x += xs) {
      const X = V.X(x);
      if (X < P.x0 + 8 || X > P.x1 - 8) continue;
      c.fillText(tickStr(x, xs), X, P.y1 + 4);
    }
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let y = Math.ceil(V.y0 / ys) * ys; y <= V.y1 + 1e-12; y += ys) {
      const Y = V.Y(y);
      if (Y < P.y0 + 6 || Y > P.y1 - 4) continue;
      c.fillText(tickStr(y, ys), P.x0 - 4, Y);
    }
    D.haloText(c, 'x', P.x1 - 2, P.y1 + 15, C.muted, 'right', 'top', fnt(12, 600, true));
  }
  /** 依正負上色的曲線 */
  function curve(c, V, f, width, mono) {
    const P = F.P, N = Math.max(400, Math.round((P.x1 - P.x0) * 1.5));
    const lim = (V.y1 - V.y0) * 40;
    const yc = function (y) { return Math.max(V.y0 - lim, Math.min(V.y1 + lim, y)); };
    c.save(); clipP(c);
    c.lineWidth = width; c.lineJoin = 'round'; c.lineCap = 'round';
    let cur = null, xp = V.x0, yp = f(xp);
    function flush() { if (cur) { c.stroke(); cur = null; } }
    for (let i = 1; i <= N; i++) {
      const x = V.x0 + (V.x1 - V.x0) * i / N, y = f(x);
      const col = mono || (f((x + xp) / 2) >= 0 ? C['pf-pos'] : C['pf-neg']);
      if (col !== cur) { flush(); cur = col; c.strokeStyle = col; c.beginPath(); c.moveTo(V.X(xp), V.Y(yc(yp))); }
      c.lineTo(V.X(x), V.Y(yc(y)));
      xp = x; yp = y;
    }
    flush();
    c.restore();
  }
  function dashed(c, V, f, color, width) {
    c.save(); c.setLineDash([7, 5]);
    curve(c, V, f, width, color);
    c.restore();
  }

  // =====================================================================
  // 根與圖形
  // =====================================================================
  function drawRoots(c) {
    const P = F.P, V = view(), q = QR();
    grid(c, V);
    // 不等式的解：淡色直條
    c.save(); clipP(c);
    q.sol.forEach(function (s) {
      const a = Math.max(V.x0, s.lo), b = Math.min(V.x1, s.hi);
      if (s.lo === s.hi) {
        if (s.lo < V.x0 || s.lo > V.x1) return;
        c.strokeStyle = alpha(C['pf-sol'], 0.55); c.lineWidth = 2; c.setLineDash([4, 4]);
        c.beginPath(); c.moveTo(V.X(s.lo), P.y0); c.lineTo(V.X(s.lo), P.y1); c.stroke(); c.setLineDash([]);
        return;
      }
      if (b <= a) return;
      c.fillStyle = alpha(C['pf-sol'], D.dark ? 0.1 : 0.08);
      c.fillRect(V.X(a), P.y0, V.X(b) - V.X(a), P.y1 - P.y0);
    });
    c.restore();
    // 挑戰的題目
    if (state.chal) {
      const tg = state.chal.target;
      dashed(c, V, function (x) { return M.evalP(tg.coef, x); }, alpha(C['pf-target'], 0.85), 2.4);
      const hx = V.X(tg.hint.x), hy = V.Y(tg.hint.y);
      if (hy > P.y0 && hy < P.y1) {
        D.ball(c, hx, hy, 6, C['pf-target'], { glow: null });
        D.pill(c, '(' + fmtC(tg.hint.x) + ', ' + fmtC(tg.hint.y) + ')', hx + (hx > P.x1 - 90 ? -10 : 10), hy - 10, C['pf-target'], hx > P.x1 - 90 ? 'right' : 'left', fnt(12, 700));
      } else D.pill(c, T('提示點 ', 'Marked point ') + '(' + fmtC(tg.hint.x) + ', ' + fmtC(tg.hint.y) + ')', P.x0 + 8, P.y0 + 22, C['pf-target'], 'left', fnt(12, 700));
    }
    // 曲線
    curve(c, V, q.f, 3.2);
    // 根
    const y0 = V.Y(0);
    q.mg.forEach(function (r) {
      const X = V.X(r.x);
      if (X < P.x0 - 4 || X > P.x1 + 4) return;
      const rad = 5.5 + 1.6 * Math.min(r.m, 5);
      D.ball(c, X, y0, rad, C['pf-root'], { glow: 0.25 });
      if (r.m > 1) D.pill(c, '×' + r.m, X, y0 - rad - 6, C['pf-root'], 'center', fnt(11.5, 700));
    });
    // 選取的根
    const sr = state.roots[state.sel];
    if (sr) {
      const X = V.X(sr.x);
      c.strokeStyle = C.accent; c.lineWidth = 2; c.setLineDash([3, 3]);
      c.beginPath(); c.arc(X, y0, 7 + 1.6 * Math.min(5, q.mg.find(function (r) { return Math.abs(r.x - sr.x) < 1e-9; }).m) + 4, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    }
    // 兩端的走向
    if (q.n > 0) {
      const e = M.endBehavior(state.a, q.n);
      arrowEnd(c, P.x0 + 14, e.left > 0, q.f(V.x0) >= 0 ? C['pf-pos'] : C['pf-neg']);
      arrowEnd(c, P.x1 - 14, e.right > 0, q.f(V.x1) >= 0 ? C['pf-pos'] : C['pf-neg']);
    }
    drawStrip(c, V, q);
  }
  function arrowEnd(c, x, up, col) {
    const P = F.P, y = up ? P.y0 + 10 : P.y1 - 10;
    c.fillStyle = alpha(col, 0.85); c.beginPath();
    if (up) { c.moveTo(x, y - 6); c.lineTo(x - 5.5, y + 3); c.lineTo(x + 5.5, y + 3); }
    else { c.moveTo(x, y + 6); c.lineTo(x - 5.5, y - 3); c.lineTo(x + 5.5, y - 3); }
    c.fill();
  }
  /** 符號圖：數線、每一段的 + 或 −、不等式的解（粗線，空心點不含、實心點含） */
  function drawStrip(c, V, q) {
    const P = F.P, S = F.S;
    if (!S) return;
    const yl = S.y0 + 36;
    D.haloText(c, T('f(x) 的正負', 'sign of f(x)'), P.x0, S.y0 + 2, C.muted, 'left', 'top', fnt(11.5, 600));
    D.haloText(c, T('解 ', 'solve ') + 'f(x) ' + opStr(state.op) + ' 0', P.x1, S.y0 + 2, C['pf-sol'], 'right', 'top', fnt(11.5, 700));
    c.strokeStyle = alpha(C.text, 0.45); c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(P.x0, yl); c.lineTo(P.x1, yl); c.stroke();
    // 解
    c.strokeStyle = C['pf-sol']; c.lineWidth = 5; c.lineCap = 'round';
    q.sol.forEach(function (s) {
      if (s.lo === s.hi) return;
      const a = Math.max(V.x0, s.lo), b = Math.min(V.x1, s.hi);
      if (b <= a) return;
      c.beginPath(); c.moveTo(V.X(a), yl); c.lineTo(V.X(b), yl); c.stroke();
    });
    c.lineCap = 'butt';
    // 每一段的正負
    M.signChart(state.a, q.mg).forEach(function (sg) {
      const a = Math.max(V.x0, sg.lo), b = Math.min(V.x1, sg.hi);
      if (b - a <= 0) return;
      const xm = (V.X(a) + V.X(b)) / 2;
      if (V.X(b) - V.X(a) < 14) return;
      D.haloText(c, sg.s > 0 ? '+' : '−', xm, yl - 4, sg.s > 0 ? C['pf-pos'] : C['pf-neg'], 'center', 'bottom', fnt(15, 800));
    });
    // 根的點
    const incl = state.op === '>=' || state.op === '<=';
    c.font = fnt(10.5); c.textAlign = 'center'; c.textBaseline = 'top';
    q.mg.forEach(function (r) {
      const X = V.X(r.x);
      if (X < P.x0 - 2 || X > P.x1 + 2) return;
      c.beginPath(); c.arc(X, yl, 4.5, 0, Math.PI * 2);
      c.fillStyle = incl ? C['pf-sol'] : C['canvas-bg']; c.fill();
      c.strokeStyle = incl ? C['pf-sol'] : C.text; c.lineWidth = 1.6; c.stroke();
      c.fillStyle = C.muted; c.fillText(fmtC(r1(r.x), 4), X, yl + 7);
    });
  }
  function opStr(op) { return op === '>=' ? '≥' : op === '<=' ? '≤' : op; }

  // =====================================================================
  // 勘根定理
  // =====================================================================
  function drawIvt(c) {
    const P = F.P, V = view(), q = QI();
    grid(c, V);
    const Xl = V.X(state.l), Xr = V.X(state.r);
    c.save(); clipP(c);
    c.fillStyle = alpha(C['pf-int'], D.dark ? 0.12 : 0.09);
    c.fillRect(Math.min(Xl, Xr), P.y0, Math.abs(Xr - Xl), P.y1 - P.y0);
    // 二分法每一步的區間（下方一層一層）
    state.steps.forEach(function (s, i) {
      const y = P.y1 - 8 - i * 7;
      if (y < P.y0 + 30) return;
      c.strokeStyle = alpha(C['pf-int'], 0.35 + 0.65 * (i + 1) / state.steps.length); c.lineWidth = 3.2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(V.X(s.l), y); c.lineTo(Math.max(V.X(s.r), V.X(s.l) + 0.5), y); c.stroke();
      c.lineCap = 'butt';
    });
    c.restore();
    curve(c, V, q.f, 3);
    // 兩端
    [[state.l, q.fl, 'l'], [state.r, q.fr, 'r']].forEach(function (e) {
      const X = V.X(e[0]), Yv = V.Y(e[1]), Y = Math.max(P.y0 + 6, Math.min(P.y1 - 6, Yv)), Y0 = Math.max(P.y0, Math.min(P.y1, V.Y(0)));
      c.strokeStyle = C['pf-int']; c.lineWidth = 2; c.setLineDash([5, 4]);
      c.beginPath(); c.moveTo(X, P.y0); c.lineTo(X, P.y1); c.stroke(); c.setLineDash([]);
      c.strokeStyle = alpha(C.text, 0.5); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(X, Y0); c.lineTo(X, Y); c.stroke();
      D.ball(c, X, Y, 7, e[1] > 0 ? C['pf-pos'] : e[1] < 0 ? C['pf-neg'] : C['pf-sol'], { glow: 0.3 });
      const right = e[2] === 'r';
      D.pill(c, 'f(' + e[2] + ') = ' + fmtC(e[1], 4), Math.max(P.x0 + 4, Math.min(P.x1 - 4, X + (right ? 10 : -10))), Math.max(P.y0 + 22, Math.min(P.y1 - 4, Y + (Yv < P.y0 + 40 ? 26 : -12))), e[1] > 0 ? C['pf-pos'] : e[1] < 0 ? C['pf-neg'] : C['pf-sol'], right ? 'left' : 'right', fnt(11.5, 700));
    });
    // 結論
    const prod = q.fl * q.fr;
    const msg = prod < 0 ? T('異號：中間至少一個根', 'Opposite signs: at least one root inside') : prod === 0 ? T('端點就是根', 'An end is a root') : T('同號：不能下結論', 'Same sign: no conclusion');
    D.pill(c, msg, (P.x0 + P.x1) / 2, P.y0 + 22, prod < 0 ? C['pf-sol'] : prod === 0 ? C['pf-sol'] : C.muted, 'center', fnt(12.5, 700));
  }

  // =====================================================================
  // 平移與伸縮
  // =====================================================================
  function drawTrans(c) {
    const P = F.P, V = view(), q = QT();
    grid(c, V);
    const B = M.BASES[state.base];
    if (state.tg) dashed(c, V, function (x) { return M.evalP(B.c, x); }, alpha(C['pf-base'], 0.95), 2.2);
    // 對稱軸（四次）
    if (!q.odd) {
      c.save(); clipP(c);
      c.strokeStyle = alpha(C['pf-ctr'], 0.8); c.lineWidth = 1.6; c.setLineDash([6, 4]);
      c.beginPath(); c.moveTo(V.X(state.th), P.y0); c.lineTo(V.X(state.th), P.y1); c.stroke(); c.setLineDash([]);
      c.restore();
    }
    curve(c, V, q.f, 3.2);
    // 從原點移到 (h, k) 的箭頭
    const X0 = V.X(0), Y0 = V.Y(0), Xh = V.X(state.th), Yk = V.Y(state.tk);
    if (Math.hypot(Xh - X0, Yk - Y0) > 18) {
      c.save(); clipP(c);
      c.strokeStyle = alpha(C['pf-ctr'], 0.6); c.lineWidth = 1.5; c.setLineDash([3, 4]);
      c.beginPath(); c.moveTo(X0, Y0); c.lineTo(Xh, Yk); c.stroke(); c.setLineDash([]);
      const ang = Math.atan2(Yk - Y0, Xh - X0), xe = Xh - Math.cos(ang) * 10, ye = Yk - Math.sin(ang) * 10;
      c.fillStyle = alpha(C['pf-ctr'], 0.8); c.beginPath();
      c.moveTo(xe, ye); c.lineTo(xe - Math.cos(ang - 0.45) * 8, ye - Math.sin(ang - 0.45) * 8); c.lineTo(xe - Math.cos(ang + 0.45) * 8, ye - Math.sin(ang + 0.45) * 8); c.fill();
      c.restore();
    }
    if (Yk > P.y0 - 4 && Yk < P.y1 + 4) {
      D.ball(c, Xh, Yk, 7.5, C['pf-ctr'], { glow: 0.35 });
      D.pill(c, '(' + fmtC(state.th, 4) + ', ' + fmtC(state.tk, 4) + ')', Math.min(P.x1 - 4, Xh + 12), Math.max(P.y0 + 22, Yk - 12), C['pf-ctr'], Xh > P.x1 - 90 ? 'right' : 'left', fnt(12, 700));
    }
  }

  // ---------- 主畫面 ----------
  function draw() {
    if (!F) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(ctx, cw, ch);
    if (state.mode === 'roots') drawRoots(ctx);
    else if (state.mode === 'ivt') drawIvt(ctx);
    else drawTrans(ctx);
    if (kb && kb.focused()) {
      const P = F.P;
      ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
      D.roundRect(ctx, P.x0 + 2, P.y0 + 2, P.x1 - P.x0 - 4, P.y1 - P.y0 - 4, 7); ctx.stroke(); ctx.setLineDash([]);
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
  function mulName(m) {
    return m === 1 ? '' : T(m === 2 ? '（二重）' : m === 3 ? '（三重）' : '（' + m + ' 重）', '(×' + m + ')');
  }
  function rootsList(mg) {
    if (!mg.length) return T('沒有', 'none');
    return mg.map(function (r) { return fmt(r1(r.x), 6) + mulName(r.m); }).join(T('、', ', '));
  }
  function endText(e) {
    const s = function (v) { return v > 0 ? T('往上', 'up') : T('往下', 'down'); };
    return T('左端' + s(e.left) + '、右端' + s(e.right), 'left ' + s(e.left) + ', right ' + s(e.right));
  }
  function updateReadouts() {
    if (state.mode === 'roots') {
      const q = QR();
      setHTML('rDeg', String(q.n));
      setHTML('rRoots', rootsList(q.mg) + (q.quad ? T('；另有兩個虛根 ', '; plus two non-real roots ') + fmt(r1(q.quad.p), 4) + ' ± ' + fmt(r1(q.quad.q), 4) + '<i>i</i>' : ''));
      setHTML('rEnd', q.n === 0 ? T('水平線', 'a horizontal line') : endText(M.endBehavior(state.a, q.n)));
      const fac = M.factoredTex(state.a, q.mg, q.quad), std = M.polyTex(q.coef);
      setEq('rEq', fac === std ? 'f(x) = ' + std : 'f(x) = ' + fac + '\\\\ = ' + std);
      setEq('rEq2', 'f(x) ' + (state.op === '>=' ? '\\ge' : state.op === '<=' ? '\\le' : state.op) + ' 0 \\iff x \\in ' + M.solTex(q.sol));
    } else if (state.mode === 'ivt') {
      const q = QI(), prod = q.fl * q.fr;
      setHTML('iFl', fmt(q.fl, 7));
      setHTML('iFr', fmt(q.fr, 7));
      setHTML('iW', fmt(state.r - state.l, 6));
      setHTML('iCon', prod < 0 ? T('(l, r) 裡至少有一個根', 'at least one root in (l, r)') : prod === 0 ? T('端點就是根', 'an end is a root') : T('不能下結論', 'no conclusion'));
      setEq('rEq', 'f(x) = ' + M.PRESETS[state.fn].tex);
      const sgn = prod < 0 ? '< 0 \\;\\Rightarrow\\; \\exists\\, c \\in (' + fmtT(state.l, 8) + ',\\ ' + fmtT(state.r, 8) + '),\\ f(c) = 0' : prod === 0 ? '= 0' : '> 0';
      setEq('rEq2', 'f(' + fmtT(state.l, 8) + ')\\, f(' + fmtT(state.r, 8) + ') ' + sgn);
    } else {
      const q = QT(), c = q.c;
      if (q.odd) {
        const cc = M.cubicCenter(c);
        setHTML('tC', '(' + fmt(r1(cc.x), 6) + ', ' + fmt(r1(cc.y), 6) + ')');
        setEq('rEq2', 'h = -\\frac{B}{3A} = -\\frac{' + fmtT(r1(c[2]), 6) + '}{3 \\cdot ' + (c[3] < 0 ? '(' + fmtT(r1(c[3]), 6) + ')' : fmtT(r1(c[3]), 6)) + '} = ' + fmtT(r1(cc.x), 6) + ',\\quad k = f(h) = ' + fmtT(r1(cc.y), 6));
      } else {
        setHTML('tC', 'x = ' + fmt(r1(state.th), 6));
        setEq('rEq2', 'f(h + d) = f(h - d),\\quad h = ' + fmtT(r1(state.th), 6));
      }
      const rs = transRoots(c);
      setHTML('tR', rs.length ? rs.map(function (x) { return fmt(x, 5); }).join(T('、', ', ')) : T('沒有', 'none'));
      const ab = function (v) { return v === 1 ? '' : v === -1 ? '-' : fmtT(v, 4); };
      const inner = state.tb === 1 ? '' : state.tb === -1 ? '-' : fmtT(state.tb, 4);
      const xh = state.th === 0 ? 'x' : '(x ' + (state.th < 0 ? '+ ' : '- ') + fmtT(Math.abs(state.th), 4) + ')';
      const arg = inner === '' ? xh : inner + (xh === 'x' ? 'x' : xh);
      const kk = state.tk === 0 ? '' : (state.tk < 0 ? ' - ' : ' + ') + fmtT(Math.abs(state.tk), 4);
      setEq('rEq', 'y = ' + ab(state.ta) + 'f\\big(' + arg + '\\big)' + kk + ' = ' + M.polyTex(c));
    }
    setHTML('status', statusText());
  }
  function statusText() {
    if (state.mode === 'roots') {
      const q = QR();
      if (state.chal) return T('讓你的圖形和虛線完全重合：先看根的位置與穿過／碰到，再用標出來的點決定 a。', 'Make your graph lie exactly on the dashed one: read off the roots and whether it crosses or touches, then use the marked point to find a.');
      if (q.maxMul >= 4) return T('這個根的重數是 ' + q.maxMul + '：根附近幾乎躺平。', 'This root has multiplicity ' + q.maxMul + ': the graph is almost flat near it.');
      const odd = q.mg.filter(function (r) { return r.m % 2 === 1; }).length, even = q.mg.length - odd;
      let s = T('實根 ' + q.mg.length + ' 個（穿過 ' + odd + ' 個、碰到 ' + even + ' 個）', q.mg.length + ' real root(s): ' + odd + ' crossing, ' + even + ' touching');
      if (q.quad) s += T('；(x − p)² + q² 永遠大於 0，次數多 2 卻不多交點。', '; (x − p)² + q² is always positive: two more degrees, no more crossings.');
      else s += T('。拖兩個根到同一點看看。', '. Drag two roots onto the same spot.');
      return s;
    }
    if (state.mode === 'ivt') {
      const q = QI(), prod = q.fl * q.fr;
      if (state.steps.length && state.steps[state.steps.length - 1].exact) return T('中點剛好是根：f(m) = 0，二分法提早結束。', 'The midpoint is exactly a root: f(m) = 0 and bisection stops early.');
      if (prod < 0) return T('f(l) 與 f(r) 異號：圖形連續，中間一定穿過 x 軸。按「二分一次」把區間縮小一半。', 'f(l) and f(r) have opposite signs: the graph is unbroken, so it must cross the axis in between. Press “Halve once” to cut the interval in half.');
      if (prod === 0) return T('有一個端點的值剛好是 0：它本身就是根。', 'One end has value exactly 0: it is itself a root.');
      if (q.inside >= 2) return T('兩端同號，裡面卻有 ' + q.inside + ' 個根：勘根定理的反面不成立。', 'Same sign at both ends, yet ' + q.inside + ' roots inside: the converse of the theorem fails.');
      return T('兩端同號：勘根定理不能下結論（可能沒有根，也可能有偶數個）。移動 l 或 r 找一個異號的區間。', 'Same sign at both ends: the theorem says nothing (there may be no root, or an even number). Move l or r to find a sign change.');
    }
    const q = QT();
    if (q.odd) return T('三次函數的圖形對 (h, k) 點對稱：把圖形繞這一點轉半圈，會和自己重合。', 'A cubic graph is symmetric about the point (h, k): turn it half a turn about that point and it lands on itself.');
    return T('四次函數 x<sup>4</sup> − 2x² 平移伸縮後，對稱軸是 x = h。', 'After shifting and stretching x<sup>4</sup> − 2x², the axis of symmetry is x = h.');
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
  /** 實根的個數或重數改變時發聲（音高依重數） */
  let lastSig = null;
  function rootSound() {
    if (state.mode !== 'roots') { lastSig = null; return; }
    const q = QR(), sig = q.mg.map(function (r) { return r.m; }).join(',');
    if (lastSig != null && sig !== lastSig) {
      if (q.maxMul >= 2 && q.mg.length < lastSig.split(',').length) blip(392 * Math.pow(2, (q.maxMul - 1) / 4), 'sine', 0.18);
      else blip(523.25, 'triangle', 0.12);
    }
    lastSig = sig;
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function emitRoots() {
    const q = QR();
    emit('roots', { deg: q.n, a: state.a, roots: q.mg.map(function (r) { return { x: r1(r.x), m: r.m }; }), nReal: q.mg.length, quad: !!q.quad, op: state.op, sol: M.solKey(q.sol), maxMul: q.maxMul, chal: !!state.chal });
  }
  function emitIvt() { const q = QI(); emit('ivt', { fn: state.fn, l: state.l, r: state.r, fl: q.fl, fr: q.fr, inside: q.inside }); }
  function emitTrans() { emit('trans', { base: state.base, a: state.ta, b: state.tb, h: state.th, k: state.tk }); }
  function emitMode() { if (state.mode === 'roots') emitRoots(); else if (state.mode === 'ivt') emitIvt(); else emitTrans(); }

  // =====================================================================
  // 控制項
  // =====================================================================
  const lab = $('lab');
  const el = { rx: $('rx'), ra: $('ra'), qp: $('qp'), qq: $('qq'), il: $('il'), ir: $('ir'), ta: $('ta'), tb: $('tb'), th: $('th'), tk: $('tk'), yv: $('yv') };
  if (window.LabNum) {
    window.LabNum.register(el.yv, { toValue: function (p) { const v = Math.pow(10, p); return v < 10 ? Math.round(v * 10) / 10 : v < 100 ? Math.round(v) : Math.round(v / 5) * 5; }, toPos: Math.log10, min: 1, max: 1000, decimals: 1 });
  }
  const r2 = function (v) { return Math.round(v * 100) / 100; };
  function nonzero(v, prev) { return Math.abs(v) < 0.05 ? (prev < 0 ? -0.1 : 0.1) : v; }
  /** 依改動的滑桿更新狀態 */
  function readOne(k) {
    const v = val(el[k]);
    if (k === 'rx') { const r = state.roots[state.sel]; if (r) r.x = r2(v); }
    else if (k === 'ra') { state.a = nonzero(r2(v), state.a); if (state.a !== r2(v)) setSlider(el.ra, state.a); }
    else if (k === 'qp') state.qp = r2(v);
    else if (k === 'qq') state.qq = Math.max(0.1, r2(v));
    else if (k === 'il' || k === 'ir') {
      state[k === 'il' ? 'l' : 'r'] = r2(v);
      state.steps = []; state.start = null; renderSteps();
    }
    else if (k === 'ta') { state.ta = nonzero(r2(v), state.ta); if (state.ta !== r2(v)) setSlider(el.ta, state.ta); }
    else if (k === 'tb') { state.tb = nonzero(r2(v), state.tb); if (state.tb !== r2(v)) setSlider(el.tb, state.tb); }
    else if (k === 'th') state.th = r2(v);
    else if (k === 'tk') state.tk = r2(v);
    else if (k === 'yv') state.Y[state.mode] = v;
  }
  function refreshOutputs() {
    const sr = state.roots[state.sel];
    $('rxo').textContent = sr ? fmtC(sr.x, 4) : '—';
    $('rao').textContent = fmtC(state.a, 4);
    $('qpo').textContent = fmtC(state.qp, 4);
    $('qqo').textContent = fmtC(state.qq, 4);
    $('ilo').textContent = fmtC(state.l, 9);
    $('iro').textContent = fmtC(state.r, 9);
    $('tao').textContent = fmtC(state.ta, 4);
    $('tbo').textContent = fmtC(state.tb, 4);
    $('tho').textContent = fmtC(state.th, 4);
    $('tko').textContent = fmtC(state.tk, 4);
    $('yvo').textContent = fmtC(state.Y[state.mode], 4);
  }
  const src = { rx: 'roots', ra: 'roots', qp: 'roots', qq: 'roots', il: 'ivt', ir: 'ivt', ta: 'trans', tb: 'trans', th: 'trans', tk: 'trans', yv: null };
  function refresh() { refreshOutputs(); updateReadouts(); rootSound(); requestDraw(); }
  function finalEmit(from) { if (from === 'roots') emitRoots(); else if (from === 'ivt') emitIvt(); else if (from === 'trans') emitTrans(); }
  Object.keys(el).forEach(function (k) {
    el[k].addEventListener('input', function () { if (applying) return; readOne(k); if (k === 'rx') renderRootPick(); refresh(); });
    el[k].addEventListener('change', function () { if (applying) return; readOne(k); if (k === 'rx') renderRootPick(); refresh(); finalEmit(src[k]); });
  });
  function setSlider(e, v) {
    applying = true;
    if (window.LabNum) window.LabNum.set(e, v); else e.value = v;
    applying = false;
  }

  // ---------- 根的清單 ----------
  function renderRootPick() {
    const box = $('rootPick');
    let h = '';
    state.roots.forEach(function (r, i) {
      h += '<button type="button" data-i="' + i + '" aria-pressed="' + (i === state.sel) + '">x = ' + fmt(r.x, 4) + (r.m > 1 ? ' ×' + r.m : '') + '</button>';
    });
    if (box.innerHTML !== h) box.innerHTML = h;
    document.querySelectorAll('#mulPick button').forEach(function (b) {
      const sr = state.roots[state.sel];
      b.setAttribute('aria-pressed', String(!!sr && +b.getAttribute('data-m') === sr.m));
      const m = +b.getAttribute('data-m');
      b.disabled = !sr || totalDeg() - sr.m + m > MAXDEG;
    });
    $('addRoot').disabled = totalDeg() + 1 > MAXDEG;
    $('delRoot').disabled = state.roots.length <= 1 && !state.quad;
    $('quadC').disabled = !state.quad && totalDeg() + 2 > MAXDEG;
  }
  function totalDeg() { return M.degreeOf(state.roots, state.quad); }
  $('rootPick').addEventListener('click', function (ev) {
    const b = ev.target.closest('button'); if (!b) return;
    selectRoot(+b.getAttribute('data-i'));
  });
  function selectRoot(i) {
    state.sel = Math.max(0, Math.min(state.roots.length - 1, i));
    const r = state.roots[state.sel];
    if (r) setSlider(el.rx, r.x);
    renderRootPick(); refresh(); blip(440);
  }
  document.querySelectorAll('#mulPick button').forEach(function (b) {
    b.addEventListener('click', function () {
      const r = state.roots[state.sel]; if (!r) return;
      r.m = +b.getAttribute('data-m');
      renderRootPick(); refresh(); emitRoots();
    });
  });
  $('addRoot').addEventListener('click', function () {
    if (totalDeg() + 1 > MAXDEG) return;
    // 找一個還沒有根的整數位置（靠近 0）
    const cand = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5];
    let x = cand.find(function (v) { return !state.roots.some(function (r) { return Math.abs(r.x - v) < 1e-9; }); });
    if (x == null) x = 0;
    state.roots.push({ x: x, m: 1 });
    state.sel = state.roots.length - 1;
    setSlider(el.rx, x);
    renderRootPick(); refresh(); emitRoots();
  });
  $('delRoot').addEventListener('click', function () {
    if (state.roots.length <= 1) {
      if (state.quad) { $('quadC').checked = false; setQuad(false); }
      return;
    }
    state.roots.splice(state.sel, 1);
    state.sel = Math.min(state.sel, state.roots.length - 1);
    setSlider(el.rx, state.roots[state.sel].x);
    renderRootPick(); refresh(); emitRoots();
  });
  function setQuad(on) {
    state.quad = on;
    document.querySelectorAll('.quad-only').forEach(function (e) { e.hidden = !on; });
    renderRootPick(); refresh(); emitRoots();
  }
  $('quadC').addEventListener('change', function () { setQuad($('quadC').checked); });
  document.querySelectorAll('#opPick button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.op = b.getAttribute('data-op');
      document.querySelectorAll('#opPick button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      refresh(); emitRoots(); blip(494);
    });
  });

  // ---------- 勘根 ----------
  document.querySelectorAll('#fnPick button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.fn = b.getAttribute('data-fn');
      document.querySelectorAll('#fnPick button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      state.steps = []; state.start = null; renderSteps();
      for (const id in eqKey) delete eqKey[id];
      refresh(); emitIvt(); blip(440);
    });
  });
  $('izC').addEventListener('change', function () { state.iz = $('izC').checked; requestDraw(); blip(state.iz ? 523.25 : 392); });
  function bisectOnce() {
    const q = QI();
    if (!(q.fl * q.fr < 0)) {
      chime(false);
      setHTML('status', T('兩端要異號才能二分：先移動 l 或 r。', 'The two ends need opposite signs before halving: move l or r first.'));
      return;
    }
    if (!state.start) state.start = { l: state.l, r: state.r };
    const s = M.bisect(q.c, state.l, state.r);
    state.l = s.l; state.r = s.r;
    state.steps.push({ l: s.l, r: s.r, m: s.m, fm: s.fm, exact: s.exact });
    setSlider(el.il, state.l); setSlider(el.ir, state.r);
    renderSteps(); refresh();
    if (s.exact) chime(true);
    else { const S = sound(); if (S) S.tone({ freq: Math.min(1400, 330 * Math.pow(2, state.steps.length / 6)), dur: 0.09, type: 'sine', gain: 0.16 }); }
    emit('bisect', { fn: state.fn, l: state.l, r: state.r, width: state.r - state.l, exact: s.exact, steps: state.steps.length });
  }
  $('bisBtn').addEventListener('click', bisectOnce);
  $('bisUndo').addEventListener('click', function () {
    if (!state.start) return;
    state.l = state.start.l; state.r = state.start.r;
    state.start = null; state.steps = [];
    setSlider(el.il, state.l); setSlider(el.ir, state.r);
    renderSteps(); refresh(); emitIvt(); blip(392);
  });
  function renderSteps() {
    const t = $('bt');
    $('bisUndo').disabled = !state.start;
    if (!state.steps.length) { t.innerHTML = ''; return; }
    let h = '<tr><th>' + T('步', '#') + '</th><th>m</th><th>f(m)</th><th>' + T('新區間', 'new interval') + '</th></tr>';
    state.steps.slice(-12).forEach(function (s, i, arr) {
      const n = state.steps.length - arr.length + i + 1;
      h += '<tr><td>' + n + '</td><td>' + fmt(s.m, 9) + '</td><td>' + fmt(s.fm, 4) + '</td><td>[' + fmt(s.l, 9) + ', ' + fmt(s.r, 9) + ']</td></tr>';
    });
    t.innerHTML = h;
  }

  // ---------- 平移伸縮 ----------
  document.querySelectorAll('#basePick button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.base = b.getAttribute('data-base');
      document.querySelectorAll('#basePick button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      for (const id in eqKey) delete eqKey[id];
      refresh(); emitTrans(); blip(440);
    });
  });
  $('tgC').addEventListener('change', function () { state.tg = $('tgC').checked; requestDraw(); });

  // ---------- 縱軸 ----------
  function fitY() {
    let m = 0, f, x0, x1;
    if (state.mode === 'roots') {
      const q = QR();
      f = q.f;
      const xs = state.chal ? [] : q.mg.map(function (r) { return r.x; });
      if (state.chal) { const tg = state.chal.target; tg.roots.forEach(function (r) { xs.push(r.x); }); xs.push(tg.hint.x); }
      else if (q.quad) xs.push(q.quad.p);
      x0 = Math.max(-6, Math.min.apply(null, xs.concat([0])) - 1); x1 = Math.min(6, Math.max.apply(null, xs.concat([0])) + 1);
      // 挑戰時只依題目的圖形調整，自己的曲線超出畫面沒關係
      for (let i = 0; i <= 200; i++) { const x = x0 + (x1 - x0) * i / 200; m = Math.max(m, Math.abs(state.chal ? M.evalP(state.chal.target.coef, x) : f(x))); }
      if (state.chal) m = Math.max(m, Math.abs(state.chal.target.hint.y));
    } else if (state.mode === 'ivt') {
      const q = QI();
      for (let i = 0; i <= 200; i++) m = Math.max(m, Math.min(Math.abs(q.f(-2.5 + 5 * i / 200)), 60));
    } else {
      const q = QT();
      for (let i = 0; i <= 200; i++) { const x = state.th - 3 + 6 * i / 200; m = Math.max(m, Math.min(Math.abs(q.f(x)), 500)); }
      m = Math.max(m, Math.abs(state.tk) + 1);
    }
    const Y = Math.max(1, Math.min(1000, m * 1.2));
    const nice = Y < 10 ? Math.ceil(Y) : Y < 100 ? Math.ceil(Y / 5) * 5 : Math.ceil(Y / 50) * 50;
    state.Y[state.mode] = nice;
    setSlider(el.yv, nice);
  }
  $('autoY').addEventListener('click', function () { fitY(); refresh(); blip(523.25); });

  // ---------- 模式 ----------
  function setMode(m) {
    if (m === state.mode) return;
    if (state.chal) quitChal(true);
    state.mode = m;
    lab.setAttribute('data-mode', m);
    document.querySelectorAll('.modes button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === m)); });
    for (const id in eqKey) delete eqKey[id];
    setSlider(el.yv, state.Y[m]);
    layout();
    lastSig = null;
    refresh();
    emitMode();
  }
  document.querySelectorAll('.modes button').forEach(function (b) { b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); }); });

  // ---------- 全部清除 ----------
  $('clear').addEventListener('click', function () {
    if (state.chal) quitChal(true);
    state.log = []; state.streak = []; state.round = 0; lastChal = null;
    if (state.start) { state.l = state.start.l; state.r = state.start.r; setSlider(el.il, state.l); setSlider(el.ir, state.r); }
    state.steps = []; state.start = null;
    setChalMsg(''); renderLog(); renderSteps();
    for (const id in eqKey) delete eqKey[id];
    refresh();
    blip(392);
  });

  // ---------- 在圖上拖曳 ----------
  let drag = null;
  function posOf(ev) { const rc = cv.getBoundingClientRect(); return { px: ev.clientX - rc.left, py: ev.clientY - rc.top }; }
  function clampv(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function hitTest(px, py, R) {
    const P = F.P;
    if (px < P.x0 - 10 || px > P.x1 + 10 || py < P.y0 - 10 || py > (F.S ? F.S.y1 : P.y1) + 10) return null;
    const V = view();
    if (state.mode === 'roots') {
      const y0 = V.Y(0);
      const inStrip = F.S && py > F.S.y0;
      if (Math.abs(py - y0) > R + 10 && !inStrip) return null;
      // 先找選取的根，再找其他的（最近的）
      let best = null, bd = Infinity;
      state.roots.forEach(function (r, i) {
        const d = Math.abs(V.X(r.x) - px) - (i === state.sel ? 3 : 0);
        if (d < bd) { bd = d; best = i; }
      });
      if (best != null && bd <= R + 4) return { what: 'root', i: best };
      return null;
    }
    if (state.mode === 'ivt') {
      const dl = Math.abs(V.X(state.l) - px), dr = Math.abs(V.X(state.r) - px);
      if (Math.min(dl, dr) <= R) return { what: dl <= dr ? 'l' : 'r' };
      return null;
    }
    if (Math.hypot(V.X(state.th) - px, V.Y(state.tk) - py) <= R + 6) return { what: 'ctr' };
    return null;
  }
  function dragTo(h, px, py) {
    const V = view();
    if (h.what === 'root') {
      const r = state.roots[h.i];
      if (!r) return;
      let x = Math.round(clampv(V.xAt(px), -5, 5) * 10) / 10;
      // 靠近別的根時吸過去
      state.roots.forEach(function (o, j) { if (j !== h.i && Math.abs(o.x - x) < 0.12) x = o.x; });
      if (x !== r.x) { r.x = x; if (h.i === state.sel) setSlider(el.rx, x); renderRootPick(); }
    } else if (h.what === 'l' || h.what === 'r') {
      if (state.steps.length) { state.steps = []; state.start = null; renderSteps(); }
      const x = Math.round(clampv(V.xAt(px), -3, 3) * 100) / 100;
      state[h.what] = x;
      setSlider(h.what === 'l' ? el.il : el.ir, x);
    } else if (h.what === 'ctr') {
      state.th = Math.round(clampv(V.xAt(px), -5, 5) * 10) / 10;
      state.tk = Math.round(clampv(V.yAt(py), -5, 5) * 10) / 10;
      setSlider(el.th, state.th); setSlider(el.tk, state.tk);
    }
    refresh();
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (!F) return;
    const p = posOf(ev), touch = ev.pointerType === 'touch' || ev.pointerType === 'pen';
    const h = hitTest(p.px, p.py, touch ? 20 : 12);
    if (!h) return;
    ev.preventDefault();
    drag = { id: ev.pointerId, h: h };
    if (h.what === 'root' && h.i !== state.sel) { state.sel = h.i; setSlider(el.rx, state.roots[h.i].x); renderRootPick(); refresh(); }
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!F) return;
    const p = posOf(ev);
    if (!drag) {
      const h = hitTest(p.px, p.py, 12);
      cv.style.cursor = !h ? 'default' : h.what === 'ctr' ? 'move' : 'ew-resize';
      return;
    }
    if (drag.id !== ev.pointerId) return;
    dragTo(drag.h, p.px, p.py);
  });
  function endDrag(ev) {
    if (!drag || drag.id !== ev.pointerId) return;
    drag = null;
    finalEmit(state.mode);
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // ---------- 鍵盤 ----------
  let kb = null;
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('多項式畫布。Enter 切換要調的量，方向鍵調整，Shift 調得更多。根與圖形：選取的根與首項係數 a；勘根：左端 l 與右端 r；平移伸縮：中心 (h, k) 與 a。', 'Polynomial canvas. Enter picks the quantity, the arrow keys adjust it, Shift for bigger steps. Roots: the selected root and the leading coefficient a; trapping: the ends l and r; shifting: the centre (h, k) and a.'),
      items: [{
        name: function () { return state.mode === 'roots' ? T('選取的根', 'selected root') : state.mode === 'ivt' ? T('左端 l', 'left end l') : T('中心 (h, k)', 'centre (h, k)'); },
        move: function (dx, dy, big) {
          const st = big ? 1 : 0.1;
          if (state.mode === 'roots') {
            const r = state.roots[state.sel]; if (!r) return false;
            const v = dx || dy; if (!v) return false;
            r.x = Math.round(clampv(r.x + v * st, -5, 5) * 10) / 10; setSlider(el.rx, r.x); renderRootPick();
          } else if (state.mode === 'ivt') {
            const v = dx || dy; if (!v) return false;
            state.steps = []; state.start = null; renderSteps();
            state.l = r2(clampv(state.l + v * st, -3, 3)); setSlider(el.il, state.l);
          } else {
            if (dx) { state.th = Math.round(clampv(state.th + dx * st, -5, 5) * 10) / 10; setSlider(el.th, state.th); }
            if (dy) { state.tk = Math.round(clampv(state.tk + dy * st, -5, 5) * 10) / 10; setSlider(el.tk, state.tk); }
          }
          refresh(); finalEmit(state.mode); return true;
        },
        describe: function () {
          if (state.mode === 'roots') { const r = state.roots[state.sel]; return r ? 'x = ' + fmtC(r.x, 4) + T('，重數 ', ', multiplicity ') + r.m : ''; }
          if (state.mode === 'ivt') return 'l = ' + fmtC(state.l, 6) + '，f(l) = ' + fmtC(QI().fl, 4);
          return '(' + fmtC(state.th, 4) + ', ' + fmtC(state.tk, 4) + ')';
        }
      }, {
        name: function () { return state.mode === 'ivt' ? T('右端 r', 'right end r') : T('係數 a', 'coefficient a'); },
        move: function (dx, dy, big) {
          const v = dx || dy; if (!v) return false;
          const st = big ? 1 : 0.1;
          if (state.mode === 'roots') { state.a = nonzero(Math.round(clampv(state.a + v * st, -3, 3) * 10) / 10, state.a); setSlider(el.ra, state.a); }
          else if (state.mode === 'ivt') { state.steps = []; state.start = null; renderSteps(); state.r = r2(clampv(state.r + v * st, -3, 3)); setSlider(el.ir, state.r); }
          else { state.ta = nonzero(Math.round(clampv(state.ta + v * st, -3, 3) * 10) / 10, state.ta); setSlider(el.ta, state.ta); }
          refresh(); finalEmit(state.mode); return true;
        },
        describe: function () {
          if (state.mode === 'ivt') return 'r = ' + fmtC(state.r, 6) + '，f(r) = ' + fmtC(QI().fr, 4);
          return 'a = ' + fmtC(state.mode === 'roots' ? state.a : state.ta, 4);
        }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 挑戰：看圖寫多項式
  // =====================================================================
  const chalMsg = $('chalMsg');
  function setChalMsg(msg, cls) { chalMsg.textContent = msg || ''; chalMsg.classList.toggle('ok', cls === 'ok'); chalMsg.classList.toggle('bad', cls === 'bad'); }
  function startChal(forced) {
    if (state.mode !== 'roots') setMode('roots');
    const tg = forced || M.genChallenge(rand, lastChal);
    if (!tg) { setChalMsg(T('出不了題，請再按一次。', 'Could not make a challenge; please try again.')); return; }
    state.round++;
    state.chal = { target: tg, t0: performance.now(), round: state.round, tries: 0 };
    lastChal = tg;
    $('lgTarget').hidden = false;
    setChalMsg(T('第 ' + state.round + ' 題：次數 ' + tg.n + '。調出和虛線一樣的多項式再送出。', 'Challenge ' + state.round + ': degree ' + tg.n + '. Build the polynomial of the dashed graph and submit it.'));
    $('submitC').hidden = false; $('quitChal').hidden = false;
    $('newChal').textContent = T('換一題', 'Another one');
    fitY();
    for (const id in eqKey) delete eqKey[id];
    refresh();
  }
  function submitC() {
    const chg = state.chal;
    if (!chg) return;
    chg.tries++;
    const q = QR(), tg = chg.target;
    if (!M.same(q.coef, tg.coef, 1e-6)) {
      state.streak = [];
      chime(false);
      const sameRoots = !q.quad && q.mg.length === tg.roots.length && q.mg.every(function (r, i) { return Math.abs(r.x - tg.roots[i].x) < 1e-9 && r.m === tg.roots[i].m; });
      if (sameRoots) setChalMsg(T('根和重數都對了，但 a 不對：把標出來的點代進去算 a。（連續答對重新計算）', 'The roots and multiplicities are right but a is not: substitute the marked point to find a. (The streak starts over.)'), 'bad');
      else if (q.n !== tg.n) setChalMsg(T('次數不對：題目是 ' + tg.n + ' 次，你的是 ' + q.n + ' 次。（連續答對重新計算）', 'Wrong degree: the target has degree ' + tg.n + ', yours has ' + q.n + '. (The streak starts over.)'), 'bad');
      else setChalMsg(T('根的位置或重數不對：看虛線在哪裡碰到 x 軸、是穿過還是碰一下就回頭。（連續答對重新計算）', 'The roots or their multiplicities are off: see where the dashed graph meets the axis and whether it crosses or just touches. (The streak starts over.)'), 'bad');
      return;
    }
    const time = (performance.now() - chg.t0) / 1000;
    state.log.push({ round: chg.round, tex: M.factoredTex(tg.a, tg.roots, null), time: time, first: chg.tries === 1 });
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
    const chg = state.chal;
    if (!chg) return;
    state.log.push({ round: chg.round, tex: M.factoredTex(chg.target.a, chg.target.roots, null), time: null });
    state.chal = null; state.streak = [];
    $('lgTarget').hidden = true;
    $('submitC').hidden = true; $('quitChal').hidden = true;
    $('newChal').textContent = T('出一題', 'New challenge');
    setChalMsg(silent ? '' : T('這題放棄了，答案寫在下面的紀錄；連續答對重新計算。', 'Given up. The answer is in the record below; the streak starts over.'));
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
    let h = '<tr><th>' + T('題', '#') + '</th><th>f(x)</th><th>' + T('秒', 's') + '</th></tr>';
    state.log.slice(-8).reverse().forEach(function (r) {
      let tx = r.tex;
      if (window.katex) { try { tx = window.katex.renderToString(r.tex, { throwOnError: false }); } catch (e) { /* 保留原文 */ } }
      h += '<tr><td>' + r.round + '</td><td>' + tx + '</td><td>' + (r.time == null ? T('放棄', 'gave up') : r.time.toFixed(1) + (r.first ? '' : '*')) + '</td></tr>';
    });
    t.innerHTML = h;
  }

  // 給測試用的介面（不影響畫面）
  window.__poly = {
    state: state, QR: QR, QI: QI, QT: QT,
    startChal: function (c) { startChal(c); },
    seed: function (s) { rand = M.rng(s); },
    frame: function () { return F; },
    view: function () { return view(); }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  setSlider(el.rx, -1); setSlider(el.ra, 1); setSlider(el.qp, 0); setSlider(el.qq, 1);
  setSlider(el.il, 0); setSlider(el.ir, 1);
  setSlider(el.ta, 1); setSlider(el.tb, 1); setSlider(el.th, 0); setSlider(el.tk, 0);
  setSlider(el.yv, 10);
  state.quad = $('quadC').checked;
  document.querySelectorAll('.quad-only').forEach(function (e) { e.hidden = !state.quad; });
  state.iz = $('izC').checked;
  state.tg = $('tgC').checked;
  renderRootPick();
  renderSteps();
  renderLog();
  updateSoundButton();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    for (const id in eqKey) delete eqKey[id];
    renderLog(); renderSteps(); renderRootPick(); refreshOutputs(); updateReadouts(); updateSoundButton();
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
  lastSig = null; rootSound();
})();
