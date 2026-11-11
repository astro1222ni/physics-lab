// 以 Node 執行：node tests/dc-circuit-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/dc-circuit-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
/** 決定性的亂數（每次測試結果相同） */
let seed = 12345;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
function rndR() { return Math.exp(Math.log(0.5) + rnd() * Math.log(200)); } // 0.5–100 Ω

/** 建好預設電路後套用參數 */
function make(name, count, set) {
  const c = K.preset(name, count);
  if (set) Object.keys(set).forEach(function (id) {
    const k = K.indexOf(c, id);
    Object.assign(c.elements[k], typeof set[id] === 'number' ? { R: set[id] } : set[id]);
  });
  return c;
}
function I(c, sol, id) { return sol.I[K.indexOf(c, id)]; }
function randomize(c) {
  c.elements.forEach(function (e) {
    if (e.type === 'R') e.R = rndR();
    if (e.type === 'battery') { e.emf = 1.5 + rnd() * 10.5; e.r = rnd() < 0.3 ? 0 : rnd() * 5; }
    if (e.type === 'switch') e.closed = rnd() < 0.75;
  });
  return c;
}
const ALL = [];
K.PRESETS.forEach(function (p) { [2, 3].forEach(function (n) { ALL.push([p, n]); }); });

console.log('dc-circuit-core');

test('線性方程組：部分選主元高斯消去，奇異矩陣傳回 null', () => {
  const x = K.solveLinear([[0, 2, 1], [1, 1, 1], [2, 1, 0]], [7, 6, 4]);
  [1, 2, 3].forEach((v, i) => close(x[i], v, 1e-12, 'x' + i));
  assert.strictEqual(K.solveLinear([[1, 2], [2, 4]], [1, 2]), null);
});

test('單一電阻：I = ε/(R + r)，端電壓 V = ε − Ir = IR', () => {
  for (const [emf, r, R] of [[6, 0, 10], [6, 1, 5], [12, 2.5, 0.5], [1.5, 0.3, 100]]) {
    const c = make('single', 3, { E: { emf, r }, R1: R });
    const s = K.solve(c), b = K.batteryReport(c, s, 0);
    close(b.I, emf / (R + r), 1e-12, 'I');
    close(b.Vt, emf - b.I * r, 1e-12, 'V = ε − Ir');
    close(b.Vt, b.I * R, 1e-12, 'V = IR');
    close(I(c, s, 'R1'), b.I, 1e-12, '串聯電流相同');
    close(b.Req, R, 1e-12, 'Req');
  }
});

test('串聯等效電阻 R = R1 + R2 + R3（2 個與 3 個），每個元件電流相同、電壓與電阻成正比', () => {
  for (const n of [2, 3]) for (let t = 0; t < 20; t++) {
    const Rs = [rndR(), rndR(), rndR()];
    const set = { L1: Rs[0], L2: Rs[1], E: { emf: 9, r: 0.7 } };
    if (n === 3) set.L3 = Rs[2];
    const c = make('series', n, set);
    const sum = K.series(Rs.slice(0, n));
    close(K.resistanceBetween(c, 1, 0), sum, 1e-11, 'resistanceBetween');
    const s = K.solve(c), b = K.batteryReport(c, s, 0);
    close(b.Req, sum, 1e-11, 'Req');
    close(b.I, 9 / (sum + 0.7), 1e-11, 'I');
    for (let i = 0; i < n; i++) {
      const k = K.indexOf(c, 'L' + (i + 1));
      close(s.I[k], b.I, 1e-11, '電流相同');
      close(s.Vab[k], b.I * Rs[i], 1e-11, 'V = IR');
    }
  }
});

test('並聯等效電阻 1/R = 1/R1 + 1/R2 + 1/R3，各支路電壓相同 = 端電壓', () => {
  for (const n of [2, 3]) for (let t = 0; t < 20; t++) {
    const Rs = [rndR(), rndR(), rndR()].slice(0, n);
    const set = { E: { emf: 6, r: 0.4 } };
    Rs.forEach((R, i) => { set['L' + (i + 1)] = R; });
    const c = make('parallel', n, set);
    const par = K.parallel(Rs);
    close(par, 1 / Rs.reduce((s, R) => s + 1 / R, 0), 1e-14, 'parallel()');
    const s = K.solve(c), b = K.batteryReport(c, s, 0);
    close(b.Req, par, 1e-11, 'Req');
    close(b.I, 6 / (par + 0.4), 1e-11, 'I');
    Rs.forEach((R, i) => {
      const k = K.indexOf(c, 'L' + (i + 1));
      close(s.Vab[k], b.Vt, 1e-11, '支路電壓 = 端電壓');
      close(s.I[k], b.Vt / R, 1e-11, '支路電流');
    });
  }
  close(K.parallel([4, 6, 12]), 2, 1e-14, '4 ∥ 6 ∥ 12 = 2');
});

test('串並聯混合：I = ε/(R1 + R2∥R3 + r)，分流 I2/I3 = R3/R2', () => {
  for (let t = 0; t < 20; t++) {
    const R1 = rndR(), R2 = rndR(), R3 = rndR(), emf = 3 + rnd() * 9, r = rnd() * 4;
    const c = make('mixed', 3, { L1: R1, L2: R2, L3: R3, E: { emf, r } });
    const s = K.solve(c);
    const Itot = emf / (R1 + K.parallel([R2, R3]) + r);
    close(I(c, s, 'L1'), Itot, 1e-11, 'I1');
    close(I(c, s, 'L2'), Itot * R3 / (R2 + R3), 1e-11, 'I2');
    close(I(c, s, 'L3'), Itot * R2 / (R2 + R3), 1e-11, 'I3');
    close(K.batteryReport(c, s, 0).Req, R1 + K.parallel([R2, R3]), 1e-11, 'Req');
  }
});

test('克希何夫電流定律：所有預設電路（隨機數值、隨機開關）每個節點流入 = 流出', () => {
  for (let t = 0; t < 40; t++) for (const [p, n] of ALL) {
    const c = randomize(K.preset(p, n));
    const s = K.solve(c);
    assert.ok(s.ok, p + ' 求解失敗');
    const net = new Array(c.n).fill(0);
    c.elements.forEach((e, k) => { net[e.a] -= s.I[k]; net[e.b] += s.I[k]; });
    net.forEach((v, i) => assert.ok(Math.abs(v) < 1e-10, `${p} 節點 ${i} 淨電流 ${v}`));
    c.elements.forEach((e, k) => { if (e.type === 'switch' && !e.closed) assert.strictEqual(s.I[k], 0, '斷開的開關電流為 0'); });
  }
});

test('克希何夫電壓定律：每個元件 V = IR、電池 ΔV = ε − Ir、導線兩端等電位；沿迴路電壓和為 0', () => {
  for (let t = 0; t < 40; t++) for (const [p, n] of ALL) {
    const c = randomize(K.preset(p, n));
    const s = K.solve(c);
    c.elements.forEach((e, k) => {
      if (e.type === 'R') close(s.Vab[k], s.I[k] * e.R, 1e-10, p + ' ' + e.id + ' 歐姆定律');
      if (e.type === 'wire' || (e.type === 'switch' && e.closed)) close(s.Vab[k], 0, 1e-12, '導線等電位');
      if (e.type === 'battery') close(-s.Vab[k], e.emf - s.I[k] * e.r, 1e-10, '電池');
    });
  }
  // 惠斯登電橋的三個網孔：沿迴路的電位升降總和為 0
  const c = randomize(K.preset('wheatstone'));
  c.elements.forEach((e) => { if (e.type === 'switch') e.closed = true; });
  const s = K.solve(c);
  const drop = (id) => s.Vab[K.indexOf(c, id)];  // V(a) − V(b)
  close(drop('R1') + drop('G') - drop('R3'), 0, 1e-10, '上網孔 R1 → G → R3');
  close(drop('R2') - drop('Rx') - drop('G'), 0, 1e-10, '下網孔 R2、Rx、G');
  const e = c.elements[0];
  close(e.emf - s.I[0] * e.r - drop('R1') - drop('R2'), 0, 1e-10, '電池 → R1 → R2 → 電池');
});

test('功率守恆：εI = I²r + ΣI²R（所有預設電路、隨機數值）', () => {
  for (let t = 0; t < 40; t++) for (const [p, n] of ALL) {
    const c = randomize(K.preset(p, n));
    const s = K.solve(c), b = K.batteryReport(c, s, 0);
    let sum = 0;
    c.elements.forEach((e, k) => { if (e.type === 'R') sum += s.I[k] * s.I[k] * e.R; });
    close(b.Pemf, b.Pint + sum, 1e-10, p + ' εI = I²r + ΣI²R');
    close(b.Pout, sum, 1e-10, p + ' 輸出功率 = ΣI²R');
    if (b.Pemf > 0) close(b.eta, b.Vt / c.elements[0].emf, 1e-10, 'η = V/ε');
  }
});

