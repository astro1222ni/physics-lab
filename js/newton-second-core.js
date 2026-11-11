/*
 * newton-second-core.js — 牛頓第二定律（力學車實驗）物理核心（與畫面無關，可單獨測試）
 *
 * 裝置：質量 M 的力學車放在軌道上，細繩經過軌道末端的滑輪，下端掛著質量 m 的吊掛物
 * （掛鉤＋槽碼）。繩子與滑輪的質量不計、滑輪無摩擦，繩子不可伸長且與軌道平行。
 * 軌道可以把「遠離滑輪的一端」墊高 θ（平衡摩擦力用），重力沿軌道的分量 Mg sinθ 指向滑輪。
 * 軌道對小車的滾動摩擦力 f = μN = μMg cosθ（與運動方向相反；靜止時最大靜摩擦也取 μN）。
 *
 * 單位約定（SI）：
 *   質量 M、m ........ kg
 *   角度 theta ........ rad（介面用度，轉換在頁面程式）
 *   距離 x ............ m，小車由起點朝滑輪方向的位移
 *   時間 t ............ s，t = 0 為放開小車（也是打點計時器打下第一點）的瞬間
 *   g ................. 9.8 m/s²
 *
 * 小車朝滑輪運動時（動摩擦），取小車＋吊掛物為系統：
 *   小車：T + Mg sinθ − f = Ma
 *   吊掛物：mg − T = ma
 *   ⇒ a = (mg + Mg sinθ − μMg cosθ) / (M + m)，  T = m(g − a) = Ma + f − Mg sinθ
 * 平衡摩擦力：取下吊鉤時 a = g(sinθ − μ cosθ)，tanθ = μ 時 a = 0（推一下就等速前進）。
 * 運動全部用等加速度的解析解；向前推的小車若減速到停止，之後靜止（此時 tanθ < μ，靜摩擦撐得住）。
 */
(function (root) {
  'use strict';

  const G = 9.8;
  const DEG = Math.PI / 180;

  /**
   * 受力與加速度。p = { M, m, mu, theta(rad), attached(預設 true), g }
   * 傳回小車朝滑輪運動時（動摩擦）的加速度 aMove 與張力 T，以及起動判斷 startsFromRest。
   */
  function dynamics(p) {
    const g = p.g || G, th = p.theta || 0, mu = p.mu || 0, M = p.M;
    const attached = p.attached !== false;
    const m = attached ? p.m : 0;
    const N = M * g * Math.cos(th);          // 軌道的正向力
    const f = mu * N;                         // 滾動摩擦力（運動時）
    const Wpar = M * g * Math.sin(th);        // 小車重力沿軌道的分量（指向滑輪）
    const W = m * g;                          // 吊掛物的重量
    const drive = W + Wpar;                   // 沿運動方向的驅動力（不含摩擦）
    const Mtot = M + m;
    const aMove = (drive - f) / Mtot;         // 運動中的加速度
    const T = attached ? m * (g - aMove) : 0; // 繩張力（= M·aMove + f − Wpar）
    // 由靜止起動：驅動力必須超過最大靜摩擦（這裡取 μN）
    const startsFromRest = drive > f * (1 + 1e-12) + 1e-15;
    return {
      g: g, M: M, m: m, mu: mu, theta: th, attached: attached, Mtot: Mtot,
      N: N, f: f, Wpar: Wpar, W: W, drive: drive, aMove: aMove, T: T,
      startsFromRest: startsFromRest,
      // 由靜止放開而不動時：靜摩擦力與驅動力平衡、張力 = mg
      staticFriction: startsFromRest ? NaN : drive,
      Tstatic: attached ? W : 0
    };
  }

  /** 由靜止放開時的加速度（不動則為 0） */
  function accel(p) {
    const d = dynamics(p);
    return d.startsFromRest ? d.aMove : 0;
  }

  /** 由靜止放開時的繩張力（不動時 T = mg） */
  function tension(p) {
    const d = dynamics(p);
    return d.startsFromRest ? d.T : d.Tstatic;
  }

  /** 平衡摩擦力的傾角：tanθ = μ（rad） */
  function balanceAngle(mu) { return Math.atan(mu); }

  /** 把軌道長 L 的一端墊高 h 時的傾角（rad）與反算 */
  function angleFromHeight(h, L) { return Math.asin(h / L); }
  function heightFromAngle(th, L) { return L * Math.sin(th); }

  /**
   * 課本近似「繩子拉小車的力 ≈ mg」的相對誤差 (mg − T)/mg；
   * 摩擦已平衡時恰好是 m/(M + m)。
   */
  function approxError(p) {
    const d = dynamics(p);
    if (!(d.W > 0)) return 0;
    return (d.W - tension(p)) / d.W;
  }

  /** 由 x = 0 以初速 v0、加速度 a 前進，到達位置 X 的時刻（到不了傳回 NaN）；數值穩定的寫法 */
  function timeToReach(v0, a, X) {
    if (X <= 0) return 0;
    const disc = v0 * v0 + 2 * a * X;
    if (disc < 0) return NaN;
    const den = v0 + Math.sqrt(disc);
    return den > 0 ? 2 * X / den : NaN;
  }

  /**
   * 一次實驗的運動（解析解）。p 同 dynamics；opts = { v0（推一下的初速，預設 0）, D（到擋板的距離）, hold（不動時計時器空打的時間）}
   * 傳回 { moves, a, v0, D, tEnd, reachedEnd, stopped, tStop, xStop, xEnd, vEnd }
   *   reachedEnd：撞上擋板；stopped：中途減速到停止。
   */
  function makeRun(p, opts) {
    opts = opts || {};
    const D = opts.D || 0.5;
    const v0 = Math.max(0, opts.v0 || 0);
    const d = dynamics(p);
    const base = { dyn: d, v0: v0, D: D };
    if (v0 === 0 && !d.startsFromRest) {
      // 拉不動：小車停在原地，計時器在同一點一直打
      const hold = opts.hold || 1.5;
      return Object.assign(base, { moves: false, a: 0, tEnd: hold, reachedEnd: false, stopped: true, tStop: 0, xStop: 0, xEnd: 0, vEnd: 0 });
    }
    const a = d.aMove;
    let tStop = Infinity, xStop = Infinity;
    if (a < 0) { tStop = v0 / -a; xStop = v0 * v0 / (2 * -a); }
    if (xStop >= D) {
      const tEnd = timeToReach(v0, a, D);
      const vEnd = v0 + a * tEnd;
      return Object.assign(base, { moves: true, a: a, tEnd: tEnd, reachedEnd: true, stopped: false, tStop: Infinity, xStop: Infinity, xEnd: D, vEnd: Math.max(0, vEnd) });
    }
    return Object.assign(base, { moves: true, a: a, tEnd: tStop, reachedEnd: false, stopped: true, tStop: tStop, xStop: xStop, xEnd: xStop, vEnd: 0 });
  }

  /** run 在時刻 t 的位置（t 限制在 [0, tEnd]） */
  function xAt(run, t) {
    if (!run.moves) return 0;
    const tt = Math.max(0, Math.min(t, run.tEnd));
    if (tt >= run.tStop) return run.xStop;
    return run.v0 * tt + 0.5 * run.a * tt * tt;
  }
  /** run 在時刻 t 的速度 */
  function vAt(run, t) {
    if (!run.moves || t >= run.tStop) return 0;
    const tt = Math.max(0, Math.min(t, run.tEnd));
    return run.v0 + run.a * tt;
  }
  /** run 抵達位置 X 的時刻（到不了傳回 NaN） */
  function tAtX(run, X) {
    if (!run.moves) return X <= 0 ? 0 : NaN;
    if (X > run.xEnd + 1e-12) return NaN;
    return timeToReach(run.v0, run.a, Math.min(X, run.xEnd));
  }

  // ---------- 可重現的亂數（紙帶點位置的讀數誤差） ----------
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

  /**
   * 打點計時器：每隔 1/freq 秒打一點，第一點在 t = 0（放開的瞬間）。
   * 傳回 [{ k, t, x }]，x 為該點在紙帶上與第一點的距離（m）。
   * opts.sigma > 0 時加入點位置的讀數誤差（常態分布，標準差 sigma m，種子 opts.seed）。
   */
  function dots(run, freq, opts) {
    opts = opts || {};
    const n = Math.floor(run.tEnd * freq + 1e-9);
    const out = [];
    const rand = opts.sigma > 0 ? mulberry32(opts.seed || 1) : null;
    let x0 = 0;
    for (let k = 0; k <= n; k++) {
      const t = k / freq;
      let x = xAt(run, t);
      if (rand) x += opts.sigma * gaussian(rand);
      if (k === 0) x0 = x;
      out.push({ k: k, t: t, x: x - x0 });
    }
    return out;
  }

  /** 最小平方法直線擬合 y = slope·x + intercept；n < 2 時傳回 null */
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
    return { slope: slope, intercept: intercept, r2: r2, n: n };
  }

  /**
   * 剪紙帶：從第一點起每 N 個間隔剪成一條（每條代表相同時間 τ = N/freq）。
   * 第 j 條長度 L = x[(j+1)N] − x[jN]，等於該段時間的平均速度 × τ，也就是中間時刻 (j + ½)τ 的瞬時速度 × τ。
   * 把紙條依序並排貼起來就是 v–t 圖；擬合 v = L/τ 對中間時刻的直線，斜率就是加速度。
   * tFitMax：只擬合在這個時刻以前結束的紙條（小車中途停下時用）。
   */
  function strips(dotList, N, freq, tFitMax) {
    const tau = N / freq;
    const J = Math.floor((dotList.length - 1) / N);
    const list = [];
    for (let j = 0; j < J; j++) {
      const a = dotList[j * N], b = dotList[(j + 1) * N];
      const L = b.x - a.x;
      list.push({ j: j, L: L, t0: a.t, t1: b.t, t: (a.t + b.t) / 2, v: L / tau });
    }
    const lim = tFitMax == null ? Infinity : tFitMax;
    const use = list.filter(function (s) { return s.t1 <= lim + 1e-9; });
    const fit = use.length >= 2 ? fitLine(use.map(function (s) { return s.t; }), use.map(function (s) { return s.v; })) : null;
    // 相鄰紙條的長度差 Δ(Δx) = aτ²（等加速度時每一對都相同）
    const diffs = [];
    for (let i = 1; i < use.length; i++) diffs.push(use[i].L - use[i - 1].L);
    return { tau: tau, list: list, used: use.length, fit: fit, diffs: diffs };
  }

  /**
   * 兩個光電閘：小車位移到 x1、x2 時，寬 w 的遮光片前緣開始遮住光閘。
   * 傳回遮光時間 dt1、dt2，兩閘之間的時間 t12（前緣到前緣），平均速度 v = w/dt 與 a = (v2² − v1²)/(2d)。
   * 遮光片沒有完全通過時對應的值為 NaN。
   */
  function gates(run, x1, x2, w) {
    const ta1 = tAtX(run, x1), tb1 = tAtX(run, x1 + w);
    const ta2 = tAtX(run, x2), tb2 = tAtX(run, x2 + w);
    const dt1 = tb1 - ta1, dt2 = tb2 - ta2;
    const v1 = w / dt1, v2 = w / dt2;
    return {
      ta1: ta1, tb1: tb1, ta2: ta2, tb2: tb2,
      dt1: dt1, dt2: dt2, t12: ta2 - ta1, v1: v1, v2: v2,
      a: (v2 * v2 - v1 * v1) / (2 * (x2 - x1)),
      aTime: (v2 - v1) / (((ta2 + tb2) - (ta1 + tb1)) / 2) // 用遮光的中間時刻：等加速度時恰好等於 a
    };
  }

  const api = {
    G: G,
    DEG: DEG,
    dynamics: dynamics,
    accel: accel,
    tension: tension,
    balanceAngle: balanceAngle,
    angleFromHeight: angleFromHeight,
    heightFromAngle: heightFromAngle,
    approxError: approxError,
    timeToReach: timeToReach,
    makeRun: makeRun,
    xAt: xAt,
    vAt: vAt,
    tAtX: tAtX,
    mulberry32: mulberry32,
    gaussian: gaussian,
    dots: dots,
    fitLine: fitLine,
    strips: strips,
    gates: gates
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NewtonSecondCore = api;
})(typeof window !== 'undefined' ? window : this);
