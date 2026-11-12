// 以 Node 執行：node tests/reaction-rate-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/reaction-rate-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`);
}
function rel(a, b, tol, msg) { near(a / b, 1, tol, (msg || '') + `（${a} 對 ${b}）`); }

// ---------------- 單位與常數 ----------------
test('單位：1 g/mol × (nm/ps)² = 1 kJ/mol；R、NA 為定義值', function () {
  // 1 nm/ps = 1000 m/s；(1000 m/s)² × 0.001 kg/mol = 1000 J/mol
  near(1e-3 * 1000 * 1000 / 1000, 1, 1e-12);
  assert.strictEqual(K.NA, 6.02214076e23);
  near(K.R * 1000, 8.314462618, 1e-9);
});
test('濃度：100 個分子在 1728 nm³ 中 = 0.0961 M；速率常數 1 nm³/ps = 6.022 × 10^11 L/(mol·s)', function () {
  assert.strictEqual(K.V, 1728);
  near(K.molarity(100), 0.09609, 5e-5);
  rel(K.toLmolS(1), 6.02214076e11, 1e-12);
  rel(K.rateToMs(1), K.molarity(1) * 1e12, 1e-12);
});
test('速率：300 K 時方均根速率 432 m/s、平均相對速率 564 m/s（M = 40 g/mol）', function () {
  near(K.rmsSpeed(300), Math.sqrt(3 * 8.314462618 * 300 / 0.040) / 1000, 1e-9);
  near(K.rmsSpeed(300), 0.4325, 1e-3);
  near(K.meanRelSpeed(300), 0.5636, 1e-3);
});

// ---------------- 數學工具 ----------------
test('erfc：與已知值相差小於 2 × 10^-7', function () {
  [[0, 1], [0.5, 0.4795001222], [1, 0.1572992071], [2, 0.004677734981], [-1, 1.8427007929]].forEach(function (p) {
    near(K.erfc(p[0]), p[1], 2e-7 * Math.max(1, p[1]), 'erfc(' + p[0] + ')');
  });
});
test('馬克士威–波茲曼動能分布：機率總和 = 1、平均動能 = (3/2)RT、Q(3/2, x) 與數值積分一致', function () {
  [250, 500, 1000].forEach(function (T) {
    let s = 0, m = 0;
    const dE = 0.002, Emax = 60 * K.RT(T);
    for (let E = dE / 2; E < Emax; E += dE) { const f = K.keDensity(E, T); s += f * dE; m += E * f * dE; }
    near(s, 1, 2e-4, 'T = ' + T + ' 總和');
    rel(m, 1.5 * K.RT(T), 1e-3, '平均動能');
    [5, 10, 20].forEach(function (Ea) {
      let tail = 0;
      for (let E = Ea + dE / 2; E < Emax; E += dE) tail += K.keDensity(E, T) * dE;
      near(K.keFracAbove(Ea, T), tail, 2e-4, 'Ea = ' + Ea);
    });
  });
});
test('碰撞能量分布：∫ e^(−E/RT)/RT dE 從 Ea 到 ∞ = e^(−Ea/RT)', function () {
  const T = 400, Ea = 10, dE = 0.001;
  let tail = 0;
  for (let E = Ea + dE / 2; E < 200; E += dE) tail += K.collisionEnergyDensity(E, T) * dE;
  near(tail, K.fracAbove(Ea, T), 1e-6);
  near(K.fracAbove(Ea, T), Math.exp(-10 / (K.R * 400)), 1e-15);
  assert.strictEqual(K.fracAbove(0, 300), 1);
});

// ---------------- 活化能、催化劑、平衡常數 ----------------
test('催化劑：放熱反應的活化能變成 40%；吸熱反應的活化能不會低於 ΔH；ΔH 不變', function () {
  near(K.effectiveEa(10, -20, true), 4, 1e-12);
  near(K.effectiveEa(10, -20, false), 10, 1e-12);
  near(K.effectiveEa(20, 10, true), 10 + 0.4 * 10, 1e-12);
  near(K.effectiveEa(5, 10, false), 10, 1e-12, '吸熱：活化能至少等於 ΔH');
  near(K.reverseEa(K.effectiveEa(10, -20, true), -20), 24, 1e-12, '逆反應 = 4 + 20');
  near(K.reverseEa(K.effectiveEa(20, 10, false), 10), 10, 1e-12);
});
test('平衡常數 K = k正/k逆 = e^(−ΔH/RT)（有沒有催化劑、方向因子都一樣）', function () {
  [[300, -20], [600, -5], [800, 8], [1000, 15]].forEach(function (c) {
    [false, true].forEach(function (cat) {
      [false, true].forEach(function (steric) {
        const o = { T: c[0], Ea: 20, dH: c[1], cat: cat, steric: steric, Ntot: 200 };
        rel(K.kForward(o) / K.kReverse(o), K.Keq(c[1], c[0]), 1e-12);
      });
    });
  });
});
test('方向因子 p = (1 − cos 60°)/2 = 0.25', function () {
  near(K.stericFactor(true), 0.25, 1e-15);
  assert.strictEqual(K.stericFactor(false), 1);
});
test('稠密修正 χ：稀薄時 → 1；200 個分子（體積分率 1.3%）約 1.034', function () {
  near(K.contactFactor(0), 1, 1e-15);
  near(K.packing(200), 200 * Math.PI * 0.216 / 6 / 1728, 1e-12);
  near(K.contactFactor(K.packing(200)), 1.034, 2e-3);
});
test('器壁修正 f：與蒙地卡羅（立方體內兩點相距 D 的機會）一致，L = 12 nm、D = 0.6 nm 時 0.927', function () {
  near(K.wallFactor(), 0.9266, 2e-4);
  // 蒙地卡羅：隨機點加上長度 D、方向隨機的位移，仍在立方體內的比例
  const r = K.rng(5);
  let inside = 0;
  const N = 400000;
  for (let k = 0; k < N; k++) {
    const zz = 2 * r() - 1, ph = 2 * Math.PI * r(), q = Math.sqrt(1 - zz * zz);
    const x = r() * K.L + K.D * q * Math.cos(ph), y = r() * K.L + K.D * q * Math.sin(ph), z = r() * K.L + K.D * zz;
    if (x >= 0 && x <= K.L && y >= 0 && y <= K.L && z >= 0 && z <= K.L) inside++;
  }
  near(inside / N, K.wallFactor(), 4 * Math.sqrt(0.07 * 0.93 / N));
});

// ---------------- 阿瑞尼斯圖 ----------------
test('直線擬合：完美資料得到原本的斜率與截距、r² = 1', function () {
  const f = K.fitLine([{ x: 1, y: 3 }, { x: 2, y: 5 }, { x: 4, y: 9 }]);
  near(f.b, 2, 1e-12); near(f.a, 1, 1e-12); near(f.r2, 1, 1e-12);
});
test('阿瑞尼斯圖：k = A e^(−Ea/RT) 的資料求得 Ea；碰撞學說的圖上活化能 = E0 + R·ln(T2/T1)/(2(1/T1 − 1/T2))', function () {
  const rows = [300, 400, 600, 900].map(function (T) { return { T: T, k: 5e10 * Math.exp(-15 / K.RT(T)), n: 100 }; });
  near(K.arrhenius(rows).Ea, 15, 1e-9);
  const two = [{ T: 300, n: 1 }, { T: 600, n: 1 }];
  near(K.apparentEa(15, two), 15 + K.R * Math.log(2) / (2 * (1 / 300 - 1 / 600)), 1e-9);
  // 用核心的理論速率常數（含 √T）擬合，要等於 apparentEa
  const th = [300, 450, 700, 1000].map(function (T) { return { T: T, k: K.kForward({ T: T, Ea: 12, dH: -20, Ntot: 200 }), n: 50 }; });
  near(K.arrhenius(th).Ea, K.apparentEa(12, th), 1e-9);
  assert.ok(K.arrhenius(th).Ea > 12, '圖上的活化能比門檻能量大');
});
test('未知反應的活化能在 8.0–20.0 kJ/mol', function () {
  const r = K.rng(7);
  for (let i = 0; i < 500; i++) { const e = K.mysteryEa(r); assert.ok(e >= 8 && e <= 20, e); }
});

