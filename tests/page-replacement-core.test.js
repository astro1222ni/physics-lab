// 以 Node 執行：node tests/page-replacement-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/page-replacement-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const F = (refs, f, a, o) => C.faultsOf(refs, f, a, o);
const mems = res => res.steps.map(s => s.mem.map(x => x === null ? '-' : x).join('')).join(' ');
const victims = res => res.steps.filter(s => s.victim !== null).map(s => s.victim).join(',');
function randRefs(r, n, kinds) { const s = []; for (let i = 0; i < n; i++) s.push(Math.floor(r() * kinds)); return s; }

const BELADY = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
const SILB = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1];

console.log('經典例子');
test('Belady 異常：1,2,3,4,1,2,5,1,2,3,4,5 用 FIFO，3 個框缺頁 9 次、4 個框 10 次', () => {
  assert.strictEqual(F(BELADY, 3, 'fifo'), 9);
  assert.strictEqual(F(BELADY, 4, 'fifo'), 10);
  assert.deepStrictEqual(C.anomalies(C.curves(BELADY).fifo), [3]);
});
test('同一個字串 LRU 與 OPT 不會異常：LRU 3 框 10、4 框 8；OPT 3 框 7、4 框 6', () => {
  assert.strictEqual(F(BELADY, 3, 'lru'), 10); assert.strictEqual(F(BELADY, 4, 'lru'), 8);
  assert.strictEqual(F(BELADY, 3, 'opt'), 7); assert.strictEqual(F(BELADY, 4, 'opt'), 6);
});
test('Silberschatz 課本的字串（20 個參考、3 個框）：FIFO 15、OPT 9、LRU 12', () => {
  assert.strictEqual(F(SILB, 3, 'fifo'), 15);
  assert.strictEqual(F(SILB, 3, 'opt'), 9);
  assert.strictEqual(F(SILB, 3, 'lru'), 12);
});
test('課本 FIFO 的逐步內容（框 0、1、2）', () => {
  const r = C.simulate(SILB, 3, 'fifo');
  assert.strictEqual(mems(r).split(' ').slice(0, 8).join(' '), '7-- 70- 701 201 201 231 230 430');
  assert.strictEqual(victims(r), '7,0,1,2,3,0,4,2,3,0,1,2');
});
test('課本 OPT 與 LRU 的換出順序', () => {
  assert.strictEqual(victims(C.simulate(SILB, 3, 'opt')), '7,1,0,4,3,2');
  assert.strictEqual(victims(C.simulate(SILB, 3, 'lru')), '7,1,2,3,0,4,0,3,2');
});
test('第一次載入也算缺頁；框數不小於不同頁數時，缺頁 = 不同頁數', () => {
  for (let f = 5; f <= 7; f++) C.ALGOS.forEach(a => assert.strictEqual(F(BELADY, f, a), 5));
  assert.strictEqual(C.distinct(SILB), 6);
  C.ALGOS.forEach(a => assert.strictEqual(F(SILB, 6, a), 6));
});
test('只有 1 個框時四種方法完全相同：缺頁 = 和前一個參考不同的次數', () => {
  const r = C.rng(3);
  for (let k = 0; k < 300; k++) {
    const s = randRefs(r, 1 + Math.floor(r() * 25), 1 + Math.floor(r() * 5));
    let ch = 1; for (let i = 1; i < s.length; i++) if (s[i] !== s[i - 1]) ch++;
    C.ALGOS.forEach(a => assert.strictEqual(F(s, 1, a), ch));
  }
});

