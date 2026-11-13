/* 任務可達成的證明腳本。用法：node tools/mission-proofs/redox-titration.js
 * 用化學核心（js/redox-titration-core.js 的 createSession／newRun／release／land／tick／settle／endpoint／answer，頁面用的是同一套）
 * 模擬頁面的操作：「一滴」「半滴」「打開活栓」（依流速一滴一滴落下，時間照走）、「快轉等待」（時間 ×20）、「記錄終點」「核對答案」。
 * 確認每個任務都做得到、預設狀態不觸發任務、隱藏任務照各自的做法不會順便完成別的隱藏任務。修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(__ROOT + 'js/redox-titration-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/redox-titration.js');

const U = K.UNITS_PER_ML;
let bad = 0;
const done = {};
const DEF = { sys: 'fe', Ca: 0.1, Va: 25, Vacid: 10, Cb: 0.02, T: 25, mass: 0.1576 };

// ---------- 模擬頁面 ----------
function newPage(seed) {
  let s = seed || 7;
  const rng = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const P = { S: K.createSession(rng), o: Object.assign({}, DEF), meter: true, events: [], wall: 0 };
  K.newRun(P.S, Object.assign({ meter: P.meter }, P.o), false);
  return P;
}
function fresh() { missions.forEach(m => { m.done = false; }); }
function emit(P, type, data) {
  const ev = { type, data };
  missions.forEach(m => { if (!m.done && m.check(ev)) { m.done = true; P.events.push(m.id); } });
}
/** 改設定（等於換一瓶） */
function set(P, o) { Object.assign(P.o, o); K.newRun(P.S, Object.assign({ meter: P.meter }, P.o)); }
function newFlask(P) { K.newRun(P.S, Object.assign({ meter: P.meter }, P.o)); }
function meter(P, on) { P.meter = on; }
function fades(P, list) { list.forEach(e => emit(P, 'fade', K.fadeData(P.S, e, P.meter))); }
/** 時間前進 sec 秒（真實時間；ff = 快轉 ×20） */
function wait(P, sec, ff) {
  const n = Math.round(sec * 60), sp = ff ? 20 : 1;
  for (let i = 0; i < n; i++) { fades(P, K.tick(P.S, sp / 60)); P.wall += 1 / 60; }
}
/** 按「一滴」（n = 2）或「半滴」（n = 1）：液滴長大、落下約 0.25 s，落下後就停下來 */
function drop(P, n) {
  if (!K.release(P.S, n, P.meter)) return false;
  wait(P, 0.25);
  fades(P, K.land(P.S, n, P.meter));
  emit(P, 'settle', K.settle(P.S, P.meter));
  return true;
}
/** 打開活栓，流速 rate mL/s，流出 mL 後關上（每 0.05 mL 一滴，時間照走） */
function tap(P, mL, rate) {
  const k = Math.round(mL * U / 2), dt = 0.05 / (rate || 1);
  for (let i = 0; i < k; i++) {
    if (!K.release(P.S, 2, P.meter)) break;
    fades(P, K.land(P.S, 2, P.meter));
    const n = Math.max(1, Math.round(dt * 60));
    for (let j = 0; j < n; j++) { fades(P, K.tick(P.S, 1 / 60)); P.wall += 1 / 60; }
  }
  emit(P, 'settle', K.settle(P.S, P.meter));
}
/** 加到滴定管流出的總量 = V mL（先開活栓到 V − 0.5，再一滴一滴、最後半滴） */
function to(P, V, rate) {
  const r = P.S.run, need = Math.round(V * U) - r.out;
  if (need <= 0) return;
  const fast = Math.max(0, need - 20);
  if (fast >= 2) tap(P, Math.floor(fast / 2) * 2 / U, rate);
  while (P.S.run.out + 2 <= Math.round(V * U)) drop(P, 2);
  if (P.S.run.out < Math.round(V * U)) drop(P, 1);
}
/** 半滴半滴地加，每加一次就等粉紅色消失（最多等 hold 秒），直到整瓶的粉紅色維持 hold 秒：學生找終點的做法 */
function findEnd(P, hold, ff) {
  for (let g = 0; g < 4000; g++) {
    if (!drop(P, 1)) return null;
    let t = 0;
    while (K.pink(P.S.run.f) && t < hold) { wait(P, 0.5, ff); t += ff ? 10 : 0.5; }
    if (K.pink(P.S.run.f)) return P.S.run.out / U;
  }
  return null;
}
function endpoint(P) { const d = K.endpoint(P.S, P.meter); emit(P, 'endpoint', d); return d; }
function answer(P, cMn, cFe) { const d = K.answer(P.S, cMn, cFe); emit(P, 'answer', d); return d; }
function report(name, P, ids, not) {
  const ok = ids.every(id => P.events.includes(id)) && !(not || []).some(id => P.events.includes(id));
  ids.forEach(id => { if (P.events.includes(id)) done[id] = true; });
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + name + '：' + (P.events.length ? P.events.join('、') : '（沒有任務）'));
  if (!ok) bad++;
}
function noHidden(name, P, allow) {
  const h = P.events.filter(id => /-h\d+$/.test(id) && !(allow || []).includes(id));
  if (h.length) { console.log('  ✗ ' + name + '順便完成了隱藏任務：' + h.join('、')); bad++; }
}
const f2 = x => x.toFixed(2), f3 = x => x.toFixed(3), f4 = x => x.toFixed(4), pc = x => (x * 100).toFixed(2) + '%';

