// 以 Node 執行：node tests/ideal-gas-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/ideal-gas-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1e-300);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
function within(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
/** 數值積分（辛普森法） */
function simpson(f, a, b, n) {
  n = n || 4000;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return s * h / 3;
}
const He = C.SPECIES[0], Ne = C.SPECIES[1], Ar = C.SPECIES[2], Xe = C.SPECIES[4];
function gas(o) {
  return C.createGas(Object.assign({ species: [He], counts: [200], T: 300, Lx: 20, Ly: 20, Lz: 20, LxMin: 10, LxMax: 30, seed: 7, diffuse: true }, o));
}
function measure(g, time, block) {
  const M = new C.Meter(block || 5);
  const ms = g.species.map(function (s) { return s.m; });
  for (let t = 0; t < time; t++) { C.advance(g, 1); M.add(C.takeAcc(g), C.countBySpecies(g), ms); }
  return M.stats();
}
function kurtosis(g) {
  let s2 = 0, s4 = 0;
  for (let i = 0; i < g.n; i++) { const v2 = g.vx[i] ** 2 + g.vy[i] ** 2 + g.vz[i] ** 2; s2 += v2; s4 += v2 * v2; }
  s2 /= g.n; s4 /= g.n;
  return s4 / (s2 * s2);
}

console.log('ideal-gas-core');

test('單位：k = R/1000 u·nm²/(ps²·K)；200 個氦原子、8000 nm³、300 K → 約 1 大氣壓', () => {
  close(C.KB, 8.314462618e-3, 1e-6, 'k（模擬單位）');
  close(C.toSI.energy(C.kT(300)), 1.380649e-23 * 300, 1e-12, 'kT');
  const P = C.toSI.pressureKPa(C.idealP(200, 300, 8000));
  close(P, 200 * 1.380649e-23 * 300 / 8e-24 / 1000, 1e-10, 'P = NkT/V');
  within(P, 103.55, 0.01, 'P（kPa）');
  close(C.moles(200), 200 / 6.02214076e23, 1e-12, 'n = N/N_A');
  // PV = nRT（SI）
  close(C.toSI.pressure(C.idealP(200, 300, 8000)) * C.toSI.volume(8000), C.moles(200) * C.R * 300, 1e-10, 'PV = nRT');
});

test('方均根速率 √(3kT/m)：300 K 的氦 1368 m/s、氬 433 m/s，與 √(3RT/M) 一致', () => {
  const vHe = C.toSI.speed(C.vrms(300, He.m)), vAr = C.toSI.speed(C.vrms(300, Ar.m));
  close(vHe, Math.sqrt(3 * 8.314462618 * 300 / (He.m * 1e-3)), 1e-6, '氦');
  close(vAr, Math.sqrt(3 * 8.314462618 * 300 / (Ar.m * 1e-3)), 1e-6, '氬');
  within(vHe, 1367.6, 0.5, '氦 v_rms');
  within(vAr, 432.9, 0.5, '氬 v_rms');
  close(C.vrms(1200, He.m), 2 * C.vrms(300, He.m), 1e-12, 'v_rms ∝ √T');
  close(C.vrms(300, He.m) / C.vrms(300, Ar.m), Math.sqrt(Ar.m / He.m), 1e-12, 'v_rms ∝ 1/√m');
  close(0.5 * He.m * C.vrms(300, He.m) ** 2, C.meanKE(300), 1e-12, '½ m v_rms² = (3/2)kT');
});

test('馬克士威分布：歸一化、平均值、方均值、最可能速率', () => {
  for (const [T, m] of [[300, He.m], [50, Xe.m], [1000, Ar.m]]) {
    const top = 12 * C.vrms(T, m);
    close(simpson(function (v) { return C.maxwell(v, T, m); }, 0, top), 1, 1e-9, '∫f dv');
    close(simpson(function (v) { return v * C.maxwell(v, T, m); }, 0, top), C.vmean(T, m), 1e-9, '⟨v⟩');
    close(simpson(function (v) { return v * v * C.maxwell(v, T, m); }, 0, top), 3 * C.KB * T / m, 1e-9, '⟨v²⟩');
    close(simpson(function (v) { return v ** 4 * C.maxwell(v, T, m); }, 0, top) / (3 * C.KB * T / m) ** 2, 5 / 3, 1e-8, '⟨v⁴⟩/⟨v²⟩²');
    const vp = C.vprob(T, m), h = vp * 1e-4;
    assert.ok(C.maxwell(vp, T, m) > C.maxwell(vp - h, T, m) && C.maxwell(vp, T, m) > C.maxwell(vp + h, T, m), '最大值在 v_p');
  }
  close(C.vmean(300, Ne.m) / C.vprob(300, Ne.m), Math.sqrt(4 / Math.PI), 1e-12, 'v̄/v_p');
  close(C.vrms(300, Ne.m) / C.vprob(300, Ne.m), Math.sqrt(1.5), 1e-12, 'v_rms/v_p');
});

test('兩球彈性碰撞：動量與動能守恆，沿連心線交換，等質量正面碰撞交換速度', () => {
  const rng = C.makeRng(3);
  for (let k = 0; k < 500; k++) {
    const a = { m: 1 + 100 * rng(), x: 0, y: 0, z: 0, vx: rng() * 2 - 1, vy: rng() * 2 - 1, vz: rng() * 2 - 1 };
    const b = { m: 1 + 100 * rng(), x: rng() - 0.5, y: rng() - 0.5, z: rng() - 0.5, vx: rng() * 2 - 1, vy: rng() * 2 - 1, vz: rng() * 2 - 1 };
    const p0 = [a.m * a.vx + b.m * b.vx, a.m * a.vy + b.m * b.vy, a.m * a.vz + b.m * b.vz];
    const e0 = 0.5 * a.m * (a.vx ** 2 + a.vy ** 2 + a.vz ** 2) + 0.5 * b.m * (b.vx ** 2 + b.vy ** 2 + b.vz ** 2);
    const n = [a.x - b.x, a.y - b.y, a.z - b.z];
    const t1 = [n[1], -n[0], 0]; // 與連心線垂直的方向
    const tv0 = a.vx * t1[0] + a.vy * t1[1] + a.vz * t1[2];
    const hit = C.collidePair(a, b);
    const p1 = [a.m * a.vx + b.m * b.vx, a.m * a.vy + b.m * b.vy, a.m * a.vz + b.m * b.vz];
    const e1 = 0.5 * a.m * (a.vx ** 2 + a.vy ** 2 + a.vz ** 2) + 0.5 * b.m * (b.vx ** 2 + b.vy ** 2 + b.vz ** 2);
    for (let q = 0; q < 3; q++) within(p1[q], p0[q], 1e-12 * (1 + Math.abs(p0[q]) + a.m + b.m), '動量');
    close(e1, e0, 1e-12, '動能');
    close(a.vx * t1[0] + a.vy * t1[1] + a.vz * t1[2], tv0, 1e-9, '垂直連心線的速度不變');
    if (hit > 0) {
      const dv = (a.vx - b.vx) * n[0] + (a.vy - b.vy) * n[1] + (a.vz - b.vz) * n[2];
      assert.ok(dv >= -1e-12, '碰撞後沿連心線分開');
    }
  }
  const a = { m: 4, x: 0, y: 0, z: 0, vx: 1, vy: 0, vz: 0 }, b = { m: 4, x: 0.5, y: 0, z: 0, vx: -0.3, vy: 0, vz: 0 };
  C.collidePair(a, b);
  close(a.vx, -0.3, 1e-12); close(b.vx, 1, 1e-12);
  const c = { m: 4, x: 0, y: 0, z: 0, vx: -1, vy: 0, vz: 0 }, d = { m: 4, x: 0.5, y: 0, z: 0, vx: 1, vy: 0, vz: 0 };
  assert.strictEqual(C.collidePair(c, d), 0, '正在分開的球不碰撞');
});

test('光滑器壁：鏡面反射，位置對稱、法向速度反向，衝量 2m|vₓ|', () => {
  const g = gas({ counts: [1], diffuse: false });
  g.x[0] = 19.5; g.y[0] = 10; g.z[0] = 10; g.vx[0] = 1; g.vy[0] = 0.2; g.vz[0] = -0.1;
  // 活塞在 x = 20：0.5 ps 撞牆，再走 0.5 ps
  C.advance(g, 1);
  close(g.x[0], 19.5, 1e-12, 'x'); close(g.vx[0], -1, 1e-12, 'vx'); close(g.vy[0], 0.2, 1e-12, 'vy 不變');
  const a = C.takeAcc(g);
  close(a.J, 2 * He.m * 1, 1e-12, '衝量'); assert.strictEqual(a.hits, 1); assert.strictEqual(a.hitsPiston, 1);
  // 牆角：同時撞兩面牆
  g.x[0] = 0.25; g.y[0] = 0.25; g.z[0] = 5; g.vx[0] = -0.5; g.vy[0] = -0.5; g.vz[0] = 0;
  C.advance(g, 1);
  close(g.x[0], 0.25, 1e-12); close(g.y[0], 0.25, 1e-12); close(g.vx[0], 0.5, 1e-12); close(g.vy[0], 0.5, 1e-12);
});

test('粗糙的絕熱壁：反彈後速率不變、方向朝內（彈性漫反射）', () => {
  const g = gas({ counts: [1], diffuse: true, seed: 11 });
  for (let k = 0; k < 300; k++) {
    g.x[0] = 0.05; g.y[0] = 10; g.z[0] = 10; g.vx[0] = -1.2; g.vy[0] = 0.3; g.vz[0] = 0.4;
    const s0 = Math.hypot(g.vx[0], g.vy[0], g.vz[0]);
    C.advance(g, 0.1);
    close(Math.hypot(g.vx[0], g.vy[0], g.vz[0]), s0, 1e-12, '速率');
    assert.ok(g.vx[0] > 0, '朝內');
  }
  assert.strictEqual(C.takeAcc(g).Q, 0, '沒有熱量');
});

test('移動的活塞：vₓ′ = 2u − vₓ，動能變化等於活塞作的功', () => {
  const g = gas({ counts: [1], diffuse: false, pistonVmax: 0.1 });
  g.piston.target = 10; // 活塞以 0.1 nm/ps 向內
  g.x[0] = 19.8; g.y[0] = 10; g.z[0] = 10; g.vx[0] = 0.4; g.vy[0] = 0; g.vz[0] = 0;
  const e0 = C.kinetic(g).total;
  C.advance(g, 1);
  close(g.vx[0], 2 * -0.1 - 0.4, 1e-12, 'vₓ′');
  const a = C.takeAcc(g);
  close(a.W, C.kinetic(g).total - e0, 1e-12, 'W = ΔE');
  assert.ok(a.W > 0, '壓縮時分子變快');
  close(g.Lx, 19.9, 1e-12, '活塞位置');
  // 後退的活塞：分子變慢
  const h = gas({ counts: [1], diffuse: false, pistonVmax: 0.1 });
  h.piston.target = 30;
  h.x[0] = 19.8; h.y[0] = 10; h.z[0] = 10; h.vx[0] = 0.4; h.vy[0] = 0; h.vz[0] = 0;
  C.advance(h, 1);
  close(h.vx[0], 2 * 0.1 - 0.4, 1e-12, '後退');
  assert.ok(C.takeAcc(h).W < 0, '膨脹時分子變慢');
});

test('孤立氣體：碰撞頻繁、總動能守恆到捨入誤差、分子都留在容器內、不會互相穿過', () => {
  const g = gas({ species: [He, Xe], counts: [120, 80], seed: 21 });
  const e0 = C.kinetic(g).total;
  let coll = 0;
  for (let t = 0; t < 400; t++) { C.advance(g, 1); coll += C.takeAcc(g).coll; }
  close(C.kinetic(g).total, e0, 1e-11, '總動能');
  assert.ok(coll > 300, '分子間碰撞次數 ' + coll);
  let minGap = Infinity;
  for (let i = 0; i < g.n; i++) {
    assert.ok(g.x[i] >= 0 && g.x[i] <= g.Lx && g.y[i] >= 0 && g.y[i] <= g.Ly && g.z[i] >= 0 && g.z[i] <= g.Lz, '在容器內');
    for (let j = i + 1; j < g.n; j++) {
      const d = Math.hypot(g.x[i] - g.x[j], g.y[i] - g.y[j], g.z[i] - g.z[j]) / (g.rad[i] + g.rad[j]);
      if (d < minGap) minGap = d;
    }
  }
  assert.ok(minGap > 0.9, '最小距離 / 接觸距離 = ' + minGap.toFixed(3));
});

test('壓力由撞牆衝量量出：等於 (NkT/V)·Z（硬球修正），在統計誤差內', () => {
  for (const [sp, N, Lx, seed] of [[He, 200, 20, 1], [Ar, 300, 10, 2], [Xe, 100, 30, 3]]) {
    const g = gas({ species: [sp], counts: [N], Lx: Lx, seed: seed });
    C.advance(g, 50); C.takeAcc(g);
    const s = measure(g, 2500);
    const V = C.volume(g), Z = C.hardSphereZ([N], [sp.d], V);
    const Pth = C.idealP(N, s.T, V) * Z;
    const err = Math.abs(s.P - Pth);
    assert.ok(err < 4 * s.Perr + 0.002 * Pth, sp.id + `：P = ${s.P}，(NkT/V)Z = ${Pth}，SE = ${s.Perr}`);
    assert.ok(Math.abs(s.P / C.idealP(N, s.T, V) - 1) < 0.035, sp.id + ' 與理想氣體相差 < 3.5%');
  }
  // 分子極小時趨近理想氣體
  const g = gas({ species: [{ m: 4, d: 0.02 }], counts: [200], seed: 4 });
  C.advance(g, 20); C.takeAcc(g);
  const s = measure(g, 2500);
  const Pth = C.idealP(200, s.T, C.volume(g));
  assert.ok(Math.abs(s.P / Pth - 1) < 0.004, '點粒子：P/(NkT/V) = ' + (s.P / Pth));
});

test('撞牆頻率 = ¼ n v̄ × 器壁面積', () => {
  const g = gas({ bath: true, bathT: 300, seed: 5 });
  C.advance(g, 50); C.takeAcc(g);
  const s = measure(g, 1500);
  const th = C.wallFlux(200 / C.volume(g), C.vmean(s.T, He.m)) * C.wallArea(g);
  close(s.hitRate, th, 0.02, '撞牆次數/ps');
});

test('恆溫壁：氣體溫度趨近槽溫，速率分布成為馬克士威分布', () => {
  const g = gas({ species: [Ar], T: 100, bath: true, bathT: 500, seed: 6 });
  C.advance(g, 400); C.takeAcc(g);
  const s = measure(g, 1500);
  within(s.T, 500, 3 * s.Terr + 5, 'T');
  let k = 0;
  for (let q = 0; q < 50; q++) { C.advance(g, 20); k += kurtosis(g); }
  within(k / 50, 5 / 3, 0.06, '⟨v⁴⟩/⟨v²⟩²');
});

test('非平衡起始（速率都相同）→ 只靠分子碰撞就變成馬克士威分布', () => {
  const g = gas({ init: 'same', seed: 8 });
  const e0 = C.kinetic(g).total;
  close(kurtosis(g), 1, 1e-9, '一開始速率都相同');
  C.advance(g, 400);
  let k = 0;
  for (let q = 0; q < 60; q++) { C.advance(g, 20); k += kurtosis(g); }
  within(k / 60, 5 / 3, 0.07, '⟨v⁴⟩/⟨v²⟩²');
  close(C.kinetic(g).total, e0, 1e-11, '總動能不變');
});

test('能量均分：氦與氬混合（同速率起始、絕熱），平均動能變得相等，v_rms 比 = √(m₂/m₁)', () => {
  const g = gas({ species: [He, Ar], counts: [100, 100], init: 'same', seed: 9 });
  const k0 = C.kinetic(g);
  close(k0.bySpecies[1] / k0.bySpecies[0], Ar.m / He.m, 1e-9, '起始：動能比 = 質量比');
  C.advance(g, 1500); C.takeAcc(g);
  const s = measure(g, 4000);
  close(s.KE[1] / s.KE[0], 1, 0.05, '平均動能比');
  close(s.vrms[0] / s.vrms[1], Math.sqrt(Ar.m / He.m), 0.03, 'v_rms 比');
});

test('道耳頓分壓：P = P_He + P_Ar，分壓比 = 分子數比', () => {
  const g = gas({ species: [He, Ar], counts: [150, 50], bath: true, bathT: 300, seed: 10 });
  C.advance(g, 100); C.takeAcc(g);
  const s = measure(g, 3000);
  close(s.Ps[0] + s.Ps[1], s.P, 1e-12, '總壓 = 分壓和');
  close(s.Ps[0] / s.Ps[1], 3, 0.06, '分壓比');
});

test('絕熱壓縮（準靜態）：TV^(2/3) 與 PV^(5/3) 不變（γ = 5/3），W = ΔU', () => {
  for (const [sp, L1, L2, seed] of [[He, 20, 10, 12], [Ar, 12, 24, 13]]) {
    const g = gas({ species: [sp], Lx: L1, seed: seed });
    C.advance(g, 50); C.takeAcc(g);
    const T1 = C.temperature(g), V1 = C.volume(g), e0 = C.kinetic(g).total;
    const P1 = C.idealP(200, T1, V1);
    g.piston.target = L2;
    let W = 0, Q = 0;
    while (Math.abs(g.Lx - L2) > 1e-9) {
      g.piston.vmax = 0.004 * C.vmean(C.temperature(g), sp.m);
      C.advance(g, 2);
      const a = C.takeAcc(g); W += a.W; Q += a.Q;
    }
    const V2 = C.volume(g), T2 = C.temperature(g);
    assert.strictEqual(Q, 0, '絕熱：Q = 0');
    close(W, C.kinetic(g).total - e0, 1e-10, 'W = ΔU');
    close(T2, C.adiabaticT(T1, V1, V2), 0.025, sp.id + ' TV^(2/3)');
    const s = measure(g, 1500);
    const Z = C.hardSphereZ([200], [sp.d], V2);
    close(s.P / Z, C.adiabaticP(P1, V1, V2), 0.035, sp.id + ' PV^(5/3)');
    assert.ok(L2 < L1 ? T2 > T1 : T2 < T1, '壓縮升溫、膨脹降溫');
  }
});

test('等溫壓縮（恆溫槽）：體積減半，壓力加倍（波以耳定律）', () => {
  const g = gas({ bath: true, bathT: 300, seed: 14 });
  C.advance(g, 100); C.takeAcc(g);
  const s1 = measure(g, 1500);
  g.piston.target = 10;
  while (Math.abs(g.Lx - 10) > 1e-9) { g.piston.vmax = 0.01 * C.vmean(300, He.m); C.advance(g, 2); C.takeAcc(g); }
  C.advance(g, 50); C.takeAcc(g);
  const s2 = measure(g, 1500);
  const Zr = C.hardSphereZ([200], [He.d], 4000) / C.hardSphereZ([200], [He.d], 8000);
  close(s2.P / s1.P, 2 * Zr, 0.04, 'P₂/P₁');
  within(s2.T, 300, 8, 'T 不變');
});

test('熱力學第一定律：恆溫槽＋移動活塞時，ΔU = Q + W 到捨入誤差', () => {
  const g = gas({ species: [He, Ne], counts: [100, 100], bath: true, bathT: 600, seed: 15, pistonVmax: 0.05 });
  const e0 = C.kinetic(g).total;
  let Q = 0, W = 0;
  g.piston.target = 12;
  for (let t = 0; t < 300; t++) { C.advance(g, 1); const a = C.takeAcc(g); Q += a.Q; W += a.W; }
  g.piston.target = 28;
  for (let t = 0; t < 400; t++) { C.advance(g, 1); const a = C.takeAcc(g); Q += a.Q; W += a.W; }
  close(C.kinetic(g).total - e0, Q + W, 1e-9, 'ΔU = Q + W');
  assert.ok(Q > 0 && W !== 0, 'Q 與 W 都不為零');
});

test('等壓控制：恆溫槽 300 → 450 K，體積變成 1.5 倍（查理定律）', () => {
  const g = gas({ species: [He], Lx: 15, bath: true, bathT: 300, seed: 16 });
  C.advance(g, 200); C.takeAcc(g);
  const s1 = measure(g, 600);
  g.piston.mode = 'pressure'; g.piston.Pset = s1.P; g.piston.pEma = s1.P;
  g.bath.T = 450;
  const Ls = [];
  for (let t = 0; t < 3500; t++) {
    const vb = C.vmean(C.temperature(g), He.m);
    g.piston.vmax = 0.01 * vb; g.piston.tau = 60 / vb;
    C.advance(g, 1); C.takeAcc(g);
    if (t > 1500) Ls.push(g.Lx);
  }
  const Lm = Ls.reduce(function (a, b) { return a + b; }) / Ls.length;
  const V2th = C.idealV(200, 450, s1.P) * C.hardSphereZ([200], [He.d], Lm * 400);
  close(Lm * 400, V2th, 0.03, 'V₂ = NkT₂/P');
  close(Lm / 15, 1.5, 0.05, 'V₂/V₁ ≈ T₂/T₁ = 1.5');
});

test('改變分子數、同速率起始：總數正確，同速率時總動能不變', () => {
  const g = gas({ species: [He, Ar], counts: [100, 50], seed: 17 });
  C.setCounts(g, [60, 90], 300);
  assert.deepStrictEqual(C.countBySpecies(g), [60, 90]);
  const e0 = C.kinetic(g).total;
  C.sameSpeed(g);
  close(C.kinetic(g).total, e0, 1e-12, '總動能');
  const v0 = Math.hypot(g.vx[0], g.vy[0], g.vz[0]);
  for (let i = 1; i < g.n; i++) close(Math.hypot(g.vx[i], g.vy[i], g.vz[i]), v0, 1e-12, '速率相同');
});

test('硬球壓縮因子 Z = 1 + (2π/3) n d³；混合氣體用平均直徑', () => {
  close(C.hardSphereZ([200], [0.5], 8000), 1 + (2 * Math.PI / 3) * (200 / 8000) * 0.125, 1e-12);
  close(C.hardSphereZ([100, 100], [0.4, 0.4], 8000), C.hardSphereZ([200], [0.4], 8000), 1e-12);
  close(C.hardSphereZ([0], [0.5], 8000), 1, 0);
});

console.log(`ideal-gas-core：${passed} 項通過` + (process.exitCode ? '，有失敗' : ''));
