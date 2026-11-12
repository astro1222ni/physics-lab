/*
 * acid-base-titration-core.js — 「酸鹼滴定」的化學核心（與畫面無關，Node 可直接 require）
 *
 * 單位：濃度 M（mol/L）、體積 mL、物質的量 mmol（M × mL = mmol）。溫度固定 25 °C。
 * 平衡常數（25 °C）：Kw = 1.0e-14、醋酸 Ka = 1.8e-5、氨 Kb = 1.8e-5（銨離子 Ka = Kw/Kb）。
 *
 * 解法（任何時刻、任何組合都用同一套，不用只在某些區間成立的近似公式）：
 *   錐形瓶內的溶液一定電中性（電荷平衡）：
 *     [H+] + [Na+] + [NH4+] = [OH-] + [Cl-] + [A-]
 *   再代入 [OH-] = Kw/[H+]、[A-] = C_A·Ka/(Ka + [H+])、[NH4+] = C_N·[H+]/([H+] + Kw/Kb)，
 *   方程式只剩一個未知數 [H+]。左邊減右邊隨 [H+] 單調遞增，所以恰有一個根；
 *   對 x = log10[H+] 用二分法求到 1e-14 以內（pH 準到小數點後十幾位）。
 *   為了在當量點附近不因相減而失去精度，把式子整理成
 *     f = [H+] − Kw/[H+] + D + Σ C_A·[H+]/(Ka + [H+]) − Σ C_N·K'/([H+] + K')，K' = Kw/Kb
 *   其中 D =（n_Na − n_Cl − Σn_A + Σn_N）/ V 直接由物質的量相減（當量點時 D 恰好是 0）。
 * 不考慮活性係數（稀薄溶液的理想近似）與溫度變化（中和熱使溶液升溫不到 1 °C）。
 *
 * 指示劑 HIn ⇌ H+ + In-：鹼型所占比例 f = 1/(1 + 10^(pKin − pH))。
 * 溶液的顏色：兩種型的吸光度依比例相加（比爾定律），再換成穿透光的 RGB。
 */
(function (root) {
  'use strict';

  // ======================= 常數 =======================
  const KW = 1.0e-14;     // 水的離子積（25 °C）
  const KA_HAC = 1.8e-5;  // 醋酸 CH3COOH 的解離常數 Ka
  const KB_NH3 = 1.8e-5;  // 氨 NH3 的解離常數 Kb
  const DROP_ML = 0.05;   // 一滴的體積（mL）
  const UNIT_ML = 0.025;  // 最小加入量：半滴（mL）；頁面的體積一律記成半滴的整數倍
  const UNITS_PER_ML = 40;
  const BURETTE_ML = 50;  // 滴定管容量（mL）
  const BURETTE_UNITS = BURETTE_ML * UNITS_PER_ML;

  /**
   * 滴定組合：sa 強酸（HCl）＋強鹼（NaOH）、wa 弱酸（CH3COOH）＋強鹼、wb 弱鹼（NH3）＋強酸（HCl）、
   *          mx 未知弱酸 HX（濃度與 Ka 未知）＋強鹼。titrant：滴定管裡的溶液。
   */
  const SYSTEMS = {
    sa: { analyte: 'HCl', kind: 'strong-acid', titrant: 'NaOH' },
    wa: { analyte: 'CH3COOH', kind: 'weak-acid', titrant: 'NaOH', Ka: KA_HAC },
    wb: { analyte: 'NH3', kind: 'weak-base', titrant: 'HCl', Kb: KB_NH3 },
    mx: { analyte: 'HX', kind: 'weak-acid', titrant: 'NaOH' }
  };
  /** 滴定液是鹼（NaOH，pH 上升）→ +1；是酸（HCl，pH 下降）→ −1 */
  function direction(sys) { return SYSTEMS[sys].titrant === 'NaOH' ? 1 : -1; }

  /** 整理參數：{ sys, Ca（待測液濃度 M）, Va（待測液 mL）, Vw（另加的蒸餾水 mL）, Cb（滴定液濃度 M）, Ka? } */
  function setup(p) {
    const s = SYSTEMS[p.sys];
    if (!s) throw new Error('未知的滴定組合：' + p.sys);
    const q = { sys: p.sys, Ca: +p.Ca, Va: +p.Va, Vw: +(p.Vw || 0), Cb: +p.Cb };
    if (s.kind === 'weak-acid') q.Ka = p.sys === 'mx' ? +p.Ka : (p.Ka != null ? +p.Ka : s.Ka);
    if (s.kind === 'weak-base') q.Kb = p.Kb != null ? +p.Kb : s.Kb;
    return q;
  }

  /** 加入 Vb mL 滴定液後，瓶內各成分的物質的量（mmol）與總體積 */
  function totals(p, Vb) {
    const s = SYSTEMS[p.sys];
    const nAnalyte = p.Ca * p.Va, nTitrant = p.Cb * Vb;
    const t = { Vt: p.Va + p.Vw + Vb, nNa: 0, nCl: 0, acids: [], bases: [] };
    if (s.kind === 'strong-acid') t.nCl += nAnalyte;
    else if (s.kind === 'weak-acid') t.acids.push({ n: nAnalyte, Ka: p.Ka });
    else t.bases.push({ n: nAnalyte, Kb: p.Kb });
    if (s.titrant === 'NaOH') t.nNa += nTitrant; else t.nCl += nTitrant;
    return t;
  }

  /** 電荷平衡式（整理後的形式）在 x = log10[H+] 的值；隨 x 單調遞增 */
  function chargeFn(t, Kw) {
    const V = t.Vt;
    let D = t.nNa - t.nCl;
    t.acids.forEach(function (a) { D -= a.n; });
    t.bases.forEach(function (b) { D += b.n; });
    D /= V;
    return function (x) {
      const h = Math.pow(10, x);
      let f = h - Kw / h + D;
      for (let i = 0; i < t.acids.length; i++) { const a = t.acids[i]; f += (a.n / V) * h / (a.Ka + h); }
      for (let i = 0; i < t.bases.length; i++) { const b = t.bases[i], K = Kw / b.Kb; f -= (b.n / V) * K / (h + K); }
      return f;
    };
  }

  /** 由電荷平衡解出 [H+]（M）：對 log10[H+] 二分法 */
  function solveH(t, Kw) {
    Kw = Kw || KW;
    const f = chargeFn(t, Kw);
    let lo = -16, hi = 2;
    while (f(lo) > 0 && lo > -60) lo -= 4;
    while (f(hi) < 0 && hi < 20) hi += 4;
    for (let i = 0; i < 300 && hi - lo > 1e-14; i++) {
      const mid = 0.5 * (lo + hi);
      if (f(mid) > 0) hi = mid; else lo = mid;
    }
    return Math.pow(10, 0.5 * (lo + hi));
  }

  /** 電荷平衡的檢查：正電荷總濃度、負電荷總濃度與相對殘差（守恆檢查用） */
  function balance(t, h, Kw) {
    Kw = Kw || KW;
    const V = t.Vt;
    let pos = h + t.nNa / V, neg = Kw / h + t.nCl / V;
    t.acids.forEach(function (a) { neg += (a.n / V) * a.Ka / (a.Ka + h); });
    t.bases.forEach(function (b) { pos += (b.n / V) * h / (h + Kw / b.Kb); });
    return { pos: pos, neg: neg, residual: Math.abs(pos - neg) / Math.max(pos, neg) };
  }

  /** 加入 Vb mL 後的 pH */
  function pH(p, Vb) { return -Math.log10(solveH(totals(p, Vb))); }

  /** 加入 Vb mL 後各粒子的濃度（M）與 pH */
  function species(p, Vb) {
    const t = totals(p, Vb), h = solveH(t), V = t.Vt;
    const out = { Vt: V, h: h, oh: KW / h, pH: -Math.log10(h), Na: t.nNa / V, Cl: t.nCl / V, HA: 0, A: 0, NH3: 0, NH4: 0 };
    t.acids.forEach(function (a) { const c = a.n / V; out.A += c * a.Ka / (a.Ka + h); out.HA += c * h / (a.Ka + h); });
    t.bases.forEach(function (b) { const c = b.n / V, K = KW / b.Kb; out.NH4 += c * h / (h + K); out.NH3 += c * K / (h + K); });
    return out;
  }

  /** 當量點體積：滴定液的物質的量等於待測物的物質的量，V = n/c = Ca·Va/Cb */
  function Veq(p) { return p.Ca * p.Va / p.Cb; }
  /** 當量點的 pH（精確解） */
  function pHeq(p) { return pH(p, Veq(p)); }
  /** 弱酸的 pKa、弱鹼的共軛酸 pKa（半當量點附近的 pH）；強酸傳回 null */
  function pKaOf(p) {
    if (p.Ka) return -Math.log10(p.Ka);
    if (p.Kb) return -Math.log10(KW / p.Kb);
    return null;
  }

  /** 理論滴定曲線：0 到 Vmax 共 n 段 */
  function curve(p, Vmax, n) {
    const out = [];
    for (let i = 0; i <= n; i++) { const v = Vmax * i / n; out.push({ v: v, pH: pH(p, v) }); }
    return out;
  }

  /**
   * 一滴剛落下、還沒攪勻時的局部 pH：Vdrop mL 滴定液只和 Vsol mL 的瓶內溶液混合
   * （畫面上滴落處短暫出現的顏色；不影響瓶內真正的 pH）。
   */
  function localPH(p, Vb, Vsol, Vdrop) {
    const t = totals(p, Vb), k = Vsol / t.Vt, s = SYSTEMS[p.sys];
    const L = { Vt: Vsol + Vdrop, nNa: t.nNa * k, nCl: t.nCl * k,
      acids: t.acids.map(function (a) { return { n: a.n * k, Ka: a.Ka }; }),
      bases: t.bases.map(function (b) { return { n: b.n * k, Kb: b.Kb }; }) };
    if (s.titrant === 'NaOH') L.nNa += p.Cb * Vdrop; else L.nCl += p.Cb * Vdrop;
    return -Math.log10(solveH(L));
  }

  // ======================= 解析近似（只在各自成立的區間用來對照） =======================
  const approx = {
    /** 強酸過量（當量點前，過量的 H+ 遠大於 1e-7 M） */
    strongBefore: function (p, Vb) { return -Math.log10((p.Ca * p.Va - p.Cb * Vb) / (p.Va + p.Vw + Vb)); },
    /** 強鹼過量（強酸滴定的當量點後） */
    strongAfter: function (p, Vb) { return 14 + Math.log10((p.Cb * Vb - p.Ca * p.Va) / (p.Va + p.Vw + Vb)); },
    /** 弱酸起點：解二次式 h² + Ka h − Ka C = 0（忽略水的解離） */
    weakAcidStart: function (p) {
      const C = p.Ca * p.Va / (p.Va + p.Vw);
      return -Math.log10((-p.Ka + Math.sqrt(p.Ka * p.Ka + 4 * p.Ka * C)) / 2);
    },
    /** 緩衝區：亨德森－哈塞爾巴赫 pH = pKa + log(n_A / n_HA) */
    henderson: function (p, Vb) {
      const nB = p.Cb * Vb, nA = p.Ca * p.Va;
      if (p.Kb) return -Math.log10(KW / p.Kb) + Math.log10((nA - nB) / nB);
      return -Math.log10(p.Ka) + Math.log10(nB / (nA - nB));
    },
    /** 弱酸的當量點：A- 水解，[OH-] = √(Kb' C)，Kb' = Kw/Ka */
    weakAcidEq: function (p) {
      const V = Veq(p), C = p.Ca * p.Va / (p.Va + p.Vw + V);
      return 14 + Math.log10(Math.sqrt(KW / p.Ka * C));
    },
    /** 弱鹼起點：[OH-] = (−Kb + √(Kb² + 4 Kb C))/2 */
    weakBaseStart: function (p) {
      const C = p.Ca * p.Va / (p.Va + p.Vw);
      return 14 + Math.log10((-p.Kb + Math.sqrt(p.Kb * p.Kb + 4 * p.Kb * C)) / 2);
    },
    /** 弱鹼的當量點：NH4+ 水解，[H+] = √(Ka' C)，Ka' = Kw/Kb */
    weakBaseEq: function (p) {
      const V = Veq(p), C = p.Ca * p.Va / (p.Va + p.Vw + V);
      return -Math.log10(Math.sqrt(KW / p.Kb * C));
    }
  };

  // ======================= 指示劑 =======================
  /**
   * pKin：指示劑的解離常數（取文獻常用值）；lo–hi：課本上肉眼看得出的變色範圍。
   * acid／base：兩種型在本模擬「2 滴指示劑、溶液 45 mL」時的吸光度（紅、綠、藍三個波段，教學用的近似值），
   * 只決定畫面顏色，不影響任何 pH 的計算。
   */
  const INDICATORS = {
    php: { zh: '酚酞', en: 'phenolphthalein', pKin: 9.4, lo: 8.2, hi: 10.0,
      acidName: ['無色', 'colourless'], baseName: ['粉紅', 'pink'],
      acid: [0, 0, 0], base: [0.03, 0.82, 0.28] },
    mo: { zh: '甲基橙', en: 'methyl orange', pKin: 3.46, lo: 3.1, hi: 4.4,
      acidName: ['紅', 'red'], baseName: ['橙黃', 'orange-yellow'],
      acid: [0.06, 0.95, 0.62], base: [0.0, 0.22, 0.95] },
    mr: { zh: '甲基紅', en: 'methyl red', pKin: 5.1, lo: 4.4, hi: 6.2,
      acidName: ['紅', 'red'], baseName: ['黃', 'yellow'],
      acid: [0.04, 0.9, 0.5], base: [0.0, 0.07, 0.85] },
    btb: { zh: '溴瑞香草酚藍', en: 'bromothymol blue', pKin: 7.1, lo: 6.0, hi: 7.6,
      acidName: ['黃', 'yellow'], baseName: ['藍', 'blue'],
      acid: [0.0, 0.08, 0.8], base: [0.95, 0.32, 0.05] }
  };
  /** 指示劑鹼型（In-）所占的比例 */
  function indicatorFraction(ind, ph) {
    const I = INDICATORS[ind];
    if (!I) return null;
    return 1 / (1 + Math.pow(10, I.pKin - ph));
  }
  /** 溶液的吸光度（三個波段）；scale：濃度倍率（溶液越多，指示劑越稀） */
  function indicatorAbsorbance(ind, ph, scale) {
    const I = INDICATORS[ind];
    if (!I) return [0, 0, 0];
    const fb = indicatorFraction(ind, ph), k = scale == null ? 1 : scale;
    return [0, 1, 2].map(function (i) { return k * ((1 - fb) * I.acid[i] + fb * I.base[i]); });
  }
  /** 白光穿過溶液後的顏色（0–255）：T = 10^(−A) */
  function indicatorRGB(ind, ph, scale) {
    return indicatorAbsorbance(ind, ph, scale).map(function (a) { return Math.round(255 * Math.pow(10, -a)); });
  }
  /** 從 pH0 到 pH，指示劑的鹼型比例改變了多少（0–1） */
  function indicatorMoved(ind, ph0, ph) {
    if (!INDICATORS[ind]) return 0;
    return Math.abs(indicatorFraction(ind, ph) - indicatorFraction(ind, ph0));
  }
  /** 「顏色已經變了」：鹼型比例改變至少 15%（例如酚酞的淡粉紅，肉眼已看得出來） */
  const CHANGE = 0.15;
  function changed(ind, ph0, ph) { return indicatorMoved(ind, ph0, ph) >= CHANGE; }
  /** 指示劑的變色範圍是否包含某個 pH（例如當量點的 pH） */
  function covers(ind, ph) { const I = INDICATORS[ind]; return !!I && ph >= I.lo && ph <= I.hi; }

  // ======================= 未知弱酸 =======================
  /** 隨機產生未知弱酸：濃度 0.050–0.150 M（取到 0.001），Ka = 1.0–9.9 × 10^-5 或 10^-6（pKa 4.00–6.00） */
  function mysterySample(rng) {
    rng = rng || Math.random;
    const C = Math.round(50 + rng() * 100) / 1000;
    const m = Math.round(10 + rng() * 89) / 10;
    const e = rng() < 0.5 ? -5 : -6;
    return { C: C, Ka: m * Math.pow(10, e), mant: m, exp: e };
  }

  const api = {
    KW: KW, KA_HAC: KA_HAC, KB_NH3: KB_NH3, DROP_ML: DROP_ML, UNIT_ML: UNIT_ML, UNITS_PER_ML: UNITS_PER_ML,
    BURETTE_ML: BURETTE_ML, BURETTE_UNITS: BURETTE_UNITS, SYSTEMS: SYSTEMS, direction: direction,
    setup: setup, totals: totals, solveH: solveH, balance: balance, pH: pH, species: species,
    Veq: Veq, pHeq: pHeq, pKaOf: pKaOf, curve: curve, localPH: localPH, approx: approx,
    INDICATORS: INDICATORS, indicatorFraction: indicatorFraction, indicatorAbsorbance: indicatorAbsorbance,
    indicatorRGB: indicatorRGB, indicatorMoved: indicatorMoved, CHANGE: CHANGE, changed: changed, covers: covers,
    mysterySample: mysterySample
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TitrationCore = api;
})(typeof window !== 'undefined' ? window : this);
