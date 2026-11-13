// 以 Node 執行：node tests/gravity-model-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/gravity-model-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
const C = id => K.CITIES.find(c => c.id === id);
const ix = id => K.CITIES.findIndex(c => c.id === id);

test('資料：19 個縣市都在本島輪廓內，人口合計約 2,300 萬（外島約 26 萬未列入）', () => {
  assert.strictEqual(K.CITIES.length, 19);
  K.CITIES.forEach(c => assert.ok(K.inside(c), c.zh));
  K.HSR.forEach(s => assert.ok(K.inside(s), s.id));
  const sum = K.CITIES.reduce((a, c) => a + c.pop, 0);
  assert.ok(sum > 2280 && sum < 2330, '合計 ' + sum + ' 萬');
  assert.ok(!K.inside({ lon: 119.6, lat: 23.6 }), '澎湖不在本島');
});

test('距離：半正矢公式；赤道上 1° 經度約 111.2 km；臺北到高雄約 300 km', () => {
  near(K.haversine({ lon: 0, lat: 0 }, { lon: 1, lat: 0 }), Math.PI * K.R_EARTH / 180, 1e-9);
  near(K.haversine({ lon: 0, lat: 0 }, { lon: 180, lat: 0 }), Math.PI * K.R_EARTH, 1e-6);
  near(K.haversine(C('tpe'), C('khh')), 297, 3);
  near(K.haversine(C('tpe'), C('khh')), K.haversine(C('khh'), C('tpe')), 1e-12);
  // 平面投影在臺灣範圍內誤差小於 1%
  const a = K.toXY(C('tpe')), b = K.toXY(C('khh'));
  near(Math.hypot(a[0] - b[0], a[1] - b[1]) / K.haversine(C('tpe'), C('khh')), 1, 0.01);
  const p = K.fromXY(a[0], a[1]); near(p.lon, C('tpe').lon, 1e-12); near(p.lat, C('tpe').lat, 1e-12);
});

test('交通時間：開車 = 直線 × 1.3 ÷ 60 km/h；高鐵只會更快；同一站附近不坐高鐵', () => {
  near(K.carMin(60), 78, 1e-9);
  K.CITIES.forEach(a => K.CITIES.forEach(b => { if (a !== b) assert.ok(K.dist(a, b, 'hsr') <= K.dist(a, b, 'car') + 1e-9); }));
  const t = K.dist(C('tpe'), C('khh'), 'hsr');
  assert.ok(t > 100 && t < 160, '臺北到高雄 ' + t);
  near(K.dist(C('hua'), C('ttt'), 'hsr'), K.dist(C('hua'), C('ttt'), 'car'), 1e-9, '東部沒有高鐵');
  near(K.dist(C('hsc'), C('hsz'), 'hsr'), K.dist(C('hsc'), C('hsz'), 'car'), 1e-9, '最近的是同一站');
});

test('重力模型：T 和人口乘積成正比、和距離的 b 次方成反比；占比加總為 1', () => {
  near(K.interaction(100, 200, 10, 2), 200, 1e-9);
  near(K.interaction(100, 200, 20, 2) / K.interaction(100, 200, 10, 2), 1 / 4, 1e-12, '距離加倍變 1/4');
  near(K.interaction(100, 200, 20, 3) / K.interaction(100, 200, 10, 3), 1 / 8, 1e-12);
  near(K.interaction(200, 200, 10, 2) / K.interaction(100, 200, 10, 2), 2, 1e-12);
  [0.5, 1, 2, 3].forEach(b => ['km', 'hsr'].forEach(m => {
    const f = K.flowsFrom(K.CITIES, ix('txg'), b, m);
    assert.strictEqual(f.length, 18);
    near(f.reduce((a, o) => a + o.share, 0), 1, 1e-12);
    for (let i = 1; i < f.length; i++) assert.ok(f[i].T <= f[i - 1].T);
  }));
  // 距離全部乘上同一個倍數，占比不變（所以開車時間和直線距離的占比一樣）
  const a = K.flowsFrom(K.CITIES, ix('tpe'), 1.7, 'km'), b = K.flowsFrom(K.CITIES, ix('tpe'), 1.7, 'car');
  a.forEach((o, i) => { assert.strictEqual(o.j, b[i].j); near(o.share, b[i].share, 1e-12); });
});

