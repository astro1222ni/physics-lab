// 以 Node 執行：node tests/gas-diffusion-core.test.js
'use strict';
const assert = require('assert');
const G = require('../js/gas-diffusion-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`); }
function rel(a, b, tol, msg) { near(a / b, 1, tol, (msg || '') + `（${a} 對 ${b}）`); }
const R = G.R;

// ---------------- 分子量 ----------------
test('分子量由 IUPAC 標準原子量算出', function () {
  near(G.GAS.NH3.M, 14.007 + 3 * 1.008, 1e-9);
  near(G.GAS.HCl.M, 1.008 + 35.45, 1e-9);
  near(G.GAS.HBr.M, 1.008 + 79.904, 1e-9);
  near(G.GAS.HI.M, 1.008 + 126.90, 1e-9);
  near(G.GAS.HNO3.M, 1.008 + 14.007 + 3 * 15.999, 1e-9);
  near(G.GAS.CH3NH2.M, 12.011 + 14.007 + 5 * 1.008, 1e-9);
  near(G.GAS.O2.M, 2 * 15.999, 1e-9);
  near(G.GAS.CO2.M, 12.011 + 2 * 15.999, 1e-9);
  near(G.GAS.SF6.M, 32.06 + 6 * 18.998, 0.01);
  // 鈾濃縮的分離因子 √(352.04/349.03) = 1.0043
  near(Math.sqrt(G.GAS.UF6b.M / G.GAS.UF6a.M), 1.0043, 0.00005);
  near(Math.sqrt(G.GAS.D2.M / G.GAS.H2.M), Math.SQRT2, 0.001);
});

// ---------------- 分子速率 ----------------
test('平均速率 √(8RT/πM)：N₂ 在 298 K 約 475 m/s、H₂ 約 1770 m/s', function () {
  near(G.meanSpeed(28.014, 298), Math.sqrt(8 * R * 298 / (Math.PI * 0.028014)), 1e-9);
  near(G.meanSpeed(28.014, 298), 475, 1);
  near(G.meanSpeed(2.016, 298), 1769, 2);
});
test('三種特徵速率的比例：v_mp : v̄ : v_rms = √2 : √(8/π) : √3', function () {
  [[4, 250], [36.458, 300], [352, 600]].forEach(function (c) {
    const vp = G.mpSpeed(c[0], c[1]), va = G.meanSpeed(c[0], c[1]), vr = G.rmsSpeed(c[0], c[1]);
    near(va / vp, Math.sqrt(4 / Math.PI), 1e-12); near(vr / vp, Math.sqrt(1.5), 1e-12);
  });
});
test('平均速率 ∝ √(T/M)：同溫兩氣體的比 = √(M_B/M_A)，溫度變 4 倍速率變 2 倍', function () {
  rel(G.meanSpeed(17.031, 298) / G.meanSpeed(36.458, 298), Math.sqrt(36.458 / 17.031), 1e-12);
  rel(G.meanSpeed(32, 600) / G.meanSpeed(32, 150), 2, 1e-12);
});
test('馬克士威分布：歸一、平均值與方均值等於解析式、峰值在 v_mp', function () {
  [[17.031, 298], [127.908, 263], [2.016, 600]].forEach(function (c) {
    const Mg = c[0], Tk = c[1], vmax = 6 * G.mpSpeed(Mg, Tk), n = 20000, h = vmax / n;
    let s0 = 0, s1 = 0, s2 = 0;
    for (let i = 0; i <= n; i++) {
      const v = i * h, w = (i === 0 || i === n) ? 0.5 : 1, f = G.maxwell(v, Mg, Tk) * w * h;
      s0 += f; s1 += f * v; s2 += f * v * v;
    }
    near(s0, 1, 1e-6, '歸一');
    rel(s1, G.meanSpeed(Mg, Tk), 1e-6, '平均速率');
    rel(Math.sqrt(s2), G.rmsSpeed(Mg, Tk), 1e-6, '方均根速率');
    const vp = G.mpSpeed(Mg, Tk);
    assert.ok(G.maxwell(vp, Mg, Tk) > G.maxwell(vp * 0.99, Mg, Tk) && G.maxwell(vp, Mg, Tk) > G.maxwell(vp * 1.01, Mg, Tk), '峰值在 v_mp');
    near(G.maxwellCDF(vmax, Mg, Tk), 1, 1e-7);
    near(G.maxwellCDF(G.meanSpeed(Mg, Tk), Mg, Tk), 0.5331, 0.0002, '平均速率以下的分子約 53.3%');
  });
});
test('誤差函數：erf(0.5) = 0.520500、erfc(1) = 0.157299、erfc(3) = 2.209e-5，ln erfc 大引數也準確', function () {
  near(G.erf(0.5), 0.5204999, 2e-7); near(G.erfc(1), 0.1572992, 2e-7); rel(G.erfc(3), 2.209050e-5, 2e-6);
  near(G.erf(-0.5), -G.erf(0.5), 1e-12); near(G.erfc(0), 1, 1e-6);
  // erfc(z) ≈ e^(−z²)/(z√π)(1 − 1/2z²)：z = 10
  rel(G.lnErfc(10), -100 - Math.log(10 * Math.sqrt(Math.PI)) + Math.log(1 - 1 / 200 + 3 / 40000), 1e-6);
});

// ---------------- 逸散 ----------------
test('逸散：τ = 4V/(A v̄)、壓力指數下降、半衰時間 = τ ln 2', function () {
  const Mg = 28.014, Tk = 298, d = 50, V = 1;
  const A = Math.PI * Math.pow(25e-6, 2);
  rel(G.effTau(Mg, Tk, d, V), 4 * 1e-3 / (A * G.meanSpeed(Mg, Tk)), 1e-12);
  const tau = G.effTau(Mg, Tk, d, V), th = G.effHalf(Mg, Tk, d, V);
  rel(G.effP(5, th, tau), 2.5, 1e-12);
  rel(G.effP(5, 2 * th, tau), 1.25, 1e-12);
});
test('逸散速率守恆：−dN/dt = ¼ n v̄ A，積分等於壓力下降', function () {
  const Mg = 44.009, Tk = 320, d = 80, V = 1, P0 = 2, tau = G.effTau(Mg, Tk, d, V);
  // 從 0 到 τ 逸出的分子數 = ∫ rate dt（數值積分）與 ΔP·V/(kT) 比較
  const n = 4000, h = tau / n;
  let N = 0;
  for (let i = 0; i <= n; i++) N += G.effRate(Mg, Tk, d, G.effP(P0, i * h, tau)) * h * ((i === 0 || i === n) ? 0.5 : 1);
  rel(N, (P0 - G.effP(P0, tau, tau)) * 1e-3 / (G.KB * Tk), 1e-6);
});
test('格雷厄姆逸散定律：同溫時間比 = √(M_B/M_A)，與孔徑、起始壓力無關；O₂ 對 H₂ 約 3.98', function () {
  [[2.016, 31.998], [17.031, 36.458], [349.034, 352.041]].forEach(function (p) {
    [10, 50, 200].forEach(function (d) {
      rel(G.effHalf(p[1], 298, d, 1) / G.effHalf(p[0], 298, d, 1), Math.sqrt(p[1] / p[0]), 1e-12);
    });
  });
  near(G.effHalf(31.998, 298, 50, 1) / G.effHalf(2.016, 298, 50, 1), 3.984, 0.001);
  // 孔徑加倍 → 面積 4 倍 → 時間 1/4
  rel(G.effHalf(32, 298, 100, 1) / G.effHalf(32, 298, 50, 1), 0.25, 1e-12);
});
test('溫度補償：T_B/T_A = M_B/M_A 時兩種氣體逸散一樣快', function () {
  rel(G.effHalf(31.998, 298 * 31.998 / 28.014, 50, 1), G.effHalf(28.014, 298, 50, 1), 1e-12);
});
test('平均自由徑：1 Pa、298 K 約 6.8 mm；本實驗的範圍（0.1–5 Pa、250–600 K、孔徑 ≤ 200 µm）克努森數都 > 5', function () {
  near(G.meanFreePath(298, 1) * 1000, 6.76, 0.05);
  near(G.meanFreePath(298, 101325) * 1e9, 67, 1);
  assert.ok(G.knudsen(250, 5, 200) > 5 && G.knudsen(600, 5, 200) > 5);
});

// ---------------- 擴散係數 ----------------
test('Fuller 式：NH₃–空氣 0.220、HCl–空氣 0.172 cm²/s（25 °C），比值 1.28（課堂實測約 1.27）', function () {
  near(G.fullerD('NH3', 298), 0.2196, 0.0005);
  near(G.fullerD('HCl', 298), 0.1719, 0.0005);
  near(G.fullerD('NH3', 298) / G.fullerD('HCl', 298), 1.277, 0.003);
  // 文獻值（Cussler；Massman 1998）：NH₃–空氣 0.198（0 °C）→ 25 °C 約 0.23；HCl–空氣 122 Torr·cm²/s（296 K）→ 0.161
  rel(G.fullerD('NH3', 273.15), 0.198, 0.06);
  rel(G.fullerD('HCl', 296), 122 / 760, 0.08);
});
test('擴散係數隨溫度 ∝ T^1.75，與壓力成反比', function () {
  rel(G.fullerD('HBr', 340) / G.fullerD('HBr', 270), Math.pow(340 / 270, 1.75), 1e-12);
  rel(G.diffD('HI', 340, 'graham') / G.diffD('HI', 270, 'graham'), Math.pow(340 / 270, 1.75), 1e-12);
  rel(G.fullerD('NH3', 298, 2 * 1.01325), G.fullerD('NH3', 298) / 2, 1e-12);
});
test('格雷厄姆模型：D ∝ 1/√M，NH₃ 與 Fuller 值相同', function () {
  near(G.diffD('NH3', 298, 'graham'), G.fullerD('NH3', 298), 1e-12);
  rel(G.diffD('NH3', 298, 'graham') / G.diffD('HCl', 298, 'graham'), Math.sqrt(36.458 / 17.031), 1e-12);
});

// ---------------- 白煙環 ----------------
const BASE = { base: 'NH3', acid: 'HCl', model: 'graham', L: 100, T: 298 };
function rg(o) { return G.ring(Object.assign({}, BASE, o)); }
test('理想（格雷厄姆）：NH₃／HCl 的白煙環在距 NH₃ 端 59.4% 處，距離比 1.46', function () {
  const r = rg({});
  near(r.frac, Math.sqrt(36.458) / (Math.sqrt(36.458) + Math.sqrt(17.031)), 1e-12);
  near(r.frac, 0.594, 0.001);
  near(r.x / (r.frac === 1 ? 1 : (100 - r.x)), 1.463, 0.001);
  near(r.frac, G.grahamFrac('NH3', 'HCl'), 1e-12);
});
test('空氣中擴散：NH₃／HCl 的環在 56.1% 處，比格雷厄姆的預測更靠近中央', function () {
  const r = rg({ model: 'air' });
  near(r.frac, 0.561, 0.001);
  assert.ok(r.frac < rg({}).frac);
});
test('相遇點滿足 x/D_A = (L − x)/D_B，且在該點濃度乘積正好等於門檻', function () {
  ['graham', 'air'].forEach(function (m) {
    G.BASES.forEach(function (b) {
      G.ACIDS.forEach(function (a) {
        const r = rg({ base: b, acid: a, model: m, L: 73, T: 281 });
        near(r.x / r.DA, (73 - r.x) / r.DB, 1e-9);
        const p = G.conc(r.x, r.t, r.DA, true, 73) * G.conc(r.x, r.t, r.DB, false, 73);
        rel(p, G.THETA, 1e-6);
      });
    });
  });
});
test('門檻很小時，濃度乘積最先超過門檻的位置趨近相遇點（數值掃描驗證）', function () {
  // 在出現時刻之前一點點，乘積的最大值落在相遇點附近，且小於門檻
  const r = rg({ model: 'air' }), L = 100;
  let best = -Infinity, xb = 0;
  for (let i = 1; i < 2000; i++) {
    const x = i * L / 2000, lp = G.lnErfc(x / (2 * Math.sqrt(r.DA * r.t))) + G.lnErfc((L - x) / (2 * Math.sqrt(r.DB * r.t)));
    if (lp > best) { best = lp; xb = x; }
  }
  near(xb / L, r.frac, 0.02);
});
test('位置與溫度、管長無關；出現時間 ∝ L²、∝ T^(−1.75)', function () {
  const a = rg({}), b = rg({ T: 343 }), c = rg({ L: 50 }), d = rg({ L: 150, T: 263 });
  near(b.frac, a.frac, 1e-12); near(c.frac, a.frac, 1e-12); near(d.frac, a.frac, 1e-12);
  rel(c.t / a.t, 0.25, 1e-6);
  rel(b.t / a.t, Math.pow(298 / 343, 1.75), 1e-6);
  rel(d.t / a.t, 2.25 * Math.pow(298 / 263, 1.75), 1e-6);
});
test('出現時間的校準：1 m、NH₃／HCl、25 °C 在 15–20 分鐘之間', function () {
  const t = rg({ model: 'air' }).t / 60;
  assert.ok(t > 15 && t < 20, '空氣模型 ' + t.toFixed(1) + ' 分鐘');
  const t2 = rg({}).t / 60;
  assert.ok(t2 > 15 && t2 < 20, '格雷厄姆模型 ' + t2.toFixed(1) + ' 分鐘');
});
test('較重的酸環更靠近酸端；兩端同種氣體時在正中央', function () {
  let prev = 0;
  ['HCl', 'HNO3', 'HBr', 'HI'].forEach(function (a) { const f = rg({ acid: a }).frac; assert.ok(f > prev, a); prev = f; });
  G.setUnknown('HX', 17.031);
  near(rg({ acid: 'HX' }).frac, 0.5, 1e-12);
});
test('反直覺：空氣中甲胺比 HCl 輕，白煙環卻偏向甲胺端（甲胺分子體積較大）', function () {
  assert.ok(G.GAS.CH3NH2.M < G.GAS.HCl.M);
  assert.ok(rg({ base: 'CH3NH2', model: 'air' }).frac < 0.5);
  assert.ok(rg({ base: 'CH3NH2', model: 'graham' }).frac > 0.5);
});
test('未知酸：由環的位置用格雷厄姆定律反推分子量', function () {
  [45, 80, 150].forEach(function (m) {
    G.setUnknown('HX', m);
    const r = rg({ acid: 'HX' }), q = r.frac / (1 - r.frac);
    rel(17.031 * q * q, m, 1e-9);
  });
});
test('濃度剖面：兩端為 1、隨時間向內擴展；沉積量在環出現前為 0', function () {
  const r = rg({});
  near(G.conc(0, 100, r.DA, true, 100), 1, 1e-12); near(G.conc(100, 100, r.DB, false, 100), 1, 1e-12);
  assert.ok(G.conc(30, 2 * r.t, r.DA, true, 100) > G.conc(30, r.t, r.DA, true, 100));
  near(G.conc(50, 0, r.DA, true, 100), 0, 0);
  near(G.deposit(r.x, r.t * 0.99, r, 100), 0, 0);
  assert.ok(G.deposit(r.x, r.t * 1.5, r, 100) > G.deposit(r.x + 10, r.t * 1.5, r, 100));
});
test('未知氣體的分子量在設定範圍內', function () {
  let s = 7; const rnd = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let k = 0; k < 200; k++) {
    const x = G.newUnknown('X', rnd), h = G.newUnknown('HX', rnd);
    assert.ok(x >= 20 && x <= 150 && h >= 45 && h <= 160);
  }
});

console.log(process.exitCode ? '有測試失敗' : '全部通過（' + passed + ' 項）');
