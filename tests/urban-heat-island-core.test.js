// 以 Node 執行：node tests/urban-heat-island-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/urban-heat-island-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
const N = K.N;
const CALM = { wind: 0, hour: 2, cloud: 0 };
const run = o => K.compute(Object.assign({ P: 1e6, wind: 0, hour: 2, cloud: 0, green: 0, cool: 0, parks: [] }, o));

test('經驗式：Oke（1973）歐洲城市與臨界風速（Oke 與 Hannell 1970）', () => {
  near(K.oke(1e6), 2.01 * 6 - 4.06, 1e-12);
  near(K.oke(1e5) - K.oke(1e4), 2.01, 1e-12, '人口多 10 倍多 2.01 °C');
  assert.strictEqual(K.oke(50), 0, '很小的聚落不會是負的');
  near(K.ucrit(1e6), 3.4 * 6 - 11.6, 1e-12);
  near(K.windFactor(0, 1e6), 1, 1e-12); near(K.windFactor(K.ucrit(1e6), 1e6), 0, 1e-12); near(K.windFactor(20, 1e6), 0, 1e-12);
  near(K.windFactor(K.ucrit(1e6) / 2, 1e6), 0.5, 1e-12);
  near(K.radiusKm(1e6), Math.sqrt(1e6 / (Math.PI * K.DENS)), 1e-12);
});

test('一天與雲量：凌晨 2 點最強、下午 2 點最弱；雲越多越弱；郊區下午最熱', () => {
  near(K.hourFactor(2), 1, 1e-12); near(K.hourFactor(14), 0.3, 1e-12); near(K.hourFactor(0), K.hourFactor(24), 1e-12);
  for (let h = 0; h <= 24; h++) assert.ok(K.hourFactor(h) >= 0.3 - 1e-12 && K.hourFactor(h) <= 1 + 1e-12);
  near(K.cloudFactor(0), 1, 1e-12); near(K.cloudFactor(1), 0.25, 1e-12);
  for (let c = 0; c < 1; c += 0.1) assert.ok(K.cloudFactor(c + 0.1) < K.cloudFactor(c));
  assert.ok(K.rural(14, 0) > K.rural(2, 0));
  assert.ok(K.rural(14, 1) - K.rural(2, 1) < K.rural(14, 0) - K.rural(2, 0), '陰天日夜溫差小');
});

test('解方程：離散的 λT − K∇²T + u∂T/∂x = S 在每一個內部格子都成立；邊界是 0', () => {
  [0, 3].forEach(u => {
    const S = K.landcover({ P: 5e5 }).S, T = K.solve(S, u, 1500), uu = u * K.U_PER_MS;
    let worst = 0;
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 2; i++) {
      const k = j * N + i;
      const lhs = K.LAMBDA * T[k] - K.K_DIFF * (T[k - 1] + T[k + 1] + T[k - N] + T[k + N] - 4 * T[k]) + uu * (T[k] - T[k - 1]);
      worst = Math.max(worst, Math.abs(lhs - S[k]));
    }
    assert.ok(worst < 1e-3, '風速 ' + u + ' 的殘差 ' + worst);
    for (let i = 0; i < N; i++) { assert.strictEqual(T[i], 0); assert.strictEqual(T[(N - 1) * N + i], 0); assert.strictEqual(T[i * N], 0); }
  });
});

test('校準：晴朗無風的凌晨 2 點，熱島強度等於 Oke 的值；再依風、時刻、雲量打折', () => {
  [1e4, 1e5, 5e5, 1e6, 3e6].forEach(P => near(run({ P }).max, K.oke(P), 1e-6, 'P = ' + P));
  const P = 8e5, f = K.oke(P) * K.windFactor(2, P) * K.hourFactor(20) * K.cloudFactor(0.4);
  near(run({ P, wind: 2, hour: 20, cloud: 0.4 }).max, f, 1e-6);
  assert.strictEqual(run({ P: 1e6, wind: 9 }).max, 0, '超過臨界風速，熱島消失');
  // 人口與強度：越大越強
  assert.ok(run({ P: 2e6 }).max > run({ P: 1e6 }).max && run({ P: 2e6 }).area2 > run({ P: 1e6 }).area2);
});

