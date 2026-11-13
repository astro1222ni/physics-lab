/*
 * gas-diffusion-core.js — 「氣體擴散與逸散（格雷厄姆定律）」的化學核心（與畫面無關，Node 可直接 require）
 *
 * 一、分子速率（理想氣體、馬克士威分布）
 *   平均速率 v̄ = √(8RT/πM)、方均根速率 √(3RT/M)、最可能速率 √(2RT/M)；
 *   速率分布 f(v) = 4π (M/2πRT)^(3/2) v² exp(−Mv²/2RT)（M 用 kg/mol）。
 *
 * 二、逸散（小孔、分子自由徑遠大於孔徑）
 *   每秒逸出的分子數 = ¼ n v̄ A，所以容器內的壓力 P(t) = P₀ e^(−t/τ)，τ = 4V/(A v̄)；
 *   半衰時間 t½ = τ ln 2 ∝ √(M/T)：同溫時逸散時間比 = √(M_B/M_A)（格雷厄姆逸散定律）。
 *   平均自由徑 λ = kT/(√2 π d² P)，d 取空氣分子的有效直徑 0.37 nm；克努森數 Kn = λ/孔徑，Kn ≫ 1 才是逸散。
 *
 * 三、長玻璃管的擴散（NH₃ 與 HCl 等，在 1 atm 的空氣中）
 *   兩端的棉花維持固定的蒸氣濃度，氣體在管中一維擴散（erfc 解）；白煙環出現在兩股氣體第一次相遇的地方：
 *   x/(L − x) = D_A/D_B。出現時間：該處濃度乘積達到示意門檻 THETA 的時刻（∝ L²/D），
 *   校準成 1 m 長的管、NH₃／HCl、25 °C 約 17 分鐘出現白煙（課堂常見 15–20 分鐘）。
 *   擴散係數兩種模型：
 *     'graham'（理想）：D ∝ 1/√M（以 NH₃ 在空氣中的 D 為基準），白煙環位置就是單純的 √M 比；
 *     'air'（空氣中擴散，較真實）：每種氣體對空氣的二元擴散係數，用 Fuller–Schettler–Giddings 式
 *       D = 0.00143 T^1.75 / (P √M_AB (Σv_A^(1/3) + Σv_B^(1/3))²)（cm²/s，P 用 bar，M_AB = 2/(1/M_A + 1/M_B)），
 *       擴散體積取自 Poling、Prausnitz、O'Connell《The Properties of Gases and Liquids》第 5 版表 11-1。
 *       NH₃ 0.220、HCl 0.172 cm²/s（25 °C），比值 1.28，和課堂實測常見的 1.27 相符（格雷厄姆比值是 1.46）。
 *   兩種模型的溫度效應都是 D ∝ T^1.75。
 *
 * 分子量：IUPAC 2021 標準原子量（H 1.008、C 12.011、N 14.007、O 15.999、F 18.998、S 32.06、Cl 35.45、Br 79.904、I 126.90…）。
 * 同位素：D 2.014102、U-235 235.04393、U-238 238.05079（AME2020）。
 */
(function (root) {
  'use strict';
  const R = 8.314462618;        // J/(mol·K)
  const KB = 1.380649e-23;      // J/K
  const NA = 6.02214076e23;     // 1/mol
  const P_ATM = 1.01325;        // bar
  const M_AIR = 28.96, V_AIR = 19.7;   // 空氣的平均分子量與 Fuller 擴散體積
  const D_AIR_MOL = 0.37e-9;    // m，估計平均自由徑用的分子有效直徑（空氣）

  // ---------- 氣體 ----------
  // f：化學式（ASCII，數字是下標）；M：g/mol；v：Fuller 擴散體積（只有擴散實驗用到的氣體才需要）；zh／en：名稱
  const GAS = {
    NH3: { f: 'NH3', M: 17.031, v: 20.7, zh: '氨', en: 'ammonia', role: 'base' },
    CH3NH2: { f: 'CH3NH2', M: 31.058, v: 15.9 + 4.54 + 5 * 2.31, zh: '甲胺', en: 'methylamine', role: 'base' },
    HCl: { f: 'HCl', M: 36.458, v: 21.0 + 2.31, zh: '氯化氫', en: 'hydrogen chloride', role: 'acid', salt: 'NH4Cl' },
    HBr: { f: 'HBr', M: 80.912, v: 21.9 + 2.31, zh: '溴化氫', en: 'hydrogen bromide', role: 'acid', salt: 'NH4Br' },
    HNO3: { f: 'HNO3', M: 63.012, v: 2.31 + 4.54 + 3 * 6.11, zh: '硝酸', en: 'nitric acid', role: 'acid', salt: 'NH4NO3' },
    HI: { f: 'HI', M: 127.908, v: 29.8 + 2.31, zh: '碘化氫', en: 'hydrogen iodide', role: 'acid', salt: 'NH4I' },
    HX: { f: 'HX', M: 0, v: 0, zh: '未知酸', en: 'unknown acid', role: 'acid', salt: 'NH4X' },
    // 逸散用
    H2: { f: 'H2', M: 2.016, zh: '氫氣', en: 'hydrogen' },
    D2: { f: 'D2', M: 4.028204, zh: '氘氣', en: 'deuterium' },
    He: { f: 'He', M: 4.0026, zh: '氦', en: 'helium' },
    CH4: { f: 'CH4', M: 16.043, zh: '甲烷', en: 'methane' },
    Ne: { f: 'Ne', M: 20.180, zh: '氖', en: 'neon' },
    N2: { f: 'N2', M: 28.014, zh: '氮氣', en: 'nitrogen' },
    CO: { f: 'CO', M: 28.010, zh: '一氧化碳', en: 'carbon monoxide' },
    O2: { f: 'O2', M: 31.998, zh: '氧氣', en: 'oxygen' },
    Ar: { f: 'Ar', M: 39.95, zh: '氬', en: 'argon' },
    CO2: { f: 'CO2', M: 44.009, zh: '二氧化碳', en: 'carbon dioxide' },
    N2O: { f: 'N2O', M: 44.013, zh: '一氧化二氮', en: 'nitrous oxide' },
    SO2: { f: 'SO2', M: 64.058, zh: '二氧化硫', en: 'sulfur dioxide' },
    Cl2: { f: 'Cl2', M: 70.90, zh: '氯氣', en: 'chlorine' },
    Kr: { f: 'Kr', M: 83.798, zh: '氪', en: 'krypton' },
    Xe: { f: 'Xe', M: 131.29, zh: '氙', en: 'xenon' },
    SF6: { f: 'SF6', M: 146.05, zh: '六氟化硫', en: 'sulfur hexafluoride' },
    UF6a: { f: 'UF6', iso: 235, M: 235.04393 + 6 * 18.998403, zh: '六氟化鈾（U-235）', en: 'uranium hexafluoride (U-235)' },
    UF6b: { f: 'UF6', iso: 238, M: 238.05079 + 6 * 18.998403, zh: '六氟化鈾（U-238）', en: 'uranium hexafluoride (U-238)' },
    X: { f: 'X', M: 0, zh: '未知氣體', en: 'unknown gas' }
  };
  const BASES = ['NH3', 'CH3NH2'];
  const ACIDS = ['HCl', 'HBr', 'HNO3', 'HI'];
  const EFF = ['H2', 'D2', 'He', 'CH4', 'NH3', 'Ne', 'N2', 'CO', 'O2', 'Ar', 'CO2', 'N2O', 'SO2', 'Cl2', 'Kr', 'Xe', 'SF6', 'UF6a', 'UF6b'];
  const unknown = { X: 0, HX: 0 };
  function M(id) { return id === 'X' || id === 'HX' ? unknown[id] : GAS[id].M; }

  // ---------- 分子速率 ----------
  function meanSpeed(Mg, Tk) { return Math.sqrt(8 * R * Tk / (Math.PI * Mg / 1000)); }
  function rmsSpeed(Mg, Tk) { return Math.sqrt(3 * R * Tk / (Mg / 1000)); }
  function mpSpeed(Mg, Tk) { return Math.sqrt(2 * R * Tk / (Mg / 1000)); }
  /** 馬克士威速率分布（s/m） */
  function maxwell(v, Mg, Tk) {
    const m = Mg / 1000, a = m / (2 * R * Tk);
    return 4 * Math.PI * Math.pow(a / Math.PI, 1.5) * v * v * Math.exp(-a * v * v);
  }
  /** 速率分布的累積機率（解析式：erf 與高斯項） */
  function maxwellCDF(v, Mg, Tk) {
    const x = v / mpSpeed(Mg, Tk);
    return erf(x) - 2 / Math.sqrt(Math.PI) * x * Math.exp(-x * x);
  }
  /** 誤差函數（Numerical Recipes 的 erfc Chebyshev 擬合，相對誤差 < 1.2e-7） */
  function erf(x) { return x >= 0 ? 1 - erfc(x) : erfc(-x) - 1; }

  // ---------- 擴散係數 ----------
  /** 對空氣的二元擴散係數（Fuller 式，cm²/s），P 用 bar */
  function fullerD(id, Tk, Pbar) {
    const g = GAS[id];
    const Mab = 2 / (1 / g.M + 1 / M_AIR);
    const s = Math.cbrt(g.v) + Math.cbrt(V_AIR);
    return 0.00143 * Math.pow(Tk, 1.75) / ((Pbar || P_ATM) * Math.sqrt(Mab) * s * s);
  }
  /** 擴散係數（cm²/s）：model 'graham'（D ∝ 1/√M，以 NH₃ 為基準）或 'air'（Fuller） */
  function diffD(id, Tk, model) {
    if (model === 'air' && id !== 'HX') return fullerD(id, Tk);
    return fullerD('NH3', Tk) * Math.sqrt(GAS.NH3.M / M(id));
  }

  // ---------- 逸散 ----------
  /** 時間常數 τ（s）：V 公升、孔徑 d 微米 */
  function effTau(Mg, Tk, dUm, VL) {
    const A = Math.PI * Math.pow(dUm * 1e-6 / 2, 2);
    return 4 * (VL * 1e-3) / (A * meanSpeed(Mg, Tk));
  }
  function effHalf(Mg, Tk, dUm, VL) { return effTau(Mg, Tk, dUm, VL) * Math.LN2; }
  function effP(P0, t, tau) { return P0 * Math.exp(-t / tau); }
  /** 每秒逸出的分子數 ¼ n v̄ A */
  function effRate(Mg, Tk, dUm, Ppa) {
    const A = Math.PI * Math.pow(dUm * 1e-6 / 2, 2);
    return 0.25 * (Ppa / (KB * Tk)) * meanSpeed(Mg, Tk) * A;
  }
  function meanFreePath(Tk, Ppa) { return KB * Tk / (Math.SQRT2 * Math.PI * D_AIR_MOL * D_AIR_MOL * Ppa); }
  function knudsen(Tk, Ppa, dUm) { return meanFreePath(Tk, Ppa) / (dUm * 1e-6); }

  // ---------- 長管擴散 ----------
  // 兩端的棉花維持固定的蒸氣濃度（相對值 1），氣體向管內一維擴散（半無限長的解）：
  //   c_A(x, t) = erfc(x / 2√(D_A t))、c_B(x, t) = erfc((L − x) / 2√(D_B t))
  // 白煙出現的位置：兩股氣體第一次相遇的地方。乘積 c_A c_B 在門檻很小時最先超過門檻的位置，
  //   由 ln erfc(z) ≈ −z² 得 x/D_A = (L − x)/D_B，也就是 x/(L − x) = D_A/D_B（與濃度、溫度、管長都無關）。
  // 白煙出現的時間：該處 c_A c_B 達到「看得見」的門檻 THETA 的時刻（示意的門檻，校準成 1 m、NH₃／HCl、25 °C 約 17 分鐘）。
  //   因為 z 只和 L²/(D t) 有關，出現時間 ∝ L²/D（嚴格成立）。
  const THETA = 2e-4;
  /** ln erfc(z)（z ≥ 0 時用 Chebyshev 式直接取對數，大 z 也準確） */
  function lnErfc(z) {
    if (z < 0) return Math.log(2 - erfc(-z));
    const t = 1 / (1 + 0.5 * z);
    return Math.log(t) - z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 +
      t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))));
  }
  function erfc(z) { return z < 0 ? 2 - Math.exp(lnErfc(-z)) : Math.exp(lnErfc(z)); }
  /** 管中某處、某時刻的相對濃度 */
  function conc(x, t, D, fromLeft, L) {
    if (t <= 0) return 0;
    const d = fromLeft ? x : L - x;
    return d <= 0 ? 1 : erfc(d / (2 * Math.sqrt(D * t)));
  }
  /**
   * 一次擴散實驗。o = { base, acid, model, L（cm）, T（K） }
   * 傳回 { DA, DB（cm²/s）, x（白煙環到鹼端的距離，cm）, frac（x/L）, t（出現時間，s）, ratio（距離比＝D_A/D_B）, graham（√M 比） }
   */
  function ring(o) {
    const DA = diffD(o.base, o.T, o.model), DB = diffD(o.acid, o.T, o.model);
    const frac = DA / (DA + DB), x = frac * o.L;
    // 在 x 處 ln c_A + ln c_B = ln THETA；左邊隨 t 遞增，二分法解 t（以 u = ln t）
    const g = function (t) { return lnErfc(x / (2 * Math.sqrt(DA * t))) + lnErfc((o.L - x) / (2 * Math.sqrt(DB * t))) - Math.log(THETA); };
    let lo = Math.log(1e-3), hi = Math.log(1e9);
    for (let k = 0; k < 200; k++) { const m = (lo + hi) / 2; if (g(Math.exp(m)) < 0) lo = m; else hi = m; }
    const t = Math.exp((lo + hi) / 2);
    return { DA: DA, DB: DB, x: x, frac: frac, t: t, ratio: DA / DB, graham: Math.sqrt(M(o.acid) / M(o.base)) };
  }
  /** 白煙環出現後的沉積量（示意，相對值）：出現後隨時間增加，帶寬隨 √t 變寬 */
  function deposit(x, t, rg, L) {
    if (!rg || t <= rg.t) return 0;
    const w = 0.012 * L + 0.02 * L * Math.sqrt((t - rg.t) / rg.t);
    const amt = Math.min(1, (t - rg.t) / (0.6 * rg.t));
    return amt * Math.exp(-Math.pow((x - rg.x) / w, 2));
  }

  /** 理論值（格雷厄姆）：環到鹼端的距離比例 = √M_acid / (√M_acid + √M_base) */
  function grahamFrac(base, acid) { const qa = Math.sqrt(M(acid)), qb = Math.sqrt(M(base)); return qa / (qa + qb); }
  /** 只看擴散係數比（相遇點的極限）：x/(L−x) = D_A/D_B */
  function dFrac(DA, DB) { return DA / (DA + DB); }

  // ---------- 未知氣體 ----------
  function newUnknown(kind, rnd) {
    rnd = rnd || Math.random;
    const m = kind === 'HX' ? 45 + rnd() * 115 : 20 + rnd() * 130;
    unknown[kind] = Math.round(m * 10) / 10;
    return unknown[kind];
  }
  function setUnknown(kind, m) { unknown[kind] = m; }

  const api = {
    R: R, KB: KB, NA: NA, M_AIR: M_AIR, GAS: GAS, BASES: BASES, ACIDS: ACIDS, EFF: EFF, THETA: THETA,
    M: M, meanSpeed: meanSpeed, rmsSpeed: rmsSpeed, mpSpeed: mpSpeed, maxwell: maxwell, maxwellCDF: maxwellCDF, erf: erf, erfc: erfc, lnErfc: lnErfc,
    fullerD: fullerD, diffD: diffD, effTau: effTau, effHalf: effHalf, effP: effP, effRate: effRate,
    meanFreePath: meanFreePath, knudsen: knudsen, conc: conc, ring: ring, deposit: deposit, grahamFrac: grahamFrac, dFrac: dFrac,
    newUnknown: newUnknown, setUnknown: setUnknown, unknown: unknown
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GdCore = api;
})(typeof window !== 'undefined' ? window : this);