test('惠斯登電橋：R1/R2 = R3/Rx 時檢流計電流為 0（與檢流計電阻、電動勢無關）', () => {
  for (let t = 0; t < 30; t++) {
    const R1 = rndR(), R2 = rndR(), R3 = rndR(), kx = R2 / R1;
    const Rx = R3 * kx;
    const c = make('wheatstone', 3, { R1, R2, R3, Rx, G: rndR(), E: { emf: 1.5 + rnd() * 10, r: rnd() * 5 } });
    const s = K.solve(c);
    assert.ok(Math.abs(I(c, s, 'G')) < 1e-12, '平衡時 Ig = ' + I(c, s, 'G'));
    close(K.batteryReport(c, s, 0).Req, K.parallel([R1 + R2, R3 + Rx]), 1e-11, '平衡時 Req = (R1+R2)∥(R3+Rx)');
  }
  // 不平衡：檢流計電流與戴維寧等效電路的結果相同
  for (let t = 0; t < 30; t++) {
    const R1 = rndR(), R2 = rndR(), R3 = rndR(), Rx = rndR(), Rg = rndR(), emf = 6;
    const c = make('wheatstone', 3, { R1, R2, R3, Rx, G: Rg, E: { emf, r: 0 } });
    const s = K.solve(c);
    const Vth = emf * (R2 / (R1 + R2) - Rx / (R3 + Rx));          // V(C) − V(D)
    const Rth = K.parallel([R1, R2]) + K.parallel([R3, Rx]);
    close(I(c, s, 'G'), Vth / (Rth + Rg), 1e-10, '戴維寧');
  }
});

test('最大功率轉移：負載 R = r 時輸出功率最大，P = ε²/4r、效率 50%', () => {
  for (const [emf, r] of [[6, 1], [12, 2.5], [4.5, 0.3], [9, 5]]) {
    let best = -1, bestR = 0;
    for (let i = 0; i <= 20000; i++) {
      const R = 0.01 + i * 0.001;
      const c = make('internal', 3, { R, E: { emf, r } });
      const s = K.solve(c), P = s.P[K.indexOf(c, 'R')];
      close(P, K.loadPower(emf, r, R), 1e-10, 'P = ε²R/(R+r)²');
      if (P > best) { best = P; bestR = R; }
    }
    assert.ok(Math.abs(bestR - r) <= 0.0011, `最大功率在 R = ${bestR}，應為 ${r}`);
    close(best, K.maxLoadPower(emf, r), 1e-6, 'Pmax');
    const c = make('internal', 3, { R: r, E: { emf, r } });
    close(K.batteryReport(c, K.solve(c), 0).eta, 0.5, 1e-12, 'η = 50%');
  }
  // 同一個輸出功率有兩個負載：R1·R2 = r²
  close(K.loadPower(6, 2, 1), K.loadPower(6, 2, 4), 1e-14, 'R1R2 = r²');
});

test('斷開開關等於拿掉那條支路；主開關斷開時沒有電流，斷開處的電壓等於電動勢', () => {
  for (let t = 0; t < 20; t++) {
    const Rs = [rndR(), rndR(), rndR()];
    const c = make('parallel', 3, { L1: Rs[0], L2: Rs[1], L3: Rs[2], S2: { closed: false }, E: { emf: 6, r: 0.5 } });
    const s = K.solve(c), b = K.batteryReport(c, s, 0);
    const ref = K.parallel([Rs[0], Rs[2]]);
    close(b.Req, ref, 1e-11, 'Req 只剩兩支路');
    close(b.I, 6 / (ref + 0.5), 1e-11, 'I');
    assert.strictEqual(I(c, s, 'L2'), 0, '被斷開的支路沒有電流');
    const c2 = make('parallel', 2, { L1: Rs[0], L2: Rs[2], E: { emf: 6, r: 0.5 } });
    close(K.batteryReport(c2, K.solve(c2), 0).I, b.I, 1e-11, '與兩支路電路相同');
  }
  for (const [p, n] of ALL) {
    const c = randomize(K.preset(p, n));
    const main = c.elements.find((e) => e.id === 'S0' || e.id === 'S1');
    main.closed = false;
    const s = K.solve(c), b = K.batteryReport(c, s, 0);
    assert.strictEqual(b.I, 0, p + ' 主開關斷開時電流為 0');
    assert.strictEqual(b.Req, Infinity, p + ' 外電路開路 Req = ∞');
    close(Math.abs(s.V[main.a] - s.V[main.b]), c.elements[0].emf, 1e-12, p + ' 開關兩端電壓 = ε');
  }
  // 混合電路斷開 S2：只剩 L1 與 L2 串聯
  const c = make('mixed', 3, { L1: 3, L2: 7, L3: 5, S2: { closed: false }, E: { emf: 5, r: 0 } });
  close(K.batteryReport(c, K.solve(c), 0).I, 0.5, 1e-12, '5 V / 10 Ω');
});

