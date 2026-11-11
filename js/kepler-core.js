/*
 * kepler-core.js — 行星軌道與克卜勒定律的物理核心（與畫面無關，可單獨測試）
 *
 * 單位約定（SI）：長度 m、時間 s、速度 m/s；mu = GM（m³/s²）。
 * 中心天體固定在原點（質量遠大於衛星，二體問題化為一體問題），運動在 xy 平面上。
 *
 * 全部使用解析解（克卜勒問題），沒有數值積分、不會累積誤差：
 *   1. 由發射瞬間的位置 r 與速度 v 算出軌道要素（elementsFromState）：
 *        比能量 ε = v²/2 − μ/r，比角動量 h = x·vy − y·vx（z 分量，正值為逆時針），
 *        離心率向量 e = ((v² − μ/r) r − (r·v) v)/μ，半正焦弦 p = h²/μ，
 *        半長軸 a = −μ/(2ε)（橢圓 a > 0、雙曲線 a < 0、拋物線 a = ∞）。
 *   2. 任一時刻的位置由克卜勒方程式求得（stateAt）：
 *        橢圓   M = n(t − tp) = E − e sin E，        n = √(μ/a³)
 *        雙曲線 M = n(t − tp) = e sinh H − H，       n = √(μ/(−a)³)
 *        拋物線 t − tp = ½√(p³/μ)(D + D³/3)，D = tan(ν/2)（Barker 方程式，以卡爾達諾公式直接解）
 *      tp 是通過近心點（近日點／近地點）的時刻，ν 是真近點角（由近心點量起的角度）。
 */
