/* big-o-core.js — 「時間複雜度：成長速度的比較」的計算核心（與畫面分離，Node 單元測試：tests/big-o-core.test.js）
 *
 * 五個小演算法真的在資料上執行，並數「指令執行次數」。每一種只數一種操作（頁面與測試一致）：
 *   二分搜尋 binary：在排好的 1, 2, …, n 裡找 n + 1（比每個數都大，找不到 → 最壞情況）。
 *                    把目標和 a[mid] 比大小（得到小於、等於、大於之一）算 1 次；mid = ⌊(lo + hi) / 2⌋。
 *                    次數 = ⌊log2 n⌋ + 1。
 *   循序搜尋 linear：同一份資料、同一個目標，由左到右把目標和一個元素比是否相等算 1 次。次數 = n。
 *   合併排序 merge ：由上而下的合併排序（左半 = lo..mid，mid = ⌊(lo + hi) / 2⌋），合併時比較兩個元素的大小算 1 次。
 *                    上界 n⌈log2 n⌉ − 2^⌈log2 n⌉ + 1；資料有三種：隨機（有種子）、已排好、最壞情況（每次合併都比滿）。
 *   兩兩比較 pairs ：雙層迴圈 for i < j，比較 a[i] 與 a[j] 是否相等（找重複的值）算 1 次。次數 = n(n − 1)/2。
 *   列出所有子集合 subsets：依二進位計數的順序列出 2^n 個子集合（含空集合），檢查「總和是不是剛好等於目標」算 1 次；
 *                    目標是全部總和 + 1（湊不到，每一個都得檢查）。n ≤ 20 真的列，n > 20 只用公式 2^n（不真的跑）。
 * 常數因子：比較 a·f(n) 與 b·g(n)，f、g 是 log2 n、√n、n、n log2 n、n²、n³、2^n、n! 之一；
 *   交叉點 cross = 最小的 n0，使得 n ≥ n0 時「長得快的那一邊」永遠 ≥ 另一邊；crossStrict 用「>」。
 *   「剛好相等」用精確算術判定（BigInt；log2 n 只有在 n 是 2 的次方時才是有理數）。
 * 每個操作 1 奈秒的時間換算：1 年 = 365.25 天（儒略年）。
 */
