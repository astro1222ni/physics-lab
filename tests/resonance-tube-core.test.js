// 以 Node 執行：node tests/resonance-tube-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/resonance-tube-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}，得到 ${a}（容許 ${tol}）`);
}
/** 數值找 G(L) 在 [a, b] 的最大值位置（黃金分割＋細掃） */
function argmaxGain(a, b, f, T, r) {
  let best = a, bv = -Infinity;
  for (let i = 0; i <= 4000; i++) { const L = a + (b - a) * i / 4000; const g = C.gain(L, f, T, r); if (g > bv) { bv = g; best = L; } }
  const h = (b - a) / 4000;
  let lo = best - h, hi = best + h;
  for (let it = 0; it < 80; it++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (C.gain(m1, f, T, r) < C.gain(m2, f, T, r)) lo = m1; else hi = m2;
  }
  return (lo + hi) / 2;
}

const FORKS = [384, 440, 512, 640, 768, 1024];
const TEMPS = [0, 10, 25, 40];
const RADII = [0.008, 0.015, 0.025];

console.log('resonance-tube-core');

test('聲速：0 °C 為 331.3 m/s、正比於 √T（絕對溫度）', () => {
  close(C.speedOfSound(0), 331.3, 1e-12);
  close(C.speedOfSound(20), 331.3 * Math.sqrt(293.15 / 273.15), 1e-12);
  close(C.speedOfSound(25) / C.speedOfSound(0), Math.sqrt(298.15 / 273.15), 1e-14);
  close(C.speedOfSound(-273.15), 0, 1e-9, '絕對零度');
});

test('課本近似 331 + 0.6T 在 0–40 °C 與 √T 公式相差不到 0.3%', () => {
  for (let T = 0; T <= 40; T += 0.5) {
    const rel = Math.abs(C.speedLinear(T) - C.speedOfSound(T)) / C.speedOfSound(T);
    assert.ok(rel < 0.003, `T = ${T}：${rel}`);
  }
});

test('共鳴條件：L_n + e = (2n − 1)λ/4，e = 0.6133 r', () => {
  for (const f of FORKS) for (const T of TEMPS) for (const r of RADII) {
    const lam = C.speedOfSound(T) / f, e = C.endCorrection(r);
    close(e, 0.6133 * r, 1e-15);
    for (let n = 1; n <= 5; n++) close(C.resonanceLength(n, f, T, r) + e, (2 * n - 1) * lam / 4, 1e-14, `f=${f} n=${n}`);
  }
});

test('相鄰共鳴點相差 λ/2：v = 2f(L2 − L1) 與管口修正無關', () => {
  for (const f of FORKS) for (const T of TEMPS) for (const r of RADII) {
    const L1 = C.resonanceLength(1, f, T, r), L2 = C.resonanceLength(2, f, T, r), L3 = C.resonanceLength(3, f, T, r);
    close(2 * f * (L2 - L1), C.speedOfSound(T), 1e-9, 'v');
    close(L3 - L2, L2 - L1, 1e-14, '等間距');
  }
});

test('只用第一共鳴點（v = 4fL1）會低估聲速，相對誤差 = 4fe/v', () => {
  for (const f of FORKS) for (const r of RADII) {
    const T = 25, v = C.speedOfSound(T), L1 = C.resonanceLength(1, f, T, r);
    const naive = 4 * f * L1;
    assert.ok(naive < v);
    close((v - naive) / v, 4 * f * C.endCorrection(r) / v, 1e-12);
  }
});

test('響度峰值的位置就是共鳴長度（數值找最大值；ρ 隨深度變化只讓峰值偏移 < 0.2 mm，遠小於 1 mm 的刻度）', () => {
  for (const f of [384, 512, 1024]) for (const T of [0, 25]) for (const r of RADII) {
    const lam = C.speedOfSound(T) / f;
    C.resonances(f, T, r, 0.005, 0.98).forEach(o => {
      const Lp = argmaxGain(o.L - lam / 8, o.L + lam / 8, f, T, r);
      close(Lp, o.L, 2e-4, `f=${f} T=${T} r=${r} n=${o.n}`);
    });
  }
});

test('共鳴時 G = 1/(1 − ρ)，最弱時 G = 1/(1 + ρ)（反共鳴在兩共鳴點正中間）', () => {
  for (const f of FORKS) {
    const T = 25, r = 0.015;
    for (let n = 1; n <= 3; n++) {
      const L = C.resonanceLength(n, f, T, r), rho = C.roundTripKeep(L, f, T, r);
      close(C.gain(L, f, T, r), 1 / (1 - rho), 1e-9);
      close(C.peakDb(n, f, T, r), 20 * Math.log10(1 / (1 - rho)), 1e-9);
      const La = L + C.speedOfSound(T) / f / 4, rhoA = C.roundTripKeep(La, f, T, r);
      close(C.gain(La, f, T, r), 1 / (1 + rhoA), 1e-9);
    }
  }
});

test('損耗：0 < ρ < 1；水面越深 ρ 越小，深處的共鳴較弱', () => {
  for (const f of FORKS) for (const r of RADII) {
    let prev = 1;
    for (let L = 0; L <= 0.98; L += 0.07) {
      const rho = C.roundTripKeep(L, f, 25, r);
      assert.ok(rho > 0 && rho < 1 && rho < prev);
      prev = rho;
    }
    const rs = C.resonances(f, 25, r, 0, 0.98);
    for (let i = 1; i < rs.length; i++) assert.ok(C.peakDb(rs[i].n, f, 25, r) < C.peakDb(rs[i - 1].n, f, 25, r));
  }
  close(C.mouthReflection(500, 25, 1e-9), 1, 1e-12, '極細管幾乎全反射');
});

test('溫度升高：聲速變大、波長變長，共鳴位置往下移（離管口更遠）', () => {
  for (const f of FORKS) for (let n = 1; n <= 3; n++) {
    assert.ok(C.resonanceLength(n, f, 35, 0.015) > C.resonanceLength(n, f, 15, 0.015));
  }
});

test('管口修正：管越粗共鳴位置越靠近管口；r → 0 時 e → 0', () => {
  for (const f of FORKS) assert.ok(C.resonanceLength(1, f, 25, 0.025) < C.resonanceLength(1, f, 25, 0.008));
  close(C.endCorrection(0), 0, 0);
});

test('駐波形狀：水面（y = 0）是波節、y = λ/4 是波腹', () => {
  for (const f of FORKS) {
    const lam = C.speedOfSound(25) / f;
    close(C.displacementShape(0, f, 25), 0, 1e-15);
    close(C.displacementShape(lam / 4, f, 25), 1, 1e-12);
    close(C.displacementShape(lam / 2, f, 25), 0, 1e-12);
  }
  // 第 n 次共鳴：管內（含管口外 e）有 n 個波節（含水面）與 n 個波腹，最上面的波腹恰在管口外 e
  for (const f of FORKS) for (let n = 1; n <= 3; n++) {
    const r = 0.015, L = C.resonanceLength(n, f, 25, r), q = C.nodesAndAntinodes(L, f, 25, r);
    if (L < 0) continue;
    assert.strictEqual(q.nodes.length, n, `f=${f} n=${n} 波節數`);
    assert.strictEqual(q.antinodes.length, n, `f=${f} n=${n} 波腹數`);
    close(q.antinodes[q.antinodes.length - 1], -C.endCorrection(r), 1e-12, '最上面的波腹在管口外 e');
    close(q.nodes[0], L, 0, '水面是波節');
  }
});

test('nearestResonance：在共鳴點上 below = 0、dist = 0', () => {
  for (const f of FORKS) {
    const r = 0.02, T = 18;
    C.resonances(f, T, r, 0, 0.98).forEach(o => {
      const q = C.nearestResonance(o.L, f, T, r);
      assert.strictEqual(q.n, o.n);
      close(q.dist, 0, 1e-12);
      close(q.below, 0, 1e-9);
      const q2 = C.nearestResonance(o.L + 0.01, f, T, r);
      assert.strictEqual(q2.n, o.n);
      assert.ok(q2.below > 0);
    });
  }
});

test('讀數取到 1 mm', () => {
  close(C.roundMm(0.15984), 0.160, 1e-15);
  close(C.roundMm(0.49749), 0.497, 1e-15);
});

