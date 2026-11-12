/* 矩陣與線性變換：數學核心的單元測試。用法：node tests/linear-transform-core.test.js */
'use strict';
const L = require('../js/linear-transform-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
const rand = L.rng(2024);
const r2 = () => [[rand() * 6 - 3, rand() * 6 - 3], [rand() * 6 - 3, rand() * 6 - 3]];
const r3 = () => [0, 1, 2].map(() => [0, 1, 2].map(() => rand() * 6 - 3));
/** 多邊形的有號面積（鞋帶公式） */
function area(P) { let s = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; s += p[0] * q[1] - p[1] * q[0]; } return s / 2; }
/** 四面體拆解算多面體的有號體積（面朝外、逆時針） */
function volume(V, F) {
  let s = 0;
  F.forEach(f => { for (let i = 1; i + 1 < f.length; i++) s += L.dot3(V[f[0]], L.cross(V[f[i]], V[f[i + 1]])); });
  return s / 6;
}

test('矩陣的行就是基底向量變過去的位置；線性：A(su + tv) = sA u + tA v', function () {
  const A = [[2, -1], [0.5, 3]];
  ok(L.apply2(A, [1, 0]).join() === '2,0.5' && L.apply2(A, [0, 1]).join() === '-1,3', '第 1、2 行');
  for (let k = 0; k < 200; k++) {
    const M = r2(), u = [rand() * 4 - 2, rand() * 4 - 2], v = [rand() * 4 - 2, rand() * 4 - 2], s = rand() * 3 - 1.5, t = rand() * 3 - 1.5;
    const lhs = L.apply2(M, [s * u[0] + t * v[0], s * u[1] + t * v[1]]), a = L.apply2(M, u), b = L.apply2(M, v);
    near(lhs[0], s * a[0] + t * b[0], 1e-12); near(lhs[1], s * a[1] + t * b[1], 1e-12);
    // 先 B 再 A ＝ AB
    const B = r2(), x = L.apply2(A, L.apply2(B, u)), y = L.apply2(L.mul2(A, B), u);
    near(x[0], y[0], 1e-12); near(x[1], y[1], 1e-12);
  }
});

test('2×2 行列式＝有號面積倍率（單位正方形與 F 形小旗子都一樣）；det(AB) = det A det B；反矩陣', function () {
  const sq = [[0, 0], [1, 0], [1, 1], [0, 1]];
  near(area(L.FLAG), 0.262, 1e-12, '小旗子面積（逆時針、正的）');
  for (let k = 0; k < 300; k++) {
    const M = r2(), d = L.det2(M);
    near(area(sq.map(p => L.apply2(M, p))), d, 1e-12, '正方形');
    near(area(L.FLAG.map(p => L.apply2(M, p))), d * 0.262, 1e-12, '小旗子');
    const B = r2();
    near(L.det2(L.mul2(M, B)), d * L.det2(B), 1e-10, 'det(AB)');
    const Mi = L.inv2(M);
    if (Mi) { const P = L.mul2(M, Mi); near(P[0][0], 1, 1e-9); near(P[0][1], 0, 1e-9); near(P[1][0], 0, 1e-9); near(P[1][1], 1, 1e-9); }
  }
  ok(L.inv2([[1, 2], [2, 4]]) === null, '奇異矩陣沒有反矩陣');
  near(L.det2([[0, -1], [1, 0]]), 1, 0, '旋轉 90°');
  near(L.det2([[1, 0], [0, -1]]), -1, 0, '鏡射翻面');
});

