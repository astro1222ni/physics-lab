// 以 Node 執行：node tests/atmosphere-layers-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/atmosphere-layers-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
function rel(a, b, r, msg) { assert.ok(Math.abs(a / b - 1) <= r, (msg || '') + ` 期望 ${b}（相對誤差 ${r}），得到 ${a}`); }

console.log('atmosphere-layers-core');

test('1976 標準大氣表（幾何高度）：0–86 km 的溫度、氣壓、密度和表格一致', () => {
  // [z m, T K, P Pa, ρ kg/m³]：U.S. Standard Atmosphere 1976 表 I
  const tab = [
    [0, 288.150, 101325, 1.2250], [1000, 281.651, 89876, 1.1117], [5000, 255.676, 54048, 0.73643],
    [11000, 216.774, 22700, 0.36480], [20000, 216.650, 5529.3, 0.088910], [32000, 228.490, 889.06, 0.013555],
    [47000, 269.682, 115.86, 1.4967e-3], [51000, 270.650, 70.458, 9.0690e-4], [71000, 216.846, 4.4794, 7.1965e-5],
    [80000, 198.639, 1.0524, 1.8458e-5], [86000, 186.87, 0.37338, 6.958e-6]
  ];
  tab.forEach(function (r) {
    const s = K.at(r[0]);
    near(s.T, r[1], 0.01, 'T@' + r[0]);
    rel(s.P, r[2], 2e-4, 'P@' + r[0]);
    rel(s.rho, r[3], 5e-4, 'ρ@' + r[0]);
  });
});

test('86–120 km：溫度用 1976 公式（186.87、橢圓段、每公里 12 K），氣壓和表格差 1% 以內', () => {
  const tab = [[90000, 186.87, 0.18359], [100000, 195.08, 0.032011], [110000, 240.00, 0.0071042], [120000, 360.00, 0.0025382]];
  tab.forEach(function (r) {
    const s = K.at(r[0]);
    near(s.T, r[1], 0.02, 'T@' + r[0]);
    rel(s.P, r[2], 0.01, 'P@' + r[0]);
  });
  // 溫度在 86 km 連續
  near(K.at(85999).T, K.at(86001).T, 0.01);
});

test('靜力平衡：數值微分 dP/dz = −ρg（各層都成立）', () => {
  [500, 8000, 15000, 25000, 40000, 49000, 60000, 78000, 95000, 115000].forEach(function (z) {
    const a = K.at(z - 5), b = K.at(z + 5), s = K.at(z);
    rel((b.P - a.P) / 10, -s.rho * s.g, 2e-3, 'z=' + z);
  });
});

test('等溫層（11–20 km）：氣壓照 exp(−Δh/H) 下降，H = R*T/(M g0) = 6.341 km（位勢高度）', () => {
  const H = K.RSTAR * 216.65 / (K.M0 * K.G0);
  near(H, 6341.6, 0.5);
  const z1 = 12000, z2 = 18000;
  const r = K.at(z2).P / K.at(z1).P;
  near(r, Math.exp(-(K.geopot(z2) - K.geopot(z1)) / H), 1e-9);
});

test('對流層頂、平流層頂、中氣層頂：分層與溫度遞減率', () => {
  near(K.geomet(11000), 11019.07, 0.05);
  assert.strictEqual(K.at(10000).layer, 0);
  assert.strictEqual(K.at(11100).layer, 1);
  assert.strictEqual(K.at(48000).layer, 2);
  assert.strictEqual(K.at(87000).layer, 3);
  near(K.lapse(5000), 6.5 * (K.R0 / (K.R0 + 5000)) ** 2, 0.005, '對流層每公里冷約 6.5 K');
  near(K.lapse(15000), 0, 1e-6, '等溫層');
  assert.ok(K.lapse(30000) < 0, '平流層往上變暖（逆溫）');
  const c = K.coldest(0, 120000);
  assert.ok(c.z >= 86000 && c.z <= 91000 && c.T < 186.9, '最冷在中氣層頂 86–91 km');
});

test('頭上的空氣：一半在 5.48 km 以下，90% 在 16.1 km 以下，99% 在 31.1 km 以下', () => {
  near(K.heightOfPressure(K.P0 / 2), 5482, 5);
  near(K.heightOfPressure(K.P0 / 10), 16137, 5);
  near(K.heightOfPressure(K.P0 / 100), 31119, 5);
  near(K.heightOfPressure(50000), 5579, 2, '500 hPa');
});

