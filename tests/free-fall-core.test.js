// 以 Node 執行：node tests/free-fall-core.test.js
'use strict';
const assert = require('assert');
const FF = require('../js/free-fall-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
const g = 9.8;
const FALL = (o) => Object.assign({ mode: 'fall', m: 0.2, f: 0, k: 0 }, o);
const INC = (o) => Object.assign({ mode: 'incline', h: 0.2, L: 1.2, m: 0.5, mu: 0, f: 0, k: 0 }, o);

console.log('free-fall-core');

test('自由落體（無阻力）：a = g，x = ½gt²，v = gt', () => {
  const mo = FF.makeMotion(FALL(), 0.9);
  assert.ok(mo.moves);
  for (const t of [0.05, 0.1, 0.25, 0.4]) {
    close(FF.xAt(mo, t), 0.5 * g * t * t, 1e-14, 'x');
    close(FF.vAt(mo, t), g * t, 1e-14, 'v');
    close(FF.aAt(mo, t), g, 1e-14, 'a');
  }
  close(mo.tEnd, Math.sqrt(2 * 0.9 / g), 1e-14, '落地時間');
  close(mo.vEnd, Math.sqrt(2 * g * 0.9), 1e-12, '落地速率 √(2gh)');
});

test('斜面（無摩擦）：a = g sinθ，sinθ = h/L', () => {
  for (const h of [0.02, 0.1, 0.3, 0.6]) {
    const F = FF.forces(INC({ h }));
    close(F.sin, h / 1.2, 1e-15, 'sinθ');
    close(F.g0, g * h / 1.2, 1e-14, 'a');
    const mo = FF.makeMotion(INC({ h }), 0.8);
    const t = 0.8 * mo.tEnd;
    close(FF.xAt(mo, t), 0.5 * g * h / 1.2 * t * t, 1e-13, 'x');
    close(mo.tEnd, Math.sqrt(2 * 0.8 / (g * h / 1.2)), 1e-13, '到擋板時間');
  }
});

test('斜面摩擦：a = g sinθ − μ g cosθ − f/M，與質量的關係', () => {
  const p = INC({ h: 0.24, mu: 0.02, f: 0.05, m: 0.8 });
  const s = 0.2, c = Math.sqrt(1 - s * s);
  close(FF.forces(p).g0, g * s - 0.02 * g * c - 0.05 / 0.8, 1e-14);
  // 軌道摩擦造成的減速與質量無關；紙帶摩擦 f/M 隨質量變小
  const a1 = FF.forces(INC({ h: 0.24, mu: 0.02, f: 0, m: 0.3 })).g0;
  const a2 = FF.forces(INC({ h: 0.24, mu: 0.02, f: 0, m: 1.7 })).g0;
  close(a1, a2, 1e-14, 'μ 項與質量無關');
  const b1 = FF.forces(FALL({ f: 0.06, m: 0.1 })).g0, b2 = FF.forces(FALL({ f: 0.06, m: 1 })).g0;
  close(g - b1, 10 * (g - b2), 1e-12, 'f/m：質量 10 倍，偏差 1/10');
});

test('起動條件：g sinθ ≤ μ g cosθ + f/M 時不動', () => {
  // tanθ = μ 恰好平衡：不動
  const mu = 0.05, s = mu / Math.sqrt(1 + mu * mu);
  const p = INC({ h: s * 1.2, mu });
  assert.ok(!FF.forces(p).moves, '恰好平衡不動');
  assert.ok(FF.forces(INC({ h: s * 1.2 * 1.01, mu })).moves, '稍微墊高就會動');
  const mo = FF.makeMotion(INC({ h: 0.01, mu: 0.02 }), 0.8);
  assert.ok(!mo.moves);
  assert.strictEqual(FF.xAt(mo, 1), 0);
  assert.strictEqual(FF.vAt(mo, 1), 0);
  // 自由落體：f 大於 mg 才會不動
  assert.ok(!FF.forces(FALL({ m: 0.01, f: 0.1 })).moves);
});

test('空氣阻力 F = kv²：解析解滿足 a = g0 − (k/m)v²，且 v 趨近終端速度', () => {
  const p = FALL({ m: 0.05, k: 0.01, f: 0.02 });
  const F = FF.forces(p);
  const mo = FF.makeMotion(p, 500);
  const kap = 0.01 / 0.05, g0 = g - 0.02 / 0.05;
  close(F.vT, Math.sqrt(g0 / kap), 1e-14, 'v_T');
  for (const t of [0.02, 0.2, 0.7, 1.5]) {
    const v = FF.vAt(mo, t), a = FF.aAt(mo, t);
    close(a, g0 - kap * v * v, 1e-12, 'a = g0 − κv²');
    // 數值微分檢查 v = dx/dt、a = dv/dt
    const h = 1e-5;
    close((FF.xAt(mo, t + h) - FF.xAt(mo, t - h)) / (2 * h), v, 1e-8, 'dx/dt');
    close((FF.vAt(mo, t + h) - FF.vAt(mo, t - h)) / (2 * h), a, 1e-7, 'dv/dt');
    // 能量：mg0·x = ½mv² + ∫kv² dx（阻力作功為正值）→ v² = (g0/κ)(1 − e^{−2κx})
    close(v * v, g0 / kap * (1 - Math.exp(-2 * kap * FF.xAt(mo, t))), 1e-12, 'v²(x)');
  }
  close(FF.vAt(mo, 10), F.vT, 1e-9, '很久以後 → 終端速度');
});

test('空氣阻力很小時趨近無阻力的結果（數值穩定）', () => {
  const p0 = FALL(), p1 = FALL({ k: 1e-9 });
  const m0 = FF.makeMotion(p0, 0.9), m1 = FF.makeMotion(p1, 0.9);
  for (const t of [1e-4, 0.01, 0.3]) {
    close(FF.xAt(m1, t), FF.xAt(m0, t), 1e-7, 'x');
    close(FF.vAt(m1, t), FF.vAt(m0, t), 1e-7, 'v');
  }
  close(m1.tEnd, m0.tEnd, 1e-7, 'tEnd');
});

test('tAtX 是 xAt 的反函數（有、無空氣阻力）', () => {
  for (const p of [FALL(), FALL({ k: 0.004, m: 0.08 }), INC({ h: 0.05, mu: 0.01, f: 0.03, k: 0.002 })]) {
    const mo = FF.makeMotion(p, 0.8);
    for (const X of [1e-6, 0.003, 0.2, 0.79]) close(FF.xAt(mo, FF.tAtX(mo, X)), X, 1e-11, 'x(t(X))');
  }
});

test('logCosh 與 acoshExp 在大小引數都準確', () => {
  for (const u of [1e-8, 1e-3, 0.5, 3, 25, 300]) {
    const ref = u < 15 ? Math.log(Math.cosh(u)) : u - Math.LN2;
    close(FF.logCosh(u), u < 1e-3 ? u * u / 2 : ref, u < 1e-3 ? 1e-6 : 1e-12, 'logCosh ' + u);
    close(FF.acoshExp(FF.logCosh(u)), u, 1e-9, 'acoshExp ' + u);
  }
});

test('紙帶：放開前重疊的點數、第一點的時刻、終點之後的點', () => {
  const mo = FF.makeMotion(FALL(), 0.9), dt = 1 / 60;
  const tp = FF.makeTape(mo, dt, 0.5, 0.2);
  assert.strictEqual(tp.nStack, 31, '0.5 s 前啟動：t = −0.5, …, 0 共 31 點重疊');
  close(tp.phase, dt, 1e-9, '剛好在放開瞬間打點：下一點在 dt');
  const tp2 = FF.makeTape(mo, dt, 0.105, 0);
  assert.strictEqual(tp2.nStack, 7);
  close(tp2.phase, 7 * dt - 0.105, 1e-12);
  assert.ok(tp2.phase > 0 && tp2.phase <= dt);
  // 點的時刻依序相差 dt，位置與解析解一致，最後一點不晚於落地
  tp2.dots.forEach((d, i) => {
    close(d.t, tp2.phase + i * dt, 1e-12);
    close(d.x, 0.5 * g * d.t * d.t, 1e-13);
  });
  const last = tp2.dots[tp2.dots.length - 1];
  assert.ok(last.t <= mo.tEnd && last.t + dt > mo.tEnd, '最後一點在落地前一個 dt 內');
  // 不動時全部重疊在起點
  const still = FF.makeTape(FF.makeMotion(INC({ h: 0.01, mu: 0.05 }), 0.8), dt, 0.3, 0.3);
  assert.strictEqual(still.dots.length, 0);
  assert.ok(still.nStack >= 36);
});

test('等加速度：每段平均速度 = 中點時刻的瞬時速度，平均加速度處處 = a（課本的方法沒有誤差）', () => {
  const p = INC({ h: 0.18, mu: 0.01, f: 0.04 });
  const mo = FF.makeMotion(p, 0.8), a = mo.g0;
  const tp = FF.makeTape(mo, 1 / 60, 0.23, 0.2);
  const j0 = FF.firstClearDot(tp);
  const pts = FF.countingPoints(tp, j0, 4), tau = 4 / 60;
  const an = FF.analyze(FF.readPoints(pts), tau);
  assert.ok(an.n >= 10);
  an.v.forEach((v, i) => close(v, FF.vAt(mo, pts[0].t + an.tv[i]), 1e-11, 'v 中點'));
  an.a.forEach((q) => close(q, a, 1e-9, 'a_av'));
  close(an.vfit.slope, a, 1e-10, 'v–t 斜率');
  close(an.vfit.intercept, FF.vAt(mo, pts[0].t), 1e-10, 'v–t 截距 = 第 0 點的速度');
  close(2 * an.xfit.c2, a, 1e-8, 'x–t 二次擬合');
  close(an.vfit.r2, 1, 1e-12, 'r² = 1');
  // 相鄰位移差 Δ(Δx) = aτ²
  for (let i = 1; i < an.dx.length; i++) close(an.dx[i] - an.dx[i - 1], a * tau * tau, 1e-9, 'Δ(Δx)');
});

test('自由落體 60 Hz、每 4 點：量得 g = 9.8（理想）', () => {
  const mo = FF.makeMotion(FALL(), 0.9);
  const tp = FF.makeTape(mo, 1 / 60, 0.3, 0.2);
  const pts = FF.countingPoints(tp, FF.firstClearDot(tp), 4);
  const an = FF.analyze(FF.readPoints(pts), 4 / 60);
  close(an.aFit, g, 1e-10);
  close(an.aMean, g, 1e-9);
});

test('用錯的 Δt 分析：量得的加速度 ∝ 1/Δt²', () => {
  const mo = FF.makeMotion(FALL(), 0.9), dt = 1 / 30;
  const tp = FF.makeTape(mo, dt, 0.1, 0);
  const xs = FF.readPoints(FF.countingPoints(tp, 2, 2));
  const a1 = FF.analyze(xs, 2 * dt).aFit, a2 = FF.analyze(xs, 2 * dt * 1.02).aFit;
  close(a1, g, 1e-10);
  close(a2, g / (1.02 * 1.02), 1e-10);
});

test('空氣阻力時 a–t 遞減，平均加速度介於前後瞬時加速度之間', () => {
  const p = FALL({ m: 0.05, k: 0.015 });
  const mo = FF.makeMotion(p, 0.9);
  const tp = FF.makeTape(mo, 1 / 60, 0.2, 0.1);
  const pts = FF.countingPoints(tp, 3, 3);
  const an = FF.analyze(FF.readPoints(pts), 3 / 60);
  for (let i = 1; i < an.a.length; i++) assert.ok(an.a[i] < an.a[i - 1], 'a 遞減');
  an.a.forEach((q, i) => {
    const t1 = pts[0].t + an.tv[i], t2 = pts[0].t + an.tv[i + 1];
    assert.ok(q <= FF.aAt(mo, t1) + 1e-9 && q >= FF.aAt(mo, t2) - 1e-9, '介於之間');
  });
});

test('讀數誤差：同一點的誤差固定、統計上標準差 = sigma、取捨到 0.1 mm', () => {
  const mo = FF.makeMotion(FALL(), 0.9);
  const tp = FF.makeTape(mo, 1 / 60, 0.2, 0);
  const pts = FF.countingPoints(tp, 3, 1);
  const r1 = FF.readPoints(pts, { sigma: 3e-4, res: 1e-4, seed: 11 });
  const r2 = FF.readPoints(pts.slice(0, 5), { sigma: 3e-4, res: 1e-4, seed: 11 });
  r2.forEach((x, i) => assert.strictEqual(x, r1[i], '同一點同一讀數'));
  assert.strictEqual(r1[0], 0, '第 0 點對齊尺的 0');
  r1.forEach((x) => close(Math.round(x * 1e4), x * 1e4, 1e-9, '0.1 mm 的整數倍'));
  let s = 0, s2 = 0; const N = 20000;
  for (let j = 0; j < N; j++) { const z = FF.dotNoise(5, j); s += z; s2 += z * z; }
  assert.ok(Math.abs(s / N) < 0.03, '平均 ≈ 0');
  assert.ok(Math.abs(Math.sqrt(s2 / N) - 1) < 0.03, '標準差 ≈ 1');
});

test('最小平方法：直線與二次曲線', () => {
  const xs = [0, 1, 2, 3, 4], ys = xs.map((x) => 3 - 2 * x);
  const L = FF.fitLine(xs, ys);
  close(L.slope, -2, 1e-14); close(L.intercept, 3, 1e-14); close(L.r2, 1, 1e-14);
  const Q = FF.fitQuad([0.1, 0.2, 0.3, 0.4, 0.5], [0.1, 0.2, 0.3, 0.4, 0.5].map((x) => 1 + 2 * x + 4.9 * x * x));
  close(Q.c0, 1, 1e-10); close(Q.c1, 2, 1e-10); close(Q.c2, 4.9, 1e-10);
  assert.strictEqual(FF.fitLine([1], [2]), null);
  assert.strictEqual(FF.fitQuad([1, 2], [2, 3]), null);
});

test('計時器 ①：點數 N 與 Δt = T/(N − 1) 的量化誤差小於 2/(N − 1)', () => {
  const dt = 1 / 60;
  for (const T of [1, 2.37, 5, 10.004]) {
    for (const ph of [0, 0.004, 0.0166]) {
      const N = FF.dotsInPull(T, dt, ph);
      // 第 N 點在 T 以前、第 N + 1 點在 T 以後
      assert.ok(ph + (N - 1) * dt <= T + 1e-9 && ph + N * dt > T - 1e-9);
      const est = FF.dtFromCount(T, N);
      assert.ok(Math.abs(est - dt) / dt < 2 / (N - 1) + 1e-9, '相對誤差 < 2/(N−1)');
    }
  }
  assert.strictEqual(FF.dotsInPull(1, dt, 0), 61, '1 s、從 t = 0 打點：61 點、60 個間隔');
  assert.strictEqual(FF.stopwatch(3.004, 0.2, 0.15), 2.95, '反應時間');
  assert.strictEqual(FF.stopwatch(3.004), 3);
});

test('手拉紙帶：速度一直大於 0、位置是速度的積分', () => {
  for (const seed of [1, 2, 99, 12345]) {
    const P = FF.handPull(seed);
    let prev = 0;
    for (let t = 0.01; t < 12; t += 0.01) {
      assert.ok(P.v(t) > 0.04, 'v > 0');
      const s = P.s(t);
      assert.ok(s > prev); prev = s;
    }
    const h = 1e-5;
    for (const t of [0.3, 2.2, 7.9]) close((P.s(t + h) - P.s(t - h)) / (2 * h), P.v(t), 1e-7, 'ds/dt');
  }
});

test('自動選第 0 點：與前一點、與起點都分得開', () => {
  const mo = FF.makeMotion(INC({ h: 0.1 }), 0.8);
  const tp = FF.makeTape(mo, 1 / 60, 0.4, 0);
  const j = FF.firstClearDot(tp);
  const d = FF.dotAt(tp, j), p = FF.dotAt(tp, j - 1);
  assert.ok(d.x >= 0.0012 && d.x - (p ? p.x : 0) >= 0.0012);
  if (j > 1) {
    const q = FF.dotAt(tp, j - 1), r = FF.dotAt(tp, j - 2);
    assert.ok(!(q.x >= 0.0012 && q.x - (r ? r.x : 0) >= 0.0012), '前一點還分不開');
  }
});

console.log(passed + ' 項通過');
