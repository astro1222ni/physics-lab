// 以 Node 執行：node tests/greenhouse-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/greenhouse-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
const P = (o) => Object.assign({ S: 1, co2: 280, eps0: K.EPS0, alpha0: 0.3, wv: false, ice: false }, o);

console.log('greenhouse-core');

test('沒有大氣：有效輻射溫度 (S(1−α)/4σ)^¼ ＝ 254.6 K（約 255 K）；反照率 0 時 278.3 K', () => {
  near(K.bareTemp(1, 0.3), 254.58, 0.01);
  near(K.bareTemp(1, 0), 278.32, 0.01);
  near(K.settle(P({ eps0: 0 }), 288), K.bareTemp(1, 0.3), 1e-6);
});

test('單層大氣：Ts = Te (2/(2−ε))^¼；校正後的 ε0 讓現在的地球平衡在 288 K', () => {
  near(K.settle(P({}), 250), 288, 1e-6);
  for (const e of [0.2, 0.5, 0.9, 1]) near(K.settle(P({ eps0: e }), 288), K.bareTemp(1, 0.3) * Math.pow(2 / (2 - e), 0.25), 1e-6, 'ε=' + e);
  near(K.settle(P({ eps0: 1, alpha0: 0 }), 288), K.bareTemp(1, 0) * Math.pow(2, 0.25), 1e-6, '全吸收的上限 331 K');
  near(K.EPS0, 0.779, 0.001);
});

test('能量流自洽：大氣頂端 ASR − OLR ＝ 地表收支 ＝ N；大氣平衡溫度 Ta = Ts/2^¼', () => {
  for (const T of [230, 270, 288, 310]) {
    const p = P({ co2: 700, wv: true, ice: true });
    const f = K.flows(p, T);
    near(f.absorbed - f.olr, f.N, 1e-9);
    near(f.absorbed + f.atmDown - f.surface, f.N, 1e-9, '地表收支');
    near(f.atmAbs, f.atmUp + f.atmDown, 1e-9, '大氣收支');
    near(f.incoming, f.reflected + f.absorbed, 1e-9);
    near(f.N, K.imbalance(p, T), 1e-9);
    near(f.Ta, T / Math.pow(2, 0.25), 1e-9);
  }
});

test('CO₂ 強迫 5.35 ln(C/280)：加倍 3.71 W/m²；在 288 K 瞬間造成同樣大的能量不平衡', () => {
  near(K.forcing(560), 3.708, 0.001);
  near(K.forcing(280), 0, 1e-12);
  near(K.imbalance(P({ co2: 560 }), 288), K.forcing(560), 1e-9);
  near(K.imbalance(P({ co2: 1120, wv: true }), 288), K.forcing(1120), 1e-9, '回饋只在溫度改變後才作用');
});

test('回饋參數：普朗克 3.31、加水氣 1.51、再加冰 1.29 W/m²/K；CO₂ 加倍的平衡增溫 1.13、2.58、2.93 K', () => {
  const cases = [[P({}), 3.308, 1.132], [P({ wv: true }), 1.508, 2.584], [P({ wv: true, ice: true }), 1.291, 2.926]];
  for (const c of cases) {
    near(K.sensitivity(c[0], 288).lambda, c[1], 0.005);
    const d = K.settle(Object.assign({}, c[0], { co2: 560 }), 288) - K.baseline(c[0]);
    near(d, c[2], 0.005);
    near(d, K.F_CO2 * Math.log(2) / c[1], 0.15, '與線性估計 F2x/λ 相近（非線性讓實際值略大）');
  }
  near(K.sensitivity(P({}), 288).lambda, 4 * K.SIGMA * Math.pow(288, 3) * (1 - K.EPS0 / 2), 1e-4, '解析的普朗克回饋');
});

test('冰反照率：α(288) = 0.30、冷極限 0.62；冰緣緯度隨溫度往赤道推進', () => {
  const p = P({ ice: true });
  near(K.albedo(p, 288), 0.30, 1e-12);
  near(K.albedo(p, 150), 0.62, 1e-6);
  assert.ok(K.iceLatitude(p, 288) > 70 && K.iceLatitude(p, 288) < 90);
  assert.ok(K.iceLatitude(p, 265) < K.iceLatitude(p, 280));
  near(K.iceLatitude(p, 150), 0, 0.5);
  near(K.iceFraction(p, 400), 0, 0.01);
});

test('雪球地球：冰反照率回饋造成三個平衡（溫暖穩定、中間不穩定、雪球穩定）與遲滯', () => {
  const eq = K.equilibria(P({ ice: true, wv: true }));
  assert.deepStrictEqual(eq.map(e => e.stable), [true, false, true]);
  near(eq[2].T, 288, 1e-6);
  // 從不穩定平衡兩側出發，分別走向兩個穩定平衡
  near(K.settle(P({ ice: true, wv: true }), eq[1].T + 0.5), 288, 1e-6);
  near(K.settle(P({ ice: true, wv: true }), eq[1].T - 0.5), eq[0].T, 1e-6);
  // 太陽變暗 5%：溫暖的平衡消失，只剩雪球；再回到 100%，仍停在雪球
  assert.strictEqual(K.equilibria(P({ ice: true, wv: true, S: 0.95 })).length, 1);
  let T = K.run(P({ ice: true, wv: true, S: 0.95 }), 288, 300);
  assert.ok(T < 225, '凍結 ' + T);
  T = K.run(P({ ice: true, wv: true, S: 1 }), T, 300);
  assert.ok(T < 230, '仍是雪球 ' + T);
  // 要亮到 1.3 倍才融
  T = K.run(P({ ice: true, wv: true, S: 1.3 }), T, 400);
  assert.ok(T > 320, '融化 ' + T);
});

test('沒有冰反照率回饋時只有一個平衡；時間積分（RK4）收斂到 settle 的結果，時間常數 C/λ 約 2 年', () => {
  const p = P({ co2: 560 });
  assert.strictEqual(K.equilibria(p).length, 1);
  const Te = K.settle(p, 288);
  const tau = K.HEAT / K.sensitivity(p, Te).lambda / K.YEAR;
  near(tau, 1.96, 0.05);
  const T1 = K.run(p, 288, tau);
  near((T1 - 288) / (Te - 288), 1 - Math.exp(-1), 0.01, '一個時間常數後走了 63%');
  near(K.run(p, 288, 40 * tau), Te, 1e-4);
  // 步長收斂
  near(K.run(p, 288, 3, 0.25), K.run(p, 288, 3, 0.01), 1e-5, '步長 0.25 年與 0.01 年一致');
});

test('沒有水氣回饋時，950 ppm 的 CO₂ 就能融化雪球；有水氣回饋時 CO₂ 融不掉（冷的大氣很乾）', () => {
  const T0 = K.settle(P({ ice: true }), 240);
  assert.ok(T0 < 252);
  near(K.run(P({ ice: true, co2: 950 }), T0, 800), K.settle(P({ ice: true, co2: 950 }), 300), 1e-3, '剛過臨界點，融化很慢');
  assert.ok(K.settle(P({ ice: true, co2: 950 }), T0) > 285);
  assert.ok(K.settle(P({ ice: true, co2: 900 }), T0) < 260, '900 ppm 還不夠');
  assert.ok(K.settle(P({ ice: true, wv: true, co2: 2000 }), 200) < 240);
});

console.log(`\n${passed} 項通過${process.exitCode ? '（有失敗）' : ''}`);
