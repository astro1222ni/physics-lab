/* 平面向量的線性組合與內積：數學核心的單元測試。用法：node tests/plane-vectors-core.test.js */
'use strict';
const M = require('../js/plane-vectors-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b); }
const R = M.rng(17);
const rv = function (k) { return [Math.round((R() * 2 - 1) * k * 10) / 10, Math.round((R() * 2 - 1) * k * 10) / 10]; };

test('線性組合：克拉瑪公式解出的 (x, y) 代回去等於 P；a、b 平行時沒有唯一解', function () {
  for (let t = 0; t < 2000; t++) {
    const a = rv(5), b = rv(5), P = rv(6);
    const s = M.solve(a, b, P);
    if (M.det(a, b) === 0) { ok(s === null); continue; }
    const Q = M.comb(a, b, s.x, s.y);
    near(Q[0], P[0], 1e-9); near(Q[1], P[1], 1e-9);
  }
  // 2a + b，a = (2, 1)、b = (1, 2) → (5, 4)
  const s = M.solve([2, 1], [1, 2], [5, 4]);
  near(s.x, 2, 1e-12); near(s.y, 1, 1e-12);
  ok(M.solve([1, 2], [-2, -4], [1, 1]) === null, '平行');
  ok(M.onSpan([1, 2], [-2, -4], [3, 6]) && !M.onSpan([1, 2], [-2, -4], [3, 5]), '平行時 P 要在直線上');
  ok(M.onSpan([0, 0], [0, 0], [0, 0]) && !M.onSpan([0, 0], [0, 0], [1, 0]), '兩個零向量只張出原點');
});

test('內積：分量公式 = |a||b| cos θ；夾角 0 到 180 度；垂直時內積 0', function () {
  for (let t = 0; t < 1000; t++) {
    const a = rv(5), b = rv(5);
    if (M.isZero(a) || M.isZero(b)) { ok(M.angleDeg(a, b) === null); continue; }
    const th = M.angleDeg(a, b);
    ok(th >= 0 && th <= 180, '夾角範圍');
    near(M.dot(a, b), M.len(a) * M.len(b) * Math.cos(th * Math.PI / 180), 1e-9, '內積');
    near(Math.abs(M.det(a, b)), M.len(a) * M.len(b) * Math.sin(th * Math.PI / 180), 1e-9, '面積');
    // 柯西不等式
    ok(M.dot(a, b) * M.dot(a, b) <= M.dot(a, a) * M.dot(b, b) + 1e-9, '柯西不等式');
    // (a·b)² + det² = |a|²|b|²
    near(M.dot(a, b) * M.dot(a, b) + M.det(a, b) * M.det(a, b), M.dot(a, a) * M.dot(b, b), 1e-8, '拉格朗日恆等式');
  }
  eq(M.dot([3, 4], [-4, 3]), 0);
  near(M.angleDeg([1, 0], [1, 1]), 45, 1e-12);
  near(M.angleDeg([1, 0], [-1, 0]), 180, 1e-12);
  near(M.angleDeg([2, 1], [4, 2]), 0, 1e-12);
});

test('正射影：b − proj 垂直 a；proj 的長度 = |a·b| / |a|；k 的正負就是內積的正負', function () {
  for (let t = 0; t < 1000; t++) {
    const a = rv(5), b = rv(5);
    const p = M.proj(b, a);
    if (M.isZero(a)) { ok(p === null); continue; }
    near(M.dot(M.sub(b, p.v), a), 0, 1e-9, '垂直');
    near(M.len(p.v), Math.abs(M.dot(a, b)) / M.len(a), 1e-9, '長度');
    ok(Math.sign(p.k) === Math.sign(M.dot(a, b)) || Math.abs(p.k) < 1e-12, '正負');
  }
  // a = (2, 0)、b = (−1, 3)：正射影 (−1, 0) = −a/2
  const p = M.proj([-1, 3], [2, 0]);
  near(p.k, -0.5, 1e-12); near(p.v[0], -1, 1e-12); near(p.v[1], 0, 1e-12);
  // b 和 a 平行時，正射影就是 b 自己
  const q = M.proj([4, 2], [2, 1]);
  near(q.v[0], 4, 1e-12); near(q.v[1], 2, 1e-12);
});

test('範圍：直線 AB、角形、平行四邊形、三角形；重心 (a + b)/3 在三角形裡；三等分點', function () {
  ok(M.inRegion('line', 0.3, 0.7) && !M.inRegion('line', 0.3, 0.6), 'x + y = 1');
  ok(M.inRegion('line', -1, 2), '直線 AB 延長出去也算');
  ok(M.inRegion('cone', 5, 0) && !M.inRegion('cone', -0.1, 1), '角形');
  ok(M.inRegion('para', 1, 1) && !M.inRegion('para', 1.01, 0.5), '平行四邊形');
  ok(M.inRegion('tri', 1 / 3, 1 / 3) && !M.inRegion('tri', 0.6, 0.6), '三角形');
  ok(M.inRegion('none', 99, -99));
  // 隨機：三角形 ⊂ 平行四邊形 ⊂ 角形
  for (let t = 0; t < 2000; t++) {
    const x = R() * 4 - 2, y = R() * 4 - 2;
    if (M.inRegion('tri', x, y)) ok(M.inRegion('para', x, y));
    if (M.inRegion('para', x, y)) ok(M.inRegion('cone', x, y));
  }
  // 三角形 OAB 的重心 = (O + A + B)/3 = (a + b)/3
  const a = [4, 1], b = [1, 3], G = M.comb(a, b, 1 / 3, 1 / 3);
  near(G[0], (0 + a[0] + b[0]) / 3, 1e-12); near(G[1], (0 + a[1] + b[1]) / 3, 1e-12);
  // P = (2/3)a + (1/3)b：AP : PB = 1 : 2
  const P = M.comb(a, b, 2 / 3, 1 / 3);
  near(M.len(M.sub(P, a)) / M.len(M.sub(b, P)), 0.5, 1e-12);
  const r = M.ratioOnLine(2 / 3, 1 / 3);
  near(r.ap / r.pb, 0.5, 1e-12);
  ok(M.regionPolygon('tri').length === 3 && M.regionPolygon('none') === null);
});

test('吸附：離 0.5 的倍數夠近才吸過去', function () {
  eq(M.snapCoef(1.98, 0.5, 0.05), 2);
  eq(M.snapCoef(1.9, 0.5, 0.05), 1.9);
  eq(M.snapCoef(-0.52, 0.5, 0.05), -0.5);
  eq(M.snapCoef(1 / 3, 0.5, 0.05), 1 / 3);
});

test('挑戰：3000 題的 a、b 是整數向量且 |det| ≥ 2、目標係數是 0.5 的倍數、目標點在畫面內、解出來的係數就是答案', function () {
  const RR = M.rng(2024);
  let last = null, half = 0;
  for (let t = 0; t < 3000; t++) {
    const c = M.genChallenge(RR, last);
    ok(c, '出不了題');
    [c.a, c.b].forEach(function (v) { ok(Number.isInteger(v[0]) && Number.isInteger(v[1]) && Math.abs(v[0]) <= 3 && Math.abs(v[1]) <= 3 && !M.isZero(v)); });
    ok(Math.abs(M.det(c.a, c.b)) >= 2, 'det');
    ok(Number.isInteger(c.x * 2) && Number.isInteger(c.y * 2) && c.x >= -2 && c.x <= 3 && c.y >= -2 && c.y <= 3, '係數');
    ok(Math.abs(c.T[0]) <= 5.5 && Math.abs(c.T[1]) <= 5.5, '目標點在畫面內');
    const s = M.solve(c.a, c.b, c.T);
    near(s.x, c.x, 1e-9); near(s.y, c.y, 1e-9);
    if (!Number.isInteger(c.x) || !Number.isInteger(c.y)) half++;
    last = c;
  }
  ok(half > 1200, '有 0.5 的題目 ' + half + ' 題');
});

console.log('\n' + (fail ? fail + ' 項失敗、' : '') + pass + ' 項測試通過。');
if (fail) process.exit(1);
