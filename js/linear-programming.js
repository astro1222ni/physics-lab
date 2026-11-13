/* linear-programming.js — 「線性規劃：可行域與目標函數」的畫面與互動（數學計算在 linear-programming-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 畫布：坐標平面上最多 4 條限制線（各自一種顏色，排除的那一側畫短斜線）、塗色的可行域、目標函數的等高線 z = k（橘色虛線）、
 *   z 變大的方向 (p, q)、頂點與 z 值、最佳頂點（或最佳的整條邊）、可選的格子點與最好的整數解、可以移動的點 P。
 * 操作：拖曳限制線平移它（改 c）、拖曳等高線改 k、拖曳或點一下平面移動 P（靠近頂點或格子點會吸附）；鍵盤 Enter 切換物件、方向鍵移動。
 * 「掃描」讓等高線沿 (p, q) 方向掃過可行域（求最小值時反方向），最後碰到的地方就是最佳解。
 * 挑戰「找出最佳頂點」：隨機出題、頂點的 z 值藏起來，把 P 放到你認為最好的頂點再送出。 */
(function () {
  'use strict';
  const M = window.LPCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha;
  const clampv = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  const r6 = function (v) { const w = Math.round(v * 1e6) / 1e6; return w === 0 ? 0 : w; };
  const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const CCOL = ['lp-c1', 'lp-c2', 'lp-c3', 'lp-c4'];

  // ---------- 例題 ----------
  const OFF = [{ a: 1, b: 0, c: 8, s: '<=' }, { a: 0, b: 1, c: 8, s: '<=' }, { a: 1, b: 1, c: 10, s: '<=' }, { a: 1, b: -1, c: 4, s: '<=' }];
  const PRESETS = {
    factory: M.PRESETS.factory,
    diet: M.PRESETS.diet,
    basic: M.PRESETS.basic,
    open: { cons: [{ a: 1, b: 2, c: 4, s: '>=' }, { a: 3, b: 1, c: 6, s: '>=' }], p: 1, q: 1, sense: 'min' }
  };
  const NOTES = {
    factory: ['工廠做桌子 x 張、椅子 y 張：木材 x + 2y ≤ 14、工時 3x + y ≤ 18、椅子最多 6 張；利潤 z = 3x + 2y（千元）越多越好。',
      'A workshop makes x tables and y chairs: wood x + 2y ≤ 14, hours 3x + y ≤ 18, at most 6 chairs; the profit z = 3x + 2y (thousand dollars) should be as large as possible.'],
    diet: ['兩種飼料各買 x、y 包：蛋白質 2x + y ≥ 8、脂肪 x + 3y ≥ 9、倉庫最多放 10 包；成本 z = 4x + 5y 越少越好。',
      'Buy x bags of one feed and y of another: protein 2x + y ≥ 8, fat x + 3y ≥ 9, room for at most 10 bags; the cost z = 4x + 5y should be as small as possible.'],
    basic: ['x + y ≤ 5、x − y ≤ 3、y ≤ 4，x、y 都不是負的，求 z = 2x + y 的最大值。',
      'x + y ≤ 5, x − y ≤ 3, y ≤ 4, with x and y not negative: find the largest value of z = 2x + y.'],
    open: ['x + 2y ≥ 4、3x + y ≥ 6：可行域往右上方無限延伸。z = x + y 有最小值；改成求最大值看看。',
      'x + 2y ≥ 4, 3x + y ≥ 6: the region runs off to the upper right for ever. z = x + y has a smallest value; now try asking for the largest.']
  };

  // ---------- 狀態 ----------
  const state = {
    cons: [], sel: 0, nonneg: true, p: 3, q: 2, sense: 'max', k: 6,
    showZ: true, showDir: true, showInt: false,
    P: { x: 1, y: 1 }, log: [], preset: 'factory',
    chal: null, streak: 0, times: [], round: 0, answered: false,
    drag: null, sweep: null
  };
  let rand = function () { return Math.random(); };
  let applying = false;

  // ---------- 色彩與字 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'lp-c1', 'lp-c2', 'lp-c3', 'lp-c4', 'lp-region', 'lp-level', 'lp-best', 'lp-int', 'lp-ok', 'lp-bad']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + px + 'px ' + FONT; }

  // ---------- 數字與式子 ----------
  function fmt(v, d) {
    if (v == null || isNaN(v)) return '—';
    if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
    let s = (Math.round(v * 1e9) / 1e9).toFixed(d == null ? 3 : d);
    if (s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, '');
    if (s === '-0') s = '0';
    return s.replace('-', '−');
  }
  function pt(x, y) { return '(' + fmt(x) + ', ' + fmt(y) + ')'; }
  /** a x + b y（係數 1 省略、0 不寫）；tex 為 true 時給 KaTeX */
  function lin(a, b, tex) {
    const terms = [];
    [[a, 'x'], [b, 'y']].forEach(function (t) {
      const v = r6(t[0]);
      if (v === 0) return;
      const mag = Math.abs(v), sign = v < 0 ? '−' : '+';
      const body = (mag === 1 ? '' : fmt(mag)) + t[1];
      if (!terms.length) terms.push((v < 0 ? '−' : '') + body);
      else terms.push(' ' + sign + ' ' + body);
    });
    let s = terms.length ? terms.join('') : '0';
    if (tex) s = s.replace(/−/g, '-');
    return s;
  }
  function conText(c, tex) {
    const rel = c.s === '>=' ? (tex ? ' \\ge ' : ' ≥ ') : (tex ? ' \\le ' : ' ≤ ');
    const rhs = fmt(c.c);
    return lin(c.a, c.b, tex) + rel + (tex ? rhs.replace(/−/g, '-') : rhs);
  }
  function objText(tex) { return 'z = ' + lin(state.p, state.q, tex); }

  // ---------- 計算（快取） ----------
  let cache = null;
  function opts() { return { nonneg: state.nonneg }; }
  function activeCons() { return state.cons.filter(function (c) { return c.on; }); }
  function key() { return JSON.stringify([state.cons, state.nonneg, state.p, state.q, state.sense]); }
  function Q() {
    const k = key();
    if (cache && cache.key === k) return cache;
    cache = M.analyze(activeCons(), state.p, state.q, state.sense, opts());
    cache.key = k;
    return cache;
  }
  function zAt(x, y) { return state.p * x + state.q * y; }

  // ---------- 畫布與版面 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 520, PR = null;
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    ch = cw < 640 ? Math.round(clampv(cw * 1.08, 340, 560)) : 520;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    PR = { x: 6, y: 6, w: cw - 12, h: ch - 12 };
    viewCur = null;
    requestDraw();
  }
  let rafId = 0;
  function requestDraw() { if (!rafId) rafId = requestAnimationFrame(function () { rafId = 0; draw(); }); }

  // ---------- 視野（等比例，跟著內容調整，拖曳時固定） ----------
  let viewCur = null, viewTween = null;
  function contentBox() {
    // 有界：只框可行域的頂點（加上 P），可行域填滿畫面；無界或空集合：再加上各條線和軸的交點
    const q = Q(), pts = [];
    const tight = !q.R.empty && q.R.bounded && !q.R.degenerate;
    if (!q.R.empty) q.R.vertices.forEach(function (v) { if (Math.abs(v[0]) < 60 && Math.abs(v[1]) < 60) pts.push(v); });
    if (!tight) {
      pts.push([0, 0]);
      activeCons().forEach(function (c) {
        if (Math.abs(c.a) > 1e-9) { const x = c.c / c.a; if (Math.abs(x) <= 30) pts.push([x, 0]); }
        if (Math.abs(c.b) > 1e-9) { const y = c.c / c.b; if (Math.abs(y) <= 30) pts.push([0, y]); }
      });
    }
    if (state.chal == null && Math.abs(state.P.x) < 60 && Math.abs(state.P.y) < 60) pts.push([state.P.x, state.P.y]);
    if (!pts.length) pts.push([0, 0]);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    pts.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    if (q.R.bounded === false && !q.R.empty) { x1 += 3; y1 += 3; }
    const span = Math.max(x1 - x0, y1 - y0, tight ? 3 : 6);
    const pad = Math.max((tight ? 0.2 : 0.12) * span, 1);
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
  function targetView() { return fitView(contentBox()); }
  function updateView(now) {
    if (state.drag || state.sweep) return viewCur;
    const tv = targetView();
    if (!viewCur || reduceMotion.matches) { viewCur = tv; viewTween = null; return viewCur; }
    const same = Math.abs(tv.x0 - viewCur.x0) < 1e-6 && Math.abs(tv.y0 - viewCur.y0) < 1e-6 && Math.abs(tv.s - viewCur.s) < 1e-6;
    if (same) { viewTween = null; return viewCur; }
    if (!viewTween || viewTween.to.x0 !== tv.x0 || viewTween.to.y0 !== tv.y0 || viewTween.to.s !== tv.s) viewTween = { from: viewCur, to: tv, t0: now };
    const u = clampv((now - viewTween.t0) / 220, 0, 1), e = 1 - Math.pow(1 - u, 3);
    viewCur = { x0: viewTween.from.x0 + (tv.x0 - viewTween.from.x0) * e, y0: viewTween.from.y0 + (tv.y0 - viewTween.from.y0) * e, s: viewTween.from.s * Math.pow(tv.s / viewTween.from.s, e) };
    if (u >= 1) { viewCur = tv; viewTween = null; }
    else requestDraw();
    return viewCur;
  }
  function X(x) { return PR.x + (x - viewCur.x0) * viewCur.s; }
  function Y(y) { return PR.y + PR.h - (y - viewCur.y0) * viewCur.s; }
  function invX(px) { return viewCur.x0 + (px - PR.x) / viewCur.s; }
  function invY(py) { return viewCur.y0 + (PR.y + PR.h - py) / viewCur.s; }
  function viewBox(m) { const e = m || 0; return [invX(PR.x) - e, invX(PR.x + PR.w) + e, invY(PR.y + PR.h) - e, invY(PR.y) + e]; }

  function niceStep(span) {
    if (!(span > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(span)));
    const m = span / e;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e;
  }

  // ---------- 畫 ----------
  function draw() {
    const now = performance.now();
    if (!PR) return;
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, cw, ch);
    updateView(now);
    const q = Q(), R = q.R, opt = q.opt, hide = !!(state.chal && !state.answered);
    const b = PR, vb = viewBox(), vbBig = viewBox((vb[1] - vb[0]) * 0.6);
    // 面板
    D.roundRect(c, b.x, b.y, b.w, b.h, 8);
    c.fillStyle = alpha(C.text, D.dark ? 0.03 : 0.022); c.fill();
    c.save();
    D.roundRect(c, b.x, b.y, b.w, b.h, 8); c.clip();
    // 格線
    const st = niceStep(70 / viewCur.s), minor = st / 5;
    const snap = function (v) { return (Math.round(v * dpr) + 0.5) / dpr; };
    c.lineWidth = 1;
    if (minor * viewCur.s >= 9) {
      c.strokeStyle = alpha(C.text, D.dark ? 0.035 : 0.04);
      c.beginPath();
      for (let g = Math.ceil(vb[0] / minor) * minor; g <= vb[1]; g += minor) { c.moveTo(snap(X(g)), b.y); c.lineTo(snap(X(g)), b.y + b.h); }
      for (let g = Math.ceil(vb[2] / minor) * minor; g <= vb[3]; g += minor) { c.moveTo(b.x, snap(Y(g))); c.lineTo(b.x + b.w, snap(Y(g))); }
      c.stroke();
    }
    c.strokeStyle = alpha(C.text, D.dark ? 0.09 : 0.1);
    c.beginPath();
    for (let g = Math.ceil(vb[0] / st) * st; g <= vb[1]; g += st) { c.moveTo(snap(X(g)), b.y); c.lineTo(snap(X(g)), b.y + b.h); }
    for (let g = Math.ceil(vb[2] / st) * st; g <= vb[3]; g += st) { c.moveTo(b.x, snap(Y(g))); c.lineTo(b.x + b.w, snap(Y(g))); }
    c.stroke();
    // 可行域
    const poly = R.empty ? [] : M.clipBox(activeCons(), vbBig, opts());
    if (poly.length >= 3) {
      c.beginPath();
      poly.forEach(function (v, i) { if (i) c.lineTo(X(v[0]), Y(v[1])); else c.moveTo(X(v[0]), Y(v[1])); });
      c.closePath();
      const cy0 = poly.reduce(function (m, v) { return Math.min(m, Y(v[1])); }, Infinity), cy1 = poly.reduce(function (m, v) { return Math.max(m, Y(v[1])); }, -Infinity);
      const g = c.createLinearGradient(0, cy0, 0, cy1);
      g.addColorStop(0, alpha(C['lp-region'], D.dark ? 0.3 : 0.24));
      g.addColorStop(1, alpha(C['lp-region'], D.dark ? 0.16 : 0.13));
      c.fillStyle = g; c.fill();
      c.lineJoin = 'round';
      c.strokeStyle = alpha(C['lp-region'], 0.85); c.lineWidth = 2.2; c.stroke();
      if (!R.bounded) {
        // 無界的方向：邊緣淡出
        D.pill(c, T('可行域往這邊無限延伸', 'The region goes on for ever this way'), b.x + b.w - 10, b.y + 30, C['lp-region'], 'right', fnt(11.5, 700));
      }
    } else if (!R.empty && R.degenerate) {
      // 面積 0：一點或一條線段
      c.strokeStyle = C['lp-region']; c.lineWidth = 5; c.lineCap = 'round';
      const vs = R.vertices;
      if (vs.length >= 2) { c.beginPath(); c.moveTo(X(vs[0][0]), Y(vs[0][1])); c.lineTo(X(vs[1][0]), Y(vs[1][1])); c.stroke(); }
    }
    // 座標軸
    c.strokeStyle = alpha(C.text, 0.5); c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(b.x, snap(Y(0))); c.lineTo(b.x + b.w, snap(Y(0))); c.moveTo(snap(X(0)), b.y); c.lineTo(snap(X(0)), b.y + b.h); c.stroke();
    c.font = fnt(10.5); c.fillStyle = alpha(C.muted, 0.95);
    const yAx = clampv(Y(0), b.y + 12, b.y + b.h - 4), xAx = clampv(X(0), b.x + 4, b.x + b.w - 24);
    for (let g = Math.ceil(vb[0] / st) * st; g <= vb[1]; g += st) {
      if (Math.abs(g) < 1e-9) continue;
      c.textAlign = 'center'; c.textBaseline = 'top'; D.haloText(c, fmt(r6(g)), X(g), Math.min(yAx + 3, b.y + b.h - 14), C.muted, 'center', 'top', fnt(10.5));
    }
    for (let g = Math.ceil(vb[2] / st) * st; g <= vb[3]; g += st) {
      if (Math.abs(g) < 1e-9) continue;
      D.haloText(c, fmt(r6(g)), xAx + 4, Y(g), C.muted, 'left', 'middle', fnt(10.5));
    }
    D.haloText(c, 'x', b.x + b.w - 10, yAx - 8, C.text, 'right', 'bottom', fnt(13, 'italic 600'));
    D.haloText(c, 'y', xAx + 8, b.y + 14, C.text, 'left', 'middle', fnt(13, 'italic 600'));
    D.haloText(c, 'O', X(0) - 4, Y(0) + 4, C.muted, 'right', 'top', fnt(11, 'italic'));
    // 限制線、排除那一側的短斜線
    const labels = [];
    state.cons.forEach(function (con, i) {
      if (!con.on) return;
      const n = M.norm(con);
      if (Math.abs(n.a) < 1e-12 && Math.abs(n.b) < 1e-12) return;
      const seg = M.clipLine(n.a, n.b, n.c, vb);
      if (!seg) return;
      const col = C[CCOL[i]], sel = i === state.sel && !state.chal;
      const x0 = X(seg[0][0]), y0 = Y(seg[0][1]), x1 = X(seg[1][0]), y1 = Y(seg[1][1]);
      const L = Math.hypot(x1 - x0, y1 - y0);
      // 排除的一側：(a, b) 方向（螢幕 y 反向）
      const nn = Math.hypot(n.a, n.b), ux = n.a / nn, uy = -n.b / nn;
      c.strokeStyle = alpha(col, 0.42); c.lineWidth = 1.3; c.lineCap = 'round';
      c.beginPath();
      for (let s = 7; s < L; s += 11) {
        const px = x0 + (x1 - x0) * s / L, py = y0 + (y1 - y0) * s / L;
        c.moveTo(px + ux * 1.5, py + uy * 1.5); c.lineTo(px + ux * 7 + (x1 - x0) / L * 3.5, py + uy * 7 + (y1 - y0) / L * 3.5);
      }
      c.stroke();
      if (sel) { c.strokeStyle = alpha(col, 0.22); c.lineWidth = 9; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
      c.strokeStyle = col; c.lineWidth = sel ? 2.8 : 2.1;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      labels.push({ i: i, col: col, seg: [[x0, y0], [x1, y1]], text: conText(con) });
    });
    // 格子點
    if (state.showInt && R.bounded && !R.empty) {
      const lat = M.lattice(activeCons(), vb, opts(), 4000);
      if (viewCur.s >= 9) {
        c.fillStyle = alpha(C['lp-int'], 0.75);
        lat.forEach(function (v) { c.beginPath(); c.arc(X(v[0]), Y(v[1]), viewCur.s >= 22 ? 2.6 : 1.8, 0, Math.PI * 2); c.fill(); });
      }
      if (!hide) q.ip.pts.forEach(function (v) {
        c.strokeStyle = C['lp-int']; c.lineWidth = 2.2;
        c.beginPath(); c.arc(X(v[0]), Y(v[1]), 7, 0, Math.PI * 2); c.stroke();
      });
    }
    // 等高線 z = k
    const pq = Math.hypot(state.p, state.q);
    let rel = 'miss';
    if (pq > 1e-9) {
      rel = M.levelRelation(activeCons(), state.p, state.q, state.k, opts());
      const seg = M.levelSegment(state.p, state.q, state.k, vb);
      if (seg) {
        const x0 = X(seg[0][0]), y0 = Y(seg[0][1]), x1 = X(seg[1][0]), y1 = Y(seg[1][1]);
        if (rel === 'touch') { c.strokeStyle = alpha(C['lp-level'], 0.25); c.lineWidth = 10; c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
        c.strokeStyle = rel === 'miss' ? alpha(C['lp-level'], 0.6) : C['lp-level']; c.lineWidth = 2.6; c.setLineDash([9, 6]);
        c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.setLineDash([]);
        labels.push({ i: -1, col: C['lp-level'], seg: [[x0, y0], [x1, y1]], text: 'z = ' + fmt(state.k, 2), level: true });
      }
    }
    // 最佳的整條邊
    if (!hide && opt.status === 'edge' && opt.best.length >= 2) {
      const a0 = opt.best[0], a1 = opt.best[opt.best.length - 1];
      c.strokeStyle = alpha(C['lp-best'], 0.85); c.lineWidth = 5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(X(a0.x), Y(a0.y)); c.lineTo(X(a1.x), Y(a1.y)); c.stroke();
    }
    // 頂點
    const verts = R.empty ? [] : R.vertices;
    let gx = 0, gy = 0;
    verts.forEach(function (v) { gx += v[0]; gy += v[1]; });
    if (verts.length) { gx /= verts.length; gy /= verts.length; }
    verts.forEach(function (v) {
      const isBest = !hide && (opt.status === 'unique' || opt.status === 'edge') && opt.best.some(function (w) { return Math.abs(w.x - v[0]) < 1e-9 && Math.abs(w.y - v[1]) < 1e-9; });
      if (isBest) D.ball(c, X(v[0]), Y(v[1]), 7, C['lp-best'], { glow: 0.4 });
      else {
        c.fillStyle = C['canvas-bg']; c.strokeStyle = alpha(C.text, 0.75); c.lineWidth = 2;
        c.beginPath(); c.arc(X(v[0]), Y(v[1]), 4.5, 0, Math.PI * 2); c.fill(); c.stroke();
      }
    });
    // (p, q) 方向
    if (state.showDir && pq > 1e-9) {
      const bx = verts.length && R.bounded ? X(gx) : b.x + b.w * 0.5, by = verts.length && R.bounded ? Y(gy) : b.y + b.h * 0.5;
      const Lp = 54, ex = bx + state.p / pq * Lp, ey = by - state.q / pq * Lp;
      D.arrow(c, bx, by, ex, ey, C['lp-level'], 2.6);
      const sg = state.sense === 'min' ? T('z 變大（求最小時往反方向）', 'z grows (go the other way for the minimum)') : T('z 變大', 'z grows');
      D.pill(c, '(' + fmt(state.p) + ', ' + fmt(state.q) + ')  ' + sg, ex + (state.p >= 0 ? 6 : -6), ey + (state.q >= 0 ? -4 : 20), C['lp-level'], state.p >= 0 ? 'left' : 'right', fnt(11, 700));
    }
    // 頂點的 z 值（標籤彼此避開，也避開點 P 與頂點本身）
    const boxes = [];
    const Ppx = X(state.P.x), Ppy = Y(state.P.y);
    c.font = fnt(12, 700);
    const pW = c.measureText('P').width + 12;
    boxes.push({ x: Ppx - 13, y: Ppy - 13, w: 26, h: 26 }, { x: Ppx + 12, y: Ppy - 28, w: pW, h: 18 });
    verts.forEach(function (v) { boxes.push({ x: X(v[0]) - 7, y: Y(v[1]) - 7, w: 14, h: 14 }); });
    const overlaps = function (bx, by, w, h) {
      return bx < b.x + 2 || by < b.y + 2 || bx + w > b.x + b.w - 2 || by + h > b.y + b.h - 2 ||
        boxes.some(function (o) { return bx < o.x + o.w && bx + w > o.x && by < o.y + o.h && by + h > o.y; });
    };
    if (state.showZ && !hide) {
      verts.forEach(function (v) {
        let dx = X(v[0]) - X(gx), dy = Y(v[1]) - Y(gy);
        const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
        if (verts.length === 1) { dx = 0.7; dy = -0.7; }
        const isBest = (opt.status === 'unique' || opt.status === 'edge') && opt.best.some(function (w) { return Math.abs(w.x - v[0]) < 1e-9 && Math.abs(w.y - v[1]) < 1e-9; });
        const txt = (verts.length <= 6 ? pt(v[0], v[1]) + ' ' : '') + 'z = ' + fmt(zAt(v[0], v[1]), 2);
        const font = fnt(11, isBest ? 700 : 600);
        c.font = font;
        const w = c.measureText(txt).width + 12, h = 18;
        const vx = X(v[0]), vy = Y(v[1]);
        let chosen = null;
        const angs = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, Math.PI];
        for (let r = 0; r < 3 && !chosen; r++) {
          for (let k = 0; k < angs.length; k++) {
            const ca = Math.cos(angs[k]), sa = Math.sin(angs[k]);
            const ux = dx * ca - dy * sa, uy = dx * sa + dy * ca, dist0 = 12 + r * 14;
            // 標籤框的錨點：沿方向 u 離頂點 dist0，框依方向往外長
            const ax = vx + ux * dist0, ay = vy + uy * dist0;
            const bx = ux >= 0.3 ? ax : ux <= -0.3 ? ax - w : ax - w / 2;
            const by = uy >= 0.3 ? ay : uy <= -0.3 ? ay - h : ay - h / 2;
            if (!overlaps(bx, by, w, h)) { chosen = { x: bx, y: by }; break; }
          }
        }
        if (!chosen) {
          const bx = dx >= 0 ? vx + 12 : vx - 12 - w, by = dy >= 0 ? vy + 8 : vy - 8 - h;
          chosen = { x: clampv(bx, b.x + 4, b.x + b.w - w - 4), y: clampv(by, b.y + 4, b.y + b.h - h - 4) };
        }
        boxes.push(D.pill(c, txt, chosen.x + w / 2, chosen.y + h, isBest ? C['lp-best'] : C.text, 'center', font));
      });
    }
    // 限制線與等高線的標籤（放在線上靠近視野邊的地方，避開其他標籤）
    labels.forEach(function (lb) {
      const s = lb.seg, cands = [0.82, 0.18, 0.62, 0.38, 0.5];
      c.font = fnt(11.5, 700);
      const w = c.measureText(lb.text).width + 12, h = 18;
      for (let t = 0; t < cands.length; t++) {
        const px = s[0][0] + (s[1][0] - s[0][0]) * cands[t], py = s[0][1] + (s[1][1] - s[0][1]) * cands[t];
        const bx = clampv(px - w / 2, b.x + 4, b.x + b.w - w - 4), by = clampv(py - h - 4, b.y + 4, b.y + b.h - h - 22);
        const hit = boxes.some(function (o) { return bx < o.x + o.w && bx + w > o.x && by < o.y + o.h && by + h > o.y; });
        if (!hit || t === cands.length - 1) { boxes.push(D.pill(c, lb.text, bx + w / 2, by + h, lb.col, 'center', fnt(11.5, 700))); break; }
      }
    });
    // 點 P
    const Pf = M.feasible(activeCons(), state.P.x, state.P.y, opts(), 1e-9);
    const px = X(state.P.x), py = Y(state.P.y);
    c.strokeStyle = Pf ? C['lp-ok'] : C['lp-bad']; c.lineWidth = 2;
    c.beginPath(); c.arc(px, py, 11.5, 0, Math.PI * 2); c.stroke();
    D.ball(c, px, py, 7, C.accent, { glow: state.drag && state.drag.kind === 'P' ? 0.6 : 0.35 });
    D.pill(c, 'P', px + 12, py - 10, C.accent, 'left', fnt(12, 700));
    // 記下的點
    state.log.forEach(function (r, i) {
      c.fillStyle = r.ok ? alpha(C['lp-ok'], 0.85) : alpha(C['lp-bad'], 0.85);
      c.beginPath(); c.arc(X(r.x), Y(r.y), 3.2, 0, Math.PI * 2); c.fill();
      if (state.log.length <= 8) D.haloText(c, String(i + 1), X(r.x) + 5, Y(r.y) - 5, r.ok ? C['lp-ok'] : C['lp-bad'], 'left', 'bottom', fnt(10, 700));
    });
    c.restore();
    // 上方的狀態
    let msg = null, mcol = C.text;
    if (state.sweep) { msg = T('掃描中：z = ', 'Sweeping: z = ') + fmt(state.k, 2); mcol = C['lp-level']; }
    else if (R.empty) { msg = T('沒有可行解：可行域是空的', 'No feasible point: the region is empty'); mcol = C['lp-bad']; }
    else if (hide) { msg = T('挑戰：哪一個頂點最好？', 'Challenge: which corner is best?'); mcol = C.accent; }
    else if (opt.status === 'unbounded') { msg = state.sense === 'max' ? T('z 沒有最大值', 'z has no largest value') : T('z 沒有最小值', 'z has no smallest value'); mcol = C['lp-bad']; }
    else if (opt.status === 'edge') { msg = T('整條邊都是最佳解', 'A whole edge is best'); mcol = C['lp-best']; }
    if (msg) D.pill(c, msg, b.x + b.w / 2, b.y + 28, mcol, 'center', fnt(12.5, 700));
    D.pill(c, T('格線間距 ', 'Grid spacing ') + fmt(st) + T(' 單位', ' unit' + (st === 1 ? '' : 's')), b.x + 8, b.y + b.h - 6, C.muted, 'left', fnt(10.5, 600));
    // 鍵盤焦點
    if (kb && kb.focused()) {
      c.strokeStyle = C.accent; c.lineWidth = 1.5; c.setLineDash([5, 4]);
      D.roundRect(c, b.x + 2, b.y + 2, b.w - 4, b.h - 4, 7); c.stroke(); c.setLineDash([]);
    }
    if (sweepFlash && now - sweepFlash.t < 400) {
      const u = (now - sweepFlash.t) / 400;
      c.strokeStyle = alpha(C['lp-level'], 0.6 * (1 - u)); c.lineWidth = 3;
      c.beginPath(); c.arc(X(sweepFlash.x), Y(sweepFlash.y), 8 + 22 * u, 0, Math.PI * 2); c.stroke();
      requestDraw();
    }
  }
  let sweepFlash = null;

  // ---------- 讀數 ----------
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  let eqKey = null;
  function updateReadouts() {
    const q = Q(), R = q.R, opt = q.opt, hide = !!(state.chal && !state.answered);
    let reg;
    if (R.empty) reg = T('空集合（沒有可行解）', 'empty (no feasible point)');
    else if (R.degenerate) reg = R.vertices.length === 1 ? T('只有一點', 'a single point') : T('一條線段', 'a segment');
    else if (!R.bounded) reg = T('無界', 'unbounded');
    else reg = T('有界的 ', 'bounded, ') + R.vertices.length + T(' 邊形', '-gon');
    setHTML('rRegion', reg);
    setHTML('rVerts', R.empty ? '—' : R.vertices.length > 6 ? String(R.vertices.length) : R.vertices.map(function (v) { return pt(v[0], v[1]); }).join(T('、', ', ')));
    setHTML('rArea', R.empty ? '—' : !R.bounded ? '∞' : fmt(R.area, 3));
    setHTML('rBestL', state.sense === 'max' ? T('最大值', 'Largest value') : T('最小值', 'Smallest value'));
    let best = '—', where = '—';
    if (hide) { best = T('（挑戰中）', '(hidden)'); where = best; }
    else if (opt.status === 'empty') best = T('沒有（無解）', 'none (no feasible point)');
    else if (opt.status === 'unbounded') best = T('沒有（無界）', 'none (unbounded)');
    else if (opt.status === 'all') { best = '0'; where = T('每一點都一樣', 'every point'); }
    else {
      best = fmt(opt.z, 3);
      where = opt.status === 'edge' ? (opt.best.length >= 2 ? T('整條邊 ', 'the whole edge ') + pt(opt.best[0].x, opt.best[0].y) + '–' + pt(opt.best[opt.best.length - 1].x, opt.best[opt.best.length - 1].y) : T('一整條射線', 'a whole ray')) : pt(opt.x, opt.y);
    }
    setHTML('rBest', best); setHTML('rWhere', where);
    document.querySelectorAll('.ri').forEach(function (e) { e.hidden = !state.showInt; });
    $('lgInt').hidden = !state.showInt;
    if (state.showInt) {
      const ip = q.ip;
      setHTML('rInt', hide ? T('（挑戰中）', '(hidden)') : ip.status === 'ok' ? ip.pts.map(function (v) { return pt(v[0], v[1]); }).join(T('、', ', ')) + T('，z = ', ', z = ') + fmt(ip.z, 3) : ip.status === 'unbounded' ? T('可行域無界，不列', 'region unbounded, not listed') : T('沒有', 'none'));
    }
    const ok = M.feasible(activeCons(), state.P.x, state.P.y, opts(), 1e-9);
    setHTML('rP', pt(state.P.x, state.P.y) + (ok ? T('，可行', ', feasible') : T('，不可行', ', not feasible')));
    setHTML('rPz', fmt(zAt(state.P.x, state.P.y), 3));
    // 方程組
    const k2 = key() + '|' + (window.LabSettings ? LabSettings.get('lang') : '');
    if (eqKey !== k2) {
      eqKey = k2;
      const rows = activeCons().map(function (c) { return conText(c, true); });
      if (state.nonneg) rows.push('x \\ge 0,\\ y \\ge 0');
      const tex = (state.sense === 'max' ? '\\max\\ ' : '\\min\\ ') + objText(true) + (rows.length ? ',\\quad \\begin{cases} ' + rows.join(' \\\\ ') + ' \\end{cases}' : '');
      const el = $('rEq');
      if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); } catch (e) { el.textContent = tex; } }
      else el.textContent = tex;
    }
  }

  // ---------- 限制式清單 ----------
  function renderCons() {
    const box = $('cons');
    if (!box.children.length) {
      state.cons.forEach(function (con, i) {
        const row = document.createElement('div');
        row.className = 'con';
        row.innerHTML = '<label class="on"><input type="checkbox"><span class="sr-only"></span></label><button type="button" class="pick"></button>';
        row.querySelector('.pick').style.setProperty('--cc', 'var(--' + CCOL[i] + ')');
        row.querySelector('input').addEventListener('change', function (ev) {
          state.cons[i].on = ev.target.checked;
          if (ev.target.checked) { state.sel = i; syncEditor(); }
          edited('toggle');
        });
        row.querySelector('.pick').addEventListener('click', function () { state.sel = i; syncEditor(); renderCons(); requestDraw(); });
        box.appendChild(row);
      });
    }
    state.cons.forEach(function (con, i) {
      const row = box.children[i];
      row.classList.toggle('off', !con.on);
      const cb = row.querySelector('input');
      cb.checked = con.on;
      row.querySelector('.sr-only').textContent = T('使用第 ' + (i + 1) + ' 條限制式', 'Use constraint ' + (i + 1));
      const pick = row.querySelector('.pick');
      pick.textContent = conText(con);
      pick.setAttribute('aria-pressed', String(i === state.sel));
      pick.setAttribute('aria-label', T('修改第 ' + (i + 1) + ' 條：', 'Edit constraint ' + (i + 1) + ': ') + conText(con));
    });
  }
  const el = { ca: $('ca'), cb: $('cb'), cc: $('cc'), pp: $('pp'), qq: $('qq'), kk: $('kk') };
  function setSlider(e, v) { applying = true; if (window.LabNum) window.LabNum.set(e, v); else e.value = v; applying = false; }
  function syncEditor() {
    const con = state.cons[state.sel];
    setSlider(el.ca, con.a); setSlider(el.cb, con.b); setSlider(el.cc, con.c);
    $('sLe').setAttribute('aria-pressed', String(con.s !== '>=')); $('sGe').setAttribute('aria-pressed', String(con.s === '>='));
    refreshOutputs();
  }
  function kRange() {
    // k 的滑桿範圍：涵蓋目前視野四角的 z 值（取整到 5 的倍數）
    const b = viewCur ? viewBox() : contentBox();
    const zs = [zAt(b[0], b[2]), zAt(b[0], b[3]), zAt(b[1], b[2]), zAt(b[1], b[3])];
    let lo = Math.floor(Math.min.apply(null, zs) / 5) * 5, hi = Math.ceil(Math.max.apply(null, zs) / 5) * 5;
    if (hi - lo < 10) { lo -= 5; hi += 5; }
    return [Math.max(lo, -500), Math.min(hi, 500)];
  }
  function syncK() {
    const r = kRange();
    el.kk.min = String(Math.min(r[0], Math.floor(state.k))); el.kk.max = String(Math.max(r[1], Math.ceil(state.k)));
    setSlider(el.kk, state.k);
  }
  function syncAll() {
    syncEditor();
    setSlider(el.pp, state.p); setSlider(el.qq, state.q); syncK();
    $('tMax').setAttribute('aria-pressed', String(state.sense === 'max')); $('tMin').setAttribute('aria-pressed', String(state.sense === 'min'));
    $('nonneg').checked = state.nonneg;
    $('showZ').checked = state.showZ; $('showDir').checked = state.showDir; $('showInt').checked = state.showInt;
    renderCons(); refreshOutputs();
  }
  function refreshOutputs() {
    const con = state.cons[state.sel];
    $('cao').textContent = fmt(con.a); $('cbo').textContent = fmt(con.b); $('cco').textContent = fmt(con.c);
    $('ppo').textContent = fmt(state.p); $('qqo').textContent = fmt(state.q); $('kko').textContent = fmt(state.k, 2);
  }
  function refresh() { refreshOutputs(); renderCons(); updateReadouts(); requestDraw(); }

  // ---------- 改了設定 ----------
  /** 限制式、目標函數、x ≥ 0 改了之後（放開滑桿、打完數字、拖完、按鍵、按鈕）：挑戰中就結束挑戰，回報任務 */
  const MODNOTE = ['限制式改過了，上面的例題說明不再適用；可以再按一次例題回到原題。', 'The constraints have changed, so the example’s description no longer applies; press the example again to go back.'];
  function markModified() {
    // 限制式（或 x、y ≥ 0）改過了：例題按鈕不再標示、說明換成提醒
    if (!state.preset) return;
    const P = PRESETS[state.preset];
    const cur = JSON.stringify(state.cons.filter(function (c) { return c.on; }).map(function (c) { return [c.a, c.b, c.c, c.s]; }));
    const ori = JSON.stringify(P.cons.map(function (c) { return [c.a, c.b, c.c, c.s]; }));
    if (cur === ori && state.nonneg) return;
    state.preset = null;
    document.querySelectorAll('#presets button').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
    $('presetNote').textContent = T(MODNOTE[0], MODNOTE[1]);
  }
  function edited(src) {
    if (state.chal && src !== 'chal') quitChal(true);
    if (src !== 'preset') markModified();
    stopSweep();
    cache = null;
    refresh();
    syncK();
    emitSetup(src);
  }
  ['ca', 'cb', 'cc'].forEach(function (k) {
    el[k].addEventListener('input', function () {
      if (applying) return;
      const con = state.cons[state.sel], v = r6(val(el[k]));
      if (k === 'ca') con.a = v; else if (k === 'cb') con.b = v; else con.c = v;
      if (!con.on) con.on = true;
      cache = null; stopSweep(); refresh();
    });
    el[k].addEventListener('change', function () {
      if (applying) return;
      const con = state.cons[state.sel], v = r6(val(el[k]));
      if (k === 'ca') con.a = v; else if (k === 'cb') con.b = v; else con.c = v;
      con.on = true;
      edited('slider');
    });
  });
  ['pp', 'qq'].forEach(function (k) {
    el[k].addEventListener('input', function () {
      if (applying) return;
      if (k === 'pp') state.p = r6(val(el[k])); else state.q = r6(val(el[k]));
      cache = null; stopSweep(); refresh();
    });
    el[k].addEventListener('change', function () {
      if (applying) return;
      if (k === 'pp') state.p = r6(val(el[k])); else state.q = r6(val(el[k]));
      edited('slider');
    });
  });
  el.kk.addEventListener('input', function () { if (applying) return; stopSweep(); state.k = r6(val(el.kk)); refreshOutputs(); requestDraw(); });
  el.kk.addEventListener('change', function () { if (applying) return; state.k = r6(val(el.kk)); refreshOutputs(); requestDraw(); levelTone(); emitLevel('slider'); });
  function setSign(s) {
    const con = state.cons[state.sel];
    if (con.s === s && con.on) return;
    con.s = s; con.on = true;
    $('sLe').setAttribute('aria-pressed', String(s !== '>=')); $('sGe').setAttribute('aria-pressed', String(s === '>='));
    edited('sign'); blip(s === '>=' ? 523 : 440);
  }
  $('sLe').addEventListener('click', function () { setSign('<='); });
  $('sGe').addEventListener('click', function () { setSign('>='); });
  function setSense(s) {
    if (state.sense === s) return;
    state.sense = s;
    $('tMax').setAttribute('aria-pressed', String(s === 'max')); $('tMin').setAttribute('aria-pressed', String(s === 'min'));
    if (state.chal && !state.answered) { cache = null; refresh(); return; }
    edited('sense'); blip(s === 'max' ? 587 : 392);
  }
  $('tMax').addEventListener('click', function () { setSense('max'); });
  $('tMin').addEventListener('click', function () { setSense('min'); });
  $('nonneg').addEventListener('change', function () { state.nonneg = $('nonneg').checked; edited('nonneg'); });
  $('showZ').addEventListener('change', function () { state.showZ = $('showZ').checked; requestDraw(); });
  $('showDir').addEventListener('change', function () { state.showDir = $('showDir').checked; requestDraw(); });
  $('showInt').addEventListener('change', function () { state.showInt = $('showInt').checked; updateReadouts(); requestDraw(); });

  function loadPreset(name, quiet) {
    const P = PRESETS[name];
    state.preset = name;
    state.cons = [0, 1, 2, 3].map(function (i) {
      const c = P.cons[i];
      return c ? { a: c.a, b: c.b, c: c.c, s: c.s, on: true } : { a: OFF[i].a, b: OFF[i].b, c: OFF[i].c, s: OFF[i].s, on: false };
    });
    state.p = P.p; state.q = P.q; state.sense = P.sense; state.nonneg = true; state.sel = 0;
    cache = null;
    const o = Q().opt;
    // 等高線先放在可行域裡「中間」的高度，留給學生自己推
    const zs = Q().R.vertices.map(function (v) { return zAt(v[0], v[1]); });
    state.k = zs.length ? r6(Math.round((Math.min.apply(null, zs) * 0.7 + (isFinite(o.z) ? o.z : Math.max.apply(null, zs)) * 0.3) * 2) / 2) : 0;
    $('presetNote').textContent = T(NOTES[name][0], NOTES[name][1]);
    document.querySelectorAll('#presets button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-preset') === name)); });
    viewCur = null;
    syncAll();
    if (!quiet) edited('preset');
    else { cache = null; refresh(); }
  }
  document.querySelectorAll('#presets button').forEach(function (b) {
    b.addEventListener('click', function () { if (state.chal) quitChal(true); stopSweep(); loadPreset(b.getAttribute('data-preset')); blip(494); setStatus(T('載入例題。', 'Example loaded.')); });
  });

  // ---------- 點 P、記下的點 ----------
  function movedP(src) {
    updateReadouts(); requestDraw();
    const ok = M.feasible(activeCons(), state.P.x, state.P.y, opts(), 1e-9);
    if (ok !== lastFeasible) { blip(ok ? 659 : 311, 'sine', 0.1); lastFeasible = ok; }
    emitTry(src);
  }
  let lastFeasible = true;
  function snapP(x, y, pxTol) {
    // 先吸附頂點，再吸附格子點，最後取到 0.1
    const q = Q();
    const tol = pxTol / viewCur.s;
    let best = null, bd = tol;
    if (!q.R.empty) q.R.vertices.forEach(function (v) { const d = Math.hypot(v[0] - x, v[1] - y); if (d < bd) { bd = d; best = { x: v[0], y: v[1] }; } });
    if (best) return best;
    const gx = Math.round(x), gy = Math.round(y);
    if (Math.hypot(gx - x, gy - y) < tol * 0.7) return { x: gx, y: gy };
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  }
  $('mark').addEventListener('click', function () {
    const ok = M.feasible(activeCons(), state.P.x, state.P.y, opts(), 1e-9);
    state.log.push({ x: state.P.x, y: state.P.y, ok: ok, z: zAt(state.P.x, state.P.y) });
    if (state.log.length > 12) state.log.shift();
    renderLog(); requestDraw();
    setStatus(T('記下 P ', 'Recorded P ') + pt(state.P.x, state.P.y) + (ok ? T('：可行，z = ', ': feasible, z = ') + fmt(zAt(state.P.x, state.P.y), 3) : T('：不可行', ': not feasible')) + T('。', '.'));
    blip(ok ? 587 : 330);
    emitTry('mark');
  });
  function renderLog() {
    const t = $('log');
    $('logEmpty').hidden = state.log.length > 0;
    if (!state.log.length) { t.innerHTML = ''; return; }
    let h = '<thead><tr><th>#</th><th>x</th><th>y</th><th>' + T('可行', 'Feasible') + '</th><th>z</th></tr></thead><tbody>';
    state.log.forEach(function (r, i) { h += '<tr><td>' + (i + 1) + '</td><td>' + fmt(r.x) + '</td><td>' + fmt(r.y) + '</td><td>' + (r.ok ? '✓' : '✗') + '</td><td>' + fmt(r.z, 3) + '</td></tr>'; });
    t.innerHTML = h + '</tbody>';
  }
  $('clear').addEventListener('click', function () {
    const had = state.log.length > 0 || state.times.length > 0;
    state.log = []; state.times = []; state.streak = 0;
    if (state.chal) quitChal(true);
    renderLog(); setChalMsg('');
    requestDraw();
    setStatus(had ? T('已清除記下的點與挑戰紀錄。', 'Recorded points and challenge record cleared.') : T('沒有要清除的紀錄。', 'Nothing to clear.'));
  });

  // ---------- 掃描 ----------
  function stopSweep() {
    if (!state.sweep) return;
    state.sweep = null;
    $('sweep').textContent = T('掃描', 'Sweep');
  }
  function sweepRange() {
    const q = Q(), vb = viewBox();
    const zsV = [zAt(vb[0], vb[2]), zAt(vb[0], vb[3]), zAt(vb[1], vb[2]), zAt(vb[1], vb[3])];
    const lo = Math.min.apply(null, zsV), hi = Math.max.apply(null, zsV);
    let rlo = lo, rhi = hi;
    if (!q.R.empty) {
      const poly = q.R.degenerate ? q.R.vertices : M.clipBox(activeCons(), vb, opts());
      if (poly.length) { rlo = Infinity; rhi = -Infinity; poly.forEach(function (v) { const z = zAt(v[0], v[1]); rlo = Math.min(rlo, z); rhi = Math.max(rhi, z); }); }
    }
    const pad = Math.max(1, 0.12 * (rhi - rlo));
    return { from: state.sense === 'max' ? Math.max(lo, rlo - pad) : Math.min(hi, rhi + pad), to: state.sense === 'max' ? Math.min(hi, rhi + pad) : Math.max(lo, rlo - pad) };
  }
  $('sweep').addEventListener('click', function () {
    if (state.sweep) { stopSweep(); requestDraw(); return; }
    if (Math.hypot(state.p, state.q) < 1e-9) { setStatus(T('p、q 都是 0：每一點的 z 都一樣，沒有東西可以掃。', 'p and q are both 0: z is the same everywhere, there is nothing to sweep.')); return; }
    const r = sweepRange(), q = Q();
    state.sweep = { from: r.from, to: r.to, t0: performance.now(), dur: reduceMotion.matches ? 1 : 3200, last: M.levelRelation(activeCons(), state.p, state.q, r.from, opts()) };
    $('sweep').textContent = T('停止', 'Stop');
    setStatus(state.sense === 'max' ? T('等高線沿 (p, q) 的方向掃過去：最後碰到可行域的地方就是最大值。', 'The level line slides in the direction (p, q): the last place it touches the region gives the maximum.')
      : T('等高線逆著 (p, q) 掃過去：最後碰到可行域的地方就是最小值。', 'The level line slides against (p, q): the last place it touches the region gives the minimum.'));
    if (q.R.empty) setStatus(T('可行域是空的：等高線一路都碰不到。', 'The region is empty: the line never touches it.'));
    sweepStep();
  });
  function sweepStep() {
    const sw = state.sweep;
    if (!sw) return;
    const now = performance.now(), u = clampv((now - sw.t0) / sw.dur, 0, 1);
    const q = Q(), opt = q.opt;
    let k = sw.from + (sw.to - sw.from) * u;
    // 掃過最佳值時停在那裡
    const done = u >= 1 || ((opt.status === 'unique' || opt.status === 'edge') && (state.sense === 'max' ? k >= opt.z : k <= opt.z));
    if (done && (opt.status === 'unique' || opt.status === 'edge')) k = opt.z;
    state.k = r6(k);
    const rel = M.levelRelation(activeCons(), state.p, state.q, state.k, opts());
    if (rel !== sw.last) {
      if (sw.last === 'miss' && rel !== 'miss') { blip(440, 'sine', 0.12); }
      sw.last = rel;
    }
    syncK(); refreshOutputs();
    requestDraw();
    if (!done) { requestAnimationFrame(sweepStep); return; }
    stopSweep();
    syncK();
    if (opt.status === 'unique' || opt.status === 'edge') {
      sweepFlash = { t: performance.now(), x: opt.x, y: opt.y };
      chime();
      setStatus((state.sense === 'max' ? T('最後碰到的是 ', 'The last touch is at ') : T('最後碰到的是 ', 'The last touch is at ')) + (opt.status === 'edge' ? T('一整條邊', 'a whole edge') : pt(opt.x, opt.y)) + T('：', ': ') + (state.sense === 'max' ? T('最大值 z = ', 'maximum z = ') : T('最小值 z = ', 'minimum z = ')) + fmt(opt.z, 3) + T('。', '.'));
    } else if (opt.status === 'unbounded') {
      blip(262, 'triangle', 0.14);
      setStatus(T('等高線一直走到畫面外，還是離不開可行域：z 沒有', 'The line runs off the screen and still has not left the region: z has no ') + (state.sense === 'max' ? T('最大值。', 'maximum.') : T('最小值。', 'minimum.')));
    } else if (opt.status === 'empty') setStatus(T('可行域是空的，沒有可行解。', 'The region is empty: there is no feasible point.'));
    updateReadouts(); requestDraw();
    emit('sweep', { status: opt.status, z: opt.z, sense: state.sense });
    emitLevel('sweep');
  }

  // ---------- 畫布操作 ----------
  function evPos(ev) { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  function distToLine(p, a, b, c) {
    // 直線 a x + b y = c 到畫面點 p 的距離（像素）
    const n = Math.hypot(a, b);
    if (n < 1e-12) return Infinity;
    return Math.abs(a * invX(p.x) + b * invY(p.y) - c) / n * viewCur.s;
  }
  function hitTest(p) {
    if (!viewCur) return null;
    if (Math.hypot(p.x - X(state.P.x), p.y - Y(state.P.y)) <= 16) return { kind: 'P' };
    if (Math.hypot(state.p, state.q) > 1e-9 && distToLine(p, state.p, state.q, state.k) <= 9) return { kind: 'level' };
    let best = null, bd = 9;
    state.cons.forEach(function (con, i) {
      if (!con.on || state.chal) return;
      const d = distToLine(p, con.a, con.b, con.c);
      if (d < bd) { bd = d; best = { kind: 'con', i: i }; }
    });
    return best;
  }
  let downAt = null;
  cv.addEventListener('pointerdown', function (ev) {
    if (!viewCur) return;
    const p = evPos(ev), h = hitTest(p);
    downAt = { x: p.x, y: p.y, h: h };
    if (h) {
      stopSweep();
      state.drag = Object.assign({ moved: false }, h);
      if (h.kind === 'con') { state.sel = h.i; syncEditor(); renderCons(); }
      try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 無妨 */ }
      ev.preventDefault();
      requestDraw();
    }
  });
  cv.addEventListener('pointermove', function (ev) {
    const p = evPos(ev);
    if (!state.drag) { const h = hitTest(p); cv.style.cursor = h ? (h.kind === 'P' ? 'grab' : 'move') : 'crosshair'; return; }
    // 手指或滑鼠的小抖動不算拖曳（放開時當作點一下）
    if (!state.drag.moved && downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) < 5) return;
    state.drag.moved = true;
    const x = invX(p.x), y = invY(p.y), dr = state.drag;
    if (dr.kind === 'P') { const s = snapP(x, y, 12); state.P = s; updateReadouts(); requestDraw(); }
    else if (dr.kind === 'level') {
      // 靠近頂點時吸附到頂點的 z
      let k = Math.round(zAt(x, y) * 10) / 10;
      const q = Q();
      if (!q.R.empty) q.R.vertices.forEach(function (v) { if (Math.hypot(X(v[0]) - p.x, Y(v[1]) - p.y) < 12) k = zAt(v[0], v[1]); });
      state.k = r6(k); syncK(); refreshOutputs(); requestDraw();
    } else if (dr.kind === 'con') {
      const con = state.cons[dr.i];
      const n = M.norm(con);
      let cc = Math.round((n.a * x + n.b * y) * 2) / 2;
      if (con.s === '>=') cc = -cc;
      con.c = r6(clampv(cc, -10, 20));
      cache = null; setSlider(el.cc, con.c); refresh();
    }
  });
  function endDrag(ev) {
    const dr = state.drag;
    if (!dr) {
      // 在平面上點一下（沒有拖曳）：P 移到那裡
      if (ev && ev.type === 'pointerup' && downAt && !downAt.h && viewCur) {
        const p = evPos(ev);
        if (Math.hypot(p.x - downAt.x, p.y - downAt.y) < 6 && p.x >= PR.x && p.x <= PR.x + PR.w && p.y >= PR.y && p.y <= PR.y + PR.h) {
          state.P = snapP(invX(p.x), invY(p.y), 14);
          movedP('tap');
        }
      }
      downAt = null;
      return;
    }
    const down = downAt;
    state.drag = null; downAt = null;
    if (!dr.moved && dr.kind !== 'P' && ev && ev.type === 'pointerup' && down && viewCur) {
      // 點在線上（沒有拖動）：P 移到那裡（吸附頂點、格子點），抓到的限制式照樣選取
      const p = evPos(ev);
      state.P = snapP(invX(p.x), invY(p.y), 14);
      movedP('tap');
      requestDraw();
      return;
    }
    if (dr.moved) {
      if (dr.kind === 'P') movedP('drag');
      else if (dr.kind === 'level') { syncK(); levelTone(); emitLevel('drag'); }
      else if (dr.kind === 'con') edited('drag');
    }
    requestDraw();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // ---------- 鍵盤 ----------
  let kb = null;
  if (window.LabKeys) {
    const items = [{
      name: function () { return T('點 P', 'the point P'); },
      move: function (dx, dy, big) {
        const st = big ? 1 : 0.1;
        let x = r6(state.P.x + dx * st), y = r6(state.P.y + dy * st);
        // 走到頂點旁邊（0.06 以內）就吸上去
        const q = Q();
        if (!q.R.empty) q.R.vertices.forEach(function (v) { if (Math.abs(v[0] - x) <= 0.06 && Math.abs(v[1] - y) <= 0.06) { x = v[0]; y = v[1]; } });
        state.P = { x: x, y: y };
        movedP('key'); return true;
      },
      describe: function () {
        const ok = M.feasible(activeCons(), state.P.x, state.P.y, opts(), 1e-9);
        return 'P ' + pt(state.P.x, state.P.y) + T('，', ', ') + (ok ? T('可行', 'feasible') : T('不可行', 'not feasible')) + T('，z = ', ', z = ') + fmt(zAt(state.P.x, state.P.y), 3);
      }
    }, {
      name: function () { return T('等高線 z = k', 'the level line z = k'); },
      move: function (dx, dy, big) {
        stopSweep();
        state.k = r6(Math.round((state.k + (dx || dy) * (big ? 5 : 0.5)) * 2) / 2);
        syncK(); refreshOutputs(); requestDraw(); levelTone(); emitLevel('key'); return true;
      },
      describe: function () { return 'k = ' + fmt(state.k, 2) + T('，', ', ') + ({ miss: T('碰不到可行域', 'misses the region'), touch: T('只碰到可行域的邊界', 'just touches the region'), cross: T('穿過可行域', 'crosses the region') })[M.levelRelation(activeCons(), state.p, state.q, state.k, opts())]; }
    }];
    [0, 1, 2, 3].forEach(function (i) {
      items.push({
        name: function () { return T('限制線 ', 'constraint line ') + (i + 1) + T('：', ': ') + conText(state.cons[i]); },
        move: function (dx, dy, big) {
          if (state.chal) return false;
          const con = state.cons[i];
          con.on = true; state.sel = i;
          con.c = r6(clampv(con.c + (dx || dy) * (big ? 2 : 0.5), -10, 20));
          syncEditor(); edited('key'); return true;
        },
        describe: function () { return conText(state.cons[i]) + (state.cons[i].on ? '' : T('（目前關閉）', ' (switched off)')); }
      });
    });
    kb = window.LabKeys.attach(cv, {
      label: T('線性規劃畫布。Enter 切換點 P、等高線與各條限制線；方向鍵移動，Shift 移得多。', 'Linear programming canvas. Enter switches between the point P, the level line and each constraint line; arrow keys move it, Shift for bigger steps.'),
      items: items,
      onChange: function () { requestDraw(); }
    });
  }

  // ---------- 挑戰 ----------
  const chalMsg = $('chalMsg');
  function setChalMsg(msg, cls) { chalMsg.textContent = msg || ''; chalMsg.classList.toggle('ok', cls === 'ok'); chalMsg.classList.toggle('bad', cls === 'bad'); }
  function randomProblem() {
    for (let t = 0; t < 500; t++) {
      const cons = [];
      for (let i = 0; i < 3; i++) {
        const a = 1 + Math.floor(rand() * 5), b = 1 + Math.floor(rand() * 5), c = 6 + Math.floor(rand() * 15);
        cons.push({ a: a, b: b, c: c, s: '<=' });
      }
      if (rand() < 0.4) cons[2] = rand() < 0.5 ? { a: 1, b: -1, c: 1 + Math.floor(rand() * 4), s: '<=' } : { a: -1, b: 1, c: 1 + Math.floor(rand() * 4), s: '<=' };
      const p = 1 + Math.floor(rand() * 5), q = 1 + Math.floor(rand() * 5);
      const o = M.optimize(cons, p, q, 'max');
      const R = o.region;
      if (o.status !== 'unique' || !R.bounded || R.vertices.length < 4 || R.vertices.length > 6) continue;
      if (Math.abs(o.x) < 1e-9 && Math.abs(o.y) < 1e-9) continue;
      // 第二好的頂點至少差 0.5，比較公平
      const zs = R.vertices.map(function (v) { return p * v[0] + q * v[1]; }).sort(function (u, v) { return v - u; });
      if (zs[0] - zs[1] < 0.5) continue;
      const span = Math.max.apply(null, R.vertices.map(function (v) { return Math.max(v[0], v[1]); }));
      if (span > 16 || span < 3) continue;
      return { cons: cons, p: p, q: q };
    }
    return { cons: PRESETS.factory.cons, p: 3, q: 2 };
  }
  function startChal() {
    stopSweep();
    const g = randomProblem();
    state.cons = [0, 1, 2, 3].map(function (i) { const c = g.cons[i]; return c ? { a: c.a, b: c.b, c: c.c, s: c.s, on: true } : { a: OFF[i].a, b: OFF[i].b, c: OFF[i].c, s: OFF[i].s, on: false }; });
    state.p = g.p; state.q = g.q; state.sense = 'max'; state.nonneg = true; state.sel = 0;
    state.P = { x: 0, y: 0 };
    cache = null; viewCur = null;
    state.chal = { t0: performance.now() }; state.answered = false; state.round++;
    state.k = 0;
    syncAll(); refresh();
    $('presetNote').textContent = '';
    state.preset = null;
    document.querySelectorAll('#presets button').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
    document.querySelectorAll('#presets button').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
    $('submitC').hidden = false; $('quitChal').hidden = false;
    $('newChal').textContent = T('換一題', 'Another one');
    setChalMsg(T('第 ', 'Problem ') + state.round + T(' 題：求 ', ': maximise ') + objText(false) + T(' 的最大值。把 P 放到最好的頂點上，再按「就是這裡」。', '. Put P on the best corner, then press “This one”.'));
    blip(523);
  }
  function quitChal(silent) {
    if (!state.chal) return;
    const wasOpen = !state.answered;
    state.chal = null; state.answered = false;
    $('submitC').hidden = true; $('quitChal').hidden = true;
    $('newChal').textContent = T('出一題', 'New problem');
    if (wasOpen) { state.streak = 0; if (!silent) setChalMsg(T('放棄這題，連續答對中斷。', 'Gave up: the streak is broken.')); else setChalMsg(''); }
    refresh();
  }
  $('newChal').addEventListener('click', function () {
    if (state.chal && !state.answered) state.streak = 0; // 換題算中斷
    startChal();
  });
  $('quitChal').addEventListener('click', function () { quitChal(false); });
  $('submitC').addEventListener('click', function () {
    if (!state.chal || state.answered) return;
    const q = Q();
    const onV = q.R.vertices.some(function (v) { return Math.abs(v[0] - state.P.x) < 1e-9 && Math.abs(v[1] - state.P.y) < 1e-9; });
    if (!onV) { setChalMsg(T('先把 P 移到一個頂點上（在頂點附近點一下就會吸上去）。', 'First put P on a corner (tap near it and it snaps on).'), 'bad'); blip(294); return; }
    const secs = (performance.now() - state.chal.t0) / 1000;
    const right = Math.abs(zAt(state.P.x, state.P.y) - q.opt.z) < 1e-9;
    state.answered = true;
    if (right) {
      state.streak++; state.times.push(secs); if (state.times.length > 5) state.times.shift();
      setChalMsg(T('答對了！z = ', 'Correct! z = ') + fmt(q.opt.z, 3) + T('，用了 ', ', in ') + secs.toFixed(1) + T(' 秒，連續答對 ', ' s. Streak: ') + state.streak + T(' 題。', '.'), 'ok');
      chime();
    } else {
      state.streak = 0; state.times = [];
      setChalMsg(T('不對：這一點 z = ', 'Not quite: here z = ') + fmt(zAt(state.P.x, state.P.y), 3) + T('，最好的是 ', '; the best is ') + pt(q.opt.x, q.opt.y) + T('，z = ', ', z = ') + fmt(q.opt.z, 3) + T('。', '.'), 'bad');
      blip(220, 'triangle', 0.14);
    }
    $('submitC').hidden = true; $('quitChal').hidden = true;
    $('newChal').textContent = T('出下一題', 'Next problem');
    state.chal = null;
    updateReadouts(); requestDraw();
    const last5 = state.streak >= 5 ? state.times.slice(-5).reduce(function (s, v) { return s + v; }, 0) : NaN;
    emit('guess', { correct: right, streak: state.streak, secs: secs, last5: last5 });
  });

  // ---------- 狀態列與音效 ----------
  function setStatus(t) { $('status').textContent = t || ''; }
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function blip(freq, type, gain) { const S = sound(); if (S) S.tone({ freq: freq, dur: 0.08, type: type || 'triangle', gain: gain || 0.14 }); }
  function chime() {
    const S = sound(); if (!S) return;
    S.tone({ freq: 659.25, dur: 0.16, type: 'sine', gain: 0.22 });
    S.tone({ freq: 880, dur: 0.22, type: 'sine', gain: 0.18, delay: 0.09 });
    S.tone({ freq: 1318.5, dur: 0.12, type: 'sine', gain: 0.06, delay: 0.1 });
  }
  /** 等高線的聲音：碰到邊界時高、穿過時中、碰不到時低 */
  function levelTone() {
    const rel = M.levelRelation(activeCons(), state.p, state.q, state.k, opts());
    blip(rel === 'touch' ? 784 : rel === 'cross' ? 523 : 330, 'sine', 0.1);
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
  function setupData(src) {
    const q = Q(), R = q.R, o = q.opt, ip = q.ip;
    return {
      src: src, cons: state.cons.map(function (c) { return { a: c.a, b: c.b, c: c.c, s: c.s, on: c.on }; }), nOn: activeCons().length,
      nonneg: state.nonneg, p: state.p, q: state.q, sense: state.sense,
      status: o.status, z: o.z, x: o.x, y: o.y, nBest: o.best.length, best: o.best.map(function (v) { return [v.x, v.y]; }),
      maxStatus: state.sense === 'max' ? o.status : q.other.status, minStatus: state.sense === 'min' ? o.status : q.other.status,
      empty: R.empty, bounded: R.bounded, degenerate: !!R.degenerate, nVerts: R.vertices.length, area: R.area,
      verts: R.vertices.map(function (v) { return [v[0], v[1]]; }),
      intStatus: ip.status, intZ: ip.z, intN: ip.pts.length, intBest: ip.pts.map(function (v) { return [v[0], v[1]]; }),
      nLat: q.nLat, latB: q.latB, latI: q.latI, latticeVerts: q.latticeVerts, tight: q.tight
    };
  }
  function emitSetup(src) { emit('setup', setupData(src)); }
  function emitLevel(src) {
    const q = Q(), o = q.opt;
    const rel = Math.hypot(state.p, state.q) > 1e-9 ? M.levelRelation(activeCons(), state.p, state.q, state.k, opts()) : 'miss';
    const atOpt = (o.status === 'unique' || o.status === 'edge') && rel === 'touch' && Math.abs(state.k - o.z) <= 0.002 * (1 + Math.abs(o.z));
    emit('level', { src: src, k: state.k, rel: rel, p: state.p, q: state.q, sense: state.sense, status: o.status, zOpt: o.z, atOpt: atOpt, chal: !!state.chal });
  }
  function emitTry(src) {
    const q = Q(), o = q.opt, ip = q.ip, x = state.P.x, y = state.P.y;
    const ok = M.feasible(activeCons(), x, y, opts(), 1e-9), z = zAt(x, y);
    const onVertex = !q.R.empty && q.R.vertices.some(function (v) { return Math.abs(v[0] - x) < 1e-9 && Math.abs(v[1] - y) < 1e-9; });
    const isOpt = ok && (o.status === 'unique' || o.status === 'edge' || o.status === 'all') && Math.abs(z - o.z) <= 1e-7 * (1 + Math.abs(o.z));
    const isInt = Math.abs(x - Math.round(x)) < 1e-9 && Math.abs(y - Math.round(y)) < 1e-9;
    const isIntOpt = ok && isInt && ip.status === 'ok' && ip.pts.some(function (v) { return v[0] === Math.round(x) && v[1] === Math.round(y); });
    emit('try', { src: src, x: x, y: y, feasible: ok, z: z, onVertex: onVertex, isOpt: isOpt, isIntOpt: isIntOpt,
      gap: ip.status === 'ok' && isFinite(o.z) ? Math.abs(o.z - ip.z) : NaN, status: o.status, intStatus: ip.status, chal: !!state.chal });
  }

  // 給測試用的介面（不影響畫面）
  window.__lp = {
    state: state, Q: Q,
    xy: function (x, y) { return viewCur ? [X(x), Y(y)] : null; },
    seed: function (s) { let v = s >>> 0 || 1; rand = function () { v = (v * 16807) % 2147483647; return (v - 1) / 2147483646; }; }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  state.cons = [0, 1, 2, 3].map(function (i) { return { a: OFF[i].a, b: OFF[i].b, c: OFF[i].c, s: OFF[i].s, on: false }; });
  loadPreset('factory', true);
  renderLog();
  updateSoundButton();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    eqKey = null;
    renderLog(); renderCons(); refreshOutputs(); updateReadouts(); updateSoundButton();
    if (!state.chal) $('presetNote').textContent = state.preset && document.querySelector('#presets button[aria-pressed="true"]') ? T(NOTES[state.preset][0], NOTES[state.preset][1]) : $('presetNote').textContent ? T(MODNOTE[0], MODNOTE[1]) : '';
    $('sweep').textContent = state.sweep ? T('停止', 'Stop') : T('掃描', 'Sweep');
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
})();
