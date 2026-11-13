/*
 * esterification-core.js — 「酯化反應」的化學核心（EsterCore）：不碰 DOM，Node 與瀏覽器共用。
 *
 * 反應：RCOOH（酸 A）＋ R'OH（醇 B）⇌ RCOOR'（酯 E）＋ H2O（水 W），濃硫酸催化，水浴加熱、迴流。
 *
 * 平衡：Kc = [E][W] / ([A][B]) = nE·nW / (nA·nB)（Δn = 0，體積消去、沒有單位）。
 *   K(25 °C) = 4.0：Berthelot 與 Péan de Saint-Gilles（1862）等莫耳的乙酸＋乙醇，極限約 2/3 的酸變成酯，
 *   K = (2/3)² ÷ (1/3)² = 4。他們也發現極限「幾乎與溫度無關、幾乎與酸和醇的種類無關」，
 *   所以九種酯都用同一個 K（真實值大約在 3–5.5 之間，例如甲醇約 5；〈模擬方法〉有寫）。
 *   ΔH° = −3.8 kJ/mol（液態，由生成焓算：乙酸乙酯 −479.86〔NIST，Wiberg & Waldron 1991〕、水 −285.83、
 *   乙酸 −484.3、乙醇 −277.6〔OpenStax《Chemistry 2e》附錄 G〕），凡特荷夫：K(T) = K(298.15 K)·exp(−ΔH/R·(1/T − 1/298.15))。
 *   放熱很小，所以 80 °C 的 K 約 3.1，只比室溫小一點：加熱是為了「快」，不是為了「多」。
 *
 * 速率（模擬用的估計值，數量級接近課本實驗：濃硫酸、70–80 °C 迴流約 1 小時接近平衡；不加催化劑的室溫要好幾個月）：
 *   dξ/dt = k(T)/V · (nA·nB − nE·nW / K)        （ξ：反應進度 mol，V：混合液體積 L）
 *   k(T) = 立體因子 × [ ku·酸自催化 · e^(−Eu/R(1/T−1/T0)) + kc · [H2SO4] · e^(−Ec/R(1/T−1/T0)) ]
 *   ku = 1.0×10⁻⁸ L/(mol·s)、Eu = 65 kJ/mol；kc = 2.4×10⁻⁵ L²/(mol²·s)、Ec = 55 kJ/mol；[H2SO4] 上限算 2 M。
 *   立體因子：甲酸 3、乙酸 1、丁酸 0.6；甲醇 1.5、乙醇 1、異戊醇 0.9（只表現「越小越快」的趨勢）；甲酸較強，自催化 ×10。
 * 體積：各成分純液體體積相加（忽略混合時的體積變化）＋濃硫酸。迴流冷凝管讓揮發的物質流回，不計損失。
 * 分子篩（3A）：每次加 20 g，吸水量為本身質量的 20%（0.222 mol 水），吸水速率 = nW·(1 − 已吸/容量) / 900 s。
 *
 * 3D：mechanism(acid, alc, mode) 給出反應物、過渡、產物三個關鍵畫面的原子座標（Å）。
 *   mode 'acyl'：酸失去 OH、醇失去 H（真實的機構；Roberts & Urey 1938 用 O-18 標記的醇證實標記留在酯裡）；
 *   mode 'alkyl'：假設醇失去 OH、酸失去 H（錯誤的假設：標記會跑到水裡）。
 *   鍵長（Å）：C–C 1.53、C–H 1.09、C=O 1.21、C(=O)–O 1.34、O–C(烷基) 1.43、O–H 0.96；鍵角用 sp3 109.5°、sp2 120° 附近的典型值。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EsterCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const R = 8.314;            // J/(mol·K)
  const T0 = 298.15;          // K
  const K25 = 4.0;
  const DH = -3.8;            // kJ/mol
  const KU = 1.0e-8, EU = 65000;
  const KC = 2.4e-5, EC = 55000;
  const CH_MAX = 2;           // mol/L
  const H2SO4_PER_ML = 1.84 * 0.98 / 98.079;   // 濃硫酸 98%、密度 1.84 g/mL → mol/mL（約 0.0184）
  const SIEVE_G = 20, SIEVE_CAP = 0.20 * SIEVE_G / 18.015, SIEVE_TAU = 900;
  const FLASKS = [50, 100, 250, 500, 1000];   // 圓底燒瓶（mL）：選液體不超過一半的最小一個；之後加料最多到六分滿
  const O18 = 2.004;          // O-18 比 O-16 多的質量（g/mol）

  // 數據：M（g/mol）、rho（g/mL，20–25 °C）、bp（°C，1 atm）——CRC Handbook of Chemistry and Physics, Physical Constants of Organic Compounds
  const ACIDS = {
    formic: { zh: '甲酸', en: 'formic acid', stemZh: '甲酸', stemEn: 'formate', R: 'H', cond: 'HCOOH', M: 46.03, rho: 1.220, bp: 100.8, steric: 3, self: 10,
      smell: ['刺鼻（螞蟻叮人的酸）', 'pungent (the acid in ant stings)'] },
    acetic: { zh: '乙酸', en: 'acetic acid', stemZh: '乙酸', stemEn: 'acetate', R: 'CH3', cond: 'CH3COOH', M: 60.05, rho: 1.049, bp: 117.9, steric: 1, self: 1,
      smell: ['醋的酸味', 'vinegar'] },
    butyric: { zh: '丁酸', en: 'butanoic acid', stemZh: '丁酸', stemEn: 'butanoate', R: 'CH3CH2CH2', cond: 'CH3CH2CH2COOH', M: 88.11, rho: 0.953, bp: 163.7, steric: 0.6, self: 1,
      smell: ['臭酸的奶油、汗臭', 'rancid butter, sweaty socks'] }
  };
  const ALCS = {
    methanol: { zh: '甲醇', en: 'methanol', ylZh: '甲', ylEn: 'methyl', R: 'CH3', cond: 'CH3OH', M: 32.04, rho: 0.791, bp: 64.7, steric: 1.5 },
    ethanol: { zh: '乙醇', en: 'ethanol', ylZh: '乙', ylEn: 'ethyl', R: 'CH2CH3', cond: 'CH3CH2OH', M: 46.07, rho: 0.789, bp: 78.3, steric: 1 },
    isoamyl: { zh: '異戊醇', en: 'isopentyl alcohol', ylZh: '異戊', ylEn: 'isopentyl', R: 'CH2CH2CH(CH3)2', cond: '(CH3)2CHCH2CH2OH', M: 88.15, rho: 0.810, bp: 131.1, steric: 0.9 }
  };
  const ESTERS = {
    'formic|methanol': { M: 60.05, rho: 0.974, bp: 31.7, smell: ['微甜，像乙醚', 'sweetish, like ether'] },
    'formic|ethanol': { M: 74.08, rho: 0.917, bp: 54.4, smell: ['蘭姆酒、覆盆子', 'rum, raspberry'] },
    'formic|isoamyl': { M: 116.16, rho: 0.882, bp: 124, smell: ['李子', 'plum'] },
    'acetic|methanol': { M: 74.08, rho: 0.934, bp: 56.9, smell: ['膠水、淡淡的果香', 'glue, faintly fruity'] },
    'acetic|ethanol': { M: 88.11, rho: 0.900, bp: 77.1, smell: ['去光水、梨子', 'nail-polish remover, pear'] },
    'acetic|isoamyl': { M: 130.19, rho: 0.876, bp: 142, smell: ['香蕉', 'banana'] },
    'butyric|methanol': { M: 102.13, rho: 0.898, bp: 102.8, smell: ['蘋果', 'apple'] },
    'butyric|ethanol': { M: 116.16, rho: 0.879, bp: 121, smell: ['鳳梨', 'pineapple'] },
    'butyric|isoamyl': { M: 158.24, rho: 0.862, bp: 179, smell: ['杏桃', 'apricot'] }
  };
  const WATER = { zh: '水', en: 'water', cond: 'H2O', M: 18.015, rho: 0.997, bp: 100.0 };

  function ester(acid, alc) {
    const a = ACIDS[acid], b = ALCS[alc], e = ESTERS[acid + '|' + alc];
    return Object.assign({ key: acid + '|' + alc, zh: a.stemZh + b.ylZh + '酯', en: b.ylEn + ' ' + a.stemEn,
      cond: (a.R === 'H' ? 'H' : a.R) + 'COO' + b.R }, e);
  }

  // ======================= 平衡 =======================
  /** K(T)，T 用 °C */
  function K(TC) { return K25 * Math.exp(-DH * 1000 / R * (1 / (TC + 273.15) - 1 / T0)); }
  /** 反應商 Q（分母為 0 時 Infinity；分子分母都是 0 時 NaN） */
  function Q(n) { return (n.E * n.W) / (n.A * n.B); }
  /** 由目前的莫耳數 n = {A,B,E,W} 求平衡的反應進度 ξ（正：再生成多少酯；負：水解多少）。
   *  f(ξ) = (E+ξ)(W+ξ) − K(A−ξ)(B−ξ) 在可行範圍內單調遞增，用二分法解。 */
  function solveXi(n, Kv) {
    const lo = -Math.min(n.E, n.W), hi = Math.min(n.A, n.B);
    if (hi - lo < 1e-15) return 0;
    const f = function (x) { return (n.E + x) * (n.W + x) - Kv * (n.A - x) * (n.B - x); };
    let a = lo, b = hi;
    if (f(a) >= 0) return a;
    if (f(b) <= 0) return b;
    for (let i = 0; i < 200; i++) {
      const m = (a + b) / 2;
      if (f(m) > 0) b = m; else a = m;
      if (b - a < 1e-14) break;
    }
    return (a + b) / 2;
  }
  function equilibrium(n, TC) {
    const x = solveXi(n, K(TC));
    return { xi: x, A: n.A - x, B: n.B - x, E: n.E + x, W: n.W + x };
  }
  /** 平衡產率（以酸為 1 mol、醇 r mol、沒有酯與水）：解析解 */
  function yieldAtRatio(r, Kv) {
    if (r <= 0) return 0;
    if (Math.abs(Kv - 1) < 1e-12) return r / (1 + r) / Math.min(1, r);
    // (K−1)x² − K(1+r)x + K r = 0 的較小根，除以限量試劑
    const a = Kv - 1, b = -Kv * (1 + r), c = Kv * r;
    const x = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a);
    return x / Math.min(1, r);
  }

  // ======================= 一次實驗 =======================
  /** o：{ acid, alc, A, B, E, W（mol）, cat（濃硫酸 mL）, T（°C）, label（醇的氧是 O-18） } */
  function createRun(o) {
    const run = {
      acid: o.acid || 'acetic', alc: o.alc || 'ethanol', label: !!o.label,
      A: +o.A || 0, B: +o.B || 0, E: +o.E || 0, W: +o.W || 0,
      cat: Math.max(0, +o.cat || 0), T: o.T == null ? 70 : +o.T,
      t: 0, xi: 0, cap: 0, bound: 0, sieves: 0,
      add: { A: 0, B: 0, E: 0, W: 0 }
    };
    run.nCat = run.cat * H2SO4_PER_ML;
    run.n0 = { A: run.A, B: run.B, E: run.E, W: run.W };
    const V0 = volume(run);
    run.flask = FLASKS.filter(function (c) { return V0 <= 0.5 * c; })[0] || FLASKS[FLASKS.length - 1];
    run.Tmin = run.T; run.Tmax = run.T;
    return run;
  }
  function volume(run, n) {
    n = n || run;
    const a = ACIDS[run.acid], b = ALCS[run.alc], e = ester(run.acid, run.alc);
    return n.A * a.M / a.rho + n.B * b.M / b.rho + n.E * e.M / e.rho + n.W * WATER.M / WATER.rho + run.cat;   // mL
  }
  function cH(run, n) { const V = volume(run, n); return V > 0 ? Math.min(CH_MAX, run.nCat / (V / 1000)) : 0; }
  /** 速率常數 k(T)，L/(mol·s) */
  function kRate(run, n) {
    const a = ACIDS[run.acid], b = ALCS[run.alc], Tk = run.T + 273.15;
    const st = a.steric * b.steric;
    const ku = KU * a.self * Math.exp(-EU / R * (1 / Tk - 1 / T0));
    const kc = KC * Math.exp(-EC / R * (1 / Tk - 1 / T0)) * cH(run, n);
    return st * (ku + kc);
  }
  /** 淨反應速率 dξ/dt（mol/s） */
  function rate(run, n) {
    n = n || run;
    const V = volume(run, n) / 1000;
    if (V <= 0) return 0;
    return kRate(run, n) / V * (n.A * n.B - n.E * n.W / K(run.T));
  }
  function sieveRate(run, n) {
    n = n || run;
    if (run.cap <= 0) return 0;
    const free = Math.max(0, 1 - n.bound / run.cap);
    return Math.max(0, n.W) * free / SIEVE_TAU;
  }
  function deriv(run, y) {
    const n = { A: y[0], B: y[1], E: y[2], W: y[3], bound: y[4] };
    const r = rate(run, n), s = sieveRate(run, n);
    return [-r, -r, r, r - s, s, r];
  }
  /** 前進 dt 秒（RK4，步長依反應的「剛性」自動切小） */
  function step(run, dt) {
    let left = dt, guard = 0;
    while (left > 1e-12 && guard++ < 4000) {
      const V = volume(run) / 1000;
      const lam = (V > 0 ? kRate(run) / V * (run.A + run.B + (run.E + run.W) / K(run.T)) : 0) + (run.cap > 0 ? 1 / SIEVE_TAU : 0);
      const h = Math.min(left, lam > 0 ? 0.15 / lam : left);
      const y = [run.A, run.B, run.E, run.W, run.bound, run.xi];
      const k1 = deriv(run, y);
      const y2 = y.map(function (v, i) { return v + k1[i] * h / 2; });
      const k2 = deriv(run, y2);
      const y3 = y.map(function (v, i) { return v + k2[i] * h / 2; });
      const k3 = deriv(run, y3);
      const y4 = y.map(function (v, i) { return v + k3[i] * h; });
      const k4 = deriv(run, y4);
      const yn = y.map(function (v, i) { return v + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]); });
      // 數值上不可為負（守恆：只把負值修成 0，誤差 < 1e-12）
      run.A = Math.max(0, yn[0]); run.B = Math.max(0, yn[1]); run.E = Math.max(0, yn[2]); run.W = Math.max(0, yn[3]);
      run.bound = Math.min(run.cap, Math.max(0, yn[4])); run.xi = yn[5];
      run.t += h; left -= h;
    }
    if (left > 1e-12) run.t += left;
    return run;
  }
  function setT(run, TC) { run.T = TC; run.Tmin = Math.min(run.Tmin, TC); run.Tmax = Math.max(run.Tmax, TC); }
  /** 加入 0.10 mol（或指定量）的某成分；燒瓶會超過六分滿就不加，傳回 false */
  function addSpecies(run, sp, dn) {
    dn = dn == null ? 0.1 : dn;
    const n = { A: run.A, B: run.B, E: run.E, W: run.W };
    n[sp] += dn;
    if (volume(run, n) > 0.6 * run.flask) return false;
    run[sp] += dn; run.add[sp] += dn;
    return true;
  }
  function addSieves(run) {
    if (run.sieves >= 5) return false;
    run.sieves++; run.cap += SIEVE_CAP;
    return true;
  }
  /** 加入的量（起始＋之後加的） */
  function inTotal(run, sp) { return run.n0[sp] + run.add[sp]; }
  /** 生成的酯（= 反應進度 ξ，負的是水解掉的） */
  function formed(run) { return run.xi; }
  /** 產率：生成的酯 ÷ 限量的反應物（酸或醇，含後來加的）；沒有反應物時 null */
  function yieldOf(run) {
    const base = Math.min(inTotal(run, 'A'), inTotal(run, 'B'));
    return base > 1e-9 ? run.xi / base : null;
  }
  /** 水解百分率：水解掉的酯 ÷ 加入的酯 */
  function hydrolysisOf(run) {
    const e = inTotal(run, 'E');
    return e > 1e-9 ? -run.xi / e : null;
  }
  /** 是否已達平衡：四種都存在、|ln(Q/K)| < 0.01，而且分子篩不再吸水 */
  function atEquilibrium(run) {
    if (!(run.A > 1e-7 && run.B > 1e-7 && run.E > 1e-7 && run.W > 1e-7)) return false;
    if (sieveRate(run) > 2e-7) return false;
    return Math.abs(Math.log(Q(run) / K(run.T))) < 0.003;
  }
  /** 兩成分的 Q 變化方向：'fwd'（Q < K，往右）、'rev'、'eq' */
  function direction(run) {
    const q = Q(run), k = K(run.T);
    if (!isFinite(q) && !isNaN(q)) return 'rev';
    if (isNaN(q)) return 'none';
    if (q === 0) return run.A > 0 && run.B > 0 ? 'fwd' : 'none';
    const l = Math.log(q / k);
    return Math.abs(l) < 0.01 ? 'eq' : l < 0 ? 'fwd' : 'rev';
  }
  /** 酯的莫耳質量（醇的氧有 O-18 標記時多 2.004） */
  function esterM(run, mode) { const e = ester(run.acid, run.alc); return e.M + (run.label && mode !== 'alkyl' ? O18 : 0); }
  function waterM(run, mode) { return WATER.M + (run.label && mode === 'alkyl' ? O18 : 0); }
  /** 分液（倒入飽和碳酸鈉溶液）：上層酯、下層水溶液；酸被中和放出 CO2 */
  function workup(run) {
    const e = ester(run.acid, run.alc);
    return {
      esterMol: run.E, esterMass: run.E * esterM(run), esterVol: run.E * e.M / e.rho,
      co2: run.A / 2 + run.nCat,   // Na2CO3 + 2 RCOOH → 2 RCOONa + H2O + CO2；H2SO4 + Na2CO3 → Na2SO4 + H2O + CO2
      label: run.label
    };
  }

  // ======================= 3D 幾何 =======================
  const DEG = Math.PI / 180;
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add3(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { const L = len(a) || 1; return [a[0] / L, a[1] / L, a[2] / L]; }
  /** NeRF：新原子 D 與 A 鍵結（鍵長 r）、∠D-A-B = th、二面角 D-A-B-C = ph */
  function place(A, B, C, r, th, ph) {
    const bc = unit(sub(A, B));
    let nn = cross(sub(B, C), bc);
    if (len(nn) < 1e-9) nn = cross([0, 0, 1], bc);
    if (len(nn) < 1e-9) nn = cross([0, 1, 0], bc);
    const n = unit(nn), m = cross(n, bc);
    const d = [-r * Math.cos(th * DEG), r * Math.sin(th * DEG) * Math.cos(ph * DEG), r * Math.sin(th * DEG) * Math.sin(ph * DEG)];
    return add3(A, add3(mul(bc, d[0]), add3(mul(m, d[1]), mul(n, d[2]))));
  }
  /** 依 z-matrix 建分子。z：[el, a, b, c, r, th, ph]（a、b、c 是先前原子的編號；前三個原子可省略部分） */
  function build(z) {
    const P = [], atoms = [], bonds = [];
    z.forEach(function (row, i) {
      const el = row[0];
      let p;
      if (i === 0) p = [0, 0, 0];
      else if (i === 1) p = [row[4], 0, 0];
      else if (i === 2) {
        const A = P[row[1]], B = P[row[2]];
        p = place(A, B, add3(B, [0, 1, 0]), row[4], row[5], 0);
        p[2] = 0;
      } else p = place(P[row[1]], P[row[2]], P[row[3]], row[4], row[5], row[6]);
      P.push(p);
      atoms.push({ el: el, p: p });
      if (i > 0) bonds.push({ a: row[1], b: i, o: row[7] || 1 });
    });
    return { atoms: atoms, bonds: bonds };
  }
  // 羧酸：0 羰基 C、1 羰基 O、2 羥基 O、3 羥基 H、4 起是 R
  function acidZ(key) {
    const z = [
      ['C'],
      ['O', 0, 0, 0, 1.21, 0, 0, 2],
      ['O', 0, 1, 0, 1.34, 123],
      ['H', 2, 0, 1, 0.96, 107, 0]
    ];
    if (key === 'formic') z.push(['H', 0, 1, 2, 1.10, 125, 180]);
    else {
      z.push(['C', 0, 1, 2, 1.50, 125, 180]);          // 4
      if (key === 'acetic') [0, 120, 240].forEach(function (d) { z.push(['H', 4, 0, 1, 1.09, 109.5, d]); });
      else {
        z.push(['C', 4, 0, 1, 1.53, 112, 180]);          // 5
        z.push(['C', 5, 4, 0, 1.53, 111, 180]);          // 6
        [60, 300].forEach(function (d) { z.push(['H', 4, 0, 1, 1.09, 109.5, d]); });
        [60, 300].forEach(function (d) { z.push(['H', 5, 4, 0, 1.09, 109.5, d]); });
        [180, 60, 300].forEach(function (d) { z.push(['H', 6, 5, 4, 1.09, 109.5, d]); });
      }
    }
    return z;
  }
  // 醇：0 羥基 O、1 α 碳、2 羥基 H、3 起是其他
  function alcZ(key) {
    const z = [
      ['O'],
      ['C', 0, 0, 0, 1.43],
      ['H', 0, 1, 0, 0.96, 108.5]
    ];
    if (key === 'methanol') [180, 60, 300].forEach(function (d) { z.push(['H', 1, 0, 2, 1.09, 109.5, d]); });
    else {
      z.push(['C', 1, 0, 2, 1.53, 109.5, 180]);         // 3
      [60, 300].forEach(function (d) { z.push(['H', 1, 0, 2, 1.09, 109.5, d]); });
      if (key === 'ethanol') [180, 60, 300].forEach(function (d) { z.push(['H', 3, 1, 0, 1.09, 109.5, d]); });
      else {
        // 異戊醇 HO–C1–C2–C3H(CH3)2
        z.push(['C', 3, 1, 0, 1.53, 111, 180]);         // 6：C3（次甲基）
        [60, 300].forEach(function (d) { z.push(['H', 3, 1, 0, 1.09, 109.5, d]); });   // 7、8：C2 的氫
        z.push(['C', 6, 3, 1, 1.53, 111, 180]);         // 9
        z.push(['C', 6, 3, 1, 1.53, 111, 60]);          // 10
        z.push(['H', 6, 3, 1, 1.09, 107, 300]);
        [180, 60, 300].forEach(function (d) { z.push(['H', 9, 6, 3, 1.09, 109.5, d]); });
        [180, 60, 300].forEach(function (d) { z.push(['H', 10, 6, 3, 1.09, 109.5, d]); });
      }
    }
    return z;
  }
  function molecule(kind, key) { return build(kind === 'acid' ? acidZ(key) : alcZ(key)); }
  /** 剛體搬移：把舊座標系（原點 o、主軸指向 p1、參考方向 p2）對到新的（o', 主軸 q1, 參考 q2） */
  function frame(o, p1, p2) {
    const e1 = unit(sub(p1, o));
    let v = sub(p2, o); v = sub(v, mul(e1, dot(v, e1)));
    const e2 = unit(v), e3 = cross(e1, e2);
    return [e1, e2, e3];
  }
  function mover(oOld, Fo, oNew, Fn) {
    return function (p) {
      const d = sub(p, oOld), c = [dot(d, Fo[0]), dot(d, Fo[1]), dot(d, Fo[2])];
      return add3(oNew, add3(mul(Fn[0], c[0]), add3(mul(Fn[1], c[1]), mul(Fn[2], c[2]))));
    };
  }
  /** 水的三個原子：氧在 O，兩個氫對稱放在 axis 兩側（H–O–H 104.5°），平面法向量 up */
  function waterAt(O, axis, up) {
    const a = unit(axis), b = unit(cross(up, a)), h = 104.5 / 2 * DEG;
    return [add3(O, mul(add3(mul(a, Math.cos(h)), mul(b, Math.sin(h))), 0.96)),
      add3(O, mul(add3(mul(a, Math.cos(h)), mul(b, -Math.sin(h))), 0.96))];
  }
  /**
   * 機構的三個關鍵畫面。傳回 {
   *   atoms: [{ el, from: 'acid'|'alc', role, R, M, P（三個關鍵畫面的座標）, label（O-18） }],
   *   bondsR: 反應物的鍵、bondsP: 產物的鍵（{ a, b, o }，原子編號是合併後的），
   *   esterSet / waterSet: 產物中屬於酯／水的原子編號, label: 標記原子編號, mode }
   */
  function mechanism(acidKey, alcKey, mode) {
    mode = mode === 'alkyl' ? 'alkyl' : 'acyl';
    const ac = molecule('acid', acidKey), al = molecule('alc', alcKey);
    const nA = ac.atoms.length;
    const Cc = ac.atoms[0].p, Oc = ac.atoms[1].p, Oh = ac.atoms[2].p, Hh = ac.atoms[3].p;
    const Oa = al.atoms[0].p, Ca = al.atoms[1].p, Ha = al.atoms[2].p;
    const up = [0, 0, 1];                                // 酸在 xy 平面上，醇從上方（+z）靠近
    const away = unit(sub(Oh, Cc));
    const atoms = [];
    ac.atoms.forEach(function (a, i) { atoms.push({ el: a.el, from: 'acid', role: ['Cc', 'Oc', 'Oh', 'Hh'][i] || 'R', R: a.p.slice(), M: a.p.slice(), P: a.p.slice() }); });
    al.atoms.forEach(function (a, i) { atoms.push({ el: a.el, from: 'alc', role: ['Oa', 'Ca', 'Ha'][i] || 'R2', R: null, M: null, P: null }); });
    const iOa = nA, iCa = nA + 1, iHa = nA + 2, iOh = 2, iHh = 3;
    const Fal = frame(Oa, Ca, Ha);
    // 反應物：醇的氧在羰基碳上方 3.4 Å，醇的氫朝向酸的羥基氧
    const OaR = add3(Cc, add3(mul(up, 3.3), mul(away, 0.9)));
    const FR = frame(OaR, add3(OaR, unit(add3(up, mul(away, -0.9)))), Oh);
    const mvR = mover(Oa, Fal, OaR, FR);
    // 過渡（示意）：醇的氧在羰基碳上方約 1.6 Å（四面體中間體附近）
    const OaM = add3(Cc, add3(mul(up, 1.55), mul(away, 0.25)));
    const FM = frame(OaM, add3(OaM, unit(add3(up, mul(away, -0.5)))), Oh);
    const mvM = mover(Oa, Fal, OaM, FM);
    al.atoms.forEach(function (a, i) { atoms[nA + i].R = mvR(a.p); atoms[nA + i].M = mvM(a.p); });
    // 過渡畫面：兩個要組成水的氫往羥基氧靠
    atoms[iHa].M = add3(Oh, mul(unit(sub(atoms[iOa].M, Oh)), 1.05));
    atoms[iHh].M = Hh.slice();
    const bondsR = ac.bonds.map(function (b) { return { a: b.a, b: b.b, o: b.o }; })
      .concat(al.bonds.map(function (b) { return { a: b.a + nA, b: b.b + nA, o: b.o }; }));
    const has = function (L, i, j) { return L.some(function (b) { return (b.a === i && b.b === j) || (b.a === j && b.b === i); }); };
    let bondsP, esterSet = [], waterSet = [];
    const waterO = add3(Cc, add3(mul(away, 3.6), mul(up, -2.2)));
    if (mode === 'acyl') {
      // 醇的氧取代羥基氧的位置；烷基與羰基氧同側（Z 型酯），C–O–C 116°
      const CaT = place(Oh, Cc, Oc, 1.43, 116, 0);
      const Fp = frame(Oh, CaT, Cc);
      const mvP = mover(Oa, frame(Oa, Ca, Ha), Oh, Fp);
      al.atoms.forEach(function (a, i) { atoms[nA + i].P = mvP(a.p); });
      // 水：羥基 O、羥基 H、醇的 H
      atoms[iOh].P = waterO;
      const hs = waterAt(waterO, mul(away, -1), up);
      atoms[iHh].P = hs[0]; atoms[iHa].P = hs[1];
      bondsP = bondsR.filter(function (b) {
        return !(has([b], 0, iOh) || has([b], iOh, iHh) || has([b], iOa, iHa));
      }).concat([{ a: 0, b: iOa, o: 1 }, { a: iOh, b: iHh, o: 1 }, { a: iOh, b: iHa, o: 1 }]);
      waterSet = [iOh, iHh, iHa];
    } else {
      // 假設：醇失去 OH，烷基接到酸的羥基氧上（取代原本的 H）
      const CaT = place(Oh, Cc, Oc, 1.43, 116, 0);
      const Fp = frame(Oh, CaT, Cc);
      const mvP = mover(Oa, frame(Oa, Ca, Ha), Oh, Fp);
      al.atoms.forEach(function (a, i) { if (i !== 0 && i !== 2) atoms[nA + i].P = mvP(a.p); });
      const wO = add3(Cc, add3(mul(away, 1.2), mul(up, 3.6)));
      atoms[iOa].P = wO;
      const hs = waterAt(wO, mul(up, -1), [0, 1, 0]);
      atoms[iHa].P = hs[0]; atoms[iHh].P = hs[1];
      bondsP = bondsR.filter(function (b) {
        return !(has([b], iOh, iHh) || has([b], iOa, iCa));
      }).concat([{ a: iOh, b: iCa, o: 1 }, { a: iOa, b: iHh, o: 1 }]);
      waterSet = [iOa, iHa, iHh];
      // 過渡畫面：酸的氫靠向醇的氧
      atoms[iHh].M = add3(atoms[iOa].M, mul(unit(sub(Oh, atoms[iOa].M)), 1.05));
      atoms[iHa].M = atoms[iHa].R.slice();
    }
    for (let i = 0; i < atoms.length; i++) if (waterSet.indexOf(i) < 0) esterSet.push(i);
    atoms[iOa].label = true;
    // 置中：以三個畫面的整體中心為原點
    let c = [0, 0, 0], cnt = 0;
    atoms.forEach(function (a) { ['R', 'M', 'P'].forEach(function (k) { c = add3(c, a[k]); cnt++; }); });
    c = mul(c, 1 / cnt);
    atoms.forEach(function (a) { ['R', 'M', 'P'].forEach(function (k) { a[k] = sub(a[k], c); }); });
    return { atoms: atoms, bondsR: bondsR, bondsP: bondsP, esterSet: esterSet, waterSet: waterSet, label: iOa, mode: mode, iOh: iOh, iOa: iOa, iCa: iCa };
  }
  /** 機構動畫在進度 p（0–1）時的座標：0 → R、0.5 → M、1 → P，用平滑的插值 */
  function mechAt(mech, p) {
    p = Math.max(0, Math.min(1, p));
    const s = function (u) { return u * u * (3 - 2 * u); };
    return mech.atoms.map(function (a) {
      const u = p < 0.5 ? s(p / 0.5) : s((p - 0.5) / 0.5);
      const P0 = p < 0.5 ? a.R : a.M, P1 = p < 0.5 ? a.M : a.P;
      return [P0[0] + (P1[0] - P0[0]) * u, P0[1] + (P1[1] - P0[1]) * u, P0[2] + (P1[2] - P0[2]) * u];
    });
  }
  function dist(a, b) { return len(sub(a, b)); }
  function angle(a, o, b) { return Math.acos(Math.max(-1, Math.min(1, dot(unit(sub(a, o)), unit(sub(b, o)))))) / DEG; }

  return {
    R: R, K25: K25, DH: DH, KU: KU, EU: EU, KC: KC, EC: EC, H2SO4_PER_ML: H2SO4_PER_ML, SIEVE_G: SIEVE_G, SIEVE_CAP: SIEVE_CAP,
    SIEVE_TAU: SIEVE_TAU, FLASKS: FLASKS, O18: O18, CH_MAX: CH_MAX,
    ACIDS: ACIDS, ALCS: ALCS, ESTERS: ESTERS, WATER: WATER, ester: ester,
    K: K, Q: Q, solveXi: solveXi, equilibrium: equilibrium, yieldAtRatio: yieldAtRatio,
    createRun: createRun, volume: volume, cH: cH, kRate: kRate, rate: rate, sieveRate: sieveRate, step: step, setT: setT,
    addSpecies: addSpecies, addSieves: addSieves, inTotal: inTotal, formed: formed, yieldOf: yieldOf, hydrolysisOf: hydrolysisOf,
    atEquilibrium: atEquilibrium, direction: direction, esterM: esterM, waterM: waterM, workup: workup,
    molecule: molecule, mechanism: mechanism, mechAt: mechAt, dist: dist, angle: angle
  };
});
