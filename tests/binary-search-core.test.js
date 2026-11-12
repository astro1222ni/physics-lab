// 以 Node 執行：node tests/binary-search-core.test.js
'use strict';
const assert = require('assert');
const B = require('../js/binary-search-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（容許 ${tol}），得到 ${a}`);
}
const range = n => Array.from({ length: n }, (_, i) => i);
/** 排好的不重複資料 0, 2, 4, …（空隙是奇數） */
const evens = n => range(n).map(i => 2 * i);

console.log('資料');
test('排好的：嚴格遞增、相鄰相差 1 到 3；同一個種子 n 變大只是在後面加卡片', () => {
  for (const seed of [1, 7, 12345, 99991]) {
    const big = B.makeData(seed, 1023, 'sorted').a;
    for (let i = 1; i < big.length; i++) { const d = big[i] - big[i - 1]; assert.ok(d >= 1 && d <= 3, `相差 ${d}`); }
    for (const n of [4, 20, 40, 300]) assert.deepStrictEqual(B.makeData(seed, n, 'sorted').a, big.slice(0, n));
  }
});
test('有重複：不遞減、真的有重複；沒排序：和排好的是同一批數字，而且一定不是排好的', () => {
  for (let seed = 1; seed <= 300; seed++) {
    for (const n of [4, 5, 20, 63]) {
      const d = B.makeData(seed, n, 'dups').a;
      for (let i = 1; i < n; i++) assert.ok(d[i] >= d[i - 1]);
      const s = B.makeData(seed, n, 'sorted').a, u = B.makeData(seed, n, 'unsorted').a;
      assert.deepStrictEqual(u.slice().sort((x, y) => x - y), s);
      assert.ok(!B.isSortedAsc(u), `種子 ${seed}、n = ${n} 打亂後仍是排好的`);
    }
  }
  let dupSeen = 0;
  for (let seed = 1; seed <= 50; seed++) { const d = B.makeData(seed, 20, 'dups').a; if (new Set(d).size < d.length) dupSeen++; }
  assert.ok(dupSeen >= 49, '幾乎每組「有重複」的資料都要有重複的值');
});
test('隨機挑「有的」一定在陣列裡、「沒有的」一定不在', () => {
  const r = B.rng(3);
  for (let k = 0; k < 500; k++) {
    const d = B.makeData(k + 1, 4 + (k % 60), ['sorted', 'dups', 'unsorted'][k % 3]).a;
    assert.ok(d.indexOf(B.randomPresent(d, r)) >= 0);
    assert.ok(d.indexOf(B.randomAbsent(d, r)) < 0);
  }
});

console.log('線性搜尋');
test('找到第 i 張要比 i + 1 次、找不到要比 n 次；有重複時找到第一個', () => {
  const a = evens(25);
  for (let i = 0; i < 25; i++) assert.deepStrictEqual(B.linearSearch(a, 2 * i), { found: i, cmp: i + 1 });
  assert.deepStrictEqual(B.linearSearch(a, 7), { found: -1, cmp: 25 });
  assert.deepStrictEqual(B.linearSearch([1, 3, 3, 3, 5], 3), { found: 1, cmp: 2 });
});
test('平均（找得到、每個數機會相同）＝ (n + 1)/2', () => {
  for (const n of [4, 7, 100, 1023]) {
    const a = evens(n);
    let s = 0; a.forEach(t => { s += B.linearSearch(a, t).cmp; });
    close(s / n, B.avgLinearSuccess(n), 1e-12);
  }
});

