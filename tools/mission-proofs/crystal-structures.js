/* 任務可達成的證明腳本。用法：node tools/mission-proofs/crystal-structures.js
 * 用晶體核心（js/crystal-structures-core.js）模擬頁面（js/crystal-structures.js）的操作與事件：
 *   換結構、換物質、假想排法、勾選顯示項目、點原子（看配位數）→ 'cell'；疊疊看加一層 → 'stack'；
 *   記下來 → 'record'；動手算核對答案 → 'answer'。
 * 確認每個任務都做得到、預設狀態與只看不動不會觸發任務、10 個隱藏任務各自的做法不會順便完成別的隱藏任務，
 * 再用亂數亂按（像學生亂玩）確認隱藏任務不會被誤觸。修改晶體核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const CS = require(__ROOT + 'js/crystal-structures-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/crystal-structures.js');

let bad = 0;
const done = {};
const hid = id => /-h\d+$/.test(id);
function freshMissions() { missions.forEach(m => { m.done = false; }); }
const ok = (cond, msg) => { console.log('  ' + (cond ? '✓' : '✗') + ' ' + msg); if (!cond) bad++; return cond; };

// ---------- 模擬頁面（與 js/crystal-structures.js 的 setStruct／emitCell／record／addLayer／newQuiz／checkQuiz 一致） ----------
function newPage() {
  return { mode: 'cell', s: 'fcc', mat: 'Cu', hypo: false, size: 100, cut: false, coord: false, vo: { oct: false, tet: false, cube: false },
    layers: false, n: 1, view: '2d', sel: null, stack: 'A', rows: [], quiz: null, streak: 0, kinds: {}, rhoOk: {}, acted: false, events: [] };
}
function emit(P, type, data) {
  if (!P.acted) return;
  const ev = { type, data };
  missions.forEach(m => { if (!m.done && m.check(ev)) { m.done = true; P.events.push(m.id); } });
}
function cryst(P) { return CS.crystal(P.mat, P.hypo ? P.s : null); }
/** 被選的原子：頁面預設選離中心最近的（離子晶體選陽離子），點原子可換 */
function selAtom(P) {
  const cr = cryst(P), ca = cr.ca || CS.CA_IDEAL, st = CS.STRUCTS[P.s];
  const ctr = st.cell === 'cube' ? [P.n / 2, P.n / 2, P.n / 2] : [0, 0, P.n * ca / 2];
  const atoms = CS.cellAtoms(P.s, ca, P.n);
  let best = null, bd = Infinity;
  atoms.forEach((a, i) => {
    if (P.sel ? a.sp !== P.sel.sp : (st.kind === 'ionic' && a.sp !== 'c')) return;
    const d = Math.hypot(a.p[0] - ctr[0], a.p[1] - ctr[1], (a.p[2] - ctr[2]) * 1.001) + i * 1e-9;
    if (d < bd - 1e-9) { bd = d; best = a; }
  });
  if (P.sel && P.sel.i != null) { const L = atoms.filter(a => a.sp === P.sel.sp); best = L[P.sel.i % L.length]; }
  return { a: best, cn: CS.neighbors(P.s, ca, best.p, best.sp).list.length };
}
function emitCell(P) {
  if (P.mode !== 'cell') return;
  const cr = cryst(P), info = CS.stackInfo(P.stack);
  const A = P.coord ? selAtom(P) : null;
  emit(P, 'cell', { s: P.s, mat: P.mat, hypo: P.hypo, cut: P.cut, coord: P.coord, voids: Object.assign({}, P.vo), layers: P.layers && (P.s === 'fcc' || P.s === 'hcp'),
    n: P.n, size: P.size, view: P.view, selSp: A ? A.a.sp : null, selCN: A ? A.cn : null, selIn: A ? A.a.frac === 1 : null, Z: cr.Z, CN: cr.CN, pf: cr.pf, rho: cr.rho, stackType: info.type, stackN: info.n });
}
function crystalChanged(P) {
  if (P.quiz && !P.quiz.closed) { if (!P.quiz.answered) { P.streak = 0; P.kinds = {}; } P.quiz.closed = true; }
  P.sel = null;
  emitCell(P);
}
const act = {
  struct(P, s) { P.acted = true; if (s === P.s) return; if (P.hypo && CS.METALS.indexOf(s) < 0) return; P.s = s; if (!P.hypo) P.mat = CS.DEFAULT_MAT[s]; if (!(s === 'fcc' || s === 'hcp')) P.layers = false; crystalChanged(P); },
  mat(P, k) { P.acted = true; if (P.hypo) return; if (CS.MATS[k].s !== P.s) throw new Error('物質 ' + k + ' 不在 ' + P.s + ' 的選單裡'); P.mat = k; crystalChanged(P); },
  hypo(P, on) { P.acted = true; on = on && CS.METALS.indexOf(P.s) >= 0; P.hypo = on; if (!on && CS.MATS[P.mat].s !== P.s) P.mat = CS.DEFAULT_MAT[P.s]; crystalChanged(P); },
  check(P, key, v) { P.acted = true; if (key === 'oct' || key === 'tet' || key === 'cube') P.vo[key] = v; else P[key] = v; if (key === 'coord') P.sel = null; emitCell(P); },
  cells(P, n) { P.acted = true; P.n = n; P.sel = null; emitCell(P); },
  size(P, v) { P.acted = true; P.size = v; emitCell(P); },
  view(P, v) { P.acted = true; P.view = v; },
  pick(P, sp, i) {   // 點畫面上某一種原子：i 省略＝離中心最近的那一顆，i 是數字＝這一種的第 i 顆（亂按用）
    P.acted = true; if (!P.coord) return;
    const cr = cryst(P);
    if (!CS.cellAtoms(P.s, cr.ca || CS.CA_IDEAL, P.n).some(a => a.sp === sp)) return;
    P.sel = { sp, i }; emitCell(P);
  },
  mode(P, md) { P.acted = true; if (md === P.mode) return; P.mode = md; if (P.quiz && !P.quiz.closed && md !== 'cell') P.quiz.closed = true; if (md === 'cell') emitCell(P); },
  add(P, L) { P.acted = true; if (P.stack.length >= 12) return; P.stack += L; const info = CS.stackInfo(P.stack); emit(P, 'stack', { seq: P.stack, n: info.n, type: info.type, hc: info.hc, pf: info.pf, cn: info.cnMid }); },
  undo(P) { P.acted = true; if (P.stack.length <= 1) return; P.stack = P.stack.slice(0, -1); const info = CS.stackInfo(P.stack); emit(P, 'stack', { seq: P.stack, n: info.n, type: info.type, hc: info.hc, pf: info.pf, cn: info.cnMid }); },
  record(P) {
    P.acted = true;
    let r;
    if (P.mode === 'stack') { const info = CS.stackInfo(P.stack); r = { stack: P.stack, type: info.type, pf: info.pf, cn: info.cnMid }; }
    else { const cr = cryst(P); r = { s: cr.s, mat: P.mat, hypo: cr.hypo, Z: cr.Z, CN: cr.CN, pf: cr.pf, a: cr.a, r: cr.r, rho: cr.rho }; }
    P.rows.push(r); if (P.rows.length > 30) P.rows.shift();
    emit(P, 'record', { row: r, rows: P.rows.slice() });
  },
  clear(P) { P.acted = true; P.rows = []; P.stack = 'A'; P.streak = 0; P.kinds = {}; P.rhoOk = {}; P.quiz = null; },
  /** 出題（題型不適用這個物質時改成求密度，與頁面相同） */
  quiz(P, type) {
    P.acted = true;
    if (P.mode !== 'cell') return null;
    if (!CS.quizAllowed(type, P.mat)) type = 'rho';
    if (P.quiz && !P.quiz.closed && !P.quiz.answered) { P.streak = 0; P.kinds = {}; }
    P.quiz = { q: CS.quiz(type, P.mat), tries: 0, revealed: false, closed: false, answered: false };
    return P.quiz.q;
  },
  reveal(P) { P.acted = true; const Q = P.quiz; if (!Q || Q.closed || Q.answered) return; Q.revealed = true; Q.answered = true; P.streak = 0; P.kinds = {}; },
  /** 核對答案：v 是學生填的數（N_A 填 10^23 的倍數） */
  answer(P, v) {
    P.acted = true;
    const Q = P.quiz; if (!Q || Q.closed || Q.answered) return null;
    const q = Q.q;
    let ans = q.ans;
    if (q.type === 'NA') { if (v > 1e10) v = v / 1e23; ans = q.ans / 1e23; }
    const err = CS.relErr(v, ans), good = Math.abs(err) <= 0.01 && !Q.revealed;
    Q.tries++;
    if (good) { Q.answered = true; P.streak++; P.kinds[q.type] = true; if (q.type === 'rho') P.rhoOk[q.given.s] = true; } else { P.streak = 0; P.kinds = {}; }
    emit(P, 'answer', { type: q.type, mat: q.mat, s: q.given.s, err, ok: good, revealed: Q.revealed, tries: Q.tries, streak: P.streak, kinds: Object.keys(P.kinds).length, rhoStructs: Object.keys(P.rhoOk) });
    return err;
  }
};
/** 照題目給的數據「在紙上算」：學生的算法（由 Z、M、a、ρ 自己算，四位有效數字），不是直接抄核心的答案 */
function solveOnPaper(q) {
  const g = q.given, NA = 6.022e23, st = CS.STRUCTS[g.s];
  const V = a => st.cell === 'hex' ? 3 * Math.sqrt(3) / 2 * a * a * (a * g.ca) : a * a * a;   // cm³（a 以 cm 代入；六方最密用整個六角柱，Z = 6）
  const sig4 = x => +x.toPrecision(4);
  if (q.type === 'rho') return sig4(g.Z * g.M / (NA * V(g.a * 1e-10)));
  if (q.type === 'NA') return sig4(g.Z * g.M / (g.rho * V(g.a * 1e-10)) / 1e23);
  // 求半徑：由密度求 a，再由相切的方向求 r
  const Vc = g.Z * g.M / (NA * g.rho);
  let a;
  if (st.cell === 'hex') a = Math.cbrt(Vc / (3 * Math.sqrt(3) / 2 * g.ca)); else a = Math.cbrt(Vc);
  a *= 1e10;   // pm
  const rel = { sc: 0.5, bcc: Math.sqrt(3) / 4, fcc: Math.sqrt(2) / 4, hcp: 0.5, diamond: Math.sqrt(3) / 8 }[g.s];
  return sig4(a * rel);
}
/** 做一題：出題、在紙上算、核對 */
function solve(P, type, how) {
  const q = act.quiz(P, type);
  let v = solveOnPaper(q);
  if (how === 'exact') v = q.type === 'NA' ? q.ans / 1e23 : q.ans;
  const err = act.answer(P, v);
  return { q, err, v };
}
function report(name, P, id) {
  const others = P.events.filter(x => hid(x) && x !== id);
  const got = P.events.includes(id);
  const good = got && (!hid(id) || !others.length);
  console.log('  ' + (good ? '✓' : '✗') + ' ' + id + '：' + name + (got ? '' : '（沒有完成）') + (others.length ? '（順便完成了隱藏任務 ' + others.join('、') + '）' : ''));
  if (good) done[id] = true; else bad++;
}
const pc = x => (x * 100).toFixed(3) + '%';

