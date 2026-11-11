/*
 * e-over-m-core.js — 「電子的荷質比」物理核心（與畫面無關，可單獨以 Node 測試）
 *
 * 實驗：電子由電子槍經電位差 V 加速，垂直射入亥姆霍茲線圈的磁場 B，在低壓氣體玻璃球中做圓周運動，
 *       量出圓的直徑 D = 2r，由 e/m = 2V/(B²r²) 求出電子的荷質比。
 *
 * 座標（SI，m）：原點在玻璃球中心；x 向右、y 向上、z 由畫面射向觀察者（= 線圈軸，B 的方向）。
 * 單位：電壓 V、電流 A、磁場 T、長度 m、時間 s。
 *
 * 物理：
 *   1. 能量守恆：eV = ½mv² → v = √(2V·e/m)（300 V 時 v/c ≈ 0.034，相對論修正 < 0.03%，不計）。
 *   2. 磁力當向心力：evB = mv²/r → r = mv/(eB) = √(2V/(e/m)) / B。
 *   3. 亥姆霍茲線圈中心：B0 = (4/5)^{3/2} μ0NI/R = 8μ0NI/(√125·R)。
 *   4. 真實的線圈磁場（「含誤差」模式）：每個線圈視為 N 匝、半徑 R 的細圓線圈，離軸的磁場用
 *      第一類與第二類完全橢圓積分 K、E 精確計算（算術—幾何平均法），兩線圈疊加。
 *      中央平面（z = 0）上只有 B_z，而且離軸越遠略為變弱（亥姆霍茲線圈的二階項抵消，偏差 ∝ ρ^4）。
 *   5. 軌跡：理想均勻場用解析的圓／螺旋線；真實磁場用 Boris 法數值積分
 *      （純磁場時每一步是速度的純旋轉，速率精確守恆；每步速度方向最多轉 0.004 rad）。
 *   6. 視差：游標與標尺在玻璃球前方 d 處（z = d），眼睛在標尺前方 L 處。眼睛看到點 (x, y, z)
 *      對齊在標尺上的位置為 x' = x + (x_e − x)(d − z)/(L + d − z)（透視投影到標尺平面）。
 */
