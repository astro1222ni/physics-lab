// 以 Node 執行：node tests/blackbody-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/blackbody-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1e-300);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
/** 在 [a, b] 上用黃金分割找 f 的最大值所在 */
function argmax(f, a, b) {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a);
  for (let i = 0; i < 200; i++) { if (f(c) > f(d)) b = d; else a = c; c = b - g * (b - a); d = a + g * (b - a); }
  return (a + b) / 2;
}
/** 在 ln λ 上用辛普森法積分 g(λ) dλ（獨立於核心裡「換成 x 變數」的積分） */
function intLnLam(g, l1, l2, n) {
  n = n || 40000;
  const a = Math.log(l1), b = Math.log(l2), h = (b - a) / n;
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const u = a + i * h, l = Math.exp(u), w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
    s += w * g(l) * l;
  }
  return s * h / 3;
}
const TS = [2.725, 77, 310, 798, 2856, 5772, 9845, 40000];

console.log('黑體輻射核心測試');

// ---------------- 常數 ----------------
test('常數：h、c、k 是 SI 定義值', () => {
  assert.strictEqual(C.H, 6.62607015e-34);
  assert.strictEqual(C.C, 299792458);
  assert.strictEqual(C.KB, 1.380649e-23);
});
test('斯特凡–波茲曼常數 σ = 2π⁵k⁴/(15c²h³) 與 CODATA 2022 一致（10 位有效數字）', () => {
  close(C.SIGMA, C.SIGMA_CODATA, 2e-10);
});
test('峰值方程式：x₅ = 5(1 − e^−x₅)、x₃ = 3(1 − e^−x₃)，數值 4.965114231744276、2.821439372122079', () => {
  close(C.X5, 5 * (1 - Math.exp(-C.X5)), 1e-14);
  close(C.X3, 3 * (1 - Math.exp(-C.X3)), 1e-14);
  close(C.X5, 4.965114231744276, 1e-14);
  close(C.X3, 2.821439372122079, 1e-14);
});
test('維恩位移常數 b = hc/(k x₅) 與頻率形式 b′ = k x₃/h 都和 CODATA 2022 一致', () => {
  close(C.B_WIEN, C.B_CODATA, 2e-10);
  close(C.BNU_WIEN, C.BNU_CODATA, 2e-10);
});

// ---------------- 普朗克定律與峰值 ----------------
test('數值找 B_λ 的最大值：落在 λ = b/T（各溫度，相對誤差 1e-6）', () => {
  TS.forEach(T => {
    const lm = C.lamMax(T), l = argmax(x => C.planck(x, T), lm * 0.5, lm * 2);
    close(l, lm, 1e-6, T + ' K');
  });
});
test('數值找頻率分布 B_ν = (2hν³/c²)/(e^{hν/kT} − 1) 的最大值：落在 ν = b′T，而 c/ν_max ≈ 1.7598 λ_max（不是同一處）', () => {
  [310, 5772].forEach(T => {
    const Bnu = nu => 2 * C.H * nu ** 3 / C.C ** 2 / Math.expm1(C.H * nu / (C.KB * T));
    const nm = C.nuMax(T), n = argmax(Bnu, nm * 0.5, nm * 2);
    close(n, nm, 1e-6, T + ' K');
  });
  close(C.lamOfNuMax(1000) / C.lamMax(1000), C.X5 / C.X3, 1e-12);
  close(C.X5 / C.X3, 1.759781, 1e-6);
});
test('B_λ 與 B_ν 是同一個分布：B_λ = B_ν · c/λ²', () => {
  const T = 3000, lam = 800e-9, nu = C.C / lam;
  const Bnu = 2 * C.H * nu ** 3 / C.C ** 2 / Math.expm1(C.H * nu / (C.KB * T));
  close(C.planck(lam, T), Bnu * C.C / lam ** 2, 1e-12);
});
test('峰值高度 ∝ T⁵：溫度加倍，峰值出射度變成 32 倍；總出射度 ∝ T⁴ 變成 16 倍', () => {
  close(C.peakExitance(2000) / C.peakExitance(1000), 32, 1e-12);
  close(C.totalExitance(2000) / C.totalExitance(1000), 16, 1e-12);
});
test('ln B_λ 與 B_λ 一致；極端情況（2.5 K 的 10 nm、40000 K 的 10 mm）不溢位', () => {
  [[500e-9, 5772], [10e-6, 310], [1e-3, 2.725], [2e-6, 40000]].forEach(([l, T]) => close(Math.exp(C.lnPlanck(l, T)), C.planck(l, T), 1e-12));
  assert.ok(isFinite(C.lnPlanck(10e-9, 2.5)) && C.lnPlanck(10e-9, 2.5) < -1e5);
  assert.strictEqual(C.planck(10e-9, 2.5), 0);
  assert.ok(isFinite(C.lnPlanck(10e-3, 40000)) && C.planck(10e-3, 40000) > 0);
  assert.ok(isFinite(C.log10ExitanceNm(10e-9, 2.5)));
});

