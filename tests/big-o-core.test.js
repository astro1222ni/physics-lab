// 以 Node 執行：node tests/big-o-core.test.js
'use strict';
const assert = require('assert');
const B = require('../js/big-o-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const isSortedAsc = a => a.every((v, i) => i === 0 || a[i - 1] <= v);

console.log('五個小演算法的計數公式');
test('循序搜尋找不在資料裡的數：n = 1 到 1000 都比 n 次', () => {
  for (let n = 1; n <= 1000; n++) {
    const a = Array.from({ length: n }, (_, i) => i + 1);
    const r = B.linearSearch(a, n + 1);
    assert.strictEqual(r.count, n); assert.strictEqual(r.found, -1);
  }
});
test('二分搜尋：每一個目標（有的數與每個空隙）裡最多的比較次數 = ⌊log2 n⌋ + 1（n = 1 到 300 全部試）；找 n + 1 時剛好是最壞情況', () => {
  for (let n = 1; n <= 300; n++) {
    const a = Array.from({ length: n }, (_, i) => 2 * (i + 1));
    let worst = 0;
    for (let t = 1; t <= 2 * n + 1; t++) worst = Math.max(worst, B.binarySearch(a, t).count);
    assert.strictEqual(worst, Math.floor(Math.log2(n)) + 1, 'n = ' + n);
    assert.strictEqual(B.bitLen(n), worst);
  }
  for (let n = 1; n <= 1000; n++) {
    const a = Array.from({ length: n }, (_, i) => i + 1);
    assert.strictEqual(B.binarySearch(a, n + 1).count, B.formula.binary(n), 'n = ' + n);
  }
});
test('二分搜尋的軌跡：mid = ⌊(lo + hi)/2⌋，每次範圍至少砍掉一半', () => {
  const a = Array.from({ length: 1000 }, (_, i) => i + 1);
  const r = B.binarySearch(a, 1001);
  r.trace.forEach(s => {
    assert.strictEqual(s.mid, Math.floor((s.lo + s.hi) / 2));
    const before = s.hi - s.lo + 1, after = Math.max(0, s.hi2 - s.lo2 + 1);
    assert.ok(after <= Math.floor(before / 2));
  });
});
test('雙層迴圈兩兩比較：次數 = n(n − 1)/2（n = 1 到 400 全部、另抽 1000）；pairAt 列出的順序和迴圈一樣', () => {
  for (const n of Array.from({ length: 400 }, (_, i) => i + 1).concat([999, 1000])) {
    const a = B.makeData(n, 'random', 7);
    assert.strictEqual(B.pairs(a).count, n * (n - 1) / 2);
    assert.strictEqual(B.formula.pairs(n), n * (n - 1) / 2);
  }
  for (const n of [2, 3, 7, 12, 40]) {
    let k = 0;
    for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) { k++; assert.deepStrictEqual(B.pairAt(n, k), { i: i, j: j }); }
  }
});
test('合併排序：一定排好；比較次數不超過上界 n⌈log2 n⌉ − 2^⌈log2 n⌉ + 1（n = 1 到 1000，三種資料、隨機再換 5 個種子）', () => {
  for (let n = 1; n <= 1000; n++) {
    const bound = B.formula.merge(n);
    const k = n <= 1 ? 0 : Math.ceil(Math.log2(n));
    assert.strictEqual(bound, n <= 1 ? 0 : n * k - Math.pow(2, k) + 1);
    for (const shape of B.SHAPES) {
      for (const seed of shape === 'random' && n <= 300 ? [1, 2, 3, 4, 5] : [1113]) {
        const r = B.mergeSort(B.makeData(n, shape, seed));
        assert.ok(isSortedAsc(r.sorted), '沒有排好');
        assert.ok(r.count <= bound, `n = ${n} ${shape}：${r.count} > ${bound}`);
      }
    }
  }
});
test('合併排序的最壞情況資料剛好比到上界；上界滿足 W(n) = W(⌈n/2⌉) + W(⌊n/2⌋) + n − 1', () => {
  for (let n = 1; n <= 1000; n++) {
    const d = B.makeData(n, 'worst', 0);
    assert.deepStrictEqual(d.slice().sort((x, y) => x - y), Array.from({ length: n }, (_, i) => i + 1), '要是 1..n 的排列');
    assert.strictEqual(B.mergeSort(d).count, B.formula.merge(n), 'n = ' + n);
    if (n >= 2) assert.strictEqual(B.formula.merge(n), B.formula.merge(Math.ceil(n / 2)) + B.formula.merge(Math.floor(n / 2)) + n - 1);
  }
});
test('合併排序的已排好資料：每次合併只比左半的長度；n = 2^k 時剛好是 n·k/2', () => {
  for (let n = 1; n <= 1000; n++) assert.strictEqual(B.mergeSort(B.makeData(n, 'sorted', 0)).count, B.mergeSortedCount(n), 'n = ' + n);
  for (let k = 1; k <= 9; k++) { const n = Math.pow(2, k); assert.strictEqual(B.mergeSortedCount(n), n * k / 2); }
});
test('合併排序的重播：做了 k 次比較後仍是同一批數；k = 全部時就是排好的結果', () => {
  for (const n of [5, 12, 33, 100]) {
    const d = B.makeData(n, 'random', 99), r = B.mergeSort(d);
    for (let k = 0; k <= r.count; k += Math.max(1, Math.floor(r.count / 17))) {
      const s = B.mergeState(d, r.merges, k);
      assert.deepStrictEqual(s.arr.slice().sort((x, y) => x - y), d.slice().sort((x, y) => x - y));
    }
    assert.deepStrictEqual(B.mergeState(d, r.merges, r.count).arr, r.sorted);
  }
});
test('隨機資料剛好碰上最壞情況的機率：n = 8 為 (2/3)²·(4/7)，n = 16 約 3.4%（全部 8! 種排列與抽樣對照）', () => {
  // n = 8：全部 40320 種排列
  const perm = [1, 2, 3, 4, 5, 6, 7, 8];
  let tot = 0, hit = 0;
  (function p(k) {
    if (k === perm.length) { tot++; if (B.mergeSort(perm).count === B.formula.merge(8)) hit++; return; }
    for (let i = k; i < perm.length; i++) { [perm[k], perm[i]] = [perm[i], perm[k]]; p(k + 1); [perm[k], perm[i]] = [perm[i], perm[k]]; }
  })(0);
  assert.ok(Math.abs(hit / tot - (4 / 9) * (4 / 7)) < 1e-12, `${hit}/${tot}`);
  let h16 = 0;
  for (let s = 1; s <= 20000; s++) if (B.mergeSort(B.makeData(16, 'random', s)).count === B.formula.merge(16)) h16++;
  const p16 = Math.pow(2 / 3, 4) * Math.pow(4 / 7, 2) * (8 / 15);
  assert.ok(Math.abs(h16 / 20000 - p16) < 0.004, `抽樣 ${h16 / 20000}，理論 ${p16}`);
});
test('列出所有子集合：真的列出 2^n 個（n = 0 到 20）；能湊到的目標，命中數和暴力法相同', () => {
  for (let n = 1; n <= 20; n++) {
    const v = B.makeData(n, 'random', 3);
    const tot = v.reduce((s, x) => s + x, 0);
    assert.strictEqual(B.subsets(v, tot + 1).count, Math.pow(2, n));
    assert.strictEqual(B.subsets(v, tot + 1).hits, 0);
  }
  for (const n of [3, 6, 10]) {
    const v = B.makeData(n, 'random', 5), t = Math.floor(n * (n + 1) / 4);
    let brute = 0;
    for (let m = 0; m < (1 << n); m++) { let s = 0; for (let i = 0; i < n; i++) if (m >> i & 1) s += v[i]; if (s === t) brute++; }
    assert.strictEqual(B.subsets(v, t).hits, brute);
  }
});
test('一次完整的執行：n ≤ 20 子集合真的列，n > 20 用公式；五種次數與公式一致', () => {
  for (const n of [1, 2, 3, 12, 20, 21, 55, 1000]) {
    for (const shape of B.SHAPES) {
      const r = B.run(n, shape, 1113);
      assert.strictEqual(r.formula, n > 20);
      assert.strictEqual(r.counts.binary, B.formula.binary(n));
      assert.strictEqual(r.counts.linear, n);
      assert.strictEqual(r.counts.pairs, n * (n - 1) / 2);
      assert.strictEqual(r.counts.subsets, Math.pow(2, n));
      if (shape === 'worst') assert.strictEqual(r.counts.merge, B.formula.merge(n));
      if (shape === 'sorted') assert.strictEqual(r.counts.merge, B.mergeSortedCount(n));
    }
  }
});
test('三方平手：n = 3 的最壞情況，循序搜尋、合併排序、兩兩比較都是 3 次；n ≥ 4 時合併排序（任何資料）都多於 n − 1 而少於 n(n − 1)/2', () => {
  const c = B.run(3, 'worst', 1).counts;
  assert.strictEqual(c.linear, 3); assert.strictEqual(c.merge, 3); assert.strictEqual(c.pairs, 3);
  for (let n = 5; n <= 200; n++) for (const shape of B.SHAPES) { const m = B.run(n, shape, 5).counts.merge; assert.ok(m < n * (n - 1) / 2); }
});