(function (root) {
  'use strict';

  const E_CHARGE = 1.602176634e-19;      // C
  const M_E = 9.1093837015e-31;          // kg
  const EM = E_CHARGE / M_E;             // 電子荷質比 ≈ 1.75882e11 C/kg
  const MU0 = 4 * Math.PI * 1e-7;        // 課本用的 μ0 = 4π × 10^-7 T·m/A
  const C_LIGHT = 299792458;
  const HH = Math.pow(0.8, 1.5);         // (4/5)^{3/2} = 8/√125 ≈ 0.715542

  /** 儀器尺寸（SI）。gun：電子槍出口；beamPlane 為電子束平面 z = 0。 */
  const APP = {
    N: 130,            // 每個線圈的匝數
    R: 0.150,          // 線圈半徑（= 兩線圈的間距）
    bulbR: 0.079,      // 玻璃球內半徑（外徑 16 cm）
    gun: { x: 0, y: -0.045 }, // 電子槍出口（電子沿 +x 射出）
    gunBox: { x0: -0.013, x1: 0, h: 0.0055, zh: 0.0055 }, // 電子槍槍管（出口左側的小方塊）
    scaleD: 0.095,     // 游標／標尺平面在電子束平面前方的距離 d
    eyeL: 0.35,        // 眼睛到標尺平面的距離 L
    scaleZero: -0.10,  // 標尺 0 刻度的 x 位置（球心在標尺 10.00 cm 處）
    cursorThick: 0.016 // 游標壓克力塊的厚度（前後兩條細線相距）
  };
  const GLOW_V = 25;   // 加速電壓低於此值時，電子能量不足以激發氦原子發光（看不到電子束）

  // ---------------- 基本公式 ----------------
  function helmholtzK(N, R) { return HH * MU0 * N / R; }            // B0 / I（T/A）
  function centreField(N, R, I) { return helmholtzK(N, R) * I; }    // 線圈連心線中點的磁場
  function singleLoopCentreAt(N, R, I, a) {                         // 單一線圈軸上距圓心 a 處
    return MU0 * N * I * R * R / (2 * Math.pow(a * a + R * R, 1.5));
  }
  function speed(V, em) { return Math.sqrt(2 * (em == null ? EM : em) * Math.max(0, V)); }
  function radius(V, B, em) {
    if (!(B > 0)) return Infinity;
    return speed(V, em) / ((em == null ? EM : em) * B);
  }
  function emFrom(V, B, r) { return 2 * V / (B * B * r * r); }
  function currentForRadius(V, r, N, R, em) { return speed(V, em) / ((em == null ? EM : em) * r) / helmholtzK(N, R); }
  function period(B, em) { return 2 * Math.PI / ((em == null ? EM : em) * B); }
  function cyclotronFreq(B, em) { return (em == null ? EM : em) * B / (2 * Math.PI); }
  /** 螺旋線：電子槍轉角 α（rad，速度與電子束平面的夾角） */
  function helix(V, B, alpha, em) {
    const r0 = radius(V, B, em);
    return { r: r0 * Math.cos(alpha), pitch: 2 * Math.PI * r0 * Math.sin(alpha), T: period(B, em) };
  }

  // ---------------- 完全橢圓積分（算術—幾何平均） ----------------
  /** 參數 m = k²（0 ≤ m < 1）：傳回 { K, E } */
  function ellipKE(m) {
    if (m < 0) m = 0;
    if (m >= 1) m = 1 - 1e-16;
    let a = 1, b = Math.sqrt(1 - m), c = Math.sqrt(m);
    let sum = 0.5 * m, pw = 0.5;
    for (let i = 0; i < 40; i++) {
      const an = 0.5 * (a + b), bn = Math.sqrt(a * b);
      c = 0.5 * (a - b);
      pw *= 2;
      sum += pw * c * c;
      a = an; b = bn;
      if (Math.abs(c) < 1e-17) break;
    }
    const K = Math.PI / (2 * a);
    return { K: K, E: K * (1 - sum) };
  }

  /**
   * 單一圓線圈（半徑 a、電流 I、1 匝，圓心在原點、軸為 z）在 (ρ, z) 的磁場 { Brho, Bz }。
   * Simpson 等人的封閉解：α² = a² + ρ² + z² − 2aρ，β² = a² + ρ² + z² + 2aρ，k² = 1 − α²/β²。
   */
  function loopField(a, I, rho, z) {
    const s = a * a + rho * rho + z * z;
    const al2 = s - 2 * a * rho, be2 = s + 2 * a * rho;
    if (al2 <= 1e-18) return { Brho: 0, Bz: 0 }; // 在導線上（奇異點）
    const be = Math.sqrt(be2);
    const m = 1 - al2 / be2;
    const ke = ellipKE(m);
    const C = MU0 * I / Math.PI;
    const Bz = C / (2 * al2 * be) * ((a * a - rho * rho - z * z) * ke.E + al2 * ke.K);
    let Brho = 0;
    if (rho > 1e-12) Brho = C * z / (2 * al2 * be * rho) * (s * ke.E - al2 * ke.K);
    return { Brho: Brho, Bz: Bz };
  }

  /**
   * 亥姆霍茲線圈在 (x, y, z) 的磁場 [Bx, By, Bz]。cfg：{ N, R, I, sep（線圈間距，預設 R）, uniform }
   * uniform = true 時傳回理想均勻場 (0, 0, B0)。
   */
  function fieldAt(x, y, z, cfg) {
    const N = cfg.N, R = cfg.R, I = cfg.I;
    if (cfg.uniform) return [0, 0, centreField(N, R, I)];
    const h = (cfg.sep == null ? R : cfg.sep) / 2;
    const rho = Math.sqrt(x * x + y * y);
    const f1 = loopField(R, N * I, rho, z - h), f2 = loopField(R, N * I, rho, z + h);
    const Bz = f1.Bz + f2.Bz, Br = f1.Brho + f2.Brho;
    if (rho < 1e-12) return [0, 0, Bz];
    return [Br * x / rho, Br * y / rho, Bz];
  }
  /** 中央平面上離軸 ρ 處的磁場與中心磁場的比值 */
  function midplaneRatio(rho, N, R) {
    const c = { N: N, R: R, I: 1 };
    return fieldAt(rho, 0, 0, c)[2] / fieldAt(0, 0, 0, c)[2];
  }

  // ---------------- 軌跡 ----------------
  function insideGun(p, g) {
    const b = APP.gunBox;
    return p[0] > g.x + b.x0 && p[0] < g.x + b.x1 + 0.0004 && Math.abs(p[1] - g.y) < b.h && Math.abs(p[2]) < b.zh;
  }
  /** 線段 p→q 與球面 |x| = Rb 的交點（p 在球內、q 在球外） */
  function sphereHit(p, q, Rb) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 50; i++) {
      const m = 0.5 * (lo + hi);
      const x = p[0] + (q[0] - p[0]) * m, y = p[1] + (q[1] - p[1]) * m, z = p[2] + (q[2] - p[2]) * m;
      if (x * x + y * y + z * z > Rb * Rb) hi = m; else lo = m;
    }
    return [p[0] + (q[0] - p[0]) * lo, p[1] + (q[1] - p[1]) * lo, p[2] + (q[2] - p[2]) * lo];
  }

  /**
   * 電子束的軌跡。opts：
   *   V（加速電壓）、I（線圈電流）、N、R、uniform（理想均勻場）、alpha（電子槍轉角，rad；0 = 在 xy 平面內）、
   *   em（荷質比，預設真值）、gun {x, y}、bulbR、maxTurns（螺旋時最多幾圈，預設 12）、maxAngle（每步最大轉角）
   * 傳回 { pts: [[x,y,z]…]（m）, closed（繞完一圈回到電子槍）, hitGlass, hitGun, end, turns,
   *        xMin, xMax, yMin, yMax, D（水平寬度 xMax − xMin）, maxDist（離球心最遠距離）, B0, r0, T }
   */
  function orbit(opts) {
    const N = opts.N || APP.N, R = opts.R || APP.R;
    const em = opts.em == null ? EM : opts.em;
    const g = opts.gun || APP.gun;
    const Rb = opts.bulbR || APP.bulbR;
    const alpha = opts.alpha || 0;
    const maxTurns = opts.maxTurns || 12;
    const v0 = speed(opts.V, em);
    const B0 = centreField(N, R, opts.I);
    const cfg = { N: N, R: R, I: opts.I, uniform: !!opts.uniform, sep: opts.sep };
    const out = { pts: [], closed: false, hitGlass: false, hitGun: false, end: null, turns: 0,
      xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity, zMin: Infinity, zMax: -Infinity,
      D: 0, maxDist: 0, B0: B0, r0: radius(opts.V, B0, em), T: B0 > 0 ? period(B0, em) : Infinity, v: v0 };
    if (!(v0 > 0)) return out;
    const bound = function (p) {
      if (p[0] < out.xMin) out.xMin = p[0]; if (p[0] > out.xMax) out.xMax = p[0];
      if (p[1] < out.yMin) out.yMin = p[1]; if (p[1] > out.yMax) out.yMax = p[1];
      if (p[2] < out.zMin) out.zMin = p[2]; if (p[2] > out.zMax) out.zMax = p[2];
      const d = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
      if (d > out.maxDist) out.maxDist = d;
    };
    let p = [g.x, g.y, 0];
    let v = [v0 * Math.cos(alpha), 0, v0 * Math.sin(alpha)];
    out.pts.push(p.slice()); bound(p);
    const maxAngle = opts.maxAngle || 0.004;
    const qm = -em; // 電子：q/m = −e/m
    let ang = 0;    // 垂直分量的速度方向累計轉過的角度
    const limitAng = alpha === 0 ? 2 * Math.PI : maxTurns * 2 * Math.PI;
    // 沒有磁場（或很弱）時沿直線前進：每步最多 1 mm
    const maxStep = 0.001;
    let steps = 0;
    const MAXSTEPS = 400000;
    let sampleEvery = 1, sinceSample = 0;
    if (B0 > 0) {
      const stepsPerTurn = 2 * Math.PI / maxAngle;
      sampleEvery = Math.max(1, Math.round(stepsPerTurn / 720));
    }
    while (steps++ < MAXSTEPS) {
      const B = fieldAt(p[0], p[1], p[2], cfg);
      const Bm = Math.sqrt(B[0] * B[0] + B[1] * B[1] + B[2] * B[2]);
      const w = em * Bm; // 角頻率
      let dt = w > 0 ? maxAngle / w : maxStep / v0;
      if (v0 * dt > maxStep) dt = maxStep / v0;
      // 最後一步剛好停在一圈（2π）
      let last = false;
      if (alpha === 0 && w > 0 && ang + w * dt >= limitAng) { dt = (limitAng - ang) / w; last = true; }
      // Boris 旋轉：t = (q/m) B dt/2
      const tx = qm * B[0] * dt / 2, ty = qm * B[1] * dt / 2, tz = qm * B[2] * dt / 2;
      const t2 = tx * tx + ty * ty + tz * tz;
      const sx = 2 * tx / (1 + t2), sy = 2 * ty / (1 + t2), sz = 2 * tz / (1 + t2);
      const px = v[0] + (v[1] * tz - v[2] * ty), py = v[1] + (v[2] * tx - v[0] * tz), pz = v[2] + (v[0] * ty - v[1] * tx);
      const nv = [v[0] + (py * sz - pz * sy), v[1] + (pz * sx - px * sz), v[2] + (px * sy - py * sx)];
      // 位置用前後速度的平均（純旋轉時是弦，與圓的誤差 ~ (轉角)²/8）
      const q = [p[0] + 0.5 * (v[0] + nv[0]) * dt, p[1] + 0.5 * (v[1] + nv[1]) * dt, p[2] + 0.5 * (v[2] + nv[2]) * dt];
      ang += w * dt;
      v = nv;
      if (q[0] * q[0] + q[1] * q[1] + q[2] * q[2] >= Rb * Rb) {
        const h = sphereHit(p, q, Rb);
        out.pts.push(h); bound(h);
        out.hitGlass = true; out.end = h;
        break;
      }
      p = q;
      if (ang > Math.PI && insideGun(p, g)) {
        out.pts.push(p.slice()); bound(p);
        out.hitGun = true; out.end = p.slice();
        break;
      }
      if (++sinceSample >= sampleEvery || last) { out.pts.push(p.slice()); bound(p); sinceSample = 0; }
      if (last) { out.closed = true; out.end = p.slice(); break; }
      if (alpha !== 0 && ang >= limitAng) { out.end = p.slice(); break; }
    }
    out.turns = ang / (2 * Math.PI);
    out.D = out.xMax - out.xMin;
    // 轉角 0：繞了將近一圈後回到電子槍（打在槍管後端）也算完整的圓
    if (alpha === 0 && out.hitGun && ang > 1.6 * Math.PI) out.closed = true;
    return out;
  }

  /** 理想均勻場、電子槍轉角 0 的解析圓：圓心 (gx, gy + r)、半徑 r */
  function idealCircle(V, I, N, R, em) {
    const B = centreField(N || APP.N, R || APP.R, I);
    const r = radius(V, B, em);
    const g = APP.gun;
    return { cx: g.x, cy: g.y + r, r: r, B: B, top: g.y + 2 * r, maxDist: Math.abs(g.y + r) + r,
      fits: Math.abs(g.y + r) + r < APP.bulbR };
  }

  // ---------------- 視差（透視投影到標尺平面） ----------------
  /** 眼睛在 (xe, ye)，距標尺平面 L；標尺平面在 z = d。傳回點 (x, y, z) 看起來對齊的標尺平面座標 [x', y']。 */
  function project(x, y, z, eye) {
    if (!eye) return [x, y];
    const d = eye.d == null ? APP.scaleD : eye.d, L = eye.L == null ? APP.eyeL : eye.L;
    const k = (d - z) / (L + d - z);
    return [x + (eye.x - x) * k, y + (eye.y - y) * k];
  }
  /** 眼睛固定在一處時，標尺上看到的直徑與真實直徑的比值（電子束平面 z = 0） */
  function parallaxShrink(d, L) {
    d = d == null ? APP.scaleD : d; L = L == null ? APP.eyeL : L;
    return L / (L + d);
  }
  /** 以眼睛位置 xe 看去，軌跡最左與最右點在標尺平面上的位置 */
  function apparentEdges(pts, eye) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const q = project(pts[i][0], pts[i][1], pts[i][2], eye);
      if (q[0] < lo) lo = q[0];
      if (q[0] > hi) hi = q[0];
    }
    return { left: lo, right: hi };
  }

  // ---------------- 電表（含誤差） ----------------
  /** 數字電表讀數：真值 ×（1 + 校正誤差）後四捨五入到解析度 res */
  function meter(value, eps, res) {
    const v = value * (1 + (eps || 0));
    return Math.round(v / res + 1e-9) * res;
  }

  // ---------------- 數據分析 ----------------
  /** 通過原點的最小平方直線 y = kx */
  function fitOrigin(xs, ys) {
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < xs.length; i++) { sxy += xs[i] * ys[i]; sxx += xs[i] * xs[i]; syy += ys[i] * ys[i]; }
    if (!(sxx > 0)) return null;
    const k = sxy / sxx;
    let ssr = 0;
    for (let i = 0; i < xs.length; i++) { const e = ys[i] - k * xs[i]; ssr += e * e; }
    return { slope: k, n: xs.length, r2: syy > 0 ? 1 - ssr / syy : 1 };
  }
  /** 一般最小平方直線 y = a + bx */
  function fitLine(xs, ys) {
    const n = xs.length;
    if (n < 2) return null;
    let sx = 0, sy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
    const mx = sx / n, my = sy / n;
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    if (!(sxx > 0)) return null;
    const b = sxy / sxx;
    return { slope: b, intercept: my - b * mx, r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : 1 };
  }
  /**
   * 數據表分析。rows：[{ V（電表，V）, I（電表，A）, D（直徑，m）}]
   * 每一列：B = B0(I)、r = D/2、e/m = 2V/(B²r²)；整體：y = 2V 對 x = (Br)² 通過原點的最佳直線，斜率 = e/m。
   */
  function analyze(rows, N, R) {
    N = N || APP.N; R = R || APP.R;
    const list = rows.map(function (w) {
      const B = centreField(N, R, w.I), r = w.D / 2;
      const ok = B > 0 && r > 0 && w.V > 0;
      return { V: w.V, I: w.I, D: w.D, B: B, r: r, x: ok ? B * B * r * r : NaN, y: 2 * w.V, em: ok ? emFrom(w.V, B, r) : NaN, ok: ok };
    });
    const good = list.filter(function (w) { return w.ok; });
    let mean = NaN;
    if (good.length) mean = good.reduce(function (s, w) { return s + w.em; }, 0) / good.length;
    const fit = good.length ? fitOrigin(good.map(function (w) { return w.x; }), good.map(function (w) { return w.y; })) : null;
    return { rows: list, n: good.length, mean: mean, meanErr: mean / EM - 1, fit: fit, fitErr: fit ? fit.slope / EM - 1 : NaN };
  }

  // ---------------- 磁力線（3D 檢視用；在含軸的平面上描線） ----------------
  /**
   * 由 (x0, z0)（y = 0 平面）出發沿磁場方向描線（RK4，步長 ds），回到起點附近、離開範圍或碰到導線時停止。
   * 傳回 [[x, z]…]（m）。
   */
  function fieldLine(x0, z0, cfg, opts) {
    opts = opts || {};
    const ds = opts.ds || 0.002, maxLen = opts.maxLen || 2.0, box = opts.box || 0.4;
    const dir = function (x, z) {
      const B = fieldAt(x, 0, z, cfg);
      const m = Math.hypot(B[0], B[2]);
      return m > 0 ? [B[0] / m, B[2] / m] : [0, 0];
    };
    const pts = [[x0, z0]];
    let x = x0, z = z0, len = 0;
    while (len < maxLen) {
      const k1 = dir(x, z);
      const k2 = dir(x + 0.5 * ds * k1[0], z + 0.5 * ds * k1[1]);
      const k3 = dir(x + 0.5 * ds * k2[0], z + 0.5 * ds * k2[1]);
      const k4 = dir(x + ds * k3[0], z + ds * k3[1]);
      x += ds / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      z += ds / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      len += ds;
      pts.push([x, z]);
      if (Math.abs(x) > box || Math.abs(z) > box) break;
      // 太靠近導線（場的奇異點）
      const R = cfg.R, h = (cfg.sep == null ? R : cfg.sep) / 2;
      if (Math.hypot(Math.abs(x) - R, Math.abs(z) - h) < 0.006) break;
      if (len > 0.05 && Math.hypot(x - x0, z - z0) < ds * 0.9) { pts.push([x0, z0]); break; }
    }
    return pts;
  }

  const api = {
    E_CHARGE: E_CHARGE, M_E: M_E, EM: EM, MU0: MU0, C_LIGHT: C_LIGHT, HH: HH, APP: APP, GLOW_V: GLOW_V,
    helmholtzK: helmholtzK, centreField: centreField, singleLoopCentreAt: singleLoopCentreAt,
    speed: speed, radius: radius, emFrom: emFrom, currentForRadius: currentForRadius,
    period: period, cyclotronFreq: cyclotronFreq, helix: helix,
    ellipKE: ellipKE, loopField: loopField, fieldAt: fieldAt, midplaneRatio: midplaneRatio,
    orbit: orbit, idealCircle: idealCircle,
    project: project, parallaxShrink: parallaxShrink, apparentEdges: apparentEdges,
    meter: meter, fitOrigin: fitOrigin, fitLine: fitLine, analyze: analyze, fieldLine: fieldLine
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EOverMCore = api;
})(typeof window !== 'undefined' ? window : this);
