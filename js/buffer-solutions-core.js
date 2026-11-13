/*
 * buffer-solutions-core.js — 「緩衝溶液」的化學核心（與畫面無關，Node 可直接 require）
 *
 * 單位：濃度 M（mol/L）、體積 mL、莫耳數 mmol（M × mL = mmol）。溫度固定 25 °C。
 *
 * 三種緩衝系統（弱酸 HA 與它的共軛鹼 A，都用常見的試劑配製）：
 *   ac：醋酸 CH3COOH ＋ 醋酸鈉 CH3COONa              Ka = 1.8e-5（pKa 4.74）
 *   ph：磷酸二氫鈉 NaH2PO4 ＋ 磷酸氫二鈉 Na2HPO4       H3PO4 的 Ka1 7.5e-3、Ka2 6.2e-8、Ka3 4.2e-13（這一對用 Ka2，pKa 7.21）
 *   nh：氯化銨 NH4Cl ＋ 氨 NH3                        NH4+ 的 Ka = Kw/Kb，Kb(NH3) = 1.8e-5（pKa 9.26）
 * 平衡常數取自 OpenStax Chemistry 2e 附錄 H、I（25 °C）。
 *
 * 解法（任何組成都用同一套，不用亨德森公式）：
 *   把燒杯裡的溶液記成「弱酸系統的總莫耳數 nT、Na+ 莫耳數、Cl- 莫耳數、體積 V」。
 *   多質子酸 HnX 失去 i 個質子的粒子所占比例 αi ∝ Ka1·Ka2·…·Kai / [H+]^i（Σαi = 1）。
 *   電荷平衡：[H+] + [Na+] − [OH-] − [Cl-] + (nT/V)·Σ (z0 − i)·αi = 0（z0 是完全質子化時的電荷，NH4+ 為 +1）。
 *   左邊隨 [H+] 單調遞增，所以恰有一個根；對 log10[H+] 用二分法求到 1e-13 以內。
 * 緩衝容量（每公升溶液使 pH 改變 1 所需的強鹼莫耳數）：
 *   β = ln10 · ( [H+] + [OH-] + (nT/V)·( Σ i²αi − (Σ iαi)² ) )
 * 不考慮活性係數（理想的稀薄溶液）與溫度變化；強酸、強鹼完全解離；NaCl 只是旁觀離子。
 */
