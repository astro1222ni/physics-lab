/*
 * ph-scale-core.js — 「酸鹼強度與 pH」的化學核心（與畫面無關，Node 可直接 require）
 *
 * 單位：濃度 M（mol/L），溫度 °C（滑桿 25–100 °C）。濃度用 log C（以 M 為單位）表示，範圍 −8 ～ 0。
 *
 * 水的離子積 Kw(T)：Harned 與 Robinson（1940）的經驗式
 *     pKw = 4470.99 / T − 6.0875 + 0.01706 T（T 以 K 為單位）
 *   在 25 °C 得 13.995、100 °C 得 12.260，與 Marshall 與 Franck（1981，CRC Handbook 收錄）的 13.995、12.265 一致。
 *   為了和高中課本一致，25 °C 取 Kw = 1.00 × 10^-14：整條式子平移 +0.0053（遠小於文獻之間的差異）。
 *
 * 酸鹼常數（25 °C，CRC Handbook of Chemistry and Physics「Dissociation constants of inorganic／organic acids」）：
 *   HF pKa 3.20（Ka 6.3 × 10^-4）、CH3COOH 取課本常用的 Ka 1.8 × 10^-5（CRC pKa 4.756）、HClO pKa 7.40（Ka 4.0 × 10^-8）、
 *   HCN pKa 9.21（Ka 6.2 × 10^-10）、NH3 Kb 1.8 × 10^-5（NH4+ pKa 9.25）。HCl、NaOH 視為完全解離。
 *   Ka、Kb 一律用 25 °C 的值（簡化；醋酸的 pKa 在 0–60 °C 間只變 0.04）。
 *
 * 解法（任何濃度都用同一套，不用近似公式）：電荷平衡（電中性）
 *   酸 HA：[H3O+] = [OH-] + [A-]，[A-] = C·Ka/(Ka + [H3O+])（強酸 [A-] = C）
 *   鹼 B ：[H3O+] + [BH+] = [OH-]，[BH+] = C·[H3O+]/([H3O+] + Kw/Kb)（強鹼 [Na+] = C）
 *   代入 [OH-] = Kw/[H3O+]，方程式只剩 [H3O+] 一個未知數，左減右隨 [H3O+] 單調遞增，恰有一根；
 *   對 x = log10[H3O+] 用二分法解到 1e-13 以內。不考慮活性係數（稀薄溶液的理想近似）。
 */
