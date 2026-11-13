// 以 Node 執行：node tests/acid-base-titration-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/acid-base-titration-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`);
}
/** 決定性的亂數（每次測試結果相同） */
let seed = 20261112;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }

const SA = K.setup({ sys: 'sa', Ca: 0.1, Va: 25, Vw: 0, Cb: 0.1 });
const WA = K.setup({ sys: 'wa', Ca: 0.1, Va: 25, Vw: 0, Cb: 0.1 });
const WB = K.setup({ sys: 'wb', Ca: 0.1, Va: 25, Vw: 0, Cb: 0.1 });

// ---------------- 常數與參數 ----------------
test('常數：Kw = 1.0e-14、醋酸 Ka = 1.8e-5、氨 Kb = 1.8e-5、一滴 0.05 mL、滴定管 50 mL', function () {
  assert.strictEqual(K.KW, 1.0e-14);
  assert.strictEqual(K.KA_HAC, 1.8e-5);
  assert.strictEqual(K.KB_NH3, 1.8e-5);
  assert.strictEqual(K.DROP_ML, 0.05);
  assert.strictEqual(K.UNIT_ML * K.UNITS_PER_ML, 1);
  assert.strictEqual(K.BURETTE_UNITS, 2000);
  assert.strictEqual(WA.Ka, 1.8e-5);
  assert.strictEqual(WB.Kb, 1.8e-5);
  assert.strictEqual(K.direction('sa'), 1);
  assert.strictEqual(K.direction('wb'), -1);
});

// ---------------- 強酸強鹼 ----------------
test('強酸強鹼：當量點 pH = 7.00（任何濃度與體積都一樣）', function () {
  near(K.pH(SA, 25), 7, 1e-9, '0.1 M');
  for (let i = 0; i < 60; i++) {
    const p = K.setup({ sys: 'sa', Ca: Math.pow(10, -4 + 4 * rnd()), Va: 5 + 45 * rnd(), Vw: 100 * rnd(), Cb: Math.pow(10, -4 + 4 * rnd()) });
    near(K.pH(p, K.Veq(p)), 7, 1e-6, JSON.stringify(p));
  }
});
test('強酸強鹼：起點 pH = 1.00，當量點前後與解析式相符（過量的 H+ 或 OH- 遠大於 1e-7 M 時）', function () {
  near(K.pH(SA, 0), 1, 1e-9);
  [0, 5, 10, 20, 24, 24.9, 24.99].forEach(function (v) { near(K.pH(SA, v), K.approx.strongBefore(SA, v), 2e-5, 'V = ' + v); });
  [25.01, 25.1, 26, 30, 40, 50].forEach(function (v) { near(K.pH(SA, v), K.approx.strongAfter(SA, v), 2e-5, 'V = ' + v); });
  near(K.pH(SA, 50), 14 + Math.log10(0.1 * 25 / 75), 1e-6);
});
test('強酸強鹼：當量點前後各半滴（±0.1%），pH 從 4.30 跳到 9.70；各一滴則是 4.00 到 10.00（0.1 M、25 mL）', function () {
  near(K.pH(SA, 24.975), 4.30, 0.005);
  near(K.pH(SA, 25.025), 9.70, 0.005);
  near(K.pH(SA, 24.95), 4.00, 0.005);
  near(K.pH(SA, 25.05), 10.00, 0.005);
});