// ---------------- 碰撞的解法 ----------------
test('碰撞：動量守恆；彈性碰撞動能守恆；反應碰撞的動能改變 = −ΔH', function () {
  const r = K.rng(11);
  for (let k = 0; k < 200; k++) {
    const v1 = [K.gauss(r), K.gauss(r), K.gauss(r)], v2 = [K.gauss(r), K.gauss(r), K.gauss(r)];
    let n = [K.gauss(r), K.gauss(r), K.gauss(r)];
    const nl = Math.hypot(n[0], n[1], n[2]); n = n.map(function (x) { return x / nl; });
    let g = (v1[0] - v2[0]) * n[0] + (v1[1] - v2[1]) * n[1] + (v1[2] - v2[2]) * n[2];
    if (g <= 0) { n = n.map(function (x) { return -x; }); g = -g; }
    const p0 = [0, 1, 2].map(function (i) { return v1[i] + v2[i]; });
    const ke0 = 0.5 * K.M * (v1.concat(v2).reduce(function (a, x) { return a + x * x; }, 0));
    const dH = (r() - 0.5) * 2 * K.M * g * g / 4;      // |ΔH| 不超過連心線動能
    const gOut = Math.sqrt(g * g - 4 * dH / K.M);
    K.resolve(v1, v2, n, g, gOut);
    [0, 1, 2].forEach(function (i) { near(v1[i] + v2[i], p0[i], 1e-12, '動量'); });
    const ke1 = 0.5 * K.M * (v1.concat(v2).reduce(function (a, x) { return a + x * x; }, 0));
    near(ke1 - ke0, -dH, 1e-9 * Math.max(1, ke0), '動能');
    const gAfter = (v1[0] - v2[0]) * n[0] + (v1[1] - v2[1]) * n[1] + (v1[2] - v2[2]) * n[2];
    near(gAfter, -gOut, 1e-12, '碰撞後沿連心線分開');
  }
});

