/* 任務可達成的證明腳本。用法：node tools/mission-proofs/angular-momentum.js
 * 用物理核心（js/angular-momentum-core.js）照頁面程式（js/angular-momentum.js）的方式產生事件，
 * 確認每個任務都做得到、預設狀態（沒有操作、自動播放）不會觸發任務。修改物理核心或任務條件後重跑。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(ROOT + 'js/angular-momentum-core.js');
const missions = [];
global.window = { AngMomCore: C, LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/angular-momentum.js');
const byId = id => missions.find(m => m.id === 'angular-momentum-' + id);
const D2R = Math.PI / 180;
const TARGET = { x: -1.5, y: 1.1 };
const VIEW = 2.1 + 0.06; // 小球離開畫面（|x| 或 |y| 超過）時頁面發出 exit

// ---------- 模式一：照頁面的方式推進並產生事件 ----------
function holeStart(p) { return C.holeCreate({ m: p.m, r0: p.r0, v0: p.v0, theta0: (p.th || 0) * D2R }); }
/** 收放到 r1（速率 u），回傳事件（arrive 或 snap） */
function pull(st, r1, u) {
  const evs = [];
  C.holeStartMove(st, r1, u);
  const ms = st.moveStart;
  for (let i = 0; i < 2e6 && st.phase === 'move'; i++) {
    C.holeAdvance(st, 1 / 240).forEach(function (e) {
      const k = C.holeKin(st);
      if (e.type === 'arrive') {
        evs.push({ type: 'arrive', data: { m: st.m, r0: ms.r, r1: st.r, v0: ms.r * ms.om, v1: k.v, w0: ms.om, w1: st.om, K0: ms.K, K1: k.K, W: st.W - ms.W, T1: k.T, L: k.L, u: u } });
      } else if (e.type === 'snap') {
        evs.push({ type: 'snap', data: { T: e.T, r: k.r, v: k.v, L: k.L, m: st.m } });
      }
    });
  }
  return evs;
}
/** 鬆手（或已經繩斷）後一直跑到離開畫面，回傳 letgo（若是鬆手）與 exit 事件 */
function letgo(st) {
  const evs = [];
  if (st.phase !== 'free') {
    C.holeRelease(st, 'letgo');
    const k = C.holeKin(st);
    evs.push({ type: 'letgo', data: { r: k.r, v: k.v, vr: k.rd, rperp: k.rperp, L: k.L, m: st.m, x: k.x, y: k.y, vx: k.vx, vy: k.vy } });
  }
  for (let i = 0; i < 1e6; i++) {
    const k = C.holeKin(st);
    if (Math.abs(k.x) > VIEW || Math.abs(k.y) > VIEW) break;
    C.holeAdvance(st, 1 / 60);
  }
  const f = st.free, q = C.freeClosest(f, TARGET.x, TARGET.y), k = C.holeKin(st);
  evs.push({ type: 'exit', data: { why: f.why, m: st.m, r: f.r, x0: f.x, y0: f.y, vx: f.vx, vy: f.vy, v: Math.hypot(f.vx, f.vy),
    vr: (f.x * f.vx + f.y * f.vy) / Math.hypot(f.x, f.y), rperp: k.rperp, L: k.L, miss: q.miss, tau: q.tau } });
  return evs;
}
/** 繩長固定時，等它轉到位置角 θ（頁面上是暫停後用滑桿輸入 θ） */
function setTheta(st, deg) { st.th = deg * D2R; }

// ---------- 模式二 ----------
const PLAT0 = { md: 2, Mb: 60, rOut: 0.75, rIn: 0.2, w1: 2 };
function arms(o, dir, wStart) {
  const p = { Mb: o.Mb, md: o.md };
  const I0 = C.platformI(p, o.rOut).total, L = I0 * o.w1;
  const ra = dir === 'in' ? o.rOut : o.rIn, rb = dir === 'in' ? o.rIn : o.rOut;
  const Ia = C.platformI(p, ra).total, Ib = C.platformI(p, rb).total;
  const Ka = C.spinEnergy(p, L, ra, 0, 0).total, Kb = C.spinEnergy(p, L, rb, 0, 0).total;
  return { type: 'arms', data: { dir: dir, md: o.md, Mb: o.Mb, rOut: o.rOut, rIn: o.rIn, r0: ra, r1: rb, I0: Ia, I1: Ib, w0: L / Ia, w1: L / Ib, K0: Ka, K1: Kb, W: Kb - Ka, L: L } };
}
function drop(o, armsIn) {
  const p = { Mb: o.Mb, md: o.md }, r = armsIn ? o.rIn : o.rOut;
  const L = C.platformI(p, o.rOut).total * o.w1, w = L / C.platformI(p, r).total;
  return { type: 'drop', data: { r: r, w: w, wAfter: w, md: o.md, L: L, Lperson: C.platformI(p, 0, true).total * w, armsIn: !!armsIn } };
}

// ---------- 模式三 ----------
const DISK0 = { M1: 2, R1: 0.2, w1: 8, M2: 1, R2: 0.2, w2: 0, mu: 0.1 };
function couple(o) {
  const p = Object.assign({}, DISK0, o), r = C.coupleResult(p);
  return { type: 'couple', data: Object.assign({}, p, { I1: r.I1, I2: r.I2, wf: r.wf, K0: r.K0, K1: r.K1, loss: r.loss, frac: r.frac, tLock: r.tLock, L: r.L }) };
}

let fail = 0;
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { if (m.check(e, m.mem)) ok = true; });
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}
const f3 = x => x.toFixed(3), f4 = x => x.toFixed(4);

// ---------- 預設狀態：頁面不操作時不發出任何事件（自動播放只轉動）；用預設設定按一次各按鈕，只會觸發低等級任務 ----------
{
  const st = holeStart({ m: 0.5, r0: 1, v0: 1 });
  const evDefault = [].concat(pull(st, 0.5, 0.2), letgo(st), [arms(PLAT0, 'in'), drop(PLAT0, false), couple({})]);
  const fired = missions.filter(m => { m.mem = {}; return evDefault.some(e => m.check(e, m.mem)); }).map(m => m.id + '（' + m.level + ' 級）');
  const high = missions.filter(m => fired.some(f => f.indexOf(m.id + '（') === 0) && (m.hidden || m.level >= 4));
  if (high.length) { fail++; console.log('  ✗ 預設設定按按鈕就觸發了：' + high.map(m => m.id).join('、')); }
  console.log('  ✓ 不操作時頁面不發出事件；用預設設定按一次「拉繩」「鬆手」「收手」「鬆開啞鈴」「放下上盤」只觸發：' + fired.join('、'));
}

