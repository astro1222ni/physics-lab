/* 任務可達成的證明腳本。用法：node tools/mission-proofs/esterification.js
 * 用化學核心模擬頁面（js/esterification.js）的操作與事件：每一幀 1/60 秒、依時間倍率前進（第一次到 50% 產率之前切成 ≤ 10 s 的小段），
 * 每走一小段就檢查是否達到平衡（送 'equil'，擾動後再平衡另送 'shift'），每 0.5 秒送一次 'tick'，按「分出酯層」送 'workup'。
 * 確認每個任務都做得到、預設狀態不會觸發任務、隱藏任務不會被公開任務的做法順便完成，並量出照建議做法要花多少真實時間。
 * 修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(__ROOT + 'js/esterification-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/esterification.js');

const SPEEDS = [1, 60, 600, 6000, 60000];
let bad = 0;
const done = {};
function freshMissions() { missions.forEach(m => { m.done = false; }); }
const hid = id => /-h\d+$/.test(id);

// ---------- 模擬頁面（與 js/esterification.js 的 newRun／advance／perturb／onEquilibrium／tickData 一致） ----------
const DEF = { acid: 'acetic', alc: 'ethanol', A: 0.5, B: 0.5, E: 0, W: 0, cat: 1, T: 70, label: false };
function newPage() { return { speed: 1, acted: true, events: [], wall: 0, eqLog: [], o: Object.assign({}, DEF), running: false }; }
function setup(P, o) {
  P.o = Object.assign({}, DEF, o);
  P.run = C.createRun(P.o);
  P.eqArmed = true; P.lastEq = null; P.pend = null; P.t50 = null; P.pure = true; P.worked = null; P.running = false;
}
function emit(P, type, data) {
  if (!P.acted) return;
  const ev = { type, data };
  missions.forEach(m => { if (!m.done && m.check(ev)) { m.done = true; P.events.push(m.id); } });
}
function rec(P) {
  const run = P.run, inA = C.inTotal(run, 'A'), inB = C.inTotal(run, 'B');
  const addsum = run.add.A + run.add.B + run.add.E + run.add.W;
  return {
    acid: run.acid, alc: run.alc, label: run.label, n0: Object.assign({}, run.n0), add: Object.assign({}, run.add), sieves: run.sieves, cat: run.cat,
    T: run.T, Tmin: run.Tmin, Tmax: run.Tmax, t: run.t, n: { A: run.A, B: run.B, E: run.E, W: run.W }, xi: run.xi, yield: C.yieldOf(run),
    yA: inA > 1e-9 ? run.xi / inA : null, yB: inB > 1e-9 ? run.xi / inB : null,
    fresh: addsum < 1e-12 && run.sieves === 0 && run.Tmax - run.Tmin <= 1
  };
}
function onEq(P) {
  P.eqArmed = false;
  const r = rec(P);
  P.lastEq = r;
  const log = P.eqLog.slice();
  P.eqLog.push(r);
  emit(P, 'equil', { rec: r, log });
  if (P.pend && P.pend !== 'broken') emit(P, 'shift', { base: P.pend.base, now: r, adds: P.pend.adds, sieves: P.pend.sieves, T0: P.pend.T0, T1: P.run.T });
  P.pend = null;
}
function perturb(P, kind, sp) {
  if (!P.eqArmed && P.lastEq) P.pend = { base: P.lastEq, adds: { A: 0, B: 0, E: 0, W: 0 }, sieves: 0, T0: P.lastEq.T };
  else if (!P.pend) P.pend = 'broken';
  if (P.pend && P.pend !== 'broken') { if (kind === 'add') P.pend.adds[sp] += 0.1; else if (kind === 'sieve') P.pend.sieves++; }
  P.eqArmed = true;
  if (kind !== 'T') P.pure = false;
}
function advance(P, dt) {
  const run = P.run, fine = P.pure && P.t50 == null && run.t < 7200;
  let left = dt;
  while (left > 1e-9) {
    const h = fine ? Math.min(left, 10) : Math.min(left, Math.max(10, (run.t + left) * 0.01));
    const y0 = C.yieldOf(run), t0 = run.t;
    C.step(run, h); left -= h;
    const y1 = C.yieldOf(run);
    if (P.pure && P.t50 == null && y0 != null && y1 != null && y0 < 0.5 && y1 >= 0.5) P.t50 = t0 + (run.t - t0) * (0.5 - y0) / (y1 - y0);
    if (P.eqArmed && C.atEquilibrium(run)) onEq(P);
  }
}
function tick(P) {
  const run = P.run, inA = C.inTotal(run, 'A'), inB = C.inTotal(run, 'B'), q0 = C.Q(run.n0);
  return {
    acid: run.acid, alc: run.alc, label: run.label, n: { A: run.A, B: run.B, E: run.E, W: run.W }, n0: Object.assign({}, run.n0), add: Object.assign({}, run.add),
    sieves: run.sieves, cat: run.cat, T: run.T, Tmin: run.Tmin, Tmax: run.Tmax, t: run.t, xi: run.xi,
    yield: C.yieldOf(run), yA: inA > 1e-9 ? run.xi / inA : null, yB: inB > 1e-9 ? run.xi / inB : null,
    eq: C.atEquilibrium(run), lnQK0: run.Tmax - run.Tmin <= 0.5 && q0 > 0 && isFinite(q0) ? Math.log(q0 / C.K(run.T)) : null,
    t50: P.t50, running: P.running, worked: !!P.worked
  };
}
/** 跑 sec 秒的真實時間；until(P) 為真就提早停 */
function wait(P, sec, until) {
  P.running = true;
  const frames = Math.round(sec * 60);
  for (let k = 0; k < frames; k++) {
    advance(P, SPEEDS[P.speed] / 60);
    P.wall += 1 / 60;
    if (k % 30 === 29) emit(P, 'tick', tick(P));
    if (until && until(P)) { emit(P, 'tick', tick(P)); return P.wall; }
  }
  emit(P, 'tick', tick(P));
  return P.wall;
}
const atEq = P => !P.eqArmed;
function add(P, sp, times) { for (let i = 0; i < (times || 1); i++) { if (!C.addSpecies(P.run, sp)) throw new Error('加不進去：' + sp); if (P.run.t > 0) perturb(P, 'add', sp); else P.pure = false; } }
function sieves(P, times) { for (let i = 0; i < (times || 1); i++) { C.addSieves(P.run); if (P.run.t > 0) perturb(P, 'sieve'); else P.pure = false; } }
function setTemp(P, T) { if (P.run.t === 0) { P.run.T = T; P.run.Tmin = T; P.run.Tmax = T; } else { C.setT(P.run, T); perturb(P, 'T'); } }
function workup(P) { P.running = false; P.worked = C.workup(P.run); emit(P, 'workup', { acid: P.run.acid, alc: P.run.alc, label: P.run.label, esterMol: P.run.E, esterMass: P.worked.esterMass, yield: C.yieldOf(P.run), xi: P.run.xi, t: P.run.t }); }
/** 配好、按開始、用倍率 speed 跑到平衡（最多 maxWall 秒真實時間） */
function toEq(P, o, speed, maxWall) { setup(P, o); P.speed = speed == null ? 2 : speed; const w0 = P.wall; wait(P, maxWall || 120, atEq); return P.wall - w0; }

