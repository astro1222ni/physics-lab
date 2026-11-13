/* sediment-transport.js — 「侵蝕、搬運與沉積：Hjulström 曲線」的畫面與互動
 * 物理計算全部在 sediment-transport-core.js。 */
(function () {
  'use strict';
  const SC = window.SedCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const EN = !!(window.LabSettings && window.LabSettings.lang === 'en');
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FONT = D.FONT;
  const DUR = { bed: 5, settle: 10, river: 7 };
  const SHORT_EN = { fine: 'F. sand', coarse: 'C. sand' };
  const T_BED = 20; // 河床與河流用 20 °C 的水

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = { size: $('size'), vel: $('vel'), depth: $('depth'), temp: $('temp'), u0: $('u0') };
  const state = {
    mode: 'bed', D: 0.2e-3, mineral: 'quartz', shape: 'natural', sample: 'fine',
    U: 0.2, h: 1, consol: 1, T: 20, U0: 2,
    chart: { bed: 'a', settle: 'a', river: 'a' },
    run: { bed: null, settle: null, river: null },
    acted: false
  };
  const logReg = function (inp, min, max, dec) {
    if (window.LabNum) window.LabNum.register(inp, { toValue: function (p) { return Math.pow(10, p); }, toPos: Math.log10, min: min, max: max, decimals: dec });
  };
  logReg(el.size, 0.001, 200, 4);
  logReg(el.vel, 0.001, 5, 4);
  // LabNum.set 會送出 input／change 事件；程式自己設定滑桿時，事件處理要略過
  let quiet = 0;
  function setSlider(inp, v) { quiet++; try { if (window.LabNum) window.LabNum.set(inp, v); else inp.value = v; } finally { quiet--; } }
  function readSliders() {
    state.D = Math.max(0.001, Math.min(200, val(el.size))) / 1000;
    state.U = Math.max(0.001, Math.min(5, val(el.vel)));
    state.h = Math.max(0.2, Math.min(10, val(el.depth)));
    state.T = Math.max(0, Math.min(40, val(el.temp)));
    state.U0 = Math.max(0.5, Math.min(5, val(el.u0)));
  }
  const MIN = {}; SC.MINERALS.forEach(function (m) { MIN[m.id] = m; });
  const SAMP = {}; SC.SAMPLES.forEach(function (s) { SAMP[s.id] = s; });

  // ---------- 計算 ----------
  function C2() { return state.shape === 'sphere' ? 0.4 : 1.0; }
  function opt(extra) { return Object.assign({ D: state.D, h: state.h, T: T_BED, rhoS: MIN[state.mineral].rho, C2: C2(), consol: state.consol }, extra || {}); }
  let cache = {}, cacheKey = '';
  function memo(name, fn) {
    const k = [state.D, state.U, state.h, state.consol, state.T, state.U0, state.mineral, state.shape].join('|');
    if (k !== cacheKey) { cache = {}; cacheKey = k; }
    if (!(name in cache)) cache[name] = fn();
    return cache[name];
  }
  function bed() {
    return memo('bed', function () {
      const o = opt(), a = SC.fate(o, state.U, false), b = SC.fate(o, state.U, true), gr = a.gr;
      return { gr: gr, us: a.us, bed: a.state, inc: b.state, rouse: a.rouse, zone: state.U > gr.Ue ? 'erode' : state.U > gr.Ud ? 'transport' : 'deposit' };
    });
  }
  function curve() {
    return memo('curve', function () {
      const pts = [];
      for (let i = 0; i <= 160; i++) {
        const lg = -3 + 5.301 * i / 160, d = Math.pow(10, lg) / 1000, g = SC.grain(opt({ D: d }));
        pts.push({ lg: lg, Ue: g.Ue, Ud: g.Ud });
      }
      let best = pts[0];
      pts.forEach(function (p) { if (p.Ue < best.Ue) best = p; });
      // 在最低點附近細找
      let lo = best.lg - 0.05, hi = best.lg + 0.05, bl = best.lg, bu = best.Ue;
      for (let i = 0; i <= 100; i++) { const lg = lo + (hi - lo) * i / 100, u = SC.grain(opt({ D: Math.pow(10, lg) / 1000 })).Ue; if (u < bu) { bu = u; bl = lg; } }
      return { pts: pts, minD: Math.pow(10, bl), minU: bu };
    });
  }
  function settleOf(d, rho, c2, Tc) {
    const rw = SC.rhoW(Tc), nu = SC.mu(Tc) / rw, R = rho / rw - 1, w = SC.settle(d, R, nu, c2);
    return { w: w, t: 1 / w, Rep: w * d / nu, wSt: SC.stokes(d, R, nu), nu: nu, mu: SC.mu(Tc) };
  }
  function settle() {
    return memo('settle', function () {
      const me = settleOf(state.D, MIN[state.mineral].rho, C2(), state.T);
      const me20 = settleOf(state.D, MIN[state.mineral].rho, C2(), 20);
      const ref = {};
      SC.SAMPLES.forEach(function (s) { ref[s.id] = settleOf(s.D, SC.RHO_QUARTZ, 1, state.T); });
      return { me: me, t20: me20.t, ref: ref };
    });
  }
  function river() {
    return memo('river', function () {
      const me = SC.riverStop(opt({ h: 1 }), state.U0), xs = {};
      SC.SAMPLES.forEach(function (s) { xs[s.id] = SC.riverStop({ D: s.D, h: 1, T: T_BED }, state.U0); });
      return { me: me, xs: xs };
    });
  }

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
    return num(v, Math.min(7, d));
  }
  function sci(v, n) {
    if (v == null || !isFinite(v)) return '—';
    if (v !== 0 && (Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3)) {
      const e = Math.floor(Math.log10(Math.abs(v))), m = v / Math.pow(10, e);
      return sig(m, n) + ' × 10<sup>' + String(e).replace('-', '−') + '</sup>';
    }
    return sig(v, n);
  }
  function mmTxt(dm) { const mm = dm * 1000; return (mm < 0.01 ? sig(mm, 2) : sig(mm, 3)) + ' mm'; }
  function speed(v) {
    if (v == null || !isFinite(v)) return '—';
    if (v >= 0.1) return sig(v, 3) + ' m/s';
    if (v >= 1e-4) return sig(v * 100, 3) + ' cm/s';
    return sig(v * 1e6, 3) + ' µm/s';
  }
  function dur(s) {
    if (!isFinite(s)) return '—';
    if (s < 60) return sig(s, 3) + T(' 秒', ' s');
    if (s < 3600) return sig(s / 60, 3) + T(' 分鐘', ' min');
    if (s < 86400) return sig(s / 3600, 3) + T(' 小時', ' h');
    return sig(s / 86400, 3) + T(' 天', ' days');
  }
  function shortDur(s) {
    if (s < 60) return sig(s, 2) + (EN ? ' s' : '秒');
    if (s < 3600) return sig(s / 60, 2) + (EN ? ' min' : '分');
    if (s < 86400) return sig(s / 3600, 2) + (EN ? ' h' : '時');
    return sig(s / 86400, 2) + (EN ? ' d' : '天');
  }
  function stateTxt(s) {
    return { rest: T('留在河床上', 'Stays on the bed'), deposit: T('停下來沉積', 'Settles and stops'), bedload: T('推移（滾動、跳躍）', 'Bedload (rolling, hopping)'), suspend: T('懸浮', 'In suspension') }[s];
  }
  function zoneTxt(z) { return { erode: T('侵蝕', 'Erosion'), transport: T('搬運', 'Transport'), deposit: T('沉積', 'Deposition') }[z]; }
  function clsTxt(d) { const c = SC.classOf(d); return T(c.zh, c.en); }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function setStatus(msg) { setHTML('status', msg); }
  function outNum(v, lo, hi) {
    let t = v.toFixed(hi);
    if (hi > lo) t = t.replace(new RegExp('0{1,' + (hi - lo) + '}$'), '').replace(/\.$/, '');
    return t.replace('-', '−');
  }

  // =====================================================================
  // 顏色
  // =====================================================================
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--surface',
      '--st-sky0', '--st-sky1', '--st-water0', '--st-water1', '--st-bank', '--st-bank2',
      '--st-clay', '--st-silt', '--st-sand', '--st-granule', '--st-pebble', '--st-cobble',
      '--st-erode', '--st-move', '--st-dep', '--st-flow', '--st-mine', '--st-gold', '--st-mag', '--st-coal']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    D.refresh();
  }
  function grainColor(d, mineral) {
    if (mineral === 'gold') return C['st-gold'];
    if (mineral === 'magnetite') return C['st-mag'];
    if (mineral === 'coal') return C['st-coal'];
    const c = SC.classOf(d).id;
    if (c === 'sand') return d < 0.5e-3 ? C['st-sand'] : D.mix(C['st-sand'], C['st-granule'], 0.45);
    return C['st-' + c];
  }
  /** 畫面上的顆粒半徑（px）：真實大小的對數 */
  function rVis(d) { return 1.4 + 12.6 * Math.max(0, Math.min(1, (Math.log10(d * 1000) + 3) / 5.301)); }

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
  function clampX(g, x, pw, align) {
    const cw = g.canvas.clientWidth || 1e4;
    const bx = align === 'center' ? x - pw / 2 : align === 'right' ? x - pw : x;
    return Math.max(4, Math.min(cw - 4 - pw, bx));
  }
  function pillIn(g, text, x, yb, color, align, font) {
    g.font = font || '600 12px ' + FONT;
    return D.pill(g, text, clampX(g, x, g.measureText(text).width + 12, align), yb, color, 'left', font);
  }
  function grainDot(g, x, y, r, color, mine) {
    if (r < 2.2) { g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    else D.ball(g, x, y, r, color, { shadow: false });
    if (mine) { g.strokeStyle = C['st-mine']; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, r + 2.5, 0, Math.PI * 2); g.stroke(); }
  }
  // 固定的亂數（畫河床顆粒用）
  function hash(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

  // ---------------------------------------------------------------------
  // 河床上的顆粒
  // ---------------------------------------------------------------------
  const movers = [];   // 河床被挖起的顆粒
  let incs = [];       // 上游放下來的顆粒
  let streaks = [];
  function bedLay(W, H) {
    const top = 26, bedY = H - Math.max(70, H * 0.17);
    return { top: top, bedY: bedY, x0: W < 560 ? 54 : 74, x1: W - 8 };
  }
  /** 床面以上高度比例 s（0 床面 – 1 水面）的流速 / 平均流速 */
  function uRatio(s) {
    const b = bed(), us = b.us, h = state.h;
    if (us <= 0 || state.U <= 0) return 0;
    const z0 = 2.5 * state.D / 30 + b.gr.nu / (9 * us);
    const z = Math.max(z0 * 1.01, s * h);
    return Math.max(0, us / SC.KAPPA * Math.log(z / z0)) / state.U;
  }
  /** 畫面上的水平速度（px/s）：真實流速的對數 */
  function vVis(u) { return u <= 0 ? 0 : 14 + 150 * Math.max(0, Math.min(1, (Math.log10(u) + 3) / 3.7)); }
  function resetMovers() {
    movers.length = 0;
    for (let i = 0; i < 46; i++) movers.push({ x: Math.random(), s: Math.random(), ph: Math.random() * 6.28, k: Math.random() });
    streaks = [];
    for (let i = 0; i < 26; i++) streaks.push({ x: Math.random(), s: 0.05 + 0.9 * Math.random() });
  }
  resetMovers();
  /** Rouse 分布抽一個高度（懸浮的顆粒越細越均勻） */
  function rouseS(k) {
    const P = Math.min(4, bed().rouse), a = 0.03;
    // 反函數抽樣用格點
    let tot = 0; const cdf = [];
    for (let i = 0; i <= 40; i++) { const s = a + (1 - a) * i / 40; const c = s >= 0.999 ? 0 : Math.pow((1 - s) / s * a / (1 - a), P); tot += c; cdf.push(tot); }
    const r = k * tot;
    for (let i = 0; i <= 40; i++) if (cdf[i] >= r) return a + (1 - a) * i / 40;
    return a;
  }
  function stepBed(dt, W) {
    const b = bed(), Lay = bedLay(cvSize.w, cvSize.h), span = Lay.x1 - Lay.x0;
    streaks.forEach(function (st) { st.x += dt * vVis(state.U * uRatio(st.s)) / span; if (st.x > 1) { st.x -= 1; st.s = 0.05 + 0.9 * Math.random(); } });
    if (b.bed === 'bedload' || b.bed === 'suspend') {
      movers.forEach(function (m) {
        const s = b.bed === 'suspend' ? m.s : 0.02 + 0.08 * Math.abs(Math.sin(m.ph));
        m.x += dt * vVis(state.U * uRatio(Math.max(0.02, s))) * (b.bed === 'suspend' ? 1 : 0.45) / span;
        m.ph += dt * (2 + 3 * m.k);
        if (b.bed === 'suspend') { m.s += (Math.random() - 0.5) * dt * 0.25; if (m.s < 0.03 || m.s > 0.98) m.s = rouseS(Math.random()); }
        if (m.x > 1) { m.x -= 1; if (b.bed === 'suspend') m.s = rouseS(Math.random()); }
      });
    }
    // 上游放下來的顆粒
    incs.forEach(function (p) {
      if (p.done) return;
      if (b.inc === 'deposit') {
        p.vy = Math.min(1, p.vy + dt * 0.6);
        p.s -= dt * (0.06 + 0.16 * p.vy);
        p.x += dt * vVis(state.U * uRatio(Math.max(0.02, p.s))) * 0.8 / span;
        if (p.s <= p.rest) { p.s = p.rest; p.done = true; p.landed = true; }
      } else {
        const s = b.inc === 'suspend' ? p.s : 0.02 + 0.08 * Math.abs(Math.sin(p.ph));
        if (b.inc === 'suspend') { p.s += (Math.random() - 0.5) * dt * 0.3; p.s = Math.max(0.04, Math.min(0.96, p.s)); }
        else p.s = s;
        p.ph += dt * 4;
        p.x += dt * vVis(state.U * uRatio(Math.max(0.02, s))) * (b.inc === 'suspend' ? 1 : 0.45) / span;
        if (p.x > 1.03) p.done = true;
      }
    });
  }
  function drawBed(g, W, H) {
    const Lay = bedLay(W, H), b = bed(), col = grainColor(state.D, state.mineral);
    const r = rVis(state.D), y0 = Lay.top, y1 = Lay.bedY, xs = function (x) { return Lay.x0 + x * (Lay.x1 - Lay.x0); };
    const ys = function (s) { return y1 - r - s * (y1 - r - y0); };
    // 水
    const wg = g.createLinearGradient(0, y0, 0, y1);
    wg.addColorStop(0, C['st-water0']); wg.addColorStop(1, C['st-water1']);
    g.fillStyle = C['st-sky1']; g.fillRect(0, 0, W, y0);
    g.fillStyle = wg; g.fillRect(0, y0, W, y1 - y0);
    // 水面的小波紋
    g.strokeStyle = D.alpha('#ffffff', 0.55); g.lineWidth = 1.4; g.beginPath();
    for (let x = 0; x <= W; x += 6) { const y = y0 + Math.sin(x * 0.05 + clock * 2) * 1.5; if (x) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    // 流線（速度越快越長）
    streaks.forEach(function (st) {
      const u = state.U * uRatio(st.s), len = 6 + vVis(u) * 0.18, x = xs(st.x), y = ys(st.s);
      g.strokeStyle = D.alpha('#ffffff', 0.35); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x - len, y); g.lineTo(x, y); g.stroke();
    });
    // 河床（底下一層沉積物）
    const sg = g.createLinearGradient(0, y1, 0, H);
    sg.addColorStop(0, D.mix(col, C['st-bank2'], 0.35)); sg.addColorStop(1, C['st-bank2']);
    g.fillStyle = sg; g.fillRect(0, y1, W, H - y1);
    // 河床表面的顆粒：細顆粒畫成密密的點
    const n = Math.min(260, Math.max(30, Math.floor((W - 8) / (2 * r + 0.6))));
    const step = (W - 8) / n;
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < n; i++) {
        const x = 4 + (i + 0.5 + (row % 2) * 0.5) * step, y = y1 - r + row * r * 1.5 + (hash(i + row * 1000) - 0.5) * r * 0.4;
        if (y > H) continue;
        grainDot(g, x, y, r * (0.88 + 0.24 * hash(i * 7 + row)), D.shade(col, (hash(i * 3 + row) - 0.5) * 0.25), false);
      }
    }
    // 被挖起的顆粒
    if (b.bed === 'bedload' || b.bed === 'suspend') {
      movers.forEach(function (m) {
        const s = b.bed === 'suspend' ? m.s : 0.01 + 0.06 * Math.abs(Math.sin(m.ph));
        grainDot(g, xs(m.x), ys(s), r, col, false);
      });
    }
    // 上游放下來的顆粒
    incs.forEach(function (p) { if (!(p.done && !p.landed)) grainDot(g, xs(p.x), ys(p.s), r, col, true); });
    // 流速剖面（左邊）
    const px0 = 8, umax = uRatio(1);
    g.strokeStyle = D.alpha('#ffffff', 0.85); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(px0, y0 + 4); g.lineTo(px0, y1); g.stroke();
    const scale = (Lay.x0 - 18) / Math.max(1, umax);
    g.beginPath();
    for (let i = 0; i <= 40; i++) { const s = Math.pow(i / 40, 2), x = px0 + uRatio(Math.max(0.002, s)) * scale, y = ys(s); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.strokeStyle = C['st-flow'] === '' ? '#fff' : D.alpha('#ffffff', 0.95); g.lineWidth = 2; g.stroke();
    [0.15, 0.45, 0.8].forEach(function (s) { const x = px0 + uRatio(s) * scale; if (x > px0 + 6) D.arrow(g, px0, ys(s), x, ys(s), D.alpha('#ffffff', 0.9), 1.6); });
    D.haloText(g, T('流速剖面', 'Velocity profile'), px0 + 2, y0 + 12, C.text, 'left', 'middle', '600 10.5px ' + FONT);
    // 標籤
    const zoneCol = { erode: C['st-erode'], transport: C['st-move'], deposit: C['st-dep'] }[b.zone];
    pillIn(g, 'U = ' + speed(state.U) + T('，', ', ') + 'h = ' + num(state.h, 1) + ' m', W - 10, y0 + 24, C.text, 'right', '700 12px ' + FONT);
    const zMsg = b.zone === 'erode' ? (b.bed === 'suspend' ? T('河床的顆粒被帶上去懸浮', 'bed grains lifted into suspension') : T('河床的顆粒滾動、跳躍', 'bed grains roll and hop'))
      : b.zone === 'transport' ? T('河床不動，上游來的繼續走', 'the bed stays, grains from upstream keep going') : T('上游來的會停下來', 'grains from upstream settle out');
    pillIn(g, zoneTxt(b.zone) + T('：', ': ') + zMsg, W - 10, y0 + 48, zoneCol, 'right', '700 12px ' + FONT);
    pillIn(g, clsTxt(state.D) + ' ' + mmTxt(state.D) + (state.mineral !== 'quartz' ? T('（', ' (') + T(MIN[state.mineral].zh, MIN[state.mineral].en) + T('）', ')') : ''), 10, H - 10, col === '' ? C.text : C.text, 'left', '600 11.5px ' + FONT);
    D.haloText(g, T('顆粒畫得比實際大很多', 'Grains drawn far larger than scale'), W - 10, H - 18, C.muted, 'right', 'middle', '10.5px ' + FONT);
  }

  // ---------------------------------------------------------------------
  // 沉降水管
  // ---------------------------------------------------------------------
  function settleList() {
    const s = settle(), list = SC.SAMPLES.map(function (p) { return { id: p.id, name: T(p.zh, p.en), D: p.D, mineral: 'quartz', t: s.ref[p.id].t, w: s.ref[p.id].w, mine: false }; });
    list.push({ id: 'mine', name: T('你的', 'Yours'), D: state.D, mineral: state.mineral, t: s.me.t, w: s.me.w, mine: true });
    return list;
  }
  function settleClock(u) {
    const tEnd = Math.max.apply(null, settleList().map(function (p) { return p.t; })) * 1.02;
    const k = Math.max(1, Math.log10(tEnd / 0.3));
    return tEnd * (Math.pow(10, k * u) - 1) / (Math.pow(10, k) - 1);
  }
  function drawSettle(g, W, H) {
    D.backdrop(g, W, H);
    const list = settleList(), run = state.run.settle;
    const t = run ? settleClock(run.done ? 1 : run.u) : 0;
    const n = list.length, x0 = 14, x1 = W - 14, cw = (x1 - x0) / n, tw = Math.min(46, cw * 0.62);
    const yTop = 52, yBot = H - 62;
    D.haloText(g, T('水管高 1 m，水溫 ', 'Column 1 m tall, water at ') + num(state.T, 1) + ' °C', x0, 18, C.text, 'left', 'middle', '700 12px ' + FONT);
    if (cw < 60) D.haloText(g, T('粒徑（mm）', 'Size (mm)'), x0, yBot + 47 + (run ? 0 : 14), C.muted, 'left', 'middle', '10px ' + FONT);
    pillIn(g, T('經過 ', 'Elapsed ') + (run ? dur(t) : '0'), x1, 30, C.text, 'right', '700 12px ' + FONT);
    list.forEach(function (p, i) {
      const cx = x0 + cw * (i + 0.5), col = grainColor(p.D, p.mineral), r = Math.min(rVis(p.D), tw / 2 - 3);
      // 玻璃管
      D.roundRect(g, cx - tw / 2, yTop, tw, yBot - yTop, 6);
      const wg = g.createLinearGradient(cx - tw / 2, 0, cx + tw / 2, 0);
      wg.addColorStop(0, D.alpha(C['st-water0'], 0.55)); wg.addColorStop(0.5, D.alpha(C['st-water0'], 0.3)); wg.addColorStop(1, D.alpha(C['st-water1'], 0.5));
      g.fillStyle = wg; g.fill();
      g.strokeStyle = D.alpha(C.text, p.mine ? 0.75 : 0.35); g.lineWidth = p.mine ? 2 : 1.2; g.stroke();
      if (p.mine) { g.strokeStyle = C['st-mine']; g.lineWidth = 1.5; D.roundRect(g, cx - tw / 2 - 3, yTop - 3, tw + 6, yBot - yTop + 6, 8); g.stroke(); }
      // 顆粒（一小撮）
      const f = run ? Math.min(1, p.w * t) : 0, y = yTop + 8 + r + f * (yBot - yTop - 16 - 2 * r);
      const k = r > 6 ? 1 : r > 3 ? 3 : 5;
      for (let j = 0; j < k; j++) grainDot(g, cx + (j - (k - 1) / 2) * (r * 1.6 + 1), y + (j % 2) * r * 0.6, r, col, false);
      // 到了：顯示時間
      if (run && f >= 1) pillIn(g, shortDur(p.t), cx, yBot - 8 - 2 * r - 6, p.mine ? C['st-mine'] : C.text, 'center', '700 10.5px ' + FONT);
      D.haloText(g, cw < 60 && EN ? (SHORT_EN[p.id] || p.name) : p.name, cx, yBot + 16, p.mine ? C['st-mine'] : C.text, 'center', 'middle', '700 ' + (cw < 52 ? 10 : 11.5) + 'px ' + FONT);
      D.haloText(g, cw < 60 ? sig(p.D * 1000, 2) : mmTxt(p.D), cx, yBot + 32, C.muted, 'center', 'middle', (cw < 52 ? 9.5 : 10.5) + 'px ' + FONT);
      if (!run) D.haloText(g, shortDur(p.t), cx, yBot + 47, C.muted, 'center', 'middle', (cw < 52 ? 9.5 : 10.5) + 'px ' + FONT);
    });
    if (!run) D.haloText(g, T('按「放下顆粒」：大顆的先到底，細的最後才到', 'Press “Drop the grains”: the big ones land first, the fine ones last'), W / 2, yTop - 12, C.muted, 'center', 'middle', '11px ' + FONT);
  }

  // ---------------------------------------------------------------------
  // 從山到海
  // ---------------------------------------------------------------------
  function riverLay(W, H) {
    const x0 = 16, x1 = W - (W < 560 ? 40 : 90), yTop = 60, yBot = H - 96;
    return { x0: x0, x1: x1, yTop: yTop, yBot: yBot, sea: W };
  }
  /** 河床高度：上凹的縱剖面 */
  function riverY(Lay, x) { return Lay.yTop + (Lay.yBot - Lay.yTop) * (1 - Math.pow(1 - x, 2.4)); }
  function riverList() {
    const r = river(), list = SC.SAMPLES.map(function (s) { return { id: s.id, name: T(s.zh, s.en), D: s.D, mineral: 'quartz', st: r.xs[s.id], mine: false }; });
    list.push({ id: 'mine', name: T('你的', 'Yours'), D: state.D, mineral: state.mineral, st: r.me, mine: true });
    return list;
  }
  function drawRiver(g, W, H) {
    const Lay = riverLay(W, H), run = state.run.river, u = run ? (run.done ? 1 : run.u) : 0;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, C['st-sky0']); sky.addColorStop(1, C['st-sky1']);
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const X = function (x) { return Lay.x0 + x * (Lay.x1 - Lay.x0); };
    // 海
    const seaY = riverY(Lay, 1) - 4;
    g.fillStyle = D.alpha(C['st-water1'], 0.85); g.fillRect(X(1), seaY, W - X(1), H - seaY);
    // 山與地面
    g.beginPath(); g.moveTo(0, H); g.lineTo(0, Lay.yTop - 30); g.lineTo(X(0), Lay.yTop - 6);
    for (let i = 0; i <= 80; i++) { const x = i / 80; g.lineTo(X(x), riverY(Lay, x) + 4); }
    g.lineTo(X(1) + 6, H); g.closePath();
    const lg = g.createLinearGradient(0, Lay.yTop, 0, H);
    lg.addColorStop(0, C['st-bank']); lg.addColorStop(1, C['st-bank2']);
    g.fillStyle = lg; g.fill();
    // 河水（越下游越寬越慢：線越粗）
    g.lineCap = 'round';
    for (let i = 0; i < 80; i++) {
      const xa = i / 80, xb = (i + 1) / 80, uu = SC.riverU(xa, state.U0);
      g.strokeStyle = D.alpha(C['st-water1'], 0.9); g.lineWidth = 3 + 7 * xa;
      g.beginPath(); g.moveTo(X(xa), riverY(Lay, xa)); g.lineTo(X(xb), riverY(Lay, xb)); g.stroke();
      if (i % 8 === 4) {
        const xx = X(xa), yy = riverY(Lay, xa) - 10 - 2 * xa;
        const L = 6 + 20 * Math.min(1, uu / 3);
        if (uu > 0.08) D.arrow(g, xx - L / 2, yy, xx + L / 2, yy + (riverY(Lay, xb) - riverY(Lay, xa)), C['st-flow'], 1.4);
      }
    }
    // 沉積物：每種顆粒停的位置
    const list = riverList();
    list.forEach(function (p, i) {
      const st = p.st, col = grainColor(p.D, p.mineral), r = Math.min(7, rVis(p.D));
      if (!st.picked) {
        // 挖不起來：留在山上
        grainDot(g, X(0) + 4 + i * 2, riverY(Lay, 0) - r, r, col, p.mine);
        return;
      }
      const xStop = st.x == null ? 1.08 : st.x;
      let x = run ? Math.min(xStop, u * 1.15 - i * 0.012) : -1;
      if (x < 0) return;
      const atStop = x >= xStop - 1e-9;
      if (st.x == null && atStop) {
        // 帶進海裡：在海面附近擴散
        const sx = X(1) + 8 + (W - X(1) - 16) * (0.2 + 0.12 * i);
        for (let j = 0; j < 7; j++) grainDot(g, sx + (hash(j + i * 10) - 0.5) * 30, seaY + 10 + hash(j * 3 + i) * (H - seaY - 30), Math.max(1.2, r * 0.8), col, p.mine && j === 0);
        return;
      }
      const xs = X(Math.min(1, x)), ys = riverY(Lay, Math.min(1, x)) - (atStop ? r - 1 : r + 3 + 3 * Math.abs(Math.sin(x * 40)));
      if (atStop) for (let j = -1; j <= 1; j++) grainDot(g, xs + j * (r * 1.8 + 1), ys + (j ? 2 : 0), r, col, p.mine && j === 0);
      else grainDot(g, xs, ys, r, col, p.mine);
    });
    // 標籤：山、海、流速
    D.haloText(g, T('山區', 'Mountains'), X(0) + 4, Lay.yTop - 40, C.text, 'left', 'middle', '700 12px ' + FONT);
    D.haloText(g, T('海', 'Sea'), W - 10, seaY - 12, C.text, 'right', 'middle', '700 12px ' + FONT);
    pillIn(g, T('山上 ', 'Mountains ') + sig(state.U0, 3) + ' m/s', X(0) + 60, Lay.yTop - 4, C['st-flow'], 'left', '700 11.5px ' + FONT);
    pillIn(g, T('海口 ', 'Mouth ') + sig(SC.U_SEA, 2) + ' m/s', X(1), seaY - 24, C['st-flow'], 'right', '700 11.5px ' + FONT);
    // 圖例（放不下就換行）
    g.font = '600 11px ' + FONT;
    let lx = 10, ly = H - 70;
    list.forEach(function (p) {
      const w = g.measureText(p.name).width + 22;
      if (lx > 10 && lx + w > W - 8) { lx = 10; ly += 20; }
      grainDot(g, lx + 6, ly, 4.5, grainColor(p.D, p.mineral), p.mine);
      D.haloText(g, p.name, lx + 14, ly, C.text, 'left', 'middle', '600 11px ' + FONT);
      lx += w + 6;
    });
    if (!run) D.haloText(g, T('按「放流」：看各種顆粒停在哪裡', 'Press “Release”: see where each grain stops'), W / 2, H - 16, C.muted, 'center', 'middle', '11px ' + FONT);
    else D.haloText(g, T('距離只是示意；顆粒畫得比實際大很多', 'Distances are schematic; grains drawn far larger than scale'), W / 2, H - 16, C.muted, 'center', 'middle', '10.5px ' + FONT);
  }

  // =====================================================================
  // 下方的圖
  // =====================================================================
  function frame0(W, H) { return { x0: 58, x1: W - 16, y0: 20, y1: H - 34 }; }
  function axisBox(g, Fm) { g.strokeStyle = D.alpha(C.text, 0.45); g.lineWidth = 1; g.strokeRect(Fm.x0, Fm.y0, Fm.x1 - Fm.x0, Fm.y1 - Fm.y0); }
  function drawChart() {
    const g = gtx, W = grSize.w, H = grSize.h;
    g.clearRect(0, 0, W, H);
    D.backdrop(g, W, H);
    if (state.mode === 'bed') chartHjul(g, W, H);
    else if (state.mode === 'settle') { if (state.chart.settle === 'a') chartW(g, W, H); else chartTime(g, W, H); }
    else chartRiver(g, W, H);
  }
  function logAxes(g, Fm, lx0, lx1, ly0, ly1, xlab, ylab, xTicks, yTicks) {
    const xx = function (v) { return Fm.x0 + (Math.log10(v) - lx0) / (lx1 - lx0) * (Fm.x1 - Fm.x0); };
    const yy = function (v) { return Fm.y1 - (Math.log10(v) - ly0) / (ly1 - ly0) * (Fm.y1 - Fm.y0); };
    g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1;
    xTicks.forEach(function (v) { const x = xx(v); g.beginPath(); g.moveTo(x, Fm.y0); g.lineTo(x, Fm.y1); g.stroke(); D.haloText(g, String(v), x, Fm.y1 + 12, C.muted, 'center', 'middle', '10px ' + FONT); });
    yTicks.forEach(function (v) { const y = yy(v); g.beginPath(); g.moveTo(Fm.x0, y); g.lineTo(Fm.x1, y); g.stroke(); D.haloText(g, String(v), Fm.x0 - 6, y, C.muted, 'right', 'middle', '10px ' + FONT); });
    D.haloText(g, xlab, (Fm.x0 + Fm.x1) / 2, Fm.y1 + 27, C.muted, 'center', 'middle', '600 10.5px ' + FONT);
    D.haloText(g, ylab, 6, 10, C.muted, 'left', 'middle', '600 10.5px ' + FONT);
    return { xx: xx, yy: yy };
  }
  /** Hjulström–Sundborg 圖 */
  function chartHjul(g, W, H) {
    const Fm = frame0(W, H), cu = curve(), b = bed();
    const ax = logAxes(g, Fm, -3, 2.301, -3, 1, T('粒徑（mm）', 'Grain size (mm)'), T('平均流速（m/s）', 'Mean speed (m/s)'),
      W < 520 ? [0.001, 0.1, 10] : [0.001, 0.01, 0.1, 1, 10, 100], [0.001, 0.01, 0.1, 1, 10]);
    const xx = ax.xx, yy = function (v) { return ax.yy(Math.max(1e-3, Math.min(10, v))); };
    g.save(); g.beginPath(); g.rect(Fm.x0, Fm.y0, Fm.x1 - Fm.x0, Fm.y1 - Fm.y0); g.clip();
    // 區域
    const poly = function (fa, fb, color) {
      g.beginPath();
      cu.pts.forEach(function (p, i) { const x = xx(Math.pow(10, p.lg)), y = fa(p); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      for (let i = cu.pts.length - 1; i >= 0; i--) { const p = cu.pts[i]; g.lineTo(xx(Math.pow(10, p.lg)), fb(p)); }
      g.closePath(); g.fillStyle = color; g.fill();
    };
    poly(function () { return Fm.y0; }, function (p) { return yy(p.Ue); }, D.alpha(C['st-erode'], 0.12));
    poly(function (p) { return yy(p.Ue); }, function (p) { return yy(p.Ud); }, D.alpha(C['st-move'], 0.12));
    poly(function (p) { return yy(p.Ud); }, function () { return Fm.y1; }, D.alpha(C['st-dep'], 0.12));
    // 參考：鬆散石英、水深 1 m
    if (state.mineral !== 'quartz' || state.consol !== 1 || Math.abs(state.h - 1) > 1e-9 || state.shape !== 'natural') {
      g.strokeStyle = D.alpha(C.text, 0.4); g.setLineDash([4, 4]); g.lineWidth = 1.2; g.beginPath();
      cu.pts.forEach(function (p, i) { const Ue = SC.grain({ D: Math.pow(10, p.lg) / 1000, h: 1, T: T_BED }).Ue, x = xx(Math.pow(10, p.lg)), y = yy(Ue); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke(); g.setLineDash([]);
    }
    const line = function (key, color, w) {
      g.strokeStyle = color; g.lineWidth = w; g.beginPath();
      cu.pts.forEach(function (p, i) { const x = xx(Math.pow(10, p.lg)), y = yy(p[key]); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
    };
    line('Ue', C['st-erode'], 2.4); line('Ud', C['st-dep'], 2.2);
    g.restore();
    // 區域名稱
    D.haloText(g, T('侵蝕', 'Erosion'), xx(0.02), yy(3), C['st-erode'], 'center', 'middle', '700 12px ' + FONT);
    D.haloText(g, T('搬運', 'Transport'), xx(0.02), yy(0.06), C['st-move'], 'center', 'middle', '700 12px ' + FONT);
    D.haloText(g, T('沉積', 'Deposition'), xx(20), yy(0.01), C['st-dep'], 'center', 'middle', '700 12px ' + FONT);
    // 最低點
    D.ball(g, xx(cu.minD), yy(cu.minU), 3, C['st-erode'], { shadow: false });
    // 目前的點
    const x = xx(state.D * 1000), y = yy(state.U);
    const zc = { erode: C['st-erode'], transport: C['st-move'], deposit: C['st-dep'] }[b.zone];
    g.strokeStyle = D.alpha(zc, 0.6); g.setLineDash([3, 3]); g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, Fm.y1); g.lineTo(x, y); g.stroke(); g.setLineDash([]);
    D.ball(g, x, y, 6, zc, { shadow: false, ring: '#ffffff' });
    pillIn(g, zoneTxt(b.zone), x + 10, Math.max(Fm.y0 + 18, y - 8), zc, x > Fm.x1 - 80 ? 'right' : 'left', '700 11px ' + FONT);
    axisBox(g, Fm);
  }
  /** 沉降速度對粒徑 */
  function chartW(g, W, H) {
    const Fm = frame0(W, H), Tc = state.T, rw = SC.rhoW(Tc), nu = SC.mu(Tc) / rw, R = SC.RHO_QUARTZ / rw - 1;
    const ax = logAxes(g, Fm, -3, 2.301, -7, 1, T('粒徑（mm）', 'Grain size (mm)'), T('沉降速度（m/s）', 'Settling velocity (m/s)'),
      W < 520 ? [0.001, 0.1, 10] : [0.001, 0.01, 0.1, 1, 10, 100], [1e-6, 1e-4, 0.01, 1].map(function (v) { return v; }));
    const xx = ax.xx, yy = function (v) { return ax.yy(Math.max(1e-9, Math.min(1e3, v))); };
    g.save(); g.beginPath(); g.rect(Fm.x0, Fm.y0, Fm.x1 - Fm.x0, Fm.y1 - Fm.y0); g.clip();
    const plot = function (f, color, w, dash) {
      g.strokeStyle = color; g.lineWidth = w; g.setLineDash(dash || []); g.beginPath();
      for (let i = 0; i <= 160; i++) { const lg = -3 + 5.301 * i / 160, d = Math.pow(10, lg) / 1000, x = xx(d * 1000), y = yy(f(d)); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke(); g.setLineDash([]);
    };
    plot(function (d) { return SC.stokes(d, R, nu); }, D.alpha(C.muted, 0.8), 1.4, [5, 4]);
    plot(function (d) { return SC.newton(d, R, 1); }, D.alpha(C.muted, 0.8), 1.4, [2, 4]);
    plot(function (d) { return SC.settle(d, R, nu, 1); }, C['st-move'], 2.4);
    if (state.mineral !== 'quartz' || state.shape !== 'natural') plot(function (d) { return SC.settle(d, MIN[state.mineral].rho / rw - 1, nu, C2()); }, C['st-mine'], 1.8);
    g.restore();
    D.haloText(g, T('史托克斯', 'Stokes'), xx(0.004), yy(SC.stokes(0.004e-3, R, nu)) - 14, C.muted, 'left', 'middle', '10.5px ' + FONT);
    D.haloText(g, T('牛頓阻力', 'Newton drag'), xx(60), yy(SC.newton(60e-3, R, 1)) - 12, C.muted, 'right', 'middle', '10.5px ' + FONT);
    SC.SAMPLES.forEach(function (s) { const w = SC.settle(s.D, R, nu, 1); D.ball(g, xx(s.D * 1000), yy(w), 3.5, grainColor(s.D, 'quartz'), { shadow: false }); });
    const me = settle().me, x = xx(state.D * 1000), y = yy(me.w);
    D.ball(g, x, y, 6, C['st-mine'], { shadow: false, ring: '#ffffff' });
    pillIn(g, speed(me.w), x + 10, Math.max(Fm.y0 + 18, y - 8), C['st-mine'], x > Fm.x1 - 90 ? 'right' : 'left', '700 11px ' + FONT);
    axisBox(g, Fm);
  }
  /** 沉 1 m 的時間對粒徑：0、20、40 °C */
  function chartTime(g, W, H) {
    const Fm = frame0(W, H);
    const ax = logAxes(g, Fm, -3, 2.301, -1, 7, T('粒徑（mm）', 'Grain size (mm)'), T('沉 1 m 的時間（秒）', 'Time to fall 1 m (s)'),
      W < 520 ? [0.001, 0.1, 10] : [0.001, 0.01, 0.1, 1, 10, 100], [1, 100, 1e4, 1e6].map(function (v) { return v; }));
    const xx = ax.xx, yy = function (v) { return ax.yy(Math.max(0.1, Math.min(1e7, v))); };
    // 時間的參考線
    [[60, T('1 分', '1 min')], [3600, T('1 小時', '1 h')], [86400, T('1 天', '1 day')]].forEach(function (q) {
      const y = yy(q[0]); g.strokeStyle = D.alpha(C.text, 0.18); g.setLineDash([2, 4]); g.beginPath(); g.moveTo(Fm.x0, y); g.lineTo(Fm.x1, y); g.stroke(); g.setLineDash([]);
      D.haloText(g, q[1], Fm.x1 - 4, y - 7, C.muted, 'right', 'middle', '10px ' + FONT);
    });
    g.save(); g.beginPath(); g.rect(Fm.x0, Fm.y0, Fm.x1 - Fm.x0, Fm.y1 - Fm.y0); g.clip();
    [[0, '#2563eb'], [20, C['st-move']], [40, C['st-erode']]].forEach(function (q, k) {
      const s = function (d) { return settleOf(d, SC.RHO_QUARTZ, 1, q[0]).t; };
      g.strokeStyle = k === 1 ? C['st-move'] : D.alpha(k === 0 ? '#38bdf8' : C['st-erode'], 0.85); g.lineWidth = k === 1 ? 2.2 : 1.6; g.setLineDash(k === 1 ? [] : [5, 3]); g.beginPath();
      for (let i = 0; i <= 120; i++) { const lg = -3 + 5.301 * i / 120, d = Math.pow(10, lg) / 1000, x = xx(d * 1000), y = yy(s(d)); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke(); g.setLineDash([]);
    });
    g.restore();
    D.haloText(g, T('虛線：0 °C（上）與 40 °C（下）', 'Dashed: 0 °C (upper) and 40 °C (lower)'), Fm.x0 + 8, Fm.y1 - 10, C.muted, 'left', 'middle', '10.5px ' + FONT);
    const me = settle().me, x = xx(state.D * 1000), y = yy(me.t);
    D.ball(g, x, y, 6, C['st-mine'], { shadow: false, ring: '#ffffff' });
    pillIn(g, dur(me.t), x + 10, Math.max(Fm.y0 + 18, y - 8), C['st-mine'], x > Fm.x1 - 90 ? 'right' : 'left', '700 11px ' + FONT);
    axisBox(g, Fm);
  }
  /** 沿河的流速與各顆粒的沉積流速 */
  function chartRiver(g, W, H) {
    const Fm = frame0(W, H), list = riverList();
    const xx = function (x) { return Fm.x0 + x * (Fm.x1 - Fm.x0); };
    const ly0 = -2, ly1 = Math.log10(6);
    const yy = function (v) { return Fm.y1 - (Math.log10(Math.max(0.01, Math.min(6, v))) - ly0) / (ly1 - ly0) * (Fm.y1 - Fm.y0); };
    g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1;
    [0.01, 0.1, 1].forEach(function (v) { const y = yy(v); g.beginPath(); g.moveTo(Fm.x0, y); g.lineTo(Fm.x1, y); g.stroke(); D.haloText(g, String(v), Fm.x0 - 6, y, C.muted, 'right', 'middle', '10px ' + FONT); });
    D.haloText(g, T('山區', 'Mountains'), Fm.x0, Fm.y1 + 12, C.muted, 'left', 'middle', '10.5px ' + FONT);
    D.haloText(g, T('海口', 'River mouth'), Fm.x1, Fm.y1 + 12, C.muted, 'right', 'middle', '10.5px ' + FONT);
    D.haloText(g, T('沿著河流往下游', 'Downstream along the river'), (Fm.x0 + Fm.x1) / 2, Fm.y1 + 27, C.muted, 'center', 'middle', '600 10.5px ' + FONT);
    D.haloText(g, T('流速（m/s）', 'Speed (m/s)'), 6, 10, C.muted, 'left', 'middle', '600 10.5px ' + FONT);
    g.save(); g.beginPath(); g.rect(Fm.x0, Fm.y0, Fm.x1 - Fm.x0, Fm.y1 - Fm.y0); g.clip();
    list.forEach(function (p) {
      const Ud = p.st.gr.Ud, y = yy(Ud), col = grainColor(p.D, p.mineral);
      g.strokeStyle = D.alpha(p.mine ? C['st-mine'] : col, 0.85); g.setLineDash([4, 3]); g.lineWidth = p.mine ? 1.8 : 1.3;
      g.beginPath(); g.moveTo(Fm.x0, y); g.lineTo(Fm.x1, y); g.stroke(); g.setLineDash([]);
    });
    g.strokeStyle = C['st-flow']; g.lineWidth = 2.6; g.beginPath();
    for (let i = 0; i <= 100; i++) { const x = i / 100, y = yy(SC.riverU(x, state.U0)); if (i) g.lineTo(xx(x), y); else g.moveTo(xx(x), y); }
    g.stroke();
    g.restore();
    const placed = [];
    g.font = '10px ' + FONT;
    list.forEach(function (p) {
      const st = p.st, col = grainColor(p.D, p.mineral), y = yy(st.gr.Ud) - 7, w = g.measureText(p.name).width;
      if (st.picked && st.x != null) D.ball(g, xx(st.x), yy(st.gr.Ud), p.mine ? 5.5 : 4, p.mine ? C['st-mine'] : col, { shadow: false, ring: '#ffffff' });
      let xr = Fm.x1 - 4;
      for (let k = 0; k < placed.length; k++) { const q = placed[k]; if (Math.abs(q.y - y) < 11 && xr > q.xl - 6 && xr - w < q.xr + 6) { xr = q.xl - 8; k = -1; } }
      placed.push({ y: y, xl: xr - w, xr: xr });
      D.haloText(g, p.name, xr, y, p.mine ? C['st-mine'] : C.muted, 'right', 'middle', '10px ' + FONT);
    });
    axisBox(g, Fm);
  }

  // =====================================================================
  // 動畫
  // =====================================================================
  let raf = 0, lastFrame = 0, clock = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function continuous() { return state.mode === 'bed' && !D.reducedMotion() && !document.hidden; }
  function frame(ts) {
    raf = 0;
    const dt = lastFrame ? Math.min(0.1, (ts - lastFrame) / 1000) : 0;
    lastFrame = ts; clock += dt;
    const run = state.run[state.mode];
    if (run && run.playing) stepRun(dt);
    if (state.mode === 'bed' && (continuous() || (run && run.playing))) stepBed(dt);
    drawMain(); drawChart();
    if ((run && run.playing) || continuous()) requestDraw(); else lastFrame = 0;
  }
  function drawMain() {
    const W = cvSize.w, H = cvSize.h, g = ctx;
    g.clearRect(0, 0, W, H);
    if (state.mode === 'bed') drawBed(g, W, H);
    else if (state.mode === 'settle') drawSettle(g, W, H);
    else drawRiver(g, W, H);
  }
  function sound() { const Ls = window.LabSound; return Ls && Ls.enabled() ? Ls : null; }
  function startRun() {
    acted();
    const m = state.mode, run = state.run[m];
    if (run && !run.done && !run.playing) { run.playing = true; updateButtons(); requestDraw(); return; }
    if (run && run.playing) return;
    state.run[m] = { u: 0, playing: true, done: false, seen: {} };
    if (m === 'bed') {
      incs = [];
      for (let i = 0; i < 24; i++) incs.push({ x: 0.02 + Math.random() * 0.16, s: 0.35 + 0.5 * Math.random(), ph: Math.random() * 6, vy: 0, rest: 0.002 + 0.01 * Math.random(), done: false, landed: false });
      setStatus(T('從上游放下一把同樣的顆粒（有粉紅色圈的）……', 'A handful of the same grains (pink rings) enters from upstream…'));
    } else if (m === 'settle') setStatus(T('七種顆粒同時放進水管……時鐘越走越快。', 'Seven kinds of grain dropped at once… the clock speeds up.'));
    else setStatus(T('一場大雨，泥沙從山上沖下來……', 'Heavy rain washes the load down from the mountains…'));
    const snd = sound(); if (snd) snd.sweep({ from: 700, to: 400, dur: 0.3, gain: 0.04 });
    updateButtons(); afterChange(true); requestDraw();
  }
  function stepRun(dt) {
    const m = state.mode, run = state.run[m];
    run.u = Math.min(1, run.u + dt / DUR[m]);
    const snd = sound();
    if (m === 'settle') {
      const t = settleClock(run.u);
      settleList().forEach(function (p, i) { if (!run.seen[p.id] && p.w * t >= 1) { run.seen[p.id] = true; if (snd) snd.tone({ freq: 1400 - i * 120, dur: 0.07, type: 'triangle', gain: 0.04 }); } });
    }
    if (m === 'bed') {
      const left = incs.filter(function (p) { return !p.done; }).length;
      // 時間到了還有顆粒在走：最多再等 4 秒（很慢的水流裡顆粒要走很久）
      if (run.u >= 1 && left > 0) { run.wait = (run.wait || 0) + dt; run.u = run.wait > 4 ? 1 : 0.999; }
    }
    if (run.u >= 1) finishRun();
  }
  function finishRun() {
    const m = state.mode, run = state.run[m];
    run.u = 1; run.playing = false; run.done = true;
    const snd = sound();
    if (snd) { snd.tone({ freq: 1046, dur: 0.12, type: 'triangle', gain: 0.05 }); snd.tone({ freq: 1568, dur: 0.16, type: 'triangle', gain: 0.04, delay: 0.1 }); }
    if (m === 'bed') {
      const b = bed();
      setStatus(b.inc === 'deposit' ? T('流速太慢，上游來的顆粒停下來沉積在河床上。', 'Too slow: the grains from upstream settle on the bed.')
        : b.zone === 'transport' ? T('上游來的顆粒繼續被帶走，河床上的卻沒被挖起：這就是「搬運」區。', 'The grains from upstream keep going, but the bed is not eroded: the transport zone.')
          : T('上游來的顆粒被帶走，河床也一直被侵蝕。', 'The grains from upstream are carried away and the bed is being eroded.'));
    } else if (m === 'settle') {
      const s = settle();
      setStatus(T('全部到底了。你的顆粒沉 1 m 花了 ', 'All landed. Your grain took ') + dur(s.me.t) + T('；大顆的先到、細的後到，底下排成下粗上細的級層。', ' to fall 1 m; the big ones land first and the fine ones last, building a graded bed.'));
      updateArr();
    } else {
      setStatus(T('礫石停在山區、砂停在平原、細泥一路帶進海裡：河流把泥沙依大小分選。', 'Gravel stops in the mountains, sand on the plain, and fine mud reaches the sea: the river sorts its load.'));
    }
    updateButtons(); updateReadouts();
    emit('run', snapshot());
  }
  function pauseRun() { const run = state.run[state.mode]; if (!run || run.done) return; run.playing = !run.playing; updateButtons(); afterChange(true); requestDraw(); }
  function cancelRun(m) { m = m || state.mode; if (state.run[m]) { state.run[m] = null; if (m === 'bed') incs = []; updateButtons(); } }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function snapshot() {
    const b = bed(), cu = curve(), s = settle(), r = river(), run = state.run[state.mode];
    const tS = {}, xs = {};
    SC.SAMPLES.forEach(function (p) { tS[p.id] = s.ref[p.id].t; const q = r.xs[p.id]; xs[p.id] = q.picked ? q.x : -1; });
    return {
      mode: state.mode, D: state.D * 1000, mineral: state.mineral, shape: state.shape, sample: state.sample || '', cls: SC.classOf(state.D).id,
      U: state.U, h: state.h, consol: state.consol, bed: b.bed, inc: b.inc, zone: b.zone, Ue: b.gr.Ue, Ud: b.gr.Ud, us: b.us, w: b.gr.w, rouse: b.rouse,
      UeQ: SC.grain({ D: state.D, h: state.h, T: T_BED }).Ue, qBed: SC.fate({ D: state.D, h: state.h, T: T_BED }, state.U, false).state, UeH1: SC.grain(opt({ h: 1 })).Ue, UeMin: cu.minU, DMin: cu.minD,
      T: state.T, wS: s.me.w, t: s.me.t, t20: s.t20, Rep: s.me.Rep, tS: tS,
      U0: state.U0, picked: r.me.picked, x: r.me.picked ? r.me.x : -1, xs: xs,
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
    const mm = state.D * 1000;
    setOut(el.size, outNum(mm, 0, mm < 0.01 ? 4 : mm < 1 ? 3 : mm < 10 ? 2 : 1));
    setOut(el.vel, outNum(state.U, 0, state.U < 0.01 ? 4 : state.U < 1 ? 3 : 2));
    setOut(el.depth, num(state.h, 1));
    setOut(el.temp, outNum(state.T, 0, 1));
    setOut(el.u0, num(state.U0, 2));
    const pr = function (sel, attr, v) { document.querySelectorAll(sel).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(v))); }); };
    pr('#modeSeg button', 'data-mode', state.mode);
    pr('#chartSeg button', 'data-chart', state.chart[state.mode]);
    pr('#sampleSeg button', 'data-s', state.sample);
    pr('#minSeg button', 'data-m', state.mineral);
    pr('#shapeSeg button', 'data-shape', state.shape);
    pr('#consolSeg button', 'data-c', state.consol);
    $('bedPanel').hidden = state.mode !== 'bed';
    $('settlePanel').hidden = state.mode !== 'settle';
    $('riverPanel').hidden = state.mode !== 'river';
  }
  function chartNames() {
    const n = { bed: [T('Hjulström–Sundborg 圖', 'Hjulström–Sundborg diagram'), ''], settle: [T('沉降速度', 'Settling velocity'), T('沉 1 m 要多久', 'Time to fall 1 m')], river: [T('沿河的流速', 'Speed along the river'), ''] }[state.mode];
    const bs = document.querySelectorAll('#chartSeg button');
    bs[0].textContent = n[0]; bs[1].textContent = n[1]; bs[1].hidden = !n[1];
  }
  function updateReadouts() {
    chartNames();
    const c = SC.classOf(state.D);
    setHTML('clsHint', T('粒徑分級：', 'Size class: ') + '<b>' + T(c.zh, c.en) + '</b>' + T('（Wentworth）', ' (Wentworth)') + T('；', '; ') + T('密度 ', 'density ') + MIN[state.mineral].rho + ' kg/m<sup>3</sup>');
    if (state.mode === 'bed') {
      const b = bed(), gg = b.gr;
      setHTML('bZone', zoneTxt(b.zone));
      setHTML('bBed', stateTxt(b.bed));
      setHTML('bInc', stateTxt(b.inc));
      setHTML('bUe', speed(gg.Ue));
      setHTML('bUd', speed(gg.Ud));
      setHTML('bUs', speed(b.us));
      setHTML('bW', speed(gg.w));
      setHTML('cvHint', T('河道的側面（水深與顆粒都不是真實比例）。左邊白線是流速剖面：貼近河床最慢、往上越快。河床被挖起的顆粒會滾動、跳躍（推移）或被亂流帶上去（懸浮）。按「從上游放一把」，看本來就在水裡的同樣顆粒會繼續走還是停下來。河床與河流的水溫都是 20 °C。', 'Side view of the channel (depth and grains not to scale). The white line on the left is the velocity profile: slowest at the bed, faster above. Grains picked off the bed roll and hop (bedload) or are lifted by turbulence (suspension). Press “Add a handful from upstream” to see whether the same grains, already moving, keep going or stop. The water is at 20 °C here.'));
      setHTML('chartHint', T('紅線以上：河床被侵蝕；紅線與綠線之間：已經在移動的顆粒繼續被搬運，但河床不會被挖起；綠線以下：沉積。紅線的最低點（小紅點）就是最容易被侵蝕的粒徑。灰色虛線是鬆散石英、水深 1 m 的參考。', 'Above the red line the bed is eroded; between the red and green lines grains already moving are carried but the bed is left alone; below the green line they are deposited. The lowest point of the red line (small dot) is the easiest grain size to erode. Grey dashed: loose quartz in 1 m of water, for reference.'));
    } else if (state.mode === 'settle') {
      const s = settle();
      setHTML('sT', dur(s.me.t));
      setHTML('sW', speed(s.me.w));
      setHTML('sSt', speed(s.me.wSt) + (s.me.wSt > 1.5 * s.me.w ? T('（太大了）', ' (far too fast)') : ''));
      setHTML('sRe', sig(s.me.Rep, 3) + (s.me.Rep < 1 ? T('（史托克斯定律適用）', ' (Stokes’ law holds)') : ''));
      setHTML('sMu', sig(s.me.mu * 1000, 3) + ' mPa·s');
      setHTML('cvHint', T('七支 1 m 高的水管，左邊六支是石英的參考顆粒，最右邊（粉紅框）是你的顆粒。時鐘先慢後快：礫石不到一秒就到底，黏土要好幾天。', 'Seven columns 1 m tall: six quartz reference grains and, on the right (pink frame), your grain. The clock starts slow and speeds up: gravel lands in under a second, clay takes days.'));
      setHTML('chartHint', state.chart.settle === 'a'
        ? T('實線是天然石英顆粒（Ferguson–Church）；細粒沿著史托克斯定律（斜率 2），粗粒沿著牛頓阻力（斜率 1/2）。粉紅線是你選的礦物或形狀。', 'Solid: natural quartz grains (Ferguson–Church); fine grains follow Stokes’ law (slope 2), coarse ones Newton drag (slope 1/2). Pink: your mineral or shape.')
        : T('同樣的顆粒在 0 °C 的水裡沉得比 40 °C 慢：冷水比較黏。粗顆粒幾乎不受影響。', 'The same grain falls more slowly in water at 0 °C than at 40 °C: cold water is more viscous. Coarse grains hardly care.'));
    } else {
      const r = river();
      setHTML('stopLog', riverList().map(function (p) {
        const st = p.st, tx = !st.picked ? T('挖不起來，留在山上', 'too heavy to pick up; stays in the mountains') : st.x == null ? T('一路帶進海裡', 'carried all the way to the sea') : T('停在下游 ', 'stops ') + Math.round(st.x * 100) + T(' % 的地方', ' % of the way down');
        return '<span class="dot" style="background:' + (p.mine ? C['st-mine'] : grainColor(p.D, p.mineral)) + '"></span>' + p.name + T('（', ' (') + mmTxt(p.D) + T('）：', '): ') + '<b>' + tx + '</b>';
      }).join('<br>'));
      setHTML('cvHint', T('河流的縱剖面：從山區到海口，流速越來越慢。按「放流」，各種顆粒從山上出發，在流速降到它的沉積流速的地方停下來。最右邊一種是你的顆粒（粉紅圈）。', 'The long profile of a river: the flow slows from the mountains to the sea. Press “Release” and each kind of grain sets off, stopping where the speed falls below its deposition speed. The last one is your grain (pink ring).'));
      setHTML('chartHint', T('藍線是沿河的流速；虛線是各種顆粒停下來的流速。藍線降到虛線的地方，就是那種顆粒沉積的位置。', 'Blue: the flow speed along the river; dashed: the speed at which each grain stops. Where the blue line drops below a dashed line, that grain is deposited.'));
    }
    cv.setAttribute('aria-label', state.mode === 'bed' ? T('河床上的顆粒：', 'Grains on a river bed: ') + mmTxt(state.D) + '，U = ' + speed(state.U) + '，' + zoneTxt(bed().zone)
      : state.mode === 'settle' ? T('沉降水管：七種顆粒', 'Settling columns: seven grains') : T('從山到海的河流與沉積物', 'A river from the mountains to the sea and its deposits'));
  }
  function updateArr() {
    const run = state.run.settle;
    if (!run || !run.done) { setHTML('arrLog', T('按「放下顆粒」看誰先到底。', 'Press “Drop the grains” to see which lands first.')); return; }
    const list = settleList().slice().sort(function (a, b) { return a.t - b.t; });
    setHTML('arrLog', T('到底的順序：', 'Order of landing: ') + list.map(function (p) { return (p.mine ? '<b>' + p.name + '</b>' : p.name) + ' ' + shortDur(p.t); }).join(' → '));
  }
  function updateButtons() {
    const run = state.run[state.mode];
    const idle = { bed: T('從上游放一把', 'Add a handful from upstream'), settle: T('放下顆粒', 'Drop the grains'), river: T('放流', 'Release') }[state.mode];
    const busy = { bed: T('顆粒在水裡…', 'Grains in the water…'), settle: T('下沉中…', 'Sinking…'), river: T('往下游…', 'Going downstream…') }[state.mode];
    $('go').textContent = run && !run.done ? (run.playing ? busy : T('繼續', 'Resume')) : run && run.done ? T('再一次', 'Again') : idle;
    $('pause').disabled = !run || run.done || !run.playing;
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  function fillButtons() {
    const sb = $('sampleSeg'); sb.innerHTML = '';
    SC.SAMPLES.forEach(function (s) {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('data-s', s.id); b.textContent = T(s.zh, s.en);
      b.addEventListener('click', function () {
        acted(); setSlider(el.size, s.D * 1000); readSliders(); state.D = s.D; state.sample = s.id;
        cancelRun('settle'); cancelRun('river'); if (state.mode === 'bed') cancelRun('bed');
        setStatus(T(s.zh, s.en) + '：' + mmTxt(s.D) + T('。', '.'));
        refreshOutputs(); afterChange(true);
      });
      sb.appendChild(b);
    });
    const mb = $('minSeg'); mb.innerHTML = '';
    SC.MINERALS.forEach(function (m) {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('data-m', m.id); b.textContent = T(m.zh, m.en);
      b.addEventListener('click', function () { acted(); state.mineral = m.id; cancelRun('settle'); cancelRun('river'); cancelRun('bed'); refreshOutputs(); afterChange(true); });
      mb.appendChild(b);
    });
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  el.size.addEventListener('input', function () { if (quiet) return; acted(); readSliders(); state.sample = ''; cancelRun('settle'); cancelRun('river'); cancelRun('bed'); refreshOutputs(); afterChange(); });
  [el.vel, el.depth].forEach(function (inp) { inp.addEventListener('input', function () { if (quiet) return; acted(); readSliders(); refreshOutputs(); afterChange(); }); });
  el.temp.addEventListener('input', function () { if (quiet) return; acted(); readSliders(); cancelRun('settle'); refreshOutputs(); afterChange(); });
  el.u0.addEventListener('input', function () { if (quiet) return; acted(); readSliders(); cancelRun('river'); refreshOutputs(); afterChange(); });
  [el.size, el.vel, el.depth, el.temp, el.u0].forEach(function (inp) { inp.addEventListener('change', function () { if (!quiet) afterChange(true); }); });
  document.querySelectorAll('#shapeSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); state.shape = b.getAttribute('data-shape'); cancelRun('settle'); cancelRun('river'); refreshOutputs(); afterChange(true); }); });
  document.querySelectorAll('#consolSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); state.consol = +b.getAttribute('data-c'); refreshOutputs(); afterChange(true); }); });
  document.querySelectorAll('#modeSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); state.mode = b.getAttribute('data-mode');
      refreshOutputs(); updateButtons(); updateArr(); afterChange(true);
      setStatus({
        bed: T('改變粒徑與流速，看河床的顆粒會不會被挖起來。', 'Change the grain size and the flow and see whether the bed is eroded.'),
        settle: T('按「放下顆粒」，七種顆粒同時沉入 1 m 高的水管。', 'Press “Drop the grains”: seven kinds sink through 1 m of water at once.'),
        river: T('設定山上的流速，按「放流」看泥沙停在哪裡。', 'Set the speed in the mountains and press “Release” to see where the load stops.')
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
    state.run = { bed: null, settle: null, river: null }; incs = [];
    updateButtons(); updateArr();
    setStatus(T('已清除動畫，設定不變。', 'Animations cleared; the settings are kept.'));
    afterChange(true);
  });
  $('soundBtn').addEventListener('click', function () {
    const on = !(window.LabSettings && window.LabSettings.get('sound'));
    if (window.LabSettings) window.LabSettings.set('sound', on);
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 下方的 Hjulström 圖：點一下或拖曳選粒徑與流速 ----------
  let dragging = false;
  function grPick(ev) {
    if (state.mode !== 'bed') return false;
    const rc = gr.getBoundingClientRect(), x = ev.clientX - rc.left, y = ev.clientY - rc.top, Fm = frame0(grSize.w, grSize.h);
    if (x < Fm.x0 || x > Fm.x1 || y < Fm.y0 || y > Fm.y1) return false;
    const lgD = -3 + (x - Fm.x0) / (Fm.x1 - Fm.x0) * 5.301, lgU = -3 + (Fm.y1 - y) / (Fm.y1 - Fm.y0) * 4;
    setSlider(el.size, Math.min(200, Math.pow(10, lgD))); setSlider(el.vel, Math.max(0.001, Math.min(5, Math.pow(10, lgU))));
    readSliders(); state.sample = ''; cancelRun('bed'); cancelRun('settle'); cancelRun('river'); refreshOutputs(); afterChange();
    return true;
  }
  gr.addEventListener('pointerdown', function (ev) { if (ev.button !== 0 || !grSize) return; if (grPick(ev)) { acted(); dragging = true; try { gr.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ } } });
  gr.addEventListener('pointermove', function (ev) { if (dragging) grPick(ev); });
  function endDrag() { if (dragging) { dragging = false; afterChange(true); } }
  gr.addEventListener('pointerup', endDrag);
  gr.addEventListener('pointercancel', endDrag);

  // ---------- 鍵盤 ----------
  if (window.LabKeys) {
    window.LabKeys.attach(cv, {
      label: T('實驗畫面。左右鍵改變粒徑；河床模式上下鍵改變流速；從山到海上下鍵改變山上的流速（按住 Shift 移動較多）。', 'Experiment view. Left and right change the grain size; up and down change the flow speed (river bed) or the speed in the mountains (mountains to the sea). Hold Shift for bigger steps.'),
      items: [{
        name: function () { return T('粒徑與流速', 'Grain size and flow'); },
        move: function (dx, dy, big) {
          if (!dx && !dy) return false;
          acted();
          if (dx) { setSlider(el.size, Math.max(0.001, Math.min(200, state.D * 1000 * Math.pow(10, dx * (big ? 0.1 : 0.02))))); state.sample = ''; cancelRun('settle'); cancelRun('river'); }
          if (dy) {
            if (state.mode === 'bed') setSlider(el.vel, Math.max(0.001, Math.min(5, state.U * Math.pow(10, dy * (big ? 0.1 : 0.02)))));
            else if (state.mode === 'river') { setSlider(el.u0, Math.max(0.5, Math.min(5, state.U0 + dy * (big ? 0.5 : 0.05)))); cancelRun('river'); }
            else setSlider(el.temp, Math.max(0, Math.min(40, state.T + dy * (big ? 5 : 0.5))));
          }
          readSliders(); refreshOutputs(); afterChange();
          return true;
        },
        describe: function () { return mmTxt(state.D) + '，' + (state.mode === 'bed' ? 'U ' + speed(state.U) + '，' + zoneTxt(bed().zone) : state.mode === 'river' ? sig(state.U0, 3) + ' m/s' : num(state.T, 1) + ' °C'); }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  fillButtons();
  setSlider(el.size, 0.2); setSlider(el.vel, 0.2);
  readSliders();
  state.D = 0.2e-3; state.U = 0.2; state.sample = 'fine';
  refreshOutputs(); updateButtons(); updateSoundButton(); updateArr(); updateReadouts();
  function themeChanged() { readColors(); fillButtons(); refreshOutputs(); updateButtons(); updateSoundButton(); updateReadouts(); requestDraw(); }
  const dmq = window.matchMedia('(prefers-color-scheme: dark)');
  if (dmq.addEventListener) dmq.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lh = 0, gw = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lw || cv.clientHeight !== lh || gr.clientWidth !== gw) { lw = cv.clientWidth; lh = cv.clientHeight; gw = gr.clientWidth; if (gw > 0) resizeCv(); }
    }).observe(stage);
  } else window.addEventListener('resize', resizeCv);
  resizeCv();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastFrame = 0; requestDraw(); } });
  setStatus(T('細砂（0.2 mm）在 0.2 m/s 的河水裡。慢慢加大流速，或在下面的圖上點一下。', 'Fine sand (0.2 mm) in a river flowing at 0.2 m/s. Raise the speed slowly, or click on the chart below.'));
  requestDraw();
  // 測試用（Playwright）
  window.__st = {
    state: state, SC: SC, snapshot: snapshot,
    set: function (o) {
      acted();
      if (o.mode) state.mode = o.mode;
      if (o.mineral) state.mineral = o.mineral;
      if (o.shape) state.shape = o.shape;
      if (o.consol) state.consol = o.consol;
      const map = { D: el.size, U: el.vel, h: el.depth, T: el.temp, U0: el.u0 };
      Object.keys(map).forEach(function (k) { if (o[k] != null) setSlider(map[k], o[k]); });
      readSliders();
      if (o.D != null) state.sample = '';
      if (o.chart) state.chart[state.mode] = o.chart;
      refreshOutputs(); updateButtons(); afterChange(true);
    },
    play: function (u) { if (!state.run[state.mode]) startRun(); const r = state.run[state.mode]; r.playing = false; r.u = u; if (state.mode === 'bed') { for (let i = 0; i < 60; i++) stepBed(0.05); } updateButtons(); requestDraw(); },
    finish: function () { if (!state.run[state.mode]) startRun(); if (state.mode === 'bed') incs.forEach(function (p) { p.done = true; }); stepRun(1e6); requestDraw(); }
  };
})();
