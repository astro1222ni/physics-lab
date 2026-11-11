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
    linearToSrgb: linearToSrgb
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SlitCore = api;
})(this);