// ---------------- 斯特凡–波茲曼（曲線下面積） ----------------
test('∫ M_λ dλ = σT⁴（在 x 上積分，各溫度相對誤差 1e-6）', () => {
  TS.forEach(T => close(C.integrateExitance(T, 0, Infinity), C.totalExitance(T), 1e-6, T + ' K'));
});
test('∫ M_λ dλ = σT⁴（另一種方法：在 ln λ 上直接積分 πB_λ，相對誤差 1e-6）', () => {
  [310, 5772, 40000].forEach(T => {
    const lm = C.lamMax(T);
    close(intLnLam(l => C.exitance(l, T), lm / 60, lm * 1e5), C.totalExitance(T), 1e-6, T + ' K');
  });
});
test('能量密度 u = ∫ (8πf²/c³)·hf/(e^{hf/kT} − 1) df = 4σT⁴/c（模式密度 × 每個模式的平均能量）', () => {
  const T = 1000, fmax = 60 * C.KB * T / C.H, n = 60000, h = fmax / n;
  let s = 0;
  for (let i = 1; i <= n; i++) { const f = i * h; s += (i === n ? 1 : i % 2 ? 4 : 2) * C.energyDensityNu(f, T); }
  close(s * h / 3, 4 * C.SIGMA * T ** 4 / C.C, 1e-6);
});

// ---------------- 波段比例 ----------------
test('波段比例的級數與數值積分一致（x 在 1 的兩邊都測，含接縫處連續）', () => {
  [0.01, 0.3, 0.999, 1, 1.001, 2.5, 4.965, 10, 30].forEach(x => {
    const T = 1000, lam = C.C2 / (x * T);
    const num = C.integrateExitance(T, 0, lam, 200000) / C.totalExitance(T);
    close(C.tailFrac(x), num, 1e-7, 'x = ' + x);
  });
  close(C.tailFrac(1 - 1e-12), C.tailFrac(1 + 1e-12), 1e-10);
});
test('波段比例的極限：x → 0 時 → 1、x → ∞ 時 → 0；峰值以下剛好約 25%', () => {
  close(C.tailFrac(1e-6), 1, 1e-12);
  assert.ok(C.tailFrac(100) < 1e-35);
  close(C.tailFrac(C.X5), 0.25005, 1e-4);
});
test('可見光比例（380–780 nm）：太陽約 46.5%，與 ln λ 數值積分一致；最大值約 49.04%，在約 6913 K', () => {
  const T = 5772, v = C.visFrac(T);
  close(v, intLnLam(l => C.exitance(l, T), 380e-9, 780e-9, 4000) / C.totalExitance(T), 1e-8);
  close(v, 0.4650, 1e-3);
  const o = C.optima();
  close(o.visT, 6913, 1e-3); close(o.visMax, 0.49042, 1e-4);
  assert.ok(C.visFrac(o.visT * 1.02) < o.visMax && C.visFrac(o.visT / 1.02) < o.visMax);
});

// ---------------- 古典與量子的極限 ----------------
test('長波（x → 0）：普朗克 → 瑞利–金斯；短波（x 大）：普朗克 → 維恩近似', () => {
  const T = 5772;
  close(C.ratioRJ(C.C2 / (1e-4 * T), T), 1, 1e-4);
  close(C.ratioWien(C.C2 / (30 * T), T), 1, 1e-12);
  close(C.rayleighJeans(1, T) / C.planck(1, T), 1, 1e-4);
  close(C.wien(100e-9, T) / C.planck(100e-9, T), 1, 1e-10);
});
test('處處都有 維恩 < 普朗克 < 瑞利–金斯；瑞利–金斯 ÷ 普朗克 = (e^x − 1)/x', () => {
  for (let lx = -1; lx <= 2; lx += 0.1) {
    const lam = Math.pow(10, lx) * 1e-6, T = 5772;
    assert.ok(C.wien(lam, T) < C.planck(lam, T) && C.planck(lam, T) < C.rayleighJeans(lam, T), 'λ = ' + lam);
    const x = C.xOf(lam, T);
    if (x < 600) close(C.ratioRJ(lam, T), Math.expm1(x) / x, 1e-12);
  }
});
test('紫外災難：瑞利–金斯的總出射度發散（積分上限越往短波越大，∝ 1/λ³）', () => {
  const T = 5772, a = intLnLam(l => C.exitanceRJ(l, T), 1e-6, 1e-2, 4000), b = intLnLam(l => C.exitanceRJ(l, T), 1e-7, 1e-2, 4000);
  close(b / a, 1000, 1e-3);
});
test('每個模式的平均能量：低頻 → kT（能量均分），高頻被指數壓低；hf = kT 時是 kT/(e − 1)', () => {
  const T = 300, kT = C.KB * T;
  close(C.modePlanck(1e6, T), kT, 1e-6);
  close(C.modePlanck(kT / C.H, T), kT / (Math.E - 1), 1e-12);
  assert.ok(C.modePlanck(20 * kT / C.H, T) < 1e-7 * kT);
  close(C.modeDensity(1e9), 8 * Math.PI * 1e18 / C.C ** 3, 1e-12);
});

