// 以 Node 執行：node tests/population-growth-core.test.js
'use strict';
const assert = require('assert');
const P = require('../js/population-growth-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b} ± ${tol}，得到 ${a}`);
}
const PP = { a: 1, b: 0.02, c: 0.01, d: 0.8, K: Infinity, E: 0 };

console.log('population-growth-core');

test('指數成長：N = N0·e^{rt}，倍增時間 ln2/r', () => {
  close(P.expo(10, 0.5, 2), 10 * Math.E, 1e-9);
  close(P.doublingTime(Math.LN2 / 5), 5, 1e-12);
  close(P.expo(3, 0.3, P.doublingTime(0.3)), 6, 1e-9);
});

test('邏輯斯成長：解析解滿足微分方程式、t = 0 時等於 N0、t → ∞ 趨近 K', () => {
  const N0 = 10, r = 0.5, K = 500;
  close(P.logistic(N0, r, K, 0), N0, 1e-9);
  close(P.logistic(N0, r, K, 80), K, 1e-6);
  for (const t of [1, 5, 9, 15]) {
    const h = 1e-5, dN = (P.logistic(N0, r, K, t + h) - P.logistic(N0, r, K, t - h)) / (2 * h);
    close(dN, P.rateLogistic(P.logistic(N0, r, K, t), r, K), 1e-5, 't = ' + t);
  }
  // 從上方（N0 > K）往下趨近 K
  assert.ok(P.logistic(900, r, K, 3) < 900 && P.logistic(900, r, K, 3) > K);
});

test('反曲點：N = K/2 時成長速率最大（rK/4），時刻 = ln(K/N0 − 1)/r', () => {
  const N0 = 10, r = 0.5, K = 500;
  const ti = P.inflectionTime(N0, r, K);
  close(P.logistic(N0, r, K, ti), K / 2, 1e-9);
  close(P.rateLogistic(K / 2, r, K), r * K / 4, 1e-12);
  for (const N of [100, 200, 249, 251, 300, 400]) assert.ok(P.rateLogistic(N, r, K) < r * K / 4);
  close(P.timeToReach(N0, r, K, 250), ti, 1e-9);
  assert.ok(isNaN(P.inflectionTime(300, r, K)));
  assert.ok(isNaN(P.timeToReach(10, r, K, 600)), '永遠到不了 K 以上');
});

test('隨機模型：族群大時平均值貼近邏輯斯解；固定亂數種子可重現', () => {
  const r = 0.5, K = 400, N0 = 40, tEnd = 20, M = 60;
  let sum = 0;
  for (let k = 0; k < M; k++) {
    const g = P.gillespie({ N0, r, K, tEnd, rand: P.rng(1000 + k) });
    sum += g.N[g.N.length - 1];
  }
  const mean = sum / M;
  close(mean, P.logistic(N0, r, K, tEnd), 0.04 * K, '20 天後的平均');
  const a = P.gillespie({ N0: 5, r, K, tEnd: 10, rand: P.rng(7) }), b = P.gillespie({ N0: 5, r, K, tEnd: 10, rand: P.rng(7) });
  assert.deepStrictEqual(a.N, b.N);
});

test('隨機模型的滅絕機率：指數成長從 N0 個開始，最後滅絕的機率 = (μ/λ)^N0', () => {
  const trials = 4000;
  for (const N0 of [1, 2, 3]) {
    let ext = 0;
    const rand = P.rng(42 + N0);
    for (let k = 0; k < trials; k++) {
      const g = P.gillespie({ N0, r: 0.5, K: Infinity, tEnd: 60, rand, cap: 60 });
      if (g.extinct) ext++;
    }
    const p = P.extinctionProb(N0), sd = Math.sqrt(p * (1 - p) / trials);
    // 到 60 個體就停：之後還滅絕的機率只有 0.5^60
    close(ext / trials, p, 4 * sd, 'N0 = ' + N0);
  }
});

test('Lotka–Volterra：平衡點 (d/c, a/b)，從平衡點出發保持不動', () => {
  const eq = P.lvEquilibrium(PP);
  close(eq.x, 80, 1e-12); close(eq.y, 50, 1e-12);
  const s = P.simulate2(P.lvDeriv, PP, 80, 50, 30);
  for (let i = 0; i < s.t.length; i++) { close(s.x[i], 80, 1e-8); close(s.y[i], 50, 1e-8); }
});

test('Lotka–Volterra：守恆量 V 在數值積分中保持不變（相對誤差 < 1e-7），軌跡是封閉曲線', () => {
  const s = P.simulate2(P.lvDeriv, PP, 40, 20, 60);
  const V0 = P.lvInvariant(PP, 40, 20);
  let worst = 0;
  for (let i = 0; i < s.t.length; i++) worst = Math.max(worst, Math.abs(P.lvInvariant(PP, s.x[i], s.y[i]) - V0) / Math.abs(V0));
  assert.ok(worst < 1e-7, worst);
  const sum = P.lvSummary(s);
  assert.ok(sum.cycles >= 3);
  // 每一圈的獵物峰值都一樣高
  const pk = sum.peaksX.map(p => p.v);
  assert.ok(Math.max(...pk) - Math.min(...pk) < 1e-3 * pk[0]);
});

test('Lotka–Volterra：小振幅週期 = 2π/√(ad)；振幅大時週期變長', () => {
  const T0 = P.lvPeriod0(PP);
  close(T0, 2 * Math.PI / Math.sqrt(0.8), 1e-12);
  const small = P.lvSummary(P.simulate2(P.lvDeriv, PP, 80 * 1.02, 50, 60));
  close(small.period / T0, 1, 0.003, '振幅 2%');
  const big = P.lvSummary(P.simulate2(P.lvDeriv, PP, 20, 10, 80));
  assert.ok(big.period > 1.1 * T0, big.period / T0);
});

test('Lotka–Volterra：獵物的峰值先出現，掠食者落後約四分之一週期（小振幅時恰好 1/4）', () => {
  const s = P.lvSummary(P.simulate2(P.lvDeriv, PP, 80 * 1.02, 50, 60));
  close(s.lag / s.period, 0.25, 0.01);
  const b = P.lvSummary(P.simulate2(P.lvDeriv, PP, 40, 20, 60));
  assert.ok(b.lag > 0 && b.lag < 0.5 * b.period);
});

test('一個週期的時間平均等於平衡點（Volterra）；兩種一起捕撈，獵物平均反而增加、掠食者減少', () => {
  const s = P.lvSummary(P.simulate2(P.lvDeriv, PP, 30, 15, 80, { h: 0.002, every: 0.01 }));
  close(s.avgX / 80, 1, 0.003); close(s.avgY / 50, 1, 0.003);
  const pe = Object.assign({}, PP, { E: 0.2 });
  const se = P.lvSummary(P.simulate2(P.lvDeriv, pe, 30, 15, 80, { h: 0.002, every: 0.01 }));
  close(se.avgX, (0.8 + 0.2) / 0.01, 0.003 * 100);
  close(se.avgY, (1 - 0.2) / 0.02, 0.003 * 40);
  assert.ok(se.avgX > 1.2 * s.avgX && se.avgY < s.avgY);
});

test('獵物有負荷量：振盪逐漸變小、收斂到平衡點；負荷量太小時掠食者滅絕', () => {
  const pk = Object.assign({}, PP, { K: 400 });
  const eq = P.lvEquilibrium(pk);
  close(eq.x, 80, 1e-12); close(eq.y, (1 - 80 / 400) / 0.02, 1e-9);
  const s = P.simulate2(P.lvDeriv, pk, 40, 20, 150);
  const n = s.t.length - 1;
  close(s.x[n], eq.x, 0.01 * eq.x); close(s.y[n], eq.y, 0.01 * eq.y);
  const pks = P.peaks(s.t, s.x).map(p => p.v);
  for (let i = 1; i < Math.min(4, pks.length); i++) assert.ok(pks[i] < pks[i - 1]);
  const low = Object.assign({}, PP, { K: 70 });
  assert.ok(!P.lvEquilibrium(low).coexist);
  const sl = P.simulate2(P.lvDeriv, low, 40, 20, 200);
  assert.ok(sl.y[sl.y.length - 1] < 0.01, '掠食者滅絕');
  close(sl.x[sl.x.length - 1], 70, 0.5);
});

test('種間競爭：四種結局與 K、α 的關係；內部平衡點', () => {
  const base = { r1: 0.8, r2: 0.8, K1: 500, K2: 400 };
  const run = p => { const s = P.simulate2(P.compDeriv, p, 20, 20, 200); return [s.x[s.x.length - 1], s.y[s.y.length - 1]]; };
  const p1 = Object.assign({}, base, { a12: 0.6, a21: 1.4 });
  assert.strictEqual(P.compOutcome(p1).kind, '1');
  let e = run(p1); close(e[0], 500, 1); assert.ok(e[1] < 1);
  const p2 = Object.assign({}, base, { a12: 1.5, a21: 0.6 });
  assert.strictEqual(P.compOutcome(p2).kind, '2');
  e = run(p2); close(e[1], 400, 1); assert.ok(e[0] < 1);
  const pc = Object.assign({}, base, { a12: 0.5, a21: 0.4 });
  const oc = P.compOutcome(pc);
  assert.strictEqual(oc.kind, 'coexist');
  close(oc.eq.x, (500 - 200) / 0.8, 1e-9); close(oc.eq.y, (400 - 200) / 0.8, 1e-9);
  e = run(pc); close(e[0], oc.eq.x, 0.5); close(e[1], oc.eq.y, 0.5);
  const pb = Object.assign({}, base, { a12: 1.5, a21: 1.2 });
  assert.strictEqual(P.compOutcome(pb).kind, 'bistable');
  const s1 = P.simulate2(P.compDeriv, pb, 300, 50, 300), s2 = P.simulate2(P.compDeriv, pb, 50, 300, 300);
  assert.ok(s1.y[s1.y.length - 1] < 1 && s1.x[s1.x.length - 1] > 499, '物種 1 先多就贏');
  assert.ok(s2.x[s2.x.length - 1] < 1 && s2.y[s2.y.length - 1] > 399, '物種 2 先多就贏');
});

test('RK4 的收斂：步長減半，誤差約小 16 倍', () => {
  const ex = P.logistic(10, 0.5, 500, 10);
  const f = (p, x, y, o) => { o[0] = 0.5 * x * (1 - x / 500); o[1] = 0; };
  const e1 = Math.abs(P.simulate2(f, {}, 10, 0, 10, { h: 0.2, every: 10 }).x.slice(-1)[0] - ex);
  const e2 = Math.abs(P.simulate2(f, {}, 10, 0, 10, { h: 0.1, every: 10 }).x.slice(-1)[0] - ex);
  close(e1 / e2, 16, 3);
});

console.log(passed + ' 項通過');
