// 以 Node 執行：node tests/oxygen-hemoglobin-core.test.js
'use strict';
const assert = require('assert');
const O = require('../js/oxygen-hemoglobin-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b} ± ${tol}，得到 ${a}`);
}
const STD = { pH: 7.4, PCO2: 40, T: 37, BPG: 5 };
const REST = { alt: 0, PaCO2: 40, HCO3: 24, T: 37, BPG: 5, Hb: 15, ppm: 0, D: 5, type: 'A' };
function st(o) { return O.state(Object.assign({}, REST, o)); }

console.log('oxygen-hemoglobin-core');

test('Severinghaus 標準曲線：P50 ≈ 26.86 mmHg；PO2 100 時約 97.5%、40 時約 75%；單調遞增', () => {
  close(O.sev(O.P50_STD), 0.5, 1e-3);
  close(O.p50(STD, 'A', 0), 26.86, 0.05);
  close(O.sev(100), 0.975, 0.005);
  close(O.sev(40), 0.75, 0.01);
  let prev = 0;
  for (let p = 1; p <= 200; p++) { const s = O.sev(p); assert.ok(s > prev); prev = s; }
  close(O.sevInv(O.sev(33.3)), 33.3, 1e-6);
  assert.strictEqual(O.sev(0), 0);
});

test('Hill 係數：血紅素約 2.7（S 形），肌紅素 = 1（雙曲線），胎兒血紅素也是 S 形', () => {
  const n = O.hillN(STD, 'A');
  assert.ok(n > 2.5 && n < 2.9, 'n = ' + n);
  close(O.hillN(STD, 'Mb'), 1, 1e-3);
  assert.ok(O.hillN(STD, 'F') > 2.5);
});

test('肌紅素 P50 = 2.8、胎兒血紅素 P50 = 19：親和力 Mb > HbF > HbA', () => {
  close(O.p50(STD, 'Mb', 0), 2.8, 1e-6);
  close(O.p50(STD, 'F', 0), 19, 0.05);
  for (const p of [10, 20, 30, 40]) {
    assert.ok(O.sat0(p, STD, 'Mb') > O.sat0(p, STD, 'F'));
    assert.ok(O.sat0(p, STD, 'F') > O.sat0(p, STD, 'A'));
  }
});

test('波耳效應的方向：酸、CO2 多、體溫高、2,3-BPG 多都讓 P50 變大（右移）', () => {
  const p = c => O.p50(Object.assign({}, STD, c), 'A', 0);
  const p0 = p({});
  assert.ok(p({ pH: 7.2 }) > p0);
  assert.ok(p({ PCO2: 60 }) > p0);
  assert.ok(p({ T: 40 }) > p0);
  assert.ok(p({ BPG: 8 }) > p0);
  assert.ok(p({ pH: 7.6 }) < p0);
  assert.ok(p({ T: 30 }) < p0);
  // 教科書：pH 降 0.2 時 P50 約 30–33 mmHg；沒有 BPG 時約 17
  const a = p({ pH: 7.2 }); assert.ok(a > 30 && a < 34, a);
  const b = p({ BPG: 0 }); assert.ok(b > 15 && b < 19, b);
  // 肌紅素不受影響
  close(O.p50(Object.assign({}, STD, { pH: 7.0, T: 41 }), 'Mb', 0), 2.8, 1e-6);
});

test('Henderson–Hasselbalch：HCO3 24、PCO2 40 → pH 7.40；換氣過度變鹼', () => {
  close(O.pHof(40, 24), 7.4, 0.005);
  assert.ok(O.pHof(20, 24) > 7.6);
  assert.ok(O.pHof(60, 24) < 7.3);
});

