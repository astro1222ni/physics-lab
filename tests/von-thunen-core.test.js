// 以 Node 執行：node tests/von-thunen-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/von-thunen-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const crops = o => { const c = K.defaults(); Object.keys(o || {}).forEach(id => Object.assign(c[id], o[id])); return c; };
const NO = { on: false, k: 1 };
function randomCrops() {
  const c = K.defaults();
  K.IDS.forEach(id => Object.assign(c[id], { Y: 0.1 + rnd() * 30, p: rnd() * 2000, c: rnd() * 1500, f: 0.5 + rnd() * 30, on: rnd() > 0.1 }));
  return c;
}

test('杜能的設定：四個圈的邊界等於兩條地租線的交點（解析解）', () => {
  const g = K.rings(K.defaults(), 1);
  assert.deepStrictEqual(g.rings.map(s => s.id), ['veg', 'wood', 'grain', 'live']);
  near(g.rings[0].to, 12.5, 1e-12); near(g.rings[1].to, 19, 1e-12); near(g.rings[2].to, 134 / 3, 1e-12); near(g.frontier, 90, 1e-12);
  // 交界處兩種作物的地租相同；最外緣地租為 0
  const c = K.defaults();
  g.rings.forEach((s, i) => {
    if (i < g.rings.length - 1) near(K.rent(c[s.id], s.to, 1), K.rent(c[g.rings[i + 1].id], s.to, 1), 1e-9, s.id);
    else near(K.rent(c[s.id], s.to, 1), 0, 1e-9);
  });
});

test('地租線：R = Y(p − c) − Y f m d，城市的地租 A、每公里少 B', () => {
  const c = { Y: 4, p: 500, c: 220, f: 5 };
  assert.strictEqual(K.A(c), 1120); assert.strictEqual(K.B(c, 1), 20); assert.strictEqual(K.B(c, 0.5), 10);
  near(K.rent(c, 10, 1), 920, 1e-12); near(K.rent(c, 56, 1), 0, 1e-12);
});

test('上包絡：隨機的作物組合，每一個距離種的都是地租最高的（和逐點比較一致）', () => {
  for (let n = 0; n < 300; n++) {
    const c = randomCrops(), m = 0.25 + rnd() * 1.75, g = K.rings(c, m);
    const top = g.frontier > 0 ? g.frontier * 1.3 : 50;
    for (let k = 0; k <= 200; k++) {
      const d = top * k / 200;
      let best = null, br = 0;
      K.IDS.forEach(id => { if (c[id].on === false) return; const r = K.rent(c[id], d, m); if (r > br) { br = r; best = id; } });
      const s = g.rings.find(s => d >= s.from - 1e-9 && d <= s.to + 1e-9);
      if (!best) { assert.ok(!s || Math.abs(d - s.to) < 1e-6, '應該是荒野 d=' + d); continue; }
      assert.ok(s, '應該有作物 d=' + d);
      // 邊界上兩種一樣高，任一種都可以
      near(K.rent(c[s.id], d, m), br, 1e-6, 'd=' + d);
    }
  }
});

test('圈的順序：由內而外坡度（Y f）越來越緩、城市的地租越來越低；每種作物最多一個圈', () => {
  for (let n = 0; n < 500; n++) {
    const c = randomCrops(), g = K.rings(c, 1);
    const ids = g.rings.map(s => s.id);
    assert.strictEqual(new Set(ids).size, ids.length);
    for (let i = 1; i < g.rings.length; i++) {
      assert.ok(K.B(c[ids[i]], 1) < K.B(c[ids[i - 1]], 1), '坡度');
      assert.ok(K.A(c[ids[i]]) <= K.A(c[ids[i - 1]]) + 1e-9, '城市的地租');
      near(g.rings[i].from, g.rings[i - 1].to, 1e-12, '圈要接在一起');
    }
  }
});

test('價格低於成本的作物哪裡都不會出現；全部虧本時整片是荒野', () => {
  assert.ok(!K.rings(crops({ grain: { p: 210 } }), 1).rings.some(s => s.id === 'grain'));
  const g = K.rings(crops({ veg: { p: 100 }, wood: { p: 100 }, grain: { p: 100 }, live: { p: 100 } }), 1);
  assert.strictEqual(g.rings.length, 0); assert.strictEqual(g.frontier, 0);
  assert.strictEqual(K.rings(crops({ veg: { on: false }, wood: { on: false }, grain: { on: false }, live: { on: false } }), 1).frontier, 0);
});

test('運費全部乘上 m：每一條邊界都變成 1/m 倍，全區總地租變成 1/m² 倍', () => {
  const c = K.defaults(), g1 = K.totals(c, 1, NO);
  [0.25, 0.5, 0.71, 1.5, 2].forEach(m => {
    const g = K.totals(c, m, NO);
    g.rings.forEach((s, i) => near(s.to, g1.rings[i].to / m, 1e-9));
    near(g.totalRent / g1.totalRent, 1 / (m * m), 1e-9, 'm=' + m);
  });
  near(K.TOTAL0, g1.totalRent, 1e-6);
});

