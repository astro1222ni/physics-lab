// 以 Node 執行：node tests/iodine-clock-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/iodine-clock-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`); }
function rel(a, b, tol, msg) { near(a / b, 1, tol, (msg || '') + `（${a} 對 ${b}）`); }
function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const base = { VKI: 10, VP: 10, VS: 2.5, T: 25, salt: true };
const run = o => { const p = C.params(Object.assign({}, base, o)); return { p, pl: C.plan(p) }; };

/**
 * 獨立的對照：把「時鐘反應」也寫成速率方程式（I₂ + 2S₂O₃²⁻ 的二級速率常數 kf 很大），
 * 整個系統用小步長 RK4 從 t = 0 積分，找 [I₂] 達到 C_VIS 的時刻。不用核心的解析解與 plan()。
 */
function bruteClock(p, kf) {
  const y0 = [p.A0, p.B0, p.S0, 0];
  const f = y => {
    const [A, B, S, I2] = y.map(v => Math.max(0, v));
    const r = p.k * (p.m === 0 ? (A > 0 ? 1 : 0) : Math.pow(A, p.m)) * (p.n === 0 ? 1 : Math.pow(B, p.n));
    const q = kf * I2 * S;                     // I₂ + 2S₂O₃²⁻ → 2I⁻
    return [-r, -2 * r + 2 * q, -2 * q, r - q];
  };
  let y = y0.slice(), t = 0;
  const pl = C.plan(p), tEnd = pl.tVis * 1.5;
  const h = pl.tVis / 40000;
  while (t < tEnd) {
    const k1 = f(y), k2 = f(y.map((v, i) => v + k1[i] * h / 2)), k3 = f(y.map((v, i) => v + k2[i] * h / 2)), k4 = f(y.map((v, i) => v + k3[i] * h));
    const y1 = y.map((v, i) => v + h * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6);
    if (y1[3] >= C.C_VIS && y[3] < C.C_VIS) return t + h * (C.C_VIS - y[3]) / (y1[3] - y[3]);
    y = y1; t += h;
  }
  return NaN;
}

// ---------------- 配方與濃度 ----------------
test('稀釋：混合後濃度 = 儲備濃度 × 體積 ÷ 總體積 50 mL', function () {
  const c = C.mix({ VKI: 10, VP: 10, VS: 2.5 });
  near(c.I0, 0.200 * 10 / 50, 1e-15); near(c.P0, 0.100 * 10 / 50, 1e-15); near(c.S0, 0.0200 * 2.5 / 50, 1e-15);
  near(c.fill, 50 - 1 - 10 - 10 - 2.5, 1e-12);
  assert.ok(C.mix({ VKI: 20, VP: 20, VS: 9 }).ok, '滑桿全部最大時總體積仍不超過 50 mL');
});
test('離子強度：純水補足時 μ = [I⁻] + 3[S₂O₈²⁻] + 3[S₂O₃²⁻]；保持離子強度時固定 0.22 M', function () {
  const c = C.mix(base);
  near(C.ionicStrength(c, false), 0.04 + 3 * 0.02 + 3 * 0.001, 1e-12);
  near(C.ionicStrength(c, true), 0.22, 0);
  assert.ok(C.ionicStrength(C.mix({ VKI: 20, VP: 20, VS: 9 }), false) < 0.22, '純水補足的離子強度一定比 0.22 M 小');
});

// ---------------- 速率常數 ----------------
test('k(25 °C, μ = 0.22 M) = 8.0 × 10⁻³ M⁻¹ s⁻¹；阿瑞尼斯：35 °C 約快 1.92 倍', function () {
  near(C.kPS(25, 0.22), 8.0e-3, 1e-15);
  rel(C.kPS(35, 0.22) / C.kPS(25, 0.22), Math.exp(50000 / C.R * (1 / 298.15 - 1 / 308.15)), 1e-12);
  near(C.kPS(35, 0.22) / C.kPS(25, 0.22), 1.92, 0.01);
});
test('鹽效應（同號離子）：離子強度越大越快，μ → 0 時是 k₀', function () {
  assert.ok(C.kPS(25, 0.05) < C.kPS(25, 0.1) && C.kPS(25, 0.1) < C.kPS(25, 0.22));
  near(C.kPS(25, 0), C.k0PS(), 1e-18);
  rel(Math.log10(C.kPS(25, 0.22) / C.k0PS()), 2 * 0.509 * 2 * Math.sqrt(0.22) / (1 + Math.sqrt(0.22)), 1e-12);
  assert.ok(C.k0PS() > 1.5e-3 && C.k0PS() < 2.2e-3, 'k₀ 約 1.9 × 10⁻³');
});

