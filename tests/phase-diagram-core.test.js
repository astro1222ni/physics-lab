// 以 Node 執行：node tests/phase-diagram-core.test.js
'use strict';
const assert = require('assert');
const P = require('../js/phase-diagram-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`); }
function rel(a, b, tol, msg) { near(a / b, 1, tol, (msg || '') + `（${a} 對 ${b}）`); }
const S = P.SUBS, ATM = P.ATM;

// ---------------- 文獻的核對值 ----------------
test('水：IAPWS 的核對值（蒸氣壓、昇華壓、冰 Ih 熔化壓）', function () {
  rel(P.pvap('water', 373.124), ATM, 2e-4, '正常沸點 99.974 °C');
  rel(P.pvap('water', 298.15), 3169.9, 1e-3, '25 °C 的蒸氣壓');
  rel(P.psub('water', 230), 8.94735, 1e-5, 'IAPWS 2011 昇華壓核對值（230 K）');
  rel(P.pmelt('water', 260), 138.268e6, 1e-5, 'IAPWS 2011 熔化壓核對值（260 K）');
  rel(P.pvap('water', 647.096), 22.064e6, 1e-9, '臨界點');
});
test('水：飽和密度（Wagner & Pruss 2002）100 °C 時液體 958.4、蒸氣 0.598 kg/m³；臨界點兩者相等', function () {
  const d = P.satDensity('water', 373.124);
  near(d.L, 958.37, 0.2); near(d.V, 0.5976, 0.001);
  const c = P.satDensity('water', 647.096);
  near(c.L, 322, 1e-6); near(c.V, 322, 1e-6);
});
test('二氧化碳：Span & Wagner 的輔助方程式（1 atm 昇華點 −78.46 °C、0 °C 蒸氣壓 3.485 MPa、飽和密度）', function () {
  rel(P.psub('co2', 194.686), ATM, 2e-3, '乾冰 1 atm 的昇華溫度');
  rel(P.pvap('co2', 273.15), 3.4851e6, 2e-3);
  const d = P.satDensity('co2', 273.15);
  rel(d.L, 927.4, 2e-3); rel(d.V, 97.65, 3e-3);
  rel(P.pvap('co2', 304.1282), 7.3773e6, 1e-9);
});
test('碘：通過三相點、正常沸點、臨界點；25 °C 的昇華壓約 40 Pa；與 Stull（NIST 的安東尼式）相差 < 10%', function () {
  rel(P.pvap('iodine', 386.65), 12.07e3, 1e-9); rel(P.pvap('iodine', 457.55), ATM, 1e-9); rel(P.pvap('iodine', 819), 11.7e6, 1e-9);
  rel(P.psub('iodine', 386.65), 12.07e3, 1e-12);
  rel(P.psub('iodine', 298.15), 41.2, 0.03, '由 ΔsubH° 62.42 kJ/mol、ΔsubS° 144.55 J/(mol·K) 算出 41.2 Pa');
  const stull = T => 1e5 * Math.pow(10, 3.36429 - 1039.159 / (T - 146.589));
  [330, 360, 400, 430, 455].forEach(T => rel(T < 386.65 ? P.psub('iodine', T) : P.pvap('iodine', T), stull(T), 0.1, T + ' K'));
});

// ---------------- 三相點與相界線的一致性 ----------------
test('三條線在三相點相交；氣液線在臨界點結束', function () {
  P.ORDER.forEach(id => {
    const s = S[id];
    rel(P.psub(id, s.Tt), s.pt, 1e-3, id + ' 昇華線');
    rel(P.pvap(id, s.Tt), s.pt, 1e-3, id + ' 氣液線');
    rel(P.pmelt(id, s.Tt), s.pt, 1e-9, id + ' 熔化線');
  });
});
test('赫斯定律在三相點成立：ΔsubH − ΔvapH ≈ ΔfusH（由兩條線的斜率，誤差 < 7%）', function () {
  P.ORDER.forEach(id => {
    const s = S[id];
    const d = P.dHslope(id, 'sub', s.Tt - 1e-3) - P.dHslope(id, 'vap', s.Tt + 1e-3);
    rel(d, s.dHfusRef, 0.07, id);
  });
});
test('熔化線斜率：水為負（約 −13.5 MPa/K），二氧化碳、碘為正；碘由克拉佩龍方程式約 3.2 MPa/K', function () {
  near(P.meltSlope('water', 273.15) / 1e6, -13.46, 0.05);
  near(P.meltSlope('co2', 217) / 1e6, 4.69, 0.05);
  near(P.meltSlope('iodine', 390) / 1e6, 3.18, 0.02);
  // 克拉佩龍方程式核對水：ΔfusH/(T ΔV) 與 IAPWS 曲線的斜率一致（2% 內）
  const dV = 18.015e-3 * (1 / 999.84 - 1 / 916.7);
  rel(6.01e3 / (273.16 * dV), P.meltSlope('water', 273.159), 0.02);
});
test('克勞修斯—克拉佩龍的斜率：水在 100 °C 得 41.3 kJ/mol（真值 40.65，差 1.7%：蒸氣不完全理想）', function () {
  rel(P.dHslope('water', 'vap', 373.124), 40.65e3, 0.025);
  rel(P.dHslope('water', 'sub', 273.15), 51.06e3, 0.01);
  rel(P.dHslope('iodine', 'sub', 298.15), 62.42e3, 1e-3, '碘 25 °C 的昇華熱');
  // 兩點式在很窄的區間等於切線斜率
  const T1 = 370, T2 = 371, dH = P.twoPoint(T1, P.pvap('water', T1), T2, P.pvap('water', T2));
  rel(dH, P.dHslope('water', 'vap', 370.5), 1e-4);
});

// ---------------- 相的判定 ----------------
test('相的判定：常見的例子', function () {
  assert.strictEqual(P.phase('water', 298.15, ATM), 'liquid');
  assert.strictEqual(P.phase('water', 263.15, ATM), 'solid');
  assert.strictEqual(P.phase('water', 383.15, ATM), 'gas');
  assert.strictEqual(P.phase('water', 263.15, 100), 'gas', '−10 °C、100 Pa：冰會昇華');
  assert.strictEqual(P.phase('water', 268.15, 80e6), 'liquid', '−5 °C、800 atm：加壓熔冰');
  assert.strictEqual(P.phase('water', 700, 30e6), 'sc');
  assert.strictEqual(P.phase('co2', 298.15, ATM), 'gas');
  assert.strictEqual(P.phase('co2', 298.15, 7e6), 'liquid', '滅火器裡的液態 CO2');
  assert.strictEqual(P.phase('co2', 190, ATM), 'solid');
  assert.strictEqual(P.phase('co2', 313.15, 20e6), 'sc', '超臨界萃取');
  assert.strictEqual(P.phase('co2', 230, 80e6), 'solid', '加壓凝固');
  assert.strictEqual(P.phase('iodine', 298.15, ATM), 'solid');
  assert.strictEqual(P.phase('iodine', 400, ATM), 'liquid', '1 atm 下碘會熔化');
  assert.strictEqual(P.phase('iodine', 470, ATM), 'gas');
});
test('1 atm 下：水 0 °C 熔化、100 °C 沸騰；乾冰直接昇華（三相點壓力 5.11 atm > 1 atm）；碘先熔化再沸騰', function () {
  near(P.Tmelt('water', ATM), 273.1525, 0.001);
  near(P.Tboil('water', ATM), 373.124, 0.002);
  assert.ok(isNaN(P.Tboil('co2', ATM)) && isNaN(P.Tmelt('co2', ATM)));
  near(P.Tsubl('co2', ATM), 194.686, 0.05);
  near(S.co2.pt / ATM, 5.11, 0.01);
  assert.ok(S.iodine.pt < ATM);
  near(P.Tboil('iodine', ATM), 457.55, 1e-6);
  assert.ok(P.Tmelt('iodine', ATM) > S.iodine.Tt && P.Tmelt('iodine', ATM) < S.iodine.Tt + 0.05);
});
test('生活例子：壓力鍋（2 atm）約 120.6 °C 沸騰；玉山頂（約 0.61 atm）約 87 °C；溜冰的壓力只讓熔點下降不到 0.1 K', function () {
  near(P.Tboil('water', 2 * ATM) - 273.15, 120.6, 0.2);
  const pYushan = ATM * Math.pow(1 - 2.25577e-5 * 3952, 5.25588);
  near(P.Tboil('water', pYushan) - 273.15, 86.9, 0.3);
  const k = P.skate(60, 3 * 100); // 60 kg、刀刃 3 mm × 10 cm
  near(k.P / ATM, 19.4, 0.2);
  assert.ok(k.dT < 0 && k.dT > -0.2, '熔點下降 ' + k.dT);
  near(P.Tmelt('water', 1e8) - 273.15, -8.95, 0.1, '1000 atm 時冰在約 −9 °C 熔化');
});
test('每個格點的相都和相界線一致（隨機 4000 點）', function () {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  P.ORDER.forEach(id => {
    const s = S[id];
    for (let k = 0; k < 4000; k++) {
      const T = s.Tmin + (s.Tmax - s.Tmin) * rnd(), Pp = Math.exp(Math.log(s.Pmin) + Math.log(s.Pmax / s.Pmin) * rnd());
      const ph = P.phase(id, T, Pp);
      if (ph === 'gas') {
        const g = P.gasBoundary(id, T);
        assert.ok(isNaN(g) ? !(T >= s.Tc && Pp >= s.pc) : Pp < g, id + ' 氣 ' + T + ' ' + Pp);
      } else if (ph === 'sc') assert.ok(T >= s.Tc && Pp >= s.pc);
      else if (ph === 'liquid') {
        assert.ok(T < s.Tc && Pp >= P.gasBoundary(id, T) - 1e-6);
        if (id !== 'water') assert.ok(T >= s.Tt && Pp <= P.pmelt(id, T));
      } else {
        assert.ok(T < s.Tt || id !== 'water' ? true : false, id + ' 固體不應在 Tt 以上（水）');
      }
    }
  });
});

// ---------------- 路徑上的相變 ----------------
test('等壓加熱：1 atm 的水從 −20 °C 到 150 °C，先熔化（0 °C）再沸騰（100 °C）', function () {
  const ch = P.pathChanges('water', { T: 253.15, P: ATM }, { T: 423.15, P: ATM });
  assert.deepStrictEqual(ch.map(c => c.kind), ['melt', 'boil']);
  near(ch[0].T, 273.1525, 1e-3); near(ch[1].T, 373.124, 2e-3);
});
test('等壓加熱：1 atm 的乾冰直接昇華；0.5 kPa 的冰也直接昇華（冷凍乾燥）', function () {
  let ch = P.pathChanges('co2', { T: 170, P: ATM }, { T: 300, P: ATM });
  assert.deepStrictEqual(ch.map(c => c.kind), ['sublime']); near(ch[0].T, 194.686, 0.05);
  ch = P.pathChanges('water', { T: 253.15, P: 500 }, { T: 300, P: 500 });
  assert.deepStrictEqual(ch.map(c => c.kind), ['sublime']);
});
test('等溫加壓：−5 °C 的冰加壓到 1000 atm 會熔化（約 590 atm）；CO2 在 0 °C 先液化再凝固', function () {
  let ch = P.pathChanges('water', { T: 268.15, P: ATM }, { T: 268.15, P: 1e8 });
  assert.deepStrictEqual(ch.map(c => c.kind), ['melt']);
  near(ch[0].P / ATM, 590, 10);
  ch = P.pathChanges('co2', { T: 273.15, P: 1e5 }, { T: 273.15, P: 1e8 });
  assert.deepStrictEqual(ch.map(c => c.kind), ['condense']);
  ch = P.pathChanges('co2', { T: 230, P: 1e5 }, { T: 230, P: 1e8 });
  assert.deepStrictEqual(ch.map(c => c.kind), ['condense', 'freeze']);
});
test('繞過臨界點：液 → 超臨界 → 氣，中間沒有真正的相變', function () {
  const a = { T: 290, P: 8e6 }, b = { T: 320, P: 8e6 }, c = { T: 320, P: 3e6 }, d = { T: 290, P: 3e6 };
  assert.strictEqual(P.phase('co2', a.T, a.P), 'liquid');
  const ch = P.pathChanges('co2', a, b).concat(P.pathChanges('co2', b, c));
  assert.deepStrictEqual(ch.map(x => x.from + '>' + x.to), ['liquid>sc', 'sc>gas']);
  assert.ok(ch.every(x => !x.transition));
  // 直接降壓則會沸騰
  const ch2 = P.pathChanges('co2', a, d);
  assert.deepStrictEqual(ch2.map(x => x.kind), ['boil']);
  assert.ok(ch2[0].transition);
});
test('一條斜線穿過多條界線：每個改變點都在對應的界線上', function () {
  const ch = P.pathChanges('water', { T: 220, P: 10 }, { T: 680, P: 9e7 });
  assert.ok(ch.length >= 2);
  ch.forEach(c => {
    if (c.kind === 'sublime' || c.kind === 'deposit') rel(c.P, P.psub('water', c.T), 1e-6);
    if (c.kind === 'boil' || c.kind === 'condense') rel(c.P, P.pvap('water', c.T), 1e-6);
    if (c.kind === 'melt' || c.kind === 'freeze') rel(c.P, P.pmelt('water', c.T), 1e-4);
  });
});
test('兩點式克勞修斯—克拉佩龍：1 atm 與 2 atm 的沸點算出水的汽化熱 ≈ 40.9 kJ/mol（3% 內）', function () {
  const T1 = P.Tboil('water', ATM), T2 = P.Tboil('water', 2 * ATM);
  const dH = P.twoPoint(T1, ATM, T2, 2 * ATM);
  rel(dH, 40.65e3, 0.03);
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗！' : '。'));
