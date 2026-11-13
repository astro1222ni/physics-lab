/* climograph.js — 「氣候圖與柯本氣候分類」的畫面與互動
 * 判定規則與測站資料都在 climograph-core.js；海岸線在 geog-world.js。
 * 三種檢視：氣候圖（拖曳修改 12 個月）、乾燥界線（年均溫－年雨量圖）、測站地圖（世界／臺灣）。 */
(function () {
  'use strict';
  const K = window.ClimographCore;
  const WORLD = window.GeogWorld;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const FONT = D.FONT;
  const REGIONS = [['tw', '臺灣', 'Taiwan'], ['as', '亞洲', 'Asia'], ['eu', '歐洲', 'Europe'], ['af', '非洲', 'Africa'],
    ['na', '北美洲', 'North America'], ['sa', '南美洲', 'South America'], ['oc', '大洋洲', 'Oceania']];
  const MAXPIN = 3;
  const PIN_COLORS = ['cl-pin1', 'cl-pin2', 'cl-pin3'];
  const ORDER_JAN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], ORDER_JUL = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5];
  const DEF = 'taipei';

  const s0 = K.STATION[DEF];
  const state = {
    base: DEF, T: s0.T.slice(), P: s0.P.slice(), south: s0.south, cd: 0, startJul: false,
    view: 'chart', scope: 'world', marks: true, pins: [], sel: { m: 0, kind: 'T' }, hover: -1, acted: false
  };

  // ---------- 文字格式 ----------
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = (+v).toFixed(d == null ? 0 : d);
    if (/^-0(\.0*)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  const degC = function (v) { return num(v, 1) + ' °C'; };
  const mm = function (v, d) { return num(v, d == null ? (Math.abs(v) < 100 ? 1 : 0) : d) + ' mm'; };
  const monthName = function (i) { return T(K.MONTH_ZH[i], K.MONTH_EN[i]); };
  const stName = function (s) { return s ? T(s.zh, s.en) : ''; };
  const typeName = function (code) { const t = K.TYPES[code]; return t ? T(t[0], t[1]) : code; };
  const typeColor = function (code) { return (K.TYPES[code] || ['', '', '#999999'])[2]; };
  const groupName = function (g) { const t = K.GROUPS[g]; return t ? T(t[0], t[1]) : g; };
  function darkChip(hex) { const r = D.rgb(hex); return 0.2126 * r[0] + 0.7152 * r[1] + 0.0722 * r[2] < 130; }
  function latLon(s) { return num(Math.abs(s.lat), 1) + '°' + (s.lat >= 0 ? 'N' : 'S') + '　' + num(Math.abs(s.lon), 1) + '°' + (s.lon >= 0 ? 'E' : 'W'); }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setText(id, t) { const e = $(id); if (e && e.textContent !== t) e.textContent = t; }
  function setStatus(s) { $('status').innerHTML = s; }
  const esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  // ---------- 資料 ----------
  const r1 = function (v) { return Math.round(v * 10) / 10; };
  const clampT = function (v) { return r1(Math.max(K.T_MIN, Math.min(K.T_MAX, v))); };
  const clampP = function (v) { return r1(Math.max(0, Math.min(K.P_MAX, v))); };
  function station() { return K.STATION[state.base]; }
  function same(a, b) { for (let i = 0; i < 12; i++) if (Math.abs(a[i] - b[i]) > 0.04) return false; return true; }
  function edited() { const s = station(); return !same(state.T, s.T) || !same(state.P, s.P); }
  function flipped() { return state.south !== station().south; }
  function modified() { return edited() || flipped(); }
  let clsKey = '', clsVal = null;
  function cls() {
    const key = state.T.join(',') + '|' + state.P.join(',') + '|' + state.south + '|' + state.cd;
    if (key !== clsKey) { clsKey = key; clsVal = K.classify(state.T, state.P, state.south, { cd: state.cd }); }
    return clsVal;
  }
  function classOf(st) { return K.classify(st.T, st.P, st.south, { cd: state.cd }); }
  function order() { return state.startJul ? ORDER_JUL : ORDER_JAN; }
  function summerIdx(south) { return south ? K.SUMMER_S : K.SUMMER_N; }
  function pinLabel(p) { const s = K.STATION[p.base]; return p.id ? stName(s) : T(s.zh + '（修改）', s.en + ' (edited)'); }

  // ---------- 顏色 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--cl-temp', '--cl-rain', '--cl-rain2', '--cl-summer', '--cl-mark', '--cl-pin1', '--cl-pin2', '--cl-pin3', '--cl-dry', '--cl-steppe',
      '--cl-ocean', '--cl-ocean2', '--cl-land', '--cl-land2', '--cl-coast', '--cl-grid', '--text', '--muted', '--border', '--surface', '--bg', '--accent', '--canvas-bg']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  let drag = null;
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function snapshot() {
    return K.snapshot({
      T: state.T, P: state.P, south: state.south, cd: state.cd, base: state.base, edited: edited(), startJul: state.startJul,
      pins: state.pins.map(function (p) { return { id: p.id, T: p.T, P: p.P, south: p.south }; }), view: state.view, moving: !!drag
    });
  }
  let lastEmit = 0, emitTimer = 0;
  function afterChange(force) {
    updateReadouts();
    requestDraw();
    const tNow = performance.now();
    clearTimeout(emitTimer);
    if (force || tNow - lastEmit > 220) { lastEmit = tNow; emit('clim', snapshot()); }
    else emitTimer = setTimeout(function () { lastEmit = performance.now(); emit('clim', snapshot()); }, 240);
  }

  // =====================================================================
  // 畫布
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let cvSize = { w: 600, h: 375, dpr: 1 };
  function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || 600, h = cv.clientHeight || Math.round(w * 0.625);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cvSize = { w: w, h: h, dpr: dpr };
  }

  // ---------- 氣候圖的座標 ----------
  const PSTEPS = [10, 20, 25, 50, 100, 150, 200, 250, 300, 400, 500];
  function axisFor(tmin, tmax, pmax) {
    const tLo = Math.min(0, Math.floor((tmin - 1) / 10) * 10), tHi = Math.max(30, Math.ceil((tmax + 1) / 10) * 10);
    const n = Math.round((tHi - tLo) / 10);
    let per = PSTEPS[PSTEPS.length - 1];
    for (let i = 0; i < PSTEPS.length; i++) if (PSTEPS[i] * n >= pmax * 1.04 - 1e-6) { per = PSTEPS[i]; break; }
    return { tLo: tLo, tHi: tHi, n: n, per: per, pHi: per * n };
  }
  let frozen = null;
  function ranges() {
    let tmin = Infinity, tmax = -Infinity, pmax = 0;
    [state].concat(state.pins).forEach(function (o) {
      o.T.forEach(function (v) { if (v < tmin) tmin = v; if (v > tmax) tmax = v; });
      o.P.forEach(function (v) { if (v > pmax) pmax = v; });
    });
    if (drag && frozen) {
      if (tmin >= frozen.tLo && tmax <= frozen.tHi && pmax <= frozen.pHi) return frozen;
      frozen = axisFor(Math.min(tmin, frozen.tLo + 1), Math.max(tmax, frozen.tHi - 1), Math.max(pmax, frozen.pHi / 1.04));
      return frozen;
    }
    frozen = axisFor(tmin, tmax, pmax);
    return frozen;
  }
  function chartGeom() {
    const w = cvSize.w, h = cvSize.h;
    const R = ranges();
    ctx.font = '12px ' + FONT;
    const lh = D.textHeight(ctx.measureText('8'), 14);
    const tw = Math.max(ctx.measureText('−50').width, ctx.measureText('°C').width);
    const pw = Math.max(ctx.measureText(String(R.pHi)).width, ctx.measureText('mm').width);
    const x0 = Math.round(10 + tw + 8), x1 = Math.round(w - 10 - pw - 8);
    const y0 = Math.round(16 + lh * 2.5), y1 = Math.round(h - 10 - lh * 1.6);
    return { R: R, x0: x0, x1: x1, y0: y0, y1: y1, colW: (x1 - x0) / 12, lh: lh };
  }
  const yT = function (g, t) { return g.y1 - (t - g.R.tLo) / (g.R.tHi - g.R.tLo) * (g.y1 - g.y0); };
  const yP = function (g, p) { return g.y1 - p / g.R.pHi * (g.y1 - g.y0); };
  const tAt = function (g, y) { return g.R.tLo + (g.y1 - y) / (g.y1 - g.y0) * (g.R.tHi - g.R.tLo); };
  const pAt = function (g, y) { return (g.y1 - y) / (g.y1 - g.y0) * g.R.pHi; };
  const xCol = function (g, i) { return g.x0 + (i + 0.5) * g.colW; };
  function posOf() { const pos = []; order().forEach(function (m, i) { pos[m] = i; }); return pos; }

  /** 這次判定用到的門檻（只畫用到的那幾條） */
  function usedMarks(k) {
    const t = [], p = [], hot = { on: false }, cold = { on: false }, dry = { on: false };
    k.steps.forEach(function (s) {
      if (s.k === 'E') { t.push([10, '10 °C（E）', '10 °C (E)']); hot.on = true; }
      else if (s.k === 'EF') { t.push([0, '0 °C（EF）', '0 °C (EF)']); hot.on = true; }
      else if (s.k === 'A') { t.push([18, '18 °C（A）', '18 °C (A)']); cold.on = true; }
      else if (s.k === 'C') { t.push([s.v.cd, num(s.v.cd, 0) + ' °C（C／D）', num(s.v.cd, 0) + ' °C (C/D)']); cold.on = true; }
      else if (s.k === 'a') { t.push([22, '22 °C（a）', '22 °C (a)']); hot.on = true; }
      else if (s.k === 'b') t.push([10, '10 °C（b）', '10 °C (b)']);
      else if (s.k === 'd') { t.push([-38, '−38 °C（d）', '−38 °C (d)']); cold.on = true; }
      else if (s.k === 'Af') { p.push([60, '60 mm（Af）', '60 mm (Af)']); dry.on = true; }
      else if (s.k === 'Am') { p.push([s.v.line, num(s.v.line, 1) + ' mm（Am）', num(s.v.line, 1) + ' mm (Am)']); dry.on = true; }
    });
    return { t: t, p: p, hot: hot.on, cold: cold.on, dry: dry.on };
  }

  function drawChart() {
    const W = cvSize.w, H = cvSize.h, g = chartGeom(), R = g.R, k = cls(), s = k.s, pos = posOf(), ord = order();
    ctx.setTransform(cvSize.dpr, 0, 0, cvSize.dpr, 0, 0);
    D.backdrop(ctx, W, H);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 繪圖區底
    D.roundRect(ctx, g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0, 6);
    ctx.fillStyle = D.alpha(C.surface, D.dark ? 0.32 : 0.7); ctx.fill();
    // 夏半年
    const sIdx = summerIdx(state.south);
    ctx.fillStyle = D.alpha(C['cl-summer'], D.dark ? 0.065 : 0.13);
    sIdx.forEach(function (m) { const i = pos[m]; ctx.fillRect(g.x0 + i * g.colW, g.y0, g.colW, g.y1 - g.y0); });
    // 夏半年標籤：放在最長的一段連續月份上
    const flags = ord.map(function (m) { return sIdx.indexOf(m) >= 0; });
    let best = [0, 0], i0 = -1;
    for (let i = 0; i <= 12; i++) {
      if (i < 12 && flags[i]) { if (i0 < 0) i0 = i; }
      else if (i0 >= 0) { if (i - i0 > best[1] - best[0]) best = [i0, i]; i0 = -1; }
    }
    if (best[1] > best[0]) {
      const xa = g.x0 + best[0] * g.colW, xb = g.x0 + best[1] * g.colW;
      ctx.fillStyle = D.alpha(C['cl-summer'], D.dark ? 0.5 : 0.6);
      ctx.fillRect(xa, g.y0 - 3, xb - xa, 3);
      ctx.font = '600 11px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = D.dark ? C['cl-summer'] : D.shade(C['cl-summer'], -0.25);
      ctx.fillText(T('夏半年', 'Summer half'), (xa + xb) / 2, g.y0 - 5);
    }
    // 選取或滑過的月份
    [[state.hover, 0.06], [kbOn() && state.view === 'chart' ? pos[state.sel.m] : -1, 0.1]].forEach(function (h) {
      if (h[0] >= 0) { ctx.fillStyle = D.alpha(C.accent, h[1]); ctx.fillRect(g.x0 + h[0] * g.colW, g.y0, g.colW, g.y1 - g.y0); }
    });
    // 格線（溫度每 10 °C，對齊雨量刻度）
    const dpr = cvSize.dpr, snap = function (v) { return (Math.round(v * dpr) + 0.5) / dpr; };
    ctx.lineWidth = 1 / dpr;
    for (let j = 0; j <= R.n; j++) {
      const y = snap(g.y1 - j * (g.y1 - g.y0) / R.n);
      ctx.strokeStyle = D.alpha(C.text, R.tLo + j * 10 === 0 ? 0.32 : 0.1);
      ctx.beginPath(); ctx.moveTo(g.x0, y); ctx.lineTo(g.x1, y); ctx.stroke();
      if (j < R.n) {
        const ym = snap(g.y1 - (j + 0.5) * (g.y1 - g.y0) / R.n);
        ctx.strokeStyle = D.alpha(C.text, 0.04);
        ctx.beginPath(); ctx.moveTo(g.x0, ym); ctx.lineTo(g.x1, ym); ctx.stroke();
      }
    }
    for (let i = 1; i < 12; i++) {
      const x = snap(g.x0 + i * g.colW);
      ctx.strokeStyle = D.alpha(C.text, 0.05);
      ctx.beginPath(); ctx.moveTo(x, g.y0); ctx.lineTo(x, g.y1); ctx.stroke();
    }
    const mk = state.marks ? usedMarks(k) : { t: [], p: [], hot: false, cold: false, dry: false };
    // 雨量長條
    const bw = Math.max(4, Math.min(g.colW * 0.62, 34));
    const rainTop = D.mix(C['cl-rain'], C['cl-rain2'], 0.45), rainBot = D.shade(C['cl-rain'], -0.18);
    for (let m = 0; m < 12; m++) {
      const x = xCol(g, pos[m]) - bw / 2, y = yP(g, state.P[m]), hgt = g.y1 - y;
      if (hgt < 0.6) { ctx.fillStyle = D.alpha(C['cl-rain'], 0.6); ctx.fillRect(x, g.y1 - 1, bw, 1); continue; }
      const gr = ctx.createLinearGradient(0, y, 0, g.y1);
      gr.addColorStop(0, rainTop); gr.addColorStop(1, rainBot);
      const r = Math.min(4, bw / 2, hgt);
      ctx.beginPath();
      ctx.moveTo(x, g.y1); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.lineTo(x + bw - r, y); ctx.arcTo(x + bw, y, x + bw, y + r, r); ctx.lineTo(x + bw, g.y1);
      ctx.closePath();
      ctx.fillStyle = gr; ctx.fill();
      ctx.strokeStyle = D.alpha(D.shade(C['cl-rain'], -0.35), 0.55); ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = D.alpha('#ffffff', D.dark ? 0.25 : 0.45);
      ctx.fillRect(x + 1.5, y + Math.min(1.2, hgt / 2), Math.max(1, bw * 0.18), Math.max(0, hgt - 2));
      if (mk.dry && m === s.dry) {
        ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = C['cl-mark']; ctx.lineWidth = 1.6;
        ctx.strokeRect(x - 2.5, y - 2.5, bw + 5, hgt + 2.5); ctx.restore();
      }
    }
    // 釘選的雨量：各月的短橫線
    state.pins.forEach(function (p) {
      const col = C[PIN_COLORS[p.c]];
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      for (let m = 0; m < 12; m++) {
        const xc = xCol(g, pos[m]), y = Math.min(g.y1 - 1, yP(g, p.P[m]));
        ctx.beginPath(); ctx.moveTo(xc - bw / 2 - 2, y); ctx.lineTo(xc + bw / 2 + 2, y); ctx.stroke();
      }
    });
    // 門檻線
    ctx.save();
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1.3;
    const tLab = [];
    mk.t.forEach(function (t) {
      if (t[0] < R.tLo || t[0] > R.tHi) return;
      const y = yT(g, t[0]);
      ctx.strokeStyle = D.alpha(C['cl-mark'], 0.85);
      ctx.beginPath(); ctx.moveTo(g.x0, y); ctx.lineTo(g.x1, y); ctx.stroke();
      tLab.push([y, T(t[1], t[2])]);
    });
    mk.p.forEach(function (t) {
      if (t[0] > R.pHi || t[0] < 0) return;
      const y = yP(g, t[0]);
      ctx.strokeStyle = D.alpha(C['cl-rain'], 0.9);
      ctx.beginPath(); ctx.moveTo(g.x0, y); ctx.lineTo(g.x1, y); ctx.stroke();
      tLab.push([y, T(t[1], t[2]), 'p']);
    });
    ctx.restore();
    // 釘選的溫度：虛線
    state.pins.forEach(function (p) {
      const col = C[PIN_COLORS[p.c]];
      ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath();
      ord.forEach(function (m, i) { const x = xCol(g, i), y = yT(g, p.T[m]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke(); ctx.restore();
      ord.forEach(function (m, i) {
        ctx.beginPath(); ctx.arc(xCol(g, i), yT(g, p.T[m]), 3, 0, Math.PI * 2);
        ctx.fillStyle = C['canvas-bg']; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke();
      });
    });
    // 目前的溫度：管狀折線＋立體圓點
    D.tube(ctx, function (c) { ord.forEach(function (m, i) { const x = xCol(g, i), y = yT(g, state.T[m]); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); }, C['cl-temp'], 4.2);
    const big = cvSize.w < 520 ? 6 : 5.2;
    ord.forEach(function (m, i) {
      const x = xCol(g, i), y = yT(g, state.T[m]);
      const on = (drag && drag.m === m && drag.kind === 'T') || (kbOn() && state.view === 'chart' && state.sel.m === m && state.sel.kind === 'T');
      if ((mk.hot && m === s.hot) || (mk.cold && m === s.cold)) {
        ctx.save(); ctx.setLineDash([3, 2.5]); ctx.strokeStyle = C['cl-mark']; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, big + 4.5, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      D.ball(ctx, x, y, on ? big + 2 : big, C['cl-temp'], { shadow: false, ring: on ? C.accent : '' });
    });
    // 門檻線標籤（左側，避免重疊）
    let lastY = -99;
    tLab.filter(function (l) { return !l[2]; }).sort(function (a, b) { return a[0] - b[0]; }).forEach(function (l) {
      const y = Math.max(l[0], lastY + 17);
      D.pill(ctx, l[1], g.x0 + 4, y - 2, C['cl-mark'], 'left', '600 11px ' + FONT);
      lastY = y;
    });
    lastY = 1e9;
    tLab.filter(function (l) { return l[2]; }).sort(function (a, b) { return b[0] - a[0]; }).forEach(function (l) {
      const y = Math.min(l[0], lastY - 17);
      D.pill(ctx, l[1], g.x1 - 4, y - 2, C['cl-rain'], 'right', '600 11px ' + FONT);
      lastY = y;
    });
    // 座標軸文字
    ctx.font = '12px ' + FONT; ctx.textBaseline = 'middle';
    for (let j = 0; j <= R.n; j++) {
      const y = g.y1 - j * (g.y1 - g.y0) / R.n;
      ctx.textAlign = 'right'; ctx.fillStyle = C['cl-temp']; ctx.fillText(num(R.tLo + j * 10, 0), g.x0 - 6, y);
      ctx.textAlign = 'left'; ctx.fillStyle = C['cl-rain']; ctx.fillText(String(j * R.per), g.x1 + 6, y);
    }
    ctx.font = '600 12px ' + FONT; ctx.textBaseline = 'bottom';
    ctx.textAlign = 'right'; ctx.fillStyle = C['cl-temp']; ctx.fillText('°C', g.x0 - 6, g.y0 - 6);
    ctx.textAlign = 'left'; ctx.fillStyle = C['cl-rain']; ctx.fillText('mm', g.x1 + 6, g.y0 - 6);
    ctx.font = '12px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = C.muted;
    const narrow = g.colW < (window.LabSettings && LabSettings.lang === 'en' ? 30 : 27);
    ord.forEach(function (m, i) {
      const t = narrow ? String(m + 1) : T((m + 1) + '月', K.MONTH_EN[m]);
      ctx.fillText(t, xCol(g, i), g.y1 + 5);
    });
    // 標題：測站名稱與類型
    const name = stName(station()) + (modified() ? T('（修改）', ' (edited)') : '');
    ctx.font = '700 14px ' + FONT;
    const nw = ctx.measureText(name).width;
    ctx.font = '800 14px ' + FONT;
    const cw = ctx.measureText(k.code).width + 14;
    const tx = W / 2 - (nw + 8 + cw) / 2, ty = 8;
    ctx.font = '700 14px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    D.haloText(ctx, name, tx, ty + 3, C.text, 'left', 'top', '700 14px ' + FONT);
    const col = typeColor(k.code), chH = 22;
    D.roundRect(ctx, tx + nw + 8, ty, cw, chH, 6);
    ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = '800 14px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = darkChip(col) ? '#ffffff' : '#111111';
    ctx.fillText(k.code, tx + nw + 8 + cw / 2, ty + chH / 2 + 0.5);
    // 選取月份的讀數
    const showM = drag ? drag.m : (state.hover >= 0 ? ord[state.hover] : (kbOn() && state.view === 'chart' ? state.sel.m : -1));
    if (showM >= 0) {
      const x = xCol(g, pos[showM]);
      const txt = monthName(showM) + T('　', '  ') + degC(state.T[showM]) + T('　', '  ') + mm(state.P[showM], 1);
      ctx.font = '600 12px ' + FONT;
      const tw2 = ctx.measureText(txt).width + 12;
      const px = Math.max(g.x0 + tw2 / 2, Math.min(g.x1 - tw2 / 2, x));
      D.pill(ctx, txt, px, g.y0 + 22 + 16, C.text, 'center', '600 12px ' + FONT);
    }
    if (kbOn()) {
      ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5;
      D.roundRect(ctx, 2, 2, W - 4, H - 4, 8); ctx.stroke(); ctx.restore();
    }
  }

  // ---------- 乾燥界線圖 ----------
  function dryGeom() {
    const w = cvSize.w, h = cvSize.h;
    const pts = [state].concat(state.pins).map(function (o) { const c = classOf(o); return [c.s.MAT, c.s.MAP]; });
    let xmin = -20, xmax = 35, ytop = 1500;
    pts.forEach(function (p) {
      xmin = Math.min(xmin, Math.floor((p[0] - 3) / 5) * 5); xmax = Math.max(xmax, Math.ceil((p[0] + 3) / 5) * 5);
      ytop = Math.max(ytop, Math.ceil(p[1] * 1.12 / 500) * 500);
    });
    if (drag && drag.kind === 'dry' && drag.box) { xmin = Math.min(xmin, drag.box[0]); xmax = Math.max(xmax, drag.box[1]); ytop = Math.max(ytop, drag.box[2]); }
    ctx.font = '12px ' + FONT;
    const lh = D.textHeight(ctx.measureText('8'), 14);
    const x0 = Math.round(14 + ctx.measureText(String(ytop)).width + 8), x1 = w - 14, y0 = Math.round(14 + lh * 1.6), y1 = Math.round(h - 12 - lh * 2.4);
    return { x0: x0, x1: x1, y0: y0, y1: y1, xmin: xmin, xmax: xmax, ytop: ytop, lh: lh };
  }
  const dX = function (g, t) { return g.x0 + (t - g.xmin) / (g.xmax - g.xmin) * (g.x1 - g.x0); };
  const dY = function (g, p) { return g.y1 - p / g.ytop * (g.y1 - g.y0); };
  const SEASON_C = { winter: 0, even: 14, summer: 28 };
  function drawDry() {
    const W = cvSize.w, H = cvSize.h, g = dryGeom(), k = cls(), s = k.s;
    ctx.setTransform(cvSize.dpr, 0, 0, cvSize.dpr, 0, 0);
    D.backdrop(ctx, W, H);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    D.roundRect(ctx, g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0, 6);
    ctx.fillStyle = D.alpha(C.surface, D.dark ? 0.32 : 0.7); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.rect(g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0); ctx.clip();
    const c0 = SEASON_C[s.season];
    const line = function (c, f) { return function (t) { return f * 10 * (2 * t + c); }; };
    const fill = function (fTop, fBot, color) {
      ctx.beginPath();
      const N = 60;
      for (let i = 0; i <= N; i++) { const t = g.xmin + (g.xmax - g.xmin) * i / N; const y = dY(g, Math.max(0, fTop(t))); if (i) ctx.lineTo(dX(g, t), y); else ctx.moveTo(dX(g, t), y); }
      for (let i = N; i >= 0; i--) { const t = g.xmin + (g.xmax - g.xmin) * i / N; ctx.lineTo(dX(g, t), dY(g, Math.max(0, fBot(t)))); }
      ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    };
    fill(line(c0, 1), line(c0, 0.5), D.alpha(C['cl-steppe'], D.dark ? 0.16 : 0.15));
    fill(line(c0, 0.5), function () { return 0; }, D.alpha(C['cl-dry'], D.dark ? 0.18 : 0.15));
    // 格線
    const dpr = cvSize.dpr, snap = function (v) { return (Math.round(v * dpr) + 0.5) / dpr; };
    ctx.lineWidth = 1 / dpr;
    const ystep = g.ytop <= 2000 ? 250 : 500;
    for (let p = 0; p <= g.ytop; p += ystep) { ctx.strokeStyle = D.alpha(C.text, p % 1000 === 0 ? 0.12 : 0.06); ctx.beginPath(); ctx.moveTo(g.x0, snap(dY(g, p))); ctx.lineTo(g.x1, snap(dY(g, p))); ctx.stroke(); }
    for (let t = Math.ceil(g.xmin / 5) * 5; t <= g.xmax; t += 5) { ctx.strokeStyle = D.alpha(C.text, t === 0 ? 0.3 : t % 10 === 0 ? 0.12 : 0.05); ctx.beginPath(); ctx.moveTo(snap(dX(g, t)), g.y0); ctx.lineTo(snap(dX(g, t)), g.y1); ctx.stroke(); }
    // 三種降雨季節的界線
    const labs = [];
    [['winter', '冬雨', 'winter rain'], ['even', '平均', 'even'], ['summer', '夏雨', 'summer rain']].forEach(function (q) {
      const c = SEASON_C[q[0]], cur = q[0] === s.season;
      ctx.save();
      if (!cur) ctx.setLineDash([5, 4]);
      ctx.strokeStyle = cur ? C['cl-dry'] : D.alpha(C['cl-mark'], 0.7); ctx.lineWidth = cur ? 2.4 : 1.3;
      ctx.beginPath(); ctx.moveTo(dX(g, Math.max(g.xmin, -c / 2)), dY(g, Math.max(0, line(c, 1)(Math.max(g.xmin, -c / 2))))); ctx.lineTo(dX(g, g.xmax), dY(g, line(c, 1)(g.xmax))); ctx.stroke();
      if (cur) {
        ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(dX(g, Math.max(g.xmin, -c / 2)), dY(g, 0)); ctx.lineTo(dX(g, g.xmax), dY(g, line(c, 0.5)(g.xmax))); ctx.stroke();
      }
      ctx.restore();
      const yEnd = dY(g, line(c, 1)(g.xmax));
      labs.push([yEnd, T(q[1] + '（+' + c + '）', q[2] + ' (+' + c + ')'), cur]);
    });
    ctx.restore();
    labs.sort(function (a, b) { return a[0] - b[0]; });
    let ly = -99;
    labs.forEach(function (l) {
      const y = Math.max(g.y0 + 18, Math.max(l[0] + 8, ly + 18));
      D.pill(ctx, l[1], g.x1 - 4, Math.min(g.y1 - 2, y), l[2] ? C['cl-dry'] : C.muted, 'right', (l[2] ? '700 ' : '600 ') + '11px ' + FONT);
      ly = y;
    });
    // 區域名稱
    const mid = Math.min(g.xmax - 8, Math.max(g.xmin + 8, 25));
    if (line(c0, 0.5)(mid) > g.ytop * 0.06) {
      D.haloText(ctx, T('沙漠 BW', 'Desert BW'), dX(g, mid), dY(g, line(c0, 0.25)(mid)), C['cl-dry'], 'center', 'middle', '700 12px ' + FONT);
      D.haloText(ctx, T('草原 BS', 'Steppe BS'), dX(g, mid), dY(g, line(c0, 0.75)(mid)), D.shade(C['cl-steppe'], D.dark ? 0 : -0.15), 'center', 'middle', '700 12px ' + FONT);
    }
    // 座標
    ctx.font = '12px ' + FONT; ctx.fillStyle = C.muted;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let p = 0; p <= g.ytop; p += (g.ytop <= 2000 ? 500 : 1000)) ctx.fillText(String(p), g.x0 - 6, dY(g, p));
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let t = Math.ceil(g.xmin / 10) * 10; t <= g.xmax; t += 10) ctx.fillText(num(t, 0), dX(g, t), g.y1 + 5);
    ctx.font = '600 12px ' + FONT; ctx.fillStyle = C.text;
    ctx.fillText(T('年均溫（°C）', 'Annual mean temperature (°C)'), (g.x0 + g.x1) / 2, g.y1 + 6 + g.lh);
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(T('年雨量（mm）', 'Annual precipitation (mm)'), g.x0, g.y0 - 6);
    // 釘選的點
    state.pins.forEach(function (p) {
      const c = classOf(p), x = dX(g, c.s.MAT), y = dY(g, Math.min(g.ytop, c.s.MAP));
      D.ball(ctx, x, y, 6.5, typeColor(c.code), { ring: C[PIN_COLORS[p.c]] });
      D.pill(ctx, pinLabel(p) + ' ' + c.code, x, y - 10, C[PIN_COLORS[p.c]], 'center', '600 11px ' + FONT);
    });
    // 目前的點與它到界線的距離
    const x = dX(g, s.MAT), y = dY(g, Math.min(g.ytop, s.MAP)), yl = dY(g, Math.max(0, Math.min(g.ytop, s.dryLine)));
    ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = C['cl-dry']; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, yl); ctx.stroke(); ctx.restore();
    ctx.beginPath(); ctx.arc(x, yl, 3, 0, Math.PI * 2); ctx.fillStyle = C['cl-dry']; ctx.fill();
    const lineTxt = T('界線 ', 'line ') + mm(Math.max(0, s.dryLine), 0), above = yl <= y;
    D.ball(ctx, x, y, drag && drag.kind === 'dry' ? 11 : 9.5, typeColor(k.code), { ring: kbOn() || (drag && drag.kind === 'dry') ? C.accent : '' });
    const nm = stName(station()) + (modified() ? T('（修改）', ' (edited)') : '') + ' ' + k.code;
    // 界線在點的上方：界線標籤放線上方、名稱放點下方；反過來也一樣
    const ly1 = above ? Math.min(yl, y - 12) - 6 : Math.max(yl, y + 12) + 22;
    const ny = above ? y + 34 : y - 14;
    D.pill(ctx, lineTxt, x, Math.max(g.y0 + 18, Math.min(g.y1 - 2, ly1)), C['cl-dry'], 'center', '600 11px ' + FONT);
    D.pill(ctx, nm, x, Math.max(g.y0 + 18, Math.min(g.y1 - 2, ny)), C.text, 'center', '700 12px ' + FONT);
    if (k.group === 'E') D.pill(ctx, T('最熱月低於 10 °C：先判成 E，不看這張圖', 'Warmest month below 10 °C: E comes first, this chart does not apply'), (g.x0 + g.x1) / 2, g.y0 + 24, C.muted, 'center', '600 11px ' + FONT);
    if (kbOn()) {
      ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5;
      D.roundRect(ctx, 2, 2, W - 4, H - 4, 8); ctx.stroke(); ctx.restore();
    }
  }

  // ---------- 測站地圖 ----------
  const TW_BOX = { lon0: 119.15, lon1: 122.45, lat0: 21.75, lat1: 25.85, k: Math.cos(23.8 * Math.PI / 180) };
  function mapGeom() {
    const w = cvSize.w, h = cvSize.h;
    if (state.scope === 'tw') {
      const bw = (TW_BOX.lon1 - TW_BOX.lon0) * TW_BOX.k, bh = TW_BOX.lat1 - TW_BOX.lat0;
      const s = Math.min(w / bw, h / bh);
      const cx = (TW_BOX.lon0 + TW_BOX.lon1) / 2, cy = (TW_BOX.lat0 + TW_BOX.lat1) / 2;
      return { tw: true, xy: function (lon, lat) { return [w / 2 + (lon - cx) * TW_BOX.k * s, h / 2 - (lat - cy) * s]; } };
    }
    const s = Math.min(w / 360, h / 146);
    return { tw: false, xy: function (lon, lat) { return [w / 2 + lon * s, h / 2 - (lat - 12) * s]; } };
  }
  let mapCache = null, mapKey = '';
  function mapBase(g) {
    const key = [cvSize.w, cvSize.h, cvSize.dpr, state.scope, D.ver, C['cl-land']].join('|');
    if (key === mapKey && mapCache) return mapCache;
    const c = mapCache || document.createElement('canvas');
    c.width = Math.round(cvSize.w * cvSize.dpr); c.height = Math.round(cvSize.h * cvSize.dpr);
    const x = c.getContext('2d');
    x.setTransform(cvSize.dpr, 0, 0, cvSize.dpr, 0, 0);
    const W = cvSize.w, H = cvSize.h;
    const og = x.createLinearGradient(0, 0, 0, H);
    og.addColorStop(0, C['cl-ocean']); og.addColorStop(1, C['cl-ocean2']);
    x.fillStyle = og; x.fillRect(0, 0, W, H);
    // 經緯線
    x.strokeStyle = D.alpha(C['cl-grid'], 0.28); x.lineWidth = 1;
    const st = g.tw ? 1 : 30;
    for (let lon = -180; lon <= 180; lon += st) { const a = g.xy(lon, -89), b = g.xy(lon, 89); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); }
    for (let lat = -90; lat <= 90; lat += st) { const a = g.xy(-180, lat), b = g.xy(180, lat); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); }
    if (!g.tw) {
      x.save(); x.setLineDash([6, 5]); x.strokeStyle = D.alpha(C['cl-summer'], 0.6);
      [23.44, -23.44].forEach(function (lat) { const a = g.xy(-180, lat), b = g.xy(180, lat); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); });
      x.restore();
      x.strokeStyle = D.alpha(C['cl-grid'], 0.6);
      const a = g.xy(-180, 0), b = g.xy(180, 0); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke();
    }
    // 陸地（加一點陰影，看起來浮在海上）
    const path = new Path2D();
    WORLD.land.forEach(function (poly) {
      poly.forEach(function (ring) {
        WORLD.decode(ring).forEach(function (p, i) { const q = g.xy(p[0], p[1]); if (i) path.lineTo(q[0], q[1]); else path.moveTo(q[0], q[1]); });
        path.closePath();
      });
    });
    x.save();
    x.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : 'rgba(40,60,80,0.25)'; x.shadowBlur = g.tw ? 10 : 5; x.shadowOffsetY = g.tw ? 3 : 1.5;
    const lg = x.createLinearGradient(0, 0, 0, H);
    lg.addColorStop(0, C['cl-land']); lg.addColorStop(1, C['cl-land2']);
    x.fillStyle = lg; x.fill(path, 'evenodd');
    x.restore();
    x.strokeStyle = D.alpha(C['cl-coast'], 0.9); x.lineWidth = g.tw ? 1.3 : 0.8; x.stroke(path);
    mapCache = c; mapKey = key;
    return c;
  }
  function stationsInView() {
    return K.STATIONS.filter(function (s) { return state.scope === 'tw' ? s.reg === 'tw' : true; });
  }
  function drawMap() {
    const W = cvSize.w, H = cvSize.h, g = mapGeom();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(mapBase(g), 0, 0);
    ctx.setTransform(cvSize.dpr, 0, 0, cvSize.dpr, 0, 0);
    const list = stationsInView(), cur = station();
    const rr = g.tw ? (W < 520 ? 7 : 7.5) : (W < 520 ? 4.2 : 5);
    const labels = [];
    list.forEach(function (s) {
      if (!g.tw && s.reg === 'tw') return;
      const q = g.xy(s.lon, s.lat);
      D.ball(ctx, q[0], q[1], rr, typeColor(classOf(s).code), { shadow: true });
    });
    if (!g.tw) {
      // 臺灣 23 站縮成一個標記
      const q = g.xy(121, 23.7);
      D.ball(ctx, q[0], q[1], rr + 1.5, C.accent, { ring: C['canvas-bg'] });
      labels.push({ x: q[0], y: q[1], t: T('臺灣 23 站 ›', 'Taiwan, 23 stations ›'), c: C.accent, pri: 1 });
    }
    // 釘選的測站
    state.pins.forEach(function (p) {
      const s = K.STATION[p.base];
      if (!g.tw && s.reg === 'tw') return;
      if (g.tw && s.reg !== 'tw') return;
      const q = g.xy(s.lon, s.lat);
      ctx.beginPath(); ctx.arc(q[0], q[1], rr + 4, 0, Math.PI * 2); ctx.strokeStyle = C[PIN_COLORS[p.c]]; ctx.lineWidth = 2.4; ctx.stroke();
      labels.push({ x: q[0], y: q[1], t: pinLabel(p), c: C[PIN_COLORS[p.c]], pri: 2 });
    });
    // 目前的測站
    if (g.tw === (cur.reg === 'tw')) {
      const q = g.xy(cur.lon, cur.lat);
      ctx.beginPath(); ctx.arc(q[0], q[1], rr + 6, 0, Math.PI * 2); ctx.strokeStyle = C.text; ctx.lineWidth = 2; ctx.stroke();
      D.ball(ctx, q[0], q[1], rr + 1.5, typeColor(cls().code), { ring: C.accent });
      labels.push({ x: q[0], y: q[1], t: stName(cur) + ' ' + cls().code, c: C.text, pri: 3 });
    }
    if (g.tw) list.forEach(function (s) { if (s.id !== cur.id) { const q = g.xy(s.lon, s.lat); labels.push({ x: q[0], y: q[1], t: stName(s), c: C.muted, pri: 0, small: true }); } });
    // 標籤：重要的先放，重疊的略過
    labels.sort(function (a, b) { return b.pri - a.pri; });
    const boxes = [];
    ctx.font = '600 12px ' + FONT;
    labels.forEach(function (l) {
      const font = (l.small ? '500 11px ' : '600 12px ') + FONT;
      ctx.font = font;
      const w = ctx.measureText(l.t).width + 12, h = 18;
      const cands = [[l.x + rr + 6, l.y + h / 2], [l.x - rr - 6 - w, l.y + h / 2], [l.x - w / 2, l.y - rr - 5], [l.x - w / 2, l.y + rr + 5 + h]];
      for (let i = 0; i < cands.length; i++) {
        const bx = Math.max(2, Math.min(W - w - 2, cands[i][0])), by = Math.max(h + 2, Math.min(H - 2, cands[i][1]));
        const box = [bx, by - h, bx + w, by];
        if (boxes.some(function (b) { return !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]); })) continue;
        boxes.push(box);
        D.pill(ctx, l.t, bx, by, l.c, 'left', font);
        return;
      }
    });
    if (g.tw) D.haloText(ctx, T('臺灣（中央氣象署 1991–2020）', 'Taiwan (CWA, 1991–2020)'), 10, H - 10, C.muted, 'left', 'bottom', '600 12px ' + FONT);
    if (kbOn()) {
      ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5;
      D.roundRect(ctx, 2, 2, W - 4, H - 4, 8); ctx.stroke(); ctx.restore();
    }
  }
  function updateMapLegend() {
    const box = $('legMap');
    if (state.view !== 'map') return;
    const cnt = {};
    stationsInView().forEach(function (s) { const c = classOf(s).code; cnt[c] = (cnt[c] || 0) + 1; });
    const html = '<span>' + esc(T('類型（測站數）：', 'Types (stations): ')) + '</span>' + Object.keys(K.TYPES).filter(function (c) { return cnt[c]; }).map(function (c) {
      return '<span title="' + esc(typeName(c)) + '"><i style="background:' + typeColor(c) + '"></i>' + c + ' ' + cnt[c] + '</span>';
    }).join('');
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function paren(v) { return v < 0 ? '(' + num(v, 1) + ')' : num(v, 1); }
  function stepsHTML(k) {
    const out = [];
    const li = function (ok, q, a, extra) { out.push('<li class="' + (ok ? 'ok' : 'no') + (extra || '') + '"><span class="mk" aria-label="' + (ok ? T('是', 'yes') : T('否', 'no')) + '"></span><span class="q">' + q + '</span>' + (a ? '<span class="a">' + a + '</span>' : '') + '</li>'); };
    const lt = function (s) { return '<span class="lt">' + s + '</span>'; };
    k.steps.forEach(function (st) {
      const v = st.v, ok = st.ok;
      switch (st.k) {
        case 'E': li(ok, T('最熱月 ' + degC(v.Thot) + ' 低於 10 °C？', 'Warmest month ' + degC(v.Thot) + ' below 10 °C?'), ok ? T('是 → 極地氣候 ', 'Yes → polar ') + lt('E') : T('否 → 不是極地氣候', 'No → not polar')); break;
        case 'EF': li(ok, T('最熱月在 0 °C 以下？', 'Warmest month at or below 0 °C?'), ok ? T('是 → 冰原 ', 'Yes → ice cap ') + lt('EF') : T('否 → 苔原 ', 'No → tundra ') + lt('ET')); break;
        case 'B': {
          const add = v.season === 'winter' ? 0 : v.season === 'summer' ? 28 : 14;
          const why = v.season === 'winter' ? T('雨多在冬半年', 'mostly winter rain') : v.season === 'summer' ? T('雨多在夏半年', 'mostly summer rain') : T('雨季不明顯', 'no strong rainy season');
          li(ok, T('年雨量 ' + mm(v.MAP, 0) + ' 少於乾燥界線 ' + mm(Math.max(0, v.line), 0) + '？', 'Annual precipitation ' + mm(v.MAP, 0) + ' below the dryness line ' + mm(Math.max(0, v.line), 0) + '?'),
            (ok ? T('是 → 乾燥氣候 ', 'Yes → arid ') + lt('B') : T('否 → 不是乾燥氣候', 'No → not arid')) +
            T('<br>界線 = 10 × Pth；Pth = 2 × ' + paren(v.MAT) + ' + ' + add + '（' + why + '）= ' + num(v.Pth, 1) + ' cm',
              '<br>line = 10 × Pth; Pth = 2 × ' + paren(v.MAT) + ' + ' + add + ' (' + why + ') = ' + num(v.Pth, 1) + ' cm'));
          break;
        }
        case 'BW': li(ok, T('年雨量少於沙漠界線（一半）' + mm(Math.max(0, v.line), 0) + '？', 'Below the desert line (half of it), ' + mm(Math.max(0, v.line), 0) + '?'), ok ? T('是 → 沙漠 ', 'Yes → desert ') + lt('W') : T('否 → 草原 ', 'No → steppe ') + lt('S')); break;
        case 'h': li(ok, T('年均溫 ' + degC(v.MAT) + ' 在 18 °C 以上？', 'Annual mean ' + degC(v.MAT) + ' at least 18 °C?'), ok ? T('是 → 熱 ', 'Yes → hot ') + lt('h') : T('否 → 冷 ', 'No → cold ') + lt('k')); break;
        case 'A': li(ok, T('最冷月 ' + degC(v.Tcold) + ' 在 18 °C 以上？', 'Coldest month ' + degC(v.Tcold) + ' at least 18 °C?'), ok ? T('是 → 熱帶氣候 ', 'Yes → tropical ') + lt('A') : T('否 → 不是熱帶', 'No → not tropical')); break;
        case 'Af': li(ok, T('最乾月 ' + mm(v.Pdry) + ' 有 60 mm 以上？', 'Driest month ' + mm(v.Pdry) + ' at least 60 mm?'), ok ? T('是 → 雨林 ', 'Yes → rainforest ') + lt('f') : T('否 → 有乾季', 'No → there is a dry season')); break;
        case 'Am': li(ok, T('最乾月有 100 − 年雨量 ÷ 25 = ' + mm(v.line, 1) + ' 以上？', 'Driest month at least 100 − annual ÷ 25 = ' + mm(v.line, 1) + '?'), ok ? T('是 → 季風 ', 'Yes → monsoon ') + lt('m') : T('否 → 莽原 ', 'No → savanna ') + lt('w')); break;
        case 'C': li(ok, T('最冷月 ' + degC(v.Tcold) + ' 高於 ' + num(v.cd, 0) + ' °C？', 'Coldest month ' + degC(v.Tcold) + ' above ' + num(v.cd, 0) + ' °C?'), ok ? T('是 → 溫帶 ', 'Yes → temperate ') + lt('C') : T('否 → 冷溫帶 ', 'No → continental ') + lt('D')); break;
        case 's': li(ok, T('夏半年最乾月 ' + mm(v.Psdry) + ' 少於 40 mm，也少於冬半年最溼月 ' + mm(v.Pwwet) + ' 的 1/3？', 'Driest summer month ' + mm(v.Psdry) + ' below 40 mm and below 1/3 of the wettest winter month, ' + mm(v.Pwwet) + '?'), ok ? T('是 → 夏乾', 'Yes → dry summer') : T('否', 'No')); break;
        case 'w': {
          li(ok, T('冬半年最乾月 ' + mm(v.Pwdry) + ' 少於夏半年最溼月 ' + mm(v.Pswet) + ' 的 1/10？', 'Driest winter month ' + mm(v.Pwdry) + ' below 1/10 of the wettest summer month, ' + mm(v.Pswet) + '?'), ok ? T('是 → 冬乾', 'Yes → dry winter') : T('否', 'No'));
          const L2 = k.code[1], sOk = k.steps.some(function (x) { return x.k === 's' && x.ok; });
          if (sOk && ok) li(true, T('兩個都成立：比較哪半年雨量少', 'Both hold: which half-year gets less rain?'), (L2 === 's' ? T('夏半年較少 → ', 'Summer → ') : T('冬半年較少 → ', 'Winter → ')) + lt(L2));
          else if (!sOk && !ok) li(true, T('兩個都不成立 → 全年有雨', 'Neither holds → rain all year'), lt('f'));
          else li(true, T('第二個字母', 'Second letter'), lt(L2));
          break;
        }
        case 'a': li(ok, T('最熱月 ' + degC(v.Thot) + ' 在 22 °C 以上？', 'Warmest month ' + degC(v.Thot) + ' at least 22 °C?'), ok ? T('是 → 夏熱 ', 'Yes → hot summer ') + lt('a') : T('否', 'No')); break;
        case 'b': li(ok, T('高於 10 °C 的月份有 ' + v.Tmon10 + ' 個，至少 4 個？', v.Tmon10 + ' months above 10 °C — at least 4?'), ok ? T('是 → 夏暖 ', 'Yes → warm summer ') + lt('b') : (k.group === 'D' ? T('否', 'No') : T('否 → 夏涼 ', 'No → cool summer ') + lt('c'))); break;
        case 'd': li(ok, T('最冷月 ' + degC(v.Tcold) + ' 在 −38 °C 以下？', 'Coldest month ' + degC(v.Tcold) + ' at or below −38 °C?'), ok ? T('是 → 冬季極寒 ', 'Yes → severe winter ') + lt('d') : T('否 → 夏涼 ', 'No → cool summer ') + lt('c')); break;
      }
    });
    out.push('<li class="end"><span class="mk">→</span><span class="q">' + esc(k.code) + '　' + esc(typeName(k.code)) + '</span></li>');
    return out.join('');
  }
  function updateReadouts() {
    const st = station(), k = cls(), s = k.s;
    // 測站
    if ($('selStation').value !== state.base) $('selStation').value = state.base;
    setText('rLoc', latLon(st));
    setText('rElev', num(st.elev, 0) + ' m');
    const src = st.src === 'cwa' ? T('中央氣象署 ' + st.per + ' 年平均', 'Central Weather Administration, ' + st.per + ' normals')
      : T('WMO ' + st.per + ' 年平均（NOAA NCEI）', 'WMO ' + st.per + ' normals (NOAA NCEI)');
    const how = st.how === 'tmm' ? T('；月均溫用平均最高與最低氣溫的平均', '; mean temperature from the average of the daily maximum and minimum') : '';
    setHTML('rSrc', esc(src + how) + (modified() ? '<span class="badge">' + esc(edited() ? T('已修改', 'edited') : T('換了半球', 'other hemisphere')) + '</span>' : ''));
    document.querySelectorAll('#hemiSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String((b.getAttribute('data-hemi') === 's') === state.south)); });
    $('restore').disabled = !modified();
    $('pin').disabled = state.pins.length >= MAXPIN;
    // 結果
    const chip = $('rCode'), col = typeColor(k.code);
    if (chip.textContent !== k.code) chip.textContent = k.code;
    chip.style.background = col;
    chip.classList.toggle('light', darkChip(col));
    setText('rName', typeName(k.code));
    setText('rGroup', T(k.group + ' 類：', 'Group ' + k.group + ': ') + groupName(k.group));
    setHTML('rSteps', stepsHTML(k));
    document.querySelectorAll('#cdSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-cd') === state.cd)); });
    const alt = K.classify(state.T, state.P, state.south, { cd: state.cd === 0 ? -3 : 0 }).code;
    setText('rAlt', alt === k.code ? T('換成另一個分界（' + (state.cd === 0 ? '−3' : '0') + ' °C），結果一樣。', 'With the other boundary (' + (state.cd === 0 ? '−3' : '0') + ' °C) the type is the same.')
      : T('換成 ' + (state.cd === 0 ? '−3' : '0') + ' °C 的分界，會變成 ' + alt + '（' + typeName(alt) + '）。', 'With the ' + (state.cd === 0 ? '−3' : '0') + ' °C boundary it would be ' + alt + ' (' + typeName(alt) + ').'));
    // 數值
    setText('rMAT', degC(s.MAT));
    setText('rMAP', mm(s.MAP, 0));
    setText('rHot', degC(s.Thot) + T('（' + monthName(s.hot) + '）', ' (' + monthName(s.hot) + ')'));
    setText('rCold', degC(s.Tcold) + T('（' + monthName(s.cold) + '）', ' (' + monthName(s.cold) + ')'));
    setText('rRange', num(s.range, 1) + ' °C');
    setText('rWet', mm(s.Pwet, 1) + T('（' + monthName(s.wet) + '）', ' (' + monthName(s.wet) + ')'));
    setText('rDry', mm(s.Pdry, 1) + T('（' + monthName(s.dry) + '）', ' (' + monthName(s.dry) + ')'));
    setText('rShare', num(s.sShare * 100, 0) + '%' + T('（' + (state.south ? '10–3 月' : '4–9 月') + '）', ' (' + (state.south ? 'Oct–Mar' : 'Apr–Sep') + ')'));
    const add = s.season === 'winter' ? 0 : s.season === 'summer' ? 28 : 14;
    // 0／14／28 是依雨季的修正項；年均溫很低時門檻會算成負的，這時再乾也不會是 B
    setText('rPth', s.Pth > 0
      ? num(s.Pth, 1) + ' cm' + T('（季節修正 +' + add + '）', ' (seasonal correction +' + add + ')')
      : T('季節修正 +' + add + ' 後仍只有 ' + num(s.Pth, 1) + ' cm：再乾也不會是 B',
          'with the +' + add + ' seasonal correction: ' + num(s.Pth, 1) + ' cm, so never B, however dry'));
    setText('rLine', mm(Math.max(0, s.dryLine), 0));
    // 比較清單
    const pl = state.pins.map(function (p, i) {
      const c = classOf(p).code, cc = typeColor(c);
      return '<li><span class="dot" style="background:var(--' + PIN_COLORS[p.c] + ')"></span><span class="nm">' + esc(pinLabel(p)) + '</span>' +
        '<span class="cd" style="background:' + cc + ';color:' + (darkChip(cc) ? '#fff' : '#111') + '">' + c + '</span>' +
        '<button type="button" data-unpin="' + i + '" aria-label="' + esc(T('移除 ' + pinLabel(p), 'Remove ' + pinLabel(p))) + '">×</button></li>';
    }).join('') || '<li class="empty">' + esc(T('還沒有釘選。按「釘選比較」把目前的氣候圖留在圖上（最多 3 個）。', 'Nothing pinned yet. Press “Pin for comparison” to keep the current climograph on the chart (up to 3).')) + '</li>';
    setHTML('pinList', pl);
    $('clear').disabled = !state.pins.length;
    // 數值表
    syncTable();
    updateMapLegend();
  }

  // ---------- 數值表 ----------
  const tbody = $('vtBody');
  const cells = [];
  function buildTable() {
    tbody.innerHTML = '';
    cells.length = 0;
    for (let m = 0; m < 12; m++) {
      const tr = document.createElement('tr');
      const th = document.createElement('td'); th.textContent = monthName(m); tr.appendChild(th);
      const mk = function (kind) {
        const td = document.createElement('td'), inp = document.createElement('input');
        inp.type = 'number'; inp.inputMode = 'decimal';
        inp.step = '0.1';
        if (kind === 'T') { inp.min = String(K.T_MIN); inp.max = String(K.T_MAX); } else { inp.min = '0'; inp.max = String(K.P_MAX); }
        inp.setAttribute('aria-label', monthName(m) + (kind === 'T' ? T(' 均溫（°C）', ' mean temperature (°C)') : T(' 雨量（mm）', ' precipitation (mm)')));
        inp.addEventListener('change', function () {
          const v = parseFloat(String(inp.value).replace('−', '-'));
          if (!isFinite(v)) { syncTable(true); return; }
          acted();
          const before = cls().code;
          if (kind === 'T') state.T[m] = clampT(v); else state.P[m] = clampP(v);
          state.sel = { m: m, kind: kind };
          editStatus(m, kind, before);
          afterChange(true);
          syncTable(true);
        });
        td.appendChild(inp); tr.appendChild(td);
        return { td: td, inp: inp };
      };
      cells.push({ tr: tr, T: mk('T'), P: mk('P'), name: th });
      tbody.appendChild(tr);
    }
  }
  function syncTable(force) {
    const st = station(), sIdx = summerIdx(state.south);
    cells.forEach(function (c, m) {
      c.tr.classList.toggle('summer', sIdx.indexOf(m) >= 0);
      if (c.name.textContent !== monthName(m)) c.name.textContent = monthName(m);
      [['T', state.T, st.T], ['P', state.P, st.P]].forEach(function (q) {
        const cell = c[q[0]], v = num(q[1][m], 1).replace('−', '-');
        if ((force || document.activeElement !== cell.inp) && cell.inp.value !== v) cell.inp.value = v;
        cell.td.classList.toggle('diff', Math.abs(q[1][m] - q[2][m]) > 0.04);
      });
    });
  }
  function editStatus(m, kind, before) {
    const now = cls().code;
    const what = monthName(m) + (kind === 'T' ? T('均溫 ', ' mean temperature ') + degC(state.T[m]) : T('雨量 ', ' precipitation ') + mm(state.P[m], 1));
    setStatus(esc(what) + T('；類型 ', '; type ') + (now === before ? esc(T(now + ' 沒有改變。', now + ', unchanged.')) : '<b>' + esc(before + ' → ' + now) + '</b>' + esc(T('（' + typeName(now) + '）。', ' (' + typeName(now) + ').'))));
  }

  // =====================================================================
  // 控制
  // =====================================================================
  function fillStations() {
    const sel = $('selStation'), keep = state.base;
    sel.innerHTML = '';
    REGIONS.forEach(function (r) {
      const og = document.createElement('optgroup'); og.label = T(r[1], r[2]);
      K.STATIONS.filter(function (s) { return s.reg === r[0]; }).forEach(function (s) {
        const o = document.createElement('option'); o.value = s.id;
        o.textContent = stName(s) + '　' + classOf(s).code;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    sel.value = keep;
  }
  function selectStation(id, quiet) {
    const s = K.STATION[id];
    if (!s) return;
    state.base = id; state.T = s.T.slice(); state.P = s.P.slice(); state.south = s.south;
    frozen = null;
    if (state.view === 'map' && state.scope !== (s.reg === 'tw' ? 'tw' : 'world')) setScope(s.reg === 'tw' ? 'tw' : 'world', true);
    if (!quiet) {
      const k = cls();
      setStatus(esc(stName(s) + T('：', ': ')) + '<b>' + esc(k.code) + '</b> ' + esc(typeName(k.code)) + esc(T('。', '.')) +
        (s.south && !state.startJul ? esc(T(' 南半球的夏天在 12–2 月，可以按「從 7 月開始畫」。', ' Summer here is December–February; try “Start the chart in July”.')) : ''));
    }
  }
  $('selStation').addEventListener('change', function () { acted(); selectStation(this.value); afterChange(true); });
  $('restore').addEventListener('click', function () {
    acted();
    selectStation(state.base, true);
    setStatus(esc(T('已還原' + stName(station()) + '的原始資料。', stName(station()) + ': original data restored.')));
    afterChange(true);
  });
  document.querySelectorAll('#hemiSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      const south = b.getAttribute('data-hemi') === 's';
      if (south === state.south) return;
      const before = cls().code;
      state.south = south;
      const now = cls().code;
      setStatus(esc(south ? T('把資料放到南半球：夏半年改成 10–3 月。', 'Moved to the Southern Hemisphere: the summer half is now October–March.') : T('把資料放到北半球：夏半年改成 4–9 月。', 'Moved to the Northern Hemisphere: the summer half is now April–September.')) +
        esc(T(' 類型 ', ' Type ')) + (now === before ? esc(now + T('，沒有改變。', ', unchanged.')) : '<b>' + esc(before + ' → ' + now) + '</b>' + esc(T('。', '.'))));
      afterChange(true);
    });
  });
  document.querySelectorAll('#cdSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      const cd = +b.getAttribute('data-cd');
      if (cd === state.cd) return;
      const before = cls().code;
      state.cd = cd;
      const now = cls().code;
      fillStations();
      setStatus(esc(T('C／D 分界改成 ' + num(cd, 0) + ' °C。', 'C/D boundary set to ' + num(cd, 0) + ' °C. ')) + (now === before ? esc(T('類型仍是 ' + now + '。', 'The type is still ' + now + '.')) : '<b>' + esc(before + ' → ' + now) + '</b>'));
      afterChange(true);
    });
  });
  $('tMarks').addEventListener('click', function () { acted(); state.marks = !state.marks; this.setAttribute('aria-pressed', String(state.marks)); afterChange(true); });
  $('tJul').addEventListener('click', function () {
    acted(); state.startJul = !state.startJul; this.setAttribute('aria-pressed', String(state.startJul));
    setStatus(esc(state.startJul ? T('氣候圖改成從 7 月畫到隔年 6 月。', 'The climograph now runs from July to June.') : T('氣候圖改回從 1 月開始。', 'The climograph starts in January again.')));
    afterChange(true);
  });
  $('pin').addEventListener('click', function () {
    acted();
    if (state.pins.length >= MAXPIN) return;
    const real = !modified();
    const dup = state.pins.some(function (p) { return p.south === state.south && same(p.T, state.T) && same(p.P, state.P); });
    if (dup) { setStatus(esc(T('這組資料已經釘選了。', 'These data are already pinned.'))); return; }
    const used = state.pins.map(function (p) { return p.c; });
    const c = [0, 1, 2].filter(function (i) { return used.indexOf(i) < 0; })[0];
    const p = { id: real ? state.base : null, base: state.base, T: state.T.slice(), P: state.P.slice(), south: state.south, c: c };
    state.pins.push(p);
    setStatus(esc(T('已釘選 ' + pinLabel(p) + '（' + cls().code + '），可以換別的測站來比較。', 'Pinned ' + pinLabel(p) + ' (' + cls().code + '); now choose another station to compare.')));
    afterChange(true);
  });
  $('pinList').addEventListener('click', function (e) {
    const b = e.target.closest('button[data-unpin]');
    if (!b) return;
    acted();
    const p = state.pins.splice(+b.getAttribute('data-unpin'), 1)[0];
    if (p) setStatus(esc(T('已移除 ' + pinLabel(p) + '。', 'Removed ' + pinLabel(p) + '.')));
    afterChange(true);
  });
  $('clear').addEventListener('click', function () {
    acted();
    state.pins = [];
    setStatus(esc(T('已清除所有比較；目前的測站與修改不變。', 'All comparisons cleared; the current station and your changes stay.')));
    afterChange(true);
  });

  // ---------- 檢視切換 ----------
  const stage = $('stage');
  function setView(v) {
    state.view = v;
    [['vChart', 'chart'], ['vDry', 'dry'], ['vMap', 'map']].forEach(function (q) { $(q[0]).setAttribute('aria-pressed', String(q[1] === v)); });
    stage.classList.toggle('v-map', v === 'map');
    stage.classList.toggle('tw', state.scope === 'tw');
    $('scopeSeg').hidden = v !== 'map';
    $('legChart').hidden = v !== 'chart';
    $('legDry').hidden = v !== 'dry';
    $('legMap').hidden = v !== 'map';
    document.querySelectorAll('.l-chart').forEach(function (e) { e.hidden = v !== 'chart'; });
    document.querySelectorAll('.l-dry').forEach(function (e) { e.hidden = v !== 'dry'; });
    document.querySelectorAll('.l-map').forEach(function (e) { e.hidden = v !== 'map'; });
    $('chartOpts').hidden = v !== 'chart';
    cv.style.cursor = v === 'map' ? 'pointer' : v === 'dry' ? 'default' : 'crosshair';
    cv.setAttribute('aria-label', v === 'chart' ? T('氣候圖：紅線是月均溫、藍色長條是月雨量；拖曳可以修改', 'Climograph: the red line is the monthly mean temperature and the blue bars are the monthly precipitation; drag to change them')
      : v === 'dry' ? T('乾燥界線圖：橫軸年均溫、縱軸年雨量；拖曳大圓點可以讓整年變暖變冷、變溼變乾', 'Dryness chart: annual mean temperature across, annual precipitation up; drag the large dot to make the whole year warmer, colder, wetter or drier')
        : T('測站地圖：點一下測站就換過去', 'Station map: tap a station to open it'));
    state.hover = -1;
    fit();
    updateReadouts();
    requestDraw();
  }
  function setScope(sc, quiet) {
    state.scope = sc;
    document.querySelectorAll('#scopeSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-scope') === sc)); });
    stage.classList.toggle('tw', sc === 'tw');
    fit(); updateMapLegend(); requestDraw();
    if (!quiet) setStatus(esc(sc === 'tw' ? T('臺灣 23 個測站：點一下就換過去。', 'Taiwan’s 23 stations: tap one to open it.') : T('世界 45 個測站：點臺灣可以放大。', '45 stations around the world: tap Taiwan to zoom in.')));
  }
  $('vChart').addEventListener('click', function () { acted(); setView('chart'); emit('clim', snapshot()); });
  $('vDry').addEventListener('click', function () { acted(); setView('dry'); emit('clim', snapshot()); });
  $('vMap').addEventListener('click', function () { acted(); setView('map'); emit('clim', snapshot()); });
  document.querySelectorAll('#scopeSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); setScope(b.getAttribute('data-scope')); }); });

  // =====================================================================
  // 指標
  // =====================================================================
  function evXY(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  const touchR = function (e) { return e.pointerType === 'touch' ? 22 : 14; };
  let chartG = null;
  function chartHit(x, y, e) {
    const g = chartG || chartGeom();
    if (x < g.x0 - 6 || x > g.x1 + 6 || y < g.y0 - 30 || y > g.y1 + 24) return null;
    const i = Math.max(0, Math.min(11, Math.floor((x - g.x0) / g.colW))), m = order()[i];
    const dT = Math.hypot(xCol(g, i) - x, yT(g, state.T[m]) - y);
    return { i: i, m: m, kind: dT <= touchR(e) ? 'T' : 'P', g: g };
  }
  function nearestStation(x, y, rad) {
    const g = mapGeom();
    let best = null, bd = rad;
    stationsInView().forEach(function (s) {
      const q = g.tw ? g.xy(s.lon, s.lat) : (s.reg === 'tw' ? g.xy(121, 23.7) : g.xy(s.lon, s.lat));
      const d = Math.hypot(q[0] - x, q[1] - y);
      if (d < bd) { bd = d; best = s; }
    });
    return best;
  }
  cv.addEventListener('pointerdown', function (e) {
    const p = evXY(e);
    if (state.view === 'map') {
      const s = nearestStation(p[0], p[1], touchR(e) + 4);
      if (!s) return;
      acted();
      if (state.scope === 'world' && s.reg === 'tw') { setScope('tw'); emit('clim', snapshot()); return; }
      selectStation(s.id);
      afterChange(true);
      return;
    }
    if (state.view === 'dry') {
      const g = dryGeom(), k = cls();
      const x = dX(g, k.s.MAT), y = dY(g, Math.min(g.ytop, k.s.MAP));
      if (Math.hypot(x - p[0], y - p[1]) > touchR(e) + 8) return;
      acted();
      drag = { id: e.pointerId, kind: 'dry', T0: state.T.slice(), P0: state.P.slice(), MAT0: k.s.MAT, MAP0: k.s.MAP, box: [g.xmin, g.xmax, g.ytop], dx: p[0] - x, dy: p[1] - y };
      try { cv.setPointerCapture(e.pointerId); } catch (er) { /* 忽略 */ }
      cv.classList.add('dragging');
      requestDraw();
      return;
    }
    const h = chartHit(p[0], p[1], e);
    if (!h) return;
    acted();
    chartG = h.g;
    drag = { id: e.pointerId, kind: h.kind, m: h.m, y0: p[1], moved: false, before: cls().code };
    state.sel = { m: h.m, kind: h.kind };
    try { cv.setPointerCapture(e.pointerId); } catch (er) { /* 忽略 */ }
    cv.classList.add('dragging');
    requestDraw();
  });
  cv.addEventListener('pointermove', function (e) {
    const p = evXY(e);
    if (!drag) {
      if (state.view === 'chart' && e.pointerType !== 'touch') {
        const h = chartHit(p[0], p[1], e), hv = h ? h.i : -1;
        cv.style.cursor = h ? (h.kind === 'T' ? 'grab' : 'ns-resize') : 'crosshair';
        if (hv !== state.hover) { state.hover = hv; requestDraw(); }
      } else if (state.view === 'dry' && e.pointerType !== 'touch') {
        const g = dryGeom(), k = cls();
        cv.style.cursor = Math.hypot(dX(g, k.s.MAT) - p[0], dY(g, Math.min(g.ytop, k.s.MAP)) - p[1]) <= 18 ? 'grab' : 'default';
      } else if (state.view === 'map' && e.pointerType !== 'touch') {
        cv.style.cursor = nearestStation(p[0], p[1], 18) ? 'pointer' : 'default';
      }
      return;
    }
    if (drag.id !== e.pointerId) return;
    if (drag.kind === 'dry') {
      const g = dryGeom();
      const mat = g.xmin + (p[0] - drag.dx - g.x0) / (g.x1 - g.x0) * (g.xmax - g.xmin);
      const map = Math.max(0, (g.y1 - (p[1] - drag.dy)) / (g.y1 - g.y0) * g.ytop);
      applyDry(mat - drag.MAT0, map, drag);
      afterChange();
      return;
    }
    if (!drag.moved && Math.abs(p[1] - drag.y0) < 3) return;
    drag.moved = true;
    const g = chartG;
    if (drag.kind === 'T') state.T[drag.m] = clampT(tAt(g, p[1]));
    else state.P[drag.m] = clampP(pAt(g, p[1]));
    chartG = chartGeom();
    afterChange();
  });
  function applyDry(dT, map, base) {
    state.T = base.T0.map(function (t) { return clampT(t + dT); });
    if (base.MAP0 > 0) { const f = map / base.MAP0; state.P = base.P0.map(function (v) { return clampP(v * f); }); }
    else state.P = base.P0.map(function () { return clampP(map / 12); });
  }
  function endDrag(e) {
    if (!drag || (e && drag.id !== e.pointerId)) return;
    const d = drag;
    drag = null; chartG = null;
    cv.classList.remove('dragging');
    frozen = null;
    if (d.kind === 'dry') {
      const k = cls();
      setStatus(esc(T('整年平移：年均溫 ' + degC(k.s.MAT) + '、年雨量 ' + mm(k.s.MAP, 0) + '（界線 ' + mm(Math.max(0, k.s.dryLine), 0) + '）→ ', 'Whole year shifted: annual mean ' + degC(k.s.MAT) + ', annual precipitation ' + mm(k.s.MAP, 0) + ' (line ' + mm(Math.max(0, k.s.dryLine), 0) + ') → ')) + '<b>' + esc(k.code) + '</b>');
    } else if (d.moved) editStatus(d.m, d.kind, d.before);
    else setStatus(esc(monthName(d.m) + T('：均溫 ', ': mean temperature ') + degC(state.T[d.m]) + T('，雨量 ', ', precipitation ') + mm(state.P[d.m], 1) + T('。', '.')));
    afterChange(true);
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', function () { drag = null; chartG = null; frozen = null; cv.classList.remove('dragging'); afterChange(true); });
  cv.addEventListener('pointerleave', function () { if (!drag && state.hover >= 0) { state.hover = -1; requestDraw(); } });

  // ---------- 鍵盤 ----------
  let kb = null;
  function kbOn() { return !!(kb && kb.focused()); }
  function kbMove(kind, dx, dy, big) {
    acted();
    if (state.view === 'map') {
      const list = state.scope === 'tw' ? K.STATIONS.filter(function (s) { return s.reg === 'tw'; }) : K.STATIONS;
      let i = list.findIndex(function (s) { return s.id === state.base; });
      i = ((i < 0 ? 0 : i + (dx || -dy)) % list.length + list.length) % list.length;
      selectStation(list[i].id); afterChange(true); return true;
    }
    if (state.view === 'dry') {
      const k = cls();
      const base = { T0: state.T.slice(), P0: state.P.slice(), MAP0: k.s.MAP };
      applyDry(dx * (big ? 1 : 0.1), Math.max(0, k.s.MAP + dy * (big ? 100 : 10)), base);
      afterChange(true); return true;
    }
    const ord = order();
    if (dx) { const i = ord.indexOf(state.sel.m); state.sel = { m: ord[Math.max(0, Math.min(11, i + dx))], kind: kind }; requestDraw(); return true; }
    if (!dy) return false;
    const before = cls().code, m = state.sel.m;
    state.sel.kind = kind;
    if (kind === 'T') state.T[m] = clampT(state.T[m] + dy * (big ? 1 : 0.1));
    else state.P[m] = clampP(state.P[m] + dy * (big ? 10 : 1));
    editStatus(m, kind, before);
    afterChange(true);
    return true;
  }
  function kbDescribe(kind) {
    if (state.view === 'map') return stName(station()) + T('，', ', ') + cls().code + ' ' + typeName(cls().code);
    const k = cls();
    if (state.view === 'dry') return T('年均溫 ', 'Annual mean ') + degC(k.s.MAT) + T('，年雨量 ', ', annual precipitation ') + mm(k.s.MAP, 0) + T('，乾燥界線 ', ', dryness line ') + mm(Math.max(0, k.s.dryLine), 0) + T('，類型 ', ', type ') + k.code;
    const m = state.sel.m;
    return monthName(m) + (kind === 'T' ? T('均溫 ', ' mean temperature ') + degC(state.T[m]) : T('雨量 ', ' precipitation ') + mm(state.P[m], 1)) + T('，類型 ', ', type ') + k.code;
  }
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('氣候圖。左右鍵選月份，上下鍵調整，Enter 切換溫度與雨量。', 'Climograph. Left and right choose the month, up and down change the value, Enter switches between temperature and rainfall.'),
      items: [
        { name: function () { return state.view === 'map' ? T('測站', 'Station') : state.view === 'dry' ? T('整年的位置', 'The whole year') : T('月均溫', 'Monthly temperature'); },
          move: function (dx, dy, big) { return kbMove('T', dx, dy, big); }, describe: function () { return kbDescribe('T'); } },
        { name: function () { return state.view === 'map' ? T('測站', 'Station') : state.view === 'dry' ? T('整年的位置', 'The whole year') : T('月雨量', 'Monthly precipitation'); },
          move: function (dx, dy, big) { return kbMove('P', dx, dy, big); }, describe: function () { return kbDescribe('P'); } }
      ],
      onChange: function () { if (kb) state.sel.kind = kb.index() === 1 ? 'P' : 'T'; requestDraw(); }
    });
  }

  // ---------- 分享 ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      const o = { s: state.base, c: state.cd, j: state.startJul ? 1 : 0, v: state.view, m: state.marks ? 1 : 0, sc: state.scope };
      if (flipped()) o.h = state.south ? 1 : 0;
      if (edited()) { o.t = state.T.slice(); o.p = state.P.slice(); }
      if (state.pins.length) o.pn = state.pins.map(function (p) { return p.id || [p.base, p.T, p.P, p.south ? 1 : 0]; });
      return o;
    },
    set: function (o) {
      if (!o) return;
      const okArr = function (a, lo, hi) { return Array.isArray(a) && a.length === 12 && a.every(function (v) { return isFinite(v) && v >= lo && v <= hi; }); };
      if (K.STATION[o.s]) selectStation(o.s, true);
      if (o.c === 0 || o.c === -3) state.cd = o.c;
      state.startJul = o.j === 1; state.marks = o.m !== 0;
      if (o.h === 0 || o.h === 1) state.south = o.h === 1;
      if (okArr(o.t, K.T_MIN, K.T_MAX) && okArr(o.p, 0, K.P_MAX)) { state.T = o.t.map(clampT); state.P = o.p.map(clampP); }
      state.pins = [];
      if (Array.isArray(o.pn)) o.pn.slice(0, MAXPIN).forEach(function (q, i) {
        if (typeof q === 'string' && K.STATION[q]) { const s = K.STATION[q]; state.pins.push({ id: q, base: q, T: s.T.slice(), P: s.P.slice(), south: s.south, c: i }); }
        else if (Array.isArray(q) && K.STATION[q[0]] && okArr(q[1], K.T_MIN, K.T_MAX) && okArr(q[2], 0, K.P_MAX)) state.pins.push({ id: null, base: q[0], T: q[1].map(clampT), P: q[2].map(clampP), south: q[3] === 1, c: i });
      });
      if (o.sc === 'world' || o.sc === 'tw') state.scope = o.sc;
      $('tMarks').setAttribute('aria-pressed', String(state.marks));
      $('tJul').setAttribute('aria-pressed', String(state.startJul));
      fillStations();
      setScope(state.scope, true);
      setView(['chart', 'dry', 'map'].indexOf(o.v) >= 0 ? o.v : 'chart');
    }
  });

  // =====================================================================
  // 繪製迴圈
  // =====================================================================
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(loop); }
  function loop() {
    raf = 0;
    if (state.view === 'map') drawMap();
    else if (state.view === 'dry') drawDry();
    else drawChart();
  }

  // =====================================================================
  // 開始
  // =====================================================================
  readColors();
  fillStations();
  buildTable();
  updateReadouts();
  function themeChanged() {
    readColors(); mapKey = '';
    fillStations(); buildTable(); updateReadouts();
    requestDraw();
  }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lh = 0;
    new ResizeObserver(function () {
      if ((cv.clientWidth !== lw || cv.clientHeight !== lh) && cv.clientWidth > 0) { lw = cv.clientWidth; lh = cv.clientHeight; fit(); requestDraw(); }
    }).observe(stage);
  } else window.addEventListener('resize', function () { fit(); requestDraw(); });
  fit();
  setStatus(esc(T('臺北：Cfa 溼潤副熱帶氣候。拖曳紅點或藍色長條修改，或換一個測站。', 'Taipei: Cfa, humid subtropical. Drag the red dots or the blue bars to change them, or choose another station.')));
  requestDraw();
  window.__cg = {
    state: state, K: K, snapshot: snapshot, setView: setView, setScope: setScope,
    select: function (id) { acted(); selectStation(id); afterChange(true); },
    set: function (o) {
      acted();
      if (o.T) state.T = o.T.map(clampT);
      if (o.P) state.P = o.P.map(clampP);
      if (o.south != null) state.south = !!o.south;
      if (o.cd != null) state.cd = o.cd;
      if (o.startJul != null) state.startJul = !!o.startJul;
      afterChange(true);
    },
    pin: function () { $('pin').click(); },
    redraw: function () { loop(); }
  };
})();
