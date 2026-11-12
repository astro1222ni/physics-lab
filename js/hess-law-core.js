/*
 * hess-law-core.js — 「反應熱與赫斯定律」的化學核心（與畫面無關，Node 可直接 require）
 *
 * 簡易卡計（兩層保麗龍杯＋杯蓋＋數位溫度計＋攪拌棒），三種實驗：
 *   'solid'：固體（NaOH、NH4NO3 或未知固體 X）加入水或鹽酸
 *   'mix'  ：NaOH(aq) 在杯中，倒入 HCl(aq)
 *   'cal'  ：卡計校正，冷水在杯中，倒入熱水（求卡計的熱容量）
 *
 * 數據（25 °C、無限稀釋）：
 *   NaOH(s) → Na+(aq) + OH-(aq)        ΔH = −44.50 kJ/mol（CRC Handbook of Chemistry and Physics, 90th ed., Enthalpy of solution）
 *   NH4NO3(s) → NH4+(aq) + NO3-(aq)    ΔH = +25.69 kJ/mol（同上）
 *   H+(aq) + OH-(aq) → H2O(l)          ΔH = −55.83 kJ/mol（OpenStax《Chemistry 2e》附錄 G：ΔfH° H2O(l) −285.83、OH-(aq) −230.0）
 *   NaOH(s) + H+(aq) → Na+(aq) + H2O(l) ΔH = −100.33 kJ/mol（赫斯定律：前兩式相加）
 * 溶液一律當成水：密度 1.00 g/mL、比熱 4.18 J/(g·K)；溶解的固體質量算進溶液質量。
 *
 * 能量守恆（每一小步）：d(C·T) = c·dm·T_in − ΔH_sol·dn − ΔH_neut·dξ，C = c·m + C_cal；
 * 再加牛頓冷卻：dT/dt = −hA·(T − T_room)/C（有杯蓋 hA 較小）；溫度計讀數以時間常數 4 s 跟上、顯示到 0.1 °C。
 * 固體溶解與倒入溶液的混合是一階過程（有攪拌較快）；中和反應在混合時立即完成。
 */
(function (root) {
  'use strict';
  const C_W = 4.18;          // 溶液比熱 J/(g·K)
  const RHO = 1.0;           // g/mL
  const C_CAL = 18;          // 卡計（杯、蓋、溫度計、攪拌棒）的熱容量 J/K
  const HA = { lid: 0.25, open: 0.6 };      // 散熱係數 W/K
  const TAU_TH = 4;          // 溫度計的反應時間 s
  const TAU_DIS = { stir: 20, still: 80 };  // 固體溶解 s
  const TAU_MIX = { stir: 2, still: 10 };   // 倒入後混合 s
  const DH_NEUT = -55.83;    // kJ/mol
  const SOLIDS = {
    NaOH: { M: 39.997, dH: -44.50 },
    NH4NO3: { M: 80.043, dH: 25.69 },
    X: { M: 100, dH: -30 }       // 未知固體（newUnknown 決定）
  };
  const DH3 = SOLIDS.NaOH.dH + DH_NEUT;   // −100.33

  /**
   * o：{ mode, Troom（°C）, lid, stir,
   *      solid: { kind, mass（g）}, liquid: { kind: 'water'|'HCl', V（mL）, c（mol/L）},
   *      mix: { cb, Vb, ca, Va }（NaOH 在杯中、HCl 倒入）, cal: { Vc, Vh, Th } }
   */
  function createRun(o) {
    const s = {
      mode: o.mode || 'solid', Troom: o.Troom == null ? 25 : o.Troom, lid: o.lid !== false, stir: o.stir !== false,
      t: 0, added: false, tAdd: null, x: 0, nDis: 0, xi: 0, C_cal: o.C_cal == null ? C_CAL : o.C_cal
    };
    s.T = s.Troom; s.Tth = s.Troom;
    if (s.mode === 'solid') {
      const sd = SOLIDS[o.solid.kind];
      s.solid = { kind: o.solid.kind, mass: o.solid.mass, M: sd.M, dH: sd.dH, n: o.solid.mass / sd.M };
      s.liquid = { kind: o.liquid.kind, V: o.liquid.V, c: o.liquid.kind === 'HCl' ? o.liquid.c : 0 };
      s.m0 = o.liquid.V * RHO;
      s.nH = s.liquid.kind === 'HCl' ? s.liquid.c * s.liquid.V / 1000 : 0;
      s.base = s.solid.kind === 'NaOH';
    } else if (s.mode === 'mix') {
      s.mix = { cb: o.mix.cb, Vb: o.mix.Vb, ca: o.mix.ca, Va: o.mix.Va };
      s.m0 = o.mix.Vb * RHO; s.mAdd = o.mix.Va * RHO; s.Tin = s.Troom;
      s.nb = o.mix.cb * o.mix.Vb / 1000; s.na = o.mix.ca * o.mix.Va / 1000;
    } else {
      s.cal = { Vc: o.cal.Vc, Vh: o.cal.Vh, Th: o.cal.Th };
      s.m0 = o.cal.Vc * RHO; s.mAdd = o.cal.Vh * RHO; s.Tin = o.cal.Th;
    }
    return s;
  }
  function mass(s) { return s.mode === 'solid' ? s.m0 + s.nDis * s.solid.M : s.m0 + s.x * s.mAdd; }
  function heatCap(s) { return C_W * mass(s) + s.C_cal; }
  function add(s) { if (!s.added) { s.added = true; s.tAdd = s.t; } return s; }
  /** 前進 dt 秒 */
  function step(s, dt) {
    let left = dt;
    const tauR = s.mode === 'solid' ? (s.stir ? TAU_DIS.stir : TAU_DIS.still) : (s.stir ? TAU_MIX.stir : TAU_MIX.still);
    const hA = s.lid ? HA.lid : HA.open;
    while (left > 1e-12) {
      const h = Math.min(left, s.added ? Math.min(0.25, tauR / 20) : 1);
      const C0 = heatCap(s);
      let E = C0 * s.T;         // 以 0 °C 為基準的熱含量（J）
      if (s.added) {
        const f = 1 - Math.exp(-h / tauR);
        if (s.mode === 'solid') {
          const dn = (s.solid.n - s.nDis) * f;
          let dxi = 0;
          if (s.base && s.nH > 0) { dxi = Math.min(dn, s.nH - s.xi); s.xi += dxi; }
          s.nDis += dn;
          // 固體原本在室溫：溶進溶液的質量帶著室溫的熱含量（比熱以溶液計），再加上反應熱
          E += C_W * s.solid.M * dn * s.Troom - s.solid.dH * 1000 * dn - DH_NEUT * 1000 * dxi;
        } else {
          const dx = (1 - s.x) * f;
          s.x += dx;
          E += C_W * s.mAdd * dx * s.Tin;
          if (s.mode === 'mix') {
            const xiNew = Math.min(s.nb, s.na * s.x), dxi = xiNew - s.xi;
            s.xi = xiNew;
            E -= DH_NEUT * 1000 * dxi;
          }
        }
      }
      const C1 = heatCap(s);
      s.T = E / C1;
      // 牛頓冷卻（精確解）
      s.T = s.Troom + (s.T - s.Troom) * Math.exp(-hA * h / C1);
      // 溫度計
      s.Tth = s.T + (s.Tth - s.T) * Math.exp(-h / TAU_TH);
      s.t += h; left -= h;
    }
    return s;
  }
  /** 數位溫度計的讀數（0.1 °C） */
  function reading(s) { return Math.round(s.Tth * 10) / 10; }
  /** 這次實驗「每莫耳」的參考反應熱（kJ/mol）與它的意義；沒有單一定義時傳回 null */
  function reference(s) {
    if (s.mode === 'mix') return { dH: DH_NEUT, per: 'H2O', n: Math.min(s.nb, s.na) };
    if (s.mode === 'cal') return null;
    if (s.liquid.kind === 'HCl' && s.base) {
      if (s.solid.n <= s.nH + 1e-12) return { dH: DH3, per: 'NaOH', n: s.solid.n };
      return null;
    }
    return { dH: s.solid.dH, per: s.solid.kind, n: s.solid.n };
  }
  /** 沒有散熱、杯子不吸熱時的理論溫差（K）——頁面「理想值」與測試用 */
  function idealDT(s, Ccal) {
    const cc = Ccal == null ? s.C_cal : Ccal;
    if (s.mode === 'solid') {
      const q = -s.solid.dH * 1000 * s.solid.n - (s.base ? DH_NEUT * 1000 * Math.min(s.solid.n, s.nH) : 0);
      return q / (C_W * (s.m0 + s.solid.mass) + cc);
    }
    if (s.mode === 'mix') return -DH_NEUT * 1000 * Math.min(s.nb, s.na) / (C_W * (s.m0 + s.mAdd) + cc);
    const Tf = (C_W * s.mAdd * s.Tin + (C_W * s.m0 + cc) * s.Troom) / (C_W * (s.m0 + s.mAdd) + cc);
    return Tf - s.Troom;
  }
  /** 最後的溶液質量（g） */
  function finalMass(s) { return s.mode === 'solid' ? s.m0 + s.solid.mass : s.m0 + s.mAdd; }

  // ---------------- 分析 ----------------
  /** 最小平方直線 y = a + b·x */
  function fitLine(pts) {
    const n = pts.length;
    if (n < 2) return null;
    let sx = 0, sy = 0;
    pts.forEach(function (p) { sx += p[0]; sy += p[1]; });
    const xm = sx / n, ym = sy / n;
    let sxx = 0, sxy = 0;
    pts.forEach(function (p) { sxx += (p[0] - xm) * (p[0] - xm); sxy += (p[0] - xm) * (p[1] - ym); });
    if (!(sxx > 0)) return null;
    const b = sxy / sxx;
    return { a: ym - b * xm, b: b, n: n };
  }
  /**
   * 由記錄的讀數 rows（[t, 讀數]）分析：
   *   T0：加入前最後 30 s 的平均；raw：加入後的最高（放熱）或最低（吸熱）讀數；
   *   ext：用 [ta, tb] 之間的點擬合直線、外插到加入的時刻。
   */
  function analyze(rows, tAdd, ta, tb) {
    const before = rows.filter(function (r) { return r[0] <= tAdd + 1e-9 && r[0] >= tAdd - 30; });
    const T0 = before.length ? before.reduce(function (a, r) { return a + r[1]; }, 0) / before.length : (rows[0] ? rows[0][1] : NaN);
    const after = rows.filter(function (r) { return r[0] > tAdd; });
    let hi = -Infinity, lo = Infinity, tHi = tAdd, tLo = tAdd;
    after.forEach(function (r) { if (r[1] > hi) { hi = r[1]; tHi = r[0]; } if (r[1] < lo) { lo = r[1]; tLo = r[0]; } });
    const exo = hi - T0 >= T0 - lo;
    const ext = exo ? hi : lo, tExt = exo ? tHi : tLo;
    const f = fitLine(rows.filter(function (r) { return r[0] >= ta - 1e-9 && r[0] <= tb + 1e-9; }));
    return {
      T0: T0, exo: exo, Text: ext, tExt: tExt, dTraw: ext - T0,
      fit: f, dText: f ? f.a + f.b * tAdd - T0 : null
    };
  }
  /** 反應熱（kJ/mol）：q = (c·m + C)·ΔT，ΔH = −q/n */
  function dHfrom(m, C, dT, n) { return -(C_W * m + C) * dT / n / 1000; }
  /** 卡計熱容量（J/K）：熱水放出的熱 = 冷水吸收 + 卡計吸收 */
  function calibC(mc, mh, Th, T0, Tf) { return (C_W * mh * (Th - Tf) - C_W * mc * (Tf - T0)) / (Tf - T0); }

  // ---------------- 未知固體 ----------------
  /** M：60.0–160.0 g/mol；ΔH：放熱 −60～−15 或吸熱 +12～+35 kJ/mol（各半） */
  function newUnknown(r) {
    r = r || Math.random;
    const M = Math.round(600 + r() * 1000) / 10;
    const dH = r() < 0.5 ? -Math.round(150 + r() * 450) / 10 : Math.round(120 + r() * 230) / 10;
    SOLIDS.X.M = M; SOLIDS.X.dH = dH;
    return { M: M, dH: dH };
  }

  const api = {
    C_W: C_W, RHO: RHO, C_CAL: C_CAL, HA: HA, TAU_TH: TAU_TH, TAU_DIS: TAU_DIS, TAU_MIX: TAU_MIX, DH_NEUT: DH_NEUT, DH3: DH3, SOLIDS: SOLIDS,
    createRun: createRun, mass: mass, heatCap: heatCap, add: add, step: step, reading: reading, reference: reference, idealDT: idealDT, finalMass: finalMass,
    fitLine: fitLine, analyze: analyze, dHfrom: dHfrom, calibC: calibC, newUnknown: newUnknown
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HessCore = api;
})(typeof window !== 'undefined' ? window : this);
