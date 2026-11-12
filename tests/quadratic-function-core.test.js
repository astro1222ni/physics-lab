/* 二次函數：頂點、判別式與配方：數學核心的單元測試。用法：node tests/quadratic-function-core.test.js */
'use strict';
const M = require('../js/quadratic-function-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b); }
const R = M.rng(23);
const r1 = function (lo, hi) { return Math.round((lo + R() * (hi - lo)) * 10) / 10; };
const ra = function () { let a = 0; while (a === 0) a = r1(-3, 3); return a; };

test('頂點式與一般式互換；頂點是最低點（a > 0）或最高點（a < 0）；對稱軸兩側對稱', function () {
  for (let t = 0; t < 3000; t++) {
    const a = ra(), b = r1(-20, 20), c = r1(-20, 20);
    const v = M.vertex(a, b, c), bc = M.fromVertex(a, v.h, v.k);
    near(bc.b, b, 1e-9); near(bc.c, c, 1e-9);
    near(M.evalQ(a, b, c, v.h), v.k, 1e-9, '頂點在圖形上');
    const d = r1(0.1, 5);
    near(M.evalQ(a, b, c, v.h + d), M.evalQ(a, b, c, v.h - d), 1e-8, '對稱');
    ok(a > 0 ? M.evalQ(a, b, c, v.h + d) > v.k : M.evalQ(a, b, c, v.h + d) < v.k, '頂點是極值');
    // 頂點式：a (x − h)² + k 和一般式在任一點相同
    const x = r1(-7, 7);
    near(a * (x - v.h) * (x - v.h) + v.k, M.evalQ(a, b, c, x), 1e-8);
  }
  const v = M.vertex(1, -2, -3); eq(v.h, 1); eq(v.k, -4);
  const bc = M.fromVertex(-2, 0.5, 4.5); eq(bc.b, 2); eq(bc.c, 4);
});

test('判別式與實根：D > 0 兩個、D = 0 一個、D < 0 沒有；根代回去是 0；根與係數的關係', function () {
  let n2 = 0, n1 = 0, n0 = 0;
  for (let t = 0; t < 5000; t++) {
    const a = ra(), b = r1(-20, 20), c = r1(-20, 20);
    const D = M.disc(a, b, c), xs = M.roots(a, b, c), s = M.sgnD(D);
    eq(xs.length, s > 0 ? 2 : s === 0 ? 1 : 0, 'D = ' + D);
    xs.forEach(function (x) { near(M.evalQ(a, b, c, x) / Math.max(1, Math.abs(a) * x * x + Math.abs(b * x) + Math.abs(c)), 0, 1e-12, '根代回去'); });
    if (xs.length === 2) { n2++; ok(xs[0] < xs[1]); near(xs[0] + xs[1], -b / a, 1e-8, '兩根和'); near(xs[0] * xs[1], c / a, 1e-7, '兩根積'); }
    else if (xs.length === 1) n1++; else n0++;
  }
  ok(n2 > 1000 && n0 > 500, '兩種都有 ' + n2 + '、' + n0);
  // 二重根：(x − 1.3)² = x² − 2.6x + 1.69
  const d = M.roots(1, -2.6, 1.69); eq(d.length, 1); near(d[0], 1.3, 1e-12);
  ok(M.sgnD(M.disc(1, -2.6, 1.69)) === 0, '浮點誤差下 D 仍判為 0');
  // b = 0：x² − 3
  const e = M.roots(1, 0, -3); near(e[0], -Math.sqrt(3), 1e-12); near(e[1], Math.sqrt(3), 1e-12);
  // 相減失準：x² − 1e4 x + 1 的小根約 1e-4
  const f = M.roots(1, -1e4, 1); near(f[0], 1.00000001e-4, 1e-16, "小根不失準");
  // 預設 x² − 2x − 3 = (x + 1)(x − 3)
  const g = M.roots(1, -2, -3); eq(g[0], -1); eq(g[1], 3); eq(M.disc(1, -2, -3), 16);
});

test('閉區間上的最大最小值：和逐點取樣一致；頂點在區間裡才算', function () {
  for (let t = 0; t < 2000; t++) {
    const a = ra(), b = r1(-8, 8), c = r1(-8, 8);
    let p = r1(-7, 7), q = r1(-7, 7);
    if (p === q) continue;
    const r = M.rangeOn(a, b, c, p, q);
    let mx = -Infinity, mn = Infinity;
    for (let i = 0; i <= 4000; i++) { const x = r.lo + (r.hi - r.lo) * i / 4000, y = M.evalQ(a, b, c, x); mx = Math.max(mx, y); mn = Math.min(mn, y); }
    ok(r.max >= mx - 1e-9 && r.max - mx < 0.01 * Math.max(1, Math.abs(mx)), '最大值 ' + r.max + ' 取樣 ' + mx);
    ok(r.min <= mn + 1e-9 && mn - r.min < 0.01 * Math.max(1, Math.abs(mn)), '最小值 ' + r.min + ' 取樣 ' + mn);
    r.maxAt.forEach(function (x) { near(M.evalQ(a, b, c, x), r.max, 1e-9); });
    r.minAt.forEach(function (x) { near(M.evalQ(a, b, c, x), r.min, 1e-9); });
  }
  // x² − 2x − 3 在 [−2, 3]：最大 5（x = −2）、最小 −4（頂點 x = 1）
  const r = M.rangeOn(1, -2, -3, -2, 3);
  eq(r.max, 5); eq(r.maxAt[0], -2); eq(r.min, -4); eq(r.minAt[0], 1); ok(r.vertexIn);
  // 頂點在區間外：[2, 4] 上最小在 2
  const s = M.rangeOn(1, -2, -3, 2, 4); eq(s.min, -3); eq(s.minAt[0], 2); eq(s.max, 5); ok(!s.vertexIn);
  // 對稱的區間：[−1, 3] 兩端一樣高，最大值出現在兩處
  const u = M.rangeOn(1, -2, -3, -1, 3); eq(u.max, 0); eq(u.maxAt.length, 2);
});

test('拋物線與直線：聯立的判別式決定交點個數；判別式為 0 時是切線（切點的斜率 2ax + b = m）', function () {
  for (let t = 0; t < 3000; t++) {
    const a = ra(), b = r1(-8, 8), c = r1(-8, 8), m = r1(-6, 6), n = r1(-10, 10);
    const I = M.intersect(a, b, c, m, n);
    I.pts.forEach(function (p) { near(M.evalQ(a, b, c, p[0]), p[1], 1e-7, '交點在拋物線上'); });
    eq(I.xs.length, M.sgnD(I.D) > 0 ? 2 : M.sgnD(I.D) === 0 ? 1 : 0);
  }
  // y = x² − 2x − 3 與 y = 2x − 7 相切於 x = 2
  const T = M.intersect(1, -2, -3, 2, -7);
  eq(M.sgnD(T.D), 0); eq(T.xs.length, 1); near(T.xs[0], 2, 1e-12); near(2 * 1 * T.xs[0] + -2, 2, 1e-12, '切點的斜率');
  // 與 y = −x − 1 交於 x = −1、2
  const U = M.intersect(1, -2, -3, -1, -1);
  near(U.xs[0], -1, 1e-12); near(U.xs[1], 2, 1e-12);
  // 開口向下的頂點：y = −x² + 4x 與 y = 4 相切於頂點 (2, 4)
  const V = M.intersect(-1, 4, 0, 0, 4); eq(V.xs.length, 1); near(V.xs[0], 2, 1e-12);
});

test('配方的幾何：四塊拼成 (x + p/2)²；面積補上 (p/2)² 後兩邊相等；花拉子米 x² + 10x = 39 的根是 3', function () {
  for (let t = 0; t < 2000; t++) {
    const p = Math.round(R() * 20) / 2, q = Math.round(R() * 160) / 2, x = r1(0, 10);
    const pc = M.pieces(x, p);
    near(pc.sq + 2 * pc.halfRect + pc.corner, pc.big, 1e-9, '四塊的面積和');
    near(pc.total + pc.corner, pc.big, 1e-9);
    const cs = M.completeSquare(p, q);
    near(cs.root * cs.root + p * cs.root, q, 1e-9, '正根代回去');
    near(cs.other * cs.other + p * cs.other, q, 1e-8, '負根代回去');
    ok(cs.root >= -1e-12, '正根不小於 0');
    near((cs.root + cs.half) * (cs.root + cs.half), q + cs.corner, 1e-9);
  }
  const k = M.completeSquare(10, 39); eq(k.root, 3); eq(k.S, 8); eq(k.corner, 25); eq(k.other, -13);
  const g = M.completeSquare(1, 1); near(g.root, (Math.sqrt(5) - 1) / 2, 1e-15, '黃金比');
  near(1 / g.root, 1 + g.root, 1e-12, '1/φ = 1 + 1/φ 的另一種寫法');
  const z = M.completeSquare(6, 0); eq(z.root, 0);
});

test('KaTeX 文字；挑戰 3000 題：頂點整數、b、c 在 ±20 內且是 0.1 的倍數、提示點在圖形上、答案唯一', function () {
  eq(M.quadTex(1, -2, -3), 'x^2 - 2x - 3');
  eq(M.quadTex(-0.5, 0, 4.5), '-0.5x^2 + 4.5');
  eq(M.quadTex(2, 1, 0), '2x^2 + x');
  eq(M.quadTex(-1, -1, -1), '-x^2 - x - 1');
  eq(M.vertexTex(1, 1, -4), '(x - 1)^2 - 4');
  eq(M.vertexTex(-2, -0.5, 0), '-2(x + 0.5)^2');
  eq(M.vertexTex(0.5, 0, 3), '0.5x^2 + 3');
  const G = M.rng(5); let last = null;
  for (let t = 0; t < 3000; t++) {
    const c = M.genChallenge(G, last);
    ok(c, '出得了題');
    ok(M.A_CHOICES.indexOf(c.a) >= 0 && Number.isInteger(c.h) && Number.isInteger(c.k));
    ok(Math.abs(c.b) <= 20 && Math.abs(c.c) <= 20, 'b、c 在範圍內');
    near(c.b * 10, Math.round(c.b * 10), 1e-6, 'b 是 0.1 的倍數'); near(c.c * 10, Math.round(c.c * 10), 1e-6, 'c 是 0.1 的倍數');
    const v = M.vertex(c.a, c.b, c.c); near(v.h, c.h, 1e-9); near(v.k, c.k, 1e-9);
    ok(Number.isInteger(c.pt[0]) && Number.isInteger(c.pt[1]), '提示點是整數點');
    near(M.evalQ(c.a, c.b, c.c, c.pt[0]), c.pt[1], 1e-9, '提示點在圖形上');
    ok(c.pt[0] !== c.h, '提示點不是頂點');
    // 頂點與提示點唯一決定 a：(y − k) = a (x − h)²
    near((c.pt[1] - c.k) / ((c.pt[0] - c.h) * (c.pt[0] - c.h)), c.a, 1e-12);
    ok(!last || !(last.a === c.a && last.h === c.h && last.k === c.k), '不和上一題相同');
    last = c;
  }
});

console.log('\n' + (fail ? fail + ' 項失敗、' : '') + pass + ' 項測試通過。');
if (fail) process.exit(1);
