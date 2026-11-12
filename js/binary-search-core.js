/* binary-search-core.js — 線性搜尋與二分搜尋的計算核心（與畫面分離，Node 單元測試：tests/binary-search-core.test.js）
 *
 * 比較次數的算法（頁面與測試一致）：
 *   線性搜尋：由左到右一張一張看，每看一張（目標和這張卡比一次是否相等）算 1 次比較；找到就停。
 *   二分搜尋：lo、hi 是還沒排除的範圍（含兩端），mid = ⌊(lo + hi) / 2⌋；每次把目標和 a[mid] 比大小，
 *             得到「小於、等於、大於」三種結果之一，算 1 次比較（Knuth《TAOCP》第 3 卷 6.2.1 的算法）。
 *             一般版：等於就停；a[mid] < 目標 → lo = mid + 1；a[mid] > 目標 → hi = mid − 1；lo > hi 就是找不到。
 *             「找第一個出現的位置」版：等於時記下 mid，再往左找（hi = mid − 1），一直到 lo > hi，
 *             所以從不提早結束，回傳的是第一個出現的位置。
 *   最壞情況 ⌊log₂ n⌋ + 1 次 ＝ 決策樹（比較樹）的層數；n = 2^k − 1 時決策樹每一層都排滿。
 *   猜數字（1 到 N）：最佳策略最多要 ⌈log₂(N + 1)⌉ 次；「耍賴的電腦」不先決定答案，每次都留下比較大的一邊，
 *   任何猜法都至少要這麼多次（下界）。
 * 亂數一律由種子決定（mulberry32），同一個種子可以重現（任務證明用）。
 */
