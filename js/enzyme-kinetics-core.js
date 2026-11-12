/* enzyme-kinetics-core.js — 酵素動力學的核心（與畫面分離，Node 可直接 require）
 *
 * 一、試管裡的酵素（溫度、pH、時間）
 *   受質很少（[S] ≪ Km）時，受質以一級反應消失：d[S]/dt = −k·a(t)·[S]。
 *   a(t) 是酵素「現在的活性」，照 Daniel、Danson 等人的平衡模型（Equilibrium Model）：
 *     催化速率常數隨溫度照 Arrhenius 變快：k(T) = k37·exp(−Ea/R·(1/T − 1/310.15))
 *     活性型 ⇌ 失活型（可逆、很快達平衡）：Keq = exp(ΔHeq/R·(1/Teq − 1/T))，活性型占 1/(1 + Keq)
 *     失活型再慢慢變成永久變性（不可逆）：kinact = (kB·T/h)·exp(−ΔG‡inact/(R·T))
 *       → 酵素總量 E(t) = exp(−λt)，λ = kinact·Keq/(1 + Keq)
 *   pH 用兩個可解離基團的鐘形模型（Michaelis–Davidsohn）：活性 ∝ 1/(1 + 10^(pK1 − pH) + 10^(pH − pK2))，
 *   最適 pH 在 (pK1 + pK2)/2。
 *   參考：R. M. Daniel、M. J. Danson，Trends Biochem. Sci. 35 (2010) 584；M. E. Peterson 等，Biochem. J. 402 (2007) 331。
 *   三種酵素的最適 pH 照教科書常見值（胃蛋白酶約 2、唾液澱粉酶約 6.8、胰蛋白酶約 8）；
 *   pK、Teq、ΔHeq、ΔG‡inact、Ea 是照模型典型大小選的示意值（頁面標明）。
 *
 * 二、Michaelis–Menten 與抑制劑
 *   v = Vmax·[S]/(Km + [S])
 *   競爭型：Km 變成 Km(1 + [I]/Ki)；非競爭型（純）：Vmax 變成 Vmax/(1 + [I]/Ki)；
 *   反競爭型：Vmax、Km 都除以 (1 + [I]/Ki)。
 *   Lineweaver–Burk：1/v = (Km/Vmax)·(1/[S]) + 1/Vmax，用最小平方法擬合直線。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EnzymeCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const R = 8.314;               // J/(mol·K)
  const KB_H = 2.083661912e10;   // kB/h（1/(s·K)）
  const T37 = 310.15;
  const K0 = 273.15;
  const NEED = Math.log(10);     // 剩下 10% 算「反應完成」（碘液不再變藍、蛋白液變清）

  /** 三種酵素（最適 pH 是教科書值；其餘是示意值） */
  const ENZYMES = {
    amylase: {
      zh: '唾液澱粉酶', en: 'Salivary amylase', sub: 'starch', where: { zh: '口腔', en: 'mouth' },
      pK1: 5.3, pK2: 8.3, Ea: 50e3, Teq: K0 + 48, dHeq: 250e3, dGinact: 93e3, k37: 0.0135
    },
    pepsin: {
      zh: '胃蛋白酶', en: 'Pepsin', sub: 'protein', where: { zh: '胃', en: 'stomach' },
      pK1: 0.8, pK2: 3.2, Ea: 50e3, Teq: K0 + 52, dHeq: 250e3, dGinact: 93e3, k37: 0.0135
    },
    trypsin: {
      zh: '胰蛋白酶', en: 'Trypsin', sub: 'protein', where: { zh: '小腸', en: 'small intestine' },
      pK1: 6.7, pK2: 9.3, Ea: 50e3, Teq: K0 + 50, dHeq: 250e3, dGinact: 93e3, k37: 0.0135
    }
  };

  function enz(e) { return typeof e === 'string' ? ENZYMES[e] : e; }
  function optPH(e) { e = enz(e); return (e.pK1 + e.pK2) / 2; }
  /** pH 鐘形，最適 pH 時 = 1 */
  function phFactor(e, pH) {
    e = enz(e);
    const top = 1 + 2 * Math.pow(10, (e.pK1 - e.pK2) / 2);
    return top / (1 + Math.pow(10, e.pK1 - pH) + Math.pow(10, pH - e.pK2));
  }
  /** Arrhenius：相對於 37 °C */
  function arrhenius(e, Tc) { e = enz(e); const T = Tc + K0; return Math.exp(-e.Ea / R * (1 / T - 1 / T37)); }
  function keq(e, Tc) { e = enz(e); const T = Tc + K0; return Math.exp(Math.min(700, e.dHeq / R * (1 / e.Teq - 1 / T))); }
  /** 活性型所占比例（可逆） */
  function activeFrac(e, Tc) { return 1 / (1 + keq(e, Tc)); }
  /** 不可逆變性的速率（1/s，針對整體酵素） */
  function lambda(e, Tc) {
    e = enz(e); const T = Tc + K0, K = keq(e, Tc);
    const kin = KB_H * T * Math.exp(-e.dGinact / (R * T));
    return kin * K / (1 + K);
  }
  /** 剛開始的速率常數（1/s） */
  function rate0(e, Tc, pH) { e = enz(e); return e.k37 * arrhenius(e, Tc) * activeFrac(e, Tc) * phFactor(e, pH); }
  /** 0 到 t 秒的累積 ∫k·a dt */
  function integ(e, Tc, pH, t) {
    const r = rate0(e, Tc, pH), L = lambda(e, Tc);
    if (L * t < 1e-9) return r * t;
    return r * (1 - Math.exp(-L * t)) / L;
  }
  /** 受質剩下的比例 */
  function remaining(e, Tc, pH, t) { return Math.exp(-integ(e, Tc, pH, t)); }
  /** 剩下 10% 的時間（秒）；永遠到不了就是 Infinity */
  function endTime(e, Tc, pH) {
    const r = rate0(e, Tc, pH), L = lambda(e, Tc);
    if (!(r > 0)) return Infinity;
    if (L < 1e-15) return NEED / r;
    const q = L * NEED / r;
    if (q >= 1) return Infinity;
    return -Math.log(1 - q) / L;
  }
  /** 測量 ta 秒得到的平均活性（相對於 37 °C、最適 pH 的新鮮酵素） */
  function assay(e, Tc, pH, ta) { e = enz(e); return integ(e, Tc, pH, ta) / ta / e.k37; }
  /** 在固定 pH、測量時間 ta 下，掃描 T0–T1 °C 找最適溫度 */
  function scanT(e, pH, ta, T0, T1, step) {
    T0 = T0 == null ? 0 : T0; T1 = T1 == null ? 90 : T1; step = step || 0.5;
    const pts = []; let best = -1, Topt = T0;
    for (let T = T0; T <= T1 + 1e-9; T += step) {
      const a = assay(e, T, pH, ta);
      pts.push([T, a]);
      if (a > best) { best = a; Topt = T; }
    }
    // 在最大值附近用黃金分割再精細一點
    let lo = Math.max(T0, Topt - step), hi = Math.min(T1, Topt + step);
    for (let k = 0; k < 40; k++) {
      const m1 = lo + (hi - lo) * 0.382, m2 = lo + (hi - lo) * 0.618;
      if (assay(e, m1, pH, ta) < assay(e, m2, pH, ta)) lo = m1; else hi = m2;
    }
    Topt = (lo + hi) / 2;
    return { pts: pts, Topt: Topt, max: assay(e, Topt, pH, ta) };
  }
  /** 低溫時 Q10（只看 Arrhenius 那一項） */
  function q10(e, Tc) { return arrhenius(e, Tc + 10) / arrhenius(e, Tc); }

  // ---------- Michaelis–Menten ----------
  const TYPES = ['none', 'competitive', 'noncompetitive', 'uncompetitive'];
  /** 抑制劑存在時的表觀 Vmax、Km */
  function apparent(p) {
    const f = 1 + (p.I > 0 && p.type !== 'none' ? p.I / p.Ki : 0);
    switch (p.type) {
      case 'competitive': return { Vmax: p.Vmax, Km: p.Km * f };
      case 'noncompetitive': return { Vmax: p.Vmax / f, Km: p.Km };
      case 'uncompetitive': return { Vmax: p.Vmax / f, Km: p.Km / f };
      default: return { Vmax: p.Vmax, Km: p.Km };
    }
  }
  function mm(S, Vmax, Km) { return S > 0 ? Vmax * S / (Km + S) : 0; }
  function rate(S, p) { const a = apparent(p); return mm(S, a.Vmax, a.Km); }
  /** Lineweaver–Burk 擬合：pts = [{S, v}]；回傳 {slope, icpt, Vmax, Km, r2}，擬合不出來回傳 null */
  function lbFit(pts) {
    const q = pts.filter(function (p) { return p.S > 0 && p.v > 0; });
    const n = q.length;
    if (n < 2) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    q.forEach(function (p) { const x = 1 / p.S, y = 1 / p.v; sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y; });
    const d = n * sxx - sx * sx;
    if (Math.abs(d) < 1e-300) return null;
    const slope = (n * sxy - sx * sy) / d, icpt = (sy - slope * sx) / n;
    const ssT = syy - sy * sy / n;
    let ssE = 0; q.forEach(function (p) { const e = 1 / p.v - (slope / p.S + icpt); ssE += e * e; });
    const r2 = ssT > 0 ? 1 - ssE / ssT : 1;
    const ok = icpt > 0 && slope > 0;
    return { n: n, slope: slope, icpt: icpt, Vmax: ok ? 1 / icpt : null, Km: ok ? slope / icpt : null, r2: r2 };
  }
  /** 由兩組擬合（沒加、有加抑制劑）判斷型式：比較 Vmax 與 Km 的變化 */
  function classify(f0, f1) {
    if (!f0 || !f1 || !f0.Vmax || !f1.Vmax) return null;
    const rv = f1.Vmax / f0.Vmax, rk = f1.Km / f0.Km;
    const vSame = Math.abs(Math.log(rv)) < 0.12, kSame = Math.abs(Math.log(rk)) < 0.12;
    if (vSame && kSame) return 'none';
    if (vSame && rk > 1) return 'competitive';
    if (kSame && rv < 1) return 'noncompetitive';
    if (rv < 1 && rk < 1 && Math.abs(Math.log(rv / rk)) < 0.15) return 'uncompetitive';
    return 'mixed';
  }

  // ---------- 亂數 ----------
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
  function gauss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
  /** 神秘酵素：Km 0.5–5 mM、Vmax 20–100 µM/min（對數均勻） */
  function sample(seed) {
    const r = rng(seed * 7919 + 13);
    return { Km: 0.5 * Math.pow(10, r()), Vmax: 20 * Math.pow(5, r()) };
  }
  /** 神秘抑制劑：三種之一、Ki 0.3–3 mM */
  function mystery(seed) {
    const r = rng(seed * 104729 + 7);
    return { type: TYPES[1 + Math.floor(r() * 3)], Ki: 0.3 * Math.pow(10, r()) };
  }
  /** 量一次初速度：真值乘上 (1 + noise·高斯) */
  function measure(S, p, noise, r) {
    const v = rate(S, p);
    return Math.max(v * 0.02, v * (1 + noise * gauss(r)));
  }

  return {
    R: R, K0: K0, NEED: NEED, ENZYMES: ENZYMES, TYPES: TYPES,
    optPH: optPH, phFactor: phFactor, arrhenius: arrhenius, keq: keq, activeFrac: activeFrac, lambda: lambda,
    rate0: rate0, integ: integ, remaining: remaining, endTime: endTime, assay: assay, scanT: scanT, q10: q10,
    apparent: apparent, mm: mm, rate: rate, lbFit: lbFit, classify: classify,
    rng: rng, gauss: gauss, sample: sample, mystery: mystery, measure: measure
  };
});
