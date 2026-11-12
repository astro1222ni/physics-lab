// 以 Node 執行：node tests/sorting-core.test.js
'use strict';
const assert = require('assert');
const S = require('../js/sorting-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
/** 列出 1..n 的全部排列 */
function perms(n) {
  const out = [], a = [];
  for (let i = 1; i <= n; i++) a.push(i);
  (function rec(k) {
    if (k === n) { out.push(a.slice()); return; }
    for (let i = k; i < n; i++) { [a[k], a[i]] = [a[i], a[k]]; rec(k + 1); [a[k], a[i]] = [a[i], a[k]]; }
  })(0);
  return out;
}
/** 值 1..k、長度 n 的全部資料（有重複） */
function words(n, k) {
  const out = [];
  (function rec(pre) { if (pre.length === n) { out.push(pre.slice()); return; } for (let v = 1; v <= k; v++) { pre.push(v); rec(pre); pre.pop(); } })([]);
  return out;
}
const sortedCopy = a => a.slice().sort((x, y) => x - y);
const half = n => n * (n - 1) / 2;

console.log('每種排序都真的排好');
test('五種排序（快速排序含三數取中）在 n ≤ 7 的全部排列、n ≤ 6 的全部重複資料（值 1–3）都排出正確結果', () => {
  for (let n = 1; n <= 7; n++) for (const p of perms(n)) for (const a of S.ALGOS) {
    assert.deepStrictEqual(S.run(a, p).sortedVals, sortedCopy(p), `${a} ${p}`);
    if (a === 'quick') assert.deepStrictEqual(S.run(a, p, { median3: true }).sortedVals, sortedCopy(p), `quick+med3 ${p}`);
  }
  for (let n = 1; n <= 6; n++) for (const w of words(n, 3)) for (const a of S.ALGOS) {
    assert.deepStrictEqual(S.run(a, w).sortedVals, sortedCopy(w));
    assert.deepStrictEqual(S.run('quick', w, { median3: true }).sortedVals, sortedCopy(w));
  }
});
test('五種形態、n = 5…64、多個種子：排好、步數 = 比較 + 交換 + 寫入', () => {
  for (let n = S.MIN_N; n <= S.MAX_N; n++) for (const sh of ['random', 'nearly', 'reversed', 'few', 'sorted']) for (const seed of [1, 7, 42]) {
    const v = S.makeData(n, sh, seed);
    for (const a of S.ALGOS) for (const m3 of [false, true]) {
      if (m3 && a !== 'quick') continue;
      const r = S.run(a, v, { median3: m3 });
      assert.deepStrictEqual(r.sortedVals, sortedCopy(v));
      assert.strictEqual(r.steps, r.comps + r.swaps + r.writes);
    }
  }
});

console.log('資料形態');
test('已排好、反序、亂序是 1…n 的排列；很多重複只有 1–4；同一個種子得到同一份資料', () => {
  for (let n = S.MIN_N; n <= S.MAX_N; n++) {
    assert.deepStrictEqual(S.makeData(n, 'sorted', 3), Array.from({ length: n }, (_, i) => i + 1));
    assert.deepStrictEqual(S.makeData(n, 'reversed', 3), Array.from({ length: n }, (_, i) => n - i));
    assert.deepStrictEqual(sortedCopy(S.makeData(n, 'random', 5)), Array.from({ length: n }, (_, i) => i + 1));
    assert.deepStrictEqual(sortedCopy(S.makeData(n, 'nearly', 5)), Array.from({ length: n }, (_, i) => i + 1));
    assert.ok(S.makeData(n, 'few', 9).every(v => v >= 1 && v <= S.FEW_K));
    assert.deepStrictEqual(S.makeData(n, 'random', 11), S.makeData(n, 'random', 11));
    assert.ok(S.dupCount(S.makeData(n, 'few', 9)) > 0, '很多重複一定有重複的值');
  }
  assert.notDeepStrictEqual(S.makeData(24, 'random', 1), S.makeData(24, 'random', 2));
});
test('幾乎排好：逆序數 ≥ 1，而且很小（相鄰交換 round(n/8) 次，最多這麼多個逆序）', () => {
  for (let n = S.MIN_N; n <= S.MAX_N; n++) for (let s = 1; s <= 30; s++) {
    const inv = S.inversions(S.makeData(n, 'nearly', s));
    assert.ok(inv >= 1 && inv <= Math.max(1, Math.round(n / 8)), `n=${n} s=${s} inv=${inv}`);
  }
});
test('自訂資料：抓出 1–99 的整數，太少、太多、超出範圍都會回報', () => {
  assert.deepStrictEqual(S.parseCustom('5, 2 8，2；9 1'), { values: [5, 2, 8, 2, 9, 1], error: '' });
  assert.deepStrictEqual(S.parseCustom('７ ８ ９'), { values: [7, 8, 9], error: '' }); // 全形數字
  assert.strictEqual(S.parseCustom('42').error, 'few');
  assert.strictEqual(S.parseCustom('').error, 'few');
  assert.strictEqual(S.parseCustom('1 2 300 4').error, 'range');
  assert.deepStrictEqual(S.parseCustom('1 2 300 4').values, [1, 2, 4]);
  assert.strictEqual(S.parseCustom('1 -2 3').error, 'range');
  assert.strictEqual(S.parseCustom('1.5 2 3').error, 'range');
  assert.strictEqual(S.parseCustom(Array(70).fill(3).join(' ')).error, 'many');
  assert.strictEqual(S.parseCustom(Array(70).fill(3).join(' ')).values.length, 64);
  assert.strictEqual(S.parseCustom('x'.repeat(5000)).error, 'many');
});

console.log('比較次數與交換次數（對照教科書的公式）');
test('泡沫排序：最多 n(n − 1)/2 次比較；已排好時只比 n − 1 次（一輪沒交換就結束）；交換次數 = 逆序數', () => {
  for (let n = 1; n <= 7; n++) {
    let mx = 0;
    for (const p of perms(n)) { const r = S.count('bubble', p); mx = Math.max(mx, r.comps); assert.strictEqual(r.swaps, S.inversions(p)); }
    assert.strictEqual(mx, half(n));
  }
  for (let n = S.MIN_N; n <= S.MAX_N; n++) {
    assert.strictEqual(S.count('bubble', S.makeData(n, 'sorted', 1)).comps, n - 1);
    assert.strictEqual(S.count('bubble', S.makeData(n, 'reversed', 1)).comps, half(n));
  }
});
test('選擇排序：比較次數永遠是 n(n − 1)/2；交換次數 = n − 循環數（最多 n − 1，反序只要 ⌊n/2⌋）', () => {
  for (let n = 1; n <= 7; n++) for (const p of perms(n)) {
    const r = S.count('selection', p);
    assert.strictEqual(r.comps, half(n));
    assert.strictEqual(r.swaps, n - S.cycles(p), `${p}`);
  }
  for (let n = S.MIN_N; n <= S.MAX_N; n++) {
    assert.strictEqual(S.count('selection', S.makeData(n, 'reversed', 1)).swaps, Math.floor(n / 2));
    const rot = Array.from({ length: n }, (_, i) => (i + 1) % n + 1); // 2, 3, …, n, 1：一個 n 循環
    assert.strictEqual(S.count('selection', rot).swaps, n - 1);
  }
});
test('插入排序：n − 1 ≤ 比較 ≤ n(n − 1)/2；交換 = 逆序數；比較次數永遠不超過泡沫排序', () => {
  for (let n = 1; n <= 7; n++) {
    let mn = Infinity, mx = 0;
    for (const p of perms(n)) {
      const r = S.count('insertion', p);
      mn = Math.min(mn, r.comps); mx = Math.max(mx, r.comps);
      assert.strictEqual(r.swaps, S.inversions(p));
      assert.ok(r.comps <= S.count('bubble', p).comps, `${p}`);
      // 比較次數 = 逆序數 + (n − 1) − 一路換到最前面的次數
      let z = 0; for (let i = 1; i < n; i++) if (p.slice(0, i).every(x => x > p[i])) z++;
      assert.strictEqual(r.comps, S.inversions(p) + n - 1 - z);
    }
    if (n >= 2) { assert.strictEqual(mn, n - 1); assert.strictEqual(mx, half(n)); }
  }
  for (let n = 2; n <= 6; n++) for (const w of words(n, 3)) assert.ok(S.count('insertion', w).comps <= S.count('bubble', w).comps);
});
test('泡沫與插入的比較次數相等的特例：[n, 1, 2, …, n − 1] 都是 2n − 3', () => {
  for (let n = 3; n <= S.MAX_N; n++) {
    const a = [n].concat(Array.from({ length: n - 1 }, (_, i) => i + 1));
    assert.strictEqual(S.count('bubble', a).comps, 2 * n - 3);
    assert.strictEqual(S.count('insertion', a).comps, 2 * n - 3);
  }
});
test('合併排序：最壞比較次數 = n⌈log2 n⌉ − 2^⌈log2 n⌉ + 1（窮舉 n ≤ 8，並與遞迴式對照到 64）', () => {
  for (let n = 1; n <= 8; n++) {
    let mx = 0, mn = Infinity;
    for (const p of perms(n)) { const c = S.count('merge', p).comps; mx = Math.max(mx, c); mn = Math.min(mn, c); }
    assert.strictEqual(mx, S.mergeWorst(n), `n=${n}`);
    assert.strictEqual(mn, S.mergeBest(n), `n=${n} 最少`);
  }
  for (let n = 1; n <= 200; n++) assert.strictEqual(S.mergeWorst(n), S.mergeWorstRec(n));
  for (let n = S.MIN_N; n <= S.MAX_N; n++) assert.strictEqual(S.count('merge', S.mergeWorstData(n)).comps, S.mergeWorst(n));
  assert.strictEqual(S.mergeWorst(64), 321);
  assert.strictEqual(S.mergeWorst(10), 25);
});
test('合併排序：寫入次數與資料無關，= n⌈log2 n⌉ − 2^⌈log2 n⌉ + n（2 的冪時 = n log2 n）；遞迴深度 = ⌈log2 n⌉', () => {
  for (let n = S.MIN_N; n <= S.MAX_N; n++) for (const sh of ['random', 'reversed', 'few', 'sorted']) {
    const r = S.count('merge', S.makeData(n, sh, 3));
    assert.strictEqual(r.writes, S.mergeWrites(n));
    assert.strictEqual(r.maxDepth, S.ceilLog2(n));
    assert.strictEqual(r.swaps, 0);
  }
  [8, 16, 32, 64].forEach(n => assert.strictEqual(S.mergeWrites(n), n * Math.log2(n)));
});
test('合併排序：已排好時每次合併比 ⌈m/2⌉ 次、反序時 ⌊m/2⌋ 次（n 不是 2 的冪時反序比較少）', () => {
  const mergeSorted = n => n <= 1 ? 0 : mergeSorted(Math.ceil(n / 2)) + mergeSorted(Math.floor(n / 2)) + Math.ceil(n / 2);
  for (let n = S.MIN_N; n <= S.MAX_N; n++) {
    const a = S.count('merge', S.makeData(n, 'sorted', 1)).comps, b = S.count('merge', S.makeData(n, 'reversed', 1)).comps;
    assert.strictEqual(a, mergeSorted(n));
    assert.strictEqual(b, S.mergeBest(n));
    if ((n & (n - 1)) === 0) assert.strictEqual(a, b); else assert.ok(b < a, `n=${n}`);
  }
});
test('快速排序（Lomuto、最後一個當樞紐）：已排好與反序退化成 n(n − 1)/2，遞迴深度 n − 1', () => {
  for (let n = S.MIN_N; n <= S.MAX_N; n++) for (const sh of ['sorted', 'reversed']) {
    const r = S.count('quick', S.makeData(n, sh, 1));
    assert.strictEqual(r.comps, half(n), `${sh} n=${n}`);
    assert.strictEqual(r.maxDepth, n - 1);
  }
  for (let n = 2; n <= 40; n++) assert.strictEqual(S.count('quick', Array(n).fill(7)).comps, half(n), '全部相同的值也退化');
});
test('快速排序＋三數取中：最多 n(n − 1)/2 + 3(n − 2) 次（窮舉 n ≤ 8、值 1–4 的所有資料），全部相同時剛好達到', () => {
  function* all(n, k) { const a = Array(n).fill(1); for (;;) { yield a.slice(); let i = n - 1; while (i >= 0 && a[i] === k) { a[i] = 1; i--; } if (i < 0) return; a[i]++; } }
  for (let n = 2; n <= 8; n++) {
    let mx = 0;
    for (const v of all(n, Math.min(n, 4))) mx = Math.max(mx, S.count('quick', v, { median3: true }).comps);
    assert.strictEqual(mx, S.compBounds('quick', n, true).max, 'n = ' + n);
  }
  for (const n of [5, 24, 64]) assert.strictEqual(S.count('quick', Array(n).fill(7), { median3: true }).comps, S.half(n) + 3 * (n - 2));
  // 不勾三數取中時最多就是 n(n − 1)/2（全部相同也一樣）
  for (const n of [5, 24, 64]) assert.strictEqual(S.count('quick', Array(n).fill(7)).comps, S.half(n));
});
test('快速排序最少的比較次數：窮舉 n ≤ 8 等於 C(n) = n − 1 + C(⌊(n−1)/2⌋) + C(⌈(n−1)/2⌉)，構造的資料達到它', () => {
  for (let n = 1; n <= 8; n++) {
    let mn = Infinity;
    for (const p of perms(n)) mn = Math.min(mn, S.count('quick', p).comps);
    assert.strictEqual(mn, S.quickMin(n), `n=${n}`);
  }
  // 兩邊大小的最佳分法：C 是凸的，所以平分最好（對所有分法取最小值的動態規劃）
  const dp = [0, 0];
  for (let m = 2; m <= 64; m++) { let b = Infinity; for (let a = 0; a <= m - 1; a++) b = Math.min(b, dp[a] + dp[m - 1 - a]); dp[m] = m - 1 + b; }
  for (let n = 1; n <= 64; n++) assert.strictEqual(S.quickMin(n), dp[n]);
  for (let n = 1; n <= S.MAX_N; n++) {
    const d = S.quickBestData(n);
    assert.deepStrictEqual(sortedCopy(d), Array.from({ length: n }, (_, i) => i + 1));
    assert.strictEqual(S.count('quick', d).comps, S.quickMin(n), `n=${n}`);
  }
  assert.strictEqual(S.quickMin(15), 34);
});
test('三數取中：已排好的資料不再退化（n ≥ 32 時不到 n(n − 1)/6 次）；中位數只花 2–3 次比較', () => {
  for (let n = 32; n <= S.MAX_N; n++) assert.ok(S.count('quick', S.makeData(n, 'sorted', 1), { median3: true }).comps < half(n) / 3, `n=${n}`);
  // n = 3：只做三數取中加一次分割
  for (const p of perms(3)) { const c = S.count('quick', p, { median3: true }).comps; assert.ok(c >= 2 + 2 && c <= 3 + 2, `${p} → ${c}`); }
});
test('比較排序的下限：n ≤ 7 時合併排序與插入排序的最壞比較次數都 ≥ ⌈log2 n!⌉', () => {
  let f = 1;
  for (let n = 1; n <= 7; n++) {
    f *= n;
    const lb = Math.ceil(Math.log2(f) - 1e-12);
    let mxM = 0, mxI = 0;
    for (const p of perms(n)) { mxM = Math.max(mxM, S.count('merge', p).comps); mxI = Math.max(mxI, S.count('insertion', p).comps); }
    assert.ok(mxM >= lb && mxI >= lb);
  }
});

console.log('穩定性');
test('泡沫、插入、合併永遠穩定；選擇與快速有反例，最小的反例只要 3 個數', () => {
  for (let n = 1; n <= 6; n++) for (const w of words(n, 3)) for (const a of ['bubble', 'insertion', 'merge']) assert.ok(S.run(a, w).stable, `${a} ${w}`);
  assert.strictEqual(S.run('selection', [2, 2, 1]).stable, false);
  assert.strictEqual(S.run('quick', [2, 2, 1]).stable, false);
  // 兩個數不可能不穩定
  for (const w of words(2, 3)) { assert.ok(S.run('selection', w).stable); assert.ok(S.run('quick', w).stable); assert.ok(S.run('quick', w, { median3: true }).stable); }
  // broken 數：[2a, 2b, 2c, 1] 選擇排序把 2a 換到最後 → (2b,2a)、(2c,2a) 兩對顛倒
  assert.strictEqual(S.run('selection', [2, 2, 2, 1]).broken, 2);
});

console.log('計數的細節');
test('交換只算不同位置；合併沒有交換、其他沒有寫入；選擇排序最多交換 n − 1 次', () => {
  for (let n = S.MIN_N; n <= 40; n++) for (let s = 1; s <= 5; s++) {
    const v = S.makeData(n, 'random', s);
    const r = S.run('quick', v);
    r.ops.filter(o => o.t === 'swap').forEach(o => assert.notStrictEqual(o.i, o.j));
    ['bubble', 'selection', 'insertion', 'quick'].forEach(a => assert.strictEqual(S.count(a, v).writes, 0));
    assert.ok(S.count('selection', v).swaps <= n - 1);
  }
});
test('逆序數的平均是 n(n − 1)/4（窮舉 n ≤ 7）；循環數的平均是調和數 H(n)', () => {
  for (let n = 1; n <= 7; n++) {
    const ps = perms(n);
    const avg = ps.reduce((s, p) => s + S.inversions(p), 0) / ps.length;
    assert.ok(Math.abs(avg - n * (n - 1) / 4) < 1e-12);
    const cyc = ps.reduce((s, p) => s + S.cycles(p), 0) / ps.length;
    let H = 0; for (let k = 1; k <= n; k++) H += 1 / k;
    assert.ok(Math.abs(cyc - H) < 1e-12);
  }
});

console.log('重播');
test('一步一步重播的結果 = 直接排序的結果；跳到第 k 步與一步步走到 k 相同；計數一致', () => {
  for (const a of S.ALGOS) for (const v of [S.makeData(12, 'random', 4), S.makeData(9, 'few', 2), [3, 1, 2]]) {
    const r = S.run(a, v, { median3: a === 'quick' });
    const st = S.playState(r);
    let k = 0;
    while (S.stepForward(st)) {
      k++;
      if (k % 5 === 0) {
        const s2 = S.seek(r, k);
        assert.deepStrictEqual(s2.arr, st.arr);
        assert.strictEqual(s2.c + s2.s + s2.w, k);
      }
    }
    assert.strictEqual(k, r.steps);
    assert.deepStrictEqual(st.arr, r.final);
    assert.strictEqual(st.c, r.comps); assert.strictEqual(st.s, r.swaps); assert.strictEqual(st.w, r.writes);
    assert.ok(st.done.every(Boolean), '最後全部就位');
    assert.strictEqual(st.hl, null);
  }
});
test('已排好、只有 n − 1 步的泡沫排序：最後一步之後全部標成就位', () => {
  const r = S.run('bubble', [1, 2, 3, 4, 5]);
  assert.strictEqual(r.steps, 4);
  const st = S.seek(r, 4);
  assert.ok(st.done.every(Boolean));
  const st3 = S.seek(r, 3);
  assert.ok(!st3.done[0]);
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗' : ''));
