/* 113 學測物理 12 題共用的物理核心（純函式，tests/exam-113-core.test.js 測）。
   圖 8、圖 9 的曲線是照原卷圖讀點後內插（不是理論公式），讀點誤差約 ±0.03（相對劑量）、±5 kPa。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Exam113Core = api;
})(typeof self !== 'undefined' ? self : this, () => {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // 單調三次內插（Fritsch–Carlson）：讀點之間不會多出原圖沒有的起伏
  function monotone(pts) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), n = pts.length, d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return x => {
      if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0; while (x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    };
  }
  // ── 圖 8：相對吸收劑量（最高約 1）對深度（cm，0–15）
  const BEAMS = {
    electron: { zh: '電子束 4.0 MeV', en: 'Electron 4.0 MeV', mev: 4, pts: [[0, .93], [.4, .99], [.75, 1], [1.1, .82], [1.4, .45], [1.65, .12], [1.8, 0], [15, 0]] },
    x4: { zh: 'X 光束 4.0 MeV', en: 'X-ray 4.0 MeV', mev: 4, pts: [[0, .93], [.5, .98], [1, .92], [2, .78], [3, .69], [4, .63], [6, .53], [8, .47], [11, .41], [13, .39], [15, .37]] },
    x20: { zh: 'X 光束 20 MeV', en: 'X-ray 20 MeV', mev: 20, pts: [[0, .3], [.8, .62], [1.5, .9], [2.3, 1], [3, .98], [5, .9], [8, .79], [10, .72], [12, .65], [15, .56]] },
    proton: { zh: '質子束 150 MeV', en: 'Proton 150 MeV', mev: 150, pts: [[0, .35], [4, .4], [7, .46], [9, .55], [10, .63], [10.6, .73], [11.1, .9], [11.45, .98], [11.75, .9], [12.1, .55], [12.5, .2], [12.9, 0], [15, 0]] }
  };
  for (const b of Object.values(BEAMS)) { const f = monotone(b.pts); b.dose = x => clamp(f(x), 0, 1.05); }
  const dose = (beam, x) => BEAMS[beam].dose(x);
  // 腫瘤 [a,b] 內的平均劑量、0–15 cm 其餘深度的平均劑量、兩者的比（數值積分）
  function doseRatio(beam, a, b) {
    const N = 600; let inS = 0, inN = 0, outS = 0, outN = 0;
    for (let i = 0; i <= N; i++) { const x = 15 * i / N, d = dose(beam, x); if (x >= a && x <= b) { inS += d; inN++; } else { outS += d; outN++; } }
    const tumor = inN ? inS / inN : 0, normal = outN ? outS / outN : 0;
    return { tumor, normal, ratio: normal > 1e-9 ? tumor / normal : Infinity };
  }
  const H = 6.62607015e-34, MEV = 1.602176634e-13;
  const photonFrequency = mev => mev * MEV / H;
  // 質子動能 K（MeV）→ 速率（相對論；質子靜能 938.272 MeV）
  const protonBeta = K => { const g = 1 + K / 938.272; return Math.sqrt(1 - 1 / (g * g)); };

  // ── 圖 9：安全氣囊充氣壓力（kPa）對時間（ms）
  const SAT = 262;
  const bagCurve = monotone([[0, 0], [3, 1], [5, 3], [10, 12], [15, 33], [20, 61], [25, 94], [30, 130], [35, 166], [40, 199], [45, 227], [50, 246], [55, 257], [60, 262], [80, 262]]);
  const pressure = t => clamp(bagCurve(t), 0, SAT);
  // 壓力第一次達到 p 的時間（二分法；曲線單調）
  function timeFor(p) { if (p <= 0) return 0; if (p >= SAT) return 60; let a = 0, b = 60; for (let i = 0; i < 50; i++) { const m = (a + b) / 2; if (pressure(m) < p) a = m; else b = m; } return (a + b) / 2; }
  // 第 27 題：定力 F = mΔv/Δt（取向東為正）
  const crash = (m, v0, v1, dt) => ({ a: (v1 - v0) / dt, F: m * (v1 - v0) / dt, dp: m * (v1 - v0) });
  const kmh = v => v / 3.6;

  // ── 第 44–46 題：細長磁鐵＝兩個磁極（S 在下、N 在上），等速往下穿過環圈甲
  // 一個磁極 q 在軸上距環圈平面 z 處，穿過半徑 a 環圈的磁通量 Φ = (q/2)(1 − z/√(z²+a²))·sgn 的連續版：
  // 用 Ω(z)＝2π(1 − z/√(z²+a²))（z 由上往下穿過時從 0 增到 4π），Φ ∝ q·Ω/4π。
  // 時間：S 極 3 s 到中心、磁鐵中心 6 s 到中心 → 半長 = 3 s × v。v 取 1（單位長度/秒），環圈半徑 a 取 0.55 使峰寬接近圖 19。
  const loopA = 0.55;
  const omega = (z, a = loopA) => 2 * Math.PI * (1 - z / Math.hypot(z, a));   // z>0 在環圈上方
  // 向下的磁通量（以「向下為正」量）：S 極在下端（磁力線進入 S）。磁鐵 N 在上、S 在下 → 鐵內磁場向上，外部在下端附近磁力線往上指向 S。
  // 用磁極強度：N = +1、S = −1；穿過環圈「向上」的磁通量 Φ_up = Σ q·(Ω/4π) 再取負號換成往上（磁極在環圈上方時，其磁力線往下穿過環圈）。
  function fluxUp(tSec, opt = {}) {
    const v = opt.v ?? 1, half = 3, a = opt.a ?? loopA, z0 = 6;                 // z0：t=0 時磁鐵中心離環圈 6 單位
    const zc = z0 - v * tSec, zs = zc - half, zn = zc + half;                    // 中心、S 極、N 極的高度
    // 磁極在上方（z>0）時，它往下（N）或往上（S）的磁力線有 Ω/4π 穿過環圈；穿過去以後 Ω→4π−…，連續處理
    const part = (q, z) => -q * (omega(z, a) / (4 * Math.PI));                    // 往上為正
    return part(-1, zs) + part(+1, zn);
  }
  // 感應電流（逆時針為正，由上往下看）：ε = −N dΦ_up/dt，I = ε/R。逆時針的電流在環圈內產生向上的磁場。
  function current(tSec, opt = {}) {
    const dt = 1e-4, N = opt.turns ?? 1, R = opt.R ?? 1;
    return -N * (fluxUp(tSec + dt, opt) - fluxUp(tSec - dt, opt)) / (2 * dt) / R;
  }
  // 迴路對磁鐵的力（向上為正）：功率守恆 F·v_mag = −I²R（電能全由磁鐵的機械能來），磁鐵往下走 v_mag = −v
  function forceUp(tSec, opt = {}) { const I = current(tSec, opt), R = opt.R ?? 1, v = opt.v ?? 1; return v > 0 ? I * I * R / v : 0; }

  // ── 第 21 題：簡化眼（水晶體到視網膜 17 mm）與相機
  const EYE = 0.017;
  function eyeImage(p, power, pupil = 4e-3) {          // p：物距（m），power：屈光度（D），pupil：瞳孔直徑（m）
    const inv = power - (isFinite(p) ? 1 / p : 0), q = inv > 0 ? 1 / inv : Infinity;
    const blur = isFinite(q) ? pupil * Math.abs(q - EYE) / q : pupil;   // 視網膜上的模糊圓直徑
    return { q, blur, sharp: blur < 1.5e-5, light: pupil * pupil };
  }
  const relaxed = 1 / EYE;                              // 放鬆時剛好把無窮遠對焦（約 58.8 D）

  // ── 第 20 題：兩個質子相距 r（m）時四種力的大小（N），強力用湯川位能的力、弱力同理但範圍 0.002 fm
  const KE2 = 8.9875517923e9 * 1.602176634e-19 ** 2, G = 6.6743e-11, MP = 1.67262192e-27;
  function forces(r) {
    const em = KE2 / (r * r), grav = G * MP * MP / (r * r);
    const yuk = (g, r0) => g * KE2 * Math.exp(-r / r0) * (1 + r / r0) / (r * r);
    return { strong: yuk(20, 1.4e-15), em, weak: yuk(1e-5, 2e-18), grav };
  }

  // ── 第 24 題：密閉隔熱房間開著冰箱門：電能全部變成室內的熱
  function room(hours, opt = {}) {
    const P = opt.P ?? 150, C = opt.C ?? 3e5, T0 = opt.T0 ?? 26, cop = opt.cop ?? 2.5, on = opt.on ?? true;
    const W = on ? P * hours * 3600 : 0;
    return { W, Qc: cop * W, Qh: (1 + cop) * W, T: T0 + W / C };
  }
  // 第 25 題
  const KWH = 3.6e6;
  const heatMoved = (kwh, cop) => ({ W: kwh * KWH, Q: cop * kwh * KWH });

  return { clamp, monotone, BEAMS, dose, doseRatio, photonFrequency, protonBeta, SAT, pressure, timeFor, crash, kmh,
    loopA, fluxUp, current, forceUp, EYE, eyeImage, relaxed, forces, room, KWH, heatMoved };
});
