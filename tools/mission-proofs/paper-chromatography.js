/* 任務可達成的證明腳本。用法：node tools/mission-proofs/paper-chromatography.js
 * 用化學核心模擬頁面（js/paper-chromatography.js）的操作與事件：每一幀 1/60 秒、依時間倍率（×10、×60、×300）前進，
 * 展開中每 0.5 秒送一次 'tick'；「取出濾紙」送 'take'（與頁面的 takeData 相同）；「標記溶劑前緣」記下當時的前緣；
 * 點斑點量測送 'measure'（爬到附近的濃度極大值、尺讀到 0.05 cm，與頁面的 measure 相同）；未知樣品送 'identify'。
 * 確認每個任務都做得到、預設狀態不觸發、隱藏任務彼此不會順便完成，並量出照建議做法要花多少真實時間。
 * 修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const P = require(__ROOT + 'js/paper-chromatography-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/paper-chromatography.js');

const SPEEDS = [10, 60, 300];
let bad = 0;
const done = {};
const hidden = id => /-h\d+$/.test(id);
function fresh() { missions.forEach(m => { m.done = false; }); }

// ---------- 模擬頁面 ----------
const DEF = { lanes: ['ink', 'green', 'brown'], spot: 3, z0: 1.5, zL: 0.8, pen: false, solvent: 'mix', phi: 0, lid: true, X: ['B1', 'Y5'] };
function newPage() { return { acted: false, events: [], meas: [], paper: 0, wall: 0, speed: 1, xs: { tries: 0, revealed: false, ran: false }, X: DEF.X.slice(), o: Object.assign({}, DEF) }; }
function emit(Pg, type, data) {
  if (!Pg.acted) return;
  const ev = { type, data };
  missions.forEach(m => { if (!m.done && m.check(ev)) { m.done = true; Pg.events.push(m.id); } });
}
function set(Pg, o) { Pg.acted = true; Object.assign(Pg.o, o); }
function start(Pg) {
  Pg.acted = true;
  Pg.paper++;
  Pg.run = P.createRun(Object.assign({}, Pg.o, { X: Pg.X.slice() }));
  Pg.snap = P.snapshot(Pg.run); Pg.front = null; Pg.out = false; Pg.dry = 0;
}
function tickData(Pg) {
  const run = Pg.run, s = Pg.snap;
  const penMove = s.pen ? Math.max(0, s.pen.z - run.o.z0) : 0;
  return { t: run.t, s: s.s, sInf: run.o.lid ? null : P.sInf(run.sv), top: P.topS(run), dF: s.dF, ranOff: s.ranOff, submerged: s.submerged, frac: s.frac,
    anySample: run.o.lanes.some(k => k !== 'none' && P.sampleComps(k, run.o.X).length > 0),
    lid: run.o.lid, lidOpenAll: run.lidOpenAll, lidClosedAll: run.lidClosedAll, solvent: run.o.solvent, phi: run.o.phi, pen: run.o.pen, penMove };
}
/** 跑 sec 秒真實時間（或 until 成立就停）；lid 可在中途改 */
function wait(Pg, sec, until) {
  const frames = Math.round(sec * 60);
  for (let k = 0; k < frames; k++) {
    P.step(Pg.run, SPEEDS[Pg.speed] / 60, Pg.o.lid);
    Pg.snap = P.snapshot(Pg.run);
    Pg.wall += 1 / 60;
    if (k % 30 === 29) emit(Pg, 'tick', tickData(Pg));
    if (until && until(Pg)) { emit(Pg, 'tick', tickData(Pg)); return; }
  }
}
const toDF = (Pg, dF) => wait(Pg, 3600 * 3, Q => Q.snap.dF >= dF);
const toT = (Pg, t) => wait(Pg, 3600 * 3, Q => Q.run.t >= t);
function take(Pg) {
  const run = Pg.run, s = Pg.snap, ref = P.snapshot(run, 0.05);
  Pg.out = true; Pg.dry = 5;
  if (run.o.lanes.indexOf('X') >= 0 && s.dF >= 3 && !s.submerged) Pg.xs.ran = true;
  const d = {
    paper: Pg.paper, t: run.t, dF: s.dF, ranOff: s.ranOff, submerged: s.submerged, lidOpenAll: run.lidOpenAll, lidClosedAll: run.lidClosedAll,
    solvent: run.o.solvent, phi: run.o.phi, spot: run.o.spot, z0: run.o.z0, zL: run.o.zL, pen: run.o.pen, penMove: s.pen ? Math.max(0, s.pen.z - run.o.z0) : 0,
    lanes: s.lanes.map((L, i) => {
      const pr = P.pairs(s, i), pr2 = P.pairs(ref, i);
      return { key: L.key, n: pr.n, nAll: pr.nAll, peaks: P.peaks(s, i).length, minRs: pr.minRs, minRsRef: pr2.minRs,
        comps: L.spots.map(sp => ({ id: sp.id, rf: sp.rf, rfW: P.rf(sp.id, 'mix', 0), rfE: P.rf(sp.id, 'mix', 1), d: sp.d, vis: sp.od >= P.VIS })) };
    })
  };
  emit(Pg, 'take', d);
  return d;
}
function mark(Pg) { if (Pg.out && Pg.dry > 0) Pg.front = Pg.snap.zF; }
function measure(Pg, lane, z) {
  const run = Pg.run, s = Pg.snap;
  const m = P.measureAt(s, lane, z);
  if (!m) return null;
  if (Pg.meas.some(q => q.paper === Pg.paper && q.lane === lane && Math.abs(q.z - m.z) < 0.06)) return null;
  const sp = m.dom === 'pen' ? s.pen : s.lanes[lane].spots.find(q => q.id === m.dom);
  const rec = { paper: Pg.paper, lane, key: s.lanes[lane].key, z: m.z, d: P.roundRuler(m.z - run.o.z0), dom: m.dom, purity: m.purity, rfTrue: sp ? sp.rf : null,
    od: m.od, ranOff: s.ranOff, submerged: s.submerged, lidClosedAll: run.lidClosedAll, solvent: run.o.solvent, phi: run.o.phi,
    lidOpenAll: run.lidOpenAll, stalled: run.lidOpenAll && P.sInf(run.sv) < P.topS(run) - 0.3 && s.s >= 0.98 * P.sInf(run.sv) };
  rec.dF = Pg.front != null ? P.roundRuler(Pg.front - run.o.z0) : null;
  rec.Rf = rec.dF != null && rec.dF > 0 ? rec.d / rec.dF : null;
  rec.valid = rec.Rf != null && !s.ranOff && !s.submerged;
  Pg.meas.push(rec);
  emit(Pg, 'measure', Object.assign({}, rec, { hist: Pg.meas.filter(q => q !== rec).map(q => Object.assign({}, q)) }));
  return rec;
}
/** 量某道所有看得出的斑點 */
function measureAll(Pg, lanes) {
  const out = [];
  (lanes || [0, 1, 2]).forEach(i => P.peaks(Pg.snap, i).forEach(pk => { const r = measure(Pg, i, pk.z); if (r) out.push(r); }));
  return out;
}
/** 量某道中某成分的斑點 */
function measureComp(Pg, lane, id) {
  const sp = Pg.snap.lanes[lane].spots.find(q => q.id === id);
  return measure(Pg, lane, sp.z);
}
function identify(Pg, pick) {
  Pg.acted = true; Pg.xs.tries++;
  const ok = pick.slice().sort().join() === Pg.X.slice().sort().join();
  emit(Pg, 'identify', { ok, revealed: Pg.xs.revealed, tries: Pg.xs.tries, ran: Pg.xs.ran });
  return ok;
}
function report(name, Pg, ids, extraOk) {
  const ok = ids.every(id => Pg.events.includes(id));
  const extraH = Pg.events.filter(id => hidden(id) && !ids.includes(id));
  ids.forEach(id => { if (Pg.events.includes(id)) done[id] = true; });
  const pass = ok && !extraH.length && (extraOk == null || extraOk);
  console.log('  ' + (pass ? '✓' : '✗') + ' ' + name + '：' + (Pg.events.length ? Pg.events.join('、') : '（沒有任務）') +
    (extraH.length ? '　← 順便完成了 ' + extraH.join('、') : '') + '（真實時間 ' + Pg.wall.toFixed(0) + ' 秒）');
  if (!pass) bad++;
}
const f2 = x => x == null ? '—' : x.toFixed(2), f3 = x => x == null ? '—' : x.toFixed(3);

