/* 化學計量與限量試劑：化學核心的單元測試。用法：node tests/stoichiometry-core.test.js */
'use strict';
const S = require('../js/stoichiometry-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) {
  if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）');
}
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }

console.log('化學計量與限量試劑（stoichiometry-core）');

test('常數：R、STP 與 25 °C 的莫耳體積、水柱壓力', function () {
  near(S.R_ML, 62363.6, 0.1, 'R（mmHg·mL/(mol·K)）');
  near(S.R_LATM, 0.0820574, 1e-7, 'R（L·atm/(mol·K)）');
  near(S.VM_STP, 22.414, 0.001, 'STP 莫耳體積');
  near(S.VM_25, 24.465, 0.001, '25 °C、1 atm 莫耳體積');
  near(S.CMH2O, 0.7334, 0.0002, '1 cm 水柱');
});

test('水的飽和蒸氣壓：IAPWS 參考點（三相點、正常沸點、25 °C）與單調遞增', function () {
  near(S.vaporKPa(0.01), 0.611657, 0.000005, '三相點（kPa）');
  near(S.vaporKPa(99.974), 101.325, 0.005, '正常沸點（kPa）');
  near(S.vaporKPa(25), 3.1699, 0.0005, '25 °C（kPa）');
  near(S.vapor(25), 23.78, 0.01, '25 °C（mmHg）');
  near(S.vapor(20), 17.55, 0.01, '20 °C（mmHg）');
  near(S.vapor(40), 55.39, 0.02, '40 °C（mmHg）');
  for (let t = 0; t < 40; t += 0.5) ok(S.vapor(t + 0.5) > S.vapor(t), '應隨溫度增加');
});

test('限量試劑：鎂不足、鹽酸不足、剛好完全反應', function () {
  const a = S.amounts({ m: 0.05, c: 1, V: 10 });
  ok(a.lim === 'Mg', '0.05 g 鎂＋10 mL 1 M 鹽酸：鎂是限量試劑');
  near(a.nH2, 0.05 / 24.305, 1e-12, '氫氣 = 鎂的莫耳數');
  near(a.HClLeft, 0.01 - 2 * 0.05 / 24.305, 1e-12, '剩下的 HCl');
  const b = S.amounts({ m: 0.05, c: 1, V: 2 });
  ok(b.lim === 'HCl', '2 mL 1 M 鹽酸：鹽酸是限量試劑');
  near(b.nH2, 0.001, 1e-12, '氫氣 = HCl ÷ 2');
  near(b.MgLeft * 24.305, 0.05 - 0.001 * 24.305, 1e-12, '剩下的鎂（g）');
  const c = S.amounts({ m: 24.305 * 0.002, c: 1, V: 4 });
  ok(c.lim === 'both', '莫耳數比 1 : 2 時兩者同時用完');
  near(c.ratio, 2, 1e-12, '比值');
});

test('原子守恆：任何時刻 Mg 與 H 的總量不變', function () {
  [{ m: 0.05, c: 1, V: 10, T: 25 }, { m: 0.12, c: 0.5, V: 8, T: 10 }, { m: 0.0486, c: 1, V: 4, T: 30 }].forEach(function (o) {
    const A = S.amounts(o);
    [0, 1, 3, 10, 30, 100, 1000].forEach(function (t) {
      const xi = S.extentAt(o, t);
      near((A.nMg - xi) + xi, A.nMg, 1e-15, 'Mg 守恆');
      near((A.nFree - 2 * xi) + 2 * xi, A.nFree, 1e-15, 'H 守恆');
      ok(A.nMg - xi >= -1e-15 && A.nFree - 2 * xi >= -1e-15, '不可為負');
    });
  });
});

