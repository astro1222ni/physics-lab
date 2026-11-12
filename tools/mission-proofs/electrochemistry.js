/* 任務可達成的證明腳本。用法：node tools/mission-proofs/electrochemistry.js
 * 用化學核心模擬頁面（js/electrochemistry.js）的操作與事件：每一幀 1/60 秒、依時間倍率前進，
 * 每 0.5 秒送一次 'tick'；按「記錄這一筆」送 'record'；未知電極、未知金屬按「核對答案」送 'answerE'、'answerM'。
 * 確認每個任務都做得到、預設狀態不會觸發任務，並量出照建議做法要花多少真實時間。修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(__ROOT + 'js/electrochemistry-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/electrochemistry.js');

const SPEEDS = [1, 100, 1e4, 1e6];
const results = {};
let bad = 0;
function freshMissions() { missions.forEach(m => { m.done = false; }); }

// ---------- 模擬頁面（與 js/electrochemistry.js 的 newCell／resetHalf／newElectro／advance／tickData／record 一致） ----------
function newPage() {
  const P = { mode: 'cell', speed: 1, L: 'Zn', R: 'Cu', cL: 1, cR: 1, vol: 100, bridge: false, load: 'V', Rload: 10,
    elec: 'C', cE: 0.5, volE: 200, I: 1, timer: 0, off: false, running: true, acted: false, events: [], wall: 0, rowsC: [], seg: 0, unkC: null, unkE: null };
  newCell(P); newElectro(P);
  return P;
}
function newCell(P) {
  const L = P.unkC ? 'X' : P.L;
  P.cell = C.createCell({ L: { metal: L, c: P.cL, V: P.vol / 1000 }, R: { metal: P.R, c: P.cR, V: P.vol / 1000 }, bridge: P.bridge, load: P.load, Rload: P.Rload });
  P.cell.E0 = C.emf(P.cell.L, P.cell.R);
}
function newElectro(P) {
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
  if (k === 'I') P.elx.I = v;
  if (k === 'timer') P.off = v > 0 && P.elx.t >= v - 1e-9;
}
function tick(P) {
  const c = P.cell, e = P.elx, h = x => ({ metal: x.metal, c: x.c, c0: x.c0, m: x.m, m0: x.m0 });
  return {
    mode: P.mode, running: P.running,
    cell: { L: h(c.L), R: h(c.R), bridge: c.bridge, load: c.load, Rload: c.Rload, E: c.bridge ? C.emf(c.L, c.R) : 0, emf: C.emf(c.L, c.R), E0: c.E0,
      I: C.current(c), q: c.q, qAbs: c.qAbs, t: c.t, unk: !!P.unkC },
    elec: { elec: e.elec, metal: e.metal, unk: !!P.unkE, c: e.c, c0: e.c0, V: e.V, I: e.I, q: e.q, t: e.t, dep: e.dep, mCath: e.mCath, mAnode: e.mAnode, base: e.base,
      H2: e.nH2 * C.VM * 1000, O2: e.nO2 * C.VM * 1000, off: P.off || !!e.spent, paused: !P.running || P.off || !!e.spent }
  };
}
function emit(P, type, data) {
  if (!P.acted) return;
  const ev = { type, data };
  missions.forEach(m => { if (!m.done && m.check(ev)) { m.done = true; P.events.push(m.id); } });
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
set(P, 'L', 'Cu'); set(P, 'R', 'Zn'); run(P, 1);
report('銅在左、鋅在右：E = ' + C.emf(P.cell.L, P.cell.R).toFixed(4) + ' V', P, ['electrochemistry-h1']);

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
w = run(P, 120, Q => Q.events.includes('electrochemistry-9') && Q.events.includes('electrochemistry-h3'));
report('石墨、0.10 M、2 A、×10⁴（真實 ' + w.toFixed(1) + ' s）：c = ' + P.elx.c.toFixed(4) + ' M、H2 = ' + (P.elx.nH2 * C.VM * 1000).toFixed(1) + ' mL', P, ['electrochemistry-9', 'electrochemistry-h3']);

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

// ---------- 結論 ----------
const missing = missions.filter(m => !results[m.id]).map(m => m.id);
let stars = 0, hid = 0;
missions.forEach(m => { if (m.hidden) hid += 2 * m.level; else stars += m.level; }); // 隱藏任務星星 = 等級 × 2（LabMission.starsOf）
console.log('\n公開任務 ' + missions.filter(m => !m.hidden).length + ' 個（' + stars + ' 顆星）、隱藏任務 ' + missions.filter(m => m.hidden).length + ' 個（' + hid + ' 顆星）');
if (missing.length || bad) { console.log('✗ 沒有做到：' + missing.join('、') + (bad ? '（另有 ' + bad + ' 項錯誤）' : '')); process.exit(1); }
console.log('✓ 全部任務都做得到，預設狀態不觸發任務');
