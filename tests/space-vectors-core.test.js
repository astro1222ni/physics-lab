/* 空間向量：數學核心的單元測試。用法：node tests/space-vectors-core.test.js */
'use strict';
const V = require('../js/space-vectors-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function nearV(a, b, tol, msg) { for (let i = 0; i < 3; i++) near(a[i], b[i], tol, (msg || '') + '[' + i + ']'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
const rand = V.rng(31);
const rv = function () { return [0, 1, 2].map(function () { return rand() * 8 - 4; }); };

test('內積、外積的基本性質：交換、反交換、分配律、外積和兩個向量都垂直、|a×b|² + (a·b)² = |a|²|b|²', function () {
  for (let i = 0; i < 500; i++) {
    const a = rv(), b = rv(), c = rv();
    near(V.dot(a, b), V.dot(b, a), 1e-12);
    nearV(V.cross(a, b), V.scale(V.cross(b, a), -1), 1e-12);
    nearV(V.cross(a, V.add(b, c)), V.add(V.cross(a, b), V.cross(a, c)), 1e-11);
    near(V.dot(V.cross(a, b), a), 0, 1e-11);
    near(V.dot(V.cross(a, b), b), 0, 1e-11);
    near(Math.pow(V.norm(V.cross(a, b)), 2) + Math.pow(V.dot(a, b), 2), V.dot(a, a) * V.dot(b, b), 1e-9 * (1 + V.dot(a, a) * V.dot(b, b)));
  }
  nearV(V.cross([1, 0, 0], [0, 1, 0]), [0, 0, 1], 0, '右手系 x × y = z');
  nearV(V.cross([0, 1, 0], [0, 0, 1]), [1, 0, 0], 0, 'y × z = x');
  nearV(V.cross([0, 0, 1], [1, 0, 0]), [0, 1, 0], 0, 'z × x = y');
});

test('夾角：已知角度、0° 與 180° 附近也準、零向量沒有夾角', function () {
  near(V.angleDeg([1, 1, 0], [0, 1, 1]), 60, 1e-12);
  near(V.angleDeg([1, 0, 0], [0, 3, 0]), 90, 1e-12);
  near(V.angleDeg([1, 0, 0], [-2, 0, 0]), 180, 1e-12);
  near(V.angleDeg([1, 0, 0], [1, 1e-9, 0]), 1e-9 / V.DEG, 1e-12, '極小角度');
  near(V.angleDeg([2, 2, 1], [1, 0, 0]), Math.acos(2 / 3) / V.DEG, 1e-12);
  ok(V.angleDeg([0, 0, 0], [1, 2, 3]) === null, '零向量');
  for (let i = 0; i < 300; i++) { const a = rv(), b = rv(); near(Math.cos(V.angleDeg(a, b) * V.DEG), V.dot(a, b) / V.norm(a) / V.norm(b), 1e-12); }
});

test('投影：投影向量和 a 平行、b 減投影和 a 垂直、純量投影 = |proj|（帶正負）', function () {
  for (let i = 0; i < 300; i++) {
    const a = rv(), b = rv();
    const p = V.projOn(a, b);
    near(V.norm(V.cross(p, a)), 0, 1e-10);
    near(V.dot(V.sub(b, p), a), 0, 1e-10);
    near(Math.abs(V.compOn(a, b)), V.norm(p), 1e-12);
    ok(Math.sign(V.compOn(a, b)) === Math.sign(V.dot(a, b)), '正負號');
  }
  near(V.compOn([1, 2, 2], [3, 1, 2]), 3, 1e-15);
  ok(V.projOn([0, 0, 0], [1, 2, 3]) === null && V.compOn([0, 0, 0], [1, 1, 1]) === null, '零向量');
});

test('純量三重積：輪換不變、交換兩個變號、等於行列式；共平面時為 0', function () {
  for (let i = 0; i < 300; i++) {
    const a = rv(), b = rv(), c = rv();
    const t = V.triple(a, b, c);
    near(V.triple(b, c, a), t, 1e-10);
    near(V.triple(c, a, b), t, 1e-10);
    near(V.triple(b, a, c), -t, 1e-10);
    const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    near(t, det, 1e-10);
    near(V.triple(a, b, V.add(V.scale(a, 0.7), V.scale(b, -1.3))), 0, 1e-10);
  }
  near(V.triple([1, 0, 0], [0, 1, 0], [0, 0, 1]), 1, 0);
  near(V.triple([1, 1, 0], [0, 1, 1], [3, 0, 3]), 6, 1e-15);
  near(V.triple([2, 2, 1], [-2, 1, 2], [1, -2, 2]), 27, 1e-12, '邊長 3 的正立方體');
});

test('平行與在軸上：parallel、onAxis、nonzeroCount', function () {
  ok(V.parallel([1, 2, 3], [-2, -4, -6]), '反向平行');
  ok(!V.parallel([1, 2, 3], [1, 2, 3.01]), '不平行');
  ok(!V.parallel([0, 0, 0], [1, 2, 3]), '零向量不算平行');
  ok(V.onAxis([0, 3, 0]) && !V.onAxis([1, 1, 0]) && V.nonzeroCount([1, 0, 2]) === 2, 'onAxis');
});

test('平面：有號距離、垂足在平面上且 q − 垂足和 n 平行、平面上離原點最近的點', function () {
  for (let i = 0; i < 300; i++) {
    const n = rv(), d = rand() * 10 - 5, q = rv();
    const f = V.foot(n, d, q);
    near(V.dot(n, f), d, 1e-10, '垂足在平面上');
    near(V.norm(V.cross(V.sub(q, f), n)), 0, 1e-9);
    near(Math.abs(V.signedDist(n, d, q)), V.norm(V.sub(q, f)), 1e-10);
    const p0 = V.planePoint(n, d);
    near(V.dot(n, p0), d, 1e-10);
    near(V.norm(p0), Math.abs(d) / V.norm(n), 1e-12);
  }
  near(V.signedDist([1, 2, 2], 0, [1, 2, 2]), 3, 1e-15);
  near(V.signedDist([0, 0, 1], 2, [5, -3, 0]), -2, 1e-15);
  ok(V.signedDist([0, 0, 0], 1, [1, 1, 1]) === null, 'n = 0');
});

test('平面和立方體的截面：每個頂點都在平面上和立方體表面上，凸多邊形依序排好，面積和解析值一致', function () {
  const R = 5;
  for (let i = 0; i < 300; i++) {
    const n = rv(), d = rand() * 12 - 6;
    const P = V.planeBoxPolygon(n, d, R);
    if (!P.length) { ok(Math.abs(d) / V.norm(n) > R - 1e-9, '有交集卻沒有截面'); continue; }
    ok(P.length >= 3 && P.length <= 6, '截面有 ' + P.length + ' 個頂點');
    P.forEach(function (p) {
      near(V.dot(n, p), d, 1e-9);
      ok(Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])) <= R + 1e-9, '在立方體外');
      ok(Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])) >= R - 1e-9, '不在立方體表面');
    });
    // 依序繞：相鄰兩邊的外積都和 n 同向（凸）
    const w = V.unit(n);
    for (let k = 0; k < P.length; k++) {
      const e1 = V.sub(P[(k + 1) % P.length], P[k]), e2 = V.sub(P[(k + 2) % P.length], P[(k + 1) % P.length]);
      ok(V.dot(V.cross(e1, e2), w) > -1e-9, '不是依序排好的凸多邊形');
    }
  }
  // z = 0 的截面是邊長 10 的正方形
  const sq = V.planeBoxPolygon([0, 0, 1], 0, 5);
  ok(sq.length === 4, 'z = 0 是四邊形');
  let A = 0; for (let k = 0; k < 4; k++) A += V.dot(V.cross(sq[k], sq[(k + 1) % 4]), [0, 0, 1]) / 2;
  near(Math.abs(A), 100, 1e-9);
  // x + y + z = 0 的截面是正六邊形
  ok(V.planeBoxPolygon([1, 1, 1], 0, 5).length === 6, 'x + y + z = 0 是六邊形');
  ok(V.planeBoxPolygon([0, 0, 1], 6, 5).length === 0, '平面在立方體外');
});