console.log('加倍實驗');
test('n 加倍：二分搜尋剛好多 1 次；循序搜尋 2 倍；兩兩比較 2(2n − 1)/(n − 1) 倍；子集合變成原來次數的平方', () => {
  for (let n = 2; n <= 500; n++) {
    const e = B.doubleEvent(n, 'worst', 1);
    assert.strictEqual(e.diff.binary, 1);
    assert.strictEqual(e.ratio.linear, 2);
    assert.ok(Math.abs(e.ratio.pairs - 2 * (2 * n - 1) / (n - 1)) < 1e-12);
    assert.strictEqual(e.after.subsets, Math.pow(e.before.subsets, 2));
    assert.strictEqual(e.after.merge, 2 * e.before.merge + 2 * n - 1, '最壞情況：W(2n) = 2W(n) + 2n − 1');
  }
  assert.ok(B.doubleEvent(41, 'random', 1).ratio.pairs <= 4.05 && B.doubleEvent(40, 'random', 1).ratio.pairs > 4.05);
});

console.log('每個操作 1 奈秒');
test('時間換算：2^30 ns ≈ 1.07 s；2^54 ns 不到一年、2^55 ns 超過一年；2^60 ns ≈ 36.5 年（1 年 = 365.25 天）', () => {
  const t30 = B.humanTime(Math.pow(2, 30));
  assert.strictEqual(t30.unit, 's'); assert.ok(Math.abs(t30.v - 1.073741824) < 1e-12);
  assert.ok(Math.pow(2, 54) < B.NS.yr && Math.pow(2, 55) >= B.NS.yr);
  const t60 = B.humanTime(Math.pow(2, 60));
  assert.strictEqual(t60.unit, 'yr'); assert.ok(Math.abs(t60.v - 36.53) < 0.01, t60.v);
  assert.deepStrictEqual(B.humanTime(500), { v: 500, unit: 'ns' });
  assert.strictEqual(B.humanTime(499500).unit, 'us');
  assert.strictEqual(B.humanTime(3.6e12).unit, 'h');
});

console.log('常數因子與交叉點');
/** 直接逐一檢查的交叉點（只用於答案不大的情況） */
function bruteCross(fa, a, fb, b, upto) {
  const w = B.RANK[fa] > B.RANK[fb] ? 'A' : 'B', lose = w === 'A' ? 'B' : 'A';
  let lb = 0, ln = 0;
  const eq = [];
  for (let n = 1; n <= upto; n++) { const c = B.cmpAt(fa, a, fb, b, n); if (c === 'eq') { eq.push(n); ln = n; } else if (c === lose) { lb = n; ln = n; } }
  return { cross: lb + 1, crossStrict: ln + 1, equal: eq };
}
test('經典例子：100n 與 n² 在 100 相等；n² 與 2^n 在 2、4 相等，從 5 起 2^n 一直比較大；√n 與 log2 n 在 4、16 相等', () => {
  let x = B.crossover('n', 100, 'n2', 1);
  assert.deepStrictEqual([x.cross, x.crossStrict, x.equal], [100, 101, [100]]);
  x = B.crossover('n2', 1, 'exp2', 1);
  assert.deepStrictEqual([x.winner, x.cross, x.crossStrict, x.equal], ['B', 4, 5, [2, 4]]);
  x = B.crossover('sqrt', 1, 'log', 1);
  assert.deepStrictEqual([x.winner, x.cross, x.equal], ['A', 16, [4, 16]]);
  x = B.crossover('n3', 1, 'exp2', 1);
  assert.deepStrictEqual([x.cross, x.equal], [10, []]);
  assert.strictEqual(B.cmpAt('n3', 1, 'exp2', 1, 1), 'B'); assert.strictEqual(B.cmpAt('n3', 1, 'exp2', 1, 9), 'A'); assert.strictEqual(B.cmpAt('n3', 1, 'exp2', 1, 10), 'B');
});
test('CLRS 習題 1.2-2：8n² 對 64 n lg n，插入排序在 2 ≤ n ≤ 43 比較快；習題 1.2-3：100n² 對 2^n，最小的 n 是 15', () => {
  let x = B.crossover('n2', 8, 'nlogn', 64);
  assert.strictEqual(x.cross, 44);
  for (let n = 2; n <= 43; n++) assert.strictEqual(B.cmpAt('n2', 8, 'nlogn', 64, n), 'B');
  x = B.crossover('n2', 100, 'exp2', 1);
  assert.strictEqual(x.cross, 15);
});
test('n 對 n log2 n：常數比 r 是整數時交叉點剛好是 2^r（r = 1 到 40 精確、r = 1000 時約 1.07 × 10^301）', () => {
  for (let r = 1; r <= 40; r++) {
    const x = B.crossover('n', r, 'nlogn', 1);
    assert.strictEqual(x.cross, Math.pow(2, r), 'r = ' + r);
    assert.ok(x.equal.indexOf(Math.pow(2, r)) >= 0);
  }
  const x = B.crossover('n', 1000, 'nlogn', 1);
  assert.ok(x.approx && Math.abs(Math.log2(x.cross) - 1000) < 1e-9);
});
test('n log2 n 與 n² 剛好相等只會發生在 2 的次方：常數比 = 2^k / k', () => {
  assert.deepStrictEqual(B.crossover('nlogn', 32, 'n2', 3).equal, [64]);
  assert.deepStrictEqual(B.crossover('nlogn', 128, 'n2', 7).equal, [128]);
  assert.deepStrictEqual(B.crossover('nlogn', 32, 'n2', 1).equal, [256]);
  assert.deepStrictEqual(B.crossover('nlogn', 512, 'n2', 9).equal, [512]);
  assert.deepStrictEqual(B.crossover('nlogn', 512, 'n2', 5).equal, [1024]);
  assert.deepStrictEqual(B.crossover('nlogn', 301, 'n2', 3).equal, []);
  assert.strictEqual(B.crossover('nlogn', 301, 'n2', 3).cross, 1000);
  assert.ok(!B.exactEqual('log', 100, 'n', 1, 996) && !B.exactEqual('log', 100, 'n', 1, 997));
});
test('交叉點與逐一檢查一致：8 種函數兩兩配對、常數 1、2、7、30、100、1000 全部組合（答案在 20 萬以內的）', () => {
  const cs = [1, 2, 7, 30, 100, 1000];
  let checked = 0;
  for (const fa of B.FUNCS) for (const fb of B.FUNCS) {
    if (fa === fb) { assert.ok(B.crossover(fa, 3, fb, 5).same); continue; }
    for (const a of cs) for (const b of cs) {
      const x = B.crossover(fa, a, fb, b);
      if (x.approx || x.cross > 200000) continue;
      const y = bruteCross(fa, a, fb, b, Math.max(5000, Math.ceil(x.crossStrict * 1.5) + 10));
      assert.deepStrictEqual([x.cross, x.crossStrict, x.equal], [y.cross, y.crossStrict, y.equal], `${a}·${fa} 對 ${b}·${fb}`);
      checked++;
    }
  }
  assert.ok(checked > 1000);
});
test('精確相等的判斷：沒有 log 的整數函數用 BigInt 驗證；n = 1 時 log2 n = 0', () => {
  assert.ok(B.exactEqual('n2', 4, 'exp2', 1, 8));
  assert.ok(B.exactEqual('n2', 256, 'exp2', 1, 16));
  assert.ok(!B.exactEqual('n2', 255, 'exp2', 1, 16));
  assert.ok(B.exactEqual('fact', 1, 'n3', 1, 1));
  assert.ok(B.exactEqual('log', 5, 'nlogn', 1, 1));   // 都是 0
  assert.ok(B.exactEqual('fact', 1, 'n', 6, 4));       // 24 = 6·4
  assert.ok(!B.exactEqual('sqrt', 1, 'log', 1, 9));
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗' : ''));
