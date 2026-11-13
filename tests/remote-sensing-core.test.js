// 以 Node 執行：node tests/remote-sensing-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/remote-sensing-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
const N = K.NX * K.NY;
const mean = (f, b) => K.bandMean(f, b);

test('波段：7 個 OLI 波段由短到長、彼此不重疊太多，可見光 4 個、紅外 3 個', () => {
  assert.strictEqual(K.BANDS.length, 7);
  K.BANDS.forEach((b, i) => {
    assert.ok(b.hi > b.lo);
    if (i) assert.ok(b.lo > K.BANDS[i - 1].lo);
  });
  assert.ok(K.BANDS.slice(0, 4).every(b => b.hi <= 700));
  assert.ok(K.BANDS.slice(4).every(b => b.lo >= 750));
  assert.deepStrictEqual(K.COMPOSITES.natural, [4, 3, 2]);
  assert.deepStrictEqual(K.COMPOSITES.cir, [5, 4, 3]);
});

test('光譜：反射率都在 0–1 之間；健康植物有綠峰、紅光吸收、紅邊與近紅外高原', () => {
  const v = K.spectra.vegetation(1, 1), s = K.spectra.soil(0.3, 0.4), w = K.spectra.water(0.3);
  for (let l = 400; l <= 2500; l += 5) [v, s, w, K.urban].forEach(f => { const r = f(l); assert.ok(r >= 0 && r <= 1, l + ' nm：' + r); });
  assert.ok(v(550) > v(480) && v(550) > v(670), '綠峰');
  assert.ok(v(860) > 5 * v(670), '紅邊：近紅外比紅光亮 5 倍以上');
  assert.ok(v(1450) < 0.5 * v(1650) && v(1940) < 0.5 * v(2200), '1450、1940 nm 有水的吸收帶');
  // 枯黃的葉子：紅光變亮、近紅外變暗
  const dry = K.spectra.vegetation(0, 0.2);
  assert.ok(dry(670) > 2 * v(670) && dry(860) < v(860));
  // 水：近紅外幾乎全部吸收；混濁的水在可見光變亮
  assert.ok(w(860) < 0.02 && w(860) < w(560));
  assert.ok(K.spectra.water(1)(600) > K.spectra.water(0)(600));
  // 土壤：越溼越暗
  assert.ok(K.spectra.soil(0.9, 0.4)(1650) < K.spectra.soil(0.1, 0.4)(1650));
});

test('指數：NDVI、NDWI、NDBI 的定義與範圍；各種地表的 NDVI 落在常見範圍', () => {
  const ix = K.indices([0, 0, 0.1, 0.05, 0.45, 0.2, 0.1]);
  near(ix.ndvi, 0.4 / 0.5, 1e-12);
  near(ix.ndwi, (0.1 - 0.45) / 0.55, 1e-12);
  near(ix.ndbi, (0.2 - 0.45) / 0.65, 1e-12);
  assert.strictEqual(K.nd(0, 0), 0);
  const nd = f => { const r = K.BANDS.map((b, i) => mean(f, i)); return K.indices(r); };
  const healthy = nd(K.spectra.vegetation(1, 1)).ndvi, dry = nd(K.spectra.vegetation(0, 0.2)).ndvi;
  const soil = nd(K.spectra.soil(0.3, 0.4)).ndvi, water = nd(K.spectra.water(0)).ndvi, city = nd(K.urban).ndvi;
  assert.ok(healthy > 0.8, '健康植物 ' + healthy);
  assert.ok(dry > 0 && dry < 0.3, '枯黃 ' + dry);
  assert.ok(soil > 0 && soil < 0.3, '土壤 ' + soil);
  assert.ok(water < -0.3, '水 ' + water);
  assert.ok(Math.abs(city) < 0.3, '都市 ' + city);
  assert.ok(nd(K.spectra.water(0)).ndwi > 0.5 && nd(K.spectra.vegetation(1, 1)).ndwi < -0.5);
});

test('波段平均：等於波段內每 5 nm 取樣的平均，快取的值與直接算一致', () => {
  const f = K.spectra.vegetation(0.73, 0.41);
  K.BANDS.forEach((b, i) => {
    let s = 0, n = 0; for (let l = b.lo; l <= b.hi; l += 5) { s += f(l); n++; }
    near(K.bandMean(f, i), s / n, 1e-12);
    near(K.means('v', 0.73, 0.41)[i], s / n, 1e-12);
  });
});

test('稻作物候：兩期稻作；插秧前灌水、生長、成熟轉黃、收割後休耕', () => {
  assert.strictEqual(K.CROPS.length, 2);
  K.CROPS.forEach(c => {
    assert.strictEqual(K.rice(c.plant - 7, 0).stage, 'flood');
    assert.strictEqual(K.rice(c.plant + 5, 0).stage, 'young');
    assert.strictEqual(K.rice(c.plant + 50, 0).stage, 'grow');
    assert.strictEqual(K.rice(c.harvest - 3, 0).stage, 'ripe');
    assert.strictEqual(K.rice(c.harvest + 3, 0).stage, 'fallow');
    // 葉面積指數先增後減不會超過 5.2
    let mx = 0; for (let d = c.plant; d < c.harvest; d++) mx = Math.max(mx, K.rice(d, 0).lai);
    assert.ok(mx > 4.5 && mx <= 5.2);
  });
  // 乾旱讓葉子少、綠度低
  const a = K.rice(110, 0, 0), b = K.rice(110, 0, 0.8);
  assert.ok(b.lai < a.lai && b.vigor < a.vigor);
  // 覆蓋率：比爾定律 1 − e^(−0.55 LAI)
  near(K.coverOf(0), 0, 1e-12); near(K.coverOf(2), 1 - Math.exp(-1.1), 1e-12);
});

test('場景：8 類地表都有；像元組成的比例加起來是 1', () => {
  const cnt = {};
  for (let k = 0; k < N; k++) cnt[K.classAt(k)] = (cnt[K.classAt(k)] || 0) + 1;
  K.CLASS.forEach(c => assert.ok(cnt[c] > 0, c));
  assert.ok(cnt.paddy > N / 3, '以稻田為主');
  [1, 39, 60, 111, 150, 209, 273, 340].forEach(day => [0, 0.5, 1].forEach(dr => {
    for (let k = 0; k < N; k += 37) {
      const p = K.pixel(k, { day, drought: dr, turb: 0.3, haze: 0 }), m = p.mix;
      near(m.veg + m.soil + m.water + m.urban, 1, 1e-9, '第 ' + day + ' 天 ' + p.cls);
      assert.ok([m.veg, m.soil, m.water, m.urban].every(x => x >= -1e-12));
      p.bands.forEach(r => assert.ok(r >= 0 && r < 1));
    }
  }));
});

test('時間：稻田的 NDVI 一年有兩個高峰，最高在第 111 天；灌水時 NDVI 變負、NDWI 變正', () => {
  const S = d => K.scene({ day: d, drought: 0, turb: 0.3, haze: 0 });
  let best = [0, -9];
  for (let d = 1; d <= 365; d++) { const v = S(d).mean.paddy; if (v > best[1]) best = [d, v]; }
  assert.strictEqual(best[0], 111);
  assert.ok(best[1] > 0.75 && best[1] < 0.85);
  assert.ok(S(273).mean.paddy > 0.72, '第二期');
  assert.ok(S(190).mean.paddy < 0.25, '兩期之間休耕');
  assert.ok(S(39).mean.paddy < 0 && S(39).meanW.paddy > 0.2, '灌水');
  // 森林與河不隨稻作改變
  near(S(39).mean.forest, S(111).mean.forest, 1e-9);
  assert.ok(S(111).mean.water < -0.3);
});

test('乾旱與霧霾：都讓 NDVI 降低；霧霾讓短波長變亮最多（瑞利散射 ∝ 1/λ^4 的近似）', () => {
  const o = { day: 111, drought: 0, turb: 0.3, haze: 0 };
  const a = K.scene(o), b = K.scene(Object.assign({}, o, { drought: 0.8 })), c = K.scene(Object.assign({}, o, { haze: 0.1 }));
  assert.ok(b.mean.paddy < a.mean.paddy - 0.3 && b.mean.forest < a.mean.forest);
  assert.ok(c.mean.paddy < a.mean.paddy - 0.05);
  const k = 30 * K.NX + 20, p0 = K.pixel(k, o), p1 = K.pixel(k, Object.assign({}, o, { haze: 0.1 }));
  const add = p1.bands.map((r, i) => r - p0.bands[i]);
  for (let i = 1; i < 7; i++) assert.ok(add[i] < add[i - 1], '波段 ' + (i + 1));
  near(add[0] / add[4], Math.pow(((K.BANDS[4].lo + K.BANDS[4].hi) / 2) / ((K.BANDS[0].lo + K.BANDS[0].hi) / 2), 4), 1e-6);
  // 地表本身（surface）不受霧霾影響
  p0.surface.forEach((r, i) => near(r, p1.surface[i], 1e-12));
});

test('拉伸：上限是第 99 百分位，下限是最暗 1% 的一半', () => {
  const a = new Float32Array(1000); for (let i = 0; i < 1000; i++) a[i] = i / 1000;
  const s = K.stretch(a);
  near(s.hi, 0.99, 1e-6); near(s.lo, 0.005, 1e-6);
  const z = K.stretch(new Float32Array(10));
  assert.ok(z.hi > z.lo);
});

console.log('\n' + passed + ' 項通過');