(function (root) {
  'use strict';
  const MIN_N = 4, MAX_N = 1023;
  const KINDS = ['sorted', 'dups', 'unsorted'];

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

  /** n 的二進位位數 ＝ ⌊log₂ n⌋ + 1（n ≥ 1） */
  function bitLen(n) { return n >= 1 ? 32 - Math.clz32(n) : 0; }
  /** 二分搜尋最多的比較次數 ⌊log₂ n⌋ + 1 */
  function worst(n) { return bitLen(n); }
  /** n = 2^k − 1：決策樹每一層都排滿 */
  function isPerfect(n) { return n >= 1 && (n & (n + 1)) === 0; }
  /** 猜數字 1 到 N 的最佳保證次數 ⌈log₂(N + 1)⌉（等於 ⌊log₂ N⌋ + 1） */
  function guessOptimal(N) { return bitLen(N); }

  // =====================================================================
  // 資料
  // =====================================================================
  /**
   * 產生 n 張卡的資料。kind：
   *   'sorted'   由小到大、不重複（相鄰相差 1 到 3）
   *   'dups'     由小到大、有重複（相鄰相差 0、1、2；相差 0 的機率 0.4）
   *   'unsorted' 和 'sorted' 同一批數字，打亂順序（保證不是排好的）
   * 同一個種子、不同的 n：'sorted' 與 'dups' 的前面幾張相同（n 變大只是在後面加卡片）。
   */
  function makeData(seed, n, kind) {
    n = Math.max(1, Math.min(MAX_N, Math.round(n)));
    const a = [];
    if (kind === 'dups') {
      const r = rng((seed ^ 0x5bd1e995) >>> 0);
      let v = 1 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        a.push(v);
        const u = r();
        v += u < 0.4 ? 0 : u < 0.75 ? 1 : 2;
      }
      return { a: a, kind: 'dups', seed: seed, n: n };
    }
    const r = rng(seed);
    let v = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) { a.push(v); v += 1 + Math.floor(r() * 3); }
    if (kind === 'unsorted') {
      const s = rng((seed * 2654435761 + n * 40503) >>> 0);
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(s() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
      if (n >= 2 && isSortedAsc(a)) { const t = a[0]; a[0] = a[1]; a[1] = t; }
      return { a: a, kind: 'unsorted', seed: seed, n: n };
    }
    return { a: a, kind: 'sorted', seed: seed, n: n };
  }
  function isSortedAsc(a) { for (let i = 1; i < a.length; i++) if (a[i] < a[i - 1]) return false; return true; }

  /** 目標在陣列裡出現的位置：第一個、最後一個、次數 */
  function occurrences(a, t) {
    let first = -1, last = -1, count = 0;
    for (let i = 0; i < a.length; i++) if (a[i] === t) { if (first < 0) first = i; last = i; count++; }
    return { first: first, last: last, count: count };
  }
  /** 隨機挑一個陣列裡有的數 */
  function randomPresent(a, rand) { return a[Math.floor(rand() * a.length)]; }
  /** 隨機挑一個陣列裡沒有的整數（在最小值 − 3 到最大值 + 3 之間）；整段都有就回傳最大值 + 1 */
  function randomAbsent(a, rand) {
    let lo = Infinity, hi = -Infinity;
    const have = {};
    a.forEach(function (v) { have[v] = true; if (v < lo) lo = v; if (v > hi) hi = v; });
    const pool = [];
    for (let v = lo - 3; v <= hi + 3; v++) if (!have[v] && v >= 0) pool.push(v);
    return pool.length ? pool[Math.floor(rand() * pool.length)] : hi + 1;
  }

  // =====================================================================
  // 搜尋（一次完成；畫面上的單步動畫用 stepper）
  // =====================================================================
  /** 線性搜尋：回傳 { found（索引，找不到是 −1）, cmp（比較次數）} */
  function linearSearch(a, t) {
    for (let i = 0; i < a.length; i++) if (a[i] === t) return { found: i, cmp: i + 1 };
    return { found: -1, cmp: a.length };
  }
  /**
   * 二分搜尋。first 為 true 時是「找第一個出現的位置」版。
   * 回傳 { found, cmp, path: [{ lo, hi, mid, rel }] }；rel = a[mid] 和目標比：−1 小於（往右）、0 等於、1 大於（往左）。
   * 找不到時另外回傳最後的 lo、hi（lo = hi + 1，目標應該插入的位置就是 lo）。
   */
  function binarySearch(a, t, first) {
    let lo = 0, hi = a.length - 1, ans = -1;
    const path = [];
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const v = a[mid];
      const rel = v < t ? -1 : v > t ? 1 : 0;
      path.push({ lo: lo, hi: hi, mid: mid, rel: rel });
      if (rel === 0) {
        if (!first) return { found: mid, cmp: path.length, path: path, lo: lo, hi: hi };
        ans = mid; hi = mid - 1;
      } else if (rel < 0) lo = mid + 1;
      else hi = mid - 1;
    }
    return { found: ans, cmp: path.length, path: path, lo: lo, hi: hi };
  }

  /**
   * 單步執行器：兩種搜尋同時跑，每一步各做一次比較（已經結束的就不動）。
   * 狀態：lin { i（下一張要看的）, cmp, done, found, last（剛看的索引）}，
   *       bin { lo, hi, cmp, done, found, ans, last（剛比的 { lo, hi, mid, rel }）, path }
   */
  function stepper(a, t, first) {
    const s = {
      a: a, t: t, first: !!first,
      lin: { i: 0, cmp: 0, done: a.length === 0, found: -1, last: -1 },
      bin: { lo: 0, hi: a.length - 1, cmp: 0, done: a.length === 0, found: -1, ans: -1, last: null, path: [] },
      steps: 0
    };
    return s;
  }
  function step(s) {
    const a = s.a, t = s.t;
    let any = false;
    const L = s.lin;
    if (!L.done) {
      any = true;
      L.last = L.i; L.cmp++;
      if (a[L.i] === t) { L.found = L.i; L.done = true; }
      else { L.i++; if (L.i >= a.length) L.done = true; }
    }
    const B = s.bin;
    if (!B.done) {
      any = true;
      const mid = Math.floor((B.lo + B.hi) / 2);
      const v = a[mid];
      const rel = v < t ? -1 : v > t ? 1 : 0;
      const rec = { lo: B.lo, hi: B.hi, mid: mid, rel: rel };
      B.last = rec; B.path.push(rec); B.cmp++;
      if (rel === 0) {
        if (!s.first) { B.found = mid; B.done = true; }
        else { B.ans = mid; B.hi = mid - 1; }
      } else if (rel < 0) B.lo = mid + 1;
      else B.hi = mid - 1;
      if (!B.done && B.lo > B.hi) { B.done = true; B.found = s.first ? B.ans : -1; }
    }
    if (any) s.steps++;
    return s.lin.done && s.bin.done;
  }
  function runAll(s) { let guard = 0; while (!(s.lin.done && s.bin.done) && guard++ < 5000) step(s); return s; }

  // =====================================================================
  // 決策樹（比較樹）
  // =====================================================================
  /**
   * n 張卡的二分搜尋決策樹：節點 i（索引）是「把目標和 a[i] 比」；左子樹是 a[lo..i−1]、右子樹是 a[i+1..hi]。
   * 回傳 { n, root, depth[]（根是 0）, parent[], left[], right[], height（層數）, I（內部路徑長＝深度和）,
   *        ext: [{ depth, after }]（n + 1 個「找不到」的葉子，依由左到右；after = 它在哪張卡的右邊，−1 是最左邊）, E（外部路徑長）}
   */
  const treeCache = {};
  function tree(n) {
    if (treeCache[n]) return treeCache[n];
    const depth = new Array(n), parent = new Array(n), left = new Array(n), right = new Array(n);
    const ext = [];
    let I = 0, E = 0, height = 0;
    function build(lo, hi, d, par) {
      if (lo > hi) { ext.push({ depth: d, after: lo - 1, parent: par }); E += d; return -1; }
      const mid = Math.floor((lo + hi) / 2);
      depth[mid] = d; parent[mid] = par; I += d;
      if (d + 1 > height) height = d + 1;
      left[mid] = build(lo, mid - 1, d + 1, mid);
      right[mid] = build(mid + 1, hi, d + 1, mid);
      return mid;
    }
    const rootIdx = build(0, n - 1, 0, -1);
    const T = { n: n, root: rootIdx, depth: depth, parent: parent, left: left, right: right, height: height, I: I, ext: ext, E: E };
    treeCache[n] = T;
    return T;
  }
  /** 二分搜尋（找得到時、每個數機會相同）的平均比較次數 1 + I/n */
  function avgBinarySuccess(n) { return 1 + tree(n).I / n; }
  /** 找不到時（n + 1 個空隙機會相同）的平均比較次數 E/(n + 1) */
  function avgBinaryFail(n) { return tree(n).E / (n + 1); }
  /** 線性搜尋（找得到時）的平均比較次數 (n + 1)/2 */
  function avgLinearSuccess(n) { return (n + 1) / 2; }
  /** 內部路徑長的遞迴 I(s) = s − 1 + I(⌊(s − 1)/2⌋) + I(⌈(s − 1)/2⌉)（給測試對照） */
  function internalPathLength(s) {
    if (s <= 1) return 0;
    const L = Math.floor((s - 1) / 2), R = s - 1 - L;
    return s - 1 + internalPathLength(L) + internalPathLength(R);
  }

  // =====================================================================
  // 任務事件的資料（頁面與任務證明共用，保證一致）
  // =====================================================================
  /** 一次搜尋完成後的摘要 */
  function searchEvent(data, t, first) {
    const a = data.a, n = a.length;
    const oc = occurrences(a, t);
    const lin = linearSearch(a, t);
    const bin = binarySearch(a, t, !!first);
    const plain = first ? binarySearch(a, t, false) : bin;
    const inArray = oc.count > 0;
    let ok;
    if (!inArray) ok = bin.found === -1;
    else if (first) ok = bin.found === oc.first;
    else ok = bin.found >= 0 && a[bin.found] === t;
    let lo = Infinity, hi = -Infinity;
    a.forEach(function (v) { if (v < lo) lo = v; if (v > hi) hi = v; });
    return {
      n: n, kind: data.kind, first: !!first, target: t, inArray: inArray, count: oc.count, firstIdx: oc.first, lastIdx: oc.last,
      linCmp: lin.cmp, linFound: lin.found, binCmp: bin.cmp, binFound: bin.found, binOk: ok,
      plainIdx: plain.found, plainCmp: plain.cmp, worst: worst(n), perfect: isPerfect(n),
      below: t < lo, above: t > hi, path: bin.path.map(function (p) { return p.mid; })
    };
  }
  /**
   * 「每個目標都找一次」：每個出現過的數各找一次（有重複時每個不同的數一次）；
   * 排好的不重複資料另外把 n + 1 個空隙（找不到）各找一次。
   */
  function sweepEvent(data, first) {
    const a = data.a, n = a.length;
    const seen = {}, keys = [];
    a.forEach(function (v) { if (!seen[v]) { seen[v] = true; keys.push(v); } });
    let linSum = 0, binSum = 0, linMax = 0, binMax = 0, binMin = Infinity, binFound = 0;
    keys.forEach(function (t) {
      const lin = linearSearch(a, t), bin = binarySearch(a, t, !!first), oc = occurrences(a, t);
      linSum += lin.cmp; binSum += bin.cmp;
      if (lin.cmp > linMax) linMax = lin.cmp;
      if (bin.cmp > binMax) binMax = bin.cmp;
      if (bin.cmp < binMin) binMin = bin.cmp;
      if (first ? bin.found === oc.first : (bin.found >= 0 && a[bin.found] === t)) binFound++;
    });
    let failMin = null, failMax = null, failAvg = null;
    if (data.kind === 'sorted') {
      failMin = Infinity; failMax = 0;
      let s = 0;
      for (let j = 0; j <= n; j++) {
        const t = j === 0 ? a[0] - 0.5 : j === n ? a[n - 1] + 0.5 : (a[j - 1] + a[j]) / 2;
        const c = binarySearch(a, t, !!first).cmp;
        s += c; if (c < failMin) failMin = c; if (c > failMax) failMax = c;
      }
      failAvg = s / (n + 1);
    }
    const linAvg = linSum / keys.length, binAvg = binSum / keys.length;
    return {
      n: n, kind: data.kind, first: !!first, keys: keys.length,
      linAvg: linAvg, binAvg: binAvg, ratio: linAvg / binAvg, linMax: linMax, binMax: binMax, binMin: binMin, binFound: binFound,
      failMin: failMin, failMax: failMax, failAvg: failAvg, worst: worst(n), perfect: isPerfect(n)
    };
  }

  // =====================================================================
  // 猜數字
  // =====================================================================
  /** 開一局：1 到 N；adversary 為 true 時電腦耍賴（不先決定答案） */
  function newGame(N, adversary, rand) {
    N = Math.max(2, Math.round(N));
    return {
      N: N, adversary: !!adversary, lo: 1, hi: N,
      secret: adversary ? null : 1 + Math.floor(rand() * N),
      guesses: 0, wasted: 0, allMid: true, done: false, history: []
    };
  }
  /**
   * 猜一次。回傳 { result（'hit' | 'low'（猜得太小）| 'high'（猜得太大））, lo, hi（猜之前可能的範圍）, wasted, mid }，並更新 g。
   * 耍賴的電腦：猜的數在範圍內時，留下比較大的一邊（兩邊一樣大時用亂數挑）；範圍只剩這一個數才算猜中。
   */
  function guess(g, x, rand) {
    if (g.done) return null;
    x = Math.round(x);
    const lo = g.lo, hi = g.hi;
    const wasted = x < lo || x > hi;
    const mid = x === Math.floor((lo + hi) / 2) || x === Math.ceil((lo + hi) / 2);
    let result;
    if (g.adversary) {
      if (x < lo) result = 'low';
      else if (x > hi) result = 'high';
      else if (lo === hi) result = 'hit';
      else {
        const left = x - lo, right = hi - x;
        if (left > right) result = 'high';
        else if (right > left) result = 'low';
        else result = rand() < 0.5 ? 'high' : 'low';
      }
    } else result = x === g.secret ? 'hit' : x < g.secret ? 'low' : 'high';
    g.guesses++;
    if (wasted) g.wasted++;
    if (!mid) g.allMid = false;
    if (result === 'hit') { g.done = true; g.secret = x; g.lo = x; g.hi = x; }
    else if (result === 'low') g.lo = Math.max(g.lo, x + 1);
    else g.hi = Math.min(g.hi, x - 1);
    const rec = { x: x, result: result, lo: lo, hi: hi, wasted: wasted, mid: mid };
    g.history.push(rec);
    return rec;
  }
  /** 一局結束（猜中）時的摘要 */
  function gameEvent(g) {
    return { N: g.N, adversary: g.adversary, guesses: g.guesses, optimal: guessOptimal(g.N), wasted: g.wasted, allMid: g.allMid, secret: g.secret };
  }
  /** 照二分法猜（每次猜範圍的中間 ⌊(lo + hi)/2⌋）直到猜中，回傳猜的次數（測試與證明用） */
  function playMidpoints(g, rand) {
    let guard = 0;
    while (!g.done && guard++ < 100) guess(g, Math.floor((g.lo + g.hi) / 2), rand);
    return g.guesses;
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
    MIN_N: MIN_N, MAX_N: MAX_N, KINDS: KINDS,
    rng: rng, bitLen: bitLen, worst: worst, isPerfect: isPerfect, guessOptimal: guessOptimal,
    makeData: makeData, isSortedAsc: isSortedAsc, occurrences: occurrences, randomPresent: randomPresent, randomAbsent: randomAbsent,
    linearSearch: linearSearch, binarySearch: binarySearch, stepper: stepper, step: step, runAll: runAll,
    tree: tree, avgBinarySuccess: avgBinarySuccess, avgBinaryFail: avgBinaryFail, avgLinearSuccess: avgLinearSuccess, internalPathLength: internalPathLength,
    searchEvent: searchEvent, sweepEvent: sweepEvent,
    newGame: newGame, guess: guess, gameEvent: gameEvent, playMidpoints: playMidpoints,
    trim: trim
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BinarySearchCore = api;
})(typeof window !== 'undefined' ? window : this);