// ---------------- 時鐘的解析解 ----------------
test('時鐘時間的解析解：t* = −ln(1 − [S₂O₃²⁻]₀ / 2[S₂O₈²⁻]₀) / (k[I⁻]₀)', function () {
  const { p, pl } = run({});
  near(pl.tStar, -Math.log(1 - 0.001 / 0.04) / (8e-3 * 0.04), 1e-9);
  near(pl.tStar, 79.12, 0.01);
  assert.ok(pl.tVis > pl.tStar && pl.tVis - pl.tStar < 0.5, '看得到藍色比 t* 晚一點點');
  near(C.phase1A(p, pl.tStar), p.A0 - p.S0 / 2, 1e-15);
});
test('與獨立的「整個系統」數值積分一致（時鐘反應用很大的速率常數）：過硫酸根', function () {
  [{}, { VKI: 4, VP: 16, VS: 6, T: 15 }, { VKI: 20, VP: 3, VS: 1, T: 40, salt: false }].forEach(o => {
    const { p, pl } = run(o);
    rel(bruteClock(p, 1e7), pl.tVis, 3e-3, JSON.stringify(o));
  });
});
test('與獨立數值積分一致：未知反應的 m、n = 0、1、2 九種組合（除了 0、0）', function () {
  for (let m = 0; m <= 2; m++) for (let n = 0; n <= 2; n++) {
    if (!m && !n) continue;
    const u = { m, n, Ea: 50, k25: 1 };
    const p0 = C.params(Object.assign({}, base, { unk: u }));
    u.k25 = C.timeToConsume(p0, 0.0005) / 60;   // 參考配方約 60 s
    const p = C.params(Object.assign({}, base, { VKI: 14, VP: 6, VS: 3, unk: u }));
    rel(bruteClock(p, 1e7), C.plan(p).tVis, 3e-3, 'm = ' + m + '、n = ' + n);
  }
});
test('級數 m = 0、1、2 的時鐘時間公式（[I⁻] 固定）', function () {
  const p = { m: 0, n: 1, k: 2, A0: 0.02, B0: 0.05, S0: 0.002 };
  near(C.timeToConsume(p, 0.001), 0.001 / (2 * 0.05), 1e-15);
  p.m = 1; near(C.timeToConsume(p, 0.001), -Math.log(1 - 0.05) / (2 * 0.05), 1e-12);
  p.m = 2; near(C.timeToConsume(p, 0.001), (1 / 0.019 - 1 / 0.02) / (2 * 0.05), 1e-9);
  [0, 1, 2].forEach(m => { p.m = m; near(C.phase1A(p, C.timeToConsume(p, 0.001)), 0.019, 1e-12); });
});

// ---------------- 守恆與極限 ----------------
test('碘原子與電子守恆：[I⁻] + 2[I₂] = [I⁻]₀；用掉的過硫酸根 = [S₂O₃²⁻]₀/2 + [I₂]', function () {
  const r = C.createRun(C.params(base));
  [0, 30, 79, 80, 120, 600, 3000].forEach(t => {
    const s = r.at(t);
    near(s.B + 2 * s.C, 0.04, 1e-12, 't = ' + t);
    near(r.p.A0 - s.A, (r.p.S0 - s.S) / 2 + s.C, 1e-12, 't = ' + t);
    assert.ok(s.A >= 0 && s.B >= 0 && s.S >= 0 && s.C >= 0);
  });
});
test('時間序列：時間倒回去也得到同樣的值（快取正確）', function () {
  const r = C.createRun(C.params(base));
  const a = r.at(200), b = r.at(500), c = r.at(200);
  near(a.C, c.C, 1e-15); assert.ok(b.C > a.C);
});
test('極限：硫代硫酸根很少時，量到的速率 → 真正的初速率 k[S₂O₈²⁻]₀[I⁻]₀', function () {
  const { pl } = run({ VKI: 20, VP: 20, VS: 0.5 });
  rel(pl.rate, pl.r0, 0.012);
  const big = run({ VKI: 20, VP: 2, VS: 9 }).pl;
  assert.ok(big.rate / big.r0 < 0.85, '硫代硫酸根太多時，量到的是「平均速率」，比初速率小');
});
test('沒有硫代硫酸根：一混合就變藍（只差累積到看得見的時間）', function () {
  const { pl } = run({ VS: 0 });
  near(pl.tStar, 0, 0); assert.ok(pl.tVis < 0.5 && pl.rate === null);
});
test('硫代硫酸根 ≥ 2 倍過硫酸根：永遠不會變藍；tDone 是過硫酸根用掉 99% 的時刻', function () {
  const { p, pl } = run({ VKI: 20, VP: 0.5, VS: 9 });
  assert.ok(pl.never && !isFinite(pl.tVis));
  near(pl.tDone, Math.log(100) / (p.k * p.B0), 1e-9);
  const r = C.createRun(p); const s = r.at(pl.tDone);
  near(s.A / p.A0, 0.01, 1e-12); assert.ok(s.S > 0 && s.C === 0, '最後還剩硫代硫酸根、沒有碘');
});
test('藍色：比爾定律 A = εcl，達到 C_VIS 時已經看得出來', function () {
  near(C.absorbance(1e-6), 2.5e4 * 1e-6 * 4, 1e-15);
  assert.ok(C.blueness(C.C_VIS) > 0.15 && C.blueness(1e-4) > 0.999 && C.blueness(0) === 0);
});

// ---------------- 數據分析 ----------------
test('初速率法：只改 [I⁻]（其他相同）擬合的斜率 = 1；只改 [S₂O₈²⁻] 的斜率 ≈ 1', function () {
  const mk = o => { const q = Object.assign({}, base, { VS: 1 }, o); const { p, pl } = run(q); return { T: q.T, salt: q.salt, I0: p.B0, P0: p.A0, S0: p.S0, rate: pl.rate, t: pl.tVis }; };
  const rs = [5, 10, 20].map(v => mk({ VKI: v }));
  const g = C.orderGroup(rs, rs[0], 'I');
  near(g.slope, 1, 0.003); assert.strictEqual(g.nx, 3); near(g.span, 4, 1e-9);
  const rp = [5, 10, 20].map(v => mk({ VP: v }));
  near(C.orderGroup(rp, rp[0], 'P').slope, 1, 0.02);
  assert.strictEqual(C.orderGroup(rs.concat(rp), rs[0], 'P'), null, '換成另一軸時，這組沒有兩個不同的 [S₂O₈²⁻]');
});
test('鹽效應讓「只用水補足」的 I⁻ 級數看起來大於 1', function () {
  const mk = v => { const q = Object.assign({}, base, { VP: 2, VS: 1, VKI: v, salt: false }); const { p, pl } = run(q); return { T: 25, salt: false, I0: p.B0, P0: p.A0, S0: p.S0, rate: pl.rate }; };
  const rs = [5, 10, 20].map(mk);
  assert.ok(C.orderGroup(rs, rs[0], 'I').slope > 1.15);
});
test('同一配方、不同溫度：ln(1/t) 對 1/T 的斜率給出 Ea = 50 kJ/mol', function () {
  const rs = [15, 25, 35].map(T => { const { p, pl } = run({ T }); return { T, salt: true, I0: p.B0, P0: p.A0, S0: p.S0, t: pl.tVis, rate: pl.rate }; });
  const a = C.arrGroup(rs, rs[0]);
  near(a.Ea, 50, 0.3); assert.strictEqual(a.nT, 3); near(a.span, 20, 1e-9);
  near(C.kAt25([{ T: 15, k: C.kPS(15, 0.22) }, { T: 35, k: C.kPS(35, 0.22) }]), 8e-3, 1e-12);
});
test('未知反應：m、n 不同時為 0，參考配方的時間在 40–150 s', function () {
  const r = rng(7);
  for (let i = 0; i < 300; i++) {
    const u = C.newUnknown(r);
    assert.ok(!(u.m === 0 && u.n === 0) && u.m >= 0 && u.m <= 2 && u.n >= 0 && u.n <= 2);
    const t = C.plan(C.params(Object.assign({}, base, { VS: 2.5, unk: u }))).tStar;
    assert.ok(t >= 40 - 1e-6 && t <= 150 + 1e-6, 't* = ' + t);
    assert.ok(u.Ea >= 35 && u.Ea <= 65);
  }
});
test('解析學生打的數字', function () {
  near(C.parseNum('0.008'), 0.008, 1e-15); near(C.parseNum('8e-3'), 0.008, 1e-15); near(C.parseNum('8.0×10^-3'), 0.008, 1e-15);
  near(C.parseNum('8.0x10-3'), 0.008, 1e-15); near(C.parseNum(' 8,0 ×10^(−3) '), 0.008, 1e-15); near(C.parseNum('2'), 2, 0);
  assert.ok(isNaN(C.parseNum('abc')) && isNaN(C.parseNum('')));
});

console.log(passed + ' 項通過');
