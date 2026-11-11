/*
 * oscillation-core.js — 彈簧振子與單擺的物理核心（與畫面無關，可單獨測試）
 *
 * 單位約定（SI）：
 *   彈簧振子：質量 m（kg）、力常數 k（N/m）、阻尼係數 b（kg/s，阻力 F = −b v）
 *             位置 x（m，平衡點為 0、向右為正）、速度 v（m/s）、加速度 a（m/s²）
 *   單擺：    擺長 L（m）、重力加速度 g（m/s²）、擺錘質量 m（kg）、阻尼係數 b（kg/s）
 *             擺角 th（rad，由鉛直向下量起、逆時針為正）、角速度 om（rad/s）、角加速度 al（rad/s²）
 *   能量一律為 J；單擺的重力位能以最低點為零點。
 *
 * 運動方程式：
 *   彈簧振子    m x'' = −k x − b x'                    （線性，解析解）
 *   單擺（精確） θ'' = −(g/L) sin θ − (b/m) θ'           （非線性，數值積分）
 *   單擺（小角度近似） θ'' = −(g/L) θ − (b/m) θ'          （線性，解析解，與彈簧同一套公式）
 *
 * 單擺的擺桿視為「質量可忽略的輕桿」：釋放角大於 90° 時繩子會鬆弛，只有硬桿才能維持圓周運動。
 */
