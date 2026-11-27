/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/dc-circuit.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(__ROOT + 'js/dc-circuit-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({ mem: {} }, x)); } }; global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/dc-circuit.js');
const assert = require('node:assert/strict');
const done = {};
function data(c, action, prevI, probes) {
  const s = K.solve(c), b = K.batteryReport(c, s, 0), E = c.elements[0];
  const parts = {};
  c.elements.forEach((e, k) => {
    if (e.type === 'R') parts[e.id] = { kind: e.kind, R: e.R, I: Math.abs(s.I[k]), V: Math.abs(s.Vab[k]), P: s.P[k] };
    else if (e.type === 'switch') parts[e.id] = { kind: 'switch', closed: e.closed };
  });
  const gk = K.indexOf(c, 'G');
  let probe = null;
  if (probes && probes[0] != null && probes[1] != null) {
    const c1 = s.cluster[probes[0]], c2 = s.cluster[probes[1]];
    const across = c.elements.filter(e => e.type !== 'wire' && ((s.cluster[e.a] === c1 && s.cluster[e.b] === c2) || (s.cluster[e.a] === c2 && s.cluster[e.b] === c1))).map(e => e.id);
    probe = { a: probes[0], b: probes[1], dV: s.floating[probes[0]] || s.floating[probes[1]] ? NaN : s.V[probes[0]] - s.V[probes[1]], across,
      openSwitch: across.some(id => { const e = c.elements[K.indexOf(c, id)]; return e.type === 'switch' && !e.closed; }) };
  }
  return { action, preset: c.name, count: c.count, emf: E.emf, r: E.r, ok: s.ok, I: b.I, Vt: b.Vt, Req: b.Req, Pemf: b.Pemf, Pint: b.Pint, Pout: b.Pout, eta: b.eta,
    prevI, Ig: gk >= 0 ? s.I[gk] : null, allClosed: c.elements.every(e => e.type !== 'switch' || e.closed), parts, probe };
}
function emit(label, c, action, prevI, probes) {
  const d = data(c, action, prevI, probes);
  const hits = missions.filter(m => !done[m.id] && m.check({ type: 'circuit', data: d }, m.mem));
  hits.forEach(m => { done[m.id] = label; });
  console.log(label.padEnd(64), hits.map(m => m.id).join(', ') || '-');
  return d;
}
function set(c, o) { Object.keys(o).forEach(id => { const k = K.indexOf(c, id); Object.assign(c.elements[k], typeof o[id] === 'number' ? { R: o[id] } : o[id]); }); return c; }
const curI = c => K.batteryReport(c, K.solve(c), 0).I;

// 預設狀態（選每個情境、每個數量）不可觸發任何任務
console.log('--- 預設狀態 ---');
for (const p of K.PRESETS) for (const n of [2, 3]) { const c = K.preset(p, n); emit('預設 ' + p + ' ' + n, c, 'preset', NaN, c.probes); }
assert.deepEqual(Object.keys(done), [], '所有預設情境');
console.log('--- 解法 ---');
let c = K.preset('single'); let pI = curI(c); set(c, { S1: { closed: false } }); emit('L1: single 斷開 S1', c, 'switch', pI);
// h1：探針跨在斷開的開關兩端（single：S1 兩端 = 節點 3、4）
const s1 = c.elements[K.indexOf(c, 'S1')]; emit('h1: 探針跨斷開的 S1', c, 'probe', pI, [s1.a, s1.b]);
c = K.preset('single'); const r1 = c.elements[K.indexOf(c, 'R1')]; emit('L2: 探針跨 R1', c, 'probe', curI(c), [r1.a, r1.b]);
c = set(K.preset('series', 3), { L1: 5, L2: 5, L3: 10 }); emit('L3: series 5+5+10, ε=6', c, 'R', NaN);
c = set(K.preset('internal'), { R: 4, E: { emf: 6, r: 1 } }); emit('L4: internal R=4, r=1 → η=80%', c, 'R', NaN);
c = set(K.preset('parallel', 3), { L1: 4, L2: 6, L3: 12 }); emit('L5: parallel 4∥6∥12', c, 'R', NaN);
c = set(K.preset('internal'), { R: 1, E: { emf: 6, r: 1 } }); emit('L6: internal R=r=1', c, 'R', NaN);
c = set(K.preset('wheatstone'), { Rx: 30 }); emit('L7: wheatstone 10/20/15/30', c, 'R', NaN);
c = set(K.preset('mixed'), { L1: 1.5 }); emit('L8: mixed L1=1.5, L2=L3=6', c, 'R', NaN);
c = set(K.preset('internal'), { R: 1, E: { emf: 6, r: 2 } }); emit('L9a: internal r=2, R=1', c, 'R', NaN);
set(c, { R: 4 }); emit('L9b: internal r=2, R=4', c, 'R', NaN);
c = set(K.preset('wheatstone'), { R1: 10, R2: 30, R3: 15, Rx: 45 }); emit('L10: wheatstone 10/30/15/45, ε=6, r=0', c, 'R', NaN);
c = set(K.preset('single'), { R1: 2, E: { emf: 6.28, r: 0 } }); emit('h2: single ε=6.28 V, R=2 Ω → 3.14 A', c, 'emf', NaN);
// h3（11/27 收緊）：不平衡的電橋記一筆，再把左右兩臂整個對調（R1↔R3、R2↔Rx），Ig 大小相同、方向相反
c = set(K.preset('wheatstone'), { Rx: 20 }); emit('h3 舊達成例：Rx 40→20 一步跨過（不可再觸發）', c, 'R', NaN);
assert.ok(!done['dc-circuit-h3'], 'h3 舊達成例（一次大跳）不可觸發');
c = K.preset('wheatstone');
for (const rx of [33, 32, 31, 30, 29, 28]) { set(c, { Rx: rx }); emit('h3 近失：一般任務 L7 式拖 Rx 經過零點，Rx=' + rx, c, 'R', NaN); }
c = K.preset('wheatstone');
for (const r2 of [24, 25, 26, 27, 28]) { set(c, { R2: r2 }); emit('h3 近失：拖 R2 經過零點，R2=' + r2, c, 'R', NaN); }
assert.ok(!done['dc-circuit-h3'], 'h3：任一臂拖過平衡點不可觸發');
const h3m = () => { missions.find(m => m.id === 'dc-circuit-h3').mem = {}; }; // 每組近失從乾淨的紀錄開始（網頁上換情境也會清掉）
h3m(); c = K.preset('wheatstone'); emit('h3：預設 10/20/15/40 不平衡，記一筆', c, 'R', NaN);
set(c, { R1: 15, R3: 10 }); emit('h3 近失：只對調 R1↔R3（R2、Rx 沒換）', c, 'R', NaN);
set(c, { R2: 40, Rx: 21 }); emit('h3 近失：R2=40、Rx=21（差一格，不是完整鏡射）', c, 'R', NaN);
assert.ok(!done['dc-circuit-h3'], 'h3 近失不可觸發');
h3m(); c = K.preset('wheatstone'); set(c, { E: { emf: 6.5 } }); emit('h3：預設電阻、ε=6.5 V 記一筆', c, 'emf', NaN);
set(c, { R1: 15, R2: 40, R3: 10, Rx: 20, E: { emf: 6 } }); emit('h3 近失：四臂鏡射但電源 6 V（和上一筆不同）', c, 'R', NaN);
assert.ok(!done['dc-circuit-h3'], 'h3 電源不同不可觸發');
h3m(); c = K.preset('wheatstone'); emit('h3：預設 10/20/15/40，Ig 一個方向', c, 'R', NaN);
set(c, { R1: 15, R3: 10 }); emit('h3：對調 R1↔R3', c, 'R', NaN);
set(c, { R2: 40, Rx: 20 }); emit('h3: wheatstone 左右兩臂整個對調 15/40/10/20，Ig 反號', c, 'R', NaN);
assert.ok(done['dc-circuit-h3'], 'h3 達成例');
const hidden = missions.filter(m => m.hidden);
assert.deepEqual(hidden.filter(m => done[m.id]).map(m => m.id), hidden.slice(0, 3).map(m => m.id),
  '各情境預設、一般任務與舊隱藏達成例');
function trial(preset, count, actions) {
  const circuit = K.preset(preset, count), memory = hidden.map(() => ({})), hits = new Set();
  let probes = circuit.probes;
  function observe(action, prevI) {
    const ev = { type: 'circuit', data: data(circuit, action, prevI, probes) };
    hidden.forEach((m, i) => { if (m.check(ev, memory[i])) hits.add(m.id); });
  }
  observe('preset', NaN);
  actions.forEach(([id, value]) => {
    const prev = curI(circuit);
    if (id === 'probe') {
      const target = circuit.elements[K.indexOf(circuit, value)];
      // 先點紅端時黑端清空；頁面只在第二個接點選好後回報 probe。
      probes = [target.a, target.b];
      observe('probe', prev);
    } else {
      const action = id === 'E' ? 'r' : typeof value === 'boolean' ? 'switch' : 'R';
      set(circuit, { [id]: action === 'switch' ? { closed: value } : value });
      observe(action, prev);
    }
  });
  return [...hits];
}
const cases = [
  ['series', 3, [['L1', 4], ['L2', 8], ['L3', 12], ['probe', 'L2']], 2, 12.02],
  ['parallel', 3, [['L1', 24], ['L2', 12], ['L3', 8], ['probe', 'L3']], 2, 8.02],
  ['mixed', 2, [['L1', 6]], 0, 6.01],
  ['mixed', 2, [['L2', 9], ['L3', 18], ['L1', 6]], 2, 6.01],
  ['parallel', 2, [['L1', 18], ['L2', 6], ['S2', false]], 1, 6.02],
  ['internal', 2, [['E', { r: 3 }], ['R', 1], ['R', 9]], 2, 9.05],
  ['wheatstone', 2, [['R2', 10], ['R3', 30], ['Rx', 30]], 2, 30.1]
];
cases.forEach(([preset, count, actions, pos, miss], i) => {
  const id = 'dc-circuit-h' + (i + 4);
  console.log(id, preset, count, JSON.stringify(actions));
  assert.deepEqual(trial(preset, count, actions), [id], id + ' 單獨解鎖');
  const off = actions.map(([k, v], j) => [k, j === pos ? miss : v]);
  assert.deepEqual(trial(preset, count, off), [], id + ' 近失');
  done[id] = JSON.stringify(actions);
});
for (const openSwitch of ['S1', 'S2']) {
  assert.ok(!trial('mixed', 2, [[openSwitch, false], ['L1', 6]]).includes('dc-circuit-h6'),
    '三燈等阻但 ' + openSwitch + ' 斷開');
}
console.log('--- 全部 ---');
missions.forEach(m => console.log(m.id.padEnd(16), 'L' + m.level, done[m.id] ? '✓ ' + done[m.id] : '✗ 沒有完成'));
// L9 不會因為拖曳滑桿而意外完成：只有放開時回報。另檢查：只有一次狀態時不會完成

if (missions.some(m => !done[m.id])) process.exitCode = 1;
