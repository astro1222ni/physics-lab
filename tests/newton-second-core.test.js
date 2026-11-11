// 以 Node 執行：node tests/newton-second-core.test.js
'use strict';
const assert = require('assert');
const NS = require('../js/newton-second-core.js');

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
const rad = (d) => d * Math.PI / 180;
const P = (o) => Object.assign({ M: 0.5, m: 0.05, mu: 0.02, theta: 0, attached: true }, o);
const CASES = [{}, { M: 1.2, m: 0.2, mu: 0 }, { M: 0.2, m: 0.8, mu: 0.05, theta: rad(3) },
  { M: 2, m: 0.01, mu: 0.004, theta: rad(0.5) }, { M: 0.75, m: 0.125, mu: 0.1, theta: rad(6) }];

console.log('newton-second-core');

test('加速度 a = (mg + Mg sinθ − μMg cosθ)/(M + m)（解析解）', () => {
  for (const o of CASES) {
    const p = P(o), d = NS.dynamics(p);
    const a = (p.m * g + p.M * g * Math.sin(p.theta) - p.mu * p.M * g * Math.cos(p.theta)) / (p.M + p.m);
    close(d.aMove, a, 1e-14, 'aMove');
    close(NS.accel(p), a > 0 ? a : 0, 1e-14, 'accel');
  }
});

test('水平無傾角：a = (mg − f)/(M + m)，f = μMg', () => {
  const p = P({ M: 0.5, m: 0.05, mu: 0.02 });
  close(NS.accel(p), (0.05 * g - 0.02 * 0.5 * g) / 0.55, 1e-14);
  close(NS.dynamics(p).f, 0.02 * 0.5 * g, 1e-14, 'f');
  close(NS.dynamics(p).N, 0.5 * g, 1e-14, 'N = Mg');
});

test('張力 T = m(g − a) = Ma + f − Mg sinθ，且兩個物體各自滿足 F = ma', () => {
  for (const o of CASES) {
    const p = P(o), d = NS.dynamics(p), a = d.aMove, T = NS.tension(p);
    close(T, p.m * (g - a), 1e-13, 'T = m(g − a)');
    close(T, p.M * a + d.f - d.Wpar, 1e-12, 'T = Ma + f − Mg sinθ');
    close(T + d.Wpar - d.f, p.M * a, 1e-12, '小車：T + Mg sinθ − f = Ma');
    close(p.m * g - T, p.m * a, 1e-12, '吊掛物：mg − T = ma');
    assert.ok(T < p.m * g, 'T < mg（吊掛物向下加速）');
  }
});

test('摩擦已平衡（tanθ = μ）：a = mg/(M + m)、T = Ma，近似誤差 (mg − T)/mg = m/(M + m)', () => {
  for (const [M, m, mu] of [[0.5, 0.05, 0.02], [1.5, 0.3, 0.045], [0.2, 0.01, 0.1]]) {
    const p = P({ M, m, mu, theta: NS.balanceAngle(mu) });
    close(NS.accel(p), m * g / (M + m), 1e-13, 'a');
    close(NS.tension(p), M * NS.accel(p), 1e-12, 'T = Ma');
    close(NS.approxError(p), m / (M + m), 1e-12, '近似誤差');
  }
});

test('平衡摩擦力的角度 tanθ = μ：取下吊鉤推一下 → a = 0（等速）；角度太小減速、太大加速', () => {
  for (const mu of [0.005, 0.02, 0.045, 0.1]) {
    const th = NS.balanceAngle(mu);
    close(Math.tan(th), mu, 1e-14, 'tanθ');
    const d = NS.dynamics(P({ mu, theta: th, attached: false }));
    assert.ok(Math.abs(d.aMove) < 1e-15, '平衡時 a = 0，得到 ' + d.aMove);
    close(NS.dynamics(P({ mu, theta: th, attached: false, M: 1.7 })).aMove, 0, 1e-14, '與 M 無關');
    assert.ok(NS.dynamics(P({ mu, theta: th * 0.9, attached: false })).aMove < 0, '角度太小 → 減速');
    assert.ok(NS.dynamics(P({ mu, theta: th * 1.1, attached: false })).aMove > 0, '角度太大 → 加速');
  }
  close(NS.balanceAngle(0.02) / NS.DEG, 1.1457628, 1e-7, 'μ = 0.020 → θ ≈ 1.146°');
  close(NS.heightFromAngle(NS.angleFromHeight(0.024, 1.2), 1.2), 0.024, 1e-14, '墊高 h 與角度互換');
});

test('取下吊鉤：a = g(sinθ − μ cosθ)，張力為 0', () => {
  const p = P({ M: 0.8, mu: 0.03, theta: rad(2.5), attached: false });
  const d = NS.dynamics(p);
  close(d.aMove, g * (Math.sin(rad(2.5)) - 0.03 * Math.cos(rad(2.5))), 1e-14);
  assert.strictEqual(d.T, 0);
  assert.strictEqual(d.m, 0);
});

test('拉不動：mg ≤ μMg 時由靜止放開不會動，靜摩擦 = mg、T = mg', () => {
  const p = P({ M: 1.0, m: 0.015, mu: 0.02 });
  const d = NS.dynamics(p);
  assert.ok(!d.startsFromRest);
  assert.strictEqual(NS.accel(p), 0);
  close(NS.tension(p), 0.015 * g, 1e-14, 'T = mg');
  close(d.staticFriction, 0.015 * g, 1e-14, '靜摩擦 = 驅動力');
  const run = NS.makeRun(p, { D: 0.5, hold: 1.5 });
  assert.ok(!run.moves);
  const ds = NS.dots(run, 60);
  assert.strictEqual(ds.length, 91, '1.5 s 打 91 點');
  assert.ok(ds.every((q) => q.x === 0), '所有點疊在同一個位置');
});

test('運動學：x = ½at²，到達擋板 t = √(2D/a)、v = √(2aD)', () => {
  for (const o of CASES) {
    const p = P(o), a = NS.accel(p);
    if (!(a > 0)) continue;
    const run = NS.makeRun(p, { D: 0.5 });
    close(run.tEnd, Math.sqrt(2 * 0.5 / a), 1e-13, 'tEnd');
    close(run.vEnd, Math.sqrt(2 * a * 0.5), 1e-12, 'vEnd');
    for (const t of [0, 0.1, 0.37, run.tEnd].filter((u) => u <= run.tEnd)) {
      close(NS.xAt(run, t), 0.5 * a * t * t, 1e-13, 'x');
      close(NS.vAt(run, t), a * t, 1e-13, 'v');
    }
    close(NS.xAt(run, run.tEnd + 5), 0.5, 1e-14, '撞上擋板後停在 D');
    assert.ok(run.reachedEnd && !run.stopped);
  }
});

test('推一下（v0）：x = v0t + ½at²；減速時在 x = v0²/(2|a|) 停下，太遠則撞上擋板', () => {
  const p = P({ M: 0.5, mu: 0.02, theta: 0, attached: false }); // a = −0.196
  const a = -0.02 * g;
  const r1 = NS.makeRun(p, { v0: 0.3, D: 0.5 });
  assert.ok(r1.stopped && !r1.reachedEnd);
  close(r1.xStop, 0.09 / (2 * 0.196), 1e-13, '停止距離');
  close(r1.tStop, 0.3 / 0.196, 1e-13, '停止時間');
  close(NS.xAt(r1, 0.7), 0.3 * 0.7 + 0.5 * a * 0.49, 1e-13, 'x(t)');
  close(NS.xAt(r1, 99), r1.xStop, 1e-14, '停下後不再動');
  const r2 = NS.makeRun(p, { v0: 0.6, D: 0.5 });
  assert.ok(r2.reachedEnd);
  close(r2.vEnd, Math.sqrt(0.36 - 2 * 0.196 * 0.5), 1e-12, 'v² = v0² + 2aD');
  close(NS.xAt(r2, r2.tEnd), 0.5, 1e-12);
  // 等速（摩擦平衡）
  const r3 = NS.makeRun(P({ attached: false, theta: NS.balanceAngle(0.02) }), { v0: 0.4, D: 0.5 });
  close(r3.tEnd, 0.5 / 0.4, 1e-12, '等速：t = D/v0');
});

test('紙帶點位置：第 k 點在 x = ½a(k/f)²，相鄰間距差都等於 a/f²', () => {
  const p = P({ M: 0.5, m: 0.05, mu: 0 });
  const a = NS.accel(p), run = NS.makeRun(p, { D: 0.5 });
  for (const f of [60, 50, 20, 10]) {
    const ds = NS.dots(run, f);
    assert.strictEqual(ds.length, Math.floor(run.tEnd * f + 1e-9) + 1, '點數');
    ds.forEach((q) => close(q.x, 0.5 * a * (q.k / f) ** 2, 1e-12, `第 ${q.k} 點`));
    for (let k = 2; k < ds.length; k++) {
      close((ds[k].x - ds[k - 1].x) - (ds[k - 1].x - ds[k - 2].x), a / (f * f), 1e-9, '間距差');
    }
  }
});

test('剪紙帶：每條 τ = N/f，紙條長度差 = aτ²，v–t 擬合斜率 = a、截距 = v0', () => {
  for (const o of CASES.concat([{ attached: false, theta: rad(4), mu: 0.03 }])) {
    const p = P(o), a = NS.dynamics(p).aMove;
    if (!(a > 0)) continue;
    for (const v0 of [0, 0.25]) {
      const run = NS.makeRun(p, { v0, D: 0.5 });
      for (const [f, N] of [[60, 6], [50, 5], [60, 3], [20, 2], [10, 1]]) {
        const st = NS.strips(NS.dots(run, f), N, f);
        close(st.tau, N / f, 1e-15, 'τ');
        if (st.used < 3) continue;
        close(st.fit.slope, a, 1e-9, `斜率（f=${f}, N=${N}）`);
        close(st.fit.intercept, v0, 1e-9, '截距 = 初速');
        close(st.fit.r2, 1, 1e-9, 'r² = 1');
        st.diffs.forEach((dd) => close(dd, a * st.tau * st.tau, 1e-9, 'Δ(Δx) = aτ²'));
        st.list.forEach((s) => close(s.v, run.v0 + a * s.t, 1e-9, '紙條平均速度 = 中間時刻的瞬時速度'));
      }
    }
  }
});

test('預設情況（M = 0.5、m = 0.05、μ = 0.02、60 Hz、每 6 點一條）：a ≈ 0.7127，11 條紙條', () => {
  const p = P({}), run = NS.makeRun(p, { D: 0.5 });
  close(NS.accel(p), 0.392 / 0.55, 1e-13);
  const st = NS.strips(NS.dots(run, 60), 6, 60);
  assert.strictEqual(st.list.length, 11);
  close(st.fit.slope, 0.392 / 0.55, 1e-10);
});

test('讀數誤差：同一個種子結果相同；誤差 0.3 mm 時斜率只偏差一點點', () => {
  const run = NS.makeRun(P({}), { D: 0.5 });
  const d1 = NS.dots(run, 60, { sigma: 3e-4, seed: 42 }), d2 = NS.dots(run, 60, { sigma: 3e-4, seed: 42 });
  assert.deepStrictEqual(d1, d2);
  assert.strictEqual(d1[0].x, 0, '以第一點為原點');
  const st = NS.strips(d1, 6, 60);
  assert.ok(Math.abs(st.fit.slope - NS.accel(P({}))) < 0.03, '斜率 ' + st.fit.slope);
  assert.ok(st.fit.r2 > 0.99 && st.fit.r2 < 1);
});

test('a–F（固定總質量，摩擦已平衡）：把槽碼從車上移到吊鉤，a ∝ mg，斜率 = 1/(M + m)', () => {
  const Mtot = 0.6, mu = 0.03, th = NS.balanceAngle(mu);
  const F = [], A = [];
  for (let k = 1; k <= 6; k++) {
    const m = 0.01 * k, M = Mtot - m;
    F.push(m * g); A.push(NS.accel(P({ M, m, mu, theta: th })));
  }
  const fit = NS.fitLine(F, A);
  close(fit.slope, 1 / Mtot, 1e-12, '斜率');
  assert.ok(Math.abs(fit.intercept) < 1e-12, '通過原點，截距 ' + fit.intercept);
  close(fit.r2, 1, 1e-12, '完全直線');
  // 由 a 對 m 的斜率求 g：slope × (M + m) = g
  const fitm = NS.fitLine(F.map((x) => x / g), A);
  close(fitm.slope * Mtot, g, 1e-12, 'g = 斜率 × 總質量');
});

test('a–F（只增加 m、M 不變）：曲線向下彎，低於近似直線 a = mg/M', () => {
  const M = 0.5, F = [], A = [];
  for (const m of [0.05, 0.1, 0.2, 0.3, 0.4]) { F.push(m * g); A.push(NS.accel(P({ M, m, mu: 0 }))); }
  const fit = NS.fitLine(F, A);
  assert.ok(fit.r2 < 0.999, '不是直線，r² = ' + fit.r2);
  for (let i = 0; i < F.length; i++) assert.ok(A[i] < F[i] / M, '低於 mg/M');
  // 斜率愈來愈小（凹向下）
  for (let i = 2; i < F.length; i++) assert.ok((A[i] - A[i - 1]) / (F[i] - F[i - 1]) < (A[i - 1] - A[i - 2]) / (F[i - 1] - F[i - 2]));
  close(A[4] / (F[4] / M), M / (M + 0.4), 1e-12, '比值 = M/(M + m)');
});