test('零電阻導線的穩健性：導線並聯成迴路、R = 0、浮接節點、理想電池短路', () => {
  // 1. 兩條導線並聯接在電阻兩端：電流在兩條導線上平分，電阻被短路
  const c1 = { n: 3, elements: [
    { type: 'battery', a: 0, b: 1, emf: 6, r: 1 },
    { type: 'wire', a: 1, b: 2 }, { type: 'wire', a: 1, b: 2 },
    { type: 'R', a: 2, b: 0, R: 5 }, { type: 'wire', a: 2, b: 0 }
  ] };
  let s = K.solve(c1);
  assert.ok(s.ok);
  close(s.I[0], 6, 1e-12, '只剩內電阻：I = ε/r');
  close(s.I[1], 3, 1e-12, '導線 1 平分');
  close(s.I[2], 3, 1e-12, '導線 2 平分');
  assert.strictEqual(s.I[3], 0, '被短路的電阻沒有電流');
  close(s.I[4], 6, 1e-12, '短路導線');
  // 2. R = 0 的電阻當成導線
  const c2 = make('series', 3, { L2: 0, L1: 3, L3: 3, E: { emf: 6, r: 0 } });
  close(K.batteryReport(c2, K.solve(c2), 0).I, 1, 1e-12, 'R = 0 不出錯');
  // 3. 浮接節點：斷開的開關後面接一段懸空的電阻
  const c3 = { n: 4, elements: [
    { type: 'battery', a: 0, b: 1, emf: 6, r: 0 }, { type: 'R', a: 1, b: 0, R: 3 },
    { type: 'switch', a: 1, b: 2, closed: false }, { type: 'R', a: 2, b: 3, R: 10 }
  ] };
  s = K.solve(c3);
  assert.ok(s.ok && s.floating[2] && s.floating[3] && !s.floating[0] && !s.floating[1], '浮接標記');
  close(s.I[1], 2, 1e-12, '主迴路不受影響');
  assert.strictEqual(s.I[3], 0, '浮接元件沒有電流');
  // 4. 理想電池被導線短路：回報短路
  const c4 = { n: 2, elements: [{ type: 'battery', a: 0, b: 1, emf: 6, r: 0 }, { type: 'wire', a: 1, b: 0 }] };
  s = K.solve(c4);
  assert.ok(!s.ok && s.short, '理想電池短路');
  // 有內電阻就不是無限大：I = ε/r
  c4.elements[0].r = 0.5;
  s = K.solve(c4);
  close(s.I[0], 12, 1e-12, '短路電流 ε/r');
  close(s.I[1], 12, 1e-12, '短路導線電流');
  // 5. 兩點之間沒有通路：等效電阻無限大；被導線連起來：等效電阻 0
  assert.strictEqual(K.resistanceBetween(c3, 1, 3), Infinity);
  assert.strictEqual(K.resistanceBetween(c1, 2, 0), 0);
});

test('理想電池（r = 0）與有內電阻的電池結果連續（r → 0 極限）', () => {
  const c0 = make('mixed', 3, { L1: 2, L2: 3, L3: 6, E: { emf: 6, r: 0 } });
  const c1 = make('mixed', 3, { L1: 2, L2: 3, L3: 6, E: { emf: 6, r: 1e-7 } });
  const s0 = K.solve(c0), s1 = K.solve(c1);
  close(s0.I[0], 1.5, 1e-12, '6 V / 4 Ω');
  c0.elements.forEach((e, k) => close(s0.I[k], s1.I[k], 1e-6, e.id));
});

test('預設電路的預設值：電路連通、讀數合理、電位參考點在電池負極', () => {
  const expect = { single: 0.6, series: 1 / 3, parallel: 6 / (36 / 11), mixed: 6 / 7, internal: 1, wheatstone: null };
  K.PRESETS.forEach((p) => {
    const c = K.preset(p, 3), s = K.solve(c), b = K.batteryReport(c, s, 0);
    assert.ok(s.ok, p);
    assert.strictEqual(s.V[0], 0, '負極 0 V');
    if (expect[p] != null) close(b.I, expect[p], 1e-12, p + ' 預設電流');
    c.nodes.forEach((q) => assert.ok(q.x >= 0 && q.x <= 6 && q.y >= 0 && q.y <= 4, '座標範圍'));
    c.elements.forEach((e) => {
      const A = c.nodes[e.a], B = c.nodes[e.b];
      assert.ok(A.x === B.x || A.y === B.y, p + ' ' + e.id + ' 必須是水平或垂直線段');
    });
  });
  // 預設的惠斯登電橋不平衡（使用者必須自己調平衡）
  const c = K.preset('wheatstone'), s = K.solve(c);
  assert.ok(Math.abs(s.I[K.indexOf(c, 'G')]) > 1e-3, '預設不平衡');
});

console.log(`\n${passed} 項通過${process.exitCode ? '，有測試失敗' : ''}`);
