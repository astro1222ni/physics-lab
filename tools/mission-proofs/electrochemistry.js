/* 任務可達成的證明腳本。用法：node tools/mission-proofs/electrochemistry.js
 * 用化學核心模擬頁面（js/electrochemistry.js）的操作與事件：每一幀 1/60 秒、依時間倍率前進，
 * 每 0.5 秒送一次 'tick'；按「記錄這一筆」送 'record'；未知電極、未知金屬按「核對答案」送 'answerE'、'answerM'。
 * 確認每個任務都做得到、預設狀態不會觸發任務，並量出照建議做法要花多少真實時間。修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(__ROOT + 'js/electrochemistry-core.js');
const assert = require('node:assert/strict');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/electrochemistry.js');

const SPEEDS = [1, 100, 1e4, 1e6];
const results = {};
let bad = 0;
function freshMissions() { missions.forEach(m => { m.done = false; m.mem = {}; }); }

// ---------- 模擬頁面（與 js/electrochemistry.js 的 newCell／resetHalf／newElectro／advance／tickData／record 一致） ----------
function newPage() {
  const P = { mode: 'cell', speed: 1, L: 'Zn', R: 'Cu', cL: 1, cR: 1, vol: 100, bridge: false, load: 'V', Rload: 10,
    elec: 'C', cE: 0.5, volE: 200, I: 1, timer: 0, off: false, running: true, acted: false, events: [], wall: 0, rowsC: [], seg: 0, unkC: null, unkE: null, elecRevision: 0 };
  newCell(P); newElectro(P);
  return P;
}
function newCell(P) {
  const L = P.unkC ? 'X' : P.L;
  P.cell = C.createCell({ L: { metal: L, c: P.cL, V: P.vol / 1000 }, R: { metal: P.R, c: P.cR, V: P.vol / 1000 }, bridge: P.bridge, load: P.load, Rload: P.Rload });
  P.cell.E0 = C.emf(P.cell.L, P.cell.R);
}
function newElectro(P) {
  P.elecRevision++;
  P.elx = C.createElectro({ metal: P.unkE ? P.unkE.metal : 'Cu', c: P.cE, V: P.volE / 1000, elec: P.unkE ? 'C' : P.elec, I: P.I });
  P.off = P.timer > 0 && P.elx.t >= P.timer;
}
function set(P, k, v) {
  P.acted = true;
  P[k] = v;
  if (['L', 'R', 'cL', 'cR', 'vol'].includes(k)) newCell(P);   // 頁面：改金屬或濃度重設該半電池，改體積重設兩邊（結果相同）
  if (k === 'bridge') P.cell.bridge = v;
  if (k === 'load') P.cell.load = v;
  if (k === 'Rload') P.cell.Rload = v;
  if (['elec', 'cE', 'volE'].includes(k)) newElectro(P);
  if (k === 'I' && P.elx.I !== v) { P.elx.I = v; P.elecRevision++; }
  if (k === 'timer') P.off = v > 0 && P.elx.t >= v - 1e-9;
}
function tick(P) {
  const c = P.cell, e = P.elx, h = x => ({ metal: x.metal, c: x.c, c0: x.c0, m: x.m, m0: x.m0 });
  return {
    mode: P.mode, running: P.running,
    cell: { L: h(c.L), R: h(c.R), bridge: c.bridge, load: c.load, Rload: c.Rload, E: c.bridge ? C.emf(c.L, c.R) : 0, emf: C.emf(c.L, c.R), E0: c.E0,
      I: C.current(c), q: c.q, qAbs: c.qAbs, t: c.t, unk: !!P.unkC },
    elec: { elec: e.elec, metal: e.metal, unk: !!P.unkE, c: e.c, c0: e.c0, V: e.V, I: e.I, q: e.q, t: e.t, dep: e.dep, revision: P.elecRevision, mCath: e.mCath, mAnode: e.mAnode, base: e.base,
      H2: e.nH2 * C.VM * 1000, O2: e.nO2 * C.VM * 1000, off: P.off || !!e.spent, paused: !P.running || P.off || !!e.spent }
  };
}
function emit(P, type, data) {
  if (!P.acted) return;
  const ev = { type, data };
  missions.forEach(m => { if (!m.done && m.check(ev, m.mem)) { m.done = true; P.events.push(m.id); } });
}
/** 跑 sec 秒的真實時間（每 0.5 秒送 tick）；until(P) 為真就提早停 */
function run(P, sec, until) {
  const frames = Math.round(sec * 60);
  for (let k = 0; k < frames; k++) {
    if (P.running) {
      const dt = SPEEDS[P.speed] / 60;
      if (P.mode === 'cell') C.stepCell(P.cell, dt);
      else if (!P.off) {
        let d = dt;
        if (P.timer > 0) d = Math.max(0, Math.min(d, P.timer - P.elx.t));
        C.stepElectro(P.elx, d);
        if (P.timer > 0 && P.elx.t >= P.timer - 1e-9) { P.elx.t = P.timer; P.off = true; }
      }
    }
    P.wall += 1 / 60;
    if (k % 30 === 29) emit(P, 'tick', tick(P));
    if (until && until(P)) { emit(P, 'tick', tick(P)); return P.wall; }
  }
  emit(P, 'tick', tick(P));
  return P.wall;
}
function record(P) {
  P.acted = true;
  const c = P.cell;
  if (!c.bridge || c.load !== 'V') throw new Error('記錄要接伏特計與鹽橋');
  const r = { seg: P.seg, L: c.L.metal, R: c.R.metal, x: C.logQ(c.L, c.R), E: C.emf(c.L, c.R), unk: P.unkC ? 1 : 0 };
  P.rowsC.push(r);
  const same = P.rowsC.filter(q => q.seg === P.seg && q.L === r.L && q.R === r.R && q.unk === r.unk);
  let lo = Infinity, hi = -Infinity;
  same.forEach(q => { lo = Math.min(lo, q.x); hi = Math.max(hi, q.x); });
  const f = same.length >= 2 ? C.fitLine(same.map(q => ({ x: q.x, y: q.E }))) : null;
  emit(P, 'record', { pair: r.L + '|' + r.R, count: same.length, span: hi - lo, slope: f ? f.b : null, theory: -C.KN / C.nOf(r.L, r.R), unk: !!r.unk });
}
function report(name, P, ids) {
  const ok = ids.every(id => P.events.includes(id));
  ids.forEach(id => { if (P.events.includes(id)) results[id] = true; });
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + name + '：' + (P.events.length ? P.events.join('、') : '（沒有任務）'));
  if (!ok) bad++;
}
const r4 = x => +x.toFixed(4);

