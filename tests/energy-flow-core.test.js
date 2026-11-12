// 以 Node 執行：node tests/energy-flow-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/energy-flow-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b} ± ${tol}，得到 ${a}`);
}
function rel(a, b, tol, msg) { close(a / b, 1, tol, msg); }

console.log('energy-flow-core');

test('生產者：GPP = I·ε，NPP = GPP·(1 − rp)，呼吸 + 淨生產 = 總生產', () => {
  const p = K.params('grass');
  p.I = 2e6; p.eps = 0.02; p.rp = 0.3;
  const r = K.compute(p);
  close(r.GPP, 4e4, 1e-6);
  close(r.NPP, 2.8e4, 1e-6);
  close(r.R[0] + r.P[0], r.GPP, 1e-9);
});

test('消費者：攝食 = 同化 + 排遺，同化 = 呼吸 + 淨生產，上一階淨生產 = 被吃 + 沒被吃', () => {
  for (const k of ['grass', 'ocean', 'forest']) {
    const p = K.params(k); p.N = 6;
    const r = K.compute(p);
    for (let n = 1; n < 6; n++) {
      close(r.In[n], r.A[n] + r.F[n], 1e-9 * r.In[n] + 1e-15, k + ' 第 ' + (n + 1) + ' 階 攝食');
      close(r.A[n], r.R[n] + r.P[n], 1e-9 * r.A[n] + 1e-15, k + ' 同化');
      close(r.P[n - 1], r.In[n] + r.U[n - 1], 1e-9 * r.P[n - 1], k + ' 被吃與沒被吃');
    }
  }
});

test('能量守恆：所有呼吸的熱 + 累積量 = GPP（任何設定、任何層數）', () => {
  let seed = 7;
  const rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let t = 0; t < 300; t++) {
    const p = K.params(['grass', 'ocean', 'forest'][t % 3]);
    p.N = 1 + (t % 6); p.I = 1e5 + rnd() * 9.9e6; p.eps = 0.0005 + rnd() * 0.0495; p.rp = 0.1 + 0.8 * rnd(); p.dec = 0.1 + 0.9 * rnd();
    p.lv.forEach(function (l) { l.ce = 0.01 + 0.99 * rnd(); l.ae = 0.05 + 0.9 * rnd(); l.pe = 0.01 + 0.79 * rnd(); });
    const r = K.compute(p);
    close(r.balance, 0, 1e-9 * r.GPP, '第 ' + t + ' 組');
    // 碎屑也守恆：GPP = 所有消費者與生產者的呼吸 + 碎屑
    close(r.R.slice(0, r.N).reduce((a, b) => a + b, 0) + r.D, r.GPP, 1e-9 * r.GPP);
  }
});

test('傳遞效率 En = An / A(n−1) = CEn·AEn·PE(n−1)；第 2 階的 PE1 = 1 − rp', () => {
  const p = K.params('grass'); p.N = 5;
  const r = K.compute(p);
  close(r.E[1], p.lv[1].ce * p.lv[1].ae * (1 - p.rp), 1e-12);
  for (let n = 2; n < 5; n++) close(r.E[n], p.lv[n].ce * p.lv[n].ae * p.lv[n - 1].pe, 1e-12);
  // 整條鏈：A_N / GPP = 各階效率相乘
  close(r.chain, r.E[1] * r.E[2] * r.E[3] * r.E[4], 1e-15);
});

test('十分之一法則：每階 E = 10% 時，第 n 階的同化量是 GPP 的 10^(1−n)', () => {
  const p = K.params('grass'); p.N = 6; p.rp = 0.5;
  p.lv[1].ce = 0.5; p.lv[1].ae = 0.4;                         // 0.5·0.4·0.5 = 0.1
  for (let n = 1; n < 6; n++) p.lv[n].pe = 0.25;
  for (let n = 2; n < 6; n++) { p.lv[n].ce = 0.5; p.lv[n].ae = 0.8; } // 0.5·0.8·0.25 = 0.1
  const r = K.compute(p);
  for (let n = 1; n < 6; n++) rel(r.A[n], r.GPP * Math.pow(10, -n), 1e-12);
});

test('能量金字塔永遠是正的（效率都不超過 100% 時）；生物量與個體數金字塔可以倒立', () => {
  for (const k of ['grass', 'ocean', 'forest']) {
    const p = K.params(k); p.N = 6;
    const r = K.compute(p);
    assert.ok(K.inverted(K.pyramid(r, 'energy')).every(x => !x), k + ' 能量金字塔不倒立');
  }
  const ro = K.compute(K.params('ocean'));
  assert.ok(K.inverted(K.pyramid(ro, 'biomass'))[1], '海洋：浮游動物比浮游植物重');
  assert.ok(!K.inverted(K.pyramid(ro, 'numbers'))[1], '海洋：個體數仍是正的');
  const rf = K.compute(K.params('forest'));
  assert.ok(K.inverted(K.pyramid(rf, 'numbers'))[1], '森林：毛毛蟲比樹多');
  assert.ok(!K.inverted(K.pyramid(rf, 'biomass'))[1], '森林：生物量仍是正的');
});

test('現存量 = 流量 ÷ 周轉率；個體數 = 鮮重 ÷ 個體質量；面積 = 1 ÷ 密度', () => {
  const p = K.params('grass');
  const r = K.compute(p);
  close(r.Be[0], r.P[0] / p.lv[0].pb, 1e-9);
  close(r.mass[0], r.Be[0] / K.ED_PLANT, 1e-9);
  close(r.mass[2], r.P[2] / p.lv[2].pb / K.ED_ANIMAL, 1e-12);
  close(r.num[3] * p.lv[3].mass, r.mass[3], 1e-12);
  close(r.area[3] * r.num[3], 1, 1e-12);
});

