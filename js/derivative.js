/* derivative.js — 「導數與切線」的畫面與互動（數學計算在 derivative-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 上面的圖：y = f(x)、切點 A、另一點 B、割線、切線（勾選時加對稱割線）；
 * 下面的圖：導函數 y = f′(x)，A 沿著曲線走時一路描出來；第二張畫布是差商誤差對 h 的對數圖。
 * 所有導數都用公式算（derivative-core.js），差商另外算來比較。 */
(function () {
  'use strict';
  const DC = window.DerivCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha;
  const PLAY_SEC = 7;        // 「沿著曲線走」走完整個範圍的秒數
  const SHRINK_SEC = 4.5;    // 「讓 h → 0」的秒數（h 依指數縮小：log h 隨時間等速變化）

  // ---------- 狀態 ----------
  const state = {
    fn: 'cubic', k: Object.assign({}, DC.DEFAULT_COEF), a: 2.2, hsign: 1,
    show: { tan: true, sym: false, deriv: false, phys: false },
    traceKey: '', trace: new Uint8Array(DC.TRACE_BINS),
    playing: false, shrink: null,
    chal: null, round: 0, streak: [], log: [],
    fx: [], drag: null, hover: null
  };
  let rand = DC.rng(((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0);
  let lastChal = null;
  let applying = false;      // 程式正在改滑桿（不要當成使用者的操作）

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'probe',
      'dv-curve', 'dv-secant', 'dv-tangent', 'dv-deriv', 'dv-sym', 'dv-target']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight, italic) { return (italic ? 'italic ' : '') + (weight ? weight + ' ' : '') + px + 'px ' + FONT; }

  // ---------- 數字格式 ----------
  function num(v, dec) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(dec);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function trimN(v, dec) { return DC.trim(v, dec).replace('-', '−'); }
  /** 小數：很小時用科學記號（讀數用 HTML 上標） */
  function smallHTML(v) {
    if (v == null || !isFinite(v)) return '—';
    if (v === 0) return '0';
    if (Math.abs(v) < 0.001) { const e = Math.floor(Math.log10(Math.abs(v))); return num(v / Math.pow(10, e), 2) + ' × 10<sup>' + String(e).replace('-', '−') + '</sup>'; }
    return num(v, 4);
  }
  function tnum(v, dec) { return DC.trim(v, dec == null ? 4 : dec); }   // TeX 用（負號用 -）

  // ---------- 目前的量 ----------
  function hMag() { return val(elH); }
  function hS() { return state.hsign * hMag(); }
  function F() { return DC.FUNCS[state.fn]; }
  function quantities() {
    const fn = state.fn, k = state.k, a = state.a, h = hS();
    const d1 = DC.d1(fn, a, k);
    const dq = DC.diffQuot(fn, a, h, k), sq = DC.symQuot(fn, a, h, k);
    return {
      fn: fn, a: a, h: h, fa: DC.inDomain(fn, a) ? DC.f(fn, a, k) : null, fb: DC.inDomain(fn, a + h) ? DC.f(fn, a + h, k) : null,
      d1: d1, d2: DC.d2(fn, a, k), dq: dq, sq: sq, side: DC.oneSided(fn, a, k), tan: DC.tangent(fn, a, k),
      err: d1 != null && dq != null ? Math.abs(dq - d1) : null,
      errSym: d1 != null && sq != null ? Math.abs(sq - d1) : null
    };
  }

  // ---------- 畫布與版面 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  let dpr = 1, cw = 300, ch = 460, L = null, cw2 = 300, ch2 = 170;
  function layout() {
    const narrow = cw < 600;
    const left = narrow ? 38 : 48, right = cw - (narrow ? 10 : 16);
    const t1 = 10, h1 = narrow ? Math.round(Math.max(230, Math.min(cw * 0.7, 300))) : Math.round(Math.max(270, Math.min(cw * 0.42, 340)));
    const gap = narrow ? 30 : 34;
    const t2 = t1 + h1 + gap, h2 = narrow ? 150 : 175;
    return { narrow: narrow, left: left, right: right, t1: t1, b1: t1 + h1, t2: t2, b2: t2 + h2, H: t2 + h2 + (narrow ? 26 : 28) };
  }
  let VX = [-4, 4], VY = [-1, 1], VD = [-1, 1];
  function updateView() { VX = F().x; VY = DC.viewY(state.fn, state.k, 'f'); VD = DC.viewY(state.fn, state.k, 'd'); }
  function X(x) { return L.left + (x - VX[0]) / (VX[1] - VX[0]) * (L.right - L.left); }
  function xOf(px) { return VX[0] + (px - L.left) / (L.right - L.left) * (VX[1] - VX[0]); }
  function Y1(y) { return L.b1 - (y - VY[0]) / (VY[1] - VY[0]) * (L.b1 - L.t1); }
  function Y2(y) { return L.b2 - (y - VD[0]) / (VD[1] - VD[0]) * (L.b2 - L.t2); }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    L = layout();
    ch = L.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    cw2 = cv2.clientWidth || cw;
    ch2 = cw2 < 600 ? 160 : 180;
    if (cv2.style.height !== ch2 + 'px') cv2.style.height = ch2 + 'px';
    cv2.width = Math.round(cw2 * dpr); cv2.height = Math.round(ch2 * dpr);
    requestDraw();
  }

  // =====================================================================
  // 繪圖工具
  // =====================================================================
  /** 把直線段裁到矩形內（Liang–Barsky）；整段在外面時回傳 null */
  function clipSeg(x0, y0, x1, y1, r) {
    let t0 = 0, t1 = 1;
    const dx = x1 - x0, dy = y1 - y0;
    const p = [-dx, dx, -dy, dy], q = [x0 - r.x0, r.x1 - x0, y0 - r.y0, r.y1 - y0];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return null; continue; }
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
      else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
    return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
  }
  function rect1() { return { x0: L.left, x1: L.right, y0: L.t1, y1: L.b1 }; }
  function rect2() { return { x0: L.left, x1: L.right, y0: L.t2, y1: L.b2 }; }
  /** 通過 (x0, y0)、斜率 m 的直線（資料座標），在上圖裡畫出來 */
  function infLine(c, x0, y0, m, Yf, r, color, width, dash) {
    const xa = VX[0] - 1, xb = VX[1] + 1;
    const s = clipSeg(X(xa), Yf(y0 + m * (xa - x0)), X(xb), Yf(y0 + m * (xb - x0)), r);
    if (!s) return;
    c.save();
    c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round';
    if (dash) c.setLineDash(dash);
    c.beginPath(); c.moveTo(s[0], s[1]); c.lineTo(s[2], s[3]); c.stroke();
    c.restore();
  }
  /** 依像素取樣畫函數 g(x)（回傳 null／NaN 時斷開）；breaks：在這些 x 斷開（|x| 的導函數在 0 跳躍） */
  function plotFn(c, g, Yf, r, xL, xR, breaks) {
    const span = r.y1 - r.y0;
    c.beginPath();
    let pen = false, lastX = null;
    const step = (VX[1] - VX[0]) / (r.x1 - r.x0) * 1.5;
    for (let x = xL; x <= xR + step * 0.5; x += step) {
      const xx = Math.min(x, xR);
      if (breaks && lastX != null && breaks.some(function (b) { return (lastX - b) * (xx - b) <= 0 && lastX !== b; })) pen = false;
      lastX = xx;
      const v = g(xx);
      if (v == null || !isFinite(v)) { pen = false; continue; }
      let py = Yf(v);
      py = Math.max(r.y0 - span, Math.min(r.y1 + span, py));
      if (pen) c.lineTo(X(xx), py); else { c.moveTo(X(xx), py); pen = true; }
    }
  }
  /** 刻度間隔：讓相鄰刻度至少 minPx 像素 */
  function tickStep(range, px, minPx, list) {
    for (let i = 0; i < list.length; i++) if (list[i] / range * px >= minPx) return list[i];
    return list[list.length - 1];
  }
  function piLabel(k2) {   // k2：π/2 的倍數
    if (k2 === 0) return '0';
    const neg = k2 < 0, n = Math.abs(k2);
    let s;
    if (n % 2 === 0) s = (n / 2 === 1 ? '' : n / 2) + 'π';
    else s = (n === 1 ? '' : n) + 'π/2';
    return (neg ? '−' : '') + s;
  }
  /** 一張圖的底：圓角底板、兩級格線、座標軸、刻度 */
  function drawPanel(c, r, yv, Yf, xLabel, yLabel) {
    const isSin = state.fn === 'sin';
    const pw = r.x1 - r.x0, ph = r.y1 - r.y0;
    c.save();
    D.roundRect(c, r.x0, r.y0, pw, ph, 8);
    c.fillStyle = alpha(C.text, D.dark ? 0.025 : 0.018);
    c.fill();
    c.strokeStyle = alpha(C.border, 0.9); c.lineWidth = 1; c.stroke();
    c.clip();
    const xs = isSin ? tickStep(VX[1] - VX[0], pw, L.narrow ? 46 : 40, [Math.PI / 2, Math.PI, 2 * Math.PI]) : tickStep(VX[1] - VX[0], pw, 36, [0.5, 1, 2, 5]);
    const ys = tickStep(yv[1] - yv[0], ph, 26, [0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10]);
    const xsPx = xs / (VX[1] - VX[0]) * pw, ysPx = ys / (yv[1] - yv[0]) * ph;
    D.grid(c, r.x0, r.y0, r.x1, r.y1, xsPx, xsPx / (isSin ? 2 : 5) >= 8 ? xsPx / (isSin ? 2 : 5) : 0, X(0), Yf(0));
    // 為了讓縱橫格線不同間隔：再補一次橫格線
    c.strokeStyle = alpha(C.text, D.dark ? 0.11 : 0.1); c.lineWidth = 1 / dpr;
    c.beginPath();
    for (let y = Math.ceil(yv[0] / ys) * ys; y <= yv[1] + 1e-9; y += ys) { const py = Math.round(Yf(y) * dpr) / dpr + 0.5 / dpr; c.moveTo(r.x0, py); c.lineTo(r.x1, py); }
    c.stroke();
    // 座標軸
    c.strokeStyle = alpha(C.text, 0.42); c.lineWidth = 1.2;
    c.beginPath();
    if (yv[0] <= 0 && yv[1] >= 0) { c.moveTo(r.x0, Yf(0)); c.lineTo(r.x1, Yf(0)); }
    if (VX[0] <= 0 && VX[1] >= 0) { c.moveTo(X(0), r.y0); c.lineTo(X(0), r.y1); }
    c.stroke();
    c.restore();
    // 刻度數字
    c.save();
    c.font = fnt(L.narrow ? 10.5 : 11.5);
    c.fillStyle = C.muted;
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let y = Math.ceil(yv[0] / ys - 1e-9) * ys; y <= yv[1] + 1e-9; y += ys) {
      const py = Yf(y);
      if (py < r.y0 + 6 || py > r.y1 - 4) continue;
      c.fillText(trimN(y, 2), r.x0 - 5, py);
    }
    if (xLabel) {
      c.textAlign = 'center'; c.textBaseline = 'top';
      for (let x = Math.ceil(VX[0] / xs - 1e-9) * xs; x <= VX[1] + 1e-9; x += xs) {
        const px = X(x);
        if (px < r.x0 + 8 || px > r.x1 - 8) continue;
        c.fillText(isSin ? piLabel(Math.round(x / (Math.PI / 2))) : trimN(x, 2), px, r.y1 + 4);
      }
    }
    c.restore();
    // 軸名稱
    if (yLabel) D.pill(c, yLabel, r.x0 + 8, r.y0 + 26, C.text, 'left', fnt(L.narrow ? 12 : 13, 600));
    if (xLabel) D.haloText(c, xLabel, r.x1 - 6, (yv[0] <= 0 && yv[1] >= 0 ? Yf(0) : r.y1) - 8, C.muted, 'right', 'bottom', fnt(12, 500, true));
  }
  function fnName() {
    const phys = state.show.phys;
    const v = phys ? 't' : 'x';
    switch (state.fn) {
      case 'sin': return 'sin ' + v;
      case 'exp': return 'e^' + v;
      case 'ln': return 'ln ' + v;
      case 'abs': return '|' + v + '|';
      default: return cubicText(state.k, v);
    }
  }
  function cubicText(k, v) {
    const parts = [];
    [[k.a, v + '³'], [k.b, v + '²'], [k.c, v], [k.d, '']].forEach(function (p) {
      const c = p[0];
      if (Math.abs(c) < 1e-12) return;
      const ac = Math.abs(c);
      const cs = p[1] && Math.abs(ac - 1) < 1e-12 ? '' : DC.trim(ac, 2);
      parts.push((parts.length ? (c < 0 ? ' − ' : ' + ') : (c < 0 ? '−' : '')) + cs + p[1]);
    });
    return parts.length ? parts.join('') : '0';
  }

  // =====================================================================
  // 主畫布
  // =====================================================================
  function draw() {
    if (!L) return;
    updateView();
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, cw, ch);
    const q = quantities();
    const chal = state.chal;
    const phys = state.show.phys;
    const r1 = rect1(), r2 = rect2();
    const fn = state.fn, k = state.k;
    const fx = function (x) { return DC.inDomain(fn, x) ? DC.f(fn, x, k) : null; };
    const dfx = function (x) { return DC.d1(fn, x, k); };

    // ---------- 上圖：y = f(x) ----------
    drawPanel(c, r1, VY, Y1, phys ? 't' : 'x', phys ? T('位置 x(t) = ', 'position x(t) = ') + fnName() : 'f(x) = ' + fnName());
    c.save();
    D.roundRect(c, r1.x0, r1.y0, r1.x1 - r1.x0, r1.y1 - r1.y0, 8); c.clip();
    c.lineCap = 'round'; c.lineJoin = 'round';
    // 曲線（兩層：底下較寬的光暈、上面實線）
    plotFn(c, fx, Y1, r1, VX[0], VX[1]);
    c.strokeStyle = alpha(C['dv-curve'], D.dark ? 0.28 : 0.18); c.lineWidth = 7; c.stroke();
    c.strokeStyle = C['dv-curve']; c.lineWidth = 2.6; c.stroke();
    const A = q.fa != null ? { x: X(q.a), y: Y1(q.fa) } : null;
    const B = q.fb != null ? { x: X(q.a + q.h), y: Y1(q.fb) } : null;
    // 對稱割線
    if (state.show.sym && q.sq != null) {
      const yl = DC.f(fn, q.a - q.h, k), yr = q.fb;
      infLine(c, q.a + q.h, yr, q.sq, Y1, r1, alpha(C['dv-sym'], 0.95), 2, [7, 5]);
      D.ball(c, X(q.a - q.h), Y1(yl), 4.5, C['dv-sym']);
    }
    // 割線＋Δx、Δy 三角形
    if (A && B && q.dq != null) {
      if (Math.abs(B.x - A.x) > 22 && Math.abs(B.y - A.y) > 22 && !chal) {
        c.save();
        c.strokeStyle = alpha(C['dv-secant'], 0.75); c.lineWidth = 1.4; c.setLineDash([4, 4]);
        c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, A.y); c.lineTo(B.x, B.y); c.stroke();
        c.restore();
      }
      infLine(c, q.a, q.fa, q.dq, Y1, r1, alpha(C['dv-secant'], 0.9), 2.2);
      c.save();
      c.strokeStyle = C['dv-secant']; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke();
      c.restore();
    }
    // 切線（或尖角的左右兩條「半切線」）
    if (A && state.show.tan && !chal) {
      if (q.tan) infLine(c, q.a, q.fa, q.tan.m, Y1, r1, C['dv-tangent'], 2.4);
      else if (fn === 'abs' && q.a === 0) {
        [[-1, -1], [1, 1]].forEach(function (s) {
          const xe = s[0] * 3, seg = clipSeg(A.x, A.y, X(xe), Y1(q.fa + s[1] * (xe - q.a)), r1);
          if (!seg) return;
          c.save(); c.strokeStyle = alpha(C['dv-tangent'], 0.75); c.lineWidth = 2; c.setLineDash([3, 5]); c.lineCap = 'round';
          c.beginPath(); c.moveTo(seg[0], seg[1]); c.lineTo(seg[2], seg[3]); c.stroke(); c.restore();
        });
      }
    }
    // 挑戰：跟著 A 走的目標斜率虛線
    if (A && chal) infLine(c, q.a, q.fa, chal.m, Y1, r1, C['dv-target'], 2.4, [9, 6]);
    // 揭曉時的切線
    if (A && !chal && state.fx.some(function (e) { return e.kind === 'hit'; }) && q.tan) infLine(c, q.a, q.fa, q.tan.m, Y1, r1, C['dv-target'], 3);
    c.restore();
    // 點與標籤（畫在裁切區外，靠邊也不會被切）
    const focus = kb && kb.focused() ? kb.index() : -1;
    if (B && q.dq != null) {
      D.ball(c, B.x, B.y, state.hover === 'B' || state.drag === 'B' ? 7.2 : 6.2, C['dv-secant'], { ring: focus === 1 ? C.accent : '' });
      if (Math.abs(B.x - (A ? A.x : -99)) > 16 || Math.abs(B.y - (A ? A.y : -99)) > 16) D.pill(c, 'B', B.x + (q.h > 0 ? 10 : -10), B.y - 9, C['dv-secant'], q.h > 0 ? 'left' : 'right', fnt(12, 700));
    }
    if (A) {
      D.ball(c, A.x, A.y, state.hover === 'A' || state.drag === 'A' ? 8.4 : 7.4, C.probe, { glow: 0.45, ring: focus === 0 ? C.accent : '' });
      D.pill(c, 'A', A.x + (q.h > 0 ? -11 : 11), A.y - 10, C.text, q.h > 0 ? 'right' : 'left', fnt(12, 700));
    }
    // 提示文字
    if (q.fb == null && q.fa != null) D.pill(c, T('B 不在定義域（x ≤ 0）', 'B is outside the domain (x ≤ 0)'), (r1.x0 + r1.x1) / 2, r1.y1 - 8, C['dv-secant'], 'center', fnt(12, 600));
    else if (fn === 'abs' && q.a === 0 && state.show.tan && !chal) D.pill(c, T('尖角：沒有切線', 'A corner: no tangent'), A.x, A.y + 34, C['dv-tangent'], 'center', fnt(12, 600));
    if (chal) D.pill(c, T('目標斜率 m = ', 'Target slope m = ') + trimN(chal.m, 2), r1.x1 - 8, r1.y0 + 26, C['dv-target'], 'right', fnt(12.5, 700));

    // ---------- 下圖：y = f′(x) ----------
    drawPanel(c, r2, VD, Y2, phys ? 't' : 'x', phys ? T('速度 v(t) = x′(t)', 'velocity v(t) = x′(t)') : 'f′(x)');
    c.save();
    D.roundRect(c, r2.x0, r2.y0, r2.x1 - r2.x0, r2.y1 - r2.y0, 8); c.clip();
    c.lineCap = 'round'; c.lineJoin = 'round';
    const breaks = fn === 'abs' ? [0] : null;
    if (chal) {
      infLine(c, 0, chal.m, 0, Y2, r2, C['dv-target'], 2, [9, 6]);
    } else {
      if (state.show.deriv) {
        plotFn(c, dfx, Y2, r2, VX[0], VX[1], breaks);
        c.save(); c.setLineDash([6, 5]); c.strokeStyle = alpha(C['dv-deriv'], 0.55); c.lineWidth = 1.8; c.stroke(); c.restore();
      }
      // 描出來的部分：每一段連續的格子用細取樣畫
      const R = F().aRange, bw = (R[1] - R[0]) / DC.TRACE_BINS;
      let i = state.traceKey === traceKey() ? 0 : DC.TRACE_BINS;   // 描點屬於別的函數時不畫
      while (i < DC.TRACE_BINS) {
        if (!state.trace[i]) { i++; continue; }
        let j = i; while (j + 1 < DC.TRACE_BINS && state.trace[j + 1]) j++;
        plotFn(c, dfx, Y2, r2, R[0] + i * bw, R[0] + (j + 1) * bw, breaks);
        c.strokeStyle = alpha(C['dv-deriv'], D.dark ? 0.3 : 0.2); c.lineWidth = 7; c.stroke();
        c.strokeStyle = C['dv-deriv']; c.lineWidth = 2.8; c.stroke();
        i = j + 1;
      }
    }
    c.restore();
    // A 的鉛直對齊線（貫穿兩張圖）
    if (q.fa != null || DC.inDomain(fn, q.a)) {
      const ax = X(q.a);
      c.save(); c.strokeStyle = alpha(C.text, 0.28); c.lineWidth = 1; c.setLineDash([3, 4]);
      c.beginPath(); c.moveTo(ax, r1.y0 + 2); c.lineTo(ax, r2.y1 - 2); c.stroke(); c.restore();
    }
    if (!chal && DC.inDomain(fn, q.a)) {
      const ax = X(q.a);
      const inY = function (v) { return v != null && isFinite(v) && Y2(v) >= r2.y0 - 2 && Y2(v) <= r2.y1 + 2; };
      // 差商（空心圈）：和 f′(a) 的差距
      if (q.dq != null && inY(q.dq)) {
        if (q.d1 != null && Math.abs(Y2(q.dq) - Y2(q.d1)) > 4 && inY(q.d1)) {
          c.save(); c.strokeStyle = alpha(C['dv-secant'], 0.8); c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(ax, Y2(q.dq)); c.lineTo(ax, Y2(q.d1)); c.stroke(); c.restore();
        }
        c.save(); c.strokeStyle = C['dv-secant']; c.lineWidth = 2.2; c.fillStyle = C['canvas-bg'];
        c.beginPath(); c.arc(ax, Y2(q.dq), 5.5, 0, Math.PI * 2); c.fill(); c.stroke(); c.restore();
      }
      if (q.d1 != null && inY(q.d1)) D.ball(c, ax, Y2(q.d1), 6.2, C['dv-deriv'], { glow: 0.4 });
      else if (fn === 'abs' && q.a === 0) {
        [-1, 1].forEach(function (s) { c.save(); c.strokeStyle = C['dv-deriv']; c.lineWidth = 2; c.fillStyle = C['canvas-bg']; c.beginPath(); c.arc(ax, Y2(s), 5, 0, Math.PI * 2); c.fill(); c.stroke(); c.restore(); });
        D.pill(c, T('左 −1、右 +1', 'left −1, right +1'), ax + 10, Y2(0) - 6, C['dv-deriv'], 'left', fnt(12, 600));
      }
    }
    if (chal) D.pill(c, T('f′(x) = m 的地方，就是答案', 'Where f′(x) = m is the answer'), r2.x1 - 8, r2.y0 + 26, C['dv-target'], 'right', fnt(12, 600));

    // 事件波紋
    const now = performance.now() / 1000;
    state.fx = state.fx.filter(function (e) { return now - e.t < e.dur; });
    state.fx.forEach(function (e) { if (e.kind !== 'hit' || A) D.ripple(c, A ? A.x : e.x, A ? A.y : e.y, 9, (now - e.t) / e.dur, e.color); });
    drawChart(q);
  }

  // =====================================================================
  // 誤差圖：|差商 − f′(a)| 對 h（對數刻度）
  // =====================================================================
  function drawChart(q) {
    const c = ctx2;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, cw2, ch2);
    const narrow = cw2 < 600;
    const ml = narrow ? 42 : 50, mr = 12, mt = 12, mb = 26;
    const pw = cw2 - ml - mr, ph = ch2 - mt - mb;
    const LX0 = -3, LX1 = Math.log10(2), LY0 = -10, LY1 = 1;
    const Xh = function (h) { return ml + (Math.log10(h) - LX0) / (LX1 - LX0) * pw; };
    const Ye = function (e) { return mt + (LY1 - Math.log10(Math.max(e, Math.pow(10, LY0)))) / (LY1 - LY0) * ph; };
    c.save();
    D.roundRect(c, ml, mt, pw, ph, 6);
    c.fillStyle = alpha(C.text, D.dark ? 0.025 : 0.018); c.fill();
    c.strokeStyle = alpha(C.border, 0.9); c.lineWidth = 1; c.stroke();
    c.clip();
    c.strokeStyle = alpha(C.text, D.dark ? 0.1 : 0.09); c.lineWidth = 1 / dpr;
    c.beginPath();
    for (let e = -3; e <= 0; e++) { const x = Xh(Math.pow(10, e)); c.moveTo(x, mt); c.lineTo(x, mt + ph); }
    for (let e = LY0; e <= LY1; e += 2) { const y = Ye(Math.pow(10, e)); c.moveTo(ml, y); c.lineTo(ml + pw, y); }
    c.stroke();
    c.restore();
    // 刻度
    c.save();
    c.font = fnt(narrow ? 10.5 : 11); c.fillStyle = C.muted; c.textAlign = 'center'; c.textBaseline = 'top';
    [0.001, 0.01, 0.1, 1].forEach(function (h) { c.fillText(String(h), Xh(h), mt + ph + 5); });
    c.restore();
    for (let e = LY0; e <= LY1; e += 2) D.supText(c, '10', String(e).replace('-', '−'), ml - 5, Ye(Math.pow(10, e)), C.muted, fnt(narrow ? 10.5 : 11), 'right');
    D.haloText(c, T('間隔 |h| →', 'gap |h| →'), ml + pw - 4, mt + ph - 5, C.muted, 'right', 'bottom', fnt(11.5, 500));
    if (state.chal) { D.pill(c, T('挑戰中，誤差圖先藏起來', 'Hidden during the challenge'), ml + pw / 2, mt + ph / 2 + 10, C.muted, 'center', fnt(12, 600)); return; }
    if (q.d1 == null) {
      D.pill(c, state.fn === 'abs' && q.a === 0 ? T('f′(0) 不存在，沒有誤差可以算', 'f′(0) does not exist: there is no error to measure') : T('這一點沒有導數', 'No derivative at this point'),
        ml + pw / 2, mt + ph / 2 + 10, C.muted, 'center', fnt(12, 600));
      return;
    }
    const fn = state.fn, k = state.k, a = q.a, sg = state.hsign;
    c.save();
    D.roundRect(c, ml, mt, pw, ph, 6); c.clip();
    c.lineCap = 'round'; c.lineJoin = 'round';
    [[false, C['dv-secant'], null], [true, C['dv-sym'], [6, 4]]].forEach(function (cfg) {
      c.beginPath();
      let pen = false;
      for (let i = 0; i <= 160; i++) {
        const h = Math.pow(10, LX0 + (LX1 - LX0) * i / 160) * sg;
        const v = cfg[0] ? DC.symQuot(fn, a, h, k) : DC.diffQuot(fn, a, h, k);
        if (v == null) { pen = false; continue; }
        const x = Xh(Math.abs(h)), y = Ye(Math.abs(v - q.d1));
        if (pen) c.lineTo(x, y); else { c.moveTo(x, y); pen = true; }
      }
      c.strokeStyle = alpha(cfg[1], cfg[0] && !state.show.sym ? 0.45 : 1); c.lineWidth = 2.2;
      if (cfg[2]) c.setLineDash(cfg[2]); else c.setLineDash([]);
      c.stroke();
    });
    c.setLineDash([]);
    c.restore();
    // 目前的 h
    const hx = Xh(Math.abs(q.h));
    c.save(); c.strokeStyle = alpha(C.text, 0.3); c.setLineDash([3, 4]); c.lineWidth = 1;
    c.beginPath(); c.moveTo(hx, mt); c.lineTo(hx, mt + ph); c.stroke(); c.restore();
    if (q.err != null) D.ball(c, hx, Ye(q.err), 5, C['dv-secant']);
    if (state.show.sym && q.errSym != null) D.ball(c, hx, Ye(q.errSym), 4.5, C['dv-sym']);
    D.pill(c, T('單邊：誤差 ∝ h', 'one-sided: error ∝ h'), ml + 8, mt + 22, C['dv-secant'], 'left', fnt(11.5, 600));
    D.pill(c, T('對稱：誤差 ∝ h²', 'symmetric: error ∝ h²'), ml + 8, mt + 44, C['dv-sym'], 'left', fnt(11.5, 600));
  }

  // =====================================================================
  // 動畫：沿著曲線走、讓 h → 0、波紋
  // =====================================================================
  let raf = 0, lastT = 0;
  function frame(now) {
    raf = 0;
    const t = now / 1000;
    const dt = lastT ? Math.min(1 / 30, t - lastT) : 0;
    lastT = t;
    if (state.playing) stepPlay(dt);
    if (state.shrink) stepShrink(t);
    draw();
    if (state.playing || state.shrink || state.fx.length) requestDraw(); else lastT = 0;
  }
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }

  function traceKey() { return state.fn + '|' + (state.fn === 'cubic' ? [state.k.a, state.k.b, state.k.c, state.k.d].join(',') : ''); }
  function addTrace(x0, x1) {
    const key = traceKey();
    if (key !== state.traceKey) { state.traceKey = key; state.trace.fill(0); }
    const i0 = DC.traceBin(state.fn, Math.min(x0, x1)), i1 = DC.traceBin(state.fn, Math.max(x0, x1));
    for (let i = i0; i <= i1; i++) state.trace[i] = 1;
  }
  function coverage() {
    if (state.traceKey !== traceKey()) return 0;
    let n = 0; for (let i = 0; i < state.trace.length; i++) n += state.trace[i];
    return n / state.trace.length;
  }
  let voice = null;
  function slopeFreq(m) { return 520 * Math.pow(2, Math.atan(m) / (Math.PI / 2)); }   // 斜率 −∞…+∞ → 260…1040 Hz
  function stepPlay(dt) {
    const R = F().aRange;
    const speed = (R[1] - R[0]) / PLAY_SEC;
    const a0 = state.a;
    let a1 = Math.min(R[1], a0 + speed * dt);
    setA(a1, true);
    addTrace(a0, state.a);
    const S = sound();
    if (S) {
      const m = DC.d1(state.fn, state.a, state.k);
      if (!voice && m != null) voice = S.voice({ freq: slopeFreq(m), type: 'triangle', gain: 0.12 });
      if (voice && m != null) voice.set({ freq: slopeFreq(m) }, 0.05);
    }
    if (a1 >= R[1] - 1e-9) { stopPlay(); emitTrace(); emitState(); }
  }
  function stopVoice() { if (voice) { voice.stop(0.12); voice = null; } }
  function updatePlayLabel() { $('play').textContent = state.playing ? T('暫停', 'Pause') : T('沿著曲線走', 'Walk along the curve'); }
  function startPlay() {
    stopShrink(false);
    const R = F().aRange;
    // 按暫停之後、A 沒動過就接著走；否則從最左邊開始，才能把整條導函數描出來
    if (!(state.pausedAt === state.a && state.pausedFn === traceKey() && state.a < R[1] - 0.05)) setA(R[0], true);
    state.pausedAt = null;
    state.playing = true; updatePlayLabel(); requestDraw();
  }
  function stopPlay() { if (!state.playing) return; state.playing = false; state.pausedAt = state.a; state.pausedFn = traceKey(); stopVoice(); updatePlayLabel(); }

  function startShrink() {
    stopPlay();
    let p0 = +elH.value;
    if (window.LabNum) p0 = DC.posFromH(hMag());
    if (p0 > 85) p0 = DC.posFromH(1.5);
    state.shrink = { p0: p0, t0: performance.now() / 1000, from: DC.hFromPos(p0), dec: Math.floor(-Math.log10(DC.hFromPos(p0))) };
    setHPos(p0);
    $('shrink').disabled = true;
    requestDraw();
  }
  function stepShrink(t) {
    const s = state.shrink;
    const u = Math.min(1, (t - s.t0) / SHRINK_SEC);
    const pos = s.p0 + (100 - s.p0) * u;
    setHPos(pos);
    const dec = Math.floor(-Math.log10(DC.hFromPos(pos)) + 1e-9);
    if (dec > s.dec) { s.dec = dec; tick(dec); }
    if (u >= 1) {
      const from = s.from;
      stopShrink(true);
      state.fx.push({ kind: 'shrink', t: performance.now() / 1000, dur: 0.6, color: C['dv-tangent'] });
      chime(true, true);
      emit('shrink', { fn: state.fn, from: from, to: hMag() });
      emitState();
      say(T('h = 0.001：割線幾乎和切線重合了。', 'h = 0.001: the secant has all but become the tangent.'));
    }
  }
  function stopShrink(done) { if (!state.shrink) return; state.shrink = null; $('shrink').disabled = false; if (!done) refreshOutputs(); }
  function setHPos(pos) {
    if (window.LabNum) window.LabNum.clear(elH);
    elH.value = String(pos);
    refreshOutputs();
    updateReadouts();
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  const eqKeys = {};
  function setEq(id, tex) {
    if (eqKeys[id] === tex) return;
    eqKeys[id] = tex;
    const el = $(id);
    if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); } catch (e) { el.textContent = tex; } }
    else el.textContent = tex;
  }
  function fnTex(v) {
    switch (state.fn) {
      case 'sin': return '\\sin ' + v;
      case 'exp': return 'e^{' + v + '}';
      case 'ln': return '\\ln ' + v;
      case 'abs': return '|' + v + '|';
      default: return DC.cubicTex(state.k).replace(/x/g, v);
    }
  }
  function derivTex(v) {
    switch (state.fn) {
      case 'sin': return '\\cos ' + v;
      case 'exp': return 'e^{' + v + '}';
      case 'ln': return '\\dfrac{1}{' + v + '}';
      case 'abs': return v === 'x' ? '\\pm 1' : '\\pm 1';
      default: return DC.cubicDerivTex(state.k).replace(/x/g, v);
    }
  }
  function updateReadouts() {
    const q = quantities(), chal = !!state.chal, phys = state.show.phys;
    const v = phys ? 't' : 'x';
    $('lFa').textContent = phys ? 'x(t)' : 'f(a)';
    $('lFb').textContent = phys ? 'x(t + h)' : 'f(a + h)';
    $('lDq').textContent = phys ? T('平均速度 [x(t + h) − x(t)] ／ h', 'Average velocity [x(t + h) − x(t)] / h') : T('割線斜率 [f(a + h) − f(a)] ／ h', 'Secant slope [f(a + h) − f(a)] / h');
    $('lD1').textContent = phys ? T('瞬時速度 x′(t)', 'Instantaneous velocity x′(t)') : T('切線斜率 f′(a)', 'Tangent slope f′(a)');
    setHTML('rFa', num(q.fa, 4));
    setHTML('rFb', q.fb == null ? T('沒有定義', 'undefined') : num(q.fb, 4));
    setHTML('rDq', chal ? '?' : q.dq == null ? T('沒有定義', 'undefined') : num(q.dq, 4));
    setHTML('rSq', chal ? '?' : q.sq == null ? T('沒有定義', 'undefined') : num(q.sq, 4));
    let d1h;
    if (chal) d1h = '?';
    else if (q.d1 != null) d1h = num(q.d1, 4);
    else if (state.fn === 'abs' && q.a === 0) d1h = T('不存在', 'does not exist') + ' <small>' + T('（左 −1、右 +1）', '(left −1, right +1)') + '</small>';
    else d1h = T('沒有定義', 'undefined');
    setHTML('rD1', d1h);
    let eh = '—';
    if (chal) eh = '?';
    else if (q.err != null) eh = smallHTML(q.err) + (state.show.sym && q.errSym != null ? ' <small>' + T('（對稱 ', '(symmetric ') + smallHTML(q.errSym) + T('）', ')') + '</small>' : '');
    setHTML('rErr', eh);
    // 差商算式
    const a = q.a, h = q.h;
    const aT = phys ? 't' : 'a';
    const fL = phys ? 'x' : 'f';
    // 兩行：手機上也不用左右捲
    if (chal || q.dq == null) setEq('rEq', '\\frac{\\Delta y}{\\Delta x} = \\frac{' + fL + '(' + aT + ' + h) - ' + fL + '(' + aT + ')}{h}');
    else setEq('rEq', '\\begin{gathered}\\frac{' + fL + '(' + tnum(a, 3) + (h < 0 ? ' - ' : ' + ') + tnum(Math.abs(h), 3) + ') - ' + fL + '(' + tnum(a, 3) + ')}{' + tnum(h, 3) + '} \\\\ = \\frac{' + tnum(q.fb, 4) + ' - ' + (q.fa < 0 ? '(' + tnum(q.fa, 4) + ')' : tnum(q.fa, 4)) + '}{' + tnum(h, 3) + '} \\approx ' + tnum(q.dq, 4) + '\\end{gathered}');
    // 導函數與切線
    let t2 = fL + "'(" + v + ') = ' + derivTex(v);
    if (state.fn === 'abs') t2 = fL + "'(" + v + ') = \\begin{cases} 1 & ' + v + ' > 0 \\\\ -1 & ' + v + ' < 0 \\end{cases}';
    if (!chal && q.tan) t2 = '\\begin{gathered}' + t2 + ' \\\\ y = ' + tnum(q.tan.m, 3) + '(' + v + (a < 0 ? ' + ' + tnum(-a, 3) : ' - ' + tnum(a, 3)) + ')' + (q.fa < 0 ? ' - ' + tnum(-q.fa, 3) : ' + ' + tnum(q.fa, 3)) + '\\end{gathered}';
    setEq('rEq2', t2);
  }

  // =====================================================================
  // 狀態列、音效
  // =====================================================================
  let sayTimer = 0;
  function say(msg) {
    const el = $('status');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(function () { el.textContent = msg || ''; }, 30);
  }
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function tick(dec) {
    const S = sound(); if (!S) return;
    S.tone({ freq: 440 * Math.pow(2, dec / 3), dur: 0.08, type: 'sine', gain: 0.16 });
  }
  function chime(ok, soft) {
    const S = sound(); if (!S) return;
    if (ok) {
      S.tone({ freq: 659.25, dur: 0.16, type: 'sine', gain: soft ? 0.18 : 0.28 });
      S.tone({ freq: 987.77, dur: 0.24, type: 'sine', gain: soft ? 0.16 : 0.24, delay: 0.11 });
    } else S.tone({ freq: 523.25, dur: 0.12, type: 'triangle', gain: 0.2 });
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
    if (!on) stopVoice();
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
  });

  // =====================================================================
  // 任務模式：回報數學量
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function emitState() {
    const q = quantities();
    emit('state', {
      fn: state.fn, k: Object.assign({}, state.k), x: q.a, h: q.h, fa: q.fa, dq: q.dq, sq: q.sq, sym: state.show.sym,
      d1: q.d1, d2: q.d2, err: q.err, errSym: q.errSym, chal: !!state.chal, tan: state.show.tan && !state.chal,
      b: q.tan ? q.tan.b : null, roots: state.fn === 'cubic' ? DC.cubicRoots(state.k) : null
    });
  }
  function emitTrace() { emit('trace', { fn: state.fn, k: Object.assign({}, state.k), coverage: coverage() }); }

  // =====================================================================
  // 控制項
  // =====================================================================
  const lab = $('lab');
  const elA = $('xa'), elH = $('hh');
  const coefEls = { a: $('ca'), b: $('cb'), c: $('cc'), d: $('cd') };
  if (window.LabNum) window.LabNum.register(elH, { toValue: DC.hFromPos, toPos: DC.posFromH, min: DC.H_MIN, max: DC.H_MAX, decimals: 3 });
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s.replace('-', '−');
  }
  function refreshOutputs() {
    $('xao').textContent = fmtSlider(state.a, elA);
    $('hho').textContent = (state.hsign < 0 ? '−' : '') + DC.trim(hMag(), 3);
    Object.keys(coefEls).forEach(function (key) { $('c' + key + 'o').textContent = fmtSlider(val(coefEls[key]), coefEls[key]); });
  }
  /** 改切點 a；quiet：不派送滑桿事件（拖曳、播放時用） */
  function setA(a, quiet) {
    const R = F().aRange;
    a = Math.max(R[0], Math.min(R[1], a));
    if (quiet) {
      if (window.LabNum) window.LabNum.clear(elA);
      elA.value = String(Math.round(a * 100) / 100);
      state.a = Math.round(a * 100) / 100;
      if (Math.abs(state.a - a) > 0.004) state.a = +elA.value;
    } else if (window.LabNum) { applying = true; window.LabNum.set(elA, a); applying = false; state.a = val(elA); }
    else { elA.value = String(a); state.a = +elA.value; }
    if (Math.abs(state.a) < 1e-12) state.a = 0;
    refreshOutputs();
    updateReadouts();
    requestDraw();
  }
  elA.addEventListener('input', function () {
    if (applying) return;
    const prev = state.a;
    state.a = val(elA);
    if (Math.abs(state.a) < 1e-12) state.a = 0;
    if (Math.abs(state.a - prev) < 0.2) addTrace(prev, state.a);
    refreshOutputs(); updateReadouts(); requestDraw();
  });
  elA.addEventListener('change', function () { if (applying) return; afterMoveA(); });
  elH.addEventListener('input', function () { if (applying) return; stopShrink(false); refreshOutputs(); updateReadouts(); requestDraw(); });
  elH.addEventListener('change', function () { if (applying) return; emitState(); });
  Object.keys(coefEls).forEach(function (key) {
    const el = coefEls[key];
    el.addEventListener('input', function () {
      if (applying) return;
      cancelChal();
      state.k[key] = Math.round(val(el) * 100) / 100;
      refreshOutputs(); updateReadouts(); requestDraw();
    });
    el.addEventListener('change', function () { if (applying) return; emitState(); });
  });
  function setSign(s) {
    state.hsign = s;
    $('hPos').setAttribute('aria-pressed', String(s > 0));
    $('hNeg').setAttribute('aria-pressed', String(s < 0));
    refreshOutputs(); updateReadouts(); requestDraw();
  }
  $('hPos').addEventListener('click', function () { setSign(1); emitState(); });
  $('hNeg').addEventListener('click', function () { setSign(-1); emitState(); });
  $('shrink').addEventListener('click', startShrink);
  [['showTan', 'tan'], ['showSym', 'sym'], ['showDeriv', 'deriv'], ['physics', 'phys']].forEach(function (pr) {
    const el = $(pr[0]);
    state.show[pr[1]] = el.checked;
    el.addEventListener('change', function () {
      state.show[pr[1]] = el.checked;
      if (pr[1] === 'sym') lab.dataset.sym = el.checked ? '1' : '0';
      updateReadouts(); requestDraw(); emitState();
    });
  });
  lab.dataset.sym = state.show.sym ? '1' : '0';
  $('play').addEventListener('click', function () { if (state.playing) { stopPlay(); emitTrace(); } else startPlay(); });
  $('clear').addEventListener('click', function () {
    stopPlay(); stopShrink(false);
    cancelChal();
    state.trace.fill(0);
    state.log = []; state.streak = []; state.round = 0;
    renderLog(); setChalMsg('');
    requestDraw();
    say(T('已清除描出來的導函數與挑戰紀錄。', 'Cleared the traced derivative and the challenge record.'));
  });

  // ---------- 換函數 ----------
  const fnBtns = Array.prototype.slice.call(document.querySelectorAll('.fns button'));
  function setFn(id, coef, keepChal) {
    if (!keepChal) cancelChal();
    stopPlay(); stopShrink(false);
    state.fn = id;
    lab.dataset.fn = id;
    fnBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.fn === id)); });
    if (coef) {
      applying = true;
      Object.keys(coefEls).forEach(function (key) { if (window.LabNum) window.LabNum.set(coefEls[key], coef[key]); else coefEls[key].value = coef[key]; state.k[key] = coef[key]; });
      applying = false;
    }
    const R = F().aRange;
    elA.min = String(R[0]); elA.max = String(R[1]);
    let a = state.a;
    if (id === 'ln' && a < 0.1) a = 1;
    setA(Math.max(R[0], Math.min(R[1], a)));
    updateView();
    refreshOutputs(); updateReadouts(); requestDraw();
  }
  fnBtns.forEach(function (b) {
    b.addEventListener('click', function () { if (b.dataset.fn === state.fn) return; setFn(b.dataset.fn); emitState(); });
  });

  // ---------- 拖曳 ----------
  function pointerXY(ev) { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  function hitB(p) {
    const q = quantities();
    if (q.fb == null) return false;
    return Math.hypot(p.x - X(q.a + q.h), p.y - Y1(q.fb)) < 20;
  }
  function inPlots(p) { return L && p.x >= L.left - 10 && p.x <= L.right + 10 && ((p.y >= L.t1 && p.y <= L.b1 + 6) || (p.y >= L.t2 - 6 && p.y <= L.b2)); }
  function dragTo(p) {
    if (state.drag === 'B') {
      const xb = xOf(p.x);
      let h = xb - state.a;
      const s = h < 0 ? -1 : 1;
      h = Math.max(DC.H_MIN, Math.min(DC.H_MAX, Math.abs(h)));
      if (s !== state.hsign) setSign(s);
      if (window.LabNum) { applying = true; window.LabNum.set(elH, Math.round(h * 1000) / 1000); applying = false; }
      else elH.value = String(DC.posFromH(h));
      refreshOutputs(); updateReadouts(); requestDraw();
    } else {
      const prev = state.a;
      setA(xOf(p.x), true);
      if (Math.abs(state.a - prev) < 0.6) addTrace(prev, state.a);
    }
  }
  cv.addEventListener('pointerdown', function (ev) {
    const p = pointerXY(ev);
    if (!inPlots(p)) return;
    stopPlay(); stopShrink(false);
    state.drag = hitB(p) ? 'B' : 'A';
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 有些瀏覽器不支援 */ }
    dragTo(p);
    ev.preventDefault();
  });
  cv.addEventListener('pointermove', function (ev) {
    const p = pointerXY(ev);
    if (state.drag) { dragTo(p); return; }
    const hov = inPlots(p) ? (hitB(p) ? 'B' : 'A') : null;
    cv.style.cursor = hov === 'B' ? 'grab' : hov ? 'ew-resize' : 'default';
    if (hov !== state.hover) { state.hover = hov; requestDraw(); }
  });
  function endDrag() {
    if (!state.drag) return;
    const was = state.drag;
    state.drag = null;
    requestDraw();
    if (was === 'A') afterMoveA(); else emitState();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (state.hover) { state.hover = null; requestDraw(); } });
  /** A 停下來之後：檢查挑戰、回報任務、說明 */
  function afterMoveA() {
    const q = quantities();
    if (state.chal) { checkChal(); }
    else if (q.d1 != null) say((state.show.phys ? T('t = ', 't = ') : 'a = ') + trimN(q.a, 2) + T('：切線斜率 ', ': tangent slope ') + num(q.d1, 3));
    emitState();
    if (coverage() > 0) emitTrace();
  }

  let kb = null;
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('導數畫布。Enter 切換切點 A 或點 B，左右方向鍵移動，Shift 加方向鍵移動得更多。', 'Derivative canvas. Press Enter to switch between the point A and the point B; use the left and right arrow keys to move, with Shift for bigger steps.'),
      items: [{
        name: function () { return T('切點 A', 'Point A'); },
        move: function (dx, dy, big) {
          if (!dx) return false;
          stopPlay();
          const prev = state.a;
          setA(state.a + dx * (big ? 0.5 : 0.05), true);
          addTrace(prev, state.a);
          afterMoveA();
          return true;
        },
        describe: function () {
          const q = quantities();
          return 'a = ' + trimN(q.a, 2) + (state.chal ? '' : q.d1 != null ? T('，切線斜率 ', ', tangent slope ') + num(q.d1, 3) : T('，沒有切線', ', no tangent'));
        }
      }, {
        name: function () { return T('點 B', 'Point B'); },
        move: function (dx, dy, big) {
          if (!dx) return false;
          stopShrink(false);
          const h = hS(), step = Math.max(0.001, Math.abs(h) * (big ? 0.5 : 0.15));
          let nh = h + dx * step;
          if (Math.sign(nh) !== Math.sign(h) || Math.abs(nh) < DC.H_MIN) nh = Math.sign(h) * DC.H_MIN;
          nh = Math.sign(nh) * Math.min(DC.H_MAX, Math.abs(nh));
          if (window.LabNum) { applying = true; window.LabNum.set(elH, Math.round(Math.abs(nh) * 1000) / 1000); applying = false; }
          refreshOutputs(); updateReadouts(); emitState();
          return true;
        },
        describe: function () {
          const q = quantities();
          return 'h = ' + trimN(q.h, 3) + (state.chal ? '' : q.dq != null ? T('，割線斜率 ', ', secant slope ') + num(q.dq, 4) : '');
        }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // ---------- 挑戰：找出斜率 m 的點 ----------
  const chalMsg = $('chalMsg');
  function setChalMsg(msg, ok) { chalMsg.textContent = msg || ''; chalMsg.classList.toggle('ok', !!ok); }
  function fnLabel(id, k) {
    switch (id) {
      case 'sin': return 'sin x';
      case 'exp': return 'e^x';
      case 'ln': return 'ln x';
      case 'abs': return '|x|';
      default: return cubicText(k, 'x');
    }
  }
  function startChal(c) {
    stopPlay(); stopShrink(false);
    c = c || DC.genChallenge(rand, lastChal, state.a);
    lastChal = c;
    setFn(c.fn, c.fn === 'cubic' ? c.coef : null, true);
    // 讓 A 從離答案遠一點的地方開始
    const R = F().aRange;
    let start = state.a;
    if (!DC.inDomain(c.fn, start) || c.sols.some(function (x) { return Math.abs(x - start) < 0.5; })) {
      const cands = [R[0] + 0.5, (R[0] + R[1]) / 2, R[1] - 0.5, R[0] + 1.5, R[1] - 1.5];
      start = cands.find(function (x) { return c.sols.every(function (s) { return Math.abs(s - x) >= 0.5; }); });
      if (start == null) start = R[0] + 0.3;
    }
    setA(start, true);
    state.chal = { fn: c.fn, coef: c.coef, m: c.m, sols: c.sols, t0: performance.now(), round: ++state.round };
    $('newChal').textContent = T('換一題', 'Another one');
    $('quitChal').hidden = false;
    setChalMsg(T('目標斜率 m = ', 'Target slope m = ') + trimN(c.m, 2) + T('：移動 A，讓虛線剛好貼住曲線。', '. Move A until the dashed line just touches the curve.'));
    updateReadouts(); requestDraw();
    say(T('挑戰開始：找出切線斜率是 ', 'Challenge: find the point where the tangent slope is ') + trimN(c.m, 2) + T(' 的點。', '.'));
  }
  function endChalUI() {
    state.chal = null;
    $('newChal').textContent = T('出一題', 'New challenge');
    $('quitChal').hidden = true;
    updateReadouts(); requestDraw();
  }
  /** 換函數、改係數或全部清除時中止挑戰（不記錄、連勝歸零） */
  function cancelChal() {
    if (!state.chal) return;
    state.streak = [];
    setChalMsg(T('挑戰中止。', 'Challenge stopped.'));
    endChalUI();
  }
  function quitChal() {
    const c = state.chal; if (!c) return;
    state.log.push({ round: c.round, fn: fnLabel(c.fn, c.coef), m: c.m, a: null, time: null });
    state.streak = [];
    setChalMsg(T('答案：x = ', 'Answer: x = ') + c.sols.map(function (x) { return trimN(x, 2); }).join(T('、', ', ')));
    endChalUI(); renderLog();
    chime(false);
  }
  function checkChal() {
    const c = state.chal; if (!c) return;
    if (!DC.chalHit(c.sols, state.a)) return;
    const time = (performance.now() - c.t0) / 1000;
    state.log.push({ round: c.round, fn: fnLabel(c.fn, c.coef), m: c.m, a: state.a, time: time });
    state.streak.push(time);
    const n = state.streak.length;
    const last3 = n >= 3 ? state.streak.slice(-3).reduce(function (s, v) { return s + v; }, 0) : null;
    endChalUI(); renderLog();
    state.fx.push({ kind: 'hit', t: performance.now() / 1000, dur: 1.4, color: C['dv-target'] });
    requestDraw();
    chime(true);
    setChalMsg(T('對準了！切點 a = ', 'Got it! Point of tangency a = ') + trimN(state.a, 2) + T('，用了 ', ', in ') + time.toFixed(1) + T(' 秒。', ' s.') +
      (n >= 2 ? T('連續 ', ' Streak: ') + n + T(' 題。', '.') : ''), true);
    emit('challenge', { fn: c.fn, m: c.m, time: time, streak: n, last3: last3 });
  }
  $('newChal').addEventListener('click', function () {
    if (state.chal) { state.streak = []; }   // 換一題：連勝歸零
    startChal();
  });
  $('quitChal').addEventListener('click', quitChal);
  function renderLog() {
    const t = $('log');
    $('logEmpty').hidden = state.log.length > 0;
    if (!state.log.length) { t.innerHTML = ''; return; }
    const rows = state.log.slice(-8).reverse();
    let h = '<tr><th>' + T('題', '#') + '</th><th>' + T('函數', 'Function') + '</th><th>m</th><th>a</th><th>' + T('秒', 's') + '</th></tr>';
    rows.forEach(function (r) {
      h += '<tr><td>' + r.round + '</td><td class="f">' + r.fn.replace(/-/g, '−') + '</td><td>' + trimN(r.m, 2) + '</td><td>' + (r.a == null ? '—' : trimN(r.a, 2)) + '</td><td>' +
        (r.time == null ? T('放棄', 'gave up') : r.time.toFixed(1)) + '</td></tr>';
    });
    t.innerHTML = h;
  }

  // 給測試用的介面（不影響畫面）
  window.__dv = {
    state: state,
    quantities: quantities,
    startChal: function (c) { startChal(c); },
    seed: function (s) { rand = DC.rng(s); },
    coverage: coverage
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  state.k = { a: val(coefEls.a), b: val(coefEls.b), c: val(coefEls.c), d: val(coefEls.d) };
  state.a = val(elA);
  if (window.LabNum) { applying = true; window.LabNum.set(elH, 1); applying = false; }   // 預設 h 剛好是 1
  refreshOutputs();
  renderLog();
  updateSoundButton();
  updatePlayLabel();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    for (const id in eqKeys) delete eqKeys[id];
    renderLog(); updateReadouts(); updatePlayLabel(); updateSoundButton();
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'lang') themeChanged(); });
  const stage = $('stage');
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW || cv2.clientWidth !== cw2) { lastW = cv.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden) { stopPlay(); } });
  resize();
  updateReadouts();
})();