// ---------- 0. 預設狀態不觸發任務 ----------
fresh();
let P = newPage();
wait(P, 30);
['ox', 'std', 'mx', 'fe'].forEach(sys => { set(P, { sys }); wait(P, 10, true); });
if (P.events.length) { console.log('  ✗ 預設狀態觸發了任務：' + P.events.join('、')); bad++; }
else console.log('  ✓ 四種組合的預設設定只放著、不加 KMnO4（含快轉），不觸發任務');

// ---------- 1. Fe2+：自身指示劑、半當量點、當量點電位 ----------
fresh();
P = newPage();
to(P, 12.5);
const eHalf = P.S.run.E;
to(P, 15);
to(P, 25);
const eEq = P.S.run.E, eTheo = P.S.run.Eeq;
drop(P, 1);
const ep = endpoint(P);
report('預設 0.100 M Fe2+ 25.00 mL ← 0.0200 M KMnO4：12.50 mL 時 E = ' + f4(eHalf) + ' V、15.00 mL 讀數、25.00 mL 時 E = ' + f4(eEq) + ' V（加權平均 ' + f4(eTheo) +
  ' V），多半滴變粉紅，終點 ' + f3(ep.Vend) + ' mL（誤差 +' + f3(ep.err) + '）', P, ['redox-titration-1', 'redox-titration-2', 'redox-titration-3', 'redox-titration-4', 'redox-titration-6']);
noHidden('預設的 Fe2+ 滴定', P);

// 不看電位、只看顏色；再等 30 秒
fresh();
P = newPage(); meter(P, false); newFlask(P);
to(P, 24); const vEnd = findEnd(P, 0);
wait(P, 2, true);
const e4 = endpoint(P);
report('拿出鉑電極、一滴一滴加到粉紅（' + f3(vEnd) + ' mL），快轉等 40 秒（粉紅色已持續 ' + e4.held.toFixed(0) + ' s）再記錄：誤差 +' + f3(e4.err) + ' mL', P, ['redox-titration-9', 'redox-titration-h4']);
noHidden('不看電位的終點', P, ['redox-titration-h4']);

// 自己設計當量點 20.00 mL
fresh();
P = newPage();
set(P, { Ca: 0.08 });
to(P, 19.5); findEnd(P, 0);
const e5 = endpoint(P);
report('Fe2+ 0.0800 M 25.00 mL、KMnO4 0.0200 M：Veq = ' + f2(e5.Veq) + ' mL，終點誤差 +' + f3(e5.err), P, ['redox-titration-5']);
noHidden('設計當量點', P);

