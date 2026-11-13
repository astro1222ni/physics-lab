/* 任務可達成的證明腳本。用法：node tools/mission-proofs/acid-base-titration.js
 * 用化學核心模擬頁面（js/acid-base-titration.js）的操作與事件：一滴 = 2 個單位、半滴 = 1 個單位（0.025 mL），
 * 每次加入落進錐形瓶後回報 'settle'；按「記錄終點」回報 'endpoint'；未知弱酸「核對答案」回報 'answer'。
 * 確認每個任務都做得到、預設狀態不會觸發任務；未知弱酸的任務另做蒙地卡羅（很多個隨機樣品），看照建議做法的成功率。
 * 修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(__ROOT + 'js/acid-base-titration-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({ mem: {} }, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/acid-base-titration.js');

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------- 模擬頁面（狀態與事件內容和 js/acid-base-titration.js 一致） ----------
const U = K.UNITS_PER_ML;
function newPage(o) {
  const P = Object.assign({ sys: 'sa', Ca: 0.1, Va: 25, Vw: 0, Cb: 0.1, ind: 'php', meter: true, archive: [], run: null,
    sample: { C: 0.1, Ka: 1e-5, flasks: 0, revealed: false } }, o || {});
  newRun(P);
  return P;
}
function params(P) {
  const q = { sys: P.sys, Ca: P.sys === 'mx' ? P.sample.C : P.Ca, Va: P.Va, Vw: P.Vw, Cb: P.Cb };
  if (P.sys === 'mx') q.Ka = P.sample.Ka;
  return K.setup(q);
}
/** 換一瓶（或改了待測液、滴定液的設定）：舊的有加過滴定液就留在圖上（最多 5 條） */
function newRun(P) {
  const r = P.run;
  if (r && r.u > 0) { P.archive.unshift(r); if (P.archive.length > 5) P.archive.pop(); }
  const p = params(P);
  P.run = { p, u: 0, out: 0, fill: 0, pH0: K.pH(p, 0), ind: P.ind, indFixed: true, meterUsed: false, endpoint: null, pts: [{ u: 0, pH: K.pH(p, 0), m: P.meter }] };
  if (P.sys === 'mx') P.run.sample = P.sample;
}
function set(P, o) { Object.assign(P, o); if (('sys' in o) || ('Ca' in o) || ('Va' in o) || ('Vw' in o) || ('Cb' in o)) newRun(P); }
function setInd(P, ind) { P.ind = ind; if (P.run.u > 0) P.run.indFixed = false; P.run.ind = ind; }
function setMeter(P, on) { P.meter = on; }
function refill(P) { P.run.fill = 0; }
/** 加入 n 個單位（每滴 2、半滴 1）；滴定管空了就停 */
function add(P, n, step) {
  step = step || 2;
  const r = P.run;
  while (n > 0) {
    const s = Math.min(step, n, K.BURETTE_UNITS - r.fill);
    if (s <= 0) break;
    r.u += s; r.out += s; r.fill += s; n -= s;
    if (P.meter) r.meterUsed = true;
    r.pts.push({ u: r.u, pH: K.pH(r.p, r.u / U), m: P.meter });
  }
  if (r.sample && r.u > 0 && !r.counted) { r.counted = true; r.sample.flasks++; }
}
function curves(P) {
  return P.archive.concat(P.run.u > 0 ? [P.run] : []).map(r => ({ sys: r.p.sys, Ca: r.p.Ca, Va: r.p.Va, Vw: r.p.Vw, Cb: r.p.Cb, Vmax: r.u / U, Veq: K.Veq(r.p) }));
}
function settleData(P) {
  const r = P.run, pH = K.pH(r.p, r.u / U);
  const fb = P.ind === 'none' ? null : K.indicatorFraction(P.ind, pH);
  return { sys: r.p.sys, Ca: r.p.Ca, Va: r.p.Va, Vw: r.p.Vw, Cb: r.p.Cb, V: r.u / U, Vread: r.fill / U, Veq: K.Veq(r.p), pH, pH0: r.pH0,
    dir: K.direction(r.p.sys), meter: P.meter, meterUsed: r.meterUsed, ind: P.ind, indFixed: r.indFixed, fb,
    moved: K.indicatorMoved(P.ind, r.pH0, pH), empty: r.fill >= K.BURETTE_UNITS, curves: curves(P) };
}
function endpointData(P) {
  const r = P.run, pH = K.pH(r.p, r.u / U), Veq = K.Veq(r.p), Vend = r.out / U, pHeq = K.pHeq(r.p);
  if (P.meter) r.meterUsed = true;
  r.endpoint = Vend;
  return { sys: r.p.sys, Ca: r.p.Ca, Va: r.p.Va, Vw: r.p.Vw, Cb: r.p.Cb, Vend, Veq, err: Vend - Veq, pH, pHeq, ind: P.ind, indFixed: r.indFixed,
    moved: K.indicatorMoved(P.ind, r.pH0, pH), changed: P.ind !== 'none' && K.changed(P.ind, r.pH0, pH), covers: K.covers(P.ind, pHeq),
    meterUsed: r.meterUsed, mystery: r.p.sys === 'mx' };
}
function answerData(P, c, pKa) {
  const s = P.sample, Ka = Math.pow(10, -pKa);
  return { c, pKa, Ka, cTrue: s.C, KaTrue: s.Ka, errC: c / s.C - 1, errKa: Ka / s.Ka - 1, revealed: s.revealed, flasks: s.flasks };
}

let log = true;
const done = {};
function fire(label, type, data) {
  const hits = missions.filter(m => !done[m.id] && m.check({ type, data }, m.mem));
  hits.forEach(m => { done[m.id] = label; });
  if (log) console.log(('  ' + label).padEnd(74), hits.map(m => m.id.replace('acid-base-titration-', '#')).join(', ') || '-');
  return hits;
}
const settle = (P, label) => fire(label, 'settle', settleData(P));
const endpoint = (P, label) => fire(label, 'endpoint', endpointData(P));
/** 一滴一滴加，直到指示劑顏色改變（moved ≥ 門檻），用 step（1 = 半滴）；傳回加了幾個單位 */
function dropUntilChange(P, step, max) {
  const r = P.run; let n = 0;
  while (n < (max || 4000)) {
    const ph = K.pH(r.p, r.u / U);
    if (K.changed(P.ind, r.pH0, ph)) break;
    add(P, step, step); n += step;
  }
  return n;
}
const fmt = (x, d) => (x >= 0 ? '+' : '') + x.toFixed(d == null ? 3 : d);

console.log('\n=== 預設狀態與一般操作不會誤觸 ===');
{
  const P = newPage();
  // 頁面載入時不回報任何事件；設定改變也不回報 settle
  set(P, { sys: 'wa' }); setInd(P, 'btb'); setMeter(P, false); set(P, { sys: 'sa' }); setInd(P, 'php'); setMeter(P, true);
  const before = Object.keys(done).length;
  console.log('  （載入、切換組合、指示劑與 pH 計都不回報事件）', before === 0 ? 'OK' : '錯誤');
  add(P, 2); settle(P, '預設：加一滴 0.05 mL');
  add(P, 400); settle(P, '再快速流下 10.00 mL（讀數 10.05）');
}

console.log('\n=== 1、2、3、5：鹽酸 0.100 M 25.00 mL ＋ NaOH 0.100 M、酚酞 ===');
{
  const P = newPage();
  add(P, 400); settle(P, '流到讀數 10.00 mL → #2');
  add(P, 590); settle(P, '流到 24.75 mL');
  add(P, 8); settle(P, '一滴一滴到 24.95 mL（pH ' + K.pH(P.run.p, P.run.u / U).toFixed(2) + '）');
  add(P, 1, 1); settle(P, '半滴到 24.975 mL（pH ' + K.pH(P.run.p, P.run.u / U).toFixed(2) + '）');
  add(P, 1, 1); settle(P, '半滴到 25.000 mL（pH ' + K.pH(P.run.p, P.run.u / U).toFixed(2) + '）→ #5');
  add(P, 1, 1);
  const d = settleData(P);
  settle(P, '半滴到 25.025 mL（pH ' + d.pH.toFixed(2) + '，酚酞鹼型 ' + (d.fb * 100).toFixed(0) + '%）→ #1');
  endpoint(P, '記錄終點 25.025 mL（誤差 +0.025）→ #3');
}

