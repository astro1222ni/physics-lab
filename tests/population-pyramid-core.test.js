// 以 Node 執行：node tests/population-pyramid-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/population-pyramid-core.js');
const DATA = K.DATA;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
const tot = p => K.sum(p.m) + K.sum(p.f);
const custom = (tfr, e0, net, srb) => ({ mode: 'custom', tfr, e0, net: net || 0, srb: srb || 107 });

test('資料：2025 年底人口與內政部公布的總數相同，過去年份齊全', () => {
  assert.strictEqual(tot(K.basePop()), 23299132);
  assert.strictEqual(K.sum(K.basePop().m), 11462401);
  assert.deepStrictEqual(K.PAST, [1992, 2000, 2010, 2020, 2024]);
  assert.strictEqual(tot(K.pastPop(1992)), 20802622);
  K.PAST.forEach(y => { const p = K.pastPop(y); assert.strictEqual(p.m.length, 101); assert.ok(p.m.every(v => v >= 0) && p.f.every(v => v >= 0)); });
});

test('生育率與遷移的年齡分布各自加總為 1，生育只在 15–49 歲', () => {
  near(K.FERT.reduce((a, b) => a + b, 0), 1, 1e-12);
  near(K.MIG.reduce((a, b) => a + b, 0), 1, 1e-12);
  for (let a = 0; a < 101; a++) if (a < 15 || a > 49) assert.strictEqual(K.FERT[a], 0, '年齡 ' + a);
  // 遷移最多的是 20 多歲
  let best = 0; for (let a = 0; a < 101; a++) if (K.MIG[a] > K.MIG[best]) best = a;
  assert.ok(best >= 20 && best <= 27, '遷移高峰 ' + best);
});

test('生命表：2025 年平均餘命和內政部公布值相差 0.5 歲以內（85 歲以上改用國發會值）；國發會各年也吻合', () => {
  near(K.lifeTable(K.Q2025.m).e0, DATA.life.e0m, 0.5);
  near(K.lifeTable(K.Q2025.f).e0, DATA.life.e0f, 0.5);
  [2026, 2050, 2075].forEach(y => {
    near(K.lifeTable(K.ndcQ(y, 'm')).e0, DATA.ndc.e0m[y], 0.15, y + ' 男');
    near(K.lifeTable(K.ndcQ(y, 'f')).e0, DATA.ndc.e0f[y], 0.3, y + ' 女');
  });
  const lt = K.lifeTable(K.Q2025.f);
  for (let a = 0; a < 100; a++) assert.ok(lt.l[a + 1] <= lt.l[a] && lt.L[a] > 0);
});

test('Brass 模型：α = 0 不改變死亡率；平均壽命可以精確調到指定值，越高越長壽', () => {
  const q = K.brassQ(K.Q2025.m, 0);
  for (let a = 0; a < 100; a++) near(q[a], K.Q2025.m[a], 1e-9, '年齡 ' + a);
  let prev = 0;
  [30, 50, 70, 81.5, 90, 95].forEach(e => {
    const mo = K.mortalityFor(e);
    const got = (K.lifeTable(mo.qm).e0 + K.lifeTable(mo.qf).e0) / 2;
    near(got, e, 0.01, 'e0 ' + e);
    assert.ok(got > prev); prev = got;
    assert.ok(K.lifeTable(mo.qf).e0 > K.lifeTable(mo.qm).e0, '女性比男性長壽');
  });
});

test('沒有出生、沒有遷移時，人數只會減少，而且每個人老一歲', () => {
  const p0 = K.basePop(), p1 = K.step(p0, custom(0, 81.5, 0));
  assert.strictEqual(p1.year, 2026);
  assert.strictEqual(p1.m[0], 0); assert.strictEqual(p1.births, 0);
  for (let a = 0; a < 99; a++) assert.ok(p1.m[a + 1] <= p0.m[a] + 1e-9 && p1.f[a + 1] <= p0.f[a] + 1e-9, '年齡 ' + a);
  near(tot(p0) - tot(p1), p1.deaths, 1e-6, '死亡數＝減少的人數');
  // 一年死亡的人數在 18 萬到 23 萬之間（合理範圍）
  assert.ok(p1.deaths > 1.8e5 && p1.deaths < 2.3e5, '死亡 ' + Math.round(p1.deaths));
});

test('人數守恆：年底人口 = 年初 + 出生 − 死亡 + 淨遷入', () => {
  let p = K.basePop();
  for (let i = 0; i < 30; i++) {
    const q = K.step(p, custom(1.4, 80, 50000));
    near(tot(q), tot(p) + q.births - q.deaths + q.net, 1e-3);
    near(q.net, 50000, 1e-6);
    p = q;
  }
});

test('2025 → 2026：出生數接近實際的 10 萬上下，男嬰比例照出生性比例', () => {
  const p1 = K.step(K.basePop(), custom(DATA.asfr.tfr, 81.5, 0, DATA.asfr.srb));
  assert.ok(p1.births > 9.5e4 && p1.births < 1.15e5, '出生 ' + Math.round(p1.births));
  near(p1.m[0] / p1.f[0], DATA.asfr.srb / 100 * K.paramsFor(custom(DATA.asfr.tfr, 81.5, 0, DATA.asfr.srb), 2026).ltm.L[0] / K.paramsFor(custom(DATA.asfr.tfr, 81.5, 0, DATA.asfr.srb), 2026).ltf.L[0], 1e-9);
});

