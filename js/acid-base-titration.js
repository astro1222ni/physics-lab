/* acid-base-titration.js — 「酸鹼滴定」的畫面與互動（化學計算全部在 acid-base-titration-core.js） */
(function () {
  'use strict';
  const K = window.TitrationCore;
  const LD = window.LabDraw;
  if (!K || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FF = LD.FONT;
  const reduced = LD.reducedMotion();

  // ---------- 固定的數值（畫面說明與「模擬方法」有寫） ----------
  const U = K.UNITS_PER_ML;       // 體積一律記成「半滴」的整數倍：1 單位 = 0.025 mL，一滴 = 2 單位
  const DROP = 2, HALF = 1;
  const VT_MAX = 290;             // 錐形瓶最多裝到 290 mL（250 mL 錐形瓶的錐體部分約 310 mL）
  const MAX_ARCHIVE = 5;          // 圖上最多留 5 條舊曲線
  const STREAM_RATE = 0.6;        // 流速超過 0.6 mL/s 時，液滴連成細流
  const G_PX = 9800;              // 液滴下落的重力加速度（畫面 px/s²；錐形瓶的比例是 12 px/cm，約 1000 px/m）
  const STIR_W = 2 * Math.PI * 2; // 攪拌子每秒 2 轉（畫面效果）
  const SAMPLE_SCALE_ML = 45;     // 指示劑的吸光度以「2 滴指示劑、45 mL 溶液」為準，溶液越多顏色越淡

  // ======================= 格式 =======================
  /** 單位數 → 滴定管讀數字串（取到 0.01 mL，半滴的 0.005 一律進位） */
  function vRead(units) { return (Math.round(units * 2.5) / 100).toFixed(2); }
  function f2(x) { return (Math.abs(x) < 0.005 ? 0 : x).toFixed(2); }
  function signed(x, d) {
    const s = Math.abs(x).toFixed(d);
    if (+s === 0) return '±' + s;
    return (x > 0 ? '+' : '−') + s;
  }
  /** 濃度：三位有效數字 */
  function conc(c) {
    if (!(c > 0) || !isFinite(c)) return '—';
    const d = Math.max(0, Math.min(6, 2 - Math.floor(Math.log10(c) + 1e-9)));
    return c.toFixed(d);
  }
  function roundSig(v, n) {
    if (!(v > 0)) return v;
    const p = Math.pow(10, n - 1 - Math.floor(Math.log10(v)));
    return Math.round(v * p) / p;
  }
  /** 科學記號（HTML，上標用 <sup>） */
  function sciHTML(x, n) {
    if (!(x > 0) || !isFinite(x)) return '0';
    let e = Math.floor(Math.log10(x));
    let m = x / Math.pow(10, e);
    if (+m.toFixed(n - 1) >= 10) { m /= 10; e += 1; }
    return m.toFixed(n - 1) + ' × 10<sup>' + (e < 0 ? '−' : '') + Math.abs(e) + '</sup>';
  }
  /** 化學式加下標：CH3COOH → CH<sub>3</sub>COOH */
  function chemHTML(f) { return f.replace(/([A-Za-z)])(\d+)/g, '$1<sub>$2</sub>'); }

  // ======================= 名稱 =======================
  const SYS = {
    sa: { name: ['鹽酸', 'hydrochloric acid'], f: 'HCl', kind: ['強酸', 'strong acid'] },
    wa: { name: ['醋酸', 'acetic acid'], f: 'CH3COOH', kind: ['弱酸', 'weak acid'] },
    wb: { name: ['氨水', 'ammonia solution'], f: 'NH3', kind: ['弱鹼', 'weak base'] },
    mx: { name: ['未知弱酸', 'unknown weak acid'], f: 'HX', kind: ['弱酸', 'weak acid'] }
  };
  function sysName(sys) { return T(SYS[sys].name[0], SYS[sys].name[1]); }
  function titrant(sys) { return K.SYSTEMS[sys].titrant; }
  function indName(ind) {
    const I = K.INDICATORS[ind];
    return I ? T(I.zh, I.en) : T('沒有指示劑', 'no indicator');
  }
  /** 溶液顏色的名稱（依指示劑鹼型所占的比例） */
  function colourName(ind, fb) {
    const I = K.INDICATORS[ind];
    if (!I) return T('無色', 'colourless');
    // 顏色名稱的分界跟著課本的變色範圍 lo–hi 走（換算成鹼型比例）
    const fLo = K.indicatorFraction(ind, I.lo), fHi = K.indicatorFraction(ind, I.hi);
    if (ind === 'php') {
      if (fb < fLo) return T('無色', 'colourless');
      if (fb < 0.5) return T('淡粉紅', 'pale pink');
      return T('粉紅', 'pink');
    }
    if (fb < fLo) return T(I.acidName[0], I.acidName[1]);
    if (fb > fHi) return T(I.baseName[0], I.baseName[1]);
    const mid = { mo: ['橙', 'orange'], mr: ['橙', 'orange'], btb: ['綠', 'green'] }[ind];
    return T(mid[0], mid[1]);
  }

  // ======================= 狀態 =======================
  const state = {
    sys: 'sa', Ca: 0.1, Va: 25, Vw: 0, Cb: 0.1, ind: 'php', meter: true, rate: 0.5,
    theory: false, deriv: false,
    tap: false, cock: 0, acc: 0, streamSnd: 0,   // 活栓：開著、手把轉到的角度比例（0 關、1 開）、累積流出的單位
    run: null, archive: [], flaskNo: 0,
    sample: null, sampleNo: 0,
    drops: [], plumes: [], ripples: [], flash: 0, flashCol: null, tag: null,
    pendingSettle: false, stir: 0
  };

  function newSample() {
    const s = K.mysterySample();
    state.sample = { C: s.C, Ka: s.Ka, flasks: 0, revealed: false, no: ++state.sampleNo };
  }
  function params() {
    const mx = state.sys === 'mx';
    const q = { sys: state.sys, Ca: mx ? state.sample.C : state.Ca, Va: state.Va, Vw: state.Vw, Cb: state.Cb };
    if (mx) q.Ka = state.sample.Ka;
    return K.setup(q);
  }
  /** 換一瓶（或改了待測液、滴定液的設定）：舊的有加過滴定液就留在圖上（最多 5 條）；滴定管重新裝滿到 0.00 mL */
  function newRun(keepOld) {
    const r = state.run;
    if (keepOld !== false && r && r.u > 0) {
      state.archive.unshift(r);
      if (state.archive.length > MAX_ARCHIVE) state.archive.pop();
    }
    const p = params();
    const ph0 = K.pH(p, 0);
    state.run = {
      p: p, no: 0, u: 0, out: 0, fill: 0, pH: ph0, pH0: ph0, Veq: K.Veq(p), pHeq: K.pHeq(p),
      ind: state.ind, indFixed: true, meterUsed: false, endpoint: null, changedAt: null, hinted: false,
      pts: [{ u: 0, pH: ph0, m: state.meter }],
      rows: [{ u: 0, pH: state.meter ? ph0 : null, fb: K.indicatorFraction(state.ind, ph0) }],
      sample: state.sys === 'mx' ? state.sample : null, counted: false
    };
    state.drops = []; state.plumes = []; state.ripples = [];
    state.tap = false; state.acc = 0; state.pendingSettle = false;
    state.run.changedAt = null;
    updateButtons();
  }
  const mysteryHidden = function () { return state.run.p.sys === 'mx' && !state.sample.revealed; };

  // ======================= 色彩 =======================
  let C = {};
  function readColors() {
    LD.refresh();
    const cs = getComputedStyle(document.documentElement);
    C = Object.assign({}, LD.c);
    C.chem = cs.getPropertyValue('--b-acidbase').trim() || C.pos;
    C.unknown = cs.getPropertyValue('--b-matter').trim() || C.chem;   // 未知弱酸的曲線：紫色（和鹽酸、醋酸、氨水的藍、紅、綠分得開）
    C.dark = LD.dark;
    // 器材的顏色都由色彩代號調出來（深淺色模式各自調整）
    C.bench = C.dark ? LD.mix(C.surface, C.text, 0.07) : LD.mix(C.surface, C.muted, 0.15);
    C.metal = C.dark ? LD.mix(C.muted, C.text, 0.3) : LD.mix(C.muted, C.surface, 0.3);
    C.metalDark = LD.shade(C.metal, -0.35);
    C.iron = C.dark ? LD.mix(C.surface, C.text, 0.2) : LD.mix(C.text, C.surface, 0.22);
    C.housing = C.dark ? LD.mix(C.surface, C.text, 0.14) : LD.mix(C.surface, C.muted, 0.09);
    C.glassEdge = C.dark ? LD.alpha(C.text, 0.5) : LD.alpha(C.field, 0.5);
    C.glassTint = C.dark ? LD.alpha(C.text, 0.06) : LD.alpha(C.neg, 0.05);
    // 白光穿過無色溶液（錐形瓶下墊白紙）看到的底色；指示劑的顏色再乘上穿透率
    C.water = C.dark ? LD.mix(C.text, C.neg, 0.08) : LD.mix(C.surface, C.neg, 0.06);
    C.titrant = C.dark ? LD.mix(C.neg, C.text, 0.6) : LD.mix(C.neg, C.surface, 0.72);
    C.paper = C.dark ? LD.mix(C.text, C.surface, 0.14) : C.surface;
    C.ptfe = C.dark ? LD.mix(C.text, C.surface, 0.06) : LD.mix(C.surface, C.muted, 0.1);
    C.lcd = C.dark ? LD.shade(C['canvas-bg'], -0.4) : LD.shade(C.field, -0.55);
    C.lcdInk = C.dark ? C.probe : LD.shade(C.probe, 0.35);
    C.sys = { sa: C.neg, wa: C.pos, wb: C.probe, mx: C.unknown };
  }
  /** 溶液（或滴落處）的顏色 [r, g, b]：底色 × 指示劑的穿透率（比爾定律，核心算） */
  function liquidRGB(ind, ph, Vt) {
    const w = LD.rgb(C.water);
    if (!K.INDICATORS[ind]) return w;
    const scale = Math.max(0.3, Math.min(1.4, SAMPLE_SCALE_ML / Vt));
    const t = K.indicatorRGB(ind, ph, scale);
    return [0, 1, 2].map(function (i) { return Math.round(w[i] * t[i] / 255); });
  }
  const rgbStr = function (c, a) { return a == null ? 'rgb(' + c.join(',') + ')' : 'rgba(' + c.join(',') + ',' + a + ')'; };

  // ======================= 錐形瓶的形狀（真實 250 mL 錐形瓶） =======================
  const FL = { Rb: 4.25, Rn: 1.7, Hc: 10.5, Hn: 3.0, px: 12, k: 0.2 }; // cm；畫面 12 px/cm；k = 俯視橢圓的扁度
  function volAt(y) { // 液面高 y cm 時的體積（mL）
    if (y <= FL.Hc) { const r = FL.Rb - (FL.Rb - FL.Rn) * y / FL.Hc; return Math.PI / 3 * y * (FL.Rb * FL.Rb + FL.Rb * r + r * r); }
    return volAt(FL.Hc) + Math.PI * FL.Rn * FL.Rn * (y - FL.Hc);
  }
  const hCache = new Map();
  /** 體積 → 液面高（畫面 px） */
  function hPx(V) {
    const key = Math.round(V * 40);
    let h = hCache.get(key);
    if (h == null) {
      let lo = 0, hi = FL.Hc + FL.Hn;
      for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (volAt(m) < V) lo = m; else hi = m; }
      h = (lo + hi) / 2 * FL.px;
      if (hCache.size > 4000) hCache.clear();
      hCache.set(key, h);
    }
    return h;
  }
  function rAt(h) { // 高 h px 處的瓶內半徑（px）
    const Hc = FL.Hc * FL.px;
    return h <= Hc ? (FL.Rb - (FL.Rb - FL.Rn) * h / Hc / 1) * FL.px - 0 : FL.Rn * FL.px;
  }

  // ======================= 版面（設計座標，依寬度等比縮放；文字不縮放） =======================
  const LAY = {
    // 寬版：放大鏡的把手到 pH 計左右各留約 78，整組器材置中
    wide: { W: 820, H: 524, rod: 280, base: [254, 528], xb: 388, stirHalf: 78,
      mag: [166, 156, 76], meter: [586, 384, 742, 494], post: 598, bottle: [526, 404, 570, 494], strip: 1 },
    narrow: { W: 370, H: 540, rod: 118, base: [100, 290], xb: 200, stirHalf: 64,
      mag: [60, 116, 52], meter: [294, 410, 366, 494], post: 304, bottle: [267, 412, 291, 494], strip: 2 }
  };
  // 兩種版面共用的垂直位置
  const VY = { top: 16, y0: 40, y50: 240, tubeEnd: 250, cock: 262, tip: 298, by: 436, stirTop: 446, plate: 480, bench: 494, clamp: 108, arm: 178 };
  const MLPX = (VY.y50 - VY.y0) / 50;   // 滴定管：每 mL 4 px（未依比例）

  const cv = $('cv'), ctx = cv.getContext('2d');
  const stat = document.createElement('canvas'), sctx = stat.getContext('2d');
  const front = document.createElement('canvas'), fctx = front.getContext('2d');   // 不會變的玻璃、刻度與數字（畫在液體與電極前面）
  let L = null;

  function resizeBench() {
    const W = cv.clientWidth;
    if (!W) return;
    const D = W >= 600 ? LAY.wide : LAY.narrow;
    const s = W / D.W, H = Math.round(D.H * s);
    if (cv.style.height !== H + 'px') cv.style.height = H + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    [cv, stat, front].forEach(function (c) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
    L = Object.assign({}, D, { s: s, Wpx: W, Hpx: H, dpr: dpr, wide: D === LAY.wide });
    buildStatic();
  }

  // ---------- 錐形瓶的路徑 ----------
  function flaskDims() {
    const cx = L.xb, by = VY.by, Rb = FL.Rb * FL.px, Rn = FL.Rn * FL.px, Hc = FL.Hc * FL.px, Hn = FL.Hn * FL.px;
    return { cx: cx, by: by, Rb: Rb, Rn: Rn, Hc: Hc, Hn: Hn, ys: by - Hc, yn: by - Hc - Hn, k: FL.k };
  }
  function flaskOutline(g, F) {
    g.beginPath();
    g.moveTo(F.cx - F.Rb, F.by);
    g.lineTo(F.cx - F.Rn - 2.5, F.ys + 6);
    g.quadraticCurveTo(F.cx - F.Rn, F.ys + 1, F.cx - F.Rn, F.ys - 5);
    g.lineTo(F.cx - F.Rn, F.yn + 3);
    g.quadraticCurveTo(F.cx - F.Rn, F.yn, F.cx - F.Rn - 3, F.yn);
    g.lineTo(F.cx + F.Rn + 3, F.yn);
    g.quadraticCurveTo(F.cx + F.Rn, F.yn, F.cx + F.Rn, F.yn + 3);
    g.lineTo(F.cx + F.Rn, F.ys - 5);
    g.quadraticCurveTo(F.cx + F.Rn, F.ys + 1, F.cx + F.Rn + 2.5, F.ys + 6);
    g.lineTo(F.cx + F.Rb, F.by);
    g.ellipse(F.cx, F.by, F.Rb, F.k * F.Rb, 0, 0, Math.PI, false);
    g.closePath();
  }

  // ======================= 靜態圖層（版面、顏色改變時才重畫） =======================
  function buildStatic() {
    const g = sctx, s = L.s;
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    LD.backdrop(g, L.Wpx, L.Hpx);
    g.setTransform(L.dpr * s, 0, 0, L.dpr * s, 0, 0);
    const W = L.W, H = L.H;
    // 實驗桌
    const bg = g.createLinearGradient(0, VY.bench, 0, H);
    bg.addColorStop(0, LD.shade(C.bench, C.dark ? 0.06 : 0.04));
    bg.addColorStop(1, LD.shade(C.bench, C.dark ? -0.25 : -0.1));
    g.fillStyle = bg; g.fillRect(0, VY.bench, W, H - VY.bench);
    g.fillStyle = LD.alpha(LD.shade(C.bench, 0.5), 0.6); g.fillRect(0, VY.bench, W, 1);
    const sh = g.createLinearGradient(0, VY.bench - 14, 0, VY.bench);
    sh.addColorStop(0, LD.shadowInk(0)); sh.addColorStop(1, LD.shadowInk(C.dark ? 0.18 : 0.06));
    g.fillStyle = sh; g.fillRect(0, VY.bench - 14, W, 14);

    // 鐵架：底座、支柱
    LD.contactShadow(g, (L.base[0] + L.base[1]) / 2, VY.bench, (L.base[1] - L.base[0]) / 2, 0);
    LD.block(g, L.base[0], VY.plate, L.base[1] - L.base[0], VY.bench - VY.plate, C.iron, { r: 3 });
    LD.tube(g, function (c) { c.moveTo(L.rod, VY.plate); c.lineTo(L.rod, 22); }, C.metal, 9);
    LD.ball(g, L.rod, 21, 5, C.metal, { shadow: false, glow: 0 });
    // 滴定管夾：夾座與橫桿（夾爪在滴定管前面，每一幀畫）
    LD.tube(g, function (c) { c.moveTo(L.rod + 6, VY.clamp); c.lineTo(L.xb - 13, VY.clamp); }, C.metal, 5);
    LD.block(g, L.rod - 9, VY.clamp - 9, 18, 18, C.metalDark, { r: 3 });
    LD.ball(g, L.rod - 13, VY.clamp, 4.5, C.metalDark, { shadow: false, glow: 0 });

    // 磁石攪拌器（頂板上墊白紙）
    const sx0 = L.xb - L.stirHalf, sx1 = L.xb + L.stirHalf;
    LD.block(g, sx0, VY.stirTop + 3, sx1 - sx0, VY.plate - VY.stirTop - 3, C.housing, { r: 6 });
    LD.block(g, sx0 + 3, VY.stirTop - 1, sx1 - sx0 - 6, 6, LD.mix(C.housing, C.surface, 0.5), { r: 2, shadow: false });
    g.fillStyle = C.paper;
    g.beginPath(); g.moveTo(L.xb - FL.Rb * FL.px - 12, VY.stirTop - 1.5); g.lineTo(L.xb + FL.Rb * FL.px + 14, VY.stirTop - 2); g.lineTo(L.xb + FL.Rb * FL.px + 10, VY.stirTop + 1.5); g.lineTo(L.xb - FL.Rb * FL.px - 14, VY.stirTop + 1.5); g.closePath(); g.fill();
    g.strokeStyle = LD.alpha(C.text, 0.12); g.lineWidth = 0.6; g.stroke();
    LD.ball(g, sx0 + 20, VY.plate - 13, 7, LD.mix(C.housing, C.text, 0.35), { shadow: false, glow: 0 });   // 轉速旋鈕
    g.strokeStyle = LD.alpha(C.text, 0.35); g.lineWidth = 1;
    g.beginPath(); g.arc(sx0 + 20, VY.plate - 13, 10.5, Math.PI * 0.8, Math.PI * 2.2); g.stroke();
    LD.ball(g, sx1 - 16, VY.plate - 13, 2.6, C.probe, { shadow: false, glow: 0.6 });                      // 運轉指示燈
    g.fillStyle = LD.alpha(C.text, 0.12); g.fillRect(sx0 + 40, VY.plate - 15, sx1 - sx0 - 70, 3);

    // 錐形瓶：瓶後的玻璃與底部的後半圈（液體、前面的玻璃每一幀畫）
    const F = flaskDims();
    LD.contactShadow(g, F.cx, VY.stirTop, F.Rb, 0);
    flaskOutline(g, F);
    const fg = g.createLinearGradient(F.cx - F.Rb, 0, F.cx + F.Rb, 0);
    fg.addColorStop(0, LD.alpha(C.text, C.dark ? 0.06 : 0.035));
    fg.addColorStop(0.5, C.glassTint);
    fg.addColorStop(1, LD.alpha(C.text, C.dark ? 0.08 : 0.05));
    g.fillStyle = fg; g.fill();
    g.strokeStyle = LD.alpha(C.text, C.dark ? 0.16 : 0.12); g.lineWidth = 1;
    g.beginPath(); g.ellipse(F.cx, F.by, F.Rb - 1, F.k * (F.Rb - 1), 0, Math.PI, Math.PI * 2, false); g.stroke();

    // 滴定管的玻璃管（後面）
    const xb = L.xb;
    const tg = g.createLinearGradient(xb - 10, 0, xb + 10, 0);
    tg.addColorStop(0, LD.alpha(C.text, C.dark ? 0.12 : 0.08));
    tg.addColorStop(0.5, C.glassTint);
    tg.addColorStop(1, LD.alpha(C.text, C.dark ? 0.14 : 0.1));
    g.fillStyle = tg;
    g.beginPath(); g.moveTo(xb - 12, VY.top); g.lineTo(xb - 10, VY.top + 5); g.lineTo(xb - 10, VY.tubeEnd); g.lineTo(xb + 10, VY.tubeEnd); g.lineTo(xb + 10, VY.top + 5); g.lineTo(xb + 12, VY.top); g.closePath(); g.fill();

    // pH 計本體、電極支架的立柱、保存瓶
    const M = L.meter;
    LD.contactShadow(g, (M[0] + M[2]) / 2, VY.bench, (M[2] - M[0]) / 2, 0);
    LD.block(g, M[0], M[1], M[2] - M[0], M[3] - M[1], C.housing, { r: 8 });
    const lc = lcdRect();
    LD.roundRect(g, lc.x - 4, lc.y - 4, lc.w + 8, lc.h + 8, 5);
    g.fillStyle = LD.mix(C.housing, C.text, C.dark ? 0.25 : 0.4); g.fill();
    const bw = (M[2] - M[0] - 24) / 3, byy = lc.y + lc.h + (L.wide ? 14 : 9), bh = L.wide ? 14 : 10;
    for (let i = 0; i < 3; i++) LD.block(g, M[0] + 8 + i * (bw + 4), byy, bw, bh, LD.mix(C.housing, i === 2 ? C.accent : C.text, C.dark ? 0.3 : 0.18), { r: 3, shadow: false });
    LD.tube(g, function (c) { c.moveTo(L.post, M[1] + 2); c.lineTo(L.post, VY.arm - 4); }, C.metal, 7);
    LD.block(g, L.post - 7, M[1] - 4, 14, 8, C.metalDark, { r: 2, shadow: false });
    const b = L.bottle;
    LD.contactShadow(g, (b[0] + b[2]) / 2, b[3], (b[2] - b[0]) / 2, 0);
    g.fillStyle = LD.alpha(C.text, C.dark ? 0.08 : 0.05);
    LD.roundRect(g, b[0], b[1], b[2] - b[0], b[3] - b[1], 4); g.fill();
    g.fillStyle = LD.alpha(C.neg, C.dark ? 0.18 : 0.12);                      // 保存液（3 M KCl）
    LD.roundRect(g, b[0] + 2, b[1] + (b[3] - b[1]) * 0.35, b[2] - b[0] - 4, (b[3] - b[1]) * 0.65 - 2, 3); g.fill();
    // 放大鏡的把手與陰影（鏡片裡面每一幀畫）
    const mx = L.mag[0], my = L.mag[1], R = L.mag[2];
    LD.tube(g, function (c) { c.moveTo(mx - (R + 4) * 0.707, my + (R + 4) * 0.707); c.lineTo(mx - (R + 4 + R * 0.5) * 0.707, my + (R + 4 + R * 0.5) * 0.707); }, C.iron, Math.max(7, R * 0.13));
    g.save();
    g.shadowColor = LD.shadowInk(C.dark ? 0.5 : 0.25); g.shadowBlur = 10; g.shadowOffsetY = 3;
    g.fillStyle = C['canvas-bg'];
    g.beginPath(); g.arc(mx, my, R + 3, 0, Math.PI * 2); g.fill();
    g.restore();
    buildFront();
  }

  /** 前景靜態圖層：滴定管的玻璃與刻度、活栓的玻璃座、管夾的夾爪、錐形瓶前面的玻璃與刻度、保存杯、數字 */
  function buildFront() {
    const g = fctx, s = L.s;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, front.width, front.height);
    g.setTransform(L.dpr * s, 0, 0, L.dpr * s, 0, 0);
    drawBuretteGlass(g);
    drawFlaskFront(g);
    drawBottleFront(g);
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    // 滴定管的數字（每 5 mL）
    for (let i = 0; i <= 50; i += 5) {
      LD.haloText(g, String(i), (L.xb - 12) * s, (VY.y0 + i * MLPX) * s, LD.alpha(C.text, 0.85), 'right', 'middle', (i % 10 ? '' : '600 ') + '10px ' + FF);
    }
    // 錐形瓶的刻度數字
    const F = flaskDims();
    [100, 200].forEach(function (V) {
      const h = hPx(V), rr = rAt(h), y = F.by - h + F.k * rr * Math.sin(Math.PI * 0.62);
      LD.haloText(g, String(V), (F.cx + rr * Math.cos(Math.PI * 0.62) + 3) * s, (y + 1) * s, LD.alpha(C.text, 0.6), 'left', 'middle', '9px ' + FF);
    });
  }

  // ======================= 每一幀的畫面 =======================
  function lcdRect() {
    const M = L.meter, m = L.wide ? 16 : 8;
    return { x: M[0] + m, y: M[1] + (L.wide ? 16 : 10), w: M[2] - M[0] - 2 * m, h: L.wide ? 40 : 26 };
  }
  function electrodeGeom() {
    const len = VY.by - 3 - (VY.arm + 10);
    if (state.meter) return { x0: L.xb + 17, y0: VY.arm + 10, x1: L.xb + 13, y1: VY.by - 3, inFlask: true, armY: VY.arm };
    const b = L.bottle, x = (b[0] + b[2]) / 2, y1 = b[3] - 7;
    return { x0: x, y0: y1 - len, x1: x, y1: y1, inFlask: false, armY: y1 - len - 10 };
  }
  function vtLanded() { const r = state.run; return r.p.Va + r.p.Vw + r.u / U; }
  function surfaceY() { return VY.by - hPx(vtLanded()); }

  function drawArmAndCable(g) {
    const e = electrodeGeom(), M = L.meter;
    // 電纜：電極頂端 → pH 計
    const jx = M[0] + 12, jy = M[1] + 4;
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = LD.shade(C.iron, -0.2); g.lineWidth = 3.2;
    g.beginPath(); g.moveTo(e.x0, e.y0 - 26);
    g.bezierCurveTo(e.x0, e.y0 - 70, jx - 30, jy - 120, jx, jy);
    g.stroke();
    g.strokeStyle = LD.alpha(LD.shade(C.iron, 0.5), 0.5); g.lineWidth = 1;
    g.beginPath(); g.moveTo(e.x0 - 0.8, e.y0 - 26);
    g.bezierCurveTo(e.x0 - 0.8, e.y0 - 70, jx - 31, jy - 121, jx - 0.8, jy);
    g.stroke();
    g.restore();
    // 支架橫桿與電極夾
    LD.tube(g, function (c) { c.moveTo(L.post, e.armY); c.lineTo(e.x0 + 7, e.armY); }, C.metal, 5);
    LD.ball(g, L.post, e.armY, 5, C.metalDark, { shadow: false, glow: 0 });
  }

  function drawElectrode(g, e) {
    const ang = Math.atan2(e.x1 - e.x0, e.y1 - e.y0), len = Math.hypot(e.x1 - e.x0, e.y1 - e.y0);
    g.save();
    g.translate(e.x0, e.y0);
    g.rotate(-ang);
    // 玻璃管身
    const gg = g.createLinearGradient(-3.4, 0, 3.4, 0);
    gg.addColorStop(0, LD.alpha(C.text, C.dark ? 0.35 : 0.28));
    gg.addColorStop(0.35, LD.alpha(C.surface, 0.55));
    gg.addColorStop(1, LD.alpha(C.text, C.dark ? 0.4 : 0.32));
    g.fillStyle = gg;
    LD.roundRect(g, -3.3, 0, 6.6, len - 5, 2); g.fill();
    g.strokeStyle = C.glassEdge; g.lineWidth = 0.7; g.stroke();
    g.strokeStyle = LD.alpha(C.text, 0.45); g.lineWidth = 0.8;            // 內部的參考電極
    g.beginPath(); g.moveTo(0, 2); g.lineTo(0, len - 9); g.stroke();
    // 玻璃球（感測膜）
    const bg = g.createRadialGradient(-1.2, len - 4.2, 0.5, 0, len - 3, 4.3);
    bg.addColorStop(0, LD.alpha(C.surface, 0.9));
    bg.addColorStop(1, LD.alpha(C.neg, C.dark ? 0.45 : 0.32));
    g.fillStyle = bg;
    g.beginPath(); g.arc(0, len - 3.5, 4.2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = C.glassEdge; g.lineWidth = 0.7; g.stroke();
    // 塑膠頭與標示環
    LD.block(g, -4.6, -26, 9.2, 26, C.iron, { r: 2.5, shadow: false });
    g.fillStyle = LD.alpha(C.accent, 0.8); g.fillRect(-4.6, -9, 9.2, 2.5);
    g.restore();
    // 電極夾
    LD.block(g, e.x0 - 7, e.armY - 5, 14, 10, C.metalDark, { r: 2, shadow: false });
  }

  function drawBuretteLiquid(g) {
    const r = state.run, xb = L.xb, ym = VY.y0 + r.fill / U * MLPX;
    // 滴定液（無色）：彎月面以下到尖端
    const liq = LD.alpha(C.titrant, C.dark ? 0.55 : 0.75);
    g.fillStyle = liq;
    g.beginPath();
    g.moveTo(xb - 7.5, ym - 2.2);
    g.quadraticCurveTo(xb, ym + 2.2, xb + 7.5, ym - 2.2);
    g.lineTo(xb + 7.5, VY.tubeEnd + 2); g.lineTo(xb + 3, VY.cock - 6); g.lineTo(xb + 3, VY.cock + 8);
    g.lineTo(xb + 1.4, VY.tip - 1); g.lineTo(xb - 1.4, VY.tip - 1); g.lineTo(xb - 3, VY.cock + 8); g.lineTo(xb - 3, VY.cock - 6);
    g.lineTo(xb - 7.5, VY.tubeEnd + 2);
    g.closePath(); g.fill();
    // 彎月面：看起來是一條暗線（讀數讀最低點）
    g.strokeStyle = LD.alpha(C.text, C.dark ? 0.7 : 0.6); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(xb - 7.5, ym - 2.2); g.quadraticCurveTo(xb, ym + 2.2, xb + 7.5, ym - 2.2); g.stroke();
    g.strokeStyle = LD.alpha(C.surface, 0.5); g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(xb - 7, ym - 0.4); g.quadraticCurveTo(xb, ym + 3.6, xb + 7, ym - 0.4); g.stroke();
  }

  function drawBuretteGlass(g) {
    const xb = L.xb;
    // 玻璃管的邊與高光
    g.strokeStyle = C.glassEdge; g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(xb - 12, VY.top); g.lineTo(xb - 10, VY.top + 5); g.lineTo(xb - 10, VY.tubeEnd); g.quadraticCurveTo(xb - 10, VY.cock - 8, xb - 4.5, VY.cock - 7);
    g.moveTo(xb + 12, VY.top); g.lineTo(xb + 10, VY.top + 5); g.lineTo(xb + 10, VY.tubeEnd); g.quadraticCurveTo(xb + 10, VY.cock - 8, xb + 4.5, VY.cock - 7);
    g.stroke();
    g.fillStyle = LD.alpha(C.surface, C.dark ? 0.25 : 0.7); g.fillRect(xb - 7.5, VY.top + 6, 1.8, VY.tubeEnd - VY.top - 10);
    g.fillStyle = LD.alpha(C.surface, C.dark ? 0.12 : 0.35); g.fillRect(xb + 5, VY.top + 6, 1, VY.tubeEnd - VY.top - 10);
    // 刻度（每 1 mL 一條；每 5 mL 長一點；數字在文字層）
    g.strokeStyle = LD.alpha(C.text, C.dark ? 0.75 : 0.7);
    g.beginPath();
    for (let i = 0; i <= 50; i++) {
      const y = VY.y0 + i * MLPX, len = i % 10 === 0 ? 11 : i % 5 === 0 ? 8 : 4.5;
      g.moveTo(xb - 9, y); g.lineTo(xb - 9 + len, y);
    }
    g.lineWidth = 0.7; g.stroke();
    // 尖端
    g.fillStyle = LD.alpha(C.text, C.dark ? 0.12 : 0.07);
    g.beginPath(); g.moveTo(xb - 4, VY.cock + 7); g.lineTo(xb - 1.8, VY.tip); g.lineTo(xb + 1.8, VY.tip); g.lineTo(xb + 4, VY.cock + 7); g.closePath(); g.fill();
    g.strokeStyle = C.glassEdge; g.lineWidth = 0.9; g.stroke();
    // 活栓：玻璃座、鐵弗龍栓與手把（關：手把橫放；開：手把與管子平行）
    LD.roundRect(g, xb - 11, VY.cock - 7, 22, 14, 6);
    const cg = g.createLinearGradient(0, VY.cock - 7, 0, VY.cock + 7);
    cg.addColorStop(0, LD.alpha(C.surface, 0.6)); cg.addColorStop(1, LD.alpha(C.text, C.dark ? 0.25 : 0.18));
    g.fillStyle = cg; g.fill();
    g.strokeStyle = C.glassEdge; g.lineWidth = 1; g.stroke();
    // 滴定管夾的夾爪（在管子前面）
    LD.block(g, xb - 15, VY.clamp - 9, 6, 18, C.iron, { r: 2, shadow: false });
    LD.block(g, xb + 9, VY.clamp - 9, 6, 18, C.iron, { r: 2, shadow: false });
  }
  /** 活栓的手把：關著時橫放，打開時轉到與管子平行 */
  function drawCockHandle(g) {
    const xb = L.xb;
    g.save();
    g.translate(xb, VY.cock); g.rotate(-state.cock * Math.PI / 2);
    LD.block(g, 2, -3.2, 20, 6.4, C.ptfe, { r: 3, shadow: false, stroke: LD.alpha(C.text, 0.35) });
    g.restore();
    LD.ball(g, xb, VY.cock, 4.6, C.ptfe, { shadow: false, glow: 0, ring: LD.alpha(C.text, 0.4) });
  }

  function dropRadius(n) { return n >= DROP ? 2.7 : 2.15; } // 0.05 mL 的液滴直徑約 4.6 mm（畫面 12 px/cm）

  function drawHangingAndDrops(g) {
    const xb = L.xb, ys = surfaceY();
    // 細流
    if (state.tap && state.rate > STREAM_RATE && !reduced) {
      const w = 0.9 + 1.3 * (state.rate - STREAM_RATE) / (2 - STREAM_RATE), t = performance.now() / 1000;
      g.save(); g.lineCap = 'round';
      g.strokeStyle = LD.alpha(C.titrant, C.dark ? 0.75 : 0.95); g.lineWidth = w;
      g.beginPath(); g.moveTo(xb, VY.tip);
      for (let y = VY.tip; y <= ys; y += 6) g.lineTo(xb + 0.5 * Math.sin(y * 0.35 - t * 20) * (y - VY.tip) / 60, y);
      g.lineTo(xb, ys); g.stroke();
      g.strokeStyle = LD.alpha(C.surface, 0.6); g.lineWidth = Math.max(0.4, w * 0.3);
      g.beginPath(); g.moveTo(xb - w * 0.2, VY.tip + 2); g.lineTo(xb - w * 0.2, ys - 2); g.stroke();
      g.restore();
    } else if (state.tap) {
      // 尖端正在長大的液滴
      const rr = Math.round(dropRadius(DROP) * Math.cbrt(Math.max(0.05, Math.min(1, state.acc / DROP))) * 4) / 4;
      LD.ball(g, xb, VY.tip + rr * 0.85, rr, C.titrant, { shadow: false, glow: 0 });
    }
    state.drops.forEach(function (d) {
      const R = dropRadius(d.n);
      if (d.phase === 'grow') {
        const rr = Math.round(R * Math.cbrt(Math.max(0.08, d.t / d.growT)) * 4) / 4;
        LD.ball(g, xb, VY.tip + rr * 0.85, rr, C.titrant, { shadow: false, glow: 0 });
      } else if (!(state.tap && state.rate > STREAM_RATE)) {
        LD.ball(g, xb, d.y, R, C.titrant, { shadow: false, glow: 0 });
      }
    });
  }

  function drawFlask(g) {
    const r = state.run, F = flaskDims(), Vt = vtLanded(), h = hPx(Vt), rs = rAt(h), ys = F.by - h;
    const col = liquidRGB(state.ind, r.pH, Vt);
    // ---- 液體的側面（透過前面的玻璃看到）----
    g.save();
    g.beginPath();
    g.moveTo(F.cx - F.Rb + 1, F.by);
    g.ellipse(F.cx, F.by, F.Rb - 1, F.k * (F.Rb - 1), 0, Math.PI, 0, true);
    g.lineTo(F.cx + rs - 1, ys);
    g.ellipse(F.cx, ys, rs - 1, F.k * (rs - 1), 0, 0, Math.PI, false);
    g.closePath();
    const sg = g.createLinearGradient(F.cx - F.Rb, 0, F.cx + F.Rb, 0);
    sg.addColorStop(0, rgbStr(LD.rgb(LD.shade(rgbStr(col), -0.2)), 0.92));
    sg.addColorStop(0.45, rgbStr(col, 0.9));
    sg.addColorStop(1, rgbStr(LD.rgb(LD.shade(rgbStr(col), -0.28)), 0.92));
    g.fillStyle = sg; g.fill();
    g.restore();
    // ---- 攪拌子（鐵弗龍外殼，在瓶底轉）----
    const th = state.stir, Lb = 13, hb = 4;
    const ex = Lb * Math.cos(th), ey = F.k * Lb * Math.sin(th);
    g.save(); g.lineCap = 'round';
    g.strokeStyle = LD.mix(C.ptfe, rgbStr(col), 0.35); g.lineWidth = 6;
    g.beginPath(); g.moveTo(F.cx - ex, F.by - hb - ey); g.lineTo(F.cx + ex, F.by - hb + ey); g.stroke();
    g.strokeStyle = LD.alpha(C.surface, 0.55); g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(F.cx - ex * 0.8, F.by - hb - 1.6 - ey * 0.8); g.lineTo(F.cx + ex * 0.8, F.by - hb - 1.6 + ey * 0.8); g.stroke();
    g.restore();
    // ---- 液面（略俯視的橢圓）----
    const top = LD.mix(rgbStr(col), C.dark ? C.text : C.surface, 0.18);
    g.fillStyle = LD.alpha(top, 0.8);
    g.beginPath(); g.ellipse(F.cx, ys, rs - 1, F.k * (rs - 1), 0, 0, Math.PI * 2); g.fill();
    // 攪拌造成的漩渦與滴落處的顏色
    g.save();
    g.beginPath(); g.ellipse(F.cx, ys, rs - 1.5, F.k * (rs - 1.5), 0, 0, Math.PI * 2); g.clip();
    state.plumes.forEach(function (pl) {
      const u = pl.t / pl.life, fade = 1 - u;
      for (let j = 0; j < 5; j++) {
        const rad = (rs - 4) * Math.min(1, Math.pow(u, 0.55)) * (0.25 + 0.75 * j / 4);
        const ang = pl.a0 + state.stir * 0.35 - j * 0.6;
        const px = F.cx + rad * Math.cos(ang), py = ys + F.k * rad * Math.sin(ang);
        const bw = 5 + 9 * u + 2 * j;
        g.fillStyle = rgbStr(pl.rgb, 0.55 * fade * (1 - j * 0.12));
        g.beginPath(); g.ellipse(px, py, bw, bw * F.k * 1.4, 0, 0, Math.PI * 2); g.fill();
      }
    });
    const vr = Math.min(rs * 0.3, 13);
    g.fillStyle = LD.alpha(LD.shade(rgbStr(col), -0.35), 0.35);
    g.beginPath(); g.ellipse(F.cx, ys + 0.6, vr, vr * F.k * 0.9, 0, 0, Math.PI * 2); g.fill();
    if (!reduced) {
      g.strokeStyle = LD.alpha(C.surface, C.dark ? 0.2 : 0.45); g.lineWidth = 0.8;
      for (let j = 0; j < 2; j++) {
        const rr = rs * (0.45 + 0.25 * j), a0 = state.stir * 0.5 + j * Math.PI;
        g.beginPath(); g.ellipse(F.cx, ys, rr, rr * F.k, 0, a0, a0 + 1.1); g.stroke();
      }
    }
    if (state.flash > 0) {
      g.fillStyle = LD.alpha(state.flashCol || C.surface, 0.45 * state.flash);
      g.fillRect(F.cx - rs, ys - F.k * rs, 2 * rs, 2 * F.k * rs);
    }
    g.restore();
    state.ripples.forEach(function (rp) {
      const u = rp.t / 0.35, rr = 2 + 16 * u;
      g.strokeStyle = LD.alpha(C.surface, 0.7 * (1 - u)); g.lineWidth = 1.2 * (1 - u) + 0.3;
      g.beginPath(); g.ellipse(F.cx, ys, rr, rr * F.k, 0, 0, Math.PI * 2); g.stroke();
    });
    // ---- 電極（插在瓶中時）：液面以下的部分隔著液面看 ----
    const e = electrodeGeom();
    if (e.inFlask) {
      drawElectrode(g, e);
      g.save();
      g.beginPath(); g.rect(F.cx - F.Rb, ys + F.k * 6, 2 * F.Rb, F.by - ys + F.k * F.Rb); g.clip();
      g.strokeStyle = rgbStr(col, 0.5); g.lineWidth = 10; g.lineCap = 'round';
      g.beginPath(); g.moveTo(e.x0, e.y0); g.lineTo(e.x1, e.y1); g.stroke();
      g.restore();
    }
  }

  function drawFlaskFront(g) {
    const F = flaskDims();
    flaskOutline(g, F);
    g.strokeStyle = C.glassEdge; g.lineWidth = 1.3; g.stroke();
    // 瓶口的唇
    g.strokeStyle = C.glassEdge; g.lineWidth = 1;
    g.beginPath(); g.ellipse(F.cx, F.yn, F.Rn + 3, F.k * (F.Rn + 3), 0, 0, Math.PI * 2); g.stroke();
    // 高光（左側的反光條、瓶頸的亮線）
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = LD.alpha(C.surface, C.dark ? 0.28 : 0.75); g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(F.cx - F.Rb + 9, F.by - 8); g.lineTo(F.cx - F.Rn - 4, F.ys + 14); g.stroke();
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(F.cx - F.Rn + 3.5, F.ys - 6); g.lineTo(F.cx - F.Rn + 3.5, F.yn + 6); g.stroke();
    g.strokeStyle = LD.alpha(C.surface, C.dark ? 0.12 : 0.35); g.lineWidth = 1;
    g.beginPath(); g.moveTo(F.cx + F.Rb - 7, F.by - 6); g.lineTo(F.cx + F.Rn + 5, F.ys + 12); g.stroke();
    g.restore();
    // 瓶身的約略刻度（50、100、150、200 mL）
    g.strokeStyle = LD.alpha(C.text, C.dark ? 0.5 : 0.45); g.lineWidth = 0.8;
    [50, 100, 150, 200].forEach(function (V) {
      const h = hPx(V), r = rAt(h), y = F.by - h;
      g.beginPath();
      g.ellipse(F.cx, y, r, F.k * r, 0, Math.PI * 0.62, Math.PI * 0.8, false);
      g.stroke();
    });
  }

  function drawBottleFront(g) {
    const b = L.bottle;
    LD.roundRect(g, b[0], b[1], b[2] - b[0], b[3] - b[1], 4);
    g.strokeStyle = C.glassEdge; g.lineWidth = 1; g.stroke();
    g.fillStyle = LD.alpha(C.surface, C.dark ? 0.15 : 0.5);
    g.fillRect(b[0] + 2.5, b[1] + 4, 1.5, b[3] - b[1] - 8);
  }

  // ---------- 七段顯示器 ----------
  const SEG = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '' };
  function seg7(g, ch, x, y, w, h, on, off) {
    const t = Math.max(1.2, w * 0.2), hh = h / 2;
    const P = {
      a: [x + t * 0.6, y, w - t * 1.2, t], d: [x + t * 0.6, y + h - t, w - t * 1.2, t], g: [x + t * 0.6, y + hh - t / 2, w - t * 1.2, t],
      f: [x, y + t * 0.6, t, hh - t * 0.9], b: [x + w - t, y + t * 0.6, t, hh - t * 0.9],
      e: [x, y + hh + t * 0.3, t, hh - t * 0.9], c: [x + w - t, y + hh + t * 0.3, t, hh - t * 0.9]
    };
    const lit = SEG[ch] || '';
    'abcdefg'.split('').forEach(function (k) {
      const r = P[k];
      g.fillStyle = lit.indexOf(k) >= 0 ? on : off;
      LD.roundRect(g, r[0], r[1], r[2], r[3], t * 0.45); g.fill();
    });
  }
  function drawLCD(g) {
    const lc = lcdRect();
    LD.roundRect(g, lc.x, lc.y, lc.w, lc.h, 3);
    const lg = g.createLinearGradient(0, lc.y, 0, lc.y + lc.h);
    lg.addColorStop(0, LD.shade(C.lcd, 0.06)); lg.addColorStop(1, C.lcd);
    g.fillStyle = lg; g.fill();
    const txt = state.meter ? f2(Math.max(0, Math.min(14, state.run.pH))).padStart(5, ' ') : '--.--';
    const digits = txt.replace('.', '');
    // 右下角「pH」字樣的寬度（文字不縮放，換回設計座標）：數字不可以跟它重疊
    g.font = '700 ' + (L.wide ? 11 : 9) + 'px ' + FF;
    const n = digits.length, pad = lc.w * 0.06, unitW = Math.max(lc.w * 0.2, (g.measureText('pH').width + 5) / L.s);
    const cw = (lc.w - 2 * pad - unitW) / n, w = cw * 0.72, hgt = lc.h * 0.66, y = lc.y + (lc.h - hgt) / 2;
    const on = C.lcdInk, off = LD.alpha(C.lcdInk, 0.07);
    g.save();
    g.translate(lc.x + pad, 0);
    g.transform(1, 0, -0.08, 1, 0, 0);
    for (let i = 0; i < n; i++) {
      const ch = digits[i], x = i * cw + (cw - w) / 2 + y * 0.08;
      seg7(g, ch, x, y, w, hgt, on, off);
    }
    // 小數點（在第二位數字之後）
    g.fillStyle = on;
    g.beginPath(); g.arc(2 * cw - cw * 0.08 + (y + hgt) * 0.08, y + hgt - 1, Math.max(1, w * 0.13), 0, Math.PI * 2); g.fill();
    g.restore();
  }

  // ---------- 放大鏡：滴定管液面的特寫 ----------
  function drawMagnifier(g) {
    const r = state.run, mx = L.mag[0], my = L.mag[1], R = L.mag[2];
    const vr = r.fill / U, ym = VY.y0 + vr * MLPX, xb = L.xb;
    // 滴定管上標出放大的範圍，連到放大鏡
    g.strokeStyle = LD.alpha(C.accent, 0.75); g.lineWidth = 1;
    LD.roundRect(g, xb - 12, ym - 1.7 * MLPX, 24, 3.4 * MLPX, 3); g.stroke();
    const ang = Math.atan2(ym - my, xb - 12 - mx);
    g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(mx + (R + 3) * Math.cos(ang), my + (R + 3) * Math.sin(ang)); g.lineTo(xb - 12, ym); g.stroke();
    g.setLineDash([]);
    // 鏡片內（把手與陰影在背層）
    g.save();
    g.beginPath(); g.arc(mx, my, R - 1, 0, Math.PI * 2); g.clip();
    const zp = R / 1.7, tw = R * 0.5;               // 每 mL 的放大像素；管子半寬
    const tg = g.createLinearGradient(mx - tw, 0, mx + tw, 0);
    tg.addColorStop(0, LD.alpha(C.text, C.dark ? 0.16 : 0.1)); tg.addColorStop(0.5, C.glassTint); tg.addColorStop(1, LD.alpha(C.text, C.dark ? 0.18 : 0.12));
    g.fillStyle = tg; g.fillRect(mx - tw, my - R, 2 * tw, 2 * R);
    const md = R * 0.12;                              // 彎月面的深度
    g.fillStyle = LD.alpha(C.titrant, C.dark ? 0.6 : 0.85);
    g.beginPath(); g.moveTo(mx - tw, my - md); g.quadraticCurveTo(mx, my + md, mx + tw, my - md); g.lineTo(mx + tw, my + R); g.lineTo(mx - tw, my + R); g.closePath(); g.fill();
    g.strokeStyle = LD.alpha(C.text, C.dark ? 0.75 : 0.65); g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(mx - tw, my - md); g.quadraticCurveTo(mx, my + md, mx + tw, my - md); g.stroke();
    g.strokeStyle = LD.alpha(C.surface, 0.5); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(mx - tw, my - md + 3); g.quadraticCurveTo(mx, my + md + 3, mx + tw, my - md + 3); g.stroke();
    // 刻度：0.1 mL 一格，0.5 mL 中長，1 mL 長＋數字
    g.strokeStyle = LD.alpha(C.text, C.dark ? 0.85 : 0.8);
    g.font = '700 ' + Math.round(R * 0.17) + 'px ' + FF;
    g.fillStyle = LD.alpha(C.text, 0.9); g.textAlign = 'left'; g.textBaseline = 'middle';
    const i0 = Math.ceil((vr - 1.9) * 10), i1 = Math.floor((vr + 1.9) * 10);
    for (let i = Math.max(0, i0); i <= Math.min(500, i1); i++) {
      const y = my + (i / 10 - vr) * zp;
      const len = i % 10 === 0 ? tw * 1.25 : i % 5 === 0 ? tw * 0.8 : tw * 0.45;
      g.lineWidth = i % 10 === 0 ? 1.4 : 1;
      g.beginPath(); g.moveTo(mx - tw, y); g.lineTo(mx - tw + len, y); g.stroke();
      if (i % 10 === 0) g.fillText(String(i / 10), mx - tw + len + 3, y);
    }
    g.fillStyle = LD.alpha(C.surface, C.dark ? 0.2 : 0.6); g.fillRect(mx - tw + 3, my - R, 2.5, 2 * R);
    // 視線（與彎月面最低點同高）
    g.strokeStyle = LD.alpha(C.accent, 0.85); g.lineWidth = 1.2; g.setLineDash([5, 4]);
    g.beginPath(); g.moveTo(mx - R, my); g.lineTo(mx + R, my); g.stroke();
    g.setLineDash([]);
    // 鏡片的反光
    const lg = g.createRadialGradient(mx - R * 0.35, my - R * 0.4, R * 0.05, mx, my, R);
    lg.addColorStop(0, LD.alpha(C.surface, C.dark ? 0.12 : 0.3)); lg.addColorStop(0.6, LD.alpha(C.surface, 0)); lg.addColorStop(1, LD.shadowInk(C.dark ? 0.25 : 0.08));
    g.fillStyle = lg; g.fillRect(mx - R, my - R, 2 * R, 2 * R);
    g.restore();
    // 鏡框
    g.strokeStyle = C.metalDark; g.lineWidth = 6;
    g.beginPath(); g.arc(mx, my, R + 1, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = LD.alpha(LD.shade(C.metal, 0.5), 0.8); g.lineWidth = 1.2;
    g.beginPath(); g.arc(mx, my, R + 2, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
  }

  // ---------- 文字層（不隨畫面縮放） ----------
  /** 化學式文字：數字自動成為下標，^ 之後為上標；parts = [{ t }, { f }] */
  function richWidth(g, parts, px) {
    let w = 0;
    parts.forEach(function (p) {
      if (p.t != null) { g.font = '600 ' + px + 'px ' + FF; w += g.measureText(p.t).width; return; }
      p.f.replace(/([A-Za-z()]+)|(\d+)|\^(\S+)/g, function (m, a, d, sup) {
        g.font = (a ? '600 ' + px : '600 ' + (px * 0.72).toFixed(1)) + 'px ' + FF;
        w += g.measureText(a || d || sup).width;
        return m;
      });
    });
    return w;
  }
  function richText(g, parts, x, y, color, px, align) {
    const w = richWidth(g, parts, px);
    let cx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    const draw = function (txt, font, dy) {
      g.font = font; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = LD.alpha(C['canvas-bg'], 0.9);
      g.strokeText(txt, cx, y + dy); g.fillStyle = color; g.fillText(txt, cx, y + dy);
      cx += g.measureText(txt).width;
    };
    parts.forEach(function (p) {
      if (p.t != null) { draw(p.t, '600 ' + px + 'px ' + FF, 0); return; }
      p.f.replace(/([A-Za-z()]+)|(\d+)|\^(\S+)/g, function (m, a, d, sup) {
        if (a) draw(a, '600 ' + px + 'px ' + FF, 0);
        else if (d) draw(d, '600 ' + (px * 0.72).toFixed(1) + 'px ' + FF, px * 0.22);
        else draw(sup, '600 ' + (px * 0.72).toFixed(1) + 'px ' + FF, -px * 0.4);
        return m;
      });
    });
    return w;
  }
  function pillClamp(g, text, x, yb, color, align) {
    g.font = '600 12px ' + FF;
    const w = g.measureText(text).width + 12;
    let xx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    xx = Math.max(4, Math.min(L.Wpx - w - 4, xx));
    return LD.pill(g, text, xx, yb, color, 'left');
  }

  function drawLabels(g) {
    const s = L.s, r = state.run, p = r.p, sys = p.sys;
    // 滴定管裡裝的是什麼
    pillClamp(g, T('滴定管：', 'Burette: ') + titrant(sys) + ' ' + conc(p.Cb) + ' M', (L.xb + 16) * s, (VY.top + 56) * s, C.text, 'left');
    // 放大鏡的讀數
    pillClamp(g, T('讀數 ', 'Reading ') + vRead(r.fill) + ' mL', L.mag[0] * s, (L.mag[1] + L.mag[2] + 24) * s, C.accent, 'center');
    const F = flaskDims();
    // pH 計
    const lc = lcdRect();
    LD.haloText(g, 'pH', (lc.x + lc.w - 3) * s, (lc.y + lc.h - 4) * s, LD.alpha(C.lcdInk, 0.95), 'right', 'alphabetic', '700 ' + (L.wide ? 11 : 9) + 'px ' + FF);
    if (!state.meter) LD.haloText(g, T('電極在保存液中', 'electrode in storage'), ((L.meter[0] + L.meter[2]) / 2) * s, (L.meter[3] - 6) * s, C.muted, 'center', 'alphabetic', '10px ' + FF);
    else if (L.wide) LD.haloText(g, T('pH 計　25.0 °C', 'pH meter  25.0 °C'), ((L.meter[0] + L.meter[2]) / 2) * s, (L.meter[3] - 8) * s, C.muted, 'center', 'alphabetic', '10px ' + FF);
    // 實驗桌前緣：錐形瓶裡有什麼、示意圖
    // 一行放不下時：窄版分成兩行（指示劑與「示意圖」放第二行），寬版省略「示意圖」
    const px = 12, line1 = VY.bench * s + 17, line2 = VY.bench * s + 35;
    const parts = [{ t: T('錐形瓶：', 'Flask: ') + sysName(sys) + ' ' }, { f: SYS[sys].f },
      { t: (sys === 'mx' ? T(' 濃度未知', ' (unknown c)') : ' ' + conc(p.Ca) + ' M') + T('・', ' · ') + p.Va.toFixed(2) + ' mL' +
        (p.Vw > 0 ? T('＋水 ', ' + water ') + p.Vw.toFixed(0) + ' mL' : '') }];
    const indT = state.ind !== 'none' ? T('＋', ' + ') + indName(state.ind) : '';
    const note = T('示意圖（未依比例）', 'Not to scale');
    g.font = '11px ' + FF;
    const wNote = g.measureText(note).width + 14;
    const wInd = indT ? richWidth(g, [{ t: indT }], px) : 0;
    const wMain = richWidth(g, parts, px), room = L.Wpx - 16;
    if (wMain + wInd + wNote <= room) {
      richText(g, parts.concat(indT ? [{ t: indT }] : []), 8, line1, C.text, px, 'left');
      LD.haloText(g, note, L.Wpx - 8, line1, C.muted, 'right', 'alphabetic', '11px ' + FF);
    } else if (L.strip === 2) {
      const one = wMain + wInd <= room;
      richText(g, one ? parts.concat(indT ? [{ t: indT }] : []) : parts, 8, line1, C.text, px, 'left');
      if (!one && indT) richText(g, [{ t: indT.replace(/^ \+ /, '+ ') }], 8, line2, C.text, px, 'left');
      LD.haloText(g, note, L.Wpx - 8, line2, C.muted, 'right', 'alphabetic', '11px ' + FF);
    } else {
      richText(g, parts.concat(indT ? [{ t: indT }] : []), 8, line1, C.text, wMain + wInd <= room ? px : 11, 'left');
    }
    // 變色的提示
    if (state.tag && state.tag.t > 0) {
      g.save(); g.globalAlpha = Math.min(1, state.tag.t / 0.4);
      pillClamp(g, state.tag.text, (F.cx + F.Rb + 6) * s, (VY.by - 40) * s, C.chem, 'left');
      g.restore();
    }
  }

  function drawBench() {
    if (!L) return;
    const g = ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(stat, 0, 0);
    g.setTransform(L.dpr * L.s, 0, 0, L.dpr * L.s, 0, 0);
    drawArmAndCable(g);
    drawBuretteLiquid(g);
    drawHangingAndDrops(g);
    drawFlask(g);
    const e = electrodeGeom();
    if (!e.inFlask) drawElectrode(g, e);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(front, 0, 0);
    g.setTransform(L.dpr * L.s, 0, 0, L.dpr * L.s, 0, 0);
    drawCockHandle(g);
    drawLCD(g);
    drawMagnifier(g);
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    drawLabels(g);
  }

  // ======================= 動畫與液滴 =======================
  let raf = 0, lastT = 0, lastGraph = 0, onScreen = true, skip = false, inFrame = false;
  function busy() {
    return state.tap || state.pendingSettle || state.drops.length > 0 || state.plumes.length > 0 || state.ripples.length > 0 ||
      state.flash > 0 || (state.tag && state.tag.t > 0) || Math.abs(state.cock - (state.tap ? 1 : 0)) > 1e-3;
  }
  function frame(now) {
    raf = 0;
    // 畫面動畫的 dt 有上限（切回分頁時不會一次跳太多）；活栓的流量用真實經過的時間（最多 0.25 s），標示的 mL/s 才名實相符
    const raw = Math.max(0, (now - lastT) / 1000);
    lastT = now;
    inFrame = true;
    try { step(Math.min(1 / 30, raw), Math.min(0.25, raw)); } finally { inFrame = false; }
    const b = busy();
    // 只有攪拌子在轉時，約 30 fps 就夠了；畫布捲出畫面時不畫，但活栓開著、液滴還在空中就照樣流（曲線與讀數繼續更新）
    if (onScreen && (b || !skip || reduced)) drawBench();
    skip = !skip;
    if (graphDirty && now - lastGraph > 120) { lastGraph = now; drawGraph(); renderReadouts(); }
    if (!raf && !document.hidden && (onScreen ? (b || !reduced) : b)) raf = requestAnimationFrame(frame);
  }
  function kick() {
    // frame() 執行中（例如活栓放出一滴）不另開一條動畫迴圈：frame 結束時自己會排下一幀。
    // 以前這裡會在 raf 剛歸零時再排一次，每放一滴就多一條迴圈，滴越多越卡（11/12 修正）。
    if (inFrame) return;
    if (raf || document.hidden) { if (!raf) drawBench(); return; }
    if (!onScreen && !busy()) { drawBench(); return; }
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (es) { onScreen = es[es.length - 1].isIntersecting; if (onScreen) kick(); }).observe(cv);
  }

  function step(dt, flowDt) {
    if (flowDt == null) flowDt = dt;
    if (!reduced) state.stir = (state.stir + STIR_W * dt) % (Math.PI * 200);
    const target = state.tap ? 1 : 0;
    state.cock += Math.sign(target - state.cock) * Math.min(Math.abs(target - state.cock), dt / 0.15);
    // 活栓開著：依流速累積，每 2 單位（0.05 mL）成一滴
    if (state.tap) {
      state.acc += state.rate * U * flowDt;
      while (state.acc >= DROP && state.tap) {
        state.acc -= DROP;
        release(DROP, false);
      }
      if (state.rate > STREAM_RATE) { state.streamSnd -= dt; if (state.streamSnd <= 0) { state.streamSnd = 0.11; sndStream(); } }
    }
    // 液滴
    const ys = L ? surfaceY() : VY.by;
    const landed = [];
    state.drops = state.drops.filter(function (d) {
      if (d.phase === 'grow') {
        d.t += dt;
        if (d.t >= d.growT) { d.phase = 'fall'; d.y = VY.tip + dropRadius(d.n); d.v = 0; }
        return true;
      }
      d.v += G_PX * dt; d.y += d.v * dt;
      if (d.y >= ys) { landed.push(d); return false; }
      return true;
    });
    landed.forEach(land);
    state.plumes = state.plumes.filter(function (p) { p.t += dt; return p.t < p.life; });
    state.ripples = state.ripples.filter(function (p) { p.t += dt; return p.t < 0.35; });
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt / 0.6);
    if (state.tag && state.tag.t > 0) state.tag.t -= dt;
    if (state.pendingSettle && !state.tap && state.drops.length === 0) { state.pendingSettle = false; settle(); }
  }

  /** 從滴定管放出 n 個單位（一滴 2、半滴 1）；傳回實際放出的量 */
  function release(n, fromButton) {
    const r = state.run;
    const left = K.BURETTE_UNITS - r.fill;
    if (left <= 0) { closeTap(); emptyNotice(); return 0; }
    if (r.p.Va + r.p.Vw + (r.out + n) / U > VT_MAX) {
      closeTap();
      setStatus(T('錐形瓶快滿了（' + VT_MAX + ' mL）。換一瓶，或減少待測液、提高滴定液的濃度。', 'The flask is almost full (' + VT_MAX + ' mL). Start a new flask, or use less sample or a more concentrated titrant.'), true);
      return 0;
    }
    n = Math.min(n, left);
    r.out += n; r.fill += n;
    if (state.meter) r.meterUsed = true;
    if (r.sample && !r.counted) { r.counted = true; r.sample.flasks++; }
    if (!r.no) r.no = ++state.flaskNo;
    const d = { n: n, phase: fromButton ? 'grow' : 'fall', t: 0, growT: n >= DROP ? 0.12 : 0.09, y: VY.tip + dropRadius(n), v: 0 };
    if (reduced) land(d); else state.drops.push(d);
    if (r.fill >= K.BURETTE_UNITS) { closeTap(); emptyNotice(); }
    state.pendingSettle = true;
    kick();
    return n;
  }

  let lastPlume = 0;
  /** 液滴落進錐形瓶：重算 pH、記點、畫面效果 */
  function land(d) {
    const r = state.run;
    const before = r.u / U;
    r.u += d.n;
    r.pH = K.pH(r.p, r.u / U);
    r.pts.push({ u: r.u, pH: r.pH, m: state.meter });
    state.pendingSettle = true;
    sndDrop(d.n);
    if (!reduced) state.ripples.push({ t: 0 });
    if (state.ind !== 'none') {
      const loc = K.localPH(r.p, before, 1.0, d.n / U);
      const fbLoc = K.indicatorFraction(state.ind, loc), fbBulk = K.indicatorFraction(state.ind, r.pH);
      const nowMs = performance.now();
      if (!reduced && Math.abs(fbLoc - fbBulk) > 0.04 && nowMs - lastPlume > (state.tap && state.rate > STREAM_RATE ? 120 : 0)) {
        lastPlume = nowMs;
        state.plumes.push({ t: 0, life: 1.1, a0: Math.random() * Math.PI * 2, rgb: liquidRGB(state.ind, loc, 3) });
        if (state.plumes.length > 8) state.plumes.shift();
      }
      // 滴落處出現顏色、攪勻後又消失：快到終點了
      if (!r.hinted && r.changedAt == null && Math.abs(fbLoc - K.indicatorFraction(state.ind, r.pH0)) > 0.35 && !K.changed(state.ind, r.pH0, r.pH)) {
        r.hinted = true;
        setStatus(T('滴落的地方出現了顏色，攪勻後又消失：快到終點了，改成一滴一滴加。', 'Colour appears where the drop lands and fades as it mixes in: the end point is close — go drop by drop.'));
      }
      if (r.changedAt == null && K.changed(state.ind, r.pH0, r.pH)) {
        r.changedAt = r.u;
        colourChanged();
      }
    }
    graphDirty = true;
  }
  function colourChanged() {
    const r = state.run;
    state.flash = reduced ? 0 : 1;
    state.flashCol = rgbStr(liquidRGB(state.ind, r.pH, vtLanded()));
    state.tag = { text: T('變色了！', 'Colour change!'), t: 1.8 };
    sndColour();
    const cn = colourName(state.ind, K.indicatorFraction(state.ind, r.pH));
    setStatus(T('整瓶溶液變成' + cn + '了（' + indName(state.ind) + '）。如果這就是終點，按「記錄終點」。', 'The whole flask has turned ' + cn + ' (' + indName(state.ind) + '). If this is the end point, press “Record end point”.'));
  }
  function emptyNotice() {
    sndEmpty();
    setStatus(T('滴定管流空了（50.00 mL）。按「補充滴定液」重新裝滿再繼續。', 'The burette is empty (50.00 mL). Press “Refill burette” to fill it up and carry on.'), true);
  }
  function closeTap() {
    if (!state.tap) return;
    state.tap = false; state.acc = 0;
    updateButtons();
  }

  // ======================= 任務事件 =======================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function curvesData() {
    return state.archive.concat(state.run.u > 0 ? [state.run] : []).map(function (r) {
      return { sys: r.p.sys, Ca: r.p.Ca, Va: r.p.Va, Vw: r.p.Vw, Cb: r.p.Cb, Vmax: r.u / U, Veq: K.Veq(r.p) };
    });
  }
  function settleData() {
    const r = state.run, pH = r.pH;
    const fb = state.ind === 'none' ? null : K.indicatorFraction(state.ind, pH);
    return {
      sys: r.p.sys, Ca: r.p.Ca, Va: r.p.Va, Vw: r.p.Vw, Cb: r.p.Cb, V: r.u / U, Vread: r.fill / U, Veq: K.Veq(r.p), pH: pH, pH0: r.pH0,
      dir: K.direction(r.p.sys), meter: state.meter, meterUsed: r.meterUsed, ind: state.ind, indFixed: r.indFixed, fb: fb,
      moved: K.indicatorMoved(state.ind, r.pH0, pH), empty: r.fill >= K.BURETTE_UNITS, curves: curvesData()
    };
  }
  /** 加入的液體全部落進瓶中、停下來了：記一列數據、回報任務事件 */
  function settle() {
    const r = state.run;
    const last = r.rows[r.rows.length - 1];
    const row = { u: r.u, pH: state.meter ? r.pH : null, fb: K.indicatorFraction(state.ind, r.pH) };
    if (last && last.u === r.u) r.rows[r.rows.length - 1] = row; else r.rows.push(row);
    if (r.rows.length > 600) r.rows.splice(1, r.rows.length - 600);
    latestRow = true;
    renderAll();
    const msg = T('滴定管讀數 ' + vRead(r.fill) + ' mL', 'Burette reading ' + vRead(r.fill) + ' mL') +
      (state.meter ? T('、pH ' + f2(r.pH), ', pH ' + f2(r.pH)) : '') +
      (state.ind !== 'none' ? T('、溶液' + colourName(state.ind, row.fb), ', solution ' + colourName(state.ind, row.fb)) : '') + T('。', '.');
    routineStatus(msg);
    emit('settle', settleData());
  }

  // ======================= 圖：滴定曲線 =======================
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  let G = null, graphDirty = true, hover = null;
  function resizeGraph() {
    const W = gcv.clientWidth;
    if (!W) return;
    const H = Math.round(Math.max(270, Math.min(400, W * 0.58)));
    if (gcv.style.height !== H + 'px') gcv.style.height = H + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    gcv.width = Math.round(W * dpr); gcv.height = Math.round(H * dpr);
    G = { W: W, H: H, dpr: dpr };
    drawGraph();
  }
  const NICE = [5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300];
  function xMax() {
    const r = state.run;
    let m = mysteryHidden() ? 50 : Math.max(10, 2 * r.Veq);
    state.archive.concat([r]).forEach(function (q) { m = Math.max(m, q.u / U * 1.06); });
    for (let i = 0; i < NICE.length; i++) if (NICE[i] >= m - 1e-9) return NICE[i];
    return 300;
  }
  function xStep(xmax) {
    const st = [0.5, 1, 2, 5, 10, 20, 25, 50];
    for (let i = 0; i < st.length; i++) if (xmax / st[i] <= 10.5) return st[i];
    return 50;
  }
  const theoryCache = { key: '', pts: null };
  function theoryPts(p, xmax) {
    const key = [p.sys, p.Ca, p.Va, p.Vw, p.Cb, p.Ka, p.Kb, xmax].join('|');
    if (theoryCache.key === key) return theoryCache.pts;
    const Veq = K.Veq(p), xs = [];
    for (let i = 0; i <= 500; i++) xs.push(xmax * i / 500);
    for (let v = Math.max(0, Veq - 1); v <= Math.min(xmax, Veq + 1); v += 0.004) xs.push(v);
    xs.sort(function (a, b) { return a - b; });
    const pts = xs.map(function (v) { return { v: v, pH: K.pH(p, v) }; });
    theoryCache.key = key; theoryCache.pts = pts;
    return pts;
  }
  /** 斜率 ΔpH/ΔV（只用 pH 計量到的點） */
  function slopes(r) {
    const m = r.pts.filter(function (q) { return q.m; }), out = [];
    for (let i = 1; i < m.length; i++) {
      const dv = (m[i].u - m[i - 1].u) / U;
      if (dv > 0 && dv <= 2.5) out.push({ v: (m[i].u + m[i - 1].u) / 2 / U, d: (m[i].pH - m[i - 1].pH) / dv });
    }
    return out;
  }
  function maxSlope(r) {
    const s = slopes(r);
    if (s.length < 2) return null;
    let best = s[0];
    s.forEach(function (q) { if (Math.abs(q.d) > Math.abs(best.d)) best = q; });
    return best;
  }

  function drawGraph() {
    if (!G) return;
    graphDirty = false;
    const g = gctx, W = G.W, H = G.H, r = state.run, p = r.p, hid = mysteryHidden();
    g.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    LD.backdrop(g, W, H);
    const x0 = 44, x1 = W - (state.deriv ? 50 : 14), y0 = 14, y1 = H - 60;
    const xmax = xMax();
    const X = function (v) { return x0 + v / xmax * (x1 - x0); };
    const Y = function (ph) { return y1 - ph / 14 * (y1 - y0); };
    G.X = X; G.x0 = x0; G.x1 = x1; G.y0 = y0; G.y1 = y1; G.xmax = xmax;
    // 繪圖區與格線
    g.fillStyle = LD.alpha(C.surface, C.dark ? 0.2 : 0.55); g.fillRect(x0, y0, x1 - x0, y1 - y0);
    const xs = xStep(xmax);
    const gridLines = function (major) {
      g.beginPath();
      for (let ph = 0; ph <= 14; ph += 1) if ((ph % 2 === 0) === major) { const y = Math.round(Y(ph)) + 0.5; g.moveTo(x0, y); g.lineTo(x1, y); }
      for (let i = 0; i * xs / 2 <= xmax + 1e-9; i++) if ((i % 2 === 0) === major) { const x = Math.round(X(i * xs / 2)) + 0.5; g.moveTo(x, y0); g.lineTo(x, y1); }
      g.strokeStyle = LD.alpha(C.text, major ? (C.dark ? 0.11 : 0.1) : (C.dark ? 0.05 : 0.04)); g.lineWidth = 1; g.stroke();
    };
    gridLines(false); gridLines(true);
    // 指示劑的變色範圍
    const I = K.INDICATORS[state.ind];
    if (I) {
      const ca = liquidRGB(state.ind, I.lo - 1, 45), cb = liquidRGB(state.ind, I.hi + 1, 45);
      const bg = g.createLinearGradient(0, Y(I.lo), 0, Y(I.hi));
      bg.addColorStop(0, rgbStr(ca, 0.3)); bg.addColorStop(1, rgbStr(cb, 0.3));
      g.fillStyle = bg; g.fillRect(x0, Y(I.hi), x1 - x0, Y(I.lo) - Y(I.hi));
      LD.haloText(g, indName(state.ind) + ' ' + I.lo.toFixed(1) + '–' + I.hi.toFixed(1), x1 - 6, Y(I.hi) - 4, C.muted, 'right', 'alphabetic', '11px ' + FF);
    }
    // 中性 pH 7
    g.setLineDash([4, 4]); g.strokeStyle = LD.alpha(C.text, 0.35); g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, Math.round(Y(7)) + 0.5); g.lineTo(x1, Math.round(Y(7)) + 0.5); g.stroke(); g.setLineDash([]);
    LD.haloText(g, T('中性 pH 7', 'neutral, pH 7'), x0 + 6, Y(7) - 4, C.muted, 'left', 'alphabetic', '11px ' + FF);
    // 緩衝區（弱酸、弱鹼）
    const weak = K.SYSTEMS[p.sys].kind !== 'strong-acid';
    const Vnow = r.u / U;
    if (weak && !hid) {
      const a = r.Veq / 11, b = 10 * r.Veq / 11, bEnd = state.theory ? b : Math.min(b, Vnow);
      if (bEnd > a) {
        g.fillStyle = LD.alpha(C.accent, C.dark ? 0.12 : 0.08);
        g.fillRect(X(a), y0, X(bEnd) - X(a), y1 - y0);
        if (X(bEnd) - X(a) > 46) LD.haloText(g, T('緩衝區', 'buffer region'), (X(a) + X(bEnd)) / 2, y0 + 14, C.accent, 'center', 'alphabetic', '600 11px ' + FF);
      }
    }
    // 理論曲線（虛線）
    if (state.theory && !hid) {
      const tp = theoryPts(p, xmax);
      g.save(); g.setLineDash([6, 4]); g.strokeStyle = LD.alpha(C.sys[p.sys], 0.75); g.lineWidth = 1.5; g.lineJoin = 'round';
      g.beginPath(); tp.forEach(function (q, i) { const x = X(q.v), y = Y(Math.max(0, Math.min(14, q.pH))); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
      g.restore();
    }
    // 舊的曲線（淡）
    g.save(); g.beginPath(); g.rect(x0, y0 - 2, x1 - x0, y1 - y0 + 4); g.clip();
    state.archive.slice().reverse().forEach(function (q) { drawRunCurve(g, q, X, Y, true); });
    drawRunCurve(g, r, X, Y, false);
    g.restore();
    // 斜率 ΔpH/ΔV（右邊的軸）
    if (state.deriv) {
      const sl = slopes(r);
      let dmax = 0; sl.forEach(function (q) { dmax = Math.max(dmax, Math.abs(q.d)); });
      const dTop = niceUp(Math.max(1, dmax * 1.08));
      const YD = function (d) { return y1 - Math.abs(d) / dTop * (y1 - y0); };
      g.save(); g.strokeStyle = C.accent; g.lineWidth = 1.6; g.lineJoin = 'round';
      g.beginPath(); sl.forEach(function (q, i) { const x = X(q.v), y = YD(q.d); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
      g.restore();
      g.fillStyle = C.accent; g.font = '11px ' + FF; g.textAlign = 'left'; g.textBaseline = 'middle';
      for (let i = 0; i <= 4; i++) { const d = dTop * i / 4; g.fillText(fmtAxis(d), x1 + 5, YD(d)); }
      LD.haloText(g, T('|ΔpH/ΔV|（每 mL）', '|ΔpH/ΔV| (per mL)'), x1 - 6, y0 + 14, C.accent, 'right', 'alphabetic', '600 11px ' + FF);
    }
    // 當量點、半當量點、終點
    if (!hid) {
      if (weak && (state.theory || Vnow >= r.Veq / 2)) {
        const vh = r.Veq / 2, ph = K.pH(p, vh), px = X(vh), py = Y(ph);
        g.save(); g.setLineDash([3, 3]); g.strokeStyle = LD.alpha(C.text, 0.45); g.lineWidth = 1;
        g.beginPath(); g.moveTo(x0, py); g.lineTo(px, py); g.lineTo(px, y1); g.stroke(); g.restore();
        LD.ball(g, px, py, 4, C.sys[p.sys], { shadow: false });
        const pk = halfRef(p);
        const lab = p.sys === 'wb' ? T('半當量點 pH ' + f2(ph) + '（≈ 14 − pKb = ' + f2(pk) + '）', 'half-equivalence pH ' + f2(ph) + ' (≈ 14 − pKb = ' + f2(pk) + ')') : T('半當量點 pH ' + f2(ph) + '（≈ pKa ' + f2(pk) + '）', 'half-equivalence pH ' + f2(ph) + ' (≈ pKa ' + f2(pk) + ')');
        const up = p.sys === 'wb' ? py + 24 : py - 8;
        pillGraph(g, lab, px - 6, up, C.text, 'right', x0, x1);
      }
      if (state.theory || Vnow >= r.Veq) {
        const px = X(r.Veq), py = Y(r.pHeq);
        if (px <= x1 + 0.5) {
          g.save(); g.setLineDash([3, 3]); g.strokeStyle = LD.alpha(C.text, 0.45); g.lineWidth = 1;
          g.beginPath(); g.moveTo(px, py); g.lineTo(px, y1); g.stroke(); g.restore();
          LD.ball(g, px, py, 4.8, C.sys[p.sys], { shadow: false });
          const lab = T('當量點 ' + r.Veq.toFixed(2) + ' mL・pH ' + f2(r.pHeq), 'equivalence ' + r.Veq.toFixed(2) + ' mL, pH ' + f2(r.pHeq));
          pillGraph(g, lab, px + 8, p.sys === 'wb' ? py - 8 : py + 24, C.text, 'left', x0, x1);
        }
      }
    }
    if (r.endpoint != null) {
      const px = X(r.endpoint);
      if (px <= x1) {
        g.strokeStyle = C.equi; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(px, y0); g.lineTo(px, y1); g.stroke();
        pillGraph(g, T('你的終點 ', 'your end point ') + vRead(r.endpoint * U) + ' mL', px + 5, y0 + 34, C.equi, 'left', x0, x1);
      }
    }
    // 座標軸與刻度
    g.strokeStyle = LD.alpha(C.text, 0.6); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0, y1); g.lineTo(x1, y1); if (state.deriv) g.lineTo(x1, y0); g.stroke();
    g.fillStyle = C.text; g.font = '11px ' + FF; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let ph = 0; ph <= 14; ph += 2) g.fillText(String(ph), x0 - 6, Y(ph));
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    for (let v = 0; v <= xmax + 1e-9; v += xs) g.fillText(fmtAxis(v), X(v), y1 + 32);
    LD.haloText(g, 'pH', x0 + 6, y0 + 14, C.text, 'left', 'alphabetic', '700 12px ' + FF);
    LD.haloText(g, T('加入的滴定液體積 V（mL）', 'Volume of titrant added, V (mL)'), (x0 + x1) / 2, H - 8, C.muted, 'center', 'alphabetic', '12px ' + FF);
    // 瓶中顏色的色條
    const sy = y1 + 5, shh = 11;
    g.fillStyle = LD.alpha(C.text, 0.06); g.fillRect(x0, sy, x1 - x0, shh);
    if (state.ind !== 'none') {
      // 同一個像素裡的點只畫最後一個（滴了上千滴也只畫約一個圖寬的色塊）
      const pts = r.pts, n = pts.length;
      const paint = function (q, a, b) {
        g.fillStyle = rgbStr(liquidRGB(state.ind, q.pH, p.Va + p.Vw + q.u / U));
        g.fillRect(a, sy, Math.max(1, Math.min(x1, b) - a + 0.5), shh);
      };
      let segX = null, segQ = null;
      for (let i = 0; i < n; i++) {
        const a = X(pts[i].u / U);
        if (a > x1) break;
        if (segX === null) { segX = a; segQ = pts[i]; continue; }
        if (a - segX >= 1) { paint(segQ, segX, a); segX = a; }
        segQ = pts[i];
      }
      if (segQ) paint(segQ, segX, segX + 3);
    }
    g.strokeStyle = LD.alpha(C.text, 0.25); g.lineWidth = 1; g.strokeRect(x0 + 0.5, sy + 0.5, x1 - x0 - 1, shh - 1);
    // 滑鼠／手指指到的點
    if (hover) drawHover(g, X, Y);
  }
  function fmtAxis(v) { return Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(1); }
  function niceUp(v) {
    const e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e;
  }
  function pillGraph(g, text, x, yb, color, align, xa, xb2) {
    g.font = '600 12px ' + FF;
    const w = g.measureText(text).width + 12;
    let xx = align === 'right' ? x - w : x;
    if (xx + w > xb2 - 2) xx = xb2 - 2 - w;
    if (xx < xa + 2) xx = xa + 2;
    yb = Math.max(G.y0 + 18, Math.min(G.y1 - 2, yb));
    LD.pill(g, text, xx, yb, color, 'left');
  }
  function drawRunCurve(g, r, X, Y, old) {
    const col = C.sys[r.p.sys];
    g.save();
    g.strokeStyle = old ? LD.alpha(col, 0.45) : col;
    g.lineWidth = old ? 1.5 : 2.4; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath();
    let pen = false, lastX = 0, lastY = 0;
    r.pts.forEach(function (q) {
      if (!q.m) { pen = false; return; }
      const x = X(q.u / U), y = Y(q.pH);
      if (pen) g.lineTo(x, y); else g.moveTo(x, y);
      pen = true; lastX = x; lastY = y;
    });
    g.stroke();
    if (!old) {
      g.fillStyle = col;
      r.rows.forEach(function (q) { if (q.pH != null) { g.beginPath(); g.arc(X(q.u / U), Y(q.pH), 2.4, 0, Math.PI * 2); g.fill(); } });
    } else if (r.no && pen) {
      LD.haloText(g, '#' + r.no, Math.min(lastX + 4, G.x1 - 18), lastY - 4, col, 'left', 'alphabetic', '600 11px ' + FF);
    }
    g.restore();
  }
  function drawHover(g, X, Y) {
    const r = state.run;
    let best = null, bd = 28;
    r.pts.forEach(function (q) { if (q.m) { const d = Math.abs(X(q.u / U) - hover.x); if (d < bd) { bd = d; best = q; } } });
    let v, ph, lab;
    if (best) { v = best.u / U; ph = best.pH; lab = 'V = ' + vRead(best.u) + ' mL・pH ' + f2(ph); }
    else if (state.theory && !mysteryHidden()) {
      v = Math.max(0, Math.min(G.xmax, (hover.x - G.x0) / (G.x1 - G.x0) * G.xmax));
      ph = K.pH(r.p, v); lab = T('理論：', 'theory: ') + 'V = ' + v.toFixed(2) + ' mL・pH ' + f2(ph);
    } else return;
    const x = X(v), y = Y(ph);
    g.strokeStyle = LD.alpha(C.text, 0.4); g.lineWidth = 1;
    g.beginPath(); g.moveTo(x + 0.5, G.y0); g.lineTo(x + 0.5, G.y1); g.stroke();
    LD.ball(g, x, y, 4, C.accent, { shadow: false });
    pillGraph(g, lab, x + 8, y - 8, C.text, 'left', G.x0, G.x1);
  }
  function hoverAt(e) {
    const rc = gcv.getBoundingClientRect();
    hover = { x: e.clientX - rc.left, y: e.clientY - rc.top };
    drawGraph();
  }
  gcv.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') hoverAt(e); });
  gcv.addEventListener('pointerdown', hoverAt);
  gcv.addEventListener('pointerleave', function () { if (hover) { hover = null; drawGraph(); } });

  // ======================= 讀數、分析、數據表 =======================
  function dl(rows) {
    return rows.map(function (q) {
      return '<dt>' + q[0] + '</dt><dd' + (q[2] ? ' class="' + q[2] + '"' : '') + '>' + q[1] + '</dd>';
    }).join('');
  }
  function renderReadouts() {
    const r = state.run, p = r.p, hid = mysteryHidden(), rows = [];
    rows.push([T('滴定管讀數', 'Burette reading'), vRead(r.fill) + ' mL', 'big']);
    if (r.out !== r.fill) rows.push([T('這一瓶累計流出', 'Run out into this flask'), vRead(r.out) + ' mL']);
    rows.push([T('錐形瓶中的溶液', 'Solution in the flask'), (p.Va + p.Vw + r.u / U).toFixed(1) + ' mL']);
    if (state.meter) {
      const h = Math.pow(10, -r.pH);
      rows.push([T('pH（pH 計）', 'pH (meter)'), f2(r.pH), 'big']);
      rows.push(['[H<sup>+</sup>]', sciHTML(h, 2) + ' M']);
      rows.push(['[OH<sup>−</sup>]', sciHTML(K.KW / h, 2) + ' M']);
    } else {
      rows.push([T('pH', 'pH'), '—<small>' + T('pH 計不在瓶中', 'meter not in the flask') + '</small>']);
    }
    rows.push([T('溶液的顏色', 'Colour of the solution'), state.ind === 'none' ? T('無色（沒有指示劑）', 'colourless (no indicator)') : colourName(state.ind, K.indicatorFraction(state.ind, r.pH))]);
    if (!hid) {
      // 已中和最多 100%；過了當量點，多出來的滴定液另列（試玩回報：顯示 230% 不合理）
      const pct = r.u / U / r.Veq * 100;
      rows.push([T('已中和', 'Neutralised'), Math.min(100, pct).toFixed(1) + '%']);
      if (pct > 100.05) rows.push([T('滴定液過量', 'Excess titrant'), (r.u / U - r.Veq).toFixed(2) + ' mL']);
    }
    $('readout').innerHTML = dl(rows);
  }
  /** 半當量點要對照的值：弱酸的 pKa；弱鹼的 14 − pKb（= NH4+ 的 pKa） */
  function halfRef(p) { return K.pKaOf(p); }
  function renderAnalysis() {
    const r = state.run, p = r.p, hid = mysteryHidden(), rows = [];
    const weak = K.SYSTEMS[p.sys].kind !== 'strong-acid';
    rows.push([T('當量點體積（理論）', 'Equivalence volume (theory)') + '<small>V<sub>eq</sub> = c<sub>a</sub>V<sub>a</sub> / c<sub>b</sub></small>', hid ? '？' : r.Veq.toFixed(2) + ' mL']);
    rows.push([T('當量點的 pH（理論）', 'pH at equivalence (theory)'), hid ? '？' : f2(r.pHeq)]);
    if (weak) {
      rows.push([p.sys === 'wb' ? T('半當量點的 pH（≈ 14 − pK<sub>b</sub>）', 'pH at half-equivalence (≈ 14 − pK<sub>b</sub>)') : T('半當量點的 pH（≈ pK<sub>a</sub>）', 'pH at half-equivalence (≈ pK<sub>a</sub>)'), hid ? '？' : f2(K.pH(p, r.Veq / 2))]);
      rows.push([p.sys === 'wb' ? '14 − pK<sub>b</sub>' : 'pK<sub>a</sub>', hid ? '？' : f2(halfRef(p))]);
    }
    if (r.endpoint != null) {
      rows.push([T('你記錄的終點', 'Your end point'), vRead(r.endpoint * U) + ' mL', 'good']);
      if (!hid) {
        const err = r.endpoint - r.Veq;
        rows.push([T('終點 − 當量點', 'End point − equivalence'), signed(err, 3) + ' mL', Math.abs(err) <= 0.1 + 1e-9 ? 'good' : 'warn']);
      }
    } else rows.push([T('你記錄的終點', 'Your end point'), T('還沒記錄', 'not yet')]);
    const ms = maxSlope(r);
    rows.push([T('數據中斜率最大處', 'Steepest point in your data') + '<small>' + T('相鄰兩點 ΔpH/ΔV 最大', 'largest ΔpH/ΔV between neighbours') + '</small>',
      ms ? 'V ≈ ' + ms.v.toFixed(3) + ' mL' : '—']);
    if (p.sys === 'mx' && state.sample.revealed) {
      rows.push([T('真正的濃度', 'True concentration'), state.sample.C.toFixed(3) + ' M', 'good']);
      rows.push([T('真正的 K<sub>a</sub>', 'True K<sub>a</sub>'), sciHTML(state.sample.Ka, 2) + '（pK<sub>a</sub> ' + (-Math.log10(state.sample.Ka)).toFixed(2) + '）', 'good']);
    }
    $('anaOut').innerHTML = dl(rows);
  }
  let latestRow = false;
  function renderTable() {
    const r = state.run;
    let h = '<thead><tr><th>#</th><th>V<br><small>(mL)</small></th><th>pH</th><th class="d">ΔpH/ΔV<br><small>' + T('(每 mL)', '(per mL)') + '</small></th><th>' + T('顏色', 'Colour') + '</th></tr></thead><tbody>';
    let prev = null;
    r.rows.forEach(function (q, i) {
      let d = '—', jump = false;
      if (q.pH != null && prev && q.u > prev.u) { const dd = (q.pH - prev.pH) / ((q.u - prev.u) / U); d = dd.toFixed(dd >= 100 ? 0 : dd >= 10 ? 1 : 2); jump = Math.abs(dd) >= 20; }
      const col = state.ind === 'none' ? null : rgbStr(liquidRGB(state.ind, K.pH(r.p, q.u / U), r.p.Va + r.p.Vw + q.u / U));
      const cls = (latestRow && i === r.rows.length - 1 ? 'latest' : '') + (jump ? ' jump' : '');
      h += '<tr' + (cls.trim() ? ' class="' + cls.trim() + '"' : '') + '><td>' + i + '</td><td>' + vRead(q.u) + '</td><td>' + (q.pH == null ? '—' : f2(q.pH)) + '</td><td class="d">' + d + '</td><td class="col">' +
        (col ? '<i style="background:' + col + '"></i>' + colourName(state.ind, q.fb == null ? 0 : q.fb) : T('（無指示劑）', '(none)')) + '</td></tr>';
      if (q.pH != null) prev = q;
    });
    h += '</tbody>';
    $('tbl').innerHTML = h;
    const wrap = $('tblWrap');
    if (latestRow) wrap.scrollTop = wrap.scrollHeight;
  }
  function runLabel(r, current) {
    const p = r.p;
    const what = p.sys === 'mx' ? sysName('mx') + T('（樣品 ' + (r.sample ? r.sample.no : '') + '）', ' (sample ' + (r.sample ? r.sample.no : '') + ')') : sysName(p.sys) + ' ' + conc(p.Ca) + ' M';
    return (current ? (r.no ? T('目前（#' + r.no + '）：', 'Now (#' + r.no + '): ') : T('目前：', 'Now: ')) : '#' + r.no + ' ') + what + ' ' + p.Va.toFixed(2) + ' mL' +
      (p.Vw > 0 ? T('＋水 ', ' + water ') + p.Vw.toFixed(0) + ' mL' : '') + ' ← ' + titrant(p.sys) + ' ' + conc(p.Cb) + ' M';
  }
  function renderLegend() {
    const items = [];
    const r = state.run, col = C.sys[r.p.sys];
    items.push('<span style="color:' + col + '"><i class="ln" style="background:' + col + '"></i>' + runLabel(r, true) + '</span>');
    if (state.theory && !mysteryHidden()) items.push('<span style="color:' + col + '"><i class="ln dash"></i>' + T('理論曲線', 'theoretical curve') + '</span>');
    state.archive.forEach(function (q) {
      const c = C.sys[q.p.sys];
      items.push('<span><i class="ln old" style="background:' + c + '"></i>' + runLabel(q, false) + '</span>');
    });
    if (state.deriv) items.push('<span style="color:' + C.accent + '"><i class="ln" style="background:' + C.accent + '"></i>|ΔpH/ΔV|</span>');
    if (r.endpoint != null) items.push('<span style="color:' + C.equi + '"><i class="ln" style="background:' + C.equi + '"></i>' + T('你的終點', 'your end point') + '</span>');
    $('curveLegend').innerHTML = items.join('');
  }
  function renderSysInfo() {
    const sys = state.sys;
    const eq = {
      sa: 'HCl + NaOH → NaCl + H<sub>2</sub>O',
      wa: 'CH<sub>3</sub>COOH + NaOH → CH<sub>3</sub>COONa + H<sub>2</sub>O',
      wb: 'NH<sub>3</sub> + HCl → NH<sub>4</sub>Cl',
      mx: 'HX + NaOH → NaX + H<sub>2</sub>O'
    }[sys];
    const extra = {
      sa: T('強酸與強鹼完全解離。', 'Both are completely ionised.'),
      wa: T('醋酸 K<sub>a</sub> = 1.8 × 10<sup>−5</sup>。', 'Acetic acid K<sub>a</sub> = 1.8 × 10<sup>−5</sup>.'),
      wb: T('氨 K<sub>b</sub> = 1.8 × 10<sup>−5</sup>；滴定管裡改裝鹽酸。', 'Ammonia K<sub>b</sub> = 1.8 × 10<sup>−5</sup>; the burette now holds HCl.'),
      mx: T('濃度與 K<sub>a</sub> 都不知道：答案欄在滴定曲線的右邊（手機在下方）。', 'Concentration and K<sub>a</sub> unknown — the answer box is next to the titration curve (below it on a phone).')
    }[sys];
    $('sysInfo').innerHTML = eq + '<br>' + extra;
    $('caRow').hidden = sys === 'mx';
    $('mysCard').hidden = sys !== 'mx';
    const th = $('theory');
    th.disabled = mysteryHidden();
    // 停用時理論曲線並沒有畫：勾選框要顯示實際狀態（不打勾），恢復時再顯示學生原本的選擇
    th.checked = !th.disabled && state.theory;
    th.parentElement.style.opacity = th.disabled ? '0.5' : '';
    th.parentElement.title = th.disabled ? T('未知弱酸揭曉答案後才能看理論曲線', 'Available after the unknown acid is revealed') : '';
  }
  function renderAll() {
    renderReadouts(); renderAnalysis(); renderTable(); renderLegend(); renderSysInfo(); updateButtons();
    drawGraph(); kick();
  }
  function updateButtons() {
    const r = state.run;
    if (!r) return;
    const tb = $('tap');
    tb.setAttribute('aria-pressed', String(state.tap));
    tb.textContent = state.tap ? T('關閉活栓', 'Close stopcock') : T('打開活栓', 'Open stopcock');
    $('endBtn').disabled = r.endpoint != null;
    $('endBtn').title = r.endpoint != null ? T('這一瓶的終點已經記錄了；要重做請按「換一瓶」', 'The end point of this flask is recorded; press “New flask” to repeat') : '';
  }

  // ======================= 狀態列 =======================
  let holdUntil = 0;
  function showStatus(msg, warn) {
    const el = $('status');
    el.textContent = msg;
    el.classList.toggle('warn', !!warn);
  }
  /** 重要的訊息（變色、流空、提示）：保留 3.5 秒，不被例行的讀數訊息蓋掉 */
  function setStatus(msg, warn) { showStatus(msg, warn); holdUntil = performance.now() + 3500; }
  function routineStatus(msg) { if (performance.now() >= holdUntil) showStatus(msg, false); }

  // ======================= 音效（預設關閉；主要頻率都在 300 Hz 以上） =======================
  const S = function () { return window.LabSound; };
  let lastDrop = 0;
  function sndDrop(n) {
    const now = performance.now();
    if (now - lastDrop < 75 || (state.tap && state.rate > STREAM_RATE)) return;
    lastDrop = now;
    if (S()) S().sweep({ from: n >= DROP ? 650 : 850, to: n >= DROP ? 1400 : 1750, dur: 0.07, type: 'sine', gain: 0.16 });
  }
  function sndStream() { if (S()) S().noise({ dur: 0.12, gain: 0.06, filter: 2400, q: 0.8 }); }
  function sndColour() {
    if (!S()) return;
    S().tone({ freq: 784, dur: 0.32, type: 'sine', gain: 0.13 });
    S().tone({ freq: 1047, dur: 0.36, type: 'sine', gain: 0.11, delay: 0.07 });
    S().tone({ freq: 1319, dur: 0.42, type: 'triangle', gain: 0.07, delay: 0.14 });
  }
  function sndRecord() { if (S()) S().tone({ freq: 1000, dur: 0.12, type: 'square', gain: 0.1 }); }
  function sndEmpty() { if (S()) S().sweep({ from: 520, to: 300, dur: 0.25, type: 'triangle', gain: 0.14 }); }
  function sndRefill() { if (S()) S().noise({ dur: 0.4, gain: 0.12, filter: 1300, q: 0.9 }); }
  function sndClick() { if (S()) S().tone({ freq: 1320, dur: 0.03, type: 'square', gain: 0.08 }); }
  function sndCheck(ok) {
    if (!S()) return;
    if (ok) { S().tone({ freq: 880, dur: 0.14, type: 'sine', gain: 0.12 }); S().tone({ freq: 1320, dur: 0.2, type: 'sine', gain: 0.1, delay: 0.1 }); }
    else S().sweep({ from: 600, to: 380, dur: 0.22, type: 'triangle', gain: 0.12 });
  }

  // ======================= 控制項 =======================
  const caEl = $('ca'), vaEl = $('va'), vwEl = $('vw'), cbEl = $('cb'), rateEl = $('rate');
  // 濃度：對數刻度 0.0010–1.00 M（滑桿位置 0–300）
  const logMap = {
    toValue: function (pos) { return roundSig(Math.pow(10, -3 + pos / 100), 3); },
    toPos: function (v) { return 100 * (Math.log10(Math.max(0.001, v)) + 3); },
    min: 0.001, max: 1, decimals: 4
  };
  if (window.LabNum) { window.LabNum.register(caEl, logMap); window.LabNum.register(cbEl, logMap); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function readSliders() {
    state.Ca = clamp(val(caEl), 0.001, 1);
    state.Va = clamp(val(vaEl), 5, 50);
    state.Vw = clamp(val(vwEl), 0, 100);
    state.Cb = clamp(val(cbEl), 0.001, 1);
    state.rate = clamp(val(rateEl), 0.1, 2);
    $('cao').textContent = conc(state.Ca) + ' M';
    $('vao').textContent = state.Va.toFixed(2) + ' mL';
    $('vwo').textContent = state.Vw.toFixed(state.Vw % 1 ? 1 : 0) + ' mL';
    $('cbo').textContent = conc(state.Cb) + ' M';
    $('rateo').textContent = state.rate.toFixed(2) + ' mL/s';
  }
  function settingsChanged() {
    const p = state.run.p;
    return p.Va !== state.Va || p.Vw !== state.Vw || p.Cb !== state.Cb || (state.sys !== 'mx' && p.Ca !== state.Ca);
  }
  function freshFlaskNote() {
    const r = state.run, p = r.p, room = VT_MAX - p.Va - p.Vw;
    if (r.Veq > room) return T('注意：當量點需要的滴定液超過錐形瓶的容量，到不了當量點。請提高滴定液的濃度，或減少待測液。', 'Note: the flask cannot hold enough titrant to reach the equivalence point. Use a more concentrated titrant or less sample.');
    if (!mysteryHidden() && r.Veq > K.BURETTE_ML) return T('當量點需要 ' + r.Veq.toFixed(2) + ' mL，超過滴定管的 50 mL：中途要按「補充滴定液」。', 'The equivalence point needs ' + r.Veq.toFixed(2) + ' mL, more than the 50 mL burette holds: refill it on the way.');
    return '';
  }
  [caEl, vaEl, vwEl, cbEl].forEach(function (el) {
    const on = function () {
      readSliders();
      if (!settingsChanged()) return;
      const had = state.run.u > 0;
      newRun();
      renderAll();
      const note = freshFlaskNote();
      setStatus(note || (had ? T('換了一瓶新的溶液，上一瓶的曲線留在圖上。', 'A fresh flask; the previous curve stays on the graph.') : T('換了一瓶新的溶液。', 'A fresh flask.')), !!note);
    };
    el.addEventListener('input', on);
    el.addEventListener('change', on);
  });
  rateEl.addEventListener('input', readSliders);
  rateEl.addEventListener('change', readSliders);

  function pressGroup(sel, attr, value) {
    document.querySelectorAll(sel).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(value))); });
  }
  document.querySelectorAll('#sysSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      const sys = b.getAttribute('data-sys');
      if (sys === state.sys) return;
      state.sys = sys;
      pressGroup('#sysSeg button', 'data-sys', sys);
      newRun();
      renderAll();
      const note = freshFlaskNote();
      const tips = {
        sa: T('鹽酸＋NaOH：當量點的 pH 是 7.00。', 'HCl + NaOH: the equivalence point is at pH 7.00.'),
        wa: T('醋酸＋NaOH：看看起點、緩衝區和當量點的 pH 跟鹽酸有什麼不同。', 'Acetic acid + NaOH: compare the start, the buffer region and the equivalence pH with HCl.'),
        wb: T('氨水＋鹽酸：這次 pH 會往下降。哪一種指示劑比較合適？', 'Ammonia + HCl: this time the pH goes down. Which indicator suits it?'),
        mx: T('未知弱酸：插著 pH 計滴定，找出當量點與半當量點，再到滴定曲線旁的答案欄填答案。', 'Unknown weak acid: titrate it with the pH meter in, find the equivalence and half-equivalence points, then fill in the answer box by the titration curve.')
      };
      setStatus(note || tips[sys], !!note);
    });
  });
  function indSwatches() {
    document.querySelectorAll('#indSeg button').forEach(function (b) {
      const ind = b.getAttribute('data-ind'), sw = b.querySelector('.sw'), I = K.INDICATORS[ind];
      if (!I) { sw.style.background = C.water; return; }
      const a = K.indicatorRGB(ind, I.lo - 1.2, 1), c = K.indicatorRGB(ind, I.hi + 1.2, 1);
      sw.style.background = 'linear-gradient(90deg,' + rgbStr(a) + ' 0 45%,' + rgbStr(c) + ' 55% 100%)';
    });
  }
  document.querySelectorAll('#indSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      const ind = b.getAttribute('data-ind');
      if (ind === state.ind) return;
      state.ind = ind;
      pressGroup('#indSeg button', 'data-ind', ind);
      const r = state.run;
      r.ind = ind;
      r.changedAt = null; r.hinted = false;
      if (r.u > 0) {
        r.indFixed = false;
        if (K.changed(ind, r.pH0, r.pH)) r.changedAt = r.u;
      }
      r.rows.forEach(function (q) { q.fb = K.indicatorFraction(ind, K.pH(r.p, q.u / U)); });
      renderAll();
      if (r.u > 0) {
        setStatus(T('換了指示劑（真實的錐形瓶裡做不到：指示劑加了就拿不出來）。用顏色判斷終點的任務，要在加入滴定液之前選好指示劑。', 'Indicator changed (impossible in a real flask: once added it cannot be removed). For the colour end-point missions, choose the indicator before adding any titrant.'));
        settleIfIdle();
      } else setStatus(ind === 'none' ? T('不加指示劑：只能靠 pH 計了。', 'No indicator: only the pH meter can tell you now.') : T('加了 2 滴' + indName(ind) + '。', 'Two drops of ' + indName(ind) + ' added.'));
    });
  });
  $('meter').addEventListener('change', function () {
    state.meter = $('meter').checked;
    const r = state.run;
    if (state.meter) {
      if (r.u > 0) {
        r.meterUsed = true;
        r.pts.push({ u: r.u, pH: r.pH, m: true });
        settleIfIdle(true);
      } else { r.pts[0].m = true; r.rows[0].pH = r.pH0; }
    }
    sndClick();
    renderAll();
    if (!state.meter) setStatus(T('pH 計的電極放回保存液中了：現在只能看指示劑的顏色。', 'The electrode is back in its storage solution: now you only have the indicator colour.'));
  });
  /** 沒有液滴在空中、活栓關著時，立刻回報目前的狀態（插回 pH 計、換指示劑） */
  function settleIfIdle(force) {
    if (state.tap || state.drops.length) { state.pendingSettle = true; return; }
    if (force || state.run.u > 0) settle();
  }
  $('theory').addEventListener('change', function () { state.theory = $('theory').checked; renderLegend(); drawGraph(); });
  $('deriv').addEventListener('change', function () { state.deriv = $('deriv').checked; renderLegend(); drawGraph(); });

  // ---- 加滴定液 ----
  function addButton(n) {
    const r = state.run;
    const left = K.BURETTE_UNITS - r.fill;
    if (left <= 0) { emptyNotice(); return; }
    if (n > left) setStatus(T('滴定管只剩半滴了。', 'Only half a drop left in the burette.'));
    release(n, true);
  }
  $('drop').addEventListener('click', function () { addButton(DROP); });
  $('half').addEventListener('click', function () { addButton(HALF); });
  $('tap').addEventListener('click', function () {
    if (state.tap) {
      closeTap();
      // 滴定管讀數在關上的那一刻就停了；已經離開管口、還在空中的液滴會照樣落進瓶裡（2 mL/s 時約 0.3 mL）
      const air = state.drops.reduce(function (s, d) { return s + d.n; }, 0) / U;
      setStatus(air >= 0.05
        ? T('活栓關上了，滴定管讀數 ' + vRead(state.run.fill) + ' mL。已經在空中的約 ' + air.toFixed(2) + ' mL 還會落進瓶裡，讀數已經算進去了。', 'Stopcock closed at a burette reading of ' + vRead(state.run.fill) + ' mL. About ' + air.toFixed(2) + ' mL already in the air will still fall into the flask; the reading already includes it.')
        : T('活栓關上了，滴定管讀數 ' + vRead(state.run.fill) + ' mL。', 'Stopcock closed at a burette reading of ' + vRead(state.run.fill) + ' mL.'));
      kick(); return;
    }
    if (K.BURETTE_UNITS - state.run.fill <= 0) { emptyNotice(); return; }
    state.tap = true; state.acc = 0;
    sndClick();
    updateButtons();
    setStatus(T('活栓打開了，流速 ' + state.rate.toFixed(2) + ' mL/s。快到終點前記得關上，改成一滴一滴加。', 'Stopcock open at ' + state.rate.toFixed(2) + ' mL/s. Close it before the end point and go drop by drop.'));
    kick();
  });
  $('endBtn').addEventListener('click', function () {
    const r = state.run;
    if (r.endpoint != null) return;
    if (r.out === 0) { setStatus(T('還沒有加入滴定液。', 'No titrant has been added yet.'), true); return; }
    closeTap();
    // 空中的液滴先落下（終點體積是滴定管流出的總量）
    const flying = state.drops.splice(0);
    flying.forEach(land);
    if (state.meter) r.meterUsed = true;
    const pH = r.pH, Vend = r.out / U, pHeq = r.pHeq;
    r.endpoint = Vend;
    sndRecord();
    renderAll();
    const hid = mysteryHidden();
    setStatus(T('記錄終點：' + vRead(r.out) + ' mL', 'End point recorded: ' + vRead(r.out) + ' mL') +
      (hid ? T('。用它算出未知酸的濃度吧。', '. Use it to work out the concentration of the unknown acid.') :
        T('；當量點 ' + r.Veq.toFixed(2) + ' mL，相差 ' + signed(Vend - r.Veq, 3) + ' mL。', '; equivalence point ' + r.Veq.toFixed(2) + ' mL, difference ' + signed(Vend - r.Veq, 3) + ' mL.')));
    emit('endpoint', {
      sys: r.p.sys, Ca: r.p.Ca, Va: r.p.Va, Vw: r.p.Vw, Cb: r.p.Cb, Vend: Vend, Veq: K.Veq(r.p), err: Vend - K.Veq(r.p), pH: pH, pHeq: pHeq,
      ind: state.ind, indFixed: r.indFixed, moved: K.indicatorMoved(state.ind, r.pH0, pH),
      changed: state.ind !== 'none' && K.changed(state.ind, r.pH0, pH), covers: K.covers(state.ind, pHeq),
      meterUsed: r.meterUsed, mystery: r.p.sys === 'mx'
    });
  });
  $('refill').addEventListener('click', function () {
    const r = state.run;
    if (r.fill === 0) { setStatus(T('滴定管已經是滿的（0.00 mL）。', 'The burette is already full (0.00 mL).')); return; }
    closeTap();
    r.fill = 0;
    sndRefill();
    renderAll();
    setStatus(T('滴定管重新裝滿、調到 0.00 mL。終點的體積是每一管流出的量加起來（這裡自動累計）。', 'Burette refilled to 0.00 mL. The end-point volume is the sum of what each filling delivered (added up automatically here).'));
  });
  $('newFlask').addEventListener('click', function () {
    const had = state.run.u > 0;
    newRun();
    renderAll();
    const note = freshFlaskNote();
    setStatus(note || (had ? T('換上一瓶新的待測液（上一瓶的曲線留在圖上），滴定管也重新裝滿了。', 'A fresh flask of sample (the previous curve stays on the graph), and the burette is refilled.') : T('換上一瓶新的待測液。', 'A fresh flask of sample.')), !!note);
  });
  $('clearAll').addEventListener('click', function () {
    state.archive = [];
    state.flaskNo = 0;
    newRun(false);
    hover = null;
    renderAll();
    setStatus(T('曲線、數據表與終點都清除了；濃度、體積與指示劑的設定沒有改變。', 'Curves, data table and end point cleared; the concentrations, volumes and indicator are unchanged.'));
  });

  // ---- 未知弱酸 ----
  function parseNum(s) {
    s = String(s || '').trim().replace(/[，,]/g, '.').replace(/[×x]\s*10\^?\s*([−-]?\d+)/i, 'e$1').replace(/−/g, '-');
    if (!s) return NaN;
    const v = Number(s);
    return isFinite(v) ? v : NaN;
  }
  $('check').addEventListener('click', function () {
    const s = state.sample;
    const c = parseNum($('ansC').value);
    let pKa = parseNum($('ansP').value);
    if (pKa > 0 && pKa < 0.01) pKa = -Math.log10(pKa);   // 填的是 Ka
    const okC = c > 0, okP = isFinite(pKa) && pKa > 0 && pKa < 14;
    if (!okC && !okP) { $('mysOut').innerHTML = T('請填入濃度（M）或 pK<sub>a</sub>。', 'Enter a concentration (M) or a pK<sub>a</sub>.'); return; }
    const Ka = okP ? Math.pow(10, -pKa) : NaN;
    const d = { c: okC ? c : NaN, pKa: okP ? pKa : NaN, Ka: Ka, cTrue: s.C, KaTrue: s.Ka, errC: okC ? c / s.C - 1 : NaN, errKa: okP ? Ka / s.Ka - 1 : NaN, revealed: s.revealed, flasks: s.flasks };
    const parts = [];
    if (okC) parts.push(Math.abs(d.errC) <= 0.01 ? '<span class="ok">' + T('濃度：誤差在 1% 以內 ✓', 'Concentration: within 1% ✓') + '</span>' : '<span class="no">' + T('濃度：誤差超過 1%', 'Concentration: more than 1% off') + '</span>');
    if (okP) parts.push(Math.abs(d.errKa) <= 0.05 ? '<span class="ok">' + T('K<sub>a</sub>：誤差在 5% 以內 ✓', 'K<sub>a</sub>: within 5% ✓') + '</span>' : '<span class="no">' + T('K<sub>a</sub>：誤差超過 5%', 'K<sub>a</sub>: more than 5% off') + '</span>');
    parts.push(T('這個未知酸用了 ' + s.flasks + ' 瓶。', 'You have used ' + s.flasks + ' flask' + (s.flasks === 1 ? '' : 's') + ' of this acid.') + (s.revealed ? T('（已揭曉，不算任務）', ' (revealed — no missions)') : ''));
    $('mysOut').innerHTML = parts.join('<br>');
    sndCheck((!okC || Math.abs(d.errC) <= 0.01) && (!okP || Math.abs(d.errKa) <= 0.05));
    emit('answer', d);
  });
  $('reveal').addEventListener('click', function () {
    const s = state.sample;
    s.revealed = true;
    renderAll();
    $('mysOut').innerHTML = T('答案：c = ', 'Answer: c = ') + s.C.toFixed(3) + ' M、K<sub>a</sub> = ' + sciHTML(s.Ka, 2) + '（pK<sub>a</sub> = ' + (-Math.log10(s.Ka)).toFixed(2) + '）' +
      T('。圖上已標出當量點與半當量點。', '. The equivalence and half-equivalence points are now marked on the graph.');
  });
  $('newMys').addEventListener('click', function () {
    newSample();
    if (state.sys === 'mx') newRun();
    $('ansC').value = ''; $('ansP').value = '';
    $('mysOut').textContent = T('換了一個新的未知弱酸（樣品 ' + state.sample.no + '）。', 'A new unknown weak acid (sample ' + state.sample.no + ').');
    renderAll();
  });
  ['ansC', 'ansP'].forEach(function (id) {
    $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('check').click(); } });
  });

  // ---- 喇叭按鈕 ----
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  /** 換一瓶新的，直接加到 u 個單位（滴定管讀數 f 個單位）：分享連結還原、縮圖用；不回報任務事件 */
  function jumpTo(u, f) {
    newRun(false);
    const r = state.run, p = r.p;
    const maxU = Math.floor((VT_MAX - p.Va - p.Vw) * U);
    u = Math.max(0, Math.min(maxU, Math.round(+u || 0)));
    for (let k = 0; k < u;) {
      k += Math.min(DROP, u - k);
      r.pts.push({ u: k, pH: K.pH(p, k / U), m: state.meter });
    }
    r.u = r.out = u;
    r.fill = Math.max(0, Math.min(K.BURETTE_UNITS, u, Math.round(f == null ? u : +f || 0)));
    r.pH = K.pH(p, u / U);
    if (u > 0) {
      r.no = ++state.flaskNo;
      r.rows.push({ u: u, pH: state.meter ? r.pH : null, fb: K.indicatorFraction(state.ind, r.pH) });
      if (state.ind !== 'none' && K.changed(state.ind, r.pH0, r.pH)) r.changedAt = u;
      if (state.meter) r.meterUsed = true;
      if (r.sample) { r.counted = true; r.sample.flasks++; }
    }
    renderAll();
  }
  // 縮圖工具（tools/make-thumbs.cjs）用：__abt.jump(25.05) 直接加到 25.05 mL
  window.__abt = { jump: function (mL) { jumpTo(Math.round(mL * U)); } };

  // ---------- 分享目前設定：已加入的滴定液（滑桿與按鈕由 classroom.js 記錄；未知弱酸不分享，免得洩漏答案） ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      const r = state.run;
      return state.sys === 'mx' ? null : { u: r.u, f: r.fill };
    },
    set: function (o) {
      if (!o || typeof o !== 'object' || state.sys === 'mx') return;
      jumpTo(o.u, o.f);
    }
  });

  // ======================= 啟動 =======================
  readColors();
  newSample();
  // 預設：0.100 M 鹽酸 25.00 mL、0.100 M NaOH、酚酞、pH 計在瓶中（直接設滑桿位置，載入時不回報任務事件）
  caEl.value = '200'; cbEl.value = '200';
  if (window.LabNum) { window.LabNum.clear(caEl); window.LabNum.clear(cbEl); }
  readSliders();
  pressGroup('#sysSeg button', 'data-sys', state.sys);
  pressGroup('#indSeg button', 'data-ind', state.ind);
  $('meter').checked = true; $('theory').checked = false; $('deriv').checked = false;
  newRun(false);
  indSwatches();
  updateSoundButton();
  function themeChanged() { readColors(); indSwatches(); if (L) buildStatic(); renderAll(); }
  window.addEventListener('lab:themechange', themeChanged);
  if (window.matchMedia) {
    const dm = window.matchMedia('(prefers-color-scheme: dark)');
    if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  }
  const widths = new WeakMap();
  function observe(el, fn) {
    if (window.ResizeObserver) new ResizeObserver(function () { if (el.clientWidth !== widths.get(el)) { widths.set(el, el.clientWidth); fn(); } }).observe(el);
    window.addEventListener('resize', fn);
  }
  observe(cv, function () { resizeBench(); drawBench(); kick(); });
  observe(gcv, resizeGraph);
  resizeBench(); resizeGraph();
  renderAll();
  setStatus(T('預設：0.100 M 鹽酸 25.00 mL，加了酚酞，滴定管裝 0.100 M NaOH。先打開活栓快速加，接近 25 mL 時改成一滴一滴。', 'Default: 25.00 mL of 0.100 M HCl with phenolphthalein, 0.100 M NaOH in the burette. Open the stopcock to add quickly, then go drop by drop near 25 mL.'));
  drawBench();
  kick();
})();
