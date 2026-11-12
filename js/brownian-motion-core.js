/*
 * brownian-motion-core.js — 「布朗運動與原子的存在」物理核心（與畫面無關，可單獨以 Node 測試）
 *
 * 單位一律 SI：長度 m、時間 s、溫度用攝氏度輸入（函式名稱有 C 的）並換成 K 計算、黏滯係數 Pa·s、密度 kg/m³。
 *
 * 一、常數（SI 定義值，CODATA 2022）：k_B = 1.380649 × 10^-23 J/K、N_A = 6.02214076 × 10^23 mol^-1；R = N_A k_B。
 *     「巨觀量得的氣體常數」R_MACRO = 8.314 J/(mol·K)：佩蘭的年代 R 由氣體實驗量得，k_B 未知，所以 N_A = R/k_B 是要「量」的。
 * 二、黏滯係數 η(T)
 *     水：CRC Handbook 0–100 °C 每 10 °C 的表，在 ln η 上做自然三次樣條內插（節點上剛好等於表值）。
 *     甘油水溶液：Cheng (2008) 經驗式 μ = μw^α μg^(1−α)（Ind. Eng. Chem. Res. 47, 3285），質量分率 Cm = 0.5、0.8。
 *     水的密度：CRC 表（含 4 °C 的最大值）三次樣條內插。
 * 三、斯托克斯–愛因斯坦：D = k_B T / (6π η a)。
 * 四、顆粒運動（真實尺度）：過阻尼朗之萬方程，每一軸每一步 Δx = √(2DΔt)·ξ，ξ 為標準常態亂數（Box–Muller，可給種子）。
 *     時間步（0.1 s）遠大於動量鬆弛時間 τ = m/(6πηa)（直徑 1 μm 的聚苯乙烯在水中約 0.06 μs），所以每一步的位移
 *     嚴格是平均 0、變異數 2DΔt 的常態分布、各步獨立：這個做法對布朗運動是「精確」的，不是近似。
 * 五、均方位移：理論 ⟨x²⟩ = 2Dt（一維）、⟨r²⟩ = 4Dt（二維）、6Dt（三維）。
 *     多顆粒平均（從起點量）與時間平均（所有起點、同樣的時間間隔 τ）兩種都有；
 *     D_meas：二維時間＋多顆粒平均的均方位移，對前 K 個時間間隔做「過原點」的最小平方擬合，斜率 ÷ 4。
 *     不確定度：把觀察時間切成 4 段，各段各求一次 D，由 4 個值的分散估計（標準誤差）。
 * 六、佩蘭求亞佛加厥數
 *     擴散法：k_B,meas = 6πηa D_meas / T，N_A,meas = R_MACRO / k_B,meas。
 *     沉降平衡：n(h) ∝ exp(−m′gh/(k_BT))，m′ = (4/3)πa³(ρp − ρf)（扣掉浮力），標高 H = k_BT/(m′g)。
 *       數各高度層的顆粒數，對 ln n 與 h 做加權最小平方擬合（權重 n，因為 Var(ln n) ≈ 1/n），斜率 = −1/H。
 *       k_B,meas = m′ g H_meas / T。
 *     拍照：兩張照片之間經過很長的時間（遠大於 H²/D），各顆粒高度彼此獨立、取自平衡分布；
 *       畫面上的動畫則用含漂移的朗之萬方程（Δz = −(D/H)Δt + √(2DΔt)ξ，底部反射）。
 * 七、分子視角（只用來看）：二維硬圓盤分子動力學。大圓盤與小圓盤的質量比只有 50–200 倍（真實是 10^9 倍以上），
 *     小圓盤的速度取自二維馬克士威–波茲曼分布（每個分量是變異數 kT/m 的常態分布）；碰撞完全彈性（總動量、總動能守恆）。
 *     固定時間步＋格子分區找鄰居：兩圓盤重疊而且正在靠近時，沿連心線交換衝量。
 */
