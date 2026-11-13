/* 三角形的四心與歐拉線：數學核心的單元測試。用法：node tests/triangle-centers-core.test.js */
'use strict';
const M = require('../js/triangle-centers-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b); }
function nearP(P, Q, tol, msg) { near(P[0], Q[0], tol, msg + ' x'); near(P[1], Q[1], tol, msg + ' y'); }
let seed = 11;
const rand = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const randTri = function () {
  for (;;) {
    const A = [rand() * 10 - 5, rand() * 10 - 5], B = [rand() * 10 - 5, rand() * 10 - 5], C = [rand() * 10 - 5, rand() * 10 - 5];
    const m = M.measure(A, B, C);
    if (m.area > 0.5) return [A, B, C];
  }
};
const dot = (u, v) => u[0] * v[0] + u[1] * v[1];

test('定義直接驗證：G 在三條中線上、O 到三頂點等距、I 到三邊等距、H 在三條高上', function () {
  for (let t = 0; t < 1500; t++) {
    const [A, B, C] = randTri(), c = M.centers(A, B, C);
    // 重心在中線上：A、G、BC 中點共線，AG = 2 GM
    near(M.dist(A, c.G), 2 * M.dist(c.G, c.mids[0]), 1e-9, 'AG = 2GM');
    near(Math.abs(M.cross(A, c.G, c.mids[0])), 0, 1e-8, 'A、G、M 共線');
    near(M.dist(c.O, A), M.dist(c.O, B), 1e-8, 'OA = OB'); near(M.dist(c.O, A), M.dist(c.O, C), 1e-8, 'OA = OC');
    near(M.dist(c.O, A), c.R, 1e-8 * c.R, 'OA = R');
    near(M.distLine(c.I, A, B), c.r, 1e-9, 'I 到 AB = r'); near(M.distLine(c.I, B, C), c.r, 1e-9, 'I 到 BC = r');
    near(M.distLine(c.I, C, A), c.r, 1e-9, 'I 到 CA = r');
    near(dot(M.sub(c.H, A), M.sub(C, B)), 0, 1e-7 * (1 + M.dist(c.H, A)), 'AH ⊥ BC');
    near(dot(M.sub(c.H, B), M.sub(A, C)), 0, 1e-7 * (1 + M.dist(c.H, B)), 'BH ⊥ CA');
    near(dot(M.sub(c.H, C), M.sub(B, A)), 0, 1e-7 * (1 + M.dist(c.H, C)), 'CH ⊥ AB（第三條高也過 H）');
    ok(c.where.G === 'in' && c.where.I === 'in', '重心、內心一定在內部');
  }
});
test('歐拉線：H = A + B + C − 2O、O、G、H 共線、OG : GH = 1 : 2', function () {
  for (let t = 0; t < 1500; t++) {
    const [A, B, C] = randTri(), c = M.centers(A, B, C);
    const H2 = [A[0] + B[0] + C[0] - 2 * c.O[0], A[1] + B[1] + C[1] - 2 * c.O[1]];
    nearP(c.H, H2, 1e-6 * (1 + c.R), '向量式');
    if (c.OH > 1e-3) {
      near(c.ratio, 1 / 3, 1e-6, 'OG／OH');
      near(c.GH, 2 * c.OG, 1e-6 * (1 + c.OH), 'GH = 2OG');
      near(Math.abs(M.cross(c.O, c.G, c.H)) / c.OH, 0, 1e-6 * (1 + c.R), '共線');
    }
    nearP(c.N, M.mid(c.O, c.H), 1e-12, 'N 是 OH 中點');
  }
});
test('九點圓：圓心 N、半徑 R／2 通過三邊中點、三垂足、頂點到垂心的三個中點；費爾巴哈：與內切圓內切', function () {
  for (let t = 0; t < 1500; t++) {
    const [A, B, C] = randTri(), c = M.centers(A, B, C);
    for (const P of c.mids.concat(c.feet, c.eul)) near(M.dist(c.N, P), c.nineR, 1e-7 * (1 + c.R), '九點');
    near(c.feuerGap, 0, 1e-7 * (1 + c.R), 'IN = R／2 − r');
    // 也與三個旁切圓外切：|N E_a| = R／2 + r_a，r_a = 面積／(s − a)
    const m = c.m, ra = m.area / (m.s - m.a);
    near(M.dist(c.N, c.ex[0]), c.nineR + ra, 1e-6 * (1 + c.R + ra), '與 A 旁切圓外切');
  }
});
test('歐拉公式 OI^2 = R(R − 2r)、R ≥ 2r（等號只在正三角形）', function () {
  for (let t = 0; t < 1500; t++) {
    const [A, B, C] = randTri(), c = M.centers(A, B, C);
    near(c.eulerGap, 0, 1e-7 * (1 + c.R * c.R), '歐拉公式');
    ok(c.R >= 2 * c.r - 1e-9, 'R ≥ 2r');
  }
  const e = M.centers([0, 0], [2, 0], [1, Math.sqrt(3)]);
  near(e.R, 2 * e.r, 1e-12, '正三角形 R = 2r'); near(e.OH, 0, 1e-12, '四心重合'); near(e.OI, 0, 1e-12);
  ok(isNaN(e.ratio), '正三角形沒有歐拉線');
});
test('四心的位置：銳角時 O、H 在內部；直角時 H 在直角頂點、O 在斜邊中點；鈍角時 O、H 在外部', function () {
  const a = M.centers([0, 0], [6, 0], [2, 4]);
  ok(a.kind === 'acute' && a.where.O === 'in' && a.where.H === 'in', '銳角');
  const r = M.centers([0, 0], [4, 0], [0, 3]);
  ok(r.kind === 'right', '直角'); nearP(r.H, [0, 0], 1e-12, 'H 在直角頂點'); nearP(r.O, [2, 1.5], 1e-12, 'O 在斜邊中點');
  ok(r.where.O === 'on' && r.where.H === 'on', '直角時 O、H 在邊上');
  near(r.ratio, 1 / 3, 1e-12, '直角也成立');
  const o = M.centers([0, 0], [6, 0], [-1, 2]);
  ok(o.kind === 'obtuse' && o.where.O === 'out' && o.where.H === 'out', '鈍角');
  // 等腰：四心都在對稱軸上，I 也在歐拉線上
  const i = M.centers([0, 0], [6, 0], [3, 5]);
  near(i.G[0], 3, 1e-12); near(i.O[0], 3, 1e-12); near(i.I[0], 3, 1e-12); near(i.H[0], 3, 1e-12);
  near(i.Ioff, 0, 1e-12, 'I 在歐拉線上'); ok(M.isosceles(i.m, 1e-9) === 'C', '頂點 C');
  // 不等腰時 I 不在歐拉線上
  const s = M.centers([0, 0], [6, 0], [1, 4]);
  ok(s.Ioff > 0.05, '不等腰時 I 偏離歐拉線');
});
test('旁心：到三條邊所在直線等距（旁切圓半徑 = 面積／(s − a)）；挑戰題目合理', function () {
  for (let t = 0; t < 500; t++) {
    const [A, B, C] = randTri(), c = M.centers(A, B, C), m = c.m;
    const ra = m.area / (m.s - m.a), E = c.ex[0];
    near(M.distLine(E, A, B), ra, 1e-7 * (1 + ra)); near(M.distLine(E, B, C), ra, 1e-7 * (1 + ra)); near(M.distLine(E, C, A), ra, 1e-7 * (1 + ra));
  }
  seed = 3;
  const seen = {};
  for (let t = 0; t < 400; t++) {
    const g = M.challenge(rand), c = M.centers(g.P[0], g.P[1], g.P[2]);
    seen[g.ask] = 1;
    nearP(g.at, c[g.ask], 1e-12, '題目點');
    ok(c.m.area >= 6 && Math.min(c.m.A, c.m.B, c.m.C) >= 20, '不出太扁');
    const ks = ['G', 'O', 'I', 'H'];
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) ok(M.dist(c[ks[i]], c[ks[j]]) >= 0.6, '四心分得開');
  }
  ok(seen.G && seen.O && seen.I && seen.H, '四種都會出');
});

console.log(fail ? '\n' + fail + ' 項失敗、' + pass + ' 項通過' : '\n全部 ' + pass + ' 項通過');
process.exit(fail ? 1 : 0);
