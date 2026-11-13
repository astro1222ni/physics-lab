/* exp-log.js — 「指數與對數：複利、e 與對數尺度」的畫面與互動（數學計算在 exp-log-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 複利與 e：上圖是 t 年內的餘額（離散複利的階梯、連續複利、單利），下圖是一年複利 n 次的總額對 n（對數橫軸）逼近 e^(rt)。
 * 指數與對數：等比例的坐標平面上畫 y = a^x、y = log_a x、鏡射線 y = x、點 P 與鏡像 Q、切線、交點。
 * 對數尺度：同一組資料畫在一般刻度與半對數刻度上，模型 y = C·b^x 在半對數圖上是直線；挑戰是擬合隨機資料。 */
(function () {
  'use strict';
  const EL = window.ExpLogCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha;
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const PLAY_SEC = 5;

  // ---------- 狀態 ----------
  const state = {
    mode: 'compound',
    r: 0.1, t: 10, n: 1, cont: false,
    a: 2, x: 1, showTan: true, showMirror: true,
    set: 'bacteria', C: 10, b: 2,
    play: null,                 // { s（目前時間）, t0 }
    chal: null, round: 0, streak: [], log: [],
    flags: {}
  };
  let rand = EL.rng(((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0);
  let lastChal = null;
  let applying = false;

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'probe',
      'el-exp', 'el-log', 'el-cont', 'el-simple', 'el-coin', 'el-data', 'el-res']
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
  function tr(v, dec) { return EL.trim(v, dec == null ? 2 : dec).replace('-', '−'); }
  function tx(v, dec) { return EL.trim(v, dec == null ? 4 : dec); }
  /** 有效數字（大數加千分位） */
  function sig(v, s) {
    if (v == null || !isFinite(v)) return '—';
    if (v === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(v)));
    const dec = Math.max(0, (s || 4) - 1 - e);
    return Number(v.toFixed(dec)).toLocaleString('en-US', { maximumFractionDigits: dec }).replace('-', '−');
  }
  function nText(n) { return n >= 1e4 ? Number(n).toLocaleString('en-US') : String(n); }

  // ---------- 目前的量 ----------
  function Qc() {
    const r = state.r, t = state.t, n = state.n;
    const An = EL.compound(r, n, t), Ae = EL.cont(r, t);
    return { r: r, t: t, n: n, cont: state.cont, An: An, Ae: Ae, As: EL.simple(r, t), A: state.cont ? Ae : An,
      T2: EL.doublingTime(r, state.cont ? Infinity : n) };
  }
  function Qi() {
    const a = state.a, x = state.x, y = Math.pow(a, x);
    const m = EL.meet(a);
    return { a: a, x: x, y: y, ln: Math.log(a), meet: m, tangent: Math.abs(a - EL.E_1E) <= 0.0005 };
  }
  function dataNow() {
    if (state.chal) return { xs: state.chal.xs, ys: state.chal.ys, unit: '' };
    const d = EL.DATASETS[state.set];
    return d ? { xs: d.xs, ys: d.ys, unit: d.unit } : null;
  }
  function Qs() {
    const d = dataNow();
    return { C: state.C, b: state.b, data: d, rms: d ? EL.rmsLog(d.xs, d.ys, state.C, state.b) : null };
  }

  // ---------- 畫布 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 460, L = null;
  function layout() {
    const narrow = cw < 600;
    const left = narrow ? 44 : 56, right = cw - (narrow ? 12 : 18);
    if (state.mode === 'compound') {
      const h1 = narrow ? 230 : 290, h2 = narrow ? 150 : 170, gap = narrow ? 44 : 48;
      const t1 = 22, b1 = t1 + h1, t2 = b1 + gap, b2 = t2 + h2;
      return { narrow: narrow, left: left, right: right, t1: t1, b1: b1, t2: t2, b2: b2, H: b2 + 34 };
    }
    if (state.mode === 'inverse') {
      const H = narrow ? Math.round(Math.max(330, Math.min(cw * 1.05, 440))) : Math.round(Math.max(420, Math.min(cw * 0.66, 540)));
      return { narrow: narrow, left: 10, right: cw - 10, top: 10, bottom: H - 10, H: H };
    }
    // semilog：寬畫面左右並排，窄畫面上下疊
    if (narrow) {
      const h = 210, t1 = 22, b1 = t1 + h, t2 = b1 + 52, b2 = t2 + h;
      return { narrow: true, panels: [{ x0: left, x1: right, y0: t1, y1: b1 }, { x0: left, x1: right, y0: t2, y1: b2 }], H: b2 + 34 };
    }
    const mid = cw / 2, t1 = 24, b1 = t1 + 330;
    return { narrow: false, panels: [{ x0: left, x1: mid - 22, y0: t1, y1: b1 }, { x0: mid + 46, x1: right, y0: t1, y1: b1 }], H: b1 + 38 };
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
  function requestDraw() { if (!rafId) rafId = requestAnimationFrame(frame); }
  function frame(now) {
    rafId = 0;
    if (state.play) stepPlay(now);
    draw();
  }

  // ---------- 繪圖工具 ----------
  function niceStep(span, target) {
    const raw = span / Math.max(1, target), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }
  function niceCeil(v) { const s = niceStep(v, 5); return Math.ceil(v / s - 1e-9) * s; }
  /** 一張圖的座標框：rect（像素）、xr、yr（資料範圍）；回傳轉換函式 */
  function frameOf(rect, xr, yr) {
    return {
      r: rect, xr: xr, yr: yr,
      X: function (x) { return rect.x0 + (x - xr[0]) / (xr[1] - xr[0]) * (rect.x1 - rect.x0); },
      Y: function (y) { return rect.y1 - (y - yr[0]) / (yr[1] - yr[0]) * (rect.y1 - rect.y0); }
    };
  }
  function panelBg(c, F) {
    const r = F.r;
    c.save();
    D.roundRect(c, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, 6);
    c.fillStyle = alpha(C.text, D.dark ? 0.03 : 0.022); c.fill();
    c.restore();
  }
  function gridLinear(c, F, xs, ys, xfmt, yfmt) {
    const r = F.r;
    c.save();
    c.font = fnt(11); c.fillStyle = C.muted; c.lineWidth = 1;
    const sx = niceStep(F.xr[1] - F.xr[0], xs), sy = niceStep(F.yr[1] - F.yr[0], ys);
    for (let x = Math.ceil(F.xr[0] / sx - 1e-9) * sx; x <= F.xr[1] + 1e-9; x += sx) {
      const px = F.X(x);
      c.strokeStyle = alpha(C.text, 0.08); c.beginPath(); c.moveTo(px, r.y0); c.lineTo(px, r.y1); c.stroke();
      c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(xfmt ? xfmt(x) : tr(x, 3), px, r.y1 + 5);
    }
    for (let y = Math.ceil(F.yr[0] / sy - 1e-9) * sy; y <= F.yr[1] + 1e-9; y += sy) {
      const py = F.Y(y);
      c.strokeStyle = alpha(C.text, 0.08); c.beginPath(); c.moveTo(r.x0, py); c.lineTo(r.x1, py); c.stroke();
      c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(yfmt ? yfmt(y) : tr(y, 3), r.x0 - 6, py);
    }
    c.strokeStyle = alpha(C.text, 0.45);
    c.beginPath(); c.moveTo(r.x0, r.y0); c.lineTo(r.x0, r.y1); c.lineTo(r.x1, r.y1); c.stroke();
    c.restore();
  }
  /** 10 的次方標籤 */
  function powLabel(c, e, x, y, align, color) {
    c.save(); powLabel0(c, e, x, y, align, color); c.restore();
  }
  function powLabel0(c, e, x, y, align, color) {
    if (e === 0) { D.haloText(c, '1', x, y, color, align, 'middle', fnt(11)); return; }
    if (e === 1) { D.haloText(c, '10', x, y, color, align, 'middle', fnt(11)); return; }
    D.supText(c, '10', String(e).replace('-', '−'), x, y + 4, color, fnt(11), align);
  }
  function curve(c, F, f, x0, x1, color, width, dash, n) {
    const r = F.r, N = n || Math.max(60, Math.round((F.X(x1) - F.X(x0)) / 1.5));
    c.save();
    c.beginPath(); c.rect(r.x0, r.y0 - 2, r.x1 - r.x0, r.y1 - r.y0 + 4); c.clip();
    c.strokeStyle = color; c.lineWidth = width; c.lineJoin = 'round'; c.lineCap = 'round';
    if (dash) c.setLineDash(dash);
    c.beginPath();
    let pen = false;
    for (let i = 0; i <= N; i++) {
      const x = x0 + (x1 - x0) * i / N, y = f(x);
      if (y == null || !isFinite(y)) { pen = false; continue; }
      const px = F.X(x), py = Math.max(r.y0 - 400, Math.min(r.y1 + 400, F.Y(y)));
      if (!pen) { c.moveTo(px, py); pen = true; } else c.lineTo(px, py);
    }
    c.stroke();
    c.restore();
  }

  function draw() {
    if (!L) return;
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    D.backdrop(c, cw, ch);
    if (state.mode === 'compound') drawCompound(c);
    else if (state.mode === 'inverse') drawInverse(c);
    else drawSemilog(c);
  }

  // ---------- 複利 ----------
  function drawCompound(c) {
    const q = Qc();
    const yTop = niceCeil(Math.max(q.Ae, q.As) * 1.04);
    const F = frameOf({ x0: L.left, x1: L.right, y0: L.t1, y1: L.b1 }, [0, q.t], [0, yTop]);
    panelBg(c, F);
    gridLinear(c, F, L.narrow ? 5 : 8, 5, function (x) { return tr(x, 2); }, function (y) { return tr(y, 3); });
    D.haloText(c, T('餘額（本金 1）', 'balance (starting with 1)'), L.left, L.t1 - 11, C.muted, 'left', 'middle', fnt(11.5, 600));
    D.haloText(c, T('年', 'years'), L.right, L.b1 + 22, C.muted, 'right', 'middle', fnt(11));
    const sEnd = state.play ? state.play.s : q.t;
    // 單利、連續複利（虛線）
    curve(c, F, function (s) { return EL.simple(q.r, s); }, 0, sEnd, C['el-simple'], 1.6, [6, 5]);
    curve(c, F, function (s) { return EL.cont(q.r, s); }, 0, sEnd, C['el-cont'], 2, [7, 5]);
    // 階梯（離散複利）
    if (!q.cont) {
      const r = F.r, periods = q.n * q.t;
      c.save();
      c.beginPath(); c.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0 + 2); c.clip();
      c.strokeStyle = C['el-exp']; c.lineWidth = 2.6; c.lineJoin = 'round';
      c.beginPath();
      if (periods <= 600) {
        let prevY = F.Y(1);
        c.moveTo(F.X(0), prevY);
        for (let k = 1; k <= periods; k++) {
          const s = k / q.n;
          if (s > sEnd + 1e-9) { c.lineTo(F.X(sEnd), prevY); break; }
          const y = F.Y(EL.compound(q.r, q.n, s));
          c.lineTo(F.X(s), prevY); c.lineTo(F.X(s), y); prevY = y;
        }
      } else {
        const N = Math.round(r.x1 - r.x0);
        for (let i = 0; i <= N; i++) { const s = sEnd * i / N; const y = F.Y(EL.stair(q.r, q.n, s)); if (i) c.lineTo(F.X(s), y); else c.moveTo(F.X(s), y); }
      }
      c.stroke();
      c.restore();
      // 每期入帳的點（期數不多時）
      if (periods <= 60) {
        for (let k = 1; k <= periods; k++) {
          const s = k / q.n; if (s > sEnd + 1e-9) break;
          const px = F.X(s), py = F.Y(EL.compound(q.r, q.n, s));
          c.save(); c.fillStyle = C['el-coin']; c.beginPath(); c.arc(px, py, periods <= 20 ? 3.4 : 2.4, 0, 2 * Math.PI); c.fill(); c.restore();
        }
      }
    } else curve(c, F, function (s) { return EL.cont(q.r, s); }, 0, sEnd, C['el-exp'], 2.6);
    // 播放中的硬幣
    if (state.play) {
      const s = state.play.s, y = q.cont ? EL.cont(q.r, s) : EL.stair(q.r, q.n, s);
      D.ball(c, F.X(s), F.Y(y), 7, C['el-coin'], { glow: 0.6 });
    }
    // 終點標籤
    if (!state.play) {
      // 三個終點值：放在終點左邊，依高度排好後互相推開，不重疊
      const ex = F.X(q.t) - 8;
      const labs = [{ v: q.A, t: num(q.A, 4), col: C['el-exp'], f: fnt(12.5, 700) }];
      if (!q.cont) labs.push({ v: q.Ae, t: num(q.Ae, 4), col: C['el-cont'], f: fnt(11.5, 600) });
      labs.push({ v: q.As, t: num(q.As, 4), col: C['el-simple'], f: fnt(11.5, 600) });
      labs.forEach(function (o) { o.y = F.Y(o.v) - 11; });
      labs.sort(function (p, q2) { return p.y - q2.y; });
      for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 17) labs[i].y = labs[i - 1].y + 17;
      const over = labs[labs.length - 1].y - (L.b1 - 10);
      if (over > 0) labs.forEach(function (o) { o.y -= over; });
      labs.forEach(function (o) { o.y = Math.max(L.t1 + 8, o.y); D.haloText(c, o.t, ex, o.y, o.col, 'right', 'middle', o.f); });
    }

    // 下圖：總額對 n（對數橫軸）
    const lo = EL.compound(q.r, 1, q.t), hi = q.Ae;
    const pad = Math.max(1e-6, (hi - lo) * 0.12);
    const G = frameOf({ x0: L.left, x1: L.right, y0: L.t2, y1: L.b2 }, [0, 6], [lo - pad, hi + pad]);
    panelBg(c, G);
    c.save();
    c.strokeStyle = alpha(C.text, 0.45); c.lineWidth = 1;
    c.beginPath(); c.moveTo(G.r.x0, G.r.y0); c.lineTo(G.r.x0, G.r.y1); c.lineTo(G.r.x1, G.r.y1); c.stroke();
    for (let e = 0; e <= 6; e++) {
      const px = G.X(e);
      c.lineWidth = 1; c.strokeStyle = alpha(C.text, 0.08); c.beginPath(); c.moveTo(px, G.r.y0); c.lineTo(px, G.r.y1); c.stroke();
      powLabel(c, e, px, G.r.y1 + 12, 'center', C.muted);
    }
    c.restore();
    [lo, hi].forEach(function (v) { D.haloText(c, num(v, 4), G.r.x0 - 6, G.Y(v), C.muted, 'right', 'middle', fnt(10.5)); });
    D.haloText(c, T('一年複利 n 次，' + tr(q.t, 2) + ' 年後的總額', 'total after ' + tr(q.t, 2) + ' years, compounding n times a year'), L.left, L.t2 - 12, C.muted, 'left', 'middle', fnt(11.5, 600));
    D.haloText(c, 'n', L.right, L.b2 + 24, C.muted, 'right', 'middle', fnt(11.5, 700, true));
    // 上限 e^{rt}
    const yh = G.Y(hi);
    c.save(); c.strokeStyle = C['el-cont']; c.lineWidth = 1.6; c.setLineDash([7, 5]);
    c.beginPath(); c.moveTo(G.r.x0, yh); c.lineTo(G.r.x1, yh); c.stroke(); c.restore();
    D.haloText(c, (Math.abs(q.r * q.t - 1) < 1e-9 ? 'e = ' : T('上限 ', 'limit ')) + num(hi, 6), G.r.x1 - 4, yh - 10, C['el-cont'], 'right', 'middle', fnt(11.5, 700));
    curve(c, G, function (u) { return EL.compound(q.r, Math.pow(10, u), q.t); }, 0, 6, C['el-exp'], 2.2, null, 300);
    if (!q.cont) {
      const u = Math.log10(q.n), py = G.Y(q.An);
      D.ball(c, G.X(u), py, 5.5, C['el-exp'], { glow: 0.4 });
      D.haloText(c, 'n = ' + nText(q.n), G.X(u) + (u > 4.5 ? -8 : 8), py > G.r.y1 - 26 ? py - 14 : py + 14, C['el-exp'], u > 4.5 ? 'right' : 'left', 'middle', fnt(11.5, 700));
    } else {
      D.haloText(c, 'n → ∞', G.r.x1 - 4, yh + 12, C['el-cont'], 'right', 'middle', fnt(11.5, 700));
    }
  }

  // ---------- 指數與對數 ----------
  let IF = null;   // 目前的座標框（拖曳用）
  function drawInverse(c) {
    const q = Qi();
    const W = L.right - L.left, H = L.bottom - L.top;
    const u = Math.min(W / 10, H / 10.5);
    const x0 = -3, y0 = -3;
    const F = frameOf({ x0: L.left, x1: L.right, y0: L.top, y1: L.bottom }, [x0, x0 + W / u], [y0, y0 + H / u]);
    IF = F;
    const r = F.r;
    panelBg(c, F);
    // 格線與軸
    c.save();
    c.lineWidth = 1;
    for (let k = Math.ceil(F.xr[0]); k <= F.xr[1]; k++) { c.strokeStyle = alpha(C.text, k % 5 === 0 ? 0.12 : 0.06); c.beginPath(); c.moveTo(F.X(k), r.y0); c.lineTo(F.X(k), r.y1); c.stroke(); }
    for (let k = Math.ceil(F.yr[0]); k <= F.yr[1]; k++) { c.strokeStyle = alpha(C.text, k % 5 === 0 ? 0.12 : 0.06); c.beginPath(); c.moveTo(r.x0, F.Y(k)); c.lineTo(r.x1, F.Y(k)); c.stroke(); }
    c.strokeStyle = alpha(C.text, 0.55); c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(r.x0, F.Y(0)); c.lineTo(r.x1, F.Y(0)); c.moveTo(F.X(0), r.y0); c.lineTo(F.X(0), r.y1); c.stroke();
    c.fillStyle = C.muted; c.font = fnt(10.5); c.textAlign = 'center'; c.textBaseline = 'top';
    for (let k = Math.ceil(F.xr[0]); k <= F.xr[1]; k++) if (k) c.fillText(String(k).replace('-', '−'), F.X(k), F.Y(0) + 4);
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let k = Math.ceil(F.yr[0]); k <= F.yr[1]; k++) if (k) c.fillText(String(k).replace('-', '−'), F.X(0) - 5, F.Y(k));
    c.restore();
    D.haloText(c, 'x', r.x1 - 8, F.Y(0) - 10, alpha(C.text, 0.8), 'center', 'middle', fnt(14, 700, true));
    D.haloText(c, 'y', F.X(0) + 12, r.y0 + 10, alpha(C.text, 0.8), 'center', 'middle', fnt(14, 700, true));
    // y = x
    const lo = Math.max(F.xr[0], F.yr[0]), hi = Math.min(F.xr[1], F.yr[1]);
    c.save(); c.strokeStyle = alpha(C.muted, 0.9); c.lineWidth = 1.4; c.setLineDash([6, 5]);
    c.beginPath(); c.moveTo(F.X(lo), F.Y(lo)); c.lineTo(F.X(hi), F.Y(hi)); c.stroke(); c.restore();
    D.haloText(c, 'y = x', F.X(hi) - 6, F.Y(hi) + 14, C.muted, 'right', 'middle', fnt(11.5, 600, true));
    const a = q.a;
    // y = a^x（以 x 為參數），y = log_a x（以 y 為參數：點 (a^t, t)）
    curve(c, F, function (x) { return Math.pow(a, x); }, F.xr[0], F.xr[1], C['el-exp'], 2.8);
    if (a !== 1) {
      c.save();
      c.beginPath(); c.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); c.clip();
      c.strokeStyle = C['el-log']; c.lineWidth = 2.8; c.lineJoin = 'round';
      c.beginPath();
      let pen = false;
      const N = 900;
      for (let i = 0; i <= N; i++) {
        const t = F.yr[0] + (F.yr[1] - F.yr[0]) * i / N, xx = Math.pow(a, t);
        if (!isFinite(xx) || xx > F.xr[1] + 50) { pen = false; continue; }
        const px = F.X(xx), py = F.Y(t);
        if (!pen) { c.moveTo(px, py); pen = true; } else c.lineTo(px, py);
      }
      c.stroke(); c.restore();
    }
    // 曲線名稱
    const lx = Math.min(F.xr[1] - 0.6, a > 1 ? Math.log(F.yr[1] - 0.8) / Math.log(a) : a < 1 ? Math.log(F.yr[1] - 0.8) / Math.log(a) : F.xr[1] - 1);
    const lxx = Math.max(F.xr[0] + 0.5, Math.min(F.xr[1] - 1.2, lx));
    const lyy = Math.pow(a, lxx);
    if (isFinite(lyy) && lyy < F.yr[1] && lyy > F.yr[0]) D.supText(c, 'y = ' + tr(a, 4), 'x', F.X(lxx) + (a >= 1 ? -6 : 8), F.Y(lyy) + 4, C['el-exp'], fnt(12.5, 700), a >= 1 ? 'right' : 'left');
    if (a !== 1) {
      const ly = a > 1 ? Math.min(F.yr[1] - 1, Math.log(F.xr[1] - 0.8) / Math.log(a)) : Math.max(F.yr[0] + 0.6, Math.log(F.xr[1] - 0.8) / Math.log(a));
      const lxl = Math.pow(a, ly);
      if (isFinite(lxl) && lxl < F.xr[1] && lxl > F.xr[0]) logLabel(c, F.X(lxl) - 4, F.Y(ly) + (a > 1 ? 16 : -16), tr(a, 4));
    }
    // 切線
    if (state.showTan && a !== 1) {
      const m = q.ln;
      tline(c, F, 0, 1, m, C['el-exp']);
      tline(c, F, 1, 0, 1 / m, C['el-log']);
      D.ball(c, F.X(0), F.Y(1), 3.6, C['el-exp'], {});
      D.ball(c, F.X(1), F.Y(0), 3.6, C['el-log'], {});
      D.haloText(c, T('斜率 ', 'slope ') + num(m, 4), F.X(0) + 10, F.Y(1) + (a > 1 ? 14 : -12), C['el-exp'], 'left', 'middle', fnt(11.5, 700));
    }
    // 交點
    q.meet.pts.forEach(function (p) {
      if (p[0] < F.xr[0] || p[0] > F.xr[1] || p[1] < F.yr[0] || p[1] > F.yr[1]) return;
      c.save(); c.strokeStyle = C.text; c.lineWidth = 2; c.beginPath(); c.arc(F.X(p[0]), F.Y(p[1]), 7, 0, 2 * Math.PI); c.stroke(); c.restore();
    });
    if (q.meet.pts.length === 3) zoomInset(c, F, q);
    if (q.tangent) D.pill(c, T('相切於 (e, e)', 'touching at (e, e)'), F.X(Math.E) + 10, F.Y(Math.E) + 26, C.accent, 'left', fnt(12, 700));
    // P 與 Q
    if (state.showMirror && isFinite(q.y)) {
      const P = [q.x, q.y], Qp = [q.y, q.x];
      const inView = function (p) { return p[0] >= F.xr[0] && p[0] <= F.xr[1] && p[1] >= F.yr[0] && p[1] <= F.yr[1]; };
      c.save();
      c.beginPath(); c.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); c.clip();
      c.strokeStyle = alpha(C.probe, 0.9); c.lineWidth = 1.5; c.setLineDash([5, 4]);
      c.beginPath(); c.moveTo(F.X(P[0]), F.Y(P[1])); c.lineTo(F.X(Qp[0]), F.Y(Qp[1])); c.stroke();
      c.restore();
      if (a !== 1 && Math.abs(P[0] - P[1]) > 0.15) {
        // 直角記號：在 PQ 與 y = x 的交點
        const mx = (P[0] + P[1]) / 2, s = 0.22;
        const d1 = [Math.SQRT1_2, Math.SQRT1_2], d2 = P[0] > P[1] ? [Math.SQRT1_2, -Math.SQRT1_2] : [-Math.SQRT1_2, Math.SQRT1_2];
        c.save(); c.strokeStyle = alpha(C.probe, 0.9); c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(F.X(mx + d1[0] * s), F.Y(mx + d1[1] * s)); c.lineTo(F.X(mx + (d1[0] + d2[0]) * s), F.Y(mx + (d1[1] + d2[1]) * s)); c.lineTo(F.X(mx + d2[0] * s), F.Y(mx + d2[1] * s)); c.stroke(); c.restore();
      }
      if (inView(P)) { D.ball(c, F.X(P[0]), F.Y(P[1]), 7, C['el-exp'], { glow: 0.4 }); D.haloText(c, 'P', F.X(P[0]) - 10, F.Y(P[1]) - 12, C['el-exp'], 'center', 'middle', fnt(14, 700, true)); }
      if (a !== 1 && inView(Qp)) { D.ball(c, F.X(Qp[0]), F.Y(Qp[1]), 7, C['el-log'], { glow: 0.4 }); D.haloText(c, 'Q', F.X(Qp[0]) + 12, F.Y(Qp[1]) + 12, C['el-log'], 'center', 'middle', fnt(14, 700, true)); }
    }
    if (a === 1) D.pill(c, T('底數 1：1 的任何次方都是 1，沒有對數', 'Base 1: every power of 1 is 1, so there is no logarithm'), (r.x0 + r.x1) / 2, r.y0 + 26, C.accent, 'center', fnt(12.5, 700));
  }
  /** 三個交點擠在原點附近：右上角放大 [0, 1] × [0, 1] */
  function zoomInset(c, F, q) {
    const r = F.r, s = Math.round(Math.min(170, (r.x1 - r.x0) * 0.4)), pad = 12;
    const bx = r.x1 - s - 10, by = r.y0 + 10;
    const Z = frameOf({ x0: bx + pad, x1: bx + s - pad, y0: by + pad + 8, y1: by + s - pad + 8 }, [0, 1], [0, 1]);
    // 原圖上的放大範圍
    c.save();
    c.strokeStyle = alpha(C.text, 0.5); c.lineWidth = 1; c.setLineDash([3, 3]);
    c.strokeRect(F.X(0), F.Y(1), F.X(1) - F.X(0), F.Y(0) - F.Y(1));
    c.restore();
    c.save();
    D.roundRect(c, bx, by, s, s + 8, 8);
    c.fillStyle = alpha(C['canvas-bg'], 0.96); c.fill();
    c.strokeStyle = alpha(C.text, 0.35); c.lineWidth = 1; c.stroke();
    c.beginPath(); c.rect(Z.r.x0, Z.r.y0, Z.r.x1 - Z.r.x0, Z.r.y1 - Z.r.y0);
    c.strokeStyle = alpha(C.text, 0.25); c.stroke();
    c.setLineDash([4, 4]); c.strokeStyle = alpha(C.muted, 0.9);
    c.beginPath(); c.moveTo(Z.X(0), Z.Y(0)); c.lineTo(Z.X(1), Z.Y(1)); c.stroke();
    c.restore();
    curve(c, Z, function (x) { return Math.pow(q.a, x); }, 0, 1, C['el-exp'], 2.2, null, 200);
    c.save();
    c.beginPath(); c.rect(Z.r.x0, Z.r.y0, Z.r.x1 - Z.r.x0, Z.r.y1 - Z.r.y0); c.clip();
    c.strokeStyle = C['el-log']; c.lineWidth = 2.2; c.beginPath();
    for (let i = 0; i <= 200; i++) { const t = i / 200, px = Z.X(Math.pow(q.a, t)), py = Z.Y(t); if (i) c.lineTo(px, py); else c.moveTo(px, py); }
    c.stroke(); c.restore();
    q.meet.pts.forEach(function (p) {
      c.save(); c.strokeStyle = C.text; c.lineWidth = 1.8; c.beginPath(); c.arc(Z.X(p[0]), Z.Y(p[1]), 5, 0, 2 * Math.PI); c.stroke(); c.restore();
    });
    D.haloText(c, T('放大：0 到 1', 'zoom: 0 to 1'), bx + s / 2, by + 11, C.muted, 'center', 'middle', fnt(10.5, 600));
    D.haloText(c, '0', Z.r.x0 - 2, Z.r.y1 + 7, C.muted, 'right', 'middle', fnt(9.5));
    D.haloText(c, '1', Z.r.x1, Z.r.y1 + 7, C.muted, 'center', 'middle', fnt(9.5));
    D.haloText(c, '1', Z.r.x0 - 3, Z.r.y0, C.muted, 'right', 'middle', fnt(9.5));
  }
  function logLabel(c, x, y, aText) {
    c.save();
    c.font = fnt(12.5, 700);
    c.textBaseline = 'middle'; c.textAlign = 'left';
    const w1 = c.measureText('y = log').width;
    c.font = fnt(9.5, 700); const w2 = c.measureText(aText).width;
    c.font = fnt(12.5, 700); const w3 = c.measureText(' x').width;
    const x0 = x - (w1 + w2 + w3);
    D.haloText(c, 'y = log', x0, y, C['el-log'], 'left', 'middle', fnt(12.5, 700));
    D.haloText(c, aText, x0 + w1 + 1, y + 5, C['el-log'], 'left', 'middle', fnt(9.5, 700));
    D.haloText(c, ' x', x0 + w1 + w2 + 1, y, C['el-log'], 'left', 'middle', fnt(12.5, 700, true));
    c.restore();
  }
  function tline(c, F, x0, y0, m, color) {
    const r = F.r;
    c.save();
    c.beginPath(); c.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); c.clip();
    c.strokeStyle = alpha(color, 0.85); c.lineWidth = 1.5; c.setLineDash([3, 4]);
    c.beginPath();
    if (!isFinite(m) || Math.abs(m) > 1e6) { c.moveTo(F.X(x0), r.y0); c.lineTo(F.X(x0), r.y1); }
    else { c.moveTo(F.X(F.xr[0]), F.Y(y0 + m * (F.xr[0] - x0))); c.lineTo(F.X(F.xr[1]), F.Y(y0 + m * (F.xr[1] - x0))); }
    c.stroke(); c.restore();
  }

  // ---------- 對數尺度 ----------
  function drawSemilog(c) {
    const q = Qs(), d = q.data;
    const xr = d ? [0, d.xs[d.xs.length - 1]] : [0, 10];
    const model = function (x) { return q.C * Math.pow(q.b, x); };
    // 縱軸範圍：資料與模型
    let ymin = Infinity, ymax = 0;
    if (d) d.ys.forEach(function (y) { ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); });
    const m0 = model(xr[0]), m1 = model(xr[1]);
    if (!d) { ymin = Math.min(m0, m1); ymax = Math.max(m0, m1); }
    else { ymin = Math.min(ymin, Math.max(ymin / 100, Math.min(m0, m1))); ymax = Math.max(ymax, Math.min(ymax * 100, Math.max(m0, m1))); }
    const linTop = niceCeil((d ? Math.max.apply(null, d.ys) : ymax) * 1.1);
    const P0 = L.panels[0], P1 = L.panels[1];
    const F1 = frameOf(P0, xr, [0, linTop]);
    const e0 = Math.floor(Math.log10(ymin) - 0.05), e1 = Math.ceil(Math.log10(ymax) + 0.05);
    const F2 = frameOf(P1, xr, [Math.max(-3, e0), Math.min(7, Math.max(e0 + 1, e1))]);
    // 一般刻度
    panelBg(c, F1);
    gridLinear(c, F1, L.narrow ? 5 : 5, 5, function (x) { return tr(x, 2); }, function (y) { return sig(y, 3); });
    D.haloText(c, T('一般刻度', 'ordinary scale'), P0.x0, P0.y0 - 12, C.muted, 'left', 'middle', fnt(11.5, 600));
    curve(c, F1, model, xr[0], xr[1], C['el-exp'], 2.4);
    if (d) d.xs.forEach(function (x, i) { const py = F1.Y(d.ys[i]); if (py >= P0.y0 - 4) D.ball(c, F1.X(x), py, 4.6, C['el-data'], {}); });
    // 對數刻度
    panelBg(c, F2);
    c.save();
    c.lineWidth = 1;
    for (let e = Math.ceil(F2.yr[0]); e <= F2.yr[1]; e++) {
      const py = F2.Y(e);
      c.lineWidth = 1; c.strokeStyle = alpha(C.text, 0.16); c.beginPath(); c.moveTo(P1.x0, py); c.lineTo(P1.x1, py); c.stroke();
      powLabel(c, e, P1.x0 - 6, py, 'right', C.muted);
      for (let k = 2; k <= 9; k++) {
        const pk = F2.Y(e + Math.log10(k));
        if (pk < P1.y0) break;
        c.strokeStyle = alpha(C.text, 0.05); c.beginPath(); c.moveTo(P1.x0, pk); c.lineTo(P1.x1, pk); c.stroke();
      }
    }
    const sx = niceStep(xr[1] - xr[0], 5);
    c.fillStyle = C.muted; c.font = fnt(11); c.textAlign = 'center'; c.textBaseline = 'top';
    for (let x = 0; x <= xr[1] + 1e-9; x += sx) {
      c.strokeStyle = alpha(C.text, 0.08); c.beginPath(); c.moveTo(F2.X(x), P1.y0); c.lineTo(F2.X(x), P1.y1); c.stroke();
      c.fillText(tr(x, 2), F2.X(x), P1.y1 + 5);
    }
    c.lineWidth = 1; c.strokeStyle = alpha(C.text, 0.45);
    c.beginPath(); c.moveTo(P1.x0, P1.y0); c.lineTo(P1.x0, P1.y1); c.lineTo(P1.x1, P1.y1); c.stroke();
    c.restore();
    D.haloText(c, T('對數刻度（每格 × 10）', 'log scale (× 10 per line)'), P1.x0, P1.y0 - 12, C.muted, 'left', 'middle', fnt(11.5, 600));
    const lm = function (x) { return Math.log10(q.C) + x * Math.log10(q.b); };
    if (d) d.xs.forEach(function (x, i) {
      const ly = Math.log10(d.ys[i]);
      c.save();
      c.beginPath(); c.rect(P1.x0, P1.y0, P1.x1 - P1.x0, P1.y1 - P1.y0); c.clip();
      c.strokeStyle = alpha(C['el-res'], 0.85); c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(F2.X(x), F2.Y(ly)); c.lineTo(F2.X(x), F2.Y(lm(x))); c.stroke();
      c.restore();
    });
    curve(c, F2, lm, xr[0], xr[1], C['el-exp'], 2.6);
    if (d) d.xs.forEach(function (x, i) { D.ball(c, F2.X(x), F2.Y(Math.log10(d.ys[i])), 4.6, C['el-data'], {}); });
    if (!state.chal) {
      const midx = (xr[0] + xr[1]) * 0.55;
      D.pill(c, T('斜率 ', 'slope ') + num(Math.log10(q.b), 4), F2.X(midx), Math.max(P1.y0 + 16, Math.min(P1.y1 - 8, F2.Y(lm(midx)) - 12)), C['el-exp'], 'center', fnt(11.5, 700));
    }
    const ux = d && d.unit ? (d.unit === 'h' ? T('小時', 'hours') : d.unit === 'd' ? T('天', 'days') : '') : 'x';
    D.haloText(c, ux, P0.x1, P0.y1 + 24, C.muted, 'right', 'middle', fnt(11));
    D.haloText(c, ux, P1.x1, P1.y1 + 24, C.muted, 'right', 'middle', fnt(11));
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
  function yearsText(v) { return v == null ? '—' : num(v, 2) + T(' 年', ' years'); }
  function updateReadouts() {
    const m = state.mode;
    if (m === 'compound') {
      const q = Qc();
      setHTML('cA', q.cont ? '—' : num(q.An, 6));
      setHTML('cE', num(q.Ae, 6));
      setHTML('cS', num(q.As, 4));
      setHTML('cD', q.cont ? '0' : num(q.Ae - q.An, 6));
      setHTML('cT', yearsText(q.T2));
      const rr = tx(q.r, 4), tt = tx(q.t, 2);
      if (q.cont) setEq('A = e^{rt} = e^{' + rr + '\\times' + tt + '} \\approx ' + tx(q.Ae, 6));
      else setEq('A = \\left(1 + \\frac{r}{n}\\right)^{nt} = \\left(1 + \\frac{' + rr + '}{' + q.n + '}\\right)^{' + q.n + '\\times' + tt + '} \\approx ' + tx(q.An, 6));
      setHTML('status', statusCompound(q));
    } else if (m === 'inverse') {
      const q = Qi();
      setHTML('iP', '(' + tr(q.x, 3) + ', ' + sig(q.y, 5) + ')');
      setHTML('iQ', q.a === 1 ? '—' : '(' + sig(q.y, 5) + ', ' + tr(q.x, 3) + ')');
      setHTML('iL', num(q.ln, 4));
      const pts = q.meet.pts;
      setHTML('iM', q.a === 1 ? '—' : q.tangent ? T('約在 (e, e) 相切', 'touching near (e, e)') : pts.length === 0 ? T('沒有', 'none') : pts.map(function (p) { return '(' + num(p[0], 3) + ', ' + num(p[1], 3) + ')'; }).join(' '));
      if (q.a === 1) setEq('1^x = 1');
      else setEq('\\log_{' + tx(q.a, 4) + '} ' + tx(q.y, 4) + ' = \\frac{\\ln ' + tx(q.y, 4) + '}{\\ln ' + tx(q.a, 4) + '} = ' + tx(q.x, 3));
      setHTML('status', statusInverse(q));
    } else {
      const q = Qs(), hide = !!state.chal;
      setHTML('sM', 'y = ' + sig(q.C, 4) + ' · ' + tr(q.b, 3) + '<sup>x</sup>');
      setHTML('sS', num(Math.log10(q.b), 4));
      const lb = Math.log(q.b);
      setHTML('sT', Math.abs(lb) < 1e-12 ? '—' : lb > 0 ? T('翻倍 ', 'doubles in ') + num(Math.LN2 / lb, 3) : T('半衰期 ', 'half-life ') + num(Math.LN2 / -lb, 3));
      setHTML('sR', q.rms == null ? '—' : hide ? '？' : num(q.rms, 4));
      setEq('\\log_{10} y = \\log_{10} ' + tx(q.C, 3) + ' + x\\log_{10} ' + tx(q.b, 3) + ' = ' + tx(Math.log10(q.C), 4) + (Math.log10(q.b) < 0 ? ' - ' : ' + ') + tx(Math.abs(Math.log10(q.b)), 4) + 'x');
      setHTML('status', statusSemilog(q));
    }
  }
  function statusCompound(q) {
    if (q.r === 0) return T('利率 0：錢不會變多。', 'A zero rate: the money never grows.');
    if (q.cont) return T('連續複利：每一瞬間都把利息加進本金，總額是 e 的 rt 次方。', 'Continuous compounding: interest is added at every instant, giving e to the power rt.');
    if (q.n === 1) return T('每年複利一次：每年年底把利息加進本金。', 'Compounded once a year: interest is added at the end of each year.');
    return T('一年複利 ' + nText(q.n) + ' 次：比連續複利少 ' + num(100 * (1 - q.An / q.Ae), 4) + '%。', 'Compounded ' + nText(q.n) + ' times a year: ' + num(100 * (1 - q.An / q.Ae), 4) + '% short of continuous compounding.');
  }
  function statusInverse(q) {
    if (q.a === 1) return T('底數不能是 1。', 'The base cannot be 1.');
    if (q.tangent) return T('兩條曲線在 (e, e) 剛好相切，底數是 e 的 1/e 次方。', 'The two curves just touch at (e, e); the base is e to the power 1/e.');
    if (Math.abs(q.ln - 1) <= 0.001) return T('底數 ≈ e：在 (0, 1) 的切線斜率是 1，和 y = x 平行。', 'Base ≈ e: the tangent at (0, 1) has slope 1, parallel to y = x.');
    const n = q.meet.pts.length;
    if (q.a < 1) return n === 3 ? T('底數小於 e 的 −e 次方：兩條曲線交三次！', 'Base below e to the power −e: the curves meet three times!') : T('底數小於 1：兩條曲線都遞減，在 y = x 上交一次。', 'Base below 1: both curves decrease and meet once on y = x.');
    return n === 2 ? T('底數小於 e 的 1/e 次方：兩條曲線在 y = x 上交兩次。', 'Base below e to the power 1/e: the curves cross twice on y = x.') : T('P 和 Q 對 y = x 對稱：交換 x 與 y。', 'P and Q are mirror images in y = x: x and y swap places.');
  }
  function statusSemilog(q) {
    if (!q.data) return T('模型在對數刻度上是一條直線：斜率 log b、截距 log C。', 'On the log scale the model is a straight line with slope log b and intercept log C.');
    if (state.chal) return T('把右邊圖上的直線對準資料點。', 'Line the model up with the points on the right-hand picture.');
    if (q.rms <= 0.012) return T('對準了！資料在對數刻度上幾乎是一直線。', 'A good fit: on the log scale the data lie almost on a straight line.');
    return T('調整 C（直線上下移）和 b（直線的斜率），讓粉紅色線段變短。', 'Adjust C (moves the line up and down) and b (its slope) to shorten the pink segments.');
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
  function ping(freq, g) { const S = sound(); if (S) S.tone({ freq: freq, dur: 0.12, type: 'sine', gain: g || 0.16 }); }
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
    const f = {};
    if (state.mode === 'inverse') { const q = Qi(); f.tan = q.tangent; f.e = Math.abs(q.ln - 1) <= 0.001; f.three = q.meet.pts.length === 3; }
    if (state.mode === 'semilog') { const q = Qs(); f.fit = q.rms != null && q.rms <= 0.012 && !state.chal; }
    if (state.mode === 'compound') { const q = Qc(); f.e = Math.abs(q.A - Math.E) <= 1e-4; }
    Object.keys(f).forEach(function (k) { if (f[k] && !state.flags[k]) chime(true); });
    state.flags = f;
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function emitNow() {
    if (state.mode === 'compound') { const q = Qc(); emit('compound', { r: q.r * 100, n: q.n, t: q.t, cont: q.cont, A: q.A, An: q.An, Ae: q.Ae }); }
    else if (state.mode === 'inverse') { const q = Qi(); emit('inverse', { a: q.a, x: q.x, y: q.y, meets: q.meet.pts.length, meetX: q.meet.pts.map(function (p) { return p[0]; }), meetY: q.meet.pts.map(function (p) { return p[1]; }), tangent: q.tangent, ln: q.ln }); }
    else { const q = Qs(); emit('semilog', { set: state.chal ? 'chal' : state.set, C: q.C, b: q.b, rms: q.rms, chal: !!state.chal }); }
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  const lab = $('lab');
  const elR = $('rr'), elT = $('ty'), elN = $('nn'), elA = $('aa'), elX = $('px'), elC = $('cc'), elB = $('bb');
  if (window.LabNum) {
    window.LabNum.register(elN, { toValue: EL.nFromPos, toPos: EL.posFromN, min: 1, max: EL.N_MAX, decimals: 0 });
    window.LabNum.register(elC, { toValue: EL.cFromPos, toPos: EL.posFromC, min: 0.1, max: 1000, decimals: 3 });
  }
  function nVal() { return Math.max(1, Math.round(window.LabNum ? val(elN) : EL.nFromPos(+elN.value))); }
  function cVal() { return window.LabNum ? val(elC) : EL.cFromPos(+elC.value); }
  function fmt(el, dec) { const d = dec == null ? (window.LabNum ? window.LabNum.decimals(el) : 2) : dec; return tr(val(el), d); }
  function refreshOutputs() {
    $('rro').textContent = fmt(elR) + '%';
    $('tyo').textContent = fmt(elT);
    $('nno').textContent = state.cont ? '∞' : nText(state.n);
    $('aao').textContent = fmt(elA);
    $('pxo').textContent = fmt(elX);
    $('cco').textContent = sig(state.C, 4);
    $('bbo').textContent = fmt(elB);
    document.querySelectorAll('[data-n]').forEach(function (b) { b.setAttribute('aria-pressed', String(!state.cont && +b.getAttribute('data-n') === state.n)); });
    document.querySelectorAll('[data-set]').forEach(function (b) { b.setAttribute('aria-pressed', String(!state.chal && b.getAttribute('data-set') === state.set)); });
    $('setNote').textContent = state.chal ? T('挑戰的資料', 'Challenge data') : state.set === 'bacteria' ? T('模擬資料：細菌每半小時加倍，每小時乘 4（含幾 % 的誤差）。', 'Simulated data: bacteria doubling every half hour, × 4 per hour (with a few percent of scatter).')
      : state.set === 'decay' ? T('模擬資料：半衰期 8 天的放射性物質（像碘-131），每 4 天量一次。', 'Simulated data: a radioactive substance with a half-life of 8 days (like iodine-131), measured every 4 days.')
        : T('沒有資料：只看模型 y = C·b 的 x 次方。', 'No data: just the model y = C·b to the power x.');
  }
  function readAll() {
    state.r = val(elR) / 100; state.t = val(elT); state.n = nVal();
    state.a = val(elA); state.x = val(elX);
    state.C = cVal(); state.b = val(elB);
  }
  function changed(final) {
    readAll();
    if (state.play && final) stopPlay(false);
    refreshOutputs(); updateReadouts(); checkFlags(); requestDraw();
    emitNow();
    if (final) judgeChal();
  }
  [elR, elT, elN, elA, elX, elC, elB].forEach(function (el) {
    el.addEventListener('input', function () { if (!applying) changed(false); });
    el.addEventListener('change', function () { if (!applying) changed(true); });
  });
  function setSlider(el, v) {
    applying = true;
    if (window.LabNum) window.LabNum.set(el, v); else el.value = v;
    applying = false;
  }
  document.querySelectorAll('[data-n]').forEach(function (b) {
    b.addEventListener('click', function () { state.cont = false; $('contC').checked = false; setSlider(elN, +b.getAttribute('data-n')); changed(true); });
  });
  $('contC').addEventListener('change', function () { state.cont = $('contC').checked; changed(true); });
  document.querySelectorAll('[data-a]').forEach(function (b) {
    b.addEventListener('click', function () { const v = b.getAttribute('data-a'); setSlider(elA, v === 'e' ? Math.round(Math.E * 1e4) / 1e4 : +v); changed(true); });
  });
  ['showTan', 'showMirror'].forEach(function (id) { $(id).addEventListener('change', function () { state[id] = $(id).checked; requestDraw(); }); });
  document.querySelectorAll('[data-set]').forEach(function (b) {
    b.addEventListener('click', function () { if (state.chal) quitChal(true); state.set = b.getAttribute('data-set'); changed(true); });
  });
  function setMode(m) {
    if (m === state.mode) return;
    if (state.play) stopPlay(false);
    if (state.chal) quitChal(true);
    state.mode = m;
    lab.setAttribute('data-mode', m);
    document.querySelectorAll('.modes button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === m)); });
    state.flags = {};
    checkFlags();
    eqKey = '';
    updateReadouts();
    resize();
    emitNow();
  }
  document.querySelectorAll('.modes button').forEach(function (b) { b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); }); });

  // ---------- 播放（看著錢長大） ----------
  function startPlay() {
    state.play = { s: 0, t0: performance.now(), k: 0, dur: reducedMotion ? 1.2 : PLAY_SEC };
    $('play').textContent = T('停止', 'Stop');
    requestDraw();
  }
  function stopPlay(finished) {
    const p = state.play;
    state.play = null;
    $('play').textContent = T('看著錢長大', 'Watch it grow');
    if (finished && p) emit('play', { n: state.n, t: state.t, r: state.r * 100, cont: state.cont });
    requestDraw();
  }
  function stepPlay(now) {
    const p = state.play, q = Qc();
    const s = Math.min(q.t, (now - p.t0) / 1000 / p.dur * q.t);
    // 每期入帳時響一聲（期數不多時；音高隨餘額的對數升高）
    if (!q.cont && q.n * q.t <= 120) {
      const k = Math.floor(q.n * s + 1e-9);
      if (k > p.k) { p.k = k; const A = EL.compound(q.r, q.n, k / q.n); ping(330 * Math.pow(2, Math.min(2.5, Math.log2(A))), 0.14); }
    }
    p.s = s;
    if (s >= q.t) { stopPlay(true); chime(true); return; }
    requestDraw();
  }
  $('play').addEventListener('click', function () { if (state.play) stopPlay(false); else startPlay(); });
  $('clear').addEventListener('click', function () {
    if (state.chal) quitChal(true);
    if (state.play) stopPlay(false);
    state.log = []; state.streak = []; state.round = 0; lastChal = null;
    setChalMsg(''); renderLog();
    const S = sound(); if (S) S.tone({ freq: 392, dur: 0.1, type: 'triangle', gain: 0.14 });
  });

  // ---------- 在圖上拖曳 P ----------
  let drag = null;
  function xFromEvent(ev) {
    if (!IF) return null;
    const rc = cv.getBoundingClientRect();
    const x = IF.xr[0] + (ev.clientX - rc.left - IF.r.x0) / (IF.r.x1 - IF.r.x0) * (IF.xr[1] - IF.xr[0]);
    return Math.max(-3, Math.min(3, Math.round(x * 100) / 100));
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (state.mode !== 'inverse') return;
    const x = xFromEvent(ev); if (x == null) return;
    drag = ev.pointerId;
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    setSlider(elX, x); changed(false);
  });
  cv.addEventListener('pointermove', function (ev) {
    if (drag !== ev.pointerId) return;
    const x = xFromEvent(ev); if (x == null) return;
    setSlider(elX, x); changed(false);
  });
  function endDrag(ev) { if (drag !== ev.pointerId) return; drag = null; changed(true); }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  if (window.LabKeys) {
    window.LabKeys.attach(cv, {
      label: T('指數與對數畫布。左右方向鍵調整目前模式的主要數值（複利次數、點 P 或成長倍率 b），Shift 調得更多。', 'Exponents and logarithms canvas. Left and right arrow keys change the main value of the current mode (times per year, the point P or the factor b); hold Shift for bigger steps.'),
      items: [{
        name: function () { return state.mode === 'compound' ? T('一年複利次數', 'times per year') : state.mode === 'inverse' ? T('點 P', 'point P') : T('成長倍率 b', 'factor b'); },
        move: function (dx, dy, big) {
          if (!dx) return false;
          if (state.mode === 'compound') {
            const list = [1, 2, 4, 12, 52, 365, 8760, 525600, 1e6];
            let i = list.findIndex(function (v) { return v >= state.n; });
            if (i < 0) i = list.length - 1;
            if (list[i] !== state.n && dx < 0) i++;
            i = Math.max(0, Math.min(list.length - 1, i + dx));
            state.cont = false; $('contC').checked = false;
            setSlider(elN, list[i]);
          } else if (state.mode === 'inverse') setSlider(elX, Math.max(-3, Math.min(3, Math.round((state.x + dx * (big ? 0.5 : 0.05)) * 100) / 100)));
          else setSlider(elB, Math.max(EL.B_MIN, Math.min(EL.B_MAX, Math.round((state.b + dx * (big ? 0.1 : 0.01)) * 100) / 100)));
          changed(true);
          return true;
        },
        describe: function () {
          if (state.mode === 'compound') return 'n = ' + nText(state.n) + T('，總額 ', ', total ') + num(Qc().A, 4);
          if (state.mode === 'inverse') { const q = Qi(); return 'P = (' + tr(q.x, 2) + ', ' + sig(q.y, 4) + ')'; }
          return 'b = ' + tr(state.b, 3);
        }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 挑戰（對數尺度）
  // =====================================================================
  const chalMsg = $('chalMsg');
  function setChalMsg(msg, ok) { chalMsg.textContent = msg || ''; chalMsg.classList.toggle('ok', !!ok); }
  function startChal(forced) {
    const ch = forced || EL.genChallenge(rand, { C: state.C, b: state.b }, lastChal);
    if (!ch) { setChalMsg(T('出不了題，請再按一次。', 'Could not make a challenge; please try again.')); return; }
    state.round++;
    state.chal = { xs: ch.xs, ys: ch.ys, C: ch.C, b: ch.b, tol: ch.tol, t0: performance.now(), round: state.round };
    lastChal = ch;
    setChalMsg(T('第 ' + state.round + ' 題：調整 C 和 b，讓模型對準這組資料（放開滑桿才判定）。', 'Challenge ' + state.round + ': adjust C and b so the model fits these data (judged when you release a slider).'));
    $('quitChal').hidden = false;
    $('newChal').textContent = T('換一題', 'Another one');
    changed(false);
  }
  function judgeChal() {
    const ch = state.chal;
    if (!ch || !EL.chalHit(ch, state.C, state.b)) return;
    const time = (performance.now() - ch.t0) / 1000;
    const rms = EL.rmsLog(ch.xs, ch.ys, state.C, state.b);
    state.log.push({ round: ch.round, C: ch.C, b: ch.b, rms: rms, time: time });
    state.streak.push(time);
    const last3 = state.streak.length >= 3 ? state.streak.slice(-3).reduce(function (s, x) { return s + x; }, 0) : null;
    state.chal = null;
    $('quitChal').hidden = true;
    $('newChal').textContent = T('出下一題', 'Next challenge');
    setChalMsg(T('對準了！擬合誤差 ', 'Fitted! Misfit ') + num(rms, 4) + T('，資料其實來自 y = ', '; the data really came from y = ') + sig(ch.C, 3) + ' · ' + tr(ch.b, 2) + T(' 的 x 次方，用了 ', ' to the power x, in ') + time.toFixed(1) + T(' 秒。', ' s.'), true);
    chime(true);
    renderLog();
    refreshOutputs(); updateReadouts(); requestDraw();
    emit('challenge', { time: time, streak: state.streak.length, last3: last3, rms: rms });
    emitNow();
  }
  function quitChal(silent) {
    const ch = state.chal;
    if (!ch) return;
    state.log.push({ round: ch.round, C: ch.C, b: ch.b, rms: null, time: null });
    state.chal = null; state.streak = [];
    $('quitChal').hidden = true;
    $('newChal').textContent = T('出一題', 'New challenge');
    setChalMsg(silent ? '' : T('這題放棄了。答案是 y = ', 'Given up. The answer was y = ') + sig(ch.C, 3) + ' · ' + tr(ch.b, 2) + T(' 的 x 次方；連續答對重新計算。', ' to the power x; the streak starts over.'));
    renderLog();
    refreshOutputs(); updateReadouts(); requestDraw();
  }
  $('newChal').addEventListener('click', function () { if (state.chal) quitChal(true); startChal(); });
  $('quitChal').addEventListener('click', function () { quitChal(false); });
  function renderLog() {
    const t = $('log');
    $('logEmpty').hidden = state.log.length > 0;
    if (!state.log.length) { t.innerHTML = ''; return; }
    let h = '<tr><th>' + T('題', '#') + '</th><th>C</th><th>b</th><th>' + T('誤差', 'misfit') + '</th><th>' + T('秒', 's') + '</th></tr>';
    state.log.slice(-8).reverse().forEach(function (r) {
      h += '<tr><td>' + r.round + '</td><td>' + sig(r.C, 3) + '</td><td>' + tr(r.b, 2) + '</td><td>' + (r.rms == null ? '—' : num(r.rms, 4)) + '</td><td>' +
        (r.time == null ? T('放棄', 'gave up') : r.time.toFixed(1)) + '</td></tr>';
    });
    t.innerHTML = h;
  }

  // 給測試用的介面（不影響畫面）
  window.__el = {
    state: state, Qc: Qc, Qi: Qi, Qs: Qs,
    startChal: function (c) { startChal(c); },
    seed: function (s) { rand = EL.rng(s); }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  setSlider(elC, 10);
  readAll();
  refreshOutputs();
  renderLog();
  updateSoundButton();
  checkFlags();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    eqKey = '';
    renderLog(); refreshOutputs(); updateReadouts(); updateSoundButton();
    if (!state.play) $('play').textContent = T('看著錢長大', 'Watch it grow');
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'lang') themeChanged(); });
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe($('stage'));
  } else window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden && state.play) stopPlay(false); });
  resize();
  updateReadouts();
})();
