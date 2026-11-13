/* atmosphere-layers-core.js — 「大氣分層、氣壓與標準大氣」的物理核心（與畫面無關，Node 可直接 require）
 *
 * 標準大氣：美國標準大氣 1976（U.S. Standard Atmosphere 1976，與 ICAO／ISO 2533 在 32 km 以下相同）。
 *   0–86 km：溫度是位勢高度 H 的分段線性函數（7 層，各層溫度遞減率固定），氣壓由靜力平衡 dP/dH = −ρ g0 解析積分：
 *     L ≠ 0：P = Pb [Tb / (Tb + L(H − Hb))]^(g0 M0 / (R* L))；L = 0：P = Pb exp(−g0 M0 (H − Hb) / (R* Tb))。
 *     幾何高度 z 與位勢高度 H 的換算 H = r0 z / (r0 + z)，r0 = 6 356 766 m。
 *   86–120 km：溫度用 1976 標準的幾何高度公式（86–91 km 等溫、91–110 km 橢圓、110–120 km 每公里升 12 K）。
 *     這裡的氣壓用靜力平衡積分，平均分子量照 1976 標準表的值隨高度內插（100 km 以上氧分子分解、氣體依質量分層），
 *     g(z) = g0 (r0/(r0+z))²；和 1976 標準的表格差 1% 以內（測試裡核對）。
 *   80–86 km 的平均分子量已經開始變小：1976 標準用分子尺度溫度 T_M 算氣壓，真正的溫度 T = T_M·M/M0（表 8 的比值），這裡照做。
 *   溫度偏差 ΔT（類似航空上的 ISA + ΔT）：每一層的溫度都加上 ΔT，地面氣壓仍是 1013.25 hPa，氣壓照新的溫度重新積分。
 * 其他量：密度 ρ = PM/(R*T)、數密度 n = P/(kT)、尺度高度 H = R*T/(Mg)、聲速 c = √(γR*T/M)（γ = 1.4）、
 *   平均自由徑 λ = kT/(√2 π d² P)（d = 3.65e-10 m，1976 標準的有效碰撞直徑）、
 *   頭上空氣的比例 ≈ P/P0（忽略 g 隨高度的微小變化）、氧分壓 0.2095 P、
 *   水的沸點：Antoine 方程式 log10(P/mmHg) = 8.07131 − 1730.63/(233.426 + t)（1–100 °C），
 *   氣壓低於水的三相點 611.657 Pa 時，液態水不存在（冰直接昇華）。
 * 探空氣球：乳膠氣球裝氦氣，氣球內外壓力、溫度相同（忽略膜的張力與內外溫差），體積 V = V0 (P0/P)(T/T0)；
 *   直徑到達爆破直徑就破。淨浮力 L = (ρ_air − ρ_He) V g − (m_球 + m_儀器 + m_He 以外) g，
 *   上升速率由浮力 = 阻力 ½ ρ v² Cd A 決定（Cd = 0.30），時間用四階 Runge–Kutta 積分。
 * 單位：高度 m、溫度 K、氣壓 Pa。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AtmosphereLayersCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const G0 = 9.80665;          // 標準重力加速度（m/s²）
  const RSTAR = 8.31432;       // 1976 標準使用的氣體常數（J/(mol·K)）
  const M0 = 0.0289644;        // 海平面空氣的平均莫耳質量（kg/mol）
  const R0 = 6356766;          // 1976 標準的地球有效半徑（m）
  const P0 = 101325;           // 海平面氣壓（Pa）
  const T0 = 288.15;           // 海平面溫度（K）
  const KB = 1.380649e-23;     // 波茲曼常數
  const NA = 6.02214076e23;
  const GAMMA = 1.4;
  const DCOLL = 3.65e-10;      // 有效碰撞直徑（m）
  const GMR = G0 * M0 / RSTAR; // 34.1632 K/km 的 1/1000
  const O2 = 0.2095;           // 氧氣的體積比例
  const TRIPLE = 611.657;      // 水的三相點氣壓（Pa）
  const ZMAX = 120000;

  // 0–86 km 的 7 層（位勢高度 m、遞減率 K/m）
  const HB = [0, 11000, 20000, 32000, 47000, 51000, 71000, 84852];
  const LB = [-0.0065, 0, 0.001, 0.0028, 0, -0.0028, -0.002];
  const Z86 = 86000;           // 幾何高度 86 km = 位勢高度 84 852 m
  // 86–120 km 的平均分子量（g/mol，1976 標準表 I 的值）
  // 80–86 km 的 M/M0（1976 標準表 8，每 0.5 km）
  const MRATIO = [1.000000, 0.999996, 0.999989, 0.999971, 0.999941, 0.999909, 0.999870, 0.999829, 0.999786, 0.999741, 0.999694, 0.999641, 0.999579];
  const mRatio = function (z) {
    if (z <= 80000) return 1;
    const u = Math.min(12, (z - 80000) / 500), i = Math.min(11, Math.floor(u)), w = u - i;
    return MRATIO[i] * (1 - w) + MRATIO[i + 1] * w;
  };
  const MZ = [[86000, 28.9522], [90000, 28.91], [95000, 28.73], [100000, 28.40], [105000, 27.88], [110000, 27.27], [115000, 26.68], [120000, 26.20]];

  const geopot = function (z) { return R0 * z / (R0 + z); };
  const geomet = function (h) { return R0 * h / (R0 - h); };
  const gAt = function (z) { const r = R0 / (R0 + z); return G0 * r * r; };

  /** 各層底部的溫度與氣壓（加上溫度偏差 dT 之後）；結果快取 */
  const baseCache = {};
  function bases(dT) {
    const key = dT.toFixed(6);
    if (baseCache[key]) return baseCache[key];
    const Tb = [T0 + dT], Pb = [P0];
    for (let i = 0; i < 7; i++) {
      const dh = HB[i + 1] - HB[i], L = LB[i], t = Tb[i];
      const t2 = t + L * dh;
      Tb.push(t2);
      Pb.push(L === 0 ? Pb[i] * Math.exp(-GMR * dh / t) : Pb[i] * Math.pow(t / t2, GMR / L));
    }
    const out = { Tb: Tb, Pb: Pb };
    // 86 km 以上：從 86 km 往上用 RK4 積分 ln P，存成每 100 m 一點的表
    const n = (ZMAX - Z86) / 100;
    const lnp = new Float64Array(n + 1);
    lnp[0] = Math.log(Pb[7]);
    const f = function (z) { return -gAt(z) * molMass(z) / (RSTAR * thermoT(z, dT)); };
    for (let i = 0; i < n; i++) {
      const z = Z86 + i * 100, h = 100;
      const k1 = f(z), k2 = f(z + h / 2), k4 = f(z + h);
      lnp[i + 1] = lnp[i] + h * (k1 + 4 * k2 + k4) / 6;
    }
    out.lnp = lnp;
    const keys = Object.keys(baseCache);
    if (keys.length > 40) delete baseCache[keys[0]];
    baseCache[key] = out;
    return out;
  }

  /** 86 km 以上的平均分子量（kg/mol） */
  function molMass(z) {
    if (z <= MZ[0][0]) return M0;
    for (let i = 1; i < MZ.length; i++) {
      if (z <= MZ[i][0]) {
        const a = MZ[i - 1], b = MZ[i], u = (z - a[0]) / (b[0] - a[0]);
        return (a[1] + u * (b[1] - a[1])) / 1000;
      }
    }
    return MZ[MZ.length - 1][1] / 1000;
  }

  /** 86 km 以上的動力溫度（K，1976 標準的公式，再加上 dT） */
  function thermoT(z, dT) {
    const zk = z / 1000;
    let t;
    if (zk <= 91) t = 186.8673;
    else if (zk <= 110) { const u = (zk - 91) / -19.9429; t = 263.1905 - 76.3232 * Math.sqrt(Math.max(0, 1 - u * u)); }
    else if (zk <= 120) t = 240 + 12 * (zk - 110);
    else { const xi = (zk - 120) * (R0 / 1000 + 120) / (R0 / 1000 + zk); t = 1000 - 640 * Math.exp(-0.01875 * xi); }
    return t + dT;
  }

  /** 層的編號：0 對流層、1 平流層、2 中氣層、3 增溫層 */
  const LAYER_TOP = [11000, 47000, 86000];   // 標準大氣的對流層頂、平流層頂、中氣層頂（位勢 11 km、47 km；幾何 86 km）

  /** 標準大氣在幾何高度 z（m）的狀態；dT 為整層的溫度偏差（K） */
  function at(z, dT) {
    dT = dT || 0;
    z = Math.max(0, Math.min(ZMAX, z));
    const B = bases(dT);
    let T, P, M = M0;
    if (z <= Z86) {
      const h = geopot(z);
      let i = 0;
      while (i < 6 && h >= HB[i + 1]) i++;
      const L = LB[i], dh = h - HB[i];
      const TM = B.Tb[i] + L * dh;     // 分子尺度溫度
      P = L === 0 ? B.Pb[i] * Math.exp(-GMR * dh / B.Tb[i]) : B.Pb[i] * Math.pow(B.Tb[i] / TM, GMR / L);
      const r = mRatio(z);
      T = TM * r; M = M0 * r;
    } else {
      T = thermoT(z, dT);
      M = molMass(z);
      const u = (z - Z86) / 100, i = Math.min(Math.floor(u), B.lnp.length - 2), w = u - i;
      P = Math.exp(B.lnp[i] * (1 - w) + B.lnp[i + 1] * w);
    }
    const g = gAt(z);
    const rho = P * M / (RSTAR * T);
    return {
      z: z, T: T, P: P, rho: rho, M: M, g: g,
      n: P / (KB * T),
      H: RSTAR * T / (M * g),
      c: Math.sqrt(GAMMA * RSTAR * T / M),
      mfp: KB * T / (Math.SQRT2 * Math.PI * DCOLL * DCOLL * P),
      above: P / P0,
      pO2: O2 * P,
      boil: boilingPoint(P),
      layer: layerOf(z)
    };
  }

  /** 由溫度曲線判斷所在的層（用標準的轉折高度；溫度偏差不改變轉折高度） */
  function layerOf(z) {
    const h = geopot(Math.min(z, Z86));
    if (h < 11000) return 0;
    if (h < 47000) return 1;
    if (z < Z86) return 2;
    return 3;
  }

  /** 溫度遞減率 −dT/dz（K/km，正數＝往上變冷；幾何高度） */
  function lapse(z, dT) {
    const a = at(Math.max(0, z - 1), dT), b = at(Math.min(ZMAX, z + 1), dT);
    return -(b.T - a.T) / ((b.z - a.z) / 1000);
  }

  /** 水的沸點（°C）；氣壓低於三相點時傳回 null（液態水不存在） */
  function boilingPoint(P) {
    if (P < TRIPLE) return null;
    const mm = P / 133.322368;
    return 1730.63 / (8.07131 - Math.log10(mm)) - 233.426;
  }

  /** 水在溫度 t（°C）的飽和蒸氣壓（Pa，Antoine） */
  function vaporPressure(t) { return 133.322368 * Math.pow(10, 8.07131 - 1730.63 / (233.426 + t)); }

  /** 找出氣壓等於 p 的幾何高度（m）；二分法 */
  function heightOfPressure(p, dT) {
    if (p >= P0) return 0;
    let lo = 0, hi = ZMAX;
    if (at(hi, dT).P > p) return null;
    for (let k = 0; k < 80; k++) {
      const mid = (lo + hi) / 2;
      if (at(mid, dT).P > p) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /** 兩個氣壓面之間的厚度（m），測高方程式的數值驗證用 */
  function thickness(p1, p2, dT) { return heightOfPressure(p2, dT) - heightOfPressure(p1, dT); }

  /** 0–zTop 之間最冷的點（掃描，回傳 {z, T}） */
  function coldest(zLo, zHi, dT) {
    let best = null;
    for (let z = zLo; z <= zHi; z += 50) { const s = at(z, dT); if (!best || s.T < best.T) best = { z: z, T: s.T }; }
    return best;
  }

  // ---------------- 探空氣球 ----------------
  const MHE = 0.0040026;     // 氦的莫耳質量
  const CD = 0.30;
  /** 氣球型號：質量 kg、爆破直徑 m（Kaymont／Totex 型錄的典型值） */
  const BALLOONS = {
    b300: { mass: 0.30, burst: 3.78 },
    b600: { mass: 0.60, burst: 6.02 },
    b1200: { mass: 1.20, burst: 8.63 },
    b3000: { mass: 3.00, burst: 13.00 }
  };
  const PAYLOAD = 0.25;      // 探空儀（含降落傘、繩子）kg

  /** 氣球的初始狀態：在地面用直徑 D0（m）充氦氣 */
  function launch(type, D0, dT) {
    const B = BALLOONS[type] || BALLOONS.b600;
    const s = at(0, dT || 0);
    const V0 = Math.PI * D0 * D0 * D0 / 6;
    const nHe = s.P * V0 / (RSTAR * s.T);      // 莫耳數（之後不變）
    return { type: type, D0: D0, dT: dT || 0, mass: B.mass, burstD: B.burst, nHe: nHe, z: 0, v: 0, t: 0, burst: false, zMax: 0 };
  }

  /** 氣球在高度 z 的體積、直徑、淨浮力與終端速度 */
  function balloonAt(b, z) {
    const s = at(z, b.dT);
    const V = b.nHe * RSTAR * s.T / s.P;
    const D = Math.cbrt(6 * V / Math.PI);
    const mHe = b.nHe * MHE;
    const lift = (s.rho * V - mHe - b.mass - PAYLOAD) * s.g;   // 淨浮力（N）
    const A = Math.PI * D * D / 4;
    const v = lift > 0 ? Math.sqrt(2 * lift / (s.rho * CD * A)) : 0;
    return { V: V, D: D, lift: lift, v: v, freeLift: lift / s.g, s: s };
  }

  /** 前進 dt 秒（終端速度近似：氣球隨時都以浮力等於阻力的速率上升） */
  function stepBalloon(b, dt) {
    if (b.burst) return b;
    const f = function (z) { return balloonAt(b, z).v; };
    let z = b.z;
    const k1 = f(z), k2 = f(z + dt * k1 / 2), k3 = f(z + dt * k2 / 2), k4 = f(z + dt * k3);
    z = Math.min(ZMAX, z + dt * (k1 + 2 * k2 + 2 * k3 + k4) / 6);
    const st = balloonAt(b, z);
    b.t += dt;
    if (st.D >= b.burstD) {
      // 找出剛好到達爆破直徑的高度（二分）
      let lo = b.z, hi = z;
      for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (balloonAt(b, m).D >= b.burstD) hi = m; else lo = m; }
      z = hi; b.burst = true;
    }
    b.z = z; b.v = balloonAt(b, z).v; b.zMax = Math.max(b.zMax, z);
    return b;
  }

  /** 解析的爆破高度：(Db/D0)³ = (P0/P)(T/T0') —— 找 P/T 的高度（不必積分時間） */
  function burstAltitude(type, D0, dT) {
    const B = BALLOONS[type] || BALLOONS.b600;
    const s0 = at(0, dT || 0);
    const ratio = Math.pow(B.burst / D0, 3);   // V_burst / V0
    const target = (s0.P / s0.T) / ratio;      // 需要的 P/T
    if (at(ZMAX, dT).P / at(ZMAX, dT).T > target) return null;
    let lo = 0, hi = ZMAX;
    for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; const s = at(m, dT); if (s.P / s.T > target) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }

  /** 從地面放到破（或飛到上限），回傳 {zBurst, t}；dt 秒 */
  function fly(type, D0, dT, dt) {
    const b = launch(type, D0, dT);
    if (balloonAt(b, 0).lift <= 0) return { b: b, grounded: true };
    dt = dt || 5;
    let guard = 0;
    while (!b.burst && b.z < ZMAX - 1 && guard++ < 200000) {
      const zPrev = b.z;
      stepBalloon(b, dt);
      if (b.z - zPrev < 1e-6) break;         // 浮力用完、停在中性浮力高度
    }
    return { b: b, grounded: false };
  }

  return {
    G0: G0, RSTAR: RSTAR, M0: M0, R0: R0, P0: P0, T0: T0, KB: KB, NA: NA, GAMMA: GAMMA, O2: O2, TRIPLE: TRIPLE, ZMAX: ZMAX,
    HB: HB, LB: LB, LAYER_TOP: LAYER_TOP, BALLOONS: BALLOONS, PAYLOAD: PAYLOAD, CD: CD,
    geopot: geopot, geomet: geomet, gAt: gAt, at: at, lapse: lapse, layerOf: layerOf, molMass: molMass, thermoT: thermoT,
    boilingPoint: boilingPoint, vaporPressure: vaporPressure, heightOfPressure: heightOfPressure, thickness: thickness, coldest: coldest,
    launch: launch, balloonAt: balloonAt, stepBalloon: stepBalloon, burstAltitude: burstAltitude, fly: fly
  };
});