console.log('二分搜尋');
test('排好的資料：每個數都找得到、每個空隙都回報找不到（n = 1 到 300 全部檢查）', () => {
  for (let n = 1; n <= 300; n++) {
    const a = evens(n);
    for (let i = 0; i < n; i++) assert.strictEqual(B.binarySearch(a, 2 * i, false).found, i);
    for (let j = -1; j < n; j++) assert.strictEqual(B.binarySearch(a, 2 * j + 1, false).found, -1);
  }
});
test('最壞情況恰好 ⌊log₂ n⌋ + 1 次（n = 1 到 1023 暴力找遍所有數與空隙）', () => {
  for (let n = 1; n <= 1023; n++) {
    const a = evens(n);
    let mx = 0;
    for (let t = -1; t <= 2 * n - 1; t++) mx = Math.max(mx, B.binarySearch(a, t, false).cmp);
    assert.strictEqual(mx, Math.floor(Math.log2(n)) + 1, `n = ${n}`);
    assert.strictEqual(B.worst(n), mx);
  }
});
test('找不到時比 ⌊log₂ n⌋ 或 ⌊log₂ n⌋ + 1 次；n = 2^k − 1 時一律 k 次', () => {
  for (let n = 1; n <= 1023; n++) {
    const a = evens(n), f = Math.floor(Math.log2(n));
    const cs = new Set();
    for (let j = -1; j < n; j++) cs.add(B.binarySearch(a, 2 * j + 1, false).cmp);
    cs.forEach(c => assert.ok(c === f || c === f + 1, `n = ${n} 找不到比了 ${c} 次`));
    if (B.isPerfect(n)) assert.deepStrictEqual([...cs], [f + 1], `n = ${n}`);
    else assert.strictEqual(cs.size, 2, `n = ${n} 應該兩種次數都有`);
  }
});
test('mid = ⌊(lo + hi)/2⌋，範圍每次至少縮成一半（剩下 ≤ ⌊(hi − lo + 1)/2⌋ 張）', () => {
  const a = evens(1000);
  for (let t = -1; t < 2000; t += 7) {
    const r = B.binarySearch(a, t, false);
    r.path.forEach((p, k) => {
      assert.strictEqual(p.mid, Math.floor((p.lo + p.hi) / 2));
      const nx = r.path[k + 1];
      if (nx) assert.ok(nx.hi - nx.lo + 1 <= Math.floor((p.hi - p.lo + 1) / 2));
    });
  }
});
test('「找第一個出現的位置」：等於下界（第一個 ≥ 目標的位置），從不提早結束', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const d = B.makeData(seed, 4 + (seed % 70), 'dups').a, n = d.length;
    for (let t = d[0] - 1; t <= d[n - 1] + 1; t++) {
      const r = B.binarySearch(d, t, true);
      const oc = B.occurrences(d, t);
      assert.strictEqual(r.found, oc.first, `種子 ${seed} 目標 ${t}`);
      const f = Math.floor(Math.log2(n));
      assert.ok(r.cmp === f || r.cmp === f + 1, '找第一個的版本一律走到底');
      let lb = 0; while (lb < n && d[lb] < t) lb++;
      assert.strictEqual(r.lo, lb, '結束時 lo 就是下界（插入位置）');
    }
  }
});
test('單步執行器與一次完成的結果、比較次數完全相同（含沒排序、有重複、找第一個）', () => {
  for (let seed = 1; seed <= 120; seed++) {
    const kind = B.KINDS[seed % 3], d = B.makeData(seed, 4 + (seed * 13) % 200, kind).a;
    for (const first of [false, true]) {
      for (const t of [d[0], d[d.length - 1], d[Math.floor(d.length / 3)], -2, 99999, d[1] + 1]) {
        const s = B.runAll(B.stepper(d, t, first));
        const L = B.linearSearch(d, t), R = B.binarySearch(d, t, first);
        assert.strictEqual(s.lin.found, L.found); assert.strictEqual(s.lin.cmp, L.cmp);
        assert.strictEqual(s.bin.found, R.found); assert.strictEqual(s.bin.cmp, R.cmp);
        assert.strictEqual(s.steps, Math.max(L.cmp, R.cmp), '每一步兩邊各比一次');
      }
    }
  }
});
test('沒排序時二分搜尋可能漏找（反例），線性搜尋一定找到', () => {
  const a = [5, 1, 9, 3, 7];   // mid = 2 → 9；找 7：7 < 9 往左，只剩 5、1，漏掉
  assert.strictEqual(B.binarySearch(a, 7, false).found, -1);
  assert.strictEqual(B.linearSearch(a, 7).found, 4);
  for (let seed = 1; seed <= 50; seed++) {
    const d = B.makeData(seed, 31, 'unsorted').a;
    d.forEach((t, i) => assert.strictEqual(B.linearSearch(d, t).found, i));
    assert.strictEqual(B.binarySearch(d, d[15], false).cmp, 1, '中間那張一定第一次就找到');
  }
});

