/* regression.js — 「散布圖、相關係數與迴歸直線」的畫面與互動（數學計算在 regression-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 左（窄畫面在上）：x、y 同單位長的散布圖。點一下加點、拖曳移動、刪除工具點一下刪掉；迴歸直線、我的直線、殘差、殘差平方（真正的正方形）、
 *   離均差乘積（點到平均點的長方形，正藍負紅）、平均點；可切換成標準化（z 分數）的圖。
 * 右（窄畫面在下）：相關係數 r 的計量表、殘差平方和的長條（迴歸直線＝最小值、我的直線）、離均差乘積正負兩邊的總和。
 * 挑戰：出一團 r 已知的點，數字藏起來，猜 r（±0.05）。 */
(function () {
  'use strict';
  const RC = window.RegressionCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha;

  // ---------- 狀態 ----------
  const state = {
    pts: RC.preset('default'), set: 'default',
    tool: 'add', snap: false,
    show: { line: true, resid: false, sq: false, rect: false, z: false },
    mine: { on: false, m: 0, c: 10 },
    sel: -1,
    chal: null, round: 0, streak: 0, log: [],
    flags: {}
  };
  const undoStack = [];
  let rand = RC.rng(((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0);
  let lastChal = null;
  let applying = false;

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface',
      'rg-data', 'rg-line', 'rg-mine', 'rg-sq', 'rg-pos', 'rg-neg', 'rg-mean']
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
  function tr(v, dec) { return RC.trim(v, dec == null ? 2 : dec).replace('-', '−'); }
  function tx(v, dec) { return RC.trim(v, dec == null ? 3 : dec); }
  /** 直線 y = m x + c 的文字 */
  function lineText(m, c, dec) {
    if (m == null) return '—';
    const d = dec == null ? 3 : dec;
    const mm = RC.trim(m, d), cc = RC.trim(Math.abs(c), d);
    let s = 'y = ' + (mm === '0' ? '' : mm === '1' ? 'x' : mm === '-1' ? '−x' : mm.replace('-', '−') + 'x');
    if (cc !== '0' || mm === '0') s += mm === '0' ? (c < 0 && cc !== '0' ? '−' : '') + cc : (c < 0 ? ' − ' : ' + ') + cc;
    return s;
  }
  function texLine(m, c) {
    const mm = RC.trim(m, 3), cc = RC.trim(Math.abs(c), 3);
    let s = '\\hat y = ' + (mm === '0' ? '' : mm === '1' ? 'x' : mm === '-1' ? '-x' : mm + 'x');
    if (cc !== '0' || mm === '0') s += mm === '0' ? (c < 0 && cc !== '0' ? '-' : '') + cc : (c < 0 ? ' - ' : ' + ') + cc;
    return s;
  }

  // ---------- 目前的量 ----------
  function shownPts() { return state.chal ? state.chal.pts : state.pts; }
  function hiding() { return !!(state.chal && !state.chal.done); }
  let qCache = null, qKey = '';
  function Q() {
    const pts = shownPts();
    const key = pts.length + ':' + pts.map(function (p) { return p[0] + ',' + p[1]; }).join(';') + '|' + state.mine.m + ',' + state.mine.c;
    if (key === qKey && qCache) return qCache;
    const s = RC.stats(pts);
    s.mineSse = RC.sse(pts, state.mine.m, state.mine.c);
    s.quad = RC.quadFit(pts);
    let pos = 0, neg = 0;
    if (s.n) pts.forEach(function (p) { const v = (p[0] - s.mx) * (p[1] - s.my); if (v > 0) pos += v; else neg -= v; });
    s.pos = pos; s.neg = neg;
    qKey = key; qCache = s;
    return s;
  }

  // ---------- 畫布 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 520, L = null;
  function layout() {
    const narrow = cw < 600;
    if (narrow) {
      const left = 34, right = cw - 10, side = right - left, top = 12;
      const y1 = top + side;
      const g0 = y1 + 34;
      // 計量表的高度：r 的計量表 82；殘差平方和標題 20、每條 22、比值 20（挑戰還沒猜時只有 r 的計量表）
      const rows = state.mine.on && !state.chal ? 2 : 1;
      const gh = hiding() ? 70 : 82 + 20 + 22 * rows + (rows === 2 ? 22 : 0) + 6;
      return { narrow: true, plot: { x0: left, x1: right, y0: top, y1: y1 }, gauge: { x0: 12, x1: cw - 12, y0: g0 }, H: g0 + gh };
    }
    const left = 46, top = 14;
    const side = Math.round(Math.min(560, Math.max(320, cw * 0.6 - 60)));
    const x1 = left + side, y1 = top + side;
    return { narrow: false, plot: { x0: left, x1: x1, y0: top, y1: y1 }, gauge: { x0: x1 + 34, x1: cw - 18, y0: top + 6 }, H: y1 + 34 };
  }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    L = layout();
    ch = L.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    requestDraw();
  }
  let rafId = 0;
  function requestDraw() { if (!rafId) rafId = requestAnimationFrame(function () { rafId = 0; draw(); }); }

  /** 目前的坐標框（一般：0–20；標準化：−3.2–3.2） */
  function frameNow() {
    const r = L.plot, z = state.show.z && !hiding();
    const xr = z ? [-3.2, 3.2] : RC.XR, yr = z ? [-3.2, 3.2] : RC.YR;
    return {
      r: r, xr: xr, yr: yr, z: z,
      X: function (x) { return r.x0 + (x - xr[0]) / (xr[1] - xr[0]) * (r.x1 - r.x0); },
      Y: function (y) { return r.y1 - (y - yr[0]) / (yr[1] - yr[0]) * (r.y1 - r.y0); },
      ux: function (px) { return xr[0] + (px - r.x0) / (r.x1 - r.x0) * (xr[1] - xr[0]); },
      uy: function (py) { return yr[0] + (r.y1 - py) / (r.y1 - r.y0) * (yr[1] - yr[0]); },
      k: (r.x1 - r.x0) / (xr[1] - xr[0])
    };
  }
  /** 畫在圖上的點（標準化時換成 z 分數） */
  function plotPts(F, s) {
    const pts = shownPts();
    if (!F.z) return pts;
    if (!(s.sx > 0) || !(s.sy > 0)) return [];
    return pts.map(function (p) { return [(p[0] - s.mx) / s.sx, (p[1] - s.my) / s.sy]; });
  }

  // ---------- 繪圖 ----------
  function draw() {
    if (!L) return;
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    D.backdrop(c, cw, ch);
    const s = Q(), F = frameNow();
    drawPlot(c, F, s);
    drawGauges(c, s);
  }
  function drawGrid(c, F) {
    const r = F.r;
    c.save();
    D.roundRect(c, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, 6);
    c.fillStyle = alpha(C.text, D.dark ? 0.03 : 0.022); c.fill();
    c.lineWidth = 1;
    const step = F.z ? 0.5 : 1, lab = F.z ? 1 : (L.narrow ? 5 : 2);
    c.font = fnt(11); c.fillStyle = C.muted;
    for (let v = Math.ceil(F.xr[0] / step - 1e-9) * step; v <= F.xr[1] + 1e-9; v += step) {
      const major = Math.abs(v / lab - Math.round(v / lab)) < 1e-9;
      const px = F.X(v), py = F.Y(v);
      c.strokeStyle = alpha(C.text, major ? 0.1 : 0.045);
      c.beginPath(); c.moveTo(px, r.y0); c.lineTo(px, r.y1); c.stroke();
      if (v >= F.yr[0] - 1e-9 && v <= F.yr[1] + 1e-9) { c.beginPath(); c.moveTo(r.x0, py); c.lineTo(r.x1, py); c.stroke(); }
      if (major) {
        const t = tr(v, 1);
        c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(t, px, r.y1 + 5);
        c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(t, r.x0 - 6, py);
      }
    }
    c.strokeStyle = alpha(C.text, 0.4);
    if (F.z) {
      c.beginPath(); c.moveTo(F.X(0), r.y0); c.lineTo(F.X(0), r.y1); c.moveTo(r.x0, F.Y(0)); c.lineTo(r.x1, F.Y(0)); c.stroke();
    } else {
      c.beginPath(); c.moveTo(r.x0, r.y0); c.lineTo(r.x0, r.y1); c.lineTo(r.x1, r.y1); c.stroke();
    }
    c.restore();
    // 軸名
    c.save();
    if (F.z) {
      D.haloText(c, T('z 分數（x）', 'z-score (x)'), r.x1 - 4, F.Y(0) - 8, C.muted, 'right', 'bottom', fnt(11));
      D.haloText(c, T('z 分數（y）', 'z-score (y)'), F.X(0) + 6, r.y0 + 6, C.muted, 'left', 'top', fnt(11));
    } else {
      D.haloText(c, 'x', r.x1 - 6, r.y1 - 8, C.muted, 'right', 'bottom', fnt(13, 600, true));
      D.haloText(c, 'y', r.x0 + 8, r.y0 + 6, C.muted, 'left', 'top', fnt(13, 600, true));
    }
    c.restore();
  }
  function clipPlot(c, F) { const r = F.r; c.beginPath(); c.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); c.clip(); }
  function drawLine(c, F, m, b, color, width, dash) {
    const r = F.r;
    c.save(); clipPlot(c, F);
    c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round';
    if (dash) c.setLineDash(dash);
    c.beginPath(); c.moveTo(r.x0, F.Y(m * F.xr[0] + b)); c.lineTo(r.x1, F.Y(m * F.xr[1] + b)); c.stroke();
    c.restore();
  }
  /** 直線標籤放在畫面右側、直線還在框內的地方 */
  function labelOnLine(c, F, m, b, text, color, above) {
    const r = F.r;
    let x = F.xr[1] - (F.xr[1] - F.xr[0]) * 0.04;
    for (let k = 0; k < 40; k++) {
      const y = m * x + b;
      if (y >= F.yr[0] + 0.05 * (F.yr[1] - F.yr[0]) && y <= F.yr[1] - 0.05 * (F.yr[1] - F.yr[0])) break;
      x -= (F.xr[1] - F.xr[0]) / 40;
    }
    const y = m * x + b;
    if (y < F.yr[0] || y > F.yr[1]) return;
    const px = Math.min(r.x1 - 6, F.X(x)), py = F.Y(y) + (above ? -12 : 22);
    D.pill(c, text, px, Math.max(r.y0 + 18, Math.min(r.y1 - 4, py)), color, 'right', fnt(12, 600));
  }
  function drawPlot(c, F, s) {
    drawGrid(c, F);
    const P = plotPts(F, s), hide = hiding();
    const mean = F.z ? [0, 0] : [s.mx, s.my];
    // 用哪一條直線算殘差
    let lm = null, lb = null, lineOn = false;
    if (!hide && s.m != null) {
      if (F.z) { lm = s.r == null ? 0 : s.r; lb = 0; }
      else if (state.mine.on && !state.chal) { lm = state.mine.m; lb = state.mine.c; }
      else { lm = s.m; lb = s.c; }
      lineOn = true;
    } else if (!hide && state.mine.on && !state.chal && !F.z && s.n) { lm = state.mine.m; lb = state.mine.c; lineOn = true; }

    c.save(); clipPlot(c, F);
    // 離均差乘積的長方形
    if (state.show.rect && !hide && s.n >= 2 && mean[0] != null) {
      P.forEach(function (p) {
        const v = (p[0] - mean[0]) * (p[1] - mean[1]);
        if (Math.abs(v) < 1e-12) return;
        const col = v > 0 ? C['rg-pos'] : C['rg-neg'];
        const x0 = F.X(Math.min(p[0], mean[0])), x1 = F.X(Math.max(p[0], mean[0]));
        const y0 = F.Y(Math.max(p[1], mean[1])), y1 = F.Y(Math.min(p[1], mean[1]));
        c.fillStyle = alpha(col, D.dark ? 0.14 : 0.1); c.fillRect(x0, y0, x1 - x0, y1 - y0);
        c.strokeStyle = alpha(col, 0.5); c.lineWidth = 1; c.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
      });
    }
    // 殘差平方（正方形：邊長 = |殘差|，x、y 同單位長）
    if (state.show.sq && lineOn) {
      const cx = (F.r.x0 + F.r.x1) / 2;
      P.forEach(function (p) {
        const yh = lm * p[0] + lb, e = p[1] - yh, side = Math.abs(e) * F.k;
        if (side < 0.5) return;
        const px = F.X(p[0]), py = F.Y(p[1]), pl = F.Y(yh);
        const xs = px < cx ? px : px - side, ys = Math.min(py, pl);
        const g = c.createLinearGradient(xs, ys, xs + side, ys + side);
        g.addColorStop(0, alpha(C['rg-sq'], D.dark ? 0.26 : 0.2)); g.addColorStop(1, alpha(C['rg-sq'], D.dark ? 0.14 : 0.1));
        c.fillStyle = g; c.fillRect(xs, ys, side, side);
        c.strokeStyle = alpha(C['rg-sq'], 0.7); c.lineWidth = 1.2; c.strokeRect(xs + 0.5, ys + 0.5, side - 1, side - 1);
      });
    }
    c.restore();
    // 平均點的十字線
    if (!hide && s.n >= 1 && mean[0] != null && (state.show.rect || F.z)) {
      c.save(); clipPlot(c, F);
      c.strokeStyle = alpha(C['rg-mean'], 0.55); c.lineWidth = 1.2; c.setLineDash([5, 5]);
      c.beginPath(); c.moveTo(F.X(mean[0]), F.r.y0); c.lineTo(F.X(mean[0]), F.r.y1); c.moveTo(F.r.x0, F.Y(mean[1])); c.lineTo(F.r.x1, F.Y(mean[1])); c.stroke();
      c.restore();
    }
    // 殘差線段
    if (state.show.resid && lineOn) {
      c.save(); clipPlot(c, F);
      c.strokeStyle = C['rg-sq']; c.lineWidth = 2; c.setLineDash([4, 3]);
      P.forEach(function (p) { const yh = lm * p[0] + lb; c.beginPath(); c.moveTo(F.X(p[0]), F.Y(p[1])); c.lineTo(F.X(p[0]), F.Y(yh)); c.stroke(); });
      c.restore();
    }
    // 迴歸直線
    if (!hide && state.show.line && s.m != null) {
      const m = F.z ? (s.r == null ? 0 : s.r) : s.m, b = F.z ? 0 : s.c;
      drawLine(c, F, m, b, alpha(C['rg-line'], 0.25), 7);
      drawLine(c, F, m, b, C['rg-line'], 2.6);
    } else if (!hide && state.show.line && s.n >= 2 && s.Sxx === 0 && !F.z) {
      // x 全相同：鉛直線，不是函數，畫成虛線提示
      c.save(); clipPlot(c, F);
      c.strokeStyle = alpha(C['rg-line'], 0.5); c.lineWidth = 2; c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(F.X(s.mx), F.r.y0); c.lineTo(F.X(s.mx), F.r.y1); c.stroke();
      c.restore();
    }
    // 我的直線
    if (state.mine.on && !state.chal && !F.z) drawLine(c, F, state.mine.m, state.mine.c, C['rg-mine'], 2.4, [9, 6]);
    // 點
    const rad = L.narrow ? 6 : 6.5;
    P.forEach(function (p, i) {
      if (p[0] < F.xr[0] - 0.5 || p[0] > F.xr[1] + 0.5 || p[1] < F.yr[0] - 0.5 || p[1] > F.yr[1] + 0.5) return;
      const px = F.X(p[0]), py = F.Y(p[1]);
      D.ball(c, px, py, rad, C['rg-data']);
      if (i === state.sel && !state.chal && !F.z) {
        c.save(); c.strokeStyle = C.accent; c.lineWidth = 2; c.setLineDash([3, 3]);
        c.beginPath(); c.arc(px, py, rad + 5, 0, Math.PI * 2); c.stroke(); c.restore();
      }
    });
    // 平均點
    if (!hide && s.n >= 1 && mean[0] != null) {
      const px = F.X(mean[0]), py = F.Y(mean[1]);
      c.save();
      c.fillStyle = C['canvas-bg'] || C.surface; c.strokeStyle = C['rg-mean']; c.lineWidth = 2.4;
      c.beginPath(); c.arc(px, py, 7, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(px - 4, py); c.lineTo(px + 4, py); c.moveTo(px, py - 4); c.lineTo(px, py + 4); c.lineWidth = 1.6; c.stroke();
      c.restore();
      if (state.show.rect || F.z || s.n <= 3) D.haloText(c, T('平均點', 'mean'), px + 10, py - 8, C['rg-mean'], 'left', 'bottom', fnt(11, 600));
    }
    // 直線的標籤
    if (!hide && state.show.line && s.m != null) {
      const m = F.z ? (s.r == null ? 0 : s.r) : s.m, b = F.z ? 0 : s.c;
      const text = F.z ? T('z(y) = ', 'z(y) = ') + tr(m, 3) + ' z(x)' : lineText(m, b, 2);
      labelOnLine(c, F, m, b, text, C['rg-line'], !(state.mine.on && state.mine.m > m));
    }
    if (state.mine.on && !state.chal && !F.z) labelOnLine(c, F, state.mine.m, state.mine.c, T('我的 ', 'mine ') + lineText(state.mine.m, state.mine.c, 2), C['rg-mine'], !(s.m != null && state.show.line && state.mine.m <= s.m));
    // 沒有點時的提示
    if (!P.length) D.haloText(c, F.z ? T('點太少，不能標準化', 'Too few points to standardise') : T('點一下加點', 'Tap to add points'), (F.r.x0 + F.r.x1) / 2, (F.r.y0 + F.r.y1) / 2, C.muted, 'center', 'middle', fnt(15, 600));
    // 鍵盤焦點
    if (kb && kb.focused() && kb.index() === 2 && state.mine.on) {
      c.save(); c.strokeStyle = C.accent; c.setLineDash([4, 4]); c.lineWidth = 1.5;
      D.roundRect(c, F.r.x0 + 3, F.r.y0 + 3, F.r.x1 - F.r.x0 - 6, F.r.y1 - F.r.y0 - 6, 6); c.stroke(); c.restore();
    }
  }

  // ---------- 右側（窄畫面在下）的計量表 ----------
  function drawGauges(c, s) {
    const g = L.gauge, w = g.x1 - g.x0, hide = hiding();
    let y = g.y0;
    // r 計量表
    D.haloText(c, T('相關係數 r', 'Correlation r'), g.x0, y + 8, C.text, 'left', 'middle', fnt(13, 700));
    const rText = hide ? '?' : s.r == null ? T('無法計算', 'undefined') : num(s.r, 3);
    D.haloText(c, rText, g.x1, y + 8, hide ? C.muted : C.text, 'right', 'middle', fnt(15, 700));
    y += 26;
    const bx0 = g.x0 + 6, bx1 = g.x1 - 6, bh = 12;
    const X = function (v) { return bx0 + (v + 1) / 2 * (bx1 - bx0); };
    c.save();
    const grad = c.createLinearGradient(bx0, 0, bx1, 0);
    grad.addColorStop(0, alpha(C['rg-neg'], 0.75)); grad.addColorStop(0.5, alpha(C.muted, 0.25)); grad.addColorStop(1, alpha(C['rg-pos'], 0.75));
    D.roundRect(c, bx0, y, bx1 - bx0, bh, bh / 2); c.fillStyle = grad; c.fill();
    c.font = fnt(10.5); c.fillStyle = C.muted; c.textAlign = 'center'; c.textBaseline = 'top';
    [-1, -0.5, 0, 0.5, 1].forEach(function (v) {
      c.strokeStyle = alpha(C.text, 0.35); c.lineWidth = 1;
      c.beginPath(); c.moveTo(X(v), y + bh); c.lineTo(X(v), y + bh + 4); c.stroke();
      c.fillText(v === 0 ? '0' : tr(v, 1), X(v), y + bh + 5);
    });
    c.restore();
    const tri = function (v, color, up) {
      const px = X(Math.max(-1, Math.min(1, v)));
      c.save(); c.fillStyle = color; c.strokeStyle = C['canvas-bg'] || C.surface; c.lineWidth = 1.5;
      c.beginPath();
      if (up) { c.moveTo(px, y + bh + 1); c.lineTo(px - 7, y + bh + 13); c.lineTo(px + 7, y + bh + 13); }
      else { c.moveTo(px, y + bh - 1); c.lineTo(px - 7, y - 11); c.lineTo(px + 7, y - 11); }
      c.closePath(); c.fill(); c.stroke(); c.restore();
    };
    if (state.chal) tri(state.chal.guess, C['rg-mine'], true);
    if (!hide && s.r != null) tri(s.r, C.text, false);
    y += bh + 22;
    const words = hide ? T('猜猜看：點排得多像一條直線？', 'How close to a straight line are they?') : s.r == null ? '' : strength(s.r);
    if (words) D.haloText(c, words, (bx0 + bx1) / 2, y, C.muted, 'center', 'top', fnt(11.5));
    y += L.narrow ? 22 : 34;
    if (hide) return;
    // 殘差平方和
    const minS = s.sse, mineOn = state.mine.on && !state.chal;
    D.haloText(c, T('殘差平方和（正方形總面積）', 'Sum of squared residuals (total area)'), g.x0, y, C.text, 'left', 'top', fnt(12.5, 700));
    y += 20;
    const rows = [];
    if (!hide && minS != null) rows.push({ name: T('迴歸直線（最小）', 'regression (least)'), v: minS, col: C['rg-line'] });
    if (mineOn && s.n) rows.push({ name: T('我的直線', 'my line'), v: s.mineSse, col: C['rg-mine'] });
    if (!rows.length) { D.haloText(c, '—', g.x0, y + 6, C.muted, 'left', 'middle', fnt(12)); y += 24; }
    const vmax = Math.max.apply(null, rows.map(function (r) { return r.v; }).concat([1e-9])) * 1.08;
    const nameW = L.narrow ? Math.min(118, w * 0.4) : Math.min(132, w * 0.42), valW = 54;
    rows.forEach(function (r) {
      D.haloText(c, r.name, g.x0, y + 7, C.muted, 'left', 'middle', fnt(11.5));
      const x0 = g.x0 + nameW, x1 = g.x1 - valW, bw = Math.max(2, (x1 - x0) * r.v / vmax);
      c.save(); D.roundRect(c, x0, y, bw, 14, 4); c.fillStyle = alpha(r.col, 0.8); c.fill(); c.restore();
      D.haloText(c, num(r.v, r.v >= 100 ? 1 : 2), g.x1, y + 7, C.text, 'right', 'middle', fnt(12, 600));
      y += 22;
    });
    if (mineOn && minS != null && minS > 1e-9) {
      D.haloText(c, T('我的 ÷ 最小 = ', 'mine ÷ least = ') + num(s.mineSse / minS, 3), g.x1, y + 2, s.mineSse <= 1.02 * minS + 1e-9 ? C['rg-data'] : C.muted, 'right', 'top', fnt(11.5, 600));
      y += 20;
    }
    if (L.narrow || hide) return;
    // 離均差乘積的正負總和
    y += 14;
    D.haloText(c, T('離均差乘積的總和', 'Sums of products of deviations'), g.x0, y, C.text, 'left', 'top', fnt(12.5, 700));
    y += 20;
    const pmax = Math.max(s.pos || 0, s.neg || 0, 1e-9) * 1.08;
    [{ name: T('正（右上、左下）', 'positive'), v: s.pos || 0, col: C['rg-pos'] }, { name: T('負（左上、右下）', 'negative'), v: s.neg || 0, col: C['rg-neg'] }].forEach(function (r) {
      D.haloText(c, r.name, g.x0, y + 7, C.muted, 'left', 'middle', fnt(11.5));
      const x0 = g.x0 + nameW, x1 = g.x1 - valW, bw = Math.max(2, (x1 - x0) * r.v / pmax);
      c.save(); D.roundRect(c, x0, y, bw, 14, 4); c.fillStyle = alpha(r.col, 0.75); c.fill(); c.restore();
      D.haloText(c, num(r.v, r.v >= 100 ? 1 : 2), g.x1, y + 7, C.text, 'right', 'middle', fnt(12, 600));
      y += 22;
    });
    D.haloText(c, T('正的多，r > 0；負的多，r < 0', 'more positive: r > 0; more negative: r < 0'), g.x0, y + 4, C.muted, 'left', 'top', fnt(11.5));
  }
  function strength(r) {
    const a = Math.abs(r);
    if (a >= 0.99999) return T('完全在一條直線上', 'exactly on a line');
    const dir = r > 0 ? T('正', 'positive') : T('負', 'negative');
    if (a >= 0.7) return T('強烈的' + dir + '相關', 'strong ' + dir + ' correlation');
    if (a >= 0.3) return T('中度的' + dir + '相關', 'moderate ' + dir + ' correlation');
    if (a >= 0.1) return T('微弱的' + dir + '相關', 'weak ' + dir + ' correlation');
    return T('幾乎沒有直線關係', 'almost no straight-line relation');
  }

  // =====================================================================
  // 讀數與算式
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  let eqKey = '';
  function setEq(tex) {
    if (eqKey === tex) return;
    eqKey = tex;
    const el = $('rEq');
    if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); } catch (e) { el.textContent = tex; } }
    else el.textContent = tex;
  }
  function updateReadouts() {
    const s = Q(), hide = hiding();
    setHTML('rN', String(s.n));
    setHTML('rM', s.n ? (hide ? '?' : '(' + num(s.mx, 2) + ', ' + num(s.my, 2) + ')') : '—');
    setHTML('rS', s.n ? (hide ? '?' : num(s.sx, 2) + '、' + num(s.sy, 2)) : '—');
    setHTML('rR', hide ? '?' : s.r == null ? '—' : num(s.r, 3));
    setHTML('rL', hide ? '?' : lineText(s.m, s.c, 3));
    setHTML('rE', hide ? '?' : s.sse == null ? '—' : num(s.sse, 3));
    setHTML('rY', state.mine.on && !state.chal && s.n ? num(s.mineSse, 3) : '—');
    if (hide) setEq('r = \\;?');
    else if (s.n < 2) setEq('n = ' + s.n);
    else if (s.m == null) setEq('s_x = 0');
    else if (state.show.z) setEq('z_y = r\\,z_x = ' + tx(s.r == null ? 0 : s.r, 3) + '\\,z_x');
    else if (s.r == null) setEq('s_y = 0,\\quad ' + texLine(s.m, s.c));
    else setEq('\\hat y = \\bar y + r\\frac{s_y}{s_x}(x - \\bar x) = ' + tx(s.my, 3) + ' + ' + tx(s.r, 3).replace(/^-/, '(-') + (s.r < 0 ? ')' : '') + '\\cdot\\frac{' + tx(s.sy, 3) + '}{' + tx(s.sx, 3) + '}(x - ' + tx(s.mx, 3).replace(/^-/, '(-') + (s.mx < 0 ? ')' : '') + ') \\approx ' + texLine(s.m, s.c).replace('\\hat y = ', ''));
    setHTML('status', statusText(s));
  }
  function statusText(s) {
    if (state.chal) {
      if (!state.chal.done) return T('這團點的相關係數是多少？調「我猜 r」，再按「猜！」。', 'What is the correlation of this cloud? Set “My guess for r” and press “Guess!”.');
      return T('答案揭曉：r = ', 'Revealed: r = ') + num(state.chal.r, 3) + T('。按「出下一題」繼續，或「回到我的點」。', '. Press “Next challenge” or “Back to my points”.');
    }
    if (state.show.z) return s.r == null ? T('點太少（或都一樣），不能標準化。', 'Too few (or identical) points to standardise.')
      : T('標準化之後，平均點在原點、兩軸的標準差都是 1，迴歸直線的斜率就是 r。標準化的圖不能加點或拖曳。', 'After standardising, the mean point is the origin and both standard deviations are 1, so the regression slope is r itself. Points cannot be added or dragged here.');
    if (s.n < 2) return T('至少要 2 個點才算得出相關係數：點一下加點。', 'You need at least 2 points for a correlation: tap to add some.');
    if (s.m == null) return T('所有點的 x 都一樣：迴歸直線會是鉛直線，沒有斜率，r 也沒有定義。', 'All the points share one x: the line would be vertical, with no slope, and r is undefined.');
    if (s.r == null) return T('所有點的 y 都一樣：y 沒有變動，r 沒有定義，迴歸直線是水平線。', 'All the points share one y: y does not vary, r is undefined and the line is horizontal.');
    if (state.mine.on) {
      const k = s.sse > 1e-9 ? s.mineSse / s.sse : null;
      return k == null ? T('點都在迴歸直線上，最小的殘差平方和是 0。', 'The points are all on the regression line; the least sum is 0.')
        : k <= 1.02 ? T('很好！你的直線的殘差平方和只比最小值多 ' + num(100 * (k - 1), 1) + '%。', 'Very good! Your line is only ' + num(100 * (k - 1), 1) + '% above the least sum of squares.')
          : T('你的直線的殘差平方和是最小值的 ' + num(k, 2) + ' 倍：讓粉紅色正方形的總面積再小一點。', 'Your line’s sum of squares is ' + num(k, 2) + ' times the least: shrink the pink squares.');
    }
    if (['I', 'II', 'III', 'IV'].indexOf(state.set) >= 0) return T('安斯康姆 ' + state.set + '：r ≈ 0.816、迴歸直線 y ≈ 0.5x + 3，四組都一樣，圖卻完全不同。', 'Anscombe ' + state.set + ': r ≈ 0.816 and y ≈ 0.5x + 3, the same for all four sets, yet the pictures are completely different.');
    if (s.quad && s.quad.R2 != null && s.quad.R2 >= 0.999 && Math.abs(s.quad.a) >= 0.05 && Math.abs(s.r) < 0.5) return T('這些點整齊地排在一條拋物線上，但 r 只量「直線」關係。', 'These points sit neatly on a parabola, but r only measures straight-line relations.');
    if (Math.abs(s.r) >= 0.99999) return T('所有點都在同一條直線上：|r| = 1，殘差都是 0。', 'All the points are on one line: |r| = 1 and every residual is 0.');
    return strength(s.r) + T('（r = ', ' (r = ') + num(s.r, 3) + T('）。迴歸直線一定通過平均點。', '). The regression line always passes through the mean point.');
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
  function ping(freq, g, type) { const S = sound(); if (S) S.tone({ freq: freq, dur: 0.1, type: type || 'sine', gain: g || 0.16 }); }
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
  function checkFlags() {
    const s = Q(), f = {};
    if (!state.chal && s.r != null && s.n >= 5) { f.strong = Math.abs(s.r) >= 0.9; f.line = Math.abs(s.r) >= 0.99999; }
    if (!state.chal && state.mine.on && s.sse != null && s.n >= 3) f.best = s.mineSse <= 1.02 * s.sse + 1e-9;
    Object.keys(f).forEach(function (k) { if (f[k] && !state.flags[k]) chime(true); });
    state.flags = f;
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function emitPts() {
    const s = Q();
    emit('pts', {
      n: s.n, r: s.r, m: s.m, c: s.c, mx: s.mx, my: s.my, sse: s.sse, set: state.set,
      mine: state.mine.on && !state.chal ? { m: state.mine.m, c: state.mine.c, sse: s.mineSse } : null,
      quad: s.quad, zview: state.show.z, chal: !!state.chal
    });
  }

  // =====================================================================
  // 更新
  // =====================================================================
  function refresh() { qKey = ''; updateReadouts(); checkFlags(); requestDraw(); }
  function pushUndo() {
    undoStack.push({ pts: state.pts.map(function (p) { return p.slice(); }), set: state.set });
    if (undoStack.length > 60) undoStack.shift();
    $('undo').disabled = false;
  }
  function edited() { state.set = 'edited'; refreshSets(); }
  function refreshSets() {
    document.querySelectorAll('[data-set]').forEach(function (b) { b.setAttribute('aria-pressed', String(!state.chal && b.getAttribute('data-set') === state.set)); });
  }
  function refreshLock() {
    const locked = !!state.chal || state.show.z;
    cv.classList.toggle('locked', locked);
    cv.classList.toggle('del', !locked && state.tool === 'del');
    $('undo').disabled = locked || !undoStack.length;
  }

  // ---------- 範例資料、清除、復原 ----------
  function loadSet(key) {
    if (state.chal) quitChal(true);
    pushUndo();
    state.pts = RC.preset(key);
    state.set = key; state.sel = -1;
    refreshSets(); refresh();
    const S = sound(); if (S) { S.tone({ freq: 440, dur: 0.09, type: 'triangle', gain: 0.14 }); S.tone({ freq: 587.33, dur: 0.12, type: 'triangle', gain: 0.14, delay: 0.08 }); }
    emit('dataset', { set: key });
    emitPts();
  }
  document.querySelectorAll('[data-set]').forEach(function (b) { b.addEventListener('click', function () { loadSet(b.getAttribute('data-set')); }); });
  $('clear').addEventListener('click', function () {
    if (state.chal) quitChal(true);
    if (state.pts.length) pushUndo();
    state.pts = []; state.set = 'empty'; state.sel = -1;
    state.log = []; state.streak = 0; state.round = 0; lastChal = null;
    setChalMsg(''); renderLog(); refreshSets(); refresh(); refreshLock();
    ping(392, 0.14, 'triangle');
    emitPts();
  });
  $('undo').addEventListener('click', function () {
    if (state.chal || state.show.z || !undoStack.length) return;
    const u = undoStack.pop();
    state.pts = u.pts; state.set = u.set; state.sel = -1;
    refreshSets(); refresh(); refreshLock();
    ping(349.23, 0.12, 'triangle');
    emitPts();
  });

  // ---------- 工具與顯示 ----------
  document.querySelectorAll('[data-tool]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.tool = b.getAttribute('data-tool');
      document.querySelectorAll('[data-tool]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      refreshLock();
    });
  });
  $('snapC').addEventListener('change', function () { state.snap = $('snapC').checked; });
  [['lineC', 'line'], ['residC', 'resid'], ['sqC', 'sq'], ['rectC', 'rect'], ['zC', 'z']].forEach(function (a) {
    $(a[0]).addEventListener('change', function () {
      state.show[a[1]] = $(a[0]).checked;
      if (a[1] === 'z') { state.sel = -1; refreshLock(); }
      refresh();
      if (a[1] === 'sq') emit('squares', { on: state.show.sq, n: shownPts().length });
      if (a[1] === 'z') emitPts();
    });
  });
  const elM = $('mm'), elC = $('mc'), elG = $('rg');
  $('mineC').addEventListener('change', function () {
    state.mine.on = $('mineC').checked;
    $('mineBox').hidden = !state.mine.on;
    if (state.mine.on && state.pts.length >= 2) {
      // 從一條水平線開始：通過平均高度
      const s = RC.stats(state.pts);
      setSlider(elM, 0); setSlider(elC, Math.round(s.my * 10) / 10);
      readMine();
    }
    resize(); refresh(); emitPts();
  });
  function setSlider(el, v) {
    applying = true;
    if (window.LabNum) window.LabNum.set(el, v); else el.value = v;
    applying = false;
  }
  function readMine() {
    state.mine.m = val(elM); state.mine.c = val(elC);
    $('mmo').textContent = tr(state.mine.m, 3);
    $('mco').textContent = tr(state.mine.c, 2);
  }
  [elM, elC].forEach(function (el) {
    el.addEventListener('input', function () { if (!applying) { readMine(); refresh(); } });
    el.addEventListener('change', function () { if (!applying) { readMine(); refresh(); emitPts(); } });
  });
  elG.addEventListener('input', function () { $('rgo').textContent = tr(val(elG), 2); if (state.chal && !state.chal.done) { state.chal.guess = val(elG); requestDraw(); } });
  elG.addEventListener('change', function () { $('rgo').textContent = tr(val(elG), 2); if (state.chal && !state.chal.done) { state.chal.guess = val(elG); requestDraw(); } });

  // ---------- 在圖上加點、拖曳、刪除 ----------
  let drag = null;   // { id, i, r0, moved }
  function hitPoint(F, px, py, touch) {
    const pts = state.pts, R2 = Math.pow(touch ? 22 : 15, 2);
    let best = -1, bd = R2;
    for (let i = 0; i < pts.length; i++) {
      const dx = F.X(pts[i][0]) - px, dy = F.Y(pts[i][1]) - py, d = dx * dx + dy * dy;
      if (d <= bd) { bd = d; best = i; }
    }
    return best;
  }
  function posOf(ev) {
    const rc = cv.getBoundingClientRect();
    return { px: ev.clientX - rc.left, py: ev.clientY - rc.top };
  }
  function toData(F, px, py) {
    let x = F.ux(px), y = F.uy(py);
    if (state.snap) { x = RC.snap(x); y = RC.snap(y); }
    else { x = Math.round(x * 100) / 100; y = Math.round(y * 100) / 100; }
    return RC.clampPt([x, y]);
  }
  function inPlot(F, px, py) { const r = F.r; return px >= r.x0 - 8 && px <= r.x1 + 8 && py >= r.y0 - 8 && py <= r.y1 + 8; }
  cv.addEventListener('pointerdown', function (ev) {
    if (!L || state.chal || state.show.z) return;
    const F = frameNow(), p = posOf(ev);
    if (!inPlot(F, p.px, p.py)) return;
    const touch = ev.pointerType === 'touch' || ev.pointerType === 'pen';
    const i = hitPoint(F, p.px, p.py, touch);
    if (state.tool === 'del') {
      if (i < 0) return;
      ev.preventDefault();
      pushUndo();
      state.pts.splice(i, 1); state.sel = -1; edited();
      refresh(); refreshLock();
      ping(261.63, 0.16, 'triangle');
      emitPts();
      return;
    }
    ev.preventDefault();
    if (i >= 0) {
      pushUndo();
      drag = { id: ev.pointerId, i: i, r0: RC.stats(state.pts).r, moved: false };
      state.sel = i;
      try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
      requestDraw();
      return;
    }
    if (state.pts.length >= RC.N_MAX) { setHTML('status', T('最多 ' + RC.N_MAX + ' 個點。', 'At most ' + RC.N_MAX + ' points.')); return; }
    const before = RC.stats(state.pts);
    pushUndo();
    const q = toData(F, p.px, p.py);
    state.pts.push(q); state.sel = state.pts.length - 1; edited();
    const after = RC.stats(state.pts);
    refresh(); refreshLock();
    ping(330 + 22 * q[1], 0.15);
    emit('add', { n: after.n, before: { n: before.n, r: before.r, m: before.m, c: before.c }, after: { r: after.r, m: after.m, c: after.c }, chal: false });
    emitPts();
    // 新加的點也可以馬上拖
    drag = { id: ev.pointerId, i: state.sel, r0: after.r, moved: false, fresh: true };
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!drag || drag.id !== ev.pointerId) return;
    const F = frameNow(), p = posOf(ev);
    const q = toData(F, p.px, p.py), old = state.pts[drag.i];
    if (!old || (old[0] === q[0] && old[1] === q[1])) return;
    state.pts[drag.i] = q; drag.moved = true;
    edited(); refresh();
  });
  function endDrag(ev) {
    if (!drag || drag.id !== ev.pointerId) return;
    const d = drag; drag = null;
    if (!d.moved) { if (!d.fresh) undoStack.pop(); $('undo').disabled = !undoStack.length; return; }
    const s = RC.stats(state.pts);
    if (!d.fresh) emit('drag', { n: s.n, r0: d.r0, r1: s.r, chal: false });
    emitPts();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // ---------- 鍵盤 ----------
  let kb = null;
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('散布圖畫布。Enter 切換：選點、移動點、我的直線；方向鍵操作，Shift 加大。', 'Scatter plot canvas. Enter switches between choosing a point, moving it and my line; use the arrow keys, with Shift for bigger steps.'),
      items: [{
        name: function () { return T('選點', 'choose a point'); },
        move: function (dx) {
          if (!dx || state.chal || !state.pts.length) return false;
          const n = state.pts.length;
          state.sel = state.sel < 0 ? (dx > 0 ? 0 : n - 1) : (state.sel + dx + n) % n;
          return true;
        },
        describe: function () { const p = state.pts[state.sel]; return p ? T('第 ' + (state.sel + 1) + ' 個點 (', 'point ' + (state.sel + 1) + ' (') + tr(p[0], 2) + ', ' + tr(p[1], 2) + ')' : T('沒有點', 'no points'); }
      }, {
        name: function () { return T('移動點', 'move the point'); },
        move: function (dx, dy, big) {
          if (state.chal || state.show.z || state.sel < 0 || !state.pts[state.sel]) return false;
          const st = state.snap ? (big ? 2 : 0.5) : (big ? 1 : 0.1);
          const p = state.pts[state.sel], r0 = RC.stats(state.pts).r;
          pushUndo();
          state.pts[state.sel] = RC.clampPt([RC.round6(p[0] + dx * st), RC.round6(p[1] + dy * st)]);
          edited(); refresh();
          const s = RC.stats(state.pts);
          emit('drag', { n: s.n, r0: r0, r1: s.r, chal: false });
          emitPts();
          return true;
        },
        describe: function () { const p = state.pts[state.sel]; return p ? '(' + tr(p[0], 2) + ', ' + tr(p[1], 2) + ')，r = ' + num(Q().r, 3) : T('先選一個點', 'choose a point first'); }
      }, {
        name: function () { return T('我的直線', 'my line'); },
        move: function (dx, dy, big) {
          if (!state.mine.on || state.chal) return false;
          if (dx) setSlider(elM, Math.max(-3, Math.min(3, Math.round((state.mine.m + dx * (big ? 0.1 : 0.01)) * 1000) / 1000)));
          if (dy) setSlider(elC, Math.max(-30, Math.min(40, Math.round((state.mine.c + dy * (big ? 1 : 0.1)) * 100) / 100)));
          readMine(); refresh(); emitPts();
          return true;
        },
        describe: function () { return state.mine.on ? lineText(state.mine.m, state.mine.c, 3) : T('先勾選「我的直線」', 'turn on “My line” first'); }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 挑戰：猜 r
  // =====================================================================
  const chalMsg = $('chalMsg');
  function setChalMsg(msg, ok) { chalMsg.textContent = msg || ''; chalMsg.classList.toggle('ok', !!ok); }
  function startChal(forced) {
    const ch = forced || RC.genChallenge(rand, lastChal);
    if (!ch) { setChalMsg(T('出不了題，請再按一次。', 'Could not make a challenge; please try again.')); return; }
    state.round++;
    state.chal = { pts: ch.pts, r: ch.r, n: ch.n, guess: val(elG), done: false, round: state.round, t0: performance.now() };
    lastChal = ch;
    elG.disabled = false;
    $('guessBtn').hidden = false; $('quitChal').hidden = false;
    $('newChal').textContent = T('換一題', 'Another one');
    setChalMsg(T('第 ' + state.round + ' 題：' + ch.n + ' 個點，它們的相關係數 r 是多少？', 'Challenge ' + state.round + ': ' + ch.n + ' points. What is their correlation coefficient r?'));
    refreshSets(); refreshLock(); resize(); refresh();
    const S = sound(); if (S) S.tone({ freq: 523.25, dur: 0.1, type: 'triangle', gain: 0.14 });
  }
  function guess() {
    const ch = state.chal;
    if (!ch || ch.done) return;
    const g = val(elG);
    ch.guess = g; ch.done = true;
    const hit = RC.chalHit(ch, g);
    state.streak = hit ? state.streak + 1 : 0;
    state.log.push({ round: ch.round, r: ch.r, g: g, hit: hit });
    elG.disabled = true;
    $('guessBtn').hidden = true;
    $('newChal').textContent = T('出下一題', 'Next challenge');
    setChalMsg((hit ? T('猜中了！', 'A hit! ') : T('差了一點。', 'Not quite. ')) + T('r = ', 'r = ') + num(ch.r, 3) + T('，你猜 ', ', you guessed ') + num(g, 2) + T('（差 ', ' (off by ') + num(Math.abs(g - ch.r), 3) + T('）。', ').') +
      (state.streak >= 2 ? T('連續猜中 ' + state.streak + ' 題。', ' ' + state.streak + ' in a row.') : ''), hit);
    chime(hit);
    renderLog(); resize(); refresh();
    emit('challenge', { hit: hit, guess: g, r: ch.r, streak: state.streak });
  }
  function quitChal(silent) {
    const ch = state.chal;
    if (!ch) return;
    if (!ch.done) { state.log.push({ round: ch.round, r: ch.r, g: null, hit: false }); state.streak = 0; }
    state.chal = null;
    elG.disabled = true;
    $('guessBtn').hidden = true; $('quitChal').hidden = true;
    $('newChal').textContent = T('出一題', 'New challenge');
    if (!silent) setChalMsg(ch.done ? '' : T('這題沒有猜。答案是 r = ', 'Skipped. The answer was r = ') + num(ch.r, 3) + T('；連續猜中重新計算。', '; the streak starts over.'));
    else setChalMsg('');
    renderLog(); refreshSets(); refreshLock(); resize(); refresh();
  }
  $('newChal').addEventListener('click', function () {
    if (state.chal && !state.chal.done) { state.log.push({ round: state.chal.round, r: state.chal.r, g: null, hit: false }); state.streak = 0; }
    startChal();
    renderLog();
  });
  $('guessBtn').addEventListener('click', guess);
  $('quitChal').addEventListener('click', function () { quitChal(false); emitPts(); });
  function renderLog() {
    const t = $('log');
    $('logEmpty').hidden = state.log.length > 0;
    if (!state.log.length) { t.innerHTML = ''; return; }
    let h = '<tr><th>' + T('題', '#') + '</th><th>r</th><th>' + T('我猜', 'guess') + '</th><th>' + T('差', 'off by') + '</th><th></th></tr>';
    state.log.slice(-8).reverse().forEach(function (r) {
      h += '<tr><td>' + r.round + '</td><td>' + num(r.r, 3) + '</td><td>' + (r.g == null ? T('沒猜', 'skipped') : num(r.g, 2)) + '</td><td>' +
        (r.g == null ? '—' : num(Math.abs(r.g - r.r), 3)) + '</td><td>' + (r.hit ? '✓' : '') + '</td></tr>';
    });
    t.innerHTML = h;
  }

  // 給測試用的介面（不影響畫面）
  window.__rg = {
    state: state, Q: function () { qKey = ''; return Q(); },
    startChal: function (c) { startChal(c); },
    seed: function (s) { rand = RC.rng(s); },
    frame: function () { return frameNow(); }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  readMine();
  $('rgo').textContent = tr(val(elG), 2);
  $('undo').disabled = true;
  refreshSets();
  renderLog();
  updateSoundButton();
  checkFlags();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    eqKey = '';
    renderLog(); readMine(); refresh(); updateSoundButton();
    $('newChal').textContent = state.chal ? (state.chal.done ? T('出下一題', 'Next challenge') : T('換一題', 'Another one')) : T('出一題', 'New challenge');
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'lang') themeChanged(); });
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe($('stage'));
  } else window.addEventListener('resize', resize);
  resize();
  refreshLock();
  updateReadouts();
})();
