/*
 * music-theory.js — 音樂科共用的音樂數學（不碰 DOM，瀏覽器與 Node 都能用）
 *
 * 內容：
 *   音名與頻率：midiToFreq、freqToMidi、noteName、A4（ISO 16：440 Hz）
 *   音程：cents（音分）、fromCents、INTERVALS（度數、半音數、純律比值、中英名稱）
 *   音律：TEMPERAMENTS（五度相生、純律、十二平均律）各音相對 C 的比值、tuningRatio
 *   整數與比值：gcd、lcm、simplify、approxRatio（連分數求最簡分數近似）
 *   不協和度：dissonancePair、dissonance（Plomp & Levelt 1965 的曲線，Sethares 2005 的參數化）
 *   泛音：harmonicSpectrum（基頻 × 整數倍的頻率與振幅）
 *
 * 用法：瀏覽器 window.MusicTheory；Node require('./music-theory.js')。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MusicTheory = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 標準音高 A4 = 440 Hz（ISO 16:1975），MIDI 音符編號 69 */
  const A4 = 440;
  const A4_MIDI = 69;

  /** MIDI 音符編號 → 十二平均律頻率（Hz） */
  function midiToFreq(m, a4) { return (a4 || A4) * Math.pow(2, (m - A4_MIDI) / 12); }
  /** 頻率 → MIDI 音符編號（可以是小數） */
  function freqToMidi(f, a4) { return A4_MIDI + 12 * Math.log2(f / (a4 || A4)); }

  // 升記號與降記號兩種寫法（♯ ♭ 是一般符號，不是上下標字元）
  const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  /** 唱名（首調以 C 為 Do 時）：中文介面常用 */
  const SOLFEGE = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];

  function mod(a, n) { return ((a % n) + n) % n; }

  /** MIDI 編號 → 音名，例如 69 → 'A4'；opt.flat 用降記號；opt.octave=false 不加八度數字 */
  function noteName(m, opt) {
    opt = opt || {};
    const r = Math.round(m);
    const pc = mod(r, 12);
    const name = (opt.flat ? FLAT_NAMES : SHARP_NAMES)[pc];
    return opt.octave === false ? name : name + (Math.floor(r / 12) - 1);
  }
  /** 音名 → MIDI 編號，例如 'A4' → 69、'C♯5'、'Db3'、'Bb2' 都可以 */
  function parseNote(s) {
    const m = /^([A-Ga-g])([#♯b♭]?)(-?\d+)$/.exec(String(s).trim());
    if (!m) return null;
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()];
    const acc = m[2] === '#' || m[2] === '♯' ? 1 : (m[2] === 'b' || m[2] === '♭' ? -1 : 0);
    return (parseInt(m[3], 10) + 1) * 12 + base + acc;
  }

  /** 頻率比 → 音分（1 個半音 = 100 音分，1 個八度 = 1200 音分） */
  function cents(ratio) { return 1200 * Math.log2(ratio); }
  /** 音分 → 頻率比 */
  function fromCents(c) { return Math.pow(2, c / 1200); }

  /** 最大公因數、最小公倍數（正整數） */
  function gcd(a, b) { a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b)); while (b) { const t = a % b; a = b; b = t; } return a; }
  function lcm(a, b) { return a && b ? Math.abs(Math.round(a) * Math.round(b)) / gcd(a, b) : 0; }
  function gcdList(arr) { return arr.reduce(function (g, x) { return gcd(g, x); }, 0); }
  function lcmList(arr) { return arr.reduce(function (l, x) { return lcm(l, x); }, 1); }
  /** 約分：[p, q] → 最簡分數 */
  function simplify(p, q) { const g = gcd(p, q) || 1; return [Math.round(p) / g, Math.round(q) / g]; }

  /** 連分數求最簡分數近似：分母不超過 maxDen 的最佳近似 [p, q]（x > 0） */
  function approxRatio(x, maxDen) {
    maxDen = maxDen || 64;
    let h0 = 0, h1 = 1, k0 = 1, k1 = 0, v = x;
    let best = [Math.round(x), 1];
    for (let i = 0; i < 40; i++) {
      const a = Math.floor(v);
      const h2 = a * h1 + h0, k2 = a * k1 + k0;
      if (k2 > maxDen) break;
      best = [h2, k2];
      h0 = h1; h1 = h2; k0 = k1; k1 = k2;
      const frac = v - a;
      if (frac < 1e-12) break;
      v = 1 / frac;
    }
    return best;
  }

  /**
   * 十三個基本音程（同度到八度）：半音數、純律的頻率比、度數名稱（中英）。
   * 三全音（增四度）的純律比用 45/32。
   */
  const INTERVALS = [
    { semis: 0, ratio: [1, 1], zh: '完全一度（同度）', en: 'Unison', short: 'P1' },
    { semis: 1, ratio: [16, 15], zh: '小二度', en: 'Minor second', short: 'm2' },
    { semis: 2, ratio: [9, 8], zh: '大二度', en: 'Major second', short: 'M2' },
    { semis: 3, ratio: [6, 5], zh: '小三度', en: 'Minor third', short: 'm3' },
    { semis: 4, ratio: [5, 4], zh: '大三度', en: 'Major third', short: 'M3' },
    { semis: 5, ratio: [4, 3], zh: '完全四度', en: 'Perfect fourth', short: 'P4' },
    { semis: 6, ratio: [45, 32], zh: '增四度（三全音）', en: 'Tritone', short: 'TT' },
    { semis: 7, ratio: [3, 2], zh: '完全五度', en: 'Perfect fifth', short: 'P5' },
    { semis: 8, ratio: [8, 5], zh: '小六度', en: 'Minor sixth', short: 'm6' },
    { semis: 9, ratio: [5, 3], zh: '大六度', en: 'Major sixth', short: 'M6' },
    { semis: 10, ratio: [9, 5], zh: '小七度', en: 'Minor seventh', short: 'm7' },
    { semis: 11, ratio: [15, 8], zh: '大七度', en: 'Major seventh', short: 'M7' },
    { semis: 12, ratio: [2, 1], zh: '完全八度', en: 'Octave', short: 'P8' }
  ];

  /**
   * 三種音律在一個八度內 12 個音（C 到 B）相對 C 的頻率比。
   * 五度相生（畢達哥拉斯）：從 C 往上疊 6 個五度（G D A E B F♯）、往下疊 5 個五度（F B♭ E♭ A♭ D♭），
   *   每次乘或除 3/2，再乘或除 2 拉回同一個八度。缺的那一個五度（F♯–D♭）就是「狼五度」。
   * 純律（五限純律）：用 2、3、5 的整數比，主三和弦 C–E–G、F–A–C、G–B–D 都是 4:5:6。
   * 十二平均律：每個半音都是 2^(1/12)。
   */
  function pythagoreanRatio(pc) {
    // 每個音在五度圈上的位置（往上幾個五度，負的是往下）
    const steps = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 5: -1, 10: -2, 3: -3, 8: -4, 1: -5 }[pc];
    let r = Math.pow(1.5, steps);
    while (r >= 2) r /= 2;
    while (r < 1) r *= 2;
    return r;
  }
  const JUST_RATIOS = [[1, 1], [16, 15], [9, 8], [6, 5], [5, 4], [4, 3], [45, 32], [3, 2], [8, 5], [5, 3], [9, 5], [15, 8]];
  const TEMPERAMENTS = {
    pythagorean: { zh: '五度相生律（畢達哥拉斯）', en: 'Pythagorean tuning', ratio: function (pc) { return pythagoreanRatio(pc); } },
    just: { zh: '純律', en: 'Just intonation', ratio: function (pc) { return JUST_RATIOS[pc][0] / JUST_RATIOS[pc][1]; } },
    equal: { zh: '十二平均律', en: '12-tone equal temperament', ratio: function (pc) { return Math.pow(2, pc / 12); } }
  };
  /** 某音律中，從 tonic 起算 semis 個半音的音，相對 tonic 的頻率比（可超過一個八度） */
  function tuningRatio(kind, semis) {
    const t = TEMPERAMENTS[kind] || TEMPERAMENTS.equal;
    const oct = Math.floor(semis / 12);
    return t.ratio(mod(semis, 12)) * Math.pow(2, oct);
  }

  /** 畢氏音差：12 個純五度比 7 個八度高出的比值 3^12 / 2^19，約 23.46 音分 */
  const PYTHAGOREAN_COMMA = Math.pow(3, 12) / Math.pow(2, 19);
  /** 同音差（西頓音差）：4 個純五度得到的大三度比純律大三度高 81/80，約 21.51 音分 */
  const SYNTONIC_COMMA = 81 / 80;

  /**
   * 兩個純音之間的不協和度（Plomp & Levelt 1965 曲線；Sethares 2005《Tuning, Timbre, Spectrum, Scale》的參數化）。
   * d = min(a1, a2) · [ C1·e^(−b1·s·Δf) + C2·e^(−b2·s·Δf) ]，s = d* / (s1·f_min + s2)
   * 最大不協和出現在 Δf ≈ 0.22 / s，約是臨界頻帶的四分之一；Δf = 0 時為 0。
   */
  const SETHARES = { dstar: 0.24, s1: 0.0207, s2: 18.96, b1: 3.51, b2: 5.75, c1: 5, c2: -5 };
  function dissonancePair(f1, a1, f2, a2) {
    const P = SETHARES;
    const fmin = Math.min(f1, f2);
    const df = Math.abs(f2 - f1);
    const s = P.dstar / (P.s1 * fmin + P.s2);
    return Math.min(a1, a2) * (P.c1 * Math.exp(-P.b1 * s * df) + P.c2 * Math.exp(-P.b2 * s * df));
  }
  /** 一群頻率成分（[{f, a}]）彼此兩兩的不協和度總和 */
  function dissonance(partials) {
    let d = 0;
    for (let i = 0; i < partials.length; i++) {
      for (let j = i + 1; j < partials.length; j++) {
        d += dissonancePair(partials[i].f, partials[i].a, partials[j].f, partials[j].a);
      }
    }
    return d;
  }
  /** 純音不協和度最大時的頻率差（Hz）：Δf* = ln(b2/b1) / ((b2 − b1)·s) */
  function maxDissonanceGap(fmin) {
    const P = SETHARES;
    const s = P.dstar / (P.s1 * fmin + P.s2);
    return Math.log(P.b2 / P.b1) / ((P.b2 - P.b1) * s);
  }

  /**
   * 泛音列：基頻 f0 的前 n 個泛音（第 k 個頻率 k·f0），振幅照 rolloff（第 k 個為 1/k^rolloff）。
   * opt.odd = true 只留奇次泛音（像單簧管的低音區）。
   */
  function harmonicSpectrum(f0, n, opt) {
    opt = opt || {};
    const roll = opt.rolloff == null ? 1 : opt.rolloff;
    const out = [];
    for (let k = 1; k <= n; k++) {
      if (opt.odd && k % 2 === 0) continue;
      out.push({ k: k, f: k * f0, a: 1 / Math.pow(k, roll) });
    }
    return out;
  }

  return {
    A4: A4, A4_MIDI: A4_MIDI,
    midiToFreq: midiToFreq, freqToMidi: freqToMidi,
    SHARP_NAMES: SHARP_NAMES, FLAT_NAMES: FLAT_NAMES, SOLFEGE: SOLFEGE,
    noteName: noteName, parseNote: parseNote, mod: mod,
    cents: cents, fromCents: fromCents,
    gcd: gcd, lcm: lcm, gcdList: gcdList, lcmList: lcmList, simplify: simplify, approxRatio: approxRatio,
    INTERVALS: INTERVALS, TEMPERAMENTS: TEMPERAMENTS, JUST_RATIOS: JUST_RATIOS,
    pythagoreanRatio: pythagoreanRatio, tuningRatio: tuningRatio,
    PYTHAGOREAN_COMMA: PYTHAGOREAN_COMMA, SYNTONIC_COMMA: SYNTONIC_COMMA,
    SETHARES: SETHARES, dissonancePair: dissonancePair, dissonance: dissonance, maxDissonanceGap: maxDissonanceGap,
    harmonicSpectrum: harmonicSpectrum
  };
}));
