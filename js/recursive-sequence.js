/* recursive-sequence.js — 「遞迴數列與蛛網圖」的畫面與互動（數學計算在 recursive-sequence-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 蛛網圖模式：左（窄螢幕在上）是 y = f(x)、鏡子 y = x 與蛛網，右（下）是每一項 a_k 的折線圖；邏輯斯諦可以改看分岔圖。
 *   在蛛網圖上左右拖曳起點 (a_1, a_1) 改首項；「一步一步畫」逐項畫出蛛網（有音效時音高跟著項的大小）。
 * 費氏型模式：相鄰兩項的比值逼近 φ；兩個起始項都是正的時候，邊長 a_2、a_3、… 的正方形一圈圈貼成螺線。
 * 挑戰「猜遞迴」：給 a_(n+1) = p a_n + q 的前五項，調出 p、q、a_1 讓前六項都對。 */
(function () {
  'use strict';
  const M = window.RecCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha;
  const clampv = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  const r6 = function (v) { const w = Math.round(v * 1e6) / 1e6; return w === 0 ? 0 : w; };

  // ---------- 狀態 ----------
  const state = {
    mode: 'cob', fn: 'lin',
    P: { p: 0.5, q: 2, c: 1, k: 2, b: 10, r: 2.8 },
    s0: 0, x0: 0.2, n: 6, bif: false,
    f1: 1, f2: 1, fnN: 8,
    chal: null, round: 0, streak: [], log: []
  };
  let rand = M.rng(((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0);
  let lastChal = null, applying = false, anim = null;
  const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  // ---------- 色彩與字 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'rs-curve', 'rs-diag', 'rs-web', 'rs-dot', 'rs-fix', 'rs-phi', 'rs-sq1', 'rs-sq2', 'rs-target', 'rs-ok', 'rs-bad']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + px + 'px ' + FONT; }
  // 有上下標的畫布文字：「a_k」「a_{12}」畫成下標，「10^{19}」畫成上標
  function segs(text) {
    const out = [], re = /([_^])(\{[^}]*\}|[A-Za-z0-9∞]+)/g;
    let i = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > i) out.push({ t: text.slice(i, m.index), sub: 0 });
      out.push({ t: m[2].charAt(0) === '{' ? m[2].slice(1, -1) : m[2], sub: m[1] === '_' ? 1 : -1 });
      i = re.lastIndex;
    }
    if (i < text.length) out.push({ t: text.slice(i), sub: 0 });
    return out;
  }
  function richMeasure(c, ss, px, w) {
    let tw = 0;
    ss.forEach(function (s) { c.font = fnt(s.sub ? Math.round(px * 0.74 * 10) / 10 : px, w); s.w = c.measureText(s.t).width; tw += s.w; });
    return tw;
  }
  function richDraw(c, ss, x0, y, px, w, color, halo) {
    let x = x0;
    c.textAlign = 'left'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    ss.forEach(function (s) {
      c.font = fnt(s.sub ? Math.round(px * 0.74 * 10) / 10 : px, w);
      const yy = s.sub > 0 ? y + px * 0.3 : s.sub < 0 ? y - px * 0.36 : y;
      if (halo) { c.lineWidth = 4; c.strokeStyle = alpha(C['canvas-bg'], 0.92); c.strokeText(s.t, x, yy); }
      c.fillStyle = color; c.fillText(s.t, x, yy);
      x += s.w;
    });
  }
  function rText(c, text, x, y, color, align, px, w) {
    const ss = segs(text), tw = richMeasure(c, ss, px, w);
    richDraw(c, ss, align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x, y, px, w, color, true);
  }
  function rPill(c, text, x, yb, color, align, px) {
    const ss = segs(text), tw = richMeasure(c, ss, px, 700);
    const pw = tw + 12, ph = px + 7;
    const bx = align === 'center' ? x - pw / 2 : align === 'right' ? x - pw : x, by = yb - ph;
    D.roundRect(c, bx, by, pw, ph, ph / 2);
    c.fillStyle = alpha(C['canvas-bg'], D.dark ? 0.86 : 0.9); c.fill();
    c.strokeStyle = alpha(color, D.dark ? 0.45 : 0.35); c.lineWidth = 1; c.stroke();
    richDraw(c, ss, bx + 6, by + ph / 2 + 0.5 - (ss.some(function (s) { return s.sub; }) ? px * 0.08 : 0), px, 700, color, false);
    return { x: bx, y: by, w: pw, h: ph };
  }

  // ---------- 數字 ----------
  function fmt(v, d) {
    if (v == null || isNaN(v)) return '—';
    if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
    const s0 = M.sci(v);
    if (s0) return (String(s0.m) + ' × 10^{' + s0.e + '}').replace(/-/g, '−'); // 畫布用；HTML 用 fmtH
    let s = (Math.round(v * 1e9) / 1e9).toFixed(d == null ? 4 : d);
    if (s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, '');
    if (s === '-0') s = '0';
    return s.replace('-', '−');
  }
  function fmtH(v, d) {
    const s0 = isFinite(v) ? M.sci(v) : null;
    if (s0) return (String(s0.m) + ' × 10<sup>' + s0.e + '</sup>').replace(/-/g, '−');
    return fmt(v, d);
  }
  function fmtT(v, d) {
    const s0 = isFinite(v) ? M.sci(v) : null;
    if (s0) return String(s0.m) + ' \\times 10^{' + s0.e + '}';
    return fmt(v, d).replace(/−/g, '-');
  }
  /** 小的差距保留 3 位有效數字 */
  function fmtSmall(v) {
    if (!isFinite(v)) return '—';
    if (v === 0) return '0';
    if (Math.abs(v) >= 1 || M.sci(v)) return fmtH(v);
    return String(+v.toPrecision(3)).replace('-', '−');
  }

  // ---------- 目前的量 ----------
  function a1() { return state.fn === 'logi' ? state.x0 : state.s0; }
  function Q() {
    const ts = M.iterate(state.fn, state.P, a1(), state.n);
    const fixed = M.fixedPoints(state.fn, state.P);
    const period = state.fn === 'logi' ? M.logiPeriod(state.P.r, state.x0) : null;
    return { ts: ts, an: ts[ts.length - 1], full: ts.length === state.n, fixed: fixed, period: period };
  }
  function QF() {
    const ts = M.fibTerms(state.f1, state.f2, state.fnN), n = ts.length;
    return { ts: ts, an: ts[n - 1], ratio: ts[n - 2] !== 0 ? ts[n - 1] / ts[n - 2] : NaN };
  }

  // ---------- 畫布與版面 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 500, L = null;
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    const narrow = cw < 640;
    if (narrow) {
      const S = cw - 12, Tn = Math.round(Math.max(150, S * 0.52));
      ch = S + Tn + 22;
      L = { narrow: true, A: { x: 6, y: 6, w: S, h: S }, B: { x: 6, y: S + 16, w: S, h: Tn } };
    } else {
      ch = 500;
      const S = ch - 12;
      L = { narrow: false, A: { x: 6, y: 6, w: S, h: S }, B: { x: S + 16, y: 6, w: cw - S - 22, h: S } };
    }
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    bifCache = null;
    requestDraw();
  }
  let rafId = 0;
  function requestDraw() { if (!rafId) rafId = requestAnimationFrame(function () { rafId = 0; draw(); }); }

  function niceStep(span) {
    if (!(span > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(span)));
    const m = span / e;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e;
  }
  function panelBg(c, b) {
    D.roundRect(c, b.x, b.y, b.w, b.h, 8);
    c.fillStyle = alpha(C.text, D.dark ? 0.03 : 0.022); c.fill();
  }

  // ---------- 蛛網圖 ----------
  let VIEW = null, frozenView = null;
  function cobView(q) {
    if (state.fn === 'logi') return { lo: -0.05, hi: 1.05 };
    const base = [a1()];
    q.fixed.forEach(function (o) { if (Math.abs(o.x) < 1e3) base.push(o.x); });
    let lo = Math.min.apply(null, base), hi = Math.max.apply(null, base);
    const s0 = Math.max(hi - lo, 4);
    q.ts.forEach(function (v) { if (v >= lo - 2 * s0 && v <= hi + 2 * s0) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
    if (hi - lo < 2) { const m = (lo + hi) / 2; lo = m - 1; hi = m + 1; }
    const pad = 0.12 * (hi - lo);
    return { lo: lo - pad, hi: hi + pad };
  }
  function mapper(b, v) {
    const s = b.w / (v.hi - v.lo);
    return {
      X: function (x) { return b.x + (x - v.lo) * s; },
      Y: function (y) { return b.y + b.h - (y - v.lo) * s; },
      inv: function (px) { return v.lo + (px - b.x) / s; }
    };
  }
  function drawCob(c, q, m) {
    const b = L.A, v = frozenView || cobView(q), mp = mapper(b, v), X = mp.X, Y = mp.Y;
    VIEW = { v: v, mp: mp };
    panelBg(c, b);
    c.save();
    D.roundRect(c, b.x, b.y, b.w, b.h, 8); c.clip();
    // 格線與座標軸
    const st = niceStep((v.hi - v.lo) / 5);
    c.font = fnt(10); c.fillStyle = alpha(C.muted, 0.9);
    for (let g = Math.ceil(v.lo / st) * st; g <= v.hi + 1e-9; g += st) {
      const gx = X(g), gy = Y(g), zero = Math.abs(g) < 1e-9;
      c.strokeStyle = alpha(C.text, zero ? 0.38 : 0.07); c.lineWidth = zero ? 1.3 : 1;
      c.beginPath(); c.moveTo(gx, b.y); c.lineTo(gx, b.y + b.h); c.moveTo(b.x, gy); c.lineTo(b.x + b.w, gy); c.stroke();
      if (!zero) {
        c.textAlign = 'center'; c.textBaseline = 'bottom'; c.fillText(fmt(r6(g), 3), gx, b.y + b.h - 3);
        c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(fmt(r6(g), 3), b.x + 4, gy);
      }
    }
    // 鏡子 y = x
    c.strokeStyle = alpha(C['rs-diag'], 0.9); c.lineWidth = 1.5; c.setLineDash([7, 5]);
    c.beginPath(); c.moveTo(X(v.lo), Y(v.lo)); c.lineTo(X(v.hi), Y(v.hi)); c.stroke(); c.setLineDash([]);
    // 曲線 y = f(x)
    const f = M.F[state.fn].f, span = v.hi - v.lo, N = 480;
    c.strokeStyle = C['rs-curve']; c.lineWidth = 2.6; c.lineJoin = 'round';
    c.beginPath();
    let pen = false, py = null;
    for (let i = 0; i <= N; i++) {
      const x = v.lo + span * i / N, y = f(x, state.P);
      if (!isFinite(y) || (py != null && Math.abs(y - py) > 3 * span)) { pen = false; py = isFinite(y) ? y : null; continue; }
      const yy = clampv(y, v.lo - 2 * span, v.hi + 2 * span);
      if (pen) c.lineTo(X(x), Y(yy)); else { c.moveTo(X(x), Y(yy)); pen = true; }
      py = y;
    }
    c.stroke();
    // 首項在 x 軸上的位置
    const s = q.ts, x1 = s[0];
    c.strokeStyle = alpha(C['rs-web'], 0.45); c.lineWidth = 1.2; c.setLineDash([3, 4]);
    c.beginPath(); c.moveTo(X(x1), Y(clampv(0, v.lo, v.hi))); c.lineTo(X(x1), Y(x1)); c.stroke(); c.setLineDash([]);
    // 蛛網
    const cnt = Math.min(m, s.length);
    for (let k = 0; k + 1 < cnt; k++) {
      const a = alpha(C['rs-web'], 0.35 + 0.65 * (k + 1) / Math.max(1, cnt - 1));
      c.strokeStyle = a; c.lineWidth = 2;
      c.beginPath(); c.moveTo(X(s[k]), Y(s[k])); c.lineTo(X(s[k]), Y(s[k + 1])); c.lineTo(X(s[k + 1]), Y(s[k + 1])); c.stroke();
    }
    // 不動點
    q.fixed.forEach(function (o) {
      if (o.x < v.lo || o.x > v.hi) return;
      const px = X(o.x), pyy = Y(o.x);
      c.lineWidth = 2.2; c.strokeStyle = C['rs-fix'];
      c.beginPath(); c.arc(px, pyy, 7, 0, Math.PI * 2);
      if (o.stable) { c.fillStyle = alpha(C['rs-fix'], 0.85); c.fill(); }
      else { c.fillStyle = C['canvas-bg']; c.fill(); }
      c.stroke();
    });
    // 每一項在鏡子上的點
    for (let k = 1; k < cnt; k++) {
      c.fillStyle = C['rs-dot']; c.beginPath(); c.arc(X(s[k]), Y(s[k]), cnt > 40 ? 2 : 3, 0, Math.PI * 2); c.fill();
    }
    if (cnt <= 12) for (let k = 1; k < Math.min(cnt, 4); k++) {
      if (Math.abs(X(s[k]) - X(s[k - 1])) < 22) continue;
      rText(c, 'a_' + (k + 1), X(s[k]) + 9, Y(s[k]) + 12, C['rs-dot'], 'left', 12, 700);
    }
    c.restore();
    // 起點（可拖）
    if (x1 >= v.lo && x1 <= v.hi) {
      D.ball(c, X(x1), Y(x1), 7, C.accent, { glow: 0.35 });
      rText(c, 'a_1', X(x1) + 10, Y(x1) - 12, C.accent, 'left', 12.5, 700);
    }
    rText(c, 'y = f(x)', b.x + 8, b.y + 12, C['rs-curve'], 'left', 12, 700);
    if (!q.full && m >= s.length) D.pill(c, T('下一項沒有定義，數列停在這裡', 'The next term is undefined; the sequence stops here'), b.x + b.w / 2, b.y + b.h - 18, C['rs-bad'], 'center', fnt(11.5, 700));
  }

  // ---------- 每一項的折線圖 ----------
  function makeScale(vals) {
    let lo = Infinity, hi = -Infinity;
    vals.forEach(function (v) { if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    const st = niceStep((hi - lo) / 4);
    lo = Math.floor(lo / st - 1e-9) * st; hi = Math.ceil(hi / st + 1e-9) * st;
    const big = Math.max(Math.abs(lo), Math.abs(hi));
    return { lo: lo, hi: hi, st: st, E: big >= 1e6 ? Math.floor(Math.log10(big)) : 0 };
  }
  function seriesFrame(c, b, S, N, title) {
    panelBg(c, b);
    const left = 44, bx0 = b.x + left, bx1 = b.x + b.w - 12, by0 = b.y + 26, by1 = b.y + b.h - 22;
    const Y = function (v) { return by1 - (v - S.lo) / (S.hi - S.lo) * (by1 - by0); };
    const Xk = function (k) { return N <= 1 ? (bx0 + bx1) / 2 : bx0 + (k - 1) / (N - 1) * (bx1 - bx0); };
    c.font = fnt(10); c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let g = Math.ceil(S.lo / S.st - 1e-9) * S.st; g <= S.hi + 1e-9; g += S.st) {
      const y = Y(g), zero = Math.abs(g) < 1e-12;
      c.strokeStyle = alpha(C.text, zero ? 0.38 : 0.07); c.lineWidth = zero ? 1.3 : 1;
      c.beginPath(); c.moveTo(bx0, y); c.lineTo(bx1, y); c.stroke();
      c.fillStyle = alpha(C.muted, 0.95); c.fillText(fmt(r6(g / Math.pow(10, S.E)), 3), bx0 - 4, y);
    }
    const every = N <= 12 ? 1 : N <= 30 ? 5 : N <= 60 ? 10 : 20;
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let k = 1; k <= N; k++) if (k === 1 || k % every === 0) c.fillText(String(k), Xk(k), by1 + 5);
    rText(c, title + (S.E ? T('（單位 10^{', ' (unit 10^{') + S.E + T('}）', '})') : ''), bx0, b.y + 12, C.muted, 'left', 11.5, 700);
    return { Y: Y, Xk: Xk, bx0: bx0, bx1: bx1, by0: by0, by1: by1 };
  }
  function drawSeries(c, q, m) {
    const b = L.B, s = q.ts, g = state.chal;
    const N = Math.max(state.n, g ? 6 : 1);
    const vals = s.slice(0, m);
    if (g) g.shown.forEach(function (v) { vals.push(v); });
    const S0 = makeScale(vals);
    q.fixed.forEach(function (o) { if (o.stable && o.x > S0.lo - (S0.hi - S0.lo) && o.x < S0.hi + (S0.hi - S0.lo)) vals.push(o.x); });
    const S = makeScale(vals);
    const F = seriesFrame(c, b, S, N, T('第 k 項 a', 'term a') + '_k');
    c.save(); c.beginPath(); c.rect(F.bx0 - 6, F.by0 - 8, F.bx1 - F.bx0 + 12, F.by1 - F.by0 + 16); c.clip();
    q.fixed.forEach(function (o) {
      if (o.x < S.lo || o.x > S.hi) return;
      c.strokeStyle = alpha(C['rs-fix'], o.stable ? 0.85 : 0.45); c.lineWidth = 1.4; c.setLineDash(o.stable ? [7, 5] : [2, 4]);
      c.beginPath(); c.moveTo(F.bx0, F.Y(o.x)); c.lineTo(F.bx1, F.Y(o.x)); c.stroke(); c.setLineDash([]);
    });
    const cnt = Math.min(m, s.length);
    c.strokeStyle = alpha(C['rs-dot'], 0.65); c.lineWidth = 1.6;
    c.beginPath();
    for (let k = 1; k <= cnt; k++) { const x = F.Xk(k), y = F.Y(s[k - 1]); if (k > 1) c.lineTo(x, y); else c.moveTo(x, y); }
    c.stroke();
    const rr = N <= 30 ? 3.6 : N <= 60 ? 2.6 : 2;
    for (let k = 1; k <= cnt; k++) { c.fillStyle = k === 1 ? C.accent : C['rs-dot']; c.beginPath(); c.arc(F.Xk(k), F.Y(s[k - 1]), rr, 0, Math.PI * 2); c.fill(); }
    if (g) {
      c.lineWidth = 2; c.strokeStyle = C['rs-target'];
      g.shown.forEach(function (v, i) { c.beginPath(); c.arc(F.Xk(i + 1), F.Y(v), 7, 0, Math.PI * 2); c.stroke(); });
    }
    c.restore();
    if (g) g.shown.forEach(function (v, i) { D.pill(c, fmt(v), F.Xk(i + 1), F.Y(v) - 10, C['rs-target'], 'center', fnt(10.5, 700)); });
    if (cnt) {
      const xl = F.Xk(cnt), yl = clampv(F.Y(s[cnt - 1]), F.by0, F.by1), right = xl > F.bx1 - 110;
      D.ball(c, xl, yl, 5.5, C['rs-dot'], { glow: 0.35 });
      rPill(c, 'a_{' + cnt + '} = ' + fmt(s[cnt - 1]), xl + (right ? -9 : 9), clampv(yl - 9, F.by0 + 18, F.by1), C['rs-dot'], right ? 'right' : 'left', 11.5);
    }
  }

  // ---------- 分岔圖（邏輯斯諦） ----------
  const BIF = { r0: 2.4, r1: 4 };
  let bifCache = null;
  function drawBif(c, q) {
    const b = L.B;
    panelBg(c, b);
    const bx0 = b.x + 34, bx1 = b.x + b.w - 10, by0 = b.y + 26, by1 = b.y + b.h - 22;
    const W = Math.max(1, Math.round(bx1 - bx0)), H = Math.max(1, Math.round(by1 - by0));
    const key = W + 'x' + H + '|' + dpr + '|' + C['rs-curve'];
    if (!bifCache || bifCache.key !== key) {
      const oc = document.createElement('canvas');
      oc.width = Math.round(W * dpr); oc.height = Math.round(H * dpr);
      const o = oc.getContext('2d');
      o.scale(dpr, dpr);
      o.fillStyle = alpha(C['rs-curve'], D.dark ? 0.55 : 0.5);
      for (let i = 0; i < W; i++) {
        const r = BIF.r0 + (BIF.r1 - BIF.r0) * (i + 0.5) / W;
        let x = 0.3;
        for (let k = 0; k < 480; k++) x = r * x * (1 - x);
        for (let k = 0; k < 120; k++) { x = r * x * (1 - x); o.fillRect(i, (1 - x) * H - 0.5, 1, 1); }
      }
      bifCache = { key: key, img: oc };
    }
    c.drawImage(bifCache.img, bx0, by0, W, H);
    c.font = fnt(10); c.fillStyle = alpha(C.muted, 0.95);
    c.textAlign = 'right'; c.textBaseline = 'middle';
    [0, 0.5, 1].forEach(function (v) { c.fillText(String(v), bx0 - 4, by1 - v * H); });
    c.textAlign = 'center'; c.textBaseline = 'top';
    [2.4, 2.8, 3.2, 3.6, 4].forEach(function (r) { c.fillText(String(r), bx0 + (r - BIF.r0) / (BIF.r1 - BIF.r0) * W, by1 + 5); });
    rText(c, T('分岔圖：橫軸 r，縱軸是數列最後落在的值', 'Bifurcation diagram: r across, where the terms end up'), bx0, b.y + 12, C.muted, 'left', 11.5, 700);
    const r = state.P.r;
    if (r >= BIF.r0 && r <= BIF.r1) {
      const xr = bx0 + (r - BIF.r0) / (BIF.r1 - BIF.r0) * W;
      c.strokeStyle = alpha(C['rs-web'], 0.9); c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(xr, by0); c.lineTo(xr, by1); c.stroke();
      // 長期的落點：先走 2000 步（和分岔圖一樣丟掉開頭），再畫 64 個點
      let x = state.x0;
      for (let k = 0; k < 2000; k++) x = r * x * (1 - x);
      c.fillStyle = C['rs-web'];
      for (let k = 0; k < 64; k++) { x = r * x * (1 - x); if (x >= 0 && x <= 1) { c.beginPath(); c.arc(xr, by1 - x * H, 3.2, 0, Math.PI * 2); c.fill(); } }
      D.pill(c, 'r = ' + fmt(r), clampv(xr, bx0 + 40, bx1 - 40), by0 + 20, C['rs-web'], 'center', fnt(11, 700));
    } else D.pill(c, T('r 在 2.4 到 4 之間才畫得到', 'Set r between 2.4 and 4 to see it here'), (bx0 + bx1) / 2, by0 + 22, C.muted, 'center', fnt(11, 700));
  }

  // ---------- 費氏型 ----------
  function drawRatio(c, qf, m) {
    const b = L.narrow ? L.B : L.A0, s = qf.ts, n = s.length;
    const N = Math.max(2, n);
    const vals = [M.PHI, -1 / M.PHI, 0];
    for (let k = 2; k <= Math.min(m, n); k++) if (s[k - 2] !== 0) vals.push(clampv(s[k - 1] / s[k - 2], -3, 4));
    const S = makeScale(vals); S.E = 0;
    const F = seriesFrame(c, b, S, N, T('比值 a', 'ratio a') + '_k / a_{k−1}');
    c.save(); c.beginPath(); c.rect(F.bx0 - 6, F.by0 - 8, F.bx1 - F.bx0 + 12, F.by1 - F.by0 + 16); c.clip();
    [[M.PHI, 'φ ≈ 1.618', 0.95], [-1 / M.PHI, '−1/φ ≈ −0.618', 0.45]].forEach(function (o) {
      const y = F.Y(o[0]);
      c.strokeStyle = alpha(C['rs-phi'], o[2]); c.lineWidth = 1.6; c.setLineDash([7, 5]);
      c.beginPath(); c.moveTo(F.bx0, y); c.lineTo(F.bx1, y); c.stroke(); c.setLineDash([]);
    });
    c.strokeStyle = alpha(C['rs-dot'], 0.65); c.lineWidth = 1.6; c.beginPath();
    let pen = false;
    for (let k = 2; k <= Math.min(m, n); k++) {
      if (s[k - 2] === 0) { pen = false; continue; }
      const y = F.Y(clampv(s[k - 1] / s[k - 2], -3, 4));
      if (pen) c.lineTo(F.Xk(k), y); else { c.moveTo(F.Xk(k), y); pen = true; }
    }
    c.stroke();
    for (let k = 2; k <= Math.min(m, n); k++) {
      if (s[k - 2] === 0) continue;
      c.fillStyle = C['rs-dot']; c.beginPath(); c.arc(F.Xk(k), F.Y(clampv(s[k - 1] / s[k - 2], -3, 4)), N <= 30 ? 3.6 : 2.6, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    D.pill(c, 'φ ≈ 1.618', F.bx1 - 4, F.Y(M.PHI) - 6, C['rs-phi'], 'right', fnt(11, 700));
  }
  function drawTiles(c, qf, m) {
    const b = L.narrow ? L.A : L.B0;
    panelBg(c, b);
    const nn = Math.min(m, state.fnN);
    const Tl = M.tiling(state.f1, state.f2, Math.max(2, nn));
    if (!Tl) {
      D.pill(c, T('兩個起始項都是正的，才能拼正方形', 'Both starting terms must be positive to tile squares'), b.x + b.w / 2, b.y + b.h / 2, C.muted, 'center', fnt(12, 700));
      return;
    }
    const bx = Tl.box, W = bx.x1 - bx.x0, H = bx.y1 - bx.y0;
    const sc = Math.min((b.w - 28) / W, (b.h - 28) / H);
    const ox = b.x + b.w / 2 - (bx.x0 + W / 2) * sc, oy = b.y + b.h / 2 + (bx.y0 + H / 2) * sc;
    const X = function (x) { return ox + x * sc; }, Y = function (y) { return oy - y * sc; };
    // 起始長方形
    c.fillStyle = alpha(C['rs-phi'], D.dark ? 0.3 : 0.22);
    c.fillRect(X(Tl.base.x), Y(Tl.base.y + Tl.base.h), Tl.base.w * sc, Tl.base.h * sc);
    c.strokeStyle = alpha(C.text, 0.5); c.lineWidth = 1;
    c.strokeRect(X(Tl.base.x), Y(Tl.base.y + Tl.base.h), Tl.base.w * sc, Tl.base.h * sc);
    Tl.squares.forEach(function (q, i) {
      const col = i % 2 ? C['rs-sq2'] : C['rs-sq1'];
      const g = c.createLinearGradient(X(q.x), Y(q.y + q.s), X(q.x + q.s), Y(q.y));
      g.addColorStop(0, alpha(col, D.dark ? 0.34 : 0.26)); g.addColorStop(1, alpha(col, D.dark ? 0.16 : 0.1));
      c.fillStyle = g; c.fillRect(X(q.x), Y(q.y + q.s), q.s * sc, q.s * sc);
      c.strokeStyle = alpha(col, 0.85); c.lineWidth = 1.2; c.strokeRect(X(q.x), Y(q.y + q.s), q.s * sc, q.s * sc);
      if (q.s * sc >= 26) D.haloText(c, fmt(q.s), X(q.x + q.s / 2), Y(q.y + q.s / 2), col, 'center', 'middle', fnt(Math.min(16, 9 + q.s * sc / 14), 700));
    });
    // 螺線：起始正方形（a_1 = a_2 時）加上每一塊正方形的四分之一圓
    c.strokeStyle = C['rs-phi']; c.lineWidth = 2.6; c.lineCap = 'round';
    c.beginPath();
    const arc = function (cx, cy, rad, p0, p1, first) {
      const t0 = Math.atan2(p0[1] - cy, p0[0] - cx);
      let t1 = Math.atan2(p1[1] - cy, p1[0] - cx), dt = t1 - t0;
      while (dt > Math.PI) dt -= 2 * Math.PI;
      while (dt < -Math.PI) dt += 2 * Math.PI;
      for (let j = 0; j <= 24; j++) {
        const t = t0 + dt * j / 24, x = X(cx + rad * Math.cos(t)), y = Y(cy + rad * Math.sin(t));
        if (j === 0 && first) c.moveTo(x, y); else c.lineTo(x, y);
      }
    };
    let first = true;
    if (Math.abs(state.f1 - state.f2) < 1e-12) { arc(0, 0, state.f1, [0, state.f1], [state.f1, 0], true); first = false; }
    Tl.squares.forEach(function (q) { arc(q.arc.cx, q.arc.cy, q.s, q.arc.from, q.arc.to, first); first = false; });
    c.stroke();
    if (Tl.squares.length) {
      const lo = Math.min(W, H), hi = Math.max(W, H);
      rPill(c, T('外框 ', 'outer box ') + fmt(lo) + ' × ' + fmt(hi) + T('，長 ÷ 寬 = ', ', long ÷ short = ') + fmt(hi / lo, 5), b.x + b.w / 2, b.y + b.h - 6, C['rs-phi'], 'center', 11.5);
    }
  }

  // ---------- 主畫面 ----------
  let kb = null;
  function draw() {
    if (!L) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(ctx, cw, ch);
    const m = anim ? anim.m : Infinity;
    if (state.mode === 'cob') {
      const q = Q();
      drawCob(ctx, q, m);
      if (state.fn === 'logi' && state.bif) drawBif(ctx, q); else drawSeries(ctx, q, m);
      if (kb && kb.focused() && kb.index() === 1 && VIEW) {
        const x = a1();
        ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.arc(VIEW.mp.X(x), VIEW.mp.Y(x), 14, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
    } else {
      const qf = QF();
      if (L.narrow) { drawTiles(ctx, qf, m); drawRatio(ctx, qf, m); }
      else {
        // 寬螢幕：左邊比值、右邊正方形
        const S = ch - 12;
        L.A0 = { x: 6, y: 6, w: cw - S - 22, h: S };
        L.B0 = { x: cw - S - 6, y: 6, w: S, h: S };
        drawRatio(ctx, qf, m); drawTiles(ctx, qf, m);
      }
    }
  }

  // =====================================================================
  // 讀數與算式
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  let eqKey = null;
  function setEq(tex) {
    if (eqKey === tex) return;
    eqKey = tex;
    const el = $('rEq');
    if (!tex) { el.textContent = ''; return; }
    if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); } catch (e) { el.textContent = tex; } }
    else el.textContent = tex;
  }
  function ruleTex() {
    const P = state.P, pm = function (v) { return v < 0 ? ' - ' + fmtT(-v) : ' + ' + fmtT(v); };
    switch (state.fn) {
      case 'lin': return 'a_{n+1} = ' + fmtT(P.p) + '\\,a_n' + pm(P.q);
      case 'sqrt': return 'a_{n+1} = \\sqrt{a_n + ' + fmtT(P.c) + '}';
      case 'cf': return 'a_{n+1} = 1 + \\frac{' + fmtT(P.k) + '}{a_n}';
      case 'cos': return 'a_{n+1} = \\cos a_n';
      case 'bab': return 'a_{n+1} = \\frac12\\left(a_n + \\frac{' + fmtT(P.b) + '}{a_n}\\right)';
      default: return 'a_{n+1} = ' + fmtT(P.r) + '\\,a_n(1 - a_n)';
    }
  }
  function updateReadouts() {
    if (state.mode === 'cob') {
      const q = Q();
      setHTML('rAn', q.full ? fmtH(q.an) : T('第 ', 'undefined after term ') + q.ts.length + T(' 項之後沒有定義', ''));
      setHTML('rFix', q.fixed.length ? q.fixed.map(function (o) { return fmtH(o.x); }).join('、') : T('沒有', 'none'));
      setHTML('rSlope', q.fixed.length ? q.fixed.map(function (o) { return fmtH(r6(o.slope)) + (o.stable ? T('（吸住）', ' (pulls in)') : T('（推開）', ' (pushes away)')); }).join('<br>') : '—');
      if (state.fn === 'logi') setHTML('rPer', q.period === 1 ? T('1（停在一點）', '1 (settles)') : q.period === 0 ? T('沒有（混沌）', 'none (chaos)') : q.period > 0 ? q.period + T(' 點循環', '-cycle') : '—');
      let tex = ruleTex();
      if (state.fn === 'lin' && state.P.p !== 1) tex += ',\\quad L = \\frac{q}{1 - p} = ' + fmtT(q.fixed[0].x) + ',\\quad a_n = L + (a_1 - L)\\,p^{\\,n-1}';
      else if (state.fn === 'lin') tex += '\\quad(p = 1\\text{: }a_n = a_1 + (n-1)q)';
      setEq(tex.replace('\\text{: }', ',\\ '));
    } else {
      const qf = QF();
      setHTML('rFn', fmtH(qf.an));
      setHTML('rRatio', isFinite(qf.ratio) ? fmt(qf.ratio, 7) : '—');
      setHTML('rPhi', isFinite(qf.ratio) ? fmtSmall(Math.abs(qf.ratio - M.PHI)) : '—');
      setEq('a_{n+2} = a_{n+1} + a_n,\\quad \\frac{a_{' + state.fnN + '}}{a_{' + (state.fnN - 1) + '}} = ' + (isFinite(qf.ratio) ? fmtT(qf.ratio, 7) : '?') + ',\\quad \\varphi = \\frac{1 + \\sqrt5}{2} \\approx 1.6180340');
    }
    setHTML('status', statusText());
  }
  function statusText() {
    if (state.chal) return T('灰色圈是神祕數列的前五項：相鄰兩項的差，每次都乘上同一個 p。', 'The grey rings are the first five terms of the mystery sequence: the gap between neighbouring terms is multiplied by the same p each time.');
    if (state.mode === 'fib') {
      if (state.f1 === 0 && state.f2 === 0) return T('兩項都是 0，之後每一項都是 0。', 'Both are 0, so every term is 0.');
      if (state.f1 !== 0 && Math.abs(state.f2 / state.f1 + 1 / M.PHI) < 0.01) return T('起始比 a<sub>2</sub>/a<sub>1</sub> 約是 −1/φ ≈ −0.618：數列幾乎是公比 −0.618 的等比數列，一直變小。只要差一點點，畫得夠長還是會被 φ 拉走。', 'The starting ratio a<sub>2</sub>/a<sub>1</sub> is about −1/φ ≈ −0.618, so the sequence is almost geometric with ratio −0.618 and keeps shrinking. Miss it by a hair and, given enough terms, φ still takes over.');
      return T('不管從哪兩個數開始，相鄰兩項的比都會越來越靠近 φ ≈ 1.618。', 'Whatever two numbers you start with, the ratio of neighbours closes in on φ ≈ 1.618.');
    }
    const q = Q();
    if (!q.full) return T('第 ' + (q.ts.length + 1) + ' 項沒有定義（根號裡是負的，或分母是 0），數列停下來了。', 'Term ' + (q.ts.length + 1) + ' is undefined (a negative number under the root, or a zero denominator), so the sequence stops.');
    if (state.fn === 'logi') {
      const p = q.period;
      if (state.P.r <= 1) return T('r ≤ 1：族群一代比一代少，最後走到 0。', 'r ≤ 1: each generation is smaller and the terms die out to 0.');
      if (p === 1) return T('數列停在不動點 ' + fmt(q.fixed[q.fixed.length - 1].x) + '：那裡的斜率 |f′| < 1，附近的項都被吸過去。', 'The terms settle at ' + fmt(q.fixed[q.fixed.length - 1].x) + ': the slope there has |f′| < 1, so nearby terms are pulled in.');
      if (p > 1) return T('數列最後在 ' + p + ' 個值之間輪流跳（' + p + ' 點循環）；不動點的斜率已經超過 1，留不住了。', 'In the long run the terms take turns between ' + p + ' values (a ' + p + '-cycle); the fixed point has become too steep to hold them.');
      return T('數列永遠不重複：這就是混沌。起點只要差一點點，後面就完全不一樣。', 'The terms never repeat: this is chaos. A tiny change in the start changes everything later.');
    }
    const st = q.fixed.filter(function (o) { return o.stable; });
    const near = st.find(function (o) { return Math.abs(q.an - o.x) < 1e-3 * Math.max(1, Math.abs(o.x)); });
    if (state.fn === 'lin' && state.P.p === 1) return state.P.q === 0 ? T('p = 1、q = 0：每一項都一樣。', 'p = 1, q = 0: every term is the same.') : T('p = 1：這是等差數列。y = x + q 和鏡子平行，沒有交點，數列一直走下去。', 'p = 1: an arithmetic sequence. y = x + q runs parallel to the mirror, so there is no crossing and the terms keep going.');
    if (state.fn === 'lin' && state.P.p === -1) return T('p = −1：斜率剛好是 −1，蛛網繞成一個封閉的正方形，數列在兩個值之間永遠來回。', 'p = −1: the slope is exactly −1, the cobweb closes into a square and the terms swing between two values forever.');
    if (near) {
      const sl = near.slope;
      return T('數列走進交點 L = ' + fmt(near.x) + '。那裡的斜率 f′(L) = ' + fmt(r6(sl)) + (sl > 0 ? '，所以走樓梯。' : sl < 0 ? '，是負的，所以繞螺旋。' : '，是 0，所以收斂得特別快。'), 'The terms walk into the crossing L = ' + fmt(near.x) + '. The slope there is f′(L) = ' + fmt(r6(sl)) + (sl > 0 ? ', so they climb a staircase.' : sl < 0 ? ', negative, so they spiral.' : ', zero, so they converge very fast.'));
    }
    const toward = st.slice().sort(function (u, w) { return Math.abs(q.an - u.x) - Math.abs(q.an - w.x); })[0];
    if (toward && q.ts.length >= 3 && Math.abs(q.an - toward.x) < Math.abs(q.ts[0] - toward.x)) {
      const sl = toward.slope;
      return T('數列一步步靠近交點 L = ' + fmt(toward.x) + '（還差 ' + fmtSmall(Math.abs(q.an - toward.x)) + '）。那裡的斜率 f′(L) = ' + fmt(r6(sl)) + (sl > 0 ? '，所以走樓梯。' : sl < 0 ? '，是負的，所以繞螺旋。' : '。'), 'The terms close in on the crossing L = ' + fmt(toward.x) + ' (still ' + fmtSmall(Math.abs(q.an - toward.x)) + ' away). The slope there is f′(L) = ' + fmt(r6(sl)) + (sl > 0 ? ', so they climb a staircase.' : sl < 0 ? ', negative, so they spiral.' : '.'));
    }
    if (!st.length && q.fixed.length) return T('不動點的斜率都超過 1：除非剛好從不動點出發，數列會被推開。', 'Every fixed point is too steep (|f′| > 1): unless the sequence starts exactly on one, it is pushed away.');
    return T('把 n 調大，看蛛網最後走到哪裡。', 'Raise n and see where the cobweb ends up.');
  }

  // =====================================================================
  // 音效
  // =====================================================================
  function sound() { return window.LabSound && window.LabSound.enabled() ? window.LabSound : null; }
  function chime(ok) {
    const S = sound(); if (!S) return;
    if (ok) { S.tone({ freq: 659.25, dur: 0.16, type: 'sine', gain: 0.26 }); S.tone({ freq: 987.77, dur: 0.24, type: 'sine', gain: 0.22, delay: 0.11 }); }
    else S.tone({ freq: 311.13, dur: 0.14, type: 'triangle', gain: 0.2 });
  }
  function blip(freq, type, gain) { const S = sound(); if (S) S.tone({ freq: freq, dur: 0.08, type: type || 'triangle', gain: gain || 0.14 }); }
  /** 項的音高：在蛛網圖的範圍裡越大越高（262 到 784 Hz） */
  function termTone(v) {
    if (!isFinite(v)) return;
    let t;
    if (state.mode === 'cob' && VIEW) t = (v - VIEW.v.lo) / (VIEW.v.hi - VIEW.v.lo);
    else t = 0.5 + Math.atan(v / 20) / Math.PI;
    blip(262 * Math.pow(3, clampv(t, 0, 1)), 'sine', 0.12);
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

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function emitMode() {
    if (state.mode === 'fib') {
      const qf = QF();
      emit('fib', { a1: state.f1, a2: state.f2, n: state.fnN, ts: qf.ts.slice(), an: qf.an, ratio: qf.ratio });
      return;
    }
    const q = Q(), P = state.P;
    emit('iter', {
      fn: state.fn, p: P.p, q: P.q, c: P.c, k: P.k, b: P.b, r: P.r, a1: a1(), n: state.n,
      ts: q.ts.slice(), an: q.full ? q.an : NaN,
      fixed: q.fixed.map(function (o) { return { x: o.x, stable: o.stable }; }), period: q.period
    });
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  const lab = $('lab');
  const el = { lp: $('lp'), lq: $('lq'), sc: $('sc'), ck: $('ck'), bb: $('bb'), lr: $('lr'), s0: $('s0'), x0: $('x0'), sn: $('sn'), f1: $('f1'), f2: $('f2'), fn: $('fn') };
  function readOne(k) {
    const v = r6(val(el[k])), P = state.P;
    if (k === 'lp') P.p = v; else if (k === 'lq') P.q = v; else if (k === 'sc') P.c = v; else if (k === 'ck') P.k = v;
    else if (k === 'bb') P.b = v; else if (k === 'lr') P.r = v; else if (k === 's0') state.s0 = v; else if (k === 'x0') state.x0 = v;
    else if (k === 'sn') state.n = clampv(Math.round(v), 1, 100);
    else if (k === 'f1') state.f1 = v; else if (k === 'f2') state.f2 = v;
    else if (k === 'fn') state.fnN = clampv(Math.round(v), 2, 40);
  }
  function refreshOutputs() {
    const P = state.P;
    $('lpo').textContent = fmt(P.p); $('lqo').textContent = fmt(P.q); $('sco').textContent = fmt(P.c); $('cko').textContent = fmt(P.k);
    $('bbo').textContent = fmt(P.b); $('lro').textContent = fmt(P.r); $('s0o').textContent = fmt(state.s0); $('x0o').textContent = fmt(state.x0);
    $('sno').textContent = String(state.n); $('f1o').textContent = fmt(state.f1); $('f2o').textContent = fmt(state.f2); $('fno').textContent = String(state.fnN);
  }
  function refresh() { refreshOutputs(); updateReadouts(); requestDraw(); }
  function setSlider(e, v) { applying = true; if (window.LabNum) window.LabNum.set(e, v); else e.value = v; applying = false; }
  function syncAll() {
    const P = state.P;
    setSlider(el.lp, P.p); setSlider(el.lq, P.q); setSlider(el.sc, P.c); setSlider(el.ck, P.k); setSlider(el.bb, P.b); setSlider(el.lr, P.r);
    setSlider(el.s0, state.s0); setSlider(el.x0, state.x0); setSlider(el.sn, state.n); setSlider(el.f1, state.f1); setSlider(el.f2, state.f2); setSlider(el.fn, state.fnN);
  }
  function stopAnim() { if (anim) { anim = null; $('play').textContent = T('一步一步畫', 'Draw step by step'); } }
  Object.keys(el).forEach(function (k) {
    el[k].addEventListener('input', function () {
      if (applying) return;
      stopAnim();
      const oldN = state.n, oldF = state.fnN;
      readOne(k); refresh();
      if (k === 'sn' && state.n !== oldN) termTone(Q().an);
      if (k === 'fn' && state.fnN !== oldF) blip(330 + 6 * state.fnN, 'sine', 0.1);
    });
    el[k].addEventListener('change', function () { if (applying) return; readOne(k); refresh(); emitMode(); });
  });
  $('bifC').addEventListener('change', function () { state.bif = $('bifC').checked; refresh(); blip(440); });
  function setFn(f) {
    if (f === state.fn) return;
    stopAnim();
    state.fn = f; lab.setAttribute('data-fn', f);
    document.querySelectorAll('#fnPick button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-fn') === f)); });
    eqKey = null;
    refresh(); emitMode(); blip(494);
  }
  document.querySelectorAll('#fnPick button').forEach(function (b) { b.addEventListener('click', function () { setFn(b.getAttribute('data-fn')); }); });
  function setMode(m) {
    if (m === state.mode) return;
    stopAnim();
    if (state.chal && m === 'fib') quitChal(true);
    state.mode = m; lab.setAttribute('data-mode', m);
    document.querySelectorAll('.modes button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === m)); });
    eqKey = null;
    refresh(); emitMode();
  }
  document.querySelectorAll('.modes button').forEach(function (b) { b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); }); });

  // ---------- 一步一步畫 ----------
  let animTimer = 0;
  $('play').addEventListener('click', function () {
    if (anim) { stopAnim(); requestDraw(); return; }
    const total = state.mode === 'cob' ? Q().ts.length : state.fnN;
    anim = { m: 1, total: total };
    $('play').textContent = T('停止', 'Stop');
    const tick = function () {
      if (!anim) return;
      anim.m++;
      const s = state.mode === 'cob' ? Q().ts : QF().ts;
      termTone(s[anim.m - 1]);
      requestDraw();
      if (anim.m >= anim.total) { stopAnim(); requestDraw(); return; }
      animTimer = setTimeout(tick, reduceMotion.matches ? 120 : Math.max(90, 420 - 12 * anim.m));
    };
    clearTimeout(animTimer);
    requestDraw();
    animTimer = setTimeout(tick, 380);
  });

  // ---------- 全部清除 ----------
  $('clear').addEventListener('click', function () {
    stopAnim();
    if (state.chal) quitChal(true);
    state.log = []; state.streak = []; state.round = 0; lastChal = null;
    setChalMsg(''); renderLog();
    refresh(); blip(392);
  });

  // ---------- 在蛛網圖上拖曳起點 ----------
  let drag = null;
  function posOf(ev) { const rc = cv.getBoundingClientRect(); return { px: ev.clientX - rc.left, py: ev.clientY - rc.top }; }
  function hitStart(px, py, R) {
    if (state.mode !== 'cob' || !VIEW) return false;
    const x = a1();
    return Math.hypot(px - VIEW.mp.X(x), py - VIEW.mp.Y(x)) <= R;
  }
  function dragTo(px) {
    const v = VIEW.mp.inv(px);
    if (state.fn === 'logi') {
      const x = clampv(Math.round(v * 100) / 100, 0, 1);
      if (x === state.x0) return;
      state.x0 = x; setSlider(el.x0, x);
    } else {
      const x = clampv(r6(Math.round(v * 10) / 10), -10, 10);
      if (x === state.s0) return;
      state.s0 = x; setSlider(el.s0, x);
    }
    blip(392, 'sine', 0.06);
    refresh();
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (!L) return;
    const p = posOf(ev), touch = ev.pointerType === 'touch' || ev.pointerType === 'pen';
    if (!hitStart(p.px, p.py, touch ? 24 : 14)) return;
    ev.preventDefault(); stopAnim();
    drag = { id: ev.pointerId };
    frozenView = { lo: VIEW.v.lo, hi: VIEW.v.hi };
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!L) return;
    const p = posOf(ev);
    if (!drag) { cv.style.cursor = hitStart(p.px, p.py, 14) ? 'ew-resize' : 'default'; return; }
    if (drag.id !== ev.pointerId) return;
    dragTo(p.px);
  });
  function endDrag(ev) {
    if (!drag || drag.id !== ev.pointerId) return;
    drag = null; frozenView = null;
    requestDraw(); emitMode();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // ---------- 鍵盤 ----------
  const PARAM = { lin: ['p', 'lp', 0.05, 0.25, -1.5, 1.5], sqrt: ['c', 'sc', 0.1, 1, 0, 10], cf: ['k', 'ck', 0.05, 0.5, 0.1, 5], bab: ['b', 'bb', 0.5, 2, 0.5, 20], logi: ['r', 'lr', 0.01, 0.1, 0, 4] };
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('遞迴數列畫布。Enter 切換項數、首項與參數；方向鍵調整，Shift 調得多。', 'Recursive sequence canvas. Enter switches between the number of terms, the first term and the parameter; arrow keys adjust, Shift for bigger steps.'),
      items: [{
        name: function () { return T('項數 n', 'number of terms n'); },
        move: function (dx, dy, big) {
          stopAnim();
          const st = (dx || dy) * (big ? 10 : 1);
          if (state.mode === 'fib') { state.fnN = clampv(state.fnN + st, 2, 40); setSlider(el.fn, state.fnN); }
          else { state.n = clampv(state.n + st, 1, 100); setSlider(el.sn, state.n); }
          refresh(); termTone(state.mode === 'fib' ? QF().an : Q().an); emitMode(); return true;
        },
        describe: function () { return 'n = ' + (state.mode === 'fib' ? state.fnN : state.n); }
      }, {
        name: function () { return T('首項', 'first term'); },
        move: function (dx, dy, big) {
          stopAnim();
          const s = dy || dx;
          if (state.mode === 'fib') { state.f1 = clampv(r6(state.f1 + s * (big ? 5 : 1)), -10, 10); setSlider(el.f1, state.f1); }
          else if (state.fn === 'logi') { state.x0 = clampv(r6(state.x0 + s * (big ? 0.1 : 0.01)), 0, 1); setSlider(el.x0, state.x0); }
          else { state.s0 = clampv(r6(state.s0 + s * (big ? 1 : 0.1)), -10, 10); setSlider(el.s0, state.s0); }
          refresh(); emitMode(); return true;
        },
        describe: function () { return 'a1 = ' + fmt(state.mode === 'fib' ? state.f1 : a1()); }
      }, {
        name: function () { return state.mode === 'fib' ? T('第二項', 'second term') : PARAM[state.fn] ? PARAM[state.fn][0] : T('（沒有參數）', '(no parameter)'); },
        move: function (dx, dy, big) {
          stopAnim();
          const s = dy || dx;
          if (state.mode === 'fib') { state.f2 = clampv(r6(state.f2 + s * (big ? 5 : 1)), -10, 10); setSlider(el.f2, state.f2); refresh(); emitMode(); return true; }
          const pr = PARAM[state.fn];
          if (!pr) return false;
          const key = pr[0];
          state.P[key] = clampv(r6(state.P[key] + s * (big ? pr[3] : pr[2])), pr[4], pr[5]);
          setSlider(el[pr[1]], state.P[key]); refresh(); emitMode(); return true;
        },
        describe: function () { return state.mode === 'fib' ? 'a2 = ' + fmt(state.f2) : PARAM[state.fn] ? PARAM[state.fn][0] + ' = ' + fmt(state.P[PARAM[state.fn][0]]) : ''; }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 挑戰：猜遞迴
  // =====================================================================
  const chalMsg = $('chalMsg');
  function setChalMsg(msg, cls) { chalMsg.textContent = msg || ''; chalMsg.classList.toggle('ok', cls === 'ok'); chalMsg.classList.toggle('bad', cls === 'bad'); }
  function startChal(forced) {
    stopAnim();
    if (state.mode !== 'cob') setMode('cob');
    if (state.fn !== 'lin') setFn('lin');
    const g = forced || M.genChallenge(rand, lastChal);
    if (!g) { setChalMsg(T('出不了題，請再按一次。', 'Could not make a challenge; please try again.')); return; }
    state.round++;
    state.chal = { p: g.p, q: g.q, a1: g.a1, shown: g.shown, check: g.check, t0: performance.now(), round: state.round, tries: 0 };
    lastChal = g;
    if (state.n < 6) { state.n = 6; setSlider(el.sn, 6); }
    $('lgTarget').hidden = false;
    setChalMsg(T('第 ' + state.round + ' 題：', 'Challenge ' + state.round + ': ') + g.shown.map(function (v) { return fmt(v); }).join(', ') + ', …');
    $('submitC').hidden = false; $('quitChal').hidden = false;
    $('newChal').textContent = T('換一題', 'Another one');
    refresh();
  }
  function submitC() {
    const g = state.chal;
    if (!g) return;
    if (state.fn !== 'lin' || state.mode !== 'cob') { setChalMsg(T('這一題的規則是 p a_n + q，請先選那一種遞迴。', 'This rule has the form p a_n + q; pick that rule first.'), 'bad'); return; }
    g.tries++;
    const mine = M.iterate('lin', state.P, state.s0, 6);
    let bad = -1;
    for (let i = 0; i < 6; i++) if (!(Math.abs(mine[i] - g.check[i]) <= 1e-9)) { bad = i; break; }
    if (bad >= 0) {
      state.streak = [];
      chime(false);
      setChalMsg(bad < 5 ? T('你的第 ' + (bad + 1) + ' 項是 ' + fmt(mine[bad]) + '，和灰色圈不一樣。（連續答對重新計算）', 'Your term ' + (bad + 1) + ' is ' + fmt(mine[bad]) + ', which misses the grey ring. (The streak starts over.)')
        : T('前五項都對了，但第 6 項沒有照同一個規則：再檢查 p 和 q。（連續答對重新計算）', 'The first five match, but term 6 does not follow the same rule: check p and q again. (The streak starts over.)'), 'bad');
      return;
    }
    const time = (performance.now() - g.t0) / 1000;
    state.log.push({ round: g.round, p: g.p, q: g.q, a1: g.a1, time: time, first: g.tries === 1 });
    state.streak.push(time);
    const last3 = state.streak.length >= 3 ? state.streak.slice(-3).reduce(function (s, x) { return s + x; }, 0) : null;
    state.chal = null;
    $('lgTarget').hidden = true; $('submitC').hidden = true; $('quitChal').hidden = true;
    $('newChal').textContent = T('出下一題', 'Next challenge');
    setChalMsg(T('答對了！用了 ', 'Correct! In ') + time.toFixed(1) + T(' 秒。', ' s.'), 'ok');
    chime(true); renderLog(); refresh();
    emit('challenge', { time: time, streak: state.streak.length, last3: last3 });
  }
  function ruleText(r) { return 'p = ' + fmt(r.p) + ', q = ' + fmt(r.q) + ', a1 = ' + fmt(r.a1); }
  function quitChal(silent) {
    const g = state.chal;
    if (!g) return;
    state.log.push({ round: g.round, p: g.p, q: g.q, a1: g.a1, time: null });
    state.chal = null; state.streak = [];
    $('lgTarget').hidden = true; $('submitC').hidden = true; $('quitChal').hidden = true;
    $('newChal').textContent = T('出一題', 'New challenge');
    setChalMsg(silent ? '' : T('這題放棄了，答案是 ', 'Given up. The answer was ') + ruleText(g) + T('；連續答對重新計算。', '; the streak starts over.'));
    renderLog(); refresh();
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
      h += '<tr><td>' + r.round + '</td><td>' + ruleText(r) + '</td><td>' + (r.time == null ? T('放棄', 'gave up') : r.time.toFixed(1) + (r.first ? '' : '*')) + '</td></tr>';
    });
    t.innerHTML = h;
  }

  // 給測試用的介面（不影響畫面）
  window.__rs = {
    state: state, Q: Q, QF: QF,
    startChal: function (g) { startChal(g); },
    seed: function (s) { rand = M.rng(s); },
    startPt: function () { if (!VIEW) return null; const x = a1(); return [VIEW.mp.X(x), VIEW.mp.Y(x)]; },
    xOf: function (x) { return VIEW ? VIEW.mp.X(x) : null; }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  syncAll();
  state.bif = $('bifC').checked;
  renderLog();
  updateSoundButton();
  function themeChanged() {
    readColors();
    bifCache = null;
    for (const id in lastHTML) delete lastHTML[id];
    eqKey = null;
    renderLog(); refreshOutputs(); updateReadouts(); updateSoundButton();
    $('newChal').textContent = state.chal ? T('換一題', 'Another one') : state.log.length ? T('出下一題', 'Next challenge') : T('出一題', 'New challenge');
    $('play').textContent = anim ? T('停止', 'Stop') : T('一步一步畫', 'Draw step by step');
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
})();