(function (root) {
  'use strict';
  const MIN_N = 1, MAX_N = 1000, REAL_SUBSET_MAX = 20;
  const ALGOS = ['binary', 'linear', 'merge', 'pairs', 'subsets'];
  const SHAPES = ['random', 'sorted', 'worst'];

  /** 有種子的亂數產生器（mulberry32），回傳 [0, 1) 的均勻亂數 */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // =====================================================================
  // 計數公式
  // =====================================================================
  /** ⌊log2 n⌋ + 1（n ≥ 1） */
  function bitLen(n) { return n >= 1 ? 32 - Math.clz32(n) : 0; }
  /** ⌈log2 n⌉（n ≥ 1） */
  function ceilLog2(n) { let k = 0; while (Math.pow(2, k) < n) k++; return k; }
  function isPow2(n) { return n >= 1 && Number.isInteger(n) && Math.pow(2, Math.round(Math.log2(n))) === n; }
  const F = {
    binary: function (n) { return bitLen(n); },
    linear: function (n) { return n; },
    merge: function (n) { if (n <= 1) return 0; const k = ceilLog2(n); return n * k - Math.pow(2, k) + 1; },
    pairs: function (n) { return n * (n - 1) / 2; },
    subsets: function (n) { return Math.pow(2, n); }
  };
  /** 已排好的資料：每次合併左半先用完，比較次數 = 左半長度 ⌈m/2⌉ */
  const sortedMemo = [0, 0];
  function mergeSortedCount(n) {
    if (n <= 1) return 0;
    if (sortedMemo[n] == null) sortedMemo[n] = mergeSortedCount(Math.ceil(n / 2)) + mergeSortedCount(Math.floor(n / 2)) + Math.ceil(n / 2);
    return sortedMemo[n];
  }

  // =====================================================================
  // 資料
  // =====================================================================
  function range1(n) { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = i + 1; return a; }
  /** 讓這個合併排序每次合併都比滿（m − 1 次）的排列：已排好的數交錯分給左右兩半，再各自遞迴 */
  function worstPerm(n) {
    function build(vals) {
      if (vals.length <= 1) return vals.slice();
      const L = [], R = [];
      vals.forEach(function (v, i) { (i % 2 === 0 ? L : R).push(v); });
      return build(L).concat(build(R));
    }
    return build(range1(n));
  }
  /** n 個不同的數 1..n。shape：'random'（有種子）、'sorted'、'worst' */
  function makeData(n, shape, seed) {
    if (shape === 'sorted') return range1(n);
    if (shape === 'worst') return worstPerm(n);
    const a = range1(n), r = rng(((seed >>> 0) ^ Math.imul(n, 0x9E3779B1)) >>> 0);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // =====================================================================
  // 五個小演算法（真的執行，邊做邊數）
  // =====================================================================
  function linearSearch(a, t) {
    let c = 0;
    for (let i = 0; i < a.length; i++) { c++; if (a[i] === t) return { count: c, found: i }; }
    return { count: c, found: -1 };
  }
  /** trace[k] = 第 k + 1 次比較：{ lo, hi（比較前的範圍）, mid, rel（a[mid] 和目標比：−1 小、0 等、1 大）, lo2, hi2（比較後） } */
  function binarySearch(a, t) {
    let lo = 0, hi = a.length - 1, c = 0;
    const trace = [];
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      c++;
      const rel = a[mid] < t ? -1 : a[mid] > t ? 1 : 0;
      const st = { lo: lo, hi: hi, mid: mid, rel: rel };
      if (rel === 0) { st.lo2 = mid; st.hi2 = mid; trace.push(st); return { count: c, found: mid, trace: trace }; }
      if (rel < 0) lo = mid + 1; else hi = mid - 1;
      st.lo2 = lo; st.hi2 = hi;
      trace.push(st);
    }
    return { count: c, found: -1, trace: trace };
  }
  function pairs(a) {
    let c = 0, dups = 0;
    const n = a.length;
    for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) { c++; if (a[i] === a[j]) dups++; }
    return { count: c, dups: dups };
  }
  /** 第 k 次比較（k 從 1 起）是哪一對 (i, j) */
  function pairAt(n, k) {
    let i = 0, left = k;
    while (i < n - 1 && left > n - 1 - i) { left -= n - 1 - i; i++; }
    return { i: i, j: i + left };
  }
  /** 合併 a[lo..mid] 與 a[mid+1..hi]，最多比 budget 次；回傳用掉的比較次數與是否做完 */
  function mergeRun(a, lo, mid, hi, budget) {
    const L = a.slice(lo, mid + 1), R = a.slice(mid + 1, hi + 1);
    let i = 0, j = 0, k = lo, c = 0;
    while (i < L.length && j < R.length) {
      if (c >= budget) {
        // 還沒做完：已合併的前段、左半剩下的、右半剩下的依序放回（仍是同一批數）
        const rest = L.slice(i).concat(R.slice(j));
        for (let q = 0; q < rest.length; q++) a[k + q] = rest[q];
        return { used: c, done: false, pos: k, split: k + (L.length - i) };
      }
      c++;
      if (L[i] <= R[j]) a[k++] = L[i++]; else a[k++] = R[j++];
    }
    while (i < L.length) a[k++] = L[i++];
    while (j < R.length) a[k++] = R[j++];
    return { used: c, done: true };
  }
  /** 合併排序：回傳比較次數、排好的陣列，以及每一次合併 { lo, mid, hi, c0（之前的比較次數）, c1（之後） } */
  function mergeSort(a0) {
    const a = a0.slice(), merges = [];
    let c = 0;
    (function sort(lo, hi) {
      if (lo >= hi) return;
      const mid = Math.floor((lo + hi) / 2);
      sort(lo, mid); sort(mid + 1, hi);
      const r = mergeRun(a, lo, mid, hi, Infinity);
      merges.push({ lo: lo, mid: mid, hi: hi, c0: c, c1: c + r.used });
      c += r.used;
    })(0, a.length - 1);
    return { count: c, sorted: a, merges: merges };
  }
  /** 做了 k 次比較之後陣列的樣子（重播合併）；cur：正在合併的那一段（沒有就是 null） */
  function mergeState(a0, merges, k) {
    const a = a0.slice();
    for (let m = 0; m < merges.length; m++) {
      const g = merges[m];
      if (g.c1 <= k) { mergeRun(a, g.lo, g.mid, g.hi, Infinity); continue; }
      if (g.c0 > k) return { arr: a, cur: null };
      const r = mergeRun(a, g.lo, g.mid, g.hi, k - g.c0);
      return { arr: a, cur: { lo: g.lo, mid: g.mid, hi: g.hi, pos: r.pos, split: r.split } };
    }
    return { arr: a, cur: null };
  }
  /** 依二進位計數的順序列出所有子集合，檢查總和是不是剛好等於 target（n ≤ 20） */
  let sumBuf = null;
  function subsets(vals, target) {
    const n = vals.length, N = Math.pow(2, n);
    if (!sumBuf || sumBuf.length < N) sumBuf = new Int32Array(Math.max(N, 1024));
    let c = 0, hits = 0;
    sumBuf[0] = 0;
    for (let m = 0; m < N; m++) {
      if (m > 0) { const low = m & -m; sumBuf[m] = sumBuf[m ^ low] + vals[31 - Math.clz32(low)]; }
      c++;
      if (sumBuf[m] === target) hits++;
    }
    return { count: c, hits: hits };
  }

  // =====================================================================
  // 一次完整的執行（頁面與任務證明共用）
  // =====================================================================
  function run(n, shape, seed) {
    n = Math.max(MIN_N, Math.min(MAX_N, Math.round(n)));
    const data = makeData(n, shape, seed), sorted = range1(n), target = n + 1;
    const lin = linearSearch(sorted, target), bin = binarySearch(sorted, target);
    const pr = pairs(data), ms = mergeSort(data);
    const sum = n * (n + 1) / 2;
    const formula = n > REAL_SUBSET_MAX;
    const sub = formula ? { count: F.subsets(n), hits: 0 } : subsets(data, sum + 1);
    return {
      n: n, shape: shape, seed: seed, data: data, sorted: sorted, target: target, subsetTarget: sum + 1,
      counts: { binary: bin.count, linear: lin.count, merge: ms.count, pairs: pr.count, subsets: sub.count },
      formula: formula, binTrace: bin.trace, merges: ms.merges, mergeSorted: ms.sorted, subsetHits: sub.hits
    };
  }
  /** 只要次數（加倍實驗用；合併排序照樣真的跑） */
  function counts(n, shape, seed) { return run(n, shape, seed).counts; }

  // =====================================================================
  // 每個操作 1 奈秒
  // =====================================================================
  const NS = { us: 1e3, ms: 1e6, s: 1e9, min: 6e10, h: 3.6e12, d: 8.64e13, yr: 365.25 * 8.64e13 };
  /** 把奈秒換成好讀的單位：{ v, unit（'ns'、'us'、'ms'、's'、'min'、'h'、'd'、'yr'） } */
  function humanTime(ns) {
    if (!(ns >= 0)) return { v: NaN, unit: 'ns' };
    if (ns < NS.us) return { v: ns, unit: 'ns' };
    if (ns < NS.ms) return { v: ns / NS.us, unit: 'us' };
    if (ns < NS.s) return { v: ns / NS.ms, unit: 'ms' };
    if (ns < NS.min) return { v: ns / NS.s, unit: 's' };
    if (ns < NS.h) return { v: ns / NS.min, unit: 'min' };
    if (ns < NS.d) return { v: ns / NS.h, unit: 'h' };
    if (ns < NS.yr) return { v: ns / NS.d, unit: 'd' };
    return { v: ns / NS.yr, unit: 'yr' };
  }

  // =====================================================================
  // 常數因子：a·f(n) 對 b·g(n)
  // =====================================================================
  const FUNCS = ['log', 'sqrt', 'n', 'nlogn', 'n2', 'n3', 'exp2', 'fact'];
  const RANK = { log: 1, sqrt: 2, n: 3, nlogn: 4, n2: 5, n3: 6, exp2: 7, fact: 8 };
  const LN2 = Math.LN2;
  const lnFactTab = [0];
  function lnFact(x) {
    if (Number.isInteger(x) && x <= 5000) {
      for (let k = lnFactTab.length; k <= x; k++) lnFactTab[k] = lnFactTab[k - 1] + Math.log(k);
      return lnFactTab[x];
    }
    // Stirling（x 很大時，只在連續二分法用得到）
    return x * Math.log(x) - x + 0.5 * Math.log(2 * Math.PI * x) + 1 / (12 * x);
  }
  /** ln f(x)；f(x) = 0 時是 −Infinity */
  function lnF(f, x) {
    switch (f) {
      case 'log': return x <= 1 ? -Infinity : Math.log(Math.log2(x));
      case 'sqrt': return 0.5 * Math.log(x);
      case 'n': return Math.log(x);
      case 'nlogn': return x <= 1 ? -Infinity : Math.log(x) + Math.log(Math.log2(x));
      case 'n2': return 2 * Math.log(x);
      case 'n3': return 3 * Math.log(x);
      case 'exp2': return x * LN2;
      case 'fact': return lnFact(x);
    }
    return NaN;
  }
  function valF(f, x) { const l = lnF(f, x); return l === -Infinity ? 0 : Math.exp(l); }
  /** 結構：值 = c · n^(p2/2) · (log2 n)^q · 2^(r·n) · (n!)^s */
  const SHAPE = { log: [0, 1, 0, 0], sqrt: [1, 0, 0, 0], n: [2, 0, 0, 0], nlogn: [2, 1, 0, 0], n2: [4, 0, 0, 0], n3: [6, 0, 0, 0], exp2: [0, 0, 1, 0], fact: [0, 0, 0, 1] };
  function bigFact(n) { let r = 1n; for (let k = 2n; k <= BigInt(n); k++) r *= k; return r; }
  /** a·f(n) 與 b·g(n) 是否「剛好相等」（精確算術；n 是 1 以上的安全整數） */
  function exactEqual(fa, a, fb, b, n) {
    if (!Number.isSafeInteger(n) || n < 1 || !Number.isInteger(a) || !Number.isInteger(b)) return false;
    const la = Math.log(a) + lnF(fa, n), lb = Math.log(b) + lnF(fb, n);
    if (la === -Infinity || lb === -Infinity) return la === lb;
    if (Math.abs(la - lb) > 1e-9 * Math.max(1, Math.abs(la))) return false;
    const A = SHAPE[fa], B = SHAPE[fb];
    if ((A[3] || B[3]) && n > 3000) return false;
    let qa = A[1], qb = B[1];
    let L = null;
    if (qa !== qb) {
      if (!isPow2(n)) return false;      // log2 n 不是有理數，和沒有 log 的一邊不可能相等
      L = BigInt(Math.round(Math.log2(n)));
    } else { qa = 0; qb = 0; }           // 兩邊一樣多個 log2 n（n > 1 時不是 0），約掉
    const N = BigInt(n);
    const sq = function (c, s, q) {      // (值)² 的精確整數
      let v = BigInt(c) * BigInt(c);
      v *= N ** BigInt(s[0]);
      if (q) v *= L ** BigInt(2 * q);
      if (s[2]) v *= 1n << BigInt(2 * n);
      if (s[3]) { const f = bigFact(n); v *= f * f; }
      return v;
    };
    return sq(a, A, qa) === sq(b, B, qb);
  }
  /** 在 n 這一點誰比較大：'A'、'B' 或 'eq' */
  function cmpAt(fa, a, fb, b, n) {
    if (exactEqual(fa, a, fb, b, n)) return 'eq';
    const la = Math.log(a) + lnF(fa, n), lb = Math.log(b) + lnF(fb, n);
    if (la === lb) return 'eq';
    return la > lb ? 'A' : 'B';
  }
  const SCAN = 4096;
  /**
   * 交叉點。回傳 { same, ratio（同一種時 a/b）, winner（長得快的一邊 'A'|'B'）, cross, crossStrict, equal（剛好相等的 n，由小到大）,
   *               approx（交叉點大到超過 2^53，只是近似值） }
   * cross：最小的 n0 ≥ 1，使得所有 n ≥ n0，快的一邊 ≥ 慢的一邊；crossStrict 用「>」。
   */
  function crossover(fa, a, fb, b) {
    if (fa === fb) return { same: true, ratio: a / b, winner: null, cross: null, crossStrict: null, equal: [], approx: false };
    const winner = RANK[fa] > RANK[fb] ? 'A' : 'B';
    const lose = winner === 'A' ? 'B' : 'A';
    let lastBehind = 0, lastNotAhead = 0;
    const equal = [];
    for (let n = 1; n <= SCAN; n++) {
      const c = cmpAt(fa, a, fb, b, n);
      if (c === 'eq') { equal.push(n); lastNotAhead = n; }
      else if (c === lose) { lastBehind = n; lastNotAhead = n; }
    }
    let approx = false;
    const cAtScan = cmpAt(fa, a, fb, b, SCAN);
    if (cAtScan !== winner) {
      // 超過 SCAN 之後兩邊的對數差是單調的：先倍增找上界，再二分找根
      const lnW = winner === 'A' ? function (x) { return Math.log(a) + lnF(fa, x); } : function (x) { return Math.log(b) + lnF(fb, x); };
      const lnL = winner === 'A' ? function (x) { return Math.log(b) + lnF(fb, x); } : function (x) { return Math.log(a) + lnF(fa, x); };
      const h = function (x) { return lnW(x) - lnL(x); };
      let lo = SCAN, hi = SCAN * 2;
      while (h(hi) <= 0 && hi < 1e308) { lo = hi; hi *= 2; }
      for (let it = 0; it < 400 && hi - lo > Math.max(1e-9, lo * 1e-15); it++) {
        const mid = lo + (hi - lo) / 2;
        if (h(mid) <= 0) lo = mid; else hi = mid;
      }
      const root = lo;
      if (root < 9e15) {
        const m = Math.floor(root);
        // m 附近逐一確認（精確判斷相等）
        if (cAtScan !== 'eq') { lastBehind = Math.max(SCAN, m - 4); lastNotAhead = lastBehind; }
        for (let k = Math.max(SCAN, m - 3); k <= m + 3; k++) {
          const c = cmpAt(fa, a, fb, b, k);
          if (c === 'eq') { equal.push(k); lastNotAhead = k; }
          else if (c === lose) { lastBehind = k; lastNotAhead = k; }
        }
      } else {
        approx = true;
        // 例如 a·n 對 b·n log2 n：log2 n ≥ a/b 時才追上，交叉點 = 2^(a/b)
        const r2 = Math.log2(root), ri = Math.round(r2);
        const exactPow = Math.abs(r2 - ri) < 1e-9 && ((fa === 'n' && fb === 'nlogn') || (fa === 'nlogn' && fb === 'n')) && Math.abs((winner === 'A' ? b / a : a / b) - ri) < 1e-12;
        if (exactPow) { lastBehind = Math.pow(2, ri) - 1; lastNotAhead = Math.pow(2, ri); equal.push(Math.pow(2, ri)); }
        else { lastBehind = Math.floor(root); lastNotAhead = Math.floor(root); }
      }
    }
    return { same: false, ratio: null, winner: winner, cross: lastBehind + 1, crossStrict: lastNotAhead + 1, equal: equal, approx: approx };
  }

  // =====================================================================
  // 任務事件（頁面與任務證明共用）
  // =====================================================================
  function laneEvent(r, algo, via) {
    return { algo: algo, n: r.n, shape: r.shape, count: r.counts[algo], formula: algo === 'subsets' && r.formula, via: via,
      bound: F.merge(r.n), counts: Object.assign({}, r.counts) };
  }
  function raceEvent(r, via) {
    return { n: r.n, shape: r.shape, counts: Object.assign({}, r.counts), formula: r.formula, via: via, mergeBound: F.merge(r.n),
      timeNs: Object.assign({}, r.counts) };
  }
  function doubleEvent(n0, shape, seed) {
    const n1 = 2 * n0;
    const c0 = counts(n0, shape, seed), c1 = counts(n1, shape, seed);
    const ratio = {}, diff = {};
    ALGOS.forEach(function (k) { ratio[k] = c0[k] > 0 ? c1[k] / c0[k] : null; diff[k] = c1[k] - c0[k]; });
    return { n0: n0, n1: n1, shape: shape, before: c0, after: c1, ratio: ratio, diff: diff };
  }
  function compareEvent(fa, a, fb, b, n, via) {
    const x = crossover(fa, a, fb, b);
    return { fa: fa, a: a, fb: fb, b: b, n: n, at: cmpAt(fa, a, fb, b, n), equalAt: exactEqual(fa, a, fb, b, n), same: x.same,
      winner: x.winner, cross: x.cross, crossStrict: x.crossStrict, equal: x.equal.slice(0, 12), approx: x.approx, via: via };
  }

  /** 數字的精簡寫法 */
  function trim(v, dec) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(dec);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === '-0') s = '0';
    return s;
  }

  const api = {
    MIN_N: MIN_N, MAX_N: MAX_N, REAL_SUBSET_MAX: REAL_SUBSET_MAX, ALGOS: ALGOS, SHAPES: SHAPES, FUNCS: FUNCS, RANK: RANK, NS: NS,
    rng: rng, bitLen: bitLen, ceilLog2: ceilLog2, isPow2: isPow2, formula: F, mergeSortedCount: mergeSortedCount,
    makeData: makeData, worstPerm: worstPerm,
    linearSearch: linearSearch, binarySearch: binarySearch, pairs: pairs, pairAt: pairAt, mergeSort: mergeSort, mergeState: mergeState, subsets: subsets,
    run: run, counts: counts, humanTime: humanTime,
    lnF: lnF, valF: valF, lnFact: lnFact, exactEqual: exactEqual, cmpAt: cmpAt, crossover: crossover,
    laneEvent: laneEvent, raceEvent: raceEvent, doubleEvent: doubleEvent, compareEvent: compareEvent,
    trim: trim
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BigOCore = api;
})(typeof window !== 'undefined' ? window : this);
