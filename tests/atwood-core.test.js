// 以 Node 執行：node tests/atwood-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/atwood-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
const g = C.G;
const DEG = Math.PI / 180;

// 取時間軸上一些時刻（含每一段的中點）
function sampleTimes(tl) {
  const ts = [0];
  tl.segs.forEach(function (s) {
    if (isFinite(s.t1)) { ts.push((s.t0 + s.t1) / 2, s.t0 + 0.25 * (s.t1 - s.t0), s.t0 + 0.9 * (s.t1 - s.t0)); }
    else ts.push(s.t0 + 0.5);
  });
  return ts;
}
const P1 = (o) => Object.assign({ m1: 0.7, m2: 0.5, h: 1, v0: 0 }, o);
const P2 = (o) => Object.assign({ M: 1, m: 0.6, muS: 0.5, muK: 0.3, d: 0.6, v0: 0 }, o);
const P4 = (o) => Object.assign({ M: 1, m: 0.9, theta: 30, muS: 0.2, muK: 0.1, d: 0.5, v0: 0 }, o);
const P3 = (o) => Object.assign({ m: [1, 2, 3], F: 20, push: false, muS: 0.2, muK: 0.1, d: 1, v0: 0 }, o);

console.log('atwood-core');

// ---------------- 模式 1：阿特午機 ----------------
test('阿特午機：a = (m1 − m2)g/(m1 + m2)、T = 2m1m2g/(m1 + m2)', () => {
  for (const [m1, m2] of [[0.7, 0.5], [2, 0.05], [0.6, 0.4], [1.234, 0.987]]) {
    const r = C.atwood(m1, m2);
    close(r.a, (m1 - m2) * g / (m1 + m2), 1e-14, 'a');
    close(r.T, 2 * m1 * m2 * g / (m1 + m2), 1e-14, 'T');
    const tl = C.timeline(1, P1({ m1, m2 }));
    close(tl.segs[0].aA, r.a, 1e-12, '時間軸第一段 a');
    close(tl.segs[0].T, r.T, 1e-12, '時間軸第一段 T');
    // 每個物體自己的 F = ma：m1g − T = m1 a、T − m2g = m2 a
    close(m1 * g - r.T, m1 * r.a, 1e-12, 'm1');
    close(r.T - m2 * g, m2 * r.a, 1e-12, 'm2');
  }
});

test('阿特午機極限：m2 → 0 自由落體、等質量 a = 0、張力介於兩重量之間', () => {
  const r0 = C.atwood(1, 1e-9);
  close(r0.a, g, 1e-8, 'm2 → 0 時 a → g');
  close(r0.T, 0, 1e-7, 'm2 → 0 時 T → 0');
  const r1 = C.atwood(0.8, 0.8);
  assert.strictEqual(r1.a, 0, '等質量 a = 0');
  close(r1.T, 0.8 * g, 1e-14, '等質量 T = mg');
  for (const [m1, m2] of [[0.7, 0.5], [2, 0.3], [0.3, 1.5]]) {
    const r = C.atwood(m1, m2);
    assert.ok(r.T > Math.min(m1, m2) * g && r.T < Math.max(m1, m2) * g, 'T 介於 m2g 與 m1g 之間');
  }
});

test('阿特午機：落地時間 t = √(2h/a)，由 t 反推 a 與 g', () => {
  for (const [m1, m2, h] of [[0.7, 0.5, 1], [0.55, 0.45, 0.6], [1.5, 0.2, 0.3]]) {
    const tl = C.timeline(1, P1({ m1, m2, h }));
    const ms = C.firstMeasure(tl);
    const a = C.atwood(m1, m2).a;
    assert.ok(ms && ms.type === 'landB', '第一個事件是 m1 落地');
    close(ms.t, Math.sqrt(2 * h / a), 1e-10, '落地時間');
    close(ms.d, h, 1e-12, '距離 = h');
    close(ms.v, Math.sqrt(2 * a * h), 1e-9, '落地速率 √(2ah)');
    const aM = C.accelFromTime(h, ms.t, 0);
    close(aM, a, 1e-10, '由 t 反推 a');
    close(C.gFromAtwood(aM, m1, m2), g, 1e-10, '由 a 反推 g');
  }
  // 有初速 v0：h = v0 t + at²/2
  const tl = C.timeline(1, P1({ v0: 0.4 }));
  const ms = C.firstMeasure(tl), a = C.atwood(0.7, 0.5).a;
  close(0.4 * ms.t + 0.5 * a * ms.t * ms.t, 1, 1e-10, '有初速時 h = v0t + at²/2');
  close(C.accelFromTime(1, ms.t, 0.4), a, 1e-9, '有初速時反推 a');
});

