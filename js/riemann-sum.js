/* riemann-sum.js — 「黎曼和、定積分與旋轉體」的畫面與互動（數學計算在 riemann-sum-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 上圖：y = f(x) 與 n 個長方形（左端點、右端點、中點、梯形，或上和與下和），準確的面積淡淡塗在底下；可拖曳 a、b 兩條直線。
 * 下圖：誤差 |S_n − ∫f| 對 n 的雙對數圖（端點法斜率約 −1，中點與梯形約 −2）。
 * 3D：js/riemann-sum-3d.js（three.js 延遲載入），曲線繞 x 軸旋轉，用圓盤（梯形是圓台）疊出旋轉體。 */
(function () {
  'use strict';
  const R = window.RiemannCore;
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
  const PLAY_NS = [1, 2, 4, 8, 16, 32, 64, 128];

  // ---------- 狀態 ----------
  const state = {
    key: 'sq', a: 0, b: 2, n: 6, rule: 'mid', showErr: true, view: '2d',
    play: null, chal: null, round: 0, streak: [], log: []
  };
  let rand = R.rng(((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0);
  let lastChal = null, applying = false;

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'probe',
      'rs-curve', 'rs-pos', 'rs-neg', 'rs-up', 'rs-pt', 'rs-area', 'rs-left', 'rs-mid', 'rs-trap', 'rs-ul']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight, italic) { return (italic ? 'italic ' : '') + (weight ? weight + ' ' : '') + px + 'px ' + FONT; }
  function num(v, dec) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(dec);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function tr(v, dec) { return R.trim(v, dec == null ? 3 : dec).replace('-', '−'); }
  function tx(v, dec) { return R.trim(v, dec == null ? 4 : dec); }
  function sci(v) {
    if (v == null || !isFinite(v)) return '—';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e-3) return num(v, a >= 1 ? 4 : 5);
    const e = Math.floor(Math.log10(a)), m = v / Math.pow(10, e);
    return m.toFixed(2).replace('-', '−') + ' × 10<sup>' + String(e).replace('-', '−') + '</sup>';
  }
  const RULE_NAME = {
    left: function () { return T('左端點', 'left'); }, right: function () { return T('右端點', 'right'); },
    mid: function () { return T('中點', 'midpoint'); }, trap: function () { return T('梯形', 'trapezoid'); },
    upper: function () { return T('上和', 'upper'); }, lower: function () { return T('下和', 'lower'); },
    ul: function () { return T('上和與下和', 'upper and lower'); }
  };
  function rule3() { return state.rule === 'ul' ? 'upper' : state.rule; }

  // ---------- 目前的量 ----------
  let qCache = null, qKey = '';
  function Q() {
    const k = state.key + '|' + state.a + '|' + state.b + '|' + state.n + '|' + state.rule;
    if (qKey === k && qCache) return qCache;
    const s = R.all(state.key, state.a, state.b, state.n);
    const S = state.rule === 'ul' ? null : s[state.rule];
    const q = {
      key: state.key, a: state.a, b: state.b, n: state.n, rule: state.rule, all: s, I: s.exact, S: S,
      err: S == null ? null : S - s.exact, U: s.upper, L: s.lower,
      V: R.volSum(state.key, state.a, state.b, state.n, rule3()), Vx: R.volExact(state.key, state.a, state.b)
    };
    qKey = k; qCache = q;
    return q;
  }
  let serCache = null, serKey = '';
  function series() {
    const k = state.key + '|' + state.a + '|' + state.b;
    if (serKey === k && serCache) return serCache;
    const o = {};
    ['left', 'right', 'mid', 'trap', 'upper', 'lower'].forEach(function (r) { o[r] = R.errSeries(state.key, state.a, state.b, r, R.N_MAX); });
    serKey = k; serCache = o;
    return o;
  }

  // ---------- 畫布 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 500, L = null;
  function layout() {
    const narrow = cw < 600;
    const left = narrow ? 46 : 58, right = cw - (narrow ? 12 : 18);
    const h1 = narrow ? 270 : 340, t1 = 16, b1 = t1 + h1;
    if (!state.showErr) return { narrow: narrow, left: left, right: right, t1: t1, b1: b1, H: b1 + 30 };
    const h2 = narrow ? 170 : 190, t2 = b1 + 52, b2 = t2 + h2;
    return { narrow: narrow, left: left, right: right, t1: t1, b1: b1, t2: t2, b2: b2, H: b2 + 34 };
  }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w; L = layout(); ch = L.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    requestDraw();
  }
  let rafId = 0;
  function requestDraw() {
    if (view3) { view3.rebuild(); return; }
    if (!rafId) rafId = requestAnimationFrame(function () { rafId = 0; draw(); });
  }

  function niceStep(span, target) {
    const raw = span / Math.max(1, target), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }
  function frameOf(rect, xr, yr) {
    return {
      r: rect, xr: xr, yr: yr,
      X: function (x) { return rect.x0 + (x - xr[0]) / (xr[1] - xr[0]) * (rect.x1 - rect.x0); },
      Y: function (y) { return rect.y1 - (y - yr[0]) / (yr[1] - yr[0]) * (rect.y1 - rect.y0); },
      xOf: function (px) { return xr[0] + (px - rect.x0) / (rect.x1 - rect.x0) * (xr[1] - xr[0]); }
    };
  }
  function panelBg(c, F) {
    const r = F.r;
    c.save();
    D.roundRect(c, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, 6);
    c.fillStyle = alpha(C.text, D.dark ? 0.03 : 0.022); c.fill();
    c.restore();
  }

  function draw() {
    if (!L) return;
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    D.backdrop(c, cw, ch);
    drawMain(c);
    if (state.showErr) drawErr(c);
  }

  // ---------- 上圖：曲線與長方形 ----------
  let MF = null;     // 目前的座標框（拖曳用）
  function viewX() {
    if (state.chal) { const ch2 = state.chal, w = ch2.bMax - ch2.a; return [ch2.a - 0.06 * w, ch2.bMax + 0.06 * w]; }
    const w = state.b - state.a;
    return [state.a - 0.12 * w, state.b + 0.12 * w];
  }
  function drawMain(c) {
    const F0 = R.FUNCS[state.key], f = F0.f, q = Q();
    const xr = viewX();
    const c0 = Math.max(xr[0], F0.dom[0]), c1 = Math.min(xr[1], F0.dom[1]);
    let lo = 0, hi = 0;
    for (let i = 0; i <= 300; i++) { const y = f(c0 + (c1 - c0) * i / 300); if (isFinite(y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); } }
    if (state.rule === 'ul' || state.rule === 'right' || state.rule === 'left') for (let i = 0; i < state.n; i++) { const p = R.piece(state.key, state.a, state.b, state.n, 'upper', i); hi = Math.max(hi, p.y); }
    if (hi - lo < 1e-9) hi = lo + 1;
    const pad = (hi - lo) * 0.1;
    const F = frameOf({ x0: L.left, x1: L.right, y0: L.t1 + 6, y1: L.b1 }, xr, [lo - (lo < 0 ? pad : 0), hi + pad]);
    MF = F;
    const r = F.r;
    panelBg(c, F);
    // 格線與刻度（挑戰時寫出每格面積）
    const sx = niceStep(xr[1] - xr[0], L.narrow ? 5 : 9), sy = niceStep(F.yr[1] - F.yr[0], 6);
    c.save();
    c.lineWidth = 1; c.font = fnt(11); c.fillStyle = C.muted;
    for (let x = Math.ceil(xr[0] / sx - 1e-9) * sx; x <= xr[1] + 1e-9; x += sx) {
      const px = F.X(x);
      c.strokeStyle = alpha(C.text, state.chal ? 0.14 : 0.08); c.beginPath(); c.moveTo(px, r.y0); c.lineTo(px, r.y1); c.stroke();
      c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(tr(x, 3), px, r.y1 + 5);
    }
    for (let y = Math.ceil(F.yr[0] / sy - 1e-9) * sy; y <= F.yr[1] + 1e-9; y += sy) {
      const py = F.Y(y);
      c.strokeStyle = alpha(C.text, state.chal ? 0.14 : 0.08); c.beginPath(); c.moveTo(r.x0, py); c.lineTo(r.x1, py); c.stroke();
      c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(tr(y, 3), r.x0 - 6, py);
    }
    // x 軸
    const y0 = F.Y(0);
    c.strokeStyle = alpha(C.text, 0.55); c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(r.x0, y0); c.lineTo(r.x1, y0); c.stroke();
    if (xr[0] < 0 && xr[1] > 0) { c.beginPath(); c.moveTo(F.X(0), r.y0); c.lineTo(F.X(0), r.y1); c.stroke(); }
    c.restore();
    // 準確的面積（淡色）
    c.save();
    c.beginPath();
    c.moveTo(F.X(state.a), y0);
    const N = Math.max(60, Math.round(F.X(state.b) - F.X(state.a)));
    for (let i = 0; i <= N; i++) { const x = state.a + (state.b - state.a) * i / N; c.lineTo(F.X(x), F.Y(f(x))); }
    c.lineTo(F.X(state.b), y0); c.closePath();
    c.fillStyle = alpha(C['rs-area'], state.chal ? 0.22 : 0.10); c.fill();
    c.restore();
    // 長方形
    if (!state.chal) drawPieces(c, F, q);
    // a、b 兩條直線
    const close = F.X(state.b) - F.X(state.a) < 84;
    [['a', state.a], ['b', state.b]].forEach(function (e) {
      const px = F.X(e[1]);
      c.save(); c.strokeStyle = alpha(C.text, 0.6); c.lineWidth = 1.4; c.setLineDash([5, 4]);
      c.beginPath(); c.moveTo(px, r.y0 + 4); c.lineTo(px, r.y1); c.stroke(); c.restore();
      D.pill(c, e[0] + ' = ' + tr(e[1], 3), close ? px + (e[0] === 'a' ? -3 : 3) : px, r.y0 + 20, C.text, close ? (e[0] === 'a' ? 'right' : 'left') : 'center', fnt(11.5, 700, false));
    });
    // 曲線
    c.save();
    c.beginPath(); c.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); c.clip();
    c.lineJoin = 'round'; c.lineCap = 'round';
    const M = Math.max(120, Math.round(F.X(c1) - F.X(c0)));
    c.beginPath();
    for (let i = 0; i <= M; i++) { const x = c0 + (c1 - c0) * i / M, px = F.X(x), py = F.Y(f(x)); if (i) c.lineTo(px, py); else c.moveTo(px, py); }
    c.strokeStyle = alpha(C['rs-curve'], 0.18); c.lineWidth = 7; c.stroke();
    c.strokeStyle = C['rs-curve']; c.lineWidth = 2.6; c.stroke();
    c.restore();
    // 取樣點
    if (!state.chal && state.n <= 40 && state.rule !== 'ul') {
      for (let i = 0; i < state.n; i++) {
        const p = R.piece(state.key, state.a, state.b, state.n, state.rule, i);
        const rad = state.n <= 12 ? 5 : 3.6;
        if (p.x != null) D.ball(c, F.X(p.x), F.Y(p.y), rad, C['rs-pt'], {});
        else { D.ball(c, F.X(p.l), F.Y(p.yl), rad, C['rs-pt'], {}); D.ball(c, F.X(p.r), F.Y(p.yr), rad, C['rs-pt'], {}); }
      }
    }
    // 函數名稱與數值
    const fx = F.X(c1) - 8, fy = F.Y(f(c1 - (c1 - c0) * 0.02));
    const ly = Math.max(r.y0 + 34, Math.min(r.y1 - 12, fy - 14));
    if (state.key === 'exp') D.supText(c, 'y = e', 'x', Math.min(fx, r.x1 - 6), ly + 4, C['rs-curve'], fnt(13, 700, true), 'right');
    else D.haloText(c, 'y = ' + fname(), Math.min(fx, r.x1 - 6), ly, C['rs-curve'], 'right', 'middle', fnt(13, 700, true));
    if (state.chal) {
      const ch2 = state.chal;
      D.pill(c, T('目標面積 ', 'target area ') + tr(ch2.T, 2) + T('　每格 ', '   one square = ') + tr(sx * sy, 4), r.x0 + 8, r.y0 + 44, C.accent, 'left', fnt(12.5, 700));
    } else {
      const txt = state.rule === 'ul' ? T('上和 ', 'upper ') + num(q.U, 4) + T('　下和 ', '   lower ') + num(q.L, 4)
        : RULE_NAME[state.rule]() + ' S = ' + num(q.S, 4);
      D.pill(c, txt, r.x0 + 8, r.y0 + 44, C['rs-pos'], 'left', fnt(12, 700));
      D.pill(c, '∫ = ' + num(q.I, 4), r.x0 + 8, r.y0 + 66, C['rs-area'], 'left', fnt(12, 700));
    }
  }
  function fname(plain) {
    return ({ sq: 'x²', sin: 'sin x', sqrt: '√x', exp: plain ? 'exp(x)' : 'e^x', recip: '1/x', semi: '√(4 − x²)' })[state.key];
  }
  function drawPieces(c, F, q) {
    const r = F.r, y0 = F.Y(0), n = state.n;
    const thin = (F.X(state.b) - F.X(state.a)) / n < 4;
    c.save();
    c.beginPath(); c.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); c.clip();
    if (state.rule === 'ul') {
      // 上和：虛線框；下和：實心
      for (let i = 0; i < n; i++) {
        const u = R.piece(state.key, state.a, state.b, n, 'upper', i), w = R.piece(state.key, state.a, state.b, n, 'lower', i);
        const x0 = F.X(u.l), x1 = F.X(u.r);
        c.fillStyle = alpha(C['rs-up'], 0.16);
        c.fillRect(x0, Math.min(F.Y(u.y), y0), x1 - x0, Math.abs(F.Y(u.y) - y0));
        if (!thin) { c.strokeStyle = alpha(C['rs-up'], 0.9); c.lineWidth = 1.2; c.setLineDash([4, 3]); c.strokeRect(x0, Math.min(F.Y(u.y), y0), x1 - x0, Math.abs(F.Y(u.y) - y0)); c.setLineDash([]); }
        rectFill(c, x0, x1, y0, F.Y(w.y), w.y, thin);
      }
    } else {
      for (let i = 0; i < n; i++) {
        const p = R.piece(state.key, state.a, state.b, n, state.rule, i), x0 = F.X(p.l), x1 = F.X(p.r);
        if (state.rule === 'trap') {
          const neg = p.y < 0, col = neg ? C['rs-neg'] : C['rs-pos'];
          c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0, F.Y(p.yl)); c.lineTo(x1, F.Y(p.yr)); c.lineTo(x1, y0); c.closePath();
          const g = c.createLinearGradient(0, Math.min(F.Y(p.yl), F.Y(p.yr)), 0, y0);
          g.addColorStop(0, alpha(col, 0.5)); g.addColorStop(1, alpha(col, 0.2));
          c.fillStyle = g; c.fill();
          if (!thin) { c.strokeStyle = alpha(col, 0.95); c.lineWidth = 1.2; c.stroke(); }
        } else rectFill(c, x0, x1, y0, F.Y(p.y), p.y, thin);
      }
    }
    c.restore();
  }
  function rectFill(c, x0, x1, y0, yt, v, thin) {
    const col = v < 0 ? C['rs-neg'] : C['rs-pos'];
    const top = Math.min(yt, y0), h = Math.abs(yt - y0);
    const g = c.createLinearGradient(0, top, 0, top + h);
    if (v < 0) { g.addColorStop(0, alpha(col, 0.2)); g.addColorStop(1, alpha(col, 0.5)); }
    else { g.addColorStop(0, alpha(col, 0.5)); g.addColorStop(1, alpha(col, 0.2)); }
    c.fillStyle = g; c.fillRect(x0, top, x1 - x0, h);
    if (!thin) {
      c.strokeStyle = alpha(col, 0.95); c.lineWidth = 1.2; c.strokeRect(x0 + 0.5, top, x1 - x0 - 1, h);
      // 上緣高光
      c.strokeStyle = alpha('#ffffff', D.dark ? 0.18 : 0.5); c.beginPath(); c.moveTo(x0 + 1.5, (v < 0 ? top + h : top) + (v < 0 ? -1.5 : 1.5)); c.lineTo(x1 - 1.5, (v < 0 ? top + h : top) + (v < 0 ? -1.5 : 1.5)); c.stroke();
    }
  }

  // ---------- 下圖：誤差的雙對數圖 ----------
  const SER_COL = { left: 'rs-left', right: 'rs-left', mid: 'rs-mid', trap: 'rs-trap', upper: 'rs-ul', lower: 'rs-ul' };
  function drawErr(c) {
    const P = { x0: L.left, x1: L.right - (L.narrow ? 0 : 128), y0: L.t2, y1: L.b2 };
    D.haloText(c, T('誤差 |S − ∫f| 和分段數 n（兩軸都是對數刻度）', 'error |S − ∫f| against n (both axes logarithmic)'), L.left, L.t2 - 14, C.muted, 'left', 'middle', fnt(11.5, 600));
    if (state.chal) {
      const F0 = frameOf(P, [0, 1], [0, 1]); panelBg(c, F0);
      D.haloText(c, T('挑戰中隱藏', 'hidden during the challenge'), (P.x0 + P.x1) / 2, (P.y0 + P.y1) / 2, C.muted, 'center', 'middle', fnt(13, 600));
      return;
    }
    const S = series();
    const show = ['left', 'mid', 'trap'];
    if (state.rule === 'right') show.push('right');
    if (state.rule === 'ul') show.push('upper', 'lower');
    // 低於這個門檻的誤差只是捨入雜訊（例如整個週期的 sin）：不畫，標成「≈ 0」
    const floor = 1e-11 * Math.max(1, Math.abs(Q().I), Math.abs(Q().U), Math.abs(Q().L));
    let ymin = Infinity, ymax = -Infinity;
    show.forEach(function (k) { S[k].forEach(function (e) { const a = Math.abs(e); if (a > floor) { const l = Math.log10(a); if (l < ymin) ymin = l; if (l > ymax) ymax = l; } }); });
    if (!isFinite(ymin)) { ymin = -6; ymax = 0; }
    ymin = Math.max(ymin, ymax - 9);
    const yr = [Math.floor(ymin - 0.2), Math.ceil(ymax + 0.2)];
    const F = frameOf(P, [0, Math.log10(R.N_MAX)], yr);
    panelBg(c, F);
    c.save();
    c.lineWidth = 1; c.font = fnt(10.5); c.fillStyle = C.muted;
    [1, 2, 5, 10, 20, 50, 100, 200].forEach(function (n) {
      const px = F.X(Math.log10(n));
      c.strokeStyle = alpha(C.text, n === 1 || n === 10 || n === 100 ? 0.12 : 0.06); c.beginPath(); c.moveTo(px, P.y0); c.lineTo(px, P.y1); c.stroke();
      c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(String(n), px, P.y1 + 5);
    });
    const step = yr[1] - yr[0] > 6 ? 2 : 1;
    for (let e = yr[0]; e <= yr[1]; e++) {
      const py = F.Y(e);
      c.strokeStyle = alpha(C.text, 0.08); c.beginPath(); c.moveTo(P.x0, py); c.lineTo(P.x1, py); c.stroke();
      if ((e - yr[0]) % step === 0) { c.save(); powLabel(c, e, P.x0 - 6, py); c.restore(); }
    }
    c.strokeStyle = alpha(C.text, 0.45); c.lineWidth = 1;
    c.beginPath(); c.moveTo(P.x0, P.y0); c.lineTo(P.x0, P.y1); c.lineTo(P.x1, P.y1); c.stroke();
    c.restore();
    D.haloText(c, 'n', P.x1, P.y1 + 24, C.muted, 'right', 'middle', fnt(11.5, 700, true));
    // 各條曲線（目前的取法畫粗）
    const cur = state.rule === 'ul' ? ['upper', 'lower'] : [state.rule];
    const order = show.filter(function (k) { return cur.indexOf(k) < 0; }).concat(cur.filter(function (k) { return show.indexOf(k) >= 0; }));
    const ends = [];
    order.forEach(function (k) {
      const on = cur.indexOf(k) >= 0, col = C[SER_COL[k]];
      c.save();
      c.beginPath(); c.rect(P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0); c.clip();
      c.strokeStyle = on ? col : alpha(col, 0.5); c.lineWidth = on ? 2.6 : 1.5; c.lineJoin = 'round';
      if (k === 'right' || k === 'lower') c.setLineDash([6, 4]);
      c.beginPath();
      let pen = false;
      S[k].forEach(function (e, i) {
        const a = Math.abs(e);
        if (!(a > floor)) { pen = false; return; }
        const px = F.X(Math.log10(i + 1)), py = F.Y(Math.log10(a));
        if (!pen) { c.moveTo(px, py); pen = true; } else c.lineTo(px, py);
      });
      c.stroke();
      c.restore();
      // 斜率（n = 100 到 200）
      const e1 = Math.abs(S[k][99]), e2 = Math.abs(S[k][199]);
      if (e1 > floor && e2 > floor) ends.push({ k: k, on: on, col: col, y: F.Y(Math.log10(e2)), slope: Math.log10(e2 / e1) / Math.log10(2) });
      else if (e2 <= floor) ends.push({ k: k, on: on, col: col, y: P.y1 - 6, zero: true });
    });
    // 曲線名稱與斜率，放在右邊，互相推開
    ends.sort(function (p, q2) { return p.y - q2.y; });
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
    if (ends.length) {
      const over = ends[ends.length - 1].y - (P.y1 - 6);
      if (over > 0) ends.forEach(function (e) { e.y -= over; });
    }
    ends.forEach(function (e) {
      const label = RULE_NAME[e.k]() + (e.zero ? T(' 誤差 ≈ 0', ' error ≈ 0') : T(' 斜率 ', ' slope ') + num(e.slope, 2));
      if (L.narrow) D.haloText(c, label, P.x1 - 4, Math.min(P.y1 - 8, Math.max(P.y0 + 8, e.y - 10)), e.on ? e.col : alpha(e.col, 0.8), 'right', 'middle', fnt(10.5, e.on ? 700 : 500));
      else D.haloText(c, label, P.x1 + 6, Math.min(P.y1, Math.max(P.y0 + 6, e.y)), e.on ? e.col : alpha(e.col, 0.85), 'left', 'middle', fnt(11, e.on ? 700 : 500));
    });
    // 目前的 n
    const px = F.X(Math.log10(state.n));
    c.save(); c.strokeStyle = alpha(C.accent, 0.7); c.lineWidth = 1.3; c.setLineDash([3, 3]);
    c.beginPath(); c.moveTo(px, P.y0); c.lineTo(px, P.y1); c.stroke(); c.restore();
    cur.forEach(function (k) {
      const a = Math.abs(S[k][state.n - 1]);
      if (a > floor) D.ball(c, px, F.Y(Math.log10(a)), 5.5, C[SER_COL[k]], { glow: 0.4 });
    });
  }
  function powLabel(c, e, x, y) {
    if (e === 0) { D.haloText(c, '1', x, y, C.muted, 'right', 'middle', fnt(10.5)); return; }
    if (e === 1) { D.haloText(c, '10', x, y, C.muted, 'right', 'middle', fnt(10.5)); return; }
    D.supText(c, '10', String(e).replace('-', '−'), x, y + 4, C.muted, fnt(10.5), 'right');
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
    const q = Q(), hide = !!state.chal;
    const H = function (s) { return hide ? '？' : s; };
    setHTML('rI', H(num(q.I, 6)));
    if (state.rule === 'ul') {
      setHTML('rS', H(T('上 ', 'U ') + num(q.U, 5) + T('／下 ', ' / L ') + num(q.L, 5)));
      setHTML('rE', H(T('上 − 下 = ', 'U − L = ') + sci(q.U - q.L)));
      setHTML('rEn', H(num((q.U - q.L) * q.n, 4)));
      setHTML('rEn2', H(num((q.U - q.L) * q.n * q.n, 3)));
    } else {
      setHTML('rS', H(num(q.S, 6)));
      setHTML('rE', H(sci(q.err)));
      setHTML('rEn', H(num(q.err * q.n, 4)));
      setHTML('rEn2', H(num(q.err * q.n * q.n, 3)));
    }
    setHTML('rV', H(num(q.V, 4)));
    setHTML('rVx', H(num(q.Vx, 4)));
    // 六種取法的比較表
    let h = '<tr><th>' + T('取法', 'method') + '</th><th>' + T('和', 'sum') + '</th><th>' + T('誤差', 'error') + '</th></tr>';
    ['left', 'right', 'mid', 'trap', 'upper', 'lower'].forEach(function (r) {
      const on = state.rule === r || (state.rule === 'ul' && (r === 'upper' || r === 'lower'));
      h += '<tr' + (on ? ' class="on"' : '') + '><td>' + RULE_NAME[r]() + '</td><td>' + H(num(q.all[r], 5)) + '</td><td>' + H(sci(q.all[r] - q.I)) + '</td></tr>';
    });
    setHTML('rulesTbl', h);
    const F0 = R.FUNCS[state.key], aa = tx(q.a), bb = tx(q.b);
    if (hide) setEq('\\int_{' + aa + '}^{\\,b} ' + F0.tex + '\\,dx = ' + tx(state.chal.T, 2) + '\\ ?');
    else setEq('\\int_{' + aa + '}^{' + bb + '} ' + F0.tex + '\\,dx = \\Big[' + F0.Ftex + '\\Big]_{' + aa + '}^{' + bb + '} \\approx ' + tx(q.I, 5) +
      '\\qquad S_{' + q.n + '} = \\sum_{i=1}^{' + q.n + '} f(x_i^*)\\,\\Delta x' + (q.S == null ? '' : ' \\approx ' + tx(q.S, 5)));
    setHTML('status', statusText(q));
  }
  function statusText(q) {
    if (state.chal) return T('只移動 b，讓淡紫色的面積等於目標。', 'Move only b until the shaded area equals the target.');
    if (state.key === 'sin' && Math.abs(q.I) < 1e-3 && state.b - state.a > 1) return T('正負抵消：軸下方的面積抵消了軸上方的面積，積分是 0。', 'Cancelling out: the area below the axis cancels the area above it, so the integral is 0.');
    if (q.I < 0) return T('積分是負的：軸下方的部分比較多。', 'The integral is negative: more of the area lies below the axis.');
    if (state.rule === 'ul') return T('真正的面積夾在上和與下和之間；n 越大，兩者越靠近。', 'The true area is trapped between the upper and lower sums; they close in as n grows.');
    if (state.rule === 'mid' || state.rule === 'trap') return T('n 加倍，誤差大約變成 1/4（誤差 × n² 幾乎不變）。', 'Doubling n divides the error by about 4 (error × n² hardly changes).');
    return T('n 加倍，誤差大約減半（誤差 × n 幾乎不變）。', 'Doubling n roughly halves the error (error × n hardly changes).');
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
  function tick(n) { const S = sound(); if (S) S.tone({ freq: 300 * Math.pow(2, Math.log2(n) / 3), dur: 0.09, type: 'sine', gain: 0.14 }); }
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

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function emitNow() {
    const q = Q(), s = q.all;
    emit('riemann', {
      f: state.key, a: q.a, b: q.b, n: q.n, rule: q.rule, S: q.S, I: q.I, err: q.err, U: q.U, L: q.L,
      left: s.left, right: s.right, mid: s.mid, trap: s.trap, V: q.V, Vx: q.Vx, view3d: !!(view3 && view3.active), chal: !!state.chal
    });
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  const elA = $('aa'), elB = $('bb'), elN = $('nn');
  function setSlider(el, v) {
    applying = true;
    if (window.LabNum) window.LabNum.set(el, v); else el.value = v;
    applying = false;
  }
  function refreshOutputs() {
    $('aao').textContent = tr(state.a, 4);
    $('bbo').textContent = tr(state.b, 4);
    $('nno').textContent = String(state.n);
    document.querySelectorAll('#funcs button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-f') === state.key)); b.disabled = !!state.chal; });
    document.querySelectorAll('#rules button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-r') === state.rule)); });
    elA.disabled = !!state.chal;
  }
  /** 讀滑桿並把區間限制在定義域內（moved：剛改的是 a 還是 b） */
  function readAll(moved) {
    const ab = R.clampAB(state.key, val(elA), val(elB), moved);
    state.a = ab[0]; state.b = ab[1];
    if (Math.abs(val(elA) - ab[0]) > 1e-9) setSlider(elA, ab[0]);
    if (Math.abs(val(elB) - ab[1]) > 1e-9) setSlider(elB, ab[1]);
    state.n = Math.max(1, Math.min(R.N_MAX, Math.round(val(elN))));
  }
  function changed(final, moved) {
    readAll(moved);
    refreshOutputs(); updateReadouts(); requestDraw();
    emitNow();
    if (final) judgeChal();
  }
  elA.addEventListener('input', function () { if (!applying) changed(false, 'a'); });
  elA.addEventListener('change', function () { if (!applying) changed(true, 'a'); });
  elB.addEventListener('input', function () { if (!applying) changed(false, 'b'); });
  elB.addEventListener('change', function () { if (!applying) changed(true, 'b'); });
  elN.addEventListener('input', function () { if (!applying) { if (state.play) stopPlay(false); changed(false); } });
  elN.addEventListener('change', function () { if (!applying) { if (state.play) stopPlay(false); changed(true); } });
  function setFunc(k) {
    state.key = k;
    const d = R.FUNCS[k].def;
    setSlider(elA, d[0]); setSlider(elB, d[1]);
    changed(true);
  }
  document.querySelectorAll('#funcs button').forEach(function (b) {
    b.addEventListener('click', function () { if (!state.chal) setFunc(b.getAttribute('data-f')); });
  });
  document.querySelectorAll('#rules button').forEach(function (b) {
    b.addEventListener('click', function () { state.rule = b.getAttribute('data-r'); changed(true); });
  });
  $('showErr').addEventListener('change', function () { state.showErr = $('showErr').checked; resize(); });

  // ---------- n 一直加倍 ----------
  let playTimer = 0;
  function startPlay() {
    state.play = { i: 0 };
    $('play').textContent = T('停止', 'Stop');
    playStep();
  }
  function playStep() {
    const p = state.play; if (!p) return;
    setSlider(elN, PLAY_NS[p.i]);
    changed(false);
    tick(PLAY_NS[p.i]);
    p.i++;
    if (p.i >= PLAY_NS.length) { playTimer = setTimeout(function () { stopPlay(true); }, reducedMotion ? 200 : 500); return; }
    playTimer = setTimeout(playStep, reducedMotion ? 250 : 700);
  }
  function stopPlay(finished) {
    clearTimeout(playTimer);
    state.play = null;
    $('play').textContent = T('n 一直加倍', 'Double n');
    if (finished) { chime(true); emit('play', { f: state.key, rule: state.rule }); }
  }
  $('play').addEventListener('click', function () { if (state.play) stopPlay(false); else startPlay(); });
  $('clear').addEventListener('click', function () {
    if (state.chal) quitChal(true);
    if (state.play) stopPlay(false);
    state.log = []; state.streak = []; state.round = 0; lastChal = null;
    setChalMsg(''); renderLog();
    emit('clear', {});
    const S = sound(); if (S) S.tone({ freq: 392, dur: 0.1, type: 'triangle', gain: 0.14 });
  });

  // ---------- 拖曳 a、b ----------
  let drag = null;
  cv.addEventListener('pointerdown', function (ev) {
    if (!MF) return;
    const rc = cv.getBoundingClientRect(), x = ev.clientX - rc.left, y = ev.clientY - rc.top;
    if (y < MF.r.y0 || y > MF.r.y1 + 10) return;
    const da = Math.abs(x - MF.X(state.a)), db = Math.abs(x - MF.X(state.b));
    const which = Math.min(da, db) > 22 ? null : (db <= da ? 'b' : 'a');
    if (!which || (which === 'a' && state.chal)) return;
    drag = { id: ev.pointerId, which: which };
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    ev.preventDefault();
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!drag || drag.id !== ev.pointerId) {
      if (MF && ev.pointerType === 'mouse') {
        const rc = cv.getBoundingClientRect(), x = ev.clientX - rc.left;
        const near = Math.min(Math.abs(x - MF.X(state.a)), Math.abs(x - MF.X(state.b))) <= 22;
        cv.style.cursor = near ? 'ew-resize' : '';
      }
      return;
    }
    const rc = cv.getBoundingClientRect();
    const v = Math.round(MF.xOf(ev.clientX - rc.left) * 100) / 100;
    setSlider(drag.which === 'a' ? elA : elB, v);
    changed(false, drag.which);
  });
  function endDrag(ev) { if (!drag || drag.id !== ev.pointerId) return; const w = drag.which; drag = null; changed(true, w); }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  if (window.LabKeys) {
    window.LabKeys.attach(cv, {
      label: T('黎曼和畫布。左右方向鍵改變分段數 n，按住 Shift 一次改 10。', 'Riemann sum canvas. Left and right arrow keys change the number of strips n; hold Shift to change it by 10.'),
      items: [{
        name: function () { return T('分段數 n', 'strips n'); },
        move: function (dx, dy, big) {
          if (!dx) return false;
          setSlider(elN, Math.max(1, Math.min(R.N_MAX, state.n + dx * (big ? 10 : 1))));
          changed(true);
          tick(state.n);
          return true;
        },
        describe: function () { const q = Q(); return 'n = ' + q.n + (q.S == null ? '' : T('，和 ', ', sum ') + num(q.S, 4)) + T('，積分 ', ', integral ') + num(q.I, 4); }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 挑戰：估計面積
  // =====================================================================
  const chalMsg = $('chalMsg');
  function setChalMsg(msg, ok) { chalMsg.textContent = msg || ''; chalMsg.classList.toggle('ok', !!ok); }
  function startChal(forced) {
    const ch2 = forced || R.genChallenge(rand, lastChal);
    if (!ch2) { setChalMsg(T('出不了題，請再按一次。', 'Could not make a challenge; please try again.')); return; }
    if (state.play) stopPlay(false);
    state.round++;
    state.chal = { key: ch2.key, a: ch2.a, T: ch2.T, b0: ch2.b0, bMax: ch2.bMax, tol: ch2.tol, t0: performance.now(), round: state.round };
    lastChal = ch2;
    state.key = ch2.key;
    setSlider(elA, ch2.a); setSlider(elB, ch2.b0);
    setChalMsg(T('第 ' + state.round + ' 題：只移動 b，讓面積等於 ' + tr(ch2.T, 2) + '（放開滑桿才判定）。', 'Challenge ' + state.round + ': move only b until the area is ' + tr(ch2.T, 2) + ' (judged when you release the slider).'));
    $('quitChal').hidden = false;
    $('newChal').textContent = T('換一題', 'Another one');
    changed(false);
  }
  function judgeChal() {
    const ch2 = state.chal;
    if (!ch2 || ch2.key !== state.key || Math.abs(state.a - ch2.a) > 1e-9) return;
    if (!R.chalHit(ch2, state.b)) return;
    const time = (performance.now() - ch2.t0) / 1000;
    const got = R.exact(ch2.key, ch2.a, state.b);
    state.log.push({ round: ch2.round, T: ch2.T, got: got, time: time });
    state.streak.push(time);
    const last3 = state.streak.length >= 3 ? state.streak.slice(-3).reduce(function (s, x) { return s + x; }, 0) : null;
    state.chal = null;
    $('quitChal').hidden = true;
    $('newChal').textContent = T('出下一題', 'Next challenge');
    setChalMsg(T('答對了！面積是 ', 'Correct! The area is ') + num(got, 3) + T('（目標 ', ' (target ') + tr(ch2.T, 2) + T('），用了 ', '), in ') + time.toFixed(1) + T(' 秒。', ' s.'), true);
    chime(true);
    renderLog();
    refreshOutputs(); updateReadouts(); requestDraw();
    emit('challenge', { time: time, streak: state.streak.length, last3: last3 });
    emitNow();
  }
  function quitChal(silent) {
    const ch2 = state.chal;
    if (!ch2) return;
    state.log.push({ round: ch2.round, T: ch2.T, got: null, time: null });
    state.chal = null; state.streak = [];
    $('quitChal').hidden = true;
    $('newChal').textContent = T('出一題', 'New challenge');
    if (!silent) {
      // 告訴他答案：解 ∫ = T 的 b（二分法）
      let lo = ch2.a, hi = ch2.bMax;
      for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (R.exact(ch2.key, ch2.a, m) < ch2.T) lo = m; else hi = m; }
      setChalMsg(T('這題放棄了。b 大約是 ', 'Given up. b should be about ') + num(lo, 2) + T('；連續答對重新計算。', '; the streak starts over.'));
    } else setChalMsg('');
    renderLog();
    refreshOutputs(); updateReadouts(); requestDraw();
  }
  $('newChal').addEventListener('click', function () { if (state.chal) quitChal(true); startChal(); });
  $('quitChal').addEventListener('click', function () { quitChal(false); });
  function renderLog() {
    const t = $('log');
    $('logEmpty').hidden = state.log.length > 0;
    if (!state.log.length) { t.innerHTML = ''; return; }
    let h = '<tr><th>' + T('題', '#') + '</th><th>' + T('目標', 'target') + '</th><th>' + T('做到', 'got') + '</th><th>' + T('秒', 's') + '</th></tr>';
    state.log.slice(-8).reverse().forEach(function (r) {
      h += '<tr><td>' + r.round + '</td><td>' + tr(r.T, 2) + '</td><td>' + (r.got == null ? '—' : num(r.got, 3)) + '</td><td>' +
        (r.time == null ? T('放棄', 'gave up') : r.time.toFixed(1)) + '</td></tr>';
    });
    t.innerHTML = h;
  }

  // =====================================================================
  // 3D 檢視（js/riemann-sum-3d.js，按「3D 旋轉體」時才載入）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    T: T, D: D, R: R, state: state,
    colors: function () { readColors(); return C; },
    quantities: Q, rule3: rule3, num: num, tr: tr, fname: fname,
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 面積圖。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.RiemannSum3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.RiemannSum3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/riemann-sum-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.RiemannSum3D) throw new Error('riemann-sum-3d.js did not load');
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
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        view3 = window.RiemannSum3D.create(lib, host3, bridge);
        state.view = '3d';
        viewMsg.textContent = '';
        emit('view3d', { f: state.key });
        emitNow();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      if (view3) { view3.dispose(); view3 = null; }
      state.view = '2d';
      stage.classList.remove('is3d');
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resize();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    state.view = '2d';
    stage.classList.remove('is3d');
    setPressed('2d');
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 面積圖。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D drawing is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // 給測試用的介面（不影響畫面）
  window.__rs = {
    state: state, Q: Q,
    startChal: function (c) { startChal(c); },
    seed: function (s) { rand = R.rng(s); },
    is3d: function () { return !!(view3 && view3.active); }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  readAll();
  refreshOutputs();
  renderLog();
  updateSoundButton();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    eqKey = '';
    renderLog(); refreshOutputs(); updateReadouts(); updateSoundButton();
    if (!state.play) $('play').textContent = T('n 一直加倍', 'Double n');
    if (view3) view3.onTheme();
    else requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'lang') themeChanged(); });
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden && state.play) stopPlay(false); });
  resize();
  updateReadouts();
})();
