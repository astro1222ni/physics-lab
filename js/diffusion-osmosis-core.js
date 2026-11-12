/*
 * diffusion-osmosis-core.js — 「擴散與滲透」的物理核心（與畫面無關，可單獨用 Node 測試）
 *
 * 內容：
 *   1. 擴散（布朗運動）：每個溶質粒子在三維盒子裡做隨機漫步，每一步在 x、y、z 各加一個常態分布的位移，
 *        標準差 √(2DΔt)。器壁是反射的：位置 = 把「沒有器壁時的累計位移」折回盒子裡（fold），
 *        所以粒子數永遠守恆，而均方位移用沒有折回的累計位移算，⟨Δx²⟩ 的期望值正好是 2Dt。
 *        擴散係數用斯托克斯–愛因斯坦關係 D = k_B T ／ (6πηr)，水的黏度 η 隨溫度變化（Vogel 式）。
 *        理論濃度剖面：一開始粒子均勻分布在隔板左邊 0 ≤ x ≤ a，兩端是反射壁，
 *        c(x,t) = N/L + Σ (2N/(a nπ)) sin(nπa/L) cos(nπx/L) exp(−n²π²Θ/L²)，Θ = ∫D dt（D 中途改變也成立）。
 *   2. 滲透（U 形管滲透計）：中間的半透膜只讓水通過。水的淨流量正比於「滲透壓差 − 靜水壓差 − 活塞壓力」：
 *        dx/dt = Lp [ RT(i_R C_R − i_L C_L) − ρg(2x) − P ]，x 是右管液面上升的高度（左管下降同樣多），
 *        液面差 h = 2x。流進的水會稀釋溶液：C = 溶質量 ÷ 溶液體積。平衡時 ρgh + P = Δπ（凡特荷夫 π = iCRT）。
 *   3. 細胞與溶液：同一套滲透模型推動細胞體積 V 的變化：
 *        dV/dt = k [ π_in − π_out − P ]，π_in = RT·n ／ (V − V_b)（V_b 是不參與滲透的體積：蛋白質、膜等）。
 *        紅血球沒有細胞壁（P = 0）：平衡體積 V = V_b + n／C_out（Boyle–van’t Hoff），
 *        膨脹到球形（表面積不能再增加）就破裂（溶血）；植物細胞有細胞壁：原生質體大於細胞壁內容積時，
 *        細胞壁被撐開產生膨壓 P = ε (V − V_w)／V_w；原生質體小於 V_w 時與細胞壁分開（質壁分離）。
 *
 * 單位：擴散的長度 μm、時間 s、D 用 μm²/s（diffusionCoef 傳回 m²/s）；
 *       滲透的長度 m、壓力 Pa、濃度 mmol/L（＝ mol/m³）、時間 s；細胞的體積 fL（紅血球）或 V/V_w（植物細胞）、壓力 kPa。
 *
 * 常數與資料來源：
 *   R = 8.314 462 618 J/(mol·K)、k_B = 1.380 649×10^-23 J/K（SI 2019 定義值）、g = 9.806 65 m/s²（標準重力）
 *   水的黏度：Vogel 式 η = 2.414×10^-5 × 10^(247.8 K ／ (T − 140 K)) Pa·s（0–100 °C 誤差約 2%）
 *   水的密度：Tanaka et al., Metrologia 38, 301 (2001)
 *   紅血球：平均體積 90 fL、表面積 136 μm²；不參與滲透的體積約 40%；細胞內滲透濃度約 300 mOsm/L
 *   分子的斯托克斯半徑：葡萄糖 0.38 nm、蔗糖 0.47 nm、血紅素 3.1 nm（約略值）
 * （網頁上的上標一律用 <sup> 或在畫布上自己畫。）
 */
