/* 畢氏定理的拼圖證明：數學核心的單元測試。用法：node tests/pythagoras-core.test.js */
'use strict';
const M = require('../js/pythagoras-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b); }
let seed = 3;
const rand = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const legs = function () { return [0.5 + rand() * 12, 0.5 + rand() * 12]; };
/** 兩個凸多邊形重疊的面積（用其中一個的每條邊去切另一個） */
function overlap(P, Q) {
  const s = M.area(Q) > 0 ? 1 : -1;
  let R = P.slice();
  for (let i = 0; i < Q.length && R.length; i++) {
    const p = Q[i], q = Q[(i + 1) % Q.length], e = M.sub(q, p);
    R = M.clip(R, p, [-e[1] * s, e[0] * s]);
  }
  return R.length >= 3 ? Math.abs(M.area(R)) : 0;
}
function inside(pts, S, tol) {
  const s = M.area(S) > 0 ? 1 : -1;
  return pts.every(function (p) { return S.every(function (q, i) { return s * M.cross(M.sub(S[(i + 1) % S.length], q), M.sub(p, q)) >= -tol; }); });
}
const len = function (v) { return Math.hypot(v[0], v[1]); };

test('三角形的量：c^2 = a^2 + b^2、r = (a + b − c)／2、h = ab／c、p + q = c、射影 a^2 = pc', function () {
  for (let t = 0; t < 2000; t++) {
    const L = legs(), a = L[0], b = L[1], T = M.tri(a, b);
    near(T.c * T.c, a * a + b * b, 1e-9 * T.c * T.c);
    near(T.area, T.r * T.per / 2, 1e-9 * T.area, '面積 = r × 半周長');
    near(T.h * T.c, a * b, 1e-9 * a * b, '斜邊上的高');
    near(T.p + T.q, T.c, 1e-9 * T.c); near(T.p * T.c, a * a, 1e-9 * a * a); near(T.q * T.c, b * b, 1e-9 * b * b);
    near(T.A + T.B, 90, 1e-9);
    near(M.cross(M.sub(T.Ap, T.Bp), M.sub(T.H, T.Bp)), 0, 1e-9 * T.c * T.c, 'H 在 AB 上');
    near(M.dot(T.H, M.sub(T.Ap, T.Bp)), 0, 1e-9 * T.c * T.c, 'CH ⊥ AB');
    near(len(T.H), T.h, 1e-9 * T.c, 'CH = h');
  }
  const k = M.tri(3, 4); near(k.c, 5, 1e-12); near(k.r, 1, 1e-12); near(k.R, 2.5, 1e-12);
});

test('平移重組：四個三角形全等、只做平移；t = 0 洞是 a^2 + b^2，t = 1 洞是 c^2', function () {
  for (let n = 0; n < 500; n++) {
    const L = legs(), a = L[0], b = L[1], c = Math.hypot(a, b), s = a + b;
    const ref = M.moveProof(a, b, 1, 2).pieces;
    [0, 0.17, 0.5, 0.83, 1].forEach(function (t) {
      const G = M.moveProof(a, b, t, 2);
      G.pieces.forEach(function (P, k) {
        near(Math.abs(M.area(P)), a * b / 2, 1e-9 * a * b, '三角形面積');
        const d0 = M.sub(P[0], ref[k][0]);
        P.forEach(function (p, i) { const d = M.sub(p, ref[k][i]); near(d[0], d0[0], 1e-9 * c, '平移 x'); near(d[1], d0[1], 1e-9 * c, '平移 y'); });
      });
    });
    const G0 = M.moveProof(a, b, 0, 0), G1 = M.moveProof(a, b, 1, 0);
    [G0, G1].forEach(function (G, w) {
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) near(overlap(G.pieces[i], G.pieces[j]), 0, 1e-9 * s * s, '三角形重疊 ' + w);
      G.pieces.forEach(function (P) { ok(inside(P, G.frame, 1e-9 * s), '在大正方形裡'); });
      const holes = w ? [G.hole1] : G.holes0;
      holes.forEach(function (h) { G.pieces.forEach(function (P) { near(overlap(P, h), 0, 1e-9 * s * s, '三角形蓋到洞'); }); });
      near(holes.reduce(function (x, h) { return x + Math.abs(M.area(h)); }, 0) + 2 * a * b, s * s, 1e-9 * s * s, '洞 + 四個三角形 = 大正方形');
    });
    near(Math.abs(M.area(G0.holes0[0])), a * a, 1e-9 * a * a); near(Math.abs(M.area(G0.holes0[1])), b * b, 1e-9 * b * b);
    near(Math.abs(M.area(G1.hole1)), c * c, 1e-9 * c * c, 'c^2 的洞');
    const h = G1.hole1;
    for (let i = 0; i < 4; i++) near(len(M.sub(h[(i + 1) % 4], h[i])), c, 1e-9 * c, '邊長 c');
    near(M.dot(M.sub(h[1], h[0]), M.sub(h[2], h[1])), 0, 1e-9 * c * c, '直角');
  }
});