test('阿特午機：m1 < m2 從靜止釋放 → 不動，m2 留在地上（地板正向力 (m2 − m1)g、張力 m1g）', () => {
  const p = P1({ m1: 0.5, m2: 0.7 });
  const tl = C.timeline(1, p);
  assert.strictEqual(tl.segs.length, 1);
  assert.strictEqual(tl.end.reason, 'rest');
  const st = C.stateAt(tl, 3);
  assert.strictEqual(st.xA, 0); assert.strictEqual(st.xB, 0);
  close(st.seg.T, 0.5 * g, 1e-12, 'T = m1 g');
  close(st.seg.stopA, 0.2 * g, 1e-12, '地板多出的支撐力');
  assert.strictEqual(C.firstMeasure(tl), null);
});

test('阿特午機：m1 落地後繩子鬆弛，m2 做鉛直上拋，再上升 v²/2g', () => {
  const p = P1({ m1: 1.2, m2: 0.4, h: 0.8 });
  const tl = C.timeline(1, p);
  const a = C.atwood(1.2, 0.4).a, v = Math.sqrt(2 * a * 0.8);
  const land = tl.events.find((e) => e.type === 'landB');
  close(land.v, v, 1e-9, '落地速率');
  const slack = tl.segs.find((s) => !s.taut);
  close(slack.aA, -g, 1e-14, '鬆弛時 m2 的加速度 = −g');
  assert.strictEqual(slack.T, 0, '鬆弛時張力為 0');
  close(slack.floorB, 1.2 * g, 1e-12, 'm1 在地上：正向力 = m1g');
  // 最高點
  const top = tl.segs.find((s) => !s.taut && s.vA === 0 && s.xA > 0.8);
  close(top.xA - 0.8, v * v / (2 * g), 1e-9, '多上升 v²/2g');
  // 再拉緊：沿繩方向的動量守恆，速度變 m2/(m1 + m2) 倍
  const jerk = tl.events.find((e) => e.type === 'jerk');
  close(jerk.v1, -0.4 * v / 1.6, 1e-9, '拉緊後的共同速度');
});

test('阿特午機：等質量給初速 → 等速度運動（牛頓第一定律）', () => {
  const p = P1({ m1: 0.5, m2: 0.5, v0: 0.5 });
  const tl = C.timeline(1, p);
  const s0 = tl.segs[0];
  assert.strictEqual(s0.aA, 0, 'a = 0');
  close(s0.T, 0.5 * g, 1e-14, 'T = mg');
  const ms = C.firstMeasure(tl);
  close(ms.t, 1 / 0.5, 1e-12, 't = h/v0');
  assert.ok(tl.end.frozen && tl.end.reason === 'time', '之後的往返超過時間上限而凍結');
});

// ---------------- 模式 2：桌面＋懸掛 ----------------
test('桌面＋懸掛：m ≤ μs M 不動（靜摩擦 = mg），m > μs M 才動', () => {
  for (const [M, m, muS] of [[1, 0.4, 0.5], [2, 0.6, 0.3], [1, 0.5, 0.5]]) {
    const r = C.tableHanging(M, m, muS, 0.3);
    assert.strictEqual(r.dir, 0, '不動');
    close(-r.f, m * g, 1e-12, '靜摩擦 = mg');
    close(r.T, m * g, 1e-12, 'T = mg');
  }
  const r = C.tableHanging(1, 0.501, 0.5, 0.3);
  assert.strictEqual(r.dir, 1, '剛超過最大靜摩擦就會動');
});