test('West 模型大氣：海平面 760、聖母峰頂約 253 mmHg；肺泡氣體方程式在海平面約 100', () => {
  close(O.Pb(0), 760, 2);
  close(O.Pb(8848), 253, 2);
  close(O.PAO2(0, 40), 99.7, 0.5);
  // 峰頂若不過度換氣，肺泡裡沒有氧
  assert.strictEqual(O.PAO2(8848, 40), 0);
  // 1981 年峰頂：PaCO2 約 7.5 → PAO2 約 35
  const A = O.PAO2(8848, 7.5); assert.ok(A > 30 && A < 40, A);
});

test('一氧化碳：Haldane 比例 [HbCO]/[HbO2] = M·PCO/PO2；總飽和度不超過 1；O2 曲線左移、變低', () => {
  const PCO = O.PCOalv(200, 0), P = 90;
  const s = O.sat(P, STD, 'A', PCO);
  close(s.CO / s.O2, O.M_HB * PCO / P, 1e-9);
  close(s.O2 + s.CO, s.tot, 1e-12);
  assert.ok(s.tot <= 1);
  assert.ok(s.O2 < O.sat0(P, STD, 'A'));
  // 剩下的位置抓氧更緊：O2 占剩餘位置的比例在低 PO2 時比沒有 CO 時高
  const lo = O.sat(20, STD, 'A', PCO);
  assert.ok(lo.O2 / (1 - lo.CO) > O.sat0(20, STD, 'A'));
  // CO 很多時 O2 飽和度到不了 50%
  assert.strictEqual(O.p50(STD, 'A', O.PCOalv(10000, 0)), Infinity);
});

test('Fick 原理：Ca − Cv 剛好等於交給組織的氧 D；安靜時 Pv 約 40、Sv 約 75%', () => {
  const s = st({});
  close(s.Ca - s.Cv, 5, 1e-6);
  close(s.dC, 5, 1e-6);
  assert.ok(s.Pv > 37 && s.Pv < 44, s.Pv);
  assert.ok(s.Sv > 0.7 && s.Sv < 0.8, s.Sv);
  assert.ok(s.Sa > 0.96);
  close(s.Ca, 1.34 * 15 * s.Sa + 0.0031 * s.Pa, 1e-9);
  close(s.frac, 5 / s.Ca, 1e-9);
  // 要得越多，Pv 越低
  assert.ok(st({ D: 10 }).Pv < s.Pv);
  // Ca 不夠交 → deficit
  const d = st({ D: 18, Hb: 8 });
  assert.ok(d.deficit);
});

test('運動：右移（發燒、酸、CO2 多）讓同樣的交氧量下靜脈 PO2 較高——肌肉拿得到氧', () => {
  const plain = st({ D: 15 }).Pv;
  const hot = st({ D: 15, T: 39.5, PaCO2: 34, HCO3: 18 }).Pv;
  assert.ok(hot > plain, plain + ' → ' + hot);
});

test('高山：5000 m 不過度換氣 Sa 很低；把 PaCO2 降到 25 後 Sa > 85%', () => {
  const a = st({ alt: 5000, PaCO2: 40 }).Sa;
  const b = st({ alt: 5000, PaCO2: 25 }).Sa;
  assert.ok(a < 0.6, a);
  assert.ok(b > 0.85, b);
});

test('一氧化碳中毒：200 ppm 時 PaO2 正常，但含氧量只剩約 3/4', () => {
  const s = st({ ppm: 200 });
  assert.ok(s.Pa > 90);
  assert.ok(s.COHb > 0.2);
  assert.ok(s.Ca / s.Ca0 < 0.8, s.Ca / s.Ca0);
});

test('MWC：L = 0 或 c = 1 時沒有協同（n = 1）；血紅素參數 n 約 2.85、P50 = 26.86', () => {
  close(O.mwcN(0, 0.01), 1, 1e-3);
  close(O.mwcN(9000, 1), 1, 1e-3);
  const n = O.mwcN(O.MWC_HB.L, O.MWC_HB.c);
  assert.ok(n > 2.7 && n < 3, n);
  close(O.mwcA50(O.MWC_HB.L, O.MWC_HB.c) * O.MWC_HB.KR, O.P50_STD, 1e-6);
  // 四個亞基的協同上限 n < 4
  for (const L of [1e2, 1e4, 1e6]) for (const c of [1e-4, 1e-3, 1e-2]) assert.ok(O.mwcN(L, c) < 4);
});