// ---------------- 弱酸強鹼 ----------------
test('弱酸強鹼：半當量點 pH ≈ pKa = 4.74', function () {
  const pKa = -Math.log10(1.8e-5);
  near(K.pKaOf(WA), pKa, 1e-12);
  near(K.pH(WA, 12.5), pKa, 0.002);
  near(K.pH(WA, 12.5), 4.745, 0.001);
  // 越濃的弱酸，半當量點越接近 pKa（偏差約 [H+]/C）
  const P1 = K.setup({ sys: 'wa', Ca: 1, Va: 25, Vw: 0, Cb: 1 });
  near(K.pH(P1, 12.5), pKa, 1e-4);
});
test('弱酸強鹼：起點與二次式解、緩衝區與亨德森公式、當量點與水解公式相符', function () {
  near(K.pH(WA, 0), K.approx.weakAcidStart(WA), 1e-4);
  near(K.pH(WA, 0), 2.88, 0.01);
  // 亨德森公式忽略了弱酸自己解離的 [H+]：[H+] 遠小於 [HA] 與 [A-] 時（中和 20%–96%）才準
  [5, 7.5, 10, 12.5, 15, 20, 22.5, 24].forEach(function (v) { near(K.pH(WA, v), K.approx.henderson(WA, v), 0.0025, 'V = ' + v); });
  assert.ok(Math.abs(K.pH(WA, 1) - K.approx.henderson(WA, 1)) > 0.02, '中和不到 5% 時亨德森公式明顯不準');
  near(K.pHeq(WA), K.approx.weakAcidEq(WA), 1e-3);
  near(K.pHeq(WA), 8.72, 0.01);
  near(K.pH(WA, 30), 14 + Math.log10(0.1 * 5 / 55), 1e-3); // 過量 NaOH 主導
});
test('弱鹼強酸（氨＋鹽酸）：起點 11.13、半當量點 = 銨離子的 pKa 9.26、當量點 5.28', function () {
  near(K.pH(WB, 0), K.approx.weakBaseStart(WB), 1e-4);
  near(K.pH(WB, 0), 11.13, 0.01);
  near(K.pKaOf(WB), 14 + Math.log10(1.8e-5), 1e-9);
  near(K.pH(WB, 12.5), K.pKaOf(WB), 0.002);
  [5, 10, 15, 20].forEach(function (v) { near(K.pH(WB, v), K.approx.henderson(WB, v), 0.0025, 'V = ' + v); });
  near(K.pHeq(WB), K.approx.weakBaseEq(WB), 1e-3);
  near(K.pHeq(WB), 5.28, 0.01);
  near(K.pH(WB, 30), -Math.log10(0.1 * 5 / 55), 1e-3);
});

// ---------------- 極限情況 ----------------
test('極稀的溶液趨近中性：1e-8 M HCl 的 pH 是 6.98（不是 8）、1e-12 M 幾乎是 7.00', function () {
  const p8 = K.setup({ sys: 'sa', Ca: 1e-8, Va: 25, Vw: 0, Cb: 0.1 });
  near(K.pH(p8, 0), -Math.log10((1e-8 + Math.sqrt(1e-16 + 4e-14)) / 2), 1e-9);
  near(K.pH(p8, 0), 6.978, 0.001);
  near(K.pH(K.setup({ sys: 'sa', Ca: 1e-12, Va: 25, Vw: 0, Cb: 0.1 }), 0), 7, 1e-4);
  near(K.pH(K.setup({ sys: 'wa', Ca: 1e-12, Va: 25, Vw: 0, Cb: 0.1 }), 0), 7, 1e-4);
  near(K.pH(K.setup({ sys: 'wb', Ca: 1e-12, Va: 25, Vw: 0, Cb: 0.1 }), 0), 7, 1e-4);
  // 1e-8 M 的 NaOH（以極稀的鹼滴入純水的極限）：pH 7.02
  const pw = K.setup({ sys: 'sa', Ca: 0, Va: 25, Vw: 0, Cb: 1e-8 * 1e6 });
  near(K.pH(pw, 25e-6 / (1 - 1e-6)), 7.02, 0.01);
});
test('加水稀釋：當量點體積不變；強酸強鹼的當量點仍是 7.00；起點 pH 上升', function () {
  const D = K.setup({ sys: 'sa', Ca: 0.1, Va: 25, Vw: 75, Cb: 0.1 });
  near(K.Veq(D), 25, 1e-12);
  near(K.pH(D, 25), 7, 1e-9);
  near(K.pH(D, 0), 1 + Math.log10(4), 1e-6);
  const DW = K.setup({ sys: 'wa', Ca: 0.1, Va: 25, Vw: 75, Cb: 0.1 });
  near(K.Veq(DW), 25, 1e-12);
  assert.ok(K.pHeq(DW) < K.pHeq(WA), '稀釋後弱酸當量點 pH 較低（鹽較稀、水解較少）');
});
test('當量點體積 V = n/c = Ca·Va/Cb，而且就是滴定曲線最陡的地方（強酸強鹼）', function () {
  near(K.Veq(SA), 25, 1e-12);
  near(K.Veq(K.setup({ sys: 'sa', Ca: 0.12, Va: 20, Vw: 0, Cb: 0.08 })), 30, 1e-12);
  for (let k = 0; k < 20; k++) {
    const p = K.setup({ sys: ['sa', 'wa', 'wb'][k % 3], Ca: 0.02 + 0.2 * rnd(), Va: 10 + 30 * rnd(), Vw: 50 * rnd(), Cb: 0.05 + 0.2 * rnd() });
    const V = K.Veq(p);
    near(p.Cb * V, p.Ca * p.Va, 1e-12, '滴定液的物質的量 = 待測物的物質的量');
    // 數值找最陡處（每 0.0005 mL 一點）
    let best = 0, at = 0;
    for (let v = V - 0.5; v <= V + 0.5; v += 0.0005) {
      const s = K.pH(p, v + 0.00025) - K.pH(p, v - 0.00025);
      if (Math.abs(s) > best) { best = Math.abs(s); at = v; }
    }
    near(at, V, p.sys === 'sa' ? 0.001 : 0.02, p.sys + ' 最陡處');
  }
});

// ---------------- 守恆 ----------------
test('守恆：電荷平衡殘差極小、物質的量守恆（[HA] + [A-] = C、Na+ 與 Cl- 只被稀釋）', function () {
  for (let k = 0; k < 300; k++) {
    const sys = ['sa', 'wa', 'wb', 'mx'][k % 4];
    const ms = K.mysterySample(rnd);
    const p = K.setup({ sys, Ca: Math.pow(10, -4 + 4 * rnd()), Va: 5 + 45 * rnd(), Vw: 100 * rnd(), Cb: Math.pow(10, -4 + 4 * rnd()), Ka: ms.Ka });
    const Vb = 2 * K.Veq(p) * rnd();
    const t = K.totals(p, Vb), h = K.solveH(t), b = K.balance(t, h);
    assert.ok(b.residual < 1e-9, `${sys} 殘差 ${b.residual}`);
    const s = K.species(p, Vb);
    const C = p.Ca * p.Va / s.Vt;
    if (sys === 'wa' || sys === 'mx') near((s.HA + s.A) / C, 1, 1e-12, '酸的總量');
    if (sys === 'wb') near((s.NH3 + s.NH4) / C, 1, 1e-12, '氨的總量');
    if (sys !== 'wb') near(s.Na * s.Vt, p.Cb * Vb, 1e-12 * (1 + p.Cb * Vb), 'Na+');
    near(s.h * s.oh, K.KW, 1e-26, 'Kw');
    if (sys === 'wa') near(s.h * s.A / s.HA, p.Ka, p.Ka * 1e-9, 'Ka');
  }
});
test('pH 隨滴定液單調變化（NaOH 滴入一直上升、HCl 滴入一直下降）', function () {
  [SA, WA, WB].forEach(function (p) {
    const d = K.direction(p.sys);
    let prev = K.pH(p, 0);
    for (let v = 0.05; v <= 50; v += 0.05) {
      const now = K.pH(p, v);
      assert.ok(d * (now - prev) > 0, p.sys + ' 在 ' + v.toFixed(2) + ' mL 沒有單調');
      prev = now;
    }
  });
});
test('局部混合：剛滴下時滴落處的 pH 介於瓶內與滴定液之間，混合越多越接近瓶內', function () {
  const bulk = K.pH(SA, 24.9), loc1 = K.localPH(SA, 24.9, 1, 0.05), loc5 = K.localPH(SA, 24.9, 5, 0.05);
  assert.ok(loc1 > loc5 && loc5 > bulk, `${bulk} < ${loc5} < ${loc1}`);
  assert.ok(loc1 < 13 && loc1 > 11, '0.05 mL 的 0.1 M NaOH 混入 1 mL：局部明顯偏鹼 ' + loc1);
  near(K.localPH(SA, 10, 1e9, 0.05), K.pH(SA, 10), 1e-6, '混合量很大時就是瓶內 pH');
});

