/* 複數平面：數學核心的單元測試。用法：node tests/complex-plane-core.test.js */
'use strict';
const M = require('../js/complex-plane-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b); }
function nearC(z, w, tol, msg) { if (!M.near(z, w, tol)) throw new Error((msg || '') + ' 得到 ' + M.fmt(z, 6) + '，應為 ' + M.fmt(w, 6)); }
let seed = 11;
const rand = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const C = M.C;

test('四則運算：(2 + i)(2 − i) = 5、i² = −1、(1 + 2i)／(3 − i) = 0.1 + 0.7i、共軛', function () {
  nearC(M.mul(C(2, 1), C(2, -1)), C(5, 0), 1e-12, '(2+i)(2−i)');
  nearC(M.mul(C(0, 1), C(0, 1)), C(-1, 0), 1e-12, 'i²');
  nearC(M.div(C(1, 2), C(3, -1)), C(0.1, 0.7), 1e-12, '除法');
  nearC(M.mul(C(3, 4), M.conj(C(3, 4))), C(25, 0), 1e-12, 'z z̄ = |z|²');
  nearC(M.add(C(1, 2), C(-3, 0.5)), C(-2, 2.5), 1e-12, '加法');
  ok(isNaN(M.div(C(1, 0), C(0, 0)).re), '除以 0');
});
test('隨機 2000 組：|zw| = |z||w|、arg(zw) ≡ arg z + arg w（mod 360°）、三角形 (0,1,z) ∼ (0,w,zw)', function () {
  for (let t = 0; t < 2000; t++) {
    const z = C(rand() * 10 - 5, rand() * 10 - 5), w = C(rand() * 10 - 5, rand() * 10 - 5);
    const zw = M.mul(z, w);
    near(M.abs(zw), M.abs(z) * M.abs(w), 1e-9 * (1 + M.abs(zw)), '模');
    let d = (M.argDeg(zw) - M.argDeg(z) - M.argDeg(w)) % 360;
    if (d < -180) d += 360; if (d > 180) d -= 360;
    near(d, 0, 1e-7, '幅角');
    if (M.abs(M.sub(z, C(1, 0))) > 1e-3) {
      const r = M.similarRatios(z, w);
      near(r[1], r[0], 1e-9 * (1 + r[0]), '相似 1'); near(r[2], r[0], 1e-9 * (1 + r[0]), '相似 2');
    }
    // 除法是乘法的反運算
    if (M.abs(w) > 1e-3) nearC(M.mul(M.div(z, w), w), z, 1e-9 * (1 + M.abs(z)), '除法');
  }
});
test('極式與幅角：polar 與 abs、argDeg 互逆；argDeg 的範圍 (−180, 180]、arg360 的範圍 [0, 360)', function () {
  nearC(M.polar(2, 90), C(0, 2), 1e-12);
  near(M.argDeg(C(-1, 0)), 180, 1e-12, 'arg(−1)');
  near(M.argDeg(C(0, -1)), -90, 1e-12, 'arg(−i)');
  near(M.arg360(C(0, -1)), 270, 1e-12, 'arg360(−i)');
  ok(isNaN(M.argDeg(C(0, 0))), 'arg 0');
  for (let t = 0; t < 500; t++) {
    const r = 0.1 + rand() * 5, th = rand() * 360 - 179.999;
    const z = M.polar(r, th);
    near(M.abs(z), r, 1e-12); near(M.argDeg(z), th, 1e-9);
  }
});
test('棣美弗定理：z^n 的模是 r^n、幅角是 nθ；(1 + i)^8 = 16、i^4 = 1、(cos 120° + i sin 120°)^3 = 1', function () {
  nearC(M.powInt(C(1, 1), 8), C(16, 0), 1e-12, '(1+i)^8');
  nearC(M.powInt(C(0, 1), 4), C(1, 0), 1e-12, 'i^4');
  nearC(M.powInt(M.polar(1, 120), 3), C(1, 0), 1e-12, 'ω³');
  nearC(M.powInt(C(2, 1), -1), C(0.4, -0.2), 1e-12, '倒數');
  for (let t = 0; t < 300; t++) {
    const r = 0.5 + rand(), th = rand() * 360 - 180, n = 1 + Math.floor(rand() * 30);
    const p = M.powInt(M.polar(r, th), n);
    nearC(p, M.polar(Math.pow(r, n), n * th), 1e-9 * Math.pow(r, n), 'n = ' + n);
  }
  const L = M.powers(C(0, 1), 5);
  [C(1, 0), C(0, 1), C(-1, 0), C(0, -1), C(1, 0), C(0, 1)].forEach(function (w, i) { nearC(L[i], w, 1e-12, 'i^' + i); });
});
test('n 次方根：z^n = c 的 n 個根都滿足方程、在同一個圓上、相鄰兩根差 360°／n、加起來是 0（n ≥ 2）', function () {
  const r8 = M.roots(C(8, 0), 3);
  nearC(r8[0], C(2, 0), 1e-12); nearC(r8[1], C(-1, Math.sqrt(3)), 1e-12); nearC(r8[2], C(-1, -Math.sqrt(3)), 1e-12);
  const r4 = M.roots(C(-4, 0), 4);
  r4.forEach(function (z) { ok(M.isGauss(z, 1e-9), '−4 的四次方根是 ±1 ± i：' + M.fmt(z)); });
  for (let t = 0; t < 300; t++) {
    const c = C(rand() * 10 - 5, rand() * 10 - 5), n = 2 + Math.floor(rand() * 20);
    const rs = M.roots(c, n);
    let sum = C(0, 0);
    rs.forEach(function (z, k) {
      nearC(M.powInt(z, n), c, 1e-8 * (1 + M.abs(c)), 'n = ' + n);
      near(M.abs(z), Math.pow(M.abs(c), 1 / n), 1e-12);
      const nx = rs[(k + 1) % n];
      let d = M.argDeg(nx) - M.argDeg(z); d = ((d % 360) + 360) % 360;
      near(d, 360 / n, 1e-7, '間隔');
      sum = M.add(sum, z);
    });
    nearC(sum, C(0, 0), 1e-9 * (1 + M.abs(c)), '和');
  }
});
test('乘法的過程：partial(z, 0) = 1、partial(z, 1) = z，中間的模與幅角照比例（對數螺線）', function () {
  for (let t = 0; t < 300; t++) {
    const z = C(rand() * 6 - 3, rand() * 6 - 3);
    nearC(M.partial(z, 0), C(1, 0), 1e-12); nearC(M.partial(z, 1), z, 1e-9);
    const s = rand(), p = M.partial(z, s);
    near(M.abs(p), Math.pow(M.abs(z), s), 1e-9);
  }
  nearC(M.partial(C(0, 0), 1), C(0, 0), 1e-12, '乘 0：縮成一點');
});
test('歐拉：(1 + iπ／n)^n → −1；n = 100 時差 0.05、n = 1000 時差 0.005', function () {
  const e100 = M.powInt(C(1, Math.PI / 100), 100), e1000 = M.powInt(C(1, Math.PI / 1000), 1000);
  ok(M.abs(M.add(e100, C(1, 0))) < 0.06, 'n = 100：' + M.fmt(e100));
  ok(M.abs(M.add(e1000, C(1, 0))) < 0.006, 'n = 1000：' + M.fmt(e1000));
  ok(M.abs(M.add(M.powInt(C(1, Math.PI / 10), 10), C(1, 0))) > 0.3, 'n = 10 還差很多');
});
test('格式與挑戰：fmt 寫成 a + bi；挑戰 3000 題的 z 都是好看的極式，自己答自己一定對、差 5% 一定錯', function () {
  ok(M.fmt(C(3, -4)) === '3 − 4i', M.fmt(C(3, -4)));
  ok(M.fmt(C(0, 1)) === 'i' && M.fmt(C(0, -1)) === '−i' && M.fmt(C(-2, 0)) === '−2' && M.fmt(C(0.5, 0.866)) === '0.5 + 0.866i', '格式');
  for (let t = 0; t < 3000; t++) {
    const g = M.challenge(rand);
    ok(g.r >= 0.5 && g.r <= 3, 'r');
    ok(M.answerOK(g.z, g.z), '自己答');
    ok(!M.answerOK(M.mul(g.z, C(1.05, 0)), g.z) || M.abs(g.z) < 0.4, '差 5%');
    ok(!M.answerOK(M.mul(g.z, M.polar(1, 3)), g.z), '差 3°');
  }
});
console.log(pass + ' 項測試通過' + (fail ? '，' + fail + ' 項失敗' : ''));
if (fail) process.exit(1);