console.log('\n=== 4、7、h2、h3：醋酸 0.100 M 25.00 mL ＋ NaOH 0.100 M ===');
{
  const P = newPage({ sys: 'wa', ind: 'btb' });
  add(P, 500); settle(P, '流到 12.50 mL（pH ' + K.pH(P.run.p, 12.5).toFixed(3) + '，pKa ' + K.pKaOf(P.run.p).toFixed(3) + '）→ #4');
  add(P, 490); settle(P, '流到 24.75 mL');
  for (let i = 0; i < 6; i++) {
    add(P, 1, 1);
    const d = settleData(P);
    settle(P, '半滴到 ' + d.V.toFixed(3) + ' mL（pH ' + d.pH.toFixed(3) + '，溴瑞香草酚藍鹼型 ' + (d.fb * 100).toFixed(0) + '%）');
  }
  const P2 = newPage({ sys: 'wa', ind: 'php' });
  add(P2, 980);
  const n = dropUntilChange(P2, 1);
  const e = endpointData(P2);
  endpoint(P2, '酚酞（範圍 8.2–10.0 含當量點 pH ' + e.pHeq.toFixed(2) + '）半滴到變色 ' + e.Vend.toFixed(3) + ' mL（誤差 ' + fmt(e.err) + '）→ #7');
  // 對照：甲基橙、溴瑞香草酚藍不包含 8.72
  ['mo', 'mr', 'btb'].forEach(ind => {
    const Q = newPage({ sys: 'wa', ind });
    dropUntilChange(Q, 1);
    const x = endpointData(Q);
    console.log(('  （對照）' + K.INDICATORS[ind].zh + '：在 ' + x.Vend.toFixed(3) + ' mL 就變色，誤差 ' + fmt(x.err, 2) + ' mL；包含當量點？' + x.covers).padEnd(74));
  });
}

console.log('\n=== 8：氨水 0.100 M 25.00 mL ＋ HCl 0.100 M、甲基紅 ===');
{
  const P = newPage({ sys: 'wb', ind: 'mr' });
  add(P, 980);
  dropUntilChange(P, 1);
  const e = endpointData(P);
  endpoint(P, '甲基紅（4.4–6.2 含 ' + e.pHeq.toFixed(2) + '）半滴到變色 ' + e.Vend.toFixed(3) + ' mL（誤差 ' + fmt(e.err) + '）→ #8');
  ['php', 'mo', 'btb'].forEach(ind => {
    const Q = newPage({ sys: 'wb', ind });
    dropUntilChange(Q, 1);
    const x = endpointData(Q);
    console.log(('  （對照）' + K.INDICATORS[ind].zh + '：在 ' + x.Vend.toFixed(3) + ' mL 變色，誤差 ' + fmt(x.err, 2) + ' mL；包含當量點？' + x.covers).padEnd(74));
  });
}

console.log('\n=== 9：不看 pH 計（鹽酸＋NaOH、酚酞），只用整滴也行 ===');
{
  const P = newPage();
  setMeter(P, false);
  add(P, 980);
  const n = dropUntilChange(P, 2);
  const e = endpointData(P);
  endpoint(P, '取出 pH 計，一滴一滴到變色 ' + e.Vend.toFixed(3) + ' mL（誤差 ' + fmt(e.err) + '）→ #9');
}

console.log('\n=== 6：同濃度同體積的鹽酸與醋酸都滴到 1.5 倍當量點（37.50 mL）以上 ===');
{
  const P = newPage();
  add(P, 1500); settle(P, '鹽酸滴到 37.50 mL');
  set(P, { sys: 'wa' });
  add(P, 1480); settle(P, '換醋酸（鹽酸曲線留在圖上），滴到 37.00 mL');
  add(P, 20); settle(P, '再到 37.50 mL → #6');
}

console.log('\n=== h1：讓滴定管一次流光 ===');
{
  const P = newPage({ Va: 50, Ca: 0.1 });
  add(P, 5000); settle(P, '打開活栓不關，流完 50.00 mL 自動停 → h1');
}

// ---------- 未知弱酸：蒙地卡羅 ----------
console.log('\n=== 10、11、12：未知弱酸（濃度 0.050–0.150 M、pKa 4.00–6.00），每種做法各試 2000 個樣品 ===');
/**
 * 學生的做法（同一瓶）：待測液 25.00 mL、NaOH 0.100 M、酚酞、pH 計在瓶中；一滴一滴加到顏色明顯變了再多加 2 mL，
 * 從記下的曲線（每滴一點，pH 讀到小數第 2 位）找 ΔpH 最大的一段，取中點當當量點；
 * 濃度 c = Cb·Veq/Va；pKa：
 *   做法甲：讀最靠近 Veq/2 那一點的 pH，直接當 pKa。
 *   做法乙：同一點用電荷平衡算 Ka = [H+][A-]/[HA]，[A-] = [Na+] + [H+] − [OH-]、[HA] = c·Va/V總 − [A-]。
 */
function studentTitration(P) {
  const r = P.run;
  add(P, 2);
  while (!K.changed(P.ind, r.pH0, K.pH(r.p, r.u / U)) && r.u < 3 * K.BURETTE_UNITS) {
    if (r.fill >= K.BURETTE_UNITS) refill(P);
    add(P, 2);
  }
  add(P, 80);
  const pts = r.pts.filter(q => q.m).map(q => ({ v: q.u / U, pH: Math.round(q.pH * 100) / 100 }));
  let best = -1, at = 0;
  for (let i = 1; i < pts.length; i++) { const s = (pts[i].pH - pts[i - 1].pH) / (pts[i].v - pts[i - 1].v); if (s > best) { best = s; at = (pts[i].v + pts[i - 1].v) / 2; } }
  const Veq = at, c = P.Cb * Veq / P.Va;
  let near = pts[0];
  pts.forEach(q => { if (Math.abs(q.v - Veq / 2) < Math.abs(near.v - Veq / 2)) near = q; });
  const h = Math.pow(10, -near.pH), Vt = P.Va + P.Vw + near.v;
  const A = P.Cb * near.v / Vt + h - K.KW / h, HA = c * P.Va / Vt - A;
  return { Veq, c, pKaA: near.pH, pKaB: -Math.log10(h * A / HA) };
}
{
  const rng = mulberry32(20261112);
  const stat = { c1: 0, c05: 0, kaA5: 0, kaA3: 0, kaB5: 0, kaB3: 0, master: 0, masterA: 0 };
  let worstC = 0, worstA = 0, worstB = 0;
  const N = 2000;
  log = false;
  for (let i = 0; i < N; i++) {
    const s = K.mysterySample(rng);
    const P = newPage({ sys: 'mx', sample: { C: s.C, Ka: s.Ka, flasks: 0, revealed: false } });
    const st = studentTitration(P);
    const a = answerData(P, st.c, st.pKaA), b = answerData(P, st.c, st.pKaB);
    worstC = Math.max(worstC, Math.abs(a.errC)); worstA = Math.max(worstA, Math.abs(a.errKa)); worstB = Math.max(worstB, Math.abs(b.errKa));
    if (Math.abs(a.errC) <= 0.01) stat.c1++;
    if (Math.abs(a.errC) <= 0.003) stat.c05++;
    if (Math.abs(a.errKa) <= 0.05) stat.kaA5++;
    if (Math.abs(a.errKa) <= 0.03) stat.kaA3++;
    if (Math.abs(b.errKa) <= 0.05) stat.kaB5++;
    if (Math.abs(b.errKa) <= 0.03) stat.kaB3++;
    const m12 = missions.find(m => m.id === 'acid-base-titration-12');
    if (m12.check({ type: 'answer', data: b }, {})) stat.master++;
    if (m12.check({ type: 'answer', data: a }, {})) stat.masterA++;
  }
  log = true;
  const pc = x => (100 * x / N).toFixed(1) + '%';
  console.log('  濃度誤差 ≤ 1%：' + pc(stat.c1) + '，≤ 0.3%：' + pc(stat.c05) + '（最大 ' + (worstC * 100).toFixed(2) + '%）');
  console.log('  做法甲（pH 直接當 pKa）Ka 誤差 ≤ 5%：' + pc(stat.kaA5) + '，≤ 3%：' + pc(stat.kaA3) + '（最大 ' + (worstA * 100).toFixed(2) + '%）');
  console.log('  做法乙（電荷平衡修正）Ka 誤差 ≤ 5%：' + pc(stat.kaB5) + '，≤ 3%：' + pc(stat.kaB3) + '（最大 ' + (worstB * 100).toFixed(2) + '%）');
  console.log('  大師任務（一瓶、濃度 0.3% 與 Ka 2%）成功：做法乙 ' + pc(stat.master) + '、做法甲 ' + pc(stat.masterA));
  // 實際走一次事件
  const s = K.mysterySample(mulberry32(7));
  const P = newPage({ sys: 'mx', sample: { C: s.C, Ka: s.Ka, flasks: 0, revealed: false } });
  const st = studentTitration(P);
  fire('樣品 C = ' + s.C.toFixed(3) + ' M、Ka = ' + s.Ka.toExponential(1) + '；一瓶：c = ' + st.c.toFixed(4) + '、pKa = ' + st.pKaB.toFixed(3), 'answer', answerData(P, st.c, st.pKaB));
  const Q = newPage({ sys: 'mx', sample: { C: s.C, Ka: s.Ka, flasks: 0, revealed: true } });
  log = true;
}
{
  // 揭曉答案之後填正確答案不算；同一個樣品用了兩瓶也不算大師
  const s = { C: 0.087, Ka: 3.3e-5, flasks: 0, revealed: false };
  const P = newPage({ sys: 'mx', sample: s });
  add(P, 400); newRun(P); add(P, 2);
  const d = answerData(P, 0.087, -Math.log10(3.3e-5));
  const m12 = missions.find(m => m.id === 'acid-base-titration-12');
  console.log('  （對照）同一個樣品用兩瓶（flasks = ' + d.flasks + '）時大師任務：' + (m12.check({ type: 'answer', data: d }, {}) ? '錯誤：通過了' : '不通過（正確）'));
  s.revealed = true;
  const m10 = missions.find(m => m.id === 'acid-base-titration-10');
  console.log('  （對照）揭曉答案後填正確濃度：' + (m10.check({ type: 'answer', data: answerData(P, 0.087, 4.48) }, {}) ? '錯誤：通過了' : '不通過（正確）'));
}


