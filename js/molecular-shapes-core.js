/*
 * molecular-shapes-core.js — 「分子的形狀（價殼層電子對互斥理論，VSEPR）」的化學核心（與畫面無關，Node 可直接 require）
 *
 * 模型：中心原子周圍的每一個電子域（鍵結電子對；雙鍵、參鍵也只算一個電子域；或孤對電子）
 *   用一個「方向」u（單位向量）代表，看成球面上的一個點。任兩個電子域互相排斥，位能
 *     E = Σ w_ij / |ρ_i u_i − ρ_j u_j|^n
 *   w_ij 是排斥強度：鍵結–鍵結 = s_i s_j（單鍵 s = 1，雙鍵、參鍵較大），孤對–鍵結 = λ s_j，孤對–孤對 = μ；
 *   ρ 是電子域「重心」離原子核的距離（鍵結電子對 1，孤對電子較靠近原子核 ρ_L < 1）。
 *   孤對電子只受一個原子核吸引，電子雲比較胖、比較靠近中心原子，所以排斥較強——這就是 λ、μ > 1、ρ_L < 1 的意思。
 * 排列：在球面上沿著能量的負梯度移動每一個點（梯度下降，必要時加隨機擾動＝模擬退火），
 *   停下來的地方就是能量的（局部）最低點；從理想多面體的所有位置分配與幾個隨機起點各求一次，取最低者為「能量最低的排列」。
 * 這是簡化的教學模型：只算電子域之間的排斥，不算原子核之間的排斥、軌域混成、配位原子的大小與電負度對鍵結電子對大小的影響，
 *   所以鍵角只會和實驗值接近、趨勢相同（CH4 > NH3 > H2O、三角雙錐的孤對電子在赤道…），不會完全一樣。
 *
 * 分子極性：每個鍵的偶極向量 = (χ_X − χ_A) u（化學課本的畫法：箭頭由 δ+ 指向 δ−，也就是指向電負度大的一端），
 *   全部相加得淨偶極；淨偶極為 0（各鍵偶極互相抵消）就是非極性分子。只算鍵的偶極，孤對電子的貢獻沒有算進去。
 *
 * 座標：z 軸朝上（畫面把它當成「上方」）。長度單位：方向是單位向量；顯示用的鍵長以 Å 估計（共價半徑相加）。
 */