// ---------- 0. 預設狀態、只看不動 ----------
console.log('預設狀態');
{
  freshMissions(); const P = newPage();
  emitCell(P); act.view(P, '3d');   // 沒有操作之前送事件 → 不算
  ok(P.events.length === 0, '載入後不操作：沒有任何任務完成');
  P.acted = true; emitCell(P);
  ok(P.events.length === 0, '預設（面心立方、銅、什麼都不勾）送 cell：沒有任務完成');
  act.view(P, '3d'); act.view(P, '2d'); act.size(P, 60); act.size(P, 100);
  ok(P.events.length === 0, '切換 2D／3D、改球的大小：沒有任務完成');
}

// ---------- 1. 一般任務 ----------
console.log('一般任務');
{
  freshMissions(); let P = newPage();
  act.check(P, 'cut', true);
  report('面心立方（預設）勾「只看晶胞內的部分」', P, 'crystal-structures-1');

  freshMissions(); P = newPage();
  act.struct(P, 'bcc'); act.check(P, 'coord', true);
  report('體心立方、勾「顯示配位數」：預設選中心原子，配位數 ' + selAtom(P).cn, P, 'crystal-structures-2');

  freshMissions(); P = newPage();
  act.struct(P, 'nacl'); act.check(P, 'coord', true);
  report('氯化鈉型、勾「顯示配位數」：預設選陽離子，配位數 ' + selAtom(P).cn, P, 'crystal-structures-3');

  freshMissions(); P = newPage();
  act.mode(P, 'stack'); 'BABA'.split('').forEach(L => act.add(P, L));
  report('疊疊看 ABABA（' + CS.stackInfo(P.stack).type + '）', P, 'crystal-structures-4');

  freshMissions(); P = newPage();
  act.check(P, 'oct', true); act.check(P, 'tet', true);
  report('面心立方勾八面體與四面體空隙（' + CS.voidSites('fcc', null, 1, 'oct', 0.3536).reduce((s, v) => s + v.frac, 0) + ' 個、' +
    CS.voidSites('fcc', null, 1, 'tet', 0.3536).reduce((s, v) => s + v.frac, 0) + ' 個）', P, 'crystal-structures-5');

  freshMissions(); P = newPage();
  act.mode(P, 'stack'); 'BCABC'.split('').forEach(L => act.add(P, L));
  report('疊疊看 ABCABC（' + CS.stackInfo(P.stack).type + '）', P, 'crystal-structures-6');

  freshMissions(); P = newPage();
  act.struct(P, 'sc'); act.record(P); act.struct(P, 'bcc'); act.record(P); act.struct(P, 'fcc'); act.record(P);
  report('簡單立方、體心立方、面心立方各記一筆（' + P.rows.map(r => (r.pf * 100).toFixed(2) + '%').join('、') + '）', P, 'crystal-structures-7');

  freshMissions(); P = newPage();
  let r = solve(P, 'rho');
  report('求密度：銅（紙上算 ' + r.v + '，誤差 ' + pc(r.err) + '）', P, 'crystal-structures-8');

  freshMissions(); P = newPage();
  r = solve(P, 'r');
  report('求原子半徑：銅（紙上算 ' + r.v + ' pm，誤差 ' + pc(r.err) + '）', P, 'crystal-structures-9');

  freshMissions(); P = newPage();
  r = solve(P, 'NA');
  report('求亞佛加厥數：銅（紙上算 ' + r.v + '，誤差 ' + pc(r.err) + '）', P, 'crystal-structures-10');

  freshMissions(); P = newPage();
  const e11 = [];
  ['fcc', 'bcc', 'nacl'].forEach(s => { act.struct(P, s); e11.push(pc(solve(P, 'rho').err)); });
  report('求密度：面心（銅）、體心（鐵）、氯化鈉，誤差 ' + e11.join('、'), P, 'crystal-structures-11');

  freshMissions(); P = newPage();
  const e12 = [];
  ['rho', 'r', 'NA', 'rho', 'r'].forEach(t => e12.push(pc(solve(P, t).err)));
  report('銅連續 5 題（密度、半徑、N_A、密度、半徑），誤差 ' + e12.join('、'), P, 'crystal-structures-12');
}

