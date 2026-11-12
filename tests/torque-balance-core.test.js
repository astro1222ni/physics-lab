// 以 Node 執行：node tests/torque-balance-core.test.js
'use strict';
const assert = require('assert');
const TC = require('../js/torque-balance-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
const g = TC.G, D = Math.PI / 180, H = TC.SEESAW.H, L = TC.SEESAW.L;
let nid = 1;
const item = (kind, x, hang) => ({ id: 'i' + (nid++), kind, m: TC.KINDS[kind].m, x, hang: !!hang });
const cfgOf = (o) => Object.assign({ M: 0, p: 2, L: L, H: H, items: [], scale: null }, o);
/** 從放開開始跑到某事件（或 T 秒），傳回 { st, events } */
function run(cfg, T, stop, h) {
  let st = TC.seesawRelease(cfg);
  const evs = [];
  const dt = 1 / 120;
  for (let t = 0; t < T; t += dt) {
    const r = TC.seesawAdvance(cfg, st, dt, h ? { h } : undefined);
    st = r.st; evs.push(...r.events);
    if (stop && r.events.some(e => e.type === stop)) break;
  }
  return { st, events: evs };
}

console.log('torque-balance-core');

// ---------------- 靜力平衡 ----------------
test('常數：g 為標準重力加速度 9.80665 m/s²（定義值）', () => {
  assert.strictEqual(g, 9.80665);
});

test('力矩 τ = −m g (x − p) cos θ；逆時針為正，順時針、逆時針分開加總', () => {
  const cfg = cfgOf({ M: 4, p: 1.5, items: [item('w2', 0.5), item('w5', 3.25), item('w1', 1.5)] });
  for (const th of [0, 7 * D, -12 * D]) {
    const tq = TC.torques(cfg, th);
    const c = Math.cos(th);
    const want = [ // 板子（重心在 2 m）、2 kg（左 1 m）、5 kg（右 1.75 m）、1 kg（在支點正上方）
      -4 * g * 0.5 * c, 2 * g * 1.0 * c, -5 * g * 1.75 * c, 0
    ];
    tq.list.forEach((f, i) => close(f.tau, want[i], 1e-13, 'τ' + i));
    close(tq.ccw, 2 * g * c, 1e-13, '逆時針合計');
    close(tq.cw, (2 + 8.75) * g * c, 1e-13, '順時針合計');
    close(tq.net, -g * c * TC.sums(cfg).S, 1e-13, '淨力矩 = −g S cos θ');
    tq.list.forEach(f => close(Math.abs(f.arm), Math.abs(f.x - cfg.p) * c, 1e-13, '力臂 = 水平距離'));
  }
});

test('槓桿原理：m1 d1 = m2 d2 時淨力矩為零，放開後保持水平（level）', () => {
  const cfg = cfgOf({ M: 6, p: 2, items: [item('w5', 1.0), item('w2', 3.5), item('w1', 4.0)] }); // 5×1 = 2×1.5 + 1×2，板子對稱
  close(TC.torques(cfg, 0).net, 0, 1e-12);
  const r = run(cfg, 2);
  assert.strictEqual(r.st.rest, 'level');
  assert.strictEqual(r.st.theta, 0);
  assert.strictEqual(r.events.length, 0);
  const re = TC.reactions(cfg, r.st);
  close(re.N, (6 + 8) * g, 1e-13, '支點正向力 = 總重');
});

test('一個物體讓不平衡的板子平衡：x = p − S/m（含板子本身的重量）', () => {
  for (const [M, p, m] of [[5, 1.5, 5], [8, 2.75, 2], [12, 1.25, 20], [0.5, 2.6, 1]]) {
    const cfg = cfgOf({ M, p });
    const x = TC.balancePosition(cfg, m);
    close(x, p - M * (2 - p) / m, 1e-13, '解析位置');
    const c2 = cfgOf({ M, p, items: [{ id: 'z', kind: 'w1', m, x, hang: false }] });
    assert.ok(Math.abs(TC.sums(c2).S) <= TC.sums(c2).tol * 10, 'S ≈ 0');
    close(TC.sums(c2).xcm, p, 1e-12, '系統重心在支點正上方');
  }
});

test('平衡時支點的正向力 = 總重（ΣF = 0），與支點位置、擺設無關', () => {
  for (const p of [1, 1.5, 2, 2.75, 3]) {
    const cfg = cfgOf({ M: 4, p, items: [item('child', p - 1)] });
    const x = TC.balancePosition(cfg, 2); // 再放一個 2 kg 讓它平衡
    cfg.items.push({ id: 'b' + p, kind: 'w2', m: 2, x, hang: true });
    const st = TC.seesawRelease(cfg);
    assert.strictEqual(st.rest, 'level');
    close(TC.reactions(cfg, st).N, (4 + 20 + 2) * g, 1e-12);
  }
});

test('吊在板下與放在板上：同一刻度的力臂相同（重力作用線都通過該點）', () => {
  const a = cfgOf({ M: 3, p: 1.25, items: [item('w5', 3.5, false)] });
  const b = cfgOf({ M: 3, p: 1.25, items: [item('w5', 3.5, true)] });
  for (const th of [0, 5 * D, -9 * D]) close(TC.torques(a, th).net, TC.torques(b, th).net, 1e-14);
  close(TC.sums(a).I, TC.sums(b).I, 1e-14, '轉動慣量相同');
});

test('轉動慣量 I = M(L²/12 + d²) + Σ m s²（平行軸定理），只由質量分布決定、與 ω 無關', () => {
  const cfg = cfgOf({ M: 9, p: 1.25, items: [item('w5', 0), item('adult', 3.75), item('w1', 1.25, true)] });
  const want = 9 * (16 / 12 + 0.75 * 0.75) + 5 * 1.25 * 1.25 + 60 * 2.5 * 2.5 + 0;
  close(TC.sums(cfg).I, want, 1e-13);
  // 均勻細桿對中心 ML²/12
  close(TC.sums(cfgOf({ M: 3, p: 2 })).I, 3 * 16 / 12, 1e-14);
  // sums() 不接受角速度；轉動中的任何時刻 I 都一樣
  const r1 = run(cfgOf({ M: 2, p: 2, items: [item('w5', 3.5)] }), 0.2);
  assert.ok(r1.st.omega !== 0);
  close(TC.sums(cfgOf({ M: 2, p: 2, items: [item('w5', 3.5)] })).I, 2 * 16 / 12 + 5 * 1.5 * 1.5, 1e-14);
});

test('彈簧秤：F = g S / s_k；N + F = 總重；在支點正上方時拉不動（F = 0）', () => {
  const cfg = cfgOf({ M: 8, p: 1, items: [], scale: { x: 3 } }); // 板子重心在支點右 1 m
  const sc = TC.scaleNeed(cfg);
  close(sc.F, g * 8 * 1 / 2, 1e-13, 'F = M g × 1 / 2');
  const st = TC.seesawRelease(cfg);
  assert.strictEqual(st.rest, 'scale');
  const re = TC.reactions(cfg, st);
  close(re.F + re.N, 8 * g, 1e-13, 'ΣF = 0');
  // 秤正好在系統重心：支點完全不受力
  const c2 = cfgOf({ M: 8, p: 1, scale: { x: 2 } });
  const st2 = TC.seesawRelease(c2);
  close(TC.reactions(c2, st2).N, 0, 1e-12, '支點不受力');
  close(TC.reactions(c2, st2).F, 8 * g, 1e-13, '秤撐起全部重量');
  // 秤在另一側（需要往下壓）→ 拉不住
  const c3 = cfgOf({ M: 8, p: 1, scale: { x: 0.5 } });
  assert.ok(TC.scaleNeed(c3).F < 0);
  assert.strictEqual(TC.seesawRelease(c3).rest, null);
  const c4 = cfgOf({ M: 8, p: 2.25, items: [item('w2', 3)], scale: { x: 2.25 } });
  assert.ok(TC.scaleNeed(c4).atPivot);
  assert.strictEqual(TC.seesawRelease(c4).rest, null);
});

test('省力槓桿：重物靠近支點、彈簧秤在遠端，讀數 = 重量 × 力臂比', () => {
  const cfg = cfgOf({ M: 0, p: 1, items: [item('child', 1.25)], scale: { x: 4 } });
  close(TC.scaleNeed(cfg).F, 20 * g * 0.25 / 3, 1e-13);
});

test('板端碰地的角度：sin θ = H / 臂長；不平衡的板子朝重的一側轉、停在碰地角', () => {
  const cfg = cfgOf({ M: 3, p: 1.5, items: [item('w5', 0.25)] });
  const ga = TC.groundAngles(cfg);
  close(ga.left, Math.asin(0.4 / 1.5), 1e-14);
  close(ga.right, -Math.asin(0.4 / 2.5), 1e-14);
  const r = run(cfg, 5, 'land');
  const land = r.events.find(e => e.type === 'land');
  assert.strictEqual(land.side, 'L');
  assert.strictEqual(r.st.rest, 'L');
  close(r.st.theta, ga.left, 1e-14);
  // 靜止在地面上：地面撐住板端的力 Ng = g S / s_end，N = W − Ng
  const re = TC.reactions(cfg, r.st);
  const S = TC.sums(cfg).S;
  close(re.Ng, g * S / -1.5, 1e-13);
  close(re.N + re.Ng, (3 + 5) * g, 1e-13);
  assert.ok(re.Ng > 0 && re.N > 0);
});

// ---------------- 轉動：數值積分 ----------------
test('能量守恆：½Iω² + g S sin θ 在轉動中保持不變（RK4，漂移 < 1e-10）', () => {
  const cfg = cfgOf({ M: 10, p: 2, items: [item('adult', 0.5), item('child', 3.75), item('w5', 3, true)] });
  let st = TC.seesawRelease(cfg);
  const E0 = TC.seesawEnergy(cfg, st);
  let maxDev = 0, scaleE = 0;
  for (let i = 0; i < 400; i++) {
    const r = TC.seesawAdvance(cfg, st, 1 / 600);
    if (r.events.length) break;
    st = r.st;
    scaleE = Math.max(scaleE, 0.5 * TC.sums(cfg).I * st.omega * st.omega);
    maxDev = Math.max(maxDev, Math.abs(TC.seesawEnergy(cfg, st) - E0));
  }
  assert.ok(scaleE > 1, '確實在轉');
  assert.ok(maxDev / scaleE < 1e-10, '相對漂移 ' + (maxDev / scaleE));
});

test('碰地瞬間的角速度符合能量式：ω² = 2 g |S| sin|θc| / I', () => {
  const cfg = cfgOf({ M: 2, p: 2.5, items: [item('w5', 0.5), item('w1', 3.75)] });
  const r = run(cfg, 10, 'land');
  const land = r.events.find(e => e.type === 'land');
  const sm = TC.sums(cfg), ga = TC.groundAngles(cfg);
  const th = land.side === 'L' ? ga.left : ga.right;
  close(land.omega * land.omega, 2 * g * Math.abs(sm.S) * Math.abs(Math.sin(th)) / sm.I, 1e-9);
  close(land.vEnd, Math.abs(land.omega) * (land.side === 'L' ? 2.5 : 1.5), 1e-12, '板端速率 = ω × 臂長');
});

test('碰地時間與精確積分 t = ∫dθ/ω 相符；小角度近似 θ ≈ −(gS/I) t²/2', () => {
  const cfg = cfgOf({ M: 4, p: 2, items: [item('w2', 3.5)] });
  const sm = TC.sums(cfg), K = g * sm.S / sm.I, thc = Math.abs(TC.groundAngles(cfg).right);
  // 精確時間：θ = u²（去掉積分起點的奇異），t = ∫ 2u du / sqrt(2K sin(u²))，Simpson 法
  const U = Math.sqrt(thc), n = 20000;
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const u = U * i / n;
    const f = i === 0 ? 2 / Math.sqrt(2 * K) : 2 * u / Math.sqrt(2 * K * Math.sin(u * u));
    s += f * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2);
  }
  const tExact = s * U / n / 3;
  const r = run(cfg, 10, 'land');
  close(r.events.find(e => e.type === 'land').tRun, tExact, 1e-6, '碰地時間');
  // 小角度：最初 0.05 s
  let st = TC.seesawRelease(cfg);
  st = TC.seesawAdvance(cfg, st, 0.05).st;
  close(st.theta, -K * 0.05 * 0.05 / 2, 1e-4, '小角度解');
});

test('放開瞬間支點的力 N = g(M − S²/I) < 總重（質心向下加速）；轉動中 N = W + M a_cm,y', () => {
  const cfg = cfgOf({ M: 5, p: 2, items: [item('adult', 3.5)] });
  const sm = TC.sums(cfg);
  const st = TC.seesawRelease(cfg);
  const re = TC.reactions(cfg, st);
  close(re.N, g * (sm.Mt - sm.S * sm.S / sm.I), 1e-12);
  assert.ok(re.N < sm.W && re.N > 0);
  // 轉動中：用數值微分驗證 a_cm
  let s1 = TC.seesawAdvance(cfg, st, 0.15).st;
  const h = 1e-4;
  const y = s => (sm.S / sm.Mt) * Math.sin(s.theta);
  const s0 = TC.seesawAdvance(cfg, s1, -0).st, sp = TC.seesawAdvance(cfg, s1, h, { h: h / 10 }).st;
  // 用 θ(t ± h) 的二階差分
  const sm1 = { theta: s1.theta - s1.omega * h + 0.5 * TC.reactions(cfg, s1).alpha * h * h };
  const ay = (y(sp) - 2 * y(s0) + y(sm1)) / (h * h);
  close(TC.reactions(cfg, s1).N, sm.W + sm.Mt * ay, 2e-3);
});

test('吊掛的砝碼碰到地面：繩子變鬆、ω 不變，之後由地面撐住', () => {
  const cfg = cfgOf({ M: 1, p: 2, items: [item('w5', 0.25, true), item('w1', 3.75)] });
  const r = run(cfg, 10, 'land');
  const gEv = r.events.find(e => e.type === 'itemGround');
  assert.ok(gEv, '5 kg 先碰地');
  // 碰地時掛鉤離地 = 吊掛深度
  const it = cfg.items[0];
  assert.ok(r.st.grounded[it.id]);
  // 碰地之後只剩板子與 1 kg（重心偏右）：逆時針的轉動減速、停下再轉回來，把 5 kg 重新提起
  assert.ok(r.events.some(e => e.type === 'itemLift'), '轉回來時把砝碼提起');
  // 碰地前後 ω 連續（逐小步檢查）
  let st = TC.seesawRelease(cfg), prev = null;
  for (let i = 0; i < 2000; i++) {
    const rr = TC.seesawAdvance(cfg, st, 1 / 1000);
    if (rr.events.some(e => e.type === 'itemGround')) { close(rr.st.omega, st.omega, 0.02, 'ω 不跳變'); prev = true; break; }
    st = rr.st;
  }
  assert.ok(prev);
});

test('砝碼再被提起：對支點角動量守恆 I ω = I′ ω′', () => {
  const cfg = cfgOf({ M: 2, p: 2, items: [{ id: 'h', kind: 'w2', m: 2, x: 0.25, hang: true }] });
  // 從左端著地、砝碼落地的狀態開始，給一個逆向角速度
  const st = { theta: 0.2, omega: -1, rest: null, grounded: { h: true }, t: 0, t0: 0 };
  const I1 = TC.sums(cfg, st.grounded).I, I2 = TC.sums(cfg, {}).I;
  let s = st, lift = null;
  for (let i = 0; i < 400 && !lift; i++) {
    const r = TC.seesawAdvance(cfg, s, 1 / 1000);
    lift = r.events.find(e => e.type === 'itemLift');
    if (lift) { close(lift.omega * I2, I1 * s.omega, 0.01, 'L 守恆'); break; }
    s = r.st;
  }
  assert.ok(lift, '有被提起');
});

test('彈簧秤拉緊：從傾斜轉回水平時被接住、停在水平，讀數 F = g S / s_k', () => {
  const cfg = cfgOf({ M: 4, p: 2, items: [item('w5', 3.5)], scale: { x: 3 } });
  const st = { theta: 0.1, omega: 0, rest: null, grounded: {}, t: 0, t0: 0 }; // 右端抬高、秤鬆著
  let s = st, caught = null;
  for (let i = 0; i < 400 && !caught; i++) {
    const r = TC.seesawAdvance(cfg, s, 1 / 200);
    caught = r.events.find(e => e.type === 'catch');
    s = r.st;
  }
  assert.ok(caught);
  assert.strictEqual(s.rest, 'scale');
  assert.strictEqual(s.theta, 0);
  close(TC.reactions(cfg, s).F, g * 5 * 1.5 / 1, 1e-13);
});

test('放開後改擺設：加上物體時角動量守恆，平衡後停在原角度（隨遇平衡）', () => {
  const c1 = cfgOf({ M: 2, p: 2, items: [{ id: 'a', kind: 'w2', m: 2, x: 3, hang: false }] });
  let st = TC.seesawRelease(c1);
  st = TC.seesawAdvance(c1, st, 0.1).st;
  const c2 = cfgOf({ M: 2, p: 2, items: c1.items.concat([{ id: 'b', kind: 'w2', m: 2, x: 1, hang: false }]) });
  const s2 = TC.seesawEdit(c1, c2, st);
  close(TC.sums(c2).I * s2.omega, TC.sums(c1).I * st.omega, 1e-12, '加物體：L 守恆');
  // 平衡（S = 0）後只靠慣性等角速度轉動
  const r = TC.seesawAdvance(c2, s2, 0.01);
  close(r.st.omega, s2.omega, 1e-12, 'Στ = 0 → ω 不變');
  // 拿走物體：剩下的板子 ω 不變（L 減去被拿走物體的 m s² ω）
  const s3 = TC.seesawEdit(c2, c1, s2);
  close(s3.omega, s2.omega, 1e-12);
});

test('板子著地後在另一側加重：板子會被翹起來、換另一端碰地（兩端輪流）', () => {
  const c1 = cfgOf({ M: 2, p: 2, items: [{ id: 'a', kind: 'w5', m: 5, x: 0, hang: false }] });
  const r1 = run(c1, 5, 'land');
  assert.strictEqual(r1.st.rest, 'L');
  const c2 = cfgOf({ M: 2, p: 2, items: c1.items.concat([{ id: 'b', kind: 'child', m: 20, x: 4, hang: false }]) });
  let st = TC.seesawEdit(c1, c2, r1.st);
  const evs = [];
  for (let i = 0; i < 600; i++) { const r = TC.seesawAdvance(c2, st, 1 / 120); st = r.st; evs.push(...r.events); if (st.rest) break; }
  assert.ok(evs.some(e => e.type === 'lift'));
  assert.strictEqual(evs.find(e => e.type === 'land').side, 'R');
});

test('極限：輕桿（M = 0）＋單一物體在支點正上方 → 隨遇平衡；沒有任何質量 → 不動', () => {
  const c = cfgOf({ M: 0, p: 2.25, items: [item('adult', 2.25)] });
  assert.strictEqual(TC.seesawRelease(c).rest, 'level');
  const c0 = cfgOf({ M: 0, p: 2 });
  const st = TC.seesawRelease(c0);
  assert.strictEqual(st.rest, 'level');
  assert.strictEqual(TC.seesawAdvance(c0, st, 1).st.theta, 0);
});

// ---------------- 梯子 ----------------
const LD = (o) => Object.assign({ L: 4, ml: 15, mp: 0, d: 0, mu: 0.4, muw: 0, theta: 60 * D }, o);

test('光滑牆、沒有人：臨界角 tan θc = 1/(2μs)', () => {
  for (const mu of [0.2, 0.4, 0.5, 0.75, 1]) {
    close(TC.ladderCritical(LD({ mu })), Math.atan(1 / (2 * mu)), 1e-14);
    const r = TC.ladderStatics(LD({ mu, theta: Math.atan(1 / (2 * mu)) }));
    close(r.k, 1, 1e-12, '臨界角時摩擦力剛好用到最大');
  }
});

test('光滑牆：N牆 = (W梯/2 + W人 d/L) cot θ = f地，N地 = 總重', () => {
  const o = LD({ ml: 12, mp: 50, d: 2.6, theta: 70 * D, mu: 0.6 });
  const r = TC.ladderStatics(o);
  const tw = 12 * g / 2 + 50 * g * 2.6 / 4;
  close(r.Nw, tw / Math.tan(70 * D), 1e-13);
  close(r.fg, r.Nw, 1e-14);
  close(r.Ng, 62 * g, 1e-14);
  close(r.fw, 0, 1e-14);
  close(r.k, r.fg / (0.6 * r.Ng), 1e-13);
});

test('有人的一般式：tan θc = (m梯/2 + m人 d/L)/(μs (m梯 + m人))；爬得越高越容易滑', () => {
  let prev = -1;
  for (const d of [0, 1, 2, 3, 4]) {
    const o = LD({ ml: 15, mp: 60, d, mu: 0.4 });
    const want = Math.atan((7.5 + 60 * d / 4) / (0.4 * 75));
    close(TC.ladderCritical(o), want, 1e-14);
    close(TC.ladderStatics(Object.assign(o, { theta: want })).k, 1, 1e-12);
    assert.ok(want > prev); prev = want;
  }
  // 人在頂端、人遠重於梯子 → tan θc → 1/μs
  close(Math.tan(TC.ladderCritical(LD({ ml: 1e-6, mp: 80, d: 4, mu: 0.5 }))), 1 / 0.5, 1e-6);
  // 人在底端 → 比沒有人更穩
  assert.ok(TC.ladderCritical(LD({ mp: 60, d: 0 })) < TC.ladderCritical(LD({ mp: 0 })));
});

test('粗糙牆：tan θc = (1 − μs μw)/(2 μs)（沒有人）；μs μw ≥ 1 時任何角度都不滑', () => {
  for (const [mu, muw] of [[0.4, 0.3], [0.5, 0.5], [0.6, 0.2], [0.3, 1]]) {
    close(TC.ladderCritical(LD({ mu, muw })), Math.atan((1 - mu * muw) / (2 * mu)), 1e-13);
    const th = TC.ladderCritical(LD({ mu, muw }));
    close(TC.ladderStatics(LD({ mu, muw, theta: th })).k, 1, 1e-10, 'k = 1');
  }
  assert.strictEqual(TC.ladderCritical(LD({ mu: 1, muw: 1 })), 0);
  assert.ok(!TC.ladderStatics(LD({ mu: 1, muw: 1, theta: 10 * D })).slips);
});

test('粗糙牆的靜不定：k ≤ 1 ⇔ 存在一組滿足所有摩擦上限的力（暴力搜尋驗證）', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < 300; n++) {
    const o = LD({ ml: 5 + 35 * rnd(), mp: 100 * rnd(), d: 4 * rnd(), mu: rnd(), muw: rnd(), theta: (10 + 75 * rnd()) * D });
    const r = TC.ladderStatics(o);
    if (Math.abs(r.k - 1) < 1e-3) continue; // 邊界附近略過
    const c = 1 / Math.tan(o.theta);
    let feasible = false;
    for (let i = 0; i <= 4000 && !feasible; i++) {
      const fw = r.tw * i / 4000; // 牆的摩擦力 0 ～ τw
      const Nw = (r.tw - fw) * c, Ng = r.W - fw;
      if (Nw >= 0 && fw <= o.muw * Nw + 1e-9 && Nw <= o.mu * Ng + 1e-9) feasible = true;
    }
    assert.strictEqual(feasible, r.k <= 1, 'k = ' + r.k);
  }
});

test('梯子的力：ΣFx = 0、ΣFy = 0、對底端與對頂端的 Στ = 0（站得住時）', () => {
  for (const o of [LD({ mp: 70, d: 1.2, theta: 65 * D, mu: 0.5, muw: 0.3 }), LD({ ml: 30, mp: 0, theta: 80 * D, mu: 0.2, muw: 0.6 })]) {
    const r = TC.ladderStatics(o);
    assert.ok(!r.slips);
    close(r.fg - r.Nw, 0, 1e-12, 'ΣFx');
    close(r.Ng + r.fw - r.W, 0, 1e-12, 'ΣFy');
    const c = Math.cos(o.theta), s = Math.sin(o.theta), Lh = 4;
    const tauBottom = r.Nw * Lh * s + r.fw * Lh * c - (o.ml * g * 2 + o.mp * g * o.d) * c;
    close(tauBottom, 0, 1e-10, 'Στ（底端）');
    // 對頂端：地面的力與重力
    const tauTop = -r.Ng * Lh * c + r.fg * Lh * s + (o.ml * g * 2 + o.mp * g * (Lh - o.d)) * c;
    close(tauTop, 0, 1e-10, 'Στ（頂端）');
    assert.ok(r.fg <= r.fgMax + 1e-9 && r.fw <= r.fwMax + 1e-9);
  }
});

test('最小 μs 與滑倒位置：在 μmin、dSlip 處 k = 1', () => {
  const o = LD({ ml: 15, mp: 60, d: 4, theta: 60 * D, muw: 0.25 });
  const mu = TC.ladderMuMin(o);
  close(TC.ladderStatics(Object.assign({}, o, { mu })).k, 1, 1e-10);
  close(TC.ladderMuMin(LD({ ml: 15, mp: 60, d: 4, theta: 60 * D })), 67.5 / (75 * Math.tan(60 * D)), 1e-13, '光滑牆 μmin');
  const o2 = LD({ ml: 15, mp: 60, mu: 0.4, theta: Math.atan(1.25), muw: 0 });
  close(TC.ladderSlipD(o2), 2, 1e-12, '爬到正中央就滑');
  const o3 = LD({ ml: 10, mp: 70, mu: 0.45, muw: 0.3, theta: 55 * D });
  const d = TC.ladderSlipD(o3);
  close(TC.ladderStatics(Object.assign({}, o3, { d })).k, 1, 1e-10);
});

test('極限：μs → 0 時一定滑（θc → 90°）；梯子垂直時不需要摩擦力', () => {
  assert.strictEqual(TC.ladderCritical(LD({ mu: 0 })), Math.PI / 2);
  assert.ok(TC.ladderStatics(LD({ mu: 0, theta: 85 * D })).slips);
  close(TC.ladderCritical(LD({ mu: 1e-9 })), Math.PI / 2, 1e-8);
  const v = TC.ladderStatics(LD({ mu: 0, theta: Math.PI / 2 }));
  assert.ok(!v.slips);
  close(v.fg, 0, 1e-12); close(v.Ng, 15 * g, 1e-14);
});

test('滑倒：光滑地面與牆，均勻梯子在 sin θ = (2/3) sin θ0 離開牆面，機械能守恆', () => {
  const o = LD({ mu: 0, muw: 0, theta: 70 * D });
  let s = TC.ladderSlideInit(o);
  const E0 = TC.ladderEnergy(o, s);
  let sep = null, maxDev = 0;
  for (let i = 0; i < 2000 && s.phase !== 'down'; i++) {
    const r = TC.ladderSlideAdvance(o, s, 1 / 240, { h: 2e-4 });
    s = r.st;
    const e = r.events.find(x => x.type === 'separate');
    if (e && !sep) sep = e;
    if (s.phase !== 'down') maxDev = Math.max(maxDev, Math.abs(TC.ladderEnergy(o, s) - E0));
  }
  assert.ok(sep, '有離開牆面');
  close(Math.sin(sep.theta), (2 / 3) * Math.sin(70 * D), 1e-6);
  assert.ok(maxDev / E0 < 1e-8, '能量漂移 ' + maxDev / E0);
  assert.strictEqual(s.phase, 'down');
});

test('滑倒（有摩擦）：機械能只減不增，最後倒在地上', () => {
  const o = LD({ mp: 60, d: 3, mu: 0.3, muw: 0.2, theta: 50 * D });
  assert.ok(TC.ladderStatics(o).slips);
  let s = TC.ladderSlideInit(o), E = TC.ladderEnergy(o, s), ok = true;
  const kinds = [];
  for (let i = 0; i < 4000 && s.phase !== 'down'; i++) {
    const r = TC.ladderSlideAdvance(o, s, 1 / 240);
    r.events.forEach(e => kinds.push(e.type));
    s = r.st;
    const e2 = TC.ladderEnergy(o, s);
    if (s.phase !== 'down' && e2 > E + 1e-6 * E) ok = false;
    E = e2;
  }
  assert.ok(ok, '能量沒有增加');
  assert.strictEqual(s.phase, 'down');
  assert.ok(kinds.includes('down'));
});

test('任務摘要：梯子與蹺蹺板的 snapshot 欄位一致', () => {
  const s = TC.ladderSnapshot(LD({ mp: 60, d: 4, theta: 60 * D, mu: 0.52 }));
  assert.ok(s.top && !s.slips);
  close(s.muMin, 67.5 / (75 * Math.tan(60 * D)), 1e-12);
  const cfg = cfgOf({ M: 5, p: 1.5, items: [item('w5', 1)] });
  const st = TC.seesawRelease(cfg);
  const z = TC.seesawSnapshot(cfg, st, false);
  assert.strictEqual(z.level, true);
  assert.strictEqual(z.n, 1);
  close(z.N, 10 * g, 1e-13);
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗！' : ''));
