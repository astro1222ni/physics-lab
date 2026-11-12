/* typhoon.js — 「颱風：氣壓、風場與危險半圓」的畫面與互動
 * 物理計算全部在 typhoon-core.js；3D 氣壓漏斗在 typhoon-3d.js，切換到 3D 時才載入。 */
(function () {
  'use strict';
  const K = window.TyphoonCore;
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
  const PENV = 1010;                 // 環境氣壓（hPa）
  const START = 450e3;               // 颱風從測站區前方 450 km 出發，走到後方 450 km
  const STILL_H = 48;                // 颱風不動時模擬 48 小時
  const REC = 900;                   // 紀錄每 15 分鐘一筆
  const VIEW_W = 1400e3, VIEW_H = 1000e3;

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = { pc: $('pc'), rm: $('rm'), hb: $('hb'), lat: $('lat'), spd: $('spd'), hd: $('hd') };
  const state = {
    pc: 950, rm: 40, B: 1.5, lat: 23, c: 5, hd: 300,
    st: [], running: false, speed: 3, chart: 'a', done: false, acted: false
  };
  /** 預設測站：路徑經過原點，A 在右邊 60 km、B 在左邊 60 km */
  function defaultStations() {
    const h = state.hd * K.DEG;
    return [{ x: 60e3 * Math.cos(h), y: -60e3 * Math.sin(h) }, { x: -60e3 * Math.cos(h), y: 60e3 * Math.sin(h) }];
  }
  state.st = defaultStations();
  function storm() { return { pc: state.pc, penv: PENV, Rm: state.rm * 1e3, B: state.B, lat: state.lat, c: state.c, hd: state.hd }; }
  function readSliders() {
    state.pc = val(el.pc); state.rm = val(el.rm); state.B = val(el.hb); state.lat = val(el.lat); state.c = val(el.spd); state.hd = val(el.hd);
  }
  function duration() { return state.c > 0 ? 2 * START / state.c : STILL_H * 3600; }
  let run = null, sum = null;
  function newRun() {
    const S = storm(), h = S.hd * K.DEG, D0 = S.c > 0 ? START : 0;
    run = K.makeRun(S, { x: -D0 * Math.sin(h), y: -D0 * Math.cos(h) }, state.st);
    K.begin(run);
    state.done = false;
  }
  function recompute() { sum = K.summary(storm()); }
  function center() { return K.centerAt(run, run.t); }

  // =====================================================================
  // 顏色與文字
  // =====================================================================
  let C = {}, WSTOPS = [];
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--surface',
      '--ty-sea1', '--ty-sea2', '--ty-iso', '--ty-track', '--ty-w0', '--ty-w1', '--ty-w2', '--ty-w3', '--ty-w4', '--ty-w5', '--ty-w6',
      '--ty-a', '--ty-b', '--ty-p', '--ty-v', '--ty-vg', '--ty-danger']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    const rgb = function (c) { const m = D.alpha(c, 1).match(/[\d.]+/g); return [+m[0], +m[1], +m[2]]; };
    WSTOPS = [[0, rgb(C['ty-w0']), 0], [13.9, rgb(C['ty-w1']), 0.62], [17.2, rgb(C['ty-w2']), 0.72], [24.5, rgb(C['ty-w3']), 0.78],
      [32.7, rgb(C['ty-w4']), 0.82], [51, rgb(C['ty-w5']), 0.86], [61.3, rgb(C['ty-w6']), 0.9]];
  }
  /** 風速 → [r, g, b, a]（a 0–1） */
  function windColor(v) {
    if (v >= WSTOPS[WSTOPS.length - 1][0]) { const s = WSTOPS[WSTOPS.length - 1]; return [s[1][0], s[1][1], s[1][2], s[2]]; }
    for (let i = 0; i < WSTOPS.length - 1; i++) {
      const a = WSTOPS[i], b = WSTOPS[i + 1];
      if (v < b[0]) {
        const u = (v - a[0]) / (b[0] - a[0]);
        return [a[1][0] + (b[1][0] - a[1][0]) * u, a[1][1] + (b[1][1] - a[1][1]) * u, a[1][2] + (b[1][2] - a[1][2]) * u, a[2] + (b[2] - a[2]) * u];
      }
    }
    return [0, 0, 0, 0];
  }
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function outNum(v, lo, hi) {
    let t = v.toFixed(hi);
    if (hi > lo) t = t.replace(new RegExp('0{1,' + (hi - lo) + '}$'), '').replace(/\.$/, '');
    return t.replace('-', '−');
  }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function sci(v, d) {
    if (!isFinite(v) || v === 0) return num(v, d);
    const e = Math.floor(Math.log10(Math.abs(v)));
    return num(v / Math.pow(10, e), d) + '×10<sup>' + String(e).replace('-', '−') + '</sup>';
  }
  const ZH16 = ['北', '北北東', '東北', '東北東', '東', '東南東', '東南', '南南東', '南', '南南西', '西南', '西南西', '西', '西北西', '西北', '北北西'];
  const EN16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  function dir16(b) { const i = Math.round(((b % 360) + 360) % 360 / 22.5) % 16; return { zh: ZH16[i], en: EN16[i] }; }
  function windName(from) { const d = dir16(from); return T(d.zh + '風', d.en + ' wind'); }
  function beauText(v) { const n = K.beaufort(v); return n >= 18 ? T('17 級以上', 'above force 17') : T(n + ' 級', 'force ' + n); }
  function kmh(v) { return num(v * 3.6, 0) + ' km/h'; }
  function hoursText(h) { return T('第 ', 'hour ') + num(h, 1) + T(' 小時', ''); }
  function clsHTML(c) { return '<span class="cls ' + c.key + '">' + T(c.zh, c.en) + '</span>'; }

  // =====================================================================
  // 地圖
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
  function resizeCv() { cvSize = fit(cv, ctx); grSize = fit(gr, gtx); requestDraw(); }
  function mapLay(W, H) {
    const k = Math.min(W / VIEW_W, H / VIEW_H);
    return { W: W, H: H, k: k, cx: W / 2, cy: H / 2,
      px: function (x) { return W / 2 + x * k; }, py: function (y) { return H / 2 - y * k; },
      xOf: function (p) { return (p - W / 2) / k; }, yOf: function (p) { return (H / 2 - p) / k; } };
  }
  // 風速色塊：低解析度離屏畫布，每幀重算（約一萬個格點）
  const fieldCv = document.createElement('canvas'), fieldCtx = fieldCv.getContext('2d');
  function drawField(g, L, S, cc) {
    const fw = L.W < 520 ? 90 : 140, fh = Math.max(20, Math.round(fw * L.H / L.W));
    if (fieldCv.width !== fw || fieldCv.height !== fh) { fieldCv.width = fw; fieldCv.height = fh; }
    const img = fieldCtx.createImageData(fw, fh), d = img.data;
    for (let j = 0; j < fh; j++) {
      const y = L.yOf((j + 0.5) / fh * L.H) - cc.y;
      for (let i = 0; i < fw; i++) {
        const x = L.xOf((i + 0.5) / fw * L.W) - cc.x;
        const c = windColor(K.windAt(S, x, y).speed), o = (j * fw + i) * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = Math.round(c[3] * 255);
      }
    }
    fieldCtx.putImageData(img, 0, 0);
    g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(fieldCv, 0, 0, L.W, L.H); g.restore();
  }
  function isoRadius(S, level) {
    const dp = K.dp(S);
    if (level <= S.pc || level >= S.penv) return null;
    return S.Rm / Math.pow(-Math.log((level - S.pc) / dp), 1 / S.B);
  }
  function arrowSmall(g, x, y, u, v, len, color, w) {
    const sp = Math.hypot(u, v); if (sp < 1e-6) return;
    const dx = u / sp, dy = -v / sp;
    const x0 = x - dx * len / 2, y0 = y - dy * len / 2, x1 = x + dx * len / 2, y1 = y + dy * len / 2;
    const hl = Math.min(7, len * 0.42);
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1);
    g.moveTo(x1, y1); g.lineTo(x1 - dx * hl - dy * hl * 0.55, y1 - dy * hl + dx * hl * 0.55);
    g.moveTo(x1, y1); g.lineTo(x1 - dx * hl + dy * hl * 0.55, y1 - dy * hl - dx * hl * 0.55);
    g.strokeStyle = 'rgba(8,16,28,0.45)'; g.lineWidth = w + 2; g.stroke();
    g.strokeStyle = color; g.lineWidth = w; g.stroke();
  }
  /** 地圖上的文字：深色光暈（地圖底色是深海，用 haloText 的淺色光暈會看不清） */
  function mapText(g, text, x, y, color, align, base, font) {
    g.save(); g.font = font; g.textAlign = align; g.textBaseline = base; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(6,14,26,0.82)'; g.lineWidth = 3.5; g.strokeText(text, x, y);
    g.fillStyle = color; g.fillText(text, x, y); g.restore();
  }
  /** 地圖上的標籤：深底圓角框、彩色字（和 3D 的標籤一致）；y 是框的中線 */
  function tag(g, text, x, y, color, align, font) {
    g.save(); g.font = font;
    const w = g.measureText(text).width + 14, h = parseFloat(/(\d+(\.\d+)?)px/.exec(font)[1]) + 9;
    let x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
    x0 = Math.max(4, Math.min(cvSize.w - w - 4, x0));
    const y0 = Math.max(4, Math.min(cvSize.h - h - 4, y - h / 2));
    D.roundRect(g, x0, y0, w, h, h / 2);
    g.fillStyle = 'rgba(8,14,24,0.8)'; g.fill();
    g.strokeStyle = D.alpha(color, 0.65); g.lineWidth = 1; g.stroke();
    g.fillStyle = color; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(text, x0 + 7, y0 + h / 2 + 0.5);
    g.restore();
  }
  function drawMap(t) {
    if (!cvSize) return;
    const W = cvSize.w, H = cvSize.h, L = mapLay(W, H), g = ctx, S = run.S, cc = center();
    const fs = W < 520 ? 11 : 12;
    g.clearRect(0, 0, W, H);
    // 海
    const sea = g.createRadialGradient(W * 0.45, H * 0.4, 10, W / 2, H / 2, Math.max(W, H) * 0.8);
    sea.addColorStop(0, C['ty-sea1']); sea.addColorStop(1, C['ty-sea2']);
    g.fillStyle = sea; g.fillRect(0, 0, W, H);
    // 方格（每 200 km）
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1;
    for (let x = Math.ceil(L.xOf(0) / 200e3) * 200e3; x <= L.xOf(W); x += 200e3) { const p = Math.round(L.px(x)) + 0.5; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, H); g.stroke(); }
    for (let y = Math.ceil(L.yOf(H) / 200e3) * 200e3; y <= L.yOf(0); y += 200e3) { const p = Math.round(L.py(y)) + 0.5; g.beginPath(); g.moveTo(0, p); g.lineTo(W, p); g.stroke(); }
    // 風速色塊
    drawField(g, L, S, cc);
    // 危險半圓
    const ccx = L.px(cc.x), ccy = L.py(cc.y);
    let ringA = Math.PI * 0.78;
    if (state.c > 0 && sum.r7 > 0) {
      const ah = Math.atan2(-Math.cos(state.hd * K.DEG), Math.sin(state.hd * K.DEG));
      const r7 = sum.r7 * L.k, a0 = state.lat >= 0 ? ah : ah + Math.PI;
      g.save();
      g.beginPath(); g.moveTo(ccx, ccy); g.arc(ccx, ccy, r7, a0, a0 + Math.PI); g.closePath();
      g.fillStyle = D.alpha(C['ty-danger'], 0.1); g.fill();
      g.clip();
      g.strokeStyle = D.alpha(C['ty-danger'], 0.22); g.lineWidth = 1.5;
      for (let s = -r7 * 2; s < r7 * 2; s += 10) { g.beginPath(); g.moveTo(ccx + s - r7, ccy - r7); g.lineTo(ccx + s + r7, ccy + r7); g.stroke(); }
      g.restore();
      const am = a0 + Math.PI / 2;
      tag(g, T('危險半圓', 'Dangerous semicircle'), ccx + Math.cos(am) * (r7 + 16), ccy + Math.sin(am) * (r7 + 16), C['ty-danger'], Math.cos(am) > 0.3 ? 'left' : Math.cos(am) < -0.3 ? 'right' : 'center', '700 ' + fs + 'px ' + FONT);
      ringA = am + Math.PI;
    }
    // 等壓線
    g.save();
    let lastLab = -1e9;
    const isoLabs = [];
    for (let lv = Math.floor(S.pc / 10) * 10 + 10; lv < PENV; lv += 10) {
      const r = isoRadius(S, lv);
      if (r == null) continue;
      const rp = r * L.k;
      if (rp < 3 || rp > Math.hypot(W, H) * 1.2) continue;
      g.strokeStyle = D.alpha(C['ty-iso'], lv % 50 === 0 ? 0.75 : 0.45); g.lineWidth = lv % 50 === 0 ? 1.6 : 1;
      g.beginPath(); g.arc(ccx, ccy, rp, 0, Math.PI * 2); g.stroke();
      if (rp > 30 && rp - lastLab >= 15) { lastLab = rp; isoLabs.push([String(lv), ccy - rp]); }
    }
    g.restore();
    // 暴風圈
    [[sum.r7, C['ty-w1'], T('七級風', 'Force 7'), [8, 5], 0.22], [sum.r10, C['ty-w3'], T('十級風', 'Force 10'), null, -0.22]].forEach(function (q) {
      if (!(q[0] > 0)) return;
      const rp = q[0] * L.k;
      g.save(); if (q[3]) g.setLineDash(q[3]);
      g.strokeStyle = 'rgba(6,14,26,0.55)'; g.lineWidth = 4.4; g.beginPath(); g.arc(ccx, ccy, rp, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = q[1]; g.lineWidth = 2.2; g.beginPath(); g.arc(ccx, ccy, rp, 0, Math.PI * 2); g.stroke(); g.restore();
      const a = ringA + q[4];
      tag(g, q[2], ccx + Math.cos(a) * rp, ccy + Math.sin(a) * rp, q[1], 'center', '700 ' + (fs - 1) + 'px ' + FONT);
    });
    isoLabs.forEach(function (q) { mapText(g, q[0], ccx, q[1], '#ffffff', 'center', 'middle', '600 ' + (fs - 1) + 'px ' + FONT); });
    // 最大風速半徑
    g.save(); g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1; g.setLineDash([3, 3]);
    g.beginPath(); g.arc(ccx, ccy, Math.max(2, S.Rm * L.k), 0, Math.PI * 2); g.stroke(); g.restore();
    // 路徑
    const m = K.motion(S), Tt = duration();
    if (state.c > 0) {
      const sx = L.px(run.start.x), sy = L.py(run.start.y), ex = L.px(run.start.x + m.x * Tt), ey = L.py(run.start.y + m.y * Tt);
      g.save(); g.lineCap = 'round';
      g.strokeStyle = D.alpha(C['ty-track'], 0.55); g.lineWidth = 2; g.setLineDash([8, 7]);
      g.beginPath(); g.moveTo(ccx, ccy); g.lineTo(ex, ey); g.stroke();
      g.setLineDash([]); g.strokeStyle = C['ty-track']; g.lineWidth = 3;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(ccx, ccy); g.stroke();
      g.restore();
      D.arrow(g, ex - (ex - sx) * 0.04, ey - (ey - sy) * 0.04, ex, ey, C['ty-track'], 2.5);
    }
    // 地面風箭頭
    const gap = W < 520 ? 52 : 64;
    for (let py = gap / 2; py < H; py += gap) {
      for (let px = gap / 2; px < W; px += gap) {
        const w = K.windAt(S, L.xOf(px) - cc.x, L.yOf(py) - cc.y);
        if (w.speed < 2) continue;
        arrowSmall(g, px, py, w.u, w.v, Math.min(gap * 0.55, 6 + w.speed * 0.5), 'rgba(255,255,255,0.9)', 1.4);
      }
    }
    // 颱風中心
    drawCenter(g, ccx, ccy, t);
    // 測站
    run.st.forEach(function (s, i) {
      const x = L.px(s.x), y = L.py(s.y), w = K.observe(run, s, run.t);
      const col = i ? C['ty-b'] : C['ty-a'];
      arrowSmall(g, x, y, w.u, w.v, Math.min(64, 12 + w.speed * 0.9), col, 3);
      g.save(); g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
      g.fillStyle = col; g.beginPath(); g.arc(x, y, drag === i || kbSel === i ? 13 : 11, 0, Math.PI * 2); g.fill(); g.restore();
      g.lineWidth = 2; g.strokeStyle = '#ffffff'; g.beginPath(); g.arc(x, y, drag === i || kbSel === i ? 13 : 11, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#0f172a'; g.font = '800 ' + (fs + 1) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(i ? 'B' : 'A', x, y + 1);
      const right = x < W - 130;
      tag(g, num(w.p, 0) + ' hPa・' + num(w.speed, 0) + ' m/s', x + (right ? 16 : -16), y + (i ? 18 : -18), col, right ? 'left' : 'right', '600 ' + (fs - 1) + 'px ' + FONT);
    });
    // 時間、比例尺、指北
    tag(g, hoursText(run.t / 3600) + (state.done ? T('・颱風走完了', ' · finished') : ''), 8, 18, '#f8fafc', 'left', '700 ' + fs + 'px ' + FONT);
    const sb = 200e3 * L.k, bx = W - 14 - sb, by = H - 14;
    g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(bx, by - 5); g.lineTo(bx, by); g.lineTo(bx + sb, by); g.lineTo(bx + sb, by - 5); g.stroke();
    mapText(g, '200 km', bx + sb / 2, by - 8, '#ffffff', 'center', 'bottom', '600 ' + (fs - 1) + 'px ' + FONT);
    const nx = W - 22, ny = 30;
    D.arrow(g, nx, ny + 12, nx, ny - 10, '#ffffff', 2);
    mapText(g, T('北', 'N'), nx, ny + 23, '#ffffff', 'center', 'middle', '700 ' + (fs - 1) + 'px ' + FONT);
  }
  function drawCenter(g, x, y, t) {
    const h = state.lat >= 0 ? 1 : -1;
    const spin = reducedMotion || !state.running ? 0 : -h * t / 600;
    g.save(); g.translate(x, y); g.rotate(spin);
    g.strokeStyle = '#ffffff'; g.lineWidth = 3.2; g.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      g.beginPath();
      for (let i = 0; i <= 20; i++) {
        const a = k * Math.PI + (-h) * i / 20 * 2.2, r = 7 + i * 0.6;
        const px = r * Math.cos(a), py = r * Math.sin(a);
        if (i) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.stroke();
    }
    g.fillStyle = C['ty-danger']; g.beginPath(); g.arc(0, 0, 7.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, 3, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  // =====================================================================
  // 圖表
  // =====================================================================
  const GM = { l: 48, r: 48, t: 54, b: 32 };
  function niceStep(span, n) {
    const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  function plotBase(g, W, H) {
    g.fillStyle = C['canvas-bg']; g.fillRect(0, 0, W, H);
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, D.dark ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.04)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
  function axisX(g, W, H, x0, x1, X, label, fmt, fs) {
    const xs = niceStep(x1 - x0, W < 520 ? 4 : 8);
    for (let v = Math.ceil(x0 / xs) * xs; v <= x1 + 1e-9; v += xs) {
      const p = Math.round(X(v)) + 0.5;
      g.strokeStyle = D.alpha(C.text, 0.07); g.lineWidth = 1; g.beginPath(); g.moveTo(p, GM.t); g.lineTo(p, H - GM.b); g.stroke();
      D.haloText(g, fmt(v), p, H - GM.b + 12, C.muted, 'center', 'middle', '500 ' + fs + 'px ' + FONT);
    }
    D.haloText(g, label, W - GM.r, H - 5, C.muted, 'right', 'bottom', '600 ' + fs + 'px ' + FONT);
  }
  function axisY(g, W, H, y0, y1, Y, side, color, fmt, fs, grid) {
    const ys = niceStep(y1 - y0, 5);
    for (let v = Math.ceil(y0 / ys) * ys; v <= y1 + 1e-9; v += ys) {
      const p = Math.round(Y(v)) + 0.5;
      if (grid) { g.strokeStyle = D.alpha(C.text, 0.07); g.lineWidth = 1; g.beginPath(); g.moveTo(GM.l, p); g.lineTo(W - GM.r, p); g.stroke(); }
      D.haloText(g, fmt(v), side === 'l' ? GM.l - 5 : W - GM.r + 5, p, color, side === 'l' ? 'right' : 'left', 'middle', '500 ' + fs + 'px ' + FONT);
    }
  }
  function poly(g, pts, color, w, dash) {
    if (pts.length < 2) return;
    g.save(); g.strokeStyle = color; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; if (dash) g.setLineDash(dash);
    g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.stroke(); g.restore();
  }
  function drawChart() {
    if (!grSize) return;
    const W = grSize.w, H = grSize.h, g = gtx;
    g.clearRect(0, 0, W, H);
    plotBase(g, W, H);
    if (state.chart === 'prof') drawProfile(g, W, H); else drawStation(g, W, H, state.chart === 'b' ? 1 : 0);
  }
  function drawStation(g, W, H, i) {
    const fs = W < 520 ? 10.5 : 11.5, s = run.st[i], rec = s.rec;
    const Th = duration() / 3600;
    let pmin = Math.min(state.pc, 1000), wmax = 20;
    rec.forEach(function (r) { pmin = Math.min(pmin, r.p); wmax = Math.max(wmax, r.speed); });
    const p0 = Math.floor((pmin - 5) / 10) * 10, p1 = PENV + 5, w1 = Math.ceil((wmax + 5) / 10) * 10;
    const X = function (h) { return GM.l + h / Th * (W - GM.l - GM.r); };
    const YP = function (p) { return H - GM.b - (p - p0) / (p1 - p0) * (H - GM.t - GM.b); };
    const YW = function (v) { return H - GM.b - v / w1 * (H - GM.t - GM.b); };
    axisX(g, W, H, 0, Th, X, T('時間（小時）', 'Time (h)'), function (v) { return num(v, 0); }, fs);
    axisY(g, W, H, p0, p1, YP, 'l', C['ty-p'], function (v) { return num(v, 0); }, fs, true);
    axisY(g, W, H, 0, w1, YW, 'r', C['ty-v'], function (v) { return num(v, 0); }, fs, false);
    // 颱風等級門檻
    [[17.2, T('颱風', 'Typhoon')], [32.7, T('中颱', 'Moderate')], [51, T('強颱', 'Severe')]].forEach(function (q) {
      if (q[0] > w1) return;
      const y = Math.round(YW(q[0])) + 0.5;
      g.save(); g.strokeStyle = D.alpha(C['ty-v'], 0.35); g.setLineDash([3, 4]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(GM.l, y); g.lineTo(W - GM.r, y); g.stroke(); g.restore();
      D.haloText(g, q[1], W - GM.r - 4, y - 2, D.alpha(C['ty-v'], 0.8), 'right', 'bottom', '500 ' + (fs - 0.5) + 'px ' + FONT);
    });
    g.save(); g.strokeStyle = D.alpha(C['ty-v'], 0.3); g.lineWidth = 1; g.beginPath(); g.moveTo(W - GM.r + 0.5, GM.t); g.lineTo(W - GM.r + 0.5, H - GM.b); g.stroke();
    g.strokeStyle = D.alpha(C['ty-p'], 0.3); g.beginPath(); g.moveTo(GM.l + 0.5, GM.t); g.lineTo(GM.l + 0.5, H - GM.b); g.stroke(); g.restore();
    const pp = rec.map(function (r) { return [X(r.t / 3600), YP(r.p)]; }), ww = rec.map(function (r) { return [X(r.t / 3600), YW(r.speed)]; });
    poly(g, ww, D.alpha(C['ty-v'], 0.25), 6); poly(g, ww, C['ty-v'], 2.2);
    poly(g, pp, C['ty-p'], 2.2, [7, 4]);
    // 風向：每 3 小時一個箭頭（指向風吹去的方向）
    const yA = 15;
    rec.forEach(function (r) {
      if (Math.round(r.t / REC) % 12 !== 0 || r.speed < 1) return;
      const a = (r.from + 180) * K.DEG;
      arrowSmall(g, X(r.t / 3600), yA, Math.sin(a), Math.cos(a), 14, i ? C['ty-b'] : C['ty-a'], 1.8);
    });
    // 現在
    const xn = X(run.t / 3600);
    g.save(); g.strokeStyle = D.alpha(C.text, 0.4); g.setLineDash([2, 3]); g.lineWidth = 1; g.beginPath(); g.moveTo(xn, GM.t); g.lineTo(xn, H - GM.b); g.stroke(); g.restore();
    D.haloText(g, T('氣壓（hPa，左軸、虛線）', 'Pressure (hPa, left, dashed)'), GM.l - 40, GM.t - 13, C['ty-p'], 'left', 'middle', '600 ' + fs + 'px ' + FONT);
    D.haloText(g, T('風速（m/s，右軸）', 'Wind speed (m/s, right)'), W - GM.r + 40, GM.t - 13, C['ty-v'], 'right', 'middle', '600 ' + fs + 'px ' + FONT);
  }
  function drawProfile(g, W, H) {
    const fs = W < 520 ? 10.5 : 11.5, S = run.S;
    const rMax = Math.min(1000, Math.max(300, Math.ceil(((sum.r7 || 0) / 1e3 * 1.3) / 100) * 100));
    const vg = sum.vGrad, w1 = Math.max(30, Math.ceil((vg + 5) / 10) * 10);
    const p0 = Math.floor((state.pc - 5) / 10) * 10, p1 = PENV + 5;
    const X = function (r) { return GM.l + r / rMax * (W - GM.l - GM.r); };
    const YW = function (v) { return H - GM.b - v / w1 * (H - GM.t - GM.b); };
    const YP = function (p) { return H - GM.b - (p - p0) / (p1 - p0) * (H - GM.t - GM.b); };
    axisX(g, W, H, 0, rMax, X, T('離中心的距離（km）', 'Distance from the centre (km)'), function (v) { return num(v, 0); }, fs);
    axisY(g, W, H, 0, w1, YW, 'l', C['ty-v'], function (v) { return num(v, 0); }, fs, true);
    axisY(g, W, H, p0, p1, YP, 'r', C['ty-p'], function (v) { return num(v, 0); }, fs, false);
    [[17.2, T('輕颱', 'Mild')], [32.7, T('中颱', 'Moderate')], [51, T('強颱', 'Severe')]].forEach(function (q) {
      if (q[0] > w1) return;
      const y = Math.round(YW(q[0])) + 0.5;
      g.save(); g.strokeStyle = D.alpha(C['ty-v'], 0.35); g.setLineDash([3, 4]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(GM.l, y); g.lineTo(W - GM.r, y); g.stroke(); g.restore();
      D.haloText(g, q[1], GM.l + 4, y - 2, D.alpha(C['ty-v'], 0.8), 'left', 'bottom', '500 ' + (fs - 0.5) + 'px ' + FONT);
    });
    const ink = function (c) { return D.dark ? c : D.mix(c, '#1f2937', 0.42); };
    [[S.Rm / 1e3, 'Rm', 'rgba(148,163,184,0.9)'], [sum.r10 / 1e3, T('十級', 'F10'), ink(C['ty-w3'])], [sum.r7 / 1e3, T('七級', 'F7'), ink(C['ty-w1'])]].forEach(function (q) {
      if (!(q[0] > 0) || q[0] > rMax) return;
      const x = Math.round(X(q[0])) + 0.5;
      g.save(); g.strokeStyle = q[2]; g.setLineDash([4, 4]); g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, GM.t); g.lineTo(x, H - GM.b); g.stroke(); g.restore();
      D.haloText(g, q[1], x + 3, H - GM.b - 6, q[2], 'left', 'bottom', '600 ' + fs + 'px ' + FONT);
    });
    const ps = [], gs = [], pp = [];
    for (let i = 1; i <= 240; i++) {
      const r = rMax * 1e3 * i / 240;
      ps.push([X(r / 1e3), YW(K.surfaceSym(S, r))]); gs.push([X(r / 1e3), YW(K.gradWind(S, r))]); pp.push([X(r / 1e3), YP(K.pressure(S, r))]);
    }
    poly(g, gs, C['ty-vg'], 1.8, [6, 4]);
    poly(g, ps, D.alpha(C['ty-v'], 0.25), 6); poly(g, ps, C['ty-v'], 2.4);
    poly(g, pp, C['ty-p'], 2, [2, 3]);
    D.haloText(g, T('地面風速（m/s，左軸）', 'Surface wind (m/s, left)'), GM.l - 40, GM.t - 13, C['ty-v'], 'left', 'middle', '600 ' + fs + 'px ' + FONT);
    D.haloText(g, T('氣壓（hPa，右軸、點線）', 'Pressure (hPa, right, dotted)'), W - GM.r + 40, GM.t - 13, C['ty-p'], 'right', 'middle', '600 ' + fs + 'px ' + FONT);
    D.haloText(g, T('梯度風（虛線，不含摩擦）', 'Gradient wind (dashed, no friction)'), GM.l - 40, GM.t - 33, C['ty-vg'], 'left', 'middle', '600 ' + fs + 'px ' + FONT);
  }
  function chartAria() {
    return state.chart === 'prof' ? T('風速剖面：地面風、梯度風與氣壓隨離中心距離的變化', 'Wind profile: surface wind, gradient wind and pressure against distance from the centre')
      : T('測站 ', 'Station ') + (state.chart === 'b' ? 'B' : 'A') + T(' 的氣壓、風速與風向紀錄', ' record: pressure, wind speed and direction');
  }

  // =====================================================================
  // 讀數、事件與音效
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function setStatus(s) { $('status').textContent = s; }
  function stormData() {
    return { pc: state.pc, Rm: state.rm, B: state.B, lat: state.lat, c: state.c, hd: state.hd, dp: sum.dp,
      vMax: sum.vMax, vSym: sum.vSym, vGrad: sum.vGrad, cls: sum.cls.key, r7: sum.r7 / 1e3, r10: sum.r10 / 1e3, surge: sum.surge * 100 };
  }
  let lastEmit = 0;
  function emitStorm(force) {
    const t = performance.now();
    if (force || t - lastEmit > 250) { lastEmit = t; emit('storm', stormData()); }
  }
  function refreshOutputs() {
    setOut(el.pc, outNum(state.pc, 0, 1));
    setOut(el.rm, outNum(state.rm, 0, 1));
    setOut(el.hb, outNum(state.B, 2, 2));
    setOut(el.lat, outNum(state.lat, 1, 1));
    setOut(el.spd, outNum(state.c, 1, 1));
    setOut(el.hd, outNum(state.hd, 0, 0));
  }
  function sideText(i) {
    const s = K.stats(run, i), d = Math.abs(s.side);
    if (state.c === 0) return T('離颱風中心 ', '') + num(Math.hypot(run.st[i].x - run.start.x, run.st[i].y - run.start.y) / 1e3, 0) + T(' km（颱風不動）', ' km from the centre (typhoon not moving)');
    if (d < 0.5) return T('就在路徑上', 'right on the track');
    return (s.side > 0 ? T('在路徑右邊 ', '') : T('在路徑左邊 ', '')) + num(d, 0) + T(' km', ' km ' + (s.side > 0 ? 'right of the track' : 'left of the track'));
  }
  function rotText(r) {
    if (Math.abs(r) < 5) return T('幾乎沒轉', 'hardly at all');
    return (r > 0 ? T('順轉（順時針）', 'veered (clockwise) ') : T('逆轉（逆時針）', 'backed (anticlockwise) ')) + num(Math.abs(r), 0) + '°';
  }
  function updateReadouts() {
    const S = run.S;
    setHTML('rCls', clsHTML(sum.cls));
    setHTML('rVmax', num(sum.vMax, 1) + ' m/s（' + kmh(sum.vMax) + '，' + beauText(sum.vMax) + '）');
    setHTML('rSide', state.c === 0 ? T('四周一樣強（颱風不動）', 'equally strong all round (not moving)')
      : (sum.relMax > 0 ? T('移動方向的右邊', 'on the right of its motion') : T('移動方向的左邊', 'on the left of its motion')) +
        (state.lat >= 0 ? T('（北半球的危險半圓）', ' (dangerous semicircle, northern hemisphere)') : T('（南半球的危險半圓）', ' (dangerous semicircle, southern hemisphere)')));
    setHTML('rR7', sum.r7 > 0 ? num(sum.r7 / 1e3, 0) + ' km' : T('沒有（風速不到 13.9 m/s）', 'none (wind below 13.9 m/s)'));
    setHTML('rR10', sum.r10 > 0 ? num(sum.r10 / 1e3, 0) + ' km' : T('沒有（風速不到 24.5 m/s）', 'none (wind below 24.5 m/s)'));
    setHTML('rDp', num(sum.dp, 1) + ' hPa');
    setHTML('rSurge', T('約 ', 'about ') + num(sum.surge * 100, 0) + T(' cm（倒氣壓效應）', ' cm (inverse barometer)'));
    setHTML('rVg', num(sum.vGrad, 1) + ' m/s' + T('（最大，在 ', ' (max, at ') + num(sum.rGrad / 1e3, 0) + ' km' + T('）', ')'));
    const f = K.coriolisF(state.lat);
    setHTML('latHint', 'f = 2Ω sin φ = <b>' + (Math.abs(f) < 1e-12 ? '0' : sci(f, 2)) + '</b> s<sup>−1</sup>' +
      (Math.abs(state.lat) < 5 ? T('。赤道附近科氏力太弱，真實的颱風幾乎不在這裡形成。', '. Near the equator the Coriolis effect is too weak; real typhoons almost never form here.')
        : state.lat < 0 ? T('。南半球：颱風順時針旋轉。', '. Southern hemisphere: the storm turns clockwise.') : T('。北半球：颱風逆時針旋轉。', '. Northern hemisphere: the storm turns anticlockwise.')));
    const dd = dir16(state.hd);
    setHTML('moveHint', state.c === 0 ? T('颱風停在原地（模擬 48 小時）。', 'The typhoon stays put (48 hours are simulated).')
      : T('往<b>' + dd.zh + '</b>，時速 <b>' + kmh(state.c) + '</b>；走完 900 km 要 <b>' + num(duration() / 3600, 1) + '</b> 小時。',
        'Moving toward <b>' + dd.en + '</b> at <b>' + kmh(state.c) + '</b>; the 900 km run takes <b>' + num(duration() / 3600, 1) + '</b> hours.'));
    ['a', 'b'].forEach(function (k, i) {
      const s = K.stats(run, i), w = K.observe(run, run.st[i], run.t);
      setHTML(k + 'Side', T('測站 ', 'Station ') + k.toUpperCase() + T('：', ': ') + sideText(i));
      setHTML(k + 'Now', num(w.p, 1) + ' hPa、' + num(w.speed, 1) + ' m/s（' + beauText(w.speed) + '）' + (w.speed >= 0.5 ? T('，吹', ', ') + windName(w.from) : ''));
      const started = run.t > 0;
      setHTML(k + 'Max', started ? num(s.maxW, 1) + ' m/s（' + beauText(s.maxW) + T('，', ', ') + hoursText(s.maxWt) + '）' : '—');
      setHTML(k + 'MinP', started ? num(s.minP, 1) + ' hPa（' + hoursText(s.minPt) + '）' : '—');
      setHTML(k + 'Rot', started ? rotText(s.rot) + (s.eye ? T('；颱風眼經過（' + num(s.minW, 1) + ' m/s）', '; the eye passed (' + num(s.minW, 1) + ' m/s)') : '') : '—');
    });
    setHTML('chartHint', state.chart === 'prof'
      ? T('地面風速在最大風速半徑 Rm 附近最強，往外慢慢變小；虛線的七級、十級就是暴風半徑。氣壓從中心往外一路上升到 1010 hPa。', 'The surface wind peaks near the radius of maximum wind Rm and fades outward; the dashed force-7 and force-10 lines are the gale radii. Pressure rises from the centre to 1010 hPa.')
      : T('氣壓計與風速計的紀錄；上方的小箭頭是每 3 小時的風向（指向風吹去的方向）。颱風最靠近時氣壓最低。', 'Barometer and anemometer record; the small arrows above show the wind every 3 hours (pointing where the wind blows to). Pressure is lowest when the typhoon is closest.'));
  }
  let lastSay = 0;
  function sayNow(force) {
    const w = K.observe(run, run.st[0], run.t);
    const txt = hoursText(run.t / 3600) + T('，測站 A：', ', station A: ') + num(w.p, 0) + ' hPa、' + num(w.speed, 0) + ' m/s';
    const t = performance.now();
    if (force || t - lastSay > 5000) { $('srNow').textContent = txt; lastSay = t; }
  }
  function updatePlay() { $('play').textContent = state.running ? T('暫停', 'Pause') : state.done ? T('再跑一次', 'Run again') : T('播放', 'Play'); }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  // 持續的風聲：音高與音量隨測站 A 的風速
  let windVoice = null;
  function windSound() {
    const S = sound();
    if (!S || !state.running || !S.voice) { if (windVoice) { try { windVoice.stop(); } catch (e) { /* 忽略 */ } windVoice = null; } return; }
    const w = K.observe(run, run.st[0], run.t).speed;
    const f = 260 + w * 9, gain = Math.min(0.09, 0.012 + w * 0.0014);
    if (!windVoice) { try { windVoice = S.voice({ freq: f, type: 'sawtooth', gain: gain }); } catch (e) { windVoice = null; } }
    else if (windVoice.set) windVoice.set({ freq: f, gain: gain });
  }
  function finish() {
    state.running = false; state.done = true;
    updatePlay(); windSound();
    const S = sound(); if (S) { S.tone({ freq: 660, dur: 0.12, gain: 0.16 }); setTimeout(function () { S.tone({ freq: 880, dur: 0.18, gain: 0.14 }); }, 120); }
    const a = K.stats(run, 0), b = K.stats(run, 1);
    setStatus(T('颱風走完了。測站 A 最大風速 ', 'The typhoon has passed. Station A: strongest wind ') + num(a.maxW, 1) + T(' m/s、風向', ' m/s, wind ') + rotText(a.rot) +
      T('；測站 B 最大風速 ', '; station B: ') + num(b.maxW, 1) + T(' m/s、風向', ' m/s, wind ') + rotText(b.rot) + T('。', '.'));
    const d = stormData(); d.t = run.t / 3600; d.st = [a, b];
    emit('pass', d);
    sayNow(true);
  }
  function restart(msg) {
    newRun();
    if (msg) setStatus(msg);
    updatePlay(); updateReadouts(); requestDraw();
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  function setSeg(id, attr, v) {
    document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(v))); });
  }
  Object.keys(el).forEach(function (k) {
    el[k].addEventListener('input', function () {
      acted();
      const oldHd = state.hd;
      readSliders(); refreshOutputs(); recompute();
      if (k === 'hd' && oldHd !== state.hd) {
        // 測站跟著路徑轉：保持在路徑左右同樣的距離
        const a = (state.hd - oldHd) * K.DEG;
        state.st = state.st.map(function (s) { return { x: s.x * Math.cos(a) + s.y * Math.sin(a), y: -s.x * Math.sin(a) + s.y * Math.cos(a) }; });
      }
      newRun();
      updatePlay(); updateReadouts(); emitStorm(); requestDraw();
    });
    el[k].addEventListener('change', function () {
      readSliders(); refreshOutputs(); recompute(); newRun(); updatePlay(); updateReadouts(); emitStorm(true); requestDraw();
      setStatus(T('設定改了：颱風回到起點。按「播放」讓它出發。', 'Settings changed: the typhoon is back at the start. Press “Play”.'));
    });
  });
  document.querySelectorAll('#speedSeg button').forEach(function (b) {
    b.addEventListener('click', function () { state.speed = +b.getAttribute('data-speed'); setSeg('speedSeg', 'data-speed', state.speed); });
  });
  document.querySelectorAll('#chartSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.chart = b.getAttribute('data-chart'); setSeg('chartSeg', 'data-chart', state.chart);
      gr.setAttribute('aria-label', chartAria()); updateReadouts(); requestDraw();
    });
  });
  $('play').addEventListener('click', function () {
    acted();
    if (state.done) newRun();
    state.running = !state.running;
    updatePlay(); windSound();
    if (state.running) setStatus(T('颱風出發：每秒 ', 'The typhoon is moving: ') + state.speed + T(' 小時。', ' hours per second.'));
    requestDraw();
  });
  $('restart').addEventListener('click', function () {
    state.running = false; windSound();
    restart(T('颱風回到起點，兩個測站的紀錄已清除。', 'The typhoon is back at the start and both records are cleared.'));
  });
  $('soundBtn').addEventListener('click', function () {
    const on = !(window.LabSettings && window.LabSettings.get('sound'));
    if (window.LabSettings) window.LabSettings.set('sound', on);
    updateSoundButton(); windSound();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') { updateSoundButton(); windSound(); } });

  // ---------- 拖曳測站 ----------
  let drag = -1, kbSel = -1;
  function evPos(ev) { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function hit(q) {
    const L = mapLay(cvSize.w, cvSize.h);
    let best = -1, bd = 30;
    run.st.forEach(function (s, i) { const d = Math.hypot(L.px(s.x) - q[0], L.py(s.y) - q[1]); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function moveStation(i, x, y) {
    const L = mapLay(cvSize.w, cvSize.h);
    const xm = L.xOf(cvSize.w) - 10e3, ym = L.yOf(0) - 10e3;
    state.st[i] = { x: Math.max(-xm, Math.min(xm, x)), y: Math.max(-ym, Math.min(ym, y)) };
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (view3 && view3.active) return;
    const i = hit(evPos(ev));
    if (i < 0) return;
    acted(); drag = i; cv.setPointerCapture(ev.pointerId); cv.classList.add('grabbing');
    state.running = false; windSound(); updatePlay();
    ev.preventDefault();
  });
  cv.addEventListener('pointermove', function (ev) {
    const q = evPos(ev);
    if (drag < 0) { cv.classList.toggle('grab', hit(q) >= 0); return; }
    const L = mapLay(cvSize.w, cvSize.h);
    moveStation(drag, L.xOf(q[0]), L.yOf(q[1]));
    newRun(); updateReadouts(); requestDraw();
  });
  function endDrag() {
    if (drag < 0) return;
    drag = -1; cv.classList.remove('grabbing');
    restart(T('測站搬好了：颱風回到起點，按「播放」。', 'Station moved: the typhoon is back at the start. Press “Play”.'));
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // ---------- 鍵盤 ----------
  if (window.LabKeys) {
    const item = function (i) {
      return {
        name: function () { return T('測站 ', 'Station ') + (i ? 'B' : 'A'); },
        move: function (dx, dy, big) {
          acted(); kbSel = i;
          const st = big ? 50e3 : 10e3;
          moveStation(i, state.st[i].x + dx * st, state.st[i].y + dy * st);
          state.running = false; windSound(); restart(); return true;
        },
        describe: function () { return T('測站 ', 'Station ') + (i ? 'B' : 'A') + T('，', ', ') + sideText(i); }
      };
    };
    window.LabKeys.attach(cv, {
      label: T('颱風地圖。方向鍵移動測站（Shift 移動 50 km），Enter 切換測站 A、B。', 'Typhoon map. Arrow keys move a station (Shift: 50 km); Enter switches between stations A and B.'),
      items: [item(0), item(1)],
      onChange: function () { requestDraw(); }
    });
    cv.addEventListener('blur', function () { kbSel = -1; requestDraw(); });
  }

  // ---------- 分享：測站位置、圖表 ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { ch: state.chart, s: state.st.map(function (s) { return [Math.round(s.x / 1e3), Math.round(s.y / 1e3)]; }) }; },
    set: function (o) {
      if (!o) return;
      readSliders(); refreshOutputs(); recompute();
      if (Array.isArray(o.s) && o.s.length === 2) state.st = o.s.map(function (p) { return { x: Math.max(-700, Math.min(700, +p[0] || 0)) * 1e3, y: Math.max(-700, Math.min(700, +p[1] || 0)) * 1e3 }; });
      if (['a', 'b', 'prof'].indexOf(o.ch) >= 0) { state.chart = o.ch; setSeg('chartSeg', 'data-chart', o.ch); gr.setAttribute('aria-label', chartAria()); }
      restart();
    }
  });

  // =====================================================================
  // 繪圖迴圈
  // =====================================================================
  let raf = 0, lastFrame = 0, lastRead = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(loop); }
  function loop(tnow) {
    raf = 0;
    const dt = lastFrame ? Math.min(1 / 20, (tnow - lastFrame) / 1000) : 0;
    lastFrame = tnow;
    if (state.running && dt > 0 && !document.hidden) {
      const left = duration() - run.t;
      K.advance(run, Math.min(left, dt * state.speed * 3600), 120, REC);
      if (run.t >= duration() - 1e-6) finish();
      else {
        if (tnow - lastRead > 150) { lastRead = tnow; updateReadouts(); }
        sayNow(); windSound();
      }
    }
    if (view3 && view3.active) view3.frame(tnow); else drawMap(tnow);
    drawChart();
    if (state.running || (view3 && view3.active && view3.busy())) raf = requestAnimationFrame(loop);
    else { lastFrame = 0; updateReadouts(); }
  }

  // =====================================================================
  // 3D 檢視（切換時才載入 three.js 與 typhoon-3d.js）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    K: K, T: T, D: D, state: state, colors: function () { return C; }, reducedMotion: reducedMotion,
    num: num, run: function () { return run; }, sum: function () { return sum; }, windColor: windColor, center: center,
    viewW: VIEW_W, viewH: VIEW_H, clsText: function () { return T(sum.cls.zh, sum.cls.en); }, hours: hoursText,
    request: function () { requestDraw(); },
    onCam: function (kind) { acted(); emit('cam', { preset: kind }); },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 地圖。', 'The 3D graphics context was lost, so the view switched back to the 2D map.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Typhoon3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Typhoon3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/typhoon-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Typhoon3D) throw new Error('typhoon-3d.js did not load');
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
        view3 = window.Typhoon3D.create(lib, host3, bridge);
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
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 地圖。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D map is kept.');
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
  refreshOutputs();
  recompute();
  newRun();
  updatePlay();
  updateSoundButton();
  gr.setAttribute('aria-label', chartAria());
  updateReadouts();
  function themeChanged() {
    readColors();
    updatePlay(); updateSoundButton(); updateReadouts();
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
  setStatus(T('一個中度颱風正往西北西前進。按「播放」，看測站 A、B 的紀錄。', 'A moderate typhoon is heading west-north-west. Press “Play” and watch the records of stations A and B.'));
  requestDraw();
  // 測試用（Playwright）
  window.__ty = { state: state, K: K, run: function () { return run; }, sum: function () { return sum; }, setView: setView,
    fast: function () { K.advance(run, duration() - run.t, 120, REC); finish(); updateReadouts(); requestDraw(); },
    place: function (i, xkm, ykm) { state.st[i] = { x: xkm * 1e3, y: ykm * 1e3 }; restart(); } };
})();