test('測高方程式：整層暖 ΔT，1000–500 hPa 的厚度 = (R*/(M g0)) T̄ ln 2，T̄ 也跟著加 ΔT', () => {
  [-20, 0, 15].forEach(function (dT) {
    const h1 = K.geopot(K.heightOfPressure(100000, dT)), h2 = K.geopot(K.heightOfPressure(50000, dT));
    // 對流層的溫度對位勢高度是線性的：用對數平均溫度
    const T1 = K.T0 + dT - 0.0065 * h1, T2 = K.T0 + dT - 0.0065 * h2;
    const Tbar = (T1 - T2) / Math.log(T1 / T2);
    near(h2 - h1, K.RSTAR * Tbar / (K.M0 * K.G0) * Math.log(2), 0.05, 'ΔT=' + dT);
  });
  assert.ok(K.heightOfPressure(50000, 20) - K.heightOfPressure(50000, 0) > 380, '暖空氣柱比較厚');
});

test('水的沸點：海平面 100 °C、玉山約 87 °C、聖母峰約 70 °C；37 °C 在約 19 km（阿姆斯壯極限）', () => {
  near(K.at(0).boil, 100.0, 0.02);
  near(K.at(3952).boil, 86.85, 0.05);
  near(K.at(8849).boil, 70.3, 0.1);
  near(K.vaporPressure(37), 6262, 15, '37 °C 的飽和蒸氣壓約 6.27 kPa');
  near(K.heightOfPressure(K.vaporPressure(37)), 19210, 30);
  assert.strictEqual(K.boilingPoint(600), null, '低於三相點：沒有液態水');
  near(K.heightOfPressure(K.TRIPLE), 34560, 30);
});

test('聲速 √(γR*T/M)、平均自由徑：海平面 340.3 m/s、6.63×10⁻⁸ m；100 km 約 0.14 m', () => {
  near(K.at(0).c, 340.29, 0.02);
  rel(K.at(0).mfp, 6.6328e-8, 1e-3);
  rel(K.at(100000).mfp, 0.142, 0.02);
  rel(K.at(0).n, 2.5470e25, 1e-3);
});

test('探空氣球：淨浮力不隨高度改變（氣球體積 ∝ T/P，排開的空氣質量不變）', () => {
  const b = K.launch('b600', 1.5, 0);
  const L0 = K.balloonAt(b, 0).freeLift;
  [5000, 15000, 25000].forEach(function (z) { near(K.balloonAt(b, z).freeLift, L0, 1e-9 + L0 * 1e-9, 'z=' + z); });
  // 體積 ∝ T/P
  const v0 = K.balloonAt(b, 0).V, s = K.at(20000);
  rel(K.balloonAt(b, 20000).V, v0 * (K.P0 / s.P) * (s.T / K.T0), 1e-12);
});

test('探空氣球：積分飛行的爆破高度 = 解析值 (Db/D0)³ = (P0/P)(T/T0)；600 g、1.5 m 約 30 km', () => {
  ['b300', 'b600', 'b1200', 'b3000'].forEach(function (t) {
    [1.6, 2.2].forEach(function (D0) {
      const f = K.fly(t, D0, 0, 2);
      if (f.grounded) return;
      assert.ok(f.b.burst, t + ' 會破');
      near(f.b.z, K.burstAltitude(t, D0, 0), 1, t + ' D0=' + D0);
      const s = K.at(f.b.z);
      rel(Math.pow(K.BALLOONS[t].burst / D0, 3), (K.P0 / s.P) * (s.T / K.T0), 1e-5);
    });
  });
  near(K.burstAltitude('b600', 1.5, 0) / 1000, 29.81, 0.02);
  const v = K.balloonAt(K.launch('b600', 1.5, 0), 0).v;
  assert.ok(v > 4.5 && v < 6.5, '上升速率約 5 m/s：' + v);
});

test('探空氣球：浮力不夠就升不起來；熱天放的同一顆氣球破得比較高', () => {
  assert.ok(K.fly('b3000', 1.5, 0).grounded);
  assert.ok(K.burstAltitude('b600', 1.5, 15) > K.burstAltitude('b600', 1.5, -15) + 3000);
});

console.log(passed + ' 個測試通過');