// ---------- 0. 預設狀態（兩種模式都操作過）不觸發任務 ----------
freshMissions();
let P = newPage(); P.acted = true;
run(P, 3);
P.mode = 'elec'; run(P, 3);
P.mode = 'cell'; set(P, 'load', 'R'); run(P, 2); set(P, 'load', 'V'); run(P, 1);
if (P.events.length) { console.log('  ✗ 預設狀態觸發了任務：' + P.events.join('、')); bad++; }
else console.log('  ✓ 預設狀態（鋅｜銅、沒有鹽橋、伏特計；電解 0.5 M、1 A）不觸發任務');

// ---------- 化學電池 ----------
freshMissions();
P = newPage();
set(P, 'bridge', true); run(P, 1);
report('放上鹽橋：E = ' + C.emf(P.cell.L, P.cell.R).toFixed(4) + ' V', P, ['electrochemistry-1']);
set(P, 'L', 'Mg'); set(P, 'R', 'Ag'); run(P, 1);
report('鎂｜銀 1 M：E = ' + C.emf(P.cell.L, P.cell.R).toFixed(4) + ' V', P, ['electrochemistry-2']);
const h1 = 'electrochemistry-h1';
// 11/20 改嚴：兩組不同配對，各自都要看過正、負兩個方向（|E| ≥ 1.0 V）
set(P, 'L', 'Cu'); set(P, 'R', 'Zn'); run(P, 1);
assert.ok(tick(P).cell.E <= -1 && !P.events.includes(h1), '只對調鋅、銅一組不會完成');
console.log('  ✓ 舊做法：只對調鋅、銅，電壓達標，h1 未完成');
set(P, 'L', 'Ag'); run(P, 1);
assert.ok(tick(P).cell.E <= -1 && !P.events.includes(h1), '銀｜鋅只有反向、沒看過正向，不會完成');
console.log('  ✓ 舊的兩組做法：鋅–銀只看到反向，h1 未完成');
set(P, 'L', 'Zn'); set(P, 'R', 'Ag'); run(P, 1);
assert.ok(!P.events.includes(h1), '最後一筆是正向讀數時不完成');
set(P, 'L', 'Ag'); set(P, 'R', 'Zn'); run(P, 1);
assert.deepEqual(P.events.filter(id => /-h\d+$/.test(id)), [h1]);
report('鋅｜銅正向 → 銅｜鋅反向 → 鋅｜銀正向 → 銀｜鋅 ' + tick(P).cell.E.toFixed(4) + ' V（每步等一秒）', P, [h1]);
// 只在一組來回對調、或兩組都只反向，都不算
freshMissions();
P = newPage(); set(P, 'L', 'Cu'); set(P, 'R', 'Zn'); set(P, 'bridge', true); run(P, 1);
set(P, 'L', 'Ag'); run(P, 1);
set(P, 'L', 'Zn'); set(P, 'R', 'Cu'); run(P, 1); set(P, 'L', 'Cu'); set(P, 'R', 'Zn'); run(P, 1);
if (P.events.includes(h1)) { console.log('  ✗ 只有一組看過正反兩向就完成 h1'); bad++; } else console.log('  ✓ 只有一組看過正反兩向（另一組只反向）不完成 h1');

freshMissions();
P = newPage(); set(P, 'bridge', true);
set(P, 'load', 'R'); set(P, 'Rload', 10); run(P, 1);
report('鋅｜銅接 10 Ω 燈泡：I = ' + (C.current(P.cell) * 1000).toFixed(1) + ' mA', P, ['electrochemistry-3']);

freshMissions();
P = newPage(); set(P, 'bridge', true);
set(P, 'L', 'Cu'); set(P, 'cL', 0.001); set(P, 'cR', 2); run(P, 1);
report('濃差電池 Cu 0.001 M｜Cu 2 M：E = ' + C.emf(P.cell.L, P.cell.R).toFixed(4) + ' V', P, ['electrochemistry-4']);
set(P, 'load', 'R'); set(P, 'Rload', 1); P.speed = 3;
let w = run(P, 600, Q => Math.abs(C.emf(Q.cell.L, Q.cell.R)) < 0.001);
report('接 1 Ω、×10⁶ 放電到 |E| < 1 mV（真實時間 ' + w.toFixed(1) + ' s）', P, ['electrochemistry-h2']);

freshMissions();
P = newPage(); set(P, 'bridge', true);
set(P, 'cL', 2); set(P, 'cR', 0.0013); run(P, 1);
report('Zn 2 M｜Cu 0.0013 M（打字輸入）：E = ' + C.emf(P.cell.L, P.cell.R).toFixed(4) + ' V', P, ['electrochemistry-5']);

freshMissions();
P = newPage(); set(P, 'bridge', true); set(P, 'load', 'R'); set(P, 'Rload', 1); P.speed = 3;
w = run(P, 600, Q => P.events.includes('electrochemistry-6'));
report('丹尼爾電池 1 M、100 mL，接 1 Ω、×10⁶ 放電（真實時間 ' + w.toFixed(1) + ' s，E ' + P.cell.E0.toFixed(4) + ' → ' + C.emf(P.cell.L, P.cell.R).toFixed(4) + ' V）', P, ['electrochemistry-6']);
P = newPage(); set(P, 'bridge', true); set(P, 'load', 'R'); set(P, 'Rload', 10); P.speed = 2; P.events = [];
freshMissions();
w = run(P, 600, Q => Q.events.includes('electrochemistry-6'));
console.log('    （同上改用 10 Ω、×10⁴：真實時間 ' + w.toFixed(1) + ' s）');

// 能斯特斜率：鋅｜銀，改變銀離子濃度（銅、鋅用 1 M）
freshMissions();
P = newPage(); set(P, 'bridge', true); set(P, 'R', 'Ag');
[1, 0.1, 0.01, 0.001, 2].forEach(c => { set(P, 'cR', c); record(P); });
const fz = C.fitLine(P.rowsC.map(r => ({ x: r.x, y: r.E })));
report('鋅｜銀記錄 5 筆（[Ag⁺] 1、0.1、0.01、0.001、2 M）：斜率 ' + fz.b.toFixed(5) + '（理論 ' + (-C.KN / 2).toFixed(5) + '）', P, ['electrochemistry-10']);
// 只有 4 筆、或兩種二價金屬，不算
freshMissions();
P = newPage(); set(P, 'bridge', true);
[1, 0.1, 0.01, 0.001, 2].forEach(c => { set(P, 'cR', c); record(P); });
if (P.events.includes('electrochemistry-10')) { console.log('  ✗ 鋅｜銅（都是二價）不該完成任務 10'); bad++; } else console.log('  ✓ 鋅｜銅 5 筆不算任務 10（要有銀）');

