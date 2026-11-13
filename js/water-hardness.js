/* water-hardness.js — 「水的硬度」的畫面與互動（化學計算全部在 water-hardness-core.js；3D 微觀在 water-hardness-3d.js） */
(function () {
  'use strict';
  const K = window.HardCore;
  const LD = window.LabDraw;
  if (!K || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FF = LD.FONT;
  const reduced = LD.reducedMotion();

  // ---------- 固定的數值 ----------
  const U = K.UNITS_PER_ML;       // 1 單位 = 半滴 = 0.025 mL，一滴 = 2 單位
  const DROP = 2, HALF = 1;
  const VT_MAX = 290;             // 錐形瓶最多裝到 290 mL
  const STREAM_RATE = 0.6;        // 流速超過 0.6 mL/s 時，液滴連成細流
  const G_PX = 9800;              // 液滴下落的重力加速度（畫面上每秒平方 px）
  const STIR_W = 2 * Math.PI * 2; // 攪拌子每秒 2 轉（畫面效果）
  const VIS = 1.35;               // 畫面上的顏色加強（穿透率取 1.35 次方，淡色在螢幕上才看得出來；不影響任何計算）

  // ======================= 格式 =======================
  function vRead(units) { return (Math.round(units * 2.5) / 100).toFixed(2); }
  function num(x, d) { const s = Math.abs(x).toFixed(d); return (x < 0 && +s !== 0 ? '−' : '') + s; }
  function signed(x, d) { const s = Math.abs(x).toFixed(d); if (+s === 0) return '±' + s; return (x > 0 ? '+' : '−') + s; }
  function sigf(x, sig) {
    if (x == null || !isFinite(x)) return '—';
    if (x === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(x)));
    return num(x, Math.max(0, Math.min(8, (sig || 3) - 1 - e)));
  }
  /** 科學記號：{ m 尾數字串, e 次方（null = 不用科學記號） } */
  function sciParts(x, sig) {
    if (x == null || !isFinite(x) || x === 0) return { m: x === 0 ? '0' : '—', e: null };
    const e = Math.floor(Math.log10(Math.abs(x)));
    if (e >= -2 && e < 4) return { m: sigf(x, sig), e: null };
    const m = x / Math.pow(10, e);
    if (Math.abs(+m.toFixed((sig || 3) - 1)) >= 10) return sciParts(Math.sign(x) * Math.pow(10, e + 1), sig);
    return { m: num(m, (sig || 3) - 1), e: e };
  }
  function sciHTML(x, sig) { const p = sciParts(x, sig); return p.e == null ? p.m : p.m + ' × 10<sup>' + num(p.e, 0) + '</sup>'; }
  /** mg/L：小於 10 用兩位小數，其餘一位 */
  function fmg(x) { if (!isFinite(x)) return '—'; const a = Math.abs(x); return num(x, a < 10 ? 2 : 1); }
  function fH(x) { return isFinite(x) ? num(x, 1) : '—'; }
  /** 小數位數在 lo–hi 之間，去掉多餘的 0（滑桿旁的數字和 LabNum.value 一致） */
  function fdec(x, lo, hi) { let s = x.toFixed(hi); while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > lo && s.slice(-1) === '0') s = s.slice(0, -1); return s.replace(/\.$/, ''); }
  function fpc(x) { return isFinite(x) ? Math.round(x * 100) + '%' : '—'; }

  // ======================= 名稱 =======================
  const PRESET_NAMES = {
    dist: ['蒸餾水', 'distilled water'], soft: ['軟水（山區水庫）', 'soft water (mountain reservoir)'], tap: ['自來水', 'tap water'],
    ground: ['地下水（石灰岩地區）', 'groundwater (limestone area)'], mineral: ['礦泉水（含鎂多）', 'mineral water (rich in magnesium)'],
    mys: ['未知水樣', 'unknown water'], custom: ['自訂的水', 'custom water']
  };
  const CLASS_NAMES = { soft: ['軟水', 'soft'], moderate: ['中度硬水', 'moderately hard'], hard: ['硬水', 'hard'], veryhard: ['極硬水', 'very hard'] };
  const COLOUR_NAMES = { red: ['酒紅色', 'wine red'], redpurple: ['紅紫色', 'red-purple'], purple: ['紫色', 'purple'], bluepurple: ['藍紫色', 'blue-purple'], blue: ['純藍色', 'pure blue'] };
  const tn = function (a) { return T(a[0], a[1]); };

  // ======================= 狀態 =======================
  let seed = (Date.now() % 2147483646) + 1;
  const rng = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const B = K.createBench();
  const S = K.createSession(rng);
  K.newSample(S);
  const state = {
    mode: 'A', mgEdta: false, Va: 50, cE: 0.01, rate: 0.5, meter: true, theory: false, deriv: false, dose: 200,
    tap: false, acc: 0, cock: 0, stir: 0, drops: [], plumes: [], ripples: [], flash: 0, flashCol: null, tag: null, pendingSettle: false,
    banim: null, shake: 0, soapDrop: null, view: '2d', t: 0
  };
  Object.defineProperty(state, 'run', { get: function () { return S.run; } });
  const isMys = function () { return B.preset === 'mys'; };
  const mysteryHidden = function () { return isMys() && !S.sample.revealed; };

  /** 錐形瓶要用的水：目前燒杯裡的水（未知水樣用答案的組成） */
  function titrWater() {
    const i = K.benchInfo(B);
    if (isMys()) return { Ca: i.c.Ca, Mg: i.c.Mg, H: i.H, Hca: i.Hca, preset: 'mys', bottle: B.bottle, step: 0, boiled: 0, unknown: true, no: S.sample.no };
    return { Ca: i.c.Ca, Mg: i.c.Mg, H: i.H, Hca: i.Hca, preset: B.preset, bottle: B.bottle, step: B.step, boiled: B.boiled, unknown: false };
  }

  // ======================= 色彩 =======================
  let C = {};
  function readColors() {
    LD.refresh();
    C = Object.assign({}, LD.c);
    const cs = getComputedStyle(document.documentElement);
    C.chem = cs.getPropertyValue('--b-organic').trim() || C.probe;
    C.unknown = cs.getPropertyValue('--b-matter').trim() || C.accent;
    C.dark = LD.dark;
    C.bench = C.dark ? LD.mix(C.surface, C.text, 0.07) : LD.mix(C.surface, C.muted, 0.15);
    C.metal = C.dark ? LD.mix(C.muted, C.text, 0.3) : LD.mix(C.muted, C.surface, 0.3);
    C.metalDark = LD.shade(C.metal, -0.35);
    C.iron = C.dark ? LD.mix(C.surface, C.text, 0.2) : LD.mix(C.text, C.surface, 0.22);
    C.housing = C.dark ? LD.mix(C.surface, C.text, 0.14) : LD.mix(C.surface, C.muted, 0.09);
    C.ceramic = C.dark ? LD.mix(C.surface, C.text, 0.32) : LD.mix(C.surface, C.text, 0.14);
    C.glassEdge = C.dark ? LD.alpha(C.text, 0.5) : LD.alpha(C.field, 0.5);
    C.glassTint = C.dark ? LD.alpha(C.text, 0.06) : LD.alpha(C.neg, 0.05);
    C.water = C.dark ? LD.mix(C.text, C.neg, 0.06) : LD.mix(C.surface, C.neg, 0.04);
    C.waterBody = C.dark ? LD.alpha(LD.mix(C.neg, C.surface, 0.55), 0.35) : LD.alpha(LD.mix(C.neg, C.surface, 0.8), 0.55);
    C.white = C.dark ? LD.mix(C.text, C.surface, 0.08) : LD.mix(C.surface, C.muted, 0.06);
    C.scale = C.dark ? LD.mix(C.text, C.equi, 0.15) : LD.mix(C.surface, C.equi, 0.18);
    C.ptfe = C.dark ? LD.mix(C.text, C.surface, 0.06) : LD.mix(C.surface, C.muted, 0.1);
    C.lcd = C.dark ? LD.shade(C['canvas-bg'], -0.4) : LD.shade(C.field, -0.55);
    C.lcdInk = C.dark ? C.probe : LD.shade(C.probe, 0.35);
    C.glow = C.pos;
    C.wood = C.dark ? LD.mix(C.equi, C.surface, 0.55) : LD.mix(C.equi, C.surface, 0.45);
    C.resin = C.dark ? LD.mix(C.equi, C.text, 0.35) : LD.mix(C.equi, C.surface, 0.55);
    C.resinCa = C.dark ? LD.mix(C.pos, C.equi, 0.45) : LD.shade(LD.mix(C.pos, C.equi, 0.5), -0.1);
    C.resinMg = C.dark ? LD.mix(C.equi, C.text, 0.05) : LD.shade(C.equi, 0.05);
    C.ion = { Ca: C.probe, Mg: C.equi, Na: C.dark ? LD.mix(C.neg, C.text, 0.35) : LD.mix(C.neg, C.muted, 0.35), q: C.muted };
  }
  const rgbStr = function (c, a) { return a == null ? 'rgb(' + c.join(',') + ')' : 'rgba(' + c.join(',') + ',' + a + ')'; };
  /** 錐形瓶溶液的顏色：穿透率 × 底色（比爾定律）；Mg(OH)2 讓它帶一點白色混濁 */
  function flaskRGB(run) {
    const tr = K.transmit(run), w = LD.rgb(C.water);
    return w.map(function (x, i) { return Math.round(x * Math.pow(tr.T[i], VIS)); });
  }

  // ======================= 第一部分：工作台（水樣、軟化、肥皂試驗） =======================
  const BLAY = {
    wide: { W: 820, H: 420, benches: [360], mag: [112, 148, 92], pc: 12, bx: 315, bBot: 332, plate: [238, 392],
      col: { x: 498, top: 66, bot: 292, rod: 556, recv: [474, 522] }, tube: { x: 648, top: 150, bot: 338 }, rack: [606, 700], bottle: [724, 784], text: 360 },
    narrow: { W: 370, H: 660, benches: [318, 608], mag: [92, 128, 80], pc: 10, bx: 268, bBot: 292, plate: [196, 340],
      col: { x: 92, top: 370, bot: 552, rod: 150, recv: [68, 116] }, tube: { x: 236, top: 412, bot: 586 }, rack: [196, 286], bottle: [300, 352], text: 608 }
  };
  const bcv = $('bcv'), bctx = bcv.getContext('2d');
  const bstat = document.createElement('canvas'), bsctx = bstat.getContext('2d');
  let BL = null;
  function resizeBench1() {
    const W = bcv.clientWidth;
    if (!W) return;
    const D = W >= 600 ? BLAY.wide : BLAY.narrow;
    const s = W / D.W, H = Math.round(D.H * s) + (D === BLAY.wide ? 40 : 34);
    if (bcv.style.height !== H + 'px') bcv.style.height = H + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    [bcv, bstat].forEach(function (c) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
    BL = Object.assign({}, D, { s: s, Wpx: W, Hpx: H, dpr: dpr, wide: D === BLAY.wide });
    buildBenchStatic();
  }
  /** 燒杯的幾何：內半徑 5.25 cm、高 15 cm；V（L）的液面高度 */
  function beaker() {
    const pc = BL.pc, r = 5.25 * pc, h = 15 * pc;
    return { cx: BL.bx, r: r, bot: BL.bBot, top: BL.bBot - h, lvl: function (VL) { return BL.bBot - VL * 1000 / (Math.PI * 5.25 * 5.25) * pc; } };
  }
  function buildBenchStatic() {
    const g = bsctx, s = BL.s;
    g.setTransform(BL.dpr, 0, 0, BL.dpr, 0, 0);
    LD.backdrop(g, BL.Wpx, BL.Hpx);
    g.setTransform(BL.dpr * s, 0, 0, BL.dpr * s, 0, 0);
    const W = BL.W;
    BL.benches.forEach(function (by, i) {
      const h = i === BL.benches.length - 1 ? (BL.Hpx / s - by) : 20;
      const bg = g.createLinearGradient(0, by, 0, by + h);
      bg.addColorStop(0, LD.shade(C.bench, C.dark ? 0.06 : 0.04));
      bg.addColorStop(1, LD.shade(C.bench, C.dark ? -0.25 : -0.1));
      g.fillStyle = bg; g.fillRect(0, by, W, h);
      g.fillStyle = LD.alpha(LD.shade(C.bench, 0.5), 0.6); g.fillRect(0, by, W, 1);
      const sh = g.createLinearGradient(0, by - 12, 0, by);
      sh.addColorStop(0, LD.shadowInk(0)); sh.addColorStop(1, LD.shadowInk(C.dark ? 0.16 : 0.05));
      g.fillStyle = sh; g.fillRect(0, by - 12, W, 12);
    });
    const by0 = BL.benches[0], by1 = BL.benches[BL.benches.length - 1];
    // 加熱板
    const p0 = BL.plate[0], p1 = BL.plate[1], pt = BL.bBot + 2;
    LD.contactShadow(g, (p0 + p1) / 2, by0, (p1 - p0) / 2, 0);
    LD.block(g, p0, pt + 4, p1 - p0, by0 - pt - 4, C.housing, { r: 5 });
    LD.block(g, p0 + 6, pt, p1 - p0 - 12, 6, C.ceramic, { r: 2, shadow: false });
    LD.ball(g, p0 + 16, (pt + by0) / 2 + 3, 5, LD.mix(C.housing, C.glow, 0.45), { shadow: false, glow: 0 });
    // 燒杯後面的玻璃
    const bk = beaker();
    const fg = g.createLinearGradient(bk.cx - bk.r, 0, bk.cx + bk.r, 0);
    fg.addColorStop(0, LD.alpha(C.text, C.dark ? 0.06 : 0.035)); fg.addColorStop(0.5, C.glassTint); fg.addColorStop(1, LD.alpha(C.text, C.dark ? 0.08 : 0.05));
    g.fillStyle = fg; g.fillRect(bk.cx - bk.r, bk.top, 2 * bk.r, bk.bot - bk.top);
    // 樹脂管柱的鐵架與承接燒杯
    const cl = BL.col, cy = (BL.wide ? by0 : by1);
    LD.contactShadow(g, cl.rod, cy, 26, 0);
    LD.block(g, cl.rod - 26, cy - 8, 52, 8, C.iron, { r: 2 });
    LD.tube(g, function (c) { c.moveTo(cl.rod, cy - 8); c.lineTo(cl.rod, cl.top - 16); }, C.metal, 7);
    LD.tube(g, function (c) { c.moveTo(cl.rod - 4, (cl.top + cl.bot) / 2); c.lineTo(cl.x + 14, (cl.top + cl.bot) / 2); }, C.metal, 4.5);
    LD.block(g, cl.rod - 8, (cl.top + cl.bot) / 2 - 8, 16, 16, C.metalDark, { r: 3 });
    const rv = cl.recv;
    LD.contactShadow(g, (rv[0] + rv[1]) / 2, cy, (rv[1] - rv[0]) / 2, 0);
    // 試管架與滴瓶
    const tb = BL.tube, ty = (BL.wide ? by0 : by1);
    LD.contactShadow(g, (BL.rack[0] + BL.rack[1]) / 2, ty, (BL.rack[1] - BL.rack[0]) / 2, 0);
    LD.contactShadow(g, (BL.bottle[0] + BL.bottle[1]) / 2, ty, (BL.bottle[1] - BL.bottle[0]) / 2, 0);
    LD.block(g, BL.rack[0], ty - 52, BL.rack[1] - BL.rack[0], 8, C.wood, { r: 2 });
    LD.block(g, BL.rack[0], ty - 10, BL.rack[1] - BL.rack[0], 10, C.wood, { r: 2 });
    [BL.rack[0] + 6, BL.rack[1] - 12].forEach(function (x) { LD.block(g, x, ty - 52, 6, 50, LD.shade(C.wood, -0.12), { r: 1, shadow: false }); });
    // 放大鏡的陰影
    const m = BL.mag;
    g.save();
    g.shadowColor = LD.shadowInk(C.dark ? 0.5 : 0.25); g.shadowBlur = 10; g.shadowOffsetY = 3;
    g.fillStyle = C['canvas-bg'];
    g.beginPath(); g.arc(m[0], m[1], m[2] + 3, 0, Math.PI * 2); g.fill();
    g.restore();
    void tb;
  }

  // 放大鏡裡離子的固定亂數位置（每種最多 90 顆）
  const ION_SEEDS = (function () {
    let s = 17; const r = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const o = {};
    ['Ca', 'Mg', 'Na'].forEach(function (k) { o[k] = []; for (let i = 0; i < 90; i++) o[k].push({ r: Math.sqrt(r()), a: r() * Math.PI * 2, w: 0.4 + r() * 0.8, p: r() * 6.28 }); });
    return o;
  })();
  function ionCounts() {
    const i = K.benchInfo(B);
    return { Ca: Math.min(90, Math.round(i.c.Ca * 20)), Mg: Math.min(90, Math.round(i.c.Mg * 20)), Na: Math.min(90, Math.round(i.c.Na * 20)) };
  }
  function drawMagnifier1(g) {
    const m = BL.mag, mx = m[0], my = m[1], R = m[2], bk = beaker(), t = state.t;
    // 指向燒杯的虛線
    g.strokeStyle = LD.alpha(C.accent, 0.7); g.lineWidth = 1; g.setLineDash([3, 3]);
    const lx = bk.cx - bk.r * 0.4, ly = bk.lvl(B.water.V) + 22;
    const ang = Math.atan2(ly - my, lx - mx);
    g.beginPath(); g.moveTo(mx + (R + 3) * Math.cos(ang), my + (R + 3) * Math.sin(ang)); g.lineTo(lx, ly); g.stroke();
    g.setLineDash([]);
    g.beginPath(); g.arc(lx, ly, 3, 0, Math.PI * 2); g.stroke();
    g.save();
    g.beginPath(); g.arc(mx, my, R - 1, 0, Math.PI * 2); g.clip();
    const wg = g.createRadialGradient(mx - R * 0.3, my - R * 0.3, R * 0.1, mx, my, R);
    wg.addColorStop(0, LD.mix(C['canvas-bg'], C.neg, C.dark ? 0.12 : 0.06)); wg.addColorStop(1, LD.mix(C['canvas-bg'], C.neg, C.dark ? 0.2 : 0.13));
    g.fillStyle = wg; g.fillRect(mx - R, my - R, 2 * R, 2 * R);
    const n = ionCounts(), mys = isMys() && !S.sample.revealed;
    const drawSet = function (k, cnt, rad) {
      const col = mys ? C.ion.q : C.ion[k];
      for (let i = 0; i < cnt; i++) {
        const q = ION_SEEDS[k][i], a = q.a + (reduced ? 0 : Math.sin(t * 0.3 * q.w + q.p) * 0.25);
        const rr = (R - rad - 3) * q.r;
        const x = mx + rr * Math.cos(a) + (reduced ? 0 : 2.2 * Math.sin(t * 1.7 * q.w + q.p * 3));
        const y = my + rr * Math.sin(a) + (reduced ? 0 : 2.2 * Math.cos(t * 1.3 * q.w + q.p * 2));
        LD.ball(g, x, y, rad, col, { shadow: false, glow: 0 });
      }
    };
    drawSet('Na', n.Na, 3.2);
    drawSet('Mg', n.Mg, 4.6);
    drawSet('Ca', n.Ca, 5.4);
    if (mys) LD.haloText(g, '?', mx, my, C.unknown, 'center', 'middle', '700 34px ' + FF);
    const lg = g.createRadialGradient(mx - R * 0.35, my - R * 0.4, R * 0.05, mx, my, R);
    lg.addColorStop(0, LD.alpha(C.surface, C.dark ? 0.12 : 0.3)); lg.addColorStop(0.6, LD.alpha(C.surface, 0)); lg.addColorStop(1, LD.shadowInk(C.dark ? 0.25 : 0.08));
    g.fillStyle = lg; g.fillRect(mx - R, my - R, 2 * R, 2 * R);
    g.restore();
    g.strokeStyle = C.metalDark; g.lineWidth = 6;
    g.beginPath(); g.arc(mx, my, R + 1, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = LD.alpha(LD.shade(C.metal, 0.5), 0.8); g.lineWidth = 1.2;
    g.beginPath(); g.arc(mx, my, R + 2, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
  }
  /** 加熱板、燒杯與水（煮沸時冒泡、水垢在杯底） */
  function drawBeaker1(g) {
    const bk = beaker(), V = B.water.V, an = state.banim, t = state.t;
    const boiling = an && an.kind === 'boil' ? Math.sin(Math.PI * Math.min(1, an.t / an.dur)) : 0;
    // 加熱板發熱
    if (boiling > 0) {
      const gl = g.createRadialGradient(bk.cx, BL.bBot + 3, 4, bk.cx, BL.bBot + 3, bk.r * 1.5);
      gl.addColorStop(0, LD.alpha(C.glow, 0.45 * boiling)); gl.addColorStop(1, LD.alpha(C.glow, 0));
      g.fillStyle = gl; g.fillRect(bk.cx - bk.r * 1.6, BL.bBot - 30, bk.r * 3.2, 40);
    }
    // 水
    const y = bk.lvl(V);
    const wg = g.createLinearGradient(bk.cx - bk.r, 0, bk.cx + bk.r, 0);
    wg.addColorStop(0, LD.shade(C.waterBody, -0.15)); wg.addColorStop(0.45, C.waterBody); wg.addColorStop(1, LD.shade(C.waterBody, -0.22));
    g.fillStyle = wg; g.fillRect(bk.cx - bk.r + 1, y, 2 * bk.r - 2, bk.bot - y);
    // 水垢（白色的 CaCO3、Mg(OH)2 硬殼）：厚度 ∝ 質量
    if (B.scale > 0.5) {
      const th = Math.min(7, 1.2 + Math.sqrt(B.scale) * 0.3);
      const sg = g.createLinearGradient(0, bk.bot - th, 0, bk.bot);
      sg.addColorStop(0, LD.shade(C.scale, 0.1)); sg.addColorStop(1, LD.shade(C.scale, -0.12));
      g.fillStyle = sg;
      g.beginPath(); g.moveTo(bk.cx - bk.r + 1, bk.bot);
      for (let x = -1; x <= 1.0001; x += 0.05) g.lineTo(bk.cx + x * (bk.r - 1), bk.bot - th * (0.75 + 0.25 * Math.sin(x * 17 + 1.3)));
      g.lineTo(bk.cx + bk.r - 1, bk.bot); g.closePath(); g.fill();
      g.fillStyle = LD.alpha(C.scale, 0.9); g.fillRect(bk.cx - bk.r + 1, bk.bot - th * 3.2, 2.2, th * 3);
      g.fillRect(bk.cx + bk.r - 3.2, bk.bot - th * 3.2, 2.2, th * 3);
    }
    // 洗滌鹼：白色沉澱雲往下沉，最後濾掉
    if (an && an.kind === 'soda') {
      const u = an.t / an.dur, a = u < 0.15 ? u / 0.15 : 1 - Math.max(0, (u - 0.7) / 0.3);
      for (let i = 0; i < 46; i++) {
        const q = ION_SEEDS.Na[i], x = bk.cx + (q.r * 2 - 1) * (bk.r - 8);
        const y0 = y + 8 + q.a / 6.28 * 20, yy = Math.min(bk.bot - 4, y0 + (bk.bot - y0) * Math.min(1, u * 1.4 * q.w));
        g.fillStyle = LD.alpha(C.white, 0.75 * a); g.beginPath(); g.arc(x, yy, 1.4 + q.w * 1.6, 0, Math.PI * 2); g.fill();
      }
    }
    // 樹脂處理過的水從上方倒回：一道水流
    if (an && an.kind === 'resin' && an.t / an.dur < 0.8) {
      const a = Math.sin(Math.PI * Math.min(1, an.t / (an.dur * 0.8)));
      g.strokeStyle = LD.alpha(C.neg, 0.45 * a); g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(bk.cx + bk.r * 0.4, bk.top - 18); g.quadraticCurveTo(bk.cx + bk.r * 0.42, bk.top + 10, bk.cx + bk.r * 0.35, y); g.stroke();
    }
    // 沸騰的氣泡
    if (boiling > 0 && !reduced) {
      for (let i = 0; i < 30; i++) {
        const q = ION_SEEDS.Ca[i], ph = (t * (0.8 + q.w) + q.p) % 1;
        const x = bk.cx + (q.r * 2 - 1) * (bk.r - 8), yy = bk.bot - 4 - ph * (bk.bot - y - 6);
        g.strokeStyle = LD.alpha(C.surface, 0.8 * boiling); g.lineWidth = 0.8;
        g.beginPath(); g.arc(x, yy, 1.2 + ph * 2.4, 0, Math.PI * 2); g.stroke();
      }
      g.save(); g.lineCap = 'round';
      for (let j = 0; j < 4; j++) {
        const ph = (t * 0.5 + j / 4) % 1, x0 = bk.cx - 24 + j * 16;
        g.strokeStyle = LD.alpha(C.dark ? C.text : C.muted, 0.3 * boiling * Math.sin(Math.PI * ph)); g.lineWidth = 2.5 + 3 * ph;
        g.beginPath();
        for (let k = 0; k <= 8; k++) { const yy = bk.top - 4 - ph * 50 - k * 3.4, x = x0 + 4 * Math.sin(k * 0.9 + t * 2 + j * 2) * (0.3 + ph); if (k) g.lineTo(x, yy); else g.moveTo(x, yy); }
        g.stroke();
      }
      g.restore();
    }
    // 液面
    g.fillStyle = LD.alpha(LD.mix(C.waterBody, C.surface, 0.5), 0.9);
    g.beginPath(); g.ellipse(bk.cx, y, bk.r - 1, 3.2, 0, 0, Math.PI * 2); g.fill();
    // 玻璃與刻度
    g.strokeStyle = C.glassEdge; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(bk.cx - bk.r - 4, bk.top - 2); g.lineTo(bk.cx - bk.r, bk.top + 2); g.lineTo(bk.cx - bk.r, bk.bot - 4);
    g.quadraticCurveTo(bk.cx - bk.r, bk.bot, bk.cx - bk.r + 4, bk.bot); g.lineTo(bk.cx + bk.r - 4, bk.bot);
    g.quadraticCurveTo(bk.cx + bk.r, bk.bot, bk.cx + bk.r, bk.bot - 4); g.lineTo(bk.cx + bk.r, bk.top); g.stroke();
    g.fillStyle = LD.alpha(C.surface, C.dark ? 0.2 : 0.6); g.fillRect(bk.cx - bk.r + 4, bk.top + 6, 2.5, bk.bot - bk.top - 14);
    g.strokeStyle = LD.alpha(C.text, C.dark ? 0.55 : 0.5); g.lineWidth = 0.8;
    for (let v = 200; v <= 1000; v += 100) {
      const yy = bk.lvl(v / 1000), len = v % 200 ? 6 : 11;
      g.beginPath(); g.moveTo(bk.cx + bk.r - 2, yy); g.lineTo(bk.cx + bk.r - 2 - len, yy); g.stroke();
    }
  }
  /** 離子交換樹脂管柱：上面一段是用過的（Ca 帶、Mg 帶），下面是鈉型 */
  function drawColumn(g) {
    const cl = BL.col, x = cl.x, w = BL.wide ? 13 : 11, top = cl.top, bed0 = top + 30, bed1 = cl.bot - 10;
    const an = state.banim, flow = an && (an.kind === 'resin' || an.kind === 'regen') ? an.t / an.dur : -1;
    // 上方的儲液漏斗
    g.fillStyle = LD.alpha(C.text, C.dark ? 0.06 : 0.04);
    g.beginPath(); g.moveTo(x - w - 10, top - 14); g.lineTo(x + w + 10, top - 14); g.lineTo(x + w, top + 10); g.lineTo(x - w, top + 10); g.closePath(); g.fill();
    if (flow >= 0 && flow < 0.7) {
      const lv = 1 - flow / 0.7;
      g.fillStyle = an.kind === 'regen' ? LD.alpha(C.white, 0.8) : C.waterBody;
      g.beginPath(); g.moveTo(x - w - 10 * lv, top + 10 - 24 * lv); g.lineTo(x + w + 10 * lv, top + 10 - 24 * lv); g.lineTo(x + w, top + 10); g.lineTo(x - w, top + 10); g.closePath(); g.fill();
    }
    g.strokeStyle = C.glassEdge; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(x - w - 10, top - 14); g.lineTo(x - w, top + 10); g.moveTo(x + w + 10, top - 14); g.lineTo(x + w, top + 10); g.stroke();
    // 管內的水
    g.fillStyle = C.waterBody; g.fillRect(x - w + 1, top + 10, 2 * w - 2, bed1 - top - 10);
    // 樹脂珠：用掉的比例從上往下
    const used = (K.RESIN_Q - B.resin.left) / K.RESIN_Q, fCa = B.resin.Ca / Math.max(1e-9, B.resin.Ca + B.resin.Mg);
    const rows = Math.floor((bed1 - bed0) / 5.2), cols = Math.max(3, Math.floor((2 * w - 2) / 5.2));
    for (let i = 0; i < rows; i++) {
      const fr = (i + 0.5) / rows;
      let col = C.resin;
      if (fr < used) col = fr < used * fCa ? C.resinCa : C.resinMg;
      for (let j = 0; j < cols; j++) {
        const bx = x - w + 3.6 + j * (2 * w - 7) / (cols - 1) + (i % 2 ? 1.3 : -1.3), by = bed0 + 2.6 + i * 5.2;
        LD.ball(g, Math.max(x - w + 3, Math.min(x + w - 3, bx)), by, 2.5, col, { shadow: false, glow: 0 });
      }
    }
    // 流動：一道亮帶往下走
    if (flow >= 0) {
      const yy = bed0 + (bed1 - bed0) * Math.min(1, flow / 0.8);
      const fg = g.createLinearGradient(0, yy - 26, 0, yy + 4);
      fg.addColorStop(0, LD.alpha(an.kind === 'regen' ? C.white : C.neg, 0)); fg.addColorStop(1, LD.alpha(an.kind === 'regen' ? C.white : C.neg, 0.35));
      g.fillStyle = fg; g.fillRect(x - w + 1, Math.max(bed0, yy - 26), 2 * w - 2, Math.min(30, yy - bed0 + 4));
    }
    // 玻璃管、玻璃棉、活栓、尖端
    g.strokeStyle = C.glassEdge; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x - w, top + 10); g.lineTo(x - w, bed1 + 4); g.quadraticCurveTo(x - w, bed1 + 12, x - 4, bed1 + 14); g.lineTo(x - 2.5, cl.bot + 20);
    g.moveTo(x + w, top + 10); g.lineTo(x + w, bed1 + 4); g.quadraticCurveTo(x + w, bed1 + 12, x + 4, bed1 + 14); g.lineTo(x + 2.5, cl.bot + 20); g.stroke();
    g.fillStyle = LD.alpha(C.white, 0.9); g.fillRect(x - w + 1, bed1, 2 * w - 2, 5);
    g.fillStyle = LD.alpha(C.surface, C.dark ? 0.2 : 0.6); g.fillRect(x - w + 2, top + 12, 1.6, bed1 - top - 14);
    LD.block(g, x - 9, cl.bot + 6, 18, 8, C.ptfe, { r: 3, shadow: false, stroke: LD.alpha(C.text, 0.35) });
    // 承接的小燒杯
    const rv = cl.recv, ry = BL.wide ? BL.benches[0] : BL.benches[1], rt = ry - 40;
    if (flow >= 0 && flow < 0.9 && !reduced) {
      const ph = (state.t * 6) % 1;
      LD.ball(g, x, cl.bot + 22 + ph * (ry - cl.bot - 30), 1.8, an.kind === 'regen' ? C.white : C.neg, { shadow: false, glow: 0 });
    }
    g.fillStyle = C.waterBody; g.fillRect(rv[0] + 1, ry - 14, rv[1] - rv[0] - 2, 13);
    g.strokeStyle = C.glassEdge; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(rv[0], rt); g.lineTo(rv[0], ry - 1); g.lineTo(rv[1], ry - 1); g.lineTo(rv[1], rt); g.stroke();
  }
  /** 肥皂試驗的試管：浮渣、混濁、泡沫 */
  function drawTube(g) {
    const tb = BL.tube, x = tb.x, r = 10, bot = tb.bot, top = tb.top, info = soapNow();
    const pcm = (BL.wide ? 20 : 18);
    const hLiq = info.V / (Math.PI * 0.75 * 0.75) * pcm;                // cm → px（內半徑 0.75 cm）
    const ys = bot - hLiq;
    const sh = state.shake > 0 ? Math.sin(state.shake * 40) * 0.07 * state.shake : 0;
    g.save();
    g.translate(x, bot); g.rotate(sh); g.translate(-x, -bot);
    // 液體
    g.save();
    g.beginPath(); g.moveTo(x - r + 1, ys); g.lineTo(x - r + 1, bot - r); g.arc(x, bot - r, r - 1, Math.PI, 0, true); g.lineTo(x + r - 1, ys); g.closePath(); g.clip();
    g.fillStyle = C.waterBody; g.fillRect(x - r, ys, 2 * r, hLiq + 2);
    // 浮渣：金屬肥皂讓水變混濁
    const turb = Math.min(1, info.ppt / 12);
    if (turb > 0) { g.fillStyle = LD.alpha(C.white, 0.18 + 0.55 * turb); g.fillRect(x - r, ys, 2 * r, hLiq + 2); }
    g.restore();
    // 浮在液面的浮渣片
    const flakes = Math.round(Math.min(14, info.ppt * 1.2));
    for (let i = 0; i < flakes; i++) {
      const q = ION_SEEDS.Mg[i];
      g.fillStyle = LD.alpha(LD.shade(C.white, -0.12), 0.95);
      g.beginPath(); g.ellipse(x - r + 3 + q.r * (2 * r - 6), ys + 1.5 + q.w * 2, 1.6 + q.w * 1.4, 0.9, q.a, 0, Math.PI * 2); g.fill();
    }
    // 泡沫：持久的泡沫在液面上堆高
    const foamH = info.lather ? 8 + 46 * info.foam : (state.shake > 0 ? 6 * state.shake : 0);
    if (foamH > 0.5) {
      for (let i = 0; i < 60; i++) {
        const q = ION_SEEDS.Ca[i], fy = ys - q.r * foamH, fx = x - r + 2 + ((q.a / 6.28) * (2 * r - 4));
        if (fy < top + 6) continue;
        const rr = 1.4 + q.w * 2.1;
        g.fillStyle = LD.alpha(C.surface, C.dark ? 0.55 : 0.85); g.strokeStyle = LD.alpha(C.text, C.dark ? 0.35 : 0.22); g.lineWidth = 0.6;
        g.beginPath(); g.arc(fx, fy, rr, 0, Math.PI * 2); g.fill(); g.stroke();
      }
    }
    // 玻璃
    g.strokeStyle = C.glassEdge; g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(x - r - 2, top); g.lineTo(x - r, top + 3); g.lineTo(x - r, bot - r); g.arc(x, bot - r, r, Math.PI, 0, true); g.lineTo(x + r, top + 3); g.lineTo(x + r + 2, top); g.stroke();
    g.fillStyle = LD.alpha(C.surface, C.dark ? 0.22 : 0.65); g.fillRect(x - r + 3, top + 6, 2, bot - top - 20);
    g.restore();
    // 滴瓶與滴管
    const bt = BL.bottle, ty = BL.wide ? BL.benches[0] : BL.benches[1], bw = bt[1] - bt[0], bh = BL.wide ? 70 : 64;
    const det = B.tube.detergent;
    LD.block(g, bt[0], ty - bh, bw, bh, det ? LD.mix(C.neg, C.surface, C.dark ? 0.45 : 0.72) : LD.mix(C.equi, C.surface, C.dark ? 0.5 : 0.75), { r: 7 });
    LD.block(g, bt[0] + bw / 2 - 7, ty - bh - 12, 14, 14, C.iron, { r: 3, shadow: false });
    LD.ball(g, bt[0] + bw / 2, ty - bh - 18, 7, LD.mix(C.pos, C.text, 0.25), { shadow: false, glow: 0 });
    // 正在滴的一滴
    if (state.soapDrop) {
      const d = state.soapDrop, u = Math.min(1, d.t / 0.35);
      const dx = x, dy0 = top - 26, dy = dy0 + u * u * (ys - dy0);
      LD.block(g, dx - 2.5, top - 44, 5, 18, C.glassEdge, { r: 2, shadow: false });
      LD.ball(g, dx - 0.5, top - 52, 5, LD.mix(C.pos, C.text, 0.25), { shadow: false, glow: 0 });
      if (u < 1) LD.ball(g, dx, dy, 2.2, det ? LD.mix(C.neg, C.surface, 0.5) : LD.mix(C.equi, C.surface, 0.4), { shadow: false, glow: 0 });
    }
  }
  function soapNow() {
    const i = K.benchInfo(B);
    return K.soapTest(i.c.Ca, i.c.Mg, B.tube.drops, B.tube.detergent);
  }
  function drawBenchLabels(g) {
    const s = BL.s, bk = beaker(), i = K.benchInfo(B), mys = isMys();
    LD.pill(g, T('1 L 燒杯：', 'Beaker: ') + Math.round(B.water.V * 1000) + ' mL', bk.cx * s, (bk.top - 8) * s, C.text, 'center');
    if (B.scale > 0.5) LD.pill(g, T('水垢 ', 'Scale ') + Math.round(B.scale) + ' mg', bk.cx * s, (bk.bot - 14) * s, C.muted, 'center');
    const H = mys ? null : i.H;
    const hTxt = mys ? T('硬度 ?', 'Hardness ?') : T('硬度 ', 'Hardness ') + fH(H) + ' mg/L';
    LD.pill(g, hTxt, bk.cx * s, (bk.lvl(B.water.V) + 26) * s, mys ? C.unknown : C.chem, 'center');
    // 放大鏡圖例
    const m = BL.mag, ly = (m[1] + m[2] + 22) * s;
    const items = [['Ca'], ['Mg'], ['Na']];
    const labels = { Ca: 'Ca2+', Mg: 'Mg2+', Na: 'Na+' };
    g.font = '600 11px ' + FF;
    let wsum = 0; items.forEach(function (it) { wsum += 14 + supWidth(g, it[0], labels[it[0]]) + 10; });
    let xx = m[0] * s - wsum / 2;
    items.forEach(function (it) {
      const k = it[0];
      LD.ball(g, xx + 5, ly - 4, 4.2, mys && !S.sample.revealed ? C.ion.q : C.ion[k], { shadow: false, glow: 0 });
      xx += 12;
      xx += drawIonLabel(g, k, xx, ly) + 12;
    });
    // 樹脂
    const cl = BL.col;
    LD.pill(g, T('樹脂 剩 ', 'Resin ') + fpc(B.resin.left / K.RESIN_Q) + T('', ' left'), cl.x * s, (cl.top - 22) * s, B.resin.left <= 0 ? C.pos : C.text, 'center');
    // 試管
    const tb = BL.tube, info = soapNow();
    const t1 = (B.tube.detergent ? T('清潔劑 ', 'Detergent ') : T('肥皂 ', 'Soap ')) + B.tube.drops + T(' 滴', B.tube.drops === 1 ? ' drop' : ' drops');
    LD.pill(g, t1, tb.x * s, (tb.top - 58) * s, C.text, 'center');
    if (B.tube.drops > 0) LD.pill(g, info.lather ? T('持久泡沫 ✓', 'Lasting lather ✓') : (info.ppt > 0.05 ? T('只有浮渣', 'Scum only') : T('還沒起泡', 'No lather yet')), tb.x * s, (tb.top - 36) * s, info.lather ? C.probe : C.muted, 'center');
    // 桌子前緣
    const yb = BL.Hpx - (BL.wide ? 22 : 18);
    LD.haloText(g, T('示意圖（未依比例）', 'Not to scale'), BL.Wpx - 8, yb + 12, C.muted, 'right', 'alphabetic', '11px ' + FF);
    LD.haloText(g, tn(PRESET_NAMES[B.preset] || PRESET_NAMES.custom) + (B.step ? T('（處理 ' + B.step + ' 次）', ' (' + B.step + ' treatment' + (B.step > 1 ? 's' : '') + ')') : ''), 8, yb + 12, C.text, 'left', 'alphabetic', '600 12px ' + FF);
  }
  /** 離子符號：Ca 加上標 2+ */
  function supWidth(g, k, lab) { g.font = '600 11px ' + FF; const w = g.measureText(k).width; g.font = '600 8px ' + FF; return w + g.measureText(k === 'Na' ? '+' : '2+').width; }
  function drawIonLabel(g, k, x, y) {
    g.font = '600 11px ' + FF; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.lineJoin = 'round'; g.lineWidth = 3.5; g.strokeStyle = LD.alpha(C['canvas-bg'], 0.9);
    g.strokeText(k, x, y); g.fillStyle = C.text; g.fillText(k, x, y);
    const w = g.measureText(k).width, sup = k === 'Na' ? '+' : '2+';
    g.font = '600 8px ' + FF; g.strokeText(sup, x + w, y - 5); g.fillText(sup, x + w, y - 5);
    return w + g.measureText(sup).width;
  }
  function drawBench1() {
    if (!BL) return;
    const g = bctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, bcv.width, bcv.height);
    g.drawImage(bstat, 0, 0);
    g.setTransform(BL.dpr * BL.s, 0, 0, BL.dpr * BL.s, 0, 0);
    drawBeaker1(g);
    drawColumn(g);
    drawTube(g);
    drawMagnifier1(g);
    g.setTransform(BL.dpr, 0, 0, BL.dpr, 0, 0);
    drawBenchLabels(g);
  }

  // ======================= 第二部分：EDTA 滴定裝置 =======================
  // 錐形瓶（250 mL）的形狀：底半徑 4.25 cm、錐高 10.5 cm、瓶頸半徑 1.7 cm、頸高 3 cm；12 px/cm
  const FL = { Rb: 4.25, Rn: 1.7, Hc: 10.5, Hn: 3.0, px: 12, k: 0.2 };
  function volAt(y) {
    if (y <= FL.Hc) { const r = FL.Rb - (FL.Rb - FL.Rn) * y / FL.Hc; return Math.PI / 3 * y * (FL.Rb * FL.Rb + FL.Rb * r + r * r); }
    return volAt(FL.Hc) + Math.PI * FL.Rn * FL.Rn * (y - FL.Hc);
  }
  const hCache = new Map();
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
  function rAt(h) {
    const Hc = FL.Hc * FL.px;
    return h <= Hc ? (FL.Rb - (FL.Rb - FL.Rn) * h / Hc) * FL.px : FL.Rn * FL.px;
  }
  const LAY = {
    wide: { W: 820, H: 524, rod: 280, base: [254, 528], xb: 388, stirHalf: 82,
      mag: [166, 156, 76], meter: [586, 384, 742, 494], post: 598, bottle: [520, 430, 574, 494] },
    narrow: { W: 370, H: 540, rod: 118, base: [100, 290], xb: 200, stirHalf: 66,
      mag: [60, 116, 52], meter: [294, 410, 366, 494], post: 304, bottle: [262, 440, 294, 494] }
  };
  const VY = { top: 16, y0: 40, y50: 240, tubeEnd: 250, cock: 262, tip: 298, by: 436, stirTop: 446, plate: 480, bench: 494, clamp: 108, arm: 178 };
  const MLPX = (VY.y50 - VY.y0) / 50;

  const cv = $('cv'), ctx = cv.getContext('2d');
  const stat = document.createElement('canvas'), sctx = stat.getContext('2d');
  const front = document.createElement('canvas'), fctx = front.getContext('2d');
  let L = null;
  function resizeBench() {
    const W = cv.clientWidth;
    if (!W) return;
    const D = W >= 600 ? LAY.wide : LAY.narrow;
    const s = W / D.W, H = Math.round(D.H * s) + (D === LAY.wide ? 0 : 22);
    if (cv.style.height !== H + 'px') cv.style.height = H + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    [cv, stat, front].forEach(function (c) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
    L = Object.assign({}, D, { s: s, Wpx: W, Hpx: H, dpr: dpr, wide: D === LAY.wide });
    buildStatic();
  }
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
  function buildStatic() {
    const g = sctx, s = L.s;
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    LD.backdrop(g, L.Wpx, L.Hpx);
    g.setTransform(L.dpr * s, 0, 0, L.dpr * s, 0, 0);
    const W = L.W, H = L.Hpx / s;
    const bg = g.createLinearGradient(0, VY.bench, 0, H);
    bg.addColorStop(0, LD.shade(C.bench, C.dark ? 0.06 : 0.04));
    bg.addColorStop(1, LD.shade(C.bench, C.dark ? -0.25 : -0.1));
    g.fillStyle = bg; g.fillRect(0, VY.bench, W, H - VY.bench);
    g.fillStyle = LD.alpha(LD.shade(C.bench, 0.5), 0.6); g.fillRect(0, VY.bench, W, 1);
    const sh = g.createLinearGradient(0, VY.bench - 14, 0, VY.bench);
    sh.addColorStop(0, LD.shadowInk(0)); sh.addColorStop(1, LD.shadowInk(C.dark ? 0.18 : 0.06));
    g.fillStyle = sh; g.fillRect(0, VY.bench - 14, W, 14);
    // 鐵架
    LD.contactShadow(g, (L.base[0] + L.base[1]) / 2, VY.bench, (L.base[1] - L.base[0]) / 2, 0);
    LD.block(g, L.base[0], VY.plate, L.base[1] - L.base[0], VY.bench - VY.plate, C.iron, { r: 3 });
    LD.tube(g, function (c) { c.moveTo(L.rod, VY.plate); c.lineTo(L.rod, 22); }, C.metal, 9);
    LD.ball(g, L.rod, 21, 5, C.metal, { shadow: false, glow: 0 });
    LD.tube(g, function (c) { c.moveTo(L.rod + 6, VY.clamp); c.lineTo(L.xb - 13, VY.clamp); }, C.metal, 5);
    LD.block(g, L.rod - 9, VY.clamp - 9, 18, 18, C.metalDark, { r: 3 });
    LD.ball(g, L.rod - 13, VY.clamp, 4.5, C.metalDark, { shadow: false, glow: 0 });
    // 磁石攪拌器（不加熱）：機身、白色上蓋、攪拌旋鈕與指示燈
    const sx0 = L.xb - L.stirHalf, sx1 = L.xb + L.stirHalf;
    LD.block(g, sx0, VY.stirTop + 3, sx1 - sx0, VY.plate - VY.stirTop - 3, C.housing, { r: 6 });
    LD.block(g, sx0 + 3, VY.stirTop - 2, sx1 - sx0 - 6, 7, C.ceramic, { r: 2, shadow: false });
    LD.ball(g, sx1 - 18, VY.plate - 14, 7, LD.mix(C.housing, C.text, 0.35), { shadow: false, glow: 0 });
    g.strokeStyle = LD.alpha(C.text, 0.35); g.lineWidth = 1;
    g.beginPath(); g.arc(sx1 - 18, VY.plate - 14, 10.5, Math.PI * 0.8, Math.PI * 2.2); g.stroke();
    LD.ball(g, sx0 + 16, VY.plate - 14, 2.6, C.probe, { shadow: false, glow: 0.7 });
    // 錐形瓶後面的玻璃
    const F = flaskDims();
    LD.contactShadow(g, F.cx, VY.stirTop - 2, F.Rb, 0);
    flaskOutline(g, F);
    const fg = g.createLinearGradient(F.cx - F.Rb, 0, F.cx + F.Rb, 0);
    fg.addColorStop(0, LD.alpha(C.text, C.dark ? 0.06 : 0.035)); fg.addColorStop(0.5, C.glassTint); fg.addColorStop(1, LD.alpha(C.text, C.dark ? 0.08 : 0.05));
    g.fillStyle = fg; g.fill();
    g.strokeStyle = LD.alpha(C.text, C.dark ? 0.16 : 0.12); g.lineWidth = 1;
    g.beginPath(); g.ellipse(F.cx, F.by, F.Rb - 1, F.k * (F.Rb - 1), 0, Math.PI, Math.PI * 2, false); g.stroke();
    // 滴定管的玻璃管（後面）
    const xb = L.xb;
    const tg = g.createLinearGradient(xb - 10, 0, xb + 10, 0);
    tg.addColorStop(0, LD.alpha(C.text, C.dark ? 0.12 : 0.08)); tg.addColorStop(0.5, C.glassTint); tg.addColorStop(1, LD.alpha(C.text, C.dark ? 0.14 : 0.1));
    g.fillStyle = tg;
    g.beginPath(); g.moveTo(xb - 12, VY.top); g.lineTo(xb - 10, VY.top + 5); g.lineTo(xb - 10, VY.tubeEnd); g.lineTo(xb + 10, VY.tubeEnd); g.lineTo(xb + 10, VY.top + 5); g.lineTo(xb + 12, VY.top); g.closePath(); g.fill();
    // 離子計、電極支架、蒸餾水燒杯
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
    LD.roundRect(g, b[0], b[1], b[2] - b[0], b[3] - b[1], 3); g.fill();
    g.fillStyle = LD.alpha(C.neg, C.dark ? 0.14 : 0.08);
    LD.roundRect(g, b[0] + 2, b[1] + (b[3] - b[1]) * 0.4, b[2] - b[0] - 4, (b[3] - b[1]) * 0.6 - 2, 2); g.fill();
    // 放大鏡的把手與陰影
    const mx = L.mag[0], my = L.mag[1], R = L.mag[2];
    LD.tube(g, function (c) { c.moveTo(mx - (R + 4) * 0.707, my + (R + 4) * 0.707); c.lineTo(mx - (R + 4 + R * 0.5) * 0.707, my + (R + 4 + R * 0.5) * 0.707); }, C.iron, Math.max(7, R * 0.13));
    g.save();
    g.shadowColor = LD.shadowInk(C.dark ? 0.5 : 0.25); g.shadowBlur = 10; g.shadowOffsetY = 3;
    g.fillStyle = C['canvas-bg'];
    g.beginPath(); g.arc(mx, my, R + 3, 0, Math.PI * 2); g.fill();
    g.restore();
    buildFront();
  }
  function buildFront() {
    const g = fctx, s = L.s;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, front.width, front.height);
    g.setTransform(L.dpr * s, 0, 0, L.dpr * s, 0, 0);
    drawBuretteGlass(g);
    drawFlaskFront(g);
    drawBeakerFront(g);
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    for (let i = 0; i <= 50; i += 5) {
      LD.haloText(g, String(i), (L.xb - 12) * s, (VY.y0 + i * MLPX) * s, LD.alpha(C.text, 0.85), 'right', 'middle', (i % 10 ? '' : '600 ') + '10px ' + FF);
    }
    const F = flaskDims();
    [100, 200].forEach(function (V) {
      const h = hPx(V), rr = rAt(h), y = F.by - h + F.k * rr * Math.sin(Math.PI * 0.62);
      LD.haloText(g, String(V), (F.cx + rr * Math.cos(Math.PI * 0.62) + 3) * s, (y + 1) * s, LD.alpha(C.text, 0.6), 'left', 'middle', '9px ' + FF);
    });
  }
  function lcdRect() {
    const M = L.meter, m = L.wide ? 16 : 8;
    return { x: M[0] + m, y: M[1] + (L.wide ? 16 : 10), w: M[2] - M[0] - 2 * m, h: L.wide ? 40 : 26 };
  }
  function electrodeGeom() {
    const len = VY.by - 3 - (VY.arm + 10);
    if (state.meter) return { x0: L.xb + 17, y0: VY.arm + 10, x1: L.xb + 13, y1: VY.by - 3, inFlask: true, armY: VY.arm };
    const b = L.bottle, x = (b[0] + b[2]) / 2, y1 = b[3] - 5;
    return { x0: x, y0: y1 - len, x1: x, y1: y1, inFlask: false, armY: y1 - len - 10 };
  }
  function vtLanded() { const r = S.run; return r.p.Va + K.V_ADD_ML + r.u / U; }
  function surfaceY() { return VY.by - hPx(vtLanded()); }
  function drawArmAndCable(g) {
    const e = electrodeGeom(), M = L.meter;
    const jx = M[0] + 12, jy = M[1] + 4;
    g.save(); g.lineCap = 'round';
    g.strokeStyle = LD.shade(C.iron, -0.2); g.lineWidth = 3.2;
    g.beginPath(); g.moveTo(e.x0, e.y0 - 26); g.bezierCurveTo(e.x0, e.y0 - 70, jx - 30, jy - 120, jx, jy); g.stroke();
    g.strokeStyle = LD.alpha(LD.shade(C.iron, 0.5), 0.5); g.lineWidth = 1;
    g.beginPath(); g.moveTo(e.x0 - 0.8, e.y0 - 26); g.bezierCurveTo(e.x0 - 0.8, e.y0 - 70, jx - 31, jy - 121, jx - 0.8, jy); g.stroke();
    g.restore();
    LD.tube(g, function (c) { c.moveTo(L.post, e.armY); c.lineTo(e.x0 + 7, e.armY); }, C.metal, 5);
    LD.ball(g, L.post, e.armY, 5, C.metalDark, { shadow: false, glow: 0 });
  }
  /** 鈣離子選擇性電極：深色塑膠管身、尖端是含離子載體的 PVC 薄膜 */
  function drawElectrode(g, e) {
    const ang = Math.atan2(e.x1 - e.x0, e.y1 - e.y0), len = Math.hypot(e.x1 - e.x0, e.y1 - e.y0);
    g.save();
    g.translate(e.x0, e.y0); g.rotate(-ang);
    const body = C.dark ? LD.mix(C.surface, C.text, 0.28) : LD.mix(C.text, C.surface, 0.3);
    const gg = g.createLinearGradient(-3.6, 0, 3.6, 0);
    gg.addColorStop(0, LD.shade(body, -0.25)); gg.addColorStop(0.35, LD.mix(body, C.surface, 0.35)); gg.addColorStop(1, LD.shade(body, -0.3));
    g.fillStyle = gg;
    LD.roundRect(g, -3.6, 0, 7.2, len - 7, 2); g.fill();
    g.fillStyle = LD.mix(C.equi, C.surface, 0.45);
    LD.roundRect(g, -3.2, len - 8, 6.4, 6, 1.5); g.fill();
    g.strokeStyle = LD.alpha(C.text, 0.4); g.lineWidth = 0.5; g.stroke();
    g.fillStyle = LD.alpha(C.surface, 0.35); g.fillRect(-2.2, 4, 1.1, len - 14);
    LD.block(g, -4.6, -26, 9.2, 26, C.iron, { r: 2.5, shadow: false });
    g.fillStyle = LD.alpha(C.probe, 0.95); g.fillRect(-4.6, -9, 9.2, 2.5);
    g.restore();
    LD.block(g, e.x0 - 7, e.armY - 5, 14, 10, C.metalDark, { r: 2, shadow: false });
  }
  /** EDTA 溶液無色：畫成淡淡的水色，彎月面向下凹，最低點在讀數的位置 */
  function drawBuretteLiquid(g) {
    const r = S.run, xb = L.xb, ym = VY.y0 + r.fill / U * MLPX;
    if (r.fill >= K.BURETTE_UNITS) return;
    const lg = g.createLinearGradient(xb - 7.5, 0, xb + 7.5, 0);
    lg.addColorStop(0, LD.alpha(LD.shade(C.water, -0.18), 0.55)); lg.addColorStop(0.4, LD.alpha(C.water, 0.4)); lg.addColorStop(1, LD.alpha(LD.shade(C.water, -0.25), 0.55));
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(xb - 7.5, ym - 4.4);
    g.quadraticCurveTo(xb, ym + 4.4, xb + 7.5, ym - 4.4);
    g.lineTo(xb + 7.5, VY.tubeEnd + 2); g.lineTo(xb + 3, VY.cock - 6); g.lineTo(xb + 3, VY.cock + 8);
    g.lineTo(xb + 1.4, VY.tip - 1); g.lineTo(xb - 1.4, VY.tip - 1); g.lineTo(xb - 3, VY.cock + 8); g.lineTo(xb - 3, VY.cock - 6);
    g.lineTo(xb - 7.5, VY.tubeEnd + 2);
    g.closePath(); g.fill();
    g.strokeStyle = LD.alpha(C.text, C.dark ? 0.7 : 0.6); g.lineWidth = 1;
    g.beginPath(); g.moveTo(xb - 7.5, ym - 4.4); g.quadraticCurveTo(xb, ym + 4.4, xb + 7.5, ym - 4.4); g.stroke();
    g.fillStyle = LD.alpha(C.surface, C.dark ? 0.18 : 0.35); g.fillRect(xb - 6, ym + 3, 1.4, Math.max(0, VY.tubeEnd - ym - 4));
  }
  function drawBuretteGlass(g) {
    const xb = L.xb;
    g.strokeStyle = C.glassEdge; g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(xb - 12, VY.top); g.lineTo(xb - 10, VY.top + 5); g.lineTo(xb - 10, VY.tubeEnd); g.quadraticCurveTo(xb - 10, VY.cock - 8, xb - 4.5, VY.cock - 7);
    g.moveTo(xb + 12, VY.top); g.lineTo(xb + 10, VY.top + 5); g.lineTo(xb + 10, VY.tubeEnd); g.quadraticCurveTo(xb + 10, VY.cock - 8, xb + 4.5, VY.cock - 7);
    g.stroke();
    g.fillStyle = LD.alpha(C.surface, C.dark ? 0.25 : 0.7); g.fillRect(xb - 7.5, VY.top + 6, 1.8, VY.tubeEnd - VY.top - 10);
    g.fillStyle = LD.alpha(C.surface, C.dark ? 0.12 : 0.35); g.fillRect(xb + 5, VY.top + 6, 1, VY.tubeEnd - VY.top - 10);
    g.strokeStyle = LD.alpha(C.text, C.dark ? 0.75 : 0.7);
    g.beginPath();
    for (let i = 0; i <= 50; i++) {
      const y = VY.y0 + i * MLPX, len = i % 10 === 0 ? 11 : i % 5 === 0 ? 8 : 4.5;
      g.moveTo(xb - 9, y); g.lineTo(xb - 9 + len, y);
    }
    g.lineWidth = 0.7; g.stroke();
    g.fillStyle = LD.alpha(C.text, C.dark ? 0.12 : 0.07);
    g.beginPath(); g.moveTo(xb - 4, VY.cock + 7); g.lineTo(xb - 1.8, VY.tip); g.lineTo(xb + 1.8, VY.tip); g.lineTo(xb + 4, VY.cock + 7); g.closePath(); g.fill();
    g.strokeStyle = C.glassEdge; g.lineWidth = 0.9; g.stroke();
    LD.roundRect(g, xb - 11, VY.cock - 7, 22, 14, 6);
    const cg = g.createLinearGradient(0, VY.cock - 7, 0, VY.cock + 7);
    cg.addColorStop(0, LD.alpha(C.surface, 0.6)); cg.addColorStop(1, LD.alpha(C.text, C.dark ? 0.25 : 0.18));
    g.fillStyle = cg; g.fill();
    g.strokeStyle = C.glassEdge; g.lineWidth = 1; g.stroke();
    LD.block(g, xb - 15, VY.clamp - 9, 6, 18, C.iron, { r: 2, shadow: false });
    LD.block(g, xb + 9, VY.clamp - 9, 6, 18, C.iron, { r: 2, shadow: false });
  }
  function drawCockHandle(g) {
    const xb = L.xb;
    g.save();
    g.translate(xb, VY.cock); g.rotate(-state.cock * Math.PI / 2);
    LD.block(g, 2, -3.2, 20, 6.4, C.ptfe, { r: 3, shadow: false, stroke: LD.alpha(C.text, 0.35) });
    g.restore();
    LD.ball(g, xb, VY.cock, 4.6, C.ptfe, { shadow: false, glow: 0, ring: LD.alpha(C.text, 0.4) });
  }
  function dropRadius(n) { return n >= DROP ? 2.7 : 2.15; }
  function drawHangingAndDrops(g) {
    const xb = L.xb, ys = surfaceY(), col = LD.alpha(LD.shade(C.water, C.dark ? 0.1 : -0.12), 0.85);
    if (state.tap && state.rate > STREAM_RATE && !reduced) {
      const w = 0.9 + 1.3 * (state.rate - STREAM_RATE) / (2 - STREAM_RATE), t = state.t;
      g.save(); g.lineCap = 'round';
      g.strokeStyle = col; g.lineWidth = w;
      g.beginPath(); g.moveTo(xb, VY.tip);
      for (let y = VY.tip; y <= ys; y += 6) g.lineTo(xb + 0.5 * Math.sin(y * 0.35 - t * 20) * (y - VY.tip) / 60, y);
      g.lineTo(xb, ys); g.stroke();
      g.strokeStyle = LD.alpha(C.surface, 0.6); g.lineWidth = Math.max(0.4, w * 0.3);
      g.beginPath(); g.moveTo(xb - w * 0.2, VY.tip + 2); g.lineTo(xb - w * 0.2, ys - 2); g.stroke();
      g.restore();
    } else if (state.tap) {
      const rr = Math.round(dropRadius(DROP) * Math.cbrt(Math.max(0.05, Math.min(1, state.acc / DROP))) * 4) / 4;
      LD.ball(g, xb, VY.tip + rr * 0.85, rr, col, { shadow: false, glow: 0 });
    }
    state.drops.forEach(function (d) {
      const R = dropRadius(d.n);
      if (d.phase === 'grow') {
        const rr = Math.round(R * Math.cbrt(Math.max(0.08, d.t / d.growT)) * 4) / 4;
        LD.ball(g, xb, VY.tip + rr * 0.85, rr, col, { shadow: false, glow: 0 });
      } else if (!(state.tap && state.rate > STREAM_RATE)) {
        LD.ball(g, xb, d.y, R, col, { shadow: false, glow: 0 });
      }
    });
  }
  // Mg(OH)2 白色微粒的位置（固定亂數，跟著攪拌轉）
  const SPECKS = [];
  (function () { let s = 11; const rnd = function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; for (let i = 0; i < 80; i++) SPECKS.push({ r: Math.sqrt(rnd()), a: rnd() * Math.PI * 2, h: rnd(), z: 0.6 + rnd() * 0.9 }); })();
  function drawFlask(g) {
    const r = S.run, F = flaskDims(), Vt = vtLanded(), h = hPx(Vt), rs = rAt(h), ys = F.by - h;
    const col = flaskRGB(r), turb = K.transmit(r).turb;
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
    // pH 12：Mg(OH)2 讓溶液帶白色混濁
    if (turb > 0.01) {
      g.clip();
      g.fillStyle = LD.alpha(C.white, 0.3 * turb); g.fillRect(F.cx - F.Rb, ys - 4, 2 * F.Rb, F.by - ys + 12);
      const n = Math.round(SPECKS.length * Math.min(1, 0.2 + turb));
      for (let i = 0; i < n; i++) {
        const q = SPECKS[i], a = q.a + state.stir * 0.12 * q.z;
        const yy = ys + 4 + q.h * (F.by - ys - 6), rr = rAt(F.by - yy) - 3;
        g.fillStyle = LD.alpha(C.white, 0.55 + 0.35 * turb);
        g.beginPath(); g.arc(F.cx + q.r * rr * Math.cos(a), yy + F.k * q.r * 6 * Math.sin(a), 0.7 + 0.6 * q.z, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();
    // 攪拌子
    const th = state.stir, Lb = 13, hb = 4;
    const ex = Lb * Math.cos(th), ey = F.k * Lb * Math.sin(th);
    g.save(); g.lineCap = 'round';
    g.strokeStyle = LD.mix(C.ptfe, rgbStr(col), 0.35); g.lineWidth = 6;
    g.beginPath(); g.moveTo(F.cx - ex, F.by - hb - ey); g.lineTo(F.cx + ex, F.by - hb + ey); g.stroke();
    g.strokeStyle = LD.alpha(C.surface, 0.55); g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(F.cx - ex * 0.8, F.by - hb - 1.6 - ey * 0.8); g.lineTo(F.cx + ex * 0.8, F.by - hb - 1.6 + ey * 0.8); g.stroke();
    g.restore();
    // 液面；落點附近局部過量的 EDTA 先讓指示劑變藍（條紋）
    const top = LD.mix(rgbStr(col), C.dark ? C.text : C.surface, 0.18);
    g.fillStyle = LD.alpha(top, 0.8);
    g.beginPath(); g.ellipse(F.cx, ys, rs - 1, F.k * (rs - 1), 0, 0, Math.PI * 2); g.fill();
    g.save();
    g.beginPath(); g.ellipse(F.cx, ys, rs - 1.5, F.k * (rs - 1.5), 0, 0, Math.PI * 2); g.clip();
    state.plumes.forEach(function (pl) {
      const u = pl.t / pl.life, fade = 1 - u;
      for (let j = 0; j < 5; j++) {
        const rad = (rs - 4) * Math.min(1, Math.pow(u, 0.55)) * (0.25 + 0.75 * j / 4);
        const ang = pl.a0 + state.stir * 0.35 - j * 0.6;
        const px = F.cx + rad * Math.cos(ang), py = ys + F.k * rad * Math.sin(ang);
        const bw = 5 + 9 * u + 2 * j;
        g.fillStyle = rgbStr(pl.rgb, 0.6 * fade * (1 - j * 0.12));
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
    g.strokeStyle = C.glassEdge; g.lineWidth = 1;
    g.beginPath(); g.ellipse(F.cx, F.yn, F.Rn + 3, F.k * (F.Rn + 3), 0, 0, Math.PI * 2); g.stroke();
    g.save(); g.lineCap = 'round';
    g.strokeStyle = LD.alpha(C.surface, C.dark ? 0.28 : 0.75); g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(F.cx - F.Rb + 9, F.by - 8); g.lineTo(F.cx - F.Rn - 4, F.ys + 14); g.stroke();
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(F.cx - F.Rn + 3.5, F.ys - 6); g.lineTo(F.cx - F.Rn + 3.5, F.yn + 6); g.stroke();
    g.strokeStyle = LD.alpha(C.surface, C.dark ? 0.12 : 0.35); g.lineWidth = 1;
    g.beginPath(); g.moveTo(F.cx + F.Rb - 7, F.by - 6); g.lineTo(F.cx + F.Rn + 5, F.ys + 12); g.stroke();
    g.restore();
    g.strokeStyle = LD.alpha(C.text, C.dark ? 0.5 : 0.45); g.lineWidth = 0.8;
    [50, 100, 150, 200].forEach(function (V) {
      const h = hPx(V), r = rAt(h), y = F.by - h;
      g.beginPath(); g.ellipse(F.cx, y, r, F.k * r, 0, Math.PI * 0.62, Math.PI * 0.8, false); g.stroke();
    });
  }
  function drawBeakerFront(g) {
    const b = L.bottle;
    LD.roundRect(g, b[0], b[1], b[2] - b[0], b[3] - b[1], 3);
    g.strokeStyle = C.glassEdge; g.lineWidth = 1; g.stroke();
    g.beginPath(); g.moveTo(b[0] - 2, b[1]); g.lineTo(b[0] + 3, b[1] + 1); g.stroke();
    g.fillStyle = LD.alpha(C.surface, C.dark ? 0.15 : 0.5);
    g.fillRect(b[0] + 2.5, b[1] + 4, 1.5, b[3] - b[1] - 8);
  }
  // ---------- 七段顯示器：離子計顯示 pCa ----------
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
  /** 顯示到兩位小數，例如「 3.40」「10.52」；電極不在瓶中時「--.--」 */
  function lcdText() {
    const p = S.run.eq.pCa;
    if (!state.meter || p == null || !isFinite(p)) return '--.--';
    const s = Math.max(0, Math.min(99.99, p)).toFixed(2);
    return s.length < 5 ? ' ' + s : s;
  }
  function drawLCD(g) {
    const lc = lcdRect();
    LD.roundRect(g, lc.x, lc.y, lc.w, lc.h, 3);
    const lg = g.createLinearGradient(0, lc.y, 0, lc.y + lc.h);
    lg.addColorStop(0, LD.shade(C.lcd, 0.06)); lg.addColorStop(1, C.lcd);
    g.fillStyle = lg; g.fill();
    const txt = lcdText(), dot = txt.indexOf('.'), digits = txt.replace('.', '');
    g.font = '700 ' + (L.wide ? 11 : 9) + 'px ' + FF;
    const n = digits.length, pad = lc.w * 0.05, unitW = Math.max(lc.w * 0.22, (g.measureText('pCa').width + 6) / L.s);
    const cw = (lc.w - 2 * pad - unitW) / n, w = cw * 0.72, hgt = lc.h * 0.66, y = lc.y + (lc.h - hgt) / 2;
    const on = C.lcdInk, off = LD.alpha(C.lcdInk, 0.07);
    g.save();
    g.translate(lc.x + pad, 0);
    g.transform(1, 0, -0.08, 1, 0, 0);
    for (let i = 0; i < n; i++) seg7(g, digits[i], i * cw + (cw - w) / 2 + y * 0.08, y, w, hgt, on, off);
    g.fillStyle = on;
    g.beginPath(); g.arc(dot * cw - cw * 0.08 + (y + hgt) * 0.08, y + hgt - 1, Math.max(1, w * 0.13), 0, Math.PI * 2); g.fill();
    g.restore();
  }
  // ---------- 放大鏡：讀彎月面最低點 ----------
  function drawMagnifier(g) {
    const r = S.run, mx = L.mag[0], my = L.mag[1], R = L.mag[2];
    const vr = r.fill / U, ym = VY.y0 + vr * MLPX, xb = L.xb;
    g.strokeStyle = LD.alpha(C.accent, 0.75); g.lineWidth = 1;
    LD.roundRect(g, xb - 12, ym - 1.7 * MLPX, 24, 3.4 * MLPX, 3); g.stroke();
    const ang = Math.atan2(ym - my, xb - 12 - mx);
    g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(mx + (R + 3) * Math.cos(ang), my + (R + 3) * Math.sin(ang)); g.lineTo(xb - 12, ym); g.stroke();
    g.setLineDash([]);
    g.save();
    g.beginPath(); g.arc(mx, my, R - 1, 0, Math.PI * 2); g.clip();
    const zp = R / 1.7, tw = R * 0.5;
    const tg = g.createLinearGradient(mx - tw, 0, mx + tw, 0);
    tg.addColorStop(0, LD.alpha(C.text, C.dark ? 0.16 : 0.1)); tg.addColorStop(0.5, C.glassTint); tg.addColorStop(1, LD.alpha(C.text, C.dark ? 0.18 : 0.12));
    g.fillStyle = tg; g.fillRect(mx - tw, my - R, 2 * tw, 2 * R);
    if (r.fill < K.BURETTE_UNITS) {
      const md = R * 0.22;
      const lg = g.createLinearGradient(mx - tw, 0, mx + tw, 0);
      lg.addColorStop(0, LD.alpha(LD.shade(C.water, -0.2), 0.7)); lg.addColorStop(0.4, LD.alpha(C.water, 0.55)); lg.addColorStop(1, LD.alpha(LD.shade(C.water, -0.28), 0.7));
      g.fillStyle = lg;
      // 無色溶液：彎月面看得很清楚，最低點對齊視線
      g.beginPath(); g.moveTo(mx - tw, my - 2 * md); g.quadraticCurveTo(mx, my + 2 * md, mx + tw, my - 2 * md); g.lineTo(mx + tw, my + R); g.lineTo(mx - tw, my + R); g.closePath(); g.fill();
      g.strokeStyle = LD.alpha(C.text, C.dark ? 0.85 : 0.75); g.lineWidth = 2;
      g.beginPath(); g.moveTo(mx - tw, my - 2 * md); g.quadraticCurveTo(mx, my + 2 * md, mx + tw, my - 2 * md); g.stroke();
      g.strokeStyle = LD.alpha(C.surface, C.dark ? 0.35 : 0.7); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(mx - tw, my - 2 * md + 3); g.quadraticCurveTo(mx, my + 2 * md + 3, mx + tw, my - 2 * md + 3); g.stroke();
    }
    g.font = '700 ' + Math.round(R * 0.17) + 'px ' + FF;
    g.textAlign = 'left'; g.textBaseline = 'middle';
    const i0 = Math.ceil((vr - 1.9) * 10), i1 = Math.floor((vr + 1.9) * 10);
    for (let i = Math.max(0, i0); i <= Math.min(500, i1); i++) {
      const y = my + (i / 10 - vr) * zp;
      const len = i % 10 === 0 ? tw * 1.25 : i % 5 === 0 ? tw * 0.8 : tw * 0.45;
      g.strokeStyle = LD.alpha(C.text, C.dark ? 0.85 : 0.8);
      g.lineWidth = i % 10 === 0 ? 1.4 : 1;
      g.beginPath(); g.moveTo(mx - tw, y); g.lineTo(mx - tw + len, y); g.stroke();
      if (i % 10 === 0) { g.fillStyle = LD.alpha(C.text, 0.9); g.fillText(String(i / 10), mx - tw + len + 3, y); }
    }
    g.fillStyle = LD.alpha(C.surface, C.dark ? 0.2 : 0.6); g.fillRect(mx - tw + 3, my - R, 2.5, 2 * R);
    g.strokeStyle = LD.alpha(C.accent, 0.9); g.lineWidth = 1.2; g.setLineDash([5, 4]);
    g.beginPath(); g.moveTo(mx - R, my); g.lineTo(mx + R, my); g.stroke();
    g.setLineDash([]);
    const lg2 = g.createRadialGradient(mx - R * 0.35, my - R * 0.4, R * 0.05, mx, my, R);
    lg2.addColorStop(0, LD.alpha(C.surface, C.dark ? 0.12 : 0.3)); lg2.addColorStop(0.6, LD.alpha(C.surface, 0)); lg2.addColorStop(1, LD.shadowInk(C.dark ? 0.25 : 0.08));
    g.fillStyle = lg2; g.fillRect(mx - R, my - R, 2 * R, 2 * R);
    g.restore();
    g.strokeStyle = C.metalDark; g.lineWidth = 6;
    g.beginPath(); g.arc(mx, my, R + 1, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = LD.alpha(LD.shade(C.metal, 0.5), 0.8); g.lineWidth = 1.2;
    g.beginPath(); g.arc(mx, my, R + 2, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
  }
  // ---------- 文字層：化學式（字母後的數字是下標、^ 之後是上標） ----------
  const RICH = /([A-Za-z()·–]+)|(\d+)|\^(\S+?)(?=$|\s)/g;
  function richWidth(g, parts, px) {
    let w = 0;
    parts.forEach(function (p) {
      if (p.t != null) { g.font = '600 ' + px + 'px ' + FF; w += g.measureText(p.t).width; return; }
      p.f.replace(RICH, function (m, a, d, sup) {
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
      p.f.replace(RICH, function (m, a, d, sup) {
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
  function flaskParts() {
    const p = S.run.p, w = p.water, parts = [{ t: T('錐形瓶：', 'Flask: ') }];
    parts.push({ t: (w.unknown ? T('未知水樣 ', 'unknown water ') : T('水樣 ', 'water ')) + p.Va.toFixed(2) + ' mL' });
    if (p.mode === 'A') parts.push({ t: T('＋pH 10 緩衝液', ' + pH 10 buffer') + (p.mgEdta ? T('（含 Mg–EDTA）', ' (with Mg–EDTA)') : '') + T('＋EBT', ' + EBT') });
    else parts.push({ t: T('＋', ' + ') }, { f: 'NaOH' }, { t: T('（pH 12）＋鈣指示劑', ' (pH 12) + Ca indicator') });
    return parts;
  }
  function drawLabels(g) {
    const s = L.s, r = S.run, p = r.p;
    richText(g, [{ t: T('滴定管：', 'Burette: ') + 'EDTA ' + sigf(p.cE, 3) + ' M' }], (L.xb + 16) * s, (VY.top + 56) * s, C.text, 12, 'left');
    pillClamp(g, T('讀最低點 ', 'Bottom ') + vRead(r.fill) + ' mL', L.mag[0] * s, (L.mag[1] + L.mag[2] + 24) * s, C.accent, 'center');
    const lc = lcdRect();
    LD.haloText(g, 'pCa', (lc.x + lc.w - 3) * s, (lc.y + lc.h - 4) * s, LD.alpha(C.lcdInk, 0.95), 'right', 'alphabetic', '700 ' + (L.wide ? 11 : 9) + 'px ' + FF);
    let mlab = '';
    if (!state.meter) mlab = T('電極在蒸餾水中', 'electrode in water');
    else if (L.wide) mlab = T('鈣離子選擇性電極', 'calcium ion-selective electrode');
    if (mlab) LD.haloText(g, mlab, ((L.meter[0] + L.meter[2]) / 2) * s, (L.meter[3] - (L.wide ? 8 : 6)) * s, C.muted, 'center', 'alphabetic', '10px ' + FF);
    // 桌子前緣：錐形瓶裡有什麼
    const px = 12, line1 = VY.bench * s + 17, line2 = VY.bench * s + 35;
    const parts = flaskParts(), note = T('示意圖（未依比例）', 'Not to scale');
    g.font = '11px ' + FF;
    const wNote = g.measureText(note).width + 14, wMain = richWidth(g, parts, px), room = L.Wpx - 16;
    if (wMain + wNote <= room) {
      richText(g, parts, 8, line1, C.text, px, 'left');
      LD.haloText(g, note, L.Wpx - 8, line1, C.muted, 'right', 'alphabetic', '11px ' + FF);
    } else {
      const a = parts.slice(0, 2), b = parts.slice(2).map(function (q, i) { return i === 0 && q.t ? { t: q.t.replace(/^＋/, '').replace(/^ \+ /, '') } : q; });
      richText(g, a, 8, line1, C.text, richWidth(g, a, px) <= room ? px : 11, 'left');
      const wb = richWidth(g, b, px);
      richText(g, b, 8, line2, C.text, wb <= room ? px : 10.5, 'left');
      if (wb + wNote <= room) LD.haloText(g, note, L.Wpx - 8, line2, C.muted, 'right', 'alphabetic', '11px ' + FF);
    }
    const F = flaskDims(), tx = (F.cx + F.Rb + 6) * s;
    // 窄版的離子計就在錐形瓶右邊：三個標籤整組移到離子計上方，不蓋住液晶
    const yHaze = L.wide ? VY.by - 16 : L.meter[1] - 10, yCol = yHaze - 24, yTag = yCol - 24;
    if (state.tag && state.tag.t > 0) {
      g.save(); g.globalAlpha = Math.min(1, state.tag.t / 0.4);
      pillClamp(g, state.tag.text, tx, yTag * s, state.tag.col || C.chem, 'left');
      g.restore();
    }
    pillClamp(g, tn(COLOUR_NAMES[K.colourKey(r.eq.rf)]), tx, yCol * s, r.eq.rf <= K.BLUE_RF ? C.neg : C.muted, 'left');
    if (K.transmit(r).turb > 0.05) pillClamp(g, T('白色混濁（氫氧化鎂）', 'white haze'), tx, yHaze * s, C.muted, 'left');
  }
  function drawBench() {
    if (!L || state.view === '3d') return;
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

  // ======================= 動畫：全頁只有一條 requestAnimationFrame =======================
  let raf = 0, lastT = 0, lastGraph = 0, skip = false, inFrame = false;
  let benchOn = true, stageOn = true;
  let view3 = null;
  function benchBusy() { return !!state.banim || state.shake > 0 || !!state.soapDrop; }
  function titrBusy() {
    return state.tap || state.pendingSettle || state.drops.length > 0 || state.plumes.length > 0 || state.ripples.length > 0 ||
      state.flash > 0 || (state.tag && state.tag.t > 0) || Math.abs(state.cock - (state.tap ? 1 : 0)) > 1e-3;
  }
  function busy() { return benchBusy() || titrBusy(); }
  function frame(now) {
    raf = 0;
    const raw = Math.max(0, (now - lastT) / 1000);
    lastT = now;
    inFrame = true;
    try { step(Math.min(1 / 30, raw), Math.min(0.25, raw)); } finally { inFrame = false; }
    const bb = benchBusy(), tb = titrBusy();
    if (benchOn && (bb || !skip || reduced)) drawBench1();
    if (stageOn && (tb || !skip || reduced)) { if (view3 && view3.active) view3.frame(); else drawBench(); }
    skip = !skip;
    if (graphDirty && now - lastGraph > 150) { lastGraph = now; drawGraph(); renderReadouts(); }
    const idle = !reduced && (benchOn || stageOn);
    if (!raf && !document.hidden && (bb || tb || idle)) raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (inFrame) return;
    if (raf) return;
    if (document.hidden || (!benchOn && !stageOn && !busy())) { drawBench1(); drawBench(); if (view3 && view3.active) view3.frame(); return; }
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (es) { benchOn = es[es.length - 1].isIntersecting; if (benchOn) kick(); }).observe(bcv);
    new IntersectionObserver(function (es) { stageOn = es[es.length - 1].isIntersecting; if (stageOn) kick(); }).observe($('stage'));
  }
  function step(dt, flowDt) {
    state.t += dt;
    // ---- 工作台的動畫 ----
    if (state.banim) { state.banim.t += dt; if (state.banim.t >= state.banim.dur) state.banim = null; }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt / 0.9);
    if (state.soapDrop) { state.soapDrop.t += dt; if (state.soapDrop.t >= 0.35) { state.soapDrop = null; state.shake = reduced ? 0 : 1; } }
    // ---- 滴定 ----
    if (!reduced) state.stir = (state.stir + STIR_W * dt) % (Math.PI * 200);
    const target = state.tap ? 1 : 0;
    state.cock += Math.sign(target - state.cock) * Math.min(Math.abs(target - state.cock), dt / 0.15);
    if (state.tap) {
      state.acc += state.rate * U * flowDt;
      while (state.acc >= DROP && state.tap) { state.acc -= DROP; release(DROP, false); }
      if (state.rate > STREAM_RATE) { state.streamSnd = (state.streamSnd || 0) - dt; if (state.streamSnd <= 0) { state.streamSnd = 0.11; sndStream(); } }
    }
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

  // ======================= 滴定的操作 =======================
  function release(n, fromButton) {
    const r = S.run;
    const left = K.BURETTE_UNITS - r.fill;
    if (left <= 0) { closeTap(); emptyNotice(); return 0; }
    if (r.p.Va + K.V_ADD_ML + (r.out + n) / U > VT_MAX) {
      closeTap();
      setStatus(T('錐形瓶快滿了（' + VT_MAX + ' mL）。按「換一瓶」，或減少水樣的體積、提高 EDTA 的濃度。', 'The flask is almost full (' + VT_MAX + ' mL). Press “New flask”, or use less water or a more concentrated EDTA.'), true);
      return 0;
    }
    n = K.release(S, n);
    if (!n) return 0;
    const d = { n: n, phase: fromButton ? 'grow' : 'fall', t: 0, growT: n >= DROP ? 0.12 : 0.09, y: VY.tip + dropRadius(n), v: 0 };
    if (reduced) land(d); else state.drops.push(d);
    if (r.fill >= K.BURETTE_UNITS) { closeTap(); emptyNotice(); }
    state.pendingSettle = true;
    kick();
    return n;
  }
  let lastPlume = 0;
  function land(d) {
    const r = S.run, before = K.colourKey(r.eq.rf);
    K.land(S, d.n);
    r.pts[r.pts.length - 1].c = flaskRGB(r);
    r.pts[r.pts.length - 1].m = state.meter;
    state.pendingSettle = true;
    sndDrop(d.n);
    if (!reduced) {
      state.ripples.push({ t: 0 });
      const nowMs = performance.now();
      if (nowMs - lastPlume > (state.tap && state.rate > STREAM_RATE ? 120 : 0)) {
        lastPlume = nowMs;
        // 落點附近 EDTA 局部過量（約多 1 mL 的量）：指示劑在那裡先變色，攪一攪又散開
        const fake = { p: r.p, eq: K.eqAt(r.p, r.nCa, r.nMg, r.u + U) };
        const tr = K.transmit(fake), w = LD.rgb(C.water);
        state.plumes.push({ t: 0, life: 0.9, a0: Math.random() * Math.PI * 2, rgb: w.map(function (x, i) { return Math.round(x * Math.pow(tr.T[i], VIS)); }) });
        if (state.plumes.length > 8) state.plumes.shift();
      }
    }
    const after = K.colourKey(r.eq.rf);
    if (after !== before) {
      if (after === 'blue') colourChanged();
      else if (before === 'red' && !r.nearHint) {
        r.nearHint = true;
        setStatus(T('顏色開始變紫了：快到終點，改成一滴一滴（或半滴）加，每滴之後攪勻再看。', 'The colour is turning purple: the end point is near. Go drop by drop (or half a drop) and let it mix each time.'));
      }
    }
    graphDirty = true;
    if (view3 && view3.active) view3.frame();
  }
  function colourChanged() {
    state.flash = reduced ? 0 : 1;
    state.flashCol = rgbStr(flaskRGB(S.run));
    state.tag = { text: T('變成純藍色！', 'Pure blue!'), t: 1.8, col: C.neg };
    sndColour();
    setStatus(T('最後一點紅色消失，整瓶變成純藍色：指示劑上的金屬離子都被 EDTA 搶走了。按「記錄終點」。', 'The last trace of red is gone and the whole flask is pure blue: EDTA has taken every metal ion off the indicator. Press “Record end point”.'));
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
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function settle() {
    const r = S.run;
    const data = K.settle(S, state.meter);
    const last = r.rows[r.rows.length - 1];
    if (last) last.c = flaskRGB(r);
    latestRow = true;
    renderAll();
    routineStatus(T('滴定管讀數 ' + vRead(r.fill) + ' mL', 'Burette reading ' + vRead(r.fill) + ' mL') +
      (state.meter && r.eq.pCa != null ? T('，', ', ') + 'pCa = ' + r.eq.pCa.toFixed(2) : '') +
      T('，溶液' + tn(COLOUR_NAMES[K.colourKey(r.eq.rf)]) + '。', ', solution ' + tn(COLOUR_NAMES[K.colourKey(r.eq.rf)]) + '.'));
    emit('settle', data);
  }

  // ======================= 圖：pCa 滴定曲線 =======================
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  let G = null, graphDirty = true, hover = null;
  function resizeGraph() {
    const W = gcv.clientWidth;
    if (!W) return;
    const H = Math.round(Math.max(280, Math.min(400, W * 0.58)));
    if (gcv.style.height !== H + 'px') gcv.style.height = H + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    gcv.width = Math.round(W * dpr); gcv.height = Math.round(H * dpr);
    G = { W: W, H: H, dpr: dpr };
    drawGraph();
  }
  const NICE = [5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250];
  function xMax() {
    const r = S.run;
    let m = mysteryHidden() ? 20 : Math.max(5, 2 * r.Veq);
    S.runs.concat([r]).forEach(function (q) { m = Math.max(m, q.u / U * 1.06); });
    for (let i = 0; i < NICE.length; i++) if (NICE[i] >= m - 1e-9) return NICE[i];
    return 250;
  }
  function xStep(xmax) {
    const st = [0.5, 1, 2, 5, 10, 20, 25, 50];
    for (let i = 0; i < st.length; i++) if (xmax / st[i] <= 10.5) return st[i];
    return 50;
  }
  const PMIN = 2, PMAX = 12;
  const theoryCache = { key: '', pts: null };
  function theoryPts(r, xmax) {
    const p = r.p, key = [p.mode, p.mgEdta, p.Va, p.cE, r.nCa, r.nMg, xmax].join('|');
    if (theoryCache.key === key) return theoryCache.pts;
    const uMax = xmax * U, du = Math.max(1, Math.ceil(uMax / 320));
    const pts = K.theory(p, r.nCa, r.nMg, uMax, du);
    // 當量點附近加密
    if (r.Veq > 0) {
      const ue = r.Veq * U;
      for (let u = Math.max(0, Math.round(ue - 2 * U)); u <= Math.min(uMax, ue + 2 * U); u += 1) {
        const e = K.eqAt(p, r.nCa, r.nMg, u); pts.push({ u: u, pCa: e.pCa, pMg: e.pMg, rf: e.rf });
      }
      pts.sort(function (a, b) { return a.u - b.u; });
    }
    theoryCache.key = key; theoryCache.pts = pts;
    return pts;
  }
  function slopes(r) {
    const m = r.pts.filter(function (q) { return q.m && q.pCa != null; }), out = [];
    for (let i = 1; i < m.length; i++) {
      const dv = (m[i].u - m[i - 1].u) / U;
      if (dv > 0 && dv <= 2.5) out.push({ v: (m[i].u + m[i - 1].u) / 2 / U, d: (m[i].pCa - m[i - 1].pCa) / dv });
    }
    return out;
  }
  function maxSlope(r) {
    const s = slopes(r);
    if (s.length < 2) return null;
    let best = s[0];
    s.forEach(function (q) { if (q.d > best.d) best = q; });
    return best.d > 0 ? best : null;
  }
  function runColour(r) { return r.p.mode === 'A' ? C.chem : C.probe; }
  function drawGraph() {
    if (!G) return;
    graphDirty = false;
    const g = gctx, W = G.W, H = G.H, r = S.run, hid = mysteryHidden();
    g.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    LD.backdrop(g, W, H);
    const x0 = 40, x1 = W - (state.deriv ? 46 : 14), y0 = 14, y1 = H - 60;
    const xmax = xMax();
    const X = function (v) { return x0 + v / xmax * (x1 - x0); };
    const Y = function (pc) { return y1 - (pc - PMIN) / (PMAX - PMIN) * (y1 - y0); };
    G.X = X; G.Y = Y; G.x0 = x0; G.x1 = x1; G.y0 = y0; G.y1 = y1; G.xmax = xmax;
    g.fillStyle = LD.alpha(C.surface, C.dark ? 0.2 : 0.55); g.fillRect(x0, y0, x1 - x0, y1 - y0);
    const xs = xStep(xmax);
    const gridLines = function (major) {
      g.beginPath();
      for (let k = PMIN; k <= PMAX; k++) if ((k % 2 === 0) === major) { const y = Math.round(Y(k)) + 0.5; g.moveTo(x0, y); g.lineTo(x1, y); }
      for (let i = 0; i * xs / 2 <= xmax + 1e-9; i++) if ((i % 2 === 0) === major) { const x = Math.round(X(i * xs / 2)) + 0.5; g.moveTo(x, y0); g.lineTo(x, y1); }
      g.strokeStyle = LD.alpha(C.text, major ? (C.dark ? 0.11 : 0.1) : (C.dark ? 0.05 : 0.04)); g.lineWidth = 1; g.stroke();
    };
    gridLines(false); gridLines(true);
    // 理論曲線：pCa（實線色）與 pMg（虛線）
    if (state.theory && !hid) {
      const tp = theoryPts(r, xmax);
      const line = function (key, col, dash) {
        g.save(); g.setLineDash(dash); g.strokeStyle = col; g.lineWidth = 1.5; g.lineJoin = 'round';
        g.beginPath(); let pen = false;
        tp.forEach(function (q) {
          const v = q[key];
          if (v == null || !isFinite(v)) { pen = false; return; }
          const x = X(q.u / U), y = Y(Math.max(PMIN - 0.3, Math.min(PMAX + 0.3, v)));
          if (pen) g.lineTo(x, y); else g.moveTo(x, y); pen = true;
        });
        g.stroke(); g.restore();
      };
      line('pCa', LD.alpha(runColour(r), 0.75), [6, 4]);
      line('pMg', LD.alpha(C.equi, 0.85), [2, 3]);
    }
    g.save(); g.beginPath(); g.rect(x0, y0 - 2, x1 - x0, y1 - y0 + 4); g.clip();
    S.runs.slice().reverse().forEach(function (q) { drawRunCurve(g, q, X, Y, true); });
    drawRunCurve(g, r, X, Y, false);
    g.restore();
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
      LD.haloText(g, T('|ΔpCa/ΔV|（每 mL）', '|ΔpCa/ΔV| (per mL)'), x1 - 6, y0 + 30, C.accent, 'right', 'alphabetic', '600 11px ' + FF);
    }
    const Vnow = r.u / U;
    if (!hid && r.Veq > 0 && (state.theory || Vnow >= r.Veq)) {
      const px = X(r.Veq);
      if (px <= x1 + 0.5) {
        g.save(); g.setLineDash([3, 3]); g.strokeStyle = LD.alpha(C.text, 0.45); g.lineWidth = 1;
        g.beginPath(); g.moveTo(px, y0); g.lineTo(px, y1); g.stroke(); g.restore();
        pillGraph(g, T('當量點 ' + r.Veq.toFixed(2) + ' mL', 'equivalence ' + r.Veq.toFixed(2) + ' mL'), px + 8, y1 - 8, C.text, 'left', x0, x1);
      }
    }
    if (r.endpoint != null) {
      const px = X(r.endpoint);
      if (px <= x1) {
        g.strokeStyle = C.equi; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(px, y0); g.lineTo(px, y1); g.stroke();
        pillGraph(g, T('你的終點 ', 'your end point ') + vRead(r.endpoint * U) + ' mL', px - 5, y0 + (x1 - x0 < 520 ? 40 : 18), C.equi, 'right', x0, x1);   // 窄版往下一行，不蓋住左上角的 pCa 標題
      }
    }
    // 座標軸
    g.strokeStyle = LD.alpha(C.text, 0.6); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0, y1); g.lineTo(x1, y1); if (state.deriv) g.lineTo(x1, y0); g.stroke();
    g.fillStyle = C.text; g.font = '11px ' + FF; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let k = PMIN; k <= PMAX; k += 2) g.fillText(String(k), x0 - 6, Y(k));
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    for (let v = 0; v <= xmax + 1e-9; v += xs) g.fillText(fmtAxis(v), X(v), y1 + 32);
    richText(g, [{ t: 'pCa = −log[' }, { f: 'Ca^2+' }, { t: ']' }], x0 + 6, y0 + 14, C.text, 12, 'left');
    LD.haloText(g, T('加入的 EDTA 體積 V（mL）', 'Volume of EDTA added, V (mL)'), (x0 + x1) / 2, H - 8, C.muted, 'center', 'alphabetic', '600 12px ' + FF);
    // 瓶中顏色的色條
    const sy = y1 + 5, shh = 11;
    g.fillStyle = LD.alpha(C.text, 0.06); g.fillRect(x0, sy, x1 - x0, shh);
    const pts = r.pts, n = pts.length;
    const paint = function (q, a, b) {
      if (!q.c) return;
      g.fillStyle = rgbStr(q.c);
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
    g.strokeStyle = LD.alpha(C.text, 0.25); g.lineWidth = 1; g.strokeRect(x0 + 0.5, sy + 0.5, x1 - x0 - 1, shh - 1);
    if (!r.rows.some(function (q) { return q.m; }) && !state.meter) {
      LD.haloText(g, T('鈣離子電極不在瓶中：只能看顏色', 'The calcium electrode is not in the flask: colour only'), (x0 + x1) / 2, (y0 + y1) / 2, C.muted, 'center', 'middle', '12px ' + FF);
    }
    if (hover) drawHover(g, X, Y);
  }
  function fmtAxis(v) { return Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(v < 1 ? 2 : 1); }
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
    const col = runColour(r);
    g.save();
    g.strokeStyle = old ? LD.alpha(col, 0.45) : col;
    g.lineWidth = old ? 1.5 : 2.4; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath();
    let pen = false, lastX = 0, lastY = 0;
    r.pts.forEach(function (q) {
      if (!q.m || q.pCa == null) { pen = false; return; }
      const x = X(q.u / U), y = Y(q.pCa);
      if (pen) g.lineTo(x, y); else g.moveTo(x, y);
      pen = true; lastX = x; lastY = y;
    });
    g.stroke();
    if (!old) {
      g.fillStyle = col;
      r.rows.forEach(function (q) { if (q.m && q.pCa != null) { g.beginPath(); g.arc(X(q.u / U), Y(q.pCa), 2.4, 0, Math.PI * 2); g.fill(); } });
    } else if (r.no && pen) {
      LD.haloText(g, '#' + r.no, Math.min(lastX + 4, G.x1 - 18), lastY - 4, col, 'left', 'alphabetic', '600 11px ' + FF);
    }
    g.restore();
  }
  function drawHover(g, X, Y) {
    const r = S.run;
    let best = null, bd = 28;
    r.pts.forEach(function (q) { if (q.m && q.pCa != null) { const d = Math.abs(X(q.u / U) - hover.x); if (d < bd) { bd = d; best = q; } } });
    let v, pc, lab;
    if (best) { v = best.u / U; pc = best.pCa; lab = 'V = ' + vRead(best.u) + ' mL' + T('・', ', ') + 'pCa = ' + pc.toFixed(2); }
    else if (state.theory && !mysteryHidden()) {
      v = Math.max(0, Math.min(G.xmax, (hover.x - G.x0) / (G.x1 - G.x0) * G.xmax));
      const e = K.eqAt(r.p, r.nCa, r.nMg, v * U);
      pc = e.pCa;
      if (pc == null) return;
      lab = T('理論：', 'theory: ') + 'V = ' + v.toFixed(2) + ' mL' + T('・', ', ') + 'pCa = ' + pc.toFixed(2);
    } else return;
    const x = X(v), y = Y(Math.max(PMIN, Math.min(PMAX, pc)));
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
    return rows.map(function (q) { return '<dt>' + q[0] + '</dt><dd' + (q[2] ? ' class="' + q[2] + '"' : '') + '>' + q[1] + '</dd>'; }).join('');
  }
  const CA = 'Ca<sup>2+</sup>', MG = 'Mg<sup>2+</sup>';
  function unitH() { return T('mg/L<small>以 CaCO<sub>3</sub> 計</small>', 'mg/L<small>as CaCO<sub>3</sub></small>'); }
  function renderReadouts() {
    const r = S.run, p = r.p, e = r.eq, hid = mysteryHidden(), rows = [];
    rows.push([T('滴定管讀數（最低點）', 'Burette reading (bottom of meniscus)'), vRead(r.fill) + ' mL', 'big']);
    if (r.out !== r.fill) rows.push([T('這一瓶累計流出', 'Run out into this flask'), vRead(r.out) + ' mL']);
    rows.push([T('錐形瓶中的溶液', 'Solution in the flask'), num(e.V, 1) + ' mL']);
    rows.push(['pH', p.mode === 'A' ? '10.0' : '12.0']);
    if (state.meter) rows.push(['pCa' + T('<small>鈣離子電極</small>', '<small>calcium electrode</small>'), e.pCa == null ? '—' : e.pCa.toFixed(2), 'big']);
    else rows.push(['pCa', '—<small>' + T('電極不在瓶中', 'electrode not in the flask') + '</small>']);
    rows.push([T('溶液的顏色', 'Colour of the solution'), tn(COLOUR_NAMES[K.colourKey(e.rf)]), e.rf <= K.BLUE_RF ? 'good' : '']);
    rows.push([T('指示劑與金屬結合的比例', 'Indicator bound to metal'), (e.rf * 100).toFixed(e.rf < 0.1 ? 1 : 0) + '%']);
    if (!hid) {
      if (r.nCa > 0) rows.push([CA + T(' 被 EDTA 螯合', ' held by EDTA'), (Math.min(1, e.fCa) * 100).toFixed(1) + '%']);
      if (p.mode === 'A' && (r.nMg > 0 || p.mgEdta)) rows.push([MG + T(' 被 EDTA 螯合', ' held by EDTA'), (Math.min(1, e.fMg) * 100).toFixed(1) + '%']);
    }
    if (p.mode === 'B' && r.nMg > 0) rows.push([MG + T(' 沉澱成 Mg(OH)<sub>2</sub>', ' precipitated as Mg(OH)<sub>2</sub>'), (Math.min(1, e.MgSolid * e.V / r.nMg) * 100).toFixed(1) + '%']);
    $('readout').innerHTML = dl(rows);
  }
  function renderAnalysis() {
    const r = S.run, p = r.p, hid = mysteryHidden(), rows = [];
    rows.push([T('莫耳數比', 'Mole ratio') + '<small>' + T('金屬離子', 'metal ion') + ' : EDTA</small>', '1 : 1']);
    rows.push([T('當量點體積（理論）', 'Equivalence volume (theory)') + '<small>' + (p.mode === 'A' ? 'V<sub>eq</sub> = (n<sub>Ca</sub> + n<sub>Mg</sub>) / c<sub>EDTA</sub>' : 'V<sub>eq</sub> = n<sub>Ca</sub> / c<sub>EDTA</sub>') + '</small>', hid ? '？' : r.Veq.toFixed(2) + ' mL']);
    if (r.endpoint != null) {
      const Hm = r.endpoint * p.cE / p.Va * K.MW.CaCO3 * 1000;
      rows.push([T('你記錄的終點', 'Your end point'), vRead(r.endpoint * U) + ' mL', 'good']);
      rows.push([(p.mode === 'A' ? T('算出的總硬度', 'Total hardness from it') : T('算出的鈣硬度', 'Calcium hardness from it')) + '<small>H = c<sub>EDTA</sub>V × 100.09 / V<sub>s</sub></small>', fH(Hm) + ' ' + unitH(), 'big']);
      if (!hid) {
        const err = r.endpoint - r.Veq;
        rows.push([T('終點 − 當量點', 'End point − equivalence'), signed(err, 3) + ' mL', Math.abs(err) <= 0.1 + 1e-9 ? 'good' : 'warn']);
      }
    } else rows.push([T('你記錄的終點', 'Your end point'), T('還沒記錄', 'not yet')]);
    if (!hid) rows.push([p.mode === 'A' ? T('真正的總硬度', 'True total hardness') : T('真正的鈣硬度', 'True calcium hardness'), fH(p.mode === 'A' ? p.water.H : p.water.Hca) + ' ' + unitH()]);
    const ms = maxSlope(r);
    rows.push([T('數據中斜率最大處', 'Steepest point in your data') + '<small>' + T('相鄰兩點 ΔpCa/ΔV 最大', 'largest ΔpCa/ΔV between neighbours') + '</small>', ms ? 'V ≈ ' + ms.v.toFixed(3) + ' mL' : '—']);
    if (isMys() && S.sample.revealed) {
      rows.push([T('未知水樣的總硬度', 'Total hardness of the unknown'), fH(S.sample.H) + ' ' + unitH(), 'good']);
      rows.push([T('未知水樣的鈣硬度', 'Calcium hardness of the unknown'), fH(S.sample.Hca) + ' ' + unitH(), 'good']);
    }
    $('anaOut').innerHTML = dl(rows);
  }
  let latestRow = false;
  function renderTable() {
    const r = S.run;
    let h = '<thead><tr><th>#</th><th>V<br><small>(mL)</small></th><th>pCa</th><th class="d">ΔpCa/ΔV<br><small>(' + T('每 mL', 'per mL') + ')</small></th><th>' + T('顏色', 'Colour') + '</th></tr></thead><tbody>';
    let prev = null;
    r.rows.forEach(function (q, i) {
      const pc = q.m ? q.pCa : null;
      let d = '—', jump = false;
      if (pc != null && prev && q.u > prev.u) { const dd = (pc - prev.pc) / ((q.u - prev.u) / U); d = dd.toFixed(Math.abs(dd) >= 10 ? 1 : 2); jump = dd >= 5; }
      const cls = (latestRow && i === r.rows.length - 1 ? 'latest' : '') + (jump ? ' jump' : '');
      const col = q.c || flaskRGB(r);
      h += '<tr' + (cls.trim() ? ' class="' + cls.trim() + '"' : '') + '><td>' + i + '</td><td>' + vRead(q.u) + '</td><td>' + (pc == null ? '—' : pc.toFixed(2)) + '</td><td class="d">' + d + '</td><td class="col"><i style="background:' + rgbStr(col) + '"></i>' + (q.rf != null && q.rf <= K.BLUE_RF ? T('藍', 'blue') : '') + '</td></tr>';
      if (pc != null) prev = { u: q.u, pc: pc };
    });
    h += '</tbody>';
    $('tbl').innerHTML = h;
    const wrap = $('tblWrap');
    if (latestRow) wrap.scrollTop = wrap.scrollHeight;
  }
  function runLabel(r, current) {
    const p = r.p, w = p.water;
    const name = w.unknown ? T('未知水樣', 'unknown water') : tn(PRESET_NAMES[w.preset] || PRESET_NAMES.custom) + (w.step ? T('（處理過）', ' (treated)') : '');
    return (current ? T('目前（#' + r.no + '）：', 'Now (#' + r.no + '): ') : '#' + r.no + ' ') + name + T('・', ', ') + (p.mode === 'A' ? T('總硬度 pH 10', 'total, pH 10') + (p.mgEdta ? '＋Mg–EDTA'.replace('＋', T('＋', ' + ')) : '') : T('鈣硬度 pH 12', 'calcium, pH 12'));
  }
  function renderLegend() {
    const items = [], r = S.run, col = runColour(r);
    items.push('<span style="color:' + col + '"><i class="ln" style="background:' + col + '"></i>' + runLabel(r, true) + '</span>');
    if (state.theory && !mysteryHidden()) {
      items.push('<span style="color:' + col + '"><i class="ln dash"></i>' + T('理論 pCa', 'theory pCa') + '</span>');
      items.push('<span style="color:' + C.equi + '"><i class="ln dot" style="border-color:' + C.equi + '"></i>' + T('理論 pMg', 'theory pMg') + '</span>');
    }
    S.runs.forEach(function (q) {
      const c = runColour(q);
      items.push('<span><i class="ln old" style="background:' + c + '"></i>' + runLabel(q, false) + '</span>');
    });
    if (state.deriv) items.push('<span style="color:' + C.accent + '"><i class="ln" style="background:' + C.accent + '"></i>|ΔpCa/ΔV|</span>');
    if (r.endpoint != null) items.push('<span style="color:' + C.equi + '"><i class="ln" style="background:' + C.equi + '"></i>' + T('你的終點', 'your end point') + '</span>');
    $('curveLegend').innerHTML = items.join('');
  }
  function renderModeInfo() {
    const A = state.mode === 'A';
    $('modeInfo').innerHTML = A
      ? T('pH 10（NH<sub>3</sub>–NH<sub>4</sub>Cl 緩衝液）：EDTA 把 ' + CA + ' 和 ' + MG + ' 都滴完，量到<strong>總硬度</strong>。EBT 和 ' + MG + ' 結合得比和 ' + CA + ' 緊，所以最後變色的是 MgIn<sup>−</sup>。',
        'pH 10 (NH<sub>3</sub>–NH<sub>4</sub>Cl buffer): EDTA takes up both ' + CA + ' and ' + MG + ', so you measure the <strong>total hardness</strong>. EBT binds ' + MG + ' more tightly than ' + CA + ', so the last colour change is MgIn<sup>−</sup> giving up its Mg.')
      : T('加 NaOH 到 pH 12：' + MG + ' 沉澱成 Mg(OH)<sub>2</sub>，EDTA 只滴到 ' + CA + '，量到<strong>鈣硬度</strong>。鎂硬度 = 總硬度 − 鈣硬度。',
        'NaOH to pH 12: ' + MG + ' precipitates as Mg(OH)<sub>2</sub>, so EDTA titrates ' + CA + ' alone and you measure the <strong>calcium hardness</strong>. Magnesium hardness = total − calcium.');
    const mg = $('mgedta');
    mg.disabled = !A;
    mg.checked = A && state.mgEdta;
    mg.parentElement.style.opacity = A ? '' : '0.5';
    mg.parentElement.title = A ? '' : T('pH 12 時不用 EBT，也不加 Mg–EDTA', 'Not used at pH 12');
    const th = $('theory');
    th.disabled = mysteryHidden();
    th.checked = !th.disabled && state.theory;
    th.parentElement.style.opacity = th.disabled ? '0.5' : '';
    th.parentElement.title = th.disabled ? T('未知水樣的答案揭曉後才能看理論曲線', 'Available after the answer is revealed') : '';
  }
  function renderAll() {
    renderReadouts(); renderAnalysis(); renderTable(); renderLegend(); renderModeInfo(); renderBench(); updateButtons();
    drawGraph(); kick();
  }
  function updateButtons() {
    const r = S.run;
    if (!r) return;
    const tb = $('tap');
    tb.setAttribute('aria-pressed', String(state.tap));
    tb.textContent = state.tap ? T('關閉活栓', 'Close stopcock') : T('打開活栓', 'Open stopcock');
    $('endBtn').disabled = r.endpoint != null;
    $('endBtn').title = r.endpoint != null ? T('這一瓶的終點已經記錄了；要重做請按「換一瓶」', 'The end point of this flask is recorded; press “New flask” to repeat') : '';
    const mys = isMys();
    ['boilBtn', 'sodaBtn', 'resinBtn'].forEach(function (id) {
      $(id).disabled = mys;
      $(id).title = mys ? T('未知水樣要直接測，不能先處理', 'The unknown water must be measured as it is') : '';
    });
    $('mysCard').hidden = !mys;
  }

  // ======================= 工作台的讀數 =======================
  function renderBench() {
    const i = K.benchInfo(B), mys = isMys(), q = function (x) { return mys ? '?' : x; };
    const pinfo = {
      dist: T('蒸餾水幾乎不含離子：肥皂一滴就起泡。', 'Distilled water holds almost no ions: one drop of soap lathers.'),
      soft: T('山區水庫的水：流經的岩層少有石灰岩，鈣、鎂都很少。', 'Water from a mountain reservoir: it has run over little limestone, so there is little calcium or magnesium.'),
      tap: T('自來水：溶有一些鈣與鎂的碳酸氫鹽，燒開水會留下一點水垢。', 'Tap water: it holds some calcium and magnesium hydrogencarbonates, so a kettle slowly grows scale.'),
      ground: T('流過石灰岩的地下水：CaCO<sub>3</sub> + CO<sub>2</sub> + H<sub>2</sub>O → Ca(HCO<sub>3</sub>)<sub>2</sub>，暫時硬度很高。', 'Groundwater from limestone: CaCO<sub>3</sub> + CO<sub>2</sub> + H<sub>2</sub>O → Ca(HCO<sub>3</sub>)<sub>2</sub>, so its temporary hardness is high.'),
      mineral: T('含鎂多的礦泉水：鎂硬度比鈣硬度大，而且有一部分是煮不掉的永久硬度。', 'Magnesium-rich mineral water: more magnesium than calcium hardness, and part of it is permanent hardness that boiling cannot remove.'),
      mys: T('成分保密的未知水樣：用 EDTA 滴定求出它的總硬度與鈣硬度，答案欄在滴定曲線旁（手機在下方）。這一瓶不能先做軟化處理。', 'An unknown water of secret composition: find its total and calcium hardness by EDTA titration; the answer box is next to the titration curve (below it on a phone). It cannot be treated first.'),
      custom: T('自訂的水：組成照下面的滑桿（Na<sup>+</sup> 10 mg/L）。', 'Custom water: made up from the sliders below (Na<sup>+</sup> 10 mg/L).')
    };
    $('presetInfo').innerHTML = pinfo[B.preset] || pinfo.custom;
    $('customBox').hidden = mys;
    const rows = [];
    rows.push([T('燒杯中的水', 'Water in the beaker'), Math.round(i.V * 1000) + ' mL']);
    rows.push([T('總硬度', 'Total hardness'), q(fH(i.H)) + ' ' + unitH(), 'big']);
    rows.push([T('分級（USGS）', 'Class (USGS)'), mys ? '?' : tn(CLASS_NAMES[i.cls])]);
    rows.push([T('鈣硬度・鎂硬度', 'Calcium · magnesium hardness'), q(fH(i.Hca)) + T('・', ' · ') + q(fH(i.Hmg)) + ' mg/L']);
    rows.push([T('暫時硬度・永久硬度', 'Temporary · permanent'), q(fH(i.Htemp)) + T('・', ' · ') + q(fH(Math.max(0, i.Hperm))) + ' mg/L']);
    rows.push([CA + T('・', ' · ') + MG, q(fmg(i.mg.Ca)) + T('・', ' · ') + q(fmg(i.mg.Mg)) + ' mg/L']);
    rows.push(['HCO<sub>3</sub><sup>−</sup>' + T('・', ' · ') + 'Na<sup>+</sup>', q(fmg(i.mg.HCO3)) + T('・', ' · ') + q(fmg(i.mg.Na)) + ' mg/L']);
    if (i.mg.CO3 > 0.05) rows.push(['CO<sub>3</sub><sup>2−</sup>' + T('（過量的洗滌鹼）', ' (excess washing soda)'), fmg(i.mg.CO3) + ' mg/L']);
    if (B.scale > 0.05) rows.push([T('杯底的水垢', 'Scale on the bottom'), Math.round(B.scale) + ' mg']);
    $('wout').innerHTML = dl(rows);
    const rs = B.resin;
    $('resinInfo').innerHTML = T('樹脂還能交換 ' + num(rs.left, 2) + ' mmol（共 5.0 mmol）；已抓住 ' + CA + ' ' + num(rs.Ca, 2) + ' mmol、' + MG + ' ' + num(rs.Mg, 2) + ' mmol。',
      'The resin can still take ' + num(rs.left, 2) + ' mmol (of 5.0 mmol); it holds ' + CA + ' ' + num(rs.Ca, 2) + ' mmol and ' + MG + ' ' + num(rs.Mg, 2) + ' mmol.');
    const s = soapNow(), det = B.tube.detergent;
    const srows = [];
    srows.push([T('試管', 'Test tube'), T('水樣 5.00 mL＋', '5.00 mL water + ') + B.tube.drops + T(' 滴' + (det ? '清潔劑' : '肥皂水'), (det ? ' drop' + (B.tube.drops === 1 ? '' : 's') + ' of detergent' : ' drop' + (B.tube.drops === 1 ? '' : 's') + ' of soap'))]);
    srows.push([T('加入的' + (det ? '清潔劑' : '肥皂'), (det ? 'Detergent' : 'Soap') + ' added'), num(s.nS, 1) + ' µmol']);
    if (!det) srows.push([T('變成浮渣（金屬肥皂）', 'Turned into scum (metal soap)'), num(s.ppt, 2) + ' µmol']);
    srows.push([T('溶液中剩下的' + (det ? '清潔劑' : '肥皂'), 'Free ' + (det ? 'detergent' : 'soap') + ' left'), sciHTML(Math.max(0, s.cFree), 2) + ' M']);
    srows.push([T('結果', 'Result'), B.tube.drops === 0 ? T('還沒加', 'nothing added yet') : s.lather ? T('持久的泡沫', 'lasting lather') : (s.ppt > 0.01 ? T('只有浮渣、沒有持久泡沫', 'scum, no lasting lather') : T('還沒有持久泡沫', 'no lasting lather yet')), s.lather ? 'good' : '']);
    $('sout').innerHTML = dl(srows);
  }
  /** 狀態列的化學式加上下標（訊息都是程式自己組的字串，先跳脫再換） */
  function chemHTML(msg) {
    return String(msg).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\b(Ca|Mg)2\+/g, '$1<sup>2+</sup>').replace(/\bNa\+/g, 'Na<sup>+</sup>')
      .replace(/\(OH\)2\b/g, '(OH)<sub>2</sub>').replace(/\bNa2CO3\b/g, 'Na<sub>2</sub>CO<sub>3</sub>')
      .replace(/\bCaCO3\b/g, 'CaCO<sub>3</sub>').replace(/\bHCO3(−|-)/g, 'HCO<sub>3</sub><sup>−</sup>');
  }
  function bStatus(msg, warn) { const el = $('bstatus'); el.innerHTML = chemHTML(msg); el.classList.toggle('warn', !!warn); }

  // ======================= 狀態列 =======================
  let holdUntil = 0;
  function showStatus(msg, warn) { const el = $('status'); el.innerHTML = chemHTML(msg); el.classList.toggle('warn', !!warn); }
  function setStatus(msg, warn) { showStatus(msg, warn); holdUntil = performance.now() + 3500; }
  function routineStatus(msg) { if (performance.now() >= holdUntil) showStatus(msg, false); }

  // ======================= 音效（預設關閉；主要頻率都在 300 Hz 以上） =======================
  const SND = function () { return window.LabSound; };
  let lastDrop = 0;
  function sndDrop(n) {
    const now = performance.now();
    if (now - lastDrop < 75 || (state.tap && state.rate > STREAM_RATE)) return;
    lastDrop = now;
    if (SND()) SND().sweep({ from: n >= DROP ? 650 : 850, to: n >= DROP ? 1400 : 1750, dur: 0.07, type: 'sine', gain: 0.16 });
  }
  function sndStream() { if (SND()) SND().noise({ dur: 0.12, gain: 0.06, filter: 2400, q: 0.8 }); }
  function sndColour() {
    if (!SND()) return;
    SND().tone({ freq: 659, dur: 0.3, type: 'sine', gain: 0.13 });
    SND().tone({ freq: 880, dur: 0.34, type: 'sine', gain: 0.11, delay: 0.08 });
    SND().tone({ freq: 1319, dur: 0.42, type: 'triangle', gain: 0.07, delay: 0.16 });
  }
  function sndRecord() { if (SND()) SND().tone({ freq: 1000, dur: 0.12, type: 'square', gain: 0.1 }); }
  function sndEmpty() { if (SND()) SND().sweep({ from: 520, to: 300, dur: 0.25, type: 'triangle', gain: 0.14 }); }
  function sndRefill() { if (SND()) SND().noise({ dur: 0.4, gain: 0.12, filter: 1300, q: 0.9 }); }
  function sndClick() { if (SND()) SND().tone({ freq: 1320, dur: 0.03, type: 'square', gain: 0.08 }); }
  function sndCheck(ok) {
    if (!SND()) return;
    if (ok) { SND().tone({ freq: 880, dur: 0.14, type: 'sine', gain: 0.12 }); SND().tone({ freq: 1320, dur: 0.2, type: 'sine', gain: 0.1, delay: 0.1 }); }
    else SND().sweep({ from: 600, to: 380, dur: 0.22, type: 'triangle', gain: 0.12 });
  }
  /** 煮沸：一串隨機的小氣泡聲 */
  function sndBoil() {
    if (!SND()) return;
    for (let i = 0; i < 14; i++) SND().noise({ dur: 0.05 + Math.random() * 0.05, gain: 0.05 + Math.random() * 0.05, filter: 900 + Math.random() * 1600, q: 3, delay: i * 0.13 + Math.random() * 0.06 });
  }
  /** 沉澱：沙沙聲往下沉 */
  function sndPpt() {
    if (!SND()) return;
    SND().noise({ dur: 0.6, gain: 0.08, filter: 2600, q: 0.7 });
    SND().sweep({ from: 900, to: 420, dur: 0.5, type: 'triangle', gain: 0.07, delay: 0.1 });
  }
  /** 樹脂：細細的流水聲 */
  function sndResin() { if (SND()) { SND().noise({ dur: 1.2, gain: 0.07, filter: 1800, q: 1.2 }); SND().noise({ dur: 0.5, gain: 0.05, filter: 3200, q: 2, delay: 0.6 }); } }
  function sndSoapDrop() { if (SND()) SND().sweep({ from: 700, to: 1500, dur: 0.06, type: 'sine', gain: 0.13 }); }
  /** 起泡：一串往上的小泡泡；浮渣：悶悶的一聲 */
  function sndLather() {
    if (!SND()) return;
    for (let i = 0; i < 6; i++) SND().sweep({ from: 900 + i * 120, to: 1800 + i * 150, dur: 0.06, type: 'sine', gain: 0.08, delay: 0.25 + i * 0.07 });
  }
  function sndScum() { if (SND()) SND().tone({ freq: 330, dur: 0.18, type: 'triangle', gain: 0.1, delay: 0.3 }); }

  // ======================= 控制項：工作台 =======================
  const caEl = $('ca'), mgEl = $('mg'), hco3El = $('hco3'), doseEl = $('dose'), vaEl = $('va'), ceEl = $('ce'), rateEl = $('rate');
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function readBenchSliders() {
    const o = { Ca: clamp(val(caEl), 0, 200), Mg: clamp(val(mgEl), 0, 100), HCO3: clamp(val(hco3El), 0, 600) };
    state.dose = clamp(val(doseEl), 0, 600);
    $('cao').textContent = fdec(o.Ca, 1, 2) + ' mg/L';
    $('mgo').textContent = fdec(o.Mg, 1, 2) + ' mg/L';
    $('hco3o').textContent = fdec(o.HCO3, 0, 1) + ' mg/L';
    $('doseo').textContent = fdec(state.dose, 0, 1) + ' mg/L';
    return o;
  }
  function readTitrSliders() {
    state.Va = clamp(val(vaEl), 10, 100);
    state.cE = clamp(val(ceEl), 0.005, 0.02);
    state.rate = clamp(val(rateEl), 0.1, 2);
    $('vao').textContent = state.Va.toFixed(2) + ' mL';
    $('ceo').textContent = fdec(state.cE, 4, 5) + ' M';
    $('rateo').textContent = state.rate.toFixed(2) + ' mL/s';
  }
  // 程式自己設定滑桿時（LabNum.set 會送出 input 事件），不要當成學生在調整
  let quiet = 0;
  function setSlidersTo(mg) {
    if (!window.LabNum) return;
    quiet++;
    try { window.LabNum.set(caEl, mg.Ca); window.LabNum.set(mgEl, mg.Mg); window.LabNum.set(hco3El, mg.HCO3); } finally { quiet--; }
  }
  function pressGroup(sel, attr, value) {
    document.querySelectorAll(sel).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(value))); });
  }
  /** 燒杯裡的水換了：錐形瓶也換一瓶新的（裝新的水），舊曲線留在圖上 */
  function waterChanged() {
    newRun();
    renderAll();
  }
  document.querySelectorAll('#presetSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      const pr = b.getAttribute('data-preset');
      if (pr === 'mys') K.benchSet(B, 'mys', S.sample);
      else { K.benchSet(B, pr); setSlidersTo(K.PRESETS[pr]); readBenchSliders(); }
      pressGroup('#presetSeg button', 'data-preset', pr);
      sndClick();
      waterChanged();
      bStatus(T('換了一杯 1 L 的' + tn(PRESET_NAMES[pr]) + '；滴定用的錐形瓶也換成這杯水。', 'A fresh litre of ' + tn(PRESET_NAMES[pr]) + '; the titration flask now holds this water too.'));
    });
  });
  [caEl, mgEl, hco3El].forEach(function (el) {
    const on = function () {
      const o = readBenchSliders();
      if (quiet) return;
      K.benchSet(B, 'custom', { Ca: o.Ca, Mg: o.Mg, HCO3: o.HCO3, Na: 10 });
      pressGroup('#presetSeg button', 'data-preset', '');
      waterChanged();
      bStatus(T('自訂的水：硬度 ' + fH(K.benchInfo(B).H) + ' mg/L。', 'Custom water: hardness ' + fH(K.benchInfo(B).H) + ' mg/L.'));
    };
    el.addEventListener('input', on);
    el.addEventListener('change', on);
  });
  doseEl.addEventListener('input', readBenchSliders);
  doseEl.addEventListener('change', readBenchSliders);
  function anim(kind, dur) { state.banim = reduced ? null : { kind: kind, t: 0, dur: dur }; kick(); }
  $('boilBtn').addEventListener('click', function () {
    if (isMys()) return;
    const d = K.benchBoil(B);
    if (!d) { bStatus(T('水只剩 ' + Math.round(B.water.V * 1000) + ' mL，不能再煮了（至少要留 500 mL）。換一杯新的水吧。', 'Only ' + Math.round(B.water.V * 1000) + ' mL left: it cannot be boiled again (500 mL must remain). Take a fresh litre.'), true); return; }
    anim('boil', 2.4);
    sndBoil();
    waterChanged();
    const dH = d.H0 - d.H;
    bStatus(dH >= 0.05
      ? T('煮沸 10 分鐘：Ca(HCO3)2 → CaCO3↓ + CO2 + H2O，硬度從 ' + fH(d.H0) + ' 降到 ' + fH(d.H) + ' mg/L，杯底多了 ' + Math.round(d.dScale) + ' mg 水垢；同時蒸發掉 100 mL 水。', 'Boiled 10 min: Ca(HCO3)2 → CaCO3↓ + CO2 + H2O. Hardness fell from ' + fH(d.H0) + ' to ' + fH(d.H) + ' mg/L, leaving ' + Math.round(d.dScale) + ' mg of scale; 100 mL of water boiled away.')
      : T('煮沸 10 分鐘：沒有碳酸氫根可以變成水垢，硬度從 ' + fH(d.H0) + ' 變成 ' + fH(d.H) + ' mg/L（蒸發掉 100 mL 水）。', 'Boiled 10 min: there is no hydrogencarbonate to turn into scale; hardness went from ' + fH(d.H0) + ' to ' + fH(d.H) + ' mg/L (100 mL boiled away).'));
    emit('treat', d);
  });
  $('sodaBtn').addEventListener('click', function () {
    if (isMys()) return;
    if (state.dose <= 0) { bStatus(T('洗滌鹼的劑量是 0：先把滑桿往右拉。', 'The washing-soda dose is 0: move the slider first.'), true); return; }
    const d = K.benchSoda(B, state.dose);
    anim('soda', 2.2);
    sndPpt();
    waterChanged();
    bStatus(T('加入 ' + fdec(state.dose, 0, 1) + ' mg Na2CO3：CaCO3 沉澱、濾掉。Ca2+ 從 ' + fmg(d.Ca0) + ' 剩 ' + fmg(d.Ca) + ' mg/L，Mg2+ 從 ' + fmg(d.Mg0) + ' 剩 ' + fmg(d.Mg) + ' mg/L。', 'Added ' + fdec(state.dose, 0, 1) + ' mg of Na2CO3; the CaCO3 is filtered off. Ca2+ went from ' + fmg(d.Ca0) + ' to ' + fmg(d.Ca) + ' mg/L, Mg2+ from ' + fmg(d.Mg0) + ' to ' + fmg(d.Mg) + ' mg/L.'));
    emit('treat', d);
  });
  $('resinBtn').addEventListener('click', function () {
    if (isMys()) return;
    const d = K.benchResin(B);
    anim('resin', 2.0);
    sndResin();
    waterChanged();
    bStatus(d.H < 1
      ? T('整杯水流過樹脂：Ca2+、Mg2+ 換成 Na+，硬度從 ' + fH(d.H0) + ' 降到 ' + fH(d.H) + ' mg/L。樹脂還剩 ' + num(B.resin.left, 2) + ' mmol 的容量。', 'The whole beaker ran through the resin: Ca2+ and Mg2+ were swapped for Na+, and the hardness fell from ' + fH(d.H0) + ' to ' + fH(d.H) + ' mg/L. ' + num(B.resin.left, 2) + ' mmol of capacity left.')
      : T('流過樹脂後硬度還有 ' + fH(d.H) + ' mg/L：樹脂' + (B.resin.left <= 0 ? '的容量用完了，有離子漏過去。按「食鹽水再生」。' : '只換掉了一部分。'), 'After the resin the hardness is still ' + fH(d.H) + ' mg/L: ' + (B.resin.left <= 0 ? 'the resin is used up and ions leak through. Press “Regenerate with brine”.' : 'only part was exchanged.')), d.H >= 1 && B.resin.left <= 0);
    emit('treat', d);
  });
  $('regenBtn').addEventListener('click', function () {
    const used = K.RESIN_Q - B.resin.left;
    const d = K.benchRegen(B);
    anim('regen', 1.6);
    sndResin();
    renderAll();
    bStatus(used > 1e-9
      ? T('用濃食鹽水沖過樹脂：大量的 Na+ 把 ' + num(used, 2) + ' mmol 的 Ca2+、Mg2+ 換下來沖走，樹脂又回到鈉型。', 'Concentrated brine washed through the resin: the flood of Na+ pushed off ' + num(used, 2) + ' mmol of Ca2+ and Mg2+, and the resin is back in its sodium form.')
      : T('樹脂本來就是新的鈉型，不用再生。', 'The resin is already fresh, in its sodium form.'));
    emit('treat', d);
  });
  function soapDrop() {
    const det = $('deterg').checked;
    const before = soapNow();
    const d = K.benchSoap(B, det);
    state.soapDrop = reduced ? null : { t: 0 };
    if (reduced) state.shake = 0;
    sndSoapDrop();
    if (d.lather && !before.lather) sndLather();
    else if (!d.lather && d.ppt > before.ppt) sndScum();
    renderBench();
    kick();
    bStatus(d.lather
      ? T('第 ' + d.drops + ' 滴：搖一搖，出現持久的泡沫。', 'Drop ' + d.drops + ': shake it, and a lasting lather forms.')
      : (d.ppt > 0.01 ? T('第 ' + d.drops + ' 滴：搖一搖，只出現白色浮渣，泡沫一下就破了。', 'Drop ' + d.drops + ': shake it; only white scum forms and the bubbles burst at once.') : T('第 ' + d.drops + ' 滴：泡沫還不夠持久。', 'Drop ' + d.drops + ': the lather does not last yet.')));
    emit('soap', d);
  }
  $('soapBtn').addEventListener('click', soapDrop);
  $('tubeBtn').addEventListener('click', function () {
    B.tube = { drops: 0, detergent: $('deterg').checked };
    state.shake = 0; state.soapDrop = null;
    sndClick();
    renderBench(); kick();
    bStatus(T('換了一支乾淨的試管，裝 5.00 mL 燒杯裡的水。', 'A clean test tube with 5.00 mL of the water from the beaker.'));
  });
  $('deterg').addEventListener('change', function () {
    B.tube = { drops: 0, detergent: $('deterg').checked };
    renderBench(); kick();
    bStatus($('deterg').checked ? T('改用合成清潔劑（烷基苯磺酸鈉）：換了一支新試管。', 'Synthetic detergent (sodium alkylbenzenesulfonate) instead: a new test tube.') : T('改回肥皂（硬脂酸鈉）：換了一支新試管。', 'Back to soap (sodium stearate): a new test tube.'));
  });

  // ======================= 控制項：滴定 =======================
  function runOpts() { return { mode: state.mode, mgEdta: state.mgEdta, Va: state.Va, cE: state.cE, water: titrWater() }; }
  function newRun(keepOld) {
    closeTap();
    state.drops = []; state.plumes = []; state.ripples = []; state.pendingSettle = false; state.tag = null; state.flash = 0;
    K.newRun(S, runOpts(), keepOld);
    const r = S.run;
    r.pts[0].c = flaskRGB(r); r.pts[0].m = state.meter;
    r.rows[0].c = r.pts[0].c; r.rows[0].m = state.meter;
    latestRow = false;
    if (view3 && view3.active) view3.frame();
  }
  function freshFlaskNote() {
    const r = S.run, p = r.p, hid = mysteryHidden();
    if (!hid && r.Veq > VT_MAX - p.Va - K.V_ADD_ML) return T('注意：當量點需要的 EDTA 超過錐形瓶的容量，到不了當量點。', 'Note: the flask cannot hold enough EDTA to reach the equivalence point.');
    if (!hid && r.Veq > K.BURETTE_ML) return T('當量點需要 ' + r.Veq.toFixed(2) + ' mL，超過滴定管的 50 mL：中途要按「補充滴定液」。', 'The equivalence point needs ' + r.Veq.toFixed(2) + ' mL, more than the 50 mL burette holds: refill it on the way.');
    if (!hid && r.Veq < 1 && r.Veq > 0) return T('當量點只要 ' + r.Veq.toFixed(2) + ' mL：多取一點水樣，或用稀一點的 EDTA，誤差才會小。', 'The equivalence point is only ' + r.Veq.toFixed(2) + ' mL: take more water or use a more dilute EDTA to keep the error small.');
    if (p.mode === 'B' && r.nMg > 0) return T('加了 NaOH：Mg2+ 沉澱成白色的 Mg(OH)2，不會被 EDTA 滴到。', 'NaOH added: Mg2+ precipitates as white Mg(OH)2, so EDTA will not titrate it.');
    if (p.mode === 'A' && r.nMg <= 0 && !p.mgEdta && r.nCa > 0) return T('這瓶水沒有 Mg2+：看看 EBT 的變色會不會清楚。', 'This water has no Mg2+: see whether the EBT colour change is sharp.');
    return '';
  }
  [vaEl, ceEl].forEach(function (el) {
    const on = function () {
      readTitrSliders();
      if (quiet) return;
      const p = S.run.p;
      if (p.Va === state.Va && p.cE === state.cE) return;
      const had = S.run.u > 0;
      newRun();
      renderAll();
      const note = freshFlaskNote();
      setStatus(note || (had ? T('換了一瓶新的，上一瓶的曲線留在圖上。', 'A fresh flask; the previous curve stays on the graph.') : T('換了一瓶新的。', 'A fresh flask.')), /容量|hold enough/.test(note));
    };
    el.addEventListener('input', on);
    el.addEventListener('change', on);
  });
  rateEl.addEventListener('input', readTitrSliders);
  rateEl.addEventListener('change', readTitrSliders);
  document.querySelectorAll('#modeSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      const m = b.getAttribute('data-mode');
      if (m === state.mode) return;
      state.mode = m;
      pressGroup('#modeSeg button', 'data-mode', m);
      sndClick();
      newRun();
      renderAll();
      setStatus(freshFlaskNote() || (m === 'A' ? T('改測總硬度：pH 10 緩衝液＋EBT，溶液是酒紅色。', 'Total hardness: pH 10 buffer + EBT; the solution is wine red.') : T('改測鈣硬度：NaOH 調到 pH 12＋鈣指示劑。', 'Calcium hardness: NaOH to pH 12 + calcium indicator.')));
    });
  });
  $('mgedta').addEventListener('change', function () {
    state.mgEdta = $('mgedta').checked;
    sndClick();
    newRun();
    renderAll();
    setStatus(state.mgEdta
      ? T('緩衝液裡加了少量 Mg–EDTA：Ca2+ 把 EDTA 搶走、放出的 Mg2+ 讓 EBT 呈酒紅色；終點時 EDTA 又剛好把它拿回去，所以不會多用 EDTA。', 'A little Mg–EDTA is in the buffer: Ca2+ takes the EDTA and the Mg2+ released turns the EBT wine red; at the end point EDTA takes it back, so no extra EDTA is used.')
      : T('緩衝液不含 Mg–EDTA。', 'The buffer has no Mg–EDTA.'));
  });
  $('meter').addEventListener('change', function () {
    state.meter = $('meter').checked;
    const r = S.run;
    if (state.meter) {
      if (r.u > 0) {
        r.meterUsed = true;
        r.pts.push({ u: r.u, pCa: r.eq.pCa, rf: r.eq.rf, m: true, c: flaskRGB(r) });
        settleIfIdle();
      } else { r.pts[0].m = true; r.rows[0].m = true; }
    } else if (r.u === 0) { r.pts[0].m = false; r.rows[0].m = false; }
    sndClick();
    renderAll();
    if (!state.meter) setStatus(T('鈣離子電極放回蒸餾水中了：現在只能看指示劑的顏色判斷終點。', 'The calcium electrode is back in the distilled water: now only the indicator colour tells you the end point.'));
  });
  function settleIfIdle() {
    if (state.tap || state.drops.length) { state.pendingSettle = true; return; }
    settle();
  }
  $('theory').addEventListener('change', function () { state.theory = $('theory').checked; renderLegend(); drawGraph(); });
  $('deriv').addEventListener('change', function () { state.deriv = $('deriv').checked; renderLegend(); drawGraph(); });
  function addButton(n) {
    const r = S.run;
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
      setStatus(T('活栓關上了，滴定管讀數 ' + vRead(S.run.fill) + ' mL。', 'Stopcock closed at a burette reading of ' + vRead(S.run.fill) + ' mL.'));
      kick(); return;
    }
    if (K.BURETTE_UNITS - S.run.fill <= 0) { emptyNotice(); return; }
    state.tap = true; state.acc = 0;
    sndClick();
    updateButtons();
    setStatus(T('活栓打開了，流速 ' + state.rate.toFixed(2) + ' mL/s。看到紫色就關上，改成一滴一滴加。', 'Stopcock open at ' + state.rate.toFixed(2) + ' mL/s. Close it when purple appears and go drop by drop.'));
    kick();
  });
  $('endBtn').addEventListener('click', function () {
    const r = S.run;
    if (r.endpoint != null) return;
    if (r.out === 0) { setStatus(T('還沒有加入 EDTA。', 'No EDTA has been added yet.'), true); return; }
    closeTap();
    state.drops.splice(0).forEach(land);
    if (state.pendingSettle) { state.pendingSettle = false; settle(); }
    const d = K.endpoint(S, state.meter);
    sndRecord();
    renderAll();
    const hid = mysteryHidden();
    setStatus(T('記錄終點：' + vRead(r.out) + ' mL，算出' + (r.p.mode === 'A' ? '總' : '鈣') + '硬度 ' + fH(d.Hmeas) + ' mg/L', 'End point recorded: ' + vRead(r.out) + ' mL, giving a ' + (r.p.mode === 'A' ? 'total' : 'calcium') + ' hardness of ' + fH(d.Hmeas) + ' mg/L') +
      (hid ? T('。把它填進答案欄。', '. Put it in the answer box.') : T('；當量點 ' + r.Veq.toFixed(2) + ' mL，相差 ' + signed(d.err, 3) + ' mL。', '; equivalence point ' + r.Veq.toFixed(2) + ' mL, difference ' + signed(d.err, 3) + ' mL.')) +
      (d.blue ? '' : T('（溶液還不是純藍色）', ' (the solution is not pure blue yet)')));
    emit('endpoint', d);
  });
  $('refill').addEventListener('click', function () {
    const r = S.run;
    if (r.fill === 0) { setStatus(T('滴定管已經是滿的（0.00 mL）。', 'The burette is already full (0.00 mL).')); return; }
    closeTap();
    r.fill = 0;
    sndRefill();
    renderAll();
    setStatus(T('滴定管重新裝滿、調到 0.00 mL。終點的體積是每一管流出的量加起來（這裡自動累計）。', 'Burette refilled to 0.00 mL. The end-point volume is the sum of what each filling delivered (added up automatically here).'));
  });
  $('newFlask').addEventListener('click', function () {
    const had = S.run.u > 0;
    newRun();
    renderAll();
    setStatus(freshFlaskNote() || (had ? T('換上一瓶新的（上一瓶的曲線留在圖上），滴定管也重新裝滿了。', 'A fresh flask (the previous curve stays on the graph), and the burette is refilled.') : T('換上一瓶新的。', 'A fresh flask.')));
  });
  $('clearAll').addEventListener('click', function () {
    closeTap();
    state.drops = []; state.plumes = []; state.ripples = []; state.pendingSettle = false;
    K.clearAll(S, runOpts());
    const r = S.run;
    r.pts[0].c = flaskRGB(r); r.pts[0].m = state.meter; r.rows[0].c = r.pts[0].c; r.rows[0].m = state.meter;
    hover = null; latestRow = false;
    renderAll();
    setStatus(T('曲線、數據表與終點都清除了；水樣與滴定的設定沒有改變。', 'Curves, data table and end points cleared; the water and the titration settings are unchanged.'));
  });

  // ---- 未知水樣 ----
  function parseNum(s) {
    s = String(s || '').trim().replace(/[，,]/g, '.').replace(/\s*mg\/L$/i, '');
    if (!s) return NaN;
    const v = Number(s);
    return isFinite(v) ? v : NaN;
  }
  $('check').addEventListener('click', function () {
    const s = S.sample;
    const H = parseNum($('ansH').value), Hc = parseNum($('ansCa').value);
    const okH = H > 0, okC = Hc > 0;
    if (!okH && !okC) { $('mysOut').innerHTML = T('請填入總硬度或鈣硬度（mg/L）。', 'Enter a total or a calcium hardness (mg/L).'); return; }
    const d = K.answer(S, okH ? H : NaN, okC ? Hc : NaN);
    const parts = [];
    const judge = function (err, zh, en) {
      const a = Math.abs(err);
      return a <= 0.01 ? '<span class="ok">' + T(zh + '：誤差在 1% 以內 ✓', en + ': within 1% ✓') + '</span>'
        : a <= 0.02 ? '<span class="ok">' + T(zh + '：誤差在 2% 以內 ✓', en + ': within 2% ✓') + '</span>'
          : '<span class="no">' + T(zh + '：誤差超過 2%', en + ': more than 2% off') + '</span>';
    };
    if (okH) parts.push(judge(d.errH, '總硬度', 'Total hardness'));
    if (okC) parts.push(judge(d.errCa, '鈣硬度', 'Calcium hardness'));
    parts.push(T('這瓶未知水樣：總硬度滴了 ' + s.flasks.A + ' 瓶，鈣硬度滴了 ' + s.flasks.B + ' 瓶。', 'This unknown: ' + s.flasks.A + ' total-hardness flask' + (s.flasks.A === 1 ? '' : 's') + ', ' + s.flasks.B + ' calcium-hardness flask' + (s.flasks.B === 1 ? '' : 's') + '.') + (s.revealed ? T('（已揭曉，不算任務）', ' (revealed: no missions)') : ''));
    $('mysOut').innerHTML = parts.join('<br>');
    sndCheck((!okH || Math.abs(d.errH) <= 0.02) && (!okC || Math.abs(d.errCa) <= 0.02));
    emit('answer', d);
  });
  $('reveal').addEventListener('click', function () {
    const s = S.sample;
    s.revealed = true;
    renderAll();
    if (L) drawBench1();
    $('mysOut').innerHTML = T('答案：總硬度 ' + fH(s.H) + ' mg/L、鈣硬度 ' + fH(s.Hca) + ' mg/L（鎂硬度 ' + fH(s.Hmg) + ' mg/L）。圖上已標出當量點。', 'Answer: total hardness ' + fH(s.H) + ' mg/L, calcium hardness ' + fH(s.Hca) + ' mg/L (magnesium ' + fH(s.Hmg) + ' mg/L). The equivalence point is now marked on the graph.');
  });
  $('newMys').addEventListener('click', function () {
    K.newSample(S);
    if (isMys()) K.benchSet(B, 'mys', S.sample);
    $('ansH').value = ''; $('ansCa').value = '';
    waterChanged();
    $('mysOut').textContent = T('換了一瓶新的未知水樣（第 ' + S.sample.no + ' 瓶）。', 'A new unknown water (number ' + S.sample.no + ').');
  });
  ['ansH', 'ansCa'].forEach(function (id) {
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

  // ======================= 3D 微觀檢視 =======================
  let threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
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
  function host3Api() {
    return {
      T: T, host: host3, reduced: reduced,
      colors: function () { return C; },
      /** 3D 要畫的東西：Ca、Mg 的比例與被螯合的比例、指示劑結合的比例、溶液的顏色 */
      micro: function () {
        const r = S.run, e = r.eq, hid = mysteryHidden(), p = r.p;
        const nMgT = r.nMg + (p.mgEdta ? K.N_MGEDTA : 0);
        return {
          mode: p.mode, nCa: r.nCa, nMg: p.mode === 'B' ? r.nMg : nMgT, fCa: Math.min(1, e.fCa), fMg: p.mode === 'B' ? 0 : Math.min(1, e.fMg),
          mgSolid: p.mode === 'B' && r.nMg > 0 ? Math.min(1, e.MgSolid * e.V / r.nMg) : 0,
          rf: e.rf, rgb: flaskRGB(r), hid: hid
        };
      },
      hud: function () {
        const r = S.run, e = r.eq, hid = mysteryHidden(), p = r.p;
        const col = flaskRGB(r);
        const tl = 'V = ' + vRead(r.out) + ' mL' + (state.meter && e.pCa != null ? T('・', ' · ') + 'pCa = ' + e.pCa.toFixed(2) : '');
        let tr = '<i style="background:' + rgbStr(col) + '"></i>' + tn(COLOUR_NAMES[K.colourKey(e.rf)]);
        if (!hid) {
          tr += '<br>' + CA + T(' 被螯合 ', ' chelated ') + Math.round(Math.min(1, e.fCa) * 100) + '%';
          if (p.mode === 'A') tr += T('・', ' · ') + MG + ' ' + Math.round(Math.min(1, e.fMg) * 100) + '%';
        }
        tr += '<br>' + T('指示劑與金屬結合 ', 'indicator on metal ') + Math.round(e.rf * 100) + '%';
        return { tl: tl, tr: tr };
      },
      running: function () { return !!raf; },
      contextLost: function () {
        setView('2d');
        viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 裝置。', 'The 3D graphics context was lost, so the view switched back to the 2D bench.');
      }
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
      if (!webglAvailable() || !window.Hard3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        state.view = '3d';
        view3 = window.Hard3D.create(lib, host3Api());
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        view3.frame();
        kick();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      state.view = '2d';
      if (view3) { view3.dispose(); view3 = null; }
      stage.classList.remove('is3d');
      $('resetCam').hidden = true;
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resizeBench(); drawBench(); kick();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    state.view = '2d';
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 裝置。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D bench is kept.');
    resizeBench(); drawBench();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  /** 直接加到 u 個單位（縮圖、測試用）：不回報任務事件 */
  function jumpTo(u) {
    newRun(false);
    const r = S.run, p = r.p;
    const maxU = Math.floor((VT_MAX - p.Va - K.V_ADD_ML) * U);
    u = Math.max(0, Math.min(maxU, Math.round(+u || 0)));
    const keepMeas = S.meas.slice(), counted = r.counted;
    r.counted = true;
    for (let k = 0; k < u;) {
      const n = Math.min(DROP, u - k);
      K.release(S, n);
      if (r.fill >= K.BURETTE_UNITS) r.fill = 0;
      K.land(S, n);
      r.pts[r.pts.length - 1].c = flaskRGB(r);
      r.pts[r.pts.length - 1].m = state.meter;
      k += n;
    }
    r.counted = counted;
    if (u > 0) r.rows.push({ u: r.u, pCa: r.eq.pCa, rf: r.eq.rf, m: state.meter, c: flaskRGB(r) });
    S.meas = keepMeas;
    renderAll();
  }
  window.__wh = { jump: function (mL) { jumpTo(Math.round(mL * U)); }, B: B, S: S, view: setView };

  // ======================= 啟動 =======================
  readColors();
  // 預設：自來水 1 L、洗滌鹼 200 mg/L；總硬度 pH 10、水樣 50.00 mL、0.0100 M EDTA、電極在瓶中（直接設滑桿，載入時不回報任務事件）
  if (window.LabNum) {
    setSlidersTo(K.PRESETS.tap);
    quiet++;
    window.LabNum.set(doseEl, 200); window.LabNum.set(vaEl, 50); window.LabNum.set(ceEl, 0.01); window.LabNum.set(rateEl, 0.5);
    quiet--;
  }
  readBenchSliders(); readTitrSliders();
  pressGroup('#presetSeg button', 'data-preset', 'tap');
  pressGroup('#modeSeg button', 'data-mode', 'A');
  $('meter').checked = true; $('theory').checked = false; $('deriv').checked = false; $('mgedta').checked = false; $('deterg').checked = false;
  newRun(false);
  updateSoundButton();
  function themeChanged() {
    readColors();
    if (BL) buildBenchStatic();
    if (L) buildStatic();
    renderAll();
    if (view3 && view3.active) view3.onTheme();
  }
  window.addEventListener('lab:themechange', themeChanged);
  if (window.matchMedia) {
    const dm = window.matchMedia('(prefers-color-scheme: dark)');
    if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  }
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'fs') { resizeBench1(); resizeBench(); resizeGraph(); renderAll(); }
  });
  const widths = new WeakMap();
  function observe(el, fn) {
    if (window.ResizeObserver) new ResizeObserver(function () { if (el.clientWidth !== widths.get(el)) { widths.set(el, el.clientWidth); fn(); } }).observe(el);
    window.addEventListener('resize', fn);
  }
  observe(bcv, function () { resizeBench1(); drawBench1(); kick(); });
  observe(cv, function () { if (state.view === '2d') { resizeBench(); drawBench(); kick(); } });
  observe(gcv, resizeGraph);
  resizeBench1(); resizeBench(); resizeGraph();
  renderAll();
  bStatus(T('預設是一杯 1 L 的自來水。試試「加一滴」肥皂水，數一數幾滴才有持久的泡沫。', 'A litre of tap water to start. Try “Add a drop” of soap and count the drops before the lather lasts.'));
  setStatus(T('預設：自來水 50.00 mL＋pH 10 緩衝液＋EBT（酒紅色），滴定管裝 0.0100 M EDTA。先打開活栓快速加，變紫色時改成一滴一滴，直到純藍色。', 'Default: 50.00 mL of tap water + pH 10 buffer + EBT (wine red), with 0.0100 M EDTA in the burette. Open the stopcock to start, then go drop by drop when it turns purple, until it is pure blue.'));
  drawBench1(); drawBench();
  kick();
})();
