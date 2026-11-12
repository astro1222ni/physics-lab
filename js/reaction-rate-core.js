/*
 * reaction-rate-core.js — 「反應速率與碰撞學說」的化學核心（與畫面無關，Node 可直接 require）
 *
 * 模型：立方容器裡的 A、B、C、D 四種氣體分子，都是直徑 D、莫耳質量 M 的硬球（完全彈性碰撞）。
 *   正反應  A + B → C + D：兩分子碰撞時，「沿連心線方向的相對動能」E = ½μg²（μ = M/2，g = 連心線方向的接近速率）
 *                           至少等於活化能 Ea 才反應（碰撞學說的「連心線模型」）。
 *   逆反應  C + D → A + B：門檻是逆反應的活化能 Ea − ΔH。
 *   反應熱 ΔH：預設由容器（恆溫槽）立刻吸收或供給，產物照彈性碰撞分開，氣體溫度不變（等溫反應器）；
 *              選「反應熱留在氣體裡」時，產物沿連心線分開的相對動能 = 碰撞時的 E − ΔH（放熱反應 ΔH < 0，產物分得更快、氣體變熱）。
 *              兩種情形的正、逆反應門檻都一樣，所以 K = e^(−ΔH/RT) 不變。
 *   方向因子（可選）：A（以及由 A 變成的 C）只有一端（半頂角 60° 的圓錐）能反應，碰撞點要落在那一端；
 *                     分子的方向隨熱運動轉動，所以這個條件成立的機率是 (1 − cos 60°)/2 = 1/4。
 *   催化劑：提供活化能較低的途徑；本模擬讓活化能高出 max(0, ΔH) 的部分變成原來的 40%，正、逆反應一起降低，ΔH 不變。
 *   器壁是恆溫槽（分子撞牆後，依器壁溫度重新抽一個速度），所以容器維持設定的溫度。
 *
 * 單位：長度 nm、時間 ps、質量 g/mol、能量 kJ/mol（每莫耳分子）。1 g/mol × (nm/ps)² = 1 kJ/mol，所以 E = ½Mv² 直接是 kJ/mol。
 * 容器容積 V = L³ 是「分子中心能到達的空間」（畫面上的器壁再往外畫半個分子直徑）。
 *
 * 精確的理論（測試中與模擬對照）：
 *   碰撞次數   Z_AB = k_coll [A][B]，k_coll = χ·f·πD²·⟨v_rel⟩，⟨v_rel⟩ = √(8RT/πμ)，
 *              χ = 稠密修正（Carnahan–Starling，體積分率 2% 時約 1.05），f = 器壁修正（容器很小，0.927）
 *   能量足夠的碰撞所占比例 = e^(−Ea/RT)（連心線模型在三維空間的精確結果）
 *   速率常數 k = p·χ·πD²·⟨v_rel⟩·e^(−Ea/RT)（p：方向因子），正是阿瑞尼斯的形式（指數前因子隨 √T 緩慢變大）
 *   平衡常數 K = k正/k逆 = e^(−ΔH/RT)（四種分子大小、質量相同，所以熵的變化是 0）
 */
