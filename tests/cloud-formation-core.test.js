// 以 Node 執行：node tests/cloud-formation-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/cloud-formation-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
const TK = K.TK;
const sim = (o) => K.simulate(Object.assign({ T0: 28, RH: 0.7, H: 3000, eff: 1, gamma: 5.5 }, o));

console.log('cloud-formation-core');

test('飽和水氣壓：0 °C 為 611.2 Pa、20 °C 約 2339 Pa、30 °C 約 4247 Pa（Murphy & Koop 2005）', () => {
  near(K.esat(273.15), 611.21, 0.05, '0 °C');
  near(K.esat(293.15), 2339.2, 1.5, '20 °C');
  near(K.esat(303.15), 4246.0, 3, '30 °C');
});

test('飽和水氣壓與 Bolton (1980) 公式在 −30～35 °C 相差不到 0.3%', () => {
  for (let c = -30; c <= 35; c += 5) {
    const b = 611.2 * Math.exp(17.67 * c / (c + 243.5));
    const m = K.esat(c + TK);
    assert.ok(Math.abs(m / b - 1) < 0.003, c + ' °C：' + m + ' vs ' + b);
  }
});

test('克勞修斯－克拉伯龍：d ln e_s / dT 與 L/(R_v T²) 相差不到 2%', () => {
  for (const c of [-20, 0, 15, 30]) {
    const T = c + TK, h = 0.01;
    const d = (Math.log(K.esat(T + h)) - Math.log(K.esat(T - h))) / (2 * h);
    const cc = K.Lv(T) / (K.RV * T * T);
    assert.ok(Math.abs(d / cc - 1) < 0.02, c + ' °C：' + d + ' vs ' + cc);
  }
});

test('露點是飽和水氣壓的反函數；相對溼度 100% 時露點等於氣溫', () => {
  for (const c of [-10, 5, 22.3, 35]) {
    const T = c + TK;
    near(K.dewpoint(K.esat(T)), T, 1e-7, '飽和');
    near(K.dewpoint(0.5 * K.esat(T)) - TK, c - (c > 0 ? 10 : 8), 3.5, '50% 的露點大約低 10 °C');
  }
});

test('標準大氣（地面 15 °C、6.5 K/km）：5 km 為 540.2 hPa、11 km 為 226.3 hPa（U.S. Standard Atmosphere 1976）', () => {
  const env = K.makeEnv(288.15, 6.5, 11000);
  near(K.envP(env, 5000) / 100, 540.19, 0.1, '5 km');
  near(K.envP(env, 11000) / 100, 226.32, 0.1, '11 km');
  near(K.envP(env, 15000) / 100, 120.45, 0.2, '15 km（等溫層）');
});

test('乾絕熱遞減率 g/c_p = 9.75 K/km；與環境同溫的氣塊在地面附近每升高 100 m 降溫 0.975 °C', () => {
  near(K.GAMMA_D * 1000, 9.751, 0.001, 'g/cp');
  // 環境遞減率等於乾絕熱時，氣塊與環境一路同溫，遞減率正好是 g/cp
  const env = K.makeEnv(300, K.GAMMA_D * 1000);
  let s = K.startParcel(300, 0.05);
  s = K.step(env, s, 100, 1);
  near((300 - s.T) * 10, K.GAMMA_D * 1000, 0.002, '100 m');
});

test('未飽和時位溫守恆、混合比不變', () => {
  const r = sim({ T0: 30, RH: 0.3, H: 2000 });
  assert.ok(!r.cloud, '不該成雲');
  const th0 = K.theta(r.start.T, r.start.p);
  r.up.concat(r.down).forEach((s) => {
    near(K.theta(s.T, s.p), th0, 1e-9, 'θ @' + s.z);
    near(s.r, r.start.r, 1e-15, 'r');
  });
  near(r.lee.T, r.start.T, 1e-9, '回到山腳溫度不變');
});

test('飽和絕熱遞減率：15 °C／1000 hPa 約 4.8 K/km、0 °C 約 6.5 K/km、−20 °C／500 hPa 約 7.7 K/km', () => {
  near(K.moistLapse(288.15, 1e5) * 1000, 4.77, 0.05, '15 °C');
  near(K.moistLapse(273.15, 1e5) * 1000, 6.47, 0.05, '0 °C');
  near(K.moistLapse(253.15, 5e4) * 1000, 7.67, 0.05, '−20 °C');
  // 越冷越接近乾絕熱
  assert.ok(K.moistLapse(223.15, 3e4) * 1000 > 9.2, '−50 °C 幾乎是乾絕熱');
});

test('雲中的氣塊：數值積分的遞減率與 AMS 飽和絕熱遞減率一致（換到氣壓座標比較）', () => {
  const r = sim({ T0: 25, RH: 0.95, H: 4000, eff: 1 });
  for (const z of [1000, 2000, 3500]) {
    const a = K.sampleUp(r.up, z - 50), b = K.sampleUp(r.up, z + 50);
    const dTdp = (b.T - a.T) / (b.p - a.p);           // 數值
    const T = (a.T + b.T) / 2, p = (a.p + b.p) / 2;
    const es = K.esat(T), rs = K.rsat(T, p), L = K.Lv(T), q = p / (p - es);
    // 第一定律 c_p dT − R_d T dp/p + L dr_s = 0，r_s = ε e_s/(p − e_s) 不做近似
    const exact = (K.RD * T + L * rs * q) / (p * (K.CPD + L * L * rs * q / (K.RV * T * T)));
    near(dTdp / exact, 1, 0.005, z + ' m（精確式）');
    // AMS Glossary 的公式把 r_s 近似成 ε e_s/p，差 1–2%
    const ams = (K.RD * T + L * rs) / (p * (K.CPD + L * L * rs / (K.RV * T * T)));
    near(dTdp / ams, 1, 0.02, z + ' m（AMS 近似式）');
  }
});

test('相當位溫在雲中上升時守恆（與 Bolton 1980 的 θe 相差不到 1.5 K）', () => {
  const r = sim({ T0: 26, RH: 0.9, H: 4000, eff: 1 });
  const e0 = K.thetaE(r.top.T, r.top.p, r.top.r);
  [r.lcl.z + 10, 1500, 2500, 3500].forEach((z) => {
    const s = K.sampleUp(r.up, z);
    near(K.thetaE(s.T, s.p, s.r), e0, 1.5, z + ' m');
  });
});

test('舉升凝結高度：雲底溫度與 Bolton (1980) 式 (15) 相差不到 0.15 K；高度約為每 1 °C 溫度露點差 125 m', () => {
  for (const [c, rh] of [[30, 0.5], [28, 0.7], [20, 0.9], [10, 0.6], [35, 0.2]]) {
    const T0 = c + TK;
    const env = K.makeEnv(T0, 6.5);
    const L = K.lcl(env, T0, rh);
    const Td = K.dewpoint(rh * K.esat(T0));
    near(L.T, K.boltonTL(T0, Td), 0.15, c + ' °C / ' + rh);
    const espy = 125 * (T0 - Td);
    assert.ok(Math.abs(L.z / espy - 1) < 0.06, 'Espy 估計 ' + espy.toFixed(0) + ' m，得到 ' + L.z.toFixed(0) + ' m');
  }
  near(K.lcl(K.makeEnv(300, 6.5), 300, 1).z, 0, 1e-9, '相對溼度 100%：雲底在地面（霧）');
});

test('水的質量守恆：水氣＋雲滴＋降下的雨 = 起始水氣（每一步）', () => {
  for (const eff of [0, 0.4, 1]) {
    const r = sim({ T0: 30, RH: 0.85, H: 4000, eff: eff });
    r.up.concat(r.down).forEach((s) => near(s.r + s.l + s.rain, r.start.r, 1e-12, 'eff=' + eff + ' z=' + s.z));
    if (eff === 0) near(r.rain, 0, 0, '不降水');
  }
});

test('不降水（可逆）：翻過山後回到原來的溫度與溼度，背風坡的雲底等於迎風坡', () => {
  const r = sim({ T0: 28, RH: 0.7, H: 3500, eff: 0 });
  near(r.lee.T, r.start.T, 0.01, '溫度');
  near(r.lee.RH, r.start.RH, 0.001, '相對溼度');
  near(r.zEvap, r.lcl.z, 2, '背風雲底 ' + r.zEvap + ' vs ' + r.lcl.z);
  near(r.foehn, 0, 0.01, '沒有焚風');
});

test('焚風：凝結水全部降下時，背風山腳溫度 = 山頂的位溫；增溫 ≈ Σ (p0/p)^κ L dr / c_p', () => {
  const r = sim({ T0: 28, RH: 0.7, H: 3000, eff: 1, gamma: 6.5 });
  near(r.lee.T, K.theta(r.top.T, r.top.p), 1e-6, '乾絕熱下沉位溫守恆');
  near(r.lee.r, r.top.r, 1e-15, '背風坡的水氣 = 山頂的飽和混合比');
  assert.ok(r.foehn > 12 && r.foehn < 14, '焚風增溫 ' + r.foehn);
  // 由潛熱估計：逐步累加 (p0/p)^κ L dr / cp
  let est = 0;
  for (let i = 1; i < r.up.length; i++) {
    const a = r.up[i - 1], b = r.up[i];
    const dr = a.r - b.r;
    if (dr > 0) est += Math.pow(K.P0 / b.p, K.KAPPA) * K.Lv(b.T) * dr / K.CPD;
  }
  near(r.foehn, est, 0.05 * est, '潛熱估計 ' + est.toFixed(2));
  // 粗略：增溫約等於 L × 降水 ÷ c_p
  near(r.foehn / (K.Lv(285) * r.rain / K.CPD), 1, 0.08, '簡單估計');
});

