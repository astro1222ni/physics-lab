/* parallax-core.js — 恆星視差與秒差距（純函式，Node 與瀏覽器共用）
 *
 * 單位：視差 p 用角秒（″）；距離 d 用秒差距（pc），d = 1/p；1 pc = 206264.806 AU = 3.26156 光年。
 * 地球軌道當成半徑 1 AU 的圓；太陽的黃經 λ⊙ = 280.46° + 360°·t（t：從 1 月 1 日起算的年數，平太陽）。
 * 視差位移（小角度）：觀測者在日心位置 R（AU），恆星方向的單位向量 s，恆星看起來偏移 −R⊥/d（弧度），R⊥ = R − (R·s)s。
 *   投影到黃道座標的切平面：Δλ·cosβ = p·sin(λ⊙ − λ)，Δβ = −p·sinβ·cos(λ⊙ − λ)：一年畫一個橢圓，半長軸 p、半短軸 p|sinβ|。
 * 自行 μ（″/年）讓恆星沿直線移動；兩者合起來就是 Gaia 看到的螺旋線。
 * 量測：每張照片的位置有隨機誤差 σ（″）；用最小平方法同時解出 x0、y0、μx、μy、p（五個參數），或已知沒有自行時只解 x0、y0、p。
 * 拉長基線：兩個觀測者相距 B（AU，和恆星方向垂直），恆星的角位移 θ（″）= B / d（pc）。
 */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.ParCore = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const AU_PER_PC = 206264.806;    // 1 pc 是多少 AU（= 1 弧度的角秒數）
  const LY_PER_PC = 3.26156;
  const KM_PER_AU = 1.495978707e8;
  const OBL = 23.4393;             // 黃赤交角（°）
  const LSUN0 = 280.46;            // 1 月 1 日太陽的平黃經（°）
  const rad = Math.PI / 180;

  /** 赤道座標（°）→ 黃道座標（°） */
  function eqToEcl(ra, dec) {
    const a = ra * rad, d = dec * rad, e = OBL * rad;
    const x = Math.cos(d) * Math.cos(a), y = Math.cos(d) * Math.sin(a), z = Math.sin(d);
    const y2 = y * Math.cos(e) + z * Math.sin(e), z2 = -y * Math.sin(e) + z * Math.cos(e);
    let lam = Math.atan2(y2, x) / rad; if (lam < 0) lam += 360;
    return { lam: lam, beta: Math.asin(Math.max(-1, Math.min(1, z2))) / rad };
  }
  /** 赤道座標的自行（μα*, μδ）轉成黃道座標的自行（μλ*, μβ），單位不變 */
  function pmToEcl(ra, dec, pmra, pmdec) {
    const a = ra * rad, d = dec * rad, e = OBL * rad;
    const toE = function (v) { return [v[0], v[1] * Math.cos(e) + v[2] * Math.sin(e), -v[1] * Math.sin(e) + v[2] * Math.cos(e)]; };
    const eA = toE([-Math.sin(a), Math.cos(a), 0]);
    const eD = toE([-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)]);
    const ec = eqToEcl(ra, dec), l = ec.lam * rad, b = ec.beta * rad;
    const eL = [-Math.sin(l), Math.cos(l), 0], eB = [-Math.sin(b) * Math.cos(l), -Math.sin(b) * Math.sin(l), Math.cos(b)];
    const dot = function (u, v) { return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]; };
    return { x: pmra * dot(eA, eL) + pmdec * dot(eD, eL), y: pmra * dot(eA, eB) + pmdec * dot(eD, eB) };
  }

  /** 太陽的黃經（°），t 是從 1 月 1 日起的年數 */
  function sunLon(t) { return ((LSUN0 + 360 * t) % 360 + 360) % 360; }
  /** 地球的日心位置（AU，黃道座標） */
  function earthPos(t) { const l = sunLon(t) * rad; return [-Math.cos(l), -Math.sin(l), 0]; }

  /** 視差因子：p = 1″ 時的位移（″），{ x: Δλcosβ, y: Δβ } */
  function pfactor(lam, beta, t) {
    const q = (sunLon(t) - lam) * rad;
    return { x: Math.sin(q), y: -Math.sin(beta * rad) * Math.cos(q) };
  }
  /** 一般的視差位移（向量算法）：觀測者在 R（AU），恆星在 λ、β、視差 p（″） */
  function shiftAt(R, lam, beta, p) {
    const l = lam * rad, b = beta * rad;
    const eL = [-Math.sin(l), Math.cos(l), 0], eB = [-Math.sin(b) * Math.cos(l), -Math.sin(b) * Math.sin(l), Math.cos(b)];
    return { x: -p * (R[0] * eL[0] + R[1] * eL[1] + R[2] * eL[2]), y: -p * (R[0] * eB[0] + R[1] * eB[1] + R[2] * eB[2]) };
  }
  /** 恆星在時間 t 的視位置（″，相對 t = 0 不計視差的位置）：自行＋視差 */
  function apparent(star, t) {
    const f = pfactor(star.lam, star.beta, t);
    return { x: star.mux * t + star.p * f.x, y: star.muy * t + star.p * f.y };
  }

  /** 距離換算 */
  function distOf(p) {
    if (!(p > 0)) return null;
    const pc = 1 / p;
    return { pc: pc, ly: pc * LY_PER_PC, au: pc * AU_PER_PC, km: pc * AU_PER_PC * KM_PER_AU, lightYears: pc * LY_PER_PC };
  }
  /** 拉長基線：兩個觀測者相距 B（AU），恆星距離 d（pc）→ 角位移（″） */
  function baselineShift(B, dpc) { return B / dpc; }

  // ───── 量測 ─────
  /** 決定性的常態亂數（同一個種子、同一個序號永遠得到同一個值） */
  function gauss(seed, k) {
    const u = function (i) { let h = (seed * 374761393 + i * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return ((h >>> 0) + 0.5) / 4294967296; };
    const a = u(2 * k + 1), b = u(2 * k + 2);
    return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
  }
  /** 拍一張照片：真實位置加上誤差 σ */
  function photo(star, t, sigma, seed, k) {
    const a = apparent(star, t);
    return { t: t, x: a.x + sigma * gauss(seed, 2 * k), y: a.y + sigma * gauss(seed, 2 * k + 1), sigma: sigma };
  }
  /** 解線性方程組（高斯消去，部分選主元）；奇異時傳回 null */
  function solve(A, b) {
    const n = b.length, M = A.map(function (r, i) { return r.slice().concat([b[i]]); });
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      if (Math.abs(M[piv][c]) < 1e-14) return null;
      const tmp = M[c]; M[c] = M[piv]; M[piv] = tmp;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map(function (r, i) { return r[n] / r[i]; });
  }
  function inverse(A) {
    const n = A.length, out = [];
    for (let j = 0; j < n; j++) { const e = new Array(n).fill(0); e[j] = 1; const col = solve(A, e); if (!col) return null; out.push(col); }
    return A.map(function (_, i) { return out.map(function (col) { return col[i]; }); });
  }
  /**
   * 由照片解出視差。photos：[{ t, x, y, sigma }]；lam、beta：恆星的黃道座標；withPM：同時解自行。
   * 傳回 { p, sp（p 的標準差）, mux, muy, smu, n, span（時間跨度，年）, chi2 }；照片不夠或無法解時傳回 null。
   */
  function fit(photos, lam, beta, withPM) {
    const np = withPM ? 5 : 3, n = photos.length;
    if (2 * n < np + 1) return null;
    const A = [], b = [];
    for (let i = 0; i < np; i++) { A.push(new Array(np).fill(0)); b.push(0); }
    const rows = [];
    photos.forEach(function (ph) {
      const f = pfactor(lam, beta, ph.t), w = 1 / (ph.sigma * ph.sigma);
      rows.push({ r: withPM ? [1, 0, ph.t, 0, f.x] : [1, 0, f.x], v: ph.x, w: w });
      rows.push({ r: withPM ? [0, 1, 0, ph.t, f.y] : [0, 1, f.y], v: ph.y, w: w });
    });
    rows.forEach(function (q) { for (let i = 0; i < np; i++) { b[i] += q.w * q.r[i] * q.v; for (let j = 0; j < np; j++) A[i][j] += q.w * q.r[i] * q.r[j]; } });
    const sol = solve(A, b), cov = inverse(A);
    if (!sol || !cov) return null;
    const ip = np - 1;
    if (!(cov[ip][ip] > 0) || !isFinite(cov[ip][ip])) return null;
    let chi2 = 0;
    rows.forEach(function (q) { let m = 0; for (let i = 0; i < np; i++) m += q.r[i] * sol[i]; chi2 += q.w * (q.v - m) * (q.v - m); });
    const ts = photos.map(function (ph) { return ph.t; });
    return {
      p: sol[ip], sp: Math.sqrt(cov[ip][ip]), x0: sol[0], y0: sol[1],
      mux: withPM ? sol[2] : 0, muy: withPM ? sol[3] : 0, smu: withPM ? Math.sqrt(Math.max(cov[2][2], cov[3][3])) : 0,
      n: n, span: Math.max.apply(null, ts) - Math.min.apply(null, ts), chi2: chi2, dof: 2 * n - np
    };
  }

  /** 儀器：每張照片的位置誤差（″） */
  const INSTRUMENTS = [
    { id: 'eye', zh: '肉眼（第谷，1580 年代）', en: 'Naked eye (Tycho, 1580s)', sigma: 60 },
    { id: 'bessel', zh: '量日儀（貝索，1838 年）', en: 'Heliometer (Bessel, 1838)', sigma: 0.15 },
    { id: 'ccd', zh: '地面望遠鏡＋CCD', en: 'Ground telescope + CCD', sigma: 0.01 },
    { id: 'hipparcos', zh: '依巴谷衛星（1989–1993）', en: 'Hipparcos (1989–1993)', sigma: 0.003 },
    { id: 'gaia', zh: 'Gaia 衛星（2014–2025）', en: 'Gaia (2014–2025)', sigma: 0.0002 }
  ];

  /** 真實的恆星：赤經、赤緯（°，J2000）、視差（″）、自行（″/年） */
  const STAR_DATA = [
    { id: 'proxima', zh: '比鄰星', en: 'Proxima Centauri', ra: 217.42895, dec: -62.67949, p: 0.76807, pmra: -3.78131, pmdec: 0.76977 },
    { id: 'barnard', zh: '巴納德星', en: 'Barnard’s Star', ra: 269.45208, dec: 4.69339, p: 0.54698, pmra: -0.80155, pmdec: 10.36239 },
    { id: 'wolf359', zh: '沃夫 359', en: 'Wolf 359', ra: 164.12027, dec: 7.01467, p: 0.41520, pmra: -3.86634, pmdec: -2.69922 },
    { id: 'sirius', zh: '天狼星', en: 'Sirius', ra: 101.28716, dec: -16.71612, p: 0.37921, pmra: -0.54601, pmdec: -1.22307 },
    { id: 'cyg61', zh: '天鵝座 61', en: '61 Cygni', ra: 316.72475, dec: 38.74942, p: 0.28599, pmra: 4.16420, pmdec: 3.24999 },
    { id: 'vega', zh: '織女星', en: 'Vega', ra: 279.23473, dec: 38.78369, p: 0.13023, pmra: 0.20094, pmdec: 0.28623 },
    { id: 'polaris', zh: '北極星', en: 'Polaris', ra: 37.95456, dec: 89.26411, p: 0.00754, pmra: 0.04448, pmdec: -0.01185 },
    { id: 'betelgeuse', zh: '參宿四', en: 'Betelgeuse', ra: 88.79294, dec: 7.40706, p: 0.00655, pmra: 0.02754, pmdec: 0.01130 }
  ];
  const STARS = STAR_DATA.map(function (s) {
    const e = eqToEcl(s.ra, s.dec), pm = pmToEcl(s.ra, s.dec, s.pmra, s.pmdec);
    return Object.assign({}, s, { lam: e.lam, beta: e.beta, mux: pm.x, muy: pm.y });
  });

  /** 從年數 t 算日期（月、日；以 365.25 天的平年） */
  function dateOf(t) {
    const frac = ((t % 1) + 1) % 1, doy = frac * 365.25, ML = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let m = 0, d = doy;
    while (m < 11 && d >= ML[m]) { d -= ML[m]; m++; }
    return { year: Math.floor(t), month: m + 1, day: Math.floor(d) + 1 };
  }

  return {
    AU_PER_PC: AU_PER_PC, LY_PER_PC: LY_PER_PC, KM_PER_AU: KM_PER_AU, OBL: OBL,
    eqToEcl: eqToEcl, pmToEcl: pmToEcl, sunLon: sunLon, earthPos: earthPos, pfactor: pfactor, shiftAt: shiftAt,
    apparent: apparent, distOf: distOf, baselineShift: baselineShift, gauss: gauss, photo: photo, solve: solve, fit: fit,
    INSTRUMENTS: INSTRUMENTS, STARS: STARS, dateOf: dateOf
  };
});