// ---------- 2. 草酸：加熱、自催化 ----------
fresh();
P = newPage();
set(P, { sys: 'ox', Ca: 0.05, T: 70 });
drop(P, 2);
let t0 = P.wall; wait(P, 60); const firstDur = P.S.run.firstDur;
drop(P, 2); wait(P, 30);
tap(P, 4, 0.5); wait(P, 5);
drop(P, 2); wait(P, 5);
to(P, 24.4, 0.5); wait(P, 5);
const vOx = findEnd(P, 5);
const e7 = endpoint(P);
report('草酸 0.0500 M 25.00 mL、70 °C：第一滴 ' + firstDur.toFixed(1) + ' s 才褪色，加到 5 mL 後一滴 < 2 s；終點 ' + f3(vOx) + ' mL（誤差 +' + f3(e7.err) + '）', P, ['redox-titration-7', 'redox-titration-8']);
noHidden('加熱的草酸滴定', P);

// ---------- 3. 標定與未知 Fe2+（每組只用一瓶標定、一瓶未知 Fe2+） ----------
// 標定：0.1576 g 草酸晶體（1.250 mmol）、水 25 mL、硫酸 10 mL、70 °C。KMnO4 約 0.015–0.025 M（頁面有寫），當量點在 20.0–33.3 mL：
//   先一滴、等它褪色（約 25 s），再開活栓到 19.50 mL，之後半滴半滴，粉紅色維持 5 秒就是終點。
// 未知 Fe2+：25.00 mL、室溫、鉑電極在瓶中。先開活栓到 5.00 mL，由電位推出當量點 Veq ≈ V(1 + 10^((0.771 − E)/0.05916))，
//   開活栓到估計值前 0.5 mL，再半滴半滴到粉紅色。
let ok10 = 0, ok11 = 0, ok12 = 0, worstMn = 0, worstFe = 0, maxFl = 0;
const N = 200;
for (let k = 0; k < N; k++) {
  fresh();
  P = newPage(1000 + k * 7919);
  set(P, { sys: 'std', mass: 0.1576, T: 70 });
  drop(P, 2); wait(P, 40);
  to(P, 19.5, 0.5); wait(P, 2);
  const V1 = findEnd(P, 5);
  set(P, { sys: 'mx', T: 25 });
  to(P, 5, 1);
  const est = 5 * (1 + Math.pow(10, (K.E_FE - P.S.run.E) / K.S));
  to(P, Math.floor((est - 0.5) * 20) / 20, 1);
  const V2 = findEnd(P, 0);
  const c1 = +K.cbFromStd(0.1576, V1).toPrecision(4), c2 = +K.cFeFrom(c1, V2, 25).toPrecision(4);
  const a = answer(P, c1, c2);
  maxFl = Math.max(maxFl, a.flasksStd, a.flasksMx);
  worstMn = Math.max(worstMn, Math.abs(a.errMn)); worstFe = Math.max(worstFe, Math.abs(a.errFe));
  if (P.events.includes('redox-titration-10')) ok10++;
  if (P.events.includes('redox-titration-11')) ok11++;
  if (P.events.includes('redox-titration-12')) ok12++;
  if (P.events.some(id => /-h\d+$/.test(id)) && bad++ < 3) { console.log('  ✗ 未知樣品 ' + k + ' 順便完成了隱藏任務：' + P.events.join('、')); }
}
console.log('  ' + (ok10 === N && ok11 === N && ok12 === N ? '✓' : '✗') + ' 未知樣品 ' + N + ' 組（每種一瓶，最多用了 ' + maxFl + ' 瓶）：標定 0.5% 內 ' + ok10 + ' 組、Fe2+ 1% 內 ' + ok11 + ' 組、兩個都 0.3% 內 ' + ok12 +
  ' 組（最差 KMnO4 ' + pc(worstMn) + '、Fe2+ ' + pc(worstFe) + '）');
