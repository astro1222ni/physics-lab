// 以 Node 執行：node tests/ohms-law-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/ohms-law-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1e-12);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
/** 決定性的亂數（每次測試結果相同） */
let seed = 20261111;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
const R = function (k) { return K.wireR(K.WIRES[k]); };

// ---------------- 器材 ----------------
test('導線電阻 R = ρL/A（手算：銅線 a 為 2.761 Ω、鎳鉻線 e 為 974.4 Ω）', function () {
  close(R('a'), 1.7e-8 * 10 / (Math.PI * 0.14e-3 * 0.14e-3), 1e-12);
  close(R('a'), 2.7608, 1e-4);
  close(R('e'), 974.42, 1e-4);
});
test('長度加倍電阻加倍、直徑減半電阻變 4 倍（c = 2a、b = 4a、d = 8a）', function () {
  close(R('c') / R('a'), 2, 1e-12);
  close(R('b') / R('a'), 4, 1e-12);
  close(R('d') / R('a'), 8, 1e-12);
  close(R('e') / R('b'), 1.5e-6 / 1.7e-8, 1e-12);
});
test('電表內電阻：毫安培計滿刻度時兩端 0.1 V、伏特計 1000 Ω/V', function () {
  close(K.ammeterR(0.005), 20, 1e-12);
  close(K.ammeterR(0.05), 2, 1e-12);
  close(K.ammeterR(0.5), 0.2, 1e-12);
  close(K.voltmeterR(3), 3000, 1e-12);
  close(K.voltmeterR(15), 15000, 1e-12);
});
test('色環：100 Ω 棕黑棕金、220 Ω 紅紅棕金、47 Ω 黃紫黑金', function () {
  assert.deepStrictEqual(K.colorBands(100), ['brown', 'black', 'brown', 'gold']);
  assert.deepStrictEqual(K.colorBands(220), ['red', 'red', 'brown', 'gold']);
  assert.deepStrictEqual(K.colorBands(47), ['yellow', 'violet', 'black', 'gold']);
  assert.deepStrictEqual(K.colorBands(680), ['blue', 'grey', 'brown', 'gold']);
});
test('神秘電阻 X：標示值屬於 E12 系列，實際值在 ±4% 以內', function () {
  for (let i = 0; i < 300; i++) {
    const x = K.mysteryX(rnd);
    assert.ok(K.E12_X.indexOf(x.nominal) >= 0);
    assert.ok(Math.abs(x.actual / x.nominal - 1) <= 0.0401, '實際值 ' + x.actual + ' 偏離標示值 ' + x.nominal);
  }
});

// ---------------- 電路解法 ----------------
test('修正節點分析：分壓電路（12 V，2 Ω 與 4 Ω 串聯 → 中點 8 V，電流 2 A）', function () {
  const s = K.mna(3, [{ type: 'V', a: 0, b: 1, E: 12 }, { type: 'R', a: 1, b: 2, R: 2 }, { type: 'R', a: 2, b: 0, R: 4 }]);
  close(s.V[1], 12, 1e-12); close(s.V[2], 8, 1e-12);
  close(s.I[1], 2, 1e-12); close(s.I[0], 2, 1e-12);
});
test('修正節點分析：電阻為 0 自動當成導線、無限大當成斷路', function () {
  const s = K.mna(3, [{ type: 'V', a: 0, b: 1, E: 6 }, { type: 'R', a: 1, b: 2, R: 0 }, { type: 'R', a: 2, b: 0, R: 3 }, { type: 'R', a: 2, b: 0, R: Infinity }]);
  close(s.V[2], 6, 1e-12); close(s.I[1], 2, 1e-12); assert.strictEqual(s.I[3], 0);
});
test('外接法手算：ε = 6 V、r = 0.5 Ω、R箱 = 100 Ω、rA = 2 Ω、rV = 3000 Ω、R = 50 Ω', function () {
  const s = K.bench({ emf: 6, rs: 0.5, Rbox: 100, rA: 2, rV: 3000, method: 'ext', elem: { kind: 'R', R: 50 } });
  const Rp = 50 * 3000 / 3050;
  const I = 6 / (0.5 + 100 + 2 + Rp);
  close(s.IA, I, 1e-12, '安培計電流');
  close(s.VV, I * Rp, 1e-12, '伏特計電壓');
  close(s.VR, s.VV, 1e-12, '外接法：伏特計電壓就是元件電壓');
  close(s.IR + s.IV, s.IA, 1e-12, '安培計電流 = 元件電流 + 伏特計電流');
  close(s.Isrc, I, 1e-12);
});
test('內接法手算：同上但伏特計跨在安培計＋元件兩端', function () {
  const s = K.bench({ emf: 6, rs: 0.5, Rbox: 100, rA: 2, rV: 3000, method: 'int', elem: { kind: 'R', R: 50 } });
  const Rp = 52 * 3000 / 3052;
  const Is = 6 / (0.5 + 100 + Rp);
  close(s.Isrc, Is, 1e-12);
  close(s.VV, Is * Rp, 1e-12, '伏特計電壓');
  close(s.IA, s.VV / 52, 1e-12, '安培計電流');
  close(s.IA, s.IR, 1e-12, '內接法：安培計電流就是元件電流');
  close(s.VV, s.VR + s.VA, 1e-12, '伏特計電壓 = 元件電壓 + 安培計電壓');
});
test('量到的 R′ = V讀數/I讀數 恰好等於理論公式：內接 R + rA、外接 R rV/(R + rV)（隨機 300 組）', function () {
  for (let i = 0; i < 300; i++) {
    const Rx = Math.exp(Math.log(0.5) + rnd() * Math.log(4000));
    const cfg = { emf: 0.5 + rnd() * 14, rs: rnd() * 2, Rbox: Math.floor(rnd() * 3000), rA: [20, 2, 0.2][i % 3], rV: [3000, 15000][i % 2], elem: { kind: 'R', R: Rx } };
    ['ext', 'int'].forEach(function (m) {
      const s = K.bench(Object.assign({ method: m }, cfg));
      close(s.VV / s.IA, K.predictedR(m, Rx, cfg.rA, cfg.rV), 1e-9, m + ' R=' + Rx);
    });
  }
});
test('系統誤差的方向：內接法偏大、外接法偏小；理想電表（rA → 0、rV → ∞）兩者都等於真實值', function () {
  [2.76, 11, 100, 974].forEach(function (Rx) {
    assert.ok(K.predictedR('int', Rx, 2, 3000) > Rx);
    assert.ok(K.predictedR('ext', Rx, 2, 3000) < Rx);
    const si = K.bench({ emf: 3, rs: 0.5, Rbox: 10, rA: 1e-6, rV: 1e12, method: 'int', elem: { kind: 'R', R: Rx } });
    const se = K.bench({ emf: 3, rs: 0.5, Rbox: 10, rA: 1e-6, rV: 1e12, method: 'ext', elem: { kind: 'R', R: Rx } });
    close(si.VV / si.IA, Rx, 1e-5); close(se.VV / se.IA, Rx, 1e-5);
  });
});
test('低電阻（銅線 b）外接法較準、高電阻（鎳鉻線 e）內接法較準', function () {
  const eb = function (m, rA, rV) { return Math.abs(K.predictedR(m, R('b'), rA, rV) / R('b') - 1); };
  const ee = function (m, rA, rV) { return Math.abs(K.predictedR(m, R('e'), rA, rV) / R('e') - 1); };
  assert.ok(eb('ext', 2, 3000) < eb('int', 2, 3000));
  assert.ok(ee('int', 20, 15000) < ee('ext', 20, 15000));
  close(K.predictedR('int', R('e'), 20, 15000) / R('e') - 1, 20 / R('e'), 1e-12);
});
test('臨界電阻：兩種接法的相對誤差大小相同；小於它用外接、大於它用內接', function () {
  [[2, 3000], [20, 15000], [0.2, 3000]].forEach(function (p) {
    const Rc = K.criticalR(p[0], p[1]);
    const ei = K.predictedR('int', Rc, p[0], p[1]) / Rc - 1, ex = 1 - K.predictedR('ext', Rc, p[0], p[1]) / Rc;
    close(ei, ex, 1e-10);
    close(Rc, Math.sqrt(p[0] * p[1]), 0.05, '約等於 √(rA rV)');
    const lo = Rc / 3, hi = Rc * 3;
    assert.ok(1 - K.predictedR('ext', lo, p[0], p[1]) / lo < K.predictedR('int', lo, p[0], p[1]) / lo - 1);
    assert.ok(1 - K.predictedR('ext', hi, p[0], p[1]) / hi > K.predictedR('int', hi, p[0], p[1]) / hi - 1);
  });
});
test('電阻箱為 0 Ω 時與極小電阻的結果一致', function () {
  const a = K.bench({ emf: 1, rs: 0.5, Rbox: 0, rA: 0.2, rV: 3000, method: 'ext', elem: { kind: 'R', R: R('a') } });
  const b = K.bench({ emf: 1, rs: 0.5, Rbox: 1e-9, rA: 0.2, rV: 3000, method: 'ext', elem: { kind: 'R', R: R('a') } });
  close(a.IA, b.IA, 1e-8); close(a.VV, b.VV, 1e-8);
  close(a.IA, 1 / (0.5 + 0.2 + R('a') * 3000 / (R('a') + 3000)), 1e-12);
});
test('能量守恆：電動勢供給的功率 = 所有電阻（含電表、電源內電阻）消耗的功率', function () {
  for (let i = 0; i < 100; i++) {
    const m = i % 2 ? 'int' : 'ext';
    const c = { emf: 1 + rnd() * 14, rs: 0.5, Rbox: Math.floor(rnd() * 500), rA: [20, 2, 0.2][i % 3], rV: [3000, 15000][(i >> 1) % 2], method: m };
    const lamp = i % 4 === 0;
    const s = K.bench(Object.assign({ elem: lamp ? { kind: 'lamp' } : { kind: 'R', R: 1 + rnd() * 1000 } }, c));
    const V = s.V;
    const Pin = c.emf * s.Isrc;
    const Pout = Math.pow(V[1] - V[2], 2) / c.rs + Math.pow(V[2] - V[3], 2) / Math.max(c.Rbox, 1e-300) * (c.Rbox > 0 ? 1 : 0) +
      Math.pow(s.VA, 2) / c.rA + s.VR * s.IR + s.VV * s.VV / c.rV;
    close(Pin, Pout, 1e-9, '功率');
  }
});

