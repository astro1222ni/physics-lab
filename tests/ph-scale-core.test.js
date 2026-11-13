// 以 Node 執行：node tests/ph-scale-core.test.js
'use strict';
const assert = require('assert');
const P = require('../js/ph-scale-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`);
}
const S = (sp, logC, T, Kx) => P.solution(sp, logC, T == null ? 25 : T, Kx);

// ---------------- 水的離子積 ----------------
test('Kw：25 °C 取課本的 1.00 × 10^-14（pKw = 14.000）', function () {
  near(P.pKw(25), 14, 1e-9);
  near(P.Kw(25) / 1e-14, 1, 1e-8);
});
test('Kw：50 °C、100 °C 與文獻值（Marshall 與 Franck 1981：13.275、12.265）相差 0.02 以內', function () {
  near(P.pKw(50), 13.275, 0.02);
  near(P.pKw(100), 12.265, 0.02);
});
test('Kw 隨溫度升高而變大（水的解離吸熱），pKw 單調遞減', function () {
  for (let T = 25; T < 100; T += 0.5) assert.ok(P.pKw(T + 0.5) < P.pKw(T), 'T = ' + T);
});
test('純水在任何溫度都是中性：pH = pOH = pKw / 2；100 °C 時 pH 約 6.13', function () {
  for (let T = 25; T <= 100; T += 5) {
    const r = S('water', 0, T);
    near(r.pH, P.pKw(T) / 2, 1e-10, 'T = ' + T);
    near(r.h, r.oh, 1e-12 * r.h);
  }
  near(S('water', 0, 100).pH, 6.13, 0.01);
});

// ---------------- 強酸、強鹼 ----------------
test('強酸：0.010 M HCl 的 pH = 2.000，pOH = 12.000，解離百分率 100%', function () {
  const r = S('HCl', -2);
  near(r.pH, 2, 1e-9); near(r.pOH, 12, 1e-9); assert.strictEqual(r.alpha, 1);
});
test('強酸稀釋 10 倍 pH 加 1（濃度 ≥ 10^-5 M 時誤差小於 0.001）', function () {
  for (let lc = 0; lc >= -4; lc -= 0.5) near(S('HCl', lc - 1).pH - S('HCl', lc).pH, 1, 1e-3, 'log C = ' + lc);
});
test('極稀的強酸要算水的解離：10^-8 M HCl 的 pH = 6.978（解析解），不是 8', function () {
  const C = 1e-8, kw = 1e-14, h = (C + Math.sqrt(C * C + 4 * kw)) / 2;
  near(S('HCl', -8).pH, -Math.log10(h), 1e-9);
  near(S('HCl', -8).pH, 6.978, 0.001);
});
test('強鹼：0.010 M NaOH 在 25 °C 的 pH = 12.000，在 100 °C 是 pKw − 2', function () {
  near(S('NaOH', -2).pH, 12, 1e-9);
  near(S('NaOH', -2, 100).pH, P.pKw(100) - 2, 1e-7);
});
test('pH + pOH = pKw（各種物質、各種溫度）', function () {
  P.ORDER.forEach(function (sp) {
    [25, 60, 100].forEach(function (T) {
      [-7, -3, 0].forEach(function (lc) { const r = S(sp, lc, T, 1e-4); near(r.pH + r.pOH, P.pKw(T), 1e-9, sp); });
    });
  });
});