(function (root) {
  'use strict';

  // ===================================================================
  // 常數
  // ===================================================================
  const R = 8.314462618;          // J/(mol·K)
  const KB = 1.380649e-23;        // J/K
  const G = 9.80665;              // m/s²
  const K0 = 273.15;
  const TAU = Math.PI * 2;

  /** 溶質：i 為理想的凡特荷夫因子（完全解離），M 為莫耳質量（g/mol），rNm 為斯托克斯半徑（nm，約略值） */
  const SOLUTES = {
    glucose: { i: 1, M: 180.156, rNm: 0.38, zh: '葡萄糖', en: 'glucose', f: 'C6H12O6' },
    sucrose: { i: 1, M: 342.297, rNm: 0.47, zh: '蔗糖', en: 'sucrose', f: 'C12H22O11' },
    nacl: { i: 2, M: 58.443, rNm: null, zh: '食鹽（氯化鈉）', en: 'salt (NaCl)', f: 'NaCl' },
    cacl2: { i: 3, M: 110.98, rNm: null, zh: '氯化鈣', en: 'calcium chloride', f: 'CaCl2' }
  };

  /** 水的黏度（Pa·s），Vogel 式 */
  function waterViscosity(Tc) { return 2.414e-5 * Math.pow(10, 247.8 / (Tc + K0 - 140)); }
  /** 水的密度（kg/m³），Tanaka et al. 2001（0–40 °C 誤差小於 0.001 kg/m³） */
  function waterDensity(Tc) {
    const a1 = -3.983035, a2 = 301.797, a3 = 522528.9, a4 = 69.34881, a5 = 999.974950;
    return a5 * (1 - (Tc + a1) * (Tc + a1) * (Tc + a2) / (a3 * (Tc + a4)));
  }
  /** 斯托克斯–愛因斯坦：D = k_B T／(6πηr)（m²/s）；rNm 為粒子半徑（nm） */
  function diffusionCoef(Tc, rNm) { return KB * (Tc + K0) / (6 * Math.PI * waterViscosity(Tc) * rNm * 1e-9); }
  /** 同上，單位 μm²/s */
  function diffusionUm2(Tc, rNm) { return diffusionCoef(Tc, rNm) * 1e12; }

  // ===================================================================
  // 亂數（可設定種子，讓測試可重現）
  // ===================================================================
  /** mulberry32：傳回 [0, 1) 的均勻亂數產生器 */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** Box–Muller：由均勻亂數做出標準常態分布亂數（一次產生兩個，留一個下次用） */
  function makeGauss(rand) {
    let spare = null;
    return function () {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let u = 0;
      while (u <= 1e-300) u = rand();
      const v = rand();
      const m = Math.sqrt(-2 * Math.log(u));
      spare = m * Math.sin(TAU * v);
      return m * Math.cos(TAU * v);
    };
  }

  // ===================================================================
  // 擴散：三維反射壁盒子裡的隨機漫步
  // ===================================================================
  /** 反射壁：把沒有器壁時的座標 u 折回 [0, L]（鏡射：碰壁的那一步等於從牆面反彈） */
  function fold(u, L) {
    let m = u % (2 * L);
    if (m < 0) m += 2 * L;
    return m <= L ? m : 2 * L - m;
  }
  const BOX = { Lx: 200, Ly: 80, Lz: 40, a: 100, N: 600 };   // μm；預設隔板在正中間

  /**
   * 建立粒子雲：N 個粒子均勻分布在隔板左邊 [0, a] × [0, Ly] × [0, Lz]。
   * u：沒有器壁時的累計位置（Float64Array，x0 y0 z0 x1 …），u0：拿掉隔板那一刻的 u（量位移的起點）。
   */
  function createCloud(opt, rand) {
    opt = opt || {};
    const N = opt.N || BOX.N;
    const c = {
      N: N, Lx: opt.Lx || BOX.Lx, Ly: opt.Ly || BOX.Ly, Lz: opt.Lz || BOX.Lz, a: opt.a || BOX.a,
      u: new Float64Array(3 * N), u0: new Float64Array(3 * N), seen: new Uint8Array(N),
      partition: true, t: 0, theta: 0, steps: 0, gauss: makeGauss(rand)
    };
    scatterLeft(c, rand);
    return c;
  }
  /** 重新把粒子均勻撒在隔板左邊，放回隔板 */
  function scatterLeft(c, rand) {
    for (let i = 0; i < c.N; i++) {
      c.u[3 * i] = rand() * c.a;
      c.u[3 * i + 1] = rand() * c.Ly;
      c.u[3 * i + 2] = rand() * c.Lz;
    }
    c.partition = true; c.t = 0; c.theta = 0; c.steps = 0;
    c.u0.set(c.u);
    c.seen.fill(0);
  }
  /** 某粒子目前的位置（折回盒子裡；有隔板時 x 只在 [0, a]） */
  function posOf(c, i, out) {
    out = out || [0, 0, 0];
    out[0] = fold(c.u[3 * i], c.partition ? c.a : c.Lx);
    out[1] = fold(c.u[3 * i + 1], c.Ly);
    out[2] = fold(c.u[3 * i + 2], c.Lz);
    return out;
  }
  function xOf(c, i) { return fold(c.u[3 * i], c.partition ? c.a : c.Lx); }
  /** 拿掉隔板：從這一刻開始量時間與位移 */
  function removePartition(c) {
    for (let i = 0; i < c.N; i++) {
      c.u[3 * i] = fold(c.u[3 * i], c.a);
      c.u[3 * i + 1] = fold(c.u[3 * i + 1], c.Ly);
      c.u[3 * i + 2] = fold(c.u[3 * i + 2], c.Lz);
    }
    c.u0.set(c.u);
    c.partition = false; c.t = 0; c.theta = 0; c.steps = 0;
    for (let i = 0; i < c.N; i++) c.seen[i] = c.u[3 * i] > c.Lx / 2 ? 1 : 0;
  }
  /**
   * 前進 dt（s）：每個座標加 √(2DΔt)·常態亂數（D 用 μm²/s）。
   * 布朗運動的步伐可以任意切分（常態分布相加仍是常態），所以一步走 dt 與分成很多小步，統計上完全相同。
   */
  function stepCloud(c, D, dt) {
    if (!(dt > 0) || !(D > 0)) return;
    const s = Math.sqrt(2 * D * dt), g = c.gauss, u = c.u, n3 = 3 * c.N;
    for (let k = 0; k < n3; k++) u[k] += s * g();
    if (!c.partition) {
      c.t += dt; c.theta += D * dt; c.steps++;
      const half = c.Lx / 2;
      for (let i = 0; i < c.N; i++) if (!c.seen[i] && fold(u[3 * i], c.Lx) > half) c.seen[i] = 1;
    }
  }
  /** 統計：左右半邊的粒子數、x 方向與三維的均方位移、走過右半邊的粒子數 */
  function cloudStats(c) {
    let nR = 0, sx = 0, s3 = 0, seen = 0;
    const half = c.Lx / 2;
    for (let i = 0; i < c.N; i++) {
      const k = 3 * i;
      if (xOf(c, i) > half) nR++;
      const dx = c.u[k] - c.u0[k], dy = c.u[k + 1] - c.u0[k + 1], dz = c.u[k + 2] - c.u0[k + 2];
      sx += dx * dx; s3 += dx * dx + dy * dy + dz * dz;
      seen += c.seen[i];
    }
    return { N: c.N, nL: c.N - nR, nR: nR, fracR: nR / c.N, msdX: sx / c.N, msd3: s3 / c.N, seen: seen, allSeen: seen === c.N };
  }
  /** x 方向的粒子數直方圖（bins 格，涵蓋整個盒子） */
  function histogram(c, bins) {
    const h = new Array(bins).fill(0), w = c.Lx / bins;
    for (let i = 0; i < c.N; i++) h[Math.min(bins - 1, Math.floor(xOf(c, i) / w))]++;
    return h;
  }
  /**
   * 理論：一開始 N 個粒子均勻分布在 [0, a]，兩端反射壁，經過 Θ = ∫D dt 之後，[x1, x2] 裡粒子數的期望值。
   * 用餘弦級數（反射壁的本徵函數）；Θ = 0 時直接用起始的階梯分布。
   */
  function expectedBetween(N, a, L, theta, x1, x2) {
    if (!(theta > 0)) return N * Math.max(0, Math.min(x2, a) - Math.max(x1, 0)) / a;
    let s = N * (x2 - x1) / L;
    const k = Math.PI * Math.PI * theta / (L * L);
    const nmax = Math.min(4000, Math.ceil(Math.sqrt(46 / k)) + 2);
    for (let n = 1; n <= nmax; n++) {
      const e = Math.exp(-k * n * n);
      if (e < 1e-14) break;
      const An = 2 * N / (a * n * Math.PI) * Math.sin(n * Math.PI * a / L);
      s += An * (L / (n * Math.PI)) * (Math.sin(n * Math.PI * x2 / L) - Math.sin(n * Math.PI * x1 / L)) * e;
    }
    return s;
  }
  function expectedBins(N, a, L, theta, bins) {
    const out = [], w = L / bins;
    for (let b = 0; b < bins; b++) out.push(expectedBetween(N, a, L, theta, b * w, (b + 1) * w));
    return out;
  }
  /** 理論：右半邊粒子比例的期望值 */
  function fracRightTheory(a, L, theta) { return expectedBetween(1, a, L, theta, L / 2, L); }
  /** 最小平方法、通過原點的斜率：y ≈ k·t */
  function fitSlope(ts, ys) {
    let st = 0, sy = 0;
    for (let i = 0; i < ts.length; i++) { st += ts[i] * ts[i]; sy += ts[i] * ys[i]; }
    return st > 0 ? sy / st : NaN;
  }
  /** 最慢的模式衰減時間 L²／(π²D)：濃度差大約每過這麼久剩下 1/e */
  function relaxTime(L, D) { return L * L / (Math.PI * Math.PI * D); }

  // ===================================================================
  // 滲透：U 形管滲透計
  // ===================================================================
  /** 幾何（m）：起始液面在底部中心線上方 L0；b 是每一側底部彎管的等效長度；管頂高 top。截面積 1 cm²。 */
  const UTUBE = { L0: 0.50, b: 0.10, top: 1.10, area: 1e-4, tau: 600, margin: 0.005 };
  const LB = UTUBE.L0 + UTUBE.b;
  /** 膜的透水係數（m/(s·Pa)）：讓純粹的液面差以約 10 分鐘的時間常數消失（示意：真實的滲透計常要幾小時以上） */
  const LP = 1 / (UTUBE.tau * 2 * waterDensity(25) * G);

  /** 滲透壓 π = (iC) R T（Pa）；osm 是滲透濃度 iC（mmol/L ＝ mol/m³） */
  function osmoticPressure(osm, Tc) { return osm * R * (Tc + K0); }
  /** RT（kPa 每 mOsm/L）：滲透濃度乘上它就是 kPa */
  function RTkPa(Tc) { return R * (Tc + K0) / 1000; }
  /** 質量百分濃度（%，w/v）：C（mmol/L）× M（g/mol）÷ 10 000 */
  function percentWV(C, M) { return C * M / 10000; }
  function molarFromPercent(pct, M) { return pct * 10000 / M; }

  /** 建立滲透計：左右兩邊的溶質 i 與起始濃度（mmol/L）；s 是每單位截面積的溶質量（mol/m²），之後不變 */
  function osmoCreate(o) {
    return { x: 0, t: 0, iL: o.iL || 1, iR: o.iR || 1, CL0: o.CL || 0, CR0: o.CR || 0, sL: (o.CL || 0) * LB, sR: (o.CR || 0) * LB, limited: null };
  }
  function concL(st, x) { return st.sL / (LB - (x == null ? st.x : x)); }
  function concR(st, x) { return st.sR / (LB + (x == null ? st.x : x)); }
  /** 驅動壓力（Pa）：Δπ − ρg·2x − P（正值時水流進右管） */
  function osmoDrive(st, x, Tc, P) {
    return osmoticPressure(st.iR * concR(st, x) - st.iL * concL(st, x), Tc) - waterDensity(Tc) * G * 2 * x - (P || 0);
  }
  function osmoRate(st, x, Tc, P) { return LP * osmoDrive(st, x, Tc, P); }   // dx/dt（m/s）
  /** 前進 dt（s）：四階龍格–庫塔，依局部時間常數自動切小步；液面不能低於底部彎管 */
  function osmoStep(st, Tc, P, dt) {
    if (!(dt > 0)) return;
    const xmax = UTUBE.L0 - UTUBE.margin;
    let left = dt;
    st.limited = null;
    while (left > 1e-12) {
      const stiff = LP * (osmoticPressure(st.iR * st.sR / Math.pow(LB + st.x, 2) + st.iL * st.sL / Math.pow(LB - st.x, 2), Tc) + 2 * waterDensity(Tc) * G);
      const h = Math.min(left, 0.08 / stiff);
      const f = function (x) { return osmoRate(st, Math.max(-xmax, Math.min(xmax, x)), Tc, P); };
      const k1 = f(st.x), k2 = f(st.x + h * k1 / 2), k3 = f(st.x + h * k2 / 2), k4 = f(st.x + h * k3);
      let nx = st.x + h * (k1 + 2 * k2 + 2 * k3 + k4) / 6;
      if (nx > xmax) { nx = xmax; st.limited = 'left'; }      // 左管的水快流光了
      if (nx < -xmax) { nx = -xmax; st.limited = 'right'; }   // 右管的水快流光了
      st.x = nx; st.t += h; left -= h;
    }
  }
  /** 平衡：解 Δπ(x) − ρg·2x − P = 0（左邊單調遞減，二分法）。超出管子範圍時傳回邊界並標 limited。 */
  function osmoEquilibrium(st, Tc, P) {
    const xmax = UTUBE.L0 - UTUBE.margin;
    let lo = -xmax, hi = xmax;
    const flo = osmoDrive(st, lo, Tc, P), fhi = osmoDrive(st, hi, Tc, P);
    if (flo <= 0) return { x: lo, h: 2 * lo, limited: flo < 0 ? 'right' : null };
    if (fhi >= 0) return { x: hi, h: 2 * hi, limited: fhi > 0 ? 'left' : null };
    for (let k = 0; k < 200; k++) {
      const m = (lo + hi) / 2;
      if (osmoDrive(st, m, Tc, P) > 0) lo = m; else hi = m;
      if (hi - lo < 1e-13) break;
    }
    const x = (lo + hi) / 2;
    return { x: x, h: 2 * x, limited: null };
  }
  /** 左邊純水、右邊溶液、沒有活塞時的平衡液面差（解析解）：x(L_B + x) = π0·L_B／(2ρg) */
  function osmoEqPureLeft(osmR, Tc) {
    const K = osmoticPressure(osmR, Tc) * LB / (2 * waterDensity(Tc) * G);
    const x = (-LB + Math.sqrt(LB * LB + 4 * K)) / 2;
    return 2 * x;
  }
  /** 畫面與任務用的讀數（SI 單位） */
  function osmoReadout(st, Tc, P) {
    const CL = concL(st), CR = concR(st), rho = waterDensity(Tc);
    const dpi = osmoticPressure(st.iR * CR - st.iL * CL, Tc);
    return {
      t: st.t, x: st.x, h: 2 * st.x, hL: UTUBE.L0 - st.x, hR: UTUBE.L0 + st.x,
      CL: CL, CR: CR, osmL: st.iL * CL, osmR: st.iR * CR, dpi: dpi, rhogh: rho * G * 2 * st.x, P: P || 0,
      piL: osmoticPressure(st.iL * CL, Tc), piR: osmoticPressure(st.iR * CR, Tc),
      rate: 2 * osmoRate(st, st.x, Tc, P), rho: rho, limited: st.limited
    };
  }

  // ===================================================================
  // 細胞與溶液
  // ===================================================================
  /** 球的體積（表面積 A 固定時最大）：V = A^(3/2)／(6√π) */
  function sphereVolume(A) { return Math.pow(A, 1.5) / (6 * Math.sqrt(Math.PI)); }
  /**
   * 紅血球：V0 = 90 fL、表面積 136 μm²、不參與滲透的體積 V_b = 0.4 V0、細胞內滲透濃度 300 mOsm/L（在 V0 時）。
   * 膨脹到與表面積相同的球（約 149 fL）就破裂。k 讓時間常數約 1.2 秒（示意：真實的紅血球不到 0.1 秒就達平衡）。
   */
  const RBC = { V0: 90, Vb: 36, Cref: 300, area: 136, k: 0.0605 };
  RBC.n = RBC.Cref * (RBC.V0 - RBC.Vb);          // mOsm/L × fL
  RBC.Vlysis = sphereVolume(RBC.area);
  /**
   * 植物細胞（體積以細胞壁不受力時的內容積 V_w = 1 為單位）：V_b = 0.10，細胞液在 V = V_w 時 400 mOsm/L，
   * 細胞壁的體積彈性模數 ε = 6 MPa。k 讓沒有膨壓時的時間常數約 3 秒（示意）。
   */
  const PLANT = { Vw: 1, Vb: 0.10, Cref: 400, eps: 6000, k: 3.0e-4 };
  PLANT.n = PLANT.Cref * (PLANT.Vw - PLANT.Vb);
  const CELL = { rbc: RBC, plant: PLANT };

  /** 細胞內的滲透壓（kPa） */
  function piIn(kind, V, Tc) { const p = CELL[kind]; return RTkPa(Tc) * p.n / Math.max(1e-9, V - p.Vb); }
  /** 膨壓（kPa）：只有植物細胞的細胞壁被撐開時才有 */
  function turgor(kind, V) { return kind === 'plant' && V > PLANT.Vw ? PLANT.eps * (V - PLANT.Vw) / PLANT.Vw : 0; }
  /** 體積變化率：dV/dt = k (π_in − π_out − P) */
  function cellRate(kind, V, osmOut, Tc) {
    const p = CELL[kind];
    return p.k * (piIn(kind, V, Tc) - RTkPa(Tc) * osmOut - turgor(kind, V));
  }
  /** 新的細胞：紅血球剛從血漿取出（90 fL）；植物細胞在清水中平衡（膨脹、有膨壓） */
  function cellCreate(kind, Tc) {
    if (kind === 'rbc') return { kind: 'rbc', V: RBC.V0, lysed: false, t: 0 };
    return { kind: 'plant', V: cellEquilibrium('plant', 0, Tc == null ? 25 : Tc).V, lysed: false, t: 0 };
  }
  /** 前進 dt（s）：四階龍格–庫塔，依局部時間常數切小步；紅血球超過球形體積就溶血（不可逆） */
  function cellStep(cell, osmOut, Tc, dt) {
    if (!(dt > 0)) return;
    if (cell.lysed) { cell.t += dt; return; }
    const kind = cell.kind, p = CELL[kind];
    let left = dt;
    while (left > 1e-12) {
      const span = Math.max(1e-6, cell.V - p.Vb);
      const stiff = p.k * (RTkPa(Tc) * p.n / (span * span) + (kind === 'plant' && cell.V > p.Vw ? p.eps / p.Vw : 0));
      const h = Math.min(left, 0.1 / stiff, 0.25);
      const f = function (V) { return cellRate(kind, Math.max(p.Vb + 1e-6, V), osmOut, Tc); };
      const k1 = f(cell.V), k2 = f(cell.V + h * k1 / 2), k3 = f(cell.V + h * k2 / 2), k4 = f(cell.V + h * k3);
      cell.V = Math.max(p.Vb + 1e-6, cell.V + h * (k1 + 2 * k2 + 2 * k3 + k4) / 6);
      cell.t += h; left -= h;
      if (kind === 'rbc' && cell.V >= RBC.Vlysis) { cell.V = RBC.Vlysis; cell.lysed = true; cell.t += left; return; }
    }
  }
  /**
   * 平衡體積：π_in(V) − π_out − P(V) = 0。
   * 紅血球（P = 0）有解析解 V = V_b + n／C_out；若超過球形體積則會溶血（lysis: true）。
   */
  function cellEquilibrium(kind, osmOut, Tc) {
    const p = CELL[kind];
    if (kind === 'rbc') {
      const V = osmOut > 0 ? p.Vb + p.n / osmOut : Infinity;
      return { V: V, lysis: V >= RBC.Vlysis, P: 0 };
    }
    let lo = p.Vb + 1e-9, hi = p.Vw * 3;
    const g = function (V) { return piIn(kind, V, Tc) - RTkPa(Tc) * osmOut - turgor(kind, V); };
    for (let k = 0; k < 200; k++) {
      const m = (lo + hi) / 2;
      if (g(m) > 0) lo = m; else hi = m;
      if (hi - lo < 1e-14) break;
    }
    const V = (lo + hi) / 2;
    return { V: V, lysis: false, P: turgor(kind, V) };
  }
  /** 張力：外液滲透濃度與細胞正常的細胞內滲透濃度比較（相差不到 tol 視為等張） */
  function tonicity(osmOut, Cref, tol) {
    const r = (osmOut - Cref) / Cref;
    tol = tol == null ? 0.03 : tol;
    return Math.abs(r) <= tol ? 'iso' : r < 0 ? 'hypo' : 'hyper';
  }

  // ===================================================================
  // 紅血球的形狀（畫面用的幾何；體積與物理核心一致）
  // ===================================================================
  // Evans & Fung (1972) 的雙凹圓盤：z = ±½ √(1 − u²) (C0 + C1 u^2 + C2 u^4)，u = ρ／R0，
  // R0 = 3.91 μm、C0 = 0.81 μm、C1 = 7.83 μm、C2 = −4.39 μm（體積約 94 fL），等比例縮成 90 fL。
  const EF = { R0: 3.91, C0: 0.81, C1: 7.83, C2: -4.39 };
  const EF_V = 2 * Math.PI * EF.R0 * EF.R0 * (EF.C0 / 3 + EF.C1 * 2 / 15 + EF.C2 * 8 / 105);
  const DISC_K = Math.cbrt(RBC.V0 / EF_V);                     // 縮放倍率
  const SPHERE_R = Math.cbrt(3 * RBC.Vlysis / (4 * Math.PI));   // 溶血前的球半徑（μm）
  /** 截面輪廓：α 從上極（0）到赤道（π/2）；s = 0 雙凹圓盤、1 球；f 是厚度倍率（皺縮時 < 1） */
  function rbcProfilePoint(alpha, s, f) {
    const sa = Math.sin(alpha), ca = Math.cos(alpha);
    const rd = DISC_K * EF.R0 * sa;
    const zd = DISC_K * 0.5 * ca * (EF.C0 + EF.C1 * sa * sa + EF.C2 * sa * sa * sa * sa);
    return [(1 - s) * rd + s * SPHERE_R * sa, ((1 - s) * zd + s * SPHERE_R * ca) * (f == null ? 1 : f)];
  }
  /** 外形的體積（fL）：上半是 z(ρ) 的圖形，V = 2 ∫ 2πρ z dρ */
  function rbcShapeVolume(s, f) {
    const n = 400;
    let V = 0;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI / 2, a1 = ((k + 1) / n) * Math.PI / 2;
      const p0 = rbcProfilePoint(a0, s, f), p1 = rbcProfilePoint(a1, s, f);
      V += 2 * 2 * Math.PI * ((p0[0] * p0[1] + p1[0] * p1[1]) / 2) * (p1[0] - p0[0]);
    }
    return V;
  }
  let shapeTable = null;
  function buildShapeTable() {
    shapeTable = [];
    for (let k = 0; k <= 100; k++) shapeTable.push(rbcShapeVolume(k / 100, 1));
  }
  /**
   * 由體積決定畫面上的形狀：V0 ≤ V ≤ 溶血體積時在圓盤與球之間內插（s，體積相符）；
   * V < V0 時圓盤變薄（f = V／V0，體積相符）並長出皺縮的小刺（cren：0–1，只是示意）。
   */
  function rbcShape(V) {
    if (!shapeTable) buildShapeTable();
    if (V >= RBC.V0) {
      const Vt = Math.min(V, shapeTable[100]);
      let k = 0;
      while (k < 99 && shapeTable[k + 1] < Vt) k++;
      const v0 = shapeTable[k], v1 = shapeTable[k + 1];
      const s = Math.max(0, Math.min(1, (k + (v1 > v0 ? (Vt - v0) / (v1 - v0) : 0)) / 100));
      return { s: s, f: 1, cren: 0 };
    }
    const f = V / RBC.V0;
    return { s: 0, f: f, cren: Math.max(0, Math.min(1, (RBC.V0 - V) / (RBC.V0 - RBC.Vb) * 1.8)) };
  }

  const api = {
    R: R, KB: KB, G: G, K0: K0, SOLUTES: SOLUTES, BOX: BOX, UTUBE: UTUBE, LB: LB, LP: LP, RBC: RBC, PLANT: PLANT, EF: EF,
    waterViscosity: waterViscosity, waterDensity: waterDensity, diffusionCoef: diffusionCoef, diffusionUm2: diffusionUm2,
    rng: rng, makeGauss: makeGauss, fold: fold,
    createCloud: createCloud, scatterLeft: scatterLeft, posOf: posOf, xOf: xOf, removePartition: removePartition, stepCloud: stepCloud,
    cloudStats: cloudStats, histogram: histogram, expectedBetween: expectedBetween, expectedBins: expectedBins,
    fracRightTheory: fracRightTheory, fitSlope: fitSlope, relaxTime: relaxTime,
    osmoticPressure: osmoticPressure, RTkPa: RTkPa, percentWV: percentWV, molarFromPercent: molarFromPercent,
    osmoCreate: osmoCreate, concL: concL, concR: concR, osmoDrive: osmoDrive, osmoRate: osmoRate, osmoStep: osmoStep,
    osmoEquilibrium: osmoEquilibrium, osmoEqPureLeft: osmoEqPureLeft, osmoReadout: osmoReadout,
    sphereVolume: sphereVolume, piIn: piIn, turgor: turgor, cellRate: cellRate, cellCreate: cellCreate, cellStep: cellStep,
    cellEquilibrium: cellEquilibrium, tonicity: tonicity,
    rbcProfilePoint: rbcProfilePoint, rbcShapeVolume: rbcShapeVolume, rbcShape: rbcShape, SPHERE_R: SPHERE_R, DISC_K: DISC_K
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DiffOsmoCore = api;
})(typeof window !== 'undefined' ? window : this);
