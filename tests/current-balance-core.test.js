// 以 Node 執行：node tests/current-balance-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/current-balance-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1e-300);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
const mu0 = 4 * Math.PI * 1e-7, g = 9.8;
const A = C.APP;

console.log('current-balance-core');

test('常數與儀器：μ0 = 4π × 10^-7，CODATA 值相差不到 10^-9；n = N/len；等臂', () => {
  close(C.MU0, mu0, 1e-15);
  assert.ok(Math.abs(C.MU0_CODATA / C.MU0 - 1) < 1e-9);
  close(A.n, A.N / A.len, 1e-12);
  close(A.d1, A.d2, 1e-12, '等臂天平');
  close(A.d1, A.zP - A.zBC, 1e-12, 'd1 = 支點到 bc');
  assert.ok(A.L / 2 < A.bore && A.boardW / 2 < A.bore, 'ㄈ字形電路放得進管子');
});

test('長螺線管：B = μ0 n I2；理想力矩係數 = μ0 n L d1；等臂時 mg = I1 L B', () => {
  for (const I2 of [0.5, 2, 3.7, 5]) close(C.Bideal(I2), mu0 * 4000 * I2, 1e-14);
  close(C.idealFactor(), mu0 * A.n * A.L * A.d1, 1e-14);
  for (const [I1, I2] of [[1, 2], [2.5, 3.3], [4, 5]]) {
    const m = C.balanceMass(I1, I2, false);
    close(m * g, I1 * A.L * C.Bideal(I2), 1e-12, 'mg = I1 L B');
    close(C.balanceI2(m, I1, false), I2, 1e-12);
    close(C.balanceI1(m, I2, false), I1, 1e-12);
    near(C.netTorque({ m: m, I1: I1, I2: I2, s1: 1, s2: 1, nut: A.nutOK }), 0, 1e-15, '平衡時淨力矩為零');
  }
});

test('課本試題的數字：長 10 cm、250 匝、1 A → B = π × 10^-3 T；bc 長 4 cm、2 A → F = 8π × 10^-5 N', () => {
  const B = C.Bideal(1, 250 / 0.1);
  close(B, Math.PI * 1e-3, 1e-12);
  close(2 * 0.04 * B, 8 * Math.PI * 1e-5, 1e-12);
  // 重物變 8 倍、I1 加倍 → I2 要變 4 倍（mg ∝ I1 I2）
  const m = 50e-6, I1 = 2, I2 = C.balanceI2(m, I1, false);
  close(C.balanceI2(8 * m, 2 * I1, false) / I2, 4, 1e-12);
});

test('方向：兩個電流都反向，力矩不變；只反一個，磁力矩變號', () => {
  const p = { m: 0, I1: 2, I2: 3, nut: A.nutOK };
  const t = C.netTorque(Object.assign({ s1: 1, s2: 1 }, p));
  assert.ok(t < 0, '正確方向：bc 被往下推，外端上翹（力矩為負）');
  close(C.netTorque(Object.assign({ s1: -1, s2: -1 }, p)), t, 1e-14);
  close(C.netTorque(Object.assign({ s1: -1, s2: 1 }, p)), -t, 1e-14);
  close(C.netTorque(Object.assign({ s1: 1, s2: -1 }, p)), -t, 1e-14);
});

test('圓線圈的封閉解：軸上 B = μ0 I a^2/[2(a^2 + z^2)^{3/2}]，離軸與畢歐—沙伐數值積分一致', () => {
  const a = 0.028, I = 2;
  for (const z of [0, 0.01, -0.05]) close(C.loopField(a, I, 0, z).Bz, mu0 * I * a * a / (2 * Math.pow(a * a + z * z, 1.5)), 1e-12);
  const bs = (rho, z) => { // 直接把圓線圈切成 4000 小段
    let Bx = 0, Bz = 0; const n = 4000;
    for (let i = 0; i < n; i++) {
      const p = 2 * Math.PI * (i + 0.5) / n, dp = 2 * Math.PI / n;
      const lx = -a * Math.sin(p) * dp, ly = a * Math.cos(p) * dp;
      const rx = rho - a * Math.cos(p), ry = -a * Math.sin(p), rz = z, r3 = Math.pow(rx * rx + ry * ry + rz * rz, 1.5);
      Bx += mu0 * I / (4 * Math.PI) * (ly * rz) / r3;
      Bz += mu0 * I / (4 * Math.PI) * (lx * ry - ly * rx) / r3;
    }
    return { Brho: Bx, Bz: Bz };
  };
  for (const [rho, z] of [[0.01, 0.005], [0.02, -0.03], [0.04, 0.02]]) {
    const f = C.loopField(a, I, rho, z), b = bs(rho, z);
    close(f.Bz, b.Bz, 1e-6); close(f.Brho, b.Brho, 1e-6);
  }
});

