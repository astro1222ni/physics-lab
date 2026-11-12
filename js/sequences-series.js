/* sequences-series.js — 「等差、等比數列與級數」的畫面與互動（數學計算在 sequences-series-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 等差／等比：上半是每一項的長條（可以拖第一根、第二根的頂端），下半是部分和 S_k（等比 |r| < 1 時畫出 S_∞ 的虛線）。
 *   等差可以打開「高斯的方法」：倒過來的同一個數列疊上去，每一行都一樣高 a_1 + a_n。
 * 圖形數：三角形數（再拼一份轉過來的，成為 n × (n + 1) 的長方形）、奇數和（一層一層 L 形包成正方形）。
 * 挑戰「猜數列」：給前四項，判斷等差或等比並調出來，前五項都要對。 */
(function () {
  'use strict';
  const M = window.SeqCore;
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
    mode: 'arith',
    a1: 1, d: 3, r: 0.5, n: 8, pair: false, sums: true,
    fig: 'tri', fn: 4, join: false,
    chal: null, round: 0, streak: [], log: []
  };
  let rand = M.rng(((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0);
  let lastChal = null;
  let applying = false;
  let joinAnim = null;
  const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'ss-pos', 'ss-neg', 'ss-pair', 'ss-sum', 'ss-lim', 'ss-dot1', 'ss-dot2', 'ss-target', 'ss-ok', 'ss-bad']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight, italic) { return (italic ? 'italic ' : '') + (weight ? weight + ' ' : '') + px + 'px ' + FONT; }

  // ---------- 有上下標的畫布文字：「S_k」「S_{12}」畫成下標，「10^{19}」畫成上標 ----------
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
  /** 有光暈的文字，(x, y) 是垂直置中的參考點 */
  function rText(c, text, x, y, color, align, px, w) {
    const ss = segs(text), tw = richMeasure(c, ss, px, w);
    richDraw(c, ss, align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x, y, px, w, color, true);
  }
  /** 圓角底框標籤（同 LabDraw.pill：(x, yb) 是底框底邊的參考點），傳回底框 */
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
  /** HTML 版：科學記號用 <sup> */
  function fmtH(v, d) {
    const s0 = isFinite(v) ? M.sci(v) : null;
    if (s0) return (String(s0.m) + ' × 10<sup>' + s0.e + '</sup>').replace(/-/g, '−');
    return fmt(v, d);
  }
  /** 誤差這類小數：小於 1 時保留 3 位有效數字（0.00098 不會被四捨五入成 0.001） */
  function fmtSmall(v) {
    if (!isFinite(v)) return '—';
    if (v === 0) return '0';
    if (Math.abs(v) >= 1 || M.sci(v)) return fmtH(v);
    return String(+v.toPrecision(3)).replace('-', '−');
  }
  /** TeX 版 */
  function fmtT(v, d) {
    const s0 = isFinite(v) ? M.sci(v) : null;
    if (s0) return String(s0.m) + ' \\times 10^{' + s0.e + '}';
    return fmt(v, d).replace(/−/g, '-');
  }
  const par = function (v) { return v < 0 ? '(' + fmtT(v) + ')' : fmtT(v); };

  // ---------- 目前的量 ----------
  function kind() { return state.mode === 'geom' ? 'geom' : 'arith'; }
  function step() { return kind() === 'geom' ? state.r : state.d; }
  function Q() {
    const k = kind(), ts = M.terms(k, state.a1, step(), state.n), ps = M.partials(ts);
    const an = ts[ts.length - 1];
    const Sn = k === 'arith' ? M.arithSum(state.a1, state.d, state.n) : M.geomSum(state.a1, state.r, state.n);
    const Sinf = k === 'geom' ? M.geomInf(state.a1, state.r) : null;
    return { kind: k, ts: ts, ps: ps, an: an, Sn: Sn, Sinf: Sinf };
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
    ch = narrow ? Math.round(Math.max(360, Math.min(cw * 1.1, 460))) : 500;
    F = { narrow: narrow, P: { x0: 6, x1: cw - 6, y0: 6, y1: ch - 6 } };
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    requestDraw();
  }
  let rafId = 0;
  function requestDraw() { if (!rafId) rafId = requestAnimationFrame(function () { rafId = 0; draw(); }); }

  /** 漂亮的刻度間隔 */
  function niceStep(span) {
    if (!(span > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(span)));
    const m = span / e;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e;
  }
  /** 一個畫板：縱軸從 lo 到 hi */
  function makeScale(vals, box) {
    let lo = 0, hi = 0;
    vals.forEach(function (v) { if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
    if (hi - lo < 1e-12) hi = lo + 1;
    const st = niceStep((hi - lo) / 4);
    lo = Math.floor(lo / st - 1e-9) * st; hi = Math.ceil(hi / st + 1e-9) * st;
    if (hi - lo < 1e-12) hi = lo + st;
    const pad = 0.06 * (hi - lo);
    const big = Math.max(Math.abs(lo), Math.abs(hi));
    return { lo: lo - (lo < 0 ? pad : 0), hi: hi + (hi > 0 ? pad : 0), st: st, box: box, E: big >= 1e6 ? Math.floor(Math.log10(big)) : 0 };
  }
  const sy = function (S, v) { return S.box.y1 - (v - S.lo) / (S.hi - S.lo) * (S.box.y1 - S.box.y0); };
  const syInv = function (S, py) { return S.lo + (S.box.y1 - py) / (S.box.y1 - S.box.y0) * (S.hi - S.lo); };

  function panelBg(c, b) {
    D.roundRect(c, b.X0, b.Y0, b.X1 - b.X0, b.Y1 - b.Y0, 8);
    c.fillStyle = alpha(C.text, D.dark ? 0.03 : 0.022); c.fill();
  }
  function axes(c, S, title) {
    const b = S.box;
    c.font = fnt(10); c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let v = Math.ceil(S.lo / S.st - 1e-9) * S.st; v <= S.hi + 1e-9; v += S.st) {
      const y = sy(S, v);
      c.strokeStyle = alpha(C.text, Math.abs(v) < 1e-12 ? 0.4 : 0.07); c.lineWidth = Math.abs(v) < 1e-12 ? 1.3 : 1;
      c.beginPath(); c.moveTo(b.x0, y); c.lineTo(b.x1, y); c.stroke();
      c.fillStyle = alpha(C.muted, 0.95);
      c.fillText(fmt(r6(v / Math.pow(10, S.E || 0)), 3), b.x0 - 4, y);
    }
    if (title) rText(c, title + (S.E ? T('（單位 10^{', ' (unit 10^{') + S.E + T('}）', '})') : ''), b.x0 + 6, b.y0 + 9, C.muted, 'left', 11.5, 700);
  }

  // ---------- 長條與部分和 ----------
  let LAY = null; // 最近一次的版面（拖曳用）
  let frozen = null; // 拖曳時固定長條的縱軸
  function layout() {
    const P0 = F.P, gap = 10, showSum = state.sums;
    const topH = showSum ? Math.round((P0.y1 - P0.y0 - gap) * 0.56) : P0.y1 - P0.y0;
    const left = F.narrow ? 40 : 52;
    const B1 = { X0: P0.x0, X1: P0.x1, Y0: P0.y0, Y1: P0.y0 + topH, x0: P0.x0 + left, x1: P0.x1 - 10, y0: P0.y0 + 24, y1: P0.y0 + topH - 20 };
    const B2 = showSum ? { X0: P0.x0, X1: P0.x1, Y0: B1.Y1 + gap, Y1: P0.y1, x0: B1.x0, x1: B1.x1, y0: B1.Y1 + gap + 24, y1: P0.y1 - 20 } : null;
    return { B1: B1, B2: B2 };
  }
  function drawSeq(c) {
    const q = Q(), n = state.n, L = layout(), g = state.chal;
    const N = Math.max(n, g ? 4 : 1);
    const colW = (L.B1.x1 - L.B1.x0) / N;
    const cx = function (k) { return L.B1.x0 + (k - 0.5) * colW; };
    // 縱軸
    const vals = q.ts.slice();
    if (state.pair && q.kind === 'arith') q.ts.forEach(function (v, i) { vals.push(v + q.ts[n - 1 - i]); });
    if (g) g.shown.forEach(function (v) { vals.push(v); });
    const S1 = frozen || makeScale(vals, L.B1);
    S1.box = L.B1;
    LAY = { S1: S1, cx: cx, colW: colW };
    panelBg(c, L.B1);
    axes(c, S1, T('第 k 項 a', 'term a') + '_k');
    const y0 = sy(S1, 0), bw = Math.max(1, Math.min(colW * 0.72, 46));
    // 高斯配對
    if (state.pair && q.kind === 'arith') {
      const top = q.ts[0] + q.ts[n - 1];
      for (let k = 1; k <= n; k++) {
        const v = q.ts[k - 1], w = q.ts[n - k];
        const ya = sy(S1, v), yb = sy(S1, v + w);
        c.fillStyle = alpha(C['ss-pair'], D.dark ? 0.32 : 0.26);
        c.fillRect(cx(k) - bw / 2, Math.min(ya, yb), bw, Math.abs(yb - ya));
        if (bw > 3) { c.strokeStyle = alpha(C['ss-pair'], 0.8); c.lineWidth = 1; c.strokeRect(cx(k) - bw / 2, Math.min(ya, yb), bw, Math.abs(yb - ya)); }
      }
      const yt = sy(S1, top);
      c.strokeStyle = alpha(C['ss-pair'], 0.95); c.lineWidth = 1.6; c.setLineDash([6, 4]);
      c.beginPath(); c.moveTo(L.B1.x0, yt); c.lineTo(L.B1.x1, yt); c.stroke(); c.setLineDash([]);
      D.pill(c, T('首項 + 末項 = ', 'first + last = ') + fmt(top), L.B1.x0 + 4, yt + (top >= 0 ? -6 : 22), C['ss-pair'], 'left', fnt(11.5, 700));
    }
    // 長條
    for (let k = 1; k <= n; k++) {
      const v = q.ts[k - 1], yv = sy(S1, v), col = v >= 0 ? C['ss-pos'] : C['ss-neg'];
      const top = Math.min(y0, yv), h = Math.abs(yv - y0);
      const gr = c.createLinearGradient(cx(k) - bw / 2, 0, cx(k) + bw / 2, 0);
      gr.addColorStop(0, alpha(col, 0.95)); gr.addColorStop(1, alpha(col, 0.7));
      c.fillStyle = gr;
      c.fillRect(cx(k) - bw / 2, top, bw, Math.max(h, 0.8));
    }
    // 挑戰的虛線長條
    if (g) {
      c.save(); c.strokeStyle = C['ss-target']; c.lineWidth = 2; c.setLineDash([5, 4]);
      g.shown.forEach(function (v, i) {
        const yv = sy(S1, v);
        c.strokeRect(cx(i + 1) - bw / 2 - 3, Math.min(y0, yv), bw + 6, Math.max(2, Math.abs(yv - y0)));
      });
      c.restore();
      g.shown.forEach(function (v, i) { D.pill(c, fmt(v), cx(i + 1), sy(S1, v) + (v >= 0 ? -12 : 16), C['ss-target'], 'center', fnt(11, 700)); });
    }
    // 數值標籤（項數少時）
    if (n <= 12 && !g) for (let k = 1; k <= n; k++) {
      const v = q.ts[k - 1];
      D.haloText(c, fmt(v, 3), cx(k), sy(S1, v) + (v >= 0 ? -1 : 1) * (k <= 2 ? 16 : 9), v >= 0 ? C['ss-pos'] : C['ss-neg'], 'center', 'middle', fnt(10.5, 700));
    }
    // 第一、二根可以拖
    [1, 2].forEach(function (k) {
      if (k > n) return;
      D.ball(c, cx(k), sy(S1, q.ts[k - 1]), 5.5, k === 1 ? C.accent : C['ss-pair'], { glow: 0.3 });
    });
    // k 的刻度
    c.font = fnt(10); c.fillStyle = alpha(C.muted, 0.95); c.textAlign = 'center'; c.textBaseline = 'top';
    const every = N <= 12 ? 1 : N <= 30 ? 5 : 10;
    for (let k = 1; k <= N; k++) if (k === 1 || k % every === 0) c.fillText(String(k), cx(k), L.B1.y1 + 4);

    // 部分和
    if (L.B2) {
      const sv = q.ps.slice();
      if (q.Sinf != null) sv.push(q.Sinf);
      const S2 = makeScale(sv, L.B2);
      panelBg(c, L.B2);
      axes(c, S2, T('部分和 S', 'partial sum S') + '_k');
      const ySn0 = sy(S2, q.ps[n - 1]);
      if (q.Sinf != null) {
        const yl = sy(S2, q.Sinf);
        const below = Math.abs(ySn0 - yl) < 34 ? true : yl < L.B2.y0 + 30;
        c.strokeStyle = C['ss-lim']; c.lineWidth = 1.8; c.setLineDash([7, 5]);
        c.beginPath(); c.moveTo(L.B2.x0, yl); c.lineTo(L.B2.x1, yl); c.stroke(); c.setLineDash([]);
        rPill(c, 'S_∞ = ' + fmt(q.Sinf), L.B2.x1 - 4, below ? yl + 24 : yl - 6, C['ss-lim'], 'right', 11.5);
      }
      c.strokeStyle = alpha(C['ss-sum'], 0.7); c.lineWidth = 1.6;
      c.beginPath();
      q.ps.forEach(function (v, i) { const x = cx(i + 1), y = sy(S2, v); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
      c.stroke();
      const rr = n <= 30 ? 3.6 : n <= 60 ? 2.6 : 2;
      q.ps.forEach(function (v, i) {
        c.fillStyle = C['ss-sum']; c.beginPath(); c.arc(cx(i + 1), sy(S2, v), rr, 0, Math.PI * 2); c.fill();
      });
      const ySn = sy(S2, q.ps[n - 1]);
      D.ball(c, cx(n), ySn, 6, C['ss-sum'], { glow: 0.4 });
      const right = cx(n) > L.B2.x1 - 110;
      rPill(c, 'S_{' + n + '} = ' + fmt(q.Sn), cx(n) + (right ? -10 : 10), clampv(ySn - 8, L.B2.y0 + 22, L.B2.y1 - 6), C['ss-sum'], right ? 'right' : 'left', 11.5);
      c.font = fnt(10); c.fillStyle = alpha(C.muted, 0.95); c.textAlign = 'center'; c.textBaseline = 'top';
      for (let k = 1; k <= N; k++) if (k === 1 || k % every === 0) c.fillText(String(k), cx(k), L.B2.y1 + 4);
    }
  }

  // ---------- 圖形數 ----------
  function joinT() {
    if (!joinAnim) return state.join ? 1 : 0;
    const t = (performance.now() - joinAnim.t0) / 600;
    if (t >= 1) { joinAnim = null; return state.join ? 1 : 0; }
    requestDraw();
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    return state.join ? e : 1 - e;
  }
  function drawFig(c) {
    const P0 = F.P, n = state.fn, tri = state.fig === 'tri';
    D.roundRect(c, P0.x0, P0.y0, P0.x1 - P0.x0, P0.y1 - P0.y0, 8);
    c.fillStyle = alpha(C.text, D.dark ? 0.03 : 0.022); c.fill();
    const cols = tri ? n + 1 : n, rows = n;
    const W = P0.x1 - P0.x0 - 40, H = P0.y1 - P0.y0 - 70;
    const cell = Math.min(W / cols, H / rows, 44);
    const ox = (P0.x0 + P0.x1) / 2 - cols * cell / 2, oy = P0.y0 + 30 + (H - rows * cell) / 2;
    const rad = Math.max(1.2, cell * 0.36);
    const dot = function (col, row, color, a) {
      const x = ox + (col + 0.5) * cell, y = oy + (row + 0.5) * cell;
      if (rad >= 5) D.ball(c, x, y, rad, color, { glow: 0 });
      else { c.fillStyle = color; c.globalAlpha = a == null ? 1 : a; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
    };
    let count;
    if (tri) {
      for (let i = 1; i <= n; i++) for (let j = 0; j < i; j++) dot(j, i - 1, C['ss-dot1']);
      const t = joinT();
      if (t > 0) {
        c.save(); c.globalAlpha = t;
        const shift = (1 - t) * cell * 1.5;
        c.translate(shift, -shift * 0.4);
        for (let i = 1; i <= n; i++) for (let j = i; j <= n; j++) dot(j, i - 1, C['ss-dot2']);
        c.restore();
      }
      if (t >= 1) {
        c.strokeStyle = alpha(C.text, 0.4); c.lineWidth = 1.2; c.setLineDash([5, 4]);
        c.strokeRect(ox, oy, cols * cell, rows * cell); c.setLineDash([]);
        D.haloText(c, String(n + 1), ox + cols * cell / 2, oy - 12, C.muted, 'center', 'middle', fnt(12, 700));
        D.haloText(c, String(n), ox - 12, oy + rows * cell / 2, C.muted, 'right', 'middle', fnt(12, 700));
      }
      count = M.tri(n);
    } else {
      for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) {
        const k = Math.max(r, q) + 1;
        dot(q, r, k % 2 ? C['ss-dot1'] : C['ss-dot2']);
      }
      if (n <= 14 && cell >= 18) for (let k = 1; k <= n; k++) D.haloText(c, String(2 * k - 1), ox + k * cell + 4, oy + (k - 0.5) * cell, k % 2 ? C['ss-dot1'] : C['ss-dot2'], 'left', 'middle', fnt(11, 700));
      count = M.oddSum(n);
    }
    const lab = tri ? (state.join && !joinAnim ? '2 × (1 + 2 + … + ' + n + ') = ' + n + ' × ' + (n + 1) + ' = ' + n * (n + 1) : '1 + 2 + … + ' + n + ' = ' + count)
      : '1 + 3 + … + ' + (2 * n - 1) + ' = ' + n + ' × ' + n + ' = ' + count;
    D.pill(c, lab, (P0.x0 + P0.x1) / 2, P0.y1 - 16, C.accent, 'center', fnt(12.5, 700));
  }

  // ---------- 主畫面 ----------
  let kb = null;
  function draw() {
    if (!F) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(ctx, cw, ch);
    if (state.mode === 'fig') drawFig(ctx); else drawSeq(ctx);
    if (kb && kb.focused() && state.mode !== 'fig' && LAY) {
      const i = kb.index(), q = Q();
      const k = i === 2 ? 2 : i === 1 ? 1 : state.n;
      if (k <= state.n) {
        ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.arc(LAY.cx(k), sy(LAY.S1, q.ts[k - 1]), 12, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
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
  function updateReadouts() {
    const n = state.n;
    if (state.mode === 'arith') {
      const q = Q();
      setHTML('rAn', fmtH(q.an));
      setHTML('rSn', fmtH(q.Sn));
      setHTML('rPair', fmtH(q.ts[0] + q.an));
      setEq('rEq', 'a_{' + n + '} = a_1 + (' + n + ' - 1)d = ' + fmtT(state.a1) + ' + ' + (n - 1) + '\\cdot' + par(state.d) + ' = ' + fmtT(q.an));
      setEq('rEq2', 'S_{' + n + '} = \\frac{n(a_1 + a_n)}{2} = \\frac{' + n + '\\cdot(' + fmtT(state.a1) + ' + ' + par(q.an) + ')}{2} = ' + fmtT(q.Sn));
    } else if (state.mode === 'geom') {
      const q = Q();
      setHTML('rAn2', fmtH(q.an));
      setHTML('rSn2', fmtH(q.Sn));
      setHTML('rSinf', q.Sinf == null ? T('不存在（|r| ≥ 1）', 'none (|r| ≥ 1)') : fmtH(q.Sinf));
      setHTML('rErr', q.Sinf == null ? '—' : fmtSmall(Math.abs(q.Sinf - q.Sn)));
      setEq('rEq', 'a_{' + n + '} = a_1 r^{' + (n - 1) + '} = ' + fmtT(state.a1) + '\\cdot' + par(state.r) + '^{' + (n - 1) + '} = ' + fmtT(q.an));
      let e2 = state.r === 1 ? 'S_{' + n + '} = n\\,a_1 = ' + fmtT(q.Sn) : 'S_{' + n + '} = \\frac{a_1(1 - r^{' + n + '})}{1 - r} = ' + fmtT(q.Sn);
      if (q.Sinf != null) e2 += ',\\quad S_\\infty = \\frac{a_1}{1 - r} = \\frac{' + fmtT(state.a1) + '}{' + fmtT(r6(1 - state.r)) + '} = ' + fmtT(q.Sinf);
      setEq('rEq2', e2);
    } else {
      const nn = state.fn;
      if (state.fig === 'tri') {
        setHTML('rCnt', String(M.tri(nn)) + (M.isSquare(M.tri(nn)) && nn > 1 ? T('（也是 ', ' (also ') + Math.round(Math.sqrt(M.tri(nn))) + '<sup>2</sup>' + T('）', ')') : ''));
        setEq('rEq', '1 + 2 + \\cdots + ' + nn + ' = \\frac{' + nn + '\\cdot' + (nn + 1) + '}{2} = ' + M.tri(nn));
      } else {
        setHTML('rCnt', String(M.oddSum(nn)));
        setEq('rEq', '1 + 3 + \\cdots + ' + (2 * nn - 1) + ' = ' + nn + '^2 = ' + M.oddSum(nn));
      }
      setEq('rEq2', '');
    }
    setHTML('status', statusText());
  }
  function statusText() {
    if (state.chal) return T('神祕數列的前四項是虛線長條：它是每次加同樣的數，還是每次乘同樣的倍數？', 'The dashed bars are the first four terms of the mystery sequence: does it add the same amount each time, or multiply by the same factor?');
    const q = state.mode === 'fig' ? null : Q();
    if (state.mode === 'arith') {
      if (state.pair) return T('倒過來疊上去，每一行都是首項 + 末項 = ' + fmt(q.ts[0] + q.an) + '；' + state.n + ' 行加起來是 2S<sub>n</sub>，所以 S<sub>n</sub> = ' + fmt(q.Sn) + '。', 'Reversed and stacked, every column is first + last = ' + fmt(q.ts[0] + q.an) + '; ' + state.n + ' columns make 2S<sub>n</sub>, so S<sub>n</sub> = ' + fmt(q.Sn) + '.').replace(/<sub>n<\/sub>/g, '<sub>' + state.n + '</sub>');
      if (state.d === 0) return T('公差 0：每一項都一樣，部分和排成一直線。', 'Difference 0: every term is the same and the partial sums lie on a straight line.');
      return T('等差數列每次加 ' + fmt(state.d) + '；部分和 S<sub>k</sub> 是 k 的二次函數，點排在一條拋物線上。', 'Each term adds ' + fmt(state.d) + '; the partial sum S<sub>k</sub> is a quadratic in k, so its points lie on a parabola.');
    }
    if (state.mode === 'geom') {
      const r = state.r;
      if (state.a1 === 0) return T('首項是 0：每一項都是 0。', 'The first term is 0, so every term is 0.');
      if (r === 1) return T('公比 1：每一項都一樣，和一直變大，沒有極限。', 'Ratio 1: every term is the same and the sum grows without limit.');
      if (r === -1) return T('公比 −1：正負交替，部分和在兩個值之間來回擺盪，沒有極限。', 'Ratio −1: the signs alternate and the partial sums swing between two values with no limit.');
      if (Math.abs(r) < 1) return (r < 0 ? T('公比是負的：部分和在 S<sub>∞</sub> 的上下跳動，', 'Negative ratio: the partial sums jump above and below S<sub>∞</sub>, ') : T('長條越來越短，部分和越來越靠近 S<sub>∞</sub>，', 'The bars shrink and the partial sums approach S<sub>∞</sub>; ')) + T('還差 ' + fmtSmall(Math.abs(q.Sinf - q.Sn)) + '（= |S<sub>∞</sub>| × |r|<sup>n</sup>）。', 'the gap is ' + fmtSmall(Math.abs(q.Sinf - q.Sn)) + ' (= |S<sub>∞</sub>| × |r|<sup>n</sup>).');
      return T('|r| > 1：長條越來越長，部分和沒有極限。', '|r| > 1: the bars keep growing and the partial sums have no limit.');
    }
    if (state.fig === 'tri') {
      const t = M.tri(state.fn);
      if (state.join) return T('兩份三角形拼成 ' + state.fn + ' × ' + (state.fn + 1) + ' 的長方形，所以一份是它的一半：' + t + '。', 'Two triangles make a ' + state.fn + ' × ' + (state.fn + 1) + ' rectangle, so one is half of it: ' + t + '.');
      return T('第 k 列有 k 個點。按「再拼一份轉過來的」看看。', 'Row k has k dots. Try adding a second copy turned around.');
    }
    return T('每一層 L 形多 2 個點：1、3、5、……，一層層包起來剛好是正方形。', 'Each L-shaped layer has 2 more dots than the last — 1, 3, 5, … — and together they always make a square.');
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
  /** 加一項時，音高跟著那一項在所有項裡的相對大小（大的高、小的低） */
  function termSound() {
    if (state.mode === 'fig') { blip(330 + 8 * state.fn, 'sine', 0.1); return; }
    const q = Q(), mx = Math.max.apply(null, q.ts.map(Math.abs)) || 1;
    blip(262 + 400 * Math.abs(q.an) / mx, q.an >= 0 ? 'sine' : 'triangle', 0.12);
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function emitMode() {
    if (state.mode === 'fig') {
      const cnt = state.fig === 'tri' ? M.tri(state.fn) : M.oddSum(state.fn);
      emit('fig', { kind: state.fig, n: state.fn, count: cnt, joined: state.fig === 'tri' && state.join });
      return;
    }
    const q = Q();
    if (state.mode === 'arith') emit('arith', { a1: state.a1, d: state.d, n: state.n, an: q.an, Sn: q.Sn, pair: state.pair });
    else emit('geom', { a1: state.a1, r: state.r, n: state.n, an: q.an, Sn: q.Sn, Sinf: q.Sinf, first99: M.firstWithin(state.a1, state.r, state.n, 0.01) });
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  const lab = $('lab');
  const el = { sa: $('sa'), sd: $('sd'), sr: $('sr'), sn: $('sn'), fn: $('fn') };
  function readOne(k) {
    const v = val(el[k]);
    if (k === 'sa') state.a1 = r6(v);
    else if (k === 'sd') state.d = r6(v);
    else if (k === 'sr') state.r = r6(v);
    else if (k === 'sn') state.n = clampv(Math.round(v), 1, 100);
    else if (k === 'fn') state.fn = clampv(Math.round(v), 1, 50);
  }
  function refreshOutputs() {
    $('sao').textContent = fmt(state.a1); $('sdo').textContent = fmt(state.d); $('sro').textContent = fmt(state.r);
    $('sno').textContent = String(state.n); $('fno').textContent = String(state.fn);
  }
  function refresh() { refreshOutputs(); updateReadouts(); requestDraw(); }
  function setSlider(e, v) {
    applying = true;
    if (window.LabNum) window.LabNum.set(e, v); else e.value = v;
    applying = false;
  }
  function syncAll() { setSlider(el.sa, state.a1); setSlider(el.sd, state.d); setSlider(el.sr, state.r); setSlider(el.sn, state.n); setSlider(el.fn, state.fn); }
  Object.keys(el).forEach(function (k) {
    el[k].addEventListener('input', function () {
      if (applying) return;
      const old = k === 'sn' ? state.n : k === 'fn' ? state.fn : null;
      readOne(k); refresh();
      if ((k === 'sn' && state.n !== old) || (k === 'fn' && state.fn !== old)) termSound();
    });
    el[k].addEventListener('change', function () { if (applying) return; readOne(k); refresh(); emitMode(); });
  });
  $('pairC').addEventListener('change', function () { state.pair = $('pairC').checked; refresh(); emitMode(); blip(440); });
  $('sumC').addEventListener('change', function () { state.sums = $('sumC').checked; refresh(); blip(392); });
  $('joinC').addEventListener('change', function () {
    state.join = $('joinC').checked;
    if (!reduceMotion.matches) joinAnim = { t0: performance.now() };
    refresh(); emitMode(); blip(state.join ? 523.25 : 392);
    if (joinAnim) setTimeout(refresh, 650);
  });
  document.querySelectorAll('#figPick button').forEach(function (bt) {
    bt.addEventListener('click', function () {
      state.fig = bt.getAttribute('data-fig');
      lab.setAttribute('data-fig', state.fig);
      document.querySelectorAll('#figPick button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === bt)); });
      for (const id in eqKey) delete eqKey[id];
      refresh(); emitMode(); blip(494);
    });
  });
  function setMode(m) {
    if (m === state.mode) return;
    if (state.chal && m === 'fig') quitChal(true);
    state.mode = m;
    lab.setAttribute('data-mode', m);
    document.querySelectorAll('.modes button').forEach(function (bt) { bt.setAttribute('aria-pressed', String(bt.getAttribute('data-mode') === m)); });
    for (const id in eqKey) delete eqKey[id];
    refresh(); emitMode();
  }
  document.querySelectorAll('.modes button').forEach(function (bt) { bt.addEventListener('click', function () { setMode(bt.getAttribute('data-mode')); }); });

  // ---------- 全部清除 ----------
  $('clear').addEventListener('click', function () {
    if (state.chal) quitChal(true);
    state.log = []; state.streak = []; state.round = 0; lastChal = null;
    setChalMsg(''); renderLog();
    for (const id in eqKey) delete eqKey[id];
    refresh();
    blip(392);
  });

  // ---------- 在圖上拖曳第一、二根長條 ----------
  let drag = null;
  function posOf(ev) { const rc = cv.getBoundingClientRect(); return { px: ev.clientX - rc.left, py: ev.clientY - rc.top }; }
  function hitTest(px, py, R) {
    if (state.mode === 'fig' || !LAY) return null;
    const q = Q();
    let best = null, bd = Infinity;
    [1, 2].forEach(function (k) {
      if (k > state.n) return;
      const x = LAY.cx(k), y = sy(LAY.S1, q.ts[k - 1]);
      const dx = Math.max(0, Math.abs(px - x) - Math.max(LAY.colW * 0.36, 4));
      const d = Math.hypot(dx, py - y);
      if (d < bd) { bd = d; best = k; }
    });
    return best && bd <= R ? best : null;
  }
  function dragTo(k, py) {
    const v = Math.round(syInv(LAY.S1, py) * 2) / 2;
    if (k === 1) {
      const a1 = clampv(v, -10, 10);
      if (a1 === state.a1) return;
      if (kind() === 'arith') state.a1 = a1;
      else state.a1 = a1;
      setSlider(el.sa, state.a1);
    } else if (kind() === 'arith') {
      const d = clampv(r6(v - state.a1), -5, 5);
      if (d === state.d) return;
      state.d = d; setSlider(el.sd, d);
    } else {
      if (state.a1 === 0) return;
      const raw = syInv(LAY.S1, py) / state.a1;
      const r = clampv(Math.round(raw * 20) / 20, -2, 2);
      if (r === state.r) return;
      state.r = r6(r); setSlider(el.sr, state.r);
    }
    blip(392 + (k === 1 ? 0 : 100), 'sine', 0.07);
    refresh();
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (!F) return;
    const p = posOf(ev), touch = ev.pointerType === 'touch' || ev.pointerType === 'pen';
    const k = hitTest(p.px, p.py, touch ? 22 : 13);
    if (!k) return;
    ev.preventDefault();
    drag = { id: ev.pointerId, k: k };
    frozen = { lo: LAY.S1.lo, hi: LAY.S1.hi, st: LAY.S1.st, box: LAY.S1.box, E: LAY.S1.E };
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!F) return;
    const p = posOf(ev);
    if (!drag) { cv.style.cursor = hitTest(p.px, p.py, 13) ? 'ns-resize' : 'default'; return; }
    if (drag.id !== ev.pointerId) return;
    dragTo(drag.k, p.py);
  });
  function endDrag(ev) {
    if (!drag || drag.id !== ev.pointerId) return;
    drag = null; frozen = null;
    requestDraw();
    emitMode();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // ---------- 鍵盤 ----------
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('數列畫布。Enter 切換項數 n、首項、公差或公比；左右鍵改項數，上下鍵改首項、公差或公比，Shift 改得更多。', 'Sequence canvas. Enter switches between n, the first term and the difference or ratio; left and right change n, up and down change the first term, difference or ratio, Shift for bigger steps.'),
      items: [{
        name: function () { return T('項數 n', 'number of terms n'); },
        move: function (dx, dy, big) {
          const st = (dx || dy) * (big ? 10 : 1);
          if (state.mode === 'fig') { state.fn = clampv(state.fn + st, 1, 50); setSlider(el.fn, state.fn); }
          else { state.n = clampv(state.n + st, 1, 100); setSlider(el.sn, state.n); }
          refresh(); termSound(); emitMode(); return true;
        },
        describe: function () { return 'n = ' + (state.mode === 'fig' ? state.fn : state.n); }
      }, {
        name: function () { return T('首項', 'first term'); },
        move: function (dx, dy, big) {
          if (state.mode === 'fig') return false;
          state.a1 = clampv(r6(state.a1 + (dy || dx) * (big ? 2 : 0.5)), -10, 10);
          setSlider(el.sa, state.a1); refresh(); emitMode(); return true;
        },
        describe: function () { return 'a1 = ' + fmt(state.a1); }
      }, {
        name: function () { return kind() === 'geom' ? T('公比', 'ratio') : T('公差', 'difference'); },
        move: function (dx, dy, big) {
          if (state.mode === 'fig') return false;
          const s = dy || dx;
          if (kind() === 'geom') { state.r = clampv(r6(state.r + s * (big ? 0.25 : 0.05)), -2, 2); setSlider(el.sr, state.r); }
          else { state.d = clampv(r6(state.d + s * (big ? 2 : 0.5)), -5, 5); setSlider(el.sd, state.d); }
          refresh(); emitMode(); return true;
        },
        describe: function () { return kind() === 'geom' ? 'r = ' + fmt(state.r) : 'd = ' + fmt(state.d); }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 挑戰：猜數列
  // =====================================================================
  const chalMsg = $('chalMsg');
  function setChalMsg(msg, cls) { chalMsg.textContent = msg || ''; chalMsg.classList.toggle('ok', cls === 'ok'); chalMsg.classList.toggle('bad', cls === 'bad'); }
  function startChal(forced) {
    if (state.mode === 'fig') setMode('arith');
    const g = forced || M.genChallenge(rand, lastChal);
    if (!g) { setChalMsg(T('出不了題，請再按一次。', 'Could not make a challenge; please try again.')); return; }
    state.round++;
    state.chal = { kind: g.kind, a1: g.a1, s: g.s, shown: g.shown, check: g.check, t0: performance.now(), round: state.round, tries: 0 };
    lastChal = g;
    if (state.n < 5) { state.n = 5; setSlider(el.sn, 5); }
    $('lgTarget').hidden = false;
    setChalMsg(T('第 ' + state.round + ' 題：', 'Challenge ' + state.round + ': ') + g.shown.map(function (v) { return fmt(v); }).join(', ') + ', …');
    $('submitC').hidden = false; $('quitChal').hidden = false;
    $('newChal').textContent = T('換一題', 'Another one');
    for (const id in eqKey) delete eqKey[id];
    refresh();
  }
  function submitC() {
    const g = state.chal;
    if (!g) return;
    g.tries++;
    const mine = M.terms(kind(), state.a1, step(), 5);
    let bad = -1;
    for (let i = 0; i < 5; i++) if (Math.abs(mine[i] - g.check[i]) > 1e-9) { bad = i; break; }
    if (bad >= 0) {
      state.streak = [];
      chime(false);
      setChalMsg(bad < 4 ? T('你的第 ' + (bad + 1) + ' 項是 ' + fmt(mine[bad]) + '，和虛線長條不一樣。（連續答對重新計算）', 'Your term ' + (bad + 1) + ' is ' + fmt(mine[bad]) + ', which does not match the dashed bar. (The streak starts over.)')
        : T('前四項都對了，但第 5 項沒有照規律接下去：想想是加還是乘。（連續答對重新計算）', 'The first four match, but term 5 does not continue the pattern: is it adding or multiplying? (The streak starts over.)'), 'bad');
      return;
    }
    const time = (performance.now() - g.t0) / 1000;
    state.log.push({ round: g.round, kind: g.kind, a1: g.a1, s: g.s, time: time, first: g.tries === 1 });
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
  function ruleText(r) { return r.kind === 'arith' ? T('等差 ', 'arith. ') + 'a1 = ' + fmt(r.a1) + ', d = ' + fmt(r.s) : T('等比 ', 'geom. ') + 'a1 = ' + fmt(r.a1) + ', r = ' + fmt(r.s); }
  function quitChal(silent) {
    const g = state.chal;
    if (!g) return;
    state.log.push({ round: g.round, kind: g.kind, a1: g.a1, s: g.s, time: null });
    state.chal = null; state.streak = [];
    $('lgTarget').hidden = true;
    $('submitC').hidden = true; $('quitChal').hidden = true;
    $('newChal').textContent = T('出一題', 'New challenge');
    setChalMsg(silent ? '' : T('這題放棄了，答案是 ', 'Given up. The answer was ') + ruleText(g) + T('；連續答對重新計算。', '; the streak starts over.'));
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
    let h = '<tr><th>' + T('題', '#') + '</th><th>' + T('答案', 'answer') + '</th><th>' + T('秒', 's') + '</th></tr>';
    state.log.slice(-8).reverse().forEach(function (r) {
      h += '<tr><td>' + r.round + '</td><td>' + ruleText(r) + '</td><td>' + (r.time == null ? T('放棄', 'gave up') : r.time.toFixed(1) + (r.first ? '' : '*')) + '</td></tr>';
    });
    t.innerHTML = h;
  }

  // 給測試用的介面（不影響畫面）
  window.__ss = {
    state: state, Q: Q,
    startChal: function (g) { startChal(g); },
    seed: function (s) { rand = M.rng(s); },
    barTop: function (k) { if (!LAY) return null; const q = Q(); return [LAY.cx(k), sy(LAY.S1, q.ts[k - 1])]; },
    yOf: function (v) { return LAY ? sy(LAY.S1, v) : null; }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  syncAll();
  state.pair = $('pairC').checked; state.sums = $('sumC').checked; state.join = $('joinC').checked;
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
})();
