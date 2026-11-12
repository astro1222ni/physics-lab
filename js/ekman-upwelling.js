/* ekman-upwelling.js — 「洋流與氣候：艾克曼輸送、湧升流與聖嬰」的畫面與互動
 * 物理全部在 ekman-upwelling-core.js；3D 在 ekman-upwelling-3d.js，切換到 3D 時才載入。 */
(function () {
  'use strict';
  const K = window.EkmanCore;
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
  const DAYS_MAX = 20, PLAY_RATE = DAYS_MAX / 12;   // 12 秒播完 20 天
  const X_KM = 60, Z_COAST = 200, Z_EQ = 300;       // 沿岸剖面 0–60 km、0–200 m；赤道剖面 0–300 m
  const CONVECT = 28.5;                              // 旺盛對流（雲、雨）需要的海面溫度（示意）

  // =====================================================================
  // 狀態
  // =====================================================================
  const ids = ['lat', 'U', 'windFrom', 'Av', 'zProbe', 'H1', 'days', 'p'];
  const el = {}; ids.forEach(function (k) { el[k] = $(k); });
  const state = { mode: 'spiral', hemi: 'N', coast: 'W', playing: false, acted: false };
  let internal = false;
  function setRange(r, v) { internal = true; if (window.LabNum) window.LabNum.set(r, v); else r.value = String(v); internal = false; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  let P = {}, E = null, Cs = null, Q = null, PR = null;
  function readSliders() { ids.forEach(function (k) { P[k] = val(el[k]); }); }
  function latS() { return state.hemi === 'S' ? -P.lat : P.lat; }
  function compute() {
    E = K.ekman({ lat: latS(), U: P.U, windFrom: P.windFrom, Av: P.Av });
    Cs = K.coastal({ lat: latS(), U: P.U, windFrom: P.windFrom, coast: state.coast, H1: P.H1, days: P.days });
    Q = K.equator({ p: P.p / 100 });
    Q.enso = K.ensoState(Q);
    const pr = K.ekmanAt(E, -P.zProbe);
    PR = { speed: pr.speed, az: pr.az, turn: E.V0 > 0 ? K.turn(E.surfAz, pr.az) : 0, frac: E.V0 > 0 ? pr.speed / E.V0 : 0 };
  }
  function zMax() { return Math.max(1.25 * E.DE, P.zProbe * 1.06, 10); }

  // =====================================================================
  // 格式
  // =====================================================================
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function outNum(v, d) { return Number(v.toFixed(d)).toString().replace('-', '−'); }
  const DIRS_ZH = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'], DIRS_EN = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  function dirName(az) { const i = Math.round(K.wrap360(az) / 45) % 8; return T(DIRS_ZH[i], DIRS_EN[i]); }
  function windName(from) { const i = Math.round(K.wrap360(from) / 45) % 8; return T(DIRS_ZH[i] + '風', DIRS_EN[i] + ' wind'); }
  function az3(a) { a = Math.round(K.wrap360(a)) % 360; return (a < 10 ? '00' : a < 100 ? '0' : '') + a + '°'; }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function niceStep(range, n) {
    const raw = range / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }

  // =====================================================================
  // 顏色
  // =====================================================================
  let C = {};
  function hexRGB(h) {
    h = (h || '#000000').trim();
    if (h[0] !== '#') { const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(h); return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0]; }
    if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  // 海水溫度色階（°C）：冷＝深藍、20 °C＝淡黃、暖池＝深紅
  const T_STOPS = [[6, '#172554'], [9, '#1e40af'], [12, '#2563eb'], [15, '#0891b2'], [18, '#5eead4'], [20, '#fde68a'], [23, '#fdba74'], [26, '#f97316'], [28.5, '#dc2626'], [30.5, '#9f1239']];
  const T_LO = 6, T_HI = 30.5, LUT_N = 512;
  let LUT = null;
  function buildLUT() {
    const st = T_STOPS.map(function (s) { return [s[0], hexRGB(s[1])]; }), k = D.dark ? 0.86 : 1;
    LUT = new Uint8ClampedArray(LUT_N * 3);
    for (let i = 0; i < LUT_N; i++) {
      const t = T_LO + (T_HI - T_LO) * i / (LUT_N - 1);
      let j = 0; while (j < st.length - 2 && t > st[j + 1][0]) j++;
      const a = st[j], b = st[j + 1], u = clamp((t - a[0]) / (b[0] - a[0]), 0, 1);
      for (let c = 0; c < 3; c++) LUT[i * 3 + c] = (a[1][c] + (b[1][c] - a[1][c]) * u) * k;
    }
  }
  function tempIdx(t) { return Math.round(clamp((t - T_LO) / (T_HI - T_LO), 0, 1) * (LUT_N - 1)) * 3; }
  function tempCSS(t) { const i = tempIdx(t); return 'rgb(' + LUT[i] + ',' + LUT[i + 1] + ',' + LUT[i + 2] + ')'; }
  // 螺旋的深度色：表面青綠 → 深處靛紫
  function depthColor(u) {
    const a = hexRGB(D.dark ? '#5eead4' : '#0d9488'), b = hexRGB(D.dark ? '#a5b4fc' : '#4338ca');
    u = clamp(u, 0, 1);
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * u) + ',' + Math.round(a[1] + (b[1] - a[1]) * u) + ',' + Math.round(a[2] + (b[2] - a[2]) * u) + ')';
  }
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--surface', '--ek-wind', '--ek-trans', '--ek-probe', '--ek-land', '--ek-sky', '--ek-sea']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    buildLUT();
    buildLegend();
  }
  function buildLegend() {
    let h;
    if (state.mode === 'spiral') {
      h = '<span>' + T('海面', 'surface') + '</span><span class="bar" style="background:linear-gradient(90deg,' + depthColor(0) + ',' + depthColor(1) + ')"></span><span>' + T('深處', 'deep') + '</span>' +
        '<span><i style="display:inline-block;width:14px;height:4px;border-radius:2px;vertical-align:2px;background:' + C['ek-trans'] + '"></i> ' + T('淨艾克曼輸送', 'net Ekman transport') + '</span>' +
        '<span><i style="display:inline-block;width:14px;height:4px;border-radius:2px;vertical-align:2px;background:' + C['ek-probe'] + '"></i> ' + T('探測深度', 'probe depth') + '</span>';
    } else {
      let g = []; for (let t = 8; t <= 30; t += 2) g.push(tempCSS(t));
      h = '<span>8 °C</span><span class="bar" style="background:linear-gradient(90deg,' + g.join(',') + ')"></span><span>30 °C</span><span>' + T('海水溫度', 'water temperature') + '</span>';
    }
    const L = $('legend'); if (L.innerHTML !== h) L.innerHTML = h;
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
  function wantHeight(W) {
    const wide = W >= 700;
    if (state.mode === 'spiral') return wide ? 470 : Math.round(Math.min(W, 420) + 14 + 360);
    if (state.mode === 'coast') return wide ? 440 : Math.round(Math.min(W * 0.8, 340) + 14 + 300);
    return wide ? 440 : 400;
  }
  function resizeCv() {
    const W = cv.clientWidth || 300, h = wantHeight(W) + 'px';
    if (cv.style.height !== h) cv.style.height = h;
    cvSize = fit(cv, ctx); grSize = fit(gr, gtx); imgKey = {}; requestDraw();
  }
  // 逐點上色（溫度）的影像，相同狀態不重算
  let imgKey = {}, imgs = {};
  function raster(name, w, h, key, fn) {
    const dpr = Math.min(1.5, cvSize ? cvSize.dpr : 1), pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
    key += '|' + pw + 'x' + ph + '|' + (D.dark ? 1 : 0);
    if (imgKey[name] === key) return imgs[name];
    const c = imgs[name] || document.createElement('canvas');
    c.width = pw; c.height = ph;
    paintTemp(c, fn);
    imgs[name] = c; imgKey[name] = key;
    return c;
  }
  function paintTemp(c, fn) {
    const pw = c.width, ph = c.height, g = c.getContext('2d'), id = g.createImageData(pw, ph), d = id.data;
    for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) {
      const t = fn((i + 0.5) / pw, (j + 0.5) / ph), o = (j * pw + i) * 4;
      if (t == null) { d[o + 3] = 0; continue; }
      const q = tempIdx(t);
      d[o] = LUT[q]; d[o + 1] = LUT[q + 1]; d[o + 2] = LUT[q + 2]; d[o + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    return c;
  }
  // 沿岸剖面：u = 0 在岸邊、1 在離岸 60 km；v = 0 海面、1 在 200 m 深
  function coastTempUV(u, v) { return K.tempXZ(Cs, u * X_KM * 1000, -v * Z_COAST); }
  // 赤道剖面的溫度（示意）：溫躍層以上是暖水（海面溫度由溫躍層深度決定），以下往深處變冷
  function eqTemp(x, d) {
    const h = K.thermoAt(Q, x), sst = K.sstFromH(h);
    if (d <= h) { const u = h > 0 ? d / h : 1; return sst + (K.TC - sst) * u * u; }
    return 8 + (K.TC - 8) * Math.exp(-(d - h) / 90);
  }
  function eqTempUV(u, v) { return eqTemp(u, v * Z_EQ); }
  function coastKey() { return [P.lat, state.hemi, P.U, P.windFrom, state.coast, P.H1, P.days].join('|'); }

  // =====================================================================
  // 主畫面
  // =====================================================================
  function drawMain() {
    if (!cvSize || !E) return;
    const g = ctx, W = cvSize.w, H = cvSize.h, wide = W >= 700, fs = wide ? 11.5 : 10.5;
    g.clearRect(0, 0, W, H);
    g.fillStyle = C['canvas-bg']; g.fillRect(0, 0, W, H);
    if (state.mode === 'spiral') drawSpiral(g, W, H, wide, fs);
    else if (state.mode === 'coast') drawCoast(g, W, H, wide, fs);
    else drawEquator(g, W, H, wide, fs);
  }
  function title(g, txt, x, y, fs) { D.haloText(g, txt, x, y, C.muted, 'left', 'middle', '600 ' + fs + 'px ' + FONT); }

  // ---------- 一、艾克曼螺旋 ----------
  function drawSpiral(g, W, H, wide, fs) {
    let pl, co;
    if (wide) { const pw = Math.round(W * 0.47); pl = { x: 0, y: 0, w: pw, h: H }; co = { x: pw + 14, y: 0, w: W - pw - 14, h: H }; }
    else { const ph = Math.round(Math.min(W, 420)); pl = { x: 0, y: 0, w: W, h: ph }; co = { x: 0, y: ph + 14, w: W, h: H - ph - 14 }; }
    drawPlan(g, pl, fs);
    drawColumn(g, co, fs);
  }
  function levels() { const n = 14, zm = zMax(), out = []; for (let i = n; i >= 0; i--) out.push(-i * zm / n); return out; }
  function drawPlan(g, r, fs) {
    title(g, T('從上往下看各深度的海流（北在上）', 'Currents at each depth, seen from above (north up)'), r.x + 6, r.y + 11, fs);
    const cx = r.x + r.w / 2, cy = r.y + 22 + (r.h - 22) / 2, R = Math.max(40, Math.min(r.w, r.h - 22) / 2 - 30);
    // 海面圓盤與方位
    const bg = g.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
    bg.addColorStop(0, D.alpha(C['ek-sea'], D.dark ? 0.14 : 0.1)); bg.addColorStop(1, D.alpha(C['ek-sea'], D.dark ? 0.06 : 0.04));
    g.fillStyle = bg; g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.fill();
    g.strokeStyle = D.alpha(C.text, 0.09); g.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach(function (q) { g.beginPath(); g.arc(cx, cy, R * q, 0, 2 * Math.PI); g.stroke(); });
    g.strokeStyle = D.alpha(C.text, 0.3); g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.stroke();
    for (let a = 0; a < 360; a += 15) {
      const u = K.unit(a), l = a % 90 === 0 ? 9 : a % 45 === 0 ? 6 : 3;
      g.strokeStyle = D.alpha(C.text, a % 45 === 0 ? 0.45 : 0.22);
      g.beginPath(); g.moveTo(cx + u[0] * R, cy - u[1] * R); g.lineTo(cx + u[0] * (R - l), cy - u[1] * (R - l)); g.stroke();
    }
    [[0, T('北', 'N')], [90, T('東', 'E')], [180, T('南', 'S')], [270, T('西', 'W')]].forEach(function (q) {
      const u = K.unit(q[0]);
      D.haloText(g, q[1], cx + u[0] * (R + 14), cy - u[1] * (R + 13), C.text, 'center', 'middle', '700 ' + (fs + 0.5) + 'px ' + FONT);
    });
    const at = function (az, L) { const u = K.unit(az); return [cx + u[0] * L, cy - u[1] * L]; };
    // 風（寬而淡，在最底下）
    if (P.U > 0) {
      const a = at(E.windTo + 180, R * 0.92), b = at(E.windTo, R * 0.92);
      D.arrow(g, a[0], a[1], b[0], b[1], D.alpha(C['ek-wind'], 0.2), 12);
    }
    if (E.V0 <= 0) {
      D.pill(g, T('沒有風：海水不動', 'No wind: the water is still'), cx, cy + 5, C.muted, 'center', '600 ' + fs + 'px ' + FONT);
      return;
    }
    const L = R * 0.86, zm = zMax();
    // 速度圖（各深度箭頭尖端連成的螺旋）
    g.strokeStyle = D.alpha(C.text, 0.32); g.lineWidth = 1.2; g.setLineDash([3, 3]); g.beginPath();
    for (let i = 0; i <= 240; i++) {
      const v = K.ekmanAt(E, -zm * i / 240), p = at(v.az, L * v.speed / E.V0);
      if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]);
    }
    g.stroke(); g.setLineDash([]);
    // 淨輸送
    const tr = at(E.transAz, R * 0.74);
    D.arrow(g, cx, cy, tr[0], tr[1], C['ek-trans'], 5);
    // 各深度的海流
    levels().forEach(function (z, k, arr) {
      const v = K.ekmanAt(E, z), p = at(v.az, L * v.speed / E.V0);
      if (Math.hypot(p[0] - cx, p[1] - cy) < 4) return;
      D.arrow(g, cx, cy, p[0], p[1], depthColor(-z / zm), z === 0 ? 3 : 1.6 + 1.2 * (1 + z / zm));
    });
    // 探測深度
    const pv = K.ekmanAt(E, -P.zProbe), pp = at(pv.az, L * pv.speed / E.V0);
    if (Math.hypot(pp[0] - cx, pp[1] - cy) >= 4) D.arrow(g, cx, cy, pp[0], pp[1], C['ek-probe'], 3);
    D.ball(g, pp[0], pp[1], 5, C['ek-probe']);
    // 標籤
    const lab = function (txt, az, Lr, color, side) {
      const p = at(az, Lr), u = K.unit(az + 90 * side);
      D.pill(g, txt, p[0] + u[0] * 16, p[1] - u[1] * 16 + 4, color, 'center', '700 ' + (fs - 0.5) + 'px ' + FONT);
    };
    const s = E.s;
    if (P.U > 0) lab(T('風 ', 'Wind ') + num(P.U, 1) + ' m/s', E.windTo, R * 0.6, C['ek-wind'], -s);
    lab(T('表面流', 'Surface current'), E.surfAz, L * 0.62, depthColor(0), -s);
    lab(T('淨輸送', 'Net transport'), E.transAz, R * 0.62, C['ek-trans'], s);
    const pl = at(pv.az, Math.max(Math.hypot(pp[0] - cx, pp[1] - cy), R * 0.3) + 22);
    D.pill(g, T('探測 ', 'Probe ') + num(P.zProbe, 0) + ' m', pl[0], pl[1] + 4, C['ek-probe'], 'center', '700 ' + (fs - 0.5) + 'px ' + FONT);
    D.haloText(g, s > 0 ? T('北半球：往風的右邊偏', 'Northern Hemisphere: turns right of the wind') : T('南半球：往風的左邊偏', 'Southern Hemisphere: turns left of the wind'),
      r.x + r.w / 2, r.y + r.h - 6, C.muted, 'center', 'bottom', '600 ' + (fs - 0.5) + 'px ' + FONT);
  }
  function drawColumn(g, r, fs) {
    title(g, T('斜看：海流隨深度旋轉', 'Tilted view: the current turns with depth'), r.x + 6, r.y + 11, fs);
    const zm = zMax(), AX = 0.42, AY = 0.3;
    const Lm = Math.max(30, Math.min(r.w * 0.27, 118, (r.w - 58) / (2 + 2 * AX)));
    const top = r.y + 66 + AY * Lm, bottom = r.y + r.h - 16 - AY * Lm;
    const ox = r.x + 48 + Lm * (1 + AX) + Math.max(0, r.w - 58 - Lm * (2 + 2 * AX)) / 2;
    const Yz = function (z) { return top + (-z / zm) * (bottom - top); };
    const pj = function (e, n, z) { return [ox + Lm * (e + n * AX), Yz(z) - Lm * n * AY]; };
    const quad = function (z, fill, stroke, dash) {
      const a = pj(-1, -1, z), b = pj(1, -1, z), c = pj(1, 1, z), d = pj(-1, 1, z);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.2; if (dash) g.setLineDash(dash); g.stroke(); g.setLineDash([]); }
    };
    // 水柱：從海面到最深處的淡色水體
    const wg = g.createLinearGradient(0, Yz(0), 0, Yz(-zm));
    wg.addColorStop(0, D.alpha(C['ek-sea'], D.dark ? 0.14 : 0.1)); wg.addColorStop(1, D.alpha(C['ek-sea'], D.dark ? 0.28 : 0.2));
    const a0 = pj(-1, -1, 0), b0 = pj(1, -1, 0), c0 = pj(1, 1, 0), a1 = pj(-1, -1, -zm), b1 = pj(1, -1, -zm), c1 = pj(1, 1, -zm);
    g.fillStyle = wg; g.beginPath(); g.moveTo(a0[0], a0[1]); g.lineTo(b0[0], b0[1]); g.lineTo(c0[0], c0[1]); g.lineTo(c1[0], c1[1]); g.lineTo(b1[0], b1[1]); g.lineTo(a1[0], a1[1]); g.closePath(); g.fill();
    g.strokeStyle = D.alpha(C.text, 0.16); g.lineWidth = 1;
    [[a0, a1], [b0, b1], [c0, c1]].forEach(function (q) { g.beginPath(); g.moveTo(q[0][0], q[0][1]); g.lineTo(q[1][0], q[1][1]); g.stroke(); });
    quad(-zm, null, D.alpha(C.text, 0.16));
    // 深度刻度
    const st = niceStep(zm, 5);
    for (let z = 0; z <= zm + 1e-6; z += st) {
      const p = pj(-1, -1, -z);
      g.strokeStyle = D.alpha(C.text, 0.4); g.beginPath(); g.moveTo(p[0] - 5, p[1]); g.lineTo(p[0], p[1]); g.stroke();
      D.haloText(g, num(z, 0) + ' m', p[0] - 8, p[1], C.muted, 'right', 'middle', '500 ' + (fs - 1) + 'px ' + FONT);
    }
    // 艾克曼深度
    if (E.DE <= zm) {
      quad(-E.DE, null, D.alpha(C.text, 0.5), [5, 4]);
      const p = pj(1, -1, -E.DE);
      D.pill(g, 'D_E = ' + num(E.DE, 1) + ' m', Math.min(p[0] + 8, r.x + r.w - 4), p[1] + 5, C.text, p[0] + 8 > r.x + r.w - 110 ? 'right' : 'left', '700 ' + (fs - 0.5) + 'px ' + FONT);
    }
    // 中心軸
    g.strokeStyle = D.alpha(C.text, 0.35); g.lineWidth = 1.2; g.setLineDash([2, 3]);
    g.beginPath(); g.moveTo(ox, Yz(0)); g.lineTo(ox, Yz(-zm)); g.stroke(); g.setLineDash([]);
    // 各深度的海流（深的先畫）
    if (E.V0 > 0) {
      levels().forEach(function (z) {
        const v = K.ekmanAt(E, z), p = pj(v.e / E.V0, v.n / E.V0, z), o = pj(0, 0, z);
        if (Math.hypot(p[0] - o[0], p[1] - o[1]) < 3) return;
        D.arrow(g, o[0], o[1], p[0], p[1], depthColor(-z / zm), z === 0 ? 2.8 : 1.5 + 1.1 * (1 + z / zm));
      });
      // 探測深度
      quad(-P.zProbe, null, D.alpha(C['ek-probe'], 0.75));
      const v = K.ekmanAt(E, -P.zProbe), p = pj(v.e / E.V0, v.n / E.V0, -P.zProbe), o = pj(0, 0, -P.zProbe);
      if (Math.hypot(p[0] - o[0], p[1] - o[1]) >= 3) D.arrow(g, o[0], o[1], p[0], p[1], C['ek-probe'], 2.8);
      D.ball(g, p[0], p[1], 4.5, C['ek-probe']);
    }
    // 海面（半透明蓋在最上面）
    quad(0, D.alpha(C['ek-sea'], D.dark ? 0.16 : 0.12), D.alpha(C['ek-sea'], 0.7));
    const ea = pj(1.12, -0.8, 0), na = pj(-0.8, 1.12, 0);
    D.haloText(g, T('東', 'E'), ea[0] + 4, ea[1], C.muted, 'left', 'middle', '700 ' + fs + 'px ' + FONT);
    D.haloText(g, T('北', 'N'), na[0], na[1] - 4, C.muted, 'center', 'bottom', '700 ' + fs + 'px ' + FONT);
    if (E.V0 > 0) {
      const u = K.unit(E.transAz), t1 = pj(u[0] * 0.95, u[1] * 0.95, 0), t0 = pj(0, 0, 0);
      D.arrow(g, t0[0], t0[1], t1[0], t1[1], C['ek-trans'], 4);
    }
    // 風（畫在海面上方）
    if (P.U > 0) {
      const u = K.unit(E.windTo), w0 = pj(-u[0] * 0.75, -u[1] * 0.75, 0), w1 = pj(u[0] * 0.75, u[1] * 0.75, 0), lift = 34;
      D.arrow(g, w0[0], w0[1] - lift, w1[0], w1[1] - lift, C['ek-wind'], 3.4);
      D.pill(g, T('風', 'Wind'), w0[0] + (w0[0] <= w1[0] ? -6 : 6), w0[1] - lift + 4, C['ek-wind'], w0[0] <= w1[0] ? 'right' : 'left', '700 ' + (fs - 0.5) + 'px ' + FONT);
    }
  }

  // ---------- 二、沿岸湧升 ----------
  function drawCoast(g, W, H, wide, fs) {
    let mp, sc;
    if (wide) { const mw = Math.round(W * 0.38); mp = { x: 0, y: 0, w: mw, h: H }; sc = { x: mw + 16, y: 0, w: W - mw - 16, h: H }; }
    else { const mh = Math.round(Math.min(W * 0.8, 340)); mp = { x: 0, y: 0, w: W, h: mh }; sc = { x: 0, y: mh + 14, w: W, h: H - mh - 14 }; }
    drawCoastMap(g, mp, fs);
    drawCoastSection(g, sc, fs);
  }
  // 海在西邊時離岸往左（往北看，陸地在右）；海在東邊時離岸往右
  function offSign() { return state.coast === 'W' ? -1 : 1; }
  function drawCoastMap(g, r, fs) {
    title(g, T('地圖（北在上）：海面溫度', 'Map (north up): sea-surface temperature'), r.x + 6, r.y + 11, fs);
    const x0 = r.x + 4, y0 = r.y + 24, w = r.w - 8, h = r.h - 30;
    const landW = Math.round(w * 0.2), seaW = w - landW, sgn = offSign();
    const coastX = sgn < 0 ? x0 + seaW : x0 + landW;
    const kx = seaW / X_KM;   // px／km
    const Xkm = function (km) { return coastX + sgn * km * kx; };
    // 海面溫度
    const n = Math.ceil(seaW / 2);
    for (let i = 0; i < n; i++) {
      const km = (i + 0.5) / n * X_KM, xa = Xkm(i / n * X_KM), xb = Xkm((i + 1) / n * X_KM);
      g.fillStyle = tempCSS(K.sstAt(Cs, km * 1000));
      g.fillRect(Math.min(xa, xb) - 0.3, y0, Math.abs(xb - xa) + 0.6, h);
    }
    // 陸地
    const lx = sgn < 0 ? coastX : x0;
    const lg = g.createLinearGradient(lx, 0, lx + landW, 0);
    lg.addColorStop(sgn < 0 ? 0 : 1, C['ek-land']); lg.addColorStop(sgn < 0 ? 1 : 0, D.alpha(C['ek-land'], 0.75));
    g.fillStyle = lg; g.fillRect(lx, y0, landW, h);
    g.strokeStyle = D.alpha(C.text, 0.55); g.lineWidth = 1.6; g.beginPath(); g.moveTo(coastX, y0); g.lineTo(coastX, y0 + h); g.stroke();
    D.haloText(g, T('陸地', 'Land'), lx + landW / 2, y0 + h - 14, C.text, 'center', 'middle', '700 ' + fs + 'px ' + FONT);
    g.strokeStyle = D.alpha(C.text, 0.3); g.lineWidth = 1; g.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    // 冷水露頭的鋒面
    if (Cs.out && Cs.front / 1000 <= X_KM) {
      const fx = Xkm(Cs.front / 1000);
      g.strokeStyle = D.alpha(C.text, 0.8); g.setLineDash([5, 4]); g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(fx, y0 + 4); g.lineTo(fx, y0 + h - 4); g.stroke(); g.setLineDash([]);
      D.pill(g, T('冷水露頭 ', 'Cold water at ') + num(Cs.front / 1000, 1) + ' km', fx - sgn * 4, y0 + 18, C.text, sgn < 0 ? 'right' : 'left', '700 ' + (fs - 0.5) + 'px ' + FONT);
    } else if (Cs.out) {
      D.pill(g, T('冷水露頭到 60 km 以外', 'Cold water beyond 60 km'), x0 + seaW / 2 + (sgn < 0 ? 0 : landW), y0 + 18, C.text, 'center', '700 ' + (fs - 0.5) + 'px ' + FONT);
    }
    // 風與艾克曼輸送
    const scx = (Xkm(0) + Xkm(X_KM)) / 2, mid = y0 + h / 2;
    if (P.U > 0) {
      const u = K.unit(E.windTo), Lw = Math.min(seaW, h) * (0.12 + 0.2 * Math.min(1, P.U / 20));
      [-0.34, 0.34].forEach(function (q, i) {
        const cx = scx + (i ? 1 : -1) * seaW * 0.12, cy = mid + q * h;
        D.arrow(g, cx - u[0] * Lw / 2, cy + u[1] * Lw / 2, cx + u[0] * Lw / 2, cy - u[1] * Lw / 2, C['ek-wind'], 3);
      });
      D.pill(g, T('風 ', 'Wind ') + num(P.U, 1) + ' m/s', scx - seaW * 0.12, mid - 0.34 * h - Lw / 2 - 12 > y0 + 34 ? mid - 0.34 * h - Lw / 2 - 8 : mid - 0.34 * h + Lw / 2 + 18, C['ek-wind'], 'center', '700 ' + (fs - 0.5) + 'px ' + FONT);
      const t = K.unit(E.transAz), Lt = Math.min(seaW, h) * 0.3;
      D.arrow(g, scx, mid, scx + t[0] * Lt, mid - t[1] * Lt, C['ek-trans'], 4.5);
      D.pill(g, T('艾克曼輸送', 'Ekman transport'), scx + t[0] * Lt * 0.6 + (t[1] >= 0 ? 0 : 0), mid - t[1] * Lt * 0.6 + (t[1] >= 0 ? 20 : -12), C['ek-trans'], 'center', '700 ' + (fs - 0.5) + 'px ' + FONT);
    }
    // 比例尺
    const bx = sgn < 0 ? x0 + 10 : x0 + w - 10 - 10 * kx, by = y0 + h - 12;
    g.strokeStyle = C.text; g.lineWidth = 2; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + 10 * kx, by); g.stroke();
    D.haloText(g, '10 km', bx + 5 * kx, by - 8, C.text, 'center', 'middle', '600 ' + (fs - 1) + 'px ' + FONT);
  }
  function drawCoastSection(g, r, fs) {
    title(g, T('離岸剖面（往北看；深度方向放大）', 'Offshore section (looking north; depth exaggerated)'), r.x + 6, r.y + 11, fs);
    const sgn = offSign(), skyH = 30, x0 = r.x + (sgn < 0 ? 40 : 4), y0 = r.y + 24, w = r.w - 44, h = r.h - 24 - 20;
    const landW = Math.round(w * 0.1), seaW = w - landW;
    const coastX = sgn < 0 ? x0 + seaW : x0 + landW;
    const Xkm = function (km) { return coastX + sgn * km / X_KM * seaW; };
    const sy = y0 + skyH, sh = h - skyH;
    const Yz = function (z) { return sy + (-z / Z_COAST) * sh; };
    // 天空
    const sk = g.createLinearGradient(0, y0, 0, sy);
    sk.addColorStop(0, D.alpha(C['ek-sky'], 0.2)); sk.addColorStop(1, D.alpha(C['ek-sky'], 0.9));
    g.fillStyle = sk; g.fillRect(x0, y0, w, skyH);
    // 溫度
    const img = raster('coast', seaW, sh, coastKey(), function (u, v) { return coastTempUV(sgn < 0 ? 1 - u : u, v); });
    g.drawImage(img, sgn < 0 ? x0 : x0 + landW, sy, seaW, sh);
    // 陸地
    const lx = sgn < 0 ? coastX : x0;
    g.fillStyle = C['ek-land']; g.fillRect(lx, y0 + skyH - 10, landW, h - skyH + 10);
    g.strokeStyle = D.alpha(C.text, 0.5); g.lineWidth = 1.4; g.beginPath(); g.moveTo(coastX, y0 + skyH - 10); g.lineTo(coastX, y0 + h); g.stroke();
    // 等溫線（抬升後的位置：原本深度 + η）
    const iso = function (zt, color, wdt, dash, label) {
      g.strokeStyle = color; g.lineWidth = wdt; if (dash) g.setLineDash(dash);
      g.beginPath(); let started = false, lastX = 0, lastY = 0;
      for (let i = 0; i <= 160; i++) {
        const km = i / 160 * X_KM, z = zt + K.etaAt(Cs, km * 1000);
        if (z > 0 || z < -Z_COAST) { started = false; continue; }
        const X = Xkm(km), Y = Yz(z);
        if (started) g.lineTo(X, Y); else { g.moveTo(X, Y); started = true; }
        lastX = X; lastY = Y;
      }
      g.stroke(); g.setLineDash([]);
      const zf = zt + K.etaAt(Cs, X_KM * 1000);
      if (label && zf <= -4 && zf >= -Z_COAST + 4) D.haloText(g, label, Xkm(X_KM) + (sgn < 0 ? 3 : -3), Yz(zf) - 6, C.text, sgn < 0 ? 'left' : 'right', 'middle', '600 ' + (fs - 1.5) + 'px ' + FONT);
    };
    [10, 12, 14, 16, 18].forEach(function (t) {
      const zt = -P.H1 + K.H_T * Math.log((t - K.T_D) / (K.T_S - K.T_D));
      iso(zt, D.alpha(D.dark ? '#e2e8f0' : '#0f172a', 0.38), 1, [3, 3], t + ' °C');
    });
    iso(-P.H1, D.alpha(D.dark ? '#f8fafc' : '#0f172a', 0.85), 2, null, null);
    // 暖水層底的標籤
    const zf = -P.H1 + K.etaAt(Cs, X_KM * 1000 * 0.75);
    if (zf < -6) D.pill(g, T('暖水層底', 'Base of the warm layer'), Xkm(X_KM * 0.75), Yz(zf) - 6, C.text, 'center', '700 ' + (fs - 1) + 'px ' + FONT);
    // 海面
    g.strokeStyle = D.alpha(C['ek-sea'], 0.9); g.lineWidth = 2; g.beginPath(); g.moveTo(Xkm(0), sy); g.lineTo(Xkm(X_KM), sy); g.stroke();
    // 環流箭頭
    if (Math.abs(Cs.Moff) > 0.02 && P.U > 0) {
      const up = Cs.Moff > 0, wd = 1.6 + Math.min(2.6, Math.abs(Cs.Moff) * 0.8), col = D.dark ? '#f8fafc' : '#0f172a';
      const arr = function (k0, z0, k1, z1) {
        if (!up) { const t = k0; k0 = k1; k1 = t; const s = z0; z0 = z1; z1 = s; }
        D.arrow(g, Xkm(k0), Yz(z0), Xkm(k1), Yz(z1), D.alpha(col, 0.82), wd);
      };
      const rk = Math.min(X_KM * 0.3, Math.max(2.5, 0.6 * Cs.Rd / 1000));
      arr(3, -12, 26, -12);            // 表層：艾克曼輸送離岸
      arr(rk, -130, rk, -40);          // 岸邊：湧升
      arr(40, -140, 9, -140);          // 深層：向岸補充
      D.pill(g, up ? T('湧升', 'Upwelling') : T('下沉', 'Downwelling'), Xkm(rk) - sgn * 14, Yz(-85) + 4, C.text, sgn < 0 ? 'right' : 'left', '700 ' + fs + 'px ' + FONT);
    }
    // 沿岸風（往北看：往北吹＝離開觀看者 ⊗、往南吹＝朝向觀看者 ⊙）
    if (P.U > 0) {
      const u = K.unit(E.windTo), along = u[1] * P.U, cross = u[0] * P.U, cx = Xkm(X_KM) - sgn * 16, cy = y0 + skyH / 2;
      if (Math.abs(along) >= 0.05) {
        g.fillStyle = C.surface; g.strokeStyle = C['ek-wind']; g.lineWidth = 1.8;
        g.beginPath(); g.arc(cx, cy, 8, 0, 2 * Math.PI); g.fill(); g.stroke();
        if (along > 0) { g.beginPath(); g.moveTo(cx - 4.5, cy - 4.5); g.lineTo(cx + 4.5, cy + 4.5); g.moveTo(cx + 4.5, cy - 4.5); g.lineTo(cx - 4.5, cy + 4.5); g.stroke(); }
        else { g.fillStyle = C['ek-wind']; g.beginPath(); g.arc(cx, cy, 2.6, 0, 2 * Math.PI); g.fill(); }
        D.pill(g, T('沿岸風往' + (along > 0 ? '北' : '南') + ' ', 'Along-shore wind to the ' + (along > 0 ? 'north ' : 'south ')) + num(Math.abs(along), 1) + ' m/s', cx - sgn * 14, cy + 4, C['ek-wind'], sgn < 0 ? 'left' : 'right', '700 ' + (fs - 0.5) + 'px ' + FONT);
      }
      if (Math.abs(cross) >= 0.05 && Math.abs(along) < 0.05) {
        const L = 26 * Math.sign(cross);
        D.arrow(g, cx - L / 2, cy, cx + L / 2, cy, C['ek-wind'], 3);
      }
    }
    // 座標
    for (let z = 0; z <= Z_COAST; z += 50) D.haloText(g, z + ' m', sgn < 0 ? x0 - 4 : x0 + w + 4, Yz(-z), C.muted, sgn < 0 ? 'right' : 'left', 'middle', '500 ' + (fs - 1) + 'px ' + FONT);
    for (let k = 0; k <= X_KM; k += 20) D.haloText(g, k + ' km', Xkm(k), y0 + h + 10, C.muted, k === 0 ? (sgn < 0 ? 'right' : 'left') : 'center', 'middle', '500 ' + (fs - 1) + 'px ' + FONT);
    g.strokeStyle = D.alpha(C.text, 0.3); g.lineWidth = 1; g.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
  }

  // ---------- 三、赤道太平洋 ----------
  function eqCloudX() {
    let a = 0, n = 0, best = -1e9, bx = 0.5;
    for (let i = 0; i <= 60; i++) {
      const x = i / 60, t = K.sstFromH(K.thermoAt(Q, x)), w = Math.max(0, t - CONVECT);
      a += w * x; n += w; if (t > best) { best = t; bx = x; }
    }
    return n > 0 ? a / n : bx;
  }
  function drawEquator(g, W, H, wide, fs) {
    title(g, T('沿著赤道的剖面（東經 120° 到西經 80°）', 'A section along the equator (120°E to 80°W)'), 6, 11, fs);
    const x0 = 46, x1 = W - (wide ? 46 : 10), y0 = 24, atmH = wide ? 120 : 100, sy = y0 + atmH, bot = H - 26, oh = bot - sy;
    const landW = Math.max(18, Math.round((x1 - x0) * 0.045));
    const ax = x0 + landW, bx = x1 - landW, bw = bx - ax;
    const Xu = function (u) { return ax + u * bw; }, Yd = function (d) { return sy + d / Z_EQ * oh; };
    // 天空
    const sk = g.createLinearGradient(0, y0, 0, sy);
    sk.addColorStop(0, D.alpha(C['ek-sky'], 0.15)); sk.addColorStop(1, D.alpha(C['ek-sky'], 0.95));
    g.fillStyle = sk; g.fillRect(x0, y0, x1 - x0, atmH);
    // 海水溫度
    const img = raster('eq', bw, oh, String(P.p), eqTempUV);
    g.drawImage(img, ax, sy, bw, oh);
    // 海面高度（誇大）：西邊高、東邊低
    const EX = wide ? 20 : 15;
    const etaX = function (u) { return Q.deta * (0.5 - u); };
    for (let i = 0; i < Math.ceil(bw / 2); i++) {
      const u = (i + 0.5) / Math.ceil(bw / 2), X = Xu(i / Math.ceil(bw / 2)), dw = bw / Math.ceil(bw / 2) + 0.5, e = etaX(u) * EX;
      if (e > 0) { g.fillStyle = tempCSS(eqTemp(u, 0)); g.fillRect(X, sy - e, dw, e); }
      else if (e < 0) { g.fillStyle = D.alpha(C['ek-sky'], 0.95); g.fillRect(X, sy, dw, -e); }
    }
    g.strokeStyle = D.alpha(C['ek-sea'], 0.95); g.lineWidth = 2; g.beginPath(); g.moveTo(Xu(0), sy - etaX(0) * EX); g.lineTo(Xu(1), sy - etaX(1) * EX); g.stroke();
    // 陸地
    g.fillStyle = C['ek-land'];
    g.fillRect(x0, sy - 14, landW, bot - sy + 14); g.fillRect(bx, sy - 22, landW, bot - sy + 22);
    D.haloText(g, T('印尼', 'Indonesia'), x0, sy - 22, C.text, 'left', 'bottom', '700 ' + (fs - 1) + 'px ' + FONT);
    D.haloText(g, T('南美', 'S. America'), x1, sy - 30, C.text, 'right', 'bottom', '700 ' + (fs - 1) + 'px ' + FONT);
    // 溫躍層（20 °C 等溫線）
    g.strokeStyle = D.dark ? '#f8fafc' : '#0f172a'; g.lineWidth = 2.4; g.beginPath();
    for (let i = 0; i <= 120; i++) { const u = i / 120, X = Xu(u), Y = Yd(Math.min(Z_EQ, K.thermoAt(Q, u))); if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }
    g.stroke();
    const um = 0.5, dm = K.thermoAt(Q, um);
    D.pill(g, T('溫躍層（20 °C 等溫線）', 'Thermocline (20 °C isotherm)'), Xu(um), Math.min(bot - 10, Yd(dm) + (dm < 230 ? 22 : -10)), C.text, 'center', '700 ' + (fs - 0.5) + 'px ' + FONT);
    D.pill(g, num(Q.hW, 0) + ' m', Xu(0) + 6, Math.min(bot - 6, Math.max(sy + 16, Yd(Q.hW) + (Q.hW > 260 ? -8 : 18))), C.text, 'left', '700 ' + (fs - 0.5) + 'px ' + FONT);
    D.pill(g, num(Q.hE, 0) + ' m', Xu(1) - 6, Math.min(bot - 6, Math.max(sy + 16, Yd(Q.hE) + (Q.hE > 260 ? -8 : 18))), C.text, 'right', '700 ' + (fs - 0.5) + 'px ' + FONT);
    // 海面高度差
    D.pill(g, T('海面西比東高 ', 'Sea level west − east: ') + num(Q.deta * 100, 0) + ' cm' + T('（高度誇大）', ' (exaggerated)'), Xu(0.5), sy + 20, C.text, 'center', '600 ' + (fs - 1) + 'px ' + FONT);
    // 信風
    const pp = P.p / 100, xc = eqCloudX(), lx = xc < 0.5 ? 0.7 : 0.3;
    if (Math.abs(pp) > 0.005) {
      const dir = pp > 0 ? -1 : 1, L = 18 + 26 * Math.min(1.6, Math.sqrt(Math.abs(pp))), yw = sy - 30;
      [0.2, 0.42, 0.64, 0.86].forEach(function (u) { const X = Xu(u); D.arrow(g, X - dir * L / 2, yw, X + dir * L / 2, yw, C['ek-wind'], 3); });
      D.pill(g, (pp > 0 ? T('信風（往西）', 'Trade winds (to the west)') : T('西風（往東）', 'Westerlies (to the east)')) + ' ' + num(Math.abs(Q.U), 1) + ' m/s', Xu(lx), sy - 9, C['ek-wind'], 'center', '700 ' + (fs - 0.5) + 'px ' + FONT);
    } else D.pill(g, T('沒有風', 'No wind'), Xu(lx), sy - 9, C['ek-wind'], 'center', '700 ' + (fs - 0.5) + 'px ' + FONT);
    // 沃克環流：最暖的海面上空對流旺盛（雲、雨）
    const cX = Xu(xc), cY = y0 + 30, aCell = Math.min(1, Math.abs(pp) * 1.2);
    if (aCell > 0.05) {
      const far = pp > 0 ? Math.min(0.95, xc + 0.55) : Math.max(0.05, xc - 0.55), fX = Xu(far), col = D.alpha(C.muted, 0.35 + 0.45 * aCell);
      D.arrow(g, cX, y0 + 14, fX, y0 + 14, col, 2);
      D.arrow(g, fX, y0 + 18, fX, sy - 50, col, 2);
      D.arrow(g, cX, sy - 44, cX, y0 + 50, col, 2);
      D.haloText(g, T('沃克環流', 'Walker circulation'), (cX + fX) / 2, y0 + 6, C.muted, 'center', 'middle', '600 ' + (fs - 1) + 'px ' + FONT);
    }
    // 雲與雨
    g.save();
    g.strokeStyle = D.alpha(D.dark ? '#93c5fd' : '#2563eb', 0.55); g.lineWidth = 1.3;
    for (let i = -3; i <= 3; i++) { const X = cX + i * 7; g.beginPath(); g.moveTo(X, cY + 16); g.lineTo(X - 4, cY + 34); g.stroke(); }
    [[-18, 4, 13], [0, -2, 17], [18, 4, 13], [-8, 8, 12], [9, 8, 12]].forEach(function (q) {
      const gg = g.createRadialGradient(cX + q[0] - q[2] * 0.3, cY + q[1] - q[2] * 0.4, 1, cX + q[0], cY + q[1], q[2]);
      gg.addColorStop(0, D.dark ? '#e2e8f0' : '#ffffff'); gg.addColorStop(1, D.dark ? '#64748b' : '#cbd5e1');
      g.fillStyle = gg; g.beginPath(); g.arc(cX + q[0], cY + q[1], q[2], 0, 2 * Math.PI); g.fill();
    });
    g.restore();
    // 經度與深度
    [[0, '120°E'], [0.3, '180°'], [0.6, '120°W'], [1, '80°W']].forEach(function (q) { D.haloText(g, q[1], Xu(q[0]), bot + 11, C.muted, q[0] === 1 ? 'right' : q[0] === 0 ? 'left' : 'center', 'middle', '500 ' + (fs - 1) + 'px ' + FONT); });
    for (let d = 0; d <= Z_EQ; d += 100) D.haloText(g, d + ' m', x0 - 4, Yd(d), C.muted, 'right', 'middle', '500 ' + (fs - 1) + 'px ' + FONT);
    g.strokeStyle = D.alpha(C.text, 0.3); g.lineWidth = 1; g.strokeRect(ax + 0.5, sy + 0.5, bw - 1, oh - 1);
    // 狀態
    const stt = Q.enso.state;
    D.pill(g, stt === 'nino' ? T('類似聖嬰', 'El Niño-like') : stt === 'nina' ? T('類似反聖嬰', 'La Niña-like') : T('正常', 'Neutral'), bx - 8, bot - 12,
      stt === 'nino' ? '#dc2626' : stt === 'nina' ? '#2563eb' : C.muted, 'right', '700 ' + fs + 'px ' + FONT);
  }

  // =====================================================================
  // 圖表
  // =====================================================================
  function drawChart() {
    if (!grSize || !E) return;
    const W = grSize.w, H = grSize.h, g = gtx, fs = W < 520 ? 10.5 : 11.5;
    g.clearRect(0, 0, W, H);
    g.fillStyle = C['canvas-bg']; g.fillRect(0, 0, W, H);
    if (state.mode === 'spiral') chartSpiral(g, W, H, fs);
    else if (state.mode === 'coast') chartCoast(g, W, H, fs);
    else chartEq(g, W, H, fs);
  }
  function axes(g, box, xr, yr, xl, yl, fs, opt) {
    opt = opt || {};
    const X = function (v) { return box.l + (v - xr[0]) / (xr[1] - xr[0]) * (box.r - box.l); };
    const Y = opt.down ? function (v) { return box.t + (v - yr[0]) / (yr[1] - yr[0]) * (box.b - box.t); } : function (v) { return box.b - (v - yr[0]) / (yr[1] - yr[0]) * (box.b - box.t); };
    const sx = opt.sx || niceStep(xr[1] - xr[0], 4), syy = opt.sy || niceStep(yr[1] - yr[0], 4);
    g.lineWidth = 1;
    for (let v = Math.ceil(yr[0] / syy) * syy; v <= yr[1] + 1e-9; v += syy) {
      const y = Math.round(Y(v)) + 0.5; g.strokeStyle = D.alpha(C.text, 0.08); g.beginPath(); g.moveTo(box.l, y); g.lineTo(box.r, y); g.stroke();
      D.haloText(g, (opt.fy || function (q) { return num(q, syy < 1 ? 1 : 0); })(v), box.l - 4, y, C.muted, 'right', 'middle', '500 ' + (fs - 1) + 'px ' + FONT);
    }
    for (let v = Math.ceil(xr[0] / sx) * sx; v <= xr[1] + 1e-9; v += sx) {
      const x = Math.round(X(v)) + 0.5; g.strokeStyle = D.alpha(C.text, 0.06); g.beginPath(); g.moveTo(x, box.t); g.lineTo(x, box.b); g.stroke();
      D.haloText(g, (opt.fx || function (q) { return num(q, sx < 1 ? 1 : 0); })(v), x, box.b + 11, C.muted, Math.abs(v - xr[1]) < 1e-9 && opt.fx ? 'right' : 'center', 'middle', '500 ' + (fs - 1) + 'px ' + FONT);
    }
    g.strokeStyle = D.alpha(C.text, 0.4); g.strokeRect(box.l + 0.5, box.t + 0.5, box.r - box.l - 1, box.b - box.t - 1);
    D.haloText(g, xl, (box.l + box.r) / 2, box.b + 25, C.muted, 'center', 'middle', '600 ' + (fs - 0.5) + 'px ' + FONT);
    D.haloText(g, yl, box.l - 2, box.t - 9, C.muted, 'left', 'middle', '600 ' + (fs - 0.5) + 'px ' + FONT);
    return { X: X, Y: Y };
  }
  function chartSpiral(g, W, H, fs) {
    const zm = zMax(), gap = 54, half = (W - 40 - gap) / 2;
    const b1 = { l: 40, r: 40 + half, t: 22, b: H - 34 }, b2 = { l: 40 + half + gap, r: W - 8, t: 22, b: H - 34 };
    const vmax = Math.max(1, Math.ceil(E.V0 * 100 * 1.1));
    const A = axes(g, b1, [0, vmax], [0, zm], T('流速（cm/s）', 'Speed (cm/s)'), T('深度（m）', 'Depth (m)'), fs, { down: true });
    const amax = Math.min(540, Math.max(180, Math.ceil((45 + zm / E.d * 180 / Math.PI) / 45) * 45));
    const B = axes(g, b2, [0, amax], [0, zm], T('和風向的夾角（度）', 'Angle from the wind (°)'), T('深度（m）', 'Depth (m)'), fs, { down: true, sx: amax > 360 ? 90 : 45 });
    // 艾克曼深度與探測深度
    [[A, b1], [B, b2]].forEach(function (q) {
      if (E.DE <= zm) { const y = q[0].Y(E.DE); g.strokeStyle = D.alpha(C.text, 0.55); g.setLineDash([5, 4]); g.beginPath(); g.moveTo(q[1].l, y); g.lineTo(q[1].r, y); g.stroke(); g.setLineDash([]); }
      const y = q[0].Y(P.zProbe); g.strokeStyle = D.alpha(C['ek-probe'], 0.7); g.beginPath(); g.moveTo(q[1].l, y); g.lineTo(q[1].r, y); g.stroke();
    });
    if (E.DE <= zm) D.haloText(g, 'D_E', b1.r - 4, A.Y(E.DE) - 7, C.text, 'right', 'middle', '700 ' + (fs - 1) + 'px ' + FONT);
    if (E.V0 <= 0) return;
    g.save(); g.beginPath(); g.rect(b1.l, b1.t, b1.r - b1.l, b1.b - b1.t); g.clip();
    g.strokeStyle = C.accent; g.lineWidth = 2.2; g.beginPath();
    for (let i = 0; i <= 120; i++) { const z = zm * i / 120, v = K.ekmanAt(E, -z).speed * 100; if (i) g.lineTo(A.X(v), A.Y(z)); else g.moveTo(A.X(v), A.Y(z)); }
    g.stroke(); g.restore();
    g.save(); g.beginPath(); g.rect(b2.l, b2.t, b2.r - b2.l, b2.b - b2.t); g.clip();
    g.strokeStyle = C.accent; g.lineWidth = 2.2; g.beginPath();
    for (let i = 0; i <= 120; i++) { const z = zm * i / 120, a = 45 + z / E.d * 180 / Math.PI; if (i) g.lineTo(B.X(a), B.Y(z)); else g.moveTo(B.X(a), B.Y(z)); }
    g.stroke(); g.restore();
    D.ball(g, A.X(PR.speed * 100), A.Y(P.zProbe), 5, C['ek-probe']);
    const ap = 45 + P.zProbe / E.d * 180 / Math.PI;
    if (ap <= amax) D.ball(g, B.X(ap), B.Y(P.zProbe), 5, C['ek-probe']);
  }
  function chartCoast(g, W, H, fs) {
    const gap = 54, half = (W - 46 - gap) / 2;
    const b1 = { l: 46, r: 46 + half, t: 22, b: H - 34 }, b2 = { l: 46 + half + gap, r: W - 8, t: 22, b: H - 34 };
    const eMax = Cs.Moff * DAYS_MAX * 86400 / Cs.Rd;
    let lo = Math.min(0, eMax), hi = Math.max(0, eMax, P.H1 * 1.2);
    const st = niceStep(hi - lo, 4); lo = Math.floor(lo / st) * st; hi = Math.ceil(hi / st) * st;
    const A = axes(g, b1, [0, DAYS_MAX], [lo, hi], T('天數', 'Days'), T('岸邊溫躍層抬升（m）', 'Thermocline rise at coast (m)'), fs, { sx: 5, sy: st });
    // 露頭門檻 η = H1
    if (P.H1 <= hi) { const y = A.Y(P.H1); g.strokeStyle = D.alpha(C.text, 0.55); g.setLineDash([5, 4]); g.beginPath(); g.moveTo(b1.l, y); g.lineTo(b1.r, y); g.stroke(); g.setLineDash([]); D.haloText(g, T('冷水露頭', 'cold water surfaces'), b1.l + 4, y - 7, C.text, 'left', 'middle', '600 ' + (fs - 1) + 'px ' + FONT); }
    g.strokeStyle = C.accent; g.lineWidth = 2.2; g.beginPath(); g.moveTo(A.X(0), A.Y(0)); g.lineTo(A.X(DAYS_MAX), A.Y(eMax)); g.stroke();
    D.ball(g, A.X(P.days), A.Y(Cs.eta0), 5, C.accent);
    const B = axes(g, b2, [0, DAYS_MAX], [8, 22], T('天數', 'Days'), T('岸邊海面溫度（°C）', 'SST at the coast (°C)'), fs, { sx: 5, sy: 2 });
    g.strokeStyle = '#0ea5e9'; g.lineWidth = 2.2; g.beginPath();
    for (let i = 0; i <= 200; i++) {
      const d = DAYS_MAX * i / 200, c = K.coastal({ lat: latS(), U: P.U, windFrom: P.windFrom, coast: state.coast, H1: P.H1, days: d });
      if (i) g.lineTo(B.X(d), B.Y(c.sst0)); else g.moveTo(B.X(d), B.Y(c.sst0));
    }
    g.stroke();
    if (isFinite(Cs.tOut) && Cs.tOut <= DAYS_MAX) {
      const x = B.X(Cs.tOut); g.strokeStyle = D.alpha(C.text, 0.4); g.setLineDash([4, 4]); g.beginPath(); g.moveTo(x, b2.t); g.lineTo(x, b2.b); g.stroke(); g.setLineDash([]);
    }
    D.ball(g, B.X(P.days), B.Y(Cs.sst0), 5, '#0ea5e9');
  }
  function chartEq(g, W, H, fs) {
    const box = { l: 46, r: W - 10, t: 22, b: H - 34 };
    const A = axes(g, box, [-50, 200], [0, Z_EQ], T('信風的風應力（平常的 %）', 'Trade-wind stress (% of normal)'), T('溫躍層深度（m）', 'Thermocline depth (m)'), fs, { down: true, sx: 50, sy: 50, fx: function (v) { return num(v, 0) + '%'; } });
    // 聖嬰／反聖嬰的區間
    let lastS = null, x0 = -50;
    const band = function (a, b, s) {
      if (s === 'neutral') return;
      g.fillStyle = s === 'nino' ? 'rgba(220,38,38,' + (D.dark ? 0.16 : 0.09) + ')' : 'rgba(37,99,235,' + (D.dark ? 0.18 : 0.09) + ')';
      g.fillRect(A.X(a), box.t + 1, A.X(b) - A.X(a), box.b - box.t - 2);
      D.haloText(g, s === 'nino' ? T('類似聖嬰', 'El Niño-like') : T('類似反聖嬰', 'La Niña-like'), (A.X(a) + A.X(b)) / 2, box.b - 10, s === 'nino' ? '#dc2626' : '#2563eb', 'center', 'middle', '700 ' + (fs - 0.5) + 'px ' + FONT);
    };
    for (let p = -50; p <= 200.001; p += 0.5) {
      const s = K.ensoState(K.equator({ p: p / 100 })).state;
      if (lastS !== null && s !== lastS) { band(x0, p, lastS); x0 = p; }
      lastS = s;
    }
    band(x0, 200, lastS);
    const curve = function (key, color) {
      g.strokeStyle = color; g.lineWidth = 2.4; g.beginPath();
      for (let i = 0; i <= 250; i++) { const p = -50 + i, q = K.equator({ p: p / 100 }); if (i) g.lineTo(A.X(p), A.Y(Math.min(Z_EQ, q[key]))); else g.moveTo(A.X(p), A.Y(Math.min(Z_EQ, q[key]))); }
      g.stroke();
    };
    const cW = D.dark ? '#f87171' : '#dc2626', cE = D.dark ? '#60a5fa' : '#2563eb';
    curve('hW', cW); curve('hE', cE);
    const xp = A.X(P.p);
    g.strokeStyle = D.alpha(C.text, 0.45); g.setLineDash([4, 4]); g.beginPath(); g.moveTo(xp, box.t); g.lineTo(xp, box.b); g.stroke(); g.setLineDash([]);
    D.ball(g, xp, A.Y(Math.min(Z_EQ, Q.hW)), 5, cW); D.ball(g, xp, A.Y(Math.min(Z_EQ, Q.hE)), 5, cE);
    D.pill(g, T('西太平洋', 'West Pacific'), A.X(195), A.Y(Math.min(Z_EQ, K.equator({ p: 1.95 }).hW)) - 8, cW, 'right', '700 ' + (fs - 0.5) + 'px ' + FONT);
    D.pill(g, T('東太平洋', 'East Pacific'), A.X(-45), A.Y(K.equator({ p: -0.45 }).hE) + 18, cE, 'left', '700 ' + (fs - 0.5) + 'px ' + FONT);
    D.haloText(g, T('平常', 'normal'), A.X(100), box.t + 8, C.muted, 'center', 'middle', '600 ' + (fs - 1) + 'px ' + FONT);
  }

  // =====================================================================
  // 讀數、事件與音效
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function setStatus(s) { $('status').textContent = s; }
  function snapshot() {
    if (state.mode === 'spiral') {
      return { mode: 'spiral', lat: latS(), U: P.U, windFrom: P.windFrom, Av: P.Av, z: P.zProbe, f: E.f, tau: E.tau, V0: E.V0, DE: E.DE, M: E.M,
        windTo: E.windTo, surfAz: E.surfAz, transAz: E.transAz, probeAz: PR.az, probeSpeed: PR.speed, probeTurn: PR.turn };
    }
    if (state.mode === 'coast') {
      return { mode: 'coast', lat: latS(), U: P.U, windFrom: P.windFrom, coast: state.coast, H1: P.H1, days: P.days, Moff: Cs.Moff, bakun: Cs.bakun,
        w: Cs.w, wDay: Cs.wDay, Rd: Cs.Rd, eta0: Cs.eta0, out: Cs.out, front: Cs.front, sst0: Cs.sst0, no3: Cs.no3, tOut: Cs.tOut, playing: state.playing };
    }
    return { mode: 'equator', p: P.p / 100, U: Q.U, tau: Q.tau, hW: Q.hW, hE: Q.hE, deta: Q.deta, sstE: Q.sstE, sstW: Q.sstW, anom: Q.enso.anom, state: Q.enso.state, outcrop: Q.outcrop };
  }
  let lastEmit = 0;
  function emitState(force) {
    const t = performance.now();
    if (force || t - lastEmit > 250) { lastEmit = t; emit(state.mode, snapshot()); }
  }
  function refreshOutputs() {
    const dec = { lat: 1, U: 1, windFrom: 0, Av: 3, zProbe: 0, H1: 0, days: 1, p: 0 };
    ids.forEach(function (k) { setOut(el[k], outNum(P[k], dec[k]) + (k === 'p' ? '%' : '')); });
  }
  function bestWindFrom() {   // 讓離岸輸送最大的風向
    const s = E.s, off = state.coast === 'W' ? 270 : 90;
    return K.wrap360(off - 90 * s + 180);
  }
  function updateReadouts() {
    setHTML('rF', num(E.f * 1e5, 2) + ' × 10<sup>−5</sup> s<sup>−1</sup>');
    setHTML('rTau', num(E.tau, 3) + ' N/m<sup>2</sup><span class="sub">C<sub>D</sub> = ' + num(E.Cd * 1000, 2) + ' × 10<sup>−3</sup></span>');
    setHTML('rV0', num(E.V0 * 100, 1) + ' cm/s<span class="sub">' + (E.V0 > 0 ? T('風速的 ', '') + num(E.ratio * 100, 2) + T('%，往', '% of the wind, towards ') + dirName(E.surfAz) + '（' + az3(E.surfAz) + '）' : '—') + '</span>');
    setHTML('rDE', num(E.DE, 1) + ' m<span class="sub">d = ' + num(E.d, 1) + ' m</span>');
    setHTML('rM', num(E.M, 2) + ' m<sup>2</sup>/s<span class="sub">' + (E.M > 0 ? T('往', 'towards ') + dirName(E.transAz) + '（' + az3(E.transAz) + T('，風的' + (E.s > 0 ? '右' : '左') + '邊 90°）', ', 90° to the ' + (E.s > 0 ? 'right' : 'left') + ' of the wind)') : '—') + '</span>');
    setHTML('rProbe', num(PR.speed * 100, 2) + ' cm/s<span class="sub">' + (E.V0 > 0 ? T('表面的 ', '') + num(PR.frac * 100, 1) + T('%，比表面流再轉 ', '% of the surface, turned a further ') + num(Math.abs(PR.turn), 1) + '°' : '—') + '</span>');
    // 沿岸
    setHTML('rMoff', num(Math.abs(Cs.Moff), 2) + ' m<sup>2</sup>/s<span class="sub">' + (Math.abs(Cs.Moff) < 0.005 ? T('沒有離岸或向岸的輸送', 'no cross-shore transport') : Cs.Moff > 0 ? T('離岸', 'offshore') : T('向岸', 'onshore')) + '</span>');
    setHTML('rBakun', num(Cs.bakun, 0) + ' m<sup>3</sup>/s<span class="sub">' + T('每 100 m 海岸', 'per 100 m of coast') + '</span>');
    setHTML('rRd', num(Cs.Rd / 1000, 1) + ' km');
    setHTML('rW', num(Math.abs(Cs.wDay), 1) + T(' m／天', ' m/day') + '<span class="sub">' + (Math.abs(Cs.wDay) < 0.05 ? '—' : Cs.w > 0 ? T('湧升', 'upwelling') : T('下沉', 'downwelling')) + '</span>');
    setHTML('rEta', num(Cs.eta0, 1) + ' m');
    setHTML('rSST', num(Cs.sst0, 1) + ' °C<span class="sub">' + (Cs.out ? T('冷水露頭到離岸 ', 'cold water out to ') + num(Cs.front / 1000, 1) + ' km' : isFinite(Cs.tOut) ? T('第 ', 'cold water surfaces on day ') + num(Cs.tOut, 1) + T(' 天冷水露頭', '') : T('冷水不會露頭', 'cold water never surfaces')) + '</span>');
    setHTML('rNO3', num(Cs.no3, 1) + ' μmol/L');
    // 赤道
    setHTML('rTauE', num(Q.tau, 3) + ' N/m<sup>2</sup><span class="sub">' + T('等效風速 ', 'equivalent wind ') + num(Math.abs(Q.U), 1) + ' m/s' + (Math.abs(Q.U) < 0.05 ? '' : Q.U > 0 ? T('，往西', ', to the west') : T('，往東', ', to the east')) + '</span>');
    setHTML('rH', num(Q.hW, 0) + '／' + num(Q.hE, 0) + ' m' + (Q.outcrop ? '<span class="sub">' + T('溫躍層在' + (Q.hE <= 0 ? '東' : '西') + '邊露出海面', 'thermocline reaches the surface in the ' + (Q.hE <= 0 ? 'east' : 'west')) + '</span>' : ''));
    setHTML('rDeta', num(Q.deta * 100, 1) + ' cm');
    setHTML('rSstE', num(Q.sstE, 1) + ' °C<span class="sub">' + T('比平常 ', '') + (Q.enso.anom >= 0 ? '+' : '−') + num(Math.abs(Q.enso.anom), 2) + ' °C' + T('', ' from normal') + '</span>');
    const s = Q.enso.state;
    setHTML('rState', '<span class="state ' + s + '">' + (s === 'nino' ? T('類似聖嬰', 'El Niño-like') : s === 'nina' ? T('類似反聖嬰', 'La Niña-like') : T('正常', 'Neutral')) + '</span>');
    // 提示
    $('windHint').textContent = P.U > 0
      ? T(windName(P.windFrom) + '：從' + dirName(P.windFrom) + '吹向' + dirName(E.windTo) + '。', 'A ' + windName(P.windFrom) + ': it blows from the ' + dirName(P.windFrom) + ' towards the ' + dirName(E.windTo) + '.') +
        (state.mode === 'coast' ? T('這個海岸最有利湧升的風從 ' + az3(bestWindFrom()) + '（' + dirName(bestWindFrom()) + '）吹來。', ' Upwelling is strongest here when the wind blows from ' + az3(bestWindFrom()) + ' (' + dirName(bestWindFrom()) + ').') : '')
      : T('沒有風。', 'No wind.');
    $('eqHint').textContent = T('平常（100%）：西邊溫躍層約 200 m 深、東邊約 40 m。信風減弱 → 溫躍層變平 → 東太平洋變暖。', 'Normal (100%): the thermocline is about 200 m deep in the west and 40 m in the east. Weaker trades → flatter thermocline → warmer east.');
    const m = state.mode;
    setHTML('chartHint', m === 'spiral'
      ? T('左：流速隨深度按指數變小；右：方向隨深度一直轉，到艾克曼深度 D_E 剛好和表面流相反（再轉 180°）。粉紅線是探測深度。', 'Left: the speed falls off exponentially with depth; right: the direction keeps turning, and at the Ekman depth D_E it is exactly opposite to the surface current (a further 180°). The pink line is the probe depth.')
      : m === 'coast'
        ? T('左：岸邊溫躍層隨時間線性抬升，碰到虛線（表層暖水的厚度）冷水就露出海面；右：岸邊海面溫度。', 'Left: the thermocline at the coast rises steadily with time; when it reaches the dashed line (the warm-layer thickness) cold water surfaces. Right: sea-surface temperature at the coast.')
        : T('紅線是西太平洋、藍線是東太平洋的溫躍層深度。信風越強，兩邊差越大；紅色底是類似聖嬰、藍色底是類似反聖嬰。', 'Red: thermocline depth in the west Pacific; blue: in the east. Stronger trades make the difference larger; red shading = El Niño-like, blue = La Niña-like.'));
    $('hint3d').textContent = m === 'spiral'
      ? T('3D：每一層深度一支海流箭頭，顏色越深越深；細線連起箭頭尖端就是艾克曼螺旋，粉紅圈是探測深度。拖曳旋轉、滾輪或兩指縮放。', '3D: one arrow per depth (darker = deeper); the thin line joining their tips is the Ekman spiral and the pink ring is the probe depth. Drag to rotate; scroll or pinch to zoom.')
      : m === 'coast'
        ? T('3D：正面是垂直海岸的溫度剖面，頂面是海面溫度，旁邊是陸地；深度方向放大。拖曳旋轉、滾輪或兩指縮放。', '3D: the front face is the temperature section across the coast, the top is the sea-surface temperature, with the land beside it; depth exaggerated. Drag to rotate; scroll or pinch to zoom.')
        : T('3D：沿著赤道的海洋長方塊，半透明面是溫躍層（20 °C），雲在最暖的海面上空；海面高度與深度方向都放大。拖曳旋轉、滾輪或兩指縮放。', '3D: a block of ocean along the equator; the translucent surface is the thermocline (20 °C) and the cloud sits over the warmest water; sea level and depth are exaggerated. Drag to rotate; scroll or pinch to zoom.');
    $('hint2d').textContent = m === 'spiral'
      ? T('左：從上往下看，每支箭頭是一個深度的海流（顏色越深越深），虛線是箭頭尖端連成的螺旋；右：斜看的水柱。選取畫布後：左右方向鍵＝風向，上下＝風速。', 'Left: seen from above, each arrow is the current at one depth (darker = deeper) and the dashed curve joins their tips; right: a tilted view of the water column. With the canvas focused: left/right = wind direction, up/down = wind speed.')
      : m === 'coast'
        ? T('左：地圖上的海面溫度；右：垂直海岸的剖面，虛線是等溫線、粗線是表層暖水的底。選取畫布後：左右方向鍵＝風向，上下＝風速。', 'Left: sea-surface temperature on the map; right: a section perpendicular to the coast — dashed lines are isotherms, the thick line is the base of the warm layer. With the canvas focused: left/right = wind direction, up/down = wind speed.')
        : T('剖面沿著赤道從印尼到南美。粗線是溫躍層（20 °C 等溫線），雲在最暖的海面上空。選取畫布後：上下方向鍵＝信風強度。', 'The section runs along the equator from Indonesia to South America. The thick line is the thermocline (20 °C isotherm); clouds form over the warmest water. With the canvas focused: up/down = trade-wind strength.');
  }
  let lastSay = 0;
  function sayNow(force) {
    const t = performance.now(); if (!force && t - lastSay < 3000) return; lastSay = t;
    let txt;
    if (state.mode === 'spiral') txt = T('表面流 ', 'Surface current ') + num(E.V0 * 100, 1) + T(' 公分每秒，艾克曼深度 ', ' centimetres per second, Ekman depth ') + num(E.DE, 0) + T(' 公尺，淨輸送往', ' metres, net transport towards the ') + dirName(E.transAz);
    else if (state.mode === 'coast') txt = (Cs.Moff > 0.005 ? T('湧升', 'Upwelling') : Cs.Moff < -0.005 ? T('下沉', 'Downwelling') : T('沒有湧升', 'No upwelling')) + T('，第 ', ', day ') + num(P.days, 1) + T(' 天，岸邊海溫 ', ', coastal temperature ') + num(Cs.sst0, 1) + T(' 度', ' degrees');
    else txt = T('信風 ', 'Trade winds ') + num(P.p, 0) + T('%，東太平洋溫躍層 ', ' percent, eastern thermocline ') + num(Q.hE, 0) + T(' 公尺，', ' metres, ') + (Q.enso.state === 'nino' ? T('類似聖嬰', 'El Niño-like') : Q.enso.state === 'nina' ? T('類似反聖嬰', 'La Niña-like') : T('正常', 'neutral'));
    $('srNow').textContent = txt;
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  let lastEnso = null, lastOut = null, lastUp = null;
  function soundCues() {
    const S = sound(), up = Cs.Moff > 0.005 ? 1 : Cs.Moff < -0.005 ? -1 : 0;
    if (state.mode === 'equator' && lastEnso != null && Q.enso.state !== lastEnso) {
      if (S) S.tone({ freq: Q.enso.state === 'nino' ? 660 : Q.enso.state === 'nina' ? 392 : 523, dur: 0.14, gain: 0.09 });
      setStatus(Q.enso.state === 'nino' ? T('東太平洋比平常暖 0.5 °C 以上：類似聖嬰。暖水和雨雲往東移。', 'The east Pacific is 0.5 °C warmer than normal: El Niño-like. The warm water and rain clouds shift east.')
        : Q.enso.state === 'nina' ? T('東太平洋比平常冷 0.5 °C 以上：類似反聖嬰。', 'The east Pacific is 0.5 °C colder than normal: La Niña-like.')
          : T('回到正常的範圍。', 'Back in the normal range.'));
    }
    if (state.mode === 'coast' && lastOut != null && Cs.out !== lastOut) {
      if (S) S.tone({ freq: Cs.out ? 784 : 440, dur: 0.14, gain: 0.09 });
      if (Cs.out) setStatus(T('第 ', 'Day ') + num(Cs.tOut, 1) + T(' 天：冷水在岸邊露出海面，海面溫度開始下降。', ': cold water reaches the surface at the coast and the sea-surface temperature starts to fall.'));
    }
    if (state.mode === 'coast' && lastUp != null && up !== lastUp) {
      if (S) S.tone({ freq: up > 0 ? 587 : up < 0 ? 330 : 294, dur: 0.08, gain: 0.07 });
      setStatus(up > 0 ? T('艾克曼輸送往外海：岸邊的海水被推走，深層冷水湧上來。', 'The Ekman transport is offshore: surface water is pushed away and cold deep water rises.')
        : up < 0 ? T('艾克曼輸送往岸邊：表層暖水堆在岸邊往下沉。', 'The Ekman transport is onshore: warm surface water piles up and sinks.')
          : T('艾克曼輸送和海岸平行：不湧升也不下沉。', 'The Ekman transport runs along the coast: no upwelling or downwelling.'));
    }
    lastEnso = Q.enso.state; lastOut = Cs.out; lastUp = up;
  }
  function refreshAll() { compute(); soundCues(); refreshOutputs(); updateReadouts(); requestDraw(); }

  // =====================================================================
  // 控制項
  // =====================================================================
  function setSeg(id, attr, v) {
    document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(v))); });
  }
  ids.forEach(function (k) {
    el[k].addEventListener('input', function () { if (internal) return; acted(); if (k === 'days' && state.playing) { state.playing = false; setPlayLabel(); } readSliders(); refreshAll(); emitState(); sayNow(); });
    el[k].addEventListener('change', function () { if (internal) return; readSliders(); refreshAll(); emitState(true); });
  });
  function applyMode() {
    const m = state.mode;
    setSeg('modeSeg', 'data-mode', m);
    $('windCard').hidden = m === 'equator';
    $('spiralCard').hidden = m !== 'spiral'; $('coastCard').hidden = m !== 'coast'; $('eqCard').hidden = m !== 'equator';
    $('rdSpiral').hidden = m !== 'spiral'; $('rdCoast').hidden = m !== 'coast'; $('rdEq').hidden = m !== 'equator';
    $('playBtn').hidden = m !== 'coast';
    if (m !== 'coast') stopPlay();
    cv.setAttribute('aria-label', m === 'spiral' ? T('艾克曼螺旋：左邊從上往下看各深度的海流，右邊是斜看的海流柱', 'Ekman spiral: currents at each depth seen from above (left) and as a tilted column (right)')
      : m === 'coast' ? T('沿岸湧升：左邊是海面溫度地圖，右邊是垂直海岸的溫度剖面', 'Coastal upwelling: a map of sea-surface temperature (left) and a temperature section across the coast (right)')
        : T('赤道太平洋：從印尼到南美的溫度剖面，含溫躍層、海面高度與信風', 'Equatorial Pacific: a temperature section from Indonesia to South America with the thermocline, sea level and trade winds'));
    gr.setAttribute('aria-label', m === 'spiral' ? T('流速與方向對深度的圖', 'Speed and direction against depth')
      : m === 'coast' ? T('岸邊溫躍層高度與海面溫度對時間的圖', 'Coastal thermocline rise and sea-surface temperature against time')
        : T('東西太平洋溫躍層深度對信風強度的圖', 'Thermocline depth in the west and east Pacific against trade-wind strength'));
    buildLegend();
    imgKey = {};
    if (cvSize && !(view3 && view3.active)) resizeCv();
  }
  document.querySelectorAll('#modeSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); state.mode = b.getAttribute('data-mode'); applyMode(); refreshAll();
      setStatus(state.mode === 'spiral' ? T('艾克曼螺旋：看海流怎麼隨深度變弱、轉向。', 'Ekman spiral: see how the current weakens and turns with depth.')
        : state.mode === 'coast' ? T('沿岸湧升：選海岸與風向，按「播放」看冷水湧上來。', 'Coastal upwelling: choose the coast and wind, then press “Play” to watch cold water rise.')
          : T('赤道太平洋：調信風的強弱，看溫躍層、海溫與雨雲怎麼變。', 'Equatorial Pacific: change the trade winds and watch the thermocline, the water temperature and the rain clouds.'));
      if (view3) view3.rebuild(); emitState(true);
    });
  });
  document.querySelectorAll('#hemiSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); state.hemi = b.getAttribute('data-hemi'); setSeg('hemiSeg', 'data-hemi', state.hemi); refreshAll(); emitState(true); sayNow(true); });
  });
  document.querySelectorAll('#coastSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); state.coast = b.getAttribute('data-coast'); setSeg('coastSeg', 'data-coast', state.coast); refreshAll(); if (view3) view3.rebuild(); emitState(true); sayNow(true); });
  });
  // 播放（沿岸湧升的天數）
  let lastT = 0;
  function setPlayLabel() { $('playBtn').textContent = state.playing ? T('暫停', 'Pause') : T('播放', 'Play'); $('playBtn').setAttribute('aria-pressed', String(state.playing)); }
  function stopPlay() { if (state.playing) { state.playing = false; setPlayLabel(); setRange(el.days, P.days); emitState(true); } }
  $('playBtn').addEventListener('click', function () {
    acted();
    if (state.playing) { stopPlay(); return; }
    if (P.days >= DAYS_MAX - 1e-6) setRange(el.days, 0);
    if (reducedMotion) { setRange(el.days, DAYS_MAX); readSliders(); refreshAll(); emitState(true); setStatus(T('已跳到第 20 天（減少動態效果）。', 'Jumped to day 20 (reduced motion).')); return; }
    state.playing = true; setPlayLabel(); lastT = 0; readSliders(); requestDraw();
  });
  function stepPlay(tnow) {
    if (!state.playing) return;
    const dt = lastT ? Math.min(0.1, (tnow - lastT) / 1000) : 0; lastT = tnow;
    // 播放中直接改滑桿的值（不觸發 input／change 事件，避免每一幀都驅動分享、統計等監聽）；停下來時再同步一次
    const d = Math.min(DAYS_MAX, P.days + dt * PLAY_RATE);
    el.days.value = String(Math.round(d * 100) / 100); P.days = d; refreshAll();
    if (d >= DAYS_MAX) { state.playing = false; setPlayLabel(); setRange(el.days, DAYS_MAX); readSliders(); emitState(true); }
    else emitState();
  }
  $('clearBtn').addEventListener('click', function () {
    acted(); state.playing = false; setPlayLabel();
    setRange(el.days, 0); readSliders(); refreshAll();
    setStatus(T('時間歸零（風剛開始吹）；其他設定不變。', 'Time reset to zero (the wind has just started); the other settings are unchanged.'));
    emitState(true);
  });
  $('soundBtn').addEventListener('click', function () {
    const on = !(window.LabSettings && window.LabSettings.get('sound'));
    if (window.LabSettings) window.LabSettings.set('sound', on);
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 鍵盤 ----------
  if (window.LabKeys) {
    window.LabKeys.attach(cv, {
      label: T('海流畫面。左右方向鍵＝風向，上下＝風速（赤道模式是信風強度），Shift 走大步。', 'Ocean view. Left/right = wind direction, up/down = wind speed (trade-wind strength in the equator view); Shift for bigger steps.'),
      items: [{
        name: function () { return state.mode === 'spiral' ? T('艾克曼螺旋', 'Ekman spiral') : state.mode === 'coast' ? T('沿岸湧升', 'Coastal upwelling') : T('赤道太平洋', 'Equatorial Pacific'); },
        move: function (dx, dy, big) {
          if (!dx && !dy) return false;
          acted();
          if (state.mode === 'equator') { if (dy) setRange(el.p, clamp(P.p + dy * (big ? 10 : 1), -50, 200)); }
          else {
            if (dx) setRange(el.windFrom, K.wrap360(Math.round(P.windFrom + dx * (big ? 15 : 1))) % 360);
            if (dy) setRange(el.U, clamp(Math.round((P.U + dy * (big ? 2 : 0.5)) * 10) / 10, 0, 25));
          }
          readSliders(); refreshAll(); emitState(true); return true;
        },
        describe: function () {
          return state.mode === 'equator' ? T('信風 ', 'Trade winds ') + num(P.p, 0) + T('%，東邊溫躍層 ', ' percent, eastern thermocline ') + num(Q.hE, 0) + T(' 公尺', ' metres')
            : windName(P.windFrom) + ' ' + num(P.U, 1) + T(' 公尺每秒', ' metres per second');
        }
      }]
    });
  }

  // ---------- 分享 ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { m: state.mode, h: state.hemi, c: state.coast }; },
    set: function (o) {
      if (!o) return;
      if (o.m === 'spiral' || o.m === 'coast' || o.m === 'equator') state.mode = o.m;
      state.hemi = o.h === 'S' ? 'S' : 'N'; setSeg('hemiSeg', 'data-hemi', state.hemi);
      state.coast = o.c === 'E' ? 'E' : 'W'; setSeg('coastSeg', 'data-coast', state.coast);
      applyMode(); readSliders(); refreshAll(); if (view3) view3.rebuild();
    }
  });

  // =====================================================================
  // 繪圖迴圈
  // =====================================================================
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(loop); }
  function loop(tnow) {
    raf = 0;
    stepPlay(tnow);
    if (view3 && view3.active) view3.frame(tnow); else drawMain();
    drawChart();
    if (state.playing || (view3 && view3.active && view3.busy())) requestDraw();   // requestDraw 不會重複排程
  }

  // =====================================================================
  // 3D 檢視（切換時才載入 three.js 與 ekman-upwelling-3d.js）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    K: K, T: T, D: D, state: state, colors: function () { return C; }, reducedMotion: reducedMotion, num: num,
    P: function () { return P; }, E: function () { return E; }, Cs: function () { return Cs; }, Q: function () { return Q; },
    latS: latS, zMax: zMax, depthColor: depthColor, tempCSS: tempCSS, eqTemp: eqTemp, cloudX: eqCloudX, X_KM: X_KM, Z_COAST: Z_COAST, Z_EQ: Z_EQ,
    // 3D 牆面用的溫度貼圖（w、h 是像素）
    paint: function (kind, w, h) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      if (kind === 'coast') return paintTemp(c, coastTempUV);
      if (kind === 'eq') return paintTemp(c, eqTempUV);
      if (kind === 'coastTop') return paintTemp(c, function (u) { return K.sstAt(Cs, u * X_KM * 1000); });
      return paintTemp(c, function (u) { return eqTemp(u, 0); });
    },
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
      if (window.Ekman3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Ekman3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/ekman-upwelling-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Ekman3D) throw new Error('ekman-upwelling-3d.js did not load');
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
        view3 = window.Ekman3D.create(lib, host3, bridge);
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
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D。', 'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    updateViewNotes();
    resizeCv();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); emit('view', { mode: '3d' }); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  ['Tilt', 'Top', 'Side'].forEach(function (k) {
    $('cam' + k).addEventListener('click', function () { if (view3) { view3.camTo(k.toLowerCase()); bridge.onCam(k.toLowerCase()); } });
  });

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  readSliders();
  updateSoundButton();
  setPlayLabel();
  function themeChanged() {
    readColors(); imgKey = {};
    applyMode(); setPlayLabel();
    updateSoundButton(); compute(); updateReadouts(); refreshOutputs();
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
  applyMode();
  resizeCv();
  compute();
  lastEnso = Q.enso.state; lastOut = Cs.out; lastUp = Cs.Moff > 0.005 ? 1 : Cs.Moff < -0.005 ? -1 : 0;
  refreshOutputs();
  updateReadouts();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) requestDraw(); });
  setStatus(T('北緯 35°、10 m/s 的北風：表面流偏到風的右邊 45°，整層海水往西輸送。', '35°N, a 10 m/s north wind: the surface current runs 45° to the right of the wind, and the whole layer is carried west.'));
  requestDraw();
  // 測試用（Playwright）
  window.__ek = { state: state, K: K, snapshot: snapshot, setView: setView, E: function () { return E; }, Cs: function () { return Cs; }, Q: function () { return Q; },
    set: function (o) { acted(); Object.keys(o).forEach(function (k) { if (el[k]) setRange(el[k], o[k]); }); readSliders(); refreshAll(); emitState(true); },
    mode: function (m) { acted(); state.mode = m; applyMode(); refreshAll(); if (view3) view3.rebuild(); emitState(true); },
    hemi: function (h) { acted(); state.hemi = h; setSeg('hemiSeg', 'data-hemi', h); refreshAll(); emitState(true); },
    coast: function (c) { acted(); state.coast = c; setSeg('coastSeg', 'data-coast', c); refreshAll(); if (view3) view3.rebuild(); emitState(true); } };
})();