// ======================= 預設狀態 =======================
console.log('=== 預設狀態 ===');
fresh();
{
  const Pg = newPage();
  // 只載入頁面、不操作：沒有任何事件（頁面不會自動開始展開）
  if (Pg.events.length) { bad++; console.log('  ✗ 預設狀態觸發了任務'); } else console.log('  ✓ 載入頁面、不操作：不送事件，不觸發任何任務');
  // 預設設定直接展開到前緣 8 cm、取出、標記、量所有斑點：不觸發任何隱藏任務
  start(Pg); toDF(Pg, 8); take(Pg); mark(Pg); measureAll(Pg);
  const h = Pg.events.filter(hidden);
  console.log('  ' + (h.length ? '✗' : '✓') + ' 預設設定（黑色水性筆、綠色、咖啡色、水）展開 8 cm 後量全部斑點：' + (Pg.events.join('、') || '沒有任務') + (h.length ? '　← 隱藏任務 ' + h.join('、') : '，沒有隱藏任務'));
  if (h.length) bad++;
}

// ======================= 公開任務 =======================
console.log('=== 公開任務 ===');
fresh();
let Pg = newPage();
start(Pg); toDF(Pg, 8); let d = take(Pg);
report('預設設定、水、展開到前緣 8 cm 取出：黑色水性筆 ' + d.lanes[0].peaks + ' 個斑點', Pg, ['paper-chromatography-1']);
mark(Pg); let r = measureAll(Pg, [0]);
report('標記前緣、量黑色水性筆的斑點：Rf ' + r.map(q => f3(q.Rf)).join('、'), Pg, ['paper-chromatography-1', 'paper-chromatography-2']);

