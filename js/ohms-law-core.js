/*
 * ohms-law-core.js — 「歐姆定律與電路」課本實驗的物理核心（與畫面無關，Node 可直接 require）
 *
 * 單位一律 SI：電壓 V、電流 A、電阻 Ω、功率 W、溫度 K、長度 m。
 *
 * 實驗電路（串聯迴路，傳統電流方向）：
 *   電源正極 → 可變電阻箱 R箱 → 毫安培計（內電阻 rA）→ 待測元件 → 電源負極
 *   伏特計（內電阻 rV）接在：
 *     外接法 'ext'（安培計外接法）：只跨在待測元件兩端 → 量到的電壓是元件的真實電壓，但電流多算了伏特計分走的 IV
 *     內接法 'int'（安培計內接法）：跨在「安培計＋待測元件」兩端 → 量到的電流是真實電流，但電壓多算了安培計上的 I rA
 *
 * 節點編號：0 = 電源負極（接地，0 V）、1 = 電動勢正端（內電阻之前）、2 = 電源輸出端、3 = 電阻箱與安培計之間、
 *          4 = 安培計與待測元件之間。
 * 解法：修正節點分析（MNA：理想電壓源多一個未知電流），部分選主元高斯消去，精確解。
 * 燈泡（非歐姆元件）：鎢絲電阻 R = R0 (T/T0)^1.2，穩定時電功率 = 散熱功率（傳導 + 輻射）。
 *   把電路其餘部分化成戴維寧等效（Vth、Rth），從室溫往上找第一個平衡溫度（燈絲由冷變熱時實際到達的狀態）。
 */
