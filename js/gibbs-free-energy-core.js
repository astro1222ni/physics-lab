/*
 * gibbs-free-energy-core.js — 「自由能與自發性」的化學核心（與畫面無關，Node 可直接 require）
 *
 * 吉布斯自由能：ΔG° = ΔH° − TΔS°；ΔG° < 0 自發、ΔG° > 0 非自發、ΔG° = 0 平衡。平衡常數 K = exp(−ΔG°/RT)。
 * 簡化：ΔH°、ΔS° 用 298.15 K 的標準值，並假設不隨溫度改變（忽略 ΔCp）。所以 ΔG° 對 T 是直線，
 *       轉折溫度 T* = ΔH°/ΔS°。真實的 ΔH°、ΔS° 會隨溫度稍微改變，離 298 K 越遠誤差越大（頁面〈模擬方法〉有說明）。
 * 標準狀態：氣體 1 bar、溶液 1 mol/L、純固體與純液體。
 *
 * 數據（298.15 K）：
 *   OpenStax《Chemistry 2e》附錄 G：H₂O(l)、H₂O(g)、H₂O₂(l)、O₂、O₃、SO₂、SO₃、NH₄Cl(s)、NH4+(aq)、Cl-(aq)、C（石墨、鑽石）。
 *   NIST Chemistry WebBook（NIST-JANAF 熱力學表）：N₂、H₂、NH₃、NO₂、N₂O₄（和「化學平衡」實驗同一套）。
 *   NIST Chemistry WebBook（CODATA 關鍵值）：CaO(s)、CO₂(g)；CRC Handbook：CaCO₃(s，方解石)。
 *   （OpenStax 附錄 G 的 CaCO₃ 列 −1220.0 kJ/mol、110.0 J/(mol·K)，和 CRC、CODATA 系統的方解石數據不合，所以不採用。）
 * 單位：ΔH° 與 ΔG° 用 kJ/mol（每莫耳反應，依方程式的係數），S° 與 ΔS° 用 J/(mol·K)，T 用 K。
 */
