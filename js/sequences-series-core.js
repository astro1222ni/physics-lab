/* sequences-series-core.js — 「等差、等比數列與級數」的數學核心（純函式，瀏覽器與 Node 共用）
 *
 * 等差：a_k = a_1 + (k − 1) d，S_n = n (a_1 + a_n) / 2 = n (2a_1 + (n − 1) d) / 2（高斯的配對：倒過來加，每一對都是 a_1 + a_n）。
 * 等比：a_k = a_1 r^(k − 1)，S_n = a_1 (1 − r^n) / (1 − r)（r ≠ 1；r = 1 時 S_n = n a_1），|r| < 1 時 S_∞ = a_1 / (1 − r)。
 * 圖形數：三角形數 T_n = 1 + 2 + … + n = n(n + 1)/2（兩份拼成 n × (n + 1) 的長方形）；奇數和 1 + 3 + … + (2n − 1) = n²。 */
(function (root) {
  'use strict';
  const r9 = function (v) { const w = Math.round(v * 1e9) / 1e9; return w === 0 ? 0 : w; };

  function arithTerm(a1, d, k) { return a1 + (k - 1) * d; }
  function arithSum(a1, d, n) { return n * (2 * a1 + (n - 1) * d) / 2; }
  function geomTerm(a1, r, k) { return a1 * Math.pow(r, k - 1); }
  function geomSum(a1, r, n) {
    if (r === 1) return n * a1;
    return a1 * (1 - Math.pow(r, n)) / (1 - r);
  }
  function geomInf(a1, r) { return Math.abs(r) < 1 ? a1 / (1 - r) : null; }

  /** 前 n 項（kind 是 'arith' 或 'geom'，s 是公差或公比） */
  function terms(kind, a1, s, n) {
    const out = [];
    for (let k = 1; k <= n; k++) out.push(kind === 'arith' ? arithTerm(a1, s, k) : geomTerm(a1, s, k));
    return out;
  }
  /** 部分和 S_1 … S_n（逐項累加；和公式由單元測試核對） */
  function partials(list) {
    const out = []; let s = 0;
    list.forEach(function (v) { s += v; out.push(s); });
    return out;
  }
  /** |r| < 1 時，n 是不是「第一個」讓 |S_∞ − S_k| ≤ frac × |S_∞| 的項數 */
  function firstWithin(a1, r, n, frac) {
    const S = geomInf(a1, r);
    if (S == null || S === 0 || n < 1) return false;
    const tol = frac * Math.abs(S) * (1 + 1e-12);
    const ok = function (k) { return Math.abs(S - geomSum(a1, r, k)) <= tol; };
    // |S_∞ − S_k| = |S_∞| |r|^k 隨 k 遞減（r 是負的也一樣），所以只要 n 做到、n − 1 做不到
    return ok(n) && (n === 1 || !ok(n - 1));
  }

  // ---------- 圖形數 ----------
  function tri(n) { return n * (n + 1) / 2; }
  function oddSum(n) { return n * n; }
  function isSquare(m) { if (m < 0 || !Number.isInteger(m)) return false; const s = Math.round(Math.sqrt(m)); return s * s === m; }

  // ---------- 文字 ----------
  /** 一般的數；很大或很小時用科學記號（文字版、HTML 版、TeX 版） */
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

  // ---------- 挑戰：猜數列 ----------
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const D_CHOICES = [-3, -2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2, 3];
  const R_CHOICES = [-2, -1.5, -0.5, 0.5, 1.5, 2];
  const A_GEOM = [-8, -6, -4, -3, -2, -1, 1, 2, 3, 4, 6, 8];
  /** 前 5 項唯一決定數列；給學生看前 4 項，答案用前 5 項比對 */
  function genChallenge(R, last) {
    for (let t = 0; t < 500; t++) {
      const kind = R() < 0.5 ? 'arith' : 'geom';
      let a1, s;
      if (kind === 'arith') { a1 = Math.floor(R() * 13) - 6; s = D_CHOICES[Math.floor(R() * D_CHOICES.length)]; }
      else { a1 = A_GEOM[Math.floor(R() * A_GEOM.length)]; s = R_CHOICES[Math.floor(R() * R_CHOICES.length)]; }
      const ts = terms(kind, a1, s, 5);
      if (ts.some(function (v) { return Math.abs(v) > 60; })) continue;
      if (Math.abs(ts[4]) < 0.25) continue; // 第 5 項太小，長條看不出來
      if (last && last.kind === kind && last.a1 === a1 && last.s === s) continue;
      return { kind: kind, a1: a1, s: s, shown: ts.slice(0, 4), check: ts };
    }
    return null;
  }

  const api = {
    r9: r9, arithTerm: arithTerm, arithSum: arithSum, geomTerm: geomTerm, geomSum: geomSum, geomInf: geomInf,
    terms: terms, partials: partials, firstWithin: firstWithin, tri: tri, oddSum: oddSum, isSquare: isSquare, sci: sci,
    rng: rng, D_CHOICES: D_CHOICES, R_CHOICES: R_CHOICES, A_GEOM: A_GEOM, genChallenge: genChallenge
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SeqCore = api;
})(typeof window !== 'undefined' ? window : this);