(function (root) {
  'use strict';

  const LOGC_MIN = -8, LOGC_MAX = 0;   // 濃度範圍 10^-8 ～ 1 M
  const T_MIN = 25, T_MAX = 100;       // 溫度範圍（°C）
  const WATER_M = 55.35;               // 25 °C 純水的莫耳濃度（997 g/L ÷ 18.015 g/mol），只用在「多少個水分子才有一個 H3O+」

  /** 物質：kind = water／sa（強酸）／wa（弱酸）／sb（強鹼）／wb（弱鹼）；K = Ka 或 Kb（25 °C） */
  const SPECIES = {
    water: { kind: 'water', zh: '純水', en: 'Pure water', f: 'H2O' },
    HCl: { kind: 'sa', zh: '鹽酸', en: 'Hydrochloric acid', f: 'HCl', base: 'Cl' },
    HF: { kind: 'wa', zh: '氫氟酸', en: 'Hydrofluoric acid', f: 'HF', K: 6.3e-4, base: 'F' },
    CH3COOH: { kind: 'wa', zh: '醋酸', en: 'Acetic acid', f: 'CH3COOH', K: 1.8e-5, base: 'CH3COO' },
    HClO: { kind: 'wa', zh: '次氯酸', en: 'Hypochlorous acid', f: 'HClO', K: 4.0e-8, base: 'ClO' },
    HCN: { kind: 'wa', zh: '氫氰酸', en: 'Hydrocyanic acid', f: 'HCN', K: 6.2e-10, base: 'CN' },
    NaOH: { kind: 'sb', zh: '氫氧化鈉', en: 'Sodium hydroxide', f: 'NaOH', base: 'Na' },
    NH3: { kind: 'wb', zh: '氨水', en: 'Ammonia', f: 'NH3', K: 1.8e-5, base: 'NH4' },
    HX: { kind: 'wa', zh: '未知酸', en: 'Unknown acid', f: 'HX', K: null, base: 'X', unknown: true }
  };
  const ORDER = ['water', 'HCl', 'HF', 'CH3COOH', 'HClO', 'HCN', 'NaOH', 'NH3', 'HX'];

  function isAcid(sp) { const k = SPECIES[sp].kind; return k === 'sa' || k === 'wa'; }
  function isBase(sp) { const k = SPECIES[sp].kind; return k === 'sb' || k === 'wb'; }
  function isWeak(sp) { const k = SPECIES[sp].kind; return k === 'wa' || k === 'wb'; }
  function isStrong(sp) { const k = SPECIES[sp].kind; return k === 'sa' || k === 'sb'; }

  // ======================= 水的離子積 =======================
  const PKW_SHIFT = 14 - (4470.99 / 298.15 - 6.0875 + 0.01706 * 298.15); // 讓 25 °C 剛好 14.000
  /** pKw(T)，T 以 °C 為單位 */
  function pKw(Tc) {
    const T = Tc + 273.15;
    return 4470.99 / T - 6.0875 + 0.01706 * T + PKW_SHIFT;
  }
  function Kw(Tc) { return Math.pow(10, -pKw(Tc)); }

  // ======================= 解 [H3O+] =======================
  /** 電荷平衡式（左減右）在 x = log10[H3O+] 的值；隨 x 單調遞增 */
  function chargeFn(kind, C, K, kw) {
    return function (x) {
      const h = Math.pow(10, x), oh = kw / h;
      switch (kind) {
        case 'water': return h - oh;
        case 'sa': return h - oh - C;
        case 'wa': return h - oh - C * K / (K + h);
        case 'sb': return h + C - oh;
        case 'wb': return h + C * h / (h + kw / K) - oh;
      }
      return NaN;
    };
  }
  function solveH(kind, C, K, kw) {
    const f = chargeFn(kind, C, K, kw);
    let lo = -16, hi = 2;
    while (f(lo) > 0 && lo > -40) lo -= 4;
    while (f(hi) < 0 && hi < 10) hi += 4;
    for (let i = 0; i < 300 && hi - lo > 1e-13; i++) {
      const mid = 0.5 * (lo + hi);
      if (f(mid) > 0) hi = mid; else lo = mid;
    }
    return Math.pow(10, 0.5 * (lo + hi));
  }

  /**
   * 一杯溶液的完整讀數。sp：物質代號；logC：log10(C/M)；Tc：°C；Kx：未知酸 HX 的 Ka（其他物質不用）。
   * 傳回 { sp, kind, logC, C, T, pKw, Kw, K, pK, h, oh, pH, pOH, alpha（解離百分率的小數）, alphaLim（無限稀釋時的上限，只對弱酸），
   *        HA, A（弱酸、強酸的未解離與解離濃度）, B, BH（弱鹼）, pHapprox（課本近似式）, neutral（中性 pH）, waterPerH3O（每個 H3O+ 配多少個水分子）}
   */
  function solution(sp, logC, Tc, Kx) {
    const s = SPECIES[sp];
    if (!s) throw new Error('未知的物質：' + sp);
    const kw = Kw(Tc), pkw = pKw(Tc);
    const kind = s.kind;
    const C = kind === 'water' ? 0 : Math.pow(10, logC);
    const K = s.unknown ? Kx : s.K;
    if (isWeak(sp) && !(K > 0)) throw new Error('缺少 ' + sp + ' 的解離常數');
    const h = solveH(kind, C, K, kw), oh = kw / h;
    const r = { sp: sp, kind: kind, logC: kind === 'water' ? null : logC, C: C, T: Tc, pKw: pkw, Kw: kw, K: K == null ? null : K, pK: K ? -Math.log10(K) : null,
      h: h, oh: oh, pH: -Math.log10(h), pOH: pkw + Math.log10(h), neutral: pkw / 2,
      alpha: null, alphaLim: null, HA: 0, A: 0, B: 0, BH: 0, pHapprox: null, waterPerH3O: WATER_M / h };
    if (kind === 'sa') { r.A = C; r.alpha = 1; r.pHapprox = -logC; }
    else if (kind === 'wa') {
      r.alpha = K / (K + h); r.A = C * r.alpha; r.HA = C - r.A;
      r.alphaLim = K / (K + Math.sqrt(kw));
      r.pHapprox = -0.5 * (Math.log10(K) + logC);
    } else if (kind === 'sb') { r.alpha = 1; r.BH = C; r.pHapprox = pkw + logC; }
    else if (kind === 'wb') {
      r.alpha = h / (h + kw / K); r.BH = C * r.alpha; r.B = C - r.BH;
      r.pHapprox = pkw + 0.5 * (Math.log10(K) + logC);
    } else r.pHapprox = pkw / 2;
    return r;
  }

  /** 電荷平衡的相對殘差（守恆檢查） */
  function balance(r) {
    let pos = r.h, neg = r.oh;
    if (r.kind === 'sa' || r.kind === 'wa') neg += r.A;
    else if (r.kind === 'sb' || r.kind === 'wb') pos += r.BH;
    return Math.abs(pos - neg) / Math.max(pos, neg);
  }

  /** 由 pH 讀數與濃度反推弱酸的 Ka（學生的算法；含水的解離）：Ka = [H3O+][A-]/[HA]，[A-] = [H3O+] − [OH-] */
  function kaFrom(h, C, kw) {
    const A = h - kw / h;
    return h * A / (C - A);
  }

  /** 未知酸 HX：pKa 在 2.50–6.00 之間（rng 傳回 0–1） */
  function newUnknown(rng) {
    const pKa = 2.5 + 3.5 * (rng || Math.random)();
    return { pKa: pKa, Ka: Math.pow(10, -pKa) };
  }

  const api = {
    LOGC_MIN: LOGC_MIN, LOGC_MAX: LOGC_MAX, T_MIN: T_MIN, T_MAX: T_MAX, WATER_M: WATER_M,
    SPECIES: SPECIES, ORDER: ORDER, isAcid: isAcid, isBase: isBase, isWeak: isWeak, isStrong: isStrong,
    pKw: pKw, Kw: Kw, solveH: solveH, solution: solution, balance: balance, kaFrom: kaFrom, newUnknown: newUnknown
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PhCore = api;
})(typeof window !== 'undefined' ? window : this);
