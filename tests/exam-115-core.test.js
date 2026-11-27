'use strict';
const assert = require('node:assert/strict');
const C = require('../js/exam/115-core');
const near = (a, b, r = .02) => Math.abs(a / b - 1) < r;

// 第 10 題：0–5 s 加速 2 m/s²、全程位移 125 m、滑行段阻力 1000 N
assert.equal(C.carAt(2.5).a, 2);
assert.equal(C.carAt(20).x, 125);
assert.equal(C.carAt(5).x, 25);
assert.equal(C.carDrag().force, 1000);
assert.equal(C.carDrag().work, -50000);

// 第 11 題：三段的位置剛好在乙、丙、丁；加速段 a>0、減速段 a<0、v 一直 ≥0
assert.ok(Math.abs(C.crane(1).y - 1) < 1e-9);
let last = -1;
for (let s = 0; s <= 1.0001; s += .01) { const p = C.crane(s); assert.ok(p.v >= -1e-9 && p.y >= last - 1e-9); last = p.y; }
assert.ok(C.crane(.05).a > 0 && C.crane(.95).a < 0 && C.crane(.5).a === 0);

// 第 12 題：ΔK甲乙＋ΔK丙丁＝0（B）、ΔU 總和 >0（E）；A、C、D 不成立
const en = C.craneEnergy();
assert.equal(en.dK[0] + en.dK[2], 0);
assert.ok(en.dU.reduce((a, b) => a + b) > 0);
assert.ok(en.dU[0] + en.dK[0] > 0 && en.dU[1] + en.dK[1] > 0 && en.dK.reduce((a, b) => a + b) === 0);

// 第 13 題：甲時刻（朝地球）最高、乙時刻（半圈後）最低 → E
assert.ok(C.starFrequency(0).f > 1 && C.starFrequency(Math.PI).f < 1);
assert.ok(near(C.starFrequency(Math.PI / 2).f, 1, 1e-9));

// 第 14 題：強力＞質子間靜電力＞質子電子靜電力＞中子間重力 → 甲＞丙＞乙（C）
const F = C.heliumForces();
assert.ok(F.strong > F.pp && F.pp > F.pe && F.pe > F.nnGravity);
assert.ok(F.pp / F.nnGravity > 1e35);

// 第 15 題
assert.ok(C.FIELD_UNITS['N/C'] && C.FIELD_UNITS['V/m'] && !C.FIELD_UNITS['C/N']);

// 第 16 題：x>0 為負、x<0 為正、平方反比 → B
assert.ok(C.electronForce(1) < 0 && C.electronForce(-1) > 0);
assert.equal(C.electronForce(2) / C.electronForce(1), 1 / 4);
assert.equal(C.electronForce(0), null);

// 第 17 題：394/140 → E
assert.equal(C.keRatio(121, -133), 394 / 140);

// 第 18 題：E≈3×10⁻¹¹ J、R≈3×10¹⁹ 次/秒 → E
const fi = C.fission();
assert.ok(near(fi.E, 2.97e-11) && near(fi.rate, 3.06e19, .03));

// 第 47 題：365 nm＝3.4 eV＝E₁→E₄ → B
assert.ok(near(C.photonEv(365), 3.4, .01));
assert.ok(near(C.transition(1, 4).dE, 3.4, 1e-9) && near(C.transition(1, 4).lambda, 365, .01));
for (const [a, b] of [[1, 3], [2, 4], [2, 5], [3, 4]]) assert.ok(Math.abs(C.transition(a, b).dE - 3.4) > .2);

// 第 48 題：13.5 nm 約 1.5×10⁻¹⁷ J → A、D
assert.ok(near(C.photonJ(13.5), 1.47e-17, .01));

// 第 49 題：同相疊加變大、反相變小；從慢到快折射角變大
assert.ok(C.superpose(.9, 0) > 1.8 && C.superpose(.9, Math.PI) < .2);
assert.ok(C.refract(30, 1.5) > 30 && C.refract(30, 2.5) === null);

// 第 52 題：每次漲潮 10¹¹ J、一年約 10⁷ 度、730 次漲潮 → D、E
const t = C.tide();
assert.equal(t.U, 1e11);
assert.equal(t.floods, 730);
assert.ok(near(t.kWh, 1.01e7, .01));

// 第 53 題：z<0 時 I<0、z>0 時 I>0；同一個 |z|，上方（較快）量值較大；8 點在第 1、3 象限
for (const z of [5, 10, 15, 20]) {
  assert.ok(C.inducedCurrent(-z) < 0 && C.inducedCurrent(z) > 0);
  assert.ok(Math.abs(C.inducedCurrent(z)) > Math.abs(C.inducedCurrent(-z)));
}
assert.ok(C.POINTS53.every(([z, i]) => Math.sign(z) === Math.sign(i)));
// 模型的衰減比例和表 10 差不多（5 cm 到 20 cm 約 8 倍）
const r = C.inducedCurrent(5) / C.inducedCurrent(20), m = C.TABLE10.above[0] / C.TABLE10.above[3];
assert.ok(r > m * .7 && r < m * 1.4, r + ' vs ' + m);
const sp = C.inducedCurrent(10) / -C.inducedCurrent(-10), ms = 2.70 / 2.10;
assert.ok(sp > ms * .85 && sp < ms * 1.15, sp + ' vs ' + ms);
console.log('exam-115-core ok');
