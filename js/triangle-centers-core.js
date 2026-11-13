/* triangle-centers-core.js — 「三角形的四心與歐拉線」的數學核心（純函式，瀏覽器與 Node 共用）
 *
 * 慣例：頂點 A、B、C，對邊 a = BC、b = CA、c = AB；角度一律用「度」。
 * 四心：重心 G（三中線交點）、外心 O（三中垂線交點）、內心 I（三內角平分線交點）、垂心 H（三高交點）。
 * 歐拉線：O、G、H 共線，而且 OG : GH = 1 : 2（向量式 H = A + B + C − 2O）。
 * 九點圓：圓心 N 是 OH 的中點、半徑 R／2，通過三邊中點、三高的垂足、頂點到垂心的三個中點。
 * 歐拉公式：OI^2 = R(R − 2r)，所以 R ≥ 2r，等號只在正三角形。 */
(function (root) {
  'use strict';
  const D2R = Math.PI / 180;

  function dist(P, Q) { return Math.hypot(P[0] - Q[0], P[1] - Q[1]); }
  function add(P, Q) { return [P[0] + Q[0], P[1] + Q[1]]; }
  function sub(P, Q) { return [P[0] - Q[0], P[1] - Q[1]]; }
  function mul(P, k) { return [P[0] * k, P[1] * k]; }
  function mid(P, Q) { return [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2]; }
  function clamp1(v) { return Math.max(-1, Math.min(1, v)); }
  function angleFrom(a, b, c) { return Math.acos(clamp1((a * a + b * b - c * c) / (2 * a * b))) / D2R; }
  function cross(A, B, C) { return (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]); }

  /** 三邊、三角、面積、周長、R、r */
  function measure(A, B, C) {
    const a = dist(B, C), b = dist(C, A), c = dist(A, B);
    const area = Math.abs(cross(A, B, C)) / 2;
    const deg = area < 1e-9 || Math.min(a, b, c) < 1e-9;
    const angA = deg ? NaN : angleFrom(b, c, a), angB = deg ? NaN : angleFrom(c, a, b);
    const angC = deg ? NaN : 180 - angA - angB;
    const s = (a + b + c) / 2;
    return { a: a, b: b, c: c, A: angA, B: angB, C: angC, area: area, s: s, perimeter: a + b + c,
      R: deg ? Infinity : a * b * c / (4 * area), r: deg ? 0 : area / s, degenerate: deg };
  }
  /** 銳角、直角、鈍角 */
  function kind(m, tol) {
    const t = tol === undefined ? 1e-6 : tol;
    const big = Math.max(m.A, m.B, m.C);
    if (isNaN(big)) return 'degenerate';
    return Math.abs(big - 90) <= t ? 'right' : big > 90 ? 'obtuse' : 'acute';
  }

  function centroid(A, B, C) { return [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3]; }
  function circumcenter(A, B, C) {
    const d = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1]));
    if (Math.abs(d) < 1e-12) return null;
    const a2 = A[0] * A[0] + A[1] * A[1], b2 = B[0] * B[0] + B[1] * B[1], c2 = C[0] * C[0] + C[1] * C[1];
    return [(a2 * (B[1] - C[1]) + b2 * (C[1] - A[1]) + c2 * (A[1] - B[1])) / d,
      (a2 * (C[0] - B[0]) + b2 * (A[0] - C[0]) + c2 * (B[0] - A[0])) / d];
  }
  /** 內心：以對邊長為權重的加權平均 (aA + bB + cC)／(a + b + c) */
  function incenter(A, B, C) {
    const a = dist(B, C), b = dist(C, A), c = dist(A, B), p = a + b + c;
    if (p < 1e-12) return null;
    return [(a * A[0] + b * B[0] + c * C[0]) / p, (a * A[1] + b * B[1] + c * C[1]) / p];
  }
  /** 垂心：直接解兩條高的交點（不經過外心，單元測試拿它驗證歐拉線） */
  function orthocenter(A, B, C) {
    // 過 A 垂直 BC：(X − A)·(C − B) = 0；過 B 垂直 CA：(X − B)·(A − C) = 0
    const u = sub(C, B), v = sub(A, C);
    const det = u[0] * v[1] - u[1] * v[0];
    if (Math.abs(det) < 1e-12) return null;
    const p = u[0] * A[0] + u[1] * A[1], q = v[0] * B[0] + v[1] * B[1];
    return [(p * v[1] - u[1] * q) / det, (u[0] * q - p * v[0]) / det];
  }
  /** 三個旁心（與 A、B、C 相對） */
  function excenters(A, B, C) {
    const a = dist(B, C), b = dist(C, A), c = dist(A, B);
    const f = (wa, wb, wc) => { const p = wa + wb + wc; return Math.abs(p) < 1e-12 ? null : [(wa * A[0] + wb * B[0] + wc * C[0]) / p, (wa * A[1] + wb * B[1] + wc * C[1]) / p]; };
    return [f(-a, b, c), f(a, -b, c), f(a, b, -c)];
  }
  /** P 在直線 UV 上的垂足 */
  function foot(P, U, V) {
    const d = sub(V, U), L2 = d[0] * d[0] + d[1] * d[1];
    if (L2 < 1e-18) return U.slice();
    const t = ((P[0] - U[0]) * d[0] + (P[1] - U[1]) * d[1]) / L2;
    return [U[0] + t * d[0], U[1] + t * d[1]];
  }
  /** 點到直線 UV 的距離 */
  function distLine(P, U, V) { return dist(P, foot(P, U, V)); }

  /** 全部的心與歐拉線的量 */
  function centers(A, B, C) {
    const m = measure(A, B, C);
    if (m.degenerate) return { m: m, degenerate: true };
    const G = centroid(A, B, C), O = circumcenter(A, B, C), I = incenter(A, B, C), H = orthocenter(A, B, C);
    const N = mid(O, H);
    const feet = [foot(A, B, C), foot(B, C, A), foot(C, A, B)];
    const mids = [mid(B, C), mid(C, A), mid(A, B)];
    const eul = [mid(A, H), mid(B, H), mid(C, H)];
    const OH = dist(O, H), OG = dist(O, G), GH = dist(G, H), OI = dist(O, I);
    return {
      m: m, degenerate: false, G: G, O: O, I: I, H: H, N: N, ex: excenters(A, B, C),
      feet: feet, mids: mids, eul: eul,
      R: m.R, r: m.r, nineR: m.R / 2,
      OH: OH, OG: OG, GH: GH, OI: OI, IN: dist(I, N),
      // 歐拉線的「比」：OG／OH（理論值 1／3）；正三角形時 OH = 0，比沒有意義
      ratio: OH > 1e-9 ? OG / OH : NaN,
      // 歐拉公式 OI^2 − R(R − 2r)（理論值 0）
      eulerGap: OI * OI - m.R * (m.R - 2 * m.r),
      // 九點圓與內切圓內切（費爾巴哈）：IN = R／2 − r
      feuerGap: dist(I, N) - (m.R / 2 - m.r),
      // 四心在不在三角形裡（嚴格在內部，容許 eps 的邊界算「在邊上」）
      where: { G: inside(G, A, B, C), O: inside(O, A, B, C), I: inside(I, A, B, C), H: inside(H, A, B, C) },
      // I 到歐拉線的距離（等腰時 I 也在歐拉線上）
      Ioff: OH > 1e-9 ? distLine(I, O, H) : 0,
      kind: kind(m)
    };
  }
  /** 點 P 相對於三角形：'in'（內部）、'on'（邊上，容許 eps）、'out'（外部） */
  function inside(P, A, B, C, eps) {
    const e = eps === undefined ? 1e-6 : eps;
    const s = cross(A, B, C) >= 0 ? 1 : -1;
    const ds = [distSigned(P, A, B, s), distSigned(P, B, C, s), distSigned(P, C, A, s)];
    const mn = Math.min(ds[0], ds[1], ds[2]);
    return mn > e ? 'in' : mn >= -e ? 'on' : 'out';
  }
  function distSigned(P, U, V, s) { const L = dist(U, V); return L < 1e-12 ? 0 : s * cross(U, V, P) / L; }

  /** 由三邊的標準擺法（A 原點、B 在 x 軸正向、C 在上方） */
  function place(a, b, c) {
    const x = (b * b + c * c - a * a) / (2 * c);
    return { A: [0, 0], B: [c, 0], C: [x, Math.sqrt(Math.max(0, b * b - x * x))] };
  }

  /** 等腰？回傳相等的那兩邊所夾的頂點（'A'、'B'、'C'），或 null；容許 tol */
  function isosceles(m, tol) {
    const t = tol === undefined ? 1e-6 : tol;
    if (Math.abs(m.b - m.c) <= t) return 'A';
    if (Math.abs(m.c - m.a) <= t) return 'B';
    if (Math.abs(m.a - m.b) <= t) return 'C';
    return null;
  }

  /** 兩條直線（方向 u、v）的夾角，0°–90° */
  function lineAngle(u, v) {
    const L = Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]);
    if (L < 1e-18) return NaN;
    return Math.acos(Math.min(1, Math.abs(u[0] * v[0] + u[1] * v[1]) / L)) / D2R;
  }
  /** 任務與讀數要用的量（頁面與任務證明共用，保證一致） */
  function features(A, B, C) {
    const c = centers(A, B, C);
    if (c.degenerate) return { ok: false };
    const m = c.m, V = [A, B, C], opp = [m.a, m.b, m.c], ang = [m.A, m.B, m.C];
    const sides = [sub(C, B), sub(A, C), sub(B, A)];
    const R = m.R;
    const big = Math.max(m.A, m.B, m.C), small = Math.min(m.A, m.B, m.C);
    const VH = V.map(function (P) { return dist(P, c.H); });
    // 頂點到垂心的距離與外接圓半徑、與對邊的相對差（最小的那個）
    let hR = Infinity, hSide = Infinity, hBis = Infinity;
    for (let k = 0; k < 3; k++) {
      hR = Math.min(hR, Math.abs(VH[k] - R) / R);
      hSide = Math.min(hSide, Math.abs(VH[k] - opp[k]) / opp[k]);
      // 垂心平分高 VD：VH = HD（只在銳角三角形有意義）
      const D = c.feet[k], VD = dist(V[k], D);
      hBis = Math.min(hBis, Math.abs(VH[k] - dist(c.H, D)) / VD);
    }
    const OHv = sub(c.H, c.O), OIv = sub(c.I, c.O);
    const eulerPar = c.OH >= 0.1 * R ? Math.min(lineAngle(OHv, sides[0]), lineAngle(OHv, sides[1]), lineAngle(OHv, sides[2])) : NaN;
    const oiPar = c.OI >= 0.1 * R ? Math.min(lineAngle(OIv, sides[0]), lineAngle(OIv, sides[1]), lineAngle(OIv, sides[2])) : NaN;
    let oiPerp = NaN;
    if (c.OI >= 0.1 * R) {
      oiPerp = Infinity;
      for (let k = 0; k < 3; k++) oiPerp = Math.min(oiPerp, 90 - lineAngle(OIv, sub(c.I, V[k])));
    }
    const ks = ['G', 'O', 'I', 'H'];
    let spread = 0;
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) spread = Math.max(spread, dist(c[ks[i]], c[ks[j]]));
    const iso = isosceles(m, 1e-9 * (1 + m.perimeter));
    const isInt = function (v) { return Math.abs(v - Math.round(v)) <= 1e-6; };
    return {
      ok: true, a: m.a, b: m.b, c: m.c, A: m.A, B: m.B, C: m.C, area: m.area, perimeter: m.perimeter,
      R: R, r: m.r, Rr: R / m.r, kind: kind(m, 1e-6), big: big, small: small,
      iso: iso, equi: Math.abs(m.a - m.b) <= 1e-9 * (1 + m.perimeter) && Math.abs(m.b - m.c) <= 1e-9 * (1 + m.perimeter),
      where: c.where, Nwhere: inside(c.N, A, B, C),
      OH: c.OH, OG: c.OG, GH: c.GH, OI: c.OI, Ioff: c.Ioff, ratio: c.ratio, nineR: c.nineR,
      Hvert: Math.min(VH[0], VH[1], VH[2]),
      Hedge: c.where.H === 'out' ? Math.min(distLine(c.H, A, B), distLine(c.H, B, C), distLine(c.H, C, A)) : 0,
      spread: spread / R, hR: hR, hSide: hSide, hBis: hBis, eulerPar: eulerPar, oiPar: oiPar, oiPerp: oiPerp,
      oir: Math.abs(c.OI - m.r) / m.r,
      oi2r: Math.abs(c.OI - 2 * m.r) / m.r,
      // 九點圓圓心、垂心到內心的距離與 r 的相對差（N 在內切圓上 ⇔ R = 4r）
      nr: Math.abs(c.IN - m.r) / m.r, hr: Math.abs(dist(c.H, c.I) - m.r) / m.r,
      intSides: isInt(m.a) && isInt(m.b) && isInt(m.c), intR: isInt(m.r),
      angs: ang
    };
  }

  /** 挑戰：「這是哪一心？」——隨機三角形上標出一個點，學生選 G、O、I、H。
   *  出題時避開四心太靠近（彼此距離至少 0.6）與太扁的三角形。 */
  function challenge(rand) {
    const R = rand || Math.random;
    for (let k = 0; k < 400; k++) {
      const P = [[0, 0], [0, 0], [0, 0]].map(() => [Math.round((R() * 10 - 5) * 2) / 2, Math.round((R() * 7 - 3) * 2) / 2]);
      const m = measure(P[0], P[1], P[2]);
      if (m.degenerate || m.area < 6 || Math.min(m.A, m.B, m.C) < 20) continue;
      const c = centers(P[0], P[1], P[2]);
      const keys = ['G', 'O', 'I', 'H'];
      let ok = true;
      for (let i = 0; i < 4 && ok; i++) for (let j = i + 1; j < 4; j++) if (dist(c[keys[i]], c[keys[j]]) < 0.6) { ok = false; break; }
      if (!ok) continue;
      // 垂心、外心不要跑太遠（畫面放得下）
      if (Math.max(Math.abs(c.H[0]), Math.abs(c.H[1]), Math.abs(c.O[0]), Math.abs(c.O[1])) > 9) continue;
      const ask = keys[Math.floor(R() * 4)];
      return { P: P, ask: ask, at: c[ask] };
    }
    return { P: [[-3, -2], [4, -2], [1, 3]], ask: 'H', at: orthocenter([-3, -2], [4, -2], [1, 3]) };
  }

  const api = { dist: dist, add: add, sub: sub, mul: mul, mid: mid, cross: cross, measure: measure, kind: kind,
    centroid: centroid, circumcenter: circumcenter, incenter: incenter, orthocenter: orthocenter, excenters: excenters,
    foot: foot, distLine: distLine, centers: centers, inside: inside, place: place, isosceles: isosceles, challenge: challenge,
    lineAngle: lineAngle, features: features };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TCCore = api;
})(typeof window !== 'undefined' ? window : this);