(function (root) {
  'use strict';

  const G_PRESETS = { earth: 9.8, moon: 1.62, mars: 3.71 };
  const DEG = Math.PI / 180;
  const TAU = 2 * Math.PI;

  // ---------------------------------------------------------------------------
  // 線性阻尼振子  x'' + 2γ x' + ω0² x = 0 的解析解（任意初始條件 x0、v0）
  // ---------------------------------------------------------------------------

  /**
   * 回傳 { regime, omega0, gamma, omegaD, at(t) → {x, v, a} }。
   * regime：'none'（無阻尼）、'under'（欠阻尼）、'critical'（臨界阻尼）、'over'（過阻尼）。
   * 臨界附近（|γ − ω0| 很小）用臨界阻尼公式，避免除以極小的數。
   */
  function linear(omega0, gamma, x0, v0) {
    const w2 = omega0 * omega0;
    const acc = function (x, v) { return -w2 * x - 2 * gamma * v; };
    const rel = Math.abs(gamma - omega0) / omega0;
    if (gamma <= 0) {
      const w = omega0;
      return {
        regime: 'none', omega0: w, gamma: 0, omegaD: w,
        at: function (t) {
          const c = Math.cos(w * t), s = Math.sin(w * t);
          const x = x0 * c + (v0 / w) * s;
          const v = -x0 * w * s + v0 * c;
          return { x: x, v: v, a: -w2 * x };
        }
      };
    }
    if (gamma < omega0 && rel > 1e-9) {
      const wd = Math.sqrt(w2 - gamma * gamma);
      const B = (v0 + gamma * x0) / wd;
      return {
        regime: 'under', omega0: omega0, gamma: gamma, omegaD: wd,
        at: function (t) {
          const e = Math.exp(-gamma * t), c = Math.cos(wd * t), s = Math.sin(wd * t);
          const x = e * (x0 * c + B * s);
          // v = dx/dt = e^{−γt} [ (B ωd − γ x0) cos − (x0 ωd + γ B) sin ]
          const v = e * ((B * wd - gamma * x0) * c - (x0 * wd + gamma * B) * s);
          return { x: x, v: v, a: acc(x, v) };
        }
      };
    }
    if (rel <= 1e-9) {
      const g = gamma, C = v0 + g * x0;
      return {
        regime: 'critical', omega0: omega0, gamma: gamma, omegaD: 0,
        at: function (t) {
          const e = Math.exp(-g * t);
          const x = (x0 + C * t) * e;
          const v = (C - g * (x0 + C * t)) * e;
          return { x: x, v: v, a: acc(x, v) };
        }
      };
    }
    const beta = Math.sqrt(gamma * gamma - w2);
    const r1 = -gamma + beta, r2 = -gamma - beta;
    const C1 = (v0 - r2 * x0) / (r1 - r2), C2 = (r1 * x0 - v0) / (r1 - r2);
    return {
      regime: 'over', omega0: omega0, gamma: gamma, omegaD: 0,
      at: function (t) {
        const e1 = Math.exp(r1 * t), e2 = Math.exp(r2 * t);
        const x = C1 * e1 + C2 * e2;
        const v = C1 * r1 * e1 + C2 * r2 * e2;
        return { x: x, v: v, a: acc(x, v) };
      }
    };
  }

  // ---------------------------------------------------------------------------
  // 彈簧振子（水平、光滑面）
  // ---------------------------------------------------------------------------

  function springOmega(m, k) { return Math.sqrt(k / m); }
  function springPeriod(m, k) { return TAU * Math.sqrt(m / k); }
  /** 臨界阻尼係數 b_c = 2√(mk) */
  function criticalDamping(m, k) { return 2 * Math.sqrt(m * k); }

  /**
   * 彈簧振子：p = { m, k, b, x0, v0 }（x0 預設 A、v0 預設 0；b 省略為 0）。
   * 回傳 { omega0, gamma, omegaD, regime, T0, Td, state(t) }；
   * state(t) = { t, x, v, a, KE, PE, E }。
   */
  function spring(p) {
    const b = p.b > 0 ? p.b : 0;
    const x0 = p.x0 != null ? p.x0 : p.A, v0 = p.v0 || 0;
    const w0 = springOmega(p.m, p.k);
    const sol = linear(w0, b / (2 * p.m), x0, v0);
    return {
      omega0: w0,
      gamma: sol.gamma,
      omegaD: sol.omegaD,
      regime: sol.regime,
      T0: TAU / w0,
      Td: sol.omegaD > 0 ? TAU / sol.omegaD : Infinity,
      state: function (t) {
        const s = sol.at(t);
        const KE = 0.5 * p.m * s.v * s.v, PE = 0.5 * p.k * s.x * s.x;
        return { t: t, x: s.x, v: s.v, a: s.a, KE: KE, PE: PE, E: KE + PE };
      }
    };
  }

  /**
   * 由靜止釋放（v0 = 0）的欠阻尼／無阻尼振子，第 n 個轉折點（速度為零）的時刻 = nπ/ωd（n ≥ 1）。
   * 回傳 (t0, t1] 之間跨過的轉折點編號陣列。過阻尼、臨界阻尼沒有轉折點。
   */
  function turningIndices(omegaD, t0, t1) {
    if (!(omegaD > 0) || !(t1 > t0)) return [];
    const n0 = Math.floor(t0 * omegaD / Math.PI + 1e-12), n1 = Math.floor(t1 * omegaD / Math.PI + 1e-12);
    const out = [];
    for (let n = Math.max(1, n0 + 1); n <= n1; n++) out.push(n);
    return out;
  }

  // ---------------------------------------------------------------------------
  // 單擺：週期公式
  // ---------------------------------------------------------------------------

  /** 算術–幾何平均數 AGM(a, b)（二次收斂，幾步就到機器精度） */
  function agm(a, b) {
    for (let i = 0; i < 40; i++) {
      const an = 0.5 * (a + b), bn = Math.sqrt(a * b);
      if (Math.abs(an - bn) <= 1e-16 * an) return an;
      a = an; b = bn;
    }
    return 0.5 * (a + b);
  }
  /** 第一類完全橢圓積分 K(k) = π / (2·AGM(1, √(1 − k²)))，k 為模數 */
  function ellipticK(k) { return Math.PI / (2 * agm(1, Math.sqrt(1 - k * k))); }

  /** 小角度近似週期 T0 = 2π√(L/g) */
  function smallAnglePeriod(L, g) { return TAU * Math.sqrt(L / g); }
  /** 精確週期 T = 4√(L/g)·K(sin(θ0/2))，θ0 以度為單位 */
  function pendulumPeriod(L, g, theta0Deg) {
    const k = Math.sin(Math.abs(theta0Deg) * DEG / 2);
    return 4 * Math.sqrt(L / g) * ellipticK(k);
  }
  /** 精確週期與小角度近似的相對差 (T − T0)/T0 */
  function periodExcess(theta0Deg) {
    return 2 * ellipticK(Math.sin(Math.abs(theta0Deg) * DEG / 2)) / Math.PI - 1;
  }

  // ---------------------------------------------------------------------------
  // 單擺：數值積分
  // ---------------------------------------------------------------------------

  /** 單擺參數 p = { L, g, m, b, theta0（度） } 的阻尼率 c = b/m（1/s） */
  function dampRate(p) { return p.b > 0 && p.m > 0 ? p.b / p.m : 0; }

  /** 角加速度 α = −(g/L) sin θ − (b/m) ω */
  function pendulumAccel(p, th, om) { return -(p.g / p.L) * Math.sin(th) - dampRate(p) * om; }

  function pendulumInit(p) { return { t: 0, th: p.theta0 * DEG, om: 0 }; }

  // 四階 Yoshida（Forest–Ruth）辛積分係數：由三次「跳蛙法」組合而成，能量長時間不漂移
  const CBRT2 = Math.cbrt(2);
  const W1 = 1 / (2 - CBRT2), W0 = -CBRT2 / (2 - CBRT2);
  const YC = [W1 / 2, (W0 + W1) / 2, (W0 + W1) / 2, W1 / 2];
  const YD = [W1, W0, W1];

  /**
   * 前進一步 h，原地修改 s。
   * 無阻尼：四階 Yoshida 辛積分（漂移–踢–漂移…），長時間能量守恆。
   * 有阻尼：系統本來就不保守，改用四階 Runge–Kutta。
   */
  function pendulumStep(p, s, h) {
    const w2 = p.g / p.L;
    if (dampRate(p) === 0) {
      let th = s.th, om = s.om;
      for (let i = 0; i < 3; i++) {
        th += YC[i] * h * om;
        om -= YD[i] * h * w2 * Math.sin(th);
      }
      th += YC[3] * h * om;
      s.th = th; s.om = om; s.t += h;
      return s;
    }
    const th = s.th, om = s.om;
    const k1t = om, k1o = pendulumAccel(p, th, om);
    const k2t = om + 0.5 * h * k1o, k2o = pendulumAccel(p, th + 0.5 * h * k1t, k2t);
    const k3t = om + 0.5 * h * k2o, k3o = pendulumAccel(p, th + 0.5 * h * k2t, k3t);
    const k4t = om + h * k3o, k4o = pendulumAccel(p, th + h * k3t, k4t);
    s.th = th + h / 6 * (k1t + 2 * k2t + 2 * k3t + k4t);
    s.om = om + h / 6 * (k1o + 2 * k2o + 2 * k3o + k4o);
    s.t += h;
    return s;
  }

  /** 建議的最大步長：精確週期的 1/800（L、g、θ0 都已考慮） */
  function pendulumMaxStep(p) {
    return pendulumPeriod(p.L, p.g, Math.min(Math.abs(p.theta0), 179)) / 800;
  }

  /**
   * 推進 dt（拆成不超過 hmax 的等長小步），原地修改 s。
   * opts.onStep(s)：每一小步之後呼叫（畫圖取樣用）。
   * opts.onTurn(tTurn, thTurn)：角速度變號（轉折點）時呼叫，時刻以線性內插估計。
   */
  function pendulumAdvance(p, s, dt, opts) {
    opts = opts || {};
    const hmax = opts.hmax || pendulumMaxStep(p);
    const n = Math.max(1, Math.ceil(dt / hmax - 1e-9));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const t0 = s.t, th0 = s.th, om0 = s.om;
      pendulumStep(p, s, h);
      if (opts.onTurn && om0 * s.om < 0) {
        const f = om0 / (om0 - s.om);
        opts.onTurn(t0 + f * h, th0 + f * (s.th - th0));
      }
      if (opts.onStep) opts.onStep(s);
    }
    return s;
  }

  /** 單擺的動能、位能（最低點為零）、力學能，單位 J */
  function pendulumEnergy(p, s) {
    const v = p.L * s.om;
    const KE = 0.5 * p.m * v * v;
    const PE = p.m * p.g * p.L * (1 - Math.cos(s.th));
    return { KE: KE, PE: PE, E: KE + PE };
  }

  /** 由角度 θ0 靜止釋放時的最大角速度（能量守恆）：ω_max = √(2g(1 − cos θ0)/L) */
  function pendulumMaxOmega(p) {
    return Math.sqrt(2 * p.g * (1 - Math.cos(p.theta0 * DEG)) / p.L);
  }

  /** 小角度近似（線性化）單擺的解析解：θ'' = −(g/L)θ − (b/m)θ'，同樣由 θ0 靜止釋放 */
  function smallAngle(p) {
    const sol = linear(Math.sqrt(p.g / p.L), dampRate(p) / 2, p.theta0 * DEG, 0);
    return { regime: sol.regime, omegaD: sol.omegaD, at: function (t) { const r = sol.at(t); return { th: r.x, om: r.v, al: r.a }; } };
  }

  /**
   * 以數值積分「量」出單擺週期：由 θ0 靜止釋放，找出角速度再次為零（到達另一側最高點）的時刻，
   * 也就是半個週期；最後一步用二分法把步長縮到恰好 ω = 0。回傳 T = 2 × 半週期。
   * 只適用於無阻尼（b = 0）。
   */
  function measurePendulumPeriod(p, opts) {
    opts = opts || {};
    const q = Object.assign({}, p, { b: 0 });
    const h = opts.h || pendulumMaxStep(q);
    const s = pendulumInit(q);
    const sign = Math.sign(s.th) || 1;
    let guard = 0;
    for (;;) {
      const prev = { t: s.t, th: s.th, om: s.om };
      pendulumStep(q, s, h);
      if (s.t > h * 1.5 && Math.sign(s.om) !== -sign && Math.sign(prev.om) === -sign) {
        // ω 由「往回擺」變成零或反號：半週期落在 (prev.t, s.t] 之間，二分步長
        let lo = 0, hi = h;
        for (let i = 0; i < 60; i++) {
          const mid = 0.5 * (lo + hi);
          const tmp = pendulumStep(q, { t: prev.t, th: prev.th, om: prev.om }, mid);
          if (Math.sign(tmp.om) === -sign) lo = mid; else hi = mid;
        }
        return 2 * (prev.t + 0.5 * (lo + hi));
      }
      if (++guard > 1e7) return NaN;
    }
  }

  /**
   * 有阻尼的彈簧振子（由 p.x0／p.A、p.v0 出發）：力學能第一次降到初始值 frac 倍的時刻（s）。
   * 例如 frac = 1e-4 相當於振幅只剩 1%（任務模式用來判斷「停下來」）。
   * 有阻尼時 dE/dt = −b v² ≤ 0，力學能只減不增，所以先倍增找上界、再二分即可；
   * 過了這個時刻之後力學能不會再回升。無阻尼時傳回 Infinity。
   */
  function springSettleTime(p, frac) {
    const sol = spring(p);
    if (sol.regime === 'none') return Infinity;
    const E0 = sol.state(0).E, target = frac * E0;
    if (!(E0 > target)) return 0;
    let lo = 0, hi = sol.T0 / 16, n = 0;
    while (sol.state(hi).E > target) {
      lo = hi; hi *= 2;
      if (++n > 200) return Infinity;
    }
    for (let i = 0; i < 100 && hi - lo > 1e-12 * hi; i++) {
      const mid = 0.5 * (lo + hi);
      if (sol.state(mid).E > target) lo = mid; else hi = mid;
    }
    return hi;
  }

  const api = {
    G_PRESETS: G_PRESETS,
    springSettleTime: springSettleTime,
    DEG: DEG,
    linear: linear,
    springOmega: springOmega,
    springPeriod: springPeriod,
    criticalDamping: criticalDamping,
    spring: spring,
    turningIndices: turningIndices,
    agm: agm,
    ellipticK: ellipticK,
    smallAnglePeriod: smallAnglePeriod,
    pendulumPeriod: pendulumPeriod,
    periodExcess: periodExcess,
    dampRate: dampRate,
    pendulumAccel: pendulumAccel,
    pendulumInit: pendulumInit,
    pendulumStep: pendulumStep,
    pendulumMaxStep: pendulumMaxStep,
    pendulumAdvance: pendulumAdvance,
    pendulumEnergy: pendulumEnergy,
    pendulumMaxOmega: pendulumMaxOmega,
    smallAngle: smallAngle,
    measurePendulumPeriod: measurePendulumPeriod
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OscillationCore = api;
})(typeof self !== 'undefined' ? self : this);
