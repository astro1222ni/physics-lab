/* linear-transform-core.js — 「矩陣與線性變換」的數學核心（純函式，瀏覽器與 Node 共用）
 *
 * 矩陣一律用「列」的陣列：2×2 是 [[a, b], [c, d]]，3×3 是 [[…], […], […]]。
 * 矩陣乘向量 A v；A 的第 1 行（直行）就是 e1 = (1, 0) 變過去的位置，第 2 行是 e2 變過去的位置。
 * 2×2：行列式＝有號面積倍率、特徵值與特徵向量（判別式 tr² − 4 det）、奇異值（單位圓變成橢圓的半軸）。
 * 3×3：行列式＝有號體積倍率、秩（高斯消去法）。
 * 挑戰：給一個整數矩陣變形後的圖，學生調出同一個矩陣。 */
(function (root) {
  'use strict';
  const DEG = Math.PI / 180;
  const EPS = 1e-9;

  function trim(v, dec) {
    if (v == null || !isFinite(v)) return '—';
    let s = (+v).toFixed(dec == null ? 2 : dec);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === '-0') s = '0';
    return s;
  }

  // ---------------------------------------------------------------- 2×2
  const I2 = [[1, 0], [0, 1]];
  function apply2(M, v) { return [M[0][0] * v[0] + M[0][1] * v[1], M[1][0] * v[0] + M[1][1] * v[1]]; }
  function det2(M) { return M[0][0] * M[1][1] - M[0][1] * M[1][0]; }
  function tr2(M) { return M[0][0] + M[1][1]; }
  function mul2(A, B) {
    return [[A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
      [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]]];
  }
  function inv2(M) {
    const d = det2(M);
    if (Math.abs(d) < EPS) return null;
    return [[M[1][1] / d, -M[0][1] / d], [-M[1][0] / d, M[0][0] / d]];
  }
  function maxAbs(M) { let m = 0; M.forEach(function (r) { r.forEach(function (x) { m = Math.max(m, Math.abs(x)); }); }); return m; }
  /** (1 − t) I + t A：從單位矩陣漸變到 A */
  function lerpI(A, t) { return A.map(function (r, i) { return r.map(function (x, j) { return (1 - t) * (i === j ? 1 : 0) + t * x; }); }); }
  function rank2(M, tol) {
    tol = tol == null ? 1e-9 : tol;
    if (maxAbs(M) <= tol) return 0;
    return Math.abs(det2(M)) <= tol * Math.max(1, maxAbs(M)) ? 1 : 2;
  }
  function unit2(v) { const n = Math.hypot(v[0], v[1]); return n > 0 ? [v[0] / n, v[1] / n] : null; }
  /** 秩 1 的 2×2 矩陣 N 的零空間方向（N v = 0） */
  function null2(N) {
    const r0 = Math.abs(N[0][0]) + Math.abs(N[0][1]), r1 = Math.abs(N[1][0]) + Math.abs(N[1][1]);
    const v = r0 >= r1 ? [-N[0][1], N[0][0]] : [-N[1][1], N[1][0]];
    return unit2(v);
  }
  /** 特徵值與特徵向量。kind：distinct（兩個不同實根）、repeated（重根、只有一個方向）、scalar（λI，每個方向都是）、complex（沒有實數特徵向量） */
  function eig2(M) {
    const t = tr2(M), d = det2(M), disc = t * t - 4 * d;
    const tol = 1e-9 * (1 + t * t + Math.abs(d));
    if (disc < -tol) return { kind: 'complex', tr: t, det: d, disc: disc, re: t / 2, im: Math.sqrt(-disc) / 2, vals: [], vecs: [] };
    if (disc <= tol) {
      const l = t / 2, N = [[M[0][0] - l, M[0][1]], [M[1][0], M[1][1] - l]];
      if (maxAbs(N) <= 1e-9) return { kind: 'scalar', tr: t, det: d, disc: 0, vals: [l, l], vecs: [] };
      return { kind: 'repeated', tr: t, det: d, disc: 0, vals: [l], vecs: [null2(N)] };
    }
    const s = Math.sqrt(disc), l1 = (t + s) / 2, l2 = (t - s) / 2;
    const v = [l1, l2].map(function (l) { return null2([[M[0][0] - l, M[0][1]], [M[1][0], M[1][1] - l]]); });
    return { kind: 'distinct', tr: t, det: d, disc: disc, vals: [l1, l2], vecs: v };
  }
  /** 奇異值：單位圓變成的橢圓的兩個半軸長（σ1 ≥ σ2 ≥ 0，σ1 σ2 = |det|） */
  function sing2(M) {
    const S = M[0][0] * M[0][0] + M[0][1] * M[0][1] + M[1][0] * M[1][0] + M[1][1] * M[1][1];
    const D = Math.abs(det2(M));
    const r = Math.sqrt(Math.max(0, S * S - 4 * D * D));
    const s1 = Math.sqrt((S + r) / 2), s2 = (S + r) > 0 ? 2 * D / Math.sqrt(2 * (S + r)) : 0;
    return [s1, s2];
  }
  /** 探針向量 x 和 A x 的關係：lambda = x·Ax / |x|²，sin 是兩者夾角的正弦（同向或反向都算平行） */
  function probe(M, x) {
    const y = apply2(M, x), nx = Math.hypot(x[0], x[1]), ny = Math.hypot(y[0], y[1]);
    if (nx < EPS) return { y: y, nx: 0, ny: ny, lambda: null, sin: null, ang: null };
    const lambda = (x[0] * y[0] + x[1] * y[1]) / (nx * nx);
    const sin = ny < EPS ? 0 : Math.abs(x[0] * y[1] - x[1] * y[0]) / (nx * ny);
    const ang = ny < EPS ? null : Math.atan2(x[0] * y[1] - x[1] * y[0], x[0] * y[0] + x[1] * y[1]) / DEG;
    return { y: y, nx: nx, ny: ny, lambda: lambda, sin: sin, ang: ang };
  }
  function diag2(M, tol) { tol = tol == null ? 0.005 : tol; return Math.abs(M[0][1]) <= tol && Math.abs(M[1][0]) <= tol; }
  function near2(A, B, tol) { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) if (Math.abs(A[i][j] - B[i][j]) > tol) return false; return true; }

  // ---------------------------------------------------------------- 3×3
  const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  function apply3(M, v) { return [0, 1, 2].map(function (i) { return M[i][0] * v[0] + M[i][1] * v[1] + M[i][2] * v[2]; }); }
  function det3(M) {
    return M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  }
  function mul3(A, B) { return [0, 1, 2].map(function (i) { return [0, 1, 2].map(function (j) { return A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j]; }); }); }
  function col(M, j) { return M.map(function (r) { return r[j]; }); }
  function cross(u, v) { return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; }
  function dot3(u, v) { return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]; }
  function norm3(u) { return Math.hypot(u[0], u[1], u[2]); }
  /** 秩：部分選主元的高斯消去法；tol 是相對於最大元素的容許值 */
  function rank3(M, tol) {
    const A = M.map(function (r) { return r.slice(); });
    const scale = Math.max(1e-300, maxAbs(A));
    tol = (tol == null ? 1e-9 : tol) * Math.max(1, scale);
    let rank = 0, row = 0;
    for (let c = 0; c < 3 && row < 3; c++) {
      let p = row;
      for (let r = row + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) <= tol) continue;
      const tmp = A[p]; A[p] = A[row]; A[row] = tmp;
      for (let r = row + 1; r < 3; r++) {
        const f = A[r][c] / A[row][c];
        for (let k = c; k < 3; k++) A[r][k] -= f * A[row][k];
      }
      row++; rank++;
    }
    return rank;
  }
  /** 三角矩陣（上三角或下三角，含對角） */
  function triangular3(M, tol) {
    tol = tol == null ? 0.005 : tol;
    const lower = Math.abs(M[1][0]) <= tol && Math.abs(M[2][0]) <= tol && Math.abs(M[2][1]) <= tol;
    const upper = Math.abs(M[0][1]) <= tol && Math.abs(M[0][2]) <= tol && Math.abs(M[1][2]) <= tol;
    return lower || upper;
  }
  /** 兩個向量平行（含其中一個是 0） */
  function parallel3(u, v, tol) {
    const nu = norm3(u), nv = norm3(v);
    if (nu < EPS || nv < EPS) return true;
    return norm3(cross(u, v)) <= (tol == null ? 1e-6 : tol) * nu * nv;
  }
  /** 單位立方體：8 個頂點（二進位 xyz）、6 個面（逆時針看向外）、12 條邊 */
  const CUBE_V = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const CUBE_F = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
  const CUBE_E = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];
  /** 視角：yaw（繞 z 軸）、pitch（仰角）；e 是看過來的方向（朝觀察者），r 向右，u 向上；z 軸朝上 */
  function viewBasis(yawDeg, pitchDeg) {
    const t = yawDeg * DEG, p = pitchDeg * DEG;
    const ct = Math.cos(t), st = Math.sin(t), cp = Math.cos(p), sp = Math.sin(p);
    return { e: [cp * ct, cp * st, sp], r: [-st, ct, 0], u: [-sp * ct, -sp * st, cp] };
  }
  function project(B, p) { return { x: dot3(p, B.r), y: dot3(p, B.u), z: dot3(p, B.e) }; }

  // ---------------------------------------------------------------- 挑戰
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const CHAL_TOL = 0.05;
  /** 出題：元素是 −2 到 2 的整數、行列式不是 0 且絕對值 ≤ 4、不是單位矩陣、至少一個非對角元素不是 0、和上一題不同 */
  function genChallenge(rand, prev) {
    for (let k = 0; k < 500; k++) {
      const q = function () { return Math.floor(rand() * 5) - 2; };
      const M = [[q(), q()], [q(), q()]];
      const d = det2(M);
      if (d === 0 || Math.abs(d) > 4) continue;
      if (near2(M, I2, 0)) continue;
      if (M[0][1] === 0 && M[1][0] === 0) continue;
      if (prev && near2(M, prev.M, 0)) continue;
      return { M: M };
    }
    return null;
  }
  function chalHit(chg, M) { return !!chg && near2(chg.M, M, CHAL_TOL + 1e-9); }

  // ---------------------------------------------------------------- 文字
  /** 「F」形的小旗子（在單位正方形裡，左右上下都不對稱，翻面看得出來） */
  const FLAG = [[0.2, 0.1], [0.4, 0.1], [0.4, 0.45], [0.68, 0.45], [0.68, 0.6], [0.4, 0.6], [0.4, 0.75], [0.8, 0.75], [0.8, 0.9], [0.2, 0.9]];
  function matTex(M, dec) {
    return '\\begin{bmatrix}' + M.map(function (r) { return r.map(function (x) { return trim(x, dec == null ? 2 : dec); }).join(' & '); }).join(' \\\\ ') + '\\end{bmatrix}';
  }

  const api = {
    DEG: DEG, EPS: EPS, CHAL_TOL: CHAL_TOL, I2: I2, I3: I3, FLAG: FLAG,
    CUBE_V: CUBE_V, CUBE_F: CUBE_F, CUBE_E: CUBE_E,
    trim: trim, apply2: apply2, det2: det2, tr2: tr2, mul2: mul2, inv2: inv2, maxAbs: maxAbs, lerpI: lerpI, rank2: rank2,
    unit2: unit2, eig2: eig2, sing2: sing2, probe: probe, diag2: diag2, near2: near2,
    apply3: apply3, det3: det3, mul3: mul3, col: col, cross: cross, dot3: dot3, norm3: norm3, rank3: rank3, triangular3: triangular3, parallel3: parallel3,
    viewBasis: viewBasis, project: project,
    rng: rng, genChallenge: genChallenge, chalHit: chalHit, matTex: matTex
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LinearTransformCore = api;
})(this);