test('特徵值與特徵向量：A v = λ v；λ1 + λ2 = tr、λ1 λ2 = det；各種情形', function () {
  let seen = { distinct: 0, complex: 0 };
  for (let k = 0; k < 500; k++) {
    const M = r2(), e = L.eig2(M);
    seen[e.kind] = (seen[e.kind] || 0) + 1;
    if (e.kind === 'distinct') {
      near(e.vals[0] + e.vals[1], L.tr2(M), 1e-9, 'tr'); near(e.vals[0] * e.vals[1], L.det2(M), 1e-9, 'det');
      e.vecs.forEach((v, i) => { const Av = L.apply2(M, v); near(Av[0], e.vals[i] * v[0], 1e-8); near(Av[1], e.vals[i] * v[1], 1e-8); near(Math.hypot(v[0], v[1]), 1, 1e-12); });
      const p = L.probe(M, [e.vecs[0][0] * 2.5, e.vecs[0][1] * 2.5]);
      near(p.lambda, e.vals[0], 1e-9, '探針的 λ'); near(p.sin, 0, 1e-8, '探針平行');
    } else if (e.kind === 'complex') {
      near(e.re * 2, L.tr2(M), 1e-12); near(e.re * e.re + e.im * e.im, L.det2(M), 1e-9, '|λ|² = det');
      // 沒有實數特徵向量：每個方向都被轉走
      for (let a = 0; a < 180; a += 7) { const p = L.probe(M, [Math.cos(a * L.DEG), Math.sin(a * L.DEG)]); ok(p.sin > 1e-6, '方向 ' + a + '° 被轉走'); }
    }
  }
  ok(seen.distinct > 100 && seen.complex > 50, '亂數矩陣兩種情形都有：' + JSON.stringify(seen));
  // 剪切：重根、只有一個方向
  let e = L.eig2([[1, 1], [0, 1]]);
  ok(e.kind === 'repeated' && Math.abs(e.vecs[0][1]) < 1e-12 && Math.abs(Math.abs(e.vecs[0][0]) - 1) < 1e-12, '剪切 [[1,1],[0,1]]');
  e = L.eig2([[2, -1], [1, 0]]);
  ok(e.kind === 'repeated' && Math.abs(Math.abs(e.vecs[0][0]) - Math.SQRT1_2) < 1e-9 && Math.abs(e.vecs[0][0] - e.vecs[0][1]) < 1e-9, '斜的剪切 [[2,−1],[1,0]] 的方向 (1, 1)');
  ok(L.eig2([[1.5, 0], [0, 1.5]]).kind === 'scalar', '純量矩陣');
  ok(L.eig2([[0, -1], [1, 0]]).kind === 'complex', '旋轉 90°');
  e = L.eig2([[1, 1], [1, 0]]);
  near(e.vals[0], (1 + Math.sqrt(5)) / 2, 1e-12, '費氏矩陣的 λ = 黃金比例');
  e = L.eig2([[0, 1], [1, 0]]);
  near(e.vals[1], -1, 1e-12, '對 y = x 鏡射有 λ = −1');
  // 打字精度的矩陣（小數兩位）：判別式剛好是 0 的情形要判成重根
  ok(L.eig2([[1.5, 0.25], [-1, 0.5]]).kind === 'repeated', '[[1.5,0.25],[−1,0.5]] 是重根');
  ok(L.eig2([[0.3, 0.09], [-1, 0.9]]).kind === 'repeated', '[[0.3,0.09],[−1,0.9]]：tr² − 4det = 1.44 − 1.44');
});

test('奇異值：單位圓的像是橢圓，最長與最短半徑是 σ1、σ2，σ1 σ2 = |det|', function () {
  for (let k = 0; k < 200; k++) {
    const M = r2(), s = L.sing2(M);
    let lo = Infinity, hi = 0;
    for (let i = 0; i < 3600; i++) { const p = L.apply2(M, [Math.cos(i * Math.PI / 1800), Math.sin(i * Math.PI / 1800)]), n = Math.hypot(p[0], p[1]); lo = Math.min(lo, n); hi = Math.max(hi, n); }
    near(hi, s[0], 1e-5 * s[0], 'σ1'); near(lo, s[1], 2e-6 * s[0] * s[0] / Math.max(s[1], 1e-3) + 1e-9, 'σ2'); near(s[0] * s[1], Math.abs(L.det2(M)), 1e-9, 'σ1σ2');
  }
  const s = L.sing2([[0, -1], [1, 0]]); near(s[0], 1, 1e-12); near(s[1], 1, 1e-12);
});

test('3×3 行列式＝立方體變成的平行六面體的有號體積；det(AB) = det A det B；秩', function () {
  near(volume(L.CUBE_V, L.CUBE_F), 1, 1e-12, '單位立方體的面朝外');
  for (let k = 0; k < 300; k++) {
    const M = r3(), d = L.det3(M);
    near(volume(L.CUBE_V.map(p => L.apply3(M, p)), L.CUBE_F), d, 1e-10, '平行六面體');
    near(d, L.dot3(L.col(M, 0), L.cross(L.col(M, 1), L.col(M, 2))), 1e-10, '三行的純量三重積');
    const B = r3(); near(L.det3(L.mul3(M, B)), d * L.det3(B), 1e-8, 'det(AB)');
    ok(L.rank3(M) === 3, '亂數矩陣滿秩');
  }
  ok(L.rank3([[1, 2, 3], [2, 4, 6], [-1, -2, -3]]) === 1, '秩 1');
  ok(L.rank3([[1, 0, 1], [0, 1, 1], [1, 1, 2]]) === 2, '秩 2（第三行 = 前兩行相加）');
  ok(L.rank3([[0.3, 0.6, 0.9], [0.1, 0.2, 0.3], [0.7, 1.4, 2.1]]) === 1, '小數造成的捨入誤差不影響秩');
  ok(L.rank3([[1.1, 0.7, 1.8], [0.3, 2.9, 3.2], [-1.3, 0.2, -1.1]]) === 2, '打字精度的秩 2');
  ok(L.rank3([[0, 0, 0], [0, 0, 0], [0, 0, 0]]) === 0, '零矩陣');
  ok(L.triangular3([[1, 2, 3], [0, 1, 2], [0, 0, 1]]) && !L.triangular3([[2, 1, 0], [0, 3, 0], [1, 0, 1]]), '三角矩陣');
  near(L.det3([[2, 1, 0], [0, 3, 0], [1, 0, 1]]), 6, 1e-12, '非三角、體積 6 的例子');
});

test('漸變 (1 − t)I + tA：t = 0 是單位矩陣、t = 1 是 A', function () {
  const A = [[2, -1], [0.5, 3]];
  ok(L.near2(L.lerpI(A, 0), L.I2, 0) && L.near2(L.lerpI(A, 1), A, 0));
  const B = L.lerpI(A, 0.5); near(B[0][0], 1.5, 1e-15); near(B[0][1], -0.5, 1e-15);
  const C3 = L.lerpI([[2, 0, 0], [0, 2, 0], [0, 0, 2]], 0.5); near(L.det3(C3), 1.5 * 1.5 * 1.5, 1e-12);
});

test('挑戰：2000 題都是 −2 到 2 的整數、行列式不是 0 且 ≤ 4、不是單位矩陣、不是對角、連續兩題不同', function () {
  const R = L.rng(77);
  let prev = null;
  for (let k = 0; k < 2000; k++) {
    const c = L.genChallenge(R, prev);
    ok(c, '出得了題');
    const M = c.M;
    ok(M.every(r => r.every(x => Number.isInteger(x) && x >= -2 && x <= 2)), '整數 −2..2');
    const d = L.det2(M);
    ok(d !== 0 && Math.abs(d) <= 4, '行列式');
    ok(!L.near2(M, L.I2, 0) && !(M[0][1] === 0 && M[1][0] === 0), '不是單位、不是對角');
    ok(!prev || !L.near2(M, prev.M, 0), '和上一題不同');
    ok(L.chalHit(c, M.map(r => r.map(x => x + 0.05))) && !L.chalHit(c, M.map((r, i) => r.map((x, j) => x + (i === 1 && j === 0 ? 0.1 : 0)))), '容許 ±0.05');
    prev = c;
  }
});

test('文字：矩陣的 KaTeX', function () {
  ok(L.matTex([[1, -0.5], [0, 2]]) === '\\begin{bmatrix}1 & -0.5 \\\\ 0 & 2\\end{bmatrix}', L.matTex([[1, -0.5], [0, 2]]));
  ok(L.trim(-0.001, 2) === '0' && L.trim(1.50, 2) === '1.5');
});

console.log('\n' + (fail ? fail + ' 項失敗、' : '') + pass + ' 項測試通過。');
if (fail) process.exit(1);
