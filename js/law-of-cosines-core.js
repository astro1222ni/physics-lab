/* law-of-cosines-core.js — 「正弦定理、餘弦定理與解三角形」的數學核心（純函式，瀏覽器與 Node 共用）
 *
 * 慣例：頂點 A、B、C，對邊 a = BC、b = CA、c = AB；角度一律用「度」。
 * 餘弦定理 c² = a² + b² − 2ab cos C；正弦定理 a／sin A = b／sin B = c／sin C = 2R（R 是外接圓半徑）。
 * 解三角形：SSS、SAS、ASA／AAS、SSA（給兩邊與其中一邊的對角，可能 0、1、2 解）。 */
(function (root) {
  'use strict';
  const D2R = Math.PI / 180;
  const EPS = 1e-9;

  function dist(P, Q) { return Math.hypot(P[0] - Q[0], P[1] - Q[1]); }
  function clamp1(v) { return Math.max(-1, Math.min(1, v)); }
  /** 由三邊求 c 的對角（度）：cos C = (a² + b² − c²)／(2ab) */
  function angleFrom(a, b, c) {
    if (!(a > 0 && b > 0)) return NaN;
    return Math.acos(clamp1((a * a + b * b - c * c) / (2 * a * b))) / D2R;
  }
  /** 餘弦定理：兩邊 a、b 夾角 C，求第三邊 */
  function lawCos(a, b, Cdeg) { return Math.sqrt(Math.max(0, a * a + b * b - 2 * a * b * Math.cos(Cdeg * D2R))); }
  /** 三邊能不能圍成三角形（嚴格三角不等式，容許 eps） */
  function isTriangle(a, b, c, eps) {
    const e = eps === undefined ? EPS : eps;
    return a > e && b > e && c > e && a + b > c + e && b + c > a + e && c + a > b + e;
  }

  /** 由三個頂點算出所有的量 */
  function measure(A, B, C) {
    const a = dist(B, C), b = dist(C, A), c = dist(A, B);
    const cross = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    const area = Math.abs(cross) / 2;
    const deg = area < 1e-12;
    const angA = deg ? NaN : angleFrom(b, c, a), angB = deg ? NaN : angleFrom(c, a, b), angC = deg ? NaN : 180 - angA - angB;
    const R = deg ? Infinity : a * b * c / (4 * area);
    const s = (a + b + c) / 2;
    return { a: a, b: b, c: c, A: angA, B: angB, C: angC, area: area, R: R, r: deg ? 0 : area / s, s: s, perimeter: a + b + c, orient: cross >= 0 ? 1 : -1, degenerate: deg };
  }
  /** 外心（外接圓圓心） */
  function circumcenter(A, B, C) {
    const d = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1]));
    if (Math.abs(d) < 1e-12) return null;
    const a2 = A[0] * A[0] + A[1] * A[1], b2 = B[0] * B[0] + B[1] * B[1], c2 = C[0] * C[0] + C[1] * C[1];
    return [(a2 * (B[1] - C[1]) + b2 * (C[1] - A[1]) + c2 * (A[1] - B[1])) / d, (a2 * (C[0] - B[0]) + b2 * (A[0] - C[0]) + c2 * (B[0] - A[0])) / d];
  }
  /** 三角形的「類型」：銳角、直角、鈍角（角度容許 tol 度） */
  function kind(m, tol) {
    const t = tol === undefined ? 1e-6 : tol;
    const big = Math.max(m.A, m.B, m.C);
    if (isNaN(big)) return 'degenerate';
    return Math.abs(big - 90) <= t ? 'right' : big > 90 ? 'obtuse' : 'acute';
  }

  /** 標準擺法：A 在原點、B 在 (c, 0)、C 在上半平面；三邊 a、b、c */
  function place(a, b, c) {
    const x = (b * b + c * c - a * a) / (2 * c);
    const y = Math.sqrt(Math.max(0, b * b - x * x));
    return { A: [0, 0], B: [c, 0], C: [x, y] };
  }

  // ---------- 解三角形 ----------
  /** 由三邊 */
  function solveSSS(a, b, c) {
    if (!isTriangle(a, b, c)) return [];
    const A = angleFrom(b, c, a), B = angleFrom(c, a, b);
    return [{ a: a, b: b, c: c, A: A, B: B, C: 180 - A - B }];
  }
  /** 兩邊 b、c 與夾角 A */
  function solveSAS(b, c, Adeg) {
    if (!(b > 0 && c > 0 && Adeg > 0 && Adeg < 180)) return [];
    const a = lawCos(b, c, Adeg);
    const B = angleFrom(c, a, b);
    return [{ a: a, b: b, c: c, A: Adeg, B: B, C: 180 - Adeg - B }];
  }
  /** 兩角 A、B 與夾邊 c（ASA） */
  function solveASA(Adeg, Bdeg, c) {
    const C = 180 - Adeg - Bdeg;
    if (!(Adeg > 0 && Bdeg > 0 && C > EPS && c > 0)) return [];
    const k = c / Math.sin(C * D2R);
    return [{ a: k * Math.sin(Adeg * D2R), b: k * Math.sin(Bdeg * D2R), c: c, A: Adeg, B: Bdeg, C: C }];
  }
  /** SSA：角 A、它的鄰邊 b（= CA）、對邊 a（= BC）。回傳 0、1 或 2 個解（c 由小到大）
   *  從 C 畫半徑 a 的圓，和射線 AB 的交點就是 B：交點數由 a 和高 h = b sin A 決定。 */
  function solveSSA(Adeg, b, a) {
    if (!(Adeg > 0 && Adeg < 180 && a > 0 && b > 0)) return [];
    const sA = Math.sin(Adeg * D2R), cA = Math.cos(Adeg * D2R);
    const h = b * sA;
    // B 在射線上的位置 c 滿足 c² − 2bc cos A + b² − a² = 0
    const disc = a * a - h * h;
    if (disc < -1e-12) return [];
    const r = Math.sqrt(Math.max(0, disc));
    const cs = (Math.abs(disc) <= 1e-12 ? [b * cA] : [b * cA - r, b * cA + r]).filter(function (c) { return c > 1e-9; });
    return cs.map(function (c) {
      const B = angleFrom(c, a, b);
      return { a: a, b: b, c: c, A: Adeg, B: B, C: 180 - Adeg - B };
    });
  }
  /** SSA 的解的個數（用來說明 0／1／2 解的情形）與分類 */
  function ssaCase(Adeg, b, a, tol) {
    const t = tol === undefined ? 1e-9 : tol;
    const h = b * Math.sin(Adeg * D2R);
    if (Adeg >= 90) return a > b + t ? { n: 1, why: 'big' } : { n: 0, why: 'short' };
    if (a < h - t) return { n: 0, why: 'short' };
    if (Math.abs(a - h) <= t) return { n: 1, why: 'right' };
    if (a < b - t) return { n: 2, why: 'two' };
    return { n: 1, why: 'big' };
  }

  // ---------- 挑戰「解三角形」 ----------
  /** 隨機出一題：給三個已知量，問一個未知量。邊長是 2–9 的整數或一位小數、角度是 5° 的倍數 */
  function challenge(rand) {
    const pickInt = function (lo, hi) { return lo + Math.floor(rand() * (hi - lo + 1)); };
    for (let t = 0; t < 200; t++) {
      const type = ['SSS', 'SAS', 'ASA', 'SSA'][Math.floor(rand() * 4)];
      let sol, given, ask;
      if (type === 'SSS') {
        const a = pickInt(2, 9), b = pickInt(2, 9), c = pickInt(2, 9);
        sol = solveSSS(a, b, c)[0];
        given = { a: a, b: b, c: c }; ask = ['A', 'B', 'C'][Math.floor(rand() * 3)];
      } else if (type === 'SAS') {
        const b = pickInt(2, 9), c = pickInt(2, 9), A = 5 * pickInt(4, 30);
        sol = solveSAS(b, c, A)[0];
        given = { b: b, c: c, A: A }; ask = 'a';
      } else if (type === 'ASA') {
        const A = 5 * pickInt(4, 24), B = 5 * pickInt(4, 24), c = pickInt(2, 9);
        sol = solveASA(A, B, c)[0];
        given = { A: A, B: B, c: c }; ask = rand() < 0.5 ? 'a' : 'b';
      } else {
        const A = 5 * pickInt(4, 16), b = pickInt(3, 9), a = pickInt(2, 9);
        const s = solveSSA(A, b, a);
        if (s.length !== 1) continue; // 挑戰只出唯一解的 SSA
        sol = s[0];
        given = { A: A, b: b, a: a }; ask = 'c';
      }
      if (!sol) continue;
      // 三角形不要太扁：每個角 ≥ 15°、每邊在 1.5–12 之間
      if (Math.min(sol.A, sol.B, sol.C) < 15 || Math.min(sol.a, sol.b, sol.c) < 1.5 || Math.max(sol.a, sol.b, sol.c) > 12) continue;
      return { type: type, given: given, ask: ask, sol: sol, answer: sol[ask] };
    }
    const s = solveSSS(5, 6, 7)[0];
    return { type: 'SSS', given: { a: 5, b: 6, c: 7 }, ask: 'C', sol: s, answer: s.C };
  }
  /** 答案是否正確：邊長相對誤差 ≤ 1%、角度差 ≤ 0.5° */
  function answerOK(v, ask, answer) {
    if (!isFinite(v)) return false;
    if (ask === 'A' || ask === 'B' || ask === 'C') return Math.abs(v - answer) <= 0.5;
    return Math.abs(v - answer) <= 0.01 * Math.abs(answer);
  }

  const LCCore = { D2R: D2R, dist: dist, angleFrom: angleFrom, lawCos: lawCos, isTriangle: isTriangle, measure: measure, circumcenter: circumcenter, kind: kind,
    place: place, solveSSS: solveSSS, solveSAS: solveSAS, solveASA: solveASA, solveSSA: solveSSA, ssaCase: ssaCase, challenge: challenge, answerOK: answerOK };
  if (typeof module !== 'undefined' && module.exports) module.exports = LCCore;
  else root.LCCore = LCCore;
})(typeof window !== 'undefined' ? window : this);