console.log('平手規則與 LFU 的次數');
test('LFU：次數最少的換出；次數相同時換「最久沒被用到」的', () => {
  // 1 用了 3 次，2、3 各 1 次 → 4 來時換 2（次數 1 裡面最久沒用到）
  const r = C.simulate([1, 1, 1, 2, 3, 4], 3, 'lfu');
  assert.strictEqual(r.steps[5].victim, 2);
  assert.deepStrictEqual(r.steps[5].cand, [3, 1, 1]);
  // 2、3 各 1 次，但 2 剛剛又被用過一次（次數 2）→ 換 3
  assert.strictEqual(C.simulate([1, 2, 3, 2, 4], 3, 'lfu').steps[4].victim, 1);
  assert.strictEqual(C.simulate([2, 3, 1, 1, 3, 4], 3, 'lfu').steps[5].victim, 2);
});
test('LFU 預設：換出時次數歸零，再載入從 1 算起', () => {
  // 1 用了 3 次後被換出（1 只出現在前面，換掉之前 2、3、4 也都累積到 4 次）
  const s = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 1];
  const r = C.simulate(s, 2, 'lfu');
  const st = r.steps[s.length - 1];
  assert.strictEqual(st.hit, false);
  assert.strictEqual(st.key[st.idx], 1, '重新載入的 1 從 1 次算起');
  const k = C.simulate(s, 2, 'lfu', { lfuKeep: true }).steps[s.length - 1];
  assert.strictEqual(k.key[k.idx], 4, '保留次數時 1 是第 4 次');
});
test('LFU「過去的熱門」：前面用了很多次的頁一直占著框（歸零與保留兩種都一樣）', () => {
  const s = [9, 9, 9, 9, 1, 2, 3, 1, 2, 3, 1, 2, 3];
  [false, true].forEach(keep => {
    const r = C.simulate(s, 3, 'lfu', { lfuKeep: keep });
    assert.ok(r.steps[s.length - 1].mem.indexOf(9) >= 0, '9 到最後都還在');
    assert.strictEqual(r.faults, 13 - 3);
  });
  assert.strictEqual(F(s, 3, 'lru'), 4);
});
test('OPT：換出下一次用到最晚的；之後都不再用到的頁不只一個時，換最久沒被用到的', () => {
  // 1、2、3 都不再用到 → 換最久沒用到的 1
  const r = C.simulate([1, 2, 3, 4], 3, 'opt');
  assert.strictEqual(r.steps[3].victim, 1);
  assert.deepStrictEqual(r.steps[3].cand, [Infinity, Infinity, Infinity]);
  // 1 在第 5 步再用到，2、3 不再用 → 換 2
  assert.strictEqual(C.simulate([1, 2, 3, 4, 1], 3, 'opt').steps[3].victim, 2);
  // 1 先載入但剛剛又用過，2、3 之後都不再用 → 換 2（最久沒被用到；若用「最早載入」會換 1）
  assert.strictEqual(C.simulate([1, 2, 3, 1, 4], 3, 'opt').steps[4].victim, 2);
  assert.strictEqual(C.simulate([1, 2, 3, 1, 4], 3, 'opt', { optTie: 'fifo' }).steps[4].victim, 1);
  // 有下一次用到的頁時照最晚的換
  assert.strictEqual(C.simulate([1, 2, 3, 4, 1, 2, 3], 3, 'opt').steps[3].victim, 3);
});
test('OPT 的缺頁次數和「都不再用到時」的平手規則無關（三種平手規則，隨機 3000 組）', () => {
  const r = C.rng(11);
  for (let k = 0; k < 3000; k++) {
    const s = randRefs(r, 1 + Math.floor(r() * 30), 2 + Math.floor(r() * 8)), f = 1 + Math.floor(r() * 7);
    assert.strictEqual(F(s, f, 'opt'), F(s, f, 'opt', { optTie: 'last' }));
    assert.strictEqual(F(s, f, 'opt'), F(s, f, 'opt', { optTie: 'fifo' }));
  }
});
test('FIFO：命中不改變載入順序（和 LRU 的差別）', () => {
  // 1 2 3 1 4：FIFO 換 1（最早載入），LRU 換 2（最久沒用）
  assert.strictEqual(C.simulate([1, 2, 3, 1, 4], 3, 'fifo').steps[4].victim, 1);
  assert.strictEqual(C.simulate([1, 2, 3, 1, 4], 3, 'lru').steps[4].victim, 2);
});
test('有空框時放進編號最小的空框；換出時新頁放進犧牲頁原本的框', () => {
  const r = C.simulate([5, 6, 7, 8], 3, 'fifo');
  assert.deepStrictEqual(r.steps.map(s => s.idx), [0, 1, 2, 0]);
  assert.deepStrictEqual(r.steps.map(s => s.filled), [true, true, true, false]);
});

