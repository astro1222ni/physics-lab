/*
 * faraday-core.js — 法拉第定律與冷次定律的物理核心（與畫面無關，可單獨測試）
 *
 * 單位約定（SI）：長度 m、時間 s、磁通量 Wb、電動勢 V、電流 A、力 N、能量 J。
 *
 * ── 模式 A：磁鐵與線圈 ──
 * 線圈軸沿 x 軸，中心在 x = 0，半徑 a、長度 COIL.len，N 匝均勻分布在線圈長度上。
 * 條形磁鐵沿 x 軸移動，中心在 xm。磁鐵以「兩極模型」描述：兩個磁極（磁荷 ±q）位在
 * 中心兩側 ±MAG.d 處，磁極磁通量 Φ0 = μ0 q（由 N 極發出的全部磁通量）。
 * 未翻轉時 N 極在 +x 端；翻轉（flipped）後 N 極在 −x 端。
 *
 * 單一線圈（半徑 a，位置 xl）的磁通量（取 +x 方向為正）＝把兩個磁極的磁場對線圈面積積分，
 * 再加上磁鐵內部（線圈套住磁鐵時）的磁通量，結果是連續的解析式：
 *   Φ_loop = (Φ0/2) [ g(xN − xl) − g(xS − xl) ],   g(u) = u / √(u² + a²)
 * 遠處時化為磁偶極的結果 Φ ≈ μ0 m a² / (2 d³)（m = q·2d）。
 * 整個線圈的「每匝平均磁通量」Φ̄ 是上式對 N 匝（沿線圈長度）取平均，也有解析式（見 coilFlux）。
 * 感應電動勢 ε = −N dΦ̄/dt = −N (dΦ̄/dxm) v，電流 I = ε / R（線圈自感忽略）。
 * 正負號：ε、I > 0 代表電流的環繞方向與 +x 成右手定則（自己產生的磁場在線圈內指向 +x）。
 *
 * ── 模式 B：導體棒在軌道上（俯視圖）──
 * 兩條平行軌道沿 x 方向、相距 L，左端（x = 0）接電阻 R；導體棒（質量 m）在 x 處垂直跨在軌道上。
 * 均勻磁場 Bz = ±B（+ 為出紙面、− 為入紙面）。迴路面積 L·x，取逆時針（法向量 +z）為正：
 *   Φ = Bz L x，  ε = −dΦ/dt = −Bz L v，  I = ε/R，  磁力 Fx = −B² L² v / R（永遠阻礙運動）
 * 外力的三種情況（解析解）：
 *   'const'   等速拉動：v = v0 不變，外力 F = B²L²v/R
 *   'force'   定力拉動：v = vt + (v0 − vt) e^(−t/τ)，vt = F R /(B²L²)
 *   'release' 給初速後放開（F = 0）：v = v0 e^(−t/τ)
 *   其中 τ = m R / (B² L²)。焦耳熱 Q = ∫ I² R dt 也用解析式計算。
 */
