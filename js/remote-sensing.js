/* remote-sensing.js — 「遙測：假色影像與植生指標 NDVI」的畫面與互動
 * 光譜、波段、場景、指數全部在 remote-sensing-core.js（RemoteCore）；這裡只負責操作、繪圖與讀數。 */
(function () {
  'use strict';
  const K = window.RemoteCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FONT = D.FONT;
  const NX = K.NX, NY = K.NY, N = NX * NY;
  const CLS_NAME = { water: ['河', 'river'], pond: ['池塘', 'pond'], forest: ['森林', 'forest'], town: ['城鎮', 'town'], park: ['公園', 'park'], paddy: ['稻田', 'rice paddy'], fallow: ['休耕地', 'fallow field'], sand: ['沙洲', 'sand bar'] };
  const STAGE_NAME = { flood: ['灌水準備插秧', 'flooded for planting'], young: ['剛插秧', 'just planted'], grow: ['生長中', 'growing'], ripe: ['成熟轉黃', 'ripening'], fallow: ['休耕', 'fallow'] };
  const COMP_NAME = { natural: ['真實色彩', 'natural colour'], cir: ['標準假色', 'colour infrared'], agri: ['農業組合', 'agriculture'], swir: ['短波紅外組合', 'SWIR'], custom: ['自訂組合', 'custom'] };
  const cn = function (c) { return T(CLS_NAME[c][0], CLS_NAME[c][1]); };

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = { day: $('rDay'), drought: $('rDrought'), turb: $('rTurb'), haze: $('rHaze') };
  const LIM = { day: [1, 365], drought: [0, 1], turb: [0, 1], haze: [0, 0.15] };
  const clamp = function (v, a) { return Math.max(a[0], Math.min(a[1], v)); };
  const state = { view: 'image', layer: 'rgb', comp: 'natural', rgb: [4, 3, 2], day: 70, drought: 0, turb: 0.3, haze: 0, probe: -1, playing: false, acted: false };
  let S = null, S0 = null, SC = null, PX = null, syncing = false;
  const opts = function () { return { day: state.day, drought: state.drought, turb: state.turb, haze: state.haze }; };
  function recompute() {
    S = K.scene(opts());
    S0 = state.drought > 0 ? K.scene({ day: state.day, drought: 0, turb: state.turb, haze: state.haze }) : S;
    // 影像的亮度範圍用「沒有霧霾」的同一張影像決定：霧霾讓整張圖變亮、變灰，才看得出來
    SC = state.haze > 0 ? K.scene({ day: state.day, drought: state.drought, turb: state.turb, haze: 0 }) : S;
    PX = state.probe >= 0 ? K.pixel(state.probe, opts()) : null;
    imgKey = '';
  }

  // ---------- 顏色與格式 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--rs-veg', '--rs-soil', '--rs-water', '--rs-urban', '--rs-sand', '--rs-probe', '--rs-band', '--text', '--muted', '--border', '--surface', '--bg', '--accent']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    imgKey = '';
  }
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    const s = v.toFixed(d == null ? 0 : d);
    return (/^-0(\.0*)?$/.test(s) ? s.slice(1) : s).replace(/^-/, '−');
  }
  function setText(id, s) { const e = $(id); if (e && e.textContent !== s) e.textContent = s; }
  function setHTML(id, s) { const e = $(id); if (e && e.innerHTML !== s) e.innerHTML = s; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function setStatus(s) { $('status').innerHTML = s; }
  function fsz() { return (window.LabSettings && window.LabSettings.get && +window.LabSettings.get('fs')) || 1; }
  const font = function (px, w) { return (w ? w + ' ' : '') + Math.round(px * Math.min(fsz(), 1.35)) + 'px ' + FONT; };
  const MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function dateOf(day) {
    let d = Math.round(day), m = 0;
    while (m < 11 && d > MD[m]) { d -= MD[m]; m++; }
    return T((m + 1) + ' 月 ' + d + ' 日', ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m] + ' ' + d);
  }
  function ramp(stops, t) {
    if (t <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const a = stops[i - 1], b = stops[i], u = (t - a[0]) / (b[0] - a[0]);
        return [a[1][0] + (b[1][0] - a[1][0]) * u, a[1][1] + (b[1][1] - a[1][1]) * u, a[1][2] + (b[1][2] - a[1][2]) * u];
      }
    }
    return stops[stops.length - 1][1];
  }
  const NDVI_RAMP = [[-0.6, [38, 84, 160]], [-0.1, [150, 170, 190]], [0.05, [196, 170, 120]], [0.25, [226, 214, 120]], [0.5, [128, 186, 72]], [0.8, [22, 110, 40]], [1, [8, 70, 26]]];
  const NDWI_RAMP = [[-0.8, [120, 92, 60]], [-0.3, [205, 190, 160]], [0, [240, 240, 236]], [0.3, [120, 170, 230]], [0.7, [20, 70, 170]]];

  // =====================================================================
  // 畫布
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let size = { w: 600, h: 450 };
  function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || 300, h = cv.clientHeight || 225;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    size = { w: w, h: h, dpr: dpr };
  }
  function imgView() {
    const pad = 8, s = Math.min((size.w - 2 * pad) / NX, (size.h - 2 * pad) / NY);
    return { s: s, x0: (size.w - NX * s) / 2, y0: (size.h - NY * s) / 2, W: NX * s, H: NY * s };
  }
  // 影像（96 × 72 小圖，放大時不平滑）
  let off = null, imgKey = '';
  function buildImage() {
    const key = state.layer + '|' + state.rgb.join(',');
    if (key === imgKey && off) return off;
    imgKey = key;
    if (!off) { off = document.createElement('canvas'); off.width = NX; off.height = NY; }
    const g = off.getContext('2d'), im = g.createImageData(NX, NY), d = im.data;
    if (state.layer === 'rgb') {
      const ch = state.rgb.map(function (b) { return { a: S.bands[b - 1], st: K.stretch(SC.bands[b - 1]) }; });
      for (let k = 0; k < N; k++) {
        for (let c = 0; c < 3; c++) {
          const t = Math.max(0, Math.min(1, (ch[c].a[k] - ch[c].st.lo) / (ch[c].st.hi - ch[c].st.lo)));
          d[4 * k + c] = Math.round(255 * Math.pow(t, 0.95));
        }
        d[4 * k + 3] = 255;
      }
    } else {
      const arr = state.layer === 'ndvi' ? S.ndvi : S.ndwi, R = state.layer === 'ndvi' ? NDVI_RAMP : NDWI_RAMP;
      for (let k = 0; k < N; k++) { const c = ramp(R, arr[k]); d[4 * k] = c[0]; d[4 * k + 1] = c[1]; d[4 * k + 2] = c[2]; d[4 * k + 3] = 255; }
    }
    g.putImageData(im, 0, 0);
    return off;
  }
  function drawImage() {
    const v = imgView();
    D.backdrop(ctx, size.w, size.h);
    ctx.save();
    ctx.fillStyle = D.alpha('#000000', D.dark ? 0.4 : 0.15);
    D.roundRect(ctx, v.x0 + 2, v.y0 + 4, v.W, v.H, 6); ctx.fill();
    ctx.beginPath(); D.roundRect(ctx, v.x0, v.y0, v.W, v.H, 6); ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buildImage(), v.x0, v.y0, v.W, v.H);
    ctx.imageSmoothingEnabled = true;
    ctx.restore();
    ctx.strokeStyle = D.alpha(C.text, 0.35); ctx.lineWidth = 1; D.roundRect(ctx, v.x0, v.y0, v.W, v.H, 6); ctx.stroke();
    // 選取的像元
    if (state.probe >= 0) {
      const i = state.probe % NX, j = Math.floor(state.probe / NX), x = v.x0 + i * v.s, y = v.y0 + j * v.s;
      ctx.save(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#000000'; ctx.strokeRect(x - 3, y - 3, v.s + 6, v.s + 6);
      ctx.strokeStyle = C['rs-probe']; ctx.lineWidth = 2; ctx.strokeRect(x - 3, y - 3, v.s + 6, v.s + 6);
      ctx.beginPath(); ctx.moveTo(x + v.s / 2, y - 3); ctx.lineTo(x + v.s / 2, y - 12); ctx.moveTo(x + v.s / 2, y + v.s + 3); ctx.lineTo(x + v.s / 2, y + v.s + 12);
      ctx.moveTo(x - 3, y + v.s / 2); ctx.lineTo(x - 12, y + v.s / 2); ctx.moveTo(x + v.s + 3, y + v.s / 2); ctx.lineTo(x + v.s + 12, y + v.s / 2); ctx.stroke(); ctx.restore();
    }
    // 比例尺（500 m）與指北
    const L = 500 / K.PIX * v.s, x = v.x0 + 10, y = v.y0 + v.H - 10;
    ctx.save();
    D.roundRect(ctx, x - 6, y - 24, L + 16, 30, 8); ctx.fillStyle = D.alpha(C.surface, 0.85); ctx.fill();
    ctx.strokeStyle = C.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + L, y); ctx.lineTo(x + L, y - 4); ctx.stroke();
    ctx.fillStyle = C.text; ctx.font = font(12, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('500 m', x, y - 8);
    const nx = v.x0 + v.W - 18, ny = v.y0 + 30;
    D.roundRect(ctx, nx - 13, ny - 26, 26, 40, 8); ctx.fillStyle = D.alpha(C.surface, 0.85); ctx.fill();
    ctx.fillStyle = C.text; ctx.beginPath(); ctx.moveTo(nx, ny - 20); ctx.lineTo(nx + 6, ny - 6); ctx.lineTo(nx - 6, ny - 6); ctx.closePath(); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillText(T('北', 'N'), nx, ny + 9);
    ctx.restore();
  }

  // ---------------- 光譜曲線 ----------------
  const L0 = 400, L1 = 2500;
  function specView() {
    const padL = 48, padR = 14, padT = 18, padB = 46;
    return { x0: padL, y0: padT, W: size.w - padL - padR, H: size.h - padT - padB, ymax: 0.6 };
  }
  const SXl = function (v, l) { return v.x0 + (l - L0) / (L1 - L0) * v.W; };
  const SYr = function (v, r) { return v.y0 + v.H - r / v.ymax * v.H; };
  const BAND_COL = ['#5b5bd6', '#2f6fd0', '#1f9d6b', '#d0342c', '#8e44ad', '#b5651d', '#7a4b2a'];
  function curve(v, f, color, width, dash) {
    ctx.save(); if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    for (let l = L0; l <= L1; l += 5) { const x = SXl(v, l), y = SYr(v, Math.min(v.ymax, f(l))); if (l === L0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
  }
  function pixelCurve(p) {
    const q = p.param, m = p.mix;
    const fV = K.spectra.vegetation(q.vig, q.lw), fS = K.spectra.soil(q.soilM, q.sb), fW = K.spectra.water(q.turb);
    return function (l) { return m.veg * fV(l) + m.soil * fS(l) + m.water * fW(l) + m.urban * K.urban(l); };
  }
  function drawSpectrum() {
    const v = specView();
    D.backdrop(ctx, size.w, size.h);
    ctx.fillStyle = D.alpha(C.surface, 0.6); ctx.fillRect(v.x0, v.y0, v.W, v.H);
    // 波段
    K.BANDS.forEach(function (b, i) {
      const xa = SXl(v, b.lo), xb = SXl(v, b.hi);
      ctx.fillStyle = D.alpha(BAND_COL[i], 0.16); ctx.fillRect(xa, v.y0, Math.max(2, xb - xa), v.H);
      D.haloText(ctx, String(b.n), (xa + xb) / 2, v.y0 + 2, BAND_COL[i], 'center', 'top', font(11, 700));
    });
    // 格線與座標
    ctx.strokeStyle = D.alpha(C.text, 0.1); ctx.lineWidth = 1;
    ctx.fillStyle = C.muted; ctx.font = font(11); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let r = 0; r <= v.ymax + 1e-9; r += 0.1) { const y = SYr(v, r); ctx.beginPath(); ctx.moveTo(v.x0, y); ctx.lineTo(v.x0 + v.W, y); ctx.stroke(); ctx.fillText(num(r, 1), v.x0 - 6, y); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let l = 500; l <= 2500; l += 500) { const x = SXl(v, l); ctx.beginPath(); ctx.moveTo(x, v.y0); ctx.lineTo(x, v.y0 + v.H); ctx.stroke(); ctx.fillText(String(l), x, v.y0 + v.H + 14); }
    // 可見光彩帶
    const grd = ctx.createLinearGradient(SXl(v, 400), 0, SXl(v, 700), 0);
    ['#7a3fbf', '#2f4fd6', '#18a0c8', '#2fb04a', '#e8d02a', '#f08a1e', '#d6281e'].forEach(function (c, i) { grd.addColorStop(i / 6, c); });
    ctx.fillStyle = grd; ctx.fillRect(SXl(v, 400), v.y0 + v.H + 2, SXl(v, 700) - SXl(v, 400), 8);
    ctx.fillStyle = C.muted; ctx.textAlign = 'right';
    ctx.fillText(T('波長（nm）', 'wavelength (nm)'), v.x0 + v.W, v.y0 + v.H + 28);
    ctx.save(); ctx.translate(14, v.y0 + v.H / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(T('反射率', 'reflectance'), 0, 0); ctx.restore();
    // 參考曲線
    const dr = state.drought;
    const refs = [
      [K.spectra.vegetation(1 - 0.35 * dr, 1 - 0.5 * dr), C['rs-veg'], T('植物', 'plants'), 900],
      [K.spectra.soil(0.55 * (1 - dr) + 0.05, 0.35), C['rs-soil'], T('土壤', 'soil'), 2200],
      [K.spectra.water(state.turb), C['rs-water'], T('水', 'water'), 560],
      [K.urban, C['rs-urban'], T('都市', 'urban'), 1250]
    ];
    refs.forEach(function (r) { curve(v, r[0], D.alpha(r[1], PX ? 0.45 : 0.9), PX ? 1.6 : 2.4, PX ? [5, 4] : null); });
    refs.forEach(function (r) { D.pill(ctx, r[2], SXl(v, r[3]), SYr(v, r[0](r[3])) - 4, r[1], 'center', font(11, 600)); });
    if (PX) {
      curve(v, pixelCurve(PX), C.text, 3);
      PX.bands.forEach(function (r, i) {
        const b = K.BANDS[i], x = SXl(v, (b.lo + b.hi) / 2), y = SYr(v, Math.min(v.ymax, r));
        D.ball(ctx, x, y, 5, BAND_COL[i], { shadow: false });
      });
      D.pill(ctx, T('這個像元（' + cn(PX.cls) + '）', 'this pixel (' + cn(PX.cls) + ')'), v.x0 + v.W - 70, v.y0 + 30, C.text, 'right', font(12, 700));
    }
    ctx.strokeStyle = D.alpha(C.text, 0.3); ctx.strokeRect(v.x0, v.y0, v.W, v.H);
  }

  // ---------------- 紅光–近紅外散布圖 ----------------
  function scatView() {
    const f = Math.min(fsz(), 1.35), padL = Math.round(50 * f), padB = Math.round(44 * f);
    const side = Math.min(size.w - padL - 14, size.h - padB - 18);
    return { x0: Math.max(padL, (size.w - side) / 2 + padL / 2 - 7), y0: 14, side: side, rx: 0.3, ry: 0.6, small: side < 330 };
  }
  const CLS_COL = function (c) { return { water: C['rs-water'], pond: C['rs-water'], forest: D.shade(C['rs-veg'], -0.2), park: C['rs-veg'], paddy: D.mix(C['rs-veg'], '#c8d84a', 0.4), town: C['rs-urban'], fallow: C['rs-soil'], sand: C['rs-sand'] }[c]; };
  function drawScatter() {
    const v = scatView();
    D.backdrop(ctx, size.w, size.h);
    const X = function (r) { return v.x0 + r / v.rx * v.side; }, Y = function (r) { return v.y0 + v.side - r / v.ry * v.side; };
    ctx.fillStyle = D.alpha(C.surface, 0.6); ctx.fillRect(v.x0, v.y0, v.side, v.side);
    ctx.strokeStyle = D.alpha(C.text, 0.1); ctx.lineWidth = 1; ctx.fillStyle = C.muted; ctx.font = font(11);
    for (let q = 0; q <= 6; q++) { const r = q * 0.05; ctx.beginPath(); ctx.moveTo(X(r), v.y0); ctx.lineTo(X(r), v.y0 + v.side); ctx.stroke(); if (v.small && q % 2) continue; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(num(r, v.small ? 1 : 2), X(r), v.y0 + v.side + 4); }
    for (let q = 0; q <= 6; q++) { const r = q * 0.1; ctx.beginPath(); ctx.moveTo(v.x0, Y(r)); ctx.lineTo(v.x0 + v.side, Y(r)); ctx.stroke(); if (v.small && q % 2) continue; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(num(r, 1), v.x0 - 5, Y(r)); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(T('紅光反射率（波段 4）', 'red reflectance (band 4)'), v.x0 + v.side / 2, v.y0 + v.side + 6 + Math.round(14 * Math.min(fsz(), 1.35)));
    ctx.save(); ctx.translate(v.x0 - Math.round(38 * Math.min(fsz(), 1.35)), v.y0 + v.side / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText(T('近紅外反射率（波段 5）', 'NIR reflectance (band 5)'), 0, 0); ctx.restore();
    // NDVI 等值線：NIR = red (1 + n)/(1 − n)
    ctx.save(); ctx.beginPath(); ctx.rect(v.x0, v.y0, v.side, v.side); ctx.clip();
    [0, 0.2, 0.4, 0.6, 0.8].forEach(function (n) {
      const k = (1 + n) / (1 - n);
      ctx.setLineDash([4, 4]); ctx.strokeStyle = D.alpha(C.text, 0.35); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(v.rx), Y(v.rx * k)); ctx.stroke();
    });
    ctx.setLineDash([]);
    // 點
    const red = S.bands[K.B.red], nir = S.bands[K.B.nir];
    for (let k = 0; k < N; k += 1) {
      ctx.fillStyle = D.alpha(CLS_COL(K.classAt(k)), 0.55);
      ctx.fillRect(X(red[k]) - 1.2, Y(nir[k]) - 1.2, 2.4, 2.4);
    }
    ctx.restore();
    (v.small ? [0, 0.4, 0.8] : [0, 0.2, 0.4, 0.6, 0.8]).forEach(function (n, i) {
      const k = (1 + n) / (1 - n), r = Math.min(v.rx * 0.97, v.ry * 0.97 / k);
      D.haloText(ctx, (i === 0 || !v.small ? 'NDVI ' : '') + num(n, 1), X(r) - 2, Y(r * k) - 2, C.muted, 'right', 'bottom', font(10, 600));
    });
    if (PX) {
      const x = X(PX.bands[K.B.red]), y = Y(PX.bands[K.B.nir]);
      ctx.save(); ctx.strokeStyle = C['rs-probe']; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 8, 0, 2 * Math.PI); ctx.stroke(); ctx.restore();
    }
    ctx.strokeStyle = D.alpha(C.text, 0.3); ctx.strokeRect(v.x0, v.y0, v.side, v.side);
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function legendHTML() {
    const sw = function (c, txt) { return '<span style="color:var(--muted)"><i style="background:' + c + '"></i>' + txt + '</span>'; };
    const grad = function (stops, a, b) {
      const lo = stops[0][0], hi = stops[stops.length - 1][0];
      const css = 'linear-gradient(90deg,' + stops.map(function (s) { return 'rgb(' + s[1].map(Math.round).join(',') + ') ' + Math.round(100 * (s[0] - lo) / (hi - lo)) + '%'; }).join(',') + ')';
      return '<span style="color:var(--muted)">' + a + ' <i style="width:90px;background:' + css + '"></i> ' + b + '</span>';
    };
    if (state.view === 'spectrum') return sw('var(--rs-veg)', T('植物', 'plants')) + sw('var(--rs-soil)', T('土壤', 'soil')) + sw('var(--rs-water)', T('水', 'water')) + sw('var(--rs-urban)', T('都市', 'urban')) + (PX ? sw('var(--text)', T('這個像元', 'this pixel')) : '');
    if (state.view === 'scatter') return sw('var(--rs-water)', T('水', 'water')) + sw('var(--rs-veg)', T('植物', 'plants')) + sw('var(--rs-soil)', T('休耕地', 'fallow')) + sw('var(--rs-urban)', T('城鎮', 'town')) + sw('var(--rs-sand)', T('沙洲', 'sand'));
    if (state.layer === 'ndvi') return grad(NDVI_RAMP, '−0.6', '1') + '<span style="color:var(--muted)">NDVI</span>';
    if (state.layer === 'ndwi') return grad(NDWI_RAMP, '−0.8', '0.7') + '<span style="color:var(--muted)">NDWI</span>';
    return '<span style="color:var(--muted)">' + T('紅＝波段 ', 'R = band ') + state.rgb[0] + T('、綠＝波段 ', ', G = band ') + state.rgb[1] + T('、藍＝波段 ', ', B = band ') + state.rgb[2] + T('（每個波段各自拉伸亮度）', ' (each band stretched)') + '</span>';
  }
  function riceSay() {
    // 用最多稻田的階段
    const cnt = {};
    for (let k = 0; k < N; k++) if (K.SCENE.cls[k] === 4) { const s = K.rice(state.day, K.SCENE.shift[k], state.drought).stage; cnt[s] = (cnt[s] || 0) + 1; }
    let best = 'fallow', m = -1;
    Object.keys(cnt).forEach(function (s) { if (cnt[s] > m) { m = cnt[s]; best = s; } });
    return T(STAGE_NAME[best][0], STAGE_NAME[best][1]);
  }
  function updateReadouts() {
    setOut(el.day, String(state.day)); setOut(el.drought, num(state.drought, 2)); setOut(el.turb, num(state.turb, 2)); setOut(el.haze, num(state.haze, 3));
    setText('rDate', dateOf(state.day));
    setText('rRice', riceSay());
    setText('mPaddy', num(S.mean.paddy, 2));
    setText('mForest', num(S.mean.forest, 2));
    setText('mTown', num(S.mean.town, 2));
    setText('mWater', num(S.mean.water, 2));
    ['selR', 'selG', 'selB'].forEach(function (id, c) { if (+$(id).value !== state.rgb[c]) $(id).value = String(state.rgb[c]); });
    // 像元表
    if (PX) {
      $('pHint').hidden = true;
      const ix = K.indices(PX.bands), mx = Math.max.apply(null, PX.bands.concat([0.3]));
      let h = '<colgroup><col style="width:40%"><col style="width:36%"><col></colgroup><tr><th>' + T('地表', 'Cover') + '</th><td colspan="2">' + cn(PX.cls) + (PX.stage ? T('（' + STAGE_NAME[PX.stage][0] + '）', ' (' + STAGE_NAME[PX.stage][1] + ')') : '') + '</td></tr>';
      const mix = [['veg', '植物', 'plants'], ['soil', '土壤', 'soil'], ['water', '水', 'water'], ['urban', '都市', 'urban']].filter(function (q) { return PX.mix[q[0]] > 0.005; })
        .map(function (q) { return T(q[1], q[2]) + ' ' + Math.round(100 * PX.mix[q[0]]) + '%'; }).join(T('、', ', '));
      h += '<tr><th>' + T('組成', 'Mix') + '</th><td colspan="2">' + mix + '</td></tr>';
      K.BANDS.forEach(function (b, i) {
        h += '<tr><td>' + b.n + ' ' + T(b.zh, b.en) + '</td><td class="bar"><i style="width:' + Math.round(100 * PX.bands[i] / mx) + '%;background:' + BAND_COL[i] + '"></i></td><td>' + num(PX.bands[i], 3) + '</td></tr>';
      });
      h += '<tr><th>NDVI</th><td colspan="2"><b>' + num(ix.ndvi, 2) + '</b></td></tr><tr><th>NDWI</th><td colspan="2">' + num(ix.ndwi, 2) + '</td></tr><tr><th>NDBI</th><td colspan="2">' + num(ix.ndbi, 2) + '</td></tr>';
      setHTML('pTab', h);
    } else { $('pHint').hidden = false; setHTML('pTab', ''); }
    setHTML('legend', legendHTML());
    $('layerSeg').hidden = state.view !== 'image';
    $('rgbSel').hidden = state.comp !== 'custom';
    setText('cvHint', state.view === 'image' ? T('點影像（或用方向鍵）選一個像元。', 'Tap the image (or use the arrow keys) to pick a pixel.') : state.view === 'spectrum' ? T('彩色的直條是衛星的 7 個波段；圓點是這個像元在每個波段量到的值。', 'Coloured strips are the 7 bands; dots are what the satellite measures in each.') : T('每一點是一個像元。植物在左上（紅光暗、近紅外亮），水在左下，土壤與城鎮沿著斜斜的「土壤線」。', 'Each dot is a pixel. Plants sit top left (dark red, bright NIR), water bottom left, soil and town along the slanted soil line.'));
    $('srNow').textContent = PX ? cn(PX.cls) + ' NDVI ' + num(K.indices(PX.bands).ndvi, 2) : T('稻田平均 NDVI ', 'Paddy mean NDVI ') + num(S.mean.paddy, 2);
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function snapshot(act) {
    let probe = null;
    if (PX) {
      const ix = K.indices(PX.bands);
      probe = { k: state.probe, cls: PX.cls, stage: PX.stage, ndvi: ix.ndvi, ndwi: ix.ndwi, ndbi: ix.ndbi, mix: Object.assign({}, PX.mix), b: PX.bands.slice() };
    }
    return {
      act: act || 'param', view: state.view, layer: state.layer, comp: state.comp, rgb: state.rgb.slice(),
      day: state.day, drought: state.drought, turb: state.turb, haze: state.haze, playing: state.playing,
      mean: Object.assign({}, S.mean), meanW: Object.assign({}, S.meanW), paddy0: S0.mean.paddy, paddyC: SC.mean.paddy, probe: probe
    };
  }
  let lastEmit = 0, emitTimer = 0;
  function emit(data) { if (state.acted && window.LabMission) window.LabMission.emit('rs', data); }
  function acted() { state.acted = true; }
  function afterChange(force, act) {
    recompute();
    updateReadouts();
    requestDraw();
    const now = performance.now();
    clearTimeout(emitTimer);
    if (force || now - lastEmit > 250) { lastEmit = now; emit(snapshot(act)); }
    else emitTimer = setTimeout(function () { lastEmit = performance.now(); emit(snapshot(act)); }, 270);
  }
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame() { raf = 0; if (state.view === 'spectrum') drawSpectrum(); else if (state.view === 'scatter') drawScatter(); else drawImage(); }

  // =====================================================================
  // 控制項
  // =====================================================================
  const setSl = function (inp, v) { if (window.LabNum) window.LabNum.set(inp, v); else inp.value = v; };
  function loadSliders() { syncing = true; Object.keys(el).forEach(function (k) { setSl(el[k], state[k]); }); syncing = false; }
  function readSliders() {
    state.day = clamp(Math.round(val(el.day)), LIM.day);
    state.drought = clamp(Math.round(val(el.drought) * 100) / 100, LIM.drought);
    state.turb = clamp(Math.round(val(el.turb) * 100) / 100, LIM.turb);
    state.haze = clamp(Math.round(val(el.haze) * 1000) / 1000, LIM.haze);
  }
  function say() {
    if (PX) {
      const ix = K.indices(PX.bands);
      setStatus(T('這個像元是' + cn(PX.cls) + '：NDVI ' + num(ix.ndvi, 2) + '。', 'This pixel is ' + cn(PX.cls) + ': NDVI ' + num(ix.ndvi, 2) + '.') + ' ' + T('稻田平均 ' + num(S.mean.paddy, 2) + '。', 'Paddies average ' + num(S.mean.paddy, 2) + '.'));
    } else setStatus(T(dateOf(state.day) + '：稻田' + riceSay() + '，平均 NDVI ' + num(S.mean.paddy, 2) + '。', dateOf(state.day) + ': the rice is ' + riceSay() + ', mean NDVI ' + num(S.mean.paddy, 2) + '.'));
  }
  function sliderChanged(e) {
    if (syncing) return;
    acted(); readSliders();
    afterChange(e.type === 'change', e.target === el.day ? 'day' : 'param');
    if (e.type === 'change') say();
  }
  Object.keys(el).forEach(function (k) { el[k].addEventListener('input', sliderChanged); el[k].addEventListener('change', sliderChanged); });
  // 波段選單
  ['selR', 'selG', 'selB'].forEach(function (id) {
    const s = $(id);
    K.BANDS.forEach(function (b) { const o = document.createElement('option'); o.value = String(b.n); o.textContent = b.n + ' ' + b.zh; o.setAttribute('data-en', b.n + ' ' + b.en); s.appendChild(o); });
  });
  function relabelOptions() { ['selR', 'selG', 'selB'].forEach(function (id) { Array.prototype.forEach.call($(id).options, function (o, i) { o.textContent = K.BANDS[i].n + ' ' + T(K.BANDS[i].zh, K.BANDS[i].en); }); }); }
  ['selR', 'selG', 'selB'].forEach(function (id, c) {
    $(id).addEventListener('change', function () {
      acted(); state.rgb[c] = +$(id).value; state.comp = 'custom'; syncSeg();
      afterChange(true, 'rgb');
      setStatus(T('紅＝波段 ' + state.rgb[0] + '、綠＝波段 ' + state.rgb[1] + '、藍＝波段 ' + state.rgb[2] + '。', 'R = band ' + state.rgb[0] + ', G = band ' + state.rgb[1] + ', B = band ' + state.rgb[2] + '.'));
    });
  });
  function syncSeg() {
    cv.classList.toggle('tall', state.view === 'scatter');
    document.querySelectorAll('#viewSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === state.view)); });
    document.querySelectorAll('#layerSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-layer') === state.layer)); });
    document.querySelectorAll('#compSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-comp') === state.comp)); });
  }
  function segClick(sel, attr, apply) {
    document.querySelectorAll(sel + ' button').forEach(function (b) { b.addEventListener('click', function () { acted(); apply(b.getAttribute(attr)); }); });
  }
  const COMP_SAY = {
    natural: ['真實色彩（4-3-2）：像一般照片；植物是暗綠色，混濁的河是土黃色。', 'Natural colour (4-3-2): like a photo; plants are dark green, the muddy river is brown.'],
    cir: ['標準假色（5-4-3）：近紅外放在紅色，健康的植物變成紅色，水變成黑色。', 'Colour infrared (5-4-3): NIR in red, so healthy plants glow red and water turns black.'],
    agri: ['農業組合（6-5-2）：作物是亮綠色，裸露的土是粉紅褐色。', 'Agriculture (6-5-2): crops are bright green, bare soil is pinkish brown.'],
    swir: ['短波紅外組合（7-6-4）：乾的地亮、溼的地暗，水是黑色。', 'SWIR (7-6-4): dry ground is bright, wet ground dark, water black.'],
    custom: ['自訂：選三個波段放進紅、綠、藍。', 'Custom: choose three bands for red, green and blue.']
  };
  segClick('#compSeg', 'data-comp', function (c) {
    state.comp = c;
    if (c !== 'custom') state.rgb = K.COMPOSITES[c].slice();
    state.layer = 'rgb'; state.view = 'image'; syncSeg();
    afterChange(true, 'comp');
    setStatus(T(COMP_SAY[c][0], COMP_SAY[c][1]));
  });
  segClick('#layerSeg', 'data-layer', function (l) {
    state.layer = l; syncSeg(); afterChange(true, 'layer');
    if (l === 'ndvi') setStatus(T('NDVI：越綠植物越茂密健康，水是藍色（負值）。', 'NDVI: the greener, the denser and healthier the plants; water is blue (negative).'));
    else if (l === 'ndwi') setStatus(T('NDWI：開放水面是藍色（正值），植物是褐色（負值）。', 'NDWI: open water is blue (positive), plants brown (negative).'));
    else setStatus(T(COMP_SAY[state.comp][0], COMP_SAY[state.comp][1]));
  });
  segClick('#viewSeg', 'data-view', function (v) {
    state.view = v; syncSeg(); afterChange(true, 'view');
    if (v === 'spectrum') setStatus(PX ? T('粗黑線是這個像元的光譜，虛線是四種地表的參考曲線。', 'The thick line is this pixel; dashed lines are four reference surfaces.') : T('四種地表的光譜曲線。回到影像點一個像元，就會畫出它的曲線。', 'Spectra of four surfaces. Pick a pixel on the image to add its curve.'));
    else if (v === 'scatter') setStatus(T('紅光–近紅外散布圖：虛線是 NDVI 相同的點。', 'Red–NIR plot: dashed lines join points of equal NDVI.'));
    else say();
  });

  // ---------- 播放一年 ----------
  let playLast = 0, playRaf = 0, dayF = 0;
  function playLabel() { $('play').textContent = state.playing ? T('❚❚ 暫停', '❚❚ Pause') : T('▶ 播放一年', '▶ Run the year'); $('play').setAttribute('aria-pressed', String(state.playing)); }
  function stopPlay() { state.playing = false; cancelAnimationFrame(playRaf); playLabel(); }
  function playStep(ts) {
    if (!state.playing) return;
    const dt = playLast ? Math.min(0.1, (ts - playLast) / 1000) : 0; playLast = ts;
    dayF += dt * 30;
    if (dayF >= 365) { dayF = 365; stopPlay(); }
    state.day = Math.round(dayF);
    syncing = true; setSl(el.day, state.day); syncing = false;
    afterChange(!state.playing, 'day');
    if (state.playing) playRaf = requestAnimationFrame(playStep); else say();
  }
  $('play').addEventListener('click', function () {
    acted();
    if (state.playing) { stopPlay(); afterChange(true, 'day'); say(); return; }
    dayF = state.day >= 365 ? 1 : state.day;
    state.playing = true; playLast = 0; playLabel();
    playRaf = requestAnimationFrame(playStep);
  });

  // ---------- 點像元 ----------
  let drag = false;
  function local(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function pixFromPx(q) {
    const v = imgView(), i = Math.floor((q[0] - v.x0) / v.s), j = Math.floor((q[1] - v.y0) / v.s);
    return i >= 0 && i < NX && j >= 0 && j < NY ? j * NX + i : -1;
  }
  function setProbe(k, force) { if (k < 0 || k >= N) return; state.probe = k; afterChange(force, 'probe'); }
  cv.addEventListener('pointerdown', function (e) {
    acted();
    if (state.view !== 'image') return;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    drag = true;
    const k = pixFromPx(local(e)); if (k >= 0) setProbe(k, false);
  });
  cv.addEventListener('pointermove', function (e) { if (!drag) return; const k = pixFromPx(local(e)); if (k >= 0 && k !== state.probe) setProbe(k, false); });
  function endDrag() { if (!drag) return; drag = false; afterChange(true, 'probe'); say(); }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  if (window.LabKeys) window.LabKeys.attach(cv, {
    label: T('衛星影像。方向鍵一次移動一個像元（Shift 一次 5 個）。', 'Satellite image. Arrow keys move one pixel (Shift for 5).'),
    items: [{
      name: function () { return T('選取的像元', 'Selected pixel'); },
      move: function (dx, dy, big) {
        acted();
        const k = state.probe >= 0 ? state.probe : (36 * NX + 48), st = big ? 5 : 1;
        const i = Math.max(0, Math.min(NX - 1, k % NX + dx * st)), j = Math.max(0, Math.min(NY - 1, Math.floor(k / NX) + dy * st));
        setProbe(j * NX + i, true); say();
        return true;
      },
      describe: function () { return $('status').textContent; }
    }],
    onChange: function () { requestDraw(); }
  });

  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { v: state.view, l: state.layer, c: state.comp, rgb: state.rgb.slice(), p: state.probe }; },
    set: function (o) {
      if (!o) return;
      if (['image', 'spectrum', 'scatter'].indexOf(o.v) >= 0) state.view = o.v;
      if (['rgb', 'ndvi', 'ndwi'].indexOf(o.l) >= 0) state.layer = o.l;
      if (COMP_NAME[o.c]) state.comp = o.c;
      if (Array.isArray(o.rgb) && o.rgb.length === 3 && o.rgb.every(function (b) { return b >= 1 && b <= 7; })) state.rgb = o.rgb.map(function (b) { return Math.round(b); });
      else if (state.comp !== 'custom') state.rgb = K.COMPOSITES[state.comp].slice();
      if (isFinite(o.p) && o.p >= -1 && o.p < N) state.probe = Math.round(o.p);
      readSliders(); syncSeg();
      recompute(); updateReadouts(); requestDraw();
    }
  });

  window.__rs = { state: state, K: K, snapshot: snapshot, get S() { return S; }, setProbe: setProbe, redraw: requestDraw, refresh: function (act) { readSliders(); syncSeg(); afterChange(true, act || 'param'); } };

  readColors();
  loadSliders();
  readSliders();
  syncSeg();
  fit();
  recompute();
  updateReadouts();
  function themeChanged() { readColors(); relabelOptions(); playLabel(); updateReadouts(); requestDraw(); }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  let rsTimer = 0;
  window.addEventListener('resize', function () { clearTimeout(rsTimer); rsTimer = setTimeout(function () { fit(); requestDraw(); }, 60); });
  if (window.ResizeObserver) new ResizeObserver(function () { fit(); requestDraw(); }).observe(cv);
  relabelOptions();
  say();
  requestDraw();
})();
