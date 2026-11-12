// 以 Node 執行：node tests/blood-glucose-core.test.js
'use strict';
const assert = require('assert');
const B = require('../js/blood-glucose-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b} ± ${tol}，得到 ${a}`);
}
const M3 = (b, l, d) => [{ t: 420, g: b }, { t: 720, g: l }, { t: 1080, g: d }];
const bolusOf = (meals, k, lead) => meals.map(m => ({ t: m.t - (lead || 0), u: m.g / k }));

console.log('blood-glucose-core');

test('單位換算：180.16 g 葡萄糖 = 1 mol；60 kg 的人 1 U = 16.7 mU/kg；ADAG：A1C 7% ↔ 平均 154 mg/dL', () => {
  const m = B.make({ bw: 60 });
  close(m.carb(180.16), 1000 / 60, 1e-9);
  close(m.units(1), 1000 / 60, 1e-9);
  close(B.a1cOf(154), 7.0, 0.01);
  close(B.a1cOf(126), 6.0, 0.03);
  close(B.MGDL, 18.0, 0);
});

test('健康的人空腹：血糖 80–100 mg/dL，不吃不打時維持穩定（10 小時內變化 < 0.5 mg/dL）', () => {
  const m = B.make({ beta: 1, si: 1 });
  const G0 = m.reset(5) * B.MGDL;
  assert.ok(G0 >= 80 && G0 <= 100, '空腹 ' + G0);
  for (let i = 0; i < 600; i++) m.step(1, {});
  close(m.G() * B.MGDL, G0, 0.5);
  assert.ok(m.s.I > 2 && m.s.I < 20, '空腹胰島素 ' + m.s.I + ' mU/L');
});

test('健康的人喝 75 g（OGTT）：30–60 分鐘到峰值 120–200，2 小時回到 140 以下，判讀正常；胰島素峰值是空腹的 3 倍以上', () => {
  const r = B.ogtt({ bw: 60, beta: 1, si: 1, cr: 1 });
  let pk = 0; for (let t = 1; t <= 180; t++) if (r.G[t] > r.G[pk]) pk = t;
  assert.ok(pk >= 30 && pk <= 60, '峰值時間 ' + pk);
  assert.ok(r.G[pk] >= 120 && r.G[pk] <= 200, '峰值 ' + r.G[pk]);
  assert.ok(r.G[120] < 140, '2 小時 ' + r.G[120]);
  assert.strictEqual(B.diagnose(r.G[0], r.G[120]), 'normal');
  assert.ok(Math.max.apply(null, r.I) > 3 * r.I[0]);
});

test('腸道吸收守恆：吃下的醣最後有 AG（80%）進入血液', () => {
  const m = B.make({ beta: 1 }); m.reset(5);
  const meal = m.carb(60);
  let absorbed = 0;
  for (let t = 0; t < 1440; t++) { const before = m.s.D1 + m.s.D2 + (t === 0 ? B.P.AG * meal : 0); m.step(1, t === 0 ? { meal: meal } : {}); absorbed += before - (m.s.D1 + m.s.D2); }
  close(absorbed + m.s.D1 + m.s.D2, B.P.AG * meal, 1e-9 * meal);
  close(absorbed, B.P.AG * meal, 0.001 * meal);
});

test('皮下注射守恆：打進去的胰島素最後全部進入血漿', () => {
  const m = B.make({ beta: 0 }); m.reset(8);
  const dose = m.units(5);
  m.step(1, { bolus: dose });
  let total = 0;
  for (let t = 0; t < 2000; t++) { const before = m.s.S1 + m.s.S2; m.step(1, {}); total += before - (m.s.S1 + m.s.S2); }
  close(total, dose, 0.002 * dose);
});

test('腎閾：血糖沒超過 9 mmol/L（162 mg/dL）就沒有尿糖；健康的人一天三餐尿糖 0', () => {
  const r = B.day({ type: 'normal', meals: M3(60, 80, 80) });
  assert.ok(r.stats.max < 162, '最高 ' + r.stats.max);
  assert.strictEqual(r.urine, 0);
  const t1 = B.day({ type: 't1', meals: M3(60, 80, 80) });
  assert.ok(t1.urine > 20, '未治療第一型尿糖 ' + t1.urine + ' g');
});

test('診斷標準：空腹 ≥ 126 或 2 小時 ≥ 200 是糖尿病；100–125 或 140–199 是前期', () => {
  assert.strictEqual(B.diagnose(99.9, 139.9), 'normal');
  assert.strictEqual(B.diagnose(100, 120), 'pre');
  assert.strictEqual(B.diagnose(90, 140), 'pre');
  assert.strictEqual(B.diagnose(125.9, 199.9), 'pre');
  assert.strictEqual(B.diagnose(126, 100), 'dm');
  assert.strictEqual(B.diagnose(90, 200), 'dm');
});

