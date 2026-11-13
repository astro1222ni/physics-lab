/* 任務可達成的證明腳本。用法：node tools/mission-proofs/colligative-properties.js
 * 用化學核心模擬頁面（js/colligative-properties.js）的操作與事件：每模擬 1 秒記錄一筆讀數、送一次 'tick'；
 * 「記錄結果」用 CollCore.measure（和頁面同一個函式）送 'measure'（含這一系列之前的紀錄 prev 與同組直線 line）；
 * 未知物「對答案」送 'answer'，學生的答案用畫面上顯示的 ΔT（到 0.01 K）與公式 M = K·W2·1000 ÷ (ΔT·W1) 算。
 * 確認每個任務都做得到、預設狀態不觸發任務、每個隱藏任務的做法不會順便完成別的隱藏任務。修改核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(__ROOT + 'js/colligative-properties-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/colligative-properties.js');

let bad = 0;
const done = {};
const hid = id => /-h\d+$/.test(id);
function freshMissions() { missions.forEach(m => { m.done = false; }); }
function newPage() { return { records: [], seg: 0, events: [], unk: null, acted: true }; }
function emit(P, type, data) {
  if (!P.acted) return;
  const ev = { type, data };
  missions.forEach(m => { if (!m.done && m.check(ev)) { m.done = true; P.events.push(m.id); } });
}
const DEF = { mode: 'f', solvent: 'water', solute: 'glucose', w1: 50, w2: 4.5, ideal: false, stir: true, chips: true, reflux: true, Tbath: -10, P: 100, Troom: 25 };
/** 一次實驗：按「開始」，跑到相變後 after 秒（或結束）；每 1 s 送 tick。seedAt：讀數降到這個溫度以下就按「加晶種」 */
function experiment(P, o, after, seedAt) {
  const opts = Object.assign({}, DEF, o);
  if (opts.solute === 'X') opts.M = P.unk.M;
  if (o.Tbath == null && opts.mode === 'f') opts.Tbath = C.bathRange(opts.solvent).def;
  const r = C.createRun(opts), rows = [C.sample(r)];
  P.run = r; P.rows = rows;
  while (!r.ended) {
    if (seedAt != null && !r.nucleated && C.reading(r) <= seedAt) C.seed(r);
    C.step(r, 1); rows.push(C.sample(r));
    emit(P, 'tick', { mode: r.mode, solvent: r.solvent, solute: r.w2 > 0 ? r.solute : 'none', w2: r.w2, running: true, nucleated: r.nucleated, superDepth: r.superDepth,
      boiling: r.boiling, bumped: r.bumped, superMax: r.superMax, reading: C.reading(r), frozen: C.frozenFrac(r), lost: C.lostFrac(r), t: r.t, seeded: r.seeded });
    const on = r.mode === 'f' ? r.tNuc : r.tBoil;
    if (on != null && r.t >= on + (after == null ? 100 : after)) break;
  }
  return r;
}
const groupKey = r => r.mode + '|' + r.solvent + '|' + r.solute + '|' + (r.ideal ? 1 : 0);
/** 按「記錄結果」 */
function record(P, method) {
  const r = P.run, M = C.measure(r, P.rows, method || 'ext');
  if (!M) throw new Error('還不能記錄（相變段的資料不夠）');
  const isX = r.solute === 'X';
  const prev = P.records.filter(x => x.seg === P.seg).map(x => ({ mode: x.mode, solvent: x.solvent, solute: x.solute, electrolyte: x.electrolyte, ideal: x.ideal, dT: x.dT, m: x.m, w2: x.w2, Tmeas: x.Tmeas, err: x.err, isX: x.isX }));
  const rec = Object.assign({}, M, { seg: P.seg, isX, unkId: isX ? P.unk.id : null });
  P.records.push(rec);
  const grp = P.records.filter(x => x.seg === P.seg && !x.isX && x.solute !== 'none' && groupKey(x) === groupKey(rec));
  let line = null;
  if (grp.length >= 2) {
    const f = C.fitOrigin(grp.map(x => [x.m, x.dT])), ms = grp.map(x => x.m);
    line = { n: grp.length, k: f.k, kTh: grp[0].i * grp[0].K, r2: f.r2, span: Math.max.apply(null, ms) / Math.min.apply(null, ms) };
  }
  emit(P, 'measure', Object.assign({}, M, { isX, unkId: rec.unkId, revealed: false, prev, line }));
  return rec;
}
/** 學生由最後一筆 X 的紀錄算出的莫耳質量（用畫面上顯示的 ΔT，0.01 K） */
function studentM(P) {
  const xs = P.records.filter(x => x.isX && x.unkId === P.unk.id), last = xs[xs.length - 1];
  return +C.molarMassFrom(last.K, last.w2, last.w1, Math.round(last.dT * 100) / 100).toPrecision(4);
}
/** 「對答案」 */
function answer(P) {
  const xs = P.records.filter(x => x.isX && x.unkId === P.unk.id), last = xs[xs.length - 1];
  const M = studentM(P);
  const err = M / P.unk.M - 1;
  emit(P, 'answer', { M, Mtrue: P.unk.M, err, revealed: false, measured: true, via: { mode: last.mode, solvent: last.solvent, method: last.method, dT: last.dT, err: last.err } });
  return err;
}
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
function never(name, P, ids) {
  const hit = P.events.filter(x => ids.includes(x));
  console.log('  ' + (hit.length ? '✗' : '✓') + ' ' + name + (hit.length ? '：卻完成了 ' + hit.join('、') : ''));
  if (hit.length) bad++;
}
const pc = x => (x * 100).toFixed(2) + '%';
const mass = (so, m, w1) => Math.round(C.SOLUTES[so].M * m * (w1 || 50) / 1000 * 1000) / 1000;
let P, r;