// ---------------- 模擬：守恆與統計 ----------------
test('鏡面器壁：沒有反應時總動能守恆；有反應時「動能 + 化學能」守恆、粒子數守恆', function () {
  const s = K.createSim({ T: 600, Ea: 3, dH: -6, nA: 60, nB: 60, seed: 3, walls: 'specular', heat: 'gas' });
  const E0 = K.totalKE(s);
  K.advance(s, 400);
  const st = s.stats;
  assert.ok(st.fwd > 10, '要有反應（' + st.fwd + '）');
  // 放熱：每次正反應動能增加 6，逆反應減少 6
  rel(K.totalKE(s), E0 + 6 * (st.fwd - st.rev), 1e-9, '動能＋化學能');
  assert.strictEqual(s.count[0] + s.count[2], 60);
  assert.strictEqual(s.count[1] + s.count[3], 60);
  assert.strictEqual(s.count[2], s.count[3]);
  assert.strictEqual(s.count[2], st.fwd - st.rev);
  for (let i = 0; i < s.N; i++) {
    assert.ok(s.x[i] >= 0 && s.x[i] <= K.L && s.y[i] >= 0 && s.y[i] <= K.L && s.z[i] >= 0 && s.z[i] <= K.L, '分子跑出容器');
  }
});
test('恆溫器壁：氣體溫度維持在設定值（±2%）', function () {
  [300, 800].forEach(function (T) {
    const s = K.createSim({ T: T, Ea: 40, dH: 0, nA: 100, nB: 100, seed: 5 });
    K.advance(s, 50);
    let sum = 0, n = 0;
    for (let k = 0; k < 200; k++) { K.advance(s, 2); sum += K.kineticTemp(s); n++; }
    rel(sum / n, T, 0.02, 'T = ' + T);
  });
});
test('碰撞頻率與能量：A–B 碰撞速率 = χπD²⟨v_rel⟩[A][B]；能量 ≥ E0 的比例 = e^(−E0/RT)（沿連心線）', function () {
  const T = 300;
  const s = K.createSim({ T: T, Ea: 1e9, dH: 0, nA: 100, nB: 100, seed: 21, react: false });
  K.advance(s, 2200);
  const st = s.stats;
  assert.ok(st.collAB > 6000, '碰撞次數 ' + st.collAB);
  const z = st.collAB * K.V / st.intAB;
  rel(z, K.collisionK(T, 200), 0.05, '碰撞速率常數');
  const kt = K.RT(T);
  [0.5, 1, 2, 3].forEach(function (m) {
    let above = 0;
    const b0 = Math.ceil(m * kt / K.HIST_DE);
    for (let b = b0; b < K.HIST_N; b++) above += st.hist[b];
    above += st.histOver;
    const Ecut = b0 * K.HIST_DE;
    const p = Math.exp(-Ecut / kt), sigma = Math.sqrt(p * (1 - p) / st.collAB);
    near(above / st.collAB, p, 4 * sigma + 1e-3, 'E ≥ ' + Ecut.toFixed(1) + ' kJ/mol');
  });
});
test('速率常數：模擬量到的 k 與理論值一致（4 個標準差以內）；方向因子把 k 變成 1/4', function () {
  [[400, 5, false], [700, 12, false], [600, 3, true]].forEach(function (c, idx) {
    const s = K.createSim({ T: c[0], Ea: c[1], dH: -30, nA: 150, nB: 150, steric: c[2], seed: 100 + idx });
    K.advance(s, c[2] ? 1400 : 900);
    const m = K.measure(s), th = K.theory({ T: c[0], Ea: c[1], dH: -30, steric: c[2], nA: 150, nB: 150 });
    assert.ok(m.fwd > 100, '反應次數 ' + m.fwd + '（第 ' + (idx + 1) + ' 組）');
    near(m.kF / th.kF, 1, 4 * m.relErrF + 0.03, 'T = ' + c[0] + '、Ea = ' + c[1] + (c[2] ? '、方向因子' : ''));
  });
});
test('動態平衡：正、逆反應的速率常數比 = K = e^(−ΔH/RT)；平衡時 N_C N_D/(N_A N_B) 接近 K', function () {
  const T = 800, dH = -3;
  const s = K.createSim({ T: T, Ea: 3, dH: dH, nA: 120, nB: 120, seed: 77 });
  K.advance(s, 300);
  K.resetStats(s);
  let ratio = 0, n = 0;
  for (let k = 0; k < 300; k++) {
    K.advance(s, 2);
    const c = s.count;
    ratio += (c[2] * c[3]) / Math.max(1, c[0] * c[1]); n++;
  }
  const m = K.measure(s), Kth = K.Keq(dH, T);
  assert.ok(m.fwd > 300 && m.rev > 300, '正逆反應次數 ' + m.fwd + '、' + m.rev);
  near((m.kF / m.kR) / Kth, 1, 4 * Math.sqrt(1 / m.fwd + 1 / m.rev) + 0.02, 'k正/k逆');
  near(ratio / n / Kth, 1, 0.15, '平衡組成');
  near(m.fwd / m.rev, 1, 4 * Math.sqrt(1 / m.fwd + 1 / m.rev), '平衡時正逆反應次數相等');
});
test('決定性：同一個種子得到完全相同的結果', function () {
  const a = K.createSim({ T: 500, Ea: 6, dH: -10, nA: 80, nB: 50, seed: 9 });
  const b = K.createSim({ T: 500, Ea: 6, dH: -10, nA: 80, nB: 50, seed: 9 });
  K.advance(a, 120); K.advance(b, 120);
  assert.deepStrictEqual(a.count, b.count);
  assert.strictEqual(a.stats.collAB, b.stats.collAB);
  assert.strictEqual(a.x[17], b.x[17]);
});
test('初速率與半生期：轉化 10% 時記下初速率；限量試劑反應一半時記下半生期', function () {
  const s = K.createSim({ T: 600, Ea: 4, dH: -30, nA: 100, nB: 100, seed: 4 });
  K.advance(s, 2000);
  const m = K.measure(s);
  assert.ok(s.stats.t10 != null && s.stats.tHalf != null && s.stats.tHalf > s.stats.t10);
  // 二級反應、等濃度：半生期 = 1/(k[A]0)，k 用模擬量到的值（容許 15%）
  const thHalf = 1 / (m.kF * 100 / K.V);
  near(s.stats.tHalf / thHalf, 1, 0.15, '半生期');
  // 初速率 ≈ k[A]0[B]0（前 10% 的平均，略低於起始瞬間的速率）
  const r0 = K.rateToMs(m.kF * 100 * 100 / K.V);
  assert.ok(m.rate0 > 0.75 * r0 && m.rate0 < 1.15 * r0, '初速率 ' + m.rate0 + ' 對 ' + r0);
});

test('放熱反應讓氣體變熱：反應熱留在氣體裡時溫度明顯升高；預設由恆溫槽吸收，溫度不變', function () {
  function meanT(heat) {
    const s = K.createSim({ T: 400, Ea: 2, dH: -40, nA: 150, nB: 150, seed: 8, heat: heat });
    let sum = 0;
    for (let k = 0; k < 40; k++) { K.advance(s, 2); sum += K.kineticTemp(s); }
    return { s: s, T: sum / 40 };
  }
  const g = meanT('gas'), b = meanT('bath');
  assert.ok(g.T > 440, '留在氣體裡：前 80 ps 平均 ' + g.T.toFixed(0) + ' K');
  near(b.T / 400, 1, 0.02, '恆溫槽吸收：平均溫度');
  K.advance(g.s, 1500);
  let sum = 0;
  for (let k = 0; k < 50; k++) { K.advance(g.s, 2); sum += K.kineticTemp(g.s); }
  near(sum / 50 / 400, 1, 0.03, '反應結束後回到器壁溫度');
});

console.log(`${passed} 項通過`);
