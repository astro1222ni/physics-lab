/* stars-hr.js — 「恆星的顏色與亮度：黑體輻射與 HR 圖」的畫面與互動
 * 物理計算全部在 stars-hr-core.js；3D 大小比較在 stars-hr-3d.js，切換到 3D 時才載入。 */
(function () {
  'use strict';
  const K = window.StarsCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : Math.pow(10, +el.value); };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const FONT = D.FONT;
  const log10 = Math.log10, pow10 = function (x) { return Math.pow(10, x); };
  // HR 圖的範圍：溫度 56000 K（左）到 1900 K（右）；光度 10^-5 到 10^6.6 L☉
  const LT0 = log10(56000), LT1 = log10(1900), LY0 = -5, LY1 = 6.6;
  const T_MIN = 2000, T_MAX = 50000, R_MIN = 0.005, R_MAX = 2000, M_MIN = K.MS_MIN, M_MAX = K.MS_MAX;
  const MAX_PINS = 8;

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = { temp: $('temp'), rad: $('rad'), mass: $('mass'), sel: $('starSel') };
  function regLog(r, dec) { if (window.LabNum) window.LabNum.register(r, { toValue: pow10, toPos: log10, min: pow10(+r.min), max: pow10(+r.max), decimals: dec }); }
  regLog(el.temp, 0); regLog(el.rad, 4); regLog(el.mass, 3);
  const state = {
    mode: 'free', T: K.T_SUN, R: 1, M: 1, spec: 'abs', pick: '', pins: [], acted: false, dragging: false
  };
  let internal = false;              // 程式自己改滑桿時，略過滑桿的 input 事件
  function setRange(r, v) { internal = true; if (window.LabNum) window.LabNum.set(r, v); else r.value = String(log10(v)); internal = false; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  /** 目前這顆星的完整物理量 */
  let cur = null;
  function compute() {
    let s;
    if (state.mode === 'ms') {
      const m = K.mainSequence(state.M);
      s = { T: m.T, R: m.R, L: m.L, M: state.M, life: m.life };
    } else s = { T: state.T, R: state.R, L: K.lumSun(state.R, state.T), M: null, life: null };
    const b = K.bands(s.T);
    s.peak = K.peak(s.T) * 1e9;
    s.cls = K.spectral(s.T);
    s.uv = b.uv; s.vis = b.vis; s.ir = b.ir;
    s.white = K.whiteDist(s.T);
    s.mbol = K.mbol(s.L);
    s.flux = K.flux(s.T);
    s.color = K.colorHex(s.T);
    s.region = region(s.T, s.L, s.R);
    cur = s;
    return s;
  }
  function readSliders() {
    state.T = clamp(val(el.temp), T_MIN, T_MAX);
    state.R = clamp(val(el.rad), R_MIN, R_MAX);
    state.M = clamp(val(el.mass), M_MIN, M_MAX);
  }
  // 主序帶：log L 對 log T 的表（由質量 0.1–20 M☉ 取樣），用來判斷一顆星在主序帶的上方還是下方
  const MS_TRACK = (function () {
    const a = [];
    for (let i = 0; i <= 400; i++) { const m = M_MIN * Math.pow(M_MAX / M_MIN, i / 400), s = K.mainSequence(m); a.push({ M: m, lt: log10(s.T), ll: log10(s.L) }); }
    return a;
  })();
  function msLogLAt(lt) {
    const a = MS_TRACK;
    if (lt <= a[0].lt) return null; if (lt >= a[a.length - 1].lt) return null;
    for (let i = 1; i < a.length; i++) if (a[i].lt >= lt) { const f = (lt - a[i - 1].lt) / (a[i].lt - a[i - 1].lt); return a[i - 1].ll + f * (a[i].ll - a[i - 1].ll); }
    return null;
  }
  /** HR 圖上的區域（教學用的粗分類） */
  function region(Tk, L, R) {
    if (R < 0.03 && L < 0.05) return 'wd';
    if (R >= 100 || L >= 1e4 && R >= 20) return 'super';
    const ms = msLogLAt(log10(Tk));
    if (ms == null) return R > 3 ? 'giant' : 'off';
    const d = log10(L) - ms;
    if (Math.abs(d) <= 0.5) return 'ms';
    if (d > 0.5) return R >= 3 ? 'giant' : 'above';
    return 'below';
  }
  function regionName(k) {
    return { ms: T('主序帶附近', 'near the main sequence'), giant: T('巨星區', 'giant region'), super: T('超巨星區', 'supergiant region'),
      wd: T('白矮星區', 'white-dwarf region'), above: T('主序帶上方', 'above the main sequence'), below: T('主序帶下方', 'below the main sequence'),
      off: T('主序帶以外', 'off the main sequence') }[k] || '—';
  }
  function colourName(Tk) {
    return Tk < 3700 ? T('橘紅色', 'orange-red') : Tk < 5000 ? T('橘色', 'orange') : Tk < 6000 ? T('黃白色', 'yellowish white')
      : Tk < 7500 ? T('白色', 'white') : Tk < 12000 ? T('藍白色', 'bluish white') : T('藍色', 'blue');
  }
  function starById(id) { for (let i = 0; i < K.STARS.length; i++) if (K.STARS[i].id === id) return K.STARS[i]; return null; }
  function starName(s) { return T(s.zh, s.en); }

  // =====================================================================
  // 數字格式
  // =====================================================================
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  /** 有效數字 n 位；很大或很小時用 a × 10<sup>b</sup>（HTML） */
  function sci(v, n, html) {
    if (!isFinite(v)) return '—';
    if (v === 0) return '0';
    const e = Math.floor(log10(Math.abs(v)));
    if (e >= -2 && e < 5) {
      const d = Math.max(0, n - 1 - e);
      return Number(Number(v.toPrecision(n)).toFixed(d)).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 }).replace(/,/g, html === false ? ',' : ' ');
    }
    let m = v / pow10(e), ee = e;
    let ms = m.toFixed(n - 1);
    if (+ms >= 10) { ee++; ms = (m / 10).toFixed(n - 1); }
    const ex = String(ee).replace('-', '−');
    return html === false ? ms + ' × 10^' + ex : ms + ' × 10<sup>' + ex + '</sup>';
  }
  function plain(v, n) { return sci(v, n, false).replace(/<\/?sup>/g, ''); }
  function sigText(v, n) { // 給螢幕閱讀器與 canvas：不用上標
    const e = Math.floor(log10(Math.abs(v)));
    if (e >= -2 && e < 5) return sci(v, n, false);
    return plain(v, n).replace(' × 10^', T(' 乘 10 的 ', ' times 10 to the ')).replace(/$/, T(' 次方', ''));
  }
  function years(y) {
    const zh = y >= 1e8 ? num(y / 1e8, y >= 1e10 ? 0 : y >= 1e9 ? 1 : 2) + ' 億年' : num(y / 1e4, 0) + ' 萬年';
    const en = y >= 1e9 ? num(y / 1e9, y >= 1e11 ? 0 : y >= 1e10 ? 1 : 2) + ' billion years' : num(y / 1e6, y >= 1e8 ? 0 : 1) + ' million years';
    return T(zh, en);
  }
  function nmText(nm) { return nm >= 1000 ? num(nm / 1000, 3) + ' μm' : num(nm, 0) + ' nm'; }
  function pct(f) { return f < 0.0005 ? '0%' : f < 0.01 ? num(f * 100, 2) + '%' : num(f * 100, 1) + '%'; }
  function outNum(v, d) {
    if (d === 0) return String(Math.round(v));
    const e = Math.floor(log10(Math.abs(v)));
    const dd = Math.max(0, Math.min(d, 3 - e));       // 約 4 位有效數字
    return Number(v.toFixed(dd)).toString();
  }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }

  // =====================================================================
  // 顏色
  // =====================================================================
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--surface',
      '--st-sky1', '--st-sky2', '--st-grid', '--st-ms', '--st-me', '--st-curve', '--st-sun', '--st-cmp', '--st-uv', '--st-ir']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }

  // =====================================================================
  // 主畫布：HR 圖（深淺色模式都畫在夜空底上）
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
  function resizeCv() { cvSize = fit(cv, ctx); grSize = fit(gr, gtx); bgCache = null; requestDraw(); }
  function lay() {
    const W = cvSize.w, H = cvSize.h, narrow = W < 520;
    const xl = narrow ? 50 : 58, xr = W - (narrow ? 40 : 50), yt = narrow ? 34 : 36, yb = H - (narrow ? 42 : 46);
    return { W: W, H: H, narrow: narrow, xl: xl, xr: xr, yt: yt, yb: yb,
      px: function (lt) { return xl + (LT0 - lt) / (LT0 - LT1) * (xr - xl); },
      py: function (ll) { return yt + (LY1 - ll) / (LY1 - LY0) * (yb - yt); },
      ltOf: function (x) { return LT0 - (x - xl) / (xr - xl) * (LT0 - LT1); },
      llOf: function (y) { return LY1 - (y - yt) / (yb - yt) * (LY1 - LY0); } };
  }
  /** 「10」加上標指數（canvas 沒有 <sup>，自己排） */
  function powText(g, e, x, y, color, align, size) {
    const base = '10', ex = String(e).replace('-', '−');
    g.save();
    g.font = '500 ' + size + 'px ' + FONT;
    const wb = g.measureText(base).width;
    g.font = '500 ' + (size * 0.74) + 'px ' + FONT;
    const we = g.measureText(ex).width;
    const w = e === 0 ? g.measureText('1').width : wb + we + 1;
    let x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = color;
    g.lineJoin = 'round'; g.strokeStyle = 'rgba(6,10,22,0.85)'; g.lineWidth = 3;
    if (e === 0) { g.font = '500 ' + size + 'px ' + FONT; g.strokeText('1', x0, y); g.fillText('1', x0, y); g.restore(); return; }
    g.font = '500 ' + size + 'px ' + FONT; g.strokeText(base, x0, y); g.fillText(base, x0, y);
    g.font = '500 ' + (size * 0.74) + 'px ' + FONT; g.strokeText(ex, x0 + wb + 1, y - size * 0.38); g.fillText(ex, x0 + wb + 1, y - size * 0.38);
    g.restore();
  }
  /** 夜空文字：深色光暈 */
  function skyText(g, text, x, y, color, align, base, font) {
    g.save(); g.font = font; g.textAlign = align; g.textBaseline = base; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(6,10,22,0.85)'; g.lineWidth = 3.5; g.strokeText(text, x, y);
    g.fillStyle = color; g.fillText(text, x, y); g.restore();
  }
  /** 深底標籤；y 是框的中線 */
  function tag(g, text, x, y, color, align, font, L) {
    g.save(); g.font = font;
    const w = g.measureText(text).width + 14, h = parseFloat(/(\d+(\.\d+)?)px/.exec(font)[1]) + 9;
    let x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
    x0 = Math.max(2, Math.min(L.W - w - 2, x0));
    const y0 = Math.max(2, Math.min(L.H - h - 2, y - h / 2));
    D.roundRect(g, x0, y0, w, h, h / 2);
    g.fillStyle = 'rgba(8,12,26,0.86)'; g.fill();
    g.strokeStyle = D.alpha(color, 0.8); g.lineWidth = 1; g.stroke();
    g.fillStyle = D.mix(color, '#ffffff', 0.3); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(text, x0 + 7, y0 + h / 2 + 0.5);
    g.restore();
    return { x0: x0, y0: y0, w: w, h: h };
  }
  function dotRadius(R) { return clamp(2.4 + 1.25 * (log10(R) + 2.3), 2, 9.5); }
  // 背景（夜空、格線、等半徑線、主序帶、區域名）放在離屏畫布，只有尺寸、語言或深淺色變了才重畫
  let bgCache = null, bgKey = '';
  function drawBackground(L) {
    const key = [L.W, L.H, cvSize.dpr, T('a', 'b')].join('|');
    if (bgCache && key === bgKey) return bgCache;
    bgKey = key;
    const c = bgCache || document.createElement('canvas');
    c.width = Math.round(L.W * cvSize.dpr); c.height = Math.round(L.H * cvSize.dpr);
    const g = c.getContext('2d');
    g.setTransform(cvSize.dpr, 0, 0, cvSize.dpr, 0, 0);
    const fs = L.narrow ? 10.5 : 11.5;
    // 夜空
    const sky = g.createLinearGradient(0, 0, 0, L.H);
    sky.addColorStop(0, '#0b1226'); sky.addColorStop(1, '#05070f');
    g.fillStyle = sky; g.fillRect(0, 0, L.W, L.H);
    const neb = g.createRadialGradient(L.W * 0.3, L.H * 0.25, 10, L.W * 0.3, L.H * 0.25, L.W * 0.7);
    neb.addColorStop(0, 'rgba(76,96,170,0.18)'); neb.addColorStop(1, 'rgba(76,96,170,0)');
    g.fillStyle = neb; g.fillRect(0, 0, L.W, L.H);
    // 背景小星點（固定亂數種子，每次一樣）
    let seed = 7;
    const rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < Math.round(L.W * L.H / 2600); i++) {
      const x = rnd() * L.W, y = rnd() * L.H, a = 0.12 + rnd() * 0.3, r = rnd() < 0.08 ? 1.1 : 0.6;
      g.fillStyle = 'rgba(226,232,240,' + a.toFixed(2) + ')'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // 繪圖區
    g.save();
    D.roundRect(g, L.xl, L.yt, L.xr - L.xl, L.yb - L.yt, 6);
    g.fillStyle = 'rgba(10,16,34,0.55)'; g.fill();
    g.strokeStyle = 'rgba(148,163,184,0.35)'; g.lineWidth = 1; g.stroke();
    g.clip();
    // 光譜型色帶（頂端細條）
    K.CLASSES.forEach(function (q, i) {
      const lo = i === K.CLASSES.length - 1 ? 1900 : Math.max(q.lo, 1900);
      const xa = L.px(log10(Math.min(q.hi, 56000))), xb = L.px(log10(lo));
      const grd = g.createLinearGradient(xa, 0, xb, 0);
      grd.addColorStop(0, D.alpha(K.colorHex(Math.min(q.hi, 56000)), 0.08)); grd.addColorStop(1, D.alpha(K.colorHex(lo), 0.08));
      g.fillStyle = grd; g.fillRect(xa, L.yt, xb - xa, L.yb - L.yt);
      g.strokeStyle = 'rgba(148,163,184,0.12)'; g.beginPath(); g.moveTo(Math.round(xb) + 0.5, L.yt); g.lineTo(Math.round(xb) + 0.5, L.yb); g.stroke();
    });
    // 格線
    g.strokeStyle = 'rgba(148,163,184,0.14)'; g.lineWidth = 1;
    for (let e = Math.ceil(LY0); e <= Math.floor(LY1); e++) { const y = Math.round(L.py(e)) + 0.5; g.beginPath(); g.moveTo(L.xl, y); g.lineTo(L.xr, y); g.stroke(); }
    // 等半徑線
    g.setLineDash([5, 5]); g.strokeStyle = 'rgba(148,163,184,0.38)';
    const radii = [0.001, 0.01, 0.1, 1, 10, 100, 1000];
    radii.forEach(function (R) {
      g.beginPath();
      [LT0, LT1].forEach(function (lt, i) { const ll = 2 * log10(R) + 4 * (lt - log10(K.T_SUN)); if (i) g.lineTo(L.px(lt), L.py(ll)); else g.moveTo(L.px(lt), L.py(ll)); });
      g.stroke();
    });
    g.setLineDash([]);
    // 主序帶（寬 ±0.25 dex 的光帶＋中線）
    g.save();
    g.beginPath();
    MS_TRACK.forEach(function (p, i) { const x = L.px(p.lt), y = L.py(p.ll + 0.28); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    for (let i = MS_TRACK.length - 1; i >= 0; i--) { const p = MS_TRACK[i]; g.lineTo(L.px(p.lt), L.py(p.ll - 0.28)); }
    g.closePath();
    g.fillStyle = 'rgba(251,191,36,0.12)'; g.fill();
    g.restore();
    g.save(); g.strokeStyle = 'rgba(251,191,36,0.55)'; g.lineWidth = 1.5; g.lineJoin = 'round';
    g.beginPath(); MS_TRACK.forEach(function (p, i) { const x = L.px(p.lt), y = L.py(p.ll); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); g.restore();
    g.restore();
    // 等半徑線的標籤（沿右上方邊界）
    radii.forEach(function (R) {
      // 找這條線在繪圖區內的最右上一點：先試頂邊、再試右邊
      const ltTop = (LY1 - 2 * log10(R)) / 4 + log10(K.T_SUN);
      let x, y, al = 'center';
      if (ltTop <= LT0 && ltTop >= LT1) { x = L.px(ltTop); y = L.yt + 10; if (x > L.xr - 30) return; if (x < L.xl + 16) return; }
      else {
        const llR = 2 * log10(R) + 4 * (LT1 - log10(K.T_SUN));
        if (llR < LY0 || llR > LY1) return;
        x = L.xr - 4; y = L.py(llR) - 8; al = 'right';
        if (y > L.yb - 8) return;
      }
      const txt = R >= 1 ? num(R, 0) + ' R☉' : (R === 0.1 ? '0.1' : R === 0.01 ? '0.01' : '0.001') + ' R☉';
      skyText(g, txt, x, y, 'rgba(203,213,225,0.75)', al, 'middle', '500 ' + (fs - 1.5) + 'px ' + FONT);
    });
    // 區域名
    const reg = [
      [T('主序帶', 'Main sequence'), log10(22000), msLogLAt(log10(22000)), '#fde68a', 1],
      [T('巨星', 'Giants'), log10(3150), 1.6, '#fdba74', 0],
      [T('超巨星', 'Supergiants'), log10(6500), 5.7, '#fca5a5', 0],
      [T('白矮星', 'White dwarfs'), log10(15000), -3.3, '#bae6fd', 0]
    ];
    reg.forEach(function (q) {
      g.save(); g.translate(L.px(q[1]), L.py(q[2]));
      // 主序帶的字沿主序線方向
      if (q[4]) {
        const a = MS_TRACK[300], b = MS_TRACK[340];
        let ang = Math.atan2(L.py(b.ll) - L.py(a.ll), L.px(b.lt) - L.px(a.lt));
        if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;   // 字不可上下顛倒
        g.rotate(ang);
        g.translate(0, 17);
      }
      skyText(g, q[0], 0, 0, D.alpha(q[3], 0.9), 'center', 'middle', 'italic 600 ' + (fs + 0.5) + 'px ' + FONT);
      g.restore();
    });
    // 座標軸：上方光譜型、下方溫度、左邊光度、右邊熱星等
    K.CLASSES.forEach(function (q, i) {
      const lo = i === K.CLASSES.length - 1 ? 1900 : Math.max(q.lo, 1900), hi = Math.min(q.hi, 56000), x = L.px((log10(lo) + log10(hi)) / 2);
      skyText(g, q.k, x, L.yt - 11, K.colorHex(Math.sqrt(lo * hi)), 'center', 'middle', '700 ' + (fs + 1) + 'px ' + FONT);
    });
    const tt = L.narrow ? [40000, 20000, 10000, 5000, 3000, 2000] : [50000, 30000, 20000, 10000, 7000, 5000, 3000, 2000];
    tt.forEach(function (t) {
      const x = L.px(log10(t));
      g.strokeStyle = 'rgba(203,213,225,0.5)'; g.beginPath(); g.moveTo(Math.round(x) + 0.5, L.yb); g.lineTo(Math.round(x) + 0.5, L.yb + 4); g.stroke();
      skyText(g, t >= 10000 && L.narrow ? num(t / 1000, 0) + 'k' : String(t), x, L.yb + 13, '#cbd5e1', 'center', 'middle', '500 ' + (fs - 0.5) + 'px ' + FONT);
    });
    skyText(g, T('← 越熱　　表面溫度（K）　　越冷 →', '← hotter      Surface temperature (K)      cooler →'), (L.xl + L.xr) / 2, L.H - 11, '#cbd5e1', 'center', 'middle', '600 ' + fs + 'px ' + FONT);
    for (let e = -4; e <= 6; e += 2) powText(g, e, L.xl - 6, L.py(e), '#cbd5e1', 'right', fs);
    g.save(); g.translate(12, (L.yt + L.yb) / 2); g.rotate(-Math.PI / 2);
    skyText(g, T('光度（太陽 = 1）', 'Luminosity (Sun = 1)'), 0, 0, '#cbd5e1', 'center', 'middle', '600 ' + fs + 'px ' + FONT);
    g.restore();
    // 右軸：絕對熱星等
    for (let m = -10; m <= 15; m += 5) {
      const ll = (K.M_BOL_SUN - m) / 2.5;
      if (ll < LY0 || ll > LY1) continue;
      const y = L.py(ll);
      g.strokeStyle = 'rgba(203,213,225,0.5)'; g.beginPath(); g.moveTo(L.xr, Math.round(y) + 0.5); g.lineTo(L.xr + 4, Math.round(y) + 0.5); g.stroke();
      skyText(g, num(m, 0), L.xr + 7, y, '#cbd5e1', 'left', 'middle', '500 ' + (fs - 0.5) + 'px ' + FONT);
    }
    g.save(); g.translate(L.W - 9, (L.yt + L.yb) / 2); g.rotate(Math.PI / 2);
    skyText(g, T('絕對熱星等', 'Bolometric abs. magnitude'), 0, 0, '#cbd5e1', 'center', 'middle', '600 ' + (fs - 0.5) + 'px ' + FONT);
    g.restore();
    bgCache = c;
    return c;
  }
  /** 星點的位置（超出圖外時夾在邊上） */
  function posOf(L, Tk, Ls) {
    const lt = log10(Tk), ll = log10(Ls);
    const x = L.px(clamp(lt, LT1, LT0)), y = L.py(clamp(ll, LY0, LY1));
    return { x: x, y: y, out: lt > LT0 || lt < LT1 || ll > LY1 || ll < LY0 };
  }
  function glowDot(g, x, y, r, color, k) {
    const gg = g.createRadialGradient(x, y, 0, x, y, r * (2.6 + k));
    gg.addColorStop(0, D.alpha(color, 0.55)); gg.addColorStop(1, D.alpha(color, 0));
    g.fillStyle = gg; g.beginPath(); g.arc(x, y, r * (2.6 + k), 0, Math.PI * 2); g.fill();
    const core = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    core.addColorStop(0, D.mix(color, '#ffffff', 0.7)); core.addColorStop(1, color);
    g.fillStyle = core; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  let hoverId = '';
  function drawMain(tnow) {
    if (!cvSize || !cur) return;
    const L = lay(), g = ctx, W = L.W, H = L.H, fs = L.narrow ? 10.5 : 11.5;
    g.clearRect(0, 0, W, H);
    g.drawImage(drawBackground(L), 0, 0, W, H);
    g.save();
    D.roundRect(g, L.xl, L.yt, L.xr - L.xl, L.yb - L.yt, 6); g.clip();
    // 真實恆星
    K.STARS.forEach(function (s) {
      const p = posOf(L, s.T, s.L), r = dotRadius(s.R), on = s.id === state.pick;
      glowDot(g, p.x, p.y, r, K.colorHex(s.T), on ? 1.5 : 0);
      if (on || s.id === hoverId) {
        g.strokeStyle = on ? C['st-cmp'] || '#67e8f9' : 'rgba(226,232,240,0.8)'; g.lineWidth = 1.6;
        g.beginPath(); g.arc(p.x, p.y, r + 5, 0, Math.PI * 2); g.stroke();
      }
    });
    // 記號
    state.pins.forEach(function (q, i) {
      const p = posOf(L, q.T, q.L);
      g.save(); g.translate(p.x, p.y); g.rotate(Math.PI / 4);
      g.fillStyle = D.alpha(K.colorHex(q.T), 0.85); g.strokeStyle = '#f8fafc'; g.lineWidth = 1.2;
      g.fillRect(-4.5, -4.5, 9, 9); g.strokeRect(-4.5, -4.5, 9, 9); g.restore();
      skyText(g, String(i + 1), p.x + 8, p.y - 8, '#f8fafc', 'left', 'middle', '700 ' + (fs - 1) + 'px ' + FONT);
    });
    // 主序模式：目前質量在主序帶上的位置
    const me = posOf(L, cur.T, cur.L), mr = dotRadius(cur.R) + 1.5;
    // 等半徑的輔助線（拖曳時顯示：同半徑的星排成這條斜線）
    if (state.dragging || kbFocus) {
      g.save(); g.setLineDash([2, 4]); g.strokeStyle = D.alpha(C['st-me'] || '#f472b6', 0.6); g.lineWidth = 1.2;
      g.beginPath();
      [LT0, LT1].forEach(function (lt, i) { const ll = 2 * log10(cur.R) + 4 * (lt - log10(K.T_SUN)); if (i) g.lineTo(L.px(lt), L.py(ll)); else g.moveTo(L.px(lt), L.py(ll)); });
      g.stroke(); g.restore();
    }
    g.restore();
    // 我的恆星：發光＋粉紅圈（呼吸動畫）
    const pulse = reducedMotion ? 0 : 0.5 + 0.5 * Math.sin((tnow || 0) / 520);
    glowDot(g, me.x, me.y, mr, cur.color, 2.5 + pulse);
    g.save();
    g.strokeStyle = C['st-me'] || '#f472b6'; g.lineWidth = 2.2;
    g.beginPath(); g.arc(me.x, me.y, mr + 6 + pulse * 2, 0, Math.PI * 2); g.stroke();
    if (kbFocus) { g.setLineDash([4, 3]); g.strokeStyle = C.accent; g.lineWidth = 1.5; g.beginPath(); g.arc(me.x, me.y, mr + 13, 0, Math.PI * 2); g.stroke(); }
    g.restore();
    if (me.out) {
      const tx = me.x, ty = me.y;
      tag(g, T('超出圖外', 'Off the chart'), tx + (tx > W / 2 ? -14 : 14), ty + (ty > H / 2 ? -24 : 24), C['st-me'] || '#f472b6', tx > W / 2 ? 'right' : 'left', '700 ' + (fs - 0.5) + 'px ' + FONT, L);
    }
    // 我的恆星的標籤
    const lab = T('你的恆星', 'Your star') + '・' + num(cur.T, 0) + ' K';
    const right = me.x < W - 150;
    tag(g, lab, me.x + (right ? mr + 12 : -mr - 12), me.y - mr - 12, C['st-me'] || '#f472b6', right ? 'left' : 'right', '700 ' + fs + 'px ' + FONT, L);
    // 選到的真實恆星的名字
    const ps = starById(state.pick) || starById(hoverId);
    if (ps) {
      const p = posOf(L, ps.T, ps.L), r = dotRadius(ps.R);
      const rt = p.x < W - 130;
      tag(g, starName(ps), p.x + (rt ? r + 9 : -r - 9), p.y + r + 12, ps.id === state.pick ? C['st-cmp'] || '#67e8f9' : '#e2e8f0', rt ? 'left' : 'right', '600 ' + (fs - 0.5) + 'px ' + FONT, L);
    }
    // 太陽的名字（常駐，當作參考點）
    if (state.pick !== 'sun' && hoverId !== 'sun') {
      const s = posOf(L, K.T_SUN, 1);
      skyText(g, T('太陽', 'Sun'), s.x + 7, s.y + 11, '#fde68a', 'left', 'middle', '600 ' + (fs - 1) + 'px ' + FONT);
    }
  }

  // =====================================================================
  // 光譜圖
  // =====================================================================
  const GM = { l: 50, r: 14, t: 30, b: 34 };
  const LMAX = 2500;   // nm
  function plotBase(g, W, H) {
    g.fillStyle = C['canvas-bg']; g.fillRect(0, 0, W, H);
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, D.dark ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.04)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
  /** 可見光的彩虹色（只是背景色帶，示意用） */
  function rainbow(nm) {
    const h = nm < 440 ? 270 - (nm - 380) / 60 * 30 : nm < 490 ? 240 - (nm - 440) / 50 * 60 : nm < 510 ? 180 - (nm - 490) / 20 * 60
      : nm < 580 ? 120 - (nm - 510) / 70 * 60 : nm < 645 ? 60 - (nm - 580) / 65 * 60 : 0;
    return 'hsl(' + h.toFixed(0) + ',90%,55%)';
  }
  function curves() {
    const list = [{ T: cur.T, L: cur.L, R: cur.R, color: C['st-me'] || '#db2777', main: true, name: T('你的恆星', 'Your star') }];
    const ps = starById(state.pick);
    if (ps) list.push({ T: ps.T, L: ps.L, R: ps.R, color: C['st-cmp'], name: starName(ps) });
    state.pins.forEach(function (q, i) { list.push({ T: q.T, L: q.L, R: q.R, color: C.muted, dash: true, name: '#' + (i + 1) }); });
    return list;
  }
  function drawChart() {
    if (!grSize || !cur) return;
    const W = grSize.w, H = grSize.h, g = gtx, narrow = W < 520, fs = narrow ? 10.5 : 11.5;
    g.clearRect(0, 0, W, H);
    plotBase(g, W, H);
    const l = narrow ? 40 : GM.l, r = W - GM.r, t = GM.t, b = H - GM.b;
    const X = function (nm) { return l + nm / LMAX * (r - l); };
    const list = curves();
    const norm = state.spec === 'norm';
    let ymax = 0;
    list.forEach(function (q) { q.pk = K.planck(K.peak(q.T), q.T); if (!norm) ymax = Math.max(ymax, q.pk); });
    if (norm) ymax = 1;
    ymax *= 1.2;
    const Y = function (v) { return b - v / ymax * (b - t); };
    // 紫外、可見光、紅外的底色
    g.fillStyle = D.alpha(C['st-uv'], 0.08); g.fillRect(l, t, X(380) - l, b - t);
    g.fillStyle = D.alpha(C['st-ir'], 0.06); g.fillRect(X(750), t, r - X(750), b - t);
    const rb = g.createLinearGradient(X(380), 0, X(750), 0);
    for (let nm = 380; nm <= 750; nm += 10) rb.addColorStop((nm - 380) / 370, rainbow(nm));
    g.save(); g.globalAlpha = D.dark ? 0.16 : 0.12; g.fillStyle = rb; g.fillRect(X(380), t, X(750) - X(380), b - t); g.restore();
    g.fillStyle = rb; g.fillRect(X(380), b + 1, X(750) - X(380), 4);
    D.haloText(g, T('紫外', 'UV'), (l + X(380)) / 2, t + 10, C['st-uv'], 'center', 'middle', '600 ' + (fs - 0.5) + 'px ' + FONT);
    D.haloText(g, T('可見光', 'Visible'), (X(380) + X(750)) / 2, t + 10, C.text, 'center', 'middle', '600 ' + (fs - 0.5) + 'px ' + FONT);
    D.haloText(g, T('紅外線', 'Infrared'), (X(750) + r) / 2, t + 10, C['st-ir'], 'center', 'middle', '600 ' + (fs - 0.5) + 'px ' + FONT);
    // 軸
    g.strokeStyle = D.alpha(C.text, 0.4); g.lineWidth = 1;
    g.beginPath(); g.moveTo(l, t); g.lineTo(l, b + 0.5); g.lineTo(r, b + 0.5); g.stroke();
    for (let nm = 0; nm <= LMAX; nm += 500) {
      const x = X(nm);
      g.beginPath(); g.moveTo(Math.round(x) + 0.5, b); g.lineTo(Math.round(x) + 0.5, b + 4); g.stroke();
      D.haloText(g, String(nm), x, b + 15, C.muted, 'center', 'middle', '500 ' + (fs - 0.5) + 'px ' + FONT);
    }
    D.haloText(g, T('波長（nm）', 'Wavelength (nm)'), r, b + 28, C.muted, 'right', 'middle', '600 ' + (fs - 0.5) + 'px ' + FONT);
    D.haloText(g, norm ? T('各自以峰值為 1', 'Scaled to each peak') : T('每平方公尺表面發出的光（相對）', 'Light per m² of surface (relative)'), l + 4, t - 14, C.muted, 'left', 'middle', '600 ' + (fs - 0.5) + 'px ' + FONT);
    // 曲線（後畫的在上面：記號 → 比較 → 我的）
    const step = Math.max(1, Math.round(LMAX / (r - l) / 1.5));
    for (let k = list.length - 1; k >= 0; k--) {
      const q = list[k], sc = norm ? 1 / q.pk : 1;
      g.save();
      g.beginPath();
      for (let nm = step; nm <= LMAX; nm += step) {
        const v = K.planck(nm * 1e-9, q.T) * sc, x = X(nm), y = Math.max(t - 6, Y(v));
        if (nm === step) g.moveTo(x, y); else g.lineTo(x, y);
      }
      if (q.main) {
        // 曲線下方用恆星本身的顏色淡淡填色
        const path = new Path2D();
        path.moveTo(X(step), b);
        for (let nm = step; nm <= LMAX; nm += step) path.lineTo(X(nm), Math.max(t - 6, Y(K.planck(nm * 1e-9, q.T) * sc)));
        path.lineTo(X(LMAX), b); path.closePath();
        const fg = g.createLinearGradient(0, t, 0, b);
        fg.addColorStop(0, D.alpha(cur.color, 0.45)); fg.addColorStop(1, D.alpha(cur.color, 0.08));
        g.fillStyle = fg; g.fill(path);
      }
      g.lineJoin = 'round';
      if (q.dash) g.setLineDash([5, 4]);
      g.strokeStyle = q.color; g.lineWidth = q.main ? 2.4 : 1.6;
      g.stroke();
      g.restore();
    }
    // 峰值標記（只標我的恆星）
    const pk = cur.peak, sc0 = norm ? 1 / list[0].pk : 1;
    if (pk <= LMAX) {
      const x = X(pk), y = Y(list[0].pk * sc0);
      g.save(); g.setLineDash([3, 3]); g.strokeStyle = D.alpha(C['st-me'] || '#db2777', 0.8); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x, Math.max(t, y)); g.lineTo(x, b); g.stroke(); g.restore();
      D.ball(g, x, Math.max(t - 6, y), 4, C['st-me'] || '#db2777', { glow: 5 });
      const txt = 'λ' + T('峰值', 'peak') + ' = ' + nmText(pk);
      const right = x < W - 140;
      D.pill(g, txt, x + (right ? 8 : -8), Math.max(t + 44, (Math.max(t, y) + b) / 2), C['st-me'] || '#db2777', right ? 'left' : 'right', '700 ' + (fs - 0.5) + 'px ' + FONT);
    } else {
      D.haloText(g, T('峰值在 ', 'Peak at ') + nmText(pk) + ' →', r - 4, t + 28, C['st-me'] || '#db2777', 'right', 'middle', '700 ' + (fs - 0.5) + 'px ' + FONT);
    }
    // 比較的恆星：不在圖內時說明
    if (!norm && list.length > 1) {
      const hid = list.filter(function (q, i) { return i > 0 && q.pk < ymax / 1.2 * 0.012; });
      if (hid.length) D.haloText(g, T('比較的曲線太低，看不出來：改用「各自以峰值為 1」', 'A comparison curve is too low to see: try “Each scaled to its peak”'), l + 6, b - 10, C.muted, 'left', 'middle', '500 ' + (fs - 1) + 'px ' + FONT);
    }
  }
  function chartAria() {
    return state.spec === 'norm' ? T('黑體光譜（各自以峰值為 1）：橫軸是波長', 'Blackbody spectra, each scaled to its peak: wavelength across')
      : T('黑體光譜：橫軸是波長，縱軸是每平方公尺表面發出的光', 'Blackbody spectrum: wavelength across, light given off per square metre of surface up');
  }

  // =====================================================================
  // 讀數、事件與音效
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function setStatus(s) { $('status').textContent = s; }
  function snapshot() {
    const s = cur || compute();
    return { mode: state.mode, T: s.T, R: s.R, L: s.L, M: s.M, life: s.life, peak: s.peak, cls: s.cls, vis: s.vis, uv: s.uv, ir: s.ir,
      white: s.white, mbol: s.mbol, region: s.region, dragging: state.dragging, pick: state.pick, pins: state.pins.length, spec: state.spec };
  }
  let lastEmit = 0;
  function emitState(force) {
    const t = performance.now();
    if (force || t - lastEmit > 250) { lastEmit = t; emit('star', snapshot()); }
  }
  function refreshOutputs() {
    setOut(el.temp, outNum(state.mode === 'ms' ? cur.T : state.T, 0));
    setOut(el.rad, outNum(state.mode === 'ms' ? cur.R : state.R, 4));
    setOut(el.mass, outNum(state.M, 3));
  }
  function radiusHTML(R) {
    const km = R * K.R_SUN / 1000, earth = R * K.R_SUN / K.R_EARTH;
    return sci(R, 3) + ' R☉<br><span class="sub">' + sci(km, 3) + ' km<br>' + T('地球的 ', '') + sci(earth, 3) + T(' 倍', ' × the Earth') + '</span>';
  }
  function updateReadouts() {
    const s = cur;
    setHTML('rColor', '<span class="swatch" style="background:' + s.color + '"></span>' + colourName(s.T) + '<br><span class="sub">' + s.cls + T(' 型', '-type') + '</span>');
    setHTML('rPeak', nmText(s.peak) + '<br><span class="sub">' + (s.peak < 380 ? T('紫外', 'ultraviolet') : s.peak > 750 ? T('紅外', 'infrared') : T('可見光', 'visible')) + '</span>');
    setHTML('rFlux', sci(s.flux / 1e6, 3) + ' MW/m<sup>2</sup><br><span class="sub">' + T('太陽的 ', '') + sci(s.flux / K.flux(K.T_SUN), 3) + T(' 倍', ' × the Sun') + '</span>');
    setHTML('rL', sci(s.L, 3) + ' L☉<br><span class="sub">' + sci(s.L * K.L_SUN, 3) + ' W</span>');
    setHTML('rMbol', num(s.mbol, 2));
    setHTML('rR', radiusHTML(s.R));
    setHTML('rBands', pct(s.uv) + '／' + pct(s.vis) + '／' + pct(s.ir));
    if (state.mode === 'ms') {
      setHTML('rLifeT', T('主序壽命', 'Main-sequence lifetime'));
      const q = s.life / 13.8e9;
      setHTML('rLife', years(s.life) + '<br><span class="sub">' + (q < 1 ? T('宇宙年齡的 ', '') + pct(q) + T('', ' of the age of the Universe') : T('宇宙年齡的 ', '') + sci(q, 3) + T(' 倍', ' × the age of the Universe')) + '</span>');
    } else {
      setHTML('rLifeT', T('在 HR 圖上的位置', 'Place on the HR diagram'));
      setHTML('rLife', regionName(s.region));
    }
    const ps = starById(state.pick);
    if (ps) {
      setHTML('pT', num(ps.T, 0) + ' K・' + K.spectral(ps.T) + T(' 型', '-type'));
      setHTML('pL', sci(ps.L, 3) + ' L☉');
      setHTML('pR', sci(ps.R, 3) + ' R☉' + (ps.R < 0.05 ? T('（地球的 ', ' (') + num(ps.R * K.R_SUN / K.R_EARTH, 2) + T(' 倍）', ' × the Earth)') : ''));
      setHTML('pD', ps.id === 'sun' ? T('1 天文單位（8.3 光分）', '1 au (8.3 light-minutes)') : num(ps.d * 3.2616, ps.d < 10 ? 1 : 0) + T(' 光年', ' light-years'));
      setHTML('pickHint', cmpHint(ps));
    } else {
      ['pT', 'pL', 'pR', 'pD'].forEach(function (k) { setHTML(k, '—'); });
      setHTML('pickHint', T('點 HR 圖上的恆星，或從清單選一顆。', 'Tap a star on the diagram or choose one from the list.'));
    }
    setHTML('chartHint', state.spec === 'norm'
      ? T('每條曲線都縮放到峰值 = 1，只比較形狀：越熱，峰值越往左（短波長）。', 'Every curve is scaled to a peak of 1 so only the shapes are compared: the hotter, the further left (shorter wavelength) the peak.')
      : T('同一個尺度：曲線下的面積 = 每平方公尺表面發出的總功率 σT<sup>4</sup>。溫度變 2 倍，面積變 16 倍。', 'Same scale: the area under each curve is the total power per square metre, σT<sup>4</sup>. Twice the temperature gives 16 times the area.'));
  }
  function cmpHint(ps) {
    const rT = cur.T / ps.T, rR = cur.R / ps.R, rL = cur.L / ps.L;
    return T('你的恆星和' + ps.zh + '比：溫度 ' + sci(rT, 3) + ' 倍、半徑 ' + sci(rR, 3) + ' 倍 → 光度 ' + sci(rL, 3) + ' 倍（= 半徑<sup>2</sup> × 溫度<sup>4</sup>）。',
      'Your star vs ' + ps.en + ': temperature × ' + sci(rT, 3) + ', radius × ' + sci(rR, 3) + ' → luminosity × ' + sci(rL, 3) + ' (= radius<sup>2</sup> × temperature<sup>4</sup>).');
  }
  let lastSay = 0;
  function sayNow(force) {
    const s = cur;
    const txt = T('溫度 ', 'Temperature ') + num(s.T, 0) + T(' K，', ' K, ') + colourName(s.T) + T('，光度 ', ', luminosity ') + sigText(s.L, 3) + T(' 倍太陽，半徑 ', ' Suns, radius ') + sigText(s.R, 3) + T(' 倍太陽', ' Suns');
    const t = performance.now();
    if (force || t - lastSay > 3000) { $('srNow').textContent = txt; lastSay = t; }
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  // 光譜型改變時輕輕響一聲（越熱音越高；音效預設關）
  let lastCls = null;
  function classTick() {
    if (lastCls != null && cur.cls !== lastCls) {
      const S = sound();
      if (S) S.tone({ freq: 330 * Math.pow(2, (log10(cur.T) - log10(2000)) / (log10(50000) - log10(2000)) * 1.6), dur: 0.09, gain: 0.1 });
    }
    lastCls = cur.cls;
  }
  function refreshAll() { compute(); classTick(); refreshOutputs(); updateReadouts(); requestDraw(); }

  // =====================================================================
  // 控制項
  // =====================================================================
  function setSeg(id, attr, v) {
    document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(v))); });
  }
  function syncSlidersFromStar() {
    // 主序模式時，溫度、半徑滑桿跟著質量走（切回自由模式時就從這顆星接著調）
    setRange(el.temp, clamp(cur.T, T_MIN, T_MAX));
    setRange(el.rad, clamp(cur.R, R_MIN, R_MAX));
  }
  function setMode(m, quiet) {
    if (m === state.mode) return;
    if (m === 'ms') {
      // 由目前的星找最接近的主序質量（光度相同的那一點）
      let best = 1, bd = Infinity;
      MS_TRACK.forEach(function (p) { const d = Math.abs(p.ll - log10(cur.L)) + 0.6 * Math.abs(p.lt - log10(cur.T)); if (d < bd) { bd = d; best = p.M; } });
      state.M = best; setRange(el.mass, best);
    } else {
      state.T = clamp(cur.T, T_MIN, T_MAX); state.R = clamp(cur.R, R_MIN, R_MAX);
    }
    state.mode = m;
    setSeg('modeSeg', 'data-mode', m);
    $('freeBox').hidden = m !== 'free';
    $('msBox').hidden = m !== 'ms';
    compute();
    if (m === 'ms') syncSlidersFromStar();
    refreshAll();
    if (!quiet) {
      setStatus(m === 'ms' ? T('主序星模式：拖曳質量，或在 HR 圖上沿著主序帶拖曳你的恆星。', 'Main-sequence mode: change the mass, or drag your star along the main sequence.')
        : T('溫度＋半徑模式：在 HR 圖上任意拖曳你的恆星。', 'Temperature + radius mode: drag your star anywhere on the diagram.'));
      emitState(true);
    }
  }
  ['temp', 'rad'].forEach(function (k) {
    el[k].addEventListener('input', function () { if (internal) return; acted(); readSliders(); refreshAll(); emitState(); sayNow(); });
    el[k].addEventListener('change', function () { if (internal) return; readSliders(); refreshAll(); emitState(true); });
  });
  el.mass.addEventListener('input', function () { if (internal) return; acted(); readSliders(); compute(); syncSlidersFromStar(); refreshAll(); emitState(); sayNow(); });
  el.mass.addEventListener('change', function () { if (internal) return; readSliders(); compute(); syncSlidersFromStar(); refreshAll(); emitState(true); });
  document.querySelectorAll('#modeSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); setMode(b.getAttribute('data-mode')); });
  });
  document.querySelectorAll('#freeBox .presets button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      state.T = +b.getAttribute('data-t'); state.R = +b.getAttribute('data-r');
      setRange(el.temp, state.T); setRange(el.rad, state.R);
      refreshAll(); emitState(true); sayNow(true);
      setStatus(T('設定成「' + b.textContent + '」：', 'Set to “' + b.textContent + '”: ') + num(state.T, 0) + ' K、' + plain(state.R, 3) + ' R☉');
    });
  });
  document.querySelectorAll('#specSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); state.spec = b.getAttribute('data-spec'); setSeg('specSeg', 'data-spec', state.spec);
      gr.setAttribute('aria-label', chartAria()); updateReadouts(); requestDraw(); emit('chart', { spec: state.spec }); emitState(true);
    });
  });
  // 真實恆星清單
  function fillSelect() {
    const keep = state.pick;
    const kinds = [['ms', T('主序星', 'Main-sequence stars')], ['giant', T('巨星', 'Giants')], ['super', T('超巨星', 'Supergiants')], ['wd', T('白矮星', 'White dwarfs')]];
    let html = '<option value="">' + T('（不比較）', '(no comparison)') + '</option>';
    kinds.forEach(function (k) {
      html += '<optgroup label="' + k[1] + '">';
      K.STARS.filter(function (s) { return s.kind === k[0]; }).forEach(function (s) { html += '<option value="' + s.id + '">' + starName(s) + '</option>'; });
      html += '</optgroup>';
    });
    el.sel.innerHTML = html;
    el.sel.value = keep;
  }
  function pickStar(id, from) {
    const s = starById(id);
    state.pick = s ? id : '';
    if (el.sel.value !== state.pick) el.sel.value = state.pick;
    updateReadouts(); requestDraw();
    if (s) {
      const S = sound(); if (S) S.tone({ freq: 523, dur: 0.08, gain: 0.08 });
      setStatus(T('比較：' + s.zh + '（' + num(s.T, 0) + ' K、光度 ' + plain(s.L, 3) + ' 倍太陽）', 'Comparing with ' + s.en + ' (' + num(s.T, 0) + ' K, ' + plain(s.L, 3) + ' Suns)'));
      emit('pick', { id: id, from: from });
    }
    emitState(true);
  }
  el.sel.addEventListener('change', function () { acted(); pickStar(el.sel.value, 'list'); });
  $('pinBtn').addEventListener('click', function () {
    acted();
    if (state.pins.length >= MAX_PINS) state.pins.shift();
    state.pins.push({ T: cur.T, R: cur.R, L: cur.L });
    const S = sound(); if (S) S.tone({ freq: 784, dur: 0.07, gain: 0.08 });
    setStatus(T('留下記號 #' + state.pins.length + '（最多 ' + MAX_PINS + ' 個）。', 'Marker #' + state.pins.length + ' placed (up to ' + MAX_PINS + ').'));
    requestDraw(); emit('pin', { n: state.pins.length, T: cur.T, L: cur.L, R: cur.R }); emitState(true);
  });
  $('clearBtn').addEventListener('click', function () {
    acted();
    state.pins = []; state.pick = ''; el.sel.value = '';
    updateReadouts(); requestDraw();
    setStatus(T('已清除記號與比較的恆星；你的恆星不變。', 'Markers and the comparison star cleared; your star is unchanged.'));
    emitState(true);
  });
  $('soundBtn').addEventListener('click', function () {
    const on = !(window.LabSettings && window.LabSettings.get('sound'));
    if (window.LabSettings) window.LabSettings.set('sound', on);
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 在 HR 圖上拖曳 ----------
  let kbFocus = false, dragMode = '';
  function evXY(ev) { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  function hitStar(L, x, y) {
    let best = null, bd = 14;
    K.STARS.forEach(function (s) { const p = posOf(L, s.T, s.L), d = Math.hypot(p.x - x, p.y - y); if (d < Math.max(bd, 0) && d < dotRadius(s.R) + 9) { bd = d; best = s; } });
    return best;
  }
  /** 自由模式：把星移到 (logT, logL)，半徑超出範圍時沿等溫線夾住 */
  function placeFree(lt, ll) {
    const Tk = clamp(pow10(lt), T_MIN, T_MAX);
    let R = K.radiusSun(pow10(ll), Tk);
    R = clamp(R, R_MIN, R_MAX);
    state.T = Tk; state.R = R;
    setRange(el.temp, Tk); setRange(el.rad, R);
  }
  /** 主序模式：找主序帶上離 (x, y) 最近的質量 */
  function placeMS(L, x, y) {
    let best = state.M, bd = Infinity;
    MS_TRACK.forEach(function (p) { const d = Math.hypot(L.px(p.lt) - x, L.py(p.ll) - y); if (d < bd) { bd = d; best = p.M; } });
    state.M = best; setRange(el.mass, best);
    compute(); syncSlidersFromStar();
  }
  function moveTo(L, x, y) {
    if (state.mode === 'ms') placeMS(L, x, y);
    else placeFree(L.ltOf(clamp(x, L.xl, L.xr)), L.llOf(clamp(y, L.yt, L.yb)));
    refreshAll();
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (view3 && view3.active) return;
    const L = lay(), p = evXY(ev);
    const me = posOf(L, cur.T, cur.L);
    const nearMe = Math.hypot(me.x - p.x, me.y - p.y) < dotRadius(cur.R) + 16;
    if (!nearMe) {
      const s = hitStar(L, p.x, p.y);
      if (s) { acted(); pickStar(s.id === state.pick ? '' : s.id, 'chart'); ev.preventDefault(); return; }
    }
    if (p.x < L.xl - 4 || p.x > L.xr + 4 || p.y < L.yt - 4 || p.y > L.yb + 4) return;
    acted(); state.dragging = true; dragMode = nearMe ? 'grab' : 'jump';
    cv.setPointerCapture(ev.pointerId);
    moveTo(L, p.x, p.y); emitState(true);
    ev.preventDefault();
  });
  cv.addEventListener('pointermove', function (ev) {
    const L = lay(), p = evXY(ev);
    if (!state.dragging) {
      if (ev.pointerType === 'mouse') {
        const s = hitStar(L, p.x, p.y), id = s ? s.id : '';
        if (id !== hoverId) { hoverId = id; cv.style.cursor = s ? 'pointer' : 'crosshair'; requestDraw(); }
      }
      return;
    }
    moveTo(L, p.x, p.y); sayNow(); emitState();
  });
  function endDrag() { if (!state.dragging) return; state.dragging = false; dragMode = ''; refreshAll(); sayNow(true); emitState(true); }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (hoverId) { hoverId = ''; requestDraw(); } });

  // ---------- 鍵盤 ----------
  if (window.LabKeys) {
    window.LabKeys.attach(cv, {
      label: T('赫羅圖。方向鍵移動你的恆星：左右＝溫度（左邊熱）、上下＝光度；Shift 走大步。', 'Hertzsprung–Russell diagram. Arrow keys move your star: left/right = temperature (hotter to the left), up/down = luminosity; Shift for bigger steps.'),
      items: [{
        name: function () { return T('你的恆星', 'Your star'); },
        move: function (dx, dy, big) {
          if (!dx && !dy) return false;
          acted(); kbFocus = true;
          if (state.mode === 'ms') {
            const d = (-dx || dy);
            state.M = clamp(state.M * Math.pow(10, d * (big ? 0.1 : 0.01)), M_MIN, M_MAX);
            setRange(el.mass, state.M); compute(); syncSlidersFromStar();
          } else {
            placeFree(log10(cur.T) - dx * (big ? 0.05 : 0.005), log10(cur.L) + dy * (big ? 0.5 : 0.05));
          }
          refreshAll(); emitState(true); return true;
        },
        describe: function () { return T('溫度 ', 'Temperature ') + num(cur.T, 0) + T(' K，光度 ', ' K, luminosity ') + sigText(cur.L, 3) + T(' 倍太陽，', ' Suns, ') + regionName(cur.region); }
      }],
      onChange: function () { requestDraw(); }
    });
    cv.addEventListener('blur', function () { kbFocus = false; requestDraw(); });
  }

  // ---------- 分享 ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      return { m: state.mode, s: state.spec, p: state.pick,
        pins: state.pins.map(function (q) { return [Math.round(q.T), +q.R.toPrecision(4)]; }) };
    },
    set: function (o) {
      if (!o) return;
      readSliders();
      if (o.m === 'ms' || o.m === 'free') { state.mode = o.m === 'ms' ? 'free' : 'ms'; compute(); setMode(o.m, true); }
      if (o.s === 'abs' || o.s === 'norm') { state.spec = o.s; setSeg('specSeg', 'data-spec', o.s); gr.setAttribute('aria-label', chartAria()); }
      if (typeof o.p === 'string') { state.pick = starById(o.p) ? o.p : ''; el.sel.value = state.pick; }
      if (Array.isArray(o.pins)) {
        state.pins = o.pins.slice(0, MAX_PINS).filter(function (q) { return Array.isArray(q) && isFinite(+q[0]) && isFinite(+q[1]) && +q[0] > 0 && +q[1] > 0; })
          .map(function (q) { const Tk = clamp(+q[0], 1000, 60000), R = clamp(+q[1], 1e-4, 1e4); return { T: Tk, R: R, L: K.lumSun(R, Tk) }; });
      }
      readSliders();
      refreshAll();
    }
  });

  // =====================================================================
  // 繪圖迴圈
  // =====================================================================
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(loop); }
  function loop(tnow) {
    raf = 0;
    if (view3 && view3.active) view3.frame(tnow); else drawMain(tnow);
    drawChart();
    if ((view3 && view3.active && view3.busy()) || (!reducedMotion && !(view3 && view3.active) && !document.hidden && animate2d)) raf = requestAnimationFrame(loop);
  }
  // 你的恆星的呼吸光圈：只在畫面可見時跑（reduced-motion 時不跑）
  let animate2d = false;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { animate2d = es[0].isIntersecting; if (animate2d) requestDraw(); }).observe(cv);
  }

  // =====================================================================
  // 3D 檢視（切換時才載入 three.js 與 stars-hr-3d.js）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    K: K, T: T, D: D, state: state, colors: function () { return C; }, reducedMotion: reducedMotion,
    num: num, plain: plain, sci: sci, cur: function () { return cur; }, pickStar: function () { return starById(state.pick); }, starName: starName,
    request: function () { requestDraw(); },
    onCam: function (kind) { acted(); emit('cam', { preset: kind }); },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D HR 圖。', 'The 3D graphics context was lost, so the view switched back to the 2D HR diagram.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Stars3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Stars3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/stars-hr-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Stars3D) throw new Error('stars-hr-3d.js did not load');
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
      viewMsg.textContent = T('正在載入 3D…', 'Loading 3D…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        view3 = window.Stars3D.create(lib, host3, bridge);
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
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D HR 圖。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D HR diagram is kept.');
    updateViewNotes();
    resizeCv();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); emit('view', { mode: '3d' }); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  [['camFit', 'fit'], ['camMine', 'mine']].forEach(function (q) {
    $(q[0]).addEventListener('click', function () { if (view3) { view3.camTo(q[1]); bridge.onCam(q[1]); } });
  });

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  // 起始值用精確值（滑桿的 step 會把 5772 K 吃成 5768 K）；分享網址還原時會再覆蓋
  setRange(el.temp, K.T_SUN); setRange(el.rad, 1); setRange(el.mass, 1);
  readSliders();
  fillSelect();
  updateSoundButton();
  gr.setAttribute('aria-label', chartAria());
  function themeChanged() {
    readColors();
    bgCache = null; bgKey = '';
    fillSelect();
    updateSoundButton(); compute(); updateReadouts();
    gr.setAttribute('aria-label', chartAria());
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:langchange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lh = 0, gw = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lw || cv.clientHeight !== lh || gr.clientWidth !== gw) { lw = cv.clientWidth; lh = cv.clientHeight; gw = gr.clientWidth; if (gw > 0) resizeCv(); }
    }).observe(stage);
  } else window.addEventListener('resize', resizeCv);
  resizeCv();
  compute();
  lastCls = cur.cls;
  refreshOutputs();
  updateReadouts();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) requestDraw(); });
  setStatus(T('你的恆星現在和太陽一樣：5772 K、1 倍太陽半徑。拖曳它，或調整溫度與半徑。', 'Your star starts as the Sun: 5772 K and one solar radius. Drag it, or change the temperature and radius.'));
  requestDraw();
  // 測試用（Playwright）
  window.__st = { state: state, K: K, snapshot: snapshot, setView: setView, cur: function () { return cur; },
    set: function (Tk, R) { acted(); if (state.mode !== 'free') setMode('free', true); state.T = Tk; state.R = R; setRange(el.temp, Tk); setRange(el.rad, R); refreshAll(); emitState(true); },
    mass: function (m) { acted(); if (state.mode !== 'ms') setMode('ms', true); state.M = m; setRange(el.mass, m); compute(); syncSlidersFromStar(); refreshAll(); emitState(true); },
    pick: function (id) { acted(); pickStar(id, 'test'); } };
})();