(function (root) {
  'use strict';

  const DEG = 180 / Math.PI;

  // ======================= 元素資料 =======================
  // v：價電子數；period：週期；chi：鮑林電負度；r：共價半徑（Å，Cordero 等人 2008 年的值，C 用 sp3 的值）
  const ELEMENTS = {
    H: { v: 1, period: 1, chi: 2.20, r: 0.31 },
    Be: { v: 2, period: 2, chi: 1.57, r: 0.96 },
    B: { v: 3, period: 2, chi: 2.04, r: 0.84 },
    C: { v: 4, period: 2, chi: 2.55, r: 0.76 },
    N: { v: 5, period: 2, chi: 3.04, r: 0.71 },
    O: { v: 6, period: 2, chi: 3.44, r: 0.66 },
    F: { v: 7, period: 2, chi: 3.98, r: 0.57 },
    P: { v: 5, period: 3, chi: 2.19, r: 1.07 },
    S: { v: 6, period: 3, chi: 2.58, r: 1.05 },
    Cl: { v: 7, period: 3, chi: 3.16, r: 1.02 },
    Br: { v: 7, period: 4, chi: 2.96, r: 1.20 },
    Xe: { v: 8, period: 5, chi: 2.60, r: 1.40 }
  };
  /** 可以當中心原子的元素（頁面的按鈕順序） */
  const CENTERS = ['Be', 'B', 'C', 'N', 'O', 'P', 'S', 'Cl', 'Br', 'Xe'];
  /** 鍵結原子（配位原子）：O 一律以雙鍵（=O）連接，其餘為單鍵 */
  const LIGANDS = { H: { bo: 1 }, F: { bo: 1 }, Cl: { bo: 1 }, Br: { bo: 1 }, O: { bo: 2 } };
  const LIGAND_ORDER = ['H', 'F', 'Cl', 'Br', 'O'];
  const MAX_DOMAINS = 6, MIN_DOMAINS = 2, MAX_LP = 3;

  // ======================= 模型參數 =======================
  // 兩個電子域之間的排斥位能 E = w / r^n（r 是球面上兩點的距離）。
  // 鍵結電子對被兩個原子核拉住、電子雲較細長，彼此靠近時才強烈排斥（指數大、衰減快）；
  // 孤對電子只被一個原子核拉住、電子雲較胖較散，排斥的「觸角」伸得比較遠（指數小、衰減慢）。
  // 這組數值讓 CH4、NH3、H2O 的鍵角依序變小，三角雙錐的孤對電子在赤道，八面體的兩對孤對電子在相對位置。
  const MODEL = {
    nBB: 6,        // 鍵結–鍵結的指數
    nLB: 3,        // 孤對–鍵結的指數
    nLL: 3,        // 孤對–孤對的指數
    lam: 0.7,      // 孤對–鍵結的排斥強度係數 w（單鍵–單鍵 = 1）：頁面滑桿「孤對電子的排斥強度」
    muK: 2,        // 孤對–孤對的係數 = muK × lam²
    rhoL: 1,       // 孤對電子的「重心」離原子核的距離（鍵結電子對 = 1）
    bond: { 1: 1, 2: 1.2, 3: 1.35 } // 單鍵、雙鍵、參鍵的排斥強度
  };
  function params(lam) {
    const L = lam == null ? MODEL.lam : lam;
    return { nBB: MODEL.nBB, nLB: MODEL.nLB, nLL: MODEL.nLL, lam: L, mu: MODEL.muK * L * L, rhoL: MODEL.rhoL, bond: MODEL.bond };
  }

  // ======================= 亂數（可設定種子） =======================
  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) {
    let u = 0, v = 0;
    while (u < 1e-12) u = rng();
    v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function randomUnit(rng) {
    for (;;) {
      const x = 2 * rng() - 1, y = 2 * rng() - 1, z = 2 * rng() - 1, s = x * x + y * y + z * z;
      if (s > 1e-6 && s <= 1) { const k = 1 / Math.sqrt(s); return [x * k, y * k, z * k]; }
    }
  }

  // ======================= 向量 =======================
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { const L = norm(a) || 1; return [a[0] / L, a[1] / L, a[2] / L]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function angleDeg(a, b) { return Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))) * DEG; }
  /** 把向量 v 繞單位軸 k 轉 th（弧度）（羅德里格斯公式） */
  function rotate(v, k, th) {
    const c = Math.cos(th), s = Math.sin(th), kv = dot(k, v), kx = cross(k, v);
    return [v[0] * c + kx[0] * s + k[0] * kv * (1 - c), v[1] * c + kx[1] * s + k[1] * kv * (1 - c), v[2] * c + kx[2] * s + k[2] * kv * (1 - c)];
  }
  /** 從 a 轉到 b 的旋轉，套用到 v（a、b 為單位向量） */
  function rotateFromTo(v, a, b) {
    const ax = cross(a, b), s = norm(ax), c = dot(a, b);
    if (s < 1e-12) {
      if (c > 0) return v.slice();
      // 反方向：繞任一條垂直軸轉 180°
      const p = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      return rotate(v, unit(cross(a, p)), Math.PI);
    }
    return rotate(v, [ax[0] / s, ax[1] / s, ax[2] / s], Math.atan2(s, c));
  }

  // ======================= 電子域 =======================
  /**
   * 由組成（中心原子、鍵結原子清單、孤對電子數）建立電子域清單（方向先空著）。
   * spec = { center: 'S', ligs: ['F', 'F', 'F', 'F'], lp: 1 }
   * 電子域：{ k: 'B'（鍵結）或 'L'（孤對）, lig: 'F'（鍵結原子）, bo: 鍵級 }
   */
  function domainsOf(spec) {
    const d = spec.ligs.map(function (x) { return { k: 'B', lig: x, bo: LIGANDS[x] ? LIGANDS[x].bo : 1 }; });
    for (let i = 0; i < spec.lp; i++) d.push({ k: 'L', lig: null, bo: 0 });
    return d;
  }
  function strength(d, P) { return d.k === 'L' ? 0 : (P.bond[d.bo] || 1); }
  function weight(a, b, P) {
    if (a.k === 'L' && b.k === 'L') return P.mu;
    if (a.k === 'L') return P.lam * strength(b, P);
    if (b.k === 'L') return P.lam * strength(a, P);
    return strength(a, P) * strength(b, P);
  }
  function expo(a, b, P) {
    if (a.k === 'L' && b.k === 'L') return P.nLL;
    if (a.k === 'L' || b.k === 'L') return P.nLB;
    return P.nBB;
  }
  function rhoOf(d, P) { return d.k === 'L' ? P.rhoL : 1; }

  /** 位能（相對單位）。U：方向陣列（與 doms 同順序） */
  function energy(doms, U, P) {
    let e = 0;
    for (let i = 0; i < doms.length; i++) {
      const ri = rhoOf(doms[i], P), a = U[i];
      for (let j = i + 1; j < doms.length; j++) {
        const rj = rhoOf(doms[j], P), b = U[j];
        const dx = a[0] * ri - b[0] * rj, dy = a[1] * ri - b[1] * rj, dz = a[2] * ri - b[2] * rj;
        const d2 = dx * dx + dy * dy + dz * dz;
        e += weight(doms[i], doms[j], P) / Math.pow(Math.max(d2, 1e-12), expo(doms[i], doms[j], P) / 2);
      }
    }
    return e;
  }
  /** 能量對每個方向的梯度，只留球面的切線分量（沿著半徑方向的分量不會讓點移動） */
  function gradient(doms, U, P) {
    const G = U.map(function () { return [0, 0, 0]; });
    for (let i = 0; i < doms.length; i++) {
      const ri = rhoOf(doms[i], P), a = U[i];
      for (let j = i + 1; j < doms.length; j++) {
        const rj = rhoOf(doms[j], P), b = U[j];
        const dx = a[0] * ri - b[0] * rj, dy = a[1] * ri - b[1] * rj, dz = a[2] * ri - b[2] * rj;
        const d2 = Math.max(dx * dx + dy * dy + dz * dz, 1e-12);
        const n = expo(doms[i], doms[j], P);
        const f = -n * weight(doms[i], doms[j], P) / Math.pow(d2, n / 2 + 1);
        G[i][0] += f * dx * ri; G[i][1] += f * dy * ri; G[i][2] += f * dz * ri;
        G[j][0] -= f * dx * rj; G[j][1] -= f * dy * rj; G[j][2] -= f * dz * rj;
      }
    }
    for (let i = 0; i < U.length; i++) {
      const u = U[i], g = G[i], p = dot(g, u);
      G[i] = [g[0] - p * u[0], g[1] - p * u[1], g[2] - p * u[2]];
    }
    return G;
  }
  function gmaxOf(G, pin) {
    let m = 0;
    for (let i = 0; i < G.length; i++) if (i !== pin) m = Math.max(m, norm(G[i]));
    return m;
  }
  function moved(U, G, s, pin) {
    return U.map(function (u, i) {
      if (i === pin) return u.slice();
      return unit([u[0] - s * G[i][0], u[1] - s * G[i][1], u[2] - s * G[i][2]]);
    });
  }

  /**
   * 精確求局部最低點：從 U 開始做梯度下降（步長自動調整，能量只降不升），直到梯度幾乎為 0。
   * opts：{ pin（固定不動的電子域索引）, tol, maxIter }
   * 傳回 { U, E, iter, converged }
   */
  function relax(doms, U, P, opts) {
    opts = opts || {};
    const pin = opts.pin == null ? -1 : opts.pin;
    const tol = opts.tol == null ? 1e-10 : opts.tol, maxIter = opts.maxIter || 20000;
    let cur = U.map(function (u) { return unit(u); });
    let E = energy(doms, cur, P);
    let eta = 0.05;
    let it = 0, converged = false;
    for (; it < maxIter; it++) {
      const G = gradient(doms, cur, P);
      const gm = gmaxOf(G, pin);
      if (gm < tol) { converged = true; break; }
      let s = Math.min(eta, 0.08 / gm); // 每一步最多轉 0.08 rad
      let tries = 0, nxt, E1;
      for (;;) {
        nxt = moved(cur, G, s, pin);
        E1 = energy(doms, nxt, P);
        if (E1 <= E || tries > 40) break;
        s *= 0.5; tries++;
      }
      if (!(E1 <= E)) { converged = true; break; } // 已經到數值精度的極限
      const stuck = E - E1 <= 1e-15 * Math.max(1, Math.abs(E));
      cur = nxt; E = E1;
      eta = s * 1.25;
      if (stuck && gm < 1e-6) { converged = true; break; }
    }
    return { U: cur, E: E, iter: it, converged: converged };
  }

  // ======================= 理想多面體與能量最低的排列 =======================
  const S3 = Math.sqrt(3) / 2;
  const IDEAL = {
    1: [[0, 0, 1]],
    2: [[0, 0, 1], [0, 0, -1]],
    3: [[1, 0, 0], [-0.5, S3, 0], [-0.5, -S3, 0]],
    4: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(unit),
    5: [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-0.5, S3, 0], [-0.5, -S3, 0]],
    6: [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]]
  };
  /** 電子域的「種類」：孤對電子 'L'、鍵 'B1'／'B2'…（鍵結原子是哪一種元素不影響排斥） */
  function kindOf(d) { return d.k === 'L' ? 'L' : 'B' + d.bo; }
  /** 把各種類分配到理想多面體各頂點的所有不同方式（最多 cap 種） */
  function assignments(doms, cap) {
    const kinds = doms.map(kindOf), N = kinds.length;
    const count = {};
    kinds.forEach(function (k) { count[k] = (count[k] || 0) + 1; });
    const keys = Object.keys(count).sort();
    const out = [], cur = [];
    (function rec() {
      if (out.length >= cap) return;
      if (cur.length === N) { out.push(cur.slice()); return; }
      keys.forEach(function (k) {
        if (!count[k]) return;
        count[k]--; cur.push(k); rec(); cur.pop(); count[k]++;
      });
    })();
    // 每一種分配：頂點 i 放種類 out[..][i] → 換成 doms 的順序
    return out.map(function (seq) {
      const used = seq.map(function () { return false; });
      return kinds.map(function (k) {
        for (let i = 0; i < seq.length; i++) if (!used[i] && seq[i] === k) { used[i] = true; return i; }
        return 0;
      });
    });
  }
  const cache = new Map();
  /**
   * 能量最低的排列：理想多面體的每一種位置分配、加上 extra 個隨機起點，各求局部最低點，取能量最低者。
   * 傳回 { U, E, minima: [各個不同的局部最低能量（由低到高）] }（結果有快取）。
   */
  function globalMin(doms, P, opts) {
    opts = opts || {};
    const key = doms.map(kindOf).sort().join(',') + '|' + [P.nBB, P.nLB, P.nLL, P.lam, P.mu, P.rhoL, P.bond[1], P.bond[2], P.bond[3]].join(',');
    if (cache.has(key)) return cache.get(key);
    const N = doms.length;
    const rng = mulberry32(opts.seed == null ? 20261112 : opts.seed);
    const starts = [];
    const base = IDEAL[N];
    assignments(doms, 120).forEach(function (perm) {
      // 稍微擾動，避免停在對稱的鞍點上
      starts.push(perm.map(function (vi) { return unit(base[vi].map(function (x) { return x + 0.02 * gauss(rng); })); }));
    });
    const extra = opts.extra == null ? 6 : opts.extra;
    for (let s = 0; s < extra; s++) starts.push(doms.map(function () { return randomUnit(rng); }));
    let best = null;
    const levels = [];
    starts.forEach(function (U0) {
      const r = relax(doms, U0, P, { tol: 1e-9 });
      if (!levels.some(function (e) { return Math.abs(e - r.E) <= 1e-7 * Math.max(1, Math.abs(r.E)); })) levels.push(r.E);
      if (!best || r.E < best.E) best = r;
    });
    levels.sort(function (a, b) { return a - b; });
    const res = { U: orient(doms, best.U), E: best.E, minima: levels };
    if (cache.size > 400) cache.clear();
    cache.set(key, res);
    return res;
  }
  /**
   * 拖曳放手時的「換位」：被拖的第 i 個電子域若落在另一個電子域「開始拖之前的位置」tolDeg 度以內，
   * 兩者交換位置（其他電子域回到開始拖之前的位置），之後再讓它們互相推開。
   * 拖曳時被抓住的電子域固定不動，其他電子域會整體轉開，所以「拖到某個位置」本身做不出換位後的排列
   * （例如 SF4 孤對電子在軸向的局部最低點），要靠放手時換位。U0：開始拖之前的方向。傳回 { U, j } 或 null。
   */
  function dropSwap(U0, i, u, tolDeg) {
    const tol = tolDeg == null ? 20 : tolDeg;
    let j = -1, best = tol;
    for (let k = 0; k < U0.length; k++) {
      if (k === i) continue;
      const a = angleDeg(u, U0[k]);
      if (a <= best) { best = a; j = k; }
    }
    return j < 0 ? null : swapDomains(U0, i, j);
  }
  /** 第 i、j 個電子域交換位置（其他不動）；畫面上放在某個電子域原本的位置上時用（2D、3D 用畫面上的距離判斷是哪一個） */
  function swapDomains(U0, i, j) {
    if (i === j || i < 0 || j < 0 || i >= U0.length || j >= U0.length) return null;
    const U = U0.map(function (v) { return v.slice(); });
    U[i] = U0[j].slice(); U[j] = U0[i].slice();
    return { U: U, j: j };
  }
  /** 是不是能量最低的排列（容許數值誤差） */
  function isGlobal(E, Eg) { return E <= Eg + 1e-6 * Math.max(1, Math.abs(Eg)); }

  // ---------- 四元數 [w, x, y, z]：整體旋轉（擺正方向的動畫用） ----------
  function qAxis(k, th) { const s = Math.sin(th / 2); return [Math.cos(th / 2), k[0] * s, k[1] * s, k[2] * s]; }
  function qMul(a, b) {
    return [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
      a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
      a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
      a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
  }
  /** 用四元數 q 轉向量 v */
  function qRot(q, v) {
    const a = [q[1], q[2], q[3]], c1 = cross(a, v), t = [2 * c1[0], 2 * c1[1], 2 * c1[2]], c2 = cross(a, t);
    return [v[0] + q[0] * t[0] + c2[0], v[1] + q[0] * t[1] + c2[1], v[2] + q[0] * t[2] + c2[2]];
  }
  /** 從單位向量 a 轉到 b 的四元數（反方向時繞一條垂直軸轉 180°，和 rotateFromTo 相同） */
  function qFromTo(a, b) {
    const ax = cross(a, b), s = norm(ax), c = dot(a, b);
    if (s < 1e-12) {
      if (c > 0) return [1, 0, 0, 0];
      const p = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      return qAxis(unit(cross(a, p)), Math.PI);
    }
    return qAxis([ax[0] / s, ax[1] / s, ax[2] / s], Math.atan2(s, c));
  }
  /** 旋轉 q 的一部分（t = 0 不轉、1 轉完），走最短的路 */
  function qPart(q, t) {
    const w = q[0] < 0 ? [-q[0], -q[1], -q[2], -q[3]] : q;
    const ang = 2 * Math.acos(Math.min(1, w[0]));
    const s = Math.sin(ang / 2);
    if (ang < 1e-12 || s < 1e-12) return [1, 0, 0, 0];
    return qAxis([w[1] / s, w[2] / s, w[3] / s], ang * t);
  }
  /** 旋轉 q 的角度（度） */
  function qAngle(q) { return 2 * Math.acos(Math.min(1, Math.abs(q[0]))) * DEG; }

  /**
   * 把排列轉到好看的方向需要的整體旋轉（四元數）：
   *   有孤對電子：孤對電子的合方向朝上（+z）；孤對電子互相抵消時，第一對孤對電子朝上。
   *   沒有孤對電子：夾角最大的一對電子域（例如三角雙錐的軸）沿 z 軸；只有平面的排列時，平面放成水平；四面體一個鍵朝上。
   *   再繞 z 軸轉：不在軸上的鍵當中最低的那一個朝 +x（一樣低的取第一個；對稱的分子選哪一個看起來都一樣）。
   */
  function orientQuat(doms, U) {
    const N = U.length;
    if (!N) return [1, 0, 0, 0];
    let up = null;
    const L = [];
    doms.forEach(function (d, i) { if (d.k === 'L') L.push(i); });
    if (L.length) {
      const s = [0, 0, 0];
      L.forEach(function (i) { s[0] += U[i][0]; s[1] += U[i][1]; s[2] += U[i][2]; });
      up = norm(s) > 0.2 ? unit(s) : U[L[0]].slice();
    } else if (N === 3) {
      up = unit(cross(U[0], U[1]));
    } else if (N === 2) {
      up = U[0].slice();
    } else {
      // 夾角最大的一對
      let bi = 0, bj = 1, ba = -1;
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const a = angleDeg(U[i], U[j]); if (a > ba + 1e-6) { ba = a; bi = i; bj = j; } }
      up = ba > 170 ? U[bi].slice() : U[0].slice();
      if (N === 4) up = U[0].slice(); // 四面體：一個鍵朝上
      void bj;
    }
    const q1 = qFromTo(unit(up), [0, 0, 1]);
    const V = U.map(function (u) { return qRot(q1, u); });
    let pick = -1, zmin = Infinity;
    for (let i = 0; i < N; i++) {
      const v = V[i];
      if (doms[i].k === 'B' && Math.hypot(v[0], v[1]) > 0.2 && v[2] < zmin - 1e-3) { pick = i; zmin = v[2]; }
    }
    if (pick < 0) return q1;
    return qMul(qAxis([0, 0, 1], -Math.atan2(V[pick][1], V[pick][0])), q1);
  }
  /** 把排列轉到好看的方向（只是整體旋轉，不改變任何夾角），規則見 orientQuat */
  function orient(doms, U) {
    const q = orientQuat(doms, U);
    return U.map(function (u) { return unit(qRot(q, u)); });
  }

  // ======================= 動畫用的一小步 =======================
  /**
   * 過阻尼運動：每個電子域沿著能量的負梯度移動（像在黏稠液體裡被推動），速度 = mob × 力，
   * 每秒最多轉 maxRate 弧度（避免瞬間跳動）。pin：被使用者抓住的電子域，不動。
   * 傳回新的方向陣列與能量、最大的力（梯度）。
   */
  const TAIL = { ref: 0.4, max: 8 };
  function flow(doms, U, P, dt, opts) {
    opts = opts || {};
    const pin = opts.pin == null ? -1 : opts.pin;
    const mob = opts.mob || 1, maxRate = opts.maxRate || 2.5;
    let cur = U, G, gm = 0;
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / sub;
    for (let k = 0; k < sub; k++) {
      G = gradient(doms, cur, P);
      gm = gmaxOf(G, pin);
      if (gm < 1e-14) break;
      // tail：快停下來時（轉速 < TAIL.ref rad/s）把遷移率放大，最多 TAIL.max 倍，
      // 免得三角雙錐這類有「很軟」的變形方向的分子要等很久才停（只影響動畫快慢，不影響停在哪裡）
      const boost = opts.tail ? Math.min(TAIL.max, Math.max(1, TAIL.ref / (mob * gm))) : 1;
      let s = mob * h * boost;
      if (s * gm > maxRate * h) s = maxRate * h / gm;
      cur = moved(cur, G, s, pin);
    }
    return { U: cur, E: energy(doms, cur, P), gmax: gm };
  }
  /**
   * 模擬退火的設定（頁面的「搖一搖」與自動補搖共用）：郎之萬動力學，溫度 T(t) = T0 × E最低 × e^(−t/τ)，持續 dur 秒。
   *   gentle：已經在能量最低的排列時輕輕搖（看得到搖動，但幾乎不會被搖進局部最低點）；
   *   hot：停在局部最低點時用力搖，才有機會越過能障；
   *   rounds：一次「搖一搖」最多連搖幾輪（還停在局部最低點就再搖）。
   * 退火是機率性的：同一個局部最低點，每一輪的結果可能不一樣。
   */
  const ANNEAL = {
    gentle: { T0: 0.015, tau: 1.0, dur: 2.4 },
    hot: { T0: 0.4, tau: 1.0, dur: 3.5 },
    build: { T0: 0.01, tau: 0.3, dur: 0.6 },
    rounds: 5
  };
  /** 郎之萬動力學的熱擾動：溫度 T、遷移率 mob、時間步 dt → 每個方向的隨機偏移標準差 √(2·mob·T·dt) */
  function thermal(U, T, mob, dt, rng, pin) {
    const V = jiggle(U, Math.sqrt(2 * mob * Math.max(0, T) * dt), rng, pin);
    return pin == null || pin < 0 ? despin(U, V) : V;
  }
  /**
   * 去掉整體的轉動：U1 是 U0 每個方向都偏了一點之後的結果；找出最接近這些偏移的整體轉動 ω
   * （最小平方：Σ(1 − u uᵀ) ω = Σ u × δ），再把 U1 整體轉回 −ω。
   * 能量只和電子域之間的夾角有關，整體轉動不改變任何夾角與能量，所以這只是讓分子不會在畫面上亂轉。
   */
  function despin(U0, U1) {
    const N = U0.length;
    if (N < 2) return U1.map(function (u) { return u.slice(); });
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      const u = U0[i], d = [U1[i][0] - u[0], U1[i][1] - u[1], U1[i][2] - u[2]];
      const c = cross(u, d);
      for (let r = 0; r < 3; r++) {
        b[r] += c[r];
        for (let s = 0; s < 3; s++) A[r][s] += (r === s ? 1 : 0) - u[r] * u[s];
      }
    }
    // 直線形的分子繞自己的軸轉沒有意義（A 在這個方向是 0）：加一點點對角項，讓解保持有限
    const eps = 1e-6 * (A[0][0] + A[1][1] + A[2][2]) + 1e-12;
    for (let r = 0; r < 3; r++) A[r][r] += eps;
    const w = solve3(A, b);
    const th = norm(w);
    if (!(th > 1e-14)) return U1.map(function (u) { return u.slice(); });
    const k = [w[0] / th, w[1] / th, w[2] / th];
    return U1.map(function (u) { return unit(rotate(u, k, -th)); });
  }
  /**
   * 選常見分子時的起始排列：從能量最低的排列 G 每個電子域隨機推開約 amp 弧度、去掉整體轉動，
   * 而且放手後會回到能量最低的排列（落到別的局部最低點就重抽，最多 tries 次），
   * 讓學生看到電子域互相推開、很快穩定，而不是一選就卡在局部最低點。
   */
  function scatter(doms, G, P, amp, rng, tries) {
    tries = tries || 12;
    const Eg = energy(doms, G, P);
    let U0 = G.map(function (u) { return u.slice(); });
    for (let k = 0; k < tries; k++) {
      U0 = despin(G, jiggle(G, amp, rng));
      const r = relax(doms, U0, P, { tol: 1e-7, maxIter: 4000 });
      if (isGlobal(r.E, Eg)) return U0;
      amp *= 0.85;
    }
    return U0;
  }
  /** 解 3×3 線性方程組（克拉瑪公式） */
  function solve3(A, b) {
    const det = function (M) {
      return M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    };
    const D = det(A);
    if (Math.abs(D) < 1e-30) return [0, 0, 0];
    return [0, 1, 2].map(function (c) {
      const M = A.map(function (row, r) { return row.map(function (x, s) { return s === c ? b[r] : x; }); });
      return det(M) / D;
    });
  }
  /** 熱擾動（模擬退火用）：每個電子域沿切線方向隨機偏移，標準差 amp（弧度） */
  function jiggle(U, amp, rng, pin) {
    return U.map(function (u, i) {
      if (i === pin) return u.slice();
      const r = [gauss(rng) * amp, gauss(rng) * amp, gauss(rng) * amp];
      const p = dot(r, u);
      return unit([u[0] + r[0] - p * u[0], u[1] + r[1] - p * u[1], u[2] + r[2] - p * u[2]]);
    });
  }
  /**
   * 這個組合的「硬度」：在能量最低的排列附近，讓每個電子域偏一點點，量能量增加多少（≈ ½ k δ²），取最大的 k。
   * 頁面用 mob = 常數 / k，讓每種分子都在差不多的時間內穩定下來。
   */
  function stiffness(doms, P) {
    const g = globalMin(doms, P);
    const d = 0.01;
    let k = 0;
    for (let i = 0; i < doms.length; i++) {
      const u = g.U[i];
      const t1 = unit(cross(u, Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), t2 = cross(u, t1);
      [t1, t2].forEach(function (t) {
        const V = g.U.slice();
        V[i] = unit([u[0] + d * t[0], u[1] + d * t[1], u[2] + d * t[2]]);
        k = Math.max(k, 2 * (energy(doms, V, P) - g.E) / (d * d));
      });
    }
    return Math.max(k, 1e-6);
  }
  /** 新加入的電子域放在哪裡：離現有的電子域最遠的方向（球面上取 400 個點比較） */
  function freeDirection(U) {
    if (!U.length) return [0, 0, 1];
    let best = null, bd = -2;
    const M = 400, ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < M; i++) {
      const z = 1 - 2 * (i + 0.5) / M, r = Math.sqrt(1 - z * z), th = ga * i;
      const c = [r * Math.cos(th), r * Math.sin(th), z];
      let md = 3;
      U.forEach(function (u) { md = Math.min(md, 1 - dot(u, c)); });
      if (md > bd) { bd = md; best = c; }
    }
    return best;
  }

  // ======================= 分析：形狀、鍵角、極性、電子數 =======================
  const SHAPES = {
    linear: ['直線形', 'linear'],
    'trigonal-planar': ['平面三角形', 'trigonal planar'],
    bent: ['角形', 'bent'],
    tetrahedral: ['四面體形', 'tetrahedral'],
    'trigonal-pyramidal': ['三角錐形', 'trigonal pyramidal'],
    'trigonal-bipyramidal': ['三角雙錐形', 'trigonal bipyramidal'],
    seesaw: ['蹺蹺板形', 'seesaw'],
    't-shaped': ['T 形', 'T-shaped'],
    octahedral: ['八面體形', 'octahedral'],
    'square-pyramidal': ['四方錐形', 'square pyramidal'],
    'square-planar': ['平面四方形', 'square planar'],
    diatomic: ['直線形（雙原子）', 'linear (diatomic)']
  };
  /** 電子對幾何（電子域數 → 名稱） */
  const EGEOM = { 2: 'linear', 3: 'trigonal-planar', 4: 'tetrahedral', 5: 'trigonal-bipyramidal', 6: 'octahedral' };
  /** VSEPR 預測的分子形狀：鍵結原子數 m、孤對電子數 n（能量最低的排列） */
  const SHAPE_OF = {
    '2,0': 'linear', '3,0': 'trigonal-planar', '2,1': 'bent',
    '4,0': 'tetrahedral', '3,1': 'trigonal-pyramidal', '2,2': 'bent',
    '5,0': 'trigonal-bipyramidal', '4,1': 'seesaw', '3,2': 't-shaped', '2,3': 'linear',
    '6,0': 'octahedral', '5,1': 'square-pyramidal', '4,2': 'square-planar', '3,3': 't-shaped'
  };
  /** 課本上的 13 種（AXmEn），任務「全收集」用 */
  const STANDARD13 = ['2,0', '3,0', '2,1', '4,0', '3,1', '2,2', '5,0', '4,1', '3,2', '2,3', '6,0', '5,1', '4,2'];
  function shapeOf(m, n) { return m === 1 ? 'diatomic' : (SHAPE_OF[m + ',' + n] || null); }
  /** AXmEn 記號（純文字，數字之後由頁面改成下標） */
  function axe(m, n) { return 'AX' + (m > 1 ? m : '') + (n ? 'E' + (n > 1 ? n : '') : ''); }

  /**
   * 路易斯結構的電子數：
   *   中心原子的形式電荷 = 價電子 − 孤對電子的電子數 − 鍵結數（每個鍵級算一個）；
   *   鍵結原子都補滿八隅體（H 為 2 個電子），本實驗的鍵結原子形式電荷都是 0，所以整個粒子的電荷 = 中心原子的形式電荷。
   *   第二週期的中心原子價殼層最多 8 個電子（octet）。
   */
  function lewis(spec) {
    const c = ELEMENTS[spec.center];
    const bos = spec.ligs.map(function (x) { return LIGANDS[x].bo; });
    const sumBo = bos.reduce(function (a, b) { return a + b; }, 0);
    const shell = 2 * spec.lp + 2 * sumBo; // 中心原子價殼層的電子數
    const charge = c.v - 2 * spec.lp - sumBo;
    const outerLP = spec.ligs.map(function (x) { return x === 'H' ? 0 : 4 - LIGANDS[x].bo; });
    const total = c.v + spec.ligs.reduce(function (a, x) { return a + ELEMENTS[x].v; }, 0) - charge; // 總價電子數
    const octetOK = c.period > 2 || shell <= 8;
    return {
      shell: shell, charge: charge, outerLP: outerLP, total: total, sumBo: sumBo,
      octetOK: octetOK,
      valid: octetOK && Math.abs(charge) <= 1 && spec.ligs.length >= 1
    };
  }
  /** 化學式（結構化）：中心原子在前（第 16、17 族的氫化物把 H 寫在前面，如 H2O），鍵結原子依 H、O、F、Cl、Br 的順序 */
  function formula(spec) {
    const cnt = {};
    spec.ligs.forEach(function (x) { cnt[x] = (cnt[x] || 0) + 1; });
    const parts = [];
    const onlyH = spec.ligs.length > 0 && spec.ligs.every(function (x) { return x === 'H'; });
    const hFirst = onlyH && ['O', 'S', 'F', 'Cl', 'Br'].indexOf(spec.center) >= 0;
    if (hFirst) parts.push({ el: 'H', n: cnt.H });
    parts.push({ el: spec.center, n: 1 });
    LIGAND_ORDER.forEach(function (x) { if (cnt[x] && !(hFirst && x === 'H')) parts.push({ el: x, n: cnt[x] }); });
    const q = lewis(spec).charge;
    return { parts: parts, charge: q, text: parts.map(function (p) { return p.el + (p.n > 1 ? p.n : ''); }).join('') + (q ? (Math.abs(q) > 1 ? Math.abs(q) : '') + (q > 0 ? '+' : '-') : '') };
  }
  /** 組成的比較鍵（鍵結原子順序無關） */
  function specKey(spec) { return spec.center + ':' + spec.ligs.slice().sort().join(',') + ':' + spec.lp; }

  /** 所有「鍵–中心–鍵」的夾角（度），由小到大，附上是哪兩個電子域 */
  function bondAngles(doms, U) {
    const out = [];
    for (let i = 0; i < doms.length; i++) for (let j = i + 1; j < doms.length; j++) {
      if (doms[i].k === 'B' && doms[j].k === 'B') out.push({ i: i, j: j, a: angleDeg(U[i], U[j]) });
    }
    out.sort(function (p, q) { return p.a - q.a; });
    return out;
  }
  /** 把相近（±tol 度）的角度合併成「角度 × 個數」 */
  function groupAngles(list, tol) {
    tol = tol == null ? 0.6 : tol;
    const g = [];
    list.forEach(function (x) {
      const a = typeof x === 'number' ? x : x.a;
      const last = g[g.length - 1];
      if (last && Math.abs(a - last.a0) <= tol) { last.n++; last.sum += a; last.a = last.sum / last.n; }
      else g.push({ a0: a, a: a, n: 1, sum: a });
    });
    return g.map(function (x) { return { a: x.a, n: x.n }; });
  }
  /**
   * 分子極性：鍵偶極 = (χ_鍵結原子 − χ_中心) u（指向電負度大的一端），淨偶極 = 全部相加。
   * 傳回 { bonds: [各鍵偶極向量（孤對電子為 null）], net, mag, sumAbs, polar }。
   * 判斷：|淨偶極| 小於各鍵偶極大小總和的 1%（再加一點數值容許）就是非極性。
   */
  function dipole(spec, doms, U) {
    const chiA = ELEMENTS[spec.center].chi;
    const net = [0, 0, 0];
    let sumAbs = 0;
    const bonds = doms.map(function (d, i) {
      if (d.k !== 'B') return null;
      const q = ELEMENTS[d.lig].chi - chiA;
      const v = [q * U[i][0], q * U[i][1], q * U[i][2]];
      net[0] += v[0]; net[1] += v[1]; net[2] += v[2];
      sumAbs += Math.abs(q);
      return v;
    });
    const mag = norm(net);
    return { bonds: bonds, net: net, mag: mag, sumAbs: sumAbs, polar: mag > 0.01 * sumAbs + 1e-6 };
  }
  /** 三角雙錐（5 個電子域）：夾角最接近 180° 的一對是「軸向」，其餘三個是「赤道」。傳回各電子域是否在軸向 */
  function axialFlags(U) {
    const N = U.length;
    const ax = U.map(function () { return false; });
    if (N !== 5) return ax;
    let bi = 0, bj = 1, ba = -1;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const a = angleDeg(U[i], U[j]); if (a > ba) { ba = a; bi = i; bj = j; } }
    ax[bi] = ax[bj] = true;
    return ax;
  }
  /** 把一組方向的凸包算出來（多面體的邊與面；給「電子對幾何」的示意多面體用） */
  function hull(U) {
    const N = U.length, faces = [], edges = {};
    const addE = function (a, b) { const k = a < b ? a + '-' + b : b + '-' + a; edges[k] = [Math.min(a, b), Math.max(a, b)]; };
    if (N === 2) { addE(0, 1); return { faces: [], edges: [[0, 1]] }; }
    if (N === 3) { addE(0, 1); addE(1, 2); addE(0, 2); return { faces: [[0, 1, 2]], edges: Object.keys(edges).map(function (k) { return edges[k]; }) }; }
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) for (let k = j + 1; k < N; k++) {
      const a = U[i], b = U[j], c = U[k];
      const nrm = cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
      if (norm(nrm) < 1e-9) continue;
      let pos = 0, neg = 0;
      for (let l = 0; l < N; l++) {
        if (l === i || l === j || l === k) continue;
        const s = dot(nrm, [U[l][0] - a[0], U[l][1] - a[1], U[l][2] - a[2]]);
        if (s > 1e-7) pos++; else if (s < -1e-7) neg++;
      }
      if (pos && neg) continue;
      faces.push([i, j, k]);
      addE(i, j); addE(j, k); addE(i, k);
    }
    // 共面的四個點（例如平面四方形）會產生對角線：只保留不被其他兩個面「同平面」劃過的邊
    const list = Object.keys(edges).map(function (k) { return edges[k]; }).filter(function (e) {
      // 邊的中點若在凸包內部（離原點比較近，而且被另一條更短的邊跨過）就去掉：用「中點方向上沒有其他頂點更靠近」判斷
      const m = [(U[e[0]][0] + U[e[1]][0]) / 2, (U[e[0]][1] + U[e[1]][1]) / 2, (U[e[0]][2] + U[e[1]][2]) / 2];
      for (let l = 0; l < N; l++) {
        if (l === e[0] || l === e[1]) continue;
        for (let o = l + 1; o < N; o++) {
          if (o === e[0] || o === e[1]) continue;
          const m2 = [(U[l][0] + U[o][0]) / 2, (U[l][1] + U[o][1]) / 2, (U[l][2] + U[o][2]) / 2];
          if (Math.hypot(m[0] - m2[0], m[1] - m2[1], m[2] - m2[2]) < 1e-6) {
            // 兩條對角線交在同一點：留下較短的那一條，兩條一樣長（正方形）就都去掉
            const L1 = angleDeg(U[e[0]], U[e[1]]), L2 = angleDeg(U[l], U[o]);
            if (L1 >= L2 - 1e-6) return false;
          }
        }
      }
      return true;
    });
    return { faces: faces, edges: list };
  }

  /** 整體分析（頁面讀數與任務事件用） */
  function analyze(spec, doms, U, P, g) {
    const m = spec.ligs.length, n = spec.lp, N = m + n;
    const lw = lewis(spec);
    const angles = bondAngles(doms, U);
    const dp = dipole(spec, doms, U);
    const E = energy(doms, U, P);
    g = g || globalMin(doms, P);
    return {
      m: m, n: n, N: N, axe: axe(m, n), shape: shapeOf(m, n), egeom: EGEOM[N] || null,
      angles: angles, groups: groupAngles(angles), E: E, Eg: g.E, isGlobal: isGlobal(E, g.E),
      dipole: dp, polar: dp.polar, charge: lw.charge, valid: lw.valid, octetOK: lw.octetOK, shell: lw.shell,
      formula: formula(spec), key: specKey(spec)
    };
  }

  /** 顯示用的鍵長（Å）：兩個共價半徑相加，雙鍵、參鍵依鮑林的關係縮短 0.71 log10(鍵級) Å */
  function bondLength(center, lig, bo) {
    return ELEMENTS[center].r + ELEMENTS[lig].r - 0.71 * Math.log10(bo || 1);
  }

  // ======================= 常見分子 =======================
  // exp：實驗測得的鍵角（氣態分子，文獻常見值，度）；note：說明是哪兩個鍵之間的角
  const PRESETS = [
    { id: 'BeCl2', center: 'Be', ligs: ['Cl', 'Cl'], lp: 0, exp: [{ a: 180 }] },
    { id: 'CO2', center: 'C', ligs: ['O', 'O'], lp: 0, exp: [{ a: 180 }] },
    { id: 'BF3', center: 'B', ligs: ['F', 'F', 'F'], lp: 0, exp: [{ a: 120 }] },
    { id: 'SO2', center: 'S', ligs: ['O', 'O'], lp: 1, exp: [{ a: 119.5 }] },
    { id: 'CH4', center: 'C', ligs: ['H', 'H', 'H', 'H'], lp: 0, exp: [{ a: 109.5 }] },
    { id: 'NH3', center: 'N', ligs: ['H', 'H', 'H'], lp: 1, exp: [{ a: 106.7 }] },
    { id: 'H2O', center: 'O', ligs: ['H', 'H'], lp: 2, exp: [{ a: 104.5 }] },
    { id: 'PCl5', center: 'P', ligs: ['Cl', 'Cl', 'Cl', 'Cl', 'Cl'], lp: 0, exp: [{ a: 90, w: 'ax-eq' }, { a: 120, w: 'eq-eq' }, { a: 180, w: 'ax-ax' }] },
    { id: 'SF4', center: 'S', ligs: ['F', 'F', 'F', 'F'], lp: 1, exp: [{ a: 101.6, w: 'eq-eq' }, { a: 173.1, w: 'ax-ax' }] },
    { id: 'ClF3', center: 'Cl', ligs: ['F', 'F', 'F'], lp: 2, exp: [{ a: 87.5, w: 'ax-eq' }, { a: 175.0, w: 'ax-ax' }] },
    { id: 'XeF2', center: 'Xe', ligs: ['F', 'F'], lp: 3, exp: [{ a: 180 }] },
    { id: 'SF6', center: 'S', ligs: ['F', 'F', 'F', 'F', 'F', 'F'], lp: 0, exp: [{ a: 90 }, { a: 180 }] },
    { id: 'BrF5', center: 'Br', ligs: ['F', 'F', 'F', 'F', 'F'], lp: 1, exp: [{ a: 84.8, w: 'ap-bas' }] },
    { id: 'XeF4', center: 'Xe', ligs: ['F', 'F', 'F', 'F'], lp: 2, exp: [{ a: 90 }, { a: 180 }] }
  ];
  function preset(id) { for (let i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i]; return null; }

  const api = {
    DEG: DEG, ELEMENTS: ELEMENTS, CENTERS: CENTERS, LIGANDS: LIGANDS, LIGAND_ORDER: LIGAND_ORDER,
    MAX_DOMAINS: MAX_DOMAINS, MIN_DOMAINS: MIN_DOMAINS, MAX_LP: MAX_LP, MODEL: MODEL, params: params,
    mulberry32: mulberry32, gauss: gauss, randomUnit: randomUnit,
    dot: dot, norm: norm, unit: unit, cross: cross, angleDeg: angleDeg, rotate: rotate, rotateFromTo: rotateFromTo,
    domainsOf: domainsOf, weight: weight, energy: energy, gradient: gradient, relax: relax,
    IDEAL: IDEAL, assignments: assignments, globalMin: globalMin, isGlobal: isGlobal, dropSwap: dropSwap, swapDomains: swapDomains, orient: orient,
    orientQuat: orientQuat, qRot: qRot, qPart: qPart, qMul: qMul, qAxis: qAxis, qAngle: qAngle,
    flow: flow, TAIL: TAIL, jiggle: jiggle, thermal: thermal, despin: despin, scatter: scatter, ANNEAL: ANNEAL, stiffness: stiffness, freeDirection: freeDirection,
    SHAPES: SHAPES, EGEOM: EGEOM, SHAPE_OF: SHAPE_OF, STANDARD13: STANDARD13, shapeOf: shapeOf, axe: axe,
    lewis: lewis, formula: formula, specKey: specKey, bondAngles: bondAngles, groupAngles: groupAngles,
    dipole: dipole, axialFlags: axialFlags, hull: hull, analyze: analyze, bondLength: bondLength,
    PRESETS: PRESETS, preset: preset
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VseprCore = api;
})(typeof window !== 'undefined' ? window : this);
