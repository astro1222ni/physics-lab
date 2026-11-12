/* galton-board-core.js — 高爾頓板與二項分布的數學核心（與畫面分離，Node 單元測試：tests/galton-board-core.test.js）
 *
 * 模型：n 層釘子，球每碰到一根釘子，以機率 p 往右、1 − p 往左，各層互相獨立。
 *   落到第 k 格（從左數 0 到 n）＝ n 次裡往右 k 次，所以 X ~ B(n, p)：
 *     P(X = k) = C(n, k) p^k (1 − p)^(n − k)，E(X) = np，Var(X) = np(1 − p)。
 *   第 r 層（0 起算）第 j 根釘子（0 到 r）有 C(r, j) 條路徑會經過——巴斯卡三角形。
 * 常態近似（含連續性修正）：P(X = k) ≈ Φ((k + ½ − μ)/σ) − Φ((k − ½ − μ)/σ)。
 * 亂數一律由外部傳入的 rand()（[0, 1) 均勻）決定，同一個種子可以重現（任務證明用）。
 */
(function (root) {
  'use strict';
  const MAX_N = 16;

  /** 有種子的亂數產生器（mulberry32），回傳 [0, 1) 的均勻亂數 */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** 組合數 C(n, k)（n ≤ 60 時是精確整數） */
  function choose(n, k) {
    if (k < 0 || k > n || n < 0) return 0;
    k = Math.min(k, n - k);
    let r = 1;
    for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
    return Math.round(r);
  }

  /** 二項分布 B(n, p) 的機率 P(X = k)，k = 0…n（p = 0、1 時給精確的 0 與 1） */
  function pmf(n, p) {
    const out = [];
    for (let k = 0; k <= n; k++) {
      if (p <= 0) out.push(k === 0 ? 1 : 0);
      else if (p >= 1) out.push(k === n ? 1 : 0);
      else out.push(choose(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k));
    }
    return out;
  }
  function mean(n, p) { return n * p; }
  function variance(n, p) { return n * p * (1 - p); }

  // ---------- 常態分布 ----------
  /** 互補誤差函數 erfc：|x| ≤ 2 用正項級數 erf(x) = (2/√π) e^(−x²) Σ 2ⁿ x^(2n+1) / (1·3·…·(2n+1))，
   *  |x| > 2 用連分數 erfc(x) = e^(−x²)/√π · 1/(x + (1/2)/(x + 1/(x + (3/2)/(x + …))))；精度約 1e-15 */
  function erfc(x) {
    const z = Math.abs(x);
    let r;
    if (z <= 2) {
      let term = z, s = z;
      for (let n = 1; n < 200 && term > 1e-17 * s; n++) { term *= 2 * z * z / (2 * n + 1); s += term; }
      const erf = 2 / Math.sqrt(Math.PI) * Math.exp(-z * z) * s;
      r = 1 - erf;
    } else {
      let f = z;
      for (let n = 120; n >= 1; n--) f = z + (n / 2) / f;
      r = Math.exp(-z * z) / Math.sqrt(Math.PI) / f;
    }
    return x >= 0 ? r : 2 - r;
  }
  /** 標準常態分布的累積機率 Φ(z) */
  function normCdf(z) { return 0.5 * erfc(-z / Math.SQRT2); }
  /** 常態分布 N(μ, σ²) 的機率密度 */
  function normPdf(x, mu, sigma) {
    if (!(sigma > 0)) return NaN;
    const z = (x - mu) / sigma;
    return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
  }
  /** 用常態分布近似 B(n, p) 每一格的機率（含連續性修正）；σ = 0 時就是二項分布本身 */
  function normalApprox(n, p) {
    const mu = mean(n, p), s = Math.sqrt(variance(n, p));
    if (!(s > 0)) return pmf(n, p);
    const out = [];
    for (let k = 0; k <= n; k++) out.push(normCdf((k + 0.5 - mu) / s) - normCdf((k - 0.5 - mu) / s));
    return out;
  }
  /** 常態近似和二項分布每一格的最大差距 */
  function maxNormalErr(n, p) {
    const a = pmf(n, p), b = normalApprox(n, p);
    let m = 0;
    for (let k = 0; k <= n; k++) m = Math.max(m, Math.abs(a[k] - b[k]));
    return m;
  }

  // ---------- 落球 ----------
  /** 一顆球落下：每層以機率 p 往右（1）、否則往左（0）。回傳 { k（落在第幾格）, path } */
  function drop(rand, n, p) {
    const path = [];
    let k = 0;
    for (let r = 0; r < n; r++) {
      const right = rand() < p ? 1 : 0;
      path.push(right);
      k += right;
    }
    return { k: k, path: path };
  }
  /** 一次落很多顆（不需要路徑時用），把結果加進 counts，回傳 counts */
  function dropMany(rand, n, p, count, counts) {
    counts = counts || zeros(n + 1);
    for (let i = 0; i < count; i++) {
      let k = 0;
      for (let r = 0; r < n; r++) if (rand() < p) k++;
      counts[k]++;
    }
    return counts;
  }
  function zeros(m) { const a = []; for (let i = 0; i < m; i++) a.push(0); return a; }

  // ---------- 實驗的統計量 ----------
  /** 各格的球數 → 球數 N、平均、變異數（除以 N）、標準差 */
  function stats(counts) {
    let N = 0, s = 0;
    for (let k = 0; k < counts.length; k++) { N += counts[k]; s += k * counts[k]; }
    if (N === 0) return { N: 0, mean: NaN, variance: NaN, sd: NaN };
    const m = s / N;
    let v = 0;
    for (let k = 0; k < counts.length; k++) v += counts[k] * (k - m) * (k - m);
    v /= N;
    return { N: N, mean: m, variance: v, sd: Math.sqrt(v) };
  }
  /** 實驗頻率和理論機率的總差距（總變異距離）½ Σ |f_k − P_k|，0 到 1 */
  function tv(counts, P) {
    let N = 0;
    for (let k = 0; k < counts.length; k++) N += counts[k];
    if (N === 0) return NaN;
    let d = 0;
    for (let k = 0; k < P.length; k++) d += Math.abs((counts[k] || 0) / N - P[k]);
    return d / 2;
  }
  /** N 顆球時「總差距」的典型大小：每格 |f − P| 的期望值約 √(2/π) · √(P(1 − P)/N)，加總再除以 2（N 大時成立） */
  function expectedTV(P, N) {
    if (!(N > 0)) return NaN;
    let s = 0;
    P.forEach(function (q) { s += Math.sqrt(q * (1 - q)); });
    return 0.5 * Math.sqrt(2 / Math.PI) * s / Math.sqrt(N);
  }
  /** 機率最大的格子（並列時全部列出） */
  function topBins(P) {
    let m = 0;
    P.forEach(function (v) { m = Math.max(m, v); });
    const out = [];
    P.forEach(function (v, k) { if (v >= m * (1 - 1e-9)) out.push(k); });
    return out;
  }
  /** 理論上的眾數：⌊(n + 1)p⌋；(n + 1)p 是 1 到 n 的整數時，(n + 1)p − 1 與 (n + 1)p 兩格並列 */
  function modes(n, p) {
    if (p <= 0) return [0];
    if (p >= 1) return [n];
    const t = (n + 1) * p, r = Math.round(t);
    if (Math.abs(t - r) < 1e-9 && r >= 1 && r <= n) return [r - 1, r];
    return [Math.min(n, Math.floor(t))];
  }
  /** 由實驗結果估計 p：p̂ = 平均 ÷ n */
  function estimateP(counts, n) {
    const s = stats(counts);
    return n > 0 && s.N > 0 ? s.mean / n : NaN;
  }
  /** p̂ 的標準誤差 √(p(1 − p) / (nN)) */
  function stdErrP(p, n, N) { return n > 0 && N > 0 ? Math.sqrt(p * (1 - p) / (n * N)) : NaN; }
  /** 挑戰用的神祕 p：0.05 到 0.95、0.01 的倍數，避開 0.5 附近太好猜的值和目前的 p */
  function hiddenP(rand, cur) {
    for (let i = 0; i < 100; i++) {
      const v = Math.round((0.05 + 0.9 * rand()) * 100) / 100;
      if (Math.abs(v - 0.5) < 0.02) continue;
      if (cur != null && Math.abs(v - cur) < 0.08) continue;
      return v;
    }
    return 0.37;
  }

  // ---------- 釘板的幾何（以釘子間距為 1） ----------
  /** 第 r 層第 j 根釘子的位置：x 以板子中線為 0，y 往下為正 */
  function pegXY(r, j) { return { x: j - r / 2, y: r }; }
  /** 第 k 格（n 層）的中心 x */
  function binX(n, k) { return k - n / 2; }

  /** 數字的精簡寫法 */
  function trim(v, dec) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(dec);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === '-0') s = '0';
    return s;
  }

  const api = {
    MAX_N: MAX_N,
    rng: rng, choose: choose, pmf: pmf, mean: mean, variance: variance,
    erfc: erfc, normCdf: normCdf, normPdf: normPdf, normalApprox: normalApprox, maxNormalErr: maxNormalErr,
    drop: drop, dropMany: dropMany, zeros: zeros,
    stats: stats, tv: tv, expectedTV: expectedTV, topBins: topBins, modes: modes, estimateP: estimateP, stdErrP: stdErrP, hiddenP: hiddenP,
    pegXY: pegXY, binX: binX, trim: trim
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GaltonCore = api;
})(typeof window !== 'undefined' ? window : this);
