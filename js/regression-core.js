/* regression-core.js — 「散布圖、相關係數與迴歸直線」的數學核心（純函式，瀏覽器與 Node 共用）
 *
 * 點 = [x, y]。標準差照高中課本用母體標準差（除以 n）；相關係數、迴歸直線的斜率與除以 n 或 n − 1 無關。
 *   相關係數  r = Sxy / √(Sxx · Syy)，Sxx = Σ(x − x̄)²、Syy = Σ(y − ȳ)²、Sxy = Σ(x − x̄)(y − ȳ)
 *   最小平方迴歸直線  y = ȳ + r·(sy/sx)·(x − x̄)，斜率 m = Sxy / Sxx
 *   殘差平方和的最小值  SSE = Syy·(1 − r²)
 * 另有：任意直線的殘差平方和、二次擬合的 R²（隱藏任務用）、照指定 r 造資料、安斯康姆四重奏、挑戰（猜 r）。 */
(function (root) {
  'use strict';

  const XR = [0, 20], YR = [0, 20];      // 畫面上的坐標範圍（x、y 同一個單位長，殘差平方才是真正的正方形）
  const N_MAX = 60;                      // 最多幾個點
  const SNAP = 0.5;                      // 對齊格線的間隔

  function round6(v) { return Math.round(v * 1e6) / 1e6; }
  function trim(v, dec) {
    if (v == null || !isFinite(v)) return '—';
    let s = (+v).toFixed(dec == null ? 2 : dec);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === '-0') s = '0';
    return s;
  }
  function clampPt(p) { return [Math.max(XR[0], Math.min(XR[1], p[0])), Math.max(YR[0], Math.min(YR[1], p[1]))]; }
  function snap(v, step) { const s = step || SNAP; return Math.round(v / s) * s; }

  /** 各種統計量；點少於 2 個或 x、y 全相同時，r 與迴歸直線是 null */
  function stats(pts) {
    const n = pts.length;
    if (!n) return { n: 0, mx: null, my: null, sx: null, sy: null, Sxx: 0, Syy: 0, Sxy: 0, r: null, m: null, c: null, sse: null };
    let mx = 0, my = 0;
    for (let i = 0; i < n; i++) { mx += pts[i][0]; my += pts[i][1]; }
    mx /= n; my /= n;
    let Sxx = 0, Syy = 0, Sxy = 0;
    for (let i = 0; i < n; i++) {
      const dx = pts[i][0] - mx, dy = pts[i][1] - my;
      Sxx += dx * dx; Syy += dy * dy; Sxy += dx * dy;
    }
    const tiny = 1e-12 * Math.max(1, mx * mx + my * my) * n;
    const okX = Sxx > tiny, okY = Syy > tiny;
    let r = okX && okY ? Sxy / Math.sqrt(Sxx * Syy) : null;
    if (r != null) r = Math.max(-1, Math.min(1, r));
    const m = okX ? Sxy / Sxx : null;
    const c = m == null ? null : my - m * mx;
    return {
      n: n, mx: mx, my: my, sx: Math.sqrt(Sxx / n), sy: Math.sqrt(Syy / n), Sxx: Sxx, Syy: Syy, Sxy: Sxy,
      cov: Sxy / n, r: r, m: m, c: c,
      sse: m == null ? null : Math.max(0, Syy - Sxy * Sxy / Sxx)
    };
  }
  /** 直線 y = m x + c 的殘差平方和 */
  function sse(pts, m, c) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) { const e = pts[i][1] - (m * pts[i][0] + c); s += e * e; }
    return s;
  }
  /** 殘差（y − ŷ） */
  function residuals(pts, m, c) { return pts.map(function (p) { return p[1] - (m * p[0] + c); }); }
  /** z 分數（標準化）；標準差是 0 時回傳 null */
  function zscores(pts) {
    const s = stats(pts);
    if (!s.n || !(s.sx > 0) || !(s.sy > 0)) return null;
    return pts.map(function (p) { return [(p[0] - s.mx) / s.sx, (p[1] - s.my) / s.sy]; });
  }

  /** 解 3×3 線性方程組（高斯消去，部分選主元）；奇異時回傳 null */
  function solve3(A, b) {
    const M = A.map(function (row, i) { return row.concat([b[i]]); });
    for (let k = 0; k < 3; k++) {
      let p = k;
      for (let i = k + 1; i < 3; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
      if (Math.abs(M[p][k]) < 1e-12) return null;
      const t = M[k]; M[k] = M[p]; M[p] = t;
      for (let i = k + 1; i < 3; i++) {
        const f = M[i][k] / M[k][k];
        for (let j = k; j < 4; j++) M[i][j] -= f * M[k][j];
      }
    }
    const x = [0, 0, 0];
    for (let i = 2; i >= 0; i--) {
      let s = M[i][3];
      for (let j = i + 1; j < 3; j++) s -= M[i][j] * x[j];
      x[i] = s / M[i][i];
    }
    return x;
  }
  /** 二次擬合 y = a x² + b x + c（用 x − x̄ 置中以免數值問題）；回傳 { a, R2 }，點少於 3 個或 x 不到 3 種時回傳 null */
  function quadFit(pts) {
    const s = stats(pts);
    if (s.n < 3) return null;
    const xs = {};
    pts.forEach(function (p) { xs[round6(p[0])] = true; });
    if (Object.keys(xs).length < 3) return null;
    let S0 = 0, S1 = 0, S2 = 0, S3 = 0, S4 = 0, T0 = 0, T1 = 0, T2 = 0;
    pts.forEach(function (p) {
      const u = p[0] - s.mx, y = p[1], u2 = u * u;
      S0 += 1; S1 += u; S2 += u2; S3 += u2 * u; S4 += u2 * u2;
      T0 += y; T1 += u * y; T2 += u2 * y;
    });
    const q = solve3([[S4, S3, S2], [S3, S2, S1], [S2, S1, S0]], [T2, T1, T0]);
    if (!q) return null;
    let res = 0;
    pts.forEach(function (p) { const u = p[0] - s.mx, e = p[1] - (q[0] * u * u + q[1] * u + q[2]); res += e * e; });
    return { a: q[0], R2: s.Syy > 0 ? 1 - res / s.Syy : null };
  }

  // ---------- 亂數 ----------
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
  function gauss(rand) {
    let u = 0, v = 0;
    while (u < 1e-12) u = rand();
    v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  /**
   * 造一組相關係數「剛好」是 rho 的資料：先抽 x 與雜訊，把雜訊對 x 做正交化，再組合 y = rho·zx + √(1 − rho²)·ze。
   * 再縮放平移到畫面範圍（cx、cy 是中心，sx、sy 是標準差）；放不進範圍時重抽。opt：{ n, cx, cy, sx, sy, snap }
   */
  function makeCloud(rand, rho, opt) {
    opt = opt || {};
    const n = opt.n || 12, cx = opt.cx == null ? 10 : opt.cx, cy = opt.cy == null ? 10 : opt.cy;
    const sx = opt.sx || 3.6, sy = opt.sy || 3.6;
    for (let tries = 0; tries < 200; tries++) {
      const x = [], e = [];
      for (let i = 0; i < n; i++) { x.push(gauss(rand)); e.push(gauss(rand)); }
      const z = standardize(x);
      if (!z) continue;
      // 雜訊減去在 z 上的投影，再標準化
      let d = 0;
      for (let i = 0; i < n; i++) d += e[i] * z[i];
      const e2 = e.map(function (v, i) { return v - d / n * z[i]; });
      const w = standardize(e2);
      if (!w) continue;
      const k = Math.sqrt(Math.max(0, 1 - rho * rho));
      const pts = z.map(function (zx, i) { return [cx + sx * zx, cy + sy * (rho * zx + k * w[i])]; });
      if (pts.every(function (p) { return p[0] >= XR[0] + 0.3 && p[0] <= XR[1] - 0.3 && p[1] >= YR[0] + 0.3 && p[1] <= YR[1] - 0.3; })) {
        return pts.map(function (p) { return [round6(p[0]), round6(p[1])]; });
      }
    }
    return null;
  }
  function standardize(a) {
    const n = a.length;
    let m = 0;
    for (let i = 0; i < n; i++) m += a[i];
    m /= n;
    let v = 0;
    for (let i = 0; i < n; i++) v += (a[i] - m) * (a[i] - m);
    v = Math.sqrt(v / n);
    if (!(v > 1e-9)) return null;
    return a.map(function (t) { return (t - m) / v; });
  }

  // ---------- 資料 ----------
  // 安斯康姆四重奏（F. J. Anscombe, 1973, The American Statistician 27(1): 17–21）：四組資料的平均、標準差、r、迴歸直線幾乎一樣，圖卻完全不同。
  const ANS_X = [10, 8, 13, 9, 11, 14, 6, 4, 12, 7, 5];
  const ANSCOMBE = {
    I: ANS_X.map(function (x, i) { return [x, [8.04, 6.95, 7.58, 8.81, 8.33, 9.96, 7.24, 4.26, 10.84, 4.82, 5.68][i]]; }),
    II: ANS_X.map(function (x, i) { return [x, [9.14, 8.14, 8.74, 8.77, 9.26, 8.10, 6.13, 3.10, 9.13, 7.26, 4.74][i]]; }),
    III: ANS_X.map(function (x, i) { return [x, [7.46, 6.77, 12.74, 7.11, 7.81, 8.84, 6.08, 5.39, 8.15, 6.42, 5.73][i]]; }),
    IV: [8, 8, 8, 8, 8, 8, 8, 19, 8, 8, 8].map(function (x, i) { return [x, [6.58, 5.76, 7.71, 8.84, 8.47, 7.04, 5.25, 12.50, 5.56, 7.91, 6.89][i]]; })
  };
  /** 預設資料：12 個點，r ≈ 0.67（固定，不觸發任何任務） */
  const DEFAULT = [[2.5, 6], [4, 3], [5, 9], [6.5, 5], [7.5, 11.5], [8.5, 6.5], [10, 12], [11, 7.5], [12.5, 14], [14, 9], [15.5, 15.5], [17, 10.5]];
  /** 範例資料按鈕：相關係數剛好是這些值（固定種子） */
  const PRESETS = { pos: 0.8, neg: -0.8, none: 0.1 };
  function preset(key) {
    if (key === 'default') return DEFAULT.map(function (p) { return p.slice(); });
    if (ANSCOMBE[key]) return ANSCOMBE[key].map(function (p) { return p.slice(); });
    if (PRESETS[key] == null) return [];
    const seed = { pos: 11, neg: 23, none: 37 }[key];
    return makeCloud(rng(seed), PRESETS[key], { n: 16 });
  }

  // ---------- 挑戰：猜相關係數 ----------
  const CHAL_TOL = 0.05;
  /** 出一題：r 在 −0.95 到 0.95 之間（和上一題至少差 0.25），點數 10–40，中心與分散度也隨機 */
  function genChallenge(rand, prev) {
    for (let k = 0; k < 50; k++) {
      const r = Math.round((rand() * 1.9 - 0.95) * 100) / 100;
      if (prev && Math.abs(r - prev.r) < 0.25) continue;
      const n = 10 + Math.floor(rand() * 31);
      const sx = 2.4 + rand() * 1.6, sy = 2.4 + rand() * 1.6;
      const pts = makeCloud(rand, r, { n: n, sx: sx, sy: sy, cx: 9 + rand() * 2, cy: 9 + rand() * 2 });
      if (!pts) continue;
      const real = stats(pts).r;
      return { r: real, n: n, pts: pts };
    }
    return null;
  }
  function chalHit(ch, guess) { return Math.abs(guess - ch.r) <= CHAL_TOL + 1e-9; }

  const api = {
    XR: XR, YR: YR, N_MAX: N_MAX, SNAP: SNAP, ANSCOMBE: ANSCOMBE, DEFAULT: DEFAULT, PRESETS: PRESETS, CHAL_TOL: CHAL_TOL,
    round6: round6, trim: trim, clampPt: clampPt, snap: snap,
    stats: stats, sse: sse, residuals: residuals, zscores: zscores, quadFit: quadFit, solve3: solve3,
    rng: rng, gauss: gauss, makeCloud: makeCloud, preset: preset, genChallenge: genChallenge, chalHit: chalHit
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RegressionCore = api;
})(typeof window !== 'undefined' ? window : this);
