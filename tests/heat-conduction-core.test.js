'use strict';
const assert = require('node:assert/strict');
const C = require('../js/heat-conduction-core.js');

const rod = { mode: 'series', left: 100, right: 20, length: 0.30, area: 4e-4, fraction: 0.5, a: 'copper', b: 'steel' };
const near = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance,
  message + '：' + actual + '，預期 ' + expected);

{
  const m = C.steady(rod);
  const rA = 0.15 / (390 * rod.area), rB = 0.15 / (50 * rod.area);
  near(m.flow, 80 / (rA + rB), 1e-12, '串聯總熱流率');
  near(m.junction, (100 * rB + 20 * rA) / (rA + rB), 1e-12, '接面溫度');
  near(m.temperature(0, 0.15), m.junction, 1e-12, '接面溫度連續');
  const swap = C.steady({ ...rod, a: rod.b, b: rod.a });
  near(swap.flow, m.flow, 1e-12, '等長材料對調保持總熱流率');
  near(swap.junction + m.junction, 120, 1e-12, '等長材料對調互補的接面溫度');
}
{
  const m = C.steady({ ...rod, mode: 'parallel' });
  near(m.flow, (390 + 50) * 2e-4 * 80 / 0.30, 1e-12, '並聯熱流率加總');
  near(m.rates[0] / m.rates[1], 390 / 50, 1e-12, '等截面支路按熱傳導係數分流');
  assert.equal(m.junction, null, '並聯沒有串聯接面');
}
{
  const uniform = { ...rod, a: 'aluminum', b: 'aluminum' };
  const run = C.createRun(uniform);
  const fourier = 0.12;
  C.advance(run, fourier * rod.length ** 2 / C.diffusivity(C.materials.aluminum));
  const profile = C.sample(run, 0);
  profile.x.forEach((x, i) => {
    const u = x / rod.length;
    let exact = 20 + 80 * (1 - u);
    for (let n = 1; n <= 25; n++) {
      exact -= 160 / (n * Math.PI) * Math.sin(n * Math.PI * u) * Math.exp(-n * n * Math.PI ** 2 * fourier);
    }
    near(profile.temperatures[i], exact, 0.40, '均勻棒有限體積結果與傅立葉級數');
  });
}
for (const mode of ['series', 'parallel']) {
  const run = C.createRun({ ...rod, mode, a: 'glass', fraction: 0.74 });
  C.advance(run, run.duration * 0.005);
  for (let i = 0; i < run.paths.length; i++) {
    const p = run.paths[i];
    near(C.storedEnergy(run, i), p.boundaryEnergy, 1e-7, '熱量變化等於邊界淨熱輸入');
    for (const t of p.temperatures) assert.ok(t >= 20 - 1e-9 && t <= 100 + 1e-9, '極值原理');
  }
  C.advance(run, run.duration);
  run.paths.forEach((_, i) => {
    const profile = C.sample(run, i);
    assert.ok(profile.maxGap < 0.01, '長時間後趨近穩態');
    profile.flows.forEach(q => near(q, run.model.rates[i], 0.001, '穩態各截面熱流率一致'));
  });
}
{
  const equilibrium = C.createRun({ ...rod, left: 20 });
  C.advance(equilibrium, 100);
  C.sample(equilibrium, 0).temperatures.forEach(t => near(t, 20, 1e-9, '初始均溫維持熱平衡'));
  const reversed = C.steady({ ...rod, left: 20, right: 100 });
  near(reversed.flow, -C.steady(rod).flow, 1e-12, '反向溫差反轉熱流方向');
}
{
  const strip = C.expansion('aluminum', 'steel', 0.30, 0.0015, 80);
  const cool = C.expansion('aluminum', 'steel', 0.30, 0.0015, -80);
  near(strip.freeA, 0.30 * 23e-6 * 80, 1e-12, '線膨脹');
  near(strip.curvature, 1.5 * (23 - 12) * 1e-6 * 80 / 0.0015, 1e-12, '等厚等模數曲率');
  assert.ok(strip.tip.y > 0 && cool.tip.y < 0, '加熱朝低膨脹層彎，冷卻轉向');
  assert.equal(C.expansion('steel', 'steel', 0.3, 0.0015, 100).tip.y, 0, '相同材料不彎');
  assert.equal(C.expansion('aluminum', 'steel', 0.3, 0.0015, 0).tip.y, 0, '零溫差不彎');
}

console.log('熱傳導與熱膨脹：串並聯、暫態解析解、熱量守恆、穩態和雙金屬片均通過');
