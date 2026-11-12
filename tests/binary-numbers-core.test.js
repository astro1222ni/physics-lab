// 以 Node 執行：node tests/binary-numbers-core.test.js
'use strict';
const assert = require('assert');
const B = require('../js/binary-numbers-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const MAX = 65535;

console.log('進位制轉換');
test('已知值：165、2A、755、CAFE、1000', () => {
  assert.strictEqual(B.toBase(165, 2), '10100101');
  assert.strictEqual(B.toBase(42, 16), '2A');
  assert.strictEqual(B.toBase(493, 8), '755');
  assert.strictEqual(B.toBase(51966, 16), 'CAFE');
  assert.strictEqual(B.toBase(1000, 2), '1111101000');
  assert.strictEqual(B.toBase(0, 7), '0');
  assert.strictEqual(B.toBase(343, 7), '1000');
  assert.strictEqual(B.toBase(64, 7), '121');
});
test('2 到 16 進位：0 到 65535 全部來回轉換一致，並與 JavaScript 的 toString 相同', () => {
  for (let b = 2; b <= 16; b++) {
    for (let v = 0; v <= MAX; v += (b === 2 || b === 16 ? 1 : 7)) {
      const s = B.toBase(v, b);
      assert.strictEqual(s, v.toString(b).toUpperCase(), `v=${v} b=${b}`);
      assert.strictEqual(B.fromBase(s, b), v);
    }
  }
});
test('輸入格式：前綴、空白與底線可以，超出該進位的數字不行', () => {
  assert.strictEqual(B.fromBase('0b1010 0101', 2), 165);
  assert.strictEqual(B.fromBase('0xca_fe', 16), 51966);
  assert.strictEqual(B.fromBase('0o755', 8), 493);
  assert.ok(Number.isNaN(B.fromBase('102', 2)));
  assert.ok(Number.isNaN(B.fromBase('8', 8)));
  assert.ok(Number.isNaN(B.fromBase('G', 16)));
  assert.ok(Number.isNaN(B.fromBase('', 10)));
  assert.ok(Number.isNaN(B.fromBase('-5', 10)));
});
test('各位數乘位值加起來就是原數（位值記數法的定義）', () => {
  for (let b = 2; b <= 16; b++) for (let v = 0; v <= 5000; v += 13) {
    const s = B.digitsOf(v, b).reduce((acc, d) => acc + d.d * d.place, 0);
    assert.strictEqual(s, v);
  }
});
test('十六進位每一位剛好對應 4 個位元、八進位對應 3 個位元', () => {
  for (let v = 0; v <= MAX; v += 37) {
    const g4 = B.groups(v, 16, 4).map(x => parseInt(x, 2).toString(16).toUpperCase()).join('').replace(/^0+(?=.)/, '');
    assert.strictEqual(g4, B.toBase(v, 16));
    const g3 = B.groups(v, 18, 3).map(x => parseInt(x, 2).toString(8)).join('').replace(/^0+(?=.)/, '');
    assert.strictEqual(g3, B.toBase(v, 8));
  }
});

console.log('位元與範圍');
test('n 個位元的最大值 2^n − 1、組合數 2^n', () => {
  for (let n = 1; n <= 16; n++) {
    assert.strictEqual(B.maxOf(n), Math.pow(2, n) - 1);
    assert.strictEqual(B.toBase(B.maxOf(n), 2), '1'.repeat(n));
  }
});
test('位元長度、1 的個數與 bitsOf 一致', () => {
  for (let v = 0; v <= MAX; v++) {
    const s = v.toString(2);
    assert.strictEqual(B.bitLength(v), s.length);
    assert.strictEqual(B.popcount(v), (s.match(/1/g) || []).length);
    if (v % 101 === 0) assert.strictEqual(B.bitsOf(v, 16).reduce((a, x, i) => a + x * Math.pow(2, i), 0), v);
  }
});
test('表示 1000 至少要 10 個位元（2^9 = 512 ≤ 1000 < 1024 = 2^10）', () => {
  assert.strictEqual(B.bitLength(1000), 10);
  assert.strictEqual(B.bitLength(1023), 10);
  assert.strictEqual(B.bitLength(1024), 11);
});

console.log('+1、−1、×2、÷2 與溢位');
test('+1 改變的燈 = 尾端連續的 1 的個數 + 1，順序由低到高', () => {
  for (let n = 1; n <= 12; n++) for (let v = 0; v < B.maxOf(n); v++) {
    const r = B.inc(v, n);
    assert.strictEqual(r.v, v + 1);
    assert.strictEqual(r.overflow, false);
    const trailing = (v.toString(2).match(/1*$/) || [''])[0].length;
    assert.strictEqual(r.flipped.length, trailing + 1);
    r.flipped.forEach((b, i) => assert.strictEqual(b, i));
  }
});
test('8 位元的 255 + 1 溢位成 0，8 盞燈全變；0 − 1 借位成 255', () => {
  const r = B.inc(255, 8);
  assert.deepStrictEqual([r.v, r.overflow, r.flipped.length], [0, true, 8]);
  const d = B.dec(0, 8);
  assert.deepStrictEqual([d.v, d.overflow, d.flipped.length], [255, true, 8]);
});
test('16 位元的 32767 + 1：16 盞燈一起翻轉', () => {
  const r = B.inc(32767, 16);
  assert.strictEqual(r.v, 32768);
  assert.strictEqual(r.flipped.length, 16);
  assert.strictEqual(r.overflow, false);
});
test('−1 是 +1 的反運算（n 位元內，含繞回）', () => {
  for (let n = 1; n <= 10; n++) for (let v = 0; v <= B.maxOf(n); v++) assert.strictEqual(B.dec(B.inc(v, n).v, n).v, v);
});
test('×2 等於左移，最高位被推出時溢位；只有 2^(n−1) 乘以 2 會變成 0', () => {
  for (let n = 1; n <= 12; n++) for (let v = 0; v <= B.maxOf(n); v++) {
    const r = B.shl(v, n);
    assert.strictEqual(r.v, (v * 2) % Math.pow(2, n));
    assert.strictEqual(r.overflow, v * 2 > B.maxOf(n));
    if (v > 0 && r.v === 0) assert.strictEqual(v, Math.pow(2, n - 1));
  }
});
test('÷2 等於右移，推出去的位元就是除以 2 的餘數', () => {
  for (let v = 0; v <= 4096; v++) { const r = B.shr(v, 13); assert.strictEqual(r.v, Math.floor(v / 2)); assert.strictEqual(r.lost, v % 2); }
});
test('從 1 開始連續 ×2 十次得到 1024 = 2^10', () => {
  let v = 1;
  for (let i = 0; i < 10; i++) v = B.shl(v, 16).v;
  assert.strictEqual(v, 1024);
});

console.log('轉換方法');
test('除法階梯：餘數由下往上讀就是二進位', () => {
  for (let v = 0; v <= MAX; v += 11) {
    const rows = B.ladder(v);
    assert.strictEqual(rows.map(r => r.r).reverse().join(''), v.toString(2));
    rows.forEach(r => assert.strictEqual(r.q, 2 * r.quo + r.r));
    assert.strictEqual(rows.length, B.bitLength(v));
  }
});
test('只用 +1、×2 從 0 做出 v 的最少步數（與廣度優先搜尋的暴力答案相同）', () => {
  const LIM = 4096, dist = new Array(LIM + 1).fill(-1), q = [0];
  dist[0] = 0;
  for (let h = 0; h < q.length; h++) {
    const x = q[h];
    [x + 1, x * 2].forEach(y => { if (y <= LIM && dist[y] < 0) { dist[y] = dist[x] + 1; q.push(y); } });
  }
  for (let v = 0; v <= LIM; v++) assert.strictEqual(B.minBuildSteps(v), dist[v], `v=${v}`);
  assert.strictEqual(B.minBuildSteps(100), 9);
});

console.log('特別的數（數論的已知結果，用暴力檢查）');
test('二進位與十進位都是回文的數（OEIS A007632）≤ 65535', () => {
  const got = [];
  for (let v = 0; v <= MAX; v++) if (B.isPalindrome(String(v)) && B.isPalindrome(v.toString(2))) got.push(v);
  assert.deepStrictEqual(got, [0, 1, 3, 5, 7, 9, 33, 99, 313, 585, 717, 7447, 9009, 15351, 32223, 39993, 53235, 53835]);
});
test('65535 以內的完全數只有 6、28、496、8128，二進位都是「一串 1 接一串少一個的 0」', () => {
  const got = [];
  for (let v = 1; v <= MAX; v++) if (B.isPerfect(v)) got.push(v);
  assert.deepStrictEqual(got, [6, 28, 496, 8128]);
  assert.deepStrictEqual(got.map(v => v.toString(2)), ['110', '11100', '111110000', '1111111000000']);
});
test('65535 以內的梅森質數只有 3、7、31、127、8191', () => {
  const got = [];
  for (let v = 1; v <= MAX; v++) if (B.isMersennePrime(v)) got.push(v);
  assert.deepStrictEqual(got, [3, 7, 31, 127, 8191]);
});
test('3 到 16 進位裡，同時是二進位與另一種進位的「三位以上全是 1」：只有 31 = 11111（二）= 111（五）', () => {
  const got = [];
  for (let v = 1; v <= MAX; v++) {
    if (!B.isRepunit(v, 2, 3)) continue;
    for (let b = 3; b <= 16; b++) if (B.isRepunit(v, b, 3)) got.push(v + '@' + b);
  }
  assert.deepStrictEqual(got, ['31@5']);
});
test('121 在每一種 b ≥ 3 進位都是完全平方數 (b + 1)²', () => {
  for (let b = 3; b <= 16; b++) { const v = B.fromBase('121', b); assert.strictEqual(v, (b + 1) * (b + 1)); }
});
test('一亮一暗交錯的圖樣：16 位元只有 0x5555 與 0xAAAA', () => {
  const got = [];
  for (let v = 0; v <= MAX; v++) if (B.isAlternating(v, 16)) got.push(B.toBase(v, 16));
  assert.deepStrictEqual(got, ['5555', 'AAAA']);
});

console.log('轉換挑戰的出題');
test('題目的值在 1 到 2^n − 1，不會連續出同一題，同一個種子出一樣的題', () => {
  for (let n = 1; n <= 16; n++) {
    const r1 = B.rng(n * 7 + 1), r2 = B.rng(n * 7 + 1);
    let prev = -1;
    for (let i = 0; i < 300; i++) {
      const q = B.question(r1, n, prev), q2 = B.question(r2, n, prev);
      assert.deepStrictEqual(q, q2);
      assert.ok(q.v >= 1 && q.v <= B.maxOf(n), `n=${n} v=${q.v}`);
      if (n > 1) assert.notStrictEqual(q.v, prev);
      assert.ok([2, 8, 10, 16].indexOf(q.base) >= 0);
      prev = q.v;
    }
  }
});

console.log(`\n${passed} 項測試通過`);