test('降水效率越高，焚風越強、背風坡越乾、背風坡的雲底越高', () => {
  let prev = null;
  for (const eff of [0, 0.25, 0.5, 0.75, 1]) {
    const r = sim({ T0: 26, RH: 0.8, H: 3000, eff: eff });
    if (prev) {
      assert.ok(r.foehn > prev.foehn, 'foehn');
      assert.ok(r.lee.RH < prev.lee.RH, 'RH');
      assert.ok(r.zEvap > prev.zEvap - 1e-6, 'zEvap');
    }
    prev = r;
  }
  near(prev.zEvap, 3000, 1e-9, '全部降下：背風坡沒有雲');
});

test('穩定度：Γe < Γs 絕對穩定、Γs < Γe < Γd 條件性不穩定、Γe > Γd 絕對不穩定', () => {
  assert.strictEqual(sim({ gamma: 3 }).stability, 'stable');
  assert.strictEqual(sim({ gamma: 6.5 }).stability, 'conditional');
  assert.strictEqual(sim({ gamma: 10.5 }).stability, 'unstable');
  const u = sim({ gamma: 10.5, H: 0 });
  near(u.lfc, 0, 1e-9, '絕對不穩定：地面就有正浮力');
  const s = sim({ gamma: 3, RH: 0.95, H: 4000 });
  assert.strictEqual(s.lfc, null, '絕對穩定：沒有自由對流高度');
  assert.ok(!s.triggered);
});

test('條件性不穩定：山把氣塊抬過 LFC 才觸發對流；LFC 在雲底之上、EL 在 LFC 之上、CAPE > 0', () => {
  const lo = sim({ T0: 28, RH: 0.7, gamma: 6.5, H: 1500 });
  const hi = sim({ T0: 28, RH: 0.7, gamma: 6.5, H: 2500 });
  assert.ok(lo.lfc > lo.lcl.z && lo.lfc < 2500, 'LFC ' + lo.lfc);
  assert.ok(!lo.triggered, '1500 m 的山不夠高');
  assert.ok(hi.triggered, '2500 m 的山觸發對流');
  assert.ok(hi.el > 10000 && hi.el < 16000, 'EL ' + hi.el);
  assert.ok(hi.cape > 1000 && hi.cape < 3000, 'CAPE ' + hi.cape);
  assert.ok(hi.cin < 0, 'CIN ' + hi.cin);
  near(lo.lfc, hi.lfc, 30, '同樣的空氣，LFC 與山高無關');
});

test('CAPE 與浮力積分一致：EL 處浮力為零、LFC 與 EL 之間氣塊比環境暖', () => {
  const r = sim({ T0: 30, RH: 0.75, gamma: 6.5, H: 3000 });
  const inside = r.free.filter((s) => s.z > r.lfc + 50 && s.z < r.el - 50);
  assert.ok(inside.length > 100);
  inside.forEach((s) => assert.ok(s.T > s.Te, '正浮力 @' + s.z));
  const above = r.free.filter((s) => s.z > r.el + 50 && s.z < r.el + 1000);
  above.forEach((s) => assert.ok(s.T < s.Te, '負浮力 @' + s.z));
});

test('路徑：山腳高度 0、山頂高度 H；u 與高度可以互換', () => {
  near(K.terrain(0.5, 3000), 3000, 1e-9, '山頂');
  near(K.terrain(K.FOOT_W, 3000), 0, 1e-9, '迎風山腳');
  near(K.terrain(0.05, 3000), 0, 0, '平地');
  for (const z of [0, 500, 1234.5, 2999]) {
    near(K.terrain(K.uAtZ(z, 3000, -1), 3000), z, 1e-6, '迎風 ' + z);
    near(K.terrain(K.uAtZ(z, 3000, 1), 3000), z, 1e-6, '背風 ' + z);
  }
  const r = sim({});
  const s = K.stateAtU(r, K.uAtZ(1000, 3000, 1));
  assert.strictEqual(s.branch, 'down');
  near(s.T, K.sampleDown(r.down, 1000).T, 1e-9, '背風坡 1000 m');
});

console.log(`\n${passed} 項通過${process.exitCode ? '（有失敗）' : ''}`);
