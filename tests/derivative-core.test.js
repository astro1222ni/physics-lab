/* 導數與切線：數學核心的單元測試。用法：node tests/derivative-core.test.js */
'use strict';
const D = require('../js/derivative-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }

const K = { a: 0.3, b: -0.6, c: -0.9, d: 1.2 };
const rand = D.rng(2024);
const randCoef = function () { const r = function () { return Math.round((rand() * 6 - 3) * 10) / 10; }; return { a: r(), b: r(), c: r(), d: r() }; };

test('解析的導數和高精度數值微分一致（五種函數、各 300 個隨機點，f′、f″、f‴）', function () {
  D.IDS.forEach(function (id) {
    const R = D.FUNCS[id].aRange;
    for (let i = 0; i < 300; i++) {
      const k = id === 'cubic' ? randCoef() : K;
      const x = R[0] + (R[1] - R[0]) * rand();
      if (id === 'abs' && Math.abs(x) < 1e-3) continue;
      const h = 1e-4;
      // 五點公式：誤差 O(h⁴)
      const g = function (fn, t) { return fn(t); };
      const fd = function (fn) { return (-g(fn, x + 2 * h) + 8 * g(fn, x + h) - 8 * g(fn, x - h) + g(fn, x - 2 * h)) / (12 * h); };
      const f0 = function (t) { return D.f(id, t, k); };
      const f1 = function (t) { return D.d1(id, t, k); };
      const f2 = function (t) { return D.d2(id, t, k); };
      const scale = function (v) { return 1e-6 * Math.max(1, Math.abs(v)); };
      near(D.d1(id, x, k), fd(f0), scale(D.d1(id, x, k)) * 10, id + ' f′(' + x.toFixed(3) + ')');
      near(D.d2(id, x, k), fd(f1), scale(D.d2(id, x, k)) * 10, id + ' f″(' + x.toFixed(3) + ')');
      near(D.d3(id, x, k), fd(f2), scale(D.d3(id, x, k)) * 10, id + ' f‴(' + x.toFixed(3) + ')');
    }
  });
});

test('差商在 h → 0 時趨近 f′(a)，誤差約為 h·f″(a)/2；對稱差商的誤差約為 h²·f‴(a)/6', function () {
  [['cubic', 1.3], ['sin', 1], ['exp', 0.5], ['ln', 2]].forEach(function (p) {
    const id = p[0], a = p[1];
    const m = D.d1(id, a, K);
    let prev = Infinity;
    [0.5, 0.1, 0.01, 0.001].forEach(function (h) {
      const e = Math.abs(D.diffQuot(id, a, h, K) - m);
      ok(e < prev, id + ' 誤差沒有變小'); prev = e;
      // 誤差 − 主要誤差項 = O(h²)
      near(D.diffQuot(id, a, h, K) - m, D.leadErr(id, a, h, K, false), 0.5 * h * h * Math.max(1, Math.abs(D.d3(id, a, K))) + 1e-12, id + ' h = ' + h);
      near(D.symQuot(id, a, h, K) - m, D.leadErr(id, a, h, K, true), 0.05 * Math.pow(h, 3) * 50 + 1e-12, id + ' 對稱 h = ' + h);
    });
  });
});

test('三次函數：對稱差商的誤差剛好是 a·h²（沒有更高次項）；二次函數的對稱差商沒有誤差', function () {
  for (let i = 0; i < 200; i++) {
    const k = randCoef(), x = rand() * 8 - 4, h = 0.001 + rand() * 2;
    near(D.symQuot('cubic', x, h, k) - D.d1('cubic', x, k), k.a * h * h, 1e-9 * Math.max(1, Math.abs(k.a * h * h)) + 1e-10);
    near(D.diffQuot('cubic', x, h, k) - D.d1('cubic', x, k), (3 * k.a * x + k.b) * h + k.a * h * h, 1e-9 * (1 + h * h * 10));
  }
  const q = { a: 0, b: 1.7, c: -0.4, d: 2 };
  near(D.symQuot('cubic', 0.77, 0.9, q), D.d1('cubic', 0.77, q), 1e-12);
});

test('|x| 在 0 不可微：右差商 +1、左差商 −1、對稱差商 0；單邊導數 −1、+1', function () {
  [2, 0.5, 0.01, 0.001].forEach(function (h) {
    near(D.diffQuot('abs', 0, h), 1, 1e-15);
    near(D.diffQuot('abs', 0, -h), -1, 1e-15);
    near(D.symQuot('abs', 0, h), 0, 1e-15);
  });
  ok(D.d1('abs', 0) === null, 'f′(0) 應沒有定義');
  ok(D.tangent('abs', 0) === null, '0 沒有切線');
  const s = D.oneSided('abs', 0);
  ok(s.left === -1 && s.right === 1, '單邊導數');
  ok(D.d1('abs', 0.3) === 1 && D.d1('abs', -0.3) === -1, '其他點 ±1');
  // h 跨過 0 時的差商：介於 −1 與 1 之間
  near(D.diffQuot('abs', 0.5, -1.5), (1 - 0.5) / -1.5, 1e-15);
});

test('ln x 的定義域：a ≤ 0 或 a + h ≤ 0 時差商沒有定義', function () {
  ok(D.diffQuot('ln', 0.5, -0.6) === null, 'a + h < 0');
  ok(D.diffQuot('ln', 0.5, -0.5) === null, 'a + h = 0');
  ok(D.symQuot('ln', 0.3, 0.4) === null, 'a − h < 0');
  ok(D.d1('ln', 0) === null && D.d1('ln', -1) === null, 'x ≤ 0 沒有導數');
  near(D.diffQuot('ln', 1, 1), Math.log(2), 1e-15);
});

test('切線：在切點和曲線相切，截距與 x 截距正確；eˣ 在 x = 1、ln x 在 x = e 的切線都通過原點', function () {
  const t = D.tangent('cubic', 1.3, K);
  near(t.y0, D.f('cubic', 1.3, K), 1e-15);
  near(t.m, D.d1('cubic', 1.3, K), 1e-15);
  near(t.b, t.y0 - t.m * 1.3, 1e-15);
  near(t.m * t.xInt + t.b, 0, 1e-12);
  near(D.tangent('exp', 1).b, 0, 1e-15);
  near(D.tangent('ln', Math.E).b, 0, 1e-15);
  ok(Math.abs(D.tangent('ln', 2.72).b) < 0.002, 'ln 在 2.72 的截距 ' + D.tangent('ln', 2.72).b);
  ok(Math.abs(D.tangent('ln', 2.71).b) > 0.002 && Math.abs(D.tangent('ln', 2.73).b) > 0.002, '2.71、2.73 都不夠準');
  ok(Math.abs(D.tangent('exp', 1).b) < 0.01 && Math.abs(D.tangent('exp', 1.01).b) > 0.01 && Math.abs(D.tangent('exp', 0.99).b) > 0.01, 'eˣ 只有 1.00');
  ok(D.tangent('cubic', 0, { a: 0, b: 0, c: 0, d: 3 }).xInt === null, '水平切線沒有 x 截距');
});

test('對數滑桿：位置 0 → h = 2、位置 100 → h = 0.001，來回換算一致', function () {
  near(D.hFromPos(0), 2, 1e-15);
  near(D.hFromPos(100), 0.001, 1e-15);
  for (let p = 0; p <= 100; p += 0.5) near(D.posFromH(D.hFromPos(p)), p, 1e-9);
  near(D.posFromH(-0.1), D.posFromH(0.1), 1e-15);
  ok(D.hFromPos(30) > D.hFromPos(31), '往右越小');
});

test('斜率等於 m 的點：每個解都滿足 f′(x) = m，而且沒有漏掉（和密集取樣的變號比較）', function () {
  for (let i = 0; i < 300; i++) {
    const id = D.IDS[i % 4];   // cubic、sin、exp、ln
    const k = randCoef();
    const R = D.FUNCS[id].aRange;
    const m = id === 'cubic' ? rand() * 10 - 5 : id === 'sin' ? rand() * 2.4 - 1.2 : rand() * 6 - 1;
    const xs = D.slopePoints(id, m, k, R[0], R[1]);
    xs.forEach(function (x) { near(D.d1(id, x, k), m, 1e-9 * Math.max(1, Math.abs(m)), id + ' m = ' + m); ok(x >= R[0] - 1e-9 && x <= R[1] + 1e-9, '範圍外'); });
    // 取樣找變號
    let cnt = 0, prev = D.d1(id, R[0], k) - m;
    for (let j = 1; j <= 4000; j++) {
      const x = R[0] + (R[1] - R[0]) * j / 4000, v = D.d1(id, x, k) - m;
      if (v === 0 || prev * v < 0) cnt++;
      prev = v;
    }
    ok(xs.length >= cnt, id + ' m = ' + m.toFixed(3) + ' 漏解：找到 ' + xs.length + '，變號 ' + cnt);
  }
  ok(D.slopePoints('sin', 1, K, -7, 7).length === 3, 'cos x = 1 在 [−7, 7]：−2π、0、2π');
  ok(D.slopePoints('sin', 0.5, K, 0, 6.28).length === 2, 'cos x = 0.5 在 [0, 2π]：π/3、5π/3');
  ok(D.slopePoints('exp', -1, K, -5, 5).length === 0, 'eˣ 斜率不會是負的');
  near(D.slopePoints('ln', 0.25, K, 0.1, 7)[0], 4, 1e-15);
});

test('三次函數的實根：每個根都使 f = 0，個數和判別式一致（含重根、退化成二次）', function () {
  for (let i = 0; i < 500; i++) {
    const k = randCoef();
    const r = D.cubicRoots(k);
    r.forEach(function (x) { near(D.f('cubic', x, k), 0, 1e-9 * (1 + Math.abs(k.a * x * x * x) + Math.abs(k.d))); });
    if (Math.abs(k.a) > 1e-9) {
      const a = k.a, b = k.b, c = k.c, d = k.d;
      const disc = 18 * a * b * c * d - 4 * b * b * b * d + b * b * c * c - 4 * a * c * c * c - 27 * a * a * d * d;
      if (disc > 1e-6) ok(r.length === 3, '判別式 > 0 應有三個實根，得到 ' + r.length + ' ' + JSON.stringify(k));
      if (disc < -1e-6) ok(r.length === 1, '判別式 < 0 應有一個實根，得到 ' + r.length + ' ' + JSON.stringify(k));
    }
  }
  const r = D.cubicRoots({ a: 1, b: 0, c: -1, d: 0 });
  ok(r.length === 3, 'x³ − x 三個根'); near(r[0], -1, 1e-12); near(r[1], 0, 1e-12); near(r[2], 1, 1e-12);
  const t = D.cubicRoots({ a: 1, b: 0, c: 0, d: 0 });
  ok(t.length === 1 && Math.abs(t[0]) < 1e-9, 'x³ 三重根 0：' + JSON.stringify(t));
  const dbl = D.cubicRoots({ a: 1, b: -3, c: 0, d: 4 });   // (x + 1)(x − 2)²
  ok(dbl.length === 2, '重根：' + JSON.stringify(dbl)); near(dbl[0], -1, 1e-9); near(dbl[1], 2, 1e-6);
  const q = D.cubicRoots({ a: 0, b: 1, c: 0, d: -4 });
  ok(q.length === 2 && Math.abs(q[0] + 2) < 1e-12 && Math.abs(q[1] - 2) < 1e-12, '退化成 x² − 4');
});

test('三次函數的性質：在兩根中點的切線通過第三個根（隨機 300 個有三個實根的三次函數）', function () {
  let n = 0;
  for (let i = 0; i < 3000 && n < 300; i++) {
    const k = randCoef();
    if (Math.abs(k.a) < 0.05) continue;
    const r = D.cubicRoots(k);
    if (r.length !== 3) continue;
    n++;
    [[0, 1, 2], [0, 2, 1], [1, 2, 0]].forEach(function (p) {
      const mid = (r[p[0]] + r[p[1]]) / 2, t = D.tangent('cubic', mid, k);
      near(t.m * r[p[2]] + t.b, 0, 1e-7 * (1 + Math.abs(t.m) * Math.abs(r[p[2]]) + Math.abs(t.b)));
    });
  }
  ok(n >= 100, '測到的三次函數太少：' + n);
});

test('縱軸範圍：三次函數分級調整、包住曲線（不超過上限），其他函數固定', function () {
  for (let i = 0; i < 200; i++) {
    const k = randCoef();
    const y = D.viewY('cubic', k, 'f'), dy = D.viewY('cubic', k, 'd');
    ok(y[1] - y[0] >= 2 && dy[1] - dy[0] >= 2, '範圍太小');
    ok(y[0] >= -8 && y[1] <= 8 && dy[0] >= -12 && dy[1] <= 12, '超過上限');
    for (let j = 0; j <= 40; j++) {
      const x = -4 + j * 0.2, v = D.f('cubic', x, k);
      if (v > -8 && v < 8) ok(v >= y[0] - 1e-9 && v <= y[1] + 1e-9, '曲線跑出畫面 ' + v + ' ' + y);
    }
  }
  const s = D.viewY('sin', K, 'f');
  ok(s[0] === -1.6 && s[1] === 1.6, 'sin 固定');
});

test('挑戰出題：解都在範圍內且確實 f′ = m、m 在 0.05 的格點上、離目前的 a 夠遠；2000 題都可以做', function () {
  const r = D.rng(7);
  let prev = null, a = 1.5;
  const seen = {};
  for (let i = 0; i < 2000; i++) {
    const c = D.genChallenge(r, prev, a);
    seen[c.fn] = (seen[c.fn] || 0) + 1;
    const R = D.FUNCS[c.fn].aRange;
    ok(c.sols.length >= 1 && c.sols.length <= 4, '解的個數');
    near(Math.round(c.m * 20) / 20, c.m, 1e-12, 'm 在格點上');
    c.sols.forEach(function (x) {
      near(D.d1(c.fn, x, c.coef), c.m, 1e-9);
      ok(x >= R[0] + 0.3 - 1e-9 && x <= R[1] - 0.3 + 1e-9, '解太靠邊');
      ok(Math.abs(D.d2(c.fn, x, c.coef)) >= 0.25, '切線太平');
      if (!prev || prev.fn === c.fn) ok(Math.abs(x - a) >= 0.5, '太靠近目前的 a');
      // 解附近 ±0.02 的格點（0.01）都算對準
      ok(D.chalHit(c.sols, Math.round(x * 100) / 100), '最近的格點應該算對準');
    });
    if (c.fn === 'cubic') ['a', 'b', 'c', 'd'].forEach(function (key) { near(Math.round(c.coef[key] * 20) / 20, c.coef[key], 1e-12, '係數在 0.05 的格點上'); });
    if (prev && prev.fn === c.fn) ok(Math.abs(prev.m - c.m) >= 0.25 - 1e-9, '和上一題太像');
    prev = c; a = c.sols[0] + 1;
  }
  ['cubic', 'sin', 'exp', 'ln'].forEach(function (id) { ok(seen[id] > 100, id + ' 出題太少'); });
});

test('描點的格子：涵蓋整個 a 的範圍，格子中心落在格子內', function () {
  D.IDS.forEach(function (id) {
    const R = D.FUNCS[id].aRange;
    ok(D.traceBin(id, R[0]) === 0 && D.traceBin(id, R[1]) === D.TRACE_BINS - 1, id + ' 兩端');
    for (let i = 0; i < D.TRACE_BINS; i++) ok(D.traceBin(id, D.binCenter(id, i)) === i, id + ' 第 ' + i + ' 格');
  });
});

test('文字：三次函數的 TeX 省略 0 與 1，導函數的 TeX 正確', function () {
  ok(D.cubicTex({ a: 1, b: 0, c: -1, d: 0 }) === 'x^{3} - x', D.cubicTex({ a: 1, b: 0, c: -1, d: 0 }));
  ok(D.cubicTex({ a: -0.3, b: 0.5, c: 0, d: -2 }) === '-0.3x^{3} + 0.5x^{2} - 2', D.cubicTex({ a: -0.3, b: 0.5, c: 0, d: -2 }));
  ok(D.cubicTex({ a: 0, b: 0, c: 0, d: 0 }) === '0');
  ok(D.cubicDerivTex({ a: 1, b: -3, c: 0, d: 5 }) === '3x^{2} - 6x', D.cubicDerivTex({ a: 1, b: -3, c: 0, d: 5 }));
  ok(D.cubicDerivTex({ a: 0.3, b: -0.6, c: -0.9, d: 1.2 }) === '0.9x^{2} - 1.2x - 0.9', D.cubicDerivTex(K));
  ok(D.trim(-0.0000001, 3) === '0' && D.trim(2.5, 3) === '2.5' && D.trim(3, 2) === '3', 'trim');
});

console.log('\n' + (fail ? fail + ' 項失敗、' : '') + pass + ' 項測試通過。');
if (fail) process.exit(1);