test('生物放大：cn / c(n−1) = α(1 − e) / (AEn·PEn)；污染物流量 φn = α(1 − e)·CEn·φ(n−1)', () => {
  const p = K.params('forest'); p.N = 5;
  const r = K.compute(p);
  const keep = p.alpha * (1 - p.elim);
  close(r.conc[0], p.bcf, 1e-12);
  for (let n = 1; n < 5; n++) {
    rel(r.conc[n] / r.conc[n - 1], keep / (p.lv[n].ae * p.lv[n].pe), 1e-12);
    rel(r.flux[n], keep * p.lv[n].ce * r.flux[n - 1], 1e-12);
  }
  // 全部被吃、全部吸收、完全不排出：污染物量一路守恆，濃度剛好和淨生產量成反比
  p.alpha = 1; p.elim = 0; p.lv.forEach(function (l) { l.ce = 1; });
  const r2 = K.compute(p);
  for (let n = 1; n < 5; n++) { rel(r2.flux[n], r2.flux[0], 1e-12); rel(r2.conc[n] * r2.P[n], r2.conc[0] * r2.P[0], 1e-12); }
});

test('水溶性、容易排出（α(1 − e) 小於 AE·PE）時，污染物每往上一階都變稀', () => {
  const p = K.params('grass'); p.N = 4; p.alpha = 0.3; p.elim = 0.9;
  const r = K.compute(p);
  for (let n = 1; n < 4; n++) assert.ok(r.bmf[n] < 1, '第 ' + (n + 1) + ' 階');
});

test('只有生產者（N = 1）且分解者全部分解時，所有能量都變成熱', () => {
  const p = K.params('grass'); p.N = 1; p.dec = 1;
  const r = K.compute(p);
  close(r.heat, r.GPP, 1e-9);
  close(r.store, 0, 1e-12);
  close(r.D, r.NPP, 1e-9);
});

test('Lindeman（1942）Cedar Bog Lake 的效率 0.10%、13.3%、22.3% 可以用三個效率湊出來', () => {
  const p = K.params('grass'); p.N = 3; p.eps = 0.001; p.rp = 0.5;
  p.lv[1].ce = 0.38; p.lv[1].ae = 0.70;            // 0.38·0.70·0.5 = 0.133
  p.lv[1].pe = 0.5575; p.lv[2].ce = 0.5; p.lv[2].ae = 0.8;  // 0.5·0.8·0.5575 = 0.223
  const r = K.compute(p);
  close(r.GPP / p.I, 0.001, 1e-15);
  close(r.E[1], 0.133, 1e-12);
  close(r.E[2], 0.223, 1e-12);
});

test('Odum（1957）銀泉：GPP 20,810、NPP 8,833、草食 1,478、肉食 67、頂級 6 kcal/m²/年的比例都做得出來', () => {
  const p = K.params('grass'); p.N = 4;
  p.I = 20810 / 0.0122 * K.KJ_PER_KCAL; p.eps = 0.0122;
  p.rp = 1 - 8833 / 20810;
  p.lv[1].ce = 0.5; p.lv[1].ae = 0.76; p.lv[1].pe = 1478 / 8833 / 0.38;
  p.lv[2].ce = 0.3; p.lv[2].ae = 0.8; p.lv[2].pe = 67 / 1478 / 0.24;
  p.lv[3].ce = 0.4; p.lv[3].ae = 0.8; p.lv[3].pe = 6 / 67 / 0.32;
  const r = K.compute(p);
  const kcal = function (x) { return x / K.KJ_PER_KCAL; };
  rel(kcal(r.GPP), 20810, 1e-9); rel(kcal(r.P[0]), 8833, 1e-9); rel(kcal(r.P[1]), 1478, 1e-9);
  rel(kcal(r.P[2]), 67, 1e-9); rel(kcal(r.P[3]), 6, 1e-9);
});

test('預設組的參數都在滑桿範圍內，而且能量收支都是正數', () => {
  for (const k of Object.keys(K.PRESETS)) {
    const pr = K.PRESETS[k];
    assert.ok(pr.N >= 1 && pr.N <= K.MAXN && pr.eps >= 0.0005 && pr.eps <= 0.05 && pr.rp >= 0.1 && pr.rp <= 0.9 && pr.dec >= 0.1 && pr.dec <= 1, k);
    pr.lv.forEach(function (l, i) {
      if (i > 0) assert.ok(l.ce >= 0.01 && l.ce <= 1 && l.ae >= 0.05 && l.ae <= 0.95 && l.pe >= 0.01 && l.pe <= 0.8, k + ' 第 ' + (i + 1) + ' 階');
      assert.ok(l.pb >= 0.01 && l.pb <= 1000 && l.mass >= 1e-9 && l.mass <= 1e6, k + ' 第 ' + (i + 1) + ' 階 P/B、質量');
    });
    const r = K.compute(K.params(k));
    ['A', 'R', 'P', 'mass', 'num'].forEach(function (q) { r[q].slice(0, r.N).forEach(function (v) { assert.ok(v > 0 && isFinite(v), k + ' ' + q); }); });
  }
});

console.log(`  ${passed} 項測試通過`);