test('有限長螺線管：軸上的數值積分與封閉公式一致；中央比 μ0nI 略小，管口約一半', () => {
  for (const z of [-0.125, -0.2, -0.01, 0, 0.015, 0.05]) close(C.sheetField(0, z, 3).Bz, C.axialField(z, 3), 1e-9, 'z = ' + z);
  const B0 = C.Bideal(1), mid = C.axialField(-0.125, 1) / B0;
  close(mid, 0.125 / Math.hypot(0.125, A.a), 1e-12, '中央 = (len/2)/√((len/2)^2 + a^2)');
  assert.ok(mid > 0.97 && mid < 0.98);
  const mouth = C.axialField(0, 1) / B0;
  close(mouth, 0.5 * A.len / Math.hypot(A.len, A.a), 1e-12);
  assert.ok(mouth > 0.49 && mouth < 0.5);
  // 很長的螺線管 → 中央趨近 μ0 n I
  close(C.axialField(-5, 1, { len: 10 }) / B0, 1, 1e-4);
  close(C.sheetField(0.015, -5, 1, { len: 10, panels: 4000 }).Bz / B0, 1, 2e-4, '長螺線管中央離軸也相同');
});

test('∇·B = 0：管口附近穿過半徑 ρ 圓柱面的磁通量 = 兩端圓盤的磁通量差', () => {
  const rho = A.L / 2, z0 = -0.10, z1 = 0.10;
  const flux = z => { // ∫ Bz 2πr dr
    let s = 0; const n = 60;
    for (let i = 0; i < n; i++) { const r = (i + 0.5) * rho / n; s += C.sheetField(r, z, 1, { panels: 200 }).Bz * 2 * Math.PI * r * rho / n; }
    return s;
  };
  let side = 0; const n = 400;
  for (let i = 0; i < n; i++) { const z = z0 + (i + 0.5) * (z1 - z0) / n; side += C.sheetField(rho, z, 1, { panels: 200 }).Brho * 2 * Math.PI * rho * (z1 - z0) / n; }
  close(side, flux(z0) - flux(z1), 2e-3, '側面流出 = 兩端之差');
  assert.ok(side > 0, '管口外磁力線向外散開（Bρ > 0）');
});

test('真實螺線管的力矩：側臂受力與 bc 相反、合力 ≈ −(L/2)(Bbc − Bp)；整體比理想值小約 9%', () => {
  const r = C.realFactor();
  assert.ok(r.side < 0, '側臂的力矩與 bc 相反');
  close(r.sideForce, -(A.L / 2) * (C.axialField(A.zBC, 1) - C.axialField(A.zP, 1)), 0.04, '磁通量守恆的估計');
  close(r.Bbc / C.Bideal(1), C.axialField(A.zBC, 1) / C.Bideal(1), 2e-3, 'bc 段平均磁場 ≈ 軸上磁場');
  // 近軸近似：τ ≈ (L/2)[d1 Bz(bc) + ∫ Bz dz]
  let I = 0; const n = 4000;
  for (let i = 0; i < n; i++) { const z = A.zBC + (i + 0.5) * (A.zP - A.zBC) / n; I += C.axialField(z, 1) * (A.zP - A.zBC) / n; }
  close(r.G, A.L / 2 * (A.d1 * C.axialField(A.zBC, 1) + I), 0.01, '與近軸近似一致');
  assert.ok(r.ratio > 0.89 && r.ratio < 0.93, 'ratio = ' + r.ratio);
  close(C.factor(true), r.G, 1e-15); close(C.factor(false), C.idealFactor(), 1e-15);
  // 支點深入管內（整個電路都在均勻磁場裡）時，側臂不受力，回到理想值
  const deep = Object.assign({}, A, { len: 2.0, zBC: -1.0, zP: -0.86, d1: 0.14 });
  const rd = C.realFactor(deep);
  close(rd.G / (mu0 * A.n * A.L * 0.14), 1, 2e-3);
  C.realFactor(); // 還原快取
});

test('天平的平衡角：sin θ = τ/κ，超出擋塊停在 θmax；外端指針位移 = rTip sin θ', () => {
  const t = 2e-5;
  close(Math.sin(C.eqAngle(t)), t / A.kappa, 1e-12);
  close(C.eqAngle(1), A.thetaMax, 1e-15); close(C.eqAngle(-1), -A.thetaMax, 1e-15);
  close(C.tipOf(C.eqAngle(t)), A.rTip * t / A.kappa, 1e-12);
  // 1 mg 的不平衡約讓指針動 0.6 mm（夠靈敏），歸零前約偏 3 mm
  near(C.tipOf(C.eqAngle(1e-6 * g * A.d2)) * 1000, 0.58, 0.03);
  const t0 = C.netTorque({ nut: A.nutX0 });
  near(C.tipOf(C.eqAngle(t0)) * 1000, 3.3, 0.1);
  near(C.torqueToMass(t0) * 1e6, 5.7, 0.1);
  close(C.netTorque({ nut: A.nutOK }), 0, 1e-15);
});

test('天平的轉動：沒有摩擦時擺動後停在 sin θ = τ/κ；能量只減不增；撞擋塊會停住', () => {
  const tau = 1.2e-5, s = { th: 0, om: 0 };
  let maxTh = 0, E0 = Infinity, ok = true;
  const U = (th) => A.kappa * (1 - Math.cos(th)) - tau * th; // 位能
  for (let i = 0; i < 1500; i++) {
    C.stepBeam(s, tau, 1 / 60, 0);
    maxTh = Math.max(maxTh, s.th);
    const E = 0.5 * A.J * s.om * s.om + U(s.th);
    if (E > E0 + 1e-14) ok = false;
    E0 = E;
  }
  assert.ok(ok, '有阻尼時機械能遞減');
  close(Math.sin(s.th), tau / A.kappa, 1e-6, '最後停在平衡角');
  assert.ok(maxTh > s.th * 1.02, '會先擺過頭（欠阻尼）');
  const s2 = { th: 0, om: 0 };
  let hit = 0;
  for (let i = 0; i < 300; i++) hit = Math.max(hit, C.stepBeam(s2, 1e-3, 1 / 60, 0).hit);
  close(s2.th, A.thetaMax, 1e-12); assert.ok(hit > 0, '回報撞到擋塊');
});

test('支點摩擦：死區內不動；停下的位置在 sin θ = (τ ± τf)/κ 之間；準靜態公式一致', () => {
  const tf = A.tauF;
  const s = { th: 0, om: 0 };
  C.stepBeam(s, 0.9 * tf, 1, tf);
  assert.strictEqual(s.th, 0, '小於靜摩擦力矩，不會動');
  const tau = 1e-5;
  const s2 = { th: 0, om: 0 };
  for (let i = 0; i < 1200; i++) C.stepBeam(s2, tau, 1 / 60, tf);
  const lo = Math.asin((tau - tf) / A.kappa), hi = Math.asin((tau + tf) / A.kappa);
  assert.ok(s2.th >= lo - 1e-9 && s2.th <= hi + 1e-9, '停在死區裡');
  assert.strictEqual(s2.om, 0);
  close(C.restAngle(0, tau, tf), lo, 1e-12, '由下方慢慢接近 → 停在下緣');
  close(C.restAngle(0.1, tau, tf), hi, 1e-12, '由上方 → 停在上緣');
  close(C.restAngle(Math.asin(tau / A.kappa), tau, tf), Math.asin(tau / A.kappa), 1e-12, '已在死區內 → 不動');
});

