// 以 Node 執行：node tests/projectile-core.test.js
'use strict';
const assert = require('assert');
const PC = require('../js/projectile-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, rel, msg) {
  const tol = rel * Math.max(Math.abs(a), Math.abs(b), 1e-30);
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
const rad = (d) => d * Math.PI / 180;
const P = (o) => Object.assign({ v0: 20, theta: 45, h0: 0, g: 9.8, k: 0 }, o);

console.log('projectile-core');

test('重力預設值：地球 9.8、月球 1.62、火星 3.71 m/s²', () => {
  assert.deepStrictEqual(PC.G_PRESETS, { earth: 9.8, moon: 1.62, mars: 3.71 });
});

test('h0 = 0、無阻力：R = v0² sin2θ / g，T = 2 v0 sinθ / g，H = v0² sin²θ / 2g', () => {
  for (const [v0, th, g] of [[20, 45, 9.8], [15, 30, 9.8], [33, 72, 1.62], [8, 10, 3.71]]) {
    const r = PC.ideal(P({ v0, theta: th, g }));
    close(r.R, v0 * v0 * Math.sin(2 * rad(th)) / g, 1e-12, `R(${v0}, ${th}°, ${g})`);
    close(r.T, 2 * v0 * Math.sin(rad(th)) / g, 1e-12, 'T');
    close(r.H, (v0 * Math.sin(rad(th))) ** 2 / (2 * g), 1e-12, 'H');
    close(r.tApex, r.T / 2, 1e-12, '上升時間 = 下降時間');
  }
});

test('數值積分（RK4，k = 0）與解析解一致', () => {
  for (const o of [{}, { theta: 30, h0: 12 }, { v0: 41, theta: 63, g: 1.62, h0: 3 }, { theta: 0, h0: 20 }]) {
    const p = P(o), a = PC.ideal(p), n = PC.simulate(p);
    close(n.T, a.T, 1e-9, 'T');
    close(n.R, a.R, 1e-9, 'R');
    close(n.H, a.H, 1e-9, 'H');
  }
});

test('h0 = 0 時 45° 射程最大（解析與數值搜尋皆然）', () => {
  const R = (th) => PC.ideal(P({ theta: th })).R;
  for (const th of [10, 30, 44, 44.9, 45.1, 46, 60, 80]) assert.ok(R(th) < R(45), `${th}° 的射程不應超過 45°`);
  close(PC.optimalAngle(P({})).theta, 45, 1e-12);
  close(PC.optimalAngle(P({}), { numeric: true }).theta, 45, 1e-4);
  close(PC.optimalAngle(P({}), { numeric: true }).R, 20 * 20 / 9.8, 1e-8);
});

test('互補角（θ 與 90° − θ）射程相等，但高度與飛行時間不同', () => {
  for (const th of [15, 30, 37, 50]) {
    const a = PC.ideal(P({ theta: th })), b = PC.ideal(P({ theta: 90 - th }));
    close(a.R, b.R, 1e-12, `${th}° 與 ${90 - th}°`);
    assert.ok(Math.abs(a.H - b.H) > 0.1 && Math.abs(a.T - b.T) > 0.1);
    close(PC.simulate(P({ theta: th })).R, PC.simulate(P({ theta: 90 - th })).R, 1e-9, '數值解');
  }
});

test('h0 > 0：飛行時間是 h0 + v0 sinθ t − ½ g t² = 0 的正根', () => {
  for (const [v0, th, h0, g] of [[20, 45, 10, 9.8], [5, 70, 30, 1.62], [12, 0, 25, 3.71], [30, 20, 2, 9.8]]) {
    const p = P({ v0, theta: th, h0, g });
    const a = -0.5 * g, b = v0 * Math.sin(rad(th)), c = h0;
    const Tq = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a); // 二次公式取正根
    const r = PC.ideal(p);
    close(r.T, Tq, 1e-12, 'T');
    assert.ok(Math.abs(PC.idealState(p, r.T).y) < 1e-9, '落地時 y 應為 0');
    close(r.R, v0 * Math.cos(rad(th)) * Tq, 1e-12, 'R = vx T');
    close(PC.simulate(p).T, Tq, 1e-9, '數值解 T');
  }
});

test('水平拋射：落地時間 √(2h0/g) 與初速無關', () => {
  for (const v0 of [1, 10, 40]) close(PC.ideal(P({ v0, theta: 0, h0: 20 })).T, Math.sqrt(40 / 9.8), 1e-12);
});

test('h0 > 0 時最佳仰角 tanθ* = v0/√(v0² + 2gh0) < 45°，數值搜尋吻合', () => {
  const p = P({ v0: 15, h0: 20 });
  const a = PC.optimalAngle(p), n = PC.optimalAngle(p, { numeric: true });
  close(Math.tan(rad(a.theta)), 15 / Math.sqrt(225 + 2 * 9.8 * 20), 1e-12);
  assert.ok(a.theta < 45);
  close(n.theta, a.theta, 1e-4, '最佳角');
  close(n.R, a.R, 1e-8, '最大射程');
  close(a.R, PC.ideal(Object.assign({}, p, { theta: a.theta })).R, 1e-12);
});

test('無阻力：整段飛行力學能 ½v² + gy 守恆（逐格推進）', () => {
  const p = P({ v0: 25, theta: 58, h0: 8, g: 3.71 });
  const s = PC.initialState(p), e0 = PC.energyPerMass(p, s);
  let landed = false, maxErr = 0, n = 0;
  while (!landed && n++ < 100000) {
    landed = PC.advance(p, s, 1 / 60);
    maxErr = Math.max(maxErr, Math.abs(PC.energyPerMass(p, s) - e0));
  }
  assert.ok(landed, '應該落地');
  assert.ok(maxErr / e0 < 1e-10, `能量相對誤差 ${maxErr / e0}`);
  close(s.x, PC.ideal(p).R, 1e-9, '落地點與解析射程');
});

test('逐格推進（動畫用）的落地點與一次積分到底相同', () => {
  const p = P({ v0: 30, theta: 40, h0: 5, k: 0.02 });
  const s = PC.initialState(p);
  let landed = false;
  while (!landed) landed = PC.advance(p, s, 1 / 45);
  const r = PC.simulate(p);
  close(s.x, r.R, 1e-6);
  close(s.t, r.T, 1e-6);
  assert.strictEqual(s.y, 0);
});

test('空氣阻力使射程、最大高度、飛行時間都減少，力學能單調遞減', () => {
  for (const k of [0.002, 0.01, 0.1]) {
    const p0 = P({ v0: 30, theta: 50, h0: 2 }), p1 = Object.assign({}, p0, { k });
    const a = PC.ideal(p0), d = PC.simulate(p1);
    assert.ok(d.R < a.R, `k=${k} 射程應變小`);
    assert.ok(d.H < a.H, `k=${k} 最大高度應變小`);
    assert.ok(d.T < a.T, `k=${k} 飛行時間應變短`);
    const s = PC.initialState(p1);
    let e = PC.energyPerMass(p1, s), landed = false;
    while (!landed) {
      landed = PC.advance(p1, s, 0.01);
      const e2 = PC.energyPerMass(p1, s);
      assert.ok(e2 < e, '力學能應持續減少');
      e = e2;
    }
  }
});

test('空氣阻力下軌跡不對稱：下降比上升久，落地角比仰角陡', () => {
  const p = P({ v0: 40, theta: 45, k: 0.01 });
  const r = PC.simulate(p);
  assert.ok(r.T - r.tApex > r.tApex, '下降時間應較長');
  assert.ok(Math.atan2(-r.vyLand, r.vxLand) > rad(45), '落地角應大於 45°');
});

test('空氣阻力使最佳仰角低於 45°（h0 = 0）', () => {
  for (const k of [0.005, 0.02, 0.1]) {
    const o = PC.optimalAngle(P({ v0: 30, k }));
    assert.ok(o.theta < 45 && o.theta > 20, `k=${k} 最佳角 ${o.theta}`);
    assert.ok(PC.rangeOf(P({ v0: 30, k, theta: o.theta }), true) >= PC.rangeOf(P({ v0: 30, k, theta: 45 }), true));
  }
});

test('鉛直落下的速率趨近終端速率 √(gm/k)', () => {
  const p = P({ v0: 0, theta: 0, h0: 5000, k: 0.05 });
  const s = PC.initialState(p);
  PC.advance(p, s, 20);
  close(Math.hypot(s.vx, s.vy), PC.terminalSpeed(p), 1e-6);
  close(PC.terminalSpeed(p), Math.sqrt(9.8 / 0.05), 1e-12);
});

test('從地面水平發射：立即落地，T = R = 0', () => {
  const p = P({ theta: 0, h0: 0 });
  assert.strictEqual(PC.ideal(p).T, 0);
  assert.strictEqual(PC.simulate(p).T, 0);
  assert.strictEqual(PC.advance(p, PC.initialState(p), 0.1), true);
});

test('射程與 g 成反比：月球射程約為地球的 6 倍', () => {
  close(PC.ideal(P({ g: 1.62 })).R / PC.ideal(P({ g: 9.8 })).R, 9.8 / 1.62, 1e-12);
});

// 11/12 新任務用到的兩個關係（只新增測試，核心函式不變）
test('地面發射、無阻力：R / H = 4 cot θ，與初速、重力無關（R = H 時 tan θ = 4）', () => {
  for (const [v0, th, g] of [[20, 76, 9.8], [35, 30, 3.71], [7, 60, 1.62]]) {
    const r = PC.ideal(P({ v0, theta: th, g }));
    close(r.R / r.H, 4 / Math.tan(rad(th)), 1e-12, `R/H(${v0}, ${th}°, ${g})`);
  }
  const th = Math.atan(4) / rad(1);
  const r = PC.ideal(P({ theta: th }));
  close(r.R, r.H, 1e-12, 'θ = arctan 4');
});

test('水平速度相同、飛行時間相同 → 落點相同（不同高度：鉛直初速差 Δh0 / T）', () => {
  const a = PC.ideal(P({}));
  const vx = 20 * Math.cos(rad(45)), vy = 20 * Math.sin(rad(45)) - 10 / a.T; // 第二發高 10 m
  const b = PC.ideal(P({ v0: Math.hypot(vx, vy), theta: Math.atan2(vy, vx) / rad(1), h0: 10 }));
  close(b.T, a.T, 1e-12, 'T');
  close(b.R, a.R, 1e-12, 'R');
  // 動畫用的 RK4 逐格推進也落在同一點、同一時刻
  const p = P({ v0: Math.hypot(vx, vy), theta: Math.atan2(vy, vx) / rad(1), h0: 10 });
  const s = PC.initialState(p);
  while (!PC.advance(p, s, 1 / 60)) { /* 每格 1/60 s */ }
  close(s.x, a.R, 1e-9, 'RK4 落點');
  close(s.t, a.T, 1e-9, 'RK4 落地時刻');
});

console.log(`\n${passed} 項通過`);
