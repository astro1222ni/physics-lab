/*
 * blackbody-core.js — 「黑體輻射與普朗克定律」物理核心（與畫面無關，可單獨以 Node 測試）
 *
 * 單位一律 SI：波長 m、頻率 Hz、溫度 K；光譜輻射率 B_λ 的單位是 W·sr⁻¹·m⁻³，
 * 光譜出射度 M_λ = π B_λ（朗伯面：每單位面積、每單位波長向半個空間發出的功率）W·m⁻²·m⁻¹，畫面換成 W·m⁻²·nm⁻¹（乘 1e-9）。
 *
 * 一、常數：h = 6.62607015 × 10^-34 J·s、c = 299 792 458 m/s、k = 1.380649 × 10^-23 J/K（SI 定義值，精確）。
 *     σ = 2π⁵k⁴/(15c²h³)、b = hc/(k x₅)、b′ = k x₃/h 都由三個定義值算出，與 CODATA 2022 比對（單元測試）：
 *     σ = 5.670374419… × 10^-8 W·m⁻²·K⁻⁴、b = 2.897771955… × 10^-3 m·K、b′ = 5.878925757… × 10^10 Hz/K。
 *     x₅、x₃ 用牛頓法解 x = 5(1 − e^-x)、x = 3(1 − e^-x)（波長分布與頻率分布的峰值）。
 * 二、普朗克定律 B_λ = (2hc²/λ⁵) / (e^{hc/λkT} − 1)；瑞利–金斯 2ckT/λ⁴；維恩近似 (2hc²/λ⁵) e^{−hc/λkT}。
 *     指數太大時改用對數（lnPlanck），不會溢位；e^x − 1 用 expm1，長波（x 很小）也精確。
 * 三、波段比例：令 x = hc/(λkT)，波長小於 λ 的比例 F(λT) = (15/π⁴) ∫_x^∞ t³/(e^t − 1) dt。
 *     x ≥ 1：級數 (15/π⁴) Σ e^{−nx}(x³/n + 3x²/n² + 6x/n³ + 6/n⁴)；
 *     x < 1：用補數 1 − (15/π⁴) ∫_0^x t³/(e^t − 1) dt，被積函數以伯努利數展開 t²·Σ B_k t^k/k!（|t| < 2π 收斂）。
 * 四、每個模式的平均能量：古典（能量均分）kT；普朗克 hf/(e^{hf/kT} − 1)；空腔模式密度 8πf²/c³（每單位體積、每單位頻率）。
 * 五、黑體的顏色：CIE 1931 2° 配色函數（CIE 015:2018 官方資料集 CIE_xyz_1931_2deg，380–780 nm 每 5 nm，
 *     與 js/thin-film-core.js 同一份表）× 普朗克光譜，每 1 nm 線性內插求和 → XYZ → 色度 (x, y)、CIE 1960 (u, v)；
 *     XYZ → 線性 sRGB（IEC 61966-2-1，D65 白點）；超出 sRGB 色域（負的分量，約 1900 K 以下）時把負分量設為 0，
 *     再把最亮的通道調到 1（只顯示「顏色」，亮度另外算），γ 校正成 8 位元。
 *     亮度（輝度）L_v = K_m ∫ ȳ(λ) B_λ dλ（cd/m²），K_m = 683 lm/W（SI 燭光定義）；這是明視覺（亮處）的亮度。
 *     白點 D65：x = 0.31272、y = 0.32903（CIE 015:2018）；與白點的色度距離用 CIE 1960 (u, v) 的歐氏距離 Δuv。
 */