test('河流：最省運輸距離等於逐點找最好上岸點的結果；上岸角滿足 cos θ = k', () => {
  for (let n = 0; n < 400; n++) {
    const k = 0.05 + rnd() * 0.94, x = (rnd() * 2 - 1) * 200, y = (rnd() * 2 - 1) * 120;
    const rt = K.route(x, y, { on: true, k });
    // 數值最小化：上岸點 s 在 0…x 之間，成本 k|s| + √((x − s)² + y²) 是凸函數，用三分搜尋
    const g = s => k * Math.abs(s) + Math.hypot(x - s, y);
    let lo = Math.min(0, x), hi = Math.max(0, x);
    for (let i = 0; i < 200; i++) { const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3; if (g(a) < g(b)) hi = b; else lo = a; }
    const bs = (lo + hi) / 2, best = Math.min(g(bs), Math.hypot(x, y));
    near(rt.D, best, 1e-9, `x=${x.toFixed(1)} y=${y.toFixed(1)} k=${k.toFixed(3)}`);
    assert.ok(rt.D <= Math.hypot(x, y) + 1e-12, '有河不會比較貴');
    if (rt.usesRiver) {
      near(Math.cos(rt.angle * Math.PI / 180), k, 1e-12);
      near(rt.land + k * rt.water, rt.D, 1e-9);
      near(rt.landing, bs, 1e-3, '上岸點（最小值附近很平，數值解只準到這裡）');
    }
  }
  // 沒有河、或河運不比陸運便宜：就是直線距離
  near(K.costDist(30, 40, null), 50, 1e-12);
  near(K.costDist(30, 40, { on: true, k: 1 }), 50, 1e-12);
  near(K.costDist(30, 40, { on: false, k: 0.2 }), 50, 1e-12);
  // 河邊的地：沿河距離乘 k
  near(K.costDist(-100, 0, { on: true, k: 0.25 }), 25, 1e-12);
});

test('等距線：梭形上每一點的運輸距離都一樣；沿河的尖端在 r/k', () => {
  [0.1, 0.3, 0.6, 0.95, 1].forEach(k => {
    const rv = { on: true, k }, pts = K.levelPath(40, rv, 200);
    pts.forEach(q => near(K.costDist(q[0], q[1], rv), 40, 1e-9, 'k=' + k));
    const xmax = Math.max.apply(null, pts.map(q => q[0]));
    near(xmax, k < 1 ? 40 / k : 40, 1e-9);
  });
});

test('面積：沒有河時是圓（π r²）；有河時是 π S(k) r²，和格點數值積分一致', () => {
  near(K.areaWithin(10, NO), Math.PI * 100, 1e-9);
  near(K.areaFactor({ on: true, k: 1 }), 1, 1e-12);
  [0.2, 0.34, 0.5, 0.8].forEach(k => {
    const rv = { on: true, k }, r = 20, X = r / k, n = 1200;
    let cnt = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n / 2; j++) {
      const x = -X + 2 * X * (i + 0.5) / n, y = -r + 2 * r * (j + 0.5) / (n / 2);
      if (K.costDist(x, y, rv) <= r) cnt++;
    }
    const num = cnt / (n * n / 2) * (2 * X) * (2 * r);
    near(num / K.areaWithin(r, rv), 1, 0.004, 'k=' + k);
  });
  // k 越小農地越大；k → 0 時 S ≈ 2/(πk)
  let prev = Infinity;
  for (let k = 0.05; k <= 1; k += 0.05) { const s = K.areaFactor({ on: true, k }); assert.ok(s < prev); prev = s; }
  near(K.areaFactor({ on: true, k: 0.001 }) * Math.PI * 0.001 / 2, 1, 0.002);
});

test('全區總地租：和逐格加總（地租 × 面積）一致，有河、沒有河都對', () => {
  [[NO, 1], [{ on: true, k: 0.4 }, 1], [{ on: true, k: 0.25 }, 0.7]].forEach(([rv, m]) => {
    const c = K.defaults(), t = K.totals(c, m, rv);
    const X = t.frontier / (rv.on ? rv.k : 1) * 1.01, Yr = t.frontier * 1.01, nx = 1400, ny = 700;
    let sum = 0;
    const dA = (2 * X / nx) * (2 * Yr / ny) * 100; // 平方公里 → 公頃
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const x = -X + 2 * X * (i + 0.5) / nx, y = -Yr + 2 * Yr * (j + 0.5) / ny;
      sum += K.bestAt(c, K.costDist(x, y, rv), m).rent * dA;
    }
    near(sum / t.totalRent, 1, 0.004, JSON.stringify(rv));
    // 各圈面積加起來是農地面積
    near(Object.values(t.areas).reduce((a, b) => a + b, 0), t.farm, 1e-6);
  });
});

test('摘要：三條地租線交在同一點時偵測得到，中間那種作物的圈消失', () => {
  // 穀物產量 Y：讓穀物的地租線通過蔬菜與林木的交點 (12.5 km, 1000 元)
  const Y = 1000 / (280 - 5 * 12.5);
  const d = K.summary({ crops: crops({ grain: { Y } }), m: 1, river: NO, probe: null });
  assert.ok(d.tie3 && d.tie3.spread < 1e-9, '三線交於一點');
  near(d.tie3.d, 12.5, 1e-9);
  assert.ok(!d.present.wood, '林木被擠掉');
  const d0 = K.summary({ crops: K.defaults(), m: 1, river: NO, probe: { x: 0, y: 30 } });
  assert.ok(!d0.tie3 || d0.tie3.spread > 0.3, '杜能的設定沒有三線交點');
  near(K.IDS.reduce((a, id) => a + d0.share[id], 0), 1, 1e-12);
  assert.strictEqual(d0.probe.id, 'grain'); near(d0.probe.rent, 1120 - 20 * 30, 1e-9);
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗' : ''));
