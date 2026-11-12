// 以 Node 執行：node tests/contour-map-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/contour-map-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
const DEG = Math.PI / 180;
const TS = {};
K.PRESETS.forEach(id => { TS[id] = K.make(id); });

/** 測試用的解析地形：平面、圓錐、球帽，用來和解析解比較 */
function fake(fn) {
  const T = { id: 'test', h: fn, N: K.N, CELL: K.CELL };
  const g = new Float32Array(K.N * K.N);
  let max = -Infinity;
  for (let j = 0; j < K.N; j++) for (let i = 0; i < K.N; i++) { const v = fn(i * K.CELL, j * K.CELL); g[j * K.N + i] = v; if (v > max) max = v; }
  T.grid = g; T.max = max; T.landCells = 0;
  for (let k = 0; k < g.length; k++) if (g[k] > 0) T.landCells++;
  return T;
}

console.log('contour-map-core');

test('地形是固定的：同一座島每次算出來一模一樣（雜訊有固定種子）', () => {
  for (const id of K.PRESETS) {
    const a = K.make(id), b = K.make(id);
    for (let k = 0; k < 50; k++) { const x = (k * 937) % 8000, y = (k * 571) % 8000; assert.strictEqual(a.h(x, y), b.h(x, y)); }
    near(a.max, b.max, 0);
  }
});

test('四座島的大小合理：最高點 500–1000 m、陸地 25–50 km²、海平面 0 時是一座島、四周邊界都是海', () => {
  for (const id of K.PRESETS) {
    const T = TS[id];
    assert.ok(T.max > 500 && T.max < 1000, id + ' 最高點 ' + T.max);
    assert.ok(T.landArea > 25 && T.landArea < 50, id + ' 陸地 ' + T.landArea);
    assert.strictEqual(K.islands(T, 0).count, 1, id);
    for (let t = 0; t <= 8000; t += 200) for (const p of [[t, 0], [t, 8000], [0, t], [8000, t]]) assert.ok(T.h(p[0], p[1]) < 0, id + ' 邊界 ' + p);
  }
});

test('坡度：平面 h = 0.3x + 0.4y 的坡度是 50%（26.57°），坡向朝西南偏南（往下坡的方向），五級坡', () => {
  const T = fake((x, y) => 0.3 * x + 0.4 * y + 10);
  const s = K.slope(T, 4000, 4000);
  near(s.pct, 50, 1e-6); near(s.deg, Math.atan(0.5) / DEG, 1e-6);
  near(s.aspect, (Math.atan2(-0.3, -0.4) / DEG + 360) % 360, 1e-6);
  assert.strictEqual(s.cls, 5);
});

test('坡度分級的邊界（山坡地土地可利用限度分類標準）', () => {
  const C = K.slopeClass;
  assert.deepStrictEqual([0, 5, 5.01, 15, 15.01, 30, 30.01, 40, 40.01, 55, 55.01, 200].map(C), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
});

test('臨界點：二次曲面的山頂、窪地、鞍部判定正確，坡地不算臨界點', () => {
  const peak = fake((x, y) => 500 - 1e-4 * ((x - 4000) ** 2 + (y - 4000) ** 2));
  const pit = fake((x, y) => 100 + 1e-4 * ((x - 4000) ** 2 + (y - 4000) ** 2));
  const sad = fake((x, y) => 300 + 1e-4 * ((x - 4000) ** 2 - (y - 4000) ** 2));
  assert.strictEqual(K.crit(peak, 4000, 4000), 'peak');
  assert.strictEqual(K.crit(pit, 4000, 4000), 'pit');
  assert.strictEqual(K.crit(sad, 4000, 4000), 'saddle');
  assert.strictEqual(K.crit(peak, 4500, 4000), null);
});

test('等高線：圓錐 h = 1000 − 0.2r 的 600 m 等高線是半徑 2000 m 的封閉圓（方格行進法誤差 < 2 m）', () => {
  const T = fake((x, y) => 1000 - 0.2 * Math.hypot(x - 4000, y - 4000));
  const L = K.contours(T, 600);
  assert.strictEqual(L.length, 1);
  assert.ok(L[0].closed);
  let mx = 0;
  L[0].pts.forEach(p => { mx = Math.max(mx, Math.abs(Math.hypot(p[0] - 4000, p[1] - 4000) - 2000)); });
  assert.ok(mx < 2, '最大半徑誤差 ' + mx);
  // 每一點都剛好在 600 m（線性內插）
  L[0].pts.forEach(p => near(T.h(p[0], p[1]), 600, 0.6));
});

test('等高線的總長度隨等高距反比：等高距減半，線約多一倍', () => {
  const T = TS.twin;
  const len = iv => { let s = 0; for (let L = iv; L < T.max; L += iv) K.contours(T, L).forEach(l => { for (let i = 1; i < l.pts.length; i++) s += Math.hypot(l.pts[i][0] - l.pts[i - 1][0], l.pts[i][1] - l.pts[i - 1][1]); }); return s; };
  const r = len(25) / len(50);
  assert.ok(r > 1.9 && r < 2.1, '比值 ' + r);
});

test('窪地環的示坡線判定：火山口裡的封閉等高線是窪地，山頂的封閉等高線不是', () => {
  const V = TS.volcano;
  const inner = K.contours(V, 650).filter(l => l.closed && l.pts.every(p => Math.hypot(p[0] - 4050, p[1] - 3950) < 480));
  assert.ok(inner.length >= 1, '找不到火山口內的等高線');
  assert.ok(inner.every(l => K.isDepressionLoop(V, l)));
  const top = K.contours(TS.twin, 900).filter(l => l.closed);
  assert.ok(top.length >= 1 && top.every(l => !K.isDepressionLoop(TS.twin, l)));
});

test('剖面：平面上的剖面長度、高差、平均坡度與最陡坡度都等於解析值；累積爬升 = 高差', () => {
  const T = fake((x, y) => 0.25 * x + 5);
  const P = K.profile(T, [1000, 3000], [3000, 3000], 400);
  near(P.L, 2000, 1e-9); near(P.dh, 500, 1e-6); near(P.avg, 25, 1e-6); near(P.maxSlope, 25, 1e-6);
  near(P.ascent, 500, 1e-6); near(P.descent, 0, 1e-9); near(P.maxDeg, Math.atan(0.25) / DEG, 1e-6);
});

test('垂直誇大：tan θ′ = V tan θ（20° 誇大 5 倍約 61.2°；1 倍不變）', () => {
  near(K.apparentDeg(20, 5), Math.atan(5 * Math.tan(20 * DEG)) / DEG, 1e-12);
  near(K.apparentDeg(20, 5), 61.2, 0.05);
  near(K.apparentDeg(33, 1), 33, 1e-12);
});

test('通視：平地上的兩人，距離越過 2√(2Rh/(1−k)) ≈ 9.68 km 就被地球擋住', () => {
  const T = fake(() => 5);
  const lim = 2 * Math.sqrt(2 * K.R_EARTH * K.EYE / (1 - K.K_REFR));
  near(lim, 9682, 2);
  const see = K.profile(T, [0, 4000], [lim - 60, 4000], 4000);
  const no = K.profile(T, [0, 4000], [Math.min(8000 * Math.SQRT2, lim + 60), 4000], 4000);
  assert.ok(see.visible && !no.visible);
  assert.ok(no.clearFlat >= 1.6 - 1e-9, '不算曲率時視線一直在地面上 1.6 m');
  // 中點的「隆起」= d1 d2 (1 − k) / 2R
  near(1.6 - no.clear, (no.L / 2) ** 2 * (1 - K.K_REFR) / (2 * K.R_EARTH), 0.01);
});

test('通視：山脊擋住視線、移開山脊就看得見；海面以下的地面用海面代替', () => {
  const ridge = fake((x, y) => (Math.abs(x - 4000) < 100 ? 200 : 20));
  assert.ok(!K.profile(ridge, [3000, 4000], [5000, 4000], 400).visible);
  const flat = fake(() => 20);
  assert.ok(K.profile(flat, [3000, 4000], [5000, 4000], 400).visible);
  const deep = fake((x, y) => (Math.abs(x - 4000) < 100 ? 50 : -30));
  assert.ok(!K.profile(deep, [3000, 4000], [5000, 4000], 400, 0).visible, '海平面 0：50 m 的小島擋住');
  assert.ok(K.profile(deep, [3000, 4000], [5000, 4000], 400, 60).visible, '海平面 60 m：小島淹掉，兩艘船看得見');
});

test('島嶼數：雙峰島在鞍部高度分成兩座；海平面超過最高點時沒有陸地；陸地比例隨海平面單調減少', () => {
  const T = TS.twin;
  const r2 = K.islandRange(T, 2);
  assert.ok(r2 && r2[0] > 300 && r2[0] < 500, '分開的海平面 ' + r2);
  assert.strictEqual(K.islands(T, r2[0] - 1).count, 1);
  assert.strictEqual(K.islands(T, r2[0] + 1).count, 2);
  assert.strictEqual(K.islands(T, T.max + 1).count, 0);
  let prev = 2;
  for (let s = 0; s <= T.max; s += 25) { const f = K.islands(T, s).frac; assert.ok(f <= prev + 1e-12); prev = f; }
});

test('島嶼數用 8 連通：只靠斜角相連的兩格算同一座島', () => {
  const T = fake((x, y) => {
    const i = Math.round(x / K.CELL), j = Math.round(y / K.CELL);
    return ((i === 100 && j === 100) || (i === 101 && j === 101) || (i === 100 && j === 99)) ? 10 : -10;
  });
  assert.strictEqual(K.islands(T, 0).count, 1);
});

test('水文：每一格（陸地）都流得到海（填窪後沒有死路）；集水面積守恆 = 陸地格數', () => {
  for (const id of K.PRESETS) {
    const T = TS[id], H = K.hydro(T), N = K.N;
    const outs = new Set();
    for (let k = 0; k < N * N; k++) {
      if (T.grid[k] <= 0) continue;
      let c = k, steps = 0;
      while (H.down[c] >= 0 && T.grid[H.down[c]] > 0 && steps < N * N) { c = H.down[c]; steps++; }
      assert.ok(steps < N * N, id + ' 有迴圈');
      assert.ok(H.down[c] >= 0 && T.grid[H.down[c]] <= 0, id + ' 有流不到海的格子');
      outs.add(c);
    }
    let outlets = 0;
    outs.forEach(c => { outlets += H.acc[c]; });
    near(outlets, T.landCells, 0.5, id + ' 流出海的集水量');
  }
});

test('水文：火山口是窪地（深 100 m 以上），雙峰島的山坡上沒有窪地', () => {
  assert.ok(K.depression(TS.volcano, 4050, 3950) > 100);
  near(K.depression(TS.twin, 4300, 5300), 0, 0.5);
});

test('任務快照：欄位齊全、數值和直接計算一致', () => {
  const T = TS.twin;
  const s = K.snapshot(T, { preset: 'twin', interval: 50, vexag: 3, sea: 0, slice: 600, view: '2d', probe: [4300, 5300], A: [100, 6500], B: [7750, 1750] });
  const sl = K.slope(T, 4300, 5300);
  near(s.probe.pct, sl.pct, 1e-3); near(s.probe.h, T.h(4300, 5300), 0.01);
  assert.strictEqual(s.islands, 1);
  near(s.landFrac, 1, 1e-9);
  const P = K.profile(T, [100, 6500], [7750, 1750], 400, 0);
  near(s.prof.avg, P.avg, 1e-3); near(s.prof.appDeg, K.apparentDeg(P.maxDeg, 3), 2e-3);
  assert.ok(s.prof.grazeFrac >= 0 && s.prof.grazeFrac <= 1);
  ['L', 'hA', 'hB', 'dh', 'avg', 'maxSlope', 'maxDeg', 'appDeg', 'ascent', 'descent', 'minH', 'maxH', 'clear', 'clearFlat', 'visible', 'grazeH', 'landAll', 'midPct']
    .forEach(k => assert.ok(k in s.prof, '缺 ' + k));
  ['x', 'y', 'h', 'land', 'pct', 'deg', 'aspect', 'cls', 'crit', 'dSummit', 'depression', 'catchment', 'catchFrac', 'spacing']
    .forEach(k => assert.ok(k in s.probe, '缺 ' + k));
});

console.log(`  共 ${passed} 項通過`);
