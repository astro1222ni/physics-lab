/* greenhouse-core.js — 「溫室效應與地球的能量平衡」的物理核心（與畫面無關，Node 可直接 require）
 *
 * 零維能量平衡模型（全球平均）：
 *   吸收的太陽輻射 ASR = (S/4)(1 − α)，S = 太陽常數 × 亮度比例；
 *   地表放出 σTs⁴；單層大氣吸收地表紅外線的比例 ε，大氣自己向上、向下各放出 εσTa⁴；
 *   大氣本身維持輻射平衡（2εσTa⁴ = εσTs⁴，Ta⁴ = Ts⁴/2），所以
 *   射出長波輻射 OLR = (1 − ε)σTs⁴ + εσTa⁴ = σTs⁴(1 − ε/2)；
 *   地表（含海洋混合層，熱容量 C）的溫度變化：C dTs/dt = ASR − OLR = N（能量不平衡）。
 * ε 的組成：ε0（工業革命前 280 ppm CO₂ 時，含水氣等其他溫室氣體）＋ CO₂ 增加的部分＋（可選）水氣回饋。
 *   CO₂ 的輻射強迫 ΔF = 5.35 ln(C/280) W/m²（Myhre et al. 1998，IPCC 第三次評估報告採用），換算成 ε 的增量 2ΔF/(σT0⁴)；
 *   水氣回饋：ε 隨溫度增加，強度 1.8 W/m²/K（IPCC AR6 第 7 章的水氣回饋最佳估計）。
 * 冰反照率回饋（可選）：α(T) = a − b tanh((T − 265 K)/10 K)，暖時 ≈ 0.30（288 K 時剛好 0.30）、全冰 0.62。
 *   在 288 K 的回饋強度約 0.22 W/m²/K（AR6 地表反照率回饋 0.35 ± 0.25），太陽變暗時會出現兩個穩定平衡（溫暖地球與雪球地球）與遲滯。
 * 溫度單位 K，時間單位 s（介面用「年」）。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GreenhouseCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SIGMA = 5.670374419e-8;        // 史蒂芬－波茲曼常數（W m⁻² K⁻⁴，CODATA 2018 精確值）
  const S0 = 1361;                      // 太陽常數（W/m²，Kopp & Lean 2011）
  const T0 = 288;                       // 參考地表溫度（K）
  const ALPHA0 = 0.30;                  // 現在的行星反照率
  const CO2_0 = 280;                    // 工業革命前的 CO₂（ppm）
  const F_CO2 = 5.35;                   // CO₂ 強迫係數（W/m²）
  const WV = 1.8;                       // 水氣回饋（W/m²/K）
  const HEAT = 1025 * 3990 * 50;        // 熱容量：50 m 海洋混合層（J m⁻² K⁻¹）
  const YEAR = 365.25 * 86400;
  const ICE = { Tm: 265, w: 10, ai: 0.62 };
  // 冰反照率曲線的係數：α(288) = 0.30、α(冷極限) = 0.62
  const ICE_TH = Math.tanh((T0 - ICE.Tm) / ICE.w);
  const ICE_B = (ICE.ai - ALPHA0) / (1 + ICE_TH);
  const ICE_A = ICE.ai - ICE_B;
  const ALPHA_WARM = ICE_A - ICE_B;      // 完全沒有冰時的反照率
  /** 有效輻射溫度（沒有大氣時的地表溫度）(S(1−α)/4σ)^¼ */
  function bareTemp(Sfrac, alpha) { return Math.pow(S0 * Sfrac * (1 - alpha) / (4 * SIGMA), 0.25); }
  /** 讓現在的地球（S = 1、α = 0.30、280 ppm）平衡在 288 K 的 ε0 */
  const EPS0 = 2 * (1 - Math.pow(bareTemp(1, ALPHA0) / T0, 4));

  function forcing(co2) { return F_CO2 * Math.log(Math.max(1e-6, co2) / CO2_0); }
  /** P = { S（亮度比例，1 = 現在）, co2（ppm）, eps0, alpha0, wv（水氣回饋）, ice（冰反照率回饋） } */
  function albedo(P, T) { return P.ice ? ICE_A - ICE_B * Math.tanh((T - ICE.Tm) / ICE.w) : P.alpha0; }
  function epsilon(P, T) {
    let e = P.eps0 + 2 * forcing(P.co2) / (SIGMA * Math.pow(T0, 4));
    if (P.wv) e += 2 * WV * (T - T0) / (SIGMA * Math.pow(T0, 4));
    return Math.max(0, Math.min(1, e));
  }
  function asr(P, T) { return S0 * P.S / 4 * (1 - albedo(P, T)); }
  function olr(P, T) { return SIGMA * Math.pow(T, 4) * (1 - epsilon(P, T) / 2); }
  function imbalance(P, T) { return asr(P, T) - olr(P, T); }
  /** 冰覆蓋面積比例（0–1，只有冰反照率回饋開啟時才有意義） */
  function iceFraction(P, T) {
    if (!P.ice) return 0;
    return Math.max(0, Math.min(1, (albedo(P, T) - ALPHA_WARM) / (ICE.ai - ALPHA_WARM)));
  }
  /** 冰緣緯度（度）：兩極的冰帽面積和 = 冰覆蓋比例 → 冰緣 sin φ = 1 − f；沒有冰時為 90 */
  function iceLatitude(P, T) { return Math.asin(1 - iceFraction(P, T)) * 180 / Math.PI; }
  /** 能量流（W/m²，全球平均），畫圖用 */
  function flows(P, T) {
    const inc = S0 * P.S / 4, a = albedo(P, T), e = epsilon(P, T);
    const sfc = SIGMA * Math.pow(T, 4);
    return {
      incoming: inc, reflected: inc * a, absorbed: inc * (1 - a),
      surface: sfc, atmAbs: e * sfc, through: (1 - e) * sfc,
      atmUp: e * sfc / 2, atmDown: e * sfc / 2,
      olr: (1 - e) * sfc + e * sfc / 2, N: inc * (1 - a) - sfc * (1 - e / 2),
      alpha: a, eps: e, Ta: T / Math.pow(2, 0.25)
    };
  }
  /** dN/dT（W/m²/K，負＝穩定） */
  function slope(P, T) { const h = 0.01; return (imbalance(P, T + h) - imbalance(P, T - h)) / (2 * h); }
  /** 所有平衡溫度（N = 0）：[{ T, stable }]，由冷到熱 */
  function equilibria(P, lo, hi) {
    lo = lo || 120; hi = hi || 420;
    const out = [];
    const step = 0.25;
    let a = lo, fa = imbalance(P, a);
    for (let b = lo + step; b <= hi + 1e-9; b += step) {
      const fb = imbalance(P, b);
      if (fa === 0) out.push(a);
      else if ((fa > 0) !== (fb > 0)) {
        let x0 = a, x1 = b, f0 = fa;
        for (let i = 0; i < 60; i++) {
          const m = (x0 + x1) / 2, fm = imbalance(P, m);
          if ((fm > 0) === (f0 > 0)) { x0 = m; f0 = fm; } else x1 = m;
        }
        out.push((x0 + x1) / 2);
      }
      a = b; fa = fb;
    }
    return out.map(function (T) { return { T: T, stable: slope(P, T) < 0 }; });
  }
  /** 從溫度 T 出發最後會停在哪個（穩定）平衡 */
  function settle(P, T) {
    const eq = equilibria(P);
    const N = imbalance(P, T);
    if (!eq.length) return null;
    if (Math.abs(N) < 1e-9) {
      const near = eq.reduce(function (b, e) { return Math.abs(e.T - T) < Math.abs(b.T - T) ? e : b; });
      if (near.stable || Math.abs(near.T - T) > 1e-6) return near.stable ? near.T : null;
      return near.T;
    }
    // N > 0 往暖走，停在 T 之上第一個平衡；N < 0 往冷走
    if (N > 0) { const up = eq.filter(function (e) { return e.T > T; }); return up.length ? up[0].T : null; }
    const dn = eq.filter(function (e) { return e.T < T; });
    return dn.length ? dn[dn.length - 1].T : null;
  }
  /** 四階 Runge–Kutta：dT/dt = N/C */
  function step(P, T, dt) {
    const f = function (x) { return imbalance(P, x) / HEAT; };
    const k1 = f(T), k2 = f(T + k1 * dt / 2), k3 = f(T + k2 * dt / 2), k4 = f(T + k3 * dt);
    return T + dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
  }
  /** 從 T 積分 years 年（每步 dtYears 年），回傳最後的溫度 */
  function run(P, T, years, dtYears) {
    dtYears = dtYears || 0.05;
    let t = 0;
    while (t < years - 1e-12) { const h = Math.min(dtYears, years - t); T = step(P, T, h * YEAR); t += h; }
    return T;
  }
  /** 回饋參數 λ = −dN/dT（W/m²/K），以及 CO₂ 加倍的平衡增溫（線性估計 F2x/λ 與數值解） */
  function sensitivity(P, T) {
    const lam = -slope(Object.assign({}, P, { co2: P.co2 }), T);
    const F2 = F_CO2 * Math.log(2);
    return { lambda: lam, F2x: F2, linear: lam > 0 ? F2 / lam : Infinity };
  }
  /** 參考平衡：同樣設定、但 CO₂ = 280 ppm、從 288 K 出發的平衡（用來算「比工業革命前暖幾度」） */
  function baseline(P) { return settle(Object.assign({}, P, { co2: CO2_0 }), T0); }

  return {
    SIGMA: SIGMA, S0: S0, T0: T0, ALPHA0: ALPHA0, CO2_0: CO2_0, F_CO2: F_CO2, WV: WV, HEAT: HEAT, YEAR: YEAR,
    EPS0: EPS0, ICE: ICE, ALPHA_WARM: ALPHA_WARM,
    bareTemp: bareTemp, forcing: forcing, albedo: albedo, epsilon: epsilon, asr: asr, olr: olr, imbalance: imbalance,
    iceFraction: iceFraction, iceLatitude: iceLatitude, flows: flows, slope: slope, equilibria: equilibria, settle: settle,
    step: step, run: run, sensitivity: sensitivity, baseline: baseline
  };
});