console.log('最佳性與堆疊性質（隨機大量比對）');
test('OPT 的缺頁次數不大於任何其他演算法（20 000 組 × 7 種框數，LFU 兩種算法都比）', () => {
  const r = C.rng(2026);
  for (let k = 0; k < 20000; k++) {
    const s = randRefs(r, 1 + Math.floor(r() * 30), 2 + Math.floor(r() * 9));
    for (let f = 1; f <= 7; f++) {
      const o = F(s, f, 'opt');
      ['fifo', 'lru', 'lfu'].forEach(a => assert.ok(o <= F(s, f, a), a + ' 比 OPT 少：' + s.join(' ') + ' f=' + f));
      assert.ok(o <= F(s, f, 'lfu', { lfuKeep: true }));
      assert.ok(o >= C.distinct(s), '缺頁不會少於不同頁數');
    }
  }
});
test('OPT 真的是最佳：和窮舉所有換出選擇的最小值相同（小字串 1500 組）', () => {
  const r = C.rng(77);
  function best(s, f) {
    const memo = new Map();
    function go(t, mem) {
      if (t === s.length) return 0;
      const key = t + '|' + mem.slice().sort().join(',');
      if (memo.has(key)) return memo.get(key);
      let v;
      if (mem.indexOf(s[t]) >= 0) v = go(t + 1, mem);
      else if (mem.length < f) v = 1 + go(t + 1, mem.concat([s[t]]));
      else { v = Infinity; for (let i = 0; i < mem.length; i++) { const m = mem.slice(); m[i] = s[t]; v = Math.min(v, 1 + go(t + 1, m)); } }
      memo.set(key, v);
      return v;
    }
    return go(0, []);
  }
  for (let k = 0; k < 1500; k++) {
    const s = randRefs(r, 1 + Math.floor(r() * 12), 2 + Math.floor(r() * 4)), f = 1 + Math.floor(r() * 4);
    assert.strictEqual(F(s, f, 'opt'), best(s, f), s.join(' ') + ' f=' + f);
  }
});
test('LRU 與 OPT 隨框數單調不增，而且每一步 f 個框的內容都包含在 f + 1 個框裡（堆疊演算法，5000 組）', () => {
  const r = C.rng(5);
  for (let k = 0; k < 5000; k++) {
    const s = randRefs(r, 1 + Math.floor(r() * 30), 2 + Math.floor(r() * 9));
    ['lru', 'opt'].forEach(a => {
      const cv = C.curves(s)[a];
      for (let f = 1; f < 7; f++) {
        assert.ok(cv[f] <= cv[f - 1], a + ' 不單調：' + s.join(' '));
        const A = C.residentSets(C.simulate(s, f, a)), B = C.residentSets(C.simulate(s, f + 1, a));
        A.forEach((set, t) => set.forEach(p => assert.ok(B[t].indexOf(p) >= 0, a + ' 違反包含性質')));
      }
    });
  }
});
test('保留次數的 LFU 也是堆疊演算法（Mattson 1970）：單調不增、包含性質（5000 組）', () => {
  const r = C.rng(6);
  for (let k = 0; k < 5000; k++) {
    const s = randRefs(r, 1 + Math.floor(r() * 30), 2 + Math.floor(r() * 9));
    for (let f = 1; f < 7; f++) {
      const A = C.simulate(s, f, 'lfu', { lfuKeep: true }), B = C.simulate(s, f + 1, 'lfu', { lfuKeep: true });
      assert.ok(B.faults <= A.faults);
      const a = C.residentSets(A), b = C.residentSets(B);
      a.forEach((set, t) => set.forEach(p => assert.ok(b[t].indexOf(p) >= 0)));
    }
  }
});
test('換出就歸零的 LFU 不是堆疊演算法：也會發生 Belady 異常', () => {
  const s = [2, 4, 1, 2, 4, 3, 1, 3, 5, 5, 5, 3, 1, 7, 3, 6];
  const cv = C.curves(s).lfu;
  assert.ok(C.anomalies(cv).length > 0, 'LFU 曲線 ' + cv.join(','));
  assert.strictEqual(C.anomalies(C.curves(s, { lfuKeep: true }).lfu).length, 0);
});
test('LRU 的堆疊距離：f 個框時 LRU 缺頁 = 堆疊距離大於 f 的參考個數（3000 組）', () => {
  const r = C.rng(8);
  for (let k = 0; k < 3000; k++) {
    const s = randRefs(r, 1 + Math.floor(r() * 30), 2 + Math.floor(r() * 9));
    const d = C.stackDistances(s);
    for (let f = 1; f <= 7; f++) assert.strictEqual(F(s, f, 'lru'), d.filter(x => x > f).length);
  }
});
test('倒過來的字串：LRU 與 OPT 的缺頁次數不變（Silberschatz 10.4 節），FIFO 不一定（5000 組）', () => {
  const r = C.rng(9);
  let fifoDiff = 0;
  for (let k = 0; k < 5000; k++) {
    const s = randRefs(r, 1 + Math.floor(r() * 30), 2 + Math.floor(r() * 9)), rv = s.slice().reverse();
    for (let f = 1; f <= 7; f++) {
      assert.strictEqual(F(s, f, 'lru'), F(rv, f, 'lru'));
      assert.strictEqual(F(s, f, 'opt'), F(rv, f, 'opt'));
      if (F(s, f, 'fifo') !== F(rv, f, 'fifo')) fifoDiff++;
    }
  }
  assert.ok(fifoDiff > 100, 'FIFO 倒過來常常不同（' + fifoDiff + '）');
});
test('每一步：命中 + 缺頁 = 步數；記憶體裡沒有重複的頁；命中時記憶體不變', () => {
  const r = C.rng(10);
  for (let k = 0; k < 2000; k++) {
    const s = randRefs(r, 1 + Math.floor(r() * 30), 2 + Math.floor(r() * 9)), f = 1 + Math.floor(r() * 7);
    C.ALGOS.forEach(a => {
      const res = C.simulate(s, f, a);
      assert.strictEqual(res.hits + res.faults, s.length);
      res.steps.forEach((st, t) => {
        const m = st.mem.filter(x => x !== null);
        assert.strictEqual(new Set(m).size, m.length);
        assert.strictEqual(st.mem[st.idx], st.page);
        if (st.hit && t) assert.deepStrictEqual(st.mem, res.steps[t - 1].mem);
      });
    });
  }
});

