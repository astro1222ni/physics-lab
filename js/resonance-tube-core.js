/*
 * resonance-tube-core.js — 氣柱的共鳴（共鳴管測聲速）：物理核心（與畫面無關，可在 Node 單獨測試）
 *
 * 單位約定（全部用 SI）：
 *   長度 L、r、λ、e ...... m（L 是「管口到水面」的距離，也就是管上刻度的讀數；刻度 0 在管口）
 *   溫度 Tc ............... °C（室溫，管內空氣溫度相同）
 *   頻率 f ................ Hz；聲速 v ...... m/s
 *
 * 【聲速】理想氣體 v = √(γRT/M) ∝ √T（T 為絕對溫度）：
 *     v(Tc) = 331.3 √(1 + Tc / 273.15) m/s
 *   課本的線性近似 v ≈ 331 + 0.60 Tc 在 0–40 °C 內與上式相差不到 0.3%。
 *
 * 【共鳴條件】水面是剛性邊界（空氣位移的波節、壓力的波腹）；開口端的波腹其實在管口外約 e 處
 *   （管口修正）。無凸緣（薄管壁）開口圓管的低頻理論值 e = 0.6133 r（Levine 與 Schwinger, 1948）。
 *   有效氣柱長 L + e 等於奇數個四分之一波長時共鳴：
 *       L_n + e = (2n − 1) λ / 4，n = 1, 2, 3, …
 *   相鄰兩個共鳴位置相差 λ/2，管口修正在相減時抵消：v = f λ = 2 f (L_{n+1} − L_n)。
 *
 * 【響度模型】音叉在管口送進管內的聲波，在水面（反射係數 +1，壓力）與管口（−|R|）之間來回反射，
 *   每往返一次多走 2(L + e)，並乘上保留比例 ρ。全部反射波相加（等比級數）：
 *       G(L) = 1 / |1 + ρ e^{−i 2k(L + e)}|，k = 2π/λ
 *   G 是管內駐波振幅相對於「只走一趟」的放大倍數；聲音由管口輻射出去，響度 ∝ G^2，
 *   以分貝表示為 20 log10 G（「相對響度」）。共鳴時 G = 1/(1 − ρ)，最弱時 G = 1/(1 + ρ)。
 *   ρ = ρ_w · |R| · e^{−2αL}：
 *     |R| = e^{−(ka)^2/2}：開口端輻射損失（低頻近似 1 − (ka)^2/2），a = r
 *     α = 3.0e-5 √f / r（1/m）：管壁黏滯與熱傳導造成的衰減（常溫空氣的近似式）
 *     ρ_w = 0.95：其他損耗（水面晃動、管壁不平、接頭等）合併成的經驗值，讓共鳴寬度接近學校的實際儀器
 *   因此水面越深，ρ 越小，共鳴越弱、越寬。
 *
 * 【數據分析】（課本的做法，並用最小平方法推廣到多個共鳴點）
 *   同一支音叉的讀數先分群（相距 4 cm 以內視為同一個共鳴點，取平均），再依 L_n ≈ (n − ½)·λ/2 − e
 *   推定每一群是第幾次共鳴 n，最後對 (n, L) 做直線擬合：
 *       L = (λ/2) n − (λ/4 + e)   ⇒   λ = 2 × 斜率，e = −截距 − λ/4，v = f λ
 */
(function (root) {
  'use strict';

  const T0 = 273.15;          // K
  const V0 = 331.3;           // m/s：0 °C 乾燥空氣的聲速
  const END_K = 0.6133;       // 無凸緣開口端的管口修正係數（e = END_K · r）
  const RHO_W = 0.95;         // 其他損耗的經驗值（每往返一次）
  const WALL_K = 3.0e-5;      // 管壁衰減：α = WALL_K √f / r（1/m）
  const TUBE_LEN = 1.00;      // m：玻璃管全長（刻度 0–100 cm）
  const L_MIN = 0.02;         // m：水面最高可升到距管口 2 cm
  const L_MAX = 0.98;         // m：水面最低可降到 98 cm
  const CLUSTER_TOL = 0.04;   // m：相距 4 cm 以內的讀數視為同一個共鳴點

  function speedOfSound(Tc) { return V0 * Math.sqrt(1 + Tc / T0); }
  function speedLinear(Tc) { return 331 + 0.6 * Tc; }
  function wavelength(v, f) { return v / f; }
  function endCorrection(r) { return END_K * r; }

  /** 第 n 次共鳴的水面位置（m，距管口）：L_n = (2n − 1)λ/4 − e */
  function resonanceLength(n, f, Tc, r) {
    return (2 * n - 1) * wavelength(speedOfSound(Tc), f) / 4 - endCorrection(r);
  }
  /** 在 [lo, hi] 範圍內的所有共鳴位置 [{n, L}] */
  function resonances(f, Tc, r, lo, hi) {
    lo = lo == null ? 0 : lo; hi = hi == null ? L_MAX : hi;
    const out = [];
    for (let n = 1; n < 500; n++) {
      const L = resonanceLength(n, f, Tc, r);
      if (L > hi + 1e-12) break;
      if (L >= lo - 1e-12) out.push({ n: n, L: L });
    }
    return out;
  }

  /** 開口端的振幅反射比例 |R| ≈ e^{−(ka)^2/2} */
  function mouthReflection(f, Tc, r) {
    const ka = 2 * Math.PI * f / speedOfSound(Tc) * r;
    return Math.exp(-ka * ka / 2);
  }
  /** 管壁衰減係數 α（1/m） */
  function wallAttenuation(f, r) { return WALL_K * Math.sqrt(f) / r; }
  /** 每往返一次保留的振幅比例 ρ(L) */
  function roundTripKeep(L, f, Tc, r) {
    return RHO_W * mouthReflection(f, Tc, r) * Math.exp(-2 * wallAttenuation(f, r) * L);
  }
  /** 共鳴放大倍數 G(L) = 1/|1 + ρ e^{−iφ}|，φ = 2k(L + e) */
  function gain(L, f, Tc, r) {
    const k = 2 * Math.PI * f / speedOfSound(Tc);
    const phi = 2 * k * (L + endCorrection(r));
    const rho = roundTripKeep(L, f, Tc, r);
    const re = 1 + rho * Math.cos(phi), im = -rho * Math.sin(phi);
    return 1 / Math.sqrt(re * re + im * im);
  }
  /** 相對響度（dB）= 20 log10 G */
  function levelDb(L, f, Tc, r) { return 20 * Math.log10(gain(L, f, Tc, r)); }
  /** 第 n 次共鳴的峰值響度（dB）：G = 1/(1 − ρ) */
  function peakDb(n, f, Tc, r) {
    const L = resonanceLength(n, f, Tc, r);
    return -20 * Math.log10(1 - roundTripKeep(L, f, Tc, r));
  }
  /** 最接近 L 的共鳴：{n, Ln, dist（m）, db, peak（dB）, below（比峰值低幾 dB）} */
  function nearestResonance(L, f, Tc, r) {
    const lam = wavelength(speedOfSound(Tc), f), e = endCorrection(r);
    let n = Math.round((L + e) / (lam / 2) + 0.5);
    if (n < 1) n = 1;
    const Ln = (2 * n - 1) * lam / 4 - e;
    const db = levelDb(L, f, Tc, r), pk = peakDb(n, f, Tc, r);
    return { n: n, Ln: Ln, dist: L - Ln, db: db, peak: pk, below: pk - db };
  }
  /**
   * 管內空氣的位移振幅分布（駐波，水面為波節）：y 為「水面以上」的高度（m），
   * 傳回 |sin(k y)|（0–1，已不含 G）。波腹在 y = λ/4、3λ/4 …；管口外 e 處為開口端的波腹（共鳴時）。
   */
  function displacementShape(y, f, Tc) {
    const k = 2 * Math.PI * f / speedOfSound(Tc);
    return Math.abs(Math.sin(k * y));
  }
  /** 管內的波節與波腹（以距管口的位置 L 表示，可為負：在管口外），水面在 Lw */
  function nodesAndAntinodes(Lw, f, Tc, r) {
    const lam = wavelength(speedOfSound(Tc), f), e = endCorrection(r);
    const nodes = [], anti = [];
    for (let m = 0; m < 400; m++) {
      const yN = m * lam / 2, yA = (2 * m + 1) * lam / 4;
      if (yN <= Lw + 1e-12) nodes.push(Lw - yN);
      if (yA <= Lw + e + 1e-9) anti.push(Lw - yA);
      if (yN > Lw + e && yA > Lw + e) break;
    }
    return { nodes: nodes, antinodes: anti };
  }

  /** 讀數取到 1 mm（尺的最小刻度） */
  function roundMm(L) { return Math.round(L * 1000) / 1000; }

  // ---------------- 數據分析 ----------------
  /** 把讀數分群（相距 tol 以內為同一群），傳回依位置排序的 [{mean, values}] */
  function cluster(Ls, tol) {
    tol = tol == null ? CLUSTER_TOL : tol;
    const s = Ls.filter(function (x) { return isFinite(x); }).slice().sort(function (a, b) { return a - b; });
    const out = [];
    s.forEach(function (x) {
      const c = out[out.length - 1];
      if (c && x - c.values[c.values.length - 1] <= tol) c.values.push(x);
      else out.push({ values: [x] });
    });
    out.forEach(function (c) { c.mean = c.values.reduce(function (a, b) { return a + b; }, 0) / c.values.length; });
    return out;
  }
  /**
   * 推定每個（排序後的）共鳴位置是第幾次共鳴。依 L_n + e = (n − ½)·h（h = λ/2），e 遠小於 h。
   * 先以最小間距 d 為 h 的候選，再試 d/2、d/3、d/4（中間漏掉幾個共鳴時），取第一個全部吻合的。
   * 傳回 { ns, h, consistent }；不吻合時 ns 依序為 1, 2, 3…，consistent = false。
   */
  function assignOrders(means) {
    const m = means.length;
    if (m === 0) return { ns: [], h: NaN, consistent: false };
    if (m === 1) return { ns: [1], h: NaN, consistent: true };
    let d = Infinity;
    for (let i = 1; i < m; i++) d = Math.min(d, means[i] - means[i - 1]);
    if (!(d > 0)) return { ns: means.map(function (_, i) { return i + 1; }), h: NaN, consistent: false };
    for (let k = 1; k <= 4; k++) {
      const h = d / k;
      let ok = true;
      const ns = means.map(function (L) {
        const u = L / h + 0.5, n = Math.round(u);
        // e > 0 使 L/h + ½ 略小於整數；容許 0.25（e 最大約 1.5 cm，h 最小約 11 cm）
        if (n < 1 || Math.abs(u - n) > 0.25) ok = false;
        return n;
      });
      for (let i = 1; i < m && ok; i++) if (ns[i] <= ns[i - 1]) ok = false;
      if (ok) return { ns: ns, h: h, consistent: true };
    }
    return { ns: means.map(function (_, i) { return i + 1; }), h: d, consistent: false };
  }
  /** 最小平方直線 y = a x + b */
  function fitLine(xs, ys) {
    const n = xs.length;
    if (n < 2) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
    const den = n * sxx - sx * sx;
    if (!(Math.abs(den) > 0)) return null;
    const a = (n * sxy - sx * sy) / den, b = (sy - a * sx) / n;
    let ss = 0;
    for (let i = 0; i < n; i++) { const r = ys[i] - (a * xs[i] + b); ss += r * r; }
    return { slope: a, intercept: b, rms: Math.sqrt(ss / n) };
  }
  /** 通過原點的最小平方直線 y = a x（λ–1/f 圖：斜率 = v） */
  function fitThroughOrigin(xs, ys) {
    let sxx = 0, sxy = 0;
    for (let i = 0; i < xs.length; i++) { sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
    return sxx > 0 ? sxy / sxx : NaN;
  }
  /**
   * 一組讀數（同一支音叉、同一室溫、同一支管）的完整分析。
   * readings：水面位置讀數（m）；f 為音叉頻率（不知道時傳 NaN）；Tc 室溫；r 管內半徑。
   */
  function analyze(readings, f, Tc, r) {
    const cl = cluster(readings);
    const means = cl.map(function (c) { return c.mean; });
    const ord = assignOrders(means);
    const out = {
      clusters: cl, means: means, ns: ord.ns, consistent: ord.consistent, count: cl.length,
      f: f, T: Tc, r: r, vTheory: speedOfSound(Tc), vLinear: speedLinear(Tc), eTheory: endCorrection(r),
      lambda: NaN, v: NaN, e: NaN, errPct: NaN, lambda2: NaN, v2: NaN, err2Pct: NaN, vNaive: NaN, errNaivePct: NaN,
      slope: NaN, intercept: NaN, rms: NaN, L1: means.length ? means[0] : NaN
    };
    if (cl.length >= 1 && ord.ns[0] === 1 && isFinite(f)) {
      out.vNaive = 4 * f * means[0];          // 只用第一個共鳴、忽略管口修正
      out.errNaivePct = (out.vNaive - out.vTheory) / out.vTheory * 100;
    }
    if (cl.length >= 2) {
      const fit = fitLine(ord.ns, means);
      out.slope = fit.slope; out.intercept = fit.intercept; out.rms = fit.rms;
      out.lambda = 2 * fit.slope;
      out.e = -fit.intercept - out.lambda / 4;
      out.lambda2 = 2 * (means[1] - means[0]) / (ord.ns[1] - ord.ns[0]); // 課本：λ = 2(L2 − L1)
      if (isFinite(f)) {
        out.v = f * out.lambda;
        out.errPct = (out.v - out.vTheory) / out.vTheory * 100;
        out.v2 = f * out.lambda2;
        out.err2Pct = (out.v2 - out.vTheory) / out.vTheory * 100;
      }
      out.fFromTheory = out.vTheory / out.lambda; // 未知頻率：f = v(T)/λ
    }
    return out;
  }

  const api = {
    T0: T0, V0: V0, END_K: END_K, RHO_W: RHO_W, WALL_K: WALL_K,
    TUBE_LEN: TUBE_LEN, L_MIN: L_MIN, L_MAX: L_MAX, CLUSTER_TOL: CLUSTER_TOL,
    speedOfSound: speedOfSound, speedLinear: speedLinear, wavelength: wavelength, endCorrection: endCorrection,
    resonanceLength: resonanceLength, resonances: resonances,
    mouthReflection: mouthReflection, wallAttenuation: wallAttenuation, roundTripKeep: roundTripKeep,
    gain: gain, levelDb: levelDb, peakDb: peakDb, nearestResonance: nearestResonance,
    displacementShape: displacementShape, nodesAndAntinodes: nodesAndAntinodes,
    roundMm: roundMm, cluster: cluster, assignOrders: assignOrders, fitLine: fitLine,
    fitThroughOrigin: fitThroughOrigin, analyze: analyze
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ResonanceCore = api;
})(typeof window !== 'undefined' ? window : this);
