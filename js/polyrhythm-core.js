/*
 * polyrhythm-core.js — 「多重節奏與歐幾里得節奏」的數學核心（不碰 DOM，瀏覽器與 Node 都能用）
 *
 * 節奏的表示：長度 n 的 0／1 陣列（1 = 重音、0 = 不敲），畫成一圈 n 格的「項鍊」。
 *
 * 歐幾里得節奏 E(k, n)：把 k 個重音盡量平均地分到 n 格，用 Bjorklund (2003) 的演算法產生，
 *   寫法與起點照 Toussaint (2005)〈The Euclidean Algorithm Generates Traditional Musical Rhythms〉：
 *   先排 k 個 [1] 和 n − k 個 [0]，把較少的那一組逐一接到前面各組的後面，剩下的那一組成為新的「餘數」，
 *   一直做到餘數只剩 0 或 1 組（至少做一次）。這和歐幾里得求最大公因數的輾轉相除步驟相同。
 *   例：E(3,8) = x..x..x.（古巴 tresillo）、E(5,8) = x.xx.xx.（cinquillo）、E(5,6) = x.xxxx、E(7,12) = x.xx.x.xx.x.。
 * 旋轉：rotate(p, r)[i] = p[(i + r) mod n]，也就是「從原本的第 r 格開始」。例：bossa nova = E(5,16) 從第 6 格（第 3 個重音）開始。
 *
 * 均勻度：
 *   重音間距（IOI，inter-onset interval）：相鄰兩個重音相隔幾格（繞一圈），從第一個重音算起。
 *   最大均勻（maximally even，Clough & Douthett 1991）：對每個 j，「相隔 j 個重音」的距離最多只有兩種、而且只差 1 格。
 *     最大均勻的節奏恰好就是 E(k, n) 的某個旋轉（測試裡用窮舉檢查到 n = 16）。
 *   弦長和（Toussaint 一系列論文用的均勻度指標）：把重音放在單位圓上，所有重音兩兩之間的弦長加起來，
 *     弦長 = 2 sin(π d / n)（d 是兩格的距離）。k、n 固定時，E(k, n) 的弦長和最大；均勻度 = 弦長和 ÷ E(k, n) 的弦長和。
 *
 * 多個聲部合起來（analyze）：
 *   對齊方式 'cycle'（同一個循環，多重節奏 polyrhythm）：每個聲部用自己的 n 格把同一個循環平分；
 *     聲部 1 的一格 = 60 / BPM 秒，所以一個循環 = n1 × 60 / BPM 秒。合起來的細格：L = lcm(各聲部的 n) 格一個循環，
 *     聲部 i 的一格 = L / n_i 個細格。
 *   對齊方式 'step'（同樣的格長，多重節拍 polymeter）：每一格都是 60 / BPM 秒，聲部 i 每 n_i 格繞一圈；
 *     全部一起回到起點要 L = lcm(各聲部的 n) 格。
 *   兩種方式的「合成節奏」都在 L 個細格上，週期 L 格。另外算出「實際的最小週期」（節奏型本身有對稱時會比 L 短）、
 *   全部聲部一起落拍的格子、兩兩一起落拍的次數、環面結的纏繞數（給 3D 用）。
 *
 * 用法：瀏覽器 window.PolyrhythmCore；Node require('./polyrhythm-core.js')（會自動載入 music-theory.js 的 gcd、lcm）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./music-theory.js'));
  else root.PolyrhythmCore = factory(root.MusicTheory);
}(typeof self !== 'undefined' ? self : this, function (MT) {
  'use strict';

  const N_MIN = 2, N_MAX = 16;
  const BPM_MIN = 40, BPM_MAX = 200, BPM_DEFAULT = 180;
  const VOICES = 3;
  const MODES = ['cycle', 'step'];
  const TIMBRES = ['bell', 'low', 'high', 'clap'];
  const gcd = MT.gcd, lcm = MT.lcm;
  const mod = function (a, n) { return ((a % n) + n) % n; };
  const clampInt = function (v, a, b) { v = Math.round(+v); return isFinite(v) ? Math.max(a, Math.min(b, v)) : a; };

  /** Bjorklund 演算法（Toussaint 2005 的寫法）：k 個重音、n 格 → 0／1 陣列 */
  function bjorklund(k, n) {
    n = clampInt(n, 1, 1024); k = clampInt(k, 0, n);
    if (k === 0) return new Array(n).fill(0);
    if (k === n) return new Array(n).fill(1);
    let a = []; for (let i = 0; i < k; i++) a.push([1]);
    let b = []; for (let i = 0; i < n - k; i++) b.push([0]);
    do {
      const m = Math.min(a.length, b.length);
      const na = [];
      for (let i = 0; i < m; i++) na.push(a[i].concat(b[i]));
      const rem = a.length > m ? a.slice(m) : b.slice(m);
      a = na; b = rem;
    } while (b.length > 1);
    return [].concat.apply([], a.concat(b));
  }
  /** 輾轉相除的步驟（給說明用）：[[被除數, 除數, 商, 餘數], …]；E(k, n) 對應 EUCLID(n − k, k) */
  function euclidSteps(a, b) {
    const out = [];
    a = Math.round(a); b = Math.round(b);
    while (b > 0) { out.push([a, b, Math.floor(a / b), a % b]); const t = a % b; a = b; b = t; }
    return out;
  }
  /** 旋轉：從原本的第 r 格開始 */
  function rotate(p, r) {
    const n = p.length, out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = p[mod(i + r, n)];
    return out;
  }
  function euclid(k, n, r) { return rotate(bjorklund(k, n), r || 0); }
  function toStr(p) { return p.map(function (x) { return x ? 'x' : '.'; }).join(''); }
  function fromStr(s) { return String(s).split('').filter(function (c) { return c === 'x' || c === '.'; }).map(function (c) { return c === 'x' ? 1 : 0; }); }
  function count(p) { let c = 0; for (let i = 0; i < p.length; i++) if (p[i]) c++; return c; }
  function onsets(p) { const o = []; for (let i = 0; i < p.length; i++) if (p[i]) o.push(i); return o; }
  /** 重音間距（繞一圈），從第一個重音算起；只有一個重音時是 [n]，沒有重音時是 [] */
  function iois(p) {
    const o = onsets(p), n = p.length;
    if (!o.length) return [];
    return o.map(function (x, i) { return i + 1 < o.length ? o[i + 1] - x : o[0] + n - x; });
  }
  /** 最小週期：節奏每幾格重複一次（一定整除 n） */
  function minimalPeriod(p) {
    const n = p.length;
    for (let d = 1; d <= n; d++) {
      if (n % d) continue;
      let ok = true;
      for (let i = 0; i < n && ok; i++) if (p[i] !== p[(i + d) % n]) ok = false;
      if (ok) return d;
    }
    return n;
  }
  /** p 是不是 q 的旋轉：傳回最小的 s（rotate(q, s) = p），不是就傳回 −1 */
  function rotationOf(p, q) {
    const n = p.length;
    if (q.length !== n) return -1;
    for (let s = 0; s < n; s++) {
      let ok = true;
      for (let i = 0; i < n && ok; i++) if (p[i] !== q[(i + s) % n]) ok = false;
      if (ok) return s;
    }
    return -1;
  }
  /** 辨認：是不是某個 E(k, n) 的旋轉（k、n 由節奏本身決定） */
  function identify(p) {
    const n = p.length, k = count(p);
    const s = rotationOf(p, bjorklund(k, n));
    return { n: n, k: k, euclid: s >= 0, rot: s >= 0 ? s : null };
  }
  /** 最大均勻（Clough–Douthett）：每個 j 的「相隔 j 個重音」距離只有一種或兩種相鄰的整數 */
  function isMaximallyEven(p) {
    const o = onsets(p), k = o.length, n = p.length;
    if (k <= 1) return true;
    for (let j = 1; j < k; j++) {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < k; i++) {
        const d = mod(o[(i + j) % k] - o[i], n) || n;
        lo = Math.min(lo, d); hi = Math.max(hi, d);
      }
      if (hi - lo > 1) return false;
    }
    return true;
  }
  /** 弦長和：重音兩兩之間的弦長 2 sin(π d / n) 加總 */
  function chordSum(p) {
    const o = onsets(p), n = p.length;
    let s = 0;
    for (let i = 0; i < o.length; i++) for (let j = i + 1; j < o.length; j++) s += 2 * Math.sin(Math.PI * (o[j] - o[i]) / n);
    return s;
  }
  /** 均勻度（0–1）：弦長和 ÷ E(k, n) 的弦長和；0 或 1 個重音時定為 1 */
  function evenness(p) {
    const k = count(p);
    if (k <= 1) return 1;
    const best = chordSum(bjorklund(k, p.length));
    return best > 0 ? chordSum(p) / best : 1;
  }
  /** 重音間距的標準差（格） */
  function ioiStd(p) {
    const d = iois(p);
    if (d.length < 2) return 0;
    const m = d.reduce(function (s, x) { return s + x; }, 0) / d.length;
    return Math.sqrt(d.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / d.length);
  }
  /** 規則的拍子：一個最小週期裡只有一個重音（例如 xxx、x.x.x.、.x.x.x）→ 傳回每個循環的拍數 k，否則 0 */
  function pulseCount(p) {
    const k = count(p);
    return k >= 1 && minimalPeriod(p) * k === p.length ? k : 0;
  }

  // ---------------- 聲部 ----------------
  /** 聲部設定 → 標準化：{ on, n, k, rot, custom, base（自訂時的未旋轉節奏）, timbre, src } */
  function normVoice(v, i) {
    v = v || {};
    const n = clampInt(v.n == null ? 8 : v.n, N_MIN, N_MAX);
    const out = { on: i === 0 ? true : !!v.on, n: n, k: clampInt(v.k == null ? 0 : v.k, 0, n), rot: clampInt(v.rot || 0, 0, n - 1),
      custom: false, base: null, timbre: TIMBRES.indexOf(v.timbre) >= 0 ? v.timbre : TIMBRES[i % TIMBRES.length], src: v.src || 'default' };
    if (v.custom && Array.isArray(v.base) && v.base.length === n) {
      out.custom = true;
      out.base = v.base.map(function (x) { return x ? 1 : 0; });
      out.k = count(out.base);
    }
    return out;
  }
  function voicePattern(v) { return v.custom && v.base ? rotate(v.base, v.rot) : euclid(v.k, v.n, v.rot); }

  /** 一個聲部的分析 */
  function analyzeVoice(v, i) {
    const p = voicePattern(v), id = identify(p);
    return {
      i: i, on: v.on, n: v.n, k: id.k, rot: v.rot, custom: !!v.custom, timbre: v.timbre, src: v.src,
      pattern: toStr(p), onsets: onsets(p), iois: iois(p), euclid: id.euclid, eu: id.euclid ? { k: id.k, n: id.n, rot: id.rot } : null,
      me: isMaximallyEven(p), evenness: evenness(p), std: ioiStd(p), period: minimalPeriod(p), pulse: pulseCount(p),
      gcd: gcd(id.k, v.n) || v.n, active: v.on && id.k > 0
    };
  }

  /**
   * 合起來的節奏：cfg = { mode: 'cycle' | 'step', bpm, voices: [聲部…] }
   * 傳回頁面與任務共用的結果（所有格子編號都是 L 個細格裡的位置，0 起算）。
   */
  function analyze(cfg) {
    cfg = cfg || {};
    const mode = cfg.mode === 'step' ? 'step' : 'cycle';
    const bpm = Math.max(BPM_MIN, Math.min(BPM_MAX, +cfg.bpm || BPM_DEFAULT));
    const vs = [];
    for (let i = 0; i < VOICES; i++) vs.push(analyzeVoice(normVoice((cfg.voices || [])[i], i), i));
    const act = vs.filter(function (v) { return v.active; });
    const L = act.length ? act.reduce(function (l, v) { return lcm(l, v.n); }, 1) : vs[0].n;
    const stepSec = 60 / bpm;                                      // 聲部 1 的一格（兩種方式都一樣）
    const cycleSec = vs[0].n * stepSec;                            // 'cycle' 的一個循環
    const cellSec = mode === 'cycle' ? cycleSec / L : stepSec;     // 細格的秒數
    // 每個聲部的一格是幾個細格、在細格 c 有沒有重音
    const unit = function (v) { return mode === 'cycle' ? L / v.n : 1; };
    const hitAt = function (v, c) {
      const u = unit(v);
      if (c % u) return false;
      return v.pattern.charAt((c / u) % v.n) === 'x';
    };
    const union = [], together = [], hits = [];
    let overlap = 0;
    const pairs = {};
    for (let a = 0; a < act.length; a++) for (let b = a + 1; b < act.length; b++) pairs[(act[a].i + 1) + '' + (act[b].i + 1)] = 0;
    for (let c = 0; c < L; c++) {
      const who = act.filter(function (v) { return hitAt(v, c); }).map(function (v) { return v.i; });
      hits.push(who);
      union.push(who.length ? 1 : 0);
      if (who.length >= 2) overlap++;
      if (act.length >= 2 && who.length === act.length) together.push(c);
      for (let a = 0; a < who.length; a++) for (let b = a + 1; b < who.length; b++) pairs[(who[a] + 1) + '' + (who[b] + 1)]++;
    }
    // 一起落拍之間相隔幾格（繞一圈）
    const gaps = together.map(function (c, j) { return j + 1 < together.length ? together[j + 1] - c : together[0] + L - c; });
    // 實際的最小週期：各聲部最小週期（換成細格）的最小公倍數
    const pOf = function (v) { return v.period * unit(v); };
    const Pmin = act.length ? act.reduce(function (l, v) { return lcm(l, pOf(v)); }, 1) : L;
    // 環面結（3D）：前兩個有重音的聲部，各自的最小週期 Pa、Pb；一起回到原點要 lcm(Pa, Pb)，纏繞數 = 那段時間各繞幾圈
    let torus = null;
    if (act.length >= 2) {
      const a = act[0], b = act[1], Pa = pOf(a), Pb = pOf(b), M = lcm(Pa, Pb);
      torus = { a: a.i, b: b.i, Pa: Pa, Pb: Pb, M: M, w: [M / Pa, M / Pb], knot: Math.min(M / Pa, M / Pb) >= 2 };
    }
    return {
      mode: mode, bpm: bpm, voices: vs, active: act.map(function (v) { return v.i; }), nActive: act.length,
      L: L, stepSec: stepSec, cycleSec: cycleSec, cellSec: cellSec, periodSec: L * cellSec, Pmin: Pmin,
      union: toStr(union), hits: hits, together: together, gaps: gaps, nTogether: together.length, overlap: overlap, pairs: pairs,
      torus: torus, unitOf: act.map(unit)
    };
  }

  /** 世界各地的傳統節奏型（Toussaint 2005 的表；rot = 從 E(k, n) 的第幾格開始，onset = 從第幾個重音開始） */
  const TRADITIONAL = [
    { id: 'tresillo', k: 3, n: 8, rot: 0, onset: 1, zh: '古巴 tresillo', en: 'Cuban tresillo' },
    { id: 'cinquillo', k: 5, n: 8, rot: 0, onset: 1, zh: '古巴 cinquillo', en: 'Cuban cinquillo' },
    { id: 'tango', k: 5, n: 8, rot: 2, onset: 2, zh: '西班牙探戈', en: 'Spanish tango' },
    { id: 'bossa', k: 5, n: 16, rot: 6, onset: 3, zh: '巴西 bossa nova', en: 'Brazilian bossa nova' },
    { id: 'samba', k: 7, n: 16, rot: 14, onset: 7, zh: '巴西森巴', en: 'Brazilian samba' },
    { id: 'bell', k: 7, n: 12, rot: 0, onset: 1, zh: '西非鈴鼓型', en: 'West African bell' },
    { id: 'venda', k: 5, n: 12, rot: 0, onset: 1, zh: '南非 Venda 拍手', en: 'South African Venda clapping' },
    { id: 'aksak', k: 4, n: 9, rot: 0, onset: 1, zh: '土耳其 aksak', en: 'Turkish aksak' },
    { id: 'cumbia', k: 3, n: 4, rot: 0, onset: 1, zh: '哥倫比亞 cumbia', en: 'Colombian cumbia' },
    { id: 'ruchenitza', k: 3, n: 7, rot: 0, onset: 1, zh: '保加利亞 ruchenitza', en: 'Bulgarian ruchenitza' }
  ];
  /** 節奏型的名稱（完全相同才算；找不到傳回 null） */
  function nameOf(pattern) {
    const s = typeof pattern === 'string' ? pattern : toStr(pattern);
    for (let i = 0; i < TRADITIONAL.length; i++) {
      const t = TRADITIONAL[i];
      if (t.n === s.length && toStr(euclid(t.k, t.n, t.rot)) === s) return t;
    }
    return null;
  }
  /** 古巴 son clave（3-2）：不是歐幾里得節奏，間距 3-3-4-2-4 */
  const SON_CLAVE = 'x..x..x...x.x...';

  return {
    N_MIN: N_MIN, N_MAX: N_MAX, BPM_MIN: BPM_MIN, BPM_MAX: BPM_MAX, BPM_DEFAULT: BPM_DEFAULT, VOICES: VOICES, MODES: MODES, TIMBRES: TIMBRES,
    TRADITIONAL: TRADITIONAL, SON_CLAVE: SON_CLAVE,
    gcd: gcd, lcm: lcm, mod: mod,
    bjorklund: bjorklund, euclidSteps: euclidSteps, rotate: rotate, euclid: euclid, toStr: toStr, fromStr: fromStr,
    count: count, onsets: onsets, iois: iois, minimalPeriod: minimalPeriod, rotationOf: rotationOf, identify: identify,
    isMaximallyEven: isMaximallyEven, chordSum: chordSum, evenness: evenness, ioiStd: ioiStd, pulseCount: pulseCount,
    normVoice: normVoice, voicePattern: voicePattern, analyzeVoice: analyzeVoice, analyze: analyze, nameOf: nameOf
  };
}));
