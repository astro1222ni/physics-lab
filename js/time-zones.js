/* time-zones.js — 「經緯度、時區與換日線」的畫面與互動
 * 數學全部在 time-zones-core.js；海岸線在 geog-world.js；3D 地球儀在 time-zones-3d.js（切換到 3D 時才載入）。 */
(function () {
  'use strict';
  const K = window.TimeZoneCore;
  const WORLD = window.GeogWorld;
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
  const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DIR8 = [['北', 'N'], ['東北', 'NE'], ['東', 'E'], ['東南', 'SE'], ['南', 'S'], ['西南', 'SW'], ['西', 'W'], ['西北', 'NW']];
  const DEF = { day: 317, utc: 0, probe: { lon: 121.56, lat: 25.03, city: 'taipei' }, dep: 'taipei', arr: 'newyork', dur: 15.25 };
  const SPEEDS = { min: 1 / 6, hour: 1 };                    // 每秒前進幾小時；day 模式是每秒 10 天、時刻不變

  const state = {
    day: DEF.day, utc: DEF.utc, center: 0,
    zones: true, night: true, dates: true, cities: true,
    probe: Object.assign({}, DEF.probe), dep: DEF.dep, arr: DEF.arr, dur: DEF.dur,
    playing: false, speed: 'hour', flying: null, flights: [], lastFlight: null, acted: false
  };

  // ---------- 文字格式 ----------
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    const s = v.toFixed(d == null ? 0 : d);
    return s === '-0' || /^-0\.0*$/.test(s) ? s.slice(1) : s;
  }
  function signed(v, d) { const s = num(Math.abs(v), d); return (v < 0 && s !== num(0, d) ? '−' : '+') + s; }
  function hm(h) {
    let m = Math.round(h * 60);
    m = ((m % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  function dur(h) {
    const m = Math.round(Math.abs(h) * 60), H = Math.floor(m / 60), M = m % 60;
    return T((H ? H + ' 小時' : '') + (M || !H ? (H ? ' ' : '') + M + ' 分' : ''), (H ? H + ' h' : '') + (M || !H ? (H ? ' ' : '') + M + ' min' : ''));
  }
  function dateTxt(day) {
    const d = K.dateOf(day);
    const pre = d.y < 0 ? T('去年 ', '') : d.y > 0 ? T('明年 ', '') : '';
    const post = d.y < 0 ? T('', ' (last year)') : d.y > 0 ? T('', ' (next year)') : '';
    return pre + T(d.m + '月' + d.d + '日', MONTH_EN[d.m - 1] + ' ' + d.d) + post;
  }
  function offTxt(o) {
    if (Math.abs(o) < 1e-9) return 'UTC±0';
    const a = Math.abs(o), h = Math.floor(a + 1e-9), m = Math.round((a - h) * 60);
    return 'UTC' + (o < 0 ? '−' : '+') + h + (m ? ':' + String(m).padStart(2, '0') : '');
  }
  function latTxt(v) { return num(Math.abs(v), 1) + '°' + (v >= 0 ? 'N' : 'S'); }
  function lonTxt(v) { const x = K.n180(v); return num(Math.abs(x), 1) + '°' + (x >= 0 ? 'E' : 'W'); }
  function cityName(c) { return c ? T(c.zh, c.en) : ''; }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function setStatus(s) { $('status').innerHTML = s; }

  // ---------- 顏色 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--tz-ocean', '--tz-ocean2', '--tz-land', '--tz-land2', '--tz-coast', '--tz-grid', '--tz-night', '--tz-dateA', '--tz-dateB', '--tz-dateline',
      '--tz-midnight', '--tz-sun', '--tz-probe', '--tz-flight', '--tz-city', '--text', '--muted', '--border', '--surface', '--bg', '--accent']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }

  // =====================================================================
  // 畫布與地圖座標（等距圓柱：經度 → x、緯度 → y，可選中央經線 0° 或 150°E）
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let cvSize = { w: 600, h: 300, dpr: 1 };
  function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || 600, h = cv.clientHeight || Math.round(w / 2);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cvSize = { w: w, h: h, dpr: dpr };
    baseKey = '';
  }
  function X(lon) { return (K.n180(lon - state.center) + 180) / 360 * cvSize.w; }
  function Y(lat) { return (90 - lat) / 180 * cvSize.h; }
  function fromXY(x, y) {
    return { lon: K.n180(x / cvSize.w * 360 - 180 + state.center), lat: Math.max(-89.9, Math.min(89.9, 90 - y / cvSize.h * 180)) };
  }

  // 底圖（海洋、經緯網、陸地）：以中央經線 0° 畫一次，換中央經線時平移貼上
  let base = null, baseKey = '';
  function buildBase() {
    const key = [cvSize.w, cvSize.h, cvSize.dpr, D.ver, D.dark].join('|');
    if (key === baseKey && base) return base;
    baseKey = key;
    const w = cvSize.w, h = cvSize.h, dpr = cvSize.dpr;
    base = base || document.createElement('canvas');
    base.width = Math.round(w * dpr); base.height = Math.round(h * dpr);
    const g = base.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const oc = g.createLinearGradient(0, 0, 0, h);
    oc.addColorStop(0, C['tz-ocean2']); oc.addColorStop(0.5, C['tz-ocean']); oc.addColorStop(1, C['tz-ocean2']);
    g.fillStyle = oc; g.fillRect(0, 0, w, h);
    const x0 = function (lon) { return (lon + 180) / 360 * w; };
    // 陸地：先畫一層淡淡的陰影，再填色、描海岸
    const lg = g.createLinearGradient(0, 0, 0, h);
    lg.addColorStop(0, C['tz-land2']); lg.addColorStop(0.5, C['tz-land']); lg.addColorStop(1, C['tz-land2']);
    const path = new Path2D();
    WORLD.land.forEach(function (poly) {
      poly.forEach(function (ring) {
        const pts = WORLD.decode(ring);
        pts.forEach(function (p, i) { const x = x0(p[0]), y = Y(p[1]); if (i) path.lineTo(x, y); else path.moveTo(x, y); });
        path.closePath();
      });
    });
    g.save();
    g.shadowColor = D.dark ? 'rgba(0,0,0,0.55)' : 'rgba(40,60,80,0.28)'; g.shadowBlur = 5; g.shadowOffsetY = 1.5;
    g.fillStyle = lg; g.fill(path, 'evenodd');
    g.restore();
    g.strokeStyle = D.alpha(C['tz-coast'], 0.8); g.lineWidth = 0.7; g.stroke(path);
    // 經緯網：每 30°
    g.strokeStyle = D.alpha(C['tz-grid'], D.dark ? 0.28 : 0.32); g.lineWidth = 0.6;
    g.beginPath();
    for (let lat = -60; lat <= 60; lat += 30) { g.moveTo(0, Y(lat)); g.lineTo(w, Y(lat)); }
    g.stroke();
    return base;
  }
  function drawBase(c) {
    const b = buildBase(), w = cvSize.w, h = cvSize.h;
    let sx = -state.center / 360 * w;
    sx = ((sx % w) + w) % w;
    c.drawImage(b, 0, 0, b.width, b.height, sx - w, 0, w, h);
    c.drawImage(b, 0, 0, b.width, b.height, sx, 0, w, h);
  }

  // 黑夜：低解析度的影像逐格算太陽仰角，再放大（平滑）貼上
  const NW = 360, NH = 180;
  const night = document.createElement('canvas'); night.width = NW; night.height = NH;
  const nctx = night.getContext('2d');
  const nimg = nctx.createImageData(NW, NH);
  const sinLat = new Float32Array(NH), cosLat = new Float32Array(NH);
  for (let j = 0; j < NH; j++) { const f = (90 - (j + 0.5)) * K.DEG; sinLat[j] = Math.sin(f); cosLat[j] = Math.cos(f); }
  const cosH = new Float32Array(NW);
  function buildNight() {
    const s = K.sun(state.day, state.utc), sd = Math.sin(s.dec * K.DEG), cd = Math.cos(s.dec * K.DEG);
    for (let i = 0; i < NW; i++) {
      const lon = K.n180((i + 0.5) / NW * 360 - 180 + state.center);
      cosH[i] = Math.cos(K.hourAngle(lon, state.utc, s.eot) * K.DEG);
    }
    const rgb = D.rgb(C['tz-night']), A = D.dark ? 0.72 : 0.6, data = nimg.data;
    for (let j = 0; j < NH; j++) {
      const a1 = sinLat[j] * sd, a2 = cosLat[j] * cd;
      for (let i = 0; i < NW; i++) {
        const alt = Math.asin(Math.max(-1, Math.min(1, a1 + a2 * cosH[i]))) / K.DEG;
        const k = (j * NW + i) * 4;
        // 晨昏線附近 ±0.8° 漸變（反鋸齒），之後隨曙暮光越來越暗
        const edge = Math.max(0, Math.min(1, (K.H0 + 0.8 - alt) / 1.6));
        const a = A * (0.3 * edge + 0.7 * Math.max(0, Math.min(1, (K.H0 - alt) / 17)));
        data[k] = rgb[0]; data[k + 1] = rgb[1]; data[k + 2] = rgb[2]; data[k + 3] = Math.round(a * 255);
      }
    }
    nctx.putImageData(nimg, 0, 0);
    return s;
  }

  // =====================================================================
  // 繪圖
  // =====================================================================
  function seamPath(c, pts, f) {
    // pts：[[lon, lat], …]；跨過地圖左右邊界時斷開
    let px = null;
    c.beginPath();
    pts.forEach(function (p) {
      const x = X(p[0]), y = Y(p[1]);
      if (px == null || Math.abs(x - px) > cvSize.w / 2) c.moveTo(x, y); else c.lineTo(x, y);
      px = x;
    });
    if (f) f();
  }
  function zoneRanges(z) {
    // 時區 z 在目前地圖上的 x 範圍（可能跨邊界，傳回 1–2 段）
    const b = K.zoneBounds(z), w = cvSize.w;
    const a = X(b[0]), e = a + (b[1] - b[0]) / 360 * w;
    const out = [];
    if (e > w + 1e-6) { out.push([a, w]); out.push([0, e - w]); }
    else out.push([a, Math.min(e, w)]);
    return out.filter(function (r) { return r[1] - r[0] > 0.01; });
  }
  function drawMap() {
    const c = ctx, w = cvSize.w, h = cvSize.h;
    D.backdrop && c.clearRect(0, 0, w, h);
    drawBase(c);
    const sub = K.sun(state.day, state.utc);
    const strip = state.zones ? stripH() : 0;
    const shares = K.dateShares(state.day, state.utc);
    const dayMin = shares[0].day;

    // 日期（理想時區）：兩個日期用兩種顏色
    if (state.dates) {
      for (let z = -12; z <= 12; z++) {
        const L = K.local(state.day, state.utc, z);
        const col = shares.length > 1 && L.day > dayMin ? C['tz-dateB'] : C['tz-dateA'];
        c.fillStyle = D.alpha(col, D.dark ? 0.16 : 0.13);
        zoneRanges(z).forEach(function (r) { c.fillRect(r[0], 0, r[1] - r[0], h); });
      }
    }
    // 時區帶：相間的淡色與界線
    if (state.zones) {
      for (let z = -12; z <= 12; z++) {
        if (z % 2 === 0) continue;
        c.fillStyle = D.dark ? 'rgba(255,255,255,0.045)' : 'rgba(20,40,70,0.05)';
        zoneRanges(z).forEach(function (r) { c.fillRect(r[0], strip, r[1] - r[0], h - strip); });
      }
      c.strokeStyle = D.alpha(C['tz-grid'], D.dark ? 0.55 : 0.5); c.lineWidth = 0.8; c.setLineDash([3, 3]);
      c.beginPath();
      for (let z = -12; z <= 12; z++) { const x = X(K.zoneBounds(z)[0]); if (x > 0.5 && x < w - 0.5) { c.moveTo(x, strip); c.lineTo(x, h); } }
      c.stroke(); c.setLineDash([]);
    }
    // 回歸線與極圈
    c.save();
    c.strokeStyle = D.alpha(C['tz-sun'], D.dark ? 0.45 : 0.55); c.lineWidth = 0.8; c.setLineDash([6, 4]);
    [23.44, -23.44].forEach(function (lat) { c.beginPath(); c.moveTo(0, Y(lat)); c.lineTo(w, Y(lat)); c.stroke(); });
    c.strokeStyle = D.alpha(C['tz-grid'], 0.55);
    [66.56, -66.56].forEach(function (lat) { c.beginPath(); c.moveTo(0, Y(lat)); c.lineTo(w, Y(lat)); c.stroke(); });
    c.setLineDash([]);
    c.strokeStyle = D.alpha(C['tz-grid'], 0.6); c.lineWidth = 0.9;
    c.beginPath(); c.moveTo(0, Y(0)); c.lineTo(w, Y(0)); c.stroke();
    c.restore();
    if (w >= 520) {
      const lf = '600 ' + (w >= 900 ? 10.5 : 9.5) + 'px ' + FONT;
      [[23.44, '北回歸線', 'Tropic of Cancer', C['tz-sun']], [-23.44, '南回歸線', 'Tropic of Capricorn', C['tz-sun']],
        [66.56, '北極圈', 'Arctic Circle', C['muted']], [-66.56, '南極圈', 'Antarctic Circle', C['muted']], [0, '赤道', 'Equator', C['muted']]].forEach(function (a) {
        D.haloText(c, T(a[1], a[2]), 4, Y(a[0]) - 3, a[3], 'left', 'alphabetic', lf);
      });
    }

    // 黑夜
    if (state.night) {
      buildNight();
      c.save(); c.imageSmoothingEnabled = true;
      c.drawImage(night, 0, 0, NW, NH, 0, 0, w, h);
      c.restore();
    }

    // 換日線（理想位置 180°）與午夜線
    const xDL = X(180), xMid = X(K.midnightLon(state.utc));
    const vline = function (x, col, dash, lw) {
      c.save(); c.strokeStyle = col; c.lineWidth = lw; c.setLineDash(dash || []);
      c.shadowColor = D.dark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)'; c.shadowBlur = 3;
      c.beginPath(); c.moveTo(x, strip); c.lineTo(x, h); c.stroke(); c.restore();
    };
    const atEdge = function (x) { return x < 1 || x > w - 1; };
    if (!atEdge(xDL)) vline(xDL, C['tz-dateline'], [8, 4], 2);
    else { vline(1, C['tz-dateline'], [8, 4], 2); vline(w - 1, C['tz-dateline'], [8, 4], 2); }
    const midOnDL = Math.abs(K.n180(K.midnightLon(state.utc) - 180)) < 1e-6 || Math.abs(K.n180(K.midnightLon(state.utc) + 180)) < 1e-6;
    if (!midOnDL) vline(atEdge(xMid) ? 1.5 : xMid, C['tz-midnight'], null, 2.2);

    // 日期標籤（底部）
    if (state.dates) {
      const fb = '700 ' + (w < 560 ? 10.5 : 12) + 'px ' + FONT;
      // 依 x 找出每個日期的連續區段，標在最寬的一段中央
      const segs = [];
      for (let z = -12; z <= 12; z++) {
        const L = K.local(state.day, state.utc, z);
        zoneRanges(z).forEach(function (r) { segs.push({ a: r[0], b: r[1], day: L.day }); });
      }
      segs.sort(function (p, q) { return p.a - q.a; });
      const merged = [];
      segs.forEach(function (s) {
        const m = merged[merged.length - 1];
        if (m && m.day === s.day && Math.abs(m.b - s.a) < 0.5) m.b = s.b; else merged.push({ a: s.a, b: s.b, day: s.day });
      });
      const best = {};
      merged.forEach(function (m) { if (!best[m.day] || m.b - m.a > best[m.day].b - best[m.day].a) best[m.day] = m; });
      Object.keys(best).forEach(function (k) {
        const m = best[k], wd = m.b - m.a;
        const col = shares.length > 1 && +k > dayMin ? C['tz-dateB'] : C['tz-dateA'];
        const label = dateTxt(+k);
        c.font = fb;
        if (wd < c.measureText(label).width + 16) return;
        D.pill(c, label, (m.a + m.b) / 2, h - 6, col, 'center', fb);
      });
    }

    // 太陽直射點
    const sx = X(sub.lon), sy = Y(sub.lat);
    c.save();
    const glow = c.createRadialGradient(sx, sy, 0, sx, sy, Math.max(18, w * 0.05));
    glow.addColorStop(0, D.alpha(C['tz-sun'], 0.45)); glow.addColorStop(1, D.alpha(C['tz-sun'], 0));
    c.fillStyle = glow; c.beginPath(); c.arc(sx, sy, Math.max(18, w * 0.05), 0, 2 * Math.PI); c.fill();
    c.strokeStyle = C['tz-sun']; c.lineWidth = 1.6;
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      c.beginPath(); c.moveTo(sx + 8 * Math.cos(a), sy + 8 * Math.sin(a)); c.lineTo(sx + 12 * Math.cos(a), sy + 12 * Math.sin(a)); c.stroke();
    }
    const sg = c.createRadialGradient(sx - 2, sy - 2, 1, sx, sy, 6.5);
    sg.addColorStop(0, '#fff7cc'); sg.addColorStop(1, C['tz-sun']);
    c.fillStyle = sg; c.beginPath(); c.arc(sx, sy, 6, 0, 2 * Math.PI); c.fill();
    c.restore();

    // 飛行航線：飛過的（淡）、預定航線（虛線）、正在飛的（實線＋飛機）
    drawFlights(c);

    // 城市
    if (state.cities) drawCities(c);

    // 量測點
    drawProbe(c);

    // 上方時區列：偏移與此刻的區時
    if (state.zones) drawZoneStrip(c, strip);
  }

  function stripH() { return cvSize.w / 24 >= 30 ? 30 : 16; }
  function drawZoneStrip(c, strip) {
    const w = cvSize.w;
    c.save();
    c.fillStyle = D.alpha(C['surface'], D.dark ? 0.84 : 0.88);
    c.fillRect(0, 0, w, strip);
    c.strokeStyle = D.alpha(C['border'], 0.9); c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, strip + 0.5); c.lineTo(w, strip + 0.5); c.stroke();
    const zw = w / 24, two = strip >= 28, fs = zw >= 40 ? 11 : zw >= 22 ? 9.5 : 9;
    const every = zw >= 18 ? 1 : 2;
    const tz = K.zoneOf(state.probe.lon);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let z = -12; z <= 12; z++) {
      if (Math.abs(z) !== 12 && (z % every) !== 0) continue;
      zoneRanges(z).forEach(function (r) {
        const wd = r[1] - r[0];
        if (wd < 8) return;
        const cx = (r[0] + r[1]) / 2, me = z === tz;
        const lab = (z > 0 ? '+' : z < 0 ? '−' : '±') + Math.abs(z);
        c.font = (me ? '800 ' : '600 ') + fs + 'px ' + FONT;
        c.fillStyle = me ? C['accent'] : C['muted'];
        if (c.measureText(lab).width < wd + 6) c.fillText(lab, cx, two ? 8.5 : strip / 2 + 0.5);
        if (two) {
          const clock = hm(K.local(state.day, state.utc, z).clock);
          c.font = (me ? '800 ' : '600 ') + (fs - 0.5) + 'px ' + FONT;
          c.fillStyle = me ? C['accent'] : C['text'];
          const t = wd >= 30 ? clock : clock.slice(0, 2);
          if (c.measureText(t).width < wd - 1) c.fillText(t, cx, 21.5);
        }
      });
    }
    c.restore();
  }

  function cityXY(cy) { return [X(cy.lon), Y(cy.lat)]; }
  function drawCities(c) {
    const w = cvSize.w, showNames = w >= 760;
    const placed = [];
    const fn = '600 ' + (w >= 1000 ? 11 : 10) + 'px ' + FONT;
    const order = K.CITIES.slice().sort(function (a, b) { return (b.id === 'taipei') - (a.id === 'taipei'); });
    order.forEach(function (cy) {
      const p = cityXY(cy), isTp = cy.id === 'taipei';
      c.beginPath(); c.arc(p[0], p[1], isTp ? 3.6 : 2.6, 0, 2 * Math.PI);
      c.fillStyle = isTp ? C['accent'] : C['tz-city']; c.fill();
      c.strokeStyle = D.dark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)'; c.lineWidth = 1.2; c.stroke();
      if (!showNames && !isTp) return;
      if (state.probe.city === cy.id) return;
      c.font = fn;
      const name = cityName(cy), tw = c.measureText(name).width;
      const tries = [[6, -4, 'left'], [-6, -4, 'right'], [6, 11, 'left'], [-6, 11, 'right']];
      for (let k = 0; k < tries.length; k++) {
        const t = tries[k], x0 = t[2] === 'left' ? p[0] + t[0] : p[0] + t[0] - tw, y0 = p[1] + t[1] - 10;
        const box = [x0 - 2, y0, x0 + tw + 2, y0 + 12];
        if (box[0] < 0 || box[2] > w || box[1] < 18) continue;
        if (placed.some(function (b) { return !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]); })) continue;
        placed.push(box);
        D.haloText(c, name, p[0] + t[0], p[1] + t[1], isTp ? C['accent'] : C['tz-city'], t[2], 'alphabetic', fn);
        break;
      }
    });
  }

  function drawProbe(c) {
    const P = probePlace(), x = X(P.lon), y = Y(P.lat), w = cvSize.w;
    c.save();
    c.fillStyle = D.alpha(C['tz-probe'], 0.18);
    c.beginPath(); c.arc(x, y, 11, 0, 2 * Math.PI); c.fill();
    c.strokeStyle = C['tz-probe']; c.lineWidth = 2.2;
    c.beginPath(); c.arc(x, y, 7, 0, 2 * Math.PI); c.stroke();
    c.fillStyle = C['tz-probe']; c.beginPath(); c.arc(x, y, 2.6, 0, 2 * Math.PI); c.fill();
    if (kb && kb.focused() && kb.index() === 0) {
      c.strokeStyle = C['accent']; c.setLineDash([3, 3]); c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, 15, 0, 2 * Math.PI); c.stroke(); c.setLineDash([]);
    }
    const cy = state.probe.city ? K.CITY[state.probe.city] : null;
    const label = (cy ? cityName(cy) + ' ' : '') + hm(P.clock) + (w >= 520 ? ' · ' + dateTxt(P.day) : '');
    const fnt = '700 ' + (w < 560 ? 11 : 12) + 'px ' + FONT;
    c.font = fnt;
    const tw = c.measureText(label).width + 12;
    let lx = x + 14, al = 'left';
    if (lx + tw > w - 4) { lx = x - 14; al = 'right'; }
    let ly = y - 10;
    if (ly < 40) ly = y + 26;
    D.pill(c, label, lx, ly, C['tz-probe'], al, fnt);
    c.restore();
  }

  function drawFlights(c) {
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    state.flights.forEach(function (F) {
      c.strokeStyle = D.alpha(C['tz-flight'], 0.4); c.lineWidth = 1.8;
      seamPath(c, F.path.map(function (p) { return [p.lon, p.lat]; }), function () { c.stroke(); });
    });
    const dep = K.CITY[state.dep], arr = K.CITY[state.arr];
    if (dep && arr && dep !== arr && !state.flying) {
      const pts = [];
      for (let i = 0; i <= 120; i++) pts.push(K.gcPoint([dep.lon, dep.lat], [arr.lon, arr.lat], i / 120));
      c.strokeStyle = D.alpha(C['tz-flight'], 0.9); c.lineWidth = 1.6; c.setLineDash([5, 4]);
      seamPath(c, pts, function () { c.stroke(); });
      c.setLineDash([]);
    }
    if (state.flying) {
      const F = state.flying.F, f = state.flying.f, n = F.path.length - 1, k = Math.min(n, Math.floor(f * n));
      const done = F.path.slice(0, k + 1).map(function (p) { return [p.lon, p.lat]; });
      const cur = K.gcPoint([K.CITY[F.dep].lon, K.CITY[F.dep].lat], [K.CITY[F.arr].lon, K.CITY[F.arr].lat], f);
      done.push(cur);
      c.strokeStyle = D.alpha(C['tz-flight'], 0.35); c.lineWidth = 1.4; c.setLineDash([5, 4]);
      seamPath(c, F.path.map(function (p) { return [p.lon, p.lat]; }), function () { c.stroke(); });
      c.setLineDash([]);
      c.strokeStyle = C['tz-flight']; c.lineWidth = 2.6;
      seamPath(c, done, function () { c.stroke(); });
      const nx = K.gcPoint([K.CITY[F.dep].lon, K.CITY[F.dep].lat], [K.CITY[F.arr].lon, K.CITY[F.arr].lat], Math.min(1, f + 0.002));
      let ang = Math.atan2(Y(nx[1]) - Y(cur[1]), X(nx[0]) - X(cur[0]));
      if (Math.abs(X(nx[0]) - X(cur[0])) > cvSize.w / 2) ang += Math.PI;
      drawPlane(c, X(cur[0]), Y(cur[1]), ang);
    }
    c.restore();
  }
  function drawPlane(c, x, y, ang) {
    c.save(); c.translate(x, y); c.rotate(ang);
    c.fillStyle = C['tz-flight']; c.strokeStyle = D.dark ? '#000' : '#fff'; c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(9, 0); c.lineTo(2, -1.6); c.lineTo(-1, -8); c.lineTo(-3.5, -8); c.lineTo(-1.5, -1.6); c.lineTo(-6, -1.4); c.lineTo(-8, -4.5); c.lineTo(-9.5, -4.5);
    c.lineTo(-8.2, 0); c.lineTo(-9.5, 4.5); c.lineTo(-8, 4.5); c.lineTo(-6, 1.4); c.lineTo(-1.5, 1.6); c.lineTo(-3.5, 8); c.lineTo(-1, 8); c.lineTo(2, 1.6); c.closePath();
    c.stroke(); c.fill();
    c.restore();
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function probePlace() {
    const cy = state.probe.city ? K.CITY[state.probe.city] : null;
    const lat = cy ? cy.lat : state.probe.lat, lon = cy ? cy.lon : state.probe.lon;
    return K.place(lat, lon, state.day, state.utc, cy ? cy.off : null);
  }
  function aheadTxt(dh, a, b) {
    // dh = a 的鐘 − b 的鐘（小時）
    if (Math.abs(dh) < 1 / 120) return T(a + '和' + b + '一樣', a + ' and ' + b + ' agree');
    return dh > 0 ? T(a + '比' + b + '快 ' + dur(dh), a + ' is ' + dur(dh) + ' ahead of ' + b) : T(a + '比' + b + '慢 ' + dur(-dh), a + ' is ' + dur(-dh) + ' behind ' + b);
  }
  function updateReadouts() {
    const s = K.sun(state.day, state.utc);
    const tp = K.CITY.taipei, tpl = K.local(state.day, state.utc, tp.off);
    setHTML('nowUtc', 'UTC ' + dateTxt(state.day) + ' ' + hm(state.utc));
    setHTML('nowSub', T('臺北 ', 'Taipei ') + dateTxt(tpl.day) + ' ' + hm(tpl.clock) + '（UTC+8）');
    setOut($('day'), dateTxt(state.day));
    setOut($('utc'), hm(state.utc));
    setHTML('rSub', latTxt(s.lat) + T('，', ', ') + lonTxt(s.lon));
    setHTML('rDec', (s.dec < 0 ? '−' : '+') + num(Math.abs(s.dec), 2) + '°');
    setHTML('rEot', signed(s.eot, 1) + T(' 分', ' min') + (Math.abs(s.eot) >= 0.5 ? T(s.eot > 0 ? '（日晷走在前面）' : '（日晷落在後面）', s.eot > 0 ? ' (sundial ahead)' : ' (sundial behind)') : ''));
    const sh = K.dateShares(state.day, state.utc);
    setHTML('rDates', sh.map(function (x, i) {
      const col = sh.length > 1 && i > 0 ? 'var(--tz-dateB)' : 'var(--tz-dateA)';
      return '<b style="color:' + col + '">' + dateTxt(x.day) + '</b> ' + num(x.frac * 100, 1) + '%';
    }).join(T('、', ', ')) + (sh.length === 1 ? T('（整個地球同一天）', ' (one date everywhere)') : ''));

    // 量測點
    const P = probePlace(), cy = state.probe.city ? K.CITY[state.probe.city] : null;
    setHTML('rPlace', cy ? '<b>' + cityName(cy) + '</b>（' + latTxt(cy.lat) + ', ' + lonTxt(cy.lon) + '）' : latTxt(P.lat) + T('，', ', ') + lonTxt(P.lon));
    setHTML('rClock', dateTxt(P.day) + ' ' + hm(P.clock));
    setHTML('rZone', cy ? offTxt(P.off) + T('（官方標準時間）', ' (official standard time)')
      : offTxt(P.zone) + T('（理想時區，中央經線 ', ' (ideal zone, central meridian ') + lonTxt(P.zone * 15 === -180 ? 180 : P.zone * 15) + T('）', ')'));
    setHTML('rLmt', hm(P.lmt));
    setHTML('rAst', hm(P.ast));
    const lmtGap = P.offMinusLmt, astGap = P.offMinusLmt - s.eot / 60;
    setHTML('rGap', aheadTxt(lmtGap, T('時鐘', 'The clock'), T('地方平時', 'local mean time')) + T('；', '; ') + aheadTxt(astGap, T('時鐘', 'the clock'), T('日晷', 'the sundial')) + T('。', '.'));
    const az = Math.round(P.az / 45) % 8;
    const sky = K.skyOf(P.alt);
    const skyTxt = { day: T('白天', 'day'), civil: T('民用曙暮光', 'civil twilight'), nautical: T('航海曙暮光', 'nautical twilight'), astro: T('天文曙暮光', 'astronomical twilight'), night: T('黑夜', 'night') }[sky];
    setHTML('rSun', T('仰角 ', 'altitude ') + num(P.alt, 1) + '°' + (P.alt > -1 ? T('，在' + DIR8[az][0] + '方', ', ' + DIR8[az][1]) : '') + '（' + skyTxt + '）');
    if (P.polar === 'day') { setHTML('rRise', T('永晝：整天不落', 'Midnight sun: no sunset')); setHTML('rLen', T('24 小時', '24 h')); }
    else if (P.polar === 'night') { setHTML('rRise', T('永夜：整天不升', 'Polar night: no sunrise')); setHTML('rLen', T('0 小時', '0 h')); }
    else { setHTML('rRise', hm(P.rise) + ' ／ ' + hm(P.set)); setHTML('rLen', dur(P.dayLen)); }
    const tpOff = tp.off;
    setHTML('rVsTp', cy && cy.id === 'taipei' ? T('就是臺北', 'This is Taipei') : aheadTxt(P.off - tpOff, T('這裡', 'Here'), T('臺北', 'Taipei')));

    // 飛行
    const dep = K.CITY[state.dep], arr = K.CITY[state.arr];
    setOut($('dur'), num(state.dur, 2));
    if (dep && arr && dep !== arr) {
      const F = state.flying ? state.flying.F : K.flight(dep, arr, state.day, state.utc, state.dur);
      setHTML('rDist', num(F.dist, 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' km');
      setHTML('rDepT', dateTxt(F.depLocal.day) + ' ' + hm(F.depLocal.clock) + '<small style="font-weight:400">（' + cityName(dep) + '）</small>');
      setHTML('rArrT', dateTxt(F.arrLocal.day) + ' ' + hm(F.arrLocal.clock) + '<small style="font-weight:400">（' + cityName(arr) + '）</small>');
      const cd = F.clockDiff, zd = arr.off - dep.off;
      const zdTxt = Math.abs(zd) < 1 / 120 ? T('兩地的鐘一樣', 'the clocks in both cities agree')
        : T('抵達地的鐘比出發地' + (zd > 0 ? '快 ' : '慢 ') + dur(Math.abs(zd)), 'clocks at the destination are ' + dur(Math.abs(zd)) + (zd > 0 ? ' ahead of' : ' behind') + ' those at the departure city');
      let note = T('飛了 ' + dur(F.dur) + '，' + zdTxt + '，所以落地時當地鐘比起飛時的鐘' + (Math.abs(cd) < 1 / 120 ? '一模一樣' : cd > 0 ? '多了 ' + dur(cd) : '少了 ' + dur(-cd)) + '。',
        'You fly ' + dur(F.dur) + ' and ' + zdTxt + ', so the clock at landing reads ' + (Math.abs(cd) < 1 / 120 ? 'exactly the same as' : dur(Math.abs(cd)) + (cd > 0 ? ' later than' : ' earlier than')) + ' at take-off.');
      if (F.earlierDate) note += T('<b>落地的日期比起飛還早一天！</b>', ' <b>You land on an earlier date than you left!</b>');
      else if (F.dateDiff >= 2) note += T('日期跳了 ' + F.dateDiff + ' 天。', ' The date jumps by ' + F.dateDiff + ' days.');
      setHTML('rFlightNote', note);
    } else {
      ['rDist', 'rDepT', 'rArrT'].forEach(function (id) { setHTML(id, '—'); });
      setHTML('rFlightNote', T('出發地和抵達地要不一樣。', 'Choose two different cities.'));
    }
    $('fly').disabled = !!state.flying || !(dep && arr && dep !== arr);
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function snapshot(fl) {
    return K.snapshot({
      day: state.day, utc: state.utc, probe: state.probe, flight: fl || null, moving: !!state.playing,
      view: view3 && view3.active ? '3d' : '2d', center: state.center,
      layers: { zones: state.zones, night: state.night, dates: state.dates, cities: state.cities }
    });
  }
  let lastEmit = 0, emitTimer = 0;
  function afterChange(force) {
    updateReadouts();
    requestDraw();
    const tNow = performance.now();
    clearTimeout(emitTimer);
    if (force || tNow - lastEmit > 220) { lastEmit = tNow; emit('tz', snapshot()); }
    else emitTimer = setTimeout(function () { lastEmit = performance.now(); emit('tz', snapshot()); }, 240);
    if (view3 && view3.active) view3.onChange();
  }

  // =====================================================================
  // 時間控制
  // =====================================================================
  const elDay = $('day'), elUtc = $('utc'), elDur = $('dur');
  function normTime() {
    state.utc = Math.round(state.utc * 600) / 600;            // 到 0.1 分鐘
    while (state.utc >= 24) { state.utc -= 24; state.day++; }
    while (state.utc < 0) { state.utc += 24; state.day--; }
    while (state.day > 365) state.day -= 365;
    while (state.day < 1) state.day += 365;
  }
  function syncSliders(quiet) {
    // 播放時直接改滑桿位置（不觸發事件）；其他時候用 LabNum.set
    if (window.LabNum) { window.LabNum.clear(elDay); window.LabNum.clear(elUtc); }
    elDay.value = String(state.day);
    elUtc.value = String(Math.min(23.9833, Math.round(state.utc * 60) / 60));
    if (!quiet) { setOut(elDay, dateTxt(state.day)); setOut(elUtc, hm(state.utc)); }
  }
  elDay.addEventListener('input', function () {
    acted(); stopPlay(); state.day = Math.max(1, Math.min(365, Math.round(val(elDay)))); afterChange();
  });
  elDay.addEventListener('change', function () { state.day = Math.max(1, Math.min(365, Math.round(val(elDay)))); afterChange(true); });
  elUtc.addEventListener('input', function () {
    acted(); stopPlay(); state.utc = Math.max(0, Math.min(23.99, Math.round(val(elUtc) * 60) / 60)); afterChange();
  });
  elUtc.addEventListener('change', function () {
    state.utc = Math.max(0, Math.min(23.99, Math.round(val(elUtc) * 60) / 60)); afterChange(true);
    const P = probePlace();
    setStatus(T('UTC ' + hm(state.utc) + '：' + placeName() + '是 ' + dateTxt(P.day) + ' ' + hm(P.clock) + '，太陽仰角 ' + num(P.alt, 1) + '°。',
      'UTC ' + hm(state.utc) + ': in ' + placeName() + ' it is ' + dateTxt(P.day) + ' ' + hm(P.clock) + ', Sun altitude ' + num(P.alt, 1) + '°.'));
  });
  function placeName() {
    const cy = state.probe.city ? K.CITY[state.probe.city] : null;
    return cy ? cityName(cy) : latTxt(state.probe.lat) + ' ' + lonTxt(state.probe.lon);
  }

  let playAcc = 0, lastT = 0;
  function startPlay() {
    if (state.flying) return;
    state.playing = true; lastT = 0;
    $('play').setAttribute('aria-pressed', 'true'); $('play').textContent = T('❚❚ 暫停', '❚❚ Pause');
    requestDraw();
  }
  function stopPlay() {
    if (!state.playing) return;
    state.playing = false;
    $('play').setAttribute('aria-pressed', 'false'); $('play').textContent = T('▶ 播放', '▶ Play');
    syncSliders(); afterChange(true);
  }
  $('play').addEventListener('click', function () { acted(); if (state.playing) stopPlay(); else startPlay(); });
  document.querySelectorAll('#speedSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); state.speed = b.getAttribute('data-speed');
      document.querySelectorAll('#speedSeg button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      if (!state.playing) startPlay();
    });
  });
  function stepPlay(tnow) {
    if (!lastT) { lastT = tnow; return; }
    const dt = Math.min(0.1, (tnow - lastT) / 1000); lastT = tnow;
    if (state.speed === 'day') {
      // 每秒 10 天、時刻不變：直射點只會南北移動，看得出季節
      playAcc += dt * 10;
      while (playAcc >= 1) { playAcc -= 1; state.day++; }
    } else state.utc += SPEEDS[state.speed] * dt;
    normTime();
    syncSliders();
    updateReadouts();
    const t2 = performance.now();
    if (t2 - lastEmit > 250) { lastEmit = t2; emit('tz', snapshot()); }
  }

  // =====================================================================
  // 地圖、城市、飛行
  // =====================================================================
  document.querySelectorAll('#centerSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); state.center = +b.getAttribute('data-center');
      document.querySelectorAll('#centerSeg button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      setStatus(state.center ? T('地圖中央改成 150°E：太平洋和換日線在中間，像臺灣常見的世界地圖。', 'Map centred on 150° E: the Pacific and the date line are in the middle, as on maps printed in Taiwan.')
        : T('地圖中央改成 0°：本初子午線在中間，換日線在左右兩邊。', 'Map centred on 0°: the prime meridian is in the middle and the date line at both edges.'));
      afterChange(true);
    });
  });
  [['tZones', 'zones'], ['tNight', 'night'], ['tDates', 'dates'], ['tCities', 'cities']].forEach(function (p) {
    $(p[0]).addEventListener('click', function () {
      acted(); state[p[1]] = !state[p[1]]; $(p[0]).setAttribute('aria-pressed', String(state[p[1]]));
      if (view3 && view3.active) view3.onLook();
      afterChange(true);
    });
  });
  function fillSelect(sel, value, withFree) {
    sel.innerHTML = '';
    if (withFree) { const o = document.createElement('option'); o.value = ''; o.textContent = T('（地圖上的點）', '(point on the map)'); sel.appendChild(o); }
    K.CITIES.forEach(function (cy) {
      const o = document.createElement('option'); o.value = cy.id; o.textContent = cityName(cy) + '（' + offTxt(cy.off) + '）'; sel.appendChild(o);
    });
    sel.value = value || '';
  }
  function refillSelects() {
    fillSelect($('selCity'), state.probe.city, true);
    fillSelect($('selDep'), state.dep); fillSelect($('selArr'), state.arr);
  }
  $('selCity').addEventListener('change', function () {
    const id = $('selCity').value, cy = K.CITY[id];
    acted();
    if (cy) { state.probe = { lon: cy.lon, lat: cy.lat, city: cy.id }; setStatus(T('量測點移到' + cityName(cy) + '（' + offTxt(cy.off) + '）。', 'Measuring point moved to ' + cityName(cy) + ' (' + offTxt(cy.off) + ').')); }
    else state.probe.city = null;
    afterChange(true);
  });
  $('selDep').addEventListener('change', function () { acted(); state.dep = $('selDep').value; afterChange(true); });
  $('selArr').addEventListener('change', function () { acted(); state.arr = $('selArr').value; afterChange(true); });
  elDur.addEventListener('input', function () { acted(); state.dur = Math.max(0.5, Math.min(20, val(elDur))); afterChange(); });
  elDur.addEventListener('change', function () { state.dur = Math.max(0.5, Math.min(20, val(elDur))); afterChange(true); });
  $('suggest').addEventListener('click', function () {
    const dep = K.CITY[state.dep], arr = K.CITY[state.arr];
    if (!dep || !arr || dep === arr) return;
    acted();
    state.dur = Math.max(0.5, Math.min(20, K.suggestDur(dep, arr)));
    if (window.LabNum) window.LabNum.set(elDur, state.dur); else elDur.value = state.dur;
    setStatus(T('大圓距離 ' + num(K.gcDist([dep.lon, dep.lat], [arr.lon, arr.lat]), 0) + ' km，以 850 km/h 加起降 0.5 小時，約 ' + dur(state.dur) + '。實際航班還會受高空風影響（往東通常比較快）。',
      'Great-circle distance ' + num(K.gcDist([dep.lon, dep.lat], [arr.lon, arr.lat]), 0) + ' km; at 850 km/h plus 0.5 h, about ' + dur(state.dur) + '. Real flights also depend on the winds aloft (eastbound is usually faster).'));
    afterChange(true);
  });
  $('fly').addEventListener('click', function () {
    const dep = K.CITY[state.dep], arr = K.CITY[state.arr];
    if (!dep || !arr || dep === arr || state.flying) return;
    acted(); stopPlay();
    const F = K.flight(dep, arr, state.day, state.utc, state.dur);
    const total = reducedMotion ? 400 : Math.max(2500, Math.min(9000, state.dur * 600));
    state.flying = { F: F, start: 0, total: total, f: 0 };
    setStatus(T('起飛！' + cityName(dep) + ' ' + dateTxt(F.depLocal.day) + ' ' + hm(F.depLocal.clock) + '，飛往' + cityName(arr) + '…',
      'Take-off! ' + cityName(dep) + ' ' + dateTxt(F.depLocal.day) + ' ' + hm(F.depLocal.clock) + ', bound for ' + cityName(arr) + '…'));
    updateReadouts();
    requestDraw();
  });
  function stepFlight(tnow) {
    const fl = state.flying;
    if (!fl.start) fl.start = tnow;
    fl.f = Math.min(1, (tnow - fl.start) / fl.total);
    const F = fl.F;
    state.day = F.day; state.utc = F.utc + F.dur * fl.f;
    normTime(); syncSliders(); updateReadouts();
    if (fl.f >= 1) land();
  }
  function land() {
    const F = state.flying.F;
    state.flying = null;
    state.flights.push(F);
    if (state.flights.length > 6) state.flights.shift();
    state.lastFlight = F;
    const dep = K.CITY[F.dep], arr = K.CITY[F.arr];
    let msg = T('落地！' + cityName(arr) + ' ' + dateTxt(F.arrLocal.day) + ' ' + hm(F.arrLocal.clock) + '（起飛時' + cityName(dep) + '是 ' + dateTxt(F.depLocal.day) + ' ' + hm(F.depLocal.clock) + '）。',
      'Landed! ' + cityName(arr) + ' ' + dateTxt(F.arrLocal.day) + ' ' + hm(F.arrLocal.clock) + ' (at take-off it was ' + dateTxt(F.depLocal.day) + ' ' + hm(F.depLocal.clock) + ' in ' + cityName(dep) + ').');
    if (F.earlierDate) msg += T(' 往東越過換日線，日期倒退了一天。', ' Crossing the date line eastward took you back a day.');
    if (F.sunrises + F.sunsets > 0) msg += T(' 途中看到 ' + F.sunrises + ' 次日出、' + F.sunsets + ' 次日落。', ' On the way: ' + F.sunrises + ' sunrise(s) and ' + F.sunsets + ' sunset(s).');
    setStatus(msg);
    updateReadouts(); requestDraw();
    lastEmit = performance.now();
    emit('tz', snapshot(F));
    if (view3 && view3.active) view3.onChange();
  }
  $('clear').addEventListener('click', function () {
    acted();
    state.flights = []; state.lastFlight = null;
    if (state.flying) { state.flying = null; }
    setStatus(T('已清除飛行航跡；時間與設定不變。', 'Flight tracks cleared; the time and settings are unchanged.'));
    afterChange(true);
  });

  // ---------- 指標：點地圖放量測點，靠近城市會吸附 ----------
  let drag = null;
  function evXY(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function nearestCity(x, y, rad) {
    let best = null, bd = rad;
    K.CITIES.forEach(function (cy) { const p = cityXY(cy), d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = cy; } });
    return best;
  }
  function setProbeXY(x, y) {
    const cy = state.cities ? nearestCity(x, y, cvSize.w < 560 ? 14 : 11) : null;
    if (cy) state.probe = { lon: cy.lon, lat: cy.lat, city: cy.id };
    else { const p = fromXY(x, y); state.probe = { lon: Math.round(p.lon * 100) / 100, lat: Math.round(p.lat * 100) / 100, city: null }; }
    $('selCity').value = state.probe.city || '';
  }
  cv.addEventListener('pointerdown', function (e) {
    if (view3 && view3.active) return;
    acted();
    const p = evXY(e);
    drag = { id: e.pointerId };
    try { cv.setPointerCapture(e.pointerId); } catch (er) { /* 忽略 */ }
    cv.classList.add('dragging');
    setProbeXY(p[0], p[1]);
    afterChange();
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drag || drag.id !== e.pointerId) return;
    const p = evXY(e);
    setProbeXY(Math.max(0, Math.min(cvSize.w, p[0])), Math.max(0, Math.min(cvSize.h, p[1])));
    afterChange();
  });
  function endDrag(e) {
    if (!drag || (e && drag.id !== e.pointerId)) return;
    drag = null; cv.classList.remove('dragging');
    const P = probePlace();
    setStatus(T(placeName() + '：' + dateTxt(P.day) + ' ' + hm(P.clock) + '（' + offTxt(P.off) + '），地方平時 ' + hm(P.lmt) + '，太陽仰角 ' + num(P.alt, 1) + '°。',
      placeName() + ': ' + dateTxt(P.day) + ' ' + hm(P.clock) + ' (' + offTxt(P.off) + '), local mean time ' + hm(P.lmt) + ', Sun altitude ' + num(P.alt, 1) + '°.'));
    afterChange(true);
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', function () { drag = null; cv.classList.remove('dragging'); requestDraw(); });

  let kb = null;
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('世界地圖。方向鍵移動量測點（每步 1°，Shift 10°）。', 'World map. Arrow keys move the measuring point (1° a step, Shift 10°).'),
      items: [{
        name: function () { return T('量測點', 'Measuring point'); },
        move: function (dx, dy, big) {
          acted();
          const P = probePlace(), s = big ? 10 : 1;
          state.probe = { lon: Math.round(K.n180(P.lon + dx * s) * 100) / 100, lat: Math.max(-89.9, Math.min(89.9, Math.round((P.lat - dy * s) * 100) / 100)), city: null };
          $('selCity').value = '';
          afterChange(true); return true;
        },
        describe: function () {
          const P = probePlace();
          return placeName() + T('，', ', ') + dateTxt(P.day) + ' ' + hm(P.clock) + T('，太陽仰角 ', ', Sun altitude ') + num(P.alt, 1) + '°';
        }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      return { d: state.day, u: Math.round(state.utc * 60), c: state.center, z: state.zones ? 1 : 0, n: state.night ? 1 : 0, dt: state.dates ? 1 : 0, ci: state.cities ? 1 : 0,
        p: state.probe.city || [Math.round(state.probe.lon * 100) / 100, Math.round(state.probe.lat * 100) / 100], f: state.dep, t: state.arr, h: state.dur };
    },
    set: function (o) {
      if (!o) return;
      if (isFinite(o.d)) state.day = Math.max(1, Math.min(365, Math.round(o.d)));
      if (isFinite(o.u)) state.utc = Math.max(0, Math.min(1439, Math.round(o.u))) / 60;
      if (o.c === 0 || o.c === 150) state.center = o.c;
      state.zones = o.z !== 0; state.night = o.n !== 0; state.dates = o.dt !== 0; state.cities = o.ci !== 0;
      if (typeof o.p === 'string' && K.CITY[o.p]) state.probe = { lon: K.CITY[o.p].lon, lat: K.CITY[o.p].lat, city: o.p };
      else if (Array.isArray(o.p) && isFinite(o.p[0]) && isFinite(o.p[1])) state.probe = { lon: K.n180(+o.p[0]), lat: Math.max(-89.9, Math.min(89.9, +o.p[1])), city: null };
      if (K.CITY[o.f]) state.dep = o.f;
      if (K.CITY[o.t]) state.arr = o.t;
      if (isFinite(o.h)) state.dur = Math.max(0.5, Math.min(20, +o.h));
      syncSliders();
      if (window.LabNum) window.LabNum.set(elDur, state.dur); else elDur.value = state.dur;
      refreshButtons(); refillSelects();
      updateReadouts(); requestDraw();
      if (view3 && view3.active) view3.onLook();
    }
  });
  function refreshButtons() {
    document.querySelectorAll('#centerSeg button').forEach(function (o) { o.setAttribute('aria-pressed', String(+o.getAttribute('data-center') === state.center)); });
    [['tZones', 'zones'], ['tNight', 'night'], ['tDates', 'dates'], ['tCities', 'cities']].forEach(function (p) { $(p[0]).setAttribute('aria-pressed', String(state[p[1]])); });
  }

  // =====================================================================
  // 迴圈
  // =====================================================================
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(loop); }
  function loop(tnow) {
    raf = 0;
    if (state.flying) stepFlight(tnow);
    else if (state.playing) stepPlay(tnow);
    let busy = false;
    if (view3 && view3.active) { view3.frame(tnow); busy = view3.busy(); }
    else drawMap();
    if (state.flying || state.playing || busy) raf = requestAnimationFrame(loop);
  }

  // =====================================================================
  // 3D 地球儀
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  /** 3D 用的地球貼圖（等距圓柱，中央經線 0°）：海、陸地、時區瓣、日期色、換日線與午夜線 */
  function globeTexture(px) {
    const w = px, h = px / 2, c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const x0 = function (lon) { return (lon + 180) / 360 * w; }, y0 = function (lat) { return (90 - lat) / 180 * h; };
    g.fillStyle = C['tz-ocean']; g.fillRect(0, 0, w, h);
    const path = new Path2D();
    WORLD.land.forEach(function (poly) {
      poly.forEach(function (ring) {
        WORLD.decode(ring).forEach(function (p, i) { if (i) path.lineTo(x0(p[0]), y0(p[1])); else path.moveTo(x0(p[0]), y0(p[1])); });
        path.closePath();
      });
    });
    g.fillStyle = C['tz-land']; g.fill(path, 'evenodd');
    g.strokeStyle = D.alpha(C['tz-coast'], 0.9); g.lineWidth = Math.max(1, px / 1400); g.stroke(path);
    const shares = K.dateShares(state.day, state.utc), dayMin = shares[0].day;
    for (let z = -12; z <= 12; z++) {
      const b = K.zoneBounds(z), L = K.local(state.day, state.utc, z);
      if (state.dates) {
        g.fillStyle = D.alpha(shares.length > 1 && L.day > dayMin ? C['tz-dateB'] : C['tz-dateA'], 0.2);
        g.fillRect(x0(b[0]), 0, x0(b[1]) - x0(b[0]), h);
      }
      if (state.zones && z % 2) { g.fillStyle = 'rgba(20,40,70,0.07)'; g.fillRect(x0(b[0]), 0, x0(b[1]) - x0(b[0]), h); }
    }
    if (state.zones) {
      g.strokeStyle = D.alpha(C['tz-grid'], 0.8); g.lineWidth = Math.max(1, px / 1200);
      for (let z = -12; z <= 12; z++) { const x = x0(K.zoneBounds(z)[0]); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    }
    g.strokeStyle = D.alpha(C['tz-sun'], 0.8); g.lineWidth = Math.max(1, px / 1000); g.setLineDash([px / 120, px / 200]);
    [23.44, -23.44].forEach(function (lat) { g.beginPath(); g.moveTo(0, y0(lat)); g.lineTo(w, y0(lat)); g.stroke(); });
    g.setLineDash([]);
    g.strokeStyle = D.alpha(C['tz-grid'], 0.9);
    g.beginPath(); g.moveTo(0, y0(0)); g.lineTo(w, y0(0)); g.stroke();
    return c;
  }
  const bridge = {
    K: K, T: T, D: D, state: state, colors: function () { return C; }, reducedMotion: reducedMotion, num: num, hm: hm, dateTxt: dateTxt, offTxt: offTxt,
    globeTexture: globeTexture, probePlace: probePlace, cityName: cityName,
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
      if (window.TimeZones3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.TimeZones3D) return Promise.resolve(threeLib);
    const base3 = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/time-zones-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base3 + 'three.module.min.js'), import(base3 + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.TimeZones3D) throw new Error('time-zones-3d.js did not load');
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
      viewMsg.textContent = T('正在載入 3D 地球儀…', 'Loading the 3D globe…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        view3 = window.TimeZones3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        updateViewNotes();
        requestAnimationFrame(function () { if (view3) { view3.onShow(); requestDraw(); } });
        requestDraw();
        emit('tz', snapshot());
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
      emit('tz', snapshot());
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
  $('view2d').addEventListener('click', function () { acted(); setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  [['camSun', 'sun'], ['camNorth', 'north'], ['camSouth', 'south']].forEach(function (k) {
    $(k[0]).addEventListener('click', function () { if (view3) { view3.camTo(k[1]); bridge.onCam(k[1]); } });
  });

  // =====================================================================
  // 開始
  // =====================================================================
  readColors();
  refillSelects();
  syncSliders();
  elDur.value = String(state.dur);
  updateReadouts();
  function themeChanged() {
    readColors(); baseKey = '';
    refillSelects(); updateReadouts();
    $('play').textContent = state.playing ? T('❚❚ 暫停', '❚❚ Pause') : T('▶ 播放', '▶ Play');
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lw && cv.clientWidth > 0) { lw = cv.clientWidth; fit(); requestDraw(); }
    }).observe(stage);
  } else window.addEventListener('resize', function () { fit(); requestDraw(); });
  fit();
  setStatus(T('現在是 UTC 11月13日 00:00，臺北是早上 8 點。按「播放」讓時間走起來，或點地圖上任何地方看那裡幾點。', 'It is 00:00 UTC on Nov 13 — 8 a.m. in Taipei. Press Play to run the clock, or tap anywhere on the map to see the time there.'));
  requestDraw();
  window.__tz = { state: state, K: K, snapshot: snapshot, setView: setView,
    set: function (o) { acted(); if (o.day != null) state.day = o.day; if (o.utc != null) state.utc = o.utc; if (o.probe) state.probe = o.probe; if (o.center != null) state.center = o.center; normTime(); syncSliders(); afterChange(true); },
    fly: function (dep, arr, h) { state.dep = dep; state.arr = arr; state.dur = h; refillSelects(); $('fly').click(); },
    redraw: function () { drawMap(); } };
})();