test('分群：重複量同一個共鳴點取平均；相距超過 4 cm 分成不同群', () => {
  const cl = C.cluster([0.497, 0.160, 0.159, 0.161, 0.499, 0.836]);
  assert.strictEqual(cl.length, 3);
  close(cl[0].mean, 0.160, 1e-12);
  close(cl[1].mean, 0.498, 1e-12);
  assert.strictEqual(cl[0].values.length, 3);
});

test('推定第幾次共鳴：連續、跳過第一個、中間漏一個都判斷正確', () => {
  for (const f of FORKS) for (const r of RADII) {
    const T = 25, rs = C.resonances(f, T, r, 0.01, 0.98).map(o => o.L);
    if (rs.length < 3) continue;
    let q = C.assignOrders(rs);
    assert.deepStrictEqual(q.ns, rs.map((_, i) => i + 1), `連續 f=${f}`);
    q = C.assignOrders(rs.slice(1));
    assert.deepStrictEqual(q.ns, rs.slice(1).map((_, i) => i + 2), `跳過第一個 f=${f}`);
    q = C.assignOrders([rs[0], rs[2]]);
    assert.deepStrictEqual(q.ns, [1, 3], `中間漏一個 f=${f} r=${r}`);
    assert.ok(q.consistent);
  }
  assert.strictEqual(C.assignOrders([0.12, 0.31, 0.47]).consistent, false, '不等間距的位置不吻合');
});

test('分析：精確的共鳴長度算回正確的聲速與管口修正', () => {
  for (const f of FORKS) for (const T of TEMPS) for (const r of RADII) {
    const Ls = C.resonances(f, T, r, 0.01, 0.98).map(o => o.L);
    if (Ls.length < 2) continue;
    const a = C.analyze(Ls, f, T, r);
    close(a.v, C.speedOfSound(T), 1e-9, `v f=${f}`);
    close(a.e, C.endCorrection(r), 1e-12, 'e');
    close(a.lambda, C.speedOfSound(T) / f, 1e-12, 'λ');
    close(a.v2, C.speedOfSound(T), 1e-9, '兩點公式');
    close(a.errPct, 0, 1e-9);
    close(a.fFromTheory, f, 1e-9, '由理論聲速反推頻率');
  }
});

test('分析：讀數取到 1 mm 時，聲速誤差 < 0.35%、管口修正誤差 < 1.5 mm', () => {
  for (const f of FORKS) for (const T of TEMPS) for (const r of RADII) {
    const Ls = C.resonances(f, T, r, 0.01, 0.98).map(o => C.roundMm(o.L));
    if (Ls.length < 2) continue;
    const a = C.analyze(Ls, f, T, r);
    assert.ok(Math.abs(a.errPct) < 0.35, `f=${f} T=${T} r=${r}：${a.errPct}`);
    assert.ok(Math.abs(a.e - C.endCorrection(r)) < 0.0015, `e：${a.e}`);
  }
});

test('最小平方法：斜率 = λ/2、截距 = −(λ/4 + e)', () => {
  const f = 640, T = 25, r = 0.015, lam = C.speedOfSound(T) / f;
  const Ls = C.resonances(f, T, r, 0.01, 0.98).map(o => o.L);
  const a = C.analyze(Ls, f, T, r);
  close(a.slope, lam / 2, 1e-12);
  close(a.intercept, -(lam / 4 + C.endCorrection(r)), 1e-12);
  close(a.rms, 0, 1e-12);
  const fit = C.fitLine([1, 2, 3], [2, 4, 6]);
  close(fit.slope, 2, 1e-15); close(fit.intercept, 0, 1e-15);
});

test('λ–1/f 圖：通過原點直線的斜率就是聲速', () => {
  const T = 22, v = C.speedOfSound(T);
  const xs = FORKS.map(f => 1 / f), ys = FORKS.map(f => v / f);
  close(C.fitThroughOrigin(xs, ys), v, 1e-9);
});

test('不知道頻率時（f = NaN）仍算得出 λ 與 e，不算聲速', () => {
  const Ls = C.resonances(600, 25, 0.015, 0.01, 0.98).map(o => o.L);
  const a = C.analyze(Ls, NaN, 25, 0.015);
  close(a.lambda, C.speedOfSound(25) / 600, 1e-12);
  assert.ok(Number.isNaN(a.v));
  close(a.fFromTheory, 600, 1e-9);
});

console.log(`\n${passed} 項測試通過`);