// ---------------- 指示劑 ----------------
test('指示劑：pH = pKin 時兩種型各半；變色範圍與顏色方向正確', function () {
  Object.keys(K.INDICATORS).forEach(function (k) {
    const I = K.INDICATORS[k];
    near(K.indicatorFraction(k, I.pKin), 0.5, 1e-12, k);
    assert.ok(I.lo < I.pKin && I.pKin < I.hi, k + ' 的 pKin 在變色範圍內');
    assert.ok(K.indicatorFraction(k, I.lo) < 0.31 && K.indicatorFraction(k, I.hi) > 0.75, k + ' 在範圍兩端已大致變色');
  });
  assert.strictEqual(K.indicatorFraction('none', 7), null);
  // 酚酞：酸性無色、鹼性粉紅（綠光被吸收）
  const c0 = K.indicatorRGB('php', 3), c1 = K.indicatorRGB('php', 12);
  assert.deepStrictEqual(c0, [255, 255, 255]);
  assert.ok(c1[1] < 100 && c1[0] > 200, '粉紅 ' + c1);
  const y = K.indicatorRGB('btb', 3), b = K.indicatorRGB('btb', 11);
  assert.ok(y[2] < 80 && y[0] > 200, '溴瑞香草酚藍酸型為黃 ' + y);
  assert.ok(b[0] < 60 && b[2] > 200, '溴瑞香草酚藍鹼型為藍 ' + b);
  const r = K.indicatorRGB('mo', 1), o = K.indicatorRGB('mo', 7);
  assert.ok(r[0] > 200 && r[1] < 60, '甲基橙酸型為紅 ' + r);
  assert.ok(o[0] > 200 && o[1] > 120 && o[2] < 60, '甲基橙鹼型為橙黃 ' + o);
});
test('選指示劑：變色範圍要包含當量點 pH（強酸 7.00 → 溴瑞香草酚藍、醋酸 8.72 → 酚酞、氨 5.28 → 甲基紅）', function () {
  assert.ok(K.covers('btb', K.pHeq(SA)) && !K.covers('php', K.pHeq(SA)));
  assert.ok(K.covers('php', K.pHeq(WA)) && !K.covers('mo', K.pHeq(WA)) && !K.covers('btb', K.pHeq(WA)));
  assert.ok(K.covers('mr', K.pHeq(WB)) && !K.covers('php', K.pHeq(WB)) && !K.covers('mo', K.pHeq(WB)));
  // 弱酸若用甲基橙：在當量點前很早就變色（還不到一半就以為滴完了）
  let v = 0; while (!K.changed('mo', K.pH(WA, 0), K.pH(WA, v))) v += 0.05;
  assert.ok(v < 12.5, '甲基橙在 ' + v.toFixed(2) + ' mL 就變色');
  // 酚酞：在 25.00 mL 前後 0.1 mL 內變色
  v = 0; while (!K.changed('php', K.pH(WA, 0), K.pH(WA, v))) v += 0.025;
  near(v, 25, 0.1, '酚酞在當量點附近變色');
});

test('變色判定用滴定指數 pT：0.100 M 強酸用甲基橙在 0.05 mL 內變色、變色時的 pH 落在範圍內；稀溶液時甲基橙明顯提早', function () {
  const ph0 = K.pH(SA, 0);
  ['php', 'mo', 'mr', 'btb'].forEach(function (ind) {
    let v = 0; while (!K.changed(ind, ph0, K.pH(SA, v))) v += 0.025;
    near(v, 25, 0.05, indName(ind) + ' 在當量點附近變色');
    const I = K.INDICATORS[ind];
    assert.ok(I.pT >= I.lo && I.pT <= I.hi, ind + ' 的 pT 在變色範圍內');
  });
  // 以前的規則（鹼型比例改變 0.15）讓甲基橙在 pH 2.72 就算變色；現在要到 pH 4.0
  assert.ok(!K.changed('mo', ph0, 2.72) && !K.changed('mo', ph0, 3.9) && K.changed('mo', ph0, 4.0));
  const SAd = K.setup({ sys: 'sa', Ca: 0.001, Va: 25, Vw: 0, Cb: 0.001 }), p0 = K.pH(SAd, 0);
  let v = 0; while (!K.changed('mo', p0, K.pH(SAd, v))) v += 0.025;
  assert.ok(v < 24, '0.001 M 時甲基橙在 ' + v.toFixed(2) + ' mL 就變色（太稀不適合）');
  // 反方向（以酸滴定鹼）：越過 pT 往下
  const WB0 = K.pH(WB, 0); v = 0; while (!K.changed('mr', WB0, K.pH(WB, v))) v += 0.025;
  near(v, 25, 0.05, '氨水用甲基紅');
});
function indName(k) { return K.INDICATORS[k].zh; }

// ---------------- 未知弱酸 ----------------
test('未知弱酸：濃度 0.050–0.150 M、pKa 4.00–6.00', function () {
  for (let i = 0; i < 500; i++) {
    const s = K.mysterySample(rnd);
    assert.ok(s.C >= 0.05 && s.C <= 0.15, 'C ' + s.C);
    const pKa = -Math.log10(s.Ka);
    assert.ok(pKa > 3.999 && pKa < 6.001, 'pKa ' + pKa);
    const p = K.setup({ sys: 'mx', Ca: s.C, Va: 25, Vw: 0, Cb: 0.1, Ka: s.Ka });
    near(K.pH(p, K.Veq(p) / 2), pKa, 0.02, '半當量點 ≈ pKa');
  }
});

console.log(`${passed} 項測試通過`);
