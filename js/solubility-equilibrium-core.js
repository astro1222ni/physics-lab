/*
 * 溶解平衡與 Ksp：物理核心（不碰 DOM；瀏覽器是 window.SolubilityCore，Node 用 require）
 *
 * 模型（25 °C、理想溶液：活性 = 濃度，不考慮離子強度、錯離子、水解）
 *   燒杯裡每一種離子的總莫耳數 N_i（溶液中＋沉澱中），溶液體積 V（L）。
 *   每一種難溶鹽 k（例如 Ag2CrO4 → 2 Ag+ + CrO4 2−）沉澱了 p_k mol，
 *   溶液中離子 i 的莫耳數 n_i = N_i − Σ_k ν_ik p_k，濃度 c_i = n_i / V。
 *   離子積 Q_k = Π_i c_i^ν_ik。平衡條件（互補條件）：
 *     p_k > 0  ⇒  Q_k = Ksp_k（飽和、沉澱與溶液共存）
 *     p_k = 0  ⇒  Q_k ≤ Ksp_k（未飽和或剛好飽和）
 *   這正是凸函數 G(p) = Σ_i n_i (ln(n_i/V) − 1) + Σ_k p_k ln Ksp_k 在 p ≥ 0 上的最小值
 *   （∂G/∂p_k = ln Ksp_k − ln Q_k），所以解是唯一的；
 *   用逐一座標的高斯—賽德爾：每次只調一種沉澱，在 log(剩下的限量離子) 上二分到 Q_k = Ksp_k，反覆掃到不再變化。
 *
 * Ksp 數據（25 °C）：CRC Handbook of Chemistry and Physics（Solubility Product Constants）；
 *   PbCrO4 用 OpenStax Chemistry 2e 附錄 J。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SolubilityCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 原子量（IUPAC 2021 常用值）
  const AW = { Ag: 107.868, Pb: 207.2, Ba: 137.327, Ca: 40.078, Na: 22.990, K: 39.098, N: 14.007, O: 15.999, Cl: 35.453, Br: 79.904, I: 126.904, F: 18.998, Cr: 51.996, S: 32.06 };

  // 離子：z 電荷、M 莫耳質量、f 化學式（純 ASCII，畫面另外排下標與電荷）、col 溶液中的顏色（null = 無色）
  const ION = {
    Ag: { z: 1, M: AW.Ag, zh: '銀離子', en: 'silver ion' },
    Pb: { z: 2, M: AW.Pb, zh: '鉛離子', en: 'lead(II) ion' },
    Ba: { z: 2, M: AW.Ba, zh: '鋇離子', en: 'barium ion' },
    Ca: { z: 2, M: AW.Ca, zh: '鈣離子', en: 'calcium ion' },
    Cl: { z: -1, M: AW.Cl, zh: '氯離子', en: 'chloride ion' },
    Br: { z: -1, M: AW.Br, zh: '溴離子', en: 'bromide ion' },
    I: { z: -1, M: AW.I, zh: '碘離子', en: 'iodide ion' },
    F: { z: -1, M: AW.F, zh: '氟離子', en: 'fluoride ion' },
    CrO4: { z: -2, M: AW.Cr + 4 * AW.O, zh: '鉻酸根離子', en: 'chromate ion', col: [236, 196, 30] },
    SO4: { z: -2, M: AW.S + 4 * AW.O, zh: '硫酸根離子', en: 'sulfate ion' },
    Na: { z: 1, M: AW.Na, zh: '鈉離子', en: 'sodium ion', spectator: true },
    K: { z: 1, M: AW.K, zh: '鉀離子', en: 'potassium ion', spectator: true },
    NO3: { z: -1, M: AW.N + 3 * AW.O, zh: '硝酸根離子', en: 'nitrate ion', spectator: true }
  };
  const CATIONS = ['Ag', 'Pb', 'Ba', 'Ca'];
  const ANIONS = ['Cl', 'Br', 'I', 'F', 'CrO4', 'SO4'];

  // 難溶鹽：ions 化學計量、Ksp（25 °C）、顏色 rgb
  const SOLID = {
    AgCl: { ions: { Ag: 1, Cl: 1 }, Ksp: 1.77e-10, rgb: [246, 246, 242], zh: '氯化銀', en: 'silver chloride' },
    AgBr: { ions: { Ag: 1, Br: 1 }, Ksp: 5.35e-13, rgb: [240, 232, 190], zh: '溴化銀', en: 'silver bromide' },
    AgI: { ions: { Ag: 1, I: 1 }, Ksp: 8.52e-17, rgb: [238, 214, 112], zh: '碘化銀', en: 'silver iodide' },
    Ag2CrO4: { ions: { Ag: 2, CrO4: 1 }, Ksp: 1.12e-12, rgb: [164, 52, 40], zh: '鉻酸銀', en: 'silver chromate' },
    Ag2SO4: { ions: { Ag: 2, SO4: 1 }, Ksp: 1.20e-5, rgb: [244, 244, 240], zh: '硫酸銀', en: 'silver sulfate' },
    PbCl2: { ions: { Pb: 1, Cl: 2 }, Ksp: 1.70e-5, rgb: [244, 244, 240], zh: '氯化鉛', en: 'lead(II) chloride' },
    PbBr2: { ions: { Pb: 1, Br: 2 }, Ksp: 6.60e-6, rgb: [244, 242, 232], zh: '溴化鉛', en: 'lead(II) bromide' },
    PbI2: { ions: { Pb: 1, I: 2 }, Ksp: 9.8e-9, rgb: [250, 200, 20], zh: '碘化鉛', en: 'lead(II) iodide' },
    PbF2: { ions: { Pb: 1, F: 2 }, Ksp: 3.3e-8, rgb: [244, 244, 240], zh: '氟化鉛', en: 'lead(II) fluoride' },
    PbCrO4: { ions: { Pb: 1, CrO4: 1 }, Ksp: 2.8e-13, rgb: [246, 190, 20], zh: '鉻酸鉛', en: 'lead(II) chromate' },
    PbSO4: { ions: { Pb: 1, SO4: 1 }, Ksp: 2.53e-8, rgb: [246, 246, 244], zh: '硫酸鉛', en: 'lead(II) sulfate' },
    BaF2: { ions: { Ba: 1, F: 2 }, Ksp: 1.84e-7, rgb: [246, 246, 244], zh: '氟化鋇', en: 'barium fluoride' },
    BaCrO4: { ions: { Ba: 1, CrO4: 1 }, Ksp: 1.17e-10, rgb: [246, 214, 60], zh: '鉻酸鋇', en: 'barium chromate' },
    BaSO4: { ions: { Ba: 1, SO4: 1 }, Ksp: 1.08e-10, rgb: [248, 248, 248], zh: '硫酸鋇', en: 'barium sulfate' },
    CaF2: { ions: { Ca: 1, F: 2 }, Ksp: 3.45e-11, rgb: [246, 246, 246], zh: '氟化鈣', en: 'calcium fluoride' },
    CaSO4: { ions: { Ca: 1, SO4: 1 }, Ksp: 4.93e-5, rgb: [248, 248, 246], zh: '硫酸鈣', en: 'calcium sulfate' }
  };
  Object.keys(SOLID).forEach(function (k) {
    const s = SOLID[k];
    s.M = Object.keys(s.ions).reduce(function (m, i) { return m + s.ions[i] * ION[i].M; }, 0);
    s.nu = Object.keys(s.ions).reduce(function (a, i) { return a + s.ions[i]; }, 0);
  });

  // 試劑溶液（可溶鹽）：每 1 mol 溶質給出的離子
  const SOLN = {
    AgNO3: { ions: { Ag: 1, NO3: 1 }, zh: '硝酸銀', en: 'silver nitrate' },
    PbNO32: { ions: { Pb: 1, NO3: 2 }, zh: '硝酸鉛', en: 'lead(II) nitrate', f: 'Pb(NO3)2' },
    BaNO32: { ions: { Ba: 1, NO3: 2 }, zh: '硝酸鋇', en: 'barium nitrate', f: 'Ba(NO3)2' },
    CaNO32: { ions: { Ca: 1, NO3: 2 }, zh: '硝酸鈣', en: 'calcium nitrate', f: 'Ca(NO3)2' },
    NaCl: { ions: { Na: 1, Cl: 1 }, zh: '氯化鈉', en: 'sodium chloride' },
    NaBr: { ions: { Na: 1, Br: 1 }, zh: '溴化鈉', en: 'sodium bromide' },
    KI: { ions: { K: 1, I: 1 }, zh: '碘化鉀', en: 'potassium iodide' },
    NaF: { ions: { Na: 1, F: 1 }, zh: '氟化鈉', en: 'sodium fluoride' },
    K2CrO4: { ions: { K: 2, CrO4: 1 }, zh: '鉻酸鉀', en: 'potassium chromate' },
    Na2SO4: { ions: { Na: 2, SO4: 1 }, zh: '硫酸鈉', en: 'sodium sulfate' }
  };
  Object.keys(SOLN).forEach(function (k) { if (!SOLN[k].f) SOLN[k].f = k; });

  /** 只在純水中溶解時的莫耳溶解度 s（M）：Ksp = Π (ν_i s)^ν_i */
  function molarSolubility(name) {
    const s = SOLID[name];
    let prod = 1;
    Object.keys(s.ions).forEach(function (i) { prod *= Math.pow(s.ions[i], s.ions[i]); });
    return Math.pow(s.Ksp / prod, 1 / s.nu);
  }
  /** 離子積 Q（c：各離子濃度 M） */
  function ionProduct(name, c) {
    const s = SOLID[name];
    let q = 1;
    for (const i in s.ions) q *= Math.pow(Math.max(0, c[i] || 0), s.ions[i]);
    return q;
  }
  /** log10 Q（濃度為 0 時傳回 −Infinity） */
  function logQ(name, c) {
    const s = SOLID[name];
    let q = 0;
    for (const i in s.ions) { const v = c[i] || 0; if (v <= 0) return -Infinity; q += s.ions[i] * Math.log10(v); }
    return q;
  }

  /** 和這一組離子有關的難溶鹽（兩種離子都有才算） */
  function relevantSolids(N) {
    return Object.keys(SOLID).filter(function (k) {
      const s = SOLID[k];
      return Object.keys(s.ions).every(function (i) { return (N[i] || 0) > 0; });
    });
  }

  /** 座標下降：每次只調一種沉澱到 Q = Ksp（當牛頓法的起點，也是保底） */
  function coordSweeps(ks, N, V, p, n, maxSweeps) {
    for (let sweep = 0; sweep < maxSweeps; sweep++) {
      let change = 0;
      for (let a = 0; a < ks.length; a++) {
        const k = ks[a], s = SOLID[k], ions = Object.keys(s.ions);
        const base = {};
        ions.forEach(function (i) { base[i] = n[i] + s.ions[i] * p[k]; });
        const lnK = Math.log(s.Ksp);
        let L = ions[0], hi = Infinity;
        ions.forEach(function (i) { const h = base[i] / s.ions[i]; if (h < hi) { hi = h; L = i; } });
        const f = function (pp) {
          let sum = -lnK;
          for (let t = 0; t < ions.length; t++) {
            const i = ions[t];
            sum += s.ions[i] * Math.log(Math.max(base[i] - s.ions[i] * pp, 1e-300) / V);
          }
          return sum;
        };
        let np = 0;
        if (hi > 0 && f(0) > 0) {
          const nuL = s.ions[L];
          let x0 = Math.log(base[L]), x1 = Math.log(base[L]) - 720;
          for (let it = 0; it < 90; it++) {
            const xm = 0.5 * (x0 + x1);
            if (f((base[L] - Math.exp(xm)) / nuL) > 0) x0 = xm; else x1 = xm;
          }
          np = Math.max(0, (base[L] - Math.exp(0.5 * (x0 + x1))) / nuL);
        }
        const d = np - p[k];
        if (d !== 0) {
          change = Math.max(change, Math.abs(d) / Math.max(np, p[k], 1e-30));
          ions.forEach(function (i) { n[i] = Math.max(0, base[i] - s.ions[i] * np); });
          p[k] = np;
        }
      }
      if (change < 1e-13) return true;
    }
    return false;
  }

  /** 高斯消去法（部分選主元）解 A x = b；奇異時傳回 null */
  function solveLin(A, b) {
    const m = b.length;
    for (let c = 0; c < m; c++) {
      let piv = c, best = Math.abs(A[c][c]);
      for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > best) { best = Math.abs(A[r][c]); piv = r; }
      if (!(best > 1e-300)) return null;
      if (piv !== c) { const t = A[c]; A[c] = A[piv]; A[piv] = t; const tb = b[c]; b[c] = b[piv]; b[piv] = tb; }
      for (let r = c + 1; r < m; r++) {
        const f = A[r][c] / A[c][c];
        if (f === 0) continue;
        for (let k = c; k < m; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    const x = new Array(m);
    for (let r = m - 1; r >= 0; r--) {
      let s = b[r];
      for (let k = r + 1; k < m; k++) s -= A[r][k] * x[k];
      x[r] = s / A[r][r];
    }
    return x;
  }

  /**
   * 固定「哪幾種鹽有沉澱」（act）時，用牛頓法解：未知數是各離子在溶液中的 ln n_i 與 act 的 p_k；
   * 方程式：質量守恆 n_i + Σ ν_ik p_k = N_i（除以 N_i 正規化）、飽和 Σ ν_ik ln(n_i/V) = ln Ksp_k。
   * 傳回 { ok, ln, p }；矩陣奇異（飽和條件線性相依）或不收斂時 ok = false。
   */
  function solveFixed(act, ionsL, N, V, ln0, p0) {
    const lnV = Math.log(V);
    const ln = Object.assign({}, ln0), p = {};
    act.forEach(function (k) { p[k] = p0[k] || 0; });
    const mI = ionsL.length, mA = act.length, m = mI + mA;
    const resid = function (lnx, pp) {
      const R = new Array(m).fill(0);
      ionsL.forEach(function (i, r) {
        let tot = Math.exp(lnx[i]);
        act.forEach(function (k) { tot += (SOLID[k].ions[i] || 0) * pp[k]; });
        R[r] = (tot - N[i]) / N[i];
      });
      act.forEach(function (k, c) {
        let g = -Math.log(SOLID[k].Ksp);
        for (const i in SOLID[k].ions) g += SOLID[k].ions[i] * (lnx[i] - lnV);
        R[mI + c] = g;
      });
      return R;
    };
    const sq = function (R) { return R.reduce(function (a, v) { return a + v * v; }, 0); };
    let R = resid(ln, p), f = sq(R);
    for (let it = 0; it < 300; it++) {
      const norm = R.reduce(function (a, v) { return Math.max(a, Math.abs(v)); }, 0);
      if (norm < 1e-12) return { ok: true, ln: ln, p: p };
      const J = [];
      for (let r = 0; r < m; r++) J.push(new Array(m).fill(0));
      ionsL.forEach(function (i, r) {
        J[r][r] = Math.exp(ln[i]) / N[i];
        act.forEach(function (k, c) { J[r][mI + c] = (SOLID[k].ions[i] || 0) / N[i]; });
      });
      act.forEach(function (k, c) { ionsL.forEach(function (i, col) { J[mI + c][col] = SOLID[k].ions[i] || 0; }); });
      const dx = solveLin(J, R.map(function (v) { return -v; }));
      if (!dx || dx.some(function (v) { return !isFinite(v); })) return { ok: false, singular: true };
      // ln n 一步最多變 6；殘差平方和沒變小就減半
      let big = 0;
      for (let r = 0; r < mI; r++) big = Math.max(big, Math.abs(dx[r]));
      let alpha = big > 6 ? 6 / big : 1, moved = false;
      for (let h = 0; h < 60; h++) {
        const ln2 = {}, p2 = {};
        ionsL.forEach(function (i, r) { ln2[i] = ln[i] + alpha * dx[r]; });
        act.forEach(function (k, c) { p2[k] = p[k] + alpha * dx[mI + c]; });
        const R2 = resid(ln2, p2), f2 = sq(R2);
        if (f2 < f) { Object.assign(ln, ln2); Object.assign(p, p2); R = R2; f = f2; moved = true; break; }
        alpha *= 0.5;
      }
      if (!moved) return { ok: R.reduce(function (a, v) { return Math.max(a, Math.abs(v)); }, 0) < 1e-9, ln: ln, p: p };
    }
    return { ok: false };
  }

  /** 這個解是不是真的平衡：沉澱量都 ≥ 0、沒沉澱的鹽都沒有過飽和 */
  function isEquilibrium(ks, act, sol, V) {
    const lnV = Math.log(V);
    if (act.some(function (k) { return sol.p[k] < -1e-18; })) return false;
    return ks.every(function (k) {
      if (act.indexOf(k) >= 0) return true;
      let lq = -Math.log(SOLID[k].Ksp);
      for (const i in SOLID[k].ions) lq += SOLID[k].ions[i] * (sol.ln[i] - lnV);
      return lq <= 1e-9;
    });
  }

  /**
   * 主動集合法：從「沒有沉澱」開始，每次加入最過飽和的一種鹽，沉澱量變負的就移出，直到滿足平衡條件。
   * 萬一卡住（飽和條件線性相依、或來回跳），就窮舉沉澱的組合（平衡解唯一，一定找得到；鹽 ≤ 12 種）。
   */
  function newtonActive(ks, ionsL, N, V, p, n) {
    const lnV = Math.log(V);
    let act = [];
    let ln = {};
    ionsL.forEach(function (i) { ln[i] = Math.log(N[i]); });
    let pp = {};
    const seen = {};
    for (let outer = 0; outer < 80; outer++) {
      const key = act.slice().sort().join(',');
      if (seen[key] > 2) break;
      seen[key] = (seen[key] || 0) + 1;
      const sol = solveFixed(act, ionsL, N, V, ln, pp);
      if (!sol.ok) break;
      ln = sol.ln; pp = sol.p;
      let neg = null;
      act.forEach(function (k) { if (pp[k] < 0 && (neg == null || pp[k] < pp[neg])) neg = k; });
      if (neg) { act.splice(act.indexOf(neg), 1); delete pp[neg]; continue; }
      let add = null, over = 1e-9;
      ks.forEach(function (k) {
        if (act.indexOf(k) >= 0) return;
        let lq = -Math.log(SOLID[k].Ksp);
        for (const i in SOLID[k].ions) lq += SOLID[k].ions[i] * (ln[i] - lnV);
        if (lq > over) { over = lq; add = k; }
      });
      if (add) { act.push(add); pp[add] = 0; continue; }
      ks.forEach(function (k) { p[k] = act.indexOf(k) >= 0 ? Math.max(0, pp[k]) : 0; });
      ionsL.forEach(function (i) { n[i] = Math.exp(ln[i]); });
      return true;
    }
    // 窮舉：照沉澱種數由少到多試
    if (ks.length > 12) return false;
    const subsets = [];
    for (let mask = 0; mask < (1 << ks.length); mask++) subsets.push(mask);
    subsets.sort(function (a, b) { return popcount(a) - popcount(b); });
    for (let s = 0; s < subsets.length; s++) {
      const a = ks.filter(function (k, j) { return subsets[s] & (1 << j); });
      const ln0 = {};
      ionsL.forEach(function (i) { ln0[i] = Math.log(N[i]); });
      const sol = solveFixed(a, ionsL, N, V, ln0, {});
      if (sol.ok && isEquilibrium(ks, a, sol, V)) {
        ks.forEach(function (k) { p[k] = a.indexOf(k) >= 0 ? Math.max(0, sol.p[k]) : 0; });
        ionsL.forEach(function (i) { n[i] = Math.exp(sol.ln[i]); });
        return true;
      }
    }
    return false;
  }
  function popcount(x) { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; }
  /**
   * 求平衡：N 每一種離子的總莫耳數（含已沉澱的），V 溶液體積（L）。
   * 傳回 { p: { 鹽: 沉澱 mol }, n: { 離子: 溶液中的 mol }, c: { 離子: M }, newton }
   * p0（可省略）：上一次的沉澱量，當作起點。
   * 先用座標下降；共用離子的幾種沉澱互相牽制、座標下降收斂太慢時，改用牛頓法收尾。
   */
  function equilibrate(N, V, p0) {
    const ks = relevantSolids(N);
    const p = {};
    ks.forEach(function (k) { p[k] = p0 && p0[k] > 0 ? p0[k] : 0; });
    const n = {};
    Object.keys(N).forEach(function (i) { n[i] = N[i] || 0; });
    ks.forEach(function (k) { for (const i in SOLID[k].ions) n[i] -= SOLID[k].ions[i] * p[k]; });
    if (Object.keys(n).some(function (i) { return n[i] < 0; })) {
      Object.keys(N).forEach(function (i) { n[i] = N[i] || 0; });
      ks.forEach(function (k) { p[k] = 0; });
    }
    let newton = false;
    // 座標下降每一步的變化很小，不代表已經到平衡：直接檢查互補條件，不夠準就交給牛頓法
    const kktOK = function () {
      const lnV = Math.log(V);
      return ks.every(function (k) {
        let lq = -Math.log(SOLID[k].Ksp);
        for (const i in SOLID[k].ions) lq += SOLID[k].ions[i] * (Math.log(Math.max(n[i], 1e-300)) - lnV);
        return p[k] > 0 ? Math.abs(lq) < 1e-9 : lq < 1e-9;
      });
    };
    if (ks.length && !(coordSweeps(ks, N, V, p, n, 60) && kktOK())) {
      const ionsL = [];
      ks.forEach(function (k) { for (const i in SOLID[k].ions) if (ionsL.indexOf(i) < 0) ionsL.push(i); });
      const p1 = Object.assign({}, p), n1 = Object.assign({}, n);
      newton = newtonActive(ks, ionsL, N, V, p1, n1);
      if (newton) {
        ks.forEach(function (k) { p[k] = p1[k] > 0 ? p1[k] : 0; });
        ionsL.forEach(function (i) { n[i] = n1[i]; });
      } else {
        coordSweeps(ks, N, V, p, n, 20000);
      }
    }
    const c = {};
    Object.keys(n).forEach(function (i) { c[i] = n[i] / V; });
    return { p: p, n: n, c: c, newton: newton };
  }
  /** 在含有共同離子（濃度 c0 M、不會沉澱的鹽提供）的溶液裡，鹽 name 的莫耳溶解度（數值解） */
  function solubilityWithCommonIon(name, ion, c0) {
    const s = SOLID[name], V = 1;
    // 加入大量固體，看溶進去多少
    const N = {};
    const big = 10 * Math.max(molarSolubility(name), 1e-3);
    for (const i in s.ions) N[i] = s.ions[i] * big;
    N[ion] = (N[ion] || 0) + c0 * V;
    const r = equilibrate(N, V);
    return big - (r.p[name] || 0);
  }

  /** 各離子的電荷平衡（給測試：所有試劑都是電中性的，Σ z n 應該為 0） */
  function chargeBalance(n) {
    let q = 0;
    Object.keys(n).forEach(function (i) { q += ION[i].z * n[i]; });
    return q;
  }

  // ======================= 燒杯（頁面與任務證明共用的狀態機） =======================
  const V_MAX = 250;     // 燒杯最多裝 250 mL
  const V_START = 50;    // 一開始 50 mL 純水
  const DROP = 0.05;     // 一滴 0.05 mL

  /** 新燒杯：V（mL）純水 */
  function createBeaker(V) {
    return { V: V == null ? V_START : V, N: {}, p: {}, c: {}, used: [], had: {}, agAtAgCl: null, sat: [], steps: 0 };
  }
  function useKey(b, key) { if (b.used.indexOf(key) < 0) b.used.push(key); }
  /** 只用了這些試劑（「w」水、「s:<溶液>」、「x:<固體>」） */
  function onlyUsed(b, keys) { return b.used.every(function (k) { return keys.indexOf(k) >= 0; }); }

  /** 重算平衡，整理成任務事件需要的資料 */
  function settle(b, act, what) {
    const before = Object.assign({}, b.p);
    const r = equilibrate(b.N, b.V / 1000, b.p);
    b.p = {}; b.c = r.c;
    Object.keys(r.p).forEach(function (k) { if (r.p[k] > 0) b.p[k] = r.p[k]; });
    const appeared = Object.keys(b.p).filter(function (k) { return !(before[k] > 0); });
    const vanished = Object.keys(before).filter(function (k) { return before[k] > 0 && !(b.p[k] > 0); });
    appeared.forEach(function (k) { b.had[k] = true; });
    if (b.p.AgCl > 0 && b.agAtAgCl == null) b.agAtAgCl = b.N.Ag || 0;
    // 只放一種固體＋水，而且固體沒溶完：這是那種鹽在純水中的飽和溶液
    Object.keys(b.p).forEach(function (k) {
      if (onlyUsed(b, ['w', 'x:' + k]) && b.sat.indexOf(k) < 0) b.sat.push(k);
    });
    b.steps++;
    const Qr = {};
    relevantSolids(b.N).forEach(function (k) { Qr[k] = Math.pow(10, logQ(k, b.c) - Math.log10(SOLID[k].Ksp)); });
    return {
      act: act, what: what, V: b.V, N: Object.assign({}, b.N), p: Object.assign({}, b.p), c: Object.assign({}, b.c), Qr: Qr,
      appeared: appeared, vanished: vanished, used: b.used.slice(), had: Object.assign({}, b.had), agAtAgCl: b.agAtAgCl, sat: b.sat.slice()
    };
  }
  /** 加溶液：key 試劑、conc（M）、mL；超過燒杯容量傳回 null */
  function addSolution(b, key, conc, mL) {
    if (b.V + mL > V_MAX + 1e-9) return null;
    const s = SOLN[key], mol = conc * mL / 1000;
    for (const i in s.ions) b.N[i] = (b.N[i] || 0) + s.ions[i] * mol;
    b.V += mL;
    useKey(b, 's:' + key);
    return settle(b, 'soln', key);
  }
  /** 加固體：key 難溶鹽、mg */
  function addSolid(b, key, mg) {
    const s = SOLID[key], mol = mg / 1000 / s.M;
    for (const i in s.ions) b.N[i] = (b.N[i] || 0) + s.ions[i] * mol;
    useKey(b, 'x:' + key);
    return settle(b, 'solid', key);
  }
  /** 加水 */
  function addWater(b, mL) {
    if (b.V + mL > V_MAX + 1e-9) return null;
    b.V += mL;
    useKey(b, 'w');
    return settle(b, 'water', 'water');
  }
  /** 沉澱的質量（mg） */
  function pptMg(b, k) { return (b.p[k] || 0) * SOLID[k].M * 1000; }

  const API = {
    AW: AW, ION: ION, SOLID: SOLID, SOLN: SOLN, CATIONS: CATIONS, ANIONS: ANIONS,
    molarSolubility: molarSolubility, ionProduct: ionProduct, logQ: logQ, relevantSolids: relevantSolids,
    equilibrate: equilibrate, solubilityWithCommonIon: solubilityWithCommonIon, chargeBalance: chargeBalance,
    V_MAX: V_MAX, V_START: V_START, DROP: DROP, createBeaker: createBeaker, onlyUsed: onlyUsed,
    addSolution: addSolution, addSolid: addSolid, addWater: addWater, pptMg: pptMg
  };
  return API;
});
