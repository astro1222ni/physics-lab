// 以 Node 執行：node tests/ac-generator-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/ac-generator-core.js');

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
const TAU = 2 * Math.PI;
/** 一個週期內的數值平均（中點法） */
function avgOver(fn, n) { let s = 0; for (let k = 0; k < n; k++) s += fn(TAU * (k + 0.5) / n); return s / n; }

const G0 = { N: 100, B: 0.2, L: 0.2, w: 0.1, f: 10, R: 20, r: 2, commutator: false };

// ======================= 發電機 =======================
test('電動勢峰值 ε_max = NBAω（N 100、B 0.2 T、A 0.02 m²、f 10 Hz → 25.13 V）', () => {
  const g = C.gen(G0);
  close(g.A, 0.02, 1e-12);
  close(g.omega, TAU * 10, 1e-12);
  close(g.epsMax, 100 * 0.2 * 0.02 * TAU * 10, 1e-12);
  near(g.epsMax, 25.1327, 1e-3);
  close(g.epsRms, g.epsMax / Math.SQRT2, 1e-12);
});
test('ε = −N dΦ/dt：用 Φ 的數值微分驗證（θ = ωt）', () => {
  const g = C.gen(G0), h = 1e-7;
  for (let k = 0; k < 24; k++) {
    const t = k * 0.0041;
    const th = C.thetaAt(g, t, 0.3);
    const dPhi = (C.genAt(g, C.thetaAt(g, t + h, 0.3)).phi - C.genAt(g, C.thetaAt(g, t - h, 0.3)).phi) / (2 * h);
    near(C.genAt(g, th).eps, -g.N * dPhi, 1e-5 * g.epsMax, 't = ' + t);
  }
});
test('另一個觀點：兩條長邊以 v = ωw/2 切割磁力線，ε = 2NBLv sin θ 與 NBAω sin θ 相同', () => {
  [G0, { N: 7, B: 0.9, L: 0.37, w: 0.05, f: 60, R: 5, r: 0.1 }, { N: 500, B: 0.01, L: 0.05, w: 0.4, f: 0.5, R: Infinity, r: 1 }].forEach(p => {
    const g = C.gen(p);
    close(g.v, g.omega * p.w / 2, 1e-12);
    for (let k = 0; k < 36; k++) { const s = C.genAt(g, k * 0.37); near(s.epsSides, s.eps, 1e-12 * g.epsMax + 1e-15); }
  });
});
test('Φ 最大（θ = 0）時 ε = 0；Φ = 0（θ = 90°）時 ε 最大：相差 90°', () => {
  const g = C.gen(G0);
  const a = C.genAt(g, 0), b = C.genAt(g, Math.PI / 2), c = C.genAt(g, Math.PI), d = C.genAt(g, 1.5 * Math.PI);
  close(a.phi, g.phiMax, 1e-12); near(a.eps, 0, 1e-12);
  near(b.phi, 0, 1e-15); close(b.eps, g.epsMax, 1e-12);
  close(c.phi, -g.phiMax, 1e-12); near(c.eps, 0, 1e-12);
  close(d.eps, -g.epsMax, 1e-12);
});
test('有效值：數值平均 √⟨ε²⟩ = ε_max/√2；換向器的平均值 ⟨|ε|⟩ = 2ε_max/π、有效值不變', () => {
  const g = C.gen(G0), gc = C.gen(Object.assign({}, G0, { commutator: true }));
  const rms = Math.sqrt(avgOver(th => C.genAt(g, th).eps ** 2, 20000));
  close(rms, g.epsRms, 1e-6);
  near(avgOver(th => C.genAt(g, th).out, 20000), 0, 1e-9 * g.epsMax, '滑環輸出的平均');
  close(avgOver(th => C.genAt(gc, th).out, 20000), gc.epsAvgDC, 1e-6);
  close(Math.sqrt(avgOver(th => C.genAt(gc, th).out ** 2, 20000)), gc.epsRms, 1e-6);
  for (let k = 0; k < 50; k++) assert.ok(C.genAt(gc, k * 0.13).out >= -1e-12, '換向器輸出不可為負');
});
test('電流 i = ε/(R + r)、與 ε 同相；負載電壓 iR、有效值 V_R = ε_rms R/(R + r)', () => {
  const g = C.gen(G0);
  for (let k = 0; k < 20; k++) {
    const s = C.genAt(g, k * 0.29);
    close(s.i, s.eps / 22, 1e-12);
    close(s.vR, s.i * 20, 1e-12);
  }
  close(g.VRrms, g.epsRms * 20 / 22, 1e-12);
  close(g.iRms, g.epsRms / 22, 1e-12);
});
test('能量守恆：每一瞬間外力的機械功率 τω = 電功率 i²(R + r)（滑環與換向器都一樣）', () => {
  [false, true].forEach(cm => {
    const g = C.gen(Object.assign({}, G0, { commutator: cm }));
    for (let k = 0; k < 60; k++) {
      const s = C.genAt(g, k * 0.11);
      near(s.pMech, s.i * s.i * (g.R + g.r), 1e-12 * g.Pavg * 4 + 1e-15);
      near(s.p, s.pMech, 1e-12 * g.Pavg * 4 + 1e-15);
      assert.ok(s.tau >= -1e-15, '力矩永遠阻礙轉動（τ ≥ 0）');
    }
  });
});
test('冷次定律：力矩 τ = NiAB sin θ，峰值 ε_max²/((R + r)ω)，平均 = 峰值的一半', () => {
  const g = C.gen(G0);
  close(g.tauMax, g.epsMax * g.epsMax / ((g.R + g.r) * g.omega), 1e-12);
  close(C.genAt(g, Math.PI / 2).tau, g.tauMax, 1e-12);
  close(avgOver(th => C.genAt(g, th).tau, 20000), g.tauMax / 2, 1e-6);
  close(g.tauAvg * g.omega, g.Pavg, 1e-12);
});
test('一個週期內，外力作的功 ∫τω dt = 電阻上的焦耳熱 ∫i²(R + r) dt = P_avg × T', () => {
  const g = C.gen({ N: 250, B: 0.35, L: 0.12, w: 0.08, f: 3, R: 7, r: 1.5 });
  const n = 40000, dt = g.period / n;
  let Wm = 0, Q = 0;
  for (let k = 0; k < n; k++) {
    const s = C.genAt(g, C.thetaAt(g, (k + 0.5) * dt, 0));
    Wm += s.tau * g.omega * dt; Q += s.i * s.i * (g.R + g.r) * dt;
  }
  close(Wm, Q, 1e-9);
  close(Q, g.Pavg * g.period, 1e-6);
});
test('開路（R → ∞）：沒有電流、不需要力矩，負載兩端電壓就是 ε', () => {
  const g = C.gen(Object.assign({}, G0, { R: Infinity }));
  assert.ok(g.open);
  assert.strictEqual(g.tauMax, 0); assert.strictEqual(g.Pavg, 0); assert.strictEqual(g.iRms, 0);
  close(g.VRrms, g.epsRms, 1e-12);
  const s = C.genAt(g, 1);
  assert.strictEqual(s.tau, 0); close(s.vR, s.eps, 1e-12);
  // R 越大越好轉：力矩峰值隨 R 單調下降
  let prev = Infinity;
  [1, 3, 10, 30, 100, 1000, 1e4].forEach(R => { const t = C.gen(Object.assign({}, G0, { R })).tauMax; assert.ok(t < prev); prev = t; });
});
test('最大功率轉移：負載得到的平均功率在 R = r 時最大，等於 ε_rms²/(4r)', () => {
  const r = 3.7, base = Object.assign({}, G0, { r });
  const best = C.gen(Object.assign({}, base, { R: r }));
  close(best.PR, best.epsRms ** 2 / (4 * r), 1e-12);
  for (let R = 0.2; R < 60; R *= 1.07) {
    if (Math.abs(R - r) < 1e-9) continue;
    assert.ok(C.gen(Object.assign({}, base, { R })).PR <= best.PR + 1e-12, 'R = ' + R);
  }
});
test('角度換算：degNorm 落在 0–360°', () => {
  near(C.degNorm(Math.PI / 2), 90, 1e-12);
  near(C.degNorm(-Math.PI / 2), 270, 1e-12);
  near(C.degNorm(5 * Math.PI), 180, 1e-9);
});

