// 以 Node 執行：node tests/elevator-core.test.js
'use strict';
const assert = require('assert');
const E = require('../js/elevator-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
const g = E.G;

/** 檢查一串段落首尾相接：時間、位置、速度連續 */
function checkContinuous(track, msg) {
  for (let i = 1; i < track.length; i++) {
    const p = track[i - 1], q = track[i];
    close(q.t0, p.t1, 1e-12, (msg || '') + ` 第 ${i} 段起點時間`);
    const e = E.segEnd(p);
    close(q.y0, e.y, 1e-10, (msg || '') + ` 第 ${i} 段起點位置`);
    close(q.v0, e.v, 1e-10, (msg || '') + ` 第 ${i} 段起點速度`);
  }
}

// 各種行程：(起點, 終點, 最大加速度 A, 最高速率 V)
const TRIPS = [
  [0, 27, 1, 2.5], [27, 0, 1, 2.5], [0, 3, 1, 2.5], [9, 6, 2.3, 6], [0, 27, 0.98, 6],
  [3, 24, 3, 0.5], [12, 15, 0.5, 6], [0, 27, 0.5, 0.5], [21, 3, 1.96, 4.2], [4.37, 18, 1.2, 3.3]
];

console.log('elevator-core');

test('樓層：1F 在 y = 0、每層 3 m、10F 在 27 m；floorOf 找最近的樓層', () => {
  assert.strictEqual(E.floorY(1), 0);
  assert.strictEqual(E.floorY(10), 27);
  assert.strictEqual(E.Y_MAX, 27);
  assert.deepStrictEqual(E.floorOf(15), { n: 6, off: 0 });
  const f = E.floorOf(16.2);
  assert.strictEqual(f.n, 6); close(f.off, 1.2, 1e-12);
  assert.strictEqual(E.floorOf(-0.4).n, 1);
  assert.strictEqual(E.floorOf(40).n, 10);
});

test('行程：首尾相接、從靜止出發、準確停在目標、|v| ≤ V、|a| ≤ A', () => {
  for (const [y0, y1, A, V] of TRIPS) {
    const tr = E.tripProfile(y0, y1, A, V, 2);
    checkContinuous(tr, `${y0}→${y1}`);
    assert.strictEqual(tr[0].v0, 0, '出發時靜止');
    close(tr[0].y0, y0, 1e-12, '起點');
    const last = tr[tr.length - 1];
    assert.strictEqual(last.kind, 'rest');
    assert.strictEqual(last.y0, y1, '準確停在目標（完全相等）');
    assert.strictEqual(last.v0, 0);
    for (const s of tr) {
      assert.ok(Math.abs(s.a) <= A + 1e-12, '|a| ≤ A');
      assert.ok(Math.abs(s.v0) <= V + 1e-12, '|v| ≤ V');
      const e = E.segEnd(s);
      if (e) assert.ok(Math.abs(e.v) <= V + 1e-12, '|v| ≤ V');
    }
  }
});

test('行程時間：d ≥ V²/A 時 T = d/V + V/A（梯形）；否則 T = 2√(d/A)、最高速率 √(Ad)（三角形）', () => {
  for (const [y0, y1, A, V] of TRIPS) {
    const d = Math.abs(y1 - y0);
    const tr = E.tripProfile(y0, y1, A, V, 0);
    const T = tr[tr.length - 1].t0;
    const expect = d >= V * V / A ? d / V + V / A : 2 * Math.sqrt(d / A);
    close(T, expect, 1e-12, `T(${y0}→${y1})`);
    close(E.tripDuration(d, A, V), expect, 1e-12, 'tripDuration');
    const vmax = Math.max.apply(null, tr.map(s => Math.abs(s.v0)).concat(tr.filter(s => isFinite(s.t1)).map(s => Math.abs(E.segEnd(s).v))));
    close(vmax, d >= V * V / A ? V : Math.sqrt(A * d), 1e-12, '最高速率');
    close(E.tripPeakSpeed(d, A, V), vmax, 1e-12, 'tripPeakSpeed');
  }
  // 1F → 10F、A = 1、V = 2.5：T = 27/2.5 + 2.5 = 13.3 s
  close(E.tripDuration(27, 1, 2.5), 13.3, 1e-12, '1F→10F');
});

test('a–t 圖下面積 = Δv = 0；v–t 圖下面積 = 位移 Δy（每一段也成立）', () => {
  for (const [y0, y1, A, V] of TRIPS) {
    const tr = E.tripProfile(y0, y1, A, V, 1);
    const tEnd = tr[tr.length - 1].t0;
    close(E.areaA(tr, 1, tEnd), 0, 1e-12, '∫a dt');
    close(E.areaV(tr, 1, tEnd), y1 - y0, 1e-12, '∫v dt');
    for (const s of tr.slice(0, -1)) {
      const e = E.segEnd(s);
      close(E.areaA(tr, s.t0, s.t1), e.v - s.v0, 1e-12, '每段 ∫a dt = Δv');
      close(E.areaV(tr, s.t0, s.t1), e.y - s.y0, 1e-12, '每段 ∫v dt = Δy');
    }
    // 在任意時刻：y(t) − y0 = ∫v dt
    for (const f of [0.13, 0.5, 0.77]) {
      const t = 1 + f * (tEnd - 1);
      close(E.stateAt(tr, t).y - y0, E.areaV(tr, 1, t), 1e-12, '任意時刻 y − y0 = ∫v dt');
      close(E.stateAt(tr, t).v, E.areaA(tr, 1, t), 1e-12, '任意時刻 v = ∫a dt');
    }
  }
});

test('視重 N = m(g + a)：加速上升、減速下降超重；減速上升、加速下降失重；等速時等於實重', () => {
  const m = 60;
  for (const [y0, y1, A, V] of TRIPS) {
    const tr = E.tripProfile(y0, y1, A, V, 0);
    const up = y1 > y0;
    for (const s of tr) {
      const N = E.normalForce(m, s.a);
      close(N, m * (g + s.a), 1e-14, 'N = m(g + a)');
      if (s.kind === 'acc') assert.strictEqual(E.phaseOf(s.a), up ? 'over' : 'under');
      if (s.kind === 'dec') assert.strictEqual(E.phaseOf(s.a), up ? 'under' : 'over');
      if (s.kind === 'cruise' || s.kind === 'rest') {
        assert.strictEqual(E.phaseOf(s.a), 'normal');
        assert.strictEqual(N, m * g, '等速或靜止：N = mg');
        assert.strictEqual(E.reading(m, s.a), m, '讀數 = 質量的公斤重數');
      }
    }
  }
  // 60 kg、a = 1.96 m/s²（= 0.2g）→ 72 kgw
  close(E.reading(60, 1.96), 72, 1e-12, '72 kgw');
  close(E.reading(60, -1.96), 48, 1e-12, '48 kgw');
  close(E.kgw(9.8), 1, 1e-15, '1 kgw = 9.8 N');
});

test('視重只跟加速度有關、跟速度無關：等速上升 6 m/s 與靜止讀數相同', () => {
  const tr = E.tripProfile(0, 27, 2, 6, 0);
  const cruise = tr.find(s => s.kind === 'cruise');
  assert.ok(cruise && cruise.v0 === 6, '有 6 m/s 的等速段');
  assert.strictEqual(E.reading(75, cruise.a), E.reading(75, 0));
  // 同樣 a = +1，向上加速與向下減速讀數相同
  const down = E.tripProfile(27, 0, 2, 6, 0);
  const dec = down.find(s => s.kind === 'dec');
  assert.ok(dec.v0 < 0 && dec.a > 0, '向下運動、加速度向上');
  assert.strictEqual(E.reading(75, dec.a), E.reading(75, tr[0].a));
});

test('第三定律：秤對人的力與人對秤的力大小相等、方向相反；mg 與 N 不是一對（a ≠ 0 時不相等）', () => {
  for (const a of [-g, -3, -1, 0, 0.98, 2.5, 9.8]) {
    const f = E.forces(70, a);
    assert.strictEqual(f.normal + f.onScale, 0, '作用力與反作用力的和為 0');
    assert.strictEqual(Math.abs(f.normal), Math.abs(f.onScale));
    close(f.net, 70 * a, 1e-12, '合力 N − mg = ma');
    close(f.normal + f.weight, 70 * a, 1e-12, '人受的兩個力相加 = ma');
    if (a !== 0) assert.ok(Math.abs(f.normal + f.weight) > 1e-9, 'a ≠ 0 時 N 與 mg 不抵消');
    else assert.strictEqual(f.normal + f.weight, 0, '靜止或等速時 N 與 mg 大小相等（但仍不是一對）');
  }
});

test('自由落體：N = 0、彈簧拉力 0、伸長量 0（完全失重）；a < −g 時讀數也不會是負的', () => {
  assert.strictEqual(E.normalForce(60, -g), 0);
  assert.strictEqual(E.reading(60, -g), 0);
  assert.strictEqual(E.springTension(1.5, -g), 0);
  assert.strictEqual(E.springExtension(E.springTension(1.5, -g)), 0);
  assert.strictEqual(E.phaseOf(-g), 'free');
  assert.strictEqual(E.normalForce(60, -12), 0);
});

test('彈簧秤：T = ms(g + a)、伸長量 x = T/k；伸長量的比值 = (g + a)/g', () => {
  const k = E.K_SPRING;
  for (const ms of [0.5, 1, 2]) {
    const x0 = E.springExtension(E.springTension(ms, 0));
    close(x0, ms * g / k, 1e-14, '靜止時 x0 = msg/k');
    for (const a of [-4, -1, 0, 1.2, 7.84]) {
      const T = E.springTension(ms, a);
      close(T, ms * (g + a), 1e-14, 'T');
      close(E.springExtension(T), T / k, 1e-14, 'x = T/k');
      close(k * E.springExtension(T), T, 1e-14, 'kx = T');
      close(E.springExtension(T) / x0, (g + a) / g, 1e-12, 'x/x0');
    }
  }
  close(E.springExtension(E.springTension(1, 7.84)) / E.springExtension(E.springTension(1, 0)), 1.8, 1e-12, 'a = 0.8g → 1.8 倍');
});

test('纜繩斷裂（從靜止）：自由落體到 vTrip，再以 ab 煞停；下降距離 = vTrip²/(2g) + vTrip²/(2ab)', () => {
  for (const [vTrip, ab] of [[5, 4.9], [2, 2], [7.67, 9.8], [10, 9.8], [6.26, 4.9]]) {
    const y0 = 27;
    const tr = E.freeFallPlan(3, y0, 0, vTrip, ab);
    checkContinuous(tr, '斷裂');
    assert.deepStrictEqual(tr.map(s => s.kind), ['free', 'brake', 'held']);
    const free = tr[0], brake = tr[1], held = tr[2];
    assert.strictEqual(free.a, -g);
    close(free.t1 - free.t0, vTrip / g, 1e-12, '自由落體時間 vTrip/g');
    close(E.segEnd(free).v, -vTrip, 1e-12, '煞車時速率 = vTrip');
    close(brake.t1 - brake.t0, vTrip / ab, 1e-12, '煞車時間 vTrip/ab');
    close(E.segEnd(brake).v, 0, 1e-12, '煞車後停止');
    close(y0 - held.y0, E.dropFromRest(vTrip, ab), 1e-12, '總下降距離');
    close(held.y0, E.predictStop(y0, 0, vTrip, ab), 1e-12, 'predictStop');
    close(E.dropFromRest(vTrip, ab), vTrip * vTrip / (2 * g) + vTrip * vTrip / (2 * ab), 1e-14);
    // 讀數：自由落體 0；煞車中 m(g + ab)；夾住後 mg
    assert.strictEqual(E.reading(60, free.a), 0);
    close(E.reading(60, brake.a), 60 * (1 + ab / g), 1e-12, '煞車時超重');
    assert.strictEqual(E.reading(60, held.a), 60);
    // a–t 面積：自由落體 −vTrip、煞車 +vTrip，總和為 0
    close(E.areaA(tr, 3, held.t0), 0, 1e-12, '∫a dt = 0');
    close(E.areaV(tr, 3, held.t0), held.y0 - y0, 1e-12, '∫v dt = Δy');
  }
});

test('纜繩斷裂（向上運動中）：先減速上升（仍是自由落體、讀數 0），再落下', () => {
  const tr = E.freeFallPlan(0, 10, 2.5, 5, 4.9);
  checkContinuous(tr);
  const free = tr[0];
  close(free.t1, (2.5 + 5) / g, 1e-12, '速度由 +2.5 變成 −5');
  const top = E.stateAt(tr, 2.5 / g);
  close(top.v, 0, 1e-12, '最高點速度為 0');
  close(top.y, 10 + 2.5 * 2.5 / (2 * g), 1e-12, '再上升 v²/(2g)');
  assert.strictEqual(E.reading(60, E.stateAt(tr, 0.1).a), 0, '往上運動時也是完全失重');
  close(tr[2].y0, E.predictStop(10, 2.5, 5, 4.9), 1e-12, 'predictStop（向上）');
  // 已經比 vTrip 更快往下：立刻煞車
  const fast = E.freeFallPlan(0, 20, -6, 5, 4.9);
  assert.strictEqual(fast[0].kind, 'brake');
  close(fast[1].y0, 20 - 36 / (2 * 4.9), 1e-12);
  close(fast[1].y0, E.predictStop(20, -6, 5, 4.9), 1e-12);
});

test('手動按下緊急煞車：比限速器早煞車，一定停得比較高', () => {
  for (const [vTrip, ab] of [[5, 4.9], [8, 2], [10, 9.8]]) {
    const tr = E.freeFallPlan(0, 27, 0, vTrip, ab);
    for (const f of [0.1, 0.4, 0.8]) {
      const tb = f * tr[0].t1, s = E.stateAt(tr, tb);
      const b = E.brakeNow(tb, s.y, s.v, ab);
      close(E.segEnd(b[0]).v, 0, 1e-12, '煞停');
      close(b[1].y0, s.y - s.v * s.v / (2 * ab), 1e-12, '煞車距離 v²/(2ab)');
      assert.ok(b[1].y0 > tr[2].y0, '早煞車停得比較高');
    }
  }
  // 往上運動時按煞車：到最高點被夾住
  const up = E.brakeNow(0, 5, 2, 4.9);
  close(up[up.length - 1].y0, 5 + 4 / (2 * g), 1e-12);
});

test('手動駕駛：按住加速、放開等速、反向按住減速到停；不超過最高速率', () => {
  const A = 1.5, V = 3;
  let tr = E.manualPlan(0, 6, 0, +1, A, V);
  checkContinuous(tr);
  assert.strictEqual(tr[0].a, A);
  close(tr[0].t1, V / A, 1e-12, '加速到 V');
  assert.strictEqual(tr[1].a, 0, '之後等速');
  assert.strictEqual(tr[1].v0, V);
  // 放開：從加速途中的狀態改成等速
  const s = E.stateAt(tr, 1);
  tr = E.manualPlan(1, s.y, s.v, 0, A, V);
  assert.strictEqual(tr[0].a, 0);
  close(tr[0].v0, 1.5, 1e-12);
  // 反向按住：減速到 0 停住
  const s2 = E.stateAt(tr, 2);
  tr = E.manualPlan(2, s2.y, s2.v, -1, A, V);
  close(tr[0].t1 - 2, 1.5 / A, 1e-12, '減速時間');
  assert.strictEqual(tr[1].kind, 'rest');
  close(tr[1].y0, s2.y + 1.5 * 1.5 / (2 * A), 1e-12, '停止距離 v²/(2A)');
  // 靜止又放開：維持靜止
  assert.deepStrictEqual(E.manualPlan(5, 9, 0, 0, A, V).map(x => x.kind), ['rest']);
  // 在 10F 靜止按住向上：動不了
  assert.deepStrictEqual(E.manualPlan(5, 27, 0, +1, A, V).map(x => x.kind), ['rest']);
});

test('手動駕駛的終端保護：不論怎麼開，都剛好停在 1F 或 10F，不會衝出井道', () => {
  // 一直按住向上：加速 → 等速 → 自動減速，剛好停在 27 m
  for (const [y0, A, V] of [[0, 1, 2.5], [0, 3, 6], [20, 0.5, 6], [26, 1, 2], [0, 0.5, 0.5]]) {
    const tr = E.manualPlan(0, y0, 0, +1, A, V);
    checkContinuous(tr, `y0=${y0}`);
    const last = tr[tr.length - 1];
    assert.strictEqual(last.y0, 27, '停在 10F');
    assert.ok(tr.some(s => s.kind === 'protect'), '有終端保護');
    for (const s of tr) {
      assert.ok(Math.abs(s.a) <= A + 1e-9, '減速度不超過 A');
      for (let k = 0; k <= 20; k++) {
        if (!isFinite(s.t1)) break;
        const p = E.segAt(s, s.t0 + (s.t1 - s.t0) * k / 20);
        assert.ok(p.y <= 27 + 1e-9 && p.y >= -1e-9, '不出界');
        assert.ok(Math.abs(p.v) <= V + 1e-9, '不超速');
      }
    }
  }
  // 一直按住向下也一樣停在 0
  const dn = E.manualPlan(0, 27, 0, -1, 2, 5);
  assert.strictEqual(dn[dn.length - 1].y0, 0);
  // 隨機的按鍵順序：任何時刻都在井道內、速度連續、|v| ≤ V
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let trial = 0; trial < 60; trial++) {
    const A = 0.5 + 2.5 * rnd(), V = 0.5 + 5.5 * rnd();
    let t = 0, track = E.manualPlan(0, 27 * rnd(), 0, 0, A, V);
    let prev = E.stateAt(track, 0);
    for (let k = 0; k < 40; k++) {
      t += 0.05 + 3 * rnd();
      const st = E.stateAt(track, t);
      assert.ok(st.y <= 27 + 1e-9 && st.y >= -1e-9, '在井道內');
      assert.ok(Math.abs(st.v) <= V + 1e-9, '|v| ≤ V');
      const cmd = [-1, 0, 1][Math.floor(rnd() * 3)];
      const next = E.manualPlan(t, st.y, st.v, cmd, A, V);
      close(next[0].y0, st.y, 1e-12); close(next[0].v0, st.v, 1e-12);
      track = next;
      prev = st;
    }
    assert.ok(prev);
  }
});

