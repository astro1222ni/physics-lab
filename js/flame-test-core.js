/*
 * flame-test-core.js — 「焰色反應」的化學核心（與畫面無關，Node 可直接 require）
 *
 * 模型（全部在瀏覽器即時計算）：
 * 1. 本生燈火焰的溫度分布 T(h)：空氣孔開度 a（0–1）決定最高溫、內焰（藍色錐）高度與火焰高度；
 *    最熱的地方在內焰尖端的上方。白金絲在高度 h，鹽類蒸發的速率隨白金絲溫度增加，
 *    原子在白金絲上方 0–10 mm 發光，發光溫度取這一段的平均。
 * 2. 原子譜線：波長、躍遷機率 A、上下能階 E 與統計權重 g 取自 NIST Atomic Spectra Database（ASD，2026-11 查詢，
 *    空氣中的波長；有觀測值用觀測值，沒有用 Ritz 計算值）。下能階的原子數照波茲曼分布 n_i ∝ g_i e^{−E_i/kT}，
 *    吸收強度 ∫τ dλ ∝ n_i (g_k/g_i) A λ^4。
 * 3. 輻射轉移（克希何夫定律）：火焰是溫度 T 的氣體，每個波長的亮度 I = I_背景 e^{−τ} + B(λ,T)(1 − e^{−τ})，
 *    B 是蒲朗克黑體輻射。濃度低時 I ≈ B·τ（線強 ∝ g_k A e^{−E_k/kT}）；濃度高時強的共振線「自吸收」而飽和。
 *    每條譜線用等值寬度 W（高斯＋勞侖茲的譜線形狀積分）算出總亮度，譜線淨亮度 = (B − I_背景) e^{−τ_c} W。
 *    背景白光（燈泡，亮度溫度 T_L）比火焰熱 → 暗線（夫朗和斐線）；比火焰冷 → 亮線；相等 → 譜線消失（譜線反轉法量火焰溫度）。
 * 4. 鹼土金屬與銅的火焰顏色主要來自分子帶（CaOH、CaCl、SrOH、SrCl、BaOH、BaCl、CuCl、CuOH），
 *    位置取自煙火化學與火焰光度法文獻（約值），寬度與相對強度是示意值。空氣孔關小時有煤灰（灰體連續光譜）。
 * 5. 分光鏡：狹縫寬度決定解析度（高斯儀器函數的半高寬）；鈷玻璃用 Co(II) 三個吸收帶（約 530、590、645 nm）的示意穿透率。
 * 6. 人眼看到的火焰顏色：CIE 1931 配色函數（Wyman、Sloan、Shirley 2013 的解析近似，650 nm 以上改用 CIE 表內插）。
 * 不考慮：游離（銫、銣、鉀在高溫時部分游離）、火焰中化學反應的細節、譜線的超精細結構。
 */
(function (root) {
  'use strict';

  // ---------------- 常數 ----------------
  const C2 = 1.438777e7;        // 第二輻射常數 hc/k（nm·K）
  const CM_K = 1.438777;        // 1 1/cm = 1.438777 K（hc/k）
  const HC_EV_NM = 1239.84198;  // hc（eV·nm）
  const EV_KJ = 96.4853;        // 1 eV = 96.4853 kJ/mol
  const N_AIR = 1.000277;       // 標準空氣折射率（可見光的平均值，用來把空氣波長換成光子能量）
  const AMU_C2 = 931.494e6;     // 1 u 的 mc²（eV）
  const K_EV = 8.617333e-5;     // 波茲曼常數（eV/K）
  const LMIN = 380, LMAX = 800; // 分光鏡的刻度範圍（nm）
  const T_REF = 1800;           // 參考溫度（蒲朗克亮度的歸一化）
  const BROAD = 2.5;            // 譜線寬度 = 都卜勒寬度 × 2.5（一大氣壓火焰中碰撞加寬）
  const ETA = 0.3, GAM = 1.0;   // 譜線形狀：勞侖茲成分比例、勞侖茲半寬（以高斯 1/e 半寬為單位）

  // ---------------- NIST ASD 譜線 ----------------
  // [空氣波長 nm, A_ki (1/s), E_i (1/cm), E_k (1/cm), g_i, g_k, 下能階, 上能階]（能階寫成「組態 譜項」，數字照順序是殼層、占據數、多重度、J；* 表示奇宇稱，畫面上自己畫成上下標）
  const L = function (a) { return { lam: a[0], A: a[1], Ei: a[2], Ek: a[3], gi: a[4], gk: a[5], lo: a[6], up: a[7] }; };
  const ATOM_LINES = {
    Li: [
      [610.354, 5.71e7, 14903.66, 31283.08, 2, 4, '1s2 2p 2P*1/2', '1s2 3d 2D3/2'],
      [610.364, 6.86e7, 14904.00, 31283.12, 4, 6, '1s2 2p 2P*3/2', '1s2 3d 2D5/2'],
      [610.365, 1.14e7, 14904.00, 31283.08, 4, 4, '1s2 2p 2P*3/2', '1s2 3d 2D3/2'],
      [670.776, 3.69e7, 0, 14904.00, 2, 4, '1s2 2s 2S1/2', '1s2 2p 2P*3/2'],
      [670.791, 3.69e7, 0, 14903.66, 2, 2, '1s2 2s 2S1/2', '1s2 2p 2P*1/2']
    ],
    Na: [
      [588.995095, 6.16e7, 0, 16973.36619, 2, 4, '2p6 3s 2S1/2', '2p6 3p 2P*3/2'],
      [589.592424, 6.14e7, 0, 16956.17025, 2, 2, '2p6 3s 2S1/2', '2p6 3p 2P*1/2']
    ],
    K: [
      [404.4136, 1.15e6, 0, 24720.139, 2, 4, '3p6 4s 2S1/2', '3p6 5p 2P*3/2'],
      [404.7208, 1.07e6, 0, 24701.382, 2, 2, '3p6 4s 2S1/2', '3p6 5p 2P*1/2'],
      [691.1084, 2.50e6, 12985.185724, 27450.7104, 2, 2, '3p6 4p 2P*1/2', '3p6 6s 2S1/2'],
      [693.8767, 4.96e6, 13042.896027, 27450.7104, 4, 2, '3p6 4p 2P*3/2', '3p6 6s 2S1/2'],
      [766.489913, 3.78e7, 0, 13042.896027, 2, 4, '3p6 4s 2S1/2', '3p6 4p 2P*3/2'],
      [769.896456, 3.73e7, 0, 12985.185724, 2, 2, '3p6 4s 2S1/2', '3p6 4p 2P*1/2']
    ],
    Rb: [
      [420.1792, 1.77e6, 0, 23792.591, 2, 4, '4p6 5s 2S1/2', '4p6 6p 2P*3/2'],
      [421.5524, 1.50e6, 0, 23715.081, 2, 2, '4p6 5s 2S1/2', '4p6 6p 2P*1/2'],
      [620.63092, 2.95e6, 12578.95, 28687.127, 2, 4, '4p6 5p 2P*1/2', '4p6 6d 2D3/2'],
      [629.83252, 3.71e6, 12816.545, 28689.39, 4, 6, '4p6 5p 2P*3/2', '4p6 6d 2D5/2'],
      [780.0268, 3.81e7, 0, 12816.545, 2, 4, '4p6 5s 2S1/2', '4p6 5p 2P*3/2'],
      [794.7603, 3.61e7, 0, 12578.95, 2, 2, '4p6 5s 2S1/2', '4p6 5p 2P*1/2']
    ],
    Cs: [
      [387.61486, 3.9e5, 0, 25791.508, 2, 4, '5p6 6s 2S1/2', '5p6 8p 2P*3/2'],
      [388.8611413, 9.0e4, 0, 25708.83548, 2, 2, '5p6 6s 2S1/2', '5p6 8p 2P*1/2'],
      [455.52799, 1.84e6, 0, 21946.397, 2, 4, '5p6 6s 2S1/2', '5p6 7p 2P*3/2'],
      [459.31721, 7.94e5, 0, 21765.348, 2, 2, '5p6 6s 2S1/2', '5p6 7p 2P*1/2'],
      [684.89056, 22.2, 0, 14596.84232, 2, 6, '5p6 6s 2S1/2', '5p6 5d 2D5/2']
    ],
    Ca: [
      [422.673, 2.18e8, 0, 23652.304, 1, 3, '4s2 1S0', '4s4p 1P*1'],
      [430.253, 1.36e8, 15315.943, 38551.558, 5, 5, '4s4p 3P*2', '4p2 3P2'],
      [445.478, 8.7e7, 15315.943, 37757.449, 5, 7, '4s4p 3P*2', '4s4d 3D3'],
      [610.272, 9.6e6, 15157.901, 31539.495, 1, 3, '4s4p 3P*0', '4s5s 3S1'],
      [612.222, 2.87e7, 15210.063, 31539.495, 3, 3, '4s4p 3P*1', '4s5s 3S1'],
      [616.217, 4.77e7, 15315.943, 31539.495, 5, 3, '4s4p 3P*2', '4s5s 3S1'],
      [643.907, 5.3e7, 20371.0, 35896.889, 7, 9, '3d4s 3D3', '3d4p 3F*4'],
      [646.257, 4.7e7, 20349.26, 35818.713, 5, 7, '3d4s 3D2', '3d4p 3F*3'],
      [649.378, 4.4e7, 20335.36, 35730.454, 3, 5, '3d4s 3D1', '3d4p 3F*2'],
      [657.278, 2.6e3, 0, 15210.063, 1, 3, '4s2 1S0', '4s4p 3P*1']
    ],
    Sr: [
      [460.7331, 2.01e8, 0, 21698.452, 1, 3, '5s2 1S0', '5s5p 1P*1'],
      [481.1881, 9.0e7, 14898.545, 35674.637, 5, 5, '5s5p 3P*2', '5p2 3P2'],
      [496.2263, 6.14e7, 14898.545, 35045.019, 5, 7, '5s5p 3P*2', '5s5d 3D3'],
      [640.8463, 2.4e7, 18319.261, 33919.315, 7, 9, '5s4d 3D3', '4d5p 3F*4'],
      [650.3989, 2.0e7, 18218.784, 33589.709, 5, 7, '5s4d 3D2', '4d5p 3F*3'],
      [679.1022, 8.9e6, 14317.507, 29038.773, 1, 3, '5s5p 3P*0', '5s6s 3S1'],
      [687.8313, 2.7e7, 14504.334, 29038.773, 3, 3, '5s5p 3P*1', '5s6s 3S1'],
      [689.2585, 4.69e4, 0, 14504.334, 1, 3, '5s2 1S0', '5s5p 3P*1'],
      [707.0071, 4.2e7, 14898.545, 29038.773, 5, 3, '5s5p 3P*2', '5s6s 3S1'],
      [730.9417, 3.9e7, 20149.685, 33826.899, 5, 5, '5s4d 1D2', '4d5p 1D*2']
    ],
    Ba: [
      [553.5481, 1.19e8, 0, 18060.261, 1, 3, '6s2 1S0', '6s6p 1P*1'],
      [611.0783, 1.0e8, 9596.533, 25956.519, 7, 5, '6s5d 3D3', '5d6p 3P*2'],
      [649.876, 5.4e7, 9596.533, 24979.834, 7, 7, '6s5d 3D3', '5d6p 3D*3'],
      [652.7311, 3.3e7, 9215.501, 24531.513, 5, 5, '6s5d 3D2', '5d6p 3D*2'],
      [705.9943, 5.0e7, 9596.533, 23757.049, 7, 9, '6s5d 3D3', '5d6p 3F*4'],
      [712.0331, 1.1e7, 9033.966, 23074.387, 3, 5, '6s5d 3D1', '5d6p 1D*2'],
      [728.0296, 3.2e7, 9215.501, 22947.423, 5, 7, '6s5d 3D2', '5d6p 3F*3'],
      [767.2085, 1.5e7, 9033.966, 22064.645, 3, 5, '6s5d 3D1', '5d6p 3F*2'],
      [778.0478, 7.6e6, 9215.501, 22064.645, 5, 5, '6s5d 3D2', '5d6p 3F*2'],
      [791.1329, 2.98e5, 0, 12636.623, 1, 3, '6s2 1S0', '6s6p 3P*1']
    ],
    Cu: [
      [510.5541, 2.0e6, 11202.618, 30783.697, 6, 4, '3d94s2 2D5/2', '3d104p 2P*3/2'],
      [515.3235, 6.0e7, 30535.324, 49935.195, 2, 4, '3d104p 2P*1/2', '3d104d 2D3/2'],
      [521.8202, 7.5e7, 30783.697, 49942.051, 4, 6, '3d104p 2P*3/2', '3d104d 2D5/2'],
      [522.007, 1.5e7, 30783.697, 49935.195, 4, 4, '3d104p 2P*3/2', '3d104d 2D3/2'],
      [570.024, 2.4e5, 13245.443, 30783.697, 4, 4, '3d94s2 2D3/2', '3d104p 2P*3/2'],
      [578.2132, 1.65e6, 13245.443, 30535.324, 4, 2, '3d94s2 2D3/2', '3d104p 2P*1/2']
    ]
  };

  // ---------------- 金屬（以氯化物溶液沾在白金絲上） ----------------
  // M：原子量；K：自由原子的相對多寡（含原子化效率，示意值）；bands：[中心 nm, 半高寬 nm, 相對強度, 名稱]
  const METALS = {
    Li: { zh: '鋰', en: 'lithium', salt: 'LiCl', M: 6.94, K: 0.6, bands: [] },
    Na: { zh: '鈉', en: 'sodium', salt: 'NaCl', M: 22.990, K: 1.0, bands: [] },
    K: { zh: '鉀', en: 'potassium', salt: 'KCl', M: 39.098, K: 1.0, bands: [] },
    Rb: { zh: '銣', en: 'rubidium', salt: 'RbCl', M: 85.468, K: 4.0, bands: [] },
    Cs: { zh: '銫', en: 'caesium', salt: 'CsCl', M: 132.905, K: 3.0, bands: [] },
    Ca: { zh: '鈣', en: 'calcium', salt: 'CaCl2', M: 40.078, K: 0.04, bands: [
      [554, 6, 0.8, 'CaOH'], [593, 7, 0.45, 'CaCl'], [605.5, 5, 0.35, 'CaCl'], [622, 14, 1.0, 'CaOH']] },
    Sr: { zh: '鍶', en: 'strontium', salt: 'SrCl2', M: 87.62, K: 0.05, bands: [
      [606.5, 12, 0.75, 'SrOH'], [620, 6, 0.5, 'SrCl'], [631, 8, 0.75, 'SrCl'], [643, 6, 0.6, 'SrCl'], [659, 8, 0.6, 'SrOH'], [682, 9, 0.7, 'SrOH']] },
    Ba: { zh: '鋇', en: 'barium', salt: 'BaCl2', M: 137.327, K: 0.4, bands: [
      [487, 6, 0.55, 'BaOH'], [512, 6, 0.75, 'BaOH'], [513, 4, 0.6, 'BaCl'], [526, 4, 0.8, 'BaCl'], [531.5, 3, 0.55, 'BaCl']] },
    Cu: { zh: '銅', en: 'copper', salt: 'CuCl2', M: 63.546, K: 0.3, bands: [
      [420, 4, 6, 'CuCl'], [428, 4, 9, 'CuCl'], [435, 4, 11, 'CuCl'], [443, 4, 10, 'CuCl'], [452, 4, 7, 'CuCl'],
      [488, 5, 0.3, 'CuCl'], [498, 5, 0.3, 'CuCl'], [526, 5, 0.35, 'CuCl'], [545, 20, 0.9, 'CuOH']] }
  };
  const ORDER = ['Li', 'Na', 'K', 'Rb', 'Cs', 'Ca', 'Sr', 'Ba', 'Cu'];
  ORDER.forEach(function (s) { METALS[s].sym = s; METALS[s].lines = ATOM_LINES[s].map(L); });
  const K_LINE = 70;   // 譜線吸收強度的總係數（使 0.1 M 鈉的 D 線光學深度約數十）
  const K_BAND = 0.09;     // 分子帶的係數
  const SAMPLE_BAND = 0;  // （保留）

  // ---------------- 本生燈火焰 ----------------
  /** 空氣孔開度 a（0–1）→ 火焰的幾何與最高溫（mm、K） */
  function flameShape(a) {
    a = clamp(a, 0, 1);
    const Tmax = 1250 + 570 * a;                 // 全開約 1820 K（約 1550 °C）
    const Hf = 60 + 70 * (1 - a);                // 火焰高度
    const Hc = a >= 0.25 ? 12 + 20 * (1 - a) : 0; // 內焰（藍色錐）高度；空氣太少就沒有內焰
    const hp = Hc > 0 ? Hc + 0.18 * (Hf - Hc) : 0.25 * Hf;   // 最熱的高度
    return { a: a, Tmax: Tmax, Hf: Hf, Hc: Hc, hp: hp, Ttip: 0.72 * Tmax };
  }
  /** 火焰中心線上高度 h（mm）的溫度（K） */
  function temperature(h, a) {
    const F = flameShape(a), T0 = 300;
    if (h <= 0) return T0;
    const Tc = 0.6 * F.Tmax;
    if (F.Hc > 0 && h < F.Hc) return T0 + (Tc - T0) * (h / F.Hc) * (h / F.Hc);
    const h0 = F.Hc > 0 ? F.Hc : 0, T1 = F.Hc > 0 ? Tc : T0;
    if (h < F.hp) { const u = (h - h0) / (F.hp - h0); return T1 + (F.Tmax - T1) * (0.5 - 0.5 * Math.cos(Math.PI * u)); }
    if (h <= F.Hf) return F.Tmax - (F.Tmax - F.Ttip) * Math.pow((h - F.hp) / (F.Hf - F.hp), 1.5);
    return F.Ttip - (F.Ttip - 500) * (1 - Math.exp(-(h - F.Hf) / 15));
  }
  /** 白金絲在 h：發光區（白金絲上方 0–10 mm）的平均溫度、蒸發速率（相對於 1800 K） */
  function wireZone(h, a) {
    let s = 0;
    for (let k = 0; k <= 10; k++) s += temperature(h + k, a);
    const Temit = s / 11, Tw = temperature(h, a);
    const vap = Math.exp(-12400 * (1 / Math.max(Tw, 300) - 1 / 1800));
    return { Tw: Tw, T: Temit, vap: Math.min(vap, 3) };
  }
  /** 煤灰（黃色發光火焰）的光學深度：空氣孔開度 < 0.5 才有 */
  function sootTau(lam, a) {
    const s = Math.max(0, 0.5 - a);
    return 12 * s * s * Math.pow(550 / lam, 1.3);
  }

  // ---------------- 輻射 ----------------
  /** 蒲朗克亮度（相對值，以 589 nm、1800 K 為 1） */
  const BREF = planckRaw(589, T_REF);
  function planckRaw(lam, T) { if (!(T > 0)) return 0; const x = C2 / (lam * T); return x > 700 ? 0 : Math.pow(589 / lam, 5) / Math.expm1(x); }
  function planck(lam, T) { return planckRaw(lam, T) / BREF; }

  /** 鈷玻璃的穿透率（Co(II) 三個吸收帶的示意模型） */
  function cobalt(lam) {
    const g = function (c, s) { const t = (lam - c) / s; return Math.exp(-0.5 * t * t); };
    return 0.85 * Math.exp(-(3.5 * g(530, 18) + 8.5 * g(590, 18) + 4.0 * g(645, 20)));
  }

  /** 光子能量（eV）：空氣中的波長換成真空波長 */
  function photonEV(lamAir) { return HC_EV_NM / (lamAir * N_AIR); }
  /** 高斯 1/e 半寬（nm）＝都卜勒寬度 × 碰撞加寬倍數 */
  function dopplerWidth(lam, T, M) { return BROAD * lam * Math.sqrt(2 * K_EV * T / (M * AMU_C2)); }

  const PHI_AREA = (1 - ETA) * Math.sqrt(Math.PI) + ETA * Math.PI * GAM;
  /** 等值寬度（以高斯 1/e 半寬為單位）：∫(1 − exp(−τ0 φ(x))) dx，φ(0) = 1 */
  function eqWidthUnit(tau0) {
    if (!(tau0 > 0)) return 0;
    if (tau0 < 1e-4) return tau0 * PHI_AREA;
    const g = Math.max(1, Math.sqrt(tau0 * ETA) * GAM), N = 600;
    let s = 0;
    for (let k = 0; k < N; k++) {
      const th = -Math.PI / 2 + (k + 0.5) * Math.PI / N, x = g * Math.tan(th), c = Math.cos(th);
      const phi = (1 - ETA) * Math.exp(-x * x) + ETA / (1 + (x / GAM) * (x / GAM));
      s += -Math.expm1(-tau0 * phi) * g / (c * c);
    }
    return s * Math.PI / N;
  }

  // ---------------- 狀態與光譜 ----------------
  /**
   * 實驗狀態 o：{ metals: ['Na', …], conc（mol/L）, air（0–1）, h（mm）, cobalt（bool）, lamp（bool）, TL（K）, res（nm 半高寬） }
   * 傳回光譜物件：continuum(λ)、lines[]（每條的淨面積 net、位置）、eval(λ)、flame（溫度等）
   */
  function spectrum(o) {
    const z = wireZone(o.h, o.air), T = z.T, F = flameShape(o.air);
    const conc = Math.max(0, o.conc || 0) * z.vap;
    const metals = (o.metals || []).filter(function (s) { return METALS[s]; });
    const TL = o.lamp ? o.TL : 0;
    const res = Math.max(0.02, o.res || 1);
    const kT = T / CM_K;   // 1/cm
    // 分子帶的光學深度
    const bands = [];
    metals.forEach(function (s) {
      const m = METALS[s];
      m.bands.forEach(function (b) { bands.push({ el: s, c: b[0], sig: b[1] / 2.3548, k: K_BAND * conc * b[2], name: b[3] }); });
    });
    function tauBand(lam) {
      let t = 0;
      for (let i = 0; i < bands.length; i++) { const u = (lam - bands[i].c) / bands[i].sig; if (u > -6 && u < 6) t += bands[i].k * Math.exp(-0.5 * u * u); }
      return t;
    }
    function tauC(lam) { return sootTau(lam, o.air) + tauBand(lam); }
    function background(lam) { return TL > 0 ? planck(lam, TL) : 0; }
    function trans(lam) { return o.cobalt ? cobalt(lam) : 1; }
    // 原子譜線
    const lines = [];
    metals.forEach(function (s) {
      const m = METALS[s];
      m.lines.forEach(function (ln) {
        const pop = Math.exp(-ln.Ei / kT);
        const tint = K_LINE * m.K * conc * (ln.gk / ln.gi) * (ln.A / 1e8) * Math.pow(ln.lam / 1000, 4) * ln.gi * pop / groundG(m);
        const D = dopplerWidth(ln.lam, T, m.M);
        const tau0 = tint / (D * PHI_AREA);
        const W = D * eqWidthUnit(tau0);                       // nm
        const tc = tauC(ln.lam);
        const net = (planck(ln.lam, T) - background(ln.lam)) * Math.exp(-tc) * W * trans(ln.lam);
        const thin = planck(ln.lam, T) * tint * trans(ln.lam);  // 光學薄時的亮度（比較自吸收用）
        lines.push({ el: s, lam: ln.lam, net: net, W: W, tau0: tau0, thin: thin, ln: ln, eV: photonEV(ln.lam) });
      });
    });
    const sg = res / 2.3548;
    function continuum(lam) {
      const tc = tauC(lam);
      return (background(lam) * Math.exp(-tc) + planck(lam, T) * -Math.expm1(-tc)) * trans(lam);
    }
    function linePart(lam) {
      let s = 0;
      for (let i = 0; i < lines.length; i++) {
        const u = (lam - lines[i].lam) / sg;
        if (u > -7 && u < 7) s += lines[i].net * Math.exp(-0.5 * u * u);
      }
      return s / (sg * Math.sqrt(2 * Math.PI));
    }
    return {
      o: o, T: T, Tw: z.Tw, vap: z.vap, F: F, conc: conc, res: res, metals: metals, lines: lines, bands: bands, TL: TL,
      continuum: continuum, linePart: linePart,
      eval: function (lam) { return continuum(lam) + linePart(lam); },
      flameOnly: function (lam) { const tc = tauC(lam); return planck(lam, T) * -Math.expm1(-tc) * trans(lam); },
      sootShare: sootShare
    };
    /** 可見光中煤灰連續光譜占火焰發光的比例 */
    function sootShare() {
      let sootY = 0, lineY = 0;
      for (let lam = 400; lam <= 700; lam += 2) {
        const ts = sootTau(lam, o.air), tb = tauBand(lam), y = cmf(lam)[1];
        const tot = planck(lam, T) * -Math.expm1(-(ts + tb));
        const sootPart = (ts + tb) > 0 ? tot * ts / (ts + tb) : 0;
        sootY += sootPart * y * 2; lineY += (tot - sootPart) * y * 2;
      }
      lines.forEach(function (l) { if (l.net > 0) lineY += l.net * cmf(l.lam)[1]; });
      return sootY + lineY > 0 ? sootY / (sootY + lineY) : 0;
    }
  }
  function groundG(m) { return m.lines.reduce(function (g, l) { return l.Ei === 0 ? l.gi : g; }, 1); }

  // ---------------- 人眼的顏色 ----------------
  function g2(x, mu, s1, s2) { const t = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * t * t); }
  /** CIE 1931 2° 配色函數（Wyman、Sloan、Shirley 2013 的解析近似） */
  // 650 nm 以上 Wyman 近似的尾端偏差較大，改用 CIE 1931 表（650–780 nm）做對數內插，780 nm 以上指數遞減
  const CIE_TAIL = [[650, 0.2835, 0.107], [660, 0.1649, 0.061], [670, 0.0874, 0.032], [680, 0.04677, 0.017], [690, 0.0227, 0.00821],
    [700, 0.011359, 0.004102], [710, 0.00579, 0.002091], [720, 0.002899, 0.001047], [740, 0.00069, 0.000249], [760, 0.000166, 0.00006], [780, 0.0000417, 0.000015]];
  function cmf(nm) {
    if (nm < 360 || nm > 830) return [0, 0, 0];
    if (nm >= 650) {
      if (nm >= 780) { const f = Math.exp(-(nm - 780) / 14); return [0.0000417 * f, 0.000015 * f, 0]; }
      let i = 0; while (CIE_TAIL[i + 1][0] < nm) i++;
      const a = CIE_TAIL[i], b = CIE_TAIL[i + 1], u = (nm - a[0]) / (b[0] - a[0]);
      return [a[1] * Math.pow(b[1] / a[1], u), a[2] * Math.pow(b[2] / a[2], u), 0];
    }
    return [
      1.056 * g2(nm, 599.8, 37.9, 31.0) + 0.362 * g2(nm, 442.0, 16.0, 26.7) - 0.065 * g2(nm, 501.1, 20.4, 26.2),
      0.821 * g2(nm, 568.8, 46.9, 40.5) + 0.286 * g2(nm, 530.9, 16.3, 31.1),
      Math.max(0, 1.217 * g2(nm, 437.0, 11.8, 36.0) + 0.681 * g2(nm, 459.0, 26.0, 13.8))
    ];
  }
  function xyzToLinear(c) {
    return [3.2406 * c[0] - 1.5372 * c[1] - 0.4986 * c[2], -0.9689 * c[0] + 1.8758 * c[1] + 0.0415 * c[2], 0.0557 * c[0] - 0.2040 * c[1] + 1.0570 * c[2]];
  }
  function encode(v) { v = Math.max(0, Math.min(1, v)); return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); }
  /** 單一波長的顯示顏色（sRGB 0–255，最亮通道 = 1；兩端漸暗）。不可見回傳 null */
  function wavelengthRGB(nm) {
    if (!(nm >= LMIN && nm <= LMAX)) return null;
    const lin = xyzToLinear(cmf(Math.min(690, Math.max(410, nm)))).map(function (v) { return Math.max(0, v); });
    const m = Math.max(lin[0], lin[1], lin[2]) || 1;
    const edge = nm < 420 ? 0.35 + 0.65 * (nm - LMIN) / 40 : nm > 690 ? Math.max(0.12, 1 - 0.88 * (nm - 690) / 110) : 1;
    return lin.map(function (v) { return encode(v / m * edge); });
  }
  /** 本生燈火焰本身的微弱藍光（CH 431 nm、C2 516 nm 帶；亮度是示意值，相對 0.1 M 鈉焰約 5 × 10^-5） */
  const BASE_Y = 5e-5;
  let BASE_XYZ = null;
  function baseXYZ() {
    if (!BASE_XYZ) {
      const a = cmf(431), b = cmf(516), w = [0.75, 0.25];
      BASE_XYZ = [0, 1, 2].map(function (i) { return w[0] * a[i] + w[1] * b[i]; });
      const y = BASE_XYZ[1]; BASE_XYZ = BASE_XYZ.map(function (v) { return v / y; });
    }
    return BASE_XYZ;
  }
  /** 火焰（不含背景燈）在人眼中的 XYZ（不含本生燈本身的藍光） */
  function flameXYZ(S) {
    const xyz = [0, 0, 0];
    for (let lam = 380; lam <= 780; lam += 1) {
      const v = S.flameOnly(lam), c = cmf(lam);
      xyz[0] += v * c[0]; xyz[1] += v * c[1]; xyz[2] += v * c[2];
    }
    S.lines.forEach(function (l) {
      // 火焰本身（沒有背景燈）的線亮度
      const tr = S.o.cobalt ? cobalt(l.lam) : 1;
      const v = planck(l.lam, S.T) * Math.exp(-(sootTau(l.lam, S.o.air))) * l.W * tr;
      const c = cmf(l.lam);
      xyz[0] += v * c[0]; xyz[1] += v * c[1]; xyz[2] += v * c[2];
    });
    return xyz;
  }
  /** XYZ → 顯示用的顏色（最亮通道 = 1）與色度座標 */
  function colorOf(xyz) {
    const s = xyz[0] + xyz[1] + xyz[2];
    if (!(s > 0)) return null;
    const lin = xyzToLinear(xyz).map(function (v) { return Math.max(0, v); });
    const m = Math.max(lin[0], lin[1], lin[2]) || 1;
    return { rgb: lin.map(function (v) { return encode(v / m); }), x: xyz[0] / s, y: xyz[1] / s, Y: xyz[1] };
  }
  /** 主波長（nm）：色度點與白點（E，1/3、1/3）連線延長到光譜軌跡；落在紫紅線上時傳回負的互補波長 */
  let LOCUS = null;
  function dominantWavelength(x, y) {
    if (!LOCUS) {
      LOCUS = [];
      for (let l = 400; l <= 700; l += 0.5) { const c = cmf(l), s = c[0] + c[1] + c[2]; LOCUS.push([l, c[0] / s, c[1] / s]); }
    }
    const wx = 1 / 3, wy = 1 / 3, ang = Math.atan2(y - wy, x - wx);
    let best = null, bd = 1e9, comp = null, cd = 1e9;
    LOCUS.forEach(function (p) {
      const a = Math.atan2(p[2] - wy, p[1] - wx);
      let d = Math.abs(a - ang); if (d > Math.PI) d = 2 * Math.PI - d;
      if (d < bd) { bd = d; best = p[0]; }
      let dc = Math.abs(a - ang - Math.PI); dc = dc % (2 * Math.PI); if (dc > Math.PI) dc = 2 * Math.PI - dc;
      if (dc < cd) { cd = dc; comp = p[0]; }
    });
    return bd < 0.03 ? best : -comp;
  }
  /** 顏色名稱（依主波長；紫紅線上依互補波長） */
  const NAMES = [
    [455, '藍紫', 'violet-blue'], [482, '藍', 'blue'], [505, '藍綠', 'blue-green'], [540, '綠', 'green'],
    [570, '黃綠', 'yellow-green'], [593, '黃', 'yellow'], [600, '橙黃', 'orange-yellow'], [612, '橙紅（磚紅）', 'orange-red (brick red)'],
    [640, '紅', 'red'], [701, '深紅', 'crimson']
  ];
  function colorName(dw, purity) {
    if (dw == null) return null;
    if (purity != null && purity < 0.05) return { zh: '淡白', en: 'whitish' };
    if (dw < 0) {
      const c = -dw;
      if (c > 545) return { zh: '紫', en: 'violet' };
      if (c > 520) return { zh: '紫紅（淡紫）', en: 'lilac' };
      return { zh: '洋紅', en: 'magenta-red' };
    }
    for (let i = 0; i < NAMES.length; i++) if (dw < NAMES[i][0]) return { zh: NAMES[i][1], en: NAMES[i][2] };
    return { zh: '深紅', en: 'crimson' };
  }
  /** 火焰顏色摘要：顏色、名稱、亮度（相對 0.1 M 鈉在最熱處） */
  let YREF = null;
  function flameColor(S) {
    if (YREF == null) {
      const R = spectrum({ metals: ['Na'], conc: 0.1, air: 1, h: flameShape(1).hp - 3, res: 1 });
      YREF = flameXYZ(R)[1];
    }
    const m = flameXYZ(S).map(function (v) { return v / YREF; });
    const tr = S.o.cobalt ? 0.85 : 1, bY = BASE_Y * (S.o.air >= 0.25 ? 1 : 0.3), b = baseXYZ();
    const xyz = m.map(function (v, i) { return v + bY * tr * b[i] * (S.o.cobalt && i < 2 ? 0.7 : 1); });
    const c = colorOf(xyz), cm = colorOf(m);
    if (!c) return { rgb: null, Y: 0, Ym: 0, name: null, dw: null };
    const dw = dominantWavelength(c.x, c.y), pur = Math.hypot(c.x - 1 / 3, c.y - 1 / 3);
    return { rgb: c.rgb, x: c.x, y: c.y, Y: xyz[1], Ym: m[1], mrgb: cm ? cm.rgb : null, dw: dw, purity: pur, name: colorName(dw, pur) };
  }

  // ---------------- 分光鏡上的量測 ----------------
  /**
   * 從 λ0 沿著光譜往上爬到最近的一個峰（局部最大），最多走 max(3·解析度, 0.6 nm)；
   * 爬到範圍邊緣（只是連續光譜的斜坡）、或附近完全平坦（沒有光）時傳回 null
   */
  function climb(S, lam0, sgn) {
    const r = Math.max(3 * S.res, 0.6), st = S.res / 20;
    const f = function (l) { return sgn * S.eval(l); };
    let x = lam0, v = f(x);
    const up = f(x + st), dn = f(x - st);
    if (up <= v && dn <= v) {                       // 已經在峰上：兩邊都要嚴格比較低
      if (!(up < v && dn < v)) return null;
    } else {
      const dir = up > dn ? 1 : -1;
      for (;;) {
        const nx = x + dir * st, nv = f(nx);
        if (!(nv > v)) break;
        x = nx; v = nv;
        if (Math.abs(x - lam0) >= r) return null;   // 爬到範圍邊緣：不是峰
      }
    }
    if (sgn > 0 && !(v > 0)) return null;
    // 拋物線細修
    const a = f(x - st), c = f(x + st), den = a - 2 * v + c;
    if (den < 0) x += 0.5 * st * (a - c) / den;
    return x;
  }
  /** 找亮線：從 λ0 往上爬到最近的峰；找不到明顯的峰傳回 null */
  function findPeak(S, lam0) { return climb(S, lam0, 1); }
  /** 找暗線（局部最小）：用在背景燈比火焰熱的時候 */
  function findDip(S, lam0) { return climb(S, lam0, -1); }
  /** 兩條線（l1 < l2）在顯示光譜上是否分得開：中間的最低點低於較矮的峰的 81%（瑞立判準的近似） */
  function resolved(S, l1, l2) {
    const p1 = Math.abs(S.linePart(l1)), p2 = Math.abs(S.linePart(l2));
    let mid = Infinity;
    for (let l = l1; l <= l2; l += (l2 - l1) / 40) mid = Math.min(mid, Math.abs(S.linePart(l)));
    return mid < 0.81 * Math.min(p1, p2);
  }
  /** 所有金屬的譜線中，離 λ 最近的一條 */
  function nearestLine(lam, metals) {
    let best = null, bd = Infinity;
    (metals || ORDER).forEach(function (s) {
      METALS[s].lines.forEach(function (ln) { const d = Math.abs(ln.lam - lam); if (d < bd) { bd = d; best = { el: s, lam: ln.lam, ln: ln }; } });
    });
    return best ? Object.assign(best, { d: bd }) : null;
  }
  /** 這條線在目前光譜中的淨強度（加總附近同元素、落在解析度內的線） */
  function lineSignal(S, lam) {
    let s = 0;
    S.lines.forEach(function (l) { if (Math.abs(l.lam - lam) < 1e-6) s += l.net; });
    return s;
  }
  /** 參考線強：0.1 M 鈉、空氣全開、最熱處、沒有背景燈的 D2 線淨強度 */
  let NETREF = null;
  function netRef() {
    if (NETREF == null) { const R = spectrum({ metals: ['Na'], conc: 0.1, air: 1, h: flameShape(1).hp, res: 1 }); NETREF = R.lines[0].net; }
    return NETREF;
  }
  /**
   * 量測一次（游標放在 λ）：給任務與讀數用的資料
   * sig：λ 處顯示亮度 ÷ 可見範圍的最大亮度；net：最近那條（有出現在樣品中的）線的淨強度 ÷ 參考線強；
   * contrast：線的淨強度 ÷ (線的淨強度 + 該處連續光譜 × 解析度)，看得出線的程度
   */
  function measure(S, lam) {
    const near = S.metals.length ? nearestLine(lam, S.metals) : null;
    let maxv = 0;
    for (let l = LMIN; l <= LMAX; l += 0.25) maxv = Math.max(maxv, S.eval(l));
    S.lines.forEach(function (l) { maxv = Math.max(maxv, S.eval(l.lam)); });
    const v = S.eval(lam);
    let net = null, contrast = null;
    if (near) {
      const n = lineSignal(S, near.lam);
      net = n / netRef();
      const cont = S.continuum(near.lam) * S.res;
      contrast = Math.abs(n) / (Math.abs(n) + cont + 1e-30);
    }
    const pk = findPeak(S, lam), dp = findDip(S, lam);
    return {
      lam: lam, eV: photonEV(lam), sig: maxv > 0 ? v / maxv : 0,
      near: near ? { el: near.el, lam: near.lam, d: near.d } : null,
      net: net, contrast: contrast,
      isPeak: pk != null && Math.abs(pk - lam) <= Math.max(0.02, S.res / 10),
      isDip: dp != null && Math.abs(dp - lam) <= Math.max(0.02, S.res / 10),
      resolvedD: resolved(S, 588.995095, 589.592424)
    };
  }

  // ---------------- 未知樣品 ----------------
  function rng(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** 抽一個未知樣品：mix = true 時兩種金屬（不同的兩種），否則一種；避開上一題 */
  function newUnknown(R, mix, last) {
    for (let k = 0; k < 50; k++) {
      const a = ORDER[Math.floor(R() * ORDER.length)];
      let m = [a];
      if (mix) { let b = a; while (b === a) b = ORDER[Math.floor(R() * ORDER.length)]; m = [a, b].sort(function (x, y) { return ORDER.indexOf(x) - ORDER.indexOf(y); }); }
      if (!last || m.join() !== last.join()) return { metals: m, conc: +(0.05 + 0.25 * R()).toFixed(3) };
    }
    return { metals: mix ? ['Na', 'K'] : ['Na'], conc: 0.1 };
  }
  function sameSet(a, b) { return a.length === b.length && a.slice().sort().join() === b.slice().sort().join(); }

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  const api = {
    C2: C2, CM_K: CM_K, HC_EV_NM: HC_EV_NM, EV_KJ: EV_KJ, N_AIR: N_AIR, K_EV: K_EV, LMIN: LMIN, LMAX: LMAX, T_REF: T_REF,
    METALS: METALS, ORDER: ORDER, K_LINE: K_LINE, K_BAND: K_BAND, BROAD: BROAD, PHI_AREA: PHI_AREA,
    flameShape: flameShape, temperature: temperature, wireZone: wireZone, sootTau: sootTau,
    planck: planck, cobalt: cobalt, photonEV: photonEV, dopplerWidth: dopplerWidth, eqWidthUnit: eqWidthUnit,
    spectrum: spectrum, cmf: cmf, wavelengthRGB: wavelengthRGB, flameXYZ: flameXYZ, colorOf: colorOf,
    dominantWavelength: dominantWavelength, colorName: colorName, flameColor: flameColor,
    findPeak: findPeak, findDip: findDip, resolved: resolved, nearestLine: nearestLine, lineSignal: lineSignal, netRef: netRef, measure: measure,
    rng: rng, newUnknown: newUnknown, sameSet: sameSet
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FlameCore = api;
})(typeof window !== 'undefined' ? window : this);
