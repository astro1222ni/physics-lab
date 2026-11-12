// 以 Node 執行：node tests/geologic-time-core.test.js
'use strict';
const assert = require('assert');
const G = require('../js/geologic-time-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }

console.log('geologic-time-core');

test('半衰期：U-238 約 44.7 億年、U-235 約 7.04 億年、K-40 約 12.5 億年、Rb-87 約 496 億年、C-14 5700 年', () => {
  near(G.halfLife('U238') / 1e9, 4.468, 0.002);
  near(G.halfLife('U235') / 1e6, 703.8, 0.2);
  near(G.halfLife('K40') / 1e9, 1.2505, 0.0005);
  near(G.halfLife('Rb87') / 1e9, 49.61, 0.02);
  near(G.halfLife('C14'), 5700, 1e-9);
});

test('衰變定律：經過一個半衰期 D/P = 1、兩個 = 3；C-14 剩一半、四分之一', () => {
  near(G.ratioAt('U238', G.halfLife('U238')), 1, 1e-12);
  near(G.ratioAt('U235', 2 * G.halfLife('U235')), 3, 1e-12);
  near(G.ratioAt('C14', 5700), 0.5, 1e-12);
  near(G.ratioAt('C14', 11400), 0.25, 1e-12);
  // K-40 只有 10.48% 變成 Ar-40：一個半衰期後 Ar/K = 0.1048
  near(G.ratioAt('K40', G.halfLife('K40')), 0.581 / 5.543, 1e-12);
});

test('年齡公式是衰變定律的反函數（各種年齡、各種方法）', () => {
  ['U238', 'U235', 'K40', 'Rb87'].forEach(s => {
    [1e6, 6.6e7, 5.4e8, 4.5e9].forEach(t => near(G.ageFrom(s, G.ratioAt(s, t)) / t, 1, 1e-10, s));
  });
  [100, 5700, 30000].forEach(t => near(G.ageFrom('C14', G.ratioAt('C14', t)), t, 1e-6));
});

test('誤差傳遞：dt = dr / (λ(B + r))，與數值差分相同', () => {
  ['U238', 'K40', 'C14'].forEach(s => {
    const t = s === 'C14' ? 8000 : 3e8, r = G.ratioAt(s, t), rel = 0.004;
    const num = Math.abs(G.ageFrom(s, r * (1 + rel / 2)) - G.ageFrom(s, r * (1 - rel / 2)));
    near(G.ageSigma(s, r, rel) / num, 1, 1e-4, s);
  });
});

test('等時線：沒有雜訊時斜率 = e^{λt} − 1、截距 = 初始 Sr 比值，年齡完全還原', () => {
  const t = 1.43e9, fit = G.fitIsochron(G.isochron(t));
  near(fit.slope, Math.expm1(G.SYSTEMS.Rb87.lambda * t), 1e-12);
  near(fit.icpt, G.SR0, 1e-12);
  near(fit.age / t, 1, 1e-9);
});

test('擬隨機量測可重現，平均約 0、標準差約 1', () => {
  assert.strictEqual(G.gauss('x1'), G.gauss('x1'));
  let s = 0, s2 = 0; const n = 4000;
  for (let i = 0; i < n; i++) { const g = G.gauss('s' + i); s += g; s2 += g * g; }
  near(s / n, 0, 0.06); near(Math.sqrt(s2 / n), 1, 0.05);
});

test('剖面 A：疊置原理——同一個鉛直位置，越往下的沉積層越老', () => {
  const S = G.scenario('A');
  [300, 1500, 3800].forEach(x => {
    let prevAge = -1;
    for (let z = S.surface - 1; z > G.Z_LO; z -= 5) {
      const u = G.rockAt(S, x, z, S.events.length);
      if (u === G.AIR) continue;
      const e = u === G.BASE ? null : S.events[u];
      if (e && e.type === 'dike') continue;              // 侵入體不算在疊置裡
      const a = G.unitAge(S, u);
      assert.ok(a >= prevAge - 1e-9, `x=${x} z=${z}: ${a} 不應比上面的 ${prevAge} 年輕`);
      prevAge = a;
    }
  });
});

test('剖面 A：角度不整合——侵蝕面以下的老地層是傾斜的，以上的年輕地層是水平的', () => {
  const S = G.scenario('A'), n = S.events.length;
  assert.strictEqual(G.rockAt(S, 200, -500, n), G.rockAt(S, 2400, -500, n));
  const a = G.rockAt(S, 200, -900, n), b = G.rockAt(S, 2400, -900, n);
  assert.notStrictEqual(a, b);
  assert.ok(a < 5 && b < 5 || a === G.BASE || b === G.BASE, '不整合面以下是老地層');
});

test('剖面 A：截切關係——岩脈切穿它旁邊的地層，所以比它們年輕；後來的侵蝕面切掉岩脈頂端', () => {
  const S = G.scenario('A'), n = S.events.length, di = S.events.findIndex(e => e.name === 'dike'), e = S.events[di];
  const erode = S.events[di + 1];
  const cut = new Set();
  for (let z = Math.min(e.top, erode.to) - 1; z > G.Z_LO; z -= 20) {
    assert.strictEqual(G.rockAt(S, G.dikeX(e, z), z, n), di);
    const side = G.rockAt(S, G.dikeX(e, z) + e.w, z, n);
    if (side !== G.AIR) cut.add(side);
  }
  cut.forEach(u => assert.ok(G.unitAge(S, u) > e.t, '岩脈切穿的都比它老'));
  assert.ok(cut.size >= 6, '切穿 ' + cut.size + ' 層');
  assert.notStrictEqual(G.rockAt(S, G.dikeX(e, erode.to + 10), erode.to + 10, n), di);
});

test('剖面 A：正斷層——上盤（右側）的同一層比下盤低 slip·sin(傾角)', () => {
  const S = G.scenario('A'), n = S.events.length, f = S.events.find(e => e.type === 'fault');
  const u = 8;   // 筆石頁岩
  function topAt(x) { for (let z = 0; z > G.Z_LO; z -= 0.5) if (G.rockAt(S, x, z, n) === u) return z; return NaN; }
  near(topAt(2300) - topAt(3700), f.slip * Math.sin(f.dip * Math.PI / 180), 1.01);
});

test('時間軸：沉積中的層只長到一部分；侵蝕後上面變成空氣；地質年代表', () => {
  const S = G.scenario('A');
  assert.strictEqual(G.countAt(S, 1800), 0);
  assert.strictEqual(G.countAt(S, 0), S.events.length);
  const d = G.depositingAt(S, 1150);
  assert.ok(d && d.i === 1 && Math.abs(d.frac - 0.5) < 1e-9);
  assert.strictEqual(G.rockAtTime(S, 2000, -1000, 1150), 1);
  assert.strictEqual(G.rockAtTime(S, 2000, -960, 1150), G.AIR);
  assert.strictEqual(G.rockAtTime(S, 1000, -500, 550), G.AIR);
  assert.notStrictEqual(G.rockAtTime(S, 1000, -600, 550), G.AIR);
  assert.strictEqual(G.periodAt(66.5), 'cretaceous');
  assert.strictEqual(G.periodAt(511), 'cambrian');
  assert.strictEqual(G.periodAt(1000), 'precambrian');
});

test('定年：火成岩量到結晶年代（3σ 內）；碎屑鋯石量到來源岩石；頁岩、石灰岩不能直接定年', () => {
  const S = G.scenario('A');
  S.events.forEach((e, u) => {
    if (e.type !== 'deposit' && e.type !== 'dike') return;
    ['U238', 'U235', 'K40', 'Rb87', 'C14'].forEach(sys => {
      const m = G.measure(S, u, sys, 0);
      if (!m.ok) return;
      assert.ok(Math.abs(m.age - m.trueAge) <= 3 * m.sigma + 1e-9, `${u} ${sys} ${m.age} vs ${m.trueAge} ± ${m.sigma}`);
      if (m.what === 'detrital') assert.ok(m.trueAge > G.unitAge(S, u), '碎屑鋯石比沉積老');
    });
  });
  assert.strictEqual(G.measure(S, 2, 'U238').reason, 'no-mineral');
  assert.strictEqual(G.measure(S, 3, 'K40').reason, 'no-mineral');
  assert.strictEqual(G.measure(S, 7, 'C14').reason, 'no-carbon');
  assert.strictEqual(G.measure(S, G.BASE, 'K40').reason, 'reset');
  assert.strictEqual(G.measure(S, 18, 'U238').reason, 'mixed');
  assert.strictEqual(G.measure(S, 15, 'C14').reason, 'too-old');
  const c = G.measure(S, 18, 'C14');
  assert.ok(c.ok); near(c.age * 1e6, 12100, 3 * c.sigma * 1e6);
  assert.strictEqual(G.measure(S, 7, 'U238', 1).age, G.measure(S, 7, 'U238', 1).age);
  assert.notStrictEqual(G.measure(S, 7, 'U238', 1).age, G.measure(S, 7, 'U238', 2).age);
});

test('化石的生存年代和地層年代一致（剖面 A、B 都自洽）', () => {
  ['A', 'B'].forEach(id => {
    const S = G.scenario(id);
    S.events.forEach((e, u) => {
      if (!e.fossil) return;
      const F = G.FOSSILS[e.fossil];
      assert.ok(e.t0 <= F.from && e.t1 >= F.to, `${id} ${u} ${e.fossil} ${e.t0}–${e.t1} 超出 ${F.from}–${F.to}`);
    });
  });
});

test('排序題：每個看得到的單元與構造事件都列出，順序就是事件順序', () => {
  ['A', 'B'].forEach(id => {
    const S = G.scenario(id), items = G.orderItems(S), vis = G.visibleUnits(S);
    for (let i = 1; i < items.length; i++) assert.ok(items[i] > items[i - 1]);
    vis.forEach((c, u) => assert.ok(items.includes(u), id + ' 缺 ' + u));
    S.events.forEach((e, i) => { if (e.type === 'tilt' || e.type === 'fault') assert.ok(items.includes(i)); });
  });
});

console.log(`\n${passed} 項通過`);