test('畫面的基底：r、u、e 互相垂直的單位向量，而且 r × u = e（右手系）；三視圖也一樣', function () {
  const chk = function (B, msg) {
    near(V.norm(B.r), 1, 1e-12, msg); near(V.norm(B.u), 1, 1e-12, msg); near(V.norm(B.e), 1, 1e-12, msg);
    near(V.dot(B.r, B.u), 0, 1e-12, msg); near(V.dot(B.r, B.e), 0, 1e-12, msg); near(V.dot(B.u, B.e), 0, 1e-12, msg);
    nearV(V.cross(B.r, B.u), B.e, 1e-12, msg + ' 右手系');
  };
  for (let y = -180; y <= 180; y += 15) for (let p = -85; p <= 85; p += 17) chk(V.viewBasis(y, p), 'yaw ' + y + ' pitch ' + p);
  chk(V.VIEWS.front, '前視圖'); chk(V.VIEWS.side, '側視圖'); chk(V.VIEWS.top, '俯視圖');
  // 預設視角：x 軸朝左下、y 軸朝右、z 軸朝上
  const B = V.viewBasis(25, 20);
  const px = V.project(B, [1, 0, 0]), py = V.project(B, [0, 1, 0]), pz = V.project(B, [0, 0, 1]);
  ok(px.x < 0 && px.y < 0 && py.x > 0 && pz.y > 0 && Math.abs(pz.x) < 1e-12, '預設視角的軸方向');
});

