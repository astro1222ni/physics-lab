/*
 * gibbs-free-energy.js — 「自由能與自發性」的頁面程式（粒子示意、能量圖、圖表、紀錄表、未知反應、任務事件）
 * 化學核心在 js/gibbs-free-energy-core.js（GibbsCore）。畫面上的粒子只是示意（數目依係數、快慢隨 √T），
 * ΔH°、ΔS°、ΔG°、K 都直接來自核心的計算；能量圖依比例畫出。
 *
 * 任務事件（只在使用者按下按鈕時送出）：
 *   'record'：按「記錄這一點」{ rx, mode, T, dH, dS, dG, lnK, log10K, K, valid, seg, earlier（同一段較早的紀錄） }
 *   'answer'：未知反應按「核對答案」{ errH, errS, nT, tries, revealed }
 */
(function () {
  'use strict';
  const C = window.GibbsCore, LD = window.LabDraw;
  if (!C || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const reducedMotion = LD.reducedMotion();

  // ======================= 數字格式 =======================
  function num(x, d) {
    if (x == null || !isFinite(x)) return '—';
    const s = (+x).toFixed(d == null ? 0 : d);
    return s.charAt(0) === '-' ? (/^-0(\.0*)?$/.test(s) ? s.slice(1) : '−' + s.slice(1)) : s;
  }
  function sgn(x, d) { const s = num(x, d); return x > 0 && s !== num(0, d) ? '+' + s : s; }
  /** 溫度：最多兩位小數，去掉多餘的 0 */
  function tK(x) { return num(x, 2).replace(/\.?0+$/, ''); }
  /** K 的 HTML（由 log10K 算，不溢位） */
  function kHTML(lg, sig) {
    if (!isFinite(lg)) return '—';
    if (lg > -3 && lg < 4) return sigf(Math.pow(10, lg), sig || 3);
    const p = C.sciFromLog(lg, sig || 3);
    return p.m + ' × 10<sup>' + num(p.e, 0) + '</sup>';
  }
  function kParts(lg, sig) {
    if (lg > -3 && lg < 4) return { m: sigf(Math.pow(10, lg), sig || 3), e: null };
    const p = C.sciFromLog(lg, sig || 3);
    return { m: p.m, e: num(p.e, 0) };
  }
  function sigf(x, sig) {
    if (x == null || !isFinite(x)) return '—';
    if (x === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(x)));
    return num(x, Math.max(0, Math.min(6, (sig || 3) - 1 - e)));
  }

  // ======================= 物種與反應的顯示 =======================
  const SPNAME = {
    'C(dia)': ['C(s，鑽石)', 'C(s, diamond)'], 'C(gr)': ['C(s，石墨)', 'C(s, graphite)']
  };
  /** 物種代號 → HTML（數字下標、電荷上標） */
  function fH(key) {
    if (SPNAME[key]) return T(SPNAME[key][0], SPNAME[key][1]);
    const m = /^([^(]+)(\(.*\))?$/.exec(key);
    let f = m[1], ph = m[2] || '';
    let chg = '';
    const c = /([+-])$/.exec(f);
    if (c) { chg = c[1] === '+' ? '+' : '−'; f = f.slice(0, -1); }
    f = f.replace(/([A-Za-z)])(\d+)/g, '$1<sub>$2</sub>');
    return f + (chg ? '<sup>' + chg + '</sup>' : '') + ph;
  }
  /** 物種代號 → 畫布用的片段 [文字, 位置]（0 正常、−1 下標、1 上標） */
  function fP(key) {
    if (SPNAME[key]) return [[T(SPNAME[key][0], SPNAME[key][1]), 0]];
    const m = /^([^(]+)(\(.*\))?$/.exec(key);
    let f = m[1];
    const ph = m[2] || '';
    const out = [];
    let chg = '';
    const c = /([+-])$/.exec(f);
    if (c) { chg = c[1] === '+' ? '+' : '−'; f = f.slice(0, -1); }
    f.replace(/([A-Za-z]+)(\d*)/g, function (all, a, d) { out.push([a, 0]); if (d) out.push([d, -1]); return all; });
    if (chg) out.push([chg, 1]);
    if (ph) out.push([ph, 0]);
    return out;
  }
  const RXNAME = {
    vap: ['水的汽化', 'Water vaporises'], nh4cl: ['氯化銨溶解', 'NH4Cl dissolves'], n2o4: ['N2O4 解離', 'N2O4 splits'],
    caco3: ['石灰石分解', 'Limestone breaks down'], haber: ['合成氨', 'Making ammonia'], so3: ['接觸法', 'Contact process'],
    h2o2: ['雙氧水分解', 'H2O2 decomposes'], diamond: ['鑽石變石墨', 'Diamond to graphite'], ozone: ['氧變成臭氧', 'Oxygen to ozone'],
    custom: ['自訂反應', 'Custom reaction'], mys: ['未知反應', 'Unknown reaction']
  };
  function rxName(id) { const n = RXNAME[id]; return n ? T(n[0], n[1]) : id; }
  /** 反應名稱拆成畫布用的富文字片段（化學式的數字畫成下標） */
  function nameParts(id) {
    const out = []; let cur = '', sub = false, prev = '';
    for (const ch of rxName(id)) {
      const isSub = /\d/.test(ch) && (sub || /[A-Za-z)]/.test(prev));
      if (isSub !== sub) { if (cur) out.push([cur, sub ? -1 : 0]); cur = ''; sub = isSub; }
      cur += ch; prev = ch;
    }
    if (cur) out.push([cur, sub ? -1 : 0]);
    return out;
  }
  function rxNameHTML(id) { return rxName(id).replace(/([A-Za-z)])(\d+)/g, '$1<sub>$2</sub>'); }
  /** 方程式 HTML */
  function eqHTML(id) {
    if (id === 'custom') return T('反應物 → 生成物（自訂）', 'reactants → products (custom)');
    if (id === 'mys') return 'A(g) → B(g)';
    const r = C.RX[id];
    const side = function (sg) {
      return r.sp.filter(function (p) { return p[1] * sg > 0; }).map(function (p) { const a = Math.abs(p[1]); return (a > 1 ? a + ' ' : '') + fH(p[0]); }).join(' + ');
    };
    return side(-1) + ' → ' + side(1);
  }
  /** 方程式畫布片段 */
  function eqParts(id) {
    if (id === 'custom') return [[T('反應物 → 生成物（自訂 ΔH°、ΔS°）', 'reactants → products (custom ΔH°, ΔS°)'), 0]];
    if (id === 'mys') return [[T('未知反應 A(g) → B(g)', 'Unknown reaction A(g) → B(g)'), 0]];
    const r = C.RX[id], out = [];
    const side = function (sg) {
      let first = true;
      r.sp.forEach(function (p) {
        if (p[1] * sg <= 0) return;
        if (!first) out.push([' + ', 0]);
        first = false;
        const a = Math.abs(p[1]);
        if (a > 1) out.push([a + ' ', 0]);
        fP(p[0]).forEach(function (q) { out.push(q); });
      });
    };
    side(-1); out.push(['  →  ', 0]); side(1);
    return out;
  }

  // ======================= 粒子（示意） =======================
  // 分子由原子小球組成：[原子, x, y]（以原子半徑單位 r0 計）
  const MOL = {
    H2O: [['O', 0, -0.15], ['H', -0.85, 0.5], ['H', 0.85, 0.5]],
    H2O2: [['O', -0.55, 0], ['O', 0.55, 0], ['H', -1.15, -0.7], ['H', 1.15, 0.7]],
    O2: [['O', -0.55, 0], ['O', 0.55, 0]],
    O3: [['O', 0, -0.4], ['O', -1.0, 0.35], ['O', 1.0, 0.35]],
    SO2: [['S', 0, -0.2], ['O', -1.25, 0.5], ['O', 1.25, 0.5]],
    SO3: [['S', 0, 0], ['O', 0, -1.35], ['O', -1.17, 0.68], ['O', 1.17, 0.68]],
    N2: [['N', -0.6, 0], ['N', 0.6, 0]],
    H2: [['H', -0.42, 0], ['H', 0.42, 0]],
    NH3: [['N', 0, 0.12], ['H', 0, -1.05], ['H', -0.95, 0.62], ['H', 0.95, 0.62]],
    NO2: [['N', 0, -0.2], ['O', -1.15, 0.5], ['O', 1.15, 0.5]],
    N2O4: [['N', -0.78, 0], ['N', 0.78, 0], ['O', -1.5, -0.95], ['O', -1.5, 0.95], ['O', 1.5, -0.95], ['O', 1.5, 0.95]],
    CO2: [['C', 0, 0], ['O', -1.2, 0], ['O', 1.2, 0]],
    NH4: [['N', 0, 0], ['H', -0.78, -0.78], ['H', 0.78, -0.78], ['H', -0.78, 0.78], ['H', 0.78, 0.78]],
    Cl: [['Cl', 0, 0]],
    Ca: [['Ca', 0, 0]],
    Ox: [['O', 0, 0]],
    CO3: [['C', 0, 0], ['O', 0, -1.15], ['O', -1.0, 0.58], ['O', 1.0, 0.58]],
    C: [['C', 0, 0]],
    A: [['A', -0.6, 0], ['A', 0.6, 0]],
    B: [['B', 0, 0], ['B', 1.05, 0.25]]
  };
  const ATOM_R = { H: 0.58, O: 0.9, N: 1, S: 1.25, C: 0.95, Ca: 1.3, Cl: 1.2, A: 1.0, B: 1.0 };
  // 每一邊的粒子群：{ m（MOL 的代號）, ph（g／l／s／aq）, n（個數）, lat（晶格種類） }
  const SCENE = {
    vap: [[{ m: 'H2O', ph: 'l', n: 9 }], [{ m: 'H2O', ph: 'g', n: 9 }]],
    nh4cl: [[{ m: 'NH4', ph: 's', n: 8, lat: 'ion', with: 'Cl' }], [{ m: 'NH4', ph: 'aq', n: 8 }, { m: 'Cl', ph: 'aq', n: 8 }]],
    n2o4: [[{ m: 'N2O4', ph: 'g', n: 5 }], [{ m: 'NO2', ph: 'g', n: 10 }]],
    caco3: [[{ m: 'Ca', ph: 's', n: 6, lat: 'ion', with: 'CO3' }], [{ m: 'Ca', ph: 's', n: 6, lat: 'ion', with: 'Ox' }, { m: 'CO2', ph: 'g', n: 6 }]],
    haber: [[{ m: 'N2', ph: 'g', n: 3 }, { m: 'H2', ph: 'g', n: 9 }], [{ m: 'NH3', ph: 'g', n: 6 }]],
    so3: [[{ m: 'SO2', ph: 'g', n: 6 }, { m: 'O2', ph: 'g', n: 3 }], [{ m: 'SO3', ph: 'g', n: 6 }]],
    h2o2: [[{ m: 'H2O2', ph: 'l', n: 6 }], [{ m: 'H2O', ph: 'l', n: 6 }, { m: 'O2', ph: 'g', n: 3 }]],
    diamond: [[{ m: 'C', ph: 's', n: 15, lat: 'dia' }], [{ m: 'C', ph: 's', n: 15, lat: 'gr' }]],
    ozone: [[{ m: 'O2', ph: 'g', n: 9 }], [{ m: 'O3', ph: 'g', n: 6 }]],
    custom: [[{ m: 'A', ph: 'g', n: 7 }], [{ m: 'B', ph: 'g', n: 7 }]],
    mys: [[{ m: 'A', ph: 'g', n: 7 }], [{ m: 'B', ph: 'g', n: 7 }]]
  };

  let col = {};
  function readColors() {
    const c = LD.c, dk = LD.dark;
    col = {
      text: c.text, muted: c.muted, border: c.border, grid: c.grid, accent: c.accent, bg: c['canvas-bg'], surface: c.surface,
      pos: c.pos || '#d1453b', neg: c.neg || '#2f6fd0', probe: c.probe || '#0d7f57', field: c.field || '#8a5cd0', dark: dk,
      atom: { H: dk ? '#e8ecf0' : '#d3d9e0', O: '#e0483a', N: '#3f6fd6', S: '#e2b71f', C: dk ? '#7c8692' : '#4b525c', Ca: '#3fae7a', Cl: '#7cc243', A: '#8a5cd0', B: '#e08a1e' },
      water: dk ? 'rgba(80,150,230,0.20)' : 'rgba(70,140,220,0.15)',
      dH: dk ? '#e0705f' : '#c8432f', TdS: dk ? '#b48cf0' : '#7a4cc4'
    };
  }
  /** 溫度的顏色：100 K 深藍、298 K 中性、1500 K 橘紅 */
  function tempColor(Tk) {
    if (Tk <= 298) return LD.mix('#2f6fd6', col.muted, Math.max(0, Math.min(1, (Tk - 100) / 198)));
    return LD.mix(col.muted, '#e2562c', Math.max(0, Math.min(1, (Tk - 298) / 900)));
  }

  // ======================= 狀態 =======================
  const state = { rx: 'vap', T: 298.15, cH: 20, cS: 50, tab: 'dg', showAll: false, sweeping: false };
  let mys = null, mysSeq = 0;             // { id, dH, dS, revealed, tries }
  let prevRx = 'vap';                     // 未知反應結束後回到的反應
  let rows = [], rowSeq = 0, segId = 0;
  let userActed = false;
  let lastVerdict = null, flashT0 = -1e9, lastCrossSnd = 0;
  let syncing = false;

  function isMys() { return state.rx === 'mys'; }
  function isCustom() { return state.rx === 'custom'; }
  /** 目前反應的 ΔH°、ΔS°（未知反應用隱藏值） */
  function params() {
    if (isMys()) return { dH: mys.dH, dS: mys.dS, dn: 0, valid: [C.TMIN, C.TMAX] };
    if (isCustom()) return { dH: state.cH, dS: state.cS, dn: null, valid: [C.TMIN, C.TMAX] };
    const d = C.rxData(state.rx);
    return { dH: d.dH, dS: d.dS, dn: d.dn, valid: d.valid };
  }
  function now() {
    const p = params(), Tk = state.T;
    const g = C.dG(p.dH, p.dS, Tk);
    return { dH: p.dH, dS: p.dS, dn: p.dn, T: Tk, dG: g, TdS: C.TdS(p.dS, Tk), lnK: C.lnK(p.dH, p.dS, Tk), log10K: C.log10K(p.dH, p.dS, Tk),
      turn: C.turning(p.dH, p.dS), valid: Tk >= p.valid[0] - 1e-9 && Tk <= p.valid[1] + 1e-9, vr: p.valid, verdict: C.verdict(g) };
  }

  // ======================= 粒子模擬 =======================
  let parts = [[], []]; // 反應物、生成物兩個盒子
  function rnd(a, b) { return a + Math.random() * (b - a); }
  /** 依目前反應建立兩個盒子的粒子（座標 0–1，盒內） */
  function buildParts() {
    const sc = SCENE[state.rx];
    parts = sc.map(function (side) {
      const out = [];
      const hasCond = side.some(function (g) { return g.ph !== 'g'; });
      side.forEach(function (g) {
        if (g.ph === 's') {
          // 晶格：底部排成格子
          const cols = g.lat === 'dia' || g.lat === 'gr' ? 5 : 4;
          const n = g.lat === 'ion' ? g.n * 2 : g.n;
          const rowsN = Math.ceil(n / cols);
          for (let i = 0; i < n; i++) {
            const r = Math.floor(i / cols), c = i % cols;
            let hx, hy;
            if (g.lat === 'gr') { hx = 0.16 + c * 0.17 + (r % 2) * 0.085; hy = 0.9 - r * 0.2; }
            else if (g.lat === 'dia') { hx = 0.16 + c * 0.17 + (r % 2) * 0.085; hy = 0.9 - r * 0.115 - ((c + r) % 2) * 0.035; }
            else { hx = 0.2 + c * 0.2; hy = 0.88 - r * 0.15; }
            const m = g.lat === 'ion' ? ((r + c) % 2 ? g.with : g.m) : g.m;
            out.push({ m: m, ph: 's', hx: hx, hy: hy, x: hx, y: hy, a: g.lat === 'ion' && m === 'CO3' ? 0 : 0, va: 0, lat: g.lat, row: r, col: c });
          }
          void rowsN;
        } else if (g.ph === 'l') {
          for (let i = 0; i < g.n; i++) out.push({ m: g.m, ph: 'l', x: rnd(0.14, 0.86), y: rnd(0.66, 0.9), vx: 0, vy: 0, a: rnd(0, 6.28), va: rnd(-1, 1) });
        } else if (g.ph === 'aq') {
          for (let i = 0; i < g.n; i++) out.push({ m: g.m, ph: 'aq', x: rnd(0.12, 0.88), y: rnd(0.4, 0.9), vx: 0, vy: 0, a: rnd(0, 6.28), va: rnd(-1, 1) });
        } else {
          for (let i = 0; i < g.n; i++) {
            const ang = rnd(0, 6.28);
            out.push({ m: g.m, ph: 'g', x: rnd(0.12, 0.88), y: rnd(0.12, hasCond ? 0.55 : 0.88), vx: Math.cos(ang), vy: Math.sin(ang), a: rnd(0, 6.28), va: rnd(-2, 2) });
          }
        }
      });
      return out;
    });
  }
  /** 前進 dt 秒（示意：速度 ∝ √T） */
  function moveParts(dt) {
    const f = Math.sqrt(state.T / 298.15);
    parts.forEach(function (side) {
      const cond = side.some(function (p) { return p.ph !== 'g'; });
      side.forEach(function (p) {
        if (p.ph === 's') {
          const a = 0.006 * f;
          p.x = p.hx + rnd(-a, a); p.y = p.hy + rnd(-a, a);
          return;
        }
        if (p.ph === 'g') {
          const v = 0.22 * f;
          p.x += p.vx * v * dt; p.y += p.vy * v * dt;
          const ylo = 0.1, yhi = cond ? 0.56 : 0.9;
          if (p.x < 0.1) { p.x = 0.1; p.vx = Math.abs(p.vx); }
          if (p.x > 0.9) { p.x = 0.9; p.vx = -Math.abs(p.vx); }
          if (p.y < ylo) { p.y = ylo; p.vy = Math.abs(p.vy); }
          if (p.y > yhi) { p.y = yhi; p.vy = -Math.abs(p.vy); }
          p.a += p.va * dt * f;
          return;
        }
        // 液體、溶液：在自己的區域內隨機遊走
        const s = (p.ph === 'l' ? 0.05 : 0.09) * f;
        p.vx = 0.85 * p.vx + rnd(-1, 1) * s; p.vy = 0.85 * p.vy + rnd(-1, 1) * s;
        p.x += p.vx * dt; p.y += p.vy * dt;
        const ylo = p.ph === 'l' ? 0.66 : 0.4;
        if (p.x < 0.12) { p.x = 0.12; p.vx = Math.abs(p.vx); }
        if (p.x > 0.88) { p.x = 0.88; p.vx = -Math.abs(p.vx); }
        if (p.y < ylo) { p.y = ylo; p.vy = Math.abs(p.vy); }
        if (p.y > 0.9) { p.y = 0.9; p.vy = -Math.abs(p.vy); }
        p.a += p.va * dt * 0.5 * f;
      });
    });
  }

  // ======================= 畫布：版面 =======================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  const elT = $('temp'), elH = $('cH'), elS = $('cS');
  const statusEl = $('status');
  function val(el) { return window.LabNum ? window.LabNum.value(el) : +el.value; }
  function setVal(el, v) { syncing = true; try { if (window.LabNum) window.LabNum.set(el, v); else el.value = v; } finally { syncing = false; } }
  function fsz() { return (window.LabSettings && window.LabSettings.get('fs')) || 1; }

  let cw = 0, ch = 0, dpr = 1, G = null;
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = w;
    const wide = w >= 640;
    ch = wide ? 420 : Math.round(Math.max(520, Math.min(640, w * 1.45)));
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    layout();
    resizeGraph();
    drawAll();
  }
  function layout() {
    const wide = cw >= 640, pad = wide ? 16 : 10, fs = fsz();
    const top = Math.round(40 * fs);
    if (wide) {
      const lw = cw * 0.47;
      const bw = Math.min(150, (lw - pad - 44) / 2), bh = Math.min(200, ch * 0.5);
      const by = top + 26;
      G = { wide: true, pad: pad, top: top,
        box: [{ x: pad + 4, y: by, w: bw, h: bh }, { x: pad + 4 + bw + 44, y: by, w: bw, h: bh }],
        plateY: by + bh + 28 * fs, plateX0: pad + 4, plateX1: pad + 4 + 2 * bw + 44,
        en: { x0: lw + 18, x1: cw - pad, y0: top + 12, y1: ch - 26 } };
    } else {
      const bw = Math.min(160, (cw - 2 * pad - 40) / 2), bh = Math.min(150, ch * 0.26);
      const bx0 = (cw - (2 * bw + 40)) / 2, by = top + 30;
      const plateY = by + bh + 28 * fs;
      G = { wide: false, pad: pad, top: top,
        box: [{ x: bx0, y: by, w: bw, h: bh }, { x: bx0 + bw + 40, y: by, w: bw, h: bh }],
        plateY: plateY, plateX0: bx0, plateX1: bx0 + 2 * bw + 40,
        en: { x0: pad, x1: cw - pad, y0: plateY + 46 * fs, y1: ch - 22 } };
    }
  }

  // ======================= 畫布：文字工具 =======================
  /** 富文字（下標／上標），回傳寬度；align：left／center／right */
  function rich(g, ps, x, y, color, size, align, weight, halo) {
    const f0 = (weight || '') + ' ' + size + 'px ' + LD.FONT, f1 = (weight || '') + ' ' + (size * 0.7).toFixed(1) + 'px ' + LD.FONT;
    let w = 0;
    ps.forEach(function (p) { g.font = p[1] ? f1 : f0; w += g.measureText(p[0]).width; });
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    ps.forEach(function (p) {
      g.font = p[1] ? f1 : f0;
      const yy = y + (p[1] < 0 ? size * 0.28 : p[1] > 0 ? -size * 0.42 : 0);
      if (halo) { g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = LD.alpha(col.bg, 0.92); g.strokeText(p[0], cx, yy); }
      g.fillStyle = color; g.fillText(p[0], cx, yy);
      cx += g.measureText(p[0]).width;
    });
    return w;
  }
  function richW(g, ps, size, weight) {
    let w = 0;
    ps.forEach(function (p) { g.font = (weight || '') + ' ' + (p[1] ? (size * 0.7).toFixed(1) : size) + 'px ' + LD.FONT; w += g.measureText(p[0]).width; });
    return w;
  }
  /** 「K = 3.13 × 10^−2」：上標自己畫小字 */
  function kText(g, lg, x, y, color, size, align) {
    const p = kParts(lg, 3);
    const ps = [['K = ' + p.m + (p.e != null ? ' × 10' : ''), 0]];
    if (p.e != null) ps.push([p.e, 1]);
    return rich(g, ps, x, y, color, size, align, '600', true);
  }

  // ======================= 畫布：主畫面 =======================
  function drawStage() {
    if (!G) return;
    const g = ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(g, cw, ch);
    const s = now(), fs = fsz();
    // 方程式
    const eq = eqParts(state.rx);
    let size = Math.min(17, cw / 30) * 1;
    while (richW(g, eq, size, '600') > cw - 24 && size > 10) size -= 0.5;
    rich(g, eq, cw / 2, G.top - 12, col.text, size, 'center', '600', true);
    drawBoxes(g, s);
    drawPlate(g, s);
    drawEnergy(g, s);
    void fs;
  }
  function drawBoxes(g, s) {
    const lab = [T('反應物', 'Reactants'), T('生成物', 'Products')];
    G.box.forEach(function (b, i) {
      // 玻璃容器：圓角、內部淡色、左側高光
      g.save();
      LD.roundRect(g, b.x, b.y, b.w, b.h, 10);
      const gr = g.createLinearGradient(b.x, b.y, b.x + b.w, b.y);
      gr.addColorStop(0, LD.alpha(col.surface, col.dark ? 0.10 : 0.55));
      gr.addColorStop(0.5, LD.alpha(col.surface, col.dark ? 0.04 : 0.25));
      gr.addColorStop(1, LD.alpha(col.surface, col.dark ? 0.10 : 0.5));
      g.fillStyle = gr; g.fill();
      g.clip();
      // 液體、溶液的水
      const side = parts[i];
      const hasL = side.some(function (p) { return p.ph === 'l'; }), hasAq = side.some(function (p) { return p.ph === 'aq'; });
      if (hasL || hasAq) {
        const ly = b.y + b.h * (hasAq ? 0.33 : 0.6);
        const wg = g.createLinearGradient(0, ly, 0, b.y + b.h);
        const base = state.rx === 'h2o2' && i === 0 ? 'rgba(120,170,230,' : 'rgba(70,140,220,';
        wg.addColorStop(0, base + (col.dark ? 0.26 : 0.18) + ')');
        wg.addColorStop(1, base + (col.dark ? 0.36 : 0.30) + ')');
        g.fillStyle = wg;
        g.fillRect(b.x, ly, b.w, b.y + b.h - ly);
        // 彎月面
        g.strokeStyle = LD.alpha(col.dark ? '#9cc8ff' : '#3c7fd0', 0.55); g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(b.x, ly - 4); g.quadraticCurveTo(b.x + 8, ly, b.x + 16, ly); g.lineTo(b.x + b.w - 16, ly); g.quadraticCurveTo(b.x + b.w - 8, ly, b.x + b.w, ly - 4); g.stroke();
      }
      drawSide(g, b, side);
      g.restore();
      // 外框與高光
      LD.roundRect(g, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 10);
      g.strokeStyle = LD.alpha(col.text, col.dark ? 0.45 : 0.35); g.lineWidth = 1.5; g.stroke();
      g.strokeStyle = LD.alpha('#ffffff', col.dark ? 0.25 : 0.7); g.lineWidth = 2.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(b.x + 6, b.y + 14); g.lineTo(b.x + 6, b.y + b.h * 0.6); g.stroke();
      LD.pill(g, lab[i], b.x + b.w / 2, b.y - 4, col.muted, 'center', '600 ' + 12 + 'px ' + LD.FONT);
      if (isMys()) LD.haloText(g, '?', b.x + b.w - 14, b.y + 22, col.muted, 'center', 'alphabetic', '700 18px ' + LD.FONT);
    });
    // 中間的箭頭：自發時實心綠色、不自發時灰色虛線
    const b0 = G.box[0], b1 = G.box[1];
    const ax0 = b0.x + b0.w + 6, ax1 = b1.x - 6, ay = b0.y + b0.h / 2;
    const v = isMys() ? null : s.verdict;
    const c = v === 'yes' ? col.probe : v === 'no' ? LD.alpha(col.muted, 0.8) : col.accent;
    LD.arrow(g, ax0, ay, ax1, ay, c, 3, v === 'no' ? { dash: [4, 4] } : null);
    if (v === 'eq') LD.arrow(g, ax1, ay + 9, ax0, ay + 9, c, 2.2);
    // 粒子組成說明
    const legend = function (i) {
      const r = C.RX[state.rx];
      if (!r) return isMys() ? [['A(g)', 0]] : [[i ? T('生成物', 'products') : T('反應物', 'reactants'), 0]];
      const sg = i ? 1 : -1, out = [];
      r.sp.forEach(function (p) {
        if (p[1] * sg <= 0) return;
        if (out.length) out.push([' + ', 0]);
        fP(p[0]).forEach(function (q) { out.push(q); });
      });
      return out;
    };
    G.box.forEach(function (b, i) {
      const ps = isMys() ? [[i ? 'B(g)' : 'A(g)', 0]] : legend(i);
      let sz = 12;
      while (richW(g, ps, sz) > b.w + 36 && sz > 8.5) sz -= 0.5;
      rich(g, ps, b.x + b.w / 2, b.y + b.h + 16, col.muted, sz, 'center', '', true);
    });
  }
  function drawSide(g, b, side) {
    const r0 = Math.max(2.2, Math.min(b.w, b.h) * 0.026);
    // 晶格的鍵（鑽石、石墨）
    const lat = side.filter(function (p) { return p.lat === 'dia' || p.lat === 'gr'; });
    if (lat.length) {
      g.strokeStyle = LD.alpha(col.atom.C, 0.75); g.lineWidth = Math.max(1.2, r0 * 0.6); g.lineCap = 'round';
      g.beginPath();
      lat.forEach(function (p, i) {
        lat.forEach(function (q, j) {
          if (j <= i) return;
          // 依「原本的格位」決定誰和誰相連（不受熱振動影響），線畫到目前位置
          const dx = (q.hx - p.hx) * b.w, dy = (q.hy - p.hy) * b.h, d = Math.hypot(dx, dy);
          const lim = p.lat === 'gr' ? (Math.abs(q.hy - p.hy) < 0.01 ? b.w * 0.18 : 0) : Math.hypot(0.17 * b.w, 0.035 * b.h) * 1.08;
          if (d < lim) { g.moveTo(b.x + p.x * b.w, b.y + p.y * b.h); g.lineTo(b.x + q.x * b.w, b.y + q.y * b.h); }
        });
      });
      g.stroke();
    }
    const order = side.slice().sort(function (a, c) { return a.y - c.y; });
    order.forEach(function (p) {
      const atoms = MOL[p.m];
      const ca = Math.cos(p.a || 0), sa = Math.sin(p.a || 0);
      const px = b.x + p.x * b.w, py = b.y + p.y * b.h;
      const k = p.m === 'Ca' || p.m === 'Cl' || p.m === 'Ox' || p.m === 'C' ? 1.25 : 1;
      atoms.forEach(function (at) {
        const x = at[1] * r0 * 1.15, y = at[2] * r0 * 1.15;
        LD.ball(g, px + x * ca - y * sa, py + x * sa + y * ca, r0 * ATOM_R[at[0]] * k, col.atom[at[0]], { glow: 0 });
      });
    });
  }
  function drawPlate(g, s) {
    const y = G.plateY, x0 = G.plateX0, x1 = G.plateX1;
    const tc = tempColor(s.T);
    // 恆溫台：上亮下暗的金屬板，發光隨溫度
    const glowA = Math.max(0, Math.min(0.55, (s.T - 400) / 1600));
    if (glowA > 0.02) {
      const gl = g.createRadialGradient((x0 + x1) / 2, y, 4, (x0 + x1) / 2, y, (x1 - x0) * 0.6);
      gl.addColorStop(0, LD.alpha('#ff7a2c', glowA)); gl.addColorStop(1, LD.alpha('#ff7a2c', 0));
      g.fillStyle = gl; g.fillRect(x0 - 30, y - 30, x1 - x0 + 60, 60);
    }
    LD.block(g, x0, y, x1 - x0, 9, LD.mix(col.muted, tc, 0.55), { r: 4 });
    const lbl = 'T = ' + tK(s.T) + ' K（' + num(s.T - 273.15, 1) + ' °C）';
    LD.pill(g, T(lbl, 'T = ' + tK(s.T) + ' K (' + num(s.T - 273.15, 1) + ' °C)'), (x0 + x1) / 2, y + 34, tc, 'center', '600 ' + 12.5 + 'px ' + LD.FONT);
  }
  // 能量圖的縱軸範圍：依反應固定（不隨 T 改變），讓 −TΔS° 的長度變化看得出來
  function energyRange() {
    const p = params();
    let m = Math.max(Math.abs(p.dH), Math.abs(C.dG(p.dH, p.dS, C.TMIN)), Math.abs(C.dG(p.dH, p.dS, C.TMAX)), Math.abs(C.TdS(p.dS, C.TMAX)), 1);
    if (isCustom()) m = Math.max(m, 50);
    const st = niceStep(m * 2.2, 5);
    return Math.ceil(m * 1.08 / st) * st;
  }
  function drawEnergy(g, s) {
    const E = G.en, fs = fsz();
    const x0 = E.x0 + 44, x1 = E.x1 - 4, y0 = E.y0 + 30 * fs, y1 = E.y1;
    // 面板底
    LD.roundRect(g, E.x0, E.y0 - 4, E.x1 - E.x0, E.y1 - E.y0 + 16, 12);
    g.fillStyle = LD.alpha(col.surface, col.dark ? 0.05 : 0.4); g.fill();
    g.strokeStyle = LD.alpha(col.border, 0.8); g.lineWidth = 1; g.stroke();
    // 標題：窄畫面放不下就用短的（右上角要留給判斷標籤）
    g.font = '600 12px ' + LD.FONT;
    let ttl = T('能量圖（kJ/mol，依比例）', 'Energy diagram (kJ/mol, to scale)');
    if (g.measureText(ttl).width + 210 > E.x1 - E.x0) ttl = T('能量圖（kJ/mol）', 'Energy (kJ/mol)');
    LD.haloText(g, ttl, E.x0 + 10, E.y0 + 14, col.muted, 'left', 'alphabetic', '600 ' + 12 + 'px ' + LD.FONT);
    const Y = energyRange();
    const sy = function (v) { return (y0 + y1) / 2 - v / Y * (y1 - y0) / 2; };
    // 縱軸刻度
    const st = niceStep(2 * Y, 5);
    g.font = '11px ' + LD.FONT; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let v = -Y; v <= Y + 1e-9; v += st) {
      const yy = Math.round(sy(v)) + 0.5;
      g.strokeStyle = LD.alpha(col.text, Math.abs(v) < 1e-9 ? 0.35 : 0.07); g.lineWidth = 1;
      g.beginPath(); g.moveTo(x0, yy); g.lineTo(x1, yy); g.stroke();
      g.fillStyle = col.muted; g.fillText(num(v, st < 1 ? 1 : 0), x0 - 5, yy);
    }
    const cols = 3, cwid = (x1 - x0) / cols;
    const cx = function (i) { return x0 + cwid * (i + 0.5); };
    const bw = Math.min(46, cwid * 0.42);
    const zero = sy(0);
    // 0 這條線代表反應物的能量：標在縱軸刻度「0」的下面（放在圖內會被長條蓋住）
    LD.haloText(g, T('反應物', 'reactants'), x0 - 5, zero + 13, col.muted, 'right', 'alphabetic', '9.5px ' + LD.FONT);
    if (isMys()) {
      [0, 1, 2].forEach(function (i) {
        LD.roundRect(g, cx(i) - bw / 2, sy(Y * 0.35), bw, sy(-Y * 0.35) - sy(Y * 0.35), 6);
        g.fillStyle = LD.alpha(col.muted, 0.12); g.fill();
        g.setLineDash([4, 4]); g.strokeStyle = LD.alpha(col.muted, 0.6); g.stroke(); g.setLineDash([]);
        LD.haloText(g, '?', cx(i), zero + 6, col.muted, 'center', 'middle', '700 22px ' + LD.FONT);
      });
      const names = ['ΔH°', '−TΔS°', 'ΔG°'];
      names.forEach(function (n, i) { LD.haloText(g, n, cx(i), y1 + 12, col.muted, 'center', 'alphabetic', '600 12px ' + LD.FONT); });
      LD.pill(g, T('只量得到 K', 'Only K can be measured'), (x0 + x1) / 2, y0 - 2, col.accent, 'center', '600 12px ' + LD.FONT);
      kText(g, s.log10K, (x0 + x1) / 2, sy(Y * 0.6), col.text, 15, 'center');
      return;
    }
    const bar = function (i, a, b, color, label, sub) {
      const ya = sy(a), yb = sy(b);
      const top = Math.min(ya, yb), h = Math.max(1.5, Math.abs(yb - ya));
      LD.block(g, cx(i) - bw / 2, top, bw, h, LD.alpha(color, 0.28), { r: 4, shadow: false, stroke: LD.alpha(color, 0.65) });
      if (Math.abs(yb - ya) > 3) LD.arrow(g, cx(i), ya, cx(i), yb, color, 2.6);
      // 數值標籤：放在箭頭尖端外側
      const up = b > a;
      const ly = up ? yb - 6 : yb + 18;
      LD.pill(g, label, cx(i), Math.max(y0 + 2, Math.min(y1 + 14, ly)), color, 'center', '600 12px ' + LD.FONT);
      void sub;
    };
    // 1. ΔH°
    bar(0, 0, s.dH, col.dH, 'ΔH° ' + sgn(s.dH, 1));
    // 連接虛線
    g.setLineDash([3, 4]); g.strokeStyle = LD.alpha(col.muted, 0.7); g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx(0) + bw / 2, sy(s.dH)); g.lineTo(cx(1) - bw / 2, sy(s.dH)); g.stroke(); g.setLineDash([]);
    // 2. −TΔS°
    bar(1, s.dH, s.dG, col.TdS, '−TΔS° ' + sgn(-s.TdS, 1));
    g.setLineDash([3, 4]); g.strokeStyle = LD.alpha(col.muted, 0.7);
    g.beginPath(); g.moveTo(cx(1) + bw / 2, sy(s.dG)); g.lineTo(cx(2) - bw / 2, sy(s.dG)); g.stroke(); g.setLineDash([]);
    // 3. ΔG°
    const vc = s.verdict === 'yes' ? col.probe : s.verdict === 'no' ? col.pos : col.accent;
    bar(2, 0, s.dG, vc, 'ΔG° ' + sgn(s.dG, 1));
    // 生成物的水平線
    g.strokeStyle = vc; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx(2) - bw / 2 - 8, sy(s.dG)); g.lineTo(cx(2) + bw / 2 + 8, sy(s.dG)); g.stroke();
    // 欄名
    ['ΔH°', '−TΔS°', 'ΔG°'].forEach(function (n, i) { LD.haloText(g, n, cx(i), y1 + 12, col.muted, 'center', 'alphabetic', '600 12px ' + LD.FONT); });
    // 判斷
    const vt = s.verdict === 'yes' ? T('ΔG° < 0：自發', 'ΔG° < 0: spontaneous') : s.verdict === 'no' ? T('ΔG° > 0：不自發', 'ΔG° > 0: not spontaneous') : T('ΔG° ≈ 0：平衡（K ≈ 1）', 'ΔG° ≈ 0: at equilibrium (K ≈ 1)');
    const pb = LD.pill(g, vt, x1 - 2, y0 - 2, vc, 'right', '700 13px ' + LD.FONT);
    const age = (performance.now() - flashT0) / 600;
    if (age >= 0 && age <= 1 && !reducedMotion) LD.ripple(g, pb.x + pb.w / 2, pb.y + pb.h / 2, pb.h * 0.8, age, vc);
  }

  // ======================= 圖表 =======================
  let gw = 0, gh = 0;
  function resizeGraph() {
    const w = gcv.clientWidth;
    if (!w) return;
    gw = w; gh = w < 560 ? 300 : 340;
    if (gcv.style.height !== gh + 'px') gcv.style.height = gh + 'px';
    gcv.width = Math.round(gw * dpr); gcv.height = Math.round(gh * dpr);
  }
  function niceStep(span, k) {
    const raw = span / (k || 5), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  let GA = null; // 目前圖表的座標換算（拖曳用）
  function axes(g, o) {
    const fs = fsz();
    const X0 = 52 * Math.min(1.25, fs), X1 = gw - 14, Y0 = gh - 34 * Math.min(1.2, fs), Y1 = 14;
    const sx = function (v) { return X0 + (v - o.x0) / (o.x1 - o.x0) * (X1 - X0); };
    const sy = function (v) { return Y0 - (v - o.y0) / (o.y1 - o.y0) * (Y0 - Y1); };
    LD.backdrop(g, gw, gh);
    const xs = o.xs || niceStep(o.x1 - o.x0, gw < 500 ? 4 : 7), ys = niceStep(o.y1 - o.y0, 6);
    g.lineWidth = 1;
    g.font = '11px ' + LD.FONT;
    for (let v = Math.ceil(o.x0 / xs) * xs; v <= o.x1 + 1e-9; v += xs) {
      const x = Math.round(sx(v)) + 0.5;
      g.strokeStyle = LD.alpha(col.text, 0.08); g.beginPath(); g.moveTo(x, Y1); g.lineTo(x, Y0); g.stroke();
      g.fillStyle = col.muted; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(num(v, xs < 1 ? 1 : 0), x, Y0 + 4);
    }
    for (let v = Math.ceil(o.y0 / ys) * ys; v <= o.y1 + 1e-9; v += ys) {
      const y = Math.round(sy(v)) + 0.5;
      g.strokeStyle = LD.alpha(col.text, Math.abs(v) < ys * 1e-6 ? 0.4 : 0.08); g.beginPath(); g.moveTo(X0, y); g.lineTo(X1, y); g.stroke();
      g.fillStyle = col.muted; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(num(v, ys < 1 ? (ys < 0.1 ? 2 : 1) : 0), X0 - 5, y);
    }
    g.strokeStyle = LD.alpha(col.text, 0.5);
    g.beginPath(); g.moveTo(X0 + 0.5, Y1); g.lineTo(X0 + 0.5, Y0 + 0.5); g.lineTo(X1, Y0 + 0.5); g.stroke();
    g.fillStyle = col.muted; g.textAlign = 'right'; g.textBaseline = 'bottom';
    g.font = '600 12px ' + LD.FONT;
    g.fillText(o.xl, X1, Y0 + 30 * Math.min(1.2, fs));
    g.save(); g.translate(13, (Y0 + Y1) / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(o.yl, 0, 0); g.restore();
    return { sx: sx, sy: sy, X0: X0, X1: X1, Y0: Y0, Y1: Y1, o: o };
  }
  function line(g, pts, color, width, dash) {
    if (pts.length < 2) return;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = color; g.lineWidth = width; if (dash) g.setLineDash(dash);
    g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.stroke();
    g.restore();
  }
  function clipTo(g, A) { g.save(); g.beginPath(); g.rect(A.X0, A.Y1, A.X1 - A.X0, A.Y0 - A.Y1); g.clip(); }
  // 九個反應的固定顏色（圖例與紀錄點用）
  const RXCOL = { vap: '#2f86d6', nh4cl: '#2aa198', n2o4: '#b4531f', caco3: '#8a7a52', haber: '#3f6fd6', so3: '#c9a227', h2o2: '#3fae7a', diamond: '#6d7a8a', ozone: '#8a5cd0', custom: '#e08a1e', mys: '#d63a7a' };
  function rxCol(id) { return col.dark ? LD.mix(RXCOL[id] || col.accent, '#ffffff', 0.18) : (RXCOL[id] || col.accent); }
  function curRows() { return rows.filter(function (r) { return r.rx === state.rx && (!isMys() || (mys && r.mysId === mys.id)); }); }

  function drawGraph() {
    if (!gw) return;
    const g = gctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state.tab === 'dg') drawDG(g);
    else if (state.tab === 'map') drawMap(g);
    else drawLnK(g);
  }
  function drawMsg(g, text) {
    LD.backdrop(g, gw, gh);
    g.fillStyle = col.muted; g.font = '14px ' + LD.FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    const words = text.replace(/([，。、：；])/g, '$1\u0001').replace(/ /g, '\u0001 ').split('\u0001'); // 中文在標點後斷行、英文在空白前斷行（不用 lookbehind，舊版 Safari 不支援）
    const out = [];
    let ln = '';
    words.forEach(function (w) { if (g.measureText(ln + w).width > gw - 40 && ln) { out.push(ln); ln = w; } else ln += w; });
    out.push(ln);
    const y = gh / 2 - (out.length - 1) * 11;
    out.forEach(function (l, i) { g.fillText(l.trim(), gw / 2, y + i * 22); });
    GA = null;
  }
  function drawDG(g) {
    if (isMys()) { drawMsg(g, T('未知反應的 ΔG° 要你自己由 K 算出來：ΔG° = −RT ln K。可以改看「ln K—1/T」圖。', 'For the unknown reaction you work out ΔG° yourself from K: ΔG° = −RT ln K. Try the “ln K against 1/T” graph instead.')); return; }
    const s = now();
    const ids = state.showAll ? C.ORDER.slice() : [];
    if (ids.indexOf(state.rx) < 0) ids.push(state.rx);
    const lineOf = function (id) {
      if (id === 'custom') return { dH: state.cH, dS: state.cS, vr: [C.TMIN, C.TMAX] };
      const d = C.rxData(id); return { dH: d.dH, dS: d.dS, vr: d.valid };
    };
    let lo = 0, hi = 0;
    ids.forEach(function (id) { const L = lineOf(id); [C.TMIN, C.TMAX].forEach(function (Tk) { const v = C.dG(L.dH, L.dS, Tk); lo = Math.min(lo, v); hi = Math.max(hi, v); }); });
    curRows().forEach(function (r) { lo = Math.min(lo, r.dG); hi = Math.max(hi, r.dG); });
    const span = Math.max(hi - lo, 10);
    lo -= span * 0.08; hi += span * 0.08;
    const A = axes(g, { x0: C.TMIN, x1: C.TMAX, y0: lo, y1: hi, xl: 'T (K)', yl: 'ΔG° (kJ/mol)' });
    GA = A;
    clipTo(g, A);
    // 自發區（ΔG° < 0）淡綠、不自發區淡紅
    const z = A.sy(0);
    g.fillStyle = LD.alpha(col.probe, col.dark ? 0.10 : 0.07); g.fillRect(A.X0, z, A.X1 - A.X0, A.Y0 - z);
    g.fillStyle = LD.alpha(col.pos, col.dark ? 0.08 : 0.05); g.fillRect(A.X0, A.Y1, A.X1 - A.X0, z - A.Y1);
    // 區域名稱放在左上、左下角（右邊留給各反應的名稱）
    if (z < A.Y0 - 14) LD.haloText(g, T('自發（ΔG° < 0）', 'spontaneous (ΔG° < 0)'), A.X0 + 6, A.Y0 - 8, col.probe, 'left', 'alphabetic', '600 11px ' + LD.FONT);
    if (z > A.Y1 + 14) LD.haloText(g, T('不自發（ΔG° > 0）', 'not spontaneous (ΔG° > 0)'), A.X0 + 6, A.Y1 + 14, col.pos, 'left', 'alphabetic', '600 11px ' + LD.FONT);
    // 各反應的直線：適用範圍內實線、範圍外虛線
    const labs = [];
    ids.forEach(function (id) {
      const L = lineOf(id), cur = id === state.rx;
      const c = cur ? rxCol(id) : LD.alpha(rxCol(id), 0.5), w = cur ? 3 : 1.6;
      const seg = function (a, b, dash) { if (b > a) line(g, [[A.sx(a), A.sy(C.dG(L.dH, L.dS, a))], [A.sx(b), A.sy(C.dG(L.dH, L.dS, b))]], c, w, dash); };
      seg(C.TMIN, Math.max(C.TMIN, L.vr[0]), [5, 5]);
      seg(Math.max(C.TMIN, L.vr[0]), Math.min(C.TMAX, L.vr[1]), null);
      seg(Math.min(C.TMAX, L.vr[1]), C.TMAX, [5, 5]);
      if (state.showAll && !cur) labs.push({ id: id, y: A.sy(C.dG(L.dH, L.dS, C.TMAX - 20)) - 5 });
    });
    // 各反應的名稱：靠右對齊，太擠時上下推開（間距至少 12 px）
    labs.sort(function (p, q) { return p.y - q.y; });
    for (let i = 1; i < labs.length; i++) labs[i].y = Math.max(labs[i].y, labs[i - 1].y + 12);
    for (let i = labs.length - 1; i >= 0; i--) labs[i].y = Math.min(labs[i].y, i === labs.length - 1 ? A.Y0 - 4 : labs[i + 1].y - 12);
    labs.forEach(function (l) { rich(g, nameParts(l.id), A.sx(C.TMAX - 20), l.y, LD.alpha(rxCol(l.id), 0.95), 10.5, 'right', '', true); });
    // T* 標記
    if (s.turn.T != null && s.turn.T >= C.TMIN && s.turn.T <= C.TMAX) {
      const x = A.sx(s.turn.T);
      LD.ball(g, x, z, 5, col.accent, { glow: 0.3 });
      LD.pill(g, 'T* = ' + num(s.turn.T, 1) + ' K', x, z - 10, col.accent, x > A.X1 - 80 ? 'right' : x < A.X0 + 80 ? 'left' : 'center', '600 11.5px ' + LD.FONT);
    }
    // 紀錄點
    curRows().forEach(function (r) { LD.ball(g, A.sx(r.T), A.sy(r.dG), 4.2, rxCol(r.rx), { glow: 0 }); });
    // 目前的溫度
    const x = A.sx(s.T);
    g.setLineDash([4, 4]); g.strokeStyle = LD.alpha(tempColor(s.T), 0.9); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x, A.Y1); g.lineTo(x, A.Y0); g.stroke(); g.setLineDash([]);
    LD.ball(g, x, A.sy(s.dG), 6.5, s.verdict === 'yes' ? col.probe : s.verdict === 'no' ? col.pos : col.accent, { glow: 0.35 });
    g.restore();
  }
  function drawMap(g) {
    const s = now();
    // 範圍：涵蓋九個反應與自訂反應
    let xm = 260, ym = 320;
    if (isCustom()) { xm = Math.max(xm, Math.abs(state.cS) * 1.12); ym = Math.max(ym, Math.abs(state.cH) * 1.12); }
    const A = axes(g, { x0: -xm, x1: xm, y0: -ym, y1: ym, xl: 'ΔS° (J/(mol·K))', yl: 'ΔH° (kJ/mol)' });
    GA = A;
    clipTo(g, A);
    // 分界線 ΔH° = TΔS°（kJ ↔ J/K × K / 1000）；線以下自發
    const k = s.T / 1000;
    const pL = [A.sx(-xm), A.sy(-xm * k)], pR = [A.sx(xm), A.sy(xm * k)];
    g.beginPath(); g.moveTo(pL[0], pL[1]); g.lineTo(pR[0], pR[1]); g.lineTo(A.X1, A.Y0 + 2000); g.lineTo(A.X0, A.Y0 + 2000); g.closePath();
    g.fillStyle = LD.alpha(col.probe, col.dark ? 0.12 : 0.08); g.fill();
    line(g, [pL, pR], tempColor(s.T), 2.5);
    // 象限名稱
    const qx = function (u) { return A.X0 + (A.X1 - A.X0) * u; }, qy = function (u) { return A.Y1 + (A.Y0 - A.Y1) * u; };
    const f = '600 11px ' + LD.FONT;
    LD.haloText(g, T('任何溫度都不自發', 'never spontaneous'), qx(0.03), qy(0.07), col.pos, 'left', 'alphabetic', f);
    LD.haloText(g, T('高溫才自發', 'spontaneous when hot'), qx(0.97), qy(0.07), col.muted, 'right', 'alphabetic', f);
    LD.haloText(g, T('低溫才自發', 'spontaneous when cold'), qx(0.03), qy(0.97), col.muted, 'left', 'alphabetic', f);
    LD.haloText(g, T('任何溫度都自發', 'always spontaneous'), qx(0.97), qy(0.97), col.probe, 'right', 'alphabetic', f);
    // 九個反應
    C.ORDER.forEach(function (id) {
      const d = C.rxData(id), x = A.sx(d.dS), y = A.sy(d.dH), cur = id === state.rx;
      LD.ball(g, x, y, cur ? 7 : 4.5, rxCol(id), { glow: cur ? 0.4 : 0 });
      if (cur) { g.strokeStyle = col.text; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.stroke(); }
      const right = x < A.X1 - 110;
      rich(g, nameParts(id), x + (right ? 9 : -9), y + (id === 'diamond' ? 14 : -6), cur ? col.text : col.muted, 11, right ? 'left' : 'right', cur ? '600' : '', true);
    });
    if (isCustom()) {
      const x = A.sx(state.cS), y = A.sy(state.cH);
      LD.ball(g, x, y, 7, rxCol('custom'), { glow: 0.4 });
      g.strokeStyle = col.text; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.stroke();
      LD.haloText(g, rxName('custom'), x + 12, y - 8, col.text, 'left', 'alphabetic', '600 11px ' + LD.FONT);
    }
    // 線的名稱
    const lx = A.sx(xm * 0.55), ly = A.sy(xm * 0.55 * k);
    LD.pill(g, 'ΔH° = TΔS°（T = ' + tK(s.T) + ' K）', Math.min(A.X1 - 4, lx), Math.max(A.Y1 + 20, Math.min(A.Y0 - 4, ly - 8)), tempColor(s.T), 'right', '600 11.5px ' + LD.FONT);
    g.restore();
  }
  function drawLnK(g) {
    const s = now(), rs = curRows();
    const x0 = 1000 / C.TMAX, x1 = 1000 / C.TMIN;
    let lo = 0, hi = 0;
    if (!isMys()) [C.TMIN, C.TMAX].forEach(function (Tk) { const v = C.lnK(s.dH, s.dS, Tk); lo = Math.min(lo, v); hi = Math.max(hi, v); });
    rs.forEach(function (r) { lo = Math.min(lo, r.lnK); hi = Math.max(hi, r.lnK); });
    if (isMys()) { lo = Math.min(lo, s.lnK); hi = Math.max(hi, s.lnK); }
    const span = Math.max(hi - lo, 4);
    lo -= span * 0.08; hi += span * 0.08;
    const A = axes(g, { x0: 0, x1: Math.ceil(x1), y0: lo, y1: hi, xl: '1000 / T (1/K)', yl: 'ln K', xs: 1 });
    GA = A;
    clipTo(g, A);
    const z = A.sy(0);
    g.fillStyle = LD.alpha(col.probe, col.dark ? 0.10 : 0.07); g.fillRect(A.X0, A.Y1, A.X1 - A.X0, z - A.Y1);
    LD.haloText(g, T('K > 1（自發）', 'K > 1 (spontaneous)'), A.X1 - 6, Math.max(A.Y1 + 12, z - 8), col.probe, 'right', 'alphabetic', '600 11px ' + LD.FONT);
    // 溫度範圍外（1000/T < 0.667）塗灰
    g.fillStyle = LD.alpha(col.muted, 0.08); g.fillRect(A.X0, A.Y1, A.sx(x0) - A.X0, A.Y0 - A.Y1);
    if (!isMys()) {
      line(g, [[A.sx(x0), A.sy(C.lnK(s.dH, s.dS, C.TMAX))], [A.sx(x1), A.sy(C.lnK(s.dH, s.dS, C.TMIN))]], rxCol(state.rx), 3);
      LD.pill(g, T('斜率 −ΔH°/R = ', 'slope −ΔH°/R = ') + num(-s.dH * 1000 / C.R, 0) + ' K', A.X1 - 4, A.Y0 - 6, col.muted, 'right', '600 11px ' + LD.FONT);
    }
    rs.forEach(function (r) { LD.ball(g, A.sx(1000 / r.T), A.sy(r.lnK), 4.2, rxCol(r.rx), { glow: 0 }); });
    const x = A.sx(1000 / s.T);
    g.setLineDash([4, 4]); g.strokeStyle = LD.alpha(tempColor(s.T), 0.9); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x, A.Y1); g.lineTo(x, A.Y0); g.stroke(); g.setLineDash([]);
    LD.ball(g, x, A.sy(s.lnK), 6.5, s.lnK >= 0 ? col.probe : col.pos, { glow: 0.35 });
    g.restore();
  }
  function drawAll() { drawStage(); drawGraph(); }

  // ======================= 讀數、文字 =======================
  function updateReadouts() {
    const s = now();
    const items = [];
    const hide = isMys() && !mys.revealed;
    const q = '?';
    items.push(['ΔH°', hide ? q : sgn(s.dH, 2) + ' kJ/mol']);
    items.push(['ΔS°', hide ? q : sgn(s.dS, 1) + ' J/(mol·K)']);
    items.push([T('溫度 T', 'Temperature T'), tK(s.T) + ' K<small>' + num(s.T - 273.15, 1) + ' °C</small>']);
    items.push(['TΔS°', hide ? q : sgn(s.TdS, 2) + ' kJ/mol']);
    items.push(['ΔG° = ΔH° − TΔS°', hide ? q : sgn(s.dG, 2) + ' kJ/mol', 'big']);
    items.push([T('平衡常數 K', 'Equilibrium constant K') + '<small>K = e<sup>−ΔG°/RT</sup></small>', kHTML(s.log10K, 3), 'big']);
    let ts;
    if (hide) ts = q;
    else if (s.turn.T != null) ts = num(s.turn.T, 1) + ' K<small>' + num(s.turn.T - 273.15, 1) + ' °C・' + (s.turn.kind === 'low' ? T('低於它才自發', 'spontaneous below it') : T('高於它才自發', 'spontaneous above it')) + '</small>';
    else ts = s.turn.kind === 'always' ? T('沒有：任何溫度都自發', 'none: always spontaneous') : s.turn.kind === 'never' ? T('沒有：任何溫度都不自發', 'none: never spontaneous') : T('沒有：ΔG° 不隨溫度改變', 'none: ΔG° does not change with T');
    items.push([T('轉折溫度 T* = ΔH°/ΔS°', 'Turning temperature T* = ΔH°/ΔS°'), ts]);
    const vt = s.verdict === 'yes' ? T('自發', 'spontaneous') : s.verdict === 'no' ? T('不自發', 'not spontaneous') : T('平衡（K ≈ 1）', 'at equilibrium (K ≈ 1)');
    items.push([T('判斷', 'Verdict'), hide ? q : vt, hide ? '' : s.verdict === 'yes' ? 'yes' : s.verdict === 'no' ? 'no' : '']);
    if (s.dn != null) items.push([T('氣體莫耳數變化 Δn', 'Change in moles of gas Δn'), sgn(s.dn, 0) + ' mol']);
    $('readout').innerHTML = items.map(function (it) { return '<dt>' + it[0] + '</dt><dd' + (it[2] ? ' class="' + it[2] + '"' : '') + '>' + it[1] + '</dd>'; }).join('');
    // 適用範圍
    let w = '';
    if (!s.valid) {
      const why = C.RX[state.rx] && C.RX[state.rx].why;
      w = T('注意：' + tK(s.T) + ' K 超出這個方程式的適用範圍（' + s.vr[0] + '–' + s.vr[1] + ' K）：' + (why ? why[0] : '') + '。這裡的結果只是數學上的外推。',
        'Note: ' + tK(s.T) + ' K is outside the range where this equation makes sense (' + s.vr[0] + '–' + s.vr[1] + ' K): ' + (why ? why[1] : '') + '. The result here is only a mathematical extrapolation.');
    }
    $('warn').innerHTML = w;
    statusEl.innerHTML = autoStatus(s);
  }
  function autoStatus(s) {
    if (state.sweeping) return T('溫度掃描中：', 'Sweeping the temperature: ') + 'T = ' + num(s.T, 0) + ' K';
    if (isMys()) return T('未知反應：只看得到 K。在幾個溫度按「記錄這一點」，再到右邊算出 ΔH° 與 ΔS°。', 'Unknown reaction: only K is visible. Press “Record this point” at a few temperatures, then work out ΔH° and ΔS° on the right.');
    const g = 'ΔG° = ' + sgn(s.dG, 2) + ' kJ/mol';
    if (s.verdict === 'yes') return T('在 ' + tK(s.T) + ' K，' + g + ' < 0：反應自發，平衡時偏向生成物。', 'At ' + tK(s.T) + ' K, ' + g + ' < 0: the reaction is spontaneous and the products are favoured.');
    if (s.verdict === 'no') return T('在 ' + tK(s.T) + ' K，' + g + ' > 0：反應不自發，平衡時偏向反應物。', 'At ' + tK(s.T) + ' K, ' + g + ' > 0: the reaction is not spontaneous and the reactants are favoured.');
    return T('在 ' + tK(s.T) + ' K，' + g + '，幾乎為零：反應物與生成物處於平衡，K ≈ 1。', 'At ' + tK(s.T) + ' K, ' + g + ', almost zero: reactants and products are at equilibrium, K ≈ 1.');
  }
  function rxInfoHTML() {
    if (isMys()) return '<span class="eqn">A(g) → B(g)</span>' + T('ΔH°、ΔS° 看不到；只能量 K。', 'ΔH° and ΔS° are hidden; only K can be measured.');
    if (isCustom()) return '<span class="eqn">' + eqHTML('custom') + '</span>' + T('用下面兩個滑桿設定 ΔH° 與 ΔS°。', 'Set ΔH° and ΔS° with the two sliders below.');
    const d = C.rxData(state.rx), t = C.turning(d.dH, d.dS);
    const desc = {
      vap: ['K 就是水的蒸氣壓（bar）；ΔG° = 0 的溫度就是 1 bar 下的沸點。', 'K is the vapour pressure of water in bar; where ΔG° = 0 is the boiling point at 1 bar.'],
      nh4cl: ['溶解時溶液變冷（吸熱），卻會自己溶解。', 'The solution gets colder as it dissolves (endothermic), yet it dissolves by itself.'],
      n2o4: ['無色的 N<sub>2</sub>O<sub>4</sub> 拆成紅棕色的 NO<sub>2</sub>；和「化學平衡」實驗同一套數據。', 'Colourless N<sub>2</sub>O<sub>4</sub> splits into brown NO<sub>2</sub>; the same data as “Chemical Equilibrium”.'],
      caco3: ['燒石灰：K 就是 CO<sub>2</sub> 的分壓（bar）。', 'Burning lime: K is the pressure of CO<sub>2</sub> in bar.'],
      haber: ['哈柏法：放熱、氣體變少。', 'The Haber process: exothermic, fewer gas molecules.'],
      so3: ['製造硫酸的接觸法：放熱、氣體變少。', 'The contact process for sulfuric acid: exothermic, fewer gas molecules.'],
      h2o2: ['放熱又產生氣體：任何溫度都自發，但沒有催化劑時很慢。', 'Exothermic and makes a gas: always spontaneous, but slow without a catalyst.'],
      diamond: ['在 1 bar 下，石墨比鑽石穩定。', 'At 1 bar, graphite is more stable than diamond.'],
      ozone: ['吸熱、氣體變少：任何溫度都不自發。', 'Endothermic with fewer gas molecules: never spontaneous.']
    }[state.rx];
    return '<span class="eqn">' + eqHTML(state.rx) + '</span>ΔH° = ' + sgn(d.dH, 2) + ' kJ/mol' + T('，', ', ') + 'ΔS° = ' + sgn(d.dS, 1) + ' J/(mol·K)' +
      (t.T != null ? T('，T* = ' + num(t.T, 1) + ' K', ', T* = ' + num(t.T, 1) + ' K') : '') + T('。', '. ') + T(desc[0], desc[1]);
  }
  function refreshOutputs() {
    $('tempo').textContent = tK(state.T) + ' K';
    $('cHo').textContent = num(state.cH, 2).replace(/\.?0+$/, '') + ' kJ/mol';
    $('cSo').textContent = num(state.cS, 1).replace(/\.0$/, '') + ' J/(mol·K)';
  }
  function refreshAll() {
    refreshOutputs();
    $('rxInfo').innerHTML = rxInfoHTML();
    $('customRows').hidden = !isCustom();
    document.querySelectorAll('#rxSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.rx === state.rx)); b.disabled = isMys(); });
    updateReadouts();
    updateGraphText();
    renderTable();
    drawAll();
  }

  // ======================= 圖說、紀錄表 =======================
  function updateGraphText() {
    let leg = '', hint = '';
    if (state.tab === 'dg') {
      leg = '<span><span class="ln" style="background:' + rxCol(state.rx) + '"></span>' + rxNameHTML(state.rx) + '</span> <span><span class="ln dash" style="color:' + col.muted + '"></span>' + T('超出適用範圍（外推）', 'outside the valid range (extrapolated)') + '</span> <span><span class="dot" style="background:' + col.accent + '"></span>T*</span>';
      hint = T('ΔG° = ΔH° − TΔS° 對 T 是直線：截距（T = 0）是 ΔH°，斜率是 −ΔS°。在圖上拖曳可以改變溫度。', 'ΔG° = ΔH° − TΔS° is a straight line in T: the intercept (T = 0) is ΔH° and the slope is −ΔS°. Drag on the graph to change the temperature.');
    } else if (state.tab === 'map') {
      leg = '<span><span class="box" style="background:' + LD.alpha(col.probe, 0.25) + '"></span>' + T('這個溫度下自發的區域', 'spontaneous at this temperature') + '</span>';
      hint = T('每個點是一個反應。分界線 ΔH° = TΔS° 通過原點，斜率由溫度決定：溫度升高，線往逆時針轉，右上方（高溫才自發）的反應一個個掉進自發區。拖曳分界線可以改變溫度。', 'Each dot is a reaction. The dividing line ΔH° = TΔS° passes through the origin with a slope set by T: as T rises the line turns anticlockwise and the reactions in the upper right (spontaneous when hot) drop into the spontaneous region one by one. Drag the line to change the temperature.');
    } else {
      leg = '<span><span class="dot" style="background:' + rxCol(state.rx) + '"></span>' + T('紀錄點', 'recorded points') + '</span>';
      hint = T('ln K = −(ΔH°/R)(1/T) + ΔS°/R：斜率求 ΔH°，與縱軸的截距求 ΔS°（凡特荷夫）。灰色區是 1500 K 以上，滑桿調不到。', 'ln K = −(ΔH°/R)(1/T) + ΔS°/R: the slope gives ΔH° and the intercept gives ΔS° (van \'t Hoff). The grey band is above 1500 K, beyond the slider.');
    }
    $('gLegend').innerHTML = leg;
    $('gHint').textContent = hint;
    $('showAll').closest('label').hidden = state.tab !== 'dg';
  }
  function renderTable() {
    const el = $('tbl');
    let h = '<thead><tr><th>#</th><th class="l">' + T('反應', 'Reaction') + '</th><th>T<br><small>K</small></th><th>ΔH°<br><small>kJ/mol</small></th><th>ΔS°<br><small>J/(mol·K)</small></th><th>ΔG°<br><small>kJ/mol</small></th><th>K</th><th>' + T('判斷', 'Verdict') + '</th></tr></thead><tbody>';
    if (!rows.length) h += '<tr class="empty"><td colspan="8">' + T('還沒有紀錄：按「記錄這一點」把目前的狀態記下來。', 'No records yet: press “Record this point” to note the current state.') + '</td></tr>';
    rows.slice(-60).forEach(function (r) {
      const hid = r.mode === 'mys' && !(mys && mys.id === r.mysId && mys.revealed) && !r.revealed;
      const v = hid ? '?' : r.dG < -0.05 ? T('自發', 'yes') : r.dG > 0.05 ? T('不自發', 'no') : T('平衡', 'equil.');
      const cls = hid ? '' : r.dG < -0.05 ? 'yes' : r.dG > 0.05 ? 'no' : '';
      h += '<tr><td>' + r.n + '</td><td class="l">' + rxNameHTML(r.rx) + (r.valid ? '' : ' <small>*</small>') + '</td><td>' + tK(r.T) + '</td><td>' + (hid ? '?' : sgn(r.dH, 2)) + '</td><td>' + (hid ? '?' : sgn(r.dS, 1)) + '</td><td>' +
        (hid ? '?' : sgn(r.dG, 2)) + '</td><td>' + kHTML(r.log10K, 3) + '</td><td class="' + cls + '">' + v + '</td></tr>';
    });
    if (rows.some(function (r) { return !r.valid; })) h += '<tr class="empty"><td colspan="8">' + T('* 超出方程式的適用範圍（只是外推）', '* outside the range where the equation makes sense (extrapolated)') + '</td></tr>';
    el.innerHTML = h + '</tbody>';
  }

  // ======================= 操作 =======================
  function acted() { userActed = true; }
  function snd() { return window.LabSound && window.LabSound.enabled(); }
  /** 溫度或參數改變之後：判斷有沒有越過 ΔG° = 0（使用者造成的才響） */
  function afterChange(byUser) {
    const v = now().verdict;
    if (byUser && lastVerdict && v !== lastVerdict && !isMys()) {
      flashT0 = performance.now();
      if (snd() && flashT0 - lastCrossSnd > 150) {
        lastCrossSnd = flashT0;
        if (v === 'yes') window.LabSound.sweep({ from: 523, to: 784, dur: 0.18, gain: 0.1 });
        else if (v === 'no') window.LabSound.sweep({ from: 784, to: 523, dur: 0.18, gain: 0.1 });
        else window.LabSound.tone({ freq: 659, dur: 0.12, gain: 0.1 });
      }
      startLoop();
    }
    lastVerdict = v;
    refreshOutputs();
    updateReadouts();
    drawAll();
  }
  function setT(v, byUser) {
    v = Math.max(C.TMIN, Math.min(C.TMAX, v));
    state.T = v;
    setVal(elT, v);
    afterChange(byUser);
  }
  function setRx(id) {
    if (id !== 'custom' && id !== 'mys' && !C.RX[id]) return;
    state.rx = id;
    if (id !== 'mys') prevRx = id;
    buildParts();
    lastVerdict = now().verdict;
    refreshAll();
  }
  function record() {
    acted();
    const s = now();
    const r = { n: ++rowSeq, seg: segId, rx: state.rx, mode: isMys() ? 'mys' : isCustom() ? 'custom' : 'real', mysId: isMys() ? mys.id : null,
      T: s.T, dH: s.dH, dS: s.dS, dG: s.dG, lnK: s.lnK, log10K: s.log10K, K: Math.exp(s.lnK), valid: s.valid };
    const earlier = rows.filter(function (x) { return x.seg === segId; }).slice(-60).map(strip);
    rows.push(r);
    if (rows.length > 300) rows.shift();
    if (snd()) window.LabSound.tone({ freq: isMys() ? 587 : s.dG < 0 ? 784 : 440, dur: 0.09, type: 'triangle', gain: 0.1 });
    renderTable();
    drawGraph();
    statusEl.innerHTML = T('已記錄第 ' + r.n + ' 筆：', 'Recorded #' + r.n + ': ') + rxNameHTML(r.rx) + T('，', ', ') + 'T = ' + tK(r.T) + ' K' + T('，', ', ') + (r.mode === 'mys' ? 'K = ' + kHTML(r.log10K, 3) : 'ΔG° = ' + sgn(r.dG, 2) + ' kJ/mol');
    if (userActed && window.LabMission) window.LabMission.emit('record', Object.assign(strip(r), { earlier: earlier }));
  }
  /** 給任務用的紀錄（未知反應的真值仍送出，但任務只用公開的欄位判定） */
  function strip(r) { return { rx: r.rx, mode: r.mode, T: r.T, dH: r.dH, dS: r.dS, dG: r.dG, lnK: r.lnK, log10K: r.log10K, K: r.K, valid: r.valid, seg: r.seg }; }

  // ---------- 溫度掃描（與粒子動畫共用同一個 requestAnimationFrame 迴圈） ----------
  let sweepDir = 1;
  function startSweep() {
    acted();
    if (state.sweeping) { stopSweep(); return; }
    state.sweeping = true;
    sweepDir = state.T >= C.TMAX - 1 ? -1 : 1;
    $('sweep').textContent = T('停止掃描', 'Stop sweep');
    startLoop();
  }
  function stopSweep() {
    if (!state.sweeping) return;
    state.sweeping = false;
    $('sweep').textContent = T('溫度掃描', 'Temperature sweep');
    setT(Math.round(state.T), false);
  }
  let loopOn = false, lastTs = 0;
  function needLoop() { return !document.hidden && (state.sweeping || !reducedMotion || performance.now() - flashT0 < 700); }
  function startLoop() {
    if (loopOn || !needLoop()) return;
    loopOn = true; lastTs = 0;
    requestAnimationFrame(frame);
  }
  function frame(ts) {
    if (!needLoop()) { loopOn = false; drawAll(); return; }
    const dt = lastTs ? Math.min(1 / 30, (ts - lastTs) / 1000) : 1 / 60;
    lastTs = ts;
    if (state.sweeping) {
      let v = state.T + sweepDir * 140 * dt;
      if (v >= C.TMAX || v <= C.TMIN) { v = Math.max(C.TMIN, Math.min(C.TMAX, v)); state.T = v; setVal(elT, v); stopSweep(); afterChange(true); }
      else { state.T = v; setVal(elT, Math.round(v * 100) / 100); afterChange(true); }
    }
    if (!reducedMotion) moveParts(dt);
    drawStage();
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) startLoop(); });

  // ---------- 未知反應 ----------
  function startMystery() {
    acted();
    stopSweep();
    mys = Object.assign({ id: ++mysSeq, revealed: false, tries: 0 }, C.makeMystery());
    $('mysBox').hidden = false;
    $('mysOn').closest('.btns').hidden = true;
    $('ansH').value = ''; $('ansS').value = '';
    $('mysOut').innerHTML = T('新的未知反應已經放進來了。調溫度、按「記錄這一點」記下 K。', 'A new unknown reaction is ready. Change the temperature and press “Record this point” to note K.');
    setRx('mys');
  }
  function stopMystery() {
    acted();
    mys = null;
    $('mysBox').hidden = true;
    $('mysOn').closest('.btns').hidden = false;
    $('mysOut').textContent = '';
    setRx(prevRx);
  }
  function parseNum(s) {
    const t = String(s || '').normalize('NFKC').trim().replace(/[−–—]/g, '-').replace(/[，,]/g, '.').replace(/\s+/g, '');
    return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? parseFloat(t) : NaN;
  }
  function checkAnswer() {
    if (!mys) return;
    acted();
    const a = parseNum($('ansH').value), b = parseNum($('ansS').value);
    if (!isFinite(a) || !isFinite(b)) {
      $('mysOut').innerHTML = T('請在兩個欄位都填入數字（ΔH° 用 kJ/mol、ΔS° 用 J/(mol·K)，記得正負號）。', 'Please type a number in both boxes (ΔH° in kJ/mol, ΔS° in J/(mol·K); mind the signs).');
      return;
    }
    mys.tries++;
    const errH = Math.abs(a - mys.dH) / Math.abs(mys.dH), errS = Math.abs(b - mys.dS) / Math.abs(mys.dS);
    const ts = {};
    rows.forEach(function (r) { if (r.mysId === mys.id) ts[r.T.toFixed(2)] = 1; });
    const nT = Object.keys(ts).length;
    const pc = function (e) { return num(e * 100, e < 0.1 ? 2 : 1) + '%'; };
    const okH = errH <= 0.05, okS = errS <= 0.05;
    let msg = 'ΔH°' + T('：誤差 ', ': off by ') + pc(errH) + (okH ? ' <span class="ok">✓</span>' : ' <span class="no">✗</span>') + T('；', '; ') +
      'ΔS°' + T('：誤差 ', ': off by ') + pc(errS) + (okS ? ' <span class="ok">✓</span>' : ' <span class="no">✗</span>');
    if (okH && okS) msg += T('。破解成功！', '. Cracked!');
    else msg += T('。提示：每一筆先算 ΔG° = −RT ln K（R = 8.314 J/(mol·K)，記得換成 kJ），再看 ΔG° 對 T 的直線。', '. Hint: for each record work out ΔG° = −RT ln K (R = 8.314 J/(mol·K); convert to kJ), then look at the straight line of ΔG° against T.');
    $('mysOut').innerHTML = msg;
    if (snd()) {
      if (okH && okS) { window.LabSound.tone({ freq: 880, dur: 0.12, gain: 0.18 }); window.LabSound.tone({ freq: 1320, dur: 0.16, gain: 0.14, delay: 0.1 }); }
      else window.LabSound.tone({ freq: 330, dur: 0.15, type: 'triangle', gain: 0.12 });
    }
    if (window.LabMission) window.LabMission.emit('answer', { errH: errH, errS: errS, nT: nT, tries: mys.tries, revealed: mys.revealed });
  }
  function reveal() {
    if (!mys) return;
    acted();
    mys.revealed = true;
    $('mysOut').innerHTML = T('答案：ΔH° = ' + sgn(mys.dH, 1) + ' kJ/mol' + T('，', ', ') + 'ΔS° = ' + sgn(mys.dS, 1) + ' J/(mol·K)。這個反應已揭曉，按「換一個」再挑戰。',
      'Answer: ΔH° = ' + sgn(mys.dH, 1) + ' kJ/mol, ΔS° = ' + sgn(mys.dS, 1) + ' J/(mol·K). This one is revealed; press “Another one” to try again.');
    rows.forEach(function (r) { if (r.mysId === mys.id) r.revealed = true; });
    refreshAll();
  }

  // ---------- 事件 ----------
  function onSlider(el) {
    if (syncing) return;
    acted();
    if (el === elT) { if (state.sweeping) stopSweep(); state.T = val(elT); afterChange(true); return; }
    if (el === elH) state.cH = val(elH);
    if (el === elS) state.cS = val(elS);
    $('rxInfo').innerHTML = rxInfoHTML();
    afterChange(true);
  }
  [elT, elH, elS].forEach(function (el) { el.addEventListener('input', function () { onSlider(el); }); });
  document.querySelectorAll('#rxSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); if (b.dataset.rx !== state.rx) setRx(b.dataset.rx); });
  });
  $('record').addEventListener('click', record);
  $('sweep').addEventListener('click', startSweep);
  $('roomT').addEventListener('click', function () { acted(); stopSweep(); setT(298.15, true); });
  $('clearAll').addEventListener('click', function () {
    acted();
    rows = []; segId++;
    statusEl.innerHTML = T('已清除紀錄表與圖上的紀錄點，開始新的一段紀錄。', 'The table and the recorded points have been cleared; a new set of records begins.');
    renderTable(); drawGraph();
  });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      state.tab = b.dataset.tab;
      document.querySelectorAll('#tabs button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      updateGraphText(); drawGraph();
    });
  });
  $('showAll').addEventListener('change', function () { acted(); state.showAll = $('showAll').checked; drawGraph(); });
  $('mysOn').addEventListener('click', startMystery);
  $('mysNew').addEventListener('click', startMystery);
  $('mysOff').addEventListener('click', stopMystery);
  $('check').addEventListener('click', checkAnswer);
  ['ansH', 'ansS'].forEach(function (id) { $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); checkAnswer(); } }); });
  $('reveal').addEventListener('click', reveal);
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
    if (ev.detail && ev.detail.name === 'fs') resize();
  });

  // 在圖上拖曳改變溫度：ΔG°—T 與 ln K—1/T 用橫座標；四象限圖用指標位置決定分界線的斜率
  let gdrag = false;
  function graphT(ev) {
    if (!GA) return null;
    const b = gcv.getBoundingClientRect(), x = ev.clientX - b.left, y = ev.clientY - b.top;
    const o = GA.o;
    const ux = o.x0 + (x - GA.X0) / (GA.X1 - GA.X0) * (o.x1 - o.x0);
    const uy = o.y0 + (GA.Y0 - y) / (GA.Y0 - GA.Y1) * (o.y1 - o.y0);
    if (state.tab === 'dg') return ux;
    if (state.tab === 'k') return ux > 0 ? 1000 / ux : null;
    if (Math.abs(ux) < 5 || ux * uy <= 0) return null; // 四象限圖：同號的位置才有對應的溫度
    return 1000 * uy / ux;
  }
  gcv.addEventListener('pointerdown', function (ev) {
    const t = graphT(ev);
    if (t == null || !isFinite(t)) return;
    acted(); stopSweep();
    gdrag = true;
    try { gcv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    setT(Math.round(t), true);
    ev.preventDefault();
  });
  gcv.addEventListener('pointermove', function (ev) {
    if (!gdrag) return;
    const t = graphT(ev);
    if (t != null && isFinite(t)) setT(Math.round(t), true);
  });
  function endDrag() { gdrag = false; }
  gcv.addEventListener('pointerup', endDrag);
  gcv.addEventListener('pointercancel', endDrag);

  function buildDataTables() {
    const rt = $('rxTable'), st = $('spTable');
    if (rt) {
      let h = '<thead><tr><th class="l">' + T('反應', 'Reaction') + '</th><th>ΔH°<br><small>kJ/mol</small></th><th>ΔS°<br><small>J/(mol·K)</small></th><th>ΔG°(298 K)<br><small>kJ/mol</small></th><th>T*<br><small>K</small></th><th>Δn</th></tr></thead><tbody>';
      C.ORDER.forEach(function (id) {
        const d = C.rxData(id), t = C.turning(d.dH, d.dS);
        h += '<tr><td class="l">' + eqHTML(id) + '</td><td>' + sgn(d.dH, 2) + '</td><td>' + sgn(d.dS, 1) + '</td><td>' + sgn(C.dG(d.dH, d.dS, 298.15), 2) + '</td><td>' + (t.T != null ? num(t.T, 1) : '—') + '</td><td>' + sgn(d.dn, 0) + '</td></tr>';
      });
      rt.innerHTML = h + '</tbody>';
    }
    if (st) {
      const SRC = { OS: 'OpenStax', JANAF: 'NIST-JANAF', CODATA: 'CODATA', CRC: 'CRC' };
      let h = '<thead><tr><th class="l">' + T('物質', 'Substance') + '</th><th>Δ<sub>f</sub>H°<br><small>kJ/mol</small></th><th>S°<br><small>J/(mol·K)</small></th><th class="l">' + T('出處', 'Source') + '</th></tr></thead><tbody>';
      Object.keys(C.SP).forEach(function (k) {
        const s = C.SP[k];
        h += '<tr><td class="l">' + fH(k) + '</td><td>' + num(s.H, 2) + '</td><td>' + num(s.S, 2) + '</td><td class="l">' + SRC[s.src] + '</td></tr>';
      });
      st.innerHTML = h + '</tbody>';
    }
  }

  function themeChanged() {
    if (LD.refresh) LD.refresh();
    readColors();
    updateGraphText();
    drawAll();
  }
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lg = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); drawGraph(); } }).observe(gcv);
  } else window.addEventListener('resize', resize);

  // 測試用（Playwright）：讀取目前狀態（短名 __gfe）
  window.__gfe = {
    state: state, now: now, rows: function () { return rows; }, mys: function () { return mys; },
    setT: function (v) { setT(v, true); }, acted: function () { return userActed; }
  };

  // ======================= 啟動 =======================
  readColors();
  buildDataTables();
  setVal(elT, 298.15);
  setVal(elH, state.cH); setVal(elS, state.cS);
  setRx('vap');
  updateSoundButton();
  resize();
  startLoop();
})();