// ---------- 0. 預設狀態 ----------
freshMissions(); P = newPage();
P.acted = false;                    // 載入後沒有操作：頁面不送任何事件
experiment(P, {}, 400);
P.acted = true;
experiment(P, {}, 400);              // 按「開始」、一直跑到結束，但不記錄結果
experiment(P, { mode: 'b' }, 400);
if (P.events.length) { console.log('  ✗ 預設設定只按「開始」就觸發了任務：' + P.events.join('、')); bad++; }
else console.log('  ✓ 預設設定（0.5 m 葡萄糖水、攪拌、冷浴 −10 °C；沸點模式 100 W、沸石、回流）只按「開始」不觸發任務');

// ---------- 1. 一般任務 ----------
freshMissions(); P = newPage();
experiment(P, {}); r = record(P, 'ext');
report('預設 0.500 m 葡萄糖水、外插：ΔTf = ' + r.dT.toFixed(3) + '（理論 ' + r.dTth.toFixed(3) + '，誤差 ' + pc(r.err) + '）', P, ['colligative-properties-1', 'colligative-properties-6']);

freshMissions(); P = newPage();
experiment(P, { mode: 'b', w2: mass('glucose', 1.0) }); r = record(P, 'raw');
report('沸點：1.00 m 葡萄糖水、沸石、回流、直接讀：ΔTb = ' + r.dT.toFixed(3) + '（理論 ' + r.dTth.toFixed(3) + '，誤差 ' + pc(r.err) + '）', P, ['colligative-properties-2', 'colligative-properties-7']);

freshMissions(); P = newPage();
experiment(P, { w2: 0 }); r = record(P, 'raw');
report('純水、直接讀：' + r.Tmeas.toFixed(2) + ' °C（差 ' + r.absErr.toFixed(3) + ' K）', P, ['colligative-properties-3']);

