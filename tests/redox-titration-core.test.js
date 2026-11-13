// 以 Node 執行：node tests/redox-titration-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/redox-titration-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`);
}
let seed = 20261113;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
/** 讓草酸的反應跑到 MnO4- 用完（或時間到） */
function settleOx(f, tmax) { let t = 0; while (f.nMnO4 > 0 && f.nA > 0 && t < (tmax || 3600)) { K.advance(f, 0.05); t += 0.05; } return t; }
/** 一滴一滴加，記錄第一次粉紅色消失 */
function firstFade(T, dt) {
  const f = K.createFlask(K.setup({ sys: 'ox', Ca: 0.05, Va: 25, Vacid: 10, Cb: 0.02, T: T }));
  K.addTitrant(f, 0.05);
  let t = 0, ev = [];
  while (!ev.length && t < 10000) { ev = K.advance(f, dt); t += dt; }
  return ev[0];
}

const FE = K.setup({ sys: 'fe', Ca: 0.1, Va: 25, Vacid: 10, Cb: 0.02 });
const OX = K.setup({ sys: 'ox', Ca: 0.05, Va: 25, Vacid: 10, Cb: 0.02, T: 65 });

test('常數：E°(Fe3+/Fe2+) = 0.771 V、E°(MnO4-/Mn2+) = 1.507 V（OpenStax 附錄 L）、s = 0.05916 V、一滴 0.05 mL', function () {
  assert.strictEqual(K.E_FE, 0.771);
  assert.strictEqual(K.E_MN, 1.507);
  near(K.S, 8.314462 * 298.15 * Math.LN10 / 96485.33, 2e-5, 'RT ln10 / F');
  assert.strictEqual(K.UNIT_ML * K.UNITS_PER_ML, 1);
  assert.strictEqual(K.BURETTE_UNITS, 2000);
  assert.deepStrictEqual(K.moleRatio('fe'), [1, 5]);
  assert.deepStrictEqual(K.moleRatio('ox'), [2, 5]);
});

test('當量點體積：Fe2+ 1 : 5、草酸 2 : 5（預設都是 25.00 mL）', function () {
  near(K.Veq(FE), 25, 1e-12);
  near(K.Veq(OX), 25, 1e-12);
  for (let i = 0; i < 50; i++) {
    const Ca = 0.02 + 0.2 * rnd(), Va = 5 + 45 * rnd(), Cb = 0.005 + 0.05 * rnd();
    near(K.Veq(K.setup({ sys: 'fe', Ca, Va, Vacid: 10, Cb })), Ca * Va / 5 / Cb, 1e-9);
    near(K.Veq(K.setup({ sys: 'ox', Ca, Va, Vacid: 10, Cb, T: 65 })), 2 * Ca * Va / 5 / Cb, 1e-9);
  }
});

test('標定：0.1576 g H2C2O4·2H2O（1.250 mmol）需要 0.0200 M KMnO4 25.00 mL；反算濃度', function () {
  const p = K.setup({ sys: 'std', mass: 0.1576, Va: 25, Vacid: 10, Cb: 0.02, T: 65 });
  near(p.nA, 1.2501, 1e-4);
  near(K.Veq(p), 25.002, 1e-3);
  near(K.cbFromStd(0.1576, 25.00), 0.02000, 2e-5);
  near(K.cFeFrom(0.02, 25, 25), 0.1, 1e-12);
});

test('Fe2+：反應完全、電子守恆（加入的 MnO4- × 5 = 生成的 Fe3+）', function () {
  for (const V of [0.05, 5, 12.5, 24.975]) {
    const f = K.stateAt(FE, V);
    near(f.nP, 5 * FE.Cb * V, 1e-9, 'V = ' + V);
    near(f.nA + f.nP, FE.nA, 1e-12);
    assert.strictEqual(f.nMnO4, 0);
    assert.strictEqual(f.nMnO2, 0);
  }
  const g = K.stateAt(FE, 30);
  assert.strictEqual(g.nA, 0);
  near(g.nMnO4, 0.02 * 5, 1e-9, '過量的 MnO4-');
  near(g.nMn2, 0.5, 1e-9);
});

test('半當量點的電位 = E°(Fe3+/Fe2+) = 0.771 V；起點 0.594 V（0.1% Fe3+）', function () {
  near(K.E_at(FE, 12.5), 0.771, 1e-4);
  near(K.E_at(FE, 0), 0.771 + K.S * Math.log10(0.001 / 0.999), 1e-6);
  // 能斯特方程式：當量點前 E = E° + s·log([Fe3+]/[Fe2+])
  for (const V of [2, 5, 10, 20, 24]) near(K.E_at(FE, V), 0.771 + K.S * Math.log10(V / (25 - V)), 1e-6, 'V = ' + V);
});

test('當量點電位 = 加權平均 (E°Fe + 5E°\'Mn)/6，[H+] = 1 M 時 = 1.384 V', function () {
  near((K.E_FE + 5 * K.E_MN) / 6, 1.3843, 1e-4);
  near(K.E_at(FE, 25), K.Eeq(FE), 1e-5, '解電子平衡的電位');
  for (let i = 0; i < 20; i++) {
    const p = K.setup({ sys: 'fe', Ca: 0.02 + 0.15 * rnd(), Va: 10 + 30 * rnd(), Vacid: 5 + 15 * rnd(), Cb: 0.01 + 0.03 * rnd() });
    near(K.E_at(p, K.Veq(p)), K.Eeq(p), 2e-4, '隨機 ' + i);
  }
});

test('兩倍當量點的電位 = E°\'(MnO4-/Mn2+) = 1.507 + (8s/5)·log[H+]；酸越少越低', function () {
  const f = K.stateAt(FE, 50);
  near(K.potential(f), K.E2prime(K.hFree(f)), 1e-6);
  const lo = K.setup({ sys: 'fe', Ca: 0.1, Va: 25, Vacid: 3, Cb: 0.02 }), hi = K.setup({ sys: 'fe', Ca: 0.1, Va: 25, Vacid: 20, Cb: 0.02 });
  const d = K.E_at(hi, 50) - K.E_at(lo, 50);
  assert.ok(d > 0.05, '硫酸 3 mL 與 20 mL 的差 ' + d);
});

test('電位隨體積上升到當量點之後（再過去 [H+] 被稀釋，略降）；當量點前後一滴（±0.025 mL）跳超過 0.4 V', function () {
  let prev = -1;
  for (let V = 0; V <= 30; V += 0.25) { const E = K.E_at(FE, V); assert.ok(E >= prev - 1e-9, 'V = ' + V); prev = E; }
  assert.ok(K.E_at(FE, 25.025) - K.E_at(FE, 24.975) > 0.4);
});

test('稀釋十倍：電位曲線幾乎不變（氧化還原滴定與濃度無關）', function () {
  const d = K.setup({ sys: 'fe', Ca: 0.01, Va: 25, Vacid: 10, Cb: 0.002 });
  for (const V of [5, 12.5, 20, 30, 40]) near(K.E_at(d, V), K.E_at(FE, V), 0.01, 'V = ' + V);
});

test('[H+]：3 M 硫酸 10 mL 加到 25 mL 水約 0.87 M；Fe2+ 滴定每個 MnO4- 用掉 8 個 H+', function () {
  near(K.hFree(K.createFlask(FE)), 0.869, 0.01);
  const f = K.stateAt(FE, 20);
  near(f.Hb, 60 - 8 * 0.4, 1e-9);
  const z = K.createFlask(K.setup({ sys: 'fe', Ca: 0.1, Va: 25, Vacid: 0, Cb: 0.02 }));
  near(K.hFree(z), 1e-7, 1e-12);
});

test('沒加酸：生成 MnO2，每個 MnO4- 只拿 3 個電子，用掉的 KMnO4 變成 5/3 倍', function () {
  const p = K.setup({ sys: 'fe', Ca: 0.1, Va: 25, Vacid: 0, Cb: 0.02 });
  assert.strictEqual(K.phiMnO2(1e-7) > 0.99, true);
  assert.strictEqual(K.phiMnO2(0.12), 0);
  const f = K.stateAt(p, 30);
  near(f.nMnO2, 0.6, 1e-5); near(f.nA, 2.5 - 1.8, 1e-4);
  const g = K.stateAt(p, 25 * 5 / 3 + 0.5);
  assert.strictEqual(g.nA, 0);
  assert.ok(g.nMnO4 > 0);
  assert.ok(K.transmit(g).turb > 0.9, '棕色混濁');
});

