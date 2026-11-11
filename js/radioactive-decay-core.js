/*
 * radioactive-decay-core.js — 放射性衰變與半衰期的物理核心（與畫面無關，可單獨測試）
 *
 * 單位約定：時間 t 與半衰期 T½ 使用同一個「時間單位」（秒、天、年、小時皆可），
 *           衰變常數 λ 的單位是「每單位時間」。
 *
 * 單一核種：每個原子核在 dt 內衰變的機率「精確」為 p = 1 − e^(−λdt)（不是近似的 λdt），
 *   所以不論每一步的 dt 多大，模擬的統計性質都與連續時間的指數衰變完全一致：
 *   N(t) 的期望值 = N0·e^(−λt) = N0·(1/2)^(t/T½)，λ = ln2 / T½，平均壽命 τ = 1/λ。
 * 衰變鏈 母核 P →(λ1)→ 子核 D →(λ2)→ 穩定核 S：
 *   每一步使用精確的轉移機率（含「同一步內先變子核、又再衰變成穩定核」），
 *   期望值即 Bateman 解：
 *     P = N0 e^(−λ1 t)
 *     D = N0 λ1/(λ2 − λ1) · (e^(−λ1 t) − e^(−λ2 t))      （λ1 = λ2 時 D = N0 λ t e^(−λt)）
 *     S = N0 − P − D
 * 骰子比喻：每擲一次，每顆骰子擲出 6 點的機率 1/6，就「衰變」退出；
 *   n 次後剩下 N0 (5/6)^n，等效 λ = ln(6/5)（每擲一次），半衰期 ln2 / ln(6/5) ≈ 3.80 次。
 * 隨機數使用可設定種子的 mulberry32，測試結果可重現。
 */