(function (root) {
  'use strict';

  const MU0 = 4e-7 * Math.PI;
  /** 磁鐵：長度 len、半厚 halfW、磁極到中心的距離 d、磁極磁通量 Phi0 */
  const MAG = { len: 0.10, halfW: 0.012, d: 0.042, Phi0: 4.0e-4 };
  /** 線圈：長度 len（N 匝均勻分布）、中心位置 xc */
  const COIL = { len: 0.04, xc: 0 };
  /** 等速通過：磁鐵中心從 −PASS_X 走到 +PASS_X（或反方向） */
  const PASS_X = 0.22;
  /** 來回振盪：xm = −OSC_A cos(2πft) */
  const OSC_A = 0.15;
  /** 拖曳的範圍 */
  const DRAG_X = 0.26;
  /** 模式 B：軌道長度、導體棒起點、最靠近電阻的位置 */
  const RAIL = { D: 2.0, x0: 0.3, xmin: 0.05 };

  // ======================= 模式 A：磁鐵與線圈 =======================

  function g(u, a) { return u / Math.sqrt(u * u + a * a); }

  /** 兩個磁極的位置：未翻轉時 N 在 +x 端 */
  function poles(xm, flipped) {
    const s = flipped ? -1 : 1;
    return { xN: xm + s * MAG.d, xS: xm - s * MAG.d };
  }

  /** 單一線圈（位置 xl、半徑 a）的磁通量（Wb，+x 為正） */
  function loopFlux(xm, xl, a, flipped) {
    const P = poles(xm, flipped);
    return MAG.Phi0 / 2 * (g(P.xN - xl, a) - g(P.xS - xl, a));
  }

  /**
   * S(xp) = ∫ g(xp − xl) dxl（xl 走過整個線圈長度）= √(u1² + a²) − √(u2² + a²)
   * u1 = xp − xc + h，u2 = xp − xc − h（h 為線圈半長）
   */
  function Sint(xp, a) {
    const h = COIL.len / 2;
    const u1 = xp - COIL.xc + h, u2 = xp - COIL.xc - h;
    return Math.sqrt(u1 * u1 + a * a) - Math.sqrt(u2 * u2 + a * a);
  }
  function dSint(xp, a) {
    const h = COIL.len / 2;
    return g(xp - COIL.xc + h, a) - g(xp - COIL.xc - h, a);
  }

  /** 線圈的每匝平均磁通量 Φ̄（Wb） */
  function coilFlux(xm, a, flipped) {
    const P = poles(xm, flipped);
    return MAG.Phi0 / (2 * COIL.len) * (Sint(P.xN, a) - Sint(P.xS, a));
  }
  /** dΦ̄/dxm（Wb/m），解析微分 */
  function coilFluxSlope(xm, a, flipped) {
    const P = poles(xm, flipped);
    return MAG.Phi0 / (2 * COIL.len) * (dSint(P.xN, a) - dSint(P.xS, a));
  }

  /** 磁極模型在子午面（x, y）上的磁場方向（只用於畫磁力線，任意比例） */
  function fieldAt(x, y, xm, flipped) {
    const P = poles(xm, flipped);
    let bx = 0, by = 0;
    [[P.xN, 1], [P.xS, -1]].forEach(function (p) {
      const dx = x - p[0], dy = y, r2 = dx * dx + dy * dy, r3 = r2 * Math.sqrt(r2);
      bx += p[1] * dx / r3;
      by += p[1] * dy / r3;
    });
    return [bx, by];
  }
  /** 子午面上的磁通函數 Ψ(x, ρ)：半徑 ρ 的圓盤（位置 x）上的磁通量；沿著磁力線不變 */
  function streamFn(x, rho, xm, flipped) {
    return loopFlux(xm, x, Math.max(rho, 1e-9), flipped);
  }

  /**
   * 磁力線（磁鐵座標：磁鐵中心在原點、未翻轉）。上半平面 n 條，相鄰兩條之間的磁通量相等，
   * 另加沿軸的一條。每條為點列 [[x, y], …]，方向由 N 極出發。下半平面由呼叫端鏡射。
   */
  function fieldLines(n, opts) {
    opts = opts || {};
    const step = opts.step || 0.002, xMax = opts.xMax || 0.9, yMax = opts.yMax || 0.6, r0 = 0.004;
    const xN = MAG.d, xS = -MAG.d;
    const lines = [];
    for (let k = 1; k <= n; k++) {
      const level = MAG.Phi0 * k / (n + 1);
      // 在 N 極周圍半徑 r0 的小圓上，用二分法找到磁通函數等於 level 的出發角
      let lo = 1e-4, hi = Math.PI - 1e-4;
      for (let it = 0; it < 60; it++) {
        const mid = (lo + hi) / 2;
        const v = streamFn(xN + r0 * Math.cos(mid), r0 * Math.sin(mid), 0, false);
        if (v < level) lo = mid; else hi = mid;
      }
      const th = (lo + hi) / 2;
      let x = xN + r0 * Math.cos(th), y = r0 * Math.sin(th);
      const pts = [[x, y]];
      const dir = function (px, py) {
        const b = fieldAt(px, py, 0, false), m = Math.hypot(b[0], b[1]) || 1;
        return [b[0] / m, b[1] / m];
      };
      for (let i = 0; i < 4000; i++) {
        const k1 = dir(x, y);
        const k2 = dir(x + k1[0] * step / 2, y + k1[1] * step / 2);
        const k3 = dir(x + k2[0] * step / 2, y + k2[1] * step / 2);
        const k4 = dir(x + k3[0] * step, y + k3[1] * step);
        x += step / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
        y += step / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
        pts.push([x, y]);
        if (Math.hypot(x - xS, y) < r0) break;
        if (Math.abs(x) > xMax || Math.abs(y) > yMax) break;
      }
      lines.push({ level: level, pts: pts });
    }
    return lines;
  }

  // ---------- 磁鐵的運動 ----------
  /** 等速通過：dir = +1 由左往右、−1 由右往左 */
  function passStart(dir) { return dir > 0 ? -PASS_X : PASS_X; }
  function passDuration(v) { return 2 * PASS_X / v; }
  function passState(t, v, dir) {
    const T = passDuration(v), tt = Math.min(Math.max(t, 0), T);
    return { x: passStart(dir) + dir * v * tt, v: t >= 0 && t < T ? dir * v : 0, done: t >= T };
  }
  /** 來回振盪：xm = −A cos(ωt)，從左端靜止出發，每次都穿過線圈 */
  function oscState(t, f) {
    const w = 2 * Math.PI * f;
    return { x: -OSC_A * Math.cos(w * t), v: OSC_A * w * Math.sin(w * t) };
  }

  /** 模式 A 的全部即時量 */
  function coilState(xm, v, p) {
    const phi = coilFlux(xm, p.a, p.flipped);
    const slope = coilFluxSlope(xm, p.a, p.flipped);
    const dphi = slope * v;                 // dΦ̄/dt
    const eps = -p.N * dphi;                // ε = −N dΦ̄/dt
    const I = eps / p.R;
    const force = I * p.N * slope;          // 線圈對磁鐵的力 F = I ∂(NΦ̄)/∂xm = −(N dΦ̄/dx)² v / R
    return { x: xm, v: v, phi: phi, slope: slope, dphi: dphi, eps: eps, I: I, force: force, power: eps * I };
  }

  /** 由磁鐵所在那一側看線圈的電流方向：'cw' 順時針、'ccw' 逆時針、null 無電流 */
  function circulation(I, xm) {
    if (Math.abs(I) < 1e-15) return null;
    const fromLeft = xm <= COIL.xc;
    // I > 0：磁場在線圈內指向 +x；從 −x 那側（左側）看是順時針
    return (I > 0) === fromLeft ? 'cw' : 'ccw';
  }
  /** 線圈靠近磁鐵那一端的感應磁極：'N'、'S' 或 null */
  function nearPole(I, xm) {
    if (Math.abs(I) < 1e-15) return null;
    const left = xm <= COIL.xc;
    // I > 0：感應磁場向 +x，從右端出來 → 右端 N、左端 S
    return left ? (I > 0 ? 'S' : 'N') : (I > 0 ? 'N' : 'S');
  }
  /** 線圈兩端的感應磁極 { left, right } */
  function coilPoles(I) {
    if (Math.abs(I) < 1e-15) return { left: null, right: null };
    return I > 0 ? { left: 'S', right: 'N' } : { left: 'N', right: 'S' };
  }

  /** 在 [x0, x1] 上找 |f| 的最大值（密集取樣後用黃金分割細修） */
  function maxAbs(f, x0, x1, n) {
    n = n || 2000;
    let best = 0, bi = 0;
    for (let i = 0; i <= n; i++) {
      const v = Math.abs(f(x0 + (x1 - x0) * i / n));
      if (v > best) { best = v; bi = i; }
    }
    let lo = x0 + (x1 - x0) * Math.max(0, bi - 1) / n, hi = x0 + (x1 - x0) * Math.min(n, bi + 1) / n;
    const gr = (Math.sqrt(5) - 1) / 2;
    for (let it = 0; it < 60; it++) {
      const c = hi - gr * (hi - lo), d = lo + gr * (hi - lo);
      if (Math.abs(f(c)) > Math.abs(f(d))) hi = d; else lo = c;
    }
    return Math.max(best, Math.abs(f((lo + hi) / 2)));
  }

  /** 等速通過的摘要（全部解析）：峰值電動勢、第一個脈衝的正負、前半程與整趟的電量 */
  function passSummary(p, v, dir) {
    const x0 = passStart(dir), xEnd = -x0;
    const slopeMax = maxAbs(function (x) { return coilFluxSlope(x, p.a, p.flipped); }, -PASS_X, PASS_X, 3000);
    const epsPeak = p.N * v * slopeMax;
    // 第一個脈衝：從起點出發後 |ε| 第一次超過峰值 10% 時的正負
    let firstSign = 0;
    for (let i = 0; i <= 4000; i++) {
      const x = x0 + (xEnd - x0) * i / 4000;
      const e = -p.N * coilFluxSlope(x, p.a, p.flipped) * dir * v;
      if (Math.abs(e) > 0.1 * epsPeak) { firstSign = e > 0 ? 1 : -1; break; }
    }
    const phi0 = coilFlux(x0, p.a, p.flipped), phiC = coilFlux(COIL.xc, p.a, p.flipped), phiE = coilFlux(xEnd, p.a, p.flipped);
    return {
      epsPeak: epsPeak, IPeak: epsPeak / p.R, firstSign: firstSign,
      phiMax: phiC,
      qHalf: -p.N * (phiC - phi0) / p.R,   // 從起點到磁鐵中心通過線圈中心
      qTotal: -p.N * (phiE - phi0) / p.R,  // 整趟（兩端磁通相同 → 0）
      duration: passDuration(v)
    };
  }
  /** 振盪一個週期內的峰值電動勢 */
  function oscPeak(p, f) {
    const per = 1 / f;
    return maxAbs(function (t) { const s = oscState(t, f); return p.N * coilFluxSlope(s.x, p.a, p.flipped) * s.v; }, 0, per / 2, 3000);
  }

  // ======================= 模式 B：導體棒 =======================

  /** 衍生量：τ、終端速度、B²L²/R */
  function rodDerived(p) {
    const k = p.B * p.B * p.L * p.L / p.R; // 阻尼係數：磁力 = −k v
    return { k: k, tau: p.m / k, vt: p.sub === 'force' ? p.F / k : 0 };
  }
  /**
   * 時刻 t 的狀態（解析解）。p = { sub, B, Bsign(+1 出紙面／−1 入紙面), L, R, m, v0, F, x0 }
   * 傳回 x、v、Φ、ε、I（逆時針為正）、磁力 Fb、外力 Fext、電功率 P、累積焦耳熱 heat、外力作功 work、動能 KE
   */
  function rodState(t, p) {
    const d = rodDerived(p), k = d.k, tau = d.tau;
    const x0 = p.x0 == null ? RAIL.x0 : p.x0;
    let x, v, Fext, heat, work;
    if (p.sub === 'const') {
      v = p.v0; x = x0 + p.v0 * t; Fext = k * p.v0;
      heat = k * p.v0 * p.v0 * t; work = Fext * p.v0 * t;
    } else {
      const F = p.sub === 'force' ? p.F : 0, vt = F / k, c = p.v0 - vt;
      const e1 = Math.exp(-t / tau), e2 = Math.exp(-2 * t / tau);
      v = vt + c * e1;
      x = x0 + vt * t + c * tau * (1 - e1);
      Fext = F;
      // Q = k ∫ v² dt = k [ vt² t + 2 vt c τ (1 − e^(−t/τ)) + c² (τ/2)(1 − e^(−2t/τ)) ]
      heat = k * (vt * vt * t + 2 * vt * c * tau * (1 - e1) + c * c * tau / 2 * (1 - e2));
      work = F * (x - x0);
    }
    const Bz = p.Bsign * p.B;
    const eps = -Bz * p.L * v;
    const I = eps / p.R;
    return {
      t: t, x: x, v: v, phi: Bz * p.L * x, dphi: Bz * p.L * v, eps: eps, I: I,
      Fb: -k * v, Fext: Fext, P: I * I * p.R, heat: heat, work: work, KE: 0.5 * p.m * v * v,
      tau: tau, vt: d.vt
    };
  }
  /** 導體棒到達位置 X 的時刻（沒有到達則傳回 Infinity） */
  function rodTimeTo(X, p, tMax) {
    tMax = tMax || 600;
    const f = function (t) { return rodState(t, p).x - X; };
    if (f(0) === 0) return 0;
    const sg = Math.sign(f(0));
    // 先往前找到變號的區間
    let tPrev = 0, dt = Math.max(1e-4, Math.min(0.05, rodDerived(p).tau / 20));
    let t = dt;
    while (t <= tMax) {
      if (Math.sign(f(t)) !== sg) break;
      tPrev = t; dt *= 1.15; t += dt;
    }
    if (t > tMax) return Infinity;
    let lo = tPrev, hi = t;
    for (let it = 0; it < 80; it++) { const m = (lo + hi) / 2; if (Math.sign(f(m)) === sg) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  /** 從上方看迴路的電流方向（I 以逆時針為正） */
  function rodCirculation(I) {
    if (Math.abs(I) < 1e-15) return null;
    return I > 0 ? 'ccw' : 'cw';
  }

  const api = {
    MU0: MU0, MAG: MAG, COIL: COIL, PASS_X: PASS_X, OSC_A: OSC_A, DRAG_X: DRAG_X, RAIL: RAIL,
    g: g, poles: poles, loopFlux: loopFlux, coilFlux: coilFlux, coilFluxSlope: coilFluxSlope,
    fieldAt: fieldAt, streamFn: streamFn, fieldLines: fieldLines,
    passStart: passStart, passDuration: passDuration, passState: passState, oscState: oscState,
    coilState: coilState, circulation: circulation, nearPole: nearPole, coilPoles: coilPoles,
    maxAbs: maxAbs, passSummary: passSummary, oscPeak: oscPeak,
    rodDerived: rodDerived, rodState: rodState, rodTimeTo: rodTimeTo, rodCirculation: rodCirculation
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FaradayCore = api;
})(typeof window !== 'undefined' ? window : this);
