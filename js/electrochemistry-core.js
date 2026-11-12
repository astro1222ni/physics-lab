/*
 * electrochemistry-core.js — 「化學電池與電解」的化學核心（與畫面無關，Node 可直接 require）
 *
 * 25 °C（298.15 K）、稀薄溶液以濃度（mol/L）代替活性。
 * 標準還原電位取自 OpenStax《Chemistry 2e》附錄 L（Table L1，Standard Electrode (Half-Cell) Potentials）。
 * 原子量取自 IUPAC 標準原子量（2021 年表的常用值）；法拉第常數 F = N_A·e = 96485.33212 C/mol（CODATA 定義值）。
 *
 * 化學電池：左、右兩個半電池（金屬 M 浸在 M^z+ 溶液中）、鹽橋（KNO3）、外電路（伏特計：電流 0；或負載電阻）。
 *   電極電位（能斯特方程式）E = E° + (RT ln10 / zF)·log10[M^z+]，伏特計讀數 = E右 − E左。
 *   接負載時 I = (E右 − E左)/(R負載 + r內)；電流讓兩邊的濃度與電極質量依法拉第定律改變。
 * 電解：定電流電源、一杯含 M^z+ 的溶液、兩個銅電極或石墨電極。
 *   陰極：M^z+ + z e⁻ → M（離子快用完時改為 2H2O + 2e⁻ → H2 + 2OH⁻，以示意的極限濃度分配電流）。
 *   陽極：銅電極 Cu → Cu²⁺ + 2e⁻；石墨電極 2H2O → O2 + 4H⁺ + 4e⁻。電流效率 100%。
 */