(function (root) {
  'use strict';

  const LN2 = Math.LN2;

  /** 可設定種子的亂數產生器（mulberry32），傳回 [0, 1) 的均勻亂數 */
  function rng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function lambdaOf(halfLife) { return LN2 / halfLife; }
  function halfLifeOf(lambda) { return LN2 / lambda; }
  function meanLife(halfLife) { return halfLife / LN2; }

  /** 單一原子核在 dt 內衰變的精確機率 1 − e^(−λdt)（dt 很小時用 expm1 保持精度） */
  function stepProb(lambda, dt) { return -Math.expm1(-lambda * dt); }

  /** 理論剩餘數 N0 (1/2)^(t/T½) */
  function theoryN(N0, halfLife, t) { return N0 * Math.pow(2, -t / halfLife); }

  /** 活度 A = λN（每單位時間的衰變次數） */
  function activity(lambda, N) { return lambda * N; }

  /** 骰子比喻：每擲一次的衰變機率、等效 λ 與半衰期（單位：次） */
  const DICE_P = 1 / 6;
  const DICE_LAMBDA = Math.log(6 / 5);
  const DICE_HALF = LN2 / DICE_LAMBDA;
  function diceTheory(N0, n) { return N0 * Math.pow(5 / 6, n); }

  /** (1 − e^(−k t))/k，k → 0 時趨近 t（Bateman 解在 λ1 = λ2 時的極限） */
  function growth(k, t) {
    const x = k * t;
    if (Math.abs(x) < 1e-8) return t * (1 - x / 2);
    return -Math.expm1(-x) / k;
  }

  /** 兩個 λ 是否視為相等（Bateman 解的退化情形） */
  function sameRate(l1, l2) { return Math.abs(l2 - l1) <= 1e-9 * Math.max(l1, l2); }

  /**
   * Bateman 解：t 時刻母核 P、子核 D、穩定核 S 的期望數（t = 0 時全部是母核）。
   * halfLife2 為 null 或 Infinity 以外的正數時才有子核；沒有衰變鏈時 D = 0、S = N0 − P。
   */
  function bateman(N0, halfLife1, halfLife2, t) {
    const l1 = LN2 / halfLife1;
    const e1 = Math.exp(-l1 * t);
    const P = N0 * e1;
    if (!(halfLife2 > 0) || !isFinite(halfLife2)) return { P: P, D: 0, S: -N0 * Math.expm1(-l1 * t) };
    const l2 = LN2 / halfLife2;
    // D = N0 λ1 e^(−λ1 t)·(1 − e^(−(λ2−λ1)t))/(λ2 − λ1)：用 expm1 寫法，λ1 ≈ λ2 時也不會失去精度
    const D = N0 * l1 * e1 * growth(l2 - l1, t);
    return { P: P, D: D, S: N0 - P - D };
  }

  /** 衰變鏈的理論活度：A_P = λ1 P、A_D = λ2 D、總活度 A = A_P + A_D */
  function chainActivity(N0, halfLife1, halfLife2, t) {
    const b = bateman(N0, halfLife1, halfLife2, t);
    const AP = b.P * LN2 / halfLife1;
    const AD = halfLife2 > 0 && isFinite(halfLife2) ? b.D * LN2 / halfLife2 : 0;
    return { AP: AP, AD: AD, A: AP + AD };
  }

  /** 子核數量最多的時刻 t_max = ln(λ2/λ1)/(λ2 − λ1)；λ1 = λ2 時 t_max = 1/λ = τ */
  function daughterPeakTime(halfLife1, halfLife2) {
    const l1 = LN2 / halfLife1, l2 = LN2 / halfLife2;
    if (sameRate(l1, l2)) return 1 / l1;
    return Math.log(l2 / l1) / (l2 - l1);
  }

  /** 暫態平衡時的 D/P = λ1/(λ2 − λ1) = T½子/(T½母 − T½子)；子核壽命不比母核短時沒有平衡，傳回 null */
  function equilibriumRatio(halfLife1, halfLife2) {
    if (!(halfLife2 < halfLife1)) return null;
    return halfLife2 / (halfLife1 - halfLife2);
  }

  /**
   * 一步 dt 的精確轉移機率：
   *   母核：pp 仍是母核、pd 變成子核、ps 變成穩定核（同一步內連續衰變兩次）
   *   子核：dd 仍是子核、ds 變成穩定核
   * 沒有衰變鏈時 pd = 0，母核衰變後直接算「已衰變」（ps）。
   */
  function transition(halfLife1, halfLife2, dt) {
    const l1 = LN2 / halfLife1;
    const pp = Math.exp(-l1 * dt);
    if (!(halfLife2 > 0) || !isFinite(halfLife2)) return { pp: pp, pd: 0, ps: -Math.expm1(-l1 * dt), dd: 1, ds: 0 };
    const l2 = LN2 / halfLife2;
    const dd = Math.exp(-l2 * dt);
    let pd = l1 * pp * growth(l2 - l1, dt);
    pd = Math.max(0, Math.min(1 - pp, pd));
    return { pp: pp, pd: pd, ps: Math.max(0, 1 - pp - pd), dd: dd, ds: -Math.expm1(-l2 * dt) };
  }

  /**
   * 建立一次模擬：o = { N0, halfLife, halfLife2（衰變鏈的子核半衰期，省略則沒有衰變鏈）, seed }
   * state[i]：0 = 母核、1 = 子核、2 = 已衰變／穩定核
   */
  function createSim(o) {
    const N0 = o.N0 | 0;
    return {
      kind: 'nuclei',
      N0: N0, halfLife: o.halfLife, halfLife2: o.halfLife2 > 0 && isFinite(o.halfLife2) ? o.halfLife2 : null,
      state: new Uint8Array(N0), face: null,
      t: 0, nP: N0, nD: 0, nS: 0, decays: 0, steps: 0,
      rand: rng(o.seed == null ? 12345 : o.seed)
    };
  }

  /**
   * 前進 dt：每個原子核依精確的轉移機率隨機決定狀態。
   * out（可省略）收集這一步的每一次衰變：out.idx[k] 原子核編號、out.kind[k]（1 母→子、2 母→已衰變、3 子→穩定）、
   * out.at[k] 衰變發生在這一步之中的時間（0–dt，依截斷指數分布抽樣，只供音效與閃光時間使用）。
   * 傳回這一步的衰變次數（母→穩定在同一步完成時算 2 次）。
   */
  function step(sim, dt, out) {
    if (!(dt > 0)) return 0;
    const tr = transition(sim.halfLife, sim.halfLife2, dt);
    const chain = sim.halfLife2 != null;
    const l1 = LN2 / sim.halfLife, l2 = chain ? LN2 / sim.halfLife2 : 0;
    const p1 = 1 - tr.pp;
    const st = sim.state, R = sim.rand;
    let n = 0;
    if (out) out.n = 0;
    function rec(i, kind, at) {
      if (!out) return;
      out.idx[out.n] = i; out.kind[out.n] = kind; out.at[out.n] = at; out.n++;
    }
    for (let i = 0; i < st.length; i++) {
      const s = st[i];
      if (s === 0) {
        const u = R();
        if (u < tr.ps) {
          // 母核在這一步內衰變，而且子核也在同一步內衰變（或沒有衰變鏈）
          st[i] = 2; sim.nP--; sim.nS++;
          const a = out ? -Math.log1p(-R() * p1) / l1 : 0;
          if (chain) {
            n += 2;
            rec(i, 1, a);
            rec(i, 3, out ? a + R() * (dt - a) : 0);
          } else { n += 1; rec(i, 2, a); }
        } else if (u < tr.ps + tr.pd) {
          st[i] = 1; sim.nP--; sim.nD++; n += 1;
          if (out) rec(i, 1, -Math.log1p(-R() * p1) / l1);
        }
      } else if (s === 1) {
        if (R() < tr.ds) {
          st[i] = 2; sim.nD--; sim.nS++; n += 1;
          if (out) rec(i, 3, -Math.log1p(-R() * tr.ds) / l2);
        }
      }
    }
    sim.t += dt;
    sim.decays += n;
    sim.steps++;
    return n;
  }

  /** 骰子比喻：N0 顆骰子（state 0 = 還在桌上、2 = 擲出 6 點而退出），face 記錄每顆骰子最近一次的點數 */
  function createDice(o) {
    const N0 = o.N0 | 0;
    const face = new Uint8Array(N0);
    const R = rng(o.seed == null ? 12345 : o.seed);
    for (let i = 0; i < N0; i++) face[i] = 1 + Math.floor(R() * 5); // 開始時沒有 6 點
    return {
      kind: 'dice', N0: N0, halfLife: DICE_HALF, halfLife2: null,
      state: new Uint8Array(N0), face: face,
      t: 0, nP: N0, nD: 0, nS: 0, decays: 0, steps: 0, rand: R
    };
  }

  /** 擲一次：每顆還在桌上的骰子重新擲，6 點（機率恰為 1/6）就衰變退出。傳回這次衰變的數量 */
  function roll(sim, out) {
    const st = sim.state, f = sim.face, R = sim.rand;
    let n = 0;
    if (out) out.n = 0;
    for (let i = 0; i < st.length; i++) {
      if (st[i] !== 0) continue;
      const v = 1 + Math.floor(R() * 6);
      f[i] = v;
      if (v === 6) {
        st[i] = 2; n++;
        if (out) { out.idx[out.n] = i; out.kind[out.n] = 2; out.at[out.n] = R(); out.n++; }
      }
    }
    sim.nP -= n; sim.nS += n;
    sim.t += 1;
    sim.decays += n;
    sim.steps++;
    return n;
  }

  /** 收集衰變事件用的緩衝區 */
  function events(cap) {
    return { n: 0, idx: new Int32Array(cap), kind: new Uint8Array(cap), at: new Float64Array(cap) };
  }

  /**
   * 指數擬合：以 ln N 對 t 做加權最小平方（權重 = N，因為 ln N 的變異數約為 1/N），
   * 只用 N ≥ minN 的資料點。傳回 { lambda, N0, halfLife }；資料不足時傳回 null。
   */
  function fitExponential(ts, Ns, minN) {
    const m = minN == null ? 1 : minN;
    let S = 0, Sx = 0, Sy = 0, Sxx = 0, Sxy = 0, k = 0;
    for (let i = 0; i < ts.length; i++) {
      const N = Ns[i];
      if (!(N >= m) || N <= 0) continue;
      const w = N, x = ts[i], y = Math.log(N);
      S += w; Sx += w * x; Sy += w * y; Sxx += w * x * x; Sxy += w * x * y; k++;
    }
    const det = S * Sxx - Sx * Sx;
    if (k < 3 || !(det > 0)) return null;
    const slope = (S * Sxy - Sx * Sy) / det;
    const icpt = (Sy - slope * Sx) / S;
    if (!(slope < 0)) return null;
    return { lambda: -slope, N0: Math.exp(icpt), halfLife: LN2 / -slope };
  }

  /** 樣本平均與標準差（測試與統計用） */
  function meanStd(arr) {
    let s = 0, s2 = 0;
    for (let i = 0; i < arr.length; i++) { s += arr[i]; s2 += arr[i] * arr[i]; }
    const m = s / arr.length;
    return { mean: m, std: Math.sqrt(Math.max(0, s2 / arr.length - m * m)) };
  }

  const api = {
    LN2: LN2, rng: rng,
    lambdaOf: lambdaOf, halfLifeOf: halfLifeOf, meanLife: meanLife,
    stepProb: stepProb, theoryN: theoryN, activity: activity,
    DICE_P: DICE_P, DICE_LAMBDA: DICE_LAMBDA, DICE_HALF: DICE_HALF, diceTheory: diceTheory,
    bateman: bateman, chainActivity: chainActivity, daughterPeakTime: daughterPeakTime,
    equilibriumRatio: equilibriumRatio, transition: transition,
    createSim: createSim, step: step, createDice: createDice, roll: roll, events: events,
    fitExponential: fitExponential, meanStd: meanStd
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DecayCore = api;
})(typeof window !== 'undefined' ? window : this);