function report(name, P, ids) {
  const ok = ids.every(id => P.events.includes(id));
  ids.forEach(id => { if (P.events.includes(id)) done[id] = true; });
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + name + '：' + (P.events.length ? P.events.join('、') : '（沒有任務）'));
  if (!ok) bad++;
}
function reportH(name, P, id) {
  const extra = P.events.filter(x => hid(x) && x !== id);
  report(name + (extra.length ? '　← 順便完成了 ' + extra.join('、') : ''), P, [id]);
  if (extra.length) bad++;
}
function noHidden(name, P) {
  const h = P.events.filter(hid);
  console.log('  ' + (h.length ? '✗' : '✓') + ' ' + name + '：' + (h.length ? '誤觸隱藏任務 ' + h.join('、') : '沒有隱藏任務'));
  if (h.length) bad++;
}
const pc = x => (x * 100).toFixed(2) + '%';
const s1 = x => x.toFixed(1);
let P, w;

console.log('酯化反應 任務證明');
// ---------- 預設狀態 ----------
P = newPage(); P.acted = false; setup(P, {}); wait(P, 30);
if (P.events.length) { console.log('  ✗ 沒操作時不該觸發任務'); bad++; } else console.log('  ✓ 沒操作時不送事件');
freshMissions(); P = newPage(); setup(P, {}); P.speed = 1; wait(P, 120);
console.log('  預設（乙酸＋乙醇各 0.5 mol、濃硫酸 1 mL、70 °C、×60）跑 120 秒：' + (P.events.join('、') || '沒有任務') + '（ξ = ' + P.run.xi.toFixed(3) + '）');
noHidden('預設狀態跑 2 分鐘', P);

