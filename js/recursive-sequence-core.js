/* recursive-sequence-core.js — 「遞迴數列與蛛網圖」的數學核心（純函式，瀏覽器與 Node 共用）
 *
 * 一階遞迴 a_(n+1) = f(a_n)：數列的極限 L 一定是 f 的不動點 f(L) = L，也就是 y = f(x) 與 y = x 的交點；
 *   |f′(L)| < 1 時附近的數列會被吸過去（0 < f′ < 1 走樓梯、−1 < f′ < 0 繞螺旋），|f′(L)| > 1 時被推開。
 * 六種 f：一次式 p x + q（解得出 a_n = L + (a_1 − L) p^(n−1)）、√(x + c)、1 + k/x（連分數）、cos x、巴比倫開方法 (x + c/x)/2、邏輯斯諦 r x (1 − x)。
 * 兩階遞迴 a_(n+2) = a_(n+1) + a_n（費氏型）：相鄰兩項的比趨近黃金比 φ = (1 + √5)/2（除非起始比剛好是 −1/φ）。 */
(function (root) {
  'use strict';
  const PHI = (1 + Math.sqrt(5)) / 2;
  const DOTTIE = 0.7390851332151607; // cos x = x 的解

  /** 六種遞迴；P 是參數 { p, q, c, k, b, r } */
  const F = {
    lin: { f: function (x, P) { return P.p * x + P.q; }, df: function (x, P) { return P.p; } },
    sqrt: { f: function (x, P) { return x + P.c >= 0 ? Math.sqrt(x + P.c) : NaN; }, df: function (x, P) { return x + P.c > 0 ? 0.5 / Math.sqrt(x + P.c) : Infinity; } },
    cf: { f: function (x, P) { return x !== 0 ? 1 + P.k / x : NaN; }, df: function (x, P) { return -P.k / (x * x); } },
    cos: { f: function (x) { return Math.cos(x); }, df: function (x) { return -Math.sin(x); } },
    bab: { f: function (x, P) { return x !== 0 ? (x + P.b / x) / 2 : NaN; }, df: function (x, P) { return (1 - P.b / (x * x)) / 2; } },
    logi: { f: function (x, P) { return P.r * x * (1 - x); }, df: function (x, P) { return P.r * (1 - 2 * x); } }
  };

  /** 前 n 項 a_1 … a_n；某一項沒有定義（根號裡是負的、分母是 0）時停下，之後的項不列 */
  function iterate(fid, P, a1, n) {
    const out = [a1], f = F[fid].f;
    for (let k = 1; k < n; k++) {
      const v = f(out[k - 1], P);
      if (!isFinite(v)) break;
      out.push(v);
    }
    return out;
  }

  /** 不動點（實數）與穩定性：[{ x, slope = f′(x), stable: |f′| < 1 }]，由小到大 */
  function fixedPoints(fid, P) {
    let xs = [];
    if (fid === 'lin') { if (P.p !== 1) xs = [P.q / (1 - P.p)]; }
    else if (fid === 'sqrt') { if (P.c >= -0.25) { xs = [(1 + Math.sqrt(1 + 4 * P.c)) / 2]; const o = (1 - Math.sqrt(1 + 4 * P.c)) / 2; if (o >= 0 && o + P.c >= 0 && Math.abs(o - xs[0]) > 1e-12) xs.push(o); } }
    else if (fid === 'cf') { if (P.k >= -0.25) { const s = Math.sqrt(1 + 4 * P.k); xs = [(1 - s) / 2, (1 + s) / 2].filter(function (x) { return x !== 0; }); } }
    else if (fid === 'cos') xs = [DOTTIE];
    else if (fid === 'bab') { if (P.b > 0) xs = [-Math.sqrt(P.b), Math.sqrt(P.b)]; }
    else if (fid === 'logi') { xs = [0]; if (P.r !== 0 && P.r !== 1) xs.push(1 - 1 / P.r); }
    xs = xs.filter(function (x, i) { return xs.indexOf(x) === i; }).sort(function (a, b) { return a - b; });
    return xs.map(function (x) { const s = F[fid].df(x, P); return { x: x, slope: s, stable: Math.abs(s) < 1 }; });
  }

  /** 一次式的公式解：a_n = L + (a_1 − L) p^(n − 1)（p = 1 時是等差 a_1 + (n − 1) q） */
  function linTerm(p, q, a1, n) {
    if (p === 1) return a1 + (n - 1) * q;
    const L = q / (1 - p);
    return L + (a1 - L) * Math.pow(p, n - 1);
  }

  /** 邏輯斯諦長期的週期：先走 20000 步，再找最小的週期（1 到 64）；找不到就是 0（混沌） */
  function logiPeriod(r, a1) {
    let x = a1;
    if (!(x >= 0 && x <= 1)) return -1;
    for (let i = 0; i < 20000; i++) x = r * x * (1 - x);
    const orb = [x];
    for (let i = 0; i < 160; i++) orb.push(r * orb[i] * (1 - orb[i]));
    for (let p = 1; p <= 64; p++) {
      let ok = true;
      for (let i = 0; i + p < orb.length; i++) if (Math.abs(orb[i + p] - orb[i]) > 1e-4) { ok = false; break; }
      if (ok) return p;
    }
    return 0;
  }

  /** 費氏型 a_(k+2) = a_(k+1) + a_k 的前 n 項 */
  function fibTerms(a1, a2, n) {
    const out = [a1, a2];
    for (let k = 2; k < n; k++) out.push(out[k - 1] + out[k - 2]);
    return out.slice(0, Math.max(n, 1));
  }
  /** 黃金螺線的正方形拼圖：從 a_1 × a_2 的長方形開始，依序在右、上、左、下貼上邊長 a_2、a_3、… 的正方形
   *  （新正方形的邊長剛好等於長方形那一邊的長度）。傳回 { base: 起始長方形, squares: [{ x, y, s, arc: { cx, cy, from: [x, y], to: [x, y] } }], box }，y 軸向上。 */
  function tiling(a1, a2, n) {
    if (!(a1 > 0 && a2 > 0)) return null;
    const ts = fibTerms(a1, a2, n);
    let x0 = 0, y0 = 0, x1 = a1, y1 = a2;
    const base = { x: 0, y: 0, w: a1, h: a2 }, squares = [];
    for (let k = 1; k < n - 1; k++) {
      const s = ts[k], dir = (k - 1) % 4;
      let sq;
      if (dir === 0) { sq = { x: x1, y: y0, s: s, arc: { cx: x1, cy: y1, from: [x1, y0], to: [x1 + s, y1] } }; x1 += s; }
      else if (dir === 1) { sq = { x: x0, y: y1, s: s, arc: { cx: x0, cy: y1, from: [x1, y1], to: [x0, y1 + s] } }; y1 += s; }
      else if (dir === 2) { sq = { x: x0 - s, y: y0, s: s, arc: { cx: x0, cy: y0, from: [x0, y1], to: [x0 - s, y0] } }; x0 -= s; }
      else { sq = { x: x0, y: y0 - s, s: s, arc: { cx: x1, cy: y0, from: [x0, y0], to: [x1, y0 - s] } }; y0 -= s; }
      squares.push(sq);
    }
    return { base: base, squares: squares, box: { x0: x0, y0: y0, x1: x1, y1: y1 } };
  }

  /** ts 的第 n 項是不是「第一個」和 L 差不到 tol 的項 */
  function firstWithin(ts, L, tol) {
    const n = ts.length;
    if (!n || !(Math.abs(ts[n - 1] - L) < tol)) return false;
    return n === 1 || !(Math.abs(ts[n - 2] - L) < tol);
  }

  /** 很大或很小的數用科學記號 */
  function sci(v) {
    if (!isFinite(v)) return null;
    const av = Math.abs(v);
    if (av !== 0 && (av >= 1e9 || av < 1e-6)) {
      const e = Math.floor(Math.log10(av));
      let m = v / Math.pow(10, e);
      if (Math.abs(m) >= 9.99995) { m /= 10; return { m: +m.toFixed(4), e: e + 1 }; }
      return { m: +m.toFixed(4), e: e };
    }
    return null;
  }

  // ---------- 挑戰：猜遞迴 a_(n+1) = p a_n + q ----------
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const P_CHOICES = [-1.5, -1, -0.5, 0.5, 1, 1.5];
  /** 給前 5 項，答案比對前 6 項。p 由三項唯一決定：p = (a_3 − a_2)/(a_2 − a_1)，所以 a_1 不可以是不動點 */
  function genChallenge(R, last) {
    for (let t = 0; t < 500; t++) {
      const p = P_CHOICES[Math.floor(R() * P_CHOICES.length)];
      const q = Math.floor(R() * 9) - 4, a1 = Math.floor(R() * 11) - 5;
      const ts = iterate('lin', { p: p, q: q }, a1, 6);
      if (ts.some(function (v) { return Math.abs(v) > 40; })) continue;
      if (Math.abs(ts[1] - ts[0]) < 0.5) continue; // 前兩項太接近，看不出規律
      if (last && last.p === p && last.q === q && last.a1 === a1) continue;
      return { p: p, q: q, a1: a1, shown: ts.slice(0, 5), check: ts };
    }
    return null;
  }

  const api = {
    PHI: PHI, DOTTIE: DOTTIE, F: F, iterate: iterate, fixedPoints: fixedPoints, linTerm: linTerm, logiPeriod: logiPeriod,
    fibTerms: fibTerms, tiling: tiling, firstWithin: firstWithin, sci: sci, rng: rng, P_CHOICES: P_CHOICES, genChallenge: genChallenge
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RecCore = api;
})(typeof window !== 'undefined' ? window : this);
