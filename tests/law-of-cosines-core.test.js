/* 正弦定理、餘弦定理與解三角形：數學核心的單元測試。用法：node tests/law-of-cosines-core.test.js */
'use strict';
const M = require('../js/law-of-cosines-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b); }
let seed = 7;
const rand = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const D2R = Math.PI / 180;
const randTri = function () {
  for (;;) {
    const A = [rand() * 10 - 5, rand() * 10 - 5], B = [rand() * 10 - 5, rand() * 10 - 5], C = [rand() * 10 - 5, rand() * 10 - 5];
    const m = M.measure(A, B, C);
    if (m.area > 0.5) return { A: A, B: B, C: C, m: m };
  }
};

test('熟悉的三角形：3-4-5 是直角、等邊三角形每角 60°、R = a／√3、7-8-9 的角', function () {
  const r = M.solveSSS(3, 4, 5)[0];
  near(r.C, 90, 1e-9, '3-4-5 的 C'); ok(M.kind(r) === 'right', '直角');
  const e = M.measure([0, 0], [2, 0], [1, Math.sqrt(3)]);
  near(e.A, 60, 1e-9); near(e.B, 60, 1e-9); near(e.C, 60, 1e-9); near(e.R, 2 / Math.sqrt(3), 1e-12, 'R');
  near(e.r, e.R / 2, 1e-12, '等邊三角形 r = R／2');
  const s = M.solveSSS(7, 8, 9)[0];
  near(Math.cos(s.C * D2R), 2 / 7, 1e-12, 'cos C = (49 + 64 − 81)／112 = 2／7');
  ok(M.solveSSS(1, 2, 3).length === 0 && M.solveSSS(1, 2, 3.5).length === 0, '三角不等式');
});
test('隨機 2000 個三角形：餘弦定理三條都成立、正弦定理 a／sin A = 2R、三內角和 180°、面積 = ½ab sin C', function () {
  for (let t = 0; t < 2000; t++) {
    const T = randTri(), m = T.m;
    near(m.c * m.c, m.a * m.a + m.b * m.b - 2 * m.a * m.b * Math.cos(m.C * D2R), 1e-8 * (1 + m.c * m.c), '餘弦 c');
    near(m.a * m.a, m.b * m.b + m.c * m.c - 2 * m.b * m.c * Math.cos(m.A * D2R), 1e-8 * (1 + m.a * m.a), '餘弦 a');
    near(m.a / Math.sin(m.A * D2R), 2 * m.R, 1e-7 * m.R, '正弦 a'); near(m.b / Math.sin(m.B * D2R), 2 * m.R, 1e-7 * m.R, '正弦 b');
    near(m.c / Math.sin(m.C * D2R), 2 * m.R, 1e-7 * m.R, '正弦 c');
    near(m.A + m.B + m.C, 180, 1e-9, '內角和');
    near(m.area, 0.5 * m.a * m.b * Math.sin(m.C * D2R), 1e-8 * (1 + m.area), '面積');
    const O = M.circumcenter(T.A, T.B, T.C);
    near(M.dist(O, T.A), m.R, 1e-7 * m.R); near(M.dist(O, T.B), m.R, 1e-7 * m.R); near(M.dist(O, T.C), m.R, 1e-7 * m.R);
  }
});
test('place 與 measure 互逆；SSS、SAS、ASA 解回原三角形', function () {
  for (let t = 0; t < 1000; t++) {
    const m = randTri().m;
    const P = M.place(m.a, m.b, m.c), q = M.measure(P.A, P.B, P.C);
    near(q.a, m.a, 1e-8); near(q.b, m.b, 1e-8); near(q.c, m.c, 1e-8); ok(P.C[1] >= 0, 'C 在上方');
    const s1 = M.solveSSS(m.a, m.b, m.c)[0]; near(s1.A, m.A, 1e-6, 'SSS A'); near(s1.C, m.C, 1e-6, 'SSS C');
    const s2 = M.solveSAS(m.b, m.c, m.A)[0]; near(s2.a, m.a, 1e-8 * (1 + m.a), 'SAS a'); near(s2.B, m.B, 1e-6, 'SAS B');
    const s3 = M.solveASA(m.A, m.B, m.c)[0]; near(s3.a, m.a, 1e-7 * (1 + m.a), 'ASA a'); near(s3.b, m.b, 1e-7 * (1 + m.b), 'ASA b');
  }
  ok(M.solveASA(100, 80, 3).length === 0, '兩角和 ≥ 180° 無解');
});
test('SSA：A = 30°、b = 10 時，a < 5 無解、a = 5 一解（直角）、5 < a < 10 兩解、a ≥ 10 一解', function () {
  ok(M.solveSSA(30, 10, 4.9).length === 0, 'a = 4.9');
  const r = M.solveSSA(30, 10, 5); ok(r.length === 1, 'a = 5 一解'); near(r[0].B, 90, 1e-6, '直角');
  const two = M.solveSSA(30, 10, 7); ok(two.length === 2, 'a = 7 兩解');
  near(two[0].B + two[1].B, 180, 1e-9, '兩解的 B 互補');
  ok(M.solveSSA(30, 10, 12).length === 1, 'a = 12 一解');
  ok(M.solveSSA(30, 10, 10).length === 1, 'a = b 一解（等腰，另一解退化）');
  ok(M.solveSSA(120, 5, 4).length === 0 && M.solveSSA(120, 5, 6).length === 1, '鈍角：a ≤ b 無解、a > b 一解');
  ['short', 'right', 'two', 'big'].forEach(function (w, i) { ok(M.ssaCase(30, 10, [4.9, 5, 7, 12][i]).why === w, w); });
});
test('SSA 隨機 3000 組：解的個數和 ssaCase 一致、每個解都真的滿足已知條件', function () {
  for (let t = 0; t < 3000; t++) {
    const A = 1 + rand() * 178, b = 0.5 + rand() * 9, a = 0.5 + rand() * 9;
    const s = M.solveSSA(A, b, a);
    ok(s.length === M.ssaCase(A, b, a).n, 'A = ' + A + '、b = ' + b + '、a = ' + a + '：' + s.length + ' 對 ' + M.ssaCase(A, b, a).n);
    s.forEach(function (r) {
      const P = M.place(r.a, r.b, r.c), q = M.measure(P.A, P.B, P.C);
      near(q.A, A, 1e-6, 'A'); near(q.a, a, 1e-7); near(q.b, b, 1e-7);
    });
  }
});
test('挑戰 3000 題：三角形不扁、答案正確、自己答自己一定對、差 2% 或 1° 一定錯', function () {
  for (let t = 0; t < 3000; t++) {
    const g = M.challenge(rand), s = g.sol;
    ok(Math.min(s.A, s.B, s.C) >= 15 && Math.min(s.a, s.b, s.c) >= 1.5, '不扁');
    ok(M.answerOK(g.answer, g.ask, g.answer), '自己答');
    const ang = /[ABC]/.test(g.ask);
    ok(!M.answerOK(ang ? g.answer + 1 : g.answer * 1.02, g.ask, g.answer), '差一點要錯');
    const m = M.measure(M.place(s.a, s.b, s.c).A, M.place(s.a, s.b, s.c).B, M.place(s.a, s.b, s.c).C);
    near(m[g.ask], g.answer, 1e-6, g.type + ' ' + g.ask);
  }
});
console.log(pass + ' 項測試通過' + (fail ? '，' + fail + ' 項失敗' : ''));
if (fail) process.exit(1);