(function (root) {
  'use strict';

  // ---------------- 常數 ----------------
  const H = 6.62607015e-34;     // J·s（SI 定義值）
  const C = 299792458;          // m/s（SI 定義值）
  const KB = 1.380649e-23;      // J/K（SI 定義值）
  const PI = Math.PI;
  const C2 = H * C / KB;        // 第二輻射常數 hc/k = 1.438776877… × 10^-2 m·K
  const SIGMA = 2 * Math.pow(PI, 5) * Math.pow(KB, 4) / (15 * C * C * H * H * H);
  const SIGMA_CODATA = 5.670374419e-8;     // CODATA 2022（由定義值算出，精確到列出的位數）
  const B_CODATA = 2.897771955e-3;         // m·K，CODATA 2022
  const BNU_CODATA = 5.878925757e10;       // Hz/K，CODATA 2022
  const KM = 683;               // lm/W（SI 燭光的定義：540 THz 的光 683 lm/W）
  const VIS = [380e-9, 780e-9]; // 可見光範圍（m）
  const D65_XY = [0.31272, 0.32903];

  /** 牛頓法解 x = n(1 − e^-x)（x > 0 的根） */
  function solvePeak(n) {
    let x = n;
    for (let i = 0; i < 60; i++) {
      const f = x - n * (1 - Math.exp(-x)), d = 1 - n * Math.exp(-x);
      const dx = f / d;
      x -= dx;
      if (Math.abs(dx) < 1e-15 * x) break;
    }
    return x;
  }
  const X5 = solvePeak(5);      // 4.965114231744276…：波長分布 B_λ 的峰
  const X3 = solvePeak(3);      // 2.821439372122079…：頻率分布 B_ν 的峰
  const B_WIEN = C2 / X5;       // m·K
  const BNU_WIEN = X3 * KB / H; // Hz/K

  // ---------------- 普朗克定律 ----------------
  /** ln(e^x − 1)，x 很大也不溢位 */
  function lnExpm1(x) { return x > 40 ? x + Math.log1p(-Math.exp(-x)) : Math.log(Math.expm1(x)); }
  /** x = hc/(λkT) */
  function xOf(lam, T) { return C2 / (lam * T); }
  /** 光譜輻射率 B_λ（W·sr⁻¹·m⁻³） */
  function planck(lam, T) {
    const x = xOf(lam, T);
    if (x > 700) return 0;
    return 2 * H * C * C / Math.pow(lam, 5) / Math.expm1(x);
  }
  /** ln B_λ（任何溫度都能算，給對數圖與 3D 用） */
  function lnPlanck(lam, T) { return Math.log(2 * H * C * C) - 5 * Math.log(lam) - lnExpm1(xOf(lam, T)); }
  function rayleighJeans(lam, T) { return 2 * C * KB * T / Math.pow(lam, 4); }
  function wien(lam, T) { const x = xOf(lam, T); return x > 700 ? 0 : 2 * H * C * C / Math.pow(lam, 5) * Math.exp(-x); }
  /** 光譜出射度 M_λ = πB_λ（W·m⁻²·m⁻¹）；三種理論 */
  function exitance(lam, T) { return PI * planck(lam, T); }
  function exitanceRJ(lam, T) { return PI * rayleighJeans(lam, T); }
  function exitanceWien(lam, T) { return PI * wien(lam, T); }
  /** log10 M_λ（W·m⁻²·nm⁻¹） */
  function log10ExitanceNm(lam, T) { return (Math.log(PI) + lnPlanck(lam, T)) / Math.LN10 - 9; }
  /** 瑞利–金斯 ÷ 普朗克 = (e^x − 1)/x；維恩 ÷ 普朗克 = 1 − e^−x（與溫度、波長只透過 x 有關） */
  function ratioRJ(lam, T) { const x = xOf(lam, T); return x > 700 ? Infinity : Math.expm1(x) / x; }
  function ratioWien(lam, T) { return -Math.expm1(-xOf(lam, T)); }

  // ---------------- 峰值與總量 ----------------
  function lamMax(T) { return B_WIEN / T; }
  function nuMax(T) { return BNU_WIEN * T; }
  /** 頻率分布峰值換成的波長 c/ν_max（不等於 λ_max：比值固定 = x₅/x₃ ≈ 1.760） */
  function lamOfNuMax(T) { return C / nuMax(T); }
  function peakExitance(T) { return exitance(lamMax(T), T); }
  function totalExitance(T) { return SIGMA * T * T * T * T; }

  // ---------------- 波段比例 ----------------
  const BERN = [[0, 1], [1, -1 / 2], [2, 1 / 6], [4, -1 / 30], [6, 1 / 42], [8, -1 / 30], [10, 5 / 66], [12, -691 / 2730], [14, 7 / 6], [16, -3617 / 510]];
  const FACT = (function () { const f = [1]; for (let i = 1; i <= 20; i++) f[i] = f[i - 1] * i; return f; })();
  const K15 = 15 / Math.pow(PI, 4);
  /** (15/π⁴) ∫_x^∞ t³/(e^t − 1) dt：x = hc/(λkT) 以上（也就是波長 λ 以下）的比例 */
  function tailFrac(x) {
    if (!(x > 0)) return 1;
    if (x > 700) return 0;
    if (x >= 1) {
      let s = 0;
      for (let n = 1; n < 2000; n++) {
        const e = Math.exp(-n * x), t = e * (x * x * x / n + 3 * x * x / (n * n) + 6 * x / (n * n * n) + 6 / (n * n * n * n));
        s += t;
        if (t < 1e-18 * s) break;
      }
      return K15 * s;
    }
    let s = 0;
    for (let i = 0; i < BERN.length; i++) {
      const k = BERN[i][0];
      s += BERN[i][1] * Math.pow(x, k + 3) / (FACT[k] * (k + 3));
    }
    return 1 - K15 * s;
  }
  /** 波長小於 λ 的出射度比例 */
  function fracBelow(lam, T) { return tailFrac(xOf(lam, T)); }
  /** 波段 [λ₁, λ₂] 的比例 */
  function bandFrac(l1, l2, T) { return Math.max(0, fracBelow(l2, T) - fracBelow(l1, T)); }
  function visFrac(T) { return bandFrac(VIS[0], VIS[1], T); }

  /**
   * 數值積分 ∫ M_λ dλ（λ₁ 到 λ₂，m）：換成 x 變數後用複合辛普森法（被積函數平滑），只給測試與檢查用。
   * M_λ dλ = (2πk⁴T⁴/(h³c²)) · x³/(e^x − 1) dx
   */
  function integrateExitance(T, l1, l2, n) {
    n = n || 20000;
    const xa = l2 === Infinity ? 0 : xOf(l2, T), xb = l1 <= 0 ? 60 : Math.min(60, xOf(l1, T));
    if (!(xb > xa)) return 0;
    const f = function (x) { return x < 1e-12 ? 0 : x * x * x / Math.expm1(x); };
    const h = (xb - xa) / n;
    let s = f(xa) + f(xb);
    for (let i = 1; i < n; i++) s += f(xa + i * h) * (i % 2 ? 4 : 2);
    const pref = 2 * PI * Math.pow(KB * T, 4) / (H * H * H * C * C);
    return pref * s * h / 3;
  }

  // ---------------- 每個模式的平均能量 ----------------
  function modeClassical(T) { return KB * T; }
  function modePlanck(f, T) { const x = H * f / (KB * T); return x > 700 ? 0 : x < 1e-12 ? KB * T : H * f / Math.expm1(x); }
  function modeDensity(f) { return 8 * PI * f * f / (C * C * C); }
  /** 能量密度的頻率分布 u_ν = (8πf²/c³)·⟨E⟩（J·m⁻³·Hz⁻¹），兩種理論 */
  function energyDensityNu(f, T, classical) { return modeDensity(f) * (classical ? modeClassical(T) : modePlanck(f, T)); }

  // ---------------- 顏色 ----------------
  // CIE 1931 2° 配色函數 x̄、ȳ、z̄（CIE 015:2018 官方資料集 CIE_xyz_1931_2deg，380–780 nm 每 5 nm；與 js/thin-film-core.js 同一份）
  const CMF_X = [.001368, .002236, .004243, .00765, .01431, .02319, .04351, .07763, .13438, .21477, .2839, .3285, .34828, .34806, .3362, .3187, .2908, .2511, .19536, .1421, .09564, .05795, .03201, .0147, .0049, .0024, .0093, .0291, .06327, .1096, .1655, .22575, .2904, .3597, .43345, .51205, .5945, .6784, .7621, .8425, .9163, .9786, 1.0263, 1.0567, 1.0622, 1.0456, 1.0026, .9384, .85445, .7514, .6424, .5419, .4479, .3608, .2835, .2187, .1649, .1212, .0874, .0636, .04677, .0329, .0227, .01584, .011359, .0081109, .0057903, .0041095, .0028993, .0020492, .00144, .00099995, .00069008, .00047602, .0003323, .00023483, .00016615, .00011741, .000083075, .000058707, .00004151];
  const CMF_Y = [.000039, .000064, .00012, .000217, .000396, .00064, .00121, .00218, .004, .0073, .0116, .01684, .023, .0298, .038, .048, .06, .0739, .09098, .1126, .13902, .1693, .20802, .2586, .323, .4073, .503, .6082, .71, .7932, .862, .91485, .954, .9803, .99495, 1, .995, .9786, .952, .9154, .87, .8163, .757, .6949, .631, .5668, .503, .4412, .381, .321, .265, .217, .175, .1382, .107, .0816, .061, .04458, .032, .0232, .017, .01192, .00821, .005723, .004102, .002929, .002091, .001484, .001047, .00074, .00052, .0003611, .0002492, .0001719, .00012, .0000848, .00006, .0000424, .00003, .0000212, .00001499];
  const CMF_Z = [.00645, .01055, .02005, .03621, .06785, .1102, .2074, .3713, .6456, 1.0391, 1.3856, 1.623, 1.7471, 1.7826, 1.7721, 1.7441, 1.6692, 1.5281, 1.2876, 1.0419, .81295, .6162, .46518, .3533, .272, .2123, .1582, .1117, .07825, .05725, .04216, .02984, .0203, .0134, .00875, .00575, .0039, .00275, .0021, .0018, .00165, .0014, .0011, .001, .0008, .0006, .00034, .00024, .00019, .0001, .00005, .00003, .00002, .00001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const TAB_LO = 380, TAB_HI = 780, TAB_STEP = 5;
  function interp(tab, nm) {
    if (!(nm >= TAB_LO && nm <= TAB_HI)) return 0;
    const u = (nm - TAB_LO) / TAB_STEP, i = Math.min(tab.length - 2, Math.floor(u)), f = u - i;
    return tab[i] + (tab[i + 1] - tab[i]) * f;
  }
  /** CIE 1931 2° 配色函數 [x̄, ȳ, z̄]（nm） */
  function cmf(nm) { return [interp(CMF_X, nm), interp(CMF_Y, nm), interp(CMF_Z, nm)]; }
  // 每 1 nm 的配色函數（快取）
  const NMS = [], CX = [], CY = [], CZ = [];
  for (let nm = TAB_LO; nm <= TAB_HI; nm++) { const c = cmf(nm); NMS.push(nm); CX.push(c[0]); CY.push(c[1]); CZ.push(c[2]); }

  /** XYZ → 線性 sRGB（IEC 61966-2-1，D65 白點） */
  function xyzToLinear(X, Y, Z) {
    return [3.2406 * X - 1.5372 * Y - 0.4986 * Z,
      -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
      0.0557 * X - 0.2040 * Y + 1.0570 * Z];
  }
  function toSrgb8(v) {
    v = Math.max(0, Math.min(1, v));
    return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  }
  /** CIE 1931 (x, y) → CIE 1960 (u, v) */
  function uvOf(x, y) { const d = -2 * x + 12 * y + 3; return [4 * x / d, 6 * y / d]; }
  const D65_UV = uvOf(D65_XY[0], D65_XY[1]);

  /**
   * 黑體的顏色與亮度。任何溫度都能算：先以 ln B_λ 找最大值當基準，避免下溢。
   * 回傳 { X, Y, Z（以 Y = 1 正規化）, x, y, u, v, duv（到 D65 的距離）, lin（色域對應後的線性 sRGB，最亮通道 = 1）,
   *        srgb（0–255）, outGamut（原本是否超出 sRGB 色域）, log10L（輝度 cd/m² 的常用對數）, L（cd/m²，太小時為 0） }
   */
  function color(T) {
    const ln = new Float64Array(NMS.length);
    let mx = -Infinity;
    for (let i = 0; i < NMS.length; i++) { ln[i] = lnPlanck(NMS[i] * 1e-9, T); if (ln[i] > mx) mx = ln[i]; }
    let X = 0, Y = 0, Z = 0;
    for (let i = 0; i < NMS.length; i++) {
      const w = Math.exp(ln[i] - mx);
      X += CX[i] * w; Y += CY[i] * w; Z += CZ[i] * w;
    }
    // 輝度：L = K_m Σ ȳ B_λ Δλ（Δλ = 1 nm = 1e-9 m）
    const log10L = (Math.log(KM * Y * 1e-9) + mx) / Math.LN10;
    const s = X + Y + Z, x = X / s, y = Y / s;
    const uv = uvOf(x, y);
    const Xn = X / Y, Zn = Z / Y;
    let lin = xyzToLinear(Xn, 1, Zn);
    const outGamut = Math.min(lin[0], lin[1], lin[2]) < 0;
    // 色域對應：sRGB 顯示不出來的負分量直接設為 0（低溫時黑體的色度在 sRGB 三角形外的深紅處；
    // 若改成往白點減少飽和度，深紅會帶出一點紫色，所以採用截斷，色相比較接近）
    lin = lin.map(function (v) { return Math.max(0, v); });
    const top = Math.max(lin[0], lin[1], lin[2]);
    lin = lin.map(function (v) { return Math.max(0, v / top); });
    return {
      X: Xn, Y: 1, Z: Zn, x: x, y: y, u: uv[0], v: uv[1],
      duv: Math.hypot(uv[0] - D65_UV[0], uv[1] - D65_UV[1]),
      lin: lin, srgb: lin.map(toSrgb8), outGamut: outGamut,
      log10L: log10L, L: log10L > -300 ? Math.pow(10, log10L) : 0
    };
  }
  /**
   * 單一波長的顯示顏色（畫彩虹色帶用，sRGB 0–255）：配色函數 → 線性 sRGB，負值取 0，最亮通道調到 1，
   * 兩端（420 nm 以下、680 nm 以上）依人眼敏感度漸暗；光譜兩端色度幾乎不變，色相取 410 nm、690 nm 的值。380–780 nm 以外回傳 null。
   */
  function spectralRGB(nm) {
    if (!(nm >= TAB_LO && nm <= TAB_HI)) return null;
    const c = cmf(Math.min(690, Math.max(410, nm)));
    const lin = xyzToLinear(c[0], c[1], c[2]).map(function (v) { return Math.max(0, v); });
    const m = Math.max(lin[0], lin[1], lin[2]) || 1;
    const edge = nm < 420 ? 0.3 + 0.7 * (nm - TAB_LO) / 40 : nm > 680 ? 0.3 + 0.7 * (TAB_HI - nm) / 100 : 1;
    return lin.map(function (v) { return toSrgb8(v / m * edge); });
  }
  /** 顏色名稱（依溫度；黑體的色度只由溫度決定） */
  const COLOR_NAMES = [
    [1000, '深紅', 'deep red'], [1600, '紅', 'red'], [2200, '橘紅', 'orange-red'], [3000, '橘黃', 'orange-yellow'],
    [4200, '黃白', 'yellowish white'], [5500, '偏黃的白', 'warm white'], [7600, '白', 'white'], [11000, '藍白', 'bluish white'], [Infinity, '淡藍', 'pale blue']
  ];
  function colorName(T) {
    for (let i = 0; i < COLOR_NAMES.length; i++) if (T < COLOR_NAMES[i][0]) return { zh: COLOR_NAMES[i][1], en: COLOR_NAMES[i][2] };
    return { zh: '', en: '' };
  }

  // ---------------- 參考物體（數值與出處見頁面「參考資料」） ----------------
  const REFS = [
    { id: 'cmb', T: 2.725, zh: '宇宙微波背景', en: 'Cosmic microwave background' },          // Fixsen 2009：2.72548 ± 0.00057 K
    { id: 'body', T: 310, zh: '人體', en: 'Human body' },                                     // 體溫約 37 °C
    { id: 'draper', T: 798, zh: '開始發紅光', en: 'Starts to glow red' },                     // 德雷珀點（Draper 1847）：約 525 °C
    { id: 'lamp', T: 2856, zh: '白熾燈鎢絲', en: 'Incandescent lamp' },                       // CIE 標準光源 A（鎢絲燈）：2856 K
    { id: 'sun', T: 5772, zh: '太陽', en: 'The Sun' },                                        // IAU 2015 Resolution B3 名目有效溫度
    { id: 'sirius', T: 9845, zh: '天狼星 A', en: 'Sirius A' }                                  // Davis et al. 2011（PASA 28, 58）：9845 ± 64 K
  ];

  // ---------------- 最佳溫度（數值求極值，給任務與說明用） ----------------
  /** 黃金分割法在 [a, b] 找 f 的最小值（在 ln T 上找） */
  function golden(f, a, b) {
    const g = (Math.sqrt(5) - 1) / 2;
    let lo = Math.log(a), hi = Math.log(b);
    let c = hi - g * (hi - lo), d = lo + g * (hi - lo), fc = f(Math.exp(c)), fd = f(Math.exp(d));
    for (let i = 0; i < 120; i++) {
      if (fc < fd) { hi = d; d = c; fd = fc; c = hi - g * (hi - lo); fc = f(Math.exp(c)); }
      else { lo = c; c = d; fc = fd; d = lo + g * (hi - lo); fd = f(Math.exp(d)); }
    }
    return Math.exp((lo + hi) / 2);
  }
  let optCache = null;
  /** { visT（可見光比例最大的溫度）, visMax, whiteT（色度最接近 D65 的溫度）, whiteDuv } */
  function optima() {
    if (optCache) return optCache;
    const visT = golden(function (T) { return -visFrac(T); }, 3000, 15000);
    const whiteT = golden(function (T) { return color(T).duv; }, 4000, 12000);
    optCache = { visT: visT, visMax: visFrac(visT), whiteT: whiteT, whiteDuv: color(whiteT).duv };
    return optCache;
  }

  const api = {
    H: H, C: C, KB: KB, C2: C2, SIGMA: SIGMA, SIGMA_CODATA: SIGMA_CODATA, B_CODATA: B_CODATA, BNU_CODATA: BNU_CODATA,
    X5: X5, X3: X3, B_WIEN: B_WIEN, BNU_WIEN: BNU_WIEN, KM: KM, VIS: VIS, D65_XY: D65_XY, D65_UV: D65_UV, REFS: REFS,
    T_MIN: 2.5, T_MAX: 40000,
    solvePeak: solvePeak, xOf: xOf, planck: planck, lnPlanck: lnPlanck, rayleighJeans: rayleighJeans, wien: wien,
    exitance: exitance, exitanceRJ: exitanceRJ, exitanceWien: exitanceWien, log10ExitanceNm: log10ExitanceNm,
    ratioRJ: ratioRJ, ratioWien: ratioWien,
    lamMax: lamMax, nuMax: nuMax, lamOfNuMax: lamOfNuMax, peakExitance: peakExitance, totalExitance: totalExitance,
    tailFrac: tailFrac, fracBelow: fracBelow, bandFrac: bandFrac, visFrac: visFrac, integrateExitance: integrateExitance,
    modeClassical: modeClassical, modePlanck: modePlanck, modeDensity: modeDensity, energyDensityNu: energyDensityNu,
    cmf: cmf, spectralRGB: spectralRGB, xyzToLinear: xyzToLinear, uvOf: uvOf, color: color, colorName: colorName, optima: optima
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BlackbodyCore = api;
})(typeof self !== 'undefined' ? self : this);
