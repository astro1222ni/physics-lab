/*
 * harmonic-series-core.js — 「泛音列與音色」的數學核心（不碰 DOM；瀏覽器 window.HarmonicCore，Node require）
 *
 * 一個週期波 = 基頻 f0 與整數倍泛音的正弦疊加（傅立葉級數）：
 *   同相：     x(t) = Σ_{k=1}^{N} a_k · sin(2π k t / T)              （a_k 可正可負；負的 = 上下顛倒的正弦 = 相位 π）
 *   隨機相位： x(t) = Σ_{k=1}^{N} |a_k| · sin(2π k t / T + φ_k)       （φ_k 由固定種子的亂數產生）
 * 頻譜（振幅譜）是 |a_k|，和相位無關。
 *
 * 內容：
 *   對數基頻滑桿換算 f0FromPos／posFromF0；
 *   方波、鋸齒波、三角波的精確傅立葉係數（含正負號）與理想波形；
 *   樂器音色的「示意近似」（長笛、單簧管、雙簧管、小提琴、人聲「啊」）；
 *   合成波形取樣、均方值（帕塞瓦爾：Σa²/2）、均方根、峰值、峰值因數、頻譜重心（振幅平方加權）、奇偶能量、
 *   各泛音的最大公因數（波形真正重複的頻率）、形狀誤差、吉布斯過衝。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HarmonicCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PI = Math.PI, TAU = 2 * Math.PI;
  const KMAX = 16;            // 最多 16 個泛音（含基頻）
  const F0_MIN = 110, F0_MAX = 880, POS_MAX = 1000;
  const EPS = 0.005;          // |a| 小於這個值當作 0（長條的精度是 0.01）
  const DEFAULT = { f0: 220, N: 12, preset: 'violin', mode: 'sine', seed: 1 };

  // ---------------- 基頻：對數滑桿 ----------------
  /** 滑桿位置 0–1000 → 基頻 110–880 Hz（每 333.3 格一個八度） */
  function f0FromPos(p) { return F0_MIN * Math.pow(F0_MAX / F0_MIN, p / POS_MAX); }
  function posFromF0(f) { return POS_MAX * Math.log(f / F0_MIN) / Math.log(F0_MAX / F0_MIN); }

  // ---------------- 精確的傅立葉係數（x(t) = Σ b_k sin(kωt)） ----------------
  /** 方波（±1）：只有奇次，b_k = 4/(πk) */
  function squareCoef(k) { return k % 2 ? 4 / (PI * k) : 0; }
  /** 鋸齒波（一個週期內從 −1 線性升到 +1，在 T/2 跳回）：b_k = (−1)^(k+1) · 2/(πk) */
  function sawCoef(k) { return (k % 2 ? 1 : -1) * 2 / (PI * k); }
  /** 三角波（峰值 ±1，在 T/4 最高）：只有奇次，b_k = (−1)^((k−1)/2) · 8/(π²k²) */
  function triangleCoef(k) { return k % 2 ? ((((k - 1) / 2) % 2) ? -1 : 1) * 8 / (PI * PI * k * k) : 0; }
  /** 理想（無限多個泛音）的波形，t 以週期為單位 */
  function frac(x) { return x - Math.floor(x); }
  function idealWave(kind, t) {
    const u = frac(t);
    if (kind === 'square') return u === 0 || u === 0.5 ? 0 : (u < 0.5 ? 1 : -1);
    if (kind === 'sawtooth') { const v = frac(u + 0.5); return v === 0 ? 0 : 2 * v - 1; }
    if (kind === 'triangle') return (2 / PI) * Math.asin(Math.sin(TAU * u));
    return Math.sin(TAU * u);
  }

  // ---------------- 樂器音色的示意近似 ----------------
  /** 小提琴的琴身共鳴（示意）：在對數頻率上的三個峰（空氣共鳴約 280 Hz、主木板共鳴約 470 Hz、琴橋丘約 2.6 kHz；w 是寬度，單位八度） */
  const VIOLIN_PEAKS = [{ f: 280, h: 0.6, w: 0.25 }, { f: 470, h: 0.8, w: 0.4 }, { f: 2600, h: 1.0, w: 0.7 }];
  function violinBody(f) {
    let r = 0.45;
    VIOLIN_PEAKS.forEach(function (p) { const d = Math.log2(f / p.f) / p.w; r += p.h * Math.exp(-0.5 * d * d); });
    return r;
  }
  /** 人聲「啊」的共振峰（示意；成年男聲附近的值）：F1 ≈ 700 Hz、F2 ≈ 1200 Hz、F3 ≈ 2600 Hz 與頻寬 */
  const FORMANTS = [{ f: 700, b: 110 }, { f: 1200, b: 120 }, { f: 2600, b: 160 }];
  /** 共振峰包絡：三個二階共振器串接的增益（f → 0 時為 1） */
  function formantGain(f) {
    let g = 1;
    FORMANTS.forEach(function (F) { const F2 = F.f * F.f; g *= F2 / Math.sqrt(Math.pow(F2 - f * f, 2) + Math.pow(F.b * f, 2)); });
    return g;
  }
  function normalize(a) {
    let m = 0;
    a.forEach(function (x) { m = Math.max(m, Math.abs(x)); });
    return m > 0 ? a.map(function (x) { return x / m; }) : a.slice();
  }
  function table(list) { const a = new Array(KMAX).fill(0); list.forEach(function (x, i) { if (i < KMAX) a[i] = x; }); return a; }

  const PRESETS = {
    pure: { zh: '純音', en: 'Pure tone', approx: false },
    flute: { zh: '長笛', en: 'Flute', approx: true },
    clarinet: { zh: '單簧管', en: 'Clarinet', approx: true },
    oboe: { zh: '雙簧管', en: 'Oboe', approx: true },
    violin: { zh: '小提琴', en: 'Violin', approx: true, dependsOnF0: true },
    voice: { zh: '人聲「啊」', en: 'Voice “ah”', approx: true, dependsOnF0: true },
    square: { zh: '方波', en: 'Square wave', approx: false },
    sawtooth: { zh: '鋸齒波', en: 'Sawtooth wave', approx: false },
    triangle: { zh: '三角波', en: 'Triangle wave', approx: false }
  };
  const PRESET_IDS = Object.keys(PRESETS);

  /**
   * 預設音色的 16 個係數（a[0] 是基頻，a[k−1] 是第 k 個泛音），最大的 |a| 正規化成 1。
   * 樂器是自己調的示意近似：真實樂器的頻譜隨音高、力度、演奏者而變。
   */
  function preset(id, f0) {
    f0 = f0 || DEFAULT.f0;
    const a = new Array(KMAX).fill(0);
    let k;
    switch (id) {
      case 'pure': a[0] = 1; return a;
      case 'square': for (k = 1; k <= KMAX; k++) a[k - 1] = squareCoef(k); break;
      case 'sawtooth': for (k = 1; k <= KMAX; k++) a[k - 1] = sawCoef(k); break;
      case 'triangle': for (k = 1; k <= KMAX; k++) a[k - 1] = triangleCoef(k); break;
      // 長笛：基頻最強、第 2 泛音也明顯，往上很快變弱（接近純音、柔和）
      case 'flute': return table([1, 0.55, 0.28, 0.15, 0.08, 0.05, 0.03, 0.02, 0.012, 0.008, 0.005, 0.003, 0.002, 0.001, 0.001, 0.001]);
      // 單簧管（低音區）：奇次泛音強、偶次很弱（「空心」的聲音）；高頻的偶次稍微回來
      case 'clarinet': return table([1, 0.03, 0.75, 0.04, 0.5, 0.03, 0.33, 0.05, 0.2, 0.06, 0.12, 0.05, 0.07, 0.04, 0.04, 0.03]);
      // 雙簧管：第 2–5 泛音比基頻強（鼻音、明亮）
      case 'oboe': return table([0.42, 0.78, 1, 0.84, 0.62, 0.4, 0.3, 0.22, 0.16, 0.11, 0.08, 0.06, 0.04, 0.03, 0.02, 0.015]);
      // 小提琴：弓拉弦的鋸齒波（1/k）乘上琴身共鳴
      case 'violin': for (k = 1; k <= KMAX; k++) a[k - 1] = violinBody(k * f0) / k; break;
      // 人聲「啊」：聲門的聲源（約 1/k）乘上共振峰包絡
      case 'voice': for (k = 1; k <= KMAX; k++) a[k - 1] = formantGain(k * f0) / k; break;
      default: a[0] = 1; return a;
    }
    return normalize(a);
  }

  // ---------------- 亂數與相位 ----------------
  /** mulberry32：固定種子的亂數（0 ≤ r < 1） */
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** 第 seed 組隨機相位（16 個，0–2π） */
  function randomPhases(seed) {
    const r = rng(0x9E3779B9 ^ Math.imul(seed | 0, 2654435761));
    const out = [];
    for (let k = 0; k < KMAX; k++) out.push(TAU * r());
    return out;
  }

  // ---------------- 由長條得到各分量 ----------------
  /**
   * 各正弦分量 [{ k, c, p }]：x(t) = Σ c · sin(2πk t + p)。
   * a：16 個係數；N：泛音數；mode：'sine'（同相）或 'random'；seed：隨機相位的組別；
   * upto：只取前幾個泛音（「一個一個加上泛音」時用）。|a| < EPS 的分量略過。
   */
  function components(a, N, mode, seed, upto) {
    const n = Math.min(KMAX, Math.max(0, N | 0), upto == null ? KMAX : upto);
    const ph = mode === 'random' ? randomPhases(seed) : null;
    const out = [];
    for (let k = 1; k <= n; k++) {
      const v = a[k - 1] || 0;
      if (Math.abs(v) < EPS) continue;
      if (ph) out.push({ k: k, c: Math.abs(v), p: ph[k - 1] });
      else out.push({ k: k, c: v, p: 0 });
    }
    return out;
  }
  /** 合成波形在時刻 t（以週期為單位）的值 */
  function waveAt(comp, t) {
    let s = 0;
    for (let i = 0; i < comp.length; i++) s += comp[i].c * Math.sin(TAU * comp[i].k * t + comp[i].p);
    return s;
  }
  /** 取樣：n 點、涵蓋 periods 個週期 */
  function sample(comp, n, periods) {
    const out = new Float64Array(n);
    const P = periods || 1;
    for (let i = 0; i < n; i++) out[i] = waveAt(comp, P * i / (n - 1));
    return out;
  }

  // ---------------- 量 ----------------
  /** 均方值：帕塞瓦爾定理，正弦分量互相正交，均方值 = Σ c²/2（和相位無關） */
  function meanSquare(comp) { let s = 0; comp.forEach(function (x) { s += x.c * x.c / 2; }); return s; }
  function rms(comp) { return Math.sqrt(meanSquare(comp)); }
  /** 直接在一個週期上數值積分的均方值（測試帕塞瓦爾用） */
  function meanSquareNumeric(comp, n) {
    n = n || 4096;
    let s = 0;
    for (let i = 0; i < n; i++) { const v = waveAt(comp, i / n); s += v * v; }
    return s / n;   // 週期函數的矩形法對三角多項式是精確的（n > 2·最高次數）
  }
  /** 一個週期內 |x(t)| 的最大值與它的位置（先密集取樣、再用三分法細修） */
  function peakInfo(comp) {
    if (!comp.length) return { peak: 0, t: 0 };
    const kmax = comp.reduce(function (m, x) { return Math.max(m, x.k); }, 1);
    const n = Math.max(512, kmax * 64);
    let best = -1, bi = 0;
    for (let i = 0; i < n; i++) { const v = Math.abs(waveAt(comp, i / n)); if (v > best) { best = v; bi = i; } }
    let lo = (bi - 1) / n, hi = (bi + 1) / n;
    const f = function (t) { return Math.abs(waveAt(comp, t)); };
    for (let it = 0; it < 60; it++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      if (f(m1) < f(m2)) lo = m1; else hi = m2;
    }
    const tp = (lo + hi) / 2, vp = f(tp);
    return vp >= best ? { peak: vp, t: frac(tp) } : { peak: best, t: bi / n };
  }
  function peak(comp) { return peakInfo(comp).peak; }
  /** 峰值因數 = 峰值 ÷ 均方根（純音是 √2；沒有聲音時為 null） */
  function crest(comp) { const r = rms(comp); return r > 0 ? peak(comp) / r : null; }
  /** 頻譜重心：用振幅平方（能量）加權的平均頻率；傳回相對基頻的倍數 */
  function centroidRatio(comp) {
    let w = 0, s = 0;
    comp.forEach(function (x) { const e = x.c * x.c; w += e; s += x.k * e; });
    return w > 0 ? s / w : null;
  }
  /** 奇次與偶次泛音的能量（各自的 Σc²/2） */
  function oddEven(comp) {
    let o = 0, e = 0;
    comp.forEach(function (x) { if (x.k % 2) o += x.c * x.c / 2; else e += x.c * x.c / 2; });
    return { odd: o, even: e };
  }
  function gcd(a, b) { while (b) { const t = a % b; a = b; b = t; } return a; }
  /** 有聲音的泛音次數的最大公因數：波形真正的週期是 T / g，重複的頻率是 g·f0 */
  function harmonicGcd(comp) { return comp.reduce(function (g, x) { return gcd(g, x.k); }, 0); }
  /** 最強的成分是第幾個泛音 */
  function strongest(comp) {
    let k = 0, m = -1;
    comp.forEach(function (x) { if (Math.abs(x.c) > m + 1e-12) { m = Math.abs(x.c); k = x.k; } });
    return k;
  }

  // ---------------- 形狀比較 ----------------
  /** 目標形狀（以基頻係數為 1 正規化）：square、sawtooth（同正負號交替的係數）、sawUp（全部正號）、triangle */
  function targetCoef(kind, k) {
    switch (kind) {
      case 'square': return squareCoef(k) / squareCoef(1);
      case 'sawtooth': return sawCoef(k) / sawCoef(1);
      case 'sawPlus': return 1 / k;
      case 'triangle': return triangleCoef(k) / triangleCoef(1);
      default: return k === 1 ? 1 : 0;
    }
  }
  /**
   * 同相時的形狀誤差：把係數除以基頻係數 a_1，和目標逐項比較，傳回最大差（只比 k ≤ N）。
   * magnitude = true 時只比振幅（|a_k|），不管正負號。a_1 是 0 時傳回 Infinity。
   */
  function shapeError(a, N, kind, magnitude) {
    const a1 = a[0] || 0;
    if (Math.abs(a1) < EPS) return Infinity;
    let e = 0;
    for (let k = 1; k <= Math.min(N, KMAX); k++) {
      const v = (a[k - 1] || 0) / a1, t = targetCoef(kind, k);
      e = Math.max(e, magnitude ? Math.abs(Math.abs(v) - Math.abs(t)) : Math.abs(v - t));
    }
    return e;
  }
  /** 截斷到前 N 個泛音的方波（±1）在跳躍附近的過衝，占跳躍量（2）的比例；N → ∞ 時趨近 0.0895 */
  function gibbsSquare(N) {
    const comp = [];
    for (let k = 1; k <= N; k += 2) comp.push({ k: k, c: squareCoef(k), p: 0 });
    // 第一個極大值在 t = 1/(4M)，M = 奇次項的個數（導數 Σ cos 的第一個零點）
    const M = comp.length;
    const tp = 1 / (4 * M);
    return (waveAt(comp, tp) - 1) / 2;
  }
  /** 理想波形與 N 項部分和的最大差（在 n 個取樣點上） */
  function supError(kind, N, n) {
    n = n || 4000;
    const comp = [];
    for (let k = 1; k <= N; k++) {
      const c = kind === 'square' ? squareCoef(k) : kind === 'triangle' ? triangleCoef(k) : sawCoef(k);
      if (c) comp.push({ k: k, c: c, p: 0 });
    }
    let e = 0;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      e = Math.max(e, Math.abs(waveAt(comp, t) - idealWave(kind, t)));
    }
    return e;
  }

  // ---------------- 一次算出頁面要的量 ----------------
  /** 頁面與任務用的全部讀數 */
  function analyze(a, N, mode, seed, f0) {
    const comp = components(a, N, mode, seed);
    const sineComp = components(a, N, 'sine', seed);
    const ms = meanSquare(comp);
    const pk = peakInfo(comp);
    const r = Math.sqrt(ms);
    const oe = oddEven(comp);
    const g = harmonicGcd(comp);
    const eff = new Array(KMAX).fill(0);
    for (let k = 1; k <= Math.min(N, KMAX); k++) eff[k - 1] = Math.abs(a[k - 1] || 0) < EPS ? 0 : a[k - 1];
    const sinePeak = mode === 'random' ? peak(sineComp) : pk.peak;
    const top = comp.reduce(function (m, x) { return Math.max(m, x.k); }, 0);
    return {
      comp: comp, a: eff, active: comp.map(function (x) { return x.k; }),
      ms: ms, rms: r, peak: pk.peak, tPeak: pk.t, crest: r > 0 ? pk.peak / r : null,
      crestSine: r > 0 ? sinePeak / r : null,
      cr: centroidRatio(comp), centroid: comp.length ? centroidRatio(comp) * f0 : null,
      odd: oe.odd, even: oe.even, g: g, rep: g * f0, strongest: strongest(comp),
      top: top * f0, topK: top,
      // 同相時在 T/4 的值（方波平頂的正中央）
      quarter: waveAt(sineComp, 0.25)
    };
  }

  /**
   * 任務事件 'tone' 的資料（頁面與任務證明共用，確保兩邊一樣）。
   * s = { a（16 個係數）, f0, N, mode, seed, preset（最後按的預設音色）, edited（之後有沒有動過長條） }
   */
  function missionData(s) {
    const r = analyze(s.a, s.N, s.mode, s.seed, s.f0);
    const a = r.a, N = s.N;
    return {
      f0: s.f0, N: N, mode: s.mode, seed: s.seed, preset: s.preset, edited: !!s.edited,
      a: a, active: r.active, n: r.active.length, g: r.g, rep: r.rep, strongest: r.strongest,
      cr: r.cr, centroid: r.centroid, odd: r.odd, even: r.even, ms: r.ms, rms: r.rms, peak: r.peak, quarter: r.quarter,
      crest: r.crest, crestSine: r.crestSine, top: r.top, topK: r.topK,
      err: {
        square: shapeError(a, N, 'square'), squareMag: shapeError(a, N, 'square', true),
        sawtooth: shapeError(a, N, 'sawtooth'), sawPlus: shapeError(a, N, 'sawPlus'),
        triangle: shapeError(a, N, 'triangle'), triangleMag: shapeError(a, N, 'triangle', true)
      },
      // 同樣泛音數時「雙簧管」預設的頻譜重心（比較亮度用）
      crOboe: centroidRatio(components(preset('oboe', s.f0), N, 'sine', 1))
    };
  }

  /** 頻率 → 音名與音分偏差（十二平均律、A4 = 440 Hz） */
  function pitchInfo(f, MT) {
    const m = 69 + 12 * Math.log2(f / 440);
    const r = Math.round(m);
    return { midi: m, near: r, cents: 100 * (m - r), name: MT ? MT.noteName(r) : null };
  }

  return {
    KMAX: KMAX, F0_MIN: F0_MIN, F0_MAX: F0_MAX, POS_MAX: POS_MAX, EPS: EPS, DEFAULT: DEFAULT,
    f0FromPos: f0FromPos, posFromF0: posFromF0,
    squareCoef: squareCoef, sawCoef: sawCoef, triangleCoef: triangleCoef, idealWave: idealWave,
    PRESETS: PRESETS, PRESET_IDS: PRESET_IDS, preset: preset, violinBody: violinBody, formantGain: formantGain, FORMANTS: FORMANTS,
    rng: rng, randomPhases: randomPhases,
    components: components, waveAt: waveAt, sample: sample,
    meanSquare: meanSquare, meanSquareNumeric: meanSquareNumeric, rms: rms, peakInfo: peakInfo, peak: peak, crest: crest,
    centroidRatio: centroidRatio, oddEven: oddEven, gcd: gcd, harmonicGcd: harmonicGcd, strongest: strongest,
    targetCoef: targetCoef, shapeError: shapeError, gibbsSquare: gibbsSquare, supError: supError,
    analyze: analyze, missionData: missionData, pitchInfo: pitchInfo
  };
}));
