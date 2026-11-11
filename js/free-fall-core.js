/*
 * free-fall-core.js — 「自由落體與斜面上的運動」課本實驗的物理核心（與畫面無關，可單獨測試）
 *
 * 實驗（選修物理Ⅰ 第 2 章 實驗一）分三部分：
 *   ① 打點計時器相鄰點痕的時間：拉動紙帶 T 秒、數點痕 N 個，Δt = T/(N − 1)。
 *   ② 物體在斜面上的運動：軌道一端墊高形成斜面，計時器在頂端，紙帶繫在滑車尾部，滑車由靜止下滑。
 *   ③ 自由落體：計時器垂直架設，紙帶下端接重物，重物由靜止落下。
 *   ②③ 都從第 0 點起每隔 n 個點畫一條線，記錄各計數點的 t、x，求平均速度（中點時刻的速度）與平均加速度。
 *
 * 單位約定（SI）：長度 m、時間 s、質量 kg、力 N、空氣阻力係數 k 為 kg/m（阻力 F = k v²）。
 * t = 0 為放開物體的瞬間；x 為物體由起點沿運動方向的位移（斜面為沿軌道向下，自由落體為向下）。
 *
 * 運動方程式（沿運動方向為正，物體由靜止出發，所以速度永遠 ≥ 0）：
 *   m a = m g_∥ − F_摩擦 − k v²
 *   斜面：g_∥ = g sinθ，F_摩擦 = μ m g cosθ（軌道的滾動摩擦）＋ f（紙帶穿過計時器的摩擦）
 *   自由落體：g_∥ = g，F_摩擦 = f
 * 令 g0 = g_∥ − F_摩擦/m（沒有空氣阻力時的加速度）、κ = k/m，則 a = g0 − κ v²，解析解：
 *   κ = 0：x = ½ g0 t²，v = g0 t
 *   κ > 0：終端速度 v_T = √(g0/κ)，u = t √(g0 κ)，v = v_T tanh u，x = ln(cosh u)/κ，a = g0 / cosh² u
 * 起動條件：g0 > 0（靜摩擦係數取與動摩擦相同；g0 ≤ 0 時物體留在原地）。
 * 紙帶的質量、計時器打點的瞬間衝擊（平均成固定的 f）、軌道的彎曲都不計。g = 9.8 m/s²。
 */
