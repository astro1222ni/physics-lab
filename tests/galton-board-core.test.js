// 以 Node 執行：node tests/galton-board-core.test.js
'use strict';
const assert = require('assert');
const G = require('../js/galton-board-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（容許 ${tol}），得到 ${a}`);
}
const sum = a => a.reduce((s, v) => s + v, 0);

console.log('組合數與巴斯卡三角形');
test('C(n, k) 的已知值與對稱性', () => {
  assert.strictEqual(G.choose(10, 3), 120);
  assert.strictEqual(G.choose(16, 8), 12870);
  assert.strictEqual(G.choose(16, 2), 120);
  assert.strictEqual(G.choose(5, 0), 1);
  assert.strictEqual(G.choose(5, 6), 0);
  assert.strictEqual(G.choose(5, -1), 0);
  for (let n = 0; n <= 30; n++) for (let k = 0; k <= n; k++) assert.strictEqual(G.choose(n, k), G.choose(n, n - k));
});
test('巴斯卡遞迴 C(n, k) = C(n − 1, k − 1) + C(n − 1, k)，每列總和 2^n', () => {
  for (let n = 1; n <= 30; n++) {
    let s = 0;
    for (let k = 0; k <= n; k++) {
      assert.strictEqual(G.choose(n, k), G.choose(n - 1, k - 1) + G.choose(n - 1, k), `C(${n}, ${k})`);
      s += G.choose(n, k);
    }
    assert.strictEqual(s, Math.pow(2, n));
  }
});
test('路徑數：數遍 2^n 條左右路徑，落到第 k 格的恰好 C(n, k) 條', () => {
  for (let n = 1; n <= 12; n++) {
    const cnt = G.zeros(n + 1);
    for (let m = 0; m < (1 << n); m++) { let k = 0; for (let r = 0; r < n; r++) if (m & (1 << r)) k++; cnt[k]++; }
    for (let k = 0; k <= n; k++) assert.strictEqual(cnt[k], G.choose(n, k));
  }
});

console.log('二項分布');
test('機率總和是 1，期望值 np、變異數 np(1 − p)（直接由分布算）', () => {
  for (let n = 1; n <= G.MAX_N; n++) for (const p of [0, 0.05, 0.3, 0.5, 0.77, 0.95, 1]) {
    const P = G.pmf(n, p);
    close(sum(P), 1, 1e-12, `n=${n} p=${p} 總和`);
    const m = P.reduce((s, v, k) => s + k * v, 0);
    const v = P.reduce((s, q, k) => s + q * (k - m) * (k - m), 0);
    close(m, G.mean(n, p), 1e-12, '期望值');
    close(v, G.variance(n, p), 1e-12, '變異數');
  }
});
test('精確值：B(10, ½) 的兩端是 1/1024；B(5, ¾) 的第 0 格也是 1/1024；p = 0、1 全部落在一端', () => {
  assert.strictEqual(G.pmf(10, 0.5)[0], 1 / 1024);
  assert.strictEqual(G.pmf(10, 0.5)[10], 1 / 1024);
  close(G.pmf(5, 0.75)[0], 1 / 1024, 1e-15);
  assert.deepStrictEqual(G.pmf(4, 0), [1, 0, 0, 0, 0]);
  assert.deepStrictEqual(G.pmf(4, 1), [0, 0, 0, 0, 1]);
  close(G.pmf(10, 0.5)[5], 252 / 1024, 1e-15);
});
test('相鄰兩格的比 P(k + 1)/P(k) = (n − k)/(k + 1) · p/(1 − p)', () => {
  for (const [n, p] of [[10, 0.3], [16, 0.62], [7, 0.5]]) {
    const P = G.pmf(n, p);
    for (let k = 0; k < n; k++) close(P[k + 1] / P[k], (n - k) / (k + 1) * p / (1 - p), 1e-10);
  }
});
test('眾數：⌊(n + 1)p⌋；(n + 1)p 是整數時兩格並列（與實際最大的格子一致）', () => {
  for (let n = 1; n <= G.MAX_N; n++) for (let i = 0; i <= 100; i++) {
    const p = i / 100;
    assert.deepStrictEqual(G.modes(n, p), G.topBins(G.pmf(n, p)), `n=${n} p=${p}`);
  }
  assert.deepStrictEqual(G.modes(9, 0.3), [2, 3]);
  assert.deepStrictEqual(G.modes(4, 0.2), [0, 1]);
  assert.deepStrictEqual(G.modes(10, 0.5), [5]);
});

console.log('常態近似');
test('Φ 的已知值：Φ(0) = ½、Φ(1) ≈ 0.841345、Φ(1.96) ≈ 0.975、Φ(−z) = 1 − Φ(z)', () => {
  close(G.normCdf(0), 0.5, 1e-15);
  close(G.normCdf(1), 0.8413447460685429, 1e-13);
  close(G.normCdf(1.96), 0.9750021048517795, 1e-13);
  close(G.normCdf(-2.5), 0.006209665325776132, 1e-14);
  close(G.normCdf(-5), 2.866515718791939e-7, 1e-18);
  close(G.erfc(4.5), 1.966160441542887e-10, 1e-22);
  close(G.erfc(3) , 2.209049699858544e-5, 1e-17);
  for (let z = -4; z <= 4; z += 0.25) close(G.normCdf(-z) + G.normCdf(z), 1, 1e-12);
});
test('常態密度的積分是 1（梯形法）', () => {
  let s = 0; const h = 0.001;
  for (let x = -8; x < 8; x += h) s += (G.normPdf(x, 0.3, 1.2) + G.normPdf(x + h, 0.3, 1.2)) / 2 * h;
  close(s, 1, 1e-6);
});
test('常態近似：n 越大、p 越接近 ½ 越準', () => {
  assert.ok(G.maxNormalErr(16, 0.5) < G.maxNormalErr(8, 0.5));
  assert.ok(G.maxNormalErr(16, 0.5) < G.maxNormalErr(16, 0.2));
  assert.ok(G.maxNormalErr(10, 0.5) <= 0.003);
  assert.ok(G.maxNormalErr(8, 0.5) > 0.003);
  assert.ok(G.maxNormalErr(16, 0.45) > 0.003);
  close(sum(G.normalApprox(12, 0.5)), 1, 1e-3);
});

console.log('落球（蒙地卡羅）');
test('同一個種子結果相同（可重現）', () => {
  const a = G.dropMany(G.rng(42), 10, 0.5, 500), b = G.dropMany(G.rng(42), 10, 0.5, 500);
  assert.deepStrictEqual(a, b);
});
test('一顆球的路徑：往右的次數就是格子編號', () => {
  const r = G.rng(7);
  for (let i = 0; i < 2000; i++) {
    const d = G.drop(r, 12, 0.4);
    assert.strictEqual(d.path.length, 12);
    assert.strictEqual(d.k, sum(d.path));
  }
});
test('大數法則：20 萬顆球的頻率、平均、變異數都很接近理論', () => {
  for (const [n, p] of [[10, 0.5], [16, 0.3], [5, 0.8]]) {
    const c = G.dropMany(G.rng(n * 100 + 1), n, p, 200000);
    const s = G.stats(c);
    assert.strictEqual(s.N, 200000);
    close(s.mean, n * p, 0.02, `n=${n} p=${p} 平均`);
    close(s.variance / G.variance(n, p), 1, 0.02, '變異數');
    assert.ok(G.tv(c, G.pmf(n, p)) < 0.006, '總差距');
    close(G.estimateP(c, n), p, 0.002, '估計的 p');
  }
});
test('差距大約隨 1/√N 縮小（N 增為 100 倍，差距約縮成 1/10）', () => {
  const med = N => { const v = []; for (let t = 0; t < 41; t++) v.push(G.tv(G.dropMany(G.rng(1000 + t + N), 10, 0.5, N), G.pmf(10, 0.5))); v.sort((a, b) => a - b); return v[20]; };
  const r = med(200) / med(20000);
  assert.ok(r > 6 && r < 15, '比值 ' + r);
});
test('總差距的典型大小 expectedTV 和模擬的平均相符（N = 20000，誤差 10% 內）', () => {
  for (const [n, p] of [[10, 0.5], [6, 0.25]]) {
    const P = G.pmf(n, p);
    let s = 0;
    for (let t = 0; t < 60; t++) s += G.tv(G.dropMany(G.rng(500 + t), n, p, 20000), P);
    close(s / 60 / G.expectedTV(P, 20000), 1, 0.1, `n=${n} p=${p}`);
  }
});
test('統計量：手算的例子', () => {
  const s = G.stats([1, 3, 3, 1]);   // 0,1,1,1,2,2,2,3
  assert.strictEqual(s.N, 8);
  close(s.mean, 1.5, 1e-12);
  close(s.variance, 0.75, 1e-12);   // Σ(k − 1.5)² c_k / 8 = (2.25 + 3·0.25 + 3·0.25 + 2.25)/8
  assert.ok(isNaN(G.stats([0, 0]).mean));
  close(G.tv([1, 3, 3, 1], G.pmf(3, 0.5)), 0, 1e-15);
  close(G.tv([4, 0, 0, 0], G.pmf(3, 0.5)), 7 / 8, 1e-15);
});
test('挑戰的神祕 p：0.05 到 0.95、0.01 的倍數，避開 0.5 附近與目前的值', () => {
  const r = G.rng(99);
  for (let i = 0; i < 5000; i++) {
    const v = G.hiddenP(r, 0.3);
    assert.ok(v >= 0.05 && v <= 0.95 && Math.abs(v * 100 - Math.round(v * 100)) < 1e-9);
    assert.ok(Math.abs(v - 0.5) >= 0.02 && Math.abs(v - 0.3) >= 0.08);
  }
  close(G.stdErrP(0.5, 16, 100), Math.sqrt(0.25 / 1600), 1e-15);
});
test('釘子與格子的位置：第 r 層的釘子左右對稱、間距 1，第 k 格在第 n 層兩根釘子的正中間下方', () => {
  for (let r = 0; r < 10; r++) {
    close(G.pegXY(r, 0).x + G.pegXY(r, r).x, 0, 1e-12);
    for (let j = 1; j <= r; j++) close(G.pegXY(r, j).x - G.pegXY(r, j - 1).x, 1, 1e-12);
  }
  for (let n = 1; n <= 16; n++) for (let k = 0; k <= n; k++) close(G.binX(n, k), G.pegXY(n - 1, 0).x + k - 0.5, 1e-12);
});

console.log(`\n${passed} 項測試通過${process.exitCode ? '，有失敗' : ''}。`);
