/* sun-energy-core.js — 太陽的能量：光度、太陽常數、在地面量太陽常數、核融合與太陽的壽命（純函式，Node 與瀏覽器共用）
 *
 * 光度：L = 4πR^2·σT^4（恆星表面當黑體）；距離 d 處每平方公尺 S = L / (4πd^2)（平方反比）。
 * 地面：直射的陽光穿過大氣，S_地面 = S·e^(−τ·m)（比爾–朗伯定律；τ 是寬頻光學厚度，m 是大氣質量，Kasten & Young 1989）。
 *   黑色水盒對準太陽曬：吸收 α·S_地面·A，水與盒子的熱容 C，向四周散熱 k(T − T_air)：
 *   T(t) = T_air + (P/k)(1 − e^(−kt/C))。學生的算法 S_量 = CΔT / (A·t)（假設全吸收、不散熱）。
 *   Langley 法：在不同的太陽高度量幾次，ln S_量 對 m 畫直線，延長到 m = 0（大氣頂端）就得到大氣外的太陽常數。
 * 核融合（質子–質子鏈）：4 H-1 → He-4 + 2 正子 + 2ν，質量虧損 Δm = 4m(H-1) − m(He-4) = 0.02870 u → Q = 26.73 MeV，
 *   兩個微中子平均帶走約 0.6 MeV（約 2 %），其餘變成熱與光。每秒的反應數 = L / Q_熱。
 * 壽命：化學燃燒 M·e/L；重力收縮（Kelvin–Helmholtz）GM^2/(RL)；核融合 f·M·η·c^2/L，η = Q_熱 / (4m(H-1)c^2) ≈ 0.7 %。
 */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.SunCore = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 常數（SI；CODATA 2018、IAU 2015 標稱值）----------
  const SIGMA = 5.670374419e-8;     // W/(m^2·K^4)
  const C = 2.99792458e8;           // m/s
  const G = 6.6743e-11;             // m^3/(kg·s^2)
  const AU = 1.495978707e11;        // m
  const YEAR = 3.15576e7;           // s（儒略年）
  const WIEN = 2.897771955e-3;      // m·K
  const LSUN = 3.828e26;            // W（IAU 2015 標稱太陽光度）
  const RSUN = 6.957e8;             // m
  const TSUN = 5772;                // K（有效溫度）
  const MSUN = 1.98847e30;          // kg
  const MEV = 1.602176634e-13;      // J
  const U = 1.66053906660e-27;      // kg
  const UMEV = 931.49410242;        // MeV/c^2
  const M_H = 1.00782503223;        // H-1 原子質量（u，含電子）
  const M_HE = 4.00260325413;       // He-4 原子質量（u）
  const DM = 4 * M_H - M_HE;        // 質量虧損（u）
  const Q = DM * UMEV;              // 26.73 MeV
  const Q_NU = 0.6;                 // 兩個微中子平均帶走的能量（MeV，約 2 %）
  const Q_HEAT = Q - Q_NU;          // 變成熱與光的能量（MeV）
  const ETA = Q_HEAT / (4 * M_H * UMEV); // 氫變成氦時，質量轉成光的比例（約 0.007）
  const S0 = LSUN / (4 * Math.PI * AU * AU); // 1 AU 處的太陽常數（約 1361 W/m^2）
  const E_CHEM = 3e7;               // 煤（含氧）燃燒的能量（J/kg，約略）
  const EARTH_AGE = 4.54e9;         // 年（隕石與地球最古老礦物）
  const SUN_AGE = 4.57e9;           // 年

  // ---------- 光度與距離 ----------
  /** 半徑 R（以太陽半徑為單位）、表面溫度 T（K）的恆星光度（W） */
  function lum(R, T) { const r = R * RSUN; return 4 * Math.PI * r * r * SIGMA * Math.pow(T, 4); }
  /** 光度 L（W）在距離 d（AU）處每平方公尺的功率（W/m^2） */
  function flux(L, d) { const r = d * AU; return L / (4 * Math.PI * r * r); }
  /** 每平方公尺 S 的地方，離光度 L 的恆星多遠（AU） */
  function distFor(L, S) { return Math.sqrt(L / (4 * Math.PI * S)) / AU; }
  /** 維恩位移定律：輻射最強的波長（m） */
  function wien(T) { return WIEN / T; }
  /** 光從恆星表面到距離 d（AU）要多少秒 */
  function lightTime(d) { return d * AU / C; }

  const PLANETS = [
    { id: 'mercury', zh: '水星', en: 'Mercury', a: 0.387 },
    { id: 'venus', zh: '金星', en: 'Venus', a: 0.723 },
    { id: 'earth', zh: '地球', en: 'Earth', a: 1.000 },
    { id: 'mars', zh: '火星', en: 'Mars', a: 1.524 },
    { id: 'jupiter', zh: '木星', en: 'Jupiter', a: 5.203 },
    { id: 'saturn', zh: '土星', en: 'Saturn', a: 9.537 },
    { id: 'uranus', zh: '天王星', en: 'Uranus', a: 19.19 },
    { id: 'neptune', zh: '海王星', en: 'Neptune', a: 30.07 },
    { id: 'pluto', zh: '冥王星', en: 'Pluto', a: 39.48 }
  ];
  /** 恆星的預設：R（太陽半徑）、T（K）、M（太陽質量）。 */
  const STARS = [
    { id: 'sun', zh: '今天的太陽', en: 'The Sun today', R: 1, T: 5772, M: 1 },
    { id: 'young', zh: '45 億年前的太陽', en: 'The Sun 4.5 billion years ago', R: 0.89, T: 5620, M: 1 },
    { id: 'proxima', zh: '比鄰星', en: 'Proxima Centauri', R: 0.154, T: 3042, M: 0.122 },
    { id: 'sirius', zh: '天狼星 A', en: 'Sirius A', R: 1.711, T: 9940, M: 2.06 },
    { id: 'giant', zh: '紅巨星階段的太陽', en: 'The Sun as a red giant', R: 170, T: 3100, M: 0.9 },
    { id: 'betelgeuse', zh: '參宿四', en: 'Betelgeuse', R: 764, T: 3600, M: 18 }
  ];

  // ---------- 地面量太陽常數 ----------
  const PAN = { A: 0.01, CW: 4186, CPAN: 40, K: 0.25, TAIR: 25 }; // 10 cm × 10 cm 的黑色水盒；k：散熱係數（W/K）
  /** 大氣質量（Kasten & Young 1989）；h 是太陽高度角（度） */
  function airMass(h) {
    const z = 90 - h;
    return 1 / (Math.cos(z * Math.PI / 180) + 0.50572 * Math.pow(96.07995 - z, -1.6364));
  }
  /** 地面上垂直於陽光的每平方公尺功率 */
  function ground(S, tau, h) { return S * Math.exp(-tau * airMass(h)); }
  /**
   * 黑色水盒的實驗。opt：{ S（大氣外，W/m^2）, h（度）, tau, alpha（吸收率）, mw（水 kg）, dur（s）}
   * 傳回 { m, Ig（地面照度）, P（吸收功率 W）, Cth（J/K）, dT（°C）, Iest（學生算的 CΔT/(A·t)）, Tend, Pend（結束時的散熱 W）, Tat(t) }
   */
  function pan(opt) {
    const m = airMass(opt.h), Ig = opt.S * Math.exp(-opt.tau * m);
    const P = opt.alpha * Ig * PAN.A, Cth = opt.mw * PAN.CW + PAN.CPAN;
    const Tat = function (t) { return PAN.TAIR + P / PAN.K * (1 - Math.exp(-PAN.K * t / Cth)); };
    const dT = Tat(opt.dur) - PAN.TAIR;
    return { m: m, Ig: Ig, P: P, Cth: Cth, dT: dT, Iest: Cth * dT / (PAN.A * opt.dur), Tend: PAN.TAIR + dT, Pend: PAN.K * dT, Tat: Tat };
  }
  /** Langley 法：pts = [{ m, I }]，ln I = a − τm 的最小平方直線 → { S0（m = 0 的外推值）, tau, r2 }；少於兩個不同的 m 時傳回 null */
  function langley(pts) {
    const n = pts.length;
    if (n < 2) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    pts.forEach(function (p) { const x = p.m, y = Math.log(p.I); sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y; });
    const den = n * sxx - sx * sx;
    if (Math.abs(den) < 1e-9 * n * n) return null;
    const b = (n * sxy - sx * sy) / den, a = (sy - b * sx) / n;
    const vy = n * syy - sy * sy;
    const r2 = vy > 0 ? Math.pow(n * sxy - sx * sy, 2) / (den * vy) : 1;
    return { S0: Math.exp(a), tau: -b, r2: r2, a: a, b: b };
  }

  // ---------- 核融合 ----------
  /** 質子–質子鏈 I 的三步（Q 含正子互毀；ν 是微中子平均帶走的能量，MeV） */
  const PP = [
    // 核種寫成 [質量數, 符號]；'e+' 正子、'nu' 微中子、'g' 伽瑪射線
    { a: [[1, 'H'], [1, 'H']], b: [[2, 'H'], 'e+', 'nu'], Q: 1.442, nu: 0.265, times: 2 },
    { a: [[2, 'H'], [1, 'H']], b: [[3, 'He'], 'g'], Q: 5.493, nu: 0, times: 2 },
    { a: [[3, 'He'], [3, 'He']], b: [[4, 'He'], [1, 'H'], [1, 'H']], Q: 12.860, nu: 0, times: 1 }
  ];
  /** 光度 L（W）的恆星每秒的核融合：{ rate（反應數）, dm（少掉的質量 kg）, H（用掉的氫 kg）, He（做出的氦 kg）, nu（微中子數）} */
  function fusion(L) {
    const rate = L / (Q_HEAT * MEV);
    return { rate: rate, dm: rate * DM * U, H: rate * 4 * M_H * U, He: rate * M_HE * U, nu: 2 * rate };
  }
  /** 距離 d（AU）處每平方公尺每秒穿過的微中子數 */
  function nuFlux(L, d) { const r = d * AU; return fusion(L).nu / (4 * Math.PI * r * r); }

  // ---------- 壽命（年）----------
  /** L（W）、M（太陽質量）、R（太陽半徑）、f（變成氦的質量比例）→ { chem, grav, nuc }（年） */
  function lifetimes(L, M, R, f) {
    const mk = M * MSUN, rm = R * RSUN;
    return {
      chem: mk * E_CHEM / L / YEAR,
      grav: G * mk * mk / (rm * L) / YEAR,
      nuc: f * mk * ETA * C * C / L / YEAR
    };
  }

  return {
    SIGMA: SIGMA, C: C, G: G, AU: AU, YEAR: YEAR, WIEN: WIEN, LSUN: LSUN, RSUN: RSUN, TSUN: TSUN, MSUN: MSUN,
    MEV: MEV, U: U, UMEV: UMEV, M_H: M_H, M_HE: M_HE, DM: DM, Q: Q, Q_NU: Q_NU, Q_HEAT: Q_HEAT, ETA: ETA, S0: S0,
    E_CHEM: E_CHEM, EARTH_AGE: EARTH_AGE, SUN_AGE: SUN_AGE, PLANETS: PLANETS, STARS: STARS, PAN: PAN, PP: PP,
    lum: lum, flux: flux, distFor: distFor, wien: wien, lightTime: lightTime,
    airMass: airMass, ground: ground, pan: pan, langley: langley,
    fusion: fusion, nuFlux: nuFlux, lifetimes: lifetimes
  };
});