// ======================= 變壓器 =======================
test('理想變壓器：V2/V1 = N2/N1、I1V1 = I2V2、等效電阻 (N1/N2)² R_L', () => {
  [[200, 400, 110, 50], [500, 60, 110, 6], [100, 100, 230, 1000], [37, 913, 12, 4700]].forEach(([N1, N2, V1, RL]) => {
    const o = C.xf({ N1, N2, RL, source: 'ac', V1, f: 60 });
    close(o.V2 / o.V1, N2 / N1, 1e-12);
    close(o.P1, o.P2, 1e-12);
    close(o.I1 / o.I2, N2 / N1, 1e-12);
    close(o.Req, (N1 / N2) ** 2 * RL, 1e-12);
    close(o.V1 / o.I1, o.Req, 1e-12, '一次側看到的電阻');
  });
});
test('變壓器瞬時值：v1、v2 同相，振幅比 = 匝數比；鐵心磁通量 = (1/N1)∫v1 dt', () => {
  const o = C.xf({ N1: 220, N2: 110, RL: 10, source: 'ac', V1: 110, f: 60 });
  const n = 20000, T = 1 / 60, dt = T / n;
  let phi = C.xf({ N1: 220, N2: 110, RL: 10, source: 'ac', V1: 110, f: 60 }).at(0).phi;
  let maxPhi = 0;
  for (let k = 0; k < n; k++) {
    const t = k * dt;
    const s = o.at(t), s2 = o.at(t + dt);
    phi += (s.v1 + s2.v1) / 2 * dt / o.N1;
    maxPhi = Math.max(maxPhi, Math.abs(phi));
    near(s.v2, s.v1 * 0.5, 1e-9);
    near(phi, s2.phi, 1e-6 * o.phiCore, 't = ' + t);
  }
  close(maxPhi, Math.SQRT2 * 110 / (220 * 2 * Math.PI * 60), 1e-4);
  close(o.phiCore, maxPhi, 1e-4);
});
test('飽和提醒：頻率太低或一次線圈匝數太少時，鐵心磁通密度峰值超過 1.7 T', () => {
  assert.ok(!C.xf({ N1: 200, N2: 400, RL: 50, source: 'ac', V1: 110, f: 60 }).sat);
  assert.ok(C.xf({ N1: 50, N2: 100, RL: 50, source: 'ac', V1: 110, f: 60 }).sat);
  assert.ok(C.xf({ N1: 200, N2: 400, RL: 50, source: 'ac', V1: 110, f: 5 }).sat);
  // 磁通密度與 V1/(N1 f) 成正比
  const a = C.xf({ N1: 300, N2: 300, RL: 9, source: 'ac', V1: 100, f: 50 }), b = C.xf({ N1: 600, N2: 300, RL: 9, source: 'ac', V1: 100, f: 50 });
  close(a.Bcore / b.Bcore, 2, 1e-12);
});
test('接發電機：一次側電壓 = ε_rms × R′/(R′ + r)（用電路解），能量守恆', () => {
  const g = C.gen({ N: 300, B: 0.5, L: 0.2, w: 0.1, f: 60, R: 50, r: 4 });
  const o = C.xf({ N1: 200, N2: 400, RL: 120, source: 'gen', gen: g });
  const Rp = (200 / 400) ** 2 * 120;
  close(o.V1, g.epsRms * Rp / (Rp + 4), 1e-12);
  close(o.f, 60, 1e-12);
  close(o.Pgen, o.P2 + (o.V1 / Rp) ** 2 * 4, 1e-12, '發電機總功率 = 負載 + 線圈發熱');
});
test('直流不能變壓：接通後 v2 只有短暫脈衝，t ≫ τ 時趨近 0；穩態 I1 = V/R1', () => {
  const d = C.dcStep({ N1: 200, N2: 400, RL: 50, V: 12 });
  const s0 = d.on(0), sEnd = d.on(20 * d.tau);
  close(s0.v2, d.v2Peak, 1e-12);
  assert.ok(Math.abs(sEnd.v2) < 1e-8 * d.v2Peak, '穩態二次側電壓');
  close(sEnd.i1, 12 / d.R1, 1e-8);
  close(sEnd.im, 12 / d.R1, 1e-8);
  // 單調衰減
  let prev = Infinity;
  for (let k = 0; k <= 30; k++) { const v = d.on(k * d.tau / 5).v2; assert.ok(v < prev + 1e-12); prev = v; }
  const o = C.xf({ N1: 200, N2: 400, RL: 50, source: 'dc', V1: 12 });
  assert.strictEqual(o.V2, 0); close(o.I1, 12 / o.R1, 1e-12);
});
test('直流暫態：∫v_p dt = Lm Δi_m（法拉第定律：感應電動勢的積分 = 磁通鏈的改變），切斷時反向', () => {
  const d = C.dcStep({ N1: 300, N2: 150, RL: 8, V: 24 });
  const n = 200000, Tend = 25 * d.tau, dt = Tend / n;
  let S = 0;
  for (let k = 0; k < n; k++) S += d.on((k + 0.5) * dt).vp * dt;
  close(S, d.Lm * d.imFinal, 1e-6);
  // 數值驗證電路方程：V − R1 i1 = v_p、i1 = i_m + v_p/R′、v_p = Lm di_m/dt
  for (let k = 1; k < 20; k++) {
    const t = k * d.tau / 7, s = d.on(t), h = d.tau * 1e-6;
    near(24 - d.R1 * s.i1, s.vp, 1e-9 * 24);
    near(s.i1, s.im + s.vp / d.Rp, 1e-9 * d.imFinal);
    close(d.Lm * (d.on(t + h).im - d.on(t - h).im) / (2 * h), s.vp, 1e-5);
  }
  // 切斷：磁化電流經負載放掉，v_p 反向，積分 = −Lm i_m0
  const im0 = d.on(Tend).im;
  const off0 = d.off(0, im0);
  assert.ok(off0.vp < 0 && off0.v2 < 0);
  let S2 = 0; const n2 = 200000, dt2 = 25 * d.tauOff / n2;
  for (let k = 0; k < n2; k++) S2 += d.off((k + 0.5) * dt2, im0).vp * dt2;
  close(S2, -d.Lm * im0, 1e-6);
});
test('直流暫態的時間常數：τ = Lm(R1 + R′)/(R1 R′)，接通瞬間 v_p = V R′/(R1 + R′)', () => {
  const d = C.dcStep({ N1: 150, N2: 50, RL: 2, V: 6 });
  const Rp = 9 * 2, R1 = C.CORE.rhoN * 150, Lm = C.CORE.perm * 150 * 150;
  close(d.tau, Lm * (R1 + Rp) / (R1 * Rp), 1e-12);
  close(d.on(0).vp, 6 * Rp / (R1 + Rp), 1e-12);
  close(d.on(d.tau).vp, 6 * Rp / (R1 + Rp) / Math.E, 1e-12);
  close(Lm, C.MU0 * 2000 * 25e-4 / 0.4 * 150 * 150, 1e-12);
});

