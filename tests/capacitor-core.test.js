// 以 Node 執行：node tests/capacitor-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/capacitor-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b));
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
const E0 = 8.8541878128e-12;
const P = (o) => Object.assign({ A: 0.01, d: 0.002, kappa: 1, f: 0 }, o);
const CASES = [{}, { A: 0.005, d: 0.001 }, { A: 0.04, d: 0.01, kappa: 5, f: 1 }, { A: 0.02, d: 0.0035, kappa: 3.5, f: 0.4 },
  { A: 0.013, d: 0.0072, kappa: 80, f: 0.73 }, { A: 0.03, d: 0.006, kappa: 6, f: 0 }];

console.log('capacitor-core');

test('C = ε0A/d（空氣），數值檢查：A = 100 cm²、d = 2 mm → 44.27 pF', () => {
  close(K.EPS0, E0, 1e-15, 'ε0');
  const C = K.capacitance(P({}));
  close(C, E0 * 0.01 / 0.002, 1e-14, 'C');
  close(C * 1e12, 44.2709, 1e-5, 'pF');
  close(K.cAir(0.01, 0.002), C, 1e-14, 'cAir');
});

test('介電質填滿：C = κε0A/d；κ = 1 或 f = 0 時回到 ε0A/d', () => {
  for (const k of [1, 3.5, 5, 6, 80]) {
    close(K.capacitance(P({ kappa: k, f: 1 })), k * E0 * 0.01 / 0.002, 1e-14, 'κ = ' + k);
    close(K.capacitance(P({ kappa: k, f: 0 })), E0 * 0.01 / 0.002, 1e-14, 'f = 0');
  }
  close(K.capacitance(P({ kappa: 1, f: 0.6 })), E0 * 0.01 / 0.002, 1e-14, 'κ = 1');
});

test('C ∝ A、C ∝ 1/d', () => {
  const C = (o) => K.capacitance(P(o));
  close(C({ A: 0.02 }) / C({}), 2, 1e-13, 'A 加倍');
  close(C({ d: 0.004 }) / C({}), 0.5, 1e-13, 'd 加倍');
  close(C({ d: 0.001, A: 0.03 }) / C({}), 6, 1e-13, 'A ×3、d ×½');
});

test('部分插入 = 兩個電容器並聯：C = ε0(1−f)A/d + κε0fA/d', () => {
  for (const o of CASES) {
    const p = P(o), pt = K.parts(p);
    const k = p.kappa, f = p.f;
    close(pt.air, E0 * (1 - f) * p.A / p.d, 1e-14, '空氣部分');
    close(pt.diel, k * E0 * f * p.A / p.d, 1e-14, '介電質部分');
    close(K.capacitance(p), K.parallel(pt.air, pt.diel), 1e-14, '並聯');
    close(K.capacitance(p), E0 * p.A / p.d * (1 + f * (k - 1)), 1e-14, '公式');
  }
  // C 隨插入比例線性增加
  const c = (f) => K.capacitance(P({ kappa: 5, f }));
  close(c(0.5) - c(0), (c(1) - c(0)) / 2, 1e-12, '線性');
});

test('並聯與串聯公式', () => {
  close(K.parallel(1e-12, 2e-12, 3e-12), 6e-12, 1e-14);
  close(K.series(2e-12, 2e-12), 1e-12, 1e-14);
  close(K.series(3e-12, 6e-12), 2e-12, 1e-14);
  close(K.series(5e-12), 5e-12, 1e-14);
});

test('平放的介電質板 = 空氣層與介電質層串聯；t = 0、t = d 為極限情況', () => {
  const A = 0.01, d = 0.004;
  for (const [t, k] of [[0.001, 5], [0.002, 3.5], [0.0035, 80], [0.004, 6]]) {
    const Cs = K.slabSeries(A, d, t, k);
    const air = d - t > 0 ? E0 * A / (d - t) : Infinity;
    const diel = k * E0 * A / t;
    close(Cs, air === Infinity ? diel : K.series(air, diel), 1e-13, 't = ' + t);
  }
  close(K.slabSeries(A, d, 0, 5), E0 * A / d, 1e-14, 't = 0');
  close(K.slabSeries(A, d, d, 5), 5 * E0 * A / d, 1e-14, 't = d');
  // 同樣的介電質用量（一半），平放（串聯）比直立插入一半（並聯）的電容小
  const ser = K.slabSeries(A, d, d / 2, 5), par = K.capacitance({ A, d, kappa: 5, f: 0.5 });
  assert.ok(ser < par, '串聯 < 並聯');
  close(ser, E0 * A / d * 2 * 5 / 6, 1e-13, '串聯 2κ/(1+κ)');
  close(par, E0 * A / d * 3, 1e-13, '並聯 (1+κ)/2');
});