test('草酸：完全反應後 2 : 5、生成 10 個 CO2；過了當量點才有電位', function () {
  const f = K.stateAt(OX, 20);
  near(OX.nA - f.nA, 2.5 * 0.4, 1e-9);
  near(f.nP, 5 * 0.4, 1e-9);
  assert.strictEqual(K.potential(f), null);
  const g = K.stateAt(OX, 30);
  near(K.potential(g), K.E2prime(K.hFree(g)) + K.S / 5 * Math.log10(0.1 / 0.5), 1e-6);
});

test('草酸的自催化：65 °C 第一滴約 34 s 才褪色，加了 5 mL 之後一滴不到 2 s', function () {
  const a = firstFade(65, 0.05);
  assert.ok(a.first && a.dur > 25 && a.dur < 45, '第一滴 ' + a.dur);
  const f = K.createFlask(OX);
  K.addTitrant(f, 5); settleOx(f);
  K.addTitrant(f, 0.05);
  let ev = [], t = 0; while (!ev.length && t < 100) { ev = K.advance(f, 0.01); t += 0.01; }
  assert.ok(ev[0].dur < 2, '之後一滴 ' + ev[0].dur);
  assert.ok(K.kRate(f) > 10 * K.k0(65), '[Mn2+] 讓速率常數變大 ' + K.kRate(f) / K.k0(65));
});

test('阿瑞尼斯：25 °C 比 65 °C 慢約 17.6 倍；第一滴的褪色時間差 10 倍以上', function () {
  near(K.k0(65) / K.k0(25), Math.exp(60000 / 8.314 * (1 / 298.15 - 1 / 338.15)), 1e-9);
  near(K.k0(65) / K.k0(25), 17.6, 0.2);
  const a = firstFade(65, 0.1), b = firstFade(25, 0.5);
  assert.ok(b.dur / a.dur > 10, '比值 ' + b.dur / a.dur);
});

test('草酸 85 °C 以下不分解；95 °C 放 3 分鐘少掉約 7%', function () {
  assert.strictEqual(K.kDec(85), 0);
  near(K.kDec(95), 4e-4, 1e-12);
  const f = K.createFlask(K.setup({ sys: 'ox', Ca: 0.05, Va: 25, Vacid: 10, Cb: 0.02, T: 95 }));
  K.advance(f, 180);
  near(f.dec / 1.25, 1 - Math.exp(-4e-4 * 180), 1e-6);
  const g = K.createFlask(OX); K.advance(g, 600);
  assert.strictEqual(g.dec, 0);
});

test('粉紅色：過量半滴（0.025 mL × 0.0200 M）就看得到；剛好在當量點看不到', function () {
  const f = K.createFlask(FE);
  K.addTitrant(f, 25);
  assert.strictEqual(K.pink(f), false);
  K.addTitrant(f, 0.025);
  assert.strictEqual(K.pink(f), true);
  const t = K.transmit(f).T, t0 = K.transmit(K.stateAt(FE, 25)).T;
  assert.ok(t[1] / t0[1] < 0.95 && t[0] / t0[0] > 0.98, '多出來的 MnO4- 吸收綠光（看起來偏粉紅）');
  const m = K.mnO4Transmit(0.025 * 0.02 / 60);
  assert.ok(m[1] < m[0] && m[1] < m[2] && m[1] > 0.8, '只看 MnO4-：淡粉紅');
  const g = K.createFlask(FE); K.addTitrant(g, 24.975); assert.strictEqual(K.pink(g), false);
});

test('Fe3+ 讓溶液帶黃色（藍光被吸收），當量點前沒有 MnO4- 的紫色', function () {
  const f = K.stateAt(FE, 24);
  const t = K.transmit(f).T;
  assert.ok(t[2] < t[1] && t[1] <= t[0], '黃色：' + t);
});

test('未知樣品：KMnO4 0.0150–0.0250 M、Fe2+ 0.060–0.140 M', function () {
  for (let i = 0; i < 300; i++) {
    const s = K.mysterySample(rnd);
    assert.ok(s.Cb >= 0.015 && s.Cb <= 0.025);
    assert.ok(s.CFe >= 0.06 && s.CFe <= 0.14);
  }
});

console.log(`\n通過 ${passed} 項`);
