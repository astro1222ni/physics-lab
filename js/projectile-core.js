/*
 * projectile-core.js — 拋體運動物理核心（與畫面無關，可單獨測試）
 *
 * 單位約定（SI）：
 *   位置 x, y ........ m（x 水平向右、y 鉛直向上；地面 y = 0）
 *   速度 vx, vy ...... m/s
 *   時間 t ........... s
 *   重力加速度 g ...... m/s²
 *   仰角 theta ........ 度（°），由水平面向上量
 *   阻力係數 k ........ k/m，單位 1/m：阻力加速度 a = −(k/m)|v| v
 *
 * 參數物件 p = { v0, theta, h0, g, k }，k 省略或為 0 代表沒有空氣阻力。
 * 狀態物件 s = { t, x, y, vx, vy }。
 */
(function (root) {
  'use strict';

  const G_PRESETS = { earth: 9.8, moon: 1.62, mars: 3.71 };
  const DEG = Math.PI / 180;

  function dragOf(p) { return p.k > 0 ? p.k : 0; }

  function initialState(p) {
    const th = p.theta * DEG;
    return { t: 0, x: 0, y: p.h0, vx: p.v0 * Math.cos(th), vy: p.v0 * Math.sin(th) };
  }

  /** 沒有空氣阻力時，落地時間是 h0 + vy0 t − ½ g t² = 0 的正根 */
  function ideal(p) {
    const s0 = initialState(p);
    const vy0 = s0.vy, vx0 = s0.vx, g = p.g, h0 = p.h0;
    const T = (vy0 + Math.sqrt(vy0 * vy0 + 2 * g * h0)) / g;
    const tApex = vy0 > 0 ? vy0 / g : 0;
    const H = vy0 > 0 ? h0 + vy0 * vy0 / (2 * g) : h0;
    const vyLand = vy0 - g * T;
    return {
      method: 'analytic',
      T: T,
      R: vx0 * T,
      H: H,
      tApex: tApex,
      vLand: Math.hypot(vx0, vyLand),
      vxLand: vx0,
      vyLand: vyLand
    };
  }

  /** 無阻力時任一時刻的解析解 */
  function idealState(p, t) {
    const s0 = initialState(p);
    return {
      t: t,
      x: s0.vx * t,
      y: p.h0 + s0.vy * t - 0.5 * p.g * t * t,
      vx: s0.vx,
      vy: s0.vy - p.g * t
    };
  }

  /** 無阻力拋物線上的 n + 1 個取樣點 [[x, y, t], ...] */
  function idealPath(p, n) {
    n = n || 200;
    const T = ideal(p).T;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const s = idealState(p, T * i / n);
      pts.push([s.x, i === n ? 0 : s.y, s.t]);
    }
    return pts;
  }

  /** 加速度：重力 (0, −g) 加上與速度方向相反、大小 (k/m) v² 的空氣阻力 */
  function accel(p, vx, vy) {
    const k = dragOf(p);
    const v = Math.hypot(vx, vy);
    return [-k * v * vx, -p.g - k * v * vy];
  }

  /** 四階 Runge–Kutta 走一步 h（回傳新狀態，不改動 s） */
  function rk4(p, s, h) {
    const a1 = accel(p, s.vx, s.vy);
    const vx2 = s.vx + 0.5 * h * a1[0], vy2 = s.vy + 0.5 * h * a1[1];
    const a2 = accel(p, vx2, vy2);
    const vx3 = s.vx + 0.5 * h * a2[0], vy3 = s.vy + 0.5 * h * a2[1];
    const a3 = accel(p, vx3, vy3);
    const vx4 = s.vx + h * a3[0], vy4 = s.vy + h * a3[1];
    const a4 = accel(p, vx4, vy4);
    return {
      t: s.t + h,
      x: s.x + h / 6 * (s.vx + 2 * vx2 + 2 * vx3 + vx4),
      y: s.y + h / 6 * (s.vy + 2 * vy2 + 2 * vy3 + vy4),
      vx: s.vx + h / 6 * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]),
      vy: s.vy + h / 6 * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1])
    };
  }

  /**
   * 已知 f(s) > 0 而 f(rk4(s, h)) ≤ 0，用二分法在 (0, h] 內找出 f 由正變為非正的步長 σ，
   * 回傳該時刻的狀態（用來精確求出落地點與最高點）。
   */
  function refine(p, s, h, f) {
    let lo = 0, hi = h;
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi);
      if (f(rk4(p, s, mid)) > 0) lo = mid; else hi = mid;
    }
    return rk4(p, s, hi);
  }
  const fy = function (s) { return s.y; };
  const fvy = function (s) { return s.vy; };

  /** 數值積分的預設步長：理想飛行時間的千分之一，限制在 0.1 ms 到 10 ms 之間 */
  function stepFor(p) {
    const T = ideal(p).T;
    if (!(T > 0)) return 1e-3;
    return Math.min(1e-2, Math.max(1e-4, T / 1000));
  }

  function onGround(s) { return s.y <= 0 && s.vy <= 0; }

  /**
   * 把狀態 s 往前推進 dt 秒（原地修改 s），子步長不超過 opts.hmax。
   * 若 opts.trail 是陣列，每個子步的 [x, y, t] 都會推入其中。
   * 一碰到地面（y = 0）就停在精確的落地點並回傳 true；否則回傳 false。
   */
  function advance(p, s, dt, opts) {
    opts = opts || {};
    const h = opts.hmax || stepFor(p);
    const trail = opts.trail;
    if (onGround(s)) return true;
    let rem = dt;
    while (rem > 1e-12) {
      const hh = Math.min(h, rem);
      const n = rk4(p, s, hh);
      if (n.y < 0) {
        const land = refine(p, s, hh, fy);
        land.y = 0;
        Object.assign(s, land);
        if (trail) trail.push([s.x, s.y, s.t]);
        return true;
      }
      Object.assign(s, n);
      if (trail) trail.push([s.x, s.y, s.t]);
      rem -= hh;
    }
    return false;
  }

  /**
   * 從發射一路積分到落地。回傳飛行時間 T、射程 R、最大高度 H（離地）、
   * 到達最高點的時刻 tApex、落地速度，以及軌跡取樣點 points = [[x, y, t], ...]。
   */
  function simulate(p, opts) {
    opts = opts || {};
    const h = opts.dt || stepFor(p);
    const maxSteps = opts.maxSteps || 400000;
    let s = initialState(p);
    const pts = [[s.x, s.y, s.t]];
    let H = s.y, tApex = 0;
    if (onGround(s)) {
      return { method: 'numeric', T: 0, R: 0, H: H, tApex: 0, vLand: Math.hypot(s.vx, s.vy), vxLand: s.vx, vyLand: s.vy, points: pts };
    }
    for (let i = 0; i < maxSteps; i++) {
      const n = rk4(p, s, h);
      if (s.vy > 0 && n.vy <= 0) {
        const top = refine(p, s, h, fvy);
        if (top.y > H) { H = top.y; tApex = top.t; }
      }
      if (n.y < 0) {
        const land = refine(p, s, h, fy);
        land.y = 0;
        pts.push([land.x, 0, land.t]);
        return {
          method: 'numeric',
          T: land.t, R: land.x, H: H, tApex: tApex,
          vLand: Math.hypot(land.vx, land.vy), vxLand: land.vx, vyLand: land.vy,
          points: pts
        };
      }
      s = n;
      if (s.y > H) { H = s.y; tApex = s.t; }
      pts.push([s.x, s.y, s.t]);
    }
    return { method: 'numeric', T: NaN, R: NaN, H: H, tApex: tApex, vLand: NaN, points: pts };
  }

  /** 預測結果：無阻力用解析解，有阻力用數值解 */
  function predict(p) {
    if (dragOf(p) === 0) {
      const r = ideal(p);
      r.points = idealPath(p, 240);
      return r;
    }
    return simulate(p);
  }

  /** 射程（只要數字，不保留軌跡點） */
  function rangeOf(p, numeric) {
    if (!numeric && dragOf(p) === 0) return ideal(p).R;
    const h = stepFor(p) * 2.5; // RK4 整體誤差正比於 h^4，找最佳角時這樣已非常足夠
    return simulate(p, { dt: h }).R;
  }

  /**
   * 射程最大的仰角。
   * 無阻力時有解析解：tan θ* = v0 / √(v0² + 2 g h0)，R_max = (v0/g) √(v0² + 2 g h0)；
   * 有阻力（或 opts.numeric）時以黃金分割搜尋在 0°～90° 之間找最大射程。
   */
  function optimalAngle(p, opts) {
    opts = opts || {};
    if (!opts.numeric && dragOf(p) === 0) {
      const root = Math.sqrt(p.v0 * p.v0 + 2 * p.g * p.h0);
      return { theta: Math.atan2(p.v0, root) / DEG, R: p.v0 * root / p.g, method: 'analytic' };
    }
    const tol = opts.tol || 1e-3;
    const phi = (Math.sqrt(5) - 1) / 2;
    const R = function (th) { return rangeOf(Object.assign({}, p, { theta: th }), true); };
    let a = 0, b = 90;
    let c = b - phi * (b - a), d = a + phi * (b - a);
    let fc = R(c), fd = R(d);
    while (b - a > tol) {
      if (fc > fd) { b = d; d = c; fd = fc; c = b - phi * (b - a); fc = R(c); }
      else { a = c; c = d; fc = fd; d = a + phi * (b - a); fd = R(d); }
    }
    const th = 0.5 * (a + b);
    return { theta: th, R: R(th), method: 'numeric' };
  }

  /** 單位質量的力學能 E/m = ½ v² + g y（J/kg，以地面為重力位能零點） */
  function energyPerMass(p, s) {
    return 0.5 * (s.vx * s.vx + s.vy * s.vy) + p.g * s.y;
  }

  /** 終端速率 v_t = √(g m / k)（無阻力時為無限大） */
  function terminalSpeed(p) {
    const k = dragOf(p);
    return k > 0 ? Math.sqrt(p.g / k) : Infinity;
  }

  const api = {
    G_PRESETS: G_PRESETS,
    initialState: initialState,
    ideal: ideal,
    idealState: idealState,
    idealPath: idealPath,
    accel: accel,
    rk4: rk4,
    stepFor: stepFor,
    advance: advance,
    simulate: simulate,
    predict: predict,
    rangeOf: rangeOf,
    optimalAngle: optimalAngle,
    energyPerMass: energyPerMass,
    terminalSpeed: terminalSpeed
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ProjectileCore = api;
})(this);
