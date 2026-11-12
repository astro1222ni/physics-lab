/*
 * ideal-gas-core.js — 理想氣體分子模擬的物理核心（與畫面無關，可單獨測試）
 *
 * 模型：三維長方體容器裡的硬球分子（單原子氣體），分子之間、分子與器壁之間都是完全彈性碰撞。
 *   容器：0 ≤ x ≤ Lx、0 ≤ y ≤ Ly、0 ≤ z ≤ Lz；x = Lx 是可以移動的活塞。
 *   器壁的位置指「分子中心」能到達的邊界，所以體積 V = Lx·Ly·Lz 就是分子中心可活動的空間，
 *   壓力 P = 器壁受到的總衝量 ÷（器壁總面積 × 時間）。
 *
 * 單位（模擬內部）：
 *   長度 nm、時間 ps、質量 u（原子質量單位）、溫度 K
 *   速度 1 nm/ps = 1000 m/s
 *   能量 1 u·nm²/ps² = 1.66053906660 × 10⁻²¹ J
 *   壓力 1 u/(nm·ps²) = 1.66053906660 × 10⁶ Pa
 *   波茲曼常數 k = 1.380649 × 10⁻²³ J/K = 8.3144626… × 10⁻³ u·nm²/(ps²·K)
 *
 * 時間推進（每個小步長 h）：
 *   1. 用小步長開始時的位置與速度，對相鄰格子裡的每一對分子解「何時接觸」的二次方程式，
 *      依時間先後處理碰撞（每個分子每一步最多一次；步長很小，同一步撞兩次的機率可忽略）。
 *      碰撞沿兩球連心線交換動量：動量與動能守恆到捨入誤差。
 *   2. 每個分子依序處理撞牆事件（精確的撞牆時刻）：
 *      ‧ 一般器壁：鏡面反射（法向速度反向）。
 *      ‧ 恆溫壁（開啟恆溫槽時，除了活塞以外的五面牆）：分子被吸收後，依溫度 T 的「撞壁通量」
 *        馬克士威分布重新射出：法向速率 vₙ 的機率 ∝ vₙ exp(−m vₙ²/2kT)，切向為常態分布。
 *        這樣的牆與氣體達成熱平衡後，氣體恰好是溫度 T 的馬克士威分布。
 *      ‧ 活塞（速度 u）：在活塞參考系中彈性反射，vx′ = 2u − vx；活塞對氣體作的功 = 動能變化。
 *   沒有恆溫槽、活塞不動時，總動能嚴格守恆（只有捨入誤差）。
 */
