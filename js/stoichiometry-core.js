/*
 * stoichiometry-core.js — 「化學計量與限量試劑」的化學核心（與畫面無關，Node 可直接 require）
 *
 * 反應：Mg(s) + 2HCl(aq) → MgCl2(aq) + H2(g)，氫氣用排水集氣法收集在倒立於水槽的量筒裡。
 *
 * 數據與單位：
 *   - 原子量 Mg 24.305、O 15.999（IUPAC 標準原子量的慣用值）；MgO 40.304。
 *   - R = 8.314462618 J/(mol·K)（2019 SI 定義值）= 62363.6 mmHg·mL/(mol·K) = 0.0820574 L·atm/(mol·K)。
 *   - 標準狀況（STP）照臺灣高中課本：0 °C、1 atm（760 mmHg），理想氣體莫耳體積 22.414 L/mol。
 *   - 水的飽和蒸氣壓：IAPWS 的 Wagner–Pruss 飽和曲線公式（J. Phys. Chem. Ref. Data 31, 387, 2002；
 *     CRC Handbook「水的蒸氣壓」表就是用它算的），0–40 °C 誤差遠小於 0.1%。
 *   - 1 cm 水柱 = 0.7334 mmHg（水的密度取 0.997 g/mL、g = 9.80665 m/s²）。
 *   - 量筒內的氣體是氫氣（與被推出來的瓶中空氣，體積相同）加飽和水蒸氣；氫氣當理想氣體，不計溶解。
 *
 * 反應速率只是示意（產量是精確的）：dξ/dt = k(T)·(n_Mg − ξ)·[H+]，[H+] = (n_HCl − 2ξ)/V，
 *   k(25 °C) = 0.1 L/(mol·s)、活化能 40 kJ/mol（阿瑞尼斯）。這個式子有解析解（見 extentAt）。
 *   限量試劑剩 0.1% 時算「反應結束」，之後產量直接取理論值。
 * 鎂帶沒磨亮時（示意）：質量的 2% 是氧化鎂，先和鹽酸反應（MgO + 2HCl → MgCl2 + H2O，不產生氫氣），並延後 4 s 才開始冒泡。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StoichCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const M_MG = 24.305;
  const M_MGO = 40.304;
  const R_J = 8.314462618;
  const MMHG_PA = 101325 / 760;                // 1 mmHg（取 1 torr = 101325/760 Pa）
  const R_ML = R_J / MMHG_PA * 1e6;            // mmHg·mL/(mol·K)
  const R_LATM = R_J / 101325 * 1000;          // L·atm/(mol·K)
  const T0K = 273.15;
  const VM_STP = R_LATM * T0K;                 // 22.414 L/mol（0 °C、1 atm）
  const VM_25 = R_LATM * 298.15;               // 24.465 L/mol（25 °C、1 atm）
  const CMH2O = 0.997 * 9.80665 * 10 / MMHG_PA;  // 1 cm 水柱的壓力（mmHg）≈ 0.7334
  const OXIDE = 0.02;                          // 沒磨亮：氧化鎂占質量的比例（示意）
  const OXIDE_DELAY = 4;                       // 沒磨亮：開始冒泡前的延遲（s，示意）
  const K25 = 0.1, EA = 40000;                 // 速率常數 L/(mol·s)、活化能 J/mol（示意）
  const END_FRAC = 1e-3;                       // 限量試劑剩 0.1% 算反應結束
  const RIBBON_G_PER_CM = 0.013;               // 鎂帶線密度（寬 3 mm、厚 0.25 mm）

  /** 量筒：容量 cap（mL）、最小刻度 div（mL）、內徑 d（cm）；
   *  刻度長 Lcap = cap/A；筒內全長（底到口）Lin = 1.1 Lcap；夾住時筒口在水面下 2 cm；最低刻度 low。 */
  const CYLINDERS = {};
  [[25, 0.5, 1.8], [100, 1, 2.7], [250, 2, 3.7]].forEach(function (r) {
    const A = Math.PI * r[2] * r[2] / 4, Lcap = r[0] / A;
    CYLINDERS[r[0]] = { cap: r[0], div: r[1], d: r[2], A: A, Lcap: Lcap, Lin: 1.1 * Lcap, mouth: 2, Htop: 1.1 * Lcap - 2, low: r[0] * 0.1 };
  });

  /** 水的飽和蒸氣壓（kPa），IAPWS Wagner–Pruss 公式 */
  const WP = [-7.85951783, 1.84408259, -11.7866497, 22.6807411, -15.9618719, 1.80122502];
  function vaporKPa(tC) {
    const T = tC + T0K, x = 1 - T / 647.096;
    return 22064 * Math.exp(647.096 / T * (WP[0] * x + WP[1] * Math.pow(x, 1.5) + WP[2] * x * x * x + WP[3] * Math.pow(x, 3.5) + WP[4] * x * x * x * x + WP[5] * Math.pow(x, 7.5)));
  }
  /** 水的飽和蒸氣壓（mmHg） */
  function vapor(tC) { return vaporKPa(tC) * 1000 / MMHG_PA; }

  /** 反應物的量。o：{ m（g）, c（mol/L）, V（mL）, polished } */
  function amounts(o) {
    const fOx = o.polished === false ? OXIDE : 0;
    const nMg = o.m * (1 - fOx) / M_MG;
    const nMgO = o.m * fOx / M_MGO;
    const nHCl = o.c * o.V / 1000;
    const nFree = Math.max(0, nHCl - 2 * nMgO);   // 氧化鎂用掉以後，還能和鎂反應的 HCl
    const xiMax = Math.min(nMg, nFree / 2);
    const rel = nMg > 0 ? (nFree - 2 * nMg) / (2 * nMg) : 1;
    const lim = Math.abs(rel) < 1e-9 ? 'both' : rel > 0 ? 'Mg' : 'HCl';
    return {
      nMg: nMg, nMgO: nMgO, nHCl: nHCl, nFree: nFree, xiMax: xiMax, lim: lim,
      ratio: nMg > 0 ? nHCl / (o.m / M_MG) : Infinity,   // 學生算的「HCl 莫耳數 ÷ 鎂的莫耳數」（當成純鎂）
      nH2: xiMax, MgLeft: nMg - xiMax, HClLeft: nFree - 2 * xiMax
    };
  }

  function rateK(tC) { return K25 * Math.exp(-EA / R_J * (1 / (tC + T0K) - 1 / 298.15)); }

  /** 反應進度 ξ（mol，等於產生的 H2 莫耳數）：解析解，時間 t 從鎂帶放進酸裡算起 */
  function extentAt(o, t) {
    const A = amounts(o);
    const te = t - (o.polished === false ? OXIDE_DELAY : 0);
    if (te <= 0 || A.xiMax <= 0) return 0;
    if (te >= endTime(o)) return A.xiMax;
    const a = A.nMg, b = A.nFree, kk = rateK(o.T) / (o.V / 1000), D = b - 2 * a;
    let u;
    if (Math.abs(D) < 1e-9 * a) u = 1 / (1 / a + 2 * kk * te);
    else {
      const den = (b / a) * Math.expm1(D * kk * te) + D / a;
      u = D / den;
    }
    if (!(u >= 0)) u = 0;
    return Math.max(0, Math.min(A.xiMax, a - u));
  }
  /** 反應結束的時間（限量試劑剩 0.1%），含沒磨亮的延遲 */
  function endTime(o) {
    const A = amounts(o);
    const delay = o.polished === false ? OXIDE_DELAY : 0;
    if (A.xiMax <= 0) return delay;
    const a = A.nMg, b = A.nFree, kk = rateK(o.T) / (o.V / 1000), D = b - 2 * a;
    let t;
    if (Math.abs(D) < 1e-9 * a) { const u = END_FRAC * a; t = (1 / u - 1 / a) / (2 * kk); }
    else {
      let u, w;
      if (D > 0) { u = END_FRAC * a; w = D + 2 * u; }
      else { w = END_FRAC * b; u = (w - D) / 2; }
      t = Math.log((a / b) * w / u) / (D * kk);
    }
    return delay + Math.max(0, t);
  }
  /** 反應速率（mol/s），畫氣泡用 */
  function rateAt(o, t) {
    const dt = 0.05;
    return Math.max(0, (extentAt(o, t + dt) - extentAt(o, Math.max(0, t - dt))) / (t > dt ? 2 * dt : t + dt));
  }

  /**
   * 量筒內的氣體狀態。nGas：量筒內「乾氣體」（氫氣＋被推出的空氣）的莫耳數；aligned：內外液面相平。
   * 沒對齊時量筒夾在固定高度（筒口在水面下 2 cm），筒內水面高出水槽 h（cm），氣體壓力 = P − h·(水柱)。
   * 傳回 { V（mL）, h（cm，筒內水面高出水槽水面）, Pgas, Pw, Pdry（mmHg）, full（氣體已到筒口）}
   */
  function gasState(cyl, nGas, tC, P, aligned) {
    const C = typeof cyl === 'object' ? cyl : CYLINDERS[cyl];
    const Pw = vapor(tC), nRT = nGas * R_ML * (tC + T0K);
    const Vmax = C.A * C.Lin;
    let V, h, Pgas;
    if (aligned) {
      Pgas = P; h = 0; V = nRT / (P - Pw);
      if (V > Vmax) V = Vmax;
    } else {
      // (k/A)V² + (P − Pw − k·Htop)V − nRT = 0
      const k = CMH2O, qa = k / C.A, qb = P - Pw - k * C.Htop;
      V = nRT > 0 ? 2 * nRT / (qb + Math.sqrt(qb * qb + 4 * qa * nRT)) : 0;
      if (V > Vmax) V = Vmax;
      h = C.Htop - V / C.A;
      Pgas = P - CMH2O * h;
    }
    return { V: V, h: h, Pgas: Pgas, Pw: Pw, Pdry: Pgas - Pw, full: V >= Vmax - 1e-9 };
  }
  /** 量筒最多能裝的乾氣體莫耳數（氣體到筒口；再多就從筒口冒出去） */
  function capacityMol(cyl, tC, P, aligned) {
    const C = typeof cyl === 'object' ? cyl : CYLINDERS[cyl];
    const Pgas = aligned ? P : P + CMH2O * C.mouth;
    return (Pgas - vapor(tC)) * C.A * C.Lin / (R_ML * (tC + T0K));
  }

  /** 一次實驗。o：{ m, c, V, T, P, cyl, polished }；aligned 可隨時切換 */
  function createRun(o) {
    const r = {
      o: Object.assign({ polished: true, cyl: 100 }, o), t: 0, started: false, ended: false, tEnd: 0,
      aligned: false, nMade: 0, nEsc: 0, escaped: false
    };
    r.A = amounts(r.o);
    r.tEnd = endTime(r.o);
    return r;
  }
  function settle(r) {
    const cap = capacityMol(r.o.cyl, r.o.T, r.o.P, r.aligned);
    if (r.nMade - r.nEsc > cap + 1e-15) { r.nEsc = r.nMade - cap; r.escaped = true; }
  }
  function start(r) { r.started = true; }
  function setTime(r, t) {
    if (!r.started) return;
    r.t = Math.max(r.t, t);
    if (r.t >= r.tEnd) { r.t = Math.max(r.t, r.tEnd); r.ended = true; }
    r.nMade = r.ended ? r.A.xiMax : extentAt(r.o, r.t);
    settle(r);
  }
  function step(r, dt) { setTime(r, r.t + dt); }
  function setAligned(r, on) { r.aligned = !!on; settle(r); }
  function nGas(r) { return Math.max(0, r.nMade - r.nEsc); }
  function gas(r) { return gasState(r.o.cyl, nGas(r), r.o.T, r.o.P, r.aligned); }
  /** 目前剩下的鎂（g，含沒反應的部分；氧化鎂一開始就溶掉）與鹽酸（mol） */
  function left(r) {
    const xi = r.nMade;
    const mgO = r.started ? 0 : r.A.nMgO * M_MGO;
    return { mMg: Math.max(0, (r.A.nMg - xi) * M_MG) + mgO, nHCl: r.started ? Math.max(0, r.A.nFree - 2 * xi) : r.A.nHCl, xi: xi };
  }

  /**
   * 學生的計算。inp：{ reading（mL）, lim（'Mg'／'HCl'：學生認定的限量試劑）, vap（是否扣除水蒸氣壓）}
   * 學生一律假設量筒內氣體壓力 = 大氣壓（以為液面相平）、鎂帶是純鎂、HCl 濃度照標示。
   */
  function analyze(o, inp) {
    const TK = o.T + T0K, Pw = inp.vap ? vapor(o.T) : 0, PH2 = o.P - Pw, Vr = inp.reading;
    const nH2 = PH2 * Vr / (R_ML * TK);
    const Vstp = Vr * (PH2 / 760) * (T0K / TK);
    const V25 = Vr * (PH2 / 760) * (298.15 / TK);
    const nMgS = o.m / M_MG, nHClS = o.c * o.V / 1000;
    const out = { TK: TK, Pw: Pw, PH2: PH2, nH2: nH2, Vstp: Vstp, V25: V25, nMgS: nMgS, nHClS: nHClS, lim: inp.lim };
    if (inp.lim === 'Mg') {
      out.nRef = nMgS;
      out.M = nH2 > 0 ? o.m / nH2 : Infinity; out.Merr = out.M / M_MG - 1;
      out.cHCl = null; out.cErr = null;
    } else {
      out.nRef = nHClS / 2;
      out.cHCl = 2 * nH2 / (o.V / 1000); out.cErr = out.cHCl / o.c - 1;
      out.M = null; out.Merr = null;
    }
    out.Vm = out.nRef > 0 ? Vstp / 1000 / out.nRef : Infinity;   // L/mol（STP）
    out.VmErr = out.Vm / VM_STP - 1;
    out.yieldPct = out.nRef > 0 ? nH2 / out.nRef * 100 : 0;
    return out;
  }

  /** 讀數的刻度位置：最小刻度 div；在刻度範圍內（最低刻度 ～ 容量） */
  function onScale(cyl, V) { const C = CYLINDERS[cyl]; return V >= C.low - 1e-9 && V <= C.cap + 1e-9; }

  /** 鎂帶長度（cm） */
  function ribbonLength(m) { return m / RIBBON_G_PER_CM; }

  /** 要收集到體積 V（mL，液面相平）需要的氫氣莫耳數 */
  function molForVolume(V, tC, P) { return (P - vapor(tC)) * V / (R_ML * (tC + T0K)); }

  return {
    M_MG: M_MG, M_MGO: M_MGO, R_J: R_J, R_ML: R_ML, R_LATM: R_LATM, T0K: T0K, VM_STP: VM_STP, VM_25: VM_25,
    CMH2O: CMH2O, OXIDE: OXIDE, OXIDE_DELAY: OXIDE_DELAY, K25: K25, EA: EA, END_FRAC: END_FRAC, RIBBON_G_PER_CM: RIBBON_G_PER_CM,
    CYLINDERS: CYLINDERS, vapor: vapor, vaporKPa: vaporKPa, amounts: amounts, rateK: rateK, extentAt: extentAt, endTime: endTime, rateAt: rateAt,
    gasState: gasState, capacityMol: capacityMol, createRun: createRun, start: start, setTime: setTime, step: step, setAligned: setAligned,
    nGas: nGas, gas: gas, left: left, analyze: analyze, onScale: onScale, ribbonLength: ribbonLength, molForVolume: molForVolume
  };
});
