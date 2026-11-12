/* limits.js — 「數列與函數的極限」的畫面與互動（數學計算在 limits-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 數列：第 1 到第 n 項畫成點，極限 L 周圍半寬 ε 的帶子；學生移動 N，狀態列判斷「第 N 項以後是不是都在帶子裡」。
 *   發散的數列沒有 L：帶子中心可以上下拖，怎麼放都關不住。
 * 函數：f(x) 在 x → a 附近，水平的 ε 帶子與垂直的 δ 範圍；δ 範圍裡的曲線在帶子裡畫綠色、跑出去畫紅色；可放大、看夾擠、從左右逼近。
 * 無窮等比級數：數線上一跳一跳的部分和，下面是部分和的折線與每一項的長條。
 * 挑戰「找 N」：隨機數列與 ε，送出最小的 N。 */
(function () {
  'use strict';
  const M = window.LimitsCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha;
  /** 各函數的基本視窗：x 半寬 xw、y 中心 yc、y 半高 yh */
  const VIEW = {
    hole: { xw: 2, yc: 2, yh: 2 }, sinc: { xw: 9, yc: 0.35, yh: 0.85 }, xsin: { xw: 1.2, yc: 0, yh: 1 },
    sign: { xw: 2, yc: 0, yh: 1.7 }, inv2: { xw: 2, yc: 2.6, yh: 2.8 }, epow: { xw: 0.95, yc: 2.9, yh: 1.6 }
  };

  // ---------- 狀態 ----------
  const state = {
    mode: 'seq',
    seq: 'recip', r: 0.8, eps: 0.2, N: 1, show: 40, yz: false, Lc: 0,
    fn: 'hole', fe: 0.2, fd: 0.5, fz: 1, sq: false, ap: { left: null, right: null }, anim: null,
    sa: 1, sr: 0.5, sn: 6,
    chal: null, round: 0, streak: [], log: []
  };
  let rand = M.rng(((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0);
  let lastChal = null;
  let applying = false;

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'lm-band', 'lm-in', 'lm-out', 'lm-bad', 'lm-n', 'lm-curve', 'lm-sq', 'lm-sum']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight, italic) { return (italic ? 'italic ' : '') + (weight ? weight + ' ' : '') + px + 'px ' + FONT; }

  // ---------- 數字 ----------
  /** 有效數字 sig 位；太小或太大時用科學記號（HTML 用 <sup>、畫布用 ×10^） */
  function parts(v, sig) {
    if (v == null || isNaN(v)) return null;
    if (!isFinite(v)) return { s: v > 0 ? '∞' : '−∞' };
    if (v === 0) return { s: '0' };
    const a = Math.abs(v);
    if (a >= 1e-4 && a < 1e7) {
      let s = Number(v.toPrecision(sig || 6)).toString();
      if (/e/.test(s)) s = v.toFixed(8);
      return { s: s.replace('-', '−') };
    }
    const e = Math.floor(Math.log10(a));
    let m = Number((v / Math.pow(10, e)).toPrecision(Math.min(sig || 6, 4)));
    if (Math.abs(m) >= 10) { m /= 10; return { m: String(m).replace('-', '−'), e: e + 1 }; }
    return { m: String(m).replace('-', '−'), e: e };
  }
  function fmtH(v, sig) { const p = parts(v, sig); if (!p) return '—'; return p.s != null ? p.s : p.m + ' × 10<sup>' + String(p.e).replace('-', '−') + '</sup>'; }
  function fmtT(v, sig) { const p = parts(v, sig); if (!p) return '?'; if (p.s != null) return p.s.replace('−', '-').replace('∞', '\\infty'); return p.m.replace('−', '-') + '\\times 10^{' + p.e + '}'; }
  function fmtC(v, sig) { const p = parts(v, sig); if (!p) return '—'; return p.s != null ? p.s : p.m + '×10^' + String(p.e).replace('-', '−'); }
  function epsStr(v) { return fmtH(v, 4); }
  function niceStep(span, n) {
    const raw = span / (n || 5), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }
  function tickStr(v, step) {
    const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    if (dec > 6) return fmtC(v, 3);
    let s = v.toFixed(dec);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }

  // ---------- 目前的量 ----------
  function seqSpec() {
    if (state.chal) return state.chal.spec;
    const sp = Object.assign({}, M.SEQS[state.seq]);
    if (sp.kind === 'geo') sp.r = state.r;
    return sp;
  }
  function QS() {
    const sp = seqSpec(), lim = M.limit(sp), eps = state.chal ? state.chal.eps : state.eps;
    const center = lim.conv ? lim.L : state.Lc;
    const inBand = function (n) { return lim.conv ? M.err(sp, n) < eps : Math.abs(M.term(sp, n) - center) < eps; };
    const Nm = lim.conv ? M.Nmin(sp, eps) : null;
    const out = lim.conv ? M.firstOut(sp, eps, state.N) : M.firstOutAround(sp, center, eps, state.N);
    return { sp: sp, lim: lim, eps: eps, center: center, inBand: inBand, Nmin: Nm, out: out, allIn: out == null };
  }
  function QF() {
    const F = M.FUNCS[state.fn];
    const dmax = M.deltaMax(state.fn, state.fe);
    const ok = dmax != null && state.fd <= dmax * (1 + 1e-9);
    return { F: F, dmax: dmax, ok: ok };
  }
  function QZ() {
    const S = M.partial(state.sa, state.sr, state.sn), I = M.sumInf(state.sa, state.sr);
    return { S: S, I: I };
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
    ch = narrow ? Math.round(Math.max(340, Math.min(cw * 1.08, 440))) : 480;
    F = { narrow: narrow, W: cw, H: ch, P: { x0: narrow ? 42 : 52, x1: cw - 12, y0: 14, y1: ch - 30 } };
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    requestDraw();
  }
  let rafId = 0;
  function requestDraw() { if (!rafId) rafId = requestAnimationFrame(function () { rafId = 0; draw(); }); }
  function clipP(c) { const P = F.P; c.beginPath(); c.rect(P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0); c.clip(); }
  function panel(c) {
    const P = F.P;
    D.roundRect(c, P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0, 8);
    c.fillStyle = alpha(C.text, D.dark ? 0.03 : 0.022); c.fill();
  }

  // =====================================================================
  // 數列
  // =====================================================================
  function seqFrame(q) {
    const P = F.P, n1 = state.chal ? 100 : state.show;
    let H;
    if (state.yz) H = Math.max(q.eps * 4, 1e-9);
    else {
      let m = 0;
      for (let n = 1; n <= n1; n++) { const d = Math.abs(M.term(q.sp, n) - q.center); if (isFinite(d)) m = Math.max(m, d); }
      H = Math.min(6, Math.max(m * 1.12, q.eps * 2.5, 0.05));
    }
    const midY = (P.y0 + P.y1) / 2, hh = (P.y1 - P.y0) / 2 - 6;
    return {
      n1: n1, H: H,
      X: function (n) { return P.x0 + (n - 0.5) / n1 * (P.x1 - P.x0); },
      Y: function (v) { return midY - (v - q.center) / H * hh; },
      nAt: function (px) { return (px - P.x0) / (P.x1 - P.x0) * n1 + 0.5; },
      vAt: function (py) { return q.center + (midY - py) / hh * H; }
    };
  }
  function drawSeq(c) {
    const P = F.P, q = QS(), S = seqFrame(q);
    panel(c);
    c.save(); clipP(c);
    // 格線與刻度
    const ys = niceStep(2 * S.H, 6);
    c.lineWidth = 1;
    for (let v = Math.ceil((q.center - S.H * 1.1) / ys) * ys; v <= q.center + S.H * 1.1; v += ys) {
      c.strokeStyle = alpha(C.text, Math.abs(v) < ys * 1e-6 ? 0.35 : 0.06);
      c.beginPath(); c.moveTo(P.x0, S.Y(v)); c.lineTo(P.x1, S.Y(v)); c.stroke();
    }
    const xs = Math.max(1, Math.round(niceStep(S.n1, F.narrow ? 5 : 8)));
    for (let n = xs; n <= S.n1; n += xs) { c.strokeStyle = alpha(C.text, 0.05); c.beginPath(); c.moveTo(S.X(n), P.y0); c.lineTo(S.X(n), P.y1); c.stroke(); }
    // 第 N 項以後的區域
    const N = state.N, xN = N <= S.n1 ? S.X(N - 0.5) : P.x1;
    c.fillStyle = alpha(C['lm-n'], D.dark ? 0.08 : 0.06);
    c.fillRect(xN, P.y0, P.x1 - xN, P.y1 - P.y0);
    // ε 帶子
    let yT = S.Y(q.center + q.eps), yB = S.Y(q.center - q.eps);
    if (yB - yT < 2) { const m = (yT + yB) / 2; yT = m - 1; yB = m + 1; }
    c.fillStyle = alpha(C['lm-band'], D.dark ? 0.16 : 0.13);
    c.fillRect(P.x0, yT, P.x1 - P.x0, yB - yT);
    c.strokeStyle = alpha(C['lm-band'], 0.85); c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(P.x0, yT); c.lineTo(P.x1, yT); c.moveTo(P.x0, yB); c.lineTo(P.x1, yB); c.stroke();
    // 極限（或帶子中心）
    c.setLineDash([6, 4]); c.strokeStyle = q.lim.conv ? C['lm-band'] : alpha(C.muted, 0.8); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(P.x0, S.Y(q.center)); c.lineTo(P.x1, S.Y(q.center)); c.stroke(); c.setLineDash([]);
    // 夾擠：±1/n
    if (q.sp.kind === 'sinn') {
      c.strokeStyle = alpha(C['lm-sq'], 0.85); c.lineWidth = 1.3; c.setLineDash([4, 3]);
      [1, -1].forEach(function (s) {
        c.beginPath();
        for (let t = 0; t <= 400; t++) { const n = 0.6 + t / 400 * (S.n1 + 0.4 - 0.6); const x = S.X(n), y = S.Y(s / n); if (t) c.lineTo(x, y); else c.moveTo(x, y); }
        c.stroke();
      });
      c.setLineDash([]);
    }
    // 折線
    c.strokeStyle = alpha(C.text, 0.16); c.lineWidth = 1;
    c.beginPath();
    for (let n = 1; n <= S.n1; n++) { const y = Math.max(P.y0 - 20, Math.min(P.y1 + 20, S.Y(M.term(q.sp, n)))); if (n > 1) c.lineTo(S.X(n), y); else c.moveTo(S.X(n), y); }
    c.stroke();
    // 點
    const sp = (P.x1 - P.x0) / S.n1, rr = Math.max(1.6, Math.min(4.6, sp * 0.32));
    for (let n = 1; n <= S.n1; n++) {
      const v = M.term(q.sp, n), x = S.X(n);
      const inb = q.inBand(n), bad = !inb && n >= N;
      const col = inb ? C['lm-in'] : bad ? C['lm-bad'] : C['lm-out'];
      let y = S.Y(v);
      if (!isFinite(y) || y < P.y0 + 4 || y > P.y1 - 4) {
        // 超出畫面：在邊上畫小三角形
        const up = !(y > P.y1 - 4);
        y = up ? P.y0 + 5 : P.y1 - 5;
        c.fillStyle = col; c.beginPath();
        if (up) { c.moveTo(x, y - 4); c.lineTo(x - 3.5, y + 2); c.lineTo(x + 3.5, y + 2); } else { c.moveTo(x, y + 4); c.lineTo(x - 3.5, y - 2); c.lineTo(x + 3.5, y - 2); }
        c.fill();
        continue;
      }
      if (rr >= 3) D.ball(c, x, y, rr, col, { glow: null });
      else { c.fillStyle = col; c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); c.fill(); }
      if (bad) { c.strokeStyle = C['lm-bad']; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, rr + 3, 0, Math.PI * 2); c.stroke(); }
    }
    // N 的直線
    c.strokeStyle = C['lm-n']; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(xN, P.y0); c.lineTo(xN, P.y1); c.stroke();
    c.restore();
    // 刻度文字
    c.font = fnt(10.5); c.fillStyle = C.muted;
    for (let v = Math.ceil((q.center - S.H) / ys) * ys; v <= q.center + S.H + 1e-12; v += ys) {
      const y = S.Y(v);
      if (y < P.y0 + 6 || y > P.y1 - 4) continue;
      c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(tickStr(v, ys), P.x0 - 4, y);
    }
    for (let n = xs; n <= S.n1; n += xs) { c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(String(n), S.X(n), P.y1 + 4); }
    D.haloText(c, 'n', P.x1, P.y1 + 16, C.muted, 'right', 'top', fnt(12, 600, true));
    // 標籤
    const lab = q.lim.conv ? 'L = ' + (q.sp.kind === 'e' ? 'e' : fmtC(q.center, 6)) : T('帶子中心 ', 'centre ') + fmtC(q.center, 4);
    D.pill(c, lab, P.x1 - 6, Math.max(P.y0 + 22, Math.min(P.y1 - 6, yT - 4)), q.lim.conv ? C['lm-band'] : C.muted, 'right', fnt(11.5, 600));
    if (yB - yT > 18) D.haloText(c, 'ε', P.x0 + 8, (S.Y(q.center) + yT) / 2, C['lm-band'], 'left', 'middle', fnt(13, 700, true));
    const nl = 'N = ' + state.N + (state.N > S.n1 ? ' →' : '');
    D.pill(c, nl, Math.min(Math.max(xN, P.x0 + 30), P.x1 - 4), P.y0 + 24, C['lm-n'], state.N > S.n1 || xN > P.x1 - 60 ? 'right' : 'center', fnt(12, 700));
  }

  // =====================================================================
  // 函數
  // =====================================================================
  function funcFrame() {
    const P = F.P, Fn = M.FUNCS[state.fn], V = VIEW[state.fn], z = state.fz;
    const Lr = Fn.L != null ? Fn.L : V.yc;
    const cx = Fn.a, cy = Lr + (V.yc - Lr) / z, hx = V.xw / z, hy = V.yh / z;
    return {
      cx: cx, cy: cy, hx: hx, hy: hy,
      X: function (x) { return P.x0 + (x - (cx - hx)) / (2 * hx) * (P.x1 - P.x0); },
      Y: function (y) { return P.y1 - (y - (cy - hy)) / (2 * hy) * (P.y1 - P.y0); },
      xAt: function (px) { return cx - hx + (px - P.x0) / (P.x1 - P.x0) * 2 * hx; },
      yAt: function (py) { return cy - hy + (P.y1 - py) / (P.y1 - P.y0) * 2 * hy; }
    };
  }
  function drawFunc(c) {
    const P = F.P, q = QF(), Fn = q.F, V = funcFrame(), a = Fn.a, eps = state.fe, del = state.fd;
    panel(c);
    c.save(); clipP(c);
    // 格線
    const xs = niceStep(2 * V.hx, F.narrow ? 4 : 6), ys = niceStep(2 * V.hy, 6);
    c.lineWidth = 1;
    for (let x = Math.ceil((V.cx - V.hx) / xs) * xs; x <= V.cx + V.hx; x += xs) { c.strokeStyle = alpha(C.text, 0.05); c.beginPath(); c.moveTo(V.X(x), P.y0); c.lineTo(V.X(x), P.y1); c.stroke(); }
    for (let y = Math.ceil((V.cy - V.hy) / ys) * ys; y <= V.cy + V.hy; y += ys) { c.strokeStyle = alpha(C.text, 0.05); c.beginPath(); c.moveTo(P.x0, V.Y(y)); c.lineTo(P.x1, V.Y(y)); c.stroke(); }
    c.strokeStyle = alpha(C.text, 0.4); c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(P.x0, V.Y(0)); c.lineTo(P.x1, V.Y(0)); c.moveTo(V.X(0), P.y0); c.lineTo(V.X(0), P.y1); c.stroke();
    // δ 範圍
    c.fillStyle = alpha(C['lm-n'], D.dark ? 0.1 : 0.07);
    c.fillRect(V.X(a - del), P.y0, V.X(a + del) - V.X(a - del), P.y1 - P.y0);
    c.strokeStyle = alpha(C['lm-n'], 0.9); c.lineWidth = 1.5; c.setLineDash([5, 4]);
    c.beginPath(); c.moveTo(V.X(a - del), P.y0); c.lineTo(V.X(a - del), P.y1); c.moveTo(V.X(a + del), P.y0); c.lineTo(V.X(a + del), P.y1); c.stroke(); c.setLineDash([]);
    // ε 帶子
    if (Fn.L != null) {
      let yT = V.Y(Fn.L + eps), yB = V.Y(Fn.L - eps);
      if (yB - yT < 2) { const m = (yT + yB) / 2; yT = m - 1; yB = m + 1; }
      c.fillStyle = alpha(C['lm-band'], D.dark ? 0.15 : 0.12); c.fillRect(P.x0, yT, P.x1 - P.x0, yB - yT);
      c.strokeStyle = alpha(C['lm-band'], 0.85); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(P.x0, yT); c.lineTo(P.x1, yT); c.moveTo(P.x0, yB); c.lineTo(P.x1, yB); c.stroke();
      // 兩者交出來的方框
      c.strokeStyle = q.ok ? C['lm-band'] : C['lm-bad']; c.lineWidth = 2.2;
      c.strokeRect(V.X(a - del), yT, V.X(a + del) - V.X(a - del), yB - yT);
    }
    // 夾擠
    if (state.sq && (state.fn === 'xsin' || state.fn === 'sinc')) {
      c.strokeStyle = C['lm-sq']; c.lineWidth = 1.6; c.setLineDash([6, 4]);
      if (state.fn === 'xsin') {
        c.beginPath(); c.moveTo(V.X(V.cx - V.hx), V.Y(V.hx)); c.lineTo(V.X(0), V.Y(0)); c.lineTo(V.X(V.cx + V.hx), V.Y(V.hx));
        c.moveTo(V.X(V.cx - V.hx), V.Y(-V.hx)); c.lineTo(V.X(0), V.Y(0)); c.lineTo(V.X(V.cx + V.hx), V.Y(-V.hx)); c.stroke();
      } else {
        c.beginPath(); c.moveTo(P.x0, V.Y(1)); c.lineTo(P.x1, V.Y(1)); c.stroke();
        c.beginPath();
        const lo = Math.max(-Math.PI / 2, V.cx - V.hx), hi = Math.min(Math.PI / 2, V.cx + V.hx);
        for (let t = 0; t <= 300; t++) { const x = lo + (hi - lo) * t / 300; if (t) c.lineTo(V.X(x), V.Y(Math.cos(x))); else c.moveTo(V.X(x), V.Y(Math.cos(x))); }
        c.stroke();
      }
      c.setLineDash([]);
    }
    // 漸近線
    if (state.fn === 'inv2') { c.strokeStyle = alpha(C.muted, 0.7); c.setLineDash([3, 4]); c.lineWidth = 1.2; c.beginPath(); c.moveTo(V.X(0), P.y0); c.lineTo(V.X(0), P.y1); c.stroke(); c.setLineDash([]); }
    // 曲線：δ 範圍外用一般顏色，範圍內依是否在帶子裡用綠或紅
    const NS = state.fn === 'xsin' ? 3000 : 1600;
    const x0 = V.cx - V.hx, x1 = V.cx + V.hx;
    function seg(color, width, pred) {
      c.strokeStyle = color; c.lineWidth = width; c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath();
      let pen = false, py = null;
      for (let t = 0; t <= NS; t++) {
        const x = x0 + (x1 - x0) * t / NS;
        const y = Fn.f(x);
        const ok = isFinite(y) && pred(x, y) && Math.abs(x - a) > 1e-15;
        const Y = ok ? V.Y(y) : null;
        if (!ok || Y < P.y0 - 2000 || Y > P.y1 + 2000 || (py != null && Math.abs(Y - py) > (P.y1 - P.y0) * 0.9 && state.fn === 'sign')) { pen = false; py = null; if (!ok) continue; }
        if (pen) c.lineTo(V.X(x), Y); else { c.moveTo(V.X(x), Y); pen = true; }
        py = Y;
      }
      c.stroke();
    }
    seg(alpha(C['lm-curve'], 0.9), 2.4, function (x) { return Math.abs(x - a) >= del; });
    if (Fn.L != null) {
      const wIn = state.fn === 'xsin' && state.fz > 5 ? 1.6 : 3.4;
      seg(C['lm-band'], wIn, function (x, y) { return Math.abs(x - a) < del && Math.abs(y - Fn.L) < eps; });
      seg(C['lm-bad'], wIn, function (x, y) { return Math.abs(x - a) < del && !(Math.abs(y - Fn.L) < eps); });
    } else seg(C['lm-out'], 3, function (x) { return Math.abs(x - a) < del; });
    // 洞
    const holes = Fn.L != null ? [[a, Fn.L]] : state.fn === 'sign' ? [[0, -1], [0, 1]] : [];
    holes.forEach(function (h) {
      c.beginPath(); c.arc(V.X(h[0]), V.Y(h[1]), 5, 0, Math.PI * 2);
      c.fillStyle = C['canvas-bg']; c.fill(); c.strokeStyle = C.text; c.lineWidth = 1.8; c.stroke();
    });
    // 逼近中的點
    if (state.anim) {
      const t = Math.min(1, (performance.now() - state.anim.t0) / state.anim.dur);
      const d0 = V.hx * 0.92, dEnd = Math.min(1e-4, d0 * 0.02), d = d0 * Math.pow(dEnd / d0, t);
      const x = a + (state.anim.side === 'left' ? -d : d), y = Fn.f(x);
      if (isFinite(y)) {
        const X = V.X(x), Y = Math.max(P.y0 + 6, Math.min(P.y1 - 6, V.Y(y)));
        c.strokeStyle = alpha(C.accent, 0.6); c.lineWidth = 1.2; c.setLineDash([3, 3]);
        c.beginPath(); c.moveTo(X, Y); c.lineTo(P.x0, Y); c.stroke(); c.setLineDash([]);
        D.ball(c, X, Y, 6.5, C.accent, { glow: 0.35 });
        D.pill(c, 'f(x) ≈ ' + fmtC(y, 6), Math.min(Math.max(X, P.x0 + 70), P.x1 - 70), Y < P.y0 + 40 ? Y + 30 : Y - 12, C.accent, 'center', fnt(12, 600));
      }
      if (t < 1) requestDraw(); else finishApproach();
    }
    c.restore();
    // 刻度文字
    c.font = fnt(10.5); c.fillStyle = C.muted;
    for (let x = Math.ceil((V.cx - V.hx) / xs) * xs; x <= V.cx + V.hx + 1e-12; x += xs) { const X = V.X(x); if (X < P.x0 + 8 || X > P.x1 - 8) continue; c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(tickStr(x, xs), X, P.y1 + 4); }
    for (let y = Math.ceil((V.cy - V.hy) / ys) * ys; y <= V.cy + V.hy + 1e-12; y += ys) { const Y = V.Y(y); if (Y < P.y0 + 6 || Y > P.y1 - 4) continue; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(tickStr(y, ys), P.x0 - 4, Y); }
    D.haloText(c, 'x', P.x1, P.y1 + 16, C.muted, 'right', 'top', fnt(12, 600, true));
    // 標籤
    D.pill(c, 'a = ' + fmtC(a, 4) + '，δ = ' + fmtC(del, 4), V.X(a), P.y1 - 8, C['lm-n'], 'center', fnt(11.5, 600));
    if (Fn.L != null) D.pill(c, 'L = ' + (state.fn === 'epow' ? 'e' : fmtC(Fn.L, 4)) + '，ε = ' + fmtC(eps, 4), P.x1 - 6, P.y0 + 24, C['lm-band'], 'right', fnt(11.5, 600));
    if (state.fz > 1.001) D.haloText(c, '×' + fmtC(state.fz, 3), P.x0 + 8, P.y0 + 8, C.muted, 'left', 'top', fnt(12, 700));
  }

  // =====================================================================
  // 無窮等比級數
  // =====================================================================
  function drawSeries(c) {
    const P = F.P, q = QZ(), a = state.sa, r = state.sr, n = state.sn;
    const Sk = [0];
    for (let k = 1; k <= n; k++) Sk.push(M.partial(a, r, k));
    // 上：數線
    const top = P.y0, lineY = P.y0 + Math.round((P.y1 - P.y0) * 0.26);
    let lo = Math.min.apply(null, Sk), hi = Math.max.apply(null, Sk);
    if (q.I != null) { lo = Math.min(lo, q.I); hi = Math.max(hi, q.I); }
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    const padv = (hi - lo) * 0.08; lo -= padv; hi += padv;
    const LX = function (v) { return P.x0 + (v - lo) / (hi - lo) * (P.x1 - P.x0); };
    D.roundRect(c, P.x0, top, P.x1 - P.x0, lineY - top + 26, 8);
    c.fillStyle = alpha(C.text, D.dark ? 0.03 : 0.022); c.fill();
    c.strokeStyle = alpha(C.text, 0.5); c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(P.x0 + 4, lineY); c.lineTo(P.x1 - 4, lineY); c.stroke();
    const st = niceStep(hi - lo, F.narrow ? 4 : 7);
    c.font = fnt(10.5); c.fillStyle = C.muted; c.textAlign = 'center'; c.textBaseline = 'top';
    for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) { const x = LX(v); c.fillRect(x - 0.5, lineY - 3, 1, 6); c.fillText(tickStr(v, st), x, lineY + 6); }
    if (q.I != null) {
      c.strokeStyle = C['lm-band']; c.lineWidth = 2; c.setLineDash([4, 3]);
      c.beginPath(); c.moveTo(LX(q.I), top + 6); c.lineTo(LX(q.I), lineY + 4); c.stroke(); c.setLineDash([]);
    }
    // 一跳一跳
    const hmax = lineY - top - 14;
    for (let k = 1; k <= n; k++) {
      const xa = LX(Sk[k - 1]), xb = LX(Sk[k]);
      const h = Math.max(3, Math.min(hmax, Math.abs(xb - xa) * 0.55));
      c.strokeStyle = alpha(C['lm-in'], Math.max(0.35, 1 - k * 0.04)); c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(xa, lineY); c.quadraticCurveTo((xa + xb) / 2, lineY - 2 * h, xb, lineY); c.stroke();
    }
    for (let k = 1; k <= n; k++) { c.fillStyle = C['lm-sum']; c.beginPath(); c.arc(LX(Sk[k]), lineY, k === n ? 4.5 : 2.6, 0, Math.PI * 2); c.fill(); }
    // 下：部分和
    const y0 = lineY + 40, y1 = P.y1;
    const terms = []; for (let k = 1; k <= n; k++) terms.push(a * Math.pow(r, k - 1));
    let vlo = Math.min(0, Math.min.apply(null, Sk.slice(1)), Math.min.apply(null, terms)), vhi = Math.max(0, Math.max.apply(null, Sk.slice(1)), Math.max.apply(null, terms));
    if (q.I != null) { vlo = Math.min(vlo, q.I); vhi = Math.max(vhi, q.I); }
    if (vhi - vlo < 1e-9) { vlo -= 1; vhi += 1; }
    const pv = (vhi - vlo) * 0.08; vlo -= pv; vhi += pv;
    const BX = function (k) { return P.x0 + (k - 0.5) / Math.max(n, 6) * (P.x1 - P.x0); };
    const BY = function (v) { return y1 - (v - vlo) / (vhi - vlo) * (y1 - y0); };
    D.roundRect(c, P.x0, y0, P.x1 - P.x0, y1 - y0, 8);
    c.fillStyle = alpha(C.text, D.dark ? 0.03 : 0.022); c.fill();
    const ys = niceStep(vhi - vlo, 5);
    c.font = fnt(10.5);
    for (let v = Math.ceil(vlo / ys) * ys; v <= vhi; v += ys) {
      c.strokeStyle = alpha(C.text, Math.abs(v) < ys * 1e-6 ? 0.35 : 0.06); c.lineWidth = 1;
      c.beginPath(); c.moveTo(P.x0, BY(v)); c.lineTo(P.x1, BY(v)); c.stroke();
      c.fillStyle = C.muted; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(tickStr(v, ys), P.x0 - 4, BY(v));
    }
    const bw = Math.max(2, Math.min(18, (P.x1 - P.x0) / Math.max(n, 6) * 0.5));
    for (let k = 1; k <= n; k++) {
      const v = terms[k - 1], yb = BY(0), yt = BY(v);
      c.fillStyle = alpha(C['lm-in'], 0.32);
      c.fillRect(BX(k) - bw / 2, Math.min(yb, yt), bw, Math.max(1, Math.abs(yb - yt)));
    }
    if (q.I != null) {
      c.strokeStyle = C['lm-band']; c.lineWidth = 1.6; c.setLineDash([6, 4]);
      c.beginPath(); c.moveTo(P.x0, BY(q.I)); c.lineTo(P.x1, BY(q.I)); c.stroke(); c.setLineDash([]);
    }
    c.strokeStyle = alpha(C['lm-sum'], 0.7); c.lineWidth = 1.6;
    c.beginPath(); for (let k = 1; k <= n; k++) { if (k > 1) c.lineTo(BX(k), BY(Sk[k])); else c.moveTo(BX(k), BY(Sk[k])); } c.stroke();
    const rr = Math.max(2, Math.min(4.5, bw * 0.4));
    for (let k = 1; k <= n; k++) { if (rr >= 3) D.ball(c, BX(k), BY(Sk[k]), rr, C['lm-sum'], { glow: null }); else { c.fillStyle = C['lm-sum']; c.beginPath(); c.arc(BX(k), BY(Sk[k]), rr, 0, Math.PI * 2); c.fill(); } }
    c.font = fnt(10.5); c.fillStyle = C.muted; c.textAlign = 'center'; c.textBaseline = 'top';
    const ks = Math.max(1, Math.round(niceStep(Math.max(n, 6), 6)));
    for (let k = ks; k <= n; k += ks) c.fillText(String(k), BX(k), y1 + 4);
    D.haloText(c, 'n', P.x1, y1 + 16, C.muted, 'right', 'top', fnt(12, 600, true));
    // 標籤
    const lab = T('前 ' + n + ' 項和 = ', 'sum of ' + n + ' terms = ') + fmtC(q.S, 6) + (q.I != null ? '　S∞ = ' + fmtC(q.I, 6) : T('　沒有極限', '　no limit'));
    D.pill(c, lab, P.x1 - 6, top + 24, q.I != null ? C['lm-band'] : C['lm-out'], 'right', fnt(11.5, 600));
  }

  // ---------- 主畫面 ----------
  function draw() {
    if (!F) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(ctx, cw, ch);
    if (state.mode === 'seq') drawSeq(ctx);
    else if (state.mode === 'func') drawFunc(ctx);
    else drawSeries(ctx);
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
  function Ltex(q) { return q.sp.kind === 'e' ? 'e' : fmtT(q.lim.L, 8); }
  function updateReadouts() {
    if (state.mode === 'seq') {
      const q = QS(), N = state.N;
      setHTML('rL', q.lim.conv ? (q.sp.kind === 'e' ? 'e ≈ 2.718282' : fmtH(q.lim.L, 8)) : T('沒有極限', 'no limit'));
      setHTML('rAN', fmtH(M.term(q.sp, N), 7));
      setHTML('rEN', q.lim.conv ? fmtH(M.err(q.sp, N), 5) : '—');
      setHTML('rEN1', q.lim.conv && N > 1 ? fmtH(M.err(q.sp, N - 1), 5) : '—');
      const lhs = 'a_n = ' + M.seqTex(q.sp);
      setEq('rEq', q.lim.conv ? lhs + ',\\quad \\lim_{n\\to\\infty} a_n = ' + Ltex(q) : lhs);
      if (q.lim.conv) {
        if (q.allIn) setEq('rEq2', 'n \\ge ' + N + ' \\;\\Rightarrow\\; |a_n - ' + Ltex(q) + '| < ' + fmtT(q.eps, 4));
        else setEq('rEq2', '|a_{' + q.out + '} - ' + Ltex(q) + '| = ' + fmtT(M.err(q.sp, q.out), 4) + ' \\ge ' + fmtT(q.eps, 4));
      } else setEq('rEq2', q.out != null ? '|a_{' + q.out + '} - (' + fmtT(q.center, 4) + ')| = ' + fmtT(Math.abs(M.term(q.sp, q.out) - q.center), 4) + ' \\ge ' + fmtT(q.eps, 4) : '');
    } else if (state.mode === 'func') {
      const q = QF(), Fn = q.F, a = Fn.a, d = state.fd;
      setHTML('fL', Fn.L != null ? (state.fn === 'epow' ? 'e ≈ 2.718282' : fmtH(Fn.L, 6)) : state.fn === 'sign' ? T('不存在（左 −1、右 1）', 'none (left −1, right 1)') : T('不存在（趨近 +∞）', 'none (tends to +∞)'));
      setHTML('fM', a - d > (Fn.domainLo != null ? Fn.domainLo : -Infinity) ? fmtH(Fn.f(a - d), 7) : T('沒有定義', 'undefined'));
      setHTML('fP', fmtH(Fn.f(a + d), 7));
      setHTML('fOK', Fn.L == null ? '—' : q.ok ? T('可以', 'yes') : T('太大', 'too large'));
      const ft = 'f(x) = ' + M.FUNC_TEX[state.fn];
      const Lt = state.fn === 'epow' ? 'e' : Fn.L != null ? fmtT(Fn.L, 6) : null;
      setEq('rEq', Lt != null ? ft + ',\\quad \\lim_{x\\to ' + a + '} f(x) = ' + Lt : state.fn === 'sign' ? ft + ',\\quad \\lim_{x\\to 0^-} f(x) = -1,\\ \\lim_{x\\to 0^+} f(x) = 1' : ft + ',\\quad \\lim_{x\\to 0} f(x) = +\\infty');
      if (Lt != null) setEq('rEq2', '0 < |x - ' + a + '| < ' + fmtT(d, 4) + '\\;' + (q.ok ? '\\Rightarrow' : '\\not\\Rightarrow') + '\\; |f(x) - ' + Lt + '| < ' + fmtT(state.fe, 4));
      else setEq('rEq2', '');
    } else {
      const q = QZ(), a = state.sa, r = state.sr, n = state.sn;
      setHTML('zS', fmtH(q.S, 8));
      setHTML('zI', q.I != null ? fmtH(q.I, 8) : T('沒有（|r| ≥ 1）', 'none (|r| ≥ 1)'));
      setHTML('zD', q.I != null ? fmtH(Math.abs(q.I - q.S), 4) : '—');
      setEq('rEq', r === 1 ? 'S_{' + n + '} = ' + n + '\\cdot ' + fmtT(a, 4) + ' = ' + fmtT(q.S, 8) : 'S_{' + n + '} = \\frac{a(1 - r^{' + n + '})}{1 - r} = \\frac{' + fmtT(a, 4) + '\\,(1 - (' + fmtT(r, 4) + ')^{' + n + '})}{1 - (' + fmtT(r, 4) + ')} = ' + fmtT(q.S, 8));
      setEq('rEq2', q.I != null ? 'S_\\infty = \\frac{a}{1 - r} = \\frac{' + fmtT(a, 4) + '}{1 - (' + fmtT(r, 4) + ')} = ' + fmtT(q.I, 8) : '|r| \\ge 1');
    }
    setHTML('status', statusText());
  }
  function statusText() {
    if (state.mode === 'seq') {
      const q = QS(), N = state.N;
      if (state.chal) return T('找出最小的 N：第 N 項以後都要在帶子裡，而且第 N − 1 項不在。', 'Find the smallest N: every term from N on must be inside the band, and term N − 1 must not be.');
      if (!q.lim.conv) return q.out != null ? T('第 ' + q.out + ' 項跑出帶子了：帶子放在哪裡（上下拖曳帶子）都關不住後面的每一項——沒有極限。', 'Term ' + q.out + ' is outside: wherever you put the band (drag it up or down) the later terms escape — there is no limit.') : T('帶子夠寬時暫時關得住；把 ε 調到 1 以下再試試。', 'A wide band holds it for now; try ε below 1.');
      if (!q.allIn && q.Nmin > 2000) return T('最小的 N 是 ' + q.Nmin + '，超過這裡 N 的上限 2000：ε 這麼小，要走得非常遠才會全部進帶子。把 ε 調大一點再找。', 'The smallest N is ' + q.Nmin + ', beyond the limit of 2000 here: with ε this small the terms take a very long time to settle. Make ε a little larger and try again.');
      if (!q.allIn) return T('第 ' + q.out + ' 項還在帶子外面（紅圈）：N 要再往後移。', 'Term ' + q.out + ' is still outside (red ring): move N further on.');
      if (N > 1 && !(M.err(q.sp, N - 1) < q.eps)) return T('第 ' + N + ' 項以後都在帶子裡，而且第 ' + (N - 1) + ' 項不在——這就是最小的 N。', 'Every term from ' + N + ' on is inside, and term ' + (N - 1) + ' is not — this is the smallest N.');
      if (N === 1) return T('第 1 項以後全部都在帶子裡。', 'Every term from the first on is inside the band.');
      return T('第 ' + N + ' 項以後都在帶子裡；N 還可以更小嗎？', 'Every term from ' + N + ' on is inside; can N be smaller?');
    }
    if (state.mode === 'func') {
      const q = QF();
      if (state.fn === 'sign') return T('左邊一直是 −1、右邊一直是 1：沒有一個 L 能讓兩邊都待在窄帶子裡。', 'Always −1 on the left and 1 on the right: no single L keeps both sides in a narrow band.');
      if (state.fn === 'inv2') return T('x 越靠近 0，1/x² 越大，沒有上限：極限不存在（趨近無限大）。', 'The closer x is to 0, the larger 1/x² gets, without bound: there is no limit (it tends to infinity).');
      if (q.ok) return T('δ 範圍裡的曲線全部在帶子裡（綠色）：這個 δ 可以用；能再大一點嗎？', 'Inside the δ strip the whole curve is in the band (green): this δ works; can it be larger?');
      return T('δ 太大：δ 範圍裡有一段曲線跑出帶子（紅色）。', 'δ is too large: part of the curve inside the δ strip leaves the band (red).');
    }
    const q = QZ();
    if (q.I == null) return state.sr === 1 || state.sr === -1 || Math.abs(state.sr) > 1 ? T('|r| ≥ 1：每一項不會變小，部分和沒有極限。', '|r| ≥ 1: the terms do not shrink, so the partial sums have no limit.') : '';
    return T('每多加一項，和 S∞ 的差就乘上 r：差距是 |r|<sup>n</sup> 倍。', 'Each extra term multiplies the gap to S∞ by r: the gap shrinks like |r|<sup>n</sup>.');
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
  let lastOk = null;
  /** 「都在帶子裡／δ 可以用」改變時發聲 */
  function okSound() {
    let ok = null;
    if (state.mode === 'seq') ok = QS().allIn;
    else if (state.mode === 'func') ok = QF().F.L != null ? QF().ok : null;
    if (ok != null && lastOk != null && ok !== lastOk) { if (ok) chime(true); else blip(330, 'triangle', 0.14); }
    lastOk = ok;
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function emitSeq() { const q = QS(); emit('seq', { seq: state.chal ? 'chal' : state.seq, eps: q.eps, N: state.N, Nmin: q.Nmin, conv: q.lim.conv }); }
  function emitFunc() { const q = QF(); emit('func', { fn: state.fn, eps: state.fe, delta: state.fd, dmax: q.dmax, ok: q.ok, zoom: state.fz, squeeze: state.sq && (state.fn === 'xsin' || state.fn === 'sinc') }); }
  function emitSeries() { const q = QZ(); emit('series', { a: state.sa, r: state.sr, n: state.sn, Sn: q.S, Sinf: q.I }); }
  function emitMode() { if (state.mode === 'seq') emitSeq(); else if (state.mode === 'func') emitFunc(); else emitSeries(); }

  // =====================================================================
  // 控制項
  // =====================================================================
  const lab = $('lab');
  const el = { r: $('r'), eps: $('eps'), N: $('nn'), show: $('show'), fe: $('fe'), fd: $('fd'), fz: $('fz'), sa: $('sa'), sr: $('sr'), sn: $('sn') };
  const src = { r: 'seq', eps: 'seq', N: 'seq', show: 'seq', fe: 'func', fd: 'func', fz: 'func', sa: 'series', sr: 'series', sn: 'series' };
  const pow10 = function (p) { return Math.pow(10, p); };
  if (window.LabNum) {
    window.LabNum.register(el.eps, { toValue: function (p) { return Math.max(0.001, Math.round(pow10(p) * 1000) / 1000); }, toPos: Math.log10, min: 0.001, max: 1, decimals: 3 });
    window.LabNum.register(el.fe, { toValue: function (p) { return Math.max(0.001, Math.round(pow10(p) * 1000) / 1000); }, toPos: Math.log10, min: 0.001, max: 1, decimals: 3 });
    window.LabNum.register(el.fd, { toValue: function (p) { return Math.max(0.001, Math.round(pow10(p) * 10000) / 10000); }, toPos: Math.log10, min: 0.001, max: 2, decimals: 4 });
    window.LabNum.register(el.fz, { toValue: function (p) { const v = pow10(p); return v < 10 ? Math.round(v * 10) / 10 : Math.round(v); }, toPos: Math.log10, min: 1, max: 1000, decimals: 1 });
    window.LabNum.register(el.N, { toValue: function (p) { return Math.max(1, Math.min(2000, Math.round(pow10(p)))); }, toPos: function (v) { return Math.log10(Math.max(1, v)); }, min: 1, max: 2000, decimals: 0 });
  }
  function readAll() {
    Object.keys(el).forEach(function (k) { state[k] = val(el[k]); });
    state.N = Math.round(state.N); state.show = Math.round(state.show); state.sn = Math.round(state.sn);
  }
  function refreshOutputs() {
    $('ro').textContent = fmtC(state.r, 3);
    $('epso').textContent = fmtC(state.eps, 4);
    $('nno').textContent = String(state.N);
    $('showo').textContent = String(state.show);
    $('feo').textContent = fmtC(state.fe, 4);
    $('fdo').textContent = fmtC(state.fd, 4);
    $('fzo').textContent = '×' + fmtC(state.fz, 4);
    $('sao').textContent = fmtC(state.sa, 3);
    $('sro').textContent = fmtC(state.sr, 3);
    $('sno').textContent = String(state.sn);
  }
  function changed(final, from) {
    const prevN = state.N, prevSn = state.sn;
    readAll();
    refreshOutputs(); updateReadouts(); okSound(); requestDraw();
    if (state.N !== prevN && state.mode === 'seq') { const q = QS(); blip(q.inBand(state.N) ? 523.25 : 392, 'sine', 0.12); }
    if (state.sn !== prevSn && state.mode === 'series') { const q = QZ(); blip(q.I != null && q.I !== 0 ? 330 * Math.pow(2, Math.max(-1, Math.min(1.5, q.S / q.I))) : 440, 'sine', 0.12); }
    if (final) { if (from === 'seq') emitSeq(); else if (from === 'func') emitFunc(); else if (from === 'series') emitSeries(); }
  }
  Object.keys(el).forEach(function (k) {
    el[k].addEventListener('input', function () { if (!applying) changed(false, src[k]); });
    el[k].addEventListener('change', function () { if (!applying) changed(true, src[k]); });
  });
  function setSlider(e, v) {
    applying = true;
    if (window.LabNum) window.LabNum.set(e, v); else e.value = v;
    applying = false;
  }
  $('yzC').addEventListener('change', function () { state.yz = $('yzC').checked; requestDraw(); blip(440); });
  function updateSqLegend() { $('lgSq').hidden = !(state.sq && (state.fn === 'xsin' || state.fn === 'sinc')); }
  $('sqC').addEventListener('change', function () { state.sq = $('sqC').checked; updateSqLegend(); requestDraw(); emitFunc(); blip(state.sq ? 523.25 : 392); });
  function updateGeoRow() { document.querySelector('.geo-only').hidden = !(state.seq === 'geo' && !state.chal); }
  function setMode(m) {
    if (m === state.mode) return;
    if (state.chal) quitChal(true);
    state.mode = m;
    lab.setAttribute('data-mode', m);
    document.querySelectorAll('.modes button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === m)); });
    for (const id in eqKey) delete eqKey[id];
    lastOk = null;
    updateReadouts(); okSound(); requestDraw();
    emitMode();
  }
  document.querySelectorAll('.modes button').forEach(function (b) { b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); }); });
  function pickSeq(id) {
    if (state.chal) return;
    state.seq = id;
    state.Lc = 0;
    document.querySelectorAll('#seqPick button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-seq') === id)); });
    updateGeoRow();
    lastOk = null;
    for (const id2 in eqKey) delete eqKey[id2];
    updateReadouts(); okSound(); requestDraw();
    emitSeq(); blip(440);
  }
  document.querySelectorAll('#seqPick button').forEach(function (b) { b.addEventListener('click', function () { pickSeq(b.getAttribute('data-seq')); }); });
  function pickFn(id) {
    state.fn = id; state.ap = { left: null, right: null }; state.anim = null;
    document.querySelectorAll('#fnPick button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-fn') === id)); });
    $('sqC').disabled = !(id === 'xsin' || id === 'sinc');
    updateSqLegend();
    renderAp();
    lastOk = null;
    for (const id2 in eqKey) delete eqKey[id2];
    updateReadouts(); okSound(); requestDraw();
    emitFunc(); blip(440);
  }
  document.querySelectorAll('#fnPick button').forEach(function (b) { b.addEventListener('click', function () { pickFn(b.getAttribute('data-fn')); }); });

  // ---------- 逼近 ----------
  function approach(side) {
    state.anim = { side: side, t0: performance.now(), dur: D.reducedMotion() ? 1 : 1800, fn: state.fn };
    const S = sound();
    if (S && S.sweep) S.sweep({ from: 300, to: 900, dur: 1.6, type: 'sine', gain: 0.1 });
    requestDraw();
  }
  function finishApproach() {
    const an = state.anim; state.anim = null;
    requestDraw();
    if (!an || an.fn !== state.fn) return;
    const Fn = M.FUNCS[state.fn], s = an.side === 'left' ? -1 : 1;
    state.ap[an.side] = [0.1, 0.01, 0.001, 0.0001].map(function (d) { const x = Fn.a + s * d; return { x: x, y: Fn.f(x) }; });
    renderAp();
    chime(true);
    emit('approach', { fn: state.fn, side: an.side });
  }
  $('apL').addEventListener('click', function () { approach('left'); });
  $('apR').addEventListener('click', function () { approach('right'); });
  function renderAp() {
    const t = $('apt');
    const rows = [];
    ['left', 'right'].forEach(function (sd) { if (state.ap[sd]) state.ap[sd].forEach(function (p) { rows.push([sd, p]); }); });
    if (!rows.length) { t.innerHTML = ''; return; }
    let h = '<tr><th>' + T('方向', 'side') + '</th><th>x</th><th>f(x)</th></tr>';
    rows.forEach(function (r) { h += '<tr><td>' + (r[0] === 'left' ? T('左', 'left') : T('右', 'right')) + '</td><td>' + fmtH(r[1].x, 6) + '</td><td>' + fmtH(r[1].y, 8) + '</td></tr>'; });
    t.innerHTML = h;
  }

  // ---------- 全部清除 ----------
  $('clear').addEventListener('click', function () {
    if (state.chal) quitChal(true);
    state.log = []; state.streak = []; state.round = 0; lastChal = null;
    state.ap = { left: null, right: null }; state.anim = null; state.Lc = 0;
    setSlider(el.N, 1); state.N = 1;
    setChalMsg(''); renderLog(); renderAp();
    for (const id in eqKey) delete eqKey[id];
    lastOk = null;
    refreshOutputs(); updateReadouts(); okSound(); requestDraw();
    blip(392);
  });

  // ---------- 在圖上拖曳 ----------
  let drag = null;
  function posOf(ev) { const rc = cv.getBoundingClientRect(); return { px: ev.clientX - rc.left, py: ev.clientY - rc.top }; }
  function clampv(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function hitTest(px, py, R) {
    const P = F.P;
    if (px < P.x0 - 8 || px > P.x1 + 8 || py < P.y0 - 8 || py > P.y1 + 8) return null;
    if (state.mode === 'seq') {
      const q = QS(), S = seqFrame(q);
      const xN = state.N <= S.n1 ? S.X(state.N - 0.5) : P.x1;
      if (Math.abs(px - xN) <= R || (py < P.y0 + 36 && Math.abs(px - xN) <= R + 24)) return 'N';
      if (!state.chal && (Math.abs(py - S.Y(q.center + q.eps)) <= Math.max(6, R * 0.6) || Math.abs(py - S.Y(q.center - q.eps)) <= Math.max(6, R * 0.6))) return 'eps';
      if (!state.chal && !q.lim.conv && py > S.Y(q.center + q.eps) && py < S.Y(q.center - q.eps)) return 'center';
      const n = Math.round(S.nAt(px));
      if (n >= 1 && n <= S.n1 && Math.abs(S.Y(M.term(q.sp, n)) - py) <= R && Math.abs(S.X(n) - px) <= R) return 'pt';
      return null;
    }
    if (state.mode === 'func') {
      const V = funcFrame(), Fn = M.FUNCS[state.fn];
      if (Math.abs(px - V.X(Fn.a - state.fd)) <= R || Math.abs(px - V.X(Fn.a + state.fd)) <= R) return 'delta';
      if (Fn.L != null && (Math.abs(py - V.Y(Fn.L + state.fe)) <= Math.max(6, R * 0.6) || Math.abs(py - V.Y(Fn.L - state.fe)) <= Math.max(6, R * 0.6))) return 'feps';
      return null;
    }
    return null;
  }
  function dragTo(what, px, py) {
    if (what === 'N' || what === 'pt') { const q = QS(), S = seqFrame(q); setSlider(el.N, clampv(Math.round(S.nAt(px) + (what === 'N' ? 0.5 : 0)), 1, 2000)); }
    else if (what === 'eps') { const q = QS(), S = seqFrame(q); setSlider(el.eps, clampv(Math.abs(S.vAt(py) - q.center), 0.001, 1)); }
    else if (what === 'center') { const q = QS(), S = seqFrame(q); state.Lc = clampv(Math.round(S.vAt(py) * 100) / 100, -3, 3); }
    else if (what === 'delta') { const V = funcFrame(); setSlider(el.fd, clampv(Math.abs(V.xAt(px) - M.FUNCS[state.fn].a), 0.001, 2)); }
    else if (what === 'feps') { const V = funcFrame(); setSlider(el.fe, clampv(Math.abs(V.yAt(py) - M.FUNCS[state.fn].L), 0.001, 1)); }
    changed(false);
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (!F) return;
    const p = posOf(ev), touch = ev.pointerType === 'touch' || ev.pointerType === 'pen';
    const what = hitTest(p.px, p.py, touch ? 20 : 12);
    if (!what) return;
    ev.preventDefault();
    drag = { id: ev.pointerId, what: what };
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    if (what === 'pt') dragTo('pt', p.px, p.py);
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!F) return;
    const p = posOf(ev);
    if (!drag) {
      const h = hitTest(p.px, p.py, 12);
      cv.style.cursor = h === 'N' || h === 'delta' ? 'ew-resize' : h === 'eps' || h === 'feps' || h === 'center' ? 'ns-resize' : h === 'pt' ? 'pointer' : 'default';
      return;
    }
    if (drag.id !== ev.pointerId) return;
    dragTo(drag.what === 'pt' ? 'N' : drag.what, p.px, p.py);
  });
  function endDrag(ev) {
    if (!drag || drag.id !== ev.pointerId) return;
    drag = null;
    changed(true, state.mode);
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // ---------- 鍵盤 ----------
  if (window.LabKeys) {
    const nudgeLog = function (e, dp, lo, hi) { setSlider(e, clampv(Math.pow(10, Math.log10(val(e)) + dp), lo, hi)); };
    window.LabKeys.attach(cv, {
      label: T('極限畫布。Enter 切換要調的量，方向鍵調整，Shift 調得更多。數列：N 與 ε；函數：δ 與放大倍率；級數：項數與公比。', 'Limits canvas. Enter picks the quantity, the arrow keys adjust it, Shift for bigger steps. Sequences: N and ε; functions: δ and zoom; series: number of terms and ratio.'),
      items: [{
        name: function () { return state.mode === 'seq' ? 'N' : state.mode === 'func' ? 'δ' : T('項數 n', 'terms n'); },
        move: function (dx, dy, big) {
          const v = dx || dy; if (!v) return false;
          if (state.mode === 'seq') setSlider(el.N, clampv(state.N + v * (big ? 10 : 1), 1, 2000));
          else if (state.mode === 'func') nudgeLog(el.fd, v * (big ? 0.1 : 0.01), 0.001, 2);
          else setSlider(el.sn, clampv(state.sn + v * (big ? 5 : 1), 1, 60));
          changed(true, state.mode); return true;
        },
        describe: function () {
          if (state.mode === 'seq') { const q = QS(); return 'N = ' + state.N + '，' + (q.allIn ? T('後面都在帶子裡', 'all later terms inside') : T('第 ' + q.out + ' 項在帶子外', 'term ' + q.out + ' outside')); }
          if (state.mode === 'func') { const q = QF(); return 'δ = ' + fmtC(state.fd, 4) + (q.F.L != null ? (q.ok ? T('，可以用', ', works') : T('，太大', ', too large')) : ''); }
          return 'n = ' + state.sn + '，S = ' + fmtC(QZ().S, 6);
        }
      }, {
        name: function () { return state.mode === 'seq' ? 'ε' : state.mode === 'func' ? T('放大倍率', 'zoom') : T('公比 r', 'ratio r'); },
        move: function (dx, dy, big) {
          const v = dx || dy; if (!v) return false;
          if (state.mode === 'seq') { if (state.chal) return false; nudgeLog(el.eps, v * (big ? 0.2 : 0.05), 0.001, 1); }
          else if (state.mode === 'func') nudgeLog(el.fz, v * (big ? 0.5 : 0.1), 1, 1000);
          else setSlider(el.sr, clampv(Math.round((state.sr + v * (big ? 0.2 : 0.05)) * 100) / 100, -1.2, 1.2));
          changed(true, state.mode); return true;
        },
        describe: function () {
          if (state.mode === 'seq') return 'ε = ' + fmtC(QS().eps, 4);
          if (state.mode === 'func') return '×' + fmtC(state.fz, 4);
          return 'r = ' + fmtC(state.sr, 3);
        }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 挑戰：找 N
  // =====================================================================
  const chalMsg = $('chalMsg');
  function setChalMsg(msg, cls) { chalMsg.textContent = msg || ''; chalMsg.classList.toggle('ok', cls === 'ok'); chalMsg.classList.toggle('bad', cls === 'bad'); }
  function lockSeq(on) {
    document.querySelectorAll('#seqPick button').forEach(function (b) { b.disabled = on; });
    el.eps.disabled = on; el.show.disabled = on; el.r.disabled = on;
    updateGeoRow();
  }
  function startChal(forced) {
    if (state.mode !== 'seq') setMode('seq');
    const chg = forced || M.genChallenge(rand, lastChal);
    if (!chg) { setChalMsg(T('出不了題，請再按一次。', 'Could not make a challenge; please try again.')); return; }
    state.round++;
    state.chal = { spec: chg.spec, eps: chg.eps, N: chg.N, t0: performance.now(), round: state.round, tries: 0 };
    lastChal = chg;
    setSlider(el.N, 1); state.N = 1;
    lockSeq(true);
    setChalMsg(T('第 ' + state.round + ' 題：ε = ' + chg.eps + '，找出最小的 N 再送出。', 'Challenge ' + state.round + ': ε = ' + chg.eps + '; find the smallest N and submit it.'));
    $('submitN').hidden = false; $('quitChal').hidden = false;
    $('newChal').textContent = T('換一題', 'Another one');
    for (const id in eqKey) delete eqKey[id];
    lastOk = null;
    refreshOutputs(); updateReadouts(); okSound(); requestDraw();
  }
  function submitN() {
    const chg = state.chal;
    if (!chg) return;
    chg.tries++;
    const q = QS(), N = state.N;
    if (N !== chg.N) {
      state.streak = [];
      chime(false);
      if (!q.allIn) setChalMsg(T('第 ' + q.out + ' 項還在帶子外面，N 要更大。（連續答對重新計算）', 'Term ' + q.out + ' is still outside; N must be larger. (The streak starts over.)'), 'bad');
      else setChalMsg(T('第 ' + (N - 1) + ' 項也在帶子裡，N 還可以更小。（連續答對重新計算）', 'Term ' + (N - 1) + ' is inside too; N can be smaller. (The streak starts over.)'), 'bad');
      return;
    }
    const time = (performance.now() - chg.t0) / 1000;
    state.log.push({ round: chg.round, tex: M.seqTex(chg.spec), eps: chg.eps, N: chg.N, time: time, first: chg.tries === 1 });
    state.streak.push(time);
    const last3 = state.streak.length >= 3 ? state.streak.slice(-3).reduce(function (s, x) { return s + x; }, 0) : null;
    state.chal = null;
    lockSeq(false);
    $('submitN').hidden = true; $('quitChal').hidden = true;
    $('newChal').textContent = T('出下一題', 'Next challenge');
    setChalMsg(T('答對了！N = ' + chg.N + '，用了 ', 'Correct! N = ' + chg.N + ', in ') + time.toFixed(1) + T(' 秒。', ' s.'), 'ok');
    chime(true);
    renderLog();
    for (const id in eqKey) delete eqKey[id];
    lastOk = null;
    updateReadouts(); okSound(); requestDraw();
    emit('challenge', { time: time, streak: state.streak.length, last3: last3 });
  }
  function quitChal(silent) {
    const chg = state.chal;
    if (!chg) return;
    state.log.push({ round: chg.round, tex: M.seqTex(chg.spec), eps: chg.eps, N: chg.N, time: null });
    state.chal = null; state.streak = [];
    lockSeq(false);
    $('submitN').hidden = true; $('quitChal').hidden = true;
    $('newChal').textContent = T('出一題', 'New challenge');
    setChalMsg(silent ? '' : T('這題放棄了，答案是 N = ' + chg.N + '；連續答對重新計算。', 'Given up. The answer was N = ' + chg.N + '; the streak starts over.'));
    renderLog();
    for (const id in eqKey) delete eqKey[id];
    lastOk = null;
    updateReadouts(); requestDraw();
  }
  $('newChal').addEventListener('click', function () { if (state.chal) quitChal(true); startChal(); });
  $('submitN').addEventListener('click', submitN);
  $('quitChal').addEventListener('click', function () { quitChal(false); });
  function renderLog() {
    const t = $('log');
    $('logEmpty').hidden = state.log.length > 0;
    if (!state.log.length) { t.innerHTML = ''; return; }
    let h = '<tr><th>' + T('題', '#') + '</th><th>a<sub>n</sub></th><th>ε</th><th>N</th><th>' + T('秒', 's') + '</th></tr>';
    state.log.slice(-8).reverse().forEach(function (r) {
      let tx = r.tex;
      if (window.katex) { try { tx = window.katex.renderToString(r.tex, { throwOnError: false }); } catch (e) { /* 保留原文 */ } }
      h += '<tr><td>' + r.round + '</td><td>' + tx + '</td><td>' + r.eps + '</td><td>' + r.N + '</td><td>' + (r.time == null ? T('放棄', 'gave up') : r.time.toFixed(1) + (r.first ? '' : '*')) + '</td></tr>';
    });
    t.innerHTML = h;
  }

  // 給測試用的介面（不影響畫面）
  window.__lim = {
    state: state, QS: QS, QF: QF, QZ: QZ,
    startChal: function (c) { startChal(c); },
    seed: function (s) { rand = M.rng(s); },
    frame: function () { return F; },
    seqFrame: function () { return seqFrame(QS()); },
    funcFrame: function () { return funcFrame(); }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  setSlider(el.eps, 0.2); setSlider(el.fe, 0.2); setSlider(el.fd, 0.5); setSlider(el.fz, 1); setSlider(el.N, 1);
  readAll();
  state.yz = $('yzC').checked;
  state.sq = $('sqC').checked;
  $('sqC').disabled = true;
  updateGeoRow();
  refreshOutputs();
  renderLog();
  updateSoundButton();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    for (const id in eqKey) delete eqKey[id];
    renderLog(); renderAp(); refreshOutputs(); updateReadouts(); updateSoundButton();
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
  updateReadouts();
  okSound();
})();