(function (root) {
  'use strict';

  // ---------- 物理常數與單位換算 ----------
  const KB_SI = 1.380649e-23;        // J/K
  const U_KG = 1.66053906892e-27;    // kg
  const NA = 6.02214076e23;          // 1/mol
  const R_SI = KB_SI * NA;           // J/(mol·K)
  const E_UNIT = U_KG * 1e6;         // J：1 u·nm²/ps²
  const P_UNIT = U_KG * 1e33;        // Pa：1 u/(nm·ps²)
  const V_UNIT = 1000;               // m/s：1 nm/ps
  const KB = KB_SI / E_UNIT;         // u·nm²/(ps²·K)
  const VOL_UNIT = 1e-27;            // m³：1 nm³

  /**
   * 單原子氣體。m：原子質量（u）；d：模擬用的硬球直徑（nm）。
   * 真實原子的碰撞直徑約 0.26（He）～0.4 nm（Xe）；這裡略為放大，讓分子間碰撞夠頻繁、
   * 又不會讓分子本身的體積明顯影響壓力（見 hardSphereZ）。
   */
  const SPECIES = [
    { id: 'He', m: 4.002602, d: 0.44, zh: '氦', en: 'Helium' },
    { id: 'Ne', m: 20.1797, d: 0.46, zh: '氖', en: 'Neon' },
    { id: 'Ar', m: 39.948, d: 0.50, zh: '氬', en: 'Argon' },
    { id: 'Kr', m: 83.798, d: 0.52, zh: '氪', en: 'Krypton' },
    { id: 'Xe', m: 131.293, d: 0.56, zh: '氙', en: 'Xenon' }
  ];

  // ---------- 理論公式（模擬單位） ----------
  function kT(T) { return KB * T; }
  /** 方均根速率 √(3kT/m) */
  function vrms(T, m) { return Math.sqrt(3 * KB * T / m); }
  /** 平均速率 √(8kT/πm) */
  function vmean(T, m) { return Math.sqrt(8 * KB * T / (Math.PI * m)); }
  /** 最可能速率 √(2kT/m) */
  function vprob(T, m) { return Math.sqrt(2 * KB * T / m); }
  /** 三維馬克士威速率分布 f(v)（對 v 積分為 1；單位 1/(nm/ps)） */
  function maxwell(v, T, m) {
    const a = m / (2 * KB * T);
    return 4 * Math.PI * Math.pow(a / Math.PI, 1.5) * v * v * Math.exp(-a * v * v);
  }
  /** 平均移動動能 (3/2)kT */
  function meanKE(T) { return 1.5 * KB * T; }
  /** 理想氣體壓力 NkT/V */
  function idealP(N, T, V) { return N * KB * T / V; }
  /** 由壓力與溫度求體積 NkT/P */
  function idealV(N, T, P) { return N * KB * T / P; }
  /** 由平均動能求溫度：⟨E⟩ = (3/2)kT */
  function tempFromKE(meanE) { return meanE / (1.5 * KB); }
  /** 絕熱過程（準靜態）：TV^(γ−1) = 常數 */
  function adiabaticT(T1, V1, V2, gamma) { return T1 * Math.pow(V1 / V2, (gamma || 5 / 3) - 1); }
  /** 絕熱過程（準靜態）：PV^γ = 常數 */
  function adiabaticP(P1, V1, V2, gamma) { return P1 * Math.pow(V1 / V2, gamma || 5 / 3); }
  /** 單位面積、單位時間撞牆次數 ¼ n v̄ */
  function wallFlux(n, vbar) { return n * vbar / 4; }
  /**
   * 硬球氣體的壓縮因子（第二維里係數）：P = (NkT/V)·Z，Z ≈ 1 + (2π/3) n Σᵢⱼ xᵢxⱼ dᵢⱼ³。
   * counts 與 diams 為各種分子的數目與直徑；V 為體積。
   */
  function hardSphereZ(counts, diams, V) {
    let N = 0;
    counts.forEach(function (c) { N += c; });
    if (!N) return 1;
    let B = 0;
    for (let i = 0; i < counts.length; i++) {
      for (let j = 0; j < counts.length; j++) {
        const dij = (diams[i] + diams[j]) / 2;
        B += (counts[i] / N) * (counts[j] / N) * dij * dij * dij;
      }
    }
    return 1 + (2 * Math.PI / 3) * (N / V) * B;
  }

  // ---------- 單位換算（顯示用） ----------
  const toSI = {
    speed: function (v) { return v * V_UNIT; },              // nm/ps → m/s
    energy: function (e) { return e * E_UNIT; },              // → J
    pressure: function (p) { return p * P_UNIT; },            // → Pa
    pressureKPa: function (p) { return p * P_UNIT / 1000; },  // → kPa
    volume: function (v) { return v * VOL_UNIT; },            // nm³ → m³
    mass: function (m) { return m * U_KG; }                   // u → kg
  };
  const fromSI = {
    speed: function (v) { return v / V_UNIT; },
    pressureKPa: function (p) { return p * 1000 / P_UNIT; }
  };
  /** 分子數 → 莫耳數 */
  function moles(N) { return N / NA; }

  // ---------- 亂數（可指定種子，測試可重現） ----------
  function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) {
    let u = rng();
    while (u <= 1e-300) u = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  }

  // ---------- 兩球彈性碰撞（純函式，測試用也用它） ----------
  /**
   * a、b：{ m, x, y, z, vx, vy, vz }（直接修改速度）。沿連心線交換動量。
   * 回傳沿連心線的接近速率（> 0 表示確實發生碰撞）。
   */
  function collidePair(a, b) {
    let nx = a.x - b.x, ny = a.y - b.y, nz = a.z - b.z;
    const L = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!(L > 0)) return 0;
    nx /= L; ny /= L; nz /= L;
    const dv = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny + (a.vz - b.vz) * nz;
    if (dv >= 0) return 0;
    const M = a.m + b.m, ka = 2 * b.m / M * dv, kb = 2 * a.m / M * dv;
    a.vx -= ka * nx; a.vy -= ka * ny; a.vz -= ka * nz;
    b.vx += kb * nx; b.vy += kb * ny; b.vz += kb * nz;
    return -dv;
  }

  // ---------- 氣體 ----------
  const WALL = { XL: 0, PISTON: 1, YL: 2, YH: 3, ZL: 4, ZH: 5 };

  function newAcc(ns) {
    return {
      t: 0,                         // 經過時間（ps）
      J: 0,                         // 所有器壁受到的衝量總和
      Js: new Float64Array(ns),     // 各種分子造成的衝量（分壓）
      At: 0,                        // ∫(器壁總面積) dt
      Vt: 0,                        // ∫V dt
      KEt: new Float64Array(ns),    // ∫(各種分子的總動能) dt
      hits: 0,                      // 撞牆次數（全部器壁）
      hitsPiston: 0,                // 撞活塞次數
      coll: 0,                      // 分子之間的碰撞次數
      Q: 0,                         // 恆溫壁傳給氣體的熱量
      W: 0                          // 活塞對氣體作的功
    };
  }

  /**
   * 建立氣體。
   * o = { species: [{m, d}, …]（最多 2 種）, counts: [nA, nB], T, Lx, Ly, Lz, LxMin, LxMax,
   *       seed, init: 'maxwell'（預設）或 'same'（所有分子同一速率，總動能對應溫度 T）, cap }
   */
  function createGas(o) {
    const cap = o.cap || 600;
    const sp = o.species.map(function (s) { return { m: s.m, d: s.d }; });
    const g = {
      cap: cap, n: 0,
      x: new Float64Array(cap), y: new Float64Array(cap), z: new Float64Array(cap),
      vx: new Float64Array(cap), vy: new Float64Array(cap), vz: new Float64Array(cap),
      s: new Uint8Array(cap), m: new Float64Array(cap), rad: new Float64Array(cap),
      tc: new Float64Array(cap), tw: new Float64Array(cap), used: new Uint8Array(cap), next: new Int32Array(cap),
      species: sp,
      Lx: o.Lx, Ly: o.Ly, Lz: o.Lz,
      LxMin: o.LxMin != null ? o.LxMin : 0.5 * o.Lx, LxMax: o.LxMax != null ? o.LxMax : 2 * o.Lx,
      rng: makeRng(o.seed == null ? 12345 : o.seed),
      t: 0, u: 0,
      bath: { on: !!o.bath, T: o.bathT || o.T },
      // 活塞：'target' 移向指定位置；'pressure' 依壓力的移動平均（時間常數 tau ps）調整，使壓力維持在 Pset
      piston: { mode: 'target', target: o.Lx, vmax: o.pistonVmax || 0.05, Pset: 0, pEma: null, tau: 40, band: 0.15 },
      acc: newAcc(sp.length),
      pistonHits: [],               // 最近撞擊活塞的紀錄（畫面效果、音效用）：{ y, z, J, s }
      recordHits: !!o.recordHits,
      diffuse: !!o.diffuse,           // true：絕熱壁為粗糙壁（彈性漫反射）；false：光滑壁（鏡面反射）
      track: -1, trackPts: [],        // 追蹤的分子：每次碰撞或撞牆時記錄位置（畫軌跡用）
      grid: null
    };
    addMolecules(g, o.counts || [0], o.T, o.init);
    return g;
  }

  /** 把分子放在不重疊的隨機位置；速度依溫度 T 的馬克士威分布（或 'same'：同一速率） */
  function addMolecules(g, counts, T, init) {
    const rng = g.rng;
    for (let k = 0; k < counts.length; k++) {
      const spc = g.species[k];
      for (let c = 0; c < counts[k] && g.n < g.cap; c++) {
        const i = g.n;
        const r = spc.d / 2;
        let ok = false, tries = 0, px = 0, py = 0, pz = 0;
        while (!ok && tries < 400) {
          tries++;
          px = rng() * g.Lx; py = rng() * g.Ly; pz = rng() * g.Lz;
          ok = true;
          for (let j = 0; j < g.n; j++) {
            const dx = px - g.x[j], dy = py - g.y[j], dz = pz - g.z[j], dd = r + g.rad[j];
            if (dx * dx + dy * dy + dz * dz < dd * dd * 1.21) { ok = false; break; }
          }
        }
        g.x[i] = px; g.y[i] = py; g.z[i] = pz;
        g.s[i] = k; g.m[i] = spc.m; g.rad[i] = r;
        const sg = Math.sqrt(KB * T / spc.m);
        g.vx[i] = sg * gauss(rng); g.vy[i] = sg * gauss(rng); g.vz[i] = sg * gauss(rng);
        g.n++;
      }
    }
    if (init === 'same') sameSpeed(g);
  }

  /** 移除第 i 個分子（用最後一個補上） */
  function removeMolecule(g, i) {
    const j = g.n - 1;
    if (g.track === i || g.track === j) { g.track = -1; g.trackPts.length = 0; }
    if (i !== j) {
      g.x[i] = g.x[j]; g.y[i] = g.y[j]; g.z[i] = g.z[j];
      g.vx[i] = g.vx[j]; g.vy[i] = g.vy[j]; g.vz[i] = g.vz[j];
      g.s[i] = g.s[j]; g.m[i] = g.m[j]; g.rad[i] = g.rad[j];
    }
    g.n--;
  }

  /** 調整各種分子的數目：多的隨機移除，少的以溫度 T 的馬克士威分布加入 */
  function setCounts(g, counts, T) {
    const have = countBySpecies(g);
    for (let k = 0; k < g.species.length; k++) {
      let extra = have[k] - (counts[k] || 0);
      while (extra > 0) {
        const idx = [];
        for (let i = 0; i < g.n; i++) if (g.s[i] === k) idx.push(i);
        removeMolecule(g, idx[Math.floor(g.rng() * idx.length)]);
        extra--;
      }
    }
    const add = g.species.map(function (s, k) { return Math.max(0, (counts[k] || 0) - countBySpecies(g)[k]); });
    addMolecules(g, add, T, 'maxwell');
  }

  /** 所有分子改成同一速率、方向隨機，總動能不變（非平衡狀態） */
  function sameSpeed(g) {
    let E = 0, M = 0;
    for (let i = 0; i < g.n; i++) {
      E += 0.5 * g.m[i] * (g.vx[i] * g.vx[i] + g.vy[i] * g.vy[i] + g.vz[i] * g.vz[i]);
      M += g.m[i];
    }
    const s = Math.sqrt(2 * E / M);
    for (let i = 0; i < g.n; i++) {
      const cz = 2 * g.rng() - 1, ph = 2 * Math.PI * g.rng(), sz = Math.sqrt(1 - cz * cz);
      g.vx[i] = s * sz * Math.cos(ph); g.vy[i] = s * sz * Math.sin(ph); g.vz[i] = s * cz;
    }
  }

  /** 依溫度 T 重新抽樣所有分子的速度（位置不變） */
  function thermalize(g, T) {
    for (let i = 0; i < g.n; i++) {
      const sg = Math.sqrt(KB * T / g.m[i]);
      g.vx[i] = sg * gauss(g.rng); g.vy[i] = sg * gauss(g.rng); g.vz[i] = sg * gauss(g.rng);
    }
  }

  function countBySpecies(g) {
    const c = g.species.map(function () { return 0; });
    for (let i = 0; i < g.n; i++) c[g.s[i]]++;
    return c;
  }

  /** 各種分子的總動能與總數 */
  function kinetic(g) {
    const E = g.species.map(function () { return 0; }), c = countBySpecies(g);
    let tot = 0;
    for (let i = 0; i < g.n; i++) {
      const e = 0.5 * g.m[i] * (g.vx[i] * g.vx[i] + g.vy[i] * g.vy[i] + g.vz[i] * g.vz[i]);
      E[g.s[i]] += e; tot += e;
    }
    return { total: tot, bySpecies: E, counts: c };
  }
  /** 氣體溫度（由平均動能）：T = (2/3)⟨E⟩/k */
  function temperature(g) { return g.n ? tempFromKE(kinetic(g).total / g.n) : 0; }
  function momentum(g) {
    let px = 0, py = 0, pz = 0;
    for (let i = 0; i < g.n; i++) { px += g.m[i] * g.vx[i]; py += g.m[i] * g.vy[i]; pz += g.m[i] * g.vz[i]; }
    return [px, py, pz];
  }
  function volume(g) { return g.Lx * g.Ly * g.Lz; }
  function wallArea(g, X) { const L = X == null ? g.Lx : X; return 2 * g.Ly * g.Lz + 2 * L * (g.Ly + g.Lz); }
  function maxSpeed(g) {
    let v2 = 0;
    for (let i = 0; i < g.n; i++) {
      const s = g.vx[i] * g.vx[i] + g.vy[i] * g.vy[i] + g.vz[i] * g.vz[i];
      if (s > v2) v2 = s;
    }
    return Math.sqrt(v2);
  }
  function maxDiameter(g) { let d = 0; g.species.forEach(function (s) { d = Math.max(d, s.d); }); return d; }

  // ---------- 時間推進 ----------
  const MAX_DISP = 0.5; // nm：每個小步長分子最多移動的距離

  /** 推進 dt（ps）；回傳實際使用的小步長數 */
  function advance(g, dt) {
    let rem = dt, steps = 0;
    while (rem > 1e-12) {
      const vm = maxSpeed(g);
      const h = Math.min(rem, MAX_DISP / Math.max(vm, Math.abs(g.piston.vmax), 1e-6), 1);
      substep(g, h, vm);
      rem -= h;
      steps++;
    }
    return steps;
  }

  function pistonVelocity(g, h) {
    const P = g.piston;
    let u = 0;
    if (P.mode === 'target') {
      const tgt = Math.max(g.LxMin, Math.min(g.LxMax, P.target));
      u = Math.max(-P.vmax, Math.min(P.vmax, (tgt - g.Lx) / h));
    } else if (P.mode === 'pressure' && P.pEma != null && P.Pset > 0) {
      // 壓力偏高就向外、偏低就向內；相差達 band（比例）時以最大速率移動
      u = P.vmax * Math.max(-1, Math.min(1, (P.pEma - P.Pset) / (P.Pset * P.band)));
    }
    if (g.Lx + u * h < g.LxMin) u = (g.LxMin - g.Lx) / h;
    if (g.Lx + u * h > g.LxMax) u = (g.LxMax - g.Lx) / h;
    return u;
  }

  /** 由時間 t（小步長內）的狀態，求下一次撞牆還要多久與撞哪一面牆 */
  const wallOut = { t: Infinity, w: -1 };
  function nextWall(g, i, t, X0, u) {
    let best = Infinity, w = -1;
    const x = g.x[i], y = g.y[i], z = g.z[i], vx = g.vx[i], vy = g.vy[i], vz = g.vz[i];
    if (vx < 0) { const tt = x / -vx; if (tt < best) { best = tt; w = WALL.XL; } }
    if (vx > u) {
      const X = X0 + u * t;
      const tt = Math.max(0, (X - x) / (vx - u));
      if (tt < best) { best = tt; w = WALL.PISTON; }
    }
    if (vy < 0) { const tt = y / -vy; if (tt < best) { best = tt; w = WALL.YL; } }
    else if (vy > 0) { const tt = (g.Ly - y) / vy; if (tt < best) { best = tt; w = WALL.YH; } }
    if (vz < 0) { const tt = z / -vz; if (tt < best) { best = tt; w = WALL.ZL; } }
    else if (vz > 0) { const tt = (g.Lz - z) / vz; if (tt < best) { best = tt; w = WALL.ZH; } }
    wallOut.t = best < 0 ? 0 : best; wallOut.w = w;
    return wallOut;
  }

  /** 撞牆：更新速度並累計衝量、熱量、功 */
  function hitWall(g, i, w, Xnow, u) {
    const m = g.m[i], k = g.s[i], A = g.acc;
    const e0 = 0.5 * m * (g.vx[i] * g.vx[i] + g.vy[i] * g.vy[i] + g.vz[i] * g.vz[i]);
    let J;
    if (w === WALL.PISTON) {
      g.x[i] = Xnow;
      const v0 = g.vx[i], v1 = 2 * u - v0;
      g.vx[i] = v1;
      J = m * (v0 - v1);
      const e1 = 0.5 * m * (v1 * v1 + g.vy[i] * g.vy[i] + g.vz[i] * g.vz[i]);
      A.W += e1 - e0;
      A.hitsPiston++;
      if (g.recordHits) {
        g.pistonHits.push({ y: g.y[i], z: g.z[i], J: J, s: k });
        if (g.pistonHits.length > 400) g.pistonHits.splice(0, g.pistonHits.length - 400);
      }
    } else {
      // 法向分量的索引與朝內的方向
      let comp, inward;
      if (w === WALL.XL) { g.x[i] = 0; comp = 'x'; inward = 1; }
      else if (w === WALL.YL) { g.y[i] = 0; comp = 'y'; inward = 1; }
      else if (w === WALL.YH) { g.y[i] = g.Ly; comp = 'y'; inward = -1; }
      else if (w === WALL.ZL) { g.z[i] = 0; comp = 'z'; inward = 1; }
      else { g.z[i] = g.Lz; comp = 'z'; inward = -1; }
      const arr = comp === 'x' ? g.vx : comp === 'y' ? g.vy : g.vz;
      const vin = Math.abs(arr[i]);
      if (g.bath.on) {
        // 恆溫壁：依撞壁通量的馬克士威分布重新射出
        const sg = Math.sqrt(KB * g.bath.T / m);
        let U = g.rng();
        while (U <= 1e-300) U = g.rng();
        const vn = sg * Math.sqrt(-2 * Math.log(U));
        const t1 = sg * gauss(g.rng), t2 = sg * gauss(g.rng);
        if (comp === 'x') { g.vx[i] = inward * vn; g.vy[i] = t1; g.vz[i] = t2; }
        else if (comp === 'y') { g.vy[i] = inward * vn; g.vx[i] = t1; g.vz[i] = t2; }
        else { g.vz[i] = inward * vn; g.vx[i] = t1; g.vy[i] = t2; }
        J = m * (vin + vn);
        const e1 = 0.5 * m * (g.vx[i] * g.vx[i] + g.vy[i] * g.vy[i] + g.vz[i] * g.vz[i]);
        A.Q += e1 - e0;
      } else if (g.diffuse) {
        // 絕熱的粗糙壁：速率不變，方向依餘弦定律隨機（彈性漫反射）
        const sp = Math.sqrt(2 * e0 / m);
        const ct = Math.sqrt(g.rng()), st = Math.sqrt(1 - ct * ct), ph = 2 * Math.PI * g.rng();
        const vn = sp * ct, t1 = sp * st * Math.cos(ph), t2 = sp * st * Math.sin(ph);
        if (comp === 'x') { g.vx[i] = inward * vn; g.vy[i] = t1; g.vz[i] = t2; }
        else if (comp === 'y') { g.vy[i] = inward * vn; g.vx[i] = t1; g.vz[i] = t2; }
        else { g.vz[i] = inward * vn; g.vx[i] = t1; g.vy[i] = t2; }
        J = m * (vin + vn);
      } else {
        arr[i] = inward * vin;
        J = 2 * m * vin;
      }
    }
    A.J += J; A.Js[k] += J; A.hits++;
    if (i === g.track) recordTrack(g, i);
  }

  function recordTrack(g, i) {
    g.trackPts.push(g.x[i], g.y[i], g.z[i]);
    if (g.trackPts.length > 900) g.trackPts.splice(0, g.trackPts.length - 900);
  }

  // 格子（找相鄰的分子對）
  function ensureGrid(g, cell) {
    const nx = Math.max(1, Math.floor(g.Lx / cell)), ny = Math.max(1, Math.floor(g.Ly / cell)), nz = Math.max(1, Math.floor(g.Lz / cell));
    const ncell = nx * ny * nz;
    if (!g.grid || g.grid.head.length < ncell) g.grid = { head: new Int32Array(Math.max(ncell, 64) * 2), ci: new Int32Array(g.cap * 3) };
    g.grid.nx = nx; g.grid.ny = ny; g.grid.nz = nz;
    g.grid.cx = nx / g.Lx; g.grid.cy = ny / g.Ly; g.grid.cz = nz / g.Lz;
    g.grid.head.fill(-1, 0, ncell);
    return g.grid;
  }

  const cand = { t: [], i: [], j: [], order: [] };

  function substep(g, h, vmax) {
    const n = g.n, A = g.acc;
    const u = pistonVelocity(g, h);
    g.u = u;
    const X0 = g.Lx;
    const J0 = A.J;

    // 1. 每個分子在本步的第一次撞牆時刻
    for (let i = 0; i < n; i++) { g.tw[i] = nextWall(g, i, 0, X0, u).t; g.tc[i] = 0; g.used[i] = 0; }

    // 2. 找出本步內會接觸的分子對（格子邊長 ≥ 直徑 + 兩分子本步最多靠近的距離）
    const cell = Math.max(1.2, maxDiameter(g) + 2 * vmax * h + 1e-9);
    const G = ensureGrid(g, cell);
    const nx = G.nx, ny = G.ny, nz = G.nz, head = G.head, next = g.next, ci = G.ci;
    for (let i = 0; i < n; i++) {
      const ix = Math.min(nx - 1, Math.max(0, Math.floor(g.x[i] * G.cx)));
      const iy = Math.min(ny - 1, Math.max(0, Math.floor(g.y[i] * G.cy)));
      const iz = Math.min(nz - 1, Math.max(0, Math.floor(g.z[i] * G.cz)));
      const c = (ix * ny + iy) * nz + iz;
      ci[3 * i] = ix; ci[3 * i + 1] = iy; ci[3 * i + 2] = iz;
      next[i] = head[c]; head[c] = i;
    }
    cand.t.length = 0; cand.i.length = 0; cand.j.length = 0;
    for (let i = 0; i < n; i++) {
      const ix = ci[3 * i], iy = ci[3 * i + 1], iz = ci[3 * i + 2];
      const x0 = ix > 0 ? ix - 1 : 0, x1 = ix < nx - 1 ? ix + 1 : ix;
      const y0 = iy > 0 ? iy - 1 : 0, y1 = iy < ny - 1 ? iy + 1 : iy;
      const z0 = iz > 0 ? iz - 1 : 0, z1 = iz < nz - 1 ? iz + 1 : iz;
      for (let jx = x0; jx <= x1; jx++) for (let jy = y0; jy <= y1; jy++) for (let jz = z0; jz <= z1; jz++) {
        for (let j = head[(jx * ny + jy) * nz + jz]; j >= 0; j = next[j]) if (j > i) testPair(g, i, j, h);
      }
    }

    // 3. 依時間先後處理碰撞
    const m = cand.t.length;
    if (m) {
      const ord = cand.order;
      ord.length = m;
      for (let k = 0; k < m; k++) ord[k] = k;
      if (m > 1) ord.sort(function (a, b) { return cand.t[a] - cand.t[b]; });
      for (let q = 0; q < m; q++) {
        const k = ord[q], i = cand.i[k], j = cand.j[k];
        if (g.used[i] || g.used[j]) continue;
        const tau = cand.t[k];
        g.x[i] += g.vx[i] * tau; g.y[i] += g.vy[i] * tau; g.z[i] += g.vz[i] * tau;
        g.x[j] += g.vx[j] * tau; g.y[j] += g.vy[j] * tau; g.z[j] += g.vz[j] * tau;
        g.tc[i] = tau; g.tc[j] = tau;
        g.used[i] = 1; g.used[j] = 1;
        if (pairKick(g, i, j)) {
          A.coll++;
          if (i === g.track) recordTrack(g, i);
          else if (j === g.track) recordTrack(g, j);
        }
      }
    }

    // 4. 每個分子走完本步，途中精確處理撞牆
    for (let i = 0; i < n; i++) {
      let t = g.tc[i], guard = 0;
      while (guard++ < 12) {
        const ev = nextWall(g, i, t, X0, u);
        if (t + ev.t > h) break;
        const dt = ev.t;
        g.x[i] += g.vx[i] * dt; g.y[i] += g.vy[i] * dt; g.z[i] += g.vz[i] * dt;
        t += dt;
        hitWall(g, i, ev.w, X0 + u * t, u);
      }
      const dt = h - t;
      g.x[i] += g.vx[i] * dt; g.y[i] += g.vy[i] * dt; g.z[i] += g.vz[i] * dt;
    }

    // 5. 活塞移到新位置；捨入誤差造成的極小越界拉回
    g.Lx = X0 + u * h;
    for (let i = 0; i < n; i++) {
      if (g.x[i] < 0) g.x[i] = 0; else if (g.x[i] > g.Lx) g.x[i] = g.Lx;
      if (g.y[i] < 0) g.y[i] = 0; else if (g.y[i] > g.Ly) g.y[i] = g.Ly;
      if (g.z[i] < 0) g.z[i] = 0; else if (g.z[i] > g.Lz) g.z[i] = g.Lz;
    }

    // 6. 累計：時間、∫A dt、∫V dt、∫E dt
    const Xm = X0 + 0.5 * u * h;
    const Aavg = 2 * g.Ly * g.Lz + 2 * Xm * (g.Ly + g.Lz);
    A.t += h;
    A.At += Aavg * h;
    A.Vt += Xm * g.Ly * g.Lz * h;
    for (let i = 0; i < n; i++) A.KEt[g.s[i]] += 0.5 * g.m[i] * (g.vx[i] * g.vx[i] + g.vy[i] * g.vy[i] + g.vz[i] * g.vz[i]) * h;
    // 等壓控制用：壓力的指數移動平均
    const P = g.piston;
    const pin = (A.J - J0) / (Aavg * h);
    if (P.pEma == null) P.pEma = pin;
    else P.pEma += Math.min(1, h / P.tau) * (pin - P.pEma);
    g.t += h;
  }

  function testPair(g, i, j, h) {
    const rx = g.x[i] - g.x[j], ry = g.y[i] - g.y[j], rz = g.z[i] - g.z[j];
    const vx = g.vx[i] - g.vx[j], vy = g.vy[i] - g.vy[j], vz = g.vz[i] - g.vz[j];
    const b = rx * vx + ry * vy + rz * vz;
    if (b >= 0) return; // 正在分開
    const dd = g.rad[i] + g.rad[j];
    const c = rx * rx + ry * ry + rz * rz - dd * dd;
    let tau;
    if (c <= 0) tau = 0; // 已經接觸（上一步的極小重疊）且正在接近
    else {
      const v2 = vx * vx + vy * vy + vz * vz;
      const disc = b * b - v2 * c;
      if (disc <= 0) return;
      tau = c / (-b + Math.sqrt(disc));
      if (tau > h) return;
    }
    if (tau >= g.tw[i] || tau >= g.tw[j]) return; // 先撞牆的，下一步再算
    cand.t.push(tau); cand.i.push(i); cand.j.push(j);
  }

  function pairKick(g, i, j) {
    let nx = g.x[i] - g.x[j], ny = g.y[i] - g.y[j], nz = g.z[i] - g.z[j];
    const L = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!(L > 0)) return false;
    nx /= L; ny /= L; nz /= L;
    const dv = (g.vx[i] - g.vx[j]) * nx + (g.vy[i] - g.vy[j]) * ny + (g.vz[i] - g.vz[j]) * nz;
    if (dv >= 0) return false;
    const mi = g.m[i], mj = g.m[j], M = mi + mj;
    const ki = 2 * mj / M * dv, kj = 2 * mi / M * dv;
    g.vx[i] -= ki * nx; g.vy[i] -= ki * ny; g.vz[i] -= ki * nz;
    g.vx[j] += kj * nx; g.vy[j] += kj * ny; g.vz[j] += kj * nz;
    return true;
  }

  /** 取出累計量並歸零 */
  function takeAcc(g) {
    const a = g.acc;
    g.acc = newAcc(g.species.length);
    return a;
  }

  // ---------- 量測（把累計量分成時間區塊，求平均與統計誤差） ----------
  /**
   * 量測器：add(acc) 加入一段累計量（含 counts 與 masses 才能求溫度與方均根速率）。
   * stats(maxT) 用最近 maxT ps 的資料：
   *   P = ΣJ / Σ∫A dt；T = (2/3)·(∫E dt / ∫dt) / (N k)；
   *   統計誤差用「分批平均」：把區塊依序分成最多 10 批，SE = 各批的標準差 / √批數。
   */
  function Meter(blockLen) {
    this.blockLen = blockLen || 5;
    this.blocks = [];
    this.cur = null;
  }
  Meter.prototype.reset = function () { this.blocks = []; this.cur = null; };
  Meter.prototype.add = function (a, counts, masses) {
    if (!this.cur) this.cur = { t: 0, J: 0, Js: [], At: 0, Vt: 0, KEt: [], hits: 0, hitsPiston: 0, coll: 0, Q: 0, W: 0, counts: counts.slice(), masses: masses.slice() };
    const c = this.cur;
    c.t += a.t; c.J += a.J; c.At += a.At; c.Vt += a.Vt; c.hits += a.hits; c.hitsPiston += a.hitsPiston; c.coll += a.coll; c.Q += a.Q; c.W += a.W;
    for (let k = 0; k < a.Js.length; k++) { c.Js[k] = (c.Js[k] || 0) + a.Js[k]; c.KEt[k] = (c.KEt[k] || 0) + a.KEt[k]; }
    c.counts = counts.slice(); c.masses = masses.slice();
    if (c.t >= this.blockLen) { this.blocks.push(c); this.cur = null; if (this.blocks.length > 4000) this.blocks.shift(); }
  };
  /** 已完成區塊的總時間 */
  Meter.prototype.span = function () { let s = 0; this.blocks.forEach(function (b) { s += b.t; }); return s; };
  Meter.prototype.stats = function (maxT) {
    const bl = [];
    let span = 0;
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      if (maxT && span >= maxT) break;
      bl.unshift(this.blocks[i]);
      span += this.blocks[i].t;
    }
    if (!bl.length) return null;
    const ns = bl[bl.length - 1].counts.length;
    const sum = { t: 0, J: 0, Js: new Array(ns).fill(0), At: 0, Vt: 0, KEt: new Array(ns).fill(0), hits: 0, hitsPiston: 0, coll: 0, Q: 0, W: 0 };
    bl.forEach(function (b) {
      sum.t += b.t; sum.J += b.J; sum.At += b.At; sum.Vt += b.Vt; sum.hits += b.hits; sum.hitsPiston += b.hitsPiston; sum.coll += b.coll; sum.Q += b.Q; sum.W += b.W;
      for (let k = 0; k < ns; k++) { sum.Js[k] += b.Js[k] || 0; sum.KEt[k] += b.KEt[k] || 0; }
    });
    const counts = bl[bl.length - 1].counts, masses = bl[bl.length - 1].masses;
    let N = 0, E = 0;
    for (let k = 0; k < ns; k++) { N += counts[k]; E += sum.KEt[k]; }
    const out = {
      t: sum.t, blocks: bl.length,
      P: sum.J / sum.At,
      Ps: sum.Js.map(function (j) { return j / sum.At; }),
      V: sum.Vt / sum.t,
      T: N ? tempFromKE(E / sum.t / N) : 0,
      KE: sum.KEt.map(function (e, k) { return counts[k] ? e / sum.t / counts[k] : NaN; }),
      vrms: sum.KEt.map(function (e, k) { return counts[k] ? Math.sqrt(2 * e / sum.t / counts[k] / masses[k]) : NaN; }),
      Ts: sum.KEt.map(function (e, k) { return counts[k] ? tempFromKE(e / sum.t / counts[k]) : NaN; }),
      hitRate: sum.hits / sum.t, pistonRate: sum.hitsPiston / sum.t, collRate: sum.coll / sum.t,
      A: sum.At / sum.t,
      Q: sum.Q, W: sum.W,
      counts: counts.slice(), masses: masses.slice(), N: N
    };
    // 分批平均求統計誤差
    const nb = Math.min(10, bl.length);
    if (nb >= 3) {
      const per = bl.length / nb, Pb = [], Tb = [];
      for (let b = 0; b < nb; b++) {
        let J = 0, At = 0, Et = 0, t = 0;
        for (let i = Math.round(b * per); i < Math.round((b + 1) * per); i++) {
          J += bl[i].J; At += bl[i].At; t += bl[i].t;
          for (let k = 0; k < ns; k++) Et += bl[i].KEt[k] || 0;
        }
        Pb.push(J / At); Tb.push(N ? tempFromKE(Et / t / N) : 0);
      }
      out.Perr = sem(Pb);
      out.Terr = sem(Tb);
    } else { out.Perr = NaN; out.Terr = NaN; }
    return out;
  };
  function sem(a) {
    const n = a.length;
    let m = 0;
    a.forEach(function (x) { m += x; });
    m /= n;
    let s = 0;
    a.forEach(function (x) { s += (x - m) * (x - m); });
    return Math.sqrt(s / (n - 1) / n);
  }

  const api = {
    KB_SI: KB_SI, U_KG: U_KG, NA: NA, R: R_SI, KB: KB,
    E_UNIT: E_UNIT, P_UNIT: P_UNIT, V_UNIT: V_UNIT, VOL_UNIT: VOL_UNIT,
    SPECIES: SPECIES, WALL: WALL,
    kT: kT, vrms: vrms, vmean: vmean, vprob: vprob, maxwell: maxwell, meanKE: meanKE,
    idealP: idealP, idealV: idealV, tempFromKE: tempFromKE, adiabaticT: adiabaticT, adiabaticP: adiabaticP,
    wallFlux: wallFlux, hardSphereZ: hardSphereZ, moles: moles,
    toSI: toSI, fromSI: fromSI,
    makeRng: makeRng, gauss: gauss,
    collidePair: collidePair,
    createGas: createGas, addMolecules: addMolecules, setCounts: setCounts, sameSpeed: sameSpeed, thermalize: thermalize,
    countBySpecies: countBySpecies, kinetic: kinetic, temperature: temperature, momentum: momentum,
    volume: volume, wallArea: wallArea, maxSpeed: maxSpeed,
    advance: advance, takeAcc: takeAcc, newAcc: newAcc,
    Meter: Meter, sem: sem
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IdealGasCore = api;
})(typeof window !== 'undefined' ? window : this);