test('桌面＋懸掛：a = (m − μk M)g/(M + m)、T = Mmg(1 + μk)/(M + m)', () => {
  for (const [M, m, muS, muK] of [[1, 0.6, 0.5, 0.3], [2, 1.5, 0.4, 0.2], [0.5, 0.3, 0, 0]]) {
    const r = C.tableHanging(M, m, muS, muK);
    close(r.a, (m - muK * M) * g / (M + m), 1e-12, 'a');
    close(r.T, M * m * g * (1 + muK) / (M + m), 1e-12, 'T');
    // 木塊：T − μk Mg = Ma；懸掛物：mg − T = ma
    close(r.T - muK * M * g, M * r.a, 1e-12, '木塊 F = ma');
    close(m * g - r.T, m * r.a, 1e-12, '懸掛物 F = ma');
  }
  // 光滑桌面：a = mg/(M + m)
  close(C.tableHanging(3, 1, 0, 0).a, g / 4, 1e-14, '光滑桌面');
});

test('桌面＋懸掛：μ 很大 → 不動；μ = 0 時懸掛質量 → 0 則 a → 0', () => {
  assert.strictEqual(C.tableHanging(1, 2, 5, 4).dir, 0);
  close(C.tableHanging(1, 1e-9, 0, 0).a, 0, 1e-8);
});

test('桌面＋懸掛：給初速、m = μk M → 等速前進到擋板；動摩擦大於拉力則減速停下', () => {
  const tl = C.timeline(2, P2({ M: 1, m: 0.3, muS: 0.5, muK: 0.3, v0: 0.5 }));
  close(tl.segs[0].aA, 0, 1e-12, '等速');
  close(C.firstMeasure(tl).t, 0.6 / 0.5, 1e-10, 't = d/v0');
  const tl2 = C.timeline(2, P2({ M: 1, m: 0.1, muS: 0.5, muK: 0.3, v0: 0.5 }));
  const a2 = (0.1 - 0.3) * g / 1.1;
  close(tl2.segs[0].aA, a2, 1e-12, '減速度');
  assert.strictEqual(tl2.events[0].type, 'stop', '先停下');
  close(tl2.segs[1].xA, 0.25 / (-2 * a2), 1e-10, '停下的距離 v0²/2|a|');
  assert.strictEqual(tl2.end.reason, 'rest', '停下後靜摩擦撐得住');
  assert.strictEqual(C.firstMeasure(tl2), null);
});

test('桌面＋懸掛：撞到擋板後兩物體都停下（繩子仍拉緊）', () => {
  const tl = C.timeline(2, P2());
  const last = tl.segs[tl.segs.length - 1];
  assert.ok(last.restA && last.restB && last.taut);
  close(last.xA, 0.6, 1e-12); close(last.xB, 0.6, 1e-12);
  close(last.T, 0.6 * g, 1e-12, '靜止後 T = mg');
});

// ---------------- 模式 4：斜面＋懸掛 ----------------
test('斜面＋懸掛：三種情況（上滑、下滑、靜止）與解析解', () => {
  const s = Math.sin(30 * DEG), c = Math.cos(30 * DEG);
  // 上滑：m > M(sinθ + μs cosθ)
  let r = C.inclineHanging(1, 0.9, 30, 0.2, 0.1);
  assert.strictEqual(r.dir, 1);
  close(r.a, (0.9 - (s + 0.1 * c)) * g / 1.9, 1e-12, '上滑 a');
  close(r.T, 0.9 * (g - r.a), 1e-12, '上滑 T');
  // 下滑：m < M(sinθ − μs cosθ)
  r = C.inclineHanging(1, 0.2, 30, 0.1, 0.1);
  assert.strictEqual(r.dir, -1);
  close(r.a, (0.2 - (s - 0.1 * c)) * g / 1.2, 1e-12, '下滑 a（負號 = 沿斜面向下）');
  // 靜止：介於兩者之間
  r = C.inclineHanging(1, 0.5, 30, 0.2, 0.1);
  assert.strictEqual(r.dir, 0);
  close(r.f, -(0.5 * g - g * s), 1e-12, '靜摩擦 = −(mg − Mg sinθ)');
  // 剛好平衡：m = M sinθ 時靜摩擦為零
  r = C.inclineHanging(1, 0.5, 30, 0.3, 0.2);
  close(r.f, 0, 1e-12, 'm = M sinθ 時不需要摩擦力');
});