test('風：最熱的地方往下風（東）移；上風處的郊區幾乎沒有變暖', () => {
  let last = -1;
  [0, 1, 2, 4, 6].forEach(u => { const r = run({ wind: u }); assert.ok(r.peakKm >= last, '風速 ' + u); last = r.peakKm; });
  assert.ok(run({ wind: 0 }).peakKm <= 0.5 && run({ wind: 4 }).peakKm >= 4);
  const r = run({ wind: 3 }), j = 40;
  const west = r.T[j * N + 15], east = r.T[j * N + 65];
  assert.ok(west < 0.1 && east > 1.5, '西 ' + west + '、東 ' + east);
  // 無風時東西大致對稱（土地利用的小擾動除外）
  const c = run({});
  assert.ok(Math.abs(c.T[j * N + 30] - c.T[j * N + 49]) < 0.6);
});

test('降溫對策：綠地、涼屋頂、公園都讓熱島變弱；公園的地方比旁邊涼', () => {
  const base = run({});
  assert.ok(run({ green: 0.3 }).max < base.max && run({ cool: 1 }).max < base.max);
  assert.ok(run({ green: 0.5, cool: 1 }).max < run({ green: 0.3, cool: 0.5 }).max);
  const s = K.summary(Object.assign({ P: 1e6, parks: [{ i: 40, j: 40 }] }, CALM), { i: 40, j: 40 });
  assert.ok(s.probe.park && s.center < s.centerNoPark - 2, s.center + ' / ' + s.centerNoPark);
  assert.ok(s.mitig > 0 && s.mitig < 1);
  near(s.maxBase, base.max, 1e-6, '對策不改變基準');
  const lc = K.landcover({ P: 1e6, parks: [{ i: 40, j: 40 }] });
  let n = 0; for (let k = 0; k < N * N; k++) if (lc.park[k]) { n++; assert.strictEqual(lc.imp[k], 0); }
  assert.strictEqual(n, 13, '半徑 2 格的公園是 13 格');
});

test('地表：郊區沒有不透水面；河流是一條連續的帶子；市區不透水面多', () => {
  const lc = K.landcover({ P: 1e6 });
  assert.ok(lc.imp[5 * N + 5] < 0.01 && lc.urb[5 * N + 5] < 0.01);
  assert.ok(lc.imp[40 * N + 40] > 0.75 && lc.urb[40 * N + 40] > 0.99);
  for (let i = 0; i < N; i++) { let w = 0; for (let j = 0; j < N; j++) w += lc.water[j * N + i]; assert.ok(w >= 2 && w <= 3, '第 ' + i + ' 欄有 ' + w + ' 格河'); }
  for (let k = 0; k < N * N; k++) if (lc.water[k]) assert.ok(lc.S[k] < 0);
});

test('摘要：溫度計、對稱點、面積與快取一致', () => {
  const o = Object.assign({ P: 1e6, wind: 3 }, { hour: 2, cloud: 0 }), r = K.compute(o);
  const s = K.summary(o, { i: 60, j: 40 }, r);
  near(s.probe.dT, r.T[40 * N + 60], 1e-12); near(s.probe.mirror, r.T[40 * N + 19], 1e-12);
  near(s.probe.t, s.rural + s.probe.dT, 1e-12);
  near(s.probe.x, 10.25, 1e-12); near(s.probe.y, 0.25, 1e-12);
  let a = 0; for (let k = 0; k < N * N; k++) if (r.T[k] >= 2) a += 0.25;
  near(s.area2, a, 1e-9);
  assert.strictEqual(K.summary(o, null).probe, null);
  assert.ok(K.base(1e6, 3) === K.base(1e6, 3), '基準場有快取');
  const c = K.cellOf(10.25, 0.25); assert.deepStrictEqual(c, [60, 40]);
});

console.log('\n' + passed + ' 項通過');
