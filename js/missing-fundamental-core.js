/*
 * missing-fundamental-core.js — 「缺基頻：聽到不存在的音」的數學核心（不碰 DOM；瀏覽器 window.MissingCore，Node require）
 *
 * 聲音：基頻 f0 的第 k 個泛音（k = 1…10），頻率 f_k = k·f0 + Δ（Δ = 全部平移，進階的位移實驗），
 *   原始振幅 a_k = 1/√k（越高越小但不會太快消失），經過「喇叭／電話」濾波器後變成 a_k·|H(f_k)|。
 *   x(t) = Σ a_k |H(f_k)| sin(2π f_k t)（濾波器的相位延遲不畫，所有成分都從 0 開始）。
 * 濾波器（四階巴特沃斯，每八度 24 dB）：
 *   高通 |H| = 1/√(1 + (fc/f)^8)，低通 |H| = 1/√(1 + (f/fc)^8)；
 *   手機小喇叭 = 高通 250 Hz；電話 = 高通 300 Hz × 低通 3400 Hz；自訂高通 = 高通 fc。
 *   |H| < 0.1（小了 20 dB 以上）的成分當作「喇叭放不出來」，音高模型不採用（波形與聲音仍然照實加上）。
 * 音高模型（簡化）：
 *   最大公因數：喇叭放出的各成分頻率（整數 Hz）的最大公因數 g，波形真正的週期 = 1/g。
 *   自相關：r(τ) = Σ w_i cos(2π f_i τ) / Σ w_i，w_i = (振幅)²/2（就是 x(t)x(t+τ) 的時間平均除以均方值）；
 *     在 τ = 0.2–30 ms 裡找局部最大，分數 = r − 0.15·τ/30 ms（同樣高的峰取最短的那個），最高分的峰 τ* → 音高 1/τ*。
 *   位移實驗的近似（de Boer 1956）：p ≈ f0 + Δ/n，n = 中間成分的泛音次數（能量加權平均後取整數）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MissingCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TAU = 2 * Math.PI;
  const KMAX = 10;
  const F0_MIN = 100, F0_MAX = 400;
  const D_MIN = -150, D_MAX = 150;
  const CUT_MAX = 1500;
  const F_AUDIBLE = 20;          // 低於 20 Hz 的成分（大幅負平移時）丟掉
  const PRESENT_GAIN = 0.1;      // |H| ≥ 0.1 才算喇叭放得出來
  const TAU_MIN = 0.0002, TAU_MAX = 0.030, TAU_STEP = 0.00001;
  const BIAS = 0.15;
  const NMAX = 10;               // 候選音高不低於最低成分的 1/10（殘餘音高大約只到第 10 個泛音左右）
  const TOL = 0.005;             // 音高「相同」的容許（0.5 %，約 9 音分）
  const FILTERS = {
    none: { zh: '不濾波', en: 'No filter', hp: 0, lp: 0 },
    speaker: { zh: '手機小喇叭', en: 'Phone speaker', hp: 250, lp: 0 },
    phone: { zh: '電話', en: 'Telephone', hp: 300, lp: 3400 },
    custom: { zh: '自訂高通', en: 'Custom high-pass', hp: null, lp: 0 }
  };
  const FILTER_IDS = ['none', 'speaker', 'phone', 'custom'];
  const DEFAULT = { f0: 200, on: [true, true, true, true, true, true, true, true, false, false], low: 0, filter: 'none', cut: 500, delta: 0 };

  function amp0(k) { return 1 / Math.sqrt(k); }
  function hp(f, fc) { return fc > 0 ? 1 / Math.sqrt(1 + Math.pow(fc / f, 8)) : 1; }
  function lp(f, fc) { return fc > 0 ? 1 / Math.sqrt(1 + Math.pow(f / fc, 8)) : 1; }
  /** 濾波器實際的高通截止頻率（不濾波 = 0） */
  function cutoffOf(filter, cut) {
    const F = FILTERS[filter] || FILTERS.none;
    return F.hp == null ? Math.max(0, +cut || 0) : F.hp;
  }
  function gainAt(f, filter, cut) {
    if (!(f > 0)) return 0;
    const F = FILTERS[filter] || FILTERS.none;
    return hp(f, cutoffOf(filter, cut)) * lp(f, F.lp);
  }

  function gcd(a, b) { a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b)); while (b) { const t = a % b; a = b; b = t; } return a; }
  function gcdList(arr) { return arr.reduce(function (g, x) { return gcd(g, x); }, 0); }
  /**
   * 容許誤差的近似最大公因數：最大的 g（≥ gmin），使每個 f/g 和最近的整數相差不超過 tol。
   * 候選 g = 最低頻率 ÷ n（n = 1, 2, 3, …），第一個符合的就是最大的。
   */
  function approxGcd(freqs, tol, gmin) {
    if (!freqs.length) return null;
    tol = tol == null ? 0.02 : tol; gmin = gmin || 20;
    const fmin = Math.min.apply(null, freqs);
    for (let n = 1; fmin / n >= gmin; n++) {
      const g = fmin / n;
      if (freqs.every(function (f) { const q = f / g; return Math.abs(q - Math.round(q)) <= tol; })) {
        // 用最小平方法把 g 調到最貼近所有成分：g = Σ m f / Σ m²
        let sm = 0, smm = 0;
        freqs.forEach(function (f) { const m = Math.round(f / g); sm += m * f; smm += m * m; });
        return sm / smm;
      }
    }
    return null;
  }

  /** 狀態整理（缺欄位補預設、超出範圍限制住） */
  function norm(s) {
    s = s || {};
    const on = [];
    for (let k = 0; k < KMAX; k++) on.push(s.on ? !!s.on[k] : DEFAULT.on[k]);
    return {
      f0: Math.max(F0_MIN, Math.min(F0_MAX, Math.round(s.f0 == null ? DEFAULT.f0 : +s.f0))),
      on: on,
      low: Math.max(0, Math.min(KMAX - 1, Math.round(+s.low || 0))),
      filter: FILTERS[s.filter] ? s.filter : 'none',
      cut: Math.max(0, Math.min(CUT_MAX, Math.round(s.cut == null ? DEFAULT.cut : +s.cut))),
      delta: Math.max(D_MIN, Math.min(D_MAX, Math.round(+s.delta || 0)))
    };
  }

  /**
   * 10 個位置的成分：{ k, f, a0（原始振幅）, gain（濾波器）, a（實際振幅；沒開的是 0）, enabled, present, why }
   * why：'off' 開關關掉、'low' 被「移除最低 n 根」拿掉、'sub' 低於 20 Hz、'filter' 被濾波器擋掉（|H| < 0.1）、null 放得出來
   */
  function components(s) {
    s = norm(s);
    const out = [];
    for (let k = 1; k <= KMAX; k++) {
      const f = k * s.f0 + s.delta;
      const a0 = amp0(k);
      const gain = f >= F_AUDIBLE ? gainAt(f, s.filter, s.cut) : 0;
      let why = null;
      if (!s.on[k - 1]) why = 'off';
      else if (k <= s.low) why = 'low';
      else if (f < F_AUDIBLE) why = 'sub';
      const enabled = !why;
      if (enabled && gain < PRESENT_GAIN) why = 'filter';
      out.push({ k: k, f: f, a0: a0, gain: gain, a: enabled ? a0 * gain : 0, enabled: enabled, present: enabled && !why, why: why });
    }
    return out;
  }

  // ---------------- 自相關 ----------------
  function weightsOf(list) { return list.map(function (c) { return { f: c.f, w: c.a * c.a / 2 }; }); }
  /** 正規化自相關 r(τ)（τ 秒）；list = [{ f, w }] */
  function acfW(ws, tau) {
    let s = 0, n = 0;
    for (let i = 0; i < ws.length; i++) { s += ws[i].w * Math.cos(TAU * ws[i].f * tau); n += ws[i].w; }
    return n > 0 ? s / n : 0;
  }
  function acf(list, tau) { return acfW(weightsOf(list), tau); }
  /** 在 [t0, t1] 取 n+1 個點的自相關曲線 */
  function acfCurve(list, t0, t1, n) {
    const ws = weightsOf(list), out = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) out[i] = acfW(ws, t0 + (t1 - t0) * i / n);
    return out;
  }
  /** 黃金分割：在 [a, b] 找 r 的最大值 */
  function refine(ws, a, b) {
    const g = (Math.sqrt(5) - 1) / 2;
    let c = b - g * (b - a), d = a + g * (b - a), fc = acfW(ws, c), fd = acfW(ws, d);
    for (let i = 0; i < 48; i++) {
      if (fc >= fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = acfW(ws, c); }
      else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = acfW(ws, d); }
    }
    const t = (a + b) / 2;
    return { tau: t, r: acfW(ws, t) };
  }
  /**
   * 自相關音高：τ = 0.2–30 ms 的局部最大中，分數 r − 0.15·τ/30 ms 最高的那個。
   * 傳回 { tau, f, r, peaks：[{ tau, r, score }]（前幾個候選） } 或 null（沒有成分）
   */
  function acfPitch(list, opt) {
    opt = opt || {};
    const bias = opt.bias == null ? BIAS : opt.bias, nmax = opt.nmax == null ? NMAX : opt.nmax;
    const ws = weightsOf(list).filter(function (x) { return x.w > 0; });
    if (!ws.length) return null;
    const fLow = Math.min.apply(null, ws.map(function (x) { return x.f; }));
    const tMax = Math.min(TAU_MAX, nmax / fLow);
    const n = Math.round((tMax - TAU_MIN) / TAU_STEP);
    let prev2 = acfW(ws, TAU_MIN - TAU_STEP), prev = acfW(ws, TAU_MIN);
    const peaks = [];
    for (let i = 1; i <= n + 1; i++) {
      const t = TAU_MIN + i * TAU_STEP;
      const cur = acfW(ws, t);
      if (prev >= prev2 && prev > cur) {
        const p = refine(ws, t - 2 * TAU_STEP, t);
        if (p.tau >= TAU_MIN && p.tau <= tMax) peaks.push({ tau: p.tau, r: p.r, score: p.r - bias * p.tau / TAU_MAX });
      }
      prev2 = prev; prev = cur;
    }
    if (!peaks.length) return null;
    let best = peaks[0];
    peaks.forEach(function (p) { if (p.score > best.score + 1e-12) best = p; });
    const top = peaks.slice().sort(function (a, b) { return b.score - a.score; }).slice(0, 4);
    return { tau: best.tau, f: 1 / best.tau, r: best.r, peaks: top };
  }

  /** 位移實驗的近似音高（de Boer）：f0 + Δ/n，n = 能量加權的平均泛音次數取整數 */
  function deBoer(f0, delta, list) {
    if (!list.length) return null;
    let sw = 0, sk = 0;
    list.forEach(function (c) { const w = c.a * c.a; sw += w; sk += w * c.k; });
    const n = Math.max(1, Math.round(sk / sw));
    return { n: n, f: f0 + delta / n };
  }

  /** 合成波形 x(t)（t 秒）；list = [{ f, a }] */
  function waveAt(list, t) {
    let s = 0;
    for (let i = 0; i < list.length; i++) if (list[i].a) s += list[i].a * Math.sin(TAU * list[i].f * t);
    return s;
  }
  /** 均方值 Σ a²/2 */
  function meanSquare(list) { return list.reduce(function (s, c) { return s + c.a * c.a / 2; }, 0); }

  /** 「完整音」：開著的最高那一根以下全部都有、不濾波、不平移（A／B 比較的 A） */
  function completeState(s) {
    s = norm(s);
    let top = 0;
    for (let k = 1; k <= KMAX; k++) if (s.on[k - 1]) top = k;
    top = Math.max(top, 2);
    const on = [];
    for (let k = 1; k <= KMAX; k++) on.push(k <= top);
    return { f0: s.f0, on: on, low: 0, filter: 'none', cut: s.cut, delta: 0 };
  }

  /** 全部的分析 */
  function analyze(s) {
    s = norm(s);
    const comps = components(s);
    const enabled = comps.filter(function (c) { return c.enabled; });
    const present = comps.filter(function (c) { return c.present; });
    const freqs = present.map(function (c) { return c.f; });
    const g = freqs.length ? gcdList(freqs) : 0;
    const P = acfPitch(present);
    const pitch = P ? P.f : null;
    const lowest = freqs.length ? Math.min.apply(null, freqs) : null;
    const db = s.delta ? deBoer(s.f0, s.delta, present) : null;
    // 聽到的音高有沒有對應的成分（±0.5 %）：沒有 = 「不存在的音」
    const atPitch = pitch != null && present.some(function (c) { return Math.abs(c.f / pitch - 1) <= TOL; });
    return {
      s: s, comps: comps, enabled: enabled, present: present, freqs: freqs,
      gcd: g, period: g > 0 ? 1 / g : null,
      pitch: pitch, pitchR: P ? P.r : null, tau: P ? P.tau : null, peaks: P ? P.peaks : [],
      lowest: lowest, hasFund: present.some(function (c) { return c.k === 1; }),
      missing: pitch != null && !atPitch,
      deBoer: db, ms: meanSquare(enabled)
    };
  }

  /** 送給任務判定的資料（頁面的 'state'、'play'、'ab' 事件用同一份） */
  function missionData(s) {
    const R = analyze(s);
    const st = R.s;
    const r6 = function (x) { return x == null ? null : Math.round(x * 1e6) / 1e6; };
    return {
      f0: st.f0, delta: st.delta, filter: st.filter, cut: cutoffOf(st.filter, st.cut), low: st.low,
      on: st.on.map(function (b, i) { return b ? i + 1 : 0; }).filter(Boolean),
      enabled: R.enabled.map(function (c) { return c.k; }),
      present: R.present.map(function (c) { return c.k; }),
      freqs: R.freqs.slice(),
      gcd: R.gcd, period: r6(R.period),
      pitch: r6(R.pitch), pitchR: r6(R.pitchR),
      lowest: R.lowest, hasFund: R.hasFund, missing: R.missing,
      deBoer: R.deBoer ? r6(R.deBoer.f) : null
    };
  }

  /**
   * 聲音參數：所有開著的成分（含被濾波器壓得很小的），振幅依均方根調整、峰值有上限。
   * 成分頻率的最大公因數 ≥ 20 Hz 時用一個週期波（base = 公因數，k = f/base）；否則改用各自獨立的正弦（modes）。
   */
  function audioParts(s, loudRms, peakCap) {
    const R = analyze(s);
    const list = R.enabled.filter(function (c) { return c.a > 1e-4; });
    if (!list.length) return null;
    const ms = meanSquare(list), sumA = list.reduce(function (t, c) { return t + c.a; }, 0);
    const k = Math.min((loudRms || 0.3) / Math.sqrt(ms), (peakCap || 0.95) / sumA);
    const base = gcdList(list.map(function (c) { return c.f; }));
    if (base >= F_AUDIBLE && list.every(function (c) { return c.f / base <= 400; })) {
      return { base: base, partials: list.map(function (c) { return { k: Math.round(c.f / base), a: c.a * k }; }), top: Math.max.apply(null, list.map(function (c) { return c.f; })) };
    }
    return { modes: list.map(function (c) { return { f: c.f, a: c.a * k }; }), top: Math.max.apply(null, list.map(function (c) { return c.f; })) };
  }

  /** 頻率 → 音名與音分偏差（十二平均律、A4 = 440 Hz） */
  function pitchInfo(f, MT) {
    const m = 69 + 12 * Math.log2(f / 440);
    const r = Math.round(m);
    return { midi: m, near: r, cents: 100 * (m - r), name: MT ? MT.noteName(r) : null };
  }
  function cents(a, b) { return 1200 * Math.log2(a / b); }

  return {
    KMAX: KMAX, F0_MIN: F0_MIN, F0_MAX: F0_MAX, D_MIN: D_MIN, D_MAX: D_MAX, CUT_MAX: CUT_MAX,
    F_AUDIBLE: F_AUDIBLE, PRESENT_GAIN: PRESENT_GAIN, TAU_MIN: TAU_MIN, TAU_MAX: TAU_MAX, BIAS: BIAS, TOL: TOL,
    FILTERS: FILTERS, FILTER_IDS: FILTER_IDS, DEFAULT: DEFAULT,
    amp0: amp0, hp: hp, lp: lp, cutoffOf: cutoffOf, gainAt: gainAt,
    gcd: gcd, gcdList: gcdList, approxGcd: approxGcd,
    norm: norm, components: components,
    acf: acf, acfCurve: acfCurve, acfPitch: acfPitch, deBoer: deBoer,
    waveAt: waveAt, meanSquare: meanSquare, completeState: completeState,
    analyze: analyze, missionData: missionData, audioParts: audioParts,
    pitchInfo: pitchInfo, cents: cents
  };
}));