(function (root) {
  'use strict';

  // ======================= 常數 =======================
  const R = 8.314462618e-3;    // 氣體常數 kJ/(mol·K)（CODATA 2018 起為定義值）
  const NA = 6.02214076e23;    // 亞佛加厥常數（定義值）
  const L = 12;                // nm：分子中心可到達的立方空間的邊長
  const V = L * L * L;         // nm³ = 1.728 × 10^-21 L
  const D = 0.6;               // nm：分子直徑
  const M = 40;                // g/mol：A、B、C、D 都一樣
  const MU = M / 2;            // 約化質量
  const INERTIA = 0.4 * M * (D / 2) * (D / 2); // 實心球的轉動慣量 g/mol·nm²（只決定方向轉動的快慢）
  const CAT = 0.4;             // 催化劑：活化能高出 max(0, ΔH) 的部分乘以 0.4
  const PATCH_DEG = 60;        // 方向因子：能反應的一端（圓錐的半頂角）
  const PATCH_COS = Math.cos(PATCH_DEG * Math.PI / 180);
  const NCELL = 10;            // 碰撞檢查的格子數（每邊 1.2 nm ≥ D）
  const DT = 0.04;             // ps：模擬的時間步長
  const A = 0, B = 1, C = 2, DD = 3; // 物種代碼（D 已用來表示直徑，所以產物 D 叫 DD）
  const HIST_DE = 0.5, HIST_N = 120; // 碰撞能量直方圖：每格 0.5 kJ/mol，0–60 kJ/mol

  // ======================= 數學工具 =======================
  /** 互補誤差函數（Numerical Recipes 的 erfcc，相對誤差 < 1.2 × 10^-7） */
  function erfc(x) {
    const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
      t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }
  /** 決定性的亂數（mulberry32） */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function gauss(r) {
    let u = 0;
    while (u <= 1e-300) u = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  }

  // ======================= 理論公式 =======================
  function RT(T) { return R * T; }
  /** 平均相對速率 ⟨v_rel⟩ = √(8RT/πμ)（nm/ps） */
  function meanRelSpeed(T) { return Math.sqrt(8 * R * T / (Math.PI * MU)); }
  /** 方均根速率 √(3RT/M)（nm/ps） */
  function rmsSpeed(T) { return Math.sqrt(3 * R * T / M); }
  /** 分子所占的體積分率 φ = N·πD³/6 ÷ V */
  function packing(N) { return (N || 0) * Math.PI * D * D * D / 6 / V; }
  /** 硬球流體在接觸距離的對分布函數（Carnahan–Starling）：碰撞頻率比稀薄氣體多出的倍數 */
  function contactFactor(phi) { return (1 - phi / 2) / Math.pow(1 - phi, 3); }
  /**
   * 器壁修正：分子中心限制在邊長 L 的立方體內，靠近器壁的分子有一側沒有碰撞對象。
   * 兩個均勻分布的點相距 D 的機會，比無限大空間少了 ⟨Π(1 − (D/L)|n_i|)⟩（n 為隨機方向的單位向量）
   * = 1 − (3/2)ε + (2/π)ε² − ε³/(4π)，ε = D/L。L = 12 nm、D = 0.6 nm 時為 0.927。
   */
  function wallFactor() { const e = D / L; return 1 - 1.5 * e + 2 / Math.PI * e * e - e * e * e / (4 * Math.PI); }
  /** 碰撞速率常數 k_coll（nm³/ps）：每 ps 的 A–B 碰撞次數 = k_coll × N_A × N_B ÷ V。Ntot：容器內分子總數（稠密修正用） */
  function collisionK(T, Ntot) { return Math.PI * D * D * meanRelSpeed(T) * contactFactor(packing(Ntot)) * wallFactor(); }
  /** 能量足夠（連心線方向的相對動能 ≥ Ea）的碰撞所占比例 */
  function fracAbove(Ea, T) { return Ea <= 0 ? 1 : Math.exp(-Ea / RT(T)); }
  /** 方向因子 p */
  function stericFactor(on) { return on ? (1 - PATCH_COS) / 2 : 1; }
  /** 實際走的活化能：有催化劑時，高出 max(0, ΔH) 的部分變成 40%（吸熱反應的活化能不可能小於 ΔH） */
  function effectiveEa(Ea, dH, cat) {
    const h = Math.max(0, dH || 0);
    const e = Math.max(Ea, h);
    return cat ? h + CAT * (e - h) : e;
  }
  /** 逆反應的活化能 = 正反應的活化能 − ΔH */
  function reverseEa(EaF, dH) { return Math.max(0, EaF - (dH || 0)); }
  /** 正反應速率常數（nm³/ps）。o：{ T, Ea, dH, cat, steric, Ntot } */
  function kForward(o) { return stericFactor(o.steric) * collisionK(o.T, o.Ntot) * fracAbove(effectiveEa(o.Ea, o.dH, o.cat), o.T); }
  function kReverse(o) {
    const EaF = effectiveEa(o.Ea, o.dH, o.cat);
    return stericFactor(o.steric) * collisionK(o.T, o.Ntot) * fracAbove(reverseEa(EaF, o.dH), o.T);
  }
  /** 平衡常數 K = [C][D]/([A][B]) = e^(−ΔH/RT) */
  function Keq(dH, T) { return Math.exp(-(dH || 0) / RT(T)); }
  /** nm³/ps（每個分子）→ L/(mol·s) */
  function toLmolS(kc) { return kc * NA * 1e-24 * 1e12; }
  /** 分子數 → 濃度 mol/L（容器容積 V nm³ = V × 10^-24 L） */
  function molarity(n) { return n / (NA * V * 1e-24); }
  /** 由「分子數／ps」換成 mol/(L·s) */
  function rateToMs(perPs) { return molarity(perPs) * 1e12; }

  /** 三維馬克士威–波茲曼分布：一個分子的動能 E 的機率密度（每 kJ/mol） */
  function keDensity(E, T) {
    if (E <= 0) return 0;
    const kt = RT(T);
    return 2 * Math.sqrt(E / Math.PI) * Math.pow(kt, -1.5) * Math.exp(-E / kt);
  }
  /** 動能 ≥ Ea 的分子所占比例 = Q(3/2, Ea/RT) = erfc(√x) + 2√(x/π)·e^(−x) */
  function keFracAbove(Ea, T) {
    if (Ea <= 0) return 1;
    const x = Ea / RT(T);
    return erfc(Math.sqrt(x)) + 2 * Math.sqrt(x / Math.PI) * Math.exp(-x);
  }
  /** 碰撞時沿連心線的相對動能的分布（每次碰撞，每 kJ/mol）：指數分布 e^(−E/RT)/RT */
  function collisionEnergyDensity(E, T) { return E < 0 ? 0 : Math.exp(-E / RT(T)) / RT(T); }

  /**
   * 加權最小平方法擬合直線 y = a + b x。pts：[{ x, y, w }]（w 預設 1）。
   * 傳回 { a, b, r2, se（斜率的標準誤，假設 w = 1/σ²）, n }。
   */
  function fitLine(pts) {
    let W = 0, X = 0, Y = 0;
    pts.forEach(function (p) { const w = p.w == null ? 1 : p.w; W += w; X += w * p.x; Y += w * p.y; });
    if (pts.length < 2 || !(W > 0)) return null;
    const xm = X / W, ym = Y / W;
    let sxx = 0, sxy = 0, syy = 0;
    pts.forEach(function (p) {
      const w = p.w == null ? 1 : p.w;
      sxx += w * (p.x - xm) * (p.x - xm); sxy += w * (p.x - xm) * (p.y - ym); syy += w * (p.y - ym) * (p.y - ym);
    });
    if (!(sxx > 0)) return null;
    const b = sxy / sxx;
    return { a: ym - b * xm, b: b, r2: syy > 0 ? sxy * sxy / (sxx * syy) : 1, se: 1 / Math.sqrt(sxx), n: pts.length };
  }
  /**
   * 阿瑞尼斯圖：ln k 對 1/T。rows：[{ T, k（任何單位）, n（反應次數，當權重：ln k 的變異數約 1/n） }]
   * 傳回 { slope, intercept, r2, Ea（kJ/mol）= −斜率 × R, EaErr, n }
   */
  function arrhenius(rows) {
    const pts = rows.filter(function (r) { return r.k > 0 && r.T > 0; })
      .map(function (r) { return { x: 1 / r.T, y: Math.log(r.k), w: r.n > 0 ? r.n : 1 }; });
    const f = fitLine(pts);
    if (!f) return null;
    return { slope: f.b, intercept: f.a, r2: f.r2, Ea: -f.b * R, EaErr: f.se * R, n: f.n };
  }
  /**
   * 完美量測時阿瑞尼斯圖會得到的活化能：理論 ln k = 常數 + ½ ln T − E0/RT，在同樣的溫度、同樣的權重下擬合。
   * （指數前因子 ∝ √T，所以圖上的活化能比門檻能量 E0 大約 ½RT。）
   */
  function apparentEa(E0, rows) {
    const f = fitLine(rows.map(function (r) { return { x: 1 / r.T, y: 0.5 * Math.log(r.T) - E0 / RT(r.T), w: r.n > 0 ? r.n : 1 }; }));
    return f ? -f.b * R : E0;
  }
  /** 未知反應：活化能 8.0–20.0 kJ/mol（取到 0.1） */
  function mysteryEa(r) { r = r || Math.random; return Math.round(80 + r() * 120) / 10; }

  // ======================= 碰撞的解法 =======================
  /**
   * 兩個等質量硬球在接觸時的速度變化。v1、v2：[vx, vy, vz]；n：由 1 指向 2 的單位向量；
   * g = (v1 − v2)·n > 0（接近速率）；gOut：分開後沿連心線的相對速率（彈性碰撞 gOut = g）。
   * 動量守恆：質心速度不變；沿連心線的相對速度由 +g 變成 −gOut。直接修改 v1、v2。
   */
  function resolve(v1, v2, n, g, gOut) {
    const s = 0.5 * (g + gOut);
    for (let k = 0; k < 3; k++) { v1[k] -= s * n[k]; v2[k] += s * n[k]; }
  }

  // ======================= 模擬 =======================
  /**
   * 建立模擬。o：{ T, Ea, dH, cat, steric, nA, nB, seed, react（預設 true；false 只碰撞不反應，測試用）,
   *              heat（'bath' 反應熱由恆溫槽吸收，預設；'gas' 反應熱留在氣體裡）,
   *              walls（'thermal' 恆溫器壁，預設；'specular' 鏡面反射、能量守恆，測試用） }
   */
  function createSim(o) {
    const nA = Math.max(0, Math.round(o.nA || 0)), nB = Math.max(0, Math.round(o.nB || 0));
    const N = nA + nB;
    const s = {
      N: N, T: +o.T, Ea: +o.Ea, dH: +(o.dH || 0), cat: !!o.cat, steric: !!o.steric,
      react: o.react !== false, walls: o.walls || 'thermal', heatGas: o.heat === 'gas',
      x: new Float64Array(N), y: new Float64Array(N), z: new Float64Array(N),
      vx: new Float64Array(N), vy: new Float64Array(N), vz: new Float64Array(N),
      ux: new Float64Array(N), uy: new Float64Array(N), uz: new Float64Array(N),   // 方向（A、C 的「可反應端」）
      wx: new Float64Array(N), wy: new Float64Array(N), wz: new Float64Array(N),   // 轉動的角速度 rad/ps
      sp: new Uint8Array(N), count: [nA, nB, 0, 0], n0: [nA, nB, 0, 0],
      r: rng(o.seed == null ? (Math.random() * 4294967296) >>> 0 : o.seed),
      t: 0, ev: [], keepEvents: false,
      head: new Int32Array(NCELL * NCELL * NCELL), next: new Int32Array(N),
      stats: null, series: [], recDt: 1, nextRec: 0
    };
    s.EaF = effectiveEa(s.Ea, s.dH, s.cat);
    s.EaR = reverseEa(s.EaF, s.dH);
    const r = s.r;
    // 隨機放置（不重疊）
    for (let i = 0; i < N; i++) {
      s.sp[i] = i < nA ? A : B;
      let ok = false, tries = 0;
      while (!ok && tries++ < 5000) {
        s.x[i] = r() * L; s.y[i] = r() * L; s.z[i] = r() * L;
        ok = true;
        for (let j = 0; j < i; j++) {
          const dx = s.x[i] - s.x[j], dy = s.y[i] - s.y[j], dz = s.z[i] - s.z[j];
          if (dx * dx + dy * dy + dz * dz < D * D * 1.05) { ok = false; break; }
        }
      }
      thermalVelocity(s, i);
      randomDir(s, i);
      thermalSpin(s, i);
    }
    resetStats(s);
    return s;
  }
  function thermalVelocity(s, i) {
    const sg = Math.sqrt(RT(s.T) / M), r = s.r;
    s.vx[i] = sg * gauss(r); s.vy[i] = sg * gauss(r); s.vz[i] = sg * gauss(r);
  }
  function thermalSpin(s, i) {
    const sg = Math.sqrt(RT(s.T) / INERTIA), r = s.r;
    s.wx[i] = sg * gauss(r); s.wy[i] = sg * gauss(r); s.wz[i] = sg * gauss(r);
  }
  function randomDir(s, i) {
    const r = s.r, zz = 2 * r() - 1, ph = 2 * Math.PI * r(), q = Math.sqrt(1 - zz * zz);
    s.ux[i] = q * Math.cos(ph); s.uy[i] = q * Math.sin(ph); s.uz[i] = zz;
  }
  /** 清除統計（開始一次新的量測） */
  function resetStats(s) {
    s.t = 0;
    s.n0 = s.count.slice();
    s.stats = {
      collAB: 0, enoughAB: 0, fwd: 0, collCD: 0, enoughCD: 0, rev: 0, collAll: 0, wall: 0,
      intAB: 0, intCD: 0, hist: new Float64Array(HIST_N), histOver: 0,
      t10: null, fwd10: 0, intAB10: 0, tHalf: null
    };
    s.series = [{ t: 0, a: s.count[A], b: s.count[B], c: s.count[C], d: s.count[DD] }];
    s.recDt = 1; s.nextRec = s.recDt;
  }
  /** 撞牆：恆溫器壁依溫度重新抽速度（向內的分量依「通量」分布），鏡面反射則只把那個分量反向 */
  function wall(s, i, axis, side) {
    const st = s.stats;
    st.wall++;
    const P = axis === 0 ? s.x : axis === 1 ? s.y : s.z;
    P[i] = side < 0 ? -P[i] : 2 * L - P[i];
    if (P[i] < 0) P[i] = 0; else if (P[i] > L) P[i] = L;
    const Vn = axis === 0 ? s.vx : axis === 1 ? s.vy : s.vz;
    if (s.walls === 'specular') { Vn[i] = side < 0 ? Math.abs(Vn[i]) : -Math.abs(Vn[i]); return; }
    const sg = Math.sqrt(RT(s.T) / M), r = s.r;
    let u = 0; while (u <= 1e-300) u = r();
    const vn = sg * Math.sqrt(-2 * Math.log(u));
    s.vx[i] = sg * gauss(r); s.vy[i] = sg * gauss(r); s.vz[i] = sg * gauss(r);
    Vn[i] = side < 0 ? vn : -vn;
    thermalSpin(s, i);
  }
  function rotate(s, i, dt) {
    const wx = s.wx[i], wy = s.wy[i], wz = s.wz[i];
    const w = Math.sqrt(wx * wx + wy * wy + wz * wz);
    if (w < 1e-12) return;
    const a = w * dt, kx = wx / w, ky = wy / w, kz = wz / w, c = Math.cos(a), sn = Math.sin(a);
    const ux = s.ux[i], uy = s.uy[i], uz = s.uz[i];
    const kd = kx * ux + ky * uy + kz * uz;
    // 羅德里格斯旋轉公式
    let nx = ux * c + (ky * uz - kz * uy) * sn + kx * kd * (1 - c);
    let ny = uy * c + (kz * ux - kx * uz) * sn + ky * kd * (1 - c);
    let nz = uz * c + (kx * uy - ky * ux) * sn + kz * kd * (1 - c);
    const m = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    s.ux[i] = nx / m; s.uy[i] = ny / m; s.uz[i] = nz / m;
  }
  const _v1 = [0, 0, 0], _v2 = [0, 0, 0], _n = [0, 0, 0];
  /** 處理一對已經重疊、正在接近的分子：倒回到剛接觸的時刻，判定是否反應，算出碰撞後的速度，再走回現在 */
  function collidePair(s, i, j) {
    const dx = s.x[j] - s.x[i], dy = s.y[j] - s.y[i], dz = s.z[j] - s.z[i];
    const dvx = s.vx[j] - s.vx[i], dvy = s.vy[j] - s.vy[i], dvz = s.vz[j] - s.vz[i];
    const bv = dx * dvx + dy * dvy + dz * dvz;
    if (bv >= 0) return;                         // 已經在分開
    const d2 = dx * dx + dy * dy + dz * dz, v2 = dvx * dvx + dvy * dvy + dvz * dvz;
    let tau = (bv + Math.sqrt(Math.max(0, bv * bv + v2 * (D * D - d2)))) / v2; // 剛接觸是 tau ps 之前
    if (!(tau >= 0) || tau > 4 * DT) tau = 0;
    // 接觸時的位置與連心線方向
    const cx = dx - dvx * tau, cy = dy - dvy * tau, cz = dz - dvz * tau;
    const cl = Math.sqrt(cx * cx + cy * cy + cz * cz) || D;
    _n[0] = cx / cl; _n[1] = cy / cl; _n[2] = cz / cl;
    const g = -(dvx * _n[0] + dvy * _n[1] + dvz * _n[2]);  // i 相對 j 沿連心線的接近速率
    if (!(g > 0)) return;
    const E = M * g * g / 4;                     // 沿連心線的相對動能 ½μg²（kJ/mol）
    const si = s.sp[i], sj = s.sp[j], st = s.stats;
    st.collAll++;
    let gOut = g, kind = 0;                      // 0 一般碰撞、1 能量夠但方向不對、2 正反應、3 逆反應
    const fwdPair = (si === A && sj === B) || (si === B && sj === A);
    const revPair = (si === C && sj === DD) || (si === DD && sj === C);
    if (fwdPair || revPair) {
      // 有方向的分子（A 或 C）與它的「可反應端」是否朝著對方
      const oi = (si === A || si === C) ? i : j, sign = oi === i ? 1 : -1;
      const facing = !s.steric || sign * (s.ux[oi] * _n[0] + s.uy[oi] * _n[1] + s.uz[oi] * _n[2]) >= PATCH_COS;
      if (fwdPair) {
        st.collAB++;
        const bin = Math.floor(E / HIST_DE);
        if (bin < HIST_N) st.hist[bin]++; else st.histOver++;
        if (E >= s.EaF) {
          st.enoughAB++;
          kind = 1;
          if (s.react && facing) {
            kind = 2;
            if (s.heatGas) gOut = Math.sqrt(Math.max(0, g * g - 4 * s.dH / M));
            st.fwd++;
            s.count[A]--; s.count[B]--; s.count[C]++; s.count[DD]++;
            if (si === A) { s.sp[i] = C; s.sp[j] = DD; } else { s.sp[i] = DD; s.sp[j] = C; }
          }
        }
      } else {
        st.collCD++;
        if (E >= s.EaR) {
          st.enoughCD++;
          kind = 1;
          if (s.react && facing) {
            kind = 3;
            if (s.heatGas) gOut = Math.sqrt(Math.max(0, g * g + 4 * s.dH / M));
            st.rev++;
            s.count[C]--; s.count[DD]--; s.count[A]++; s.count[B]++;
            if (si === C) { s.sp[i] = A; s.sp[j] = B; } else { s.sp[i] = B; s.sp[j] = A; }
          }
        }
      }
    }
    _v1[0] = s.vx[i]; _v1[1] = s.vy[i]; _v1[2] = s.vz[i];
    _v2[0] = s.vx[j]; _v2[1] = s.vy[j]; _v2[2] = s.vz[j];
    resolve(_v1, _v2, _n, g, gOut);
    // 回到接觸點，再以新速度走 tau
    s.x[i] += (_v1[0] - s.vx[i]) * tau; s.y[i] += (_v1[1] - s.vy[i]) * tau; s.z[i] += (_v1[2] - s.vz[i]) * tau;
    s.x[j] += (_v2[0] - s.vx[j]) * tau; s.y[j] += (_v2[1] - s.vy[j]) * tau; s.z[j] += (_v2[2] - s.vz[j]) * tau;
    s.vx[i] = _v1[0]; s.vy[i] = _v1[1]; s.vz[i] = _v1[2];
    s.vx[j] = _v2[0]; s.vy[j] = _v2[1]; s.vz[j] = _v2[2];
    if (s.keepEvents && (fwdPair || revPair) && s.ev.length < 400) {
      s.ev.push({ kind: kind, ab: fwdPair, E: E, x: s.x[i] + _n[0] * D / 2, y: s.y[i] + _n[1] * D / 2, z: s.z[i] + _n[2] * D / 2, t: s.t, i: i, j: j });
    }
  }
  function cellOf(v) { let c = Math.floor(v / L * NCELL); return c < 0 ? 0 : c >= NCELL ? NCELL - 1 : c; }
  /** 前進一步（dt ps，預設 DT） */
  function step(s, dt) {
    dt = dt || DT;
    const N = s.N, st = s.stats;
    // 積分 ∫[A][B] dt 用的分子數乘積（以這一步開始時的數目計；一步之內的反應次數很少，誤差可忽略）
    st.intAB += s.count[A] * s.count[B] * dt;
    st.intCD += s.count[C] * s.count[DD] * dt;
    for (let i = 0; i < N; i++) {
      s.x[i] += s.vx[i] * dt; s.y[i] += s.vy[i] * dt; s.z[i] += s.vz[i] * dt;
      if (s.x[i] < 0) wall(s, i, 0, -1); else if (s.x[i] > L) wall(s, i, 0, 1);
      if (s.y[i] < 0) wall(s, i, 1, -1); else if (s.y[i] > L) wall(s, i, 1, 1);
      if (s.z[i] < 0) wall(s, i, 2, -1); else if (s.z[i] > L) wall(s, i, 2, 1);
      if (s.sp[i] === A || s.sp[i] === C) rotate(s, i, dt);
    }
    s.t += dt;
    // 格子清單
    const head = s.head, next = s.next, NC = NCELL;
    head.fill(-1);
    for (let i = 0; i < N; i++) {
      const c = (cellOf(s.x[i]) * NC + cellOf(s.y[i])) * NC + cellOf(s.z[i]);
      next[i] = head[c]; head[c] = i;
    }
    const D2 = D * D;
    for (let cx = 0; cx < NC; cx++) for (let cy = 0; cy < NC; cy++) for (let cz = 0; cz < NC; cz++) {
      const c0 = (cx * NC + cy) * NC + cz;
      if (head[c0] < 0) continue;
      for (let ox = 0; ox <= 1; ox++) for (let oy = (ox ? -1 : 0); oy <= 1; oy++) for (let oz = (ox || oy ? -1 : 0); oz <= 1; oz++) {
        const nx = cx + ox, ny = cy + oy, nz = cz + oz;
        if (nx >= NC || ny < 0 || ny >= NC || nz < 0 || nz >= NC) continue;
        const c1 = (nx * NC + ny) * NC + nz;
        for (let i = head[c0]; i >= 0; i = next[i]) {
          for (let j = (c1 === c0 ? next[i] : head[c1]); j >= 0; j = next[j]) {
            const dx = s.x[j] - s.x[i], dy = s.y[j] - s.y[i], dz = s.z[j] - s.z[i];
            if (dx * dx + dy * dy + dz * dz < D2) collidePair(s, i, j);
          }
        }
      }
    }
    // 統計：轉化 10% 的時刻（初速率）、轉化一半的時刻（半生期）
    const lim = Math.min(s.n0[A], s.n0[B]);
    const net = st.fwd - st.rev;
    if (lim > 0) {
      if (st.t10 == null && net >= Math.max(1, Math.ceil(lim * 0.1))) { st.t10 = s.t; st.fwd10 = st.fwd; st.intAB10 = st.intAB; }
      if (st.tHalf == null && net * 2 >= lim) st.tHalf = s.t;
    }
    if (s.t >= s.nextRec) {
      s.series.push({ t: s.t, a: s.count[A], b: s.count[B], c: s.count[C], d: s.count[DD] });
      s.nextRec += s.recDt;
      if (s.series.length > 3000) {          // 太長就每兩點留一點，記錄間隔加倍
        s.series = s.series.filter(function (p, k) { return k % 2 === 0; });
        s.recDt *= 2;
        s.nextRec = s.series[s.series.length - 1].t + s.recDt;
      }
    }
  }
  /** 前進 total ps（分成 DT 的小步） */
  function advance(s, total) {
    let left = total;
    while (left > 1e-9) { const d = Math.min(DT, left); step(s, d); left -= d; }
  }
  /** 容器內氣體的動力學溫度 T = M⟨v²⟩/(3R) */
  function kineticTemp(s) {
    let sum = 0;
    for (let i = 0; i < s.N; i++) sum += s.vx[i] * s.vx[i] + s.vy[i] * s.vy[i] + s.vz[i] * s.vz[i];
    return s.N ? M * sum / s.N / (3 * R) : s.T;
  }
  /** 分子的總動能（kJ/mol 單位的加總） */
  function totalKE(s) {
    let sum = 0;
    for (let i = 0; i < s.N; i++) sum += 0.5 * M * (s.vx[i] * s.vx[i] + s.vy[i] * s.vy[i] + s.vz[i] * s.vz[i]);
    return sum;
  }
  /**
   * 這一次量測的結果（由模擬的計數算出）：
   *   kF = 正反應次數 × V ÷ ∫N_A N_B dt（最大概似估計；相對誤差 ≈ 1/√次數）
   *   rate0 = 初速率（從開始到轉化 10% 的平均反應速率，mol/(L·s)）
   */
  function measure(s) {
    const st = s.stats;
    const kF = st.intAB > 0 ? st.fwd * V / st.intAB : 0;
    const kR = st.intCD > 0 ? st.rev * V / st.intCD : 0;
    const zAB = st.intAB > 0 ? st.collAB * V / st.intAB : 0;
    let rate0 = null, rate0n = 0;
    if (st.t10 != null) { rate0 = rateToMs(st.fwd10 / st.t10); rate0n = st.fwd10; }
    else if (s.t > 0 && st.fwd > 0) { rate0 = rateToMs(st.fwd / s.t); rate0n = st.fwd; }
    return {
      t: s.t, kF: kF, kR: kR, kF_SI: toLmolS(kF), kR_SI: toLmolS(kR), relErrF: st.fwd > 0 ? 1 / Math.sqrt(st.fwd) : Infinity,
      zAB: zAB, fracObs: st.collAB > 0 ? st.enoughAB / st.collAB : null, effObs: st.collAB > 0 ? st.fwd / st.collAB : null,
      rate0: rate0, rate0n: rate0n, tHalf: st.tHalf, fwd: st.fwd, rev: st.rev, collAB: st.collAB, enoughAB: st.enoughAB
    };
  }
  /** 這組設定的理論值 */
  function theory(o) {
    const EaF = effectiveEa(o.Ea, o.dH, o.cat);
    const Ntot = o.Ntot != null ? o.Ntot : (o.nA || 0) + (o.nB || 0);
    const q = { T: o.T, Ea: o.Ea, dH: o.dH, cat: o.cat, steric: o.steric, Ntot: Ntot };
    return {
      EaF: EaF, EaR: reverseEa(EaF, o.dH), kColl: collisionK(o.T, Ntot), frac: fracAbove(EaF, o.T), p: stericFactor(o.steric),
      kF: kForward(q), kR: kReverse(q), kF_SI: toLmolS(kForward(q)), K: Keq(o.dH, o.T)
    };
  }

  const api = {
    R: R, NA: NA, L: L, V: V, D: D, M: M, MU: MU, CAT: CAT, PATCH_DEG: PATCH_DEG, PATCH_COS: PATCH_COS, DT: DT,
    A: A, B: B, C: C, DD: DD, HIST_DE: HIST_DE, HIST_N: HIST_N,
    erfc: erfc, rng: rng, gauss: gauss, RT: RT, meanRelSpeed: meanRelSpeed, rmsSpeed: rmsSpeed, packing: packing,
    contactFactor: contactFactor, wallFactor: wallFactor, collisionK: collisionK, fracAbove: fracAbove, stericFactor: stericFactor,
    effectiveEa: effectiveEa, reverseEa: reverseEa, kForward: kForward, kReverse: kReverse, Keq: Keq,
    toLmolS: toLmolS, molarity: molarity, rateToMs: rateToMs, keDensity: keDensity, keFracAbove: keFracAbove,
    collisionEnergyDensity: collisionEnergyDensity, fitLine: fitLine, arrhenius: arrhenius, apparentEa: apparentEa,
    mysteryEa: mysteryEa, resolve: resolve, createSim: createSim, resetStats: resetStats, step: step, advance: advance,
    kineticTemp: kineticTemp, totalKE: totalKE, measure: measure, theory: theory
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RateCore = api;
})(typeof window !== 'undefined' ? window : this);
