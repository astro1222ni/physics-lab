/*
 * phase-diagram-core.js — 「相圖：三相點與臨界點」的化學核心（PDCore，與畫面無關，Node 與瀏覽器共用）
 *
 * 單位：溫度 K、壓力 Pa（頁面再換成 °C、kPa、atm）；莫耳汽化熱等用 J/mol。
 * 三種物質的相界線都用文獻的方程式（出處見各段註解與頁面〈模擬方法〉）：
 *   水 H2O：IAPWS（Wagner & Pruss 2002 飽和蒸氣壓與飽和密度；IAPWS 2011 冰 Ih 熔化壓與昇華壓）
 *   二氧化碳 CO2：Span & Wagner（1996）的輔助方程式（蒸氣壓、昇華壓、熔化壓、飽和密度）
 *   碘 I2：三相點、臨界點、正常沸點取 CRC Handbook；昇華線用 NIST 的 ΔsubH°、S° 與熱容積分（錨定在三相點）；
 *          氣液線用通過三相點、正常沸點、臨界點的 ln P = A + B/T + C ln T（相當於汽化熱隨溫度線性變化）；
 *          熔化線用克拉佩龍方程式（熔化熱與固、液莫耳體積差固定）。
 * 相的判定：先看是不是在「蒸氣那一側」（壓力低於昇華壓或蒸氣壓），再看熔化線的哪一側；
 * T ≥ Tc 且 P ≥ Pc 為超臨界流體（它和液體、氣體之間沒有相變，頁面用虛線表示）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PDCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const R = 8.314462618;      // J/(mol·K)
  const ATM = 101325;         // Pa

  // ======================= 物質數據 =======================
  const SUBS = {
    water: {
      id: 'water', M: 18.015,
      Tt: 273.16, pt: 611.657, Tc: 647.096, pc: 22.064e6, rhoc: 322,
      Tb: 373.124,                       // 1 atm 的沸點（ITS-90，99.974 °C）
      rhoS: 916.7, rhoL: 999.8,          // 0 °C 冰與水的密度 kg/m³（CRC）
      dHvapRef: 40.65e3, dHsubRef: 51.06e3, dHfusRef: 6.01e3, // 文獻值：汽化熱（100 °C）、昇華熱與熔化熱（0 °C）
      Tmin: 213.15, Tmax: 693.15,        // 頁面的溫度範圍（−60 ~ 420 °C）
      Pmin: 1, Pmax: 1e8,                // 頁面的壓力範圍（1 Pa ~ 100 MPa）
      meltLo: 251.165                    // 冰 Ih 熔化線的下端（Ih–III–液 三相點，208.566 MPa）
    },
    co2: {
      id: 'co2', M: 44.0098,
      Tt: 216.592, pt: 0.51795e6, Tc: 304.1282, pc: 7.3773e6, rhoc: 467.6,
      Tsub1: 194.686,                    // 1 atm 的昇華溫度（−78.464 °C）
      rhoS: 1562, rhoL: 1178.5,          // 乾冰（−78.5 °C）與三相點液體的密度 kg/m³
      dHvapRef: 15.33e3, dHsubRef: 25.2e3, dHfusRef: 9.02e3, // 三相點附近（CRC；昇華熱取 1 atm 昇華點）
      Tmin: 153.15, Tmax: 353.15,        // −120 ~ 80 °C
      Pmin: 100, Pmax: 1e8               // 100 Pa ~ 100 MPa
    },
    iodine: {
      id: 'iodine', M: 253.809,
      Tt: 386.65, pt: 12.07e3, Tc: 819, pc: 11.7e6, rhoc: null,
      Tb: 457.55,                        // 1 atm 的沸點（184.4 °C，CRC）
      rhoS: 4933, rhoL: 3960,            // 固體（20 °C）與熔點時液體的密度 kg/m³（CRC）
      dHvapRef: 41.57e3, dHsubRef: 62.42e3, dHfusRef: 15.52e3, // 汽化熱（沸點）、昇華熱（25 °C，NIST）、熔化熱（CRC）
      Tmin: 273.15, Tmax: 873.15,        // 0 ~ 600 °C
      Pmin: 1, Pmax: 1e8
    }
  };
  const ORDER = ['water', 'co2', 'iodine'];

  // ---------- 水：IAPWS ----------
  const W_VAP = [-7.85951783, 1.84408259, -11.7866497, 22.6807411, -15.9618719, 1.80122502];
  function waterPvap(T) {
    const s = SUBS.water, t = 1 - T / s.Tc;
    const a = W_VAP;
    const sum = a[0] * t + a[1] * Math.pow(t, 1.5) + a[2] * Math.pow(t, 3) + a[3] * Math.pow(t, 3.5) + a[4] * Math.pow(t, 4) + a[5] * Math.pow(t, 7.5);
    return s.pc * Math.exp(s.Tc / T * sum);
  }
  function waterPsub(T) {
    const s = SUBS.water, th = T / s.Tt;
    const sum = -21.2144006 * Math.pow(th, 0.00333333333) + 27.3203819 * Math.pow(th, 1.20666667) - 6.10598130 * Math.pow(th, 1.70333333);
    return s.pt * Math.exp(sum / th);
  }
  function waterPmelt(T) {
    const s = SUBS.water, th = T / s.Tt;
    return s.pt * (1 + 1.19539337e6 * (1 - Math.pow(th, 3)) + 8.08183159e4 * (1 - Math.pow(th, 25.75)) + 3.33826860e3 * (1 - Math.pow(th, 103.75)));
  }
  function waterRhoL(T) {
    const s = SUBS.water, t = 1 - T / s.Tc;
    return s.rhoc * (1 + 1.99274064 * Math.pow(t, 1 / 3) + 1.09965342 * Math.pow(t, 2 / 3) - 0.510839303 * Math.pow(t, 5 / 3) -
      1.75493479 * Math.pow(t, 16 / 3) - 45.5170352 * Math.pow(t, 43 / 3) - 6.74694450e5 * Math.pow(t, 110 / 3));
  }
  function waterRhoV(T) {
    const s = SUBS.water, t = 1 - T / s.Tc;
    return s.rhoc * Math.exp(-2.03150240 * Math.pow(t, 2 / 6) - 2.68302940 * Math.pow(t, 4 / 6) - 5.38626492 * Math.pow(t, 8 / 6) -
      17.2991605 * Math.pow(t, 18 / 6) - 44.7586581 * Math.pow(t, 37 / 6) - 63.9201063 * Math.pow(t, 71 / 6));
  }

  // ---------- 二氧化碳：Span & Wagner 1996 ----------
  function co2Pvap(T) {
    const s = SUBS.co2, t = 1 - T / s.Tc;
    return s.pc * Math.exp(s.Tc / T * (-7.0602087 * t + 1.9391218 * Math.pow(t, 1.5) - 1.6463597 * t * t - 3.2995634 * Math.pow(t, 4)));
  }
  function co2Psub(T) {
    const s = SUBS.co2, u = 1 - T / s.Tt;
    return s.pt * Math.exp(s.Tt / T * (-14.740846 * u + 2.4327015 * Math.pow(u, 1.9) - 5.3061778 * Math.pow(u, 2.9)));
  }
  function co2Pmelt(T) {
    const s = SUBS.co2, u = T / s.Tt - 1;
    return s.pt * (1 + 1955.5390 * u + 2055.4593 * u * u);
  }
  function co2RhoL(T) {
    const s = SUBS.co2, t = 1 - T / s.Tc;
    return s.rhoc * Math.exp(1.9245108 * Math.pow(t, 0.34) - 0.62385555 * Math.pow(t, 0.5) - 0.32731127 * Math.pow(t, 10 / 6) + 0.39245142 * Math.pow(t, 11 / 6));
  }
  function co2RhoV(T) {
    const s = SUBS.co2, t = 1 - T / s.Tc;
    return s.rhoc * Math.exp(-1.7074879 * Math.pow(t, 0.34) - 0.82274670 * Math.pow(t, 0.5) - 4.6008549 * t - 10.111178 * Math.pow(t, 7 / 3) - 29.742252 * Math.pow(t, 14 / 3));
  }

  // ---------- 碘 ----------
  // 昇華：ΔsubH°(298.15 K) = 62.42 kJ/mol（NIST，等於 I2(g) 的標準生成焓），ΔCp = Cp(g) − Cp(s) = 36.89 − 54.44 J/(mol·K)；
  // 以三相點為錨點積分克勞修斯—克拉佩龍方程式：ln(p/pt) = −(1/R)∫ΔH(T)/T² dT（從 Tt 到 T）
  const I2_DH0 = 62.42e3, I2_DCP = 36.89 - 54.44, I2_T0 = 298.15;
  function iodinePsub(T) {
    const s = SUBS.iodine, a = I2_DH0 - I2_DCP * I2_T0; // ΔH(T) = a + ΔCp·T
    // d ln p/dT = ΔH/(RT²)，∫(a + c·x)/x² dx = −a/x + c ln x，所以 ln p(T) − ln p(Tt) = [F(T) − F(Tt)]/R
    const F = function (x) { return -a / x + I2_DCP * Math.log(x); };
    return s.pt * Math.exp((F(T) - F(s.Tt)) / R);
  }
  // 氣液：ln P = A + B/T + C ln T，通過 (Tt, pt)、(Tb, 1 atm)、(Tc, pc)
  const I2_VAP = (function () {
    const s = SUBS.iodine, pts = [[s.Tt, s.pt], [s.Tb, ATM], [s.Tc, s.pc]];
    // 解 3×3 線性方程組 [1, 1/T, ln T]·[A, B, C] = ln P
    const M = pts.map(function (p) { return [1, 1 / p[0], Math.log(p[0]), Math.log(p[1])]; });
    for (let i = 0; i < 3; i++) {
      let piv = i;
      for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
      const tmp = M[i]; M[i] = M[piv]; M[piv] = tmp;
      for (let r = 0; r < 3; r++) {
        if (r === i) continue;
        const f = M[r][i] / M[i][i];
        for (let c = i; c < 4; c++) M[r][c] -= f * M[i][c];
      }
    }
    return { A: M[0][3] / M[0][0], B: M[1][3] / M[1][1], C: M[2][3] / M[2][2] };
  })();
  function iodinePvap(T) { return Math.exp(I2_VAP.A + I2_VAP.B / T + I2_VAP.C * Math.log(T)); }
  // 熔化：克拉佩龍 dP/dT = ΔfusH/(T ΔV)，ΔV = M(1/ρL − 1/ρS)
  const I2_DV = SUBS.iodine.M / 1000 * (1 / SUBS.iodine.rhoL - 1 / SUBS.iodine.rhoS); // m³/mol
  const I2_MSLOPE = SUBS.iodine.dHfusRef / (SUBS.iodine.Tt * I2_DV);                  // Pa/K
  function iodinePmelt(T) { return SUBS.iodine.pt + I2_MSLOPE * (T - SUBS.iodine.Tt); }

  // ======================= 統一介面 =======================
  function sub(id) { return SUBS[id] || SUBS.water; }
  /** 昇華壓（T ≤ Tt 才有意義） */
  function psub(id, T) { return id === 'co2' ? co2Psub(T) : id === 'iodine' ? iodinePsub(T) : waterPsub(T); }
  /** 飽和蒸氣壓（Tt ≤ T ≤ Tc） */
  function pvap(id, T) { return id === 'co2' ? co2Pvap(T) : id === 'iodine' ? iodinePvap(T) : waterPvap(T); }
  /** 熔化壓：熔化線上溫度 T 對應的壓力（水只在 251.165–273.16 K 有定義） */
  function pmelt(id, T) {
    if (id === 'water') return (T >= SUBS.water.meltLo - 1e-9 && T <= SUBS.water.Tt + 1e-9) ? waterPmelt(T) : NaN;
    if (T < sub(id).Tt - 1e-9) return NaN;
    return id === 'co2' ? co2Pmelt(T) : iodinePmelt(T);
  }
  /** 熔化線的斜率 dP/dT（Pa/K），數值微分 */
  function meltSlope(id, T) {
    const s = sub(id), h = 1e-3;
    const T1 = id === 'water' ? Math.min(T, s.Tt - h) : Math.max(T, s.Tt + h);
    return (pmelt(id, T1 + h) - pmelt(id, T1 - h)) / (2 * h);
  }
  /** 氣相那一側的邊界：T < Tt 用昇華壓，Tt ≤ T < Tc 用蒸氣壓，T ≥ Tc 沒有 */
  function gasBoundary(id, T) {
    const s = sub(id);
    if (T < s.Tt) return psub(id, T);
    if (T < s.Tc) return pvap(id, T);
    return NaN;
  }
  /** 這個 (T, P) 是固、液、氣還是超臨界 */
  function phase(id, T, P) {
    const s = sub(id);
    // 熔化線右側（固）：CO2、I2 斜率為正，P 大於熔化壓就是固體
    if (id !== 'water') {
      if (T >= s.Tt) { if (P > pmelt(id, T)) return 'solid'; }
      else if (P > psub(id, T)) return 'solid';
    } else {
      if (T < s.Tt) {
        if (P > psub(id, T)) {
          // 冰 Ih：熔化線往左上斜，壓力超過熔化壓反而是液態水
          if (T >= s.meltLo && P > waterPmelt(T)) return 'liquid';
          return 'solid';
        }
        return 'gas';
      }
    }
    if (T < s.Tt) return 'gas';
    if (T >= s.Tc && P >= s.pc) return 'sc';
    if (T >= s.Tc) return 'gas';
    return P >= pvap(id, T) ? 'liquid' : 'gas';
  }
  /** 給定壓力的相變溫度（反解）：沸點、熔點或昇華點 */
  function bisect(f, lo, hi) {
    let flo = f(lo);
    for (let k = 0; k < 100; k++) {
      const mid = (lo + hi) / 2, fm = f(mid);
      if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
      if (hi - lo < 1e-10) break;
    }
    return (lo + hi) / 2;
  }
  function Tboil(id, P) {
    const s = sub(id);
    if (P < s.pt || P > s.pc) return NaN;
    return bisect(function (T) { return Math.log(pvap(id, T) / P); }, s.Tt, s.Tc);
  }
  function Tsubl(id, P) {
    const s = sub(id);
    if (P > s.pt) return NaN;
    return bisect(function (T) { return Math.log(psub(id, T) / P); }, 30, s.Tt);
  }
  function Tmelt(id, P) {
    const s = sub(id);
    if (P < s.pt) return NaN;
    if (id === 'water') {
      if (P > waterPmelt(s.meltLo)) return NaN;
      return bisect(function (T) { return waterPmelt(T) - P; }, s.meltLo, s.Tt);
    }
    return bisect(function (T) { return pmelt(id, T) - P; }, s.Tt, s.Tt + 2000);
  }
  /** 克勞修斯—克拉佩龍：由曲線的斜率算出的莫耳相變熱 ΔH = R T² d(ln P)/dT（假設氣體理想、凝相體積可忽略） */
  function dHslope(id, kind, T) {
    const f = kind === 'sub' ? psub : pvap, h = 1e-3;
    return R * T * T * (Math.log(f(id, T + h)) - Math.log(f(id, T - h))) / (2 * h);
  }
  /** 兩點式：ln(P2/P1) = −(ΔH/R)(1/T2 − 1/T1) */
  function twoPoint(T1, P1, T2, P2) {
    const d = 1 / T1 - 1 / T2;
    if (Math.abs(d) < 1e-12) return NaN;
    return R * Math.log(P2 / P1) / d;
  }
  /** 飽和液體與飽和蒸氣的密度（kg/m³）；碘沒有可靠的方程式，傳回 null */
  function satDensity(id, T) {
    const s = sub(id);
    if (T < s.Tt || T > s.Tc) return null;
    if (id === 'water') return { L: waterRhoL(T), V: waterRhoV(T) };
    if (id === 'co2') return { L: co2RhoL(T), V: co2RhoV(T) };
    return null;
  }
  /** 對比狀態 */
  function reduced(id, T, P) { const s = sub(id); return { Tr: T / s.Tc, Pr: P / s.pc }; }

  // ======================= 相變的種類 =======================
  const KIND = {
    'solid>liquid': 'melt', 'liquid>solid': 'freeze', 'liquid>gas': 'boil', 'gas>liquid': 'condense',
    'solid>gas': 'sublime', 'gas>solid': 'deposit', 'solid>sc': 'melt', 'sc>solid': 'freeze'
  };
  /** 真正的相變（有界線、有潛熱）；液 ↔ 超臨界、氣 ↔ 超臨界是連續的變化 */
  function isTransition(a, b) { return a !== b && !((a === 'sc' && b !== 'solid') || (b === 'sc' && a !== 'solid')); }
  function kindOf(a, b) { return KIND[a + '>' + b] || null; }

  /**
   * 沿 (T, ln P) 的直線從 a 走到 b，找出所有相的改變點。
   * 回傳 [{ from, to, T, P, transition }]，依路徑先後排列；transition 為 false 的是進出超臨界（連續變化）。
   */
  function pathChanges(id, a, b, samples) {
    const N = samples || 400;
    const la = Math.log(a.P), lb = Math.log(b.P);
    const at = function (u) { return { T: a.T + (b.T - a.T) * u, P: Math.exp(la + (lb - la) * u) }; };
    const ph = function (u) { const q = at(u); return phase(id, q.T, q.P); };
    const out = [];
    let u0 = 0, p0 = ph(0);
    for (let k = 1; k <= N; k++) {
      const u1 = k / N;
      let p1 = ph(u1);
      let lo = u0;
      while (p1 !== p0) {
        // 二分：找第一個和 p0 不同的位置
        let l = lo, h = u1;
        for (let it = 0; it < 60; it++) {
          const m = (l + h) / 2;
          if (ph(m) === p0) l = m; else h = m;
          if (h - l < 1e-13) break;
        }
        const pn = ph(h), q = at(h);
        out.push({ from: p0, to: pn, T: q.T, P: q.P, u: h, transition: isTransition(p0, pn), kind: kindOf(p0, pn) });
        p0 = pn; lo = h;
        if (lo >= u1) break;
        p1 = ph(u1);
        if (p1 === p0) break;
        // 同一小段裡還有別的變化（例如穿過三相點附近）
        if (u1 - lo < 1e-12) break;
      }
      p0 = ph(u1); u0 = u1;
    }
    return out;
  }

  /** 溜冰：冰刀下的壓力（Pa）與熔點下降（K，用 0 °C 附近的熔化線斜率） */
  function skate(massKg, areaMm2) {
    const P = massKg * 9.80665 / (areaMm2 * 1e-6);
    const slope = meltSlope('water', SUBS.water.Tt - 0.01);
    return { P: P, dT: P / slope, slope: slope };
  }

  // ======================= 狀態點在哪條線上 =======================
  // 三相點：|T − Tt| ≤ 0.1 K 且壓力差 ≤ 2%；臨界點：|T − Tc| ≤ 0.2% Tc 且壓力差 ≤ 1%；
  // 氣液線、昇華線：壓力與曲線相差 ≤ 0.2%；熔化線：溫度與熔點相差 ≤ 0.02 K
  const TOL = { tT: 0.1, tP: 0.02, cT: 0.002, cP: 0.01, line: 0.002, melt: 0.02 };
  function lineOf(id, T, P) {
    const s = sub(id);
    if (Math.abs(T - s.Tt) <= TOL.tT && Math.abs(Math.log(P / s.pt)) <= TOL.tP) return 'triple';
    if (Math.abs(T / s.Tc - 1) <= TOL.cT && Math.abs(P / s.pc - 1) <= TOL.cP) return 'critical';
    if (T < s.Tt && Math.abs(Math.log(P / psub(id, T))) <= TOL.line) return 'sub';
    if (T >= s.Tt && T < s.Tc && Math.abs(Math.log(P / pvap(id, T))) <= TOL.line) return 'vap';
    if (P >= s.pt) {
      const Tm = Tmelt(id, P);
      if (isFinite(Tm) && Math.abs(T - Tm) <= TOL.melt) return 'melt';
    }
    return null;
  }
  /** 共存的兩（三）個相：line → [低溫或高壓那一側, 另一側] */
  function lineFaces(line) {
    return line === 'sub' ? ['solid', 'gas'] : line === 'vap' ? ['liquid', 'gas'] : line === 'melt' ? ['solid', 'liquid'] :
      line === 'triple' ? ['solid', 'liquid', 'gas'] : null;
  }
  function boundaryOfKind(kind) {
    return kind === 'boil' || kind === 'condense' ? 'vap' : kind === 'sublime' || kind === 'deposit' ? 'sub' : kind === 'melt' || kind === 'freeze' ? 'melt' : null;
  }

  /**
   * 任務事件的追蹤器（頁面與任務證明腳本共用，保證兩邊判定一致）。
   *   move(id, a, b, mode)：狀態從 a 移到 b（mode：'heat'／'cool'／'press'／'depress'／'drag'），
   *       傳回事件 [{ type, data }]：'cross'（每個真正的相變）、'around'（液 ↔ 氣而沒有經過相變）、
   *       'clap'（同一條線上有兩個紀錄點時，用兩點式算出的相變熱）、'hess'（同一物質的昇華熱 − 汽化熱 對照熔化熱）
   *   state(id, T, P, via)：使用者把狀態放在 (T, P) 時要送的 'state' 事件內容
   *   teleport(id, T, P)：預設情境、換物質（不算相變、不送事件）
   */
  function tracker() {
    const tr = { records: [], crit: {}, triple: {}, red: {}, orig: null, viaSC: false, seq: 0 };
    function fluidOf(ph) { return ph === 'liquid' || ph === 'gas' ? ph : null; }
    tr.teleport = function (id, T, P) { tr.orig = fluidOf(phase(id, T, P)); tr.viaSC = false; };
    tr.clear = function () { tr.records.length = 0; tr.crit = {}; tr.triple = {}; tr.red = {}; };
    /** 同一物質、同一條線最近的兩個紀錄點（壓力至少差 5%） */
    function pairOf(id, bd) {
      let a = null, b = null;
      for (let i = tr.records.length - 1; i >= 0; i--) {
        const r = tr.records[i];
        if (r.sub !== id || r.bd !== bd) continue;
        if (!a) { a = r; continue; }
        if (Math.abs(Math.log(r.P / a.P)) >= Math.log(1.05)) { b = r; break; }
      }
      if (!a || !b) return null;
      const dH = twoPoint(b.T, b.P, a.T, a.P);
      return { dH: dH, ratio: Math.max(a.P, b.P) / Math.min(a.P, b.P), T1: b.T, T2: a.T, P1: b.P, P2: a.P, drag: a.mode === 'drag' || b.mode === 'drag' };
    }
    tr.pair = pairOf;
    tr.move = function (id, a, b, mode) {
      const ev = [];
      const ch = pathChanges(id, a, b);
      ch.forEach(function (c) {
        if (c.transition) {
          const bd = boundaryOfKind(c.kind) || (c.from === 'sc' || c.to === 'sc' ? 'melt' : null);
          const rec = { n: ++tr.seq, sub: id, from: c.from, to: c.to, kind: c.kind, bd: bd, T: c.T, P: c.P, mode: mode };
          tr.records.push(rec);
          if (tr.records.length > 200) tr.records.shift();
          ev.push({ type: 'cross', data: { sub: id, from: c.from, to: c.to, kind: c.kind, T: c.T, P: c.P, mode: mode } });
          if (bd === 'vap' || bd === 'sub') {
            const p = pairOf(id, bd);
            if (p) {
              const ref = bd === 'vap' ? SUBS[id].dHvapRef : SUBS[id].dHsubRef;
              ev.push({ type: 'clap', data: Object.assign({ sub: id, kind: bd, ref: ref, err: p.dH / ref - 1 }, p) });
              const q = pairOf(id, bd === 'vap' ? 'sub' : 'vap');
              if (q) {
                const pv = bd === 'vap' ? p : q, ps = bd === 'vap' ? q : p, Tt = SUBS[id].Tt;
                const dHf = ps.dH - pv.dH, refF = SUBS[id].dHfusRef;
                const span = Math.max(Math.abs(pv.T1 - Tt), Math.abs(pv.T2 - Tt), Math.abs(ps.T1 - Tt), Math.abs(ps.T2 - Tt));
                ev.push({ type: 'hess', data: { sub: id, dHsub: ps.dH, dHvap: pv.dH, dHfus: dHf, ref: refF, err: dHf / refF - 1, span: span, rSub: ps.ratio, rVap: pv.ratio, drag: ps.drag || pv.drag } });
              }
            }
          }
          tr.orig = fluidOf(c.to); tr.viaSC = false;
        } else {
          if (c.to === 'sc') tr.viaSC = true;
          else if (c.from === 'sc') {
            const f = fluidOf(c.to);
            if (f && tr.orig && tr.orig !== f && tr.viaSC) ev.push({ type: 'around', data: { sub: id, from: tr.orig, to: f, T: c.T, P: c.P } });
            tr.orig = f; tr.viaSC = false;
          }
        }
      });
      return { changes: ch, events: ev };
    };
    tr.state = function (id, T, P, via) {
      const ph = phase(id, T, P), line = lineOf(id, T, P), rd = reduced(id, T, P);
      if (line === 'critical') tr.crit[id] = true;
      if (line === 'triple') tr.triple[id] = true;
      const fluid = line === 'vap' || line === 'critical' || (!line && ph !== 'solid');
      tr.red[id] = { Tr: rd.Tr, Pr: rd.Pr, fluid: fluid };
      const others = Object.keys(tr.red).filter(function (k) { return k !== id; }).map(function (k) { return Object.assign({ sub: k }, tr.red[k]); });
      return { sub: id, T: T, P: P, phase: ph, line: line, Tr: rd.Tr, Pr: rd.Pr, fluid: fluid, via: via,
        crit: Object.keys(tr.crit), triple: Object.keys(tr.triple), others: others };
    };
    return tr;
  }

  return {
    R: R, ATM: ATM, SUBS: SUBS, ORDER: ORDER, I2_VAP: I2_VAP, I2_MSLOPE: I2_MSLOPE, TOL: TOL,
    lineOf: lineOf, lineFaces: lineFaces, boundaryOfKind: boundaryOfKind, tracker: tracker,
    psub: psub, pvap: pvap, pmelt: pmelt, meltSlope: meltSlope, gasBoundary: gasBoundary, phase: phase,
    Tboil: Tboil, Tsubl: Tsubl, Tmelt: Tmelt, dHslope: dHslope, twoPoint: twoPoint, satDensity: satDensity,
    reduced: reduced, isTransition: isTransition, kindOf: kindOf, pathChanges: pathChanges, skate: skate
  };
});
