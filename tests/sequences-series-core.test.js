/* 等差、等比數列與級數：數學核心的單元測試。用法：node tests/sequences-series-core.test.js */
'use strict';
const M = require('../js/sequences-series-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b); }
const R = M.rng(31);
const half = function (lo, hi) { return Math.round((lo + R() * (hi - lo)) * 2) / 2; };

test('等差：通項、相鄰差固定；和公式 = 逐項相加 = 高斯配對 n(a_1 + a_n)/2', function () {
  for (let t = 0; t < 3000; t++) {
    const a1 = half(-10, 10), d = half(-5, 5), n = 1 + Math.floor(R() * 100);
    const ts = M.terms('arith', a1, d, n), ps = M.partials(ts);
    for (let k = 1; k < n; k++) near(ts[k] - ts[k - 1], d, 1e-12, '公差');
    near(ps[n - 1], M.arithSum(a1, d, n), 1e-8, '和公式');
    near(M.arithSum(a1, d, n), n * (ts[0] + ts[n - 1]) / 2, 1e-8, '配對');
    // 高斯配對：第 k 項加倒數第 k 項都相同
    for (let k = 0; k < n; k++) near(ts[k] + ts[n - 1 - k], ts[0] + ts[n - 1], 1e-9, '每一對');
  }
  eq(M.arithSum(1, 1, 100), 5050, '高斯');
  eq(M.arithSum(1, 3, 8), 92, '預設 1, 4, 7, … 前 8 項');
  eq(M.arithSum(9, 1, 8), 100, '9 + 10 + … + 16');
  eq(M.arithSum(-5, 1, 11), 0, '−5 到 5');
  eq(M.arithTerm(-2, 3, 10), 25);
  eq(M.arithSum(1, 2, 12), 144, '奇數和');
});

test('等比：相鄰比固定；和公式（含 r = 1、r = −1）= 逐項相加；|r| < 1 時 S_n → S_∞', function () {
  for (let t = 0; t < 3000; t++) {
    let a1 = half(-10, 10); if (a1 === 0) a1 = 1;
    const r = Math.round((R() * 4 - 2) * 20) / 20, n = 1 + Math.floor(R() * 40);
    const ts = M.terms('geom', a1, r, n), ps = M.partials(ts);
    if (r !== 0) for (let k = 1; k < n; k++) near(ts[k] / ts[k - 1], r, 1e-9, '公比');
    near(ps[n - 1], M.geomSum(a1, r, n), 1e-9 * Math.max(1, Math.abs(ps[n - 1])), '和公式 r = ' + r);
    const S = M.geomInf(a1, r);
    if (Math.abs(r) < 1) {
      near(Math.abs(S - M.geomSum(a1, r, n)), Math.abs(S) * Math.pow(Math.abs(r), n), 1e-9 * Math.max(1, Math.abs(S)), '誤差 = |S∞||r|^n');
      near(M.geomSum(a1, r, 2000), S, 1e-9 * Math.max(1, Math.abs(S)), '收斂');
    } else ok(S === null, '|r| ≥ 1 沒有 S∞');
  }
  eq(M.geomSum(1, 2, 10), 1023);
  eq(M.geomSum(5, 1, 7), 35, 'r = 1');
  eq(M.geomSum(3, -1, 6), 0, 'r = −1、偶數項');
  eq(M.geomSum(3, -1, 7), 3, 'r = −1、奇數項');
  near(M.geomInf(0.9, 0.1), 1, 1e-15, '0.999… = 1');
  near(M.geomInf(1.5, -0.5), 1, 1e-15, '振盪著收斂到 1');
  eq(M.geomInf(8, 0.5), 16, '預設');
  eq(M.geomInf(1, 0.75), 4);
  near(M.geomSum(1, 2, 64), Math.pow(2, 64) - 1, 1e4, '棋盤上的米');
});

test('第一個進到誤差範圍的項數：r = 0.5 要 11 項才小於千分之一；r = 0.9 要 44 項才到 99%', function () {
  ok(M.firstWithin(1, 0.5, 11, 0.0005), 'n = 11（|S∞| = 2，千分之一 = 0.0005 × 2）');
  ok(!M.firstWithin(1, 0.5, 10, 0.0005) && !M.firstWithin(1, 0.5, 12, 0.0005), '10、12 都不是第一個');
  ok(2 * Math.pow(0.5, 11) < 0.001 && 2 * Math.pow(0.5, 10) >= 0.001, '直接算');
  ok(M.firstWithin(1, 0.9, 44, 0.01) && !M.firstWithin(1, 0.9, 43, 0.01) && !M.firstWithin(1, 0.9, 45, 0.01), '0.9 的 44');
  ok(M.firstWithin(8, 0.5, 7, 0.01) && !M.firstWithin(8, 0.5, 6, 0.01), '預設 8、0.5：第 7 項才到 99%');
  ok(M.firstWithin(-3, -0.8, 21, 0.01) && !M.firstWithin(-3, -0.8, 20, 0.01), 'r < 0 也一樣：0.8^21 < 0.01 ≤ 0.8^20');
  ok(!M.firstWithin(1, 2, 5, 0.01) && !M.firstWithin(0, 0.5, 5, 0.01), '發散、首項 0 都不算');
  // 和逐項掃描一致
  for (let t = 0; t < 500; t++) {
    let a1 = half(-10, 10); if (a1 === 0) a1 = 2;
    const r = Math.round((R() * 1.9 - 0.95) * 20) / 20; if (r === 0) continue;
    const S = M.geomInf(a1, r);
    let first = 0;
    for (let k = 1; k < 3000; k++) if (Math.abs(S - M.geomSum(a1, r, k)) <= 0.01 * Math.abs(S) * (1 + 1e-12)) { first = k; break; }
    ok(M.firstWithin(a1, r, first, 0.01), '掃描 ' + a1 + '、' + r + ' 得 ' + first);
  }
});

test('圖形數：三角形數兩份拼成 n × (n + 1)；奇數和是 n²；同時是三角形數與平方數的 n 是 1、8、49、288…', function () {
  for (let n = 1; n <= 200; n++) {
    let s = 0, o = 0;
    for (let k = 1; k <= n; k++) { s += k; o += 2 * k - 1; }
    eq(M.tri(n), s); eq(2 * M.tri(n), n * (n + 1)); eq(M.oddSum(n), o);
  }
  const both = [];
  for (let n = 1; n <= 300; n++) if (M.isSquare(M.tri(n))) both.push(n);
  eq(both.join(','), '1,8,49,288', '三角形平方數');
  eq(M.tri(8), 36); eq(M.tri(49), 1225);
  ok(M.isSquare(0) && M.isSquare(144) && !M.isSquare(10) && !M.isSquare(2.25), '平方數判斷');
});

test('科學記號：1e9 以上或 1e-6 以下才用；尾數在 [1, 10)', function () {
  ok(M.sci(123456) === null && M.sci(0.001) === null && M.sci(0) === null);
  const a = M.sci(Math.pow(2, 64)); eq(a.e, 19); near(a.m, 1.8447, 1e-12);
  const b = M.sci(-3.2e-8); eq(b.e, -8); near(b.m, -3.2, 1e-12);
  const c = M.sci(9.99999e12); eq(c.e, 13); near(c.m, 1, 1e-12, '進位');
});

test('挑戰 3000 題：前 5 項都在 ±60 內、第 5 項看得到、前 5 項唯一決定答案、滑桿做得到', function () {
  const G = M.rng(9); let last = null, na = 0;
  for (let t = 0; t < 3000; t++) {
    const c = M.genChallenge(G, last);
    ok(c, '出得了題');
    ok(c.check.every(function (v) { return Math.abs(v) <= 60; }) && Math.abs(c.check[4]) >= 0.25);
    eq(c.shown.length, 4);
    if (c.kind === 'arith') {
      na++;
      ok(Number.isInteger(c.a1) && c.a1 >= -10 && c.a1 <= 10 && M.D_CHOICES.indexOf(c.s) >= 0);
      // 前兩項決定公差：如果也是等比，那一定要 d = 0（不會出）
      ok(c.s !== 0);
    } else {
      ok(M.A_GEOM.indexOf(c.a1) >= 0 && M.R_CHOICES.indexOf(c.s) >= 0);
      // 等比數列（r ≠ 1）的前三項不會等差：a_2 − a_1 ≠ a_3 − a_2
      ok(Math.abs((c.check[1] - c.check[0]) - (c.check[2] - c.check[1])) > 1e-9, '不會同時是等差');
    }
    ok(!last || !(last.kind === c.kind && last.a1 === c.a1 && last.s === c.s), '不和上一題相同');
    last = c;
  }
  ok(na > 1200 && na < 1800, '兩種題目都有：等差 ' + na);
});

console.log('\n' + (fail ? fail + ' 項失敗、' : '') + pass + ' 項測試通過。');
if (fail) process.exit(1);