console.log('輸入與隨機');
test('解析：空白、逗號、頓號都可以分隔；整串數字一個數字一頁', () => {
  assert.deepStrictEqual(C.parse('1 2 3,4、5').refs, [1, 2, 3, 4, 5]);
  assert.deepStrictEqual(C.parse('70120304').refs, [7, 0, 1, 2, 0, 3, 0, 4]);
  assert.deepStrictEqual(C.parse(' 12, 7 ,99 ').refs, [12, 7, 99]);
  assert.deepStrictEqual(C.parse('1，2；3').refs, [1, 2, 3]);
});
test('解析：拒絕空白、超過 30 頁、不是 0–99 的整數', () => {
  assert.strictEqual(C.parse('').code, 'empty');
  assert.strictEqual(C.parse(' , ,').code, 'empty');
  assert.strictEqual(C.parse(new Array(31).fill(1).join(' ')).code, 'long');
  assert.strictEqual(C.parse('1 2 100').code, 'token');
  assert.strictEqual(C.parse('1 -2').code, 'token');
  assert.strictEqual(C.parse('1 a').code, 'token');
  assert.strictEqual(C.parse('1 2.5').code, 'token');
  assert.ok(C.parse(new Array(30).fill(3).join(',')).ok);
});
test('隨機字串：同一個種子結果相同；長度與頁面種類在範圍內', () => {
  assert.deepStrictEqual(C.randomRefs(4, 20, 6), C.randomRefs(4, 20, 6));
  assert.notDeepStrictEqual(C.randomRefs(4, 20, 6), C.randomRefs(5, 20, 6));
  for (let seed = 1; seed < 200; seed++) {
    const s = C.randomRefs(seed, 3 + seed % 40, seed % 13);
    assert.ok(s.length >= 6 && s.length <= 30);
    s.forEach(p => assert.ok(p >= 0 && p < Math.max(2, Math.min(10, seed % 13))));
  }
});
test('fmt 與堆疊距離的小例子', () => {
  assert.strictEqual(C.fmt(2 / 3, 2), '0.67');
  assert.deepStrictEqual(C.stackDistances([1, 2, 1, 3, 2]), [Infinity, Infinity, 2, Infinity, 3]);
});

console.log(process.exitCode ? '\n有測試失敗' : '\n全部 ' + passed + ' 項通過');
