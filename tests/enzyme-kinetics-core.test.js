// 以 Node 執行：node tests/enzyme-kinetics-core.test.js
'use strict';
const assert = require('assert');
const E = require('../js/enzyme-kinetics-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b} ± ${tol}，得到 ${a}`);
}

console.log('enzyme-kinetics-core');

test('pH 鐘形：最適 pH = (pK1 + pK2)/2 時 = 1、左右對稱；三種酵素的最適 pH 是 2、6.8、8', () => {
  close(E.optPH('pepsin'), 2, 1e-12); close(E.optPH('amylase'), 6.8, 1e-12); close(E.optPH('trypsin'), 8, 1e-12);
  for (const k of ['pepsin', 'amylase', 'trypsin']) {
    const o = E.optPH(k);
    close(E.phFactor(k, o), 1, 1e-12);
    close(E.phFactor(k, o - 1.3), E.phFactor(k, o + 1.3), 1e-12, '對稱');
    assert.ok(E.phFactor(k, o + 0.2) < 1 && E.phFactor(k, o - 0.2) < 1, '最適 pH 是最大值');
  }
  // 遠離兩個 pK：每差一個 pH 單位，活性約掉為十分之一
  const r = E.phFactor('trypsin', 12) / E.phFactor('trypsin', 11);
  close(r, 0.1, 0.005);
});

test('Arrhenius：37 °C = 1；Ea = 50 kJ/mol 時 Q10 約 2（20 → 30 °C）', () => {
  close(E.arrhenius('amylase', 37), 1, 1e-12);
  const q = E.q10('amylase', 20);
  assert.ok(q > 1.9 && q < 2.05, 'Q10 = ' + q);
  close(q, Math.exp(50e3 / 8.314 * (1 / 293.15 - 1 / 303.15)), 1e-12);
});

test('平衡模型：Keq(Teq) = 1，活性型占一半；溫度越高失活越多', () => {
  const e = E.ENZYMES.amylase, Teq = e.Teq - E.K0;
  close(E.keq('amylase', Teq), 1, 1e-9);
  close(E.activeFrac('amylase', Teq), 0.5, 1e-9);
  assert.ok(E.activeFrac('amylase', 20) > 0.999);
  assert.ok(E.lambda('amylase', 60) > 100 * E.lambda('amylase', 37), '高溫永久變性快得多');
});

test('累積量：沒有變性時 = k·t；有變性時上限 k/λ；解析式與數值積分一致', () => {
  const e = 'amylase', T = 55, pH = 6.8, t = 900;
  const r = E.rate0(e, T, pH), L = E.lambda(e, T);
  let s = 0; const n = 20000, dt = t / n;
  for (let i = 0; i < n; i++) s += r * Math.exp(-L * (i + 0.5) * dt) * dt;
  close(E.integ(e, T, pH, t), s, 1e-8 * s + 1e-12);
  assert.ok(E.integ(e, T, pH, 1e7) <= r / L * (1 + 1e-9));
  // 低溫：近似線性
  close(E.integ(e, 5, pH, 60) / (E.rate0(e, 5, pH) * 60), 1, 1e-4);
});

test('反應完成時間：剩下 10% 時 remaining = 0.1；高溫或錯的 pH 永遠做不完', () => {
  for (const [k, T, pH] of [['amylase', 37, 6.8], ['pepsin', 30, 2], ['trypsin', 45, 8.5], ['amylase', 50, 6.8]]) {
    const te = E.endTime(k, T, pH);
    assert.ok(isFinite(te), k + ' ' + T + ' 應該做得完');
    close(E.remaining(k, T, pH, te), 0.1, 1e-9);
  }
  close(E.endTime('amylase', 37, 6.8), 177, 10, '唾液澱粉酶 37 °C 約 3 分鐘（示意的校準）');
  assert.strictEqual(E.endTime('amylase', 70, 6.8), Infinity);
  assert.strictEqual(E.endTime('pepsin', 37, 7), Infinity, '胃蛋白酶到中性就不行');
  assert.strictEqual(E.endTime('trypsin', 37, 2), Infinity, '胰蛋白酶在胃酸裡不行');
});

test('最適溫度：測量時間越長，表觀最適溫度越低（Daniel 與 Danson 的觀察）', () => {
  for (const k of ['amylase', 'pepsin', 'trypsin']) {
    const a = E.scanT(k, E.optPH(k), 60).Topt, b = E.scanT(k, E.optPH(k), 1800).Topt;
    assert.ok(a > b + 3, k + '：1 分鐘 ' + a.toFixed(1) + '，30 分鐘 ' + b.toFixed(1));
    assert.ok(a > 35 && a < 55, '在體溫附近偏高一點');
  }
  // 掃描的最大值確實是附近的最大
  const s = E.scanT('amylase', 6.8, 600);
  assert.ok(E.assay('amylase', s.Topt, 6.8, 600) >= E.assay('amylase', s.Topt + 0.3, 6.8, 600));
  assert.ok(E.assay('amylase', s.Topt, 6.8, 600) >= E.assay('amylase', s.Topt - 0.3, 6.8, 600));
});

test('Michaelis–Menten：[S] = Km 時 v = Vmax/2；[S] → ∞ 趨近 Vmax；[S] ≪ Km 時近似線性', () => {
  const p = { Vmax: 80, Km: 2, type: 'none', I: 0, Ki: 1 };
  close(E.rate(2, p), 40, 1e-12);
  close(E.rate(1e6, p), 80, 1e-3);
  close(E.rate(0.001, p) / 0.001, 80 / 2, 0.05);
});

test('抑制劑：競爭型只改 Km、非競爭型只改 Vmax、反競爭型兩個一起除', () => {
  const base = { Vmax: 60, Km: 1.5, I: 2, Ki: 1 };
  let a = E.apparent(Object.assign({ type: 'competitive' }, base));
  close(a.Vmax, 60, 1e-12); close(a.Km, 4.5, 1e-12);
  a = E.apparent(Object.assign({ type: 'noncompetitive' }, base));
  close(a.Vmax, 20, 1e-12); close(a.Km, 1.5, 1e-12);
  a = E.apparent(Object.assign({ type: 'uncompetitive' }, base));
  close(a.Vmax, 20, 1e-12); close(a.Km, 0.5, 1e-12);
  // 競爭型：受質很多時速度回來
  assert.ok(E.rate(1e4, Object.assign({ type: 'competitive' }, base)) > 59.9);
  // [I] = 0 時都一樣
  for (const t of E.TYPES) close(E.rate(1, Object.assign({}, base, { type: t, I: 0 })), 60 / 2.5, 1e-12);
});

test('Lineweaver–Burk：沒有誤差的點擬合回原本的 Km、Vmax；反競爭型兩條線平行', () => {
  const p = { Vmax: 45, Km: 3, type: 'none', I: 0, Ki: 1 };
  const S = [0.5, 1, 2, 5, 10];
  const f = E.lbFit(S.map(s => ({ S: s, v: E.rate(s, p) })));
  close(f.Vmax, 45, 1e-9); close(f.Km, 3, 1e-9); close(f.r2, 1, 1e-12);
  const pu = Object.assign({}, p, { type: 'uncompetitive', I: 1, Ki: 0.5 });
  const fu = E.lbFit(S.map(s => ({ S: s, v: E.rate(s, pu) })));
  close(fu.slope, f.slope, 1e-9, '斜率 Km/Vmax 不變');
  close(fu.icpt, 3 / 45, 1e-9, '截距 1/Vmax 變成 3 倍');
  assert.strictEqual(E.lbFit([{ S: 1, v: 1 }]), null);
});

test('判斷抑制劑：三種都認得出來', () => {
  const p0 = { Vmax: 50, Km: 2, type: 'none', I: 0, Ki: 1 };
  const S = [0.5, 1, 2, 4, 8, 16];
  const f0 = E.lbFit(S.map(s => ({ S: s, v: E.rate(s, p0) })));
  for (const t of ['competitive', 'noncompetitive', 'uncompetitive']) {
    const p1 = Object.assign({}, p0, { type: t, I: 2 });
    const f1 = E.lbFit(S.map(s => ({ S: s, v: E.rate(s, p1) })));
    assert.strictEqual(E.classify(f0, f1), t);
  }
});

test('亂數：同一個種子結果相同；神秘酵素與抑制劑的範圍', () => {
  const a = E.rng(5), b = E.rng(5);
  for (let i = 0; i < 5; i++) assert.strictEqual(a(), b());
  for (let s = 1; s < 200; s++) {
    const q = E.sample(s), m = E.mystery(s);
    assert.ok(q.Km >= 0.5 && q.Km <= 5 && q.Vmax >= 20 && q.Vmax <= 100);
    assert.ok(['competitive', 'noncompetitive', 'uncompetitive'].includes(m.type) && m.Ki >= 0.3 && m.Ki <= 3);
  }
  // 誤差 0 時量到真值
  close(E.measure(2, { Vmax: 50, Km: 2, type: 'none', I: 0, Ki: 1 }, 0, E.rng(1)), 25, 1e-12);
  // 誤差的標準差大約是設定值
  const r = E.rng(9); let ss = 0; const n = 4000;
  for (let i = 0; i < n; i++) { const g = E.gauss(r); ss += g * g; }
  close(Math.sqrt(ss / n), 1, 0.05);
});

console.log(passed + ' 項通過');
