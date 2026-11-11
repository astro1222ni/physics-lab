/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/atwood.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
// 用物理核心證明每個任務都做得到：依頁面的方式組出事件資料，丟進任務檢查函式
const C = require(__ROOT + 'js/atwood-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(__ROOT + 'js/missions/atwood.js');
const g = C.G;

function flat(mode, p) {
  const o = { mode, v0: p.v0 };
  if (mode === 1) Object.assign(o, { m1: p.m1, m2: p.m2, h: p.h });
  else if (mode === 3) Object.assign(o, { n: p.m.length, push: p.push, m1: p.m[0], m2: p.m[1], m3: p.m.length > 2 ? p.m[2] : null, F: p.F, muS: p.muS, muK: p.muK, d: p.d });
  else Object.assign(o, { M: p.M, m: p.m, muS: p.muS, muK: p.muK, d: p.d }, mode === 4 ? { theta: p.theta } : {});
  return o;
}
/** 模擬一次「釋放」，傳回頁面會發出的所有事件 */
function run(mode, p, opt) {
  opt = opt || {};
  const tl = C.timeline(mode, p), s0 = tl.segs[0], out = [];
  const moving = mode === 3 ? !s0.rest : !(s0.restA && s0.restB);
  const d = flat(mode, p);
  if (mode === 3) Object.assign(d, { moves: moving, dir: moving ? 1 : 0, a: s0.dyn.a, link: s0.dyn.link.slice(), fKind: s0.dyn.kind, timing: 'gate' });
  else Object.assign(d, { moves: moving, dir: moving ? (s0.aA > 0 || s0.vA > 0 ? 1 : -1) : 0, a: s0.aA, T: s0.T, f: s0.fA, fKind: s0.kind, fsMax: mode === 1 ? 0 : p.muS * s0.NA, N: s0.NA, timing: 'gate' });
  out.push({ type: 'release', data: d });
  if (!moving) return out;
  const ms = C.firstMeasure(tl);
  let n = 0, sawStop = false;
  tl.events.forEach((e, k) => {
    if (e.type === 'stop') { sawStop = true; return; }
    if (e.type === 'jerk') {
      const prev = tl.events.slice(0, k).reverse().find(q => q.type !== 'stop' && q.type !== 'jerk');
      out.push({ type: 'jerk', data: Object.assign(flat(mode, p), { v: e.v, slackTime: prev ? e.t - prev.t : 0, n }) });
      return;
    }
    n++;
    out.push({ type: 'impact', data: Object.assign(flat(mode, p), { type: e.type, v: e.v, t: e.t, n, afterStop: sawStop, a0: mode === 3 ? s0.a : s0.aA }) });
    if (ms && Math.abs(e.t - ms.t) < 1e-9) {
      const method = opt.hand != null ? 'hand' : 'gate';
      const tm = method === 'gate' ? Math.round(ms.t * 1000) / 1000 : Math.round((ms.t + opt.hand) * 100) / 100;
      const aM = C.accelFromTime(ms.d, tm, p.v0);
      out.push({ type: 'run', data: Object.assign(flat(mode, p), { timing: method, slow: false, t: tm, tTrue: ms.t, d: ms.d, aMeas: aM, aTheory: Math.abs(mode === 3 ? s0.a : s0.aA), gMeas: mode === 1 && p.m1 !== p.m2 ? C.gFromAtwood(aM, p.m1, p.m2) : null, dir: ms.dir }) });
    }
  });
  return out;
}
function feed(events) {
  const got = [];
  events.forEach(ev => missions.forEach(m => { if (!m.done && m.check(ev, m.mem)) { m.done = true; got.push(m.id); } }));
  return got;
}
function reset() { missions.forEach(m => { m.done = false; m.mem = {}; }); }

const P1 = o => Object.assign({ m1: 0.7, m2: 0.5, h: 0.8, v0: 0 }, o);
const P2 = o => Object.assign({ M: 1, m: 0.5, muS: 0.4, muK: 0.25, d: 0.6, v0: 0 }, o);
const P3 = o => Object.assign({ m: [1, 1.5, 2], F: 15, push: false, muS: 0.2, muK: 0.15, d: 0.8, v0: 0 }, o);
const P4 = o => Object.assign({ M: 1, m: 1, theta: 30, muS: 0.3, muK: 0.2, d: 0.5, v0: 0 }, o);

// 0. 預設值各釋放一次：除了 atwood-1（放手就落地）之外不應完成任何任務
reset();
console.log('預設值釋放 →', feed([].concat(run(1, P1()), run(2, P2()), run(3, P3()), run(3, P3({ push: true })), run(4, P4()))));

const SOL = [
  ['atwood-1', '預設值釋放', [[1, P1()]]],
  ['atwood-2', 'm1 = 0.600、m2 = 0.400 kg → a = g/5', [[1, P1({ m1: 0.6, m2: 0.4 })]]],
  ['atwood-3', '總質量 1.00 kg：(0.55, 0.45)、(0.60, 0.40)、(0.65, 0.35) 各量一次', [[1, P1({ m1: 0.55, m2: 0.45 })], [1, P1({ m1: 0.6, m2: 0.4 })], [1, P1({ m1: 0.65, m2: 0.35 })]]],
  ['atwood-4', 'M = 1 kg、μs = 0.40：m = 0.400 kg 不動、m = 0.405 kg 會動', [[2, P2({ m: 0.4 })], [2, P2({ m: 0.405 })]]],
  ['atwood-5', '拉 3 塊：m = 1.00、2.00、1.50 kg，F = 20 N', [[3, P3({ m: [1, 2, 1.5], F: 20 })]]],
  ['atwood-6', 'θ = 20°、μs = 0.20、μk = 0.15，M = 1.00、m = 0.60 kg', [[4, P4({ theta: 20, muS: 0.2, muK: 0.15, m: 0.6 })]]],
  ['atwood-7', 'M = 1、m = 0.25 kg，μk = 0.25，v0 = 0.50 m/s', [[2, P2({ m: 0.25, v0: 0.5 })]]],
  ['atwood-8', '拉 1.00/1.50/2.00 kg、F = 30 N：μs = μk = 0.10 與 μs = μk = 0.35', [[3, P3({ F: 30, muS: 0.1, muK: 0.1 })], [3, P3({ F: 30, muS: 0.35, muK: 0.35 })]]],
  ['atwood-9', 'M = 1、m = 0.10 kg、θ = 35°、μs = 0.15、μk = 0.10、d = 0.60 m、v0 = 0.80 m/s', [[4, P4({ m: 0.1, theta: 35, muS: 0.15, muK: 0.1, d: 0.6, v0: 0.8 })]]],
  ['atwood-10', '(0.60, 0.40) 與 (1.20, 0.30)：T 都是 0.48g = 4.704 N', [[1, P1({ m1: 0.6, m2: 0.4 })], [1, P1({ m1: 1.2, m2: 0.3 })]]],
  ['atwood-12', 'M = 1、m = 0.50 kg、θ = 30°、μs = 0.30、μk = 0.20、d = 0.50 m、v0 = 1.064 m/s', [[4, P4({ m: 0.5, v0: 1.064 })]]],
  ['atwood-h1', 'M = 1、m = 0.50 kg、θ = 30°、μs = 0.30（m = M sinθ）', [[4, P4({ m: 0.5 })]]],
  ['atwood-h2', 'm1 = m2 = 0.50 kg、v0 = 0.50 m/s', [[1, P1({ m1: 0.5, m2: 0.5, v0: 0.5 })]]],
  ['atwood-h3', 'm1 = 1.30、m2 = 0.50 kg、h = 1.00 m', [[1, P1({ m1: 1.3, m2: 0.5, h: 1 })]]]
];
let ok = true;
for (const [id, desc, runs] of SOL) {
  reset();
  const got = feed([].concat.apply([], runs.map(r => run(r[0], r[1]))));
  const pass = got.includes(id);
  ok = ok && pass;
  console.log((pass ? '✓ ' : '✗ ') + id.padEnd(10) + ' ' + desc + (pass ? '' : '  got ' + got));
}
// atwood-11：手按碼錶，反應誤差 δ 的容許範圍
reset();
const p11 = P1({ m1: 0.505, m2: 0.495, h: 1 });
const tl11 = C.timeline(1, p11), t11 = C.firstMeasure(tl11).t;
let lo = null, hi = null;
for (let d = -0.1; d <= 0.1; d += 0.001) {
  reset();
  if (feed(run(1, p11, { hand: d })).includes('atwood-11')) { if (lo === null) lo = d; hi = d; }
}
console.log((lo !== null ? '✓ ' : '✗ ') + 'atwood-11  m1 = 0.505、m2 = 0.495 kg、h = 1.00 m：真實落地 t = ' + t11.toFixed(3) + ' s，手按誤差在 ' + (lo * 1000).toFixed(0) + ' ～ +' + (hi * 1000).toFixed(0) + ' ms 內即可');
ok = ok && lo !== null;
// 大的 Δm：反應時間 0.2 s 就失敗
reset();
console.log('  對照：m1 = 0.70、m2 = 0.50，晚按 0.20 s →', feed(run(1, P1(), { hand: 0.2 })).includes('atwood-11') ? '通過' : '失敗（g 偏差太大）');
// 其他細節
const tl12 = C.timeline(4, P4({ m: 0.5, v0: 1.064 }));
console.log('  atwood-12 抵達擋板速率 =', tl12.events[0].v.toFixed(4), 'm/s；v0 = 1.06 →', C.timeline(4, P4({ m: 0.5, v0: 1.06 })).events[0].type, '；v0 = 1.07 →', C.timeline(4, P4({ m: 0.5, v0: 1.07 })).events[0].v.toFixed(3));
const tlh3 = C.timeline(1, P1({ m1: 1.3, m2: 0.5, h: 1 }));
console.log('  atwood-h3 鬆弛時間 =', (tlh3.events[1].t - tlh3.events[0].t).toFixed(3), 's；預設值 =', (C.timeline(1, P1()).events[1].t - C.timeline(1, P1()).events[0].t).toFixed(3), 's');
console.log(ok ? '全部任務都可達成' : '有任務無法達成');