(function (root) {
  'use strict';
  const F = 96485.33212;        // C/mol
  const R = 8.314462618;        // J/(mol·K)
  const T0 = 298.15;            // K
  const P0 = 101325;            // Pa（1 atm，氣體體積用）
  const KN = R * T0 * Math.LN10 / F;   // 0.05916 V
  const VM = R * T0 / P0 * 1000;       // 25 °C、1 atm 的莫耳體積（L/mol）

  // E°：V；M：g/mol；col：離子溶液的顏色（null = 無色）
  const METALS = {
    Mg: { z: 2, E: -2.372, M: 24.305, col: null },
    Zn: { z: 2, E: -0.7618, M: 65.38, col: null },
    Fe: { z: 2, E: -0.447, M: 55.845, col: '#b9d98a' },
    Ni: { z: 2, E: -0.257, M: 58.693, col: '#3fae6a' },
    Sn: { z: 2, E: -0.1375, M: 118.71, col: null },
    Pb: { z: 2, E: -0.1262, M: 207.2, col: null },
    Cu: { z: 2, E: 0.337, M: 63.546, col: '#2f7fd8' },
    Ag: { z: 1, E: 0.7996, M: 107.8682, col: null },
    X: { z: 2, E: 0, M: 100, col: null }        // 未知金屬（E° 由 newUnknownE 決定）
  };
  const E_O2 = 1.229;   // O2 + 4H⁺ + 4e⁻ → 2H2O
  const C_MIN = 1e-12;  // 濃度下限（mol/L），避免 log(0)

  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  function lcm(a, b) { return a * b / gcd(a, b); }
  /** 半電池的電極電位（V） */
  function halfE(metal, c) { const m = METALS[metal]; return m.E + KN / m.z * Math.log10(Math.max(c, C_MIN)); }
  /** 標準電池電位：右邊當陰極 */
  function stdEmf(left, right) { return METALS[right].E - METALS[left].E; }
  /** 伏特計讀數（右 − 左） */
  function emf(L, Rh) { return halfE(Rh.metal, Rh.c) - halfE(L.metal, L.c); }
  /** 全反應（左邊氧化、右邊還原）轉移的電子數 n 與反應商的 log10 Q */
  function nOf(left, right) { return lcm(METALS[left].z, METALS[right].z); }
  function logQ(L, Rh) {
    const n = nOf(L.metal, Rh.metal);
    return n / METALS[L.metal].z * Math.log10(Math.max(L.c, C_MIN)) - n / METALS[Rh.metal].z * Math.log10(Math.max(Rh.c, C_MIN));
  }
  /** 由法拉第定律：通過電量 q（C）時，z 價金屬析出或溶解的質量（g） */
  function massOf(metal, q) { const m = METALS[metal]; return q / (m.z * F) * m.M; }

  // ---------------- 化學電池 ----------------
  /** o：{ L: { metal, c, V（L）, m（g）}, R: {…}, bridge, load（'V' 伏特計／'R' 負載）, Rload（Ω）, rint（Ω）} */
  function createCell(o) {
    const h = function (x) { return { metal: x.metal, c: x.c, V: x.V || 0.1, m: x.m == null ? 10 : x.m, m0: x.m == null ? 10 : x.m, c0: x.c }; };
    return { L: h(o.L), R: h(o.R), bridge: !!o.bridge, load: o.load || 'V', Rload: o.Rload || 10, rint: o.rint == null ? 5 : o.rint, t: 0, q: 0, qAbs: 0, I: 0 };
  }
  /** 目前的電流（A；正 = 電子在外電路由左流向右，左為陽極） */
  function current(s) {
    if (!s.bridge || s.load !== 'R') return 0;
    const E = emf(s.L, s.R);
    if (E > 0 && (s.L.m <= 0 || s.R.c <= C_MIN * 10)) return 0;
    if (E < 0 && (s.R.m <= 0 || s.L.c <= C_MIN * 10)) return 0;
    return E / (s.Rload + s.rint);
  }
  /** 讓 q 庫侖的電子由左流到右（q < 0 表示反方向） */
  function transfer(s, q) {
    const an = q >= 0 ? s.L : s.R, ca = q >= 0 ? s.R : s.L, Q = Math.abs(q);
    const ma = METALS[an.metal], mc = METALS[ca.metal];
    const nA = Q / (ma.z * F), nC = Q / (mc.z * F);
    an.m -= nA * ma.M; an.c += nA / an.V;
    ca.m += nC * mc.M; ca.c = Math.max(0, ca.c - nC / ca.V);
    s.q += q; s.qAbs += Q;
  }
  /** 前進 dt 秒（自動切成小步：每一小步任一邊的離子濃度最多變 1%，金屬不會用成負的） */
  function stepCell(s, dt) {
    let left = dt, guard = 0;
    while (left > 1e-12 && guard++ < 20000) {
      const I = current(s);
      if (I === 0) { s.t += left; s.I = 0; return s; }
      const an = I > 0 ? s.L : s.R, ca = I > 0 ? s.R : s.L;
      const ma = METALS[an.metal], mc = METALS[ca.metal];
      // 這一小步最多能送的電量
      const qCat = 0.01 * ca.c * ca.V * mc.z * F;
      const qAn = 0.01 * Math.max(an.c, 1e-6) * an.V * ma.z * F;
      const qMetal = Math.max(0, an.m) / ma.M * ma.z * F;
      // 濃差電池：兩邊快要一樣時，限制步長不要讓電壓衝過零
      let qEq = Infinity;
      if (an.metal === ca.metal) qEq = 0.25 * Math.abs(ca.c - an.c) * Math.min(an.V, ca.V) * ma.z * F + 1e-15;
      const qMax = Math.max(1e-15, Math.min(qCat, qAn, qEq, qMetal));
      const h = Math.min(left, qMax / Math.abs(I));
      let q = I * h;
      if (Math.abs(q) > qMetal) q = Math.sign(q) * qMetal;
      transfer(s, q);
      if (an.m < 1e-12) an.m = 0;
      s.t += h; left -= h; s.I = I;
    }
    if (left > 1e-12) s.t += left;
    return s;
  }

  // ---------------- 電解 ----------------
  const C_LIM = 0.004;   // 陰極的示意極限濃度（mol/L）：濃度低到這附近時，部分電流改為產生氫氣
  /** o：{ metal（溶液中的金屬離子）, c, V（L）, elec（'Cu' 銅電極／'C' 石墨電極）, I（A）} */
  function createElectro(o) {
    const base = o.elec === 'Cu' ? 10 : 5;
    return { metal: o.metal || 'Cu', c: o.c, c0: o.c, V: o.V || 0.2, elec: o.elec || 'C', I: o.I == null ? 1 : o.I, t: 0, q: 0,
      mCath: base, mAnode: base, base: base, dep: 0, nH2: 0, nO2: 0, nH: 0 };
  }
  /** 陰極電流中用來析出金屬的比例 */
  function cathodeEff(c) { return c <= 0 ? 0 : Math.min(1, c / (c + C_LIM) * (1 + C_LIM / 0.5)); }
  function stepElectro(s, dt) {
    let left = dt, guard = 0;
    while (left > 1e-12 && guard++ < 4000) {
      if (!(s.I > 0)) { s.t += left; return s; }
      const m = METALS[s.metal];
      // 每一小步濃度最多變 1%（或 1e-5 mol/L）；離子快用完時大部分電流產生氫氣，步長可以放大
      const eff = cathodeEff(s.c);
      const last = guard >= 3999;
      // 銅陽極用完就停（電路斷了）
      const qAnode = s.elec === 'Cu' ? Math.max(0, s.mAnode) / METALS.Cu.M * 2 * F : Infinity;
      if (qAnode <= 1e-9) { s.mAnode = 0; s.spent = true; s.t += left; return s; }
      const qMax = Math.min(Math.max((0.01 * s.c + 1e-5) * s.V * m.z * F / Math.max(eff, 1e-6), 1e-9), qAnode);
      const h = last ? Math.min(left, qAnode / s.I) : Math.min(left, qMax / s.I);
      const q = s.I * h, ne = q / F;
      // 陰極
      const nM = Math.min(ne * eff / m.z, s.c * s.V);
      s.c = Math.max(0, s.c - nM / s.V);
      s.mCath += nM * m.M; s.dep += nM * m.M;
      const neH = ne - nM * m.z;
      if (neH > 0) { s.nH2 += neH / 2; s.nH = Math.max(0, s.nH - neH); }
      // 陽極
      if (s.elec === 'Cu') {
        const nCu = ne / 2;
        s.mAnode -= nCu * METALS.Cu.M;
        if (s.mAnode < 1e-9) s.mAnode = 0;
        if (s.metal === 'Cu') s.c += nCu / s.V; else s.cu2 = (s.cu2 || 0) + nCu / s.V;
      } else {
        s.nO2 += ne / 4; s.nH += ne;
      }
      s.q += q; s.t += h; left -= h;
    }
    if (left > 1e-12) s.t += left;
    return s;
  }
  /** 溶液中 H⁺ 的濃度（mol/L；只算電解產生的部分） */
  function hplus(s) { return s.nH / s.V; }

  // ---------------- 未知金屬 ----------------
  /** 未知電極 X²⁺/X：E° 在 −1.200～+0.700 V，取到 0.001 V */
  function newUnknownE(r) { r = r || Math.random; METALS.X.E = Math.round(-1200 + r() * 1900) / 1000; return METALS.X.E; }
  function setUnknownE(E) { METALS.X.E = E; }
  /** 電解用的未知金屬（二價）：從 Fe、Ni、Cu、Zn、Sn、Pb 中抽一個 */
  const UNK_M = ['Fe', 'Ni', 'Cu', 'Zn', 'Sn', 'Pb'];
  function newUnknownMetal(r) { r = r || Math.random; return UNK_M[Math.floor(r() * UNK_M.length) % UNK_M.length]; }

  // ---------------- 擬合 ----------------
  /** 最小平方直線 y = a + b·x（rows：[{x, y}]） */
  function fitLine(rows) {
    const n = rows.length;
    if (n < 2) return null;
    let sx = 0, sy = 0;
    rows.forEach(function (p) { sx += p.x; sy += p.y; });
    const xm = sx / n, ym = sy / n;
    let sxx = 0, sxy = 0, syy = 0;
    rows.forEach(function (p) { sxx += (p.x - xm) * (p.x - xm); sxy += (p.x - xm) * (p.y - ym); syy += (p.y - ym) * (p.y - ym); });
    if (!(sxx > 0)) return null;
    const b = sxy / sxx;
    return { a: ym - b * xm, b: b, r2: syy > 0 ? sxy * sxy / (sxx * syy) : 1, n: n };
  }

  const api = {
    F: F, R: R, T0: T0, KN: KN, VM: VM, E_O2: E_O2, METALS: METALS, C_LIM: C_LIM, UNK_M: UNK_M,
    halfE: halfE, stdEmf: stdEmf, emf: emf, nOf: nOf, logQ: logQ, massOf: massOf,
    createCell: createCell, current: current, transfer: transfer, stepCell: stepCell,
    createElectro: createElectro, cathodeEff: cathodeEff, stepElectro: stepElectro, hplus: hplus,
    newUnknownE: newUnknownE, setUnknownE: setUnknownE, newUnknownMetal: newUnknownMetal, fitLine: fitLine
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ElecCore = api;
})(typeof window !== 'undefined' ? window : this);