test('a–F（固定總質量但沒有平衡摩擦）：直線不過原點，與 F 軸交在 F = μ(M+m)g/(1+μ)', () => {
  const Mtot = 0.6, mu = 0.02, F = [], A = [];
  for (let k = 2; k <= 7; k++) { const m = 0.01 * k; F.push(m * g); A.push(NS.accel(P({ M: Mtot - m, m, mu }))); }
  const fit = NS.fitLine(F, A);
  close(fit.r2, 1, 1e-12, '仍是直線');
  close(-fit.intercept / fit.slope, mu * Mtot * g / (1 + mu), 1e-10, 'F 軸截距');
  close(fit.slope, (1 + mu) / Mtot, 1e-12, '斜率變成 (1+μ)/(M+m)');
});

test('a–1/(M + m)（固定 m，摩擦已平衡）：直線通過原點，斜率 = mg；a–1/M 則不是直線', () => {
  const m = 0.05, mu = 0.02, th = NS.balanceAngle(mu), X = [], X2 = [], A = [];
  for (const M of [0.2, 0.3, 0.5, 0.8, 1.2, 2.0]) {
    A.push(NS.accel(P({ M, m, mu, theta: th }))); X.push(1 / (M + m)); X2.push(1 / M);
  }
  const fit = NS.fitLine(X, A);
  close(fit.slope, m * g, 1e-12, '斜率 = mg');
  assert.ok(Math.abs(fit.intercept) < 1e-12);
  assert.ok(NS.fitLine(X2, A).r2 < 0.9999, 'a–1/M 彎曲');
});

test('極限：m → 0 時 a → 0（無摩擦、水平）；M → 0 時 a → g、T → 0；m → ∞ 時 a → g、T → Mg', () => {
  close(NS.accel(P({ M: 0.5, m: 1e-9, mu: 0 })), 0, 1e-7);
  close(NS.accel(P({ M: 1e-9, m: 0.05, mu: 0.05 })), g, 1e-7, 'M → 0');
  close(NS.tension(P({ M: 1e-9, m: 0.05, mu: 0.05 })), 0, 1e-7, 'T → 0');
  close(NS.accel(P({ M: 0.5, m: 1e9, mu: 0 })), g, 1e-8, 'm → ∞');
  close(NS.tension(P({ M: 0.5, m: 1e9, mu: 0 })), 0.5 * g, 1e-6, 'T → Mg');
  // m ≪ M：T → mg（近似 F ≈ mg 成立）
  close(NS.approxError(P({ M: 1000, m: 0.01, mu: 0 })), 0.01 / 1000.01, 1e-9);
});

test('能量守恆（無摩擦、水平）：mg·x = ½(M + m)v²；有摩擦時再加 f·x', () => {
  for (const mu of [0, 0.03]) {
    const p = P({ M: 0.7, m: 0.12, mu }), run = NS.makeRun(p, { D: 0.5 }), d = NS.dynamics(p);
    for (const t of [0.2, 0.5, run.tEnd]) {
      const x = NS.xAt(run, t), v = NS.vAt(run, t);
      close(0.12 * g * x, 0.5 * 0.82 * v * v + d.f * x, 1e-12, `μ = ${mu}`);
    }
  }
});

test('光電閘：遮光時間與 v = w/Δt；a = (v2² − v1²)/2d 幾乎等於 a，用中間時刻算則完全相等', () => {
  const p = P({ M: 0.5, m: 0.06, mu: 0 }), a = NS.accel(p), run = NS.makeRun(p, { D: 0.5 });
  const gt = NS.gates(run, 0.15, 0.4, 0.02);
  close(gt.dt1, Math.sqrt(2 * 0.17 / a) - Math.sqrt(2 * 0.15 / a), 1e-12, 'Δt1');
  close(gt.v1, 0.02 / gt.dt1, 1e-14);
  close(gt.aTime, a, 1e-10, '中間時刻法');
  assert.ok(Math.abs(gt.a - a) / a < 0.002, '平均速度法誤差 < 0.2%：' + gt.a);
  // 到不了第二個光閘（例如中途停下）
  const r2 = NS.makeRun(P({ attached: false }), { v0: 0.3, D: 0.5 });
  assert.ok(Number.isNaN(NS.gates(r2, 0.15, 0.4, 0.02).dt2));
});

test('fitLine：已知直線與退化情況', () => {
  const f = NS.fitLine([1, 2, 3, 4], [3, 5, 7, 9]);
  close(f.slope, 2, 1e-14); close(f.intercept, 1, 1e-14); close(f.r2, 1, 1e-14);
  assert.strictEqual(NS.fitLine([1], [2]), null);
  assert.strictEqual(NS.fitLine([1, 1], [2, 3]), null);
  close(NS.fitLine([0, 1, 2], [5, 5, 5]).r2, 1, 1e-14, '水平線');
});

console.log(`newton-second-core：${passed} 項測試${process.exitCode ? '有失敗' : '全部通過'}`);
