// 以 Node 執行：node tests/biomimicry-core.test.js
'use strict';
const assert = require('assert');
const B = require('../js/biomimicry-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b} ± ${tol}，得到 ${a}`);
}
const WAX = { thY: 109, hyst: 10, V: 10 };
function drop(o) { return B.drop(Object.assign({}, WAX, o)); }

console.log('biomimicry-core');

test('方柱陣列：粗糙度 r = 1 + 4ah/p²、固體占比 φ = a²/p²', () => {
  const t = B.texture(10, 10, 20);
  close(t.r, 1 + 4 * 10 * 20 / 400, 1e-12); close(t.phi, 0.25, 1e-12);
  assert.ok(B.texture(10, 10, 0).smooth, '柱高 0 就是平面');
  assert.strictEqual(B.texture(0, 10, 10).r, 1);
});

test('Wenzel：粗糙讓疏水更疏水、親水更親水；θY = 90° 不變', () => {
  const r = 1.8;
  assert.ok(B.acosd(B.wenzelCos(B.cosd(109), r)) > 109);
  assert.ok(B.acosd(B.wenzelCos(B.cosd(60), r)) < 60);
  close(B.acosd(B.wenzelCos(B.cosd(90), r)), 90, 1e-9);
  // r cos θY ≥ 1：完全攤開
  close(B.acosd(B.wenzelCos(B.cosd(30), 2)), 0, 1e-9);
});

test('Cassie–Baxter：φ → 1 回到 θY、φ → 0 趨近 180°；手算一例', () => {
  close(B.acosd(B.cassieCos(B.cosd(109), 1)), 109, 1e-9);
  assert.ok(B.acosd(B.cassieCos(B.cosd(109), 1e-4)) > 178);
  // φ = 0.25、θY = 109°：cos θ = 0.25(cos109° + 1) − 1
  close(B.acosd(B.cassieCos(B.cosd(109), 0.25)), Math.acos(0.25 * (Math.cos(109 * Math.PI / 180) + 1) - 1) * 180 / Math.PI, 1e-9);
});

test('臨界角：θY = θc 時 Wenzel 與 Cassie 的角度相同', () => {
  [[10, 10, 20], [5, 20, 20], [2, 3, 6]].forEach(function (s) {
    const t = B.texture(s[0], s[1], s[2]), cc = B.criticalCos(t.phi, t.r);
    close(B.wenzelCos(cc, t.r), B.cassieCos(cc, t.phi), 1e-12);
  });
});

test('球冠：體積與接觸半徑；θ = 90° 是半球', () => {
  const g = B.cap(10, 90);
  close(2 / 3 * Math.PI * Math.pow(g.R, 3), 10e-9, 1e-15, '半球體積');
  close(g.c, g.R, 1e-12); close(g.H, g.R, 1e-12);
  [30, 109, 160].forEach(function (th) {
    const q = B.cap(25, th), c = Math.cos(th * Math.PI / 180);
    close(Math.PI * Math.pow(q.R, 3) * (2 - 3 * c + c * c * c) / 3, 25e-9, 1e-14, 'θ = ' + th);
  });
  assert.ok(B.cap(10, 160).c < B.cap(10, 109).c, '角度越大，接觸面越小');
});

test('刺穿壓力：沿壁下滑 ΔP = −4γa cos θA/(p² − a²)、下垂 ΔP = 4γh/b²；縮小結構會更耐壓', () => {
  const im = B.impalement(10, 10, 20, 114);
  close(im.dep, -0.072 * 4 * 10e-6 * Math.cos(114 * Math.PI / 180) / (400e-12 - 100e-12), 1e-6);
  close(im.sag, 4 * 0.072 * 20e-6 / 100e-12, 1e-6);
  assert.strictEqual(B.impalement(10, 10, 20, 85).dep, 0, 'θA < 90° 擋不住');
  // 同樣的形狀（a : b : h 固定）縮小 10 倍，耐壓變 10 倍
  close(B.impalement(1, 1, 2, 114).crit / B.impalement(10, 10, 20, 114).crit, 10, 1e-9);
});

test('水珠的狀態：平面、Cassie、被雨打穿變 Wenzel、親水攤開', () => {
  assert.strictEqual(drop({ a: 0, b: 0, h: 0 }).mode, 'smooth');
  const c = drop({ a: 10, b: 10, h: 20 });
  assert.strictEqual(c.mode, 'cassie'); close(c.theta, c.thCB, 1e-12);
  assert.ok(c.Plap < c.Pcrit, 'Laplace 壓力撐得住');
  const w = drop({ a: 10, b: 10, h: 20, v: 3 });
  assert.strictEqual(w.mode, 'wenzel'); assert.ok(w.impaled);
  close(w.Pdyn, 0.5 * 1000 * 9, 1e-9);
  assert.strictEqual(drop({ a: 10, b: 10, h: 20, wet: true }).mode, 'wenzel', '被刺穿過就一直是 Wenzel');
  const g = B.drop({ a: 10, b: 10, h: 20, thY: 25, hyst: 10, V: 10 });
  assert.strictEqual(g.mode, 'spread'); assert.strictEqual(g.roll, null);
  assert.strictEqual(B.drop({ a: 10, b: 10, h: 20, thY: 87, hyst: 6, V: 10 }).mode, 'wenzel', 'θA < 90° 留不住空氣');
});

