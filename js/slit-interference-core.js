/*
 * slit-interference-core.js — 狹縫干涉與繞射的物理核心（與畫面無關，可單獨測試）
 *
 * 單位約定（全部用 SI）：
 *   波長 lambda、縫寬 a、縫距 d、屏幕距離 L、屏幕上位置 y ....... m
 *   N ........ 狹縫數（1 = 單狹縫，2 = 雙狹縫，3 以上 = 多狹縫光柵）
 *   強度 ..... 以中央 (θ = 0) 的強度 I0 為 1 的相對值 I/I0
 *
 * 模型：夫朗和斐（遠場）繞射，N 條寬度 a、間距 d 的相同狹縫，平面波垂直入射：
 *   I(θ)/I0 = [sin β / β]² · [sin(Nα) / (N sin α)]²
 *   β = π a sinθ / λ，α = π d sinθ / λ
 *   N = 2 時第二個因子化簡為 cos² α。
 * 屏幕上的位置 y 換成角度時使用精確關係 sinθ = y / √(y² + L²)，不用小角度近似。
 * 白光：各波長光強加權相加（不同波長不同調），見 whiteSpectrum、whiteAt。
 */
(function (root) {
  'use strict';

  /** 屏幕上 y 處對應的 sinθ（精確，非小角度近似） */
  function sinTheta(y, L) {
    return y / Math.sqrt(y * y + L * L);
  }

  /** 角度 sinθ 在屏幕上的位置 y = L tanθ（|sinθ| < 1） */
  function yFromSin(s, L) {
    return L * s / Math.sqrt(1 - s * s);
  }

  /** 單狹縫繞射因子 [sin β / β]²，β = π a sinθ / λ */
  function singleSlitFactor(s, a, lambda) {
    const beta = Math.PI * a * s / lambda;
    if (Math.abs(beta) < 1e-8) return 1;
    const r = Math.sin(beta) / beta;
    return r * r;
  }

  /**
   * N 狹縫干涉因子 [sin(Nα) / (N sin α)]²，α = π d sinθ / λ。
   * 先把 α 平移到 [−π/2, π/2]：平移 kπ 時分子、分母只差正負號，平方後不變，
   * 這樣在主極大（α = mπ）附近也不會出現 0/0。
   */
  function multiSlitFactor(s, d, lambda, N) {
    if (N <= 1) return 1;
    let alpha = Math.PI * d * s / lambda;
    alpha -= Math.PI * Math.round(alpha / Math.PI);
    if (N === 2) { const c = Math.cos(alpha); return c * c; }
    const den = N * Math.sin(alpha);
    if (Math.abs(den) < 1e-12) return 1;
    const r = Math.sin(N * alpha) / den;
    return Math.min(1, r * r);
  }

  /** 以 sinθ 計算 I/I0。p = { N, a, d, lambda } */
  function intensitySin(p, s) {
    return singleSlitFactor(s, p.a, p.lambda) * multiSlitFactor(s, p.d, p.lambda, p.N || 1);
  }

  /** 屏幕上 y 處的 I/I0。p = { N, a, d, lambda, L } */
  function intensity(p, y) {
    return intensitySin(p, sinTheta(y, p.L));
  }

  /** 單狹縫包絡線（N 狹縫圖形的上限） */
  function envelope(p, y) {
    return singleSlitFactor(sinTheta(y, p.L), p.a, p.lambda);
  }

  /** 小角度近似：相鄰亮紋間距 Δy ≈ λL/d */
  function fringeSpacing(p) { return p.lambda * p.L / p.d; }

  /** 小角度近似：中央亮帶寬度 ≈ 2λL/a */
  function centralWidth(p) { return 2 * p.lambda * p.L / p.a; }

  /** 精確值：中央亮帶寬度 = 2 L tanθ1，其中 a sinθ1 = λ；a ≤ λ 時沒有暗紋，回傳 Infinity */
  function centralWidthExact(p) {
    const s = p.lambda / p.a;
    return s >= 1 ? Infinity : 2 * yFromSin(s, p.L);
  }

  /**
   * 缺級：若 d/a = k 為整數，第 ±k、±2k、… 級亮紋恰好落在單狹縫的暗紋上而消失。
   * 回傳 k；d/a 不是整數則回傳 0。
   */
  function missingOrderStep(d, a) {
    const r = d / a;
    const k = Math.round(r);
    return k >= 1 && Math.abs(r - k) < 1e-9 * Math.max(1, r) ? k : 0;
  }

  /**
   * 所有可能出現的亮紋級數（主極大）：d sinθ = mλ，|sinθ| < 1。
   * 回傳 [{ m, sin, y, I, missing }]，依 m 由小到大。
   */
  function brightOrders(p) {
    const mMax = Math.ceil(p.d / p.lambda) - 1; // |m|λ/d < 1
    const k = missingOrderStep(p.d, p.a);
    const out = [];
    for (let m = -mMax; m <= mMax; m++) {
      const s = m * p.lambda / p.d;
      out.push({
        m: m,
        sin: s,
        y: yFromSin(s, p.L),
        I: m === 0 ? 1 : intensitySin(p, s),
        missing: k > 0 && m !== 0 && m % k === 0
      });
    }
    return out;
  }

  /** 單狹縫暗紋：a sinθ = mλ（m ≠ 0），回傳 [{ m, sin, y }] */
  function singleSlitDarks(p) {
    const mMax = Math.ceil(p.a / p.lambda) - 1;
    const out = [];
    for (let m = -mMax; m <= mMax; m++) {
      if (m === 0) continue;
      const s = m * p.lambda / p.a;
      out.push({ m: m, sin: s, y: yFromSin(s, p.L) });
    }
    return out;
  }

  /**
   * 中央亮帶（單狹縫第一暗紋之間）內的亮紋數：滿足 |m| λ/d < min(λ/a, 1) 的整數 m 個數。
   * d/a = k 為整數時為 2k − 1（第 ±k 級剛好缺級）；不是整數時為 2⌊d/a⌋ + 1。
   */
  function fringesInCentral(p) {
    const r = Math.min(p.d / p.a, p.d / p.lambda);
    const k = missingOrderStep(p.d, p.a);
    if (k && p.a > p.lambda) return 2 * k - 1;
    return 2 * Math.ceil(r - 1e-12) - 1;
  }

  /**
   * 波長 → sRGB 近似（Dan Bruton 的分段線性演算法，邊緣 380–420 nm 與 700–780 nm 逐漸變暗，
   * γ = 0.8）。回傳 [r, g, b]，每個 0–255；可見光範圍外回傳黑色。
   */
  function wavelengthToRGB(nm) {
    let r = 0, g = 0, b = 0;
    if (nm >= 380 && nm < 440) { r = -(nm - 440) / 60; b = 1; }
    else if (nm >= 440 && nm < 490) { g = (nm - 440) / 50; b = 1; }
    else if (nm >= 490 && nm < 510) { g = 1; b = -(nm - 510) / 20; }
    else if (nm >= 510 && nm < 580) { r = (nm - 510) / 70; g = 1; }
    else if (nm >= 580 && nm < 645) { r = 1; g = -(nm - 645) / 65; }
    else if (nm >= 645 && nm <= 780) { r = 1; }
    let f = 0;
    if (nm >= 380 && nm < 420) f = 0.3 + 0.7 * (nm - 380) / 40;
    else if (nm >= 420 && nm <= 700) f = 1;
    else if (nm > 700 && nm <= 780) f = 0.3 + 0.7 * (780 - nm) / 80;
    const ch = function (c) { return c > 0 ? Math.round(255 * Math.pow(c * f, 0.8)) : 0; };
    return [ch(r), ch(g), ch(b)];
  }

  /** 波長對應的色光名稱（粗略分界） */
  function colorName(nm) {
    if (nm < 450) return '紫光';
    if (nm < 485) return '藍光';
    if (nm < 500) return '青光';
    if (nm < 565) return '綠光';
    if (nm < 590) return '黃光';
    if (nm < 625) return '橙光';
    return '紅光';
  }

  /** sRGB 0–255 ↔ 線性亮度 0–1（用來讓屏幕亮度正比於 I） */
  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function linearToSrgb(v) {
    v = Math.max(0, Math.min(1, v));
    return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  }

  // ====================================================================
  // 白光：可見光各波長彼此不同調，屏幕上的光強直接相加
  //   I_白(y) = Σ w(λ) I_λ(y)，Σ w = 1，所以中央 I_白(0) = 1
  //   顏色 = Σ w(λ) I_λ(y) rgb(λ)（線性 RGB），rgb(λ) 經白平衡使 Σ w rgb = (1, 1, 1)
  // ====================================================================

  /** 非對稱高斯（CIE 配色函數解析近似用） */
  function g2(x, mu, s1, s2) {
    const t = (x - mu) / (x < mu ? s1 : s2);
    return Math.exp(-0.5 * t * t);
  }
  /** CIE 1931 2° 配色函數的解析近似（Wyman, Sloan & Shirley 2013），nm → [x_bar, y_bar, z_bar] */
  function cieXYZ(nm) {
    return [
      1.056 * g2(nm, 599.8, 37.9, 31.0) + 0.362 * g2(nm, 442.0, 16.0, 26.7) - 0.065 * g2(nm, 501.1, 20.4, 26.2),
      0.821 * g2(nm, 568.8, 46.9, 40.5) + 0.286 * g2(nm, 530.9, 16.3, 31.1),
      1.217 * g2(nm, 437.0, 11.8, 36.0) + 0.681 * g2(nm, 459.0, 26.0, 13.8)
    ];
  }
  /** XYZ → 線性 sRGB（D65） */
  function xyzToLinearRGB(c) {
    return [
      3.2406 * c[0] - 1.5372 * c[1] - 0.4986 * c[2],
      -0.9689 * c[0] + 1.8758 * c[1] + 0.0415 * c[2],
      0.0557 * c[0] - 0.2040 * c[1] + 1.0570 * c[2]
    ];
  }
  /** 黑體輻射的相對光譜（普朗克定律），nm、K → 相對值 */
  function planck(nm, T) {
    const l = nm * 1e-9;
    return 1 / (Math.pow(l, 5) * (Math.exp(1.4387769e-2 / (l * T)) - 1));
  }

  /**
   * 白光光譜取樣：n 個波長，在波數 1/λ 上均勻分布於 [lo, hi] nm 之間（λ 由小到大）。
   * 波數等間隔時 β、α 隨取樣點成等差數列，whiteAtSin 可用三角函數遞推，不必每個波長都算 sin。
   * 權重 w ∝ S(λ)·λ^2（S 為 T K 黑體光譜，預設 6500 K，近似日光；λ^2 為 dλ = λ^2 d(1/λ) 的換算），Σ w = 1。
   * 每個波長的顏色 r, g, b 為線性 sRGB（負值，即超出色域的部分，取 0），
   * 再逐通道乘上白平衡係數，使 Σ w·rgb = (1, 1, 1)，也就是中央亮紋為白色。
   * 回傳 { n, nm, lambda, w, r, g, b, k0, dk }（lambda 單位 m；第 i 個波數 1/λ = k0 + i·dk，單位 1/m）。
   */
  function whiteSpectrum(n, lo, hi, T) {
    n = n || 75; lo = lo || 380; hi = hi || 750; T = T || 6500;
    const out = { n: n, nm: new Float64Array(n), lambda: new Float64Array(n), w: new Float64Array(n),
      r: new Float64Array(n), g: new Float64Array(n), b: new Float64Array(n),
      k0: 1e9 / lo, dk: n === 1 ? 0 : (1e9 / hi - 1e9 / lo) / (n - 1) };
    if (n === 1) out.k0 = 2e9 / (lo + hi);
    let sw = 0;
    const sum = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const lam = 1 / (out.k0 + i * out.dk);
      const nm = lam * 1e9;
      out.nm[i] = nm;
      out.lambda[i] = lam;
      out.w[i] = planck(nm, T) * nm * nm;
      sw += out.w[i];
      const c = xyzToLinearRGB(cieXYZ(nm));
      out.r[i] = Math.max(0, c[0]); out.g[i] = Math.max(0, c[1]); out.b[i] = Math.max(0, c[2]);
    }
    for (let i = 0; i < n; i++) {
      out.w[i] /= sw;
      sum[0] += out.w[i] * out.r[i]; sum[1] += out.w[i] * out.g[i]; sum[2] += out.w[i] * out.b[i];
    }
    for (let i = 0; i < n; i++) { out.r[i] /= sum[0]; out.g[i] /= sum[1]; out.b[i] /= sum[2]; }
    return out;
  }
  let defaultSpectrum = null;
  function spectrumOrDefault(spec) { return spec || defaultSpectrum || (defaultSpectrum = whiteSpectrum()); }

  /**
   * 白光在 sinθ = s 方向的總光強與顏色（p 的 lambda 不使用）。
   * 寫入 out = [I, R, G, B]：I = Σ w I_λ（0–1），R/G/B 為線性 RGB（中央為 1，其他處 0–1）。
   */
  function whiteAtSin(p, s, spec, out) {
    spec = spectrumOrDefault(spec);
    out = out || [0, 0, 0, 0];
    const N = p.N || 1, n = spec.n;
    // β_i = π a s k_i、α_i = π d s k_i，k_i = k0 + i·dk：用旋轉遞推 sin、cos（誤差約 1e−14）
    const b0 = Math.PI * p.a * s * spec.k0, db = Math.PI * p.a * s * spec.dk;
    const a0 = Math.PI * p.d * s * spec.k0, da = Math.PI * p.d * s * spec.dk;
    let beta = b0, sb = Math.sin(b0), cb = Math.cos(b0);
    let sa = Math.sin(a0), ca = Math.cos(a0), sn = Math.sin(N * a0), cn = Math.cos(N * a0);
    const sdb = Math.sin(db), cdb = Math.cos(db), sda = Math.sin(da), cda = Math.cos(da);
    const sdn = Math.sin(N * da), cdn = Math.cos(N * da);
    let I = 0, R = 0, G = 0, B = 0, t;
    for (let i = 0; i < n; i++) {
      let f1;
      if (Math.abs(beta) < 1e-8) f1 = 1;
      else { t = sb / beta; f1 = t * t; }
      let f2;
      if (N <= 1) f2 = 1;
      else if (N === 2) f2 = ca * ca;
      else if (Math.abs(sa) < 1e-6) f2 = multiSlitFactor(s, p.d, spec.lambda[i], N); // 主極大附近改用精確算法
      else { t = sn / (N * sa); f2 = Math.min(1, t * t); }
      const v = spec.w[i] * f1 * f2;
      I += v; R += v * spec.r[i]; G += v * spec.g[i]; B += v * spec.b[i];
      t = sb * cdb + cb * sdb; cb = cb * cdb - sb * sdb; sb = t; beta += db;
      t = sa * cda + ca * sda; ca = ca * cda - sa * sda; sa = t;
      t = sn * cdn + cn * sdn; cn = cn * cdn - sn * sdn; sn = t;
    }
    out[0] = Math.min(1, I); out[1] = Math.min(1, R); out[2] = Math.min(1, G); out[3] = Math.min(1, B);
    return out;
  }
  /** 屏幕上 y 處的白光總光強與顏色，見 whiteAtSin */
  function whiteAt(p, y, spec, out) {
    return whiteAtSin(p, sinTheta(y, p.L), spec, out);
  }
  /** 白光的總光強 I/I0（中央為 1） */
  function whiteIntensity(p, y, spec) {
    return whiteAt(p, y, spec)[0];
  }
  /** 白光的單狹縫包絡線 Σ w [sin β / β]² */
  function whiteEnvelope(p, y, spec) {
    spec = spectrumOrDefault(spec);
    const s = sinTheta(y, p.L);
    let I = 0;
    for (let i = 0; i < spec.n; i++) I += spec.w[i] * singleSlitFactor(s, p.a, spec.lambda[i]);
    return I;
  }

  const api = {
    sinTheta: sinTheta,
    yFromSin: yFromSin,
    singleSlitFactor: singleSlitFactor,
    multiSlitFactor: multiSlitFactor,
    intensitySin: intensitySin,
    intensity: intensity,
    envelope: envelope,
    fringeSpacing: fringeSpacing,
    centralWidth: centralWidth,
    centralWidthExact: centralWidthExact,
    missingOrderStep: missingOrderStep,
    brightOrders: brightOrders,
    singleSlitDarks: singleSlitDarks,
    fringesInCentral: fringesInCentral,
    wavelengthToRGB: wavelengthToRGB,
    colorName: colorName,
    srgbToLinear: srgbToLinear,
    linearToSrgb: linearToSrgb,
    cieXYZ: cieXYZ,
    whiteSpectrum: whiteSpectrum,
    whiteAtSin: whiteAtSin,
    whiteAt: whiteAt,
    whiteIntensity: whiteIntensity,
    whiteEnvelope: whiteEnvelope
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SlitCore = api;
})(this);
