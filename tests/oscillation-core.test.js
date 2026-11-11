// 以 Node 執行：node tests/oscillation-core.test.js
'use strict';
const assert = require('assert');
const OC = require('../js/oscillation-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, rel, msg) {
  const tol = rel * Math.max(Math.abs(a), Math.abs(b), 1e-30);
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
function near(a, b, abs, msg) {
  assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b}，得到 ${a}（容許 ${abs}）`);
}
const TAU = 2 * Math.PI;
const SP = (o) => Object.assign({ m: 0.5, k: 20, A: 0.15, b: 0 }, o);
const PP = (o) => Object.assign({ L: 1, g: 9.8, m: 0.5, b: 0, theta0: 20 }, o);

console.log('oscillation-core');

// ---------------------------------------------------------------- 彈簧振子

test('彈簧週期 T = 2π√(m/k)、ω = √(k/m)、臨界阻尼 b_c = 2√(mk)', () => {
  close(OC.springPeriod(0.5, 20), TAU * Math.sqrt(0.025), 1e-15);
  close(OC.springOmega(2, 50), 5, 1e-15);
  close(OC.criticalDamping(0.5, 20), 2 * Math.sqrt(10), 1e-15);
});

test('無阻尼解析解：x = A cos ωt、v = −Aω sin ωt、a = −ω² x', () => {
  for (const o of [{}, { m: 2, k: 7, A: 0.3 }, { m: 0.1, k: 100, A: 0.02 }]) {
    const p = SP(o), sp = OC.spring(p), w = Math.sqrt(p.k / p.m);
    for (const t of [0, 0.1, 0.37, 1.3, 7.77]) {
      const s = sp.state(t);
      near(s.x, p.A * Math.cos(w * t), 1e-14, 'x');
      near(s.v, -p.A * w * Math.sin(w * t), 1e-13, 'v');
      near(s.a, -w * w * s.x, 1e-12, 'a = −ω²x');
    }
  }
});

test('彈簧解析解滿足 m x″ = −kx − bx′（各種阻尼情況，以差分檢查）', () => {
  const m = 0.5, k = 20, bc = OC.criticalDamping(m, k);
  for (const b of [0, 0.3, 2, bc, bc * 1.0000000001, 9, 20]) {
    const sp = OC.spring({ m, k, b, x0: 0.12, v0: -0.4 });
    for (const t of [0.05, 0.4, 1.1]) {
      const h = 1e-4, s = sp.state(t), sp1 = sp.state(t + h), sm1 = sp.state(t - h);
      near((sp1.x - sm1.x) / (2 * h), s.v, 1e-6, `v = dx/dt（b = ${b}）`);
      near((sp1.v - sm1.v) / (2 * h), s.a, 1e-5, `a = dv/dt（b = ${b}）`);
      near(m * s.a, -k * s.x - b * s.v, 1e-12, `牛頓第二定律（b = ${b}）`);
    }
    near(sp.state(0).x, 0.12, 1e-14, '初位置');
    near(sp.state(0).v, -0.4, 1e-13, '初速度');
  }
});

test('阻尼分類：欠阻尼／臨界／過阻尼，臨界兩側連續', () => {
  const m = 0.5, k = 20, bc = OC.criticalDamping(m, k);
  assert.strictEqual(OC.spring(SP({ b: 0 })).regime, 'none');
  assert.strictEqual(OC.spring(SP({ b: 1 })).regime, 'under');
  assert.strictEqual(OC.spring(SP({ b: bc })).regime, 'critical');
  assert.strictEqual(OC.spring(SP({ b: bc * 1.5 })).regime, 'over');
  const lo = OC.spring(SP({ b: bc * (1 - 1e-6) })).state(0.3).x;
  const mid = OC.spring(SP({ b: bc })).state(0.3).x;
  const hi = OC.spring(SP({ b: bc * (1 + 1e-6) })).state(0.3).x;
  near(lo, mid, 1e-6, '略小於臨界');
  near(hi, mid, 1e-6, '略大於臨界');
});

test('無阻尼時力學能 ½mv² + ½kx² 守恆，且等於 ½kA²', () => {
  const p = SP({ m: 1.3, k: 37, A: 0.22 }), sp = OC.spring(p), E0 = 0.5 * p.k * p.A * p.A;
  for (let t = 0; t < 20; t += 0.0731) close(sp.state(t).E, E0, 1e-12, `t = ${t}`);
});

test('週期與振幅無關：不同 A 的 x(t)/A 完全相同，回到原位的時間都是 2π√(m/k)', () => {
  const T = OC.springPeriod(0.5, 20);
  for (const A of [0.02, 0.1, 0.3]) {
    const sp = OC.spring(SP({ A }));
    near(sp.state(T).x / A, 1, 1e-12, `A = ${A}`);
    near(sp.state(T / 2).x / A, -1, 1e-12, `A = ${A}`);
  }
});

test('相位：v 領先 x 四分之一週期（90°），a 與 x 反相（180°）', () => {
  const p = SP(), sp = OC.spring(p), T = OC.springPeriod(p.m, p.k);
  // 在 [T/2, 3T/2] 內找 x、v、a 的最大值時刻
  let tx = 0, tv = 0, ta = 0, mx = -Infinity, mv = -Infinity, ma = -Infinity;
  const N = 200000;
  for (let i = 0; i <= N; i++) {
    const t = T / 2 + T * i / N, s = sp.state(t);
    if (s.x > mx) { mx = s.x; tx = t; }
    if (s.v > mv) { mv = s.v; tv = t; }
    if (s.a > ma) { ma = s.a; ta = t; }
  }
  near(tx - tv, T / 4, T * 1e-5, 'v 的峰值比 x 早 T/4');
  near(Math.abs(tx - ta), T / 2, T * 1e-5, 'a 的峰值與 x 差 T/2');
  // 等價寫法：v(t) = Aω cos(ωt + π/2)
  const w = Math.sqrt(p.k / p.m);
  for (const t of [0.1, 0.5, 0.9]) near(sp.state(t).v, p.A * w * Math.cos(w * t + Math.PI / 2), 1e-13);
});

test('有阻尼：能量單調減少，且 dE/dt = −bv²；相鄰轉折點振幅比 = e^(−γ·Td/2)', () => {
  const p = SP({ b: 0.4 }), sp = OC.spring(p);
  let prev = Infinity;
  for (let t = 0; t < 10; t += 0.01) {
    const E = sp.state(t).E;
    assert.ok(E <= prev + 1e-15, `t = ${t} 能量不應增加`);
    prev = E;
  }
  const t = 0.83, h = 1e-5, s = sp.state(t);
  close((sp.state(t + h).E - sp.state(t - h).E) / (2 * h), -p.b * s.v * s.v, 1e-6, 'dE/dt');
  const wd = sp.omegaD, g = p.b / (2 * p.m);
  for (let n = 1; n <= 6; n++) {
    const x1 = sp.state((n - 1) * Math.PI / wd).x, x2 = sp.state(n * Math.PI / wd).x;
    close(Math.abs(x2 / x1), Math.exp(-g * Math.PI / wd), 1e-10, `第 ${n} 個轉折點`);
    near(sp.state(n * Math.PI / wd).v, 0, 1e-12, '轉折點速度為零');
  }
});

test('轉折點編號：t = nπ/ωd，跨過才算一次', () => {
  const wd = Math.PI; // 轉折點在 t = 1, 2, 3, …
  assert.deepStrictEqual(OC.turningIndices(wd, 0, 0.99), []);
  assert.deepStrictEqual(OC.turningIndices(wd, 0.5, 1.5), [1]);
  assert.deepStrictEqual(OC.turningIndices(wd, 0.9, 3.2), [1, 2, 3]);
  assert.deepStrictEqual(OC.turningIndices(wd, 1, 1.5), []); // 剛好在 t = 1 已算過
  assert.deepStrictEqual(OC.turningIndices(0, 0, 10), []);
});

// ---------------------------------------------------------------- 單擺：週期公式

test('AGM 與完全橢圓積分 K：已知值', () => {
  close(OC.agm(1, Math.SQRT2), 1.1981402347355922, 1e-15, 'AGM(1, √2)');
  close(OC.ellipticK(0), Math.PI / 2, 1e-15, 'K(0) = π/2');
  close(OC.ellipticK(Math.SQRT1_2), 1.8540746773013719, 1e-14, 'K(1/√2)');
  close(OC.ellipticK(0.5), 1.6857503548125961, 1e-14, 'K(0.5)');
});

test('精確週期：θ0 = 90° 時 T/T0 = 1.18034…；小角度展開 1 + θ²/16 + 11θ⁴/3072', () => {
  close(OC.pendulumPeriod(1, 9.8, 90) / OC.smallAnglePeriod(1, 9.8), 1.1803405990160962, 1e-13);
  for (const d of [2, 5, 10]) {
    const th = d * Math.PI / 180;
    const series = 1 + th * th / 16 + 11 * th ** 4 / 3072 + 173 * th ** 6 / 737280;
    close(OC.pendulumPeriod(2, 9.8, d) / OC.smallAnglePeriod(2, 9.8), series, 1e-9, `${d}°`);
    close(OC.periodExcess(d), series - 1, 1e-6, `差異百分比 ${d}°`);
  }
});

test('小角度極限：θ0 → 0 時精確週期 → 2π√(L/g)', () => {
  for (const [L, g] of [[1, 9.8], [0.25, 1.62], [3, 24.79]]) {
    close(OC.pendulumPeriod(L, g, 1e-3), TAU * Math.sqrt(L / g), 1e-10, `L = ${L}, g = ${g}`);
    close(OC.pendulumPeriod(L, g, 1), TAU * Math.sqrt(L / g) * (1 + (Math.PI / 180) ** 2 / 16), 1e-8, '1°');
  }
});

test('週期隨振幅增加（大角度不再等時），且 θ0 = 170° 約為 T0 的 2.4 倍', () => {
  let prev = 0;
  for (let d = 1; d <= 170; d += 1) {
    const T = OC.pendulumPeriod(1, 9.8, d);
    assert.ok(T > prev, `${d}°`);
    prev = T;
  }
  const r = OC.pendulumPeriod(1, 9.8, 170) / OC.smallAnglePeriod(1, 9.8);
  assert.ok(r > 2.4 && r < 2.5, `T(170°)/T0 = ${r}`);
});

// ---------------------------------------------------------------- 單擺：數值積分

test('數值積分量到的週期與 AGM 公式一致（相對誤差 < 1e-4，實際遠小於此）', () => {
  let worst = 0;
  for (const d of [1, 5, 10, 30, 60, 90, 120, 150, 170]) {
    for (const [L, g] of [[1, 9.8], [0.4, 1.62]]) {
      const p = PP({ L, g, theta0: d });
      const Tn = OC.measurePendulumPeriod(p), Ta = OC.pendulumPeriod(L, g, d);
      const err = Math.abs(Tn - Ta) / Ta;
      worst = Math.max(worst, err);
      assert.ok(err < 1e-4, `θ0 = ${d}°：數值 ${Tn}，公式 ${Ta}`);
    }
  }
  assert.ok(worst < 1e-7, `最大相對誤差 ${worst} 應遠小於 1e-4`);
});

test('無阻尼時力學能守恆（辛積分，θ0 = 170°、跑 50 個週期）', () => {
  for (const d of [20, 120, 170]) {
    const p = PP({ theta0: d }), s = OC.pendulumInit(p), E0 = OC.pendulumEnergy(p, s).E;
    const T = OC.pendulumPeriod(p.L, p.g, d);
    let worst = 0;
    // 每次推進一個「畫面」1/60 s，與動畫的用法相同
    while (s.t < 50 * T) {
      OC.pendulumAdvance(p, s, 1 / 60);
      worst = Math.max(worst, Math.abs(OC.pendulumEnergy(p, s).E - E0) / E0);
    }
    assert.ok(worst < 1e-6, `θ0 = ${d}°：能量最大相對誤差 ${worst}`);
  }
});

test('精確單擺 50 個週期後仍回到 θ0（相位沒有漂移）', () => {
  const p = PP({ theta0: 60 }), s = OC.pendulumInit(p), T = OC.pendulumPeriod(1, 9.8, 60);
  OC.pendulumAdvance(p, s, 50 * T, { hmax: T / 800 });
  near(s.th * 180 / Math.PI, 60, 1e-4, 'θ(50T)');
});

test('轉折點事件：每半個週期一次，左右交替，時刻與公式相符', () => {
  const p = PP({ theta0: 45 }), s = OC.pendulumInit(p), T = OC.pendulumPeriod(1, 9.8, 45);
  const turns = [];
  OC.pendulumAdvance(p, s, 3.2 * T, { onTurn: (t, th) => turns.push([t, th]) });
  assert.strictEqual(turns.length, 6);
  turns.forEach(([t, th], i) => {
    near(t, (i + 1) * T / 2, T * 1e-4, `第 ${i + 1} 個轉折點時刻`);
    assert.strictEqual(Math.sign(th), i % 2 === 0 ? -1 : 1, '左右交替');
    near(Math.abs(th) * 180 / Math.PI, 45, 0.01, '轉折點的角度 = θ0');
  });
});

test('小角度：精確單擺與線性化單擺幾乎重合；大角度明顯分開', () => {
  const run = (d) => {
    const p = PP({ theta0: d }), s = OC.pendulumInit(p), lin = OC.smallAngle(p);
    const T0 = OC.smallAnglePeriod(p.L, p.g);
    OC.pendulumAdvance(p, s, 5 * T0);
    return Math.abs(s.th - lin.at(5 * T0).th) / (d * Math.PI / 180);
  };
  assert.ok(run(2) < 2e-3, '2° 時 5 個週期後差距 < 0.2%');
  assert.ok(run(90) > 0.5, '90° 時 5 個週期後差距很大');
});

test('角速度領先擺角 90°（小角度），角加速度與擺角反相', () => {
  const p = PP({ theta0: 1 }), T = OC.pendulumPeriod(1, 9.8, 1), s = OC.pendulumInit(p);
  OC.pendulumAdvance(p, s, T / 2); // 到另一側最高點附近
  let tTh = 0, tOm = 0, mTh = -Infinity, mOm = -Infinity;
  const h = T / 20000;
  for (let i = 0; i < 20000; i++) {
    OC.pendulumAdvance(p, s, h, { hmax: h });
    if (s.th > mTh) { mTh = s.th; tTh = s.t; }
    if (s.om > mOm) { mOm = s.om; tOm = s.t; }
    near(OC.pendulumAccel(p, s.th, s.om), -(p.g / p.L) * Math.sin(s.th), 1e-15, 'α = −(g/L)sinθ');
  }
  near(tTh - tOm, T / 4, T * 2e-4, 'ω 的峰值比 θ 早 T/4');
});

test('有阻尼的單擺：擺幅逐次減小、能量單調減少', () => {
  const p = PP({ theta0: 60, b: 0.1 }), s = OC.pendulumInit(p);
  const amps = [];
  let prevE = OC.pendulumEnergy(p, s).E;
  for (let i = 0; i < 1200; i++) {
    OC.pendulumAdvance(p, s, 1 / 60, { onTurn: (t, th) => amps.push(Math.abs(th)) });
    const E = OC.pendulumEnergy(p, s).E;
    assert.ok(E <= prevE + 1e-12, '能量不應增加');
    prevE = E;
  }
  assert.ok(amps.length >= 8, '應有多個轉折點');
  for (let i = 1; i < amps.length; i++) assert.ok(amps[i] < amps[i - 1], `第 ${i + 1} 次擺幅應較小`);
  assert.ok(amps[amps.length - 1] < 0.6 * 60 * Math.PI / 180, '20 s 後擺幅明顯變小');
});

test('單擺最大角速度 ω_max = √(2g(1 − cos θ0)/L)（能量守恆）', () => {
  const p = PP({ theta0: 120 }), s = OC.pendulumInit(p);
  let m = 0;
  OC.pendulumAdvance(p, s, OC.pendulumPeriod(1, 9.8, 120), { onStep: (q) => { m = Math.max(m, Math.abs(q.om)); } });
  close(m, OC.pendulumMaxOmega(p), 1e-5);
});

// ---------------------------------------------------------------- 任務模式用的輔助函式

test('springSettleTime：臨界阻尼由靜止釋放，E/E0 = [(1+u)² + u²]e^{−2u}（u = ω0 t）降到 1e-4 的時刻', () => {
  const m = 0.5, k = 20, w = Math.sqrt(k / m);
  const ts = OC.springSettleTime(SP({ b: OC.criticalDamping(m, k) }), 1e-4);
  // 獨立用二分法解 f(u) = 1e-4
  const f = (u) => ((1 + u) ** 2 + u * u) * Math.exp(-2 * u);
  let lo = 1, hi = 20;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (f(mid) > 1e-4) lo = mid; else hi = mid; }
  close(ts * w, (lo + hi) / 2, 1e-9);
  close(ts / OC.springPeriod(m, k), 1.108, 1e-3, '約 1.11 個週期');
});

test('springSettleTime：該時刻 E = frac·E0，力學能只減不增；無阻尼為 Infinity', () => {
  for (const f of [0.5, 0.95, 1, 1.3, 4]) {
    const p = SP({ b: f * OC.criticalDamping(0.5, 20) });
    const sol = OC.spring(p), E0 = sol.state(0).E;
    const ts = OC.springSettleTime(p, 1e-4);
    close(sol.state(ts).E, 1e-4 * E0, 1e-6);
    let prev = Infinity;
    for (let i = 0; i <= 400; i++) { const E = sol.state(ts * i / 400).E; assert.ok(E <= prev * (1 + 1e-12)); prev = E; }
    assert.ok(sol.state(ts * 0.999).E > 1e-4 * E0);
  }
  assert.strictEqual(OC.springSettleTime(SP({ b: 0 }), 1e-4), Infinity);
});

test('臨界阻尼是「不越過平衡點」中最快停下的：過阻尼越重越慢，欠阻尼雖快但會越過', () => {
  const m = 0.5, k = 20, bc = OC.criticalDamping(m, k), T0 = OC.springPeriod(m, k);
  const t = (f) => OC.springSettleTime(SP({ b: f * bc }), 1e-4) / T0;
  assert.ok(t(1) < t(1.05) && t(1.05) < t(1.5) && t(1.5) < t(3));
  assert.strictEqual(OC.spring(SP({ b: 0.9 * bc })).regime, 'under');
  assert.ok(t(0.9) < t(1), 'ζ = 0.9 停得比較快，但它越過了平衡點');
  // 重度過阻尼：慢根 r1 ≈ −ω0/(2ζ)，停下時間 ≈ ln(1e4)·ζ/ω0
  const z = 20, w = Math.sqrt(k / m);
  close(OC.springSettleTime(SP({ b: z * bc }), 1e-4), Math.log(1e4) / (2 * (z * w - Math.sqrt(z * z - 1) * w)), 2e-3);
});

console.log(passed + ' 項通過');