// ---------------- 燈泡 ----------------
test('燈泡：額定電壓 2.5 V 時電流 0.30 A、燈絲 2400 K；冷電阻約 0.69 Ω', function () {
  const s = K.lampSteady(2.5, 0);
  close(s.T, 2400, 1e-6); close(2.5 / s.R, 0.3, 1e-6);
  close(K.LAMP.R0, 0.6872, 1e-3);
  close(K.lampR(300), K.LAMP.R0, 1e-12);
});
test('燈泡：電壓愈大、溫度與 V/I 愈大（不遵守歐姆定律），電壓→0 時 V/I → 冷電阻', function () {
  let lastT = 300, lastR = 0;
  for (let V = 0.02; V <= 5; V += 0.02) {
    const s = K.lampSteady(V, 0);
    assert.ok(s.T > lastT && s.R > lastR, 'V = ' + V);
    lastT = s.T; lastR = s.R;
  }
  close(K.lampSteady(1e-4, 0).R, K.LAMP.R0, 1e-3);
});
test('燈泡穩定狀態滿足能量平衡：I²R = 傳導 + 輻射散熱', function () {
  [0.3, 1, 2, 3.5].forEach(function (Vth) {
    [0, 1, 5].forEach(function (Rth) {
      const s = K.lampSteady(Vth, Rth);
      const I = Vth / (Rth + s.R);
      close(I * I * s.R, K.lampLoss(s.T), 1e-9, 'Vth=' + Vth + ' Rth=' + Rth);
    });
  });
});
test('燈泡電壓超過約 5 V（兩倍額定）燈絲燒斷', function () {
  assert.ok(!K.lampSteady(4.8, 0).burnt);
  assert.ok(K.lampSteady(5.3, 0).burnt);
});
test('燈泡接在實驗電路中：戴維寧等效求出的工作點滿足克希何夫定律與能量平衡', function () {
  ['ext', 'int'].forEach(function (m) {
    const s = K.bench({ emf: 3, rs: 0.5, Rbox: 2, rA: 0.2, rV: 3000, method: m, elem: { kind: 'lamp' } });
    close(s.IR, s.VR / s.Rx, 1e-12);
    close(s.IR * s.IR * s.Rx, K.lampLoss(s.T), 1e-8);
    if (m === 'ext') close(s.IA, s.IR + s.IV, 1e-12); else close(s.IA, s.IR, 1e-12);
    close(s.Isrc, s.IA + (m === 'int' ? s.IV : 0), 1e-12);
  });
});
test('燒斷（斷路）的燈泡：外接法伏特計幾乎量到電源電壓，安培計只剩流過伏特計的微小電流', function () {
  const s = K.bench({ emf: 6, rs: 0.5, Rbox: 10, rA: 0.2, rV: 3000, method: 'ext', elem: { kind: 'open' } });
  close(s.IA, 6 / (0.5 + 10 + 0.2 + 3000), 1e-9);
  close(s.VV, 6 * 3000 / 3010.7, 1e-9);
  assert.strictEqual(s.IR, 0);
});

