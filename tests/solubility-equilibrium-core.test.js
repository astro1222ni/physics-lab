// 以 Node 執行：node tests/solubility-equilibrium-core.test.js
'use strict';
const assert = require('assert');
const S = require('../js/solubility-equilibrium-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`); }
function rel(a, b, tol, msg) { near(a / b, 1, tol, (msg || '') + `（${a} 對 ${b}）`); }
/** 由加入的試劑算各離子總莫耳數 */
function mix(list) {
  const N = {};
  list.forEach(function (x) {
    const src = S.SOLN[x[0]] || S.SOLID[x[0]];
    for (const i in src.ions) N[i] = (N[i] || 0) + src.ions[i] * x[1];
  });
  return N;
}
/** 檢查互補條件：有沉澱的 Q = Ksp，沒沉澱的 Q ≤ Ksp */
function checkKKT(r, tol) {
  Object.keys(r.p).forEach(function (k) {
    const lq = S.logQ(k, r.c), lk = Math.log10(S.SOLID[k].Ksp);
    if (r.p[k] > 0) near(lq, lk, tol || 1e-6, k + ' 有沉澱時 log Q = log Ksp');
    else assert.ok(lq <= lk + (tol || 1e-6), k + ' 沒沉澱時 Q ≤ Ksp：' + lq + ' > ' + lk);
  });
}

test('數據：Ksp（CRC）與莫耳質量', function () {
  near(S.SOLID.AgCl.Ksp, 1.77e-10, 0); near(S.SOLID.AgI.Ksp, 8.52e-17, 0); near(S.SOLID.Ag2CrO4.Ksp, 1.12e-12, 0);
  near(S.SOLID.PbI2.Ksp, 9.8e-9, 0); near(S.SOLID.BaSO4.Ksp, 1.08e-10, 0); near(S.SOLID.CaF2.Ksp, 3.45e-11, 0);
  near(S.SOLID.AgCl.M, 143.32, 0.01); near(S.SOLID.PbI2.M, 461.0, 0.1); near(S.SOLID.Ag2CrO4.M, 331.73, 0.01);
  near(S.SOLID.BaSO4.M, 233.38, 0.02);
});

test('純水中的莫耳溶解度：AB 型 s = √Ksp、AB2 型 s = (Ksp/4)^(1/3)、A2B 型同理', function () {
  rel(S.molarSolubility('AgCl'), Math.sqrt(1.77e-10), 1e-12);
  rel(S.molarSolubility('PbI2'), Math.cbrt(9.8e-9 / 4), 1e-12);
  rel(S.molarSolubility('Ag2CrO4'), Math.cbrt(1.12e-12 / 4), 1e-12);
  near(S.molarSolubility('AgCl'), 1.33e-5, 0.005e-5);
  // 「Ksp 比較小，溶解度卻比較大」：Ag2CrO4 的 Ksp 比 AgCl 小，莫耳溶解度卻大約 5 倍
  assert.ok(S.SOLID.Ag2CrO4.Ksp < S.SOLID.AgCl.Ksp);
  assert.ok(S.molarSolubility('Ag2CrO4') > 4 * S.molarSolubility('AgCl'));
});

test('把過量的固體加進純水：溶解的量 = 莫耳溶解度 × V，剩下的仍是固體', function () {
  ['AgCl', 'PbI2', 'Ag2CrO4', 'CaF2', 'BaSO4', 'CaSO4'].forEach(function (k) {
    const V = 0.1, s = S.molarSolubility(k), add = 20 * s * V + 1e-6;
    const r = S.equilibrate(mix([[k, add]]), V);
    rel(add - r.p[k], s * V, 1e-8, k + ' 溶解的量');
    checkKKT(r);
  });
});

test('固體太少時全部溶解，沒有沉澱', function () {
  const V = 0.1, s = S.molarSolubility('AgCl');
  const r = S.equilibrate(mix([['AgCl', 0.5 * s * V]]), V);
  near(r.p.AgCl, 0, 0);
  rel(r.c.Ag, 0.5 * s, 1e-12);
});

test('沉澱判斷：等體積混合 2×10⁻⁵ M AgNO3 與 NaCl，Q = (10⁻⁵)² < Ksp，不沉澱；改成 10⁻³ M 就沉澱', function () {
  let r = S.equilibrate(mix([['AgNO3', 2e-5 * 0.05], ['NaCl', 2e-5 * 0.05]]), 0.1);
  near(r.p.AgCl, 0, 0);
  rel(r.c.Ag, 1e-5, 1e-12);
  r = S.equilibrate(mix([['AgNO3', 1e-3 * 0.05], ['NaCl', 1e-3 * 0.05]]), 0.1);
  assert.ok(r.p.AgCl > 0);
  rel(r.c.Ag, Math.sqrt(1.77e-10), 1e-8, '等莫耳時 [Ag+] = [Cl−] = √Ksp');
  checkKKT(r);
});

test('同離子效應：0.10 M NaCl 中 AgCl 的溶解度 ≈ Ksp / 0.10（解析近似，誤差 < 10⁻⁶）', function () {
  const s = S.solubilityWithCommonIon('AgCl', 'Cl', 0.10);
  // 精確解：s(s + 0.1) = Ksp
  const exact = (-0.1 + Math.sqrt(0.01 + 4 * 1.77e-10)) / 2;
  rel(s, exact, 1e-7);
  rel(s, 1.77e-9, 1e-6);
  // PbI2 在 0.010 M KI 中：s (2s + 0.01)² = Ksp
  const sp = S.solubilityWithCommonIon('PbI2', 'I', 0.010);
  rel(sp * Math.pow(2 * sp + 0.01, 2), 9.8e-9, 1e-7);
});

test('質量守恆與電荷守恆：各離子溶液中＋沉澱中 = 加入的總量；溶液保持電中性', function () {
  const N = mix([['AgNO3', 3e-4], ['NaCl', 1e-4], ['KI', 1e-4], ['K2CrO4', 5e-5], ['PbNO32', 2e-4], ['Na2SO4', 1e-4]]);
  const r = S.equilibrate(N, 0.08);
  Object.keys(N).forEach(function (i) {
    let tot = r.n[i];
    Object.keys(r.p).forEach(function (k) { tot += (S.SOLID[k].ions[i] || 0) * r.p[k]; });
    rel(tot, N[i], 1e-10, i + ' 守恆');
  });
  near(S.chargeBalance(r.n) / 1e-4, 0, 1e-9, '溶液電中性');
  checkKKT(r);
});

test('分離沉澱：I− 與 Cl− 各 0.010 M，加 Ag+ 時 AgI 先沉澱；AgCl 開始沉澱時 [I−] 只剩 0.010 × Ksp(AgI)/Ksp(AgCl)', function () {
  const V = 0.1;
  const base = [['NaCl', 0.001], ['KI', 0.001]];
  // 加 0.9 mmol Ag+：只夠沉澱 I−
  let r = S.equilibrate(mix(base.concat([['AgNO3', 0.0009]])), V);
  near(r.p.AgCl, 0, 0); rel(r.p.AgI, 0.0009, 1e-9);
  checkKKT(r);
  // AgCl 剛開始沉澱的 [Ag+] = Ksp(AgCl)/0.010
  const agStart = 1.77e-10 / 0.010;
  rel(8.52e-17 / agStart, 0.010 * 8.52e-17 / 1.77e-10, 1e-12);
  // 加 1.5 mmol：AgI 幾乎全部、AgCl 一部分，兩者都飽和
  r = S.equilibrate(mix(base.concat([['AgNO3', 0.0015]])), V);
  assert.ok(r.p.AgCl > 0 && r.p.AgI > 0);
  rel(r.c.I / r.c.Cl, 8.52e-17 / 1.77e-10, 1e-6, '[I−]/[Cl−] = Ksp 比');
  checkKKT(r);
});

test('莫耳法：Cl− 與 CrO4 2− 共存，Ag2CrO4 在 AgCl 之後才出現；鉻酸根濃度 Ksp(Ag2CrO4)/Ksp(AgCl) M 時恰好在當量點出現', function () {
  const V = 0.05, nCl = 0.1 * 0.025; // 25 mL 0.1 M Cl−，稀釋到 50 mL
  const cr = 1.12e-12 / 1.77e-10;    // 約 6.3 × 10⁻³ M
  // 當量點時 [Ag+] = √Ksp(AgCl)，Q(Ag2CrO4) = Ksp(AgCl)·[CrO4]
  const r = S.equilibrate(mix([['NaCl', nCl], ['K2CrO4', cr * V], ['AgNO3', nCl * 0.999]]), V);
  near(r.p.Ag2CrO4 || 0, 0, 0, '當量點前不出現紅棕色');
  const r2 = S.equilibrate(mix([['NaCl', nCl], ['K2CrO4', cr * V], ['AgNO3', nCl * 1.001]]), V);
  assert.ok(r2.p.Ag2CrO4 > 0, '當量點後出現紅棕色');
  checkKKT(r2);
});

test('沉澱轉化：AgCl 沉澱中加入足量 I−，全部轉成 AgI（Ag 總量不變）', function () {
  const V = 0.1;
  let r = S.equilibrate(mix([['AgNO3', 1e-4], ['NaCl', 2e-4]]), V);
  assert.ok(r.p.AgCl > 0.99e-4);
  r = S.equilibrate(mix([['AgNO3', 1e-4], ['NaCl', 2e-4], ['KI', 1.2e-4]]), V, r.p);
  near(r.p.AgCl, 0, 0, 'AgCl 消失');
  rel(r.p.AgI, 1e-4, 1e-8);
  checkKKT(r);
});

test('加水稀釋：沉澱逐漸溶解，剛好全溶時的體積 = 總量 / 莫耳溶解度', function () {
  const n = 2e-5, s = S.molarSolubility('PbI2'), Vmin = n / s;
  let r = S.equilibrate(mix([['PbI2', n]]), 0.99 * Vmin);
  assert.ok(r.p.PbI2 > 0);
  r = S.equilibrate(mix([['PbI2', n]]), 1.01 * Vmin);
  near(r.p.PbI2, 0, 0);
});

test('從上一次的解出發，結果和從零開始相同', function () {
  const N = mix([['AgNO3', 2e-4], ['NaCl', 1e-4], ['KI', 5e-5], ['NaBr', 4e-5]]);
  const a = S.equilibrate(N, 0.1);
  const b = S.equilibrate(N, 0.1, { AgCl: 1e-5, AgI: 1e-6, AgBr: 3e-5 });
  Object.keys(a.p).forEach(function (k) { near(a.p[k], b.p[k], 1e-15 + 1e-9 * a.p[k], k); });
});

test('極端值：只加陰離子、只加陽離子、空的燒杯', function () {
  let r = S.equilibrate(mix([['NaCl', 1e-3]]), 0.1);
  assert.deepStrictEqual(Object.keys(r.p), []);
  r = S.equilibrate({}, 0.1);
  assert.deepStrictEqual(r.p, {});
  r = S.equilibrate(mix([['AgNO3', 1], ['NaCl', 1]]), 0.1);
  rel(r.p.AgCl, 1 - Math.sqrt(1.77e-10) * 0.1, 1e-12, '溶解的只有 √Ksp × V');
  checkKKT(r, 1e-5);
});

test('隨機混合 3000 次：都收斂，質量守恆、互補條件成立', function () {
  let seed = 12345;
  const rnd = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const keys = Object.keys(S.SOLN);
  for (let t = 0; t < 3000; t++) {
    const list = [];
    const m = 2 + Math.floor(rnd() * 5);
    for (let j = 0; j < m; j++) list.push([keys[Math.floor(rnd() * keys.length)], Math.pow(10, -7 + 5 * rnd())]);
    const N = mix(list), V = 0.01 + 0.2 * rnd();
    const r = S.equilibrate(N, V);
    Object.keys(N).forEach(function (i) {
      let tot = r.n[i];
      Object.keys(r.p).forEach(function (k) { tot += (S.SOLID[k].ions[i] || 0) * r.p[k]; });
      rel(tot, N[i], 1e-8, '第 ' + t + ' 次 ' + i + ' 守恆');
    });
    checkKKT(r, 1e-5);
  }
});

console.log(passed + ' 項通過');