freshMissions(); P = newPage();
r = experiment(P, { stir: false });
report('不攪拌、冷浴 −10 °C：過冷 ' + r.superDepth.toFixed(2) + ' K 才結晶', P, ['colligative-properties-4']);
freshMissions(); P = newPage();
r = experiment(P, { stir: false, Tbath: -20 }, 0);
const P2 = newPage(); P2.events = [];
{ // 加晶種不算
  freshMissions(); P = newPage();
  const o = Object.assign({}, DEF, { stir: false, Tbath: -20 }), rr = C.createRun(o);
  while (rr.T > C.Tf(rr) - 0.5) C.step(rr, 1);
  C.seed(rr);
  emit(P, 'tick', { mode: 'f', nucleated: rr.nucleated, seeded: rr.seeded, superDepth: rr.superDepth });
  never('冷到凝固點下 0.5 K 就加晶種：不算任務 4', P, ['colligative-properties-4']);
}

freshMissions(); P = newPage();
experiment(P, { solute: 'NaCl', w2: mass('NaCl', 1.0), Tbath: -15 }); r = record(P, 'ext');
report('1.00 m NaCl、冷浴 −15 °C、外插：凝固點 ' + r.Tmeas.toFixed(2) + ' °C', P, ['colligative-properties-5']);

freshMissions(); P = newPage();
experiment(P, { solute: 'NaCl', w2: mass('NaCl', 0.5) }); r = record(P, 'ext');
report('0.500 m NaCl、外插：i = ' + r.iExp.toFixed(3), P, ['colligative-properties-8']);
freshMissions(); P = newPage();
experiment(P, { solute: 'NaCl', w2: mass('NaCl', 0.5), ideal: true }); r = record(P, 'ext');
never('勾「理想 i」：i = ' + r.iExp.toFixed(3) + '，不算任務 8', P, ['colligative-properties-8']);

freshMissions(); P = newPage();
experiment(P, { solute: 'MgSO4', w2: mass('MgSO4', 1.0) }); r = record(P, 'ext');
report('1.00 m MgSO4、外插：i = ' + r.iExp.toFixed(3), P, ['colligative-properties-9']);

freshMissions(); P = newPage();
[0.25, 0.5, 1.0, 1.5].forEach(m => { experiment(P, { w2: mass('glucose', m), Tbath: -15 }); record(P, 'ext'); });
{
  const L = C.fitOrigin(P.records.map(x => [x.m, x.dT]));
  report('葡萄糖 0.25、0.5、1.0、1.5 m（冷浴 −15 °C、外插）：斜率 ' + L.k.toFixed(4) + '（理論 1.86）、R² = ' + L.r2.toFixed(5), P, ['colligative-properties-10']);
}
freshMissions(); P = newPage();
[0.25, 0.5, 1.0, 1.5].forEach(m => { experiment(P, { w2: mass('glucose', m), stir: false, Tbath: -25 }); record(P, 'raw'); });
{
  const L = C.fitOrigin(P.records.map(x => [x.m, x.dT]));
  console.log('    （對照：同樣四點、不攪拌、冷浴 −25 °C、直接讀：斜率 ' + L.k.toFixed(4) + '，' + (P.events.includes('colligative-properties-10') ? '也算' : '不算') + '任務 10）');
}

// 未知物（隨機 200 個）
function unknownTrial(seedFn, plan) {
  P = newPage(); freshMissions();
  P.unk = Object.assign(C.newUnknown(seedFn), { id: 1 });
  experiment(P, plan.o, plan.after); record(P, plan.method);
  if (plan.refine) {
    // 第二次：用第一次估的 M，選 ΔT 約 dTgoal 的質量，冷浴比估計的凝固點低 8 K，讀數剛低於估計的凝固點 0.2 K 就加晶種
    const M1 = studentM(P), sv = C.SOLVENTS[plan.o.solvent], w1 = plan.o.w1 || 50;
    const w2 = Math.min(C.maxSoluteMass(plan.o.solvent, 'X', w1), Math.round(plan.refine.dTgoal * M1 * w1 / (sv.Kf * 1000) * 100) / 100);
    const dTe = sv.Kf * w2 * 1000 / (M1 * w1), Tfe = sv.Tf - dTe, R = C.bathRange(plan.o.solvent);
    const bath = Math.max(R.min, Math.min(R.max, Math.round((Tfe - 8) * 2) / 2));
    experiment(P, Object.assign({}, plan.o, { w2: w2, Tbath: bath }), 100, Tfe - 0.2); record(P, 'ext');
  }
  return answer(P);
}
let rs = 17;
const rng = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
function trials(name, plan, id, N, need) {
  let ok = 0, worst = 0, extra = new Set();
  rs = 17;
  for (let k = 0; k < N; k++) {
    const e = unknownTrial(rng, plan);
    worst = Math.max(worst, Math.abs(e));
    if (P.events.includes(id)) ok++;
    P.events.filter(x => hid(x) && x !== id).forEach(x => extra.add(x));
  }
  const pass = ok >= need * N;
  console.log('  ' + (pass ? '✓' : '✗') + ' ' + name + '：' + ok + '/' + N + ' 次完成 ' + id + '（最差誤差 ' + pc(worst) + '）' + (hid(id) && extra.size ? '　（同時完成的隱藏任務：' + Array.from(extra).join('、') + '）' : ''));
  if (pass) done[id] = true; else bad++;
  return extra;
}
trials('未知物：水 50 g、X 4.00 g、冷浴 −10 °C、外插', { o: { solute: 'X', w2: 4.0 }, method: 'ext' }, 'colligative-properties-11', 200, 0.95);
trials('未知物 1%：環己烷 50 g、先用 X 1.00 g、冷浴 −10 °C 粗測；再選 ΔT ≈ 5 K 的質量、剛低於凝固點就加晶種、外插', { o: { solvent: 'cyclohexane', solute: 'X', w2: 1.0, Tbath: -10 }, method: 'ext', refine: { dTgoal: 5 } }, 'colligative-properties-12', 200, 0.95);

// ---------- 2. 隱藏任務 ----------
freshMissions(); P = newPage();
experiment(P, { solvent: 'acetic', w2: 0 }); r = record(P, 'raw');
reportH('冰醋酸（純）、直接讀：凝固點 ' + r.Tmeas.toFixed(2) + ' °C', P, 'colligative-properties-h1');

freshMissions(); P = newPage();
r = experiment(P, { mode: 'b', chips: false, w2: 0 }, 30);
reportH('沸點模式拿掉沸石（100 W）：過熱 ' + r.superMax.toFixed(2) + ' K 後突沸', P, 'colligative-properties-h2');
freshMissions(); P = newPage();
r = experiment(P, { mode: 'b', chips: true, w2: 0, P: 200 }, 30);
never('有沸石（200 W，過熱 ' + r.superMax.toFixed(3) + ' K）不算 h2', P, ['colligative-properties-h2']);

freshMissions(); P = newPage();
experiment(P, { solvent: 'benzene', solute: 'benzoic', w2: mass('benzoic', 0.5) }); r = record(P, 'ext');
reportH('苯 50 g、苯甲酸 0.5 m、外插：i = ' + r.iExp.toFixed(3), P, 'colligative-properties-h3');

freshMissions(); P = newPage();
experiment(P, { solute: 'NaCl', w2: 1.813 }); r = record(P, 'ext');
reportH('海水：NaCl 1.813 g 溶於 50 g 水（' + r.wt.toFixed(2) + '%）、外插：凝固點 ' + r.Tmeas.toFixed(2) + ' °C', P, 'colligative-properties-h4');

freshMissions(); P = newPage();
experiment(P, { mode: 'b', solute: 'NaCl', w1: 200, w2: 3.0 }); r = record(P, 'raw');
reportH('煮麵水：200 g 水加 3.0 g NaCl（1.5%）、回流、直接讀：ΔTb = ' + r.dT.toFixed(3) + '（理論 ' + r.dTth.toFixed(3) + '）', P, 'colligative-properties-h5');

freshMissions(); P = newPage();
experiment(P, { solute: 'MgCl2', w2: 9.52, Tbath: -25 }); r = record(P, 'ext');
reportH('MgCl2 9.52 g（2.0 m）、冷浴 −25 °C、外插：凝固點 ' + r.Tmeas.toFixed(2) + ' °C', P, 'colligative-properties-h6');
freshMissions(); P = newPage();
experiment(P, { solute: 'MgCl2', w2: 9.52, Tbath: -25, ideal: true }); r = record(P, 'ext');
never('勾「理想 i」（' + r.Tmeas.toFixed(2) + ' °C）不算 h6', P, ['colligative-properties-h6']);

freshMissions(); P = newPage();
experiment(P, { w2: mass('glucose', 0.6) }); record(P, 'ext');
experiment(P, { solute: 'sucrose', w2: mass('sucrose', 0.6) }); r = record(P, 'ext');
reportH('同一系列：0.6 m 葡萄糖（' + mass('glucose', 0.6) + ' g）與 0.6 m 蔗糖（' + mass('sucrose', 0.6) + ' g），ΔT ' + P.records[0].dT.toFixed(3) + ' 與 ' + r.dT.toFixed(3), P, 'colligative-properties-h7');

freshMissions(); P = newPage();
experiment(P, { solute: 'NaCl', w2: mass('NaCl', 0.5) }); record(P, 'ext');
experiment(P, { w2: mass('glucose', 0.95) }); r = record(P, 'ext');
reportH('同一系列：0.5 m NaCl 與 0.95 m 葡萄糖：凝固點 ' + P.records[0].Tmeas.toFixed(3) + ' 與 ' + r.Tmeas.toFixed(3) + ' °C', P, 'colligative-properties-h8');
freshMissions(); P = newPage();
experiment(P, { solute: 'NaCl', w2: mass('NaCl', 0.5) }); record(P, 'ext');
experiment(P, { w2: mass('glucose', 0.5) }); record(P, 'ext');
never('對照：0.5 m NaCl 與 0.5 m 葡萄糖（凝固點差很多）不算 h7、h8', P, ['colligative-properties-h7', 'colligative-properties-h8']);

const ex9 = trials('h9：同上的兩步做法，但第二次選 ΔT ≈ 8 K（環己烷、加晶種、外插）', { o: { solvent: 'cyclohexane', solute: 'X', w2: 1.0, Tbath: -10 }, method: 'ext', refine: { dTgoal: 8 } }, 'colligative-properties-h9', 200, 0.9);
{
  let hit = 0; rs = 17;
  for (let k = 0; k < 100; k++) { unknownTrial(rng, { o: { solvent: 'water', solute: 'X', w2: 4.0, Tbath: -10 }, method: 'ext', refine: { dTgoal: 2 } }); if (P.events.includes('colligative-properties-h9')) hit++; }
  console.log('  ' + (hit ? '✗' : '✓') + ' 對照：同樣的兩步做法改用水 100 次，完成 h9 的有 ' + hit + ' 次（h9 只認環己烷）');
  if (hit) bad++;
}
const ex10 = trials('h10：冰醋酸 50 g、X 7.50 g、沸點、沸石、回流、直接讀', { o: { mode: 'b', solvent: 'acetic', solute: 'X', w2: 7.5 }, method: 'raw' }, 'colligative-properties-h10', 200, 0.9);
if (ex9.size || ex10.size) bad++;
// h9 的做法不會是沸點；h10 不是環己烷：兩者互斥（看 via）

// ---------- 總結 ----------
const missing = missions.filter(m => !done[m.id]).map(m => m.id);
console.log(missing.length ? '  ✗ 沒有證明到的任務：' + missing.join('、') : '  ✓ ' + missions.length + ' 個任務都證明做得到');
if (missing.length) bad++;
console.log('    （公開 ' + missions.filter(m => !m.hidden).reduce((a, m) => a + m.level, 0) + ' 顆星、隱藏 ' + missions.filter(m => m.hidden).reduce((a, m) => a + m.level * 2, 0) + ' 顆星）');
if (bad) { console.log('失敗 ' + bad + ' 項'); process.exitCode = 1; }