// ---------------- 數據分析與讀數 ----------------
test('通過原點的最佳直線：完全成正比的數據斜率精確、R² = 1', function () {
  const xs = [0.4, 0.8, 1.2, 1.6, 2.0], ys = xs.map(function (x) { return x / 10; });
  const f = K.fitOrigin(xs, ys);
  close(f.k, 0.1, 1e-12); close(f.r2, 1, 1e-12); close(f.slope, 0.1, 1e-12); assert.ok(Math.abs(f.icpt) < 1e-12);
});
test('通過原點的最佳直線 k = Σxy/Σx²（手算），含截距直線找回截距', function () {
  const xs = [1, 2, 3], ys = [2.2, 3.9, 6.1];
  const f = K.fitOrigin(xs, ys);
  close(f.k, (2.2 + 7.8 + 18.3) / 14, 1e-12);
  const g = K.fitOrigin([1, 2, 3, 4], [1.5, 2.5, 3.5, 4.5]);
  close(g.slope, 1, 1e-12); close(g.icpt, 0.5, 1e-12);
});
test('指針讀數：理想時等於指針位置；含誤差時取到半小格；零點誤差使指針偏移', function () {
  const r = K.readMeter(1.234, 3, 30, { ideal: true });
  close(r.reading, 1.234, 1e-12);
  for (let i = 0; i < 200; i++) {
    const q = K.readMeter(1.234, 3, 30, { ideal: false, rng: rnd });
    const halfDivs = q.reading / 0.05;
    close(halfDivs, Math.round(halfDivs), 1e-9, '半小格');
    assert.ok(Math.abs(q.reading - 1.234) <= 0.15, '讀數誤差合理');
  }
  close(K.readMeter(0, 3, 30, { ideal: true, zero: 0.6 }).needle, 0.06, 1e-12);
  assert.ok(K.readMeter(3.1, 3, 30, { ideal: true }).over);
  assert.ok(!K.readMeter(3.0, 3, 30, { ideal: true }).over);
});
test('數位三用電表：自動換檔與解析度（0.69 Ω → 0.7、974.4 Ω → 974、2.6 kΩ → 2.60 k）', function () {
  const a = K.multimeter(0.6872, { ideal: true });
  assert.strictEqual(a.range, 200); close(a.value, 0.7, 1e-9);
  const e = K.multimeter(974.42, { ideal: true });
  assert.strictEqual(e.range, 2000); close(e.value, 974, 1e-9);
  const x = K.multimeter(2600, { ideal: true });
  assert.strictEqual(x.range, 20000); close(x.value, 2600, 1e-9);
  assert.ok(K.multimeter(Infinity).over);
  for (let i = 0; i < 100; i++) {
    const v = K.multimeter(100, { ideal: false, rng: rnd });
    assert.ok(Math.abs(v.value - 100) <= 0.8 + 0.2 + 0.05);
  }
});

console.log(`${passed} 個測試通過`);
