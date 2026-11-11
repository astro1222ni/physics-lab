// 以 Node 執行：node tests/incline-friction-core.test.js
'use strict';
const assert = require('assert');
const IC = require('../js/incline-friction-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
const g = 9.8, D = Math.PI / 180;
const P = (o) => Object.assign({ m: 2, theta: 20 * D, mus: 0.5, muk: 0.3, F: 0, mode: 'along' }, o);
const OPT = { xMin: 0, xMax: 1e9, gates: [0.5, 1.5] };
const find = (ev, type) => ev.filter(e => e.type === type);

console.log('incline-friction-core');

test('分力：mg sin θ、mg cos θ，N = mg cos θ（沒有外力）', () => {
  for (const th of [0, 10, 33.3, 60, 89]) {
    const k = IC.components(P({ theta: th * D, m: 3 }));
    close(k.W, 3 * g, 1e-14, 'W');
    close(k.Wpar, 3 * g * Math.sin(th * D), 1e-14, 'mg sinθ');
    close(k.Wperp, 3 * g * Math.cos(th * D), 1e-14, 'mg cosθ');
    close(k.N, k.Wperp, 1e-14, 'N');
    close(Math.hypot(k.Wpar, k.Wperp), k.W, 1e-14, '分量合成回 W');
  }
});

test('靜摩擦力「需要多少給多少」：f = −(mg sin θ − F)，且不超過 μs N', () => {
  for (const F of [0, 3, 6.7, 10, -2]) {
    const p = P({ F: F });
    const fo = IC.forcesAt(p, 0, 0);
    const need = -(2 * g * Math.sin(20 * D) - F);
    if (Math.abs(need) <= 0.5 * 2 * g * Math.cos(20 * D)) {
      assert.strictEqual(fo.kind, 'static');
      close(fo.f, need, 1e-14, 'f = F − mg sinθ');
      assert.strictEqual(fo.a, 0);
      assert.strictEqual(fo.net, 0);
    }
  }
  // 往上推的力剛好等於 mg sin θ：靜摩擦力為 0
  const fo = IC.forcesAt(P({ F: 2 * g * Math.sin(20 * D) }), 0, 0);
  close(fo.f, 0, 1e-12, '靜摩擦力為 0');
});

test('臨界角 θc = arctan μs：略小於 θc 不滑、略大於 θc 開始滑', () => {
  for (const mus of [0.1, 0.5, 0.74, 1.0, 1.4]) {
    const thc = IC.criticalAngle(mus);
    close(Math.tan(thc), mus, 1e-14, 'tan θc');
    const below = IC.forcesAt(P({ mus: mus, muk: mus * 0.6, theta: thc - 1e-6 }), 0, 0);
    const above = IC.forcesAt(P({ mus: mus, muk: mus * 0.6, theta: thc + 1e-6 }), 0, 0);
    assert.strictEqual(below.a, 0, 'θc 以下靜止');
    assert.strictEqual(below.kind, 'static');
    assert.ok(above.a > 0 && above.kind === 'kinetic' && above.dir === 1, 'θc 以上往下滑');
    // 剛開始滑動時加速度 g(sin θ − μk cos θ) > 0，因為 μk < μs
    close(above.a, g * (Math.sin(thc + 1e-6) - 0.6 * mus * Math.cos(thc + 1e-6)), 1e-12, 'a');
  }
  // 臨界角與質量無關
  for (const m of [0.5, 5]) {
    const thc = IC.criticalAngle(0.5);
    assert.strictEqual(IC.forcesAt(P({ m: m, theta: thc - 1e-7 }), 0, 0).a, 0);
    assert.ok(IC.forcesAt(P({ m: m, theta: thc + 1e-7 }), 0, 0).a > 0);
  }
});

test('往下滑：a = g(sin θ − μk cos θ)，x = ½at²、v = at（精確解）', () => {
  for (const [th, mus, muk] of [[35, 0.5, 0.3], [50, 0.74, 0.57], [12, 0.1, 0.03], [80, 1.0, 0.8]]) {
    const p = P({ theta: th * D, mus: mus, muk: muk, m: 1.7 });
    const a = g * (Math.sin(th * D) - muk * Math.cos(th * D));
    close(IC.slideAccel(p, 1), a, 1e-13, 'slideAccel');
    const r = IC.simulate(p, IC.newState(0, 0, 0), 0.9, OPT, 1 / 60);
    close(r.s.x, 0.5 * a * 0.81, 1e-12, 'x');
    close(r.s.v, a * 0.9, 1e-12, 'v');
    assert.strictEqual(find(r.ev, 'slip').length, 1, '只有一次 slip');
  }
});

test('光電門：由靜止釋放的通過時間 t = √(2x/a)，反推 a 與 μk', () => {
  const th = 35 * D, p = P({ theta: th });
  const a = IC.slideAccel(p, 1);
  const r = IC.simulate(p, IC.newState(0, 0, 0), 3, OPT, 1 / 60);
  const gs = find(r.ev, 'gate');
  assert.strictEqual(gs.length, 2);
  close(gs[0].t, Math.sqrt(2 * 0.5 / a), 1e-12, 't1');
  close(gs[1].t, Math.sqrt(2 * 1.5 / a), 1e-12, 't2');
  close(gs[1].v, Math.sqrt(2 * a * 1.5), 1e-12, 'v2');
  const aa = IC.accelFromGates(0.5, gs[0].t, 1.5, gs[1].t);
  close(aa, a, 1e-12, 'a 由光電門');
  close(IC.mukFromAccel(th, aa), 0.3, 1e-12, 'μk 反推');
});

test('沿斜面往上推：a（向上）= F/m − g(sin θ + μk cos θ)，forceForAccel 一致', () => {
  for (const [th, F, m] of [[20, 30, 2], [0, 15, 2], [45, 60, 3.5]]) {
    const p = P({ theta: th * D, F: F, m: m });
    const fo = IC.forcesAt(p, -0.5, 0); // 正在往上滑
    const aUp = F / m - g * (Math.sin(th * D) + 0.3 * Math.cos(th * D));
    close(-fo.a, aUp, 1e-13, '向上的加速度');
    close(fo.f, 0.3 * m * g * Math.cos(th * D), 1e-13, '往上滑時摩擦力向下');
    close(IC.forceForAccel(p, -1, -1), m * (1 + g * Math.sin(th * D) + 0.3 * g * Math.cos(th * D)), 1e-13, 'a = 1 m/s² 向上所需的力');
  }
  // 從靜止推：要超過 mg(sin θ + μs cos θ) 才推得動
  const t = IC.thresholds(P());
  close(t.upStart, 2 * g * (Math.sin(20 * D) + 0.5 * Math.cos(20 * D)), 1e-14, 'upStart');
  assert.strictEqual(IC.forcesAt(P({ F: t.upStart - 1e-9 }), 0, 0).a, 0, '差一點點推不動');
  const go = IC.forcesAt(P({ F: t.upStart + 1e-6 }), 0, 0);
  assert.ok(go.a < 0 && go.dir === -1, '超過就往上滑');
  // 一推動，摩擦力降為 μk N，加速度立刻是 (μs − μk) g cos θ（向上）
  close(-go.a, (0.5 - 0.3) * g * Math.cos(20 * D), 1e-6, '起動瞬間的加速度');
});

test('水平推：N = mg cos θ + F sin θ，沿斜面分量 F cos θ；門檻與自鎖', () => {
  const th = 30 * D, F = 20;
  const k = IC.components(P({ theta: th, F: F, mode: 'horiz' }));
  close(k.N, 2 * g * Math.cos(th) + F * Math.sin(th), 1e-14, 'N 變大');
  close(k.Fpar, -F * Math.cos(th), 1e-14, '沿斜面向上的分量');
  const t = IC.thresholds(P({ theta: th, mode: 'horiz' }));
  close(t.upStart, 2 * g * (Math.sin(th) + 0.5 * Math.cos(th)) / (Math.cos(th) - 0.5 * Math.sin(th)), 1e-14, 'upStart');
  assert.strictEqual(IC.forcesAt(P({ theta: th, mode: 'horiz', F: t.upStart - 1e-9 }), 0, 0).a, 0);
  assert.ok(IC.forcesAt(P({ theta: th, mode: 'horiz', F: t.upStart + 1e-6 }), 0, 0).a < 0);
  // 往上等速：F = mg(sin θ + μk cos θ)/(cos θ − μk sin θ)
  const fo = IC.forcesAt(P({ theta: th, mode: 'horiz', F: t.upConst }), -1, 0);
  close(fo.a, 0, 1e-12, '等速');
  // 自鎖：θ ≥ arctan(1/μs) 時，水平推力再大也推不上去
  const lock = IC.lockAngle(0.5);
  close(lock / D, 90 - Math.atan(0.5) / D, 1e-13, '自鎖角 = 90° − θc');
  const tl = IC.thresholds(P({ theta: lock + 0.01, mode: 'horiz' }));
  assert.ok(tl.selfLock && tl.upStart === Infinity, '自鎖');
  for (const FF of [tl.hold + 0.01, 50, 500, 1e5]) {
    const f2 = IC.forcesAt(P({ theta: lock + 0.01, mode: 'horiz', F: FF }), 0, 0);
    assert.strictEqual(f2.a, 0, 'F = ' + FF + ' 也推不動');
    assert.ok(Math.abs(f2.f) <= f2.fsMax + 1e-9);
  }
  // 推力不夠時會往下滑
  assert.ok(IC.forcesAt(P({ theta: lock + 0.01, mode: 'horiz', F: tl.hold - 0.01 }), 0, 0).a > 0);
});

test('撐住不滑的最小推力：沿斜面 mg(sin θ − μs cos θ)，水平 mg(sin θ − μs cos θ)/(cos θ + μs sin θ)', () => {
  const th = 40 * D;
  const ta = IC.thresholds(P({ theta: th }));
  close(ta.hold, 2 * g * (Math.sin(th) - 0.5 * Math.cos(th)), 1e-14);
  assert.strictEqual(IC.forcesAt(P({ theta: th, F: ta.hold + 1e-9 }), 0, 0).a, 0);
  assert.ok(IC.forcesAt(P({ theta: th, F: ta.hold - 1e-6 }), 0, 0).a > 0);
  const th2 = IC.thresholds(P({ theta: th, mode: 'horiz' }));
  close(th2.hold, 2 * g * (Math.sin(th) - 0.5 * Math.cos(th)) / (Math.cos(th) + 0.5 * Math.sin(th)), 1e-14);
  // 推力剛好 = hold 時，靜摩擦力恰為最大值 μs N（方向沿斜面向上）
  const fo = IC.forcesAt(P({ theta: th, F: ta.hold }), 0, 0);
  close(fo.f, -fo.fsMax, 1e-12, 'f = −μs N');
  // 不到臨界角時 hold ≤ 0：不推也不滑
  assert.ok(IC.thresholds(P({ theta: 20 * D })).hold < 0);
});

test('往上射出：減速 g(sin θ + μk cos θ)、停下；tan θ ≤ μs 時停住（重新被黏住）', () => {
  const th = 20 * D, v0 = -3; // 往上
  const p = P({ theta: th });
  const aUp = g * (Math.sin(th) + 0.3 * Math.cos(th));
  const r = IC.simulate(p, IC.newState(1.7, v0, 1), 5, { xMin: -10, xMax: 1.7 }, 0.01);
  const st = find(r.ev, 'stop');
  assert.strictEqual(st.length, 1);
  close(st[0].t, 3 / aUp, 1e-12, '停下的時間');
  close(1.7 - st[0].x, 9 / (2 * aUp), 1e-12, '上滑距離 v0²/(2a)');
  assert.strictEqual(find(r.ev, 'stick').length, 1, '停住');
  assert.strictEqual(find(r.ev, 'turn').length, 0);
  assert.strictEqual(find(r.ev, 'slip').length, 0, '不是靜摩擦被突破');
  assert.strictEqual(r.s.v, 0);
  close(r.s.x, st[0].x, 1e-14, '之後一直停在那裡');
});

test('往上射出：tan θ > μs 時停下後立刻滑回來，往返時間 = v0/a上 + √(2d/a下)', () => {
  const th = 35 * D, v0 = -4.67;
  const p = P({ theta: th });
  const aUp = g * (Math.sin(th) + 0.3 * Math.cos(th)), aDn = g * (Math.sin(th) - 0.3 * Math.cos(th));
  const d = v0 * v0 / (2 * aUp);
  const r = IC.simulate(p, IC.newState(1.7, v0, 1), 4, { xMin: 0, xMax: 1.7 }, 1 / 60);
  assert.strictEqual(find(r.ev, 'turn').length, 1, '轉向');
  assert.strictEqual(find(r.ev, 'stick').length, 0);
  const hit = find(r.ev, 'hit');
  assert.strictEqual(hit.length, 1);
  assert.strictEqual(hit[0].end, 1, '回到下端');
  close(hit[0].t, -v0 / aUp + Math.sqrt(2 * d / aDn), 1e-12, '往返時間');
  close(hit[0].v, Math.sqrt(2 * aDn * d), 1e-12, '回到底端的速率 √(2 a下 d) < |v0|');
  assert.ok(hit[0].v < Math.abs(v0));
});

test('往下滑但 tan θ < μk：減速、在 d = v0²/(2g(μk cos θ − sin θ)) 停住', () => {
  const th = 10 * D, v0 = 1.89;
  const p = P({ theta: th });
  const dec = g * (0.3 * Math.cos(th) - Math.sin(th));
  const r = IC.simulate(p, IC.newState(0, v0, 0), 3, OPT, 1 / 60);
  const s = find(r.ev, 'stick');
  assert.strictEqual(s.length, 1);
  close(s[0].x, v0 * v0 / (2 * dec), 1e-12, '停住的位置');
  close(s[0].t, v0 / dec, 1e-12, '停住的時間');
});

test('等速下滑：tan θ = μk 時 a = 0；靜止放著不會自己動（μs > μk），輕推一下才會等速滑', () => {
  const th = Math.atan(0.3);
  const p = P({ theta: th });
  close(IC.slideAccel(p, 1), 0, 1e-14, 'a = 0');
  const rest = IC.simulate(p, IC.newState(0, 0, 0), 2, OPT, 0.05);
  assert.strictEqual(rest.s.x, 0, '不推就不動');
  const r = IC.simulate(p, IC.newState(0, 0.8, 0), 2, OPT, 1 / 60);
  close(r.s.v, 0.8, 1e-12, '速度不變');
  close(r.s.x, 1.6, 1e-12, 'x = vt');
  const gs = find(r.ev, 'gate');
  close(gs[1].t - gs[0].t, 1 / 0.8, 1e-12, '兩個光電門之間 Δt = Δx/v');
});

test('撞到下端擋板：撞擊速率 √(2aL)，之後靠著擋板（擋板分擔摩擦力撐不住的部分）', () => {
  const th = 40 * D, p = P({ theta: th });
  const a = IC.slideAccel(p, 1);
  const r = IC.simulate(p, IC.newState(0, 0, 0), 3, { xMin: 0, xMax: 1.7 }, 1 / 60);
  const hit = find(r.ev, 'hit');
  assert.strictEqual(hit.length, 1);
  close(hit[0].v, Math.sqrt(2 * a * 1.7), 1e-12, '撞擊速率');
  close(hit[0].t, Math.sqrt(2 * 1.7 / a), 1e-12, '到達時間');
  assert.strictEqual(r.s.contact, 1);
  const fo = IC.forcesAt(p, 0, 1);
  assert.strictEqual(fo.a, 0);
  close(fo.f + fo.P + fo.D, 0, 1e-12, '合力為 0');
  assert.ok(fo.P < 0, '擋板往上推');
  close(fo.f, -fo.fsMax, 1e-14, '摩擦力取最大靜摩擦');
  // 用力往上推離擋板：擋板不能拉，木塊往上滑
  const up = IC.simulate(P({ theta: th, F: 40 }), r.s, 0.2, { xMin: 0, xMax: 1.7 }, 1 / 60);
  assert.ok(up.s.x < 1.7 && up.s.v < 0, '離開擋板往上');
});

test('能量：½mv² 的變化 = 重力作功 + 外力作功 + 摩擦力作功；摩擦生熱 = μk N × 路徑長', () => {
  const cases = [
    { p: P({ theta: 35 * D }), s: IC.newState(0, 0, 0), T: 0.8 },
    { p: P({ theta: 35 * D, F: 10 }), s: IC.newState(0, 1, 0), T: 0.6 },
    { p: P({ theta: 25 * D, F: 30, mode: 'horiz', m: 3 }), s: IC.newState(1.7, -2, 1), T: 0.5 },
    { p: P({ theta: 35 * D }), s: IC.newState(1.7, -4, 1), T: 1.2 } // 上去再下來（路徑長 ≠ 位移）
  ];
  for (const c of cases) {
    const r = IC.simulate(c.p, c.s, c.T, { xMin: -100, xMax: 100 }, 1 / 60);
    const dK = IC.kinetic(c.p.m, r.s.v) - IC.kinetic(c.p.m, c.s.v);
    close(dK, r.s.wG + r.s.wF + r.s.wf - r.s.lost, 1e-11, '功能定理');
    const k = IC.components(c.p);
    close(-r.s.wf, k.fk * r.s.path, 1e-12, 'Q = μk N × 路徑長');
    close(r.s.wG, k.Wpar * (r.s.x - c.s.x), 1e-12, '重力作功只看位移');
  }
  // 撞擋板損失的動能另外記錄
  const p = P({ theta: 50 * D });
  const r = IC.simulate(p, IC.newState(0, 0, 0), 2, { xMin: 0, xMax: 1.7 }, 1 / 60);
  close(r.s.lost, r.s.wG + r.s.wf, 1e-11, '停在底端：撞擊損失 = 重力作功 − 摩擦生熱');
});

test('極限 θ = 0：水平桌面，靜摩擦力 = 拉力，直到 μs mg；之後動摩擦 μk mg', () => {
  const p0 = P({ theta: 0 });
  const k = IC.components(p0);
  assert.strictEqual(k.Wpar, 0);
  assert.strictEqual(k.N, 2 * g);
  for (const F of [0, 2, 5, 9.8]) {
    const fo = IC.forcesAt(P({ theta: 0, F: F }), 0, 0);
    assert.strictEqual(fo.a, 0);
    close(fo.f, F, 1e-14, '經典摩擦力圖的斜直線 f = F');
  }
  const go = IC.forcesAt(P({ theta: 0, F: 9.8 + 1e-9 }), 0, 0);
  assert.ok(go.kind === 'kinetic');
  close(go.f, 0.3 * 2 * g, 1e-14, '降為 μk mg');
  close(-go.a, (9.8 - 0.3 * 2 * g) / 2, 1e-9, 'a = (F − μk mg)/m');
  // 水平推在 θ = 0 時與沿斜面推相同
  const h = IC.forcesAt(P({ theta: 0, F: 7, mode: 'horiz' }), 0, 0), a2 = IC.forcesAt(P({ theta: 0, F: 7 }), 0, 0);
  close(h.N, a2.N, 1e-14); close(h.f, a2.f, 1e-14);
  // 沒有外力時放在水平面上永遠不動；給初速會以 μk g 減速
  const r = IC.simulate(p0, IC.newState(0, 2, 0), 2, OPT, 1 / 60);
  close(find(r.ev, 'stick')[0].x, 4 / (2 * 0.3 * g), 1e-12, '滑行距離 v²/(2μk g)');
});

test('極限 θ = 90°：沿斜面時 N = 0、沒有摩擦，自由落體 a = g；水平壓在牆上要 F ≥ mg/μs', () => {
  const p = P({ theta: Math.PI / 2 });
  const k = IC.components(p);
  assert.strictEqual(k.N, 0);
  assert.strictEqual(k.Wpar, 2 * g);
  const fo = IC.forcesAt(p, 0, 0);
  assert.strictEqual(fo.f, 0);
  close(fo.a, g, 1e-14, 'a = g');
  const r = IC.simulate(p, IC.newState(0, 0, 0), 0.5, OPT, 1 / 60);
  close(r.s.x, 0.5 * g * 0.25, 1e-12, '自由落體');
  // 壓在牆上
  const t = IC.thresholds(P({ theta: Math.PI / 2, mode: 'horiz' }));
  close(t.hold, 2 * g / 0.5, 1e-14, 'F = mg/μs');
  assert.strictEqual(IC.forcesAt(P({ theta: Math.PI / 2, mode: 'horiz', F: 39.2 }), 0, 0).a, 0, '剛好壓住');
  assert.ok(IC.forcesAt(P({ theta: Math.PI / 2, mode: 'horiz', F: 39.1 }), 0, 0).a > 0, '少一點就滑下');
  const wall = IC.forcesAt(P({ theta: Math.PI / 2, mode: 'horiz', F: 60 }), 0, 0);
  close(wall.N, 60, 1e-14, 'N = F'); close(wall.f, -2 * g, 1e-14, '靜摩擦力 = mg，向上');
  assert.ok(IC.thresholds(P({ theta: Math.PI / 2, mode: 'horiz' })).selfLock, '牆面當然推不上去');
});

test('先黏住再突破（stick–slip）：慢慢抬高斜面，在 θc 開始滑；放低到 θ < arctan μk 會減速停住', () => {
  let s = IC.newState(0.2, 0, 0), slipTh = null;
  const opt = { xMin: 0, xMax: 1e9 };
  for (let th = 10; th < 40; th += 0.001) {
    const r = IC.step(P({ theta: th * D }), s, 0.001, opt);
    s = r.s;
    if (find(r.ev, 'slip').length) { slipTh = th; break; }
  }
  close(slipTh, Math.atan(0.5) / D, 0.0011 / 26.57, '滑動角 = θc');
  // 繼續往下滑，再把斜面放低到 10°：減速停住並黏住
  const r2 = IC.simulate(P({ theta: 30 * D }), s, 0.5, opt, 1 / 60);
  assert.ok(r2.s.v > 0);
  const r3 = IC.simulate(P({ theta: 10 * D }), r2.s, 3, opt, 1 / 60);
  assert.strictEqual(find(r3.ev, 'stick').length, 1);
  assert.strictEqual(find(r3.ev, 'slip').length, 0);
  assert.strictEqual(r3.s.v, 0);
});

test('μk 不可大於 μs；μs = μk 時開始滑動的加速度從 0 連續增加', () => {
  const k = IC.components(P({ mus: 0.3, muk: 0.6 }));
  assert.strictEqual(k.muk, 0.3);
  const thc = Math.atan(0.4);
  const fo = IC.forcesAt(P({ mus: 0.4, muk: 0.4, theta: thc + 1e-6 }), 0, 0);
  assert.ok(fo.a > 0 && fo.a < 1e-4);
});

test('靠在擋板或被手扶住時：合力為 0，摩擦力不超過 μs N', () => {
  const p = P({ theta: 60 * D });
  for (const c of [1, 2]) {
    const fo = IC.forcesAt(p, 0, c);
    assert.strictEqual(fo.a, 0);
    close(fo.D + fo.f + fo.P, 0, 1e-12);
    assert.ok(Math.abs(fo.f) <= fo.fsMax + 1e-12);
  }
  // 上端擋板只能往下推：往下滑的木塊不受影響
  assert.ok(IC.forcesAt(p, 0, -1).a > 0);
});

test('力固定時，分成很多小段或一大段前進，結果相同（解析解，不累積誤差）', () => {
  const p = P({ theta: 30 * D, F: 3 });
  const a = IC.simulate(p, IC.newState(0, 0.5, 0), 1.2, OPT, 1.2);
  const b = IC.simulate(p, IC.newState(0, 0.5, 0), 1.2, OPT, 0.001);
  close(a.s.x, b.s.x, 1e-12); close(a.s.v, b.s.v, 1e-12);
  close(a.s.wf, b.s.wf, 1e-12);
});

test('神秘表面：μs ∈ [0.30, 0.85]，0 < μk < μs', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 500; i++) {
    const s = IC.mysterySurface(rnd);
    assert.ok(s.mus >= 0.3 && s.mus <= 0.85, 'μs ' + s.mus);
    assert.ok(s.muk > 0.1 && s.muk < s.mus, 'μk ' + s.muk);
  }
  IC.SURFACES.forEach(s => assert.ok(s.mus > s.muk, s.id + ' 的 μs > μk'));
});

console.log(`\n${passed} 項通過${process.exitCode ? '，有失敗項目' : ''}`);
