/* 直線與圓：數學核心的單元測試。用法：node tests/lines-circles-core.test.js */
'use strict';
const G = require('../js/lines-circles-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
const onCircle = (p, h, k, r) => Math.abs(Math.hypot(p[0] - h, p[1] - k) - r) < 1e-9;
const onLine = (p, a, b, c) => Math.abs(a * p[0] + b * p[1] + c) < 1e-9 * Math.max(1, Math.hypot(a, b));

test('點到直線距離：已知值、垂足在直線上、垂足到點的距離就是 d', function () {
  near(G.dist(3, 4, -25, 0, 0), 5, 1e-12, '3x + 4y = 25 到原點');
  near(G.dist(1, 0, -2, 5, 7), 3, 1e-12, '鉛直線 x = 2');
  near(G.dist(0, 1, 3, 1, 1), 4, 1e-12, '水平線 y = −3');
  near(G.signedDist(1, 1, 0, 1, 1), Math.SQRT2, 1e-12);
  near(G.signedDist(1, 1, 0, -1, -1), -Math.SQRT2, 1e-12, '另一側是負的');
  ok(G.dist(0, 0, 1, 0, 0) === null, 'a = b = 0 不是直線');
  const f = G.foot(3, 4, -25, 0, 0); near(f[0], 3, 1e-12); near(f[1], 4, 1e-12);
  const rand = G.rng(3);
  for (let t = 0; t < 300; t++) {
    const a = rand() * 10 - 5, b = rand() * 10 - 5, c = rand() * 20 - 10, x = rand() * 20 - 10, y = rand() * 20 - 10;
    const p = G.foot(a, b, c, x, y);
    ok(onLine(p, a, b, c), '垂足在直線上');
    near(Math.hypot(p[0] - x, p[1] - y), G.dist(a, b, c, x, y), 1e-9, '垂線段長 = d');
    near(G.dist(2 * a, 2 * b, 2 * c, x, y), G.dist(a, b, c, x, y), 1e-9, '係數同乘不變');
  }
});

test('交點：相交時兩點都在直線與圓上、弦長公式；相切時一點；相離時沒有', function () {
  const rand = G.rng(11);
  let seen = { apart: 0, tangent: 0, cross: 0 };
  for (let t = 0; t < 500; t++) {
    const a = Math.round(rand() * 12 - 6), b = Math.round(rand() * 12 - 6);
    if (!a && !b) continue;
    const c = Math.round(rand() * 40 - 20), h = rand() * 10 - 5, k = rand() * 10 - 5, r = 0.5 + rand() * 6;
    const d = G.dist(a, b, c, h, k), rel = G.relation(d, r), P = G.intersections(a, b, c, h, k, r);
    seen[rel]++;
    if (rel === 'cross') {
      ok(P.length === 2, '兩個交點');
      P.forEach(p => { ok(onLine(p, a, b, c), '在直線上'); ok(onCircle(p, h, k, r), '在圓上'); });
      near(Math.hypot(P[0][0] - P[1][0], P[0][1] - P[1][1]), G.chord(d, r), 1e-9, '弦長');
    } else if (rel === 'apart') ok(P.length === 0 && G.chord(d, r) === null);
  }
  ok(seen.apart > 50 && seen.cross > 50, '兩種情形都有測到');
  const T = G.intersections(3, 4, -25, 0, 0, 5);
  ok(T.length === 1 && Math.abs(T[0][0] - 3) < 1e-12 && Math.abs(T[0][1] - 4) < 1e-12, '3x + 4y = 25 切圓 x² + y² = 25 於 (3, 4)');
  // 整數交點：x − y + 1 = 0 與 x² + y² = 25 交於 (−4, −3)、(3, 4)
  const Q = G.intersections(1, -1, 1, 0, 0, 5);
  near(Q[0][0], -4, 1e-12); near(Q[0][1], -3, 1e-12); near(Q[1][0], 3, 1e-12); near(Q[1][1], 4, 1e-12);
});

test('代入法：判別式的正負號和 r − d 相同，Δ/4 = b²[(a² + b²)r² − (ah + bk + c)²]；根就是交點的 x', function () {
  const rand = G.rng(17);
  for (let t = 0; t < 500; t++) {
    const a = Math.round(rand() * 12 - 6), b = Math.round(rand() * 12 - 6);
    if (!a && !b) continue;
    const c = Math.round(rand() * 40 - 20), h = Math.round(rand() * 10 - 5), k = Math.round(rand() * 10 - 5), r = 0.5 + Math.round(rand() * 12) / 2;
    const q = G.quadratic(a, b, c, h, k, r), d = G.dist(a, b, c, h, k);
    if (Math.abs(d - r) > 1e-6) ok(Math.sign(q.disc) === Math.sign(r - d), '正負號一致');
    if (b) near(q.disc / 4, b * b * ((a * a + b * b) * r * r - Math.pow(a * h + b * k + c, 2)), 1e-6 * Math.max(1, Math.abs(q.disc)), 'Δ/4 公式');
    if (q.disc > 1e-9 && G.relation(d, r) === 'cross') {
      const roots = [(-q.B - Math.sqrt(q.disc)) / (2 * q.A), (-q.B + Math.sqrt(q.disc)) / (2 * q.A)].sort((u, v) => u - v);
      const P = G.intersections(a, b, c, h, k, r);
      const xs = P.map(p => (q.v === 'x' ? p[0] : p[1])).sort((u, v) => u - v);
      near(roots[0], xs[0], 1e-7, '根 = 交點坐標'); near(roots[1], xs[1], 1e-7);
    }
  }
  const v = G.quadratic(1, 0, -2, 0, 0, 3);
  ok(v.v === 'y' && Math.abs(v.disc - 4 * 5) < 1e-12, '鉛直線 x = 2：y² = 5');
  near(G.quadratic(3, 4, -25, 0, 0, 5).disc, 0, 1e-9, '相切 Δ = 0');
});

test('圓外一點的切線：切點在圓上、半徑和切線垂直、切線長 √(L² − r²)、切線到圓心距離 = r', function () {
  const t = G.tangentsFrom(5, 0, 0, 0, 3);
  near(t.len, 4, 1e-12, '3-4-5'); near(t.angle, 2 * Math.asin(0.6) * 180 / Math.PI, 1e-9);
  const rand = G.rng(23);
  for (let i = 0; i < 300; i++) {
    const h = rand() * 10 - 5, k = rand() * 10 - 5, r = 0.5 + rand() * 5, px = rand() * 20 - 10, py = rand() * 20 - 10;
    const s = G.tangentsFrom(px, py, h, k, r);
    if (s.inside) { ok(Math.hypot(px - h, py - k) < r && !s.pts.length); continue; }
    if (s.on) continue;
    ok(s.pts.length === 2 && s.lines.length === 2);
    s.pts.forEach((T, j) => {
      ok(onCircle(T, h, k, r), '切點在圓上');
      near((T[0] - h) * (px - T[0]) + (T[1] - k) * (py - T[1]), 0, 1e-8, 'CT ⊥ TP');
      near(Math.hypot(px - T[0], py - T[1]), s.len, 1e-9, '切線長');
      near(G.dist(s.lines[j].a, s.lines[j].b, s.lines[j].c, h, k), r, 1e-9, '切線到圓心 = r');
      ok(onLine([px, py], s.lines[j].a, s.lines[j].b, s.lines[j].c), '切線過 P');
    });
    near(G.angleBetween(s.lines[0], s.lines[1]), s.angle > 90 ? 180 - s.angle : s.angle, 1e-7, '兩切線夾角');
  }
  // 兩切線垂直：L = r√2
  near(G.tangentsFrom(3 * Math.SQRT2, 0, 0, 0, 3).angle, 90, 1e-9);
  const on = G.tangentsFrom(3, 4, 0, 0, 5);
  ok(on.on && on.pts.length === 1 && onLine([3, 4], on.lines[0].a, on.lines[0].b, on.lines[0].c), '點在圓上：一條切線');
  near(G.dist(on.lines[0].a, on.lines[0].b, on.lines[0].c, 0, 0), 5, 1e-12);
  ok(G.tangentsFrom(1, 1, 0, 0, 5).inside, '圓內沒有切線');
});

test('挑戰：2000 題都至少有一個答案 c 在 −40 到 40，起始 c 離答案至少 3；答案真的相切，差 0.05 不算', function () {
  const rand = G.rng(2024);
  let prev = null;
  for (let t = 0; t < 2000; t++) {
    const ch = G.genChallenge(rand, prev);
    ok(ch, '出得了題');
    ok(ch.a && ch.b && ch.cs.length >= 1);
    ch.cs.forEach(c => { ok(c >= -40 && c <= 40); ok(G.chalHit(ch, c), '答案相切'); ok(!G.chalHit(ch, c + 0.05 * Math.hypot(ch.a, ch.b)), '差 0.05 就不算'); });
    ok(!G.chalHit(ch, ch.c0), '起始狀態沒有相切');
    // 打字精度 0.01 做得到
    ch.cs.forEach(c => ok(G.chalHit(ch, Math.round(c * 100) / 100), '打到小數第 2 位就行'));
    prev = ch;
  }
});

test('文字：直線與圓的方程式', function () {
  ok(G.lineEq(3, 4, -25) === '3x + 4y − 25 = 0', G.lineEq(3, 4, -25));
  ok(G.lineEq(1, -1, 1) === 'x − y + 1 = 0', G.lineEq(1, -1, 1));
  ok(G.lineEq(0, -2, 0.5) === '−2y + 0.5 = 0', G.lineEq(0, -2, 0.5));
  ok(G.lineEq(-1, 0, 0) === '−x = 0');
  ok(G.circleEq(0, 0, 5) === 'x² + y² = 25', G.circleEq(0, 0, 5));
  ok(G.circleEq(2, -3, 1.5) === '(x − 2)² + (y + 3)² = 2.25', G.circleEq(2, -3, 1.5));
  ok(G.trim(2.50, 2) === '2.5' && G.trim(-0.0001, 2) === '0');
});

console.log('\n' + (fail ? fail + ' 項失敗、' : '') + pass + ' 項測試通過。');
if (fail) process.exit(1);
