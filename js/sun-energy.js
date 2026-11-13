/* sun-energy.js — 「太陽的能量：核融合、光度與太陽常數」的畫面與互動
 * 物理計算全部在 sun-energy-core.js。 */
(function () {
  'use strict';
  const SC = window.SunCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FONT = D.FONT;
  const DUR = { flux: 3.2, ground: 5, fusion: 10 };   // 三種動畫的長度（秒）

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = { rad: $('rad'), temp: $('temp'), mass: $('mass'), dist: $('dist'), alt: $('alt'), tau: $('tau'), alpha: $('alpha'), mw: $('mw'), dur: $('dur'), frac: $('frac') };
  const state = {
    mode: 'flux', star: 'sun', R: 1, T: 5772, M: 1, d: 1,
    h: 60, tau: 0.3, alpha: 0.95, mw: 0.2, dur: 600, f: 0.1,
    chart: { flux: 'a', ground: 'a', fusion: 'a' },
    run: { flux: null, ground: null, fusion: null },
    recs: [], acted: false, clock: 0
  };
  const logReg = function (inp, min, max, dec) {
    if (window.LabNum) window.LabNum.register(inp, { toValue: function (p) { return Math.pow(10, p); }, toPos: Math.log10, min: min, max: max, decimals: dec });
  };
  logReg(el.rad, 0.005, 1000, 3);
  logReg(el.temp, 2000, 40000, 0);
  logReg(el.mass, 0.08, 50, 3);
  logReg(el.dist, 0.01, 50, 4);

  function starOf(id) { return SC.STARS.filter(function (s) { return s.id === id; })[0]; }
  function setSlider(inp, v) { if (window.LabNum) window.LabNum.set(inp, v); else inp.value = v; }
  function applyStar(id) {
    const s = starOf(id);
    state.R = s.R; state.T = s.T; state.M = s.M; state.star = id;
    setSlider(el.rad, s.R); setSlider(el.temp, s.T); setSlider(el.mass, s.M);
    state.star = id;
  }
  function readSliders() {
    state.R = Math.max(0.005, Math.min(1000, val(el.rad)));
    state.T = Math.max(2000, Math.min(40000, val(el.temp)));
    state.M = Math.max(0.08, Math.min(50, val(el.mass)));
    state.d = Math.max(0.01, Math.min(50, val(el.dist)));
    state.h = Math.max(2, Math.min(90, val(el.alt)));
    state.tau = Math.max(0.05, Math.min(1, val(el.tau)));
    state.alpha = Math.max(0.5, Math.min(1, val(el.alpha)));
    state.mw = Math.max(50, Math.min(1000, val(el.mw))) / 1000;
    state.dur = Math.max(0.5, Math.min(60, val(el.dur))) * 60;
    state.f = Math.max(0.01, Math.min(1, val(el.frac) / 100));
  }

  // ---------- 計算 ----------
  function L() { return SC.lum(state.R, state.T); }
  /** 距離 d 在恆星裡面嗎（AU） */
  function inside() { return state.d * SC.AU <= state.R * SC.RSUN; }
  function S() { return inside() ? null : SC.flux(L(), state.d); }
  let panRes = null, panKey = '';
  function P() {
    const k = [state.h, state.tau, state.alpha, state.mw, state.dur].join('|');
    if (!panRes || k !== panKey) { panRes = SC.pan({ S: SC.S0, h: state.h, tau: state.tau, alpha: state.alpha, mw: state.mw, dur: state.dur }); panKey = k; }
    return panRes;
  }
  /** 目前的混濁程度下的紀錄 → Langley 直線 */
  function lgRecs() { return state.recs.filter(function (r) { return Math.abs(r.tau - state.tau) < 1e-9; }); }
  function LG() {
    const rs = lgRecs();
    const f = SC.langley(rs.map(function (r) { return { m: r.m, I: r.Iest }; }));
    if (!f) return null;
    const ms = rs.map(function (r) { return r.m; });
    return { n: rs.length, S0: f.S0, tau: f.tau, r2: f.r2, a: f.a, b: f.b, mMin: Math.min.apply(null, ms), mMax: Math.max.apply(null, ms) };
  }
  function lifes() { return SC.lifetimes(L(), state.M, state.R, state.f); }

  // ---------- 文字 ----------
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function sig(v, n) {
    if (v == null || !isFinite(v)) return '—';
    if (v === 0) return '0';
    const d = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(v))));
    return num(v, Math.min(6, d));
  }
  /** 科學記號（HTML 用 <sup>） */
  function sci(v, n) {
    if (v == null || !isFinite(v)) return '—';
    if (v !== 0 && (Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3)) {
      const e = Math.floor(Math.log10(Math.abs(v))), m = v / Math.pow(10, e);
      return sig(m, n) + ' × 10<sup>' + String(e).replace('-', '−') + '</sup>';
    }
    return sig(v, n);
  }
  /** 中文的大數（萬、億、兆）；英文用科學記號 */
  function big(v, n) {
    if (!window.LabSettings || window.LabSettings.lang !== 'en') {
      const units = [[1e16, '京'], [1e12, '兆'], [1e8, '億'], [1e4, '萬']];
      if (v >= 1e20) return sci(v, n);
      for (const u of units) if (v >= u[0]) return sig(v / u[0], n) + ' ' + u[1];
      return sig(v, n);
    }
    return sci(v, n);
  }
  function years(y) {
    if (y == null || !isFinite(y)) return '—';
    if (y < 1e4) return sig(y, 2) + T(' 年', ' years');
    if (window.LabSettings && window.LabSettings.lang === 'en') {
      if (y < 1e6) return sig(y / 1000, 2) + ' thousand years';
      if (y < 1e9) return sig(y / 1e6, 2) + ' million years';
      return sig(y / 1e9, 3) + ' billion years';
    }
    if (y < 1e8) return sig(y / 1e4, 2) + ' 萬年';
    return sig(y / 1e8, 3) + ' 億年';
  }
  function secs(s) {
    if (s < 60) return sig(s, 3) + T(' 秒', ' s');
    if (s < 3600) { const m = Math.floor(s / 60); return m + T(' 分 ', ' min ') + Math.round(s - 60 * m) + T(' 秒', ' s'); }
    const h = Math.floor(s / 3600); return h + T(' 小時 ', ' h ') + Math.round((s - 3600 * h) / 60) + T(' 分', ' min');
  }
  function auTxt(d) { return (d < 0.1 ? sig(d, 3) : d < 10 ? sig(d, 3) : sig(d, 3)) + ' AU'; }
  function wm2(v) { return v == null ? '—' : sig(v, v >= 1000 ? 4 : 3) + ' W/m²'; }
  function wm2c(v) { return v == null ? '—' : sig(v, v >= 1000 ? 4 : 3) + ' W/m'; }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function setStatus(msg) { setHTML('status', msg); }
  function outNum(v, lo, hi) {
    let t = v.toFixed(hi);
    if (hi > lo) t = t.replace(new RegExp('0{1,' + (hi - lo) + '}$'), '').replace(/\.$/, '');
    return t.replace('-', '−');
  }
  function lumTxt(Lw) { const r = Lw / SC.LSUN; return (r >= 0.01 && r < 1e5 ? sig(r, 3) : sci(r, 3)) + ' L<sub>☉</sub>'; }

  // =====================================================================
  // 顏色
  // =====================================================================
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface',
      '--se-space0', '--se-space1', '--se-ray', '--se-panel', '--se-sky0', '--se-sky1', '--se-dusk', '--se-ground0', '--se-ground1',
      '--se-water', '--se-pan', '--se-hot', '--se-air', '--se-p', '--se-n', '--se-pos', '--se-nu', '--se-g', '--se-he',
      '--se-chem', '--se-grav', '--se-nuc', '--se-fit']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    D.refresh();
  }
  /** 黑體的顏色（約略，Tanner Helland 的擬合） */
  function bbColor(Tk) {
    const t = Tk / 100;
    let r, g, b;
    if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; }
    else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); }
    if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    const c = function (v) { return Math.round(Math.max(0, Math.min(255, v))); };
    return 'rgb(' + c(r) + ',' + c(g) + ',' + c(b) + ')';
  }

  // =====================================================================
  // 畫布
  // =====================================================================
  const stage = $('stage');
  const cv = $('cv'), ctx = cv.getContext('2d');
  const gr = $('gr'), gtx = gr.getContext('2d');
  let cvSize = null, grSize = null;
  function fit(c, g) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300, h = c.clientHeight || 300;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h, dpr: dpr };
  }
  function resizeCv() { cvSize = fit(cv, ctx); grSize = fit(gr, gtx); requestDraw(); }

  /** 核種符號：左上角的質量數＋元素符號，置中於 (x, y) */
  function nuclide(g, A, sym, x, y, color, px) {
    px = px || 13;
    const fMain = '700 ' + px + 'px ' + FONT, fSup = '700 ' + (px * 0.68).toFixed(1) + 'px ' + FONT;
    g.font = fSup; const w1 = g.measureText(String(A)).width;
    g.font = fMain; const w2 = g.measureText(sym).width;
    const x0 = x - (w1 + w2 + 1) / 2;
    D.haloText(g, String(A), x0, y - px * 0.32, color, 'left', 'middle', fSup);
    D.haloText(g, sym, x0 + w1 + 1, y, color, 'left', 'middle', fMain);
  }
  // 太空背景（深淺色主題都是暗的）上的文字與標籤
  function sText(g, text, x, y, color, align, font) {
    g.font = font; g.textAlign = align || 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = 3.5; g.strokeStyle = 'rgba(4,8,20,0.85)'; g.strokeText(text, x, y);
    g.fillStyle = color; g.fillText(text, x, y);
  }
  /** 標籤的左緣：不超出畫布左右兩邊 */
  function clampX(g, x, pw, align) {
    const cw = g.canvas.clientWidth || 1e4;
    const bx = align === 'center' ? x - pw / 2 : align === 'right' ? x - pw : x;
    return Math.max(4, Math.min(cw - 4 - pw, bx));
  }
  function pillIn(g, text, x, yb, color, align, font) {
    g.font = font || '600 12px ' + FONT;
    return D.pill(g, text, clampX(g, x, g.measureText(text).width + 12, align), yb, color, 'left', font);
  }
  function sTag(g, text, x, yb, color, align, font) {
    g.font = font;
    const tw = g.measureText(text).width, ph = 19, pw = tw + 14;
    const bx = clampX(g, x, pw, align), by = yb - ph;
    D.roundRect(g, bx, by, pw, ph, ph / 2);
    g.fillStyle = 'rgba(6,10,24,0.82)'; g.fill();
    g.strokeStyle = D.alpha(color, 0.6); g.lineWidth = 1; g.stroke();
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, bx + pw / 2, by + ph / 2 + 0.5);
  }
  /** 10 的 n 次方（畫布用小字上標） */
  function pow10(g, n, x, y, color, font, align) { return D.supText(g, '10', String(n).replace('-', '−'), x, y, color, font, align); }

  // ---------------------------------------------------------------------
  // 光度與太陽常數
  // ---------------------------------------------------------------------
  const photons = [];
  function initPhotons() {
    photons.length = 0;
    for (let i = 0; i < 110; i++) photons.push({ p: Math.random() * 3.4, y: Math.random() * 2 - 1, z: Math.random() * 2 - 1 });
  }
  initPhotons();
  function fluxLay(W, H) {
    const strip = 84, top = 8, bot = H - strip;
    const x0 = W < 560 ? 44 : 78, yc = top + (bot - top) * (W < 560 ? 0.56 : 0.5);
    const u = (W - x0 - (W < 560 ? 16 : 60)) / 3.6;
    const a = Math.min((bot - top - 84) / 8, u * 0.36);
    return { strip: { x0: 22, x1: W - 22, y: bot + 40 }, star: { x: x0, y: yc }, u: u, a: a, cx: 0.5, cy: 0.3, top: top, bot: bot };
  }
  function proj(Lay, X, Y, Z) { return [Lay.star.x + X * Lay.u + Z * Lay.a * Lay.cx, Lay.star.y - Y * Lay.a + Z * Lay.a * Lay.cy]; }
  const DMIN = 0.01, DMAX = 50;
  function stripX(Lay, d) { const s = Lay.strip; return s.x0 + (Math.log10(d) - Math.log10(DMIN)) / (Math.log10(DMAX) - Math.log10(DMIN)) * (s.x1 - s.x0); }
  function stripD(Lay, x) { const s = Lay.strip; return Math.pow(10, Math.log10(DMIN) + (x - s.x0) / (s.x1 - s.x0) * (Math.log10(DMAX) - Math.log10(DMIN))); }

  function drawFlux(g, W, H) {
    const Lay = fluxLay(W, H), Lw = L(), Sv = S(), col = bbColor(state.T);
    // 太空
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, C['se-space0']); bg.addColorStop(1, C['se-space1']);
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // 星點
    g.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 70; i++) { const x = (i * 97.3 % 1) * W, y = ((i * 57.17 + 0.3) % 1) * (Lay.bot - 10); g.fillRect((x * 13.7) % W, y, i % 7 ? 1 : 1.6, i % 7 ? 1 : 1.6); }
    // 光錐：恆星到第三片板子的四個角
    const k3 = 3;
    const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
    const c3 = corners.map(function (c) { return proj(Lay, k3, k3 * c[0], k3 * c[1]); });
    g.save();
    const cone = g.createLinearGradient(Lay.star.x, 0, c3[0][0], 0);
    cone.addColorStop(0, D.alpha(col, 0.32)); cone.addColorStop(1, D.alpha(col, 0.05));
    g.beginPath(); g.moveTo(Lay.star.x, Lay.star.y);
    // 外輪廓：上緣與下緣的兩條稜
    const hullTop = [c3[0], c3[3]].sort(function (p, q) { return p[1] - q[1]; })[0];
    const hullBot = [c3[1], c3[2]].sort(function (p, q) { return q[1] - p[1]; })[0];
    g.lineTo(hullTop[0], hullTop[1]); g.lineTo(c3[0][0], c3[0][1]); g.lineTo(c3[1][0], c3[1][1]); g.lineTo(hullBot[0], hullBot[1]); g.closePath();
    g.fillStyle = cone; g.fill();
    g.strokeStyle = D.alpha(col, 0.35); g.lineWidth = 1; g.setLineDash([4, 4]);
    c3.forEach(function (p) { g.beginPath(); g.moveTo(Lay.star.x, Lay.star.y); g.lineTo(p[0], p[1]); g.stroke(); });
    g.setLineDash([]);
    g.restore();
    // 光子（同樣的數量穿過每一片板子）
    const run = state.run.flux;
    photons.forEach(function (ph) {
      const X = ph.p; if (X < 0.08) return;
      const q = proj(Lay, X, X * ph.y, X * ph.z);
      const al = Math.max(0, Math.min(1, 1.2 - X / 3.4));
      g.fillStyle = D.alpha(col, 0.85 * al);
      g.beginPath(); g.arc(q[0], q[1], 1.6, 0, Math.PI * 2); g.fill();
    });
    // 三片板子：距離 d、2d、3d，邊長 1、2、3 倍
    const labs = [];
    for (let k = 1; k <= 3; k++) {
      const P4 = corners.map(function (c) { return proj(Lay, k, k * c[0], k * c[1]); });
      g.beginPath(); P4.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.closePath();
      g.fillStyle = D.alpha(C['se-panel'], 0.13 + 0.05 * (3 - k)); g.fill();
      g.strokeStyle = D.alpha(C['se-panel'], 0.75); g.lineWidth = 1.4; g.stroke();
      // k×k 格：每一格面積和第一片一樣
      g.strokeStyle = D.alpha(C['se-panel'], 0.4); g.lineWidth = 1;
      for (let i = 1; i < k; i++) {
        const t = -1 + 2 * i / k;
        let p0 = proj(Lay, k, k * t, -k), p1 = proj(Lay, k, k * t, k);
        g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
        p0 = proj(Lay, k, -k, k * t); p1 = proj(Lay, k, k, k * t);
        g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
      }
      // 第一片板子的一格裡亮一點（被照亮的一格）
      if (k > 1) {
        const q = [[1, 1], [1, 1 - 2 / k], [1 - 2 / k, 1 - 2 / k], [1 - 2 / k, 1]].map(function (c) { return proj(Lay, k, k * c[0], k * c[1]); });
        g.beginPath(); q.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.closePath();
        g.fillStyle = D.alpha(col, 0.22); g.fill();
      }
      const top = proj(Lay, k, k, -k), bot = proj(Lay, k, -k, k);
      labs.push({ k: k, xTop: top[0], yTop: Math.min(top[1], proj(Lay, k, k, k)[1]), xBot: bot[0], yBot: Math.max(bot[1], proj(Lay, k, -k, -k)[1]) });
    }
    // 恆星
    const rs = Math.max(6, Math.min(40, 18 + 8 * Math.log10(state.R)));
    const glow = g.createRadialGradient(Lay.star.x, Lay.star.y, rs * 0.4, Lay.star.x, Lay.star.y, rs * 3.2);
    glow.addColorStop(0, D.alpha(col, 0.55)); glow.addColorStop(1, D.alpha(col, 0));
    g.fillStyle = glow; g.beginPath(); g.arc(Lay.star.x, Lay.star.y, rs * 3.2, 0, Math.PI * 2); g.fill();
    const body = g.createRadialGradient(Lay.star.x - rs * 0.3, Lay.star.y - rs * 0.3, rs * 0.1, Lay.star.x, Lay.star.y, rs);
    body.addColorStop(0, 'rgba(255,255,255,0.95)'); body.addColorStop(0.45, col); body.addColorStop(1, D.shade ? D.shade(col, -0.25) : col);
    g.fillStyle = body; g.beginPath(); g.arc(Lay.star.x, Lay.star.y, rs, 0, Math.PI * 2); g.fill();
    sTag(g, T(starName(), starName()), Lay.star.x - (W < 560 ? 30 : 50), Lay.star.y + rs + 24, C['se-panel'], 'left', '700 11.5px ' + FONT);
    // 一道光（播放中）：波前從恆星跑到第一片板子
    if (run && !run.done) {
      const X = run.u;
      const p = proj(Lay, X, 0, 0);
      g.strokeStyle = D.alpha(col, 0.9); g.lineWidth = 3;
      g.beginPath(); g.arc(Lay.star.x, Lay.star.y, Math.max(1, p[0] - Lay.star.x), -0.5, 0.5); g.stroke();
    }
    // 標籤
    const fpill = '700 11.5px ' + FONT;
    labs.forEach(function (lb) {
      const dk = state.d * lb.k;
      const txt = lb.k === 1 ? 'd = ' + auTxt(state.d) : lb.k + 'd = ' + auTxt(dk);
      sTag(g, txt, lb.xTop, lb.yTop - 6, C['se-panel'], 'center', '600 11px ' + FONT);
      const Sk = Sv == null ? null : Sv / (lb.k * lb.k);
      const head = lb.k === 1 ? 'S' : 'S/' + lb.k * lb.k;
      sTag(g, head + ' = ' + (Sk == null ? '—' : sig(Sk, 3) + ' W/m²'), lb.xBot, lb.yBot + 22, lb.k === 1 ? C['se-ray'] : C['se-panel'], 'center', fpill);
    });
    if (W >= 560) sText(g, T('每一格的面積都一樣（例如 1 m²）', 'Every small square has the same area (say 1 m²)'), 16, Lay.top + 14, D.alpha(C['se-panel'], 0.85), 'left', '11px ' + FONT);
    // 底下的距離尺（對數）
    drawStrip(g, W, H, Lay, Lw);
    if (inside()) sTag(g, T('這個距離在恆星的裡面！', 'This distance is inside the star!'), W / 2, Lay.top + 40, C['se-hot'], 'center', '700 12px ' + FONT);
    if (run) {
      const t = (run.done ? 1 : run.u) * SC.lightTime(state.d);
      sTag(g, T('光走了 ', 'Light has travelled ') + secs(t), W - 14, Lay.top + (W >= 560 ? 24 : 46), C['se-ray'], 'right', '700 12px ' + FONT);
    }
  }
  function drawStrip(g, W, H, Lay, Lw) {
    const s = Lay.strip, y = s.y;
    g.fillStyle = D.alpha('#000', 0.18); g.fillRect(0, Lay.bot, W, H - Lay.bot);
    // 恆星裡面
    const dIn = state.R * SC.RSUN / SC.AU;
    if (dIn > DMIN) { const xi = Math.min(s.x1, stripX(Lay, dIn)); g.fillStyle = D.alpha(bbColor(state.T), 0.25); g.fillRect(s.x0, y - 10, xi - s.x0, 20); }
    g.strokeStyle = D.alpha(C['se-panel'], 0.7); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(s.x0, y); g.lineTo(s.x1, y); g.stroke();
    const f10 = '10px ' + FONT;
    [0.01, 0.1, 1, 10].forEach(function (d) {
      const x = stripX(Lay, d);
      g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x, y + 4); g.stroke();
      sText(g, String(d), x, y + 28, D.alpha(C['se-panel'], 0.8), 'center', f10);
    });
    sText(g, 'AU', s.x1, y + 28, D.alpha(C['se-panel'], 0.8), 'right', f10);
    // 和今天的地球一樣亮的距離
    const dEq = SC.distFor(Lw, SC.S0);
    if (dEq > DMIN && dEq < DMAX) {
      const x = stripX(Lay, dEq);
      g.strokeStyle = C['se-nu']; g.setLineDash([3, 3]); g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(x, y - 14); g.lineTo(x, y + 14); g.stroke(); g.setLineDash([]);
    }
    // 行星
    const narrow = W < 560;
    SC.PLANETS.forEach(function (p, i) {
      if (p.id === 'pluto') return;
      const x = stripX(Lay, p.a);
      D.ball(g, x, y, p.id === 'earth' ? 4.5 : 3.5, p.id === 'earth' ? '#3b82f6' : '#cbd5e1', { shadow: false });
      const up = i % 2 === 0;
      const name = narrow ? T(p.zh.slice(0, 1), p.en.slice(0, 2)) : T(p.zh, p.en);
      sText(g, name, x, up ? y - 13 : y + 15, D.alpha(C['se-panel'], 0.85), 'center', (narrow ? '10px ' : '10.5px ') + FONT);
    });
    // 目前的距離
    const xd = stripX(Lay, state.d);
    g.fillStyle = C['se-ray'];
    g.beginPath(); g.moveTo(xd, y - 6); g.lineTo(xd - 6, y - 18); g.lineTo(xd + 6, y - 18); g.closePath(); g.fill();
    g.strokeStyle = C['se-ray']; g.lineWidth = 2; g.beginPath(); g.moveTo(xd, y - 6); g.lineTo(xd, y + 8); g.stroke();
    const run = state.run.flux;
    if (run && !run.done) { const xp = stripX(Lay, Math.max(DMIN, state.d * run.u)); D.ball(g, xp, y, 4, bbColor(state.T), { shadow: false, glow: 1 }); }
    sText(g, T('拖曳這條尺改變距離', 'Drag along this scale to change the distance'), s.x0, Lay.bot + 12, D.alpha(C['se-panel'], 0.7), 'left', '10.5px ' + FONT);
    if (dEq > DMIN && dEq < DMAX && !narrow) sText(g, T('綠線：和今天的地球一樣亮', 'Green: as bright as Earth today'), s.x1, Lay.bot + 12, C['se-nu'], 'right', '10.5px ' + FONT);
  }
  function starName() {
    const s = starOf(state.star);
    return s ? T(s.zh, s.en) : T('自訂的恆星', 'Custom star');
  }

  // ---------------------------------------------------------------------
  // 在地面量太陽常數
  // ---------------------------------------------------------------------
  function groundLay(W, H) {
    const wide = W >= 640;
    const sceneW = wide ? W * 0.68 : W;
    const sceneH = wide ? H : H * 0.76;
    const O = { x: sceneW * 0.66, y: sceneH - 54 };
    const Re = sceneW * 1.05, Ha = Math.min(sceneH * 0.36, 150);
    const th = wide ? { x: sceneW + 26, y: 46, w: W - sceneW - 52, h: H - 100 } : { x: 34, y: sceneH + 30, w: W - 68, h: H - sceneH - 56 };
    return { wide: wide, sceneW: sceneW, sceneH: sceneH, O: O, Re: Re, Ha: Ha, ctr: { x: O.x, y: O.y + Re }, th: th };
  }
  /** 從 O 沿高度角 h 的方向走，碰到半徑 R 的同心圓要走多遠 */
  function rayTo(Lay, h, R) {
    const ux = -Math.cos(h * Math.PI / 180), uy = -Math.sin(h * Math.PI / 180);
    const ox = Lay.O.x - Lay.ctr.x, oy = Lay.O.y - Lay.ctr.y;
    const b = ox * ux + oy * uy, c = ox * ox + oy * oy - R * R;
    return -b + Math.sqrt(Math.max(0, b * b - c));
  }
  function drawGround(g, W, H) {
    const Lay = groundLay(W, H), r = P(), h = state.h, run = state.run.ground;
    const rad = h * Math.PI / 180, ux = -Math.cos(rad), uy = -Math.sin(rad);
    // 天空（太陽越低越橘、越混濁越灰）
    const dusk = Math.max(0, Math.min(1, (20 - h) / 18));
    const haze = Math.max(0, Math.min(1, (state.tau - 0.15) / 0.85));
    const sky = g.createLinearGradient(0, 0, 0, Lay.sceneH);
    sky.addColorStop(0, D.mix(C['se-sky0'], C['se-air'], haze * 0.55));
    sky.addColorStop(1, D.mix(D.mix(C['se-sky1'], C['se-dusk'], dusk), C['se-air'], haze * 0.4));
    g.fillStyle = sky; g.fillRect(0, 0, Lay.sceneW, Lay.sceneH);
    // 大氣層（誇大的厚度）與地球
    g.save();
    g.beginPath(); g.rect(0, 0, Lay.sceneW, Lay.sceneH); g.clip();
    g.beginPath(); g.arc(Lay.ctr.x, Lay.ctr.y, Lay.Re + Lay.Ha, 0, Math.PI * 2);
    g.fillStyle = D.alpha(C['se-air'], 0.12 + 0.18 * haze); g.fill();
    g.strokeStyle = D.alpha(C['se-air'], 0.6); g.setLineDash([5, 4]); g.lineWidth = 1.2; g.stroke(); g.setLineDash([]);
    const gnd = g.createLinearGradient(0, Lay.O.y - 10, 0, Lay.sceneH);
    gnd.addColorStop(0, C['se-ground0']); gnd.addColorStop(1, C['se-ground1']);
    g.beginPath(); g.arc(Lay.ctr.x, Lay.ctr.y, Lay.Re, 0, Math.PI * 2); g.fillStyle = gnd; g.fill();
    // 陽光：大氣外到地面
    const sAtm = rayTo(Lay, h, Lay.Re + Lay.Ha);
    const entry = { x: Lay.O.x + ux * sAtm, y: Lay.O.y + uy * sAtm };
    let sun = { x: Lay.O.x + ux * (sAtm + 46), y: Lay.O.y + uy * (sAtm + 46) };
    sun.x = Math.max(22, Math.min(Lay.sceneW - 22, sun.x)); sun.y = Math.max(22, sun.y);
    const tr = Math.exp(-state.tau * r.m);
    const beam = g.createLinearGradient(entry.x, entry.y, Lay.O.x, Lay.O.y);
    beam.addColorStop(0, D.alpha(C['se-ray'], 0.85)); beam.addColorStop(1, D.alpha(C['se-ray'], 0.12 + 0.73 * tr));
    g.lineCap = 'round';
    g.strokeStyle = D.alpha(C['se-ray'], 0.85); g.lineWidth = 9;
    g.beginPath(); g.moveTo(sun.x, sun.y); g.lineTo(entry.x, entry.y); g.stroke();
    g.strokeStyle = beam; g.lineWidth = 9;
    g.beginPath(); g.moveTo(entry.x, entry.y); g.lineTo(Lay.O.x, Lay.O.y - 8); g.stroke();
    g.lineCap = 'butt';
    // 天頂方向（m = 1）
    g.strokeStyle = D.alpha(C.text, 0.4); g.setLineDash([3, 4]); g.lineWidth = 1;
    g.beginPath(); g.moveTo(Lay.O.x, Lay.O.y); g.lineTo(Lay.O.x, Lay.O.y - Lay.Ha); g.stroke(); g.setLineDash([]);
    D.haloText(g, T('天頂：m = 1', 'Zenith: m = 1'), Lay.O.x + 6, Lay.O.y - Lay.Ha + 10, D.alpha(C.text, 0.75), 'left', 'middle', '10.5px ' + FONT);
    // 太陽
    const sg = g.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 40);
    sg.addColorStop(0, D.alpha('#fff7d6', 0.95)); sg.addColorStop(0.35, D.alpha(C['se-ray'], 0.6)); sg.addColorStop(1, D.alpha(C['se-ray'], 0));
    g.fillStyle = sg; g.beginPath(); g.arc(sun.x, sun.y, 40, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(sun.x, sun.y, 13, 0, Math.PI * 2); g.fill();
    // 高度角
    g.strokeStyle = D.alpha(C.text, 0.6); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(Lay.O.x - 70, Lay.O.y); g.lineTo(Lay.O.x, Lay.O.y); g.stroke();
    g.beginPath(); g.arc(Lay.O.x, Lay.O.y, 40, Math.PI, Math.PI + rad); g.stroke();
    D.haloText(g, 'h = ' + num(h, 1) + '°', Lay.O.x - 50, Lay.O.y + 16, C.text, 'right', 'middle', '700 11.5px ' + FONT);
    g.restore();
    // 水盒（對準太陽）
    drawPan(g, Lay.O.x, Lay.O.y, rad);
    // 標籤
    pillIn(g, T('大氣外 ', 'Above the air ') + sig(SC.S0, 4) + ' W/m²', Math.max(10, Math.min(Lay.sceneW - 10, entry.x + (h > 60 ? 12 : 0))), entry.y - 10, C['se-ray'], h > 60 ? 'left' : 'center', '700 11.5px ' + FONT);
    pillIn(g, T('地面 ', 'Ground ') + sig(r.Ig, 3) + ' W/m²', Lay.O.x + 16, Lay.O.y + 36, C['se-ray'], 'left', '700 11.5px ' + FONT);
    pillIn(g, T('穿過的空氣 m = ', 'Air crossed m = ') + num(r.m, 2), Math.max(10, (entry.x + Lay.O.x) / 2 - (h > 55 ? 50 : 0)), (entry.y + Lay.O.y) / 2 + (h > 55 ? 0 : 26), C.text, h > 55 ? 'right' : 'center', '600 11px ' + FONT);
    drawThermo(g, Lay, r, run);
  }
  function drawPan(g, x, y, rad) {
    // 支架
    g.strokeStyle = D.alpha(C.text, 0.7); g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 14); g.stroke();
    g.save(); g.translate(x, y - 16);
    g.rotate(-(Math.PI / 2 - rad)); // 盒面法線指向太陽
    const w = 34, d = 9;
    D.roundRect(g, -w / 2, -d / 2, w, d, 2);
    g.fillStyle = C['se-pan']; g.fill();
    g.strokeStyle = D.alpha(C.text, 0.6); g.lineWidth = 1; g.stroke();
    g.fillStyle = D.alpha(C['se-water'], 0.85); g.fillRect(-w / 2 + 3, -d / 2 + 1.5, w - 6, 3);
    g.restore();
  }
  function drawThermo(g, Lay, r, run) {
    const b = Lay.th, Ta = SC.PAN.TAIR;
    const t = run ? (run.done ? state.dur : run.u * state.dur) : 0;
    const Tw = r.Tat(t);
    const span = [0.5, 1, 2, 5, 10, 20, 50, 100].filter(function (v) { return v >= (r.Tend - Ta) * 1.15; })[0] || 100;
    const Tmax = Ta + span, tStep = span / 5, tDec = tStep < 1 ? 1 : 0;
    if (Lay.wide) {
      // 直立的溫度計
      const x = b.x + b.w / 2, y0 = b.y + 18, y1 = b.y + b.h - 40;
      D.haloText(g, T('水溫', 'Water'), x, b.y, C.text, 'center', 'middle', '700 12px ' + FONT);
      D.roundRect(g, x - 9, y0 - 6, 18, y1 - y0 + 12, 9); g.fillStyle = D.alpha(C.text, 0.06); g.fill(); g.strokeStyle = D.alpha(C.text, 0.4); g.lineWidth = 1.2; g.stroke();
      const yv = function (v) { return y1 - (v - Ta) / (Tmax - Ta) * (y1 - y0); };
      g.fillStyle = C['se-hot']; g.fillRect(x - 4, yv(Tw), 8, y1 - yv(Tw) + 6);
      g.beginPath(); g.arc(x, y1 + 14, 14, 0, Math.PI * 2); g.fill();
      g.strokeStyle = D.alpha(C.text, 0.5); g.lineWidth = 1;
      for (let v = Ta; v <= Tmax + 0.01; v += tStep) {
        const y = yv(v); g.beginPath(); g.moveTo(x + 10, y); g.lineTo(x + 16, y); g.stroke();
        D.haloText(g, num(v, tDec), x + 20, y, C.muted, 'left', 'middle', '10px ' + FONT);
      }
      pillIn(g, num(Tw, 2) + ' °C', x, y1 + 46, C['se-hot'], 'center', '700 12px ' + FONT);
      pillIn(g, T('經過 ', 'Elapsed ') + secs(t), x, b.y + b.h + 34, C.text, 'center', '600 11px ' + FONT);
    } else {
      // 手機：橫的溫度計
      const y = b.y + 18, x0 = b.x + 14, x1 = b.x + b.w - 10;
      const xv = function (v) { return x0 + (v - Ta) / (Tmax - Ta) * (x1 - x0); };
      D.roundRect(g, x0 - 6, y - 8, x1 - x0 + 12, 16, 8); g.fillStyle = D.alpha(C.text, 0.06); g.fill(); g.strokeStyle = D.alpha(C.text, 0.4); g.lineWidth = 1.2; g.stroke();
      g.fillStyle = C['se-hot']; g.beginPath(); g.arc(x0 - 8, y, 12, 0, Math.PI * 2); g.fill();
      g.fillRect(x0 - 6, y - 4, xv(Tw) - x0 + 6, 8);
      g.strokeStyle = D.alpha(C.text, 0.5); g.lineWidth = 1;
      for (let v = Ta; v <= Tmax + 0.01; v += tStep) {
        const x = xv(v); g.beginPath(); g.moveTo(x, y + 10); g.lineTo(x, y + 15); g.stroke();
        D.haloText(g, num(v, tDec), x, y + 24, C.muted, 'center', 'middle', '10px ' + FONT);
      }
      pillIn(g, T('水溫 ', 'Water ') + num(Tw, 2) + ' °C', b.x + 6, b.y + b.h + 8, C['se-hot'], 'left', '700 12px ' + FONT);
      pillIn(g, T('經過 ', 'Elapsed ') + secs(t), b.x + b.w, b.y + b.h + 8, C.text, 'right', '600 11px ' + FONT);
    }
  }

  // ---------------------------------------------------------------------
  // 核融合
  // ---------------------------------------------------------------------
  function fusionLay(W, H) {
    if (W >= 640) return { ch: { x: 16, y: 16, w: W * 0.6 - 24, h: H - 32 }, led: { x: W * 0.6 + 8, y: 16, w: W * 0.4 - 24, h: H - 32 } };
    return { ch: { x: 10, y: 10, w: W - 20, h: H * 0.52 }, led: { x: 10, y: H * 0.52 + 16, w: W - 20, h: H * 0.48 - 26 } };
  }
  /** 原子核：質子 z 個、中子 n 個，畫成一小團 */
  function nucleus(g, x, y, z, n, r) {
    r = r || 6;
    const k = z + n, pts = [];
    if (k === 1) pts.push([0, 0]);
    else if (k === 2) pts.push([-r * 0.55, 0], [r * 0.55, 0]);
    else if (k === 3) pts.push([0, -r * 0.6], [-r * 0.6, r * 0.45], [r * 0.6, r * 0.45]);
    else pts.push([-r * 0.55, -r * 0.55], [r * 0.55, -r * 0.55], [-r * 0.55, r * 0.55], [r * 0.55, r * 0.55]);
    const kinds = [];
    for (let i = 0; i < k; i++) kinds.push(i % 2 === 0 ? (z > 0 ? 'p' : 'n') : (n > 0 ? 'n' : 'p'));
    // 依數量重新分配，保證 z 個質子
    let zp = z;
    for (let i = 0; i < k; i++) { kinds[i] = zp > 0 && (i % 2 === 0 || k - i <= zp) ? 'p' : 'n'; if (kinds[i] === 'p') zp--; }
    pts.forEach(function (p, i) { D.ball(g, x + p[0], y + p[1], r, kinds[i] === 'p' ? C['se-p'] : C['se-n'], { shadow: false }); });
  }
  const PPN = { 1: [1, 0], 2: [1, 1], 3: [2, 1], 4: [2, 2] };
  function nucOf(A) { return PPN[A]; }
  function drawFusion(g, W, H) {
    D.backdrop(g, W, H);
    const Lay = fusionLay(W, H), run = state.run.fusion;
    drawChain(g, Lay.ch, run);
    drawLedger(g, Lay.led, run);
  }
  /** 反應鏈：上下兩條路線，各自 p + p → d、d + p → He-3，最後 He-3 + He-3 → He-4 + 2p */
  function drawChain(g, b, run) {
    const u = run ? (run.done ? 1 : run.u) : -1;
    const narrow = b.w < 420;
    const xs = [b.x + b.w * 0.13, b.x + b.w * 0.39, b.x + b.w * 0.65, b.x + b.w * 0.9];
    const yU = b.y + b.h * 0.24, yL = b.y + b.h * 0.7, yM = (yU + yL) / 2;
    const r = narrow ? 5.5 : 7.5, fq = '600 11px ' + FONT;
    D.haloText(g, T('質子–質子鏈', 'Proton–proton chain'), b.x + 4, b.y + 6, C.text, 'left', 'middle', '700 13px ' + FONT);
    // 靜態示意（淡）：三步
    const ghost = u < 0 ? 1 : 0.15;
    g.globalAlpha = ghost;
    [yU, yL].forEach(function (y) {
      nucleus(g, xs[0] - 10, y, 1, 0, r); nucleus(g, xs[0] + 10, y, 1, 0, r);
      D.arrow(g, xs[0] + 22, y, xs[1] - 22, y, D.alpha(C.text, 0.5), 1.6);
      nucleus(g, xs[1] - 4, y, 1, 1, r); nucleus(g, xs[1] + 16, y + (y < yM ? 14 : -14), 1, 0, r);
      D.arrow(g, xs[1] + 26, y, xs[2] - 22, y, D.alpha(C.text, 0.5), 1.6);
      nucleus(g, xs[2], y, 2, 1, r);
      D.arrow(g, xs[2] + 16, y, xs[3] - 18, yM + (y < yM ? -10 : 10), D.alpha(C.text, 0.5), 1.6);
    });
    nucleus(g, xs[3], yM, 2, 2, r + 1);
    g.globalAlpha = 1;
    // 標籤（每一步的核種與能量）
    const lab = function (x, y, A1, s1) { nuclide(g, A1, s1, x, y, C.text, 12); };
    [yU, yL].forEach(function (y, i) {
      const dy = i === 0 ? -22 : 24;
      lab(xs[0], y + dy, 1, 'H'); lab(xs[1] - 4, y + dy, 2, 'H'); lab(xs[2], y + dy, 3, 'He');
      if (!narrow || i === 0) {
        D.haloText(g, '1.44 MeV', (xs[0] + xs[1]) / 2, y + (i === 0 ? 12 : -12), C.muted, 'center', 'middle', fq);
        D.haloText(g, '5.49 MeV', (xs[1] + xs[2]) / 2 + 6, y + (i === 0 ? 12 : -12), C.muted, 'center', 'middle', fq);
      }
    });
    nuclide(g, 4, 'He', xs[3], yM + 32, C['se-he'], 14);
    D.haloText(g, '12.86 MeV', xs[3] - r - 16, yM, C.muted, 'right', 'middle', fq);
    if (u < 0) {
      // 圖例
      const ly = b.y + b.h - 8;
      D.ball(g, b.x + 10, ly, 5, C['se-p'], { shadow: false }); D.haloText(g, T('質子', 'proton'), b.x + 19, ly, C.muted, 'left', 'middle', fq);
      D.ball(g, b.x + 70, ly, 5, C['se-n'], { shadow: false }); D.haloText(g, T('中子', 'neutron'), b.x + 79, ly, C.muted, 'left', 'middle', fq);
      D.haloText(g, 'e+ ' + T('正子', 'positron') + '　ν ' + T('微中子', 'neutrino') + '　γ ' + T('伽瑪射線', 'gamma ray'), b.x + 140, ly, C.muted, 'left', 'middle', fq);
      return;
    }
    // 動畫：u 0–0.32 第一步、0.32–0.62 第二步、0.62–0.9 第三步
    const seg = function (a, z) { return Math.max(0, Math.min(1, (u - a) / (z - a))); };
    const s1 = seg(0, 0.3), s2 = seg(0.32, 0.6), s3 = seg(0.62, 0.88);
    const ease = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
    [yU, yL].forEach(function (y, i) {
      const sgn = i === 0 ? -1 : 1;
      if (s1 < 1) {
        const e = ease(Math.min(1, s1 / 0.7));
        nucleus(g, xs[0] - 40 + 34 * e, y, 1, 0, r); nucleus(g, xs[0] + 40 - 34 * e, y, 1, 0, r);
        if (s1 >= 0.7) D.ripple(g, xs[0], y, 8, (s1 - 0.7) / 0.3, C['se-ray']);
      }
      if (s1 >= 0.7) {
        const t = Math.min(1, (u - 0.21) / 0.4);
        // 正子與微中子飛走
        D.ball(g, xs[0] + 30 * t, y + sgn * 40 * t, 3, C['se-pos'], { shadow: false });
        g.strokeStyle = D.alpha(C['se-nu'], 0.8); g.setLineDash([2, 3]); g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(xs[0], y); g.lineTo(xs[0] - 10 - 40 * t, y + sgn * 50 * t); g.stroke(); g.setLineDash([]);
        D.haloText(g, 'ν', xs[0] - 14 - 40 * t, y + sgn * (50 * t + 8), C['se-nu'], 'center', 'middle', '700 13px ' + FONT);
        D.haloText(g, 'e+', xs[0] + 36 * t, y + sgn * (40 * t + 10), C['se-pos'], 'center', 'middle', '700 11px ' + FONT);
      }
      if (s1 >= 0.7 && s2 < 1) {
        const e = ease(Math.min(1, s2 / 0.7));
        const xd = xs[0] + (xs[1] - xs[0]) * Math.min(1, (s1 - 0.7) / 0.3 + e);
        nucleus(g, Math.min(xs[1], xd), y, 1, 1, r);
        if (s2 > 0) nucleus(g, xs[1] + 40 - 34 * e, y + sgn * -14 * (1 - e), 1, 0, r);
        if (s2 >= 0.7) D.ripple(g, xs[1], y, 8, (s2 - 0.7) / 0.3, C['se-g']);
      }
      if (s2 >= 0.7) {
        const t = Math.min(1, (u - 0.53) / 0.3);
        // 伽瑪射線（波浪線）
        g.strokeStyle = C['se-g']; g.lineWidth = 1.6; g.beginPath();
        for (let k = 0; k <= 30; k++) { const q = k / 30 * t; const xx = xs[1] + 70 * q, yy = y + sgn * 46 * q + Math.sin(k * 1.2) * 3; if (k) g.lineTo(xx, yy); else g.moveTo(xx, yy); }
        g.stroke();
        D.haloText(g, 'γ', xs[1] + 74 * t + 6, y + sgn * 46 * t, C['se-g'], 'left', 'middle', '700 13px ' + FONT);
      }
      if (s2 >= 0.7 && s3 < 1) {
        const e = ease(Math.min(1, s3 / 0.7));
        const x3 = xs[1] + (xs[2] - xs[1]) * Math.min(1, (s2 - 0.7) / 0.3);
        const xx = x3 + (xs[3] - x3) * e * 0.92, yy = y + (yM - y) * e * 0.85;
        nucleus(g, xx, yy, 2, 1, r);
      }
    });
    if (s3 >= 0.7) {
      const t = Math.min(1, (u - 0.80) / 0.2);
      D.ripple(g, xs[3], yM, 10, Math.min(1, (s3 - 0.7) / 0.3), C['se-he']);
      nucleus(g, xs[3], yM, 2, 2, r + 1);
      nucleus(g, xs[3] + 40 * t, yM - 50 * t, 1, 0, r); nucleus(g, xs[3] + 40 * t, yM + 50 * t, 1, 0, r);
    }
    if (u >= 0.9) pillIn(g, T('共放出 26.73 MeV', 'Total 26.73 MeV released'), b.x + b.w / 2, b.y + b.h - 2, C['se-he'], 'center', '700 12.5px ' + FONT);
  }
  /** 質量的帳本：4 個氫原子 vs 1 個氦原子 */
  function drawLedger(g, b, run) {
    const narrow = b.w < 360;
    const fT = '700 13px ' + FONT, f11 = '600 11.5px ' + FONT;
    D.haloText(g, T('質量的帳本', 'The mass ledger'), b.x + 4, b.y + 6, C.text, 'left', 'middle', fT);
    // 天平
    const cx = b.x + b.w / 2, cy = b.y + Math.min(130, Math.max(50, b.h - 170)), arm = Math.min(b.w * 0.36, 130);
    const tilt = 0.12; // 左邊（4 個氫）比較重
    const lx = cx - arm * Math.cos(tilt), ly = cy + arm * Math.sin(tilt), rx = cx + arm * Math.cos(tilt), ry = cy - arm * Math.sin(tilt);
    g.strokeStyle = D.alpha(C.text, 0.6); g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(lx, ly); g.lineTo(rx, ry); g.stroke();
    g.lineWidth = 2.4; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy + 56); g.stroke();
    g.beginPath(); g.moveTo(cx - 22, cy + 56); g.lineTo(cx + 22, cy + 56); g.stroke();
    g.lineCap = 'butt';
    g.fillStyle = D.alpha(C.text, 0.6); g.beginPath(); g.moveTo(cx, cy - 6); g.lineTo(cx - 7, cy + 6); g.lineTo(cx + 7, cy + 6); g.closePath(); g.fill();
    const pan = function (x, y) {
      g.strokeStyle = D.alpha(C.text, 0.45); g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 26, y + 30); g.moveTo(x, y); g.lineTo(x + 26, y + 30); g.stroke();
      g.strokeStyle = D.alpha(C.text, 0.6); g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(x - 32, y + 30); g.quadraticCurveTo(x, y + 40, x + 32, y + 30); g.stroke();
    };
    pan(lx, ly); pan(rx, ry);
    const r = 6;
    nucleus(g, lx - 15, ly + 22, 1, 0, r); nucleus(g, lx - 5, ly + 22, 1, 0, r); nucleus(g, lx + 5, ly + 22, 1, 0, r); nucleus(g, lx + 15, ly + 22, 1, 0, r);
    nucleus(g, rx, ry + 20, 2, 2, r);
    const yt = Math.max(ly, ry) + 58;
    D.supText(g, '4 × ', '1', lx - 20, yt, C.text, f11);
    nuclide(g, 1, 'H', lx + 8, yt - 4, C.text, 11.5);
    D.haloText(g, '4.031300 u', lx, yt + 17, C.text, 'center', 'middle', f11);
    nuclide(g, 4, 'He', rx, yt - 4, C['se-he'], 11.5);
    D.haloText(g, '4.002603 u', rx, yt + 17, C['se-he'], 'center', 'middle', f11);
    const y2 = yt + 46;
    pillIn(g, T('少了 Δm = 0.028697 u（0.71 %）', 'Missing Δm = 0.028697 u (0.71 %)'), cx, y2, C['se-nuc'], 'center', '700 12px ' + FONT);
    const fE = '700 13px ' + FONT;
    g.font = fE; const wA = g.measureText('E = Δm c').width, wB = g.measureText(' = 26.73 MeV').width;
    const xE = cx - (wA + 7 + wB) / 2;
    const wS = D.supText(g, 'E = Δm c', '2', xE, y2 + 27, C.text, fE);
    D.haloText(g, ' = 26.73 MeV', xE + wS, y2 + 27, C.text, 'left', 'alphabetic', fE);
    if (y2 + 48 < b.y + b.h + 6) D.haloText(g, T('微中子帶走約 0.6 MeV，其餘最後變成陽光', 'Neutrinos take about 0.6 MeV; the rest ends up as sunlight'), cx, y2 + 46, C.muted, 'center', 'middle', (narrow ? '10.5px ' : '11px ') + FONT);
  }

  // =====================================================================
  // 下方的圖
  // =====================================================================
  function frame0(W, H) { return { x0: 56, x1: W - 18, y0: 22, y1: H - 32 }; }
  function axisBox(g, Fm) { g.strokeStyle = D.alpha(C.text, 0.45); g.lineWidth = 1; g.strokeRect(Fm.x0, Fm.y0, Fm.x1 - Fm.x0, Fm.y1 - Fm.y0); }
  function drawChart() {
    const g = gtx, W = grSize.w, H = grSize.h;
    g.clearRect(0, 0, W, H);
    D.backdrop(g, W, H);
    const c = state.chart[state.mode];
    if (state.mode === 'flux') { if (c === 'a') chartSd(g, W, H); else chartPlanck(g, W, H); }
    else if (state.mode === 'ground') { if (c === 'a') chartTemp(g, W, H); else chartLangley(g, W, H); }
    else chartLife(g, W, H);
  }
  /** S 對距離（雙對數） */
  function chartSd(g, W, H) {
    const Fm = frame0(W, H), Lw = L();
    const ld0 = Math.log10(DMIN), ld1 = Math.log10(DMAX);
    const Smax = Lw / (4 * Math.PI * Math.pow(DMIN * SC.AU, 2)), Smin = Lw / (4 * Math.PI * Math.pow(DMAX * SC.AU, 2));
    let ly1 = Math.ceil(Math.log10(Smax)), ly0 = Math.floor(Math.log10(Smin));
    ly1 = Math.max(ly1, 4); ly0 = Math.min(ly0, 0);
    const xx = function (d) { return Fm.x0 + (Math.log10(d) - ld0) / (ld1 - ld0) * (Fm.x1 - Fm.x0); };
    const yy = function (s) { return Fm.y1 - (Math.log10(s) - ly0) / (ly1 - ly0) * (Fm.y1 - Fm.y0); };
    g.font = '10px ' + FONT; g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1;
    const ystep = ly1 - ly0 > 10 ? 2 : 1;
    for (let e = ly0; e <= ly1; e += ystep) { const y = yy(Math.pow(10, e)); g.beginPath(); g.moveTo(Fm.x0, y); g.lineTo(Fm.x1, y); g.stroke(); pow10(g, e, Fm.x0 - 6, y + 4, C.muted, '10px ' + FONT, 'right'); }
    [0.01, 0.1, 1, 10].forEach(function (d) { const x = xx(d); g.beginPath(); g.moveTo(x, Fm.y0); g.lineTo(x, Fm.y1); g.stroke(); D.haloText(g, String(d), x, Fm.y1 + 12, C.muted, 'center', 'middle', '10px ' + FONT); });
    D.haloText(g, T('距離 d（AU）', 'Distance d (AU)'), (Fm.x0 + Fm.x1) / 2, H - 4, C.muted, 'center', 'alphabetic', '600 10.5px ' + FONT);
    D.haloText(g, 'W/m²', Fm.x0 - 6, 10, C.muted, 'right', 'middle', '600 10.5px ' + FONT);
    // 地球今天
    const yE = yy(SC.S0);
    if (yE > Fm.y0 && yE < Fm.y1) { g.strokeStyle = C['se-nu']; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(Fm.x0, yE); g.lineTo(Fm.x1, yE); g.stroke(); g.setLineDash([]); D.haloText(g, T('今天的地球 1361', 'Earth today 1361'), Fm.x1 - 4, yE - 8, C['se-nu'], 'right', 'middle', '600 10.5px ' + FONT); }
    // 曲線
    const dIn = state.R * SC.RSUN / SC.AU;
    g.strokeStyle = C['se-ray']; g.lineWidth = 2.4; g.beginPath();
    let first = true;
    for (let i = 0; i <= 200; i++) { const d = Math.pow(10, ld0 + (ld1 - ld0) * i / 200); if (d <= dIn) continue; const x = xx(d), y = yy(SC.flux(Lw, d)); if (first) { g.moveTo(x, y); first = false; } else g.lineTo(x, y); }
    g.stroke();
    SC.PLANETS.forEach(function (p, i) {
      if (p.a <= dIn || p.id === 'pluto') return;
      const x = xx(p.a), y = yy(SC.flux(Lw, p.a));
      D.ball(g, x, y, 3.2, p.id === 'earth' ? '#3b82f6' : '#94a3b8', { shadow: false });
      if ((W >= 520 || i % 2 === 0) && (S() == null || Math.abs(p.a / state.d - 1) > 0.2)) D.haloText(g, T(p.zh, p.en), x + 5, y - 9, C.muted, 'left', 'middle', '10px ' + FONT);
    });
    const Sv = S();
    if (Sv != null) {
      const x = xx(state.d), y = yy(Sv);
      D.ball(g, x, y, 5, C['se-ray'], { shadow: false });
      pillIn(g, sig(Sv, 3) + ' W/m²', Math.min(Fm.x1 - 2, Math.max(Fm.x0 + 2, x + 8)), Math.max(Fm.y0 + 20, y - 8), C['se-ray'], x > Fm.x1 - 110 ? 'right' : 'left', '700 11px ' + FONT);
    }
    axisBox(g, Fm);
  }
  /** 黑體光譜（各自除以最大值）＋可見光 */
  function chartPlanck(g, W, H) {
    const Fm = frame0(W, H);
    const l0 = 100, l1 = 3000;
    const xx = function (l) { return Fm.x0 + (l - l0) / (l1 - l0) * (Fm.x1 - Fm.x0); };
    const yy = function (v) { return Fm.y1 - v * (Fm.y1 - Fm.y0) * 0.92; };
    // 可見光帶
    const vis = g.createLinearGradient(xx(380), 0, xx(750), 0);
    ['#7c3aed', '#2563eb', '#06b6d4', '#22c55e', '#eab308', '#f97316', '#dc2626'].forEach(function (c, i, a) { vis.addColorStop(i / (a.length - 1), D.alpha(c, 0.22)); });
    g.fillStyle = vis; g.fillRect(xx(380), Fm.y0, xx(750) - xx(380), Fm.y1 - Fm.y0);
    D.haloText(g, T('可見光', 'Visible'), xx(565), Fm.y0 + 10, C.muted, 'center', 'middle', '600 10.5px ' + FONT);
    g.strokeStyle = D.alpha(C.text, 0.08);
    for (let l = 500; l <= l1; l += 500) { const x = xx(l); g.beginPath(); g.moveTo(x, Fm.y0); g.lineTo(x, Fm.y1); g.stroke(); D.haloText(g, String(l), x, Fm.y1 + 12, C.muted, 'center', 'middle', '10px ' + FONT); }
    D.haloText(g, T('波長（nm）', 'Wavelength (nm)'), (Fm.x0 + Fm.x1) / 2, H - 4, C.muted, 'center', 'alphabetic', '600 10.5px ' + FONT);
    const planck = function (lnm, Tk) { const l = lnm * 1e-9; return 1 / (Math.pow(l, 5) * (Math.exp(0.0143877688 / (l * Tk)) - 1)); };
    const curve = function (Tk, color, dash, w) {
      const lm = SC.wien(Tk) * 1e9, pk = planck(lm, Tk);
      g.strokeStyle = color; g.lineWidth = w; g.setLineDash(dash || []); g.beginPath();
      for (let i = 0; i <= 300; i++) { const l = l0 + (l1 - l0) * i / 300, y = yy(planck(l, Tk) / pk); if (i) g.lineTo(xx(l), y); else g.moveTo(xx(l), y); }
      g.stroke(); g.setLineDash([]);
      return lm;
    };
    if (Math.abs(state.T - SC.TSUN) > 1) curve(SC.TSUN, D.alpha(C.text, 0.45), [5, 4], 1.4);
    const lm = curve(state.T, bbColor(state.T) === 'rgb(255,255,255)' ? C['se-ray'] : C['se-ray'], null, 2.6);
    if (lm >= l0 && lm <= l1) {
      g.strokeStyle = C['se-ray']; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(xx(lm), Fm.y0); g.lineTo(xx(lm), Fm.y1); g.stroke(); g.setLineDash([]);
      pillIn(g, 'λmax = ' + sig(lm, 3) + ' nm', Math.min(Fm.x1 - 2, xx(lm) + 6), Fm.y0 + 34, C['se-ray'], xx(lm) > Fm.x1 - 120 ? 'right' : 'left', '700 11px ' + FONT);
    } else pillIn(g, 'λmax = ' + sig(lm, 3) + ' nm' + T('（在圖外）', ' (off the chart)'), Fm.x1 - 4, Fm.y0 + 34, C['se-ray'], 'right', '700 11px ' + FONT);
    if (Math.abs(state.T - SC.TSUN) > 1) D.haloText(g, T('虛線：太陽', 'Dashed: the Sun'), Fm.x1 - 4, Fm.y0 + 10, C.muted, 'right', 'middle', '10.5px ' + FONT);
    axisBox(g, Fm);
  }
  /** 水溫對時間 */
  function chartTemp(g, W, H) {
    const Fm = frame0(W, H), r = P(), run = state.run.ground, Ta = SC.PAN.TAIR;
    const tMax = state.dur, ideal = Ta + r.P * tMax / r.Cth;
    const Tmax = Math.max(Ta + 2, Math.ceil(Math.max(ideal, r.Tend) + 0.5));
    const xx = function (t) { return Fm.x0 + t / tMax * (Fm.x1 - Fm.x0); };
    const yy = function (v) { return Fm.y1 - (v - Ta) / (Tmax - Ta) * (Fm.y1 - Fm.y0); };
    g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1;
    const ystep = Tmax - Ta > 20 ? 5 : Tmax - Ta > 8 ? 2 : 1;
    for (let v = Ta; v <= Tmax + 1e-9; v += ystep) { const y = yy(v); g.beginPath(); g.moveTo(Fm.x0, y); g.lineTo(Fm.x1, y); g.stroke(); D.haloText(g, String(v), Fm.x0 - 6, y, C.muted, 'right', 'middle', '10px ' + FONT); }
    const mins = tMax / 60, xstep = mins > 30 ? 10 : mins > 12 ? 5 : mins > 4 ? 1 : mins > 1.5 ? 0.5 : 0.25;
    for (let m = 0; m <= mins + 1e-9; m += xstep) { const x = xx(m * 60); g.beginPath(); g.moveTo(x, Fm.y0); g.lineTo(x, Fm.y1); g.stroke(); D.haloText(g, outNum(m, 0, 2), x, Fm.y1 + 12, C.muted, 'center', 'middle', '10px ' + FONT); }
    D.haloText(g, T('時間（分鐘）', 'Time (min)'), (Fm.x0 + Fm.x1) / 2, H - 4, C.muted, 'center', 'alphabetic', '600 10.5px ' + FONT);
    D.haloText(g, '°C', Fm.x0 - 6, 10, C.muted, 'right', 'middle', '600 10.5px ' + FONT);
    // 不散熱的理想直線
    g.strokeStyle = D.alpha(C.text, 0.5); g.setLineDash([5, 4]); g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(xx(0), yy(Ta)); g.lineTo(xx(tMax), yy(ideal)); g.stroke(); g.setLineDash([]);
    D.haloText(g, T('不散熱的話', 'With no heat loss'), xx(tMax) - 4, yy(ideal) + 12, C.muted, 'right', 'middle', '10.5px ' + FONT);
    // 實際的水溫
    const tNow = run ? (run.done ? tMax : run.u * tMax) : tMax;
    g.strokeStyle = D.alpha(C['se-hot'], run ? 1 : 0.45); g.lineWidth = 2.4; g.beginPath();
    for (let i = 0; i <= 120; i++) { const t = tNow * i / 120; const x = xx(t), y = yy(r.Tat(t)); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    if (run) D.ball(g, xx(tNow), yy(r.Tat(tNow)), 4.5, C['se-hot'], { shadow: false });
    pillIn(g, T('S ≈ CΔT ÷ (A t) = ', 'S ≈ CΔT ÷ (A t) = ') + sig(r.Iest, 3) + ' W/m²', Fm.x0 + 8, Fm.y0 + 20, C['se-hot'], 'left', '700 11px ' + FONT);
    axisBox(g, Fm);
  }
  /** Langley 圖：ln S 對大氣質量 */
  function chartLangley(g, W, H) {
    const Fm = frame0(W, H), rs = state.recs, f = LG();
    const mMax = Math.max(4, Math.ceil(Math.max.apply(null, rs.map(function (r) { return r.m; }).concat([P().m])) + 0.5));
    const vals = rs.map(function (r) { return r.Iest; }).concat([SC.S0 * 1.1]);
    const lmin = Math.log(Math.max(1, Math.min.apply(null, vals) * 0.8)), lmax = Math.log(SC.S0 * 1.25);
    const xx = function (m) { return Fm.x0 + m / mMax * (Fm.x1 - Fm.x0); };
    const yy = function (I) { return Fm.y1 - (Math.log(I) - lmin) / (lmax - lmin) * (Fm.y1 - Fm.y0); };
    g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1;
    for (let m = 0; m <= mMax; m++) { const x = xx(m); g.beginPath(); g.moveTo(x, Fm.y0); g.lineTo(x, Fm.y1); g.stroke(); D.haloText(g, String(m), x, Fm.y1 + 12, C.muted, 'center', 'middle', '10px ' + FONT); }
    [10, 20, 50, 100, 200, 500, 1000, 1361].forEach(function (I) { if (Math.log(I) < lmin || Math.log(I) > lmax) return; const y = yy(I); g.beginPath(); g.moveTo(Fm.x0, y); g.lineTo(Fm.x1, y); g.stroke(); D.haloText(g, String(I), Fm.x0 - 6, y, C.muted, 'right', 'middle', '10px ' + FONT); });
    D.haloText(g, T('大氣質量 m（穿過的空氣是天頂的幾倍）', 'Air mass m (times the air overhead)'), (Fm.x0 + Fm.x1) / 2, H - 4, C.muted, 'center', 'alphabetic', '600 10.5px ' + FONT);
    D.haloText(g, T('W/m²（對數）', 'W/m² (log)'), Fm.x0 - 6, 10, C.muted, 'left', 'middle', '600 10.5px ' + FONT);
    // 真實的大氣外值
    const yS = yy(SC.S0);
    g.strokeStyle = C['se-ray']; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(Fm.x0, yS); g.lineTo(Fm.x1, yS); g.stroke(); g.setLineDash([]);
    D.haloText(g, T('大氣外的真實值 1361', 'True value above the air 1361'), Fm.x1 - 4, yS - 8, C['se-ray'], 'right', 'middle', '600 10.5px ' + FONT);
    // 直線
    if (f) {
      g.strokeStyle = C['se-fit']; g.lineWidth = 2;
      g.beginPath(); g.moveTo(xx(0), yy(Math.exp(f.a))); g.lineTo(xx(mMax), yy(Math.exp(f.a + f.b * mMax))); g.stroke();
      D.ball(g, xx(0), yy(f.S0), 5, C['se-fit'], { shadow: false });
      pillIn(g, T('外推到 m = 0：', 'At m = 0: ') + sig(f.S0, 4) + ' W/m²', xx(0) + 10, yy(f.S0) + 26, C['se-fit'], 'left', '700 11px ' + FONT);
    }
    rs.forEach(function (r) {
      const same = Math.abs(r.tau - state.tau) < 1e-9;
      const x = xx(r.m), y = yy(r.Iest);
      if (same) D.ball(g, x, y, 4.5, C['se-hot'], { shadow: false });
      else { g.strokeStyle = D.alpha(C.muted, 0.7); g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.stroke(); }
    });
    if (!rs.length) D.haloText(g, T('還沒有紀錄：按「開始曬」量第一次', 'No measurements yet: press “Start” to measure'), (Fm.x0 + Fm.x1) / 2, (Fm.y0 + Fm.y1) / 2, C.muted, 'center', 'middle', '12px ' + FONT);
    axisBox(g, Fm);
  }
  /** 壽命：對數時間軸上的長條 */
  function chartLife(g, W, H) {
    const Fm = { x0: W < 560 ? 118 : 150, x1: W - 18, y0: 18, y1: H - 32 };
    const t = lifes(), e0 = 0, e1 = 12;
    const xx = function (y) { return Fm.x0 + (Math.log10(Math.max(1, y)) - e0) / (e1 - e0) * (Fm.x1 - Fm.x0); };
    g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1;
    for (let e = e0; e <= e1; e += 2) { const x = xx(Math.pow(10, e)); g.beginPath(); g.moveTo(x, Fm.y0); g.lineTo(x, Fm.y1); g.stroke(); pow10(g, e, x, Fm.y1 + 16, C.muted, '10px ' + FONT, 'center'); }
    D.haloText(g, T('年（對數）', 'Years (log)'), Fm.x1, H - 4, C.muted, 'right', 'alphabetic', '600 10.5px ' + FONT);
    const rows = [
      { k: 'chem', zh: '化學燃燒（煤）', en: 'Chemical (coal)', c: C['se-chem'] },
      { k: 'grav', zh: '重力收縮', en: 'Shrinking (gravity)', c: C['se-grav'] },
      { k: 'nuc', zh: '核融合', en: 'Nuclear fusion', c: C['se-nuc'] }
    ];
    const bh = Math.min(30, (Fm.y1 - Fm.y0 - 30) / 3 - 10);
    rows.forEach(function (rw, i) {
      const y = Fm.y0 + 16 + i * (bh + 14);
      D.haloText(g, T(rw.zh, rw.en), Fm.x0 - 8, y + bh / 2, C.text, 'right', 'middle', '600 ' + (W < 560 ? 10.5 : 11.5) + 'px ' + FONT);
      const x1 = xx(t[rw.k]);
      D.roundRect(g, Fm.x0, y, Math.max(2, x1 - Fm.x0), bh, 5);
      const gg = g.createLinearGradient(0, y, 0, y + bh); gg.addColorStop(0, D.alpha(rw.c, 0.95)); gg.addColorStop(1, D.alpha(rw.c, 0.7));
      g.fillStyle = gg; g.fill();
      const txt = years(t[rw.k]);
      const inside = x1 - Fm.x0 > 110;
      if (inside) { g.font = '700 11px ' + FONT; g.fillStyle = '#fff'; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(txt, x1 - 8, y + bh / 2); }
      else D.haloText(g, txt, x1 + 6, y + bh / 2, C.text, 'left', 'middle', '700 11px ' + FONT);
    });
    // 地球的年齡
    const xe = xx(SC.EARTH_AGE);
    g.strokeStyle = C['se-nu']; g.lineWidth = 2; g.setLineDash([5, 3]);
    g.beginPath(); g.moveTo(xe, Fm.y0); g.lineTo(xe, Fm.y1); g.stroke(); g.setLineDash([]);
    pillIn(g, T('地球的年齡 45.4 億年', 'Age of the Earth 4.54 billion years'), Math.min(Fm.x1, xe + 4), Fm.y1 - 4, C['se-nu'], xe > Fm.x1 - 150 ? 'right' : 'left', '700 11px ' + FONT);
  }

  // =====================================================================
  // 動畫
  // =====================================================================
  let raf = 0, lastFrame = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function anyPlaying() { const r = state.run[state.mode]; return !!(r && r.playing); }
  function frame(ts) {
    raf = 0;
    const dt = lastFrame ? Math.min(0.1, (ts - lastFrame) / 1000) : 0;
    lastFrame = ts;
    const run = state.run[state.mode];
    if (run && run.playing) stepRun(dt);
    if (state.mode === 'flux' && !D.reducedMotion()) {
      photons.forEach(function (ph) { ph.p += dt * 0.55; if (ph.p > 3.4) { ph.p -= 3.4; ph.y = Math.random() * 2 - 1; ph.z = Math.random() * 2 - 1; } });
    }
    drawMain(); drawChart();
    if (anyPlaying() || (state.mode === 'flux' && !D.reducedMotion() && !document.hidden)) requestDraw(); else lastFrame = 0;
  }
  function drawMain() {
    const W = cvSize.w, H = cvSize.h, g = ctx;
    g.clearRect(0, 0, W, H);
    if (state.mode === 'flux') drawFlux(g, W, H);
    else if (state.mode === 'ground') drawGround(g, W, H);
    else drawFusion(g, W, H);
  }
  function sound() { const Ls = window.LabSound; return Ls && Ls.enabled() ? Ls : null; }
  function startRun() {
    acted();
    const m = state.mode, run = state.run[m];
    if (run && !run.done && !run.playing) { run.playing = true; updateButtons(); requestDraw(); return; }
    if (run && run.playing) return;
    state.run[m] = { u: 0, playing: true, done: false, k: 0 };
    const snd = sound();
    if (m === 'flux') { setStatus(T('一道光從恆星表面出發…', 'A flash of light leaves the star…')); if (snd) snd.sweep({ from: 500, to: 1200, dur: 0.4, gain: 0.05 }); }
    else if (m === 'ground') setStatus(T('水盒對準太陽開始曬，看水溫怎麼上升。', 'The pan faces the Sun; watch the water warm up.'));
    else setStatus(T('核心裡，兩個質子撞在一起…', 'In the core, two protons collide…'));
    updateButtons(); afterChange(true); requestDraw();
  }
  function stepRun(dt) {
    const m = state.mode, run = state.run[m];
    const u0 = run.u;
    run.u = Math.min(1, run.u + dt / DUR[m]);
    const snd = sound();
    if (m === 'fusion' && snd) {
      [[0.21, 1320], [0.53, 1568], [0.79, 2093]].forEach(function (k) { if (u0 < k[0] && run.u >= k[0]) snd.tone({ freq: k[1], dur: 0.14, type: 'triangle', gain: 0.06 }); });
    }
    if (m === 'fusion') {
      if (u0 < 0.21 && run.u >= 0.21) setStatus(T('質子變成中子，放出正子與微中子：氘（²H）。微中子直接穿出太陽。', 'A proton turns into a neutron, giving off a positron and a neutrino: deuterium. The neutrino flies straight out of the Sun.').replace('²H', 'H-2'));
      if (u0 < 0.53 && run.u >= 0.53) setStatus(T('氘再抓一個質子，變成氦 3，放出伽瑪射線。', 'Deuterium catches another proton and becomes helium-3, giving off a gamma ray.'));
      if (u0 < 0.79 && run.u >= 0.79) setStatus(T('兩個氦 3 撞在一起，變成氦 4，還給兩個質子。', 'Two helium-3 nuclei make helium-4 and hand back two protons.'));
    }
    if (m === 'ground' && snd && Math.floor(run.u * 10) !== Math.floor(u0 * 10)) snd.tone({ freq: 700 + 40 * P().Tat(run.u * state.dur), dur: 0.04, type: 'sine', gain: 0.03 });
    if (run.u >= 1) finishRun();
  }
  function finishRun() {
    const m = state.mode, run = state.run[m];
    run.u = 1; run.playing = false; run.done = true;
    const snd = sound();
    if (snd) { snd.tone({ freq: 1568, dur: 0.12, type: 'triangle', gain: 0.06 }); snd.tone({ freq: 2093, dur: 0.18, type: 'triangle', gain: 0.05, delay: 0.1 }); }
    if (m === 'flux') {
      setStatus(inside() ? T('這個距離在恆星的裡面。', 'This distance is inside the star.') : T('光走了 ', 'The light took ') + secs(SC.lightTime(state.d)) + T('，到這裡每平方公尺每秒收到 ', ' to get here; each square metre now receives ') + sig(S(), 3) + T(' 焦耳。', ' joules every second.'));
    } else if (m === 'ground') {
      const r = P();
      state.recs.push({ h: state.h, m: r.m, tau: state.tau, alpha: state.alpha, mw: state.mw, dur: state.dur, Iest: r.Iest, Ig: r.Ig, dT: r.dT });
      if (state.recs.length > 12) state.recs.shift();
      const f = LG();
      setStatus(T('水溫上升 ', 'The water warmed by ') + num(r.dT, 2) + T(' °C；算出地面每平方公尺 ', ' °C, giving ') + sig(r.Iest, 3) + T(' W（實際 ', ' W per square metre on the ground (actually ') + sig(r.Ig, 3) + T(' W）。', ' W).') + (f ? T(' Langley 法外推：', ' Langley extrapolation: ') + sig(f.S0, 4) + ' W/m²' : T(' 換一個太陽高度再量一次，就能畫 Langley 圖。', ' Measure again at another sun altitude to start the Langley plot.')));
      updateLog();
    } else setStatus(T('4 個氫原子核變成 1 個氦原子核，少掉的 0.7 % 質量變成 26.73 MeV 的能量。太陽每秒要這樣做約 ', 'Four hydrogen nuclei became one helium nucleus; the missing 0.7 % of mass became 26.73 MeV. The Sun does this about ') + sci(SC.fusion(SC.LSUN).rate, 2) + T(' 次。', ' times every second.'));
    updateButtons(); updateReadouts();
    emit('run', snapshot());
  }
  function pauseRun() { const run = state.run[state.mode]; if (!run || run.done) return; run.playing = !run.playing; updateButtons(); afterChange(true); requestDraw(); }
  function cancelRun(m) { m = m || state.mode; if (state.run[m]) { state.run[m] = null; updateButtons(); } }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function snapshot() {
    const Lw = L(), Sv = S(), r = P(), f = LG(), t = lifes(), fu = SC.fusion(Lw);
    const run = state.run[state.mode];
    return {
      mode: state.mode, star: state.star || '', R: state.R, T: state.T, M: state.M, L: Lw / SC.LSUN, d: state.d,
      inside: inside(), S: Sv, Srel: Sv == null ? null : Sv / SC.S0, lam: SC.wien(state.T) * 1e9, tLight: SC.lightTime(state.d),
      nuCm2: inside() ? null : SC.nuFlux(Lw, state.d) * 1e-4,
      h: state.h, tau: state.tau, alpha: state.alpha, mw: state.mw * 1000, dur: state.dur / 60,
      m: r.m, Ig: r.Ig, Iest: r.Iest, dT: r.dT, P: r.P, eqFrac: r.dT / (r.P / SC.PAN.K),
      lg: f ? { n: f.n, S0: f.S0, tau: f.tau, r2: f.r2, mMin: f.mMin, mMax: f.mMax } : null, nrec: state.recs.length,
      f: state.f, rate: fu.rate, dm: fu.dm, H: fu.H, tChem: t.chem, tGrav: t.grav, tNuc: t.nuc,
      chart: state.chart[state.mode], anim: !!(run && run.playing)
    };
  }
  let lastEmit = 0;
  function afterChange(force) {
    updateReadouts();
    const tNow = performance.now();
    if (force || tNow - lastEmit > 200) { lastEmit = tNow; emit('state', snapshot()); }
    requestDraw();
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function refreshOutputs() {
    setOut(el.rad, outNum(state.R, 0, state.R < 0.1 ? 3 : state.R < 10 ? 2 : 0));
    setOut(el.temp, String(Math.round(state.T)));
    setOut(el.mass, outNum(state.M, 0, state.M < 1 ? 3 : 2));
    setOut(el.dist, outNum(state.d, 0, state.d < 0.1 ? 4 : state.d < 10 ? 3 : 2));
    setOut(el.alt, outNum(state.h, 0, 1));
    setOut(el.tau, num(state.tau, 2));
    setOut(el.alpha, num(state.alpha, 2));
    setOut(el.mw, String(Math.round(state.mw * 1000)));
    setOut(el.dur, outNum(state.dur / 60, 0, 1));
    setOut(el.frac, outNum(state.f * 100, 0, 1));
    document.querySelectorAll('#starSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-s') === state.star)); });
    document.querySelectorAll('#modeSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === state.mode)); });
    const ch = state.chart[state.mode];
    document.querySelectorAll('#chartSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-chart') === ch)); });
    $('fluxPanel').hidden = state.mode !== 'flux';
    $('groundPanel').hidden = state.mode !== 'ground';
    $('fusionPanel').hidden = state.mode !== 'fusion';
    $('starCard').hidden = state.mode === 'ground';
    $('mBox').hidden = state.mode !== 'fusion';
    document.querySelectorAll('#planetSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(Math.abs(+b.getAttribute('data-a') - state.d) < 1e-9)); });
  }
  function chartNames() {
    const n = { flux: [T('每平方公尺的功率與距離', 'Power per m² vs distance'), T('恆星的光譜', 'The star’s spectrum')], ground: [T('水溫的變化', 'Water temperature'), T('Langley 圖', 'Langley plot')], fusion: [T('能燒多久', 'How long it lasts'), ''] }[state.mode];
    const bs = document.querySelectorAll('#chartSeg button');
    bs[0].textContent = n[0]; bs[1].textContent = n[1]; bs[1].hidden = !n[1];
  }
  function updateReadouts() {
    const Lw = L(), Sv = S();
    chartNames();
    if (state.mode === 'flux') {
      setHTML('fS', Sv == null ? T('在恆星裡面', 'Inside the star') : sig(Sv, Sv >= 1000 ? 4 : 3) + ' <small>W/m²</small>');
      setHTML('fRel', Sv == null ? '—' : (Sv / SC.S0 >= 0.01 ? sig(Sv / SC.S0, 3) : sci(Sv / SC.S0, 3)) + T(' 倍', '×'));
      setHTML('fL', lumTxt(Lw) + '<br><small>' + sci(Lw, 3) + ' W</small>');
      const lam = SC.wien(state.T) * 1e9;
      setHTML('fLam', sig(lam, 3) + ' nm' + (lam < 380 ? T('（紫外線）', ' (ultraviolet)') : lam > 750 ? T('（紅外線）', ' (infrared)') : T('（可見光）', ' (visible)')));
      setHTML('fT', secs(SC.lightTime(state.d)));
      setHTML('fNu', Sv == null ? '—' : big(SC.nuFlux(Lw, state.d) * 1e-4, 3));
      setHTML('cvHint', T('左邊的恆星發出的光，在距離 d、2d、3d 處穿過越來越大的板子：板子的邊長變成 2 倍、3 倍，面積變成 4 倍、9 倍，同樣的光攤開來，每一格只剩 1/4、1/9。下面的尺是真正的距離（對數刻度）。', 'Light from the star crosses larger and larger panels at d, 2d and 3d: twice and three times as wide, four and nine times the area, so each small square receives 1/4 and 1/9. The scale below shows real distances (logarithmic).'));
      setHTML('chartHint', state.chart.flux === 'a'
        ? T('雙對數圖上，平方反比是一條斜率 −2 的直線：距離乘以 10，每平方公尺的功率除以 100。', 'On a log–log plot the inverse-square law is a straight line of slope −2: ten times farther, a hundred times less per square metre.')
        : T('黑體光譜（各自除以自己的最大值）。溫度越高，最亮的顏色越往短波長移（維恩位移定律），總功率也越大（σT^4）。', 'Black-body spectra (each scaled to its own peak). The hotter the star, the shorter the brightest wavelength (Wien’s law) and the larger the total power (σT^4).').replace('σT^4', 'σT<sup>4</sup>'));
    } else if (state.mode === 'ground') {
      const r = P(), f = LG();
      setHTML('gEst', sig(r.Iest, 3) + ' <small>W/m²</small>');
      setHTML('gM', num(r.m, 2));
      setHTML('gIg', sig(r.Ig, 3) + ' W/m²' + T('（', ' (') + num(100 * r.Ig / SC.S0, 0) + ' %' + T('）', ')'));
      setHTML('gDT', num(r.dT, 2) + ' °C');
      setHTML('gLoss', sig(r.Pend, 2) + ' W' + T('（吸收 ', ' (absorbing ') + sig(r.P, 3) + ' W' + T('）', ')'));
      setHTML('gLg', f ? sig(f.S0, 4) + ' W/m²，τ ≈ ' + num(f.tau, 3) + T('（', ' (') + f.n + T(' 點）', ' points)') : T('同一個 τ 至少要兩種太陽高度', 'Needs two sun altitudes with the same τ'));
      setHTML('cvHint', T('左邊：陽光從大氣外穿過空氣照到地面（大氣層的厚度誇大了很多）。太陽越低，穿過的空氣越多。黑色水盒一直對準太陽，右邊是盒裡的水溫。拖曳太陽可以改變高度。', 'Left: sunlight crossing the air down to the ground (the atmosphere is drawn far too thick). The lower the Sun, the more air it crosses. The black pan always faces the Sun; the thermometer shows its water. Drag the Sun to change its altitude.').replace('右邊', sideWide() ? '右邊' : '下面').replace('the thermometer', 'the thermometer'));
      setHTML('chartHint', state.chart.ground === 'a'
        ? T('紅線是水溫，虛線是完全不散熱時的水溫。水越熱散熱越多，曲線越來越平，所以量太久會低估太陽常數。', 'Red: the water temperature; dashed: with no heat loss at all. The hotter the water, the more heat it loses, so a long measurement underestimates.')
        : T('同一個 τ 的紀錄（實心點）排成直線：ln S = ln S<sub>0</sub> − τm。直線延長到 m = 0，就是大氣頂端的陽光。空心點是其他 τ 的紀錄。', 'Measurements with the same τ (filled dots) lie on a line: ln S = ln S<sub>0</sub> − τm. Extend it to m = 0 for the sunlight at the top of the atmosphere. Hollow dots were taken with another τ.'));
    } else {
      const fu = SC.fusion(Lw), t = lifes();
      setHTML('uRate', big(fu.rate, 3) + T(' 次', ''));
      setHTML('uH', big(fu.H, 3) + T(' 公斤', ' kg'));
      setHTML('uDm', big(fu.dm, 3) + T(' 公斤', ' kg'));
      setHTML('uNu', big(fu.nu, 3) + T(' 個', ''));
      setHTML('uChem', years(t.chem));
      setHTML('uGrav', years(t.grav));
      setHTML('uNuc', years(t.nuc));
      setHTML('cvHint', T('左邊：質子–質子鏈（太陽約 99 % 的能量來自它）。按「看一次核融合」播放。右邊：4 個氫原子比 1 個氦原子重一點點，少掉的質量變成能量。'.replace('左邊', sideWide() ? '左邊' : '上面').replace('右邊', sideWide() ? '右邊' : '下面'), (sideWide() ? 'Left' : 'Top') + ': the proton–proton chain (about 99 % of the Sun’s energy). Press “Watch a fusion” to play it. ' + (sideWide() ? 'Right' : 'Bottom') + ': four hydrogen atoms weigh a little more than one helium atom; the missing mass becomes energy.'));
      setHTML('chartHint', T('三種燃料讓目前這顆恆星發光能撐多久（用目前的光度）。綠線是地球的年齡：只有核融合撐得過。', 'How long each fuel could keep this star shining at its present luminosity. Green: the age of the Earth — only fusion lasts that long.'));
    }
    cv.setAttribute('aria-label', state.mode === 'flux' ? T('恆星的光向外擴散。', 'Starlight spreading out. ') + starName() + T('，距離 ', ', distance ') + auTxt(state.d) + T('，每平方公尺 ', ', ') + (Sv == null ? '—' : sig(Sv, 3) + ' W') : state.mode === 'ground' ? T('陽光穿過大氣照到黑色水盒。', 'Sunlight crossing the air onto a black water pan. ') + 'h = ' + num(state.h, 1) + '°' : T('質子–質子鏈與質量的帳本。', 'The proton–proton chain and the mass ledger.'));
  }
  function sideWide() { return !!cvSize && cvSize.w >= 640; }
  function updateLog() {
    const rs = state.recs;
    if (!rs.length) { setHTML('runlog', T('每量完一次會記在這裡。同一天（混濁程度不變）在不同的太陽高度多量幾次，就能畫 Langley 圖。', 'Each finished measurement is kept here. Measure at several sun altitudes on the same day (same haze) and draw the Langley plot.')); return; }
    setHTML('runlog', rs.slice().reverse().map(function (r) {
      return 'h ' + num(r.h, 1) + '°、m ' + num(r.m, 2) + '、τ ' + num(r.tau, 2) + T('：', ': ') + '<b>' + sig(r.Iest, 3) + ' W/m²</b>' + T('（', ' (') + num(r.dur / 60, 1) + T(' 分鐘、', ' min, ') + Math.round(r.mw * 1000) + ' g）';
    }).join('<br>'));
  }
  function updateButtons() {
    const run = state.run[state.mode];
    const idle = { flux: T('送出一道光', 'Send a flash of light'), ground: T('開始曬', 'Start'), fusion: T('看一次核融合', 'Watch a fusion') }[state.mode];
    const busy = { flux: T('光在路上…', 'Travelling…'), ground: T('曬太陽中…', 'Measuring…'), fusion: T('反應中…', 'Fusing…') }[state.mode];
    $('go').textContent = run && !run.done ? (run.playing ? busy : T('繼續', 'Resume')) : run && run.done ? T('再一次', 'Again') : idle;
    $('pause').disabled = !run || run.done || !run.playing;
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  function fillButtons() {
    const box = $('starSeg');
    box.innerHTML = '';
    SC.STARS.forEach(function (s) {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('data-s', s.id); b.textContent = T(s.zh, s.en);
      b.addEventListener('click', function () {
        acted(); cancelRun('flux'); applyStar(s.id); readSliders();
        setStatus(T(s.zh + '：半徑 ', s.en + ': radius ') + sig(s.R, 3) + T(' 倍太陽、表面 ', ' R☉, surface ') + s.T + ' K' + T('，光度約 ', ', luminosity about ') + lumTxt(SC.lum(s.R, s.T)) + T('。', '.'));
        refreshOutputs(); afterChange(true);
      });
      box.appendChild(b);
    });
    const pb = $('planetSeg');
    pb.innerHTML = '';
    SC.PLANETS.forEach(function (p) {
      if (p.id === 'pluto') return;
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('data-a', p.a); b.textContent = T(p.zh, p.en);
      b.addEventListener('click', function () { acted(); cancelRun('flux'); setSlider(el.dist, p.a); readSliders(); state.d = p.a; refreshOutputs(); afterChange(true); });
      pb.appendChild(b);
    });
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  [el.rad, el.temp, el.mass].forEach(function (inp) {
    inp.addEventListener('input', function () { acted(); readSliders(); state.star = ''; cancelRun('flux'); refreshOutputs(); afterChange(); });
    inp.addEventListener('change', function () { afterChange(true); });
  });
  el.dist.addEventListener('input', function () { acted(); readSliders(); cancelRun('flux'); refreshOutputs(); afterChange(); });
  el.dist.addEventListener('change', function () { afterChange(true); });
  [el.alt, el.tau, el.alpha, el.mw, el.dur].forEach(function (inp) {
    inp.addEventListener('input', function () { acted(); readSliders(); cancelRun('ground'); refreshOutputs(); afterChange(); });
    inp.addEventListener('change', function () { afterChange(true); });
  });
  el.frac.addEventListener('input', function () { acted(); readSliders(); refreshOutputs(); afterChange(); });
  el.frac.addEventListener('change', function () { afterChange(true); });
  document.querySelectorAll('#modeSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); state.mode = b.getAttribute('data-mode');
      refreshOutputs(); updateButtons(); afterChange(true);
      setStatus({
        flux: T('改變恆星與距離，看每平方公尺收到多少陽光。', 'Change the star and the distance and see how much sunlight each square metre gets.'),
        ground: T('地面實驗用今天的太陽與地球的距離（大氣外 1361 W/m²）。選太陽高度，按「開始曬」。', 'The ground experiment uses today’s Sun at Earth’s distance (1361 W/m² above the air). Choose the sun’s altitude and press “Start”.'),
        fusion: T('按「看一次核融合」，跟著 4 個質子變成 1 個氦原子核。', 'Press “Watch a fusion” and follow four protons becoming one helium nucleus.')
      }[state.mode]);
    });
  });
  document.querySelectorAll('#chartSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); state.chart[state.mode] = b.getAttribute('data-chart'); refreshOutputs(); afterChange(true); });
  });
  $('go').addEventListener('click', startRun);
  $('pause').addEventListener('click', function () { acted(); pauseRun(); });
  $('clear').addEventListener('click', function () {
    acted();
    state.run = { flux: null, ground: null, fusion: null };
    state.recs = [];
    updateLog(); updateButtons();
    setStatus(T('已清除紀錄與動畫，設定不變。', 'Records and animations cleared; the settings are kept.'));
    afterChange(true);
  });
  $('soundBtn').addEventListener('click', function () {
    const on = !(window.LabSettings && window.LabSettings.get('sound'));
    if (window.LabSettings) window.LabSettings.set('sound', on);
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 畫布：拖曳距離尺、拖曳太陽 ----------
  let dragging = false;
  function cvPos(ev) { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function pointer(p, start) {
    const W = cvSize.w, H = cvSize.h;
    if (state.mode === 'flux') {
      const Lay = fluxLay(W, H);
      if (start && p[1] < Lay.bot) return false;
      const d = Math.max(DMIN, Math.min(DMAX, stripD(Lay, p[0])));
      setSlider(el.dist, Math.round(d * 1e4) / 1e4); readSliders(); cancelRun('flux'); refreshOutputs(); afterChange();
      return true;
    }
    if (state.mode === 'ground') {
      const Lay = groundLay(W, H);
      if (p[0] > Lay.sceneW || p[1] > Lay.sceneH) return false;
      const dx = Lay.O.x - p[0], dy = Lay.O.y - p[1];
      if (dy < -10) return false;
      const h = Math.max(2, Math.min(90, Math.atan2(Math.max(0, dy), dx) * 180 / Math.PI));
      setSlider(el.alt, Math.round(h * 2) / 2); readSliders(); cancelRun('ground'); refreshOutputs(); afterChange();
      return true;
    }
    return false;
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (ev.button !== 0 || !cvSize) return;
    acted();
    if (pointer(cvPos(ev), true)) { dragging = true; try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ } }
  });
  cv.addEventListener('pointermove', function (ev) { if (dragging) pointer(cvPos(ev), false); });
  function endDrag() { if (dragging) { dragging = false; afterChange(true); } }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // ---------- 鍵盤 ----------
  if (window.LabKeys) {
    window.LabKeys.attach(cv, {
      label: T('實驗畫面。光度：左右鍵改變距離。地面：上下鍵改變太陽高度。核融合：左右鍵改變燒掉的比例（按住 Shift 移動較多）。', 'Experiment view. Luminosity: left and right change the distance. Ground: up and down change the sun’s altitude. Fusion: left and right change the fraction burned (hold Shift for bigger steps).'),
      items: [{
        name: function () { return { flux: T('距離', 'Distance'), ground: T('太陽高度', 'Sun’s altitude'), fusion: T('燒掉的比例', 'Fraction burned') }[state.mode]; },
        move: function (dx, dy, big) {
          if (!dx && !dy) return false;
          acted();
          if (state.mode === 'flux') { if (!dx) return false; setSlider(el.dist, Math.max(DMIN, Math.min(DMAX, state.d * Math.pow(10, dx * (big ? 0.1 : 0.01))))); cancelRun('flux'); }
          else if (state.mode === 'ground') { if (!dy) return false; setSlider(el.alt, Math.max(2, Math.min(90, state.h + dy * (big ? 5 : 0.5)))); cancelRun('ground'); }
          else { if (!dx) return false; setSlider(el.frac, Math.max(1, Math.min(100, state.f * 100 + dx * (big ? 5 : 0.5)))); }
          readSliders(); refreshOutputs(); afterChange();
          return true;
        },
        describe: function () {
          if (state.mode === 'flux') return auTxt(state.d) + T('，每平方公尺 ', ', ') + (S() == null ? '—' : sig(S(), 3) + ' W');
          if (state.mode === 'ground') return 'h = ' + num(state.h, 1) + T(' 度，地面 ', ' degrees, ground ') + sig(P().Ig, 3) + ' W/m²';
          return num(state.f * 100, 1) + ' %，' + years(lifes().nuc);
        }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  fillButtons();
  applyStar('sun');
  setSlider(el.dist, 1);
  readSliders();
  state.star = 'sun';
  refreshOutputs();
  updateButtons();
  updateSoundButton();
  updateLog();
  updateReadouts();
  function themeChanged() { readColors(); fillButtons(); refreshOutputs(); updateButtons(); updateSoundButton(); updateReadouts(); updateLog(); requestDraw(); }
  const dmq = window.matchMedia('(prefers-color-scheme: dark)');
  if (dmq.addEventListener) dmq.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lh = 0, gw = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lw || cv.clientHeight !== lh || gr.clientWidth !== gw) { lw = cv.clientWidth; lh = cv.clientHeight; gw = gr.clientWidth; if (gw > 0) { const was = sideWide(); resizeCv(); if (was !== sideWide()) updateReadouts(); } }
    }).observe(stage);
  } else window.addEventListener('resize', resizeCv);
  resizeCv();
  updateReadouts();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastFrame = 0; requestDraw(); } });
  setStatus(T('今天的太陽，在地球的距離（1 AU）。拖曳下面的距離尺，或按「送出一道光」。', 'Today’s Sun at Earth’s distance (1 AU). Drag the distance scale below, or press “Send a flash of light”.'));
  requestDraw();
  // 測試用（Playwright）
  window.__se = {
    state: state, SC: SC, snapshot: snapshot, LG: LG,
    star: function (id) { acted(); cancelRun('flux'); applyStar(id); readSliders(); refreshOutputs(); afterChange(true); },
    set: function (o) {
      acted();
      if (o.mode) state.mode = o.mode;
      const map = { R: el.rad, T: el.temp, M: el.mass, d: el.dist, h: el.alt, tau: el.tau, alpha: el.alpha, mw: el.mw, dur: el.dur, f: el.frac };
      Object.keys(map).forEach(function (k) { if (o[k] != null) setSlider(map[k], o[k]); });
      readSliders();
      if (o.R != null || o.T != null || o.M != null) state.star = '';
      if (o.chart) state.chart[state.mode] = o.chart;
      refreshOutputs(); updateButtons(); afterChange(true);
    },
    play: function (u) { if (!state.run[state.mode]) startRun(); const r = state.run[state.mode]; r.playing = false; r.u = u; updateButtons(); requestDraw(); },
    finish: function () { if (!state.run[state.mode]) startRun(); stepRun(1e6); requestDraw(); }
  };
})();
