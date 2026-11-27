/* 115 學測物理 14 題用到的計算（SI 單位，除非函式名或註解另寫）。畫面與答案都從這裡算，不手打數字。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Exam115Core = api;
})(globalThis, function () {
  'use strict';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const h = 6.63e-34, c = 3e8, e = 1.6e-19, k = 9e9, G = 6.67e-11;

  // 第 10 題：圖 4 的 v-t 折線。位移＝面積、加速度＝斜率；到 t 為止的面積也給動畫用。
  const CAR = [[0, 0], [5, 10], [10, 10], [20, 0]], CAR_MASS = 1000;
  function carAt(t, pts = CAR) {
    t = clamp(t, pts[0][0], pts[pts.length - 1][0]);
    let area = 0;
    for (let i = 1; i < pts.length; i++) {
      const [t0, v0] = pts[i - 1], [t1, v1] = pts[i], a = (v1 - v0) / (t1 - t0);
      if (t <= t1) { const v = v0 + a * (t - t0); return { v, a, x: area + (v0 + v) / 2 * (t - t0) }; }
      area += (v0 + v1) / 2 * (t1 - t0);
    }
    return { v: 0, a: 0, x: area };
  }
  // 滑行段（10→20 s）的阻力：m·|a|；全程阻力作的功＝失去的動能。
  function carDrag(m = CAR_MASS) { const a = (CAR[3][1] - CAR[2][1]) / (CAR[3][0] - CAR[2][0]); return { a, force: m * -a, work: -0.5 * m * CAR[2][1] ** 2 }; }

  // 第 11、12 題：起重機三段（加速、等速、減速）。以甲到丁高 1 的相對位置：乙 0.19、丙 0.80。
  const CRANE = { b: 0.19, c: 0.80 };
  function crane(s) { // s：0 到 1 的時間比例；三段時間照「先加速到 vmax、等速、再減速」使位置剛好落在乙、丙、丁
    const { b, c: cc } = CRANE, d1 = b, d2 = cc - b, d3 = 1 - cc; // 加速段平均速度 vmax/2
    const t1 = 2 * d1, t2 = d2, t3 = 2 * d3, T = t1 + t2 + t3, t = clamp(s, 0, 1) * T; // vmax＝1
    if (t <= t1) { const a = 1 / t1; return { stage: 0, y: a * t * t / 2, v: a * t, a }; }
    if (t <= t1 + t2) return { stage: 1, y: d1 + (t - t1), v: 1, a: 0 };
    const u = t - t1 - t2, a = -1 / t3; return { stage: 2, y: cc + u + a * u * u / 2, v: 1 + a * u, a };
  }
  // 三段的 ΔU、ΔK（質量 1、g 取 10、vmax 取 1 的示意比例）
  function craneEnergy(H = 1, g = 10) {
    const { b, c: cc } = CRANE, v = 1;
    return { dU: [g * b * H, g * (cc - b) * H, g * (1 - cc) * H], dK: [v * v / 2, 0, -v * v / 2] };
  }

  // 第 13 題：恆星繞 x 點逆時針做圓周運動，測站在左下方很遠處（圖 6）。
  // phase 0＝甲時刻：恆星在 x 的左上方、速度朝左下（朝測站）；phase π＝乙時刻（右下方、朝右上遠離）。
  // 朝測站運動時頻率較高。x、y 是恆星相對 x 點的位置（y 向上為正，半徑 1）。
  function starFrequency(phase, f0 = 1, beta = 0.08) {
    const vr = Math.cos(phase), ang = 3 * Math.PI / 4 + phase; // 甲時刻在左上（135°），逆時針前進
    return { f: f0 / (1 - beta * vr), vr, x: Math.cos(ang), y: Math.sin(ang) };
  }

  // 第 14 題：氦原子裡的四種力（數量級）。核子間距取 10⁻¹⁵ m、電子到核取 10⁻¹⁰ m（照解說的數量級）。
  function heliumForces(rNuc = 1e-15, rAtom = 1e-10) {
    const mn = 1.675e-27;
    return { pp: k * e * e / rNuc ** 2, nnGravity: G * mn * mn / rNuc ** 2, pe: k * e * e / rAtom ** 2, strong: 100 * k * e * e / rNuc ** 2 };
  }

  // 第 15 題：電場的單位＝力 ÷ 電荷＝N/C＝V/m。
  const FIELD_UNITS = { 'N/C': true, 'V/m': true, 'N·C': false, 'C/N': false, 'V·m': false, 'Ω': false };

  // 第 16 題：質子在原點、電子在 x 處受的力（以 +x 為正）。吸引、指向原點、平方反比。
  function electronForce(x, scale = 1) { if (!x) return null; return -Math.sign(x) * scale / (x * x); }

  // 第 17 題：平均動能 ∝ 絕對溫度。
  const kelvin = C => C + 273;
  function keRatio(dayC, nightC) { return kelvin(dayC) / kelvin(nightC); }

  // 第 18 題：鈾核分裂。E＝Δm c²，電功率 Pe＝效率 × R × E。
  function fission(dm = 3.3e-28, Pe = 300e6, eff = 0.33) { const E = dm * c * c; return { E, rate: Pe / (eff * E) }; }

  // 第 47 題：汞的能階（eV）與躍遷放出的波長。
  const HG = [0, -1.6, -2.5, -3.7, -5.0, -10.4];
  const photonEv = lambdaNm => h * c / (lambdaNm * 1e-9) / e;
  const lambdaNm = dEv => h * c / (dEv * e) * 1e9;
  function transition(from, to) { const dE = HG[from] - HG[to]; return { dE, emits: dE > 0, lambda: dE > 0 ? lambdaNm(dE) : null }; }

  // 第 48 題：光子能量（J）。
  const photonJ = lambdaNm => h * c / (lambdaNm * 1e-9);

  // 第 49 題：兩道反射光疊加（同振幅比 amp、相位差 phi）後的合振幅。
  function superpose(amp, phi) { return Math.hypot(1 + amp * Math.cos(phi), amp * Math.sin(phi)); }
  // 斯乃耳定律：sinθ₂ / sinθ₁ ＝ v₂ / v₁（從慢到快會偏離法線）。超過臨界角回傳 null。
  function refract(thetaDeg, vRatio) { const s = Math.sin(thetaDeg * Math.PI / 180) * vRatio; return s > 1 ? null : Math.asin(s) * 180 / Math.PI; }

  // 第 52 題：潮汐發電。每次漲潮的位能 ρVgh、一年發電（漲退各算一次、每天兩次漲潮）。
  function tide(V = 2.5e6, hM = 4, eff = 0.25, rho = 1e3, g = 10, floodsPerDay = 2) {
    const U = rho * V * g * hM, perYear = floodsPerDay * 365 * 2, J = U * eff * perYear;
    return { U, floods: floodsPerDay * 365, perYear, kWh: J / 3.6e6 };
  }

  // 第 53 題：N 極朝上的磁鐵沿線圈軸往上越來越快。磁通量 Φ ∝ a²/(a²+z²)^{3/2}（a＝線圈半徑，cm）；
  // 電流 I ∝ −dΦ/dt ＝ −(dΦ/dz)·v，箭號方向為正。v(z)＝√(v₀²＋2·acc·(z−z₀))。
  function flux(z, a = 10) { return a * a / (a * a + z * z) ** 1.5; }
  function magnetSpeed(z, v0 = 1, acc = 0.0075, z0 = -25) { return Math.sqrt(Math.max(0, v0 * v0 + 2 * acc * (z - z0))); }
  function inducedCurrent(z, opts = {}) {
    const a = opts.a ?? 10, v = opts.v ?? magnetSpeed(z, opts.v0, opts.acc, opts.z0);
    const dPhi = -3 * a * a * z / (a * a + z * z) ** 2.5; // dΦ/dz
    return -(opts.k ?? 1) * dPhi * v;
  }
  // 表 10 的實測值（mA）：上列、下列；官方答案上列屬於 z<0（量值較小）、下列屬於 z>0。
  const TABLE10 = { z: [5, 10, 15, 20], below: [3.40, 2.10, 0.95, 0.43], above: [4.30, 2.70, 1.20, 0.54] };
  const POINTS53 = TABLE10.z.flatMap((z, i) => [[z, TABLE10.above[i]], [-z, -TABLE10.below[i]]]);

  return { clamp, h, c, e, CAR, CAR_MASS, carAt, carDrag, CRANE, crane, craneEnergy, starFrequency, heliumForces, FIELD_UNITS, electronForce,
    kelvin, keRatio, fission, HG, photonEv, lambdaNm, transition, photonJ, superpose, refract, tide, flux, magnetSpeed, inducedCurrent, TABLE10, POINTS53 };
});
