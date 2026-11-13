/* 任務可達成的證明腳本。用法：node tools/mission-proofs/buffer-solutions.js
 * 用化學核心（js/buffer-solutions-core.js 的 createRun／addTo／mixData／addData，頁面 js/buffer-solutions.js 用的是同一套）
 * 模擬學生的操作：配製（送 'mix'）、按「加入 HCl／NaOH」「加水稀釋」（送 'add'）。
 * 確認：每個任務都做得到、預設狀態不觸發任務、一般操作不會誤觸隱藏任務、隱藏任務彼此不會順便完成。
 * 修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const B = require(__ROOT + 'js/buffer-solutions-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/buffer-solutions.js');

const AMOUNTS = [0.05, 0.5, 1, 5];           // 頁面「每次加入的量」（mL）
let bad = 0;
const doneEver = {};

// ---------- 模擬頁面 ----------
function page() { return { events: [], run: null, cs: 1 }; }
function emit(P, type, data) {
  const ev = { type, data };
  missions.forEach(m => { if (!P.done[m.id] && m.check(ev, m.mem)) { P.done[m.id] = true; P.events.push(m.id); } });
}
/** 配製一杯（等於學生改了滑桿或選項）：送 'mix' */
function mix(P, o) {
  P.p = Object.assign({ sys: 'ac', CHA: 0.1, CA: 0.1, V0: 100, comp: 'water' }, o);
  P.run = B.createRun(P.p);
  emit(P, 'mix', B.mixData(P.run));
}
/** 按一次加入：kind 'acid' 'base' 'water'（加水 = 加入原來的體積 V0） */
function add(P, kind, mL) {
  const v = kind === 'water' ? P.run.p.V0 : mL;
  if (kind !== 'water' && AMOUNTS.indexOf(mL) < 0) throw new Error('頁面沒有這個加入量：' + mL);
  const r = B.addTo(P.run, kind, v, P.cs);
  if (!r.ok) return false;
  emit(P, 'add', B.addData(P.run, r, P.cs));
  return true;
}
function fresh() { const P = page(); P.done = {}; missions.forEach(m => { m.mem = {}; }); return P; }
function clone(run) { return JSON.parse(JSON.stringify(run)); }
/** 逼近：往 kind 方向一直加，每次挑「不會越過 target ± tol」的最大加入量（濃度可用 cs 清單裡的）；fn(run) 是要逼近的量 */
function approach(P, kind, fn, target, tol, csList) {
  csList = csList || [P.cs];
  for (let guard = 0; guard < 4000; guard++) {
    const now = fn(P.run);
    if (Math.abs(now - target) <= tol) return true;
    const dir = Math.sign(target - now);
    let pick = null;
    for (const cs of csList) {
      for (const mL of AMOUNTS.slice().reverse()) {
        const R = clone(P.run), r = B.addTo(R, kind, mL, cs);
        if (!r.ok) continue;
        const v = fn(R);
        if (Math.sign(target - v) === dir || Math.abs(v - target) <= tol) { if (!pick || mL * cs > pick.mL * pick.cs) pick = { mL, cs }; }
      }
    }
    if (!pick) return false;
    P.cs = pick.cs;
    add(P, kind, pick.mL);
  }
  return false;
}
/** 二分法找共軛鹼濃度，讓 pH = target（弱酸濃度 CHA 固定）；結果取到小數第 5 位（頁面可打字輸入的精度） */
function caFor(sys, CHA, V0, target) {
  let lo = 1e-4, hi = 1;
  for (let i = 0; i < 80; i++) { const m = Math.sqrt(lo * hi); B.pH(B.make(sys, CHA, m, V0)) < target ? lo = m : hi = m; }
  return Math.round(Math.sqrt(lo * hi) * 1e5) / 1e5;
}

function report(name, P, want, notHidden) {
  const got = P.events;
  const okWant = want.every(id => got.includes(id));
  const hiddenGot = got.filter(id => /-h\d+$/.test(id));
  const extraHidden = hiddenGot.filter(id => !want.includes(id));
  const ok = okWant && (!notHidden || !extraHidden.length);
  want.forEach(id => { if (got.includes(id)) doneEver[id] = true; });
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + name + '：' + (got.length ? got.join('、') : '（沒有任務）') + (extraHidden.length && notHidden ? '　← 順便完成了其他隱藏任務' : ''));
  if (!ok) bad++;
}
const f3 = x => (+x).toFixed(3);

console.log('緩衝溶液：任務證明');

// ---------- 0. 預設狀態不觸發任務 ----------
console.log('\n〔預設狀態與一般操作〕');
{
  const P = fresh();
  mix(P, {});
  const got = P.events.slice();
  console.log('  ' + (got.length ? '✗' : '✓') + ' 預設配方（0.10 M 醋酸＋0.10 M 醋酸鈉、100 mL、純水對照）：' + (got.length ? got.join('、') : '沒有任務'));
  if (got.length) bad++;
}
{ // 一般操作：每一種系統 × 每一種對照，預設濃度，各加一滴酸、一滴鹼、1 mL 酸、加水一次——不可完成任何隱藏任務
  let hid = [];
  ['ac', 'ph', 'nh'].forEach(sys => B.COMPARES.forEach(comp => {
    const P = fresh();
    mix(P, { sys, comp });
    add(P, 'acid', 0.05); add(P, 'base', 0.05); add(P, 'acid', 1); add(P, 'base', 5); add(P, 'water');
    hid = hid.concat(P.events.filter(id => /-h\d+$/.test(id)).map(id => sys + '/' + comp + '：' + id));
  }));
  console.log('  ' + (hid.length ? '✗' : '✓') + ' 3 種系統 × 5 種對照的一般操作（各加一滴酸、一滴鹼、1 mL 酸、5 mL 鹼、加水）：' + (hid.length ? '誤觸 ' + hid.join('、') : '沒有誤觸隱藏任務'));
  if (hid.length) bad++;
}

// ---------- 一般任務 ----------
console.log('\n〔一般任務〕');
{ const P = fresh(); mix(P, {}); add(P, 'acid', 0.05);
  report('1 預設＋純水對照，加一滴 1.0 M HCl（緩衝 ' + f3(P.run.sb.pH - P.run.pH0) + '、純水 ' + f3(P.run.sc.pH - P.run.pHc0) + '）', P, ['buffer-solutions-1'], true); }
{ const P = fresh(); mix(P, { comp: 'same' }); add(P, 'water');
  report('2 預設＋同 pH 的強酸，加水到 2 倍（緩衝 ' + f3(P.run.sb.pH - P.run.pH0) + '、右杯 ' + f3(P.run.sc.pH - P.run.pHc0) + '）', P, ['buffer-solutions-2'], true); }
{ const CA = caFor('ac', 0.1, 100, 5); const P = fresh(); mix(P, { CA });
  report('3 醋酸 0.100 M＋醋酸鈉 ' + CA + ' M → pH ' + f3(P.run.pH0), P, ['buffer-solutions-3'], true); }
{ const CA = caFor('ph', 0.1, 100, 7.4); const P = fresh(); mix(P, { sys: 'ph', CA });
  report('4 NaH2PO4 0.100 M＋Na2HPO4 ' + CA + ' M → pH ' + f3(P.run.pH0), P, ['buffer-solutions-4'], true); }
{ const CA = caFor('nh', 0.1, 100, 10); const P = fresh(); mix(P, { sys: 'nh', CA });
  report('5 NH4Cl 0.100 M＋NH3 ' + CA + ' M → pH ' + f3(P.run.pH0), P, ['buffer-solutions-5'], true); }
{ const P = fresh(); mix(P, { comp: 'dil10' }); add(P, 'acid', 0.5); add(P, 'acid', 0.05); add(P, 'acid', 0.05);
  report('6 預設＋稀釋 10 倍對照，加 0.60 mmol HCl（緩衝 ' + f3(P.run.sb.pH - P.run.pH0) + '、稀的 ' + f3(P.run.sc.pH - P.run.pHc0) + '）', P, ['buffer-solutions-6'], true); }
{ const P = fresh(); mix(P, {}); const ok = approach(P, 'acid', R => R.sb.pH - R.pH0, -1, 0.02);
  report('7 預設，HCl 加到 pH 降 1（共 ' + f3(P.run.acid) + ' mmol，ΔpH ' + f3(P.run.sb.pH - P.run.pH0) + '）' + (ok ? '' : '（逼近失敗）'), P, ['buffer-solutions-7'], true); }
{ const P = fresh(); mix(P, {}); for (let i = 0; i < 2; i++) add(P, 'acid', 5);
  report('8 預設，加 10.0 mL 1.0 M HCl（= 10.0 mmol 醋酸根），pH ' + f3(P.run.sb.pH), P, ['buffer-solutions-8'], true); }
{ const P = fresh(); mix(P, { CHA: 0.2, CA: 0.2 }); add(P, 'acid', 1); add(P, 'acid', 1); for (let i = 0; i < 4; i++) add(P, 'base', 1);
  report('9 各 0.200 M（40 mmol），淨加 −2、+2 mmol（pH ' + f3(P.run.pHmin) + '～' + f3(P.run.pHmax) + '）', P, ['buffer-solutions-9'], true); }
{ const CA = caFor('ph', 0.2, 100, 7.4); const P = fresh(); mix(P, { sys: 'ph', CHA: 0.2, CA }); add(P, 'acid', 5); add(P, 'base', 5); add(P, 'base', 5);
  report('10 NaH2PO4 0.200 M＋Na2HPO4 ' + CA + ' M（pH ' + f3(P.run.pH0) + '），淨 −5、+5 mmol（pH ' + f3(P.run.pHmin) + '～' + f3(P.run.pHmax) + '）', P, ['buffer-solutions-10'], true); }
{ const P = fresh(); mix(P, { CHA: 0.1775, CA: 0.1775 }); add(P, 'acid', 1); add(P, 'acid', 1); for (let i = 0; i < 4; i++) add(P, 'base', 1);
  report('11 各 0.1775 M（35.5 mmol），淨 −2、+2 mmol（pH ' + f3(P.run.pHmin) + '～' + f3(P.run.pHmax) + '）', P, ['buffer-solutions-9', 'buffer-solutions-11'], true); }
{ // 11 的反例：35.0 mmol 但比例 1.2 : 1 → 做不到；36.5 mmol → 超過門檻
  const P = fresh(); mix(P, { CHA: 0.159, CA: 0.191 }); add(P, 'acid', 1); add(P, 'acid', 1); for (let i = 0; i < 4; i++) add(P, 'base', 1);
  const Q = fresh(); mix(Q, { CHA: 0.1825, CA: 0.1825 }); add(Q, 'acid', 1); add(Q, 'acid', 1); for (let i = 0; i < 4; i++) add(Q, 'base', 1);
  const okP = !P.events.includes('buffer-solutions-11'), okQ = Q.events.includes('buffer-solutions-9') && !Q.events.includes('buffer-solutions-11');
  console.log('  ' + (okP && okQ ? '✓' : '✗') + ' 11 的反例：35.0 mmol 比例 1.2 : 1（pH ' + f3(P.run.pHmin) + '～' + f3(P.run.pHmax) + '）不算；36.5 mmol 只完成 9');
  if (!(okP && okQ)) bad++;
}

// ---------- 隱藏任務（每個都檢查沒有順便完成別的隱藏任務） ----------
console.log('\n〔隱藏任務〕');
{ const CA = caFor('ph', 0.1, 100, 7); const P = fresh(); mix(P, { sys: 'ph', CA });
  report('h1 NaH2PO4 0.100 M＋Na2HPO4 ' + CA + ' M → pH ' + f3(P.run.pH0), P, ['buffer-solutions-h1'], true); }
{ const tgt = B.pH(B.compareSol({ sys: 'ac', CHA: 0.05, CA: 0.1, V0: 100, comp: 'acid' }, B.make('ac', 0.05, 0.1, 100))) + 3;
  const CA = caFor('ac', 0.05, 100, tgt); const P = fresh(); mix(P, { CHA: 0.05, CA, comp: 'acid' });
  report('h2 醋酸 0.050 M＋醋酸鈉 ' + CA + ' M，對照「只有醋酸」：pH 差 ' + f3(P.run.pH0 - P.run.pHc0), P, ['buffer-solutions-h2'], true); }
{ const P = fresh(); mix(P, {}); add(P, 'base', 5); add(P, 'base', 5);
  report('h3 預設，加 10.0 mmol NaOH（= 醋酸），pH ' + f3(P.run.sb.pH), P, ['buffer-solutions-h3'], true); }
{ const P = fresh(); mix(P, { CHA: 1.4e-4, CA: 1e-4, V0: 50 }); add(P, 'water'); add(P, 'water');
  report('h4 醋酸 1.4e-4 M＋醋酸鈉 1.0e-4 M（pH ' + f3(P.run.pH0) + '，pKa ' + f3(B.pKa('ac')) + '）、50 mL，加水兩次（3 倍）：ΔpH ' + f3(P.run.sb.pH - P.run.pH0), P, ['buffer-solutions-h4'], true); }
{ const P = fresh(); P.cs = 2; mix(P, { sys: 'ph' }); const ok = approach(P, 'base', R => R.sb.pH, B.pKas('ph')[2], 0.05, [2, 1, 0.1]);
  report('h5 磷酸各 0.10 M，2.0 M NaOH 加到 pH ' + f3(P.run.sb.pH) + '（pKa3 ' + f3(B.pKas('ph')[2]) + '，共 ' + f3(P.run.base) + ' mmol）' + (ok ? '' : '（逼近失敗）'), P, ['buffer-solutions-h5'], true); }
{ const P = fresh(); P.cs = 2; mix(P, { sys: 'ph' }); const ok = approach(P, 'acid', R => R.sb.pH, B.pKas('ph')[0], 0.05, [2, 1, 0.1]);
  report('h5 另一邊：2.0 M HCl 加到 pH ' + f3(P.run.sb.pH) + '（pKa1 ' + f3(B.pKas('ph')[0]) + '）' + (ok ? '' : '（逼近失敗）'), P, ['buffer-solutions-h5'], true); }
{ const P = fresh(); mix(P, { V0: 50, comp: 'acid' }); add(P, 'water'); add(P, 'water'); add(P, 'water');
  report('h6 50 mL，對照「只有醋酸」，加水到 4 倍：右杯 ΔpH ' + f3(P.run.sc.pH - P.run.pHc0) + '（½ log 4 = 0.301）', P, ['buffer-solutions-h6'], true); }
{ const P = fresh(); mix(P, { sys: 'nh', V0: 40, comp: 'acid' }); add(P, 'water'); add(P, 'water'); add(P, 'water'); add(P, 'water');
  report('h6 另一種：40 mL，對照「只有氯化銨」，加水到 5 倍：右杯 ΔpH ' + f3(P.run.sc.pH - P.run.pHc0) + '（½ log 5 = 0.349）', P, ['buffer-solutions-h6'], true); }
{ const P = fresh(); mix(P, { sys: 'ph', V0: 50, comp: 'acid' }); add(P, 'water'); add(P, 'water'); add(P, 'water');
  report('h7 磷酸 50 mL，對照「只有 NaH2PO4」，加水到 4 倍：右杯 ΔpH ' + f3(P.run.sc.pH - P.run.pHc0), P, ['buffer-solutions-h7'], true); }
{ const P = fresh(); mix(P, { CA: 0.009 }); const ok = approach(P, 'base', R => R.sb.pH, B.pKa('ac'), 0.005, [1, 0.1, 0.01]);
  report('h8 醋酸 0.100 M＋醋酸鈉 0.009 M（pH ' + f3(P.run.pH0) + '），NaOH 調到 pH ' + f3(P.run.sb.pH) + '（pKa ' + f3(B.pKa('ac')) + '）' + (ok ? '' : '（逼近失敗）'), P, ['buffer-solutions-h8'], true); }
{ const P = fresh(); mix(P, {}); const ok = approach(P, 'base', R => R.sb.pH, 7, 0.01, [1, 0.1, 0.01]);
  report('h9 預設，NaOH 加到 pH ' + f3(P.run.sb.pH) + '（共 ' + f3(P.run.base) + ' mmol，只差醋酸 ' + f3(10 - P.run.base) + ' mmol）' + (ok ? '' : '（逼近失敗）'), P, ['buffer-solutions-h9'], true); }
{ const P = fresh(); mix(P, { sys: 'nh' }); const ok = approach(P, 'acid', R => R.sb.pH, 7, 0.01, [1, 0.1, 0.01]);
  report('h9 另一種：氨緩衝溶液，HCl 加到 pH ' + f3(P.run.sb.pH) + (ok ? '' : '（逼近失敗）'), P, ['buffer-solutions-h9'], true); }
{ const P = fresh(); mix(P, { CHA: 0.075, CA: 0.125 }); add(P, 'acid', 5);
  report('h10 醋酸 0.075 M＋醋酸鈉 0.125 M（pH ' + f3(P.run.pH0) + '），加 5.00 mmol HCl → pH ' + f3(P.run.sb.pH) + '（對稱：' + f3((P.run.sb.pH - B.pKa('ac')) + (P.run.pH0 - B.pKa('ac'))) + '）', P, ['buffer-solutions-h10'], true); }

// ---------- 反例：條件邊界 ----------
console.log('\n〔反例〕');
function none(name, fn, ids) {
  const P = fresh(); fn(P);
  const hit = P.events.filter(id => ids.includes(id));
  console.log('  ' + (hit.length ? '✗' : '✓') + ' ' + name + '：' + (hit.length ? '完成了 ' + hit.join('、') : '不算'));
  if (hit.length) bad++;
}
none('h2：氨緩衝溶液＋「只有氯化銨」（pH 差 4 以上，但不是醋酸）', P => mix(P, { sys: 'nh', comp: 'acid' }), ['buffer-solutions-h2']);
none('h2：醋酸 0.050 M＋醋酸鈉 0.500 M（pH 差只有 2.7）', P => mix(P, { CHA: 0.05, CA: 0.5, comp: 'acid' }), ['buffer-solutions-h2']);
none('h4：各 1.0e-4 M（起點偏離 pKa 0.08）加水到 3 倍', P => { mix(P, { CHA: 1e-4, CA: 1e-4, V0: 50 }); add(P, 'water'); add(P, 'water'); }, ['buffer-solutions-h4']);
none('7：只有 1 mmol 的稀緩衝溶液加酸降 1', P => { mix(P, { CHA: 0.005, CA: 0.005 }); approach(P, 'acid', R => R.sb.pH - R.pH0, -1, 0.02); }, ['buffer-solutions-7']);
none('h4：0.10 M 的緩衝溶液加水到 2.5 倍', P => { mix(P, { V0: 100 }); add(P, 'water'); }, ['buffer-solutions-h4']);
none('h4：先加過酸再加水', P => { mix(P, { CHA: 1.4e-4, CA: 1e-4, V0: 50 }); add(P, 'acid', 0.05); add(P, 'water'); add(P, 'water'); }, ['buffer-solutions-h4']);
none('h6：醋酸只稀釋到 3 倍', P => { mix(P, { V0: 50, comp: 'acid' }); add(P, 'water'); add(P, 'water'); }, ['buffer-solutions-h6']);
none('h7：對照「只有 Na2HPO4」稀釋 4 倍（pH 改變 0.1）', P => { mix(P, { sys: 'ph', V0: 50, comp: 'base' }); add(P, 'water'); add(P, 'water'); add(P, 'water'); }, ['buffer-solutions-h7']);
none('h8：從 pH = pKa 出發來回加（起點不夠歪）', P => { mix(P, {}); add(P, 'acid', 1); add(P, 'base', 1); }, ['buffer-solutions-h8']);
none('h9：醋酸鈉比例 200 : 1 直接配到 pH 7 附近再加一滴（起點已在範圍外）', P => { mix(P, { CHA: 0.001, CA: 0.182 }); add(P, 'base', 0.05); add(P, 'acid', 0.05); }, ['buffer-solutions-h9']);
none('h10：加入量只有總量的 10%（太少）', P => { mix(P, { CHA: 0.09, CA: 0.11 }); add(P, 'acid', 1); add(P, 'acid', 1); }, ['buffer-solutions-h10']);
none('h3／8：先加一點酸再用鹼中和（不是單一方向）', P => { mix(P, {}); add(P, 'acid', 0.05); add(P, 'base', 5); add(P, 'base', 5); }, ['buffer-solutions-h3']);

// ---------- 每一個任務都至少完成一次 ----------
console.log('');
const miss = missions.filter(m => !doneEver[m.id]).map(m => m.id);
console.log((miss.length ? '✗ 沒有證明的任務：' + miss.join('、') : '✓ 全部 ' + missions.length + ' 個任務（一般 ' + missions.filter(m => !m.hidden).length + '、隱藏 ' + missions.filter(m => m.hidden).length + '）都證明做得到'));
if (miss.length) bad++;
const lv = missions.filter(m => m.hidden).map(m => m.level);
const lvOk = lv.length === 10 && Math.min.apply(null, lv) >= 3 && Math.max.apply(null, lv) <= 10 && lv.filter(x => x >= 7).length >= 3;
console.log((lvOk ? '✓' : '✗') + ' 隱藏任務等級：' + lv.join('、') + '（7 級以上 ' + lv.filter(x => x >= 7).length + ' 個）');
if (!lvOk) bad++;
console.log(bad ? '\n✗ ' + bad + ' 項沒通過' : '\n全部通過');
process.exit(bad ? 1 : 0);
