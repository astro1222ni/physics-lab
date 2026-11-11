/*
 * hydrogen-spectrum-core.js — 氫原子能階與光譜的物理核心（與畫面無關，可單獨測試）
 *
 * 單位約定：
 *   能量 ........ eV（另有 J 的換算）
 *   波長 ........ nm，「真空中的波長」；空氣中的波長另外用 airWavelength() 換算
 *   長度 ........ m
 *   時間 ........ s
 *
 * 常數（CODATA 2018；h、c、e 為定義值）：
 *   h = 6.62607015e-34 J·s，c = 299792458 m/s，e = 1.602176634e-19 C
 *   R∞ = 10973731.568160 m^-1（芮得柏常數，原子核質量無限大）
 *   me/mp = 1/1836.15267343
 *   α = 7.2973525693e-3（精細結構常數），a0 = 5.29177210903e-11 m（波耳半徑）
 *
 * 氫原子（波耳模型，考慮原子核質量有限的「約化質量」修正 μ = me·mp/(me+mp)）：
 *   R_H = R∞ / (1 + me/mp) = 1.09678 × 10^7 m^-1
 *   E_n = −hcR_H / n² = −13.598 eV / n²（課本寫 −13.6 eV / n²）
 *   1/λ = R_H (1/n_f² − 1/n_i²)            （芮得柏公式，λ 為真空波長）
 *   r_n = n² a，a = a0 (1 + me/mp) = 0.5295 Å   （電子與質子的距離）
 *   v_n = αc / n                           （電子相對於質子的速率）
 *   L_n = μ v_n r_n = nħ                    （角動量量子化）
 *   T_n = 2π r_n / v_n                      （繞一圈的時間）
 *   物質波：2π r_n = n λ_dB，λ_dB = h / (μ v_n)
 * 這組量彼此完全一致：E_n = −ke²/(2r_n) = −½ μ v_n²（動能 = −E_n，位能 = 2E_n）。
 * 修正只有 0.05%：r_1 = 0.529 Å、v_1 = 2.19 × 10^6 m/s、E_1 = −13.6 eV 與課本相同。
 *
 * 自發輻射的躍遷機率（愛因斯坦 A 係數，s^-1）：
 *   NIST 原子光譜資料庫（Wiese & Fuhr 2009, J. Phys. Chem. Ref. Data 38, 565）
 *   n → n′ 的「多重線」總值（假設 n 能階的各個次能階 l 依統計權重 2l+1 分布）。
 *   測試檔以精確的徑向積分獨立重算，誤差小於 0.01%。
 */
(function (root) {
  'use strict';

  // ---------------- 常數 ----------------
  const H = 6.62607015e-34;          // J·s
  const C = 299792458;               // m/s
  const E_CHARGE = 1.602176634e-19;  // C
  const HBAR = H / (2 * Math.PI);
  const ALPHA = 7.2973525693e-3;
  const A0 = 5.29177210903e-11;      // m
  const R_INF = 10973731.568160;     // m^-1
  const ME = 9.1093837015e-31;       // kg
  const ME_MP = 1 / 1836.15267343;
  const MU = ME / (1 + ME_MP);       // 約化質量
  const R_H = R_INF / (1 + ME_MP);   // m^-1
  const RY_EV = H * C * R_H / E_CHARGE;       // 13.598 eV：氫原子的游離能
  const A_H = A0 * (1 + ME_MP);               // m：基態的電子–質子距離
  const HC_EV_NM = H * C / E_CHARGE * 1e9;    // 1239.84 eV·nm
  const N_TOP = 7;                   // 畫面詳細畫出、可點選的最高能階
  const N_CAP = 60;                  // 吸收光子時考慮的最高能階（更高的能階已密到與游離無法分辨）
  const TOL_EV = 0.005;              // 吸收時光子能量與能階差的容許誤差（eV，遠大於真實譜線寬度，方便操作）

  // 可見光範圍（nm）
  const VIS_MIN = 380, VIS_MAX = 750;

  // ---------------- 能階 ----------------
  /** 第 n 能階的能量（eV）；n = Infinity 為 0 */
  function energy(n) { return n === Infinity ? 0 : -RY_EV / (n * n); }
  function energyJ(n) { return energy(n) * E_CHARGE; }
  /** 軌道半徑（m） */
  function radius(n) { return n * n * A_H; }
  /** 電子速率（m/s，相對於質子） */
  function speed(n) { return ALPHA * C / n; }
  /** 角動量（J·s）= nħ */
  function angularMomentum(n) { return MU * speed(n) * radius(n); }
  /** 繞一圈的時間（s） */
  function period(n) { return 2 * Math.PI * radius(n) / speed(n); }
  /** 物質波波長（m）= h/(μv) = 2πr/n */
  function deBroglie(n) { return H / (MU * speed(n)); }
  /** 動能、位能（eV） */
  function kinetic(n) { return 0.5 * MU * speed(n) * speed(n) / E_CHARGE; }
  function potential(n) { return 2 * energy(n); }
  /** 由第 n 能階游離所需的最小能量（eV） */
  function ionizationEnergy(n) { return -energy(n); }

  /** 整理某能階的所有物理量 */
  function level(n) {
    return {
      n: n, E: energy(n), EJ: energyJ(n), r: radius(n), v: speed(n), L: angularMomentum(n),
      T: period(n), lambdaDB: deBroglie(n), K: kinetic(n), U: potential(n)
    };
  }

  // ---------------- 光子 ----------------
  function photonFromEnergy(E) {
    return { E: E, EJ: E * E_CHARGE, f: E * E_CHARGE / H, lambda: HC_EV_NM / E };
  }
  function photonFromWavelength(lambda) { return photonFromEnergy(HC_EV_NM / lambda); }

  /** 波數 1/λ（m^-1）= R_H (1/nf² − 1/ni²)，ni > nf */
  function wavenumber(ni, nf) {
    const a = 1 / (nf * nf), b = ni === Infinity ? 0 : 1 / (ni * ni);
    return R_H * (a - b);
  }
  /** 真空波長（nm） */
  function wavelength(ni, nf) {
    const hi = Math.max(ni, nf), lo = Math.min(ni, nf);
    return 1e9 / wavenumber(hi, lo);
  }
  /** 線系極限（n_i → ∞）的真空波長（nm） */
  function seriesLimit(nf) { return nf * nf / R_H * 1e9; }

  /** 真空波長 → 標準空氣中的波長（nm）；Edlén (1966)／Morton (2000) 公式，NIST 也用它。只適用 λ ≥ 200 nm */
  function airIndex(lambdaVac) {
    const s2 = Math.pow(1000 / lambdaVac, 2); // σ²（μm^-2）
    return 1 + 8.34254e-5 + 2.406147e-2 / (130 - s2) + 1.5998e-4 / (38.9 - s2);
  }
  function airWavelength(lambdaVac) {
    if (!(lambdaVac >= 200)) return NaN; // 真空紫外線會被空氣吸收，沒有「空氣中的波長」
    return lambdaVac / airIndex(lambdaVac);
  }

  /** 波段：'UV' 紫外線、'VIS' 可見光、'IR' 紅外線 */
  function region(lambda) { return lambda < VIS_MIN ? 'UV' : lambda > VIS_MAX ? 'IR' : 'VIS'; }

  const SERIES = [
    null,
    { nf: 1, zh: '來曼系', en: 'Lyman series', sym: 'Ly' },
    { nf: 2, zh: '巴耳末系', en: 'Balmer series', sym: 'H' },
    { nf: 3, zh: '帕申系', en: 'Paschen series', sym: 'Pa' },
    { nf: 4, zh: '布拉克系', en: 'Brackett series', sym: 'Br' },
    { nf: 5, zh: '蒲芬系', en: 'Pfund series', sym: 'Pf' },
    { nf: 6, zh: '漢弗萊系', en: 'Humphreys series', sym: 'Hu' }
  ];
  const GREEK = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ'];
  function series(nf) { return SERIES[nf] || null; }
  /** 譜線名稱，例如 Hα、Lyβ、Paα；沒有慣用名稱時回傳 null */
  function lineName(ni, nf) {
    const s = SERIES[nf], k = ni - nf;
    if (!s || ni === Infinity || k < 1) return null;
    if (k <= GREEK.length) return s.sym + GREEK[k - 1];
    return nf === 2 ? 'H' + ni : null; // 巴耳末系較高的線常寫成 H8、H9…
  }

  /**
   * 兩能階之間的躍遷（ni → nf；ni > nf 為發射，ni < nf 為吸收）
   * 回傳 { ni, nf, emission, E (eV, > 0), EJ, f, lambda (nm 真空), lambdaAir, upper, lower, series, name, region }
   */
  function transition(ni, nf) {
    const upper = Math.max(ni, nf), lower = Math.min(ni, nf);
    const E = energy(upper) - energy(lower);
    const p = photonFromEnergy(E);
    const lam = wavelength(upper, lower);
    return {
      ni: ni, nf: nf, emission: ni > nf, upper: upper, lower: lower,
      E: E, EJ: p.EJ, f: p.f, lambda: lam, lambdaAir: airWavelength(lam),
      series: series(lower), name: lineName(upper, lower), region: region(lam)
    };
  }

  // ---------------- 吸收光子 ----------------
  /**
   * 能階 n 的原子遇到能量 E（eV）的光子：
   *   E ≥ 游離能 → { type: 'ionize', K: E − |E_n| }（多出的能量變成電子動能）
   *   E 與某個能階差相差不到 tol → { type: 'absorb', to: m, miss: 差值 }
   *   其他 → { type: 'pass', nearest: { to, dE } }（光子穿過，原子不變）
   * n = Infinity（已游離、只剩質子）時，光子一律穿過。
   */
  function absorb(n, E, tol) {
    tol = tol == null ? TOL_EV : tol;
    if (n === Infinity || !(n >= 1)) return { type: 'pass', nearest: null, bare: true };
    const Ei = -energy(n);
    if (E >= Ei) return { type: 'ionize', K: E - Ei };
    const ms = Math.sqrt(RY_EV / (Ei - E)); // 能階差剛好等於 E 的「連續」n
    let best = null;
    [Math.floor(ms), Math.ceil(ms), Math.floor(ms) - 1, Math.ceil(ms) + 1].forEach(function (m) {
      m = Math.min(N_CAP, Math.max(n + 1, m));
      const d = (energy(m) - energy(n)) - E;
      if (!best || Math.abs(d) < Math.abs(best.dE)) best = { to: m, dE: d };
    });
    if (best && Math.abs(best.dE) <= tol) return { type: 'absorb', to: best.to, miss: best.dE };
    if (Ei - E <= tol) return { type: 'ionize', K: 0 }; // 能量與游離能相差在容許範圍內
    return { type: 'pass', nearest: best };
  }

  /** 自由電子（動能 K）被質子捕獲到第 n 能階：放出的光子能量 = K + |E_n|（復合輻射，屬於連續光譜） */
  function recombination(K, n) { return photonFromEnergy(K - energy(n)); }

  // ---------------- 躍遷機率（NIST） ----------------
  // A[ni][nf]（s^-1），1 ≤ nf < ni ≤ 7
  const A_NIST = {
    2: { 1: 4.6986e8 },
    3: { 1: 5.5751e7, 2: 4.4101e7 },
    4: { 1: 1.2785e7, 2: 8.4193e6, 3: 8.9860e6 },
    5: { 1: 4.1250e6, 2: 2.5304e6, 3: 2.2008e6, 4: 2.6993e6 },
    6: { 1: 1.6440e6, 2: 9.7320e5, 3: 7.7829e5, 4: 7.7110e5, 5: 1.0254e6 },
    7: { 1: 7.5684e5, 2: 4.3889e5, 3: 3.3585e5, 4: 3.0415e5, 5: 3.2528e5, 6: 4.5608e5 }
  };
  function einsteinA(ni, nf) { return (A_NIST[ni] && A_NIST[ni][nf]) || 0; }
  /** 從 ni 出發的總衰變率（s^-1）與平均壽命（s） */
  function totalA(ni) {
    let s = 0;
    for (let k = 1; k < ni; k++) s += einsteinA(ni, k);
    return s;
  }
  function lifetime(ni) { const a = totalA(ni); return a > 0 ? 1 / a : Infinity; }
  /** 分支比：從 ni 往下掉到各能階的機率 { nf: p } */
  function branching(ni) {
    const out = {}, a = totalA(ni);
    for (let k = 1; k < ni; k++) out[k] = a > 0 ? einsteinA(ni, k) / a : 0;
    return out;
  }
  /** 統計權重 g_n = 2n² */
  function weight(n) { return 2 * n * n; }
  /** 吸收振子強度 f(lower → upper)，由 A 係數換算：f = (g_u/g_l)·A·ε0·me·c·λ³…（SI：f = 2πε0·me·c³/(e²ω²) · (g_u/g_l) · A） */
  function oscillatorStrength(lower, upper) {
    const t = transition(upper, lower);
    const w = 2 * Math.PI * C / (t.lambda * 1e-9);
    const EPS0 = 8.8541878128e-12;
    return 2 * Math.PI * EPS0 * ME * C * C * C / (E_CHARGE * E_CHARGE * w * w) * (weight(upper) / weight(lower)) * einsteinA(upper, lower);
  }
  /** 來曼系振子強度的精確公式 f(1 → n) = 2^8 n^5 (n−1)^(2n−4) / [3 (n+1)^(2n+4)] */
  function lymanF(n) {
    return Math.pow(2, 8) * Math.pow(n, 5) * Math.pow(n - 1, 2 * n - 4) / (3 * Math.pow(n + 1, 2 * n + 4));
  }

  // ---------------- 放電管：電子撞擊激發＋自發輻射串級 ----------------
  /** 動能 K（eV）的電子能把基態原子激發到哪些能階（≤ N_TOP） */
  function reachable(K) {
    const out = [];
    for (let n = 2; n <= N_TOP; n++) if (energy(n) - energy(1) <= K + 1e-12) out.push(n);
    return out;
  }
  /**
   * 激發機率：簡化模型，激發到 n 的機率正比於來曼系振子強度 f(1→n)
   * （高能電子撞擊的玻恩近似；n ≥ 8 的振子強度合計不到 3%，省略）。回傳 { n: p }，總和為 1；激發不了時回傳 {}
   */
  function excitationProbs(K) {
    const ns = reachable(K), out = {};
    let s = 0;
    ns.forEach(function (n) { s += lymanF(n); });
    ns.forEach(function (n) { out[n] = lymanF(n) / s; });
    return out;
  }
  /**
   * 每激發一個原子，平均放出各條譜線的光子數（精確計算串級）
   * 回傳 { 'ni-nf': 平均光子數 }
   */
  function expectedPhotons(probs) {
    const pop = {}, out = {};
    for (let n = 1; n <= N_TOP; n++) pop[n] = probs[n] || 0;
    for (let n = N_TOP; n >= 2; n--) {
      if (!pop[n]) continue;
      const b = branching(n);
      for (let k = 1; k < n; k++) {
        const x = pop[n] * b[k];
        if (x > 0) { out[n + '-' + k] = (out[n + '-' + k] || 0) + x; pop[k] += x; }
      }
    }
    return out;
  }
  /** 依分支比隨機決定一次串級：從 n 掉回基態，回傳躍遷列表 [[ni, nf], …]；rand() 回傳 [0, 1) */
  function cascade(n, rand) {
    const path = [];
    while (n > 1) {
      const b = branching(n);
      let u = rand(), k = 1;
      for (; k < n - 1; k++) { u -= b[k]; if (u < 0) break; }
      path.push([n, k]);
      n = k;
    }
    return path;
  }
  /** 依機率表抽一個能階 */
  function pick(probs, rand) {
    const keys = Object.keys(probs).map(Number).sort(function (a, b) { return a - b; });
    let u = rand();
    for (let i = 0; i < keys.length; i++) { u -= probs[keys[i]]; if (u < 0) return keys[i]; }
    return keys.length ? keys[keys.length - 1] : null;
  }
  /** 可重現的亂數（mulberry32） */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------- 顏色 ----------------
  function g2(x, mu, s1, s2) { const t = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * t * t); }
  /** CIE 1931 2° 配色函數的解析近似（Wyman, Sloan & Shirley 2013），nm → [xbar, ybar, zbar] */
  function cieXYZ(nm) {
    return [
      1.056 * g2(nm, 599.8, 37.9, 31.0) + 0.362 * g2(nm, 442.0, 16.0, 26.7) - 0.065 * g2(nm, 501.1, 20.4, 26.2),
      0.821 * g2(nm, 568.8, 46.9, 40.5) + 0.286 * g2(nm, 530.9, 16.3, 31.1),
      1.217 * g2(nm, 437.0, 11.8, 36.0) + 0.681 * g2(nm, 459.0, 26.0, 13.8)
    ];
  }
  function xyzToLinear(c) {
    return [
      3.2406 * c[0] - 1.5372 * c[1] - 0.4986 * c[2],
      -0.9689 * c[0] + 1.8758 * c[1] + 0.0415 * c[2],
      0.0557 * c[0] - 0.2040 * c[1] + 1.0570 * c[2]
    ];
  }
  function encode(v) {
    v = Math.max(0, Math.min(1, v));
    return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  }
  /**
   * 單一波長的顯示顏色（sRGB 0–255）：CIE 配色函數 → 線性 sRGB，超出色域的負值取 0，
   * 最亮的通道調到 1（光譜色都畫成最飽和的亮度），兩端 380–420 nm、680–750 nm 依人眼敏感度漸暗。
   * 光譜兩端的色度幾乎不變（CIE 色度圖上 410 nm 以下、690 nm 以上幾乎是同一點），
   * 解析近似在兩端誤差較大，所以兩端的色相分別取 410 nm、690 nm 的值。
   * 不可見光（< 380 或 > 750 nm）回傳 null，由畫面以標明的「假色」表示。
   */
  function wavelengthToRGB(nm) {
    if (!(nm >= VIS_MIN && nm <= VIS_MAX)) return null;
    const lin = xyzToLinear(cieXYZ(Math.min(690, Math.max(410, nm)))).map(function (v) { return Math.max(0, v); });
    const m = Math.max(lin[0], lin[1], lin[2]) || 1;
    const edge = nm < 420 ? 0.35 + 0.65 * (nm - VIS_MIN) / 40 : nm > 680 ? 0.35 + 0.65 * (VIS_MAX - nm) / 70 : 1;
    return lin.map(function (v) { return encode(v / m * edge); });
  }
  /**
   * 幾條譜線混合後人眼看到的顏色：各線的功率 × 配色函數相加 → 色度 → sRGB（最亮通道 = 1）。
   * lines = [{ lambda (nm), power }]；沒有可見光時回傳 null。另回傳亮度 Y（相對值）。
   */
  function mixColor(lines) {
    let X = 0, Y = 0, Z = 0;
    lines.forEach(function (l) {
      if (!(l.lambda >= VIS_MIN && l.lambda <= VIS_MAX) || !(l.power > 0)) return;
      const c = cieXYZ(l.lambda);
      X += l.power * c[0]; Y += l.power * c[1]; Z += l.power * c[2];
    });
    if (!(Y > 0)) return null;
    const lin = xyzToLinear([X, Y, Z]).map(function (v) { return Math.max(0, v); });
    const m = Math.max(lin[0], lin[1], lin[2]) || 1;
    return { rgb: lin.map(function (v) { return encode(v / m); }), Y: Y };
  }

  const api = {
    H: H, C: C, E_CHARGE: E_CHARGE, HBAR: HBAR, ALPHA: ALPHA, A0: A0, R_INF: R_INF, ME: ME, ME_MP: ME_MP, MU: MU,
    R_H: R_H, RY_EV: RY_EV, A_H: A_H, HC_EV_NM: HC_EV_NM, N_TOP: N_TOP, N_CAP: N_CAP, TOL_EV: TOL_EV,
    VIS_MIN: VIS_MIN, VIS_MAX: VIS_MAX, A_NIST: A_NIST,
    energy: energy, energyJ: energyJ, radius: radius, speed: speed, angularMomentum: angularMomentum,
    period: period, deBroglie: deBroglie, kinetic: kinetic, potential: potential, ionizationEnergy: ionizationEnergy,
    level: level,
    photonFromEnergy: photonFromEnergy, photonFromWavelength: photonFromWavelength,
    wavenumber: wavenumber, wavelength: wavelength, seriesLimit: seriesLimit,
    airIndex: airIndex, airWavelength: airWavelength, region: region,
    series: series, lineName: lineName, transition: transition,
    absorb: absorb, recombination: recombination,
    einsteinA: einsteinA, totalA: totalA, lifetime: lifetime, branching: branching, weight: weight,
    oscillatorStrength: oscillatorStrength, lymanF: lymanF,
    reachable: reachable, excitationProbs: excitationProbs, expectedPhotons: expectedPhotons,
    cascade: cascade, pick: pick, rng: rng,
    cieXYZ: cieXYZ, wavelengthToRGB: wavelengthToRGB, mixColor: mixColor
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HydrogenCore = api;
})(typeof window !== 'undefined' ? window : this);
