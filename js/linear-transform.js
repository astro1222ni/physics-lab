/* linear-transform.js — 「矩陣與線性變換」的畫面與互動（數學計算在 linear-transform-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 平面 2×2：方格紙（原來的格線淡淡留著）被矩陣 A 變形；紅色 i、綠色 j 箭頭就是 A 的兩行，可以拖曳尖端；
 *   單位正方形變成平行四邊形（正的藍紫色、翻面時紅色），F 形小旗子顯示有沒有翻面；單位圓變成橢圓；
 *   紫色探針 x 和它的像 A x，兩者共線時 x 是特徵向量；特徵向量的方向畫成虛線。
 * 空間 3×3：單位立方體變成平行六面體（自己畫的可轉動投影圖；按「3D 立體」載入 three.js，見 linear-transform-3d.js）。
 * 漸變：畫面顯示 (1 − t)I + tA，「播放變形」讓 t 從 0 走到 1。
 * 挑戰（平面）：橘色虛線是神祕整數矩陣的結果，調出同一個矩陣。 */
(function () {
  'use strict';
  const L = window.LinearTransformCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha;
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const DEF2 = [[1.5, 0.5], [0.5, 1]], DEFX = [1, 2], DEF3 = [[1, 0.5, 0], [0, 1, 0.5], [0.5, 0, 1]];
  const YAW0 = 35, PITCH0 = 22;
  const SIN1 = Math.sin(L.DEG);
  const PRE2 = {
    id: [[1, 0], [0, 1]], stretch: [[2, 0], [0, 0.5]], shear: [[1, 1], [0, 1]],
    mirror: [[1, 0], [0, -1]], proj: [[1, 0], [0, 0]], sym: [[1.5, 0.5], [0.5, 1.5]]
  };
  const PRE3 = {
    id: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], stretch: [[2, 0, 0], [0, 1.5, 0], [0, 0, 0.5]], shear: [[1, 0, 0.5], [0, 1, 0.5], [0, 0, 1]],
    rot: [[0, -1, 0], [1, 0, 0], [0, 0, 1]], mirror: [[1, 0, 0], [0, 1, 0], [0, 0, -1]], proj: [[1, 0, 0], [0, 1, 0], [0, 0, 0]]
  };
  const copy = function (M) { return M.map(function (r) { return Array.isArray(r) ? r.slice() : r; }); };

  // ---------- 狀態 ----------
  const state = {
    mode: 'm2',
    A2: copy(DEF2), x: DEFX.slice(), A3: copy(DEF3), col: 0, t: 1,
    showGrid: true, showCirc: false, showEig: false,
    yaw: YAW0, pitch: PITCH0,
    chal: null, round: 0, streak: [], log: [],
    lastSign: null, lastAlign: false, playing: false
  };
  let rand = L.rng(((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0);
  let lastChal = null;
  let applying = false;

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'lt-i', 'lt-j', 'lt-k', 'lt-pos', 'lt-neg', 'lt-x', 'lt-ax', 'lt-eig', 'lt-flag', 'lt-target']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight, italic) { return (italic ? 'italic ' : '') + (weight ? weight + ' ' : '') + px + 'px ' + FONT; }

  // ---------- 數字 ----------
  function num(v, dec) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(dec);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function tr(v, dec) { return L.trim(v, dec == null ? 2 : dec).replace('-', '−'); }
  function tx(v, dec) { return L.trim(v, dec == null ? 3 : dec); }
  function txp(v, dec) { const s = tx(v, dec); return s.charAt(0) === '-' ? '(' + s + ')' : s; }
  function pt(p, dec) { return '(' + p.map(function (x) { return tr(x, dec == null ? 2 : dec); }).join(', ') + ')'; }
  function matText(M) { return '[' + M.map(function (r) { return r.map(function (x) { return tr(x, 2); }).join(' '); }).join('; ') + ']'; }

  // ---------- 目前的量 ----------
  function Mt() { return L.lerpI(state.mode === 'm2' ? state.A2 : state.A3, state.t); }
  function Q2() {
    const A = state.A2, e = L.eig2(A), p = L.probe(A, state.x);
    return { A: A, det: L.det2(A), tr: L.tr2(A), eig: e, sig: L.sing2(A), p: p, rank: L.rank2(A, 1e-9),
      aligned: p.nx >= 0.5 && p.ny >= 0.1 && p.sin != null && p.sin <= SIN1 };
  }
  function Q3() { const A = state.A3; return { A: A, det: L.det3(A), rank: L.rank3(A) }; }
  function sgn(d) { return Math.abs(d) <= 1e-9 ? 0 : d > 0 ? 1 : -1; }

  // ---------- 畫布 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 480, F = null;
  function layout() {
    const narrow = cw < 600;
    const H = narrow ? Math.round(Math.max(330, Math.min(cw * 1.02, 430))) : 500;
    const pad = 10, top = pad, bottom = H - pad;
    const k = (bottom - top) / 8.4;          // y 方向 −4.2 到 4.2
    return { narrow: narrow, H: H, r: { x0: pad, x1: cw - pad, y0: top, y1: bottom }, k: k, ox: cw / 2, oy: (top + bottom) / 2 };
  }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    const Lo = layout();
    ch = Lo.H;
    F = Lo;
    F.X = function (x) { return Lo.ox + x * Lo.k; };
    F.Y = function (y) { return Lo.oy - y * Lo.k; };
    F.ux = function (px) { return (px - Lo.ox) / Lo.k; };
    F.uy = function (py) { return (Lo.oy - py) / Lo.k; };
    F.xr = [F.ux(Lo.r.x0), F.ux(Lo.r.x1)]; F.yr = [F.uy(Lo.r.y1), F.uy(Lo.r.y0)];
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    requestDraw();
  }
  let rafId = 0;
  function requestDraw() {
    if (!rafId) rafId = requestAnimationFrame(function () { rafId = 0; draw(); });
    if (view3) view3.rebuild();
  }

  // ---------- 繪圖工具 ----------
  function clip(c) { const r = F.r; c.beginPath(); c.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); c.clip(); }
  function panel(c) {
    const r = F.r;
    D.roundRect(c, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, 8);
    c.fillStyle = alpha(C.text, D.dark ? 0.03 : 0.022); c.fill();
  }
  function drawGrid(c) {
    const r = F.r;
    c.save();
    panel(c);
    clip(c);
    c.lineWidth = 1;
    for (let x = Math.ceil(F.xr[0]); x <= F.xr[1]; x++) {
      c.strokeStyle = alpha(C.text, 0.06);
      c.beginPath(); c.moveTo(F.X(x), r.y0); c.lineTo(F.X(x), r.y1); c.stroke();
    }
    for (let y = Math.ceil(F.yr[0]); y <= F.yr[1]; y++) {
      c.strokeStyle = alpha(C.text, 0.06);
      c.beginPath(); c.moveTo(r.x0, F.Y(y)); c.lineTo(r.x1, F.Y(y)); c.stroke();
    }
    c.strokeStyle = alpha(C.text, 0.32); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(r.x0, F.Y(0)); c.lineTo(r.x1, F.Y(0)); c.moveTo(F.X(0), r.y0); c.lineTo(F.X(0), r.y1); c.stroke();
    c.font = fnt(10.5); c.fillStyle = alpha(C.muted, 0.85);
    const lab = F.k < 30 ? 2 : 1;
    for (let x = Math.ceil(F.xr[0]); x <= F.xr[1]; x++) {
      if (x === 0 || x % lab !== 0) continue;
      c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(tr(x, 0), F.X(x), F.Y(0) + 4);
    }
    for (let y = Math.ceil(F.yr[0]); y <= F.yr[1]; y++) {
      if (y === 0 || y % lab !== 0) continue;
      c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(tr(y, 0), F.X(0) - 5, F.Y(y));
    }
    c.restore();
  }
  /** 螢幕坐標的箭頭 */
  function arrowPx(c, x0, y0, x1, y1, color, w, head) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx / len, uy = dy / len, hl = Math.min(head || 11, len * 0.45), hw = hl * 0.55;
    c.save();
    c.strokeStyle = color; c.fillStyle = color; c.lineWidth = w; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1 - ux * hl * 0.8, y1 - uy * hl * 0.8); c.stroke();
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - ux * hl - uy * hw, y1 - uy * hl + ux * hw); c.lineTo(x1 - ux * hl + uy * hw, y1 - uy * hl - ux * hw); c.closePath(); c.fill();
    c.restore();
  }
  function vecArrow(c, v, color, w, halo) {
    const x1 = F.X(v[0]), y1 = F.Y(v[1]);
    if (halo) arrowPx(c, F.X(0), F.Y(0), x1, y1, alpha(color, 0.22), w + 5, 14);
    arrowPx(c, F.X(0), F.Y(0), x1, y1, color, w, 12);
  }
  function poly(c, pts, fill, stroke, w, dash) {
    c.beginPath();
    pts.forEach(function (p, i) { if (i) c.lineTo(F.X(p[0]), F.Y(p[1])); else c.moveTo(F.X(p[0]), F.Y(p[1])); });
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.save(); c.strokeStyle = stroke; c.lineWidth = w || 1.5; c.lineJoin = 'round'; if (dash) c.setLineDash(dash); c.stroke(); c.restore(); }
  }
  function lineThrough(c, dir, color, w, dash) {
    const n = Math.hypot(dir[0], dir[1]);
    if (n < 1e-9) return;
    const S = 60 / n;
    c.save(); clip(c);
    c.strokeStyle = color; c.lineWidth = w; if (dash) c.setLineDash(dash);
    c.beginPath(); c.moveTo(F.X(-dir[0] * S), F.Y(-dir[1] * S)); c.lineTo(F.X(dir[0] * S), F.Y(dir[1] * S)); c.stroke();
    c.restore();
  }
  function inView(p, m) { const e = m || 0; return p[0] >= F.xr[0] + e && p[0] <= F.xr[1] - e && p[1] >= F.yr[0] + e && p[1] <= F.yr[1] - e; }
  function handle(c, v, color) {
    const x = F.X(v[0]), y = F.Y(v[1]);
    c.save();
    c.fillStyle = C['canvas-bg'] || C.surface; c.strokeStyle = color; c.lineWidth = 2.4;
    c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = color; c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  /** 在向量尖端外側寫標籤 */
  function tipLabel(c, v, text, color, size) {
    const n = Math.hypot(v[0], v[1]);
    const u = n > 1e-6 ? [v[0] / n, v[1] / n] : [0.7, 0.7];
    let x = F.X(v[0]) + u[0] * 16, y = F.Y(v[1]) - u[1] * 16;
    x = Math.max(F.r.x0 + 6, Math.min(F.r.x1 - 6, x)); y = Math.max(F.r.y0 + 10, Math.min(F.r.y1 - 10, y));
    D.haloText(c, text, x, y, color, u[0] >= 0 ? 'left' : 'right', 'middle', fnt(size || 12.5, 700));
  }

  // ---------- 繪圖：平面 ----------
  function draw() {
    if (!F) return;
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    D.backdrop(c, cw, ch);
    if (state.mode === 'm2') draw2(c); else draw3(c);
    if (kb && kb.focused()) {
      c.save(); c.strokeStyle = C.accent; c.setLineDash([4, 4]); c.lineWidth = 1.5;
      D.roundRect(c, F.r.x0 + 3, F.r.y0 + 3, F.r.x1 - F.r.x0 - 6, F.r.y1 - F.r.y0 - 6, 8); c.stroke(); c.restore();
    }
  }
  function draw2(c) {
    drawGrid(c);
    const M = Mt(), ci = [M[0][0], M[1][0]], cj = [M[0][1], M[1][1]];
    const det = L.det2(M), s = sgn(det);
    const area = s < 0 ? C['lt-neg'] : C['lt-pos'];
    c.save(); clip(c);
    // 變形後的方格：沿著 j' 的線（原來的鉛直線）綠色、沿著 i' 的線紅色
    if (state.showGrid) {
      const N = 16;
      [[ci, cj, 'lt-j'], [cj, ci, 'lt-i']].forEach(function (g) {
        const base = g[0], dir = g[1], nd = Math.hypot(dir[0], dir[1]);
        if (nd < 1e-6) return;
        const S = 40 / nd;
        for (let n = -N; n <= N; n++) {
          const o = [n * base[0], n * base[1]];
          c.strokeStyle = alpha(C[g[2]], n === 0 ? 0.5 : D.dark ? 0.2 : 0.17);
          c.lineWidth = n === 0 ? 1.6 : 1;
          c.beginPath(); c.moveTo(F.X(o[0] - dir[0] * S), F.Y(o[1] - dir[1] * S)); c.lineTo(F.X(o[0] + dir[0] * S), F.Y(o[1] + dir[1] * S)); c.stroke();
        }
      });
    }
    // 原來的單位正方形（虛線）
    poly(c, [[0, 0], [1, 0], [1, 1], [0, 1]], null, alpha(C.muted, 0.7), 1.2, [4, 4]);
    // 挑戰的目標
    if (state.chal) {
      const G = state.chal.M, gi = [G[0][0], G[1][0]], gj = [G[0][1], G[1][1]];
      poly(c, [[0, 0], gi, [gi[0] + gj[0], gi[1] + gj[1]], gj], alpha(C['lt-target'], 0.08), C['lt-target'], 2, [7, 5]);
      poly(c, L.FLAG.map(function (p) { return L.apply2(G, p); }), alpha(C['lt-target'], 0.14), C['lt-target'], 1.6, [5, 4]);
    }
    // 單位圓的像
    if (state.showCirc) {
      const n = 144, cir = [], ell = [];
      for (let k = 0; k < n; k++) { const a = k * 2 * Math.PI / n, u = [Math.cos(a), Math.sin(a)]; cir.push(u); ell.push(L.apply2(M, u)); }
      poly(c, cir, null, alpha(C['lt-x'], 0.35), 1.2, [3, 4]);
      poly(c, ell, alpha(C['lt-x'], 0.06), C['lt-x'], 2, [8, 5]);
    }
    // 單位正方形的像
    const sq = [[0, 0], ci, [ci[0] + cj[0], ci[1] + cj[1]], cj];
    if (s !== 0) {
      const g = c.createLinearGradient(F.X(0), F.Y(0), F.X(sq[2][0]), F.Y(sq[2][1]));
      g.addColorStop(0, alpha(area, D.dark ? 0.32 : 0.24)); g.addColorStop(1, alpha(area, D.dark ? 0.16 : 0.1));
      poly(c, sq, g, area, 2.2);
    } else poly(c, sq, null, area, 3);
    // 小旗子
    const fl = L.FLAG.map(function (p) { return L.apply2(M, p); });
    poly(c, fl, alpha(C['lt-flag'], D.dark ? 0.62 : 0.55), C['lt-flag'], 1.4);
    c.restore();

    // 特徵向量方向
    const e = L.eig2(M);
    if (state.showEig && !state.chal) {
      if (e.kind === 'distinct' || e.kind === 'repeated') {
        e.vecs.forEach(function (v, i) {
          lineThrough(c, v, C['lt-eig'], 1.8, [9, 6]);
          // 標籤放在畫面邊緣附近
          // 標籤放在直線的下端（向量多半在上方，比較不會重疊）
          const sgnv = v[1] > 0 ? -1 : 1, R = Math.min(F.xr[1] / Math.max(Math.abs(v[0]), 1e-9), F.yr[1] / Math.max(Math.abs(v[1]), 1e-9)) * 0.85, q = [v[0] * R * sgnv, v[1] * R * sgnv];
          D.pill(c, 'λ = ' + tr(e.vals[i], 2), F.X(q[0]), F.Y(q[1]) + 5, C['lt-eig'], 'center', fnt(11.5, 700));
        });
      }
    }
    // 原來的 i、j（淡）
    vecArrow(c, [1, 0], alpha(C['lt-i'], 0.35), 1.6);
    vecArrow(c, [0, 1], alpha(C['lt-j'], 0.35), 1.6);
    // 探針 x 與 A x（用 A 本身，不是漸變中的矩陣）
    const p = L.probe(M, state.x), aligned = p.nx >= 0.5 && p.ny >= 0.1 && p.sin != null && p.sin <= SIN1, probeOn = !state.chal;
    if (probeOn) {
      if (aligned) lineThrough(c, state.x, alpha(C['lt-ax'], 0.35), 4);
      vecArrow(c, p.y, C['lt-ax'], 2.6, aligned);
      vecArrow(c, state.x, C['lt-x'], 2.6);
    }
    // 行向量（可拖曳）
    vecArrow(c, ci, C['lt-i'], 3.2, true);
    vecArrow(c, cj, C['lt-j'], 3.2, true);
    D.ball(c, F.X(0), F.Y(0), 4, C.text);
    // 標籤
    const showCoord = !F.narrow;
    tipLabel(c, ci, 'i' + (showCoord ? ' ' + pt(ci, 2) : ''), C['lt-i']);
    tipLabel(c, cj, 'j' + (showCoord ? ' ' + pt(cj, 2) : ''), C['lt-j']);
    if (probeOn) { tipLabel(c, p.y, 'Ax', C['lt-ax'], 12); tipLabel(c, state.x, 'x', C['lt-x'], 13); }
    if (state.t === 1) { handle(c, ci, C['lt-i']); handle(c, cj, C['lt-j']); }
    if (probeOn) D.ball(c, F.X(state.x[0]), F.Y(state.x[1]), 6.5, C['lt-x'], { glow: aligned ? 0.5 : null });
    if (probeOn && aligned) {
      const lab = 'A x = λ x，λ = ' + tr(p.lambda, 2);
      D.pill(c, lab, F.r.x1 - 12, F.r.y1 - 14, C['lt-ax'], 'right', fnt(12.5, 700));
    }
    // 角落：行列式
    let msg;
    if (state.chal) msg = T('調出橘色虛線的矩陣', 'Match the dashed orange shape');
    else if (s > 0) msg = 'det = ' + tr(det, 2) + T('：面積 × ', ': area × ') + tr(det, 2);
    else if (s < 0) msg = 'det = ' + tr(det, 2) + T('：翻面，面積 × ', ': flipped, area × ') + tr(-det, 2);
    else msg = 'det = 0' + (L.rank2(M, 1e-9) === 0 ? T('：壓成一點', ': squashed to a point') : T('：壓成一條線', ': squashed onto a line'));
    D.pill(c, msg, F.r.x0 + 12, F.r.y0 + 24, s < 0 && !state.chal ? C['lt-neg'] : state.chal ? C['lt-target'] : C.text, 'left', fnt(13, 700));
    if (state.t < 1) D.pill(c, 't = ' + num(state.t, 2), F.r.x1 - 12, F.r.y0 + 24, C.accent, 'right', fnt(12.5, 700));
  }

  // ---------- 繪圖：空間（自己畫的投影圖） ----------
  let P3 = null;
  function frame3() {
    const B = L.viewBasis(state.yaw, state.pitch);
    let R = 1.75;
    L.CUBE_V.forEach(function (p) { R = Math.max(R, L.norm3(L.apply3(state.A3, p))); });
    R = Math.min(R, 10);
    const G = Math.max(2, Math.min(6, Math.ceil(R * 0.75)));
    const s = Math.min(cw, ch) * 0.5 / Math.max(R * 0.95, G + 0.6);
    const ox = cw / 2, oy = ch * 0.56;
    return { B: B, G: G, s: s, P: function (p) { const q = L.project(B, p); return [ox + q.x * s, oy - q.y * s, q.z]; } };
  }
  function draw3(c) {
    const r = F.r;
    c.save(); panel(c); c.restore();
    const Fr = frame3(), P = Fr.P, G = Fr.G, B = Fr.B;
    P3 = Fr;
    c.save(); clip(c);
    // 地板格線
    c.lineWidth = 1;
    for (let i = -G; i <= G; i++) {
      c.strokeStyle = alpha(C.text, i === 0 ? 0 : 0.07);
      let a = P([i, -G, 0]), b = P([i, G, 0]);
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
      a = P([-G, i, 0]); b = P([G, i, 0]);
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    }
    // 坐標軸
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(function (u, i) {
      const neg = P([-u[0] * G, -u[1] * G, -u[2] * G]), o = P([0, 0, 0]), pos = P([u[0] * (G + 0.6), u[1] * (G + 0.6), u[2] * (G + 0.6)]);
      c.save(); c.strokeStyle = alpha(C.text, 0.25); c.setLineDash([4, 5]); c.lineWidth = 1.1;
      c.beginPath(); c.moveTo(neg[0], neg[1]); c.lineTo(o[0], o[1]); c.stroke(); c.restore();
      arrowPx(c, o[0], o[1], pos[0], pos[1], alpha(C.text, 0.5), 1.3, 9);
      const lp = P([u[0] * (G + 1), u[1] * (G + 1), u[2] * (G + 1)]);
      D.haloText(c, ['x', 'y', 'z'][i], Math.max(r.x0 + 10, Math.min(r.x1 - 10, lp[0])), Math.max(r.y0 + 12, Math.min(r.y1 - 12, lp[1])), C.muted, 'center', 'middle', fnt(13, 600, true));
    });
    // 原來的單位立方體（虛線）
    const V0 = L.CUBE_V.map(P);
    c.save(); c.strokeStyle = alpha(C.muted, 0.7); c.setLineDash([4, 4]); c.lineWidth = 1.2;
    L.CUBE_E.forEach(function (e) { c.beginPath(); c.moveTo(V0[e[0]][0], V0[e[0]][1]); c.lineTo(V0[e[1]][0], V0[e[1]][1]); c.stroke(); });
    c.restore();
    // 變形後的平行六面體：面由遠到近畫
    const M = Mt(), det = L.det3(M), s = sgn(det), col = s < 0 ? C['lt-neg'] : C['lt-pos'];
    const W = L.CUBE_V.map(function (p) { return L.apply3(M, p); }), V = W.map(P);
    const light = (function () { const l = [B.e[0] + 0.7 * B.u[0] - 0.4 * B.r[0], B.e[1] + 0.7 * B.u[1] - 0.4 * B.r[1], B.e[2] + 0.7 * B.u[2] - 0.4 * B.r[2]]; const n = L.norm3(l); return [l[0] / n, l[1] / n, l[2] / n]; })();
    const faces = L.CUBE_F.map(function (f) {
      const a = W[f[0]], b = W[f[1]], d = W[f[3]];
      const n = L.cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [d[0] - a[0], d[1] - a[1], d[2] - a[2]]), nn = L.norm3(n);
      const lam = nn > 1e-9 ? Math.abs(L.dot3(n, light)) / nn : 0.5;
      return { f: f, z: f.reduce(function (sm, k) { return sm + V[k][2]; }, 0) / 4, lam: lam };
    }).sort(function (p, q) { return p.z - q.z; });
    faces.forEach(function (fc) {
      c.beginPath();
      fc.f.forEach(function (k, i) { if (i) c.lineTo(V[k][0], V[k][1]); else c.moveTo(V[k][0], V[k][1]); });
      c.closePath();
      c.fillStyle = alpha(col, (D.dark ? 0.1 : 0.08) + 0.22 * fc.lam); c.fill();
    });
    c.strokeStyle = alpha(col, 0.85); c.lineWidth = 1.5; c.lineJoin = 'round';
    L.CUBE_E.forEach(function (e) { c.beginPath(); c.moveTo(V[e[0]][0], V[e[0]][1]); c.lineTo(V[e[1]][0], V[e[1]][1]); c.stroke(); });
    // 三個行向量
    const o = P([0, 0, 0]);
    [[1, 'lt-i', 'i'], [2, 'lt-j', 'j'], [4, 'lt-k', 'k']].forEach(function (a, n) {
      const tip = V[a[0]], w = W[a[0]];
      arrowPx(c, o[0], o[1], tip[0], tip[1], alpha(C[a[1]], 0.25), 7, 14);
      arrowPx(c, o[0], o[1], tip[0], tip[1], C[a[1]], n === state.col ? 3.6 : 2.8, 12);
      const dx = tip[0] - o[0], dy = tip[1] - o[1], dl = Math.hypot(dx, dy) || 1;
      const lx = Math.max(r.x0 + 6, Math.min(r.x1 - 6, tip[0] + dx / dl * 16)), ly = Math.max(r.y0 + 12, Math.min(r.y1 - 12, tip[1] + dy / dl * 16));
      D.haloText(c, a[2] + (F.narrow ? '' : ' ' + pt(w, 2)), lx, ly, C[a[1]], dx >= 0 ? 'left' : 'right', 'middle', fnt(12.5, n === state.col ? 800 : 700));
    });
    D.ball(c, o[0], o[1], 4, C.text);
    c.restore();
    // 角落
    const rk = L.rank3(M);
    let msg;
    if (s > 0) msg = 'det = ' + tr(det, 2) + T('：體積 × ', ': volume × ') + tr(det, 2);
    else if (s < 0) msg = 'det = ' + tr(det, 2) + T('：翻面，體積 × ', ': flipped, volume × ') + tr(-det, 2);
    else msg = 'det = 0' + (rk === 2 ? T('：壓成一個平面', ': flattened into a plane') : rk === 1 ? T('：壓成一條線', ': squashed onto a line') : T('：壓成一點', ': squashed to a point'));
    D.pill(c, msg, r.x0 + 12, r.y0 + 24, s < 0 ? C['lt-neg'] : C.text, 'left', fnt(13, 700));
    if (state.t < 1) D.pill(c, 't = ' + num(state.t, 2), r.x1 - 12, r.y0 + 24, C.accent, 'right', fnt(12.5, 700));
    D.haloText(c, T('拖曳轉動視角', 'Drag to turn the view'), r.x0 + 12, r.y1 - 10, C.muted, 'left', 'bottom', fnt(11.5));
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
    if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); } catch (e) { el.textContent = tex; } }
    else el.textContent = tex;
  }
  function eigText(e) {
    if (e.kind === 'distinct') return tr(e.vals[0], 3) + T('、', ', ') + tr(e.vals[1], 3);
    if (e.kind === 'repeated') return tr(e.vals[0], 3) + T('（重根）', ' (repeated)');
    if (e.kind === 'scalar') return tr(e.vals[0], 3) + T('（每個方向）', ' (every direction)');
    return tr(e.re, 3) + ' ± ' + tr(e.im, 3) + 'i';
  }
  function oriText(s) { return s > 0 ? T('不翻面', 'kept') : s < 0 ? T('翻面', 'flipped') : T('壓扁', 'flattened'); }
  function updateReadouts() {
    if (state.mode === 'm2') {
      const q = Q2(), A = q.A, s = sgn(q.det);
      setHTML('rDet', num(q.det, 3));
      setHTML('rArea', '× ' + num(Math.abs(q.det), 3));
      setHTML('rOri', oriText(s));
      setHTML('rTr', num(q.tr, 3));
      setHTML('rEig', eigText(q.eig));
      setHTML('rSig', num(q.sig[0], 3) + T('、', ', ') + num(q.sig[1], 3));
      setHTML('rAx', pt(q.p.y, 2));
      setHTML('rAng', q.p.ang == null ? '—' : num(q.p.ang, 1) + '°');
      setEq('rEq', 'A = ' + L.matTex(A) + ',\\quad \\det A = ' + txp(A[0][0], 2) + '\\cdot' + txp(A[1][1], 2) + ' - ' + txp(A[0][1], 2) + '\\cdot' + txp(A[1][0], 2) + ' = ' + tx(q.det, 3));
      const x = state.x, y = q.p.y;
      let t2 = 'A\\mathbf x = ' + L.matTex(A) + '\\begin{bmatrix}' + tx(x[0], 2) + '\\\\' + tx(x[1], 2) + '\\end{bmatrix} = \\begin{bmatrix}' + tx(y[0], 3) + '\\\\' + tx(y[1], 3) + '\\end{bmatrix}';
      if (q.aligned) t2 += ' \\approx ' + tx(q.p.lambda, 3) + '\\,\\mathbf x';
      setEq('rEq2', t2);
    } else {
      const q = Q3(), s = sgn(q.det);
      setHTML('rDet', num(q.det, 3));
      setHTML('rVol', '× ' + num(Math.abs(q.det), 3));
      setHTML('rOri', oriText(s));
      setHTML('rRank', String(q.rank));
      setEq('rEq', 'A = ' + L.matTex(q.A));
      setEq('rEq2', '\\det A = A\\mathbf i \\cdot (A\\mathbf j \\times A\\mathbf k) = ' + tx(q.det, 3));
    }
    setHTML('status', statusText());
  }
  function statusText() {
    if (state.mode === 'm2') {
      if (state.chal) return T('拖曳 i、j 的尖端（或調 a、b、c、d），讓藍紫色平行四邊形和小旗子蓋住橘色虛線；放開才判定。', 'Drag the tips of i and j (or set a, b, c, d) until the parallelogram and the flag cover the dashed orange shape; judged when you let go.');
      const q = Q2(), s = sgn(q.det);
      if (q.aligned) return T('x 和 A x 在同一條直線上：x 是特徵向量，A x = λ x，λ = ', 'x and Ax lie on one line: x is an eigenvector, Ax = λx with λ = ') + tr(q.p.lambda, 3) + T('。', '.');
      if (s === 0) return T('行列式是 0：整個平面被壓到一條線（或一點）上，沒有辦法還原，沒有反矩陣。', 'The determinant is 0: the whole plane is squashed onto a line (or a point), so the map cannot be undone and there is no inverse.');
      if (s < 0) return T('行列式是負的：平面被翻面，小旗子變成鏡子裡的樣子；面積變成 |det| 倍。', 'The determinant is negative: the plane is flipped and the flag is mirrored; areas are multiplied by |det|.');
      if (q.eig.kind === 'complex') return T('判別式 tr² − 4 det < 0：沒有實數特徵值，每一個方向都被轉走了。', 'tr² − 4 det < 0: no real eigenvalues, so every direction gets turned.');
      return T('每一格方格都變成同樣的平行四邊形，所以任何圖形的面積都乘上 det A。拖曳紫色的點找特徵向量。', 'Every grid square becomes the same parallelogram, so every area is multiplied by det A. Drag the purple dot to hunt for eigenvectors.');
    }
    const q = Q3(), s = sgn(q.det);
    if (s === 0) return q.rank === 2 ? T('三個行向量在同一個平面上：立方體被壓成一片，體積 0。', 'The three columns lie in one plane: the cube is flattened and its volume is 0.')
      : T('三個行向量都在同一條直線上（或是 0）：立方體被壓成一條線，體積 0。', 'All three columns lie on one line (or are 0): the cube is squashed onto a line and its volume is 0.');
    if (s < 0) return T('行列式是負的：i、j、k 的像變成左手系，空間被翻面（像照鏡子）。', 'The determinant is negative: the images of i, j, k form a left-handed set — space is mirrored.');
    return T('單位立方體變成三個行向量張成的平行六面體，體積就是 det A。', 'The unit cube becomes the parallelepiped spanned by the three columns, and its volume is det A.');
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
    } else S.tone({ freq: 523.25, dur: 0.12, type: 'triangle', gain: 0.2 });
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
  /** 行列式（畫面上的矩陣）變號時發聲：翻面是下滑的兩個音，壓扁是一個低音，翻回來是上升的兩個音；探針對齊特徵向量時亮一聲 */
  function feedbackSound() {
    const M = Mt(), s = sgn(state.mode === 'm2' ? L.det2(M) : L.det3(M));
    const S = sound();
    if (state.lastSign != null && s !== state.lastSign && S) {
      if (s === 0) S.tone({ freq: 293.66, dur: 0.12, type: 'triangle', gain: 0.16 });
      else if (s < 0) { S.tone({ freq: 587.33, dur: 0.09, type: 'triangle', gain: 0.15 }); S.tone({ freq: 440, dur: 0.12, type: 'triangle', gain: 0.15, delay: 0.08 }); }
      else { S.tone({ freq: 440, dur: 0.09, type: 'triangle', gain: 0.15 }); S.tone({ freq: 587.33, dur: 0.12, type: 'triangle', gain: 0.15, delay: 0.08 }); }
    }
    state.lastSign = s;
    const al = state.mode === 'm2' && state.t === 1 && Q2().aligned;
    if (al && !state.lastAlign && S) { S.tone({ freq: 783.99, dur: 0.14, type: 'sine', gain: 0.2 }); S.tone({ freq: 1046.5, dur: 0.2, type: 'sine', gain: 0.16, delay: 0.09 }); }
    state.lastAlign = al;
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function emitNow() {
    if (state.mode === 'm2') {
      const q = Q2();
      emit('m2', { M: copy(q.A), det: q.det, tr: q.tr, kind: q.eig.kind, x: state.x.slice(), y: q.p.y, nx: q.p.nx, ny: q.p.ny, lambda: q.p.lambda, sin: q.p.sin, chal: !!state.chal });
    } else {
      const q = Q3();
      emit('m3', { M: copy(q.A), det: q.det, rank: q.rank });
    }
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  const lab = $('lab');
  const el2 = { a: [$('ma'), 0, 0], b: [$('mb'), 0, 1], c: [$('mc'), 1, 0], d: [$('md'), 1, 1] };
  const elX = [$('px'), $('py')];
  const el3 = [$('cx'), $('cy'), $('cz')];
  const elT = $('tt');
  function readAll() {
    Object.keys(el2).forEach(function (k) { const e = el2[k]; state.A2[e[1]][e[2]] = val(e[0]); });
    state.x = [val(elX[0]), val(elX[1])];
    el3.forEach(function (e, i) { state.A3[i][state.col] = val(e); });
    state.t = val(elT);
  }
  function refreshOutputs() {
    Object.keys(el2).forEach(function (k) { const e = el2[k]; $(e[0].id + 'o').textContent = tr(state.A2[e[1]][e[2]], 2); });
    elX.forEach(function (e, i) { $(e.id + 'o').textContent = tr(state.x[i], 2); });
    el3.forEach(function (e, i) { $(e.id + 'o').textContent = tr(state.A3[i][state.col], 2); });
    $('tto').textContent = num(state.t, 2);
  }
  function changed(final) {
    readAll();
    refreshOutputs(); updateReadouts(); feedbackSound(); requestDraw();
    if (final) { emitNow(); judgeChal(); }
  }
  Object.keys(el2).map(function (k) { return el2[k][0]; }).concat(elX, el3, [elT]).forEach(function (e) {
    e.addEventListener('input', function () { if (!applying) { if (e === elT) stopPlay(); changed(false); } });
    e.addEventListener('change', function () { if (!applying) changed(true); });
  });
  function setSlider(e, v) {
    applying = true;
    if (window.LabNum) window.LabNum.set(e, v); else e.value = v;
    applying = false;
  }
  function load2(M) { Object.keys(el2).forEach(function (k) { const e = el2[k]; setSlider(e[0], M[e[1]][e[2]]); }); }
  function loadCol() { el3.forEach(function (e, i) { setSlider(e, state.A3[i][state.col]); }); }
  function setT1() { if (state.t !== 1) { stopPlay(); setSlider(elT, 1); state.t = 1; } }
  $('gridC').addEventListener('change', function () { state.showGrid = $('gridC').checked; requestDraw(); });
  $('circC').addEventListener('change', function () { state.showCirc = $('circC').checked; requestDraw(); });
  $('eigC').addEventListener('change', function () { state.showEig = $('eigC').checked; requestDraw(); });
  document.querySelectorAll('[data-p2]').forEach(function (b) {
    b.addEventListener('click', function () { setT1(); load2(PRE2[b.getAttribute('data-p2')]); changed(true); });
  });
  document.querySelectorAll('[data-p3]').forEach(function (b) {
    b.addEventListener('click', function () { setT1(); state.A3 = copy(PRE3[b.getAttribute('data-p3')]); loadCol(); changed(true); });
  });
  function setCol(k) {
    state.col = k;
    document.querySelectorAll('.cols button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-col') === k)); });
    loadCol(); refreshOutputs(); requestDraw();
  }
  document.querySelectorAll('.cols button').forEach(function (b) { b.addEventListener('click', function () { setCol(+b.getAttribute('data-col')); }); });
  function setMode(m) {
    if (m === state.mode) return;
    if (state.chal) quitChal(true);
    stopPlay();
    if (m === 'm2' && view3) setView('2d');
    state.mode = m;
    lab.setAttribute('data-mode', m);
    document.querySelectorAll('.modes button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === m)); });
    state.lastSign = null; state.lastAlign = false;
    for (const id in eqKey) delete eqKey[id];
    updateReadouts(); feedbackSound(); requestDraw();
    emitNow();
  }
  document.querySelectorAll('.modes button').forEach(function (b) { b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); }); });
  $('clear').addEventListener('click', function () {
    if (state.chal) quitChal(true);
    stopPlay();
    state.log = []; state.streak = []; state.round = 0; lastChal = null;
    load2(DEF2); setSlider(elX[0], DEFX[0]); setSlider(elX[1], DEFX[1]);
    state.A3 = copy(DEF3); loadCol(); setSlider(elT, 1);
    state.yaw = YAW0; state.pitch = PITCH0;
    if (view3) view3.resetCamera();
    setChalMsg(''); renderLog();
    state.lastSign = null; state.lastAlign = false;
    changed(true);
    const S = sound(); if (S) S.tone({ freq: 392, dur: 0.1, type: 'triangle', gain: 0.14 });
  });
  $('resetCam').addEventListener('click', function () {
    state.yaw = YAW0; state.pitch = PITCH0;
    if (view3) view3.resetCamera();
    requestDraw();
  });

  // ---------- 播放變形 ----------
  let playRaf = 0;
  function stopPlay() {
    if (playRaf) cancelAnimationFrame(playRaf);
    playRaf = 0;
    if (state.playing) { state.playing = false; $('play').textContent = T('播放變形', 'Play the change'); }
  }
  $('play').addEventListener('click', function () {
    if (state.playing) { stopPlay(); return; }
    const dur = reducedMotion ? 1 : 1800;
    const t0 = performance.now();
    state.playing = true;
    $('play').textContent = T('停止', 'Stop');
    state.lastSign = null;
    const step = function (now) {
      const u = Math.min(1, (now - t0) / dur), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      setSlider(elT, Math.round(e * 100) / 100);
      state.t = val(elT);
      $('tto').textContent = num(state.t, 2);
      feedbackSound(); requestDraw();
      if (u < 1) playRaf = requestAnimationFrame(step);
      else { playRaf = 0; stopPlay(); changed(true); }
    };
    setSlider(elT, 0); state.t = 0; feedbackSound();
    playRaf = requestAnimationFrame(step);
  });

  // ---------- 在圖上拖曳 ----------
  let drag = null;   // { id, what, px, py }
  function posOf(ev) { const rc = cv.getBoundingClientRect(); return { px: ev.clientX - rc.left, py: ev.clientY - rc.top }; }
  function near(px, py, P, R) { return Math.hypot(F.X(P[0]) - px, F.Y(P[1]) - py) <= R; }
  function snap(v, s) { return Math.round(v / s) * s; }
  function clampv(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function hit2(px, py, R) {
    const A = state.A2;
    if (near(px, py, [A[0][0], A[1][0]], R)) return 'i';
    if (near(px, py, [A[0][1], A[1][1]], R)) return 'j';
    if (!state.chal && near(px, py, state.x, R)) return 'x';
    return null;
  }
  function dragTo(what, px, py) {
    const x = F.ux(px), y = F.uy(py);
    if (what === 'i') { setSlider(el2.a[0], clampv(snap(x, 0.1), -3, 3)); setSlider(el2.c[0], clampv(snap(y, 0.1), -3, 3)); }
    else if (what === 'j') { setSlider(el2.b[0], clampv(snap(x, 0.1), -3, 3)); setSlider(el2.d[0], clampv(snap(y, 0.1), -3, 3)); }
    else if (what === 'x') { setSlider(elX[0], clampv(snap(x, 0.05), -4, 4)); setSlider(elX[1], clampv(snap(y, 0.05), -4, 4)); }
    changed(false);
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (!F) return;
    const p = posOf(ev);
    let what;
    if (state.mode === 'm3') what = 'rot';
    else {
      const touch = ev.pointerType === 'touch' || ev.pointerType === 'pen';
      what = hit2(p.px, p.py, touch ? 22 : 14);
      if (!what) return;
      if (what !== 'x') setT1();
    }
    ev.preventDefault();
    drag = { id: ev.pointerId, what: what, px: p.px, py: p.py, turned: 0 };
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!F) return;
    const p = posOf(ev);
    if (!drag) {
      cv.style.cursor = state.mode === 'm3' ? 'grab' : hit2(p.px, p.py, 14) ? 'grab' : 'default';
      return;
    }
    if (drag.id !== ev.pointerId) return;
    cv.style.cursor = 'grabbing';
    if (drag.what === 'rot') {
      const dx = p.px - drag.px, dy = p.py - drag.py;
      drag.px = p.px; drag.py = p.py; drag.turned += Math.abs(dx) + Math.abs(dy);
      state.yaw = (state.yaw - dx * 0.45) % 360;
      state.pitch = clampv(state.pitch + dy * 0.35, -80, 85);
      requestDraw();
      return;
    }
    dragTo(drag.what, p.px, p.py);
  });
  function endDrag(ev) {
    if (!drag || drag.id !== ev.pointerId) return;
    const w = drag.what; drag = null;
    cv.style.cursor = state.mode === 'm3' ? 'grab' : 'default';
    if (w === 'rot') return;
    changed(true);
    emit('drag', { what: w });
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // ---------- 鍵盤 ----------
  let kb = null;
  if (window.LabKeys) {
    const step = function (e, cur, dv, lo, hi) { setSlider(e, clampv(Math.round((cur + dv) * 100) / 100, lo, hi)); };
    const colName = function () { return T('第 ' + (state.col + 1) + ' 行', 'column ' + (state.col + 1)); };
    kb = window.LabKeys.attach(cv, {
      label: T('線性變換畫布。Enter 切換要移動的東西（平面：i 的尖端、j 的尖端、探針 x；空間：視角、目前這一行），方向鍵移動，Shift 移得更多。',
        'Linear transformation canvas. Enter picks what to move (plane: the tip of i, the tip of j, the probe x; space: the view, the current column); the arrow keys move it, Shift for bigger steps.'),
      items: [{
        name: function () { return state.mode === 'm2' ? T('i 的尖端', 'tip of i') : T('視角', 'view'); },
        move: function (dx, dy, big) {
          if (state.mode === 'm3') { state.yaw = (state.yaw - dx * (big ? 15 : 5)) % 360; state.pitch = clampv(state.pitch + dy * (big ? 15 : 5), -80, 85); requestDraw(); return true; }
          setT1(); const A = state.A2;
          if (dx) step(el2.a[0], A[0][0], dx * (big ? 0.5 : 0.1), -3, 3); if (dy) step(el2.c[0], A[1][0], dy * (big ? 0.5 : 0.1), -3, 3);
          changed(true); return true;
        },
        describe: function () { return state.mode === 'm2' ? 'i ↦ ' + pt([state.A2[0][0], state.A2[1][0]], 2) : T('視角 ', 'view ') + Math.round(state.yaw) + '°, ' + Math.round(state.pitch) + '°'; }
      }, {
        name: function () { return state.mode === 'm2' ? T('j 的尖端', 'tip of j') : colName() + T(' 的 x、y', ': x and y'); },
        move: function (dx, dy, big) {
          if (state.mode === 'm3') { if (dx) step(el3[0], state.A3[0][state.col], dx * (big ? 0.5 : 0.1), -3, 3); if (dy) step(el3[1], state.A3[1][state.col], dy * (big ? 0.5 : 0.1), -3, 3); changed(true); return true; }
          setT1(); const A = state.A2;
          if (dx) step(el2.b[0], A[0][1], dx * (big ? 0.5 : 0.1), -3, 3); if (dy) step(el2.d[0], A[1][1], dy * (big ? 0.5 : 0.1), -3, 3);
          changed(true); return true;
        },
        describe: function () { return state.mode === 'm2' ? 'j ↦ ' + pt([state.A2[0][1], state.A2[1][1]], 2) : colName() + ' ' + pt(L.col(state.A3, state.col), 2); }
      }, {
        name: function () { return state.mode === 'm2' ? T('探針 x', 'probe x') : colName() + T(' 的 z', ': z'); },
        move: function (dx, dy, big) {
          if (state.mode === 'm3') { const v = dy || dx; if (!v) return false; step(el3[2], state.A3[2][state.col], v * (big ? 0.5 : 0.1), -3, 3); changed(true); return true; }
          if (dx) step(elX[0], state.x[0], dx * (big ? 0.1 : 0.01), -4, 4); if (dy) step(elX[1], state.x[1], dy * (big ? 0.1 : 0.01), -4, 4);
          changed(true); return true;
        },
        describe: function () {
          if (state.mode === 'm3') return colName() + ' ' + pt(L.col(state.A3, state.col), 2);
          const q = Q2();
          return 'x = ' + pt(state.x, 2) + T('，A x = ', ', Ax = ') + pt(q.p.y, 2) + (q.aligned ? T('，是特徵向量', ', an eigenvector') : '');
        }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 挑戰
  // =====================================================================
  const chalMsg = $('chalMsg');
  function setChalMsg(msg, ok) { chalMsg.textContent = msg || ''; chalMsg.classList.toggle('ok', !!ok); }
  function startChal(forced) {
    const chg = forced || L.genChallenge(rand, lastChal);
    if (!chg) { setChalMsg(T('出不了題，請再按一次。', 'Could not make a challenge; please try again.')); return; }
    stopPlay();
    setT1();
    state.round++;
    state.chal = { M: copy(chg.M), t0: performance.now(), round: state.round };
    lastChal = chg;
    setChalMsg(T('第 ' + state.round + ' 題：讓單位正方形和小旗子蓋住橘色虛線（放開才判定）。', 'Challenge ' + state.round + ': make the square and the flag cover the dashed orange shape (judged when you let go).'));
    $('quitChal').hidden = false;
    $('newChal').textContent = T('換一題', 'Another one');
    for (const id in eqKey) delete eqKey[id];
    changed(false);
    if (L.chalHit(state.chal, state.A2)) judgeChal();
  }
  function judgeChal() {
    const chg = state.chal;
    if (!chg || state.mode !== 'm2' || !L.chalHit(chg, state.A2)) return;
    const time = (performance.now() - chg.t0) / 1000;
    state.log.push({ round: chg.round, M: chg.M, time: time });
    state.streak.push(time);
    const last3 = state.streak.length >= 3 ? state.streak.slice(-3).reduce(function (s, x) { return s + x; }, 0) : null;
    state.chal = null;
    $('quitChal').hidden = true;
    $('newChal').textContent = T('出下一題', 'Next challenge');
    setChalMsg(T('對了！A = ', 'Got it! A = ') + matText(chg.M) + T('，用了 ', ', in ') + time.toFixed(1) + T(' 秒。', ' s.'), true);
    chime(true);
    renderLog();
    for (const id in eqKey) delete eqKey[id];
    updateReadouts(); requestDraw();
    emit('challenge', { time: time, streak: state.streak.length, last3: last3 });
    emitNow();
  }
  function quitChal(silent) {
    const chg = state.chal;
    if (!chg) return;
    state.log.push({ round: chg.round, M: null, time: null });
    state.chal = null; state.streak = [];
    $('quitChal').hidden = true;
    $('newChal').textContent = T('出一題', 'New challenge');
    setChalMsg(silent ? '' : T('這題放棄了。答案是 A = ', 'Given up. The answer was A = ') + matText(chg.M) + T('；連續答對重新計算。', '; the streak starts over.'));
    renderLog();
    for (const id in eqKey) delete eqKey[id];
    updateReadouts(); requestDraw();
  }
  $('newChal').addEventListener('click', function () { if (state.chal) quitChal(true); startChal(); });
  $('quitChal').addEventListener('click', function () { quitChal(false); });
  function renderLog() {
    const t = $('log');
    $('logEmpty').hidden = state.log.length > 0;
    if (!state.log.length) { t.innerHTML = ''; return; }
    let h = '<tr><th>' + T('題', '#') + '</th><th>' + T('矩陣', 'matrix') + '</th><th>' + T('秒', 's') + '</th></tr>';
    state.log.slice(-8).reverse().forEach(function (r) {
      h += '<tr><td>' + r.round + '</td><td>' + (r.M ? matText(r.M) : '—') + '</td><td>' + (r.time == null ? T('放棄', 'gave up') : r.time.toFixed(1)) + '</td></tr>';
    });
    t.innerHTML = h;
  }

  // =====================================================================
  // 3D 立體（js/linear-transform-3d.js，空間模式按「3D 立體」時才載入）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    T: T, D: D, L: L, state: state,
    colors: function () { readColors(); return C; },
    matrix: function () { return L.lerpI(state.A3, state.t); },
    num: num, pt: pt, tr: tr,
    yaw0: YAW0, pitch0: PITCH0,
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 投影圖。', 'The 3D graphics context was lost, so the view switched back to the 2D drawing.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.LinearTransform3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.LinearTransform3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/linear-transform-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.LinearTransform3D) throw new Error('linear-transform-3d.js did not load');
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable()) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 立體…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        view3 = window.LinearTransform3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        requestDraw();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      if (view3) { view3.dispose(); view3 = null; }
      stage.classList.remove('is3d');
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resize();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    viewMsg.textContent = T('無法開啟 3D 立體（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 投影圖。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D drawing is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });

  // 給測試用的介面（不影響畫面）
  window.__lt = {
    state: state, Q2: Q2, Q3: Q3, Mt: Mt,
    startChal: function (c) { startChal(c); },
    seed: function (s) { rand = L.rng(s); },
    frame: function () { return F; },
    view3: function () { return view3; }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  setCol(0);
  readAll();
  refreshOutputs();
  renderLog();
  updateSoundButton();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    for (const id in eqKey) delete eqKey[id];
    renderLog(); refreshOutputs(); updateReadouts(); updateSoundButton();
    $('newChal').textContent = state.chal ? T('換一題', 'Another one') : T('出一題', 'New challenge');
    $('play').textContent = state.playing ? T('停止', 'Stop') : T('播放變形', 'Play the change');
    if (view3) view3.onTheme();
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'lang') themeChanged(); });
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  resize();
  updateReadouts();
  feedbackSound();
})();
