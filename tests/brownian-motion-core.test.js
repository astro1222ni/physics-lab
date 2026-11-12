// 以 Node 執行：node tests/brownian-motion-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/brownian-motion-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1e-300);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
const UM = 1e-6;

console.log('布朗運動核心測試');

// ---------------- 常數與材料數據 ----------------
test('常數：k_B、N_A 是 SI 定義值，R = N_A k_B', () => {
  assert.strictEqual(C.KB, 1.380649e-23);
  assert.strictEqual(C.NA, 6.02214076e23);
  close(C.R, 8.314462618, 1e-9);
});
test('水的黏滯係數：節點等於 CRC 表（0、20、100 °C）', () => {
  close(C.etaWater(0), 1.792e-3, 1e-12);
  close(C.etaWater(20), 1.002e-3, 1e-12);
  close(C.etaWater(100), 0.282e-3, 1e-12);
  C.WATER_T.forEach((T, i) => close(C.etaWater(T), C.WATER_ETA[i] * 1e-3, 1e-12, T + ' °C'));
});
test('水的黏滯係數：節點之間平滑遞減，25 °C 約 0.890 mPa·s、37 °C 約 0.692 mPa·s', () => {
  let prev = Infinity;
  for (let T = 0; T <= 100; T += 0.5) { const e = C.etaWater(T); assert.ok(e < prev, T + ' °C 沒有遞減'); prev = e; }
  close(C.etaWater(25), 0.890e-3, 0.005);
  close(C.etaWater(37), 0.692e-3, 0.01);
});
test('甘油水溶液（Cheng 2008 經驗式）：50%、20 °C 約 6.0 mPa·s；80%、20 °C 約 60 mPa·s（文獻表 10% 內）', () => {
  close(C.etaCheng(20, 0.5), 6.0e-3, 0.10);
  close(C.etaCheng(20, 0.8), 60.1e-3, 0.10);
  close(C.etaCheng(60, 0.5), 2.1e-3, 0.15);
});
test('Cheng 經驗式的極限：質量分率 0 時是水、1 時是純甘油（20 °C 約 1.41 Pa·s）', () => {
  close(C.etaCheng(20, 0), 1.002e-3, 0.01);
  close(C.etaCheng(20, 1), 1.41, 0.03);
});
test('黏滯係數的順序：任何溫度都是 甘油 80% > 甘油 50% > 水', () => {
  for (let T = 0; T <= 100; T += 5) {
    assert.ok(C.eta('gly80', T) > C.eta('gly50', T) && C.eta('gly50', T) > C.eta('water', T), T + ' °C');
  }
});
test('水的密度：4 °C 附近最大，20 °C = 998.21、100 °C = 958.35 kg/m³', () => {
  close(C.rhoWater(20), 998.21, 1e-9);
  close(C.rhoWater(100), 958.35, 1e-9);
  let best = 0, bv = 0;
  for (let T = 0; T <= 10; T += 0.1) { const r = C.rhoWater(T); if (r > bv) { bv = r; best = T; } }
  assert.ok(best > 2.5 && best < 5.5, '最大值在 ' + best.toFixed(1) + ' °C');
});

// ---------------- 斯托克斯–愛因斯坦 ----------------
test('斯托克斯–愛因斯坦：水、20 °C、a = 0.5 μm → D ≈ 4.29 × 10^-13 m²/s', () => {
  close(C.D('water', 20, 0.5 * UM), 4.29e-13, 0.002);
});
test('D 與 a 成反比、與 T/η 成正比：20 → 80 °C 的水，D 增為 (353.15/293.15)(1.002/0.354) ≈ 3.41 倍', () => {
  close(C.D('water', 20, 0.25 * UM) / C.D('water', 20, 0.5 * UM), 2, 1e-12);
  const k = C.D('water', 80, 1 * UM) / C.D('water', 20, 1 * UM);
  close(k, (353.15 / 293.15) * (1.002 / 0.354), 1e-9);
  close(k, 3.41, 0.002);
});
test('動量鬆弛時間：直徑 1 μm 的聚苯乙烯在 20 °C 水中約 0.06 μs，遠小於 0.1 s 的錄影間隔', () => {
  const tau = C.relaxTime(0.5 * UM, 1050, C.etaWater(20));
  close(tau, 0.058e-6, 0.03);
  assert.ok(tau < 1e-6 * C.FRAME_DT);
});
test('由 D 反推：k_B,meas 回到 k_B，N_A = R_MACRO/k_B 與定義值差 0.006%', () => {
  const e = C.etaWater(37), a = 0.8 * UM, Dt = C.diffusion(37, e, a);
  close(C.kBfromD(Dt, e, a, 37), C.KB, 1e-12);
  close(C.NAfromKB(C.KB), C.NA, 1e-4);
});

// ---------------- 亂數 ----------------
test('亂數：同一個種子結果相同；常態亂數平均 0、變異數 1', () => {
  const a = C.rng(42), b = C.rng(42);
  for (let i = 0; i < 10; i++) assert.strictEqual(a.gauss(), b.gauss());
  const r = C.rng(7); let s = 0, s2 = 0; const n = 200000;
  for (let i = 0; i < n; i++) { const g = r.gauss(); s += g; s2 += g * g; }
  assert.ok(Math.abs(s / n) < 0.01, '平均 ' + s / n);
  close(s2 / n, 1, 0.01);
});

// ---------------- 均方位移 ----------------
test('每一步每一軸的位移：平均 0、變異數 2DΔt（N = 400、600 步）', () => {
  const Dd = 2e-13, run = C.simulateRun({ D: Dd, N: 400, tObs: 60, seed: 11 });
  let s = 0, s2 = 0, n = 0;
  for (let f = 1; f <= run.F; f++) for (let i = 0; i < run.N; i++) {
    const d = run.x[f * run.N + i] - run.x[(f - 1) * run.N + i]; s += d; s2 += d * d; n++;
  }
  assert.ok(Math.abs(s / n) < 0.01 * Math.sqrt(2 * Dd * run.dt));
  close(s2 / n, 2 * Dd * run.dt, 0.01);
});
test('多顆粒平均：一維 2Dt、二維 4Dt、三維 6Dt（8000 顆、30 s，誤差 4% 內）', () => {
  const Dd = 5e-13, run = C.simulateRun({ D: Dd, N: 8000, tObs: 30, seed: 5 });
  const t = run.F * run.dt;
  [1, 2, 3].forEach(d => close(C.msdEnsemble(run, d)[run.F], 2 * d * Dd * t, 0.04, d + ' 維'));
});
test('大量顆粒時，D_meas／D 在 3% 內（50 顆、60 s，五個種子）', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const Dd = 4.29e-13, run = C.simulateRun({ D: Dd, N: 50, tObs: 60, seed });
    close(C.measureD(run).D, Dd, 0.03, '種子 ' + seed);
  }
});
test('時間平均與多顆粒平均一致：一顆走 60 s 與 50 顆走 1 s，平均起來都接近真值', () => {
  let a = 0, b = 0;
  for (let s = 1; s <= 200; s++) {
    a += C.measureD(C.simulateRun({ D: 1, N: 1, tObs: 60, seed: s })).D;
    b += C.measureD(C.simulateRun({ D: 1, N: 50, tObs: 1, seed: 1000 + s })).D;
  }
  close(a / 200, 1, 0.015); close(b / 200, 1, 0.015);
});
test('⟨r²⟩ 對 t 的斜率：直線 4Dt 擬合遠比 t² 擬合好', () => {
  const run = C.simulateRun({ D: 1e-12, N: 1000, tObs: 20, seed: 9 }), m = C.msdEnsemble(run, 2);
  const t = [], y = [], t2 = [];
  for (let f = 1; f <= run.F; f++) { t.push(f * run.dt); t2.push((f * run.dt) ** 2); y.push(m[f]); }
  const lin = C.fitOrigin(t, y), quad = C.fitOrigin(t2, y);
  assert.ok(lin.ss < 0.05 * quad.ss, '直線殘差 ' + lin.ss + '，平方殘差 ' + quad.ss);
  close(lin.k / 4, 1e-12, 0.04);
});
test('過原點擬合：沒有雜訊時剛好得到斜率', () => {
  const f = C.fitOrigin([1, 2, 3], [2, 4, 6]);
  close(f.k, 2, 1e-12); assert.ok(f.ss < 1e-20);
});
test('4 段分割的標準誤差和真實的分散相當（相差 2 倍內）', () => {
  const v = [], se = [];
  for (let s = 1; s <= 200; s++) { const r = C.measureD(C.simulateRun({ D: 1, N: 20, tObs: 20, seed: 50 + s })); v.push(r.D); se.push(r.se); }
  const m = v.reduce((a, b) => a + b) / v.length, sd = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1));
  const mse = se.reduce((a, b) => a + b) / se.length;
  assert.ok(mse > sd / 2 && mse < sd * 2, '平均標準誤差 ' + mse + '，實際分散 ' + sd);
});
test('尾端事件：二維位移 r²/(4Dt) 超過 k 的機率是 e^(−k)（k = 2、4）', () => {
  const run = C.simulateRun({ D: 1, N: 40000, tObs: 1, seed: 3 }), s = 4 * run.F * run.dt;
  [2, 4].forEach(k => {
    let c = 0;
    for (let i = 0; i < run.N; i++) if (C.disp2(run, run.F, i, 2) / s >= k) c++;
    const p = Math.exp(-k), se = Math.sqrt(p * (1 - p) / run.N);
    assert.ok(Math.abs(c / run.N - p) < 4 * se, 'k = ' + k + '：' + c / run.N + ' 對 ' + p);
  });
});

// ---------------- 沉降平衡 ----------------
test('標高：a = 0.2 μm、Δρ = 200 kg/m³、20 °C → H ≈ 61.6 μm', () => {
  close(C.scaleHeight(0.2 * UM, 200, 20), 61.6 * UM, 0.002);
});
test('佩蘭的藤黃（直徑 0.75 μm、ρ = 1.20 g/cm³、20 °C）：每升高約 6 μm 濃度減半', () => {
  const p = C.sedParams('gamboge', 0.375 * UM, 20);
  close(p.H * Math.LN2, 6.4 * UM, 0.03);
  close(p.dRho, 1200 - 998.21, 1e-9);
});
test('標高與 m′g 成反比、與 T 成正比：半徑加倍，標高變成 1/8', () => {
  close(C.scaleHeight(0.4 * UM, 200, 20) / C.scaleHeight(0.2 * UM, 200, 20), 1 / 8, 1e-12);
  close(C.scaleHeight(0.2 * UM, 200, 80) / C.scaleHeight(0.2 * UM, 200, 20), 353.15 / 293.15, 1e-12);
});
test('沉降法反推：k_B,meas = m′gH/T 回到 k_B', () => {
  const p = C.sedParams('silica', 0.3 * UM, 35);
  close(C.kBfromH(p.H, p.mPrime, 35), C.KB, 1e-12);
});
test('平衡分布取樣＋分層計數＋ln n 擬合：大量顆粒時標高誤差 2% 內', () => {
  const H = 10 * UM, r = C.rng(21), s = C.sedSample(200000, H, 1, 1, r);
  const v = C.sedView(H, 0.3 * UM), c = C.layerCounts(s.h, v.Hv, v.layers), w = v.Hv / v.layers;
  const f = C.fitLnN(c.map((_, i) => (i + 0.5) * w), c);
  close(f.H, H, 0.02);
  assert.ok(f.se / f.H < 0.01);
});
test('等厚分層的顆粒數比值剛好是 e^(−Δ/H)（取層中心擬合沒有偏差）', () => {
  const H = 1, w = 0.8, c = [0, 1, 2, 3, 4].map(i => 1e6 * (Math.exp(-i * w / H) - Math.exp(-(i + 1) * w / H)));
  const f = C.fitLnN(c.map((_, i) => (i + 0.5) * w), c);
  close(f.H, H, 1e-9);
});
test('含漂移的朗之萬方程（底部反射）從均勻分布出發，會鬆弛到 exp(−h/H)：平均高度 → H', () => {
  const H = 1, Dd = 1, r = C.rng(4), n = 4000, s = { n, x: new Float64Array(n), y: new Float64Array(n), h: new Float64Array(n) };
  for (let i = 0; i < n; i++) s.h[i] = r.next() * 6;
  const dt = 0.002;
  for (let k = 0; k < 6000; k++) C.sedStep(s, dt, Dd, H, 0, 0, r);
  const m = s.h.reduce((a, b) => a + b, 0) / n;
  close(m, H, 0.05);
});
test('視窗高度：1–2–5 系列、至少 5H', () => {
  const v = C.sedView(9.26 * UM, 0.375 * UM);
  assert.ok(v.Hv >= 5 * 9.26 * UM && v.Hv <= 10.01 * 9.26 * UM);
  close(v.Hv, 50 * UM, 1e-9);
});