test('速率式的解析解與數值積分（RK4）一致：鎂不足、鹽酸不足、剛好', function () {
  [{ m: 0.05, c: 1, V: 10, T: 25 }, { m: 0.1, c: 0.5, V: 10, T: 25 }, { m: 24.305 * 0.002, c: 1, V: 4, T: 25 }, { m: 0.03, c: 3, V: 5, T: 40 }].forEach(function (o) {
    const A = S.amounts(o), k = S.rateK(o.T), VL = o.V / 1000;
    const f = function (x) { return k * (A.nMg - x) * Math.max(0, A.nFree - 2 * x) / VL; };
    let x = 0, t = 0;
    const h = 0.002, tEnd = Math.min(60, S.endTime(o) * 0.9);
    while (t < tEnd - 1e-12) {
      const k1 = f(x), k2 = f(x + h / 2 * k1), k3 = f(x + h / 2 * k2), k4 = f(x + h * k3);
      x += h / 6 * (k1 + 2 * k2 + 2 * k3 + k4); t += h;
    }
    near(S.extentAt(o, t), x, 1e-9 * A.nMg + 1e-12, 'm = ' + o.m + ', c = ' + o.c + ', V = ' + o.V);
  });
});

test('反應結束：限量試劑剩 0.1% 的時刻，之後產量等於理論值', function () {
  const o = { m: 0.05, c: 1, V: 10, T: 25 };
  const te = S.endTime(o), A = S.amounts(o);
  near(S.extentAt(o, te * (1 - 1e-9)), 0.999 * A.xiMax, 1e-7 * A.xiMax, '鎂剩 0.1%');
  near(S.extentAt(o, te + 1), A.xiMax, 0, '之後等於理論值');
  const o2 = { m: 0.1, c: 0.5, V: 10, T: 25 }, A2 = S.amounts(o2);
  near(A2.nFree - 2 * S.extentAt(o2, S.endTime(o2) * (1 - 1e-9)), 0.001 * A2.nFree, 1e-7 * A2.nFree, '鹽酸剩 0.1%');
  ok(S.endTime({ m: 0.05, c: 2, V: 10, T: 25 }) < te, '濃度越大越快');
  ok(S.endTime({ m: 0.05, c: 1, V: 10, T: 35 }) < te, '溫度越高越快');
});

test('阿瑞尼斯：k(25 °C) = 0.1，活化能 40 kJ/mol', function () {
  near(S.rateK(25), 0.1, 1e-12);
  near(Math.log(S.rateK(35) / S.rateK(25)), 40000 / 8.314462618 * (1 / 298.15 - 1 / 308.15), 1e-12);
});

test('鎂帶沒磨亮：2% 是氧化鎂（消耗 HCl、不產生氫氣），延後 4 s', function () {
  const A = S.amounts({ m: 0.1, c: 1, V: 10, polished: false });
  near(A.nMg, 0.098 / 24.305, 1e-15);
  near(A.nMgO, 0.002 / 40.304, 1e-15);
  near(A.nFree, 0.01 - 2 * 0.002 / 40.304, 1e-15);
  const o = { m: 0.1, c: 1, V: 10, T: 25, polished: false };
  near(S.extentAt(o, 3.9), 0, 0, '4 s 內不冒泡');
  ok(S.extentAt(o, 5) > 0, '之後開始');
});

test('量筒內的氣體：液面相平時 PV = nRT（扣水蒸氣壓）', function () {
  const n = 0.002, g = S.gasState(100, n, 25, 760, true);
  near(g.V, n * S.R_ML * 298.15 / (760 - S.vapor(25)), 1e-9);
  near(g.Pgas, 760, 0); near(g.h, 0, 0);
});

test('量筒內的氣體：液面不相平時，筒內水柱使氣體壓力較小、體積較大', function () {
  const C = S.CYLINDERS[100], n = 0.0015;
  const g = S.gasState(100, n, 20, 750, false), ga = S.gasState(100, n, 20, 750, true);
  near(g.h, C.Htop - g.V / C.A, 1e-9, '水柱高 = 筒頂高 − 氣柱長');
  near(g.Pgas, 750 - S.CMH2O * g.h, 1e-9, '壓力');
  near(g.Pdry * g.V, n * S.R_ML * 293.15, 1e-6, '乾氣體 PV = nRT');
  ok(g.h > 0 && g.V > ga.V, '水柱向上拉，氣體膨脹');
  near(g.V / ga.V, (750 - S.vapor(20)) / (g.Pdry), 1e-9, '波以耳定律');
});

