/* sorting-core.js — 排序演算法比較的核心（與畫面分離，Node 單元測試：tests/sorting-core.test.js）
 *
 * 五種排序都照教科書的寫法，執行時把每一個動作記成「步驟清單」，畫面再一步一步重播：
 *   基本操作（算一步）：cmp 比較兩個資料值、swap 交換兩個位置、write 把暫存區的值寫回陣列（合併排序）。
 *   標記（不算步）：pass 泡沫排序第幾輪、min 目前最小值、key 插入排序正在插入的元素、sorted 前段已相對排好、
 *     range 正在處理的區段（合併、快速）、copy 複製到暫存區、pivot 樞紐、done 已經就位。
 * 計數的定義（頁面說明有寫）：
 *   比較次數 C：兩個資料值之間的比較（迴圈索引的比較不算）。
 *   交換次數 S：真的交換兩個「不同」位置才算（自己跟自己交換不算，也不做）。
 *   寫入次數 W：合併排序把元素寫回原陣列的次數（複製到暫存區不算）。
 * 演算法：
 *   泡沫：相鄰比較、前大後小才交換；一整輪沒有交換就提早結束。
 *   選擇：每輪找最小值（嚴格小於才換人，相同時取前面那個），最小值不在第 i 格才交換。
 *   插入：把第 i 個往前逐格交換，直到前一個不大於它（相同不換，所以穩定）。
 *   合併：由上而下，mid = ⌊(lo + hi) / 2⌋（左半 ⌈n/2⌉ 個、右半 ⌊n/2⌋ 個）；合併時相同取左邊（穩定）。
 *   快速：Lomuto 分割（CLRS 第 7 章），樞紐 = 區段最後一個；a[j] ≤ 樞紐就換到前面。
 *         三數取中：區段至少 3 個時，先取 lo、mid、hi 三個的中位數（2–3 次比較，算進比較次數），換到最後再分割。
 * 遞迴深度：同時進行中、而且區段至少有 2 個元素的呼叫層數（合併排序 = ⌈log2 n⌉；快速排序最壞 = n − 1）。
 * 元素用「原本的位置 id」表示，值是 vals[id]；排完檢查相同的值 id 是否仍遞增，就知道穩不穩定。
 */
(function (root) {
  'use strict';
  const MIN_N = 5, MAX_N = 64, CUSTOM_MIN = 2, CUSTOM_MAX = 64, VAL_MAX = 99, FEW_K = 4;
  const ALGOS = ['bubble', 'selection', 'insertion', 'merge', 'quick'];
  const SHAPES = ['random', 'nearly', 'reversed', 'few', 'sorted', 'custom'];

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
  function range1(n) { const a = []; for (let i = 1; i <= n; i++) a.push(i); return a; }

  // =====================================================================
  // 資料
  // =====================================================================
  /** 依形態產生資料（值 1–n 或 1–4）。亂序、幾乎排好、很多重複用種子 seed，同一個種子一定得到同一份 */
  function makeData(n, shape, seed) {
    n = Math.max(MIN_N, Math.min(MAX_N, Math.round(n)));
    const r = rng(((seed >>> 0) * 2654435761 + n * 97 + SHAPES.indexOf(shape) * 7919) >>> 0);
    if (shape === 'sorted') return range1(n);
    if (shape === 'reversed') return range1(n).reverse();
    if (shape === 'few') { const a = []; for (let i = 0; i < n; i++) a.push(1 + Math.floor(r() * FEW_K)); return a; }
    if (shape === 'nearly') {
      const a = range1(n);
      const t = Math.max(1, Math.round(n / 8));
      for (let tries = 0; tries < 50; tries++) {
        for (let k = 0; k < t; k++) { const i = Math.floor(r() * (n - 1)); const v = a[i]; a[i] = a[i + 1]; a[i + 1] = v; }
        if (inversions(a) > 0) break;
      }
      return a;
    }
    // 亂序：1..n 的隨機排列（Fisher–Yates）
    const a = range1(n);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const v = a[i]; a[i] = a[j]; a[j] = v; }
    return a;
  }
  /** 解析自訂資料：抓出所有整數，1–99，2–64 個。回傳 { values, error（'few' | 'many' | 'range' | ''）} */
  function parseCustom(text) {
    const s = String(text == null ? '' : text).normalize('NFKC');
    if (s.length > 2000) return { values: [], error: 'many' };
    const m = s.match(/-?\d+(?:\.\d+)?/g) || [];
    const vals = [];
    let bad = false;
    for (let i = 0; i < m.length; i++) {
      const v = Number(m[i]);
      if (!Number.isInteger(v) || v < 1 || v > VAL_MAX) { bad = true; continue; }
      vals.push(v);
    }
    if (vals.length > CUSTOM_MAX) return { values: vals.slice(0, CUSTOM_MAX), error: 'many' };
    if (vals.length < CUSTOM_MIN) return { values: vals, error: 'few' };
    return { values: vals, error: bad ? 'range' : '' };
  }

  // =====================================================================
  // 資料的性質
  // =====================================================================
  /** 逆序數：i < j 而 a[i] > a[j] 的配對數（泡沫與插入排序的交換次數） */
  function inversions(a) {
    let c = 0;
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[i] > a[j]) c++;
    return c;
  }
  /** 循環數：把每個元素送到它（穩定）排好後的位置，這個排列分解成幾個循環（不動點也算一個） */
  function cycles(a) {
    const n = a.length, idx = a.map(function (v, i) { return i; });
    idx.sort(function (x, y) { return a[x] - a[y] || x - y; });   // idx[k] = 排好後第 k 格的元素原本在哪
    const seen = new Array(n).fill(false);
    let c = 0;
    for (let i = 0; i < n; i++) {
      if (seen[i]) continue;
      c++;
      for (let j = i; !seen[j]; j = idx[j]) seen[j] = true;
    }
    return c;
  }
  function isSorted(a) { for (let i = 1; i < a.length; i++) if (a[i - 1] > a[i]) return false; return true; }
  function isStrictlyDecreasing(a) { for (let i = 1; i < a.length; i++) if (a[i - 1] <= a[i]) return false; return a.length > 1; }
  function distinct(a) { return new Set(a).size; }
  /** 和前面某個元素同值的元素個數（n − 相異值個數） */
  function dupCount(a) { return a.length - distinct(a); }

  // =====================================================================
  // 理論值
  // =====================================================================
  function ceilLog2(n) { let k = 0; while ((1 << k) < n) k++; return k; }
  function half(n) { return n * (n - 1) / 2; }
  /** 合併排序（由上而下）最多的比較次數：n⌈log2 n⌉ − 2^⌈log2 n⌉ + 1 */
  function mergeWorst(n) { if (n <= 1) return 0; const k = ceilLog2(n); return n * k - Math.pow(2, k) + 1; }
  /** 合併排序的寫入次數（與資料無關）：W(n) = W(⌈n/2⌉) + W(⌊n/2⌋) + n = n⌈log2 n⌉ − 2^⌈log2 n⌉ + n */
  function mergeWrites(n) { if (n <= 1) return 0; const k = ceilLog2(n); return n * k - Math.pow(2, k) + n; }
  /** 合併排序遞迴式（給測試對照公式用） */
  function mergeWorstRec(n) { return n <= 1 ? 0 : mergeWorstRec(Math.ceil(n / 2)) + mergeWorstRec(Math.floor(n / 2)) + n - 1; }
  /** 快速排序（Lomuto、不用三數取中）最少的比較次數：每次分割比 m − 1 次、兩邊盡量一樣大 */
  const qmMemo = [0, 0];
  function quickMin(n) {
    if (n <= 1) return 0;
    if (qmMemo[n] != null) return qmMemo[n];
    const v = n - 1 + quickMin(Math.floor((n - 1) / 2)) + quickMin(Math.ceil((n - 1) / 2));
    qmMemo[n] = v;
    return v;
  }
  /** 各演算法比較次數的理論範圍 { min, max }。
   * 快速排序勾三數取中時：每個至少 3 個值的區段多比 3 次（取中），分區本身最多 n(n − 1)/2，
   * 所以最多 n(n − 1)/2 + 3(n − 2)；全部相同的資料剛好達到（每次只分掉樞紐一個）。這時 min 不列（null）。 */
  function compBounds(algo, n, median3) {
    if (algo === 'bubble' || algo === 'insertion') return { min: Math.max(0, n - 1), max: half(n) };
    if (algo === 'selection') return { min: half(n), max: half(n) };
    if (algo === 'merge') return { min: mergeBest(n), max: mergeWorst(n) };
    if (median3) return { min: null, max: half(n) + 3 * Math.max(0, n - 2) };
    return { min: quickMin(n), max: half(n) };
  }
  /** 合併排序最少的比較次數：每次合併都是一邊先用完，比較次數 = 較短那一邊的長度 ⌊m/2⌋ */
  function mergeBest(n) { return n <= 1 ? 0 : mergeBest(Math.ceil(n / 2)) + mergeBest(Math.floor(n / 2)) + Math.floor(n / 2); }

  // ---------- 特殊資料的構造（測試與任務證明用） ----------
  /** 讓快速排序（Lomuto、最後一個當樞紐）比較次數最少的資料：值 1..n。
   *  Lomuto 分割時，若比樞紐小的都已經在前面，分割不改變它們的順序，只會把右段的第一個換到最後；
   *  所以 = 最佳(左段) ＋ 右轉一格(最佳(右段)) ＋ 中位數。 */
  function quickBestData(n) {
    function build(lo, hi) {   // 值 lo..hi
      const m = hi - lo + 1;
      if (m <= 0) return [];
      if (m === 1) return [lo];
      const L = Math.floor((m - 1) / 2);
      const p = lo + L;
      const left = build(lo, p - 1), right = build(p + 1, hi);
      const rr = right.length ? [right[right.length - 1]].concat(right.slice(0, -1)) : [];
      return left.concat(rr, [p]);
    }
    return build(1, n);
  }
  /** 讓合併排序比較次數最多的資料：把排好的值交錯分給左右兩半，再各自遞迴 */
  function mergeWorstData(n) {
    function build(arr) {
      if (arr.length <= 1) return arr.slice();
      const L = [], R = [];
      arr.forEach(function (v, i) { (i % 2 === 0 ? L : R).push(v); });
      return build(L).concat(build(R));
    }
    return build(range1(n));
  }

  // =====================================================================
  // 執行排序，記錄步驟
  // =====================================================================
  /**
   * run(algo, vals, opts) → { algo, n, ops, steps, comps, swaps, writes, maxDepth, final（排好後的 id）, sortedVals, stable, broken }
   * opts.median3：快速排序用三數取中；opts.cmp(idA, idB)：自訂比較（任務證明的「對手」用），預設比 vals。
   * 每個基本操作的紀錄帶著到那一步為止的累計 c、s、w。
   */
  function run(algo, vals, opts) {
    opts = opts || {};
    const n = vals.length;
    const a = [];
    for (let i = 0; i < n; i++) a.push(i);
    const ops = [];
    let C = 0, S = 0, W = 0, maxDepth = 0;
    const cmpFn = opts.cmp || function (x, y) { return vals[x] - vals[y]; };
    function sg(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
    function mark(t, o) { o = o || {}; o.t = t; ops.push(o); }
    function cmp(i, j) {
      C++;
      const r = sg(cmpFn(a[i], a[j]));
      ops.push({ t: 'cmp', i: i, j: j, r: r, c: C, s: S, w: W });
      return r;
    }
    function swap(i, j) {
      if (i === j) return;
      S++;
      const v = a[i]; a[i] = a[j]; a[j] = v;
      ops.push({ t: 'swap', i: i, j: j, c: C, s: S, w: W });
    }
    const all = function () { mark('done', { lo: 0, hi: n - 1 }); };

    if (algo === 'bubble') {
      for (let p = 0; p < n - 1; p++) {
        mark('pass', { p: p, hi: n - 1 - p });
        let swapped = false;
        for (let j = 0; j < n - 1 - p; j++) if (cmp(j, j + 1) > 0) { swap(j, j + 1); swapped = true; }
        mark('done', { lo: n - 1 - p, hi: n - 1 - p });
        if (!swapped) break;
      }
      all();
    } else if (algo === 'selection') {
      for (let i = 0; i < n - 1; i++) {
        let m = i;
        mark('min', { i: i, m: m });
        for (let j = i + 1; j < n; j++) if (cmp(j, m) < 0) { m = j; mark('min', { i: i, m: m }); }
        swap(i, m);
        mark('done', { lo: i, hi: i });
      }
      all();
    } else if (algo === 'insertion') {
      mark('sorted', { k: 0 });
      for (let i = 1; i < n; i++) {
        mark('key', { i: i });
        let j = i;
        while (j > 0 && cmp(j - 1, j) > 0) { swap(j - 1, j); j--; mark('key', { i: j }); }
        mark('sorted', { k: i });
      }
      mark('key', { i: -1 });
      all();
    } else if (algo === 'merge') {
      const aux = new Array(n);
      const cmpAux = function (i, j) {
        C++;
        const r = sg(cmpFn(aux[i], aux[j]));
        ops.push({ t: 'cmp', i: i, j: j, r: r, aux: true, c: C, s: S, w: W });
        return r;
      };
      const write = function (k, from) {
        W++;
        a[k] = aux[from];
        ops.push({ t: 'write', k: k, from: from, c: C, s: S, w: W });
      };
      const sort = function (lo, hi, d) {
        if (hi <= lo) return;
        if (d > maxDepth) maxDepth = d;
        const mid = (lo + hi) >> 1;
        mark('range', { lo: lo, hi: hi, mid: mid, d: d });
        sort(lo, mid, d + 1);
        sort(mid + 1, hi, d + 1);
        mark('range', { lo: lo, hi: hi, mid: mid, d: d });
        for (let k = lo; k <= hi; k++) aux[k] = a[k];
        mark('copy', { lo: lo, hi: hi, mid: mid });
        let i = lo, j = mid + 1;
        for (let k = lo; k <= hi; k++) {
          mark('ptr', { i: i, j: j, k: k });
          if (i > mid) write(k, j++);
          else if (j > hi) write(k, i++);
          else if (cmpAux(j, i) < 0) write(k, j++);
          else write(k, i++);
        }
        mark('merged', { lo: lo, hi: hi });
      };
      sort(0, n - 1, 1);
      all();
    } else if (algo === 'quick') {
      const med3 = function (i, j, k) {
        if (cmp(i, j) < 0) {
          if (cmp(j, k) < 0) return j;
          return cmp(i, k) < 0 ? k : i;
        }
        if (cmp(i, k) < 0) return i;
        return cmp(j, k) < 0 ? k : j;
      };
      const qs = function (lo, hi, d) {
        if (lo > hi) return;
        if (lo === hi) { mark('done', { lo: lo, hi: lo }); return; }
        if (d > maxDepth) maxDepth = d;
        mark('range', { lo: lo, hi: hi, d: d });
        if (opts.median3 && hi - lo + 1 >= 3) {
          const mid = (lo + hi) >> 1;
          mark('med3', { i: lo, j: mid, k: hi });
          const m = med3(lo, mid, hi);
          mark('med3', { i: -1 });
          swap(m, hi);
        }
        mark('pivot', { i: hi });
        let i = lo - 1;
        mark('ptr', { i: i, j: lo });
        for (let j = lo; j < hi; j++) {
          mark('ptr', { i: i, j: j });
          if (cmp(j, hi) <= 0) { i++; swap(i, j); mark('ptr', { i: i, j: j }); }
        }
        swap(i + 1, hi);
        const p = i + 1;
        mark('pivot', { i: -1 });
        mark('done', { lo: p, hi: p });
        qs(lo, p - 1, d + 1);
        qs(p + 1, hi, d + 1);
      };
      qs(0, n - 1, 1);
      all();
    }

    // 穩定性：排好後，相同的值原本的順序（id）是否仍然遞增；broken = 被顛倒的相同值配對數
    let broken = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) if (vals[a[p]] === vals[a[q]] && a[p] > a[q]) broken++;
    let steps = 0;
    for (let k = 0; k < ops.length; k++) if (ops[k].t === 'cmp' || ops[k].t === 'swap' || ops[k].t === 'write') steps++;
    return {
      algo: algo, n: n, ops: ops, steps: steps, comps: C, swaps: S, writes: W, maxDepth: maxDepth,
      final: a.slice(), sortedVals: a.map(function (id) { return vals[id]; }),
      stable: broken === 0, broken: broken, hasDup: dupCount(vals) > 0
    };
  }
  /** 只要計數（不留步驟），給證明腳本與大量測試用 */
  function count(algo, vals, opts) {
    const r = run(algo, vals, opts);
    return { comps: r.comps, swaps: r.swaps, writes: r.writes, steps: r.steps, maxDepth: r.maxDepth, stable: r.stable, broken: r.broken };
  }

  // =====================================================================
  // 重播：依步驟清單算出「第 k 步之後」的畫面狀態
  // =====================================================================
  /** 一個新的播放狀態（第 0 步：還沒開始） */
  function playState(res) {
    const n = res.n, arr = [];
    for (let i = 0; i < n; i++) arr.push(i);
    return {
      res: res, k: 0, p: 0, arr: arr, aux: null, done: new Array(n).fill(false),
      hl: null, range: null, pivot: -1, min: -1, minRow: -1, key: -1, sortedTo: -1, pass: -1, passHi: n - 1,
      ptr: null, med3: null, copy: null, merged: null, c: 0, s: 0, w: 0
    };
  }
  /** 套用一個紀錄 */
  function applyOp(st, o) {
    switch (o.t) {
      case 'cmp': st.hl = { t: 'cmp', i: o.i, j: o.j, r: o.r, aux: !!o.aux }; break;
      case 'swap': { const v = st.arr[o.i]; st.arr[o.i] = st.arr[o.j]; st.arr[o.j] = v; st.hl = { t: 'swap', i: o.i, j: o.j }; break; }
      case 'write': st.arr[o.k] = st.aux[o.from]; st.hl = { t: 'write', k: o.k, from: o.from }; break;
      case 'pass': st.pass = o.p; st.passHi = o.hi; break;
      case 'min': st.min = o.m; st.minRow = o.i; break;
      case 'key': st.key = o.i; break;
      case 'sorted': st.sortedTo = o.k; break;
      case 'range': st.range = { lo: o.lo, hi: o.hi, mid: o.mid, d: o.d }; st.merged = null; break;
      case 'copy': { st.aux = st.aux || new Array(st.arr.length).fill(-1); for (let k = o.lo; k <= o.hi; k++) st.aux[k] = st.arr[k]; st.copy = { lo: o.lo, hi: o.hi, mid: o.mid }; break; }
      case 'ptr': st.ptr = { i: o.i, j: o.j, k: o.k }; break;
      case 'merged': st.merged = { lo: o.lo, hi: o.hi }; st.copy = null; st.ptr = null; break;
      case 'pivot': st.pivot = o.i; if (o.i < 0) st.ptr = null; break;
      case 'med3': st.med3 = o.i >= 0 ? [o.i, o.j, o.k] : null; break;
      case 'done': for (let k = o.lo; k <= o.hi; k++) st.done[k] = true; if (o.lo === 0 && o.hi === st.arr.length - 1) { st.range = null; st.ptr = null; st.pivot = -1; st.min = -1; st.key = -1; st.copy = null; st.merged = null; } break;
    }
    if (o.c != null) { st.c = o.c; st.s = o.s; st.w = o.w; }
  }
  function isBasic(o) { return o.t === 'cmp' || o.t === 'swap' || o.t === 'write'; }
  /** 往前走一步：套用標記直到（含）下一個基本操作；走到最後一步時把尾端的標記也套用。回傳這一步的基本操作（沒有了就回傳 null） */
  function stepForward(st) {
    const ops = st.res.ops;
    let basic = null;
    while (st.p < ops.length) {
      const o = ops[st.p++];
      applyOp(st, o);
      if (isBasic(o)) { basic = o; break; }
    }
    if (basic) st.k++;
    if (st.k >= st.res.steps) { while (st.p < ops.length) applyOp(st, ops[st.p++]); st.hl = null; }
    return basic;
  }
  /** 從頭重播到第 k 步 */
  function seek(res, k) {
    const st = playState(res);
    k = Math.max(0, Math.min(res.steps, k));
    while (st.k < k) if (!stepForward(st)) break;
    return st;
  }

  /** 數字的精簡寫法（千分位） */
  function fmtInt(v) { return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  const api = {
    MIN_N: MIN_N, MAX_N: MAX_N, CUSTOM_MIN: CUSTOM_MIN, CUSTOM_MAX: CUSTOM_MAX, VAL_MAX: VAL_MAX, FEW_K: FEW_K,
    ALGOS: ALGOS, SHAPES: SHAPES,
    rng: rng, makeData: makeData, parseCustom: parseCustom,
    inversions: inversions, cycles: cycles, isSorted: isSorted, isStrictlyDecreasing: isStrictlyDecreasing, distinct: distinct, dupCount: dupCount,
    ceilLog2: ceilLog2, half: half, mergeWorst: mergeWorst, mergeWorstRec: mergeWorstRec, mergeWrites: mergeWrites, mergeBest: mergeBest,
    quickMin: quickMin, compBounds: compBounds, quickBestData: quickBestData, mergeWorstData: mergeWorstData,
    run: run, count: count, playState: playState, applyOp: applyOp, isBasic: isBasic, stepForward: stepForward, seek: seek,
    fmtInt: fmtInt
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SortingCore = api;
})(typeof window !== 'undefined' ? window : this);
