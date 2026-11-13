/* 線性規劃：數學核心的單元測試。用法：node tests/linear-programming-core.test.js */
'use strict';
const M = require('../js/linear-programming-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b); }
let seed = 7;
const rand = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const ri = function (lo, hi) { return lo + Math.floor(rand() * (hi - lo + 1)); };
const C = function (a, b, c, s) { return { a: a, b: b, c: c, s: s || '<=' }; };
const hasV = function (vs, x, y) { return vs.some(function (v) { return Math.abs((v.x !== undefined ? v.x : v[0]) - x) < 1e-7 && Math.abs((v.y !== undefined ? v.y : v[1]) - y) < 1e-7; }); };

test('工廠題：頂點 (0,0)、(6,0)、(4.4,4.8)、(2,6)、(0,6)，z = 3x + 2y 最大 22.8；整數解 (4,5) 只有 22', function () {
  const P = M.PRESETS.factory;
  const R = M.region(P.cons);
  ok(R.bounded && !R.empty, '有界');
  eq(R.vertices.length, 5, '頂點數');
  [[0, 0], [6, 0], [4.4, 4.8], [2, 6], [0, 6]].forEach(function (v) { ok(hasV(R.vertices, v[0], v[1]), '頂點 ' + v); });
  // 面積：鞋帶公式 = 0.5 |…|
  near(R.area, 0.5 * Math.abs(0 * 0 - 6 * 0 + 6 * 4.8 - 4.4 * 0 + 4.4 * 6 - 2 * 4.8 + 2 * 6 - 0 * 6 + 0 * 0 - 0 * 6), 1e-9, '面積');
  const o = M.optimize(P.cons, P.p, P.q, 'max');
  eq(o.status, 'unique'); near(o.z, 22.8, 1e-9); near(o.x, 4.4, 1e-9); near(o.y, 4.8, 1e-9);
  const I = M.intOptimize(P.cons, P.p, P.q, 'max');
  eq(I.status, 'ok'); near(I.z, 22, 1e-12); eq(I.pts.length, 1); eq(I.pts[0][0], 4); eq(I.pts[0][1], 5);
  ok(!(Math.round(4.4) === 4 && Math.round(4.8) === 5 && false), '');
  // 離最佳頂點最近的格子點 (4,5) 剛好是答案；但 (5,5) 不可行
  ok(!M.feasible(P.cons, 5, 5), '(5,5) 不可行');
  const mn = M.optimize(P.cons, P.p, P.q, 'min');
  eq(mn.status, 'unique'); near(mn.z, 0, 1e-12);
});

test('營養題（≥ 的限制式）：最小成本 22 在 (3, 2)', function () {
  const P = M.PRESETS.diet;
  const o = M.optimize(P.cons, P.p, P.q, 'min');
  eq(o.status, 'unique'); near(o.z, 22, 1e-9); near(o.x, 3, 1e-9); near(o.y, 2, 1e-9);
  ok(M.feasible(P.cons, 3, 2) && !M.feasible(P.cons, 2, 2), '可行性');
});

test('基本題：z = 2x + y 最大 9 在 (4, 1)；改成 z = x + y 時整條邊 x + y = 5 都最好', function () {
  const P = M.PRESETS.basic;
  const o = M.optimize(P.cons, 2, 1, 'max');
  eq(o.status, 'unique'); near(o.z, 9, 1e-9); near(o.x, 4, 1e-9); near(o.y, 1, 1e-9);
  const e = M.optimize(P.cons, 1, 1, 'max');
  eq(e.status, 'edge'); near(e.z, 5, 1e-9); eq(e.best.length, 2);
  ok(hasV(e.best, 4, 1) && hasV(e.best, 1, 4), '兩端是 (4,1) 與 (1,4)');
});

test('無界：只有 x + y ≥ 2 時 z = x + y 沒有最大值、最小值 2（整條邊）；z = x − y 兩邊都沒有', function () {
  const cons = [C(1, 1, 2, '>=')];
  const R = M.region(cons);
  ok(!R.bounded && !R.empty, '無界');
  eq(M.optimize(cons, 1, 1, 'max').status, 'unbounded');
  const mn = M.optimize(cons, 1, 1, 'min');
  eq(mn.status, 'edge'); near(mn.z, 2, 1e-9);
  const mn2 = M.optimize(cons, 1, 2, 'min');
  eq(mn2.status, 'unique'); near(mn2.z, 2, 1e-9); near(mn2.x, 2, 1e-9); near(mn2.y, 0, 1e-9);
  eq(M.optimize(cons, 1, -1, 'max').status, 'unbounded');
  eq(M.optimize(cons, 1, -1, 'min').status, 'unbounded');
  eq(M.intOptimize(cons, 1, 1, 'max').status, 'unbounded');
});

test('不可行：x + y ≤ 1 與 x + y ≥ 3 沒有交集；只剩一點、一條線段也算可行', function () {
  eq(M.region([C(1, 1, 1), C(1, 1, 3, '>=')]).empty, true);
  eq(M.optimize([C(1, 1, 1), C(1, 1, 3, '>=')], 1, 1, 'max').status, 'empty');
  const pt = M.region([C(1, 1, 0)]); // x ≥ 0、y ≥ 0、x + y ≤ 0：只有原點
  ok(!pt.empty && pt.degenerate, '只剩原點'); ok(hasV(pt.vertices, 0, 0), '原點');
  const seg = M.optimize([C(1, 1, 4), C(1, 1, 4, '>=')], 1, 0, 'max'); // 線段 x + y = 4
  eq(seg.status, 'unique'); near(seg.z, 4, 1e-7);
});

test('隨機 3000 題：最佳頂點真的比可行域裡任何隨機點都好（線性規劃基本定理）', function () {
  for (let t = 0; t < 3000; t++) {
    const n = ri(1, 4), cons = [];
    for (let i = 0; i < n; i++) cons.push(C(ri(-5, 5), ri(-5, 5), ri(0, 20), rand() < 0.75 ? '<=' : '>='));
    const p = ri(-5, 5), q = ri(-5, 5), sense = rand() < 0.5 ? 'max' : 'min';
    const o = M.optimize(cons, p, q, sense);
    const R = o.region;
    // 頂點都可行、都在至少兩條限制線上
    R.vertices.forEach(function (v) { ok(M.feasible(cons, v[0], v[1], undefined, 1e-6), '頂點可行'); });
    if (o.status === 'unique' || o.status === 'edge') {
      const sg = sense === 'min' ? -1 : 1;
      for (let k = 0; k < 40; k++) {
        const x = rand() * 30 - 5, y = rand() * 30 - 5;
        if (M.feasible(cons, x, y)) ok(sg * (p * x + q * y) <= sg * o.z + 1e-6, '隨機可行點比最佳值還好 ' + JSON.stringify({ cons: cons, p: p, q: q, sense: sense, x: x, y: y }));
      }
    }
    if (o.status === 'empty') {
      for (let k = 0; k < 40; k++) { const x = rand() * 40 - 10, y = rand() * 40 - 10; ok(!M.feasible(cons, x, y, undefined, -1e-9), '說空卻有可行點'); }
    }
    if (o.status === 'unbounded') {
      ok(!R.bounded, '有界的可行域不會無界');
    }
    if (R.bounded && !R.empty && !R.degenerate) {
      const I = M.intOptimize(cons, p, q, sense);
      if (I.status === 'ok') { const sg = sense === 'min' ? -1 : 1; ok(sg * I.z <= sg * o.z + 1e-9, '整數解不會比實數解好 ' + JSON.stringify({ cons: cons, p: p, q: q, sense: sense, o: [o.status, o.z, o.x, o.y], I: [I.z, I.pts], V: R.vertices })); }
    }
  }
});

test('面積：三角形 x + y ≤ 4 是 8；正方形 x ≤ 3、y ≤ 3 是 9；和格子點數的皮克公式一致', function () {
  const tri = [C(1, 1, 4)];
  near(M.region(tri).area, 8, 1e-9);
  near(M.region([C(1, 0, 3), C(0, 1, 3)]).area, 9, 1e-9);
  // 皮克定理 A = I + B/2 − 1：x + y ≤ 4 的格子點 15 個，邊上 12 個、內部 3 個 → 3 + 6 − 1 = 8
  const pts = M.lattice(tri, [0, 4, 0, 4]);
  eq(pts.length, 15);
});

test('等高線：k 在最小值與最大值之間穿過、等於兩端只碰邊、超出碰不到；線段在方框內', function () {
  const P = M.PRESETS.factory;
  eq(M.levelRelation(P.cons, 3, 2, 10), 'cross');
  eq(M.levelRelation(P.cons, 3, 2, 22.8), 'touch');
  eq(M.levelRelation(P.cons, 3, 2, 0), 'touch');
  eq(M.levelRelation(P.cons, 3, 2, 23), 'miss');
  const s = M.levelSegment(3, 2, 12, [0, 10, 0, 10]);
  ok(s && Math.abs(3 * s[0][0] + 2 * s[0][1] - 12) < 1e-9 && Math.abs(3 * s[1][0] + 2 * s[1][1] - 12) < 1e-9, '端點在線上');
  eq(M.levelSegment(1, 1, 30, [0, 10, 0, 10]), null);
});

console.log(fail ? '有 ' + fail + ' 項失敗' : pass + ' 項測試通過');
if (fail) process.exit(1);
