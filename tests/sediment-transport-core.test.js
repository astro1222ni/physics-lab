// 以 Node 執行：node tests/sediment-transport-core.test.js
'use strict';
const assert = require('assert');
const S = require('../js/sediment-transport-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
function rel(a, b, r, msg) { assert.ok(Math.abs(a / b - 1) <= r, (msg || '') + ` 期望 ${b}（相對誤差 ${r}），得到 ${a}`); }
const mm = 1e-3;

console.log('sediment-transport-core');

test('水：20 °C 黏度 1.002 mPa·s、4 °C 密度最大約 1000 kg/m³；越熱越不黏（動黏度 0 °C 約 1.79、40 °C 約 0.66 mm²/s）', () => {
  near(S.mu(20) * 1e3, 1.002, 0.003);
  near(S.rhoW(4), 999.97, 0.01);
  assert.ok(S.rhoW(4) > S.rhoW(0) && S.rhoW(4) > S.rhoW(10));
  near(S.nu(0) * 1e6, 1.79, 0.02);
  near(S.nu(40) * 1e6, 0.658, 0.01);
});

test('沉降速度：細粒趨近史托克斯定律（∝ D²），粗粒趨近牛頓阻力（∝ √D），一路隨粒徑增加', () => {
  const nu = S.nu(20), R = 1.65;
  rel(S.settle(0.002 * mm, R, nu, 1), S.stokes(0.002 * mm, R, nu), 1e-3);
  rel(S.settle(0.004 * mm, R, nu, 1) / S.settle(0.002 * mm, R, nu, 1), 4, 2e-3);
  rel(S.settle(2, R, nu, 1), S.newton(2, R, 1), 0.01);
  let prev = 0;
  for (let e = -6; e <= -0.7; e += 0.1) { const w = S.settle(Math.pow(10, e), R, nu, 1); assert.ok(w > prev); prev = w; }
  // 史托克斯只在顆粒雷諾數小時成立：1 mm 的砂已經慢了好幾倍
  const D = 1 * mm, w = S.settle(D, R, nu, 1);
  assert.ok(S.stokes(D, R, nu) / w > 5 && S.reP(D, w, nu) > 50);
});

test('沉降速度的實測值：0.1 mm 石英砂約 0.6–0.8 cm/s、1 mm 約 10–15 cm/s；光滑的球比天然砂粒快', () => {
  const nu = S.nu(20), R = 2650 / S.rhoW(20) - 1;
  const w01 = S.settle(0.1 * mm, R, nu, 1), w1 = S.settle(1 * mm, R, nu, 1);
  assert.ok(w01 > 0.006 && w01 < 0.008, 'w(0.1 mm) ' + w01);
  assert.ok(w1 > 0.10 && w1 < 0.15, 'w(1 mm) ' + w1);
  assert.ok(S.settle(1 * mm, R, nu, 0.4) > w1);
  // 冷水比熱水黏，細粒沉得慢
  assert.ok(S.settle(0.05 * mm, R, S.nu(5), 1) < S.settle(0.05 * mm, R, S.nu(30), 1));
});

test('Shields：D* 大時臨界 Shields 數趨近 0.055；細粒變大；Soulsby–Whitehouse 在 D* = 10 約 0.033', () => {
  near(S.shields(1e4), 0.055, 1e-4);
  near(S.shields(10), 0.0336, 0.001);
  assert.ok(S.shields(0.5) > 0.15);
});

test('平均流速與剪力速度互為反函數；對數流速剖面：水越深同樣的 u* 平均流速越大', () => {
  const nu = S.nu(20);
  for (const D of [0.01 * mm, 0.3 * mm, 20 * mm]) for (const U of [0.05, 0.4, 2.5]) {
    const us = S.shearVel(U, 1, D, nu);
    rel(S.meanU(us, 1, D, nu), U, 1e-9);
  }
  assert.ok(S.meanU(0.05, 3, 1 * mm, nu) > S.meanU(0.05, 1, 1 * mm, nu));
});

test('Hjulström 曲線：起動流速在細砂（0.1–0.3 mm）最小、約 0.3 m/s；黏土因黏聚力反而要約 1.5 m/s；礫石越大越難', () => {
  let best = null;
  for (let e = -3; e <= 2; e += 0.02) { const D = Math.pow(10, e) * mm, Ue = S.grain({ D: D }).Ue; if (!best || Ue < best.Ue) best = { D: D, Ue: Ue }; }
  assert.ok(best.D > 0.1 * mm && best.D < 0.3 * mm, '最小在 ' + best.D / mm + ' mm');
  near(best.Ue, 0.31, 0.04);
  near(S.grain({ D: 0.002 * mm }).Ue, 1.5, 0.3);
  assert.ok(S.grain({ D: 100 * mm }).Ue > 2.5 && S.grain({ D: 10 * mm }).Ue > 1.2);
  // 沒有黏聚力的話，細顆粒反而最好挖（只剩 Shields 的部分）
  const g = S.grain({ D: 0.002 * mm });
  assert.ok(g.tauCoh > 50 * g.tauSh);
  // 固結過的黏土更難侵蝕
  assert.ok(S.grain({ D: 0.002 * mm, consol: 4 }).Ue > 1.8 * g.Ue);
});

test('沉積流速永遠低於起動流速；細粒幾乎要靜水才沉積，粗粒在起動流速的約 2/3 就停', () => {
  for (let e = -3; e <= 2.3; e += 0.1) { const gr = S.grain({ D: Math.pow(10, e) * mm }); assert.ok(gr.Ud < gr.Ue, 'D=' + Math.pow(10, e)); }
  assert.ok(S.grain({ D: 0.005 * mm }).Ud < 0.001);
  const c = S.grain({ D: 20 * mm });
  near(c.Ud / c.Ue, 0.66, 0.05);
});

test('命運：同一個流速，靜止的顆粒留在床上，移動中的卻繼續走（遲滯）；流速夠大時細粒懸浮、粗粒推移', () => {
  const o = { D: 1 * mm }, gr = S.grain(o), U = (gr.Ue + gr.Ud) / 2;
  assert.strictEqual(S.fate(o, U, false).state, 'rest');
  assert.notStrictEqual(S.fate(o, U, true).state, 'deposit');
  assert.strictEqual(S.fate(o, gr.Ud * 0.9, true).state, 'deposit');
  assert.strictEqual(S.fate({ D: 0.02 * mm }, 1, false).state, 'suspend');
  assert.strictEqual(S.fate({ D: 20 * mm }, 2.5, false).state, 'bedload');
  // Rouse 數 = w/(κu*)：懸浮的 < 推移的
  assert.ok(S.fate({ D: 0.02 * mm }, 1, false).rouse < 1 && S.fate({ D: 20 * mm }, 2.5, false).rouse > 2.5);
});

test('重礦物：同樣大小的磁鐵礦、金比石英沉得快、難挖；煤比石英容易被沖走', () => {
  const D = 0.5 * mm;
  const q = S.grain({ D: D }), m = S.grain({ D: D, rhoS: 5180 }), au = S.grain({ D: D, rhoS: 19300 }), c = S.grain({ D: D, rhoS: 1350 });
  assert.ok(au.w > m.w && m.w > q.w && q.w > c.w);
  assert.ok(au.Ue > m.Ue && m.Ue > q.Ue && q.Ue > c.Ue);
});

test('從山到海：流速遞減；大顆的先停、細的走得遠，黏土與粉砂一路帶到海裡；山上流速不夠挖不起來', () => {
  assert.ok(S.riverU(0, 2) === 2 && Math.abs(S.riverU(1, 2) - S.U_SEA) < 1e-12);
  let prev = -1;
  for (const D of [50, 20, 5, 1, 0.5]) { const r = S.riverStop({ D: D * mm }, 2.5); assert.ok(r.picked && r.x > prev, 'D=' + D + ' x=' + r.x); prev = r.x; }
  assert.strictEqual(S.riverStop({ D: 0.005 * mm }, 2.5).x, null);
  assert.strictEqual(S.riverStop({ D: 100 * mm }, 2).picked, false);
  // 停下的位置剛好是流速降到沉積流速的地方
  const r = S.riverStop({ D: 5 * mm }, 2.5);
  rel(S.riverU(r.x, 2.5), r.gr.Ud, 1e-9);
  // 洪水（山上流速變大）把同樣的礫石帶得更遠
  assert.ok(S.riverStop({ D: 20 * mm }, 3).x > S.riverStop({ D: 20 * mm }, 2).x);
});

test('粒徑分級（Wentworth）', () => {
  assert.strictEqual(S.classOf(0.002 * mm).id, 'clay');
  assert.strictEqual(S.classOf(0.03 * mm).id, 'silt');
  assert.strictEqual(S.classOf(0.5 * mm).id, 'sand');
  assert.strictEqual(S.classOf(3 * mm).id, 'granule');
  assert.strictEqual(S.classOf(30 * mm).id, 'pebble');
  assert.strictEqual(S.classOf(100 * mm).id, 'cobble');
  assert.strictEqual(S.classOf(500 * mm).id, 'boulder');
});

console.log(`sediment-transport-core：${passed} 項通過`);
