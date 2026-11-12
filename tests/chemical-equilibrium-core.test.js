// 以 Node 執行：node tests/chemical-equilibrium-core.test.js
'use strict';
const assert = require('assert');
const E = require('../js/chemical-equilibrium-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`); }
function rel(a, b, tol, msg) { near(a / b, 1, tol, (msg || '') + `（${a} 對 ${b}）`); }
function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const RXS = ['n2o4', 'haber', 'hi'];
const R = E.R;

// ---------------- 熱力學數據 ----------------
test('298 K 的 ΔH°、ΔS° 由 NIST-JANAF 的生成焓與熵算出', function () {
  let t = E.thermo('n2o4', 298.15);
  near(t.dH, 2 * 33.10 - 9.08, 1e-9); near(t.dS, 2 * 240.04 - 304.38, 1e-9);
  t = E.thermo('haber', 298.15);
  near(t.dH, -91.80, 1e-6); near(t.dS, 2 * 192.77 - 191.61 - 3 * 130.68, 1e-6);
  t = E.thermo('hi', 298.15);
  near(t.dH, 2 * 26.36 - 62.42, 1e-6); near(t.dS, 2 * 206.59 - 130.68 - 260.69, 1e-6);
});
test('N₂O₄ ⇌ 2NO₂ 在 298 K：K = 0.148（文獻常見值約 0.15）', function () {
  near(E.K('n2o4', 298.15), Math.exp(-(57.12e3 - 298.15 * 175.70) / (R * 298.15)), 1e-12);
  near(E.K('n2o4', 298.15), 0.148, 0.002);
});
test('與 OpenStax 附錄 G 的 ΔfG° 一致（298 K，相差 < 0.6 kJ/mol）', function () {
  near(E.thermo('haber', 298.15).dG, 2 * -16.5, 0.6);          // NH₃ ΔfG° = −16.5
  near(E.thermo('hi', 298.15).dG, 2 * 1.70 - 19.3, 0.6);        // HI 1.70、I₂(g) 19.3
});
test('Shomate 熱容：H₂、N₂、NH₃、HI 在 298 K 與 600 K 的 Cp 合理；N₂ 在 500 K 兩段相接', function () {
  near(E.Cp('H2', 298.15), 28.84, 0.02); near(E.Cp('NH3', 298.15), 35.65, 0.02); near(E.Cp('HI', 298.15), 29.18, 0.02);
  near(E.Cp('N2', 600), 30.10, 0.02); near(E.Cp('I2', 600), 37.60, 0.02); near(E.Cp('NH3', 600), 45.26, 0.02);
  near(E.Cp('N2', 499.999), E.Cp('N2', 500.001), 0.05);
});
test('克希荷夫定律：dΔH°/dT = ΔCp；dΔS°/dT = ΔCp/T（數值微分）', function () {
  [['haber', 650], ['hi', 600]].forEach(function (c) {
    const rx = c[0], T = c[1], h = 0.01, r = E.RX[rx];
    let dCp = 0; r.sp.forEach(function (s, i) { dCp += r.nu[i] * E.Cp(s, T); });
    near((E.thermo(rx, T + h).dH - E.thermo(rx, T - h).dH) * 1000 / (2 * h), dCp, 1e-4, rx + ' ΔCp');
    near((E.thermo(rx, T + h).dS - E.thermo(rx, T - h).dS) / (2 * h), dCp / T, 1e-6, rx + ' ΔCp/T');
  });
});
test('范特荷夫方程式：d ln K/dT = ΔH°/(RT²)', function () {
  RXS.forEach(function (rx) {
    const T = (E.RX[rx].Tmin + E.RX[rx].Tmax) / 2, h = 0.01;
    const d = (Math.log(E.K(rx, T + h)) - Math.log(E.K(rx, T - h))) / (2 * h);
    rel(d, E.thermo(rx, T).dH * 1000 / (R * T * T), 1e-6, rx);
  });
});
test('HI：698.6 K 時 K ≈ 57（經典實驗約 54，差異來自理想化的熱容積分）；放熱，溫度升高 K 變小', function () {
  near(E.K('hi', 698.6), 57, 1.5);
  assert.ok(E.K('hi', 800) < E.K('hi', 500));
  assert.ok(E.K('haber', 800) < E.K('haber', 500));
  assert.ok(E.K('n2o4', 373) > E.K('n2o4', 273));
});
test('Kc 與 Kp：Kc = Kp(p°/RT)^Δn；Δn = 0 時相等', function () {
  near(E.Kc('hi', 650), E.K('hi', 650), 1e-12);
  rel(E.Kc('n2o4', 300), E.K('n2o4', 300) * 1e5 / (R * 300 * 1000), 1e-12);
  rel(E.Kc('haber', 700), E.K('haber', 700) * Math.pow(1e5 / (R * 700 * 1000), -2), 1e-12);
});

// ---------------- 平衡 ----------------
function randomState(rx, r) {
  const X = E.RX[rx], n = {};
  X.sp.forEach(function (s) { n[s] = r() < 0.2 ? 0 : X.n0[X.sp[0]] * (0.05 + 2 * r()); });
  if (X.sp.every(function (s) { return n[s] === 0; })) n[X.sp[0]] = X.n0[X.sp[0]];
  if (r() < 0.3) n.Ar = X.n0[X.sp[0]] * r();
  const T = X.Tmin + (X.Tmax - X.Tmin) * r();
  const o = r() < 0.5 ? { T: T, V: (X.Vr[0] + (X.Vr[1] - X.Vr[0]) * r()) / 1000 } : { T: T, P: X.Pr[0] + (X.Pr[1] - X.Pr[0]) * r() };
  return { n: n, o: o };
}
test('平衡解：300 組隨機狀態（定容與定壓）都滿足 Q = K（|ln Q/K| < 10⁻⁹），元素守恆、物質的量不為負', function () {
  const r = rng(7);
  RXS.forEach(function (rx) {
    for (let k = 0; k < 100; k++) {
      const st = randomState(rx, r), e = E.equilibrium(rx, st.n, st.o);
      const reactive = E.RX[rx].sp.some(function (s, i) { return E.RX[rx].nu[i] < 0 && e.n[s] > 0; }) && E.RX[rx].sp.some(function (s, i) { return E.RX[rx].nu[i] > 0 && e.n[s] > 0; });
      if (reactive) near(E.lnQK(rx, e.n, st.o), 0, 1e-9, rx + ' ln(Q/K)');
      Object.keys(e.n).forEach(function (s) { assert.ok(e.n[s] >= 0, s + ' < 0'); });
      // 元素守恆：用反應式的係數檢查「n_i − ν_i ξ」不變
      E.RX[rx].sp.forEach(function (s, i) { near(e.n[s] - E.RX[rx].nu[i] * e.xi, st.n[s] || 0, 1e-12 + 1e-12 * (st.n[s] || 0)); });
      if (st.n.Ar) assert.strictEqual(e.n.Ar, st.n.Ar);
    }
  });
});
test('Kc 由平衡濃度算出與 Kc(T) 相同；理想氣體 PV = nRT', function () {
  const n0 = { N2: 0.05, H2: 0.15, NH3: 0 }, o = { T: 650, V: 0.05 };
  const e = E.equilibrium('haber', n0, o), p = E.props('haber', e.n, o);
  rel(p.c.NH3 * p.c.NH3 / (p.c.N2 * Math.pow(p.c.H2, 3)), E.Kc('haber', 650), 1e-8);
  rel(p.P * 1e5 * o.V / 1000, p.ntot * R * o.T, 1e-12);
});
function after(rx, n, o) { return E.equilibrium(rx, n, o).n; }
test('勒沙特列：壓縮（定溫）時往分子數少的一方移動；Δn = 0 時不移動', function () {
  const T = 298, a = after('n2o4', { N2O4: 2e-3, NO2: 0 }, { T: T, V: 0.05 });
  const b = after('n2o4', a, { T: T, V: 0.025 });
  assert.ok(b.NO2 < a.NO2, 'N₂O₄：NO₂ 減少');
  assert.ok(b.NO2 / 0.025 > a.NO2 / 0.05, '但 NO₂ 濃度仍比原來大（只部分抵消）');
  const h = after('haber', { N2: 0.05, H2: 0.15, NH3: 0 }, { T: 700, V: 0.1 });
  assert.ok(after('haber', h, { T: 700, V: 0.05 }).NH3 > h.NH3, '哈柏法：NH₃ 增加');
  const i = after('hi', { H2: 1e-3, I2: 1e-3, HI: 0 }, { T: 700, V: 0.05 });
  rel(after('hi', i, { T: 700, V: 0.01 }).HI, i.HI, 1e-9, 'HI 不變');
});
test('勒沙特列：加熱往吸熱方向移動；加入生成物往左、移走生成物往右', function () {
  const a = after('n2o4', { N2O4: 2e-3, NO2: 0 }, { T: 298, V: 0.05 });
  assert.ok(after('n2o4', a, { T: 330, V: 0.05 }).NO2 > a.NO2);
  const h = after('haber', { N2: 0.05, H2: 0.15, NH3: 0 }, { T: 600, V: 0.05 });
  assert.ok(after('haber', h, { T: 700, V: 0.05 }).NH3 < h.NH3);
  const add = Object.assign({}, a, { NO2: a.NO2 + 5e-4 });
  assert.strictEqual(E.direction('n2o4', add, { T: 298, V: 0.05 }), -1);
  const b = after('n2o4', add, { T: 298, V: 0.05 });
  assert.ok(b.NO2 < add.NO2 && b.NO2 > a.NO2, '加入的 NO₂ 只被部分消耗');
  const rem = Object.assign({}, h, { NH3: 0 });
  assert.strictEqual(E.direction('haber', rem, { T: 600, V: 0.05 }), 1);
});
test('惰性氣體：定容加入不移動；定壓加入（體積變大）往分子數多的一方移動', function () {
  const o = { T: 298, V: 0.05 }, a = after('n2o4', { N2O4: 2e-3, NO2: 0 }, o);
  const withAr = Object.assign({}, a, { Ar: 4e-3 });
  assert.strictEqual(E.direction('n2o4', withAr, o), 0);
  const P = E.props('n2o4', a, o).P;
  assert.strictEqual(E.direction('n2o4', withAr, { T: 298, P: P }), 1);
  assert.ok(after('n2o4', withAr, { T: 298, P: P }).NO2 > a.NO2);
  const oh = { T: 700, V: 0.05 }, h = after('haber', { N2: 0.05, H2: 0.15, NH3: 0 }, oh);
  const Ph = E.props('haber', h, oh).P;
  assert.ok(after('haber', Object.assign({}, h, { Ar: 0.1 }), { T: 700, P: Ph }).NH3 < h.NH3);
});
test('從兩端出發達到同一平衡（反應物或生成物開始，元素總量相同）', function () {
  const o = { T: 700, V: 0.05 };
  const a = after('hi', { H2: 1e-3, I2: 1e-3, HI: 0 }, o), b = after('hi', { H2: 0, I2: 0, HI: 2e-3 }, o);
  rel(a.HI, b.HI, 1e-9); rel(a.H2, b.H2, 1e-8);
});

// ---------------- 趨近平衡 ----------------
test('趨近平衡：單調、不越過平衡；催化劑讓 τ 變小，但終點相同', function () {
  const o = { T: 500, V: 0.05 }, n0 = { N2: 0.05, H2: 0.15, NH3: 0 };
  const eq = E.equilibrium('haber', n0, o).n;
  let a = n0, b = n0, prev = -Infinity;
  for (let k = 0; k < 400; k++) {
    a = E.relax('haber', a, o, 5, false);
    b = E.relax('haber', b, o, 5, true);
    const v = E.lnQK('haber', a, o);
    assert.ok(v <= 1e-9 && v >= prev - 1e-9, '單調趨近，不越過');
    prev = v;
  }
  rel(b.NH3, eq.NH3, 1e-6, '有催化劑 2000 s 已到平衡');
  assert.ok(a.NH3 < 0.9 * eq.NH3, '沒有催化劑 2000 s 還沒到');
  rel(E.tau('haber', 500, false) / E.tau('haber', 500, true), E.RX.haber.cat, 1e-12);
  assert.ok(E.tau('haber', 800, false) < E.tau('haber', 500, false), '溫度越高越快');
});
test('定壓趨近平衡：體積隨物質的量改變，壓力保持設定值', function () {
  const o = { T: 330, P: 1 }, n0 = { N2O4: 2e-3, NO2: 0 };
  let n = n0;
  for (let k = 0; k < 200; k++) n = E.relax('n2o4', n, o, 0.1, false);
  near(E.lnQK('n2o4', n, o), 0, 1e-6);
  const p = E.props('n2o4', n, o);
  near(p.P, 1, 1e-12);
  rel(p.V / 1000, p.ntot * R * 330 / 1e5, 1e-12);
});

// ---------------- 未知反應與范特荷夫 ----------------
test('未知反應：由平衡組成算出的 K 畫范特荷夫圖，恰好得到隱藏的 ΔH°', function () {
  const r = rng(3);
  for (let k = 0; k < 20; k++) {
    const m = E.newMystery(r);
    assert.ok(m.dH >= 40 && m.dH <= 80);
    const K330 = E.K('mys', 330);
    assert.ok(K330 > 0.19 && K330 < 2.01, 'K(330) ' + K330);
    const rows = [290, 330, 380].map(function (T) {
      const o = { T: T, V: 0.05 }, e = E.equilibrium('mys', { A2: 2e-3, A: 0 }, o), p = E.props('mys', e.n, o);
      return { T: T, K: p.p.A * p.p.A / p.p.A2 };
    });
    near(E.vantHoff(rows).dH, m.dH, 1e-6);
  }
});
test('NO₂ 的顏色：透過率隨濃度與光程依比爾定律變化', function () {
  near(E.transmittance(0, 50, 2), 1, 1e-12);
  near(E.transmittance(0.01, 50, 2), Math.pow(10, -1), 1e-12);
  assert.ok(E.transmittance(0.02, 50, 2) < E.transmittance(0.01, 50, 2));
});

console.log(passed + ' 項通過');