test('溢出：氣體到筒口就從下方冒走，量筒內最多只能留住 capacityMol', function () {
  const r = S.createRun({ m: 0.2, c: 3, V: 20, T: 25, P: 760, cyl: 100 });
  S.start(r); S.setTime(r, 1e5);
  ok(r.ended && r.escaped, '0.2 g 鎂產生的氫氣超過 100 mL 量筒');
  near(S.nGas(r), S.capacityMol(100, 25, 760, false), 1e-12, '量筒內剩下的');
  ok(S.gas(r).full, '氣體到筒口');
  const cap1 = S.nGas(r);
  S.setAligned(r, true);
  ok(S.nGas(r) < cap1, '舉高量筒對齊液面時壓力變小，又冒走一些');
  const r2 = S.createRun({ m: 0.05, c: 1, V: 10, T: 25, P: 760, cyl: 100 });
  S.start(r2); S.setTime(r2, 1e4);
  ok(!r2.escaped, '預設不會溢出');
  near(S.nGas(r2), 0.05 / 24.305, 1e-15, '全部收集到');
});

test('分析：讀數正確、扣水蒸氣壓、鎂為限量 → 原子量 24.305、莫耳體積 22.414', function () {
  [[0.08, 1, 10, 18, 742], [0.05, 2, 10, 0, 760], [0.2, 3, 20, 35, 700]].forEach(function (p) {
    const o = { m: p[0], c: p[1], V: p[2], T: p[3], P: p[4] };
    const V = S.gasState(250, p[0] / 24.305, p[3], p[4], true).V;
    const a = S.analyze(o, { reading: V, lim: 'Mg', vap: true });
    near(a.M, 24.305, 1e-9, '原子量'); near(a.Vm, S.VM_STP, 1e-9, '莫耳體積');
    near(a.yieldPct, 100, 1e-9, '產率');
    near(a.V25 / a.Vstp, 298.15 / 273.15, 1e-12, '25 °C 與 STP 的比');
  });
});

test('分析：不扣水蒸氣壓，原子量偏小 Pw/P；沒磨亮偏大約 2%', function () {
  const o = { m: 0.08, c: 1, V: 10, T: 25, P: 760 };
  const V = S.gasState(100, 0.08 / 24.305, 25, 760, true).V;
  const a = S.analyze(o, { reading: V, lim: 'Mg', vap: false });
  near(a.Merr, -S.vapor(25) / 760, 1e-12);
  const o2 = Object.assign({}, o, { polished: false });
  const V2 = S.gasState(100, S.amounts(o2).nH2, 25, 760, true).V;
  near(S.analyze(o2, { reading: V2, lim: 'Mg', vap: true }).Merr, 1 / 0.98 - 1, 1e-12);
});

test('分析：鹽酸為限量時，由氫氣反推鹽酸濃度', function () {
  const o = { m: 0.1, c: 0.8, V: 5, T: 22, P: 755 };
  const A = S.amounts(o);
  ok(A.lim === 'HCl');
  const V = S.gasState(100, A.nH2, 22, 755, true).V;
  const a = S.analyze(o, { reading: V, lim: 'HCl', vap: true });
  near(a.cHCl, 0.8, 1e-12, '濃度'); near(a.Vm, S.VM_STP, 1e-9, '莫耳體積');
  const b = S.analyze(o, { reading: V, lim: 'Mg', vap: true });
  ok(b.Merr > 0.5, '選錯限量試劑，原子量錯很多');
});

test('量筒：刻度範圍、鎂帶長度、要收集體積 V 需要的莫耳數', function () {
  ok(S.onScale(100, 10) && S.onScale(100, 100) && !S.onScale(100, 9.9) && !S.onScale(100, 100.1));
  near(S.ribbonLength(0.05), 3.846, 0.001);
  near(S.gasState(100, S.molForVolume(80, 25, 760), 25, 760, true).V, 80, 1e-9);
});

console.log('\n共 ' + (pass + fail) + ' 項：通過 ' + pass + '，失敗 ' + fail);
if (fail) process.exit(1);