(function (root) {
  'use strict';

  const KW = 1.0e-14;
  const LN10 = Math.LN10;
  const DROP_ML = 0.05;     // 一滴的體積（mL）
  const BEAKER_ML = 250;    // 燒杯容量（mL）

  /**
   * 緩衝系統：Ka（由完全質子化開始）、z0（完全質子化時的電荷）、pair（弱酸 HA 已失去幾個質子；共軛鹼多失去一個）
   * acid／base：配製用的試劑（化學式用 ASCII，數字由頁面轉成下標）
   */
  const SYSTEMS = {
    ac: { Ka: [1.8e-5], z0: 0, pair: 0, acid: 'CH3COOH', base: 'CH3COONa', HA: 'CH3COOH', A: 'CH3COO-' },
    ph: { Ka: [7.5e-3, 6.2e-8, 4.2e-13], z0: 0, pair: 1, acid: 'NaH2PO4', base: 'Na2HPO4', HA: 'H2PO4-', A: 'HPO4 2-' },
    nh: { Ka: [KW / 1.8e-5], z0: 1, pair: 0, acid: 'NH4Cl', base: 'NH3', HA: 'NH4+', A: 'NH3' }
  };
  function sysOf(s) { const S = SYSTEMS[s]; if (!S) throw new Error('未知的緩衝系統：' + s); return S; }
  /** 這一對的 pKa */
  function pKa(s) { const S = sysOf(s); return -Math.log10(S.Ka[S.pair]); }
  /** 所有的 pKa（磷酸三個） */
  function pKas(s) { return sysOf(s).Ka.map(function (k) { return -Math.log10(k); }); }

  /** 失去 i 個質子的粒子帶的電荷，對應的旁觀離子：負電荷配 Na+、正電荷配 Cl- */
  function counter(S, i) { const q = S.z0 - i; return q < 0 ? { Na: -q, Cl: 0 } : { Na: 0, Cl: q }; }

  /**
   * 配製一杯溶液：弱酸濃度 CHA、共軛鹼濃度 CA（M），體積 V（mL）
   * 傳回 { sys, nT, Na, Cl, V }（莫耳數 mmol）；sys 為 null 表示沒有弱酸系統（純水或強酸、強鹼溶液）
   */
  function make(s, CHA, CA, V) {
    const S = sysOf(s), nHA = Math.max(0, +CHA) * V, nA = Math.max(0, +CA) * V;
    const a = counter(S, S.pair), b = counter(S, S.pair + 1);
    return { sys: s, nT: nHA + nA, Na: a.Na * nHA + b.Na * nA, Cl: a.Cl * nHA + b.Cl * nA, V: +V };
  }
  /** 純水、或濃度 c 的強酸（c > 0，HCl）／強鹼（c < 0，NaOH）溶液 */
  function strong(c, V) { return { sys: null, nT: 0, Na: c < 0 ? -c * V : 0, Cl: c > 0 ? c * V : 0, V: +V }; }
  function copy(sol) { return { sys: sol.sys, nT: sol.nT, Na: sol.Na, Cl: sol.Cl, V: sol.V }; }
  /** 加入 HCl（acid mmol）、NaOH（base mmol）與總體積 dV mL：傳回新的溶液，不改原物件 */
  function add(sol, acid, base, dV) {
    const o = copy(sol);
    o.Cl += acid || 0; o.Na += base || 0; o.V += dV || 0;
    return o;
  }

  /** 各粒子比例 αi（i = 失去的質子數）與 Σiα、Σi²α */
  function fractions(S, h) {
    const n = S.Ka.length, t = [1];
    for (let i = 1; i <= n; i++) t.push(t[i - 1] * S.Ka[i - 1] / h);
    // 避免溢位：同除以最大項
    let mx = 0; t.forEach(function (x) { if (x > mx) mx = x; });
    let sum = 0;
    const a = t.map(function (x) { const y = x / mx; sum += y; return y; });
    let m1 = 0, m2 = 0;
    for (let i = 0; i <= n; i++) { a[i] /= sum; m1 += i * a[i]; m2 += i * i * a[i]; }
    return { a: a, m1: m1, m2: m2 };
  }

  /** 電荷平衡（隨 x = log10[H+] 遞增） */
  function chargeFn(sol) {
    const S = sol.sys ? SYSTEMS[sol.sys] : null, V = sol.V, D = (sol.Na - sol.Cl) / V, cT = sol.nT / V;
    return function (x) {
      const h = Math.pow(10, x);
      let f = h - KW / h + D;
      if (S && cT > 0) f += cT * (S.z0 - fractions(S, h).m1);
      return f;
    };
  }
  /** 解出 [H+]（M） */
  function solveH(sol) {
    const f = chargeFn(sol);
    let lo = -18, hi = 3;
    while (f(lo) > 0 && lo > -40) lo -= 2;
    while (f(hi) < 0 && hi < 10) hi += 2;
    for (let i = 0; i < 200 && hi - lo > 1e-13; i++) {
      const mid = 0.5 * (lo + hi);
      if (f(mid) > 0) hi = mid; else lo = mid;
    }
    return Math.pow(10, 0.5 * (lo + hi));
  }
  function pH(sol) { return -Math.log10(solveH(sol)); }

  /**
   * 溶液的完整狀態：pH、[H+]、[OH-]、各粒子濃度、弱酸 HA 與共軛鹼 A 這一對的莫耳數、緩衝容量 β（M/pH）
   * nHA：比共軛鹼多（含）一個以上質子的粒子總莫耳數；nA：其餘（含更去質子化的形式）
   */
  function state(sol) {
    const h = solveH(sol), oh = KW / h, V = sol.V;
    const out = { h: h, oh: oh, pH: -Math.log10(h), V: V, nH: h * V, nOH: oh * V, nT: sol.nT, alpha: null, nHA: 0, nA: 0, beta: LN10 * (h + oh) };
    if (sol.sys && sol.nT > 0) {
      const S = SYSTEMS[sol.sys], fr = fractions(S, h);
      out.alpha = fr.a;
      let fHA = 0;
      for (let i = 0; i <= S.pair; i++) fHA += fr.a[i];
      out.nHA = sol.nT * fHA;
      out.nA = sol.nT * (1 - fHA);
      out.beta += LN10 * (sol.nT / V) * (fr.m2 - fr.m1 * fr.m1);
    }
    return out;
  }
  /** 緩衝容量 β（M/pH） */
  function beta(sol) { return state(sol).beta; }

  /** 亨德森–哈塞爾巴赫公式：pH ≈ pKa + log(nA/nHA)（用配製與加入的莫耳數，不計弱酸本身的解離）；不適用時傳回 null */
  function hhPH(s, nHA, nA) {
    if (!(nHA > 0) || !(nA > 0)) return null;
    return pKa(s) + Math.log10(nA / nHA);
  }

  /**
   * 要讓 pH 改變 dpH，需要加入多少強酸（dpH < 0）或強鹼（dpH > 0）的莫耳數（mmol，正值）；
   * 加入的是濃度 cs（M）的溶液（體積跟著增加）。做不到（超過 nMax）傳回 null。
   */
  function toShift(sol, dpH, cs, nMax) {
    const p0 = pH(sol), target = p0 + dpH, up = dpH > 0;
    nMax = nMax || 1e4;
    const at = function (n) { return pH(add(sol, up ? 0 : n, up ? n : 0, cs ? n / cs : 0)); };
    const pm = at(nMax);
    if (up ? pm < target : pm > target) return null;
    let lo = 0, hi = nMax;
    for (let i = 0; i < 200 && hi - lo > 1e-12 * Math.max(1, hi); i++) {
      const mid = 0.5 * (lo + hi), p = at(mid);
      if (up ? p < target : p > target) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
  }

  /** 理論曲線：由 nA0 加強酸到 nB 加強鹼（mmol，負值代表強酸），濃度 cs 的溶液 */
  function curve(sol, cs, nMin, nMax, steps) {
    const out = [];
    for (let k = 0; k <= steps; k++) {
      const n = nMin + (nMax - nMin) * k / steps;
      const s = add(sol, n < 0 ? -n : 0, n > 0 ? n : 0, cs ? Math.abs(n) / cs : 0);
      out.push({ n: n, pH: pH(s) });
    }
    return out;
  }

  // ======================= 一次實驗（頁面與任務證明共用） =======================
  /**
   * 對照燒杯：water 純水、same 與緩衝溶液起始 pH 相同的強酸（或強鹼）溶液、dil10 同一緩衝溶液稀釋 10 倍、
   *           acid 只有弱酸（濃度同 CHA）、base 只有共軛鹼（濃度同 CA）
   */
  const COMPARES = ['water', 'same', 'dil10', 'acid', 'base'];
  function compareSol(p, buf) {
    const V = p.V0;
    switch (p.comp) {
      case 'same': { const h = solveH(buf); return strong(h - KW / h, V); }
      case 'dil10': return make(p.sys, p.CHA / 10, p.CA / 10, V);
      case 'acid': return make(p.sys, p.CHA, 0, V);
      case 'base': return make(p.sys, 0, p.CA, V);
      default: return strong(0, V);
    }
  }
  /** 新的一次實驗：p = { sys, CHA, CA, V0, comp } */
  function createRun(p) {
    const q = { sys: p.sys, CHA: +p.CHA, CA: +p.CA, V0: +p.V0, comp: COMPARES.indexOf(p.comp) >= 0 ? p.comp : 'water' };
    sysOf(q.sys);
    const buf = make(q.sys, q.CHA, q.CA, q.V0), cmp = compareSol(q, buf);
    const sb = state(buf), sc = state(cmp);
    return {
      p: q, buf: buf, cmp: cmp, sb: sb, sc: sc,
      pH0: sb.pH, pHc0: sc.pH, nHA0: q.CHA * q.V0, nA0: q.CA * q.V0,
      acid: 0, base: 0, water: 0, maxAcid: 0, maxBase: 0, pHmin: sb.pH, pHmax: sb.pH,
      pts: [{ n: 0, pH: sb.pH, pHc: sc.pH, kind: 'start' }]
    };
  }
  /**
   * 加入：kind 'acid'（HCl）、'base'（NaOH）、'water'；mL 是加入的體積，cs 是強酸或強鹼的濃度（M）
   * 兩個燒杯加入同樣的東西。超過燒杯容量就不加，傳回 { ok: false, reason: 'full' }。
   */
  function addTo(run, kind, mL, cs) {
    if (!(mL > 0)) return { ok: false, reason: 'zero' };
    if (run.buf.V + mL > BEAKER_ML + 1e-9 || run.cmp.V + mL > BEAKER_ML + 1e-9) return { ok: false, reason: 'full' };
    const n = kind === 'water' ? 0 : mL * cs;
    const a = kind === 'acid' ? n : 0, b = kind === 'base' ? n : 0;
    const pb = run.sb.pH, pc = run.sc.pH;
    run.buf = add(run.buf, a, b, mL);
    run.cmp = add(run.cmp, a, b, mL);
    run.sb = state(run.buf); run.sc = state(run.cmp);
    run.acid += a; run.base += b;
    if (kind === 'water') run.water += mL;
    const net = run.base - run.acid;
    run.maxAcid = Math.max(run.maxAcid, -net);
    run.maxBase = Math.max(run.maxBase, net);
    run.pHmin = Math.min(run.pHmin, run.sb.pH);
    run.pHmax = Math.max(run.pHmax, run.sb.pH);
    run.pts.push({ n: net, pH: run.sb.pH, pHc: run.sc.pH, kind: kind });
    return { ok: true, kind: kind, mL: mL, n: n, sdpH: run.sb.pH - pb, sdpHc: run.sc.pH - pc };
  }
  /** 'mix' 事件的資料：配好（或改了配方、對照）的時候 */
  function mixData(run) {
    const p = run.p;
    return { sys: p.sys, pKa: pKa(p.sys), pKas: pKas(p.sys), CHA: p.CHA, CA: p.CA, V0: p.V0, nHA0: run.nHA0, nA0: run.nA0, nT0: run.nHA0 + run.nA0,
      comp: p.comp, pH: run.pH0, pHHH: hhPH(p.sys, run.nHA0, run.nA0), pHc: run.pHc0, beta: run.sb.beta, betaC: run.sc.beta };
  }
  /** 'add' 事件的資料：每加入一次之後 */
  function addData(run, r, cs) {
    const p = run.p;
    return { sys: p.sys, pKa: pKa(p.sys), pKas: pKas(p.sys), CHA: p.CHA, CA: p.CA, V0: p.V0, nHA0: run.nHA0, nA0: run.nA0, nT0: run.nHA0 + run.nA0,
      comp: p.comp, pH0: run.pH0, pH: run.sb.pH, dpH: run.sb.pH - run.pH0, pHc0: run.pHc0, pHc: run.sc.pH, dpHc: run.sc.pH - run.pHc0,
      acid: run.acid, base: run.base, net: run.base - run.acid, water: run.water, V: run.buf.V, f: run.buf.V / p.V0,
      maxAcid: run.maxAcid, maxBase: run.maxBase, pHmin: run.pHmin, pHmax: run.pHmax,
      kind: r.kind, step: r.kind === 'water' ? r.mL : r.n, sdpH: r.sdpH, sdpHc: r.sdpHc, beta: run.sb.beta, betaC: run.sc.beta, cs: cs };
  }

  // ======================= 萬用指示劑的顏色（示意） =======================
  // pH → 顏色（常見萬用指示劑色卡的近似值；各廠牌略有不同）
  const UI_STOPS = [
    [0, [196, 30, 42]], [2, [226, 54, 40]], [3, [238, 104, 36]], [4, [246, 150, 40]], [5, [244, 196, 48]], [6, [216, 214, 52]],
    [7, [96, 178, 72]], [8, [40, 150, 120]], [9, [36, 112, 178]], [10, [52, 76, 168]], [11, [86, 58, 152]], [12, [110, 46, 132]], [14, [104, 36, 110]]
  ];
  function uiColor(x) {
    if (!isFinite(x)) return UI_STOPS[7][1].slice();
    if (x <= UI_STOPS[0][0]) return UI_STOPS[0][1].slice();
    for (let i = 1; i < UI_STOPS.length; i++) {
      const a = UI_STOPS[i - 1], b = UI_STOPS[i];
      if (x <= b[0]) { const u = (x - a[0]) / (b[0] - a[0]); return a[1].map(function (c, k) { return Math.round(c + (b[1][k] - c) * u); }); }
    }
    return UI_STOPS[UI_STOPS.length - 1][1].slice();
  }

  const api = {
    KW: KW, DROP_ML: DROP_ML, BEAKER_ML: BEAKER_ML, SYSTEMS: SYSTEMS, COMPARES: COMPARES,
    pKa: pKa, pKas: pKas, make: make, strong: strong, add: add, copy: copy, fractions: fractions,
    solveH: solveH, pH: pH, state: state, beta: beta, hhPH: hhPH, toShift: toShift, curve: curve,
    compareSol: compareSol, createRun: createRun, addTo: addTo, mixData: mixData, addData: addData, uiColor: uiColor
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BufCore = api;
})(typeof window !== 'undefined' ? window : this);