test('電表與漆包線：讀數四捨五入到最後一位；40 mg/cm', () => {
  close(C.meter(2.0049, 0, 0.01), 2.00, 1e-12);
  close(C.meter(2.005, 0, 0.01), 2.01, 1e-12);
  close(C.meter(3, 0.01, 0.01), 3.03, 1e-12);
  close(C.wireMass(0.025), 100e-6, 1e-12);
  close(C.wireMass(0.01, 0.02), 40.8e-6, 1e-12);
});

test('數據分析：理想數據 → 實驗一的斜率 = μ0 n、實驗二的斜率 = L B；μ0 精確還原', () => {
  const I1 = 2, rows = [];
  for (const cm of [1, 2, 3, 4, 5]) { const m = C.wireMass(cm / 100); rows.push({ part: 1, m: m, I1: I1, I2: C.balanceI2(m, I1, false) }); }
  const I2 = 4;
  for (const cm of [1.5, 2.5, 3.5, 4.5, 5.5]) { const m = C.wireMass(cm / 100); rows.push({ part: 2, m: m, I1: C.balanceI1(m, I2, false), I2: I2 }); }
  const r = C.analyze(rows);
  close(r.p1.mu0, mu0, 1e-12); close(r.p1.fit.slope, mu0 * A.n, 1e-12);
  near(r.p1.line.intercept, 0, 1e-12); close(r.p1.fit.r2, 1, 1e-12);
  close(r.p2.B, mu0 * A.n * I2, 1e-12); near(r.p2.err, 0, 1e-12);
  close(r.mu0Mean, mu0, 1e-12);
  assert.strictEqual(r.p1.distinctM, 5); assert.strictEqual(r.p2.distinctM, 5);
  assert.strictEqual(r.p1.I1spread, 0); assert.strictEqual(r.p2.I2spread, 0);
  // 沒有歸零（零點偏 5 mg）：數據點仍成直線，但不通過原點（截距 ≠ 0）
  const off = 5e-6, rows2 = [1, 2, 3, 4, 5].map(cm => { const m = C.wireMass(cm / 100); return { part: 1, m: m, I1: I1, I2: C.balanceI2(m + off, I1, false) }; });
  const r2 = C.analyze(rows2);
  close(r2.p1.line.slope, mu0 * A.n, 1e-9);
  assert.ok(r2.p1.line.intercept < -1e-4, '截距為負（磁場要多抵消零點的偏差）');
  // 真實螺線管：斜率小約 9%
  const rows3 = [1, 2, 3, 4].map(cm => { const m = C.wireMass(cm / 100); return { part: 1, m: m, I1: I1, I2: C.balanceI2(m, I1, true) }; });
  close(C.analyze(rows3).p1.err, C.realFactor().ratio - 1, 1e-9);
});

test('可做得到：漆包線 0.5–7.5 cm（20–300 mg）都在電流範圍內平衡（I1 ≤ 4 A、I2 ≤ 5 A）', () => {
  assert.ok(C.balanceMass(A.I1Max, A.I2Max, false) > 300e-6, '理想最大可平衡 > 300 mg');
  assert.ok(C.balanceMass(A.I1Max, A.I2Max, true) > 270e-6, '真實螺線管最大可平衡 > 270 mg');
  // 課本的設定：I1 在 1–3 A、I2 約 2 A 時，可平衡數十 mg
  const m = C.balanceMass(2, 2, false) * 1e6;
  assert.ok(m > 40 && m < 80, m);
});

test('磁力線：由管內出發，在管口向外散開', () => {
  const pts = C.fieldLine(0.01, -0.1, { box: { r: 0.12, z0: -0.4, z1: 0.16 } });
  assert.ok(pts.length > 20);
  const atMouth = pts.find(p => p[1] > 0.02);
  assert.ok(atMouth && atMouth[0] > 0.0105, '出了管口後 ρ 變大');
  const inside = pts.find(p => p[1] > -0.06);
  near(inside[0], 0.01, 0.0006, '管內幾乎平行於軸');
});

console.log(`\n${passed} 項通過`);
