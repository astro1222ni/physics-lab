// 以 Node 執行：node tests/hess-law-core.test.js
'use strict';
const assert = require('assert');
const H = require('../js/hess-law-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`); }
function rel(a, b, tol, msg) { near(a / b, 1, tol, (msg || '') + `（${a} 對 ${b}）`); }
/** 暫時關掉散熱 */
function noLoss(fn) { const a = H.HA.lid, b = H.HA.open; H.HA.lid = 0; H.HA.open = 0; try { fn(); } finally { H.HA.lid = a; H.HA.open = b; } }
function runTo(s, tAdd, tEnd, h) { while (s.t < tEnd - 1e-9) { if (!s.added && s.t >= tAdd - 1e-9) H.add(s); H.step(s, h || 1); } return s; }
const NaOH = { mode: 'solid', solid: { kind: 'NaOH', mass: 2 }, liquid: { kind: 'water', V: 100 } };

test('數據：NaOH 溶解熱 −44.50、NH4NO3 +25.69（CRC）、中和熱 = ΔfH(H2O) − ΔfH(OH-) = −55.83（OpenStax 附錄 G）', function () {
  near(H.SOLIDS.NaOH.dH, -44.50, 0); near(H.SOLIDS.NH4NO3.dH, 25.69, 0);
  near(H.DH_NEUT, -285.83 - (-230.0), 1e-9);
  near(H.DH3, -100.33, 1e-9, '赫斯定律');
  // 交叉核對：NIST-JANAF ΔfH NaOH(s) = −425.93；OpenStax Na+(aq) −240.1、OH-(aq) −230.0 → −44.17，與 CRC 相差 < 0.5
  near(-240.1 - 230.0 - (-425.93), H.SOLIDS.NaOH.dH, 0.5);
  near(H.SOLIDS.NaOH.M, 22.98977 + 15.999 + 1.008, 0.002);
  near(H.SOLIDS.NH4NO3.M, 2 * 14.007 + 4 * 1.008 + 3 * 15.999, 0.002);
});
test('沒有散熱時，最後溫度恰好等於能量守恆的理想值（溶解、中和、熱水混合）', function () {
  noLoss(function () {
    [NaOH,
      { mode: 'solid', solid: { kind: 'NH4NO3', mass: 5 }, liquid: { kind: 'water', V: 80 } },
      { mode: 'solid', solid: { kind: 'NaOH', mass: 3 }, liquid: { kind: 'HCl', V: 100, c: 1 } },
      { mode: 'mix', mix: { cb: 1, Vb: 50, ca: 0.8, Va: 75 } },
      { mode: 'cal', cal: { Vc: 50, Vh: 70, Th: 65 } }].forEach(function (o) {
      const s = runTo(H.createRun(Object.assign({ Troom: 22 }, o)), 10, 2000, 1);
      near(s.T - 22, H.idealDT(s), 1e-9, o.mode);
      near(s.Tth, s.T, 1e-9, '溫度計跟上');
    });
  });
});
test('NaOH 2.00 g 溶於 100 mL 水：ΔT = 44500 × 0.0500 ÷ (102 × 4.18 + 18) ≈ 5.0 °C', function () {
  const s = H.createRun(NaOH);
  near(H.idealDT(s), 44500 * (2 / 39.997) / (102 * 4.18 + 18), 1e-9);
  near(H.idealDT(s), 5.01, 0.01);
});
test('中和：限量試劑決定放熱量（ξ = min(n酸, n鹼)）', function () {
  noLoss(function () {
    const a = runTo(H.createRun({ mode: 'mix', mix: { cb: 1, Vb: 50, ca: 2, Va: 50 } }), 0, 300);
    near(a.xi, 0.05, 1e-12, 'NaOH 限量');
    const b = runTo(H.createRun({ mode: 'mix', mix: { cb: 2, Vb: 50, ca: 0.5, Va: 50 } }), 0, 300);
    near(b.xi, 0.025, 1e-12, 'HCl 限量');
    near(H.reference(b).n, 0.025, 1e-12);
  });
});
test('NaOH 固體加入不足量的鹽酸：放熱 = 全部溶解熱 + 只有 n(HCl) 的中和熱，沒有單一參考值', function () {
  noLoss(function () {
    const s = H.createRun({ mode: 'solid', solid: { kind: 'NaOH', mass: 4 }, liquid: { kind: 'HCl', V: 50, c: 1 } });
    runTo(s, 0, 2000);
    const q = 44.5 * 1000 * (4 / 39.997) + 55.83 * 1000 * 0.05;
    near((s.T - s.Troom) * (H.C_W * 54 + H.C_CAL), q, 1e-6);
    near(s.xi, 0.05, 1e-12);
    assert.strictEqual(H.reference(s), null);
  });
  const ok = H.createRun({ mode: 'solid', solid: { kind: 'NaOH', mass: 2 }, liquid: { kind: 'HCl', V: 100, c: 1 } });
  near(H.reference(ok).dH, -100.33, 1e-9);
});
test('吸熱溶解（NH4NO3）溫度下降；加入前溫度保持室溫', function () {
  const s = H.createRun({ mode: 'solid', solid: { kind: 'NH4NO3', mass: 5 }, liquid: { kind: 'water', V: 100 }, Troom: 24 });
  H.step(s, 60);
  near(s.T, 24, 1e-12); near(H.reading(s), 24, 1e-12);
  H.add(s); H.step(s, 60);
  assert.ok(s.T < 24 - 2.5, 'T = ' + s.T);
});
test('牛頓冷卻：溫度差依 exp(−hA·t/C) 衰減（有杯蓋較慢）', function () {
  [true, false].forEach(function (lid) {
    const s = H.createRun(Object.assign({}, NaOH, { lid: lid }));
    s.T = s.Troom + 10; s.Tth = s.T;
    H.step(s, 600);
    const k = (lid ? H.HA.lid : H.HA.open) / H.heatCap(s);
    near(s.T - s.Troom, 10 * Math.exp(-k * 600), 1e-9);
  });
  assert.ok(H.HA.lid < H.HA.open);
});
test('溶解與混合的速率：一個時間常數後完成 1 − 1/e（攪拌 20 s、不攪拌 80 s；混合 2 s、10 s）', function () {
  [[true, 20], [false, 80]].forEach(function (a) {
    const s = H.add(H.createRun(Object.assign({}, NaOH, { stir: a[0] })));
    H.step(s, a[1]);
    rel(s.nDis, s.solid.n * (1 - Math.exp(-1)), 1e-9);
  });
  [[true, 2], [false, 10]].forEach(function (a) {
    const s = H.add(H.createRun({ mode: 'mix', stir: a[0], mix: { cb: 1, Vb: 50, ca: 1, Va: 50 } }));
    H.step(s, a[1]);
    rel(s.x, 1 - Math.exp(-1), 1e-9);
  });
});
test('溫度計：時間常數 4 s，讀數到 0.1 °C', function () {
  const s = H.createRun(NaOH);
  s.T = 30; s.Troom = 30; s.Tth = 20;
  H.step(s, 4);
  near(s.Tth, 30 - 10 * Math.exp(-1), 1e-9);
  near(H.reading(s), Math.round(s.Tth * 10) / 10, 1e-12);
  near(H.reading(s) * 10, Math.round(H.reading(s) * 10), 1e-9);
});
test('分析：直線外插、ΔH = −(cm + C)ΔT/n、卡計熱容量', function () {
  const rows = [];
  for (let t = 0; t <= 300; t += 2) rows.push([t, t <= 50 ? 20 : 26 - 0.002 * (t - 50)]);
  const A = H.analyze(rows, 50, 100, 300);
  near(A.T0, 20, 1e-12); near(A.dText, 6, 1e-9); assert.ok(A.exo);
  near(H.dHfrom(100, 18, 6.4, 0.05), -(418 + 18) * 6.4 / 0.05 / 1000, 1e-12);
  noLoss(function () {
    const s = runTo(H.createRun({ mode: 'cal', cal: { Vc: 50, Vh: 50, Th: 60 }, Troom: 20 }), 10, 300);
    near(H.calibC(50, 50, 60, 20, s.T), H.C_CAL, 1e-9);
  });
});
test('赫斯定律：理想溫差算出的 ΔH1 + ΔH2 = ΔH3', function () {
  const d = function (o) { const s = H.createRun(o); const r = H.reference(s); return H.dHfrom(H.finalMass(s), H.C_CAL, H.idealDT(s), r.n); };
  const h1 = d(NaOH), h2 = d({ mode: 'mix', mix: { cb: 1, Vb: 50, ca: 1, Va: 50 } }), h3 = d({ mode: 'solid', solid: { kind: 'NaOH', mass: 2 }, liquid: { kind: 'HCl', V: 100, c: 1 } });
  near(h1, -44.5, 1e-9); near(h2, -55.83, 1e-9); near(h3, -100.33, 1e-9);
  near(h1 + h2, h3, 1e-9);
});
test('真實的實驗（有散熱）：加蓋、攪拌、從最高點後擬合外插，中和熱誤差 < 0.5%、溶解熱 < 2%', function () {
  const go = function (o, ta, tb) {
    const s = H.createRun(o), rows = [];
    while (s.t < 600) { if (!s.added && s.t >= 60) H.add(s); H.step(s, 2); rows.push([s.t, H.reading(s)]); }
    const A = H.analyze(rows, 60, ta, tb), r = H.reference(s);
    return { raw: H.dHfrom(H.finalMass(s), H.C_CAL, A.dTraw, r.n) / r.dH - 1, ext: H.dHfrom(H.finalMass(s), H.C_CAL, A.dText, r.n) / r.dH - 1 };
  };
  const m = go({ mode: 'mix', mix: { cb: 1, Vb: 50, ca: 1, Va: 50 } }, 100, 300);
  assert.ok(Math.abs(m.ext) < 0.005, '中和 ' + m.ext);
  const s = go(NaOH, 150, 300);
  assert.ok(Math.abs(s.ext) < 0.02, '溶解 ' + s.ext);
  assert.ok(s.raw < -0.02, '只看最高溫度會低估 ' + s.raw);
});
test('未知固體：M 60–160 g/mol、ΔH 在 −60～−15 或 +12～+35 kJ/mol', function () {
  let a = 3; const r = function () { a = (a * 16807) % 2147483647; return a / 2147483647; };
  let exo = 0;
  for (let k = 0; k < 300; k++) {
    const u = H.newUnknown(r);
    assert.ok(u.M >= 60 && u.M <= 160);
    assert.ok((u.dH >= -60 && u.dH <= -15) || (u.dH >= 12 && u.dH <= 35), u.dH);
    if (u.dH < 0) exo++;
    near(H.SOLIDS.X.dH, u.dH, 0);
  }
  assert.ok(exo > 100 && exo < 200);
});

console.log(passed + ' 項通過');
