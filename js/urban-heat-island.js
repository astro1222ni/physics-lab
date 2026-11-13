/* urban-heat-island.js — 「都市熱島」的畫面與互動
 * 地表、溫度場、熱島強度全部在 urban-heat-island-core.js（HeatCore）；這裡只負責操作、繪圖與讀數。 */
(function () {
  'use strict';
  const K = window.HeatCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FONT = D.FONT;
  const N = K.N, CELL = K.CELL;

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = { P: $('hP'), wind: $('hWind'), hour: $('hHour'), cloud: $('hCloud'), green: $('hGreen'), cool: $('hCool') };
  // 人口滑桿：位置 0–1000 對應 1 萬–300 萬人（對數刻度），數值單位是萬人
  const PMIN = K.P_MIN / 1e4, PMAX = K.P_MAX / 1e4;
  const toWan = function (pos) { return PMIN * Math.pow(PMAX / PMIN, pos / 1000); };
  const toPos = function (w) { return 1000 * Math.log(w / PMIN) / Math.log(PMAX / PMIN); };
  if (window.LabNum) window.LabNum.register(el.P, { toValue: toWan, toPos: toPos, min: PMIN, max: PMAX, decimals: 1 });

  const state = { view: 'map', P: 5e5, wind: 1, hour: 21, cloud: 0.3, green: 0, cool: 0, parks: [], probe: null, acted: false };
  let R = null, syncing = false;
  const opts = function () { return { P: state.P, wind: state.wind, hour: state.hour, cloud: state.cloud, green: state.green, cool: state.cool, parks: state.parks }; };
  function recompute() { R = K.compute(opts()); fieldImg = null; }

  // ---------- 顏色與格式 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--uh-zero', '--uh-cold', '--uh-river', '--uh-park', '--uh-edge', '--uh-probe', '--uh-ground', '--uh-bldg', '--text', '--muted', '--border', '--surface', '--bg', '--accent']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    buildRamp();
    fieldImg = null;
  }
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    const s = v.toFixed(d == null ? 0 : d);
    return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s.replace(/^-/, '−');
  }
  const dT = function (v) { return (v >= 0.05 ? '+' : '') + num(v, 1) + ' °C'; };
  const popText = function (P) {
    const w = P / 1e4;
    return T((w >= 100 ? num(w, 0) : w >= 10 ? num(w, 0) : num(w, 1)) + ' 萬人', P >= 1e6 ? num(P / 1e6, P >= 1e7 ? 0 : 1) + ' million' : num(P / 1e3, 0) + ',000');
  };
  const hourText = function (h) { return (h < 10 ? '0' : '') + Math.round(h) + ':00'; };
  const kmDir = function (x, y) {
    const ew = Math.abs(x) < 0.3 ? '' : T((x > 0 ? '東 ' : '西 ') + num(Math.abs(x), 1) + ' km', num(Math.abs(x), 1) + ' km ' + (x > 0 ? 'E' : 'W'));
    const ns = Math.abs(y) < 0.3 ? '' : T((y > 0 ? '南 ' : '北 ') + num(Math.abs(y), 1) + ' km', num(Math.abs(y), 1) + ' km ' + (y > 0 ? 'S' : 'N'));
    if (!ew && !ns) return T('市中心', 'the centre');
    return T('市中心' + [ew, ns].filter(Boolean).join('、'), [ew, ns].filter(Boolean).join(', ') + ' of the centre');
  };
  function setText(id, s) { const e = $(id); if (e && e.textContent !== s) e.textContent = s; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function setStatus(s) { $('status').textContent = s; }
  function fsz() { return (window.LabSettings && window.LabSettings.get && +window.LabSettings.get('fs')) || 1; }
  const font = function (px, w) { return (w ? w + ' ' : '') + Math.round(px * Math.min(fsz(), 1.35)) + 'px ' + FONT; };

  // ---------- 色帶：溫差 −1 °C（藍）→ 0（中性）→ 9 °C 以上（深紫紅） ----------
  const WARM = [[1, '#f4e3a0'], [2.5, '#f2b14d'], [4.5, '#e2672f'], [6.5, '#b72a3a'], [9, '#6c1650']];
  let RAMP = null;               // 每 0.05 °C 一格的 [r, g, b]
  const RMIN = -1.5, RMAX = 10, RSTEP = 0.05;
  function rgbOf(c) { const m = String(c).match(/[\d.]+/g); if (/^#/.test(c)) { const h = c.slice(1); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; } return m ? [+m[0], +m[1], +m[2]] : [128, 128, 128]; }
  function buildRamp() {
    const stops = [[RMIN, C['uh-cold']], [0, C['uh-zero']]].concat(WARM).map(function (s) { return [s[0], rgbOf(s[1])]; });
    RAMP = [];
    for (let t = RMIN; t <= RMAX + 1e-9; t += RSTEP) {
      let a = stops[0], b = stops[stops.length - 1];
      for (let q = 0; q < stops.length - 1; q++) if (t >= stops[q][0] && t <= stops[q + 1][0]) { a = stops[q]; b = stops[q + 1]; break; }
      const u = b[0] > a[0] ? Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0]))) : 0;
      RAMP.push([0, 1, 2].map(function (i) { return Math.round(a[1][i] + (b[1][i] - a[1][i]) * u); }));
    }
  }
  function ramp(t) { const i = Math.max(0, Math.min(RAMP.length - 1, Math.round((t - RMIN) / RSTEP))); return RAMP[i]; }
  const rampCss = function (t, a) { const c = ramp(t); return a == null ? 'rgb(' + c.join(',') + ')' : 'rgba(' + c.join(',') + ',' + a + ')'; };

  // =====================================================================
  // 畫布
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let size = { w: 600, h: 480 };
  function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || 300, h = cv.clientHeight || 240;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    size = { w: w, h: h, dpr: dpr };
  }
  const narrow = function () { return size.w < 460; };

  // ---------- 溫度地圖 ----------
  let fieldImg = null;
  function fieldCanvas() {
    if (fieldImg) return fieldImg;
    const c = document.createElement('canvas'); c.width = N; c.height = N;
    const g = c.getContext('2d'), im = g.createImageData(N, N);
    for (let k = 0; k < N * N; k++) { const q = ramp(R.T[k]); im.data[4 * k] = q[0]; im.data[4 * k + 1] = q[1]; im.data[4 * k + 2] = q[2]; im.data[4 * k + 3] = 255; }
    g.putImageData(im, 0, 0);
    fieldImg = c;
    return c;
  }
  function mapView() {
    const pad = narrow() ? 6 : 12, cbw = narrow() ? 46 : 58, top = narrow() ? 8 : 10;
    const M = Math.max(120, Math.min(size.w - cbw - 2 * pad, size.h - top - pad));
    const x0 = Math.max(pad, (size.w - cbw - M) / 2);
    return { x0: x0, y0: top + Math.max(0, (size.h - top - pad - M) / 2), M: M, s: M / N, cbx: x0 + M + (narrow() ? 9 : 14) };
  }
  /** 格座標（可以是小數）→ 畫面 */
  function G(v, i, j) { return [v.x0 + i * v.s, v.y0 + j * v.s]; }
  // 等溫線（marching squares，用格子中心的值）
  function isolines(v, level) {
    const Tm = R.T, segs = [];
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
      const a = Tm[j * N + i], b = Tm[j * N + i + 1], c = Tm[(j + 1) * N + i + 1], d = Tm[(j + 1) * N + i];
      const idx = (a >= level ? 8 : 0) | (b >= level ? 4 : 0) | (c >= level ? 2 : 0) | (d >= level ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const lerp = function (p, q) { return (level - p) / (q - p); };
      const top = [i + 0.5 + lerp(a, b), j + 0.5], right = [i + 1.5, j + 0.5 + lerp(b, c)], bot = [i + 0.5 + lerp(d, c), j + 1.5], left = [i + 0.5, j + 0.5 + lerp(a, d)];
      const L = {
        1: [[left, bot]], 2: [[bot, right]], 3: [[left, right]], 4: [[top, right]], 5: [[left, top], [bot, right]], 6: [[top, bot]], 7: [[left, top]],
        8: [[left, top]], 9: [[top, bot]], 10: [[top, right], [left, bot]], 11: [[top, right]], 12: [[left, right]], 13: [[bot, right]], 14: [[left, bot]]
      }[idx];
      L.forEach(function (s) { segs.push(s); });
    }
    ctx.beginPath();
    segs.forEach(function (s) { const p = G(v, s[0][0], s[0][1]), q = G(v, s[1][0], s[1][1]); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); });
  }
  function drawWindBadge(x, y) {
    const w = state.wind;
    const txt = w < 0.05 ? T('無風', 'Calm') : T('西風 ' + num(w, 1) + ' m/s', 'West wind ' + num(w, 1) + ' m/s');
    D.pill(ctx, txt, x, y, C.text, 'left', font(12, 600));
    if (w >= 0.05) {
      const L = 10 + 3.2 * w, yy = y + 12;
      D.arrow(ctx, x + 4, yy, x + 4 + L, yy, D.alpha(C.text, 0.75), 2);
    }
  }
  function drawMap() {
    const v = mapView();
    D.backdrop(ctx, size.w, size.h);
    // 溫度場（雙線性放大，平滑）＋外框陰影
    ctx.save();
    ctx.shadowColor = D.alpha('#000000', D.dark ? 0.5 : 0.2); ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
    ctx.fillStyle = C['uh-zero']; ctx.fillRect(v.x0, v.y0, v.M, v.M);
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.rect(v.x0, v.y0, v.M, v.M); ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fieldCanvas(), v.x0, v.y0, v.M, v.M);
    // 河
    ctx.beginPath();
    for (let i = 0; i <= N; i += 0.5) { const p = G(v, i, K.riverJ(i)); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
    ctx.strokeStyle = D.alpha(C['uh-river'], 0.75); ctx.lineWidth = Math.max(2, 2.4 * v.s); ctx.lineCap = 'round'; ctx.stroke();
    ctx.strokeStyle = D.alpha('#ffffff', D.dark ? 0.18 : 0.35); ctx.lineWidth = Math.max(0.8, 0.6 * v.s); ctx.stroke();
    // 等溫線（每 1 °C；2、4、6、8 加粗）
    for (let lv = 1; lv <= 10; lv++) {
      if (R.max < lv) break;
      isolines(v, lv);
      ctx.strokeStyle = D.alpha(D.dark ? '#ffffff' : '#2a1a14', lv % 2 ? 0.25 : 0.5); ctx.lineWidth = lv % 2 ? 0.7 : 1.2; ctx.stroke();
    }
    // 都市的邊界（土地利用一半是都市的地方）
    const rr = K.radiusKm(state.P) / CELL;
    ctx.beginPath(); ctx.arc(v.x0 + K.CX * v.s, v.y0 + K.CY * v.s, rr * v.s, 0, 2 * Math.PI);
    ctx.setLineDash([6, 5]); ctx.strokeStyle = D.alpha(C['uh-edge'], 0.7); ctx.lineWidth = 1.4; ctx.stroke(); ctx.setLineDash([]);
    // 公園
    state.parks.forEach(function (p) {
      const c = G(v, p.i + 0.5, p.j + 0.5), r = (K.PARK_R + 0.5) * v.s;
      ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, 2 * Math.PI);
      ctx.fillStyle = D.alpha(C['uh-park'], 0.28); ctx.fill();
      ctx.strokeStyle = C['uh-park']; ctx.lineWidth = 2; ctx.stroke();
      treeIcon(c[0], c[1], Math.max(5, Math.min(9, r * 0.6)));
    });
    ctx.restore();
    // 外框
    ctx.strokeStyle = D.alpha(C.text, 0.35); ctx.lineWidth = 1; ctx.strokeRect(v.x0 + 0.5, v.y0 + 0.5, v.M - 1, v.M - 1);
    // 最熱點
    if (R.max > 0.05) {
      const pk = G(v, (R.maxK % N) + 0.5, Math.floor(R.maxK / N) + 0.5);
      ctx.beginPath(); ctx.moveTo(pk[0], pk[1] - 7); ctx.lineTo(pk[0] + 6, pk[1] + 4); ctx.lineTo(pk[0] - 6, pk[1] + 4); ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#3a0d1e'; ctx.lineWidth = 1.5; ctx.stroke();
      if (!state.probe || Math.hypot(state.probe.i - (R.maxK % N), state.probe.j - Math.floor(R.maxK / N)) > 12)
        D.haloText(ctx, T('最熱 ', 'Hottest ') + dT(R.max), pk[0], pk[1] - 11, C.text, 'center', 'bottom', font(12, 700));
    }
    // 溫度計
    if (state.probe) drawProbeMark(G(v, state.probe.i + 0.5, state.probe.j + 0.5));
    // 風、比例尺、北
    drawWindBadge(v.x0 + 8, v.y0 + 22);
    const sb = 5 / CELL * v.s, sx = v.x0 + 10, sy = v.y0 + v.M - 12;
    ctx.fillStyle = D.alpha(C.surface, 0.8); ctx.fillRect(sx - 4, sy - 16, sb + 8, 22);
    ctx.strokeStyle = C.text; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy - 3); ctx.lineTo(sx, sy); ctx.lineTo(sx + sb, sy); ctx.lineTo(sx + sb, sy - 3); ctx.stroke();
    D.haloText(ctx, '5 km', sx + sb / 2, sy - 4, C.text, 'center', 'bottom', font(11, 600));
    const nx = v.x0 + v.M - 14, ny = v.y0 + 16;
    D.arrow(ctx, nx, ny + 10, nx, ny - 6, C.text, 2);
    D.haloText(ctx, T('北', 'N'), nx, ny + 12, C.text, 'center', 'top', font(11, 700));
    drawColorbar(v.cbx, v.y0 + 6, v.M - 12);
  }
  function treeIcon(x, y, r) {
    ctx.save();
    ctx.fillStyle = D.shade(C['uh-park'], -0.25); ctx.fillRect(x - r * 0.12, y, r * 0.24, r * 0.8);
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.5, r * 0.1, x, y - r * 0.2, r);
    g.addColorStop(0, D.shade(C['uh-park'], 0.35)); g.addColorStop(1, D.shade(C['uh-park'], -0.15));
    ctx.beginPath(); ctx.arc(x, y - r * 0.2, r * 0.7, 0, 2 * Math.PI); ctx.fillStyle = g; ctx.fill();
    ctx.restore();
  }
  function drawProbeMark(p) {
    const s = summaryNow().probe;
    ctx.save();
    ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, 2 * Math.PI);
    ctx.fillStyle = D.alpha(C['uh-probe'], 0.18); ctx.fill();
    ctx.strokeStyle = C['uh-probe']; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(p[0], p[1], 2.5, 0, 2 * Math.PI); ctx.fillStyle = C['uh-probe']; ctx.fill();
    ctx.restore();
    if (s) {
      const right = state.probe.i < N / 2 || state.probe.i < (R.maxK % N);
      D.pill(ctx, num(s.t, 1) + ' °C（' + dT(s.dT) + '）', p[0] + (right ? 12 : -12), p[1] - 8, C['uh-probe'], right ? 'left' : 'right', font(12, 700));
    }
  }
  function drawColorbar(x, y, h) {
    const w = 12, lo = -1, hi = 10;
    const g = ctx.createLinearGradient(0, y + h, 0, y);
    for (let t = lo; t <= hi; t += 0.5) g.addColorStop((t - lo) / (hi - lo), rampCss(t));
    ctx.save();
    D.roundRect(ctx, x, y, w, h, 4); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = D.alpha(C.text, 0.35); ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = C.muted; ctx.font = font(11); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    [0, 2, 4, 6, 8, 10].forEach(function (t) {
      const yy = y + h - (t - lo) / (hi - lo) * h;
      ctx.fillRect(x + w, yy, 3, 1);
      ctx.fillText((t > 0 ? '+' : '') + t, x + w + 5, yy);
    });
    // 目前的熱島強度
    const ym = y + h - (Math.max(lo, Math.min(hi, R.max)) - lo) / (hi - lo) * h;
    ctx.beginPath(); ctx.moveTo(x - 2, ym); ctx.lineTo(x - 8, ym - 4); ctx.lineTo(x - 8, ym + 4); ctx.closePath(); ctx.fillStyle = C.text; ctx.fill();
    ctx.restore();
    D.haloText(ctx, '°C', x + w / 2, y - 2, C.muted, 'center', 'bottom', font(11, 600));
  }

  // ---------- 立體溫度曲面 ----------
  const ST = 2, NS = N / ST;       // 每 2 格取一點（40 × 40 個面）
  let surfOrder = null;
  function surfCam() {
    const az = -0.5, el = 0.52, ca = Math.cos(az), sa = Math.sin(az);
    const proj = function (i, j, z, s, ox, oy, hz) {
      const x = i - N / 2, y = j - N / 2;
      const xr = x * ca - y * sa, yr = x * sa + y * ca;
      return [ox + xr * s, oy + yr * s * Math.sin(el) - z * hz];
    };
    // 底板四角的範圍決定縮放
    const pts = [[0, 0], [N, 0], [N, N], [0, N]].map(function (q) { return proj(q[0], q[1], 0, 1, 0, 0, 0); });
    const xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    const bw = Math.max.apply(null, xs) - Math.min.apply(null, xs), bh = Math.max.apply(null, ys) - Math.min.apply(null, ys);
    const s = Math.min((size.w - 20) / bw, (size.h * 0.68 - 24) / bh);
    const topRoom = Math.min(size.h - bh * s - 24, size.h * 0.55);
    const ox = size.w / 2 - (Math.max.apply(null, xs) + Math.min.apply(null, xs)) / 2 * s;
    const oy = topRoom + 12 - Math.min.apply(null, ys) * s;
    const hz = 0.9 * topRoom / 10;
    return { P: function (i, j, z) { return proj(i, j, z, s, ox, oy, hz); }, ca: ca, sa: sa, s: s, hz: hz };
  }
  function drawSurface() {
    D.backdrop(ctx, size.w, size.h);
    const cam = surfCam();
    if (!surfOrder) {
      surfOrder = [];
      for (let b = 0; b < NS; b++) for (let a = 0; a < NS; a++) surfOrder.push([a, b]);
      surfOrder.sort(function (p, q) {
        const dp = (p[0] - NS / 2) * cam.sa + (p[1] - NS / 2) * cam.ca, dq = (q[0] - NS / 2) * cam.sa + (q[1] - NS / 2) * cam.ca;
        return dp - dq;
      });
    }
    const Z = function (i, j) {
      i = Math.max(0, Math.min(N - 1, i)); j = Math.max(0, Math.min(N - 1, j));
      return Math.max(-1, R.T[j * N + i]);
    };
    // 底板的陰影與側面
    const c0 = cam.P(0, 0, 0), c1 = cam.P(N, 0, 0), c2 = cam.P(N, N, 0), c3 = cam.P(0, N, 0);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(c0[0], c0[1]); ctx.lineTo(c1[0], c1[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(c3[0], c3[1]); ctx.closePath();
    ctx.shadowColor = D.alpha('#000000', D.dark ? 0.55 : 0.25); ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
    ctx.fillStyle = C['uh-zero']; ctx.fill();
    ctx.restore();
    const light = [-0.5, -0.6, 0.62];
    surfOrder.forEach(function (q) {
      const i = q[0] * ST, j = q[1] * ST;
      const z00 = Z(i, j), z10 = Z(i + ST, j), z11 = Z(i + ST, j + ST), z01 = Z(i, j + ST);
      const p00 = cam.P(i, j, z00), p10 = cam.P(i + ST, j, z10), p11 = cam.P(i + ST, j + ST, z11), p01 = cam.P(i, j + ST, z01);
      // 法向量（高度放大，讓起伏的明暗看得出來）
      const ex = 3 * ((z10 + z11) - (z00 + z01)) / 2, ey = 3 * ((z01 + z11) - (z00 + z10)) / 2;
      const nx = -ex, ny = -ey, nz = ST, nl = Math.hypot(nx, ny, nz);
      const lam = Math.max(0, (nx * light[0] + ny * light[1] + nz * light[2]) / nl);
      const shade = 0.72 + 0.4 * lam;
      const t = (z00 + z10 + z11 + z01) / 4, c = ramp(t);
      let rgb = c.map(function (x) { return Math.max(0, Math.min(255, Math.round(x * shade))); });
      // 河與公園的格子帶一點顏色
      const k = (j + 1) * N + (i + 1);
      if (R.lc.water[k]) rgb = rgb.map(function (x, n) { return Math.round(0.55 * x + 0.45 * rgbOf(C['uh-river'])[n]); });
      else if (R.lc.park[k]) rgb = rgb.map(function (x, n) { return Math.round(0.5 * x + 0.5 * rgbOf(C['uh-park'])[n]); });
      ctx.beginPath(); ctx.moveTo(p00[0], p00[1]); ctx.lineTo(p10[0], p10[1]); ctx.lineTo(p11[0], p11[1]); ctx.lineTo(p01[0], p01[1]); ctx.closePath();
      const col = 'rgb(' + rgb.join(',') + ')';
      ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = D.alpha(D.dark ? '#000000' : '#3a2a20', 0.12); ctx.lineWidth = 0.5; ctx.stroke();
    });
    // 高度尺（在底板左邊的角）
    const base = cam.P(0, 0, 0);
    ctx.save();
    ctx.strokeStyle = D.alpha(C.text, 0.6); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(base[0], base[1] - 10 * cam.hz); ctx.stroke();
    ctx.restore();
    [2, 4, 6, 8, 10].forEach(function (t) {
      const y = base[1] - t * cam.hz;
      ctx.fillStyle = D.alpha(C.text, 0.6); ctx.fillRect(base[0] - 3, y, 6, 1);
      D.haloText(ctx, '+' + t + (t === 10 ? ' °C' : ''), base[0] + 6, y, C.muted, 'left', 'middle', font(11, 600));
    });
    // 最熱點的標示
    if (R.max > 0.05) {
      const i = R.maxK % N, j = Math.floor(R.maxK / N), p = cam.P(i, j, R.max);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], p[1] - 18); ctx.strokeStyle = C.text; ctx.lineWidth = 1.2; ctx.stroke();
      D.pill(ctx, T('最熱 ', 'Hottest ') + dT(R.max), p[0], p[1] - 20, C.text, 'center', font(12, 700));
    }
    if (state.probe) {
      const s = summaryNow().probe, p = cam.P(state.probe.i + 0.5, state.probe.j + 0.5, Math.max(0, s.dT));
      ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, 2 * Math.PI); ctx.fillStyle = C['uh-probe']; ctx.fill();
      ctx.strokeStyle = C.surface; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // 風
    drawWindBadge(10, 22);
    const w0 = cam.P(0, N / 2, 0);
    D.haloText(ctx, T('西', 'W'), w0[0] - 6, w0[1], C.muted, 'right', 'middle', font(12, 700));
    const e0 = cam.P(N, N / 2, 0);
    D.haloText(ctx, T('東', 'E'), e0[0] + 6, e0[1], C.muted, 'left', 'middle', font(12, 700));
  }

  // ---------- 東西剖面 ----------
  function plotBox(padL, padB) {
    const L = padL, Rr = 14, Tp = 30, B = padB;
    return { x0: L, y0: Tp, w: size.w - L - Rr, h: size.h - Tp - B };
  }
  function drawProfile() {
    D.backdrop(ctx, size.w, size.h);
    const box = plotBox(narrow() ? 40 : 48, narrow() ? 74 : 84);
    const ymax = Math.max(4, Math.ceil(Math.max(R.max, R.maxBase) + 1)), ymin = -1;
    const X = function (km) { return box.x0 + (km + 20) / 40 * box.w; };
    const Y = function (t) { return box.y0 + (ymax - t) / (ymax - ymin) * box.h; };
    // 格線
    ctx.save();
    ctx.strokeStyle = D.alpha(C.text, 0.1); ctx.lineWidth = 1; ctx.fillStyle = C.muted; ctx.font = font(11); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const step = ymax > 8 ? 2 : 1;
    for (let t = 0; t <= ymax; t += step) { ctx.beginPath(); ctx.moveTo(box.x0, Y(t)); ctx.lineTo(box.x0 + box.w, Y(t)); ctx.stroke(); ctx.fillText((t ? '+' : '') + t, box.x0 - 5, Y(t)); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let km = -20; km <= 20; km += 5) { ctx.beginPath(); ctx.moveTo(X(km), box.y0); ctx.lineTo(X(km), box.y0 + box.h); ctx.stroke(); }
    ctx.restore();
    D.haloText(ctx, T('比郊區高（°C）', 'Warmer than countryside (°C)'), box.x0, box.y0 - 6, C.muted, 'left', 'bottom', font(11, 600));
    // 地面與城市剪影
    const gy = box.y0 + box.h + 4, gh = narrow() ? 40 : 46;
    const row = Math.floor(K.CY);
    ctx.save();
    ctx.fillStyle = D.alpha(C['uh-ground'], 0.55); ctx.fillRect(box.x0, gy + gh - 8, box.w, 8);
    for (let i = 0; i < N; i++) {
      const k = row * N + i, x = X((i - K.CX) * CELL), w = box.w / N + 0.3;
      if (R.lc.park[k] || R.lc.park[k - N]) { treeIcon(x + w / 2, gy + gh - 16, 6); continue; }
      const imp = Math.max(R.lc.imp[k], R.lc.imp[k - N]), urb = R.lc.urb[k];
      if (urb > 0.15) {
        const hgt = (gh - 10) * Math.min(1, imp * (0.45 + 0.55 * K.hash(i, 7, 3)) * (0.5 + 0.6 * urb));
        ctx.fillStyle = D.shade(C['uh-bldg'], (K.hash(i, 3, 9) - 0.5) * 0.25);
        ctx.fillRect(x, gy + gh - 8 - hgt, w, hgt);
      } else if (i % 3 === 0) {
        ctx.fillStyle = D.alpha(C['uh-park'], 0.55); ctx.fillRect(x, gy + gh - 12, w * 2, 4);
      }
    }
    ctx.restore();
    // 沒有對策時的曲線（虛線）
    const amp = R.amp, B = K.base(state.P, state.wind).T;
    const mit = state.green > 0 || state.cool > 0 || state.parks.length > 0;
    if (mit) {
      ctx.beginPath();
      for (let i = 0; i < N; i++) { const t = (B[row * N + i] + B[(row - 1) * N + i]) / 2 * amp, x = X((i + 0.5 - K.CX) * CELL); if (i) ctx.lineTo(x, Y(t)); else ctx.moveTo(x, Y(t)); }
      ctx.setLineDash([6, 5]); ctx.strokeStyle = D.alpha(C.text, 0.55); ctx.lineWidth = 1.6; ctx.stroke(); ctx.setLineDash([]);
    }
    // 現在的曲線：下面塗上色帶
    const pts = [];
    for (let i = 0; i < N; i++) pts.push([X((i + 0.5 - K.CX) * CELL), Y(R.profile[i])]);
    const grad = ctx.createLinearGradient(0, Y(ymax), 0, Y(0));
    for (let t = 0; t <= ymax; t += 0.5) grad.addColorStop(1 - t / ymax, rampCss(t, 0.65));
    ctx.save();
    ctx.beginPath(); ctx.moveTo(pts[0][0], Y(0)); pts.forEach(function (p) { ctx.lineTo(p[0], p[1]); }); ctx.lineTo(pts[N - 1][0], Y(0)); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.strokeStyle = D.dark ? '#ffd6a0' : '#8a1d2c'; ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.restore();
    // 郊區的零線
    ctx.beginPath(); ctx.moveTo(box.x0, Y(0)); ctx.lineTo(box.x0 + box.w, Y(0)); ctx.strokeStyle = D.alpha(C.text, 0.6); ctx.lineWidth = 1.2; ctx.stroke();
    // 溫度計（在剖面線上才畫）
    if (state.probe && Math.abs(state.probe.j - row + 0.5) <= 1) {
      const s = summaryNow().probe, x = X(s.x);
      ctx.beginPath(); ctx.moveTo(x, box.y0); ctx.lineTo(x, gy + gh); ctx.strokeStyle = D.alpha(C['uh-probe'], 0.6); ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(x, Y(s.dT), 4.5, 0, 2 * Math.PI); ctx.fillStyle = C['uh-probe']; ctx.fill();
      D.pill(ctx, num(s.t, 1) + ' °C', x, Y(s.dT) - 8, C['uh-probe'], 'center', font(12, 700));
    }
    // 最熱點
    let pi = 0; for (let i = 1; i < N; i++) if (R.profile[i] > R.profile[pi]) pi = i;
    const probeNear = state.probe && Math.abs(state.probe.j - row + 0.5) <= 1 && Math.abs(state.probe.i - pi) < 8;
    if (R.profile[pi] > 0.1 && !probeNear) D.haloText(ctx, dT(R.profile[pi]), pts[pi][0], pts[pi][1] - 6, C.text, 'center', 'bottom', font(12, 700));
    // 文字：郊區、市中心
    const ly = gy + gh + 4;
    D.haloText(ctx, T('西邊郊區', 'West countryside'), box.x0, ly, C.muted, 'left', 'top', font(11, 600));
    D.haloText(ctx, T('市中心', 'Centre'), X(0), ly, C.muted, 'center', 'top', font(11, 600));
    D.haloText(ctx, T('東邊郊區', 'East countryside'), box.x0 + box.w, ly, C.muted, 'right', 'top', font(11, 600));
    drawWindBadge(box.x0 + 8, box.y0 + 18);
  }

  // ---------- 人口與強度 ----------
  function drawOke() {
    D.backdrop(ctx, size.w, size.h);
    const box = plotBox(narrow() ? 40 : 50, narrow() ? 46 : 50);
    const lx0 = Math.log10(K.P_MIN), lx1 = Math.log10(K.P_MAX), ymax = 10;
    const X = function (P) { return box.x0 + (Math.log10(P) - lx0) / (lx1 - lx0) * box.w; };
    const Y = function (t) { return box.y0 + (ymax - t) / ymax * box.h; };
    ctx.save();
    ctx.strokeStyle = D.alpha(C.text, 0.1); ctx.lineWidth = 1; ctx.fillStyle = C.muted; ctx.font = font(11); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let t = 0; t <= ymax; t += 2) { ctx.beginPath(); ctx.moveTo(box.x0, Y(t)); ctx.lineTo(box.x0 + box.w, Y(t)); ctx.stroke(); ctx.fillText(String(t), box.x0 - 5, Y(t)); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    [1e4, 3e4, 1e5, 3e5, 1e6, 3e6].forEach(function (P) {
      ctx.beginPath(); ctx.moveTo(X(P), box.y0); ctx.lineTo(X(P), box.y0 + box.h); ctx.stroke();
      const lab = T(P / 1e4 + '萬', P >= 1e6 ? P / 1e6 + 'M' : P / 1e3 + 'k');
      if (!(narrow() && (P === 3e4 || P === 3e5))) ctx.fillText(lab, X(P), box.y0 + box.h + 4);
    });
    ctx.restore();
    D.haloText(ctx, T('熱島強度（°C）', 'Heat-island intensity (°C)'), box.x0, box.y0 - 6, C.muted, 'left', 'bottom', font(11, 600));
    D.haloText(ctx, T('人口（萬人，對數刻度）', 'Population (log scale)'), box.x0 + box.w, box.y0 + box.h + 22, C.muted, 'right', 'top', font(11, 600));
    // Oke 的線（晴朗無風的夜晚）
    const line = function (f, color, dash, wdt) {
      ctx.beginPath();
      for (let q = 0; q <= 100; q++) { const P = Math.pow(10, lx0 + (lx1 - lx0) * q / 100), y = Y(f(P)); if (q) ctx.lineTo(X(P), y); else ctx.moveTo(X(P), y); }
      ctx.setLineDash(dash || []); ctx.strokeStyle = color; ctx.lineWidth = wdt || 2.4; ctx.stroke(); ctx.setLineDash([]);
    };
    line(K.oke, C.accent, null, 2.6);
    const fac = K.hourFactor(state.hour) * K.cloudFactor(state.cloud);
    line(function (P) { return K.oke(P) * K.windFactor(state.wind, P) * fac; }, D.alpha(C.text, 0.6), [6, 5], 1.8);
    // 人口多 10 倍：多 2.01 °C
    const a = 3e4, b = 3e5, ya = Y(K.oke(a)), yb = Y(K.oke(b));
    ctx.save(); ctx.strokeStyle = D.alpha(C.accent, 0.7); ctx.lineWidth = 1.2; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(X(a), ya); ctx.lineTo(X(b), ya); ctx.lineTo(X(b), yb); ctx.stroke(); ctx.restore();
    D.haloText(ctx, T('×10 人', '×10 people'), (X(a) + X(b)) / 2, ya + 4, C.accent, 'center', 'top', font(11, 600));
    D.haloText(ctx, '+2.0 °C', X(b) + 5, (ya + yb) / 2, C.accent, 'left', 'middle', font(11, 600));
    // 標籤
    const lp = 1.6e6;
    D.haloText(ctx, T('Oke：晴朗無風的夜晚', 'Oke: clear, calm night'), X(lp), Y(K.oke(lp)) - 8, C.accent, 'right', 'bottom', font(12, 700));
    // 目前的城市
    const x = X(state.P);
    ctx.beginPath(); ctx.arc(x, Y(R.oke), 5, 0, 2 * Math.PI); ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.fillStyle = C.surface; ctx.fill(); ctx.stroke();
    D.ball(ctx, x, Y(R.max), 7, rampCss(Math.max(1, R.max)), { shadow: true });
    const right = x < box.x0 + box.w * 0.6;
    D.pill(ctx, T('這座城市 ', 'This city ') + dT(R.max), x + (right ? 12 : -12), Y(R.max) + 18, C.text, right ? 'left' : 'right', font(12, 700));
  }

  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame() {
    raf = 0;
    if (!R) recompute();
    if (state.view === 'surface') drawSurface();
    else if (state.view === 'profile') drawProfile();
    else if (state.view === 'oke') drawOke();
    else drawMap();
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  let sumCache = null;
  function summaryNow() {
    if (!sumCache) sumCache = K.summary(opts(), state.probe, R);
    return sumCache;
  }
  function legendHTML() {
    const sw = function (c, txt, ring) { return '<span><i style="display:inline-block;width:12px;height:12px;border-radius:' + (ring ? '50%' : '3px') + ';' + (ring ? 'border:2px solid ' + c : 'background:' + c) + ';vertical-align:-1px;margin-right:4px"></i>' + txt + '</span> '; };
    if (state.view === 'oke') return sw(C.accent, T('Oke 的經驗式（晴朗無風的夜晚）', 'Oke’s formula (clear, calm night)')) + sw(D.alpha(C.text, 0.6), T('虛線：目前的風、雲、時刻', 'Dashed: current wind, cloud and hour'));
    if (state.view === 'profile') return sw(D.dark ? '#ffd6a0' : '#8a1d2c', T('通過市中心的東西向溫差', 'Temperature excess along the east–west line through the centre')) + ((state.green || state.cool || state.parks.length) ? sw(D.alpha(C.text, 0.55), T('虛線：沒有降溫對策', 'Dashed: without cooling measures')) : '');
    return sw(rampCss(5), T('比郊區暖', 'Warmer than the countryside')) + sw(C['uh-river'], T('河', 'River')) + sw(C['uh-park'], T('公園', 'Park'), true) + sw(C['uh-edge'], T('虛線圓：都市範圍', 'Dashed circle: built-up area'), true);
  }
  function updateReadouts() {
    setOut(el.P, num(state.P / 1e4, state.P < 1e5 ? 1 : 0));
    setOut(el.wind, num(state.wind, 1)); setOut(el.hour, hourText(state.hour)); setOut(el.cloud, num(10 * state.cloud, 0));
    setOut(el.green, num(100 * state.green, 0)); setOut(el.cool, num(100 * state.cool, 0));
    const s = summaryNow();
    setText('rMax', dT(s.max));
    setText('rCenter', dT(s.center) + T('（' + num(s.rural + s.center, 1) + ' °C）', ' (' + num(s.rural + s.center, 1) + ' °C)'));
    setText('rRural', num(s.rural, 1) + ' °C');
    setText('rProbe', s.probe ? num(s.probe.t, 1) + ' °C（' + dT(s.probe.dT) + '）' : T('點地圖放溫度計', 'Tap the map'));
    setText('rPeak', s.max > 0.05 ? kmDir(s.peakKm, (Math.floor(R.maxK / N) + 0.5 - K.CY) * CELL) : '—');
    setText('rArea', num(s.area2, 0) + ' km²');
    setText('rUc', num(s.ucrit, 1) + ' m/s');
    $('legend').innerHTML = legendHTML();
    $('parkBtn').disabled = !state.probe;
    $('clearBtn').disabled = !state.parks.length;
    setText('parkHint', state.parks.length ? T('公園 ' + state.parks.length + ' / ' + K.MAX_PARKS + ' 座（種第 4 座時，最早的那座會被移走）。', state.parks.length + ' of ' + K.MAX_PARKS + ' parks (a fourth one replaces the oldest).') : T('先點地圖放溫度計，再在那裡種公園（直徑 2 km）。', 'Tap the map to place the thermometer, then plant a park (2 km across) there.'));
    setText('cvHint', state.view === 'map' ? T('點地圖移動溫度計；方向鍵也可以（Shift 一次 2.5 km）。', 'Tap the map to move the thermometer, or use the arrow keys (Shift for 2.5 km).') : state.view === 'profile' ? T('點剖面，把溫度計放在這條東西線上。', 'Tap the profile to put the thermometer on this line.') : state.view === 'surface' ? T('高度和顏色都是比郊區高多少度。', 'Height and colour both show how much warmer than the countryside.') : T('實心點是這座城市現在的熱島強度；空心點是 Oke 公式的預測。', 'The solid dot is this city now; the hollow dot is Oke’s prediction.'));
    $('srNow').textContent = T('熱島強度 ', 'Heat-island intensity ') + dT(s.max);
  }
  function say() {
    const s = summaryNow();
    if (s.max < 0.005) { setStatus(T('風速已超過臨界風速 ' + num(s.ucrit, 1) + ' m/s：城裡和郊區的空氣混在一起，看不出熱島。', 'The wind is above the critical speed of ' + num(s.ucrit, 1) + ' m/s: city air and country air are mixed and the island has gone.')); return; }
    setStatus(T(hourText(state.hour) + '，' + popText(state.P) + '的城市最熱的地方比郊區高 ' + num(s.max, 1) + ' °C（同樣人口在晴朗無風的夜晚約 ' + num(s.oke, 1) + ' °C）。',
      'At ' + hourText(state.hour) + ', the hottest spot in a city of ' + popText(state.P) + ' is ' + num(s.max, 1) + ' °C warmer than the countryside (about ' + num(s.oke, 1) + ' °C on a clear, calm night).'));
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function snapshot(act) {
    const m = summaryNow();
    const out = {};
    Object.keys(m).forEach(function (k) { out[k] = m[k]; });
    out.probe = m.probe ? Object.assign({}, m.probe) : null;
    out.act = act || 'param';
    out.view = state.view;
    return out;
  }
  let lastEmit = 0, emitTimer = 0;
  function emit(data) { if (state.acted && window.LabMission) window.LabMission.emit('uhi', data); }
  function acted() { state.acted = true; }
  function afterChange(force, act, sameField) {
    if (!sameField) recompute();
    sumCache = null;
    updateReadouts();
    requestDraw();
    const now = performance.now();
    clearTimeout(emitTimer);
    if (force || now - lastEmit > 250) { lastEmit = now; emit(snapshot(act)); }
    else emitTimer = setTimeout(function () { lastEmit = performance.now(); emit(snapshot(act)); }, 270);
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  const setSl = function (inp, v) { if (window.LabNum) window.LabNum.set(inp, v); else inp.value = v; };
  function readSliders() {
    state.P = Math.round(Math.max(PMIN, Math.min(PMAX, val(el.P))) * 10) * 1e3;
    state.wind = Math.max(0, Math.min(10, Math.round(val(el.wind) * 10) / 10));
    state.hour = Math.max(0, Math.min(24, Math.round(val(el.hour))));
    state.cloud = Math.max(0, Math.min(10, Math.round(val(el.cloud)))) / 10;
    state.green = Math.max(0, Math.min(50, Math.round(val(el.green)))) / 100;
    state.cool = Math.max(0, Math.min(100, Math.round(val(el.cool)))) / 100;
  }
  const KEY_OF = { hP: 'P', hWind: 'wind', hHour: 'hour', hCloud: 'cloud', hGreen: 'green', hCool: 'cool' };
  function sliderChanged(e) {
    if (syncing) return;
    acted(); readSliders();
    afterChange(e.type === 'change', KEY_OF[e.target.id] || 'param');
    if (e.type === 'change') say();
  }
  Object.keys(el).forEach(function (k) { el[k].addEventListener('input', sliderChanged); el[k].addEventListener('change', sliderChanged); });
  function syncSeg() {
    document.querySelectorAll('#viewSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === state.view)); });
  }
  document.querySelectorAll('#viewSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); state.view = b.getAttribute('data-view'); syncSeg(); afterChange(true, 'view', true);
      if (state.view === 'surface') setStatus(T('溫度越高，曲面越高：城市像一座浮在郊區上面的暖空氣島。', 'The warmer, the higher: the city stands above the countryside like an island of warm air.'));
      else if (state.view === 'profile') setStatus(T('從郊區走進城裡，溫度先陡升（城市邊緣），再緩緩上升，在市中心附近最高。', 'Walking in from the countryside, the temperature jumps at the edge of the city, then rises slowly to a peak near the centre.'));
      else if (state.view === 'oke') setStatus(T('人口每多 10 倍，晴朗無風夜晚的熱島強度大約多 2 °C。', 'Each tenfold increase in population adds about 2 °C on a clear, calm night.'));
      else say();
    });
  });
  function placeProbe(i, j, act) {
    state.probe = { i: Math.max(0, Math.min(N - 1, i)), j: Math.max(0, Math.min(N - 1, j)) };
    sumCache = null;
    afterChange(true, act || 'probe', true);
    const p = summaryNow().probe;
    const where = p.water ? T('（河上）', ' (on the river)') : p.park ? T('（公園裡）', ' (in a park)') : p.urb >= 0.5 ? T('（市區）', ' (built-up area)') : T('（郊區）', ' (countryside)');
    setStatus(T('溫度計在' + kmDir(p.x, p.y) + where + '：' + num(p.t, 1) + ' °C，比郊區' + (p.dT >= 0 ? '高 ' : '低 ') + num(Math.abs(p.dT), 1) + ' °C。',
      'Thermometer ' + kmDir(p.x, p.y) + where + ': ' + num(p.t, 1) + ' °C, ' + num(Math.abs(p.dT), 1) + ' °C ' + (p.dT >= 0 ? 'warmer' : 'cooler') + ' than the countryside.'));
  }
  $('parkBtn').addEventListener('click', function () {
    if (!state.probe) return;
    acted();
    if (state.parks.length >= K.MAX_PARKS) state.parks.shift();
    state.parks.push({ i: state.probe.i, j: state.probe.j });
    afterChange(true, 'park');
    const s = summaryNow();
    setStatus(T('種了公園。市中心比郊區高 ' + num(s.center, 1) + ' °C（沒有公園時 ' + num(s.centerNoPark, 1) + ' °C）。', 'Park planted. The centre is ' + num(s.center, 1) + ' °C above the countryside (' + num(s.centerNoPark, 1) + ' °C without parks).'));
  });
  $('clearBtn').addEventListener('click', function () {
    acted(); state.parks = []; afterChange(true, 'clear');
    setStatus(T('公園都清除了。', 'All parks cleared.'));
  });

  // ---------- 點選 ----------
  function local(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  cv.addEventListener('pointerdown', function (e) {
    acted();
    const q = local(e);
    if (state.view === 'map') {
      const v = mapView(), i = Math.floor((q[0] - v.x0) / v.s), j = Math.floor((q[1] - v.y0) / v.s);
      if (i < 0 || j < 0 || i >= N || j >= N) return;
      placeProbe(i, j, 'probe');
    } else if (state.view === 'profile') {
      const box = plotBox(narrow() ? 40 : 48, narrow() ? 74 : 84), km = (q[0] - box.x0) / box.w * 40 - 20;
      if (km < -20 || km > 20) return;
      placeProbe(Math.floor(km / CELL + K.CX), Math.floor(K.CY), 'probe');
    }
  });

  if (window.LabKeys) window.LabKeys.attach(cv, {
    label: T('都市熱島的溫度地圖。按 Enter 選溫度計，用方向鍵移動（Shift 一次 2.5 km）。', 'Temperature map of the heat island. Press Enter to pick the thermometer and move it with the arrow keys (Shift for 2.5 km).'),
    items: [{
      name: function () { return T('溫度計', 'Thermometer'); },
      move: function (dx, dy, big) {
        acted();
        const st = big ? 5 : 1, p = state.probe || { i: K.CX, j: K.CY };
        placeProbe(p.i + dx * st, p.j + dy * st, 'probe'); return true;
      },
      describe: function () { return $('status').textContent; }
    }],
    onChange: function () { requestDraw(); }
  });

  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { v: state.view, k: state.parks.map(function (p) { return [p.i, p.j]; }), t: state.probe ? [state.probe.i, state.probe.j] : null }; },
    set: function (o) {
      if (!o) return;
      if (['map', 'surface', 'profile', 'oke'].indexOf(o.v) >= 0) state.view = o.v;
      const ok = function (a) { return Array.isArray(a) && a.length === 2 && a.every(function (x) { return Number.isInteger(x) && x >= 0 && x < N; }); };
      if (Array.isArray(o.k)) state.parks = o.k.filter(ok).slice(0, K.MAX_PARKS).map(function (a) { return { i: a[0], j: a[1] }; });
      if (ok(o.t)) state.probe = { i: o.t[0], j: o.t[1] };
      readSliders(); syncSeg(); recompute(); sumCache = null; updateReadouts(); requestDraw();
    }
  });

  window.__uhi = { state: state, K: K, snapshot: snapshot, redraw: requestDraw, refresh: function (act) { readSliders(); syncSeg(); afterChange(true, act || 'param'); }, placeProbe: placeProbe };

  readColors();
  syncing = true; setSl(el.P, 50); syncing = false;
  readSliders();
  syncSeg();
  fit();
  recompute();
  updateReadouts();
  function themeChanged() { readColors(); updateReadouts(); requestDraw(); }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  let rsTimer = 0;
  window.addEventListener('resize', function () { clearTimeout(rsTimer); rsTimer = setTimeout(function () { fit(); requestDraw(); }, 60); });
  if (window.ResizeObserver) new ResizeObserver(function () { fit(); requestDraw(); }).observe(cv);
  say();
  requestDraw();
})();