(function (root) {
  'use strict';

  // ---------------- 常數 ----------------
  const KB = 1.380649e-23;        // J/K（SI 定義值）
  const NA = 6.02214076e23;       // 1/mol（SI 定義值）
  const R = NA * KB;              // 8.314462618… J/(mol·K)
  const R_MACRO = 8.314;          // 「巨觀量得」的氣體常數（擴散法、沉降法求 N_A 時使用）
  const G = 9.80665;              // 標準重力加速度 m/s²
  const T0 = 273.15;
  const PI = Math.PI;
  const FRAME_DT = 0.1;           // 顯微鏡錄影的時間間隔 s（每秒 10 張）

  // ---------------- 自然三次樣條 ----------------
  function spline(xs, ys) {
    const n = xs.length, h = [], al = [], l = [1], mu = [0], z = [0], c = new Array(n).fill(0), b = [], d = [];
    for (let i = 0; i < n - 1; i++) h.push(xs[i + 1] - xs[i]);
    for (let i = 1; i < n - 1; i++) al[i] = 3 / h[i] * (ys[i + 1] - ys[i]) - 3 / h[i - 1] * (ys[i] - ys[i - 1]);
    for (let i = 1; i < n - 1; i++) {
      l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1];
      mu[i] = h[i] / l[i];
      z[i] = (al[i] - h[i - 1] * z[i - 1]) / l[i];
    }
    for (let j = n - 2; j >= 0; j--) {
      c[j] = z[j] - mu[j] * c[j + 1]; // 自然樣條：c[0] = c[n−1] = 0
      b[j] = (ys[j + 1] - ys[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
      d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
    }
    return function (x) {
      let i = 0;
      if (x <= xs[0]) i = 0; else if (x >= xs[n - 1]) i = n - 2; else while (i < n - 2 && x > xs[i + 1]) i++;
      const dx = x - xs[i];
      return ys[i] + b[i] * dx + c[i] * dx * dx + d[i] * dx * dx * dx;
    };
  }

  // ---------------- 黏滯係數與密度 ----------------
  // CRC Handbook of Chemistry and Physics：水的黏滯係數（mPa·s），0–100 °C 每 10 °C
  const WATER_T = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const WATER_ETA = [1.792, 1.306, 1.002, 0.797, 0.653, 0.547, 0.466, 0.404, 0.354, 0.315, 0.282];
  const lnEtaW = spline(WATER_T, WATER_ETA.map(Math.log));
  /** 水的黏滯係數 Pa·s（0–100 °C，ln η 三次樣條內插 CRC 表） */
  function etaWater(Tc) { return Math.exp(lnEtaW(clampT(Tc))) * 1e-3; }
  // 水的密度 kg/m³（CRC 表，含 4 °C 的最大值）
  const RHO_T = [0, 4, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const RHO_W = [999.84, 999.97, 999.70, 998.21, 995.65, 992.22, 988.04, 983.20, 977.76, 971.79, 965.31, 958.35];
  const rhoW = spline(RHO_T, RHO_W);
  function rhoWater(Tc) { return rhoW(clampT(Tc)); }
  function clampT(Tc) { return Math.max(0, Math.min(100, +Tc)); }

  /** 甘油水溶液（質量分率 Cm）的黏滯係數 Pa·s：Cheng (2008) 經驗式，T 用 °C */
  function etaCheng(Tc, Cm) {
    const T = clampT(Tc);
    const mw = 1.790 * Math.exp((-1230 - T) * T / (36100 + 360 * T));
    const mg = 12100 * Math.exp((-1233 + T) * T / (9900 + 70 * T));
    const a = 0.705 - 0.0017 * T, b = (4.9 + 0.036 * T) * Math.pow(a, 2.5);
    const al = 1 - Cm + a * b * Cm * (1 - Cm) / (a * Cm + b * (1 - Cm));
    return Math.pow(mw, al) * Math.pow(mg, 1 - al) * 1e-3;
  }
  const LIQUIDS = {
    water: { zh: '水', en: 'water', eta: etaWater },
    gly50: { zh: '甘油 50%', en: '50% glycerol', eta: function (T) { return etaCheng(T, 0.5); } },
    gly80: { zh: '甘油 80%', en: '80% glycerol', eta: function (T) { return etaCheng(T, 0.8); } }
  };
  function eta(liquid, Tc) { return (LIQUIDS[liquid] || LIQUIDS.water).eta(Tc); }

  // 顆粒材料（密度 kg/m³）：藤黃（佩蘭，約 1.20 g/cm³）、聚苯乙烯 1.05、二氧化矽約 2.0
  const MATERIALS = {
    gamboge: { zh: '藤黃', en: 'gamboge', rho: 1200 },
    polystyrene: { zh: '聚苯乙烯', en: 'polystyrene', rho: 1050 },
    silica: { zh: '二氧化矽', en: 'silica', rho: 2000 }
  };

  // ---------------- 斯托克斯–愛因斯坦 ----------------
  function diffusion(Tc, etaPa, a) { return KB * (Tc + T0) / (6 * PI * etaPa * a); }
  function D(liquid, Tc, a) { return diffusion(Tc, eta(liquid, Tc), a); }
  /** 動量鬆弛時間 τ = m/(6πηa) */
  function relaxTime(a, rhoP, etaPa) { return (4 / 3) * PI * a * a * a * rhoP / (6 * PI * etaPa * a); }
  function kBfromD(Dm, etaPa, a, Tc) { return 6 * PI * etaPa * a * Dm / (Tc + T0); }
  function NAfromKB(kb) { return R_MACRO / kb; }

  // ---------------- 亂數（可給種子） ----------------
  function rng(seed) {
    let s = (seed >>> 0) || 0x9e3779b9, spare = null;
    function next() { // mulberry32
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function gauss() { // Box–Muller
      if (spare !== null) { const v = spare; spare = null; return v; }
      let u = 0;
      while (u <= 1e-300) u = next();
      const v = next(), r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * PI * v);
      return r * Math.cos(2 * PI * v);
    }
    return { next: next, gauss: gauss };
  }

  // ---------------- 顯微鏡：一次觀察 ----------------
  /**
   * 產生 N 顆粒子在 tObs 秒內的三維軌跡（每 dt 一格）。p = { D, N, tObs, dt, seed, L（視野邊長 m，起點均勻分布在視野內） }
   * 回傳 { N, F（格數）, dt, D, x, y, z（Float64Array，索引 f*N+i）, x0, y0（起點） }。z 是相對焦平面的深度位移（3D 用）。
   */
  function simulateRun(p) {
    const N = Math.max(1, Math.round(p.N)), dt = p.dt || FRAME_DT, F = Math.max(1, Math.round(p.tObs / dt));
    const r = rng(p.seed || 1), s = Math.sqrt(2 * p.D * dt), L = p.L || 0;
    const x = new Float64Array((F + 1) * N), y = new Float64Array((F + 1) * N), z = new Float64Array((F + 1) * N);
    for (let i = 0; i < N; i++) { x[i] = (r.next() - 0.5) * L; y[i] = (r.next() - 0.5) * L; z[i] = 0; }
    for (let f = 1; f <= F; f++) {
      const o = f * N, q = o - N;
      for (let i = 0; i < N; i++) {
        x[o + i] = x[q + i] + s * r.gauss();
        y[o + i] = y[q + i] + s * r.gauss();
        z[o + i] = z[q + i] + s * r.gauss();
      }
    }
    return { N: N, F: F, dt: dt, D: p.D, x: x, y: y, z: z };
  }
  /** 第 f 格、第 i 顆的位移平方（dims = 1、2、3） */
  function disp2(run, f, i, dims) {
    const o = f * run.N + i;
    const dx = run.x[o] - run.x[i], dy = run.y[o] - run.y[i], dz = run.z[o] - run.z[i];
    return dims === 1 ? dx * dx : dims === 3 ? dx * dx + dy * dy + dz * dz : dx * dx + dy * dy;
  }
  /** 多顆粒平均（從起點量）：⟨r²⟩(f·dt)，f = 0…upTo */
  function msdEnsemble(run, dims, upTo) {
    const F = upTo == null ? run.F : Math.min(run.F, upTo), out = new Float64Array(F + 1);
    for (let f = 1; f <= F; f++) {
      let s = 0;
      for (let i = 0; i < run.N; i++) s += disp2(run, f, i, dims || 2);
      out[f] = s / run.N;
    }
    return out;
  }
  /** 時間＋多顆粒平均：lag = 1…maxLag（只用 f0…f1 這一段） */
  function msdTimeAvg(run, maxLag, dims, f0, f1) {
    f0 = f0 || 0; f1 = f1 == null ? run.F : f1;
    const N = run.N, out = new Float64Array(maxLag + 1), d3 = dims === 3, d1 = dims === 1;
    for (let k = 1; k <= maxLag; k++) {
      let s = 0, c = 0;
      for (let f = f0; f + k <= f1; f++) {
        const a = f * N, b = (f + k) * N;
        for (let i = 0; i < N; i++) {
          const dx = run.x[b + i] - run.x[a + i], dy = run.y[b + i] - run.y[a + i];
          let v = dx * dx;
          if (!d1) v += dy * dy;
          if (d3) { const dz = run.z[b + i] - run.z[a + i]; v += dz * dz; }
          s += v; c++;
        }
      }
      out[k] = c ? s / c : NaN;
    }
    return out;
  }
  /** 過原點的最小平方擬合 y = k t：回傳 { k, se, n } */
  function fitOrigin(t, y) {
    let stt = 0, sty = 0, n = 0;
    for (let i = 0; i < t.length; i++) { if (!isFinite(y[i])) continue; stt += t[i] * t[i]; sty += t[i] * y[i]; n++; }
    const k = stt > 0 ? sty / stt : NaN;
    let ss = 0;
    for (let i = 0; i < t.length; i++) { if (!isFinite(y[i])) continue; const e = y[i] - k * t[i]; ss += e * e; }
    return { k: k, se: n > 1 ? Math.sqrt(ss / (n - 1) / stt) : NaN, n: n, ss: ss };
  }
  /** 擬合用的時間間隔個數 K：最多 4 個（沒有定位誤差時，短的時間間隔統計誤差最小；Michalet 2010） */
  function fitLags(F) { return Math.max(1, Math.min(4, Math.floor(F / 4))); }
  /** 由一次觀察求 D_meas（二維時間＋多顆粒平均、前 K 個間隔過原點擬合 ÷ 4），附 4 段分割的標準誤差 */
  function measureD(run) {
    const K = fitLags(run.F), ta = msdTimeAvg(run, K, 2);
    const t = [], y = [];
    for (let k = 1; k <= K; k++) { t.push(k * run.dt); y.push(ta[k]); }
    const Dm = fitOrigin(t, y).k / 4;
    // 4 段分割估計不確定度
    let se = NaN;
    const Fb = Math.floor(run.F / 4);
    if (Fb >= 2) {
      const Kb = Math.max(1, Math.min(K, Math.floor(Fb / 2))), vals = [];
      for (let b = 0; b < 4; b++) {
        const tb = msdTimeAvg(run, Kb, 2, b * Fb, (b + 1) * Fb), tt = [], yy = [];
        for (let k = 1; k <= Kb; k++) { tt.push(k * run.dt); yy.push(tb[k]); }
        vals.push(fitOrigin(tt, yy).k / 4);
      }
      const m = vals.reduce(function (a, b) { return a + b; }, 0) / 4;
      se = Math.sqrt(vals.reduce(function (a, v) { return a + (v - m) * (v - m); }, 0) / 3 / 4);
    }
    return { D: Dm, se: se, K: K, ta: ta };
  }
  /** 觀察結束時，每顆的 r²/(4Dt)（二維）中最大的一個：判斷「走得特別遠」的尾端事件；P(某一顆 ≥ k) = e^(−k) */
  function maxTail(run) {
    const f = run.F, s = 4 * run.D * run.F * run.dt;
    let m = 0;
    for (let i = 0; i < run.N; i++) m = Math.max(m, disp2(run, f, i, 2) / s);
    return m;
  }

  // ---------------- 沉降平衡 ----------------
  function buoyantMass(a, rhoP, rhoF) { return (4 / 3) * PI * a * a * a * (rhoP - rhoF); }
  function scaleHeight(a, dRho, Tc) { return KB * (Tc + T0) / ((4 / 3) * PI * a * a * a * dRho * G); }
  /** 某材料、半徑、溫度在水中的沉降參數 */
  function sedParams(material, a, Tc) {
    const m = MATERIALS[material] || MATERIALS.gamboge, rf = rhoWater(Tc), dRho = m.rho - rf;
    const e = etaWater(Tc), Dd = diffusion(Tc, e, a), H = scaleHeight(a, dRho, Tc);
    return { rhoP: m.rho, rhoF: rf, dRho: dRho, mPrime: buoyantMass(a, m.rho, rf), eta: e, D: Dd, H: H, vs: Dd / H, relax: H * H / Dd };
  }
  /** 平衡分布取樣：n 顆，高度 h ~ 指數分布（標高 H），水平位置均勻（寬 Lx、深 Ly） */
  function sedSample(n, H, Lx, Ly, r) {
    const x = new Float64Array(n), y = new Float64Array(n), h = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = r.next() * Lx; y[i] = r.next() * Ly;
      let u = 0; while (u <= 1e-300) u = r.next();
      h[i] = -H * Math.log(u);
    }
    return { n: n, x: x, y: y, h: h };
  }
  /** 含漂移的朗之萬一步：底部反射（h ≥ 0），側邊反射（0…Lx、0…Ly） */
  function sedStep(s, dt, Dd, H, Lx, Ly, r) {
    const sd = Math.sqrt(2 * Dd * dt), drift = Dd / H * dt;
    for (let i = 0; i < s.n; i++) {
      let h = s.h[i] - drift + sd * r.gauss();
      if (h < 0) h = -h;
      s.h[i] = h;
      s.x[i] = reflect(s.x[i] + sd * r.gauss(), Lx);
      s.y[i] = reflect(s.y[i] + sd * r.gauss(), Ly);
    }
  }
  function reflect(v, L) {
    if (!(L > 0)) return v;
    v = v % (2 * L); if (v < 0) v += 2 * L;
    return v > L ? 2 * L - v : v;
  }
  /** 各層顆粒數：0…Hv 分成 nl 層 */
  function layerCounts(h, Hv, nl) {
    const c = new Array(nl).fill(0), w = Hv / nl;
    for (let i = 0; i < h.length; i++) { const j = Math.floor(h[i] / w); if (j >= 0 && j < nl) c[j]++; }
    return c;
  }
  /** ln n 對 h 的加權最小平方擬合（權重 n；n = 0 的層不用）。heights 為各層中心。回傳 { H, se, slope, n0, used } */
  function fitLnN(heights, counts) {
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, used = 0;
    for (let i = 0; i < counts.length; i++) {
      const n = counts[i];
      if (!(n > 0)) continue;
      const x = heights[i], yv = Math.log(n);
      sw += n; sx += n * x; sy += n * yv; sxx += n * x * x; sxy += n * x * yv; used++;
    }
    if (used < 2) return { H: NaN, se: NaN, slope: NaN, used: used };
    const det = sw * sxx - sx * sx, slope = (sw * sxy - sx * sy) / det, icpt = (sy - slope * sx) / sw;
    const seSlope = Math.sqrt(sw / det); // Var(ln n) ≈ 1/n 時的理論標準誤差
    return { H: -1 / slope, se: seSlope / (slope * slope), slope: slope, n0: Math.exp(icpt), used: used };
  }
  function kBfromH(Hm, mPrime, Tc) { return mPrime * G * Hm / (Tc + T0); }
  /** 標高 → 自動選的視窗高度（1–2–5 系列，至少 5H 與 40 倍半徑）、層數 6 */
  function sedView(H, a) {
    const want = Math.max(5 * H, 40 * a);
    const p = Math.pow(10, Math.floor(Math.log10(want)));
    const m = [1, 2, 5, 10].find(function (k) { return k * p >= want * (1 - 1e-12); });
    return { Hv: m * p, layers: 6 };
  }

  // ---------------- 分子視角：二維硬圓盤 ----------------
  /**
   * p = { n（小圓盤數）, W, H（盒子，任意長度單位）, r（小圓盤半徑）, Rb（大圓盤半徑）, m（小圓盤質量）, M（大圓盤質量）, kT, seed, periodic }
   * 狀態 { x, y, vx, vy, r, m（Float64Array；索引 0 是大圓盤）, n, W, H, periodic, hits（大圓盤被撞次數）, t }
   */
  function mdCreate(p) {
    const n = p.n + 1, r = rng(p.seed || 7);
    const s = { n: n, W: p.W, H: p.H, periodic: !!p.periodic, hits: 0, t: 0, kT: p.kT,
      x: new Float64Array(n), y: new Float64Array(n), vx: new Float64Array(n), vy: new Float64Array(n), r: new Float64Array(n), m: new Float64Array(n) };
    s.r[0] = p.Rb; s.m[0] = p.M; s.x[0] = p.W / 2; s.y[0] = p.H / 2;
    for (let i = 1; i < n; i++) {
      s.r[i] = p.r; s.m[i] = p.m;
      let ok = false, tries = 0;
      while (!ok && tries++ < 200) {
        s.x[i] = p.r + r.next() * (p.W - 2 * p.r); s.y[i] = p.r + r.next() * (p.H - 2 * p.r);
        ok = Math.hypot(s.x[i] - s.x[0], s.y[i] - s.y[0]) > p.Rb + p.r * 1.5;
      }
      const sd = Math.sqrt(p.kT / p.m);
      s.vx[i] = sd * r.gauss(); s.vy[i] = sd * r.gauss();
    }
    // 大圓盤也照同一溫度給速度（能量均分），再把總動量扣成 0（只在週期性邊界下有意義）
    const sdB = Math.sqrt(p.kT / p.M);
    s.vx[0] = sdB * r.gauss(); s.vy[0] = sdB * r.gauss();
    if (s.periodic) {
      let px = 0, py = 0, mt = 0;
      for (let i = 0; i < n; i++) { px += s.m[i] * s.vx[i]; py += s.m[i] * s.vy[i]; mt += s.m[i]; }
      for (let i = 0; i < n; i++) { s.vx[i] -= px / mt; s.vy[i] -= py / mt; }
    }
    return s;
  }
  /** 兩圓盤彈性碰撞（只有正在靠近時）：沿連心線交換衝量；回傳衝量大小（沒碰撞回傳 0） */
  function collide(s, i, j, dx, dy) {
    const d = Math.hypot(dx, dy);
    if (!(d > 0)) return 0;
    const nx = dx / d, ny = dy / d;
    const vn = (s.vx[j] - s.vx[i]) * nx + (s.vy[j] - s.vy[i]) * ny; // j 相對 i 沿 i→j 方向的速度
    if (vn >= 0) return 0;
    const mi = s.m[i], mj = s.m[j], J = 2 * mi * mj / (mi + mj) * vn;
    s.vx[i] += J / mi * nx; s.vy[i] += J / mi * ny;
    s.vx[j] -= J / mj * nx; s.vy[j] -= J / mj * ny;
    return -J;
  }
  /** 一步：移動、撞牆（或週期性邊界）、找重疊的靠近對（格子分區）。回傳這一步大圓盤受到的衝量向量 {jx, jy, hits} */
  function mdStep(s, dt) {
    const n = s.n, W = s.W, H = s.H;
    for (let i = 0; i < n; i++) {
      s.x[i] += s.vx[i] * dt; s.y[i] += s.vy[i] * dt;
      if (s.periodic) {
        if (s.x[i] < 0) s.x[i] += W; else if (s.x[i] >= W) s.x[i] -= W;
        if (s.y[i] < 0) s.y[i] += H; else if (s.y[i] >= H) s.y[i] -= H;
      } else {
        const ri = s.r[i];
        if (s.x[i] < ri && s.vx[i] < 0) s.vx[i] = -s.vx[i];
        if (s.x[i] > W - ri && s.vx[i] > 0) s.vx[i] = -s.vx[i];
        if (s.y[i] < ri && s.vy[i] < 0) s.vy[i] = -s.vy[i];
        if (s.y[i] > H - ri && s.vy[i] > 0) s.vy[i] = -s.vy[i];
      }
    }
    // 格子：邊長 = 小圓盤直徑；大圓盤另外和每個小圓盤檢查
    const cs = 2 * s.r[1 % n] * 1.05, gx = Math.max(1, Math.floor(W / cs)), gy = Math.max(1, Math.floor(H / cs));
    const head = new Int32Array(gx * gy).fill(-1), nxt = new Int32Array(n).fill(-1);
    for (let i = 1; i < n; i++) {
      let cx = Math.floor(s.x[i] / W * gx), cy = Math.floor(s.y[i] / H * gy);
      cx = Math.min(gx - 1, Math.max(0, cx)); cy = Math.min(gy - 1, Math.max(0, cy));
      const c = cy * gx + cx; nxt[i] = head[c]; head[c] = i;
    }
    const out = { jx: 0, jy: 0, hits: 0 };
    const sep = function (i, j) {
      let dx = s.x[j] - s.x[i], dy = s.y[j] - s.y[i];
      if (s.periodic) { dx -= W * Math.round(dx / W); dy -= H * Math.round(dy / H); }
      return [dx, dy];
    };
    for (let c = 0; c < gx * gy; c++) {
      const cx = c % gx, cy = (c - cx) / gx;
      for (let i = head[c]; i >= 0; i = nxt[i]) {
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          let ncx = cx + ox, ncy = cy + oy;
          if (s.periodic) { ncx = (ncx + gx) % gx; ncy = (ncy + gy) % gy; } else if (ncx < 0 || ncy < 0 || ncx >= gx || ncy >= gy) continue;
          for (let j = head[ncy * gx + ncx]; j >= 0; j = nxt[j]) {
            if (j <= i) continue;
            const d = sep(i, j), rr = s.r[i] + s.r[j];
            if (d[0] * d[0] + d[1] * d[1] < rr * rr) collide(s, i, j, d[0], d[1]);
          }
        }
      }
    }
    for (let j = 1; j < n; j++) {
      const d = sep(0, j), rr = s.r[0] + s.r[j];
      if (d[0] * d[0] + d[1] * d[1] < rr * rr) {
        const vx0 = s.vx[0], vy0 = s.vy[0];
        if (collide(s, 0, j, d[0], d[1]) > 0) { out.hits++; out.jx += s.m[0] * (s.vx[0] - vx0); out.jy += s.m[0] * (s.vy[0] - vy0); }
      }
    }
    s.hits += out.hits; s.t += dt;
    return out;
  }
  function mdMomentum(s) { let px = 0, py = 0; for (let i = 0; i < s.n; i++) { px += s.m[i] * s.vx[i]; py += s.m[i] * s.vy[i]; } return [px, py]; }
  function mdEnergy(s) { let e = 0; for (let i = 0; i < s.n; i++) e += 0.5 * s.m[i] * (s.vx[i] * s.vx[i] + s.vy[i] * s.vy[i]); return e; }

  // ---------------- 頁面與任務證明共用：一次觀察、一次拍照的摘要 ----------------
  /** 1–2–5 系列中不小於 x 的數 */
  function nice125(x) {
    const p = Math.pow(10, Math.floor(Math.log10(x)));
    return [1, 2, 5, 10].find(function (k) { return k * p >= x * (1 - 1e-12); }) * p;
  }
  /** 顯微鏡視野邊長（m）：至少 6 倍的觀察結束時方均根位移，也至少 30 倍半徑 */
  function fovFor(Dd, tObs, a) { return nice125(Math.max(6 * Math.sqrt(4 * Dd * tObs), 30 * a)); }
  /**
   * 一次觀察：p = { liquid, T（°C）, a（m）, N, tObs（s）, seed }。
   * 回傳 { run, L, row }；row 的單位是頁面與任務用的（a、msdEnd、sigma 為 μm 或 μm²、eta 為 mPa·s）。
   */
  function observe(p) {
    const e = eta(p.liquid, p.T), Dd = diffusion(p.T, e, p.a), L = fovFor(Dd, p.tObs, p.a);
    const run = simulateRun({ D: Dd, N: p.N, tObs: p.tObs, seed: p.seed, L: L });
    const m = measureD(run), kb = kBfromD(m.D, e, p.a, p.T), na = NAfromKB(kb);
    const t = run.F * run.dt, ens = msdEnsemble(run, 2);
    return {
      run: run, L: L, ens: ens, fit: m,
      row: { liquid: p.liquid, T: p.T, eta: e * 1e3, a: p.a * 1e6, N: run.N, tObs: t, D: Dd, Dm: m.D, se: m.se, err: m.D / Dd - 1,
        kB: kb, NA: na, naErr: na / NA - 1, msdEnd: ens[run.F] * 1e12, msdEndTh: 4 * Dd * t * 1e12, tail: maxTail(run), sigma: Math.sqrt(2 * Dd * t) * 1e6 }
    };
  }
  const SED_N = 400; // 視窗裡大約的顆粒數（每張照片都全部數）
  /** 沉降：一張照片（平衡分布的新樣本）。回傳 { pos, counts } */
  function sedPhoto(sp, view, Lx, Ly, r) {
    const pos = sedSample(SED_N, sp.H, Lx, Ly, r);
    return { pos: pos, counts: layerCounts(pos.h, view.Hv, view.layers) };
  }
  /** 沉降：由累計各層數算出擬合與 N_A。material、a（m）、T（°C） */
  function sedFit(material, a, Tc, counts, view) {
    const sp = sedParams(material, a, Tc), w = view.Hv / view.layers;
    const f = fitLnN(counts.map(function (_, i) { return (i + 0.5) * w; }), counts);
    const kb = isFinite(f.H) && f.H > 0 ? kBfromH(f.H, sp.mPrime, Tc) : NaN, na = NAfromKB(kb);
    return { sp: sp, fit: f, kB: kb, NA: na, naErr: na / NA - 1, counted: counts.reduce(function (s, c) { return s + c; }, 0) };
  }

  const api = {
    KB: KB, NA: NA, R: R, R_MACRO: R_MACRO, G: G, T0: T0, FRAME_DT: FRAME_DT,
    WATER_T: WATER_T, WATER_ETA: WATER_ETA, RHO_T: RHO_T, RHO_W: RHO_W,
    spline: spline, etaWater: etaWater, rhoWater: rhoWater, etaCheng: etaCheng, LIQUIDS: LIQUIDS, eta: eta, MATERIALS: MATERIALS,
    diffusion: diffusion, D: D, relaxTime: relaxTime, kBfromD: kBfromD, NAfromKB: NAfromKB,
    rng: rng, simulateRun: simulateRun, disp2: disp2, msdEnsemble: msdEnsemble, msdTimeAvg: msdTimeAvg, fitOrigin: fitOrigin,
    fitLags: fitLags, measureD: measureD, maxTail: maxTail,
    buoyantMass: buoyantMass, scaleHeight: scaleHeight, sedParams: sedParams, sedSample: sedSample, sedStep: sedStep, reflect: reflect,
    layerCounts: layerCounts, fitLnN: fitLnN, kBfromH: kBfromH, sedView: sedView,
    mdCreate: mdCreate, mdStep: mdStep, mdMomentum: mdMomentum, mdEnergy: mdEnergy, collide: collide,
    nice125: nice125, fovFor: fovFor, observe: observe, SED_N: SED_N, sedPhoto: sedPhoto, sedFit: sedFit
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BrownianMotionCore = api;
})(typeof window !== 'undefined' ? window : this);