// ---------- 2. 隱藏任務（每一個都要做得到，而且不順便完成別的隱藏任務） ----------
console.log('隱藏任務');
{
  freshMissions(); let P = newPage();
  act.mode(P, 'stack'); 'AAAAA'.split('').forEach(L => act.add(P, L));
  report('疊疊看 AAAAAA（簡單六方）', P, 'crystal-structures-h1');

  freshMissions(); P = newPage();
  act.struct(P, 'bcc'); act.mat(P, 'Fe912'); act.record(P);
  act.struct(P, 'fcc'); act.mat(P, 'Fe916'); act.record(P);
  { const L = P.rows.slice(-2); report('912 °C 的 α 鐵與 916 °C 的 γ 鐵相鄰記下（每個鐵原子的體積 ' + (L[0].a ** 3 / 2).toFixed(0) + ' → ' + (L[1].a ** 3 / 4).toFixed(0) + ' pm³，縮了 ' + pc(1 - (L[1].a ** 3 / 4) / (L[0].a ** 3 / 2)) + '）', P, 'crystal-structures-h2'); }

  freshMissions(); P = newPage();
  act.mode(P, 'stack'); 'BACABAC'.split('').forEach(L => act.add(P, L));
  report('疊疊看 ABACABAC（' + CS.stackInfo(P.stack).type + '）', P, 'crystal-structures-h3');

  freshMissions(); P = newPage();
  act.mode(P, 'stack'); 'BCBACBABCAC'.split('').forEach(L => act.add(P, L));
  report('疊疊看 ' + P.stack + '（' + CS.stackInfo(P.stack).type + '、堆積率 ' + (CS.stackInfo(P.stack).pf * 100).toFixed(2) + '%）', P, 'crystal-structures-h4');

  freshMissions(); P = newPage();
  act.struct(P, 'sc'); act.record(P); act.hypo(P, true); act.struct(P, 'fcc'); act.record(P);
  { const L = P.rows.slice(-2); report('釙：簡單立方，再假想排成面心立方，密度比 ' + (L[0].rho / L[1].rho).toFixed(4) + '（1/√2 = 0.7071）', P, 'crystal-structures-h5'); }

  freshMissions(); P = newPage();
  act.struct(P, 'diamond'); act.mat(P, 'Si');
  let r = solve(P, 'NA');
  report('矽求亞佛加厥數（紙上算 ' + r.v + '，誤差 ' + pc(r.err) + '）', P, 'crystal-structures-h6');

  freshMissions(); P = newPage();
  act.struct(P, 'hcp'); act.mat(P, 'Zn');
  r = solve(P, 'r');
  report('鋅求原子半徑（c/a = ' + (CS.MATS.Zn.c / CS.MATS.Zn.a).toFixed(3) + '，紙上算 ' + r.v + ' pm，誤差 ' + pc(r.err) + '）', P, 'crystal-structures-h7');

  freshMissions(); P = newPage();
  act.mode(P, 'stack'); 'BCABC'.split('').forEach(L => act.add(P, L));
  act.mode(P, 'cell'); act.check(P, 'layers', true);
  report('先疊 ABCABC，回晶胞勾「標出最密堆積層」', P, 'crystal-structures-h8');

  freshMissions(); P = newPage();
  act.struct(P, 'cscl'); act.cells(P, 2); act.check(P, 'coord', true); act.pick(P, 'a');
  report('氯化銫型 2×2×2、顯示配位數、點正中央（八個晶胞共用角落）的氯離子（配位數 ' + selAtom(P).cn + '）', P, 'crystal-structures-h9');

  freshMissions(); P = newPage();
  const e10 = [];
  CS.ORDER.forEach(s => { act.struct(P, s); e10.push(s + ' ' + pc(solve(P, 'rho').err)); });
  report('八種結構都答對求密度（' + e10.join('、') + '）', P, 'crystal-structures-h10');
}

