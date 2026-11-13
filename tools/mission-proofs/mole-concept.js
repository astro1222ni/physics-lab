/* 任務可達成的證明腳本。用法：node tools/mission-proofs/mole-concept.js
 * 用化學核心模擬頁面（js/mole-concept.js）的操作與事件：
 *   天平：每盤是「物質＋單位＋數字」（數字照頁面的小數位數四捨五入：g 4 位、mol 6 位、個數 0 位、體積 6 位；
 *         質量限制在 10^-4 – 10^3 g），任一盤改變就送 'weigh'（MoleCore.weighData）。
 *   放大鏡：拖視野邊長送 'zoom'（src 'zoom'），按「對切一刀」送 'zoom'（src 'cut'）。
 *   油膜法：與頁面同一套 session／tray／calibrate／drip／measure／analyze／filmData；用不同的亂數起點統計成功率。
 * 確認每個任務都做得到、預設狀態不會觸發任務、每個隱藏任務的做法不會順便完成別的隱藏任務、隨機亂按不會完成隱藏任務。
 * 修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(__ROOT + 'js/mole-concept-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({ mem: {} }, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/mole-concept.js');

let bad = 0;
const done = {};
const hid = id => /-h\d+$/.test(id);
function fresh() { missions.forEach(m => { m.done = false; m.mem = {}; }); }

// ---------- 模擬頁面 ----------
const DEC = { g: 4, mol: 6, N: 0, V: 6 };
function newPage() {
  return { events: [], cond: 'stp', A: { id: 'Cu', unit: 'mol', v: 1 }, B: { id: 'Al', unit: 'g', v: 20 }, zid: 'H2O', L: 1e7, V0: 0.05, cuts: 0, sess: C.createSession(), rows: [], cals: {} };
}
function emit(P, type, data) {
  const ev = { type, data };
  missions.forEach(m => { if (!m.done && m.check(ev, m.mem)) { m.done = true; P.events.push(m.id); } });
}
function round(v, d) { return +(+v).toFixed(d); }
/** 一盤的數字（照頁面：四捨五入、夾在質量 10^-4 – 10^3 g 之間） */
function clampPan(P, p) {
  const s = C.SUB[p.id], k = C.perMol(s, p.unit, P.cond) / s.M;
  p.v = round(Math.min(1e3 * k, Math.max(1e-4 * k, p.v)), DEC[p.unit]);
}
function sampleOf(P, p) { const s = C.SUB[p.id]; const r = C.sample(s, C.toMol(s, p.unit, p.v, P.cond), P.cond); r.unit = p.unit; return r; }
/** 設定一盤（物質、單位、數字）並送出事件 */
function pan(P, which, id, unit, v) {
  P[which] = { id, unit, v };
  clampPan(P, P[which]);
  emit(P, 'weigh', C.weighData(sampleOf(P, P.A), sampleOf(P, P.B), P.cond));
}
function weigh(P, a, b, cond) {
  if (cond) P.cond = cond;
  pan(P, 'A', a[0], a[1], a[2]);
  pan(P, 'B', b[0], b[1], b[2]);
  return { a: sampleOf(P, P.A), b: sampleOf(P, P.B) };
}
function zoomTo(P, id, L) { P.zid = id; P.cuts = 0; P.L = round(L, 4); emit(P, 'zoom', C.zoomData(C.ZOOM[id], P.L, P.V0, 0, 'zoom')); }
function cut(P, k) { P.cuts = k; emit(P, 'zoom', C.zoomData(C.ZOOM[P.zid], P.L, P.V0, k, 'cut')); }
// 油膜
function tray(P, o) { P.o = Object.assign({ dropper: 'mid', D: 500, powder: 'thin' }, o); P.tray = C.newTray(P.sess, P.o); }
function calib(P, dropper, V) { P.cals[dropper] = C.calibrate(P.sess, dropper, V); }
function drops(P, n) { for (let i = 0; i < n; i++) C.drip(P.sess, P.tray); }
function measure(P, grid) {
  const cal = P.cals[P.tray.dropper];
  const r = C.measure(P.tray, grid || 1, cal || null);
  P.rows.push(r);
  return r;
}
function calc(P, meth, k) {
  const res = C.analyze(P.rows, meth, k == null ? 1 : k);
  if (!res) return null;
  emit(P, 'film', C.filmData(res, P.rows));
  return res;
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
const pc = x => (x >= 0 ? '+' : '−') + (Math.abs(x) * 100).toFixed(2) + '%';
const sg = (x, n) => (+x.toPrecision(n || 4)).toString();

// ---------- 0. 預設狀態 ----------
fresh();
let P = newPage();
{
  // 頁面一開始不送事件（使用者沒操作）；這裡假設使用者第一次操作只「碰了一下」預設值，看會不會觸發
  emit(P, 'weigh', C.weighData(sampleOf(P, P.A), sampleOf(P, P.B), P.cond));
  emit(P, 'zoom', C.zoomData(C.ZOOM.H2O, P.L, P.V0, 0, 'zoom'));
  tray(P); drops(P, 1); measure(P, 1);
  const before = P.events.slice();
  if (before.length) { console.log('  ✗ 預設的天平（銅 1 mol、鋁 20 g）與放大鏡觸發了任務：' + before.join('、')); bad++; }
  else console.log('  ✓ 預設的天平（銅 1 mol 對 鋁 20 g）、放大鏡（1 cm 視野、0.05 mL 水滴）、滴一滴量面積都不觸發任務');
}

// ---------- 1. 一般任務：天平 ----------
fresh(); P = newPage();
let w = weigh(P, ['Cu', 'g', 10], ['Al', 'g', 10]);
report('A 銅 10 g、B 鋁 10 g：質量差 ' + sg(w.b.m - w.a.m) + ' g', P, ['mole-concept-1']);

fresh(); P = newPage();
const gNaCl = round(0.25 * C.SUB.NaCl.M, 4);
w = weigh(P, ['NaCl', 'g', gNaCl], ['Al', 'g', 20]);
report('A 氯化鈉用「克」秤 ' + gNaCl + ' g → ' + sg(w.a.n, 6) + ' mol', P, ['mole-concept-2']);
// 對照：用「莫耳」直接設 0.25 mol 不算
fresh(); P = newPage();
weigh(P, ['NaCl', 'mol', 0.25], ['Al', 'g', 20]);
console.log('  ' + (P.events.includes('mole-concept-2') ? '✗' : '✓') + ' 對照：單位用「莫耳」直接設 0.250 mol 不算任務 2');
if (P.events.includes('mole-concept-2')) bad++;

fresh(); P = newPage();
w = weigh(P, ['H2', 'mol', 1], ['Au', 'mol', 1]);
report('A 氫氣 1 mol、B 金 1 mol：粒子數相同、質量比 ' + sg(w.b.m / w.a.m, 3), P, ['mole-concept-3']);

fresh(); P = newPage();
w = weigh(P, ['H2', 'V', 22.4], ['CO2', 'V', 22.4]);
report('A 氫氣 22.4 L、B 二氧化碳 22.4 L（STP）：質量比 ' + sg(w.b.m / w.a.m, 3), P, ['mole-concept-5']);

fresh(); P = newPage();
w = weigh(P, ['H2O', 'mol', 2], ['NH3', 'mol', 1.5]);
report('A 水 2 mol（6 mol 原子）、B 氨 1.5 mol（6 mol 原子）：粒子數比 ' + sg(w.a.N / w.b.N, 3), P, ['mole-concept-6']);

// ---------- 2. 一般任務：放大鏡 ----------
fresh(); P = newPage();
const dW = round(C.spacing(C.ZOOM.H2O), 4);
zoomTo(P, 'H2O', 1e4); zoomTo(P, 'H2O', 10); zoomTo(P, 'H2O', dW);
report('水：視野邊長拉到 ' + dW + ' nm，視野中 ' + sg(C.countInCube(C.ZOOM.H2O, dW), 3) + ' 個分子', P, ['mole-concept-4']);

// ---------- 3. 一般任務：油膜法（不同的亂數起點統計） ----------
/** strat(P) 做完一次學生的操作；回傳成功次數 */
function trials(name, ids, strat, N, need) {
  let ok = 0, worst = 0, extraH = 0, firstP = null;
  for (let s = 0; s < N; s++) {
    fresh(); const Q = newPage();
    Q.sess.drop = 1000 * s + 17; Q.sess.tray = 7 * s + 3;
    const res = strat(Q);
    if (res) worst = Math.max(worst, Math.abs(res.hErr));
    if (ids.every(id => Q.events.includes(id))) { ok++; if (!firstP) firstP = Q; }
    if (Q.events.some(x => hid(x) && ids.indexOf(x) < 0)) extraH++;
  }
  const pass = ok >= N * need && !extraH;
  console.log('  ' + (pass ? '✓' : '✗') + ' ' + name + '：' + N + ' 次中成功 ' + ok + ' 次（' + (ok / N * 100).toFixed(0) + '%），h 最大誤差 ' + (worst * 100).toFixed(2) + '%' + (extraH ? '　← ' + extraH + ' 次順便完成隱藏任務' : '') +
    (firstP ? '；完成：' + firstP.events.join('、') : ''));
  if (pass) ids.forEach(id => { done[id] = true; }); else bad++;
}
trials('任務 7、8：不校正、1:500 滴一滴、1 cm 格、最後一次、k = 1', ['mole-concept-7', 'mole-concept-8'], Q => { tray(Q); drops(Q, 1); measure(Q, 1); return calc(Q, 'last', 1); }, 100, 0.9);
// 直線斜率：校正 5 mL，1:2000，同一盤 1、2、3、4 滴各量一次
function fitStrat(grid, k) {
  return Q => { calib(Q, 'mid', 5); tray(Q, { D: 2000 }); for (let n = 0; n < 4; n++) { drops(Q, 1); measure(Q, grid); } return calc(Q, 'fit', k); };
}
trials('任務 9：校正 5 mL、1:2000、同一盤 1–4 滴各量一次（1 cm 格）、直線斜率', ['mole-concept-9'], fitStrat(1, 1), 100, 0.9);
// 更準：1:4000、同一盤 1–10 滴每滴都量（0.5 cm 格），紀錄多、每滴的差異平均掉
function fineStrat(k) {
  return Q => { calib(Q, 'mid', 5); tray(Q, { D: 4000 }); for (let n = 0; n < 10; n++) { drops(Q, 1); measure(Q, 0.5); } return calc(Q, 'fit', k); };
}
trials('任務 10：校正 5 mL、1:4000、同一盤 1–10 滴每滴量一次（0.5 cm 格）、直線斜率、k = 1.68', ['mole-concept-10'], fineStrat(1.68), 100, 0.6);
trials('任務 11：同上、直線斜率（不成功就「全部清除」、換一盤再做）', ['mole-concept-11'], fineStrat(1), 100, 0.6);
// 對照：碰盤邊、粉太厚、沒校正的直線不算
fresh(); P = newPage();
tray(P, { dropper: 'wide', D: 200 }); drops(P, 1); measure(P, 1); let rr = calc(P, 'last', 1);
console.log('  ' + (P.events.length ? '✗' : '✓') + ' 對照：1:200 粗口滴管一滴，油膜碰到盤邊（h 誤差 ' + pc(rr.hErr) + '）不算任何任務');
if (P.events.length) bad++;
fresh(); P = newPage();
tray(P, { powder: 'thick' }); drops(P, 1); measure(P, 1); rr = calc(P, 'last', 1);
console.log('  ' + (P.events.length ? '✗' : '✓') + ' 對照：粉撒太厚，油膜推不開（h 誤差 ' + pc(rr.hErr) + '）不算任何任務');
if (P.events.length) bad++;

// ---------- 4. 隱藏任務（每個做法只完成它自己這個隱藏任務） ----------
fresh(); P = newPage();
w = weigh(P, ['C', 'g', 12], ['Al', 'g', 20]);
reportH('A 石墨 12.0000 g', P, 'mole-concept-h1');

fresh(); P = newPage();
weigh(P, ['H2', 'V', 2], ['O2', 'V', 1]);
reportH('A 氫氣 2 L、B 氧氣 1 L（體積比 2 : 1）', P, 'mole-concept-h2');

fresh(); P = newPage();
const aCu = C.ZOOM.Cu.lattice;
zoomTo(P, 'Cu', 1); zoomTo(P, 'Cu', aCu);
reportH('銅：視野邊長 = 晶格常數 ' + aCu + ' nm，視野中 ' + sg(C.countInCube(C.ZOOM.Cu, aCu), 4) + ' 個原子（一個面心立方晶胞）', P, 'mole-concept-h3');

fresh(); P = newPage();
w = weigh(P, ['Hg', 'mol', 1], ['H2O', 'mol', 1]);
reportH('A 汞 1 mol、B 水 1 mol：質量比 ' + sg(w.a.m / w.b.m, 3) + '、體積 ' + sg(w.a.V, 4) + ' 對 ' + sg(w.b.V, 4) + ' cm³', P, 'mole-concept-h4');

fresh(); P = newPage();
w = weigh(P, ['Fe', 'mol', 1], ['Cu', 'mol', 1]);
reportH('A 鐵 1 mol、B 銅 1 mol：體積 ' + sg(w.a.V, 5) + ' 對 ' + sg(w.b.V, 5) + ' cm³', P, 'mole-concept-h5');

trials('隱藏 h6：一般與細口兩支滴管各自校正 5 mL，各用 1:4000 一盤滴 12 滴量一次（1 cm 格）、最後一次', ['mole-concept-h6'], Q => {
  let r;
  ['mid', 'fine'].forEach(d => { calib(Q, d, 5); tray(Q, { dropper: d, D: 4000 }); drops(Q, 12); Q.rows = []; measure(Q, 1); r = calc(Q, 'last', 1); });
  return r;
}, 100, 0.7);
// 對照：同一支滴管兩次、或沒校正不算
fresh(); P = newPage();
['mid', 'mid'].forEach(d => { calib(P, d, 5); tray(P, { dropper: d, D: 4000 }); drops(P, 12); P.rows = []; measure(P, 1); calc(P, 'last', 1); });
console.log('  ' + (P.events.includes('mole-concept-h6') ? '✗' : '✓') + ' 對照：同一支滴管做兩次不算 h6');
if (P.events.includes('mole-concept-h6')) bad++;
fresh(); P = newPage();
['mid', 'fine'].forEach(d => { tray(P, { dropper: d, D: 4000 }); drops(P, 12); P.rows = []; measure(P, 1); calc(P, 'last', 1); });
console.log('  ' + (P.events.includes('mole-concept-h6') ? '✗' : '✓') + ' 對照：兩支滴管都沒校正（用標示 0.02 mL）不算 h6');
if (P.events.includes('mole-concept-h6')) bad++;

fresh(); P = newPage();
w = weigh(P, ['N2', 'g', 28], ['CO', 'g', 28]);
reportH('A 氮氣 28 g、B 一氧化碳 28 g：粒子數差 ' + pc(w.b.N / w.a.N - 1), P, 'mole-concept-h7');

fresh(); P = newPage();
weigh(P, ['N2', 'V', 0.001], ['Al', 'g', 20], 'stp');
reportH('STP 下 A 氮氣 0.001 L（1 cm³）：' + sampleOf(P, P.A).N.toExponential(4) + ' 個分子（洛施密特常數）', P, 'mole-concept-h8');

fresh(); P = newPage();
{
  const N0 = C.countInVolume(C.ZOOM.H2O, P.V0), K = C.maxCuts(N0);
  for (let k = 1; k <= K; k++) cut(P, k);
  reportH('0.05 mL 的水滴按「對切一刀」' + K + ' 次：剩 ' + sg(N0 / Math.pow(2, K), 3) + ' 個分子', P, 'mole-concept-h9');
  fresh(); const Q = newPage();
  cut(Q, 3); cut(Q, K);
  console.log('  ' + (Q.events.includes('mole-concept-h9') ? '✗' : '✓') + ' 對照：滑桿直接從 3 刀跳到 ' + K + ' 刀不算 h9');
  if (Q.events.includes('mole-concept-h9')) bad++;
}

fresh(); P = newPage();
w = weigh(P, ['H2O', 'mol', 1], ['NH3', 'mol', 1]);
reportH('A 水 1 mol、B 氨 1 mol：電子都是 ' + sg(w.a.electrons / C.NA, 4) + ' mol、質量比 ' + sg(w.a.m / w.b.m, 4), P, 'mole-concept-h10');

// ---------- 5. 一般任務的做法不會順便完成隱藏任務 ----------
{
  fresh(); const Q = newPage();
  weigh(Q, ['Cu', 'g', 10], ['Al', 'g', 10]); weigh(Q, ['NaCl', 'g', gNaCl], ['Al', 'g', 20]); weigh(Q, ['H2', 'mol', 1], ['Au', 'mol', 1]);
  weigh(Q, ['H2', 'V', 22.4], ['CO2', 'V', 22.4]); weigh(Q, ['H2O', 'mol', 2], ['NH3', 'mol', 1.5]);
  zoomTo(Q, 'H2O', dW);
  const ex = Q.events.filter(hid);
  console.log('  ' + (ex.length ? '✗' : '✓') + ' 一般任務 1–6 的做法連續做一遍：順便完成的隱藏任務 ' + (ex.join('、') || '沒有'));
  if (ex.length) bad++;
}

// ---------- 6. 隨機亂按（像試玩）不會完成隱藏任務 ----------
{
  let rs = 12345;
  const rnd = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
  const ids = C.SUBS.map(s => s.id), units = ['g', 'mol', 'N', 'V'], zs = Object.keys(C.ZOOM);
  const hits = {};
  const RUNS = 400, STEPS = 60;
  for (let r = 0; r < RUNS; r++) {
    fresh(); const Q = newPage();
    for (let k = 0; k < STEPS; k++) {
      const x = rnd();
      if (x < 0.5) {
        // 改天平：隨機物質、單位，數字用滑桿位置（質量 10^-4 – 10^3 g 的對數）
        const which = rnd() < 0.5 ? 'A' : 'B', p = Q[which];
        const y = rnd();
        if (y < 0.25) p.id = ids[Math.floor(rnd() * ids.length)];
        else if (y < 0.5) { const s = C.SUB[p.id], n = C.toMol(s, p.unit, p.v, Q.cond); p.unit = units[Math.floor(rnd() * 4)]; p.v = C.fromMol(s, p.unit, n, Q.cond); }
        else if (y < 0.55) Q.cond = rnd() < 0.5 ? 'stp' : 'rt';
        else { const s = C.SUB[p.id], m = Math.pow(10, -4 + 7 * Math.round(rnd() * 1000) / 1000); p.v = C.fromMol(s, p.unit, m / s.M, Q.cond); }
        pan(Q, which, p.id, p.unit, p.v);
      } else if (x < 0.8) {
        const z = rnd() < 0.2 ? zs[Math.floor(rnd() * zs.length)] : Q.zid;
        zoomTo(Q, z, Math.pow(10, -1 + 8 * Math.round(rnd() * 1600) / 1600));
      } else {
        cut(Q, Math.round(rnd() * 90));
      }
    }
    Q.events.filter(hid).forEach(id => { hits[id] = (hits[id] || 0) + 1; });
  }
  const keys = Object.keys(hits);
  console.log('  ' + (keys.length ? '✗' : '✓') + ' 隨機亂按 ' + RUNS + ' 回 × ' + STEPS + ' 步（換物質、單位、滑桿、放大、切刀）：完成的隱藏任務 ' + (keys.map(k => k + ' ' + hits[k] + ' 次').join('、') || '沒有'));
  if (keys.length) bad++;
}

// ---------- 總結 ----------
const missing = missions.filter(m => !done[m.id]).map(m => m.id);
console.log(missing.length ? '  ✗ 沒有證明到的任務：' + missing.join('、') : '  ✓ ' + missions.length + ' 個任務都證明做得到');
if (missing.length) bad++;
const hiddenN = missions.filter(m => m.hidden);
console.log('    （一般 ' + (missions.length - hiddenN.length) + ' 個 ' + missions.filter(m => !m.hidden).reduce((a, m) => a + m.level, 0) + ' 顆星、隱藏 ' + hiddenN.length + ' 個 ' + hiddenN.reduce((a, m) => a + m.level * 2, 0) + ' 顆星；隱藏等級 ' + hiddenN.map(m => m.level).join('、') + '）');
if (bad) { console.log('失敗 ' + bad + ' 項'); process.exitCode = 1; }
