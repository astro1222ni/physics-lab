/* coriolis-core.js — 「科氏力與大氣的運動」的物理核心（與畫面無關，Node 可直接 require）
 *
 * 一、轉盤：無摩擦的水平轉盤（半徑 R），在盤上某點以某速度推出一顆球。
 *     從外面看（慣性座標）球走直線；站在盤上看（轉動座標，與盤一起轉）是曲線，
 *     轉動座標裡的加速度剛好是科氏加速度 −2Ω×v' 加上離心加速度 −Ω×(Ω×r')。
 *     推出的瞬間，球也帶著發射點隨盤轉動的速度 Ω×r（發射點不在中心時）。
 * 二、地球上的風（f 平面）：在緯度 φ 附近的一小片大氣，水平運動方程式
 *       dv/dt = −(1/ρ)∇p − f k̂×v − k v，  f = 2Ω sin φ（科氏參數），k 為地面摩擦係數。
 *     氣壓場可選：沒有氣壓差、平直等壓線（均勻的氣壓梯度）、圓形的低氣壓或高氣壓（高斯形）。
 *     均勻氣壓梯度有解析解（以複數 w = u + iv）：w(t) = w∞ + (w0 − w∞) e^{−(k+if)t}，w∞ = G/(k + if)。
 *     其餘用四階 Runge–Kutta 積分。
 * 座標：x 向東、y 向北（公尺、秒）；轉盤的 x、y 以公尺計，Ω > 0 表示從上往下看逆時針轉（和北半球一樣）。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CoriolisCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const OMEGA = 7.2921159e-5;          // 地球自轉角速度（rad/s，相對恆星；IERS）
  const RHO = 1.2;                      // 地面附近的空氣密度（kg/m³）
  const DEG = Math.PI / 180;
  const HPA = 100;                      // 1 hPa = 100 Pa
  const KM100 = 1e5;                    // 100 km（m）
  const P0 = 101300;                    // 遠處的氣壓（Pa，只影響讀數）
  const SIGMA = 300e3;                  // 低／高氣壓的大小（高斯分布的標準差，m）

  /** 科氏參數 f = 2Ω sin φ（1/s） */
  function coriolisParam(latDeg) { return 2 * OMEGA * Math.sin(latDeg * DEG); }
  /** 慣性振盪的週期 2π/|f|（s）；赤道上為無限大 */
  function inertialPeriod(latDeg) { const f = Math.abs(coriolisParam(latDeg)); return f > 0 ? 2 * Math.PI / f : Infinity; }

  // ======================= 氣壓場 =======================
  /** field：{ type: 'none'|'uniform'|'low'|'high', G（均勻場：每 100 km 幾 hPa）, dp（低／高氣壓中心與遠處的氣壓差 hPa）, sigma（m） }
   *  均勻場的等壓線東西走向，北邊氣壓低（氣壓梯度力指向北）。 */
  function pressure(F, x, y) {
    switch (F.type) {
      case 'uniform': return P0 - F.G * HPA / KM100 * y;
      case 'low': case 'high': {
        const s = F.sigma || SIGMA, e = Math.exp(-(x * x + y * y) / (2 * s * s));
        return P0 + (F.type === 'low' ? -1 : 1) * F.dp * HPA * e;
      }
      default: return P0;
    }
  }
  /** 氣壓梯度 ∇p（Pa/m） */
  function gradP(F, x, y) {
    switch (F.type) {
      case 'uniform': return [0, -F.G * HPA / KM100];
      case 'low': case 'high': {
        const s = F.sigma || SIGMA, e = Math.exp(-(x * x + y * y) / (2 * s * s));
        const a = (F.type === 'low' ? 1 : -1) * F.dp * HPA * e / (s * s);   // −dp·e·(−x/s²) 的係數
        return [a * x, a * y];
      }
      default: return [0, 0];
    }
  }
  /** 地轉風速 |∇p| / (ρ|f|)（m/s）；f = 0 時為 Infinity，沒有氣壓梯度時為 0 */
  function geostrophicSpeed(F, x, y, latDeg) {
    const g = gradP(F, x, y), m = Math.hypot(g[0], g[1]);
    if (m === 0) return 0;
    const f = Math.abs(coriolisParam(latDeg));
    return f > 0 ? m / (RHO * f) : Infinity;
  }
  /** 三種力（每公斤的力＝加速度，m/s²）：氣壓梯度力、科氏力、摩擦力 */
  function forces(P, s) {
    const g = gradP(P.field, s.x, s.y);
    const f = coriolisParam(P.lat);
    return {
      pgf: [-g[0] / RHO, -g[1] / RHO],
      cor: [f * s.v, -f * s.u],
      fri: [-P.k * s.u, -P.k * s.v]
    };
  }
  function deriv(P, s) {
    const F = forces(P, s);
    return { x: s.u, y: s.v, u: F.pgf[0] + F.cor[0] + F.fri[0], v: F.pgf[1] + F.cor[1] + F.fri[1] };
  }
  /** 四階 Runge–Kutta 一步。P = { lat, k, field }，s = { x, y, u, v } */
  function step(P, s, dt) {
    const a = deriv(P, s);
    const b = deriv(P, { x: s.x + a.x * dt / 2, y: s.y + a.y * dt / 2, u: s.u + a.u * dt / 2, v: s.v + a.v * dt / 2 });
    const c = deriv(P, { x: s.x + b.x * dt / 2, y: s.y + b.y * dt / 2, u: s.u + b.u * dt / 2, v: s.v + b.v * dt / 2 });
    const d = deriv(P, { x: s.x + c.x * dt, y: s.y + c.y * dt, u: s.u + c.u * dt, v: s.v + c.v * dt });
    return {
      x: s.x + dt / 6 * (a.x + 2 * b.x + 2 * c.x + d.x), y: s.y + dt / 6 * (a.y + 2 * b.y + 2 * c.y + d.y),
      u: s.u + dt / 6 * (a.u + 2 * b.u + 2 * c.u + d.u), v: s.v + dt / 6 * (a.v + 2 * b.v + 2 * c.v + d.v)
    };
  }
  /** 從 s0 積分到 tEnd（s），每 dt 一步，回傳 [{t, x, y, u, v}] */
  function integrate(P, s0, tEnd, dt) {
    dt = dt || 60;
    const out = [Object.assign({ t: 0 }, s0)];
    let s = s0, t = 0;
    while (t < tEnd - 1e-9) {
      const h = Math.min(dt, tEnd - t);
      s = step(P, s, h); t += h;
      out.push(Object.assign({ t: t }, s));
    }
    return out;
  }

  // ---------- 複數小工具（均勻氣壓梯度的解析解） ----------
  const cx = function (re, im) { return { re: re, im: im }; };
  const cmul = function (a, b) { return cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re); };
  const cdiv = function (a, b) { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
  const csub = function (a, b) { return cx(a.re - b.re, a.im - b.im); };
  const cexp = function (a) { const m = Math.exp(a.re); return cx(m * Math.cos(a.im), m * Math.sin(a.im)); };
  /** 均勻氣壓梯度（或沒有氣壓差）時的解析解：時間 t 的位置與速度。 */
  function analytic(P, s0, t) {
    const g = gradP(P.field, 0, 0);
    const G = cx(-g[0] / RHO, -g[1] / RHO);
    const f = coriolisParam(P.lat), k = P.k;
    const w0 = cx(s0.u, s0.v);
    const lam = cx(k, f);
    if (Math.abs(k) < 1e-15 && Math.abs(f) < 1e-15) {
      return { x: s0.x + s0.u * t + 0.5 * G.re * t * t, y: s0.y + s0.v * t + 0.5 * G.im * t * t, u: s0.u + G.re * t, v: s0.v + G.im * t };
    }
    const winf = cdiv(G, lam);
    const E = cexp(cx(-k * t, -f * t));
    const d = csub(w0, winf);
    const w = cx(winf.re + d.re * E.re - d.im * E.im, winf.im + d.re * E.im + d.im * E.re);
    const z = cdiv(cmul(d, csub(cx(1, 0), E)), lam);
    return { x: s0.x + winf.re * t + z.re, y: s0.y + winf.im * t + z.im, u: w.re, v: w.im };
  }
  /** 均勻氣壓梯度下最後的穩定風：速度、風速、吹向低壓的角度（度） */
  function steadyWind(P) {
    const g = gradP(P.field, 0, 0);
    const G = cx(-g[0] / RHO, -g[1] / RHO);
    const f = coriolisParam(P.lat), k = P.k;
    if (Math.abs(k) < 1e-15 && Math.abs(f) < 1e-15) return null;
    const w = cdiv(G, cx(k, f));
    return { u: w.re, v: w.im, speed: Math.hypot(w.re, w.im), angle: Math.atan2(k, Math.abs(f)) / DEG };
  }
  /** 風吹向低壓的角度（度）：風向與等壓線的夾角，正值＝偏向低壓那一側；沒有風或沒有梯度時為 null */
  function crossAngle(F, s) {
    const g = gradP(F, s.x, s.y), gm = Math.hypot(g[0], g[1]), vm = Math.hypot(s.u, s.v);
    if (gm === 0 || vm < 1e-9) return null;
    const c = -(s.u * g[0] + s.v * g[1]) / (gm * vm);
    return Math.asin(Math.max(-1, Math.min(1, c))) / DEG;
  }
  /** 風向偏離氣壓梯度力方向的角度（度）：正值＝往右偏（順時針），範圍 −180～180 */
  function deflection(F, s) {
    const g = gradP(F, s.x, s.y), gm = Math.hypot(g[0], g[1]), vm = Math.hypot(s.u, s.v);
    if (gm === 0 || vm < 1e-9) return null;
    const a = Math.atan2(-g[1], -g[0]), b = Math.atan2(s.v, s.u);
    let d = (a - b) / DEG;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }
  /** 每公斤的動能＋氣壓位能 ½v² + p/ρ（沒有摩擦時守恆：科氏力不作功） */
  function energy(F, s) { return 0.5 * (s.u * s.u + s.v * s.v) + pressure(F, s.x, s.y) / RHO; }
  /** 繞原點的絕對角動量 r·v_θ + f r²/2（圓形氣壓場、沒有摩擦時守恆） */
  function absAngMom(latDeg, s) { return s.x * s.v - s.y * s.u + 0.5 * coriolisParam(latDeg) * (s.x * s.x + s.y * s.y); }

  // ======================= 追蹤一團空氣（頁面與任務證明共用） =======================
  const TWO_PI = 2 * Math.PI;
  function wrapPi(a) { while (a > Math.PI) a -= TWO_PI; while (a <= -Math.PI) a += TWO_PI; return a; }
  /** 放出一團空氣：P = { lat, k, field }（放出時的設定，之後不變），位置 x、y（m），初速 u、v（m/s） */
  function parcel(P, x, y, u, v) {
    const s = { x: x, y: y, u: u, v: v };
    const sp = Math.hypot(u, v);
    const vg0 = geostrophicSpeed(P.field, x, y, P.lat);
    return {
      P: { lat: P.lat, k: P.k, field: Object.assign({}, P.field) },
      s: s, t: 0,
      r0: Math.hypot(x, y), v0: sp, dir0: sp > 1e-9 ? Math.atan2(v, u) : null,
      wind: 0,          // 位置繞氣壓中心（原點）轉過的角度（rad，逆時針為正）
      turn: 0,          // 速度方向轉過的角度（rad，逆時針為正）
      loopT: null,      // 速度方向第一次轉滿一圈的時間（s）
      minR: Math.hypot(x, y), vmax: sp,
      maxOff: 0,        // 進到中心 30 km 之前，速度與「指向中心」的方向最大夾角（度；直直衝向中心時為 0）
      dirDev: 0,        // 速度方向與初速方向的最大差（度）
      spdErr: vg0 > 0 && isFinite(vg0) ? Math.abs(sp - vg0) / vg0 : null   // 風速與當地地轉風速的最大相對差
    };
  }
  /** 讓空氣前進 dtTotal 秒（每步最多 h 秒），同時更新統計 */
  function advance(p, dtTotal, h) {
    h = h || 60;
    let left = dtTotal;
    while (left > 1e-9) {
      const dt = Math.min(h, left);
      const a = p.s, b = step(p.P, a, dt);
      // 繞中心的角度（離中心 5 km 內不計，避免穿過中心時跳動）
      const ra = Math.hypot(a.x, a.y), rb = Math.hypot(b.x, b.y);
      if (ra > 5e3 && rb > 5e3) p.wind += wrapPi(Math.atan2(b.y, b.x) - Math.atan2(a.y, a.x));
      // 速度方向轉過的角度
      const sa = Math.hypot(a.u, a.v), sb = Math.hypot(b.u, b.v);
      if (sa > 1e-6 && sb > 1e-6) {
        const before = p.turn;
        p.turn += wrapPi(Math.atan2(b.v, b.u) - Math.atan2(a.v, a.u));
        if (p.loopT == null && Math.abs(p.turn) >= TWO_PI) {
          const fa = Math.abs(before), fb = Math.abs(p.turn);
          p.loopT = p.t + dt * (TWO_PI - fa) / (fb - fa);
        }
      }
      p.s = b; p.t += dt; left -= dt;
      p.minR = Math.min(p.minR, rb);
      p.vmax = Math.max(p.vmax, sb);
      if (sb > 0.3 && rb > 1e3 && p.minR > 30e3) {   // 進到中心 30 km 之前
        const c = -(b.x * b.u + b.y * b.v) / (rb * sb);
        p.maxOff = Math.max(p.maxOff, Math.acos(Math.max(-1, Math.min(1, c))) / DEG);
      }
      if (p.dir0 != null && sb > 1e-9) p.dirDev = Math.max(p.dirDev, Math.abs(wrapPi(Math.atan2(b.v, b.u) - p.dir0)) / DEG);
      if (p.spdErr != null) {
        const vg = geostrophicSpeed(p.P.field, b.x, b.y, p.P.lat);
        if (vg > 0 && isFinite(vg)) p.spdErr = Math.max(p.spdErr, Math.abs(sb - vg) / vg);
      }
    }
    return p;
  }
  /** 任務用的快照（單位：時間 h、距離 km、角度度、摩擦 ×10⁻⁵ s⁻¹） */
  function snapshot(p) {
    const s = p.s, F = p.P.field;
    const vg = geostrophicSpeed(F, s.x, s.y, p.P.lat);
    return {
      t: p.t / 3600, lat: p.P.lat, k: p.P.k * 1e5, field: F.type, G: F.G, dp: F.dp,
      speed: Math.hypot(s.u, s.v), vg: isFinite(vg) ? vg : null, v0: p.v0,
      alpha: crossAngle(F, s), deflect: deflection(F, s),
      r: Math.hypot(s.x, s.y) / 1e3, r0: p.r0 / 1e3, minR: p.minR / 1e3,
      winding: p.wind / TWO_PI, turns: p.turn / TWO_PI, loopT: p.loopT == null ? null : p.loopT / 3600,
      maxOff: p.maxOff, dirDev: p.dirDev, spdErr: p.spdErr, vmax: p.vmax
    };
  }

  // ======================= 轉盤 =======================
  /** T = { omega（rad/s，正＝逆時針）, v0（m/s）, aim（度，0＝正對目標 +x）, r0（發射點到中心的距離 m，在 −x 方向）, R（m） }
   *  回傳 { P0, V（慣性座標的初速，含發射點隨盤轉動的速度）, T（離開盤面的時間）, exit（轉動座標的落點）, landDeg（落點方位角，目標在 0°）, miss（度） } */
  function turntable(T) {
    const R = T.R || 1;
    const a = T.aim * DEG;
    const P0 = [-T.r0, 0];
    const V = [T.v0 * Math.cos(a), T.v0 * Math.sin(a) - T.omega * T.r0];   // Ω ẑ × (−r0 x̂) = −Ω r0 ŷ
    // |P0 + V t| = R
    const A = V[0] * V[0] + V[1] * V[1], B = 2 * (P0[0] * V[0] + P0[1] * V[1]), C = P0[0] * P0[0] + P0[1] * P0[1] - R * R;
    let t = Infinity;
    if (A > 1e-15) t = (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A);
    const res = { R: R, omega: T.omega, P0: P0, V: V, T: t, exit: null, landDeg: null, miss: null, inertialDeg: null };
    if (isFinite(t)) {
      const pi = [P0[0] + V[0] * t, P0[1] + V[1] * t];
      const pr = toRotating(pi, T.omega, t);
      res.exit = pr;
      res.inertialDeg = Math.atan2(pi[1], pi[0]) / DEG;
      res.landDeg = Math.atan2(pr[1], pr[0]) / DEG;
      res.miss = res.landDeg;
    }
    return res;
  }
  /** 慣性座標的點 → 轉動座標（盤在 t 時已轉了 Ωt） */
  function toRotating(p, omega, t) {
    const c = Math.cos(-omega * t), s = Math.sin(-omega * t);
    return [c * p[0] - s * p[1], s * p[0] + c * p[1]];
  }
  /** 轉盤上的球在時間 t 的位置：{ inertial, rotating } */
  function turntableAt(res, t) {
    const pi = [res.P0[0] + res.V[0] * t, res.P0[1] + res.V[1] * t];
    return { inertial: pi, rotating: toRotating(pi, res.omega, t) };
  }
  /** 轉動座標裡的速度（解析）：v' = R(−Ωt)(V − Ω×P) */
  function rotatingVelocity(res, t) {
    const p = [res.P0[0] + res.V[0] * t, res.P0[1] + res.V[1] * t];
    const w = res.omega;
    const vi = [res.V[0] + w * p[1], res.V[1] - w * p[0]];   // V − Ω ẑ × p
    return toRotating(vi, w, t);
  }
  /** 要打中目標（從中心發射）該往前瞄多少度：Ω R / v0 */
  function aimToHit(omega, v0, R) { return omega * (R || 1) / v0 / DEG; }

  return {
    OMEGA: OMEGA, RHO: RHO, DEG: DEG, P0: P0, SIGMA: SIGMA, HPA: HPA, KM100: KM100,
    coriolisParam: coriolisParam, inertialPeriod: inertialPeriod,
    pressure: pressure, gradP: gradP, geostrophicSpeed: geostrophicSpeed, forces: forces, deriv: deriv, step: step, integrate: integrate,
    analytic: analytic, steadyWind: steadyWind, crossAngle: crossAngle, deflection: deflection, energy: energy, absAngMom: absAngMom,
    parcel: parcel, advance: advance, snapshot: snapshot,
    turntable: turntable, toRotating: toRotating, turntableAt: turntableAt, rotatingVelocity: rotatingVelocity, aimToHit: aimToHit
  };
});