fresh(); Pg = newPage();
set(Pg, { z0: 0.6, zL: 1.0 }); start(Pg); wait(Pg, 10, Q => Q.snap.frac <= 0.2);
report('起始線 0.6 cm、液面 1.0 cm：樣品溶進展開液（剩 ' + (100 * Pg.snap.frac).toFixed(0) + '%）', Pg, ['paper-chromatography-3']);

fresh(); Pg = newPage();
Pg.speed = 2; start(Pg); wait(Pg, 600, Q => Q.snap.ranOff);
report('水，×300 一直展開：' + (Pg.run.tRanOff / 60).toFixed(1) + ' 分鐘時前緣到達濾紙上緣', Pg, ['paper-chromatography-4']);

// 任務 5：找出點樣 10 mm 會糊、2 mm 不會的展開
{
  let found = null;
  for (const smp of ['candy', 'brown', 'ink', 'green']) for (const solv of ['salt', 'mix']) for (const dF of [2, 3, 4, 5, 6]) {
    if (found) break;
    const run = P.createRun(Object.assign({}, DEF, { lanes: [smp, 'none', 'none'], solvent: solv, spot: 10, X: [] }));
    while (P.snapshot(run).dF < dF) P.step(run, 1, true);
    const a = P.pairs(P.snapshot(run), 0), b = P.pairs(P.snapshot(run, 0.05), 0);
    if (a.minRs != null && a.minRs < 0.8 && b.minRs >= 1.2) found = { smp, solv, dF };
  }
  fresh(); Pg = newPage();
  set(Pg, { lanes: [found.smp, 'none', 'none'], solvent: found.solv, spot: 10 }); start(Pg); toDF(Pg, found.dF); d = take(Pg);
  report('點樣 10 mm、' + found.smp + '、' + found.solv + '、前緣 ' + found.dF + ' cm：Rs = ' + f2(d.lanes[0].minRs) + '（2 mm 時 ' + f2(d.lanes[0].minRsRef) + '）', Pg, ['paper-chromatography-5']);
}

fresh(); Pg = newPage();
set(Pg, { lanes: ['leaf', 'none', 'none'], solvent: 'pe' }); start(Pg); toDF(Pg, 10); d = take(Pg);
report('菠菜葉萃取液、石油醚＋丙酮、前緣 10 cm：' + d.lanes[0].n + ' 個成分，Rs = ' + f2(d.lanes[0].minRs), Pg, ['paper-chromatography-6']);

fresh(); Pg = newPage();
set(Pg, { lanes: ['B1', 'none', 'none'], solvent: 'salt' });
start(Pg); toDF(Pg, 5); take(Pg); mark(Pg); const m1 = measureComp(Pg, 0, 'B1');
start(Pg); toDF(Pg, 11); take(Pg); mark(Pg); const m2 = measureComp(Pg, 0, 'B1');
report('亮藍、食鹽水：前緣 ' + f2(m1.dF) + ' cm 時 Rf ' + f3(m1.Rf) + '，前緣 ' + f2(m2.dF) + ' cm 時 Rf ' + f3(m2.Rf), Pg, ['paper-chromatography-7']);

fresh(); Pg = newPage();
set(Pg, { lanes: ['Y5', 'none', 'none'], solvent: 'mix', phi: 0 });
start(Pg); toDF(Pg, 8); take(Pg); mark(Pg); const a1 = measureComp(Pg, 0, 'Y5');
set(Pg, { solvent: 'salt' }); start(Pg); toDF(Pg, 8); take(Pg); mark(Pg); const a2 = measureComp(Pg, 0, 'Y5');
report('檸檬黃：水中 Rf ' + f3(a1.Rf) + '、食鹽水中 Rf ' + f3(a2.Rf), Pg, ['paper-chromatography-8']);

fresh(); Pg = newPage();
set(Pg, { solvent: 'salt' }); start(Pg); toDF(Pg, 8); d = take(Pg);
report('預設三道、食鹽水、前緣 8 cm：咖啡色 ' + d.lanes[2].n + ' 個成分，Rs = ' + f2(d.lanes[2].minRs), Pg, ['paper-chromatography-1', 'paper-chromatography-9']);

// 任務 10：未知樣品 X（四種情形各試）
{
  let allOk = true, tries = 0;
  for (const seed of [1, 7, 42, 99, 1234, 2024, 31337, 8, 77, 1113]) {
    fresh(); Pg = newPage();
    Pg.X = P.makeUnknown(seed);
    set(Pg, { lanes: ['X', 'R40', 'Y6'], solvent: 'salt' }); start(Pg); toDF(Pg, 9); take(Pg); mark(Pg);
    const xr = measureAll(Pg, [0]);
    set(Pg, { lanes: ['X', 'Y5', 'B1'] }); start(Pg); toDF(Pg, 9); take(Pg); mark(Pg); measureAll(Pg, [0]);
    // 學生的判斷：X 的每個斑點和哪一個標準品的 Rf 相差 0.02 以內
    const std = {};
    Pg.meas.filter(q => q.lane > 0 && q.valid).forEach(q => { std[q.key] = q.Rf; });
    P.DYES.forEach(id => { if (std[id] == null) { const run = P.createRun(Object.assign({}, DEF, { lanes: [id, 'none', 'none'], solvent: 'salt' })); while (P.snapshot(run).dF < 9) P.step(run, 1, true); std[id] = P.rf(id, 'salt', 0); } });
    const pick = [];
    xr.forEach(q => { P.DYES.forEach(id => { if (Math.abs(std[id] - q.Rf) <= 0.02 && pick.indexOf(id) < 0) pick.push(id); }); });
    const ok = identify(Pg, pick);
    tries++;
    if (!ok || !Pg.events.includes('paper-chromatography-10')) allOk = false;
    Pg.events.forEach(id => { done[id] = true; });
  }
  console.log('  ' + (allOk ? '✓' : '✗') + ' 未知樣品 X：' + tries + ' 個不同的 X，都把 X 與標準品點在同一張濾紙、食鹽水展開 9 cm，用 Rf 比對後第一次就答對');
  if (!allOk) bad++;
  // 反例：沒展開就猜、第二次才對、揭曉後才答
  fresh(); Pg = newPage(); Pg.X = ['B1', 'Y5']; identify(Pg, ['B1', 'Y5']);
  const c1 = !Pg.events.includes('paper-chromatography-10');
  fresh(); Pg = newPage(); Pg.X = ['B1', 'Y5']; set(Pg, { lanes: ['X', 'none', 'none'], solvent: 'salt' }); start(Pg); toDF(Pg, 5); take(Pg); identify(Pg, ['B1']); identify(Pg, ['B1', 'Y5']);
  const c2 = !Pg.events.includes('paper-chromatography-10');
  console.log('  ' + (c1 && c2 ? '✓' : '✗') + ' 反例：沒有展開 X 就猜對、第二次核對才答對，都不算任務 10');
  if (!(c1 && c2)) bad++;
}

fresh(); Pg = newPage();
set(Pg, { lanes: ['R40', 'none', 'none'], solvent: 'salt', z0: 1.0, zL: 0.5, spot: 2 }); start(Pg); toDF(Pg, 12); take(Pg); mark(Pg);
r = measureComp(Pg, 0, 'R40');
report('誘惑紅、食鹽水、前緣 ' + f2(r.dF) + ' cm：量到 Rf ' + f3(r.Rf) + '（真值 ' + f3(r.rfTrue) + '）', Pg, ['paper-chromatography-2', 'paper-chromatography-11']);
// 反例：沒蓋蓋子、前緣停住後斑點繼續往上爬，量到的 Rf 偏大
fresh(); Pg = newPage();
set(Pg, { lanes: ['R40', 'none', 'none'], solvent: 'mix', phi: 0.3, z0: 1.0, zL: 0.5, spot: 2, lid: false }); Pg.speed = 2; start(Pg); toT(Pg, 3 * 3600); take(Pg); mark(Pg);
r = measureComp(Pg, 0, 'R40');
console.log('  （對照：水＋乙醇 30%、沒蓋蓋子展開 3 小時，前緣停在 ' + f2(r.dF) + ' cm，量到 Rf ' + f3(r.Rf) + '、真值 ' + f3(r.rfTrue) + '，' + (Pg.events.includes('paper-chromatography-11') ? '✗ 竟然算任務 11' : '✓ 偏大、不算任務 11') + '）');
if (Pg.events.includes('paper-chromatography-11') || !(r.Rf > r.rfTrue + 0.01)) bad++;