test('斜面＋懸掛：θ = 0 與桌面＋懸掛相同；θ = 90° 光滑時就是阿特午機', () => {
  const a = C.inclineHanging(1.3, 0.7, 0, 0.4, 0.25), b = C.tableHanging(1.3, 0.7, 0.4, 0.25);
  close(a.a, b.a, 1e-12); close(a.T, b.T, 1e-12);
  const c = C.inclineHanging(0.5, 0.7, 90, 0, 0), d = C.atwood(0.7, 0.5);
  close(c.a, d.a, 1e-12); close(c.T, d.T, 1e-12);
});

test('斜面＋懸掛：μ 很大 → 不動；方向由靜摩擦正確決定', () => {
  assert.strictEqual(C.inclineHanging(1, 3, 40, 10, 8).dir, 0);
  assert.strictEqual(C.inclineHanging(1, 0, 40, 10, 8).dir, 0);
  // 不會因為 μk < μs 而判斷錯：剛好在最大靜摩擦內就不動
  const s = Math.sin(25 * DEG), c = Math.cos(25 * DEG);
  const mUp = 1.5 * (s + 0.3 * c);
  assert.strictEqual(C.inclineHanging(1.5, mUp * 0.999, 25, 0.3, 0.1).dir, 0);
  assert.strictEqual(C.inclineHanging(1.5, mUp * 1.001, 25, 0.3, 0.1).dir, 1);
  const mDn = 1.5 * (s - 0.3 * c);
  assert.strictEqual(C.inclineHanging(1.5, mDn * 1.001, 25, 0.3, 0.1).dir, 0);
  assert.strictEqual(C.inclineHanging(1.5, mDn * 0.999, 25, 0.3, 0.1).dir, -1);
});

test('斜面＋懸掛：往上衝的木塊減速、停下、再滑回來（停下時重新判斷靜摩擦）', () => {
  const p = P4({ M: 1, m: 0.1, theta: 35, muS: 0.15, muK: 0.1, v0: 0.8, d: 0.6 });
  const tl = C.timeline(4, p);
  assert.strictEqual(tl.events[0].type, 'stop', '先停下');
  const s1 = tl.segs[1];
  assert.ok(s1.aA < 0, '停下後往下滑');
  const s = Math.sin(35 * DEG), c = Math.cos(35 * DEG);
  close(s1.aA, (0.1 - (s - 0.1 * c)) * g / 1.1, 1e-12, '下滑時的 a（摩擦力改為沿斜面向上）');
  close(tl.segs[0].aA, (0.1 - (s + 0.1 * c)) * g / 1.1, 1e-12, '上衝時的 a（摩擦力沿斜面向下）');
});

// ---------------- 模式 3：推拉連體 ----------------
test('推拉連體：a = (F − μk Σm g)/Σm；推時接觸力 = F × 前方質量/Σm，拉時張力 = F × 後方質量/Σm', () => {
  for (const push of [true, false]) {
    for (const ms of [[1, 2, 3], [2, 0.5], [1.2, 1.2, 0.4]]) {
      const p = P3({ m: ms, push: push, F: 25 });
      const r = C.trainDynamics(p, 0);
      const M = ms.reduce((a, b) => a + b, 0);
      close(r.a, (25 - 0.1 * M * g) / M, 1e-12, 'a');
      for (let i = 0; i < ms.length - 1; i++) {
        let mm = 0;
        if (push) for (let j = i + 1; j < ms.length; j++) mm += ms[j];
        else for (let j = 0; j <= i; j++) mm += ms[j];
        close(r.link[i], 25 * mm / M, 1e-12, (push ? '接觸力 ' : '張力 ') + i);
      }
    }
  }
  // 「哪一條繩子張力比較大」：越靠近拉力的繩子張力越大，且與摩擦係數無關
  const r1 = C.trainDynamics(P3({ muS: 0, muK: 0 }), 0), r2 = C.trainDynamics(P3({ muS: 0.3, muK: 0.25 }), 0);
  assert.ok(r1.link[1] > r1.link[0]);
  close(r1.link[1] / r1.link[0], 3, 1e-12, 'T 前/T 後 = (m1 + m2)/m1');
  close(r1.link[0], r2.link[0], 1e-12, '與 μ 無關');
});

test('推拉連體：F ≤ μs Σm g 不動；靜止時摩擦力總和 = F，由受力端依序分擔', () => {
  const p = P3({ F: 5, push: true });
  const r = C.trainDynamics(p, 0);
  assert.ok(!r.moving);
  close(-r.f.reduce((a, b) => a + b, 0), 5, 1e-12, '總靜摩擦 = F');
  close(-r.f[0], Math.min(5, 0.2 * 1 * g), 1e-12, '第一塊先承擔最多 μs m1 g');
  close(r.link[0], 5 - 0.2 * g, 1e-12, '剩下的傳給第二塊');
  const big = C.trainDynamics(P3({ F: 30, muS: 2, muK: 1.5 }), 0);
  assert.ok(!big.moving, 'μ 很大不動');
  const r3 = C.trainDynamics(P3({ F: 0.2 * 6 * g + 1e-6 }), 0);
  assert.ok(r3.moving, '剛超過最大靜摩擦就動');
});

test('推拉連體：抵達終點的時間與速度', () => {
  const p = P3({ F: 20, muK: 0.1, d: 1, v0: 0.3 });
  const tl = C.timeline(3, p);
  const a = (20 - 0.1 * 6 * g) / 6;
  const ms = C.firstMeasure(tl);
  close(0.3 * ms.t + 0.5 * a * ms.t * ms.t, 1, 1e-10, 'd = v0t + at²/2');
  close(C.accelFromTime(1, ms.t, 0.3), a, 1e-9);
});

// ---------------- 所有模式：每個物體 ΣF = ma、第三定律、繩子限制 ----------------
const CASES = [
  [1, P1()], [1, P1({ m1: 1.9, m2: 0.1 })], [1, P1({ m1: 0.5, m2: 0.5, v0: 0.6 })], [1, P1({ m1: 0.4, m2: 0.6, v0: 1 })],
  [2, P2()], [2, P2({ m: 0.3 })], [2, P2({ m: 0.1, v0: 1 })], [2, P2({ muS: 0, muK: 0, m: 0.2 })],
  [4, P4()], [4, P4({ m: 0.2, muS: 0.1, muK: 0.1 })], [4, P4({ m: 0.5 })], [4, P4({ m: 0.1, theta: 35, muS: 0.15, muK: 0.1, v0: 0.8, d: 0.6 })],
  [4, P4({ m: 0.3, theta: 55, muS: 0, muK: 0, d: 0.7 })], [4, P4({ m: 1.5, theta: 10, muS: 0.6, muK: 0.4, v0: 0.4 })]
];

test('每一個物體在每一刻都滿足 ΣF = ma（含鬆弛、落地、靜止）', () => {
  let n = 0;
  for (const [mode, p] of CASES) {
    const tl = C.timeline(mode, p);
    for (const t of sampleTimes(tl)) {
      const st = C.stateAt(tl, t);
      if (st.seg.frozen) continue;
      for (const b of C.bodyForces(mode, p, st).bodies) {
        const F = C.netForce(b);
        close(F[0], b.m * b.ax, 1e-9, `模式 ${mode} 物體 ${b.id} x 方向`);
        close(F[1], b.m * b.ay, 1e-9, `模式 ${mode} 物體 ${b.id} y 方向`);
        n++;
      }
    }
  }
  for (const push of [true, false]) {
    for (const F of [0, 5, 20, 40]) {
      const p = P3({ push, F, v0: F === 5 ? 0.8 : 0 });
      const tl = C.timeline(3, p);
      for (const t of sampleTimes(tl)) {
        const st = C.stateAt(tl, t);
        if (st.seg.frozen) continue;
        for (const b of C.bodyForces(3, p, st).bodies) {
          const Fn = C.netForce(b);
          close(Fn[0], b.m * b.ax, 1e-9, '模式 3 x'); close(Fn[1], b.m * b.ay, 1e-9, '模式 3 y');
          n++;
        }
      }
    }
  }
  assert.ok(n > 200);
});

test('第三定律：木塊之間的接觸力大小相等、方向相反；輕繩兩端張力相等', () => {
  for (const ms of [[1, 2, 3], [0.5, 2.5]]) {
    for (const F of [5, 30]) {
      const p = P3({ m: ms, push: true, F });
      const bodies = C.bodyForces(3, p, { seg: C.timeline(3, p).segs[0] }).bodies;
      for (let i = 0; i < ms.length - 1; i++) {
        const onI = bodies[i].forces.find((f) => f.key === 'P' && f.by === i + 1);
        const onJ = bodies[i + 1].forces.find((f) => f.key === 'P' && f.by === i);
        if (!onI) { assert.ok(!onJ); continue; }
        close(onI.x, -onJ.x, 1e-12, '接觸力成對'); close(onI.y, -onJ.y, 1e-12);
        assert.ok(onI.x < 0 && onJ.x > 0, '前面的木塊往後推、後面的往前推');
      }
    }
  }
  for (const [mode, p] of CASES) {
    const tl = C.timeline(mode, p);
    const st = C.stateAt(tl, 0);
    const bs = C.bodyForces(mode, p, st).bodies;
    const TA = bs[0].forces.find((f) => f.key === 'T'), TB = bs[1].forces.find((f) => f.key === 'T');
    if (TA) close(Math.hypot(TA.x, TA.y), Math.hypot(TB.x, TB.y), 1e-12, '同一條輕繩兩端張力相等');
  }
});

test('繩子不可伸長：任何時刻 xB ≤ xA（拉緊時相等），且都在行程限制之內；位置連續', () => {
  for (const [mode, p] of CASES) {
    const tl = C.timeline(mode, p);
    const sys = tl.sys;
    for (const t of sampleTimes(tl)) {
      const st = C.stateAt(tl, t);
      assert.ok(st.xB <= st.xA + 1e-9, `模式 ${mode}：繩子被拉長了`);
      if (st.taut) close(st.xA, st.xB, 1e-9, '拉緊時位移相同');
      assert.ok(st.xA >= sys.aMin - 1e-9 && st.xA <= sys.aMax + 1e-9, 'A 超出行程');
      assert.ok(st.xB >= sys.bMin - 1e-9 && st.xB <= sys.bMax + 1e-9, 'B 超出行程');
    }
    // 段與段之間位置連續
    for (let i = 1; i < tl.segs.length; i++) {
      const a = tl.segs[i - 1], b = tl.segs[i];
      if (b.frozen) continue;
      const tau = b.t0 - a.t0;
      close(a.xA + a.vA * tau + 0.5 * a.aA * tau * tau, b.xA, 1e-9, 'xA 連續');
      close(a.xB + a.vB * tau + 0.5 * a.aB * tau * tau, b.xB, 1e-9, 'xB 連續');
    }
  }
});

test('繩子拉緊時張力不會是負的（繩子只能拉不能推）', () => {
  for (const [mode, p] of CASES) {
    C.timeline(mode, p).segs.forEach((s) => assert.ok(s.T >= -1e-12, `模式 ${mode} T = ${s.T}`));
  }
});

// ---------------- 能量 ----------------
test('光滑時力學能守恆；有摩擦時力學能的減少 = 動摩擦力作的功', () => {
  const smooth = [[1, P1()], [1, P1({ m1: 1.5, m2: 0.2, v0: 0.3 })], [2, P2({ muS: 0, muK: 0, m: 0.4 })], [4, P4({ muS: 0, muK: 0, m: 0.3, theta: 40 })], [4, P4({ muS: 0, muK: 0, m: 1.2, theta: 20 })]];
  for (const [mode, p] of smooth) {
    const tl = C.timeline(mode, p), s0 = tl.segs[0];
    const E0 = C.energy(mode, p, C.stateAt(tl, 0)).E;
    for (const f of [0.2, 0.5, 0.95]) {
      const t = s0.t0 + f * (s0.t1 - s0.t0);
      close(C.energy(mode, p, C.stateAt(tl, t)).E, E0, 1e-9, `模式 ${mode} 力學能守恆`);
    }
  }
  const rough = [[2, P2()], [2, P2({ m: 0.3, v0: 0.5 })], [4, P4()], [4, P4({ m: 0.2, muS: 0.1, muK: 0.1 })]];
  for (const [mode, p] of rough) {
    const tl = C.timeline(mode, p), s0 = tl.segs[0];
    const t = s0.t0 + 0.8 * (s0.t1 - s0.t0);
    const E0 = C.energy(mode, p, C.stateAt(tl, 0)).E, st = C.stateAt(tl, t);
    const E1 = C.energy(mode, p, st).E;
    const W = Math.abs(s0.fA) * Math.abs(st.xA);
    close(E0 - E1, W, 1e-9, `模式 ${mode} 損失 = μk N × 路徑長`);
    assert.ok(W > 0);
  }
});

test('繩子突然拉緊是完全非彈性：沿繩方向「動量」守恆、動能減少', () => {
  for (const [mode, p] of [[1, P1({ m1: 1.2, m2: 0.4, h: 0.8 })], [4, P4({ m: 0.2, muS: 0.1, muK: 0.1 })]]) {
    const tl = C.timeline(mode, p);
    const e = tl.events.find((x) => x.type === 'jerk');
    assert.ok(e, '有繩子拉緊的事件');
    const before = C.stateAt(tl, e.t - 1e-9), after = C.stateAt(tl, e.t + 1e-9);
    const mA = mode === 1 ? p.m2 : p.M, mB = mode === 1 ? p.m1 : p.m;
    close(mA * before.vA + mB * before.vB, (mA + mB) * after.vA, 1e-6, '沿繩方向動量');
    const K0 = 0.5 * mA * before.vA ** 2 + 0.5 * mB * before.vB ** 2, K1 = 0.5 * (mA + mB) * after.vA ** 2;
    assert.ok(K1 < K0, '動能減少');
  }
});

test('幾何：桌面與斜面的懸掛物在木塊撞到擋板之前不會落地', () => {
  for (const d of [0.2, 0.5, 0.8]) for (const m of [0.01, 1, 2]) {
    const g2 = C.geometry(2, P2({ d, m }));
    assert.ok(g2.bMax > g2.aMax + 0.04, '模式 2');
  }
  for (const d of [0.2, 0.7]) for (const m of [0.01, 2]) for (const th of [0, 30, 60]) {
    const g4 = C.geometry(4, P4({ d, m, theta: th }));
    assert.ok(g4.bMax > g4.aMax + 0.04, '模式 4 不落地');
    assert.ok(-g4.bMin >= d + 0.05, '模式 4 往上至少能走 d');
    assert.ok(g4.stopBot >= 0, '下擋板在斜面上');
  }
  for (const h of [0.2, 1]) for (const m1 of [0.05, 2]) {
    const g1 = C.geometry(1, P1({ h, m1 }));
    assert.ok(g1.bMin < -0.5 && g1.aMax > h, '模式 1 不會撞到滑輪');
  }
});

test('rootAfter：等加速度運動到達某位置的時間', () => {
  close(C.rootAfter(0, 0, 2, 1), 1, 1e-14);
  close(C.rootAfter(0, 1, 0, 3), 3, 1e-14);
  close(C.rootAfter(0, 3, -2, 2), 1, 1e-12, '先到達的那一次');
  assert.strictEqual(C.rootAfter(0, 1, -2, 1), Infinity, '到不了');
  close(C.rootAfter(1, -1, 0, 0), 1, 1e-14);
});

console.log(`\n${passed} 項通過${process.exitCode ? '，有失敗' : ''}`);
