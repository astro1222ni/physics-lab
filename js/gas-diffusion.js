/*
 * gas-diffusion.js — 「氣體擴散與逸散（格雷厄姆定律）」的頁面程式（玻璃管、分子放大鏡、逸散容器、圖表、未知氣體、任務事件）
 * 化學核心在 js/gas-diffusion-core.js（GdCore）；3D 檢視在 js/gas-diffusion-3d.js（Gd3D）。
 * 管中的小點、放大鏡裡的分子、容器裡的分子都是示意：數目依濃度（或壓力）畫出，運動速率依 √(T/M) 縮放；
 * 白煙環的位置與時間、逸散的半衰時間都直接來自核心的計算。
 *
 * 任務事件（只在使用者按過「開始」之後送出）：
 *   'ring'：白煙環出現時 { base, acid, unknown, model, L（cm）, T（K）, frac（距鹼端／管長）, x（cm）, t（s）, ratio（x_鹼/x_酸）,
 *            graham（√M 比，未知酸為 null）, DA, DB, earlier（同一段紀錄中較早的白煙環，最多 40 筆） }
 *   'effuse'：兩個容器的壓力都降到一半時 { A, B, MA, MB（未知氣體為 null）, TA, TB, d（µm）, P0（Pa）, tA, tB（半衰時間 s）,
 *            ratio（t_B/t_A）, Kn（較小的克努森數）, unknown, earlier（同一段紀錄中較早的逸散，最多 40 筆） }
 *   'answer'：未知氣體按「核對答案」{ kind（'X' 逸散／'HX' 擴散）, ans, err（相對誤差）, tries, nMeas（量過幾次）, revealed }
 */
