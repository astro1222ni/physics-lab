/*
 * chemical-equilibrium-core.js — 「化學平衡與勒沙特列原理」的化學核心（與畫面無關，Node 可直接 require）
 *
 * 三個氣相反應（理想氣體，標準壓力 p° = 1 bar）：
 *   n2o4：N₂O₄ ⇌ 2NO₂（Δn = +1，吸熱，NO₂ 紅棕色）           溫度 273–373 K
 *   haber：N₂ + 3H₂ ⇌ 2NH₃（Δn = −2，放熱，哈柏法）           溫度 400–900 K
 *   hi：H₂ + I₂ ⇌ 2HI（Δn = 0，放熱，I₂ 紫色）                溫度 500–800 K
 * 另有未知反應 mys：A₂ ⇌ 2A（ΔH 隱藏，定值），溫度 280–420 K。
 *
 * 熱力學數據：NIST Chemistry WebBook 的氣相數據（M. W. Chase, NIST-JANAF Thermochemical Tables, 4th ed., 1998）：
 *   ΔfH°(298.15 K)、S°(298.15 K, 1 bar) 與 Shomate 熱容式 Cp = A + Bt + Ct² + Dt³ + E/t²（t = T/1000）。
 *   ΔH°(T) = ΔH°(298) + ∫ΔCp dT、ΔS°(T) = ΔS°(298) + ∫ΔCp/T dT（解析積分），K(T) = exp(−ΔG°/RT)。
 *   N₂O₄ 在 298 K 附近沒有 Shomate 係數；273–373 K 的範圍內 ΔCp 的影響很小（K 變化約 1–2%），所以 n2o4 用定值 ΔH°、ΔS°。
 *   I₂(g) 的係數適用於 457.7 K 以上；本模擬在 500 K 以上使用，積分 298–457.7 K 的一段用同一式外推。
 *
 * 平衡：已知各成分的物質的量、溫度與「定容（V）」或「定壓（P）」條件，解反應進度 ξ 使 Q = K（Q 對 ξ 單調，二分法）。
 * 趨近平衡的快慢：ξ 以時間常數 τ 指數趨近 ξ_eq（示意的速率；催化劑讓 τ 變小，不改變 ξ_eq）。
 */
(function (root) {
  'use strict';
  const R = 8.314462618;      // J/(mol·K)
  const P0 = 1e5;             // Pa（1 bar）
  const T0 = 298.15;

  // ---------- 物種 ----------
  // f：化學式（純 ASCII，只當說明；畫面上的化學式另由頁面用下標排版）。seg：Shomate 係數 [Tmin, Tmax, A, B, C, D, E]（J/(mol·K)；超出範圍時用最近的一段外推）
  const SP = {
    NO2: { f: 'NO2', H: 33.10, S: 240.04, seg: [[298, 1200, 16.10857, 75.89525, -54.38740, 14.30777, 0.239423]] },
    N2O4: { f: 'N2O4', H: 9.08, S: 304.38, seg: null },
    N2: { f: 'N2', H: 0, S: 191.61, seg: [[100, 500, 28.98641, 1.853978, -9.647459, 16.63537, 0.000117], [500, 2000, 19.50583, 19.88705, -8.598535, 1.369784, 0.527601]] },
    H2: { f: 'H2', H: 0, S: 130.68, seg: [[298, 1000, 33.066178, -11.363417, 11.432816, -2.772874, -0.158558]] },
    NH3: { f: 'NH3', H: -45.90, S: 192.77, seg: [[298, 1400, 19.99563, 49.77119, -15.37599, 1.921168, 0.189174]] },
    HI: { f: 'HI', H: 26.36, S: 206.59, seg: [[298, 1400, 26.04540, 4.689678, 4.911765, -2.654397, 0.121419]] },
    I2: { f: 'I2', H: 62.42, S: 260.69, seg: [[457.666, 2000, 37.79763, 0.225453, -0.912556, 1.034913, -0.083826]] },
    A2: { f: 'A2', H: 0, S: 0, seg: null },
    A: { f: 'A', H: 0, S: 0, seg: null },
    Ar: { f: 'Ar', H: 0, S: 0, seg: null }
  };
  // ---------- 反應 ----------
  // sp：參與的物種（反應物在前）、nu：係數（反應物負）；Tmin/Tmax：可調溫度；tau：700 K（或 Tref）時趨近平衡的時間常數（秒，示意）、Ea：讓 τ 隨溫度改變（kJ/mol）、cat：催化劑讓 τ 縮小的倍數
  const RX = {
    n2o4: { sp: ['N2O4', 'NO2'], nu: [-1, 2], Tmin: 273, Tmax: 373, T: 298, Tref: 298, tau: 1.6, Ea: 25, cat: 5, n0: { N2O4: 2.0e-3, NO2: 0 }, V: 50, Vr: [10, 100], step: 5e-4, Pr: [0.2, 6] },
    haber: { sp: ['N2', 'H2', 'NH3'], nu: [-1, -3, 2], Tmin: 400, Tmax: 900, T: 700, Tref: 700, tau: 12, Ea: 80, cat: 40, n0: { N2: 0.05, H2: 0.15, NH3: 0 }, V: 50, Vr: [20, 200], step: 0.025, Pr: [20, 500] },
    hi: { sp: ['H2', 'I2', 'HI'], nu: [-1, -1, 2], Tmin: 500, Tmax: 800, T: 700, Tref: 700, tau: 5, Ea: 50, cat: 6, n0: { H2: 1.0e-3, I2: 1.0e-3, HI: 0 }, V: 50, Vr: [10, 100], step: 2.5e-4, Pr: [0.5, 10] },
    mys: { sp: ['A2', 'A'], nu: [-1, 2], Tmin: 280, Tmax: 420, T: 330, Tref: 330, tau: 1.6, Ea: 25, cat: 5, n0: { A2: 2.0e-3, A: 0 }, V: 50, Pr: [0.2, 6] }
  };

  // ---------- 熱容積分 ----------
  function segOf(sp, T) {
    const s = SP[sp].seg;
    for (let i = 0; i < s.length; i++) if (T <= s[i][1]) return s[i];
    return s[s.length - 1];
  }
  // ∫Cp dT 的原函數（J/mol）與 ∫Cp/T dT 的原函數（J/(mol·K)），t = T/1000
  function Hint(c, T) { const t = T / 1000; return 1000 * (c[2] * t + c[3] * t * t / 2 + c[4] * t * t * t / 3 + c[5] * t * t * t * t / 4 - c[6] / t); }
  function Sint(c, T) { const t = T / 1000; return c[2] * Math.log(t) + c[3] * t + c[4] * t * t / 2 + c[5] * t * t * t / 3 - c[6] / (2 * t * t); }
  /** 物種在 T 的熱容（J/(mol·K)） */
  function Cp(sp, T) { const c = segOf(sp, T), t = T / 1000; return c[2] + c[3] * t + c[4] * t * t + c[5] * t * t * t + c[6] / (t * t); }
  /** ∫(T0→T) Cp dT 與 ∫ Cp/T dT（分段） */
  function cpIntegrals(sp, T) {
    const s = SP[sp].seg;
    let dH = 0, dS = 0, a = T0;
    const lo = Math.min(T0, T), hi = Math.max(T0, T), sign = T >= T0 ? 1 : -1;
    a = lo;
    while (a < hi - 1e-9) {
      const c = segOf(sp, a + 1e-6);
      const idx = s.indexOf(c);
      const b = idx < s.length - 1 ? Math.min(hi, c[1]) : hi;
      dH += Hint(c, b) - Hint(c, a);
      dS += Sint(c, b) - Sint(c, a);
      a = b;
    }
    return { H: sign * dH, S: sign * dS };
  }

  // ---------- 熱力學 ----------
  const mysParams = { dH: 57, dS: 175 }; // 未知反應的 ΔH°（kJ/mol）、ΔS°（J/(mol·K)），由頁面設定
  /** 反應在溫度 T 的 ΔH°（kJ/mol）、ΔS°（J/(mol·K)）、ΔG°（kJ/mol）、K（以 1 bar 為標準的 Kp，無因次） */
  function thermo(rx, T) {
    const r = RX[rx];
    let dH = 0, dS = 0;
    if (rx === 'mys') { dH = mysParams.dH * 1000; dS = mysParams.dS; }
    else {
      const useCp = r.sp.every(function (s) { return SP[s].seg; });
      r.sp.forEach(function (s, i) {
        dH += r.nu[i] * SP[s].H * 1000;
        dS += r.nu[i] * SP[s].S;
        if (useCp) { const q = cpIntegrals(s, T); dH += r.nu[i] * q.H; dS += r.nu[i] * q.S; }
      });
    }
    const dG = dH - T * dS;
    return { dH: dH / 1000, dS: dS, dG: dG / 1000, K: Math.exp(-dG / (R * T)) };
  }
  function K(rx, T) { return thermo(rx, T).K; }
  function dn(rx) { return RX[rx].nu.reduce(function (a, b) { return a + b; }, 0); }
  /** Kc（以 1 mol/L 為標準）= Kp·(p°/(RT·1000 mol/m³))^Δn */
  function Kc(rx, T) { return K(rx, T) * Math.pow(P0 / (R * T * 1000), dn(rx)); }

  // ---------- 狀態 ----------
  /** n：{ 物種: mol }（含 Ar）；o：{ T, V（L）} 或 { T, P（bar）} → 總壓、分壓（bar）、濃度（mol/L）、體積 */
  function props(rx, n, o) {
    let ntot = 0;
    Object.keys(n).forEach(function (k) { ntot += n[k]; });
    const V = o.P != null ? ntot * R * o.T / (o.P * P0) * 1000 : o.V;    // L
    const P = o.P != null ? o.P : ntot * R * o.T / (V / 1000) / P0;      // bar
    const p = {}, c = {}, x = {};
    Object.keys(n).forEach(function (k) { x[k] = ntot > 0 ? n[k] / ntot : 0; p[k] = x[k] * P; c[k] = n[k] / V; });
    return { ntot: ntot, V: V, P: P, p: p, c: c, x: x };
  }
  /** 反應商 Q（分壓以 bar 計，相對 p°）；有成分為 0 時可能是 0 或 Infinity */
  function Q(rx, n, o) {
    const r = RX[rx], q = props(rx, n, o);
    let lq = 0;
    for (let i = 0; i < r.sp.length; i++) {
      const pi = q.p[r.sp[i]];
      if (pi <= 0) return r.nu[i] > 0 ? 0 : Infinity;
      lq += r.nu[i] * Math.log(pi);
    }
    return Math.exp(lq);
  }
  /** 反應進度 ξ 的可行範圍（使所有物質的量 ≥ 0） */
  function xiRange(rx, n) {
    const r = RX[rx];
    let lo = -Infinity, hi = Infinity;
    r.sp.forEach(function (s, i) {
      const m = n[s] || 0;
      if (r.nu[i] < 0) hi = Math.min(hi, m / -r.nu[i]); else lo = Math.max(lo, -m / r.nu[i]);
    });
    return { lo: lo, hi: hi };
  }
  function shift(rx, n, xi) {
    const r = RX[rx], out = Object.assign({}, n);
    r.sp.forEach(function (s, i) { out[s] = Math.max(0, (n[s] || 0) + r.nu[i] * xi); });
    return out;
  }
  /** ln Q − ln K 在進度 ξ（相對目前的 n）時的值 */
  function gap(rx, n, o, xi, lnK) {
    const r = RX[rx], m = shift(rx, n, xi);
    let ntot = 0;
    Object.keys(m).forEach(function (k) { ntot += m[k]; });
    // 定容：p_i = n_i RT/V；定壓：p_i = x_i P
    const lnScale = o.P != null ? Math.log(o.P) - Math.log(ntot) : Math.log(R * o.T / (o.V / 1000) / P0);
    let g = -lnK;
    for (let i = 0; i < r.sp.length; i++) g += r.nu[i] * (Math.log(Math.max(m[r.sp[i]], 1e-300)) + lnScale);
    return g;
  }
  /** 由目前的 n 出發，平衡時的反應進度 ξ_eq 與組成 */
  function equilibrium(rx, n, o) {
    const rg = xiRange(rx, n);
    const lnK = Math.log(K(rx, o.T));
    let lo = rg.lo, hi = rg.hi;
    if (!(hi > lo)) return { xi: 0, n: Object.assign({}, n) };
    // 二分法（ln Q 對 ξ 嚴格遞增；端點附近用相對寬度收斂）
    for (let it = 0; it < 200; it++) {
      const mid = 0.5 * (lo + hi);
      if (gap(rx, n, o, mid, lnK) > 0) hi = mid; else lo = mid;
      if (hi - lo <= 1e-15 * Math.max(1e-12, Math.abs(rg.hi - rg.lo))) break;
    }
    const xi = 0.5 * (lo + hi);
    return { xi: xi, n: shift(rx, n, xi) };
  }
  /** 趨近平衡的時間常數（秒）：τ = τ_ref·exp(Ea/R·(1/T − 1/T_ref))，有催化劑時除以 cat 倍 */
  function tau(rx, T, cat) {
    const r = RX[rx];
    return r.tau * Math.exp(r.Ea * 1000 / R * (1 / T - 1 / r.Tref)) / (cat ? r.cat : 1);
  }
  /** 前進 dt 秒：ξ 以時間常數 τ 指數趨近平衡（ξ_eq 每次重算，所以定壓時體積改變也自動考慮） */
  function relax(rx, n, o, dt, cat) {
    const eq = equilibrium(rx, n, o);
    const f = 1 - Math.exp(-dt / tau(rx, o.T, cat));
    return shift(rx, n, eq.xi * f);
  }
  /** 平衡的「遠近」：ln(Q/K)（0 = 平衡；> 0 向左進行；< 0 向右進行） */
  function lnQK(rx, n, o) {
    const q = Q(rx, n, o);
    if (q === 0) return -Infinity;
    if (!isFinite(q)) return Infinity;
    return Math.log(q) - Math.log(K(rx, o.T));
  }
  /** 勒沙特列的預測：擾動之後平衡往哪邊移動（+1 向右、−1 向左、0 不移動） */
  function direction(rx, n, o, tol) {
    const v = lnQK(rx, n, o);
    tol = tol == null ? 1e-6 : tol;
    return v < -tol ? 1 : v > tol ? -1 : 0;
  }
  /** NO₂（或 I₂）的顏色深淺：吸光度 ∝ 濃度 × 光程（比爾定律），傳回透過率 10^(−A) */
  function transmittance(c, eps, path) { return Math.pow(10, -eps * c * path); }

  /** 范特荷夫：由 (T, K) 數據求 ΔH°（kJ/mol）＝ −斜率 × R，ln K 對 1/T 的直線 */
  function vantHoff(rows) {
    const pts = rows.filter(function (r) { return r.K > 0 && r.T > 0; });
    if (pts.length < 2) return null;
    let sx = 0, sy = 0, n = pts.length;
    pts.forEach(function (r) { sx += 1 / r.T; sy += Math.log(r.K); });
    const xm = sx / n, ym = sy / n;
    let sxx = 0, sxy = 0, syy = 0;
    pts.forEach(function (r) { const dx = 1 / r.T - xm, dy = Math.log(r.K) - ym; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; });
    if (!(sxx > 0)) return null;
    const b = sxy / sxx;
    return { slope: b, intercept: ym - b * xm, dH: -b * R / 1000, dS: (ym - b * xm) * R, r2: syy > 0 ? sxy * sxy / (sxx * syy) : 1, n: n };
  }
  /** 未知反應：ΔH° 40.0–80.0 kJ/mol，ΔS° 使 330 K 時 K 在 0.2–2 之間 */
  function newMystery(r) {
    r = r || Math.random;
    const dH = Math.round(400 + r() * 400) / 10;
    const K330 = Math.exp(Math.log(0.2) + r() * Math.log(10));
    const dS = (dH * 1000 + R * 330 * Math.log(K330)) / 330;
    mysParams.dH = dH; mysParams.dS = dS;
    return { dH: dH, dS: dS };
  }
  function setMystery(dH, dS) { mysParams.dH = dH; mysParams.dS = dS; }

  const api = {
    R: R, P0: P0, T0: T0, SP: SP, RX: RX, Cp: Cp, cpIntegrals: cpIntegrals, thermo: thermo, K: K, Kc: Kc, dn: dn,
    props: props, Q: Q, xiRange: xiRange, shift: shift, equilibrium: equilibrium, tau: tau, relax: relax, lnQK: lnQK,
    direction: direction, transmittance: transmittance, vantHoff: vantHoff, newMystery: newMystery, setMystery: setMystery, mysParams: mysParams
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EqCore = api;
})(typeof window !== 'undefined' ? window : this);