// ---------- 公開任務 ----------
console.log('— 公開任務 —');
freshMissions(); P = newPage(); w = toEq(P, {}, 2);
report('預設、×600 跑到平衡（' + s1(w) + ' 秒）：產率 ' + pc(C.yieldOf(P.run)) + '，t½ = ' + (P.t50 ? P.t50.toFixed(0) + ' s' : '—'), P, ['esterification-1', 'esterification-3']);
noHidden('預設跑到平衡', P);

freshMissions(); P = newPage(); setup(P, { alc: 'isoamyl' }); P.speed = 2; w = wait(P, 60, Q => Q.run.xi >= 0.1);
report('乙酸＋異戊醇、×600（' + s1(w) + ' 秒）', P, ['esterification-2']);
noHidden('香蕉油', P);

freshMissions(); P = newPage(); w = toEq(P, { A: 0, B: 0, E: 0.5, W: 0.5 }, 3);
report('只放酯 0.5 ＋水 0.5、×6000 水解到平衡（' + s1(w) + ' 秒）：酯剩 ' + P.run.E.toFixed(3), P, ['esterification-4']);
noHidden('水解', P);

freshMissions(); P = newPage(); toEq(P, {}, 2); { const E0 = P.run.E; add(P, 'W', 3); wait(P, 120, atEq); report('平衡後加水 0.3 mol、再平衡：酯 ' + E0.toFixed(3) + ' → ' + P.run.E.toFixed(3), P, ['esterification-5']); }
noHidden('加水', P);

freshMissions(); P = newPage(); w = toEq(P, { A: 0.3, B: 0.9 }, 2);
report('酸 0.3、醇 0.9（3 倍）、70 °C：平衡產率 ' + pc(C.yieldOf(P.run)), P, ['esterification-6']);
noHidden('醇 3 倍', P);
{ const P2 = newPage(); toEq(P2, { A: 0.4, B: 0.6 }, 2); console.log('    （醇剛好 1.5 倍時產率只有 ' + pc(C.yieldOf(P2.run)) + '，不夠：要想到再多加）'); if (P2.events.includes('esterification-6')) { console.log('  ✗ 1.5 倍不該就完成任務 6'); bad++; } }

freshMissions(); P = newPage(); setup(P, { cat: 2, T: 80 }); P.speed = 1; w = wait(P, 60, Q => Q.t50 != null);
report('濃硫酸 2 mL、80 °C、×60：t½ = ' + P.t50.toFixed(0) + ' s', P, ['esterification-7']);
noHidden('加快', P);
{ const P2 = newPage(); setup(P2, {}); P2.speed = 1; wait(P2, 60, Q => Q.t50 != null); console.log('    （預設 1 mL、70 °C 的 t½ = ' + P2.t50.toFixed(0) + ' s，不夠快）'); if (P2.events.includes('esterification-7')) { console.log('  ✗ 預設不該完成任務 7'); bad++; } }
{ const P2 = newPage(); setup(P2, { acid: 'formic', alc: 'methanol', cat: 0.5, T: 70 }); P2.speed = 1; wait(P2, 60, Q => Q.t50 != null); console.log('    （另一種做法：甲酸＋甲醇、0.5 mL、70 °C 的 t½ = ' + P2.t50.toFixed(0) + ' s）'); }

freshMissions(); P = newPage(); setup(P, {}); sieves(P, 4); P.speed = 3; w = wait(P, 120, Q => Q.events.includes('esterification-8'));
report('等莫耳 0.5、分子篩 4 次（80 g）、×6000（' + s1(w) + ' 秒，模擬 ' + (P.run.t / 3600).toFixed(1) + ' 小時）：產率 ' + pc(C.yieldOf(P.run)), P, ['esterification-8']);
noHidden('分子篩', P);

freshMissions(); P = newPage(); toEq(P, {}, 2); w = toEq(P, { A: 0, B: 0, E: 0.5, W: 0.5 }, 3);
report('先「酸＋醇各 0.5」、再「酯＋水各 0.5」，同在 70 °C：酯 ' + P.eqLog[0].n.E.toFixed(4) + ' 與 ' + P.eqLog[1].n.E.toFixed(4), P, ['esterification-9']);
noHidden('殊途同歸', P);
{ freshMissions(); const P2 = newPage(); toEq(P2, {}, 2); toEq(P2, { A: 0.25, B: 0.25, E: 0.25, W: 0.25 }, 3); console.log('    （第三種起點：酸、醇、酯、水各 0.25 → 酯 ' + P2.run.E.toFixed(4) + '；任務 9 ' + (P2.events.includes('esterification-9') ? '也算' : '不算') + '）'); }

freshMissions(); P = newPage(); w = toEq(P, { A: 0.15, B: 1.2, T: 20, cat: 2 }, 3);
report('酸 0.15、醇 1.2（8 倍）、20 °C、×6000（' + s1(w) + ' 秒）：平衡產率 ' + pc(C.yieldOf(P.run)), P, ['esterification-10']);
noHidden('大量的醇', P);

freshMissions(); P = newPage(); setup(P, { A: 0.25, B: 0.5 }); sieves(P, 3); P.speed = 4; w = wait(P, 120, Q => Q.events.includes('esterification-11'));
report('酸 0.25、醇 0.5、分子篩 3 次、×60000（' + s1(w) + ' 秒，模擬 ' + (P.run.t / 3600).toFixed(1) + ' 小時）：產率 ' + pc(C.yieldOf(P.run)), P, ['esterification-11']);
noHidden('一滴不剩', P);
{ const P2 = newPage(); setup(P2, {}); sieves(P2, 5); P2.speed = 4; wait(P2, 120); console.log('    （等莫耳 0.5、分子篩 5 次跑 2 分鐘：產率 ' + pc(C.yieldOf(P2.run)) + '）'); }