test('挑戰出題：2000 題都有一組格點向量做得到，目標在合理範圍、和目前的值差夠遠', function () {
  const r = V.rng(5);
  const s = { a: [3, 1, 1], b: [1, 2.5, 1], c: [0.5, 1, 3], n: [1, 1, 2], d: 4, q: [2, -1, 3] };
  const modes = ['inner', 'cross', 'volume', 'plane'];
  let prev = null;
  const count = {};
  for (let i = 0; i < 2000; i++) {
    const mode = modes[i % 4];
    const ch = V.genChallenge(r, mode, s, prev);
    ok(ch, mode + ' 出不了題');
    count[ch.kind] = (count[ch.kind] || 0) + 1;
    ok(V.chalHit(ch, ch.witness), '見證向量沒有對準');
    ['a', 'b', 'c', 'q'].forEach(function (k) { ch.witness[k].forEach(function (x) { near(Math.round(x / 0.5) * 0.5, x, 1e-12, '不在格點上'); ok(Math.abs(x) <= 4, '超出滑桿'); }); });
    ok(!V.chalHit(ch, s), '目前的狀態就已經對準');
    if (ch.kind === 'angle') ok(ch.target >= 10 && ch.target <= 170 && ch.target === Math.round(ch.target), '角度');
    else ok(ch.target >= 0.5 && ch.target <= 30, '目標值 ' + ch.target);
    prev = ch;
  }
  ['angle', 'area', 'volume', 'dist'].forEach(function (k) { ok(count[k] === 500, k + ' ' + count[k]); });
});

test('文字：向量與平面方程式', function () {
  ok(V.vecText([1, -0.5, 2]) === '(1, -0.5, 2)', V.vecText([1, -0.5, 2]));
  ok(V.planeTex([1, -2, 0], 3) === 'x - 2y = 3', V.planeTex([1, -2, 0], 3));
  ok(V.planeTex([-1, 0, 2.5], -1.5) === '-x + 2.5z = -1.5', V.planeTex([-1, 0, 2.5], -1.5));
  ok(V.planeTex([0, 0, 0], 0) === '0 = 0');
});

console.log('\n' + (fail ? fail + ' 項失敗、' : '') + pass + ' 項測試通過。');
if (fail) process.exit(1);
