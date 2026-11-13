/*
 * loudness-core.js — 「分貝、等響曲線與聽力保護」的數學核心（不碰 DOM，瀏覽器與 Node 都能用）
 *
 * 1. 等響曲線（ISO 226:2003 第 4 節的公式與附錄的參數表；ISO 226:2023 的修訂與 2003 版相差最多約 0.6 dB）
 *    給定頻率 f 與響度級 L_N（phon），聲壓級
 *      A_f = 4.47×10^-3 · (10^(0.025 L_N) − 1.15) + (0.4 · 10^((T_f + L_U)/10 − 9))^α_f
 *      L_p = (10/α_f) · log10(A_f) − L_U + 94
 *    α_f（響度感覺的指數）、L_U（線性傳遞函數的大小，以 1 kHz 為準）、T_f（聽閾）在 29 個三分之一倍頻程頻率（20 Hz–12.5 kHz）上列表。
 *    係數表已和兩份獨立的公開程式碼逐一核對（MATLAB 版 iso226.m，dsprelated.com/showcode/174.php；
 *    Python 版，crackedbassoon.com/writing/equal-loudness-contours），29 × 3 個數字完全相同。
 *    反算（聲壓級 → phon）直接把上式解開（和正算互為反函數）：
 *      A_f = 10^(α_f (L_p + L_U − 94)/10)，L_N = 40 · log10((A_f − T項)/4.47×10^-3 + 1.15)
 *    ISO 226 第 4.2 節另有一條近似的反算公式（phonISO），和精確反算相差不到 0.1 phon（單元測試核對）。
 *    表以外的頻率：把三個參數對「頻率的對數」做 Catmull-Rom 三次內插（通過每一個表上的點，曲線平滑）。
 *    有效範圍（ISO 226:2003）：20 Hz–4 kHz 為 20–90 phon，5–12.5 kHz 為 20–80 phon；以外（含 10 與 100 phon）只供參考，畫成虛線。
 * 2. 響度（sone）：40 phon = 1 sone，40 phon 以上每加 10 phon 響度加倍（Stevens）：N = 2^((L_N − 40)/10)；
 *    40 phon 以下用常見的近似 N = (L_N / 40)^2.642（兩式在 40 phon 相接）。
 * 3. 分貝相加（不相關的聲源，能量相加）：L = 10 log10 Σ 10^(L_i/10)；N 個相同聲源 = L + 10 log10 N。
 * 4. 距離（點聲源、自由場，平方反比）：L(r) = L(1 m) − 20 log10(r / 1 m)；距離加倍 −6.02 dB。
 * 5. 噪音暴露（NIOSH 1998）：85 dBA 每天 8 小時，每加 3 dB 容許時間減半：T = 8 h / 2^((L − 85)/3)；劑量 = 聽的時間 / T。
 * 6. A 加權（IEC 61672-1 的解析式）：給 dBA 的換算用。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LoudCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- ISO 226:2003 附錄的參數表 ----------
  const F = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500];
  const AF = [0.532, 0.506, 0.480, 0.455, 0.432, 0.409, 0.387, 0.367, 0.349, 0.330, 0.315, 0.301, 0.288, 0.276, 0.267, 0.259, 0.253, 0.250, 0.246, 0.244, 0.243, 0.243, 0.243, 0.242, 0.242, 0.245, 0.254, 0.271, 0.301];
  const LU = [-31.6, -27.2, -23.0, -19.1, -15.9, -13.0, -10.3, -8.1, -6.2, -4.5, -3.1, -2.0, -1.1, -0.4, 0.0, 0.3, 0.5, 0.0, -2.7, -4.1, -1.0, 1.7, 2.5, 1.2, -2.1, -7.1, -11.2, -10.7, -3.1];
  const TF = [78.5, 68.7, 59.5, 51.1, 44.0, 37.5, 31.5, 26.5, 22.1, 17.9, 14.4, 11.4, 8.6, 6.2, 4.4, 3.0, 2.2, 2.4, 3.5, 1.7, -1.3, -4.2, -6.0, -5.4, -1.5, 6.0, 12.6, 13.9, 12.3];
  const F_MIN = 20, F_MAX = 12500;
  const LOG10 = Math.log10 || function (x) { return Math.log(x) / Math.LN10; };
  const LG = F.map(function (f) { return LOG10(f); });

  // ---------- 滑桿與範圍 ----------
  const FPOS_MAX = 1000;                 // 頻率滑桿：位置 0–1000，對數刻度（每格 ×1.00646，約 0.65 %）
  const LP_MIN = -10, LP_MAX = 130;      // 圖的縱軸（dB）
  const PHON_MIN = 0, PHON_MAX = 100;
  const R_KMIN = -4, R_KMAX = 20;        // 距離滑桿：r = 2^(k/4) m，0.5 m–32 m（每 4 格加倍）
  const R_MIN = 0.5, R_MAX = 32;
  const NIOSH_REF = 85, NIOSH_HOURS = 8, NIOSH_EXCHANGE = 3;
  const SONE_LOW_EXP = 2.642;

  const clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  const clampF = function (f) { return clamp(+f || 1000, F_MIN, F_MAX); };
  function fFromPos(p) { return F_MIN * Math.pow(F_MAX / F_MIN, clamp(p, 0, FPOS_MAX) / FPOS_MAX); }
  function posFromF(f) { return FPOS_MAX * Math.log(clampF(f) / F_MIN) / Math.log(F_MAX / F_MIN); }
  function rFromK(k) { return Math.pow(2, clamp(k, R_KMIN, R_KMAX) / 4); }
  function kFromR(r) { return 4 * Math.log2(clamp(r, R_MIN, R_MAX)); }

  /** Catmull-Rom 三次內插（對頻率的對數）；在表上的頻率剛好等於表值 */
  function interp(tab, f) {
    const x = LOG10(clampF(f));
    let i = 0;
    while (i < F.length - 2 && x > LG[i + 1]) i++;
    const t = clamp((x - LG[i]) / (LG[i + 1] - LG[i]), 0, 1);
    const p1 = tab[i], p2 = tab[i + 1];
    const p0 = i > 0 ? tab[i - 1] : 2 * p1 - p2;
    const p3 = i + 2 < tab.length ? tab[i + 2] : 2 * p2 - p1;
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  /** 某個頻率的三個參數 { af, Lu, Tf } */
  function params(f) { return { af: interp(AF, f), Lu: interp(LU, f), Tf: interp(TF, f) }; }
  function tTerm(p) { return Math.pow(0.4 * Math.pow(10, (p.Tf + p.Lu) / 10 - 9), p.af); }

  /** 響度級 L_N（phon）在頻率 f 的聲壓級（dB）：ISO 226:2003 式 (1)(2) */
  function splFromPhon(f, LN) {
    const p = params(f);
    const Af = 4.47e-3 * (Math.pow(10, 0.025 * LN) - 1.15) + tTerm(p);
    return (10 / p.af) * LOG10(Af) - p.Lu + 94;
  }
  /** 聲壓級 Lp 在頻率 f 的響度級（phon）：上式的精確反函數；太小（反算無解）時傳回 null */
  function phonFromSpl(f, Lp) {
    const p = params(f);
    const Af = Math.pow(10, p.af * (Lp + p.Lu - 94) / 10);
    const arg = (Af - tTerm(p)) / 4.47e-3 + 1.15;
    if (!(arg > 0)) return null;
    return 40 * LOG10(arg);
  }
  /** ISO 226:2003 第 4.2 節的近似反算公式（只用來核對） */
  function phonISO(f, Lp) {
    const p = params(f);
    const Bf = Math.pow(0.4 * Math.pow(10, (Lp + p.Lu) / 10 - 9), p.af) - tTerm(p) + 0.005135;
    return Bf > 0 ? 40 * LOG10(Bf) + 94 : null;
  }
  /** 聽閾（dB）：ISO 226 表中的 T_f（與 ISO 389-7 一致） */
  function threshold(f) { return interp(TF, f); }
  /** 聽閾本身的響度級：L_p = T_f 時 A_f 和 T 項幾乎相等（比值 (10^-0.4/0.4)^α_f ≈ 0.999），
   *  所以 L_N 約是 40 log10(1.15) ≈ 2.43 phon（各頻率在 2.40–2.42 之間）：聽閾曲線就是一條約 2.4 phon 的等響曲線 */
  const PHON_AT_THRESHOLD = 40 * LOG10(1.15);
  /** ISO 226:2003 有效範圍：20 Hz–4 kHz 為 20–90 phon；4 kHz 以上為 20–80 phon */
  function valid(f, LN) { return LN >= 20 - 1e-9 && LN <= (f <= 4000 + 1e-9 ? 90 : 80) + 1e-9; }

  // ---------- 響度（sone） ----------
  function sone(LN) {
    if (LN == null || !isFinite(LN) || LN <= 0) return 0;
    return LN >= 40 ? Math.pow(2, (LN - 40) / 10) : Math.pow(LN / 40, SONE_LOW_EXP);
  }
  function phonFromSone(N) {
    if (!(N > 0)) return 0;
    return N >= 1 ? 40 + 10 * Math.log2(N) : 40 * Math.pow(N, 1 / SONE_LOW_EXP);
  }

  /** 一個點的完整分析 */
  function analyze(f, Lp) {
    f = clampF(f);
    const thr = threshold(f);
    const ph = phonFromSpl(f, Lp);
    const audible = Lp > thr;
    return {
      f: f, Lp: Lp, phon: ph, sone: audible && ph != null ? sone(ph) : 0, thr: thr, above: Lp - thr, audible: audible,
      valid: ph != null && valid(f, ph), lp1k: ph == null ? null : splFromPhon(1000, ph), aw: aWeight(f), dBA: Lp + aWeight(f),
      slope: slope(f, Lp)
    };
  }
  /** 響度級對聲壓級的斜率 dL_N/dL_p（phon / dB）：低頻區大於 1（等響曲線擠在一起） */
  function slope(f, Lp) {
    const a = phonFromSpl(f, Lp - 0.05), b = phonFromSpl(f, Lp + 0.05);
    return a == null || b == null ? null : (b - a) / 0.1;
  }

  /** 一條等響曲線上聲壓級最低的地方（耳朵最敏感的頻率）：先粗掃再黃金分割 */
  function contourMin(LN, lo, hi) {
    lo = lo || 1000; hi = hi || 8000;
    const g = function (x) { return splFromPhon(Math.pow(10, x), LN); };
    let a = LOG10(lo), b = LOG10(hi);
    let best = a, bv = Infinity;
    for (let i = 0; i <= 400; i++) { const x = a + (b - a) * i / 400, v = g(x); if (v < bv) { bv = v; best = x; } }
    a = best - (b - a) / 400; b = best + (b - a) / 400;
    const r = (Math.sqrt(5) - 1) / 2;
    for (let k = 0; k < 80; k++) {
      const c = b - r * (b - a), d = a + r * (b - a);
      if (g(c) < g(d)) b = d; else a = c;
    }
    const x = (a + b) / 2;
    return { f: Math.pow(10, x), Lp: g(x) };
  }
  /** 一條等響曲線在 lo–hi 之間聲壓級最高的地方（高頻那座「小山」，約 10 kHz） */
  function contourMax(LN, lo, hi) {
    lo = lo || 6000; hi = hi || 12500;
    const g = function (x) { return -splFromPhon(Math.pow(10, x), LN); };
    let a = LOG10(lo), b = LOG10(hi);
    let best = a, bv = Infinity;
    for (let i = 0; i <= 400; i++) { const x = a + (b - a) * i / 400, v = g(x); if (v < bv) { bv = v; best = x; } }
    const span = (b - a) / 400;
    a = Math.max(LOG10(lo), best - span); b = Math.min(LOG10(hi), best + span);
    const r = (Math.sqrt(5) - 1) / 2;
    for (let k = 0; k < 80; k++) {
      const c = b - r * (b - a), d = a + r * (b - a);
      if (g(c) < g(d)) b = d; else a = c;
    }
    const x = (a + b) / 2;
    return { f: Math.pow(10, x), Lp: -g(x) };
  }

  // ---------- A 加權（IEC 61672-1） ----------
  function aWeight(f) {
    const f2 = f * f;
    const ra = (12194 * 12194 * f2 * f2) / ((f2 + 20.6 * 20.6) * Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) * (f2 + 12194 * 12194));
    return 20 * LOG10(ra) + 2.0;
  }

  // ---------- 分貝相加與距離 ----------
  function sumDb(list) {
    let s = 0;
    list.forEach(function (L) { if (L != null && isFinite(L)) s += Math.pow(10, L / 10); });
    return s > 0 ? 10 * LOG10(s) : -Infinity;
  }
  function nSame(L, N) { return L + 10 * LOG10(Math.max(1, N)); }
  function atDistance(L1m, r) { return L1m - 20 * LOG10(r); }
  /** 加法器的完整計算：聲源 1（N 個相同的）、聲源 2（可關掉）、距離 r（m）；聲源的 dB 都是「1 m 處」的值 */
  function mix(o) {
    const N = Math.max(1, Math.round(o.N || 1));
    const L1n = nSame(o.L1, N);
    const total1 = o.on2 ? sumDb([L1n, o.L2]) : L1n;
    const loud = o.on2 ? Math.max(L1n, o.L2) : L1n;
    const r = clamp(o.r || 1, R_MIN, R_MAX);
    return {
      L1: o.L1, N: N, L2: o.L2, on2: !!o.on2, r: r, L1n: L1n, total1: total1, totalR: atDistance(total1, r),
      inc: total1 - loud,                 // 比最大的那一個多幾 dB
      incOne: total1 - o.L1,              // 比一個聲源 1 多幾 dB
      loudRatio: Math.pow(2, (total1 - o.L1) / 10)   // 聽起來約是一個聲源 1 的幾倍響（以 40 phon 以上、10 dB ≈ 響度加倍估計）
    };
  }

  // ---------- 噪音暴露（NIOSH） ----------
  /** 每天容許時間（小時） */
  function nioshHours(L) { return NIOSH_HOURS / Math.pow(2, (L - NIOSH_REF) / NIOSH_EXCHANGE); }
  /** 劑量（%）：聽 h 小時 */
  function dose(L, h) { return 100 * h / nioshHours(L); }
  /** 某個容許時間（小時）對應的聲級 */
  function levelForHours(h) { return NIOSH_REF + NIOSH_EXCHANGE * Math.log2(NIOSH_HOURS / h); }
  /** 小時 → { h, m, s }（四捨五入到秒） */
  function hms(hours) {
    const s = Math.round(hours * 3600);
    return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
  }

  // ---------- 力度記號（大致的聲壓級，示意值；單一樂器、約 1 公尺處，各書差異很大） ----------
  const DYNAMICS = [
    { id: 'pp', L: 50, zh: '很弱', en: 'very soft' },
    { id: 'p', L: 58, zh: '弱', en: 'soft' },
    { id: 'mp', L: 64, zh: '中弱', en: 'moderately soft' },
    { id: 'mf', L: 70, zh: '中強', en: 'moderately loud' },
    { id: 'f', L: 80, zh: '強', en: 'loud' },
    { id: 'ff', L: 90, zh: '很強', en: 'very loud' }
  ];
  // 生活中的聲音（大致的 A 加權聲級，示意值）
  const EVERYDAY = [
    { L: 30, zh: '安靜的臥室', en: 'quiet bedroom' },
    { L: 60, zh: '一般交談', en: 'conversation' },
    { L: 85, zh: '繁忙的路口', en: 'busy traffic' },
    { L: 94, zh: '練團室、KTV', en: 'band room, karaoke' },
    { L: 100, zh: '演唱會前排', en: 'front of a concert' },
    { L: 110, zh: '喇叭旁', en: 'next to a speaker' }
  ];

  return {
    F: F, AF: AF, LU: LU, TF: TF, F_MIN: F_MIN, F_MAX: F_MAX, FPOS_MAX: FPOS_MAX, LP_MIN: LP_MIN, LP_MAX: LP_MAX,
    PHON_MIN: PHON_MIN, PHON_MAX: PHON_MAX, R_KMIN: R_KMIN, R_KMAX: R_KMAX, R_MIN: R_MIN, R_MAX: R_MAX,
    NIOSH_REF: NIOSH_REF, NIOSH_HOURS: NIOSH_HOURS, NIOSH_EXCHANGE: NIOSH_EXCHANGE, PHON_AT_THRESHOLD: PHON_AT_THRESHOLD,
    DYNAMICS: DYNAMICS, EVERYDAY: EVERYDAY,
    clamp: clamp, clampF: clampF, fFromPos: fFromPos, posFromF: posFromF, rFromK: rFromK, kFromR: kFromR,
    params: params, splFromPhon: splFromPhon, phonFromSpl: phonFromSpl, phonISO: phonISO, threshold: threshold, valid: valid,
    sone: sone, phonFromSone: phonFromSone, analyze: analyze, slope: slope, contourMin: contourMin, contourMax: contourMax,
    aWeight: aWeight, sumDb: sumDb, nSame: nSame, atDistance: atDistance, mix: mix,
    nioshHours: nioshHours, dose: dose, levelForHours: levelForHours, hms: hms
  };
}));