test('歐幾里得：剪切與平移不改面積，最後兩個長方形 c·BH、c·AH 拼滿斜邊上的正方形', function () {
  for (let n = 0; n < 500; n++) {
    const L = legs(), a = L[0], b = L[1], T = M.tri(a, b), c = T.c;
    for (let k = 0; k <= 30; k++) {
      const G = M.euclidProof(a, b, k / 30);
      near(Math.abs(M.area(G.pieces[0])), a * a, 1e-9 * c * c, 'a^2 那一塊');
      near(Math.abs(M.area(G.pieces[1])), b * b, 1e-9 * c * c, 'b^2 那一塊');
    }
    const G = M.euclidProof(a, b, 1);
    G.pieces.forEach(function (P) { ok(inside(P, G.square, 1e-9 * c), '在 c^2 裡'); });
    near(overlap(G.pieces[0], G.pieces[1]), 0, 1e-9 * c * c, '兩塊不重疊');
    near(Math.abs(M.area(G.square)), c * c, 1e-9 * c * c);
    G.pieces.forEach(function (P) { for (let i = 0; i < 4; i++) near(M.dot(M.sub(P[(i + 1) % 4], P[i]), M.sub(P[(i + 2) % 4], P[(i + 1) % 4])), 0, 1e-8 * c * c, '直角'); });
    const G0 = M.euclidProof(a, b, 0);
    near(overlap(G0.pieces[0], G0.tri), 0, 1e-9 * c * c, 'a^2 在三角形外'); near(overlap(G0.pieces[1], G0.tri), 0, 1e-9 * c * c, 'b^2 在三角形外');
    near(Math.abs(M.area(G0.pieces[0])), a * a, 1e-9 * c * c);
  }
});

test('佩里加爾：大正方形切成四塊等面積的四邊形，只平移，加上小正方形剛好拼滿 c^2', function () {
  for (let n = 0; n < 500; n++) {
    const L = legs(), a = L[0], b = Math.abs(L[0] - L[1]) < 0.05 ? L[1] + 0.3 : L[1];
    const T = M.tri(a, b), c = T.c, big = Math.max(a, b), small = Math.min(a, b);
    const G0 = M.perigalProof(a, b, 0), G1 = M.perigalProof(a, b, 1);
    near(G0.pieces.reduce(function (s, P) { return s + Math.abs(M.area(P)); }, 0), big * big, 1e-9 * c * c, '四塊合起來是大正方形');
    const A0 = Math.abs(M.area(G0.pieces[0]));
    G0.pieces.forEach(function (P) { near(Math.abs(M.area(P)), A0, 1e-9 * c * c, '四塊等面積'); });
    G0.pieces.forEach(function (P, k) { const d0 = M.sub(G1.pieces[k][0], P[0]); P.forEach(function (p, i) { const d = M.sub(G1.pieces[k][i], p); near(d[0], d0[0], 1e-9 * c); near(d[1], d0[1], 1e-9 * c); }); });
    const parts = G1.pieces.concat([G1.small]);
    parts.forEach(function (P) { ok(inside(P, G1.square, 1e-8 * c), '在 c^2 裡'); });
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) near(overlap(parts[i], parts[j]), 0, 1e-8 * c * c, '重疊 ' + i + '、' + j);
    near(parts.reduce(function (s, P) { return s + Math.abs(M.area(P)); }, 0), c * c, 1e-9 * c * c, '五塊 = c^2');
    near(Math.abs(M.area(G1.small)), small * small, 1e-9 * c * c);
    [0.2, 0.5, 0.7].forEach(function (t) { near(M.perigalProof(a, b, t).pieces.reduce(function (s, P) { return s + Math.abs(M.area(P)); }, 0), big * big, 1e-9 * c * c, '中途面積'); });
  }
});

test('畢氏三元數與挑戰題', function () {
  for (let m = 2; m <= 20; m++) for (let n = 1; n < m; n++) {
    const z = M.triple(m, n);
    ok(z.a * z.a + z.b * z.b === z.c * z.c, m + ',' + n);
    ok(z.primitive === (M.gcd(m, n) === 1 && (m - n) % 2 === 1), '原始三元數 ⇔ m、n 互質且一奇一偶');
  }
  ok(M.triple(2, 2) === null && M.triple(1, 2) === null);
  for (let k = 0; k < 3000; k++) {
    const g = M.challenge(rand), G = g.given;
    if (g.type === 'hyp') near(g.answer * g.answer, G.a * G.a + G.b * G.b, 1e-9 * g.answer * g.answer);
    else { const leg = G.a != null ? G.a : G.b; near(g.answer * g.answer + leg * leg, G.c * G.c, 1e-9 * G.c * G.c); }
    ok(g.answer > 0 && M.answerOK(g.answer, g) && !M.answerOK(g.answer * 1.02, g), '判對判錯');
  }
});

console.log((fail ? '有 ' + fail + ' 項失敗' : '全部 ' + pass + ' 項通過'));
process.exit(fail ? 1 : 0);
