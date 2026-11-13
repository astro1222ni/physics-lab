/*
 * crystal-structures-core.js — 「晶體結構與堆積」的化學核心 CSCore（不碰 DOM，Node 與瀏覽器共用）
 *
 * 長度單位：晶格常數 a、c、半徑 r 一律用 pm；幾何座標用「a 的倍數」（晶胞邊長 = 1）。
 * 密度 ρ = Z·M ／（N_A·V），V 由 pm³ 換成 cm³（1 pm³ = 10^-30 cm³），單位 g/cm³。
 *
 * 結構（八種）：
 *   金屬：簡單立方 sc、體心立方 bcc、面心立方 fcc（立方最密）、六方最密 hcp（晶胞取六角柱，含 6 個原子）
 *   離子：氯化鈉型 nacl、氯化銫型 cscl、閃鋅礦型 zns；共價網狀：鑽石型 diamond
 * 數據（室溫，另註明者除外）：晶格常數取自 CRC Handbook of Chemistry and Physics「Crystal structures and lattice
 * parameters of allotropes of the elements」與 X 光繞射文獻值；實測密度取自 CRC Handbook；離子半徑用 Shannon（1976）。
 * 核心只做幾何與計算，畫面在 js/crystal-structures.js（2D）與 js/crystal-structures-3d.js（3D）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CSCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const NA = 6.02214076e23;          // 亞佛加厥數（mol^-1，2019 SI 定義值）
  const S2 = Math.SQRT2, S3 = Math.sqrt(3);
  const CA_IDEAL = Math.sqrt(8 / 3);  // 理想六方最密的 c/a = 1.633
  const TOL = 1e-6;

  // ======================= 結構 =======================
  // basis：立方晶胞內的分數座標與種類（m 金屬或共價原子、c 陽離子、a 陰離子）；六方用 a1、a2、a3 的分數座標
  const FCC4 = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];
  const TET4 = [[0.25, 0.25, 0.25], [0.75, 0.75, 0.25], [0.75, 0.25, 0.75], [0.25, 0.75, 0.75]];
  const TET8 = [];
  [0.25, 0.75].forEach(function (x) { [0.25, 0.75].forEach(function (y) { [0.25, 0.75].forEach(function (z) { TET8.push([x, y, z]); }); }); });
  const tag = function (list, sp) { return list.map(function (p) { return [p[0], p[1], p[2], sp]; }); };

  const STRUCTS = {
    sc: { zh: '簡單立方', en: 'Simple cubic', kind: 'metal', cell: 'cube', Z: 1, CN: 6,
      basis: [[0, 0, 0, 'm']],
      rFromA: function (a) { return a / 2; }, aFromR: function (r) { return 2 * r; },
      voids: { cube: [[0.5, 0.5, 0.5]] } },
    bcc: { zh: '體心立方', en: 'Body-centred cubic', kind: 'metal', cell: 'cube', Z: 2, CN: 8,
      basis: [[0, 0, 0, 'm'], [0.5, 0.5, 0.5, 'm']],
      rFromA: function (a) { return S3 * a / 4; }, aFromR: function (r) { return 4 * r / S3; },
      voids: {
        oct: [[0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5], [0.5, 0, 0], [0, 0.5, 0], [0, 0, 0.5]],
        tet: [[0, 0.5, 0.25], [0, 0.5, 0.75], [0, 0.25, 0.5], [0, 0.75, 0.5], [0.5, 0, 0.25], [0.5, 0, 0.75],
          [0.25, 0, 0.5], [0.75, 0, 0.5], [0.5, 0.25, 0], [0.5, 0.75, 0], [0.25, 0.5, 0], [0.75, 0.5, 0]]
      } },
    fcc: { zh: '面心立方', en: 'Face-centred cubic', kind: 'metal', cell: 'cube', Z: 4, CN: 12, closePacked: true,
      basis: tag(FCC4, 'm'),
      rFromA: function (a) { return S2 * a / 4; }, aFromR: function (r) { return 4 * r / S2; },
      voids: { oct: [[0.5, 0.5, 0.5], [0.5, 0, 0], [0, 0.5, 0], [0, 0, 0.5]], tet: TET8 } },
    hcp: { zh: '六方最密', en: 'Hexagonal close-packed', kind: 'metal', cell: 'hex', Z: 6, CN: 12, closePacked: true,
      basis: [[0, 0, 0, 'm'], [1 / 3, 2 / 3, 0.5, 'm']],
      rFromA: function (a) { return a / 2; }, aFromR: function (r) { return 2 * r; },
      voids: { oct: [[2 / 3, 1 / 3, 0.25], [2 / 3, 1 / 3, 0.75]], tet: [[1 / 3, 2 / 3, 0.125], [1 / 3, 2 / 3, 0.875], [0, 0, 0.375], [0, 0, 0.625]] } },
    nacl: { zh: '氯化鈉型', en: 'Rock salt (NaCl)', kind: 'ionic', cell: 'cube', Z: 4, CN: 6,
      basis: tag(FCC4, 'a').concat(tag([[0.5, 0, 0], [0, 0.5, 0], [0, 0, 0.5], [0.5, 0.5, 0.5]], 'c')),
      dFromA: function (a) { return a / 2; } },
    cscl: { zh: '氯化銫型', en: 'Caesium chloride (CsCl)', kind: 'ionic', cell: 'cube', Z: 1, CN: 8,
      basis: [[0, 0, 0, 'a'], [0.5, 0.5, 0.5, 'c']],
      dFromA: function (a) { return S3 * a / 2; } },
    zns: { zh: '閃鋅礦型', en: 'Zinc blende (ZnS)', kind: 'ionic', cell: 'cube', Z: 4, CN: 4,
      basis: tag(FCC4, 'a').concat(tag(TET4, 'c')),
      dFromA: function (a) { return S3 * a / 4; } },
    diamond: { zh: '鑽石型', en: 'Diamond', kind: 'covalent', cell: 'cube', Z: 8, CN: 4,
      basis: tag(FCC4, 'm').concat(tag(TET4, 'm')),
      rFromA: function (a) { return S3 * a / 8; }, aFromR: function (r) { return 8 * r / S3; } }
  };
  const ORDER = ['sc', 'bcc', 'fcc', 'hcp', 'nacl', 'cscl', 'zns', 'diamond'];
  const METALS = ['sc', 'bcc', 'fcc', 'hcp'];
  // 半徑與邊長的關係：畫面要排版下標，所以用片段表示
  function relParts(s) {
    // 片段：[文字, 0 一般／-1 下標]
    const P = {
      sc: [['a = 2r', 0]], bcc: [['√3 a = 4r', 0]], fcc: [['√2 a = 4r', 0]], hcp: [['a = 2r', 0]],
      nacl: [['a = 2r', 0], ['+', -1], [' + 2r', 0], ['−', -1]],
      cscl: [['√3 a = 2r', 0], ['+', -1], [' + 2r', 0], ['−', -1]],
      zns: [['√3 a / 4 = r', 0], ['+', -1], [' + r', 0], ['−', -1]],
      diamond: [['√3 a / 4 = 2r', 0]]
    };
    return P[s];
  }

  // ======================= 物質 =======================
  // a、c：pm；M：g/mol；rho：實測密度 g/cm³（null 表示沒有，用 X 光數據算）；rc、ra：Shannon 離子半徑（pm）
  const MATS = {
    Po: { s: 'sc', zh: '釙（α）', en: 'Polonium (α)', sym: 'Po', M: 208.98, a: 335.2, rho: 9.196, col: '#9aa3ad' },
    Li: { s: 'bcc', zh: '鋰', en: 'Lithium', sym: 'Li', M: 6.94, a: 351.0, rho: 0.534, col: '#c9ccd2' },
    Na: { s: 'bcc', zh: '鈉', en: 'Sodium', sym: 'Na', M: 22.990, a: 429.06, rho: 0.968, col: '#d6d9de' },
    K: { s: 'bcc', zh: '鉀', en: 'Potassium', sym: 'K', M: 39.098, a: 532.8, rho: 0.862, col: '#c4c9d0' },
    Cr: { s: 'bcc', zh: '鉻', en: 'Chromium', sym: 'Cr', M: 51.996, a: 288.46, rho: 7.19, col: '#b8c2cc' },
    Fe: { s: 'bcc', zh: '鐵（α，室溫）', en: 'Iron (α, room temperature)', sym: 'Fe', M: 55.845, a: 286.65, rho: 7.874, col: '#8d939b' },
    Fe912: { s: 'bcc', zh: '鐵（α，912 °C）', en: 'Iron (α, 912 °C)', sym: 'Fe', M: 55.845, a: 290.40, rho: null, T: 912, col: '#b06a4a', hot: true },
    Mo: { s: 'bcc', zh: '鉬', en: 'Molybdenum', sym: 'Mo', M: 95.95, a: 314.70, rho: 10.28, col: '#9fa8b3' },
    W: { s: 'bcc', zh: '鎢', en: 'Tungsten', sym: 'W', M: 183.84, a: 316.52, rho: 19.25, col: '#8e959e' },
    Al: { s: 'fcc', zh: '鋁', en: 'Aluminium', sym: 'Al', M: 26.982, a: 404.95, rho: 2.70, col: '#c7ced6' },
    Ni: { s: 'fcc', zh: '鎳', en: 'Nickel', sym: 'Ni', M: 58.693, a: 352.40, rho: 8.908, col: '#a8a99a' },
    Cu: { s: 'fcc', zh: '銅', en: 'Copper', sym: 'Cu', M: 63.546, a: 361.49, rho: 8.96, col: '#c8733f' },
    Ag: { s: 'fcc', zh: '銀', en: 'Silver', sym: 'Ag', M: 107.87, a: 408.53, rho: 10.49, col: '#cfd4da' },
    Pt: { s: 'fcc', zh: '鉑', en: 'Platinum', sym: 'Pt', M: 195.08, a: 392.42, rho: 21.45, col: '#b9bec4' },
    Au: { s: 'fcc', zh: '金', en: 'Gold', sym: 'Au', M: 196.97, a: 407.82, rho: 19.30, col: '#d9a830' },
    Pb: { s: 'fcc', zh: '鉛', en: 'Lead', sym: 'Pb', M: 207.2, a: 495.08, rho: 11.34, col: '#7f8796' },
    Fe916: { s: 'fcc', zh: '鐵（γ，916 °C）', en: 'Iron (γ, 916 °C)', sym: 'Fe', M: 55.845, a: 364.67, rho: null, T: 916, col: '#c0603a', hot: true },
    Be: { s: 'hcp', zh: '鈹', en: 'Beryllium', sym: 'Be', M: 9.0122, a: 228.58, c: 358.43, rho: 1.85, col: '#b7bfc4' },
    Mg: { s: 'hcp', zh: '鎂', en: 'Magnesium', sym: 'Mg', M: 24.305, a: 320.94, c: 521.05, rho: 1.738, col: '#cfd3d8' },
    Ti: { s: 'hcp', zh: '鈦', en: 'Titanium', sym: 'Ti', M: 47.867, a: 295.08, c: 468.55, rho: 4.506, col: '#9ea6b1' },
    Co: { s: 'hcp', zh: '鈷', en: 'Cobalt', sym: 'Co', M: 58.933, a: 250.71, c: 406.95, rho: 8.90, col: '#7f8fa6' },
    Zn: { s: 'hcp', zh: '鋅', en: 'Zinc', sym: 'Zn', M: 65.38, a: 266.49, c: 494.68, rho: 7.14, col: '#a9b3c0' },
    NaCl: { s: 'nacl', zh: '氯化鈉', en: 'Sodium chloride', sym: 'NaCl', cat: 'Na', an: 'Cl', qc: 1, qa: 1, M: 58.443, a: 564.02, rho: 2.165, rc: 102, ra: 181, cc: '#8e6fd6', ca: '#3fae5a' },
    KCl: { s: 'nacl', zh: '氯化鉀', en: 'Potassium chloride', sym: 'KCl', cat: 'K', an: 'Cl', qc: 1, qa: 1, M: 74.551, a: 629.29, rho: 1.984, rc: 138, ra: 181, cc: '#b05fc4', ca: '#3fae5a' },
    MgO: { s: 'nacl', zh: '氧化鎂', en: 'Magnesium oxide', sym: 'MgO', cat: 'Mg', an: 'O', qc: 2, qa: 2, M: 40.304, a: 421.2, rho: 3.58, rc: 72, ra: 140, cc: '#4f9a8a', ca: '#e0483a' },
    CsCl: { s: 'cscl', zh: '氯化銫', en: 'Caesium chloride', sym: 'CsCl', cat: 'Cs', an: 'Cl', qc: 1, qa: 1, M: 168.36, a: 412.3, rho: 3.99, rc: 174, ra: 181, cc: '#6f58c9', ca: '#3fae5a' },
    CsI: { s: 'cscl', zh: '碘化銫', en: 'Caesium iodide', sym: 'CsI', cat: 'Cs', an: 'I', qc: 1, qa: 1, M: 259.81, a: 456.7, rho: 4.51, rc: 174, ra: 220, cc: '#6f58c9', ca: '#8a3fc0' },
    ZnS: { s: 'zns', zh: '硫化鋅（閃鋅礦）', en: 'Zinc sulfide (zinc blende)', sym: 'ZnS', cat: 'Zn', an: 'S', qc: 2, qa: 2, M: 97.47, a: 540.93, rho: 4.09, rc: 60, ra: 184, cc: '#7d8fa8', ca: '#d8b32a' },
    C: { s: 'diamond', zh: '碳（鑽石）', en: 'Carbon (diamond)', sym: 'C', M: 12.011, a: 356.71, rho: 3.515, col: '#5d6670' },
    Si: { s: 'diamond', zh: '矽', en: 'Silicon', sym: 'Si', M: 28.086, a: 543.10, rho: 2.329, col: '#6f7f95' },
    Ge: { s: 'diamond', zh: '鍺', en: 'Germanium', sym: 'Ge', M: 72.630, a: 565.75, rho: 5.323, col: '#8a96a3' }
  };
  const MAT_ORDER = ['Po', 'Li', 'Na', 'K', 'Cr', 'Fe', 'Fe912', 'Mo', 'W', 'Al', 'Ni', 'Cu', 'Ag', 'Pt', 'Au', 'Pb', 'Fe916',
    'Be', 'Mg', 'Ti', 'Co', 'Zn', 'NaCl', 'KCl', 'MgO', 'CsCl', 'CsI', 'ZnS', 'C', 'Si', 'Ge'];
  const DEFAULT_MAT = { sc: 'Po', bcc: 'Fe', fcc: 'Cu', hcp: 'Mg', nacl: 'NaCl', cscl: 'CsCl', zns: 'ZnS', diamond: 'C' };
  function matsOf(s) { return MAT_ORDER.filter(function (k) { return MATS[k].s === s; }); }

  // ======================= 基本計算 =======================
  /** 晶胞體積（pm³）：立方 a³；六角柱 (3√3/2)a²c */
  function cellVolume(s, a, c) { return STRUCTS[s].cell === 'hex' ? 1.5 * S3 * a * a * c : a * a * a; }
  /** 密度（g/cm³）：Z 個（原子或化學式單位）、莫耳質量 M、晶胞體積 V（pm³） */
  function density(Z, M, Vpm3) { return Z * M / (NA * Vpm3 * 1e-30); }
  function sphereVol(r) { return 4 / 3 * Math.PI * r * r * r; }
  /**
   * 六方最密的原子半徑 = 最近兩原子距離的一半。同一層的距離是 a，上下層的距離是 √(a²/3 + c²/4)；
   * c/a 等於理想值 1.633 時兩者相等（r = a/2）；鈹、鈦的 c/a 較小，上下層反而比較近。
   */
  function hcpR(a, ca) { return Math.min(a, Math.sqrt(a * a / 3 + a * a * ca * ca / 4)) / 2; }

  /**
   * 一個晶體的全部數據。mat：物質代號；as：假想改排成哪種金屬結構（保持原子半徑，六方用理想 c/a）。
   * 回傳 { mat, s, hypo, a, c, ca, r（金屬或共價半徑；六方最密取最近距離的一半）, rc, ra（離子，依 Shannon 比例放大到相切）, d（最近距離）,
   *        Z, Zc, Za, CN, V, pf, rho, rhoExp, rhoErr }
   */
  function crystal(mat, as) {
    const m = MATS[mat];
    const real = m.s;
    const hypo = !!(as && as !== real && METALS.indexOf(as) >= 0 && METALS.indexOf(real) >= 0);
    const s = hypo ? as : real;
    const st = STRUCTS[s];
    const o = { mat: mat, s: s, real: real, hypo: hypo, M: m.M, Z: st.Z, CN: st.CN };
    if (hypo) {
      const r = real === 'hcp' ? hcpR(m.a, m.c / m.a) : STRUCTS[real].rFromA(m.a);
      o.r = r; o.a = st.aFromR(r);
      o.ca = st.cell === 'hex' ? CA_IDEAL : null;
      o.c = o.ca ? o.a * o.ca : null;
    } else {
      o.a = m.a; o.c = m.c || null; o.ca = m.c ? m.c / m.a : null;
      if (st.kind === 'ionic') {
        o.d = st.dFromA(m.a);
        o.rc = o.d * m.rc / (m.rc + m.ra); o.ra = o.d * m.ra / (m.rc + m.ra);
        o.ratio = m.rc / m.ra;
      } else if (s === 'hcp') o.r = hcpR(m.a, o.ca);
      else o.r = st.rFromA(m.a);
    }
    if (o.r != null) o.d = 2 * o.r;
    o.V = cellVolume(s, o.a, o.c);
    if (st.kind === 'ionic') {
      const nCat = st.Z, nAn = st.Z;   // 三種離子晶體都是 1：1
      o.Zc = nCat; o.Za = nAn;
      o.pf = (nCat * sphereVol(o.rc) + nAn * sphereVol(o.ra)) / o.V;
    } else o.pf = st.Z * sphereVol(o.r) / o.V;
    o.rho = density(st.Z, m.M, o.V);
    o.rhoExp = hypo ? null : m.rho;
    o.rhoErr = o.rhoExp ? o.rho / o.rhoExp - 1 : null;
    return o;
  }

  // ======================= 晶胞裡的原子位置 =======================
  // 座標：a 的倍數。立方晶胞從 (0,0,0) 到 (n,n,n)；六角柱底面中心在原點、外接圓半徑 n、高 n·c/a。
  const A1 = [1, 0, 0], A2 = [-0.5, S3 / 2, 0];
  function hexCart(f, ca) { return [f[0] * A1[0] + f[1] * A2[0], f[0] * A1[1] + f[1] * A2[1], f[2] * ca]; }
  const HEXN = [];
  for (let k = 0; k < 6; k++) { const t = (30 + 60 * k) * Math.PI / 180; HEXN.push([Math.cos(t), Math.sin(t)]); }

  /** 區域判斷：回傳 null（在外面）或 { frac（在區域內的比例）, role } */
  function regionTest(cell, p, n, ca) {
    if (cell === 'cube') {
      let f = 1, nb = 0;
      for (let i = 0; i < 3; i++) {
        if (p[i] < -TOL || p[i] > n + TOL) return null;
        if (Math.abs(p[i]) < TOL || Math.abs(p[i] - n) < TOL) { f *= 0.5; nb++; }
      }
      return { frac: f, role: ['inside', 'face', 'edge', 'corner'][nb] };
    }
    const H = n * ca, ap = n * S3 / 2;
    if (p[2] < -TOL || p[2] > H + TOL) return null;
    let side = 0;
    for (let k = 0; k < 6; k++) {
      const d = p[0] * HEXN[k][0] + p[1] * HEXN[k][1];
      if (d > ap + TOL) return null;
      if (Math.abs(d - ap) < TOL) side++;
    }
    const top = Math.abs(p[2]) < TOL || Math.abs(p[2] - H) < TOL;
    const fIn = side === 0 ? 1 : side === 1 ? 0.5 : 1 / 3;
    const f = fIn * (top ? 0.5 : 1);
    const role = side === 2 ? (top ? 'corner' : 'edge') : side === 1 ? (top ? 'edge' : 'side') : top ? 'face' : 'inside';
    return { frac: f, role: role };
  }
  /** 把晶格的分數座標表 frs（[fx,fy,fz,(sp)]）擴展到區域裡 */
  function fillRegion(cell, frs, n, ca) {
    const out = [];
    if (cell === 'cube') {
      for (let i = -1; i <= n; i++) for (let j = -1; j <= n; j++) for (let k = -1; k <= n; k++) {
        frs.forEach(function (f) {
          const p = [i + f[0], j + f[1], k + f[2]];
          const t = regionTest(cell, p, n, ca);
          if (t) out.push({ p: p, sp: f[3], frac: t.frac, role: t.role });
        });
      }
    } else {
      const R = n + 1;
      for (let i = -2 * R; i <= 2 * R; i++) for (let j = -2 * R; j <= 2 * R; j++) for (let k = -1; k <= n; k++) {
        frs.forEach(function (f) {
          const p = hexCart([i + f[0], j + f[1], k + f[2]], ca);
          const t = regionTest(cell, p, n, ca);
          if (t) out.push({ p: p, sp: f[3], frac: t.frac, role: t.role });
        });
      }
    }
    return out;
  }
  /** 晶胞（n×n×n 個）裡的原子：{ p, sp, frac, role } */
  function cellAtoms(s, ca, n) { const st = STRUCTS[s]; return fillRegion(st.cell, st.basis, n || 1, ca || CA_IDEAL); }

  /** 以 c 為中心、半邊長 h 的方盒內所有原子（找最近鄰居用） */
  function atomsNear(s, ca, c, h) {
    const st = STRUCTS[s], out = [];
    ca = ca || CA_IDEAL;
    if (st.cell === 'cube') {
      const lo = [0, 1, 2].map(function (i) { return Math.floor(c[i] - h) - 1; });
      const hi = [0, 1, 2].map(function (i) { return Math.ceil(c[i] + h) + 1; });
      for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) {
        st.basis.forEach(function (f) {
          const p = [i + f[0], j + f[1], k + f[2]];
          if (Math.abs(p[0] - c[0]) <= h && Math.abs(p[1] - c[1]) <= h && Math.abs(p[2] - c[2]) <= h) out.push({ p: p, sp: f[3] });
        });
      }
    } else {
      const R = Math.ceil(h) + 2, K = Math.ceil(h / ca) + 1;
      const k0 = Math.round(c[2] / ca);
      // 中心點的大約晶格座標
      const fj = c[1] / (S3 / 2), fi = c[0] + fj / 2;
      const i0 = Math.round(fi), j0 = Math.round(fj);
      for (let i = i0 - 2 * R; i <= i0 + 2 * R; i++) for (let j = j0 - 2 * R; j <= j0 + 2 * R; j++) for (let k = k0 - K; k <= k0 + K; k++) {
        st.basis.forEach(function (f) {
          const p = hexCart([i + f[0], j + f[1], k + f[2]], ca);
          if (Math.abs(p[0] - c[0]) <= h && Math.abs(p[1] - c[1]) <= h && Math.abs(p[2] - c[2]) <= h) out.push({ p: p, sp: f[3] });
        });
      }
    }
    return out;
  }
  function dist(p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); }

  /**
   * 原子 (p, sp) 的配位：最近鄰居（離子晶體只算異號離子；距離在最近距離的 1.12 倍以內都算，
   * 例如鋅的六方最密：同一層 6 個 266 pm、上下層 6 個 291 pm，合計 12）。回傳 { list:[{p,d,sp}], d1, d2 }
   */
  function neighbors(s, ca, p, sp) {
    const st = STRUCTS[s];
    const near = atomsNear(s, ca, p, 1.6).filter(function (q) {
      const d = dist(p, q.p);
      if (d < TOL) return false;
      return st.kind === 'ionic' ? q.sp !== sp : true;
    });
    let d1 = Infinity;
    near.forEach(function (q) { d1 = Math.min(d1, dist(p, q.p)); });
    const list = near.map(function (q) { return { p: q.p, sp: q.sp, d: dist(p, q.p) }; }).filter(function (q) { return q.d <= d1 * 1.12; });
    let d2 = d1;
    list.forEach(function (q) { d2 = Math.max(d2, q.d); });
    list.sort(function (x, y) { return x.d - y.d; });
    return { list: list, d1: d1, d2: d2 };
  }

  // ======================= 空隙 =======================
  const VOID_INFO = {
    sc: { cube: { n: 1, ratio: S3 - 1 } },
    bcc: { oct: { n: 6, ratio: (2 - S3) / S3 }, tet: { n: 12, ratio: (Math.sqrt(5) - S3) / S3 } },
    fcc: { oct: { n: 4, ratio: S2 - 1 }, tet: { n: 8, ratio: Math.sqrt(1.5) - 1 } },
    hcp: { oct: { n: 6, ratio: S2 - 1 }, tet: { n: 12, ratio: Math.sqrt(1.5) - 1 } }
  };
  /** 空隙的種類（只有金屬結構有）：['oct','tet'] 或 ['cube'] */
  function voidTypes(s) { const v = STRUCTS[s].voids; return v ? Object.keys(v) : []; }
  /**
   * 區域裡某種空隙的位置：{ p, type, frac, rr（空隙能容納的球半徑，a 的倍數）}
   * rr 由「空隙中心到最近原子的距離 − 原子半徑」實際算出（鋅這種 c/a 不理想的六方最密也正確）。
   */
  function voidSites(s, ca, n, type, rA) {
    const st = STRUCTS[s];
    if (!st.voids || !st.voids[type]) return [];
    ca = ca || CA_IDEAL;
    const list = fillRegion(st.cell, st.voids[type], n || 1, ca);
    list.forEach(function (v) {
      v.type = type;
      const nb = atomsNear(s, ca, v.p, 1.2);
      let dm = Infinity;
      nb.forEach(function (q) { dm = Math.min(dm, dist(v.p, q.p)); });
      v.rr = dm - rA;
      v.nn = nb.filter(function (q) { return dist(v.p, q.p) <= dm * 1.001; }).length;
    });
    return list;
  }

  // ======================= 配位多面體（凸包） =======================
  /** 點集的凸包面：每個面是依序排列的點索引（共平面的點合成一個面） */
  function hull(pts) {
    const n = pts.length, faces = [], seen = {};
    const sub = function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; };
    const cross = function (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; };
    const dot = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
    let scale = 0;
    pts.forEach(function (p) { scale = Math.max(scale, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])); });
    const eps = 1e-7 * Math.max(1, scale);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
      let nv = cross(sub(pts[j], pts[i]), sub(pts[k], pts[i]));
      const L = Math.hypot(nv[0], nv[1], nv[2]);
      if (L < eps) continue;
      nv = [nv[0] / L, nv[1] / L, nv[2] / L];
      const d0 = dot(nv, pts[i]);
      let pos = 0, neg = 0;
      const on = [];
      for (let m = 0; m < n; m++) {
        const d = dot(nv, pts[m]) - d0;
        if (d > eps) pos++; else if (d < -eps) neg++; else on.push(m);
      }
      if (pos && neg) continue;
      const key = on.join(',');
      if (seen[key]) continue;
      seen[key] = true;
      if (neg && !pos) nv = [-nv[0], -nv[1], -nv[2]];   // 法向量朝外
      // 依角度排列
      const c = [0, 0, 0];
      on.forEach(function (m) { c[0] += pts[m][0]; c[1] += pts[m][1]; c[2] += pts[m][2]; });
      c[0] /= on.length; c[1] /= on.length; c[2] /= on.length;
      const u = sub(pts[on[0]], c), Lu = Math.hypot(u[0], u[1], u[2]);
      const uu = [u[0] / Lu, u[1] / Lu, u[2] / Lu], vv = cross(nv, uu);
      const ord = on.slice().sort(function (x, y) {
        const px = sub(pts[x], c), py = sub(pts[y], c);
        return Math.atan2(dot(px, vv), dot(px, uu)) - Math.atan2(dot(py, vv), dot(py, uu));
      });
      faces.push({ idx: ord, n: nv });
    }
    return faces;
  }

  // ======================= 最密堆積層 =======================
  /** 原子屬於哪一層最密堆積層（0 A、1 B、2 C）：面心立方沿體對角線 [111]，六方最密沿 c 軸；其他結構回傳 -1 */
  function layerOf(s, p, ca) {
    if (s === 'fcc') return ((Math.round(p[0] + p[1] + p[2]) % 3) + 3) % 3;
    if (s === 'hcp') return ((Math.round(p[2] / ((ca || CA_IDEAL) / 2)) % 2) + 2) % 2;
    return -1;
  }

  // ======================= 疊疊看（最密堆積層的排列） =======================
  const H_CLOSE = 2 * Math.sqrt(2 / 3);   // 相鄰兩層錯開時的層距（以 r 為單位）= 1.633
  /** 層的位置（以 r 為單位）：A (0,0)、B (1, 1/√3)、C (2, 2/√3)；同一層的原子間距 2r */
  const POS = { A: [0, 0], B: [1, 1 / S3], C: [2, 2 / S3] };
  /**
   * seq：例如 'ABCABC'。回傳 { n, seq, hc（中間各層的環境：h 上下兩層位置相同、c 不同）, same（有沒有兩層疊在正上方）,
   *   type：'few'（少於 3 層）／'sh'（全部疊在正上方：簡單六方）／'loose'（有些疊在正上方）／'hcp'／'ccp'／'dhcp'／'mixed',
   *   pf（以這個排列無限重複時的堆積率）, cnMid（最中間那一層的配位數）, height（總高度，以 r 為單位，含上下半徑）, gaps（各層距） }
   */
  function stackInfo(seq) {
    seq = String(seq || '');
    const n = seq.length;
    const gaps = [];
    let same = false, allSame = n > 1;
    for (let i = 1; i < n; i++) {
      const eq = seq[i] === seq[i - 1];
      if (eq) same = true; else allSame = false;
      gaps.push(eq ? 2 : H_CLOSE);
    }
    let hc = '';
    for (let i = 1; i < n - 1; i++) hc += seq[i - 1] === seq[i + 1] ? 'h' : 'c';
    let type;
    if (n < 2) type = 'few';
    else if (allSame) type = 'sh';
    else if (same) type = 'loose';
    else if (n < 3) type = 'few';
    else if (/^h+$/.test(hc)) type = 'hcp';
    else if (/^c+$/.test(hc)) type = 'ccp';
    else if (/^(hc)+h?$/.test(hc) || /^(ch)+c?$/.test(hc)) type = hc.length >= 3 ? 'dhcp' : 'mixed';
    else type = 'mixed';
    let pf = null;
    if (gaps.length) {
      const hm = gaps.reduce(function (s, g) { return s + g; }, 0) / gaps.length;
      pf = sphereVol(1) / (2 * S3 * hm);   // 每個原子占的底面積 2√3 r²
    }
    let cnMid = null;
    if (n >= 3) {
      const m = Math.floor((n - 1) / 2);
      cnMid = 6 + (seq[m - 1] === seq[m] ? 1 : 3) + (seq[m + 1] === seq[m] ? 1 : 3);
    }
    const height = n ? 2 + gaps.reduce(function (s, g) { return s + g; }, 0) : 0;
    return { n: n, seq: seq, hc: hc, same: same, type: type, pf: pf, cnMid: cnMid, height: height, gaps: gaps };
  }

  // ======================= 動手算 =======================
  /** 有效數字 sig 位的四捨五入 */
  function round(x, sig) { if (!x) return 0; const e = Math.floor(Math.log10(Math.abs(x))); const f = Math.pow(10, sig - 1 - e); return Math.round(x * f) / f; }
  /** 題型能不能用在這個物質：r 只用在單一元素（金屬、鑽石型）；其他都可以 */
  function quizAllowed(type, mat) {
    const m = MATS[mat], k = STRUCTS[m.s].kind;
    if (type === 'NA') return m.rho != null;   // 沒有實測密度（高溫的鐵）就不出：用算出的密度求 N_A 是循環論證
    if (type !== 'r') return true;
    if (k === 'ionic') return false;
    // 六方最密只用 c/a 接近或大於理想值的（r = a/2 與最近距離的一半相差不到 0.5%），免得和課本的 r = a/2 不一致
    if (m.s === 'hcp') return hcpR(m.a, m.c / m.a) >= 0.995 * m.a / 2;
    return true;
  }
  /**
   * 出題（用的數字就是題目給的數字，答案也由這些數字算出，學生照課本公式算就對得上）：
   *   'rho'：已知晶格常數 a（六方另給 c）、M、結構 → 求密度（g/cm³）
   *   'r'  ：已知密度 ρ、M、結構（六方另給 c/a）→ 求原子半徑（pm）
   *   'NA' ：已知密度 ρ、晶格常數 a（六方另給 c）、M、結構 → 求亞佛加厥數（mol^-1）
   * 題目的 ρ 用實測密度；沒有實測值（高溫的鐵）時用 X 光數據算出的密度，取 4 位有效數字。
   */
  function quiz(type, mat) {
    const m = MATS[mat], s = m.s, st = STRUCTS[s];
    const cr = crystal(mat);
    const g = { s: s, Z: st.Z, M: m.M, a: m.a, c: m.c || null, ca: m.c ? Math.round(m.c / m.a * 1000) / 1000 : null,
      rho: m.rho != null ? m.rho : round(cr.rho, 4) };
    let ans;
    if (type === 'rho') ans = density(st.Z, m.M, cellVolume(s, m.a, m.c));
    else if (type === 'NA') ans = st.Z * m.M / (g.rho * cellVolume(s, m.a, m.c) * 1e-30);
    else if (type === 'r') {
      const V = st.Z * m.M / (NA * g.rho) * 1e30;   // pm³
      const a = st.cell === 'hex' ? Math.cbrt(V / (1.5 * S3 * g.ca)) : Math.cbrt(V);
      ans = s === 'hcp' ? hcpR(a, g.ca) : st.rFromA(a);
    }
    return { type: type, mat: mat, given: g, ans: ans };
  }
  function relErr(user, ans) { return user / ans - 1; }

  // ======================= 截面（2D 的真實比例截面） =======================
  // 平面：原點 O、平面內單位向量 U、W（a 的倍數）、區域多邊形（u, w）；contact：接觸線（u, w 起訖）
  const H6 = [];
  for (let k = 0; k < 6; k++) { const t = k * Math.PI / 3; H6.push([Math.cos(t), Math.sin(t)]); }
  const R2 = 1 / S2;
  const PLANE_FACE = { O: [0, 0, 0], U: [1, 0, 0], W: [0, 1, 0], poly: [[0, 0], [1, 0], [1, 1], [0, 1]] };
  const PLANE_DIAG = { O: [0, 0, 0], U: [R2, R2, 0], W: [0, 0, 1], poly: [[0, 0], [S2, 0], [S2, 1], [0, 1]] };
  const SECTIONS = {
    sc: Object.assign({ contact: [[0, 0], [1, 0]], hkl: '(100)' }, PLANE_FACE),
    bcc: Object.assign({ contact: [[0, 0], [S2, 1]], hkl: '(110)' }, PLANE_DIAG),
    fcc: Object.assign({ contact: [[0, 0], [1, 1]], hkl: '(100)' }, PLANE_FACE),
    hcp: { O: [0, 0, 0], U: [1, 0, 0], W: [0, 1, 0], poly: H6, contact: [[0, 0], [1, 0]], hkl: '(0001)' },
    nacl: Object.assign({ contact: [[0, 0], [1, 0]], hkl: '(100)' }, PLANE_FACE),
    cscl: Object.assign({ contact: [[0, 0], [S2, 1]], hkl: '(110)' }, PLANE_DIAG),
    zns: Object.assign({ contact: [[0, 0], [S2 / 4, 0.25]], hkl: '(110)' }, PLANE_DIAG),
    diamond: Object.assign({ contact: [[0, 0], [S2 / 4, 0.25]], hkl: '(110)' }, PLANE_DIAG)
  };
  /** 截面上看得到的原子：{ u, w, h（離截面的距離）, sp }（只留下球心離截面比 rmax 近的） */
  function sectionAtoms(s, ca, rmax) {
    const P = SECTIONS[s];
    let um = 0, wm = 0, ul = 0, wl = 0;
    P.poly.forEach(function (q) { um = Math.max(um, q[0]); wm = Math.max(wm, q[1]); ul = Math.min(ul, q[0]); wl = Math.min(wl, q[1]); });
    const N = [P.U[1] * P.W[2] - P.U[2] * P.W[1], P.U[2] * P.W[0] - P.U[0] * P.W[2], P.U[0] * P.W[1] - P.U[1] * P.W[0]];
    const c = [0, 1, 2].map(function (i) { return P.O[i] + P.U[i] * (um + ul) / 2 + P.W[i] * (wm + wl) / 2; });
    const near = atomsNear(s, ca, c, Math.max(um - ul, wm - wl) / 2 + rmax + 1);
    const out = [];
    const pad = rmax;
    near.forEach(function (q) {
      const d = [q.p[0] - P.O[0], q.p[1] - P.O[1], q.p[2] - P.O[2]];
      const h = d[0] * N[0] + d[1] * N[1] + d[2] * N[2];
      if (Math.abs(h) >= rmax - 1e-9) return;
      const u = d[0] * P.U[0] + d[1] * P.U[1] + d[2] * P.U[2], w = d[0] * P.W[0] + d[1] * P.W[1] + d[2] * P.W[2];
      if (u < ul - pad || u > um + pad || w < wl - pad || w > wm + pad) return;
      out.push({ u: u, w: w, h: h, sp: q.sp });
    });
    return out;
  }

  return {
    NA: NA, CA_IDEAL: CA_IDEAL, H_CLOSE: H_CLOSE, POS: POS,
    STRUCTS: STRUCTS, ORDER: ORDER, METALS: METALS, MATS: MATS, MAT_ORDER: MAT_ORDER, DEFAULT_MAT: DEFAULT_MAT,
    VOID_INFO: VOID_INFO, SECTIONS: SECTIONS,
    hcpR: hcpR, matsOf: matsOf, relParts: relParts, cellVolume: cellVolume, density: density, crystal: crystal,
    cellAtoms: cellAtoms, atomsNear: atomsNear, neighbors: neighbors, dist: dist,
    voidTypes: voidTypes, voidSites: voidSites, hull: hull, layerOf: layerOf,
    stackInfo: stackInfo, quiz: quiz, quizAllowed: quizAllowed, relErr: relErr, round: round, sectionAtoms: sectionAtoms
  };
});
