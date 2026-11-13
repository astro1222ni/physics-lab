// 以 Node 執行：node tests/colligative-properties-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/colligative-properties-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`); }
function rel(a, b, tol, msg) { near(a / b, 1, tol, (msg || '') + `（${a} 對 ${b}）`); }
const R = 8.314;
/** 跑一次實驗：每 1 s 記錄一筆，到相變後 after 秒為止 */
function runRec(o, after) {
  const r = C.createRun(o), rows = [[0, C.reading(r)]];
  while (!r.ended) {
    C.step(r, 1); rows.push([Math.round(r.t), C.reading(r)]);
    const on = o.mode === 'f' ? r.tNuc : r.tBoil;
    if (on != null && r.t >= on + (after == null ? 90 : after)) break;
  }
  return { r: r, rows: rows };
}
const glu = function (m, w1) { return 180.16 * m * (w1 || 50) / 1000; };

test('數據：OpenStax 表 11.2（水 1.86／0.512、苯 5.12／2.53、冰醋酸 3.9／3.07）、表 11.3（NaCl 1.9、MgCl2 2.7、MgSO4 1.3）', function () {
  near(C.SOLVENTS.water.Kf, 1.86, 0); near(C.SOLVENTS.water.Kb, 0.512, 0);
  near(C.SOLVENTS.benzene.Kf, 5.12, 0); near(C.SOLVENTS.benzene.Kb, 2.53, 0);
  near(C.SOLVENTS.acetic.Kf, 3.9, 0); near(C.SOLVENTS.acetic.Kb, 3.07, 0); near(C.SOLVENTS.acetic.Tf, 16.6, 0);
  near(C.SOLVENTS.cyclohexane.Kf, 20.2, 0);
  near(C.SOLUTES.NaCl.real, 1.9, 0); near(C.SOLUTES.MgCl2.real, 2.7, 0); near(C.SOLUTES.MgSO4.real, 1.3, 0);
  near(C.SOLUTES.glucose.M, 6 * 12.011 + 12 * 1.008 + 6 * 15.999, 0.01);
  near(C.SOLUTES.NaCl.M, 22.990 + 35.45, 0.01);
});
test('熱力學一致：K = R·T²·M ÷ ΔH（水、苯的 Kf 與 Kb，和表列值相差 2% 內；苯的 Kb 表列值本身與汽化熱算的差 4%，放寬到 5%）', function () {
  ['water', 'benzene'].forEach(function (k) {
    const s = C.SOLVENTS[k];
    rel(R * Math.pow(s.Tf + 273.15, 2) / (s.Lf * 1000), s.Kf, 0.02, k + ' Kf');
    rel(R * Math.pow(s.Tb + 273.15, 2) / (s.Lv * 1000), s.Kb, k === 'benzene' ? 0.05 : 0.02, k + ' Kb');
  });
  // 環己烷：熔化熱 31.8 J/g → Kf ≈ 20.5，與 CRC 20.2 相差 2% 內
  const c = C.SOLVENTS.cyclohexane;
  rel(R * Math.pow(c.Tf + 273.15, 2) / (c.Lf * 1000), c.Kf, 0.02, '環己烷');
});
test('理論值：0.500 mol/kg 葡萄糖水 ΔTf = 0.930 K、ΔTb = 0.256 K；ΔT 與 m 成正比、溶質為 0 時 ΔT = 0', function () {
  const f = C.createRun({ mode: 'f', solvent: 'water', solute: 'glucose', w1: 50, w2: glu(0.5), Tbath: -10 });
  near(C.theory(f).m, 0.5, 1e-9); near(C.theory(f).dT, 0.93, 1e-9);
  const b = C.createRun({ mode: 'b', solvent: 'water', solute: 'glucose', w1: 50, w2: glu(0.5), P: 100 });
  near(C.theory(b).dT, 0.256, 1e-9);
  const f2 = C.createRun({ mode: 'f', solvent: 'water', solute: 'glucose', w1: 50, w2: glu(1.0), Tbath: -10 });
  near(C.theory(f2).dT, 2 * C.theory(f).dT, 1e-9, '加倍');
  const f0 = C.createRun({ mode: 'f', solvent: 'water', solute: 'glucose', w1: 50, w2: 0, Tbath: -10 });
  near(C.theory(f0).dT, 0, 0);
});
test('依數性：同樣 m 的葡萄糖、蔗糖、尿素 ΔT 一樣；NaCl 是 1.9 倍（理想 2 倍）、苯甲酸在苯中是一半', function () {
  const d = function (so, M, ideal, sv) { return C.theory(C.createRun({ mode: 'f', solvent: sv || 'water', solute: so, w1: 100, w2: M * 0.3 / 10, ideal: ideal, Tbath: -10 })).dT; };
  const g = d('glucose', 180.16);
  near(d('sucrose', 342.30), g, 1e-12); near(d('urea', 60.06), g, 1e-12);
  rel(d('NaCl', 58.44), 1.9 * g, 1e-12); rel(d('NaCl', 58.44, true), 2 * g, 1e-12);
  rel(d('MgCl2', 95.21), 2.7 * g, 1e-12); rel(d('MgSO4', 120.37), 1.3 * g, 1e-12);
  rel(d('benzoic', 122.12, false, 'benzene'), 0.5 * d('naph', 128.17, false, 'benzene'), 1e-12);
});
test('純溶劑：結晶後溫度停在凝固點（平台，200 s 內偏差 < 0.02 K）', function () {
  const x = runRec({ mode: 'f', solvent: 'water', solute: 'glucose', w1: 50, w2: 0, stir: true, Tbath: -10 }, 200);
  const seg = x.rows.filter(function (r) { return r[0] >= x.r.tNuc + 20; });
  assert.ok(seg.length > 150);
  seg.forEach(function (r) { near(r[1], 0, 0.02); });
});
test('溶液：結晶後溫度一直往下（凝固線是斜的），而且隨時跟著剩下的液體的凝固點', function () {
  const r = C.createRun({ mode: 'f', solvent: 'water', solute: 'NaCl', w1: 50, w2: 2.922, stir: true, Tbath: -12 });
  while (!r.nucleated) C.step(r, 1);
  C.step(r, 20);
  let last = r.T;
  for (let k = 0; k < 20; k++) {
    C.step(r, 10);
    assert.ok(r.T < last, '溫度應該下降');
    near(r.T, C.Tf(r), 0.03, '貼著凝固點');
    last = r.T;
  }
});
test('能量守恆（凝固）：散給冷浴的熱 = 溶液降溫放出的熱 + 熔化熱 × 結冰質量（0.3% 內）', function () {
  const r = C.createRun({ mode: 'f', solvent: 'benzene', solute: 'naph', w1: 60, w2: 3.2, stir: false, Tbath: -8 });
  const T0 = r.T;
  let Q = 0;
  for (let k = 0; k < 60000 && !r.ended; k++) {
    const a = r.T; C.step(r, 0.01); Q += r.h * ((a + r.T) / 2 - r.Tbath) * 0.01;
  }
  const frozen = r.w1 - r.ws;
  assert.ok(frozen > 5, '有結冰');
  rel(Q, r.C * (T0 - r.T) + r.sv.Lf * frozen, 0.003);
});
test('能量守恆（沸騰、沒有回流）：加熱 − 散熱 = 升溫 + 汽化熱 × 蒸發質量（0.3% 內）', function () {
  const r = C.createRun({ mode: 'b', solvent: 'water', solute: 'urea', w1: 80, w2: 3, chips: true, reflux: false, P: 150 });
  const T0 = r.T;
  let Q = 0;
  for (let k = 0; k < 120000 && !r.ended; k++) {
    const a = r.T; C.step(r, 0.01); Q += (r.P - C.H_LOSS * ((a + r.T) / 2 - r.Troom)) * 0.01;
  }
  const lost = r.w1 - r.ws;
  assert.ok(lost > 5, '有蒸發');
  rel(Q, r.C * (r.T - T0) + r.sv.Lv * lost, 0.003);
});
test('回流：溶劑量不變，沸騰時溫度是水平的平台（等於溶液的沸點）', function () {
  const x = runRec({ mode: 'b', solvent: 'benzene', solute: 'naph', w1: 50, w2: 6.4, chips: true, reflux: true, P: 120 }, 300);
  near(x.r.ws, 50, 1e-12);
  const tb = C.Tb(x.r);
  x.rows.filter(function (r) { return r[0] >= x.r.tBoil + 20; }).forEach(function (r) { near(r[1], tb, 0.02); });
});
test('沒有回流：溶劑一直蒸發，沸點一直上升', function () {
  const x = runRec({ mode: 'b', solvent: 'benzene', solute: 'naph', w1: 50, w2: 6.4, chips: true, reflux: false, P: 120 }, 200);
  const a = x.rows.find(function (r) { return r[0] >= x.r.tBoil + 30; })[1], b = x.rows[x.rows.length - 1][1];
  assert.ok(b > a + 0.2, a + ' → ' + b);
  assert.ok(x.r.ws < 50);
});
test('過冷深度與晶種：沒攪拌的過冷比較深；高於凝固點時晶種無效，低於時立刻結晶', function () {
  const a = C.createRun({ mode: 'f', solvent: 'water', solute: 'glucose', w1: 50, w2: glu(0.5), stir: true, Tbath: -10 });
  const b = C.createRun({ mode: 'f', solvent: 'water', solute: 'glucose', w1: 50, w2: glu(0.5), stir: false, Tbath: -10 });
  assert.ok(b.depth > a.depth);
  while (!a.nucleated) C.step(a, 0.5);
  near(a.superDepth, a.depth, 0.06, '過冷到設定的深度才結晶');
  const s = C.createRun({ mode: 'f', solvent: 'water', solute: 'glucose', w1: 50, w2: glu(0.5), stir: false, Tbath: -10 });
  assert.strictEqual(C.seed(s), false, '室溫加晶種無效');
  while (s.T > C.Tf(s) - 0.3) C.step(s, 0.5);
  assert.strictEqual(C.seed(s), true);
  assert.ok(s.nucleated && s.seeded && s.superDepth < 0.6);
});
test('過熱與突沸：沒有沸石時過熱 2.5 + P/80 K 才沸騰（突沸）；有沸石時一到沸點就沸騰', function () {
  const a = C.createRun({ mode: 'b', solvent: 'water', solute: 'glucose', w1: 50, w2: 0, chips: false, reflux: true, P: 120 });
  while (!a.boiling) C.step(a, 0.2);
  assert.ok(a.bumped);
  near(a.superMax, 2.5 + 120 / 80, 0.1);
  const b = C.createRun({ mode: 'b', solvent: 'water', solute: 'glucose', w1: 50, w2: 0, chips: true, reflux: true, P: 120 });
  while (!b.boiling) C.step(b, 0.2);
  assert.ok(!b.bumped && b.superMax < 0.1);
});
test('外插法修正過冷：0.5 m 葡萄糖、沒攪拌、−20 °C 冷浴，外插誤差 < 2%，直接讀的誤差比較大', function () {
  const x = runRec({ mode: 'f', solvent: 'water', solute: 'glucose', w1: 50, w2: glu(0.5), stir: false, Tbath: -20 }, 90);
  const e = C.measure(x.r, x.rows, 'ext'), d = C.measure(x.r, x.rows, 'raw');
  assert.ok(Math.abs(e.err) < 0.02, '外插 ' + e.err);
  assert.ok(Math.abs(d.err) > Math.abs(e.err), '直接讀 ' + d.err);
  assert.ok(d.dT > e.dT, '直接讀的 ΔT 偏大（最高點已經被濃縮過）');
});
test('由 ΔT 反求莫耳質量：M = K·W2·1000 ÷ (ΔT·W1) 恰好還原', function () {
  const r = C.createRun({ mode: 'f', solvent: 'cyclohexane', solute: 'X', M: 217.3, w1: 40, w2: 1.5, Tbath: -5 });
  rel(C.molarMassFrom(r.sv.Kf, 1.5, 40, C.theory(r).dT), 217.3, 1e-12);
});
test('過原點直線：完全正比時斜率正確、R² = 1', function () {
  const f = C.fitOrigin([[0.1, 0.186], [0.5, 0.93], [1, 1.86]]);
  near(f.k, 1.86, 1e-12); near(f.r2, 1, 1e-12);
});
test('蒸氣壓：在正常沸點 P° = 101.325 kPa；溶液的溶劑莫耳分率（以粒子數）', function () {
  C.SOLVENT_KEYS.forEach(function (k) { near(C.vaporP(k, C.SOLVENTS[k].Tb), 101.325, 1e-9, k); });
  near(C.vaporP('water', 90), 70.1, 1.5, '水 90 °C 約 70 kPa');
  const r = C.createRun({ mode: 'b', solvent: 'water', solute: 'NaCl', w1: 100, w2: 5.844, P: 100 });
  near(C.solventMoleFrac(r), (100 / 18.015) / (100 / 18.015 + 1.9 * 0.1), 1e-12);
});
test('結冰到 60% 結束；沒有回流時溶劑蒸發一半停止', function () {
  const r = C.createRun({ mode: 'f', solvent: 'cyclohexane', solute: 'naph', w1: 30, w2: 0.5, stir: true, Tbath: -15 });
  while (!r.ended) C.step(r, 5);
  assert.strictEqual(r.endReason, 'frozen'); near(C.frozenFrac(r), 0.6, 0.01);
  const b = C.createRun({ mode: 'b', solvent: 'benzene', solute: 'naph', w1: 30, w2: 1, chips: true, reflux: false, P: 200 });
  while (!b.ended) C.step(b, 5);
  assert.strictEqual(b.endReason, 'dry'); near(C.lostFrac(b), 0.5, 0.01);
});
test('溶質質量的上限：已知溶質到 2.0 mol/kg；未知物只看溶劑質量（不洩漏 M）', function () {
  near(C.maxSoluteMass('water', 'glucose', 50), 18.01, 0.01);
  near(C.maxSoluteMass('water', 'X', 50, 100), C.maxSoluteMass('water', 'X', 50, 300), 0);
});
test('隨機未知物：莫耳質量 80–360 g/mol', function () {
  let s = 3; const rng = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let k = 0; k < 500; k++) { const u = C.newUnknown(rng); assert.ok(u.M >= 80 && u.M <= 360, u.M); }
});

console.log(passed + ' 項通過');