// 任務 12：黑色水性筆 4 種染料 Rs ≥ 2 的乙醇比例範圍
{
  const ok = [];
  for (let i = 0; i <= 100; i++) {
    const run = P.createRun(Object.assign({}, DEF, { lanes: ['ink', 'none', 'none'], solvent: 'mix', phi: i / 100, spot: 2, z0: 1.0, zL: 0.5 }));
    while (P.snapshot(run).dF < 13.5) P.step(run, 2, true);
    if (P.pairs(P.snapshot(run), 0).minRs >= 2) ok.push(i);
  }
  console.log('  （黑色水性筆、點 2 mm、前緣 13.5 cm 時 Rs ≥ 2 的乙醇百分比：' + (ok.length ? ok[0] + '–' + ok[ok.length - 1] + '%' : '沒有') + '；水、食鹽水、丙酮都不行）');
  fresh(); Pg = newPage();
  set(Pg, { lanes: ['ink', 'none', 'none'], solvent: 'mix', phi: 0.32, spot: 2, z0: 1.0, zL: 0.5 }); Pg.speed = 2; start(Pg); toDF(Pg, 13.5); d = take(Pg);
  report('黑色水性筆、乙醇 32%、點 2 mm、前緣 13.5 cm：Rs = ' + f2(d.lanes[0].minRs), Pg, ['paper-chromatography-1', 'paper-chromatography-12']);
  for (const solv of ['salt', 'ace']) {
    const run = P.createRun(Object.assign({}, DEF, { lanes: ['ink', 'none', 'none'], solvent: solv, spot: 1, z0: 0.5, zL: 0.2 }));
    while (P.snapshot(run).dF < 14.2) P.step(run, 2, true);
    const m = P.pairs(P.snapshot(run), 0).minRs;
    console.log('  ' + (m < 2 ? '✓' : '✗') + ' ' + solv + '：就算點 1 mm、展開 14.2 cm，最小 Rs 只有 ' + f2(m));
    if (m >= 2) bad++;
  }
}

// ======================= 隱藏任務 =======================
console.log('=== 隱藏任務 ===');
fresh(); Pg = newPage();
set(Pg, { lanes: ['leaf', 'none', 'none'] }); start(Pg); toDF(Pg, 10); take(Pg); mark(Pg); r = measureAll(Pg, [0])[0];
report('菠菜葉萃取液在水中：前緣 ' + f2(r.dF) + ' cm、斑點留在起始線，Rf ' + f3(r.Rf), Pg, ['paper-chromatography-2', 'paper-chromatography-h1']);

fresh(); Pg = newPage();
set(Pg, { lanes: ['leaf', 'none', 'none'], solvent: 'pe' }); start(Pg); toDF(Pg, 10); take(Pg); mark(Pg); r = measureComp(Pg, 0, 'car');
report('葉萃取液、石油醚＋丙酮：胡蘿蔔素 Rf ' + f3(r.Rf), Pg, ['paper-chromatography-2', 'paper-chromatography-6', 'paper-chromatography-h2']);
{ // 學生做任務 6 最自然的做法：A 道換成葉子、B、C 保留預設的綠色與咖啡色，量全部斑點（食用色素在石油醚中留在起始線，但這不是 h1）
  fresh(); const Q = newPage();
  set(Q, { lanes: ['leaf', 'green', 'brown'], solvent: 'pe' }); start(Q); toDF(Q, 10); take(Q); mark(Q); measureAll(Q);
  report('葉子＋預設綠色、咖啡色、石油醚＋丙酮、量全部斑點', Q, ['paper-chromatography-2', 'paper-chromatography-6', 'paper-chromatography-11', 'paper-chromatography-h2']);
}

fresh(); Pg = newPage();
set(Pg, { pen: true, lanes: ['none', 'none', 'none'], solvent: 'mix', phi: 1 }); Pg.speed = 2; start(Pg); toDF(Pg, 5); take(Pg); mark(Pg);
r = measure(Pg, 1, Pg.snap.pen.z);
report('起始線用原子筆、乙醇、前緣 5 cm：量到油墨跟著往上跑 ' + f2(r.d) + ' cm（Rf ' + f3(r.Rf) + '）', Pg, ['paper-chromatography-2', 'paper-chromatography-h3']);
{ // 反例：原子筆在水中不動
  fresh(); const Q = newPage(); set(Q, { pen: true }); start(Q); toDF(Q, 12); take(Q); mark(Q); measure(Q, 1, Q.snap.pen.z); measureAll(Q);
  console.log('  ' + (Q.events.includes('paper-chromatography-h3') ? '✗' : '✓') + ' 對照：原子筆起始線在水中展開 12 cm，油墨只移動 ' + f2(Q.snap.pen.z - Q.o.z0) + ' cm，量了也不算');
  if (Q.events.includes('paper-chromatography-h3')) bad++;
}

fresh(); Pg = newPage();
set(Pg, { lanes: ['Y5', 'R40', 'none'], solvent: 'mix', phi: 0 }); start(Pg); toDF(Pg, 8); take(Pg); mark(Pg);
const yW = measureComp(Pg, 0, 'Y5'), rW = measureComp(Pg, 1, 'R40');
set(Pg, { solvent: 'mix', phi: 1 }); Pg.speed = 2; start(Pg); toDF(Pg, 8); take(Pg); mark(Pg);
const yE = measureComp(Pg, 0, 'Y5'), rE = measureComp(Pg, 1, 'R40');
report('檸檬黃與誘惑紅分兩道：水中 黃 ' + f3(yW.Rf) + ' > 紅 ' + f3(rW.Rf) + '；乙醇中 黃 ' + f3(yE.Rf) + ' < 紅 ' + f3(rE.Rf), Pg, ['paper-chromatography-2', 'paper-chromatography-8', 'paper-chromatography-h4']);
{ // 反例：同一道黑色水性筆，乙醇中紫色與黃色擠在一起（純度不夠），不算
  fresh(); const Q = newPage();
  set(Q, { lanes: ['ink', 'none', 'none'] }); start(Q); toDF(Q, 8); take(Q); mark(Q); measureAll(Q, [0]);
  set(Q, { phi: 1 }); Q.speed = 2; start(Q); toDF(Q, 8); take(Q); mark(Q); measureAll(Q, [0]);
  console.log('  （對照：黑色水性筆在水與乙醇各量全部斑點：' + (Q.events.filter(hidden).join('、') || '沒有隱藏任務') + '；乙醇中紫色與黃色重疊，純度不到 0.9 的斑點不算）');
}

const phiS = P.phiSlowest();
fresh(); Pg = newPage();
set(Pg, { solvent: 'mix', phi: 0.56 }); Pg.speed = 2; start(Pg); toDF(Pg, 4); d = take(Pg);
report('水＋乙醇 56%（D 最小在 ' + (100 * phiS).toFixed(1) + '%，D = ' + P.solvent('mix', phiS).D.toFixed(4) + ' cm²/s，只有水的 ' + (100 * P.solvent('mix', phiS).D / P.solvent('mix', 0).D).toFixed(0) + '%）：前緣 4 cm 花了 ' + (Pg.run.t / 60).toFixed(0) + ' 分鐘', Pg, ['paper-chromatography-h5']);

fresh(); Pg = newPage();
set(Pg, { lanes: ['R40', 'none', 'none'], solvent: 'mix', phi: 0.3, spot: 2 }); Pg.speed = 2; start(Pg); toDF(Pg, 5); take(Pg); mark(Pg);
const sh = measureComp(Pg, 0, 'R40');
set(Pg, { lid: false }); start(Pg); wait(Pg, 600, Q => Q.snap.s >= 0.98 * P.sInf(Q.run.sv)); take(Pg); mark(Pg);
const op = measureComp(Pg, 0, 'R40');
report('誘惑紅、乙醇 30%：蓋著量 Rf ' + f3(sh.Rf) + '；不蓋、前緣停在 s∞ = ' + P.sInf(Pg.run.sv).toFixed(2) + ' cm 時量 Rf ' + f3(op.Rf), Pg, ['paper-chromatography-2', 'paper-chromatography-h6']);
{ // 反例：只有沒蓋的那張、或中途才打開蓋子，都不算
  fresh(); const Q = newPage(); set(Q, { lanes: ['R40', 'none', 'none'], solvent: 'mix', phi: 0.3, spot: 2, lid: false }); Q.speed = 2; start(Q); wait(Q, 600, R => R.snap.s >= 0.98 * P.sInf(R.run.sv)); take(Q); mark(Q); measureComp(Q, 0, 'R40');
  set(Q, { lid: true }); start(Q); toDF(Q, 1); Q.o.lid = false; wait(Q, 600, R => R.snap.s >= 0.99 * P.sInf(R.run.sv)); take(Q); mark(Q); measureComp(Q, 0, 'R40');
  const no = !Q.events.includes('paper-chromatography-h6');
  console.log('  ' + (no ? '✓' : '✗') + ' 對照：一張整段沒蓋、另一張展開途中才打開蓋子，沒有蓋著的對照，不算');
  if (!no) bad++;
}