test('β 細胞功能越差、或胰島素敏感度越低，OGTT 2 小時血糖越高', () => {
  const two = (beta, si) => B.ogtt({ bw: 60, beta: beta, si: si, cr: 1 }).G[120];
  let prev = 0;
  for (const beta of [2, 1.5, 1, 0.6, 0.35, 0.15]) { const g = two(beta, 1); assert.ok(g > prev, 'β ' + beta); prev = g; }
  prev = 0;
  for (const si of [2, 1, 0.6, 0.3, 0.15]) { const g = two(1, si); assert.ok(g > prev, 'si ' + si); prev = g; }
});

test('胰島素阻抗可以被 β 細胞代償：敏感度只剩 0.3 時，β 細胞加倍工作 OGTT 仍可正常', () => {
  assert.notStrictEqual(B.diagnose.apply(null, pick(B.ogtt({ bw: 60, beta: 1, si: 0.3, cr: 1 }))), 'normal');
  assert.strictEqual(B.diagnose.apply(null, pick(B.ogtt({ bw: 60, beta: 2, si: 0.3, cr: 1 }))), 'normal');
  function pick(r) { return [r.G[0], r.G[120]]; }
});

test('第二型（預設）：OGTT 判讀為糖尿病，一天三餐 A1C 估計 > 6.5%', () => {
  const ty = B.TYPES.t2;
  const r = B.ogtt({ bw: 60, beta: ty.beta, si: ty.si, cr: ty.cr });
  assert.strictEqual(B.diagnose(r.G[0], r.G[120]), 'dm');
  const d = B.day({ type: 't2', meals: M3(60, 80, 80) });
  assert.ok(d.stats.a1c > 6.5, 'A1C ' + d.stats.a1c);
});

test('第一型：沒有胰島素時血糖一路飆高；基礎＋餐前胰島素可讓 TIR ≥ 90% 且不低血糖', () => {
  const no = B.day({ type: 't1', meals: M3(60, 80, 80) });
  assert.ok(no.stats.mean > 400, '未治療平均 ' + no.stats.mean);
  const meals = M3(60, 80, 80);
  const ok = B.day({ type: 't1', meals: meals, basalU: 14, bolus: bolusOf(meals, 15, 0) });
  assert.ok(ok.stats.tir >= 0.9, 'TIR ' + ok.stats.tir);
  assert.ok(ok.stats.min >= 70, '最低 ' + ok.stats.min);
});

test('基礎胰島素越多，第一型的空腹血糖越低（單調）', () => {
  let prev = Infinity;
  for (const u of [10, 12, 14, 16, 18]) {
    const g = B.day({ type: 't1', basalU: u }).G[420];
    assert.ok(g < prev, '基礎 ' + u + ' U → ' + g); prev = g;
  }
});

test('運動讓血糖下降：同樣的胰島素，飯後運動 60 分鐘最低血糖比不運動低', () => {
  const meals = M3(60, 80, 80);
  const base = { type: 't1', meals: meals, basalU: 14, bolus: bolusOf(meals, 12, 0) };
  const a = B.day(base);
  const b = B.day(Object.assign({}, base, { ex: [{ t: 780, dur: 60, e: 0.8 }] }));
  assert.ok(b.stats.min < a.stats.min - 5, a.stats.min + ' → ' + b.stats.min);
});

test('反調節（升糖素）抵抗低血糖：反調節越強，同樣過量的胰島素下最低血糖越高', () => {
  const meals = M3(60, 80, 80);
  const plan = cr => ({ beta: 0, si: 0.6, cr: cr, meals: meals, basalU: 16, bolus: bolusOf(meals, 6, 0) });
  const lo = B.day(plan(0)).stats.min, hi = B.day(plan(1)).stats.min;
  assert.ok(lo < 70, '沒有反調節時最低 ' + lo);
  assert.ok(hi > lo + 3, lo + ' → ' + hi);
});

test('統計：固定 100 mg/dL 時 TIR = 100%；一半時間 60 時低於範圍 50%', () => {
  const flat = new Array(1441).fill(100);
  const s = B.stats(flat);
  close(s.tir, 1, 1e-12); close(s.mean, 100, 1e-9);
  const half = flat.map((g, i) => i < 720 ? 60 : 100);
  const h = B.stats(half);
  close(h.tbr, 0.5, 0.002);
  assert.strictEqual(h.min, 60); assert.strictEqual(h.max, 100);
});

console.log(passed + ' 項通過');