test('MWC：十種狀態機率加總 = 1；平均結合數 / 4 = Y；R 狀態比例隨 PO2 增加', () => {
  const L = 9000, c = 0.014;
  for (const a of [0.1, 1, 5, 30]) {
    const d = O.mwcDist(a, L, c);
    close(d.reduce((s, x) => s + x, 0), 1, 1e-12);
    let m = 0; d.forEach((p, i) => { m += p * (i % 5); });
    close(m / 4, O.mwcY(a, L, c), 1e-12);
    let R = 0; for (let i = 0; i < 5; i++) R += d[i];
    close(R, O.mwcR(a, L, c), 1e-12);
  }
  assert.ok(O.mwcR(30, L, c) > O.mwcR(1, L, c));
  assert.ok(O.mwcR(0, L, c) < 0.001);
});

test('MWC 抽樣：大量抽樣的平均飽和度接近 Y（誤差 < 1%）', () => {
  const r = O.rng(7), L = 9000, c = 0.014, a = 8;
  const d = O.mwcDist(a, L, c);
  let k = 0; const N = 40000;
  for (let i = 0; i < N; i++) k += O.draw(d, r).k;
  close(k / (4 * N), O.mwcY(a, L, c), 0.01);
});

test('MWC 的「超級血紅素」做得到：P50 在 26.9 ± 1.5 且 n ≥ 3.3（調 L、c，KR 固定）', () => {
  const KR = O.MWC_HB.KR;
  let found = false;
  for (let lL = 3; lL <= 8 && !found; lL += 0.01) for (let lc = -4; lc <= -1.5 && !found; lc += 0.01) {
    const L = Math.pow(10, lL), c = Math.pow(10, lc);
    const p = O.mwcA50(L, c) * KR;
    if (Math.abs(p - 26.9) <= 1.5 && O.mwcN(L, c) >= 3.3) found = true;
  }
  assert.ok(found);
});

test('Hill 擬合：理想點的 log(Y/(1−Y)) 對 log P 的斜率在 P50 附近接近理論 n', () => {
  const L = 9000, c = 0.014, KR = O.MWC_HB.KR;
  const xs = [], ys = [];
  for (const P of [18, 22, 27, 32, 38]) { const y = O.mwcY(P / KR, L, c); xs.push(Math.log10(P)); ys.push(Math.log10(y / (1 - y))); }
  const f = O.linfit(xs, ys);
  close(f.slope, O.mwcN(L, c), 0.15);
  assert.strictEqual(O.linfit([1], [1]), null);
});

test('族群模擬：剛初始化時不算平衡；每個分子在 t0 之後都重抽過才算；長時間平均接近理論 Y', () => {
  const L = 9000, c = 0.014, KR = O.MWC_HB.KR;
  const p = O.pop(48, 11, 3);
  p.init(O.mwcDist(300 / KR, L, c));
  assert.ok(!p.settledSince(p.t));
  const d = O.mwcDist(27 / KR, L, c), t0 = p.t;
  let guard = 0;
  while (!p.settledSince(t0) && guard++ < 10000) p.step(1 / 60, d);
  assert.ok(p.settledSince(t0));
  assert.ok(p.t > 0.2 && p.t < 5, '平衡時間 ' + p.t);
  let acc = 0; const N = 60 * 120;
  for (let i = 0; i < N; i++) { p.step(1 / 60, d); acc += p.mean(); }
  close(acc / N, O.mwcY(27 / KR, L, c), 0.03);
  assert.ok(p.fracR() >= 0 && p.fracR() <= 1);
});

console.log(passed + ' 項通過');
