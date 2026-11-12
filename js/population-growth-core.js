/*
 * population-growth-core.js — 「族群成長與掠食者–獵物」的生態學核心（與畫面無關；Node 可直接 require）
 *
 * 一、單一族群
 *   指數成長  dN/dt = rN            → N = N0·e^{rt}
 *   邏輯斯成長 dN/dt = rN(1 − N/K)  → N = K / (1 + (K/N0 − 1)·e^{−rt})
 *   隨機版本（Gillespie 演算法）：每個個體出生率 λ、死亡率 μ + (λ − μ)·N/K（邏輯斯）或 μ（指數），λ − μ = r，
 *   μ = M_FRAC·λ。期望值遵守上面的方程式，但小族群可能因為運氣不好而滅絕（從 N0 個開始、指數成長時滅絕機率 (μ/λ)^N0）。
 * 二、兩個物種（Lotka 1925、Volterra 1926）
 *   掠食者–獵物：dx/dt = a·x·(1 − x/K) − b·x·y − E·x，dy/dt = c·x·y − d·y − E·y（K = ∞ 時是原始模型；E 是兩種一起的捕撈）
 *     原始模型的守恆量 V = c·x − d'·ln x + b·y − a'·ln y（a' = a − E、d' = d + E），平衡點 (d'/c, a'/b)，
 *     小振幅週期 2π/√(a'·d')，一個週期的時間平均恰好等於平衡點。
 *   種間競爭：dN1/dt = r1·N1·(1 − (N1 + α12·N2)/K1)，dN2/dt = r2·N2·(1 − (N2 + α21·N1)/K2)
 *     四種結局由 K1 與 α12·K2、K2 與 α21·K1 的大小決定。
 * 時間單位：天（示意）；數量單位：個體。數值積分用 RK4。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PopCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const M_FRAC = 0.5;   // 隨機模型：死亡率 μ = 0.5·λ（λ − μ = r）

  // ---------- 單一族群：解析解 ----------
  function expo(N0, r, t) { return N0 * Math.exp(r * t); }
  function logistic(N0, r, K, t) {
    if (N0 <= 0) return 0;
    return K / (1 + (K / N0 - 1) * Math.exp(-r * t));
  }
  function rateExpo(N, r) { return r * N; }
  function rateLogistic(N, r, K) { return r * N * (1 - N / K); }
  function doublingTime(r) { return Math.LN2 / r; }
  /** 邏輯斯曲線的反曲點（N = K/2、成長最快）的時刻；N0 ≥ K/2 時傳回 NaN */
  function inflectionTime(N0, r, K) { return N0 < K / 2 ? Math.log(K / N0 - 1) / r : NaN; }
  /** N 到達某個值的時刻（邏輯斯；到不了傳回 NaN） */
  function timeToReach(N0, r, K, N) {
    if (!isFinite(K)) return N > N0 ? Math.log(N / N0) / r : NaN;
    if ((N - K) * (N0 - K) <= 0 && N !== K) return NaN;
    return Math.log((K / N0 - 1) / (K / N - 1)) / r;
  }

  // ---------- 亂數 ----------
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () { // mulberry32
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * 隨機的出生死亡過程（Gillespie）。o：{ N0, r, K（Infinity = 指數）, tEnd, rand, cap（族群上限，超過就停，預設 1e6）}
   * 傳回 { t: [], N: [], extinct, tExtinct }：每一次事件後的時刻與數量（數量多時每 every 天記一筆）
   */
  function gillespie(o) {
    const r = o.r, K = o.K, lam = r / (1 - M_FRAC), mu = M_FRAC * lam, rand = o.rand || Math.random;
    const cap = o.cap || 1e6, every = o.every || 0.01;
    let N = Math.round(o.N0), t = 0;
    const T = [0], NN = [N];
    let lastRec = 0;
    while (t < o.tEnd && N > 0 && N < cap) {
      const b = lam * N;
      const dper = isFinite(K) ? mu + (lam - mu) * N / K : mu;
      const d = Math.max(0, dper) * N;
      const tot = b + d;
      if (tot <= 0) break;
      t += -Math.log(1 - rand()) / tot;
      if (t > o.tEnd) { t = o.tEnd; break; }
      N += rand() * tot < b ? 1 : -1;
      if (N < 200 || t - lastRec >= every) { T.push(t); NN.push(N); lastRec = t; }
    }
    if (T[T.length - 1] < t) { T.push(t); NN.push(N); }
    return { t: T, N: NN, extinct: N === 0, tExtinct: N === 0 ? t : NaN, lam: lam, mu: mu };
  }
  /** 從 N0 個體開始、指數成長的隨機模型最後滅絕的機率 (μ/λ)^N0 */
  function extinctionProb(N0) { return Math.pow(M_FRAC, N0); }

  // ---------- 兩個物種 ----------
  /** 掠食者–獵物的參數：{ a, b, c, d, K（Infinity = 沒有負荷量）, E（捕撈）} */
  function lvDeriv(p, x, y, out) {
    const E = p.E || 0;
    const lim = isFinite(p.K) ? 1 - x / p.K : 1;
    out[0] = p.a * x * lim - E * x - p.b * x * y;
    out[1] = p.c * x * y - (p.d + E) * y;
  }
  function compDeriv(p, x, y, out) {
    out[0] = p.r1 * x * (1 - (x + p.a12 * y) / p.K1);
    out[1] = p.r2 * y * (1 - (y + p.a21 * x) / p.K2);
  }
  /** 平衡點（掠食者–獵物）：沒有負荷量時 (d'/c, a'/b)；有負荷量時 (d'/c, (a' − a·xs/K)/b)；掠食者無法存活時 y* = 0 */
  function lvEquilibrium(p) {
    const ap = p.a - (p.E || 0), dp = p.d + (p.E || 0);
    const xs = dp / p.c;
    if (isFinite(p.K)) {
      const ys = (ap - p.a * xs / p.K) / p.b;
      if (ys <= 0) return { x: Math.max(0, p.K * ap / p.a), y: 0, coexist: false };
      return { x: xs, y: ys, coexist: true };
    }
    return { x: xs, y: ap / p.b, coexist: ap > 0 };
  }
  /** 原始模型（K = ∞）的守恆量 */
  function lvInvariant(p, x, y) {
    const ap = p.a - (p.E || 0), dp = p.d + (p.E || 0);
    return p.c * x - dp * Math.log(x) + p.b * y - ap * Math.log(y);
  }
  /** 平衡點附近的小振幅週期 2π/√(a'·d') */
  function lvPeriod0(p) { return 2 * Math.PI / Math.sqrt((p.a - (p.E || 0)) * (p.d + (p.E || 0))); }
  /** 競爭的結局：'1'（物種 1 勝）、'2'、'coexist'、'bistable'；以及內部平衡點 */
  function compOutcome(p) {
    const s1 = p.K1 > p.a12 * p.K2, s2 = p.K2 > p.a21 * p.K1;
    const den = 1 - p.a12 * p.a21;
    const eq = Math.abs(den) > 1e-12 ? { x: (p.K1 - p.a12 * p.K2) / den, y: (p.K2 - p.a21 * p.K1) / den } : null;
    let kind;
    if (s1 && s2) kind = 'coexist';
    else if (s1 && !s2) kind = '1';
    else if (!s1 && s2) kind = '2';
    else kind = 'bistable';
    return { kind: kind, eq: eq };
  }

  /** RK4 積分兩個物種：f(p, x, y, out)。傳回每 every 天一筆的 { t, x, y } */
  function simulate2(f, p, x0, y0, tEnd, o) {
    o = o || {};
    const h = o.h || 0.005, every = o.every || 0.05;
    const k1 = [0, 0], k2 = [0, 0], k3 = [0, 0], k4 = [0, 0];
    let x = x0, y = y0, t = 0;
    const T = [0], X = [x], Y = [y];
    let next = every;
    const steps = Math.round(tEnd / h);
    for (let i = 1; i <= steps; i++) {
      f(p, x, y, k1);
      f(p, x + 0.5 * h * k1[0], y + 0.5 * h * k1[1], k2);
      f(p, x + 0.5 * h * k2[0], y + 0.5 * h * k2[1], k3);
      f(p, x + h * k3[0], y + h * k3[1], k4);
      x += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      y += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      if (x < 0) x = 0;
      if (y < 0) y = 0;
      t = i * h;
      if (t >= next - 1e-9) { T.push(t); X.push(x); Y.push(y); next += every; }
    }
    return { t: T, x: X, y: Y };
  }
  /** 局部極大值（只取明顯的峰：比前後 w 筆都大，而且突出至少 rel 倍的全幅） */
  function peaks(t, v, rel) {
    rel = rel == null ? 0.02 : rel;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < v.length; i++) { if (v[i] < lo) lo = v[i]; if (v[i] > hi) hi = v[i]; }
    const span = hi - lo;
    const out = [];
    for (let i = 1; i < v.length - 1; i++) {
      if (v[i] > v[i - 1] && v[i] >= v[i + 1] && v[i] - lo > rel * span) {
        // 拋物線內插峰的時刻
        const a = v[i - 1], b = v[i], c = v[i + 1], den = a - 2 * b + c;
        const off = den !== 0 ? 0.5 * (a - c) / den : 0;
        out.push({ i: i, t: t[i] + off * (t[i + 1] - t[i]), v: b });
      }
    }
    return out;
  }
  /** 掠食者–獵物一次模擬的摘要：週期、獵物峰到掠食者峰的延遲、時間平均、振幅變化 */
  function lvSummary(sim) {
    const px = peaks(sim.t, sim.x), py = peaks(sim.t, sim.y);
    let period = NaN, lag = NaN;
    if (px.length >= 2) period = (px[px.length - 1].t - px[0].t) / (px.length - 1);
    if (px.length && py.length) {
      // 每個獵物峰之後第一個掠食者峰
      const lags = [];
      px.forEach(function (p) { const q = py.filter(function (s) { return s.t > p.t; })[0]; if (q && (!isFinite(period) || q.t - p.t < period)) lags.push(q.t - p.t); });
      if (lags.length) lag = lags.reduce(function (s, v) { return s + v; }, 0) / lags.length;
    }
    // 完整週期內的時間平均（從第一個獵物峰到最後一個）
    let avgX = NaN, avgY = NaN;
    if (px.length >= 2) {
      const i0 = px[0].i, i1 = px[px.length - 1].i;
      let sx = 0, sy = 0, n = 0;
      for (let i = i0; i < i1; i++) { sx += sim.x[i]; sy += sim.y[i]; n++; }
      avgX = sx / n; avgY = sy / n;
    }
    return { period: period, lag: lag, cycles: Math.max(0, px.length - 1), peaksX: px, peaksY: py, avgX: avgX, avgY: avgY };
  }

  return {
    M_FRAC: M_FRAC,
    expo: expo, logistic: logistic, rateExpo: rateExpo, rateLogistic: rateLogistic,
    doublingTime: doublingTime, inflectionTime: inflectionTime, timeToReach: timeToReach,
    rng: rng, gillespie: gillespie, extinctionProb: extinctionProb,
    lvDeriv: lvDeriv, compDeriv: compDeriv, lvEquilibrium: lvEquilibrium, lvInvariant: lvInvariant, lvPeriod0: lvPeriod0,
    compOutcome: compOutcome, simulate2: simulate2, peaks: peaks, lvSummary: lvSummary
  };
});
