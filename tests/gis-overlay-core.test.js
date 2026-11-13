// 以 Node 執行：node tests/gis-overlay-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/gis-overlay-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
const L = K.layers(), N = K.NX * K.NY;
let seed = 97;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

test('網格：64 × 48 格、每格 250 m，全縣 192 平方公里', () => {
  assert.strictEqual(N, 3072);
  near(N * K.CELL_AREA, 192, 1e-9);
  assert.strictEqual(K.cellAt(0.1, 0.1), 0);
  assert.strictEqual(K.cellAt(15.99, 11.99), N - 1);
  assert.strictEqual(K.cellAt(-0.1, 1), -1);
  const p = K.xyOf(65); near(p[0], 0.375, 1e-12); near(p[1], 0.375, 1e-12);
});

test('坡度：和高程函數的解析梯度（數值微分）一致', () => {
  for (let n = 0; n < 200; n++) {
    const i = 1 + Math.floor(rnd() * (K.NX - 2)), j = 1 + Math.floor(rnd() * (K.NY - 2)), k = j * K.NX + i;
    const x = (i + 0.5) * K.CELL, y = (j + 0.5) * K.CELL, h = K.CELL;
    const gx = (K.elevation(x + h, y) - K.elevation(x - h, y)) / (2 * h * 1000);
    const gy = (K.elevation(x, y + h) - K.elevation(x, y - h)) / (2 * h * 1000);
    near(L.slope[k], 100 * Math.hypot(gx, gy), 1e-9);
  }
  // 平面上的坡度公式：z = a x + b y 時坡度 = 100 √(a² + b²)
  const a = 0.03, b = -0.04;
  near(100 * Math.hypot(a, b), 5, 1e-12);
});

test('淹水深度 = max(0, 河水上漲 − 離河高度)，河水越高淹越多', () => {
  for (let n = 0; n < 200; n++) {
    const k = Math.floor(rnd() * N), st = rnd() * 6;
    near(K.depthAt(L, k, st), Math.max(0, st - L.hand[k]), 1e-12);
  }
  let prev = -1;
  for (let st = 0; st <= 6 + 1e-9; st += 0.5) { const f = K.floodStats(st).area; assert.ok(f >= prev); prev = f; }
  assert.strictEqual(K.floodStats(0).area, 0, '河水不漲就不淹');
  L.hand.forEach(h => assert.ok(h >= -1e-9, '每一格都不比河床低'));
});

test('距離圖層：斷層與道路距離和逐段計算一致；環域隨距離單調', () => {
  for (let n = 0; n < 100; n++) {
    const k = Math.floor(rnd() * N), p = K.xyOf(k);
    let best = Infinity;
    for (let t = 0; t <= 1; t += 1e-4) {
      // 沿折線取點暴力求最短距離
      const seg = K.FAULT, m = Math.min(seg.length - 2, Math.floor(t * (seg.length - 1))), u = t * (seg.length - 1) - m;
      const qx = seg[m][0] + (seg[m + 1][0] - seg[m][0]) * u, qy = seg[m][1] + (seg[m + 1][1] - seg[m][1]) * u;
      best = Math.min(best, Math.hypot(p[0] - qx, p[1] - qy));
    }
    near(L.fault[k], best * 1000, 2);
  }
  const area = v => { let c = 0; for (let k = 0; k < N; k++) if (L.fault[k] < v) c++; return c; };
  assert.ok(area(500) < area(1000) && area(1000) < area(2000));
});

test('住家距離：住宅格是 0，其他格等於到最近住宅格中心的距離', () => {
  const towns = [];
  for (let k = 0; k < N; k++) if (L.land[k] === 1) towns.push(K.xyOf(k));
  assert.ok(towns.length > 50);
  for (let n = 0; n < 100; n++) {
    const k = Math.floor(rnd() * N), p = K.xyOf(k);
    const d = L.land[k] === 1 ? 0 : Math.min.apply(null, towns.map(t => Math.hypot(t[0] - p[0], t[1] - p[1]))) * 1000;
    near(L.town[k], d, 1e-6);
  }
});

test('布林疊合：結果 = 每一條的交集；關掉條件只會變大', () => {
  const c = K.preset('incinerator'), b = K.boolean(c);
  let cnt = 0;
  for (let k = 0; k < N; k++) {
    const ok = K.CRIT.every(q => K.passes(L, k, c, q));
    assert.strictEqual(!!b.mask[k], ok);
    if (ok) cnt++;
  }
  assert.strictEqual(b.cells, cnt); near(b.area, cnt * K.CELL_AREA, 1e-12);
  K.CRIT.forEach(q => {
    const c2 = K.preset('incinerator'); c2[q].on = false;
    assert.ok(K.boolean(c2).cells >= b.cells, q);
  });
  // 全部關掉 → 整個縣都可以
  const c3 = K.preset('school'); K.CRIT.forEach(q => { c3[q].on = false; });
  assert.strictEqual(K.boolean(c3).cells, N);
});

test('連通區塊：格數加總 = 可以蓋的格數；最大一塊 ≤ 全部', () => {
  ['incinerator', 'school', 'solar'].forEach(f => {
    const b = K.boolean(K.preset(f));
    const P = K.patches(b.mask);
    assert.strictEqual(P.sizes.reduce((a, s) => a + s, 0), b.cells);
    assert.strictEqual(P.sizes.length - 1, b.patches);
    assert.ok(b.largest <= b.area + 1e-12);
    // 同一塊裡相鄰的格子編號相同；不同塊之間沒有上下左右相鄰
    for (let k = 0; k < N; k++) {
      if (!b.mask[k]) continue;
      const i = k % K.NX;
      if (i + 1 < K.NX && b.mask[k + 1]) assert.strictEqual(P.id[k], P.id[k + 1]);
      if (k + K.NX < N && b.mask[k + K.NX]) assert.strictEqual(P.id[k], P.id[k + K.NX]);
    }
  });
  // 棋盤格：沒有兩格相連
  const m = new Uint8Array(N);
  for (let k = 0; k < N; k++) m[k] = ((k % K.NX) + Math.floor(k / K.NX)) % 2;
  const P = K.patches(m);
  assert.strictEqual(P.sizes.length - 1, N / 2);
});

test('加權疊合：分數在 0–100；門檻處 0.5 分；權重同乘一個數不改變結果', () => {
  const c = K.preset('school'), w = c.w;
  const A = K.weighted(c, w);
  const w2 = {}; Object.keys(w).forEach(q => { w2[q] = 3 * w[q]; });
  const B2 = K.weighted(c, w2);
  for (let k = 0; k < N; k++) {
    assert.ok(A.score[k] >= 0 && A.score[k] <= 100 + 1e-9);
    near(A.score[k], B2.score[k], 1e-9);
    if (c.land.v.indexOf(L.land[k]) < 0) assert.strictEqual(A.score[k], 0, '土地使用不准就是 0 分');
  }
  // 門檻處 0.5 分
  const fake = { slope: new Float64Array([10]), fault: new Float64Array([1000]), road: new Float64Array([500]), town: new Float64Array([600]), hand: new Float64Array([0]), land: new Uint8Array([2]) };
  near(K.score(fake, 0, { slope: { v: 10 } }, 'slope'), 0.5, 1e-12);
  near(K.score(fake, 0, { fault: { v: 1000 } }, 'fault'), 0.5, 1e-12);
  near(K.score(fake, 0, { road: { v: 500 } }, 'road'), 0.5, 1e-12);
  near(K.score(fake, 0, { town: { v: 600, near: true } }, 'town'), 0.5, 1e-12);
  near(K.score(fake, 0, { stage: 0.5, flood: { v: 0.5 } }, 'flood'), 0.5, 1e-12);
  // 最高分的格子
  let m = -1; for (let k = 0; k < N; k++) m = Math.max(m, A.score[k]);
  near(A.best, m, 1e-12);
});

test('三種設施的預設條件都找得到地，而且答案不一樣', () => {
  const r = {};
  ['incinerator', 'school', 'solar'].forEach(f => { r[f] = K.boolean(K.preset(f)); assert.ok(r[f].sitesBig >= 1, f); });
  // 焚化廠要離住家遠、學校要近：兩者沒有共同的格子
  for (let k = 0; k < N; k++) assert.ok(!(r.incinerator.mask[k] && r.school.mask[k]));
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗' : ''));
