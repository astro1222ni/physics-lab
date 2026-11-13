/* 任務可達成的證明腳本。用法：node tools/mission-proofs/solubility-equilibrium.js
 * 用核心的燒杯狀態機（和頁面 js/solubility-equilibrium.js 同一套 addSolution／addSolid／addWater）模擬操作：
 * 溶液濃度 0.00001～1 M（可打字）、每次加一滴 0.05 mL、1 mL 或 10 mL；固體 0.1～1000 mg；水每次 1 mL 或 10 mL；燒杯最多 250 mL。
 * 確認每個任務都做得到、隱藏任務彼此不會順便完成、單獨加一種試劑或亂加不會觸發隱藏任務。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const S = require(__ROOT + 'js/solubility-equilibrium-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/solubility-equilibrium.js');

let bad = 0;
const done = {};
let sats = [];   // 頁面跨杯累積「做成過的純水飽和溶液」
function freshMissions() { missions.forEach(m => { m.done = false; }); sats = []; }
function newPage() { return { b: S.createBeaker(), events: [] }; }
function reset(P) { P.b = S.createBeaker(); }
function emit(P, d) {
  if (!d) throw new Error('超過燒杯容量');
  d.sat.forEach(k => { if (sats.indexOf(k) < 0) sats.push(k); });
  d.sats = sats.slice();
  const ev = { type: 'mix', data: d };
  missions.forEach(m => { if (!m.done && m.check(ev)) { m.done = true; P.events.push(m.id); } });
  return d;
}
const soln = (P, key, c, mL) => emit(P, S.addSolution(P.b, key, c, mL));
const solid = (P, key, mg) => emit(P, S.addSolid(P.b, key, mg));
const water = (P, mL) => emit(P, S.addWater(P.b, mL));
const drop = (P, key, c) => soln(P, key, c, S.DROP);
const hidden = id => /-h\d+$/.test(id);
/** 確認 ids 都完成；另外檢查沒有「不在 ids 裡」的隱藏任務順便完成 */
function report(name, P, ids) {
  const ok = ids.every(id => P.events.includes(id));
  const extra = P.events.filter(id => hidden(id) && !ids.includes(id));
  ids.forEach(id => { if (P.events.includes(id)) done[id] = true; });
  console.log('  ' + (ok && !extra.length ? '✓' : '✗') + ' ' + name + '：' + (P.events.length ? P.events.join('、') : '（沒有任務）') + (extra.length ? '　← 順便完成了 ' + extra.join('、') : ''));
  if (!ok || extra.length) bad++;
}
const e = x => x.toExponential(2);

// ---------- 預設狀態與單一試劑 ----------
console.log('=== 預設狀態、單一試劑、亂加 ===');
freshMissions();
{
  const P = newPage();
  if (P.events.length) { bad++; console.log('  ✗ 預設狀態觸發了任務'); } else console.log('  ✓ 預設狀態（50 mL 純水、還沒操作）不觸發任何任務');
  // 每一種溶液單獨加 10 mL 0.1 M、每一種固體單獨加 100 mg：都不該完成隱藏任務
  Object.keys(S.SOLN).forEach(k => { reset(P); soln(P, k, 0.1, 10); });
  Object.keys(S.SOLID).forEach(k => { reset(P); solid(P, k, 100); water(P, 10); });
  const h = P.events.filter(hidden);
  if (h.length) { bad++; console.log('  ✗ 單一試劑觸發了隱藏任務：' + h.join('、')); } else console.log('  ✓ 每種溶液或固體單獨加（再加水）都不觸發隱藏任務（公開任務：' + (P.events.join('、') || '無') + '）');
  // 偽隨機亂加 300 杯，每杯 6 次：統計隱藏任務被亂加完成的次數
  let seed = 1113;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const keys = Object.keys(S.SOLN), conc = [0.001, 0.01, 0.1, 1], vols = [S.DROP, 1, 10];
  const hits = {};
  for (let t = 0; t < 300; t++) {
    freshMissions(); const Q = newPage();
    for (let j = 0; j < 6; j++) {
      const r = rnd();
      if (r < 0.15) { if (Q.b.V + 10 <= S.V_MAX) water(Q, 10); }
      else { const v = vols[Math.floor(rnd() * 3)]; if (Q.b.V + v <= S.V_MAX) soln(Q, keys[Math.floor(rnd() * keys.length)], conc[Math.floor(rnd() * 4)], v); }
    }
    Q.events.filter(hidden).forEach(id => { hits[id] = (hits[id] || 0) + 1; });
  }
  const hk = Object.keys(hits);
  console.log('  ' + (hk.length ? '△' : '✓') + ' 亂加 300 杯（每杯 6 次）意外完成的隱藏任務：' + (hk.length ? hk.map(k => k + ' ' + hits[k] + ' 次').join('、') : '沒有'));
  if (hk.some(k => hits[k] > 6)) { bad++; console.log('  ✗ 有隱藏任務太容易被亂加完成（超過 2%）'); }
}

// ---------- 公開任務 ----------
console.log('=== 公開任務 ===');
freshMissions();
let P = newPage();
soln(P, 'AgNO3', 0.1, 1); soln(P, 'NaCl', 0.1, 1);
report('0.1 M AgNO3 1 mL ＋ 0.1 M NaCl 1 mL → AgCl ' + S.pptMg(P.b, 'AgCl').toFixed(1) + ' mg', P, ['solubility-equilibrium-1']);

freshMissions(); P = newPage();
let d = solid(P, 'AgCl', 10);
report('50 mL 水＋AgCl 10 mg：[Ag+] = ' + e(d.c.Ag) + ' M', P, ['solubility-equilibrium-2']);

freshMissions(); P = newPage();
for (let k = 0; k < 5; k++) drop(P, 'AgNO3', 0.001);
for (let k = 0; k < 5; k++) d = drop(P, 'NaCl', 0.001);
report('0.001 M AgNO3 與 NaCl 各 5 滴：[Ag+] = [Cl−] = ' + e(d.c.Ag) + ' M，Q/Ksp = ' + d.Qr.AgCl.toFixed(3), P, ['solubility-equilibrium-3']);

freshMissions(); P = newPage();
solid(P, 'AgCl', 10); d = soln(P, 'NaCl', 1, 1);
report('AgCl 10 mg ＋ 1 M NaCl 1 mL：[Ag+] = ' + e(d.c.Ag) + ' M（純水 1.33e-5）', P, ['solubility-equilibrium-4']);

freshMissions(); P = newPage();
soln(P, 'AgNO3', 0.001, 1);
let n = 0;
for (; n < 400; n++) { d = drop(P, 'NaCl', 0.0001); if (d.Qr.AgCl >= 0.95 || d.p.AgCl > 0) break; }
report('0.001 M AgNO3 1 mL，再滴 0.0001 M NaCl ' + (n + 1) + ' 滴：Q/Ksp = ' + d.Qr.AgCl.toFixed(4), P, ['solubility-equilibrium-5']);

freshMissions(); P = newPage();
solid(P, 'AgCl', 10); const agA = P.b.c.Ag;
reset(P); solid(P, 'Ag2CrO4', 10); const agB = P.b.c.Ag;
report('兩杯：AgCl [Ag+] = ' + e(agA) + '、Ag2CrO4 [Ag+] = ' + e(agB) + ' M（Ksp 1.77e-10 對 1.12e-12）', P, ['solubility-equilibrium-6']);

freshMissions(); P = newPage();
solid(P, 'AgCl', 0.3);
while (P.b.V + 10 <= 150) water(P, 10);
while (P.b.p.AgCl > 0 && P.b.V + 1 <= S.V_MAX) d = water(P, 1);
report('AgCl 0.3 mg，加水到 ' + P.b.V + ' mL 剛好溶完：Q/Ksp = ' + d.Qr.AgCl.toFixed(3), P, ['solubility-equilibrium-7']);

freshMissions(); P = newPage();
soln(P, 'NaCl', 0.1, 2); soln(P, 'KI', 0.1, 2);
soln(P, 'AgNO3', 0.1, 1);
for (let k = 0; k < 9; k++) soln(P, 'AgNO3', 0.01, 1);
for (n = 0; n < 200 && !P.events.includes('solubility-equilibrium-8'); n++) d = drop(P, 'AgNO3', 0.01);
report('Cl−、I− 各 0.2 mmol，AgNO3 加到 ' + (P.b.N.Ag * 1000).toFixed(4) + ' mmol：AgI 占 I− ' + (100 * P.b.p.AgI / P.b.N.I).toFixed(2) + '%、AgCl ' + (P.b.p.AgCl ? '有' : '無'), P, ['solubility-equilibrium-8']);

function mohr(P, crMl, last, label, id) {
  soln(P, 'NaCl', 0.1, 10); soln(P, 'NaCl', 0.1, 10);         // 2.000 mmol Cl−
  soln(P, 'K2CrO4', 0.5, crMl);                                // 指示劑
  soln(P, 'AgNO3', 0.1, 10); for (let k = 0; k < 9; k++) soln(P, 'AgNO3', 0.1, 1);   // 1.900 mmol
  let k = 0;
  for (; k < 2000 && !(P.b.p.Ag2CrO4 > 0); k++) drop(P, 'AgNO3', last);
  report(label + '：K2CrO4 0.5 M ' + crMl + ' mL（[CrO4] ≈ ' + e(P.b.N.CrO4 / P.b.V * 1000) + ' M），' + last + ' M AgNO3 滴 ' + k + ' 滴後出現紅棕色，Ag/Cl = ' + (P.b.N.Ag / P.b.N.Cl).toFixed(5), P, id);
}
freshMissions(); P = newPage(); mohr(P, 1, 0.1, '莫耳法', ['solubility-equilibrium-9']);
freshMissions(); P = newPage(); mohr(P, 1, 0.01, '精準莫耳法', ['solubility-equilibrium-9', 'solubility-equilibrium-10']);
// 鉻酸根太濃：紅棕色太早出現，達不到 0.05%
freshMissions(); P = newPage(); soln(P, 'NaCl', 0.1, 10); soln(P, 'NaCl', 0.1, 10); soln(P, 'K2CrO4', 1, 10);
soln(P, 'AgNO3', 0.1, 10); for (let k = 0; k < 9; k++) soln(P, 'AgNO3', 0.1, 1);
for (n = 0; n < 2000 && !(P.b.p.Ag2CrO4 > 0); n++) drop(P, 'AgNO3', 0.01);
console.log('  （對照：K2CrO4 1 M 10 mL 太濃，紅棕色在 Ag/Cl = ' + (P.b.N.Ag / P.b.N.Cl).toFixed(5) + ' 出現，' + (P.events.includes('solubility-equilibrium-10') ? '✗ 竟然算過' : '✓ 不算任務 10') + '）');
if (P.events.includes('solubility-equilibrium-10')) bad++;

// ---------- 隱藏任務 ----------
console.log('=== 隱藏任務 ===');
freshMissions(); P = newPage();
soln(P, 'AgNO3', 0.1, 1); soln(P, 'NaCl', 0.1, 1); soln(P, 'KI', 0.1, 10);
report('AgCl 沉澱後加 0.1 M KI 10 mL：AgCl ' + S.pptMg(P.b, 'AgCl').toFixed(2) + ' mg、AgI ' + S.pptMg(P.b, 'AgI').toFixed(1) + ' mg', P, ['solubility-equilibrium-1', 'solubility-equilibrium-h1']);

freshMissions(); P = newPage();
soln(P, 'PbNO32', 0.1, 10); soln(P, 'KI', 0.1, 10); soln(P, 'KI', 0.1, 10);
report('0.1 M Pb(NO3)2 10 mL ＋ 0.1 M KI 20 mL：PbI2 ' + S.pptMg(P.b, 'PbI2').toFixed(0) + ' mg', P, ['solubility-equilibrium-1', 'solubility-equilibrium-h2']);

freshMissions(); P = newPage();
soln(P, 'BaNO32', 0.1, 10); d = soln(P, 'Na2SO4', 1, 10);
report('0.1 M Ba(NO3)2 10 mL ＋ 1 M Na2SO4 10 mL：[Ba2+] = ' + e(d.c.Ba) + ' M', P, ['solubility-equilibrium-1', 'solubility-equilibrium-h3']);

freshMissions(); P = newPage();
soln(P, 'NaCl', 0.1, 10); soln(P, 'NaBr', 0.1, 1); d = soln(P, 'AgNO3', 0.1, 10);
report('NaCl 1 mmol、NaBr 0.1 mmol、AgNO3 1 mmol：AgCl ' + e(d.p.AgCl) + '、AgBr ' + e(d.p.AgBr) + ' mol，[Cl−]/[Br−] = ' + (d.c.Cl / d.c.Br).toFixed(0), P, ['solubility-equilibrium-1', 'solubility-equilibrium-h4']);

freshMissions(); P = newPage();
soln(P, 'PbNO32', 0.1, 10); soln(P, 'BaNO32', 0.01, 10);
for (let k = 0; k < 9; k++) soln(P, 'K2CrO4', 0.1, 1);
for (let k = 0; k < 9; k++) soln(P, 'K2CrO4', 0.01, 1);
for (n = 0; n < 400 && !P.events.includes('solubility-equilibrium-h5') && !(P.b.p.BaCrO4 > 0); n++) d = drop(P, 'K2CrO4', 0.001);
report('Pb2+ 1 mmol、Ba2+ 0.1 mmol，鉻酸根加到 ' + (P.b.N.CrO4 * 1000).toFixed(5) + ' mmol：Pb 沉澱 ' + (100 * P.b.p.PbCrO4 / P.b.N.Pb).toFixed(3) + '%、BaCrO4 ' + (P.b.p.BaCrO4 ? '有' : '無'), P, ['solubility-equilibrium-1', 'solubility-equilibrium-h5']);

freshMissions(); P = newPage();
soln(P, 'NaCl', 0.1, 10); soln(P, 'NaBr', 0.1, 1); soln(P, 'KI', 0.1, 1); d = soln(P, 'AgNO3', 0.1, 10);
report('NaCl 1、NaBr 0.1、KI 0.1、AgNO3 1 mmol：AgCl ' + e(d.p.AgCl) + '、AgBr ' + e(d.p.AgBr) + '、AgI ' + e(d.p.AgI) + ' mol', P, ['solubility-equilibrium-1', 'solubility-equilibrium-h6']);

freshMissions(); P = newPage();
soln(P, 'KI', 0.01, 1); soln(P, 'NaCl', 0.001, 1); soln(P, 'AgNO3', 0.01, 1);
for (n = 0; n < 100 && !(P.b.p.AgCl > 0); n++) drop(P, 'AgNO3', 0.01);
const agclMol = P.b.p.AgCl;
while (P.b.p.AgCl > 0 && P.b.V + 10 <= S.V_MAX) d = water(P, 10);
report('AgI 0.01 mmol＋少量 AgCl（' + e(agclMol) + ' mol），加水到 ' + P.b.V + ' mL：AgCl ' + (P.b.p.AgCl ? '還在' : '溶光') + '、AgI ' + S.pptMg(P.b, 'AgI').toFixed(2) + ' mg', P, ['solubility-equilibrium-1', 'solubility-equilibrium-h7']);

freshMissions(); P = newPage();
soln(P, 'PbNO32', 0.1, 10);
for (n = 0; n < 400; n++) { d = drop(P, 'KI', 0.01); if (d.Qr.PbI2 >= 0.97 || d.p.PbI2 > 0) break; }
// 再滴濃度約為 2 倍 [I−] 的 KI：每滴 I− 增加的比例只比稀釋略大，Q 每滴只升約 0.08%
const cFine = Number((2 * P.b.c.I).toPrecision(2));
let m8 = 0;
for (; m8 < 400; m8++) { d = drop(P, 'KI', cFine); if (d.Qr.PbI2 >= 0.999 || d.p.PbI2 > 0) break; }
report('0.1 M Pb(NO3)2 10 mL，0.01 M KI 滴 ' + (n + 1) + ' 滴到 Q/Ksp ≈ 0.97，改滴 ' + cFine + ' M KI ' + (m8 + 1) + ' 滴：Q/Ksp = ' + d.Qr.PbI2.toFixed(5), P, ['solubility-equilibrium-5', 'solubility-equilibrium-h8']);

freshMissions(); P = newPage();
soln(P, 'AgNO3', 0.0001, 10); soln(P, 'NaCl', 0.001, 1);
const had9 = P.b.p.AgCl > 0;
while (P.b.p.AgCl > 0 && P.b.V + 10 <= S.V_MAX) water(P, 10);
report('0.0001 M AgNO3 10 mL ＋ 0.001 M NaCl 1 mL（' + (had9 ? '有' : '沒有') + ' AgCl），加水到 ' + P.b.V + ' mL 溶光', P, ['solubility-equilibrium-1', 'solubility-equilibrium-h9']);

freshMissions(); P = newPage();
soln(P, 'AgNO3', 1, 10); d = soln(P, 'Na2SO4', 1, 10);
report('1 M AgNO3 10 mL ＋ 1 M Na2SO4 10 mL：Ag2SO4 ' + S.pptMg(P.b, 'Ag2SO4').toFixed(0) + ' mg', P, ['solubility-equilibrium-1', 'solubility-equilibrium-h10']);

// ---------- 總結 ----------
const missing = missions.filter(m => !done[m.id]).map(m => m.id);
console.log(missing.length ? '  ✗ 沒有證明到的任務：' + missing.join('、') : '  ✓ ' + missions.length + ' 個任務都證明做得到');
if (missing.length) bad++;
const lv = missions.filter(m => m.hidden).map(m => m.level);
console.log('    （公開 ' + missions.filter(m => !m.hidden).reduce((a, m) => a + m.level, 0) + ' 顆星、隱藏 ' + lv.reduce((a, l) => a + l * 2, 0) + ' 顆星；隱藏任務等級 ' + lv.join('、') + '，7 級以上 ' + lv.filter(l => l >= 7).length + ' 個）');
if (bad) { console.log('失敗 ' + bad + ' 項'); process.exitCode = 1; }
else console.log('全部任務都做得到，預設狀態不會觸發，隱藏任務彼此不會順便完成。');
