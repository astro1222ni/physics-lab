// 以 Node 執行：node tests/refraction-core.test.js
'use strict';
const assert = require('assert');
const RC = require('../js/refraction-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
const rad = (d) => d * Math.PI / 180;
const deg = (r) => r * 180 / Math.PI;
const PAIRS = [[1, 1.33], [1, 1.5], [1, 2.42], [1.33, 1.5], [1.5, 1], [1.33, 1], [2.42, 1], [1.5, 1.33], [2.42, 1.5], [1.2, 1.2]];
const angles = [];
for (let d = 0; d <= 90; d += 0.25) angles.push(rad(d));

console.log('refraction-core');

test('預設介質：空氣 1.00、水 1.33、玻璃 1.50、鑽石 2.42', () => {
  assert.deepStrictEqual(RC.MEDIA.map((m) => [m.id, m.n]), [['air', 1], ['water', 1.33], ['glass', 1.5], ['diamond', 2.42]]);
});

test('司乃耳定律 n1 sinθ1 = n2 sinθ2（所有非全反射的角度）', () => {
  for (const [n1, n2] of PAIRS) for (const th of angles) {
    if (RC.isTIR(n1, n2, th)) continue;
    const t2 = RC.refractionAngle(n1, n2, th);
    close(n1 * Math.sin(th), n2 * Math.sin(t2), 1e-12, `n1=${n1} n2=${n2} θ1=${deg(th)}°`);
  }
});

test('教科書例子：空氣→水 30° 折射角 22.08°；空氣→玻璃 45° 折射角 28.13°', () => {
  close(deg(RC.refractionAngle(1, 1.33, rad(30))), 22.0824, 1e-3);
  close(deg(RC.refractionAngle(1, 1.5, rad(45))), 28.1255, 1e-3);
});

test('進入光密介質偏向法線（θ2 < θ1），進入光疏介質偏離法線（θ2 > θ1）', () => {
  for (const d of [5, 20, 40, 60, 85]) {
    assert.ok(RC.refractionAngle(1, 1.5, rad(d)) < rad(d));
    if (d < 40) assert.ok(RC.refractionAngle(1.5, 1, rad(d)) > rad(d));
  }
  close(RC.refractionAngle(1, 1.5, 0), 0, 0, '垂直入射不偏折');
});

test('臨界角 θc = arcsin(n2/n1)：玻璃→空氣 41.81°、水→空氣 48.75°、鑽石→空氣 24.41°', () => {
  close(deg(RC.criticalAngle(1.5, 1)), 41.8103, 1e-3);
  close(deg(RC.criticalAngle(1.33, 1)), 48.7535, 1e-3);
  close(deg(RC.criticalAngle(2.42, 1)), 24.4075, 1e-3);
  assert.ok(Number.isNaN(RC.criticalAngle(1, 1.5)), '光疏→光密沒有臨界角');
  assert.ok(Number.isNaN(RC.criticalAngle(1.33, 1.33)), '相同介質沒有臨界角');
});

test('全反射條件：只在 n1 > n2 且 θ1 ≥ θc 時發生；臨界角時折射角為 90°', () => {
  for (const [n1, n2] of PAIRS) {
    const tc = RC.criticalAngle(n1, n2);
    for (const th of angles) {
      const expect = n1 > n2 && th >= tc - 1e-12;
      assert.strictEqual(RC.isTIR(n1, n2, th), expect, `n1=${n1} n2=${n2} θ1=${deg(th)}°`);
      assert.strictEqual(Number.isNaN(RC.refractionAngle(n1, n2, th)), expect);
    }
    if (n1 > n2) {
      close(deg(RC.refractionAngle(n1, n2, tc - 1e-9)), 90, 1e-2, '略小於臨界角時 θ2 → 90°');
      assert.ok(RC.isTIR(n1, n2, tc), '恰好在臨界角');
    }
  }
});

test('菲涅耳：所有角度 R + T = 1（T 由穿透係數獨立計算），且 0 ≤ R, T ≤ 1', () => {
  for (const [n1, n2] of PAIRS) for (const th of angles) {
    const f = RC.fresnel(n1, n2, th);
    close(f.Rs + f.Ts, 1, 1e-12, `s：n1=${n1} n2=${n2} θ1=${deg(th)}°`);
    close(f.Rp + f.Tp, 1, 1e-12, `p：n1=${n1} n2=${n2} θ1=${deg(th)}°`);
    close(f.R + f.T, 1, 1e-12, '非偏振');
    assert.ok(f.R >= 0 && f.R <= 1 + 1e-12 && f.T >= -1e-12 && f.T <= 1 + 1e-12);
  }
});

test('垂直入射 R = ((n1 − n2)/(n1 + n2))²：空氣↔玻璃 4%、空氣↔鑽石 17.2%', () => {
  for (const [n1, n2] of PAIRS) {
    const f = RC.fresnel(n1, n2, 0);
    const r0 = ((n1 - n2) / (n1 + n2)) ** 2;
    close(f.R, r0, 1e-15);
    close(f.Rs, f.Rp, 1e-15, '垂直入射 s、p 無分別');
    close(RC.normalReflectance(n1, n2), r0, 1e-15);
  }
  close(RC.fresnel(1, 1.5, 0).R, 0.04, 1e-15);
  close(RC.fresnel(1, 2.42, 0).R, (1.42 / 3.42) ** 2, 1e-15);
});

test('布魯斯特角 tanθB = n2/n1 時 Rp = 0，且反射光與折射光互相垂直', () => {
  for (const [n1, n2] of PAIRS) {
    if (n1 === n2) continue;
    const tb = RC.brewsterAngle(n1, n2);
    const f = RC.fresnel(n1, n2, tb);
    close(f.Rp, 0, 1e-24, `n1=${n1} n2=${n2}`);
    assert.ok(f.Rs > 0.001, 's 偏振仍會反射');
    close(tb + f.theta2, Math.PI / 2, 1e-12, 'θB + θ2 = 90°');
    // 布魯斯特角附近 Rp 是最小值
    assert.ok(RC.fresnel(n1, n2, tb - 0.01).Rp > f.Rp && RC.fresnel(n1, n2, tb + 0.01).Rp > f.Rp);
  }
  close(deg(RC.brewsterAngle(1, 1.5)), 56.3099, 1e-3);
});

test('全反射時 R = 100%、T = 0；臨界角處 R 連續趨近 1', () => {
  for (const d of [41.82, 50, 70, 89.9]) {
    const f = RC.fresnel(1.5, 1, rad(d));
    assert.strictEqual(f.tir, true);
    assert.strictEqual(f.R, 1);
    assert.strictEqual(f.T, 0);
  }
  const tc = RC.criticalAngle(1.5, 1);
  assert.ok(RC.fresnel(1.5, 1, tc - 1e-8).R > 0.99, '臨界角前 R → 1（連續）');
});

test('掠射（θ1 = 90°）時 R = 1、T = 0', () => {
  for (const [n1, n2] of [[1, 1.5], [1, 1.33], [1.33, 1.5]]) {
    const f = RC.fresnel(n1, n2, Math.PI / 2);
    close(f.R, 1, 1e-12);
    close(f.T, 0, 1e-12);
  }
});

test('光路可逆：反向射回時折射角與入射角互換，反射率也相同', () => {
  for (const [n1, n2] of PAIRS) for (const th of angles) {
    if (RC.isTIR(n1, n2, th) || th > rad(89.9)) continue;
    const t2 = RC.refractionAngle(n1, n2, th);
    close(RC.refractionAngle(n2, n1, t2), th, 1e-7, `n1=${n1} n2=${n2} θ1=${deg(th)}°`);
    const a = RC.fresnel(n1, n2, th), b = RC.fresnel(n2, n1, t2);
    close(a.Rs, b.Rs, 1e-9, 'Rs 可逆');
    close(a.Rp, b.Rp, 1e-9, 'Rp 可逆');
  }
});

test('相同折射率：光直線前進、完全不反射', () => {
  for (const th of angles) {
    if (th > rad(89.9)) continue;
    const f = RC.fresnel(1.33, 1.33, th);
    close(f.theta2, th, 1e-12);
    close(f.R, 0, 1e-20);
  }
});

test('光速 v = c/n、波長 λ = λ0/n（頻率 v/λ 不變）', () => {
  close(RC.speed(1), 299792458, 0);
  close(RC.speed(1.5), 299792458 / 1.5, 1e-6);
  for (const n of [1, 1.33, 1.5, 2.42]) {
    close(RC.speed(n) / RC.wavelengthIn(532e-9, n), 299792458 / 532e-9, 1, '頻率相同');
  }
});

test('漸逝波穿透深度：只在全反射時存在，越接近臨界角越深', () => {
  assert.ok(Number.isNaN(RC.penetrationDepth(1.5, 1, rad(30), 532e-9)));
  const d1 = RC.penetrationDepth(1.5, 1, rad(45), 532e-9);
  const d2 = RC.penetrationDepth(1.5, 1, rad(70), 532e-9);
  assert.ok(d1 > d2 && d2 > 0);
  close(d2, 532e-9 / (4 * Math.PI * Math.sqrt(2.25 * Math.sin(rad(70)) ** 2 - 1)), 1e-20);
});

test('光纖：NA = √(n_core² − n_clad²)，接收角 n0 sinθa = NA', () => {
  close(RC.numericalAperture(1.48, 1.46), Math.sqrt(1.48 ** 2 - 1.46 ** 2), 1e-15);
  close(Math.sin(RC.acceptanceAngle(1.48, 1.46, 1)), Math.sqrt(1.48 ** 2 - 1.46 ** 2), 1e-12);
  close(RC.acceptanceAngle(1.5, 1, 1), Math.PI / 2, 0, 'NA ≥ 1：任何角度都全反射');
  assert.ok(Number.isNaN(RC.acceptanceAngle(1.4, 1.5)));
});

test('光纖光路：入射角小於接收角時側面全反射，功率只在端面損失', () => {
  const nCore = 1.5, nClad = 1.33;
  const ta = RC.acceptanceAngle(nCore, nClad, 1);
  const tr = RC.fibreTrace({ n0: 1, nCore, nClad, thetaIn: ta * 0.9, length: 1000, thickness: 40 });
  assert.strictEqual(tr.tir, true);
  assert.ok(tr.bounces > 3);
  close(tr.out, tr.entry.T, 1e-15, '全反射無損失');
  close(Math.PI / 2 - tr.phi, tr.thetaR, 1e-15);
  assert.ok(tr.phi >= tr.thetaC);
  // 光路幾何：每段斜率 = tanθr、反射點交替落在上下界面
  for (let i = 1; i < tr.points.length - 1; i++) {
    const a = tr.points[i - 1], b = tr.points[i];
    close(Math.abs(b.y - a.y) / (b.x - a.x), Math.tan(tr.thetaR), 1e-9);
    close(Math.abs(b.y), 20, 1e-9);
  }
});

test('光纖光路：超過接收角時每次反射都漏光（s、p 分開追蹤）', () => {
  const nCore = 1.5, nClad = 1.33;
  const ta = RC.acceptanceAngle(nCore, nClad, 1);
  const thIn = Math.min(ta * 1.4, rad(85));
  const tr = RC.fibreTrace({ n0: 1, nCore, nClad, thetaIn: thIn, length: 1000, thickness: 40 });
  assert.strictEqual(tr.tir, false);
  assert.ok(tr.out < tr.entry.T);
  // 漏出的功率加上抵達末端的功率 = 進入纖芯的功率（能量守恆）
  const leaked = tr.leaks.reduce((s, l) => s + l.P, 0);
  close(leaked + tr.out, tr.entry.T, 1e-12);
  // 解析檢查：n 次反射後 = (Ts Rsⁿ + Tp Rpⁿ)/2
  const n = tr.bounces, w = tr.wall, e = tr.entry;
  close(tr.out, (e.Ts * w.Rs ** n + e.Tp * w.Rp ** n) / 2, 1e-12);
});

test('雷射顏色：650 nm 偏紅、532 nm 偏綠、405 nm 偏藍紫', () => {
  const r = RC.wavelengthToRGB(650), g = RC.wavelengthToRGB(532), v = RC.wavelengthToRGB(405);
  assert.ok(r[0] > 200 && r[1] < 60 && r[2] === 0);
  assert.ok(g[1] > 200 && g[0] < g[1] && g[2] === 0);
  assert.ok(v[2] > v[1] && v[0] > 0);
});

test('interfaceInfo：與 fresnel、臨界角、布魯斯特角一致；波長 λ0/n、光速 c/n', () => {
  for (const [n1, n2] of PAIRS) for (const d of [0, 10, 30, 45, 60, 80]) {
    const th = rad(d), a = RC.interfaceInfo(n1, n2, th, 532), f = RC.fresnel(n1, n2, th);
    assert.strictEqual(a.tir, f.tir);
    close(a.R, f.R, 0); close(a.Rp, f.Rp, 0);
    close(a.lam2, 532 / n2, 1e-12); close(a.v1, RC.C / n1, 1e-6);
    if (!f.tir) close(a.dev, Math.abs(th - f.theta2), 1e-15); else assert.ok(isNaN(a.dev) && isNaN(a.th2));
    if (n1 > n2) close(a.crit, Math.asin(n2 / n1), 1e-15); else assert.ok(isNaN(a.crit));
    if (n1 === n2) assert.ok(isNaN(a.brew)); else close(a.brew, Math.atan(n2 / n1), 1e-15);
  }
});

test('interfaceInfo：布魯斯特角入射時反射光與折射光垂直（θ1 + θ2 = 90°）且 Rp = 0', () => {
  for (const [n1, n2] of [[1, 1.5], [1, Math.sqrt(3)], [1.5, 1], [2.42, 1.33]]) {
    const tb = RC.brewsterAngle(n1, n2), a = RC.interfaceInfo(n1, n2, tb, 650);
    close(deg(tb + a.th2), 90, 1e-9);
    assert.ok(a.Rp < 1e-25);
  }
  close(deg(RC.brewsterAngle(1, Math.sqrt(3))), 60, 1e-12);
});

test('臨界角與布魯斯特角互餘 ⇔ (n2/n1)² = (√5 − 1)/2（黃金比例）；此時布魯斯特角入射的折射角 = 臨界角', () => {
  const k = Math.sqrt((Math.sqrt(5) - 1) / 2), n1 = 1 / k, n2 = 1;
  const a = RC.interfaceInfo(n1, n2, RC.brewsterAngle(n1, n2), 532);
  close(deg(a.crit + a.brew), 90, 1e-9);
  close(deg(a.th2), deg(a.crit), 1e-6);
});

test('interfaceInfo：全反射的穿透深度在臨界角附近很大、角度越大越淺；垂直入射反射率 ((n1 − n2)/(n1 + n2))²', () => {
  const tc = RC.criticalAngle(1.5, 1);
  const d1 = RC.interfaceInfo(1.5, 1, tc + rad(0.05), 1).depth, d2 = RC.interfaceInfo(1.5, 1, rad(60), 1).depth;
  assert.ok(d1 > 1 && d2 < 0.1 && d1 > d2);
  assert.ok(isNaN(RC.interfaceInfo(1.5, 1, rad(30), 1).depth));
  close(RC.interfaceInfo(1, 1.925, 0, 532).R, Math.pow(0.925 / 2.925, 2), 1e-12);
});

test('fibreInfo：射入角 ≤ 最大接收角時側面全反射，超過就漏光；NA ≥ 1 時任何角度都導光', () => {
  for (const [c, cl] of [[1.5, 1.33], [1.48, 1.46], [1.421, 1.33]]) {
    const ta = RC.acceptanceAngle(c, cl, 1);
    assert.ok(RC.fibreInfo(c, cl, ta - rad(0.05), 1).guided);
    assert.ok(!RC.fibreInfo(c, cl, ta + rad(0.05), 1).guided);
    const f = RC.fibreInfo(c, cl, ta, 1);
    close(f.phi, f.crit, 1e-9, '恰在接收角：側面入射角 = 臨界角');
    close(f.NA, Math.sqrt(c * c - cl * cl), 1e-12);
  }
  close(deg(RC.fibreInfo(1.421, 1.33, 0, 1).acc), 30.02, 0.01);
  for (const d of [0, 45, 80, 89.9]) assert.ok(RC.fibreInfo(1.5, 1, rad(d), 1).guided, '空氣包層的玻璃纖芯 NA > 1');
  const f = RC.fibreInfo(1.5, 1.33, rad(70), 1);
  close(f.entryT, RC.fresnel(1, 1.5, rad(70)).T, 0);
  close(f.wallR, RC.fresnel(1.5, 1.33, f.phi).R, 0);
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗項目' : ''));