// ---------- 3. 容易混淆的做法：不可以完成隱藏任務 ----------
console.log('不該觸發的做法');
{
  const none = (name, P, ids) => ok(!P.events.some(x => ids.indexOf(x) >= 0), name + '：沒有完成 ' + ids.join('、') + (P.events.length ? '（完成的是：' + P.events.join('、') + '）' : ''));
  let P;
  freshMissions(); P = newPage(); act.mode(P, 'stack'); 'BCABCABCABC'.split('').forEach(L => act.add(P, L));
  none('疊 12 層 ABC…（立方最密）', P, ['crystal-structures-h3', 'crystal-structures-h4']);
  freshMissions(); P = newPage(); act.mode(P, 'stack'); 'BABABABABAB'.split('').forEach(L => act.add(P, L));
  none('疊 12 層 AB…（六方最密）', P, ['crystal-structures-h3', 'crystal-structures-h4']);
  freshMissions(); P = newPage(); act.mode(P, 'stack'); 'BACABACABAC'.split('').forEach(L => act.add(P, L));
  none('疊 12 層 ABAC…（雙六方）', P, ['crystal-structures-h4']);
  freshMissions(); P = newPage(); act.mode(P, 'stack'); 'BCBACBA'.split('').forEach(L => act.add(P, L));
  none('混合排列只疊 8 層', P, ['crystal-structures-h3', 'crystal-structures-h4']);
  freshMissions(); P = newPage(); act.mode(P, 'stack'); 'BBBBB'.split('').forEach(L => act.add(P, L));
  none('ABBBBB（有疊在正上方，但不是每層）', P, ['crystal-structures-h1']);
  freshMissions(); P = newPage(); act.mode(P, 'stack'); 'AAAA'.split('').forEach(L => act.add(P, L));
  none('AAAAA 只疊 5 層', P, ['crystal-structures-h1']);
  freshMissions(); P = newPage(); act.mode(P, 'stack'); 'BCABC'.split('').forEach(L => act.add(P, L)); act.mode(P, 'cell'); act.struct(P, 'hcp'); act.check(P, 'layers', true);
  none('疊好 ABCABC，但在六方最密勾分層', P, ['crystal-structures-h8']);
  freshMissions(); P = newPage(); act.check(P, 'layers', true);
  none('面心立方勾分層，但沒先疊過', P, ['crystal-structures-h8']);
  freshMissions(); P = newPage(); act.struct(P, 'cscl'); act.check(P, 'coord', true);
  none('氯化銫型顯示配位數（預設選銫離子）', P, ['crystal-structures-h9']);
  freshMissions(); P = newPage(); act.struct(P, 'cscl'); act.check(P, 'coord', true); act.pick(P, 'a');
  none('氯化銫型 1 個晶胞點角落的氯離子（配位數 ' + selAtom(P).cn + '，但它的鄰居在別的晶胞）', P, ['crystal-structures-h9']);
  freshMissions(); P = newPage(); act.struct(P, 'cscl'); act.cells(P, 2); act.check(P, 'coord', true); act.pick(P, 'a', 0);
  none('氯化銫型 2×2×2 點最外角的氯離子', P, ['crystal-structures-h9']);
  freshMissions(); P = newPage(); act.struct(P, 'nacl'); act.cells(P, 2); act.check(P, 'coord', true); act.pick(P, 'a');
  none('氯化鈉型點氯離子（配位數 6）', P, ['crystal-structures-h9']);
  freshMissions(); P = newPage(); act.struct(P, 'bcc'); act.record(P); act.mat(P, 'Fe912'); act.record(P); act.struct(P, 'fcc'); act.record(P);
  none('室溫鐵、912 °C 鐵、銅相鄰記下', P, ['crystal-structures-h2']);
  freshMissions(); P = newPage(); act.struct(P, 'bcc'); act.mat(P, 'Fe912'); act.record(P); act.struct(P, 'fcc'); act.record(P); act.mat(P, 'Fe916'); act.record(P);
  none('912 °C 鐵、銅、916 °C 鐵（中間隔一筆）', P, ['crystal-structures-h2']);
  freshMissions(); P = newPage(); act.struct(P, 'sc'); act.record(P); act.struct(P, 'fcc'); act.record(P);
  none('釙（簡單立方）、銅（面心立方）兩種真實的', P, ['crystal-structures-h5']);
  freshMissions(); P = newPage(); act.hypo(P, true); act.struct(P, 'bcc'); act.record(P); act.struct(P, 'fcc'); act.record(P);
  none('銅假想成體心再回面心', P, ['crystal-structures-h5']);
  freshMissions(); P = newPage(); act.hypo(P, true); act.struct(P, 'sc'); act.record(P); act.struct(P, 'fcc'); act.record(P);
  none('銅先記假想的簡單立方、再記真實的面心立方（順序反了）', P, ['crystal-structures-h5']);
  freshMissions(); P = newPage(); act.record(P); act.hypo(P, true); act.struct(P, 'sc'); act.record(P);
  none('銅先記真實的面心立方、再記假想的簡單立方（反方向）', P, ['crystal-structures-h5']);
  freshMissions(); P = newPage(); act.struct(P, 'diamond'); act.mat(P, 'Si');
  act.quiz(P, 'NA'); act.reveal(P); act.answer(P, CS.quiz('NA', 'Si').ans / 1e23); act.quiz(P, 'NA'); act.answer(P, CS.quiz('NA', 'Si').ans / 1e23 * 1.003);
  none('矽求 N_A：先看答案再填（揭曉的題目不能再核對），下一題誤差 0.3%', P, ['crystal-structures-h6']);
  freshMissions(); P = newPage(); act.struct(P, 'diamond'); act.mat(P, 'Si'); { const q = act.quiz(P, 'NA'); act.answer(P, q.ans / 1e23 * 1.003); }
  none('矽求 N_A：誤差 0.3%（一般任務算對，隱藏任務要 0.1%）', P, ['crystal-structures-h6']);
  freshMissions(); P = newPage(); act.struct(P, 'hcp'); act.mat(P, 'Zn'); { const q = act.quiz(P, 'r'); act.answer(P, q.ans * 1.008); }
  none('鋅求半徑：誤差 0.8%', P, ['crystal-structures-h7']);
  freshMissions(); P = newPage(); act.struct(P, 'hcp'); { const q = act.quiz(P, 'r'); act.answer(P, q.ans); }
  none('鎂求半徑', P, ['crystal-structures-h7']);
  freshMissions(); P = newPage(); ['sc', 'bcc', 'fcc', 'hcp', 'nacl', 'cscl', 'zns'].forEach(s => { act.struct(P, s); solve(P, 'rho'); });
  none('七種結構答對求密度', P, ['crystal-structures-h10']);
  freshMissions(); P = newPage(); ['sc', 'bcc', 'fcc', 'hcp', 'nacl', 'cscl', 'zns'].forEach(s => { act.struct(P, s); solve(P, 'rho'); }); act.clear(P);
  { const n0 = P.events.length; act.struct(P, 'diamond'); solve(P, 'rho'); P.events = P.events.slice(n0); missions.forEach(m => { if (m.id === 'crystal-structures-11') m.done = false; }); act.struct(P, 'sc'); solve(P, 'rho'); }
  none('七種答對後按「全部清除」，再答鑽石型、簡單立方（只剩 2 種）', P, ['crystal-structures-h10', 'crystal-structures-11']);
  // 動手算：題型不適用時（例如鋅以外的六方最密求半徑，c/a 不理想）改成求密度
  ok(!CS.quizAllowed('r', 'Ti') && !CS.quizAllowed('r', 'Be') && CS.quizAllowed('r', 'Zn') && CS.quizAllowed('r', 'Mg'), '鈦、鈹（c/a 太小，上下層先碰到）不出半徑題；鎂、鋅可以');
}

// ---------- 4. 亂按：像學生亂玩，隱藏任務不可以被誤觸 ----------
// 權重照 tools/playtest.cjs：按鈕 30（畫面上約 30 個按鈕平分）、勾選 8（7 個勾選框）、下拉 8、畫布 15（三成是點一下）、數字欄 10、滑桿 25、等待 4
console.log('亂按 2000 回合 × 150 步（照 playtest 的權重）');
{
  let seed = 20261113;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const hits = {};
  for (let g = 0; g < 2000; g++) {
    freshMissions(); const P = newPage();
    for (let k = 0; k < 150; k++) {
      const u = rnd() * 100;
      if (u < 30) {   // 按鈕：模式 2、結構 8、晶胞數 3、疊疊看 4（只有疊疊看時看得到）、記下來、全部清除、題型 3、出題、核對、看答案、2D／3D 2、其他（音效、分頁、下載、複製、沿堆積方向看、重設視角）約 7
        const B = ['mode', 'mode'].concat(Array(8).fill('struct'), Array(3).fill('cells'), P.mode === 'stack' ? ['add', 'add', 'add', 'undo'] : [],
          ['record', 'clear', 'qtype', 'qtype', 'qtype', 'quiz', 'answer', 'reveal', 'view', 'view'], Array(7).fill('other'));
        const b = pick(B);
        if (b === 'mode') act.mode(P, pick(['cell', 'stack']));
        else if (b === 'struct') act.struct(P, pick(CS.ORDER));
        else if (b === 'cells') act.cells(P, pick([1, 2, 3]));
        else if (b === 'add') act.add(P, pick(['A', 'B', 'C']));
        else if (b === 'undo') act.undo(P);
        else if (b === 'record') act.record(P);
        else if (b === 'clear') act.clear(P);
        else if (b === 'qtype') P.qType = pick(['rho', 'r', 'NA']);
        else if (b === 'quiz') act.quiz(P, P.qType || 'rho');
        else if (b === 'answer') act.answer(P, pick([0.5, 1, 6.02, 8.9, 128, 100, 1e23, 2.5]));
        else if (b === 'reveal') act.reveal(P);
        else if (b === 'view') act.view(P, pick(['2d', '3d']));
      } else if (u < 38) {
        const c = pick(['hypo', 'cut', 'coord', 'oct', 'tet', 'cube', 'layers']);
        if (c === 'hypo') act.hypo(P, !P.hypo); else act.check(P, c, !(c === 'oct' || c === 'tet' || c === 'cube' ? P.vo[c] : P[c]));
      } else if (u < 46) { if (P.mode === 'cell' && !P.hypo) act.mat(P, pick(CS.MAT_ORDER.filter(m => CS.MATS[m].s === P.s))); }
      else if (u < 61) { if (rnd() < 0.3 && P.mode === 'cell' && rnd() < 0.5) act.pick(P, pick(['m', 'c', 'a']), Math.floor(rnd() * 64)); }   // 點畫布：約一半點得到原子
      else if (u < 96) act.size(P, 20 + Math.round(rnd() * 80));
    }
    P.events.filter(hid).forEach(id => { hits[id] = (hits[id] || 0) + 1; });
  }
  const list = Object.keys(hits);
  console.log('    亂按完成的隱藏任務：' + (list.length ? list.map(id => id + ' ' + hits[id] + ' 回合').join('、') : '沒有'));
  const worst = list.reduce((m, id) => Math.max(m, hits[id]), 0);
  ok(worst <= 2000 * 0.002, '亂按誤觸隱藏任務的機率都 ≤ 0.2%（最多 ' + worst + ' / 2000 回合）');
}

// ---------- 總結 ----------
const missing = missions.filter(m => !done[m.id]).map(m => m.id);
console.log(missing.length ? '  ✗ 沒有證明到的任務：' + missing.join('、') : '  ✓ ' + missions.length + ' 個任務都證明做得到');
if (missing.length) bad++;
const hidden = missions.filter(m => m.hidden);
ok(hidden.length === 10 && hidden.filter(m => m.level >= 7).length >= 3 && hidden.every(m => m.level >= 3 && m.level <= 10), '隱藏任務 10 個、3–10 級、7 級以上 ' + hidden.filter(m => m.level >= 7).length + ' 個');
ok(hidden.every(m => m.riddle && m.riddle.zh && m.riddle.en && !m.desc), '隱藏任務只有提示句（riddle），沒有說明（desc）');
const stars = missions.reduce((a, m) => a + (m.hidden ? m.level * 2 : m.level), 0);
console.log('    （公開 ' + missions.filter(m => !m.hidden).reduce((a, m) => a + m.level, 0) + ' 顆星、隱藏 ' + hidden.reduce((a, m) => a + m.level * 2, 0) + ' 顆星，共 ' + stars + ' 顆）');
if (bad) { console.log('失敗 ' + bad + ' 項'); process.exitCode = 1; }
