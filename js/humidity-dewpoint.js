/* humidity-dewpoint.js — 「溼度與露點」的畫面與互動
 * 物理計算全部在 humidity-dewpoint-core.js。 */
(function () {
  'use strict';
  const HM = window.HumCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FONT = D.FONT;

  const PSY_SPEED = 30;          // 乾溼計：畫面快 30 倍
  const CUP_SPEED = 5;           // 杯子：畫面快 5 倍
  const CUP_TMAX = 900;          // 杯子最多看 15 分鐘
  const DAY_RATE = 2;            // 一天：每秒 2 小時
  const SETTLE = 0.05;           // 溼球和平衡溫度差 0.05 °C 以內算穩定
  const BATHS = [
    { id: 'cold', zh: '冰箱的冷水（6 °C）', en: 'Cold water from the fridge (6 °C)' },
    { id: 'ice', zh: '冰塊（冰水 0.5 °C）', en: 'Ice cubes (ice water, 0.5 °C)' },
    { id: 'salt', zh: '冰塊加鹽（−9 °C）', en: 'Ice and salt (−9 °C)' }
  ];
  const WX = [
    { id: 'clear', zh: '晴朗的秋夜', en: 'Clear autumn night', Tmean: 18, range: 12, Td0: 12.5 },
    { id: 'cloudy', zh: '陰天', en: 'Cloudy day', Tmean: 20, range: 3, Td0: 16 },
    { id: 'humid', zh: '悶熱的夏天', en: 'Muggy summer day', Tmean: 29, range: 7, Td0: 25 },
    { id: 'frost', zh: '寒流過後的晴夜', en: 'Clear night after a cold front', Tmean: 3, range: 14, Td0: -4 },
    { id: 'desert', zh: '沙漠', en: 'Desert', Tmean: 25, range: 16, Td0: -5 }
  ];

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = { temp: $('temp'), rh: $('rh'), alt: $('alt'), tmean: $('tmean'), range: $('range'), td0: $('td0'), hour: $('hour') };
  const state = {
    mode: 'psy', T: 25, rh: 0.6, z: 0, type: 'vent', wet: 25,
    cup: null, bath: 'ice', hist: [],
    Tmean: 20, range: 10, Td0: 13, h: 12, wx: '',
    chart: { psy: 'a', cup: 'a', day: 'a' },
    run: { psy: null, cup: null, day: null },
    acted: false, t: 0
  };
  let quiet = 0;
  function setSlider(inp, v) { quiet++; try { if (window.LabNum) window.LabNum.set(inp, v); else inp.value = v; } finally { quiet--; } }

  // ---------- 衍生量 ----------
  function air() {
    const p = HM.pressureAt(state.z), e = HM.eFromRH(state.T, state.rh);
    return { p: p, e: e, Td: HM.dewPoint(e), Tf: HM.frostPoint(e), Tw: HM.wetBulb(state.T, e, p, state.type) };
  }
  function dayE0() { return HM.esw(state.Td0); }
  function dayNow() { return HM.dayState(state.h, state.Tmean, state.range, dayE0()); }
  let statsCache = null;
  function dayStats() {
    const key = state.Tmean + '|' + state.range + '|' + state.Td0;
    if (statsCache && statsCache.key === key) return statsCache;
    const e0 = dayE0(); let minRH = 1e9, maxRH = -1, sat = false, frost = false, satAll = true;
    for (let i = 0; i <= 1200; i++) {
      const s = HM.dayState(i * 0.02, state.Tmean, state.range, e0);
      minRH = Math.min(minRH, s.rh); maxRH = Math.max(maxRH, s.rh);
      if (s.sat) sat = true; else satAll = false;
      if (s.frost) frost = true;
    }
    const dd = HM.dayDew(state.Tmean, state.range, e0);
    statsCache = { key: key, minRH: minRH, maxRH: maxRH, sat: sat, frost: frost, satAll: satAll, Tmin: dd.Tmin, tp: dd.tp, start: dd.start, end: dd.end, frozenDew: state.Td0 > 0 && dd.Tmin < 0 && sat };
    return statsCache;
  }

  // ---------- 文字 ----------
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function degC(v, d) { return num(v, d == null ? 1 : d) + ' °C'; }
  function pct(f) { return num(f * 100, 0) + ' %'; }
  function hhmm(h) { h = ((h % 24) + 24) % 24; let m = Math.round(h * 60); if (m >= 1440) m -= 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function mmss(t) { const s = Math.round(t); return T(Math.floor(s / 60) + ' 分 ' + String(s % 60).padStart(2, '0') + ' 秒', Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0') + ' s'); }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function setStatus(msg) { setHTML('status', msg); }
  function nice(v) { const e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e; return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * e; }
  function typeName(t) { return t === 'vent' ? T('通風', 'ventilated') : T('百葉箱', 'screen'); }

  // =====================================================================
  // 顏色
  // =====================================================================
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--surface',
      '--hd-room0', '--hd-room1', '--hd-wood', '--hd-metal', '--hd-glass', '--hd-hot', '--hd-wet', '--hd-dew', '--hd-frost', '--hd-rh', '--hd-air', '--hd-sat', '--hd-grid', '--hd-mark']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    D.refresh();
  }

  // =====================================================================
  // 畫布
  // =====================================================================
  const stage = $('stage');
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
  function hash(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function tag(g, text, x, y, color, align, font) {
    g.font = font || '700 12px ' + FONT;
    const w = g.measureText(text).width + 14, h = 22;
    let bx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    const cw = g.canvas.clientWidth || 1e4; bx = Math.max(4, Math.min(cw - 4 - w, bx));
    D.roundRect(g, bx, y - h / 2, w, h, 11);
    g.fillStyle = D.dark ? 'rgba(15,23,42,0.88)' : 'rgba(255,255,255,0.92)'; g.fill();
    g.strokeStyle = D.alpha(color, 0.8); g.lineWidth = 1.2; g.stroke();
    g.fillStyle = color; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(text, bx + 7, y + 0.5);
    return { x: bx, w: w };
  }
  function roomBg(g, W, H) {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, C['hd-room0']); bg.addColorStop(1, C['hd-room1']);
    D.roundRect(g, 4, 4, W - 8, H - 8, 10); g.fillStyle = bg; g.fill();
  }

  // ---------- 溫度計 ----------
  const TH_MIN = -12, TH_MAX = 45;
  /** 一支溫度計：x 中心、y0 管頂、y1 球心；讀數 v */
  function thermometer(g, x, y0, y1, v, wet, labelSide) {
    const tw = 12, br = 13, yT = function (t) { return y1 - br - 10 - (t - TH_MIN) / (TH_MAX - TH_MIN) * (y1 - br - 10 - y0 - 8); };
    // 玻璃管
    D.roundRect(g, x - tw / 2, y0, tw, y1 - y0, tw / 2);
    const gg = g.createLinearGradient(x - tw / 2, 0, x + tw / 2, 0);
    gg.addColorStop(0, D.alpha('#ffffff', D.dark ? 0.18 : 0.75)); gg.addColorStop(0.5, D.alpha(C['hd-glass'], 0.55)); gg.addColorStop(1, D.alpha('#94a3b8', 0.35));
    g.fillStyle = gg; g.fill(); g.strokeStyle = D.alpha(C.text, 0.35); g.lineWidth = 1; g.stroke();
    // 液柱
    const yv = yT(Math.max(TH_MIN, Math.min(TH_MAX, v)));
    g.fillStyle = C['hd-hot']; D.roundRect(g, x - 2.5, yv, 5, y1 - yv, 2.5); g.fill();
    // 球
    D.ball(g, x, y1, br, C['hd-hot'], { shadow: false });
    if (wet) {
      // 溼紗布
      g.save();
      D.roundRect(g, x - br - 3, y1 - br - 16, 2 * br + 6, 2 * br + 18, 9);
      const wg = g.createLinearGradient(x - br, 0, x + br, 0);
      wg.addColorStop(0, D.dark ? '#cbd5e1' : '#f8fafc'); wg.addColorStop(0.5, D.dark ? '#e2e8f0' : '#ffffff'); wg.addColorStop(1, D.dark ? '#94a3b8' : '#dbe4ee');
      g.fillStyle = wg; g.globalAlpha = 0.93; g.fill(); g.globalAlpha = 1;
      g.strokeStyle = D.alpha(C['hd-wet'], 0.5); g.lineWidth = 1; g.stroke();
      g.strokeStyle = D.alpha('#94a3b8', 0.45); g.lineWidth = 0.7;
      for (let k = 0; k < 7; k++) { const yy = y1 - br - 12 + k * 5; g.beginPath(); g.moveTo(x - br - 2, yy); g.lineTo(x + br + 2, yy + 2); g.stroke(); }
      g.restore();
    }
    // 刻度
    g.strokeStyle = D.alpha(C.text, 0.55); g.lineWidth = 1;
    for (let t = -10; t <= 45; t++) {
      const y = yT(t), L = t % 5 === 0 ? 8 : 4, s = labelSide < 0 ? -1 : 1;
      g.beginPath(); g.moveTo(x + s * (tw / 2 + 1), y); g.lineTo(x + s * (tw / 2 + 1 + L), y); g.stroke();
      if (t % 10 === 0) D.haloText(g, String(t).replace('-', '−'), x + s * (tw / 2 + 12), y, C.muted, s < 0 ? 'right' : 'left', 'middle', '10px ' + FONT);
    }
    return yT;
  }
  /** 水蒸氣的細絲 */
  function wisps(g, x, y, n, t) {
    g.save(); g.lineCap = 'round';
    for (let k = 0; k < n; k++) {
      const ph = (t * 0.6 + k / n) % 1, x0 = x + (hash(k) - 0.5) * 22, y0 = y - ph * 70;
      g.strokeStyle = D.alpha(C['hd-wet'], 0.35 * (1 - ph)); g.lineWidth = 2;
      g.beginPath();
      for (let s = 0; s <= 10; s++) { const yy = y0 - s * 2.4, xx = x0 + Math.sin(s * 0.7 + ph * 9 + k) * 3; if (s) g.lineTo(xx, yy); else g.moveTo(xx, yy); }
      g.stroke();
    }
    g.restore();
  }

  // =====================================================================
  // 一、乾溼球溫度計
  // =====================================================================
  function drawPsy(g, W, H) {
    roomBg(g, W, H);
    const A = air(), narrow = W < 560, cx = W / 2, gap = narrow ? 56 : 80, y0 = state.type === 'vent' ? 92 : 70, y1 = H - 110;
    const xd = cx - gap, xw = cx + gap;
    if (state.type === 'still') {
      // 百葉箱：白色木箱、斜的百葉
      const bx = cx - gap - 70, bw = 2 * gap + 140, by = 40, bh = H - 80;
      g.save(); D.roundRect(g, bx, by, bw, bh, 8); g.fillStyle = D.dark ? 'rgba(226,232,240,0.07)' : 'rgba(255,255,255,0.55)'; g.fill();
      g.strokeStyle = D.alpha(C.text, 0.25); g.lineWidth = 2; g.stroke();
      g.strokeStyle = D.alpha(C.text, 0.16); g.lineWidth = 3;
      for (let y = by + 14; y < by + bh - 8; y += 14) { g.beginPath(); g.moveTo(bx + 6, y); g.lineTo(bx + 28, y + 8); g.stroke(); g.beginPath(); g.moveTo(bx + bw - 6, y); g.lineTo(bx + bw - 28, y + 8); g.stroke(); }
      g.restore();
      D.haloText(g, T('百葉箱：沒有風扇，空氣慢慢流過', 'Screen: no fan, the air drifts through slowly'), cx, by + bh + 14, C.muted, 'center', 'middle', '600 11px ' + FONT);
    } else {
      // 風扇：從上往下吹過兩個球
      const fy = narrow ? 40 : 44, r = narrow ? 18 : 22;
      g.save(); g.translate(cx, fy);
      D.ball(g, 0, 0, r + 4, C['hd-metal'], { shadow: false });
      const ang = state.t * 18;
      g.fillStyle = D.alpha(D.dark ? '#e2e8f0' : '#334155', 0.75);
      for (let k = 0; k < 4; k++) { g.save(); g.rotate(ang + k * Math.PI / 2); g.beginPath(); g.ellipse(r * 0.5, 0, r * 0.5, r * 0.18, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
      g.restore();
      g.strokeStyle = D.alpha(C['hd-air'], 0.35); g.lineWidth = 1.5; g.setLineDash([6, 8]); g.lineDashOffset = -state.t * 60;
      for (let k = -2; k <= 2; k++) { const x = cx + k * gap * 0.9; g.beginPath(); g.moveTo(x, fy + 30); g.lineTo(x + (k === 0 ? 0 : k * 6), y1 + 30); g.stroke(); }
      g.setLineDash([]);
      D.haloText(g, T('風扇把空氣吹過溼球（每秒約 3 公尺）', 'A fan blows air past the wet bulb (about 3 m/s)'), cx, H - 22, C.muted, 'center', 'middle', '600 11px ' + FONT);
    }
    // 水盒與燈芯
    const wy = y1 + 36;
    g.strokeStyle = D.alpha('#e2e8f0', 0.9); g.lineWidth = 4; g.beginPath(); g.moveTo(xw, y1 + 14); g.quadraticCurveTo(xw + 2, wy - 6, xw, wy + 8); g.stroke();
    D.roundRect(g, xw - 26, wy - 8, 52, 28, 5); g.fillStyle = D.alpha(C['hd-glass'], 0.7); g.fill(); g.strokeStyle = D.alpha(C.text, 0.35); g.lineWidth = 1; g.stroke();
    D.roundRect(g, xw - 24, wy + 2, 48, 16, 4); g.fillStyle = D.alpha(C['hd-wet'], 0.45); g.fill();
    const yT = thermometer(g, xd, y0, y1, state.T, false, -1);
    thermometer(g, xw, y0, y1, state.wet, true, 1);
    const dT = state.T - state.wet;
    if (dT > 0.05) wisps(g, xw, y1 - 20, Math.min(9, 1 + Math.round(dT)), state.t);
    // 讀數
    D.haloText(g, T('乾球', 'Dry bulb'), xd, y0 - 14, C.text, 'center', 'middle', '700 12.5px ' + FONT);
    D.haloText(g, T('溼球', 'Wet bulb'), xw, y0 - 14, C['hd-wet'], 'center', 'middle', '700 12.5px ' + FONT);
    tag(g, degC(state.T), xd - (narrow ? 34 : 44), yT(state.T), C['hd-hot'], 'right');
    tag(g, degC(state.wet), xw + (narrow ? 34 : 44), yT(state.wet), C['hd-wet'], 'left');
    // 溫度差
    const run = state.run.psy;
    const yd = Math.min(yT(state.T), yT(state.wet));
    if (dT > 0.05) {
      g.strokeStyle = D.alpha(C.text, 0.5); g.lineWidth = 1; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(xd + 10, yT(state.T)); g.lineTo(xw - 10, yT(state.T)); g.stroke(); g.setLineDash([]);
      D.arrow(g, cx, yT(state.T), cx, yT(state.wet), C['hd-wet'], 1.6);
    }
    D.haloText(g, T('差 ', 'Δ ') + degC(dT), cx, yd - 14, C.text, 'center', 'middle', '700 12px ' + FONT);
    // 上方標籤與時鐘
    const done = run && run.done;
    tag(g, done ? T('穩定了：相對溼度 ', 'Steady: relative humidity ') + pct(HM.rhPsy(state.T, state.wet, A.p, state.type)) : run ? T('溼球變冷中…', 'Wet bulb cooling…') : T('按「開始量」把紗布弄溼', 'Press “Start reading” to wet the wick'), W - 12, 22, done ? C['hd-rh'] : C.muted, 'right');
    if (run) { if (narrow) D.haloText(g, T('經過 ', 'Elapsed ') + mmss(run.t), W - 14, 46, C.muted, 'right', 'middle', '600 11px ' + FONT); else D.haloText(g, T('經過 ', 'Elapsed ') + mmss(run.t), 14, H - 22, C.muted, 'left', 'middle', '600 11px ' + FONT); }
  }

  // =====================================================================
  // 二、冷杯子
  // =====================================================================
  function drawCup(g, W, H) {
    roomBg(g, W, H);
    const A = air(), c = state.cup, narrow = W < 560;
    const ty = H - 70;
    // 桌子
    const tg = g.createLinearGradient(0, ty, 0, H);
    tg.addColorStop(0, D.shade(C['hd-wood'], 0.1)); tg.addColorStop(1, D.shade(C['hd-wood'], -0.25));
    g.fillStyle = tg; g.fillRect(4, ty, W - 8, H - ty - 4);
    const cw = narrow ? 104 : 128, ch = narrow ? 180 : 210, cx = W / 2, top = ty - ch, ew = cw / 2, eh = 12;
    D.contactShadow(g, cx, ty, cw * 0.62, 0);
    // 杯身
    g.save();
    g.beginPath(); g.moveTo(cx - ew, top); g.lineTo(cx - ew * 0.9, ty - 4); g.ellipse(cx, ty - 4, ew * 0.9, eh * 0.8, 0, Math.PI, 0, true); g.lineTo(cx + ew, top); g.closePath();
    const mg = g.createLinearGradient(cx - ew, 0, cx + ew, 0);
    mg.addColorStop(0, D.shade(C['hd-metal'], -0.25)); mg.addColorStop(0.22, D.shade(C['hd-metal'], 0.45)); mg.addColorStop(0.45, C['hd-metal']); mg.addColorStop(0.8, D.shade(C['hd-metal'], -0.3)); mg.addColorStop(1, D.shade(C['hd-metal'], -0.1));
    g.fillStyle = mg; g.fill();
    g.clip();
    // 水膜／水珠／霜
    if (c && c.M > 0) {
      const m = c.M / HM.CUP_M0, frost = c.T < 0;
      g.fillStyle = frost ? 'rgba(241,245,249,' + Math.min(0.75, 0.15 + 0.25 * Math.sqrt(m)) + ')' : 'rgba(226,240,250,' + Math.min(0.5, 0.12 + 0.16 * Math.sqrt(m)) + ')';
      g.fillRect(cx - ew, top, cw, ch);
      if (m >= 1) {
        const n = Math.min(140, Math.round(18 * Math.sqrt(m))), rr = Math.min(4.5, 1.2 + 0.7 * Math.sqrt(m));
        for (let k = 0; k < n; k++) {
          const x = cx - ew + 4 + hash(k) * (cw - 8), y = top + 10 + hash(k + 300) * (ch - 20), r = rr * (0.5 + hash(k + 600));
          if (frost) {
            g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1;
            for (let a = 0; a < 3; a++) { const th = a * Math.PI / 3 + hash(k + 900); g.beginPath(); g.moveTo(x - Math.cos(th) * r, y - Math.sin(th) * r); g.lineTo(x + Math.cos(th) * r, y + Math.sin(th) * r); g.stroke(); }
          } else {
            const dg = g.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
            dg.addColorStop(0, 'rgba(255,255,255,0.95)'); dg.addColorStop(0.5, 'rgba(203,225,240,0.7)'); dg.addColorStop(1, 'rgba(120,150,180,0.55)');
            g.fillStyle = dg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
          }
        }
      }
    }
    g.restore();
    // 杯口與水面
    g.beginPath(); g.ellipse(cx, top, ew, eh, 0, 0, Math.PI * 2); g.fillStyle = D.shade(C['hd-metal'], -0.35); g.fill();
    g.beginPath(); g.ellipse(cx, top + 4, ew - 5, eh - 3, 0, 0, Math.PI * 2);
    const bath = c ? state.bath : null;
    g.fillStyle = bath === 'salt' ? 'rgba(186,215,240,0.95)' : 'rgba(147,197,253,0.92)'; g.fill();
    if (bath === 'ice' || bath === 'salt') {
      for (let k = 0; k < 4; k++) {
        const x = cx - ew * 0.55 + k * ew * 0.36, y = top + 2 + (k % 2) * 4;
        g.save(); g.translate(x, y); g.rotate((hash(k) - 0.5) * 0.6);
        D.roundRect(g, -9, -6, 18, 12, 3); g.fillStyle = 'rgba(240,249,255,0.92)'; g.fill(); g.strokeStyle = 'rgba(148,163,184,0.8)'; g.lineWidth = 1; g.stroke();
        g.restore();
      }
      if (bath === 'salt') { g.fillStyle = 'rgba(255,255,255,0.95)'; for (let k = 0; k < 24; k++) { g.beginPath(); g.arc(cx - ew * 0.7 + hash(k + 40) * ew * 1.4, top + 4 + (hash(k + 80) - 0.5) * (eh - 2), 1.1, 0, Math.PI * 2); g.fill(); } }
    }
    // 溫度計（插在杯裡）
    const Tc = c ? c.T : state.T;
    g.save(); g.translate(cx + ew * 0.45, top - 6); g.rotate(0.22);
    D.roundRect(g, -4, -80, 8, 150, 4); g.fillStyle = D.alpha('#ffffff', D.dark ? 0.25 : 0.8); g.fill(); g.strokeStyle = D.alpha(C.text, 0.35); g.lineWidth = 1; g.stroke();
    const hL = 18 + (Math.max(-12, Math.min(40, Tc)) + 12) / 52 * 110;
    g.fillStyle = C['hd-hot']; g.fillRect(-1.6, 68 - hL, 3.2, hL);
    g.restore();
    tag(g, T('杯溫 ', 'Cup ') + degC(Tc), cx + ew + 14, top + 30, C['hd-wet'], 'left');
    // 起霧的標籤
    if (c && c.onset) tag(g, (c.onset.kind === 'frost' ? T('結霜了！杯溫 ', 'Frost! Cup at ') : T('起霧了！杯溫 ', 'Misted! Cup at ')) + degC(c.onset.T, 2), cx - ew - 14, top + ch * 0.55, c.onset.kind === 'frost' ? C['hd-frost'] : C['hd-dew'], 'right');
    // 房間
    tag(g, T('室溫 ', 'Room ') + degC(state.T) + T('、相對溼度 ', ', RH ') + pct(state.rh), 12, 22, C['hd-air'], 'left');
    const run = state.run.cup;
    if (c && (run || c.t > 0)) tag(g, T('經過 ', 'Elapsed ') + mmss(c.t), 12, H - 24, C.text, 'left', '600 11px ' + FONT);
    if (!c) tag(g, T('一杯室溫的水。選冷卻的東西，按「開始冷卻」', 'A cup of water at room temperature. Choose a coolant and press “Start cooling”'), cx, H - 24, C.text, 'center', '600 11px ' + FONT);
  }

  // =====================================================================
  // 三、一天的溼度
  // =====================================================================
  function sunAlt(h) { return Math.sin(Math.PI * (h - 6) / 12.6); }   // 日出約 06:00、日落約 18:30
  function drawDay(g, W, H) {
    const s = dayNow(), st = dayStats(), alt = sunAlt(state.h), narrow = W < 560;
    // 天空
    const day = Math.max(0, Math.min(1, (alt + 0.15) / 0.5)), dusk = Math.max(0, 1 - Math.abs(alt) / 0.25);
    const sky = g.createLinearGradient(0, 0, 0, H * 0.7);
    sky.addColorStop(0, D.mix('#0b1533', '#5aa8e6', day)); sky.addColorStop(1, D.mix(D.mix('#1d2b52', '#cfe8fb', day), '#f59e6b', dusk * 0.7));
    D.roundRect(g, 4, 4, W - 8, H - 8, 10); g.fillStyle = sky; g.fill();
    g.save(); D.roundRect(g, 4, 4, W - 8, H - 8, 10); g.clip();
    // 星星
    if (day < 1) for (let i = 0; i < 50; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.6 * (1 - day) * hash(i + 7)) + ')'; g.beginPath(); g.arc(8 + hash(i) * (W - 16), 8 + hash(i + 99) * H * 0.5, 0.5 + hash(i + 3) * 0.9, 0, Math.PI * 2); g.fill(); }
    // 太陽／月亮
    const gy = H * 0.62, ph = (state.h - 6) / 12.6;
    if (alt > -0.2) { const x = 30 + ph * (W - 60), y = gy - Math.max(-0.2, alt) * (gy - 50); D.ball(g, x, y, 15, '#fcd34d', { shadow: false }); g.fillStyle = 'rgba(253,224,71,0.18)'; g.beginPath(); g.arc(x, y, 30, 0, Math.PI * 2); g.fill(); }
    else { const pm = ((state.h + 12) % 24 - 6) / 12.6, x = 30 + pm * (W - 60), y = gy - Math.max(0, -alt) * (gy - 60); D.ball(g, x, y, 11, '#e5e7eb', { shadow: false }); }
    // 遠山與草地
    g.fillStyle = D.mix('#1e293b', '#6b8f71', day); g.beginPath(); g.moveTo(4, gy);
    for (let x = 0; x <= W; x += 20) g.lineTo(x, gy - 18 - 14 * Math.sin(x * 0.013) - 8 * Math.sin(x * 0.041)); g.lineTo(W, gy + 20); g.lineTo(4, gy + 20); g.fill();
    const grd = g.createLinearGradient(0, gy, 0, H);
    grd.addColorStop(0, D.mix('#14321f', '#4d9a4a', day)); grd.addColorStop(1, D.mix('#0b1f13', '#2f6b31', day));
    g.fillStyle = grd; g.fillRect(4, gy, W - 8, H - gy);
    // 霜：草地變白
    const dewAmt = s.dew, frostNow = s.frost;
    if (frostNow) { g.fillStyle = 'rgba(241,245,249,' + Math.min(0.55, 0.15 + dewAmt * 0.35) + ')'; g.fillRect(4, gy, W - 8, H - gy); }
    // 草
    g.lineCap = 'round';
    for (let i = 0; i < 160; i++) {
      const x = 4 + hash(i + 11) * (W - 8), y = gy + 8 + hash(i + 51) * (H - gy - 12), L = 6 + hash(i + 91) * 10;
      g.strokeStyle = D.alpha(frostNow ? D.mix(D.mix('#1f4d2a', '#7cc06b', day), '#e2e8f0', 0.5) : D.mix('#1f4d2a', '#7cc06b', day), 0.8); g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 2, y - L * 0.6, x + 4 * (hash(i) - 0.3), y - L); g.stroke();
    }
    // 霧
    if (s.sat) {
      const fogA = Math.min(0.6, 0.12 + dewAmt * 0.5) * (1 - 0.5 * day);
      const fg = g.createLinearGradient(0, gy - 70, 0, H);
      fg.addColorStop(0, 'rgba(226,232,240,0)'); fg.addColorStop(0.35, 'rgba(226,232,240,' + fogA + ')'); fg.addColorStop(1, 'rgba(226,232,240,' + (fogA * 0.8) + ')');
      g.fillStyle = fg; g.fillRect(4, gy - 70, W - 8, H - gy + 70);
    }
    // 前景的葉子與露珠
    const lx = W - (narrow ? 90 : 140), ly = H - 54;
    g.save(); g.translate(lx, ly); g.rotate(-0.35);
    g.beginPath(); g.ellipse(0, 0, narrow ? 62 : 80, narrow ? 20 : 26, 0, 0, Math.PI * 2);
    const lg = g.createLinearGradient(0, -26, 0, 26); lg.addColorStop(0, D.mix('#2f5d2a', '#6fbf5a', day)); lg.addColorStop(1, D.mix('#183318', '#3c7d34', day));
    g.fillStyle = lg; g.fill(); g.strokeStyle = 'rgba(15,40,15,0.6)'; g.lineWidth = 1; g.stroke();
    g.beginPath(); g.moveTo(-(narrow ? 60 : 78), 0); g.lineTo(narrow ? 60 : 78, 0); g.strokeStyle = 'rgba(200,240,190,0.35)'; g.stroke();
    // 露水：最多 st 的露水決定大小；現在有沒有看 s.dew
    const nd = s.dew > 0 ? Math.min(14, 3 + Math.round(s.dew * 6)) : 0;
    for (let k = 0; k < nd; k++) {
      const x = (hash(k + 5) - 0.5) * (narrow ? 100 : 130), y = (hash(k + 25) - 0.5) * 22 * (1 - Math.abs(x) / 80), r = Math.min(5, 1.6 + s.dew * 2) * (0.6 + hash(k + 45) * 0.6);
      if (frostNow) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(x, y, r * 0.8, 0, Math.PI * 2); g.fill(); }
      else { const dg = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r); dg.addColorStop(0, 'rgba(255,255,255,0.95)'); dg.addColorStop(1, 'rgba(160,200,230,0.55)'); g.fillStyle = dg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    }
    g.restore();
    g.restore();
    // 儀表
    const bx = 12, by = 12, bw = narrow ? 150 : 178, bh = 92;
    D.roundRect(g, bx, by, bw, bh, 10); g.fillStyle = 'rgba(8,15,35,0.72)'; g.fill(); g.strokeStyle = 'rgba(226,232,240,0.35)'; g.lineWidth = 1; g.stroke();
    const plain = function (t, x, y, col, al, font) { g.font = font; g.fillStyle = col; g.textAlign = al; g.textBaseline = 'middle'; g.fillText(t, x, y); };
    plain(hhmm(state.h), bx + 10, by + 18, '#ffffff', 'left', '800 17px ' + FONT);
    const ln = function (k, lab, v, col) { plain(lab, bx + 10, by + 40 + k * 17, '#cbd5e1', 'left', '600 11.5px ' + FONT); plain(v, bx + bw - 10, by + 40 + k * 17, col, 'right', '700 12px ' + FONT); };
    ln(0, T('氣溫', 'Temp'), degC(s.T), '#fca5a5');
    ln(1, T('相對溼度', 'RH'), pct(s.rh), '#86efac');
    ln(2, T('露點', 'Dew point'), degC(s.Td), '#67e8f9');
    if (s.sat) tag(g, s.frost ? T('結霜', 'Frost') : T('結露、起霧', 'Dew and fog'), W - 12, 24, s.frost ? C['hd-frost'] : C['hd-dew'], 'right');
    void st;
  }

  // =====================================================================
  // 下方的圖
  // =====================================================================
  function frame0(W, H) { return { x0: 52, x1: W - 16, y0: 22, y1: H - 36 }; }
  function axisBox(g, Fm) { g.strokeStyle = D.alpha(C.text, 0.45); g.lineWidth = 1; g.strokeRect(Fm.x0, Fm.y0, Fm.x1 - Fm.x0, Fm.y1 - Fm.y0); }
  function axes(g, Fm, x0, x1, y0, y1, xlab, ylab, fx, fy, sxF) {
    const xx = function (v) { return Fm.x0 + (v - x0) / (x1 - x0) * (Fm.x1 - Fm.x0); };
    const yy = function (v) { return Fm.y1 - (v - y0) / (y1 - y0) * (Fm.y1 - Fm.y0); };
    g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1;
    const W = Fm.x1 - Fm.x0, sx = sxF || nice((x1 - x0) / (W > 420 ? 7 : 4)), sy = nice((y1 - y0) / 5);
    const tick = function (st) { const dg = Math.max(0, -Math.floor(Math.log10(st) + 1e-9)); return function (v) { return num(v, dg); }; };
    const tx = fx || tick(sx), ty = fy || tick(sy);
    for (let i = Math.ceil(x0 / sx - 1e-9); i * sx <= x1 + 1e-9 * sx; i++) { const v = i * sx, x = xx(v); g.beginPath(); g.moveTo(x, Fm.y0); g.lineTo(x, Fm.y1); g.stroke(); D.haloText(g, tx(v), x, Fm.y1 + 12, C.muted, 'center', 'middle', '10px ' + FONT); }
    for (let i = Math.ceil(y0 / sy - 1e-9); i * sy <= y1 + 1e-9 * sy; i++) { const v = i * sy, y = yy(v); g.beginPath(); g.moveTo(Fm.x0, y); g.lineTo(Fm.x1, y); g.stroke(); D.haloText(g, ty(v), Fm.x0 - 6, y, C.muted, 'right', 'middle', '10px ' + FONT); }
    D.haloText(g, xlab, (Fm.x0 + Fm.x1) / 2, Fm.y1 + 28, C.muted, 'center', 'middle', '600 10.5px ' + FONT);
    D.haloText(g, ylab, 6, 10, C.muted, 'left', 'middle', '600 10.5px ' + FONT);
    return { xx: xx, yy: yy };
  }
  /** 查表 */
  function chartTable(g, W, H) {
    const A = air(), run = state.run.psy, Tr = Math.round(state.T), dT = state.T - state.wet;
    const rows = []; for (let t = Math.max(-10, Math.min(34, Tr - 3)); rows.length < 7; t++) rows.push(t);
    const dr = Math.round(dT), c0 = Math.max(0, Math.min(dr - 5, 30)), cols = []; for (let k = 0; k < 11; k++) cols.push(c0 + k);
    const tab = HM.table(A.p, state.type, rows, cols);
    const x0 = 8, y0 = 30, cw0 = 58, cw = (W - 16 - cw0) / cols.length, rh = (H - y0 - 8) / (rows.length + 1);
    D.haloText(g, T('相對溼度（%）查表：', 'Relative humidity (%) table: ') + num(A.p, 0) + ' hPa' + T('、', ', ') + typeName(state.type), 8, 12, C.text, 'left', 'middle', '700 11.5px ' + FONT);
    g.font = '600 10.5px ' + FONT;
    const showCol = run && run.done;
    for (let j = -1; j < cols.length; j++) for (let i = -1; i < rows.length; i++) {
      const x = j < 0 ? x0 : x0 + cw0 + j * cw, y = y0 + (i + 1) * rh, w = j < 0 ? cw0 : cw;
      const hiR = i >= 0 && rows[i] === Tr, hiC = j >= 0 && showCol && cols[j] === dr;
      let fill = null;
      if (i < 0 || j < 0) fill = D.alpha(C.text, 0.07);
      if (hiR || hiC) fill = D.alpha(C.accent, 0.12);
      if (hiR && hiC) fill = D.alpha(C['hd-mark'], 0.3);
      if (fill) { g.fillStyle = fill; g.fillRect(x, y, w, rh); }
      g.strokeStyle = D.alpha(C.text, 0.15); g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w, rh);
      let txt = '';
      if (i < 0 && j < 0) txt = T('乾球＼差', 'Dry＼Δ');
      else if (i < 0) txt = String(cols[j]);
      else if (j < 0) txt = String(rows[i]).replace('-', '−') + ' °C';
      else txt = tab[i][j] == null ? '' : String(tab[i][j]);
      g.fillStyle = hiR && hiC ? C['hd-mark'] : (i < 0 || j < 0) ? C.muted : C.text;
      g.font = (hiR && hiC ? '800 ' : i < 0 || j < 0 ? '600 ' : '500 ') + (W < 420 ? 9.5 : 11) + 'px ' + FONT;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x + w / 2, y + rh / 2 + 0.5);
    }
  }
  /** 溼度圖：水氣壓對溫度 */
  function chartSat(g, W, H) {
    const Fm = frame0(W, H), mode = state.mode;
    let tmin, tmax, pts = [];
    if (mode === 'day') { const st = dayStats(); tmin = Math.min(st.Tmin, state.Td0) - 3; tmax = state.Tmean + state.range / 2 + 3; }
    else { const A = air(); tmin = Math.min(A.Td, A.Tf, state.cup && mode === 'cup' ? state.cup.T : 99, mode === 'cup' && state.cup ? HM.BATH[state.bath] : 99) - 3; tmax = state.T + 3; }
    tmin = Math.floor(Math.max(-20, tmin) / 5) * 5; tmax = Math.ceil(Math.min(45, tmax) / 5) * 5;
    const ymax = HM.esw(tmax) * 1.05;
    const ax = axes(g, Fm, tmin, tmax, 0, ymax, T('溫度（°C）', 'Temperature (°C)'), T('水氣壓 e（hPa）', 'Vapour pressure e (hPa)'));
    g.save(); g.beginPath(); g.rect(Fm.x0, Fm.y0, Fm.x1 - Fm.x0, Fm.y1 - Fm.y0); g.clip();
    // 相對溼度的線
    [0.2, 0.4, 0.6, 0.8].forEach(function (f) {
      g.strokeStyle = D.alpha(C['hd-rh'], 0.35); g.lineWidth = 1; g.beginPath();
      for (let t = tmin; t <= tmax + 1e-9; t += 0.25) { const x = ax.xx(t), y = ax.yy(f * HM.esw(t)); if (t > tmin) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
      D.haloText(g, num(f * 100, 0) + '%', ax.xx(tmax) - 4, ax.yy(f * HM.esw(tmax)) + 8, C['hd-rh'], 'right', 'middle', '600 9.5px ' + FONT);
    });
    // 飽和曲線（水、冰）
    g.strokeStyle = C['hd-sat']; g.lineWidth = 2.4; g.beginPath();
    for (let t = tmin; t <= tmax + 1e-9; t += 0.2) { const x = ax.xx(t), y = ax.yy(HM.esw(t)); if (t > tmin) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    if (tmin < 0) { g.strokeStyle = C['hd-frost']; g.lineWidth = 1.8; g.setLineDash([5, 3]); g.beginPath(); for (let t = tmin; t <= 0; t += 0.2) { const x = ax.xx(t), y = ax.yy(HM.esi(t)); if (t > tmin) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); g.setLineDash([]); }
    if (mode === 'day') {
      const e0 = dayE0();
      g.strokeStyle = D.alpha(C['hd-air'], 0.85); g.lineWidth = 2.2; g.beginPath();
      for (let i = 0; i <= 240; i++) { const s = HM.dayState(i * 0.1, state.Tmean, state.range, e0), x = ax.xx(s.T), y = ax.yy(s.e); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
      const s = dayNow(); pts.push([s.T, s.e]);
      D.ball(g, ax.xx(s.T), ax.yy(s.e), 6, C['hd-mark'], { shadow: false, ring: '#ffffff' });
    } else {
      const A = air(), xe = ax.yy(A.e);
      g.strokeStyle = D.alpha(C['hd-dew'], 0.9); g.lineWidth = 1.4; g.setLineDash([5, 4]);
      g.beginPath(); g.moveTo(ax.xx(A.Td), xe); g.lineTo(ax.xx(state.T), xe); g.stroke();
      g.beginPath(); g.moveTo(ax.xx(A.Td), xe); g.lineTo(ax.xx(A.Td), Fm.y1); g.stroke(); g.setLineDash([]);
      D.ball(g, ax.xx(A.Td), xe, 4.5, C['hd-dew'], { shadow: false });
      if (mode === 'psy') {
        // 乾溼計的線：從溼球 (Tw, es(Tw)) 斜向 (T, e)
        g.strokeStyle = C['hd-wet']; g.lineWidth = 2; g.beginPath(); g.moveTo(ax.xx(A.Tw), ax.yy(HM.esw(A.Tw))); g.lineTo(ax.xx(state.T), xe); g.stroke();
        D.ball(g, ax.xx(A.Tw), ax.yy(HM.esw(A.Tw)), 4.5, C['hd-wet'], { shadow: false });
      } else if (state.cup) {
        const Tc = state.cup.T, ec = HM.esSurf(Tc);
        g.strokeStyle = D.alpha(C['hd-wet'], 0.7); g.lineWidth = 1; g.beginPath(); g.moveTo(ax.xx(Tc), Fm.y1); g.lineTo(ax.xx(Tc), ax.yy(ec)); g.stroke();
        D.ball(g, ax.xx(Tc), ax.yy(ec), 6, ec < A.e ? C['hd-mark'] : C['hd-wet'], { shadow: false, ring: '#ffffff' });
      }
      D.ball(g, ax.xx(state.T), xe, 6.5, C['hd-air'], { shadow: false, ring: '#ffffff' });
    }
    g.restore();
    // 標籤
    D.haloText(g, T('飽和（水面）', 'Saturation (water)'), Fm.x0 + 8, Fm.y0 + 10, C['hd-sat'], 'left', 'middle', '700 10.5px ' + FONT);
    if (tmin < 0) D.haloText(g, T('虛線：冰面', 'Dashed: over ice'), Fm.x0 + 8, Fm.y0 + 25, C['hd-frost'], 'left', 'middle', '700 10.5px ' + FONT);
    if (mode !== 'day') {
      const A = air();
      D.haloText(g, T('空氣', 'Air'), ax.xx(state.T) - 8, ax.yy(A.e) - 12, C['hd-air'], 'right', 'middle', '700 10.5px ' + FONT);
      D.haloText(g, T('露點 ', 'Dew point ') + degC(A.Td), ax.xx(A.Td) + 6, ax.yy(A.e) + 13, C['hd-dew'], 'left', 'middle', '700 10.5px ' + FONT);
      if (mode === 'psy') D.haloText(g, T('溼球 ', 'Wet bulb ') + degC(A.Tw), ax.xx(A.Tw) - 6, ax.yy(HM.esw(A.Tw)) - 12, C['hd-wet'], 'right', 'middle', '700 10.5px ' + FONT);
    } else D.haloText(g, T('橘線：一天裡空氣走的路', 'Orange: the air’s path through the day'), Fm.x1 - 6, Fm.y1 - 10, C['hd-air'], 'right', 'middle', '700 10.5px ' + FONT);
    axisBox(g, Fm);
  }
  /** 杯溫隨時間 */
  function chartCup(g, W, H) {
    const Fm = frame0(W, H), A = air(), c = state.cup, hist = state.hist;
    const tEnd = Math.max(120, c ? c.t : 0) / 60, show = !!(c && (c.onset || (state.run.cup && state.run.cup.done)));
    const lo = Math.floor(Math.min(HM.BATH[state.bath], show ? Math.min(A.Td, A.Tf) : 99, state.T) - 2), hi = Math.ceil(state.T + 2);
    const ax = axes(g, Fm, 0, tEnd, lo, hi, T('時間（分鐘）', 'Time (minutes)'), T('杯溫（°C）', 'Cup temperature (°C)'));
    g.save(); g.beginPath(); g.rect(Fm.x0, Fm.y0, Fm.x1 - Fm.x0, Fm.y1 - Fm.y0); g.clip();
    const hl = function (v, col, dash, lab, below, left) {
      g.strokeStyle = col; g.lineWidth = 1.4; g.setLineDash(dash); g.beginPath(); g.moveTo(Fm.x0, ax.yy(v)); g.lineTo(Fm.x1, ax.yy(v)); g.stroke(); g.setLineDash([]);
      D.haloText(g, lab, left ? Fm.x0 + 6 : Fm.x1 - 6, ax.yy(v) + (below ? 10 : -9), col, left ? 'left' : 'right', 'middle', '700 10.5px ' + FONT);
    };
    hl(state.T, D.alpha(C['hd-air'], 0.8), [2, 3], T('室溫', 'Room'), true);
    if (c) hl(HM.BATH[state.bath], D.alpha(C.muted, 0.9), [6, 4], T('冷卻的極限', 'Coolant'), true);
    if (show) { hl(A.Td, C['hd-dew'], [5, 3], T('真正的露點 ', 'True dew point ') + degC(A.Td, 2), A.Td < 0, A.Td < 0); if (A.Td < 0) hl(A.Tf, C['hd-frost'], [3, 3], T('真正的霜點 ', 'True frost point ') + degC(A.Tf, 2), false, true); }
    if (hist.length > 1) { g.strokeStyle = C['hd-wet']; g.lineWidth = 2.4; g.beginPath(); hist.forEach(function (p, k) { const x = ax.xx(p[0] / 60), y = ax.yy(p[1]); if (k) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); }
    if (c && c.onset) {
      const x = ax.xx(c.onset.t / 60), y = ax.yy(c.onset.T);
      D.ball(g, x, y, 6, c.onset.kind === 'frost' ? C['hd-frost'] : C['hd-dew'], { shadow: false, ring: '#ffffff' });
      D.haloText(g, (c.onset.kind === 'frost' ? T('結霜 ', 'Frost ') : T('起霧 ', 'Mist ')) + degC(c.onset.T, 2), x + 9, y + 12, c.onset.kind === 'frost' ? C['hd-frost'] : C['hd-dew'], 'left', 'middle', '700 10.5px ' + FONT);
    }
    g.restore();
    if (!show) D.haloText(g, T('露點在哪裡？看杯子什麼時候起霧', 'Where is the dew point? Watch for the mist'), Fm.x0 + 8, Fm.y0 + 10, C.muted, 'left', 'middle', '600 10.5px ' + FONT);
    axisBox(g, Fm);
  }
  /** 一天的溫度與溼度 */
  function chartDay(g, W, H) {
    const Fm = frame0(W, H); Fm.x1 = W - 44;
    const st = dayStats(), e0 = dayE0(), lo = Math.floor(Math.min(st.Tmin, state.Td0) - 2), hi = Math.ceil(state.Tmean + state.range / 2 + 2);
    const ax = axes(g, Fm, 0, 24, lo, hi, T('時刻（時）', 'Hour of day'), T('溫度（°C）', 'Temperature (°C)'), function (v) { return String(v); }, null, W > 480 ? 3 : 6);
    const yr = function (f) { return Fm.y1 - f * (Fm.y1 - Fm.y0); };
    g.save(); g.beginPath(); g.rect(Fm.x0, Fm.y0, Fm.x1 - Fm.x0, Fm.y1 - Fm.y0); g.clip();
    const S = []; for (let i = 0; i <= 480; i++) S.push(HM.dayState(i * 0.05, state.Tmean, state.range, e0));
    // 結露的時段
    g.fillStyle = D.alpha(C['hd-dew'], 0.12);
    S.forEach(function (s, i) { if (s.sat && i < S.length - 1) { const x = ax.xx(s.h); g.fillRect(x, Fm.y0, ax.xx(S[i + 1].h) - x + 0.5, Fm.y1 - Fm.y0); } });
    const line = function (f, col, w, dash) { g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash || []); g.beginPath(); S.forEach(function (s, i) { const x = ax.xx(s.h), y = f(s); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); g.setLineDash([]); };
    line(function (s) { return yr(s.rh); }, C['hd-rh'], 2, [6, 3]);
    line(function (s) { return ax.yy(s.Td); }, C['hd-dew'], 2.2);
    line(function (s) { return ax.yy(s.T); }, C['hd-hot'], 2.6);
    const xh = ax.xx(state.h); g.strokeStyle = D.alpha(C.text, 0.6); g.lineWidth = 1; g.beginPath(); g.moveTo(xh, Fm.y0); g.lineTo(xh, Fm.y1); g.stroke();
    const s = dayNow(); D.ball(g, xh, ax.yy(s.T), 4.5, C['hd-hot'], { shadow: false }); D.ball(g, xh, ax.yy(s.Td), 4.5, C['hd-dew'], { shadow: false }); D.ball(g, xh, yr(s.rh), 4.5, C['hd-rh'], { shadow: false });
    g.restore();
    for (let k = 0; k <= 4; k++) D.haloText(g, (k * 25) + '%', Fm.x1 + 6, yr(k / 4), C['hd-rh'], 'left', 'middle', '10px ' + FONT);
    D.haloText(g, T('紅：氣溫　藍：露點　綠虛線：相對溼度（右）', 'Red: temperature  Blue: dew point  Green dashed: RH (right)'), Fm.x0 + 6, Fm.y0 + 10, C.text, 'left', 'middle', '600 10px ' + FONT);
    axisBox(g, Fm);
  }

  // =====================================================================
  // 主畫面與下方的圖
  // =====================================================================
  function drawMain() {
    const W = cvSize.w, H = cvSize.h, g = ctx;
    g.clearRect(0, 0, W, H);
    D.backdrop(g, W, H);
    if (state.mode === 'psy') drawPsy(g, W, H);
    else if (state.mode === 'cup') drawCup(g, W, H);
    else drawDay(g, W, H);
  }
  function drawChart() {
    const g = gtx, W = grSize.w, H = grSize.h, c = state.chart[state.mode];
    g.clearRect(0, 0, W, H); D.backdrop(g, W, H);
    if (c === 'b') chartSat(g, W, H);
    else if (state.mode === 'psy') chartTable(g, W, H);
    else if (state.mode === 'cup') chartCup(g, W, H);
    else chartDay(g, W, H);
  }

  // =====================================================================
  // 動畫
  // =====================================================================
  let raf = 0, lastFrame = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(ts) {
    raf = 0;
    const dt = lastFrame ? Math.min(0.1, (ts - lastFrame) / 1000) : 0;
    lastFrame = ts;
    const run = state.run[state.mode];
    if (run && run.playing) { stepRun(dt); state.t += dt; }
    drawMain(); drawChart();
    if (run && run.playing) requestDraw(); else lastFrame = 0;
  }
  function sound() { const Ls = window.LabSound; return Ls && Ls.enabled() ? Ls : null; }
  function startRun() {
    acted();
    const m = state.mode, run = state.run[m];
    if (run && !run.done && !run.playing) { run.playing = true; updateButtons(); requestDraw(); return; }
    if (run && run.playing) return;
    if (m === 'psy') {
      state.wet = state.T;
      state.run.psy = { t: 0, playing: true, done: false };
      setStatus(T('紗布弄溼了：水開始蒸發，溼球慢慢變冷……', 'The wick is wet: water evaporates and the wet bulb slowly cools…'));
    } else if (m === 'cup') {
      if (!state.cup || (run && run.done)) newCup();
      state.run.cup = { playing: true, done: false };
      setStatus(T('杯子慢慢變冷，盯著杯子外面……', 'The cup cools down; keep an eye on the outside of the cup…'));
    } else {
      state.run.day = { h0: state.h, played: 0, playing: true, done: false };
      setStatus(T('播放一天……', 'Playing a day…'));
    }
    const snd = sound(); if (snd) snd.tone({ freq: 660, dur: 0.1, type: 'sine', gain: 0.04 });
    updateButtons(); afterChange(true); requestDraw();
  }
  function newCup() { state.cup = HM.cupInit(state.T); state.hist = [[0, state.T]]; }
  function stepRun(dt) {
    const m = state.mode, run = state.run[m];
    if (m === 'psy') {
      const A = air(), k = HM.PSY[state.type], dts = dt * PSY_SPEED;
      state.wet = HM.relax(state.wet, A.Tw, dts, k.tau); run.t += dts;
      if (Math.abs(state.wet - A.Tw) < SETTLE) { state.wet = A.Tw + Math.sign(state.wet - A.Tw) * Math.min(Math.abs(state.wet - A.Tw), SETTLE * 0.99); finishRun(); }
      updateReadouts();
    } else if (m === 'cup') {
      const A = air(), c = state.cup, had = !!c.onset, bath = HM.BATH[state.bath];
      // 杯溫快到極限時變化很慢：畫面加快 4 倍，免得乾等
      HM.cupStep(c, bath, A.e, dt * CUP_SPEED * (Math.abs(c.T - bath) > 1.5 ? 1 : 4));
      const last = state.hist[state.hist.length - 1];
      if (c.t - last[0] >= 1) state.hist.push([c.t, c.T]);
      if (!had && c.onset) onset();
      const noFog = HM.depositPoint(A.e) < bath - 0.02 && Math.abs(c.T - bath) < 0.3;
      if (c.t >= CUP_TMAX || (c.onset && c.t - c.onset.t >= 60) || noFog) finishRun();
      updateReadouts();
    } else {
      const dh = dt * DAY_RATE;
      run.played = Math.min(24, run.played + dh);
      state.h = (run.h0 + run.played) % 24; if (run.played >= 24) state.h = run.h0;
      setSlider(el.hour, Math.round(state.h * 20) / 20);
      if (run.played >= 24) finishRun();
      updateReadouts(); refreshOutputs();
    }
  }
  function onset() {
    const c = state.cup, A = air(), frost = c.onset.kind === 'frost';
    const truth = frost ? A.Tf : A.Td;
    setStatus((frost ? T('杯子外面結霜了！杯溫 ', 'Frost on the cup! Cup at ') : T('杯子外面起霧了！杯溫 ', 'The cup is misting! Cup at ')) + degC(c.onset.T, 2) + T('。真正的', '. The true ') + (frost ? T('霜點', 'frost point') : T('露點', 'dew point')) + T('是 ', ' is ') + degC(truth, 2) + T('，差 ', ', off by ') + degC(c.onset.T - truth, 2) + T('。', '.'));
    const snd = sound(); if (snd) { snd.tone({ freq: 1046, dur: 0.12, type: 'triangle', gain: 0.05 }); snd.tone({ freq: 1318, dur: 0.16, type: 'triangle', gain: 0.04, delay: 0.1 }); }
    const ev = snapshot(); ev.anim = false; ev.runKind = 'onset';
    emit('run', ev);
  }
  function finishRun() {
    const m = state.mode, run = state.run[m];
    run.playing = false; run.done = true;
    const snd = sound();
    const ev = snapshot(); ev.anim = false;
    if (m === 'psy') {
      const A = air();
      setStatus(T('溼球穩定了：乾球 ', 'The wet bulb is steady: dry ') + degC(state.T) + T('、溼球 ', ', wet ') + degC(state.wet) + T('，差 ', ', difference ') + degC(state.T - state.wet) + T('。查表得到相對溼度 ', '. The table gives a relative humidity of ') + pct(HM.rhPsy(state.T, state.wet, A.p, state.type)) + T('。', '.'));
      if (snd) snd.tone({ freq: 880, dur: 0.18, type: 'triangle', gain: 0.05 });
    } else if (m === 'cup') {
      ev.runKind = 'end';
      if (!state.cup.onset) setStatus(T('杯子冷到 ', 'The cup got down to ') + degC(state.cup.T) + T('，一直沒有起霧：空氣太乾，露點比冷卻的極限還低。換更冷的東西試試。', ' and never misted: the air is too dry, its dew point is below what the coolant can reach. Try something colder.'));
      if (snd) snd.tone({ freq: 523, dur: 0.15, type: 'triangle', gain: 0.04 });
    } else {
      const st = dayStats();
      setStatus(T('一天播完：相對溼度從 ', 'One day: relative humidity from ') + pct(st.minRH) + T(' 到 ', ' to ') + pct(st.maxRH) + T('。', '. ') + (st.sat ? (st.frost ? T('清晨結霜。', 'Frost at dawn.') : T('清晨結露、起霧。', 'Dew and fog at dawn.')) : T('沒有結露。', 'No dew.')));
      if (snd) { snd.tone({ freq: 784, dur: 0.12, type: 'triangle', gain: 0.05 }); snd.tone({ freq: 1175, dur: 0.18, type: 'triangle', gain: 0.04, delay: 0.1 }); }
    }
    updateButtons(); updateReadouts();
    emit('run', ev);
    afterChange(true);
  }
  function pauseRun() { const run = state.run[state.mode]; if (!run || run.done) return; run.playing = !run.playing; updateButtons(); afterChange(true); requestDraw(); }

  // =====================================================================
  // 事件
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function snapshot() {
    const run = state.run[state.mode], base = { mode: state.mode, chart: state.chart[state.mode], anim: !!(run && run.playing) };
    if (state.mode === 'psy') {
      const A = air(), settled = !!(run && run.done);
      return Object.assign(base, {
        T: state.T, rh: state.rh, z: state.z, p: A.p, type: state.type, e: A.e, Td: A.Td, Tw: A.Tw, Tread: state.wet, dT: state.T - state.wet, settled: settled,
        rhRead: HM.rhPsy(state.T, state.wet, A.p, state.type), rhSea: HM.rhPsy(state.T, state.wet, HM.P0, state.type), rhWrong: HM.rhPsy(state.T, state.wet, A.p, 'vent')
      });
    }
    if (state.mode === 'cup') {
      const A = air(), c = state.cup, on = c && c.onset;
      return Object.assign(base, {
        T: state.T, rh: state.rh, e: A.e, Td: A.Td, Tf: A.Tf, bath: c ? state.bath : '', Tcup: c ? c.T : state.T, t: c ? c.t : 0, fog: !!(c && c.M >= HM.CUP_M0),
        kind: on ? on.kind : null, fogAt: on ? on.T : null, err: on ? on.T - (on.kind === 'frost' ? A.Tf : A.Td) : null, runKind: ''
      });
    }
    const s = dayNow(), st = dayStats();
    return Object.assign(base, {
      Tmean: state.Tmean, range: state.range, Td0: state.Td0, h: state.h, T: s.T, rh: s.rh, Td: s.Td, sat: s.sat, frost: s.frost,
      minRH: st.minRH, maxRH: st.maxRH, satAny: st.sat, frostAny: st.frost, satAll: st.satAll, Tmin: st.Tmin, tp: st.tp, frozenDew: st.frozenDew, wx: state.wx
    });
  }
  let lastEmit = 0;
  function afterChange(force) {
    updateReadouts();
    const tNow = performance.now();
    if (force || tNow - lastEmit > 200) { lastEmit = tNow; emit('state', snapshot()); }
    requestDraw();
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function refreshOutputs() {
    setOut(el.temp, num(state.T, 1)); setOut(el.rh, num(state.rh * 100, 1)); setOut(el.alt, num(state.z, 0));
    setOut(el.tmean, num(state.Tmean, 1)); setOut(el.range, num(state.range, 1)); setOut(el.td0, num(state.Td0, 1)); setOut(el.hour, hhmm(state.h));
    const pr = function (sel, attr, v) { document.querySelectorAll(sel).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(v))); }); };
    pr('#modeSeg button', 'data-mode', state.mode);
    pr('#chartSeg button', 'data-chart', state.chart[state.mode]);
    pr('#typeSeg button', 'data-t', state.type);
    pr('#bathSeg button', 'data-b', state.bath);
    pr('#wxSeg button', 'data-w', state.wx);
    $('airPanel').hidden = state.mode === 'day';
    $('psyPanel').hidden = state.mode !== 'psy';
    $('cupPanel').hidden = state.mode !== 'cup';
    $('dayPanel').hidden = state.mode !== 'day';
    const bs = document.querySelectorAll('#chartSeg button');
    const labs = { psy: [T('查表', 'Look-up table'), T('溼度圖', 'Humidity chart')], cup: [T('杯溫', 'Cup temperature'), T('溼度圖', 'Humidity chart')], day: [T('一天的變化', 'Through the day'), T('溼度圖', 'Humidity chart')] }[state.mode];
    bs[0].textContent = labs[0]; bs[1].textContent = labs[1];
    cv.setAttribute('aria-label', { psy: T('乾溼球溫度計', 'Wet and dry bulb thermometer'), cup: T('冷杯子', 'The sweating cup'), day: T('一天的溼度', 'Humidity over a day') }[state.mode]);
  }
  function updateReadouts() {
    const A = air();
    setHTML('airHint', T('水氣壓 ', 'Vapour pressure ') + '<b>' + num(A.e, 2) + ' hPa</b>' + T('、露點 ', ', dew point ') + '<b>' + degC(A.Td) + '</b>' + T('、每立方公尺 ', ', ') + '<b>' + num(HM.absHum(state.T, A.e), 1) + ' g</b>' + T(' 水氣。', ' of water vapour per cubic metre.'));
    if (state.mode === 'psy') {
      const run = state.run.psy, done = run && run.done;
      setHTML('pRH', done ? T('相對溼度 ', 'Relative humidity ') + pct(HM.rhPsy(state.T, state.wet, A.p, state.type)) : run ? T('等溼球穩定…', 'Waiting for the wet bulb…') : T('還沒量', 'Not measured yet'));
      setHTML('pT', degC(state.T)); setHTML('pW', run ? degC(state.wet, 2) : '—'); setHTML('pD', run ? degC(state.T - state.wet, 2) : '—');
      setHTML('pP', num(A.p, 1) + ' hPa'); setHTML('pTd', degC(A.Td)); setHTML('pE', num(A.e, 2) + ' hPa' + T('（', ' (') + num(HM.mixRatio(A.e, A.p), 1) + ' g/kg' + T('）', ')'));
      setHTML('psyHint', state.type === 'vent' ? T('風扇讓空氣一直吹過溼球，係數 A = 6.5 × 10<sup>−4</sup>/K；大約 2–3 分鐘穩定。', 'The fan keeps air flowing past the wet bulb, A = 6.5 × 10<sup>−4</sup>/K; it settles in about 2–3 minutes.')
        : T('百葉箱裡沒有風扇，溼球冷得沒那麼多，係數 A = 8.0 × 10<sup>−4</sup>/K；要 10 分鐘以上才穩定。', 'With no fan in the screen the wet bulb cools less, A = 8.0 × 10<sup>−4</sup>/K; it takes over 10 minutes to settle.'));
    } else if (state.mode === 'cup') {
      const c = state.cup, on = c && c.onset;
      setHTML('cT', T('杯溫 ', 'Cup ') + degC(c ? c.T : state.T, 2));
      setHTML('cTime', c ? mmss(c.t) : '—');
      setHTML('cState', !c || c.M <= 0 ? T('乾的', 'Dry') : c.M < HM.CUP_M0 ? T('開始凝結（還看不出來）', 'Condensing (not visible yet)') : c.T < 0 ? T('結霜', 'Frost') : T('起霧、水珠', 'Mist and droplets'));
      setHTML('cOn', on ? degC(on.T, 2) + T('（', ' (') + (on.kind === 'frost' ? T('霜', 'frost') : T('露', 'dew')) + T('）', ')') : '—');
      const show = !!(on || (state.run.cup && state.run.cup.done));
      setHTML('cTd', show ? degC(A.Td, 2) : T('？（先量量看）', '? (measure it first)'));
      setHTML('cTf', A.Td >= 0 ? T('—（露點在 0 °C 以上，結的是露）', '— (dew point above 0 °C: dew, not frost)') : show ? degC(A.Tf, 2) : '？');
      setHTML('cupHint', T('冷得越快，看到起霧時杯子已經比露點冷了一些；冷卻的東西只比露點低一點點，就能量得很準。', 'The faster the cup cools, the further below the dew point it is when you first see mist; with a coolant just below the dew point you can measure it very accurately.'));
    } else {
      const s = dayNow(), st = dayStats();
      setHTML('dRH', T('相對溼度 ', 'Relative humidity ') + pct(s.rh));
      setHTML('dT', degC(s.T)); setHTML('dTd', degC(s.Td)); setHTML('dE', num(s.e, 2) + ' hPa');
      setHTML('dDew', s.sat ? (s.frost ? T('結霜', 'Frost') : T('露水、霧', 'Dew, fog')) : T('乾的', 'Dry'));
      setHTML('dSum', T('最低 ', 'Min ') + degC(st.Tmin) + T('；', '; ') + (st.satAll ? T('整天都飽和', 'saturated all day') : st.sat ? (st.frost ? T('結霜 ', 'frost ') : T('結露 ', 'dew ')) + hhmm(st.start) + '–' + hhmm(st.end) : T('不會結露', 'no dew')));
      setHTML('dayHint', T('空氣裡的水氣量整天不變（除非結露）：溫度越低，相對溼度越高。最低溫降到露點（0 °C 以下是霜點），草上就有露水或霜。', 'The amount of water vapour stays the same all day (unless dew forms): the colder it is, the higher the relative humidity. If the minimum temperature reaches the dew point (the frost point below 0 °C), dew or frost forms on the grass.'));
    }
    const hint = {
      psy: T('左邊是普通的溫度計（乾球），右邊的球包著溼紗布（溼球），水蒸發吸熱讓它變冷。兩支差越多，空氣越乾。', 'The left thermometer is ordinary (dry bulb); the right one is wrapped in wet cloth (wet bulb), cooled by evaporation. The bigger the difference, the drier the air.'),
      cup: T('金屬杯裝水再冷卻：杯壁比露點冷，空氣裡的水氣就在杯子外面凝結。量起霧時的杯溫，就是露點。', 'Fill a metal cup with water and cool it: once the cup is colder than the dew point, water vapour condenses on the outside. The cup temperature when it mists is the dew point.'),
      day: T('拖動「時刻」或按「播放一天」。看氣溫、露點和相對溼度怎麼變，清晨有沒有露水、霧或霜。', 'Drag “Time of day” or press “Play a day”. Watch the temperature, dew point and relative humidity, and whether dew, fog or frost appears at dawn.')
    }[state.mode];
    setHTML('cvHint', hint);
    const ch = state.chart[state.mode];
    setHTML('chartHint', ch === 'b'
      ? T('粗的藍色曲線是飽和水氣壓：空氣的點（橘）往左水平走，碰到曲線的溫度就是露點。綠線是相對溼度 20–80 %。', 'The thick blue curve is the saturation vapour pressure: move the air’s point (orange) horizontally to the left; where it meets the curve is the dew point. Green lines: relative humidity 20–80 %.')
      : { psy: T('氣象局用的就是這種表：左邊找乾球溫度，上面找兩支溫度計的差，交叉的格子就是相對溼度。量完會標出你的格子；表只列整數度，所以和右邊算出來的讀數可能差幾 %。', 'Weather services use tables like this: find the dry-bulb temperature on the left and the difference on top; the cell where they meet is the relative humidity. Your cell is marked once the reading is steady; the table only lists whole degrees, so it can differ by a few % from the calculated reading.'),
        cup: T('藍線是杯溫。起霧以後才會畫出真正的露點，看你量得準不準。', 'The blue line is the cup temperature. The true dew point is shown only after the cup mists, so you can see how close you got.'),
        day: T('藍色底的時段空氣飽和，有露水或霜。露點整天幾乎不變，相對溼度跟著氣溫反過來變。', 'In the blue-shaded hours the air is saturated and dew or frost forms. The dew point barely changes all day, while the relative humidity moves opposite to the temperature.') }[state.mode]);
  }
  function updateButtons() {
    const run = state.run[state.mode];
    const idle = { psy: T('開始量', 'Start reading'), cup: T('開始冷卻', 'Start cooling'), day: T('播放一天', 'Play a day') }[state.mode];
    const busy = { psy: T('量測中…', 'Reading…'), cup: T('冷卻中…', 'Cooling…'), day: T('播放中…', 'Playing…') }[state.mode];
    $('go').textContent = run && !run.done ? (run.playing ? busy : T('繼續', 'Resume')) : idle;
    $('pause').disabled = !run || run.done || !run.playing;
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  function fillButtons() {
    const bb = $('bathSeg'); bb.innerHTML = '';
    BATHS.forEach(function (b) {
      const x = document.createElement('button');
      x.type = 'button'; x.setAttribute('data-b', b.id); x.textContent = T(b.zh, b.en);
      x.addEventListener('click', function () {
        acted(); state.bath = b.id;
        const run = state.run.cup;
        if (run && run.done) { state.run.cup = null; }
        if (run && !run.done) setStatus(T('換成', 'Switched to ') + T(b.zh, b.en) + T('，繼續冷卻。', '; cooling on.'));
        else setStatus(T(b.zh, b.en) + T('：按「開始冷卻」。', ': press “Start cooling”.'));
        refreshOutputs(); updateButtons(); afterChange(true);
      });
      bb.appendChild(x);
    });
    const wb = $('wxSeg'); wb.innerHTML = '';
    WX.forEach(function (w) {
      const x = document.createElement('button');
      x.type = 'button'; x.setAttribute('data-w', w.id); x.textContent = T(w.zh, w.en);
      x.addEventListener('click', function () {
        acted(); state.Tmean = w.Tmean; state.range = w.range; state.Td0 = w.Td0; state.wx = w.id; state.run.day = null;
        setSlider(el.tmean, w.Tmean); setSlider(el.range, w.range); setSlider(el.td0, w.Td0);
        setStatus(T(w.zh, w.en) + T('：按「播放一天」。', ': press “Play a day”.'));
        refreshOutputs(); updateButtons(); afterChange(true);
      });
      wb.appendChild(x);
    });
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  function airChanged() {
    // 空氣變了：溼球要重新量、杯子換一杯
    if (state.run.psy) state.run.psy = null;
    state.wet = state.T;
    state.cup = null; state.hist = []; state.run.cup = null;
  }
  [el.temp, el.rh].forEach(function (inp) {
    inp.addEventListener('input', function () {
      if (quiet) return;
      acted();
      if (inp === el.temp) state.T = Math.max(-10, Math.min(40, val(el.temp)));
      else state.rh = Math.max(0.05, Math.min(1, val(el.rh) / 100));
      airChanged(); updateButtons(); refreshOutputs(); afterChange();
    });
  });
  el.alt.addEventListener('input', function () { if (quiet) return; acted(); state.z = Math.max(0, Math.min(4000, val(el.alt))); if (state.run.psy) state.run.psy = null; state.wet = state.T; updateButtons(); refreshOutputs(); afterChange(); });
  [el.tmean, el.range, el.td0].forEach(function (inp) {
    inp.addEventListener('input', function () {
      if (quiet) return;
      acted();
      if (inp === el.tmean) state.Tmean = Math.max(-5, Math.min(32, val(el.tmean)));
      if (inp === el.range) state.range = Math.max(2, Math.min(16, val(el.range)));
      if (inp === el.td0) state.Td0 = Math.max(-20, Math.min(28, val(el.td0)));
      state.wx = ''; state.run.day = null; updateButtons(); refreshOutputs(); afterChange();
    });
  });
  el.hour.addEventListener('input', function () { if (quiet) return; acted(); state.h = Math.max(0, Math.min(24, val(el.hour))); if (state.run.day && state.run.day.playing) state.run.day = null; updateButtons(); refreshOutputs(); afterChange(); });
  [el.temp, el.rh, el.alt, el.tmean, el.range, el.td0, el.hour].forEach(function (inp) { inp.addEventListener('change', function () { if (!quiet) afterChange(true); }); });
  document.querySelectorAll('#typeSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); state.type = b.getAttribute('data-t'); if (state.run.psy) state.run.psy = null; state.wet = state.T; refreshOutputs(); updateButtons(); afterChange(true); });
  });
  document.querySelectorAll('#modeSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      const r = state.run[state.mode]; if (r && r.playing) { r.playing = false; }
      state.mode = b.getAttribute('data-mode');
      refreshOutputs(); updateButtons(); afterChange(true);
      setStatus({
        psy: T('按「開始量」，等溼球穩定，再讀兩支溫度計的差。', 'Press “Start reading”, wait for the wet bulb to settle, then read the difference.'),
        cup: T('選一種冷卻的東西，按「開始冷卻」，記下杯子開始起霧時的溫度。', 'Choose a coolant, press “Start cooling” and note the cup temperature when it starts to mist.'),
        day: T('選一種天氣，按「播放一天」。', 'Choose the weather and press “Play a day”.')
      }[state.mode]);
    });
  });
  document.querySelectorAll('#chartSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); state.chart[state.mode] = b.getAttribute('data-chart'); refreshOutputs(); afterChange(true); });
  });
  $('go').addEventListener('click', function () { startRun(); });
  $('pause').addEventListener('click', function () { acted(); pauseRun(); });
  $('clear').addEventListener('click', function () {
    acted();
    state.run = { psy: null, cup: null, day: null };
    state.wet = state.T; state.cup = null; state.hist = [];
    setStatus(T('已清除動畫與紀錄，設定不變。', 'Animations and records cleared; the settings are kept.'));
    updateButtons(); afterChange(true);
  });
  $('soundBtn').addEventListener('click', function () {
    const on = !(window.LabSettings && window.LabSettings.get('sound'));
    if (window.LabSettings) window.LabSettings.set('sound', on);
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  fillButtons();
  setSlider(el.temp, 25); setSlider(el.rh, 60); setSlider(el.alt, 0);
  setSlider(el.tmean, 20); setSlider(el.range, 10); setSlider(el.td0, 13); setSlider(el.hour, 12);
  state.acted = false;
  refreshOutputs(); updateButtons(); updateSoundButton(); updateReadouts();
  function themeChanged() { readColors(); fillButtons(); refreshOutputs(); updateButtons(); updateSoundButton(); updateReadouts(); requestDraw(); }
  const dmq = window.matchMedia('(prefers-color-scheme: dark)');
  if (dmq.addEventListener) dmq.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lh = 0, gw = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lw || cv.clientHeight !== lh || gr.clientWidth !== gw) { lw = cv.clientWidth; lh = cv.clientHeight; gw = gr.clientWidth; if (gw > 0) resizeCv(); }
    }).observe(stage);
  } else window.addEventListener('resize', resizeCv);
  resizeCv();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastFrame = 0; requestDraw(); } });
  setStatus(T('按「開始量」，看包著溼紗布的溫度計怎麼變冷。', 'Press “Start reading” and watch the thermometer in the wet cloth cool down.'));
  requestDraw();
  // 測試用（Playwright）
  window.__hd = {
    state: state, HM: HM, snapshot: snapshot, air: air, dayStats: dayStats,
    set: function (o) {
      acted();
      if (o.mode) state.mode = o.mode;
      if (o.T != null) { state.T = o.T; setSlider(el.temp, o.T); airChanged(); }
      if (o.rh != null) { state.rh = o.rh; setSlider(el.rh, o.rh * 100); airChanged(); }
      if (o.z != null) { state.z = o.z; setSlider(el.alt, o.z); state.run.psy = null; state.wet = state.T; }
      if (o.type) { state.type = o.type; state.run.psy = null; state.wet = state.T; }
      if (o.bath) state.bath = o.bath;
      if (o.Tmean != null) { state.Tmean = o.Tmean; setSlider(el.tmean, o.Tmean); state.wx = ''; }
      if (o.range != null) { state.range = o.range; setSlider(el.range, o.range); state.wx = ''; }
      if (o.Td0 != null) { state.Td0 = o.Td0; setSlider(el.td0, o.Td0); state.wx = ''; }
      if (o.h != null) { state.h = o.h; setSlider(el.hour, o.h); }
      if (o.chart) state.chart[state.mode] = o.chart;
      refreshOutputs(); updateButtons(); afterChange(true);
    },
    finish: function () { if (!state.run[state.mode] || state.run[state.mode].done) startRun(); for (let k = 0; k < 20000 && state.run[state.mode] && state.run[state.mode].playing; k++) stepRun(0.1); requestDraw(); }
  };
})();