(function (root) {
  'use strict';

  const TWO_PI = 2 * Math.PI;

  // ---------- 常數（SI） ----------
  const G = 6.6743e-11;
  const GM_SUN = 1.32712440018e20;   // m³/s²
  const GM_EARTH = 3.986004418e14;   // m³/s²
  const AU = 1.495978707e11;         // m
  const R_SUN = 6.957e8;             // m
  const R_EARTH = 6.371e6;           // m
  const DAY = 86400;                 // s
  const YEAR = 365.25 * DAY;         // s（儒略年）

  // 判斷軌道類型的容許誤差
  const E_CIRCLE = 1e-9;             // e 小於此值視為圓（近心點方向改用發射點方向）
  const E_PARABOLA = 1e-9;           // |e − 1| 小於此值視為拋物線

  // ---------- 基本公式 ----------
  /** 圓周速率 v = √(GM/r) */
  function circularSpeed(mu, r) { return Math.sqrt(mu / r); }
  /** 脫離速率 v = √(2GM/r) = √2 · v圓 */
  function escapeSpeed(mu, r) { return Math.sqrt(2 * mu / r); }
  /** 活力方程式（vis-viva）：v² = GM(2/r − 1/a)；a = Infinity 為拋物線 */
  function visViva(mu, r, a) { return Math.sqrt(Math.max(0, mu * (2 / r - (isFinite(a) ? 1 / a : 0)))); }
  /** 週期 T = 2π√(a³/GM)（克卜勒第三定律） */
  function period(mu, a) { return TWO_PI * Math.sqrt(a * a * a / mu); }
  /** 克卜勒第三定律的比值 T²/a³ = 4π²/(GM)：只與中心天體質量有關 */
  function keplerRatio(mu) { return 4 * Math.PI * Math.PI / mu; }
  /** 比能量（每單位質量的力學能）ε = v²/2 − GM/r */
  function specificEnergy(mu, x, y, vx, vy) { return 0.5 * (vx * vx + vy * vy) - mu / Math.hypot(x, y); }
  /** 比角動量（每單位質量）h = x·vy − y·vx，正值為逆時針 */
  function angularMomentum(x, y, vx, vy) { return x * vy - y * vx; }

  /** 把角度化成 (−π, π] */
  function wrapPi(a) {
    let x = (a + Math.PI) % TWO_PI;
    if (x <= 0) x += TWO_PI;
    return x - Math.PI;
  }

  /**
   * 發射狀態：起點距中心 r0、方位角 phi0（由 +x 軸逆時針量起），速率 v0，
   * 仰角 alpha（速度與「水平方向」的夾角；水平方向 = 垂直於半徑、逆時針的切線方向，alpha > 0 偏向外）。
   */
  function launchState(r0, phi0, v0, alpha) {
    const c = Math.cos(phi0), s = Math.sin(phi0);
    const ca = Math.cos(alpha), sa = Math.sin(alpha);
    return {
      x: r0 * c, y: r0 * s,
      vx: v0 * (ca * -s + sa * c),
      vy: v0 * (ca * c + sa * s)
    };
  }

  // ---------- 克卜勒方程式（有保護的牛頓法：永遠收斂） ----------
  /** 解橢圓的克卜勒方程式 E − e sin E = M（0 ≤ e < 1），傳回 E；M 先化到 (−π, π] */
  function solveKeplerE(M, e) {
    const Mw = wrapPi(M);
    const k = Math.round((M - Mw) / TWO_PI);
    let lo = -Math.PI, hi = Math.PI;
    let E = e < 0.8 ? Mw + e * Math.sin(Mw) : (Mw >= 0 ? Math.PI * 0.75 : -Math.PI * 0.75);
    for (let i = 0; i < 100; i++) {
      const f = E - e * Math.sin(E) - Mw;
      if (f > 0) hi = E; else lo = E;
      const fp = 1 - e * Math.cos(E);
      let En = E - f / fp;
      if (!(En > lo && En < hi)) En = 0.5 * (lo + hi);
      if (Math.abs(En - E) < 1e-15 * Math.max(1, Math.abs(E))) { E = En; break; }
      E = En;
    }
    return E + k * TWO_PI;
  }

  /** 解雙曲線的克卜勒方程式 e sinh H − H = M（e > 1），傳回 H */
  function solveKeplerH(M, e) {
    const b = Math.asinh(Math.abs(M) / Math.max(e - 1, 1e-300)) + 1;
    let lo = -b, hi = b;
    let H = Math.asinh(M / e);
    for (let i = 0; i < 200; i++) {
      const f = e * Math.sinh(H) - H - M;
      if (f > 0) hi = H; else lo = H;
      const fp = e * Math.cosh(H) - 1;
      let Hn = H - f / fp;
      if (!(Hn > lo && Hn < hi)) Hn = 0.5 * (lo + hi);
      if (Math.abs(Hn - H) < 1e-15 * Math.max(1, Math.abs(H))) { H = Hn; break; }
      H = Hn;
    }
    return H;
  }

  /** 解拋物線的 Barker 方程式 D + D³/3 = B，傳回 D = tan(ν/2)（卡爾達諾公式，取奇函數避免相消誤差） */
  function solveBarker(B) {
    if (B < 0) return -solveBarker(-B);
    const u = Math.cbrt(1.5 * B + Math.sqrt(2.25 * B * B + 1));
    return u - 1 / u;
  }

  // ---------- 軌道要素 ----------
  /**
   * 由位置與速度算出軌道要素。t = 0 是發射瞬間。傳回：
   *   mu, h（帶正負號）, dir（+1 逆時針／−1 順時針）, e, p, a, energy,
   *   omega（近心點方向角）, type（'circle'|'ellipse'|'parabola'|'hyperbola'）,
   *   rp, ra（橢圓）, T, n（平均角速度）, nu0（發射點的真近點角）, tp（通過近心點的時刻）
   */
  function elementsFromState(mu, x, y, vx, vy) {
    const r = Math.hypot(x, y), v2 = vx * vx + vy * vy;
    const h = angularMomentum(x, y, vx, vy);
    const rv = x * vx + y * vy;
    const k1 = v2 - mu / r;
    let ex = (k1 * x - rv * vx) / mu, ey = (k1 * y - rv * vy) / mu;
    let e = Math.hypot(ex, ey);
    const energy = 0.5 * v2 - mu / r;
    const p = h * h / mu;
    const dir = h >= 0 ? 1 : -1;
    let type;
    if (e < E_CIRCLE) type = 'circle';
    else if (Math.abs(e - 1) < E_PARABOLA) type = 'parabola';
    else type = e < 1 ? 'ellipse' : 'hyperbola';
    // 圓軌道沒有特定的近心點：取發射點方向為參考方向
    const omega = type === 'circle' ? Math.atan2(y, x) : Math.atan2(ey, ex);
    let a;
    if (type === 'parabola') a = Infinity;
    else if (type === 'circle') a = r; // 與 −μ/(2ε) 相同（差異在捨入誤差以內）
    else a = -mu / (2 * energy);
    const el = {
      mu: mu, h: h, dir: dir, e: e, p: p, a: a, energy: energy, omega: omega, type: type,
      rp: p / (1 + e), ra: e < 1 ? p / (1 - e) : Infinity,
      T: Infinity, n: 0, nu0: 0, tp: 0
    };
    if (e < 1 && type !== 'parabola') {
      el.n = Math.sqrt(mu / (a * a * a));
      el.T = TWO_PI / el.n;
      el.b = a * Math.sqrt(Math.max(0, 1 - e * e));
    } else if (type === 'hyperbola') {
      el.n = Math.sqrt(mu / (-a * -a * -a));
      el.b = -a * Math.sqrt(e * e - 1);
    } else {
      el.n = Math.sqrt(mu / (p * p * p)); // 拋物線：只用來換算時間
    }
    el.nu0 = type === 'circle' ? 0 : wrapPi(dir * (Math.atan2(y, x) - omega));
    el.tp = -timeFromPeriapsis(el, el.nu0);
    return el;
  }

  /** 由真近點角 ν 求「通過近心點後經過的時間」（橢圓傳回 (−T/2, T/2]） */
  function timeFromPeriapsis(el, nu) {
    const e = el.e;
    if (el.type === 'parabola') {
      const D = Math.tan(nu / 2);
      return 0.5 * Math.sqrt(el.p * el.p * el.p / el.mu) * (D + D * D * D / 3);
    }
    if (e < 1) {
      const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
      return (E - e * Math.sin(E)) / el.n;
    }
    const H = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
    return (e * Math.sinh(H) - H) / el.n;
  }

  /** 把近焦點座標（近心點在 +x）轉回實際座標：先依繞行方向翻轉 y，再轉 omega */
  function rotate(el, xp, yp) {
    const yq = el.dir * yp, c = Math.cos(el.omega), s = Math.sin(el.omega);
    return [c * xp - s * yq, s * xp + c * yq];
  }

  /**
   * t 時刻（由發射起算）的狀態：位置、速度、距離、速率、真近點角。解析解。
   */
  function stateAt(el, t) {
    const tau = t - el.tp, e = el.e, mu = el.mu;
    let xp, yp, vxp, vyp, r, nu;
    if (el.type === 'parabola') {
      const p = el.p;
      const D = solveBarker(tau * Math.sqrt(mu / (p * p * p)) * 2);
      const q = 1 + D * D, w = Math.sqrt(mu / p);
      r = 0.5 * p * q;
      xp = 0.5 * p * (1 - D * D); yp = p * D;
      vxp = -w * 2 * D / q; vyp = w * 2 / q;
      nu = 2 * Math.atan(D);
    } else if (e < 1) {
      const a = el.a, E = solveKeplerE(el.n * tau, e);
      const cE = Math.cos(E), sE = Math.sin(E), s1 = Math.sqrt(1 - e * e);
      r = a * (1 - e * cE);
      xp = a * (cE - e); yp = a * s1 * sE;
      const w = Math.sqrt(mu * a) / r;
      vxp = -w * sE; vyp = w * s1 * cE;
      nu = Math.atan2(s1 * sE, cE - e);
    } else {
      const A = -el.a, H = solveKeplerH(el.n * tau, e);
      const ch = Math.cosh(H), sh = Math.sinh(H), s1 = Math.sqrt(e * e - 1);
      r = A * (e * ch - 1);
      xp = A * (e - ch); yp = A * s1 * sh;
      const w = Math.sqrt(mu * A) / r;
      vxp = -w * sh; vyp = w * s1 * ch;
      nu = Math.atan2(s1 * sh, e - ch);
    }
    const P = rotate(el, xp, yp), V = rotate(el, vxp, vyp);
    return { t: t, x: P[0], y: P[1], vx: V[0], vy: V[1], r: r, v: Math.hypot(V[0], V[1]), nu: nu };
  }

  /** 軌道上真近點角 ν 處的位置（畫軌道用）：r = p/(1 + e cos ν) */
  function positionAtNu(el, nu) {
    const r = el.p / (1 + el.e * Math.cos(nu));
    const P = rotate(el, r * Math.cos(nu), r * Math.sin(nu));
    return { x: P[0], y: P[1], r: r };
  }

  /**
   * 畫軌道時的真近點角範圍：只取 r ≤ rMax 的部分。
   * 傳回 [ν1, ν2]；整個橢圓都在範圍內時為 [−π, π]。
   */
  function nuRange(el, rMax) {
    const e = el.e;
    let lim = Math.PI;
    if (e >= 1 || el.type === 'parabola') lim = Math.acos(Math.max(-1, -1 / e)) * (1 - 1e-6);
    if (e > 1e-12) {
      const c = (el.p / rMax - 1) / e;
      if (c > 1) return null; // 整條軌道都在 rMax 之外
      if (c > -1) lim = Math.min(lim, Math.acos(c));
    }
    return [-lim, lim];
  }

  /** (t0, t1] 之間通過近心點的次數（每次通過發一聲） */
  function periapsisPassages(el, t0, t1) {
    if (!(t1 > t0)) return 0;
    if (el.e < 1 && el.type !== 'parabola') {
      const k0 = Math.floor((t0 - el.tp) / el.T + 1e-12);
      const k1 = Math.floor((t1 - el.tp) / el.T + 1e-12);
      return Math.max(0, k1 - k0);
    }
    return el.tp > t0 + 1e-12 * Math.abs(el.tp) && el.tp <= t1 ? 1 : 0;
  }

  /** 下一次（t ≥ 0）通過近心點的時刻 */
  function nextPeriapsis(el, t) {
    if (el.e < 1 && el.type !== 'parabola') return el.tp + Math.ceil((t - el.tp) / el.T - 1e-12) * el.T;
    return el.tp >= t ? el.tp : null;
  }

  /**
   * 撞上半徑 R 的中心天體的時刻（t ≥ 0）；近心點距離 rp ≥ R 時永遠不會撞，傳回 null。
   * 撞擊點在 r 遞減經過 R 的地方：ν = −νc，cos νc = (p/R − 1)/e。
   */
  function crashTime(el, R) {
    if (!(el.rp < R) || el.e < 1e-12) return null;
    const nuc = Math.acos(Math.max(-1, Math.min(1, (el.p / R - 1) / el.e)));
    let t = el.tp + timeFromPeriapsis(el, -nuc);
    if (el.e < 1 && el.type !== 'parabola') {
      t -= Math.floor(t / el.T + 1e-12) * el.T;
      return Math.max(0, t);
    }
    return t >= -1e-9 * Math.max(1, Math.abs(el.tp)) ? Math.max(0, t) : null;
  }

  /** 克卜勒第二定律：t1 到 t2 之間半徑掃過的面積 = |h|·Δt/2（解析值） */
  function sweptArea(el, t1, t2) { return 0.5 * Math.abs(el.h) * (t2 - t1); }

  /** 由時間求「幾何參數」：橢圓為偏近點角 E、雙曲線為 H、拋物線為 D = tan(ν/2) */
  function anomalyAt(el, t) {
    const tau = t - el.tp;
    if (el.type === 'parabola') return solveBarker(2 * tau * Math.sqrt(el.mu / (el.p * el.p * el.p)));
    return el.e < 1 ? solveKeplerE(el.n * tau, el.e) : solveKeplerH(el.n * tau, el.e);
  }
  /** 由幾何參數求位置（純幾何：橢圓 x = a(cos E − e)、y = b sin E，雙曲線與拋物線類似） */
  function positionAtAnomaly(el, u) {
    let xp, yp;
    if (el.type === 'parabola') { xp = 0.5 * el.p * (1 - u * u); yp = el.p * u; }
    else if (el.e < 1) { xp = el.a * (Math.cos(u) - el.e); yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(u); }
    else { const A = -el.a; xp = A * (el.e - Math.cosh(u)); yp = A * Math.sqrt(el.e * el.e - 1) * Math.sinh(u); }
    const P = rotate(el, xp, yp);
    return { x: P[0], y: P[1] };
  }

  /**
   * 同一塊面積的幾何算法（與上式無關，用來驗證）：t1、t2 之間的軌道依幾何參數平均分成 n 段，
   * 以中心天體為頂點的細長三角形面積加總（鞋帶公式）。
   */
  function fanArea(el, t1, t2, n) {
    n = n || 400;
    const u1 = anomalyAt(el, t1), u2 = anomalyAt(el, t2);
    let A = 0, prev = positionAtAnomaly(el, u1);
    for (let i = 1; i <= n; i++) {
      const s = positionAtAnomaly(el, u1 + (u2 - u1) * i / n);
      A += prev.x * s.y - s.x * prev.y;
      prev = s;
    }
    return Math.abs(A) / 2;
  }

  /** 橢圓面積 πab */
  function ellipseArea(el) { return Math.PI * el.a * el.b; }

  const api = {
    TWO_PI: TWO_PI, G: G, GM_SUN: GM_SUN, GM_EARTH: GM_EARTH, AU: AU, R_SUN: R_SUN, R_EARTH: R_EARTH,
    DAY: DAY, YEAR: YEAR, E_CIRCLE: E_CIRCLE, E_PARABOLA: E_PARABOLA,
    circularSpeed: circularSpeed,
    escapeSpeed: escapeSpeed,
    visViva: visViva,
    period: period,
    keplerRatio: keplerRatio,
    specificEnergy: specificEnergy,
    angularMomentum: angularMomentum,
    wrapPi: wrapPi,
    launchState: launchState,
    solveKeplerE: solveKeplerE,
    solveKeplerH: solveKeplerH,
    solveBarker: solveBarker,
    elementsFromState: elementsFromState,
    timeFromPeriapsis: timeFromPeriapsis,
    stateAt: stateAt,
    positionAtNu: positionAtNu,
    nuRange: nuRange,
    periapsisPassages: periapsisPassages,
    nextPeriapsis: nextPeriapsis,
    crashTime: crashTime,
    sweptArea: sweptArea,
    anomalyAt: anomalyAt,
    positionAtAnomaly: positionAtAnomaly,
    fanArea: fanArea,
    ellipseArea: ellipseArea
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KeplerCore = api;
})(typeof window !== 'undefined' ? window : this);
