/* atmosphere-layers.js — 「大氣分層、氣壓與標準大氣」的畫面與互動
 * 物理計算全部在 atmosphere-layers-core.js；3D 地球在 atmosphere-layers-3d.js，切換到 3D 時才載入。 */
(function () {
  'use strict';
  const K = window.AtmosphereLayersCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const FONT = D.FONT;
  const ZTOP = 120;                         // km
  const TROPO = K.geomet(11000) / 1000;     // 11.019 km（幾何高度）
  const STRATO0 = K.geomet(47000) / 1000;   // 47.35 km
  const STRATO1 = K.geomet(51000) / 1000;   // 51.41 km
  const MESO = 86;                          // 中氣層頂
  const BOUNDS = [TROPO, STRATO1, MESO];    // 層與層的分界（平流層頂取上緣 51.4 km，與 core.layerOf 一致）
  const LAYERS = [
    { zh: '對流層', en: 'Troposphere', c: 'al-tropo' },
    { zh: '平流層', en: 'Stratosphere', c: 'al-strato' },
    { zh: '中氣層', en: 'Mesosphere', c: 'al-meso' },
    { zh: '增溫層', en: 'Thermosphere', c: 'al-thermo' }
  ];
  const BTYPES = ['b300', 'b600', 'b1200', 'b3000'];
  const BNAME = { b300: '300 g', b600: '600 g', b1200: '1200 g', b3000: '3000 g' };

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = { z: $('z'), dT: $('dT'), d0: $('d0') };
  const state = {
    z: 0, dT: 0,                 // 探測高度（km）、整層溫度偏差（K）
    range: 120, q: 'P', log: true, std: true, chart: 'time',
    ref: null,                   // 參考點 {z（km）}
    btype: 'b600', D0: 1.5,
    balloon: null,               // 飛行中的氣球（core.launch 的物件）
    bstate: 'ground',            // ground／flying／paused／burst
    burstAt: 0,                  // 爆破動畫開始時間（performance.now）
    sonde: [],                   // 這次飛行一路量到的 {z, T}
    track: [],                   // 這次飛行的 [t s, z m, D m]
    flights: [],                 // 完成的飛行 {type, D0, dT, v0, zBurst, Pburst, t, track}
    speed: 120, acted: false
  };
  function readSliders() {
    state.z = Math.max(0, Math.min(ZTOP, val(el.z)));
    state.dT = val(el.dT);
    state.D0 = val(el.d0);
  }
  /** 探測點的狀態（讀數、畫圖、任務事件共用） */
  let cache = null, cacheKey = '';
  function now() {
    const key = state.z + '|' + state.dT;
    if (cache && cacheKey === key) return cache;
    const s = K.at(state.z * 1000, state.dT);
    s.lapse = K.lapse(state.z * 1000, state.dT);
    cache = s; cacheKey = key;
    return s;
  }
  function refState() { return state.ref ? K.at(state.ref.z * 1000, state.dT) : null; }
  function surface() { return K.at(0, state.dT); }
  function rhoHe0() { const s = surface(); return s.P * 0.0040026 / (K.RSTAR * s.T); }
  function snapshot() {
    const s = now(), r = refState();
    return {
      z: state.z * 1000, dT: state.dT, T: s.T, P: s.P, rho: s.rho, above: s.above, boil: s.boil, mfp: s.mfp, c: s.c, H: s.H,
      layer: s.layer, lapse: s.lapse, Ts: surface().T, rhoHe0: rhoHe0(),
      ref: r ? { z: r.z, P: r.P, T: r.T } : null,
      range: state.range, q: state.q, log: state.log
    };
  }

  // =====================================================================
  // 顏色與文字
  // =====================================================================
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface',
      '--al-tropo', '--al-strato', '--al-meso', '--al-thermo', '--al-temp', '--al-std', '--al-q', '--al-ref', '--al-balloon', '--al-sonde',
      '--al-sky0', '--al-sky1', '--al-sky2', '--al-ground', '--al-ozone', '--al-aurora']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function sgn(v, d) { const s = num(v, d); return v > 0 && !/^0(\.0+)?$/.test(s) ? '+' + s : s; }
  function outNum(v, lo, hi) {
    let t = v.toFixed(hi);
    if (hi > lo) t = t.replace(new RegExp('0{1,' + (hi - lo) + '}$'), '').replace(/\.$/, '');
    return t.replace('-', '−');
  }
  /** 有效數字 n 位（不用科學記號） */
  function sig(v, n) {
    if (!isFinite(v) || v === 0) return num(v || 0, 0);
    const d = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(v))));
    return num(v, Math.min(d, 12));
  }
  /** HTML 用的科學記號 a × 10<sup>b</sup> */
  function sci(v, n) {
    if (!isFinite(v) || v === 0) return '0';
    let e = Math.floor(Math.log10(Math.abs(v))), m = v / Math.pow(10, e);
    if (Math.abs(+m.toFixed(n - 1)) >= 10) { e += 1; m /= 10; }
    return num(m, n - 1) + ' × 10<sup>' + num(e, 0) + '</sup>';
  }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function cel(Tk, d) { return num(Tk - 273.15, d == null ? 1 : d) + ' °C'; }
  function layerName(i) { const L = LAYERS[i]; return T(L.zh, L.en); }
  /** 氣壓：100 Pa 以上用 hPa，以下用 Pa／mPa／μPa（畫布也可以用，不必上標） */
  function pText(P) {
    if (P >= 100) { const h = P / 100; return (h >= 100 ? num(h, 1) : h >= 10 ? num(h, 2) : num(h, 3)) + ' hPa'; }
    if (P >= 1) return sig(P, 3) + ' Pa';
    if (P >= 1e-3) return sig(P * 1000, 3) + ' mPa';
    return sig(P * 1e6, 3) + ' μPa';
  }
  function rhoText(r) {
    if (r >= 0.01) return sig(r, 4) + ' kg/m³';
    if (r >= 1e-5) return sig(r * 1000, 3) + ' g/m³';
    if (r >= 1e-8) return sig(r * 1e6, 3) + ' mg/m³';
    return sig(r * 1e9, 3) + ' μg/m³';
  }
  function lenText(m) {
    if (m >= 1) return sig(m, 3) + ' m';
    if (m >= 0.01) return sig(m * 100, 3) + ' cm';
    if (m >= 1e-3) return sig(m * 1000, 3) + ' mm';
    if (m >= 1e-6) return sig(m * 1e6, 3) + ' μm';
    return sig(m * 1e9, 3) + ' nm';
  }
  function pctText(f) {
    const p = f * 100;
    if (p >= 10) return num(p, 1) + '%';
    if (p >= 0.01) return sig(p, 3) + '%';
    return sci(p, 3) + '%';
  }
  /** 淨浮力（以可以多吊起的質量表示）；負的代表升不起來，寫成「還差多少」 */
  function liftText(m) {
    return m >= 0 ? num(m, 2) + ' kg' : T('升不起來（還差 ', 'Will not rise (short by ') + num(-m, 2) + ' kg' + T('）', ')');
  }
  function kmText(zkm) { return zkm < 10 ? num(zkm, 3) + ' km' : zkm < 100 ? num(zkm, 2) + ' km' : num(zkm, 1) + ' km'; }
  function zLabel(zkm) { return zkm * 1000 < 9999.5 ? num(zkm * 1000, 0) + ' m' : kmText(zkm); }
  function timeText(s) {
    const m = s / 60;
    if (m < 60) return num(m, 1) + T(' 分鐘', ' min');
    return Math.floor(m / 60) + T(' 小時 ', ' h ') + num(m % 60, 0) + T(' 分', ' min');
  }

  // =====================================================================
  // 畫布
  // =====================================================================
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
  function resizeCv() { cvSize = fit(cv, ctx); grSize = fit(gr, gtx); skyKey = ''; requestDraw(); }

  /** 版面：左邊高度軸、天空欄、溫度圖、右圖 */
  function lay(W, H) {
    const narrow = W < 560;
    const ax = narrow ? 30 : 38;
    const skyW = Math.round(W * (narrow ? 0.27 : 0.3));
    const s0 = ax, s1 = ax + skyW;
    const gap = narrow ? 8 : 14;
    const rest = W - s1 - gap * 2 - 6;
    const t0 = s1 + gap, t1 = t0 + Math.round(rest * 0.5);
    const q0 = t1 + gap, q1 = W - 6;
    return { W: W, H: H, narrow: narrow, ax: ax, s0: s0, s1: s1, t0: t0, t1: t1, q0: q0, q1: q1, yTop: 14, yBot: H - 36 };
  }
  function yOf(L, zkm) { return L.yBot - zkm / state.range * (L.yBot - L.yTop); }
  function zOf(L, y) { return (L.yBot - y) / (L.yBot - L.yTop) * state.range; }

  // ---------- 溫度圖的範圍 ----------
  function tRange() {
    const r = state.range, d = state.dT;
    if (r <= 20) return [-80 + Math.min(0, d), 40 + Math.max(0, d)];
    if (r <= 50) return [-80 + Math.min(0, d), 40 + Math.max(0, d)];
    return [-110 + Math.min(0, d), 100 + Math.max(0, d)];
  }
  // ---------- 右圖的量 ----------
  const QDEF = {
    P: { zh: '氣壓', en: 'Pressure', unit: 'hPa', get: function (s) { return s.P / 100; }, log: true },
    rho: { zh: '密度', en: 'Density', unit: 'kg/m³', get: function (s) { return s.rho; }, log: true },
    c: { zh: '聲速', en: 'Speed of sound', unit: 'm/s', get: function (s) { return s.c; }, log: false },
    mfp: { zh: '平均自由徑', en: 'Mean free path', unit: 'm', get: function (s) { return s.mfp; }, log: true }
  };
  function qIsLog() { return QDEF[state.q].log && state.log; }
  function qText(s) {
    if (state.q === 'P') return pText(s.P);
    if (state.q === 'rho') return rhoText(s.rho);
    if (state.q === 'c') return num(s.c, 1) + ' m/s';
    return lenText(s.mfp);
  }
  /** 右圖的資料與範圍（只有設定改變時才重算） */
  let profKey = '', prof = null;
  function profile() {
    const key = [state.range, state.dT, state.q, state.log].join('|');
    if (key === profKey) return prof;
    profKey = key;
    const n = 600, pts = [], std = [], Tp = [], Ts = [];
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i <= n; i++) {
      const z = state.range * i / n;
      const s = K.at(z * 1000, state.dT), s0 = K.at(z * 1000, 0);
      const v = QDEF[state.q].get(s), v0 = QDEF[state.q].get(s0);
      pts.push([z, v]); std.push([z, v0]); Tp.push([z, s.T - 273.15]); Ts.push([z, s0.T - 273.15]);
      lo = Math.min(lo, v, v0); hi = Math.max(hi, v, v0);
    }
    let a, b;
    if (qIsLog()) { a = Math.floor(Math.log10(lo)); b = Math.ceil(Math.log10(hi)); if (b - a < 1) b = a + 1; }
    else if (state.q === 'c') { a = Math.floor(lo / 20) * 20 - 10; b = Math.ceil(hi / 20) * 20 + 10; }
    else { a = 0; b = hi * 1.04; }
    prof = { pts: pts, std: std, Tp: Tp, Ts: Ts, a: a, b: b };
    return prof;
  }
  function qX(L, v, P) {
    const span = L.q1 - L.q0 - 8;
    const u = qIsLog() ? (Math.log10(Math.max(v, 1e-30)) - P.a) / (P.b - P.a) : (v - P.a) / (P.b - P.a);
    return L.q0 + 4 + Math.max(-0.02, Math.min(1.02, u)) * span;
  }
  function tX(L, Tc) {
    const r = tRange();
    return L.t0 + 4 + (Tc - r[0]) / (r[1] - r[0]) * (L.t1 - L.t0 - 8);
  }

  // ---------- 天空欄（靜態部分畫在離屏畫布） ----------
  let skyKey = '', skyCanvas = null;
  function skyColor(zkm) {
    // 天空的顏色：密度越低越暗（用 ln ρ 混合）
    const r = K.at(Math.min(ZTOP, zkm) * 1000, 0).rho;
    const u = Math.max(0, Math.min(1, Math.log(1.225 / r) / Math.log(1.225 / 1e-6)));
    return u < 0.35 ? D.mix(C['al-sky0'], C['al-sky1'], u / 0.35) : D.mix(C['al-sky1'], C['al-sky2'], Math.min(1, (u - 0.35) / 0.45));
  }
  function buildSky(L) {
    const key = [L.W, L.H, state.range, D.dark ? 'd' : 'l', cvSize.dpr, T('a', 'b')].join('|');
    if (key === skyKey && skyCanvas) return skyCanvas;
    skyKey = key;
    const dpr = cvSize.dpr;
    const c = skyCanvas || document.createElement('canvas');
    c.width = Math.round(L.W * dpr); c.height = Math.round(L.H * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, L.W, L.H);
    const x0 = L.s0, x1 = L.s1, w = x1 - x0, yT = L.yTop, yB = L.yBot;
    // 天空漸層
    const sg = g.createLinearGradient(0, yB, 0, yT);
    for (let i = 0; i <= 12; i++) { const z = state.range * i / 12; sg.addColorStop(i / 12, skyColor(z)); }
    g.save();
    D.roundRect(g, x0, yT, w, yB - yT, 8); g.clip();
    g.fillStyle = sg; g.fillRect(x0, yT, w, yB - yT);
    // 星星：天空夠暗（約 40 km 以上）才出現
    const zStar = 40;
    if (state.range > zStar) {
      for (let i = 0; i < 70; i++) {
        const sx = x0 + ((i * 97 + 13) % 1000) / 1000 * w;
        const zz = zStar + ((i * 61 + 7) % 100) / 100 * (state.range - zStar);
        const a = Math.min(1, (zz - zStar) / 25) * (0.35 + ((i * 37) % 10) / 20);
        g.fillStyle = D.alpha('#ffffff', a);
        const r = (i % 7 === 0) ? 1.3 : 0.8;
        g.beginPath(); g.arc(sx, yOf(L, zz), r, 0, Math.PI * 2); g.fill();
      }
    }
    // 各層淡淡的色帶
    const bands = [[0, TROPO], [TROPO, STRATO1], [STRATO1, MESO], [MESO, ZTOP]];
    bands.forEach(function (b, i) {
      if (b[0] >= state.range) return;
      const ya = yOf(L, Math.min(b[1], state.range)), yb = yOf(L, b[0]);
      const lg = g.createLinearGradient(x0, 0, x1, 0);
      lg.addColorStop(0, D.alpha(C[LAYERS[i].c], D.dark ? 0.2 : 0.16));
      lg.addColorStop(0.6, D.alpha(C[LAYERS[i].c], 0.03));
      lg.addColorStop(1, D.alpha(C[LAYERS[i].c], 0));
      g.fillStyle = lg; g.fillRect(x0, ya, w, yb - ya);
    });
    // 臭氧層：15–35 km，最濃約 22–25 km
    if (state.range > 15) {
      const yo0 = yOf(L, 35), yo1 = yOf(L, 15);
      const og = g.createLinearGradient(0, yo1, 0, yo0);
      og.addColorStop(0, D.alpha(C['al-ozone'], 0)); og.addColorStop(0.4, D.alpha(C['al-ozone'], D.dark ? 0.32 : 0.24));
      og.addColorStop(0.55, D.alpha(C['al-ozone'], D.dark ? 0.32 : 0.24)); og.addColorStop(1, D.alpha(C['al-ozone'], 0));
      g.fillStyle = og; g.fillRect(x0, yo0, w, yo1 - yo0);
    }
    // 極光：100 km 以上（綠色，頂端偏紅）
    if (state.range >= 100) {
      for (let k = 0; k < 9; k++) {
        const ax = x0 + w * (0.08 + k * 0.105) + Math.sin(k * 1.7) * 4;
        const ag = g.createLinearGradient(0, yOf(L, 98), 0, yOf(L, 120));
        ag.addColorStop(0, D.alpha(C['al-aurora'], 0)); ag.addColorStop(0.15, D.alpha(C['al-aurora'], 0.5));
        ag.addColorStop(0.6, D.alpha(C['al-aurora'], 0.18)); ag.addColorStop(1, D.alpha('#f43f5e', 0.12));
        g.fillStyle = ag;
        g.beginPath();
        g.moveTo(ax - 3, yOf(L, 98)); g.quadraticCurveTo(ax + 6, yOf(L, 109), ax + 2, yOf(L, 120));
        g.lineTo(ax + 9, yOf(L, 120)); g.quadraticCurveTo(ax + 12, yOf(L, 109), ax + 5, yOf(L, 98)); g.closePath(); g.fill();
      }
    }
    // 流星：80–110 km 的斜線
    if (state.range >= 80) {
      [[0.25, 104, 92], [0.62, 98, 84], [0.82, 108, 96]].forEach(function (m) {
        const xa = x0 + w * m[0], ya = yOf(L, m[1]), yb = yOf(L, m[2]);
        const mg = g.createLinearGradient(xa, ya, xa + 16, yb);
        mg.addColorStop(0, D.alpha('#ffffff', 0)); mg.addColorStop(1, D.alpha('#fef3c7', 0.9));
        g.strokeStyle = mg; g.lineWidth = 1.6; g.lineCap = 'round';
        g.beginPath(); g.moveTo(xa, ya); g.lineTo(xa + 16, yb); g.stroke();
        g.fillStyle = D.alpha('#fff7d6', 0.95); g.beginPath(); g.arc(xa + 16, yb, 1.6, 0, Math.PI * 2); g.fill();
      });
    }
    // 雲：積雲與積雨雲（雲頂撞到對流層頂就攤平）
    function puff(cx, cy, r, a) {
      const pg = g.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.2, cx, cy, r);
      pg.addColorStop(0, D.alpha('#ffffff', a)); pg.addColorStop(1, D.alpha(D.dark ? '#94a3b8' : '#dbe4ee', a * 0.85));
      g.fillStyle = pg; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    }
    const pxKm = (yB - yT) / state.range;
    if (state.range <= 50) {
      const ca = D.dark ? 0.55 : 0.92;
      // 積雲 1–2.5 km
      const cxs = x0 + w * 0.22, cyb = yOf(L, 1.2);
      const cr = Math.max(4, Math.min(16, pxKm * 0.8));
      puff(cxs, cyb - cr * 0.6, cr, ca); puff(cxs + cr, cyb - cr * 0.3, cr * 0.8, ca); puff(cxs - cr * 0.9, cyb - cr * 0.2, cr * 0.7, ca);
      // 積雨雲：一團團往上堆的雲塔，頂到對流層頂就攤成砧狀（往右邊下風處拉長）
      g.save();
      g.beginPath(); g.rect(x0, yT, w, yB - yT); g.clip();
      const xc = x0 + w * 0.62, ytop = yOf(L, TROPO - 0.15), ybot = yOf(L, 1.2);
      const bw = Math.max(6, Math.min(w * 0.085, 15));
      const ta = ca * 0.85;
      const n = Math.max(6, Math.round((ybot - ytop) / (bw * 0.85)));
      for (let i = 0; i <= n; i++) {
        const u = i / n, y = ybot + (ytop + bw * 0.5 - ybot) * u;
        const r = bw * (0.7 + 0.4 * u) * (0.92 + 0.16 * Math.sin(i * 2.3));
        const dx = bw * 0.28 * Math.sin(i * 1.7 + 0.4);
        puff(xc + dx - r * 0.42, y + r * 0.1, r * 0.8, ta);
        puff(xc + dx + r * 0.42, y, r * 0.82, ta);
      }
      // 砧狀雲頂：貼著對流層頂的扁平雲層，底緣有一排小雲團
      const aw = Math.min(bw * 3.6, w * 0.34), ax = xc + aw * 0.25, ay = ytop + bw * 0.4;
      const ag = g.createLinearGradient(0, ytop - bw * 0.3, 0, ytop + bw * 0.9);
      ag.addColorStop(0, D.alpha('#ffffff', ta)); ag.addColorStop(1, D.alpha(D.dark ? '#94a3b8' : '#d3dce8', ta * 0.9));
      g.fillStyle = ag;
      g.beginPath(); g.ellipse(ax, ay, aw, bw * 0.6, 0, 0, Math.PI * 2); g.fill();
      for (let k = -3; k <= 3; k++) puff(ax + k * aw * 0.27, ay + bw * 0.35, bw * (0.55 - 0.05 * Math.abs(k)), ta * 0.8);
      g.restore();
    }
    // 地面與山：玉山、聖母峰照比例畫
    const yg = yOf(L, 0);
    const mtn = function (cx, hkm, half, col) {
      const yp = yOf(L, hkm);
      const mg = g.createLinearGradient(0, yp, 0, yg);
      mg.addColorStop(0, D.mix(col, '#ffffff', 0.25)); mg.addColorStop(1, D.shade(col, -0.25));
      g.fillStyle = mg;
      g.beginPath(); g.moveTo(cx - half, yg + 1); g.lineTo(cx - half * 0.25, yp + (yg - yp) * 0.25); g.lineTo(cx, yp); g.lineTo(cx + half * 0.3, yp + (yg - yp) * 0.3); g.lineTo(cx + half, yg + 1); g.closePath(); g.fill();
      // 雪頂
      if (hkm > 5 && yg - yp > 14) {
        g.fillStyle = D.alpha('#ffffff', 0.92);
        g.beginPath(); g.moveTo(cx, yp); g.lineTo(cx - half * 0.12, yp + (yg - yp) * 0.18); g.lineTo(cx + half * 0.14, yp + (yg - yp) * 0.17); g.closePath(); g.fill();
      }
    };
    mtn(x0 + w * 0.36, 3.952, w * 0.2, C['al-ground']);
    mtn(x0 + w * 0.8, 8.849, w * 0.24, D.mix(C['al-ground'], '#8b7355', 0.5));
    g.fillStyle = D.shade(C['al-ground'], -0.1); g.fillRect(x0, yg, w, 3);
    // 客機（11 km）
    if (state.range >= 15) {
      const px = x0 + w * 0.45, py = yOf(L, 11);
      g.fillStyle = D.dark ? '#e2e8f0' : '#f8fafc';
      g.strokeStyle = D.alpha('#0f172a', 0.5); g.lineWidth = 0.8;
      g.beginPath(); g.ellipse(px, py, 9, 1.8, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(px - 1, py); g.lineTo(px - 5, py + 5); g.lineTo(px - 2, py + 5); g.lineTo(px + 3, py); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(px - 7, py); g.lineTo(px - 9, py - 4); g.lineTo(px - 7.5, py - 4); g.lineTo(px - 5, py); g.closePath(); g.fill(); g.stroke();
      // 凝結尾
      const tg = g.createLinearGradient(px - 9, 0, px - 40, 0);
      tg.addColorStop(0, D.alpha('#ffffff', 0.75)); tg.addColorStop(1, D.alpha('#ffffff', 0));
      g.strokeStyle = tg; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(px - 9, py); g.lineTo(px - 40, py + 1); g.stroke();
    }
    g.restore();
    // 外框
    g.strokeStyle = D.alpha(C.border, 0.9); g.lineWidth = 1;
    D.roundRect(g, x0 + 0.5, yT + 0.5, w - 1, yB - yT - 1, 8); g.stroke();
    return c;
  }

  /** 天空欄裡的字：深色描邊（天空上半部是暗的，淺色模式的白色描邊會看不見） */
  function skyText(g, text, x, y, color, align, base, font) {
    g.font = font; g.textAlign = align; g.textBaseline = base; g.lineJoin = 'round';
    g.lineWidth = 3.5; g.strokeStyle = 'rgba(6,10,20,0.78)'; g.strokeText(text, x, y);
    g.fillStyle = color; g.fillText(text, x, y);
  }
  function niceStep(span, n) {
    const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }

  function drawProfile(tnow) {
    if (!cvSize) return;
    const W = cvSize.w, H = cvSize.h, L = lay(W, H), g = ctx, s = now();
    g.clearRect(0, 0, W, H);
    D.backdrop(g, W, H);
    g.drawImage(buildSky(L), 0, 0, W, H);
    const fs = L.narrow ? 10.5 : 11.5;
    const font = function (w, d) { return w + ' ' + (fs + (d || 0)) + 'px ' + FONT; };

    // 高度軸
    const zs = niceStep(state.range, L.narrow ? 6 : 8);
    for (let z = 0; z <= state.range + 1e-9; z += zs) {
      const y = Math.round(yOf(L, z)) + 0.5;
      g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1;
      g.beginPath(); g.moveTo(L.t0, y); g.lineTo(L.t1, y); g.moveTo(L.q0, y); g.lineTo(L.q1, y); g.stroke();
      g.strokeStyle = D.alpha(C.text, 0.35);
      g.beginPath(); g.moveTo(L.s0 - 4, y); g.lineTo(L.s0, y); g.stroke();
      D.haloText(g, num(z, 0), L.s0 - 6, y, C.muted, 'right', 'middle', font('500'));
    }
    D.haloText(g, 'km', L.s0 - 6, L.yBot + 14, C.muted, 'right', 'middle', font('600'));

    // 層的分界：虛線橫跨三個區塊
    BOUNDS.forEach(function (zb, i) {
      if (zb > state.range) return;
      const y = Math.round(yOf(L, zb)) + 0.5;
      g.save(); g.setLineDash([5, 4]); g.strokeStyle = D.alpha(C[LAYERS[i + 1].c], 0.75); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(L.s0, y); g.lineTo(L.q1, y); g.stroke(); g.restore();
    });
    // 層名（在天空欄裡，色帶夠高才寫）
    const bands = [[0, TROPO], [TROPO, STRATO1], [STRATO1, MESO], [MESO, ZTOP]];
    bands.forEach(function (b, i) {
      if (b[0] >= state.range) return;
      const ya = yOf(L, Math.min(b[1], state.range)), yb = yOf(L, b[0]);
      if (yb - ya < 20) return;
      const ink = D.dark ? D.shade(C[LAYERS[i].c], 0.35) : D.shade(C[LAYERS[i].c], -0.3);
      D.pill(g, layerName(i), L.s0 + 6, Math.min(yb - 6, ya + 22), ink, 'left', font('700'));   // 放在色帶頂端附近，不壓到山名
    });
    // 分界名稱：寫在溫度圖左上
    const bnames = [T('對流層頂', 'Tropopause'), T('平流層頂', 'Stratopause'), T('中氣層頂', 'Mesopause')];
    BOUNDS.forEach(function (zb, i) {
      if (zb > state.range * 0.97) return;
      const y = yOf(L, zb);
      D.haloText(g, bnames[i], L.t0 + 4, y - 4, C[LAYERS[i + 1].c], 'left', 'bottom', font('600', -1));
    });
    // 天空欄的小標籤
    const tiny = font('600', -1.5);
    if (state.range > 15) skyText(g, state.range > 50 ? T('臭氧層', 'Ozone') : T('臭氧層', 'Ozone layer'), L.s1 - 5, yOf(L, 25), '#e9d5ff', 'right', 'middle', tiny);
    if (state.range >= 100) {
      const yk = Math.round(yOf(L, 100)) + 0.5;
      g.save(); g.setLineDash([2, 3]); g.strokeStyle = D.alpha('#ffffff', 0.55); g.lineWidth = 1;
      g.beginPath(); g.moveTo(L.s0 + 2, yk); g.lineTo(L.s1 - 2, yk); g.stroke(); g.restore();
      skyText(g, T('卡門線', 'Kármán line'), L.s1 - 5, yk - 3, '#e2e8f0', 'right', 'bottom', tiny);
      skyText(g, T('極光', 'Aurora'), L.s1 - 5, yOf(L, 113), '#86efac', 'right', 'middle', tiny);
      skyText(g, T('流星', 'Meteors'), L.s1 - 5, yOf(L, 88), '#fde68a', 'right', 'middle', tiny);
    }
    if (state.range <= 50) {
      D.haloText(g, T('玉山', 'Yushan'), L.s0 + (L.s1 - L.s0) * 0.36, yOf(L, 3.952) - 4, C.text, 'center', 'bottom', tiny);
      D.haloText(g, T('聖母峰', 'Everest'), L.s0 + (L.s1 - L.s0) * 0.8, yOf(L, 8.849) - 4, C.text, 'center', 'bottom', tiny);
    }

    drawTempPanel(g, L, font);
    drawQPanel(g, L, font);
    drawBalloon(g, L, tnow, font);

    // 參考點
    if (state.ref && state.ref.z <= state.range) {
      const yr = Math.round(yOf(L, state.ref.z)) + 0.5;
      g.save(); g.setLineDash([7, 4]); g.strokeStyle = C['al-ref']; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(L.s0, yr); g.lineTo(L.q1, yr); g.stroke(); g.restore();
      D.pill(g, T('參考點 ', 'Mark ') + zLabel(state.ref.z), L.q1 - 2, yr - 3, C['al-ref'], 'right', font('600', -1));
    }
    // 探測點：橫線、左邊的把手、兩條曲線上的點
    const yp = yOf(L, Math.min(state.z, state.range));
    const inRange = state.z <= state.range + 1e-9;
    g.strokeStyle = D.alpha(C.accent, inRange ? 0.25 : 0.12); g.lineWidth = 6;
    g.beginPath(); g.moveTo(L.s0, yp); g.lineTo(L.q1, yp); g.stroke();
    g.strokeStyle = C.accent; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(L.s0, yp); g.lineTo(L.q1, yp); g.stroke();
    // 把手（三角）
    g.fillStyle = C.accent;
    g.beginPath(); g.moveTo(L.s0 + 1, yp); g.lineTo(L.s0 - 7, yp - 6); g.lineTo(L.s0 - 7, yp + 6); g.closePath(); g.fill();
    if (inRange) {
      const xT = tX(L, s.T - 273.15), P = profile(), xQ = qX(L, QDEF[state.q].get(s), P);
      D.ball(g, xT, yp, 5.5, C['al-temp'], { glow: 0.4 });
      D.ball(g, xQ, yp, 5.5, C['al-q'], { glow: 0.4 });
      const above = yp > L.yTop + 30;
      const ty = above ? yp - 8 : yp + 24;
      const tl = cel(s.T);
      g.font = font('700'); const tw = g.measureText(tl).width + 12;
      D.pill(g, tl, Math.max(L.t0 + tw / 2, Math.min(L.t1 - tw / 2, xT)), ty, C['al-temp'], 'center', font('700'));
      const ql = qText(s);
      g.font = font('700'); const qw = g.measureText(ql).width + 12;
      D.pill(g, ql, Math.max(L.q0 + qw / 2, Math.min(L.q1 - qw / 2, xQ)), ty, C['al-q'], 'center', font('700'));
      // 高度標籤放天空欄右邊，不和左邊的層名重疊
      D.pill(g, zLabel(state.z), L.s1 - 4, above ? yp - 4 : yp + 20, C.accent, 'right', font('700'));
    } else {
      D.pill(g, '↑ ' + zLabel(state.z), L.s1 - 4, L.yTop + 18, C.accent, 'right', font('700'));
    }
  }

  function drawTempPanel(g, L, font) {
    const r = tRange(), P = profile();
    // 底板
    g.fillStyle = D.alpha(C['canvas-bg'], D.dark ? 0.35 : 0.55);
    D.roundRect(g, L.t0, L.yTop, L.t1 - L.t0, L.yBot - L.yTop, 8); g.fill();
    g.strokeStyle = D.alpha(C.border, 0.8); g.lineWidth = 1; g.stroke();
    // 溫度刻度
    const st = niceStep(r[1] - r[0], L.narrow ? 3 : 5);
    for (let v = Math.ceil(r[0] / st) * st; v <= r[1] + 1e-9; v += st) {
      const x = Math.round(tX(L, v)) + 0.5;
      g.strokeStyle = D.alpha(C.text, v === 0 ? 0.25 : 0.08); g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, L.yTop); g.lineTo(x, L.yBot); g.stroke();
      // 太靠近面板左右邊界的刻度數字不寫，免得和隔壁面板的數字擠在一起
      if (x > L.t0 + 12 && x < L.t1 - 12) D.haloText(g, num(v, 0), x, L.yBot + 11, C.muted, 'center', 'middle', font('500', -0.5));
    }
    D.haloText(g, T('溫度（°C）', 'Temperature (°C)'), (L.t0 + L.t1) / 2, L.yBot + 26, C['al-temp'], 'center', 'middle', font('600'));
    g.save();
    g.beginPath(); g.rect(L.t0, L.yTop, L.t1 - L.t0, L.yBot - L.yTop); g.clip();
    const pl = function (pts, color, w, dash) {
      g.strokeStyle = color; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; g.setLineDash(dash || []);
      g.beginPath();
      pts.forEach(function (p, i) { const x = tX(L, p[1]), y = yOf(L, p[0]); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke(); g.setLineDash([]);
    };
    if (state.std && Math.abs(state.dT) > 1e-9) pl(P.Ts, D.alpha(C['al-std'], 0.9), 1.6, [6, 4]);
    pl(P.Tp, D.alpha(C['al-temp'], 0.22), 7);
    pl(P.Tp, C['al-temp'], 2.4);
    // 探空紀錄：橘色小點
    const sd = state.sonde;
    for (let i = 0; i < sd.length; i++) {
      const p = sd[i];
      if (p.z / 1000 > state.range) continue;
      g.fillStyle = C['al-sonde'];
      g.beginPath(); g.arc(tX(L, p.T - 273.15), yOf(L, p.z / 1000), 2.3, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  function drawQPanel(g, L, font) {
    const P = profile(), isLog = qIsLog();
    g.fillStyle = D.alpha(C['canvas-bg'], D.dark ? 0.35 : 0.55);
    D.roundRect(g, L.q0, L.yTop, L.q1 - L.q0, L.yBot - L.yTop, 8); g.fill();
    g.strokeStyle = D.alpha(C.border, 0.8); g.lineWidth = 1; g.stroke();
    const f2 = font('500', -0.5);
    if (isLog) {
      const nd = P.b - P.a, every = nd > 8 ? 2 : 1;
      for (let e = P.a; e <= P.b; e++) {
        const x = Math.round(qX(L, Math.pow(10, e), P)) + 0.5;
        g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, L.yTop); g.lineTo(x, L.yBot); g.stroke();
        if (x > L.q0 + 12 && x < L.q1 - 12 && (e - P.a) % every === 0 && (!L.narrow || nd <= 5 || (e - P.a) % (every * 2) === 0)) D.supText(g, '10', num(e, 0), x, L.yBot + 15, C.muted, f2, 'center');
      }
    } else {
      const st = niceStep(P.b - P.a, L.narrow ? 2 : 4);
      for (let v = Math.ceil(P.a / st) * st; v <= P.b + 1e-9; v += st) {
        const x = Math.round(qX(L, v, P)) + 0.5;
        g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, L.yTop); g.lineTo(x, L.yBot); g.stroke();
        if (x > L.q0 + 12 && x < L.q1 - 12) D.haloText(g, num(v, 0), x, L.yBot + 11, C.muted, 'center', 'middle', f2);
      }
    }
    const Q = QDEF[state.q];
    D.haloText(g, T(Q.zh, Q.en) + T('（', ' (') + Q.unit + T('）', ')'), (L.q0 + L.q1) / 2, L.yBot + 28, C['al-q'], 'center', 'middle', font('600'));
    g.save();
    g.beginPath(); g.rect(L.q0, L.yTop, L.q1 - L.q0, L.yBot - L.yTop); g.clip();
    const pl = function (pts, color, w, dash) {
      g.strokeStyle = color; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; g.setLineDash(dash || []);
      g.beginPath();
      pts.forEach(function (p, i) { const x = qX(L, p[1], P), y = yOf(L, p[0]); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke(); g.setLineDash([]);
    };
    if (state.std && Math.abs(state.dT) > 1e-9) pl(P.std, D.alpha(C['al-std'], 0.9), 1.6, [6, 4]);
    // 氣壓圖：標出「一半的空氣」
    if (state.q === 'P') {
      const z50 = K.heightOfPressure(K.P0 / 2, state.dT) / 1000;
      if (z50 <= state.range) {
        const x = qX(L, K.P0 / 200, P), y = yOf(L, z50);
        g.save(); g.setLineDash([2, 3]); g.strokeStyle = D.alpha(C['al-q'], 0.6); g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, L.yBot); g.stroke(); g.restore();
        if (state.range <= 50) D.haloText(g, T('一半', 'half'), x + 4, y - 3, C['al-q'], 'left', 'bottom', font('600', -1.5));
      }
    }
    pl(P.pts, D.alpha(C['al-q'], 0.22), 7);
    pl(P.pts, C['al-q'], 2.4);
    g.restore();
  }

  // ---------- 氣球 ----------
  function balloonDraw(g, x, y, D0px, color, popping) {
    // 繩子與探空儀
    const r = D0px;
    g.strokeStyle = D.alpha(C.text, 0.55); g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(x, y + r); g.lineTo(x, y + r + 16); g.stroke();
    g.fillStyle = D.dark ? '#e2e8f0' : '#334155';
    g.fillRect(x - 3, y + r + 16, 6, 5);
    if (popping) return;
    const bg = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    bg.addColorStop(0, D.mix(color, '#ffffff', 0.7)); bg.addColorStop(0.55, color); bg.addColorStop(1, D.shade(color, -0.35));
    g.fillStyle = bg;
    g.beginPath(); g.ellipse(x, y, r, r * 1.06, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = D.shade(color, -0.3);
    g.beginPath(); g.moveTo(x - 2, y + r * 1.04); g.lineTo(x + 2, y + r * 1.04); g.lineTo(x, y + r * 1.04 + 3); g.closePath(); g.fill();
    g.fillStyle = D.alpha('#ffffff', 0.55);
    g.beginPath(); g.ellipse(x - r * 0.35, y - r * 0.42, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2); g.fill();
  }
  function balloonPx(Dm) { return Math.max(4, Math.min(30, 2.4 + 2.2 * Dm)); }
  function drawBalloon(g, L, tnow, font) {
    const b = state.balloon;
    const x = L.s0 + (L.s1 - L.s0) * 0.56;
    if (!b) {
      // 地面上等著放飛的氣球（照 D0 畫大小）
      const r = balloonPx(state.D0);
      balloonDraw(g, x, yOf(L, 0) - r - 22, r, C['al-balloon']);
      return;
    }
    const zkm = b.z / 1000;
    if (zkm > state.range) {
      D.pill(g, '↑ ' + T('氣球 ', 'balloon ') + kmText(zkm), L.s1 - 4, L.yTop + 18, C['al-balloon'], 'right', font('600', -1));
      return;
    }
    const st = K.balloonAt(b, b.z);
    const r = balloonPx(st.D);
    const yb = yOf(L, zkm) - r - 21;      // 探空儀（盒子）在 zkm 的位置
    if (state.bstate === 'burst') {
      const u = Math.min(1, (tnow - state.burstAt) / 900);
      balloonDraw(g, x, yb, r, C['al-balloon'], true);
      if (u < 1) {
        // 碎片往外飛
        for (let i = 0; i < 9; i++) {
          const a = i / 9 * Math.PI * 2 + 0.3, d = r * (0.6 + u * 1.6);
          g.fillStyle = D.alpha(C['al-balloon'], 1 - u);
          g.beginPath(); g.ellipse(x + Math.cos(a) * d, yb + Math.sin(a) * d, 3.5, 1.6, a, 0, Math.PI * 2); g.fill();
        }
        g.strokeStyle = D.alpha('#fde68a', 1 - u); g.lineWidth = 1.4;
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.5, yb + Math.sin(a) * r * 0.5); g.lineTo(x + Math.cos(a) * r * (0.9 + u), yb + Math.sin(a) * r * (0.9 + u)); g.stroke(); }
      }
      D.pill(g, T('爆破 ', 'Burst at ') + kmText(zkm), x, yb - 6, C['al-balloon'], 'center', font('700', -0.5));
      return;
    }
    balloonDraw(g, x, yb, r, C['al-balloon']);
    // 爆破直徑的虛線圈（比例相同）
    const rb = balloonPx(b.burstD);
    if (rb - r > 2) {
      g.save(); g.setLineDash([3, 3]); g.strokeStyle = D.alpha(C['al-balloon'], 0.45); g.lineWidth = 1;
      g.beginPath(); g.arc(x, yb, rb, 0, Math.PI * 2); g.stroke(); g.restore();
    }
    D.pill(g, 'D ' + num(st.D, 2) + ' m', x + Math.max(r, 12) + 4, yb + 5, C['al-balloon'], 'left', font('600', -1));
  }

  // ---------- 下方圖表：氣球 ----------
  const GM = { l: 46, r: 14, t: 16, b: 34 };
  function frame(g, W, H, x0, x1, y0, y1, xlab, ylab, xfmt, yfmt) {
    const X = function (v) { return GM.l + (v - x0) / (x1 - x0) * (W - GM.l - GM.r); };
    const Y = function (v) { return H - GM.b - (v - y0) / (y1 - y0) * (H - GM.t - GM.b); };
    g.fillStyle = C['canvas-bg']; g.fillRect(0, 0, W, H);
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, D.dark ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.04)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    const fs = W < 520 ? 10.5 : 11.5;
    const xs = niceStep(x1 - x0, W < 520 ? 4 : 7), ys = niceStep(y1 - y0, 5);
    for (let v = Math.ceil(x0 / xs) * xs; v <= x1 + 1e-9; v += xs) {
      const px = Math.round(X(v)) + 0.5;
      g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1; g.beginPath(); g.moveTo(px, GM.t); g.lineTo(px, H - GM.b); g.stroke();
      D.haloText(g, xfmt(v), px, H - GM.b + 12, C.muted, 'center', 'middle', '500 ' + fs + 'px ' + FONT);
    }
    for (let v = Math.ceil(y0 / ys) * ys; v <= y1 + 1e-9; v += ys) {
      const py = Math.round(Y(v)) + 0.5;
      g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1; g.beginPath(); g.moveTo(GM.l, py); g.lineTo(W - GM.r, py); g.stroke();
      D.haloText(g, yfmt(v), GM.l - 5, py, C.muted, 'right', 'middle', '500 ' + fs + 'px ' + FONT);
    }
    g.strokeStyle = D.alpha(C.text, 0.35); g.lineWidth = 1;
    g.beginPath(); g.moveTo(GM.l + 0.5, GM.t); g.lineTo(GM.l + 0.5, H - GM.b + 0.5); g.lineTo(W - GM.r, H - GM.b + 0.5); g.stroke();
    D.haloText(g, xlab, W - GM.r, H - 6, C.muted, 'right', 'bottom', '600 ' + fs + 'px ' + FONT);
    D.haloText(g, ylab, GM.l + 6, GM.t + 2, C.muted, 'left', 'top', '600 ' + fs + 'px ' + FONT);
    return { X: X, Y: Y, fs: fs };
  }
  function line(g, pts, X, Y, color, w, dash) {
    if (pts.length < 2) return;
    g.save(); g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; if (dash) g.setLineDash(dash);
    g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(X(p[0]), Y(p[1])); else g.moveTo(X(p[0]), Y(p[1])); }); g.stroke(); g.restore();
  }
  const FLIGHT_COLORS = ['#94a3b8', '#a78bfa', '#2dd4bf', '#fbbf24'];
  function drawChart() {
    if (!grSize) return;
    const W = grSize.w, H = grSize.h, g = gtx;
    g.clearRect(0, 0, W, H);
    const old = state.flights.slice(-4);
    const cur = state.track;
    if (state.chart === 'time') {
      let tMax = 60 * 30, zMax = 10;
      old.concat([{ track: cur }]).forEach(function (f) { f.track.forEach(function (p) { tMax = Math.max(tMax, p[0]); zMax = Math.max(zMax, p[1] / 1000); }); });
      tMax = Math.ceil(tMax / 60 / 10) * 10; zMax = Math.ceil(zMax / 5) * 5;
      const F = frame(g, W, H, 0, tMax, 0, zMax, T('時間（分鐘）', 'Time (min)'), T('高度（km）', 'Height (km)'),
        function (v) { return num(v, 0); }, function (v) { return num(v, 0); });
      // 對流層頂、平流層頂
      [[TROPO, LAYERS[1].c, T('對流層頂', 'Tropopause')], [STRATO0, LAYERS[2].c, T('平流層頂', 'Stratopause')]].forEach(function (b) {
        if (b[0] > zMax) return;
        line(g, [[0, b[0]], [tMax, b[0]]], F.X, F.Y, D.alpha(C[b[1]], 0.6), 1, [5, 4]);
        D.haloText(g, b[2], W - GM.r - 4, F.Y(b[0]) - 3, C[b[1]], 'right', 'bottom', '600 ' + F.fs + 'px ' + FONT);
      });
      old.forEach(function (f, i) {
        const col = FLIGHT_COLORS[(state.flights.length - old.length + i) % FLIGHT_COLORS.length];
        const pts = f.track.map(function (p) { return [p[0] / 60, p[1] / 1000]; });
        line(g, pts, F.X, F.Y, D.alpha(col, 0.85), 1.8);
        const q = pts[pts.length - 1];
        if (q) { g.fillStyle = col; g.beginPath(); g.arc(F.X(q[0]), F.Y(q[1]), 3, 0, Math.PI * 2); g.fill(); }
      });
      if (cur.length) {
        const pts = cur.map(function (p) { return [p[0] / 60, p[1] / 1000]; });
        line(g, pts, F.X, F.Y, D.alpha(C['al-balloon'], 0.25), 6);
        line(g, pts, F.X, F.Y, C['al-balloon'], 2.4);
        const q = pts[pts.length - 1];
        D.ball(g, F.X(q[0]), F.Y(q[1]), 5, C['al-balloon'], { glow: state.bstate === 'flying' ? 0.5 : undefined });
      } else if (!old.length) {
        D.haloText(g, T('按「放飛」開始一次飛行', 'Press “Launch” to start a flight'), W / 2, H / 2, C.muted, 'center', 'middle', '600 ' + F.fs + 'px ' + FONT);
      }
    } else {
      let zMax = 10, dMax = 4;
      old.concat([{ track: cur }]).forEach(function (f) { f.track.forEach(function (p) { zMax = Math.max(zMax, p[1] / 1000); dMax = Math.max(dMax, p[2]); }); });
      const bD = K.BALLOONS[state.btype].burst;
      dMax = Math.ceil(Math.max(dMax, bD) * 1.08);
      zMax = Math.ceil(zMax / 5) * 5;
      const F = frame(g, W, H, 0, zMax, 0, dMax, T('高度（km）', 'Height (km)'), T('氣球直徑（m）', 'Balloon diameter (m)'),
        function (v) { return num(v, 0); }, function (v) { return num(v, 0); });
      line(g, [[0, bD], [zMax, bD]], F.X, F.Y, D.alpha(C['al-balloon'], 0.7), 1.2, [6, 4]);
      D.haloText(g, BNAME[state.btype] + T(' 的爆破直徑 ', ' bursts at ') + num(bD, 2) + ' m', W - GM.r - 4, F.Y(bD) - 3, C['al-balloon'], 'right', 'bottom', '600 ' + F.fs + 'px ' + FONT);
      // 理論曲線 D = D0 ((P0/P)(T/T0))^(1/3)（目前設定）
      const s0 = surface(), th = [];
      for (let z = 0; z <= zMax + 1e-9; z += zMax / 200) { const s = K.at(z * 1000, state.dT); th.push([z, state.D0 * Math.cbrt((s0.P / s.P) * (s.T / s0.T))]); }
      line(g, th, F.X, F.Y, D.alpha(C.muted, 0.7), 1.2, [2, 3]);
      old.forEach(function (f, i) {
        const col = FLIGHT_COLORS[(state.flights.length - old.length + i) % FLIGHT_COLORS.length];
        line(g, f.track.map(function (p) { return [p[1] / 1000, p[2]]; }), F.X, F.Y, D.alpha(col, 0.85), 1.8);
      });
      if (cur.length) {
        const pts = cur.map(function (p) { return [p[1] / 1000, p[2]]; });
        line(g, pts, F.X, F.Y, C['al-balloon'], 2.4);
        const q = pts[pts.length - 1];
        D.ball(g, F.X(q[0]), F.Y(q[1]), 5, C['al-balloon']);
      }
    }
  }
  function chartAria() {
    return state.chart === 'time' ? T('探空氣球的高度隨時間的變化', 'Height of the weather balloon against time')
      : T('探空氣球的直徑隨高度的變化，虛線是爆破直徑', 'Diameter of the weather balloon against height; the dashed line is the bursting diameter');
  }

  // =====================================================================
  // 事件、音效
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function setStatus(s) { $('status').innerHTML = s; }
  const LAYER_FREQ = [392, 523, 659, 784];
  let lastLayer = 0;
  function layerCheck(zkm, who) {
    const ly = K.layerOf(zkm * 1000);
    if (ly !== lastLayer) {
      const S = sound(); if (S) S.tone({ freq: LAYER_FREQ[ly], dur: 0.14, type: 'triangle', gain: 0.16 });
      if (who === 'balloon') setStatus(T('氣球進入', 'The balloon enters the ') + layerName(ly) + T('。', '.'));
      lastLayer = ly;
    }
  }
  let lastEmit = 0;
  function afterChange(force) {
    cache = null;
    updateReadouts();
    const tNow = performance.now();
    if (force || tNow - lastEmit > 200) { lastEmit = tNow; emit('state', snapshot()); }
    requestDraw();
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function refreshOutputs() {
    setOut(el.z, outNum(state.z, 2, 3));
    setOut(el.dT, (state.dT > 0 ? '+' : '') + outNum(state.dT, 1, 2));
    setOut(el.d0, outNum(state.D0, 2, 3));
    $('logBtn').setAttribute('aria-pressed', String(state.log));
    $('logBtn').disabled = !QDEF[state.q].log;
    $('stdBtn').setAttribute('aria-pressed', String(state.std));
    $('unmark').disabled = !state.ref;
  }
  let lastSay = 0;
  function updateReadouts() {
    const s = now();
    setHTML('rLayer', '<span style="color:' + C[LAYERS[s.layer].c] + '">' + layerName(s.layer) + '</span>');
    setHTML('rT', cel(s.T) + T('（', ' (') + num(s.T, 1) + ' K' + T('）', ')'));
    const lp = s.lapse;
    setHTML('rLapse', Math.abs(lp) < 0.005 ? T('0（等溫）', '0 (isothermal)')
      : num(lp, 2) + ' K/km' + (lp > 0 ? T('（往上變冷）', ' (cooler upward)') : T('（往上變暖：逆溫）', ' (warmer upward: inversion)')));
    setHTML('rP', s.P >= 100 ? pText(s.P) + T('（', ' (') + sig(s.P / 101325, 3) + ' atm' + T('）', ')') : pText(s.P) + T('（', ' (') + sci(s.P / 101325, 3) + ' atm' + T('）', ')'));
    setHTML('rAbove', pctText(s.above));
    setHTML('rRho', rhoText(s.rho));
    setHTML('rO2', pText(s.pO2) + T('（海平面的 ', ' (') + pctText(s.P / K.P0) + T('）', ' of sea level)'));
    setHTML('rBoil', s.boil == null ? T('沒有液態水（低於三相點）', 'no liquid water (below the triple point)') : num(s.boil, 1) + ' °C');
    setHTML('rC', num(s.c, 1) + ' m/s');
    setHTML('rH', num(s.H / 1000, 2) + ' km');
    setHTML('rMfp', lenText(s.mfp));
    // 參考點
    const r = refState();
    if (r) {
      const dz = state.z - state.ref.z, ratio = s.P / r.P;
      let html = T('參考點 <b>', 'Mark at <b>') + zLabel(state.ref.z) + '</b>（' + pText(r.P) + '）' + T('：高度差 Δz = <b>', ': height difference Δz = <b>') +
        (Math.abs(dz) < 10 ? sgn(dz * 1000, 1) + ' m' : sgn(dz, 3) + ' km') + T('</b>，氣壓比 P／P<sub>參考</sub> = <b>', '</b>, pressure ratio P/P<sub>mark</sub> = <b>') +
        (ratio > 1e-3 && ratio < 1e3 ? sig(ratio, 4) : sci(ratio, 3)) + T('</b>，溫度差 <b>', '</b>, temperature difference <b>') + sgn(s.T - r.T, 1) + ' K</b>';
      if (Math.abs(dz) > 1e-4) {
        const Hm = dz * 1000 / Math.log(r.P / s.P);
        const dP = s.P - r.P;
        html += T('；氣壓差 <b>', '; pressure difference <b>') + (Math.abs(dP) >= 100 ? sgn(dP / 100, 2) + ' hPa' : sgn(dP, 2) + ' Pa') +
          T('</b>；兩點之間的平均尺度高度 <b>', '</b>; mean scale height between them <b>') + num(Hm / 1000, 3) + ' km</b>';
      }
      setHTML('refHint', html + T('。', '.'));
    } else setHTML('refHint', T('還沒有參考點。按「記下這一點」，再移動探測點，就能比較兩個高度。', 'No reference point yet. Press “Mark this point”, then move the probe to compare two heights.'));
    // ΔT 說明
    const s0 = surface(), z500 = K.heightOfPressure(50000, state.dT), z500s = K.heightOfPressure(50000, 0);
    setHTML('dtHint', T('海平面 <b>', 'Sea level <b>') + cel(s0.T) + T('</b>、1013.25 hPa；500 hPa 等壓面在 <b>', '</b>, 1013.25 hPa; the 500 hPa surface is at <b>') + num(z500 / 1000, 3) + ' km</b>' +
      (Math.abs(state.dT) > 1e-9 ? T('（標準大氣 ', ' (standard ') + num(z500s / 1000, 3) + ' km' + T('）', ')') : '') + T('。', '.'));
    // 氣球
    updateBalloonReadouts();
    const txt = T('高度 ', 'Height ') + zLabel(state.z) + T('，', ', ') + layerName(s.layer) + T('，溫度 ', ', temperature ') + cel(s.T) + T('，氣壓 ', ', pressure ') + pText(s.P);
    const tn = performance.now();
    if ($('srNow').textContent !== txt && tn - lastSay > 1500) { $('srNow').textContent = txt; lastSay = tn; }
  }
  function updateBalloonReadouts() {
    const b = state.balloon;
    const b0 = K.launch(state.btype, state.D0, state.dT), st0 = K.balloonAt(b0, 0);
    setHTML('liftHint', st0.lift > 0
      ? T('淨浮力 <b>', 'Net lift <b>') + num(st0.freeLift, 2) + T('</b> kg（', '</b> kg (') + num(st0.lift, 1) + T(' N），出發時每秒上升 <b>', ' N); it leaves the ground at <b>') + num(st0.v, 2) + T('</b> m。', '</b> m/s.')
      : T('<b>浮力不夠</b>：氣球加探空儀比它排開的空氣還重（差 ', '<b>Not enough lift</b>: balloon and radiosonde weigh more than the air they push aside (short by ') + num(-st0.freeLift, 2) + T(' kg），飛不起來。', ' kg), so it cannot take off.'));
    if (b) {
      const st = K.balloonAt(b, b.z);
      setHTML('bZ', zLabel(b.z / 1000));
      setHTML('bV', state.bstate === 'burst' ? T('—（已爆破）', '— (burst)') : num(st.v, 2) + ' m/s');
      setHTML('bD', num(st.D, 2) + ' m ／ ' + num(b.burstD, 2) + ' m');
      setHTML('bVol', num(st.V, st.V < 100 ? 2 : 0) + ' m³');
      setHTML('bL', liftText(st.freeLift));
      setHTML('bT', timeText(b.t));
    } else {
      setHTML('bZ', T('在地面', 'on the ground'));
      setHTML('bV', '—');
      setHTML('bD', num(state.D0, 2) + ' m ／ ' + num(K.BALLOONS[state.btype].burst, 2) + ' m');
      setHTML('bVol', num(Math.PI * Math.pow(state.D0, 3) / 6, 2) + ' m³');
      setHTML('bL', liftText(st0.freeLift));
      setHTML('bT', '—');
    }
    const last = state.flights.slice(-3).reverse();
    setHTML('bLog', last.length ? last.map(function (f) { return kmText(f.zBurst / 1000) + '<span style="color:var(--muted)">（' + BNAME[f.type] + '・' + num(f.D0, 2) + ' m' + (Math.abs(f.dT) > 1e-9 ? '・ΔT ' + sgn(f.dT, 1) : '') + '）</span>'; }).join('<br>') : '—');
  }
  function updateLaunchButton() {
    const b = $('launch');
    b.textContent = state.bstate === 'flying' ? T('暫停', 'Pause') : state.bstate === 'paused' ? T('繼續', 'Resume') : T('放飛', 'Launch');
    $('recall').disabled = !state.balloon;
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }

  // =====================================================================
  // 氣球飛行
  // =====================================================================
  function resetBalloon(msg) {
    const had = !!state.balloon;
    state.balloon = null; state.bstate = 'ground'; state.sonde = []; state.track = [];
    updateLaunchButton();
    if (had && msg) setStatus(msg);
  }
  function launch() {
    acted();
    if (state.bstate === 'flying') { state.bstate = 'paused'; updateLaunchButton(); setStatus(T('暫停。', 'Paused.')); requestDraw(); return; }
    if (state.bstate === 'paused') { state.bstate = 'flying'; updateLaunchButton(); setStatus(T('繼續上升。', 'Rising again.')); requestDraw(); return; }
    const b = K.launch(state.btype, state.D0, state.dT), st = K.balloonAt(b, 0);
    if (st.lift <= 0) {
      setStatus(T('浮力不夠，氣球飛不起來：多充一點氦氣，或換小一點的氣球。', 'Not enough lift — the balloon will not rise. Fill it with more helium or use a smaller balloon.'));
      const S = sound(); if (S) S.tone({ freq: 260, dur: 0.2, type: 'sine', gain: 0.14 });
      return;
    }
    state.balloon = b; state.bstate = 'flying';
    state.sonde = [{ z: 0, T: K.at(0, state.dT).T }]; state.track = [[0, 0, state.D0]];
    b.v0 = st.v;
    lastLayer = 0;
    const S = sound(); if (S) S.sweep({ from: 330, to: 620, dur: 0.35, gain: 0.14 });
    setStatus(T('放飛！', 'Launched! ') + BNAME[state.btype] + T(' 的氣球、地面直徑 ', ' balloon, ') + num(state.D0, 2) + T(' m，每秒上升 ', ' m across on the ground, rising at ') + num(st.v, 2) + ' m/s' + T('。', '.'));
    emit('launch', { type: state.btype, D0: state.D0, dT: state.dT, v0: st.v, lift: st.freeLift });
    updateLaunchButton(); updateBalloonReadouts(); requestDraw();
  }
  function flyStep(simSec) {
    const b = state.balloon;
    let left = simSec;
    while (left > 1e-9 && !b.burst) {
      const h = Math.min(4, left);
      K.stepBalloon(b, h);
      left -= h;
      const zkm = b.z / 1000;
      const lastS = state.sonde[state.sonde.length - 1];
      if (!lastS || b.z - lastS.z >= (state.range <= 20 ? 120 : 300)) state.sonde.push({ z: b.z, T: K.at(b.z, b.dT).T });
      const lastT = state.track[state.track.length - 1];
      if (!lastT || b.t - lastT[0] >= 20 || b.burst) state.track.push([b.t, b.z, K.balloonAt(b, b.z).D]);
      layerCheck(zkm, 'balloon');
      if (b.z >= K.ZMAX - 1) break;
    }
    if (b.burst) onBurst();
  }
  function onBurst() {
    const b = state.balloon, s = K.at(b.z, b.dT);
    state.bstate = 'burst'; state.burstAt = performance.now();
    const f = { type: b.type, D0: b.D0, dT: b.dT, v0: b.v0, zBurst: b.z, Pburst: s.P, Tburst: s.T, t: b.t, track: state.track.slice() };
    state.flights.push(f);
    if (state.flights.length > 12) state.flights.shift();
    const S = sound();
    if (S) { S.noise({ filter: 1400, q: 0.8, dur: 0.16, gain: 0.5 }); S.tone({ freq: 300, dur: 0.18, type: 'triangle', gain: 0.14, delay: 0.03 }); }
    setStatus(T('氣球在 ', 'The balloon burst at ') + kmText(b.z / 1000) + T(' 爆破（', ' (') + pText(s.P) + T('、', ', ') + cel(s.T) + T('，飛了 ', ', after ') + timeText(b.t) + T('）。探空儀會掛著降落傘落回地面。', '). The radiosonde comes back down on its parachute.'));
    emit('burst', {
      type: f.type, D0: f.D0, dT: f.dT, v0: f.v0, zBurst: f.zBurst, Pburst: f.Pburst, Tburst: f.Tburst, t: f.t,
      flights: state.flights.map(function (x) { return { type: x.type, D0: x.D0, dT: x.dT, v0: x.v0, zBurst: x.zBurst, Pburst: x.Pburst }; })
    });
    updateLaunchButton();
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  function setSeg(id, attr, v) {
    document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(v))); });
  }
  function setSlider(inp, v) { if (window.LabNum) window.LabNum.set(inp, v); else inp.value = v; }
  function setZ(zkm, quiet) {
    zkm = Math.max(0, Math.min(ZTOP, zkm));
    setSlider(el.z, zkm);
    readSliders(); refreshOutputs();
    layerCheck(state.z, 'probe');
    if (!quiet) afterChange();
  }
  el.z.addEventListener('input', function () { acted(); readSliders(); refreshOutputs(); layerCheck(state.z, 'probe'); afterChange(); });
  el.z.addEventListener('change', function () { readSliders(); refreshOutputs(); afterChange(true); });
  el.dT.addEventListener('input', function () { acted(); dtChanged(); afterChange(); });
  el.dT.addEventListener('change', function () { dtChanged(); afterChange(true); });
  el.d0.addEventListener('input', function () { acted(); d0Changed(); afterChange(); });
  el.d0.addEventListener('change', function () { d0Changed(); afterChange(true); });
  function dtChanged() {
    const old = state.dT;
    readSliders(); refreshOutputs(); profKey = '';
    if (state.balloon && Math.abs(old - state.dT) > 1e-12) resetBalloon(T('大氣的溫度改了：氣球收回地面。', 'The air temperature changed, so the balloon was brought back down.'));
  }
  function d0Changed() {
    const old = state.D0;
    readSliders(); refreshOutputs();
    if (state.balloon && Math.abs(old - state.D0) > 1e-12) resetBalloon(T('充氣量改了：氣球收回地面重新充氣。', 'The fill changed, so the balloon was brought back down to be refilled.'));
    updateBalloonReadouts();
  }
  document.querySelectorAll('.presets button[data-z]').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      setZ(+b.getAttribute('data-z'), true);
      if (state.z > state.range) { state.range = state.z > 50 ? 120 : state.z > 20 ? 50 : 20; setSeg('rangeSeg', 'data-range', state.range); profKey = ''; skyKey = ''; }
      const s = now();
      setStatus(b.getAttribute('title') ? (T(b.getAttribute('title'), b.getAttribute('data-en-title')) + T('：', ': ') + cel(s.T) + T('、', ', ') + pText(s.P) + T('。', '.')) : '');
      afterChange(true);
    });
  });
  document.querySelectorAll('.presets button[data-dt]').forEach(function (b) {
    b.addEventListener('click', function () { acted(); setSlider(el.dT, +b.getAttribute('data-dt')); dtChanged(); afterChange(true); });
  });
  document.querySelectorAll('#typeSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      const t = b.getAttribute('data-type');
      if (t === state.btype) return;
      state.btype = t; setSeg('typeSeg', 'data-type', t);
      if (state.balloon) resetBalloon(T('換了氣球：收回地面。', 'New balloon: the old one was brought back down.'));
      afterChange(true);
    });
  });
  document.querySelectorAll('#speedSeg button').forEach(function (b) {
    b.addEventListener('click', function () { state.speed = +b.getAttribute('data-speed'); setSeg('speedSeg', 'data-speed', state.speed); });
  });
  document.querySelectorAll('#rangeSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      state.range = +b.getAttribute('data-range'); setSeg('rangeSeg', 'data-range', state.range);
      profKey = ''; skyKey = '';
      afterChange(true);
    });
  });
  document.querySelectorAll('#qSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      state.q = b.getAttribute('data-q'); setSeg('qSeg', 'data-q', state.q);
      profKey = ''; refreshOutputs();
      afterChange(true);
    });
  });
  document.querySelectorAll('#chartSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.chart = b.getAttribute('data-chart'); setSeg('chartSeg', 'data-chart', state.chart);
      gr.setAttribute('aria-label', chartAria()); updateChartHint(); requestDraw();
    });
  });
  $('logBtn').addEventListener('click', function () { acted(); state.log = !state.log; profKey = ''; refreshOutputs(); afterChange(true); });
  $('stdBtn').addEventListener('click', function () { state.std = !state.std; refreshOutputs(); requestDraw(); });
  $('mark').addEventListener('click', function () {
    acted();
    state.ref = { z: state.z };
    const S = sound(); if (S) S.tone({ freq: 880, dur: 0.08, type: 'triangle', gain: 0.12 });
    setStatus(T('記下參考點：', 'Reference point marked at ') + zLabel(state.z) + T('。移動探測點來比較。', '. Move the probe to compare.'));
    refreshOutputs(); afterChange(true);
  });
  $('unmark').addEventListener('click', function () { acted(); state.ref = null; refreshOutputs(); afterChange(true); });
  $('launch').addEventListener('click', launch);
  $('recall').addEventListener('click', function () { acted(); resetBalloon(T('氣球收回地面了。', 'The balloon is back on the ground.')); afterChange(true); });
  $('clear').addEventListener('click', function () {
    state.flights = []; state.ref = null;
    if (state.bstate === 'burst') resetBalloon();
    state.sonde = state.balloon ? state.sonde : [];
    setStatus(T('已清除飛行紀錄與參考點。', 'Flight log and reference point cleared.'));
    refreshOutputs(); afterChange(true);
  });
  $('soundBtn').addEventListener('click', function () {
    const on = !(window.LabSettings && window.LabSettings.get('sound'));
    if (window.LabSettings) window.LabSettings.set('sound', on);
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });
  function updateChartHint() {
    setHTML('chartHint', state.chart === 'time'
      ? T('紅線是這一次飛行，灰、紫、綠、黃是之前的飛行。直線上升代表速率幾乎不變：淨浮力不變，氣球越大、空氣越稀，阻力剛好差不多。', 'Red: this flight; grey, purple, green and yellow: earlier ones. The nearly straight lines mean an almost steady climb: the lift does not change, and a bigger balloon in thinner air feels about the same drag.')
      : T('灰色點線是目前設定的理論曲線 D = D<sub>0</sub>[(P<sub>0</sub>/P)(T/T<sub>0</sub>)]<sup>1/3</sup>；碰到紅色虛線（爆破直徑）就破。', 'The grey dotted line is the theory for the current settings, D = D<sub>0</sub>[(P<sub>0</sub>/P)(T/T<sub>0</sub>)]<sup>1/3</sup>; the balloon bursts when it reaches the red dashed line (bursting diameter).'));
  }

  // ---------- 拖曳探測點 ----------
  let dragging = false;
  function cvPos(ev) { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function dragTo(ev) {
    if (!cvSize) return;
    const L = lay(cvSize.w, cvSize.h), p = cvPos(ev);
    const z = zOf(L, Math.max(L.yTop, Math.min(L.yBot, p[1])));
    const step = state.range <= 20 ? 0.01 : state.range <= 50 ? 0.05 : 0.1;
    setZ(Math.round(z / step) * step);
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (ev.button !== 0) return;
    acted(); dragging = true;
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    dragTo(ev);
  });
  cv.addEventListener('pointermove', function (ev) { if (dragging) dragTo(ev); });
  function endDrag() { if (dragging) { dragging = false; afterChange(true); } }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // ---------- 鍵盤 ----------
  if (window.LabKeys) {
    window.LabKeys.attach(cv, {
      label: T('大氣剖面。上下鍵移動探測點（按住 Shift 移動較多）；Enter 或空白鍵切換到整層溫度 ΔT。', 'Atmosphere profile. Up/down move the probe (hold Shift for bigger steps); Enter or Space switches to the column temperature ΔT.'),
      items: [{
        name: function () { return T('探測高度', 'Probe height'); },
        move: function (dx, dy, big) {
          const d = -(dy || -dx) * (big ? 1 : 0.1);
          if (!d) return false;
          acted(); setZ(Math.round((state.z + d) * 1000) / 1000);
          return true;
        },
        describe: function () { const s = now(); return T('高度 ', 'Height ') + zLabel(state.z) + T('，', ', ') + layerName(s.layer) + T('，', ', ') + cel(s.T) + T('，', ', ') + pText(s.P); }
      }, {
        name: function () { return T('整層溫度 ΔT', 'Column temperature ΔT'); },
        move: function (dx, dy, big) {
          const d = (dx || -dy) * (big ? 5 : 0.5);
          if (!d) return false;
          acted(); setSlider(el.dT, Math.max(-30, Math.min(30, state.dT + d))); dtChanged(); afterChange();
          return true;
        },
        describe: function () { return 'ΔT ' + sgn(state.dT, 1) + ' K'; }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // ---------- 分享 ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { q: state.q, rg: state.range, lg: state.log ? 1 : 0, bt: state.btype, ch: state.chart }; },
    set: function (o) {
      if (!o) return;
      if (QDEF[o.q]) { state.q = o.q; setSeg('qSeg', 'data-q', o.q); }
      if ([20, 50, 120].indexOf(+o.rg) >= 0) { state.range = +o.rg; setSeg('rangeSeg', 'data-range', state.range); }
      if (o.lg === 0 || o.lg === 1) state.log = o.lg === 1;
      if (BTYPES.indexOf(o.bt) >= 0) { state.btype = o.bt; setSeg('typeSeg', 'data-type', o.bt); }
      if (o.ch === 'time' || o.ch === 'size') { state.chart = o.ch; setSeg('chartSeg', 'data-chart', o.ch); gr.setAttribute('aria-label', chartAria()); }
      readSliders(); refreshOutputs(); profKey = ''; skyKey = ''; resetBalloon();
      cache = null; updateReadouts(); updateChartHint(); requestDraw();
    }
  });

  // =====================================================================
  // 繪圖迴圈
  // =====================================================================
  let raf = 0, lastFrame = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(loop); }
  function loop(tnow) {
    raf = 0;
    const dt = lastFrame ? Math.min(1 / 20, (tnow - lastFrame) / 1000) : 0;
    lastFrame = tnow;
    let busy = false;
    if (state.bstate === 'flying') {
      if (dt > 0 && !document.hidden) {
        flyStep(dt * state.speed);
        updateBalloonReadouts();
      }
      busy = state.bstate === 'flying';
    }
    if (state.bstate === 'burst' && tnow - state.burstAt < 950) busy = true;
    if (view3 && view3.active) { view3.frame(tnow); busy = busy || view3.busy(); }
    else drawProfile(tnow);
    drawChart();
    if (busy) raf = requestAnimationFrame(loop);
    else lastFrame = 0;
  }

  // =====================================================================
  // 3D 檢視（切換時才載入 three.js 與 atmosphere-layers-3d.js）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    K: K, T: T, D: D, state: state, colors: function () { return C; }, reducedMotion: reducedMotion,
    num: num, now: now, pText: pText, cel: cel, zLabel: zLabel, layerName: layerName, LAYERS: LAYERS,
    request: function () { requestDraw(); },
    onCam: function (kind) { acted(); emit('cam', { preset: kind }); },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.AtmosphereLayers3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.AtmosphereLayers3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/atmosphere-layers-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.AtmosphereLayers3D) throw new Error('atmosphere-layers-3d.js did not load');
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function updateViewNotes() {
    const is3 = !!(view3 && view3.active);
    $('camBar').hidden = !is3;
    stage.classList.toggle('is3d', is3);
  }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable()) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 地球…', 'Loading the 3D Earth…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        view3 = window.AtmosphereLayers3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        updateViewNotes();
        requestAnimationFrame(function () { if (view3) { view3.onShow(); requestDraw(); } });
        requestDraw();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      if (view3) { view3.dispose(); view3 = null; }
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      updateViewNotes();
      resizeCv();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    setPressed('2d');
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 剖面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D profile is kept.');
    updateViewNotes();
    resizeCv();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); emit('view', { mode: '3d' }); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  ['Limb', 'Taiwan', 'Far'].forEach(function (k) {
    $('cam' + k).addEventListener('click', function () { if (view3) { view3.camTo(k.toLowerCase()); bridge.onCam(k.toLowerCase()); } });
  });

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  readSliders();
  refreshOutputs();
  updateLaunchButton();
  updateSoundButton();
  gr.setAttribute('aria-label', chartAria());
  updateChartHint();
  updateReadouts();
  lastLayer = K.layerOf(state.z * 1000);
  function themeChanged() {
    readColors(); skyKey = '';
    updateLaunchButton(); updateSoundButton(); updateReadouts(); updateChartHint();
    gr.setAttribute('aria-label', chartAria());
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lh = 0, gw = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lw || cv.clientHeight !== lh || gr.clientWidth !== gw) { lw = cv.clientWidth; lh = cv.clientHeight; gw = gr.clientWidth; if (gw > 0) resizeCv(); }
    }).observe(stage);
  } else window.addEventListener('resize', resizeCv);
  resizeCv();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastFrame = 0; requestDraw(); } });
  setStatus(T('標準大氣：海平面 15 °C、1013.25 hPa。在圖上上下拖曳，看溫度與氣壓怎麼變。', 'The standard atmosphere: 15 °C and 1013.25 hPa at sea level. Drag up and down on the picture to see how temperature and pressure change.'));
  requestDraw();
  // 測試用（Playwright）
  window.__al = { state: state, K: K, snapshot: snapshot, setZ: setZ, setView: setView, launch: launch,
    fly: function (sec) { if (state.balloon && state.bstate === 'flying') { flyStep(sec); afterChange(true); } } };
})();
