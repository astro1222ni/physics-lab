// 以 Node 執行：node tests/paper-chromatography-core.test.js
'use strict';
const assert = require('assert');
const P = require('../js/paper-chromatography-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`); }
const DEF = { lanes: ['ink', 'green', 'brown'], spot: 3, z0: 1.5, zL: 0.8, pen: false, solvent: 'mix', phi: 0, lid: true, X: [] };
function mk(o) { return P.createRun(Object.assign({}, DEF, o)); }
function runTo(run, t, dt) { while (run.t < t - 1e-9) P.step(run, Math.min(dt || 1, t - run.t)); return run; }
function runToDF(run, dF, dt) { while (P.snapshot(run).dF < dF && !run.ranOff) P.step(run, dt || 0.5); return run; }

test('數據：水的黏度 1.002 mPa·s、表面張力 72.8 mN/m；乙醇 1.20、22.4（20 °C）', function () {
  const w = P.solvent('mix', 0), e = P.solvent('mix', 1);
  near(w.eta, 1.002, 1e-9); near(w.gamma, 72.8, 1e-9);
  near(e.eta, 1.20, 1e-9); near(e.gamma, 22.4, 1e-9);
  near(w.ETN, 1, 1e-12); near(e.ETN, 0.654, 1e-12);
});
test('體積分率換算成質量百分率：兩端是 0 與 100，50% 體積約 44% 質量', function () {
  near(P.massPct(0), 0, 1e-12); near(P.massPct(1), 100, 1e-12);
  near(P.massPct(0.5), 100 * 0.789 / (0.789 + 0.998), 1e-9);
});
test('Washburn：D = γ·r cosθ /(2η)，水約 0.109 cm²/s，前緣 10 cm 約 15 分鐘', function () {
  const w = P.solvent('mix', 0);
  near(w.D, 72.8e-3 * 0.30e-6 / (2 * 1.002e-3) * 1e4, 1e-12);
  near(w.D, 0.109, 0.001);
  near(P.timeTo(w, 10) / 60, 15.3, 0.1);
});
test('蓋著時 s² = D·t（逐步積分與解析解相同）', function () {
  ['mix', 'salt', 'ace', 'pe'].forEach(function (k) {
    const run = mk({ solvent: k });
    runTo(run, 300, 0.7);
    near(P.frontS(run) ** 2, run.sv.D * 300, 1e-9, k);
    near(P.frontS(run), P.frontAt(run.sv, 300, true), 1e-9, k);
  });
});
test('前緣高度與 √t 成正比：時間變 4 倍，距離變 2 倍', function () {
  const sv = P.solvent('salt');
  near(P.frontAt(sv, 400, true) / P.frontAt(sv, 100, true), 2, 1e-12);
});
test('沒蓋時 d(s²)/dt = D − 2εs²：逐步積分等於精確解，最後停在 s∞ = √(D/2ε)', function () {
  const run = mk({ solvent: 'ace', lid: false });
  runTo(run, 200, 0.37);
  near(P.frontS(run), P.frontAt(run.sv, 200, false), 1e-9);
  runTo(run, 5000, 5);
  near(P.frontS(run), P.sInf(run.sv), 1e-6);
  assert.ok(P.sInf(run.sv) < P.topS(run), '丙酮沒蓋時前緣到不了紙頂');
  // 水的蒸氣壓小，s∞ 超過紙長：沒蓋也會爬到頂
  assert.ok(P.sInf(P.solvent('mix', 0)) > P.topS(run));
});
test('水—乙醇混合液在 φ ≈ 0.56 時 D 最小（黏度大、表面張力小），比純水和純乙醇都慢', function () {
  const p = P.phiSlowest();
  near(p, 0.5585, 0.002);
  const d = P.solvent('mix', p).D;
  assert.ok(d < P.solvent('mix', 0).D && d < P.solvent('mix', 1).D);
  assert.ok(d < P.solvent('mix', p - 0.05).D && d < P.solvent('mix', p + 0.05).D);
});
test('蓋著展開時，每個斑點的移動距離 = Rf × 前緣離起始線的距離', function () {
  ['mix', 'salt', 'ace', 'pe'].forEach(function (k) {
    const run = mk({ solvent: k, lanes: ['ink', 'leaf', 'candy'] });
    runToDF(run, 9);
    const s = P.snapshot(run);
    s.lanes.forEach(function (L) { L.spots.forEach(function (sp) { near(sp.d, sp.rf * s.dF, 0.02, k + ' ' + sp.id); }); });
  });
});
test('Rf 都在 0 與 1 之間；混合液的 Rf 在兩端等於水與乙醇的值', function () {
  Object.keys(P.COMP).forEach(function (id) {
    ['salt', 'ace', 'pe'].forEach(function (k) { const R = P.rf(id, k); assert.ok(R > 0 && R < 1, id + ' ' + k); });
    for (let i = 0; i <= 20; i++) { const R = P.rf(id, 'mix', i / 20); assert.ok(R > 0 && R < 1, id + ' φ=' + i / 20); }
    near(P.rf(id, 'mix', 0), Math.max(0.003, P.COMP[id].rf.w), 1e-9, id);
    near(P.rf(id, 'mix', 1), Math.max(0.003, P.COMP[id].rf.e), 1e-9, id);
  });
});
test('Rf = 1/(1 + k)：k = (1 − Rf)/Rf，Rf = 0.5 時 k = 1', function () {
  near(P.kOf(0.5), 1, 1e-12);
  [0.1, 0.33, 0.8].forEach(function (R) { near(1 / (1 + P.kOf(R)), R, 1e-12); });
});
test('線性溶劑強度：ln k 對乙醇分率是直線', function () {
  const lk = function (p) { return Math.log(P.kOf(P.rf('R40', 'mix', p))); };
  near(lk(0.5), 0.5 * (lk(0) + lk(1)), 1e-9);
  near(lk(0.25), 0.75 * lk(0) + 0.25 * lk(1), 1e-9);
});
test('葉綠素萃取液在石油醚＋丙酮中由上到下：胡蘿蔔素 > 葉黃素 > 葉綠素 a > 葉綠素 b；在水中留在原地', function () {
  const r = function (id) { return P.rf(id, 'pe'); };
  assert.ok(r('car') > r('xan') && r('xan') > r('chla') && r('chla') > r('chlb'));
  ['car', 'xan', 'chla', 'chlb'].forEach(function (id) { assert.ok(P.rf(id, 'mix', 0) < 0.01 && P.rf(id, 'salt') < 0.01); });
});
test('沒蓋時前緣停住、斑點還在往上走，量到的 Rf 偏大', function () {
  const run = mk({ lanes: ['R40', 'none', 'none'], phi: 0.3, lid: false });
  runTo(run, 3 * 3600, 5);
  const s = P.snapshot(run), sp = s.lanes[0].spots[0];
  assert.ok(sp.d / s.dF > sp.rf + 0.1, '量到 ' + sp.d / s.dF + '、真值 ' + sp.rf);
  assert.ok(sp.z <= s.zF + 1e-9, '斑點不會跑到前緣前面');
});
test('起始線泡在液面下：斑點畫在真正的位置，樣品以 τ = 20 s 溶進展開液，紙上剩下的越來越淡', function () {
  const run = mk({ z0: 0.6, zL: 1.0 });
  assert.ok(run.submerged);
  near(P.snapshot(run).lanes[0].spots[0].z, 0.6, 1e-9);
  const a0 = P.snapshot(run).lanes[0].spots[0].amt;
  runTo(run, 40, 0.5);
  near(run.frac, Math.exp(-2), 1e-6);
  near(P.snapshot(run).lanes[0].spots[0].amt, a0 * Math.exp(-2), 1e-9);
  // 起始線在液面上方就不會溶掉
  const ok = mk({});
  runTo(ok, 40, 0.5);
  near(ok.frac, 1, 0);
});
test('斑點變寬：σ² = σ0² + H·d + 2Dm·t；點樣越大，相鄰斑點的解析度 Rs 越小', function () {
  const g = P.sigmas(0.1, 4, 100);
  near(g.sz * g.sz, 0.01 + P.H_PLATE * 4 + 2 * P.DM * 100, 1e-12);
  const rs = function (spot) { const run = mk({ lanes: ['brown', 'none', 'none'], solvent: 'salt', spot: spot }); runToDF(run, 6); return P.pairs(P.snapshot(run), 0).minRs; };
  const a = rs(2), b = rs(6), c = rs(10);
  assert.ok(a > b && b > c, a + ' > ' + b + ' > ' + c);
});
test('總量固定：點樣變大時斑點變淡，但光學密度的積分不變', function () {
  const od = function (spot) { const run = mk({ lanes: ['B1', 'none', 'none'], spot: spot }); return P.snapshot(run).lanes[0].spots[0]; };
  const a = od(2), b = od(8);
  assert.ok(a.od > b.od);
  near(a.od * 2 * Math.PI * a.sx * a.sz, b.od * 2 * Math.PI * b.sx * b.sz, 1e-12);
});
test('peaks 與 measureAt：分開的斑點各算一個，量測會爬到斑點中心', function () {
  const run = mk({ lanes: ['leaf', 'none', 'none'], solvent: 'pe' });
  runToDF(run, 10);
  const s = P.snapshot(run);
  assert.strictEqual(P.peaks(s, 0).length, 4);
  const car = s.lanes[0].spots.find(function (q) { return q.id === 'car'; });
  const m = P.measureAt(s, 0, car.z - 0.2);
  near(m.z, car.z, 0.01); assert.strictEqual(m.dom, 'car'); assert.ok(m.purity > 0.95);
  assert.strictEqual(P.measureAt(s, 1, 5), null, '空的那道量不到');
});
test('預設（水）：黑色水性筆看得出 3 個斑點，咖啡色只有 1 個（分不開）', function () {
  const run = mk({});
  runToDF(run, 8);
  const s = P.snapshot(run);
  assert.strictEqual(P.peaks(s, 0).length, 3);
  assert.strictEqual(P.peaks(s, 2).length, 1);
});
test('前緣到紙頂就記下「跑出紙外」', function () {
  const run = mk({});
  runTo(run, 3600, 2);
  assert.ok(run.ranOff && run.tRanOff > 0);
  near(P.snapshot(run).zF, P.PAPER.H, 1e-12);
});
test('未知樣品 X：四種色素中選 2 或 3 種，種子相同結果相同', function () {
  const seen = {};
  for (let s = 1; s <= 200; s++) {
    const x = P.makeUnknown(s);
    assert.ok(x.length === 2 || x.length === 3);
    x.forEach(function (id) { assert.ok(P.DYES.indexOf(id) >= 0); });
    assert.deepStrictEqual(P.makeUnknown(s), x);
    seen[x.join()] = 1;
  }
  assert.strictEqual(Object.keys(seen).length, 6 + 4, '2 種 6 組、3 種 4 組都會出現');
});
test('尺讀到 0.05 cm', function () {
  near(P.roundRuler(3.437), 3.45, 1e-12); near(P.roundRuler(3.42), 3.4, 1e-12);
});
console.log(`${passed} 項通過`);
