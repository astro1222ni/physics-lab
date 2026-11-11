// 以 Node 執行：node tests/radioactive-decay-core.test.js
'use strict';
const assert = require('assert');
const D = require('../js/radioactive-decay-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
function within(a, b, abs, msg) {
  assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`);
}
/** 用固定的 dt 跑到時間 t（最後一步補足） */
function runTo(sim, t, dt, out) {
  while (sim.t < t - 1e-12) D.step(sim, Math.min(dt, t - sim.t), out);
  return sim;
}

console.log('radioactive-decay-core');

test('λ = ln2/T½、τ = 1/λ = T½/ln2、互為反函數', () => {
  for (const T of [0.5, 1, 3, 8.02, 5730]) {
    const l = D.lambdaOf(T);
    close(l, Math.LN2 / T, 1e-15, 'λ');
    close(D.meanLife(T), 1 / l, 1e-14, 'τ');
    close(D.halfLifeOf(l), T, 1e-14, 'T½');
  }
});

test('理論曲線 N0(1/2)^(t/T½) = N0 e^(−λt)，每過一個半衰期減半', () => {
  for (const T of [0.7, 3, 8.02]) {
    for (const t of [0, 0.3, 2.2, 11]) close(D.theoryN(1000, T, t), 1000 * Math.exp(-D.lambdaOf(T) * t), 1e-13);
    for (let k = 0; k <= 6; k++) close(D.theoryN(1600, T, k * T), 1600 / Math.pow(2, k), 1e-13);
  }
});

test('每步衰變機率是精確的 1 − e^(−λΔt)：兩個半步 = 一個整步（存活機率相乘）', () => {
  for (const T of [0.5, 3, 20]) {
    const l = D.lambdaOf(T);
    for (const dt of [1e-6, 0.01, 0.4, 3, 50]) {
      const half = D.stepProb(l, dt / 2), full = D.stepProb(l, dt);
      close((1 - half) * (1 - half), 1 - full, 1e-14, '存活');
      close(1 - (1 - half) * (1 - half), full, 1e-12, '衰變');
    }
  }
});

test('極限：Δt → 0 時 p ≈ λΔt；Δt → ∞ 時 p → 1；Δt = T½ 時 p = 1/2', () => {
  const l = D.lambdaOf(2);
  close(D.stepProb(l, 1e-9) / (l * 1e-9), 1, 1e-8, 'λΔt');
  close(D.stepProb(l, 1e4), 1, 1e-15, '→ 1');
  close(D.stepProb(l, 2), 0.5, 1e-15, '一個半衰期');
});

test('衰變鏈轉移矩陣滿足 M(Δt/2)² = M(Δt)（任何步長都精確）', () => {
  const cases = [[3, 1], [1, 3], [2, 2], [65.94, 6.01], [5, 4.999999]];
  for (const [T1, T2] of cases) {
    for (const dt of [0.05, 0.8, 4]) {
      const h = D.transition(T1, T2, dt / 2), f = D.transition(T1, T2, dt);
      // 母核：兩個半步後仍是母核／變子核／變穩定核
      const pp = h.pp * h.pp;
      const pd = h.pp * h.pd + h.pd * h.dd;
      const ps = h.pp * h.ps + h.pd * h.ds + h.ps;
      close(pp, f.pp, 1e-12, 'pp'); close(pd, f.pd, 1e-9, 'pd'); close(ps, f.ps, 1e-9, 'ps');
      close(h.dd * h.dd, f.dd, 1e-12, 'dd');
      close(f.pp + f.pd + f.ps, 1, 1e-14, '母核機率和');
      close(f.dd + f.ds, 1, 1e-14, '子核機率和');
    }
  }
});

test('同一個種子 → 完全相同的結果；不同種子 → 不同結果', () => {
  const a = runTo(D.createSim({ N0: 1600, halfLife: 3, seed: 7 }), 6, 0.05);
  const b = runTo(D.createSim({ N0: 1600, halfLife: 3, seed: 7 }), 6, 0.05);
  const c = runTo(D.createSim({ N0: 1600, halfLife: 3, seed: 8 }), 6, 0.05);
  assert.strictEqual(a.nP, b.nP);
  assert.deepStrictEqual(Array.from(a.state), Array.from(b.state));
  assert.notDeepStrictEqual(Array.from(a.state), Array.from(c.state));
});

test('經過一個半衰期，大量原子核約剩一半（N = 100 000，誤差 < 4σ）', () => {
  const N0 = 100000, sigma = Math.sqrt(N0 * 0.25);
  for (const seed of [1, 2, 3]) {
    const s = runTo(D.createSim({ N0, halfLife: 3, seed }), 3, 3 / 50);
    within(s.nP, N0 / 2, 4 * sigma, '剩餘數');
  }
});

test('步長不影響統計：Δt = T½ 一步、Δt = T½/2 兩步、Δt = T½/100 一百步，平均都剩 1/2', () => {
  const N0 = 2000, trials = 60, T = 1;
  for (const n of [1, 2, 100]) {
    const fr = [];
    for (let k = 0; k < trials; k++) fr.push(runTo(D.createSim({ N0, halfLife: T, seed: 1000 * n + k }), T, T / n).nP / N0);
    const m = D.meanStd(fr).mean;
    within(m, 0.5, 4 * Math.sqrt(0.25 / N0 / trials), `${n} 步的平均`);
  }
});

test('剩餘數的漲落符合二項分布：標準差 = √(N0 p(1−p))', () => {
  const N0 = 400, trials = 400, xs = [];
  for (let k = 0; k < trials; k++) xs.push(runTo(D.createSim({ N0, halfLife: 2, seed: 50 + k }), 2, 0.1).nP);
  const ms = D.meanStd(xs);
  within(ms.mean, 200, 4 * 10 / Math.sqrt(trials), '平均');
  close(ms.std, 10, 0.15, '標準差');
});

test('指數擬合：理想資料完全還原 λ；模擬資料（N = 10 000，跑 5 個半衰期）誤差 < 2%', () => {
  const ts = [], Ns = [];
  for (let i = 0; i <= 40; i++) { ts.push(i * 0.25); Ns.push(D.theoryN(5000, 2.5, i * 0.25)); }
  const f = D.fitExponential(ts, Ns);
  close(f.lambda, D.lambdaOf(2.5), 1e-12, 'λ'); close(f.N0, 5000, 1e-10, 'N0'); close(f.halfLife, 2.5, 1e-12, 'T½');
  for (const seed of [11, 12, 13]) {
    const s = D.createSim({ N0: 10000, halfLife: 3, seed }), t2 = [], n2 = [];
    t2.push(0); n2.push(s.nP);
    while (s.t < 15 - 1e-9) { D.step(s, 0.05); t2.push(s.t); n2.push(s.nP); }
    const g = D.fitExponential(t2, n2, 5);
    close(g.lambda, D.lambdaOf(3), 0.02, '擬合 λ');
  }
});

test('骰子比喻：p = 1/6、λ = ln(6/5)、T½ = ln2/ln(6/5) ≈ 3.80 次；平均剩 N0(5/6)^n', () => {
  close(D.DICE_HALF, Math.LN2 / Math.log(1.2), 1e-15);
  within(D.DICE_HALF, 3.8018, 1e-4);
  close(D.stepProb(D.DICE_LAMBDA, 1), 1 / 6, 1e-14, '等效每擲機率');
  const n = 6, trials = 200, N0 = 400, xs = [];
  for (let k = 0; k < trials; k++) { const s = D.createDice({ N0, seed: 300 + k }); for (let j = 0; j < n; j++) D.roll(s); xs.push(s.nP); }
  const exp = D.diceTheory(N0, n), p = Math.pow(5 / 6, n);
  within(D.meanStd(xs).mean, exp, 4 * Math.sqrt(N0 * p * (1 - p) / trials), '平均剩餘');
  const s = D.createDice({ N0: 100, seed: 3 });
  assert.ok(Array.from(s.face).every(v => v >= 1 && v <= 5), '開始時沒有 6 點');
  D.roll(s);
  for (let i = 0; i < 100; i++) assert.strictEqual(s.state[i] === 2, s.face[i] === 6, '擲出 6 點才衰變');
});

test('衰變鏈守恆：每一步 P + D + S = N0，且狀態陣列計數一致', () => {
  const s = D.createSim({ N0: 1600, halfLife: 3, halfLife2: 1, seed: 5 });
  const ev = D.events(1600 * 2);
  let decays = 0;
  for (let k = 0; k < 300; k++) {
    decays += D.step(s, 0.07 + 0.05 * (k % 3), ev);
    assert.strictEqual(s.nP + s.nD + s.nS, 1600);
    assert.strictEqual(ev.n <= 3200, true);
  }
  let c = [0, 0, 0];
  for (const v of s.state) c[v]++;
  assert.deepStrictEqual(c, [s.nP, s.nD, s.nS]);
  // 衰變次數 = 母核衰變數 + 子核衰變數 = (N0 − P) + S
  assert.strictEqual(decays, (1600 - s.nP) + s.nS);
  assert.strictEqual(s.decays, decays);
});

test('Bateman 解：與數值積分（RK4）一致，P + D + S = N0', () => {
  for (const [T1, T2] of [[3, 1], [1, 3], [65.94, 6.01], [2, 2]]) {
    const l1 = Math.LN2 / T1, l2 = Math.LN2 / T2;
    let P = 1000, Dd = 0, t = 0;
    const h = Math.min(T1, T2) / 2000;
    const f = (p, d) => [-l1 * p, l1 * p - l2 * d];
    while (t < 4 * Math.max(T1, T2) - 1e-12) {
      const k1 = f(P, Dd), k2 = f(P + h / 2 * k1[0], Dd + h / 2 * k1[1]);
      const k3 = f(P + h / 2 * k2[0], Dd + h / 2 * k2[1]), k4 = f(P + h * k3[0], Dd + h * k3[1]);
      P += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      Dd += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      t += h;
    }
    const b = D.bateman(1000, T1, T2, t);
    close(b.P, P, 1e-8, 'P'); close(b.D, Dd, 1e-8, 'D');
    close(b.P + b.D + b.S, 1000, 1e-13, '總數');
  }
});

test('Bateman 解的極限：λ1 = λ2 的退化公式連續；T½子 → 0 時 D → 0；沒有衰變鏈時 S = N0 − P', () => {
  const a = D.bateman(1, 2, 2, 3.3), b = D.bateman(1, 2, 2 * (1 + 1e-7), 3.3);
  close(a.D, b.D, 1e-6, '退化');
  assert.ok(D.bateman(1000, 5, 1e-6, 2).D < 1e-3, '子核極短命');
  const c = D.bateman(1000, 5, null, 7);
  close(c.D, 0, 1e-15); close(c.S, 1000 - D.theoryN(1000, 5, 7), 1e-12);
});

test('子核數量最大的時刻 t_max = ln(λ2/λ1)/(λ2 − λ1)（相等時為 τ），該處 dD/dt = 0', () => {
  for (const [T1, T2] of [[3, 1], [1, 3], [65.94, 6.01], [2, 2]]) {
    const tm = D.daughterPeakTime(T1, T2), e = 1e-5 * tm;
    const Dm = D.bateman(1, T1, T2, tm).D;
    assert.ok(Dm >= D.bateman(1, T1, T2, tm - e).D && Dm >= D.bateman(1, T1, T2, tm + e).D, '最大值');
  }
  close(D.daughterPeakTime(2, 2), 2 / Math.LN2, 1e-12, 'λ 相等 → τ');
  close(D.daughterPeakTime(65.94, 6.01), 22.852, 1e-4, '鉬-99 → 鎝-99m');
});

test('暫態平衡：T½子 < T½母時，長時間後 D/P → T½子/(T½母 − T½子)，A_D/A_P → λ2/(λ2 − λ1)', () => {
  const T1 = 65.94, T2 = 6.01, t = 300;
  const b = D.bateman(1, T1, T2, t), A = D.chainActivity(1, T1, T2, t);
  close(b.D / b.P, D.equilibriumRatio(T1, T2), 1e-9, 'D/P');
  const l1 = Math.LN2 / T1, l2 = Math.LN2 / T2;
  close(A.AD / A.AP, l2 / (l2 - l1), 1e-9, '活度比');
  assert.strictEqual(D.equilibriumRatio(1, 3), null, '子核較長命時沒有平衡');
});

test('模擬的平均 = Bateman 解（衰變鏈，100 次 × 1000 個）', () => {
  const T1 = 3, T2 = 1.2, t = 4, trials = 100, N0 = 1000;
  const Ps = [], Ds = [];
  for (let k = 0; k < trials; k++) {
    const s = runTo(D.createSim({ N0, halfLife: T1, halfLife2: T2, seed: 900 + k }), t, 0.37);
    Ps.push(s.nP); Ds.push(s.nD);
  }
  const b = D.bateman(N0, T1, T2, t);
  within(D.meanStd(Ps).mean, b.P, 4 * Math.sqrt(b.P / trials), 'P');
  within(D.meanStd(Ds).mean, b.D, 4 * Math.sqrt(b.D / trials), 'D');
});

test('活度 = λN（期望值）：短時間內的衰變數 / Δt 的平均 ≈ λN', () => {
  const N0 = 10000, T = 4, l = D.lambdaOf(T), dt = 0.01, steps = 200;
  const s = D.createSim({ N0, halfLife: T, seed: 77 });
  let sumRate = 0, sumLN = 0;
  for (let k = 0; k < steps; k++) {
    const N = s.nP;
    sumLN += D.activity(l, N);
    sumRate += D.step(s, dt) / dt;
  }
  // 期望每步衰變數 N(1 − e^(−λΔt))，總衰變數為 Poisson 近似，標準差 √(總數)
  const total = sumRate * dt, expected = sumLN * dt * (D.stepProb(l, dt) / (l * dt));
  within(total, expected, 4 * Math.sqrt(expected), '總衰變數');
  close(sumRate / steps, sumLN / steps, 4 / Math.sqrt(expected), '平均活度');
  const A = D.chainActivity(N0, T, null, 2);
  close(A.A, l * D.theoryN(N0, T, 2), 1e-14, '理論活度');
});

test('衰變時刻抽樣落在這一步之內（只供音效與閃光）', () => {
  const s = D.createSim({ N0: 2000, halfLife: 1, halfLife2: 0.5, seed: 4 }), ev = D.events(4000);
  D.step(s, 0.8, ev);
  assert.ok(ev.n > 0);
  for (let k = 0; k < ev.n; k++) assert.ok(ev.at[k] >= 0 && ev.at[k] <= 0.8 + 1e-12, '時刻 ' + ev.at[k]);
});

console.log(passed + ' 項通過');
