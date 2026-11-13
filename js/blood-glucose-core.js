/* blood-glucose-core.js — 血糖調節的核心（與畫面分離，Node 可直接 require）
 *
 * 葡萄糖–胰島素動力學：Hovorka 等（Physiol Meas 25:905, 2004）的模型與典型參數（Wilinska 等 2010 的模擬環境）
 *   Q1：可量到的血糖池、Q2：組織間的葡萄糖（mmol/kg）；G = Q1 / VG（mmol/L）
 *   Q1' = −[F01c/(VG·G) + x1]·Q1 + k12·Q2 − FR + UG + EGP0·(1 − x3)
 *   Q2' = x1·Q1 − (k12 + x2)·Q2
 *   胰島素的三種作用（運送 x1、利用 x2、抑制肝臟產糖 x3）：xi' = −kai·xi + kai·SIi·I
 *   F01c：不靠胰島素的利用（腦等），G < 4.5 mmol/L 時按比例減少
 *   FR：腎臟排糖，G > 9 mmol/L（約 162 mg/dL，腎閾）時 0.003·(G − 9)·VG
 *   進食：兩個腸道隔室 D1' = AG·d − D1/tmaxG、D2' = D1/tmaxG − D2/tmaxG、UG = D2/tmaxG
 *   皮下注射的胰島素：兩個隔室 S1' = u − S1/tmaxI、S2' = S1/tmaxI − S2/tmaxI、進入血漿 UI = S2/tmaxI
 *   血漿胰島素 I（mU/L）：I' = (UI + SR)/VI − ke·I
 * 示意的部分（頁面標明）：
 *   內生胰島素分泌 SR（胰臟 β 細胞）：SR 以 10 分鐘的時間常數追上 β·SRmax·G⁴/(K⁴ + G⁴)
 *   升糖素等反調節：G < 4 mmol/L 時肝臟產糖增加（第一型糖尿病減弱）
 *   運動：不靠胰島素的利用增加、胰島素敏感度提高、肝臟產糖增加（仍受胰島素抑制）、胰島素分泌減少
 * 單位：頁面顯示 mg/dL（1 mmol/L = 18.0 mg/dL）
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GlucoseCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MGDL = 18.0;   // 1 mmol/L 葡萄糖 = 18.0 mg/dL
  const MW = 180.16;   // 葡萄糖分子量 g/mol
  const P = {
    EGP0: 0.0161, F01: 0.0097, k12: 0.066,
    ka1: 0.006, ka2: 0.06, ka3: 0.03,
    SIT: 51.2e-4, SID: 8.2e-4, SIE: 520e-4,
    VG: 0.16, VI: 0.12, ke: 0.138,
    tmaxI: 55, tmaxG: 60, AG: 0.8,
    // 示意：內生分泌與反調節
    SRmax: 3, K: 9, h: 6, tauSR: 5,
    CR: 0.012, Ghypo: 4.0,
    EXI: 0.8, EXF: 1.5, EXL: 2.5, EXB: 0.6   // 運動強度 1 時：胰島素敏感度 +80%、不靠胰島素的利用 ×2.5、肝臟產糖 ×3.5、胰島素分泌 −60%（交感神經抑制；示意）
  };
  /** 人的類型：β（β 細胞功能）、si（胰島素敏感度倍數）、cr（反調節倍數） */
  const TYPES = {
    normal: { beta: 1, si: 1, cr: 1 },
    t2: { beta: 0.35, si: 0.3, cr: 1 },
    t1: { beta: 0, si: 0.6, cr: 0.3 }
  };

  /**
   * 建立模擬器。o = {bw 體重 kg, beta, si, cr}
   * 方法：reset(G0 mmol/L)：設成這個人的空腹穩定狀態（若 beta = 0 則用 G0、沒有胰島素）
   *      step(dt, inp)：inp = {meal: 這一步吃進的葡萄糖 mmol/kg（瞬間）, bolus: 這一步打的胰島素 mU/kg, basal: 皮下持續 mU/kg/min, ex: 運動強度 0–1}
   */
  function make(o) {
    o = Object.assign({ bw: 60, beta: 1, si: 1, cr: 1 }, o);
    const s = { Q1: 0, Q2: 0, x1: 0, x2: 0, x3: 0, I: 0, S1: 0, S2: 0, D1: 0, D2: 0, SR: 0, urine: 0, t: 0 };
    function srTarget(G, ex) {
      const g = Math.max(0, G);
      const gh = Math.pow(g, P.h);
      return o.beta * P.SRmax * gh / (Math.pow(P.K, P.h) + gh) * (1 - P.EXB * (ex || 0));
    }
    function deriv(y, inp) {
      const G = y.Q1 / P.VG;
      const ex = inp.ex || 0;
      const siM = o.si * (1 + P.EXI * ex);
      const F01 = P.F01 * (1 + P.EXF * ex);
      const F01c = G >= 4.5 ? F01 : F01 * Math.max(0, G) / 4.5;
      const FR = G > 9 ? 0.003 * (G - 9) * P.VG : 0;
      const UG = y.D2 / P.tmaxG;
      const UI = y.S2 / P.tmaxI;
      const cr = G < P.Ghypo ? o.cr * P.CR * (P.Ghypo - G) / P.Ghypo * 4 : 0;   // 反調節（示意）
      const EGP = Math.max(0, P.EGP0 * (1 + P.EXL * ex) * (1 - y.x3)) + cr;   // 運動時肝臟產糖增加，但仍受胰島素抑制
      return {
        Q1: -(F01c / Math.max(1e-9, G) / P.VG + y.x1) * y.Q1 * (G > 0 ? 1 : 0) + P.k12 * y.Q2 - FR + UG + EGP,
        Q2: y.x1 * y.Q1 - (P.k12 + y.x2) * y.Q2,
        x1: -P.ka1 * y.x1 + P.ka1 * P.SIT * siM * y.I,
        x2: -P.ka2 * y.x2 + P.ka2 * P.SID * siM * y.I,
        x3: -P.ka3 * y.x3 + P.ka3 * P.SIE * siM * y.I,
        I: (UI + y.SR) / P.VI - P.ke * y.I,
        S1: (inp.basal || 0) - y.S1 / P.tmaxI,
        S2: y.S1 / P.tmaxI - y.S2 / P.tmaxI,
        D1: -y.D1 / P.tmaxG,
        D2: y.D1 / P.tmaxG - y.D2 / P.tmaxG,
        SR: (srTarget(G, ex) - y.SR) / P.tauSR,
        urine: FR
      };
    }
    const K = ['Q1', 'Q2', 'x1', 'x2', 'x3', 'I', 'S1', 'S2', 'D1', 'D2', 'SR', 'urine'];
    function rk4(dt, inp) {
      const y0 = {}; K.forEach(function (k) { y0[k] = s[k]; });
      const add = function (a, d, h) { const r = {}; K.forEach(function (k) { r[k] = a[k] + d[k] * h; }); return r; };
      const k1 = deriv(y0, inp), k2 = deriv(add(y0, k1, dt / 2), inp), k3 = deriv(add(y0, k2, dt / 2), inp), k4 = deriv(add(y0, k3, dt), inp);
      K.forEach(function (k) { s[k] = y0[k] + dt / 6 * (k1[k] + 2 * k2[k] + 2 * k3[k] + k4[k]); });
      if (s.Q1 < 0) s.Q1 = 0;
      s.t += dt;
    }
    /** 現在這一刻的流量（mmol/kg/min；胰島素 mU/kg/min）：腸道吸收、肝臟產糖、組織用糖、腎臟排糖、胰臟分泌、皮下進血 */
    function flows(ex) {
      ex = ex || 0;
      const G = s.Q1 / P.VG;
      const F01 = P.F01 * (1 + P.EXF * ex);
      const F01c = G >= 4.5 ? F01 : F01 * Math.max(0, G) / 4.5;
      const cr = G < P.Ghypo ? o.cr * P.CR * (P.Ghypo - G) / P.Ghypo * 4 : 0;
      return {
        ug: s.D2 / P.tmaxG,
        egp: Math.max(0, P.EGP0 * (1 + P.EXL * ex) * (1 - s.x3)) + cr,
        cr: cr,
        use: F01c + s.x2 * s.Q2,
        fr: G > 9 ? 0.003 * (G - 9) * P.VG : 0,
        sr: s.SR,
        ui: s.S2 / P.tmaxI
      };
    }
    const api = {
      s: s, o: o, flows: flows,
      G: function () { return s.Q1 / P.VG; },
      reset: function (G0, basal) {
        K.forEach(function (k) { s[k] = 0; });
        s.t = 0;
        s.Q1 = (G0 || 5) * P.VG;
        s.Q2 = 0;
        if (o.beta > 0 || basal) {
          // 空腹穩定狀態：不吃、只有基礎注射時，所有導數為 0（直接解，等於跑很多天的結果）
          const ss = steadyState(o, basal || 0);
          K.forEach(function (k) { if (ss[k] != null) s[k] = ss[k]; });
        }
        s.urine = 0; s.t = 0;
        return api.G();
      },
      step: function (dt, inp) {
        inp = inp || {};
        if (inp.meal) s.D1 += P.AG * inp.meal;
        if (inp.bolus) s.S1 += inp.bolus;
        rk4(dt, inp);
      },
      /** 這個人吃 g 公克葡萄糖（或醣類）等於多少 mmol/kg */
      carb: function (g) { return g * 1000 / MW / o.bw; },
      /** 胰島素單位（U）換成 mU/kg */
      units: function (u) { return u * 1000 / o.bw; },
      /** 尿中排出的葡萄糖（公克） */
      urineGrams: function () { return s.urine * o.bw * MW / 1000; }
    };
    return api;
  }

  /**
   * 空腹穩定狀態（不吃東西，只有皮下持續注射 basal mU/kg/min）：
   * 胰島素 I = (basal + SR(G))/(VI·ke)，xi = SIi·si·I，Q2 = x1·Q1/(k12 + x2)，再用二分法解 Q1' = 0。
   * Q1' 對 G 遞減（利用與排糖增加、產糖被抑制），所以根唯一。
   */
  function steadyState(o, basal) {
    o = Object.assign({ beta: 1, si: 1, cr: 1 }, o);
    function parts(G) {
      const gh = Math.pow(G, P.h);
      const SR = o.beta * P.SRmax * gh / (Math.pow(P.K, P.h) + gh);
      const I = (basal + SR) / (P.VI * P.ke);
      const x1 = P.SIT * o.si * I, x2 = P.SID * o.si * I, x3 = P.SIE * o.si * I;
      const Q1 = G * P.VG, Q2 = x1 * Q1 / (P.k12 + x2);
      const F01c = G >= 4.5 ? P.F01 : P.F01 * G / 4.5;
      const FR = G > 9 ? 0.003 * (G - 9) * P.VG : 0;
      const cr = G < P.Ghypo ? o.cr * P.CR * (P.Ghypo - G) / P.Ghypo * 4 : 0;
      const dQ1 = -F01c - x1 * Q1 + P.k12 * Q2 - FR + Math.max(0, P.EGP0 * (1 - x3)) + cr;
      return { Q1: Q1, Q2: Q2, x1: x1, x2: x2, x3: x3, I: I, SR: SR, S1: basal * P.tmaxI, S2: basal * P.tmaxI, D1: 0, D2: 0, dQ1: dQ1 };
    }
    let lo = 0.05, hi = 80;
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (parts(mid).dQ1 > 0) lo = mid; else hi = mid; }
    const r = parts((lo + hi) / 2); r.G = (lo + hi) / 2; return r;
  }

  /**
   * 跑一整天（0–1440 分鐘，每分鐘一點）。plan = {
   *   type 或 beta/si/cr、bw,
   *   meals: [{t 分鐘, g 公克}], bolus: [{t, u 單位}], basalU（長效胰島素一天的單位數，平均分配）, ex: [{t, dur, e}]
   *   days：先重複幾天讓起始狀態穩定（預設 2）；flows：true 時另回傳每分鐘的流量 F（見 make().flows）
   * }
   * 回傳 {G[1441]（mg/dL）, I[1441], SR, urine（公克）, stats}
   */
  function day(plan) {
    const ty = TYPES[plan.type] || {};
    const o = { bw: plan.bw || 60, beta: plan.beta != null ? plan.beta : (ty.beta != null ? ty.beta : 1), si: plan.si != null ? plan.si : (ty.si || 1), cr: plan.cr != null ? plan.cr : (ty.cr != null ? ty.cr : 1) };
    const m = make(o);
    const basal = plan.basalU ? m.units(plan.basalU) / 1440 : 0;
    m.reset(plan.G0 || (o.beta > 0 ? 5 : 8), basal);
    const days = plan.days == null ? 2 : plan.days;
    let out = null;
    for (let d = 0; d <= days; d++) {
      const last = d === days;
      const G = [], I = [], F = [];
      const u0 = m.s.urine;
      for (let t = 0; t <= 1440; t++) {
        const inp = { basal: basal, ex: 0 };
        (plan.ex || []).forEach(function (q) { if ((t >= q.t && t < q.t + q.dur) || t + 1440 < q.t + q.dur) inp.ex = Math.max(inp.ex, q.e); });   // 跨過午夜的部分接到隔天開頭
        if (last) { G.push(m.G() * MGDL); I.push(m.s.I); if (plan.flows) { const fl = m.flows(inp.ex); fl.ex = inp.ex; F.push(fl); } }
        if (t === 1440) break;
        (plan.meals || []).forEach(function (q) { if (q.t === t && q.g > 0) inp.meal = (inp.meal || 0) + m.carb(q.g); });
        (plan.bolus || []).forEach(function (q) { if (q.t === t && q.u > 0) inp.bolus = (inp.bolus || 0) + m.units(q.u); });
        m.step(1, inp);
      }
      if (last) out = { G: G, I: I, F: plan.flows ? F : null, urine: (m.s.urine - u0) * o.bw * MW / 1000 };
    }
    out.stats = stats(out.G);
    return out;
  }
  /** 一天的統計：平均、最低、最高、範圍內（70–180 mg/dL）時間比例、低於 70、高於 180、估計糖化血色素 */
  function stats(G) {
    let sum = 0, lo = Infinity, hi = -Infinity, inR = 0, below = 0, above = 0, n = G.length - 1;
    for (let i = 0; i < n; i++) {
      const g = (G[i] + G[i + 1]) / 2;
      sum += g;
      if (g < 70) below++; else if (g > 180) above++; else inR++;
    }
    G.forEach(function (g) { if (g < lo) lo = g; if (g > hi) hi = g; });
    const mean = sum / n;
    return { mean: mean, min: lo, max: hi, tir: inR / n, tbr: below / n, tar: above / n, a1c: a1cOf(mean) };
  }
  /** ADAG（Nathan 等，Diabetes Care 31:1473, 2008）：平均血糖 = 28.7 × A1C − 46.7（mg/dL） */
  function a1cOf(meanMg) { return (meanMg + 46.7) / 28.7; }

  /** 口服葡萄糖耐受試驗：空腹後喝 75 g，回傳每分鐘的血糖、胰島素（0–180 分鐘） */
  function ogtt(o, grams) {
    const m = make(o);
    m.reset(o.beta > 0 ? 5 : 8, o.basal || 0);
    const G = [], I = [];
    for (let t = 0; t <= 180; t++) {
      G.push(m.G() * MGDL); I.push(m.s.I);
      if (t === 180) break;
      m.step(1, { meal: t === 0 ? m.carb(grams == null ? 75 : grams) : 0, basal: o.basal || 0 });
    }
    return { G: G, I: I };
  }
  /** 依空腹與 2 小時血糖判讀（美國糖尿病學會／國健署標準） */
  function diagnose(fast, two) {
    if (fast >= 126 || two >= 200) return 'dm';
    if (fast >= 100 || two >= 140) return 'pre';
    return 'normal';
  }

  return {
    MGDL: MGDL, MW: MW, P: P, TYPES: TYPES,
    make: make, steady: steadyState, day: day, stats: stats, a1cOf: a1cOf, ogtt: ogtt, diagnose: diagnose
  };
});