test('距離衰減：對數擬合的斜率就是 −b', () => {
  [0.5, 1.3, 2, 2.8].forEach(b => near(K.fitB(K.allPairs(K.CITIES, b, 'km'), K.CITIES), b, 1e-9));
  assert.strictEqual(K.allPairs(K.CITIES, 2, 'km').length, 19 * 18 / 2);
});

test('雷利法則：分界點兩邊引力相等；人口相同在正中間；大城的範圍比較遠', () => {
  [[249, 285], [285, 48], [45, 45], [405, 21]].forEach(([pa, pb]) => [0.5, 1, 2, 3].forEach(b => {
    const f = K.breakFrac(pa, pb, b), d = 100, x = f * d;
    near(pa / Math.pow(x, b), pb / Math.pow(d - x, b), 1e-9 * pa / Math.pow(x, b));
  }));
  near(K.breakFrac(45, 45, 0.7), 0.5, 1e-12);
  near(K.breakFrac(400, 100, 2), 2 / 3, 1e-12, '人口 4 倍、b = 2：離大城 2/3');
  assert.ok(K.breakFrac(285, 48, 1) > K.breakFrac(285, 48, 3), 'b 越大，大城的優勢越小');
});

test('勢力範圍：每一格歸給引力最大的城市；面積加總等於島的面積（約 3.6 萬 km^2）', () => {
  const A = K.areas(K.CITIES, 2, 'km', 3), sum = A.area.reduce((a, b) => a + b, 0);
  near(sum, A.grid.cells.length * 9, 1e-9);
  assert.ok(sum > 34000 && sum < 38000, '面積 ' + sum);
  for (let q = 0; q < A.grid.cells.length; q += 97) {
    const p = A.grid.cells[q].p, d = K.dominant(K.CITIES, p, 2, 'km');
    assert.strictEqual(A.k[q], d.k);
    assert.ok(A.ratio[q] >= 1);
  }
  // 城市所在的格子屬於自己（新北與臺北、新竹縣與新竹市太近除外）
  K.CITIES.forEach((c, i) => { if (['tpe', 'hsc'].indexOf(c.id) < 0) assert.strictEqual(K.dominant(K.CITIES, c, 2, 'km').k, i, c.zh); });
  // b 越大，小城的範圍越大
  assert.ok(K.areas(K.CITIES, 3, 'km', 3).area[ix('ttt')] > K.areas(K.CITIES, 1, 'km', 3).area[ix('ttt')]);
  // 交通時間的勢力範圍：和直線距離用同一套格子計算，一致
  const H = K.areas(K.CITIES, 1.5, 'hsr', 3);
  for (let q = 0; q < H.grid.cells.length; q += 131) assert.strictEqual(H.k[q], K.dominant(K.CITIES, H.grid.cells[q].p, 1.5, 'hsr').k);
});

test('新市鎮：加在清單最後；摘要的占比、分界點、新市鎮資訊彼此一致', () => {
  const L = K.withTown({ lon: 121, lat: 23.5, pop: 30 });
  assert.strictEqual(L.length, 20); assert.strictEqual(L[19].id, 'new');
  const m = K.summary({ view: 'flows', mode: 'km', b: 2, from: 'txg', to: 'tnn', town: { lon: 121, lat: 23.5 }, pop: 30 }, null);
  near(Object.keys(m.shares).reduce((a, k) => a + m.shares[k], 0), 1, 1e-12);
  assert.strictEqual(m.order.length, 19);
  near(m.pair.frac, K.breakFrac(285, 185, 2), 1e-12);
  near(m.town.pf, K.pull(C('txg'), L[19], 2, 'km'), 1e-12);
  assert.ok(m.town.top3 >= 1 && m.town.off > 0);
  const m0 = K.summary({ view: 'flows', mode: 'km', b: 2, from: 'txg', to: 'tpe', town: null, pop: 50 }, null);
  assert.strictEqual(m0.town, null); assert.strictEqual(m0.order[0], 'chw');
});

console.log('\n' + passed + ' 項通過');
