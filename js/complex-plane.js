/* complex-plane.js — 「複數平面：乘法是旋轉與伸縮」的畫面與互動（數學計算在 complex-plane-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 四種運算：
 *   加法 z + w：箭頭與平行四邊形；「播放」讓 w 的箭頭滑到 z 的尖端。
 *   乘法 z · w：整張方格紙乘以 z（轉 arg z、伸縮 |z|）；三角形 (0, 1, z) 與 (0, w, zw) 相似；「播放」從 t = 0 動到 1。
 *   次方 z^n：1, z, z^2, …, z^n 沿對數螺線排開；「播放」一步一步乘。
 *   方根：w^n = z 的 n 個根圍成正 n 邊形；「播放」一個一個轉出來。
 * 操作：拖曳 z、w（靠近格子點或單位圓上 15° 的倍數會吸附）、點一下平面把 z 移過去；鍵盤 Enter 切換 z、w，方向鍵移動。
 * 挑戰「找出 z」：一個藏起來的 z 把單位正方形轉過、伸縮過；調 z 讓自己的正方形疊上去。 */
(function () {
  'use strict';
  const M = window.CxCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha;
  const clampv = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  const r6 = function (v) { const w = Math.round(v * 1e6) / 1e6; return w === 0 ? 0 : w; };
  const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const Cx = M.C;

  // ---------- 狀態 ----------
  const state = {
    mode: 'mul', z: Cx(1, 1), w: Cx(2, 0.5), pn: 6, rn: 5,
    showGrid: true, showTri: true, showArc: true,
    t: 1, play: null, log: [],
    chal: null, streak: 0, times: [], round: 0, answered: false,
    drag: null
  };
  let rand = function () { return Math.random(); };
  let applying = false;

  // ---------- 色彩與字 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'cx-z', 'cx-w', 'cx-r', 'cx-grid', 'cx-unit', 'cx-tgt', 'cx-ok', 'cx-bad']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + px + 'px ' + FONT; }

  // ---------- 數字 ----------
  function fmt(v, d) {
    if (v == null || isNaN(v)) return '—';
    if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
    if (Math.abs(v) >= 1e6) { const e = Math.floor(Math.log10(Math.abs(v))); return fmt(v / Math.pow(10, e), 3) + ' × 10^' + e; }
    let s = (Math.round(v * 1e9) / 1e9).toFixed(d == null ? 3 : d);
    if (s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, '');
    if (s === '-0') s = '0';
    return s.replace('-', '−');
  }
  function cfmt(z, d) {
    if (!z || isNaN(z.re) || isNaN(z.im)) return '—';
    if (Math.abs(z.re) >= 1e6 || Math.abs(z.im) >= 1e6) return fmt(z.re, d) + ' + (' + fmt(z.im, d) + ')i';
    return M.fmt(z, d == null ? 3 : d);
  }
  function deg(v) { return isNaN(v) ? '—' : fmt(v, 2) + '°'; }
  function polarText(z) { const r = M.abs(z); return r === 0 ? '0' : fmt(r, 4) + T('，', ', ') + deg(M.argDeg(z)); }
  /** KaTeX 用的 a + bi */
  function ctex(z) { return cfmt(z, 3).replace(/−/g, '-').replace(/ × 10\^(-?\d+)/g, ' \\times 10^{$1}'); }

  // ---------- 計算 ----------
  function result() {
    const z = state.z, w = state.w;
    if (state.mode === 'add') return M.add(z, w);
    if (state.mode === 'mul') return M.mul(z, w);
    if (state.mode === 'pow') return M.powInt(z, state.pn);
    return null;
  }
  function powList() { return M.powers(state.z, state.pn); }
  function rootList() { return M.abs(state.z) === 0 ? [] : M.roots(state.z, state.rn); }
  /** 乘法動畫時的乘數：t = 1 時就是 z */
  function multiplier() { return state.t >= 1 ? state.z : M.partial(state.z, state.t); }

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

  // ---------- 視野（等比例、以 0 為中心附近，跟著內容調整，拖曳與播放時固定） ----------
  let viewCur = null, viewTween = null;
  const CAP = 60;
  function contentPts() {
    const pts = [Cx(1, 0), Cx(-1, 0), Cx(0, 1), Cx(0, -1), state.z];
    if (state.mode === 'add' || state.mode === 'mul') { pts.push(state.w); pts.push(result()); }
    if (state.mode === 'pow') powList().forEach(function (p) { pts.push(p); });
    if (state.mode === 'root') rootList().forEach(function (p) { pts.push(p); });
    if (state.chal && state.chal.z) { pts.push(state.chal.z); pts.push(M.mul(state.chal.z, Cx(1, 1))); pts.push(M.mul(state.chal.z, Cx(0, 1))); }
    if (state.mode === 'mul' && !state.chal) { pts.push(M.mul(state.z, Cx(1, 1))); pts.push(M.mul(state.z, Cx(0, 1))); }
    return pts.filter(function (p) { return isFinite(p.re) && isFinite(p.im) && M.abs(p) <= CAP; });
  }
  function contentBox() {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    contentPts().forEach(function (p) { x0 = Math.min(x0, p.re); x1 = Math.max(x1, p.re); y0 = Math.min(y0, p.im); y1 = Math.max(y1, p.im); });
    x0 = Math.min(x0, 0); y0 = Math.min(y0, 0); x1 = Math.max(x1, 0); y1 = Math.max(y1, 0);
    const span = Math.max(x1 - x0, y1 - y0, 2.6);
    const pad = Math.max(0.16 * span, 0.5);
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
    if (state.drag || state.play) return viewCur;
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
  function viewBox(m) { const e = m || 0; return [invX(PR.x) - e, invX(PR.x + PR.w) + e, invY(PR.y + PR.h) - e, invY(PR.y) + e]; }
  function niceStep(span) {
    if (!(span > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(span)));
    const m = span / e;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e;
  }
  /** 直線 base + s·dir（複數）在視野裡的線段 */
  function clipLine(base, dir, vb) {
    const L = Math.hypot(dir.re, dir.im);
    if (L < 1e-12) return null;
    const ux = dir.re / L, uy = dir.im / L;
    let t0 = -Infinity, t1 = Infinity;
    const lim = [[ux, base.re, vb[0], vb[1]], [uy, base.im, vb[2], vb[3]]];
    for (let k = 0; k < 2; k++) {
      const d = lim[k][0], p = lim[k][1], lo = lim[k][2], hi = lim[k][3];
      if (Math.abs(d) < 1e-12) { if (p < lo || p > hi) return null; continue; }
      let a = (lo - p) / d, b = (hi - p) / d;
      if (a > b) { const t = a; a = b; b = t; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    }
    if (t0 > t1) return null;
    return [[base.re + ux * t0, base.im + uy * t0], [base.re + ux * t1, base.im + uy * t1]];
  }

  // ---------- 畫 ----------
  function draw() {
    const now = performance.now();
    if (!PR) return;
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, cw, ch);
    updateView(now);
    const b = PR, vb = viewBox();
    D.roundRect(c, b.x, b.y, b.w, b.h, 8);
    c.fillStyle = alpha(C.text, D.dark ? 0.03 : 0.022); c.fill();
    c.save();
    D.roundRect(c, b.x, b.y, b.w, b.h, 8); c.clip();
    // 格線（原來的方格紙）
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

    // 乘法：方格紙跟著乘（整數格線 Re = k、Im = k 乘以乘數）
    if (state.mode === 'mul') drawMulGrid(c, vb);
    if (state.chal && state.chal.z) drawTarget(c);

    // 座標軸
    c.strokeStyle = alpha(C.text, 0.5); c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(b.x, snap(Y(0))); c.lineTo(b.x + b.w, snap(Y(0))); c.moveTo(snap(X(0)), b.y); c.lineTo(snap(X(0)), b.y + b.h); c.stroke();
    const yAx = clampv(Y(0), b.y + 12, b.y + b.h - 4), xAx = clampv(X(0), b.x + 4, b.x + b.w - 24);
    for (let g = Math.ceil(vb[0] / st) * st; g <= vb[1]; g += st) {
      if (Math.abs(g) < 1e-9) continue;
      D.haloText(c, fmt(r6(g)), X(g), Math.min(yAx + 3, b.y + b.h - 14), C.muted, 'center', 'top', fnt(10.5));
    }
    for (let g = Math.ceil(vb[2] / st) * st; g <= vb[3]; g += st) {
      if (Math.abs(g) < 1e-9 || Y(g) < b.y + 26) continue; // 最上面一格留給「虛軸」
      D.haloText(c, fmt(r6(g)) + 'i', xAx + 4, Y(g), C.muted, 'left', 'middle', fnt(10.5));
    }
    D.haloText(c, T('實軸', 'Re'), b.x + b.w - 8, yAx - 8, C.text, 'right', 'bottom', fnt(12, 600));
    D.haloText(c, T('虛軸', 'Im'), xAx + 8, b.y + 14, C.text, 'left', 'middle', fnt(12, 600));
    D.haloText(c, '0', X(0) - 4, Y(0) + 4, C.muted, 'right', 'top', fnt(11, 'italic'));
    // 單位圓
    c.strokeStyle = alpha(C['cx-unit'], 0.55); c.lineWidth = 1.4; c.setLineDash([5, 5]);
    c.beginPath(); c.arc(X(0), Y(0), viewCur.s, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);

    const labels = [];
    if (state.mode === 'add') drawAdd(c, labels);
    else if (state.mode === 'mul') drawMul(c, labels);
    else if (state.mode === 'pow') drawPow(c, labels);
    else drawRoot(c, labels);
    placeLabels(c, labels);
    c.restore();
    // 上方的狀態
    let msg = null, mcol = C.text;
    if (state.chal && !state.answered) { msg = T('挑戰：哪一個 z 會把正方形變成灰色那一個？', 'Challenge: which z turns the square into the grey one?'); mcol = C.accent; }
    else if (state.play) { msg = playCaption(); mcol = C['cx-r']; }
    if (msg) D.pill(c, msg, b.x + b.w / 2, b.y + 28, mcol, 'center', fnt(12.5, 700));
    D.pill(c, T('格線間距 ', 'Grid spacing ') + fmt(st), b.x + 8, b.y + b.h - 6, C.muted, 'left', fnt(10.5, 600));
    if (kb && kb.focused()) {
      c.strokeStyle = C.accent; c.lineWidth = 1.5; c.setLineDash([5, 4]);
      D.roundRect(c, b.x + 2, b.y + 2, b.w - 4, b.h - 4, 7); c.stroke(); c.setLineDash([]);
    }
  }
  function playCaption() {
    const p = state.play;
    if (!p) return '';
    if (p.mode === 'mul') return T('乘以 z：轉 ', 'Times z: turning ') + fmt(state.t * (M.argDeg(state.z) || 0), 1) + T('°、伸縮 ', '°, stretching ') + fmt(Math.pow(M.abs(state.z), state.t), 3) + T(' 倍', '×');
    if (p.mode === 'pow') return 'z^' + p.k + ' = ' + cfmt(M.powInt(state.z, p.k), 3);
    if (p.mode === 'root') return T('第 ', 'Root ') + (p.k + 1) + T(' 個根', '');
    return T('w 的箭頭搬到 z 的尖端', 'Moving the arrow w to the tip of z');
  }
  /** 點與標籤 */
  function dot(c, z, col, r, glow) { D.ball(c, X(z.re), Y(z.im), r || 6.5, col, { glow: glow == null ? 0.3 : glow }); }
  function lbl(labels, z, text, col, pri, sup) { labels.push({ x: X(z.re), y: Y(z.im), text: text, col: col, pri: pri || 0, sup: sup }); }
  function placeLabels(c, labels) {
    // 依優先順序放標籤；每個標籤試幾個方向，避開已放的標籤
    const boxes = [];
    labels.sort(function (a, b2) { return b2.pri - a.pri; }).forEach(function (L) {
      c.font = fnt(11.5, 700);
      const w = c.measureText(L.text).width + 12, h = 18;
      const cands = [[10, -10 - h], [10, 8], [-10 - w, -10 - h], [-10 - w, 8], [-w / 2, -16 - h], [-w / 2, 14], [16, -h / 2], [-16 - w, -h / 2]];
      let pos = null;
      for (let k = 0; k < cands.length; k++) {
        const bx = L.x + cands[k][0], by = L.y + cands[k][1];
        if (bx < PR.x + 2 || by < PR.y + 2 || bx + w > PR.x + PR.w - 2 || by + h > PR.y + PR.h - 2) continue;
        if (boxes.some(function (o) { return bx < o.x + o.w && bx + w > o.x && by < o.y + o.h && by + h > o.y; })) continue;
        pos = { x: bx, y: by }; break;
      }
      if (!pos) {
        if (L.pri < 1) return;
        pos = { x: clampv(L.x + 10, PR.x + 4, PR.x + PR.w - w - 4), y: clampv(L.y - 10 - h, PR.y + 4, PR.y + PR.h - h - 4) };
      }
      boxes.push(D.pill(c, L.text, pos.x + w / 2, pos.y + h, L.col, 'center', fnt(11.5, 700)));
    });
  }
  /** 從 0 到 z 的箭頭 */
  function vec(c, from, to, col, w, dash) { D.arrow(c, X(from.re), Y(from.im), X(to.re), Y(to.im), col, w || 2.6, dash ? { dash: dash } : undefined); }
  /** 角度弧：從 a 度到 b 度（以 0 為圓心，半徑 rp 像素） */
  function arc(c, a, b2, rp, col, text) {
    if (!state.showArc || isNaN(a) || isNaN(b2) || Math.abs(b2 - a) < 0.5) return;
    c.strokeStyle = alpha(col, 0.85); c.lineWidth = 1.8;
    c.beginPath();
    const s = -a * M.D2R, e = -b2 * M.D2R;
    c.arc(X(0), Y(0), rp, s, e, b2 > a);
    c.stroke();
    if (text) {
      const mid = (a + b2) / 2 * M.D2R;
      D.haloText(c, text, X(0) + Math.cos(mid) * (rp + 12), Y(0) - Math.sin(mid) * (rp + 12), col, 'center', 'middle', fnt(11, 700));
    }
  }

  function drawAdd(c, labels) {
    const z = state.z, w = state.w, s = M.add(z, w);
    const k = state.play && state.play.mode === 'add' ? state.t : 1;
    const wTip = M.add(w, M.mul(z, Cx(k, 0)));
    // 平行四邊形
    if (k >= 1) {
      c.beginPath(); c.moveTo(X(0), Y(0)); c.lineTo(X(z.re), Y(z.im)); c.lineTo(X(s.re), Y(s.im)); c.lineTo(X(w.re), Y(w.im)); c.closePath();
      c.fillStyle = alpha(C['cx-r'], D.dark ? 0.12 : 0.09); c.fill();
      vec(c, z, s, alpha(C['cx-w'], 0.6), 2, [6, 5]);
      vec(c, w, s, alpha(C['cx-z'], 0.6), 2, [6, 5]);
    } else vec(c, M.mul(z, Cx(k, 0)), wTip, alpha(C['cx-w'], 0.8), 2.4, [6, 5]);
    vec(c, Cx(0, 0), z, C['cx-z'], 2.8);
    vec(c, Cx(0, 0), w, C['cx-w'], 2.8);
    if (k >= 1) vec(c, Cx(0, 0), s, C['cx-r'], 3);
    dot(c, z, C['cx-z'], 7, dragGlow('z')); dot(c, w, C['cx-w'], 7, dragGlow('w'));
    if (k >= 1) dot(c, s, C['cx-r'], 6);
    lbl(labels, z, 'z = ' + cfmt(z), C['cx-z'], 3); lbl(labels, w, 'w = ' + cfmt(w), C['cx-w'], 3);
    if (k >= 1) lbl(labels, s, 'z + w = ' + cfmt(s), C['cx-r'], 4);
  }

  function drawMulGrid(c, vb) {
    if (!state.showGrid) return;
    const m = multiplier(), rm = M.abs(m);
    if (rm < 1e-6) return;
    const R = Math.max(Math.abs(vb[0]), Math.abs(vb[1]), Math.abs(vb[2]), Math.abs(vb[3])) * 1.5;
    const K = Math.min(60, Math.ceil(R / rm) + 1);
    const gcol = C['cx-grid'];
    // 單位正方形的像
    const q0 = Cx(0, 0), q1 = m, q2 = M.mul(m, Cx(1, 1)), q3 = M.mul(m, Cx(0, 1));
    c.beginPath(); c.moveTo(X(q0.re), Y(q0.im)); c.lineTo(X(q1.re), Y(q1.im)); c.lineTo(X(q2.re), Y(q2.im)); c.lineTo(X(q3.re), Y(q3.im)); c.closePath();
    c.fillStyle = alpha(C['cx-z'], D.dark ? 0.2 : 0.14); c.fill();
    c.strokeStyle = alpha(C['cx-z'], 0.8); c.lineWidth = 1.8; c.stroke();
    if (rm * viewCur.s < 5) return; // 格子太密就不畫
    c.lineWidth = 1;
    for (let k = -K; k <= K; k++) {
      const strong = k === 0;
      c.strokeStyle = alpha(gcol, strong ? 0.75 : (D.dark ? 0.32 : 0.28));
      c.lineWidth = strong ? 1.8 : 1;
      // Re = k 的像：k·m + s·(i m)
      const s1 = clipLine(M.mul(m, Cx(k, 0)), M.mul(m, Cx(0, 1)), vb);
      const s2 = clipLine(M.mul(m, Cx(0, k)), m, vb);
      c.beginPath();
      if (s1) { c.moveTo(X(s1[0][0]), Y(s1[0][1])); c.lineTo(X(s1[1][0]), Y(s1[1][1])); }
      if (s2) { c.moveTo(X(s2[0][0]), Y(s2[0][1])); c.lineTo(X(s2[1][0]), Y(s2[1][1])); }
      c.stroke();
    }
  }
  function drawTarget(c) {
    const z = state.chal.z;
    const q1 = z, q2 = M.mul(z, Cx(1, 1)), q3 = M.mul(z, Cx(0, 1));
    c.save();
    c.beginPath(); c.moveTo(X(0), Y(0)); c.lineTo(X(q1.re), Y(q1.im)); c.lineTo(X(q2.re), Y(q2.im)); c.lineTo(X(q3.re), Y(q3.im)); c.closePath();
    c.fillStyle = alpha(C['cx-tgt'], D.dark ? 0.22 : 0.16); c.fill();
    c.strokeStyle = C['cx-tgt']; c.lineWidth = 2.2; c.setLineDash([7, 5]); c.stroke(); c.setLineDash([]);
    // 「1 的像」用空心圈標出
    c.strokeStyle = C['cx-tgt']; c.lineWidth = 2.2;
    c.beginPath(); c.arc(X(q1.re), Y(q1.im), 8, 0, Math.PI * 2); c.stroke();
    c.restore();
  }
  function drawMul(c, labels) {
    const z = state.z, w = state.w, m = multiplier(), mw = M.mul(m, w);
    const one = Cx(1, 0);
    // 相似三角形 (0, 1, z) 與 (0, w, zw)
    if (state.showTri && !state.chal) {
      const tri = function (a, b2, col) {
        c.beginPath(); c.moveTo(X(0), Y(0)); c.lineTo(X(a.re), Y(a.im)); c.lineTo(X(b2.re), Y(b2.im)); c.closePath();
        c.fillStyle = alpha(col, D.dark ? 0.16 : 0.12); c.fill();
        c.strokeStyle = alpha(col, 0.7); c.lineWidth = 1.6; c.stroke();
      };
      tri(one, m, C['cx-z']);
      tri(w, mw, C['cx-w']);
    }
    // 角度
    const az = M.argDeg(m), aw = M.argDeg(w);
    arc(c, 0, az, 26, C['cx-z'], isNaN(az) ? '' : 'θ');
    if (!state.chal) {
      arc(c, aw, aw + az, 40, C['cx-r'], '');
      vec(c, Cx(0, 0), w, C['cx-w'], 2.4);
      vec(c, Cx(0, 0), mw, C['cx-r'], 2.8);
      // w 走到 zw 的路徑（對數螺線）
      c.strokeStyle = alpha(C['cx-r'], 0.55); c.lineWidth = 1.6; c.setLineDash([4, 4]);
      c.beginPath();
      for (let i = 0; i <= 48; i++) { const p = M.mul(M.partial(state.z, state.t * i / 48), w); if (i) c.lineTo(X(p.re), Y(p.im)); else c.moveTo(X(p.re), Y(p.im)); }
      c.stroke(); c.setLineDash([]);
    }
    vec(c, Cx(0, 0), m, C['cx-z'], 2.8);
    dot(c, one, C.muted, 4.5, 0);
    lbl(labels, one, '1', C.muted, 1);
    dot(c, z, C['cx-z'], 7, dragGlow('z'));
    lbl(labels, z, 'z = ' + cfmt(z), C['cx-z'], 3);
    if (!state.chal) {
      dot(c, w, C['cx-w'], 7, dragGlow('w'));
      lbl(labels, w, 'w = ' + cfmt(w), C['cx-w'], 3);
      if (state.t >= 1) { dot(c, mw, C['cx-r'], 6.5); lbl(labels, mw, 'zw = ' + cfmt(mw), C['cx-r'], 4); }
      else dot(c, mw, C['cx-r'], 5.5, 0.1);
    }
  }
  function drawPow(c, labels) {
    const n = state.pn, z = state.z;
    const kMax = state.play && state.play.mode === 'pow' ? state.play.k : n;
    const frac = state.play && state.play.mode === 'pow' ? state.play.frac : 1;
    const L = powList();
    // 相似三角形 (0, z^k, z^{k+1})：交錯塗色
    if (state.showTri && n <= 60) {
      for (let k = 0; k < Math.min(kMax, n); k++) {
        const a = L[k], b2 = L[k + 1];
        if (M.abs(a) > CAP * 3 || M.abs(b2) > CAP * 3) break;
        c.beginPath(); c.moveTo(X(0), Y(0)); c.lineTo(X(a.re), Y(a.im)); c.lineTo(X(b2.re), Y(b2.im)); c.closePath();
        c.fillStyle = alpha(k % 2 ? C['cx-z'] : C['cx-r'], D.dark ? 0.1 : 0.075); c.fill();
      }
    }
    // 螺線：z^k 乘以 partial(z, s)
    c.lineWidth = 2.2; c.lineCap = 'round';
    for (let k = 0; k < Math.min(kMax + 1, n); k++) {
      const last = k === kMax;
      const f = last ? frac : 1;
      if (last && f <= 0) break;
      if (M.abs(L[k]) > CAP * 3) break;
      const u = n > 1 ? k / (n - 1) : 1;
      c.strokeStyle = alpha(D.mix(C['cx-z'], C['cx-r'], u), 0.85);
      c.beginPath();
      for (let i = 0; i <= 24; i++) { const p = M.mul(L[k], M.partial(z, f * i / 24)); if (i) c.lineTo(X(p.re), Y(p.im)); else c.moveTo(X(p.re), Y(p.im)); }
      c.stroke();
      if (last) break;
    }
    const az = M.argDeg(z);
    arc(c, 0, az, 26, C['cx-z'], isNaN(az) ? '' : 'θ');
    const show = Math.min(kMax, n);
    for (let k = 0; k <= show; k++) {
      if (M.abs(L[k]) > CAP * 3) break;
      const u = n ? k / n : 1;
      const col = D.mix(C['cx-z'], C['cx-r'], u);
      if (k === 0) { dot(c, L[0], C.muted, 4.5, 0); continue; }
      dot(c, L[k], col, k === n ? 6.5 : n > 30 ? 3 : 4.5, k === n ? 0.3 : 0);
      if (n <= 12 && k > 1 && k < n) lbl(labels, L[k], 'z' + supTxt(k), col, 0);
    }
    lbl(labels, L[0], '1', C.muted, 1);
    lbl(labels, z, 'z = ' + cfmt(z), C['cx-z'], 3);
    dot(c, z, C['cx-z'], 7, dragGlow('z'));
    if (kMax >= n) {
      const zn = L[n];
      if (M.abs(zn) <= CAP * 3) lbl(labels, zn, 'z' + supTxt(n) + ' = ' + cfmt(zn), C['cx-r'], 4);
    }
  }
  /** 標籤裡的上標：畫布不能用 Unicode 上標字元，改寫成 ^n */
  function supTxt(k) { return '^' + k; }
  function drawRoot(c, labels) {
    const z = state.z, n = state.rn, R = rootList();
    const kMax = state.play && state.play.mode === 'root' ? state.play.k : n - 1;
    if (!R.length) {
      dot(c, z, C['cx-z'], 7, dragGlow('z'));
      lbl(labels, z, 'z = 0', C['cx-z'], 3);
      return;
    }
    const rho = M.abs(R[0]);
    // 根所在的圓
    c.strokeStyle = alpha(C['cx-r'], 0.45); c.lineWidth = 1.4;
    c.beginPath(); c.arc(X(0), Y(0), rho * viewCur.s, 0, Math.PI * 2); c.stroke();
    // 正 n 邊形
    if (kMax >= n - 1) {
      c.beginPath();
      R.forEach(function (p, k) { if (k) c.lineTo(X(p.re), Y(p.im)); else c.moveTo(X(p.re), Y(p.im)); });
      c.closePath();
      c.fillStyle = alpha(C['cx-r'], D.dark ? 0.13 : 0.1); c.fill();
      c.strokeStyle = alpha(C['cx-r'], 0.85); c.lineWidth = 2; c.stroke();
    }
    const az = M.argDeg(z);
    arc(c, 0, az, 24, C['cx-z'], isNaN(az) ? '' : 'θ');
    if (!isNaN(az)) arc(c, 0, az / n, 40, C['cx-r'], 'θ/' + n);
    R.forEach(function (p, k) {
      if (k > kMax) return;
      c.strokeStyle = alpha(C['cx-r'], 0.55); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(X(0), Y(0)); c.lineTo(X(p.re), Y(p.im)); c.stroke();
    });
    vec(c, Cx(0, 0), z, C['cx-z'], 2.6);
    R.forEach(function (p, k) {
      if (k > kMax) return;
      dot(c, p, C['cx-r'], n > 12 ? 4 : 5.5, 0.2);
      if (n <= 8) lbl(labels, p, 'w' + k + (k === 0 ? ' = ' + cfmt(p) : ''), C['cx-r'], k === 0 ? 2 : 0);
    });
    dot(c, z, C['cx-z'], 7, dragGlow('z'));
    lbl(labels, z, 'z = ' + cfmt(z), C['cx-z'], 3);
  }
  function dragGlow(which) { return state.drag && state.drag.kind === which ? 0.65 : 0.35; }

  // ---------- 讀數 ----------
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  let eqKey = null;
  function updateReadouts() {
    const z = state.z, w = state.w, hide = !!(state.chal && !state.answered);
    setHTML('rZ', cfmt(z, 4));
    setHTML('rZp', polarText(z));
    const useW = state.mode === 'add' || state.mode === 'mul';
    document.querySelectorAll('.rw').forEach(function (e) { e.hidden = !useW || !!state.chal; });
    if (useW) { setHTML('rW', cfmt(w, 4)); setHTML('rWp', polarText(w)); }
    let lab = T('結果', 'Result'), res = '—', resP = '—';
    if (state.chal) { lab = T('挑戰', 'Challenge'); res = hide ? T('（藏起來了）', '(hidden)') : cfmt(state.chal.z, 3); resP = hide ? '—' : polarText(state.chal.z); }
    else if (state.mode === 'add') { lab = 'z + w'; const s = result(); res = cfmt(s, 4); resP = polarText(s); }
    else if (state.mode === 'mul') { lab = 'zw'; const s = result(); res = cfmt(s, 4); resP = polarText(s); }
    else if (state.mode === 'pow') { lab = 'z<sup>' + state.pn + '</sup>'; const s = result(); res = cfmt(s, 4); resP = polarText(s); }
    else {
      lab = T('n 次方根', 'n-th roots');
      const R = rootList();
      res = !R.length ? T('z = 0：只有 0', 'z = 0: only 0') : R.length <= 6 ? R.map(function (p) { return cfmt(p, 3); }).join('<br>') : cfmt(R[0], 3) + T(' 等 ', ' and ') + (R.length - 1) + T(' 個', ' more');
      resP = R.length ? fmt(M.abs(R[0]), 4) + T('，間隔 ', ', spaced ') + fmt(360 / state.rn, 3) + '°' : '—';
    }
    setHTML('rResL', lab); setHTML('rRes', res); setHTML('rResP', resP);
    // 式子
    const k2 = JSON.stringify([state.mode, z, w, state.pn, state.rn, !!state.chal, hide, window.LabSettings ? LabSettings.get('lang') : '']);
    if (eqKey !== k2) {
      eqKey = k2;
      let tex = '';
      const r = M.abs(z), th = M.argDeg(z);
      const pz = r === 0 ? '0' : fmt(r, 3).replace(/−/g, '-') + '\\,(\\cos ' + fmt(th, 2).replace(/−/g, '-') + '^\\circ + i\\sin ' + fmt(th, 2).replace(/−/g, '-') + '^\\circ)';
      if (state.chal) tex = 'z = ' + (hide ? '\\ ?' : ctex(state.chal.z));
      else if (state.mode === 'add') tex = '(' + ctex(z) + ') + (' + ctex(w) + ') = ' + ctex(result());
      else if (state.mode === 'mul') {
        const s = result();
        tex = '|zw| = ' + fmt(M.abs(z), 3).replace(/−/g, '-') + ' \\times ' + fmt(M.abs(w), 3).replace(/−/g, '-') + ' = ' + fmt(M.abs(s), 3).replace(/−/g, '-') +
          ',\\quad \\arg(zw) = ' + fmt(M.argDeg(z), 2).replace(/−/g, '-') + '^\\circ + ' + fmt(M.argDeg(w), 2).replace(/−/g, '-') + '^\\circ';
      }
      else if (state.mode === 'pow') tex = 'z^{' + state.pn + '} = ' + (r === 0 ? '0' : fmt(r, 4).replace(/−/g, '-') + '^{' + state.pn + '}(\\cos ' + state.pn + '\\theta + i\\sin ' + state.pn + '\\theta) = ' + ctex(result()));
      else tex = 'w^{' + state.rn + '} = z = ' + pz;
      const el = $('rEq');
      if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); } catch (e) { el.textContent = tex; } }
      else el.textContent = tex;
    }
  }
  function modeNote() {
    const N = {
      add: ['把 w 的箭頭接到 z 的尖端：0、z、z + w、w 圍成平行四邊形。', 'Put the arrow w on the tip of z: 0, z, z + w and w make a parallelogram.'],
      mul: ['乘以 z：整張方格紙繞 0 轉 arg z、伸縮 |z| 倍。三角形 (0, 1, z) 和 (0, w, zw) 相似。', 'Times z: the whole grid turns about 0 by arg z and stretches by |z|. The triangles (0, 1, z) and (0, w, zw) are similar.'],
      pow: ['一直乘以 z：每一步都加上同一個角度、乘上同一個倍數，點排在一條螺線上。', 'Keep multiplying by z: each step adds the same angle and multiplies by the same factor, so the points lie on a spiral.'],
      root: ['w^n = z 的 n 個根：絕對值都是 |z| 的 n 次方根，幅角相差 360°／n，圍成正 n 邊形。', 'The n solutions of w^n = z: all with modulus the n-th root of |z| and angles 360°/n apart, at the corners of a regular n-gon.']
    }[state.mode];
    $('modeNote').textContent = T(N[0], N[1]);
  }

  // ---------- 狀態列 ----------
  function setStatus(t) { $('status').textContent = t || ''; }
  function describe() {
    if (state.chal) return;
    const z = state.z, r = M.abs(z), th = M.argDeg(z);
    if (state.mode === 'add') { setStatus(T('z + w = ', 'z + w = ') + cfmt(result(), 3) + T('：實部、虛部分別相加。', ': add the real parts and the imaginary parts.')); return; }
    if (state.mode === 'mul') {
      if (r === 0) { setStatus(T('z = 0：整個平面縮成一點。', 'z = 0: the whole plane shrinks to a point.')); return; }
      const turn = Math.abs(th) < 1e-9 ? T('不轉', 'no turn') : T('轉 ', 'turn by ') + deg(th);
      const sc = Math.abs(r - 1) < 1e-9 ? T('大小不變', 'same size') : T('放大成 ', 'scale by ') + fmt(r, 3) + T(' 倍', '×');
      setStatus(T('乘以 z = ', 'Times z = ') + cfmt(z, 3) + T('：', ': ') + turn + T('、', ', ') + sc + T('。zw = ', '. zw = ') + cfmt(result(), 3) + T('。', '.'));
      return;
    }
    if (state.mode === 'pow') {
      const zn = result();
      const how = r === 0 ? '' : Math.abs(r - 1) < 1e-9 ? T('|z| = 1，點沿著單位圓走。', '|z| = 1, so the points walk round the unit circle.') : r < 1 ? T('|z| < 1，螺線往內捲。', '|z| < 1, so the spiral winds inwards.') : T('|z| > 1，螺線往外。', '|z| > 1, so the spiral winds outwards.');
      setStatus('z^' + state.pn + ' = ' + cfmt(zn, 3) + T('，幅角是 ', ', argument ') + fmt(state.pn, 0) + ' × ' + fmt(th, 3) + '°' + T('。', '. ') + how + (M.abs(zn) > CAP ? T('（已超出畫面）', ' (off the screen)') : ''));
      return;
    }
    const R = rootList();
    if (!R.length) { setStatus(T('z = 0：w^n = 0 只有 w = 0。', 'z = 0: w^n = 0 only has w = 0.')); return; }
    setStatus(T('z 的 ', 'The ') + state.rn + T(' 個 ', ' ') + state.rn + T(' 次方根都在半徑 ', '-th roots of z lie on the circle of radius ') + fmt(M.abs(R[0]), 4) + T(' 的圓上，相鄰兩個差 ', ', each ') + fmt(360 / state.rn, 3) + T('°，加起來是 0。', '° from the next, and they add up to 0.'));
  }

  // ---------- 控制項 ----------
  const el = { za: $('za'), zb: $('zb'), zr: $('zr'), zt: $('zt'), wa: $('wa'), wb: $('wb'), pn: $('pn'), rn: $('rn') };
  function setSlider(e, v) { applying = true; if (window.LabNum) window.LabNum.set(e, v); else e.value = v; applying = false; }
  function syncZ() {
    setSlider(el.za, r6(state.z.re)); setSlider(el.zb, r6(state.z.im));
    setSlider(el.zr, r6(M.abs(state.z)));
    const th = M.argDeg(state.z);
    if (!isNaN(th)) setSlider(el.zt, r6(th));
  }
  function syncAll() {
    syncZ();
    setSlider(el.wa, r6(state.w.re)); setSlider(el.wb, r6(state.w.im));
    setSlider(el.pn, state.pn); setSlider(el.rn, state.rn);
    refreshOutputs();
  }
  function refreshOutputs() {
    $('zao').textContent = fmt(state.z.re, 4); $('zbo').textContent = fmt(state.z.im, 4);
    $('zro').textContent = fmt(M.abs(state.z), 4);
    const th = M.argDeg(state.z);
    $('zto').textContent = isNaN(th) ? '—' : fmt(th, 3);
    $('wao').textContent = fmt(state.w.re, 4); $('wbo').textContent = fmt(state.w.im, 4);
    $('pno').textContent = String(state.pn); $('rno').textContent = String(state.rn);
  }
  function showPanels() {
    document.querySelectorAll('#modes button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === state.mode)); });
    $('cardW').hidden = !(state.mode === 'add' || state.mode === 'mul') || !!state.chal;
    $('lgW').hidden = !(state.mode === 'add' || state.mode === 'mul');
    $('cardN').hidden = !(state.mode === 'pow' || state.mode === 'root');
    $('pnBox').hidden = state.mode !== 'pow'; $('rnBox').hidden = state.mode !== 'root';
    $('nTitle').textContent = state.mode === 'root' ? T('開幾次方', 'Which root') : T('次方 n', 'Exponent n');
    $('play').textContent = state.play ? T('停止', 'Stop') : T('播放', 'Play');
    modeNote();
  }
  function refresh() { refreshOutputs(); updateReadouts(); describe(); requestDraw(); }
  /** 使用者改了東西（放開滑桿、打完數字、拖完、按鍵、切換）：回報任務 */
  function edited(src) {
    stopPlay(true);
    refresh();
    emitState(src);
  }
  function zFromCart() { state.z = Cx(r6(val(el.za)), r6(val(el.zb))); }
  /** 由極式滑桿算 z；z 的實部、虛部限制在 ±4（畫面的方框）裡，超出時 |z|、arg z 的滑桿在放開後跟著改 */
  function zFromPolar() { const r = val(el.zr), t = val(el.zt); const p = M.polar(r, t); state.z = Cx(r6(clampv(p.re, -4, 4)), r6(clampv(p.im, -4, 4))); }
  ['za', 'zb'].forEach(function (k) {
    el[k].addEventListener('input', function () { if (applying) return; zFromCart(); stopPlay(true); applying = true; if (window.LabNum) { LabNum.set(el.zr, r6(M.abs(state.z))); const th = M.argDeg(state.z); if (!isNaN(th)) LabNum.set(el.zt, r6(th)); } applying = false; refresh(); });
    el[k].addEventListener('change', function () { if (applying) return; zFromCart(); syncZ(); zTone(); edited('slider'); });
  });
  ['zr', 'zt'].forEach(function (k) {
    el[k].addEventListener('input', function () { if (applying) return; zFromPolar(); stopPlay(true); applying = true; if (window.LabNum) { LabNum.set(el.za, state.z.re); LabNum.set(el.zb, state.z.im); } applying = false; refresh(); });
    el[k].addEventListener('change', function () {
      if (applying) return;
      zFromPolar();
      syncZ();
      zTone(); edited('polar');
    });
  });
  ['wa', 'wb'].forEach(function (k) {
    el[k].addEventListener('input', function () { if (applying) return; state.w = Cx(r6(val(el.wa)), r6(val(el.wb))); stopPlay(true); refresh(); });
    el[k].addEventListener('change', function () { if (applying) return; state.w = Cx(r6(val(el.wa)), r6(val(el.wb))); blip(494); edited('slider'); });
  });
  el.pn.addEventListener('input', function () { if (applying) return; state.pn = Math.round(clampv(val(el.pn), 1, 100)); stopPlay(true); refresh(); });
  el.pn.addEventListener('change', function () { if (applying) return; state.pn = Math.round(clampv(val(el.pn), 1, 100)); blip(392 + 4 * state.pn); edited('slider'); });
  el.rn.addEventListener('input', function () { if (applying) return; state.rn = Math.round(clampv(val(el.rn), 2, 24)); stopPlay(true); refresh(); });
  el.rn.addEventListener('change', function () { if (applying) return; state.rn = Math.round(clampv(val(el.rn), 2, 24)); blip(392 + 12 * state.rn); edited('slider'); });
  document.querySelectorAll('#modes button').forEach(function (b) {
    b.addEventListener('click', function () {
      const m = b.getAttribute('data-mode');
      if (m === state.mode) return;
      if (state.chal) quitChal(true);
      state.mode = m; state.t = 1;
      viewCur = null;
      showPanels(); blip(523);
      edited('mode');
    });
  });
  $('showGrid').addEventListener('change', function () { state.showGrid = $('showGrid').checked; requestDraw(); });
  $('showTri').addEventListener('change', function () { state.showTri = $('showTri').checked; requestDraw(); });
  $('showArc').addEventListener('change', function () { state.showArc = $('showArc').checked; requestDraw(); });

  // ---------- 播放 ----------
  function stopPlay(silent) {
    if (!state.play) return;
    state.play = null; state.t = 1;
    $('play').textContent = T('播放', 'Play');
    if (!silent) requestDraw();
  }
  $('play').addEventListener('click', function () {
    if (state.play) { stopPlay(); refresh(); return; }
    const mode = state.mode;
    const dur = reduceMotion.matches ? 1 : mode === 'mul' ? 2200 : mode === 'add' ? 1400 : mode === 'pow' ? Math.min(6000, 450 * state.pn) : Math.min(4000, 380 * state.rn);
    state.play = { mode: mode, t0: performance.now(), dur: dur, k: 0, frac: 0, lastK: -1 };
    state.t = mode === 'mul' || mode === 'add' ? 0 : 1;
    $('play').textContent = T('停止', 'Stop');
    if (mode === 'mul') setStatus(T('t 從 0 走到 1：方格紙轉過 t·arg z、伸縮 |z| 的 t 次方倍。', 't runs from 0 to 1: the grid turns by t·arg z and stretches by |z| to the power t.'));
    playStep();
  });
  function playStep() {
    const p = state.play;
    if (!p) return;
    const u = clampv((performance.now() - p.t0) / p.dur, 0, 1);
    if (p.mode === 'mul' || p.mode === 'add') {
      state.t = u < 1 ? 0.5 - 0.5 * Math.cos(Math.PI * u) : 1;
      playVoice(state.t);
    } else if (p.mode === 'pow') {
      const x = u * state.pn;
      p.k = Math.min(state.pn, Math.floor(x)); p.frac = u >= 1 ? 1 : x - Math.floor(x);
      if (p.k !== p.lastK) { p.lastK = p.k; powTone(p.k); }
    } else {
      p.k = Math.min(state.rn - 1, Math.floor(u * state.rn));
      if (p.k !== p.lastK) { p.lastK = p.k; blip(523 * Math.pow(2, p.k / state.rn), 'sine', 0.1); }
    }
    requestDraw();
    if (u < 1) { requestAnimationFrame(playStep); return; }
    const mode = p.mode;
    state.play = null; state.t = 1;
    $('play').textContent = T('播放', 'Play');
    chime();
    refresh();
    emit('play', stateData('play', mode));
  }

  // ---------- 記下、全部清除 ----------
  function renderLog() {
    const t = $('log');
    if (!state.log.length) { t.innerHTML = ''; $('logEmpty').hidden = false; return; }
    $('logEmpty').hidden = true;
    let h = '<thead><tr><th>#</th><th>' + T('運算', 'Operation') + '</th><th>z</th><th>' + T('另一個', 'Other') + '</th><th>' + T('結果', 'Result') + '</th></tr></thead><tbody>';
    state.log.forEach(function (r, i) { h += '<tr><td>' + (i + 1) + '</td><td>' + r.op + '</td><td>' + r.z + '</td><td>' + r.o + '</td><td>' + r.res + '</td></tr>'; });
    t.innerHTML = h + '</tbody>';
  }
  $('mark').addEventListener('click', function () {
    if (state.chal && !state.answered) { setStatus(T('挑戰中先不記錄。', 'Not during a challenge.')); return; }
    const op = { add: T('加法', 'add'), mul: T('乘法', 'multiply'), pow: T('次方', 'power'), root: T('方根', 'roots') }[state.mode];
    let o = '—', res;
    if (state.mode === 'add' || state.mode === 'mul') { o = 'w = ' + cfmt(state.w, 3); res = cfmt(result(), 3); }
    else if (state.mode === 'pow') { o = 'n = ' + state.pn; res = cfmt(result(), 3); }
    else { o = 'n = ' + state.rn; const R = rootList(); res = R.length ? cfmt(R[0], 3) + (R.length > 1 ? T(' 等 ', ' and ') + (R.length - 1) + T(' 個', ' more') : '') : '0'; }
    state.log.push({ op: op, z: cfmt(state.z, 3), o: o, res: res });
    if (state.log.length > 40) state.log.shift();
    renderLog(); blip(659, 'sine', 0.1);
    setStatus(T('記下第 ', 'Recorded #') + state.log.length + T(' 組。', '.'));
  });
  $('clear').addEventListener('click', function () {
    stopPlay(true);
    state.log = []; renderLog();
    if (state.chal) quitChal(true);
    state.streak = 0; state.times = []; state.round = 0;
    setChalMsg(''); $('newChal').textContent = T('出一題', 'New problem');
    blip(330); setStatus(T('記錄與挑戰都清除了；z、w 與 n 保留。', 'Records and the challenge are cleared; z, w and n are kept.'));
    refresh();
  });

  // ---------- 畫布操作 ----------
  function evPos(ev) { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  /** 吸附：格子點（含 0.5 的格點）→ 單位圓上 15° 的倍數 → 0.05 */
  function snapZ(x, y, pxTol) {
    const tol = pxTol / viewCur.s;
    const gx = Math.round(x), gy = Math.round(y);
    if (Math.hypot(gx - x, gy - y) < tol) return Cx(gx, gy);
    const r = Math.hypot(x, y);
    if (Math.abs(r - 1) < tol) {
      const a = Math.round(Math.atan2(y, x) / M.D2R / 15) * 15;
      const p = M.polar(1, a);
      if (Math.hypot(p.re - x, p.im - y) < tol) return Cx(r6(p.re), r6(p.im));
    }
    const hx = Math.round(x * 2) / 2, hy = Math.round(y * 2) / 2;
    if (Math.hypot(hx - x, hy - y) < tol * 0.6) return Cx(hx, hy);
    return Cx(r6(clampv(Math.round(x * 20) / 20, -4, 4)), r6(clampv(Math.round(y * 20) / 20, -4, 4)));
  }
  function hitTest(p) {
    if (!viewCur) return null;
    const dz = Math.hypot(p.x - X(state.z.re), p.y - Y(state.z.im));
    const useW = (state.mode === 'add' || state.mode === 'mul') && !state.chal;
    const dw = useW ? Math.hypot(p.x - X(state.w.re), p.y - Y(state.w.im)) : Infinity;
    if (dz <= 18 && dz <= dw) return { kind: 'z' };
    if (dw <= 18) return { kind: 'w' };
    return null;
  }
  let downAt = null;
  cv.addEventListener('pointerdown', function (ev) {
    if (!viewCur) return;
    const p = evPos(ev), h = hitTest(p);
    downAt = { x: p.x, y: p.y, h: h };
    if (h) {
      stopPlay(true);
      state.drag = Object.assign({ moved: false }, h);
      try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 無妨 */ }
      ev.preventDefault();
      requestDraw();
    }
  });
  cv.addEventListener('pointermove', function (ev) {
    const p = evPos(ev);
    if (!state.drag) { const h = hitTest(p); cv.style.cursor = h ? 'grab' : 'crosshair'; return; }
    if (!state.drag.moved && downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) < 4) return;
    state.drag.moved = true;
    const s = snapZ(invX(p.x), invY(p.y), 10);
    const v = Cx(clampv(s.re, -4, 4), clampv(s.im, -4, 4));
    if (state.drag.kind === 'z') { state.z = v; syncZ(); } else { state.w = v; setSlider(el.wa, v.re); setSlider(el.wb, v.im); }
    refresh();
  });
  function endDrag(ev) {
    const dr = state.drag, down = downAt;
    state.drag = null; downAt = null;
    if (!dr) {
      // 在平面上點一下（沒有拖曳）：z 移到那裡
      if (ev && ev.type === 'pointerup' && down && viewCur) {
        const p = evPos(ev);
        if (Math.hypot(p.x - down.x, p.y - down.y) < 6 && p.x >= PR.x && p.x <= PR.x + PR.w && p.y >= PR.y && p.y <= PR.y + PR.h) {
          const s = snapZ(invX(p.x), invY(p.y), 12);
          state.z = Cx(clampv(s.re, -4, 4), clampv(s.im, -4, 4)); syncZ(); zTone();
          edited('tap');
        }
      }
      return;
    }
    if (dr.moved) { if (dr.kind === 'z') zTone(); else blip(494); edited('drag'); }
    else requestDraw();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // ---------- 鍵盤 ----------
  let kb = null;
  if (window.LabKeys) {
    const mover = function (which) {
      return function (dx, dy, big) {
        const st = big ? 0.5 : 0.1;
        const o = which === 'z' ? state.z : state.w;
        const v = Cx(r6(clampv(Math.round((o.re + dx * st) * 1e4) / 1e4, -4, 4)), r6(clampv(Math.round((o.im + dy * st) * 1e4) / 1e4, -4, 4)));
        if (which === 'z') { state.z = v; syncZ(); zTone(); }
        else { if (!(state.mode === 'add' || state.mode === 'mul') || state.chal) return false; state.w = v; setSlider(el.wa, v.re); setSlider(el.wb, v.im); blip(494); }
        edited('key'); return true;
      };
    };
    kb = window.LabKeys.attach(cv, {
      label: T('複數平面畫布。Enter 切換 z 與 w；方向鍵移動 0.1，Shift 移 0.5。', 'Complex plane canvas. Enter switches between z and w; arrow keys move by 0.1, Shift by 0.5.'),
      items: [
        { name: function () { return T('點 z', 'the point z'); }, move: mover('z'), describe: function () { return 'z = ' + cfmt(state.z, 3) + T('，|z| = ', ', |z| = ') + fmt(M.abs(state.z), 3) + T('，arg z = ', ', arg z = ') + deg(M.argDeg(state.z)); } },
        { name: function () { return T('點 w', 'the point w'); }, move: mover('w'), describe: function () { return (state.mode === 'add' || state.mode === 'mul') ? 'w = ' + cfmt(state.w, 3) : T('這個運算沒有用到 w', 'w is not used in this operation'); } }
      ],
      onChange: function () { requestDraw(); }
    });
  }

  // ---------- 挑戰 ----------
  const chalMsg = $('chalMsg');
  function setChalMsg(msg, cls) { chalMsg.textContent = msg || ''; chalMsg.classList.toggle('ok', cls === 'ok'); chalMsg.classList.toggle('bad', cls === 'bad'); }
  function startChal() {
    stopPlay(true);
    const g = M.challenge(rand);
    if (state.mode !== 'mul') { state.mode = 'mul'; }
    state.t = 1;
    state.z = Cx(1, 0);
    state.chal = { z: g.z, r: g.r, deg: g.deg, t0: performance.now() };
    state.answered = false; state.round++;
    viewCur = null;
    syncAll(); showPanels();
    $('submitC').hidden = false; $('quitChal').hidden = false;
    $('newChal').textContent = T('換一題', 'Another one');
    setChalMsg(T('第 ', 'Problem ') + state.round + T(' 題：調 z，讓藍色的正方形疊上灰色的正方形（灰色圓圈是 1 被乘之後的位置），再按「就是這個 z」。', ': adjust z until the blue square covers the grey one (the grey ring is where 1 goes), then press “This z”.'));
    setStatus('');
    blip(523);
    refresh();
  }
  function quitChal(silent) {
    if (!state.chal) return;
    const wasOpen = !state.answered;
    state.chal = null; state.answered = false;
    $('submitC').hidden = true; $('quitChal').hidden = true;
    $('newChal').textContent = T('出一題', 'New problem');
    if (wasOpen) { state.streak = 0; if (!silent) setChalMsg(T('放棄這題，連續答對中斷。', 'Gave up: the streak is broken.')); else setChalMsg(''); }
    viewCur = null;
    showPanels(); refresh();
  }
  $('newChal').addEventListener('click', function () {
    if (state.chal && !state.answered) state.streak = 0;
    startChal();
  });
  $('quitChal').addEventListener('click', function () { quitChal(false); });
  $('submitC').addEventListener('click', function () {
    if (!state.chal || state.answered) return;
    const secs = (performance.now() - state.chal.t0) / 1000;
    const right = M.answerOK(state.z, state.chal.z);
    state.answered = true;
    const ans = cfmt(state.chal.z, 3) + T('（|z| = ', ' (|z| = ') + fmt(state.chal.r, 3) + T('、幅角 ', ', argument ') + fmt(state.chal.deg > 180 ? state.chal.deg - 360 : state.chal.deg, 0) + T('°）', '°)');
    if (right) {
      state.streak++; state.times.push(secs); if (state.times.length > 5) state.times.shift();
      setChalMsg(T('答對了！z = ', 'Correct! z = ') + ans + T('，用了 ', ', in ') + secs.toFixed(1) + T(' 秒，連續答對 ', ' s. Streak: ') + state.streak + T(' 題。', '.'), 'ok');
      chime();
    } else {
      state.streak = 0; state.times = [];
      setChalMsg(T('不對：答案是 z = ', 'Not quite: the answer is z = ') + ans + T('。', '.'), 'bad');
      blip(220, 'triangle', 0.14);
    }
    $('submitC').hidden = true; $('quitChal').hidden = true;
    $('newChal').textContent = T('出下一題', 'Next problem');
    const last5 = state.streak >= 5 ? state.times.slice(-5).reduce(function (s, v) { return s + v; }, 0) : NaN;
    updateReadouts(); requestDraw();
    emit('guess', { correct: right, streak: state.streak, secs: secs, last5: last5 });
    state.chal = null; state.answered = false;
    showPanels(); refresh();
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
  /** z 的聲音：音高跟著幅角（一圈一個八度），音量跟著 |z| */
  function zTone() {
    const th = M.arg360(state.z);
    blip(isNaN(th) ? 262 : 330 * Math.pow(2, th / 360), 'sine', 0.06 + 0.03 * Math.min(3, M.abs(state.z)));
  }
  function powTone(k) {
    const p = M.powInt(state.z, k), th = M.arg360(p);
    if (isNaN(th)) return;
    blip(330 * Math.pow(2, th / 360), 'sine', clampv(0.05 + 0.04 * Math.log2(1 + M.abs(p)), 0.04, 0.2));
  }
  let lastVoiceT = -1;
  function playVoice(t) {
    if (Math.floor(t * 8) === Math.floor(lastVoiceT * 8)) return;
    lastVoiceT = t;
    const m = state.mode === 'mul' ? M.partial(state.z, t) : null;
    const th = m ? M.arg360(m) : 0;
    blip(330 * Math.pow(2, (isNaN(th) ? 0 : th) / 360) * (state.mode === 'add' ? 1 + t * 0.5 : 1), 'sine', 0.06);
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
  function stateData(src, mode) {
    const z = state.z, w = state.w;
    const P = M.powInt(z, state.pn);
    const R = rootList();
    return {
      src: src, mode: mode || state.mode, chal: !!state.chal,
      z: { re: z.re, im: z.im }, w: { re: w.re, im: w.im }, pn: state.pn, rn: state.rn,
      absZ: M.abs(z), argZ: M.argDeg(z),
      sum: M.add(z, w), prod: M.mul(z, w), pow: { re: P.re, im: P.im },
      roots: R.map(function (p) { return { re: p.re, im: p.im }; })
    };
  }
  function emitState(src) { emit('cx', stateData(src)); }

  // 給測試用的介面（不影響畫面）
  window.__cx = {
    state: state,
    xy: function (re, im) { return viewCur ? [X(re), Y(im)] : null; },
    seed: function (s) { let v = s >>> 0 || 1; rand = function () { v = (v * 16807) % 2147483647; return (v - 1) / 2147483646; }; }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  syncAll(); showPanels(); renderLog(); updateSoundButton();
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
})();