console.log('\n=== h4–h10（每個做法只完成它自己這個隱藏任務） ===');
{
  const isHid = id => /-h\d+$/.test(id);
  let hbad = 0;
  const only = (hits, id) => { const x = hits.map(m => m.id).filter(k => isHid(k) && k !== id); if (x.length) { hbad++; console.log('  ✗ ' + id + ' 順便完成了 ' + x.join('、')); } };
  let P, e, hits;
  // h4：醋酸用甲基橙
  P = newPage({ sys: 'wa', ind: 'mo' }); setMeter(P, false); dropUntilChange(P, 2); e = endpointData(P);
  hits = endpoint(P, '醋酸＋NaOH、甲基橙：' + e.Vend.toFixed(3) + ' mL 就變色（誤差 ' + fmt(e.err, 2) + '）→ h4'); only(hits, 'acid-base-titration-h4');
  // h5：鹽酸 0.100 M 25.00 mL，另加水 0 與 50 mL 各滴到 27 mL
  P = newPage(); add(P, 1080); settle(P, '鹽酸、不加水，滴到 27.00 mL');
  set(P, { Vw: 50 }); add(P, 1080);
  hits = settle(P, '同樣的鹽酸另加水 50 mL，也滴到 27.00 mL（當量點都是 ' + K.Veq(P.run.p).toFixed(2) + ' mL）→ h5'); only(hits, 'acid-base-titration-h5');
  // h6：醋酸剛好滴到當量點
  P = newPage({ sys: 'wa', ind: 'php' }); add(P, 1000);
  hits = settle(P, '醋酸＋NaOH 插 pH 計剛好 25.000 mL：pH ' + K.pH(P.run.p, 25).toFixed(2) + ' → h6'); only(hits, 'acid-base-titration-h6');
  // h7：氨水半當量點
  P = newPage({ sys: 'wb', ind: 'mr' }); add(P, 500);
  hits = settle(P, '氨水＋HCl 插 pH 計滴到 12.50 mL：pH ' + K.pH(P.run.p, 12.5).toFixed(2) + '（14 − pKb ' + K.pKaOf(P.run.p).toFixed(2) + '）→ h7'); only(hits, 'acid-base-titration-h7');
  // h8：0.001 M 鹽酸＋0.001 M NaOH、溴瑞香草酚藍、不用 pH 計、半滴
  P = newPage({ Ca: 0.001, Cb: 0.001, ind: 'btb' }); setMeter(P, false); add(P, 960); dropUntilChange(P, 1); e = endpointData(P);
  hits = endpoint(P, '0.001 M 鹽酸＋0.001 M NaOH、溴瑞香草酚藍、半滴到變色 ' + e.Vend.toFixed(3) + ' mL（誤差 ' + fmt(e.err) + '）→ h8'); only(hits, 'acid-base-titration-h8');
  { const Q = newPage({ Ca: 0.001, Cb: 0.001, ind: 'php' }); setMeter(Q, false); add(Q, 960); dropUntilChange(Q, 1); const x = endpointData(Q);
    console.log('  （對照）同樣的稀溶液用酚酞：誤差 ' + fmt(x.err) + ' mL，不算 h8'); }
  // h9：醋酸＋NaOH、酚酞、不用 pH 計、最後用半滴
  P = newPage({ sys: 'wa', ind: 'php' }); setMeter(P, false); add(P, 980); dropUntilChange(P, 1); e = endpointData(P);
  hits = endpoint(P, '醋酸＋NaOH、酚酞、不用 pH 計、半滴到變色 ' + e.Vend.toFixed(3) + ' mL（誤差 ' + fmt(e.err) + '）→ h9'); only(hits, 'acid-base-titration-h9');
  // h10：未知弱酸一瓶，濃度 0.1%、Ka 1%（做法乙）
  {
    const rng = mulberry32(31); let n = 0, first = null; const N = 400;
    const m10 = missions.find(m => m.id === 'acid-base-titration-h10');
    log = false;
    for (let i = 0; i < N; i++) {
      const s = K.mysterySample(rng);
      const Q = newPage({ sys: 'mx', sample: { C: s.C, Ka: s.Ka, flasks: 0, revealed: false } });
      const st = studentTitration(Q), b = answerData(Q, st.c, st.pKaB);
      if (m10.check({ type: 'answer', data: b }, {})) { n++; if (!first) first = { Q, st, s }; }
    }
    log = true;
    console.log('  未知弱酸 ' + N + ' 個樣品、一瓶、做法乙：濃度 ≤ 0.1% 且 Ka ≤ 1% 有 ' + (100 * n / N).toFixed(1) + '%');
    if (first) { hits = fire('樣品 C = ' + first.s.C.toFixed(3) + ' M：c = ' + first.st.c.toFixed(4) + '、pKa = ' + first.st.pKaB.toFixed(3) + ' → h10', 'answer', answerData(first.Q, first.st.c, first.st.pKaB)); only(hits, 'acid-base-titration-h10'); }
  }
  if (hbad) { console.log('  ✗ 有 ' + hbad + ' 項隱藏任務互相連帶'); process.exitCode = 1; }
}

console.log('\n=== 結果 ===');
let ok = true;
missions.forEach(m => {
  const got = done[m.id];
  if (!got) ok = false;
  console.log((got ? '  ✓ ' : '  ✗ ') + m.id.padEnd(26) + ' ★' + String(m.level).padEnd(3) + (m.title ? m.title.zh : '（隱藏）' + m.riddle.zh) + (got ? '' : '　← 沒有達成'));
});
const wrong = Object.keys(done).filter(id => /預設/.test(done[id]));
if (wrong.length) { ok = false; console.log('  ✗ 預設操作誤觸：' + wrong.join(', ')); }
console.log(ok ? '\n全部任務都做得到，預設狀態不會觸發。' : '\n有任務沒有達成或被誤觸。');
process.exit(ok ? 0 : 1);