test('國發會中推估：總人口與各年齡層比例和國發會公布值吻合（2050 年前 0.5%、2075 年 3% 以內）', () => {
  const P = K.project(K.basePop(), { mode: 'ndc' }, 2075);
  Object.keys(DATA.ndc.check).forEach(y => {
    const d = K.indicators(P[y - 2025]), c = DATA.ndc.check[y];
    const tol = y <= 2050 ? 0.005 : 0.03;
    assert.ok(Math.abs(d.total / c.total - 1) <= tol, y + ' 總人口 ' + Math.round(d.total) + ' vs ' + c.total);
    near(d.pct65, 100 * c.p65 / c.total, y <= 2050 ? 1 : 2.5, y + ' 65 歲以上 %');
    near(d.median, c.medianAge, y <= 2050 ? 0.6 : 1.5, y + ' 年齡中位數');
  });
  // 逐歲比對國發會公布的金字塔
  K.NDC_PYR.forEach(y => assert.ok(K.distance(P[y - 2025], K.ndcPop(y)) < (y <= 2050 ? 0.03 : 0.06), y + ' 逐歲差距'));
});

test('穩定人口：照同一個情境推下去，形狀完全不變，每年乘上同一個比率', () => {
  [[6, 35], [2.1, 80], [1.1, 85], [0.7, 81.5]].forEach(([t, e]) => {
    const sc = custom(t, e, 0, 105), s = K.stablePop(sc, 2e7);
    near(tot(s.pop), 2e7, 1e-3);
    let p = s.pop;
    for (let i = 0; i < 40; i++) p = K.step(p, sc);
    const k = 2e7 / tot(p);
    near(Math.pow(tot(p) / 2e7, 1 / 40) - 1, s.r, 1e-10, 'TFR ' + t);
    assert.ok(K.distance({ m: p.m.map(v => v * k), f: p.f.map(v => v * k) }, s.pop) < 1e-10, '形狀 TFR ' + t);
  });
});

test('替代水準：平均壽命 81.5 歲時，總生育率約 2.1 才能零成長；生育率越高成長越快', () => {
  const r = t => K.stablePop(custom(t, 81.5, 0, 107)).r;
  assert.ok(r(2.05) < 0 && r(2.15) > 0);
  let prev = -1;
  for (let t = 0.5; t <= 6; t += 0.5) { const v = r(t); assert.ok(v > prev); prev = v; }
  // 死亡率高時要生更多才夠
  assert.ok(K.stablePop(custom(2.1, 50, 0, 107)).r < 0);
});

test('人口類型：高生育率是擴張型、接近替代水準是穩定型、2025 年臺灣是收縮型', () => {
  assert.strictEqual(K.indicators(K.stablePop(custom(5, 60)).pop).shape, 'expansive');
  assert.strictEqual(K.indicators(K.stablePop(custom(2.1, 80)).pop).shape, 'stationary');
  const d = K.indicators(K.basePop());
  assert.strictEqual(d.shape, 'constrictive');
  near(d.pct65, 20.06, 0.01); near(d.pct0_14, 11.51, 0.01); near(d.median, 45.71, 0.15);
  assert.strictEqual(d.stage, 3);
  assert.strictEqual(K.indicators(K.pastPop(1992)).stage, 0);
});

test('指標：扶養比 = 扶幼比 + 扶老比；各年齡層加起來是總人口', () => {
  [K.basePop(), K.pastPop(1992), K.stablePop(custom(4, 60)).pop].forEach(p => {
    const d = K.indicators(p);
    near(d.dep, d.depY + d.depO, 1e-9);
    near(d.p0_14 + d.p15_64 + d.p65, d.total, 1e-6);
    near(d.pct0_14 + d.pct15_64 + d.pct65, 100, 1e-9);
    near(d.aging, 100 * d.p65 / d.p0_14, 1e-9);
  });
});

test('人口慣性：總生育率 2.1、沒有遷移，臺灣人口仍會減少好幾十年', () => {
  const P = K.project(K.basePop(), custom(2.1, 81.5, 0), 2125);
  assert.ok(tot(P[50]) < tot(P[0]) * 0.85);
  assert.ok(tot(P[100]) < tot(P[0]));
});

test('扶養比在穩定人口裡對生育率是 U 形：最低點附近兩邊都比較高', () => {
  const m = K.minDependency(81.5, 107);
  assert.ok(m.tfr > 1.5 && m.tfr < 3.5, 'TFR ' + m.tfr);
  const dep = t => K.indicators(K.stablePop({ tfr: t, e0: 81.5, srb: 107 }).pop).dep;
  assert.ok(dep(m.tfr - 0.5) > m.dep + 0.5 && dep(m.tfr + 0.5) > m.dep + 0.5);
  for (let t = 0.5; t <= 6; t += 0.25) assert.ok(dep(t) >= m.dep - 1e-6, 'TFR ' + t);
});

test('龍年出生的人比前後一年多，2010 年（虎年）比前後一年少（2025 年底真實資料）', () => {
  const p = K.basePop(), n = y => p.m[2025 - y] + p.f[2025 - y];
  [1976, 1988, 2000, 2012].forEach(y => assert.ok(n(y) > n(y - 1) && n(y) > n(y + 1), String(y)));
  [1998, 2010].forEach(y => assert.ok(n(y) < n(y - 1) && n(y) < n(y + 1), String(y)));
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗' : ''));
