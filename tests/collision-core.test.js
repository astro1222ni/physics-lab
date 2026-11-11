// 以 Node 執行：node tests/collision-core.test.js
'use strict';
const assert = require('assert');
const CC = require('../js/collision-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}

// 固定種子的亂數，讓測試可重現
let seed = 12345;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
function randomCase() {
  const m1 = 0.1 + rnd() * 10, m2 = 0.1 + rnd() * 10;
  const v2 = (rnd() - 0.5) * 10;
  const v1 = v2 + 0.01 + rnd() * 8; // 保證 v1 > v2：兩車接近
  return { m1, m2, v1, v2 };
}
const ES = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

console.log('collision-core');

test('任何 e 之下總動量都守恆', () => {
  for (let k = 0; k < 300; k++) {
    const c = randomCase();
    for (const e of ES) {
      const f = CC.collide(c.m1, c.m2, c.v1, c.v2, e);
      close(c.m1 * f.v1 + c.m2 * f.v2, c.m1 * c.v1 + c.m2 * c.v2, 1e-12, `e=${e}`);
    }
  }
});

test('e = 1（彈性碰撞）時總動能守恆', () => {
  for (let k = 0; k < 300; k++) {
    const c = randomCase();
    const f = CC.collide(c.m1, c.m2, c.v1, c.v2, 1);
    close(CC.kinetic(c.m1, f.v1) + CC.kinetic(c.m2, f.v2), CC.kinetic(c.m1, c.v1) + CC.kinetic(c.m2, c.v2), 1e-12);
  }
});

test('e < 1 時總動能減少，e 越小損失越多', () => {
  const c = { m1: 2, m2: 3, v1: 3, v2: -1 };
  let prev = -1;
  for (const e of ES.slice().reverse()) {
    const s = CC.summary(c.m1, c.m2, c.v1, c.v2, e);
    assert.ok(s.lost >= -1e-12, '動能不可能增加');
    assert.ok(s.lost > prev, `e=${e} 的損失應大於 e 較大時`);
    prev = s.lost;
  }
});

test('e = 0（完全非彈性）兩車以共同速度 (m1v1+m2v2)/(m1+m2) 前進', () => {
  for (let k = 0; k < 300; k++) {
    const c = randomCase();
    const f = CC.collide(c.m1, c.m2, c.v1, c.v2, 0);
    const V = (c.m1 * c.v1 + c.m2 * c.v2) / (c.m1 + c.m2);
    close(f.v1, V, 1e-12);
    close(f.v2, V, 1e-12);
  }
  const f = CC.collide(2, 3, 3, -1, 0); // 具體數字：(6 − 3)/5 = 0.6 m/s
  close(f.v1, 0.6, 1e-12);
  close(f.v2, 0.6, 1e-12);
});

test('等質量彈性碰撞：兩車交換速度', () => {
  for (const [v1, v2] of [[3, 0], [3, -1], [5, 2], [-1, -4]]) {
    const f = CC.collide(2, 2, v1, v2, 1);
    close(f.v1, v2, 1e-12);
    close(f.v2, v1, 1e-12);
  }
});

test('動能損失 = (1/2) μ (1 − e^2)(v1 − v2)^2', () => {
  for (let k = 0; k < 300; k++) {
    const c = randomCase();
    for (const e of ES) {
      const f = CC.collide(c.m1, c.m2, c.v1, c.v2, e);
      const lost = CC.kinetic(c.m1, c.v1) + CC.kinetic(c.m2, c.v2) - CC.kinetic(c.m1, f.v1) - CC.kinetic(c.m2, f.v2);
      const mu = c.m1 * c.m2 / (c.m1 + c.m2);
      close(lost, 0.5 * mu * (1 - e * e) * (c.v1 - c.v2) ** 2, 1e-10);
      close(CC.keLoss(c.m1, c.m2, c.v1, c.v2, e), lost, 1e-10);
    }
  }
});

test('碰撞後反算的恢復係數 −(v1′ − v2′)/(v1 − v2) 等於 e', () => {
  for (let k = 0; k < 100; k++) {
    const c = randomCase();
    for (const e of ES) close(CC.summary(c.m1, c.m2, c.v1, c.v2, e).eMeasured, e, 1e-10);
  }
});

test('碰撞後兩車不再接近（不會穿透、不會再撞一次）', () => {
  for (let k = 0; k < 300; k++) {
    const c = randomCase();
    for (const e of ES) {
      const f = CC.collide(c.m1, c.m2, c.v1, c.v2, e);
      assert.ok(f.v2 - f.v1 >= -1e-12, `e=${e}：碰撞後 v2′ 應 ≥ v1′`);
    }
  }
});

test('重撞輕、輕撞重（v2 = 0、彈性）的課本結果', () => {
  let f = CC.collide(6, 1, 3, 0, 1);
  close(f.v1, 3 * 5 / 7, 1e-12); close(f.v2, 3 * 12 / 7, 1e-12);
  assert.ok(f.v1 > 0 && f.v2 > 3, '重車繼續前進、輕車以較快速度彈出');
  f = CC.collide(1, 6, 3, 0, 1);
  close(f.v1, -3 * 5 / 7, 1e-12); close(f.v2, 3 * 2 / 7, 1e-12);
  assert.ok(f.v1 < 0, '輕車應反彈');
});

test('兩車沒有互相接近（分離或同速）就不會碰撞', () => {
  for (const [v1, v2] of [[-2, 3], [0, 0], [2, 2], [1, 4], [-3, -1], [0, 2]]) {
    assert.strictEqual(CC.collide(1, 2, v1, v2, 0.5), null, `v1=${v1}, v2=${v2}`);
    assert.strictEqual(CC.timeToContact(1.5, v1, v2), Infinity);
    const s = CC.summary(1, 2, v1, v2, 0.5);
    assert.strictEqual(s.collides, false);
    assert.strictEqual(s.lost, 0);
    const sim = CC.createSim({ m1: 1, m2: 2, v1, v2, e: 0.5, w1: 1, w2: 1, x1: 4, x2: 6 });
    assert.strictEqual(sim.tc, Infinity);
    for (let t = 0; t <= 20; t += 0.5) {
      const st = CC.stateAt(sim, t);
      assert.strictEqual(st.collided, false);
      assert.strictEqual(st.v1, v1); assert.strictEqual(st.v2, v2);
      assert.ok((st.x2 - 0.5) - (st.x1 + 0.5) >= 1 - 1e-12, '間距不可縮小');
    }
  }
});

test('模擬：碰撞時刻兩車剛好接觸，碰撞後速度與 collide() 一致', () => {
  const p = { m1: 2, m2: 3, v1: 3, v2: -1, e: 0.6, w1: 1, w2: 1.2, x1: 2, x2: 8 };
  const sim = CC.createSim(p);
  const gap = (8 - 0.6) - (2 + 0.5);
  close(sim.tc, gap / 4, 1e-12);
  const at = CC.stateAt(sim, sim.tc);
  close((at.x2 - p.w2 / 2) - (at.x1 + p.w1 / 2), 0, 1e-12, '碰撞瞬間應剛好接觸');
  const f = CC.collide(p.m1, p.m2, p.v1, p.v2, p.e);
  const later = CC.stateAt(sim, sim.tc + 2);
  close(later.v1, f.v1, 1e-12); close(later.v2, f.v2, 1e-12);
  assert.ok((later.x2 - p.w2 / 2) - (later.x1 + p.w1 / 2) >= -1e-12, '碰撞後不可重疊');
  const before = CC.stateAt(sim, sim.tc - 1e-6);
  assert.strictEqual(before.collided, false);
  assert.strictEqual(later.collided, true);
});

test('模擬：總動量隨時間不變，質心做等速度運動', () => {
  for (const e of ES) {
    const sim = CC.createSim({ m1: 1.5, m2: 4, v1: 4, v2: 0.5, e, w1: 0.9, w2: 1.3, x1: 1, x2: 6 });
    const s0 = CC.stateAt(sim, 0);
    for (let t = 0; t <= 6; t += 0.05) {
      const s = CC.stateAt(sim, t);
      close(s.p, s0.p, 1e-12, `t=${t.toFixed(2)} 動量`);
      close(s.xcm, s0.xcm + s0.vcm * t, 1e-12, `t=${t.toFixed(2)} 質心位置`);
    }
  }
});

test('不合理的參數會丟出錯誤', () => {
  assert.throws(() => CC.collide(0, 1, 1, 0, 1), RangeError);
  assert.throws(() => CC.collide(1, -2, 1, 0, 1), RangeError);
  assert.throws(() => CC.collide(1, 1, 1, 0, 1.2), RangeError);
  assert.throws(() => CC.collide(1, 1, 1, 0, -0.1), RangeError);
});

// ---------- 彈簧緩衝 ----------
const KS = [20, 63, 200, 650, 2000];
function springSim(c, k, L0) {
  const w1 = 1, w2 = 1.2;
  // 兩車間空隙 = L0 + 1 m：接觸前先走一段
  return CC.createSim({ m1: c.m1, m2: c.m2, v1: c.v1, v2: c.v2, e: 0.3, w1, w2, x1: 0, x2: w1 / 2 + L0 + 1 + w2 / 2, k, L0 });
}

test('彈簧：接觸時刻為彈簧尖端碰到車 2，接觸時間 Δt = π√(μ/k)', () => {
  for (let n = 0; n < 60; n++) {
    const c = randomCase(), k = KS[n % KS.length];
    const sim = springSim(c, k, 50);
    close(sim.tc, 1 / (c.v1 - c.v2), 1e-12, 't_c');
    const mu = c.m1 * c.m2 / (c.m1 + c.m2);
    close(sim.tr - sim.tc, Math.PI * Math.sqrt(mu / k), 1e-12, 'Δt');
    const at = CC.stateAt(sim, sim.tc);
    close((at.x2 - 0.6) - (at.x1 + 0.5), 50, 1e-12, '接觸瞬間空隙 = L0');
    assert.strictEqual(sim.e, 1, '理想彈簧不使用 e');
  }
});

test('彈簧：接觸期間每一刻總動量守恆、K + U 守恆、質心等速度', () => {
  for (let n = 0; n < 40; n++) {
    const c = randomCase(), k = KS[n % KS.length];
    const sim = springSim(c, k, 50);
    const s0 = CC.stateAt(sim, 0);
    for (let i = 0; i <= 200; i++) {
      const t = sim.tc - 0.1 + (sim.tr - sim.tc + 0.2) * i / 200;
      const s = CC.stateAt(sim, t);
      close(s.p, s0.p, 1e-12, `t=${t} 動量`);
      close(s.K + s.U, s0.K, 1e-12, `t=${t} K + U`);
      close(s.E, s0.K, 1e-12, `t=${t} E`);
      close(s.xcm, s0.xcm + s0.vcm * t, 1e-12, `t=${t} 質心`);
      assert.ok(s.x >= -1e-12, '壓縮量不可為負');
      // 彈簧長度 = 兩車間空隙
      if (s.contact) close((s.x2 - 0.6) - (s.x1 + 0.5), 50 - s.x, 1e-12, '彈簧長度 = L0 − x');
    }
  }
});

test('彈簧：最大壓縮量 x_max = u√(μ/k)，發生在 Δt/2，此時兩車同速 v_cm', () => {
  for (let n = 0; n < 60; n++) {
    const c = randomCase(), k = KS[n % KS.length];
    const sim = springSim(c, k, 50);
    const mu = c.m1 * c.m2 / (c.m1 + c.m2), u = c.v1 - c.v2;
    const xmax = u * Math.sqrt(mu / k);
    close(sim.contact.xmax, xmax, 1e-12);
    close(sim.contact.Fmax, k * xmax, 1e-12);
    const mid = CC.stateAt(sim, (sim.tc + sim.tr) / 2);
    close(mid.x, xmax, 1e-12, '中點壓縮量');
    const vcm = CC.vcm(c.m1, c.m2, c.v1, c.v2);
    close(mid.v1, vcm, 1e-12); close(mid.v2, vcm, 1e-12);
    // 此刻彈簧位能 = 完全非彈性碰撞損失的動能
    close(mid.U, CC.keLoss(c.m1, c.m2, c.v1, c.v2, 0), 1e-12, 'U_max = ½μu²');
    let best = 0;
    for (let i = 0; i <= 400; i++) best = Math.max(best, CC.stateAt(sim, sim.tc + (sim.tr - sim.tc) * i / 400).x);
    close(best, xmax, 1e-9, '取樣最大值');
  }
});

test('彈簧：放開後速度等於彈性碰撞（e = 1）的結果，且狀態連續', () => {
  for (let n = 0; n < 60; n++) {
    const c = randomCase(), k = KS[n % KS.length];
    const sim = springSim(c, k, 50);
    const f = CC.collide(c.m1, c.m2, c.v1, c.v2, 1);
    const after = CC.stateAt(sim, sim.tr + 1);
    close(after.v1, f.v1, 1e-12); close(after.v2, f.v2, 1e-12);
    assert.strictEqual(after.U, 0);
    const a = CC.stateAt(sim, sim.tr - 1e-9), b = CC.stateAt(sim, sim.tr);
    close(a.x1, b.x1, 1e-7, '放開瞬間 x1 連續'); close(a.x2, b.x2, 1e-7, '放開瞬間 x2 連續');
    close(a.v1, b.v1, 1e-6, '放開瞬間 v1 連續'); close(a.v2, b.v2, 1e-6, '放開瞬間 v2 連續');
    const c0 = CC.stateAt(sim, sim.tc - 1e-9), c1 = CC.stateAt(sim, sim.tc);
    close(c0.x1, c1.x1, 1e-7); close(c0.v1, c1.v1, 1e-9, '開始接觸時 v1 連續');
  }
});

test('彈簧：衝量 ∫F dt（數值積分）= |Δp1| = Δp2 = 2μu', () => {
  for (let n = 0; n < 30; n++) {
    const c = randomCase(), k = KS[n % KS.length];
    const sim = springSim(c, k, 50);
    const N = 2000, h = (sim.tr - sim.tc) / N;
    let J = 0; // Simpson 法
    for (let i = 0; i <= N; i++) {
      const w = i === 0 || i === N ? 1 : i % 2 ? 4 : 2;
      J += w * CC.stateAt(sim, Math.min(sim.tc + i * h, sim.tr - 1e-15)).F;
    }
    J *= h / 3;
    const b = CC.stateAt(sim, 0), a = CC.stateAt(sim, sim.tr + 0.5);
    close(J, -(a.p1 - b.p1), 1e-8, 'J = −Δp1');
    close(J, a.p2 - b.p2, 1e-8, 'J = Δp2');
    close(J, sim.contact.J, 1e-8, 'J = 2μu');
  }
});

test('彈簧：k 越大接觸時間越短、最大彈力越大，但衝量與最後速度相同', () => {
  const c = { m1: 2, m2: 3, v1: 3, v2: -1 };
  let prev = null;
  for (const k of KS) {
    const s = CC.springContact(c.m1, c.m2, c.v1, c.v2, k);
    if (prev) {
      assert.ok(s.dt < prev.dt && s.Fmax > prev.Fmax);
      close(s.J, prev.J, 1e-12);
    }
    prev = s;
  }
});

test('不加彈簧時行為與原本相同（x = F = U = 0，tr = tc）', () => {
  for (const e of ES) {
    const p = { m1: 2, m2: 3, v1: 3, v2: -1, e, w1: 1, w2: 1.2, x1: 2, x2: 8 };
    const a = CC.createSim(p), b = CC.createSim(Object.assign({ k: 0, L0: 1 }, p));
    assert.strictEqual(a.spring, false); assert.strictEqual(b.spring, false);
    assert.strictEqual(a.tr, a.tc); close(a.tc, ((8 - 0.6) - (2 + 0.5)) / 4, 1e-12);
    for (let t = 0; t <= 6; t += 0.1) {
      const sa = CC.stateAt(a, t), sb = CC.stateAt(b, t);
      assert.deepStrictEqual(sa, sb);
      assert.strictEqual(sa.U, 0); assert.strictEqual(sa.F, 0); assert.strictEqual(sa.contact, false);
      const f = CC.collide(2, 3, 3, -1, e);
      if (t >= a.tc) { close(sa.v1, f.v1, 1e-12); close(sa.v2, f.v2, 1e-12); }
    }
  }
  assert.throws(() => CC.springContact(1, 1, 1, 0, 0), RangeError);
  assert.throws(() => CC.createSim({ m1: 1, m2: 1, v1: 1, v2: 0, e: 1, w1: 1, w2: 1, x1: 0, x2: 5, k: 100, L0: 0 }), RangeError);
});

console.log(`\n${passed} 項通過`);
