/*
 * seafloor-spreading-core.js — 「海底擴張與磁條帶」的物理核心（UMD；瀏覽器是 window.SeafloorCore，Node 可 require）
 *
 * 1. 地磁極性年表：GTS2012（Hilgen, Lourens & Van Dam 2012，ATNTS2012）0–8.108 Ma 的正向期（單位 Ma）。
 * 2. 海底深度與熱流：GDH1（Stein & Stein 1992）d = 2600 + 365 √t（m，t ≤ 20 Ma 適用），q = 510 / √t（mW/m²）。
 * 3. 磁異常：海洋地殼第 2A 層（玄武岩，厚 0.5 km）的磁化強度 M = ±M0（正向／反向），假設在磁極（或已經「化極」，
 *    磁化與觀測的分量都是垂直的）。二維薄層從 x = a 到 b、頂部在感測器下方 d1、底部 d2 的垂直磁場（精確解）：
 *        Bz(x) = (μ0 M / 2π) [F(b − x) − F(a − x)]，F(s) = atan(s / d1) − atan(s / d2)
 *    （由 ∫ (d² − s²)/(d² + s²)² ds = s/(d² + s²) 再對深度積分得到。無限大的均勻板外面沒有磁場，所以磁異常只來自磁化改變的地方。）
 *    海床越老越深，所以磁性層的頂面是斜的。垂直磁化時等效磁荷只在上、下表面，每單位「水平」長度的磁荷是 ±M（和斜率無關），
 *    頂面在一段內是直線 d(x′) = dA + k(x′ − a) 時：∫ d/((x′ − x)² + d²) dx′ = Im[ln(z_b/z_a)/(1 − ik)]，z = (x′ − x) − i d，
 *    整理成實數：(Q + kP)/(1 + k²)，P = ln|z_b/z_a|，Q = arg z_b − arg z_a（精確解，k = 0 時就是上面的 atan 公式）。
 *    地殼依 √年齡 等距切段（每段深度差約 18 m）再加上每次磁極反轉，頂面連續、沒有台階。
 * 4. 擴張：左右的半擴張速率 uL、uR（cm/yr）；1 cm/yr = 10 km/Ma。時間 τ（Ma 前）時，離中洋脊 x 的地殼年齡 = |x| / u，
 *    形成於 τ + 年齡 Ma 前，帶著那時的磁極性；形成時間早於 8.108 Ma 的地殼不在年表內（磁化設為 0，畫面上是灰色）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SeafloorCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** GTS2012 正向期 [開始, 結束]（Ma），之間為反向期 */
  const NORMAL = [
    [0, 0.781],          // C1n 布容（Brunhes）正向期
    [0.988, 1.072],      // C1r.1n 加拉米佑（Jaramillo）
    [1.173, 1.185],      // C1r.2r.1n 卡布山（Cobb Mountain）
    [1.778, 1.945],      // C2n 奧杜威（Olduvai）
    [2.128, 2.148],      // C2r.1n 留尼旺（Réunion）
    [2.581, 3.032],      // C2An.1n 高斯（Gauss）正向期
    [3.116, 3.207],      // C2An.2n
    [3.330, 3.596],      // C2An.3n
    [4.187, 4.300],      // C3n.1n 柯奇提（Cochiti）
    [4.493, 4.631],      // C3n.2n 努尼瓦克（Nunivak）
    [4.799, 4.896],      // C3n.3n 西杜夫亞（Sidufjall）
    [4.997, 5.235],      // C3n.4n 特維拉（Thvera）
    [6.033, 6.252],      // C3An.1n
    [6.436, 6.733],      // C3An.2n
    [7.140, 7.212],      // C3Bn
    [7.251, 7.285],      // C3Br.1n
    [7.454, 7.489],      // C3Br.2n
    [7.528, 7.642],      // C4n.1n
    [7.695, 8.108]       // C4n.2n
  ];
  const T_MAX = 8.108;
  /** 有名字的期／亞期（畫圖標籤、任務用） */
  const NAMED = [
    { key: 'brunhes', zh: '布容正向期', en: 'Brunhes normal', a: 0, b: 0.781, n: 1 },
    { key: 'matuyama', zh: '松山反向期', en: 'Matuyama reversed', a: 0.781, b: 2.581, n: -1 },
    { key: 'jaramillo', zh: '加拉米佑', en: 'Jaramillo', a: 0.988, b: 1.072, n: 1 },
    { key: 'olduvai', zh: '奧杜威', en: 'Olduvai', a: 1.778, b: 1.945, n: 1 },
    { key: 'gauss', zh: '高斯正向期', en: 'Gauss normal', a: 2.581, b: 3.596, n: 1 },
    { key: 'gilbert', zh: '吉爾伯特反向期', en: 'Gilbert reversed', a: 3.596, b: 6.033, n: -1 }
  ];
  const MU0_2PI = 2e-7;          // μ0 / 2π（T·m/A）
  const LAYER = 0.5;             // 磁性層厚度（km）
  const M0 = 10;                 // 年輕玄武岩的磁化強度（A/m）
  const KM_PER_MA = 10;          // 1 cm/yr = 10 km/Ma

  /** 年齡 t（Ma）的磁極性：+1 正向、−1 反向；超出年表傳回 0 */
  function polarity(t) {
    if (!(t >= 0) || t > T_MAX) return 0;
    for (let i = 0; i < NORMAL.length; i++) {
      if (t < NORMAL[i][0]) return -1;
      if (t <= NORMAL[i][1]) return 1;
    }
    return -1;
  }
  /** 0 到 T 之間所有磁極反轉的時間（升冪） */
  function reversals(T) {
    const out = [];
    NORMAL.forEach(function (p) { if (p[0] > 0 && p[0] < T) out.push(p[0]); if (p[1] < T) out.push(p[1]); });
    return out.filter(function (t) { return t > 0 && t < T; }).sort(function (a, b) { return a - b; });
  }
  /** 海底深度（m，GDH1） */
  function depth(t) { return 2600 + 365 * Math.sqrt(Math.max(0, t)); }
  /** 熱流（mW/m²，GDH1；t → 0 時發散，畫面上限制在 t ≥ 0.05 Ma） */
  function heatFlow(t) { return 510 / Math.sqrt(Math.max(t, 1e-6)); }
  /** 由深度反推年齡（Ma） */
  function ageFromDepth(d) { const s = (d - 2600) / 365; return s > 0 ? s * s : 0; }

  /** 參數 P = { uL, uR（cm/yr）, tau（Ma 前）, zs（感測器在海面下多深，km）, M0（A/m，預設 10） } */
  function rateAt(P, x) { return (x < 0 ? P.uL : P.uR) * KM_PER_MA; }
  /** 位置 x（km，右為正）的地殼：{ age（Ma，相對於 τ 那時）, born（形成於幾 Ma 前）, pol, inRecord } */
  function crustAt(P, x) {
    const u = rateAt(P, x), age = Math.abs(x) / u, born = (P.tau || 0) + age;
    return { age: age, born: born, pol: polarity(born), inRecord: born <= T_MAX };
  }
  /** 把一側（s = +1 右、−1 左）的地殼切成段：[{ a, b（km，a < b）, m（A/m）, dA、dB（a、b 兩端磁性層頂部在感測器下方幾 km） }] */
  function elements(P, s, xmax) {
    const u = (s > 0 ? P.uR : P.uL) * KM_PER_MA, tau = P.tau || 0, Mm = P.M0 != null ? P.M0 : M0, zs = P.zs || 0;
    const ageMax = Math.min(xmax / u, T_MAX - tau);
    if (!(ageMax > 0)) return [];
    // 段的邊界（以「相對年齡」計）：每次反轉，以及 √年齡 每 0.05 一段
    const cuts = [0];
    reversals(T_MAX).forEach(function (t) { const a = t - tau; if (a > 0 && a < ageMax) cuts.push(a); });
    for (let q = 0.05; q * q < ageMax; q += 0.05) cuts.push(q * q);
    cuts.push(ageMax);
    cuts.sort(function (p, q) { return p - q; });
    const out = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const a0 = cuts[i], a1 = cuts[i + 1];
      if (a1 - a0 < 1e-9) continue;
      const mid = (a0 + a1) / 2, pol = polarity(tau + mid);
      const t0 = depth(a0) / 1000 - zs, t1 = depth(a1) / 1000 - zs;
      const x0 = a0 * u, x1 = a1 * u;
      out.push({ a: s > 0 ? x0 : -x1, b: s > 0 ? x1 : -x0, dA: s > 0 ? t0 : t1, dB: s > 0 ? t1 : t0, m: pol * Mm, age0: a0, age1: a1, pol: pol });
    }
    return out;
  }
  function F(s, d1, d2) { return Math.atan(s / d1) - Math.atan(s / d2); }
  /** ∫_a^b d(x′)/((x′ − x)² + d(x′)²) dx′，d 從 dA 線性變到 dB（精確解） */
  function G(x, a, b, dA, dB) {
    const k = (dB - dA) / (b - a), sa = a - x, sb = b - x;
    const P = 0.5 * Math.log((sb * sb + dB * dB) / (sa * sa + dA * dA));
    const Q = Math.atan2(dA, sa) - Math.atan2(dB, sb);
    return (Q + k * P) / (1 + k * k);
  }
  /** 在 xs（km）各點的磁異常（nT）；同時傳回所用的地殼分段 */
  function profile(P, xs, xmax) {
    const els = elements(P, -1, xmax).concat(elements(P, 1, xmax));
    const out = new Float64Array(xs.length);
    for (let j = 0; j < xs.length; j++) {
      const x = xs[j];
      let s = 0;
      for (let i = 0; i < els.length; i++) {
        const e = els[i];
        if (e.m === 0) continue;
        s += e.m * (G(x, e.a, e.b, e.dA, e.dB) - G(x, e.a, e.b, e.dA + LAYER, e.dB + LAYER));
      }
      out[j] = MU0_2PI * s * 1e9;
    }
    return { B: out, els: els };
  }
  /** 一塊單獨磁化的長方體（a..b、頂 d1、底 d2）在 x 的垂直磁場（nT），給測試用 */
  function blockField(m, a, b, d1, d2, x) { return MU0_2PI * m * (F(b - x, d1, d2) - F(a - x, d1, d2)) * 1e9; }
  /** 數「峰」：凸出 ≥ prom（nT）的局部極大值個數（只看 x0 ≤ x ≤ x1） */
  function peaks(xs, B, prom, x0, x1) {
    let n = 0;
    for (let i = 1; i < xs.length - 1; i++) {
      if (xs[i] < x0 || xs[i] > x1) continue;
      if (!(B[i] >= B[i - 1] && B[i] > B[i + 1])) continue;
      let l = B[i], r = B[i];
      for (let k = i - 1; k >= 0; k--) { if (B[k] > B[i]) break; l = Math.min(l, B[k]); }
      for (let k = i + 1; k < xs.length; k++) { if (B[k] > B[i]) break; r = Math.min(r, B[k]); }
      if (B[i] - Math.max(l, r) >= prom) n++;
    }
    return n;
  }
  /** 某個有名字的期在一側的位置（km，正值）：[開始, 結束]，以現在（τ = 0）計 */
  function namedAt(P, key, s) {
    const N = NAMED.find(function (q) { return q.key === key; });
    const u = (s > 0 ? P.uR : P.uL) * KM_PER_MA, tau = P.tau || 0;
    return [Math.max(0, N.a - tau) * u, Math.max(0, N.b - tau) * u];
  }

  /** 一段正向亞期 [a, b]（Ma）在右側（s = 1）或左側（s = −1）的磁異常裡「看得出一個獨立的峰」嗎？
   *  和畫面解析度無關：在亞期附近固定每 0.02 km（最多 1200 點）取樣，峰值要落在亞期 ±(0.3 × 寬 + 0.5 km) 內、凸出 ≥ prom（nT）。 */
  function resolved(P, a, b, prom, s) {
    s = s || 1;
    const u = (s > 0 ? P.uR : P.uL) * KM_PER_MA, tau = P.tau || 0, t0 = Math.max(0, a - tau), t1 = Math.max(0, b - tau);
    if (!(t1 > t0)) return false;
    const x0 = t0 * u, x1 = t1 * u, w = x1 - x0, pad = 0.3 * w + 0.5, lo = Math.max(0, x0 - pad - 8), hi = x1 + pad + 8;
    if (b > T_MAX) return false;
    const n = Math.min(1200, Math.ceil((hi - lo) / 0.02)), xs = [];
    for (let i = 0; i <= n; i++) xs.push(s * (lo + (hi - lo) * i / n));
    if (s < 0) xs.reverse();
    const B = profile(P, xs, T_MAX * u + 1).B;
    return s > 0 ? peaks(xs, B, prom, x0 - pad, x1 + pad) > 0 : peaks(xs, B, prom, -x1 - pad, -x0 + pad) > 0;
  }

  return {
    resolved: resolved,
    NORMAL: NORMAL, NAMED: NAMED, T_MAX: T_MAX, MU0_2PI: MU0_2PI, LAYER: LAYER, M0: M0, KM_PER_MA: KM_PER_MA,
    polarity: polarity, reversals: reversals, depth: depth, heatFlow: heatFlow, ageFromDepth: ageFromDepth,
    crustAt: crustAt, elements: elements, profile: profile, blockField: blockField, peaks: peaks, namedAt: namedAt, F: F, G: G
  };
});