(function (root) {
  'use strict';
  const R = 8.314462618;      // J/(mol·K)
  const T0 = 298.15;          // K
  const TMIN = 100, TMAX = 1500; // 頁面溫度滑桿的範圍（K）

  // ---------- 物種 ----------
  // H：ΔfH°（kJ/mol）、S：S°（J/(mol·K)）、G：ΔfG°（kJ/mol，只用來交叉核對）、ph：相、src：出處
  const SP = {
    'H2O(l)': { H: -285.83, S: 70.0, G: -237.1, ph: 'l', src: 'OS' },
    'H2O(g)': { H: -241.82, S: 188.8, G: -228.59, ph: 'g', src: 'OS' },
    'H2O2(l)': { H: -187.78, S: 109.6, G: -120.35, ph: 'l', src: 'OS' },
    'O2(g)': { H: 0, S: 205.2, G: 0, ph: 'g', src: 'OS' },
    'O3(g)': { H: 142.7, S: 238.9, G: 163.2, ph: 'g', src: 'OS' },
    'SO2(g)': { H: -296.83, S: 248.2, G: -300.1, ph: 'g', src: 'OS' },
    'SO3(g)': { H: -395.72, S: 256.76, G: -371.06, ph: 'g', src: 'OS' },
    'NH4Cl(s)': { H: -314.43, S: 94.6, G: -202.87, ph: 's', src: 'OS' },
    'NH4+(aq)': { H: -132.5, S: 113.4, G: -79.31, ph: 'aq', src: 'OS' },
    'Cl-(aq)': { H: -167.2, S: 56.5, G: -131.2, ph: 'aq', src: 'OS' },
    'C(dia)': { H: 1.89, S: 2.38, G: 2.90, ph: 's', src: 'OS' },
    'C(gr)': { H: 0, S: 5.740, G: 0, ph: 's', src: 'OS' },
    'N2(g)': { H: 0, S: 191.61, G: 0, ph: 'g', src: 'JANAF' },
    'H2(g)': { H: 0, S: 130.68, G: 0, ph: 'g', src: 'JANAF' },
    'NH3(g)': { H: -45.90, S: 192.77, G: -16.367, ph: 'g', src: 'JANAF' },
    'NO2(g)': { H: 33.10, S: 240.04, G: null, ph: 'g', src: 'JANAF' },
    'N2O4(g)': { H: 9.08, S: 304.38, G: null, ph: 'g', src: 'JANAF' },
    'CaO(s)': { H: -634.92, S: 38.1, G: null, ph: 's', src: 'CODATA' },
    'CO2(g)': { H: -393.51, S: 213.79, G: null, ph: 'g', src: 'CODATA' },
    'CaCO3(s)': { H: -1207.6, S: 91.7, G: -1129.1, ph: 's', src: 'CRC' }
  };
  // CRC 同表的 CaO、CO₂ 的 ΔfG°（交叉核對 CaCO₃ 分解的 ΔG°(298) 用）
  const CRC_G = { 'CaO(s)': -603.3, 'CO2(g)': -394.4 };

  // ---------- 反應 ----------
  // sp：[物種, 係數]（反應物係數為負）；valid：方程式寫的各相都合理的溫度範圍（K，1 bar 下；超出時頁面提醒「只是外推」）
  const RX = {
    vap: { sp: [['H2O(l)', -1], ['H2O(g)', 1]], valid: [273, 450], why: ['低於 0 °C 水會結冰；高於約 177 °C 液態水在 1 bar 下早就沸騰光了', 'below 0 °C the water freezes; far above 100 °C liquid water cannot exist at 1 bar'] },
    nh4cl: { sp: [['NH4Cl(s)', -1], ['NH4+(aq)', 1], ['Cl-(aq)', 1]], valid: [273, 373], why: ['水溶液只在 0–100 °C 之間存在', 'an aqueous solution only exists between 0 and 100 °C'] },
    n2o4: { sp: [['N2O4(g)', -1], ['NO2(g)', 2]], valid: [250, 600], why: ['NO<sub>2</sub> 在高溫會再分解成 NO 與 O<sub>2</sub>', 'at high temperature NO<sub>2</sub> breaks down further into NO and O<sub>2</sub>'] },
    caco3: { sp: [['CaCO3(s)', -1], ['CaO(s)', 1], ['CO2(g)', 1]], valid: [298, 1500], why: ['只算 25 °C 以上', 'only computed above 25 °C'] },
    haber: { sp: [['N2(g)', -1], ['H2(g)', -3], ['NH3(g)', 2]], valid: [240, 1500], why: ['低於 −33 °C 氨會液化', 'below −33 °C ammonia liquefies'] },
    so3: { sp: [['SO2(g)', -2], ['O2(g)', -1], ['SO3(g)', 2]], valid: [320, 1500], why: ['低於 45 °C 三氧化硫會凝結', 'below 45 °C sulfur trioxide condenses'] },
    h2o2: { sp: [['H2O2(l)', -2], ['H2O(l)', 2], ['O2(g)', 1]], valid: [273, 423], why: ['過氧化氫只在約 0–150 °C 是液體', 'hydrogen peroxide is only a liquid between about 0 and 150 °C'] },
    diamond: { sp: [['C(dia)', -1], ['C(gr)', 1]], valid: [100, 1500], why: ['', ''] },
    ozone: { sp: [['O2(g)', -3], ['O3(g)', 2]], valid: [162, 1500], why: ['低於 −111 °C 臭氧會液化', 'below −111 °C ozone liquefies'] }
  };
  const ORDER = ['vap', 'nh4cl', 'n2o4', 'caco3', 'haber', 'so3', 'h2o2', 'diamond', 'ozone'];

  /** 反應的 ΔH°（kJ/mol）、ΔS°（J/(mol·K)）、Δn（氣體莫耳數變化）、ΔG°(298) 由 ΔfG° 算（有資料時） */
  function rxData(id) {
    const r = RX[id];
    if (!r) return null;
    let dH = 0, dS = 0, dn = 0, dG = 0, hasG = true;
    r.sp.forEach(function (p) {
      const s = SP[p[0]], nu = p[1];
      dH += nu * s.H; dS += nu * s.S;
      if (s.ph === 'g') dn += nu;
      const g = s.G != null ? s.G : (CRC_G[p[0]] != null ? CRC_G[p[0]] : null);
      if (g == null) hasG = false; else dG += nu * g;
    });
    return { id: id, dH: round(dH, 6), dS: round(dS, 6), dn: dn, dGf: hasG ? round(dG, 6) : null, valid: r.valid.slice(), sp: r.sp };
  }
  function round(x, d) { const p = Math.pow(10, d); return Math.round(x * p) / p; }

  // ---------- 自由能 ----------
  /** ΔG°（kJ/mol） */
  function dG(dH, dS, T) { return dH - T * dS / 1000; }
  /** TΔS°（kJ/mol） */
  function TdS(dS, T) { return T * dS / 1000; }
  /** ln K = −ΔG°/RT */
  function lnK(dH, dS, T) { return -dG(dH, dS, T) * 1000 / (R * T); }
  /** K（可能非常大或非常小；超出浮點範圍時回傳 Infinity 或 0，顯示請用 log10K） */
  function K(dH, dS, T) { return Math.exp(lnK(dH, dS, T)); }
  function log10K(dH, dS, T) { return lnK(dH, dS, T) / Math.LN10; }
  /** 由 K 求 ΔG°（kJ/mol）：ΔG° = −RT ln K */
  function dGfromK(Kv, T) { return -R * T * Math.log(Kv) / 1000; }
  /**
   * 轉折溫度與類型：
   *   always：ΔH° < 0、ΔS° > 0，任何溫度都自發；never：ΔH° > 0、ΔS° < 0，任何溫度都不自發；
   *   low：ΔH° < 0、ΔS° < 0，T < T* 才自發；high：ΔH° > 0、ΔS° > 0，T > T* 才自發；
   *   flat：ΔS° = 0，ΔG° = ΔH° 與溫度無關。T 只有 low／high 有值。
   */
  function turning(dH, dS) {
    if (Math.abs(dS) < 1e-12) return { kind: 'flat', T: null };
    const t = 1000 * dH / dS;
    if (dH < 0 && dS > 0) return { kind: 'always', T: null };
    if (dH > 0 && dS < 0) return { kind: 'never', T: null };
    if (dH === 0) return { kind: dS > 0 ? 'always' : 'never', T: null };
    return { kind: dH < 0 ? 'low' : 'high', T: t };
  }
  /** 自發性判斷：'yes'（ΔG° < −tol）、'no'（ΔG° > tol）、'eq'（|ΔG°| ≤ tol） */
  function verdict(g, tol) {
    const t = tol == null ? 0.05 : tol;
    return g < -t ? 'yes' : g > t ? 'no' : 'eq';
  }
  /** (ΔH, ΔS) 的象限：'++'、'+-'、'-+'、'--'（0 算正） */
  function quadrant(dH, dS) { return (dH >= 0 ? '+' : '-') + (dS >= 0 ? '+' : '-'); }

  /** 最小平方法：由多個 (T, ΔG°) 求直線 ΔG° = ΔH° − TΔS°；回傳 { dH（kJ/mol）, dS（J/(mol·K)）, n } */
  function fitLine(pts) {
    const n = pts.length;
    if (n < 2) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    pts.forEach(function (p) { sx += p.T; sy += p.dG; sxx += p.T * p.T; sxy += p.T * p.dG; });
    const den = n * sxx - sx * sx;
    if (Math.abs(den) < 1e-9) return null;
    const b = (n * sxy - sx * sy) / den, a = (sy - b * sx) / n;
    return { dH: a, dS: -b * 1000, n: n };
  }

  /** 解離度：A₂(g) ⇌ 2A(g)（例如 N₂O₄），總壓 P（bar）時 K = 4α²P/(1 − α²) → α = √(K/(K + 4P)) */
  function dissociation(Kv, P) { const p = P == null ? 1 : P; return Math.sqrt(Kv / (Kv + 4 * p)); }

  /** 未知反應：隨機 ΔH°、ΔS°（rand() 在 [0, 1)）。四種符號組合都可能；同號時讓 T* 落在 250–1350 K */
  function makeMystery(rand) {
    rand = rand || Math.random;
    for (let k = 0; k < 200; k++) {
      const q = Math.floor(rand() * 4); // 0: ++、1: --、2: -+、3: +-
      const h = round(20 + rand() * 180, 1), s = round(40 + rand() * 210, 1);
      const dH = (q === 0 || q === 3) ? h : -h, dS = (q === 0 || q === 2) ? s : -s;
      if (q <= 1) { const t = 1000 * h / s; if (t < 250 || t > 1350) continue; }
      return { dH: dH, dS: dS };
    }
    return { dH: 60, dS: 120 };
  }

  /** 有效數字 sig 位的 K 顯示用：回傳 { m（尾數字串）, e（10 的次方）}，由 log10K 計算，不會溢位 */
  function sciFromLog(lg, sig) {
    const d = (sig || 3) - 1;
    let e = Math.floor(lg);
    let m = Math.pow(10, lg - e);
    if (+m.toFixed(d) >= 10) { e += 1; m = m / 10; }
    return { m: m.toFixed(d), e: e };
  }
  /** 依顯示的有效數字把 K 四捨五入後的 ln K（學生由畫面讀到的 K 算 ln K 會得到的值） */
  function lnKshown(lg, sig) {
    const p = sciFromLog(lg, sig);
    return Math.log(+p.m) + p.e * Math.LN10;
  }

  const api = {
    R: R, T0: T0, TMIN: TMIN, TMAX: TMAX, SP: SP, RX: RX, ORDER: ORDER, CRC_G: CRC_G,
    rxData: rxData, dG: dG, TdS: TdS, lnK: lnK, K: K, log10K: log10K, dGfromK: dGfromK,
    turning: turning, verdict: verdict, quadrant: quadrant, fitLine: fitLine, dissociation: dissociation,
    makeMystery: makeMystery, sciFromLog: sciFromLog, lnKshown: lnKshown
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GibbsCore = api;
})(typeof window !== 'undefined' ? window : this);
