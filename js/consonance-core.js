/*
 * consonance-core.js — 「協和與不協和」的數學核心（不碰 DOM，瀏覽器與 Node 都能用）
 *
 * 模型：
 *   兩個純音之間的不協和度用 Plomp & Levelt (1965) 的曲線，參數化照 Sethares (2005)（MusicTheory.dissonancePair）。
 *   帶泛音的音：把兩個音的所有成分合在一起，每一對成分的不協和度加總（MusicTheory.dissonance），這就是 Sethares 的「不協和曲線」D(r)。
 *   音色（兩個音用同一種）：
 *     純音      ：只有基頻。
 *     泛音      ：第 k 個成分在 k·f，振幅 k^(−p)（p 是衰減指數）；可以只留奇次泛音（像單簧管的低音區）。
 *     拉伸泛音  ：第 k 個成分在 k^s·f（s 是拉伸係數，示意鐘聲一類非整數倍泛音的樂器），振幅一樣是 k^(−p)。
 *   臨界頻帶：Zwicker & Terhardt (1980)：CB = 25 + 75·(1 + 1.4·F^2)^0.69 Hz（F 以 kHz 計）。
 *   三音和弦：三個音的所有成分兩兩加總，D3(r1, r2)。
 *
 * 內容：partials／spectrum（音色）、dyad（兩個音的 D）、curve（D 對音分的曲線）、valleys（曲線的谷底：局部最小值）、
 *   pairs（兩個音之間每一對泛音的不協和度與拍頻）、pureMax（純音最刺耳的頻率差）、criticalBand、
 *   nearestInterval／nearestSimple（最接近的音程、最簡整數比）、chord／chordGrid／basin（三音和弦的曲面與盆地）、
 *   analyze（頁面與任務共用的分析結果）。
 *
 * 用法：瀏覽器 window.ConsonanceCore；Node require('./consonance-core.js')（會自動載入 music-theory.js）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./music-theory.js'));
  else root.ConsonanceCore = factory(root.MusicTheory);
}(typeof self !== 'undefined' ? self : this, function (MT) {
  'use strict';

  const cents = function (r) { return 1200 * Math.log2(r); };
  const fromCents = function (c) { return Math.pow(2, c / 1200); };
  const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  // ---------- 範圍（和介面一致） ----------
  const R_MAX = 2.3;                       // 頻率比 r 的上限
  const C_MAX = cents(R_MAX);              // 1441.97 音分
  const F1_MIN = 110, F1_MAX = 880;        // 下方音（A2 到 A5）
  const F1_DEFAULT = MT.midiToFreq(60);    // C4 = 261.6256 Hz（A4 = 440 Hz，ISO 16）
  const N_MAX = 10;                        // 泛音數上限
  const P_MIN = 0, P_MAX = 2;              // 衰減指數
  const S_MIN = 0.8, S_MAX = 1.2;          // 拉伸係數
  const CHORD_MAX = 1200;                  // 三音和弦曲面：兩個比值都是 1 到 2
  const STEP = 1;                          // 曲線取樣間隔（音分）
  const MODES = ['pure', 'harmonic', 'stretched'];

  /** 把音色參數整理到合法範圍 */
  function normTimbre(t) {
    t = t || {};
    return {
      mode: MODES.indexOf(t.mode) >= 0 ? t.mode : 'harmonic',
      n: clamp(Math.round(t.n == null ? 6 : t.n), 1, N_MAX),
      p: clamp(t.p == null ? 1 : +t.p, P_MIN, P_MAX),
      s: clamp(t.s == null ? 1.1 : +t.s, S_MIN, S_MAX),
      odd: !!t.odd
    };
  }
  /** 音色的成分：k（第幾泛音）、rho（相對基頻的倍數）、a（振幅） */
  function partials(t) {
    t = normTimbre(t);
    if (t.mode === 'pure') return [{ k: 1, rho: 1, a: 1 }];
    const out = [];
    for (let k = 1; out.length < t.n; k++) {
      if (t.odd && k % 2 === 0) continue;
      out.push({ k: k, rho: t.mode === 'stretched' ? Math.pow(k, t.s) : k, a: Math.pow(k, -t.p) });
    }
    return out;
  }
  /** 基頻 f0 的頻譜 [{k, f, a}] */
  function spectrum(f0, P) { return P.map(function (x) { return { k: x.k, f: f0 * x.rho, a: x.a }; }); }
  /** 兩群成分之間（不含各自內部）的不協和度總和 */
  function cross(A, B) {
    let d = 0;
    for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) d += MT.dissonancePair(A[i].f, A[i].a, B[j].f, B[j].a);
    return d;
  }
  /** 兩個音（下方音 f1、上方音 r·f1）合在一起的不協和度 D（Sethares 的不協和曲線上的一點） */
  function dyad(f1, r, t) {
    const P = partials(t);
    return MT.dissonance(spectrum(f1, P).concat(spectrum(f1 * r, P)));
  }

  /**
   * 不協和曲線：音分 0 到 C_MAX（每 step 音分一點）的 D。
   * 拆成「下方音內部 + 上方音內部 + 兩者之間」計算（和 dyad 完全相等，只是快一點）。
   */
  function curve(f1, t, step) {
    t = normTimbre(t);
    step = step || STEP;
    const P = partials(t), A = spectrum(f1, P), I1 = MT.dissonance(A);
    const N = Math.floor(C_MAX / step + 1e-9);
    const c = new Float64Array(N + 1), d = new Float64Array(N + 1);
    let max = -Infinity, min = Infinity, imax = 0;
    for (let i = 0; i <= N; i++) {
      c[i] = i * step;
      const B = spectrum(f1 * fromCents(c[i]), P);
      d[i] = I1 + MT.dissonance(B) + cross(A, B);
      if (d[i] > max) { max = d[i]; imax = i; }
      if (d[i] < min) min = d[i];
    }
    return { f1: f1, t: t, step: step, c: c, d: d, max: max, min: min, cmax: c[imax] };
  }

  /** 最簡整數比：分母不超過 qmax、和 r 最接近（以音分計）的 p/q；err = r 比 p/q 高幾音分 */
  function nearestSimple(r, qmax) {
    qmax = qmax || 10;
    let best = null;
    for (let q = 1; q <= qmax; q++) {
      const p = Math.round(r * q);
      if (p < 1) continue;
      const err = cents(r) - cents(p / q);
      if (!best || Math.abs(err) < Math.abs(best.err) - 1e-9) { const g = MT.gcd(p, q) || 1; best = { p: p / g, q: q / g, err: err }; }
    }
    return best;
  }

  /** 一段區間內的最小值（黃金分割搜尋；對尖角形的谷底也收斂） */
  function goldenMin(f, a, b, iters) {
    const g = (Math.sqrt(5) - 1) / 2;
    let x1 = b - g * (b - a), x2 = a + g * (b - a), f1 = f(x1), f2 = f(x2);
    for (let i = 0; i < (iters || 32); i++) {
      if (f1 <= f2) { b = x2; x2 = x1; f2 = f1; x1 = b - g * (b - a); f1 = f(x1); }
      else { a = x1; x1 = x2; f1 = f2; x2 = a + g * (b - a); f2 = f(x2); }
    }
    return (a + b) / 2;
  }

  /**
   * 曲線的谷底（局部最小值，不含 r = 1 與右端點）：先在取樣點上找，再用黃金分割精修位置。
   * 每個谷底附上：音分、比值、D、顯著程度 prom（左右兩邊山頭較低的那個比谷底高多少）、最簡整數比（分母 ≤ 16）。
   */
  function valleys(cv) {
    const c = cv.c, d = cv.d, n = c.length, eps = 1e-12 * Math.max(1, cv.max);
    const idx = [];
    for (let i = 1; i < n - 1; i++) if (d[i] < d[i - 1] - eps && d[i] <= d[i + 1] - eps) idx.push(i);
    const f = function (x) { return dyad(cv.f1, fromCents(x), cv.t); };
    const out = idx.map(function (i, k) {
      const cm = goldenMin(f, c[i - 1], c[i + 1], 32);
      // 顯著程度：到前一個、後一個谷底之間的最高點
      const i0 = k > 0 ? idx[k - 1] : 0, i1 = k < idx.length - 1 ? idx[k + 1] : n - 1;
      let pl = -Infinity, pr = -Infinity;
      for (let j = i0; j <= i; j++) pl = Math.max(pl, d[j]);
      for (let j = i; j <= i1; j++) pr = Math.max(pr, d[j]);
      const dm = f(cm), r = fromCents(cm), sim = nearestSimple(r, 16);
      return { cents: cm, r: r, d: dm, prom: Math.max(0, Math.min(pl, pr) - dm), simple: sim, named: Math.abs(sim.err) <= 3 };
    });
    return out;
  }

  /** 兩個音之間每一對泛音（下方音第 i 個 × 上方音第 j 個）的不協和度與拍頻，由大到小排 */
  function pairs(f1, r, t) {
    const P = partials(t), A = spectrum(f1, P), B = spectrum(f1 * r, P), out = [];
    A.forEach(function (a) {
      B.forEach(function (b) {
        out.push({ i: a.k, j: b.k, fa: a.f, fb: b.f, aa: a.a, ab: b.a, d: MT.dissonancePair(a.f, a.a, b.f, b.a), beat: Math.abs(a.f - b.f) });
      });
    });
    out.sort(function (x, y) { return y.d - x.d; });
    return out;
  }

  /** 臨界頻帶寬（Hz）：Zwicker & Terhardt (1980) */
  function criticalBand(f) { const F = f / 1000; return 25 + 75 * Math.pow(1 + 1.4 * F * F, 0.69); }

  /** 純音最刺耳的頻率差 Δf*（Hz）、對應的比值與 D（振幅 1 的兩個純音） */
  function pureMax(f1) {
    const df = MT.maxDissonanceGap(f1);
    return { df: df, r: 1 + df / f1, d: MT.dissonancePair(f1, 1, f1 + df, 1) };
  }

  /** 同度到大九度的名稱（大於八度的兩個：小九度 32/15、大九度 9/4） */
  const NAMES = MT.INTERVALS.concat([
    { semis: 13, ratio: [32, 15], zh: '小九度', en: 'Minor ninth', short: 'm9' },
    { semis: 14, ratio: [9, 4], zh: '大九度', en: 'Major ninth', short: 'M9' }
  ]);
  /** 七限與其他常見比值的名稱（谷底的標籤用） */
  const EXTRA = {
    '7/4': ['自然七度', 'harmonic seventh'], '7/6': ['七限小三度', 'septimal minor third'], '9/7': ['七限大三度', 'septimal major third'],
    '7/5': ['七限三全音', 'septimal tritone'], '10/7': ['七限三全音', 'septimal tritone'], '8/7': ['七限全音', 'septimal whole tone'],
    '10/9': ['小全音', 'minor whole tone'], '9/8': ['大全音', 'major whole tone'], '12/7': ['七限大六度', 'septimal major sixth'],
    '9/4': ['大九度', 'major ninth'], '11/8': ['十一限四度', 'undecimal fourth']
  };
  /** 最接近的平均律音程（半音數 0–14）以及和平均律、純律差幾音分 */
  function nearestInterval(c) {
    const semis = clamp(Math.round(c / 100), 0, NAMES.length - 1);
    const iv = NAMES[semis];
    return { semis: semis, zh: iv.zh, en: iv.en, short: iv.short, etDev: c - 100 * semis, p: iv.ratio[0], q: iv.ratio[1], justDev: c - cents(iv.ratio[0] / iv.ratio[1]) };
  }
  /** 比值 p/q 的名稱（純律音程表或七限的名稱；沒有就傳回 null） */
  function ratioName(p, q) {
    for (let i = 0; i < NAMES.length; i++) if (NAMES[i].ratio[0] === p && NAMES[i].ratio[1] === q) return { zh: NAMES[i].zh, en: NAMES[i].en };
    const e = EXTRA[p + '/' + q];
    return e ? { zh: e[0], en: e[1] } : null;
  }

  // ---------- 三音和弦 ----------
  /** 三個音（f1、r1·f1、r2·f1）的總不協和度 D3 */
  function chord(f1, r1, r2, t) {
    const P = partials(t);
    return MT.dissonance(spectrum(f1, P).concat(spectrum(f1 * r1, P), spectrum(f1 * r2, P)));
  }
  /**
   * 三音和弦曲面：r1、r2 都從 0 到 cmax 音分（各 N+1 點）。
   * D3 = 下方音內部 + g(r1) + g(r2) + 兩個上方音之間，g(r) = 上方音內部 + 它和下方音之間；和 chord 完全相等。
   * 傳回 { N, cmax, z（第 i 列第 j 行 = z[i·(N+1)+j]，i 是 r1、j 是 r2）, max, min }
   */
  function chordGrid(f1, t, N, cmax) {
    t = normTimbre(t);
    cmax = cmax || CHORD_MAX;
    const P = partials(t), A = spectrum(f1, P), I1 = MT.dissonance(A);
    const S = [], g = new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) { S.push(spectrum(f1 * fromCents(i * cmax / N), P)); g[i] = MT.dissonance(S[i]) + cross(A, S[i]); }
    const z = new Float64Array((N + 1) * (N + 1));
    let max = -Infinity, min = Infinity;
    for (let i = 0; i <= N; i++) {
      for (let j = i; j <= N; j++) {
        const v = I1 + g[i] + g[j] + cross(S[i], S[j]);
        z[i * (N + 1) + j] = v; z[j * (N + 1) + i] = v;
        if (v > max) max = v;
        if (v < min) min = v;
      }
    }
    return { N: N, cmax: cmax, z: z, max: max, min: min };
  }
  /**
   * 從 (c1, c2)（音分）出發，每次往 8 個方向中 D3 最小的那一格走 step 音分，直到四周都比較高（盆地底）或走了 maxSteps 步。
   * 傳回 { c1, c2, d, converged, steps }
   */
  function basin(f1, c1, c2, t, step, maxSteps) {
    step = step || 1; maxSteps = maxSteps || 24;
    const tt = normTimbre(t), P = partials(tt), A = spectrum(f1, P), I1 = MT.dissonance(A);
    const memo = {};
    const g = function (c) {
      const k = c.toFixed(4);
      if (!memo[k]) { const S = spectrum(f1 * fromCents(c), P); memo[k] = { S: S, g: MT.dissonance(S) + cross(A, S) }; }
      return memo[k];
    };
    const D = function (x, y) { const a = g(x), b = g(y); return I1 + a.g + b.g + cross(a.S, b.S); };
    let x = c1, y = c2, d = D(x, y), k = 0, moved = true;
    while (moved && k < maxSteps) {
      moved = false;
      let bx = x, by = y, bd = d;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const nx = x + dx * step, ny = y + dy * step;
        if (nx < 0 || ny < 0 || nx > C_MAX || ny > C_MAX) continue;
        const v = D(nx, ny);
        if (v < bd - 1e-12) { bd = v; bx = nx; by = ny; }
      }
      if (bd < d - 1e-12) { x = bx; y = by; d = bd; moved = true; k++; }
    }
    return { c1: x, c2: y, d: d, converged: !moved, steps: k };
  }

  /** 拍：兩個振幅 a1、a2、頻率差 beat 的成分相加，t 秒時的響度包絡 */
  function envelope(a1, a2, beat, t) { return Math.sqrt(Math.max(0, a1 * a1 + a2 * a2 + 2 * a1 * a2 * Math.cos(2 * Math.PI * beat * t))); }
  /** 兩個音在時間 t（秒）的訊號（各自的成分正弦相加；起始相位都是 0） */
  function signal(A, B, t) {
    let y1 = 0, y2 = 0;
    for (let i = 0; i < A.length; i++) y1 += A[i].a * Math.sin(2 * Math.PI * A[i].f * t);
    for (let i = 0; i < B.length; i++) y2 += B[i].a * Math.sin(2 * Math.PI * B[i].f * t);
    return [y1, y2];
  }

  /** 音色設定的代號（任務比較「同樣設定下」的兩個量時使用） */
  function timbreKey(t) {
    t = normTimbre(t);
    if (t.mode === 'pure') return 'pure';
    return t.mode + '|' + t.n + '|' + t.p.toFixed(2) + '|' + (t.odd ? 1 : 0) + (t.mode === 'stretched' ? '|' + t.s.toFixed(3) : '');
  }

  /**
   * 頁面與任務共用的分析結果。o = { f1, r, timbre, curve?, valleys? }（curve、valleys 可傳入已算好的，省時間）
   */
  function analyze(o) {
    const t = normTimbre(o.timbre), f1 = o.f1, r = o.r;
    const cv = o.curve || curve(f1, t), vs = o.valleys || valleys(cv);
    const c = cents(r), f2 = f1 * r, df = f2 - f1, fc = (f1 + f2) / 2, cb = criticalBand(fc);
    const D = dyad(f1, r, t), pm = pureMax(f1);
    const prs = pairs(f1, r, t), top = prs.length && prs[0].d > 1e-4 ? prs[0] : null;
    let near = null;
    vs.forEach(function (v) { if (!near || Math.abs(v.cents - c) < Math.abs(near.cents - c)) near = v; });
    const iv = nearestInterval(c), tk = timbreKey(t);
    return {
      mode: t.mode, n: t.n, p: t.p, s: t.s, odd: t.odd, f1: f1, r: r, cents: c, f2: f2, df: df, fc: fc, cb: cb, cbRatio: df / cb,
      D: D, Dmax: cv.max, Dpeak: pm.d, dfPeak: pm.df, rPeak: pm.r,
      valleys: vs.map(function (v) { return Math.round(v.cents * 1000) / 1000; }),
      count12: vs.filter(function (v) { return v.cents <= 1200 + 1e-6; }).length,
      valley: near ? { cents: near.cents, r: near.r, d: near.d, p: near.simple.p, q: near.simple.q, err: near.simple.err, named: near.named } : null,
      atValley: !!(near && Math.abs(near.cents - c) <= 3),
      beat: top ? top.beat : null, pair: top ? [top.i, top.j] : null,
      iv: { semis: iv.semis, etDev: iv.etDev, p: iv.p, q: iv.q, justDev: iv.justDev },
      tkey: tk, key: tk + '@' + f1.toFixed(2)
    };
  }
  /** 三音和弦的分析結果（任務用）：o = { f1, r1, r2, timbre } */
  function analyzeChord(o) {
    const t = normTimbre(o.timbre), c1 = cents(o.r1), c2 = cents(o.r2);
    const b = basin(o.f1, c1, c2, t, 1, 24);
    const tk = timbreKey(t);
    return {
      mode: t.mode, n: t.n, p: t.p, s: t.s, odd: t.odd, f1: o.f1, r1: o.r1, r2: o.r2, c1: c1, c2: c2,
      D3: chord(o.f1, o.r1, o.r2, t),
      atBasin: b.converged && Math.abs(b.c1 - c1) <= 5 && Math.abs(b.c2 - c2) <= 5,
      basin: { c1: b.c1, c2: b.c2, d: b.d, converged: b.converged },
      tkey: tk, key: tk + '@' + o.f1.toFixed(2)
    };
  }

  return {
    R_MAX: R_MAX, C_MAX: C_MAX, F1_MIN: F1_MIN, F1_MAX: F1_MAX, F1_DEFAULT: F1_DEFAULT, N_MAX: N_MAX,
    P_MIN: P_MIN, P_MAX: P_MAX, S_MIN: S_MIN, S_MAX: S_MAX, CHORD_MAX: CHORD_MAX, STEP: STEP, MODES: MODES, NAMES: NAMES,
    cents: cents, fromCents: fromCents, normTimbre: normTimbre, partials: partials, spectrum: spectrum, cross: cross,
    dyad: dyad, curve: curve, valleys: valleys, pairs: pairs, criticalBand: criticalBand, pureMax: pureMax,
    nearestInterval: nearestInterval, nearestSimple: nearestSimple, ratioName: ratioName,
    chord: chord, chordGrid: chordGrid, basin: basin, envelope: envelope, signal: signal,
    timbreKey: timbreKey, analyze: analyze, analyzeChord: analyzeChord
  };
}));