console.log('決策樹');
test('樹高 = ⌊log₂ n⌋ + 1；中序走訪 = 0, 1, …, n − 1（二元搜尋樹）；節點深度 + 1 = 找它的比較次數', () => {
  for (let n = 1; n <= 1023; n++) {
    const T = B.tree(n);
    assert.strictEqual(T.height, B.worst(n));
    const order = [];
    (function walk(i) { if (i < 0) return; walk(T.left[i]); order.push(i); walk(T.right[i]); })(T.root);
    assert.deepStrictEqual(order, range(n));
    if (n <= 200 || n % 97 === 0) {
      const a = evens(n);
      for (let i = 0; i < n; i++) assert.strictEqual(B.binarySearch(a, 2 * i, false).cmp, T.depth[i] + 1);
      T.ext.forEach((e, j) => { assert.strictEqual(e.after, j - 1); assert.strictEqual(B.binarySearch(a, 2 * (j - 1) + 1, false).cmp, e.depth); });
    }
  }
});
test('n = 2^k − 1 時每一層都排滿（第 d 層 2^d 個）；外部路徑長 E = I + 2n（Knuth 2.3.4.5）', () => {
  for (let n = 1; n <= 1023; n++) {
    const T = B.tree(n);
    assert.strictEqual(T.ext.length, n + 1);
    assert.strictEqual(T.E, T.I + 2 * n, `n = ${n}`);
    assert.strictEqual(T.I, B.internalPathLength(n));
    const per = {};
    T.depth.forEach(d => { per[d] = (per[d] || 0) + 1; });
    const full = Object.keys(per).every(d => per[d] === Math.pow(2, +d));
    assert.strictEqual(full, B.isPerfect(n), `n = ${n}`);
  }
});
test('平均比較次數：n = 2^k − 1 時找得到 = (k − 1) + k/n、找不到 = k；大 n 時約 log₂ n − 1', () => {
  for (let k = 1; k <= 10; k++) {
    const n = Math.pow(2, k) - 1;
    close(B.avgBinarySuccess(n), (k - 1) + k / n, 1e-12, `k = ${k}`);
    close(B.avgBinaryFail(n), k, 1e-12);
  }
  close(B.avgBinarySuccess(1023), Math.log2(1023) - 1, 0.03);
  // 和 Knuth 6.2.1 的封閉式相同：找得到 ⌊lg n⌋ + 1 − (2^(⌊lg n⌋+1) − ⌊lg n⌋ − 2)/n
  for (let n = 1; n <= 1023; n++) {
    const f = Math.floor(Math.log2(n));
    close(B.avgBinarySuccess(n), f + 1 - (Math.pow(2, f + 1) - f - 2) / n, 1e-9, `n = ${n}`);
  }
});
test('「每個目標都找一次」的平均和公式一致；n = 1023 時線性平均是二分的 56 倍以上', () => {
  for (const n of [4, 20, 31, 100, 1023]) {
    const e = B.sweepEvent(B.makeData(5, n, 'sorted'), false);
    close(e.linAvg, B.avgLinearSuccess(n), 1e-12);
    close(e.binAvg, B.avgBinarySuccess(n), 1e-12);
    close(e.failAvg, B.avgBinaryFail(n), 1e-12);
    assert.strictEqual(e.binMax, B.worst(n));
    assert.strictEqual(e.binFound, n);
    assert.strictEqual(e.failMin === e.failMax, B.isPerfect(n));
  }
  assert.ok(B.sweepEvent(B.makeData(5, 1023, 'sorted'), false).ratio > 56);
});

console.log('猜數字');
test('最佳保證次數 ⌈log₂(N + 1)⌉：用極小化極大（minimax）暴力算 N = 1 到 300 對照', () => {
  const f = [0];
  for (let s = 1; s <= 300; s++) {
    let best = Infinity;
    for (let g = 1; g <= s; g++) best = Math.min(best, 1 + Math.max(f[g - 1], f[s - g]));
    f.push(best);
    assert.strictEqual(best, Math.ceil(Math.log2(s + 1)), `N = ${s}`);
    assert.strictEqual(B.guessOptimal(s), best);
  }
});
test('耍賴的電腦：每次猜中間剛好用最佳次數；一直猜最小的那個數要猜滿 N 次', () => {
  const r = B.rng(9);
  for (let N = 2; N <= 1000; N++) {
    const g = B.newGame(N, true, r);
    assert.strictEqual(B.playMidpoints(g, r), B.guessOptimal(N), `N = ${N}`);
    assert.strictEqual(g.wasted, 0);
  }
  for (const N of [10, 37, 100]) {
    const g = B.newGame(N, true, r);
    while (!g.done) B.guess(g, g.lo, r);
    assert.strictEqual(g.guesses, N);
  }
});
test('耍賴的電腦：不是二分的猜法用的次數一定 ≥ 最佳次數（隨機策略 2000 局）', () => {
  const r = B.rng(11);
  for (let k = 0; k < 2000; k++) {
    const N = 10 + Math.floor(r() * 991);
    const g = B.newGame(N, true, r);
    while (!g.done) B.guess(g, g.lo + Math.floor(r() * (g.hi - g.lo + 1)), r);
    assert.ok(g.guesses >= B.guessOptimal(N));
  }
});
test('一般模式：答案在 1 到 N、回答誠實；二分法一定在 ⌈log₂(N + 1)⌉ 次以內猜中', () => {
  const r = B.rng(13);
  for (let k = 0; k < 3000; k++) {
    const N = 10 + Math.floor(r() * 991);
    const g = B.newGame(N, false, r);
    const secret = g.secret;
    assert.ok(secret >= 1 && secret <= N);
    const n = B.playMidpoints(g, r);
    assert.ok(n <= B.guessOptimal(N));
    assert.strictEqual(g.secret, secret);
    g.history.forEach(h => {
      if (h.result === 'low') assert.ok(h.x < secret);
      if (h.result === 'high') assert.ok(h.x > secret);
    });
  }
});

console.log('任務事件');
test('搜尋摘要：有重複時一般版停的位置、第一個位置、出現次數', () => {
  const data = { a: [1, 2, 2, 2, 2, 3, 5], kind: 'dups' };
  const e = B.searchEvent(data, 2, true);
  assert.strictEqual(e.count, 4); assert.strictEqual(e.firstIdx, 1); assert.strictEqual(e.lastIdx, 4);
  assert.strictEqual(e.plainIdx, 3); assert.strictEqual(e.plainCmp, 1);
  assert.strictEqual(e.binFound, 1); assert.ok(e.binOk);
  assert.strictEqual(e.linFound, 1); assert.strictEqual(e.linCmp, 2);
  assert.strictEqual(e.worst, 3);
});

console.log(`\n${passed} 項通過${process.exitCode ? '，有失敗' : ''}。`);
