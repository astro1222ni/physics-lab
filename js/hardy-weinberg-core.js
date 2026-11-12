/*
 * hardy-weinberg-core.js — 「哈溫平衡、遺傳漂變與天擇」的族群遺傳模型（與畫面無關，Node 可直接 require 做單元測試）
 *
 * 一個基因座、兩個對偶基因 A 與 a；p 是 A 的頻率，q = 1 − p。基因型頻率寫成 (D, H, R) = (AA, Aa, aa)。
 *
 * 第一部分（無限大的族群，只看交配方式）：
 *   隨機交配：子代 = (p², 2pq, q²)，一代就到哈溫平衡，p 不變。
 *   自花授粉比例 σ：AA → AA、aa → aa、Aa → ¼ AA ＋ ½ Aa ＋ ¼ aa；
 *     D′ = (1−σ)p² + σ(D + H/4)，H′ = (1−σ)·2pq + σH/2，R′ = (1−σ)q² + σ(R + H/4)。
 *     平衡時近親交配係數 F = 1 − H/(2pq) = σ/(2 − σ)（例如全部自花授粉時 H 每代減半）。
 *   抽樣檢定：從族群隨機抽 n 個個體（多項分布），用樣本的 p̂ 算哈溫期望值，卡方檢定（自由度 1）。
 *
 * 第二部分（有限族群：Wright–Fisher 模型）：每一代
 *   1. 遷移：p ← (1 − m)p + m·p_m（m 是每代移入者的比例，p_m 是移入者的 A 頻率）
 *   2. 天擇：合子照哈溫比例形成，存活與生殖的相對適應度 w_AA、w_Aa、w_aa；
 *            p ← (p²w_AA + pq·w_Aa) / w̄，w̄ = p²w_AA + 2pq·w_Aa + q²w_aa
 *   3. 突變：p ← p(1 − u) + (1 − p)v（u：A→a，v：a→A）
 *   4. 漂變：下一代 2N 個基因，每個都獨立地以機率 p 是 A（二項分布 Bin(2N, p)）
 *   N 是個體數（二倍體），所以有 2N 個基因。
 *
 * 理論值：
 *   中性時平均異型合子度 H_t = H_0 (1 − 1/(2N))^t；中性的固定機率 = p_0。
 *   固定機率（Kimura 1962 擴散近似）u(p) = ∫₀^p ψ / ∫₀^1 ψ，ψ(x) = exp(−∫₀^x 2M/V)，M 是天擇造成的平均改變量、V = x(1−x)/(2N)。
 *   加成型天擇（w_Aa − w_aa = s、w_AA − w_aa = 2s）時 u(p) ≈ (1 − e^{−4Nsp}) / (1 − e^{−4Ns})。
 *   隱性致死（1, 1, 0）：q_t = q_0 / (1 + t·q_0)（確定性遞迴的精確解）。
 *   異型合子優勢：p̂ = (w_Aa − w_aa) / (2w_Aa − w_AA − w_aa)。
 *   突變–天擇平衡（隱性有害，w_aa = 1 − s，A→a 突變率 u）：q̂ ≈ √(u/s)。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HWCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------
  // 亂數
  // ---------------------------------------------------------------------
  /** 可重現的亂數（mulberry32），回傳 [0, 1) */
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

  /** ln Γ(x)（Lanczos，x > 0，相對誤差約 1e-15） */
  const LG = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function lgamma(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
    x -= 1;
    let a = LG[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += LG[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function lnChoose(n, k) { return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1); }

  /**
   * 二項分布 Bin(n, p) 的精確抽樣。
   * n 小時逐一擲；否則從眾數往兩邊累加機率做反函數法（Kemp 1986 的 chop-down），期望步數約 √(npq)。
   */
  function binom(n, p, rnd) {
    if (!(p > 0) || n <= 0) return 0;
    if (p >= 1) return n;
    if (n <= 24) {
      let k = 0;
      for (let i = 0; i < n; i++) if (rnd() < p) k++;
      return k;
    }
    const q = 1 - p;
    const m = Math.min(n, Math.floor((n + 1) * p));
    const pm = Math.exp(lnChoose(n, m) + m * Math.log(p) + (n - m) * Math.log(q));
    let u = rnd();
    if (u <= pm) return m;
    u -= pm;
    const r = p / q;
    let lo = m, hi = m, plo = pm, phi = pm;
    for (;;) {
      let moved = false;
      if (lo > 0) {
        plo *= lo / ((n - lo + 1) * r); lo--; moved = true;
        if (u <= plo) return lo;
        u -= plo;
      }
      if (hi < n) {
        phi *= (n - hi) / (hi + 1) * r; hi++; moved = true;
        if (u <= phi) return hi;
        u -= phi;
      }
      if (!moved || (plo < 1e-300 && phi < 1e-300)) return m;   // 浮點誤差把機率用完時（極罕見）回傳眾數
    }
  }

  // ---------------------------------------------------------------------
  // 第一部分：基因型頻率、交配方式、檢定
  // ---------------------------------------------------------------------
  function alleleP(g) { return g[0] + g[1] / 2; }
  /** 哈溫比例（F = 0）或有近親交配係數 F 的基因型頻率 */
  function genotypes(p, F) {
    const q = 1 - p, f = F || 0;
    return [p * p + f * p * q, 2 * p * q * (1 - f), q * q + f * p * q];
  }
  /** 近親交配係數 F = 1 − H / (2pq)；族群只剩一種對偶基因時沒有定義（回傳 0） */
  function inbreedingF(g) {
    const p = alleleP(g), e = 2 * p * (1 - p);
    return e > 1e-12 ? 1 - g[1] / e : 0;
  }
  /** 離哈溫平衡多遠：|D − p²|（＝ |F|·pq）。在哈溫拋物線上時是 0 */
  function hwDev(g) { const p = alleleP(g); return Math.abs(g[0] - p * p); }
  /** 一代交配：σ 是自花授粉（自交）的比例，其餘隨機交配 */
  function mate(g, sigma) {
    const s = sigma || 0, p = alleleP(g), q = 1 - p;
    return [(1 - s) * p * p + s * (g[0] + g[1] / 4), (1 - s) * 2 * p * q + s * g[1] / 2, (1 - s) * q * q + s * (g[2] + g[1] / 4)];
  }
  function selfingF(sigma) { return sigma / (2 - sigma); }

  /** 互補誤差函數（Numerical Recipes erfcc，相對誤差 < 1.2e-7） */
  function erfc(x) {
    const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
      t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }
  /** 自由度 1 的卡方分布，χ² ≥ x 的機率 */
  function chi2p1(x) { return x > 0 ? erfc(Math.sqrt(x / 2)) : 1; }

  /** 從基因型頻率 g 隨機抽 n 個個體（多項分布） */
  function sample(n, g, rnd) {
    const a = binom(n, Math.min(1, Math.max(0, g[0])), rnd);
    const rest = 1 - g[0];
    const b = rest > 1e-15 ? binom(n - a, Math.min(1, Math.max(0, g[1] / rest)), rnd) : 0;
    return [a, b, n - a - b];
  }
  /**
   * 哈溫平衡的卡方檢定（自由度 1：3 個類別 − 1 − 估計 1 個參數 p）。
   * 回傳 { n, p（樣本的 A 頻率）, exp: [期望個數], chi2, pval, Fhat }。只有一種對偶基因時無法檢定（chi2 = 0、pval = 1）。
   */
  function hwTest(obs) {
    const n = obs[0] + obs[1] + obs[2];
    const p = n > 0 ? (2 * obs[0] + obs[1]) / (2 * n) : 0;
    const exp = genotypes(p).map(function (f) { return f * n; });
    let chi2 = 0;
    for (let i = 0; i < 3; i++) if (exp[i] > 0) chi2 += (obs[i] - exp[i]) * (obs[i] - exp[i]) / exp[i];
    const e2 = 2 * p * (1 - p);
    return { n: n, p: p, exp: exp, chi2: chi2, pval: chi2p1(chi2), Fhat: e2 > 0 && n > 0 ? 1 - obs[1] / n / e2 : 0 };
  }

  // ---------------------------------------------------------------------
  // 第二部分：Wright–Fisher（遷移 → 天擇 → 突變 → 漂變）
  // ---------------------------------------------------------------------
  /** 天擇一代（無限大族群，合子照哈溫比例形成）；w̄ = 0 時（全部死光）維持原頻率 */
  function selectP(p, w) {
    const q = 1 - p;
    const wbar = p * p * w[0] + 2 * p * q * w[1] + q * q * w[2];
    if (!(wbar > 0)) return p;
    return (p * p * w[0] + p * q * w[1]) / wbar;
  }
  /** 確定性的一代（族群無限大）：遷移、天擇、突變 */
  function detStep(p, o) {
    const m = o.m || 0;
    let x = (1 - m) * p + m * (o.pm == null ? 0.5 : o.pm);
    x = selectP(x, o.w || [1, 1, 1]);
    x = x * (1 - (o.u || 0)) + (1 - x) * (o.v || 0);
    return Math.min(1, Math.max(0, x));
  }
  function detTraj(p0, gens, o) {
    const out = new Float64Array(gens + 1);
    out[0] = p0;
    for (let t = 1; t <= gens; t++) out[t] = detStep(out[t - 1], o);
    return out;
  }
  function isNeutral(o) {
    const w = o.w || [1, 1, 1];
    return Math.abs(w[0] - w[1]) < 1e-12 && Math.abs(w[1] - w[2]) < 1e-12 && !(o.u > 0) && !(o.v > 0) && !(o.m > 0);
  }

  /**
   * 模擬許多個獨立的族群（同樣的 N 與參數）。
   * o = { N, pops, p0, gens, w: [wAA, wAa, waa], u, v, m, pm, seed }
   * 回傳 { o, P: Float32Array(pops × (gens+1))（第 k 個族群第 t 代 = P[k*(gens+1)+t]）, meanP, meanH（平均的期望異型合子度 2pq）,
   *        fixGen, lostGen（每個族群固定／消失的世代，沒有則 −1）, det（無限大族群的軌跡）}
   */
  function simulate(o) {
    const N = Math.max(1, Math.round(o.N)), twoN = 2 * N, pops = Math.max(1, Math.round(o.pops)), gens = Math.max(1, Math.round(o.gens));
    const rnd = rng(o.seed == null ? 12345 : o.seed);
    const G = gens + 1;
    const P = new Float32Array(pops * G);
    const meanP = new Float64Array(G), meanH = new Float64Array(G);
    const fixGen = new Int32Array(pops).fill(-1), lostGen = new Int32Array(pops).fill(-1);
    const absorbing = !(o.u > 0) && !(o.v > 0) && !(o.m > 0);
    for (let k = 0; k < pops; k++) {
      // 起點：2N 個基因中，A 的個數取最接近 2N·p0 的整數
      let n = Math.round(twoN * o.p0);
      let p = n / twoN;
      P[k * G] = p;
      for (let t = 1; t <= gens; t++) {
        if (absorbing && (n === 0 || n === twoN)) { P[k * G + t] = p; continue; }
        const x = detStep(p, o);
        n = binom(twoN, x, rnd);
        p = n / twoN;
        P[k * G + t] = p;
        if (n === twoN && fixGen[k] < 0) fixGen[k] = t;
        else if (n === 0 && lostGen[k] < 0) lostGen[k] = t;
        if (!absorbing && n > 0 && n < twoN) { fixGen[k] = -1; lostGen[k] = -1; }   // 有突變或遷移時可以再回來：只記最後一次
      }
    }
    for (let t = 0; t < G; t++) {
      let s = 0, h = 0;
      for (let k = 0; k < pops; k++) { const p = P[k * G + t]; s += p; h += 2 * p * (1 - p); }
      meanP[t] = s / pops; meanH[t] = h / pops;
    }
    return { o: o, N: N, pops: pops, gens: gens, P: P, meanP: meanP, meanH: meanH, fixGen: fixGen, lostGen: lostGen, det: detTraj(o.p0, gens, o) };
  }
  /** 第 t 代的狀態統計：固定、消失、還在分離的族群數 */
  function census(sim, t) {
    const G = sim.gens + 1;
    let fixed = 0, lost = 0;
    for (let k = 0; k < sim.pops; k++) {
      const p = sim.P[k * G + t];
      if (p >= 1) fixed++; else if (p <= 0) lost++;
    }
    return { fixed: fixed, lost: lost, seg: sim.pops - fixed - lost };
  }
  /** 第 t 代的 p 分布直方圖：bins 個區間（不含 0 與 1），另外回傳剛好 0（消失）與 1（固定）的數量 */
  function histogram(sim, t, bins) {
    const G = sim.gens + 1, h = new Array(bins).fill(0);
    let lost = 0, fixed = 0;
    for (let k = 0; k < sim.pops; k++) {
      const p = sim.P[k * G + t];
      if (p <= 0) lost++;
      else if (p >= 1) fixed++;
      else h[Math.min(bins - 1, Math.floor(p * bins))]++;
    }
    return { lost: lost, fixed: fixed, h: h };
  }

  /** 中性時異型合子度的理論值 H_0 (1 − 1/(2N))^t */
  function hetDecay(H0, N, t) { return H0 * Math.pow(1 - 1 / (2 * N), t); }

  /**
   * 固定機率（Kimura 擴散近似）：u(p0) = ∫₀^{p0} ψ / ∫₀^1 ψ，ψ = exp(−∫ 2M/V)。
   * M(x) = 天擇一代造成的平均改變量（不含突變、遷移），V(x) = x(1 − x)/(2N)。在對數空間積分，避免 4Ns 很大時溢位。
   */
  function fixProb(p0, N, w) {
    if (p0 <= 0) return 0;
    if (p0 >= 1) return 1;
    const K = 4000, h = 1 / K;
    const lnPsi = new Float64Array(K + 1);
    // 2M/V = 4N·(Δp)/(x(1−x))；Δp/(x(1−x)) 在兩端有有限的極限，所以用中點積分
    let acc = 0;
    lnPsi[0] = 0;
    for (let i = 1; i <= K; i++) {
      const x = (i - 0.5) * h;
      const dp = selectP(x, w) - x;
      acc += 4 * N * dp / (x * (1 - x)) * h;
      lnPsi[i] = -acc;
    }
    let mx = -Infinity;
    for (let i = 0; i <= K; i++) if (lnPsi[i] > mx) mx = lnPsi[i];
    // 梯形法：∫₀^x ψ
    const cum = new Float64Array(K + 1);
    for (let i = 1; i <= K; i++) cum[i] = cum[i - 1] + 0.5 * h * (Math.exp(lnPsi[i - 1] - mx) + Math.exp(lnPsi[i] - mx));
    const xi = p0 * K, i0 = Math.min(K - 1, Math.floor(xi)), f = xi - i0;
    const part = cum[i0] + (cum[i0 + 1] - cum[i0]) * f;
    return Math.min(1, Math.max(0, part / cum[K]));
  }
  /** 加成型天擇的 Kimura 公式（s 是每多一個 A 的適應度增加量，相對於 aa） */
  function kimuraAdditive(p0, N, s) {
    if (Math.abs(s) < 1e-12) return p0;
    return -Math.expm1(-4 * N * s * p0) / -Math.expm1(-4 * N * s);
  }
  /** 異型合子優勢（或劣勢）的內部平衡點；不存在時回傳 null */
  function hetEquilibrium(w) {
    const den = 2 * w[1] - w[0] - w[2];
    if (Math.abs(den) < 1e-12) return null;
    const ph = (w[1] - w[2]) / den;
    return ph > 0 && ph < 1 ? ph : null;
  }
  /** 天擇的類型：'neutral'、'A'（A 有利）、'a'（a 有利）、'het'（異型合子優勢）、'under'（異型合子劣勢）、'mixed' */
  function selKind(w) {
    const e = 1e-9;
    if (Math.abs(w[0] - w[1]) < e && Math.abs(w[1] - w[2]) < e) return 'neutral';
    if (w[1] > w[0] + e && w[1] > w[2] + e) return 'het';
    if (w[1] < w[0] - e && w[1] < w[2] - e) return 'under';
    if (w[0] >= w[1] - e && w[1] >= w[2] - e) return 'A';
    if (w[2] >= w[1] - e && w[1] >= w[0] - e) return 'a';
    return 'mixed';
  }

  /**
   * 一次模擬（到第 t 代為止）的摘要：頁面送任務事件、任務證明都用這一個函式，算法才會一致。
   */
  function summarize(sim, t) {
    const o = sim.o, gens = t == null ? sim.gens : t, G = sim.gens + 1;
    const c = census(sim, gens);
    const w = o.w || [1, 1, 1];
    const twoN = 2 * sim.N;
    const n0 = Math.round(twoN * o.p0);
    const p0 = n0 / twoN;
    const H0 = sim.meanH[0], Hend = sim.meanH[gens];
    const neutral = isNeutral(o);
    let fixT = 0, nFix = 0;
    for (let k = 0; k < sim.pops; k++) { const g = sim.fixGen[k]; if (g >= 0 && g <= gens && sim.P[k * G + gens] >= 1) { fixT += g; nFix++; } }
    const kind = selKind(w);
    const mutOnly = !(o.m > 0);
    return {
      N: sim.N, pops: sim.pops, p0: p0, n0: n0, gens: gens, w: [w[0], w[1], w[2]],
      u: o.u || 0, v: o.v || 0, m: o.m || 0, pm: o.pm == null ? 0.5 : o.pm,
      neutral: neutral, kind: kind,
      fixed: c.fixed, lost: c.lost, seg: c.seg,
      meanP: sim.meanP[gens], detP: sim.det[gens],
      H0: H0, Hend: Hend, Hratio: H0 > 0 ? Hend / H0 : null, Htheory: hetDecay(1, sim.N, gens),
      fixTime: nFix ? fixT / nFix : null,
      uFix: !(o.u > 0) && !(o.v > 0) && mutOnly ? fixProb(p0, sim.N, w) : null,
      pHat: kind === 'het' ? hetEquilibrium(w) : null,
      lethalQ: Math.abs(w[0] - w[1]) < 1e-9 && w[2] < 1e-6 && w[0] > 0 ? (1 - p0) / (1 + gens * (1 - p0)) : null,
      mutSelQ: Math.abs(w[0] - w[1]) < 1e-9 && w[2] < w[0] && w[0] > 0 && o.u > 0 ? Math.sqrt(o.u / (1 - w[2] / w[0])) : null
    };
  }

  return {
    summarize: summarize,
    rng: rng, lgamma: lgamma, binom: binom,
    alleleP: alleleP, genotypes: genotypes, inbreedingF: inbreedingF, hwDev: hwDev, mate: mate, selfingF: selfingF,
    erfc: erfc, chi2p1: chi2p1, sample: sample, hwTest: hwTest,
    selectP: selectP, detStep: detStep, detTraj: detTraj, isNeutral: isNeutral,
    simulate: simulate, census: census, histogram: histogram,
    hetDecay: hetDecay, fixProb: fixProb, kimuraAdditive: kimuraAdditive, hetEquilibrium: hetEquilibrium, selKind: selKind
  };
});