if (ok10 === N) done['redox-titration-10'] = true; else bad++;
if (ok11 === N) done['redox-titration-11'] = true; else bad++;
if (ok12 === N) done['redox-titration-12'] = true; else bad++;
// 揭曉後不算
fresh();
P = newPage(3); P.S.sample.revealed = true;
answer(P, P.S.sample.Cb, P.S.sample.CFe);
if (P.events.length) { console.log('  ✗ 揭曉答案後不該完成任務'); bad++; } else console.log('  ✓ 揭曉答案後填正確答案不算任務');

// ---------- 4. 隱藏任務 ----------
// h1：草酸不加硫酸（加熱）→ MnO2
fresh();
P = newPage();
set(P, { sys: 'ox', Vacid: 0, T: 70 });
drop(P, 2); wait(P, 30); tap(P, 3, 0.5); wait(P, 20);
report('草酸、不加硫酸、70 °C：MnO2 ' + pc(P.S.run.f.nMnO2 / (P.S.run.f.nMnO2 + P.S.run.f.nMn2)) + '，[H+] = ' + f3(K.hFree(P.S.run.f)) + ' M', P, ['redox-titration-h1']);
noHidden('h1 的做法', P, ['redox-titration-h1']);

// h2：草酸不加熱，第一滴的粉紅色不褪就記錄終點
fresh();
P = newPage();
set(P, { sys: 'ox', T: 25 });
drop(P, 2); wait(P, 2, true);
const e2 = endpoint(P);
report('草酸 25 °C：第一滴的粉紅色 40 秒（快轉）都不褪，就記錄終點 ' + f3(e2.Vend) + ' mL', P, ['redox-titration-h2']);
noHidden('h2 的做法', P, ['redox-titration-h2']);

// h3：草酸加熱到 95 °C，慢慢滴（約 4 分鐘）
fresh();
P = newPage();
set(P, { sys: 'ox', T: 95 });
drop(P, 2); wait(P, 20);
to(P, 20, 0.2); wait(P, 3);
const v3 = findEnd(P, 5);
const e3 = endpoint(P);
report('草酸 95 °C、慢慢滴（模擬時間 ' + P.S.run.f.t.toFixed(0) + ' s，分解 ' + pc(P.S.run.f.dec / P.S.run.p.nA) + '）：終點 ' + f3(v3) + ' mL（誤差 ' + f3(e3.err) + '）', P, ['redox-titration-h3']);
noHidden('h3 的做法', P, ['redox-titration-h3']);

// h5：兩瓶草酸的第一滴，65 °C 與 25 °C（快轉）
fresh();
P = newPage();
set(P, { sys: 'ox', T: 65 });
drop(P, 2); wait(P, 50);
set(P, { sys: 'ox', T: 25 });
drop(P, 2); wait(P, 40, true);
const fs = P.S.firsts.map(x => x.T + ' °C ' + x.dur.toFixed(0) + ' s').join('、');
report('草酸第一滴：' + fs, P, ['redox-titration-h5']);
noHidden('h5 的做法', P, ['redox-titration-h5']);

// h6：草酸 65 °C，一開始就開活栓放 3 mL
fresh();
P = newPage();
set(P, { sys: 'ox', T: 65 });
tap(P, 3, 2); wait(P, 30);
report('草酸 65 °C、一開始就以 2 mL/s 放 3 mL：紫色最濃 ' + (P.S.run.f.fades[0] ? P.S.run.f.fades[0].peak.toExponential(2) : '?') + ' M，' + (P.S.run.f.fades[0] ? P.S.run.f.fades[0].dur.toFixed(1) : '?') + ' s 後一下子褪掉', P, ['redox-titration-h6']);
noHidden('h6 的做法', P, ['redox-titration-h6']);

// h7：濃度都稀釋十倍的兩條曲線
fresh();
P = newPage();
to(P, 40, 2);
set(P, { Ca: 0.01, Cb: 0.002 });
to(P, 40, 2);
report('Fe2+ 0.100／KMnO4 0.0200 與 0.0100／0.00200 都加到 40 mL：兩條曲線重疊', P, ['redox-titration-h7', 'redox-titration-1']);
noHidden('h7 的做法', P, ['redox-titration-h7']);