// ======================= 遠距輸電 =======================
const P0 = { Vg: 11000, k1: 15, Rline: 20, k2: 1500, Prated: 20e6, Vrated: 110 };
test('輸電：能量守恆 P_g = P_u + I²R_line，送電端功率 = V_L I_L', () => {
  [P0, Object.assign({}, P0, { k1: 1, k2: 100 }), Object.assign({}, P0, { Rline: 1, k2: 3136, k1: 31.4, Vrated: 220, Prated: 5e7 })].forEach(p => {
    const q = C.grid(p);
    close(q.Pg, q.Pu + q.Ploss, 1e-12);
    close(q.Pg, q.VL * q.IL, 1e-12);
    close(q.Pg, p.Vg * q.Ig, 1e-12, '發電機端');
    close(q.Pu, q.Vu * q.Vu / q.Ru, 1e-12);
    close(q.VL, q.drop + q.Vrecv, 1e-12, '克希何夫電壓定律');
    close(q.eff, q.Rref / (q.Rline + q.Rref), 1e-12);
  });
});
test('輸電：k1 = k2 = 1、R_line = 0 時，用戶電壓 = 發電機電壓、效率 100%', () => {
  const q = C.grid({ Vg: 110, k1: 1, k2: 1, Rline: 0, Prated: 1000, Vrated: 110 });
  close(q.Vu, 110, 1e-12); close(q.eff, 1, 1e-12); close(q.Pu, 1000, 1e-12);
});
test('輸電：用戶端電壓大致不變時，升壓比加倍 → 線電流約減半、線損約四分之一', () => {
  // 兩者都調 k2 讓用戶電壓剛好 110 V：用戶功率完全相同
  const pa = Object.assign({}, P0, { k1: 15 }), pb = Object.assign({}, P0, { k1: 30 });
  pa.k2 = C.k2For(pa, 110); pb.k2 = C.k2For(pb, 110);
  const a = C.grid(pa), b = C.grid(pb);
  close(b.Pu, a.Pu, 1e-9);
  close(b.IL / a.IL, 0.5, 0.03);
  close(b.Ploss / a.Ploss, 0.25, 0.06);
  // 同一個用戶功率下 I_L = P_g / V_L，線電流的比值 = (P_g 的比值)/2
  close(b.IL / a.IL, (b.Pg / a.Pg) / 2, 1e-9);
  // 精確關係：I_L ∝ k1/(R_line + k2²R_u)
  close(b.IL / a.IL, (30 / 15) * (20 + pa.k2 ** 2 * a.Ru) / (20 + pb.k2 ** 2 * a.Ru), 1e-12);
});
test('輸電：k2For 求出的降壓比使用戶電壓剛好等於目標；目標太高時無解', () => {
  const k2 = C.k2For(P0, 110);
  close(C.grid(Object.assign({}, P0, { k2 })).Vu, 110, 1e-9);
  // 兩個根中取的是 k2 較大、效率較高的那一個
  assert.ok(C.grid(Object.assign({}, P0, { k2 })).eff > 0.5);
  assert.strictEqual(C.k2For(Object.assign({}, P0, { k1: 1 }), 110), null, '不升壓時線損太大，送不出 110 V');
});
test('輸電：R_line → 0 時效率 → 100%；R_line 越大效率越低', () => {
  let prev = 1 + 1e-12;
  [0, 0.1, 1, 10, 50, 100].forEach(Rl => { const e = C.grid(Object.assign({}, P0, { Rline: Rl })).eff; assert.ok(e <= prev); prev = e; });
  close(C.grid(Object.assign({}, P0, { Rline: 0 })).eff, 1, 1e-12);
});

console.log(`\n${passed} 項通過${process.exitCode ? '，有失敗' : ''}`);
