/*
 * stars-hr-core.js — 「恆星的顏色與亮度：黑體輻射與 HR 圖」的物理核心（UMD；瀏覽器是 window.StarsCore，Node 可 require）
 *
 * 1. 黑體輻射：普朗克定律 B_λ(T) = 2hc² / λ⁵ / (e^{hc/λkT} − 1)（W·m⁻²·sr⁻¹·m⁻¹）；維恩位移 λ_max = b / T；
 *    史蒂芬－波茲曼 F = σT⁴、L = 4πR²σT⁴。常數用 2019 SI 定義值與 CODATA 2018。
 * 2. 恆星的顏色：B_λ 乘上 CIE 1931 色彩匹配函數積分得 XYZ（色彩匹配函數用 Wyman、Sloan 與 Shirley 2013 的分段高斯擬合），
 *    轉成 sRGB（D65）；單元測試和 Kim 等（2002）的 Planckian locus 公式比對。
 * 3. 太陽：IAU 2015 B3 名目值 L☉ = 3.828 × 10²⁶ W、R☉ = 6.957 × 10⁸ m、T☉ = 5772 K；熱星等 M_bol = 4.74 − 2.5 log(L/L☉)（IAU 2015 B2）。
 * 4. 主序星（零齡附近的近似）：質量－光度關係分段冪律（Duric 2004）、半徑 R ∝ M^0.8（M < 1）、M^0.57（M ≥ 1），
 *    溫度由 L = 4πR²σT⁴ 算出；主序壽命 t ≈ 10¹⁰ 年 × (M/M☉)/(L/L☉)。只適用 0.1–20 M☉，頁面寫明是近似。
 * 5. 亮星與近星的代表值（溫度、光度）：見 STARS 的註解；半徑由 L 與 T 算出，彼此一致。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StarsCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const h = 6.62607015e-34, c = 299792458, kB = 1.380649e-23;
  const SIGMA = 5.670374419e-8, WIEN_B = 2.897771955e-3;
  const L_SUN = 3.828e26, R_SUN = 6.957e8, T_SUN = 5772, M_BOL_SUN = 4.74;
  const R_EARTH = 6.371e6;
  const VIS = [380e-9, 750e-9];

  /** 普朗克定律：波長 λ（m）、溫度 T（K）→ 光譜輻射亮度（W·m⁻²·sr⁻¹·m⁻¹） */
  function planck(lam, T) {
    const x = h * c / (lam * kB * T);
    if (x > 700) return 0;
    return 2 * h * c * c / Math.pow(lam, 5) / Math.expm1(x);
  }
  /** 維恩位移：峰值波長（m） */
  function peak(T) { return WIEN_B / T; }
  /** 表面每平方公尺發出的總功率（W/m²）＝ π ∫ B_λ dλ ＝ σT⁴ */
  function flux(T) { return SIGMA * Math.pow(T, 4); }
  /** 光度（W） */
  function lum(R, T) { return 4 * Math.PI * R * R * SIGMA * Math.pow(T, 4); }
  /** 以太陽為單位：L = R² (T/T☉)⁴ */
  function lumSun(Rs, T) { return Rs * Rs * Math.pow(T / T_SUN, 4); }
  function radiusSun(Ls, T) { return Math.sqrt(Ls) / Math.pow(T / T_SUN, 2); }
  function tempOf(Ls, Rs) { return T_SUN * Math.pow(Ls / (Rs * Rs), 0.25); }
  function mbol(Ls) { return M_BOL_SUN - 2.5 * Math.log10(Ls); }

  /** ∫_0^λ B_λ dλ 佔全部的比例（用級數，精確）：換成 x = hc/λkT 後是 ∫_x^∞ x³/(eˣ − 1) dx，
   *  F = (15/π⁴) Σ e^{−nx}(x³/n + 3x²/n² + 6x/n³ + 6/n⁴) */
  function fractionBelow(lam, T) {
    const x = h * c / (lam * kB * T);
    if (x > 200) return 0;
    if (x < 1) {
      // 長波長：級數收斂太慢，改用 ∫_0^x t³/(eᵗ − 1) dt 的伯努利展開（x < 1 時誤差 < 10⁻¹²）
      const x2 = x * x, x3 = x2 * x;
      return 1 - 15 / Math.pow(Math.PI, 4) * (x3 / 3 - x3 * x / 8 + x3 * x2 / 60 - x3 * x2 * x2 / 5040 + x3 * x2 * x2 * x2 / 272160 - x3 * x2 * x2 * x2 * x2 / 13305600);
    }
    let s = 0;
    for (let n = 1; n <= 200; n++) {
      const e = Math.exp(-n * x);
      const term = e * (x * x * x / n + 3 * x * x / (n * n) + 6 * x / (n * n * n) + 6 / (n * n * n * n));
      s += term;
      if (term < 1e-16 * s) break;
    }
    return 15 / Math.pow(Math.PI, 4) * s;
  }
  /** 可見光（380–750 nm）佔總輻射的比例 */
  function visibleFraction(T) { return fractionBelow(VIS[1], T) - fractionBelow(VIS[0], T); }
  /** 紫外（< 380 nm）、紅外（> 750 nm）的比例 */
  function bands(T) { const a = fractionBelow(VIS[0], T), b = fractionBelow(VIS[1], T); return { uv: a, vis: b - a, ir: 1 - b }; }

  // ---------- 顏色 ----------
  function g(x, mu, s1, s2) { const t = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * t * t); }
  /** CIE 1931 2° 色彩匹配函數（Wyman、Sloan、Shirley 2013 的多瓣分段高斯；λ 單位 nm） */
  function cmf(nm) {
    return [
      1.056 * g(nm, 599.8, 37.9, 31.0) + 0.362 * g(nm, 442.0, 16.0, 26.7) - 0.065 * g(nm, 501.1, 20.4, 26.2),
      0.821 * g(nm, 568.8, 46.9, 40.5) + 0.286 * g(nm, 530.9, 16.3, 31.1),
      1.217 * g(nm, 437.0, 11.8, 36.0) + 0.681 * g(nm, 459.0, 26.0, 13.8)
    ];
  }
  /** 黑體的 XYZ（未正規化；Y 的單位不重要）與色度座標 (x, y) */
  function xyz(T) {
    let X = 0, Y = 0, Z = 0;
    for (let nm = 360; nm <= 830; nm += 1) {
      const p = planck(nm * 1e-9, T), q = cmf(nm);
      X += p * q[0]; Y += p * q[1]; Z += p * q[2];
    }
    return { X: X, Y: Y, Z: Z, x: X / (X + Y + Z), y: Y / (X + Y + Z) };
  }
  /** Kim 等（2002）的 Planckian locus 三次近似（1667–25000 K），測試比對用 */
  function locusKim(T) {
    let x;
    if (T <= 4000) x = -0.2661239e9 / (T * T * T) - 0.2343589e6 / (T * T) + 0.8776956e3 / T + 0.179910;
    else x = -3.0258469e9 / (T * T * T) + 2.1070379e6 / (T * T) + 0.2226347e3 / T + 0.240390;
    let y;
    if (T <= 2222) y = -1.1063814 * x * x * x - 1.34811020 * x * x + 2.18555832 * x - 0.20219683;
    else if (T <= 4000) y = -0.9549476 * x * x * x - 1.37418593 * x * x + 2.09137015 * x - 0.16748867;
    else y = 3.0817580 * x * x * x - 5.87338670 * x * x + 3.75112997 * x - 0.37001483;
    return { x: x, y: y };
  }
  const D65 = { x: 0.31271, y: 0.32902 };
  /** 線性 sRGB（D65），以最大分量 = 1 正規化；超出色域的負值夾成 0 */
  function rgbLinear(T) {
    const q = xyz(T), s = 1 / q.Y;
    const X = q.X * s, Y = 1, Z = q.Z * s;
    let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
    let gg = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
    let b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
    r = Math.max(0, r); gg = Math.max(0, gg); b = Math.max(0, b);
    const m = Math.max(r, gg, b);
    return [r / m, gg / m, b / m];
  }
  function gamma(u) { return u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055; }
  /** 恆星的顏色（'#rrggbb'） */
  function colorHex(T) {
    const v = rgbLinear(T).map(function (u) { return Math.round(255 * Math.min(1, gamma(u))); });
    return '#' + v.map(function (n) { return (n < 16 ? '0' : '') + n.toString(16); }).join('');
  }
  /** 黑體顏色離白色（D65）多遠：色度座標的距離 */
  function whiteDist(T) { const q = xyz(T); return Math.hypot(q.x - D65.x, q.y - D65.y); }

  // ---------- 光譜型 ----------
  /** 主序星的光譜型溫度範圍（K，約略值；Pecaut & Mamajek 2013 的整數化） */
  const CLASSES = [
    { k: 'O', lo: 30000, hi: Infinity }, { k: 'B', lo: 10000, hi: 30000 }, { k: 'A', lo: 7300, hi: 10000 },
    { k: 'F', lo: 6000, hi: 7300 }, { k: 'G', lo: 5300, hi: 6000 }, { k: 'K', lo: 3900, hi: 5300 }, { k: 'M', lo: 2300, hi: 3900 }
  ];
  function spectral(T) {
    for (let i = 0; i < CLASSES.length; i++) if (T >= CLASSES[i].lo) return CLASSES[i].k;
    return 'M';
  }

  // ---------- 主序星 ----------
  const MS_MIN = 0.1, MS_MAX = 20;
  /** 質量－光度（L☉，Duric 2004 的分段冪律） */
  function msLum(M) {
    if (M < 0.43) return 0.23 * Math.pow(M, 2.3);
    if (M < 2) return Math.pow(M, 4);
    return 1.4 * Math.pow(M, 3.5);
  }
  function msRadius(M) { return M < 1 ? Math.pow(M, 0.8) : Math.pow(M, 0.57); }
  function msLife(M) { return 1e10 * M / msLum(M); }
  function mainSequence(M) {
    const L = msLum(M), R = msRadius(M), T = tempOf(L, R);
    return { M: M, L: L, R: R, T: T, life: msLife(M), cls: spectral(T) };
  }
  /** 反過來：給壽命（年）求質量（二分法，0.1–20 M☉） */
  function massForLife(t) {
    let a = MS_MIN, b = MS_MAX;
    for (let i = 0; i < 80; i++) { const m = Math.sqrt(a * b); if (msLife(m) > t) a = m; else b = m; }
    return Math.sqrt(a * b);
  }

  // ---------- 真實恆星（代表值；溫度 K、光度 L☉、距離 pc。半徑一律由 L 與 T 算出） ----------
  // 資料：各星的近年文獻代表值（變星、快速自轉星取平均）；只用來畫 HR 圖與比較，頁面寫明是約略值。
  const STARS = [
    { id: 'sun', zh: '太陽', en: 'Sun', T: 5772, L: 1, d: 4.848e-6, kind: 'ms' },
    { id: 'sirius', zh: '天狼星 A', en: 'Sirius A', T: 9940, L: 25.4, d: 2.64, kind: 'ms' },
    { id: 'sirius-b', zh: '天狼星 B', en: 'Sirius B', T: 24800, L: 0.025, d: 2.64, kind: 'wd' },   // Holberg 等 1998：R ≈ 0.0084 R☉
    { id: 'vega', zh: '織女星', en: 'Vega', T: 9600, L: 40, d: 7.68, kind: 'ms' },
    { id: 'altair', zh: '牛郎星', en: 'Altair', T: 7700, L: 10.6, d: 5.13, kind: 'ms' },
    { id: 'procyon', zh: '南河三', en: 'Procyon A', T: 6530, L: 6.9, d: 3.51, kind: 'ms' },
    { id: 'acen-a', zh: '南門二 A', en: 'Alpha Centauri A', T: 5790, L: 1.52, d: 1.34, kind: 'ms' },
    { id: 'acen-b', zh: '南門二 B', en: 'Alpha Centauri B', T: 5260, L: 0.50, d: 1.34, kind: 'ms' },
    { id: 'proxima', zh: '比鄰星', en: 'Proxima Centauri', T: 3042, L: 0.00155, d: 1.30, kind: 'ms' },
    { id: 'barnard', zh: '巴納德星', en: 'Barnard’s Star', T: 3195, L: 0.0035, d: 1.83, kind: 'ms' },
    { id: '61cyg-a', zh: '天鵝座 61 A', en: '61 Cygni A', T: 4526, L: 0.153, d: 3.49, kind: 'ms' },
    { id: 'spica', zh: '角宿一', en: 'Spica', T: 25300, L: 20500, d: 77, kind: 'ms' },
    { id: 'regulus', zh: '軒轅十四', en: 'Regulus', T: 12460, L: 288, d: 24.3, kind: 'ms' },
    { id: 'arcturus', zh: '大角星', en: 'Arcturus', T: 4286, L: 170, d: 11.3, kind: 'giant' },
    { id: 'aldebaran', zh: '畢宿五', en: 'Aldebaran', T: 3900, L: 439, d: 20.0, kind: 'giant' },
    { id: 'capella', zh: '五車二', en: 'Capella Aa', T: 4970, L: 79, d: 13.0, kind: 'giant' },
    { id: 'pollux', zh: '北河三', en: 'Pollux', T: 4586, L: 33, d: 10.4, kind: 'giant' },
    { id: 'polaris', zh: '北極星', en: 'Polaris', T: 6015, L: 1260, d: 133, kind: 'super' },
    { id: 'betelgeuse', zh: '參宿四', en: 'Betelgeuse', T: 3600, L: 1.2e5, d: 168, kind: 'super' },
    { id: 'antares', zh: '心宿二', en: 'Antares', T: 3660, L: 7.6e4, d: 170, kind: 'super' },
    { id: 'rigel', zh: '參宿七', en: 'Rigel', T: 12100, L: 1.2e5, d: 260, kind: 'super' },
    { id: 'deneb', zh: '天津四', en: 'Deneb', T: 8500, L: 2e5, d: 800, kind: 'super' },
    { id: '40eri-b', zh: '波江座 40 B', en: '40 Eridani B', T: 16500, L: 0.013, d: 5.0, kind: 'wd' },
    { id: 'vanmaanen', zh: '范馬南星', en: 'van Maanen’s Star', T: 6220, L: 0.00017, d: 4.31, kind: 'wd' }
  ];
  STARS.forEach(function (s) { s.R = radiusSun(s.L, s.T); });

  return {
    h: h, c: c, kB: kB, SIGMA: SIGMA, WIEN_B: WIEN_B, L_SUN: L_SUN, R_SUN: R_SUN, T_SUN: T_SUN, M_BOL_SUN: M_BOL_SUN, R_EARTH: R_EARTH, VIS: VIS,
    planck: planck, peak: peak, flux: flux, lum: lum, lumSun: lumSun, radiusSun: radiusSun, tempOf: tempOf, mbol: mbol,
    fractionBelow: fractionBelow, visibleFraction: visibleFraction, bands: bands,
    cmf: cmf, xyz: xyz, locusKim: locusKim, D65: D65, rgbLinear: rgbLinear, colorHex: colorHex, whiteDist: whiteDist,
    CLASSES: CLASSES, spectral: spectral,
    MS_MIN: MS_MIN, MS_MAX: MS_MAX, msLum: msLum, msRadius: msRadius, msLife: msLife, mainSequence: mainSequence, massForLife: massForLife,
    STARS: STARS
  };
});