// ---------- 隱藏任務 ----------
console.log('— 隱藏任務 —');
freshMissions(); P = newPage(); setup(P, { acid: 'formic', alc: 'methanol' }); P.speed = 2; wait(P, 60, atEq); workup(P);
reportH('甲酸＋甲醇、平衡後分出酯層：' + P.run.E.toFixed(3) + ' mol', P, 'esterification-h1');
freshMissions(); P = newPage(); setup(P, { acid: 'butyric' }); P.speed = 2; wait(P, 60, atEq); workup(P);
reportH('丁酸＋乙醇、平衡後分出酯層：' + P.run.E.toFixed(3) + ' mol', P, 'esterification-h2');
freshMissions(); P = newPage(); setup(P, { label: true }); P.speed = 2; wait(P, 60, atEq); workup(P);
reportH('勾氧-18、乙酸乙酯分出酯層：' + P.run.E.toFixed(3) + ' mol（莫耳質量 ' + C.esterM(P.run).toFixed(2) + '）', P, 'esterification-h3');
freshMissions(); P = newPage(); toEq(P, { A: 0.9, B: 0.25 }, 2);
reportH('酸 0.9、醇 0.25（酸 3.6 倍）、70 °C：以醇計的產率 ' + pc(P.run.xi / 0.25), P, 'esterification-h4');
freshMissions(); P = newPage(); w = toEq(P, { T: 25, cat: 2 }, 3);
reportH('等莫耳 0.5、25 °C、濃硫酸 2 mL、×6000（' + s1(w) + ' 秒）：產率 ' + pc(C.yieldOf(P.run)) + '（Berthelot 的 2/3）', P, 'esterification-h5');
freshMissions(); P = newPage(); toEq(P, { A: 0.3, B: 0.3, W: 0.9 }, 2);
reportH('酸、醇各 0.3 ＋水 0.9：產率 ' + pc(C.yieldOf(P.run)), P, 'esterification-h6');
{
  // 起始就在平衡：70 °C 的 K，選 E = W 使 Q = K
  const K70 = C.K(70), A = 0.5, E = Math.round(A * Math.sqrt(K70) * 100) / 100;
  freshMissions(); P = newPage(); setup(P, { A, B: A, E, W: E }); P.speed = 1; w = wait(P, 60, Q => Q.events.includes('esterification-h7'));
  reportH('酸、醇各 0.5、酯、水各 ' + E.toFixed(2) + '（Q = ' + C.Q(P.run.n0).toFixed(3) + '、K = ' + K70.toFixed(3) + '）、×60（' + s1(w) + ' 秒）：ξ = ' + P.run.xi.toExponential(1), P, 'esterification-h7');
}
freshMissions(); P = newPage(); toEq(P, { A: 0.4, B: 0.6, cat: 1 }, 2); w = toEq(P, { A: 0.4, B: 0.6, cat: 0 }, 4, 200);
reportH('酸 0.4、醇 0.6，先加 1 mL 濃硫酸、再不加，各跑到平衡（不加的那瓶 ×60000 要 ' + s1(w) + ' 秒）：酯 ' + P.eqLog[0].n.E.toFixed(4) + ' 與 ' + P.eqLog[1].n.E.toFixed(4), P, 'esterification-h8');
freshMissions(); P = newPage(); toEq(P, { A: 0.4, B: 0.6, T: 25, cat: 2 }, 3); { const E0 = P.run.E; setTemp(P, 80); wait(P, 120, atEq); reportH('酸 0.4、醇 0.6，25 °C 平衡後升到 80 °C：酯 ' + E0.toFixed(4) + ' → ' + P.run.E.toFixed(4), P, 'esterification-h9'); }
freshMissions(); P = newPage(); toEq(P, { A: 0.8, B: 0.5, T: 25, cat: 2 }, 3);
{
  const E0 = P.run.E;
  P.running = false; add(P, 'A'); add(P, 'W'); wait(P, 120, atEq);
  reportH('酸 0.8、醇 0.5、25 °C 平衡（酸 ' + P.eqLog[0].n.A.toFixed(3) + '、水 ' + P.eqLog[0].n.W.toFixed(3) + '），暫停時加酸、加水各 0.1：酯 ' + E0.toFixed(4) + ' → ' + P.run.E.toFixed(4), P, 'esterification-h10');
}
{ // 加酸、加水各一次，但酸和水的量不相等時天平會動
  freshMissions(); const P2 = newPage(); toEq(P2, { A: 0.5, B: 0.5, T: 25, cat: 2 }, 3); add(P2, 'A'); add(P2, 'W'); wait(P2, 120, atEq);
  const ok = !P2.events.includes('esterification-h10');
  console.log('  ' + (ok ? '✓' : '✗') + ' 等莫耳 0.5（酸 ≠ 水）平衡後加酸、加水：酯變了 ' + (P2.run.E - P2.eqLog[0].n.E).toFixed(4) + '，不算隱藏任務 10');
  if (!ok) bad++;
}

// ---------- 亂按：常見的操作不會誤觸隱藏任務 ----------
console.log('— 常見操作不誤觸隱藏任務 —');
{
  freshMissions(); P = newPage();
  const combos = [{}, { alc: 'isoamyl' }, { alc: 'methanol' }, { acid: 'formic' }, { A: 1, B: 1 }, { A: 0.3, B: 1.2 }, { cat: 0, T: 80 }, { T: 50 }, { E: 0.5, W: 0.5, A: 0, B: 0 }];
  combos.forEach(o => { toEq(P, o, 3); });
  setup(P, {}); P.speed = 2; wait(P, 10); add(P, 'B'); add(P, 'E'); wait(P, 30); sieves(P, 2); wait(P, 30); setTemp(P, 60); wait(P, 30); workup(P);
  noHidden('九種配方跑到平衡、加醇、加酯、加分子篩、改溫度、分液', P);
}

// ---------- 總結 ----------
const missing = missions.filter(m => !done[m.id]).map(m => m.id);
console.log(missing.length ? '  ✗ 沒有證明到的任務：' + missing.join('、') : '  ✓ ' + missions.length + ' 個任務都證明做得到');
if (missing.length) bad++;
const stars = missions.reduce((a, m) => a + (m.hidden ? m.level * 2 : m.level), 0);
console.log('    （公開 ' + missions.filter(m => !m.hidden).reduce((a, m) => a + m.level, 0) + ' 顆星、隱藏 ' + missions.filter(m => m.hidden).reduce((a, m) => a + m.level * 2, 0) + ' 顆星，共 ' + stars + ' 顆）');
if (bad) { console.log('失敗 ' + bad + ' 項'); process.exitCode = 1; }