// ---------- 電解 ----------
freshMissions();
P = newPage(); P.mode = 'elec'; P.acted = true;
set(P, 'timer', 3036); P.speed = 1;
w = run(P, 120, Q => Q.off);
report('石墨、0.5 M、200 mL、1.00 A，定時 3036 s、×100（真實 ' + w.toFixed(1) + ' s）：Δm = ' + P.elx.dep.toFixed(4) + ' g', P, ['electrochemistry-7']);

freshMissions();
P = newPage(); P.mode = 'elec'; P.acted = true;
set(P, 'elec', 'Cu'); set(P, 'I', 2); P.speed = 2;
w = run(P, 120, Q => Q.events.includes('electrochemistry-8'));
report('銅電極、0.5 M、2 A、×10⁴（真實 ' + w.toFixed(1) + ' s）：陰極 +' + (P.elx.mCath - 10).toFixed(4) + ' g、陽極 −' + (10 - P.elx.mAnode).toFixed(4) + ' g、c = ' + P.elx.c.toFixed(4), P, ['electrochemistry-8']);
// 稀溶液時陰極有一部分電流產生氫氣，精煉的差距超過 1%
freshMissions();
P = newPage(); P.mode = 'elec'; P.acted = true;
set(P, 'elec', 'Cu'); set(P, 'cE', 0.05); set(P, 'I', 2); P.speed = 2;
run(P, 3);
console.log('    （0.05 M 時：陰極 +' + (P.elx.mCath - 10).toFixed(4) + ' g、陽極 −' + (10 - P.elx.mAnode).toFixed(4) + ' g，任務 8 ' + (P.events.includes('electrochemistry-8') ? '完成' : '未完成') + '）');

freshMissions();
P = newPage(); P.mode = 'elec'; P.acted = true;
set(P, 'cE', 0.1); set(P, 'I', 2); P.speed = 2;
w = run(P, 120, Q => Q.events.includes('electrochemistry-9'));
report('石墨、0.10 M、2 A、×10⁴（真實 ' + w.toFixed(1) + ' s）', P, ['electrochemistry-9']);

const h3 = 'electrochemistry-h3';
freshMissions();
P = newPage(); P.speed = 3; set(P, 'mode', 'elec');
run(P, 2);
assert.ok(tick(P).elec.H2 >= 1 && !P.events.includes(h3), '直接以最高倍率電解不會完成');
console.log('  ✓ 舊做法：以 ×10⁶ 切到電解，氫氣達標，h3 未完成');

for (const restart of [
  Q => newElectro(Q),
  Q => { set(Q, 'I', 2); set(Q, 'I', 1); }
]) {
  freshMissions();
  P = newPage(); P.speed = 2; set(P, 'mode', 'elec'); set(P, 'cE', 2);
  run(P, 3);
  assert.equal(missions.find(m => m.id === h3).mem.copperTicks, 6);
  restart(P);
  P.speed = 3;
  run(P, 1);
  assert.ok(tick(P).elec.H2 >= 1 && !P.events.includes(h3), '重設或電流來回變動會清除先前的銅析出紀錄');
}
console.log('  ✓ 回報之間重設電解或來回調電流，先前六次銅析出皆作廢');
// 11/20 再加嚴後的反例：預設 0.5 M 用 ×10⁴（銅只演不到 2 秒）、體積打成 3.14 mL 用 ×100（銅不到 1 g），都不算
for (const [lab, setup] of [
  ['預設 0.5 M、1 A、×10⁴', Q => { Q.speed = 2; }],
  ['體積 3.14 mL、×100', Q => { set(Q, 'volE', 3.14159); Q.speed = 1; }]
]) {
  freshMissions();
  P = newPage(); set(P, 'mode', 'elec'); setup(P);
  run(P, 30, Q => Q.elx.nH2 * C.VM * 1000 >= 5);
  if (P.events.includes(h3)) { console.log('  ✗ ' + lab + ' 不該完成 h3'); bad++; }
  else console.log('  ✓ ' + lab + '：氫氣 ' + tick(P).elec.H2.toFixed(1) + ' mL，h3 未完成');
}

freshMissions();
P = newPage(); P.speed = 2; set(P, 'mode', 'elec'); set(P, 'cE', 2);
w = run(P, 10, Q => Q.events.includes(h3));
assert.deepEqual(P.events.filter(id => /-h\d+$/.test(id)), [h3]);
report('石墨、2.00 M、1 A、×10⁴，真實 ' + w.toFixed(1) + ' s，銅析出回報 ' +
  missions.find(m => m.id === h3).mem.copperTicks + ' 次、氫氣 ' + tick(P).elec.H2.toFixed(1) + ' mL', P, [h3]);

// ---------- 未知電極、未知金屬 ----------
let rs = 7;
const rng = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
let ok11 = 0, ok12 = 0, N = 200, worst12 = 0;
for (let k = 0; k < N; k++) {
  freshMissions();
  P = newPage(); P.acted = true; set(P, 'bridge', true);
  const Etrue = C.newUnknownE(rng);
  P.unkC = { E: Etrue }; newCell(P);
  // 學生：右邊用銅 1 M、左邊 X 1 M，讀數顯示到 0.0001 V，E°(X) = E°(Cu) − E
  const E = r4(C.emf(P.cell.L, P.cell.R));
  const ans = +(0.337 - E).toFixed(3);
  emit(P, 'answerE', { ans, err: Math.abs(ans - Etrue), tries: 1, revealed: false });
  if (P.events.includes('electrochemistry-11')) ok11++;
  // 未知金屬：石墨、0.5 M、200 mL、1 A、定時 3600 s；讀 Q（4 位有效數字）與 Δm（0.0001 g）
  freshMissions();
  P = newPage(); P.mode = 'elec'; P.acted = true;
  P.unkE = { metal: C.newUnknownMetal(rng) }; newElectro(P);
  set(P, 'timer', 3600); P.speed = 2;
  run(P, 5, Q => Q.off);
  const q = +P.elx.q.toPrecision(4), dep = r4(P.elx.dep);
  const Mans = +(dep * 2 * C.F / q).toFixed(2), Mt = C.METALS[P.unkE.metal].M;
  const err = Math.abs(Mans - Mt) / Mt;
  worst12 = Math.max(worst12, err);
  emit(P, 'answerM', { ans: Mans, err, tries: 1, revealed: false });
  if (P.events.includes('electrochemistry-12')) ok12++;
}
results['electrochemistry-11'] = ok11 === N; results['electrochemistry-12'] = ok12 === N;
console.log('  ' + (ok11 === N ? '✓' : '✗') + ' 未知電極 ' + N + ' 次（對銅 1 M 量一次）：成功 ' + ok11 + ' 次');
console.log('  ' + (ok12 === N ? '✓' : '✗') + ' 未知金屬 ' + N + ' 次（1 A、3600 s）：成功 ' + ok12 + ' 次，最大誤差 ' + (100 * worst12).toFixed(3) + '%');
if (ok11 !== N || ok12 !== N) bad++;

// ---------- h4–h10（每個做法只完成它自己這個隱藏任務） ----------
{
  const isHid = id => /-h\d+$/.test(id);
  const H = n => 'electrochemistry-h' + n;
  const reportH = (name, Q, id) => {
    const extra = Q.events.filter(x => isHid(x) && x !== id);
    report(name + (extra.length ? '　← 順便完成了 ' + extra.join('、') : ''), Q, [id]);
    if (extra.length) bad++;
  };
  const cellPage = (L, R, cL, cR, vol) => { freshMissions(); const Q = newPage(); set(Q, 'L', L); set(Q, 'R', R); set(Q, 'cL', cL); set(Q, 'cR', cR); if (vol) set(Q, 'vol', vol); set(Q, 'bridge', true); return Q; };
  let Q;
  Q = cellPage('Ag', 'Ag', 0.001, 2); run(Q, 1);
  reportH('Ag | Ag 濃差電池 0.001 M 與 2 M：E = ' + C.emf(Q.cell.L, Q.cell.R).toFixed(4) + ' V（Cu 同樣濃度只有 ' + (C.KN / 2 * Math.log10(2000)).toFixed(4) + ' V）', Q, H(4));
  Q = cellPage('Zn', 'Cu', 1, 0.001); set(Q, 'load', 'R'); set(Q, 'Rload', 10); Q.speed = 1;
  let w = run(Q, 120, X => X.events.includes(H(5)));
  reportH('Zn 1 M | Cu 0.001 M、100 mL、接 10 Ω、×100（真實 ' + w.toFixed(1) + ' s）：Cu²⁺ 剩 ' + Q.cell.R.c.toExponential(2) + ' M', Q, H(5));
  Q = cellPage('Sn', 'Pb', 2, 0.002); run(Q, 1);
  reportH('Sn 2 M | Pb 0.002 M：E = ' + C.emf(Q.cell.L, Q.cell.R).toFixed(4) + ' V（標準狀態 +' + (C.METALS.Pb.E - C.METALS.Sn.E).toFixed(4) + ' V）', Q, H(6));
  Q = cellPage('Zn', 'Cu', 1, 2, 250); set(Q, 'load', 'R'); set(Q, 'Rload', 1); Q.speed = 3;
  w = run(Q, 60, X => X.events.includes(H(7)));
  reportH('Zn 1 M | Cu 2 M、250 mL、接 1 Ω、×10⁶（真實 ' + w.toFixed(1) + ' s）：鋅片剩 ' + Q.cell.L.m.toFixed(4) + ' g', Q, H(7));
  Q = cellPage('Zn', 'Cu', 1, 1); set(Q, 'load', 'R'); set(Q, 'Rload', 5); run(Q, 1);
  { const E = C.emf(Q.cell.L, Q.cell.R), Pw = R => (E / (R + 5)) ** 2 * R;
    reportH('Zn | Cu 接 5.0 Ω（內電阻 5 Ω）：功率 ' + Pw(5).toFixed(4) + ' W（4 Ω ' + Pw(4).toFixed(4) + '、6 Ω ' + Pw(6).toFixed(4) + '）', Q, H(8)); }
  freshMissions(); Q = newPage(); Q.mode = 'elec'; set(Q, 'elec', 'Cu'); set(Q, 'I', 2); Q.speed = 2;
  w = run(Q, 60, X => X.events.includes(H(9)));
  reportH('銅電極、2 A、×10⁴（真實 ' + w.toFixed(1) + ' s）：陽極剩 ' + Q.elx.mAnode.toFixed(4) + ' g、陰極 ' + Q.elx.mCath.toFixed(3) + ' g', Q, H(9));
  Q = cellPage('Zn', 'Cu', 0.0035, 2); run(Q, 1);
  reportH('Zn 0.0035 M | Cu 2 M：E = ' + C.emf(Q.cell.L, Q.cell.R).toFixed(4) + ' V（最大可到 ' + (1.0988 + C.KN / 2 * Math.log10(2000)).toFixed(3) + ' V）', Q, H(10));
  // 反例：Zn 1 M | Cu 1 M 接 4 Ω 不算 h8；Cu | Cu 濃差電池 0.001／2 M 不算 h4；Ni | Sn 換濃度也翻不過來
  Q = cellPage('Zn', 'Cu', 1, 1); set(Q, 'load', 'R'); set(Q, 'Rload', 4); run(Q, 1);
  Q.events.some(isHid) ? (console.log('  ✗ 4 Ω 也算了：' + Q.events.join('、')), bad++) : console.log('  ✓ 接 4 Ω 不算 h8');
  Q = cellPage('Cu', 'Cu', 0.001, 2); run(Q, 1);
  Q.events.some(isHid) ? (console.log('  ✗ 銅的濃差電池也算了：' + Q.events.join('、')), bad++) : console.log('  ✓ 銅的濃差電池 0.001／2 M（' + C.emf(Q.cell.L, Q.cell.R).toFixed(4) + ' V）不算隱藏任務');
  Q = cellPage('Ni', 'Sn', 2, 0.001); run(Q, 1);
  Q.events.some(isHid) ? (console.log('  ✗ Ni | Sn 也算了'), bad++) : console.log('  ✓ Ni 2 M | Sn 0.001 M 仍是 ' + C.emf(Q.cell.L, Q.cell.R).toFixed(4) + ' V（翻不過來），不算 h6');
}

// ---------- 結論 ----------
const missing = missions.filter(m => !results[m.id]).map(m => m.id);
let stars = 0, hid = 0;
missions.forEach(m => { if (m.hidden) hid += 2 * m.level; else stars += m.level; }); // 隱藏任務星星 = 等級 × 2（LabMission.starsOf）
console.log('\n公開任務 ' + missions.filter(m => !m.hidden).length + ' 個（' + stars + ' 顆星）、隱藏任務 ' + missions.filter(m => m.hidden).length + ' 個（' + hid + ' 顆星）');
if (missing.length || bad) { console.log('✗ 沒有做到：' + missing.join('、') + (bad ? '（另有 ' + bad + ' 項錯誤）' : '')); process.exit(1); }
console.log('✓ 全部任務都做得到，預設狀態不觸發任務');
