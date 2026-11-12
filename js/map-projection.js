/* map-projection.js — 「地圖投影與變形」的畫面與互動
 * 數學全部在 map-projection-core.js；世界陸地輪廓在 geog-world.js；3D 在 map-projection-3d.js（切換到 3D 時才載入）。 */
(function () {
  'use strict';
  const K = window.MapProjectionCore;
  const W = window.GeogWorld;
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
  const DEG = K.DEG, PI = Math.PI;
  const MAX_PROBES = 6;

  // =====================================================================
  // 資料
  // =====================================================================
  const LAND = W.land.map(function (poly) { return poly.map(function (r) { return W.decode(r).map(function (p) { return [p[0] * DEG, p[1] * DEG]; }); }); });
  const SHAPES = {};
  Object.keys(W.shapes).forEach(function (k) {
    const ring = W.decode(W.shapes[k]).map(function (p) { return [p[0] * DEG, p[1] * DEG]; });
    SHAPES[k] = { ring: ring, home: K.centroid(ring), area: K.trueArea(ring) };
  });
  const SHAPE_NAME = {
    greenland: ['格陵蘭', 'Greenland'], africa: ['非洲', 'Africa'], 'south-america': ['南美洲', 'South America'],
    australia: ['澳洲', 'Australia'], britain: ['大不列顛島', 'Great Britain'], taiwan: ['臺灣', 'Taiwan']
  };
  const CITIES = [
    ['taipei', '臺北', 'Taipei', 25.03, 121.56], ['tokyo', '東京', 'Tokyo', 35.68, 139.69], ['newyork', '紐約', 'New York', 40.71, -74.01],
    ['london', '倫敦', 'London', 51.51, -0.13], ['sydney', '雪梨', 'Sydney', -33.87, 151.21], ['capetown', '開普敦', 'Cape Town', -33.92, 18.42],
    ['saopaulo', '聖保羅', 'São Paulo', -23.55, -46.63], ['losangeles', '洛杉磯', 'Los Angeles', 34.05, -118.24], ['dubai', '杜拜', 'Dubai', 25.20, 55.27],
    ['anchorage', '安克拉治', 'Anchorage', 61.22, -149.90], ['singapore', '新加坡', 'Singapore', 1.35, 103.82], ['quito', '基多', 'Quito', -0.18, -78.47],
    ['reykjavik', '雷克雅維克', 'Reykjavík', 64.15, -21.94], ['buenosaires', '布宜諾斯艾利斯', 'Buenos Aires', -34.60, -58.38],
    ['cairo', '開羅', 'Cairo', 30.04, 31.24], ['moscow', '莫斯科', 'Moscow', 55.76, 37.62]
  ];
  const PROJ_NAME = {
    equirect: ['等距圓柱', 'Equirectangular', '經緯線都是等距直線', 'parallels and meridians evenly spaced'],
    mercator: ['麥卡托', 'Mercator', '1569 年，航海用', '1569, for navigation'],
    cea: ['等積圓柱', 'Cylindrical equal-area', '蘭伯特、高爾－彼得斯', 'Lambert, Gall–Peters'],
    sinusoidal: ['正弦', 'Sinusoidal', '緯線長度正確', 'parallels at true length'],
    mollweide: ['莫爾維特', 'Mollweide', '1805 年，橢圓形', '1805, an ellipse'],
    robinson: ['羅賓森', 'Robinson', '1963 年，好看的折衷', '1963, a good-looking compromise'],
    equalearth: ['等地球', 'Equal Earth', '2018 年，等積', '2018, equal-area'],
    lcc: ['蘭伯特等角圓錐', 'Lambert conformal conic', '航空圖、各國地圖', 'aviation charts, national maps'],
    albers: ['亞伯斯等積圓錐', 'Albers equal-area conic', '統計地圖', 'statistical maps'],
    ortho: ['正射', 'Orthographic', '從無限遠看地球', 'the globe seen from far away'],
    stereo: ['平射', 'Stereographic', '光源在對蹠點', 'light at the antipode'],
    gnomonic: ['心射', 'Gnomonic', '光源在地心，大圓是直線', 'light at the centre; great circles are straight'],
    aeqd: ['等距方位', 'Azimuthal equidistant', '到中心的距離正確', 'true distance from the centre'],
    laea: ['蘭伯特等積方位', 'Lambert azimuthal equal-area', '1772 年，等積', '1772, equal-area']
  };
  const PROP_NAME = {
    conformal: ['等角：角度與小區域的形狀正確，面積會變', 'Conformal: angles and small shapes are true; areas change'],
    equalArea: ['等積：面積正確，形狀會被拉長或壓扁', 'Equal-area: areas are true; shapes are stretched or squashed'],
    equidistant: ['等距：某些方向上的距離正確', 'Equidistant: distances are true in some directions'],
    compromise: ['折衷：面積、角度都不完全正確，但誤差分散', 'Compromise: neither areas nor angles are exact, but errors are spread out'],
    perspective: ['透視：像從遠方拍的地球照片，看得到半個地球', 'Perspective: like a photo of the globe from far away; one hemisphere only'],
    greatCircle: ['透視：所有大圓（最短航線）都是直線', 'Perspective: every great circle (shortest route) is a straight line']
  };
  const FAMILIES = { cyl: ['equirect', 'mercator', 'cea'], pseudo: ['sinusoidal', 'mollweide', 'robinson', 'equalearth'], conic: ['lcc', 'albers'], azi: ['ortho', 'stereo', 'gnomonic', 'aeqd', 'laea'] };

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = { lam0: $('lam0'), phiS: $('phiS'), phi1: $('phi1'), phi2: $('phi2'), phi0: $('phi0'), unroll: $('unroll') };
  const state = {
    fam: 'cyl', proj: 'mercator', lastOf: { cyl: 'mercator', pseudo: 'robinson', conic: 'lcc', azi: 'ortho' },
    lam0: 0, phiS: 0, phi1: 20, phi2: 50, phi0: 90,
    img: true, grid: true, tissot: true, heat: 'none',
    shape: null, shapeAt: null,              // shapeAt：中心（弧度），null = 原位
    probes: [],                              // [{ lam, phi }]（弧度），最後一個是最新的
    route: false, A: [121.56 * DEG, 25.03 * DEG], B: [-74.01 * DEG, 40.71 * DEG], cityA: 'taipei', cityB: 'newyork',
    unroll: 0, acted: false
  };
  let P = null;                              // 目前的投影物件
  function makeProj() {
    P = K.make({ id: state.proj, lam0: state.lam0, phiS: state.phiS, phi1: state.phi1, phi2: state.phi2, phi0: state.phi0 });
    geomKey = ''; cache = null;
  }
  function readSliders() {
    state.lam0 = val(el.lam0); state.phiS = val(el.phiS);
    state.phi1 = val(el.phi1); state.phi2 = val(el.phi2); state.phi0 = val(el.phi0);
    state.unroll = val(el.unroll);
  }

  // =====================================================================
  // 顏色與文字
  // =====================================================================
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface',
      '--mp-sea', '--mp-sea2', '--mp-land', '--mp-land2', '--mp-coast', '--mp-grid', '--mp-tissot', '--mp-shape', '--mp-gc', '--mp-rh', '--mp-probe', '--mp-frame', '--mp-heat-lo', '--mp-heat-hi']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function grp(v) { return v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString('en-US'); }
  function areaText(km2) {
    if (km2 == null || !isFinite(km2)) return '—';
    if (km2 >= 1e6) return T(num(km2 / 1e4, 0) + ' 萬 km²', num(km2 / 1e6, 2) + ' million km²');
    if (km2 >= 1e4) return T(num(km2 / 1e4, 1) + ' 萬 km²', grp(km2) + ' km²');
    return grp(km2) + ' km²';
  }
  function latText(f) { const d = f / DEG; return num(Math.abs(d), 1) + '°' + (d >= 0 ? T('N', 'N') : T('S', 'S')); }
  function lonText(l) { const d = K.wrapPi(l) / DEG; return num(Math.abs(d), 1) + '°' + (d >= 0 ? 'E' : 'W'); }
  function outNum(v, lo, hi) {
    let t = v.toFixed(hi);
    if (hi > lo) t = t.replace(new RegExp('0{1,' + (hi - lo) + '}$'), '').replace(/\.$/, '');
    return t.replace('-', '−');
  }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function projName(id) { const n = PROJ_NAME[id]; return T(n[0], n[1]); }
  function km(rad) { return rad * K.R_EARTH; }
  function bearingText(b) { return num(b / DEG, 1) + '°'; }

  // =====================================================================
  // 畫布與地圖座標
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let cvSize = { w: 300, h: 300, dpr: 1 };
  function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || 300, h = cv.clientHeight || 300;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cvSize = { w: w, h: h, dpr: dpr };
    geomKey = ''; rasterKey = '';
  }
  // 地圖範圍 → 畫布：等比例縮放、置中
  let geom = null, geomKey = '';
  function getGeom() {
    const key = [state.proj, state.lam0, state.phiS, state.phi1, state.phi2, state.phi0, cvSize.w, cvSize.h].join('|');
    if (geom && key === geomKey) return geom;
    const ol = K.outline(P, 240);
    const b = K.bounds(ol);
    const m = cvSize.w < 520 ? 8 : 14;
    const sc = Math.min((cvSize.w - 2 * m) / (b[2] - b[0]), (cvSize.h - 2 * m) / (b[3] - b[1]));
    const mw = (b[2] - b[0]) * sc, mh = (b[3] - b[1]) * sc;
    const ox = (cvSize.w - mw) / 2, oy = (cvSize.h - mh) / 2;
    geom = { b: b, sc: sc, ox: ox, oy: oy, mw: mw, mh: mh, outline: ol };
    geom.path = new Path2D();
    ol.forEach(function (p, i) { const s = toS(p, geom); if (i) geom.path.lineTo(s[0], s[1]); else geom.path.moveTo(s[0], s[1]); });
    geom.path.closePath();
    geomKey = key;
    return geom;
  }
  function toS(p, g) { g = g || geom; return [g.ox + (p[0] - g.b[0]) * g.sc, g.oy + (g.b[3] - p[1]) * g.sc]; }
  function fromS(x, y, g) { g = g || geom; return [g.b[0] + (x - g.ox) / g.sc, g.b[3] - (y - g.oy) / g.sc]; }
  function invAt(x, y) { const g = getGeom(); const q = fromS(x, y, g); return P.inverse(q[0], q[1]); }

  // =====================================================================
  // 影像來源：NASA Blue Marble（等距圓柱 2048×1024）與陸地遮罩（平面色用）
  // =====================================================================
  let bm = null;                  // { w, h, data: Uint8ClampedArray }
  let mask = null;                // { w, h, data: Uint8Array }（1 = 陸地）
  function buildMask() {
    const w = 1440, h = 720;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    g.beginPath();
    LAND.forEach(function (poly) {
      poly.forEach(function (ring) {
        ring.forEach(function (p, i) {
          const x = (p[0] / PI + 1) / 2 * w, y = (0.5 - p[1] / PI) * h;
          if (i) g.lineTo(x, y); else g.moveTo(x, y);
        });
        g.closePath();
      });
    });
    g.fill('evenodd');
    const d = g.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4] > 127 ? 1 : 0;
    mask = { w: w, h: h, data: m };
  }
  function loadBlueMarble() {
    const im = new Image();
    im.onload = function () {
      try {
        const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        bm = { w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data, img: im };
        rasterKey = ''; requestDraw();
        if (view3 && view3.active) view3.onMap();
      } catch (e) { bm = null; }
    };
    im.src = new URL('img/tides/earth-2048.webp', document.baseURI).href;
  }

  // =====================================================================
  // 逐像素重投影（反算）：λ、φ 查表快取；換主題或圖層只重新上色
  // =====================================================================
  let lut = null, lutKey = '', rasterKey = '', raster = null, interacting = false, refineTimer = 0;
  const rc = document.createElement('canvas'), rctx = rc.getContext('2d');
  function buildLut(rw, rh) {
    const g = getGeom();
    const key = geomKey + '|' + rw + 'x' + rh;
    if (lut && lutKey === key) return lut;
    const n = rw * rh, lam = new Float32Array(n), phi = new Float32Array(n), ok = new Uint8Array(n);
    for (let j = 0; j < rh; j++) {
      const y = g.oy + (j + 0.5) / rh * g.mh;
      for (let i = 0; i < rw; i++) {
        const x = g.ox + (i + 0.5) / rw * g.mw;
        const q = fromS(x, y, g);
        const r = P.inverse(q[0], q[1]);
        const k = j * rw + i;
        if (r) { lam[k] = r[0]; phi[k] = r[1]; ok[k] = 1; }
      }
    }
    lut = { w: rw, h: rh, lam: lam, phi: phi, ok: ok, heat: null, heatKind: '' };
    lutKey = key;
    return lut;
  }
  function heatValues(L, kind) {
    if (L.heat && L.heatKind === kind) return L.heat;
    const n = L.w * L.h, out = new Float32Array(n);
    // 每 2×2 像素算一次（變形是平滑的），再複製
    for (let j = 0; j < L.h; j += 2) for (let i = 0; i < L.w; i += 2) {
      const k = j * L.w + i;
      let v = NaN;
      if (L.ok[k]) { const t = K.tissot(P, L.lam[k], L.phi[k]); v = kind === 'area' ? Math.log2(t.s) : t.omega / DEG; }
      for (let dj = 0; dj < 2 && j + dj < L.h; dj++) for (let di = 0; di < 2 && i + di < L.w; di++) out[(j + dj) * L.w + i + di] = v;
    }
    L.heat = out; L.heatKind = kind;
    return out;
  }
  function rgbOf(c) { return D.rgb(c); }
  const HEAT_MID_LIGHT = [238, 234, 224], HEAT_MID_DARK = [92, 100, 110];   // 變形著色的中性色（1 倍、0°）
  function renderRaster() {
    const g = getGeom();
    const q = interacting ? 0.42 : Math.min(1, 1100 / Math.max(1, g.mw));
    const rw = Math.max(40, Math.round(g.mw * q)), rh = Math.max(20, Math.round(g.mh * q));
    const key = lutKey + '|' + rw + 'x' + rh + '|' + (state.img && bm ? 'img' : 'flat') + '|' + state.heat + '|' + D.ver + '|' + JSON.stringify(C['mp-sea'] + C['mp-land']);
    const L = buildLut(rw, rh);
    if (raster && rasterKey === key + '|' + lutKey) return raster;
    rc.width = rw; rc.height = rh;
    const out = rctx.createImageData(rw, rh), o = out.data;
    const useImg = state.img && bm;
    const sea = rgbOf(C['mp-sea']), sea2 = rgbOf(C['mp-sea2']), land = rgbOf(C['mp-land']), land2 = rgbOf(C['mp-land2']);
    const dim = D.dark ? 0.82 : 1;
    const heat = state.heat !== 'none' ? heatValues(L, state.heat) : null;
    const lo = rgbOf(C['mp-heat-lo']), hi = rgbOf(C['mp-heat-hi']), mid = D.dark ? HEAT_MID_DARK : HEAT_MID_LIGHT;
    for (let k = 0, n = rw * rh; k < n; k++) {
      const p = k * 4;
      if (!L.ok[k]) { o[p + 3] = 0; continue; }
      const lam = L.lam[k], phi = L.phi[k];
      let r, gg, b;
      if (useImg) {
        let u = Math.floor((lam / PI + 1) / 2 * bm.w), v = Math.floor((0.5 - phi / PI) * bm.h);
        if (u >= bm.w) u = bm.w - 1; if (u < 0) u = 0; if (v >= bm.h) v = bm.h - 1; if (v < 0) v = 0;
        const s = (v * bm.w + u) * 4;
        r = bm.data[s] * dim; gg = bm.data[s + 1] * dim; b = bm.data[s + 2] * dim;
      } else {
        let u = Math.floor((lam / PI + 1) / 2 * mask.w), v = Math.floor((0.5 - phi / PI) * mask.h);
        if (u >= mask.w) u = mask.w - 1; if (u < 0) u = 0; if (v >= mask.h) v = mask.h - 1; if (v < 0) v = 0;
        const t = Math.abs(phi) / (PI / 2);
        if (mask.data[v * mask.w + u]) {
          const ice = t > 0.68 ? Math.min(1, (t - 0.68) / 0.12) * 0.55 : 0;
          r = land[0] + (land2[0] - land[0]) * t * 0.6; gg = land[1] + (land2[1] - land[1]) * t * 0.6; b = land[2] + (land2[2] - land[2]) * t * 0.6;
          r += (240 - r) * ice; gg += (244 - gg) * ice; b += (246 - b) * ice;
        } else {
          r = sea[0] + (sea2[0] - sea[0]) * t; gg = sea[1] + (sea2[1] - sea[1]) * t; b = sea[2] + (sea2[2] - sea[2]) * t;
        }
      }
      if (heat) {
        const v = heat[k];
        if (isFinite(v)) {
          let c, a;
          if (state.heat === 'area') {           // log2 s：−2（¼ 倍）到 +4（16 倍），1 倍是中性色
            const u = Math.max(-1, Math.min(1, v >= 0 ? v / 4 : v / 2));
            c = u >= 0 ? [mid[0] + (hi[0] - mid[0]) * u, mid[1] + (hi[1] - mid[1]) * u, mid[2] + (hi[2] - mid[2]) * u]
              : [mid[0] + (lo[0] - mid[0]) * -u, mid[1] + (lo[1] - mid[1]) * -u, mid[2] + (lo[2] - mid[2]) * -u];
            a = 0.8;
          } else {                               // ω：0°（中性）到 60° 以上
            const u = Math.min(1, v / 60);
            c = [mid[0] + (hi[0] - mid[0]) * u, mid[1] + (hi[1] - mid[1]) * u, mid[2] + (hi[2] - mid[2]) * u];
            a = 0.8;
          }
          r = r * (1 - a) + c[0] * a; gg = gg * (1 - a) + c[1] * a; b = b * (1 - a) + c[2] * a;
        }
      }
      o[p] = r; o[p + 1] = gg; o[p + 2] = b; o[p + 3] = 255;
    }
    rctx.putImageData(out, 0, 0);
    raster = rc; rasterKey = key + '|' + lutKey;
    return raster;
  }
  function beginInteract() {
    interacting = true;
    clearTimeout(refineTimer);
    refineTimer = setTimeout(function () { interacting = false; requestDraw(); }, 180);
  }

  // =====================================================================
  // 幾何（投影後）的快取：海岸線、經緯網、底索指標圓
  // =====================================================================
  let cache = null;
  function circleRing(lam, phi, rad, n) {
    const out = [];
    const sf = Math.sin(phi), cf = Math.cos(phi), sr = Math.sin(rad), cr = Math.cos(rad);
    for (let i = 0; i < n; i++) {
      const az = 2 * PI * i / n;
      const f2 = Math.asin(sf * cr + cf * sr * Math.cos(az));
      const l2 = lam + Math.atan2(Math.sin(az) * sr * cf, cr - sf * Math.sin(f2));
      out.push([K.wrapPi(l2), f2]);
    }
    return out;
  }
  function geometry() {
    if (cache) return cache;
    const coast = [];
    LAND.forEach(function (poly) {
      poly.forEach(function (ring) { coast.push.apply(coast, K.projectLine(P, ring.concat([ring[0]]))); });
    });
    const grid = [], special = [];
    for (let l = -180; l <= 180; l += 15) {
      const pts = []; for (let f = -90; f <= 90; f += 1) pts.push([l * DEG, f * DEG]);
      K.projectLine(P, pts).forEach(function (s) { grid.push({ s: s, major: l === 0 }); });
    }
    for (let f = -75; f <= 75; f += 15) {
      const pts = []; for (let l = -180; l <= 180; l += 1) pts.push([l * DEG, f * DEG]);
      K.projectLine(P, pts).forEach(function (s) { grid.push({ s: s, major: f === 0 }); });
    }
    [23.44, -23.44, 66.56, -66.56].forEach(function (f) {
      const pts = []; for (let l = -180; l <= 180; l += 1) pts.push([l * DEG, f * DEG]);
      K.projectLine(P, pts).forEach(function (s) { special.push(s); });
    });
    const tis = [];
    const lats = P.family === 'azi' || P.family === 'conic' ? [-75, -60, -30, 0, 30, 60, 75] : [-60, -30, 0, 30, 60];
    lats.forEach(function (f) {
      for (let l = -165; l <= 165; l += 30) {
        const lam = l * DEG, phi = f * DEG;
        if (!P.valid(lam, phi)) continue;
        const ring = circleRing(lam, phi, 6 * DEG, 48);
        const q = K.projectRing(P, ring);
        if (q) tis.push({ q: q, c: P.forward(lam, phi) });
      }
    });
    cache = { coast: coast, grid: grid, special: special, tis: tis };
    return cache;
  }

  // =====================================================================
  // 陸塊、量測點、航線的數值
  // =====================================================================
  function shapeRing() {
    if (!state.shape) return null;
    const S = SHAPES[state.shape];
    return state.shapeAt ? K.moveRing(S.ring, S.home, state.shapeAt) : S.ring;
  }
  function shapeInfo() {
    if (!state.shape) return null;
    const S = SHAPES[state.shape], ring = shapeRing();
    const c = state.shapeAt || S.home;
    const ma = K.mapArea(P, ring);
    const af = K.mapArea(P, SHAPES.africa.ring);
    return { id: state.shape, ring: ring, lam: c[0], phi: c[1], moved: !!state.shapeAt, trueArea: S.area, mapArea: ma,
      ratio: ma != null ? ma / S.area : null, africaMap: af, vsAfrica: ma != null && af != null ? ma / af : null };
  }
  function probeInfo(pr) { return pr ? K.probeStats(P, pr.lam, pr.phi) : null; }
  function routeInfo() { return state.route ? K.routeStats(P, state.A, state.B, 128) : null; }
  /** 臺灣本島範圍內最大的比例誤差與面積誤差（核心的 taiwanError） */
  function taiwanError() { return K.taiwanError(P); }

  // =====================================================================
  // 畫地圖
  // =====================================================================
  function strokeSegs(segs, g) {
    ctx.beginPath();
    segs.forEach(function (s) { s.forEach(function (p, i) { const q = toS(p, g); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); });
    ctx.stroke();
  }
  function polyPath(q, g) {
    ctx.beginPath();
    q.forEach(function (p, i) { const s = toS(p, g); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); });
    ctx.closePath();
  }
  /** 陸塊（經度攤開成連續值）投影成平面；off = 再往東或往西移 360°（換日線另一邊的分身） */
  function projShape(ring, off) {
    if (P.family === 'azi' || P.family === 'conic') return off ? null : K.projectRing(P, ring);
    const out = [];
    let prev = null;
    for (let i = 0; i < ring.length; i++) {
      let l = P.rel(ring[i][0]);
      if (prev != null) { while (l - prev > PI) l -= 2 * PI; while (prev - l > PI) l += 2 * PI; }
      prev = l;
      const f = ring[i][1];
      if (f < P.latRange[0] - 1e-9 || f > P.latRange[1] + 1e-9) return null;
      out.push(P.raw(l + off, f));
    }
    return out;
  }
  function drawShape(g, info) {
    if (!info) return;
    const S = SHAPES[info.id];
    // 原位的虛線輪廓（搬家後才畫）
    if (info.moved) {
      [0, 2 * PI, -2 * PI].forEach(function (off) {
        const q = projShape(S.ring, off); if (!q) return;
        polyPath(q, g);
        ctx.setLineDash([5, 4]); ctx.strokeStyle = D.alpha(C['mp-shape'], 0.85); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
      });
    }
    let drawn = false;
    [0, 2 * PI, -2 * PI].forEach(function (off) {
      const q = projShape(info.ring, off); if (!q) return;
      polyPath(q, g);
      ctx.fillStyle = D.alpha(C['mp-shape'], D.dark ? 0.42 : 0.36); ctx.fill();
      ctx.strokeStyle = C['mp-shape']; ctx.lineWidth = 2; ctx.stroke();
      drawn = true;
    });
    if (!drawn) {   // 有一部分畫不出來（方位投影的背面、或超出地圖）：只畫看得到的邊
      ctx.strokeStyle = C['mp-shape']; ctx.lineWidth = 2;
      strokeSegs(K.projectLine(P, info.ring.concat([info.ring[0]])), g);
    }
  }
  function drawShapeLabel(g, info) {
    if (!info || !P.valid(info.lam, info.phi)) return;
    const s = toS(P.forward(info.lam, info.phi), g);
    const n = SHAPE_NAME[info.id];
    const txt = T(n[0], n[1]) + ' ' + (info.ratio != null ? '×' + num(info.ratio, info.ratio < 10 ? 2 : 1) : T('（超出地圖）', ' (off the map)'));
    D.pill(ctx, txt, s[0], s[1] - 4, C['mp-shape'], 'center', '600 ' + (cvSize.w < 520 ? 11 : 12) + 'px ' + FONT);
  }
  function drawRoute(g, R) {
    if (!R) return;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = D.alpha(C['canvas-bg'], 0.8); ctx.lineWidth = 5.5;
    strokeSegs(R.segR, g); strokeSegs(R.segG, g);
    ctx.setLineDash([7, 5]); ctx.strokeStyle = C['mp-rh']; ctx.lineWidth = 2.4;
    strokeSegs(R.segR, g);
    ctx.setLineDash([]); ctx.strokeStyle = C['mp-gc']; ctx.lineWidth = 2.8;
    strokeSegs(R.segG, g);
    [['A', state.A, state.cityA], ['B', state.B, state.cityB]].forEach(function (e) {
      if (!P.valid(e[1][0], e[1][1])) return;
      const s = toS(P.forward(e[1][0], e[1][1]), g);
      D.ball(ctx, s[0], s[1], 7, C['mp-gc']);
      const c = CITIES.find(function (x) { return x[0] === e[2]; });
      D.pill(ctx, e[0] + (c ? ' ' + T(c[1], c[2]) : ''), s[0] + 10, s[1] - 8, C['mp-gc'], 'left', '600 11.5px ' + FONT);
    });
  }
  function drawProbes(g) {
    state.probes.forEach(function (pr, i) {
      if (!P.valid(pr.lam, pr.phi)) return;
      const last = i === state.probes.length - 1;
      const q = K.projectRing(P, circleRing(pr.lam, pr.phi, 3 * DEG, 40));
      if (q) {
        polyPath(q, g);
        ctx.fillStyle = D.alpha(C['mp-probe'], last ? 0.3 : 0.18); ctx.fill();
        ctx.strokeStyle = C['mp-probe']; ctx.lineWidth = last ? 2 : 1.2; ctx.stroke();
      }
      const s = toS(P.forward(pr.lam, pr.phi), g);
      ctx.beginPath(); ctx.arc(s[0], s[1], last ? 3.5 : 2.5, 0, 2 * PI);
      ctx.fillStyle = C['mp-probe']; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = C['canvas-bg']; ctx.stroke();
      if (last) {
        const t = K.tissot(P, pr.lam, pr.phi);
        D.pill(ctx, 's = ' + num(t.s, t.s < 10 ? 2 : 1) + '　ω = ' + num(t.omega / DEG, 1) + '°', s[0] + 8, s[1] - 10, C['mp-probe'], 'left', '600 11.5px ' + FONT);
      }
    });
  }
  function drawMap() {
    const g = getGeom(), w = cvSize.w, h = cvSize.h;
    ctx.clearRect(0, 0, w, h);
    D.backdrop(ctx, w, h);
    // 地圖底下的柔和陰影
    ctx.save();
    ctx.shadowColor = D.shadowInk(D.dark ? 0.5 : 0.18); ctx.shadowBlur = 14; ctx.shadowOffsetY = 3;
    ctx.fillStyle = C['mp-sea'];
    ctx.fill(g.path);
    ctx.restore();
    // 影像
    const r = renderRaster();
    ctx.save();
    ctx.clip(g.path);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(r, g.ox, g.oy, g.mw, g.mh);
    const G = geometry();
    // 海岸線
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const imgOnly = state.img && bm && state.heat === 'none';
    ctx.strokeStyle = D.alpha(imgOnly ? '#ffffff' : state.heat !== 'none' ? (D.dark ? '#e6edf3' : '#2b3a36') : C['mp-coast'], imgOnly ? 0.35 : state.heat !== 'none' ? 0.7 : 0.8);
    ctx.lineWidth = imgOnly ? 0.7 : 0.9;
    strokeSegs(G.coast, g);
    // 經緯網
    if (state.grid) {
      const gridInk = state.img && bm ? '#e8f0f8' : C['mp-grid'];
      ctx.strokeStyle = D.alpha(gridInk, state.img && bm ? 0.32 : 0.28); ctx.lineWidth = 0.8;
      strokeSegs(G.grid.filter(function (x) { return !x.major; }).map(function (x) { return x.s; }), g);
      ctx.strokeStyle = D.alpha(gridInk, state.img && bm ? 0.6 : 0.55); ctx.lineWidth = 1.2;
      strokeSegs(G.grid.filter(function (x) { return x.major; }).map(function (x) { return x.s; }), g);
      ctx.setLineDash([3, 4]); ctx.strokeStyle = D.alpha(gridInk, 0.45); ctx.lineWidth = 0.9;
      strokeSegs(G.special, g); ctx.setLineDash([]);
    }
    // 底索指標圓
    if (state.tissot) {
      G.tis.forEach(function (t) {
        polyPath(t.q, g);
        if (state.heat !== 'none') {   // 著色時改成墨色空心圓，免得和紅色的變形著色混在一起
          ctx.fillStyle = D.alpha('#ffffff', D.dark ? 0.1 : 0.22); ctx.fill();
          ctx.strokeStyle = D.alpha(D.dark ? '#f1f5f9' : '#1f2a2e', 0.85); ctx.lineWidth = 1.2; ctx.stroke();
        } else {
          ctx.fillStyle = D.alpha(C['mp-tissot'], D.dark ? 0.42 : 0.36); ctx.fill();
          ctx.strokeStyle = D.alpha(C['mp-tissot'], 0.9); ctx.lineWidth = 1; ctx.stroke();
        }
      });
    }
    const info = shapeInfo();
    drawShape(g, info);
    const R = routeInfo();
    drawRoute(g, R);
    drawProbes(g);
    drawShapeLabel(g, info);
    ctx.restore();
    // 外框（立體感：外側細暗線＋內側高光）
    ctx.lineWidth = 1.6; ctx.strokeStyle = D.alpha(C['mp-frame'], 0.75); ctx.stroke(g.path);
    ctx.save(); ctx.clip(g.path); ctx.lineWidth = 3; ctx.strokeStyle = D.alpha('#ffffff', D.dark ? 0.06 : 0.35); ctx.stroke(g.path); ctx.restore();
    // 名稱
    const nm = projName(state.proj);
    D.pill(ctx, nm, 10, h - 8, C.text, 'left', '600 ' + (w < 520 ? 11 : 12.5) + 'px ' + FONT);
    if (w < 560) return;   // 窄螢幕：說明文字會壓到地圖名稱，省略
    if (state.proj === 'mercator') D.haloText(ctx, T('只畫到南北緯 85°（再往兩極就無限大）', 'Shown to 85° N and S (the poles are infinitely far)'), w - 10, h - 10, C.muted, 'right', 'alphabetic', '11px ' + FONT);
    if (state.proj === 'gnomonic') D.haloText(ctx, T('只畫到離中心 70°', 'Shown to 70° from the centre'), w - 10, h - 10, C.muted, 'right', 'alphabetic', '11px ' + FONT);
    if ((state.proj === 'lcc' && Math.abs(P.n) >= 1e-6)) D.haloText(ctx, T('遠離圓錐尖端的那一極只畫到 60°', 'The far pole is cut off at 60°'), w - 10, h - 10, C.muted, 'right', 'alphabetic', '11px ' + FONT);
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function refreshOutputs() {
    setOut(el.lam0, outNum(state.lam0, 0, 2) + '°');
    setOut(el.phiS, outNum(state.phiS, 0, 2) + '°');
    setOut(el.phi1, outNum(state.phi1, 1, 2) + '°');
    setOut(el.phi2, outNum(state.phi2, 1, 2) + '°');
    setOut(el.phi0, outNum(state.phi0, 0, 2) + '°');
    setOut(el.unroll, outNum(state.unroll, 2, 2));
    el.unroll.disabled = state.fam === 'azi' || state.fam === 'pseudo';
    $('pS').hidden = state.proj !== 'cea';
    $('pC').hidden = state.fam !== 'conic';
    $('pA').hidden = state.fam !== 'azi';
    document.querySelectorAll('#famSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-fam') === state.fam)); });
    document.querySelectorAll('#projList button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-proj') === state.proj)); });
    $('tImg').setAttribute('aria-pressed', String(state.img));
    $('tGrid').setAttribute('aria-pressed', String(state.grid));
    $('tTissot').setAttribute('aria-pressed', String(state.tissot));
    $('tRoute').setAttribute('aria-pressed', String(state.route));
    document.querySelectorAll('#heatSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-heat') === state.heat)); });
    document.querySelectorAll('#shapeBtns button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-shape') === state.shape)); });
    $('selA').value = state.cityA; $('selB').value = state.cityB;
  }
  // 十四個投影按鈕都放在頁面上，只顯示目前這一類（文字隨語言重建）
  function buildProjList() {
    const box = $('projList');
    if (!box.children.length || box.getAttribute('data-lang') !== T('zh', 'en')) {
      box.innerHTML = '';
      box.setAttribute('data-lang', T('zh', 'en'));
      Object.keys(FAMILIES).forEach(function (fam) {
        FAMILIES[fam].forEach(function (id) {
          const b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('data-proj', id);
          const n = PROJ_NAME[id];
          b.innerHTML = T(n[0], n[1]) + '<small>' + T(n[2], n[3]) + '</small>';
          b.addEventListener('click', function () { selectProj(id); });
          box.appendChild(b);
        });
      });
    }
    Array.prototype.forEach.call(box.children, function (b) {
      const id = b.getAttribute('data-proj');
      b.hidden = K.BY_ID[id].family !== state.fam;
      b.setAttribute('aria-pressed', String(id === state.proj));
    });
  }
  let lastSay = 0;
  function updateReadouts() {
    const pi = PROJ_NAME[state.proj], prop = K.BY_ID[state.proj].prop, pn = PROP_NAME[prop];
    setHTML('propLine', '<b>' + T(pi[0], pi[1]) + '</b>　' + T(pn[0], pn[1]));
    // 陸塊
    const S = shapeInfo();
    if (S) {
      setHTML('rShC', latText(S.phi) + ' ' + lonText(S.lam) + (S.moved ? '' : T('（原位）', ' (in place)')));
      setHTML('rShT', areaText(S.trueArea));
      setHTML('rShM', S.mapArea != null ? areaText(S.mapArea) : T('有一部分不在地圖上', 'partly off the map'));
      setHTML('rShR', S.ratio != null ? '×' + num(S.ratio, S.ratio < 10 ? 3 : 2) : '—');
      setHTML('rShA', S.vsAfrica != null ? (state.shape === 'africa' && !S.moved ? '—' : num(S.vsAfrica, 3) + T(' 倍', '×') + T('（真實是 ', ' (really ') + num(S.trueArea / SHAPES.africa.area, 3) + T(' 倍）', '×)')) : '—');
    } else {
      ['rShC', 'rShT', 'rShM', 'rShR', 'rShA'].forEach(function (id) { setHTML(id, '—'); });
    }
    // 量測點
    const pr = probeInfo(state.probes[state.probes.length - 1]);
    $('rDistT').hidden = $('rDist').hidden = state.fam !== 'azi';
    if (pr) {
      setHTML('rPos', latText(pr.phi) + ' ' + lonText(pr.lam));
      if (pr.visible) {
        setHTML('rH', num(pr.h, 4)); setHTML('rK', num(pr.k, 4));
        setHTML('rS', '×' + num(pr.s, pr.s < 10 ? 4 : 2));
        setHTML('rW', num(pr.omega, 2) + '°');
        setHTML('rDist', pr.dist != null ? grp(pr.dist) + ' km，' + T('方位 ', 'bearing ') + num(pr.az, 1) + '°' : '—');
      } else ['rH', 'rK', 'rS', 'rW', 'rDist'].forEach(function (id) { setHTML(id, T('不在這張地圖上', 'not on this map')); });
    } else ['rPos', 'rH', 'rK', 'rS', 'rW', 'rDist'].forEach(function (id) { setHTML(id, '—'); });
    // 航線
    const R = routeInfo();
    if (R) {
      setHTML('rGc', grp(R.gc) + ' km');
      setHTML('rRh', grp(R.rh) + ' km' + (R.gc > 1 ? T('（多 ', ' (') + num((R.rh / R.gc - 1) * 100, 1) + T('%）', '% longer)') : ''));
      setHTML('rGcB', bearingText(R.gcB * DEG));
      setHTML('rRhB', bearingText(R.rhB * DEG));
      const sg = R.strG != null && R.strG < 2e-3, sr = R.strR != null && R.strR < 2e-3;
      setHTML('rStr', sg && sr ? T('兩條都是直線（重合）', 'both (they coincide)') : sg ? T('大圓（綠色實線）', 'the great circle (solid green)') : sr ? T('等角航線（橙色虛線）', 'the rhumb line (dashed orange)') : T('兩條都不是直線', 'neither'));
    } else ['rGc', 'rRh', 'rGcB', 'rRhB', 'rStr'].forEach(function (id) { setHTML(id, '—'); });
    // 臺灣的變形（圓錐）
    const tw = taiwanError();
    setHTML('twHint', tw ? T('臺灣本島（北緯 21.9°–25.3°）範圍內：比例誤差最大 <b>', 'Over Taiwan (21.9°–25.3° N): largest scale error <b>') + num(tw.scale * 100, 3) + '%</b>' + T('，面積誤差最大 <b>', ', largest area error <b>') + num(tw.area * 100, 3) + '%</b>' + T('。', '.') : '—');
    // 變形著色的圖例
    $('heatKey').hidden = state.heat === 'none';
    if (state.heat !== 'none') {
      const lo = C['mp-heat-lo'], hi = C['mp-heat-hi'], m = D.dark ? HEAT_MID_DARK : HEAT_MID_LIGHT, mid = 'rgb(' + m.join(',') + ')';
      $('heatBar').style.background = state.heat === 'area' ? 'linear-gradient(90deg,' + lo + ',' + mid + ' 33%,' + hi + ')' : 'linear-gradient(90deg,' + mid + ',' + hi + ')';
      setHTML('heatLo', state.heat === 'area' ? T('¼ 倍', '¼×') : '0°');
      setHTML('heatHi', state.heat === 'area' ? T('16 倍以上（中間色＝1 倍，沒有變形）', '16× or more (middle colour = 1×, no distortion)') : T('60° 以上', '60° or more'));
    }
    const txt = projName(state.proj) + (pr && pr.visible ? T('；量測點面積倍率 ', '; measuring point area scale ') + num(pr.s, 2) + T('、角度變形 ', ', angle distortion ') + num(pr.omega, 1) + '°' : '') +
      (S && S.ratio != null ? T('；', '; ') + T(SHAPE_NAME[S.id][0], SHAPE_NAME[S.id][1]) + T(' 放大 ', ' enlarged ') + num(S.ratio, 2) + T(' 倍', '×') : '');
    const tn = performance.now();
    if ($('srNow').textContent !== txt && tn - lastSay > 1200) { $('srNow').textContent = txt; lastSay = tn; }
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function setStatus(s) { $('status').innerHTML = s; }
  function snapshot() {
    return K.snapshot(P, {
      proj: state.proj, lam0: state.lam0, phiS: state.phiS, phi1: state.phi1, phi2: state.phi2, phi0: state.phi0,
      img: state.img, grid: state.grid, tissot: state.tissot, heat: state.heat, unroll: state.unroll, view: view3 && view3.active ? '3d' : '2d',
      shape: state.shape, shapeAt: state.shapeAt, probes: state.probes,
      route: state.route, A: state.A, B: state.B, cityA: state.cityA, cityB: state.cityB
    }, SHAPES);
  }
  let lastEmit = 0, emitTimer = 0;
  function afterChange(force) {
    updateReadouts();
    requestDraw();
    const tNow = performance.now();
    clearTimeout(emitTimer);
    if (force || tNow - lastEmit > 220) { lastEmit = tNow; emit('map', snapshot()); }
    else emitTimer = setTimeout(function () { lastEmit = performance.now(); emit('map', snapshot()); }, 240);
    if (view3 && view3.active) view3.onMap();
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  function setSlider(inp, v) { if (window.LabNum) window.LabNum.set(inp, v); else inp.value = v; }
  // 拖曳地圖時連續改中心：不觸發滑桿事件（由呼叫者自己更新），避免每一步都重算好幾次
  function setQuiet(inp, v) { if (window.LabNum && window.LabNum.clear) window.LabNum.clear(inp); inp.value = String(v); }
  function selectProj(id, quiet) {
    acted();
    state.proj = id; state.fam = K.BY_ID[id].family; state.lastOf[state.fam] = id;
    makeProj(); beginInteract();
    buildProjList(); refreshOutputs();
    if (!quiet) {
      const n = PROJ_NAME[id], pn = PROP_NAME[K.BY_ID[id].prop];
      setStatus(T('換成「' + n[0] + '」投影：' + pn[0] + '。', 'Switched to the ' + n[1] + ' projection. ' + pn[1] + '.'));
    }
    afterChange(true);
  }
  document.querySelectorAll('#famSeg button').forEach(function (b) {
    b.addEventListener('click', function () { const f = b.getAttribute('data-fam'); if (f !== state.fam) { state.fam = f; selectProj(state.lastOf[f]); } });
  });
  ['lam0', 'phiS', 'phi1', 'phi2', 'phi0'].forEach(function (k) {
    el[k].addEventListener('input', function () { acted(); readSliders(); makeProj(); beginInteract(); refreshOutputs(); afterChange(); });
    el[k].addEventListener('change', function () { readSliders(); makeProj(); refreshOutputs(); afterChange(true); });
  });
  el.unroll.addEventListener('input', function () { acted(); readSliders(); refreshOutputs(); if (view3 && view3.active) view3.onUnroll(); emitSoon(); });
  el.unroll.addEventListener('change', function () { readSliders(); refreshOutputs(); if (view3 && view3.active) view3.onUnroll(); emit('map', snapshot()); });
  function emitSoon() { clearTimeout(emitTimer); emitTimer = setTimeout(function () { emit('map', snapshot()); }, 200); }
  function toggle(btn, key) {
    $(btn).addEventListener('click', function () { acted(); state[key] = !state[key]; refreshOutputs(); afterChange(true); });
  }
  toggle('tImg', 'img'); toggle('tGrid', 'grid'); toggle('tTissot', 'tissot');
  $('tRoute').addEventListener('click', function () {
    acted(); state.route = !state.route; refreshOutputs();
    if (state.route) setStatus(T('綠色實線是大圓（最短的路），橙色虛線是等角航線（一路保持同一個羅盤方向）。', 'Solid green: the great circle (shortest path). Dashed orange: the rhumb line (one compass bearing all the way).'));
    afterChange(true);
  });
  document.querySelectorAll('#heatSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); state.heat = b.getAttribute('data-heat'); refreshOutputs(); afterChange(true); });
  });
  document.querySelectorAll('#shapeBtns button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      const id = b.getAttribute('data-shape');
      state.shape = id; state.shapeAt = null;
      refreshOutputs();
      const n = SHAPE_NAME[id];
      setStatus(T('紫色是' + n[0] + '的真實輪廓。在地圖上拖曳它，看它到別的緯度會變多大。', 'The purple outline is ' + n[1] + '. Drag it on the map and see how big it looks at other latitudes.'));
      afterChange(true);
    });
  });
  $('shapeHome').addEventListener('click', function () { if (!state.shape) return; acted(); state.shapeAt = null; afterChange(true); });
  $('shapeOff').addEventListener('click', function () { acted(); state.shape = null; state.shapeAt = null; refreshOutputs(); afterChange(true); });
  // 城市選單
  ['selA', 'selB'].forEach(function (id) {
    const s = $(id);
    function fill() {
      const v = s.value;
      s.innerHTML = '';
      CITIES.forEach(function (c) { const o = document.createElement('option'); o.value = c[0]; o.textContent = T(c[1], c[2]); s.appendChild(o); });
      const o = document.createElement('option'); o.value = 'custom'; o.textContent = T('（在地圖上拖曳的位置）', '(position dragged on the map)'); s.appendChild(o);
      s.value = v || (id === 'selA' ? state.cityA : state.cityB);
    }
    fill();
    s.addEventListener('lab:refill', fill);
    s.addEventListener('change', function () {
      acted();
      const c = CITIES.find(function (x) { return x[0] === s.value; });
      if (!c) { s.value = id === 'selA' ? state.cityA : state.cityB; return; }
      const p = [c[4] * DEG, c[3] * DEG];
      if (id === 'selA') { state.A = p; state.cityA = c[0]; } else { state.B = p; state.cityB = c[0]; }
      if (!state.route) state.route = true;
      refreshOutputs(); afterChange(true);
    });
  });
  $('clear').addEventListener('click', function () {
    state.probes = []; state.shapeAt = null; state.shape = null; state.route = false;
    refreshOutputs();
    setStatus(T('已清除量測點、航線與陸塊。', 'Measuring points, route and landmass cleared.'));
    afterChange(true);
  });

  // ---------- 在地圖上拖曳與點擊 ----------
  let drag = null;
  function ptr(ev) { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function insidePoly(x, y, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function hitShape(x, y) {
    if (!state.shape) return false;
    const g = getGeom(), ring = shapeRing();
    return [0, 2 * PI, -2 * PI].some(function (off) {
      const q = projShape(ring, off); if (!q) return false;
      return insidePoly(x, y, q.map(function (p) { return toS(p, g); }));
    });
  }
  function hitEnd(x, y) {
    if (!state.route) return null;
    const g = getGeom();
    let best = null, bd = cvSize.w < 520 ? 22 : 16;
    [['A', state.A], ['B', state.B]].forEach(function (e) {
      if (!P.valid(e[1][0], e[1][1])) return;
      const s = toS(P.forward(e[1][0], e[1][1]), g), d = Math.hypot(s[0] - x, s[1] - y);
      if (d < bd) { bd = d; best = e[0]; }
    });
    return best;
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (ev.button > 0) return;
    const q = ptr(ev);
    const end = hitEnd(q[0], q[1]);
    if (end) drag = { kind: 'end', which: end };
    else if (hitShape(q[0], q[1])) {
      const ll = invAt(q[0], q[1]);
      const c = state.shapeAt || SHAPES[state.shape].home;
      drag = ll ? { kind: 'shape', off: [K.wrapPi(c[0] - ll[0]), c[1] - ll[1]] } : null;
    } else drag = { kind: 'map', x0: q[0], y0: q[1], lam0: state.lam0, phi0: state.phi0, moved: false };
    if (drag) { cv.setPointerCapture(ev.pointerId); cv.classList.add('dragging'); ev.preventDefault(); }
  });
  cv.addEventListener('pointermove', function (ev) {
    const q = ptr(ev);
    if (!drag) {
      cv.style.cursor = hitEnd(q[0], q[1]) || hitShape(q[0], q[1]) ? 'move' : '';
      return;
    }
    if (drag.kind === 'map') {
      const dx = q[0] - drag.x0, dy = q[1] - drag.y0;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      acted();
      const g = getGeom();
      const perDeg = g.sc * DEG * (P.family === 'azi' ? 1 : (P.family === 'conic' ? Math.max(0.3, Math.abs(P.n || 1)) : 1)) * (P.family === 'cyl' && state.proj === 'cea' ? Math.cos(state.phiS * DEG) : 1);
      let l = drag.lam0 - dx / (perDeg || 1);
      l = ((l + 180) % 360 + 360) % 360 - 180;
      setQuiet(el.lam0, Math.round(l));
      if (P.family === 'azi') setQuiet(el.phi0, Math.max(-90, Math.min(90, Math.round(drag.phi0 + dy / (g.sc * DEG)))));
      readSliders(); makeProj(); beginInteract(); refreshOutputs(); afterChange();
      return;
    }
    const ll = invAt(q[0], q[1]);
    if (!ll) return;
    acted(); beginInteract();
    if (drag.kind === 'shape') {
      const lat = Math.max(-80 * DEG, Math.min(80 * DEG, ll[1] + drag.off[1]));
      state.shapeAt = [K.wrapPi(ll[0] + drag.off[0]), lat];
    } else {
      if (drag.which === 'A') { state.A = ll; state.cityA = 'custom'; } else { state.B = ll; state.cityB = 'custom'; }
      refreshOutputs();
    }
    afterChange();
  });
  function endDrag(ev) {
    if (!drag) return;
    const d = drag; drag = null;
    cv.classList.remove('dragging');
    if (d.kind === 'map' && !d.moved) {
      const q = ptr(ev), ll = invAt(q[0], q[1]);
      if (ll) {
        acted();
        state.probes.push({ lam: ll[0], phi: ll[1] });
        if (state.probes.length > MAX_PROBES) state.probes.shift();
        const t = K.tissot(P, ll[0], ll[1]);
        setStatus(T('量測點 ', 'Point at ') + latText(ll[1]) + ' ' + lonText(ll[0]) + T('：面積放大 ', ': areas enlarged ') + num(t.s, 3) + T(' 倍，角度最多改變 ', '×, angles changed by up to ') + num(t.omega / DEG, 1) + '°' + T('。', '.'));
      }
    } else if (d.kind === 'shape' && state.shapeAt) {
      const S = shapeInfo();
      if (S && S.ratio != null) setStatus(T(SHAPE_NAME[S.id][0] + '搬到 ', SHAPE_NAME[S.id][1] + ' moved to ') + latText(S.phi) + T('：在這張地圖上看起來是真實的 ', ': on this map it looks ') + num(S.ratio, 2) + T(' 倍大。', ' times its real size.'));
    }
    interacting = false;
    afterChange(true);
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', function () { drag = null; cv.classList.remove('dragging'); interacting = false; requestDraw(); });

  // ---------- 鍵盤 ----------
  if (window.LabKeys) {
    const moveLL = function (p, dx, dy, big, fine) { const s = (fine ? (big ? 2 : 0.2) : (big ? 5 : 1)) * DEG; return [K.wrapPi(p[0] + dx * s), Math.max(-89 * DEG, Math.min(89 * DEG, p[1] - dy * s))]; };
    window.LabKeys.attach(cv, {
      label: T('世界地圖。方向鍵轉動地圖；Enter 換成移動陸塊、量測點或航線端點。', 'World map. Arrow keys turn the map; Enter switches to moving the landmass, the measuring point or a route end.'),
      items: [{
        name: function () { return T('地圖中心', 'Map centre'); },
        move: function (dx, dy, big) {
          acted();
          let l = state.lam0 + dx * (big ? 10 : 1); l = ((l + 180) % 360 + 360) % 360 - 180;
          setQuiet(el.lam0, l);
          if (P.family === 'azi' && dy) setQuiet(el.phi0, Math.max(-90, Math.min(90, state.phi0 - dy * (big ? 10 : 1))));
          readSliders(); makeProj(); refreshOutputs(); afterChange(true); return true;
        },
        describe: function () { return T('中央經線 ', 'Central meridian ') + num(state.lam0, 0) + '°' + (P.family === 'azi' ? T('，中心緯度 ', ', centre latitude ') + num(state.phi0, 0) + '°' : ''); }
      }, {
        name: function () { return T('陸塊', 'Landmass'); },
        move: function (dx, dy, big) {
          if (!state.shape) return false;
          acted(); state.shapeAt = moveLL(state.shapeAt || SHAPES[state.shape].home, dx, dy, big, true);
          state.shapeAt[1] = Math.max(-80 * DEG, Math.min(80 * DEG, state.shapeAt[1]));
          afterChange(true); return true;
        },
        describe: function () { const S = shapeInfo(); return S ? T(SHAPE_NAME[S.id][0], SHAPE_NAME[S.id][1]) + ' ' + latText(S.phi) + ' ' + lonText(S.lam) + T('，放大 ', ', enlarged ') + num(S.ratio, 2) + T(' 倍', '×') : T('還沒有選陸塊', 'no landmass chosen'); }
      }, {
        name: function () { return T('量測點', 'Measuring point'); },
        move: function (dx, dy, big) {
          if (!state.probes.length) return false;
          acted(); const p = state.probes[state.probes.length - 1]; const m = moveLL([p.lam, p.phi], dx, dy, big, true);
          p.lam = m[0]; p.phi = m[1]; afterChange(true); return true;
        },
        describe: function () { const pr = probeInfo(state.probes[state.probes.length - 1]); return pr && pr.visible ? latText(pr.phi) + ' ' + lonText(pr.lam) + T('，面積倍率 ', ', area scale ') + num(pr.s, 3) + T('，角度變形 ', ', angle distortion ') + num(pr.omega, 1) + '°' : T('還沒有量測點（點一下地圖）', 'no measuring point yet (tap the map)'); }
      }, {
        name: function () { return T('航線起點 A', 'Route start A'); },
        move: function (dx, dy, big) { if (!state.route) return false; acted(); state.A = moveLL(state.A, dx, dy, big); state.cityA = 'custom'; refreshOutputs(); afterChange(true); return true; },
        describe: function () { return 'A ' + latText(state.A[1]) + ' ' + lonText(state.A[0]); }
      }, {
        name: function () { return T('航線終點 B', 'Route end B'); },
        move: function (dx, dy, big) { if (!state.route) return false; acted(); state.B = moveLL(state.B, dx, dy, big); state.cityB = 'custom'; refreshOutputs(); afterChange(true); return true; },
        describe: function () { const R = routeInfo(); return 'B ' + latText(state.B[1]) + ' ' + lonText(state.B[0]) + (R ? T('，大圓距離 ', ', great-circle distance ') + grp(R.gc) + ' km' : ''); }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // ---------- 分享：投影、圖層、陸塊位置、量測點、航線 ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      const r2 = function (v) { return Math.round(v / DEG * 100) / 100; };
      return { p: state.proj, im: state.img ? 1 : 0, gr: state.grid ? 1 : 0, ti: state.tissot ? 1 : 0, ht: state.heat,
        sh: state.shape, at: state.shapeAt ? [r2(state.shapeAt[0]), r2(state.shapeAt[1])] : null,
        pr: state.probes.map(function (p) { return [r2(p.lam), r2(p.phi)]; }),
        ro: state.route ? 1 : 0, A: [r2(state.A[0]), r2(state.A[1])], B: [r2(state.B[0]), r2(state.B[1])], ca: state.cityA, cb: state.cityB };
    },
    set: function (o) {
      if (!o) return;
      const ll = function (a) { return Array.isArray(a) && a.length === 2 && isFinite(a[0]) && isFinite(a[1]) ? [K.wrapPi(a[0] * DEG), Math.max(-PI / 2, Math.min(PI / 2, a[1] * DEG))] : null; };
      if (K.BY_ID[o.p]) { state.proj = o.p; state.fam = K.BY_ID[o.p].family; state.lastOf[state.fam] = o.p; }
      state.img = o.im !== 0; state.grid = o.gr !== 0; state.tissot = o.ti !== 0;
      if (['none', 'area', 'angle'].indexOf(o.ht) >= 0) state.heat = o.ht;
      state.shape = SHAPES[o.sh] ? o.sh : null; state.shapeAt = state.shape ? ll(o.at) : null;
      state.probes = Array.isArray(o.pr) ? o.pr.slice(-MAX_PROBES).map(ll).filter(Boolean).map(function (p) { return { lam: p[0], phi: p[1] }; }) : [];
      state.route = o.ro === 1;
      const a = ll(o.A), b = ll(o.B); if (a) state.A = a; if (b) state.B = b;
      state.cityA = typeof o.ca === 'string' ? o.ca : 'custom'; state.cityB = typeof o.cb === 'string' ? o.cb : 'custom';
      readSliders(); makeProj(); buildProjList(); refreshOutputs(); updateReadouts(); requestDraw();
    }
  });

  // =====================================================================
  // 繪圖迴圈
  // =====================================================================
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(loop); }
  function loop(tnow) {
    raf = 0;
    let busy = false;
    if (view3 && view3.active) { view3.frame(tnow); busy = view3.busy(); }
    else drawMap();
    if (busy || interacting) raf = requestAnimationFrame(loop);
  }

  // =====================================================================
  // 3D 檢視（切換時才載入 three.js 與 map-projection-3d.js）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  // 給 3D 用的地圖貼圖：等距圓柱的影像（或平面色）＋經緯網，畫在 2048×1024 的畫布上
  function mapTexture(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (state.img && bm) g.drawImage(bm.img, 0, 0, w, h);
    else {
      const id = g.createImageData(w, h), o = id.data;
      const sea = rgbOf(C['mp-sea']), land = rgbOf(C['mp-land']);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const u = Math.floor(i / w * mask.w), v = Math.floor(j / h * mask.h), k = (j * w + i) * 4;
        const L = mask.data[v * mask.w + u] ? land : sea;
        o[k] = L[0]; o[k + 1] = L[1]; o[k + 2] = L[2]; o[k + 3] = 255;
      }
      g.putImageData(id, 0, 0);
    }
    if (state.grid) {
      g.strokeStyle = 'rgba(235,242,250,0.55)'; g.lineWidth = Math.max(1, w / 1400);
      for (let l = -180; l <= 180; l += 15) { const x = (l + 180) / 360 * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let f = -75; f <= 75; f += 15) { const y = (90 - f) / 180 * h; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    }
    return c;
  }
  const bridge = {
    K: K, T: T, D: D, state: state, colors: function () { return C; }, reducedMotion: reducedMotion,
    proj: function () { return P; }, num: num,
    hasImage: function () { return !!bm; }, projName: function () { return projName(state.proj); },
    flatMap: function () { drawMap(); return { canvas: cv, geom: getGeom(), raster: renderRaster() }; },
    mapTexture: mapTexture,
    shapeRing: shapeRing, probes: function () { return state.probes; }, route: routeInfo,
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
      if (window.MapProjection3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.MapProjection3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/map-projection-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.MapProjection3D) throw new Error('map-projection-3d.js did not load');
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
      viewMsg.textContent = T('正在載入 3D 地球…', 'Loading the 3D globe…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        view3 = window.MapProjection3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        updateViewNotes();
        requestAnimationFrame(function () { if (view3) { view3.onShow(); requestDraw(); } });
        requestDraw();
        emit('map', snapshot());
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
      fit(); requestDraw();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    setPressed('2d');
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 地圖。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D map is kept.');
    updateViewNotes();
    fit(); requestDraw();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  ['Side', 'Top'].forEach(function (k) {
    $('cam' + k).addEventListener('click', function () { if (view3) { view3.camTo(k.toLowerCase()); bridge.onCam(k.toLowerCase()); } });
  });

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  buildMask();
  readSliders();
  makeProj();
  buildProjList();
  refreshOutputs();
  updateReadouts();
  function themeChanged() {
    readColors(); rasterKey = ''; raster = null;
    buildProjList(); refreshOutputs();
    ['selA', 'selB'].forEach(function (id) { $(id).dispatchEvent(new Event('lab:refill')); });
    $('selA').value = state.cityA; $('selB').value = state.cityB;
    updateReadouts();
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lh = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lw || cv.clientHeight !== lh) { lw = cv.clientWidth; lh = cv.clientHeight; if (lw > 0) { fit(); requestDraw(); } }
    }).observe(stage);
  } else window.addEventListener('resize', function () { fit(); requestDraw(); });
  fit();
  loadBlueMarble();
  setStatus(T('這是麥卡托地圖。紅色的圓在地球上都一樣大——看看它們在高緯度變成多大。', 'This is the Mercator map. The red circles are all the same size on the globe — see how big they get at high latitudes.'));
  requestDraw();
  // 測試用（Playwright）
  window.__mp = { state: state, K: K, snapshot: snapshot, selectProj: selectProj, setView: setView,
    probe: function (latDeg, lonDeg) { acted(); state.probes.push({ lam: lonDeg * DEG, phi: latDeg * DEG }); if (state.probes.length > MAX_PROBES) state.probes.shift(); afterChange(true); },
    shapeTo: function (id, latDeg, lonDeg) { acted(); state.shape = id; state.shapeAt = latDeg == null ? null : [lonDeg * DEG, latDeg * DEG]; refreshOutputs(); afterChange(true); },
    redraw: function () { interacting = false; rasterKey = ''; drawMap(); } };
})();
