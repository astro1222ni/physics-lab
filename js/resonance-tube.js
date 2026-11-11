/* resonance-tube.js — 「氣柱的共鳴（共鳴管測聲速）」的畫面與互動（物理計算在 resonance-tube-core.js；3D 在 resonance-tube-3d.js） */
(function () {
  'use strict';
  const C = window.ResonanceCore;
  const LD = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  // 介面文字：英文模式用第二個字串（settings.js）
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  // 滑桿讀值：打字輸入的精確值（numinput.js）優先
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------- 固定的設定（頁面「模擬方法」有說明） ----------
  const TAU = 10;            // s：音叉振幅衰減的時間常數
  const AUDIBLE = 0.08;      // 音叉振幅低於起始值的 8% 時，響度計不再讀數
  const DB_LO = -10, DB_HI = 30; // 響度軸的範圍（dB）
  const READ_SIGMA = 0.001;  // m：「含誤差」時讀數的標準差（凹液面、視差）
  const METER_SIGMA = 1.0;   // dB：「含誤差」時響度計的跳動
  const METER_TC = 0.25;     // s：響度計跳動的相關時間
  const VIS_F = 0.8;         // Hz：空氣層與音叉動畫的放慢頻率（畫面用）
  const G_REF = 1 / (1 - C.RHO_W); // 位移振幅的畫面比例：G = G_REF 時填滿管寬
  const NBIN = 1001;         // 掃描曲線每 1 mm 一格（0–100 cm）

  function randMystery() { return Math.round((300 + 600 * Math.random()) * 10) / 10; }

  const state = {
    src: 'fork', forkF: 512, appF: 500, mysteryF: randMystery(),
    Tc: 25, d: 0.03, L: 0.40,
    noisy: false,
    strikeAt: -1e9,          // 最後一次敲音叉的時刻（performance.now()/1000）
    appOn: false,
    jitter: 0,               // 響度計目前的跳動（dB）
    traces: new Map(),       // 條件 → Float32Array(NBIN)：掃描過的響度
    lastBinL: null,
    records: [],
    show: { env: true, parts: true, theory: false },
    graph: 'Ln',
    steps: { prep: false, raised: false, struck: false, repeat: false },
    user: false,             // 使用者是否已經操作過（之前不回報任務事件）
    fx: [],                  // 純裝飾的短暫效果
    lastGuess: null
  };

  // ---------- 目前條件 ----------
  function freq() { return state.src === 'app' ? state.appF : state.src === 'mystery' ? state.mysteryF : state.forkF; }
  function radius() { return state.d / 2; }
  function keyOf(src, f, Tc, d) { return src + '|' + f + '|' + Tc + '|' + d; }
  function curKey() { return keyOf(state.src, freq(), state.Tc, state.d); }
  function nowS() { return performance.now() / 1000; }
  /** 聲源目前的振幅（0–1） */
  function amp() {
    if (state.src === 'app') return state.appOn ? 1 : 0;
    const dt = nowS() - state.strikeAt;
    return dt < 0 ? 0 : Math.exp(-dt / TAU);
  }
  function sounding() { return amp() > AUDIBLE; }
  function levelTrue(L) { return C.levelDb(L, freq(), state.Tc, radius()); }
  function levelShown() { return levelTrue(state.L) + (state.noisy ? state.jitter : 0); }

  // ---------- 數字格式 ----------
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function signed(v, d) { return (v > 0 ? '+' : '') + num(v, d); }
  function cm(Lm, d) { return num(Lm * 100, d == null ? 1 : d) + ' cm'; }
  function fmtF(f) { return Math.abs(f - Math.round(f)) < 1e-9 ? String(Math.round(f)) : num(f, 1); }
  /** 管徑（m）→ cm 字串：到 0.1 cm，打字輸入更細時顯示 0.01 cm */
  function fmtD(d) { const u = Math.round(d * 10000); return num(u / 100, u % 10 ? 2 : 1); }
  function fLabel(src, f) { return src === 'mystery' ? '?' : fmtF(f); }
  function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  // ---------- 色彩（lab.css 代號；drawkit 先更新） ----------
  const col = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--b-wave'].forEach(function (k) { col[k.slice(2)] = cs.getPropertyValue(k).trim() || '#0e7490'; });
    Object.assign(col, LD.c);
    col.dark = LD.dark;
    col.water = LD.mix(LD.c.neg, col['b-wave'], 0.35);
    col.metal = LD.mix(LD.c.muted, LD.c['canvas-bg'], 0.25);
    col.hose = LD.shade(LD.c.equi, LD.dark ? -0.2 : -0.1);
  }

  // =====================================================================
  // 主畫布：裝置（左）＋響度計與掃描曲線（右，與管子共用縱向比例）
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const tankEl = $('tank');
  let dpr = 1, cw = 320, ch = 560, g = null;

  function geom() {
    const w = cw, narrow = w < 560;
    const top = narrow ? 104 : 108;
    const tubeH = narrow ? Math.round(Math.max(340, Math.min(440, w * 1.18))) : 450;
    const tubeW = narrow ? 40 : 58;
    const tubeX = narrow ? 40 : Math.round(Math.max(96, w * 0.11));
    const rodX = tubeX + tubeW + (narrow ? 16 : 26);
    const tankW = narrow ? 34 : 48;
    const tankX = rodX + (narrow ? 12 : 18);
    const tankH = narrow ? 62 : 76;
    const thermoX = narrow ? null : tankX + tankW + 42;
    const gx0 = narrow ? tankX + tankW + 18 : Math.max(tankX + tankW + 104, Math.round(w * 0.46));
    const gx1 = w - (narrow ? 8 : 30);
    const bottom = top + tubeH;
    return {
      narrow: narrow, top: top, tubeH: tubeH, bottom: bottom, H: bottom + 78,
      tubeW: tubeW, tubeX: tubeX, cx: tubeX + tubeW / 2, rodX: rodX, tankW: tankW, tankX: tankX, tankH: tankH,
      thermoX: thermoX, gx0: gx0, gx1: gx1, kpx: tubeH / C.TUBE_LEN, baseY: bottom + 46
    };
  }
  function yOf(L) { return g.top + L * g.kpx; }
  function xDb(db) { return g.gx0 + (Math.max(DB_LO, Math.min(DB_HI, db)) - DB_LO) / (DB_HI - DB_LO) * (g.gx1 - g.gx0); }
  function tankTop() { return yOf(state.L) - g.tankH * 0.3; }

  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cw = w;
    g = geom();
    ch = g.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    theoryCache.key = '';
    draw();
  }

  // ---------- 理論曲線（每 1 mm 一點，條件改變才重算） ----------
  const theoryCache = { key: '', db: null };
  function theory() {
    const k = curKey();
    if (theoryCache.key !== k) {
      const a = new Float32Array(NBIN);
      for (let i = 0; i < NBIN; i++) a[i] = levelTrue(i / 1000);
      theoryCache.key = k; theoryCache.db = a;
    }
    return theoryCache.db;
  }
  function trace() {
    const k = curKey();
    let a = state.traces.get(k);
    if (!a) { a = new Float32Array(NBIN).fill(NaN); state.traces.set(k, a); }
    return a;
  }
  /** 聲音在響時，把水面經過的每 1 mm 記進掃描曲線 */
  function sampleTrace() {
    if (!sounding()) { state.lastBinL = null; return; }
    const a = trace();
    const i1 = Math.round(state.L * 1000);
    const i0 = state.lastBinL == null ? i1 : state.lastBinL;
    const lo = Math.max(0, Math.min(i0, i1)), hi = Math.min(NBIN - 1, Math.max(i0, i1));
    for (let i = lo; i <= hi; i++) {
      a[i] = i === i1 ? levelShown() : levelTrue(i / 1000) + (state.noisy ? METER_SIGMA * gauss() : 0);
    }
    state.lastBinL = i1;
  }

  // ---------- 繪圖：零件 ----------
  function drawStand() {
    const c = ctx, x0 = g.tubeX - 22, x1 = g.tankX + g.tankW + (g.narrow ? 10 : 18);
    // 底座
    LD.contactShadow(c, (x0 + x1) / 2, g.baseY + 11, (x1 - x0) / 2, 0);
    LD.block(c, x0, g.baseY, x1 - x0, 10, col.metal, { r: 4 });
    // 支架桿（管狀）
    LD.tube(c, function (p) { p.moveTo(g.rodX, g.baseY + 1); p.lineTo(g.rodX, g.top - 4); }, col.metal, g.narrow ? 5 : 6);
    // 固定玻璃管的兩個夾子
    [g.top + 26, g.bottom - 34].forEach(function (y) {
      LD.block(c, g.tubeX + g.tubeW - 3, y - 3, g.rodX - g.tubeX - g.tubeW + 6, 6, col.metal, { r: 2, shadow: false });
      LD.block(c, g.rodX - 5, y - 6, 10, 12, LD.shade(col.metal, -0.1), { r: 2, shadow: false });
    });
  }

  function drawRuler() {
    const c = ctx, x1 = g.tubeX - 2, x0 = x1 - (g.narrow ? 9 : 12);
    // 尺身
    const gr = c.createLinearGradient(x0, 0, x1, 0);
    gr.addColorStop(0, LD.alpha(LD.mix(LD.c.equi, LD.c['canvas-bg'], 0.82), 0.95));
    gr.addColorStop(1, LD.alpha(LD.mix(LD.c.equi, LD.c['canvas-bg'], 0.7), 0.95));
    LD.roundRect(c, x0, g.top - 2, x1 - x0, g.tubeH + 4, 2);
    c.fillStyle = gr; c.fill();
    c.strokeStyle = LD.alpha(LD.c.text, 0.18); c.lineWidth = 1; c.stroke();
    // 刻度：每 1 cm 短、5 cm 中、10 cm 長並標數字
    c.beginPath();
    for (let i = 0; i <= 100; i++) {
      const y = Math.round(yOf(i / 100) * dpr) / dpr + 0.5 / dpr;
      const len = i % 10 === 0 ? (x1 - x0) : i % 5 === 0 ? (x1 - x0) * 0.65 : (x1 - x0) * 0.38;
      c.moveTo(x1, y); c.lineTo(x1 - len, y);
    }
    c.strokeStyle = LD.alpha(LD.c.text, 0.7); c.lineWidth = 1 / dpr * 1.2; c.stroke();
    c.font = '11px ' + LD.FONT;
    c.textAlign = 'right'; c.textBaseline = 'middle';
    c.fillStyle = LD.c.muted;
    for (let i = 0; i <= 100; i += 10) c.fillText(String(i), x0 - 3, yOf(i / 100));
    LD.haloText(c, 'cm', x0 - 3, g.bottom + 15, LD.c.muted, 'right', 'middle', '600 11px ' + LD.FONT);
  }

  /** 玻璃管（管壁、反光）與管內的水 */
  function drawTube() {
    const c = ctx, x = g.tubeX, w = g.tubeW, yT = g.top, yB = g.bottom, yW = yOf(state.L);
    // 管內空氣（極淡的玻璃色）
    const air = c.createLinearGradient(x, 0, x + w, 0);
    air.addColorStop(0, LD.alpha(LD.c.text, col.dark ? 0.1 : 0.07));
    air.addColorStop(0.22, LD.alpha(LD.c.text, 0.015));
    air.addColorStop(0.7, LD.alpha(LD.c.text, 0.02));
    air.addColorStop(1, LD.alpha(LD.c.text, col.dark ? 0.12 : 0.09));
    c.fillStyle = air;
    c.fillRect(x, yT, w, yB - yT);
    // 水柱（圓柱明暗）＋凹液面
    const men = Math.min(3.2, w * 0.08);
    const wg = c.createLinearGradient(x, 0, x + w, 0);
    wg.addColorStop(0, LD.alpha(LD.shade(col.water, -0.25), 0.85));
    wg.addColorStop(0.3, LD.alpha(LD.shade(col.water, 0.15), 0.6));
    wg.addColorStop(0.75, LD.alpha(col.water, 0.62));
    wg.addColorStop(1, LD.alpha(LD.shade(col.water, -0.3), 0.85));
    c.beginPath();
    c.moveTo(x, yW - men);
    c.quadraticCurveTo(x + w / 2, yW + men * 0.9, x + w, yW - men);
    c.lineTo(x + w, yB); c.lineTo(x, yB); c.closePath();
    c.fillStyle = wg; c.fill();
    // 水面的亮線
    c.beginPath();
    c.moveTo(x + 1, yW - men);
    c.quadraticCurveTo(x + w / 2, yW + men * 0.9, x + w - 1, yW - men);
    c.strokeStyle = LD.alpha(LD.shade(col.water, 0.6), 0.9); c.lineWidth = 1.4; c.stroke();
    // 管壁
    [x, x + w].forEach(function (xx, i) {
      c.beginPath(); c.moveTo(xx, yT); c.lineTo(xx, yB);
      c.strokeStyle = LD.alpha(LD.c.text, col.dark ? 0.5 : 0.42); c.lineWidth = 2; c.stroke();
      c.beginPath(); c.moveTo(xx + (i ? -2 : 2), yT + 2); c.lineTo(xx + (i ? -2 : 2), yB - 2);
      c.strokeStyle = LD.alpha('#ffffff', col.dark ? 0.14 : 0.55); c.lineWidth = 1; c.stroke();
    });
    // 玻璃的長條反光
    const hx = x + w * 0.2;
    const hl = c.createLinearGradient(hx - 3, 0, hx + 3, 0);
    hl.addColorStop(0, 'rgba(255,255,255,0)'); hl.addColorStop(0.5, LD.alpha('#ffffff', col.dark ? 0.12 : 0.5)); hl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = hl; c.fillRect(hx - 3, yT + 4, 6, yB - yT - 8);
    // 管口的唇緣
    LD.roundRect(c, x - 2.5, yT - 2.5, w + 5, 4, 2);
    c.fillStyle = LD.alpha(LD.c.text, col.dark ? 0.35 : 0.28); c.fill();
    // 管底的塞子與出水口
    LD.block(c, x - 1, yB - 2, w + 2, 9, LD.shade(LD.c.text, col.dark ? -0.3 : 0.25), { r: 3, shadow: false });
  }

  /** 蓄水桶（隨水面上下）、夾子與橡皮管 */
  function drawTank() {
    const c = ctx, x = g.tankX, w = g.tankW, h = g.tankH, yT = tankTop(), yB = yT + h, yW = yOf(state.L);
    const cxT = x + w / 2;
    // 橡皮管：管底 → 下方 → 蓄水桶底部
    const y0 = g.bottom + 6, yLow = Math.max(g.bottom, yB) + (g.narrow ? 26 : 30);
    LD.tube(c, function (p) {
      p.moveTo(g.cx, y0);
      p.bezierCurveTo(g.cx, yLow + 6, cxT, yLow + 6, cxT, yB + 4);
    }, col.hose, g.narrow ? 6 : 7);
    // 夾子
    LD.block(c, g.rodX - 5, yT + 8, 10, 13, LD.shade(col.metal, -0.1), { r: 2, shadow: false });
    LD.block(c, g.rodX, yT + 11, x - g.rodX + 3, 6, col.metal, { r: 2, shadow: false });
    // 桶身：玻璃
    c.save();
    c.shadowColor = col.dark ? 'rgba(0,0,0,0.45)' : LD.alpha(LD.c.text, 0.18);
    c.shadowBlur = 8; c.shadowOffsetY = 2;
    LD.roundRect(c, x, yT, w, h, 6);
    c.fillStyle = LD.alpha(LD.c['canvas-bg'], 0.65); c.fill();
    c.restore();
    c.save();
    LD.roundRect(c, x, yT, w, h, 6); c.clip();
    const wg = c.createLinearGradient(x, 0, x + w, 0);
    wg.addColorStop(0, LD.alpha(LD.shade(col.water, -0.25), 0.85));
    wg.addColorStop(0.35, LD.alpha(LD.shade(col.water, 0.15), 0.62));
    wg.addColorStop(1, LD.alpha(LD.shade(col.water, -0.3), 0.85));
    c.fillStyle = wg;
    c.beginPath();
    c.moveTo(x, yW - 2); c.quadraticCurveTo(cxT, yW + 2, x + w, yW - 2); c.lineTo(x + w, yB); c.lineTo(x, yB); c.closePath(); c.fill();
    c.strokeStyle = LD.alpha(LD.shade(col.water, 0.6), 0.9); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x, yW - 2); c.quadraticCurveTo(cxT, yW + 2, x + w, yW - 2); c.stroke();
    const hl = c.createLinearGradient(x + w * 0.18, 0, x + w * 0.32, 0);
    hl.addColorStop(0, 'rgba(255,255,255,0)'); hl.addColorStop(0.5, LD.alpha('#ffffff', col.dark ? 0.14 : 0.55)); hl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = hl; c.fillRect(x + w * 0.18, yT + 4, w * 0.14, h - 8);
    c.restore();
    LD.roundRect(c, x + 0.5, yT + 0.5, w - 1, h - 1, 6);
    c.strokeStyle = LD.alpha(LD.c.text, hoverTank || dragTank ? 0.75 : 0.42); c.lineWidth = hoverTank || dragTank ? 2 : 1.4; c.stroke();
    if (hoverTank || dragTank) {
      LD.roundRect(c, x - 3, yT - 3, w + 6, h + 6, 8);
      c.strokeStyle = LD.alpha(LD.c.accent, 0.4); c.lineWidth = 3; c.stroke();
    }
    // 開口唇緣
    LD.roundRect(c, x - 2, yT - 2, w + 4, 4, 2);
    c.fillStyle = LD.alpha(LD.c.text, 0.3); c.fill();
    // 拖曳提示：上下箭頭
    const ay = yT + h * 0.62;
    c.fillStyle = LD.alpha(LD.c.surface, col.dark ? 0.75 : 0.9);
    c.strokeStyle = LD.alpha(LD.c.text, 0.5); c.lineWidth = 1;
    [[-1, ay - 9], [1, ay + 9]].forEach(function (q) {
      c.beginPath();
      c.moveTo(cxT, q[1] + q[0] * 5); c.lineTo(cxT - 5, q[1] - q[0] * 1); c.lineTo(cxT + 5, q[1] - q[0] * 1); c.closePath();
      c.fill(); c.stroke();
    });
  }

  function drawThermometer() {
    if (g.thermoX == null) return;
    const c = ctx, x = g.thermoX, y0 = g.top + 20, y1 = g.top + 170, r = 7;
    const frac = function (t) { return (t + 5) / 50; }; // 刻度 −5 ~ 45 °C
    const yAt = function (t) { return y1 - 10 - frac(t) * (y1 - 10 - y0 - 6); };
    // 玻璃管
    LD.roundRect(c, x - 5, y0 - 4, 10, y1 - y0 + 4, 5);
    c.fillStyle = LD.alpha(LD.c['canvas-bg'], 0.9); c.fill();
    c.strokeStyle = LD.alpha(LD.c.text, 0.4); c.lineWidth = 1.2; c.stroke();
    // 液柱與玻璃泡
    const red = LD.c.pos;
    c.fillStyle = red;
    const yl = yAt(state.Tc);
    c.fillRect(x - 1.6, yl, 3.2, y1 - yl);
    LD.ball(c, x, y1 + 3, r, red, { glow: 0 });
    // 刻度
    c.beginPath();
    for (let t = 0; t <= 40; t += 5) { const y = Math.round(yAt(t)) + 0.5; c.moveTo(x + 5, y); c.lineTo(x + (t % 10 ? 8 : 11), y); }
    c.strokeStyle = LD.alpha(LD.c.text, 0.55); c.lineWidth = 1; c.stroke();
    c.font = '10px ' + LD.FONT; c.fillStyle = LD.c.muted; c.textAlign = 'left'; c.textBaseline = 'middle';
    for (let t = 0; t <= 40; t += 10) c.fillText(String(t), x + 13, yAt(t));
    LD.pill(c, num(state.Tc, 1) + ' °C', x, y0 - 8, red, 'center', '600 12px ' + LD.FONT);
  }

  /** 位移振幅的包絡、波節、波腹與空氣層 */
  function drawWave(tVis) {
    const a = amp();
    if (a <= 0.004) return;
    const c = ctx, f = freq(), Tc = state.Tc, r = radius(), L = state.L;
    const k = 2 * Math.PI * f / C.speedOfSound(Tc);
    const e = C.endCorrection(r);
    const G = C.gain(L, f, Tc, r);
    const s = Math.min(1, G / G_REF) * Math.min(1, a / 0.6);
    const half = g.tubeW / 2 - 3, x = g.cx, yW = yOf(L), yM = g.top;
    if (state.show.env && s > 0.003) {
      // 管內：填色＋外框（寬度 ∝ 振幅）
      const N = Math.max(40, Math.round((yW - yM) / 2));
      const pts = [];
      for (let i = 0; i <= N; i++) { const y = yW - (yW - yM) * i / N; const hgt = (yW - y) / g.kpx; pts.push([y, half * s * Math.abs(Math.sin(k * hgt))]); }
      c.save();
      c.beginPath();
      pts.forEach(function (p, i) { if (i) c.lineTo(x + p[1], p[0]); else c.moveTo(x + p[1], p[0]); });
      for (let i = pts.length - 1; i >= 0; i--) c.lineTo(x - pts[i][1], pts[i][0]);
      c.closePath();
      const fg = c.createLinearGradient(x - half, 0, x + half, 0);
      fg.addColorStop(0, LD.alpha(col['b-wave'], 0.1)); fg.addColorStop(0.5, LD.alpha(col['b-wave'], col.dark ? 0.32 : 0.26)); fg.addColorStop(1, LD.alpha(col['b-wave'], 0.1));
      c.fillStyle = fg; c.fill();
      c.lineJoin = 'round';
      c.strokeStyle = LD.alpha(col['b-wave'], 0.95); c.lineWidth = 1.6;
      [1, -1].forEach(function (sg) { c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(x + sg * p[1], p[0]); else c.moveTo(x + sg * p[1], p[0]); }); c.stroke(); });
      // 管口外（管口修正 e 那一段）：虛線
      const yA = yM - e * g.kpx;
      c.setLineDash([3, 3]);
      [1, -1].forEach(function (sg) {
        c.beginPath();
        for (let i = 0; i <= 8; i++) { const y = yM - (yM - yA) * i / 8; const hgt = (yW - y) / g.kpx; const xx = x + sg * half * s * Math.abs(Math.sin(k * hgt)); if (i) c.lineTo(xx, y); else c.moveTo(xx, y); }
        c.stroke();
      });
      c.setLineDash([]);
      c.restore();
      // 波節（菱形）與波腹（圓點）：畫在管子右側
      const q = C.nodesAndAntinodes(L, f, Tc, r);
      const mx = g.tubeX + g.tubeW + 7;
      const vis = Math.max(0.35, Math.min(1, s * 3));
      q.nodes.forEach(function (Ln) {
        const y = yOf(Ln);
        c.save(); c.translate(mx, y); c.rotate(Math.PI / 4);
        c.fillStyle = LD.alpha(LD.c.accent, vis); c.fillRect(-3.2, -3.2, 6.4, 6.4);
        c.strokeStyle = LD.alpha(LD.c['canvas-bg'], 0.9); c.lineWidth = 1; c.strokeRect(-3.2, -3.2, 6.4, 6.4);
        c.restore();
      });
      q.antinodes.forEach(function (La) {
        const y = yOf(La);
        c.globalAlpha = vis;
        LD.ball(c, mx, y, 3.6, LD.c.equi, { glow: 0, shadow: false });
        c.globalAlpha = 1;
      });
    }
    // 空氣層（慢動作）：每層的靜止位置在水面以上 j·Δ，位移 u = U sin(k y) cos(ωt)
    if (state.show.parts) {
      const dPx = g.narrow ? 4.6 : 5.2, Dm = dPx / g.kpx;
      const U = 0.95 * dPx * s;
      const ph = reducedMotion ? 1 : Math.cos(2 * Math.PI * VIS_F * tVis);
      const cols = [-0.3, 0, 0.3];
      c.fillStyle = LD.alpha(LD.c.text, col.dark ? 0.55 : 0.5);
      for (let j = 1; ; j++) {
        const y0 = yW - j * dPx;
        if (y0 < yM + 2) break;
        const u = U * Math.sin(k * j * Dm) * ph;
        const y = y0 - u;
        if (y > yW - 2.5 || y < yM + 1) continue;
        for (let q = 0; q < cols.length; q++) {
          c.beginPath(); c.arc(x + cols[q] * g.tubeW + (j % 2 ? 2 : -2), y, 1.25, 0, Math.PI * 2); c.fill();
        }
      }
    }
  }

  /** 已記錄的橡皮筋（目前條件） */
  function drawBands() {
    const c = ctx, key = curKey();
    state.records.forEach(function (rc) {
      if (rc.key !== key) return;
      const y = yOf(rc.Lread);
      const x0 = g.tubeX - 2, x1 = g.tubeX + g.tubeW + 2;
      c.save();
      const bg = c.createLinearGradient(0, y - 2, 0, y + 2.5);
      bg.addColorStop(0, LD.shade(LD.c.pos, 0.3)); bg.addColorStop(0.5, LD.c.pos); bg.addColorStop(1, LD.shade(LD.c.pos, -0.35));
      c.fillStyle = bg;
      c.beginPath();
      c.moveTo(x0, y - 1.6); c.quadraticCurveTo((x0 + x1) / 2, y + 1.3, x1, y - 1.6);
      c.lineTo(x1, y + 1.6); c.quadraticCurveTo((x0 + x1) / 2, y + 4.4, x0, y + 1.6); c.closePath(); c.fill();
      c.restore();
    });
  }

  /** 音叉（側視：兩支叉臂水平、上下排列，在管口上方 1–2 cm，振動方向與管子平行）或手機 */
  function drawSource(tVis) {
    const c = ctx, a = amp(), mouth = g.top, x = g.cx;
    const label = (state.src === 'mystery' ? '?' : fmtF(freq())) + ' Hz';
    if (state.src === 'app') {
      const pw = g.narrow ? 24 : 28, ph = g.narrow ? 46 : 52, px = x - pw / 2, py = mouth - 12 - ph;
      LD.block(c, px, py, pw, ph, LD.mix(LD.c.text, LD.c['canvas-bg'], col.dark ? 0.55 : 0.15), { r: 5 });
      LD.roundRect(c, px + 3, py + 5, pw - 6, ph - 14, 2);
      c.fillStyle = col.dark ? '#0b1e24' : '#12333a'; c.fill();
      // 螢幕上的正弦波
      c.strokeStyle = state.appOn ? col['b-wave'] : LD.alpha(col['b-wave'], 0.35); c.lineWidth = 1.2;
      c.beginPath();
      for (let i = 0; i <= 20; i++) { const xx = px + 4 + (pw - 8) * i / 20; const yy = py + 5 + (ph - 14) / 2 + Math.sin(i / 20 * Math.PI * 4 + (reducedMotion ? 0 : tVis * 6)) * (state.appOn ? 5 : 1.5); if (i) c.lineTo(xx, yy); else c.moveTo(xx, yy); }
      c.stroke();
      // 喇叭孔（朝下對著管口）
      c.fillStyle = LD.alpha(LD.c['canvas-bg'], 0.7);
      for (let i = -2; i <= 2; i++) { c.beginPath(); c.arc(x + i * 3, py + ph - 4, 0.9, 0, Math.PI * 2); c.fill(); }
      if (state.appOn && !reducedMotion) {
        for (let i = 0; i < 3; i++) {
          const u = (tVis * 0.9 + i / 3) % 1;
          c.strokeStyle = LD.alpha(col['b-wave'], 0.5 * (1 - u)); c.lineWidth = 1.2;
          c.beginPath(); c.arc(x, py + ph - 2, 4 + u * 10, Math.PI * 0.2, Math.PI * 0.8); c.stroke();
        }
      }
      LD.pill(c, label, px + pw + 6, py + 18, col['b-wave'], 'left', '600 12px ' + LD.FONT);
      return;
    }
    const tipX = x + g.tubeW * 0.42, bendX = x - (g.narrow ? 22 : 30), gap = g.narrow ? 9 : 10, th = g.narrow ? 4 : 4.6;
    const yLo = mouth - (g.narrow ? 9 : 10), yHi = yLo - gap, yMid = (yLo + yHi) / 2;
    const steel = LD.mix(LD.c.muted, '#ffffff', col.dark ? 0.15 : 0.35);
    // 握柄（往左延伸）
    const hx1 = bendX - gap / 2 - 2, hx0 = Math.max(4, hx1 - (g.narrow ? 30 : 46));
    LD.block(c, hx0, yMid - 3.2, hx1 - hx0 + 3, 6.4, steel, { r: 3 });
    // 叉臂振動：越靠近尖端位移越大（懸臂樑的形狀）；快速振動以模糊殘影表示
    const ring = a > 0.004;
    const dmax = (g.narrow ? 1.8 : 2.2) * Math.min(1, a / 0.5);
    const ph = reducedMotion ? 0 : Math.cos(2 * Math.PI * VIS_F * 3 * tVis);
    function tine(yBase, sg, d, alphaV) {
      c.save();
      c.globalAlpha = alphaV;
      c.beginPath();
      const N = 10;
      for (let i = 0; i <= N; i++) { const u = i / N; const xx = bendX + (tipX - bendX) * u; const yy = yBase + sg * d * u * u - th / 2; if (i) c.lineTo(xx, yy); else c.moveTo(xx, yy); }
      for (let i = N; i >= 0; i--) { const u = i / N; const xx = bendX + (tipX - bendX) * u; const yy = yBase + sg * d * u * u + th / 2; c.lineTo(xx, yy); }
      c.closePath();
      const gr = c.createLinearGradient(0, yBase - th, 0, yBase + th);
      gr.addColorStop(0, LD.shade(steel, 0.45)); gr.addColorStop(0.5, steel); gr.addColorStop(1, LD.shade(steel, -0.35));
      c.fillStyle = gr; c.fill();
      c.strokeStyle = LD.alpha(LD.shade(steel, -0.5), 0.6); c.lineWidth = 0.8; c.stroke();
      c.restore();
    }
    if (ring) { tine(yHi, -1, dmax, 0.22); tine(yHi, 1, dmax, 0.22); tine(yLo, 1, dmax, 0.22); tine(yLo, -1, dmax, 0.22); }
    tine(yHi, -1, ring ? dmax * ph : 0, 1);
    tine(yLo, 1, ring ? dmax * ph : 0, 1);
    // 彎曲處
    c.beginPath();
    c.arc(bendX, yMid, gap / 2, Math.PI / 2, Math.PI * 1.5);
    c.strokeStyle = steel; c.lineWidth = th; c.lineCap = 'butt'; c.stroke();
    c.strokeStyle = LD.alpha(LD.shade(steel, 0.5), 0.6); c.lineWidth = 1; c.beginPath(); c.arc(bendX, yMid, gap / 2 + th / 2 - 1, Math.PI * 0.6, Math.PI * 1.1); c.stroke();
    c.lineCap = 'round';
    // 振動時的聲波弧線（裝飾）
    if (ring && !reducedMotion && state.show.parts) {
      for (let i = 0; i < 2; i++) {
        const u = (tVis * 1.2 + i / 2) % 1;
        c.strokeStyle = LD.alpha(col['b-wave'], 0.45 * (1 - u) * Math.min(1, a * 1.5)); c.lineWidth = 1.2;
        c.beginPath(); c.arc((bendX + tipX) / 2 + 6, yHi, 6 + u * 14, -Math.PI * 0.8, -Math.PI * 0.2); c.stroke();
      }
    }
    LD.pill(c, label, tipX + 6, yHi - 8, LD.c.text, 'left', '600 12px ' + LD.FONT);
  }

  // ---------- 右側：響度計與掃描曲線 ----------
  function drawGraph() {
    const c = ctx, x0 = g.gx0, x1 = g.gx1, y0 = g.top, y1 = g.bottom;
    // 底框
    LD.roundRect(c, x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8, 8);
    c.fillStyle = LD.alpha(LD.c.text, col.dark ? 0.035 : 0.025); c.fill();
    c.strokeStyle = LD.alpha(LD.c.text, 0.1); c.lineWidth = 1; c.stroke();
    // 格線：橫線與刻度尺對齊（每 10 cm 主、5 cm 次），直線每 10 dB
    c.beginPath();
    for (let i = 0; i <= 100; i += 5) { const y = Math.round(yOf(i / 100) * dpr) / dpr + 0.5 / dpr; c.moveTo(x0, y); c.lineTo(x1, y); }
    c.strokeStyle = LD.alpha(LD.c.text, col.dark ? 0.05 : 0.045); c.lineWidth = 1 / dpr; c.stroke();
    c.beginPath();
    for (let i = 0; i <= 100; i += 10) { const y = Math.round(yOf(i / 100) * dpr) / dpr + 0.5 / dpr; c.moveTo(x0, y); c.lineTo(x1, y); }
    for (let db = DB_LO; db <= DB_HI; db += 10) { const x = Math.round(xDb(db) * dpr) / dpr + 0.5 / dpr; c.moveTo(x, y0); c.lineTo(x, y1); }
    c.strokeStyle = LD.alpha(LD.c.text, col.dark ? 0.11 : 0.1); c.stroke();
    // 0 dB（音叉單獨發聲）
    c.beginPath(); c.moveTo(xDb(0) + 0.5, y0); c.lineTo(xDb(0) + 0.5, y1);
    c.strokeStyle = LD.alpha(LD.c.text, 0.22); c.lineWidth = 1; c.stroke();
    // 軸標
    c.font = '11px ' + LD.FONT; c.fillStyle = LD.c.muted; c.textBaseline = 'top'; c.textAlign = 'center';
    for (let db = DB_LO; db <= DB_HI; db += 10) c.fillText(db === 0 ? '0' : num(db, 0), xDb(db), y1 + 6);
    LD.haloText(c, T('相對響度（dB）', 'Relative loudness (dB)'), (x0 + x1) / 2, y1 + 22, LD.c.muted, 'center', 'top', '600 11.5px ' + LD.FONT);
    if (!g.narrow) {
      c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = LD.c.muted;
      for (let i = 0; i <= 100; i += 10) c.fillText(String(i), x1 + 7, yOf(i / 100));
    }
    // 已記錄的位置（目前條件）：淡紅色橫線＋讀數
    const key = curKey();
    const recs = state.records.filter(function (r) { return r.key === key; });
    if (recs.length) {
      c.save(); c.setLineDash([2, 3]);
      c.strokeStyle = LD.alpha(LD.c.pos, 0.45); c.lineWidth = 1;
      recs.forEach(function (r) { const y = Math.round(yOf(r.Lread)) + 0.5; c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); });
      c.restore();
      const an = C.analyze(recs.map(function (r) { return r.Lread; }), NaN, state.Tc, radius());
      an.means.forEach(function (m) { LD.pill(c, cm(m, an.clusters.length && an.clusters.find(function (q) { return q.mean === m; }).values.length > 1 ? 2 : 1), x0 + 3, yOf(m) - 3, LD.c.pos, 'left', '600 11px ' + LD.FONT); });
    }
    // 理論曲線（可選）
    if (state.show.theory) {
      const th = theory();
      c.save(); c.setLineDash([5, 4]);
      c.beginPath();
      for (let i = 0; i < NBIN; i++) { const x = xDb(th[i]), y = yOf(i / 1000); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
      c.strokeStyle = LD.alpha(LD.c.muted, 0.85); c.lineWidth = 1.2; c.stroke();
      c.restore();
    }
    // 掃描曲線（連續的 1 mm 格子連成線，下方淡色填滿）
    const tr = trace();
    const segs = [];
    let cur = null;
    for (let i = 0; i < NBIN; i++) {
      if (isNaN(tr[i])) { cur = null; continue; }
      if (!cur) { cur = []; segs.push(cur); }
      cur.push([xDb(tr[i]), yOf(i / 1000)]);
    }
    if (segs.length) {
      c.save();
      const fg = c.createLinearGradient(x0, 0, x1, 0);
      fg.addColorStop(0, LD.alpha(col['b-wave'], 0.02)); fg.addColorStop(1, LD.alpha(col['b-wave'], col.dark ? 0.3 : 0.22));
      segs.forEach(function (s) {
        if (s.length < 2) return;
        c.beginPath(); c.moveTo(x0, s[0][1]);
        s.forEach(function (p) { c.lineTo(p[0], p[1]); });
        c.lineTo(x0, s[s.length - 1][1]); c.closePath();
        c.fillStyle = fg; c.fill();
      });
      c.lineJoin = 'round'; c.lineCap = 'round';
      c.strokeStyle = col['b-wave']; c.lineWidth = 1.8;
      segs.forEach(function (s) {
        c.beginPath();
        s.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
        if (s.length === 1) c.lineTo(s[0][0] + 0.1, s[0][1]);
        c.stroke();
      });
      c.restore();
    } else if (!state.show.theory) {
      const msg = sounding() ? T('移動水面，這裡會畫出響度曲線', 'Move the water to draw the loudness curve')
        : T('敲音叉後移動水面，', 'Strike the fork, then move the water:');
      LD.haloText(c, msg, (x0 + x1) / 2, y0 + 30, LD.c.muted, 'center', 'middle', '12px ' + LD.FONT);
      if (!sounding()) LD.haloText(c, T('這裡會畫出響度曲線', 'the loudness curve appears here'), (x0 + x1) / 2, y0 + 48, LD.c.muted, 'center', 'middle', '12px ' + LD.FONT);
    }
    // 目前水面：橫向虛線由管子連到曲線
    const yW = yOf(state.L);
    c.save(); c.setLineDash([4, 4]);
    c.beginPath(); c.moveTo(g.tubeX + g.tubeW + 2, yW + 0.5); c.lineTo(x1, yW + 0.5);
    c.strokeStyle = LD.alpha(col['b-wave'], 0.55); c.lineWidth = 1; c.stroke();
    c.restore();
    if (sounding()) {
      const db = levelShown(), x = xDb(db);
      LD.ball(c, x, yW, 4.6, col['b-wave'], { glow: col.dark ? 0.5 : 0.25 });
    }
    // 響度計（上方）：與下方曲線共用 dB 軸
    const my = g.narrow ? 46 : 48, mh = 11;
    LD.haloText(c, T('相對響度', 'Relative loudness'), x0, 22, LD.c.muted, 'left', 'middle', '600 12px ' + LD.FONT);
    const sv = sounding();
    const valTxt = sv ? signed(levelShown(), 1) + ' dB' : '—';
    LD.haloText(c, valTxt, x1, 22, sv ? col['b-wave'] : LD.c.muted, 'right', 'middle', '700 16px ' + LD.FONT);
    LD.roundRect(c, x0, my - mh / 2, x1 - x0, mh, mh / 2);
    c.fillStyle = LD.alpha(LD.c.text, col.dark ? 0.1 : 0.07); c.fill();
    if (sv) {
      const xv = xDb(levelShown());
      const bg = c.createLinearGradient(x0, 0, x1, 0);
      bg.addColorStop(0, LD.alpha(col['b-wave'], 0.35)); bg.addColorStop(1, col['b-wave']);
      c.save(); LD.roundRect(c, x0, my - mh / 2, x1 - x0, mh, mh / 2); c.clip();
      c.fillStyle = bg; c.fillRect(x0, my - mh / 2, xv - x0, mh);
      c.restore();
    }
    c.beginPath();
    for (let db = DB_LO; db <= DB_HI; db += 10) { const x = Math.round(xDb(db)) + 0.5; c.moveTo(x, my + mh / 2 + 1); c.lineTo(x, my + mh / 2 + 4); }
    c.strokeStyle = LD.alpha(LD.c.text, 0.35); c.lineWidth = 1; c.stroke();
    // 水面讀數
    const read = T('水面 L = ', 'Water L = ') + cm(state.L, 1);
    LD.haloText(c, read, x0, my + 24, LD.c.text, 'left', 'middle', '600 12px ' + LD.FONT);
    if (g.narrow) LD.haloText(c, T('室溫 ', 'Room ') + num(state.Tc, 1) + ' °C', 4, 16, LD.c.muted, 'left', 'middle', '600 11.5px ' + LD.FONT);
  }

  function drawFx(now) {
    state.fx = state.fx.filter(function (f) { return now - f.t0 < f.dur; });
    state.fx.forEach(function (f) { LD.ripple(ctx, f.x, f.y, f.r, (now - f.t0) / f.dur, f.color); });
  }

  let tVis = 0;
  function draw() {
    if (view3 && view3.active) { view3.frame(); updateMeter3(); return; }   // 3D 時 2D 畫布藏起來，不必畫
    if (!g) return;
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(c, cw, ch);
    drawGraph();
    drawStand();
    drawThermometer();
    drawTank();
    drawRuler();
    drawTube();
    drawWave(tVis);
    drawBands();
    drawSource(tVis);
    drawFx(performance.now());
    LD.haloText(c, T('高度依比例，寬度放大示意', 'heights to scale, widths enlarged'), Math.max(4, g.tubeX - 22), g.baseY + 24, LD.c.muted, 'left', 'middle', '10.5px ' + LD.FONT);
    placeTank();
    if (view3) view3.frame();
    updateMeter3();
  }
  let drawQueued = false;
  function requestDraw() {
    if (drawQueued || loopOn) return;
    drawQueued = true;
    requestAnimationFrame(function () { drawQueued = false; draw(); });
  }

  // ---------- 蓄水桶的拖曳把手（只有這裡攔下觸控，其餘地方可以捲動頁面） ----------
  let hoverTank = false, dragTank = null;
  function placeTank() {
    if (!g) return;
    const pad = Math.max(0, (48 - g.tankW) / 2);
    const top = tankTop() - 8, h = g.tankH + 16;
    tankEl.style.left = (g.tankX - pad - 4) + 'px';
    tankEl.style.width = (g.tankW + 2 * pad + 8) + 'px';
    tankEl.style.top = top + 'px';
    tankEl.style.height = h + 'px';
    tankEl.setAttribute('aria-valuenow', num(state.L * 100, 1));
    tankEl.setAttribute('aria-valuetext', cm(state.L, 1));
  }
  tankEl.addEventListener('pointerdown', function (ev) {
    dragTank = { y0: ev.clientY, L0: state.L };
    try { tankEl.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    ev.preventDefault();
    requestDraw();
  });
  tankEl.addEventListener('pointermove', function (ev) {
    if (!dragTank) return;
    setL(dragTank.L0 + (ev.clientY - dragTank.y0) / g.kpx, true);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) {
    tankEl.addEventListener(t, function () { if (dragTank) { dragTank = null; requestDraw(); } });
  });
  tankEl.addEventListener('pointerenter', function () { hoverTank = true; requestDraw(); });
  tankEl.addEventListener('pointerleave', function () { hoverTank = false; requestDraw(); });
  tankEl.addEventListener('keydown', function (ev) {
    const big = ev.shiftKey ? 0.01 : 0.001;
    let d = 0;
    if (ev.key === 'ArrowUp') d = -big; else if (ev.key === 'ArrowDown') d = big;
    else if (ev.key === 'PageUp') d = -0.01; else if (ev.key === 'PageDown') d = 0.01;
    else if (ev.key === 'Home') { setL(C.L_MIN, true); ev.preventDefault(); return; }
    else if (ev.key === 'End') { setL(C.L_MAX, true); ev.preventDefault(); return; }
    if (d) { setL(state.L + d, true); ev.preventDefault(); }
  });

  // ---------- 水面 ----------
  const elLev = $('lev');
  function setL(L, user) {
    const v = Math.round(Math.max(C.L_MIN, Math.min(C.L_MAX, L)) * 1000) / 1000; // 1 mm
    if (v === state.L && !user) return;
    const moved = v !== state.L;
    state.L = v;
    if (user) markUser();
    if (window.LabNum) window.LabNum.clear(elLev);
    elLev.value = (v * 100).toFixed(1);
    $('levo').textContent = num(v * 100, 1) + ' cm';
    if (user && v <= 0.05) state.steps.raised = true;
    sampleTrace();
    if (moved && user) emitTuned();
    updateSteps();
    requestDraw();
  }
  elLev.addEventListener('input', function () { setL(val(elLev) / 100, true); });
  [['up10', -0.01], ['up1', -0.001], ['dn1', 0.001], ['dn10', 0.01]].forEach(function (p) {
    $(p[0]).addEventListener('click', function () { setL(state.L + p[1], true); });
  });

  // ---------- 聲源 ----------
  function markUser() { state.user = true; }
  function sourceChanged() {
    state.lastBinL = null;
    theoryCache.key = '';
    updateSourceUI();
    refreshAll();
  }
  function updateSourceUI() {
    document.querySelectorAll('#forks button').forEach(function (b) {
      const on = b.dataset.src === state.src && (b.dataset.src !== 'fork' || +b.dataset.f === state.forkF);
      b.setAttribute('aria-pressed', String(on));
    });
    $('boxApp').hidden = state.src !== 'app';
    $('guessCard').hidden = state.src !== 'mystery';
    let h;
    if (state.src === 'app') h = T('手機 App 發出穩定的單一頻率；按「播放聲音」開始、再按一次停止。', 'The phone app plays a steady single frequency; press “Play the tone” to start and again to stop.');
    else if (state.src === 'mystery') h = T('神秘音叉：頻率看不到，要由量到的波長推算。', 'Mystery fork: its frequency is hidden — work it out from the wavelength you measure.');
    else h = T('音叉 ', 'Fork ') + fmtF(state.forkF) + ' Hz' + T('：敲一下約響 25 秒，聲音變小時再敲一次。', ': it rings for about 25 s after each strike; strike it again when it fades.');
    $('srcHint').textContent = h;
    $('strike').textContent = state.src === 'app' ? (state.appOn ? T('停止聲音', 'Stop the tone') : T('播放聲音', 'Play the tone')) : T('敲音叉', 'Strike the fork');
  }
  document.querySelectorAll('#forks button').forEach(function (b) {
    b.addEventListener('click', function () {
      const src = b.dataset.src;
      if (src !== 'app') state.appOn = false;
      if (src === 'fork') state.forkF = +b.dataset.f;
      if (state.src !== src) state.strikeAt = -1e9; // 換聲源：原本的音叉停止
      else if (src === 'fork') state.strikeAt = -1e9;
      state.src = src;
      state.steps.prep = true;
      markUser();
      sourceChanged();
      setStatus(src === 'app' ? T('按「播放聲音」讓手機發聲。', 'Press “Play the tone” to start the phone.') : T('按「敲音叉」讓音叉振動。', 'Press “Strike the fork” to make it ring.'));
    });
  });
  const elApp = $('fApp');
  elApp.addEventListener('input', function () {
    state.appF = Math.round(val(elApp) * 10) / 10;
    $('fAppo').textContent = fmtF(state.appF) + ' Hz';
    markUser();
    sourceChanged();
  });

  $('strike').addEventListener('click', function () {
    markUser();
    state.steps.prep = true;
    if (state.src === 'app') {
      state.appOn = !state.appOn;
      if (state.appOn) state.steps.struck = true;
      updateSourceUI();
    } else {
      state.strikeAt = nowS();
      state.steps.struck = true;
      strikeSound();
      if (!reducedMotion && g) state.fx.push({ t0: performance.now(), dur: 380, x: g.cx + g.tubeW * 0.3, y: g.top - (g.narrow ? 14 : 15), r: 6, color: col['b-wave'] });
      emit('strike', { src: state.src, f: freq() });
    }
    state.lastBinL = null;
    sampleTrace();
    emitTuned();
    setStatus(sounding() ? T('聲音響了：慢慢移動水面，注意響度計與耳朵聽到的聲音。', 'Sounding: move the water slowly and watch the meter (or listen).') : T('已停止。', 'Stopped.'));
    updateSteps();
    startLoop();
  });

  // ---------- 條件：室溫、管徑、誤差 ----------
  const elT = $('temp'), elD = $('dia');
  function readConditions() {
    state.Tc = Math.round(val(elT) * 10) / 10;
    state.d = Math.round(val(elD) * 100) / 10000; // cm → m（到 0.01 cm）
    $('tempo').textContent = num(state.Tc, 1) + ' °C';
    $('diao').textContent = fmtD(state.d) + ' cm';
  }
  elT.addEventListener('input', function () { readConditions(); state.steps.prep = true; markUser(); conditionsChanged(); });
  elD.addEventListener('input', function () { readConditions(); markUser(); conditionsChanged(); });
  function conditionsChanged() { state.lastBinL = null; theoryCache.key = ''; sampleTrace(); refreshAll(); }
  function setNoisy(on) {
    state.noisy = on;
    $('ideal').setAttribute('aria-pressed', String(!on));
    $('noisy').setAttribute('aria-pressed', String(on));
    $('errHint').textContent = on
      ? T('含誤差：每筆讀數有約 ±1 mm 的隨機誤差（凹液面、視差），響度計也會跳動約 ±1 dB。多量幾次取平均。', 'With errors: each reading has a random error of about ±1 mm (meniscus, parallax), and the meter flickers by about ±1 dB. Repeat and average.')
      : T('理想：讀數準確到 1 mm（尺的最小刻度），響度計不跳動。', 'Ideal: readings are exact to 1 mm (the smallest division of the scale) and the meter is steady.');
    requestDraw();
  }
  $('ideal').addEventListener('click', function () { markUser(); setNoisy(false); });
  $('noisy').addEventListener('click', function () { markUser(); setNoisy(true); });

  // ---------- 顯示 ----------
  [['showEnv', 'env'], ['showParts', 'parts'], ['showTheory', 'theory']].forEach(function (p) {
    $(p[0]).addEventListener('change', function (ev) { state.show[p[1]] = ev.target.checked; requestDraw(); });
  });

  // ---------- 記錄、刪除、全部清除 ----------
  $('record').addEventListener('click', function () {
    markUser();
    const f = freq(), r = radius();
    const Lread = state.noisy ? C.roundMm(state.L + READ_SIGMA * gauss()) : C.roundMm(state.L);
    const near = C.nearestResonance(state.L, f, state.Tc, r);
    const rec = {
      src: state.src, f: f, Tc: state.Tc, d: state.d, key: curKey(),
      Lread: Lread, Ltrue: state.L, db: sounding() ? levelShown() : NaN, below: near.below, n: near.n, noisy: state.noisy
    };
    state.records.push(rec);
    recordSound();
    const an = groupAnalysis(rec.key);
    emit('record', Object.assign({}, rec, { count: state.records.length, clusters: an ? an.count : 0 }));
    setStatus(T('已記錄（套上橡皮筋）：L = ', 'Recorded (rubber band at) L = ') + cm(Lread, 1) +
      (isFinite(rec.db) ? T('，響度 ', ', loudness ') + signed(rec.db, 1) + ' dB' : T('（記錄時沒有聲音）', ' (no sound at the time)')) + T('。', '.'));
    refreshAll(true);
  });
  $('undo').addEventListener('click', function () {
    if (!state.records.length) return;
    state.records.pop();
    setStatus(T('已刪除最後一筆。', 'The last reading was removed.'));
    refreshAll(true);
  });
  $('clearAll').addEventListener('click', function () {
    state.records = [];
    state.traces.clear();
    state.lastBinL = null;
    state.mysteryF = randMystery();
    state.lastGuess = null;
    $('guessOut').textContent = '';
    $('guessF').value = '';
    state.steps = { prep: false, raised: false, struck: false, repeat: false };
    theoryCache.key = '';
    sampleTrace();
    setStatus(T('已全部清除（數據表、橡皮筋、響度曲線），滑桿設定不變；神秘音叉也換了一支。', 'Everything is cleared (table, rubber bands, loudness scans); the slider settings are kept and there is a new mystery fork.'));
    refreshAll();
  });

  // ---------- 分析 ----------
  function groupAnalysis(key) {
    const recs = state.records.filter(function (r) { return r.key === key; });
    if (!recs.length) return null;
    const r0 = recs[0];
    const an = C.analyze(recs.map(function (r) { return r.Lread; }), r0.src === 'mystery' ? NaN : r0.f, r0.Tc, r0.d / 2);
    an.src = r0.src; an.fTrue = r0.f; an.d = r0.d; an.key = key; an.nReadings = recs.length;
    an.noisy = recs.every(function (r) { return r.noisy; }); // 全部讀數都在「含誤差」模式下量的
    an.perCluster = an.clusters.map(function (q) { return q.values.length; });
    return an;
  }
  function allGroups() {
    const keys = [];
    state.records.forEach(function (r) { if (keys.indexOf(r.key) < 0) keys.push(r.key); });
    return keys.map(groupAnalysis);
  }
  /** λ–1/f 圖：目前室溫下，頻率已知、至少 2 個共鳴點且吻合的各組 */
  function lambdaFreqFit() {
    const pts = allGroups().filter(function (a) { return a && a.src !== 'mystery' && a.count >= 2 && a.consistent && a.T === state.Tc; });
    const byF = {};
    pts.forEach(function (a) { (byF[a.fTrue] = byF[a.fTrue] || []).push(a); });
    const fs = Object.keys(byF).map(Number).sort(function (a, b) { return a - b; });
    const xs = [], ys = [];
    pts.forEach(function (a) { xs.push(1 / a.fTrue); ys.push(a.lambda); });
    const v = xs.length ? C.fitThroughOrigin(xs, ys) : NaN;
    return { pts: pts, nF: fs.length, v: v, errPct: (v - C.speedOfSound(state.Tc)) / C.speedOfSound(state.Tc) * 100 };
  }

  function setHTML(id, html) { const el = $(id); if (el.innerHTML !== html) el.innerHTML = html; }
  function updateAnalysis() {
    const an = groupAnalysis(curKey());
    const myst = state.src === 'mystery';
    const vT = C.speedOfSound(state.Tc);
    setHTML('tV', num(vT, 1) + ' m/s');
    setHTML('tVl', num(C.speedLinear(state.Tc), 1) + ' m/s');
    setHTML('tE', cm(C.endCorrection(radius()), 2));
    const fit = lambdaFreqFit();
    setHTML('tFit', fit.nF >= 2 ? num(fit.v, 1) + ' m/s<small>' + fit.nF + T(' 支音叉，誤差 ', ' forks, ') + signed(fit.errPct, 2) + ' %' + T('', ' off') + '</small>' : '<small>' + T('需要 2 支以上音叉', 'needs 2 or more forks') + '</small>');
    const note = $('aNote');
    note.hidden = true; note.className = 'wide';
    if (!an) {
      ['aLs', 'aDL', 'aLam', 'aV', 'aErr', 'aE', 'aNaive'].forEach(function (id) { setHTML(id, '—'); });
      setHTML('aN', '0');
      $('aErr').className = '';
      return;
    }
    setHTML('aN', an.nReadings + ' ／ ' + an.count);
    setHTML('aLs', an.means.map(function (m, i) {
      return 'L<sub>' + an.ns[i] + '</sub> = ' + cm(m, an.perCluster[i] > 1 ? 2 : 1) + (an.perCluster[i] > 1 ? ' <small style="display:inline">(' + an.perCluster[i] + T(' 次', '×') + ')</small>' : '');
    }).join('　'));
    if (an.count < 2) {
      ['aDL', 'aLam', 'aV', 'aErr', 'aE'].forEach(function (id) { setHTML(id, '—'); });
      $('aErr').className = '';
      setHTML('aNaive', !myst && isFinite(an.vNaive) ? num(an.vNaive, 1) + ' m/s<small>' + signed(an.errNaivePct, 1) + ' %</small>' : '—');
      note.hidden = false;
      note.textContent = T('再找一個共鳴位置，才能由間距求出波長。', 'Find another resonance to get the wavelength from the spacing.');
      return;
    }
    const dl = an.slope;
    setHTML('aDL', cm(dl, 2));
    setHTML('aLam', cm(an.lambda, 2));
    if (myst) {
      setHTML('aV', '<small>' + T('頻率未知', 'frequency unknown') + '</small>');
      setHTML('aErr', '—');
      $('aErr').className = '';
    } else {
      setHTML('aV', num(an.v, 1) + ' m/s');
      setHTML('aErr', signed(an.errPct, 2) + ' %');
      $('aErr').className = Math.abs(an.errPct) <= 1 ? 'good' : Math.abs(an.errPct) > 3 ? 'warn' : '';
    }
    setHTML('aE', cm(an.e, 2) + '<small>' + T('理論 ', 'theory ') + cm(an.eTheory, 2) + '</small>');
    setHTML('aNaive', !myst && isFinite(an.vNaive) ? num(an.vNaive, 1) + ' m/s<small>' + signed(an.errNaivePct, 1) + ' %</small>' : '—');
    if (!an.consistent) {
      note.hidden = false; note.className = 'wide warn';
      note.textContent = T('這些位置不像等間距的共鳴點，請檢查是否有記錄到非共鳴的位置（可用「刪除最後一筆」）。', 'These positions are not evenly spaced like resonances — check whether a non-resonant level was recorded (use “Remove the last reading”).');
    }
  }

  function buildTable() {
    const key = curKey();
    const groups = {};
    allGroups().forEach(function (a) { groups[a.key] = a; });
    let h = '<thead><tr><th>#</th><th>' + T('聲源', 'Source') + '<br><small>f (Hz)</small></th><th>' + T('室溫', 'Temp.') + '<br><small>T (°C)</small></th><th>' + T('管徑', 'Tube') +
      '<br><small>d (cm)</small></th><th>' + T('水面', 'Water') + '<br><small>L (cm)</small></th><th>' + T('響度', 'Loudness') + '<br><small>(dB)</small></th><th>' + T('第幾次', 'Order') + '<br><small>n</small></th></tr></thead><tbody>';
    if (!state.records.length) {
      h += '<tr class="empty"><td colspan="7">' + T('還沒有數據。找到共鳴位置後按「記錄」。', 'No data yet. Find a resonance and press “Record”.') + '</td></tr>';
    }
    state.records.forEach(function (r, i) {
      const a = groups[r.key];
      let n = '—';
      if (a) {
        const ci = a.clusters.findIndex(function (q) { return q.values.indexOf(r.Lread) >= 0; });
        if (ci >= 0) n = String(a.ns[ci]);
      }
      const cls = (r.key === key ? 'cur' : '') + (i === state.records.length - 1 ? ' latest' : '');
      h += '<tr class="' + cls.trim() + '"><td>' + (i + 1) + '</td><td>' + fLabel(r.src, r.f) + '</td><td>' + num(r.Tc, 1) + '</td><td>' + fmtD(r.d) +
        '</td><td>' + num(r.Lread * 100, 1) + '</td><td>' + (isFinite(r.db) ? signed(r.db, 1) : '—') + '</td><td class="nn">' + n + '</td></tr>';
    });
    h += '</tbody>';
    setHTML('tbl', h);
  }

  // ---------- 步驟 ----------
  function updateSteps() {
    const an = groupAnalysis(curKey());
    const recs = state.records.filter(function (r) { return r.key === curKey(); });
    const done = [
      state.steps.prep,
      state.steps.raised,
      state.steps.struck,
      recs.some(function (r) { return r.below <= 3; }),
      !!(an && an.count >= 2 && an.consistent),
      state.steps.repeat
    ];
    let cur = done.indexOf(false);
    document.querySelectorAll('#steps li').forEach(function (li, i) {
      li.classList.toggle('done', done[i]);
      li.classList.toggle('cur', i === cur);
    });
  }

  function refreshAll(dataChanged) {
    updateAnalysis();
    buildTable();
    const valid = allGroups().filter(function (a) { return a && a.count >= 2 && a.consistent; });
    if (valid.length >= 2) state.steps.repeat = true;
    updateSteps();
    if (dataChanged) emitAnalysis();
    drawGraph2();
    requestDraw();
  }

  // ---------- 神秘音叉：推算頻率 ----------
  $('guessBtn').addEventListener('click', checkGuess);
  $('guessF').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') checkGuess(); });
  function checkGuess() {
    const s = String($('guessF').value || '').normalize('NFKC').replace(/[，,]/g, '.').trim();
    const fG = parseFloat(s);
    const out = $('guessOut');
    if (!(fG > 0)) { out.textContent = T('請輸入頻率（Hz）。', 'Please type a frequency in Hz.'); return; }
    markUser();
    const an = groupAnalysis(curKey());
    const fT = state.mysteryF, err = (fG - fT) / fT * 100;
    const okN = an ? an.count : 0;
    out.innerHTML = T('答案：這支音叉是 ', 'Answer: this fork is ') + '<b>' + fmtF(fT) + ' Hz</b>' + T('，你的推算相差 ', '; you are off by ') + signed(err, 2) + ' %' +
      (Math.abs(err) <= 0.5 ? T('，非常準！', ' — excellent!') : Math.abs(err) <= 2 ? T('，不錯。', ' — good.') : T('，再檢查一下波長與聲速。', ' — check your wavelength and speed of sound.'));
    emit('guess', { fTrue: fT, fGuess: fG, errPct: err, clusters: okN, consistent: !!(an && an.consistent), Tc: state.Tc });
  }

  // =====================================================================
  // 數據圖（L–n 或 λ–1/f）
  // =====================================================================
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  let gw = 320, gh = 280, gdpr = 1;
  function resizeGraph() {
    const w = gcv.clientWidth;
    if (!w) return;
    gdpr = Math.min(window.devicePixelRatio || 1, 2.5);
    gw = w; gh = w < 560 ? 316 : 326;
    if (gcv.style.height !== gh + 'px') gcv.style.height = gh + 'px';
    gcv.width = Math.round(gw * gdpr); gcv.height = Math.round(gh * gdpr);
    drawGraph2();
  }
  function niceStep(span, n) {
    const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  function axes(c, box, xr, yr, xl, yl, xFmt, yFmt, xMinStep) {
    const X = function (x) { return box.x + (x - xr[0]) / (xr[1] - xr[0]) * box.w; };
    const Y = function (y) { return box.y + box.h - (y - yr[0]) / (yr[1] - yr[0]) * box.h; };
    const xs = Math.max(xMinStep || 0, niceStep(xr[1] - xr[0], 6)), ys = niceStep(yr[1] - yr[0], 5);
    c.beginPath();
    for (let x = Math.ceil(xr[0] / xs) * xs; x <= xr[1] + 1e-9; x += xs) { const px = Math.round(X(x) * gdpr) / gdpr + 0.5 / gdpr; c.moveTo(px, box.y); c.lineTo(px, box.y + box.h); }
    for (let y = Math.ceil(yr[0] / ys) * ys; y <= yr[1] + 1e-9; y += ys) { const py = Math.round(Y(y) * gdpr) / gdpr + 0.5 / gdpr; c.moveTo(box.x, py); c.lineTo(box.x + box.w, py); }
    c.strokeStyle = LD.alpha(LD.c.text, col.dark ? 0.1 : 0.08); c.lineWidth = 1 / gdpr; c.stroke();
    // 座標軸（通過 0）
    c.beginPath();
    const y0 = Y(Math.max(yr[0], Math.min(yr[1], 0))), x0 = X(Math.max(xr[0], Math.min(xr[1], 0)));
    c.moveTo(box.x, y0); c.lineTo(box.x + box.w, y0);
    c.moveTo(x0, box.y); c.lineTo(x0, box.y + box.h);
    c.strokeStyle = LD.alpha(LD.c.text, 0.45); c.lineWidth = 1.2; c.stroke();
    c.font = '11px ' + LD.FONT; c.fillStyle = LD.c.muted;
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let x = Math.ceil(xr[0] / xs) * xs; x <= xr[1] + 1e-9; x += xs) c.fillText(xFmt(x), X(x), box.y + box.h + 5);
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let y = Math.ceil(yr[0] / ys) * ys; y <= yr[1] + 1e-9; y += ys) c.fillText(yFmt(y), box.x - 6, Y(y));
    LD.haloText(c, xl, box.x + box.w, box.y + box.h + 22, LD.c.muted, 'right', 'top', '600 11.5px ' + LD.FONT);
    LD.haloText(c, yl, box.x - 4, box.y - 12, LD.c.muted, 'left', 'middle', '600 11.5px ' + LD.FONT);
    return { X: X, Y: Y };
  }
  function drawGraph2() {
    const c = gctx;
    c.setTransform(gdpr, 0, 0, gdpr, 0, 0);
    LD.backdrop(c, gw, gh);
    const narrow = gw < 560;
    const foot = narrow ? 46 : 26;   // 圖下方的圖例列（手機兩列）
    const box = { x: narrow ? 46 : 58, y: 26, w: gw - (narrow ? 46 : 58) - (narrow ? 12 : 24), h: gh - 26 - 44 - foot };
    const legend = [];               // { mark: 'ball' | 'ring' | 'dot' | 'line', color, text }
    if (state.graph === 'Ln') {
      const an = groupAnalysis(curKey());
      const has = !!(an && an.count >= 1);
      const fitOK = !!(an && an.count >= 2);
      let nMax = 3, yMin = -10, yMax = 100;
      if (has) {
        nMax = Math.max(3, an.ns[an.ns.length - 1] + 0.6);
        yMax = Math.max(30, an.means[an.means.length - 1] * 100 + 8);
        yMin = fitOK ? Math.min(-5, an.intercept * 100 - 5) : -10;
      }
      const A = axes(c, box, [0, nMax], [yMin, yMax], T('第幾次共鳴 n', 'resonance order n'), 'L (cm)', function (x) { return num(x, 0); }, function (y) { return num(y, 0); }, 1);
      if (!has) {
        LD.haloText(c, T('記錄共鳴位置後，這裡畫出 L 對 n 的圖', 'Record resonances to plot L against n'), box.x + box.w / 2, box.y + box.h / 2, LD.c.muted, 'center', 'middle', '13px ' + LD.FONT);
        return;
      }
      if (fitOK) {
        // 最佳直線：資料範圍內實線，延伸到 n = 0 用虛線
        const nA = an.ns[0], nB = an.ns[an.ns.length - 1];
        const Lf = function (n) { return (an.slope * n + an.intercept) * 100; };
        c.save();
        c.setLineDash([5, 4]); c.strokeStyle = LD.alpha(LD.c.accent, 0.8); c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(A.X(0), A.Y(Lf(0))); c.lineTo(A.X(nA), A.Y(Lf(nA))); c.moveTo(A.X(nB), A.Y(Lf(nB))); c.lineTo(A.X(nMax), A.Y(Lf(nMax))); c.stroke();
        c.setLineDash([]); c.lineWidth = 2.2; c.strokeStyle = LD.c.accent;
        c.beginPath(); c.moveTo(A.X(nA), A.Y(Lf(nA))); c.lineTo(A.X(nB), A.Y(Lf(nB))); c.stroke();
        c.restore();
        // 截距與 n = ½（L = −e）
        LD.ball(c, A.X(0), A.Y(Lf(0)), 4, LD.c.equi, { glow: 0 });
        const ne = 0.5;
        c.beginPath(); c.arc(A.X(ne), A.Y(Lf(ne)), 3.5, 0, Math.PI * 2); c.strokeStyle = LD.c.equi; c.lineWidth = 1.5; c.stroke();
        legend.push({ mark: 'ball', color: LD.c.equi, text: T('截距 −(λ/4 + e) = ', 'intercept −(λ/4 + e) = ') + num(Lf(0), 1) + ' cm' });
        legend.push({ mark: 'ring', color: LD.c.equi, text: T('n = ½ 處 L = −e = ', 'at n = ½, L = −e = ') + num(Lf(ne), 1) + ' cm' });
        const sx = A.X((nA + nB) / 2), sy = A.Y(Lf((nA + nB) / 2));
        LD.pill(c, T('斜率 λ/2 = ', 'slope λ/2 = ') + num(an.slope * 100, 2) + ' cm', sx - 10, sy - 10, LD.c.accent, 'right', '600 11.5px ' + LD.FONT);
      }
      // 數據點：個別讀數（小點）與平均（大點）
      an.clusters.forEach(function (q, i) {
        q.values.forEach(function (v) { c.beginPath(); c.arc(A.X(an.ns[i]) + 7, A.Y(v * 100), 2, 0, Math.PI * 2); c.fillStyle = LD.alpha(LD.c.pos, 0.6); c.fill(); });
        LD.ball(c, A.X(an.ns[i]), A.Y(q.mean * 100), 5, LD.c.pos, { glow: col.dark ? 0.3 : 0 });
      });
      if (!fitOK) {
        legend.push({ mark: 'ball', color: LD.c.pos, text: T('共鳴位置（平均）', 'resonance (mean)') });
        legend.push({ mark: 'dot', color: LD.c.pos, text: T('每次讀數', 'each reading') });
      }
    } else {
      const fit = lambdaFreqFit();
      const pts = fit.pts;
      let xMax = 4, yMax = 140;
      pts.forEach(function (a) { xMax = Math.max(xMax, 1000 / a.fTrue * 1.15); yMax = Math.max(yMax, a.lambda * 100 * 1.15); });
      const A = axes(c, box, [0, xMax], [0, yMax], '1/f (ms)', 'λ (cm)', function (x) { return num(x, 1); }, function (y) { return num(y, 0); });
      if (!pts.length) {
        LD.haloText(c, T('每支音叉至少記錄 2 個共鳴點（同一室溫），', 'Record at least 2 resonances with each fork'), box.x + box.w / 2, box.y + box.h / 2 - 9, LD.c.muted, 'center', 'middle', '13px ' + LD.FONT);
        LD.haloText(c, T('這裡畫出 λ 對 1/f 的圖', '(same temperature) to plot λ against 1/f'), box.x + box.w / 2, box.y + box.h / 2 + 11, LD.c.muted, 'center', 'middle', '13px ' + LD.FONT);
        return;
      }
      if (isFinite(fit.v)) {
        c.save(); c.strokeStyle = LD.c.accent; c.lineWidth = 2;
        c.beginPath(); c.moveTo(A.X(0), A.Y(0)); c.lineTo(A.X(xMax), A.Y(fit.v * xMax / 10)); c.stroke(); c.restore();
        LD.pill(c, T('斜率 v = ', 'slope v = ') + num(fit.v, 1) + ' m/s', A.X(xMax * 0.08), A.Y(fit.v * xMax * 0.6 / 10) - 4, LD.c.accent, 'left', '600 12px ' + LD.FONT);
      }
      pts.forEach(function (a) {
        const x = A.X(1000 / a.fTrue), y = A.Y(a.lambda * 100);
        LD.ball(c, x, y, 5, LD.c.pos, { glow: col.dark ? 0.3 : 0 });
        LD.haloText(c, fmtF(a.fTrue) + ' Hz', x + 8, y + 12, LD.c.muted, 'left', 'middle', '11px ' + LD.FONT);
      });
      legend.push({ mark: 'ball', color: LD.c.pos, text: T('每支音叉：λ = 2ΔL', 'each fork: λ = 2ΔL') });
      if (isFinite(fit.v)) legend.push({ mark: 'line', color: LD.c.accent, text: T('過原點的最佳直線，斜率 = 聲速', 'best line through the origin; slope = speed') });
    }
    drawLegend(c, legend, box.x, box.y + box.h + 44, box.x + box.w);
  }
  /** 圖下方的圖例：一列放不下就換行 */
  function drawLegend(c, items, x0, y0, xMax) {
    let x = x0, y = y0 + 10;
    const font = '600 11.5px ' + LD.FONT;
    items.forEach(function (it) {
      c.font = font;
      const w = 16 + c.measureText(it.text).width;
      if (x > x0 && x + w > xMax) { x = x0; y += 21; }
      const mx = x + 5;
      if (it.mark === 'ball') LD.ball(c, mx, y, 4, it.color, { glow: 0 });
      else if (it.mark === 'ring') { c.beginPath(); c.arc(mx, y, 3.5, 0, Math.PI * 2); c.strokeStyle = it.color; c.lineWidth = 1.5; c.stroke(); }
      else if (it.mark === 'dot') { c.beginPath(); c.arc(mx, y, 2, 0, Math.PI * 2); c.fillStyle = LD.alpha(it.color, 0.6); c.fill(); }
      else { c.beginPath(); c.moveTo(x - 2, y); c.lineTo(x + 12, y); c.strokeStyle = it.color; c.lineWidth = 2.2; c.stroke(); }
      LD.haloText(c, it.text, x + 16, y, it.color === LD.c.pos ? LD.c.text : it.color, 'left', 'middle', font);
      x += w + 22;
    });
  }
  function setGraph(m) {
    state.graph = m;
    $('gLn').setAttribute('aria-pressed', String(m === 'Ln'));
    $('gLf').setAttribute('aria-pressed', String(m === 'Lf'));
    drawGraph2();
  }
  $('gLn').addEventListener('click', function () { setGraph('Ln'); });
  $('gLf').addEventListener('click', function () { setGraph('Lf'); });

  // ---------- 音效（sound.js；音效關閉時完全不呼叫） ----------
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function strikeSound() {
    const S = sound(); if (!S) return;
    S.noise({ dur: 0.025, gain: 0.25, filter: 2600, q: 1.4 }); // 橡皮槌的「咚」
  }
  function recordSound() {
    const S = sound(); if (!S) return;
    S.tone({ freq: 1320, dur: 0.04, type: 'sine', gain: 0.18 });
  }
  /** 持續的聲音：真實頻率 f（250 Hz 以上），音量跟著聲源振幅與共鳴響度 */
  let voice = null;
  function updateVoice() {
    const S = sound();
    const a = amp();
    if (!S || a <= AUDIBLE) { if (voice) { voice.stop(0.2); voice = null; } return; }
    const db = levelTrue(state.L);
    const gain = Math.min(0.75, a * (0.03 + 0.62 * Math.pow(10, (db - 24) / 20)));
    if (!voice || !voice.playing) voice = S.voice({ freq: freq(), type: 'sine', gain: gain });
    else voice.set({ freq: freq(), gain: gain }, 0.05);
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
    updateVoice();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') { updateSoundButton(); if (!ev.detail.value) voice = null; updateVoice(); }
  });

  // ---------- 任務模式（missions.js）：回報事件 ----------
  function emit(type, data) { if (window.LabMission && state.user) window.LabMission.emit(type, data); }
  function emitTuned() {
    if (!state.user || !sounding()) return;
    const near = C.nearestResonance(state.L, freq(), state.Tc, radius());
    emit('tuned', { src: state.src, f: freq(), Tc: state.Tc, d: state.d, L: state.L, n: near.n, below: near.below, db: near.db, sounding: true });
  }
  function emitAnalysis() {
    const an = groupAnalysis(curKey());
    const groups = allGroups().filter(Boolean).map(function (a) {
      return { src: a.src, f: a.fTrue, Tc: a.T, d: a.d, count: a.count, ns: a.ns.slice(), consistent: a.consistent, v: a.v, errPct: a.errPct,
        e: a.e, eTheory: a.eTheory, lambda: a.lambda, noisy: a.noisy, perCluster: a.perCluster.slice(), nReadings: a.nReadings };
    });
    const fit = lambdaFreqFit();
    emit('analysis', {
      src: state.src, f: freq(), Tc: state.Tc, d: state.d,
      count: an ? an.count : 0, ns: an ? an.ns.slice() : [], means: an ? an.means.slice() : [], consistent: !!(an && an.consistent),
      nReadings: an ? an.nReadings : 0, perCluster: an ? an.perCluster.slice() : [], noisy: !!(an && an.noisy),
      v: an ? an.v : NaN, errPct: an ? an.errPct : NaN, e: an ? an.e : NaN, eTheory: C.endCorrection(radius()), lambda: an ? an.lambda : NaN,
      vNaive: an ? an.vNaive : NaN, errNaivePct: an ? an.errNaivePct : NaN,
      groups: groups, fitForks: fit.nF, fitV: fit.v, fitErrPct: fit.errPct,
      records: state.records.map(function (r) { return { src: r.src, f: r.f, Tc: r.Tc, d: r.d, Lread: r.Lread, Ltrue: r.Ltrue, below: r.below, n: r.n }; })
    });
  }

  // ---------- 動畫：聲音在響時持續更新 ----------
  let loopOn = false, lastT = 0;
  function tick(tNow) {
    const dt = Math.min((tNow - lastT) / 1000, 1 / 30);
    lastT = tNow;
    if (!reducedMotion) tVis += dt;
    if (state.noisy) {
      // 響度計的跳動：Ornstein–Uhlenbeck 隨機過程（標準差 METER_SIGMA、相關時間 METER_TC）
      state.jitter += -state.jitter * dt / METER_TC + METER_SIGMA * Math.sqrt(2 * dt / METER_TC) * gauss();
    } else state.jitter = 0;
    const was = loopSounding;
    loopSounding = sounding();
    if (loopSounding) sampleTrace();
    if (was && !loopSounding && state.src !== 'app') setStatus(T('音叉的聲音已經小到聽不清楚，再敲一次。', 'The fork has faded too much to hear — strike it again.'));
    updateVoice();
    draw();
    const fxOn = state.fx.length > 0;
    if (loopSounding || fxOn || dragTank) requestAnimationFrame(tick);
    else { loopOn = false; draw(); }
  }
  let loopSounding = false;
  function startLoop() {
    if (loopOn) return;
    loopOn = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && sounding()) startLoop(); });

  function setStatus(msg) { $('status').textContent = msg || ''; }

  // =====================================================================
  // 3D 檢視（three.js，切換到 3D 時才以 import() 動態載入 vendor/three/；場景在 js/resonance-tube-3d.js）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try {
      const cvx = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (cvx.getContext('webgl2') || cvx.getContext('webgl')));
    } catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  /** 3D 場景需要的目前狀態（全部由同一個物理核心算出） */
  function snapshot(tv) {
    const f = freq(), r = radius(), a = amp();
    return {
      L: state.L, f: f, Tc: state.Tc, r: r, d: state.d, src: state.src, amp: a, sounding: sounding(),
      G: C.gain(state.L, f, state.Tc, r), Gref: G_REF, k: 2 * Math.PI * f / C.speedOfSound(state.Tc), e: C.endCorrection(r),
      tVis: tv, visF: VIS_F, showEnv: state.show.env, showParts: state.show.parts,
      bands: state.records.filter(function (rc) { return rc.key === curKey(); }).map(function (rc) { return rc.Lread; }),
      label: (state.src === 'mystery' ? '?' : fmtF(f)) + ' Hz'
    };
  }
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable() || !window.ResonanceTube3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        try {
          stage.classList.add('is3d');
          view3 = window.ResonanceTube3D.create(lib, {
            host: host3, T: T, C: C, tubeLen: C.TUBE_LEN,
            snapshot: function () { return snapshot(tVis); },
            reducedMotion: function () { return reducedMotion; },
            onLost: function () { setView('2d'); viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.'); }
          });
        } catch (err) {
          if (window.console) console.warn('3D view unavailable:', err);
          fail3D();
          return;
        }
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        draw();
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
      $('resetCam').hidden = true;
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resize();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  function updateMeter3() {
    if (!view3) return;
    const el = $('meter3');
    const html = T('相對響度 ', 'Relative loudness ') + '<b>' + (sounding() ? signed(levelShown(), 1) + ' dB' : '—') + '</b>' +
      '<span>' + T('水面 L = ', 'Water L = ') + cm(state.L, 1) + '</span><span>' + (state.src === 'mystery' ? '?' : fmtF(freq())) + ' Hz · ' + num(state.Tc, 1) + ' °C</span>';
    if (el.innerHTML !== html) el.innerHTML = html;
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ---------- 啟動 ----------
  function themeChanged() { readColors(); theoryCache.key = ''; if (view3 && view3.active) view3.onTheme(); draw(); drawGraph2(); buildTable(); updateAnalysis(); updateSourceUI(); setNoisy(state.noisy); updateSoundButton(); }
  readColors();
  readConditions();
  elLev.value = '40';
  $('levo').textContent = num(state.L * 100, 1) + ' cm';
  $('fAppo').textContent = fmtF(state.appF) + ' Hz';
  updateSourceUI();
  setNoisy(false);
  updateSoundButton();
  refreshAll();
  setStatus(T('按「敲音叉」讓音叉振動，再拖曳蓄水桶（或按 ▲▼）移動水面。', 'Press “Strike the fork”, then drag the reservoir (or use ▲▼) to move the water.'));
  window.addEventListener('lab:themechange', themeChanged);
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  const widths = new WeakMap();
  function watch(el, fn) {
    if (window.ResizeObserver) new ResizeObserver(function () { if (el.clientWidth !== widths.get(el)) { widths.set(el, el.clientWidth); fn(); } }).observe(el);
    else window.addEventListener('resize', fn);
  }
  watch(cv, resize);
  watch(gcv, resizeGraph);
  resize();
  resizeGraph();
})();
