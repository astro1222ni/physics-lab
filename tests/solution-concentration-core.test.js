// 以 Node 執行：node tests/solution-concentration-core.test.js
'use strict';
const assert = require('assert');
const S = require('../js/solution-concentration-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`); }
function rel(a, b, tol, msg) { near(a / b, 1, tol, (msg || '') + `（${a} 對 ${b}）`); }
/** 照正確步驟配一瓶：秤量 → 溶解 → 冷卻 → 移入 → 洗 n 次 → 加水到瓶頸 → 滴到刻度線（平視）→ 搖勻 */
function goodWeigh(solid, mass, Vf, rinses, opts) {
  opts = opts || {};
  const P = S.newPrep({ mode: 'weigh', solid: solid, mass: mass, Vf: Vf, target: opts.target || 0.1, flaskWet: opts.wet });
  assert.ok(S.dissolve(P).ok, '溶解');
  if (!opts.hot) S.cool(P);
  assert.ok(S.transfer(P).ok, '移入');
  for (let i = 0; i < rinses; i++) assert.ok(S.rinse(P).ok, '洗燒杯');
  fill(P, opts.eye || 0);
  assert.ok(S.shake(P).ok, '搖勻');
  return P;
}
function fill(P, eye) {
  S.pourToNeck(P, eye);
  const half = S.DROP * 1000 / (Math.PI * P.g.rn * P.g.rn) / 2;
  while (S.apparent(P, eye) < -half) S.addWater(P, S.DROP, eye);
}

test('莫耳質量：由原子量算（IUPAC）', function () {
  near(S.SOLIDS.NaCl.M, 22.990 + 35.45, 0.01);
  near(S.SOLIDS.NaOH.M, 22.990 + 15.999 + 1.008, 0.01);
  near(S.SOLIDS.CuSO4.M, 63.546 + 32.06 + 4 * 15.999, 0.01);
  near(S.SOLIDS['CuSO4-5H2O'].M, S.SOLIDS.CuSO4.M + 5 * S.M_H2O, 0.01, '五水硫酸銅 = 無水 + 5 H2O');
});
test('密度表（CRC，20 °C）抽查與單調性；0% 是純水', function () {
  near(S.rho('NaCl', 0.10), 1.0707, 1e-9); near(S.rho('NaCl', 0.20), 1.1478, 1e-9);
  near(S.rho('NaOH', 0.10), 1.1089, 1e-9); near(S.rho('NaOH', 0.40), 1.4299, 1e-9);
  near(S.rho('CuSO4', 0.10), 1.1070, 1e-9);
  ['NaCl', 'NaOH', 'CuSO4'].forEach(function (sp) {
    near(S.rho(sp, 0), S.RHO_W, 1e-9);
    let last = 0;
    for (let w = 0; w <= S.SPECIES[sp].sat / 100; w += 0.001) { const r = S.rho(sp, w); assert.ok(r > last, sp + ' 密度要隨濃度增加'); last = r; }
  });
  near(S.rhoWater(4), 0.99997, 0.0001); near(S.volFactor(20), 1, 1e-12);
  assert.ok(S.volFactor(40) > 1.005 && S.volFactor(40) < 1.007, '20 → 40 °C 水膨脹約 0.6%');
});
test('濃度換算：C = 1000ρw/M、m = 1000w/((1−w)M)、極稀時 C ≈ ρ水·m', function () {
  const p = S.props('NaCl', 0.10);
  near(p.C, 1000 * 1.0707 * 0.10 / 58.44, 1e-9);
  near(p.m, 1000 * 0.10 / (0.9 * 58.44), 1e-9);
  near(p.gL, 107.07, 1e-9); near(p.ppm, 1e5, 1e-6);
  const d = S.props('CuSO4', 1e-6);
  rel(d.C, S.RHO_W * d.m, 1e-5, '極稀');
  near(d.ppmCu, 1e-6 * 1e6 * 63.546 / 159.60, 1e-9);
  // 互為反函數
  ['NaCl', 'NaOH', 'CuSO4'].forEach(function (sp) {
    [0.01, 0.1, 0.5, 1].forEach(function (C) { if (C < S.props(sp, S.SPECIES[sp].sat / 100).C) rel(S.props(sp, S.wFromC(sp, C)).C, C, 1e-9); });
    near(S.props(sp, S.wFromMolal(sp, 1)).m, 1, 1e-9);
  });
  // 課本常見數值：1.00 M NaCl 約 5.6%；10% NaOH 約 2.77 M
  near(S.wFromC('NaCl', 1) * 100, 5.63, 0.01);
  near(S.props('NaOH', 0.10).C, 2.772, 0.001);
});
test('m 與 M 的關係：ρ(1 − w) = 1 g/mL 時兩者相等（NaOH 約 7.9%）；NaCl、CuSO4 一定 m > M', function () {
  let lo = 0.05, hi = 0.12;
  const f = function (w) { const p = S.props('NaOH', w); return p.m - p.C; };
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid; }
  near(S.rho('NaOH', lo) * (1 - lo), 1, 1e-6);
  near(lo * 100, 7.9, 0.2);
  ['NaCl', 'CuSO4'].forEach(function (sp) { for (let w = 0.001; w < S.SPECIES[sp].sat / 100; w += 0.001) { const p = S.props(sp, w); assert.ok(p.m > p.C, sp); } });
});
test('量瓶幾何：刻度線以下容積 = 標示體積；高度與容積互為反函數；瓶頸每 mm 的容積 = πr²', function () {
  [50, 100, 250, 500].forEach(function (Vf) {
    const g = S.geom(Vf);
    rel(g.volAt(g.zMark), Vf * 1000, 1e-9, Vf + ' mL');
    [0.1, 0.5, 0.9].forEach(function (f) { near(g.volAt(g.zAt(f * Vf * 1000)), f * Vf * 1000, 1e-3); });
    near(g.volAt(g.zMark + 1) - g.volAt(g.zMark), Math.PI * g.rn * g.rn, 1e-6);
    assert.ok(g.Vtop > Vf * 1000 * 1.02, '瓶頸上方還有空間');
    near(g.r(g.zt - 1e-9), g.rn, 1e-3, '球與瓶頸相接');
  });
});
test('正確步驟（秤量、溶解、冷卻、洗燒杯 3 次、平視定容）：濃度誤差 < 0.08%（受一滴 0.05 mL 的限制）', function () {
  [['CuSO4-5H2O', 0.1, 100], ['NaCl', 0.2, 250], ['NaOH', 0.5, 50], ['CuSO4', 0.05, 500]].forEach(function (c) {
    const solid = c[0], C = c[1], Vf = c[2], mass = C * Vf / 1000 * S.SOLIDS[solid].M;
    const r = S.result(goodWeigh(solid, mass, Vf, 3, { target: C }));
    near(r.eTotal, 0, 8e-4, solid);   // 50 mL 量瓶一滴就是 0.1%
    near(r.eLevel, 0, 0.6 * S.DROP / Vf, solid + ' 定容（最多差半滴）');
    near(r.Cideal, C, 1e-9);
  });
});
test('結晶水忘了算：用無水的莫耳質量秤五水硫酸銅，濃度只有 159.60/249.68 = 63.9%', function () {
  const r = S.result(goodWeigh('CuSO4-5H2O', 0.1 * 0.1 * 159.60, 100, 2, { target: 0.1 }));
  near(r.C / 0.1, 159.60 / 249.68, 0.001);
});
test('沒洗燒杯：損失 = 殘液 ÷ 燒杯溶液體積；每洗一次再乘上 殘液 ÷（殘液 + 洗液）', function () {
  const Vf = 100, mass = 0.1 * 0.1 * 58.44;
  const r0 = S.result(goodWeigh('NaCl', mass, Vf, 0)), r1 = S.result(goodWeigh('NaCl', mass, Vf, 1)), r2 = S.result(goodWeigh('NaCl', mass, Vf, 2));
  const Vb = S.mixture('NaCl', mass / 58.44, S.dissolveWater(Vf) * S.RHO_W).V;
  near(-r0.eLoss, S.residue(Vf) / Vb, 1e-6);
  near(r1.eLoss / r0.eLoss, S.residue(Vf) / (S.residue(Vf) + S.rinseWater(Vf)), 0.02);
  assert.ok(Math.abs(r2.eLoss) < Math.abs(r1.eLoss) / 5);
  assert.ok(r0.eTotal < -0.02, '沒洗燒杯約少 2.5%');
});
test('視差：俯視 θ 時液面停在刻度線下 r·tanθ，體積少 πr³tanθ，濃度偏高；仰視相反', function () {
  const mass = 0.1 * 0.1 * 58.44;
  const a = S.result(goodWeigh('NaCl', mass, 100, 2, { eye: 25 })), b = S.result(goodWeigh('NaCl', mass, 100, 2, { eye: -25 }));
  const dv = Math.PI * Math.pow(6, 3) * Math.tan(25 * Math.PI / 180) / 1000;
  near(a.eLevel, 100 / (100 - dv) - 1, 6e-4, '俯視');
  near(b.eLevel, 100 / (100 + dv) - 1, 6e-4, '仰視');
  assert.ok(a.eTotal > 0.002 && b.eTotal < -0.002);
});
test('NaOH 溶解放熱、五水硫酸銅吸熱、無水硫酸銅放熱；沒冷卻就定容 → 冷卻後體積變小、濃度偏高（照純水熱膨脹）', function () {
  const P = S.newPrep({ mode: 'weigh', solid: 'NaOH', mass: 4, Vf: 100 });
  const d = S.dissolve(P);
  near(d.dT, 44510 * 0.1 / ((40 * S.RHO_W + 4) * S.CP), 1e-6);
  const Q = S.newPrep({ mode: 'weigh', solid: 'CuSO4-5H2O', mass: 5, Vf: 100 }); assert.ok(S.dissolve(Q).dT < 0);
  const R = S.newPrep({ mode: 'weigh', solid: 'CuSO4', mass: 5, Vf: 100 }); assert.ok(S.dissolve(R).dT > 0);
  const HP = goodWeigh('NaOH', 4, 100, 2, { hot: true, target: 1 }), hot = S.result(HP);
  assert.ok(HP.Tfill > 28, '定容時約 30 °C：' + HP.Tfill);
  near(hot.eTemp, S.volFactor(HP.Tfill) - 1, 1e-12);
  assert.ok(hot.eTemp > 0.002, '溫度誤差 ' + hot.eTemp);
  near(hot.eTotal, (1 + hot.eLoss) * (1 + hot.eTemp) * (1 + hot.eLevel) - 1, 1e-9);
  const cold = S.result(goodWeigh('NaOH', 4, 100, 2, { target: 1 }));
  near(cold.eTemp, 0, 1e-12);
});
test('溶解度：燒杯的水溶不完時不能溶解，並告訴最多能溶多少', function () {
  const P = S.newPrep({ mode: 'weigh', solid: 'CuSO4-5H2O', mass: 30, Vf: 100 });
  const d = S.dissolve(P);
  assert.ok(!d.ok && d.why === 'sat');
  const Q = S.newPrep({ mode: 'weigh', solid: 'CuSO4-5H2O', mass: d.maxMass * 0.999, Vf: 100 });
  assert.ok(S.dissolve(Q).ok);
  const m = S.mixture('CuSO4', Q.beaker.n, Q.beaker.mw);
  near(m.w * 100, S.SPECIES.CuSO4.sat, 0.05, '剛好飽和');
});
test('稀釋 C1V1 = C2V2；吸量管沒潤洗 → 偏低；量瓶裡原本有水 → 不影響', function () {
  const P = S.newPrep({ mode: 'dilute', Vf: 100, stock: { sp: 'CuSO4', c: 1 }, target: 0.1 });
  S.pipette(P, 10, true); fill(P, 0); S.shake(P);
  near(S.result(P).C, 0.1, 0.0002);
  const Q = S.newPrep({ mode: 'dilute', Vf: 100, stock: { sp: 'CuSO4', c: 1 }, target: 0.1 });
  S.pipette(Q, 10, false); fill(Q, 0); S.shake(Q);
  near(S.result(Q).eLoss, -S.pipetteWater(10) / 10, 1e-9);
  const W = S.newPrep({ mode: 'dilute', Vf: 100, stock: { sp: 'CuSO4', c: 1 }, target: 0.1, flaskWet: true });
  S.pipette(W, 10, true); fill(W, 0); S.shake(W);
  near(S.result(W).C, S.result(P).C, 0.0002);
  // 溶質守恆：量瓶裡的 n = C1·V1
  near(P.flask.n, 0.01, 1e-12);
});
test('搖勻後液面略低於刻度線（液膜）：再補水 → 濃度偏低；加過頭再吸出 → 溶質也被吸走，濃度和沒吸一樣偏低', function () {
  const mass = 0.1 * 0.1 * 58.44;
  const P = goodWeigh('NaCl', mass, 100, 2);
  assert.ok(S.level(P).h < -0.5, '搖勻後液面看起來在刻度線下');
  const before = S.result(P).C;
  fill(P, 0); S.shake(P);
  const r = S.result(P);
  near(r.C / before - 1, -S.film(100) / 100, 2e-4);
  near(r.eAfter, -S.film(100) / 100, 2e-4);
  // 加過頭 1 mL：留著或吸出，濃度一樣
  const A = S.newPrep({ mode: 'weigh', solid: 'NaCl', mass: mass, Vf: 100 }); S.dissolve(A); S.transfer(A); S.rinse(A); S.rinse(A); fill(A, 0);
  const B = JSON.parse(JSON.stringify(A)); B.g = A.g;
  S.addWater(A, 1, 0); S.shake(A);
  S.addWater(B, 1, 0); S.drawOut(B, 0); S.shake(B);
  near(S.result(B).C, S.result(A).C, 1e-6, '吸出不能補救');
  assert.ok(S.result(B).eLevel < -0.009 && B.drawnOut);
  near(S.level(B).h + S.film(100) * 1000 / (Math.PI * 36), 0, 0.01, '吸到刻度線');
});
test('比爾定律的顏色：濃度或光程加倍，吸光度加倍；1 ppm 銅幾乎無色', function () {
  const a = S.transmit(0.1, 5), b = S.transmit(0.2, 5), c = S.transmit(0.1, 10);
  for (let i = 0; i < 3; i++) { near(Math.log10(b[i]), 2 * Math.log10(a[i]), 1e-12); near(c[i], b[i], 1e-12); }
  assert.ok(a[0] < a[1] && a[1] < a[2], '紅光吸收最多 → 藍色');
  const t = S.transmit(1e-6 * 1e3 / 63.546, 6);
  assert.ok(t[0] > 0.999);
});

console.log(passed + ' 項通過');
