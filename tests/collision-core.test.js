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

console.log(`\n${passed} 項通過`);