// ---------------- 顏色與亮度 ----------------
test('CIE 配色函數：節點等於官方表值（555 nm 的 ȳ = 1、600 nm 的 x̄ = 1.0622）', () => {
  close(C.cmf(555)[1], 1, 1e-12);
  close(C.cmf(600)[0], 1.0622, 1e-12);
  assert.deepStrictEqual(C.cmf(370), [0, 0, 0]);
});
test('黑體色度與 CIE 標準光源 A（2856 K）：x = 0.4476、y = 0.4074（CIE 015:2018，±0.001）', () => {
  const c = C.color(2856);
  close(c.x, 0.44758, 0.002); close(c.y, 0.40745, 0.002);
});
test('普朗克軌跡（色度）：5000 K (0.3451, 0.3516)、6500 K (0.3135, 0.3237)、10000 K (0.2807, 0.2884)，±0.001', () => {
  [[5000, 0.3451, 0.3516], [6500, 0.3135, 0.3237], [10000, 0.2807, 0.2884]].forEach(([T, x, y]) => {
    const c = C.color(T);
    assert.ok(Math.abs(c.x - x) <= 0.001 && Math.abs(c.y - y) <= 0.001, T + ' K：' + c.x.toFixed(4) + ', ' + c.y.toFixed(4));
  });
});
test('最接近 D65 的黑體：約 6504 K、Δuv ≈ 0.0032（D65 的相關色溫與它在軌跡上方的距離）', () => {
  const o = C.optima();
  close(o.whiteT, 6504, 0.003);
  close(o.whiteDuv, 0.0032, 0.03);
});
test('顯示色：低溫偏紅（藍通道 0）、6500 K 近白、高溫偏藍；超出色域時有標示', () => {
  const r = C.color(1000).srgb, w = C.color(6500).srgb, b = C.color(20000).srgb;
  assert.ok(r[0] === 255 && r[2] === 0);
  assert.ok(Math.min.apply(null, w) >= 245);
  assert.ok(b[2] === 255 && b[0] < 200);
  assert.ok(C.color(800).outGamut && !C.color(5000).outGamut);
  C.color(2.725).srgb.concat(C.color(310).srgb).forEach(v => assert.ok(v >= 0 && v <= 255 && isFinite(v)));
});
test('輝度：發光效率 πL/(σT⁴) 最大約 95 lm/W、在約 6600 K；太陽表面約 1.9 × 10⁹ cd/m²；人體幾乎是 0', () => {
  let best = 0, bT = 0;
  for (let T = 4000; T <= 10000; T += 20) { const k = Math.PI * C.color(T).L / C.totalExitance(T); if (k > best) { best = k; bT = T; } }
  close(best, 95.4, 0.01); close(bT, 6630, 0.02);
  close(C.color(5772).L, 1.86e9, 0.05);
  assert.ok(C.color(310).log10L < -15);
  assert.ok(isFinite(C.color(2.5).log10L));
});
test('顏色名稱依溫度：人體「深紅」（但看不見）、鎢絲「橘黃」、5000 K「偏黃的白」、太陽與 6500 K「白」、天狼星「藍白」', () => {
  assert.strictEqual(C.colorName(310).zh, '深紅');
  assert.strictEqual(C.colorName(2856).zh, '橘黃');
  assert.strictEqual(C.colorName(5000).zh, '偏黃的白');
  assert.strictEqual(C.colorName(5772).zh, '白');
  assert.strictEqual(C.colorName(6500).zh, '白');
  assert.strictEqual(C.colorName(9845).zh, '藍白');
});
test('參考物體：溫度在滑桿範圍內，數值與出處一致', () => {
  const m = {}; C.REFS.forEach(r => { m[r.id] = r.T; assert.ok(r.T >= C.T_MIN && r.T <= C.T_MAX); });
  assert.deepStrictEqual(m, { cmb: 2.725, body: 310, draper: 798, lamp: 2856, sun: 5772, sirius: 9845 });
  close(C.lamMax(5772) * 1e9, 502.04, 1e-4);
  close(C.lamMax(2.725) * 1e3, 1.0634, 1e-4);
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗' : ''));
