/*
 * capacitor-core.js — 平行板電容器物理核心（與畫面無關，可單獨測試）
 *
 * 單位約定（SI）：
 *   面積 A ............ m²（正方形平板，邊長 √A）
 *   板距 d ............ m
 *   介電常數 kappa .... 無單位（κ ≥ 1）
 *   插入比例 f ........ 0–1：介電質板（厚度等於板距 d）從側面推入，蓋住面積的比例
 *   電壓 V ............ V；電量 Q ........ C；電容 C ........ F；能量 U ........ J
 *
 * 部分插入的介電質：介電質與空氣兩部分的兩板間電壓相同，等於兩個電容器「並聯」：
 *   C = ε0(1 − f)A/d + κε0 fA/d = (ε0A/d)·[1 + f(κ − 1)]
 * 兩部分的板距都是 d、電壓都是 V，所以電場也都是 E = V/d；介電質那一側的自由電荷面密度是 κ 倍，
 * 多出來的部分被介電質表面的束縛電荷 σb = (κ − 1)ε0E 抵消。
 *
 * 兩種連接方式：
 *   'V'：一直接著電池，V 固定 → Q = CV
 *   'Q'：充電後斷開，Q 固定   → V = Q/C
 */
(function (root) {
  'use strict';

  /** 真空電容率 ε0（F/m），CODATA 2018 */
  const EPS0 = 8.8541878128e-12;

  function kOf(p) { return p.kappa == null ? 1 : p.kappa; }
  function fOf(p) { return p.f == null ? 0 : Math.max(0, Math.min(1, p.f)); }

  /** 沒有介電質（空氣，κ ≈ 1）時的電容 C0 = ε0A/d */
  function cAir(A, d) { return EPS0 * A / d; }

  /** 等效面積 Aeff = A·[1 + f(κ − 1)]，使 C = ε0Aeff/d */
  function effArea(p) { return p.A * (1 + fOf(p) * (kOf(p) - 1)); }

  /** 並聯：C = C1 + C2 + … */
  function parallel() {
    let s = 0;
    for (let i = 0; i < arguments.length; i++) s += arguments[i];
    return s;
  }

  /** 串聯：1/C = 1/C1 + 1/C2 + … */
  function series() {
    let s = 0;
    for (let i = 0; i < arguments.length; i++) s += 1 / arguments[i];
    return 1 / s;
  }

  /** 部分插入介電質時，空氣部分與介電質部分各自的電容（兩者並聯） */
  function parts(p) {
    const f = fOf(p), k = kOf(p);
    return {
      air: EPS0 * (1 - f) * p.A / p.d,
      diel: k * EPS0 * f * p.A / p.d
    };
  }

  /** 電容 C = (ε0A/d)·[1 + f(κ − 1)]；f = 1 時就是 κε0A/d */
  function capacitance(p) {
    return EPS0 * effArea(p) / p.d;
  }

  /**
   * 另一種情況（不在畫面中，供比較）：厚度 t 的介電質板平放在兩板之間、蓋滿整個面積，
   * 等於空氣層（厚 d − t）與介電質層（厚 t）兩個電容器「串聯」：C = ε0A / (d − t + t/κ)
   */
  function slabSeries(A, d, t, kappa) {
    return EPS0 * A / (d - t + t / kappa);
  }

  /**
   * 解出電容器的狀態。mode 為 'V'（src = 電池電壓 V）或 'Q'（src = 固定的電量 Q）。
   * 傳回電容、電量、電壓、電場、能量、能量密度、電荷面密度與板間吸引力。
   */
  function solve(p, mode, src) {
    const C = capacitance(p);
    const Q = mode === 'Q' ? src : C * src;
    const V = mode === 'Q' ? src / C : src;
    const E = V / p.d;                       // 兩部分的板距都是 d，電場相同
    const k = kOf(p), f = fOf(p);
    const sigmaAir = EPS0 * E;               // 空氣部分的自由電荷面密度
    const sigmaDiel = k * EPS0 * E;          // 介電質部分的自由電荷面密度
    const sigmaBound = (k - 1) * EPS0 * E;   // 介電質表面的束縛電荷面密度
    const uAir = 0.5 * EPS0 * E * E;         // 空氣中的能量密度
    const uDiel = 0.5 * k * EPS0 * E * E;    // 介電質中的能量密度
    const airOnly = f === 0 || k === 1;
    return {
      mode: mode, A: p.A, d: p.d, kappa: k, f: f,
      C: C, Q: Q, V: V, E: E,
      U: 0.5 * C * V * V,                    // = Q²/(2C) = QV/2
      uAir: uAir, uDiel: uDiel,
      sigmaAir: sigmaAir, sigmaDiel: sigmaDiel, sigmaBound: sigmaBound,
      Aeff: effArea(p),
      airOnly: airOnly,
      // 板間吸引力：只有空氣間隙時為 F = Q²/(2ε0A)
      F: airOnly ? forceAir(Q, p.A) : null
    };
  }

  /** 空氣間隙的板間吸引力 F = Q²/(2ε0A) = QE/2（與板距無關） */
  function forceAir(Q, A) { return Q * Q / (2 * EPS0 * A); }

  /** Q 固定時，把板距由 d1 拉到 d2，電容器能量的增加 ΔU = Q²(d2 − d1)/(2ε0A)（= 外力作功 F·Δd） */
  function pullWorkQ(Q, A, d1, d2) {
    return Q * Q / (2 * cAir(A, d2)) - Q * Q / (2 * cAir(A, d1));
  }

  /**
   * V 固定（接著電池）時，把空氣電容器的板距由 d1 拉到 d2 的能量帳：
   *   ΔQ = V·ΔC，ΔU = ½V²ΔC = ½VΔQ，電池作功 Wbatt = VΔQ，外力作功 Wmech = ΔU − Wbatt = −½VΔQ
   */
  function pullV(V, A, d1, d2) {
    const C1 = cAir(A, d1), C2 = cAir(A, d2);
    const dQ = V * (C2 - C1);
    const dU = 0.5 * V * V * (C2 - C1);
    const Wbatt = V * dQ;
    return { dQ: dQ, dU: dU, Wbatt: Wbatt, Wmech: dU - Wbatt };
  }

  /**
   * 接上電池後電荷流動的示意（RC 充電）：q 以時間常數 tau 指數趨近 qEq，
   * 經過 dt 後 q' = qEq + (q − qEq)e^(−dt/τ)。tau ≤ 0 時立即到達。
   */
  function relax(q, qEq, dt, tau) {
    if (!(tau > 0)) return qEq;
    return qEq + (q - qEq) * Math.exp(-dt / tau);
  }

  /** 與前一狀態比較：'up'、'down' 或 'same'（相對差小於 tol） */
  function trend(prev, cur, tol) {
    if (prev == null || cur == null || !isFinite(prev) || !isFinite(cur)) return null;
    tol = tol == null ? 1e-9 : tol;
    const s = Math.max(Math.abs(prev), Math.abs(cur));
    if (s === 0 || Math.abs(cur - prev) <= tol * s) return 'same';
    return cur > prev ? 'up' : 'down';
  }

  const api = {
    EPS0: EPS0,
    cAir: cAir,
    effArea: effArea,
    parallel: parallel,
    series: series,
    parts: parts,
    capacitance: capacitance,
    slabSeries: slabSeries,
    solve: solve,
    forceAir: forceAir,
    pullWorkQ: pullWorkQ,
    pullV: pullV,
    relax: relax,
    trend: trend
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CapacitorCore = api;
})(typeof window !== 'undefined' ? window : this);