test('solve：Q = CV、E = V/d、U = ½CV² = Q²/(2C) = QV/2', () => {
  for (const o of CASES) {
    const p = P(o);
    for (const [mode, src] of [['V', 12], ['Q', 3.3e-10]]) {
      const s = K.solve(p, mode, src);
      close(s.Q, s.C * s.V, 1e-13, 'Q = CV');
      close(s.E, s.V / p.d, 1e-13, 'E = V/d');
      close(s.U, 0.5 * s.C * s.V * s.V, 1e-13, '½CV²');
      close(s.U, s.Q * s.Q / (2 * s.C), 1e-13, 'Q²/2C');
      close(s.U, 0.5 * s.Q * s.V, 1e-13, 'QV/2');
      if (mode === 'V') close(s.V, src, 1e-15, 'V 固定'); else close(s.Q, src, 1e-15, 'Q 固定');
    }
  }
});

test('高斯定律：Q = σ空氣(1−f)A + σ介電質 fA；淨面密度 σ介電質 − σb = σ空氣 = ε0E', () => {
  for (const o of CASES) {
    const p = P(o), s = K.solve(p, 'V', 9);
    close(s.sigmaAir * (1 - p.f) * p.A + s.sigmaDiel * p.f * p.A, s.Q, 1e-13, '總電量');
    close(s.sigmaAir, E0 * s.E, 1e-13, 'σ = ε0E');
    if (p.kappa > 1) close(s.sigmaDiel - s.sigmaBound, s.sigmaAir, 1e-12, '淨面密度');
    close(s.sigmaDiel, p.kappa * s.sigmaAir, 1e-13, 'κ 倍');
  }
});

test('能量 = 能量密度 × 體積：U = ½ε0E²(1−f)Ad + ½κε0E²fAd', () => {
  for (const o of CASES) {
    const p = P(o), s = K.solve(p, 'V', 7.5);
    close(s.uAir * (1 - p.f) * p.A * p.d + s.uDiel * p.f * p.A * p.d, s.U, 1e-13, 'U');
    close(s.uAir, 0.5 * E0 * s.E * s.E, 1e-13, 'u');
  }
});

test('板距加倍：C 減半；V 固定 → Q、E、U 減半；Q 固定 → V、U 加倍，E 不變', () => {
  const p1 = P({}), p2 = P({ d: 0.004 });
  const a1 = K.solve(p1, 'V', 10), a2 = K.solve(p2, 'V', 10);
  close(a2.C / a1.C, 0.5, 1e-13, 'C');
  close(a2.Q / a1.Q, 0.5, 1e-13, 'V 固定：Q');
  close(a2.V / a1.V, 1, 1e-13, 'V 固定：V');
  close(a2.E / a1.E, 0.5, 1e-13, 'V 固定：E');
  close(a2.U / a1.U, 0.5, 1e-13, 'V 固定：U');
  const b1 = K.solve(p1, 'Q', a1.Q), b2 = K.solve(p2, 'Q', a1.Q);
  close(b2.Q / b1.Q, 1, 1e-13, 'Q 固定：Q');
  close(b2.V / b1.V, 2, 1e-13, 'Q 固定：V');
  close(b2.E / b1.E, 1, 1e-13, 'Q 固定：E');
  close(b2.U / b1.U, 2, 1e-13, 'Q 固定：U');
});

test('插入介電質（填滿）：V 固定 → Q、U 變 κ 倍，E 不變；Q 固定 → V、E、U 變 1/κ', () => {
  for (const k of [3.5, 5, 80]) {
    const p0 = P({}), p1 = P({ kappa: k, f: 1 });
    const a0 = K.solve(p0, 'V', 10), a1 = K.solve(p1, 'V', 10);
    close(a1.Q / a0.Q, k, 1e-13, 'Q');
    close(a1.E / a0.E, 1, 1e-13, 'E');
    close(a1.U / a0.U, k, 1e-13, 'U');
    const b1 = K.solve(p1, 'Q', a0.Q);
    close(b1.V / a0.V, 1 / k, 1e-13, 'V');
    close(b1.E / a0.E, 1 / k, 1e-13, 'E');
    close(b1.U / a0.U, 1 / k, 1e-13, 'U');
  }
});

test('面積加倍：V 固定 → Q、U 加倍，E 不變；Q 固定 → V、E、U 減半', () => {
  const p1 = P({}), p2 = P({ A: 0.02 });
  const a1 = K.solve(p1, 'V', 10), a2 = K.solve(p2, 'V', 10);
  close(a2.Q / a1.Q, 2, 1e-13); close(a2.E / a1.E, 1, 1e-13); close(a2.U / a1.U, 2, 1e-13);
  const b2 = K.solve(p2, 'Q', a1.Q);
  close(b2.V / a1.V, 0.5, 1e-13); close(b2.E / a1.E, 0.5, 1e-13); close(b2.U / a1.U, 0.5, 1e-13);
});

