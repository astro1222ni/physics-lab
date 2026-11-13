// 以 Node 執行：node tests/seawater-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/seawater-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }

console.log('seawater-core');

test('EOS-80 和 UNESCO 技術報告 44 的檢核值一致（8 組，到 10⁻⁵ kg/m³）', () => {
  [[0, 5, 0, 999.96675], [0, 5, 10000, 1044.12802], [0, 25, 0, 997.04796], [0, 25, 10000, 1037.90204],
    [35, 5, 0, 1027.67547], [35, 5, 10000, 1069.48914], [35, 25, 0, 1023.34306], [35, 25, 10000, 1062.53817]]
    .forEach(c => near(K.rho(c[0], c[1], c[2]), c[3], 1e-5, c.slice(0, 3).join(', ')));
});

test('冰點、絕熱遞減率、位溫和 UNESCO 檢核值一致', () => {
  near(K.freezing(40, 500), -2.588567, 1e-6, '冰點(40, 500 dbar)');
  near(K.freezing(35, 0), -1.922, 0.001, '一般海水約 −1.92 °C');
  near(K.freezing(0, 0), 0, 1e-12, '淡水 0 °C');
  near(K.adiabat(40, 40, 10000), 3.255976e-4, 1e-10, '絕熱遞減率');
  near(K.theta(40, 40, 10000, 0), 36.89073, 1e-5, '位溫');
  near(K.tFromTheta(35, K.theta(35, 3, 4000, 0), 4000), 3, 1e-8, '位溫反算現場溫度');
});

test('淡水在 3.98 °C 最重；鹽度越高，最大密度的溫度越低，約 24.6 時和冰點相交', () => {
  near(K.tMaxDensity(0), 3.98, 0.01);
  assert.ok(K.tMaxDensity(10) < K.tMaxDensity(0) && K.tMaxDensity(20) < K.tMaxDensity(10));
  // 交點：最大密度溫度 = 冰點
  let lo = 20, hi = 30;
  for (let i = 0; i < 60; i++) { const s = (lo + hi) / 2; if (K.tMaxDensity(s) > K.freezing(s)) lo = s; else hi = s; }
  near(lo, 24.7, 0.15, '交點鹽度（課本常寫 24.7）');
  // 一般海水（35）冷到冰點都還是越冷越重
  for (let T = K.freezing(35) + 0.01; T < 30; T += 0.5) assert.ok(K.rho0(35, T) > K.rho0(35, T + 0.5), 'T = ' + T);
});

test('α 為正（越熱越輕）且隨溫度變大；β 為正（越鹹越重）、變化小', () => {
  const a2 = K.alpha(35, 2, 0), a20 = K.alpha(35, 20, 0);
  assert.ok(a2 > 0 && a20 > 3 * a2, '冷水的熱膨脹小很多：' + a2 + '、' + a20);
  near(a20, 2.5e-4, 0.3e-4, '20 °C 時 α ≈ 2.5 × 10⁻⁴ /K');
  const b2 = K.beta(35, 2, 0), b20 = K.beta(35, 20, 0);
  near(b2, 7.8e-4, 0.3e-4); near(b20, 7.4e-4, 0.3e-4);
  assert.ok(K.alpha(0, 2, 0) < 0, '淡水 2 °C 時加熱反而變重');
});

test('壓縮性：4000 m 深處同一團水的現場密度大約重 18 kg/m³', () => {
  const p = K.pressure(4000);
  near(p, 4066, 3, 'Saunders 1981：4000 m ≈ 4066 dbar（30°）');
  near(K.rho(34.7, 1.5, p) - K.rho(34.7, 1.5, 0), 18.6, 0.5);
});

test('混合後變重（cabbeling）：等密度的冷水與暖水，一比一混合後比兩者都重', () => {
  // 先找和 (2 °C, 34.5) 一樣重的 15 °C 海水
  const A = { T: 2, S: 34.5 }, sA = K.sigma(A.S, A.T, 0);
  let lo = 30, hi = 42;
  for (let i = 0; i < 60; i++) { const s = (lo + hi) / 2; if (K.sigma(s, 15, 0) < sA) lo = s; else hi = s; }
  const B = { T: 15, S: lo };
  near(K.sigma(B.S, B.T, 0), sA, 1e-8);
  const M = K.mix(A, B, 0.5), sM = K.sigma(M.S, M.T, 0);
  assert.ok(sM - sA > 0.1, '混合後重 ' + (sM - sA).toFixed(3));
  // 混合比例 0 或 1 時就是原本的水
  const m0 = K.mix(A, B, 0); near(m0.T, A.T, 1e-12); near(m0.S, A.S, 1e-12);
});

test('典型剖面都是穩定的（往下不會變輕），表層到深層 σθ 遞增', () => {
  Object.keys(K.PROFILES).forEach(k => {
    near(K.profileInversion(k), 0, 1e-9, k);
    assert.ok(K.profileSigma(k, 4000) > K.profileSigma(k, 0), k);
  });
  // 北太平洋亞寒帶冬季：溫度往下幾乎不變，是鹽躍層撐住的
  const n0 = K.profileAt('npac', 0), n200 = K.profileAt('npac', 200);
  assert.ok(n200.T < n0.T && n0.T - n200.T < 2.5 && n200.S - n0.S > 1);
});

test('水團在剖面裡會停在合理的深度；比海面輕的浮在海面，比海底重的沉到底', () => {
  // 地中海水（σθ ≈ 27.8）在西邊的副熱帶剖面會停在 1–2 km（真實的地中海水在東大西洋約 1000 m，那裡的背景剖面較鹹）
  const s = K.settle('natl', 11.8, 36.5);
  assert.ok(s.where === 'mid' && s.z > 1000 && s.z < 2200, '地中海水 ' + s.z);
  assert.strictEqual(K.settle('natl', 30, 34).where, 'surface');
  assert.strictEqual(K.settle('wpac', -1.9, 36).where, 'bottom');
  const a = K.settle('natl', 2.5, 34.92);
  assert.ok(a.z > 2500, 'NADW 在北大西洋停在深層 ' + a.z);
});

test('水團：σθ 都在合理範圍；以海面為參考時 NADW 比 AABW 還重（所以深海要用 σ4）', () => {
  const S = id => K.MASSES.find(m => m.id === id);
  K.MASSES.forEach(m => assert.ok(K.sigma(m.S, m.T, 0) > 20 && K.sigma(m.S, m.T, 0) < 28.2, m.id));
  const n = S('nadw'), a = S('aabw');
  assert.ok(K.sigma(n.S, n.T, 0) > K.sigma(a.S, a.T, 0), 'σθ');
  const p = 4000;
  const s4 = m => K.rho(m.S, K.tFromTheta(m.S, m.T, p), p) - K.rho(n.S, K.tFromTheta(n.S, n.T, p), p);
  assert.ok(s4(a) > 0, '在 4000 dbar 比較時 AABW 比 NADW 重 ' + s4(a).toFixed(3));
  // 和 σθ 最大的水團一致
  const top = K.MASSES.slice().sort((x, y) => K.sigma(y.S, y.T, 0) - K.sigma(x.S, x.T, 0))[0];
  assert.strictEqual(top.id, 'nadw');
});

console.log(`\n${passed} 項通過${process.exitCode ? '（有失敗）' : ''}`);