(function (root) {
  'use strict';

  // ======================= 器材資料 =======================
  /** 材料在 20 °C 的電阻率（Ω·m） */
  const RHO = { Cu: 1.7e-8, NiCr: 1.5e-6 };
  /** 繞在線軸上的待測導線：材料、直徑 d（m）、長度 L（m） */
  const WIRES = {
    a: { mat: 'Cu', d: 0.28e-3, L: 10 },
    b: { mat: 'Cu', d: 0.14e-3, L: 10 },
    c: { mat: 'Cu', d: 0.28e-3, L: 20 },
    d: { mat: 'Cu', d: 0.14e-3, L: 20 },
    e: { mat: 'NiCr', d: 0.14e-3, L: 10 }
  };
  /** 導線電阻 R = ρL/A */
  function wireR(w) { return RHO[w.mat] * w.L / (Math.PI * w.d * w.d / 4); }

  /** 碳膜電阻：色環 棕黑棕金 = 100 Ω ±5%，這一顆實際是 98.6 Ω */
  const CARBON = { nominal: 100, actual: 98.6 };
  /** 神秘電阻 X 的候選標示值（E12 系列）；實際值在標示值 ±4% 內 */
  const E12_X = [47, 56, 68, 82, 100, 120, 150, 180, 220, 270, 330, 390, 470, 560, 680];
  function mysteryX(rng) {
    rng = rng || Math.random;
    const nominal = E12_X[Math.min(E12_X.length - 1, Math.floor(rng() * E12_X.length))];
    const actual = Math.round(nominal * (1 + (rng() * 2 - 1) * 0.04) * 10) / 10;
    return { nominal: nominal, actual: actual };
  }
  /** 色環顏色代號（0–9） */
  const BAND_NAMES = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white'];
  /** 標示值 → 四環色碼 [第一位, 第二位, 倍數, 誤差]（只處理 10 Ω 以上的整數值） */
  function colorBands(nominal) {
    const s = String(Math.round(nominal));
    const d1 = +s[0], d2 = +(s[1] || 0), mult = s.length - 2;
    return [BAND_NAMES[d1], BAND_NAMES[d2], BAND_NAMES[Math.max(0, mult)], 'gold'];
  }

  /** 小燈泡（額定 2.5 V、0.3 A）的鎢絲模型 */
  const LAMP = (function () {
    const L = { Vr: 2.5, Ir: 0.3, Thot: 2400, T0: 300, n: 1.2, condFrac: 0.15, Tburn: 3200 };
    L.Rhot = L.Vr / L.Ir;                                   // 額定時的熱電阻 8.33 Ω
    L.R0 = L.Rhot / Math.pow(L.Thot / L.T0, L.n);           // 室溫（冷）電阻約 0.69 Ω
    const P = L.Vr * L.Ir;                                  // 額定功率 0.75 W
    L.Kc = P * L.condFrac / (L.Thot - L.T0);                // 經由支架與引線傳導散熱（W/K）
    L.Kr = P * (1 - L.condFrac) / (Math.pow(L.Thot, 4) - Math.pow(L.T0, 4)); // 輻射散熱（W/K^4）
    return L;
  })();
  function lampR(T) { return LAMP.R0 * Math.pow(T / LAMP.T0, LAMP.n); }
  function lampLoss(T) { return LAMP.Kc * (T - LAMP.T0) + LAMP.Kr * (Math.pow(T, 4) - Math.pow(LAMP.T0, 4)); }
  /**
   * 燈絲在戴維寧等效電路（Vth、Rth）上的穩定狀態。
   * 從室溫開始升溫：電功率 > 散熱就繼續變熱，第一個平衡點就是實際到達的溫度。超過 Tburn 則燒斷。
   */
  function lampSteady(Vth, Rth) {
    const T0 = LAMP.T0;
    const f = function (T) { const R = lampR(T); const I = Vth / (Rth + R); return I * I * R - lampLoss(T); };
    if (!(Math.abs(Vth) > 0)) return { T: T0, R: lampR(T0), burnt: false };
    const dT = 2;
    let lo = T0, hi = -1;
    for (let T = T0 + dT; T <= LAMP.Tburn + dT; T += dT) {
      if (f(T) <= 0) { hi = T; lo = T - dT; break; }
    }
    if (hi < 0) return { T: LAMP.Tburn, R: lampR(LAMP.Tburn), burnt: true };
    for (let i = 0; i < 60; i++) {
      const m = (lo + hi) / 2;
      if (f(m) > 0) lo = m; else hi = m;
    }
    const T = (lo + hi) / 2;
    return { T: T, R: lampR(T), burnt: T >= LAMP.Tburn };
  }

  /** 指針式毫安培計：三個檔位，滿刻度時兩端電壓 0.1 V（所以 rA = 0.1 V ÷ 滿刻度電流）；刻度 50 小格 */
  const AMMETER = { burden: 0.1, ranges: [0.005, 0.05, 0.5], divs: 50 };
  /** 指針式伏特計：1000 Ω/V（rV = 1000 Ω/V × 滿刻度電壓）；刻度 30 小格 */
  const VOLTMETER = { ohmsPerVolt: 1000, ranges: [3, 15], divs: 30 };
  function ammeterR(fs) { return AMMETER.burden / fs; }
  function voltmeterR(fs) { return VOLTMETER.ohmsPerVolt * fs; }
  /** 直流電源供應器：電動勢 0–15 V，內電阻（含導線）0.5 Ω */
  const SUPPLY = { max: 15, r: 0.5 };
  /** 可變電阻箱（十進位，四個旋鈕）：0–9999 Ω */
  const BOX_MAX = 9999;

  // ======================= 線性代數與電路 =======================
  /** 解 A x = b（部分選主元高斯消去）；奇異時回傳 null */
  function solveLinear(A, b) {
    const n = b.length;
    const M = A.map(function (row, i) { return row.slice().concat([b[i]]); });
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      if (Math.abs(M[piv][col]) < 1e-300) return null;
      if (piv !== col) { const t = M[piv]; M[piv] = M[col]; M[col] = t; }
      for (let r = col + 1; r < n; r++) {
        const f = M[r][col] / M[col][col];
        if (f === 0) continue;
        for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
      }
    }
    const x = new Array(n);
    for (let r = n - 1; r >= 0; r--) {
      let s = M[r][n];
      for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
      x[r] = s / M[r][r];
    }
    return x;
  }

  /**
   * 修正節點分析。nodes：節點數（0 為接地）；elems：
   *   { type: 'R', a, b, R }（R = Infinity 視為斷路；R = 0 自動改成 0 V 電壓源）
   *   { type: 'V', a, b, E }：理想電壓源，V(b) − V(a) = E，電流 I 由 b 經外電路流回 a 為正（即由 a 經電源內部流到 b）
   * 回傳 { V: 各節點電位, I: 各元件電流（a → b 方向，電壓源為電源內部 a → b） }，奇異時 null。
   */
  function mna(nodes, elems) {
    const list = elems.map(function (e) { return e.type === 'R' && e.R === 0 ? { type: 'V', a: e.a, b: e.b, E: 0, from: e } : e; });
    const nv = list.filter(function (e) { return e.type === 'V'; }).length;
    const N = nodes - 1 + nv;
    const A = []; const b = [];
    for (let i = 0; i < N; i++) { A.push(new Array(N).fill(0)); b.push(0); }
    const idx = function (n) { return n - 1; }; // 節點 n 的未知數位置（0 為接地，不列）
    let k = nodes - 1;
    const vIndex = [];
    list.forEach(function (e, j) {
      if (e.type === 'R') {
        if (!isFinite(e.R)) return;
        const g = 1 / e.R;
        if (e.a) A[idx(e.a)][idx(e.a)] += g;
        if (e.b) A[idx(e.b)][idx(e.b)] += g;
        if (e.a && e.b) { A[idx(e.a)][idx(e.b)] -= g; A[idx(e.b)][idx(e.a)] -= g; }
      } else {
        // 未知電流 Iv：由 a 經電源內部流到 b（從 b 流出到外電路）
        vIndex[j] = k;
        if (e.b) { A[idx(e.b)][k] -= 1; A[k][idx(e.b)] += 1; }
        if (e.a) { A[idx(e.a)][k] += 1; A[k][idx(e.a)] -= 1; }
        b[k] = e.E;
        k++;
      }
    });
    const x = solveLinear(A, b);
    if (!x) return null;
    const V = [0];
    for (let n = 1; n < nodes; n++) V.push(x[idx(n)]);
    const I = list.map(function (e, j) {
      if (e.type === 'R') return isFinite(e.R) ? (V[e.a] - V[e.b]) / e.R : 0;
      return x[vIndex[j]];
    });
    return { V: V, I: I };
  }

  /** 實驗電路的線性部分：待測元件以固定電阻 Rx 代入（Infinity = 斷路、0 = 短路） */
  function benchLinear(cfg, Rx) {
    const elems = [
      { type: 'V', a: 0, b: 1, E: cfg.emf },
      { type: 'R', a: 1, b: 2, R: cfg.rs },
      { type: 'R', a: 2, b: 3, R: cfg.Rbox },
      { type: 'R', a: 3, b: 4, R: cfg.rA },
      { type: 'R', a: 4, b: 0, R: Rx },
      { type: 'R', a: cfg.method === 'int' ? 3 : 4, b: 0, R: cfg.rV }
    ];
    return mna(5, elems);
  }

  /**
   * 解整個實驗電路。cfg = { emf, rs, Rbox, rA, rV, method: 'ext'|'int', elem }
   *   elem = { kind: 'R', R } 歐姆元件；{ kind: 'lamp' } 燈泡；{ kind: 'open' } 斷路（例如燒斷的燈泡）
   * 回傳：
   *   IA 安培計電流、VV 伏特計電壓（兩個電表「真正」受到的量）、IV 伏特計電流、
   *   IR、VR 待測元件的真實電流與電壓、VA 安培計兩端電壓、Isrc 電源電流、Vterm 電源端電壓、
   *   Rx 元件此刻的電阻、PR 元件功率、T 燈絲溫度（燈泡才有）、burn（燈絲會燒斷）
   */
  function bench(cfg) {
    const c = Object.assign({ rs: SUPPLY.r, method: 'ext' }, cfg);
    const el = c.elem || { kind: 'R', R: 10 };
    let Rx = el.kind === 'R' ? el.R : Infinity;
    let T = null, burn = false;
    if (el.kind === 'lamp') {
      const open = benchLinear(c, Infinity), shorted = benchLinear(c, 0);
      const Vth = open.V[4];
      const Isc = shorted.I[4];
      const Rth = Math.abs(Isc) > 0 ? Vth / Isc : Infinity;
      const st = lampSteady(Vth, Rth);
      T = st.T; Rx = st.R; burn = st.burnt;
    }
    const s = benchLinear(c, Rx);
    if (!s) return { ok: false };
    const V = s.V;
    const IA = (V[3] - V[4]) / c.rA;
    const top = c.method === 'int' ? V[3] : V[4];
    const IR = isFinite(Rx) ? V[4] / Rx : 0;
    return {
      ok: true, V: V,
      Isrc: s.I[1], Vterm: V[2],
      IA: IA, VA: V[3] - V[4],
      VV: top, IV: top / c.rV,
      IR: IR, VR: V[4], Rx: Rx, PR: IR * V[4],
      Vbox: V[2] - V[3],
      T: T, burn: burn
    };
  }

  /** 系統誤差的理論值：此接法量到的 R′ = V讀數 / I讀數 */
  function predictedR(method, R, rA, rV) {
    return method === 'int' ? R + rA : R * rV / (R + rV);
  }
  /** 兩種接法相對誤差大小相同的電阻：rA/R = R/(R + rV) → R² − rA R − rA rV = 0 */
  function criticalR(rA, rV) { return (rA + Math.sqrt(rA * rA + 4 * rA * rV)) / 2; }

  // ======================= 數據分析 =======================
  /**
   * 通過原點的最佳直線 y = k x（使 y 的殘差平方和最小）：k = Σxy / Σx²
   * 另外回傳含截距的最小平方直線（檢查是否通過原點）與 R²（以 y 的平均值為基準）。
   */
  function fitOrigin(xs, ys) {
    const n = xs.length;
    if (!n) return null;
    let sxx = 0, sxy = 0, sx = 0, sy = 0;
    for (let i = 0; i < n; i++) { sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; sx += xs[i]; sy += ys[i]; }
    if (!(sxx > 0)) return null;
    const k = sxy / sxx;
    const my = sy / n;
    let ssr = 0, sst = 0, maxRel = 0;
    for (let i = 0; i < n; i++) {
      const yf = k * xs[i];
      ssr += (ys[i] - yf) * (ys[i] - yf);
      sst += (ys[i] - my) * (ys[i] - my);
      if (Math.abs(yf) > 0) maxRel = Math.max(maxRel, Math.abs(ys[i] - yf) / Math.abs(yf));
    }
    let slope = NaN, icpt = NaN;
    const den = n * sxx - sx * sx;
    if (n >= 2 && Math.abs(den) > 1e-300) { slope = (n * sxy - sx * sy) / den; icpt = (sy - slope * sx) / n; }
    return { n: n, k: k, r2: sst > 0 ? 1 - ssr / sst : (ssr === 0 ? 1 : 0), maxRel: maxRel, slope: slope, icpt: icpt };
  }

  // ======================= 讀數 =======================
  /** 標準常態亂數（Box–Muller） */
  function gauss(rng) {
    rng = rng || Math.random;
    let u = 0; while (u <= 1e-12) u = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  }
  /**
   * 指針位置（以「量」表示）：真實值 + 零點誤差（小格數 × 每小格的值）
   * 讀數：理想 → 指針位置本身；含誤差 → 加上估讀誤差（標準差 sigma 小格）後，取到最接近的半小格。
   * 回傳 { needle, reading, over }；over：超過滿刻度（指針打到底），不能讀。
   */
  function readMeter(trueVal, fs, divs, opts) {
    opts = opts || {};
    const dv = fs / divs;
    const needle = trueVal + (opts.zero || 0) * dv;
    const over = needle > fs * 1.01;
    let reading = needle;
    if (!opts.ideal) {
      const est = needle / dv + (opts.sigma == null ? 0.15 : opts.sigma) * gauss(opts.rng);
      reading = Math.round(est * 2) / 2 * dv;
    }
    reading = Math.max(0, Math.min(fs, reading));
    return { needle: needle, reading: reading, over: over, div: dv };
  }

  /**
   * 數位三用電表 Ω 檔（3½ 位，最大顯示 1999，自動換檔）。
   * 理想：只有顯示位數的限制；含誤差：± (0.8% + 2 個字) 的均勻隨機誤差。
   */
  const DMM_RANGES = [200, 2000, 20000, 200000, 2000000];
  function multimeter(R, opts) {
    opts = opts || {};
    if (!isFinite(R)) return { over: true, value: Infinity, range: DMM_RANGES[DMM_RANGES.length - 1], res: NaN, digits: 1 };
    let range = DMM_RANGES[DMM_RANGES.length - 1];
    for (let i = 0; i < DMM_RANGES.length; i++) if (R < DMM_RANGES[i] * 0.9995) { range = DMM_RANGES[i]; break; }
    const res = range / 2000;
    let v = R;
    if (!opts.ideal) {
      const rng = opts.rng || Math.random;
      v = R * (1 + 0.008 * (rng() * 2 - 1)) + 2 * res * (rng() * 2 - 1);
    }
    v = Math.max(0, Math.round(v / res) * res);
    return { over: v >= range, value: v, range: range, res: res };
  }

  const api = {
    RHO: RHO, WIRES: WIRES, wireR: wireR, CARBON: CARBON, E12_X: E12_X, mysteryX: mysteryX, colorBands: colorBands,
    LAMP: LAMP, lampR: lampR, lampLoss: lampLoss, lampSteady: lampSteady,
    AMMETER: AMMETER, VOLTMETER: VOLTMETER, ammeterR: ammeterR, voltmeterR: voltmeterR, SUPPLY: SUPPLY, BOX_MAX: BOX_MAX,
    solveLinear: solveLinear, mna: mna, bench: bench, benchLinear: benchLinear,
    predictedR: predictedR, criticalR: criticalR, fitOrigin: fitOrigin,
    gauss: gauss, readMeter: readMeter, multimeter: multimeter, DMM_RANGES: DMM_RANGES
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OhmsLawCore = api;
})(typeof window !== 'undefined' ? window : this);