(function (root) {
  'use strict';

  const G = 9.8;
  const L_TRACK = 1.20;   // 滑車軌道長（m），墊高 h 時 sinθ = h / L_TRACK
  const D_INCLINE = 0.80; // 滑車由起點滑到擋板的距離（m）
  const D_FALL = 0.90;    // 重物由起點落到軟墊的距離（m）
  const TAPE_LEN = 1.00;  // 紙帶「折一段約 100 公分長」

  // ---------- 數學小工具 ----------
  /** ln(cosh u)：小 u 用 log1p(2 sinh²(u/2)) 避免相消誤差，大 u 用漸近式避免溢位 */
  function logCosh(u) {
    u = Math.abs(u);
    if (u > 20) return u + Math.log1p(Math.exp(-2 * u)) - Math.LN2;
    const s = Math.sinh(u / 2);
    return Math.log1p(2 * s * s);
  }
  /** acosh(e^y)（y ≥ 0）：acosh(1 + z) = log1p(z + √(z(2 + z)))，z = e^y − 1 */
  function acoshExp(y) {
    if (y <= 0) return 0;
    if (y > 20) return y + Math.log1p(Math.sqrt(1 - Math.exp(-2 * y))) ;
    const z = Math.expm1(y);
    return Math.log1p(z + Math.sqrt(z * (2 + z)));
  }

  // ---------- 受力與加速度 ----------
  /**
   * p = { mode: 'incline' | 'fall', h（墊高，m）, L（軌道長，預設 1.20 m）, m（滑車或重物質量，kg）,
   *       mu（軌道滾動摩擦係數，只用於斜面）, f（紙帶摩擦力，N）, k（空氣阻力係數，kg/m）, g }
   * 傳回 { sin, cos, theta, gPar（g sinθ 或 g）, g0（無空氣阻力時的加速度）, kappa = k/m, vT, moves, ideal（g sinθ 或 g）}
   */
  function forces(p) {
    const g = p.g || G;
    const m = p.m;
    const f = Math.max(0, p.f || 0);
    const k = Math.max(0, p.k || 0);
    let sin = 1, cos = 0, theta = Math.PI / 2, mu = 0;
    if (p.mode === 'incline') {
      const L = p.L || L_TRACK;
      sin = Math.max(0, Math.min(1, (p.h || 0) / L));
      cos = Math.sqrt(1 - sin * sin);
      theta = Math.asin(sin);
      mu = Math.max(0, p.mu || 0);
    }
    const gPar = g * sin;
    const fr = mu * m * g * cos + f;        // 沿斜面（或鉛直）的摩擦力合計
    const g0 = gPar - fr / m;
    const kappa = k / m;
    const moves = g0 > 1e-12;
    return {
      g: g, m: m, sin: sin, cos: cos, theta: theta, mu: mu, f: f, k: k,
      gPar: gPar, friction: fr, g0: g0, kappa: kappa,
      vT: moves && kappa > 0 ? Math.sqrt(g0 / kappa) : Infinity,
      moves: moves, ideal: gPar
    };
  }

  /** 一次運動（解析解）：由靜止放開，走完距離 D（擋板或軟墊）為止 */
  function makeMotion(p, D) {
    const F = forces(p);
    if (D == null) D = p.mode === 'incline' ? D_INCLINE : D_FALL;
    const mo = { F: F, g0: F.g0, kappa: F.kappa, moves: F.moves, D: D, tEnd: Infinity, vEnd: 0 };
    if (!F.moves) { mo.tEnd = 0; return mo; }
    mo.tEnd = tAtX(mo, D);
    mo.vEnd = vAt(mo, mo.tEnd);
    return mo;
  }

  /** 位移 x(t)（t 限制在 [0, tEnd]，之後停在終點） */
  function xAt(mo, t) {
    if (!mo.moves || t <= 0) return 0;
    const tt = Math.min(t, mo.tEnd);
    if (mo.kappa === 0) return 0.5 * mo.g0 * tt * tt;
    const u = tt * Math.sqrt(mo.g0 * mo.kappa);
    return logCosh(u) / mo.kappa;
  }
  /** 速度 v(t)（撞到終點之後為 0） */
  function vAt(mo, t) {
    if (!mo.moves || t <= 0 || t > mo.tEnd) return 0;
    if (mo.kappa === 0) return mo.g0 * t;
    const r = Math.sqrt(mo.g0 * mo.kappa);
    return Math.sqrt(mo.g0 / mo.kappa) * Math.tanh(t * r);
  }
  /** 加速度 a(t) = g0 − κ v² = g0 / cosh²(u) */
  function aAt(mo, t) {
    if (!mo.moves || t < 0 || t > mo.tEnd) return 0;
    if (mo.kappa === 0) return mo.g0;
    const c = Math.cosh(t * Math.sqrt(mo.g0 * mo.kappa));
    return mo.g0 / (c * c);
  }
  /** 到達位移 X 的時刻（反解 x(t)） */
  function tAtX(mo, X) {
    if (!mo.moves) return X <= 0 ? 0 : NaN;
    if (X <= 0) return 0;
    if (mo.kappa === 0) return Math.sqrt(2 * X / mo.g0);
    return acoshExp(mo.kappa * X) / Math.sqrt(mo.g0 * mo.kappa);
  }

  // ---------- 可重現的亂數 ----------
  function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gaussian(rand) {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  /** 第 j 個點專屬的常態亂數（同一條紙帶、同一點永遠相同：讀數誤差跟著那一點） */
  function dotNoise(seed, j) {
    const r = mulberry32(((seed >>> 0) ^ Math.imul(j + 1, 0x9E3779B1)) >>> 0);
    r(); r();
    return gaussian(r);
  }

  // ---------- 打點計時器與紙帶 ----------
  /**
   * 打點：計時器在放開前 tPre 秒啟動（之後每 dt 打一點），物體在 t = 0 放開，t = tEnd 撞到終點，
   * 終點之後計時器再打 tPost 秒才關掉。
   *   nStack：放開前（含 t = 0）打在起點、重疊在一起的點數
   *   phase：放開後第一點的時刻（0 < phase ≤ dt）
   *   dots：放開後、撞到終點之前打的點 [{ j（1 起算）, t, x }]
   *   nEnd：撞到終點之後重疊在終點的點數
   */
  function makeTape(mo, dt, tPre, tPost) {
    tPre = Math.max(0, tPre || 0);
    tPost = Math.max(0, tPost || 0);
    const nStack = Math.floor(tPre / dt + 1e-9) + 1;
    let phase = nStack * dt - tPre;
    if (phase < 1e-12) phase = dt;
    const dots = [];
    const tEnd = mo.moves ? mo.tEnd : 0;
    if (mo.moves) {
      for (let j = 1; ; j++) {
        const t = phase + (j - 1) * dt;
        if (t > tEnd + 1e-12 || j > 100000) break;
        dots.push({ j: j, t: t, x: xAt(mo, t) });
      }
    }
    const tLast = dots.length ? dots[dots.length - 1].t : phase - dt;
    const nEnd = mo.moves ? Math.max(0, Math.floor((tEnd + tPost - tLast) / dt + 1e-9)) : 0;
    return { dt: dt, tPre: tPre, tPost: tPost, phase: phase, nStack: mo.moves ? nStack : nStack + Math.floor(tPost / dt + 1e-9), dots: dots, nEnd: nEnd, tEnd: tEnd, D: mo.moves ? mo.D : 0 };
  }

  /** 放開後第 j 個點（j ≥ 1）；不存在傳回 null */
  function dotAt(tape, j) { return j >= 1 && j <= tape.dots.length ? tape.dots[j - 1] : null; }

  /**
   * 自動選「第 0 點」：第一個和前一點（或起點的重疊點痕）都分得開的點。
   * gap：兩點至少要相距多少才看得清楚（預設 1.2 mm，點痕直徑約 1 mm）。
   */
  function firstClearDot(tape, gap) {
    gap = gap == null ? 0.0012 : gap;
    let prev = 0;
    for (let i = 0; i < tape.dots.length; i++) {
      const d = tape.dots[i];
      if (d.x - prev >= gap && d.x >= gap) return d.j;
      prev = d.x;
    }
    return tape.dots.length ? tape.dots[tape.dots.length - 1].j : 1;
  }

  /** 計數點：從第 j0 個點起，每隔 n 個間隔取一點 → [{ i, j, t（真實時刻）, x }] */
  function countingPoints(tape, j0, n) {
    const out = [];
    for (let i = 0; ; i++) {
      const d = dotAt(tape, j0 + i * n);
      if (!d) break;
      out.push({ i: i, j: d.j, t: d.t, x: d.x });
    }
    return out;
  }

  /**
   * 用尺讀計數點的位置：第 0 點對齊尺的 0 刻度，其餘讀數 = 真實距離 + 讀數誤差（標準差 sigma，跟著每一點固定），
   * 再四捨五入到 res（res = 0 表示不取捨）。傳回各點讀數（m）。
   */
  function readPoints(pts, opts) {
    opts = opts || {};
    const sigma = opts.sigma || 0, res = opts.res || 0, seed = opts.seed || 1;
    if (!pts.length) return [];
    const x0 = pts[0].x;
    return pts.map(function (q, i) {
      if (i === 0) return 0;
      let x = q.x - x0;
      if (sigma > 0) x += sigma * dotNoise(seed, q.j);
      if (res > 0) x = Math.round(x / res) * res;
      return x;
    });
  }

  // ---------- 擬合 ----------
  /** 最小平方法直線 y = slope·x + intercept；n < 2 時傳回 null */
  function fitLine(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    if (n < 2) return null;
    let sx = 0, sy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
    const mx = sx / n, my = sy / n;
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - mx, dy = ys[i] - my;
      sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
    }
    if (!(sxx > 0)) return null;
    const slope = sxy / sxx;
    const intercept = my - slope * mx;
    let ss = 0;
    for (let i = 0; i < n; i++) { const r = ys[i] - (slope * xs[i] + intercept); ss += r * r; }
    const r2 = syy > 0 ? 1 - ss / syy : (ss <= 1e-30 ? 1 : 0);
    // 斜率的標準誤差（n > 2 時）
    const se = n > 2 ? Math.sqrt(ss / (n - 2) / sxx) : NaN;
    return { slope: slope, intercept: intercept, r2: r2, n: n, se: se };
  }

  /** 最小平方法二次曲線 y = c0 + c1 x + c2 x²；n < 3 時傳回 null */
  function fitQuad(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    if (n < 3) return null;
    // 以平均值為中心避免病態矩陣
    let mx = 0;
    for (let i = 0; i < n; i++) mx += xs[i];
    mx /= n;
    const S = [0, 0, 0, 0, 0], B = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const u = xs[i] - mx, y = ys[i];
      let p = 1;
      for (let k = 0; k <= 4; k++) { S[k] += p; if (k <= 2) B[k] += p * y; p *= u; }
    }
    const M = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]];
    const det3 = function (A) {
      return A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    };
    const D = det3(M);
    if (!(Math.abs(D) > 1e-300)) return null;
    const col = function (c) { return M.map(function (row, r) { return row.map(function (v, k) { return k === c ? B[r] : v; }); }); };
    const b0 = det3(col(0)) / D, b1 = det3(col(1)) / D, b2 = det3(col(2)) / D;
    // y = b0 + b1 (x − mx) + b2 (x − mx)²
    return { c0: b0 - b1 * mx + b2 * mx * mx, c1: b1 - 2 * b2 * mx, c2: b2, n: n };
  }

  /**
   * 課本的紙帶分析：計數點讀數 xs（m），相鄰計數點的時間 tau（s），第 0 點為 t = 0。
   *   位移 Δx_i = x_{i+1} − x_i；平均速度 v_i = Δx_i / τ，當作中點時刻 (i + ½)τ 的速度；
   *   平均加速度 a_i = (v_{i+1} − v_i)/τ，當作時刻 (i + 1)τ 的加速度。
   *   v–t 圖的最佳直線：斜率 = 加速度，截距 = 第 0 點的速度；x–t 圖用二次曲線擬合（a = 2c₂）。
   */
  function analyze(xs, tau) {
    const n = xs.length;
    const t = xs.map(function (_, i) { return i * tau; });
    const dx = [], v = [], tv = [], a = [], ta = [];
    for (let i = 0; i + 1 < n; i++) { dx.push(xs[i + 1] - xs[i]); v.push(dx[i] / tau); tv.push((i + 0.5) * tau); }
    for (let i = 0; i + 1 < v.length; i++) { a.push((v[i + 1] - v[i]) / tau); ta.push((i + 1) * tau); }
    const vfit = fitLine(tv, v);
    const xfit = fitQuad(t, xs);
    let aMean = NaN;
    if (a.length) aMean = a.reduce(function (s, q) { return s + q; }, 0) / a.length;
    return { n: n, tau: tau, t: t, x: xs.slice(), dx: dx, v: v, tv: tv, a: a, ta: ta, vfit: vfit, xfit: xfit, aMean: aMean, aFit: vfit ? vfit.slope : NaN };
  }

  // ---------- ① 計時器相鄰點痕的時間 ----------
  /**
   * 手拉紙帶的位置 s(t)（m）：速度 V(1 + A1 sin(ω1 t + φ1) + A2 sin(ω2 t + φ2))，A1 + A2 < 1 所以一直往前。
   * 由種子決定一組參數；傳回 { s(t), v(t) }。
   */
  function handPull(seed) {
    const r = mulberry32(seed || 7);
    const V = 0.18 + 0.08 * r();
    const A1 = 0.25 + 0.15 * r(), A2 = 0.1 + 0.15 * r();
    const w1 = 2.2 + 1.6 * r(), w2 = 5.5 + 3 * r();
    const p1 = 2 * Math.PI * r(), p2 = 2 * Math.PI * r();
    return {
      V: V,
      v: function (t) { return t <= 0 ? 0 : V * (1 + A1 * Math.sin(w1 * t + p1) + A2 * Math.sin(w2 * t + p2)); },
      s: function (t) {
        if (t <= 0) return 0;
        return V * (t + A1 * (Math.cos(p1) - Math.cos(w1 * t + p1)) / w1 + A2 * (Math.cos(p2) - Math.cos(w2 * t + p2)) / w2);
      }
    };
  }

  /** 拉紙帶 T 秒（計時器與拉動同時開始、同時停止）：第一點在 phase（0 ≤ phase < dt），之後每 dt 一點；傳回點數 N */
  function dotsInPull(T, dt, phase) {
    phase = phase || 0;
    if (T < phase) return 0;
    return Math.floor((T - phase) / dt + 1e-9) + 1;
  }

  /** 碼錶讀數：慢 r1 秒才按下、慢 r2 秒才停止，顯示到 0.01 s（碼錶是無條件捨去） */
  function stopwatch(T, r1, r2) {
    return Math.max(0, Math.floor((T + (r2 || 0) - (r1 || 0)) * 100 + 1e-7) / 100);
  }

  /** 課本公式 Δt = T / (N − 1) */
  function dtFromCount(Tmeas, N) { return N >= 2 ? Tmeas / (N - 1) : NaN; }

  /** 百分誤差（%） */
  function percentError(meas, ref) { return (meas - ref) / ref * 100; }

  const api = {
    G: G, L_TRACK: L_TRACK, D_INCLINE: D_INCLINE, D_FALL: D_FALL, TAPE_LEN: TAPE_LEN,
    logCosh: logCosh, acoshExp: acoshExp,
    forces: forces, makeMotion: makeMotion, xAt: xAt, vAt: vAt, aAt: aAt, tAtX: tAtX,
    mulberry32: mulberry32, gaussian: gaussian, dotNoise: dotNoise,
    makeTape: makeTape, dotAt: dotAt, firstClearDot: firstClearDot, countingPoints: countingPoints, readPoints: readPoints,
    fitLine: fitLine, fitQuad: fitQuad, analyze: analyze,
    handPull: handPull, dotsInPull: dotsInPull, stopwatch: stopwatch, dtFromCount: dtFromCount, percentError: percentError
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FreeFallCore = api;
})(typeof window !== 'undefined' ? window : this);
