/* tides.js — 「潮汐」的畫面與互動（物理計算全部在 tides-core.js；3D 在 tides-3d.js，切換時才載入） */
(function () {
  'use strict';
  const K = window.TidesCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // 本檔的版本號（?v=）：切換到 3D 時動態載入的 js/tides-3d.js 沿用同一個版本號
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const DEG = K.DEG, TAU = K.TAU;
  const FONT = D.FONT;
  const SEA = 1.13;        // 畫面上「平均海面」的半徑（地球半徑的倍數）：海水層的厚度本身也是誇大的示意
  const E0 = 2.5e6;        // 預設的隆起誇大倍數

  // =====================================================================
  // 狀態
  // =====================================================================
  const DEF = { psi: 40, dec: 10, dist: 1, lat: 23.5, hour: 6, rate: 2 };
  const state = {
    t: DEF.hour,                           // 模擬時間（h，第 0 天 00:00 起算）
    psi0: DEF.psi - K.PSI_RATE * DEF.hour, // ψ(t) = psi0 + PSI_RATE·t
    dec: DEF.dec, dist: DEF.dist, lat: DEF.lat, sun: true,
    rate: DEF.rate, running: !reducedMotion,
    win: 3,                                // 潮位曲線的天數
    showForce: true, showParts: true, horiz: false,
    acted: false,                          // 使用者操作過後才回報任務事件（預設狀態與自動播放不算）
    segs: [],                              // 潮位紀錄：[{ pts: [[t, h], …] }]
    marks: [],                             // 播放時經過的高潮 { t, h }
    lastHigh: null,                        // 上一次經過的高潮（參數改變就清掉，才能量間隔與高度差）
    ver: 0,                                // 參數版本
    flash: null,                           // 高潮的波紋 { start }
    hover: null
  };
  function P() { return { dec: state.dec, dist: state.dist, sun: state.sun }; }
  function psiNow() { return K.psiAt(state.psi0, state.t); }
  function ltNow() { return K.ltAt(state.t); }
  function heightNow() { return K.heightT(P(), state.lat, state.psi0, state.t); }
  function paramsChanged() { state.ver++; state.lastHigh = null; newSeg(); cache.key = ''; }
  function newSeg() { const s = state.segs[state.segs.length - 1]; if (!s || s.pts.length) state.segs.push({ pts: [] }); }

  // =====================================================================
  // 顏色
  // =====================================================================
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface', '--pos', '--neg', '--probe', '--equi',
      '--td-water', '--td-deep', '--td-sun', '--td-sun-text', '--td-moon', '--td-spring', '--td-neap', '--td-space', '--b-ocean']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    if (!C['b-ocean']) C['b-ocean'] = C.accent;
    C.dark = D.dark;
  }

  // =====================================================================
  // 數字與文字
  // =====================================================================
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function signed(v, d) { const s = num(v, d); return v > 0 && s !== num(0, d) ? '+' + s : s; }
  function cm(v, d) { return signed(v * 100, d == null ? 1 : d) + ' cm'; }
  function cmAbs(v, d) { return num(v * 100, d == null ? 1 : d) + ' cm'; }
  function clock(h) {
    let m = Math.round(((h % 24) + 24) % 24 * 60);
    if (m >= 1440) m -= 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  function dayOf(t) { return Math.floor((t + 1e-9) / 24); }
  function when(t) {
    const d = dayOf(t);
    return T('第 ' + d + ' 天 ', 'Day ' + d + ', ') + clock(t - d * 24);
  }
  function dur(h) {
    const m = Math.round(h * 60), hh = Math.floor(m / 60), mm = m % 60;
    return T(hh + ' 時 ' + mm + ' 分', hh + ' h ' + mm + ' min');
  }
  /** 科學記號（HTML，用 <sup>） */
  function sci(v, d) {
    if (!(v > 0)) return '0';
    const e = Math.floor(Math.log10(v) + 1e-12), m = v / Math.pow(10, e);
    return num(m, d) + ' × 10<sup>' + (e < 0 ? '−' + (-e) : e) + '</sup>';
  }
  function phaseName(psi) {
    const a = K.norm360(psi);
    const names = [['新月', 'new moon'], ['眉月', 'waxing crescent'], ['上弦月', 'first quarter'], ['盈凸月', 'waxing gibbous'],
      ['滿月', 'full moon'], ['虧凸月', 'waning gibbous'], ['下弦月', 'last quarter'], ['殘月', 'waning crescent']];
    const n = names[Math.floor(((a + 22.5) % 360) / 45)];
    return T(n[0], n[1]);
  }
  /** 誇大倍數的文字（中文用「萬」、英文用 million／thousand） */
  function bigText(e) {
    if (LabSettingsLang() === 'en') return e >= 1e6 ? num(e / 1e6, e % 1e6 ? 1 : 0) + ' million' : num(e / 1e3, 0) + ' thousand';
    return num(e / 1e4, 0) + ' 萬';
  }
  function LabSettingsLang() { return window.LabSettings && window.LabSettings.lang === 'en' ? 'en' : 'zh'; }

  // =====================================================================
  // 共用：誇大倍數與箭頭比例（2D 與 3D 一致）
  // =====================================================================
  const NICE_E = [2.5e6, 2e6, 1e6, 5e5, 2.5e5, 2e5, 1e5, 5e4];
  /** 隆起的誇大倍數：真實距離以內固定 250 萬倍；把月球拉近時變小，讓最低處不會沉進地球裡 */
  function exaggeration() {
    const hsum = K.moonH(P()) + K.sunH(P());
    const lim = 0.24 * K.R_EARTH / Math.max(hsum, 1e-9);
    for (let i = 0; i < NICE_E.length; i++) if (NICE_E[i] <= Math.min(E0, lim)) return NICE_E[i];
    return NICE_E[NICE_E.length - 1];
  }
  /** 地表引潮力的最大值（月下點，月球＋太陽同向時） */
  function maxForce() {
    return K.subPointAccel(K.M_MOON, K.moonDist(P())) + (state.sun ? K.subPointAccel(K.M_SUN, K.AU) : 0);
  }
  /** 箭頭的比例：每 m/s² 幾個「地球半徑」 */
  function forceScale() {
    const k0 = 0.42 / 1.6e-6;
    return Math.min(k0, 0.5 / Math.max(maxForce(), 1e-12));
  }
  /** 月球在畫面上的距離（地球半徑的倍數之外，再用軌道最大半徑的比例）：距離未依比例，只保持順序 */
  function orbitFrac(dist) { return 0.66 + 0.34 * Math.log2(2 * dist) / 2; }

  // =====================================================================
  // 地球影像（NASA Blue Marble，公有領域）
  // =====================================================================
  const earthImg = new Image();
  let earthPix = null; // { w, h, data }
  earthImg.decoding = 'async';
  earthImg.onload = function () {
    try {
      const c = document.createElement('canvas');
      c.width = earthImg.naturalWidth; c.height = earthImg.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(earthImg, 0, 0);
      earthPix = { w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data };
    } catch (e) { earthPix = null; }
    diskKey = '';
    requestDraw();
  };
  earthImg.src = new URL('img/tides/earth-1024.jpg', document.baseURI).href;
  /** 等距長方投影圖上的顏色（lat、lon 度） */
  function earthAt(lat, lon) {
    const P_ = earthPix;
    let x = Math.floor((lon + 180) / 360 * P_.w); x = ((x % P_.w) + P_.w) % P_.w;
    const y = Math.max(0, Math.min(P_.h - 1, Math.floor((90 - lat) / 180 * P_.h)));
    const k = 4 * (y * P_.w + x);
    return [P_.data[k], P_.data[k + 1], P_.data[k + 2]];
  }
  /**
   * 從北極上空看的北半球（正射投影）：經度 0 朝 +X（右），往東逆時針。只在大小改變時重畫；
   * 每一幀依地球自轉角旋轉貼上。邊緣（赤道）稍暗，表現球面。
   */
  let disk = null, diskKey = '';
  function earthDisk(Rpx) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const key = Math.round(Rpx * dpr) + '|' + (earthPix ? 1 : 0) + '|' + D.ver;
    if (disk && diskKey === key) return disk;
    const N = Math.max(8, Math.round(Rpx * dpr));
    const c = document.createElement('canvas');
    c.width = c.height = 2 * N;
    const g = c.getContext('2d');
    const img = g.createImageData(2 * N, 2 * N), px = img.data;
    const ocean = D.rgb(C['td-deep'] || '#12406f'), land = [92, 124, 70];
    for (let j = 0; j < 2 * N; j++) {
      const Y = (N - j - 0.5) / N;
      for (let i = 0; i < 2 * N; i++) {
        const X = (i + 0.5 - N) / N, r2 = X * X + Y * Y;
        if (r2 > 1) continue;
        const lat = Math.acos(Math.sqrt(r2)) / DEG, lon = Math.atan2(Y, X) / DEG;
        let col = earthPix ? earthAt(lat, lon) : (lat > 78 ? [235, 240, 244] : ocean);
        if (!earthPix && lat < 78 && lat > 5 && ((lon > -10 && lon < 140 && lat < 70) || (lon > -130 && lon < -60 && lat < 70))) col = land;
        const shade = 0.62 + 0.38 * Math.sqrt(1 - r2);
        const k = 4 * (j * 2 * N + i);
        px[k] = col[0] * shade; px[k + 1] = col[1] * shade; px[k + 2] = col[2] * shade;
        // 邊緣抗鋸齒
        const edge = Math.min(1, (1 - Math.sqrt(r2)) * N);
        px[k + 3] = 255 * Math.max(0, edge);
      }
    }
    g.putImageData(img, 0, 0);
    disk = c; diskKey = key;
    return disk;
  }

  // =====================================================================
  // 畫布與尺寸
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const scv = $('sideCv'), sctx = scv.getContext('2d');
  const tcv = $('tideCv'), tctx = tcv.getContext('2d');
  let L = null;   // 俯視圖的版面
  function fit(c, g, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300;
    if (h) c.style.height = h + 'px';
    const hh = c.clientHeight || h || 300;
    c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: hh, dpr: dpr };
  }
  let topSize = null, sideSize = null, tideSize = null, starLayer = null;
  function resizeTop() {
    const w = cv.clientWidth || 300;
    const h = w < 560 ? Math.round(Math.max(320, Math.min(460, w * 1.02))) : 500;
    topSize = fit(cv, ctx, h);
    starLayer = null;
    requestDraw();
  }
  function resizeSide() { sideSize = fit(scv, sctx, scv.clientWidth < 300 ? 260 : 290); requestDraw(); }
  function resizeTide() { tideSize = fit(tcv, tctx, tcv.clientWidth < 420 ? 250 : 290); requestDraw(); }

  // =====================================================================
  // 俯視圖
  // =====================================================================
  function layout() {
    const W = topSize.w, H = topSize.h;
    const cx = Math.round(W * 0.47), cy = Math.round(H * 0.5);
    const Rmax = Math.max(60, Math.min(cx - 18, H / 2 - 22, W - cx - 30));
    const Re = Rmax * 0.4;
    const Ro = Rmax * orbitFrac(state.dist);
    const psi = psiNow();
    return { W: W, H: H, cx: cx, cy: cy, Re: Re, Rmax: Rmax, Ro: Ro, psi: psi,
      mx: cx + Ro * Math.cos(psi * DEG), my: cy - Ro * Math.sin(psi * DEG), Rm: Math.max(7, 0.2727 * Re) };
  }
  function toS(l, X, Y) { return [l.cx + X, l.cy - Y]; }
  function buildStars(W, H) {
    const c = document.createElement('canvas');
    const dpr = topSize.dpr;
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 背景：太空（淺色模式是很淡的藍灰）
    const bg = g.createRadialGradient(W * 0.45, H * 0.5, Math.min(W, H) * 0.1, W * 0.45, H * 0.5, Math.hypot(W, H) * 0.65);
    bg.addColorStop(0, D.mix(C['td-space'], C['canvas-bg'], C.dark ? 0.35 : 0.2));
    bg.addColorStop(1, C['td-space']);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    let s = 20261112;
    const r = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const n = Math.round(W * H / (C.dark ? 2600 : 5200));
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = r() * H, a = (C.dark ? 0.25 : 0.12) + r() * (C.dark ? 0.5 : 0.18), rr = r() < 0.08 ? 1.2 : 0.6;
      g.fillStyle = D.alpha(C.dark ? '#ffffff' : C.muted, a);
      g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
    }
    return c;
  }
  /** 赤道剖面上方位 a（度）的海面高度 */
  function etaEq(a, psi) { return K.heightDir(P(), psi, [Math.cos(a * DEG), Math.sin(a * DEG), 0]).total; }

  function drawTop() {
    if (!topSize) return;
    const l = L = layout();
    const W = l.W, H = l.H, Re = l.Re;
    const g = ctx;
    const E = exaggeration();
    const kpx = E / K.R_EARTH * Re;      // 每公尺海面高度在畫面上的像素
    const lt = ltNow(), psi = l.psi;
    if (!starLayer) starLayer = buildStars(W, H);
    g.drawImage(starLayer, 0, 0, W, H);

    // ---- 太陽（右方很遠處：只畫出方向） ----
    const SR = Math.max(60, H * 0.42), sx = W + SR * 0.62, sy = l.cy;
    const glow = g.createRadialGradient(sx, sy, SR * 0.6, sx, sy, SR * 1.7);
    glow.addColorStop(0, D.alpha(C['td-sun'], C.dark ? 0.35 : 0.3));
    glow.addColorStop(1, D.alpha(C['td-sun'], 0));
    g.fillStyle = glow;
    g.fillRect(W - SR * 1.2, 0, SR * 1.2, H);
    const sg = g.createRadialGradient(sx - SR * 0.3, sy - SR * 0.2, SR * 0.1, sx, sy, SR);
    sg.addColorStop(0, D.shade(C['td-sun'], 0.75));
    sg.addColorStop(0.7, D.shade(C['td-sun'], 0.2));
    sg.addColorStop(1, C['td-sun']);
    g.fillStyle = sg;
    g.beginPath(); g.arc(sx, sy, SR, 0, TAU); g.fill();
    // 陽光（平行光）
    g.save();
    g.strokeStyle = D.alpha(C['td-sun'], C.dark ? 0.22 : 0.3);
    g.lineWidth = 1;
    g.setLineDash([2, 7]);
    [0.12, 0.88].forEach(function (f) {
      const y = H * f;
      g.beginPath(); g.moveTo(W - SR * 0.4, y); g.lineTo(18, y); g.stroke();
    });
    g.restore();
    if (W >= 560) {
      [0.12, 0.88].forEach(function (f) { D.arrow(g, W * 0.3, H * f, W * 0.3 - 26, H * f, D.alpha(C['td-sun-text'], 0.8), 1.6); });
      D.haloText(g, T('陽光', 'Sunlight'), W * 0.3 + 6, H * 0.12 + 4, C['td-sun-text'], 'left', 'middle', '600 12px ' + FONT);
    }
    D.haloText(g, T('太陽在右方很遠處', 'Sun far to the right'), W - 8, l.cy - SR * 0.5 - 14 < 30 ? 30 : Math.min(H - 60, l.cy + SR * 0.62 + 18), C['td-sun-text'], 'right', 'middle', '600 12px ' + FONT);

    // ---- 月球軌道 ----
    g.save();
    g.strokeStyle = D.alpha(C.muted, C.dark ? 0.45 : 0.4);
    g.lineWidth = 1.2;
    g.setLineDash([3, 6]);
    g.beginPath(); g.arc(l.cx, l.cy, l.Ro, 0, TAU); g.stroke();
    g.restore();
    // 月相刻度（新月、上弦、滿月、下弦）
    [[0, T('新月', 'New')], [90, T('上弦', '1st Q')], [180, T('滿月', 'Full')], [270, T('下弦', 'Last Q')]].forEach(function (q) {
      // 手機寬度時，上弦、下弦的字放在軌道內側，避開角落的時間與說明文字
      const rr = W < 560 && q[0] % 180 ? l.Ro - 14 : l.Ro + 14;
      const a = q[0] * DEG, x = l.cx + rr * Math.cos(a), y = l.cy - rr * Math.sin(a);
      g.fillStyle = D.alpha(C.muted, 0.6);
      g.beginPath(); g.arc(l.cx + l.Ro * Math.cos(a), l.cy - l.Ro * Math.sin(a), 2, 0, TAU); g.fill();
      const ax = Math.cos(a), ay = Math.sin(a);
      const k = rr < l.Ro ? -4 : 4;
      D.haloText(g, q[1], x + ax * k, y - ay * k, C.muted, Math.abs(ax) < 0.3 ? 'center' : ax > 0 ? 'left' : 'right', 'middle', '11px ' + FONT);
    });

    // ---- 隆起的方向（月球、太陽） ----
    const mdx = Math.cos(psi * DEG), mdy = Math.sin(psi * DEG);
    if (state.showParts) {
      const axisLen = Re * SEA + Re * 0.55;
      g.save();
      g.lineWidth = 1.4;
      g.setLineDash([6, 5]);
      g.strokeStyle = D.alpha(C.text, C.dark ? 0.5 : 0.45);
      g.beginPath(); g.moveTo(l.cx - mdx * axisLen, l.cy + mdy * axisLen); g.lineTo(l.mx - mdx * l.Rm, l.my + mdy * l.Rm); g.stroke();
      if (state.sun) {
        g.strokeStyle = D.alpha(C['td-sun-text'], 0.75);
        g.beginPath(); g.moveTo(l.cx - axisLen, l.cy); g.lineTo(l.cx + axisLen, l.cy); g.stroke();
      }
      g.restore();
    }

    // ---- 海水（沿赤道的剖面；隆起誇大） ----
    const N = 180, ring = [];
    let hmax = -Infinity, amax = 0;
    for (let i = 0; i < N; i++) {
      const a = i * 360 / N, h = etaEq(a, psi);
      if (h > hmax) { hmax = h; amax = a; }
      const r = Re * SEA + h * kpx;
      ring.push([l.cx + r * Math.cos(a * DEG), l.cy - r * Math.sin(a * DEG)]);
    }
    const waterPath = function (gg) {
      gg.beginPath();
      ring.forEach(function (p, i) { if (i) gg.lineTo(p[0], p[1]); else gg.moveTo(p[0], p[1]); });
      gg.closePath();
    };
    const wg = g.createRadialGradient(l.cx, l.cy, Re * 0.98, l.cx, l.cy, Re * (SEA + 0.3));
    wg.addColorStop(0, C['td-deep']);
    wg.addColorStop(0.45, C['td-water']);
    wg.addColorStop(1, D.shade(C['td-water'], 0.45));
    g.save();
    g.shadowColor = D.alpha(C['td-water'], C.dark ? 0.55 : 0.35);
    g.shadowBlur = 14;
    waterPath(g);
    g.fillStyle = wg;
    g.fill();
    g.restore();
    waterPath(g);
    g.strokeStyle = D.alpha(D.shade(C['td-water'], 0.55), 0.9);
    g.lineWidth = 1.6;
    g.stroke();
    // 平均海面（參考圓）
    g.save();
    g.setLineDash([2, 4]);
    g.strokeStyle = D.alpha(C.dark ? '#ffffff' : C.text, C.dark ? 0.45 : 0.35);
    g.lineWidth = 1;
    g.beginPath(); g.arc(l.cx, l.cy, Re * SEA, 0, TAU); g.stroke();
    g.restore();

    // ---- 地球（北極上空看北半球，依自轉角旋轉） ----
    const rot = (K.siteAz(lt) - K.SITE_LON) * DEG;   // 經度 0 的方位
    const dk = earthDisk(Re);
    g.save();
    g.translate(l.cx, l.cy);
    g.rotate(-rot);
    g.drawImage(dk, -Re, -Re, 2 * Re, 2 * Re);
    g.restore();
    // 夜晚的一半（太陽在 +X：晨昏線是通過兩極的直線）
    g.save();
    g.beginPath();
    ring.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
    g.closePath();
    g.clip();
    const R2 = Re * (SEA + 0.35);
    const ng = g.createLinearGradient(l.cx - R2, 0, l.cx + 2, 0);
    ng.addColorStop(0, 'rgba(4,10,20,0.62)');
    ng.addColorStop(0.9, 'rgba(4,10,20,0.5)');
    ng.addColorStop(1, 'rgba(4,10,20,0)');
    g.fillStyle = ng;
    g.fillRect(l.cx - R2, l.cy - R2, R2 + 2, 2 * R2);
    g.restore();
    // 大氣的細邊
    g.strokeStyle = D.alpha('#9fd0ff', C.dark ? 0.5 : 0.6);
    g.lineWidth = 1.2;
    g.beginPath(); g.arc(l.cx, l.cy, Re, 0, TAU); g.stroke();
    // 北極與自轉方向
    g.fillStyle = D.alpha('#ffffff', 0.9);
    g.beginPath(); g.arc(l.cx, l.cy, 2.2, 0, TAU); g.fill();
    g.save();
    g.strokeStyle = D.alpha('#ffffff', 0.8);
    g.lineWidth = 1.5;
    const ra = Re * 0.24;
    g.beginPath(); g.arc(l.cx, l.cy, ra, -0.2 * Math.PI, -0.95 * Math.PI, true); g.stroke();
    g.restore();
    const ea = -0.95 * Math.PI;
    D.arrow(g, l.cx + ra * Math.cos(ea + 0.35), l.cy + ra * Math.sin(ea + 0.35), l.cx + ra * Math.cos(ea), l.cy + ra * Math.sin(ea), D.alpha('#ffffff', 0.9), 1.5);

    // ---- 觀測點的緯度圈 ----
    const cl = Math.cos(state.lat * DEG), north = state.lat >= 0;
    g.save();
    g.setLineDash(north ? [] : [3, 4]);
    g.strokeStyle = D.alpha(C.probe, north ? 0.85 : 0.6);
    g.lineWidth = 1.2;
    if (Re * cl > 2) { g.beginPath(); g.arc(l.cx, l.cy, Re * cl, 0, TAU); g.stroke(); }
    g.restore();

    // ---- 月下點與對蹠點 ----
    const cd = Math.cos(state.dec * DEG);
    const subP = toS(l, Re * cd * mdx, Re * cd * mdy), antiP = toS(l, -Re * cd * mdx, -Re * cd * mdy);
    [[subP, state.dec >= 0], [antiP, state.dec <= 0]].forEach(function (q) {
      g.beginPath(); g.arc(q[0][0], q[0][1], 3.2, 0, TAU);
      if (q[1]) { g.fillStyle = C.dark ? '#ffffff' : C.text; g.fill(); }
      else { g.strokeStyle = C.dark ? '#ffffff' : C.text; g.lineWidth = 1.2; g.stroke(); }
    });
    const lr = Re * SEA + Math.max(0, etaEq(psi, psi)) * kpx + 12;
    const lab = function (dirx, diry, text) {
      const x = l.cx + dirx * lr, y = l.cy - diry * lr;
      D.haloText(g, text, x, y, C.dark ? '#ffffff' : C.text, Math.abs(dirx) < 0.35 ? 'center' : dirx > 0 ? 'left' : 'right', 'middle', '600 11.5px ' + FONT);
    };
    lab(-mdx, -mdy, T('對蹠點的隆起', 'Far-side bulge'));

    // ---- 引潮力箭頭（赤道上 24 點） ----
    if (state.showForce) {
      const ks = forceScale() * Re;
      for (let i = 0; i < 24; i++) {
        const a = i * 15, rh = [Math.cos(a * DEG), Math.sin(a * DEG), 0];
        let f = K.forceDir(P(), psi, rh, false);
        if (state.horiz) f = K.splitVR(f, rh).h;
        const r0 = Re * SEA + etaEq(a, psi) * kpx;
        const x0 = l.cx + r0 * rh[0], y0 = l.cy - r0 * rh[1];
        const L2 = Math.hypot(f[0], f[1]) * ks;
        if (L2 < 2.5) continue;
        D.arrow(g, x0, y0, x0 + f[0] * ks, y0 - f[1] * ks, C.pos, Math.max(1.6, Math.min(2.4, Re / 50)));
      }
    }

    // ---- 觀測點 ----
    const sa = K.siteAz(lt) * DEG;
    const sp = toS(l, Re * cl * Math.cos(sa), Re * cl * Math.sin(sa));
    l.site = sp;
    if (state.flash) {
      const u = (performance.now() - state.flash.start) / 900;
      if (u >= 0 && u <= 1) D.ripple(g, sp[0], sp[1], 8, u, C.probe);
    }
    if (north) D.ball(g, sp[0], sp[1], 5.5, C.probe, { glow: C.dark ? 0.4 : 0.15 });
    else {
      g.save(); g.setLineDash([2, 2]); g.strokeStyle = C.probe; g.lineWidth = 1.8;
      g.beginPath(); g.arc(sp[0], sp[1], 5.5, 0, TAU); g.stroke(); g.restore();
    }
    if (state.hover === 'site' || dragging === 'site') {
      g.strokeStyle = D.alpha(C.probe, 0.6); g.lineWidth = 2;
      g.beginPath(); g.arc(sp[0], sp[1], 10, 0, TAU); g.stroke();
    }
    {
      const ox = Math.cos(sa), oy = Math.sin(sa);
      const txt = T('觀測點 ', 'Site ') + cm(heightNow(), 0) + (north ? '' : T('（南半球，在背面）', ' (south, far side)'));
      const px = sp[0] + ox * 16, py = sp[1] - oy * 16;
      D.pill(g, txt, Math.max(4, Math.min(W - 4, px)), py + (oy > 0 ? -2 : 14), C.probe, ox > 0.3 ? 'left' : ox < -0.3 ? 'right' : 'center', '600 12px ' + FONT);
    }

    // ---- 月球 ----
    drawMoon(g, l);
    lab(mdx, mdy, T('月下點的隆起', 'Sub-lunar bulge'));

    // ---- 角落文字 ----
    D.pill(g, when(state.t) + T('（觀測點地方時）', ' (local time at the site)'), 10, 26, C.text, 'left', '600 12.5px ' + FONT);
    D.pill(g, T('月齡 ', 'Moon age ') + num(K.moonAge(psi), 1) + T(' 天・', ' d · ') + phaseName(psi), 10, 50, C.muted, 'left', '12px ' + FONT);
    // 比例尺
    if (state.showForce) {
      const ks = forceScale() * Re;
      let ref = 1e-6;
      while (ref * ks > 70) ref /= 2;
      while (ref * ks < 26) ref *= 2;
      const bx = 12, by = H - 34;
      D.arrow(g, bx, by, bx + ref * ks, by, C.pos, 2);
      const m = ref / Math.pow(10, Math.floor(Math.log10(ref))), e = Math.floor(Math.log10(ref));
      const base = num(m, m % 1 ? 1 : 0) + ' × 10';
      const w = D.supText(g, base, '−' + (-e), bx + ref * ks + 8, by + 4, C.pos, '600 12px ' + FONT);
      D.haloText(g, ' m/s²', bx + ref * ks + 8 + w, by + 4, C.pos, 'left', 'alphabetic', '600 12px ' + FONT);
    }
    const note = T('示意圖：隆起誇大 ' + bigText(E) + ' 倍、月球距離未依比例', 'Not to scale: bulges ×' + bigText(E) + ', Moon distance shrunk');
    D.haloText(g, note, W - 10, H - 12, C.muted, 'right', 'alphabetic', '11.5px ' + FONT);
    D.haloText(g, T('從北極上空往下看', 'Seen from above the North Pole'), W - 10, H - 28, C.muted, 'right', 'alphabetic', '11.5px ' + FONT);
    // 鍵盤焦點
    if (kb && kb.focused()) {
      const it = kb.index() === 0 ? [l.mx, l.my, l.Rm + 9] : [sp[0], sp[1], 13];
      g.save(); g.setLineDash([4, 3]); g.strokeStyle = C.accent; g.lineWidth = 2;
      g.beginPath(); g.arc(it[0], it[1], it[2], 0, TAU); g.stroke(); g.restore();
    }
  }
  /** 月球：亮面朝向太陽（右方），夜面加暗 */
  function drawMoon(g, l) {
    const x = l.mx, y = l.my, r = l.Rm;
    g.save();
    g.shadowColor = C.dark ? 'rgba(0,0,0,0.6)' : D.alpha(C.text, 0.3);
    g.shadowBlur = 8;
    const gr = g.createRadialGradient(x + r * 0.35, y - r * 0.25, r * 0.1, x, y, r);
    gr.addColorStop(0, D.shade(C['td-moon'], 0.65));
    gr.addColorStop(0.6, C['td-moon']);
    gr.addColorStop(1, D.shade(C['td-moon'], -0.3));
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.restore();
    // 坑洞（固定的示意花紋）
    g.save();
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
    [[-0.3, -0.25, 0.22], [0.25, 0.3, 0.16], [0.1, -0.45, 0.12], [-0.45, 0.35, 0.14], [0.45, -0.1, 0.1]].forEach(function (c) {
      g.fillStyle = D.alpha(D.shade(C['td-moon'], -0.35), 0.35);
      g.beginPath(); g.arc(x + c[0] * r, y + c[1] * r, c[2] * r, 0, TAU); g.fill();
    });
    const ng = g.createLinearGradient(x - r, 0, x + r * 0.1, 0);
    ng.addColorStop(0, 'rgba(5,8,14,0.78)');
    ng.addColorStop(0.88, 'rgba(5,8,14,0.6)');
    ng.addColorStop(1, 'rgba(5,8,14,0)');
    g.fillStyle = ng;
    g.fillRect(x - r, y - r, r * 1.1, 2 * r);
    g.restore();
    g.strokeStyle = D.alpha(C.dark ? '#ffffff' : C.text, 0.35);
    g.lineWidth = 1;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
    if (state.hover === 'moon' || dragging === 'moon') {
      g.strokeStyle = D.alpha(C.accent, 0.7); g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, r + 5, 0, TAU); g.stroke();
    }
    const below = y < l.cy ? -1 : 1;
    const ty = y + below * (r + 14);
    D.pill(g, T('月球', 'Moon') + T('・赤緯 ', ' · dec ') + signed(state.dec, 1) + '°', x, below > 0 ? ty + 8 : ty + 2, C.text, 'center', '600 11.5px ' + FONT);
  }

  // =====================================================================
  // 截面圖（包含地軸與月球的平面）：日潮不等
  // =====================================================================
  function drawSide() {
    if (!sideSize) return;
    const g = sctx, W = sideSize.w, H = sideSize.h;
    D.backdrop(g, W, H);
    const psi = psiNow();
    const Re = Math.min(W * 0.235, H * 0.27);
    const cx = Math.max(Re * 1.45 + 6, W * 0.43), cy = H * 0.5 + 4;
    const E = exaggeration(), kpx = E / K.R_EARTH * Re;
    const u = [Math.cos(psi * DEG), Math.sin(psi * DEG), 0];   // 截面的水平方向：月球的方向（投影到赤道面）
    const dirAt = function (b) { return [Math.cos(b) * u[0], Math.cos(b) * u[1], Math.sin(b)]; };
    const F = function (px, w) { return (w || '') + px + 'px ' + FONT; };
    // 赤道面
    g.save();
    g.setLineDash([4, 4]);
    g.strokeStyle = D.alpha(C.muted, 0.6);
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(6, cy); g.lineTo(W - 6, cy); g.stroke();
    g.restore();
    // 水殼
    const ring = [];
    for (let i = 0; i < 180; i++) {
      const b = i * TAU / 180, h = K.heightDir(P(), psi, dirAt(b)).total, r = Re * SEA + h * kpx;
      ring.push([cx + r * Math.cos(b), cy - r * Math.sin(b)]);
    }
    g.save();
    g.shadowColor = D.alpha(C['td-water'], C.dark ? 0.5 : 0.3);
    g.shadowBlur = 10;
    g.beginPath();
    ring.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
    g.closePath();
    const wg = g.createRadialGradient(cx, cy, Re * 0.98, cx, cy, Re * (SEA + 0.3));
    wg.addColorStop(0, C['td-deep']); wg.addColorStop(0.45, C['td-water']); wg.addColorStop(1, D.shade(C['td-water'], 0.45));
    g.fillStyle = wg; g.fill();
    g.restore();
    g.strokeStyle = D.alpha(D.shade(C['td-water'], 0.55), 0.9); g.lineWidth = 1.4; g.stroke();
    g.save(); g.setLineDash([2, 4]); g.strokeStyle = D.alpha(C.dark ? '#ffffff' : C.text, 0.35); g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, Re * SEA, 0, TAU); g.stroke(); g.restore();
    // 地球（剖面：岩石色）
    const eg = g.createRadialGradient(cx - Re * 0.3, cy - Re * 0.3, Re * 0.1, cx, cy, Re);
    eg.addColorStop(0, C.dark ? '#5f6d5a' : '#a7b59a');
    eg.addColorStop(1, C.dark ? '#36402f' : '#6f7d63');
    g.fillStyle = eg;
    g.beginPath(); g.arc(cx, cy, Re, 0, TAU); g.fill();
    g.strokeStyle = D.alpha(C.text, 0.3); g.lineWidth = 1; g.stroke();
    // 地軸
    const ax = Re * 1.5;
    g.strokeStyle = D.alpha(C.text, 0.7); g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(cx, cy - ax); g.lineTo(cx, cy + ax); g.stroke();
    D.haloText(g, T('北', 'N'), cx, cy - ax - 8, C.text, 'center', 'middle', F(12, '600 '));
    D.haloText(g, T('南', 'S'), cx, cy + ax + 9, C.text, 'center', 'middle', F(12, '600 '));
    // 月球方向與隆起軸（月球畫在右邊，距離未依比例）
    const d = state.dec * DEG, dx = Math.cos(d), dy = Math.sin(d);
    const mR = Math.max(6, Re * 0.17), mxp = W - 8 - mR, myp = cy - dy / dx * (mxp - cx);
    g.save(); g.setLineDash([6, 5]); g.strokeStyle = D.alpha(C.text, 0.5); g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(cx - dx * Re * 1.62, cy + dy * Re * 1.62); g.lineTo(mxp - dx * mR, myp + dy * mR); g.stroke(); g.restore();
    const mg = g.createRadialGradient(mxp - mR * 0.3, myp - mR * 0.3, mR * 0.1, mxp, myp, mR);
    mg.addColorStop(0, D.shade(C['td-moon'], 0.6)); mg.addColorStop(1, D.shade(C['td-moon'], -0.25));
    g.fillStyle = mg; g.beginPath(); g.arc(mxp, myp, mR, 0, TAU); g.fill();
    // 觀測點的緯度線：一天中先後經過兩端（月在上中天、月在下中天）
    const ph = state.lat * DEG, sy = cy - Re * Math.sin(ph), sxw = Re * Math.cos(ph);
    g.strokeStyle = D.alpha(C.probe, 0.85); g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(cx - sxw, sy); g.lineTo(cx + sxw, sy); g.stroke();
    const hA = K.heightDir(P(), psi, [Math.cos(ph) * u[0], Math.cos(ph) * u[1], Math.sin(ph)]).total;
    const hB = K.heightDir(P(), psi, [-Math.cos(ph) * u[0], -Math.cos(ph) * u[1], Math.sin(ph)]).total;
    const north = state.lat >= 0;
    const tick = function (sgn, h, name) {
      const rr = Re * SEA + h * kpx;
      // 沿緯度線延伸到海面
      const bx = cx + sgn * Math.sqrt(Math.max(0, rr * rr - (cy - sy) * (cy - sy)));
      g.strokeStyle = D.alpha(C.probe, 0.85); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(cx + sgn * sxw, sy); g.lineTo(bx, sy); g.stroke();
      g.fillStyle = C.probe; g.beginPath(); g.arc(bx, sy, 3, 0, TAU); g.fill();
      // 標籤放在線的外側（北半球在上方、南半球在下方），不超出畫布
      const font = F(11, '600 ');
      g.font = font;
      const txt = name + ' ' + cm(h, 0), tw = g.measureText(txt).width + 12;
      let x = sgn > 0 ? bx + 4 : bx - 4 - tw;
      x = Math.max(4, Math.min(W - 4 - tw, x));
      return D.pill(g, txt, x, north ? sy - 7 : sy + 23, C.probe, 'left', font);
    };
    const pills = [tick(1, hA, T('上中天', 'Upper')), tick(-1, hB, T('下中天', 'Lower'))];
    {
      const font = F(11.5, '600 '), txt = T('月球 ', 'Moon ') + signed(state.dec, 1) + '°';
      g.font = font;
      const tw = g.measureText(txt).width;
      const cand = dy >= 0 ? [myp - mR - 7, myp + mR + 14] : [myp + mR + 14, myp - mR - 7];
      const free = function (yb) {
        const r = { x: W - 6 - tw, y: yb - 12, w: tw, h: 15 };
        return !pills.some(function (q) { return q.x < r.x + r.w && r.x < q.x + q.w && q.y < r.y + r.h && r.y < q.y + q.h; });
      };
      const yb = free(cand[0]) ? cand[0] : free(cand[1]) ? cand[1] : cand[0];
      D.haloText(g, txt, W - 6, yb, C.text, 'right', 'alphabetic', font);
    }
    // 觀測點此刻的位置（投影到截面上，沿緯度線來回）；在截面前方實心、後方空心
    const Hm = K.moonHourAngle(ltNow(), psi) * DEG;
    const ox = cx + sxw * Math.cos(Hm);
    if (Math.sin(Hm) <= 0) D.ball(g, ox, sy, 4.5, C.probe, { glow: 0 });
    else { g.save(); g.setLineDash([2, 2]); g.strokeStyle = C.probe; g.lineWidth = 1.6; g.beginPath(); g.arc(ox, sy, 4.5, 0, TAU); g.stroke(); g.restore(); }
    const diff = Math.abs(hA - hB);
    D.pill(g, T('兩端差 ', 'Difference ') + cmAbs(diff, 1), 6, 22, diff > 0.005 ? C.text : C.muted, 'left', F(12, '600 '));
    D.haloText(g, T('緯度 ', 'Latitude ') + signed(state.lat, 1) + '°', 6, H - 8, C.probe, 'left', 'alphabetic', F(11.5, '600 '));
    D.haloText(g, T('赤道面', 'Equator'), 6, cy + 13, C.muted, 'left', 'alphabetic', F(11));
  }

  // =====================================================================
  // 潮位曲線
  // =====================================================================
  let tideMap = null;
  function drawTide() {
    if (!tideSize) return;
    const g = tctx, W = tideSize.w, H = tideSize.h;
    D.backdrop(g, W, H);
    const span = state.win * 24;
    const pad = { l: 46, r: 10, t: 26, b: 30 };
    const pw = W - pad.l - pad.r, phh = H - pad.t - pad.b;
    const anchor = curveAnchor || state.t;
    const t0 = Math.max(0, anchor - span * 0.62), t1 = t0 + span;
    const p = P(), lat = state.lat, psi0 = state.psi0;
    const n = Math.min(900, Math.max(200, Math.round(pw * 1.2)));
    const fc = [];
    let ymax = 0.05;
    for (let i = 0; i <= n; i++) { const t = t0 + span * i / n, h = K.heightT(p, lat, psi0, t); fc.push(h); ymax = Math.max(ymax, Math.abs(h)); }
    state.segs.forEach(function (s) { s.pts.forEach(function (q) { if (q[0] >= t0 && q[0] <= t1) ymax = Math.max(ymax, Math.abs(q[1])); }); });
    const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5];
    let step = steps[steps.length - 1];
    for (let i = 0; i < steps.length; i++) if (ymax * 1.1 / steps[i] <= 4) { step = steps[i]; break; }
    const Y = Math.max(step, Math.ceil(ymax * 1.1 / step) * step);
    const X = function (t) { return pad.l + (t - t0) / span * pw; };
    const Yp = function (h) { return pad.t + phh / 2 - h / Y * phh / 2; };
    tideMap = { t0: t0, span: span, l: pad.l, pw: pw };
    // 大潮、小潮（朔望、上下弦）
    K.phaseEvents(psi0, t0 - 24, t1 + 24).forEach(function (e) {
      const x = X(e.t), wd = Math.max(6, 24 / span * pw);
      g.fillStyle = D.alpha(e.spring ? C['td-spring'] : C['td-neap'], C.dark ? 0.16 : 0.13);
      g.fillRect(Math.max(pad.l, x - wd / 2), pad.t, Math.min(pad.l + pw, x + wd / 2) - Math.max(pad.l, x - wd / 2), phh);
      if (x >= pad.l && x <= pad.l + pw) {
        const nm = { new: T('新月', 'new'), fq: T('上弦', '1st Q'), full: T('滿月', 'full'), lq: T('下弦', 'last Q') }[e.kind];
        D.pill(g, (e.spring ? T('大潮・', 'Spring · ') : T('小潮・', 'Neap · ')) + nm, Math.min(pad.l + pw - 2, Math.max(pad.l + 2, x)), pad.t - 2,
          e.spring ? C['td-spring'] : C['td-neap'], x < pad.l + 50 ? 'left' : x > pad.l + pw - 50 ? 'right' : 'center', '600 11px ' + FONT);
      }
    });
    // 格線
    g.lineWidth = 1;
    for (let v = -Y; v <= Y + 1e-9; v += step) {
      const y = Math.round(Yp(v)) + 0.5;
      g.strokeStyle = D.alpha(C.text, Math.abs(v) < 1e-9 ? 0.32 : 0.08);
      g.beginPath(); g.moveTo(pad.l, y); g.lineTo(pad.l + pw, y); g.stroke();
      D.haloText(g, signed(v * 100, step < 0.02 ? 1 : 0), pad.l - 6, y, C.muted, 'right', 'middle', '11px ' + FONT);
    }
    D.haloText(g, 'cm', pad.l - 6, pad.t - 12, C.muted, 'right', 'middle', '11px ' + FONT);
    D.haloText(g, T('平均海面', 'mean sea level'), pad.l + 4, Yp(0) - 7, C.muted, 'left', 'middle', '10.5px ' + FONT);
    // 時間刻度：間隔依每小時幾個像素決定，標籤不重疊、不超出畫布
    const pxH = pw / span;
    const TICKS = [3, 6, 12, 24, 48, 72, 120, 168, 240];
    let tickH = TICKS[TICKS.length - 1];
    for (let i = 0; i < TICKS.length; i++) if (TICKS[i] * pxH >= (TICKS[i] < 24 ? 40 : 50)) { tickH = TICKS[i]; break; }
    if (tickH < 24 && 24 * pxH < 50) tickH = 24;
    // 格線：每天一條（比較淡），刻度上的比較明顯
    if (tickH >= 24 && 24 * pxH >= 6) {
      g.strokeStyle = D.alpha(C.text, 0.05);
      for (let tt = Math.ceil(t0 / 24) * 24; tt <= t1; tt += 24) { const x = Math.round(X(tt)) + 0.5; g.beginPath(); g.moveTo(x, pad.t); g.lineTo(x, pad.t + phh); g.stroke(); }
    }
    let lastR = -1e9;
    for (let tt = Math.ceil(t0 / tickH - 1e-9) * tickH; tt <= t1 + 1e-9; tt += tickH) {
      const x = Math.round(X(tt)) + 0.5, isDay = Math.abs(tt / 24 - Math.round(tt / 24)) < 1e-9;
      g.strokeStyle = D.alpha(C.text, isDay ? 0.14 : 0.07);
      g.beginPath(); g.moveTo(x, pad.t); g.lineTo(x, pad.t + phh); g.stroke();
      const txt = isDay ? T('第 ' + Math.round(tt / 24) + ' 天', 'Day ' + Math.round(tt / 24)) : clock(tt);
      const font = (isDay ? '600 ' : '') + '11px ' + FONT;
      g.font = font;
      const tw = g.measureText(txt).width;
      if (x - tw / 2 < 4 || x + tw / 2 > W - 3 || x - tw / 2 < lastR + 6) continue;
      lastR = x + tw / 2;
      D.haloText(g, txt, x, H - pad.b + 14, isDay ? C.text : C.muted, 'center', 'middle', font);
    }
    // 預報（虛線）
    g.save();
    g.setLineDash([5, 4]);
    g.strokeStyle = D.alpha(C.muted, 0.9);
    g.lineWidth = 1.3;
    g.beginPath();
    fc.forEach(function (h, i) { const x = pad.l + pw * i / n, y = Yp(h); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
    g.restore();
    // 紀錄（實線）
    g.save();
    g.beginPath(); g.rect(pad.l, pad.t - 4, pw, phh + 8); g.clip();
    g.strokeStyle = C['b-ocean'];
    g.lineWidth = 2.4;
    g.lineJoin = 'round'; g.lineCap = 'round';
    state.segs.forEach(function (s) {
      let started = false;
      g.beginPath();
      for (let i = 0; i < s.pts.length; i++) {
        const q = s.pts[i];
        if (q[0] < t0 - 1 || q[0] > t1 + 1) { started = false; continue; }
        const x = X(q[0]), y = Yp(q[1]);
        if (started) g.lineTo(x, y); else { g.moveTo(x, y); started = true; }
      }
      g.stroke();
    });
    // 高潮標記
    const showTime = span <= 72;
    let lastX = -1e9;
    state.marks.forEach(function (m) {
      if (m.t < t0 || m.t > t1) return;
      const x = X(m.t), y = Yp(m.h);
      g.fillStyle = C['b-ocean'];
      g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x - 4.5, y - 11); g.lineTo(x + 4.5, y - 11); g.closePath(); g.fill();
      if (showTime && x - lastX > 44) { D.haloText(g, clock(m.t), x, y - 18, C['b-ocean'], 'center', 'middle', '600 10.5px ' + FONT); lastX = x; }
    });
    g.restore();
    // 現在
    const xn = X(state.t), hn = heightNow();
    if (xn >= pad.l && xn <= pad.l + pw) {
      g.strokeStyle = D.alpha(C.accent, 0.8); g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(xn + 0.5, pad.t); g.lineTo(xn + 0.5, pad.t + phh); g.stroke();
      D.ball(g, xn, Yp(hn), 4.5, C.probe, { glow: 0 });
      D.pill(g, cm(hn, 1), xn + (xn > pad.l + pw - 70 ? -8 : 8), Math.max(pad.t + 16, Math.min(pad.t + phh - 2, Yp(hn) - 8)), C.probe, xn > pad.l + pw - 70 ? 'right' : 'left', '600 11.5px ' + FONT);
    }
  }
  let curveAnchor = null;   // 拖曳曲線時固定時間軸

  // =====================================================================
  // 讀數
  // =====================================================================
  let lastRead = 0;
  const cache = { key: '', next: null };
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(id, txt) { const o = $(id); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function updateReadouts(force) {
    const now = performance.now();
    if (!force && now - lastRead < 140) return;
    lastRead = now;
    const p = P(), psi = psiNow(), t = state.t;
    const am = K.subPointAccel(K.M_MOON, K.moonDist(p)), as = K.subPointAccel(K.M_SUN, K.AU);
    const rel = 1 / Math.pow(state.dist, 3);
    setHTML('rAm', sci(am, 2) + ' m/s²<small>' + T('地表重力的 ', '') + sci(am / K.G_SURF, 2) + T('', ' of gravity') +
      (Math.abs(state.dist - 1) > 1e-9 ? T('；真實值的 ', '; ') + num(rel, 3) + T(' 倍', ' × the real value') : '') + '</small>');
    setHTML('rAs', sci(as, 2) + ' m/s²' + (state.sun ? '' : '<small>' + T('（目前沒有加入）', '(not included now)') + '</small>'));
    setHTML('rRatio', num(as / am, 3) + (Math.abs(state.dist - 1) > 1e-9 ? '<small>' + T('真實距離時 ', 'at the real distance ') + num(K.sunMoonRatio(), 3) + '</small>' : ''));
    setHTML('rHeq', T('月 ', 'Moon ') + num(K.moonH(p) * 100, 1) + ' cm' + T('、日 ', ', Sun ') + num(K.H_SUN * 100, 1) + ' cm');
    setHTML('rTime', when(t));
    setHTML('rAge', num(K.moonAge(psi), 1) + T(' 天（', ' d (') + phaseName(psi) + T('）', ')'));
    const h = heightNow(), dh = K.dHeightDt(p, state.lat, state.psi0, t);
    setHTML('rH', cm(h, 1) + '<small>' + (Math.abs(dh) < 1e-7 ? T('海面不動', 'not moving') : dh > 0 ? T('漲潮中', 'rising') : T('退潮中', 'falling')) + '</small>');
    const key = [state.ver, state.dec, state.dist, state.lat, state.sun, state.psi0.toFixed(9), Math.floor(t * 20)].join('|');
    if (cache.key !== key) {
      cache.key = key;
      cache.ex = K.extrema(p, state.lat, state.psi0, t + 1e-6, t + 2 * K.LUNAR_DAY + 0.5);
      cache.day = K.dayRange(p, state.lat, state.psi0, t);
      cache.transit = K.nextTransit(state.psi0, t);
      cache.eq = K.equatorRange(p, psi);
    }
    const ex = cache.ex;
    const nh = ex.highs[0], nl = ex.lows[0];
    setHTML('rNextHigh', nh ? when(nh.t) + '<small>' + cm(nh.h, 1) + '</small>' : T('沒有（海面不動）', 'none (sea not moving)'));
    setHTML('rNextLow', nl ? when(nl.t) + '<small>' + cm(nl.h, 1) + '</small>' : T('沒有（海面不動）', 'none (sea not moving)'));
    setHTML('rRange', cmAbs(cache.day.range, 1));
    setHTML('rTransit', when(cache.transit) + '<small>' + T('每天晚約 ', 'about ') + num((K.LUNAR_DAY - 24) * 60, 0) + T(' 分鐘', ' min later each day') + '</small>');
    if (ex.highs.length >= 2) {
      const a = ex.highs[0], b = ex.highs[1], gap = b.t - a.t;
      setHTML('rIneq', T('間隔 ', 'Interval ') + dur(gap) + T('，高度差 ', ', height difference ') + cmAbs(Math.abs(b.h - a.h), 1) +
        (gap > 18 ? T('（一天只有一次高潮：全日潮）', ' (only one high tide a day: diurnal)') : ''));
    } else setHTML('rIneq', T('沒有高潮（海面不動）', 'no high tides (the sea does not move)'));
    setHTML('rEq', cmAbs(cache.eq, 1) + (cache.eq < 0.01 && state.sun ? T('：月球與太陽的半日潮互相抵消', ': the Moon’s and the Sun’s semidiurnal tides cancel') : ''));
  }
  function refreshOutputs() {
    setOut('psio', num(K.norm360(psiNow()), 1) + '°');
    setOut('deco', signed(state.dec, 1) + '°');
    setOut('disto', num(state.dist, 3) + T(' 倍', '×'));
    setOut('lato', signed(state.lat, 1) + '°');
    setOut('hro', clock(ltNow()));
    setOut('rateo', num(state.rate, 2) + T(' 時／秒', ' h/s'));
  }

  // =====================================================================
  // 時間前進、高潮偵測、紀錄
  // =====================================================================
  function moonAltAt(t) {
    const rh = K.siteDir(state.lat, K.ltAt(t)), mh = K.moonDir(K.psiAt(state.psi0, t), state.dec);
    return Math.asin(Math.max(-1, Math.min(1, K.dot(rh, mh)))) / DEG;
  }
  function recordPoint(t, h) {
    newSegIfNone();
    const s = state.segs[state.segs.length - 1];
    const q = s.pts[s.pts.length - 1];
    if (!q || t - q[0] >= 0.04 || t < q[0]) s.pts.push([t, h]);
    let total = 0;
    state.segs.forEach(function (x) { total += x.pts.length; });
    if (total > 40000) { // 太多就丟掉最舊的
      const s0 = state.segs[0];
      s0.pts.splice(0, Math.min(s0.pts.length, total - 40000));
      if (!s0.pts.length && state.segs.length > 1) state.segs.shift();
    }
  }
  function newSegIfNone() { if (!state.segs.length) state.segs.push({ pts: [] }); }
  /** 由 state.t 前進到 t1：記錄潮位、找出經過的高潮（音效、標記、任務事件） */
  function advanceTo(t1, opts) {
    opts = opts || {};
    const t0 = state.t;
    if (!(t1 > t0)) { state.t = t1; return; }
    const p = P();
    const ex = K.extrema(p, state.lat, state.psi0, t0, t1, 0.2);
    // 紀錄：每 0.05 h 一點（播放時每幀一點）
    const n = Math.max(1, Math.ceil((t1 - t0) / 0.05));
    for (let i = 1; i <= n; i++) { const t = t0 + (t1 - t0) * i / n; recordPoint(t, K.heightT(p, state.lat, state.psi0, t)); }
    state.t = t1;
    const many = ex.highs.length > 2;
    ex.highs.forEach(function (e, i) { onHigh(e, !many || i === ex.highs.length - 1); });
    if (state.marks.length > 600) state.marks.splice(0, state.marks.length - 600);
  }
  function onHigh(e, loud) {
    state.marks.push({ t: e.t, h: e.h });
    const alt = moonAltAt(e.t);
    const prev = state.lastHigh;
    const data = {
      t: e.t, h: e.h, moonAlt: alt, dec: state.dec, lat: state.lat, sun: state.sun, dist: state.dist, psi: K.norm360(K.psiAt(state.psi0, e.t)),
      gap: prev ? e.t - prev.t : null, dh: prev ? e.h - prev.h : null, prevH: prev ? prev.h : null, prevMoonAlt: prev ? prev.moonAlt : null
    };
    state.lastHigh = { t: e.t, h: e.h, moonAlt: alt };
    if (loud) {
      state.flash = { start: performance.now() };
      const S = sound();
      if (S) {
        // 高潮越高，音越高（大潮時明顯比小潮高）
        const f = Math.max(262, Math.min(1046, 392 * Math.pow(2, e.h / 0.45)));
        S.tone({ freq: f, dur: 0.22, type: 'sine', gain: 0.22 });
        S.tone({ freq: f * 1.5, dur: 0.16, type: 'sine', gain: 0.07, delay: 0.06 });
      }
    }
    emit('high', data);
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function missionData() {
    const p = P(), psi = psiNow();
    const day = K.dayRange(p, state.lat, state.psi0, state.t);
    return {
      psi: K.norm360(psi), dec: state.dec, dist: state.dist, lat: state.lat, sun: state.sun, t: state.t, lt: ltNow(),
      h: heightNow(), range: day.range, hi: day.hi, lo: day.lo, eqRange: K.equatorRange(p, psi),
      highsPerDay: K.highsPerLunarDay(p, state.lat, state.psi0, state.t), ratioM: 1 / Math.pow(state.dist, 3),
      view: view3 && view3.active ? '3d' : '2d'
    };
  }
  function emitState() { if (state.acted) emit('state', missionData()); }
  function acted() { state.acted = true; }

  // =====================================================================
  // 音效、狀態列
  // =====================================================================
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function setStatus(s) { $('status').textContent = s; }
  function updatePlay() { $('play').textContent = state.running ? T('暫停', 'Pause') : T('播放', 'Play'); }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  const elPsi = $('psi'), elDec = $('dec'), elDist = $('dist'), elLat = $('lat'), elHr = $('hr'), elRate = $('rate');
  let sliderHeld = null;
  function setSlider(el, v) {
    if (document.activeElement === el && sliderHeld === el) return;
    if (window.LabNum) window.LabNum.clear(el);
    el.value = String(v);
  }
  function syncSliders() {
    setSlider(elPsi, K.norm360(psiNow()));
    setSlider(elHr, Math.min(23.99, ltNow()));
    refreshOutputs();
  }
  [elPsi, elDec, elDist, elLat, elHr, elRate].forEach(function (el) {
    el.addEventListener('pointerdown', function () { sliderHeld = el; });
    el.addEventListener('pointerup', function () { sliderHeld = null; });
    el.addEventListener('change', function () { sliderHeld = null; emitState(); });
  });
  function setPsi(v) { state.psi0 = v - K.PSI_RATE * state.t; paramsChanged(); }
  elPsi.addEventListener('input', function () { acted(); setPsi(val(elPsi)); refreshOutputs(); requestDraw(); });
  elDec.addEventListener('input', function () { acted(); state.dec = val(elDec); paramsChanged(); refreshOutputs(); requestDraw(); });
  elDist.addEventListener('input', function () { acted(); state.dist = Math.max(0.5, Math.min(2, val(elDist))); paramsChanged(); refreshOutputs(); requestDraw(); });
  elLat.addEventListener('input', function () { acted(); state.lat = val(elLat); paramsChanged(); refreshOutputs(); requestDraw(); });
  elHr.addEventListener('input', function () {
    acted();
    const d = dayOf(state.t);
    setTime(d * 24 + Math.max(0, Math.min(23.99, val(elHr))));
    refreshOutputs(); requestDraw();
  });
  elRate.addEventListener('input', function () { acted(); state.rate = val(elRate); refreshOutputs(); });
  /** 直接設定時間（不記錄經過的潮位；往前走時與跳躍相同） */
  function setTime(t) {
    if (t > state.t && t - state.t < 24 * 40) { advanceTo(t); }
    else { state.t = t; state.lastHigh = null; newSeg(); }
    syncSliders();
  }
  $('sunOn').addEventListener('change', function () { acted(); state.sun = this.checked; paramsChanged(); refreshOutputs(); requestDraw(); emitState(); });
  $('showForce').addEventListener('change', function () { state.showForce = this.checked; requestDraw(); });
  $('showParts').addEventListener('change', function () { state.showParts = this.checked; requestDraw(); });
  function setHoriz(h) {
    state.horiz = h;
    $('fFull').setAttribute('aria-pressed', String(!h));
    $('fHoriz').setAttribute('aria-pressed', String(h));
    requestDraw();
  }
  $('fFull').addEventListener('click', function () { setHoriz(false); });
  $('fHoriz').addEventListener('click', function () { acted(); setHoriz(true); emit('arrows', { horiz: true }); });
  document.querySelectorAll('.segw button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.win = +b.getAttribute('data-win');
      document.querySelectorAll('.segw button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      requestDraw();
    });
  });
  $('play').addEventListener('click', function () {
    acted();
    state.running = !state.running;
    updatePlay();
    if (!state.running) emitState();
    schedule();
  });
  $('clear').addEventListener('click', function () {
    state.segs = []; state.marks = []; state.lastHigh = null; state.flash = null;
    setStatus(T('已清除潮位紀錄；滑桿設定不變。', 'The tide record is cleared; the sliders are kept.'));
    requestDraw();
  });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });
  // 跳躍
  function jump(t1, msg) {
    acted();
    advanceTo(t1);
    syncSliders();
    if (msg) setStatus(msg);
    requestDraw();
    updateReadouts(true);
    emitState();
  }
  $('stepH').addEventListener('click', function () { jump(state.t + 1); });
  $('stepD').addEventListener('click', function () { jump(state.t + 24, T('前進 24 小時：月球上中天晚了約 50 分鐘。', 'Forward 24 hours: the Moon crosses the meridian about 50 minutes later.')); });
  $('stepLD').addEventListener('click', function () { jump(state.t + K.LUNAR_DAY, T('前進一個太陰日（24 小時 50 分）：月球回到同一條子午線上。', 'Forward one lunar day (24 h 50 min): the Moon is back on the same meridian.')); });
  $('nextHigh').addEventListener('click', function () {
    const e = K.nextHigh(P(), state.lat, state.psi0, state.t);
    if (!e) { setStatus(T('這裡的海面一整天都不動，沒有高潮。', 'The sea does not move here: there are no high tides.')); acted(); emitState(); return; }
    jump(e.t + 1e-7, T('高潮：', 'High tide: ') + when(e.t) + T('，潮位 ', ', ') + cm(e.h, 1) + '.');
  });
  function nextPhase(spring) {
    const ev = K.phaseEvents(state.psi0, state.t + 1e-6, state.t + 24 * 30).filter(function (e) { return e.spring === spring; })[0];
    if (!ev) return;
    const nm = { new: T('新月', 'new moon'), fq: T('上弦', 'first quarter'), full: T('滿月', 'full moon'), lq: T('下弦', 'last quarter') }[ev.kind];
    jump(ev.t, (spring ? T('大潮：', 'Spring tide: ') : T('小潮：', 'Neap tide: ')) + nm + T('，今日潮差 ', '; range today ') +
      cmAbs(K.dayRange(P(), state.lat, state.psi0, ev.t).range, 1) + T('。', '.'));
  }
  $('nextSpring').addEventListener('click', function () { nextPhase(true); });
  $('nextNeap').addEventListener('click', function () { nextPhase(false); });

  // ---------- 拖曳（俯視圖）：月球、觀測點 ----------
  let dragging = null;
  function evPos(c, ev) { const r = c.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function hit(p) {
    if (!L) return null;
    if (Math.hypot(p[0] - L.mx, p[1] - L.my) <= L.Rm + 14) return 'moon';
    if (L.site && Math.hypot(p[0] - L.site[0], p[1] - L.site[1]) <= 18) return 'site';
    return null;
  }
  function angleOf(p) { return Math.atan2(-(p[1] - L.cy), p[0] - L.cx) / DEG; }
  cv.addEventListener('pointerdown', function (ev) {
    if (view3 && view3.active) return;
    const p = evPos(cv, ev), h = hit(p);
    if (!h) return;
    dragging = h;
    cv.setPointerCapture(ev.pointerId);
    cv.style.cursor = 'grabbing';
    acted();
    ev.preventDefault();
    requestDraw();
  });
  cv.addEventListener('pointermove', function (ev) {
    const p = evPos(cv, ev);
    if (!dragging) {
      const h = hit(p);
      if (h !== state.hover) { state.hover = h; cv.style.cursor = h ? 'grab' : 'default'; requestDraw(); }
      return;
    }
    const a = angleOf(p);
    if (dragging === 'moon') {
      const cur = K.norm360(psiNow());
      setPsi(K.norm360(cur + K.wrap180(a - cur)));
    } else {
      // 觀測點：方位角 = (地方時 − 12)·15°，沿最近的方向轉
      const cur = K.siteAz(ltNow());
      const dt = K.wrap180(a - cur) / 15;
      if (Math.abs(dt) > 1e-6) { if (dt > 0) advanceTo(state.t + dt); else { state.t += dt; state.lastHigh = null; newSeg(); } }
    }
    syncSliders();
    requestDraw();
  });
  function endDrag() {
    if (!dragging) return;
    dragging = null;
    cv.style.cursor = state.hover ? 'grab' : 'default';
    requestDraw();
    emitState();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('lostpointercapture', endDrag);
  // 觸控：按住月球或觀測點時不要捲動頁面
  cv.addEventListener('touchstart', function (ev) {
    const t = ev.touches[0]; if (!t) return;
    if (hit(evPos(cv, t))) ev.preventDefault();
  }, { passive: false });
  // 鍵盤
  const kb = window.LabKeys ? window.LabKeys.attach(cv, {
    label: T('潮汐俯視圖。按 Enter 切換月球或觀測點，左右方向鍵移動，Shift 加方向鍵移動得更多。', 'Tides top view. Press Enter to pick the Moon or the site, left and right arrows to move it, Shift for bigger steps.'),
    items: [
      { name: function () { return T('月球', 'Moon'); },
        move: function (dx, dy, big) { const d = dx || -dy; if (!d) return false; acted(); setPsi(K.norm360(psiNow() + d * (big ? 10 : 1))); syncSliders(); return true; },
        describe: function () { return T('月球與太陽的夾角 ', 'Moon at ') + num(K.norm360(psiNow()), 0) + T('°，', '° from the Sun, ') + phaseName(psiNow()); } },
      { name: function () { return T('觀測點', 'Observing site'); },
        move: function (dx, dy, big) { const d = dx || -dy; if (!d) return false; acted(); setTime(state.t + d * (big ? 1 : 0.25)); return true; },
        describe: function () { return T('觀測點 ', 'Site at ') + clock(ltNow()) + T('，潮位 ', ', sea level ') + cm(heightNow(), 1); } }
    ],
    onChange: function () { requestDraw(); }
  }) : null;
  cv.addEventListener('lab:keymove', function () { emitState(); });

  // ---------- 潮位曲線：點一下或拖曳跳到該時刻 ----------
  let curveDrag = false;
  function curveTime(ev) {
    if (!tideMap) return null;
    const x = evPos(tcv, ev)[0];
    return tideMap.t0 + Math.max(0, Math.min(1, (x - tideMap.l) / tideMap.pw)) * tideMap.span;
  }
  tcv.addEventListener('pointerdown', function (ev) {
    const t = curveTime(ev); if (t == null) return;
    curveDrag = true; curveAnchor = Math.max(tideMap.span * 0.62, tideMap.t0 + tideMap.span * 0.62);
    tcv.setPointerCapture(ev.pointerId);
    acted();
    setTime(t); requestDraw();
    ev.preventDefault();
  });
  tcv.addEventListener('pointermove', function (ev) {
    if (!curveDrag) return;
    const t = curveTime(ev); if (t == null) return;
    setTime(t); requestDraw();
  });
  function endCurve() { if (!curveDrag) return; curveDrag = false; curveAnchor = null; requestDraw(); emitState(); }
  tcv.addEventListener('pointerup', endCurve);
  tcv.addEventListener('pointercancel', endCurve);
  tcv.addEventListener('lostpointercapture', endCurve);

  // =====================================================================
  // 繪圖迴圈
  // =====================================================================
  let raf = 0, lastFrame = 0;
  function requestDraw() { schedule(); }
  function schedule() { if (!raf) raf = requestAnimationFrame(loop); }
  function loop(now) {
    raf = 0;
    const dt = lastFrame ? Math.min(1 / 30, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    let moved = false;
    if (state.running && !document.hidden && !dragging && !curveDrag && dt > 0 && state.rate > 0) {
      advanceTo(state.t + state.rate * dt);
      moved = true;
    }
    if (moved) syncSliders();
    drawAll();
    updateReadouts(!moved);
    const flashing = state.flash && performance.now() - state.flash.start < 950;
    if (state.running || flashing || (view3 && view3.active && view3.busy())) raf = requestAnimationFrame(loop);
    else lastFrame = 0;
  }
  function drawAll() {
    const is3 = !!(view3 && view3.active);
    if (is3) view3.frame(); else drawTop();
    drawSide();
    drawTide();
  }

  // =====================================================================
  // 3D 檢視：切換到 3D 時才載入 js/tides-3d.js 與 three.js（以 import() 動態載入）；切回 2D 時整個釋放。
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    K: K, T: T, D: D, state: state, P: P, psiNow: psiNow, ltNow: ltNow, heightNow: heightNow,
    colors: function () { return C; }, reducedMotion: reducedMotion,
    num: num, signed: signed, cm: cm, when: when, phaseName: phaseName, bigText: bigText,
    exaggeration: exaggeration, forceScale: forceScale, orbitFrac: orbitFrac, SEA: SEA,
    earthUrl: new URL('img/tides/earth-2048.webp', document.baseURI).href,
    moonUrl: new URL('img/moon/lroc-color-1024.jpg', document.baseURI).href,
    request: function () { schedule(); },
    onCam: function (kind) { acted(); emit('cam', { preset: kind, dec: state.dec }); },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Tides3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Tides3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/tides-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Tides3D) throw new Error('tides-3d.js did not load');
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
    $('resetCam').hidden = !is3;
    $('camBar').hidden = !is3;
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
        view3 = window.Tides3D.create(lib, host3, bridge);
        stage.classList.add('is3d');
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
      stage.classList.remove('is3d');
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      updateViewNotes();
      resizeTop();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    updateViewNotes();
    resizeTop();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  ['Side', 'Top', 'Moon'].forEach(function (k) {
    $('cam' + k).addEventListener('click', function () { if (view3) { view3.camTo(k.toLowerCase()); bridge.onCam(k.toLowerCase()); } });
  });

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  syncSliders();
  refreshOutputs();
  updatePlay();
  updateSoundButton();
  function themeChanged() {
    readColors();
    starLayer = null; diskKey = '';
    if (view3 && view3.active) view3.onTheme();
    refreshOutputs();
    updateReadouts(true);
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    const watch = function (el, fn) { let lw = 0; new ResizeObserver(function () { if (el.clientWidth !== lw) { lw = el.clientWidth; fn(); } }).observe(el); };
    watch(cv, resizeTop); watch(scv, resizeSide); watch(tcv, resizeTide);
  } else window.addEventListener('resize', function () { resizeTop(); resizeSide(); resizeTide(); });
  resizeTop(); resizeSide(); resizeTide();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastFrame = 0; schedule(); } });
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：按「播放」讓時間前進。', 'Reduced motion is on: press “Play” to move time forward.'));
  updateReadouts(true);
  requestDraw();
  // 測試用（Playwright）：讀取狀態
  window.__tides = { state: state, K: K, P: P, missionData: missionData, psiNow: psiNow, heightNow: heightNow,
    setTime: function (t) { setTime(t); requestDraw(); } };
})();