// h8：Fe2+ 不加硫酸
fresh();
P = newPage();
set(P, { Vacid: 0 });
to(P, 40, 1);
const v8 = findEnd(P, 0);
const e8 = endpoint(P);
report('Fe2+ 不加硫酸：MnO2 ' + pc(e8.fMnO2) + '，到 ' + f3(v8) + ' mL 才有過量 MnO4-（理論 Veq 的 ' + (v8 / e8.Veq).toFixed(3) + ' 倍）', P, ['redox-titration-h8']);
noHidden('h8 的做法', P, ['redox-titration-h8']);

// h9：同一瓶停在半當量點、再停在兩倍當量點（Veq = 20 mL，不必補充）
fresh();
P = newPage();
set(P, { Ca: 0.08 });
to(P, 10); to(P, 40);
report('Fe2+ 0.0800 M：同一瓶 10.00 mL（E = 0.771）再到 40.00 mL（E = ' + f4(P.S.run.E) + '）', P, ['redox-titration-h9']);
noHidden('h9 的做法', P, ['redox-titration-h9']);

// h10：兩瓶都停在兩倍當量點，硫酸 3 mL 與 20 mL
fresh();
P = newPage();
set(P, { Ca: 0.08, Vacid: 3 }); to(P, 40); const Ea = P.S.run.E;
set(P, { Ca: 0.08, Vacid: 20 }); to(P, 40); const Eb = P.S.run.E;
report('Fe2+ 0.0800 M 到 40.00 mL：硫酸 3 mL 時 E = ' + f4(Ea) + ' V、20 mL 時 ' + f4(Eb) + ' V（差 ' + f3(Eb - Ea) + '）', P, ['redox-titration-h10']);
noHidden('h10 的做法', P, ['redox-titration-h10']);

// ---------- 5. 反例 ----------
fresh();
P = newPage();
set(P, { sys: 'ox', T: 65 });
drop(P, 2); wait(P, 2);
endpoint(P);
if (P.events.includes('redox-titration-h2')) { console.log('  ✗ 加熱時第一滴就記錄終點不該完成 h2'); bad++; } else console.log('  ✓ 65 °C 時第一滴就記錄終點（' + (P.events.join('、') || '沒有任務') + '）不算 h2');
fresh();
P = newPage();
set(P, { sys: 'ox', T: 80 });
drop(P, 2); wait(P, 20); to(P, 24.4, 0.5); wait(P, 3); findEnd(P, 5); endpoint(P);
if (P.events.includes('redox-titration-h3')) { console.log('  ✗ 80 °C 不該完成 h3'); bad++; } else console.log('  ✓ 80 °C 正常滴定（' + (P.events.join('、') || '沒有任務') + '）不算 h3');
fresh();
P = newPage();
to(P, 50, 2);
if (P.events.some(id => /-h\d+$/.test(id))) { console.log('  ✗ 預設一路流空滴定管不該完成隱藏任務：' + P.events.join('、')); bad++; } else console.log('  ✓ 預設一路流空 50 mL（' + (P.events.join('、') || '沒有任務') + '）不完成隱藏任務');

// ---------- 總結 ----------
const missing = missions.filter(m => !done[m.id]).map(m => m.id);
console.log(missing.length ? '  ✗ 沒有證明到的任務：' + missing.join('、') : '  ✓ ' + missions.length + ' 個任務都證明做得到');
if (missing.length) bad++;
const lv = missions.filter(m => m.hidden).map(m => m.level);
if (lv.length !== 10 || lv.filter(x => x >= 7).length < 3 || Math.min.apply(null, lv) < 3) { console.log('  ✗ 隱藏任務的數量或等級不合規定'); bad++; }
console.log('    （公開 ' + missions.filter(m => !m.hidden).reduce((a, m) => a + m.level, 0) + ' 顆星、隱藏 ' + missions.filter(m => m.hidden).reduce((a, m) => a + m.level * 2, 0) + ' 顆星）');
if (bad) { console.log('失敗 ' + bad + ' 項'); process.exitCode = 1; }
