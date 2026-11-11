// 以 Node 執行：node tests/circular-motion-core.test.js
'use strict';
const assert = require('assert');
const CC = require('../js/circular-motion-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
const P = (o) => Object.assign({ r: 1.5, T: 3, m: 0.5, theta0: 0 }, o);
const CASES = [{}, { r: 0.5, T: 1 }, { r: 2, T: 8, m: 2 }, { r: 1.2, T: 0.4, theta0: 2.3 }, { r: 0.7, T: 12.5, theta0: -1 }];
const TIMES = [0, 0.13, 0.9, 2.5, 7.77, 31.4];

console.log('circular-motion-core');

test('v = 2πr/T、ω = 2π/T、f = 1/T、v = rω', () => {
  for (const o of CASES) {
    const p = P(o), d = CC.derived(p);
    close(d.v, 2 * Math.PI * p.r / p.T, 1e-14, 'v');
    close(d.omega, 2 * Math.PI / p.T, 1e-14, 'ω');
    close(d.f, 1 / p.T, 1e-14, 'f');
    close(d.v, d.omega * p.r, 1e-14, 'v = rω');
  }
});

test('a = v²/r = ω²r = 4π²r/T²、F = ma = mv²/r', () => {
  for (const o of CASES) {
    const p = P(o), d = CC.derived(p);
    close(d.a, d.v * d.v / p.r, 1e-14, 'v²/r');
    close(d.a, d.omega * d.omega * p.r, 1e-14, 'ω²r');
    close(d.a, 4 * Math.PI * Math.PI * p.r / (p.T * p.T), 1e-14, '4π²r/T²');
    close(d.F, p.m * d.v * d.v / p.r, 1e-14, 'F');
  }
});

test('定 r 時速率加倍 → 加速度變 4 倍；定 T 時 a ∝ r；定 v 時 a ∝ 1/r', () => {
  const r = 1, v = 2;
  const a1 = CC.derived({ r, T: CC.periodFromSpeed(r, v) }).a;
  const a2 = CC.derived({ r, T: CC.periodFromSpeed(r, 2 * v) }).a;
  close(a2 / a1, 4, 1e-13, 'v 加倍');
  close(a1, 4, 1e-13, 'a = v²/r = 4');
  const aT = (rr) => CC.derived({ r: rr, T: 2 }).a;
  close(aT(1) / aT(0.5), 2, 1e-13, '定 T，r 加倍');
  close(aT(2) / aT(0.5), 4, 1e-13, '定 T，r 變 4 倍');
  const av = (rr) => CC.derived({ r: rr, T: CC.periodFromSpeed(rr, 3) }).a;
  close(av(2) / av(1), 0.5, 1e-13, '定 v，r 加倍');
});

test('speedFromPeriod 與 periodFromSpeed 互為反函數', () => {
  for (const [r, T] of [[1.5, 3], [0.5, 0.39], [2, 12.6]]) {
    close(CC.periodFromSpeed(r, CC.speedFromPeriod(r, T)), T, 1e-14);
    close(CC.speedFromPeriod(r, CC.periodFromSpeed(r, T)), T, 1e-14);
  }
});

test('投影：x = r cos(ωt + θ0)、y = r sin(ωt + θ0)，且永遠在圓上', () => {
  for (const o of CASES) {
    const p = P(o), w = 2 * Math.PI / p.T;
    for (const t of TIMES) {
      const s = CC.stateAt(p, t);
      close(s.x, p.r * Math.cos(w * t + p.theta0), 1e-12, 'x');
      close(s.y, p.r * Math.sin(w * t + p.theta0), 1e-12, 'y');
      close(Math.hypot(s.x, s.y), p.r, 1e-12, '|r|');
    }
  }
});

test('投影是簡諧運動：a_x = −ω²x、a_y = −ω²y，振幅 r、週期 T', () => {
  for (const o of CASES) {
    const p = P(o), w = CC.omegaOf(p);
    for (const t of TIMES) {
      const s = CC.stateAt(p, t), s2 = CC.stateAt(p, t + p.T);
      close(s.ax, -w * w * s.x, 1e-12, 'a_x');
      close(s.ay, -w * w * s.y, 1e-12, 'a_y');
      close(s2.x, s.x, 1e-9, '一個週期後 x 相同');
      close(s2.y, s.y, 1e-9, '一個週期後 y 相同');
      assert.ok(Math.abs(s.x) <= p.r + 1e-12 && Math.abs(s.y) <= p.r + 1e-12, '|x|、|y| ≤ r');
    }
  }
});

test('速度沿切線（垂直於半徑）、大小 v 固定，且逆時針方向', () => {
  for (const o of CASES) {
    const p = P(o), d = CC.derived(p);
    for (const t of TIMES) {
      const s = CC.stateAt(p, t);
      close(Math.hypot(s.vx, s.vy), d.v, 1e-12, '|v|');
      close((s.x * s.vx + s.y * s.vy) / (p.r * d.v), 0, 1e-12, 'r·v = 0');
      assert.ok(s.x * s.vy - s.y * s.vx > 0, '逆時針（角動量 z 分量 > 0）');
    }
  }
});

test('加速度大小固定為 v²/r，方向指向圓心（a 與位置向量反向）', () => {
  for (const o of CASES) {
    const p = P(o), d = CC.derived(p);
    for (const t of TIMES) {
      const s = CC.stateAt(p, t);
      const amag = Math.hypot(s.ax, s.ay);
      close(amag, d.a, 1e-12, '|a|');
      // 單位向量：a/|a| = −r/|r|
      close(s.ax / amag, -s.x / p.r, 1e-12, 'a 方向 x');
      close(s.ay / amag, -s.y / p.r, 1e-12, 'a 方向 y');
      close((s.ax * s.vx + s.ay * s.vy) / (d.a * d.v), 0, 1e-12, 'a ⟂ v（速率不變）');
    }
  }
});

test('數值微分：dx/dt = v、dv/dt = a（解析式彼此一致）', () => {
  for (const o of CASES) {
    const p = P(o), h = 1e-6 * p.T;
    for (const t of [0.3, 1.7, 5]) {
      const a = CC.stateAt(p, t - h), b = CC.stateAt(p, t + h), s = CC.stateAt(p, t);
      const sc = CC.derived(p);
      close((b.x - a.x) / (2 * h), s.vx, 1e-6 * Math.max(1, sc.v), 'dx/dt');
      close((b.y - a.y) / (2 * h), s.vy, 1e-6 * Math.max(1, sc.v), 'dy/dt');
      close((b.vx - a.vx) / (2 * h), s.ax, 1e-6 * Math.max(1, sc.a), 'dvx/dt');
      close((b.vy - a.vy) / (2 * h), s.ay, 1e-6 * Math.max(1, sc.a), 'dvy/dt');
    }
  }
});

test('動能固定：向心力不作功', () => {
  const p = P({ r: 1.3, T: 1.7, m: 0.8 });
  const K0 = 0.5 * p.m * CC.derived(p).v ** 2;
  for (const t of TIMES) {
    const s = CC.stateAt(p, t);
    close(0.5 * p.m * (s.vx * s.vx + s.vy * s.vy), K0, 1e-12);
  }
});

test('剪斷繩子：沿切線等速直線運動，速率 v、加速度 0', () => {
  for (const o of CASES) {
    const p = P(o), d = CC.derived(p);
    for (const tCut of [0, 0.4, 2.2]) {
      const c = CC.stateAt(p, tCut);
      let prev = null;
      for (const tau of [0, 0.05, 0.3, 1, 4]) {
        const s = CC.releasedStateAt(p, tCut, tCut + tau);
        assert.strictEqual(s.attached, tau === 0, 'attached 旗標');
        close(Math.hypot(s.vx, s.vy), d.v, 1e-12, '速率不變');
        close(s.vx, c.vx, 1e-12, 'vx 不變'); close(s.vy, c.vy, 1e-12, 'vy 不變');
        if (tau > 0) { assert.strictEqual(s.ax, 0); assert.strictEqual(s.ay, 0); }
        // 位置在剪斷點的切線上：(s − c) × v = 0
        const cross = (s.x - c.x) * c.vy - (s.y - c.y) * c.vx;
        close(cross / (d.v * d.v), 0, 1e-12, '在切線上');
        // 走過的距離 = v τ
        close(Math.hypot(s.x - c.x, s.y - c.y), d.v * tau, 1e-12, '距離 = vτ');
        // 方向是順著速度（不是向外或向內）
        if (tau > 0) assert.ok((s.x - c.x) * c.vx + (s.y - c.y) * c.vy > 0, '沿速度方向前進');
        if (prev) assert.ok(Math.hypot(s.x, s.y) >= Math.hypot(prev.x, prev.y), '離圓心越來越遠');
        prev = s;
      }
    }
  }
});

test('剪斷後離圓心距離 d = √(r² + v²τ²)；離開半徑 R 的時間 √(R² − r²)/v', () => {
  for (const o of CASES) {
    const p = P(o), d = CC.derived(p), tCut = 1.234;
    for (const tau of [0, 0.2, 1.5]) {
      const s = CC.releasedStateAt(p, tCut, tCut + tau);
      close(Math.hypot(s.x, s.y), CC.releaseDistance(p, tau), 1e-12, 'd(τ)');
    }
    const R = p.r + 1.1, te = CC.exitTime(p, R);
    close(te, Math.sqrt(R * R - p.r * p.r) / d.v, 1e-14);
    const s = CC.releasedStateAt(p, tCut, tCut + te);
    close(Math.hypot(s.x, s.y), R, 1e-12, '在 exitTime 時恰好到達 R');
    assert.strictEqual(CC.exitTime(p, p.r * 0.5), 0);
  }
});

test('剪斷前 motionAt 與 stateAt 相同；tCut 為 null 時一直做圓周運動', () => {
  const p = P({});
  for (const t of TIMES) {
    assert.deepStrictEqual(CC.motionAt(p, t, null), CC.stateAt(p, t));
    if (t <= 2.5) assert.deepStrictEqual(CC.motionAt(p, t, 2.5), CC.stateAt(p, t));
  }
});

test('圈數：t/T；每經過一個週期通過基準線 θ = 0 一次', () => {
  const p = P({ T: 0.7 });
  close(CC.turns(p, 2.1), 3, 1e-14);
  assert.strictEqual(CC.turnsBetween(p, 0, 0.69), 0);
  assert.strictEqual(CC.turnsBetween(p, 0.69, 0.71), 1);
  assert.strictEqual(CC.turnsBetween(p, 0, 7 + 1e-9), 10, '10 個週期 → 10 次');
  assert.strictEqual(CC.turnsBetween(p, 1, 1), 0);
  assert.strictEqual(CC.turnsBetween(p, 2, 1), 0, '時間倒退不計');
  // 小步長逐格累計，總數與一次計算相同（動畫的音效每圈恰好一次）
  for (const o of CASES) {
    const q = P(o);
    let n = 0, t = 0;
    const dt = q.T / 37.3;
    while (t + dt <= 5 * q.T + 0.5 * q.T) { n += CC.turnsBetween(q, t, t + dt); t += dt; }
    assert.strictEqual(n, CC.turnsBetween(q, 0, t), '逐格累計');
    const expect = Math.floor((CC.angleAt(q, t)) / (2 * Math.PI) + 1e-12) - Math.floor(CC.angleAt(q, 0) / (2 * Math.PI) + 1e-12);
    assert.strictEqual(n, expect);
    assert.ok(n === 5 || n === 6, '約 5.5 個週期通過 5 或 6 次（視起始角而定）');
  }
});

test('經過整數個週期，回到同一位置與同一速度', () => {
  for (const o of CASES) {
    const p = P(o), a = CC.stateAt(p, 0.37);
    for (const n of [1, 3, 10]) {
      const b = CC.stateAt(p, 0.37 + n * p.T);
      close(b.x, a.x, 1e-9); close(b.y, a.y, 1e-9);
      close(b.vx, a.vx, 1e-9); close(b.vy, a.vy, 1e-9);
      close(b.theta - a.theta, 2 * Math.PI * n, 1e-12, '角位移 2πn');
    }
  }
});

test('wrapAngle 落在 [0, 2π)', () => {
  for (const th of [0, 1, 6.3, -0.1, -7, 100]) {
    const w = CC.wrapAngle(th);
    assert.ok(w >= 0 && w < 2 * Math.PI);
    close(Math.cos(w), Math.cos(th), 1e-12);
    close(Math.sin(w), Math.sin(th), 1e-12);
  }
});

console.log(`\n${passed} 項通過`);
