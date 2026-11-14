'use strict';
const assert = require('node:assert/strict');
const C = require('../js/polarization-core.js');

const near = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance,
  message + '：' + actual + '，預期 ' + expected);
near(C.transmit([20]).intensity, 0.5, 1e-13, '無偏振光經過第一片');
near(C.transmit([15, 75]).intensity, 0.125, 1e-13, '馬呂斯定律');
near(C.transmit([0, 90]).intensity, 0, 1e-13, '交叉兩片的消光');
near(C.transmit([0, 45, 90]).intensity, 0.125, 1e-13, '交叉兩外片插入中間片');
near(C.transmit([0, 45, 90], 0).intensity, 0.25, 1e-13, '線偏振入射的三片法');
near(C.transmit([0, 180], 0).intensity, 1, 1e-13, '透光軸週期為 180°');
assert.equal(C.angleBetween(179, 1), 2, '偏振軸最小夾角');
for (const s of C.transmit([19, 46, 77], 11).stages) {
  near(s.field.x * s.rejected.x + s.field.y * s.rejected.y, 0, 1e-13, '兩電場分量正交');
  near(s.rejected.x ** 2 + s.rejected.y ** 2 + s.intensity, s.incident, 1e-13, '理想偏振片透射加吸收');
}
{
  const normal = C.fresnel(1, 1.5, 0);
  near(normal.rs, 0.04, 1e-13, '法線入射 s 反射率');
  near(normal.rp, 0.04, 1e-13, '法線入射 p 反射率');
  near(normal.polarization, 0, 1e-13, '法線入射的無偏振光反射後仍無偏振');
}
for (const [n1, n2] of [[1, 1.5], [1.5, 1], [1.45, 2.25]]) {
  const b = C.brewsterAngle(n1, n2);
  const r = C.fresnel(n1, n2, b);
  near(Math.tan(b * Math.PI / 180), n2 / n1, 1e-13, '布魯斯特定律');
  near(r.rp, 0, 1e-13, '布魯斯特角消去 p 反射');
  near(r.polarization, 1, 1e-13, '反射光完全 s 偏振');
  near(b + r.angleT, 90, 1e-12, '反射線與折射線垂直');
  near(C.reflectedThroughAnalyzer(r, 0), r.reflected, 1e-13, '沿 s 的檢偏片透過全部布魯斯特反射光');
  near(C.reflectedThroughAnalyzer(r, 90), 0, 1e-13, '垂直 s 的檢偏片使布魯斯特反射光消光');
}
const tir = C.fresnel(1.5, 1, 65);
assert.equal(tir.totalInternal, true, '超過臨界角全反射');
assert.equal(tir.rs, 1);
assert.equal(tir.rp, 1);
assert.equal(tir.angleT, null);
assert.equal(C.brewsterAngle(1.5, 1.5), null, '相同折射率無特定布魯斯特角');
assert.equal(C.fresnel(1.5, 1.5, 45).polarization, null, '零反射光無偏振度');
for (const [n1, n2] of [[1, 1.5], [1.5, 1], [1.4, 1.4]]) {
  for (let i = 0; i <= 90; i++) {
    const r = C.fresnel(n1, n2, i);
    assert.ok(r.rs >= 0 && r.rs <= 1 && r.rp >= 0 && r.rp <= 1, '反射率落在物理範圍');
    near(r.rs + r.ts, 1, 1e-13, 's 能流守恆');
    near(r.rp + r.tp, 1, 1e-13, 'p 能流守恆');
    near(C.reflectedThroughAnalyzer(r, 17) + C.reflectedThroughAnalyzer(r, 107),
      r.reflected, 1e-13, '互相垂直的兩個檢偏方向加總等於反射光強');
  }
}
console.log('光的偏振：馬呂斯定律、三片偏振片、菲涅耳公式、全反射與能流守恆均通過');
