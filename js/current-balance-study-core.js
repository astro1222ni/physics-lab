/* 電流天平自學的計算與題目資料；所有磁力與天平數據沿用原物理核心。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./current-balance-core.js'));
  else root.CurrentBalanceStudyCore = factory(root.CurrentBalanceCore);
})(typeof window === 'undefined' ? globalThis : window, function (C) {
  'use strict';
  const D = 2, EARTH = 3.5e-5;
  /** 牆上的光點沿刻度移動量（m）；精確反射幾何與小角度式分開提供。 */
  function optical(theta, distance = D) { return distance * Math.tan(2 * theta); }
  function opticalSmall(theta, distance = D) { return 2 * distance * theta; }
  /** 每粒均勻分布於 20–24 mg；只在換米粒時抽樣，重畫與掛上不會重抽。 */
  function rice(count = 1, random = Math.random) {
    return Array.from({ length: count }, () => (20 + 4 * Math.max(0, Math.min(1, random()))) * 1e-6);
  }
  function earthRatio(I2) { return I2 > 0 ? EARTH / C.Bideal(I2) : NaN; }
  /** 原核心座標 x、y、z 的右手定則：拇指沿 I，四指沿 B，掌心法向沿 I × B。 */
  function hand(s1, s2) { return { I: [s1, 0, 0], B: [0, 0, s2], F: [0, -s1 * s2, 0] }; }
  function wiring(I1, I2, zeroMass = 0, earth = EARTH) {
    return [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([s1, s2]) => ({
      s1, s2, down: s1 * s2 > 0,
      force: I1 * C.APP.L * s1 * (s2 * C.Bideal(I2) + earth),
      signedMass: I1 * C.APP.L * s1 * (s2 * C.Bideal(I2) + earth) / C.G + zeroMass
    }));
  }
  /** 四向資料以符號作差；消去固定零偏與不隨螺線管反向的地磁項。 */
  function wiringMean(rows) { return rows.reduce((sum, r) => sum + r.s1 * r.s2 * r.signedMass, 0) / 4; }
  function inverseRows(m = 61e-6) {
    return [.8, 1, 1.6, 2, 3.2].map(I1 => ({ part: 1, m: m * 1e6, I1, I2: C.balanceI2(m, I1, false), given: true }));
  }
  function offsetRows() {
    const zeroMass = C.APP.nutM * (C.APP.nutX0 - C.APP.nutOK) * .001 / C.APP.d2;
    return [40, 80, 120, 160, 200].map(m => ({ part: 1, m, I1: 3, I2: C.balanceI2(m * 1e-6 + zeroMass, 3, false), given: true }));
  }
  function inverseFit(rows) {
    const fit = C.fitLine(rows.map(r => 1 / r.I2), rows.map(r => r.I1));
    return fit ? { ...fit, mu0: rows[0].m * 1e-6 * C.G / (fit.slope * C.APP.L * C.APP.n) } : null;
  }
  return { D, EARTH, optical, opticalSmall, rice, earthRatio, hand, wiring, wiringMean, inverseRows, offsetRows, inverseFit };
});