// 1 放長繩子
{
  const st = holeStart({ m: 0.5, r0: 1, v0: 1 });
  expect(1, pull(st, 1.5, 0.2), true, 'r0 = 1 → r1 = 1.5（放繩）');
  const st2 = holeStart({ m: 0.5, r0: 1, v0: 1 });
  expect(1, pull(st2, 0.5, 0.2), false, '收繩到 0.5 不算');
}
// 2 鬆手
{
  const st = holeStart({ m: 0.5, r0: 1, v0: 1 });
  expect(2, letgo(st), true, '預設條件按「鬆手」，小球滑出畫面');
}
// 3 半徑減半
{
  const st = holeStart({ m: 0.5, r0: 1, v0: 1 });
  const ev = pull(st, 0.5, 0.2), a = ev[0].data;
  expect(3, ev, true, 'r0 = 1 → 0.5：v ' + f3(a.v0) + ' → ' + f3(a.v1) + ' m/s（×' + f4(a.v1 / a.v0) + '），K ×' + f4(a.K1 / a.K0) + '，ω ×' + f4(a.w1 / a.w0) + '，L 漂移 ' + Math.abs(a.L / 0.5 - 1).toExponential(1));
  const st2 = holeStart({ m: 0.5, r0: 1.5, v0: 1 });
  expect(3, pull(st2, 0.8, 0.2), false, 'r0 = 1.5 → 0.8（比 0.533）');
}
// 4 兩盤相合
expect(4, [couple({})], true, '預設：下盤 8 rad/s、上盤靜止，放下上盤 → ωf = ' + f3(C.coupleResult(DISK0).wf));
expect(4, [couple({ w2: 8 })], false, '兩盤本來就同轉速（沒有滑動）不算');
// 5 轉速 3 倍
{
  const o = Object.assign({}, PLAT0, { rIn: 0.15, rOut: 0.81 });
  const e = arms(o, 'in');
  expect(5, [e], true, 'm = 2 kg、M = 60 kg、r伸 = 0.81、r收 = 0.15 → ω ×' + f4(e.data.w1 / e.data.w0));
  const e0 = arms(PLAT0, 'in');
  expect(5, [e0], false, '預設 r伸 0.75、r收 0.2 → ×' + f3(e0.data.w1 / e0.data.w0));
}
// 6 動能 4 倍
{
  const o = Object.assign({}, PLAT0, { md: 3, rIn: 0.15, rOut: 0.82 });
  const e = arms(o, 'in');
  expect(6, [e], true, 'm = 3 kg、r伸 = 0.82、r收 = 0.15 → K ×' + f4(e.data.K1 / e.data.K0) + '（= I伸/I收 = ω 的倍率；W = ' + f3(e.data.W) + ' J）');
  const o2 = Object.assign({}, PLAT0, { md: 5, Mb: 40, rIn: 0.3, rOut: 0.8 });
  const e2 = arms(o2, 'in');
  expect(6, [e2], true, '另一解 m = 5 kg、M = 40 kg、r伸 = 0.80、r收 = 0.30 → K ×' + f4(e2.data.K1 / e2.data.K0));
}
// 7 一半變成熱
{
  const e = couple({ M2: 2 });
  expect(7, [e], true, '兩盤相同（M 2 kg、R 0.2 m），上盤靜止 → 損失 ' + (e.data.frac * 100).toFixed(2) + '%');
  const e2 = couple({ M1: 1, R1: 0.2, M2: 4, R2: 0.1 });
  expect(7, [e2], true, '另一解 M1 1 kg、R1 0.2；M2 4 kg、R2 0.1（I 相等）→ ' + (e2.data.frac * 100).toFixed(2) + '%');
  expect(7, [couple({})], false, '預設 → ' + (C.coupleResult(DISK0).frac * 100).toFixed(2) + '%');
}
// 8 倍率與轉速無關
{
  const a = arms(PLAT0, 'in'), b = arms(Object.assign({}, PLAT0, { w1: 4 }), 'in');
  expect(8, [a, b], true, '預設設定 ω1 = 2 收手（×' + f4(a.data.w1 / a.data.w0) + '），改 ω1 = 4 再收手（×' + f4(b.data.w1 / b.data.w0) + '）');
  const c = arms(Object.assign({}, PLAT0, { w1: 3 }), 'in');
  expect(8, [a, c], false, 'ω1 = 2 與 3（不到 2 倍）');
  const d = arms(Object.assign({}, PLAT0, { w1: 4, rIn: 0.3 }), 'in');
  expect(8, [a, d], false, '同時改了 r收（倍率不同）');
}
// 9 手作功 1 J
{
  const st = holeStart({ m: 0.5, r0: 1, v0: 1 });
  const ev = pull(st, 0.447, 0.2);
  expect(9, ev, true, 'm 0.5、r0 1、v0 1，r1 打字輸入 0.447 → W = ' + f4(ev[0].data.W) + ' J（解析 ' + f4(C.moveWork(0.5, 1, 1, 0.447)) + '）');
  const st2 = holeStart({ m: 0.5, r0: 1, v0: 2 });
  const ev2 = pull(st2, 0.7071, 0.3);
  expect(9, ev2, true, 'm 0.5、r0 1、v0 2，r1 = 0.707 → W = ' + f4(ev2[0].data.W) + ' J');
  const st3 = holeStart({ m: 0.5, r0: 1, v0: 1 });
  const ev3 = pull(st3, 0.45, 0.2);
  expect(9, ev3, false, '滑桿最近的 r1 = 0.45 → W = ' + f4(ev3[0].data.W) + ' J（要打字）');
}
// 10 命中目標
{
  const r = 1, th = C.aimAngle(r, TARGET.x, TARGET.y) / D2R;
  const thR = Math.round(th * 10) / 10;
  const st = holeStart({ m: 0.5, r0: r, v0: 1 }); setTheta(st, thR);
  const ev = letgo(st);
  expect(10, ev, true, '預設條件，暫停後把 θ 設為 ' + thR + '°（arctan 方向 − arccos(r/D) = ' + th.toFixed(3) + '°）→ 偏差 ' + (ev[1].data.miss * 100).toFixed(2) + ' cm');
  const stI = holeStart({ m: 0.5, r0: r, v0: 1 }); setTheta(stI, Math.round(th));
  const evI = letgo(stI);
  expect(10, evI, true, '只用整數度 θ = ' + Math.round(th) + '° 也可以 → 偏差 ' + (evI[1].data.miss * 100).toFixed(2) + ' cm');
  const st2 = holeStart({ m: 0.5, r0: r, v0: 1 }); setTheta(st2, thR + 2);
  expect(10, letgo(st2), false, 'θ 差 2°');
}
// 11 收繩途中鬆手，r⊥ = 0.300
{
  const u = 0.05, st = holeStart({ m: 0.5, r0: 0.5, v0: 0.2 });
  C.holeStartMove(st, 0.15, u);
  let tA = null, tB = null, rel = null;
  const snap = [];
  while (st.phase === 'move') {
    C.holeAdvance(st, 1 / 600);
    const k = C.holeKin(st);
    const ok = k.rd <= -0.02 && Math.abs(k.rperp - 0.3) <= 0.01;
    if (ok && tA === null) tA = st.t;
    if (ok) { tB = st.t; if (!rel && Math.abs(k.rperp - 0.3) < 0.0005) rel = JSON.parse(JSON.stringify(st)); }
    snap.push(0);
  }
  const ev = letgo(rel);
  const d = ev[0].data;
  expect(11, ev, true, 'm 0.5、r0 0.5、v0 0.2、u 0.05、r1 0.15：收繩途中 r = ' + f3(d.r) + ' m 時鬆手（徑向速度 ' + f3(d.vr) + ' m/s）→ r⊥ = ' + f4(ev[1].data.rperp) +
    ' m；可以鬆手的時間窗 ' + (tB - tA).toFixed(2) + ' s（慢動作下 ' + ((tB - tA) / 0.25).toFixed(1) + ' s，也可以先暫停再按鬆手）');
  const st2 = holeStart({ m: 0.5, r0: 0.3, v0: 1 });
  expect(11, letgo(st2), false, '繩長固定時在 r = 0.30 鬆手（r⊥ = r，但不是往內跑）');
}
// 12 準速命中
{
  const st = holeStart({ m: 0.5, r0: 1.5, v0: 1.2 });
  const ev1 = pull(st, 0.6, 0.2);
  const th = C.aimAngle(0.6, TARGET.x, TARGET.y) / D2R, thR = Math.round(th * 10) / 10;
  setTheta(st, thR);
  const ev = ev1.concat(letgo(st));
  const ex = ev[ev.length - 1].data;
  expect(12, ev, true, 'm 0.5、r0 1.5、v0 1.2（L/m = 1.8）收繩到 r1 = 0.6（v = ' + f4(ex.v) + ' m/s、T = ' + f3(ev1[0].data.T1) + ' N），θ = ' + thR + '° 鬆手 → 偏差 ' + (ex.miss * 100).toFixed(2) + ' cm');
  const st2 = holeStart({ m: 0.5, r0: 1, v0: 1 }); C.holeStartMove(st2, 0.333, 0.2);
  while (st2.phase === 'move') C.holeAdvance(st2, 1 / 240);
  const th2 = C.aimAngle(st2.r, TARGET.x, TARGET.y) / D2R; setTheta(st2, Math.round(th2 * 10) / 10);
  const e2 = letgo(st2);
  expect(12, e2, true, '另一解 r0 1、v0 1、r1 打字 0.333 → v = ' + f4(e2[1].data.v) + ' m/s、θ = ' + (Math.round(th2 * 10) / 10) + '°');
  const st3 = holeStart({ m: 0.5, r0: 1.5, v0: 1.2 }); pull(st3, 0.65, 0.2); setTheta(st3, C.aimAngle(0.65, TARGET.x, TARGET.y) / D2R);
  expect(12, letgo(st3), false, '命中但 r1 = 0.65（v = ' + f3(1.8 / 0.65) + ' m/s）');
}
// h1 繩斷
{
  const st = holeStart({ m: 0.5, r0: 1, v0: 1 });
  const ev = pull(st, 0.2, 0.2);
  expect('h1', ev, true, '預設條件拉到 r1 = 0.2：在 r = ' + f3(ev[0].data.r) + ' m 時張力 ' + f3(ev[0].data.T) + ' N > 30 N，繩斷（保持圓周的斷裂半徑 ' + f3(C.snapRadius(0.5, 1)) + ' m）');
  const st2 = holeStart({ m: 0.5, r0: 1, v0: 1 });
  expect('h1', pull(st2, 0.3, 0.2), false, '拉到 0.3（張力 ' + f3(C.holdTension(0.5, 1, 0.3)) + ' N）不會斷');
}
// h2 先收手再鬆開啞鈴
expect('h2', [arms(PLAT0, 'in'), drop(PLAT0, true)], true, '預設設定收手後鬆開啞鈴：ω 仍是 ' + f3(drop(PLAT0, true).data.w) + ' rad/s');
expect('h2', [drop(PLAT0, false)], false, '伸手時鬆開');
// h3 反向相消
expect('h3', [couple({ M2: 2, w2: -8 })], true, '兩盤相同，ω1 = 8、ω2 = −8 → ωf = ' + f4(C.coupleResult(Object.assign({}, DISK0, { M2: 2, w2: -8 })).wf));
expect('h3', [couple({ M1: 1, R1: 0.2, w1: 8, M2: 2, R2: 0.2, w2: -4 })], true, '另一解 M1 1、ω1 8；M2 2、ω2 −4（I1ω1 = −I2ω2）');
expect('h3', [couple({ w2: -8 })], false, '預設質量（I 不同）ω2 = −8 → ωf = ' + f3(C.coupleResult(Object.assign({}, DISK0, { w2: -8 })).wf));

console.log(fail ? '\n有 ' + fail + ' 項失敗' : '\n全部通過');
process.exitCode = fail ? 1 : 0;