// ---------------- 分子視角（硬圓盤） ----------------
test('兩圓盤彈性碰撞：動量與動能都守恆，分開後不再撞', () => {
  const s = { x: [0, 1], y: [0, 0.3], vx: [1, -2], vy: [0.5, 0], m: [100, 1] };
  const p0 = [s.m[0] * s.vx[0] + s.m[1] * s.vx[1], s.m[0] * s.vy[0] + s.m[1] * s.vy[1]];
  const e0 = 0.5 * s.m[0] * (s.vx[0] ** 2 + s.vy[0] ** 2) + 0.5 * s.m[1] * (s.vx[1] ** 2 + s.vy[1] ** 2);
  assert.ok(C.collide(s, 0, 1, 1, 0.3) > 0);
  close(s.m[0] * s.vx[0] + s.m[1] * s.vx[1], p0[0], 1e-12);
  close(s.m[0] * s.vy[0] + s.m[1] * s.vy[1], p0[1], 1e-12);
  close(0.5 * s.m[0] * (s.vx[0] ** 2 + s.vy[0] ** 2) + 0.5 * s.m[1] * (s.vx[1] ** 2 + s.vy[1] ** 2), e0, 1e-12);
  assert.strictEqual(C.collide(s, 0, 1, 1, 0.3), 0);
});
test('週期性邊界的盒子：3000 步後總動量與總動能守恆（相對誤差 10^-9 內）', () => {
  const s = C.mdCreate({ n: 300, W: 160, H: 100, r: 1, Rb: 6, m: 1, M: 100, kT: 1, seed: 3, periodic: true });
  const p0 = C.mdMomentum(s), e0 = C.mdEnergy(s);
  let hits = 0;
  for (let k = 0; k < 3000; k++) hits += C.mdStep(s, 0.05).hits;
  const p1 = C.mdMomentum(s);
  assert.ok(Math.abs(p1[0] - p0[0]) < 1e-9 * Math.sqrt(2 * e0) && Math.abs(p1[1] - p0[1]) < 1e-9 * Math.sqrt(2 * e0));
  close(C.mdEnergy(s), e0, 1e-9);
  assert.ok(hits > 20, '大圓盤被撞 ' + hits + ' 次');
});
test('有牆的盒子：總動能守恆，大圓盤一直被撞', () => {
  const s = C.mdCreate({ n: 300, W: 160, H: 100, r: 1, Rb: 6, m: 1, M: 100, kT: 1, seed: 8 });
  const e0 = C.mdEnergy(s);
  for (let k = 0; k < 2000; k++) C.mdStep(s, 0.05);
  close(C.mdEnergy(s), e0, 1e-9);
  assert.ok(s.hits > 20);
});
test('小圓盤的速度：二維馬克士威–波茲曼分布，每個分量的變異數 = kT/m', () => {
  const s = C.mdCreate({ n: 20000, W: 4000, H: 4000, r: 1, Rb: 6, m: 2, M: 100, kT: 3, seed: 2 });
  let v2 = 0; for (let i = 1; i < s.n; i++) v2 += s.vx[i] ** 2;
  close(v2 / (s.n - 1), 3 / 2, 0.03);
});
test('能量均分：長時間平均，大圓盤的平均動能和小圓盤一樣都是 kT（質量比 50，12% 內）', () => {
  const s = C.mdCreate({ n: 1200, W: 100, H: 100, r: 1, Rb: 5, m: 1, M: 50, kT: 1, seed: 12, periodic: true });
  let kb = 0, c = 0;
  for (let k = 0; k < 30000; k++) { C.mdStep(s, 0.05); if (k > 1000 && k % 5 === 0) { kb += 0.5 * s.m[0] * (s.vx[0] ** 2 + s.vy[0] ** 2); c++; } }
  // 二維：每個粒子平均動能 = kT（兩個自由度各 ½kT）；週期性邊界扣掉質心運動後總體略小於 1
  close(kb / c, 1, 0.12);
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗' : ''));
