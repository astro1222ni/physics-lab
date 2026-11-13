/*
 * energy-flow-core.js — 「生態系的能量流動」的計算核心（與畫面無關；Node 可直接 require）
 *
 * 單位：能量 kJ/m²/年；生物量 g（鮮重）/m²；個體質量 g。
 *
 * 一、生產者（第 1 階）
 *   總生產量 GPP = I·ε（I 是到達地面的日照，ε 是光合效率）
 *   淨生產量 NPP = P1 = GPP·(1 − rp)（rp 是植物自己呼吸用掉的比例）
 *   生產者的「同化量」就是 GPP：A1 = GPP。
 * 二、消費者（第 n 階，n ≥ 2）——三個效率（Kozlovsky 1968；Begon、Townsend & Harper《Ecology》）
 *   攝食量   In = CEn · P(n−1)     CE：上一階的淨生產被吃掉的比例（消費效率）
 *   同化量   An = AEn · In         AE：吃進去的被消化吸收的比例（同化效率）；其餘 Fn = In − An 排遺
 *   淨生產量 Pn = PEn · An         PE：同化的能量長成新組織的比例（生產效率）；其餘 Rn = An − Pn 呼吸成熱
 *   沒被吃掉的 U(n−1) = P(n−1) − In 死後成為碎屑；最高一階的 PN 全部成為碎屑。
 *   傳遞效率（Lindeman 1942 的 progressive efficiency）En = An / A(n−1) = CEn·AEn·PE(n−1)，PE1 = 1 − rp。
 * 三、分解者：碎屑 D = ΣU + ΣF；分解者呼吸掉 dec·D，其餘 (1 − dec)·D 累積成土壤有機質、泥炭。
 *   能量守恆：GPP = 所有呼吸的熱 + 累積量（每一步都只是把能量分到不同去處，不會多也不會少）。
 * 四、生物量與個體數（穩定狀態）
 *   某一階的現存量（以能量計）Bn = Pn ÷ (P/B)n；(P/B) 是周轉率（一年長出的量是現存量的幾倍）。
 *   鮮重 = Bn ÷ 能量密度（生產者 5 kJ/g、動物 7 kJ/g，粗略換算）；個體數 = 鮮重 ÷ 個體質量；每隻需要的面積 = 1 ÷ 個體數。
 *   能量（流量）金字塔一定是正的；生物量與個體數（存量）金字塔可以倒立。
 * 五、生物放大作用（穩定狀態的簡化質量平衡）
 *   水中濃度記為 1；生產者濃度 c1 = BCF（生物濃縮係數）。
 *   第 n 階一年吃進 In·c(n−1) 的污染物，吸收 α、其中排出或代謝掉 e，留下的跟著新長的組織 Pn 一起離開這一階：
 *     cn·Pn = α(1 − e)·c(n−1)·In  ⇒  cn / c(n−1) = α(1 − e) / (AEn·PEn)
 *   難分解、脂溶性的物質（DDT、甲基汞）α 大、e 小，每往上一階就放大好幾倍；水溶性、容易排出的物質則不會累積。
 *   每一階往上傳的污染物量 φn = cn·Pn = α(1 − e)·CEn·φ(n−1)：只有全部被吃掉、全部吸收、完全不排出時才守恆。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EFCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MAXN = 6;
  const ED_PLANT = 5, ED_ANIMAL = 7;   // kJ/g 鮮重（粗略）
  const KJ_PER_KCAL = 4.184;

  // ---------- 預設組（參數為示意，量級參考 Odum《Fundamentals of Ecology》與 Begon 等《Ecology》的典型值） ----------
  function L(zh, en, ce, ae, pe, pb, mass) { return { zh: zh, en: en, ce: ce, ae: ae, pe: pe, pb: pb, mass: mass }; }
  const PRESETS = {
    grass: {
      zh: '草原', en: 'Grassland', I: 5e6, eps: 0.01, rp: 0.5, dec: 0.95, N: 4,
      lv: [
        L('草', 'Grass', 0, 0, 0, 2.5, 1),
        L('蚱蜢', 'Grasshoppers', 0.20, 0.40, 0.40, 4, 0.5),
        L('青蛙', 'Frogs', 0.40, 0.80, 0.20, 1.5, 30),
        L('蛇', 'Snakes', 0.40, 0.80, 0.20, 0.8, 300),
        L('大冠鷲', 'Serpent eagles', 0.50, 0.80, 0.03, 0.3, 1500),
        L('第 6 階（假想）', 'Level 6 (imaginary)', 0.50, 0.80, 0.03, 0.2, 10000)
      ]
    },
    ocean: {
      zh: '海洋', en: 'Open ocean', I: 4.5e6, eps: 0.003, rp: 0.4, dec: 0.95, N: 5,
      lv: [
        L('浮游植物', 'Phytoplankton', 0, 0, 0, 200, 1e-9),
        L('浮游動物', 'Zooplankton', 0.50, 0.70, 0.30, 6, 1e-4),
        L('小魚', 'Small fish', 0.50, 0.80, 0.20, 2, 5),
        L('鯖魚', 'Mackerel', 0.50, 0.80, 0.15, 0.8, 300),
        L('鮪魚', 'Tuna', 0.50, 0.80, 0.10, 0.3, 1e5),
        L('第 6 階（假想）', 'Level 6 (imaginary)', 0.50, 0.80, 0.03, 0.2, 5e4)
      ]
    },
    forest: {
      zh: '森林', en: 'Forest', I: 5e6, eps: 0.012, rp: 0.6, dec: 0.95, N: 4,
      lv: [
        L('樹', 'Trees', 0, 0, 0, 0.1, 1e6),
        L('毛毛蟲', 'Caterpillars', 0.05, 0.30, 0.40, 6, 0.5),
        L('山雀', 'Tits', 0.50, 0.80, 0.02, 0.8, 15),
        L('鷹', 'Hawks', 0.30, 0.80, 0.02, 0.3, 1000),
        L('第 5 階（假想）', 'Level 5 (imaginary)', 0.50, 0.80, 0.03, 0.2, 5000),
        L('第 6 階（假想）', 'Level 6 (imaginary)', 0.50, 0.80, 0.03, 0.2, 10000)
      ]
    }
  };
  // 污染物的起始值：難分解、脂溶性的物質（像 DDT）。BCF：生產者比水濃幾倍；α：吃進去被吸收的比例；e：吸收後排出或分解掉的比例
  const POLLUTANT = { bcf: 300, alpha: 0.6, elim: 0.5 };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  /** 由預設組做出一份完整參數（污染物用起始值） */
  function params(presetKey) {
    const pr = PRESETS[presetKey || 'grass'];
    const pp = POLLUTANT;
    return {
      I: pr.I, eps: pr.eps, rp: pr.rp, dec: pr.dec, N: pr.N,
      lv: pr.lv.map(function (l) { return { ce: l.ce, ae: l.ae, pe: l.pe, pb: l.pb, mass: l.mass }; }),
      bcf: pp.bcf, alpha: pp.alpha, elim: pp.elim
    };
  }

  /** 主計算：傳回每一階的各項能量、效率、現存量、個體數與污染物濃度（陣列索引 0 = 第 1 階） */
  function compute(p) {
    const N = Math.max(1, Math.min(MAXN, Math.round(p.N)));
    const GPP = p.I * p.eps;
    const A = [GPP], R = [GPP * p.rp], P = [GPP * (1 - p.rp)], In = [0], F = [0], U = [], E = [NaN];
    for (let n = 1; n < N; n++) {
      const l = p.lv[n];
      In[n] = l.ce * P[n - 1];
      A[n] = l.ae * In[n];
      F[n] = In[n] - A[n];
      P[n] = l.pe * A[n];
      R[n] = A[n] - P[n];
      U[n - 1] = P[n - 1] - In[n];
      E[n] = A[n] / A[n - 1];
    }
    U[N - 1] = P[N - 1];
    let D = 0, Rsum = 0, ing = 0;
    for (let n = 0; n < N; n++) { D += U[n] + F[n]; Rsum += R[n]; ing += In[n]; }
    const Rd = p.dec * D, store = D - Rd, heat = Rsum + Rd;
    // 現存量、個體數
    const Be = [], mass = [], num = [], area = [];
    for (let n = 0; n < N; n++) {
      Be[n] = P[n] / p.lv[n].pb;
      mass[n] = Be[n] / (n === 0 ? ED_PLANT : ED_ANIMAL);
      num[n] = mass[n] / p.lv[n].mass;
      area[n] = num[n] > 0 ? 1 / num[n] : Infinity;
    }
    // 生物放大
    const conc = [p.bcf], bmf = [p.bcf], flux = [p.bcf * P[0]];
    const keep = p.alpha * (1 - p.elim);
    for (let n = 1; n < N; n++) {
      const l = p.lv[n];
      bmf[n] = keep / (l.ae * l.pe);
      conc[n] = conc[n - 1] * bmf[n];
      flux[n] = conc[n] * P[n];
    }
    return {
      N: N, I: p.I, GPP: GPP, NPP: P[0], A: A, R: R, P: P, In: In, F: F, U: U, E: E,
      D: D, Rd: Rd, store: store, heat: heat, ing: ing,
      Be: Be, mass: mass, num: num, area: area, conc: conc, bmf: bmf, flux: flux,
      chain: A[N - 1] / GPP, topP: P[N - 1], topConc: conc[N - 1],
      balance: heat + store - GPP
    };
  }

  /** 金字塔第 k 種量（'energy'＝同化量 A、'biomass'＝鮮重、'numbers'＝個體數、'poll'＝污染物濃度倍數） */
  function pyramid(r, kind) {
    const src = kind === 'biomass' ? r.mass : kind === 'numbers' ? r.num : kind === 'poll' ? r.conc : r.A;
    return src.slice(0, r.N);
  }
  /** 金字塔在哪幾步倒立（上一階比下一階大）；傳回第 n 階（索引 ≥ 1）是否大於第 n−1 階 */
  function inverted(vals) {
    const out = [];
    for (let n = 1; n < vals.length; n++) out[n] = vals[n] > vals[n - 1];
    return out;
  }

  /** 任務事件 'flow' 的資料（頁面與任務證明共用同一份） */
  function eventData(p, view) {
    const r = compute(p), N = r.N;
    const cut = function (a) { return a.slice(0, N); };
    const lv = p.lv.slice(0, N);
    return {
      N: N, I: p.I, eps: p.eps, rp: p.rp, dec: p.dec, bcf: p.bcf, alpha: p.alpha, elim: p.elim, view: view || 'energy',
      ce: lv.map(function (l, i) { return i ? l.ce : 0; }), ae: lv.map(function (l, i) { return i ? l.ae : 0; }),
      pe: lv.map(function (l, i) { return i ? l.pe : 0; }), pb: lv.map(function (l) { return l.pb; }), mass: lv.map(function (l) { return l.mass; }),
      GPP: r.GPP, NPP: r.NPP, A: cut(r.A), R: cut(r.R), P: cut(r.P), E: cut(r.E).map(function (x, i) { return i ? x : null; }),
      bio: cut(r.mass), num: cut(r.num), area: cut(r.area), conc: cut(r.conc), bmf: cut(r.bmf), flux: cut(r.flux),
      D: r.D, ing: r.ing, heat: r.heat, store: r.store
    };
  }

  return {
    eventData: eventData,
    MAXN: MAXN, ED_PLANT: ED_PLANT, ED_ANIMAL: ED_ANIMAL, KJ_PER_KCAL: KJ_PER_KCAL,
    PRESETS: PRESETS, POLLUTANT: POLLUTANT,
    params: params, compute: compute, pyramid: pyramid, inverted: inverted, clone: clone
  };
});
