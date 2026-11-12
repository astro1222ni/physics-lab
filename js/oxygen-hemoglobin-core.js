/* oxygen-hemoglobin-core.js — 氧氣與血紅素的核心（與畫面分離，Node 可直接 require）
 *
 * 一、氧解離曲線
 *   Severinghaus（J Appl Physiol 46:599, 1979）標準曲線（pH 7.40、PCO2 40 mmHg、37 °C）：
 *     S = 1 / (23400 / (P³ + 150 P) + 1)，P50 ≈ 26.8 mmHg
 *   非標準條件用「虛擬 PO2」（同一篇）：Pv = P · 10^[0.024(37 − T) + 0.40(pH − 7.40) + 0.06 log10(40 / PCO2)]
 *   2,3-BPG：示意擬合，log10 P50 每 mM 改變 0.04（正常 5 mM → P50 26.8；耗盡的庫存血約 17 mmHg）
 *   胎兒血紅素 HbF：P50 約 19 mmHg（和 2,3-BPG 結合較弱，BPG 效應取一半，示意）
 *   肌紅素 Mb：雙曲線 S = P / (P + 2.8)，幾乎沒有波耳效應（這裡不隨 pH、溫度改變）
 *   pH 由 Henderson–Hasselbalch 算：pH = 6.1 + log10([HCO3⁻] / (0.03 PCO2))
 *   一氧化碳：Haldane 第一定律 [HbCO]/[HbO2] = M · PCO / PO2（M = 210；肌紅素 M = 25），
 *     CO 和 O2 搶同樣的位置，所以總配體飽和度 = S(PO2 + M·PCO)，再照比例分給 O2 與 CO（會讓剩下的曲線左移）
 *   大氣壓：West（J Appl Physiol 81:1850, 1996）Pb = exp(6.63268 − 0.1112 h − 0.00149 h²)（h 是公里，mmHg）
 *   肺泡氣體方程式：PAO2 = 0.2095 (Pb − 47) − PaCO2 / 0.8；動脈 PaO2 取 PAO2 的 95%（示意的肺泡—動脈差）
 *   含氧量：CaO2 = 1.34 · [Hb] · S + 0.0031 · PO2（mL O2／dL 血）
 *
 * 二、MWC 模型（Monod、Wyman、Changeux 1965）
 *   四個亞基一起在 T（緊）與 R（鬆）兩種狀態間切換；L = [T0]/[R0]，c = KR/KT，α = PO2 / KR
 *   Y = [α(1 + α)³ + L c α (1 + c α)³] / [(1 + α)⁴ + L (1 + c α)⁴]
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OxyCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const P50_STD = 26.86;          // Severinghaus 標準曲線的 P50（數值解）
  const P50_F = 19, P50_MB = 2.8;
  const M_HB = 210, M_MB = 25;
  const BPG0 = 5, BPG_K = 0.04;
  const STD = { pH: 7.4, PCO2: 40, T: 37, BPG: 5 };

  function sev(P) { if (!(P > 0)) return 0; return 1 / (23400 / (P * P * P + 150 * P) + 1); }
  function sevInv(S) {
    if (S <= 0) return 0; if (S >= 1) return Infinity;
    let lo = 0, hi = 1000;
    for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (sev(m) < S) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  function pHof(PCO2, HCO3) { return 6.1 + Math.log10(HCO3 / (0.03 * PCO2)); }
  /** 虛擬 PO2 的倍率（> 1 表示親和力變高、曲線左移） */
  function factor(c, type) {
    const bpgK = type === 'F' ? BPG_K / 2 : BPG_K;
    return Math.pow(10, 0.024 * (37 - c.T) + 0.40 * (c.pH - 7.40) + 0.06 * Math.log10(40 / c.PCO2) - bpgK * (c.BPG - BPG0));
  }
  /** 沒有 CO 時的飽和度 */
  function sat0(P, c, type) {
    if (type === 'Mb') return P > 0 ? P / (P + P50_MB) : 0;
    const f = factor(c, type) * (type === 'F' ? P50_STD / P50_F : 1);
    return sev(P * f);
  }
  /** 有 CO 時：回傳 {O2, CO, tot}（都是 0–1） */
  function sat(P, c, type, PCO) {
    PCO = PCO || 0;
    const M = type === 'Mb' ? M_MB : M_HB;
    const X = P + M * PCO;
    if (!(X > 0)) return { O2: 0, CO: 0, tot: 0 };
    const tot = sat0(X, c, type);
    return { O2: tot * P / X, CO: tot * M * PCO / X, tot: tot };
  }
  /** O2 飽和度 = 50% 的 PO2（有 CO 時可能永遠到不了 50%，回傳 Infinity） */
  function p50(c, type, PCO) {
    if (sat(1000, c, type, PCO).O2 < 0.5) return Infinity;
    let lo = 0, hi = 1000;
    for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (sat(m, c, type, PCO).O2 < 0.5) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  /** Hill 係數：在 S = 50% 處 d ln(S/(1−S)) / d ln P（沒有 CO） */
  function hillN(c, type) {
    const P = p50(c, type, 0), h = 1e-4;
    const lg = function (p) { const s = sat0(p, c, type); return Math.log(s / (1 - s)); };
    return (lg(P * Math.exp(h)) - lg(P * Math.exp(-h))) / (2 * h);
  }
  function content(P, S, Hb) { return 1.34 * Hb * S + 0.0031 * P; }
  function Pb(hm) { const h = hm / 1000; return Math.exp(6.63268 - 0.1112 * h - 0.00149 * h * h); }
  function PAO2(hm, PaCO2) { return Math.max(0, 0.2095 * (Pb(hm) - 47) - PaCO2 / 0.8); }
  function PaO2(hm, PaCO2) { return 0.95 * PAO2(hm, PaCO2); }
  function PCOalv(ppm, hm) { return ppm * 1e-6 * (Pb(hm) - 47); }

  /**
   * 整體狀態：輸入 {alt, PaCO2, HCO3, T, BPG, Hb, ppm, D, type}
   *   D：每 100 mL 血流過組織要交出的氧（mL O2／dL）＝ 耗氧量 ÷ 心輸出量（Fick 原理）；安靜約 5（250 mL/min ÷ 5 L/min）
   * 由 Ca − Cv = D 反推靜脈 PO2（Pv）；Ca 不夠時 Pv = 0、deficit = true
   * 回傳動脈、靜脈的 PO2、飽和度、含氧量、交出的比例、P50、pH
   */
  function state(o) {
    const pH = pHof(o.PaCO2, o.HCO3);
    const ca = { pH: pH, PCO2: o.PaCO2, T: o.T, BPG: o.BPG };
    // 靜脈端：CO2 多 6 mmHg（典型的動靜脈差，示意），pH 跟著降
    const PvCO2 = o.PaCO2 + 6, pHv = pHof(PvCO2, o.HCO3 + 1);
    const cv = { pH: pHv, PCO2: PvCO2, T: o.T, BPG: o.BPG };
    const Pa = PaO2(o.alt, o.PaCO2);
    const PCO = PCOalv(o.ppm, o.alt);
    const sa = sat(Pa, ca, o.type, PCO);
    const Ca = content(Pa, sa.O2, o.Hb);
    const Cvof = function (p) { return content(p, sat(p, cv, o.type, PCO).O2, o.Hb); };
    const need = Ca - o.D;
    let Pv = 0, deficit = false;
    if (need <= 0) deficit = true;
    else {
      let lo = 0, hi = Pa;
      for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (Cvof(m) < need) lo = m; else hi = m; }
      Pv = (lo + hi) / 2;
    }
    const sv = sat(Pv, cv, o.type, PCO);
    const Cv = deficit ? 0 : Cvof(Pv);
    return {
      pH: pH, pHv: pHv, Pb: Pb(o.alt), PAO2: PAO2(o.alt, o.PaCO2), Pa: Pa, Pv: Pv, PCO: PCO, deficit: deficit,
      Sa: sa.O2, Sv: deficit ? 0 : sv.O2, COHb: sa.CO, Ca: Ca, Cv: Cv, dC: Ca - Cv, frac: Ca > 0 ? (Ca - Cv) / Ca : 0,
      Ca0: content(Pa, sat(Pa, ca, o.type, 0).O2, o.Hb),
      P50: p50(ca, o.type, PCO), P50free: p50(ca, o.type, 0), n: hillN(ca, o.type), ca: ca, cv: cv
    };
  }

  // ---------- MWC ----------
  function mwcY(a, L, c) {
    const r = Math.pow(1 + a, 3), t = Math.pow(1 + c * a, 3);
    return (a * r + L * c * a * t) / ((1 + a) * r + L * (1 + c * a) * t);
  }
  /** 回傳 Y = 50% 的 α */
  function mwcA50(L, c) {
    let lo = 1e-9, hi = 1e9;
    for (let k = 0; k < 200; k++) { const m = Math.sqrt(lo * hi); if (mwcY(m, L, c) < 0.5) lo = m; else hi = m; }
    return Math.sqrt(lo * hi);
  }
  function mwcN(L, c) {
    const a = mwcA50(L, c), h = 1e-4;
    const lg = function (x) { const y = mwcY(x, L, c); return Math.log(y / (1 - y)); };
    return (lg(a * Math.exp(h)) - lg(a * Math.exp(-h))) / (2 * h);
  }
  /** R 狀態的比例 */
  function mwcR(a, L, c) {
    const r = Math.pow(1 + a, 4), t = L * Math.pow(1 + c * a, 4);
    return r / (r + t);
  }
  /** 十種分子狀態（R0–R4、T0–T4）的機率 */
  function mwcDist(a, L, c) {
    const B = [1, 4, 6, 4, 1], w = [];
    let s = 0;
    for (let i = 0; i <= 4; i++) { const v = B[i] * Math.pow(a, i); w.push(v); s += v; }
    for (let i = 0; i <= 4; i++) { const v = L * B[i] * Math.pow(c * a, i); w.push(v); s += v; }
    return w.map(function (v) { return v / s; });
  }
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** 依機率抽一個狀態：回傳 {R: bool, k: 結合數} */
  function draw(dist, r) {
    let u = r(), i = 0;
    for (; i < dist.length - 1; i++) { u -= dist[i]; if (u < 0) break; }
    return { R: i < 5, k: i % 5 };
  }
  /**
   * 分子族群：n 個分子，每個分子平均每秒重抽 rate 次平衡狀態（卜瓦松過程，示意的「翻動」速率）
   *   init(dist)：全部照 dist 抽一次；step(dt, dist)：時間前進 dt 秒，到時間的分子照目前的 dist 重抽
   *   mean()：族群目前的飽和度（結合的亞基 ÷ 4n）；settledSince(t0)：每個分子在 t0 之後都至少重抽過一次
   */
  function pop(n, seed, rate) {
    const r = rng(seed), rt = rate || 3, ms = [];
    const expo = function () { return -Math.log(1 - r()) / rt; };
    const P = {
      t: 0, ms: ms, n: n,
      init: function (dist) {
        ms.length = 0;
        for (let i = 0; i < n; i++) { const d = draw(dist, r); ms.push({ R: d.R, k: d.k, pR: d.R, pk: d.k, last: P.t, ch: -1e9, next: P.t + expo() }); }
      },
      step: function (dt, dist) {
        P.t += dt;
        let c = 0;
        for (let i = 0; i < ms.length; i++) {
          const m = ms[i];
          while (m.next <= P.t) {
            const d = draw(dist, r);
            m.pR = m.R; m.pk = m.k; m.R = d.R; m.k = d.k; m.last = m.next; m.ch = m.next;
            m.next += expo(); c++;
          }
        }
        return c;
      },
      mean: function () { let s = 0; for (let i = 0; i < ms.length; i++) s += ms[i].k; return ms.length ? s / (4 * ms.length) : 0; },
      fracR: function () { let s = 0; for (let i = 0; i < ms.length; i++) if (ms[i].R) s++; return ms.length ? s / ms.length : 0; },
      settledSince: function (t0) { for (let i = 0; i < ms.length; i++) if (!(ms[i].last > t0)) return false; return true; }
    };
    return P;
  }
  /** 血紅素的示意 MWC 參數：L = 9000、c = 0.014（教科書常用值）；KR 調到 P50 = 26.86 mmHg */
  const MWC_HB = { L: 9000, c: 0.014 };
  MWC_HB.KR = P50_STD / mwcA50(MWC_HB.L, MWC_HB.c);
  /** 線性回歸（Hill 圖） */
  function linfit(xs, ys) {
    const n = xs.length; if (n < 2) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
    const d = n * sxx - sx * sx; if (Math.abs(d) < 1e-12) return null;
    const m = (n * sxy - sx * sy) / d;
    return { slope: m, icpt: (sy - m * sx) / n };
  }

  return {
    P50_STD: P50_STD, P50_F: P50_F, P50_MB: P50_MB, M_HB: M_HB, M_MB: M_MB, STD: STD,
    sev: sev, sevInv: sevInv, pHof: pHof, factor: factor, sat0: sat0, sat: sat, p50: p50, hillN: hillN, content: content,
    Pb: Pb, PAO2: PAO2, PaO2: PaO2, PCOalv: PCOalv, state: state,
    mwcY: mwcY, mwcA50: mwcA50, mwcN: mwcN, mwcR: mwcR, mwcDist: mwcDist, rng: rng, draw: draw, pop: pop, MWC_HB: MWC_HB, linfit: linfit
  };
});
