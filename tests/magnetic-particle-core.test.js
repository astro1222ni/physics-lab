// 以 Node 執行：node tests/magnetic-particle-core.test.js
'use strict';
const assert = require('assert');
const MC = require('../js/magnetic-particle-core.js');

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

const e = MC.E_CHARGE, u = MC.AMU;
// α 粒子：q = +2e、m = 4 u、v = 3e5 m/s、B = 0.1 T → r ≈ 6.2 cm、T ≈ 1.3 μs
function particle(o) {
  return Object.assign({ x: 0, y: 0, vx: 3e5, vy: 0, q: 2 * e, m: 4 * u }, o);
}
/** 推進 total 秒，每 chunk 秒記錄一次狀態 */
function run(p, f, total, chunk, opts) {
  const out = [];
  let t = 0;
  while (t < total - 1e-18) {
    const h = Math.min(chunk, total - t);
    MC.advance(p, f, h, opts);
    t += h;
    out.push({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, t: p.t, turn: p.turn });
  }
  return out;
}

console.log('magnetic-particle-core');

test('公式：r = mv/(|q|B)、T = 2πm/(|q|B)', () => {
  close(MC.radius(4 * u, 2 * e, 3e5, 0.1), 4 * u * 3e5 / (2 * e * 0.1), 1e-15);
  close(MC.radius(4 * u, -2 * e, 3e5, -0.1), 4 * u * 3e5 / (2 * e * 0.1), 1e-15);
  close(MC.period(4 * u, 2 * e, 0.1), 2 * Math.PI * 4 * u / (2 * e * 0.1), 1e-15);
  assert.strictEqual(MC.radius(u, 0, 1e5, 0.1), Infinity);
  assert.strictEqual(MC.period(u, e, 0), Infinity);
});

test('模擬的軌道半徑等於 mv/(|q|B)，圓心與 center() 一致', () => {
  const f = { Bz: 0.1 };
  const p = particle();
  const r = MC.radius(p.m, p.q, 3e5, 0.1);
  const c = MC.center(p, f);
  close(c.r, r, 1e-12, 'center().r');
  const T = MC.period(p.m, p.q, 0.1);
  const pts = run(p, f, T, T / 500);
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const s of pts) {
    close(Math.hypot(s.x - c.x, s.y - c.y), r, 1e-9, '到圓心距離');
    xmin = Math.min(xmin, s.x); xmax = Math.max(xmax, s.x);
    ymin = Math.min(ymin, s.y); ymax = Math.max(ymax, s.y);
  }
  close((xmax - xmin) / 2, r, 1e-4, '水平直徑 / 2');
  close((ymax - ymin) / 2, r, 1e-4, '垂直直徑 / 2');
  near((xmax + xmin) / 2, c.x, 1e-4 * r, '圓心 x');
  near((ymax + ymin) / 2, c.y, 1e-4 * r, '圓心 y');
});

/** 量測速度方向轉滿一圈所需時間（線性內插） */
function measurePeriod(p, f, Tguess) {
  const h = Tguess / 2000;
  let prevT = 0, prevTurn = 0;
  for (let i = 0; i < 4000; i++) {
    MC.advance(p, f, h);
    if (Math.abs(p.turn) >= 2 * Math.PI) {
      return prevT + (2 * Math.PI - Math.abs(prevTurn)) / (Math.abs(p.turn) - Math.abs(prevTurn)) * (p.t - prevT);
    }
    prevT = p.t; prevTurn = p.turn;
  }
  throw new Error('沒有轉滿一圈');
}

test('模擬的週期等於 2πm/(|q|B)', () => {
  const f = { Bz: 0.1 };
  const T = MC.period(4 * u, 2 * e, 0.1);
  close(measurePeriod(particle(), f, T), T, 1e-4);
  // 另一組：質子在 −0.05 T
  const Tp = MC.period(u, e, 0.05);
  close(measurePeriod(particle({ q: e, m: u, vx: 1e5 }), { Bz: -0.05 }, Tp), Tp, 1e-4);
});

test('週期與速率無關（速率 4 倍，半徑 4 倍，週期不變）', () => {
  const f = { Bz: 0.1 };
  const T = MC.period(4 * u, 2 * e, 0.1);
  const T1 = measurePeriod(particle({ vx: 1e5 }), f, T);
  const T4 = measurePeriod(particle({ vx: 4e5 }), f, T);
  close(T4, T1, 1e-5);
  close(MC.center(particle({ vx: 4e5 }), f).r, 4 * MC.center(particle({ vx: 1e5 }), f).r, 1e-12);
});

test('純磁場中速率（動能）守恆：200 圈後相對誤差 < 1e-10', () => {
  const f = { Bz: 0.1 };
  const p = particle({ vx: 2e5, vy: -1.5e5 });
  const v0 = Math.hypot(p.vx, p.vy), K0 = MC.kinetic(p);
  const T = MC.period(p.m, p.q, 0.1);
  // 用較大的轉角步長也一樣守恆（Boris 法的旋轉是精確的）
  MC.advance(p, f, 200 * T, { maxAngle: 0.2, maxStep: 1 });
  assert.ok(Math.abs(p.turn) > 200 * 2 * Math.PI * 0.99, '應該轉了約 200 圈');
  close(Math.hypot(p.vx, p.vy), v0, 1e-10, '速率');
  close(MC.kinetic(p), K0, 1e-10, '動能');
});

test('磁力垂直於速度，大小為 |q|vB', () => {
  const p = particle({ vx: 1.2e5, vy: 2.5e5 });
  const F = MC.forces(p, { Bz: -0.07 });
  near(F.bx * p.vx + F.by * p.vy, 0, 1e-30, 'F·v');
  close(Math.hypot(F.bx, F.by), 2 * e * Math.hypot(1.2e5, 2.5e5) * 0.07, 1e-12);
  assert.strictEqual(F.ex, 0);
});

test('旋轉方向：正電荷在射出紙面的磁場（+z）中順時針轉', () => {
  // F = q v×B：v = +x、B = +z → (+x) × (+z) = (−y)，向右射出的正電荷往下偏
  const f = { Bz: 0.1 };
  const F = MC.forces(particle(), f);
  assert.ok(F.by < 0 && Math.abs(F.bx) < 1e-30, '初始磁力應指向 −y');
  const p = particle();
  const c = MC.center(p, f);
  assert.ok(c.y < 0, '圓心應在出發點下方');
  MC.advance(p, f, MC.period(p.m, p.q, 0.1) / 8);
  assert.ok(p.y < 0 && p.vy < 0, '應往下偏');
  assert.ok(p.turn < 0, '速度方向應順時針轉');
  // 相對圓心的角動量 z 分量為負 → 順時針
  assert.ok((p.x - c.x) * p.vy - (p.y - c.y) * p.vx < 0, '角動量 z 分量應為負');
});

test('旋轉方向：負電荷（或磁場反向）逆時針轉', () => {
  for (const [q, B] of [[-2 * e, 0.1], [2 * e, -0.1]]) {
    const f = { Bz: B };
    const p = particle({ q: q });
    const c = MC.center(p, f);
    assert.ok(c.y > 0, '圓心應在出發點上方');
    MC.advance(p, f, MC.period(p.m, p.q, B) / 8);
    assert.ok(p.y > 0 && p.turn > 0, `q=${q > 0 ? '+' : '−'}、B=${B}：應逆時針`);
    assert.ok((p.x - c.x) * p.vy - (p.y - c.y) * p.vx > 0);
  }
});

test('速度選擇器：v = E/B 時直線前進（與 q 的正負、m 無關）', () => {
  const B = 0.1, v = 3e5;
  // 發射方向 +x 時，所需電場 E = −v×B = +y 方向，大小 vB
  for (const q of [2 * e, -e, 3 * e]) {
    for (const m of [u, 4 * u, 40 * u]) {
      const f = { Bz: B, Ex: 0, Ey: v * B };
      const p = particle({ q: q, m: m, vx: v });
      const F = MC.forces(p, f);
      near(F.ex + F.bx, 0, 1e-12 * Math.abs(F.ey), '合力 x');
      near(F.ey + F.by, 0, 1e-12 * Math.abs(F.ey), '合力 y');
      MC.advance(p, f, 0.2 / v); // 走 20 cm
      close(p.x, 0.2, 1e-9, 'x');
      near(p.y, 0, 1e-9, '應保持在 x 軸上');
      close(p.vx, v, 1e-9); near(p.vy, 0, 1e-6);
    }
  }
});

test('速度選擇器：速率不等於 E/B 時偏轉（太快往磁力方向，太慢往電力方向）', () => {
  const B = 0.1, f = { Bz: B, Ey: 3e5 * B };
  const fast = particle({ vx: 4e5 }), slow = particle({ vx: 2e5 });
  MC.advance(fast, f, 0.1 / 4e5);
  MC.advance(slow, f, 0.1 / 2e5);
  assert.ok(fast.y < -1e-3, '太快：磁力較大，正電荷往 −y 偏');
  assert.ok(slow.y > 1e-3, '太慢：電力較大，正電荷往 +y 偏');
});

test('E×B 漂移：導引中心速度 = E×B/B²（大小 E/B），與 q、m 無關', () => {
  const cases = [
    { Ex: 0, Ey: 2e4, Bz: 0.2, expect: [1e5, 0] },      // E 向 +y、B 射出 → 向 +x 漂移
    { Ex: 0, Ey: 2e4, Bz: -0.2, expect: [-1e5, 0] },    // B 反向 → 漂移反向
    { Ex: 1.5e4, Ey: 0, Bz: 0.1, expect: [0, -1.5e5] },  // E 向 +x、B 射出 → 向 −y 漂移
    { Ex: -1e4, Ey: 1e4, Bz: 0.05, expect: [2e5, 2e5] }
  ];
  for (const c of cases) {
    const d = MC.drift(c);
    close(d.vx, c.expect[0], 1e-12, 'drift().vx'); close(d.vy, c.expect[1], 1e-12, 'drift().vy');
    near(Math.hypot(d.vx, d.vy), Math.hypot(c.Ex, c.Ey) / Math.abs(c.Bz), 1e-6, '|v_d| = E/B');
    for (const q of [2 * e, -e]) {
      for (const m of [4 * u, 12 * u]) {
        const p = particle({ q: q, m: m, vx: 0, vy: 0 }); // 由靜止釋放 → 擺線
        const g0 = MC.center(p, c);
        const T = MC.period(m, q, c.Bz);
        MC.advance(p, c, 5.37 * T);
        const g1 = MC.center(p, c);
        const vgx = (g1.x - g0.x) / p.t, vgy = (g1.y - g0.y) / p.t;
        near(vgx, c.expect[0], 1e-6 * Math.hypot(...c.expect), '導引中心 vx');
        near(vgy, c.expect[1], 1e-6 * Math.hypot(...c.expect), '導引中心 vy');
        close(g1.r, g0.r, 1e-9, '迴旋半徑不變');
      }
    }
  }
});

test('E×B 漂移：整數個週期後粒子本身的平均速度也等於 E/B', () => {
  const f = { Bz: 0.2, Ey: 2e4 };
  const p = particle({ vx: 0 });
  const T = MC.period(p.m, p.q, 0.2);
  const pts = run(p, f, 10 * T, T);
  const last = pts[pts.length - 1];
  close(last.x / last.t, 1e5, 1e-4, '平均 vx');
  near(last.y, 0, 1e-6, '每個週期回到同一高度（擺線的尖點）');
  near(Math.hypot(last.vx, last.vy), 0, 50, '尖點處速度為零');
});

test('有電場時：動能 + 電位能守恆（電力做功，磁力不做功）', () => {
  const f = { Bz: 0.15, Ex: 1e4, Ey: -2e4 };
  const p = particle({ vx: 1e5, vy: 1e5 });
  const U = (s) => -s.q * (f.Ex * s.x + f.Ey * s.y); // 均勻電場：U = −q E·r
  const E0 = MC.kinetic(p) + U(p);
  const pts = run(p, f, 3 * MC.period(p.m, p.q, 0.15), 1e-8);
  let Kmax = 0, Kmin = Infinity;
  for (const s of pts) {
    const ps = Object.assign({}, p, s);
    const K = MC.kinetic(ps);
    Kmax = Math.max(Kmax, K); Kmin = Math.min(Kmin, K);
    close(K + U(ps), E0, 1e-5, '總能量');
  }
  assert.ok(Kmax / Kmin > 1.5, '有電場時動能應該會變');
});

test('只有電場：正電荷順著 E 加速', () => {
  const p = particle({ vx: 0 });
  MC.advance(p, { Bz: 0, Ex: -1e4, Ey: 0 }, 1e-7);
  assert.ok(p.vx < 0 && p.x < 0);
  close(p.vx, -2 * e * 1e4 / (4 * u) * 1e-7, 1e-9);
});

test('射入磁場區：垂直射入 → 半圓，在 2r 處反向射出，場內時間 T/2', () => {
  for (const [q, B, side] of [[2 * e, -0.1, 1], [2 * e, 0.1, -1], [-e, -0.08, -1]]) {
    const f = { Bz: B, region: { xMin: 0.05 } };
    const v = 2e5, m = 4 * u;
    const p = { x: 0, y: 0, vx: v, vy: 0, q: q, m: m };
    const r = MC.radius(m, q, v, B), T = MC.period(m, q, B);
    const stop = MC.advance(p, f, 0.05 / v + T / 2 + 0.03 / v, { bounds: { x0: -0.01, x1: 1, y0: -1, y1: 1 } });
    assert.ok(stop === null, '這段時間內不應離開範圍');
    close(p.vx, -v, 1e-6, '射出時應反向');
    near(p.vy, 0, 1e-6 * v);
    close(p.x, 0.02, 1e-4, '射出後在無場區直線前進');
    close(p.y, side * 2 * r, 1e-5, '射出點與射入點相距 2r');
    close(p.tField, T / 2, 1e-5, '場區內時間');
    close(Math.hypot(p.vx, p.vy), v, 1e-12, '速率不變');
  }
});

test('場區外不受力：直線等速', () => {
  const f = { Bz: 0.1, Ey: 1e4, region: { xMin: 0.5 } };
  const p = particle({ vx: 1e5, vy: 3e4 });
  MC.advance(p, f, 2e-6);
  close(p.x, 0.2, 1e-12); close(p.y, 0.06, 1e-12);
  assert.strictEqual(p.tField, 0);
  assert.strictEqual(MC.center(p, f), null, '場區外沒有圓心');
});

test('離開畫面時回傳 out，並記錄軌跡點', () => {
  const trail = [];
  const p = particle({ vx: 3e5 });
  const stop = MC.advance(p, { Bz: 0.001 }, 1e-5, { bounds: { x0: -0.1, x1: 0.1, y0: -0.1, y1: 0.1 }, trail: trail, trailSpacing: 1e-3 });
  assert.ok(stop && stop.reason === 'out');
  assert.ok(trail.length > 50);
  for (let i = 1; i < trail.length - 1; i++) {
    assert.ok(Math.hypot(trail[i][0] - trail[i - 1][0], trail[i][1] - trail[i - 1][1]) < 1.2e-3, '軌跡點間距');
  }
});

console.log(`\n${passed} 項通過`);
