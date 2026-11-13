/*
 * mole-concept-core.js — 「莫耳與亞佛加厥數」的化學核心（與畫面無關，Node 可直接 require）
 *
 * 三個部分：
 *   1. 天平與換算：質量 m、莫耳數 n、粒子數 N、（氣體）體積 V 的互換。m = nM、N = nN_A、V = nV_m（氣體）或 V = m/ρ（固體、液體）。
 *   2. 放大到原子：邊長 L 的立方體裡有幾個粒子 N = ρL³N_A/M；粒子間距 d = (M/ρN_A)^(1/3)；一直對切，切幾刀剩一個。
 *   3. 油膜法：油酸酒精溶液滴在撒了粉的水面，形成單分子膜。膜厚 h = V/A；假設分子是「高 h、寬 h/k」的長方柱，
 *      每個分子的體積 = h³/k²，N_A ≈ M k² /(ρ h³)（k = 1 就是立方體假設）。
 *
 * 數據：
 *   - 亞佛加厥數 N_A = 6.02214076 × 10^23 mol⁻¹（2019 SI 定義值，CODATA 2018）；R = 8.314462618 J/(mol·K)。
 *   - 原子量：IUPAC 標準原子量的慣用值（abridged / conventional，2021）。
 *   - 密度（g/cm³）：CRC Handbook of Chemistry and Physics；液體用 25 °C 的值。
 *   - 氣體當理想氣體：STP（0 °C、1 atm）V_m = 22.414 L/mol；25 °C、1 atm V_m = 24.465 L/mol（臺灣課本取 22.4、24.5）。
 *   - 晶格常數：Cu 0.36149 nm、Au 0.40782 nm（面心立方），NaCl 0.56402 nm（岩鹽結構），CRC 手冊。
 *   - 油酸 C18H34O2：M = 282.47 g/mol、ρ ≈ 0.895 g/cm³（25 °C）；水面單分子膜每個分子約占 0.46 nm²（文獻約 0.4–0.5 nm²，
 *     模擬取 0.46），所以膜厚 h = (M/ρN_A)/0.46 nm² ≈ 1.14 nm。
 *
 * 油膜實驗的誤差模型（固定的偽亂數，同樣的操作順序每次結果都一樣，任務證明才能重現）：
 *   - 每一滴的體積 = 滴管的標稱滴體積 ×（1 ± 4%）；校正滴管：一滴一滴滴進量筒，直到達到刻度（1、2 或 5 mL），數滴數。
 *   - 粉撒太厚：油膜推不開，面積只有應有的 75%；不撒粉：看不到油膜的邊界，不能量面積。
 *   - 油膜的形狀：不規則的圓（2–6 次諧波），面積精確等於「油酸體積 ÷ 膜厚」；超出水盤就被盤邊擋住（量到的面積偏小）。
 *   - 數格子：每一格用 8 × 8 個點估計被油膜蓋住的比例，超過一半算一格、不到一半不算（課本的數法）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MoleCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ======================= 常數 =======================
  const NA = 6.02214076e23;            // mol⁻¹（定義值）
  const R = 8.314462618;               // J/(mol·K)（定義值）
  const ATM = 101325;                  // Pa
  const T0 = 273.15;
  const VM = { stp: R * T0 / ATM * 1000, rt: R * (T0 + 25) / ATM * 1000 };   // L/mol：22.414、24.465
  const COND = { stp: { T: T0, zh: '0 °C、1 atm（STP）', en: '0 °C, 1 atm (STP)' }, rt: { T: T0 + 25, zh: '25 °C、1 atm', en: '25 °C, 1 atm' } };
  /** 洛施密特常數（STP 下每 cm³ 理想氣體的分子數） */
  const LOSCHMIDT = NA / (VM.stp * 1000);

  // IUPAC 標準原子量（慣用值）與原子序
  const AW = { H: 1.008, He: 4.0026, C: 12.011, N: 14.007, O: 15.999, Na: 22.990, Al: 26.982, Cl: 35.45, Fe: 55.845, Cu: 63.546, Au: 196.97, Hg: 200.59 };
  const ZN = { H: 1, He: 2, C: 6, N: 7, O: 8, Na: 11, Al: 13, Cl: 17, Fe: 26, Cu: 29, Au: 79, Hg: 80 };
  function molarMass(comp) { let m = 0; for (const k in comp) m += AW[k] * comp[k]; return m; }
  function atomsOf(comp) { let a = 0; for (const k in comp) a += comp[k]; return a; }
  function electronsOf(comp) { let e = 0; for (const k in comp) e += ZN[k] * comp[k]; return e; }

  // ======================= 物質 =======================
  // phase：s 固體、l 液體、g 氣體；kind：atom 原子、molecule 分子、formula 化學式單位（離子晶體）
  const SUBS = [
    { id: 'C', zh: '石墨（碳）', en: 'Graphite (carbon)', f: 'C', comp: { C: 1 }, phase: 's', rho: 2.26, kind: 'atom' },
    { id: 'Al', zh: '鋁', en: 'Aluminium', f: 'Al', comp: { Al: 1 }, phase: 's', rho: 2.70, kind: 'atom' },
    { id: 'Fe', zh: '鐵', en: 'Iron', f: 'Fe', comp: { Fe: 1 }, phase: 's', rho: 7.874, kind: 'atom' },
    { id: 'Cu', zh: '銅', en: 'Copper', f: 'Cu', comp: { Cu: 1 }, phase: 's', rho: 8.96, kind: 'atom' },
    { id: 'Au', zh: '金', en: 'Gold', f: 'Au', comp: { Au: 1 }, phase: 's', rho: 19.3, kind: 'atom' },
    { id: 'NaCl', zh: '氯化鈉', en: 'Sodium chloride', f: 'NaCl', comp: { Na: 1, Cl: 1 }, phase: 's', rho: 2.165, kind: 'formula' },
    { id: 'C12H22O11', zh: '蔗糖', en: 'Sucrose', f: 'C12H22O11', comp: { C: 12, H: 22, O: 11 }, phase: 's', rho: 1.587, kind: 'molecule' },
    { id: 'H2O', zh: '水', en: 'Water', f: 'H2O', comp: { H: 2, O: 1 }, phase: 'l', rho: 0.99705, kind: 'molecule' },
    { id: 'C2H5OH', zh: '乙醇', en: 'Ethanol', f: 'C2H5OH', comp: { C: 2, H: 6, O: 1 }, phase: 'l', rho: 0.785, kind: 'molecule' },
    { id: 'Hg', zh: '汞', en: 'Mercury', f: 'Hg', comp: { Hg: 1 }, phase: 'l', rho: 13.534, kind: 'atom' },
    { id: 'H2', zh: '氫氣', en: 'Hydrogen', f: 'H2', comp: { H: 2 }, phase: 'g', kind: 'molecule' },
    { id: 'He', zh: '氦氣', en: 'Helium', f: 'He', comp: { He: 1 }, phase: 'g', kind: 'atom' },
    { id: 'CH4', zh: '甲烷', en: 'Methane', f: 'CH4', comp: { C: 1, H: 4 }, phase: 'g', kind: 'molecule' },
    { id: 'NH3', zh: '氨', en: 'Ammonia', f: 'NH3', comp: { N: 1, H: 3 }, phase: 'g', kind: 'molecule' },
    { id: 'N2', zh: '氮氣', en: 'Nitrogen', f: 'N2', comp: { N: 2 }, phase: 'g', kind: 'molecule' },
    { id: 'CO', zh: '一氧化碳', en: 'Carbon monoxide', f: 'CO', comp: { C: 1, O: 1 }, phase: 'g', kind: 'molecule' },
    { id: 'O2', zh: '氧氣', en: 'Oxygen', f: 'O2', comp: { O: 2 }, phase: 'g', kind: 'molecule' },
    { id: 'CO2', zh: '二氧化碳', en: 'Carbon dioxide', f: 'CO2', comp: { C: 1, O: 2 }, phase: 'g', kind: 'molecule' },
    { id: 'Cl2', zh: '氯氣', en: 'Chlorine', f: 'Cl2', comp: { Cl: 2 }, phase: 'g', kind: 'molecule' }
  ];
  const SUB = {};
  SUBS.forEach(function (s) {
    s.M = molarMass(s.comp);
    s.atoms = atomsOf(s.comp);            // 每個粒子含幾個原子（離子晶體：幾個離子）
    s.electrons = electronsOf(s.comp);    // 每個粒子含幾個電子（中性）
    s.Vm = s.phase === 'g' ? null : s.M / s.rho;   // 固體、液體的莫耳體積 cm³/mol
    SUB[s.id] = s;
  });

  /** 莫耳體積（cm³/mol）：固體、液體 M/ρ；氣體依條件（理想氣體） */
  function molarVolume(sub, cond) { return sub.phase === 'g' ? VM[cond || 'stp'] * 1000 : sub.Vm; }

  // 單位：g（質量）、mol（莫耳數）、N（粒子數，個）、V（體積：氣體用 L，固體液體用 mL = cm³）
  const UNITS = ['g', 'mol', 'N', 'V'];
  /** 1 mol 是多少「單位」 */
  function perMol(sub, unit, cond) {
    if (unit === 'g') return sub.M;
    if (unit === 'mol') return 1;
    if (unit === 'N') return NA;
    if (unit === 'V') return sub.phase === 'g' ? VM[cond || 'stp'] : sub.Vm;   // L 或 mL
    throw new Error('未知單位 ' + unit);
  }
  function toMol(sub, unit, value, cond) { return value / perMol(sub, unit, cond); }
  function fromMol(sub, unit, n, cond) { return n * perMol(sub, unit, cond); }
  /** 一份樣品的各種量 */
  function sample(sub, n, cond) {
    const V = n * molarVolume(sub, cond);    // cm³
    return {
      id: sub.id, phase: sub.phase, kind: sub.kind, M: sub.M,
      n: n, m: n * sub.M, N: n * NA, atoms: n * NA * sub.atoms, electrons: n * NA * sub.electrons,
      V: V, side: Math.cbrt(V), mOne: sub.M / NA, density: sub.phase === 'g' ? sub.M / molarVolume(sub, cond) : sub.rho
    };
  }
  /** 天平兩盤的任務事件資料 */
  function weighData(a, b, cond) {
    const pick = function (s) { return { id: s.id, phase: s.phase, unit: s.unit, m: s.m, n: s.n, N: s.N, atoms: s.atoms, electrons: s.electrons, V: s.V }; };
    return { a: pick(a), b: pick(b), cond: cond, dm: b.m - a.m };
  }

  // ======================= 放大到原子 =======================
  const ZOOM = {
    H2O: { id: 'H2O', zh: '水', en: 'Water', rho: SUB.H2O.rho, M: SUB.H2O.M, lattice: null, perCell: 0, kind: 'molecule' },
    Cu: { id: 'Cu', zh: '銅', en: 'Copper', rho: SUB.Cu.rho, M: SUB.Cu.M, lattice: 0.36149, perCell: 4, type: 'fcc', r: 0.128, kind: 'atom' },
    NaCl: { id: 'NaCl', zh: '氯化鈉', en: 'Sodium chloride', rho: SUB.NaCl.rho, M: SUB.NaCl.M, lattice: 0.56402, perCell: 4, type: 'rocksalt', rNa: 0.102, rCl: 0.181, kind: 'formula' },
    Au: { id: 'Au', zh: '金', en: 'Gold', rho: SUB.Au.rho, M: SUB.Au.M, lattice: 0.40782, perCell: 4, type: 'fcc', r: 0.144, kind: 'atom' }
  };
  /** 邊長 L（nm）的立方體裡平均有幾個粒子 */
  function countInCube(z, Lnm) { const Lcm = Lnm * 1e-7; return z.rho * Lcm * Lcm * Lcm / z.M * NA; }
  /** 每個粒子分到的立方體邊長（nm）＝粒子的平均間距 */
  function spacing(z) { return Math.cbrt(z.M / (z.rho * NA)) * 1e7; }
  /** 樣品（體積 V mL）裡的粒子數 */
  function countInVolume(z, VmL) { return z.rho * VmL / z.M * NA; }
  /** 從 N 個粒子開始一直對切，最多能切幾刀（切完至少還有 1 個） */
  function maxCuts(N) { return N < 1 ? 0 : Math.floor(Math.log2(N) + 1e-12); }
  /** 放大鏡的任務事件資料：src 'zoom'（拖放大倍率）或 'cut'（對切） */
  function zoomData(z, Lnm, V0, cuts, src) {
    const N0 = countInVolume(z, V0);
    return { id: z.id, L: Lnm, Nview: countInCube(z, Lnm), V0: V0, N0: N0, cuts: cuts, Nleft: N0 / Math.pow(2, cuts), src: src };
  }
  /** 數到 N 要幾年（每秒數一個） */
  function countYears(N) { return N / (365.25 * 86400); }
  const UNIVERSE_YEARS = 1.38e10;

  // ======================= 油膜法 =======================
  const OLEIC = { zh: '油酸', en: 'Oleic acid', comp: { C: 18, H: 34, O: 2 }, rho: 0.895, a0: 0.46 };
  OLEIC.M = molarMass(OLEIC.comp);
  OLEIC.vmol = OLEIC.M / (OLEIC.rho * NA) * 1e21;   // 一個分子的體積 nm³
  OLEIC.h = OLEIC.vmol / OLEIC.a0;                  // 單分子膜厚 nm
  OLEIC.k = OLEIC.h / Math.sqrt(OLEIC.a0);          // 膜中分子的「高 ÷ 寬」
  const TRAY = { W: 40, H: 30 };                    // 水盤 cm
  const DROPPERS = { fine: 0.016, mid: 0.020, wide: 0.025 };   // 標稱滴體積 mL
  const NOMINAL_DROP = 0.020;                       // 滴管沒校正時用的標示值（1 mL ≈ 50 滴）
  const DROP_NOISE = 0.04;
  const POWDER = { thin: 1, thick: 0.75, none: 1 };

  /** 固定的偽亂數：第 i 個值在 [−1, 1)（雜湊，與呼叫順序無關） */
  function hashU(i, salt) {
    let x = (i * 374761393 + (salt || 0) * 668265263) | 0;
    x = (x ^ (x >>> 13)) * 1274126177 | 0;
    x = x ^ (x >>> 16);
    return ((x >>> 0) / 4294967296) * 2 - 1;
  }
  function createSession() { return { drop: 0, tray: 0 }; }
  /** 第 i 滴的體積（mL） */
  function dropVolume(dropper, i) { return DROPPERS[dropper] * (1 + DROP_NOISE * hashU(i, 7)); }
  /** 校正滴管：一滴一滴滴進量筒直到 Vcal（mL），回傳滴數與估計的每滴體積 */
  function calibrate(sess, dropper, Vcal) {
    let V = 0, n = 0;
    while (V < Vcal - 1e-12) { V += dropVolume(dropper, sess.drop++); n++; }
    return { dropper: dropper, Vcal: Vcal, count: n, v: Vcal / n };
  }
  /** 新的一盤水（設定改變或按「換一盤水」時） */
  function newTray(sess, opts) {
    const t = sess.tray++;
    const harm = [];
    for (let k = 2; k <= 6; k++) harm.push({ k: k, a: (0.035 + 0.03 * (hashU(t * 11 + k, 3) + 1) / 2) / Math.sqrt(k - 1), p: Math.PI * (hashU(t * 11 + k, 5) + 1) });
    let I = 0, fmax = 0, fmin = 9;
    const NS = 720;
    for (let j = 0; j < NS; j++) {
      const f = shapeF(harm, 2 * Math.PI * j / NS);
      I += f * f; fmax = Math.max(fmax, f); fmin = Math.min(fmin, f);
    }
    I *= Math.PI / NS;   // ½∫f²dθ
    return {
      idx: t, dropper: opts.dropper, D: opts.D, powder: opts.powder,
      harm: harm, I: I, fmax: fmax, fmin: fmin,
      drops: 0, Vsol: 0, Voil: 0, A: 0, R: 0
    };
  }
  function shapeF(harm, th) { let f = 1; for (let j = 0; j < harm.length; j++) f += harm[j].a * Math.cos(harm[j].k * th + harm[j].p); return f; }
  /** 滴一滴油酸酒精溶液到盤中央 */
  function drip(sess, tray) {
    const v = dropVolume(tray.dropper, sess.drop++);
    tray.drops++;
    tray.Vsol += v;
    tray.Voil = tray.Vsol / tray.D;
    tray.A = tray.Voil / (OLEIC.h * 1e-7) * POWDER[tray.powder];   // cm²（粉太厚推不開）
    tray.R = Math.sqrt(tray.A / tray.I);
    return v;
  }
  /** 油膜半徑 r(θ)（cm） */
  function filmR(tray, th) { return tray.R * shapeF(tray.harm, th); }
  /** 點 (x, y)（cm，以盤中心為原點）是否在油膜上（盤邊擋住） */
  function inFilm(tray, x, y) {
    if (Math.abs(x) > TRAY.W / 2 || Math.abs(y) > TRAY.H / 2) return false;
    const r = Math.hypot(x, y);
    if (r <= tray.R * tray.fmin) return true;
    if (r > tray.R * tray.fmax) return false;
    return r <= filmR(tray, Math.atan2(y, x));
  }
  /** 油膜是否碰到盤邊 */
  function touches(tray) {
    if (!tray.drops) return false;
    for (let j = 0; j < 360; j++) {
      const th = 2 * Math.PI * j / 360, r = filmR(tray, th);
      if (Math.abs(r * Math.cos(th)) >= TRAY.W / 2 - 0.2 || Math.abs(r * Math.sin(th)) >= TRAY.H / 2 - 0.2) return true;
    }
    return false;
  }
  /** 數格子：格子邊長 s（cm）；回傳每一格的覆蓋比例與計數 */
  function countCells(tray, s) {
    const nx = Math.round(TRAY.W / s), ny = Math.round(TRAY.H / s), SS = 8;
    const cells = [];
    let count = 0, full = 0, part = 0, exact = 0;
    if (!tray.drops) return { s: s, nx: nx, ny: ny, cells: cells, count: 0, full: 0, part: 0, area: 0, exact: 0 };
    const rIn = tray.R * tray.fmin, rOut = tray.R * tray.fmax;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x0 = -TRAY.W / 2 + i * s, y0 = -TRAY.H / 2 + j * s, x1 = x0 + s, y1 = y0 + s;
        // 最近、最遠的距離
        const dxn = x0 > 0 ? x0 : x1 < 0 ? -x1 : 0, dyn = y0 > 0 ? y0 : y1 < 0 ? -y1 : 0;
        const near = Math.hypot(dxn, dyn), far = Math.hypot(Math.max(Math.abs(x0), Math.abs(x1)), Math.max(Math.abs(y0), Math.abs(y1)));
        let cov;
        if (near > rOut) continue;
        if (far < rIn) cov = 1;
        else {
          let c = 0;
          for (let b = 0; b < SS; b++) for (let a = 0; a < SS; a++) if (inFilm(tray, x0 + (a + 0.5) * s / SS, y0 + (b + 0.5) * s / SS)) c++;
          cov = c / (SS * SS);
        }
        if (cov <= 0) continue;
        exact += cov * s * s;
        const on = cov >= 0.5;
        if (on) { count++; if (cov >= 1) full++; else part++; }
        cells.push([i, j, cov, on]);
      }
    }
    return { s: s, nx: nx, ny: ny, cells: cells, count: count, full: full, part: part, area: count * s * s, exact: exact };
  }
  /** 量面積：回傳一筆紀錄（v 是學生用的每滴體積：校正值或標示值） */
  function measure(tray, grid, cal) {
    const visible = tray.powder !== 'none';
    const cc = visible ? countCells(tray, grid) : null;
    const v = cal ? cal.v : NOMINAL_DROP;
    return {
      tray: tray.idx, drops: tray.drops, D: tray.D, dropper: tray.dropper, powder: tray.powder, grid: grid,
      calVol: cal ? cal.Vcal : 0, v: v,
      Voil: tray.drops * v / tray.D,                 // 學生算的油酸體積 mL（= cm³）
      VoilTrue: tray.Voil,
      A: cc ? cc.area : null, count: cc ? cc.count : 0, Aexact: cc ? cc.exact : null,
      edge: touches(tray), visible: visible
    };
  }
  /** 過原點的最小平方直線 A = V/h：斜率 1/h（cm⁻¹）；r² 用過原點的定義 */
  function fitThroughOrigin(rows) {
    let sxx = 0, sxy = 0, syy = 0;
    rows.forEach(function (r) { sxx += r.Voil * r.Voil; sxy += r.Voil * r.A; syy += r.A * r.A; });
    if (!sxx || rows.length < 2) return null;
    const slope = sxy / sxx;
    let ss = 0;
    rows.forEach(function (r) { const e = r.A - slope * r.Voil; ss += e * e; });
    return { slope: slope, h: 1 / slope * 1e7, r2: syy ? 1 - ss / syy : 0, n: rows.length };
  }
  /** 從膜厚 h（nm）與形狀假設 k 估計亞佛加厥數 */
  function estimateNA(hnm, k) { const hcm = hnm * 1e-7; return OLEIC.M * k * k / (OLEIC.rho * hcm * hcm * hcm); }
  /** 「計算」：method 'last'（最後一筆）或 'fit'（所有紀錄的直線斜率）；k 是形狀假設 */
  function analyze(rows, method, k) {
    const ok = rows.filter(function (r) { return r.A != null && r.A > 0; });
    if (!ok.length) return null;
    const last = ok[ok.length - 1];
    const fit = fitThroughOrigin(ok);
    const useFit = method === 'fit' && fit;
    const h = useFit ? fit.h : last.Voil / last.A * 1e7;   // nm
    const NAe = estimateNA(h, k);
    const w = h / k;                                     // 分子的寬 nm
    const nMol = OLEIC.rho * (useFit ? null : last.Voil) / OLEIC.M;
    return {
      method: useFit ? 'fit' : 'last', h: h, hErr: h / OLEIC.h - 1, k: k, w: w, NA: NAe, NAerr: NAe / NA - 1,
      nMol: useFit ? null : nMol, Nmol: useFit ? null : last.A / (w * w * 1e-14),
      last: last, fit: fit, rows: ok.length,
      distinctDrops: ok.reduce(function (s, r) { s[r.tray + ':' + r.drops] = 1; return s; }, {}),
      grid: last.grid, edge: ok.some(function (r) { return r.edge; }), powder: last.powder, dropper: last.dropper, calVol: last.calVol, D: last.D
    };
  }
  /** 「計算」的任務事件資料 */
  function filmData(res, rows) {
    const used = res.method === 'fit' ? rows.filter(function (r) { return r.A != null && r.A > 0; }) : [res.last];
    const uniq = {};
    used.forEach(function (r) { uniq[r.tray + ':' + r.drops] = 1; });
    return {
      method: res.method, h: res.h, hTrue: OLEIC.h, hErr: res.hErr, k: res.k, NA: res.NA, NAerr: res.NAerr,
      points: Object.keys(uniq).length, r2: res.fit ? res.fit.r2 : null,
      grids: used.map(function (r) { return r.grid; }), edge: used.some(function (r) { return r.edge; }),
      powders: used.map(function (r) { return r.powder; }), droppers: used.map(function (r) { return r.dropper; }),
      cal: used.map(function (r) { return r.calVol; }), Ds: used.map(function (r) { return r.D; })
    };
  }

  return {
    NA: NA, R: R, ATM: ATM, T0: T0, VM: VM, COND: COND, LOSCHMIDT: LOSCHMIDT, AW: AW, ZN: ZN,
    molarMass: molarMass, atomsOf: atomsOf, electronsOf: electronsOf,
    SUBS: SUBS, SUB: SUB, UNITS: UNITS, molarVolume: molarVolume, perMol: perMol, toMol: toMol, fromMol: fromMol, sample: sample, weighData: weighData,
    ZOOM: ZOOM, countInCube: countInCube, spacing: spacing, countInVolume: countInVolume, maxCuts: maxCuts, zoomData: zoomData,
    countYears: countYears, UNIVERSE_YEARS: UNIVERSE_YEARS,
    OLEIC: OLEIC, TRAY: TRAY, DROPPERS: DROPPERS, NOMINAL_DROP: NOMINAL_DROP, DROP_NOISE: DROP_NOISE, POWDER: POWDER,
    hashU: hashU, createSession: createSession, dropVolume: dropVolume, calibrate: calibrate, newTray: newTray, drip: drip,
    filmR: filmR, inFilm: inFilm, touches: touches, countCells: countCells, measure: measure, fitThroughOrigin: fitThroughOrigin,
    estimateNA: estimateNA, analyze: analyze, filmData: filmData
  };
});