(function () {
  'use strict';
  const G = window.GdCore, LD = window.LabDraw;
  if (!G || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const reducedMotion = LD.reducedMotion();
  const FONT = LD.FONT;
  const SPEEDS = [1, 10, 100, 1000];
  const VOL = 1.0;              // 每個逸散容器 1.00 L

  // ======================= 數字格式 =======================
  function num(x, d) {
    if (x == null || !isFinite(x)) return '—';
    const s = (+x).toFixed(d == null ? 0 : d);
    return s.charAt(0) === '-' ? (/^-0(\.0*)?$/.test(s) ? s.slice(1) : '−' + s.slice(1)) : s;
  }
  function sigf(x, sig) {
    if (x == null || !isFinite(x)) return '—';
    if (x === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(x)));
    return num(x, Math.max(0, Math.min(6, (sig || 3) - 1 - e)));
  }
  function clock(s) {
    if (!isFinite(s)) return '—';
    if (s < 60) return num(s, 1) + ' s';
    const m = Math.floor(s / 60), sec = Math.floor(s - 60 * m);
    if (m < 60) return T(m + ' 分 ' + (sec < 10 ? '0' : '') + sec + ' 秒', m + ' min ' + (sec < 10 ? '0' : '') + sec + ' s');
    const h = Math.floor(m / 60), mm = m - 60 * h;
    return T(h + ' 小時 ' + (mm < 10 ? '0' : '') + mm + ' 分', h + ' h ' + (mm < 10 ? '0' : '') + mm + ' min');
  }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  // ======================= 物種 =======================
  const GAS = G.GAS;
  function isUnk(id) { return id === 'X' || id === 'HX'; }
  function fH(id) {
    const g = GAS[id];
    let h = g.f.replace(/(\d+)/g, '<sub>$1</sub>');
    if (g.iso) h += T('（U-' + g.iso + '）', ' (U-' + g.iso + ')');
    return h;
  }
  function fTxt(id) { const g = GAS[id]; return g.f + (g.iso ? ' (U-' + g.iso + ')' : ''); }
  function nm(id) { return T(GAS[id].zh, GAS[id].en); }
  function srcName(id) {
    const z = { NH3: ['濃氨水', 'conc. ammonia'], CH3NH2: ['甲胺水溶液', 'methylamine solution'], HCl: ['濃鹽酸', 'conc. hydrochloric acid'],
      HBr: ['濃氫溴酸', 'conc. hydrobromic acid'], HNO3: ['濃硝酸', 'conc. nitric acid'], HI: ['濃氫碘酸', 'conc. hydriodic acid'], HX: ['未知的酸', 'unknown acid'] }[id];
    return T(z[0], z[1]);
  }
  // 分子由原子小球組成：[元素, x, y]（以原子半徑單位計）
  const MOL = {
    NH3: [['H', 0, -1.05], ['H', -0.95, 0.62], ['H', 0.95, 0.62], ['N', 0, 0.1]],
    CH3NH2: [['H', -1.45, -0.62], ['H', -1.45, 0.62], ['H', -0.75, -1.08], ['H', 1.35, -0.72], ['H', 1.35, 0.72], ['C', -0.72, 0], ['N', 0.75, 0]],
    HCl: [['H', -1.08, 0], ['Cl', 0.32, 0]], HBr: [['H', -1.18, 0], ['Br', 0.32, 0]], HI: [['H', -1.32, 0], ['I', 0.36, 0]],
    HNO3: [['H', -1.55, -1.05], ['O', -0.62, -0.95], ['O', 1.12, 0.32], ['O', -0.42, 1.05], ['N', 0, 0]], HX: [['H', -1.25, 0], ['X', 0.34, 0]],
    N2: [['N', -0.55, 0], ['N', 0.55, 0]], O2: [['O', -0.5, 0], ['O', 0.5, 0]],
    H2: [['H', -0.42, 0], ['H', 0.42, 0]], D2: [['D', -0.42, 0], ['D', 0.42, 0]], He: [['He', 0, 0]], Ne: [['Ne', 0, 0]], Ar: [['Ar', 0, 0]], Kr: [['Kr', 0, 0]], Xe: [['Xe', 0, 0]],
    CH4: [['H', -0.75, -0.75], ['H', 0.75, -0.75], ['H', -0.75, 0.75], ['H', 0.75, 0.75], ['C', 0, 0]],
    CO: [['C', -0.55, 0], ['O', 0.55, 0]], CO2: [['O', -1.05, 0], ['O', 1.05, 0], ['C', 0, 0]], N2O: [['N', -1.05, 0], ['N', 0, 0], ['O', 1.05, 0]],
    SO2: [['O', -1.0, 0.62], ['O', 1.0, 0.62], ['S', 0, -0.1]], Cl2: [['Cl', -0.62, 0], ['Cl', 0.62, 0]],
    SF6: [['F', -1.2, 0], ['F', 1.2, 0], ['F', 0, -1.2], ['F', 0, 1.2], ['S', 0, 0]],
    UF6a: [['F', -1.35, 0], ['F', 1.35, 0], ['F', 0, -1.35], ['F', 0, 1.35], ['U', 0, 0]],
    UF6b: [['F', -1.35, 0], ['F', 1.35, 0], ['F', 0, -1.35], ['F', 0, 1.35], ['U', 0, 0]],
    X: [['X', 0, 0]]
  };
  MOL.NH3e = MOL.NH3;
  const ATOM_R = { H: 0.55, D: 0.6, N: 0.92, C: 0.98, O: 0.86, Cl: 1.12, Br: 1.24, I: 1.38, X: 1.3, S: 1.05, F: 0.7, U: 1.35, He: 0.62, Ne: 0.78, Ar: 0.98, Kr: 1.08, Xe: 1.22 };
  const GCOL0 = { NH3: '#3f6fd6', CH3NH2: '#5b4fd0', HCl: '#1f9d55', HBr: '#b5532a', HNO3: '#d9822b', HI: '#8a3fc0', HX: '#6c7a89' };
  let col = {};
  function readColors() {
    const c = LD.c, dk = LD.dark;
    const lift = function (h, u) { return dk ? LD.mix(h, '#ffffff', u == null ? 0.25 : u) : h; };
    const g = {};
    Object.keys(GCOL0).forEach(function (k) { g[k] = lift(GCOL0[k]); });
    col = {
      text: c.text, muted: c.muted, border: c.border, grid: c.grid, accent: c.accent, bg: c['canvas-bg'], surface: c.surface,
      pos: c.pos || '#d1453b', neg: c.neg || '#2f6fd0', probe: c.probe || '#0d7f57', dark: dk, gas: g,
      A: lift('#d07a12'), B: lift('#7b4fd6'), air: dk ? '#8d98a5' : '#9aa5b1',
      el: {
        N: '#3f6fd6', H: dk ? '#e8ecf0' : '#e3e8ee', D: dk ? '#cfe3f5' : '#c4d6ea', C: dk ? '#6b737d' : '#4a5058', O: '#e0483a', Cl: '#2fae5a', Br: '#a3401f',
        I: '#8a3fc0', X: '#7d8996', S: '#d9b52b', F: '#86c95a', U: '#2f8f6f', He: '#62c4d8', Ne: '#ef8a57', Ar: '#8d98a5', Kr: '#4ea4b4', Xe: '#5b7fb8'
      },
      glass: dk ? 'rgba(170,205,235,' : 'rgba(120,160,200,',
      salt: dk ? '#f4f6f8' : '#ffffff'
    };
  }
  function gasColor(id) { return col.gas[id] || col.muted; }
  function tempTint(Tk) {
    if (Tk <= 298) return LD.mix('#3f7fd6', col.muted, clamp((Tk - 240) / 58, 0, 1));
    return LD.mix(col.muted, '#d8452f', clamp((Tk - 298) / 302, 0, 1));
  }

  // ======================= 狀態 =======================
  const state = {
    mode: 'diff', base: 'NH3', acid: 'HCl', model: 'graham', T: 298, L: 100,
    gA: 'H2', gB: 'O2', TA: 298, TB: 298, d: 100, P0: 1,
    speed: 2, tab: 'prof', view: '2d', lensU: 0.5
  };
  let running = false, started = false;   // 計時是否在跑、這一次是否已按過「開始」
  let dr = null;                          // 擴散：{ o, rg, t, ringSeen, tEnd, done }
  let er = null;                          // 逸散：{ A, B, MA, MB, TA, TB, d, P0, tauA, tauB, hA, hB, t, gotA, gotB, emitted, tEnd }
  let records = [], recSeq = 0, segId = 0;
  let unk = null;                         // { kind, tries, nMeas, revealed }
  let userActed = false;
  let view3 = null;
  let ringFlash = -1e9, halfFlashA = -1e9, halfFlashB = -1e9;

  function diffOpts() { return { base: state.base, acid: state.acid, model: state.model, L: state.L, T: state.T }; }
  function newDiff() {
    const o = diffOpts();
    const rg = G.ring(o);
    dr = { o: o, rg: rg, t: 0, ringSeen: false, tEnd: rg.t * 1.6, done: false };
    makeSeeds();
  }
  function newEff() {
    const MA = G.M(state.gA), MB = G.M(state.gB);
    const tauA = G.effTau(MA, state.TA, state.d, VOL), tauB = G.effTau(MB, state.TB, state.d, VOL);
    er = { A: state.gA, B: state.gB, MA: MA, MB: MB, TA: state.TA, TB: state.TB, d: state.d, P0: state.P0, tauA: tauA, tauB: tauB,
      hA: tauA * Math.LN2, hB: tauB * Math.LN2, t: 0, gotA: false, gotB: false, emitted: false };
    er.tEnd = 4 * Math.max(er.hA, er.hB);
    fillChambers();
  }
  function resetRun() {
    running = false; started = false;
    if (state.mode === 'diff') newDiff(); else newEff();
    ringFlash = halfFlashA = halfFlashB = -1e9;
    updateRunButton();
  }
  function curT() { return state.mode === 'diff' ? (dr ? dr.t : 0) : (er ? er.t : 0); }

  // ======================= 管中的小點（濃度示意） =======================
  // 每個小點有固定的亂數；位置 x = 2√(Dt)·U·√(−ln V) 正好服從 erfc 分布（size-biased 半常態分布再乘均勻亂數）
  const NDOT = 220;
  let seeds = [[], []];
  function makeSeeds() {
    seeds = [0, 1].map(function () {
      const a = [];
      for (let i = 0; i < NDOT; i++) {
        const U = Math.random(), V = Math.random();
        a.push({ w: U * Math.sqrt(-Math.log(1 - 0.999 * V)), y: Math.random() * 2 - 1, z: Math.random() * 2 - 1, ph: Math.random() * 6.283, f: 0.6 + Math.random() * 0.9 });
      }
      return a;
    });
  }
  /** 目前看得見的小點（cm 與 −1…1 的徑向座標）：side 0 = 鹼、1 = 酸 */
  function dots(side) {
    const out = [];
    if (!dr || dr.t <= 0) return out;
    const L = dr.o.L, D = side ? dr.rg.DB : dr.rg.DA, s = 2 * Math.sqrt(D * dr.t);
    const nvis = Math.round(NDOT * Math.min(1, Math.sqrt(dr.t / dr.tEnd)));
    const cut = dr.ringSeen ? (side ? L - dr.rg.x : dr.rg.x) - 0.004 * L : L;
    const arr = seeds[side];
    for (let i = 0; i < nvis; i++) {
      const d = s * arr[i].w;
      if (d >= cut) continue;
      out.push({ x: side ? L - d : d, y: arr[i].y, z: arr[i].z, ph: arr[i].ph, f: arr[i].f, a: Math.min(1, (cut - d) / (0.03 * L)) });
    }
    return out;
  }
  function concAt(xcm) {
    if (!dr || dr.t <= 0) return [0, 0];
    return [G.conc(xcm, dr.t, dr.rg.DA, true, dr.o.L), G.conc(xcm, dr.t, dr.rg.DB, false, dr.o.L)];
  }
  function depAt(xcm) { return dr && dr.ringSeen ? G.deposit(xcm, dr.t, dr.rg, dr.o.L) : 0; }

  // ======================= 放大鏡裡的分子（2D 碰撞，示意） =======================
  let mols = [];         // { sp, x, y, vx, vy, r, m, a, ang, va, born, dying }
  let crystals = [];     // { x, y, s, born, persist, dying, ang }
  const flashes = [];    // { x, y, t0 }
  let lastComp = 0;
  const SPEED_PX = 0.095;   // 畫面速率（px/s）÷ 真實速率（m/s）
  function molR(sp, r0) { return sp === 'N2' || sp === 'O2' ? 1.15 * r0 : ({ NH3: 1.3, CH3NH2: 1.75, HCl: 1.35, HBr: 1.45, HNO3: 1.7, HI: 1.6, HX: 1.55 }[sp] || 1.3) * r0; }
  function lensMass(sp) { return sp === 'N2' ? 28.014 : sp === 'O2' ? 31.998 : G.M(sp) || 60; }
  function gauss() { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function thermalV(Mg, Tk) { const s = Math.sqrt(G.R * Tk / (Mg / 1000)) * SPEED_PX; return [gauss() * s, gauss() * s]; }
  function addMol(sp, R, now, x, y) {
    const r0 = R / 24, r = molR(sp, r0);
    let px = x, py = y, tries = 0;
    if (px == null) {
      do {
        const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * (R - r - 2);
        px = Math.cos(a) * d; py = Math.sin(a) * d; tries++;
      } while (tries < 20 && mols.some(function (m) { return Math.hypot(m.x - px, m.y - py) < m.r + r + 1; }));
    }
    const Mg = lensMass(sp), v = thermalV(Mg, state.T);
    mols.push({ sp: sp, x: px, y: py, vx: v[0], vy: v[1], r: r, m: Mg, ang: Math.random() * 6.283, va: (Math.random() - 0.5) * 3, born: now, dying: 0 });
  }
  function lensTargets() {
    const x = state.lensU * (dr ? dr.o.L : state.L);
    const c = concAt(x), dep = depAt(x);
    const nA = Math.round(11 * Math.sqrt(c[0])), nB = Math.round(11 * Math.sqrt(c[1]));
    return { A: nA, B: nB, air: Math.max(8, 26 - nA - nB), salt: Math.round(12 * dep) };
  }
  function syncLens(now, R) {
    const tg = lensTargets();
    const want = { base: tg.A, acid: tg.B, air: tg.air };
    const kindOf = function (m) { return m.sp === state.base || (dr && m.sp === dr.o.base) ? 'base' : m.sp === 'N2' || m.sp === 'O2' ? 'air' : 'acid'; };
    // 換了氣體：舊的分子淡出
    mols.forEach(function (m) {
      if (m.dying) return;
      if (m.sp !== 'N2' && m.sp !== 'O2' && m.sp !== state.base && m.sp !== state.acid) m.dying = now;
    });
    ['base', 'acid', 'air'].forEach(function (k) {
      const live = mols.filter(function (m) { return !m.dying && kindOf(m) === k; });
      let d = want[k] - live.length;
      while (d > 0) { addMol(k === 'base' ? state.base : k === 'acid' ? state.acid : (Math.random() < 0.78 ? 'N2' : 'O2'), R, now); d--; }
      for (let i = 0; d < 0 && i < live.length; i++, d++) live[i].dying = now;
    });
    const per = crystals.filter(function (c) { return c.persist && !c.dying; });
    let ds = tg.salt - per.length;
    while (ds > 0) { addCrystal(R, now, null, null, true); ds--; }
    for (let i = 0; ds < 0 && i < per.length; i++, ds++) per[i].dying = now;
  }
  function addCrystal(R, now, x, y, persist) {
    if (x == null) { const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * (R - 10); x = Math.cos(a) * d; y = Math.sin(a) * d; }
    crystals.push({ x: x, y: y, s: R / 24 * (1.0 + Math.random() * 0.6), born: now, persist: persist, dying: 0, ang: Math.random() * 1.5, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4 });
  }
  function stepLens(dtw, now, R) {
    if (now - lastComp > 200) { lastComp = now; syncLens(now, R); }
    mols = mols.filter(function (m) { return !m.dying || now - m.dying < 400; });
    crystals = crystals.filter(function (c) { return !c.dying || now - c.dying < 600; });
    const nonPersist = crystals.filter(function (c) { return !c.persist && !c.dying; });
    nonPersist.forEach(function (c) { if (now - c.born > 9000) c.dying = now; });
    if (nonPersist.length > 12) nonPersist[0].dying = now;
    if (dtw <= 0) return;
    mols.forEach(function (m) {
      m.x += m.vx * dtw; m.y += m.vy * dtw; m.ang += m.va * dtw;
      const d = Math.hypot(m.x, m.y), lim = R - m.r - 1;
      if (d > lim) {
        const nx = m.x / d, ny = m.y / d, dot = m.vx * nx + m.vy * ny;
        if (dot > 0) { m.vx -= 2 * dot * nx; m.vy -= 2 * dot * ny; }
        m.x = nx * lim; m.y = ny * lim;
      }
    });
    for (let i = 0; i < mols.length; i++) {
      const a = mols[i];
      if (a.dying) continue;
      for (let j = i + 1; j < mols.length; j++) {
        const b = mols[j];
        if (b.dying) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), rr = a.r + b.r;
        if (d >= rr || d < 1e-6) continue;
        const nx = dx / d, ny = dy / d;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        // 酸鹼一碰就反應：兩個分子變成一小顆鹽的晶體
        const ab = (a.sp === state.base && b.sp === state.acid) || (b.sp === state.base && a.sp === state.acid);
        if (ab && started) {
          a.dying = b.dying = now;
          addCrystal(R, now, (a.x + b.x) / 2, (a.y + b.y) / 2, false);
          if (!reducedMotion) flashes.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, t0: now });
          if (flashes.length > 20) flashes.shift();
          if (now - lastPop > 150) { lastPop = now; snd('pop'); }
          continue;
        }
        const ov = (rr - d) / 2;
        a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
        if (rv < 0) {
          const jimp = -2 * rv / (1 / a.m + 1 / b.m);
          a.vx -= jimp * nx / a.m; a.vy -= jimp * ny / a.m;
          b.vx += jimp * nx / b.m; b.vy += jimp * ny / b.m;
        }
      }
    }
    crystals.forEach(function (c) {
      c.vx += (Math.random() - 0.5) * 30 * dtw; c.vy += (Math.random() - 0.5) * 30 * dtw;
      c.vx *= 0.96; c.vy *= 0.96;
      c.x += c.vx * dtw; c.y += c.vy * dtw;
      const d = Math.hypot(c.x, c.y), lim = R - c.s * 1.6;
      if (d > lim) { c.x *= lim / d; c.y *= lim / d; c.vx = -c.vx; c.vy = -c.vy; }
    });
  }
  let lastPop = 0;
  /** 溫度改變：每個分子速度乘上 √(T新/T舊) */
  function rescaleLens(T0, T1) {
    const f = Math.sqrt(T1 / T0);
    mols.forEach(function (m) { m.vx *= f; m.vy *= f; });
  }

  // ======================= 逸散容器裡的分子 =======================
  const NCH = 36;
  let cham = [[], []];        // 每個容器的分子 { x, y（容器內 0–1）, vx, vy（容器寬度/秒）, out（逸出中）, t0 }
  let escaping = [[], []];
  function fillChambers() {
    cham = [0, 1].map(function (k) {
      const a = [];
      for (let i = 0; i < NCH; i++) a.push(newChMol(k));
      return a;
    });
    escaping = [[], []];
  }
  function chSpeed(k) {
    const Mg = er ? (k ? er.MB : er.MA) : 30, Tk = er ? (k ? er.TB : er.TA) : 298;
    return Math.sqrt(G.R * Tk / (Mg / 1000)) * 0.00042;   // 容器寬度／秒（示意）
  }
  function newChMol(k) {
    const s = chSpeed(k);
    return { x: 0.06 + Math.random() * 0.88, y: 0.06 + Math.random() * 0.88, vx: gauss() * s, vy: gauss() * s, ang: Math.random() * 6.283, va: (Math.random() - 0.5) * 3 };
  }
  function rescaleChamber(k, T0, T1) { const f = Math.sqrt(T1 / T0); cham[k].forEach(function (m) { m.vx *= f; m.vy *= f; }); }
  function stepChambers(dtw, now) {
    if (!er) return;
    [0, 1].forEach(function (k) {
      const P = G.effP(1, er.t, k ? er.tauB : er.tauA);
      const want = Math.round(NCH * P);
      let excess = cham[k].length - want;
      const arr = cham[k], hw = 0.05 + Math.min(0.45, 0.06 * Math.max(0, excess - 1));
      for (let i = arr.length - 1; i >= 0; i--) {
        const m = arr[i];
        m.x += m.vx * dtw; m.y += m.vy * dtw; m.ang += m.va * dtw;
        if (m.x < 0.04) { m.x = 0.04; m.vx = Math.abs(m.vx); }
        if (m.x > 0.96) { m.x = 0.96; m.vx = -Math.abs(m.vx); }
        if (m.y < 0.04) { m.y = 0.04; m.vy = Math.abs(m.vy); }
        if (m.y > 0.96) {
          // 底部中央有小孔：需要減少分子時，撞到孔附近的分子就逸出
          if (excess > 0 && Math.abs(m.x - 0.5) < hw && m.vy > 0) {
            arr.splice(i, 1); excess--;
            escaping[k].push({ x: 0.5 + (m.x - 0.5) * 0.15, y: 0.96, vx: m.vx * 0.3, vy: Math.abs(m.vy) + 0.1, t0: now, ang: m.ang });
            continue;
          }
          m.y = 0.96; m.vy = -Math.abs(m.vy);
        }
      }
      // 起始量增加或重來時補分子
      while (cham[k].length < want) cham[k].push(newChMol(k));
      escaping[k] = escaping[k].filter(function (e) { return now - e.t0 < 900; });
      escaping[k].forEach(function (e) { e.x += e.vx * dtw; e.y += e.vy * dtw; });
    });
  }

  // ======================= 畫布 =======================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let W = 600, H = 460, dpr = 1, Lay = null;
  function resize() {
    const w = cv.clientWidth || 600;
    W = w; H = w < 560 ? 450 : 470;
    cv.style.height = H + 'px';
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    layout();
    draw();
  }
  function layout() {
    const narrow = W < 560;
    const mx = 12, sw = narrow ? 14 : 20;
    const gx0 = mx + sw, gx1 = W - mx - sw;
    const plug = narrow ? 22 : 34;
    const yt = narrow ? 78 : 86, rt = narrow ? 15 : 18;
    const X0 = gx0 + plug, X1 = gx1 - plug;
    const top = yt + rt + 62;
    const R = Math.max(70, Math.min(narrow ? 132 : 128, (H - top - (narrow ? 58 : 40)) / 2, narrow ? W * 0.42 : W * 0.25));
    const wx = narrow ? W / 2 : Math.max(R + 18, W * 0.32), wy = top + R + 2;
    Lay = { narrow: narrow, mx: mx, sw: sw, gx0: gx0, gx1: gx1, yt: yt, rt: rt, X0: X0, X1: X1, R: R, wx: wx, wy: wy, info: narrow ? null : { x: wx + R + 26, y: top + 4 } };
  }
  function xpx(xcm) { return Lay.X0 + (Lay.X1 - Lay.X0) * xcm / (dr ? dr.o.L : state.L); }

  // ---- 化學式（數字下標） ----
  function fParts(f) {
    const out = [];
    f.replace(/([A-Za-z()]+)(\d*)/g, function (m, a, d) { out.push([a, 0]); if (d) out.push([d, 1]); return m; });
    return out;
  }
  function drawF(c, f, x, y, color, px, weight, align) {
    const fn = (weight || '600') + ' ' + px + 'px ' + FONT, fs = (weight || '600') + ' ' + (px * 0.7).toFixed(1) + 'px ' + FONT;
    const parts = fParts(f);
    let w = 0;
    parts.forEach(function (p) { c.font = p[1] ? fs : fn; w += c.measureText(p[0]).width; });
    let x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    parts.forEach(function (p) {
      LD.haloText(c, p[0], x0, y + (p[1] ? px * 0.28 : 0), color, 'left', 'alphabetic', p[1] ? fs : fn);
      c.font = p[1] ? fs : fn; x0 += c.measureText(p[0]).width;
    });
    return w;
  }
  function fWidth(c, f, px, weight) {
    const fn = (weight || '600') + ' ' + px + 'px ' + FONT, fs = (weight || '600') + ' ' + (px * 0.7).toFixed(1) + 'px ' + FONT;
    let w = 0;
    fParts(f).forEach(function (p) { c.font = p[1] ? fs : fn; w += c.measureText(p[0]).width; });
    return w;
  }
  // air = true：空氣分子（N2、O2）畫成淡灰色，和反應物的顏色分開
  function drawMol(c, sp, x, y, ang, r0, alpha, air) {
    const atoms = MOL[sp] || MOL.X;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    c.globalAlpha = alpha;
    for (let i = 0; i < atoms.length; i++) {
      const at = atoms[i], ox = (at[1] * ca - at[2] * sa) * r0, oy = (at[1] * sa + at[2] * ca) * r0;
      let cc = col.el[at[0]] || col.muted;
      if (air) cc = LD.mix(cc, col.air, 0.72);
      const light = at[0] === 'H' || at[0] === 'D';
      LD.ball(c, x + ox, y + oy, Math.max(1.2, ATOM_R[at[0]] * r0), cc, { shadow: false, glow: 0, ring: light && !col.dark ? 'rgba(80,92,108,0.55)' : undefined });
    }
    c.globalAlpha = 1;
  }
  function drawCrystal(c, x, y, s, ang, alpha) {
    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y); c.rotate(ang);
    const g = c.createLinearGradient(-s, -s, s, s);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, col.dark ? '#c9d2dc' : '#dfe5ec');
    LD.roundRect(c, -s, -s, 2 * s, 2 * s, s * 0.25);
    c.fillStyle = g; c.fill();
    c.strokeStyle = col.dark ? 'rgba(255,255,255,0.6)' : 'rgba(90,100,115,0.55)'; c.lineWidth = 0.8; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.9)'; c.fillRect(-s * 0.6, -s * 0.6, s * 0.5, s * 0.22);
    c.restore();
  }

  // ---- 玻璃管 ----
  function drawTube(now) {
    const L = Lay, c = ctx, yt = L.yt, rt = L.rt;
    const Lcm = dr ? dr.o.L : state.L;
    // 刻度尺（管上方）
    const ry = yt - rt - 16;
    c.save();
    c.strokeStyle = LD.alpha(col.text, 0.45); c.lineWidth = 1;
    c.beginPath(); c.moveTo(L.X0, ry + 0.5); c.lineTo(L.X1, ry + 0.5); c.stroke();
    const step = Lcm > 100 ? 10 : 5, lab = Lcm > 80 ? 20 : 10;
    c.font = '11px ' + FONT; c.fillStyle = col.muted; c.textAlign = 'center'; c.textBaseline = 'bottom';
    for (let x = 0; x <= Lcm + 1e-6; x += step) {
      const px = Math.round(xpx(x)) + 0.5, big = Math.abs(x % lab) < 1e-6 || Math.abs(x - Lcm) < 1e-6;
      c.beginPath(); c.moveTo(px, ry); c.lineTo(px, ry - (big ? 6 : 3)); c.stroke();
      if (big && (Lcm - x > lab * 0.45 || Math.abs(x - Lcm) < 1e-6) && !(L.narrow && x % (lab * 2) && Math.abs(x - Lcm) > 1e-6)) c.fillText(num(x, 0), px, ry - 7);
    }
    c.textAlign = 'left';
    c.fillText('cm', L.X1 + 15, ry - 1);
    c.restore();

    // 管內氣體（顏色只是標示：真實的兩種氣體都無色）
    const slices = L.narrow ? 70 : 110, sx = (L.X1 - L.X0) / slices;
    c.save();
    c.beginPath(); c.rect(L.X0, yt - rt, L.X1 - L.X0, 2 * rt); c.clip();
    // 管內稍微暗一點，白色的煙才看得清楚
    if (!col.dark) { c.fillStyle = 'rgba(60,80,100,0.07)'; c.fillRect(L.X0, yt - rt, L.X1 - L.X0, 2 * rt); }
    if (dr && dr.t > 0) {
      for (let i = 0; i < slices; i++) {
        const xc = (i + 0.5) / slices * Lcm, cc = concAt(xc);
        if (cc[0] > 0.004) { c.fillStyle = LD.alpha(gasColor(dr.o.base), 0.26 * cc[0]); c.fillRect(L.X0 + i * sx, yt - rt, sx + 0.6, 2 * rt); }
        if (cc[1] > 0.004) { c.fillStyle = LD.alpha(gasColor(dr.o.acid), 0.26 * cc[1]); c.fillRect(L.X0 + i * sx, yt - rt, sx + 0.6, 2 * rt); }
      }
      // 小點：分子雲
      [0, 1].forEach(function (side) {
        const ds = dots(side), colr = gasColor(side ? dr.o.acid : dr.o.base);
        for (let i = 0; i < ds.length; i++) {
          const d = ds[i];
          const jx = reducedMotion ? 0 : 1.3 * Math.sin(d.ph + now * 0.0047 * d.f), jy = reducedMotion ? 0 : 1.0 * Math.sin(d.ph * 1.7 + now * 0.0061 * d.f);
          c.globalAlpha = 0.85 * d.a;
          LD.ball(c, xpx(d.x) + jx, yt + d.y * (rt - 3.5) + jy, 2.1, colr, { shadow: false, glow: 0 });
        }
      });
      c.globalAlpha = 1;
      // 白煙環
      if (dr.ringSeen) drawSmoke(now);
    }
    c.restore();

    // 玻璃管本體（高光、陰影）
    c.save();
    const gl = c.createLinearGradient(0, yt - rt - 3, 0, yt + rt + 3);
    gl.addColorStop(0, col.glass + (col.dark ? '0.30)' : '0.35)'));
    gl.addColorStop(0.18, col.glass + '0.06)');
    gl.addColorStop(0.5, col.glass + '0.02)');
    gl.addColorStop(0.82, col.glass + '0.08)');
    gl.addColorStop(1, col.glass + (col.dark ? '0.34)' : '0.4)'));
    LD.roundRect(c, L.gx0 - 2, yt - rt - 3, L.gx1 - L.gx0 + 4, 2 * rt + 6, rt * 0.4);
    c.fillStyle = gl; c.fill();
    c.strokeStyle = col.glass + (col.dark ? '0.65)' : '0.75)'); c.lineWidth = 1.4; c.stroke();
    // 上緣高光
    c.strokeStyle = 'rgba(255,255,255,' + (col.dark ? 0.35 : 0.85) + ')'; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(L.gx0 + 10, yt - rt + 2.5); c.lineTo(L.gx1 - 10, yt - rt + 2.5); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,' + (col.dark ? 0.12 : 0.4) + ')'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(L.gx0 + 14, yt + rt - 3); c.lineTo(L.gx1 - 14, yt + rt - 3); c.stroke();
    c.restore();
    // 接觸陰影（架在桌面上）
    LD.contactShadow(c, (L.gx0 + L.gx1) / 2, yt + rt + 10, (L.gx1 - L.gx0) * 0.45, 0.35);

    // 棉花與橡皮塞
    const wet = dr && (started || dr.t > 0);
    drawPlug(L.gx0, L.X0, yt, rt, true, wet ? gasColor(dr.o.base) : null, now);
    drawPlug(L.X1, L.gx1, yt, rt, false, wet ? gasColor(dr.o.acid) : null, now);
    LD.block(c, L.mx, yt - rt - 6, L.sw + 4, 2 * rt + 12, col.dark ? '#6b4a44' : '#8c5a4f', { r: 4 });
    LD.block(c, W - L.mx - L.sw - 4, yt - rt - 6, L.sw + 4, 2 * rt + 12, col.dark ? '#6b4a44' : '#8c5a4f', { r: 4 });

    // 兩端標示
    const ly = yt + rt + 26;
    const bF = dr ? dr.o.base : state.base, aF = dr ? dr.o.acid : state.acid;
    drawF(c, GAS[bF].f, L.gx0, ly, gasColor(bF), 14, '700', 'left');
    if (!L.narrow) LD.haloText(c, srcName(bF), L.gx0, ly + 16, col.muted, 'left', 'alphabetic', '12px ' + FONT);
    drawF(c, GAS[aF].f, L.gx1, ly, gasColor(aF), 14, '700', 'right');
    if (!L.narrow) LD.haloText(c, srcName(aF), L.gx1, ly + 16, col.muted, 'right', 'alphabetic', '12px ' + FONT);

    // 白煙環的距離標示
    if (dr && dr.ringSeen) {
      const xr = xpx(dr.rg.x), dy = yt + rt + 44, rc = col.text;
      c.save();
      c.strokeStyle = LD.alpha(rc, 0.55); c.lineWidth = 1; c.setLineDash([2, 3]);
      c.beginPath(); c.moveTo(xr + 0.5, yt + rt + 4); c.lineTo(xr + 0.5, dy + 6); c.stroke();
      c.setLineDash([]);
      c.restore();
      LD.arrow(c, xr - 2, dy, L.X0 + 2, dy, gasColor(dr.o.base), 1.6);
      LD.arrow(c, xr + 2, dy, L.X1 - 2, dy, gasColor(dr.o.acid), 1.6);
      const lb = num(dr.rg.x, 1) + ' cm', la = num(dr.o.L - dr.rg.x, 1) + ' cm';
      LD.pill(c, lb, (L.X0 + xr) / 2, dy - 4, gasColor(dr.o.base), 'center', '600 12px ' + FONT);
      LD.pill(c, la, (xr + L.X1) / 2, dy - 4, gasColor(dr.o.acid), 'center', '600 12px ' + FONT);
      // 格雷厄姆的預測（√M 比）
      if (!isUnk(dr.o.acid) && dr.o.model === 'air') {
        const xg = xpx(G.grahamFrac(dr.o.base, dr.o.acid) * dr.o.L);
        c.save();
        c.strokeStyle = LD.alpha(col.accent, 0.9); c.lineWidth = 1.5; c.setLineDash([4, 3]);
        c.beginPath(); c.moveTo(xg + 0.5, yt - rt - 2); c.lineTo(xg + 0.5, yt + rt + 2); c.stroke();
        c.restore();
        LD.pill(c, T('√M 預測', '√M prediction'), xg, yt - rt - 26 + (L.narrow ? 0 : 0), col.accent, xg > xr ? 'left' : 'right', '600 11px ' + FONT);
      }
      const u = (now - ringFlash) / 700;
      if (u >= 0 && u <= 1 && !reducedMotion) LD.ripple(c, xr, yt, rt, u, col.accent);
    }
  }
  function drawPlug(x0, x1, yt, rt, left, wetCol, now) {
    const c = ctx;
    c.save();
    c.beginPath(); c.rect(x0, yt - rt + 1, x1 - x0, 2 * rt - 2); c.clip();
    const n = 9;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 3; j++) {
        const fx = x0 + (i + 0.5) / n * (x1 - x0) + Math.sin(i * 7.1 + j) * 2, fy = yt + (j - 1) * rt * 0.62 + Math.cos(i * 3.3 + j * 2) * 2;
        const r = rt * (0.45 + 0.12 * Math.sin(i * 1.7 + j * 2.3));
        const g = c.createRadialGradient(fx - r * 0.3, fy - r * 0.35, r * 0.1, fx, fy, r);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(1, wetCol ? LD.mix('#e9edf1', wetCol, 0.22) : (col.dark ? '#cfd6dd' : '#e4e8ec'));
        c.fillStyle = g; c.beginPath(); c.arc(fx, fy, r, 0, Math.PI * 2); c.fill();
      }
    }
    c.restore();
    // 棉花的纖維邊緣
    c.save();
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 0.8;
    const ex = left ? x1 : x0;
    for (let k = 0; k < 7; k++) {
      const y = yt - rt + 3 + k * (2 * rt - 6) / 6;
      c.beginPath(); c.moveTo(ex, y); c.quadraticCurveTo(ex + (left ? 4 : -4), y + 2, ex + (left ? 2 : -2), y + 5); c.stroke();
    }
    c.restore();
  }
  // 白煙：多團柔和的白色雲團＋管壁上的白色沉積
  const PUFFS = [];
  for (let i = 0; i < 46; i++) PUFFS.push({ u: (Math.random() + Math.random() + Math.random() - 1.5) / 1.5, y: Math.random() * 2 - 1, r: 0.35 + Math.random() * 0.5, ph: Math.random() * 6.28 });
  function drawSmoke(now) {
    const c = ctx, L = Lay, Lcm = dr.o.L;
    const amp = G.deposit(dr.rg.x, dr.t, dr.rg, Lcm);
    if (amp <= 0) return;
    const w = 0.012 * Lcm + 0.02 * Lcm * Math.sqrt(Math.max(0, dr.t - dr.rg.t) / dr.rg.t);
    const xr = xpx(dr.rg.x), wpx = (L.X1 - L.X0) * w / Lcm;
    // 淺色背景上白煙不明顯：先鋪一層淡灰的陰影，白煙才看得出立體
    if (!col.dark) {
      const sg = c.createRadialGradient(xr, L.yt + 2, 0, xr, L.yt + 2, Math.max(wpx * 1.8, L.rt * 1.4));
      sg.addColorStop(0, 'rgba(70,85,100,' + (0.28 * amp).toFixed(3) + ')');
      sg.addColorStop(1, 'rgba(70,85,100,0)');
      c.fillStyle = sg;
      c.fillRect(xr - wpx * 2 - L.rt * 1.5, L.yt - L.rt, 2 * (wpx * 2 + L.rt * 1.5), 2 * L.rt);
    }
    for (let i = 0; i < PUFFS.length; i++) {
      const p = PUFFS[i];
      const x = xr + p.u * wpx * 1.6 + (reducedMotion ? 0 : Math.sin(now * 0.0007 + p.ph) * 1.2);
      const y = L.yt + p.y * (L.rt - 4) + (reducedMotion ? 0 : Math.cos(now * 0.0009 + p.ph) * 1);
      const loc = Math.exp(-p.u * p.u * 1.1);
      const r = L.rt * p.r * (0.7 + 0.5 * amp);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,' + ((col.dark ? 0.55 : 0.85) * amp * loc).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
    // 管壁沉積
    c.strokeStyle = 'rgba(255,255,255,' + (0.85 * amp).toFixed(3) + ')';
    c.lineWidth = 2.2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(xr - wpx, L.yt - L.rt + 1.5); c.lineTo(xr + wpx, L.yt - L.rt + 1.5); c.stroke();
    c.beginPath(); c.moveTo(xr - wpx, L.yt + L.rt - 1.5); c.lineTo(xr + wpx, L.yt + L.rt - 1.5); c.stroke();
    if (!col.dark) {
      c.strokeStyle = 'rgba(120,130,140,' + (0.35 * amp).toFixed(3) + ')'; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(xr - wpx, L.yt - L.rt + 3); c.lineTo(xr + wpx, L.yt - L.rt + 3); c.stroke();
    }
  }

  // ---- 放大鏡 ----
  function drawLens(now) {
    const c = ctx, L = Lay, R = L.R;
    const lx = L.X0 + state.lensU * (L.X1 - L.X0), ly = L.yt;
    // 視錐
    c.save();
    c.fillStyle = LD.alpha(col.accent, col.dark ? 0.07 : 0.06);
    c.beginPath(); c.moveTo(lx - L.rt - 4, ly); c.lineTo(L.wx - R * 0.98, L.wy - R * 0.2); c.lineTo(L.wx + R * 0.98, L.wy - R * 0.2); c.lineTo(lx + L.rt + 4, ly); c.closePath(); c.fill();
    c.strokeStyle = LD.alpha(col.accent, 0.35); c.lineWidth = 1; c.setLineDash([3, 4]);
    c.beginPath(); c.moveTo(lx - L.rt - 4, ly + 4); c.lineTo(L.wx - R * 0.98, L.wy - R * 0.2); c.moveTo(lx + L.rt + 4, ly + 4); c.lineTo(L.wx + R * 0.98, L.wy - R * 0.2); c.stroke();
    c.restore();
    // 管上的取樣圈
    c.save();
    c.strokeStyle = col.accent; c.lineWidth = 2.2;
    c.beginPath(); c.arc(lx, ly, L.rt + 5, 0, Math.PI * 2); c.stroke();
    c.fillStyle = LD.alpha(col.accent, 0.08); c.fill();
    if (kb && kb.focused()) { c.setLineDash([3, 3]); c.lineWidth = 1.5; c.beginPath(); c.arc(lx, ly, L.rt + 10, 0, Math.PI * 2); c.stroke(); }
    c.restore();
    // 視窗：背景＋分子
    c.save();
    c.beginPath(); c.arc(L.wx, L.wy, R, 0, Math.PI * 2);
    const bg = c.createRadialGradient(L.wx - R * 0.3, L.wy - R * 0.35, R * 0.1, L.wx, L.wy, R);
    bg.addColorStop(0, col.dark ? '#26303b' : '#ffffff');
    bg.addColorStop(1, col.dark ? '#151b22' : '#eef2f6');
    c.fillStyle = bg; c.fill();
    c.clip();
    const r0 = R / 24;
    crystals.forEach(function (k) {
      const a = Math.min(1, (now - k.born) / 300) * (k.dying ? Math.max(0, 1 - (now - k.dying) / 600) : 1);
      drawCrystal(c, L.wx + k.x, L.wy + k.y, k.s, k.ang, a);
    });
    mols.forEach(function (m) {
      const a = Math.min(1, (now - m.born) / 300) * (m.dying ? Math.max(0, 1 - (now - m.dying) / 400) : 1);
      drawMol(c, m.sp, L.wx + m.x, L.wy + m.y, m.ang, r0, a, m.sp === 'N2' || m.sp === 'O2');
    });
    flashes.forEach(function (f) {
      const u = (now - f.t0) / 450;
      if (u >= 0 && u <= 1) LD.ripple(c, L.wx + f.x, L.wy + f.y, r0 * 2, u, col.accent);
    });
    c.restore();
    // 鏡框（金屬環＋玻璃反光）
    c.save();
    c.lineWidth = 7;
    const rim = c.createLinearGradient(L.wx - R, L.wy - R, L.wx + R, L.wy + R);
    rim.addColorStop(0, col.dark ? '#9aa6b3' : '#c9d1da'); rim.addColorStop(0.5, col.dark ? '#5b6672' : '#8d98a5'); rim.addColorStop(1, col.dark ? '#c0c9d2' : '#e4e9ee');
    c.strokeStyle = rim; c.beginPath(); c.arc(L.wx, L.wy, R + 3, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 1; c.strokeStyle = LD.alpha(col.text, 0.35); c.beginPath(); c.arc(L.wx, L.wy, R + 6.5, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,' + (col.dark ? 0.18 : 0.6) + ')'; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.arc(L.wx, L.wy, R - 8, Math.PI * 1.08, Math.PI * 1.38); c.stroke();
    c.restore();
    // 位置標示
    const xcm = state.lensU * (dr ? dr.o.L : state.L);
    LD.pill(c, T('放大鏡：x = ', 'Magnifier: x = ') + num(xcm, 1) + ' cm', L.wx, L.wy + R + 26, col.accent, 'center', '600 12px ' + FONT);
    if (L.info) drawLensInfo(xcm);
    else {
      LD.haloText(c, T('示意：分子放大、速率放慢', 'Not to scale: enlarged and slowed down'), L.wx, L.wy + R + 44, col.muted, 'center', 'alphabetic', '11px ' + FONT);
    }
  }
  function drawLensInfo(xcm) {
    const c = ctx, L = Lay, x = L.info.x, r0 = L.R / 24;
    let y = L.info.y + 6;
    const maxW = W - x - 10;
    if (maxW < 150) return;
    const cc = concAt(xcm), dep = depAt(xcm);
    const row = function (sp, label, val) {
      drawMol(c, sp, x + 12, y, 0.3, r0 * 0.9, 1, sp === 'N2');
      const fx = x + 32;
      let w = 0;
      if (sp !== 'N2') w = drawF(c, GAS[sp].f, fx, y + 5, col.text, 13, '700', 'left') + 6;
      w += LD.haloText(c, label, fx + w, y + 5, col.text, 'left', 'alphabetic', '13px ' + FONT) || 0;
      if (sp === 'N2') { c.font = '13px ' + FONT; w = c.measureText(label).width + 6; drawF(c, 'N2', fx + w, y + 5, col.muted, 13, '600', 'left'); w += fWidth(c, 'N2', 13, '600'); LD.haloText(c, '+', fx + w + 3, y + 5, col.muted, 'left', 'alphabetic', '13px ' + FONT); drawF(c, 'O2', fx + w + 14, y + 5, col.muted, 13, '600', 'left'); }
      if (val) LD.haloText(c, val, fx, y + 22, col.muted, 'left', 'alphabetic', '12px ' + FONT);
      y += val ? 42 : 30;
    };
    const B = dr ? dr.o.base : state.base, A = dr ? dr.o.acid : state.acid;
    const vB = G.meanSpeed(G.M(B), state.T), vA = isUnk(A) ? null : G.meanSpeed(G.M(A), state.T);
    row(B, nm(B), T('相對濃度 ', 'relative conc. ') + num(cc[0], 3) + ' · v̄ = ' + num(vB, 0) + ' m/s');
    row(A, isUnk(A) ? T('未知的酸', 'unknown acid') : nm(A), T('相對濃度 ', 'relative conc. ') + num(cc[1], 3) + ' · v̄ = ' + (vA ? num(vA, 0) + ' m/s' : '?'));
    row('N2', T('空氣', 'Air'), 'v̄ ≈ ' + num(G.meanSpeed(28.96, state.T), 0) + ' m/s');
    drawCrystal(c, x + 12, y - 4, r0 * 1.1, 0.4, 1);
    const salt = (B === 'CH3NH2' ? 'CH3NH3' : 'NH4') + GAS[A].salt.slice(3);
    const w = drawF(c, salt, x + 32, y + 1, col.text, 13, '700', 'left');
    LD.haloText(c, T(' 晶體（白煙）', ' crystals (white smoke)'), x + 32 + w, y + 1, col.text, 'left', 'alphabetic', '13px ' + FONT);
    if (dep > 0.01) LD.haloText(c, T('這裡的白煙 ', 'smoke here ') + num(100 * dep, 0) + '%', x + 32, y + 18, col.muted, 'left', 'alphabetic', '12px ' + FONT);
    y += 40;
    LD.haloText(c, T('示意：分子放大、速率放慢；', 'Not to scale: enlarged and slowed;'), x, y, col.muted, 'left', 'alphabetic', '11px ' + FONT);
    LD.haloText(c, T('數目依濃度的平方根畫出', 'numbers drawn as √(concentration)'), x, y + 15, col.muted, 'left', 'alphabetic', '11px ' + FONT);
  }

  // ---- 逸散容器 ----
  function chamberBox(k) {
    const narrow = W < 560, m = narrow ? 12 : 26;
    const bw = Math.min(250, (W - 3 * m) / 2), bh = narrow ? 230 : 250;
    const x = k ? W / 2 + m / 2 + ((W - 3 * m) / 2 - bw) / 2 : m + ((W - 3 * m) / 2 - bw) / 2;
    return { x: x, y: narrow ? 72 : 58, w: bw, h: bh };
  }
  function drawEffusion(now) {
    const c = ctx;
    if (!er) return;
    // 真空區
    const vy = chamberBox(0).y + chamberBox(0).h + 6;
    const vg = c.createLinearGradient(0, vy, 0, H);
    vg.addColorStop(0, col.dark ? 'rgba(10,14,20,0.55)' : 'rgba(40,52,66,0.10)');
    vg.addColorStop(1, col.dark ? 'rgba(10,14,20,0.85)' : 'rgba(40,52,66,0.22)');
    LD.roundRect(c, 8, vy, W - 16, H - vy - 8, 10);
    c.fillStyle = vg; c.fill();
    c.strokeStyle = LD.alpha(col.text, 0.18); c.lineWidth = 1; c.stroke();
    LD.haloText(c, W < 560 ? T('真空', 'Vacuum') : T('真空（抽氣幫浦持續抽走逸出的分子）', 'Vacuum (a pump keeps removing the escaped molecules)'), W / 2, H - 16, col.muted, 'center', 'alphabetic', '12px ' + FONT);
    [0, 1].forEach(function (k) { drawChamber(k, now); });
    LD.pill(c, 't = ' + clock(er.t), 12, 26, col.text, 'left', '600 13px ' + FONT);
    LD.pill(c, '×' + SPEEDS[state.speed], W - 12, 26, col.muted, 'right', '600 12px ' + FONT);
  }
  function drawChamber(k, now) {
    const c = ctx, b = chamberBox(k), id = k ? er.B : er.A, Tk = k ? er.TB : er.TA;
    const P = G.effP(er.P0, er.t, k ? er.tauB : er.tauA), half = k ? er.hB : er.hA, got = k ? er.gotB : er.gotA;
    const cc = k ? col.B : col.A;
    LD.contactShadow(c, b.x + b.w / 2, b.y + b.h + 4, b.w * 0.45, 0.2);
    // 玻璃容器
    c.save();
    LD.roundRect(c, b.x, b.y, b.w, b.h, 12);
    const g = c.createLinearGradient(b.x, 0, b.x + b.w, 0);
    g.addColorStop(0, col.glass + (col.dark ? '0.22)' : '0.28)'));
    g.addColorStop(0.15, col.glass + '0.05)');
    g.addColorStop(0.85, col.glass + '0.06)');
    g.addColorStop(1, col.glass + (col.dark ? '0.26)' : '0.32)'));
    c.fillStyle = col.dark ? '#141a21' : '#fbfcfd'; c.fill();
    c.fillStyle = LD.alpha(tempTint(Tk), 0.09); c.fill();
    c.fillStyle = g; c.fill();
    c.strokeStyle = col.glass + (col.dark ? '0.7)' : '0.8)'); c.lineWidth = 2; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,' + (col.dark ? 0.25 : 0.8) + ')'; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(b.x + 8, b.y + 18); c.lineTo(b.x + 8, b.y + b.h * 0.55); c.stroke();
    c.restore();
    // 分子
    const r0 = Math.max(2.4, b.w / 70);
    c.save();
    LD.roundRect(c, b.x + 2, b.y + 2, b.w - 4, b.h - 4, 10); c.clip();
    cham[k].forEach(function (m) { drawMol(c, id === 'X' ? 'X' : id, b.x + m.x * b.w, b.y + m.y * b.h, m.ang, r0, 1); });
    c.restore();
    escaping[k].forEach(function (e) {
      const u = (now - e.t0) / 900;
      drawMol(c, id === 'X' ? 'X' : id, b.x + e.x * b.w, b.y + e.y * b.h, e.ang, r0, Math.max(0, 1 - u));
    });
    // 小孔
    const hx = b.x + b.w / 2, hy = b.y + b.h;
    c.fillStyle = col.dark ? '#0b0f14' : '#2b3440';
    c.fillRect(hx - 3, hy - 2, 6, 5);
    c.strokeStyle = col.muted; c.lineWidth = 1; c.beginPath(); c.moveTo(hx - 9, hy + 3.5); c.lineTo(hx - 3, hy + 3.5); c.moveTo(hx + 3, hy + 3.5); c.lineTo(hx + 9, hy + 3.5); c.stroke();
    // 標籤：化學式、溫度、壓力
    const tx = b.x + b.w / 2;
    if (id === 'X') LD.haloText(c, T('X（未知）', 'X (unknown)'), tx, b.y - 24, cc, 'center', 'alphabetic', '700 15px ' + FONT);
    else {
      const w = fWidth(c, GAS[id].f, 15, '700');
      const extra = GAS[id].iso ? ' (U-' + GAS[id].iso + ')' : '';
      c.font = '600 12px ' + FONT;
      const w2 = extra ? c.measureText(extra).width : 0;
      drawF(c, GAS[id].f, tx - (w + w2) / 2, b.y - 24, cc, 15, '700', 'left');
      if (extra) LD.haloText(c, extra, tx - (w + w2) / 2 + w, b.y - 24, cc, 'left', 'alphabetic', '600 12px ' + FONT);
    }
    LD.haloText(c, (k ? 'B · ' : 'A · ') + num(Tk, 0) + ' K', tx, b.y - 8, col.muted, 'center', 'alphabetic', '12px ' + FONT);
    // 壓力計（底部長條）
    const gy = b.y + b.h - 22, gw = b.w - 28, gx = b.x + 14;
    LD.roundRect(c, gx, gy, gw, 8, 4); c.fillStyle = LD.alpha(col.text, 0.1); c.fill();
    LD.roundRect(c, gx, gy, Math.max(0, gw * P / er.P0), 8, 4); c.fillStyle = cc; c.fill();
    c.strokeStyle = LD.alpha(col.text, 0.5); c.lineWidth = 1; c.setLineDash([2, 2]);
    c.beginPath(); c.moveTo(gx + gw / 2 + 0.5, gy - 3); c.lineTo(gx + gw / 2 + 0.5, gy + 11); c.stroke(); c.setLineDash([]);
    LD.pill(c, 'P = ' + sigf(P, 3) + ' Pa', b.x + b.w / 2, gy - 6, col.text, 'center', '600 12px ' + FONT);
    if (got) LD.pill(c, 't½ = ' + clock(half), b.x + b.w / 2, b.y + 26, cc, 'center', '700 12px ' + FONT);
    const u = (now - (k ? halfFlashB : halfFlashA)) / 700;
    if (u >= 0 && u <= 1 && !reducedMotion) { c.save(); c.strokeStyle = LD.alpha(cc, 0.7 * (1 - u)); c.lineWidth = 3; LD.roundRect(c, b.x - 4 * u, b.y - 4 * u, b.w + 8 * u, b.h + 8 * u, 14); c.stroke(); c.restore(); }
  }

  function draw() {
    if (!Lay) return;
    const now = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(ctx, W, H);
    if (state.mode === 'diff') {
      drawTube(now);
      drawLens(now);
      const t = dr ? dr.t : 0;
      LD.pill(ctx, 't = ' + clock(t), 12, 24, col.text, 'left', '600 13px ' + FONT);
      LD.pill(ctx, (Lay.narrow ? '' : (state.model === 'air' ? T('在空氣中擴散', 'Diffusion in air') : T('格雷厄姆（理想）', 'Graham (ideal)')) + ' · ') + num(state.T, 0) + ' K · ×' + SPEEDS[state.speed], W - 12, 24, col.muted, 'right', '600 12px ' + FONT);
      if (dr && dr.ringSeen) {
        const s = T('白煙環出現在 ', 'Ring at ') + clock(dr.rg.t);
        if (!Lay.narrow) LD.pill(ctx, s, W / 2, 24, col.accent, 'center', '700 12px ' + FONT);
      }
    } else drawEffusion(now);
  }

  // ======================= 主迴圈（全頁只有這一條 requestAnimationFrame） =======================
  let raf = 0, lastTs = 0, lastUi = 0;
  function wantLoop() { return !document.hidden && (running || !reducedMotion) && state.view === '2d' || (!document.hidden && view3 && view3.active && (running || !reducedMotion)); }
  function startLoop() { if (!raf && wantLoop()) { lastTs = 0; raf = requestAnimationFrame(loop); } }
  function loop(ts) {
    raf = 0;
    const dtw = lastTs ? Math.min(1 / 30, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    const now = performance.now();
    if (running && dtw > 0) advance(dtw * SPEEDS[state.speed]);
    if (!reducedMotion || running) {
      if (state.mode === 'diff' && Lay) stepLens(reducedMotion ? 0 : dtw, now, Lay.R);
      if (state.mode === 'eff') stepChambers(reducedMotion ? 0 : dtw, now);
    }
    if (state.view === '2d') draw();
    if (view3 && view3.active) view3.frame();
    if (now - lastUi > 120) { lastUi = now; updateReadouts(); if (running || state.tab === 'speed') drawGraph(); }
    if (wantLoop()) raf = requestAnimationFrame(loop);
  }
  function requestDraw() {
    if (raf) return;
    requestAnimationFrame(function () {
      const now = performance.now();
      if (state.mode === 'diff' && Lay) stepLens(0, now, Lay.R);
      if (state.view === '2d') draw();
      if (view3 && view3.active) view3.frame();
    });
  }
  function advance(dt) {
    if (state.mode === 'diff' && dr && !dr.done) {
      dr.t = Math.min(dr.tEnd, dr.t + dt);
      if (!dr.ringSeen && dr.t >= dr.rg.t) onRing();
      if (dr.t >= dr.tEnd - 1e-9) { dr.done = true; setRunning(false); setStatus(T('實驗結束：白煙環已經清楚可見。按「重來」可以再做一次，或改變設定。', 'Finished: the white ring is clearly visible. Press “Reset” to repeat, or change a setting.')); }
    } else if (state.mode === 'eff' && er) {
      er.t = Math.min(er.tEnd, er.t + dt);
      if (!er.gotA && er.t >= er.hA) { er.gotA = true; halfFlashA = performance.now(); snd('half', 0); }
      if (!er.gotB && er.t >= er.hB) { er.gotB = true; halfFlashB = performance.now(); snd('half', 1); }
      if (er.gotA && er.gotB && !er.emitted) onEffuse();
      if (er.t >= er.tEnd - 1e-9) { setRunning(false); setStatus(T('兩個容器都只剩不到十六分之一的氣體了。按「重來」可以再做一次。', 'Both containers now hold less than a sixteenth of their gas. Press “Reset” to repeat.')); }
    }
  }

  // ======================= 事件：白煙環、逸散 =======================
  function segRecords(kind) { return records.filter(function (r) { return r.seg === segId && r.kind === kind; }).slice(-40).map(function (r) { return r.data; }); }
  function onRing() {
    dr.ringSeen = true;
    ringFlash = performance.now();
    snd('ring');
    const rg = dr.rg, o = dr.o;
    const data = { base: o.base, acid: o.acid, unknown: isUnk(o.acid), model: o.model, L: o.L, T: o.T, frac: rg.frac, x: rg.x, t: rg.t,
      ratio: rg.ratio, graham: isUnk(o.acid) ? null : rg.graham, DA: rg.DA, DB: rg.DB };
    const earlier = segRecords('diff');
    addRecord('diff', data);
    if (unk && isUnk(o.acid)) unk.nMeas++;
    setStatus(T('白煙環出現了！距 ', 'The white ring has appeared, ') + num(rg.x, 1) + T(' cm（鹼端）、距 ', ' cm from the base end and ') + num(o.L - rg.x, 1) + T(' cm（酸端）。', ' cm from the acid end.'));
    if (userActed && started && window.LabMission) window.LabMission.emit('ring', Object.assign({ earlier: earlier }, data));
  }
  function onEffuse() {
    er.emitted = true;
    const data = { A: er.A, B: er.B, MA: isUnk(er.A) ? null : er.MA, MB: isUnk(er.B) ? null : er.MB, TA: er.TA, TB: er.TB, d: er.d, P0: er.P0,
      tA: er.hA, tB: er.hB, ratio: er.hB / er.hA, Kn: Math.min(G.knudsen(er.TA, er.P0, er.d), G.knudsen(er.TB, er.P0, er.d)), unknown: isUnk(er.B) };
    const earlier = segRecords('eff');
    addRecord('eff', data);
    if (unk && isUnk(er.B)) unk.nMeas++;
    setStatus(T('兩邊都降到一半了：t½(B) ÷ t½(A) = ', 'Both have dropped to half: t½(B) ÷ t½(A) = ') + num(data.ratio, 4) + T('。', '.'));
    if (userActed && started && window.LabMission) window.LabMission.emit('effuse', Object.assign({ earlier: earlier }, data));
  }
  function addRecord(kind, data) {
    records.push({ id: ++recSeq, seg: segId, kind: kind, data: data });
    if (records.length > 200) records.shift();
    renderTable();
    drawGraph();
  }

  // ======================= 音效 =======================
  function snd(kind, k) {
    if (!window.LabSound || !window.LabSound.enabled()) return;
    const S = window.LabSound;
    if (kind === 'start') { S.tone({ freq: 520, dur: 0.06, type: 'triangle', gain: 0.08 }); S.tone({ freq: 620, dur: 0.06, type: 'triangle', gain: 0.08, delay: 0.09 }); }
    else if (kind === 'ring') { S.tone({ freq: 784, dur: 0.18, gain: 0.12 }); S.tone({ freq: 1175, dur: 0.3, gain: 0.1, delay: 0.12 }); S.noise({ dur: 0.35, gain: 0.04, filter: 3000 }); }
    else if (kind === 'half') {
      // 音高代表平均速率：越輕越快，聲音越高
      const v = G.meanSpeed(k ? er.MB : er.MA, k ? er.TB : er.TA);
      S.tone({ freq: clamp(280 + 0.42 * v, 280, 1200), dur: 0.22, gain: 0.12 });
    } else if (kind === 'pop') S.tone({ freq: 880, dur: 0.03, type: 'sine', gain: 0.03 });
    else if (kind === 'ok') { S.tone({ freq: 880, dur: 0.12, gain: 0.16 }); S.tone({ freq: 1320, dur: 0.16, gain: 0.13, delay: 0.1 }); }
    else if (kind === 'no') S.sweep({ from: 392, to: 262, dur: 0.25, gain: 0.12, type: 'triangle' });
  }

  // ======================= 控制項 =======================
  const elT = $('temp'), elL = $('len'), elTA = $('tA'), elTB = $('tB'), elD = $('hole'), elP = $('p0');
  const P0MIN = 0.1, P0MAX = 5;
  const p0Map = {
    toValue: function (p) { return P0MIN * Math.pow(P0MAX / P0MIN, p / 1000); },
    toPos: function (v) { return 1000 * Math.log(v / P0MIN) / Math.log(P0MAX / P0MIN); },
    min: P0MIN, max: P0MAX, decimals: 2
  };
  if (window.LabNum) window.LabNum.register(elP, p0Map);
  function val(el) { return window.LabNum ? window.LabNum.value(el) : (el === elP ? p0Map.toValue(+el.value) : +el.value); }
  function setVal(el, v) { if (window.LabNum) window.LabNum.set(el, v); else el.value = el === elP ? p0Map.toPos(v) : v; }
  function acted() { userActed = true; }
  function refreshOutputs() {
    $('tempo').textContent = num(val(elT), 1).replace(/\.0$/, '') + ' K' + T('（', ' (') + num(val(elT) - 273.15, 1) + ' °C' + T('）', ')');
    $('leno').textContent = num(val(elL), 1).replace(/\.0$/, '') + ' cm';
    $('tAo').textContent = num(val(elTA), 1).replace(/\.0$/, '') + ' K';
    $('tBo').textContent = num(val(elTB), 1).replace(/\.0$/, '') + ' K';
    $('holeo').textContent = num(val(elD), 1).replace(/\.0$/, '') + ' µm';
    $('p0o').textContent = sigf(val(elP), 3) + ' Pa';
  }
  function settingsChanged(msg) {
    resetRun();
    setStatus(msg || T('設定改變了：已清空，請按「開始」。', 'Settings changed and everything was emptied: press “Start”.'));
    refreshAll();
  }
  elT.addEventListener('input', function () {
    acted();
    const v = val(elT);
    if (v === state.T) { refreshOutputs(); return; }
    rescaleLens(state.T, v); state.T = v;
    settingsChanged();
  });
  elL.addEventListener('input', function () { acted(); const v = val(elL); if (v === state.L) { refreshOutputs(); return; } state.L = v; settingsChanged(); });
  elTA.addEventListener('input', function () { acted(); const v = val(elTA); if (v === state.TA) { refreshOutputs(); return; } rescaleChamber(0, state.TA, v); state.TA = v; settingsChanged(); });
  elTB.addEventListener('input', function () { acted(); const v = val(elTB); if (v === state.TB) { refreshOutputs(); return; } rescaleChamber(1, state.TB, v); state.TB = v; settingsChanged(); });
  elD.addEventListener('input', function () { acted(); const v = val(elD); if (v === state.d) { refreshOutputs(); return; } state.d = v; settingsChanged(); });
  elP.addEventListener('input', function () { acted(); const v = val(elP); if (Math.abs(v - state.P0) < 1e-12) { refreshOutputs(); return; } state.P0 = v; settingsChanged(); });

  function segPress(sel, attr, v) { document.querySelectorAll(sel + ' button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset[attr] === v)); }); }
  document.querySelectorAll('#baseSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); if (state.base === b.dataset.g) return; state.base = b.dataset.g; segPress('#baseSeg', 'g', state.base); mols.forEach(function (m) { if (m.sp !== 'N2' && m.sp !== 'O2') m.dying = performance.now(); }); settingsChanged(); }); });
  document.querySelectorAll('#acidSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); if (unk || state.acid === b.dataset.g) return; state.acid = b.dataset.g; segPress('#acidSeg', 'g', state.acid); settingsChanged(); }); });
  document.querySelectorAll('#modelSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); if (unk || state.model === b.dataset.model) return; state.model = b.dataset.model; segPress('#modelSeg', 'model', state.model); settingsChanged(); }); });
  document.querySelectorAll('#modeSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); setMode(b.dataset.mode); }); });

  function fillSelect(el, cur, withX) {
    el.innerHTML = '';
    G.EFF.forEach(function (id) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = nm(id) + ' ' + (GAS[id].iso ? '' : GAS[id].f) + T('（', ' (') + num(GAS[id].M, GAS[id].M < 10 ? 3 : 2) + ' g/mol' + T('）', ')');
      el.appendChild(o);
    });
    if (withX) { const o = document.createElement('option'); o.value = 'X'; o.textContent = T('X（未知氣體）', 'X (unknown gas)'); el.appendChild(o); }
    el.value = cur;
  }
  const elA = $('gasA'), elB = $('gasB');
  elA.addEventListener('change', function () { acted(); state.gA = elA.value; settingsChanged(); });
  elB.addEventListener('change', function () { acted(); if (unk) { elB.value = 'X'; return; } state.gB = elB.value; settingsChanged(); });

  function setMode(m) {
    if (m === state.mode) return;
    if (unk) stopUnknown(true);
    state.mode = m;
    segPress('#modeSeg', 'mode', m);
    $('diffCard').hidden = m !== 'diff';
    $('effCard').hidden = m !== 'eff';
    // 圖表分頁
    $('tabs').querySelector('[data-tab="prof"]').hidden = m !== 'diff';
    $('tabs').querySelector('[data-tab="ring"]').hidden = m !== 'diff';
    $('tabs').querySelector('[data-tab="pres"]').hidden = m !== 'eff';
    if (m === 'diff' && state.tab === 'pres') state.tab = 'prof';
    if (m === 'eff' && (state.tab === 'prof' || state.tab === 'ring')) state.tab = 'pres';
    $('tabs').className = m === 'diff' ? 'seg3 tabs' : 'seg2 tabs';
    if (m === 'eff' && state.speed < 2) setSpeed(2);
    resetRun();
    setTab(state.tab);
    updateUnknownCard();
    if (view3) view3.rebuild();
    setStatus(m === 'diff' ? T('擴散：按「開始」把棉花塞進玻璃管兩端。', 'Diffusion: press “Start” to push the cotton into both ends of the tube.') :
      T('逸散：按「開始」同時打開兩個小孔。', 'Effusion: press “Start” to open both pinholes at the same moment.'));
    refreshAll();
    startLoop();
  }
  function setTab(t) {
    state.tab = t;
    document.querySelectorAll('#tabs button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tab === t)); });
    drawGraph();
  }
  document.querySelectorAll('#tabs button').forEach(function (b) { b.addEventListener('click', function () { acted(); setTab(b.dataset.tab); }); });
  function setSpeed(i) { state.speed = i; [0, 1, 2, 3].forEach(function (k) { $('sp' + k).setAttribute('aria-pressed', String(k === i)); }); }
  [0, 1, 2, 3].forEach(function (k) { $('sp' + k).addEventListener('click', function () { acted(); setSpeed(k); requestDraw(); }); });

  function updateRunButton() {
    const done = state.mode === 'diff' ? dr && dr.done : er && er.t >= er.tEnd - 1e-9;
    $('run').textContent = running ? T('暫停', 'Pause') : started && !done ? T('繼續', 'Continue') : T('開始', 'Start');
    $('run').disabled = !!done && !running;
  }
  function setRunning(on) {
    running = on;
    updateRunButton();
    startLoop();
  }
  $('run').addEventListener('click', function () {
    acted();
    if (running) { setRunning(false); setStatus(T('已暫停。', 'Paused.')); return; }
    if (!started) {
      started = true;
      snd('start');
      setStatus(state.mode === 'diff' ? T('棉花已塞進兩端，兩種氣體開始在管中擴散……', 'The cotton is in both ends; the two gases start to spread along the tube…') :
        T('兩個小孔同時打開，氣體開始逸出……', 'Both pinholes are open; the gases start to escape…'));
    } else setStatus('');
    setRunning(true);
  });
  $('reset').addEventListener('click', function () { acted(); resetRun(); setStatus(T('已清空，可以重新開始。', 'Emptied; ready to start again.')); refreshAll(); });
  $('clearAll').addEventListener('click', function () {
    acted();
    records = []; segId++;
    crystals = crystals.filter(function (k) { return k.persist; });
    $('unkOut').textContent = '';
    renderTable();
    drawGraph();
    setStatus(T('已清除測量紀錄與圖表；目前的實驗不變。', 'The measurements and graphs have been cleared; the current run is unchanged.'));
  });
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
    if (ev.detail && ev.detail.name === 'fs') resize();
  });

  // ======================= 未知氣體 =======================
  function updateUnknownCard() {
    const diff = state.mode === 'diff';
    $('unkTitle').textContent = diff ? T('未知的酸 HX', 'Unknown acid HX') : T('未知氣體 X', 'Unknown gas X');
    $('unkIntro').innerHTML = diff ?
      T('右端換成一種未知的酸（模型固定為「格雷厄姆（理想）」）。量出白煙環的位置，用格雷厄姆定律算出 HX 的莫耳質量。',
        'The right end holds an unknown acid (the model is fixed to “Graham\'s law (ideal)”). Measure where the ring forms and use Graham\'s law to find the molar mass of HX.') :
      T('右邊容器換成未知氣體 X。和左邊的已知氣體在同一溫度比較逸散時間，算出 X 的莫耳質量。',
        'The right container holds an unknown gas X. Compare its effusion time with a known gas on the left at the same temperature and work out the molar mass of X.');
    $('unkOn').hidden = !!unk;
    $('unkBox').hidden = !unk;
    const dis = !!unk && diff;
    document.querySelectorAll('#acidSeg button, #modelSeg button').forEach(function (b) { b.disabled = dis; });
    elB.disabled = !!unk && !diff;
  }
  function startUnknown() {
    acted();
    const kind = state.mode === 'diff' ? 'HX' : 'X';
    G.newUnknown(kind);
    unk = { kind: kind, tries: 0, nMeas: 0, revealed: false };
    if (kind === 'HX') {
      unk.prevAcid = unk.prevAcid || state.acid; unk.prevModel = state.model;
      state.acid = 'HX'; state.model = 'graham';
      segPress('#acidSeg', 'g', ''); segPress('#modelSeg', 'model', 'graham');
    } else {
      unk.prevB = state.gB;
      fillSelect(elB, 'X', true); state.gB = 'X';
    }
    $('ansM').value = '';
    $('unkOut').textContent = kind === 'HX' ? T('未知的酸已放進右端。按「開始」做實驗。', 'The unknown acid is in the right end. Press “Start”.') :
      T('未知氣體 X 已裝進右邊容器。按「開始」做實驗。', 'The unknown gas X is in the right container. Press “Start”.');
    updateUnknownCard();
    settingsChanged(T('未知氣體挑戰開始：按「開始」。', 'Unknown-gas challenge: press “Start”.'));
  }
  function stopUnknown(silent) {
    if (!unk) return;
    if (unk.kind === 'HX') { state.acid = unk.prevAcid || 'HCl'; state.model = unk.prevModel || 'graham'; segPress('#acidSeg', 'g', state.acid); segPress('#modelSeg', 'model', state.model); }
    else { state.gB = unk.prevB || 'O2'; fillSelect(elB, state.gB, false); }
    unk = null;
    updateUnknownCard();
    if (!silent) { $('unkOut').textContent = ''; settingsChanged(T('已結束挑戰。', 'Challenge ended.')); }
  }
  function checkAnswer() {
    if (!unk) return;
    acted();
    const a = parseFloat(String($('ansM').value).normalize('NFKC').replace(/[，,]/g, '.').replace(/[^\d.eE+-]/g, ''));
    if (!(a > 0) || !isFinite(a)) { $('unkOut').textContent = T('請輸入一個正數（g/mol）。', 'Please type a positive number (g/mol).'); return; }
    const Mt = G.M(unk.kind), err = Math.abs(a - Mt) / Mt;
    unk.tries++;
    let msg;
    if (!unk.nMeas) msg = T('先做一次實驗再算吧：還沒有量到這個未知氣體。', 'Do the experiment first: nothing has been measured with this unknown yet.');
    else if (err <= 0.01) msg = '<span class="ok">' + T('非常準確！誤差 ', 'Excellent! Error ') + num(100 * err, 2) + '%</span>';
    else if (err <= 0.05) msg = '<span class="ok">' + T('正確！誤差 ', 'Correct! Error ') + num(100 * err, 1) + '%</span>' + T('。能更準嗎？', '. Can you get closer?');
    else msg = '<span class="no">' + T('還不對', 'Not yet') + '</span>' + T('：差了 ', ': off by ') + num(100 * err, 0) + '%' + T('。檢查一下比值有沒有平方。', '. Check that the ratio is squared.');
    $('unkOut').innerHTML = msg;
    snd(unk.nMeas && err <= 0.05 ? 'ok' : 'no');
    if (window.LabMission && unk.nMeas) window.LabMission.emit('answer', { kind: unk.kind, ans: a, err: err, tries: unk.tries, nMeas: unk.nMeas, revealed: unk.revealed });
  }
  function reveal() {
    if (!unk) return;
    acted();
    unk.revealed = true;
    $('unkOut').innerHTML = T('答案：M = ' + num(G.M(unk.kind), 1) + ' g/mol。這一個已揭曉，按「換一個」再挑戰。', 'Answer: M = ' + num(G.M(unk.kind), 1) + ' g/mol. This one is revealed; press “Another one” to try again.');
  }
  $('unkOn').addEventListener('click', startUnknown);
  $('unkNew').addEventListener('click', function () { const k = unk && unk.kind; const pa = unk && unk.prevAcid, pm = unk && unk.prevModel, pb = unk && unk.prevB; unk = null; startUnknown(); if (k === 'HX') { unk.prevAcid = pa; unk.prevModel = pm; } else unk.prevB = pb || unk.prevB; });
  $('unkOff').addEventListener('click', function () { acted(); stopUnknown(false); });
  $('check').addEventListener('click', checkAnswer);
  $('ansM').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); checkAnswer(); } });
  $('reveal').addEventListener('click', reveal);

  // ======================= 讀數 =======================
  let statusMsg = '';
  function setStatus(s) { statusMsg = s; $('status').innerHTML = s || autoStatus(); }
  function autoStatus() {
    if (state.mode === 'diff') {
      if (!started) return T('按「開始」把棉花同時塞進玻璃管兩端。', 'Press “Start” to push the cotton into both ends at the same moment.');
      if (!running && !(dr && dr.done)) return T('已暫停。', 'Paused.');
      return dr && dr.ringSeen ? T('白煙環出現了。', 'The white ring has appeared.') : T('兩種氣體正在管中擴散……', 'The gases are spreading along the tube…');
    }
    if (!started) return T('按「開始」同時打開兩個小孔。', 'Press “Start” to open both pinholes at the same moment.');
    return running ? T('氣體正從小孔逸出……', 'The gases are escaping through the pinholes…') : T('已暫停。', 'Paused.');
  }
  function rows(list) { return list.map(function (r) { return '<dt>' + r[0] + '</dt><dd' + (r[2] ? ' class="' + r[2] + '"' : '') + '>' + r[1] + '</dd>'; }).join(''); }
  function updateReadouts() {
    const out = [], th = [];
    if (state.mode === 'diff' && dr) {
      const o = dr.o, rg = dr.rg, u = isUnk(o.acid);
      out.push([T('時間 t', 'Time t'), clock(dr.t)]);
      if (dr.ringSeen) {
        out.push([T('白煙環出現', 'Ring appeared at'), clock(rg.t) + '<small>' + sigf(rg.t, 4) + ' s</small>', 'big']);
        out.push([T('距鹼端 x<sub>鹼</sub>', 'From base end x<sub>base</sub>'), num(rg.x, 1) + ' cm<small>' + num(100 * rg.frac, 1) + T('% 管長', '% of tube') + '</small>']);
        out.push([T('距酸端 x<sub>酸</sub>', 'From acid end x<sub>acid</sub>'), num(o.L - rg.x, 1) + ' cm']);
        out.push([T('距離比 x<sub>鹼</sub>/x<sub>酸</sub>', 'Distance ratio x<sub>base</sub>/x<sub>acid</sub>'), num(rg.ratio, 3), 'good']);
      } else {
        out.push([T('白煙環', 'White ring'), started ? T('還沒出現', 'not yet') : '—']);
      }
      out.push([T('擴散係數 D', 'Diffusion coefficient D') + '<small>' + (o.model === 'air' ? T('在空氣中', 'in air') : T('格雷厄姆模型', 'Graham model')) + '</small>',
        fH(o.base) + ' ' + num(rg.DA, 3) + '<small>' + (u ? 'HX ?' : fH(o.acid) + ' ' + num(rg.DB, 3)) + ' cm²/s</small>']);
      const vB = G.meanSpeed(G.M(o.base), o.T);
      th.push([T('平均速率 v̄', 'Mean speed v̄') + '<small>√(8RT/πM)</small>', fH(o.base) + ' ' + num(vB, 0) + ' m/s<small>' + (u ? 'HX ?' : fH(o.acid) + ' ' + num(G.meanSpeed(G.M(o.acid), o.T), 0) + ' m/s') + '</small>']);
      th.push([T('格雷厄姆比 √(M<sub>酸</sub>/M<sub>鹼</sub>)', 'Graham ratio √(M<sub>acid</sub>/M<sub>base</sub>)'), u ? '?' : num(G.grahamFrac(o.base, o.acid) / (1 - G.grahamFrac(o.base, o.acid)), 3)]);
      th.push([T('√M 預測的位置', 'Position from √M'), u ? '?' : num(100 * G.grahamFrac(o.base, o.acid), 1) + T('% 管長', '% of tube')]);
      if (!u) {
        const DAa = G.fullerD(o.base, o.T), DBa = G.fullerD(o.acid, o.T);
        th.push([T('空氣中的擴散係數比', 'Ratio of D in air'), num(DAa / DBa, 3) + '<small>' + num(100 * DAa / (DAa + DBa), 1) + T('% 管長', '% of tube') + '</small>']);
      }
    } else if (state.mode === 'eff' && er) {
      const PA = G.effP(er.P0, er.t, er.tauA), PB = G.effP(er.P0, er.t, er.tauB), ux = isUnk(er.B);
      out.push([T('時間 t', 'Time t'), clock(er.t)]);
      out.push([T('壓力 P<sub>A</sub>／P<sub>B</sub>', 'Pressure P<sub>A</sub> / P<sub>B</sub>'), sigf(PA, 3) + ' / ' + sigf(PB, 3) + ' Pa']);
      out.push([T('半衰時間 t½(A)', 'Half-time t½(A)'), er.gotA ? sigf(er.hA, 5) + ' s<small>' + clock(er.hA) + '</small>' : '—', er.gotA ? 'big' : '']);
      out.push([T('半衰時間 t½(B)', 'Half-time t½(B)'), er.gotB ? sigf(er.hB, 5) + ' s<small>' + clock(er.hB) + '</small>' : '—', er.gotB ? 'big' : '']);
      out.push([T('時間比 t½(B)/t½(A)', 'Ratio t½(B)/t½(A)'), er.gotA && er.gotB ? num(er.hB / er.hA, 4) : '—', er.gotA && er.gotB ? 'good' : '']);
      out.push([T('克努森數 Kn = λ/d', 'Knudsen number Kn = λ/d') + '<small>' + T('≫ 1 才是逸散', 'effusion needs ≫ 1') + '</small>', sigf(Math.min(G.knudsen(er.TA, er.P0, er.d), G.knudsen(er.TB, er.P0, er.d)), 3)]);
      th.push([T('平均速率 v̄(A)', 'Mean speed v̄(A)'), num(G.meanSpeed(er.MA, er.TA), 0) + ' m/s']);
      th.push([T('平均速率 v̄(B)', 'Mean speed v̄(B)'), ux ? '?' : num(G.meanSpeed(er.MB, er.TB), 0) + ' m/s']);
      th.push([T('理論時間比 √(M<sub>B</sub>T<sub>A</sub>/M<sub>A</sub>T<sub>B</sub>)', 'Predicted ratio √(M<sub>B</sub>T<sub>A</sub>/M<sub>A</sub>T<sub>B</sub>)'), ux ? '?' : num(Math.sqrt(er.MB * er.TA / (er.MA * er.TB)), 4)]);
      th.push([T('時間常數 τ = 4V/(Av̄)', 'Time constant τ = 4V/(Av̄)'), sigf(er.tauA, 4) + ' s<small>B: ' + (ux ? '?' : sigf(er.tauB, 4) + ' s') + '</small>']);
    }
    $('readout').innerHTML = rows(out);
    $('theory').innerHTML = rows(th);
    if (!statusMsg) $('status').innerHTML = autoStatus();
  }
  function stageHint() {
    $('stageHint').textContent = state.mode === 'diff' ?
      T('拖曳玻璃管上的圓圈（或選取畫面後按方向鍵）移動放大鏡。管中的顏色與小點只是標示兩種氣體的濃度：真實的氨與氯化氫都是無色的。',
        'Drag the circle on the tube (or focus the drawing and use the arrow keys) to move the magnifier. The colours and dots in the tube only mark the concentrations of the two gases: real ammonia and hydrogen chloride are colourless.') :
      T('兩個 1.00 L 的容器底部各有一個相同的小孔，外面是真空。長條是壓力，虛線是一半的位置。', 'Each 1.00 L container has the same pinhole in its floor, with a vacuum outside. The bar shows the pressure; the dashed mark is half of the start.');
  }

  // ======================= 紀錄表 =======================
  function renderTable() {
    const el = $('tbl');
    const list = records.filter(function (r) { return r.kind === state.mode; });
    let h;
    if (state.mode === 'diff') {
      h = '<thead><tr><th>#</th><th class="l">' + T('氣體', 'Gases') + '</th><th class="l">' + T('模型', 'Model') + '</th><th>T<br><small>K</small></th><th>L<br><small>cm</small></th>' +
        '<th>t<br><small>' + T('分', 'min') + '</small></th><th>x<sub>' + T('鹼', 'base') + '</sub><br><small>cm</small></th><th>' + T('距離比', 'Ratio') + '</th><th>√M ' + T('比', 'ratio') + '</th></tr></thead><tbody>';
      if (!list.length) h += '<tr class="empty"><td colspan="9">' + T('還沒有紀錄：白煙環出現時會自動記下。', 'No measurements yet: each ring is recorded when it appears.') + '</td></tr>';
      list.forEach(function (r) {
        const d = r.data;
        h += '<tr><td>' + r.id + '</td><td class="l">' + fH(d.base) + '／' + (d.unknown ? 'HX' : fH(d.acid)) + '</td><td class="l">' + (d.model === 'air' ? T('空氣', 'air') : T('格雷厄姆', 'Graham')) +
          '</td><td>' + num(d.T, 0) + '</td><td>' + num(d.L, 1) + '</td><td>' + num(d.t / 60, 1) + '</td><td>' + num(d.x, 1) + '</td><td>' + num(d.ratio, 3) + '</td><td>' + (d.graham ? num(d.graham, 3) : '?') + '</td></tr>';
      });
    } else {
      h = '<thead><tr><th>#</th><th class="l">A／B</th><th>T<sub>A</sub>／T<sub>B</sub><br><small>K</small></th><th>d<br><small>µm</small></th><th>P<sub>0</sub><br><small>Pa</small></th>' +
        '<th>t½(A)<br><small>s</small></th><th>t½(B)<br><small>s</small></th><th>t<sub>B</sub>/t<sub>A</sub></th><th>' + T('理論', 'theory') + '</th></tr></thead><tbody>';
      if (!list.length) h += '<tr class="empty"><td colspan="9">' + T('還沒有紀錄：兩個容器都降到一半時會自動記下。', 'No measurements yet: each run is recorded when both containers reach half pressure.') + '</td></tr>';
      list.forEach(function (r) {
        const d = r.data;
        h += '<tr><td>' + r.id + '</td><td class="l">' + fH(d.A) + '／' + (d.unknown ? 'X' : fH(d.B)) + '</td><td>' + num(d.TA, 0) + '／' + num(d.TB, 0) + '</td><td>' + num(d.d, 0) + '</td><td>' + sigf(d.P0, 2) +
          '</td><td>' + sigf(d.tA, 5) + '</td><td>' + sigf(d.tB, 5) + '</td><td>' + num(d.ratio, 4) + '</td><td>' + (d.MB ? num(Math.sqrt(d.MB * d.TA / (d.MA * d.TB)), 4) : '?') + '</td></tr>';
      });
    }
    el.innerHTML = h + '</tbody>';
  }

  // ======================= 圖表 =======================
  const gcv = $('gcv'), gtx = gcv.getContext('2d');
  let GW = 600, GH = 320, gdpr = 1;
  function resizeGraph() {
    GW = gcv.clientWidth || 600; GH = 320;
    gdpr = Math.min(window.devicePixelRatio || 1, 2.5);
    gcv.width = Math.round(GW * gdpr); gcv.height = Math.round(GH * gdpr);
  }
  function niceStep(span, n) {
    const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }
  function axes(c, box, xr, yr, xlab, ylab, xfmt, yfmt) {
    const sx = function (x) { return box.x + (x - xr[0]) / (xr[1] - xr[0]) * box.w; };
    const sy = function (y) { return box.y + box.h - (y - yr[0]) / (yr[1] - yr[0]) * box.h; };
    c.save();
    c.fillStyle = LD.alpha(col.surface, col.dark ? 0.25 : 0.6);
    c.fillRect(box.x, box.y, box.w, box.h);
    const xs = niceStep(xr[1] - xr[0], GW < 500 ? 4 : 7), ys = niceStep(yr[1] - yr[0], 5);
    c.strokeStyle = LD.alpha(col.text, col.dark ? 0.1 : 0.09); c.lineWidth = 1;
    c.font = '11px ' + FONT; c.fillStyle = col.muted;
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let x = Math.ceil(xr[0] / xs) * xs; x <= xr[1] + 1e-9; x += xs) {
      const px = Math.round(sx(x)) + 0.5;
      c.beginPath(); c.moveTo(px, box.y); c.lineTo(px, box.y + box.h); c.stroke();
      c.fillText(xfmt ? xfmt(x) : num(x, xs < 1 ? 1 : 0), px, box.y + box.h + 4);
    }
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let y = Math.ceil(yr[0] / ys) * ys; y <= yr[1] + 1e-9; y += ys) {
      const py = Math.round(sy(y)) + 0.5;
      c.beginPath(); c.moveTo(box.x, py); c.lineTo(box.x + box.w, py); c.stroke();
      c.fillText(yfmt ? yfmt(y) : num(y, ys < 0.1 ? 2 : ys < 1 ? 1 : 0), box.x - 5, py);
    }
    c.strokeStyle = LD.alpha(col.text, 0.5);
    c.beginPath(); c.moveTo(box.x + 0.5, box.y); c.lineTo(box.x + 0.5, box.y + box.h + 0.5); c.lineTo(box.x + box.w, box.y + box.h + 0.5); c.stroke();
    c.restore();
    LD.haloText(c, xlab, box.x + box.w, box.y + box.h + 30, col.muted, 'right', 'alphabetic', '12px ' + FONT);
    LD.haloText(c, ylab, box.x, box.y - 8, col.muted, 'left', 'alphabetic', '12px ' + FONT);
    return { sx: sx, sy: sy };
  }
  function curve(c, f, x0, x1, n, sx, sy, color, width, dash, fill, ybase) {
    c.save();
    c.beginPath();
    for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, y = f(x); if (i) c.lineTo(sx(x), sy(y)); else c.moveTo(sx(x), sy(y)); }
    if (fill) {
      c.lineTo(sx(x1), sy(ybase || 0)); c.lineTo(sx(x0), sy(ybase || 0)); c.closePath();
      c.fillStyle = fill; c.fill();
      c.beginPath();
      for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, y = f(x); if (i) c.lineTo(sx(x), sy(y)); else c.moveTo(sx(x), sy(y)); }
    }
    c.strokeStyle = color; c.lineWidth = width || 2; c.lineJoin = 'round'; c.lineCap = 'round';
    if (dash) c.setLineDash(dash);
    c.stroke();
    c.restore();
  }
  function legend(items) {
    $('gLegend').innerHTML = items.map(function (it) {
      if (!it.c) return '<span>' + it.t + '</span>';
      return '<span><i class="' + (it.dot ? 'dot' : 'ln' + (it.dash ? ' dash' : '')) + '" style="' + (it.dash ? 'color:' : 'background:') + it.c + '"></i>' + it.t + '</span>';
    }).join('');
  }
  function drawGraph() {
    if (!GW) return;
    const c = gtx;
    c.setTransform(gdpr, 0, 0, gdpr, 0, 0);
    LD.backdrop(c, GW, GH);
    const box = { x: 52, y: 26, w: GW - 52 - 16, h: GH - 26 - 46 };
    const hint = $('gHint');
    if ((state.mode === 'diff' && !dr) || (state.mode === 'eff' && !er)) return;
    if (state.tab === 'prof' && state.mode === 'diff') {
      const L = dr.o.L, t = dr.t;
      const a = axes(c, box, [0, L], [0, 1.05], T('距鹼端 x（cm）', 'distance from base end x (cm)'), T('相對濃度', 'relative concentration'));
      if (t > 0) {
        const fa = function (x) { return G.conc(x, t, dr.rg.DA, true, L); }, fb = function (x) { return G.conc(x, t, dr.rg.DB, false, L); };
        curve(c, fa, 0, L, 200, a.sx, a.sy, gasColor(dr.o.base), 2.2, null, LD.alpha(gasColor(dr.o.base), 0.12));
        curve(c, fb, 0, L, 200, a.sx, a.sy, gasColor(dr.o.acid), 2.2, null, LD.alpha(gasColor(dr.o.acid), 0.12));
        if (dr.ringSeen) curve(c, function (x) { return G.deposit(x, t, dr.rg, L); }, 0, L, 300, a.sx, a.sy, col.dark ? '#e8edf2' : '#6b7682', 2, [5, 3], LD.alpha(col.dark ? '#ffffff' : '#8a96a3', 0.18));
        c.save(); c.strokeStyle = col.accent; c.setLineDash([4, 4]); c.lineWidth = 1.2;
        const xm = a.sx(dr.rg.x);
        c.beginPath(); c.moveTo(xm, box.y); c.lineTo(xm, box.y + box.h); c.stroke(); c.restore();
        LD.pill(c, dr.ringSeen ? T('白煙環', 'ring') : T('相遇點', 'meeting point'), xm, box.y + 16, col.accent, 'center', '600 11px ' + FONT);
      } else LD.haloText(c, T('按「開始」後出現兩種氣體的濃度曲線', 'The concentration curves appear after “Start”'), box.x + box.w / 2, box.y + box.h / 2, col.muted, 'center', 'middle', '13px ' + FONT);
      LD.pill(c, 't = ' + clock(t), box.x + box.w - 4, box.y + 16, col.text, 'right', '600 11px ' + FONT);
      legend([{ c: gasColor(dr.o.base), t: fH(dr.o.base) }, { c: gasColor(dr.o.acid), t: isUnk(dr.o.acid) ? 'HX' : fH(dr.o.acid) }, { c: col.dark ? '#e8edf2' : '#6b7682', t: T('白煙（示意）', 'white smoke (illustrative)'), dash: true }]);
      hint.textContent = T('曲線是兩種氣體各自從管端擴散的濃度 erfc(x/2√(Dt))；虛線是兩者第一次相遇的地方，白煙環在這裡出現。',
        'The curves are the concentrations of the two gases spreading from the ends, erfc(x/2√(Dt)); the dashed line is where they first meet, and where the ring appears.');
    } else if (state.tab === 'ring' && state.mode === 'diff') {
      const a = axes(c, box, [0.8, 3.0], [0.4, 0.8], T('√(M酸 / M鹼)', '√(M acid / M base)'), T('白煙環位置 x鹼 / L', 'ring position x base / L'), null, function (y) { return num(y, 2); });
      curve(c, function (q) { return q / (1 + q); }, 0.8, 3.0, 120, a.sx, a.sy, col.accent, 2, null);
      c.save(); c.strokeStyle = LD.alpha(col.text, 0.35); c.setLineDash([3, 4]); c.beginPath(); c.moveTo(box.x, a.sy(0.5)); c.lineTo(box.x + box.w, a.sy(0.5)); c.stroke(); c.restore();
      LD.haloText(c, T('正中央', 'middle'), box.x + 6, a.sy(0.5) - 5, col.muted, 'left', 'alphabetic', '11px ' + FONT);
      LD.haloText(c, T('格雷厄姆：q/(1+q)', 'Graham: q/(1+q)'), a.sx(2.2), a.sy(2.2 / 3.2) - 10, col.accent, 'center', 'alphabetic', '600 12px ' + FONT);
      records.filter(function (r) { return r.kind === 'diff' && !r.data.unknown; }).forEach(function (r) {
        const d = r.data, x = a.sx(d.graham), y = a.sy(d.frac), cc = gasColor(d.acid);
        if (d.model === 'air') { c.save(); c.strokeStyle = cc; c.lineWidth = 2.2; c.fillStyle = col.bg; c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 6, y); c.lineTo(x, y + 6); c.lineTo(x - 6, y); c.closePath(); c.fill(); c.stroke(); c.restore(); }
        else LD.ball(c, x, y, 5, cc, { shadow: false });
      });
      legend([{ c: col.accent, t: T('格雷厄姆的預測', 'Graham prediction') }, { c: col.muted, t: T('格雷厄姆模型', 'Graham model'), dot: true }, { t: T('◇ 在空氣中擴散（顏色代表酸）', '◇ diffusion in air (colour shows the acid)') }]);
      hint.textContent = T('每次白煙環出現，就在圖上記一點。理想模型的點落在曲線上；在空氣中擴散的點比較靠近正中央。',
        'Each ring adds a point. Points from the ideal model lie on the curve; points from diffusion in air are closer to the middle.');
    } else if (state.tab === 'pres' && state.mode === 'eff') {
      const tEnd = er.tEnd;
      const sc = tEnd > 7200 ? 3600 : tEnd > 180 ? 60 : 1, un = sc === 3600 ? T('小時', 'h') : sc === 60 ? T('分', 'min') : 's';
      const a = axes(c, box, [0, tEnd / sc], [0, 1.05], T('時間 t（' + un + '）', 'time t (' + un + ')'), '');
      // 縱軸標題 P/P0（0 是下標）
      LD.haloText(c, 'P / P', box.x, box.y - 8, col.muted, 'left', 'alphabetic', '12px ' + FONT);
      c.font = '12px ' + FONT;
      LD.haloText(c, '0', box.x + c.measureText('P / P').width + 0.5, box.y - 5, col.muted, 'left', 'alphabetic', '9px ' + FONT);
      c.save(); c.strokeStyle = LD.alpha(col.text, 0.4); c.setLineDash([4, 4]); c.beginPath(); c.moveTo(box.x, a.sy(0.5)); c.lineTo(box.x + box.w, a.sy(0.5)); c.stroke(); c.restore();
      const tn = er.t;
      [[er.tauA, col.A, er.hA, er.gotA, 1], [er.tauB, col.B, er.hB, er.gotB, -1]].forEach(function (p) {
        curve(c, function (x) { return Math.exp(-x * sc / p[0]); }, 0, tEnd / sc, 200, a.sx, a.sy, LD.alpha(p[1], 0.35), 1.5, [3, 3]);
        if (tn > 0) curve(c, function (x) { return Math.exp(-x * sc / p[0]); }, 0, Math.min(tn, tEnd) / sc, 200, a.sx, a.sy, p[1], 2.4);
        if (p[3]) { LD.ball(c, a.sx(p[2] / sc), a.sy(0.5), 4.5, p[1], { shadow: false }); LD.pill(c, 't½ = ' + sigf(p[2], 4) + ' s', a.sx(p[2] / sc) + 6, a.sy(0.5) + (p[4] > 0 ? 24 : -10), p[1], 'left', '600 11px ' + FONT); }
      });
      c.save(); c.strokeStyle = col.accent; c.lineWidth = 1; c.beginPath(); c.moveTo(a.sx(tn / sc), box.y); c.lineTo(a.sx(tn / sc), box.y + box.h); c.stroke(); c.restore();
      legend([{ c: col.A, t: 'A ' + fH(er.A) }, { c: col.B, t: 'B ' + (isUnk(er.B) ? 'X' : fH(er.B)) }, { c: col.muted, t: T('虛線：之後的走向', 'dashed: what comes next'), dash: true }]);
      hint.innerHTML = T('P = P<sub>0</sub> e<sup>−t/τ</sup>：每過一個半衰時間 t½ = τ ln 2，壓力就再減半。', 'P = P<sub>0</sub> e<sup>−t/τ</sup>: every half-time t½ = τ ln 2 the pressure halves again.');
    } else {
      // 速率分布
      const gs = state.mode === 'diff' ?
        [[state.base, state.T, gasColor(state.base)], [state.acid, state.T, gasColor(state.acid)], ['air', state.T, col.air]] :
        [[state.gA, state.TA, col.A], [state.gB, state.TB, col.B]];
      let vmax = 0, fmax = 0;
      gs.forEach(function (g) {
        if (isUnk(g[0])) return;
        const Mg = g[0] === 'air' ? G.M_AIR : G.M(g[0]);
        vmax = Math.max(vmax, 3.2 * G.mpSpeed(Mg, g[1]));
        fmax = Math.max(fmax, G.maxwell(G.mpSpeed(Mg, g[1]), Mg, g[1]));
      });
      vmax = Math.min(vmax, 5000);
      const a = axes(c, box, [0, vmax], [0, fmax * 1.12 * 1000], T('速率 v（m/s）', 'speed v (m/s)'), T('f(v)（每 1000 m/s）', 'f(v) (per 1000 m/s)'));
      gs.forEach(function (g) {
        if (isUnk(g[0])) return;
        const Mg = g[0] === 'air' ? G.M_AIR : G.M(g[0]);
        curve(c, function (v) { return 1000 * G.maxwell(v, Mg, g[1]); }, 0, vmax, 220, a.sx, a.sy, g[2], 2.2, g[0] === 'air' ? [5, 4] : null, g[0] === 'air' ? null : LD.alpha(g[2], 0.1));
        const vb = G.meanSpeed(Mg, g[1]);
        if (vb < vmax) {
          c.save(); c.strokeStyle = g[2]; c.setLineDash([2, 3]); c.lineWidth = 1.2; c.beginPath(); c.moveTo(a.sx(vb), a.sy(1000 * G.maxwell(vb, Mg, g[1]))); c.lineTo(a.sx(vb), box.y + box.h); c.stroke(); c.restore();
          LD.pill(c, 'v̄ ' + num(vb, 0), a.sx(vb), a.sy(1000 * G.maxwell(vb, Mg, g[1])) - 6, g[2], 'center', '600 11px ' + FONT);
        }
      });
      const lab = function (g) { return g[0] === 'air' ? T('空氣', 'air') : isUnk(g[0]) ? g[0] + T('（未知，不畫）', ' (unknown, not drawn)') : fH(g[0]) + (GAS[g[0]].iso ? ' U-' + GAS[g[0]].iso : '') + ' · ' + num(g[1], 0) + ' K'; };
      legend(gs.map(function (g) { return { c: g[2], t: lab(g), dash: g[0] === 'air' }; }));
      hint.textContent = T('馬克士威速率分布：同溫時越輕的分子分布越寬、越偏向高速；虛線標出平均速率 v̄ = √(8RT/πM)。',
        'Maxwell speed distribution: at the same temperature, lighter molecules spread to higher speeds; the dotted lines mark the mean speed v̄ = √(8RT/πM).');
    }
  }

  // ======================= 3D 檢視 =======================
  let threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
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
      T: T, host: host3,
      mode: function () { return state.mode; },
      colors: function () { return col; }, gasColor: gasColor, MOL: MOL, ATOM_R: ATOM_R,
      tube: function () { return dr ? { L: dr.o.L, base: dr.o.base, acid: dr.o.acid, t: dr.t, ring: dr.ringSeen ? dr.rg : null, amp: dr.ringSeen ? G.deposit(dr.rg.x, dr.t, dr.rg, dr.o.L) : 0, wet: started, lensU: state.lensU } : null; },
      dots: dots,
      eff: function () { return er ? { A: er.A, B: er.B, PA: G.effP(1, er.t, er.tauA), PB: G.effP(1, er.t, er.tauB), TA: er.TA, TB: er.TB } : null; },
      cham: function () { return cham; }, escaping: function () { return escaping; },
      tempTint: tempTint,
      hud: function () {
        if (state.mode === 'diff') return { tl: 't = ' + clock(dr ? dr.t : 0) + (running || (dr && dr.done) ? '' : started ? T('（已暫停）', ' (paused)') : ''), tr: (dr && dr.ringSeen ? T('白煙環：距鹼端 ', 'Ring: ') + num(dr.rg.x, 1) + T(' cm', ' cm from the base end') : num(state.T, 0) + ' K · L = ' + num(state.L, 0) + ' cm') };
        return { tl: 't = ' + clock(er ? er.t : 0), tr: er ? 'P(A) ' + sigf(G.effP(er.P0, er.t, er.tauA), 3) + ' Pa · P(B) ' + sigf(G.effP(er.P0, er.t, er.tauB), 3) + ' Pa' : '' };
      },
      running: function () { return running || !reducedMotion; },
      contextLost: function () { setView('2d'); viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.'); }
    };
  }
  function setPressed(m) { $('view2d').setAttribute('aria-pressed', String(m === '2d')); $('view3d').setAttribute('aria-pressed', String(m === '3d')); }
  function setView(m) {
    if (m === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable() || !window.Gd3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        state.view = '3d';
        view3 = window.Gd3D.create(lib, host3Api());
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        view3.frame();
        startLoop();
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
      resize();
      startLoop();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    state.view = '2d';
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { acted(); setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ======================= 拖曳放大鏡、鍵盤 =======================
  let drag = false, kb = null;
  function canvasXY(ev) { const b = cv.getBoundingClientRect(); return [ev.clientX - b.left, ev.clientY - b.top]; }
  function onTube(x, y) { return state.mode === 'diff' && Lay && Math.abs(y - Lay.yt) < Lay.rt + 16 && x > Lay.X0 - 10 && x < Lay.X1 + 10; }
  function moveLens(x) { state.lensU = clamp((x - Lay.X0) / (Lay.X1 - Lay.X0), 0.01, 0.99); lastComp = 0; requestDraw(); }
  cv.addEventListener('pointerdown', function (ev) {
    const p = canvasXY(ev);
    if (!onTube(p[0], p[1])) return;
    acted();
    drag = true; moveLens(p[0]);
    cv.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  cv.addEventListener('pointermove', function (ev) {
    const p = canvasXY(ev);
    if (!drag) { cv.style.cursor = onTube(p[0], p[1]) ? 'ew-resize' : ''; return; }
    moveLens(p[0]);
  });
  function endDrag() { drag = false; }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('玻璃管與分子放大鏡。左右方向鍵移動放大鏡，Shift 加方向鍵移動得更多。', 'Glass tube and molecular magnifier. The left and right arrow keys move the magnifier; hold Shift for bigger steps.'),
      items: [{
        name: function () { return T('放大鏡', 'Magnifier'); },
        move: function (dx, dy, big) {
          const d = dx || -dy;
          if (!d || state.mode !== 'diff') return false;
          acted();
          state.lensU = clamp(state.lensU + d * (big ? 0.1 : 0.02), 0.01, 0.99); lastComp = 0;
          return true;
        },
        describe: function () { const x = state.lensU * (dr ? dr.o.L : state.L), c = concAt(x); return 'x = ' + num(x, 1) + ' cm · ' + GAS[dr ? dr.o.base : state.base].f + ' ' + num(c[0], 2) + ' · ' + (isUnk(state.acid) ? 'HX' : GAS[state.acid].f) + ' ' + num(c[1], 2); }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  function refreshAll() {
    refreshOutputs();
    updateReadouts();
    renderTable();
    stageHint();
    drawGraph();
    requestDraw();
  }
  function themeChanged() {
    if (LD.refresh) LD.refresh();
    readColors();
    refreshAll();
    if (view3 && view3.active) view3.onTheme();
  }
  window.addEventListener('lab:themechange', themeChanged);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) startLoop(); });
  if (window.ResizeObserver) {
    let lw = 0, lg = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); drawGraph(); } }).observe(gcv);
  } else window.addEventListener('resize', function () { resize(); resizeGraph(); drawGraph(); });

  // 測試用（Playwright）：讀取目前狀態
  window.__gd = {
    state: state, dr: function () { return dr; }, er: function () { return er; }, records: function () { return records; }, unk: function () { return unk; },
    running: function () { return running; }, started: function () { return started; }, mols: function () { return mols.length; }
  };

  // ======================= 啟動 =======================
  readColors();
  fillSelect(elA, state.gA, false);
  fillSelect(elB, state.gB, false);
  setVal(elP, state.P0);
  resetRun();
  updateSoundButton();
  updateUnknownCard();
  resizeGraph();
  resize();
  refreshAll();
  setStatus('');
  startLoop();
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：分子的動畫已關閉，實驗照常可以做。', 'Reduced motion is on: the molecular animation is off, but the experiment works as usual.'));
})();
