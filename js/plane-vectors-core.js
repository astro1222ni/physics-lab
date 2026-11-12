/* plane-vectors-core.js — 「平面向量的線性組合與內積」的數學核心（純函式，瀏覽器與 Node 共用）
 *
 * 向量用 [x, y] 表示。
 * 線性組合：P = x a + y b；a、b 不平行（行列式 ≠ 0）時用克拉瑪公式解出唯一的 (x, y)；平行時 P 只能在一條直線上。
 * 範圍：x + y = 1（直線 AB）、x, y ≥ 0（角形區域）、0 ≤ x, y ≤ 1（平行四邊形）、x, y ≥ 0 且 x + y ≤ 1（三角形）。
 * 內積：a · b = a1 b1 + a2 b2 = |a||b| cos θ；b 在 a 上的正射影 (a·b / |a|²) a；平行四邊形面積 |det(a, b)| = |a||b| sin θ。
 * 挑戰：給 a、b 與目標點，用係數 (x, y) 走到目標。 */
(function (root) {
  'use strict';

  function add(u, v) { return [u[0] + v[0], u[1] + v[1]]; }
  function sub(u, v) { return [u[0] - v[0], u[1] - v[1]]; }
  function mul(k, u) { return [k * u[0], k * u[1]]; }
  function dot(u, v) { return u[0] * v[0] + u[1] * v[1]; }
  /** 行列式 det(u, v) = u1 v2 − u2 v1（有號面積） */
  function det(u, v) { return u[0] * v[1] - u[1] * v[0]; }
  function len(u) { return Math.hypot(u[0], u[1]); }
  function isZero(u) { return u[0] === 0 && u[1] === 0; }
  /** 夾角（度，0 到 180）；有零向量時 null */
  function angleDeg(u, v) {
    if (isZero(u) || isZero(v)) return null;
    return Math.atan2(Math.abs(det(u, v)), dot(u, v)) * 180 / Math.PI;
  }
  /** b 在 a 上的正射影：k = a·b / |a|²，向量 k a */
  function proj(b, a) {
    const aa = dot(a, a);
    if (aa === 0) return null;
    const k = dot(a, b) / aa;
    return { k: k, v: mul(k, a) };
  }
  function comb(a, b, x, y) { return [x * a[0] + y * b[0], x * a[1] + y * b[1]]; }
  /** 解 P = x a + y b；a、b 平行時回傳 null */
  function solve(a, b, P) {
    const d = det(a, b);
    if (d === 0) return null;
    return { x: det(P, b) / d, y: det(a, P) / d };
  }
  /** a、b 平行（含零向量）時，P 在不在它們張出的直線上 */
  function onSpan(a, b, P) {
    const u = !isZero(a) ? a : !isZero(b) ? b : null;
    if (!u) return isZero(P);
    return Math.abs(det(u, P)) < 1e-9 * Math.max(1, len(u) * len(P));
  }

  // ---------- 範圍 ----------
  const REGIONS = ['none', 'line', 'cone', 'para', 'tri'];
  function inRegion(region, x, y, tol) {
    tol = tol == null ? 1e-9 : tol;
    if (region === 'line') return Math.abs(x + y - 1) <= tol;
    if (region === 'cone') return x >= -tol && y >= -tol;
    if (region === 'para') return x >= -tol && y >= -tol && x <= 1 + tol && y <= 1 + tol;
    if (region === 'tri') return x >= -tol && y >= -tol && x + y <= 1 + tol;
    return true;
  }
  /** 範圍在係數平面上的頂點（畫圖用；無界的部分用 big 截斷） */
  function regionPolygon(region, big) {
    big = big || 50;
    if (region === 'cone') return [[0, 0], [big, 0], [big, big], [0, big]];
    if (region === 'para') return [[0, 0], [1, 0], [1, 1], [0, 1]];
    if (region === 'tri') return [[0, 0], [1, 0], [0, 1]];
    return null;
  }
  /** 分點：P = x A + y B 且 x + y = 1 時，AP : PB = y : x（有號） */
  function ratioOnLine(x, y) { return { ap: y, pb: x }; }

  // ---------- 吸附 ----------
  /** 把係數吸到最近的 step 倍數（距離在 tol 以內才吸） */
  function snapCoef(v, step, tol) {
    const r = Math.round(v / step) * step;
    return Math.abs(r - v) <= tol ? Math.round(r * 1e9) / 1e9 : v;
  }

  // ---------- 亂數與挑戰 ----------
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /** 一題：a、b 是分量 −3 到 3 的整數向量、|det| ≥ 2；目標係數是 −2 到 3 的 0.5 倍數、不全是整數 0；目標點在畫面內（各座標 ≤ 5.5） */
  function genChallenge(R, last) {
    const ri = function (lo, hi) { return lo + Math.floor(R() * (hi - lo + 1)); };
    for (let t = 0; t < 1000; t++) {
      const a = [ri(-3, 3), ri(-3, 3)], b = [ri(-3, 3), ri(-3, 3)];
      if (isZero(a) || isZero(b) || Math.abs(det(a, b)) < 2) continue;
      // 不要兩個都在座標軸上（那樣斜坐標就是直角坐標）
      if ((a[0] === 0 || a[1] === 0) && (b[0] === 0 || b[1] === 0)) continue;
      const x = ri(-4, 6) / 2, y = ri(-4, 6) / 2;
      if (x === 0 && y === 0) continue;
      if (Number.isInteger(x) && Number.isInteger(y) && R() < 0.5) continue; // 多出一些有 0.5 的題目
      const T = comb(a, b, x, y);
      if (Math.abs(T[0]) > 5.5 || Math.abs(T[1]) > 5.5) continue;
      if (last && last.x === x && last.y === y && last.a[0] === a[0] && last.a[1] === a[1] && last.b[0] === b[0] && last.b[1] === b[1]) continue;
      return { a: a, b: b, x: x, y: y, T: T };
    }
    return null;
  }

  const api = {
    add: add, sub: sub, mul: mul, dot: dot, det: det, len: len, isZero: isZero, angleDeg: angleDeg, proj: proj,
    comb: comb, solve: solve, onSpan: onSpan,
    REGIONS: REGIONS, inRegion: inRegion, regionPolygon: regionPolygon, ratioOnLine: ratioOnLine,
    snapCoef: snapCoef, rng: rng, genChallenge: genChallenge
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PlaneVecCore = api;
})(typeof window !== 'undefined' ? window : this);