test('板間吸引力 F = Q²/(2ε0A) = QE/2，與板距無關；有介電質時不給值', () => {
  const s = K.solve(P({}), 'V', 10);
  close(s.F, s.Q * s.Q / (2 * E0 * 0.01), 1e-13, 'F');
  close(s.F, 0.5 * s.Q * s.E, 1e-13, 'QE/2');
  const q = K.solve(P({ d: 0.008 }), 'Q', s.Q);
  close(q.F, s.F, 1e-13, 'Q 固定時 F 與 d 無關');
  assert.strictEqual(K.solve(P({ kappa: 5, f: 0.5 }), 'V', 10).F, null);
  assert.ok(K.solve(P({ kappa: 5, f: 0 }), 'V', 10).F > 0, 'f = 0 視為空氣');
});

test('Q 固定拉開兩板：外力作功 F·Δd = ΔU，且 F = dU/dd（數值微分）', () => {
  const A = 0.01, Q = 4.4e-10;
  for (const [d1, d2] of [[0.002, 0.004], [0.001, 0.01], [0.005, 0.003]]) {
    const dU = K.pullWorkQ(Q, A, d1, d2);
    close(dU, K.forceAir(Q, A) * (d2 - d1), 1e-12, 'ΔU = FΔd');
    const U = (d) => K.solve({ A, d }, 'Q', Q).U;
    close(dU, U(d2) - U(d1), 1e-12, 'ΔU');
  }
  // F = dU/dd（Q 固定），數值微分
  const U = (d) => K.solve({ A, d }, 'Q', Q).U, h = 1e-7, d0 = 0.003;
  close((U(d0 + h) - U(d0 - h)) / (2 * h), K.forceAir(Q, A), 1e-8, 'dU/dd');
});

test('V 固定拉開兩板：ΔU = ½VΔQ、電池作功 VΔQ、外力作功 −½VΔQ（能量守恆）', () => {
  const V = 10, A = 0.01;
  for (const [d1, d2] of [[0.002, 0.004], [0.004, 0.002], [0.001, 0.01]]) {
    const r = K.pullV(V, A, d1, d2);
    const s1 = K.solve({ A, d: d1 }, 'V', V), s2 = K.solve({ A, d: d2 }, 'V', V);
    close(r.dQ, s2.Q - s1.Q, 1e-12, 'ΔQ');
    close(r.dU, s2.U - s1.U, 1e-12, 'ΔU');
    close(r.dU, 0.5 * V * r.dQ, 1e-12, '½VΔQ');
    close(r.Wbatt, V * r.dQ, 1e-12, '電池');
    close(r.Wmech + r.Wbatt, r.dU, 1e-12, '守恆');
    close(r.Wmech, -0.5 * V * r.dQ, 1e-12, '外力');
    if (d2 > d1) assert.ok(r.Wmech > 0 && r.Wbatt < 0, '拉開：外力作正功、電荷被推回電池');
  }
  // 外力作功 = ∫F dd，F = ε0AV²/(2d²)
  const d1 = 0.002, d2 = 0.005, N = 20000;
  let W = 0;
  for (let i = 0; i < N; i++) { const d = d1 + (i + 0.5) * (d2 - d1) / N; W += E0 * A * V * V / (2 * d * d) * (d2 - d1) / N; }
  close(K.pullV(V, A, d1, d2).Wmech, W, 1e-7, '∫F dd');
});

test('RC 充電示意：relax 為指數趨近，可任意切分時間步', () => {
  const q0 = 0, qf = 5e-10, tau = 0.3;
  close(K.relax(q0, qf, tau, tau), qf * (1 - Math.exp(-1)), 1e-13, 't = τ');
  let q = q0;
  for (let i = 0; i < 37; i++) q = K.relax(q, qf, 0.9 / 37, tau);
  close(q, K.relax(q0, qf, 0.9, tau), 1e-12, '切分');
  assert.strictEqual(K.relax(1, 2, 0.1, 0), 2);
  close(K.relax(qf, qf, 0.1, tau), qf, 1e-15, '平衡');
});

test('trend：上升、下降、不變', () => {
  assert.strictEqual(K.trend(1, 2), 'up');
  assert.strictEqual(K.trend(2, 1), 'down');
  assert.strictEqual(K.trend(1, 1 + 1e-12), 'same');
  assert.strictEqual(K.trend(0, 0), 'same');
  assert.strictEqual(K.trend(null, 1), null);
});

console.log(`  ${passed} 項通過`);
