/*
 * atomic-orbitals-core.js — 「原子軌域的形狀」的化學核心（類氫原子的波函數，與畫面無關，Node 可直接 require）
 *
 * 模型：類氫原子（一個電子＋電荷 +Z 的原子核：H、He+、Li2+），原子核質量視為無限大。
 *   ψ_nlm(r, θ, φ) = R_nl(r) · Y_lm(θ, φ)
 *   R_nl(r) = N · ρ^l · e^(−ρ/2) · L_(n−l−1)^(2l+1)(ρ)，ρ = 2Zr / (n a0)
 *   N = √[ (2Z/(n a0))³ · (n−l−1)! / (2n (n+l)!) ]（L 為廣義拉蓋爾多項式，現代慣例）
 *   Y 用化學課本的「實數」球諧函數（px、py、pz、dxy、dz²…），由 m = ±|m| 的複數球諧函數組合而成，已歸一化。
 *   能量 E_n = −Z² · R∞ / n²，R∞ = 13.605693 eV（= 1312.75 kJ/mol；氫原子核質量有限時游離能是 13.598 eV = 1312.0 kJ/mol）。
 *   長度單位一律是波耳半徑 a0 = 52.9177 pm。
 * 公式來源：L. Pauling & E. B. Wilson, Introduction to Quantum Mechanics (1935) 第 5 章；
 *   OpenStax Chemistry 2e 第 6.3 節〈Development of Quantum Theory〉；實數球諧函數的係數見 Wikipedia “Table of spherical harmonics”（Real spherical harmonics），
 *   CODATA 2018：a0 = 52.917 721 pm、R∞hc = 13.605 693 eV。
 *
 * 所有函數的長度參數都以 a0 為單位；ψ 的單位是 a0^(−3/2)，|ψ|² 是 a0^(−3)。
 */
(function (root) {
  'use strict';

  const A0_PM = 52.9177;          // 波耳半徑（pm）
  const RY_EV = 13.605693;        // 芮得柏能量（eV）
  const EV_KJ = 96.485332;        // 1 eV／粒子 = 96.485 kJ/mol
  const RY_KJ = RY_EV * EV_KJ;    // 1312.75 kJ/mol
  const L_NAMES = ['s', 'p', 'd', 'f'];
  const SQ = Math.sqrt, PI = Math.PI;

  // ======================= 實數球諧函數 =======================
  // 每個 key：l、係數、角函數（單位向量 x, y, z）、磁量子數 |m|、HTML 名稱、純文字名稱、角節面
  const C = {
    s: 1 / (2 * SQ(PI)),
    p: SQ(3 / (4 * PI)),
    d1: 0.5 * SQ(15 / PI),          // dxy、dxz、dyz
    d2: 0.25 * SQ(15 / PI),         // dx²−y²
    d0: 0.25 * SQ(5 / PI),          // dz²
    f0: 0.25 * SQ(7 / PI),          // fz³
    f1: 0.25 * SQ(21 / (2 * PI)),   // fxz²、fyz²
    f2a: 0.5 * SQ(105 / PI),        // fxyz
    f2b: 0.25 * SQ(105 / PI),       // fz(x²−y²)
    f3: 0.25 * SQ(35 / (2 * PI))    // fx(x²−3y²)、fy(3x²−y²)
  };
  const R2 = 1 / SQ(2), R3 = SQ(3);
  const PL = function (nx, ny, nz, zh, en) { const m = Math.hypot(nx, ny, nz); return { type: 'plane', n: [nx / m, ny / m, nz / m], zh: zh, en: en }; };
  /** 圓錐節面：cos²θ = cos² 的上、下兩個圓錐算兩個節面（例如 dz² 有 2 個角節面） */
  const CONE = function (cos, deg) {
    const t = Math.acos(cos);
    return [{ type: 'cone', theta: t, zh: '上方圓錐（與 z 軸夾 ' + deg + '°）', en: 'upper cone (' + deg + '° from the z-axis)' },
      { type: 'cone', theta: PI - t, zh: '下方圓錐（與 z 軸夾 ' + deg + '°）', en: 'lower cone (' + deg + '° from the z-axis)' }];
  };
  const P_YZ = PL(1, 0, 0, 'yz 平面', 'yz plane'), P_XZ = PL(0, 1, 0, 'xz 平面', 'xz plane'), P_XY = PL(0, 0, 1, 'xy 平面', 'xy plane');

  const ANG = {
    s: { l: 0, m: 0, f: function () { return C.s; }, html: 's', txt: 's', nodes: [] },
    px: { l: 1, m: 1, f: function (x) { return C.p * x; }, html: 'p<sub>x</sub>', txt: 'px', nodes: [P_YZ] },
    py: { l: 1, m: 1, f: function (x, y) { return C.p * y; }, html: 'p<sub>y</sub>', txt: 'py', nodes: [P_XZ] },
    pz: { l: 1, m: 0, f: function (x, y, z) { return C.p * z; }, html: 'p<sub>z</sub>', txt: 'pz', nodes: [P_XY] },
    dxy: { l: 2, m: 2, f: function (x, y) { return C.d1 * x * y; }, html: 'd<sub>xy</sub>', txt: 'dxy', nodes: [P_YZ, P_XZ] },
    dxz: { l: 2, m: 1, f: function (x, y, z) { return C.d1 * x * z; }, html: 'd<sub>xz</sub>', txt: 'dxz', nodes: [P_YZ, P_XY] },
    dyz: { l: 2, m: 1, f: function (x, y, z) { return C.d1 * y * z; }, html: 'd<sub>yz</sub>', txt: 'dyz', nodes: [P_XZ, P_XY] },
    dx2y2: { l: 2, m: 2, f: function (x, y) { return C.d2 * (x * x - y * y); }, html: 'd<sub>x<sup>2</sup>−y<sup>2</sup></sub>', txt: 'dx²−y²',
      nodes: [PL(1, -1, 0, '平面 x = y', 'plane x = y'), PL(1, 1, 0, '平面 x = −y', 'plane x = −y')] },
    dz2: { l: 2, m: 0, f: function (x, y, z) { return C.d0 * (3 * z * z - 1); }, html: 'd<sub>z<sup>2</sup></sub>', txt: 'dz²',
      nodes: CONE(1 / R3, '54.7') },
    fz3: { l: 3, m: 0, f: function (x, y, z) { return C.f0 * z * (5 * z * z - 3); }, html: 'f<sub>z<sup>3</sup></sub>', txt: 'fz³',
      nodes: [P_XY].concat(CONE(SQ(3 / 5), '39.2')) },
    fxz2: { l: 3, m: 1, f: function (x, y, z) { return C.f1 * x * (5 * z * z - 1); }, html: 'f<sub>xz<sup>2</sup></sub>', txt: 'fxz²',
      nodes: [P_YZ].concat(CONE(SQ(1 / 5), '63.4')) },
    fyz2: { l: 3, m: 1, f: function (x, y, z) { return C.f1 * y * (5 * z * z - 1); }, html: 'f<sub>yz<sup>2</sup></sub>', txt: 'fyz²',
      nodes: [P_XZ].concat(CONE(SQ(1 / 5), '63.4')) },
    fxyz: { l: 3, m: 2, f: function (x, y, z) { return C.f2a * x * y * z; }, html: 'f<sub>xyz</sub>', txt: 'fxyz', nodes: [P_YZ, P_XZ, P_XY] },
    fzx2y2: { l: 3, m: 2, f: function (x, y, z) { return C.f2b * z * (x * x - y * y); }, html: 'f<sub>z(x<sup>2</sup>−y<sup>2</sup>)</sub>', txt: 'fz(x²−y²)',
      nodes: [P_XY, PL(1, -1, 0, '平面 x = y', 'plane x = y'), PL(1, 1, 0, '平面 x = −y', 'plane x = −y')] },
    fxx23y2: { l: 3, m: 3, f: function (x, y) { return C.f3 * x * (x * x - 3 * y * y); }, html: 'f<sub>x(x<sup>2</sup>−3y<sup>2</sup>)</sub>', txt: 'fx(x²−3y²)',
      nodes: [P_YZ, PL(1, -R3, 0, '平面 x = √3 y', 'plane x = √3 y'), PL(1, R3, 0, '平面 x = −√3 y', 'plane x = −√3 y')] },
    fy3x2y2: { l: 3, m: 3, f: function (x, y) { return C.f3 * y * (3 * x * x - y * y); }, html: 'f<sub>y(3x<sup>2</sup>−y<sup>2</sup>)</sub>', txt: 'fy(3x²−y²)',
      nodes: [P_XZ, PL(R3, -1, 0, '平面 y = √3 x', 'plane y = √3 x'), PL(R3, 1, 0, '平面 y = −√3 x', 'plane y = −√3 x')] }
  };
  const KEYS = [['s'], ['px', 'py', 'pz'], ['dxy', 'dxz', 'dyz', 'dx2y2', 'dz2'], ['fz3', 'fxz2', 'fyz2', 'fxyz', 'fzx2y2', 'fxx23y2', 'fy3x2y2']];

  /** 實數球諧函數在方向 (x, y, z) 的值（自動歸一化方向；原點傳回 0，s 例外） */
  function Y(key, x, y, z) {
    const a = ANG[key];
    if (a.l === 0) return C.s;
    const r = Math.sqrt(x * x + y * y + z * z);
    if (r < 1e-12) return 0;
    return a.f(x / r, y / r, z / r);
  }

  // ======================= 徑向函數 =======================
  function fact(k) { let f = 1; for (let i = 2; i <= k; i++) f *= i; return f; }
  /** 廣義拉蓋爾多項式 L_k^α(x)（遞迴） */
  function laguerre(k, a, x) {
    if (k === 0) return 1;
    let L0 = 1, L1 = 1 + a - x;
    for (let j = 1; j < k; j++) { const L2 = ((2 * j + 1 + a - x) * L1 - (j + a) * L0) / (j + 1); L0 = L1; L1 = L2; }
    return L1;
  }
  const normCache = {};
  function norm(n, l, Z) {
    const k = n + ',' + l + ',' + Z;
    if (normCache[k] == null) normCache[k] = Math.sqrt(Math.pow(2 * Z / n, 3) * fact(n - l - 1) / (2 * n * fact(n + l)));
    return normCache[k];
  }
  /** R_nl(r)，r 以 a0 為單位，單位 a0^(−3/2) */
  function R(n, l, r, Z) {
    Z = Z || 1;
    const rho = 2 * Z * r / n;
    return norm(n, l, Z) * Math.pow(rho, l) * Math.exp(-rho / 2) * laguerre(n - l - 1, 2 * l + 1, rho);
  }
  /** 徑向分布函數 P(r) = r² R²（在半徑 r～r + dr 的薄球殼內找到電子的機率 = P dr） */
  function radialP(n, l, r, Z) { const v = R(n, l, r, Z); return r * r * v * v; }

  function valid(n, l) { return n >= 1 && l >= 0 && l < n && l <= 3; }
  /** 軌域物件 { n, l, key, Z } → 字串代號，例如 '2pz'、'3dz2' */
  function id(o) { return o.n + o.key; }
  function parse(s) {
    const m = /^(\d)(s|p[xyz]|d(?:xy|xz|yz|x2y2|z2)|f(?:z3|xz2|yz2|xyz|zx2y2|xx23y2|y3x2y2))$/.exec(s || '');
    if (!m) return null;
    const n = +m[1], key = m[2], l = ANG[key].l;
    return valid(n, l) ? { n: n, l: l, key: key } : null;
  }
  /** ψ 在點 (x, y, z)（a0）的值 */
  function psi(o, x, y, z) {
    const r = Math.sqrt(x * x + y * y + z * z);
    return R(o.n, o.l, r, o.Z || 1) * Y(o.key, x, y, z);
  }
  /** 機率密度：單一軌域 |ψ|²；sum = true 時是整個副層 (2l+1) 個軌域的平均 Σ|ψ|²／(2l+1)（球對稱，Unsöld 定理） */
  function density(o, x, y, z, sum) {
    const r = Math.sqrt(x * x + y * y + z * z);
    const Rv = R(o.n, o.l, r, o.Z || 1);
    if (sum) return Rv * Rv / (4 * PI);
    const v = Rv * Y(o.key, x, y, z);
    return v * v;
  }

  // ======================= 節面 =======================
  /** 徑向節面的半徑（a0，由小到大）：R(r) = 0 的正根，共 n − l − 1 個 */
  function radialNodes(n, l, Z) {
    Z = Z || 1;
    const k = n - l - 1, a = 2 * l + 1;
    if (k <= 0) return [];
    const out = [], hi = 4 * k + 2 * a + 12, h = 0.002;
    let x0 = 1e-9, f0 = laguerre(k, a, x0);
    for (let x = h; x <= hi; x += h) {
      const f1 = laguerre(k, a, x);
      if (f0 === 0) { out.push(x0); }
      else if (f0 * f1 < 0) {
        let lo = x0, up = x, flo = f0;
        for (let it = 0; it < 80; it++) { const m = (lo + up) / 2, fm = laguerre(k, a, m); if (flo * fm <= 0) up = m; else { lo = m; flo = fm; } }
        out.push((lo + up) / 2);
      }
      x0 = x; f0 = f1;
    }
    return out.map(function (rho) { return rho * n / (2 * Z); });
  }
  /** 角節面（平面或圓錐），共 l 個 */
  function angularNodes(key) { return ANG[key].nodes; }
  /** 2D 切面：plane 'xz'／'xy'／'yz'，offset 是沿法線的位置（a0）。傳回 {u, v, n} 三個單位向量（u 水平、v 垂直、n 法線） */
  const PLANES = {
    xz: { u: [1, 0, 0], v: [0, 0, 1], n: [0, 1, 0], uName: 'x', vName: 'z', nName: 'y' },
    xy: { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1], uName: 'x', vName: 'y', nName: 'z' },
    yz: { u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0], uName: 'y', vName: 'z', nName: 'x' }
  };
  function slicePoint(plane, u, v, d) {
    const P = PLANES[plane];
    return [u * P.u[0] + v * P.v[0] + d * P.n[0], u * P.u[1] + v * P.v[1] + d * P.n[1], u * P.u[2] + v * P.v[2] + d * P.n[2]];
  }
  /** 這個切面整片都在角節面上（|ψ|² 處處為 0）？只有切面通過原子核、且和某個節面平面重合時才會發生 */
  function sliceIsNodal(key, plane, offset, sum) {
    if (sum || ANG[key].l === 0 || Math.abs(offset) > 1e-9) return false;
    const N = PLANES[plane].n;
    return ANG[key].nodes.some(function (nd) {
      return nd.type === 'plane' && Math.abs(Math.abs(nd.n[0] * N[0] + nd.n[1] * N[1] + nd.n[2] * N[2]) - 1) < 1e-9;
    });
  }

  // ======================= 半徑、能量 =======================
  function energyEV(n, Z) { Z = Z || 1; return -RY_EV * Z * Z / (n * n); }
  function energyKJ(n, Z) { Z = Z || 1; return -RY_KJ * Z * Z / (n * n); }
  /** 平均半徑 ⟨r⟩ = [3n² − l(l+1)] a0 / (2Z) */
  function meanR(n, l, Z) { Z = Z || 1; return (3 * n * n - l * (l + 1)) / (2 * Z); }
  /** 遠到這裡以外的機率可以忽略（< 1e-9）：給積分與畫圖用的上限 */
  function rCut(n, Z) { Z = Z || 1; return (n * n * 3 + 12 * n + 18) / Z; }

  /** 0 到 r 的累積機率 ∫P dr（辛普森法，h ≤ 0.0025 n/Z） */
  function cumulative(n, l, r, Z) {
    Z = Z || 1;
    if (r <= 0) return 0;
    const rr = Math.min(r, rCut(n, Z));
    let N = Math.max(200, Math.ceil(rr / (0.0025 * n / Z)));
    if (N % 2) N++;
    const h = rr / N;
    let s = radialP(n, l, 0, Z) + radialP(n, l, rr, Z);
    for (let i = 1; i < N; i++) s += (i % 2 ? 4 : 2) * radialP(n, l, i * h, Z);
    return Math.min(1, s * h / 3);
  }
  /** 最可能半徑：P(r) 的最大值位置（全域最大） */
  function rMax(n, l, Z) {
    Z = Z || 1;
    const hi = rCut(n, Z), N = 4000;
    let best = 0, bv = -1;
    for (let i = 1; i <= N; i++) { const r = hi * i / N, v = radialP(n, l, r, Z); if (v > bv) { bv = v; best = r; } }
    let a = Math.max(0, best - hi / N), b = best + hi / N;
    const g = (SQ(5) - 1) / 2;
    for (let it = 0; it < 80; it++) {
      const c = b - g * (b - a), d = a + g * (b - a);
      if (radialP(n, l, c, Z) > radialP(n, l, d, Z)) b = d; else a = c;
    }
    return (a + b) / 2;
  }
  /** P(r) 的所有局部極大（由內到外），給「2s 的內層小峰」這類觀察用 */
  function radialPeaks(n, l, Z) {
    Z = Z || 1;
    const hi = rCut(n, Z), N = 6000, out = [];
    let p0 = 0, p1 = radialP(n, l, hi / N, Z);
    for (let i = 2; i <= N; i++) {
      const p2 = radialP(n, l, hi * i / N, Z);
      if (p1 > p0 && p1 >= p2 && p1 > 1e-12) {
        let a = hi * (i - 2) / N, b = hi * i / N;
        const g = (SQ(5) - 1) / 2;
        for (let it = 0; it < 60; it++) { const c = b - g * (b - a), d = a + g * (b - a); if (radialP(n, l, c, Z) > radialP(n, l, d, Z)) b = d; else a = c; }
        out.push((a + b) / 2);
      }
      p0 = p1; p1 = p2;
    }
    return out;
  }
  /** 累積機率剛好等於 frac 的半徑（二分法） */
  function rFrac(n, l, frac, Z) {
    Z = Z || 1;
    let lo = 0, hi = rCut(n, Z);
    for (let it = 0; it < 60; it++) { const m = (lo + hi) / 2; if (cumulative(n, l, m, Z) < frac) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }

  /** 徑向表（畫圖、查表、抽樣用）：r 從 0 到 rmax 共 N+1 點，含 R、P、累積 C（梯形＋辛普森修正後歸一到 cumulative(rmax)） */
  function radialTable(n, l, Z, rmax, N) {
    Z = Z || 1; N = N || 1200;
    const r = new Float64Array(N + 1), Rv = new Float64Array(N + 1), P = new Float64Array(N + 1), Cc = new Float64Array(N + 1);
    const h = rmax / N;
    for (let i = 0; i <= N; i++) { r[i] = i * h; Rv[i] = R(n, l, r[i], Z); P[i] = r[i] * r[i] * Rv[i] * Rv[i]; }
    // 每一格用三點（中點）辛普森積分
    Cc[0] = 0;
    for (let i = 1; i <= N; i++) {
      const rm = (i - 0.5) * h, pm = radialP(n, l, rm, Z);
      Cc[i] = Cc[i - 1] + h * (P[i - 1] + 4 * pm + P[i]) / 6;
    }
    return { r: r, R: Rv, P: P, C: Cc, h: h, N: N, rmax: rmax };
  }
  /** 查表內插 */
  function lookup(tab, arr, x) {
    if (x <= 0) return arr[0];
    if (x >= tab.rmax) return arr[tab.N];
    const f = x / tab.h, i = Math.floor(f), u = f - i;
    return arr[i] * (1 - u) + arr[i + 1] * u;
  }

  // ======================= 最大值 =======================
  const ymaxCache = {};
  /** 實數球諧函數 |Y| 在球面上的最大值（網格搜尋＋局部細化） */
  function maxAbsY(key) {
    if (ymaxCache[key] != null) return ymaxCache[key];
    const a = ANG[key];
    if (a.l === 0) return (ymaxCache[key] = C.s);
    let best = 0, bt = 0, bp = 0;
    const f = function (t, p) { const st = Math.sin(t); return Math.abs(a.f(st * Math.cos(p), st * Math.sin(p), Math.cos(t))); };
    for (let i = 0; i <= 180; i++) for (let j = 0; j < 360; j++) {
      const t = i * PI / 180, p = j * PI / 180, v = f(t, p);
      if (v > best) { best = v; bt = t; bp = p; }
    }
    let step = PI / 180;
    for (let it = 0; it < 40; it++) {
      let moved = false;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const v = f(bt + di * step, bp + dj * step);
        if (v > best) { best = v; bt += di * step; bp += dj * step; moved = true; }
      }
      if (!moved) step /= 2;
    }
    return (ymaxCache[key] = best);
  }
  /** |R| 的最大值與位置 */
  function maxAbsR(n, l, Z) {
    Z = Z || 1;
    if (l === 0) return { r: 0, v: Math.abs(R(n, 0, 0, Z)) };
    const hi = rCut(n, Z), N = 4000;
    let best = 0, br = 0;
    for (let i = 1; i <= N; i++) { const r = hi * i / N, v = Math.abs(R(n, l, r, Z)); if (v > best) { best = v; br = r; } }
    let a = Math.max(0, br - hi / N), b = br + hi / N;
    const g = (SQ(5) - 1) / 2;
    for (let it = 0; it < 60; it++) { const c = b - g * (b - a), d = a + g * (b - a); if (Math.abs(R(n, l, c, Z)) > Math.abs(R(n, l, d, Z))) b = d; else a = c; }
    const r = (a + b) / 2;
    return { r: r, v: Math.abs(R(n, l, r, Z)) };
  }
  /** 全空間 |ψ|² 的最大值（ψ 可分離，= max R² × max Y²；副層加總時 = max R² / 4π） */
  function maxDensity(o, sum) {
    const mr = maxAbsR(o.n, o.l, o.Z || 1).v;
    return sum ? mr * mr / (4 * PI) : mr * mr * Math.pow(maxAbsY(o.key), 2);
  }

  // ======================= 等值面：包住 frac 機率的 |ψ| 值 =======================
  let fibCache = null;
  function fibDirs(N) {
    if (fibCache && fibCache.N === N) return fibCache.d;
    const d = new Float64Array(3 * N), ga = PI * (3 - SQ(5));
    for (let i = 0; i < N; i++) {
      const z = 1 - (2 * i + 1) / N, rr = Math.sqrt(1 - z * z), ph = i * ga;
      d[3 * i] = rr * Math.cos(ph); d[3 * i + 1] = rr * Math.sin(ph); d[3 * i + 2] = z;
    }
    fibCache = { N: N, d: d };
    return d;
  }
  /**
   * 找出 c，使 |ψ| > c 的區域剛好包住 frac 的機率（3D 等值面就畫 ψ = +c 與 ψ = −c）。
   * ψ = R·Y 可分離：機率 = Σ_方向 w·Y² · Σ_r P(r)dr·[|R(r)|·|Y| > c]，對 c 二分。
   * sum = true（整個副層）：密度 = R²/(4π)，|ψ| 改用 √密度。傳回 { c, rOut（等值面最遠到哪裡，a0） }
   */
  function isoLevel(o, frac, sum) {
    const Z = o.Z || 1, n = o.n, l = o.l, rc = rCut(n, Z);
    const tab = radialTable(n, l, Z, rc, 3000);
    // 依 |R| 由大到小排序，累積 P dr
    const idx = Array.from({ length: tab.N }, function (_, i) { return i; });
    const absR = new Float64Array(tab.N), w = new Float64Array(tab.N);
    for (let i = 0; i < tab.N; i++) { absR[i] = Math.abs(R(n, l, (i + 0.5) * tab.h, Z)); w[i] = tab.C[i + 1] - tab.C[i]; }
    idx.sort(function (a, b) { return absR[b] - absR[a]; });
    const sortedR = new Float64Array(tab.N), cumW = new Float64Array(tab.N + 1);
    for (let k = 0; k < tab.N; k++) { sortedR[k] = absR[idx[k]]; cumW[k + 1] = cumW[k] + w[idx[k]]; }
    /** F(t) = Σ P dr，|R| > t */
    const F = function (t) {
      let lo = 0, hi = tab.N;           // sortedR 由大到小；找第一個 ≤ t 的位置
      while (lo < hi) { const m = (lo + hi) >> 1; if (sortedR[m] > t) lo = m + 1; else hi = m; }
      return cumW[lo];
    };
    let yv, wy;
    if (sum) { yv = [Math.sqrt(1 / (4 * PI))]; wy = [1]; }
    else {
      const ND = 4000, d = fibDirs(ND);
      yv = new Float64Array(ND); wy = new Float64Array(ND);
      for (let i = 0; i < ND; i++) { const v = Math.abs(Y(o.key, d[3 * i], d[3 * i + 1], d[3 * i + 2])); yv[i] = v; wy[i] = 4 * PI / ND * v * v; }
    }
    const mass = function (c) {
      let s = 0;
      for (let i = 0; i < yv.length; i++) if (yv[i] > 1e-12) s += wy[i] * F(c / yv[i]);
      return s;
    };
    const total = mass(0);
    let lo = 0, hi = Math.sqrt(maxDensity(o, sum));
    for (let it = 0; it < 60; it++) { const m = (lo + hi) / 2; if (mass(m) / total > frac) lo = m; else hi = m; }
    const c = (lo + hi) / 2;
    const ym = sum ? Math.sqrt(1 / (4 * PI)) : maxAbsY(o.key);
    let rOut = 0;
    for (let i = tab.N; i >= 0; i--) if (Math.abs(tab.R[i]) * ym >= c) { rOut = tab.r[i]; break; }
    return { c: c, rOut: rOut };
  }

  // ======================= 抽樣（機率雲） =======================
  /** 小型可重現亂數（mulberry32） */
  function rng32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /**
   * 依 |ψ|² 抽 count 個點（精確：r 依 P(r) 的反函數抽、方向依 Y² 拒絕抽樣）。
   * sum = true：副層加總，每個點先隨機選一個 m 再抽。傳回 { pos: Float32Array(3N)（a0）, sign: Int8Array(N) }
   */
  function sample(o, count, rand, sum) {
    rand = rand || Math.random;
    const Z = o.Z || 1, rc = rCut(o.n, Z);
    const tab = radialTable(o.n, o.l, Z, rc, 4000), tot = tab.C[tab.N];
    const keys = sum ? KEYS[o.l] : [o.key];
    const pos = new Float32Array(3 * count), sign = new Int8Array(count);
    for (let k = 0; k < count; k++) {
      // 半徑：反查累積分布
      const u = rand() * tot;
      let lo = 0, hi = tab.N;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tab.C[m] < u) lo = m; else hi = m; }
      const span = tab.C[hi] - tab.C[lo], f = span > 0 ? (u - tab.C[lo]) / span : 0;
      const r = (lo + f) * tab.h;
      // 方向：在球面上均勻取，再以 Y²／Ymax² 的機率接受
      const key = keys[Math.min(keys.length - 1, Math.floor(rand() * keys.length))];
      const ym = maxAbsY(key);
      let x, y, z, yv;
      for (let tries = 0; tries < 10000; tries++) {
        z = 2 * rand() - 1;
        const ph = 2 * PI * rand(), s = Math.sqrt(1 - z * z);
        x = s * Math.cos(ph); y = s * Math.sin(ph);
        yv = Y(key, x, y, z);
        if (rand() * ym * ym <= yv * yv) break;
      }
      pos[3 * k] = x * r; pos[3 * k + 1] = y * r; pos[3 * k + 2] = z * r;
      const Rv = R(o.n, o.l, r, Z);
      sign[k] = sum ? 0 : (Rv * yv >= 0 ? 1 : -1);
    }
    return { pos: pos, sign: sign };
  }

  // ======================= 名稱與測驗 =======================
  /** 所有合法軌域（n 從 1 到 nMax），依 n、l、課本順序 */
  function list(nMax) {
    const out = [];
    for (let n = 1; n <= nMax; n++) for (let l = 0; l < n && l <= 3; l++) KEYS[l].forEach(function (key) { out.push({ n: n, l: l, key: key }); });
    return out;
  }
  /** HTML 名稱，例如 3d<sub>z<sup>2</sup></sub> */
  function html(o) { return o.n + ANG[o.key].html; }
  /** 純文字名稱（² ³ 允許），例如 3dz² */
  function text(o) { return o.n + ANG[o.key].txt; }
  /** 測驗時哪個切面最看得出形狀：{ plane, offsetFrac（× 最可能半徑） } */
  function bestPlane(key) {
    const M = { s: 'xz', px: 'xy', py: 'xy', pz: 'xz', dxy: 'xy', dxz: 'xz', dyz: 'yz', dx2y2: 'xy', dz2: 'xz',
      fz3: 'xz', fxz2: 'xz', fyz2: 'yz', fxyz: 'xy', fzx2y2: 'xz', fxx23y2: 'xy', fy3x2y2: 'xy' };
    return { plane: M[key], offsetFrac: key === 'fxyz' ? 0.45 : 0 };
  }
  /** 測驗抽題：n ≤ 4 的 30 個軌域，不和上一題相同 */
  function pickQuiz(rand, prevId) {
    const L = list(4);
    for (let t = 0; t < 50; t++) {
      const o = L[Math.floor(rand() * L.length)];
      if (id(o) !== prevId) return o;
    }
    return L[0];
  }

  const api = {
    A0_PM: A0_PM, RY_EV: RY_EV, RY_KJ: RY_KJ, EV_KJ: EV_KJ, L_NAMES: L_NAMES, KEYS: KEYS, ANG: ANG, PLANES: PLANES,
    Y: Y, R: R, laguerre: laguerre, radialP: radialP, psi: psi, density: density, valid: valid, id: id, parse: parse,
    radialNodes: radialNodes, angularNodes: angularNodes, slicePoint: slicePoint, sliceIsNodal: sliceIsNodal,
    energyEV: energyEV, energyKJ: energyKJ, meanR: meanR, rCut: rCut, cumulative: cumulative, rMax: rMax, radialPeaks: radialPeaks, rFrac: rFrac,
    radialTable: radialTable, lookup: lookup, maxAbsY: maxAbsY, maxAbsR: maxAbsR, maxDensity: maxDensity, isoLevel: isoLevel,
    rng32: rng32, sample: sample, list: list, html: html, text: text, bestPlane: bestPlane, pickQuiz: pickQuiz
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AOCore = api;
})(typeof window !== 'undefined' ? window : this);