test('Furmidge 滾落角：sin α = kγw(cos θR − cos θA)/(mg)；Cassie 遠比平面、Wenzel 好滾', () => {
  const s = drop({ a: 0, b: 0, h: 0 });
  const g = B.cap(10, 109), dc = B.cosd(104) - B.cosd(114);
  close(Math.sin(s.roll * Math.PI / 180), 0.072 * 2 * g.c * dc / (1000 * 10e-9 * 9.81), 1e-12);
  const c = drop({ a: 2, b: 8, h: 10 }), w = drop({ a: 2, b: 8, h: 10, v: 3 });
  assert.ok(c.roll < 1, 'Cassie 不到 1° 就滾：' + c.roll);
  assert.ok(w.roll > 20 && s.roll > 15, 'Wenzel 與平面要傾斜很多：' + w.roll + '、' + s.roll);
  // 大水珠比較容易滾（重量 ∝ V，接觸寬度 ∝ V^(1/3)）
  assert.ok(drop({ a: 0, b: 0, h: 0, V: 40 }).roll < s.roll);
});

test('Cassie 的遲滯 ∝ φ、Wenzel 的遲滯 ∝ r（Δcos）', () => {
  const dcY = B.cosd(104) - B.cosd(114);
  const c = drop({ a: 5, b: 15, h: 10 });
  close(c.dcos, c.phi * dcY, 1e-12);
  const w = drop({ a: 5, b: 15, h: 10, v: 5 });
  close(w.dcos, w.r * dcY, 1e-12);
});

test('自我清潔：水珠沾走路徑寬度內的灰塵（標成 2），不重複計算', () => {
  const xs = [0, 0.4, 0.6, 1, 2], alive = new Uint8Array(xs.length).fill(1);
  assert.deepStrictEqual(B.sweep(xs, alive, 0.5, 0.4), [1, 2]);
  assert.deepStrictEqual(B.sweep(xs, alive, 0.5, 1.2), [0, 3]);
  assert.deepStrictEqual(Array.from(alive), [2, 2, 2, 2, 1]);
  // 沿路徑：只清下坡那一段；落點蓋住的也帶走
  const X = [5, 5, 5, 6, 5.2], Y = [1, 5, 9, 5, 3], al = new Uint8Array(5).fill(1);
  assert.deepStrictEqual(B.sweepPath(X, Y, al, 5, 4, 10, 1), [1, 2]);
  assert.deepStrictEqual(B.capture(X, Y, al, 5, 3, 0.5), [4]);
  assert.deepStrictEqual(B.sweepPath(X, Y, al, 5, 4, 10, 1), []);
});

test('凡得瓦：力 ∝ 1/D²；JKR 匙突拉脫力與實測 10 nN 同數量級', () => {
  close(B.vdwSphere(1e-7, 0.2e-9) / B.vdwSphere(1e-7, 0.4e-9), 4, 1e-12);
  close(B.W_VDW, 6.8e-20 / (12 * Math.PI * 0.165e-9 * 0.165e-9), 1e-12);
  const F = B.jkr(B.GECKO.spatulaR);
  assert.ok(F > B.GECKO.spatulaF && F < 10 * B.GECKO.spatulaF, 'JKR 估計 ' + F);
});

test('接觸分岔：總面積不變，分成 n 個尖端總拉脫力變 √n 倍', () => {
  const A = 1e-6;   // 1 mm²
  [1, 100, 1e4].forEach(function (n) {
    const R = Math.sqrt(A / (n * Math.PI));
    close(n * B.jkr(R) / B.jkr(Math.sqrt(A / Math.PI)), B.splitGain(n), 1e-9);
  });
});

test('Kendall 剝離：不可伸長時 F/b = W/(1 − cos θ)；90° 時 = W；有彈性時 0° 是有限值', () => {
  close(B.kendall(90, 0.07, Infinity), 0.07, 1e-12);
  close(B.kendall(60, 0.07, Infinity), 0.14, 1e-12);
  assert.ok(B.kendall(10, 0.07, Infinity) > 10 * B.kendall(60, 0.07, Infinity), '角度小很難撕');
  close(B.kendall(0, 0.07, 20), Math.sqrt(2 * 20 * 0.07), 1e-12);
  // 彈性解滿足 Kendall 方程
  const f = B.kendall(30, 0.07, 20), k = 1 - B.cosd(30);
  close(f * f / 40 + f * k - 0.07, 0, 1e-12);
});

test('壁虎：全部剛毛約可撐 130 kg；天花板靠附著力（tan 30°）、垂直牆靠剪力', () => {
  close(B.GECKO.setae * B.GECKO.Fs / B.G, 128.5, 1);
  const wall = B.gecko(90, 0.1, 0.001), ceil = B.gecko(180, 0.1, 0.001);
  assert.strictEqual(wall.limit, 'shear'); close(wall.P, 0, 1e-12);
  assert.strictEqual(ceil.limit, 'adhesion'); close(ceil.S, 0, 1e-12);
  close(ceil.Pmax, ceil.Smax * Math.tan(30 * Math.PI / 180), 1e-12);
  // 剛好撐住的比例
  const f = B.minFraction(180, 0.1);
  close(B.gecko(180, 0.1, f).use, 1, 1e-9);
  assert.ok(B.gecko(180, 0.1, f * 1.01).hold && !B.gecko(180, 0.1, f * 0.99).hold);
  assert.ok(f < 0.01, '天花板上 100 g 只要不到 1% 的剛毛：' + f);
  assert.ok(B.gecko(0, 0.1, 0).hold, '在地板上不用黏');
});

console.log(passed + ' 項通過');
