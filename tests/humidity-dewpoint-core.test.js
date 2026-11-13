// 以 Node 執行：node tests/humidity-dewpoint-core.test.js
'use strict';
const assert = require('assert');
const H = require('../js/humidity-dewpoint-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }

console.log('humidity-dewpoint-core');

test('飽和水氣壓：0 °C 6.11 hPa、20 °C 23.4 hPa、30 °C 42.5 hPa；和 Bolton 公式差不到 0.3 %（−30–35 °C）', () => {
  near(H.esw(0), 6.112, 0.003);
  near(H.esw(20), 23.39, 0.02);
  near(H.esw(30), 42.47, 0.04);
  for (let T = -30; T <= 35; T += 5) { const b = 6.112 * Math.exp(17.67 * T / (T + 243.5)); near(H.esw(T) / b, 1, 0.003, T + ' °C'); }
});

test('冰面：0 °C 時和水面幾乎一樣（三相點），0 °C 以下比水面低（−10 °C：2.60 對 2.86 hPa）', () => {
  near(H.esi(0) / H.esw(0), 1, 0.001);
  near(H.esi(-10), 2.599, 0.005); near(H.esw(-10), 2.865, 0.005);
  for (let T = -30; T < 0; T += 2) assert.ok(H.esi(T) < H.esw(T), T + ' °C');
  // 克勞修斯–克拉伯龍：d ln e_i/dT = Ls/(Rv T²)，Ls ≈ 2.834 MJ/kg
  const T = -10, d = (Math.log(H.esi(T + 0.01)) - Math.log(H.esi(T - 0.01))) / 0.02;
  near(d * H.RV * Math.pow(T + H.TK, 2) / 1e6, 2.834, 0.01);
});

test('露點、霜點是反函數；0 °C 以下霜點比露點高；開始結露（霜）的溫度取比較高的那個', () => {
  for (const e of [1, 3, 6.112, 10, 23.39, 40]) {
    near(H.esw(H.dewPoint(e)), e, 1e-9 * e);
    near(H.esi(H.frostPoint(e)), e, 1e-9 * e);
  }
  near(H.dewPoint(H.esw(20)), 20, 1e-9);
  const e = 2.5; assert.ok(H.frostPoint(e) > H.dewPoint(e));
  assert.strictEqual(H.depositPoint(e), H.frostPoint(e));
  assert.strictEqual(H.depositPoint(20), H.dewPoint(20));
  near(H.dewPoint(H.eFromRH(25, 0.5)), 13.86, 0.03);       // 25 °C、50 %：露點約 13.9 °C
});

test('混合比、比溼、絕對溼度：20 °C 飽和 14.7 g/kg、17.3 g/m³', () => {
  const e = H.esw(20);
  near(H.mixRatio(e, 1013.25), 14.70, 0.02);
  assert.ok(H.specHum(e, 1013.25) < H.mixRatio(e, 1013.25));
  near(H.absHum(20, e), 17.29, 0.03);
  near(H.pressureAt(0), 1013.25, 1e-9); near(H.pressureAt(1500), 845.6, 0.5); near(H.pressureAt(3000), 701.1, 0.5);
});

test('乾溼計公式：20 °C、溼球 15 °C、1013 hPa（通風）→ e = 13.7 hPa、相對溼度 59 %', () => {
  near(H.ePsy(20, 15, 1013.25, 'vent'), 13.70, 0.02);
  near(H.rhPsy(20, 15, 1013.25, 'vent'), 0.586, 0.003);
  // 溫度差 0：飽和
  near(H.rhPsy(25, 25, 1013.25, 'vent'), 1, 1e-12);
  // 同樣的讀數：沒通風（A 較大）算出的溼度較低；高山上（p 小）算出的溼度較高
  assert.ok(H.rhPsy(20, 15, 1013.25, 'still') < H.rhPsy(20, 15, 1013.25, 'vent'));
  assert.ok(H.rhPsy(20, 15, 700, 'vent') > H.rhPsy(20, 15, 1013.25, 'vent'));
});

test('溼球溫度：在露點和氣溫之間；飽和時等於氣溫；和乾溼計公式互為反函數；沒通風時溼球比較不冷', () => {
  for (const T of [0, 10, 25, 35]) for (const f of [0.2, 0.5, 0.9]) for (const type of ['vent', 'still']) {
    const e = H.eFromRH(T, f), tw = H.wetBulb(T, e, 1013.25, type);
    assert.ok(tw <= T && tw >= H.dewPoint(e) - 1e-9, T + ' ' + f + ' ' + type);
    near(H.ePsy(T, tw, 1013.25, type), e, 1e-8);
  }
  near(H.wetBulb(18, H.esw(18), 1013.25, 'vent'), 18, 1e-9);
  const e = H.eFromRH(30, 0.4);
  assert.ok(H.wetBulb(30, e, 1013.25, 'still') > H.wetBulb(30, e, 1013.25, 'vent'));
  near(H.wetBulb(30, e, 1013.25, 'vent'), 20.2, 0.2);    // 30 °C、40 %：溼球約 20 °C
});

test('溼球結冰：乾冷的空氣溼球在 0 °C 以下，用冰面公式，仍然是反函數', () => {
  const e = H.eFromRH(3, 0.3), tw = H.wetBulb(3, e, 1013.25, 'vent');
  assert.ok(tw < 0);
  near(H.ePsy(3, tw, 1013.25, 'vent'), e, 1e-8);
});

test('查表：越乾（溫差越大）溼度越低；同樣溫差，氣溫越高溼度越高；太乾的格子是空的', () => {
  const rows = [0, 10, 20, 30], cols = [0, 1, 2, 4, 8, 12];
  const t = H.table(1013.25, 'vent', rows, cols);
  t.forEach(row => { assert.strictEqual(row[0], 100); for (let j = 1; j < row.length; j++) if (row[j] != null && row[j - 1] != null) assert.ok(row[j] < row[j - 1]); });
  for (let j = 1; j < cols.length; j++) for (let i = 1; i < rows.length; i++) if (t[i][j] != null && t[i - 1][j] != null) assert.ok(t[i][j] > t[i - 1][j]);
  assert.strictEqual(t[0][5], null);
  assert.strictEqual(t[2][1], 91);          // 20 °C、差 1 °C：91 %
});

test('一階反應：過一個 τ 剩 1/e；冷杯子結露的速率在露點變號', () => {
  near(H.relax(20, 10, 5, 5), 10 + 10 / Math.E, 1e-12);
  near(H.relax(20, 10, 0, 5), 20, 1e-12);
  const e = H.eFromRH(25, 0.6), td = H.dewPoint(e);
  assert.ok(H.condenseRate(td - 0.1, e) > 0); assert.ok(H.condenseRate(td + 0.1, e) < 0);
  const e2 = H.eFromRH(5, 0.4), tf = H.frostPoint(e2);
  assert.ok(tf < 0 && H.condenseRate(tf - 0.1, e2) > 0 && H.condenseRate(tf + 0.1, e2) < 0);
});

test('一天的溫度：05:30 最低、14:00 最高，整天連續', () => {
  near(H.dayShape(5.5), -1, 1e-12); near(H.dayShape(14), 1, 1e-12);
  for (let h = 0; h < 24; h += 0.01) { assert.ok(Math.abs(H.dayShape(h + 0.01) - H.dayShape(h)) < 0.01); assert.ok(Math.abs(H.dayShape(h)) <= 1 + 1e-12); }
  near(H.dayShape(0), H.dayShape(24), 1e-12);
});

test('一天的溼度：水氣不變時，氣溫最高相對溼度最低；降到露點就結露，空氣保持飽和；早上回升後露水蒸發', () => {
  const e0 = H.esw(19);                                     // 露點 19 °C；日均溫 22、日較差 8：最低 18 °C
  const s14 = H.dayState(14, 22, 8, e0), s5 = H.dayState(5.5, 22, 8, e0);
  assert.ok(s14.rh < s5.rh);
  near(s14.e, e0, 1e-12);
  const d = H.dayDew(22, 8, e0);
  assert.ok(d.start != null && d.end != null && (d.start > 14 || d.start < 5.5) && d.end > 5.5 && d.end < 14);
  near(H.dayState(d.start, 22, 8, e0).T, d.tp, 1e-6);
  near(H.dayState(d.end, 22, 8, e0).T, d.tp, 1e-6);
  assert.ok(s5.sat && Math.abs(s5.rh - 1) < 1e-9 && s5.dew > 0);
  const s12 = H.dayState(12, 22, 8, e0); assert.ok(!s12.sat); near(s12.e, e0, 1e-12);
  // 太乾：不結露
  assert.strictEqual(H.dayDew(24, 8, H.eFromRH(20, 0.4)).start, null);
  // 0 °C 以下結的是霜，而且在霜點（比露點高）就開始
  const e1 = H.eFromRH(4, 0.7), d1 = H.dayDew(2, 10, e1);
  assert.ok(d1.tp < 0 && Math.abs(d1.tp - H.frostPoint(e1)) < 1e-9 && H.dayState(5.5, 2, 10, e1).frost);
});

test('冷杯子：杯溫照指數趨近冷卻的極限；在露點以下才起霧，冷得越快量得越不準；0 °C 以下結霜在霜點', () => {
  const e = H.eFromRH(25, 0.6), td = H.dewPoint(e);
  const c = H.cupInit(25); H.cupStep(c, 0.5, e, 60);
  near(c.T, 0.5 + 24.5 * Math.exp(-60 / H.CUP_TAU), 1e-6);
  const run = function (bath, ee) { const k = H.cupInit(25); for (let i = 0; i < 2000 && !k.onset; i++) H.cupStep(k, bath, ee, 0.5); return k.onset; };
  const a = run(H.BATH.ice, e), b = run(H.BATH.cold, e), s = run(H.BATH.salt, e);
  assert.ok(a && b && s && a.kind === 'dew' && b.kind === 'dew' && s.kind === 'dew');
  assert.ok(a.T < td && b.T < td);
  assert.ok(Math.abs(b.T - td) < Math.abs(a.T - td) && Math.abs(a.T - td) < Math.abs(s.T - td));
  // 分成很多小步或一大步，結果一樣（固定子步驟）
  const c1 = H.cupInit(25), c2 = H.cupInit(25);
  for (let i = 0; i < 300; i++) H.cupStep(c1, 0.5, e, 0.1);
  H.cupStep(c2, 0.5, e, 30);
  near(c1.T, c2.T, 1e-9); near(c1.M, c2.M, 1e-9);
  // 露點比冷卻的極限低：不會起霧
  assert.ok(!run(H.BATH.cold, H.eFromRH(25, 0.2)));
  // 很乾的空氣：在 0 °C 以下先結霜，杯溫在霜點以下
  const e2 = H.eFromRH(10, 0.3), f = run(H.BATH.salt, e2);
  assert.ok(f.kind === 'frost' && f.T < H.frostPoint(e2) && f.T > H.dewPoint(e2) - 1);
});

console.log(`humidity-dewpoint-core：${passed} 項通過`);