test('小球：靜止時 t = √(2h/g)；等加速度 a 時 t = √(2h/(g + a))，等效重力 g + a', () => {
  const h = E.BALL_H;
  const still = [E.rest(0, 9)];
  const tl = E.ballLanding(still, { tr: 1, yb: 9 + h, vb: 0 }, 1);
  close(tl - 1, Math.sqrt(2 * h / g), 1e-12, '靜止');
  close(E.fallTime(h, 0), Math.sqrt(2 * h / g), 1e-14);
  // 加速上升 a = 2.3：在加速段中放開
  const tr = E.tripProfile(0, 27, 2.3, 6, 0);
  const s = E.stateAt(tr, 0.2);
  const t2 = E.ballLanding(tr, { tr: 0.2, yb: s.y + h, vb: s.v }, 0.2);
  close(t2 - 0.2, Math.sqrt(2 * h / (g + 2.3)), 1e-12, '加速上升');
  close(2 * h / ((t2 - 0.2) * (t2 - 0.2)), g + 2.3, 1e-10, '量到的等效重力 = g + a');
  close((t2 - 0.2) / E.fallTime(h, 0), Math.sqrt(g / (g + 2.3)), 1e-12, '時間比');
  // 等速段放開：與靜止相同
  const c = tr.find(x => x.kind === 'cruise');
  const tc = c.t0 + 0.3, sc = E.stateAt(tr, tc);
  close(E.ballLanding(tr, { tr: tc, yb: sc.y + h, vb: sc.v }, tc) - tc, Math.sqrt(2 * h / g), 1e-12, '等速');
  // 落地時刻小球高度為 0
  close(E.ballHeight(tr, { tr: 0.2, yb: s.y + h, vb: s.v }, t2), 0, 1e-9, '落地高度 0');
});

test('小球在自由落體中漂浮，煞車開始後才以 g + ab 落下', () => {
  const vTrip = 8, ab = 4.9, h = E.BALL_H;
  const tr = E.freeFallPlan(0, 27, 0, vTrip, ab);
  const tr0 = 0.3, s = E.stateAt(tr, tr0);
  const ball = { tr: tr0, yb: s.y + h, vb: s.v };
  const tf = vTrip / g;
  close(E.ballHeight(tr, ball, tf - 0.01), h, 1e-9, '自由落體期間高度不變');
  const tl = E.ballLanding(tr, ball, tr0);
  close(tl, tf + Math.sqrt(2 * h / (g + ab)), 1e-10, '煞車後 √(2h/(g + ab)) 落地');
});

test('小球在途中換段（加速 → 等速）也能準確找到落地時刻', () => {
  const tr = E.tripProfile(0, 27, 1, 1.2, 0); // 加速段只有 1.2 s
  const tr0 = 1.0, s = E.stateAt(tr, tr0), h = E.BALL_H;
  const ball = { tr: tr0, yb: s.y + h, vb: s.v };
  const tl = E.ballLanding(tr, ball, tr0);
  close(E.ballHeight(tr, ball, tl), 0, 1e-9, '落地');
  assert.ok(tl > 1.2, '落地時已經進入等速段');
  // 用很細的時間步長檢查之前都還沒落地
  for (let t = tr0; t < tl - 1e-6; t += 1e-3) assert.ok(E.ballHeight(tr, ball, t) > 0);
});

console.log(`\n  ${passed} 項通過${process.exitCode ? '，有失敗' : ''}`);
