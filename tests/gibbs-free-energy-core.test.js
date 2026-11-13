// 以 Node 執行：node tests/gibbs-free-energy-core.test.js
'use strict';
const assert = require('assert');
const G = require('../js/gibbs-free-energy-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`); }
const D = id => G.rxData(id);

test('數據：九個反應的 ΔH°、ΔS° 由生成焓與標準莫耳熵相加（係數 × 物種）', function () {
  near(D('vap').dH, -241.82 + 285.83, 1e-9); near(D('vap').dS, 188.8 - 70.0, 1e-9);
  near(D('nh4cl').dH, -132.5 - 167.2 + 314.43, 1e-9); near(D('nh4cl').dS, 113.4 + 56.5 - 94.6, 1e-9);
  near(D('n2o4').dH, 2 * 33.10 - 9.08, 1e-9); near(D('n2o4').dS, 2 * 240.04 - 304.38, 1e-9);
  near(D('caco3').dH, -634.92 - 393.51 + 1207.6, 1e-9); near(D('caco3').dS, 38.1 + 213.79 - 91.7, 1e-9);
  near(D('haber').dH, 2 * -45.90, 1e-9); near(D('haber').dS, 2 * 192.77 - 191.61 - 3 * 130.68, 1e-9);
  near(D('so3').dH, 2 * (-395.72 + 296.83), 1e-9); near(D('so3').dS, 2 * 256.76 - 2 * 248.2 - 205.2, 1e-9);
  near(D('h2o2').dH, 2 * (-285.83 + 187.78), 1e-9); near(D('h2o2').dS, 2 * 70.0 + 205.2 - 2 * 109.6, 1e-9);
  near(D('diamond').dH, -1.89, 1e-9); near(D('diamond').dS, 5.740 - 2.38, 1e-9);
  near(D('ozone').dH, 2 * 142.7, 1e-9); near(D('ozone').dS, 2 * 238.9 - 3 * 205.2, 1e-9);
});
test('交叉核對：ΔH° − (298.15 K)ΔS° 與各來源的 ΔfG° 算出的 ΔG°(298) 相差 < 0.25 kJ/mol', function () {
  G.ORDER.forEach(function (id) {
    const d = D(id);
    if (d.dGf == null) return;
    near(G.dG(d.dH, d.dS, 298.15), d.dGf, 0.25, id);
  });
  // N₂O₄ ⇌ 2NO₂ 在 25 °C 的 K（NIST-JANAF）約 0.148，總壓 1 bar 時解離度約 0.19（文獻常見值）
  const n = D('n2o4');
  near(G.K(n.dH, n.dS, 298.15), 0.148, 0.003);
  near(G.dissociation(G.K(n.dH, n.dS, 298.15), 1), 0.19, 0.005);
});
test('四種符號組合各有代表：(+,+) 高溫自發、(−,−) 低溫自發、(−,+) 永遠自發、(+,−) 永不自發', function () {
  const kinds = {};
  G.ORDER.forEach(function (id) { const d = D(id); kinds[id] = G.turning(d.dH, d.dS).kind; });
  ['vap', 'nh4cl', 'n2o4', 'caco3'].forEach(function (id) { assert.strictEqual(kinds[id], 'high', id); });
  ['haber', 'so3'].forEach(function (id) { assert.strictEqual(kinds[id], 'low', id); });
  ['h2o2', 'diamond'].forEach(function (id) { assert.strictEqual(kinds[id], 'always', id); });
  assert.strictEqual(kinds.ozone, 'never');
});
test('轉折溫度 T* = ΔH°/ΔS°：在 T* 時 ΔG° = 0、K = 1，兩側自發性相反', function () {
  ['vap', 'nh4cl', 'n2o4', 'caco3', 'haber', 'so3'].forEach(function (id) {
    const d = D(id), t = G.turning(d.dH, d.dS).T;
    near(G.dG(d.dH, d.dS, t), 0, 1e-9, id);
    near(G.K(d.dH, d.dS, t), 1, 1e-9, id);
    const lo = G.dG(d.dH, d.dS, t - 10), hi = G.dG(d.dH, d.dS, t + 10);
    assert.ok(lo * hi < 0, id);
    assert.strictEqual(G.verdict(hi) === 'yes', d.dH > 0, id);
  });
  near(G.turning(D('vap').dH, D('vap').dS).T, 370.45, 0.01, '水的「沸點」近似值');
  near(G.turning(D('caco3').dH, D('caco3').dS).T, 1118.5, 0.1, '石灰石');
  near(G.turning(D('haber').dH, D('haber').dS).T, 463.4, 0.1, '合成氨');
  near(G.turning(D('n2o4').dH, D('n2o4').dS).T, 325.1, 0.05, 'N2O4');
});
test('近似的誤差：水的轉折溫度 370.4 K 比 1 bar 的真實沸點 372.76 K 低約 2.3 K', function () {
  const t = G.turning(D('vap').dH, D('vap').dS).T;
  assert.ok(372.76 - t > 2 && 372.76 - t < 2.6);
});
test('ΔG° 對 T 是直線：斜率 = −ΔS°、截距（T = 0）= ΔH°；最小平方法由兩點以上取回 ΔH°、ΔS°', function () {
  const d = D('so3');
  const pts = [300, 700, 1100, 1500].map(function (T) { return { T: T, dG: G.dG(d.dH, d.dS, T) }; });
  const f = G.fitLine(pts);
  near(f.dH, d.dH, 1e-6); near(f.dS, d.dS, 1e-6);
  near((pts[1].dG - pts[0].dG) / 400 * 1000, -d.dS, 1e-9);
  assert.strictEqual(G.fitLine(pts.slice(0, 1)), null);
});
test('ΔG° = −RT ln K 與 K = e^(−ΔG°/RT) 互為反函數；ln K = −ΔH°/RT + ΔS°/R（凡特荷夫）', function () {
  [['haber', 500], ['caco3', 1200], ['n2o4', 300], ['ozone', 900]].forEach(function (c) {
    const d = D(c[0]), T = c[1], K = G.K(d.dH, d.dS, T);
    near(G.dGfromK(K, T), G.dG(d.dH, d.dS, T), 1e-6, c[0]);
    near(G.lnK(d.dH, d.dS, T), -d.dH * 1000 / (G.R * T) + d.dS / G.R, 1e-9, c[0]);
    near(G.log10K(d.dH, d.dS, T) * Math.LN10, G.lnK(d.dH, d.dS, T), 1e-9);
  });
});
test('極限：T → 0 時 ΔG° → ΔH°（焓主導）；T 很高時 TΔS° 主導；ΔS° = 0 時 ΔG° 與溫度無關', function () {
  const d = D('haber');
  near(G.dG(d.dH, d.dS, 1e-6), d.dH, 1e-6);
  assert.ok(Math.abs(G.TdS(d.dS, 1500)) > Math.abs(d.dH));
  near(G.dG(-40, 0, 100), G.dG(-40, 0, 1500), 1e-12);
  assert.strictEqual(G.turning(-40, 0).kind, 'flat');
  assert.strictEqual(G.turning(0, 10).kind, 'always');
});
test('逆反應：ΔH°、ΔS° 變號，ΔG° 也變號，K 變成倒數；兩者相加為零', function () {
  G.ORDER.forEach(function (id) {
    const d = D(id);
    [200, 600, 1300].forEach(function (T) {
      near(G.dG(d.dH, d.dS, T) + G.dG(-d.dH, -d.dS, T), 0, 1e-9);
      near(G.lnK(d.dH, d.dS, T) + G.lnK(-d.dH, -d.dS, T), 0, 1e-9);
    });
  });
});
test('冰的熔化（ΔH = 6.01 kJ/mol、ΔS = 22.0 J/(mol·K)）的轉折溫度在 0 °C 附近', function () {
  near(G.turning(6.01, 22.0).T, 273.15, 0.1);
});
test('大氣中的 CO₂（4.2 × 10^−4 bar）：石灰石在約 797 K 就開始分解，比 T* 低三百多度', function () {
  const d = D('caco3');
  let lo = 300, hi = 1500;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (G.K(d.dH, d.dS, m) < 4.2e-4) lo = m; else hi = m; }
  near(lo, 796.8, 0.5);
  assert.ok(G.turning(d.dH, d.dS).T - lo > 300);
});
test('聖母峰頂（約 0.337 bar）水的沸點估計 71 °C；N2O4 在 1 bar 下一半解離（K = 4/3）約 329.6 K', function () {
  const v = D('vap'), n = D('n2o4');
  const root = function (dd, Kt) { let lo = 150, hi = 1500; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if ((G.lnK(dd.dH, dd.dS, m) - Math.log(Kt)) * Math.sign(dd.dH) < 0) lo = m; else hi = m; } return lo; };
  near(root(v, 0.337) - 273.15, 71.1, 0.2);
  const t = root(n, 4 / 3);
  near(t, 329.59, 0.05);
  near(G.dissociation(G.K(n.dH, n.dS, t), 1), 0.5, 1e-6);
});
test('顯示用科學記號：由 log10K 算尾數與次方（9.996 × 10^5 進位成 1.00 × 10^6），極大極小也不溢位', function () {
  let p = G.sciFromLog(Math.log10(9.996e5), 3); assert.deepStrictEqual(p, { m: '1.00', e: 6 });
  p = G.sciFromLog(-156.4, 3); assert.strictEqual(p.e, -157); near(+p.m, Math.pow(10, 0.6), 0.006);
  p = G.sciFromLog(Math.log10(0.0313), 3); assert.deepStrictEqual(p, { m: '3.13', e: -2 });
  near(G.lnKshown(Math.log10(2.718), 3), Math.log(2.72), 1e-12);
});
test('未知反應：ΔH° 在 ±20–200 kJ/mol、ΔS° 在 ±40–250 J/(mol·K)，四種符號都出現；同號時 T* 在 250–1350 K', function () {
  let a = 7; const r = function () { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const cnt = {};
  for (let k = 0; k < 400; k++) {
    const m = G.makeMystery(r);
    assert.ok(Math.abs(m.dH) >= 20 && Math.abs(m.dH) <= 200, m.dH);
    assert.ok(Math.abs(m.dS) >= 40 && Math.abs(m.dS) <= 250, m.dS);
    const q = G.quadrant(m.dH, m.dS); cnt[q] = (cnt[q] || 0) + 1;
    const t = G.turning(m.dH, m.dS);
    if (t.T != null) assert.ok(t.T >= 250 && t.T <= 1350, t.T);
  }
  ['++', '--', '-+', '+-'].forEach(function (q) { assert.ok(cnt[q] > 50, q + ' ' + cnt[q]); });
});
test('由畫面上 3 位有效數字的 K、兩個溫度，就能把未知反應的 ΔH°、ΔS° 算到 1% 以內', function () {
  let a = 11; const r = function () { a = (a * 16807) % 2147483647; return a / 2147483647; };
  let worst = 0;
  for (let k = 0; k < 300; k++) {
    const m = G.makeMystery(r);
    const pts = [300, 1300].map(function (T) { return { T: T, dG: -G.R * T * G.lnKshown(G.log10K(m.dH, m.dS, T), 3) / 1000 }; });
    const f = G.fitLine(pts);
    worst = Math.max(worst, Math.abs(f.dH / m.dH - 1), Math.abs(f.dS / m.dS - 1));
  }
  assert.ok(worst < 0.01, '最差 ' + worst);
});

console.log(passed + ' 項通過');