// ---------------- 弱酸、弱鹼 ----------------
test('弱酸：0.10 M 醋酸的 pH 與一元二次方程式的解相同（2.875）', function () {
  const Ka = 1.8e-5, C = 0.1, h = (-Ka + Math.sqrt(Ka * Ka + 4 * Ka * C)) / 2;
  near(S('CH3COOH', -1).pH, -Math.log10(h), 1e-6);
  near(S('CH3COOH', -1).pH, 2.875, 0.001);
});
test('弱酸含水的解離：[H3O+] 滿足三次方程式 h³ + Ka h² − (Kw + Ka C) h − Ka Kw = 0', function () {
  [['HCN', -5], ['HClO', -6.3], ['CH3COOH', -7], ['HF', -2]].forEach(function (t) {
    const r = S(t[0], t[1]), h = r.h, Ka = r.K, C = r.C, kw = r.Kw;
    const res = h * h * h + Ka * h * h - (kw + Ka * C) * h - Ka * kw;
    assert.ok(Math.abs(res) <= 1e-9 * (h * h * h + (kw + Ka * C) * h), t[0] + ' 殘差 ' + res);
  });
});
test('弱鹼：0.10 M 氨水的 pH = 14 − 2.875 = 11.125；醋酸與氨水同濃度時 pH 相加 = 14', function () {
  near(S('NH3', -1).pH, 11.125, 0.001);
  [-1, -3, -5, -7].forEach(function (lc) { near(S('CH3COOH', lc).pH + S('NH3', lc).pH, 14, 1e-8, 'log C = ' + lc); });
});
test('電荷平衡（電中性）的相對殘差小於 1e-10', function () {
  P.ORDER.forEach(function (sp) {
    for (let lc = -8; lc <= 0; lc += 0.25) [25, 100].forEach(function (T) { assert.ok(P.balance(S(sp, lc, T, 3e-4)) < 1e-10, sp + ' ' + lc); });
  });
});
test('物質守恆：[HA] + [A-] = C、[B] + [BH+] = C', function () {
  const a = S('HF', -3), b = S('NH3', -3);
  near(a.HA + a.A, a.C, 1e-15); near(b.B + b.BH, b.C, 1e-15);
});
test('同濃度時酸越強 pH 越小：HCl < HF < CH3COOH < HClO < HCN', function () {
  [-1, -3].forEach(function (lc) {
    const ph = ['HCl', 'HF', 'CH3COOH', 'HClO', 'HCN'].map(function (sp) { return S(sp, lc).pH; });
    for (let i = 1; i < ph.length; i++) assert.ok(ph[i] > ph[i - 1], 'log C = ' + lc);
  });
});
test('弱酸稀釋 10 倍（解離很少時）pH 約加 0.5；解離百分率約變成 √10 倍（奧士華稀釋定律）', function () {
  const a = S('CH3COOH', -1), b = S('CH3COOH', -2);
  near(b.pH - a.pH, 0.5, 0.01);
  near(b.alpha / a.alpha, Math.sqrt(10), 0.05);
  const c = S('HCN', -1), d = S('HCN', -3);
  near(d.alpha / c.alpha, 10, 0.1); // HCN 10^-3 M 時水的解離已占約 1.6%，比值 9.92
});
test('解離百分率 α 小時 α ≈ √(Ka/C)', function () {
  const r = S('CH3COOH', -1);
  near(r.alpha, Math.sqrt(1.8e-5 / 0.1), 0.0003);
});
test('解離一半時 pH = pKa：HF 在 C = 2Ka 時 α = 0.5（水的影響可忽略）', function () {
  const r = S('HF', Math.log10(2 * 6.3e-4));
  near(r.alpha, 0.5, 1e-4); near(r.pH, r.pK, 2e-4);
});
test('無限稀釋：HF 幾乎完全解離；HCN 的 α 只能接近 Ka/(Ka + √Kw) ≈ 0.62%', function () {
  assert.ok(S('HF', -8).alpha > 0.998);
  const r = S('HCN', -8);
  near(r.alpha, r.alphaLim, 0.0001);
  near(r.alphaLim, 6.2e-10 / (6.2e-10 + 1e-7), 1e-12);
  assert.ok(S('HClO', -8).alpha < S('HClO', -8).alphaLim + 1e-12);
});
test('近似式 √(KaC) 在很稀時會失準：HCN 10^-5 M 用近似式算出 pH > 7（說成鹼性），正確值仍小於 7', function () {
  const r = S('HCN', -5);
  assert.ok(r.pHapprox > 7); assert.ok(r.pH < 7);
  const q = S('CH3COOH', -1);
  near(q.pHapprox, q.pH, 0.005);
});
test('酸再稀也不會變鹼性、鹼再稀也不會變酸性（相對於中性 pH = pKw/2）', function () {
  [25, 60, 100].forEach(function (T) {
    for (let lc = -8; lc <= 0; lc += 0.1) {
      ['HCl', 'HF', 'CH3COOH', 'HClO', 'HCN'].forEach(function (sp) { assert.ok(S(sp, lc, T).pH < P.pKw(T) / 2, sp); });
      ['NaOH', 'NH3'].forEach(function (sp) { assert.ok(S(sp, lc, T).pH > P.pKw(T) / 2, sp); });
    }
  });
});
test('加熱的稀鹼：100 °C 時 3 × 10^-6 M NaOH 是鹼性，pH 卻小於 7', function () {
  const r = S('NaOH', Math.log10(3e-6), 100);
  assert.ok(r.oh > 10 * r.h); assert.ok(r.pH < 7);
});
test('所有濃度（10^-8 ～ 1 M）與溫度（25–100 °C）的 pH 都在 0–14 之間', function () {
  P.ORDER.forEach(function (sp) {
    for (let lc = -8; lc <= 0; lc += 0.05) [25, 40, 70, 100].forEach(function (T) {
      const r = S(sp, lc, T, Math.pow(10, -2.5));
      assert.ok(r.pH >= -1e-9 && r.pH <= 14 + 1e-9, sp + ' ' + lc + ' ' + T + '：' + r.pH);
      assert.ok(r.pHapprox >= -1e-9 && r.pHapprox <= 14 + 1e-9, sp + ' 近似 ' + r.pHapprox);
    });
  });
});
test('pH 隨濃度單調：酸越稀 pH 越大、鹼越稀 pH 越小', function () {
  ['HCl', 'HF', 'HCN', 'HX'].forEach(function (sp) { for (let lc = -8; lc < 0; lc += 0.1) assert.ok(S(sp, lc + 0.1, 25, 1e-4).pH < S(sp, lc, 25, 1e-4).pH, sp); });
  ['NaOH', 'NH3'].forEach(function (sp) { for (let lc = -8; lc < 0; lc += 0.1) assert.ok(S(sp, lc + 0.1).pH > S(sp, lc).pH, sp); });
});
test('由 pH 反推 Ka：用 [H3O+] 與 C 算回原本的 Ka（相對誤差 < 1e-9）', function () {
  [['HF', -2], ['CH3COOH', -4], ['HClO', -2], ['HX', -3]].forEach(function (t) {
    const r = S(t[0], t[1], 25, 2.2e-4);
    near(P.kaFrom(r.h, r.C, r.Kw) / r.K, 1, 1e-9, t[0]);
  });
});
test('未知酸：pKa 在 2.50–6.00 之間，Ka = 10^-pKa；缺 Ka 時報錯', function () {
  let s = 7;
  const rng = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 200; i++) { const u = P.newUnknown(rng); assert.ok(u.pKa >= 2.5 && u.pKa <= 6); near(-Math.log10(u.Ka), u.pKa, 1e-12); }
  assert.throws(function () { S('HX', -2, 25); });
});
test('每個 H3O+ 配多少個水分子：25 °C 純水約 5.5 × 10^8 個', function () {
  near(S('water', 0).waterPerH3O / 5.535e8, 1, 0.01);
});

console.log(process.exitCode ? '有測試失敗' : '全部 ' + passed + ' 項通過');
