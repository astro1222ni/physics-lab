/*
 * water-hardness-core.js — 「水的硬度」的化學核心（不碰 DOM；瀏覽器是 window.HardCore，Node 用 require）
 *
 * 三部分：
 *   1. 水樣與軟化：1 L 水樣中 Ca2+、Mg2+、HCO3-、Na+、CO3 2- 的莫耳數（mmol）；煮沸（暫時硬度變成水垢、蒸發 10%）、
 *      加洗滌鹼 Na2CO3（Ksp 沉澱平衡）、鈉型離子交換樹脂（交換容量、Ca 先被抓住）、食鹽水再生。
 *   2. 肥皂泡沫試驗：脂肪酸根與 Ca2+、Mg2+ 以 2 : 1 沉澱成浮渣，多出來的肥皂達到門檻濃度才有持久的泡沫；合成清潔劑不沉澱。
 *   3. EDTA 錯合滴定：pH 10（氨緩衝液＋EBT）測總硬度、pH 12（NaOH＋鈣指示劑，Mg 沉澱成 Mg(OH)2）測鈣硬度。
 *      每一點用條件生成常數解 Ca、Mg、EDTA、指示劑四個質量平衡（巢狀二分法），不是分段套公式。
 *
 * 數據來源：
 *   EDTA 的六個 pKa（25 °C、離子強度 0.1）與生成常數 log Kf(CaY2-) = 10.65、log Kf(MgY2-) = 8.79：Harris, Quantitative Chemical Analysis 表 11-1、11-2。
 *   EBT：pKa2 6.3、pKa3 11.55，log Kf(MgIn-) = 7.0、log Kf(CaIn-) = 5.4：Skoog, Fundamentals of Analytical Chemistry 第 17 章。
 *   Ksp（25 °C）：CaCO3（方解石）3.36e-9、MgCO3 6.82e-6、Mg(OH)2 5.61e-12、Ca(OH)2 5.02e-6：CRC Handbook of Chemistry and Physics。
 *   莫耳質量：IUPAC 原子量。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HardCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ======================= 數據 =======================
  const MW = { CaCO3: 100.09, Ca: 40.078, Mg: 24.305, HCO3: 61.017, Na: 22.990, Na2CO3: 105.99, MgOH2: 58.32, CO3: 60.009 };
  const KSP = { CaCO3: 3.36e-9, MgCO3: 6.82e-6, MgOH2: 5.61e-12, CaOH2: 5.02e-6 };
  const EDTA_PKA = [0.0, 1.5, 2.00, 2.69, 6.13, 10.37];
  const LOGKF = { CaY: 10.65, MgY: 8.79 };
  const EBT = { pKa2: 6.3, pKa3: 11.55, logMgIn: 7.0, logCaIn: 5.4 };
  // 鈣指示劑（NN 指示劑，Patton–Reeder）在 pH 12 時與 Ca2+ 的條件生成常數：教學取值（文獻沒有一致的數值），不與 Mg 結合
  const CAIND_LOGK = 5.0;
  const PH = { A: 10.0, B: 12.0 };

  // 水樣與處理
  const RESIDUAL_CACO3 = 0.13;   // 煮沸後仍溶在水中的碳酸鹽硬度（mmol/L）：CaCO3 在水中的溶解度約 13 mg/L
  const EVAP_ML = 100;           // 煮沸 10 分鐘蒸發掉的水（mL）
  const V_MIN_ML = 500;          // 水樣少於 500 mL 就不能再煮
  const RESIN_Q = 5.0;           // 樹脂管柱的交換容量（mmol 的二價離子 = 10 meq）
  const RESIN_LEAK = 0.002;      // 新鮮樹脂仍漏過 0.2% 的硬度

  // 肥皂泡沫試驗
  const SOAP = { Vt: 5.0, c: 0.050, drop: 0.05, lather: 3.0e-4 };   // 試管 5.00 mL 水樣、0.050 M 肥皂水、一滴 0.05 mL、持久泡沫的門檻濃度（M）

  // 滴定
  const UNITS_PER_ML = 40;        // 1 單位 = 半滴 = 0.025 mL
  const BURETTE_ML = 50, BURETTE_UNITS = BURETTE_ML * UNITS_PER_ML;
  const V_ADD_ML = 2.0;           // 加入的緩衝液（或 NaOH）體積
  const N_IND = 5.0e-4;           // 指示劑的量（mmol）：約 2 滴 0.5% EBT
  const N_MGEDTA = 0.010;         // 緩衝液裡的 Mg–EDTA（mmol）
  const BLUE_RF = 0.10;           // 指示劑結合金屬的比例 ≤ 10% 算「純藍色」
  const PATH_CM = 4;
  // 指示劑各型在紅、綠、藍光的莫耳吸收係數（M-1 cm-1，教學用近似值）
  const ABS = {
    MIn: [3.0e3, 1.8e4, 9.0e3],   // 金屬錯合物：酒紅色（吸收綠光）
    HIn: [2.0e4, 7.0e3, 1.0e3],   // 游離指示劑：藍色（吸收紅光）
    In3: [1.0e3, 6.0e3, 1.6e4]    // EBT 在 pH 11.5 以上的 In3-：橙色（吸收藍光）
  };

  // 預設水樣（mg/L）：示意的典型組成，不是特定地點的實測值
  const PRESETS = {
    dist: { Ca: 0, Mg: 0, HCO3: 0, Na: 0 },
    soft: { Ca: 8, Mg: 1.5, HCO3: 30, Na: 4 },
    tap: { Ca: 36, Mg: 8.5, HCO3: 130, Na: 12 },
    ground: { Ca: 100, Mg: 22, HCO3: 330, Na: 15 },
    mineral: { Ca: 25, Mg: 60, HCO3: 250, Na: 8 }
  };

  // ======================= 小工具 =======================
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  /** 總硬度（mg/L，以 CaCO3 計），c 是 mmol/L */
  function hardnessOf(cCa, cMg) { return (cCa + cMg) * MW.CaCO3; }
  /** 依美國地質調查所（USGS）的分級 */
  function classOf(H) { return H <= 60 ? 'soft' : H <= 120 ? 'moderate' : H <= 180 ? 'hard' : 'veryhard'; }
  /** EDTA 以 Y4- 存在的比例 */
  function alphaY(pH) {
    const h = Math.pow(10, -pH);
    let term = 1, sum = 1;
    for (let i = 5; i >= 0; i--) { term *= h / Math.pow(10, -EDTA_PKA[i]); sum += term; }
    return 1 / sum;
  }
  /** EBT 的游離型：H2In-、HIn2-、In3- 的比例 */
  function ebtFractions(pH) {
    const h = Math.pow(10, -pH), K2 = Math.pow(10, -EBT.pKa2), K3 = Math.pow(10, -EBT.pKa3);
    const a = h * h / K2, b = h, c = K3, s = a + b + c;
    return { H2In: a / s, HIn: b / s, In3: c / s };
  }
  /** 條件生成常數（模式 A：pH 10＋EBT；模式 B：pH 12＋鈣指示劑） */
  const KCACHE = {};
  function condK(mode) {
    if (KCACHE[mode]) return KCACHE[mode];
    const pH = PH[mode], aY = alphaY(pH);
    let k;
    if (mode === 'A') {
      const f = ebtFractions(pH);
      k = { kCaY: Math.pow(10, LOGKF.CaY) * aY, kMgY: Math.pow(10, LOGKF.MgY) * aY,
        kCaIn: Math.pow(10, EBT.logCaIn) * f.In3, kMgIn: Math.pow(10, EBT.logMgIn) * f.In3, mgSat: Infinity, free: f };
    } else {
      const oh = Math.pow(10, pH - 14);
      k = { kCaY: Math.pow(10, LOGKF.CaY) * aY, kMgY: Math.pow(10, LOGKF.MgY) * aY,
        kCaIn: Math.pow(10, CAIND_LOGK), kMgIn: 0, mgSat: KSP.MgOH2 / (oh * oh), free: { H2In: 0, HIn: 1, In3: 0 } };
    }
    k.pH = pH; k.aY = aY;
    KCACHE[mode] = k;
    return k;
  }

  /**
   * 解一瓶溶液的平衡（濃度一律 M）。CaT、MgT、YT、InT 是總濃度；回傳各物種的平衡濃度。
   * Y 是沒有和金屬結合的 EDTA（各種質子化型的總和，用條件常數）、In 是游離指示劑。
   * 模式 B 的 Mg：游離 [Mg2+] 不超過 Mg(OH)2 的飽和濃度，多的留在沉澱裡。
   */
  function solve(CaT, MgT, YT, InT, mode) {
    const k = condK(mode);
    function metals(Y, In) {
      const Ca = CaT / (1 + k.kCaY * Y + k.kCaIn * In);
      let Mg = MgT / (1 + k.kMgY * Y + k.kMgIn * In);
      if (Mg > k.mgSat) Mg = k.mgSat;
      return { Ca: Ca, Mg: Mg };
    }
    function inFor(Y) {
      if (!(InT > 0)) return 0;
      let lo = 0, hi = InT;
      for (let i = 0; i < 60; i++) {
        const m = (lo + hi) / 2, c = metals(Y, m);
        if (m * (1 + k.kCaIn * c.Ca + k.kMgIn * c.Mg) < InT) lo = m; else hi = m;
      }
      return (lo + hi) / 2;
    }
    let Y = 0, In = inFor(0);
    if (YT > 0) {
      // 二分法在對數空間：f(Y) = Y + [CaY] + [MgY] − YT 隨 Y 單調遞增
      let lo = -40, hi = Math.log10(YT);
      for (let i = 0; i < 64; i++) {
        const m = (lo + hi) / 2, y = Math.pow(10, m), inn = inFor(y), c = metals(y, inn);
        if (y * (1 + k.kCaY * c.Ca + k.kMgY * c.Mg) < YT) lo = m; else hi = m;
      }
      Y = Math.pow(10, (lo + hi) / 2);
      In = inFor(Y);
    }
    const c = metals(Y, In);
    const MgDiss = c.Mg * (1 + k.kMgY * Y + k.kMgIn * In);
    return {
      Ca: c.Ca, Mg: c.Mg, Y: Y, In: In,
      CaY: k.kCaY * c.Ca * Y, MgY: k.kMgY * c.Mg * Y, CaIn: k.kCaIn * c.Ca * In, MgIn: k.kMgIn * c.Mg * In,
      MgSolid: Math.max(0, MgT - MgDiss)
    };
  }

  // ======================= 水樣 =======================
  /** mg/L → 1 L 水樣（各成分 mmol） */
  function makeWater(mg) {
    return { V: 1.0, nCa: (mg.Ca || 0) / MW.Ca, nMg: (mg.Mg || 0) / MW.Mg, nHCO3: (mg.HCO3 || 0) / MW.HCO3, nNa: (mg.Na || 0) / MW.Na, nCO3: 0 };
  }
  function copyWater(w) { return { V: w.V, nCa: w.nCa, nMg: w.nMg, nHCO3: w.nHCO3, nNa: w.nNa, nCO3: w.nCO3 }; }
  /** 濃度：mmol/L 與 mg/L，以及硬度 */
  function waterInfo(w) {
    const c = { Ca: w.nCa / w.V, Mg: w.nMg / w.V, HCO3: w.nHCO3 / w.V, Na: w.nNa / w.V, CO3: w.nCO3 / w.V };
    const H = hardnessOf(c.Ca, c.Mg);
    const carb = Math.min(c.Ca + c.Mg, c.HCO3 / 2) * MW.CaCO3;   // 碳酸鹽（暫時）硬度
    return {
      V: w.V, c: c,
      mg: { Ca: c.Ca * MW.Ca, Mg: c.Mg * MW.Mg, HCO3: c.HCO3 * MW.HCO3, Na: c.Na * MW.Na, CO3: c.CO3 * MW.CO3 },
      H: H, Hca: c.Ca * MW.CaCO3, Hmg: c.Mg * MW.CaCO3, Htemp: carb, Hperm: H - carb,
      alk: c.HCO3 / 2 * MW.CaCO3, cls: classOf(H)
    };
  }

  /** 煮沸 10 分鐘：M(HCO3)2 → MCO3↓（Mg 最後變成 Mg(OH)2↓）＋ CO2 ＋ H2O，先沉澱 Ca；仍溶有 0.13 mmol/L；蒸發 100 mL */
  function boil(w0) {
    const w = copyWater(w0);
    const Vafter = (w.V * 1000 - EVAP_ML) / 1000;
    const can = Math.min(w.nCa + w.nMg, w.nHCO3 / 2);
    const removed = Math.max(0, can - RESIDUAL_CACO3 * Vafter);
    const dCa = Math.min(w.nCa, removed), dMg = Math.min(w.nMg, removed - dCa);
    w.nCa -= dCa; w.nMg -= dMg; w.nHCO3 -= 2 * (dCa + dMg);
    w.V = Vafter;
    return { w: w, dCa: dCa, dMg: dMg, scale: dCa * MW.CaCO3 + dMg * MW.MgOH2, evap: EVAP_ML };
  }

  /** (a − x)(b − x) = K 的較小根（a、b、K 同單位 M） */
  function pptRoot(a, b, K) {
    if (a * b <= K) return 0;
    const s = a + b, d = Math.sqrt((a - b) * (a - b) + 4 * K);
    return Math.max(0, Math.min(a, b, (s - d) / 2));
  }
  /**
   * 加洗滌鹼：每升加入 dose mg 的 Na2CO3。CaCO3、MgCO3 依 Ksp 沉澱到飽和（忽略 CO3 2- 的水解與活性係數）。
   * 兩種沉澱共用 CO3 2-，交替求解到收斂。
   */
  function soda(w0, doseMgL) {
    const w = copyWater(w0);
    const add = Math.max(0, doseMgL) / MW.Na2CO3 * w.V;   // mmol
    w.nNa += 2 * add; w.nCO3 += add;
    const k = 1 / (w.V * 1000);                           // mmol → M
    const a = w.nCa * k, m = w.nMg * k, c = w.nCO3 * k;
    let xCa = 0, xMg = 0;
    // 兩種沉澱共用 CO3 2-：輪流求「另一種沉澱量固定時」這一種的沉澱量，直到收斂
    for (let it = 0; it < 200; it++) {
      const nCa = pptRoot(a, c - xMg, KSP.CaCO3), nMg = pptRoot(m, c - nCa, KSP.MgCO3);
      const done = Math.abs(nCa - xCa) < 1e-15 && Math.abs(nMg - xMg) < 1e-15;
      xCa = nCa; xMg = nMg;
      if (done) break;
    }
    const dCa = xCa / k, dMg = xMg / k;
    w.nCa -= dCa; w.nMg -= dMg; w.nCO3 -= dCa + dMg;
    return { w: w, dCa: dCa, dMg: dMg, add: add, ppt: dCa * MW.CaCO3 + dMg * 84.31 };
  }

  function makeResin() { return { left: RESIN_Q, Ca: 0, Mg: 0 }; }
  /** 整瓶水流過鈉型樹脂：2 R–Na + M2+ → R2M + 2 Na+；Ca2+ 先被抓住（選擇性 Ca > Mg），容量不夠時 Mg 先漏出 */
  function resinPass(w0, r0) {
    const w = copyWater(w0), r = { left: r0.left, Ca: r0.Ca, Mg: r0.Mg };
    const xCa = Math.min(w.nCa * (1 - RESIN_LEAK), r.left);
    const xMg = Math.min(w.nMg * (1 - RESIN_LEAK), r.left - xCa);
    w.nCa -= xCa; w.nMg -= xMg; w.nNa += 2 * (xCa + xMg);
    r.left -= xCa + xMg; r.Ca += xCa; r.Mg += xMg;
    if (r.left < 1e-12) r.left = 0;
    return { w: w, r: r, dCa: xCa, dMg: xMg };
  }

  /** 肥皂泡沫試驗：試管裡 Vt mL 水樣（c 是 mmol/L）加 drops 滴肥皂水（或合成清潔劑） */
  function soapTest(cCa, cMg, drops, detergent) {
    const Vt = SOAP.Vt, Vs = drops * SOAP.drop, V = Vt + Vs;   // mL
    const nS = drops * SOAP.drop * SOAP.c * 1000;               // µmol 肥皂
    const nM = (cCa + cMg) * Vt;                                // µmol 二價離子
    const ppt = detergent ? 0 : Math.min(nM, nS / 2);           // µmol 沉澱成浮渣的金屬肥皂
    const free = nS - 2 * ppt;                                  // µmol
    const cFree = free / V / 1000;                              // M
    return {
      nS: nS, nM: nM, ppt: ppt, free: free, cFree: cFree, V: V,
      lather: cFree >= SOAP.lather - 1e-12,
      foam: clamp(cFree / (3 * SOAP.lather), 0, 1),
      need: Math.max(1, Math.ceil(((detergent ? 0 : 2 * nM) + SOAP.lather * 1000 * Vt) / (SOAP.drop * (SOAP.c * 1000 - SOAP.lather * 1000)) - 1e-9))
    };
  }

  // ======================= 工作台：水樣、處理、肥皂試驗 =======================
  function createBench() {
    return { water: makeWater(PRESETS.tap), preset: 'tap', bottle: 1, step: 0, boiled: 0, scale: 0, resin: makeResin(),
      hist: [], leakSeen: false, regenAfterLeak: false, tube: { drops: 0, detergent: false }, unknown: null };
  }
  function benchInfo(B) { return waterInfo(B.water); }
  /** 換一瓶水樣（preset 或自訂 mg/L）；unknown = { Ca, Mg, HCO3, Na } 的未知水樣 */
  function benchSet(B, preset, mg) {
    B.water = makeWater(mg || PRESETS[preset] || PRESETS.tap);
    B.preset = preset; B.bottle++; B.step = 0; B.boiled = 0; B.scale = 0; B.hist = [];
    B.tube = { drops: 0, detergent: B.tube.detergent };
  }
  function treatData(B, kind, before, extra) {
    const after = waterInfo(B.water);
    const d = {
      kind: kind, preset: B.preset, bottle: B.bottle, step: B.step, boiled: B.boiled,
      before: before, after: after, H0: before ? before.H : after.H, H: after.H,
      Ca0: before ? before.mg.Ca : after.mg.Ca, Mg0: before ? before.mg.Mg : after.mg.Mg, Ca: after.mg.Ca, Mg: after.mg.Mg,
      HCO30: before ? before.mg.HCO3 : after.mg.HCO3, Na0: before ? before.mg.Na : after.mg.Na, Na: after.mg.Na, V: after.V,
      scale: B.scale, resinLeft: B.resin.left, leakSeen: B.leakSeen, regenAfterLeak: B.regenAfterLeak
    };
    return Object.assign(d, extra || {});
  }
  function benchBoil(B) {
    if (B.water.V * 1000 - EVAP_ML < V_MIN_ML - 1e-9) return null;
    const before = waterInfo(B.water), r = boil(B.water);
    B.water = r.w; B.step++; B.boiled++; B.scale += r.scale;
    B.tube = { drops: 0, detergent: B.tube.detergent };
    const d = treatData(B, 'boil', before, { dCa: r.dCa, dMg: r.dMg, dScale: r.scale });
    B.hist.push({ kind: 'boil', H0: before.H, H: d.H });
    return d;
  }
  function benchSoda(B, dose) {
    const before = waterInfo(B.water), r = soda(B.water, dose);
    B.water = r.w; B.step++;
    B.tube = { drops: 0, detergent: B.tube.detergent };
    const d = treatData(B, 'soda', before, { dose: dose, add: r.add, dCa: r.dCa, dMg: r.dMg, nCa0: before.c.Ca * before.V, ppt: r.ppt });
    B.hist.push({ kind: 'soda', H0: before.H, H: d.H });
    return d;
  }
  function benchResin(B) {
    const before = waterInfo(B.water), r = resinPass(B.water, B.resin);
    const wasLeft = B.resin.left;
    B.water = r.w; B.resin = r.r; B.step++;
    B.tube = { drops: 0, detergent: B.tube.detergent };
    const after = waterInfo(B.water);
    const leak = after.H >= 10 && before.H >= 10;
    if (leak) B.leakSeen = true;
    const d = treatData(B, 'resin', before, { dCa: r.dCa, dMg: r.dMg, resinLeft0: wasLeft, exhausted: B.resin.left <= 0, leak: leak });
    B.hist.push({ kind: 'resin', H0: before.H, H: d.H });
    return d;
  }
  function benchRegen(B) {
    const used = RESIN_Q - B.resin.left;
    B.resin = makeResin();
    if (B.leakSeen) B.regenAfterLeak = true;
    return treatData(B, 'regen', null, { used: used });
  }
  /** 肥皂試驗加一滴（或換一支試管：drops = 0） */
  function benchSoap(B, detergent) {
    if (detergent != null && detergent !== B.tube.detergent) B.tube = { drops: 0, detergent: !!detergent };
    B.tube.drops++;
    const d = soapData(B);
    // 記下「同一杯水用肥皂加到第幾滴還只有浮渣」，給換用清潔劑時對照
    if (!B.tube.detergent && !d.lather && d.ppt > 0.01) B.soapFail = { bottle: B.bottle, step: B.step, drops: d.drops };
    const f = B.soapFail;
    d.soapFail = f && f.bottle === B.bottle && f.step === B.step ? f.drops : 0;
    return d;
  }
  function soapData(B) {
    const i = waterInfo(B.water), t = soapTest(i.c.Ca, i.c.Mg, B.tube.drops, B.tube.detergent);
    return Object.assign({ preset: B.preset, bottle: B.bottle, step: B.step, unknown: B.preset === 'mys', drops: B.tube.drops, detergent: B.tube.detergent, H: i.H }, t);
  }

  // ======================= EDTA 滴定 =======================
  function createSession(rng) {
    return { rng: rng || Math.random, runs: [], run: null, flaskNo: 0, meas: [], sample: null, mysNo: 0 };
  }
  /** 隨機的未知水樣（mg/L） */
  function newSample(S) {
    const r = S.rng;
    S.mysNo++;
    const round = function (x, d) { const p = Math.pow(10, d); return Math.round(x * p) / p; };
    S.sample = { no: S.mysNo, Ca: round(40 + 70 * r(), 1), Mg: round(6 + 24 * r(), 1), HCO3: round(80 + 300 * r(), 0), Na: round(5 + 20 * r(), 0), revealed: false, flasks: { A: 0, B: 0 } };
    const i = waterInfo(makeWater(S.sample));
    S.sample.H = i.H; S.sample.Hca = i.Hca; S.sample.Hmg = i.Hmg;
    return S.sample;
  }
  /**
   * 換一瓶：o = { mode 'A'|'B', mgEdta, Va（mL）, cE（M）, water: { Ca, Mg（mmol/L）, H, Hca, preset, bottle, step, boiled, unknown } }
   */
  function newRun(S, o, keepOld) {
    if (S.run && S.run.u > 0 && keepOld !== false) {
      S.runs.push(S.run);
      if (S.runs.length > 4) S.runs.shift();
    }
    const p = Object.assign({ mode: 'A', mgEdta: false, Va: 50, cE: 0.01 }, o);
    p.mgEdta = p.mode === 'A' && !!p.mgEdta;
    const w = p.water || { Ca: 0, Mg: 0 };
    S.flaskNo++;
    const run = {
      no: S.flaskNo, p: p, w: w,
      nCa: w.Ca * p.Va / 1000, nMg: w.Mg * p.Va / 1000,     // mmol
      u: 0, out: 0, fill: 0, rows: [], pts: [], endpoint: null, counted: false, meterUsed: false
    };
    run.Veq = (p.mode === 'A' ? run.nCa + run.nMg : run.nCa) / p.cE;
    run.VeqCa = run.nCa / p.cE;
    S.run = run;
    compute(run);
    run.pts.push({ u: 0, pCa: run.eq.pCa, rf: run.eq.rf });
    run.rows.push({ u: 0, pCa: run.eq.pCa, rf: run.eq.rf });
    return run;
  }
  /** 瓶中在 u 單位時的平衡 */
  function eqAt(p, nCa, nMg, u) {
    const V = p.Va + V_ADD_ML + u / UNITS_PER_ML;                     // mL
    const nY = p.cE * u / UNITS_PER_ML + (p.mgEdta ? N_MGEDTA : 0);  // mmol
    const nMgT = nMg + (p.mgEdta ? N_MGEDTA : 0);
    const s = solve(nCa / V, nMgT / V, nY / V, N_IND / V, p.mode);
    const InT = N_IND / V;
    const rf = InT > 0 ? (s.CaIn + s.MgIn) / InT : 0;
    return Object.assign(s, { V: V, InT: InT, rf: rf, pCa: s.Ca > 0 ? -Math.log10(s.Ca) : null, pMg: s.Mg > 0 ? -Math.log10(s.Mg) : null,
      fCa: nCa > 0 ? s.CaY / (nCa / V) : 0, fMg: nMgT > 0 ? s.MgY / (nMgT / V) : 0 });
  }
  function compute(run) { run.eq = eqAt(run.p, run.nCa, run.nMg, run.u); return run.eq; }

  /** 錐形瓶溶液的穿透率（紅、綠、藍）；turb 是 Mg(OH)2 的白色混濁（0–1） */
  function transmit(run) {
    const e = run.eq, f = condK(run.p.mode).free, bound = e.CaIn + e.MgIn, free = e.In;
    // 金屬錯合物與 H2In-（pH 低時）都是酒紅色；HIn2- 藍色；In3- 橙色
    const A = [0, 1, 2].map(function (i) {
      return PATH_CM * (ABS.MIn[i] * (bound + free * f.H2In) + ABS.HIn[i] * free * f.HIn + ABS.In3[i] * free * f.In3);
    });
    const turb = run.p.mode === 'B' ? clamp(e.MgSolid / 4e-4, 0, 1) : 0;
    return { T: A.map(function (a) { return Math.pow(10, -a); }), A: A, turb: turb };
  }
  function colourKey(rf) { return rf <= BLUE_RF ? 'blue' : rf <= 0.35 ? 'bluepurple' : rf <= 0.65 ? 'purple' : rf <= 0.9 ? 'redpurple' : 'red'; }

  /** 從滴定管放出 n 個單位（還在空中）；回傳實際放出的量 */
  function release(S, n) {
    const r = S.run, left = BURETTE_UNITS - r.fill;
    n = Math.min(n, left);
    if (n <= 0) return 0;
    r.fill += n; r.out += n;
    return n;
  }
  /** 液滴落進瓶中 */
  function land(S, n) {
    const r = S.run;
    r.u += n;
    compute(r);
    r.pts.push({ u: r.u, pCa: r.eq.pCa, rf: r.eq.rf, m: null });
    if (r.p.water && r.p.water.unknown && !r.counted && S.sample) { r.counted = true; S.sample.flasks[r.p.mode]++; }
    return r.eq;
  }
  function baseData(S, meter) {
    const r = S.run, p = r.p, w = p.water || {};
    return {
      mode: p.mode, mgEdta: p.mgEdta, Va: p.Va, cE: p.cE, meter: !!meter, meterUsed: r.meterUsed,
      V: r.u / UNITS_PER_ML, Vout: r.out / UNITS_PER_ML, Vread: r.fill / UNITS_PER_ML, Veq: r.Veq, VeqCa: r.VeqCa,
      rf: r.eq.rf, blue: r.eq.rf <= BLUE_RF, colour: colourKey(r.eq.rf), pCa: meter ? r.eq.pCa : null,
      fCa: r.eq.fCa, fMg: r.eq.fMg,
      Ca: w.Ca || 0, Mg: w.Mg || 0, H: w.H || 0, Hca: w.Hca || 0, preset: w.preset, bottle: w.bottle, step: w.step, boiled: w.boiled || 0,
      unknown: !!w.unknown, flask: r.no
    };
  }
  /** 加入的液體全部落下、停下來：記錄一列數據，回報 'settle' 事件的資料 */
  function settle(S, meter) {
    const r = S.run;
    if (meter) r.meterUsed = true;
    const last = r.rows[r.rows.length - 1];
    if (!last || last.u !== r.u) r.rows.push({ u: r.u, pCa: r.eq.pCa, rf: r.eq.rf, m: !!meter });
    const lp = r.pts[r.pts.length - 1];
    if (lp && lp.u === r.u) lp.m = !!meter;
    return baseData(S, meter);
  }
  /** 記錄終點：Vend = 滴定管流出的總量；Hmeas = 由終點算出的硬度（mg/L） */
  function endpoint(S, meter) {
    const r = S.run, p = r.p;
    const d = baseData(S, meter);
    d.Vend = r.out / UNITS_PER_ML;
    d.err = d.Vend - r.Veq;
    d.Hmeas = d.Vend * p.cE / p.Va * MW.CaCO3 * 1000;
    r.endpoint = d.Vend;
    const prev = S.meas.slice();
    if (p.mode === 'A' && d.blue && Math.abs(d.err) <= 0.10 + 1e-9 && !d.unknown) {
      S.meas.push({ bottle: d.bottle, step: d.step, boiled: d.boiled, H: d.H, Hmeas: d.Hmeas, preset: d.preset });
      if (S.meas.length > 30) S.meas.shift();
    }
    d.meas = prev;
    return d;
  }
  /** 未知水樣的答案：總硬度、鈣硬度（mg/L） */
  function answer(S, H, Hca) {
    const s = S.sample;
    return {
      H: H, Hca: Hca, errH: isFinite(H) ? (H - s.H) / s.H : NaN, errCa: isFinite(Hca) ? (Hca - s.Hca) / s.Hca : NaN,
      revealed: s.revealed, flasksA: s.flasks.A, flasksB: s.flasks.B, no: s.no
    };
  }
  function clearAll(S, o) {
    S.runs = [];
    S.run = null;
    return newRun(S, o, false);
  }
  /** 理論曲線：每 du 單位一點 */
  function theory(p, nCa, nMg, uMax, du) {
    const pts = [];
    for (let u = 0; u <= uMax + 1e-9; u += du) { const e = eqAt(p, nCa, nMg, u); pts.push({ u: u, pCa: e.pCa, pMg: e.pMg, rf: e.rf }); }
    return pts;
  }

  return {
    MW: MW, KSP: KSP, EDTA_PKA: EDTA_PKA, LOGKF: LOGKF, EBT: EBT, CAIND_LOGK: CAIND_LOGK, PH: PH, PRESETS: PRESETS,
    RESIDUAL_CACO3: RESIDUAL_CACO3, EVAP_ML: EVAP_ML, V_MIN_ML: V_MIN_ML, RESIN_Q: RESIN_Q, RESIN_LEAK: RESIN_LEAK, SOAP: SOAP,
    UNITS_PER_ML: UNITS_PER_ML, BURETTE_ML: BURETTE_ML, BURETTE_UNITS: BURETTE_UNITS, V_ADD_ML: V_ADD_ML, N_IND: N_IND, N_MGEDTA: N_MGEDTA,
    BLUE_RF: BLUE_RF, PATH_CM: PATH_CM, ABS: ABS,
    hardnessOf: hardnessOf, classOf: classOf, alphaY: alphaY, ebtFractions: ebtFractions, condK: condK, solve: solve,
    makeWater: makeWater, copyWater: copyWater, waterInfo: waterInfo, boil: boil, soda: soda, pptRoot: pptRoot,
    makeResin: makeResin, resinPass: resinPass, soapTest: soapTest,
    createBench: createBench, benchInfo: benchInfo, benchSet: benchSet, benchBoil: benchBoil, benchSoda: benchSoda,
    benchResin: benchResin, benchRegen: benchRegen, benchSoap: benchSoap, soapData: soapData,
    createSession: createSession, newSample: newSample, newRun: newRun, eqAt: eqAt, compute: compute, transmit: transmit, colourKey: colourKey,
    release: release, land: land, settle: settle, endpoint: endpoint, answer: answer, clearAll: clearAll, theory: theory
  };
});