// h7：找出 Rf 剛好 0.5 的乙醇比例（打字到 0.1%）
{
  let best = null;
  for (const id of ['R40', 'Y6', 'Y5']) for (let i = 0; i <= 1000; i++) {
    const R = P.rf(id, 'mix', i / 1000);
    if (!best || Math.abs(R - 0.5) < Math.abs(best.R - 0.5)) best = { id, phi: i / 1000, R };
  }
  fresh(); Pg = newPage();
  set(Pg, { lanes: [best.id, 'none', 'none'], solvent: 'mix', phi: best.phi, spot: 2, z0: 1.0, zL: 0.5 }); Pg.speed = 2; start(Pg); toDF(Pg, 12); take(Pg); mark(Pg);
  r = measureComp(Pg, 0, best.id);
  report(best.id + '、乙醇 ' + (100 * best.phi).toFixed(1) + '%（真 Rf ' + f3(best.R) + '，k = ' + P.kOf(best.R).toFixed(3) + '）、前緣 ' + f2(r.dF) + ' cm：量到 Rf ' + f3(r.Rf), Pg, ['paper-chromatography-2', 'paper-chromatography-11', 'paper-chromatography-h7']);
}

// h8：咖啡色的日落黃與誘惑紅在某個乙醇比例同時抵達
{
  let best = null;
  for (let i = 0; i <= 1000; i++) { const dd = Math.abs(P.rf('Y6', 'mix', i / 1000) - P.rf('R40', 'mix', i / 1000)); if (!best || dd < best.dd) best = { phi: i / 1000, dd }; }
  let lo = null, hi = null;
  for (let i = 0; i <= 1000; i++) { const dd = Math.abs(P.rf('Y6', 'mix', i / 1000) - P.rf('R40', 'mix', i / 1000)); if (dd <= 0.001) { if (lo == null) lo = i / 10; hi = i / 10; } }
  fresh(); Pg = newPage();
  set(Pg, { lanes: ['brown', 'none', 'none'], solvent: 'mix', phi: Math.round(best.phi * 100) / 100 }); Pg.speed = 2; start(Pg); toDF(Pg, 6); d = take(Pg);
  report('咖啡色、乙醇 ' + Math.round(best.phi * 100) + '%（交會在 ' + (100 * best.phi).toFixed(1) + '%，|ΔRf| ≤ 0.001 的範圍 ' + lo + '–' + hi + '%）：日落黃與誘惑紅重合', Pg, ['paper-chromatography-h8']);
  console.log('  （h5 的範圍 ' + (100 * (0.5585 - 0.012)).toFixed(1) + '–' + (100 * (0.5585 + 0.012)).toFixed(1) + '% 與 h8 的交會範圍不重疊：' + (hi < 100 * (0.5585 - 0.012) ? '✓' : '✗') + '）');
  if (!(hi < 100 * (0.5585 - 0.012))) bad++;
}

fresh(); Pg = newPage();
set(Pg, { lanes: ['candy', 'none', 'none'], solvent: 'salt', spot: 1, z0: 0.7, zL: 0.3 }); start(Pg); toDF(Pg, 14); d = take(Pg);
report('彩色糖衣、食鹽水、點 1 mm、前緣 14 cm：Rs = ' + f2(d.lanes[0].minRs), Pg, ['paper-chromatography-h9']);
{ // 反例：預設點 3 mm、起始線 1.5 cm，跑到快到頂也不夠
  const run = P.createRun(Object.assign({}, DEF, { lanes: ['candy', 'none', 'none'], solvent: 'salt' }));
  while (P.snapshot(run).dF < 13.4) P.step(run, 2, true);
  const m = P.pairs(P.snapshot(run), 0).minRs;
  console.log('  ' + (m < 1.5 ? '✓' : '✗') + ' 對照：點 3 mm、起始線 1.5 cm、液面 0.8 cm，前緣到 13.4 cm 時 Rs 只有 ' + f2(m));
  if (m >= 1.5) bad++;
}

{
  fresh(); Pg = newPage();
  set(Pg, { lanes: ['brown', 'none', 'none'], solvent: 'salt', spot: 1, z0: 0.5, zL: 0.4 }); Pg.speed = 0; start(Pg);
  wait(Pg, 30, Q => P.pairs(Q.snap, 0).minRs >= 1.05);
  d = take(Pg);
  report('咖啡色、食鹽水、點 1 mm、起始線 0.5 cm、液面 0.4 cm、×10：' + d.t.toFixed(0) + ' 秒時 Rs = ' + f2(d.lanes[0].minRs), Pg, ['paper-chromatography-9', 'paper-chromatography-h10']);
  // 反例：預設的點樣與起始線
  const run = P.createRun(Object.assign({}, DEF, { lanes: ['brown', 'none', 'none'], solvent: 'salt' }));
  while (P.pairs(P.snapshot(run), 0).minRs < 1) P.step(run, 1, true);
  console.log('  ' + (run.t > 90 ? '✓' : '✗') + ' 對照：預設點 3 mm、起始線 1.5 cm、液面 0.8 cm，要 ' + run.t.toFixed(0) + ' 秒才分開，超過 90 秒');
  if (run.t <= 90) bad++;
}

// ======================= 亂按 =======================
console.log('=== 亂按（隨機設定、隨機倍率與等候時間、隨機點濾紙量測） ===');
{
  let seed = 1113;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const keys = Object.keys(P.SAMPLES), solvs = ['mix', 'salt', 'ace', 'pe'];
  const hits = {}, N = 300;
  for (let t = 0; t < N; t++) {
    fresh(); const Q = newPage();
    for (let k = 0; k < 3; k++) {
      set(Q, { lanes: [0, 1, 2].map(() => rnd() < 0.5 ? DEF.lanes[Math.floor(rnd() * 3)] : keys[Math.floor(rnd() * keys.length)]), solvent: rnd() < 0.4 ? 'mix' : solvs[Math.floor(rnd() * 4)],
        phi: rnd() < 0.5 ? 0 : Math.round(rnd() * 100) / 100, spot: 1 + Math.round(rnd() * 18) / 2, z0: 0.5 + Math.round(rnd() * 35) / 10, zL: 0.2 + Math.round(rnd() * 28) / 10,
        lid: rnd() < 0.8, pen: rnd() < 0.15 });
      Q.speed = Math.floor(rnd() * 3); start(Q);
      wait(Q, 5 + rnd() * 55);
      if (rnd() < 0.7) { take(Q); if (rnd() < 0.6) mark(Q); for (let c = 0; c < 4; c++) measure(Q, Math.floor(rnd() * 3), Q.run.o.z0 - 0.3 + rnd() * (Q.snap.zF - Q.run.o.z0 + 0.6)); }
    }
    Q.events.filter(hidden).forEach(id => { hits[id] = (hits[id] || 0) + 1; });
  }
  const hk = Object.keys(hits).sort();
  console.log('  ' + (hk.length ? '△' : '✓') + ' 亂按 ' + N + ' 回（每回 3 張濾紙）意外完成的隱藏任務：' + (hk.length ? hk.map(k => k + ' ' + hits[k] + ' 次').join('、') : '沒有'));
  const tooEasy = hk.filter(k => hits[k] > N * 0.02);
  if (tooEasy.length) { bad++; console.log('  ✗ 太容易被亂按完成（超過 2%）：' + tooEasy.join('、')); }
}

// ======================= 總結 =======================
console.log('=== 總結 ===');
const missing = missions.filter(m => !done[m.id]).map(m => m.id);
const levels = missions.filter(m => m.hidden).map(m => m.level);
console.log('  公開任務 ' + missions.filter(m => !m.hidden).length + ' 個、隱藏任務 ' + levels.length + ' 個（等級 ' + levels.join('、') + '；7 級以上 ' + levels.filter(l => l >= 7).length + ' 個）');
if (levels.length !== 10 || levels.filter(l => l >= 7).length < 3 || Math.min.apply(null, levels) < 3) { bad++; console.log('  ✗ 隱藏任務的數量或等級不符規定'); }
if (missing.length) { bad++; console.log('  ✗ 沒有證明到：' + missing.join('、')); } else console.log('  ✓ 全部 ' + missions.length + ' 個任務都證明做得到');
if (bad) { console.log('有 ' + bad + ' 項沒通過'); process.exit(1); } else console.log('全部通過');
