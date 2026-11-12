// 以 Node 執行：node tests/electrochemistry-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/electrochemistry-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`); }
function rel(a, b, tol, msg) { near(a / b, 1, tol, (msg || '') + `（${a} 對 ${b}）`); }
const M = C.METALS;
const real = ['Mg', 'Zn', 'Fe', 'Ni', 'Sn', 'Pb', 'Cu', 'Ag'];

test('常數：F = N_A·e、RT ln10 / F = 0.05916 V、25 °C 的莫耳體積 24.47 L/mol', function () {
  near(C.F, 6.02214076e23 * 1.602176634e-19, 1e-5);
  near(C.KN, 0.059159, 2e-6);
  near(C.VM, 24.465, 0.002);
});
test('標準還原電位與 OpenStax 附錄 L 一致', function () {
  const tab = { Mg: -2.372, Zn: -0.7618, Fe: -0.447, Ni: -0.257, Sn: -0.1375, Pb: -0.1262, Cu: 0.337, Ag: 0.7996 };
  Object.keys(tab).forEach(function (k) { near(M[k].E, tab[k], 0, k); });
  near(C.E_O2, 1.229, 0);
});
test('原子量（IUPAC）與價數', function () {
  near(M.Cu.M, 63.546, 1e-9); near(M.Zn.M, 65.38, 1e-9); near(M.Ag.M, 107.8682, 1e-9); near(M.Mg.M, 24.305, 1e-9);
  assert.strictEqual(M.Ag.z, 1); assert.strictEqual(M.Cu.z, 2);
});
test('丹尼爾電池（Zn｜Cu，1 M）= 1.0988 V；鎂銀電池 3.17 V', function () {
  near(C.emf({ metal: 'Zn', c: 1 }, { metal: 'Cu', c: 1 }), 1.0988, 1e-9);
  near(C.stdEmf('Mg', 'Ag'), 3.1716, 1e-9);
  near(C.emf({ metal: 'Cu', c: 1 }, { metal: 'Zn', c: 1 }), -1.0988, 1e-9, '左右對調讀數變號');
});
test('能斯特方程式：各電極電位的差 = E° − (0.05916/n)·log Q（含 1 價與 2 價混合）', function () {
  let k = 0;
  real.forEach(function (a) {
    real.forEach(function (b) {
      [[1, 1], [0.01, 2], [1.5, 0.003], [0.2, 0.05]].forEach(function (cc) {
        const L = { metal: a, c: cc[0] }, R = { metal: b, c: cc[1] };
        const n = C.nOf(a, b);
        near(C.emf(L, R), C.stdEmf(a, b) - C.KN / n * C.logQ(L, R), 1e-12, a + '|' + b);
        k++;
      });
    });
  });
  assert.strictEqual(C.nOf('Zn', 'Ag'), 2);
  assert.strictEqual(C.nOf('Ag', 'Ag'), 1);
  assert.ok(k === 256);
});
test('濃度每差 10 倍：二價電極電位差 29.6 mV、一價 59.2 mV（濃差電池）', function () {
  near(C.emf({ metal: 'Cu', c: 0.01 }, { metal: 'Cu', c: 0.1 }), 0.029580, 1e-6);
  near(C.emf({ metal: 'Ag', c: 0.01 }, { metal: 'Ag', c: 0.1 }), 0.059159, 1e-6);
  near(C.emf({ metal: 'Cu', c: 0.5 }, { metal: 'Cu', c: 0.5 }), 0, 1e-15);
});
test('法拉第定律：96485 C 析出 1/2 mol 銅（31.773 g）、1 mol 銀', function () {
  rel(C.massOf('Cu', C.F), 63.546 / 2, 1e-12);
  rel(C.massOf('Ag', C.F), 107.8682, 1e-12);
  rel(C.massOf('Cu', 1 * 3036), 1.0000, 3e-4, '1 A × 3036 s 約 1.000 g 銅');
});
test('伏特計或沒有鹽橋：電流為 0，放著不會改變', function () {
  const s = C.createCell({ L: { metal: 'Zn', c: 1 }, R: { metal: 'Cu', c: 1 }, bridge: false, load: 'R', Rload: 10 });
  assert.strictEqual(C.current(s), 0);
  C.stepCell(s, 1e5);
  assert.strictEqual(s.L.c, 1); assert.strictEqual(s.q, 0);
  s.bridge = true; s.load = 'V';
  assert.strictEqual(C.current(s), 0);
});
test('放電：電荷、質量、濃度依法拉第定律守恆（鋅溶解＝銅析出的莫耳數）', function () {
  const s = C.createCell({ L: { metal: 'Zn', c: 1, V: 0.1 }, R: { metal: 'Cu', c: 1, V: 0.1 }, bridge: true, load: 'R', Rload: 5, rint: 5 });
  near(C.current(s), 1.0988 / 10, 1e-12);
  C.stepCell(s, 5000);
  assert.ok(s.q > 0);
  const nE = s.q / C.F;
  rel(10 - s.L.m, nE / 2 * M.Zn.M, 1e-9, '鋅的減少');
  rel(s.R.m - 10, nE / 2 * M.Cu.M, 1e-9, '銅的增加');
  rel(s.L.c - 1, nE / 2 / 0.1, 1e-9, 'Zn²⁺ 增加');
  rel(1 - s.R.c, nE / 2 / 0.1, 1e-9, 'Cu²⁺ 減少');
  // 電壓下降與能斯特一致
  near(C.emf(s.L, s.R), 1.0988 - C.KN / 2 * Math.log10(s.L.c / s.R.c), 1e-12);
});
test('放電一段時間的電量 ≈ ∫I dt（和小步長的數值積分比較）', function () {
  const o = { L: { metal: 'Zn', c: 0.5, V: 0.05 }, R: { metal: 'Cu', c: 0.2, V: 0.05 }, bridge: true, load: 'R', Rload: 1, rint: 5 };
  const a = C.createCell(o), b = C.createCell(o);
  C.stepCell(a, 3e5);
  for (let k = 0; k < 300000; k++) { const I = C.current(b); C.transfer(b, I * 1); b.t += 1; }
  rel(a.q, b.q, 2e-3);
});
test('放到底：陰極離子用完時電流趨近 0、濃度不會變負', function () {
  const s = C.createCell({ L: { metal: 'Zn', c: 1, V: 0.05 }, R: { metal: 'Cu', c: 0.05, V: 0.05 }, bridge: true, load: 'R', Rload: 1, rint: 5 });
  C.stepCell(s, 1e7);
  assert.ok(s.R.c >= 0 && s.R.c < 1e-6, '剩下 ' + s.R.c);
  rel(s.q, 0.05 * 0.05 * 2 * C.F, 1e-4, '總電量 = 2F × 銅離子的莫耳數');
  assert.ok(Math.abs(C.current(s)) < 1e-3 * 1.0988 / 6);
});
test('陽極金屬用完就停（不會出現負的質量）', function () {
  const s = C.createCell({ L: { metal: 'Mg', c: 1, V: 0.25, m: 0.01 }, R: { metal: 'Ag', c: 1, V: 0.25 }, bridge: true, load: 'R', Rload: 1, rint: 1 });
  C.stepCell(s, 1e6);
  assert.ok(s.L.m >= 0 && s.L.m < 1e-9, 'Mg 剩 ' + s.L.m);
  rel(s.q, 0.01 / M.Mg.M * 2 * C.F, 1e-9);
  assert.strictEqual(C.current(s), 0);
});
test('濃差電池放電：兩杯濃度趨於相等、電壓趨近 0，金屬總量守恆', function () {
  const s = C.createCell({ L: { metal: 'Cu', c: 0.001, V: 0.1 }, R: { metal: 'Cu', c: 1, V: 0.1 }, bridge: true, load: 'R', Rload: 1, rint: 5 });
  near(C.emf(s.L, s.R), C.KN / 2 * 3, 1e-12);
  const tot0 = s.L.c + s.R.c, m0 = s.L.m + s.R.m;
  C.stepCell(s, 2e7);
  near(s.L.c + s.R.c, tot0, 1e-12, '離子總量');
  near(s.L.m + s.R.m, m0, 1e-9, '金屬總量');
  assert.ok(Math.abs(C.emf(s.L, s.R)) < 1e-4, '剩下 ' + C.emf(s.L, s.R));
  assert.ok(s.R.c >= s.L.c - 1e-9, '不會衝過頭');
});
test('電解（石墨）：析出銅 = It·M/(2F)、氧氣 = It/(4F)、H⁺ = It/F', function () {
  const s = C.createElectro({ metal: 'Cu', c: 0.5, V: 0.2, elec: 'C', I: 1 });
  C.stepElectro(s, 3600);
  const q = 3600;
  near(s.q, q, 1e-6);
  // 銅離子還很多（0.1 mol），效率 > 99%
  rel(s.dep, C.massOf('Cu', q), 0.01);
  rel(s.nO2, q / (4 * C.F), 1e-9);
  rel(s.nH + 2 * s.nH2, q / C.F, 1e-9, 'H⁺ 產生量（扣掉被還原成 H2 的）');
  rel(s.dep / M.Cu.M * 2 + 2 * s.nH2, q / C.F, 1e-9, '陰極的電子 = 析出銅 + 產生氫');
  near(0.5 - s.c, s.dep / M.Cu.M / 0.2, 1e-12, 'Cu²⁺ 減少');
});
test('電解（銅電極）：陽極減少 = 陰極增加，溶液濃度不變（電解精煉）', function () {
  const s = C.createElectro({ metal: 'Cu', c: 0.5, V: 0.2, elec: 'Cu', I: 2 });
  C.stepElectro(s, 2000);
  rel(10 - s.mAnode, s.mCath - 10, 2e-3);
  near(s.c, 0.5, 2e-3);
  rel(s.mCath - 10, C.massOf('Cu', 4000), 3e-3);
});
test('電解（銅電極）：陽極的銅用完就停，質量不會變負', function () {
  const s = C.createElectro({ metal: 'Cu', c: 1, V: 0.5, elec: 'Cu', I: 2 });
  C.stepElectro(s, 1e6);
  assert.ok(s.spent, '應該停止');
  assert.strictEqual(s.mAnode, 0);
  rel(s.q, 10 / M.Cu.M * 2 * C.F, 1e-6, '總電量 = 10 g 銅的電子');
  near(s.t, 1e6, 1e-6);
});
test('電解到銅離子用完：藍色褪去，陰極改冒氫氣（電子總數守恆）', function () {
  const s = C.createElectro({ metal: 'Cu', c: 0.05, V: 0.1, elec: 'C', I: 1 });
  C.stepElectro(s, 20000);
  assert.ok(s.c < 0.003, '剩下 ' + s.c);
  rel(s.nH2, (20000 / C.F - s.dep / M.Cu.M * 2) / 2, 1e-9, '其餘電子都產生氫氣');
  assert.ok(s.nH2 > 0.09, '氫氣 ' + s.nH2);
  near(s.q, 20000, 1e-6, '電量全部算到');
  rel(s.dep / M.Cu.M * 2 + 2 * s.nH2, 20000 / C.F, 1e-9);
  assert.ok(s.dep <= 0.05 * 0.1 * M.Cu.M + 1e-12);
});
test('未知金屬：E° 在 −1.2～+0.7 V、取到 mV；電解用的未知金屬都是二價', function () {
  let a = 1;
  const r = function () { a = (a * 16807) % 2147483647; return a / 2147483647; };
  for (let k = 0; k < 200; k++) {
    const E = C.newUnknownE(r);
    assert.ok(E >= -1.2 && E <= 0.7);
    near(E * 1000, Math.round(E * 1000), 1e-9);
    const m = C.newUnknownMetal(r);
    assert.ok(C.UNK_M.indexOf(m) >= 0 && M[m].z === 2);
  }
});
test('能斯特圖：E 對 log Q 的直線斜率 = −0.05916/n', function () {
  const rows = [0.001, 0.01, 0.1, 1].map(function (c) { const L = { metal: 'Zn', c: 1 }, R = { metal: 'Cu', c: c }; return { x: C.logQ(L, R), y: C.emf(L, R) }; });
  const f = C.fitLine(rows);
  near(f.b, -C.KN / 2, 1e-12); near(f.a, 1.0988, 1e-12); near(f.r2, 1, 1e-12);
});

console.log(passed + ' 項通過');
