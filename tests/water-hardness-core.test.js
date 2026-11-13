// 以 Node 執行：node tests/water-hardness-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/water-hardness-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`); }
function rel(a, b, tol, msg) { near(a / b, 1, tol, (msg || '') + `（${a} 對 ${b}）`); }
const U = K.UNITS_PER_ML;
function water(mg) { const i = K.waterInfo(K.makeWater(mg)); return { Ca: i.c.Ca, Mg: i.c.Mg, H: i.H, Hca: i.Hca }; }
/** 指示劑第一次「純藍色」時加入的體積（mL） */
function blueAt(r) { for (let u = 0; u < r.Veq * U * 1.5 + 200; u++) { if (K.eqAt(r.p, r.nCa, r.nMg, u).rf <= K.BLUE_RF) return u / U; } return null; }

test('數據：EDTA pKa、log Kf(CaY) 10.65、log Kf(MgY) 8.79（Harris）；EBT 與 Ksp（Skoog、CRC）', function () {
  assert.deepStrictEqual(K.EDTA_PKA, [0.0, 1.5, 2.00, 2.69, 6.13, 10.37]);
  near(K.LOGKF.CaY, 10.65, 0); near(K.LOGKF.MgY, 8.79, 0);
  near(K.EBT.logMgIn, 7.0, 0); near(K.EBT.logCaIn, 5.4, 0);
  near(K.KSP.CaCO3, 3.36e-9, 0); near(K.KSP.MgCO3, 6.82e-6, 0); near(K.KSP.MgOH2, 5.61e-12, 0);
  near(K.MW.CaCO3, 40.078 + 12.011 + 3 * 15.999, 0.01);
  near(K.MW.Na2CO3, 2 * 22.990 + 12.011 + 3 * 15.999, 0.01);
});
test('α(Y4-)：pH 10 約 0.30（Harris 表 11-1 的 0.30）、pH 12 約 0.98；pH 很高時趨近 1', function () {
  near(K.alphaY(10), 0.30, 0.005);
  near(K.alphaY(12), 0.98, 0.005);
  near(K.alphaY(14), 1, 0.001);
  assert.ok(K.alphaY(7) < 1e-3);
});
test('EBT 三種游離型的比例加起來是 1；pH 10 主要是藍色的 HIn2-', function () {
  [6, 8, 10, 12].forEach(function (pH) { const f = K.ebtFractions(pH); near(f.H2In + f.HIn + f.In3, 1, 1e-12); });
  assert.ok(K.ebtFractions(10).HIn > 0.95);
  assert.ok(K.ebtFractions(12).In3 > 0.5);
});
test('硬度換算：40.08 mg/L 的 Ca2+ = 100.09 mg/L（以 CaCO3 計）；24.31 mg/L 的 Mg2+ 也是 100.09', function () {
  near(water({ Ca: 40.078 }).H, 100.09, 1e-9);
  near(water({ Mg: 24.305 }).H, 100.09, 1e-9);
  assert.strictEqual(K.classOf(50), 'soft'); assert.strictEqual(K.classOf(100), 'moderate');
  assert.strictEqual(K.classOf(150), 'hard'); assert.strictEqual(K.classOf(300), 'veryhard');
});
test('平衡解：Ca、Mg、EDTA、指示劑四個質量平衡都守恆（兩種模式、隨機組成）', function () {
  let s = 3; const rnd = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 200; i++) {
    const mode = i % 2 ? 'B' : 'A';
    const CaT = 3e-3 * rnd(), MgT = 2e-3 * rnd(), YT = 6e-3 * rnd(), InT = 1e-5;
    const e = K.solve(CaT, MgT, YT, InT, mode);
    near(e.Ca + e.CaY + e.CaIn, CaT, 1e-9 * Math.max(1e-3, CaT) + 1e-15, 'Ca');
    near(e.Mg + e.MgY + e.MgIn + e.MgSolid, MgT, 1e-9 + 1e-15, 'Mg');
    near(e.Y + e.CaY + e.MgY, YT, 1e-8 * YT + 1e-15, 'EDTA');
    near(e.In + e.CaIn + e.MgIn, InT, 1e-12, '指示劑');
    if (mode === 'B') assert.ok(e.Mg <= K.condK('B').mgSat * (1 + 1e-9), 'pH 12 的游離 Mg 不超過 Mg(OH)2 的飽和濃度');
  }
});
test('純 Ca2+ 的解析解（不加指示劑）：一半時 [Ca] = 剩下的 Ca；當量點 [Ca] = √(c/K′)；兩倍當量點 pCa = log K′', function () {
  const k = K.condK('A').kCaY, c = 1e-3;
  rel(K.solve(c, 0, c / 2, 0, 'A').Ca, c / 2, 1e-6);
  const e = K.solve(c, 0, c, 0, 'A');
  rel(e.Ca, Math.sqrt(c / k), 2e-3);
  near(-Math.log10(K.solve(c, 0, 2 * c, 0, 'A').Ca), Math.log10(k), 1e-6);
  // 沒有 EDTA 時都是游離的
  near(K.solve(c, 5e-4, 0, 0, 'A').Ca, c, 1e-15);
});
test('Ca 與 Mg 一起時，CaY 比 MgY 穩定 72 倍：EDTA 先抓 Ca（[Ca][MgY]/([CaY][Mg]) = K′Mg/K′Ca）', function () {
  const k = K.condK('A');
  const e = K.solve(2e-3, 1e-3, 1.5e-3, 0, 'A');
  rel(e.Ca * e.MgY / (e.CaY * e.Mg), k.kMgY / k.kCaY, 1e-6);
  assert.ok(e.CaY / 2e-3 > 0.6 && e.MgY / 1e-3 < 0.2, '加入的 EDTA 大部分給了 Ca');
  near(Math.log10(k.kCaY / k.kMgY), 10.65 - 8.79, 1e-9);
});
test('自來水（pH 10、EBT）：開始是酒紅色，當量點後 0.1 mL 內變成純藍色', function () {
  const S = K.createSession();
  const r = K.newRun(S, { mode: 'A', Va: 50, cE: 0.01, water: water(K.PRESETS.tap) });
  assert.ok(r.eq.rf > 0.9);
  const vb = blueAt(r);
  assert.ok(vb - r.Veq > 0 && vb - r.Veq <= 0.1, '藍色出現在 ' + vb + '，當量點 ' + r.Veq);
  rel(r.Veq, water(K.PRESETS.tap).H / 100.09 * 50 / 0.01 / 1000, 1e-9);
  // 顏色：開始紅光穿透多、結束藍光穿透多
  const T0 = K.transmit(r).T;
  r.u = Math.round((r.Veq + 0.5) * U); K.compute(r);
  const T1 = K.transmit(r).T;
  assert.ok(T0[0] > T0[1] && T1[2] > T1[0], '酒紅 → 藍');
});
test('只有 Ca 沒有 Mg 時，EBT 的終點提早又模糊；緩衝液加 Mg–EDTA 後終點準確', function () {
  const S = K.createSession(), w = { Ca: 2.0, Mg: 0, H: 200.18 };
  const a = K.newRun(S, { mode: 'A', Va: 50, cE: 0.01, water: w });
  const half = (function () { for (let u = 0; ; u++) if (K.eqAt(a.p, a.nCa, a.nMg, u).rf <= 0.5) return u / U; })();
  assert.ok(half < 0.95 * a.Veq, '一半變色時只滴了 ' + (half / a.Veq * 100).toFixed(1) + '%');
  assert.ok(blueAt(a) < a.Veq - 0.005 * a.Veq, '純藍色比當量點早');
  const b = K.newRun(S, { mode: 'A', mgEdta: true, Va: 50, cE: 0.01, water: w });
  near(b.Veq, a.Veq, 1e-12, 'Mg–EDTA 不改變當量點');
  assert.ok(Math.abs(blueAt(b) - b.Veq) <= 0.05, 'Mg–EDTA：藍色在 ' + blueAt(b) + '，當量點 ' + b.Veq);
});
test('pH 12（鈣指示劑）：Mg 沉澱成 Mg(OH)2，只滴定 Ca；終點和 nCa/c 相差不到半滴', function () {
  const S = K.createSession(), w = water(K.PRESETS.mineral);
  const r = K.newRun(S, { mode: 'B', Va: 50, cE: 0.01, water: w });
  rel(r.Veq, w.Ca * 50 / 0.01 / 1000, 1e-12);
  assert.ok(r.eq.MgSolid / (r.nMg / r.eq.V) > 0.9999, 'Mg 幾乎全部沉澱');
  assert.ok(K.transmit(r).turb > 0.5, '看得到白色混濁');
  assert.ok(Math.abs(blueAt(r) - r.Veq) <= 0.025);
  // 沒有 Ca 的水：一開始就是藍色
  const m = K.newRun(S, { mode: 'B', Va: 50, cE: 0.01, water: { Ca: 0, Mg: 1, H: 100 } });
  assert.ok(m.eq.rf < 0.01);
});
test('煮沸：暫時硬度變成水垢、留 0.13 mmol/L；Ca、Mg 的總量（水中＋水垢）守恆；蒸發讓永久硬度變濃', function () {
  const w = K.makeWater(K.PRESETS.ground), b = K.boil(w), i = K.waterInfo(b.w);
  near(b.w.V, 0.9, 1e-12);
  near(b.w.nCa + b.dCa, w.nCa, 1e-12); near(b.w.nMg + b.dMg, w.nMg, 1e-12);
  near(i.c.Ca + i.c.Mg, K.RESIDUAL_CACO3 + (w.nCa + w.nMg - w.nHCO3 / 2) / 0.9, 1e-9, '剩下的 = 永久硬度（濃縮）＋ 溶解度');
  near(b.w.nHCO3, w.nHCO3 - 2 * (b.dCa + b.dMg), 1e-12);
  // 只有永久硬度（沒有 HCO3-）：量不變，濃度變為 1/0.9 倍
  const p = K.makeWater({ Ca: 80 }), bp = K.boil(p);
  near(bp.dCa + bp.dMg, 0, 1e-15);
  rel(K.waterInfo(bp.w).H, K.waterInfo(p).H / 0.9, 1e-12);
  // 只有暫時硬度：Ca 先沉澱
  const t = K.boil(K.makeWater({ Ca: 20, Mg: 10, HCO3: 400 }));
  near(K.waterInfo(t.w).c.Ca, 0, 1e-12); near(K.waterInfo(t.w).c.Mg, K.RESIDUAL_CACO3, 1e-9);
});
test('洗滌鹼：恰好當量時剩下的 Ca = √Ksp；過量 c 時 [Ca] ≈ Ksp/c；MgCO3 溶解度大，Mg 留在水中；Na+ 增加 2 倍', function () {
  const w = K.makeWater({ Ca: 100, Mg: 20 }), nCa = w.nCa;
  const s = K.soda(w, nCa * K.MW.Na2CO3);
  rel(K.waterInfo(s.w).c.Ca / 1000, Math.sqrt(K.KSP.CaCO3), 2e-3);
  near(s.dMg, 0, 1e-15);
  rel(s.w.nNa - w.nNa, 2 * nCa, 1e-12);
  const x = K.soda(w, 500), cx = (x.w.nCO3) / 1000;
  rel(K.waterInfo(x.w).c.Ca / 1000, K.KSP.CaCO3 / cx, 1e-3);
  // Ksp 在沉澱後成立
  rel((x.w.nCa / 1000) * (x.w.nCO3 / 1000), K.KSP.CaCO3, 1e-6);
  // 鎂很多、碳酸根很多時 MgCO3 也會沉澱，兩個 Ksp 同時成立
  const m = K.soda(K.makeWater({ Ca: 40, Mg: 300 }), 3000), cc = m.w.nCO3 / 1000;
  assert.ok(m.dMg > 0);
  rel((m.w.nCa / 1000) * cc, K.KSP.CaCO3, 1e-6);
  rel((m.w.nMg / 1000) * cc, K.KSP.MgCO3, 1e-6);
});
test('離子交換：Na+ 增加 = 2 × 除去的 Ca2+ 與 Mg2+；容量用完時 Ca 先被抓住、Mg 先漏出；再生回滿', function () {
  const w = K.makeWater(K.PRESETS.ground), r = K.resinPass(w, K.makeResin());
  rel(r.w.nNa - w.nNa, 2 * (r.dCa + r.dMg), 1e-12);
  near(K.waterInfo(r.w).H, K.waterInfo(w).H * K.RESIN_LEAK, 1e-9);
  const tired = { left: 3.0, Ca: 2, Mg: 0 };
  const q = K.resinPass(w, tired);
  near(q.r.left, 0, 1e-12);
  near(q.dCa, w.nCa * (1 - K.RESIN_LEAK), 1e-12);
  near(q.dMg, 3.0 - q.dCa, 1e-12);
  assert.ok(K.waterInfo(q.w).mg.Mg > 5 && K.waterInfo(q.w).mg.Ca < 0.5);
  const B = K.createBench();
  K.benchSet(B, 'ground'); K.benchResin(B); K.benchSet(B, 'ground');
  const d = K.benchResin(B);
  assert.ok(d.leak && B.leakSeen);
  K.benchRegen(B);
  near(B.resin.left, K.RESIN_Q, 0); assert.ok(B.regenAfterLeak);
});
test('肥皂試驗：need 滴之前沒有持久泡沫、need 滴時有；浮渣的金屬 = 2 : 1；合成清潔劑不沉澱', function () {
  [[0, 0], [0.9, 0.35], [2.5, 0.9], [0.2, 0.06]].forEach(function (c) {
    const n = K.soapTest(c[0], c[1], 1, false).need;
    assert.ok(n >= 1);
    if (n > 1) assert.ok(!K.soapTest(c[0], c[1], n - 1, false).lather);
    const t = K.soapTest(c[0], c[1], n, false);
    assert.ok(t.lather);
    near(t.ppt, Math.min(t.nM, t.nS / 2), 1e-12);
    near(t.free + 2 * t.ppt, t.nS, 1e-12);
  });
  assert.strictEqual(K.soapTest(0, 0, 1, false).need, 1, '蒸餾水一滴就起泡');
  const d = K.soapTest(2.5, 0.9, 1, true);
  assert.ok(d.lather && d.ppt === 0, '合成清潔劑在硬水裡第一滴就起泡');
});
test('滴定紀錄：體積以半滴計；由終點算出的硬度 = V × c × 100.09 × 1000 / Va', function () {
  const S = K.createSession(), w = water(K.PRESETS.tap);
  const r = K.newRun(S, { mode: 'A', Va: 50, cE: 0.01, water: Object.assign({ bottle: 1, step: 0 }, w) });
  const n = Math.round(r.Veq * U) + 2;
  for (let i = 0; i < n; i++) { K.release(S, 1); K.land(S, 1); }
  const d = K.endpoint(S, true);
  near(d.Vend, n / U, 1e-12);
  near(d.Hmeas, d.Vend * 0.01 / 50 * 100.09 * 1000, 1e-9);
  near(d.err, d.Vend - r.Veq, 1e-12);
  // 滴定管 50 mL 用完就放不出來
  r.fill = K.BURETTE_UNITS;
  assert.strictEqual(K.release(S, 2), 0);
});
test('未知水樣：答案的相對誤差；換瓶後舊曲線留著（最多 4 條）', function () {
  let s = 9; const S = K.createSession(function () { s = (s * 16807) % 2147483647; return s / 2147483647; });
  const smp = K.newSample(S);
  assert.ok(smp.H > 100 && smp.Hca > 0);
  const a = K.answer(S, smp.H * 1.01, smp.Hca);
  near(a.errH, 0.01, 1e-12); near(a.errCa, 0, 1e-12);
  for (let i = 0; i < 7; i++) { K.newRun(S, { water: { Ca: 1, Mg: 0 } }); K.release(S, 2); K.land(S, 2); }
  assert.ok(S.runs.length === 4);
});

console.log(process.exitCode ? '\n有測試沒通過。' : '\n全部 ' + passed + ' 項通過。');
