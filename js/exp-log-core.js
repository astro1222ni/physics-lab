/* exp-log-core.js — 「指數與對數：複利、e 與對數尺度」的數學核心（與畫面分離，Node 單元測試：tests/exp-log-core.test.js）
 *
 * 一、複利：本金 1、年利率 r（小數）、一年複利 n 次、t 年 → (1 + r/n)^(n t)；連續複利 e^(r t)；單利 1 + r t。
 * 二、指數與對數：y = a^x 與反函數 y = log_a x（對 y = x 對稱）；兩條曲線的交點（a > 1 時只在 y = x 上，
 *     a = e^(1/e) 時相切；0 < a < e^(−e) 時有三個交點）。
 * 三、對數尺度：模型 y = C·b^x 在半對數圖上是直線（斜率 log b、截距 log C）；資料的最小平方擬合（取對數後）。 */
(function (root) {
  'use strict';
  const LN10 = Math.LN10, LN2 = Math.LN2;
  const E_1E = Math.exp(1 / Math.E);       // e^(1/e) ≈ 1.44467：a^x 與 log_a x 相切的底數
  const E_ME = Math.exp(-Math.E);          // e^(−e) ≈ 0.065988：比它小時有三個交點

  // ---------- 一、複利 ----------
  /** (1 + r/n)^(n t)，用 log1p 避免 n 很大時的捨入誤差 */
  function compound(r, n, t) { return Math.exp(n * t * Math.log1p(r / n)); }
  function cont(r, t) { return Math.exp(r * t); }
  function simple(r, t) { return 1 + r * t; }
  /** 時間 s 時帳戶裡的錢（離散複利只在每期結束時入帳：階梯） */
  function stair(r, n, s) { return Math.exp(Math.floor(n * s + 1e-9) * Math.log1p(r / n)); }
  /** n 的對數滑桿：位置 0–100 ↔ n = 10^(6·位置/100)（1 到 1 000 000） */
  const N_MIN = 1, N_MAX = 1e6;
  function nFromPos(p) { return Math.round(Math.pow(10, 6 * Math.max(0, Math.min(100, p)) / 100)); }
  function posFromN(n) { return Math.max(0, Math.min(100, Math.log10(Math.max(1, n)) / 6 * 100)); }
  /** 翻倍需要幾年（離散：解 (1 + r/n)^(n t) = 2；n = Infinity 時是連續複利） */
  function doublingTime(r, n) {
    if (!(r > 0)) return null;
    return n === Infinity ? LN2 / r : LN2 / (n * Math.log1p(r / n));
  }

  // ---------- 二、指數與對數 ----------
  function pow(a, x) { return Math.pow(a, x); }
  function log(a, y) { return (a > 0 && a !== 1 && y > 0) ? Math.log(y) / Math.log(a) : null; }
  /** 二分法：f(lo)、f(hi) 異號時找根 */
  function bisect(f, lo, hi) {
    let flo = f(lo);
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2, fm = f(mid);
      if (fm === 0) return mid;
      if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm; } else hi = mid;
      if (hi - lo < 1e-15 * Math.max(1, Math.abs(mid))) break;
    }
    return (lo + hi) / 2;
  }
  /** y = a^x 與 y = log_a x 的交點 [[x, y], …]（依 x 排序）；tangent：是否相切（只有一個切點） */
  function meet(a) {
    if (!(a > 0) || a === 1) return { pts: [], tangent: false };
    const la = Math.log(a);
    if (a > 1) {
      // 兩個遞增的反函數只會在 y = x 上相交：a^x = x ⇔ h(x) = x ln a − ln x = 0，最小值在 x = 1/ln a
      const xm = 1 / la, hmin = 1 + Math.log(la);
      if (Math.abs(hmin) < 1e-12) return { pts: [[xm, xm]], tangent: true };
      if (hmin > 0) return { pts: [], tangent: false };
      const h = function (x) { return x * la - Math.log(x); };
      let hi = xm * 2;
      while (h(hi) < 0) hi *= 2;
      const x1 = bisect(h, 1e-300, xm), x2 = bisect(h, xm, hi);
      return { pts: [[x1, x1], [x2, x2]], tangent: false };
    }
    // 0 < a < 1：交點 (x, a^x) 滿足 x = a^(a^x)，而且 x 在 (a, 1) 之間（y = a^x < 1 ⇒ log_a x < 1 ⇒ x > a）
    const G = function (x) { return Math.pow(a, Math.pow(a, x)) - x; };
    const pts = [];
    const N = 4000, lo = a, hi = 1;
    let x0 = lo, g0 = G(x0);
    for (let i = 1; i <= N; i++) {
      const x1 = lo + (hi - lo) * i / N, g1 = G(x1);
      if (g0 === 0) pts.push(x0);
      else if (g0 * g1 < 0) pts.push(bisect(G, x0, x1));
      x0 = x1; g0 = g1;
    }
    return { pts: pts.map(function (x) { return [x, Math.pow(a, x)]; }), tangent: false };
  }

  // ---------- 三、對數尺度與擬合 ----------
  /** C 的對數滑桿：位置 0–100 ↔ C = 10^(−1 + 4·位置/100)（0.1 到 1000） */
  function cFromPos(p) { return Math.pow(10, -1 + 4 * Math.max(0, Math.min(100, p)) / 100); }
  function posFromC(c) { return Math.max(0, Math.min(100, (Math.log10(c) + 1) / 4 * 100)); }
  /** 以 log10 計的均方根殘差：資料點與 y = C·b^x 在半對數圖上的垂直距離 */
  function rmsLog(xs, ys, C, b) {
    if (!(C > 0) || !(b > 0)) return null;
    let s = 0;
    for (let i = 0; i < xs.length; i++) { const d = Math.log10(ys[i]) - (Math.log10(C) + xs[i] * Math.log10(b)); s += d * d; }
    return Math.sqrt(s / xs.length);
  }
  /** 取對數後的最小平方直線：log10 y = log10 C + x·log10 b */
  function fitLog(xs, ys) {
    const n = xs.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { const y = Math.log10(ys[i]); sx += xs[i]; sy += y; sxx += xs[i] * xs[i]; sxy += xs[i] * y; }
    const m = (n * sxy - sx * sy) / (n * sxx - sx * sx), k = (sy - m * sx) / n;
    const C = Math.pow(10, k), b = Math.pow(10, m);
    return { C: C, b: b, slope: m, icpt: k, rms: rmsLog(xs, ys, C, b) };
  }
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** 資料加上 ±amp 的相對誤差（固定種子，重現得到） */
  function noisy(xs, f, amp, seed) {
    const r = rng(seed);
    return xs.map(function (x) { return f(x) * (1 + amp * (2 * r() - 1)); });
  }
  const range = function (a, b, s) { const o = []; for (let x = a; x <= b + 1e-9; x += s) o.push(Math.round(x * 1000) / 1000); return o; };
  /** 內建的兩組範例資料（數值是依指數模型加上小誤差造出來的教學用資料，不是實際量測） */
  const DATASETS = {
    bacteria: { xs: range(0, 5, 0.5), C: 50, b: 4, unit: 'h' },          // 每半小時加倍：每小時乘 4
    decay: { xs: range(0, 40, 4), C: 1000, b: Math.pow(0.5, 1 / 8), unit: 'd' }   // 半衰期 8 天（像碘-131）
  };
  DATASETS.bacteria.ys = noisy(DATASETS.bacteria.xs, function (x) { return 50 * Math.pow(4, x); }, 0.04, 11);
  DATASETS.decay.ys = noisy(DATASETS.decay.xs, function (x) { return 1000 * Math.pow(0.5, x / 8); }, 0.03, 23);

  const B_MIN = 0.2, B_MAX = 4;
  const CHAL_TOL = 0.012;
  /** 挑戰：隨機的指數資料（b 在 0.05 的格點、C 取兩位有效數字），±2% 的誤差；
   *  目前的模型（cur）必須和資料差很多；回傳 { xs, ys, C, b, tol } */
  function genChallenge(rand, cur, prev) {
    for (let tries = 0; tries < 500; tries++) {
      const grow = rand() < 0.6;
      const b = Math.round((grow ? 1.25 + rand() * 1.75 : 0.5 + rand() * 0.4) / 0.05) * 0.05;
      const mag = Math.floor(rand() * 3);              // C 的數量級 1、10、100
      const C = Math.round((1 + rand() * 9) * 10) / 10 * Math.pow(10, mag);
      const xs = range(0, 8, 1);
      const ys = noisy(xs, function (x) { return C * Math.pow(b, x); }, 0.02, Math.floor(rand() * 1e9));
      const fit = fitLog(xs, ys);
      if (fit.rms > CHAL_TOL * 0.5) continue;
      const top = Math.max.apply(null, ys), bot = Math.min.apply(null, ys);
      if (top > 2e5 || bot < 0.05) continue;
      if (cur && rmsLog(xs, ys, cur.C, cur.b) < 0.15) continue;
      if (prev && Math.abs(Math.log10(prev.b) - Math.log10(b)) < 0.02 && Math.abs(Math.log10(prev.C / C)) < 0.1) continue;
      return { xs: xs, ys: ys, C: C, b: b, tol: CHAL_TOL };
    }
    return null;
  }
  function chalHit(ch, C, b) { const v = rmsLog(ch.xs, ch.ys, C, b); return v != null && v <= ch.tol; }

  function trim(v, dec) {
    let s = (Math.abs(v) < 0.5 * Math.pow(10, -dec) ? 0 : v).toFixed(dec);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === '-0') s = '0';
    return s;
  }

  const api = {
    LN10: LN10, LN2: LN2, E_1E: E_1E, E_ME: E_ME, N_MIN: N_MIN, N_MAX: N_MAX, B_MIN: B_MIN, B_MAX: B_MAX, CHAL_TOL: CHAL_TOL,
    compound: compound, cont: cont, simple: simple, stair: stair, nFromPos: nFromPos, posFromN: posFromN, doublingTime: doublingTime,
    pow: pow, log: log, meet: meet, bisect: bisect,
    cFromPos: cFromPos, posFromC: posFromC, rmsLog: rmsLog, fitLog: fitLog, rng: rng, noisy: noisy, DATASETS: DATASETS,
    genChallenge: genChallenge, chalHit: chalHit, trim: trim
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ExpLogCore = api;
})(typeof window !== 'undefined' ? window : this);
