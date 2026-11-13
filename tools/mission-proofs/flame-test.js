/* 任務可達成的證明腳本。用法：node tools/mission-proofs/flame-test.js
 * 用焰色反應的核心（js/flame-test-core.js）模擬頁面（js/flame-test.js）的操作與事件：
 *   換樣品、滑桿、勾選框改變後送 'flame'；游標量測（拖曳放開、‹ ›、找亮線、找暗線、記錄這條線）送 'measure'；
 *   未知樣品按「核對」送 'identify'；開 3D 送 'view3d'。
 * 1. 每個任務照建議做法都做得到（未知樣品用一個「只看光譜」的鑑定程序，不偷看答案）；
 * 2. 預設狀態不觸發任何任務；
 * 3. 每個隱藏任務的做法只完成它自己，不連帶完成別的隱藏任務；
 * 4. 亂按 2000 回合 × 150 步（照 tools/playtest.cjs 的權重），每個隱藏任務的誤觸率都要 ≤ 0.5%。
 * 修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(__ROOT + 'js/flame-test-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/flame-test.js');

let bad = 0;
const done = {};
const hid = id => /-h\d+$/.test(id);
function freshMissions() { missions.forEach(m => { m.done = false; }); }
const ok = (cond, msg) => { console.log('  ' + (cond ? '✓' : '✗') + ' ' + msg); if (!cond) bad++; return cond; };
const f = (x, d) => (x == null || !isFinite(x)) ? String(x) : (+x).toFixed(d == null ? 2 : d);

// ======================= 模擬頁面（與 js/flame-test.js 一致） =======================
function newPage(seed) {
  return {
    metals: [], conc: 0.1, air: 0.8, h: 45, cobalt: false, lamp: false, TL: 2400, res: 1, cur: 550, zoom: 420, log: false, view: '2d',
    unk: { kind: 1, active: null, answer: [], streak: 0, mixNoCo: 0, n: 0, last: null, R: C.rng(seed || 1) },
    recs: [], acted: false, events: [], S: null, col: null
  };
}
function emit(P, type, data) {
  if (!P.acted) return;
  const ev = { type, data };
  missions.forEach(m => { if (!m.done && m.check(ev)) { m.done = true; P.events.push(m.id); } });
}
const sMetals = P => P.unk.active ? P.unk.active.metals : P.metals;
const sConc = P => P.unk.active ? P.unk.active.conc : P.conc;
function spec(P, h) {
  return C.spectrum({ metals: sMetals(P), conc: sConc(P), air: P.air, h: h == null ? P.h : h, cobalt: P.cobalt, lamp: P.lamp, TL: P.TL, res: P.res });
}
function compute(P) { P.S = spec(P); P.col = C.flameColor(P.S); }
function emitFlame(P) {
  const S = P.S, col = P.col;
  emit(P, 'flame', { metals: sMetals(P).slice(), unknown: !!P.unk.active, conc: sConc(P), air: P.air, h: P.h, T: S.T, Tw: S.Tw, hp: S.F.hp, Hc: S.F.Hc,
    inCone: S.F.Hc > 0 && P.h < S.F.Hc, cobalt: P.cobalt, lamp: P.lamp, TL: P.TL, color: col && col.name ? col.name.zh : null, dw: col ? col.dw : null, Ym: col ? col.Ym : 0, soot: S.sootShare() });
}
function changed(P) { compute(P); emitFlame(P); }
function measureNow(P, extra) {
  const S = P.S, m = C.measure(S, P.cur);
  let hotRatio = null;
  if (m.near) {
    const Sh = spec(P, S.F.hp);
    const a = C.lineSignal(S, m.near.lam), b = C.lineSignal(Sh, m.near.lam);
    hotRatio = b !== 0 ? a / b : null;
  }
  const d = Object.assign(m, { metals: sMetals(P).slice(), unknown: !!P.unk.active, cobalt: P.cobalt, lamp: P.lamp, TL: P.TL, T: S.T, air: P.air, h: P.h,
    hp: S.F.hp, Hc: S.F.Hc, inCone: S.F.Hc > 0 && P.h < S.F.Hc, soot: S.sootShare(), res: P.res, log: P.log, zoom: P.zoom, hotRatio }, extra || {});
  emit(P, 'measure', d);
  return d;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const roundSig = (x, n) => { if (!(x > 0)) return x; const p = Math.pow(10, n - 1 - Math.floor(Math.log10(x))); return Math.round(x * p) / p; };
// 滑桿：位置 → 數值（與頁面的 concMap、resMap、步長一致）
const SL = {
  conc: { set: (P, v) => { P.conc = clamp(v, 0.001, 1); }, pos: p => roundSig(Math.pow(10, -3 + 3 * p), 3), min: 0.001, max: 1 },
  air: { set: (P, v) => { P.air = clamp(Math.round(v), 0, 100) / 100; }, pos: p => p * 100, min: 0, max: 100 },
  hgt: { set: (P, v) => { P.h = clamp(Math.round(v * 2) / 2, 0, 120); }, pos: p => p * 120, min: 0, max: 120 },
  tl: { set: (P, v) => { P.TL = clamp(Math.round(v / 10) * 10, 1000, 3000); }, pos: p => 1000 + 2000 * p, min: 1000, max: 3000 },
  res: { set: (P, v) => { P.res = clamp(v, 0.05, 3); }, pos: p => roundSig(0.05 * Math.pow(60, p), 3), min: 0.05, max: 3 }
};
const A = {
  sample(P, m) {   // 樣品按鈕（最多兩種，第三種換掉最早的）
    P.acted = true; if (P.unk.active) return;
    const i = P.metals.indexOf(m);
    if (i >= 0) P.metals.splice(i, 1); else { P.metals.push(m); if (P.metals.length > 2) P.metals.shift(); }
    changed(P);
  },
  only(P, list) { P.acted = true; P.metals = list.slice(); changed(P); },
  clean(P) { P.acted = true; if (P.unk.active) return; P.metals = []; changed(P); },
  slider(P, name, v) { P.acted = true; if (name === 'tl' && !P.lamp) return; if (name === 'conc' && P.unk.active) return; SL[name].set(P, v); changed(P); },
  cobalt(P, on) { P.acted = true; P.cobalt = on == null ? !P.cobalt : on; if (P.unk.active && P.cobalt) P.unk.active.usedCobalt = true; changed(P); },
  lamp(P, on) { P.acted = true; P.lamp = on == null ? !P.lamp : on; changed(P); },
  log(P, on) { P.acted = true; P.log = on == null ? !P.log : on; },
  zoom(P, z) { P.acted = true; P.zoom = z; },
  win(P) {
    if (P.zoom >= 420) return [C.LMIN, C.LMAX];
    let a = P.cur - P.zoom / 2, b = P.cur + P.zoom / 2;
    if (a < C.LMIN) { a = C.LMIN; b = a + P.zoom; }
    if (b > C.LMAX) { b = C.LMAX; a = b - P.zoom; }
    return [a, b];
  },
  cursor(P, l) { P.acted = true; P.cur = clamp(l, C.LMIN, C.LMAX); return measureNow(P); },   // 在光譜圖上點、拖曳放開
  step(P, d) { P.acted = true; const s = P.zoom >= 420 ? 0.5 : P.zoom >= 40 ? 0.05 : 0.005; P.cur = clamp(P.cur + d * s, C.LMIN, C.LMAX); return measureNow(P); },
  peak(P) { P.acted = true; const p = C.findPeak(P.S, P.cur); if (p == null) return null; P.cur = clamp(p, C.LMIN, C.LMAX); return measureNow(P); },
  dip(P) { P.acted = true; const p = C.findDip(P.S, P.cur); if (p == null) return null; P.cur = clamp(p, C.LMIN, C.LMAX); return measureNow(P); },
  record(P) {
    P.acted = true;
    const m = C.measure(P.S, P.cur);
    P.recs.push({ lam: P.cur, el: m.near && m.near.d <= 0.15 && m.isPeak ? m.near.el : null });
    if (P.recs.length > 30) P.recs.shift();
    return measureNow(P, { rec: true, recs: P.recs.map(r => ({ lam: r.lam, el: r.el })) });
  },
  clearAll(P) { P.acted = true; P.recs = []; const u = P.unk; u.streak = 0; u.mixNoCo = 0; u.n = 0; u.active = null; u.answer = []; changed(P); },
  kind(P, k) { P.acted = true; P.unk.kind = k; if (P.unk.answer.length > k) P.unk.answer = P.unk.answer.slice(-k); },
  unkStart(P) {
    P.acted = true; const u = P.unk;
    if (u.active) u.streak = 0;
    const x = C.newUnknown(u.R, u.kind === 2, u.last);
    u.n++; u.last = x.metals;
    u.active = { metals: x.metals, conc: x.conc, kind: u.kind, usedCobalt: P.cobalt, usedScope: false };
    u.answer = []; changed(P);
  },
  ans(P, s) { P.acted = true; const u = P.unk; if (!u.active) return; const i = u.answer.indexOf(s); if (i >= 0) u.answer.splice(i, 1); else { u.answer.push(s); if (u.answer.length > u.kind) u.answer.shift(); } },
  check(P) {
    P.acted = true; const u = P.unk, a = u.active; if (!a) return null;
    if (u.answer.length !== a.kind) return null;
    const okk = C.sameSet(u.answer, a.metals);
    u.streak = okk ? u.streak + 1 : 0;
    if (a.kind === 2) u.mixNoCo = okk && !a.usedCobalt ? u.mixNoCo + 1 : 0;
    emit(P, 'identify', { correct: okk, n: a.kind, metals: a.metals.slice(), answer: u.answer.slice(), streak: u.streak, mixNoCo: u.mixNoCo, usedCobalt: a.usedCobalt, usedScope: a.usedScope });
    u.active = null; changed(P); return okk;
  },
  show(P) { P.acted = true; const u = P.unk, a = u.active; if (!a) return; u.streak = 0; if (a.kind === 2) u.mixNoCo = 0; u.active = null; changed(P); },
  view3d(P) { P.acted = true; if (P.view === '3d') return; P.view = '3d'; emit(P, 'view3d', {}); },
  view2d(P) { P.acted = true; P.view = '2d'; }
};

// ======================= 只看光譜的鑑定程序（給未知樣品的任務用） =======================
// 每種金屬看一條「指紋線」：在那個波長附近找亮線，亮線要落在 0.15 nm 以內，分數＝比旁邊（±3 nm）亮多少；銅改看 CuCl 的藍色分子帶。分數最高的 1 或 2 種就是答案。
const FINGER = { Li: 670.776, Na: 588.995095, K: 766.489913, Rb: 780.0268, Cs: 455.52799, Ca: 422.673, Sr: 460.7331, Ba: 553.5481, Cu: 521.8202 };
function identifyBySpectrum(P) {
  // 學生的做法：空氣孔全開、白金絲放在最熱處、不用燈、不用鈷玻璃、狹縫 0.2 nm
  A.slider(P, 'air', 100); A.slider(P, 'hgt', P.S.F.hp); if (P.lamp) A.lamp(P, false); if (P.cobalt) A.cobalt(P, false);
  A.slider(P, 'res', 0.2);
  const S = P.S;
  let vmax = 0;
  for (let l = C.LMIN; l <= C.LMAX; l += 0.1) vmax = Math.max(vmax, S.eval(l));
  const score = {};
  C.ORDER.forEach(s => {
    if (s === 'Cu') {   // 銅的原子線很弱，看 CuCl 的藍色帶：433–437 nm 的最低處（避開窄線）比 400、475 nm 亮
      let lo = Infinity; for (let l = 433; l <= 437; l += 0.05) lo = Math.min(lo, S.eval(l));
      score[s] = 0.5 * (lo - 0.5 * (S.eval(400) + S.eval(475))) / vmax; return;
    }
    const lam = FINGER[s], p = C.findPeak(S, lam);
    if (p == null || Math.abs(p - lam) > 0.15) { score[s] = 0; return; }
    const side = Math.min(S.eval(lam - 3), S.eval(lam + 3));
    score[s] = (S.eval(p) - side) / vmax;
  });
  const pick = C.ORDER.slice().sort((a, b) => score[b] - score[a]).slice(0, P.unk.active.kind);
  P.unk.answer = [];
  pick.forEach(s => A.ans(P, s));
  return { pick, score };
}

// ======================= 1. 預設狀態 =======================
console.log('1. 預設狀態');
{
  freshMissions(); const P = newPage(); compute(P);
  emitFlame(P); measureNow(P);
  ok(P.events.length === 0, '沒有操作時不送事件、不完成任務');
  P.acted = true; emitFlame(P); measureNow(P);
  ok(P.events.length === 0, '預設設定（沒有樣品、空氣孔 80%、白金絲 45 mm、游標 550 nm）送出事件也不完成任何任務');
  A.log(P, true); A.zoom(P, 4); A.cursor(P, 589); A.peak(P); A.record(P); A.cobalt(P, true); A.lamp(P, true); A.view2d(P);
  ok(!P.events.some(hid), '沒有樣品時亂按對數、放大、找亮線、記錄、鈷玻璃、燈：沒有隱藏任務（' + (P.events.join('、') || '沒有任務') + '）');
}

// ======================= 2. 一般任務 =======================
console.log('2. 一般任務');
function report(name, P, ids) {
  const got = ids.filter(id => P.events.includes(id));
  ids.forEach(id => { if (P.events.includes(id)) done[id] = true; });
  ok(got.length === ids.length, name + ' → ' + (got.join('、') || '沒有完成') + (got.length < ids.length ? '（缺 ' + ids.filter(i => !got.includes(i)).join('、') + '）' : ''));
}
let P, d;
freshMissions(); P = newPage(); compute(P);
A.sample(P, 'Na'); report('沾 NaCl：火焰「' + P.col.name.zh + '」，主波長 ' + f(P.col.dw, 1) + ' nm', P, ['flame-test-1']);
A.clean(P); A.sample(P, 'Ca'); report('沾 CaCl2：火焰「' + P.col.name.zh + '」', P, ['flame-test-2']);
A.clean(P); A.sample(P, 'Ba'); report('沾 BaCl2：火焰「' + P.col.name.zh + '」', P, ['flame-test-3']);
{ const Q = newPage(); compute(Q); Q.acted = true; A.sample(Q, 'Cu'); console.log('    （沾 CuCl2：火焰「' + Q.col.name.zh + '」也算綠色系）'); }
A.view3d(P); report('切換到 3D', P, ['flame-test-4']);
A.clean(P); A.sample(P, 'Na'); A.cursor(P, 589); d = A.peak(P);
report('沾 NaCl、游標 589、找亮線：' + f(d.lam, 3) + ' nm（狹縫 1 nm，D 雙線合成一條）', P, ['flame-test-5']);
A.clean(P); A.sample(P, 'Sr'); A.cursor(P, 461); d = A.peak(P);
report('沾 SrCl2、游標 461、找亮線：' + f(d.lam, 3) + ' nm', P, ['flame-test-6']);
A.slider(P, 'air', 100); A.slider(P, 'hgt', P.S.F.hp);
report('空氣孔 100%、白金絲 ' + f(P.h, 1) + ' mm（最熱處 ' + f(P.S.F.hp, 1) + ' mm、' + f(P.S.F.Tmax, 0) + ' K）', P, ['flame-test-7']);
A.clean(P); A.slider(P, 'air', 80); A.slider(P, 'hgt', 45); A.sample(P, 'Na'); A.sample(P, 'K');
const c0 = P.col.name.zh; A.cobalt(P, true);
report('NaCl + KCl：火焰「' + c0 + '」，勾鈷玻璃後「' + P.col.name.zh + '」', P, ['flame-test-8']);
A.cobalt(P, false); A.clean(P); A.sample(P, 'K'); A.slider(P, 'res', 0.1); A.zoom(P, 4); A.cursor(P, 404.4); d = A.peak(P);
report('沾 KCl、狹縫 0.1 nm、游標 404.4、找亮線：' + f(d.lam, 3) + ' nm（真值 404.414）', P, ['flame-test-12']);
{ const Q = newPage(); compute(Q); Q.acted = true; A.sample(Q, 'K'); A.cursor(Q, 404.4); const e = A.peak(Q);
  ok(!Q.events.includes('flame-test-12'), '對照：狹縫 1 nm 時兩條紫線合成一條，峰在 ' + f(e && e.lam, 3) + ' nm，不算任務 12'); }

// 未知樣品：只看光譜鑑定
{
  let n1 = 0, ok1 = 0, n2 = 0, ok2 = 0;
  for (let s = 1; s <= 60; s++) {
    freshMissions(); const Q = newPage(1000 + s); compute(Q);
    A.kind(Q, s % 2 ? 1 : 2); A.unkStart(Q);
    const truth = Q.unk.active.metals.slice(), r = identifyBySpectrum(Q), good = A.check(Q);
    if (truth.length === 1) { n1++; if (good) ok1++; } else { n2++; if (good) ok2++; }
    if (!good) console.log('    （鑑定錯：答案 ' + truth.join('+') + '，程序選 ' + r.pick.join('+') + '）');
  }
  ok(ok1 === n1 && ok2 === n2, '只看光譜的鑑定程序（空氣孔全開、最熱處、狹縫 0.2 nm、看九條指紋線）：一種金屬 ' + ok1 + '/' + n1 + '、兩種金屬 ' + ok2 + '/' + n2 + ' 答對');
}
freshMissions(); P = newPage(7); compute(P);
A.kind(P, 1); A.unkStart(P); identifyBySpectrum(P); A.check(P);
report('一種金屬的未知樣品：用光譜鑑定、核對', P, ['flame-test-9']);
A.kind(P, 2); A.unkStart(P); identifyBySpectrum(P); A.check(P);
report('兩種金屬的未知樣品：用光譜鑑定、核對', P, ['flame-test-10']);
for (let k = 0; k < 5; k++) { A.kind(P, 1); A.unkStart(P); identifyBySpectrum(P); A.check(P); }
report('接著連續答對（連續 ' + P.unk.streak + ' 題）', P, ['flame-test-11']);
ok(!P.events.includes('flame-test-h10'), '一般任務的做法（第二題後回到一種金屬）不會完成隱藏任務 10');
{ const Q = newPage(3); compute(Q); Q.acted = true; A.kind(Q, 1); A.unkStart(Q); A.show(Q);
  ok(Q.unk.streak === 0 && Q.events.length === 0, '按「看答案」不送核對、連續答對歸零'); }

// ======================= 3. 隱藏任務（每個做法只完成它自己） =======================
console.log('3. 隱藏任務');
function reportH(name, Q, id) {
  const extra = Q.events.filter(x => hid(x) && x !== id);
  report(name + (extra.length ? '　← 順便完成了 ' + extra.join('、') : ''), Q, [id]);
  if (extra.length) bad++;
}
function fresh(seed) { freshMissions(); const Q = newPage(seed); compute(Q); Q.acted = true; return Q; }
// h1：煤灰
P = fresh(); A.sample(P, 'Na'); A.cursor(P, 589); A.peak(P); A.zoom(P, 4); A.slider(P, 'res', 0.2); A.slider(P, 'air', 0);
d = A.peak(P);
console.log('    （空氣孔 0%、NaCl：煤灰占 ' + f(100 * P.S.sootShare(), 1) + '%，「找亮線」' + (d ? '找到 ' + f(d.lam, 3) : '找不到亮線') + '）');
d = A.cursor(P, 588.99);
reportH('NaCl、狹縫 0.2 nm、放大 4 nm、空氣孔 0%：游標放在 588.99 nm，煤灰 ' + f(100 * d.soot, 1) + '%、D 線對比 ' + f(100 * d.contrast, 2) + '%', P, 'flame-test-h1');
// h2：銫
P = fresh(); A.sample(P, 'Cs'); A.slider(P, 'res', 0.3); A.cursor(P, 455.6); A.peak(P); A.record(P); A.cursor(P, 459.2); A.peak(P); d = A.record(P);
reportH('CsCl、狹縫 0.3 nm：找亮線、記錄 ' + d.recs.map(r => f(r.lam, 2) + (r.el ? '（' + r.el + '）' : '')).join('、'), P, 'flame-test-h2');
// h3：銣
P = fresh(); A.sample(P, 'Rb'); A.cursor(P, 780); A.peak(P); A.record(P); A.cursor(P, 794.3); d = A.record(P);
console.log('    （只記錄、沒有對準亮線峰時：' + (P.events.includes('flame-test-h3') ? '已完成' : '未完成') + '）');
A.peak(P); d = A.record(P);
reportH('RbCl：在 780、794.3 nm 找亮線、記錄 ' + d.recs.filter(r => r.el).map(r => f(r.lam, 2)).join('、'), P, 'flame-test-h3');
// h4：內焰
P = fresh(); A.sample(P, 'Na'); A.slider(P, 'hgt', 4); A.cursor(P, 589); d = A.peak(P) || A.cursor(P, 589);
reportH('NaCl、白金絲 4 mm（內焰高 ' + f(P.S.F.Hc, 1) + ' mm）：發光區 ' + f(d.T, 0) + ' K，D 線是最熱處的 ' + f(100 * d.hotRatio, 3) + '%', P, 'flame-test-h4');
// h5：鈉鉀混合、不用鈷玻璃
P = fresh(); A.sample(P, 'Na'); A.sample(P, 'K'); A.cursor(P, 766.5); d = A.peak(P);
reportH('NaCl + KCl（火焰「' + P.col.name.zh + '」）、不用鈷玻璃：在 766.5 找亮線 ' + f(d.lam, 3) + ' nm（' + d.near.el + '，對比 ' + f(100 * d.contrast, 1) + '%）', P, 'flame-test-h5');
// h6：D1
P = fresh(); A.sample(P, 'Na'); A.slider(P, 'res', 0.1); A.zoom(P, 4); A.cursor(P, 589.6); d = A.peak(P);
reportH('NaCl、狹縫 0.1 nm、放大 4 nm、在 589.6 找亮線：' + f(d.lam, 3) + ' nm（D1 589.592），分得開：' + d.resolvedD + '、線強 ' + f(d.net, 3), P, 'flame-test-h6');
// h7：暗線
P = fresh(); A.sample(P, 'Na'); A.lamp(P, true); A.slider(P, 'tl', P.S.T + 400); A.cursor(P, 589); d = A.dip(P);
reportH('NaCl、燈 ' + f(P.TL, 0) + ' K（火焰 ' + f(P.S.T, 0) + ' K）、找暗線：' + f(d.lam, 3) + ' nm', P, 'flame-test-h7');
// h8：譜線反轉
P = fresh(); A.sample(P, 'Na'); A.lamp(P, true); A.slider(P, 'tl', P.S.T); A.zoom(P, 40); d = A.cursor(P, 589.0);
reportH('NaCl、燈 ' + f(P.TL, 0) + ' K ＝ 火焰 ' + f(P.S.T, 0) + ' K、放大 40 nm、游標 589：D2 淨強度 ' + f(d.net, 4) + '（線消失）', P, 'flame-test-h8');
{ const Q = fresh(); A.sample(Q, 'Na'); A.lamp(Q, true); A.slider(Q, 'tl', Q.S.T + 300); A.zoom(Q, 40); A.cursor(Q, 589.0);
  ok(!Q.events.includes('flame-test-h8'), '對照：燈比火焰熱 300 K 時不算 h8'); }
// h9：鋰
P = fresh(); A.sample(P, 'Li'); A.cursor(P, 670.8); A.peak(P); A.record(P); A.cursor(P, 610.4); A.peak(P); d = A.record(P);
reportH('LiCl：找亮線、記錄 ' + d.recs.map(r => f(r.lam, 2) + (r.el ? '（' + r.el + '）' : '')).join('、'), P, 'flame-test-h9');
// h10：三題兩種金屬、不用鈷玻璃
P = fresh(11); A.kind(P, 2);
for (let k = 0; k < 3; k++) { A.unkStart(P); identifyBySpectrum(P); A.check(P); }
reportH('兩種金屬的未知樣品連續 3 題、只用分光鏡（不勾鈷玻璃）', P, 'flame-test-h10');
{ const Q = fresh(11); A.kind(Q, 2); A.cobalt(Q, true);
  for (let k = 0; k < 3; k++) { A.unkStart(Q); identifyBySpectrum(Q); A.cobalt(Q, true); A.check(Q); }
  ok(!Q.events.includes('flame-test-h10'), '對照：勾過鈷玻璃的題目不算 h10'); }

// ======================= 4. 亂按 =======================
// 權重照 tools/playtest.cjs：按鈕 30（畫面上約 33 個按鈕平分）、滑桿 25、數字欄 10、勾選 8、畫布 15（三成是點一下）、等待 4
const ROUNDS = +process.env.FT_ROUNDS || 2000, STEPS = 150;
console.log('4. 亂按 ' + ROUNDS + ' 回合 × ' + STEPS + ' 步（照 playtest 的權重）');
{
  let seed = 20261113;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const hits = {};
  const t0 = Date.now();
  for (let g = 0; g < ROUNDS; g++) {
    freshMissions(); const Q = newPage(g + 1); compute(Q);
    for (let k = 0; k < STEPS; k++) {
      const u = rnd() * 100;
      if (u < 30) {
        const B = C.ORDER.map(s => 'S' + s).concat(['clean', 'z420', 'z40', 'z4', 'L2', 'L', 'peak', 'dip', 'R', 'R2', 'rec', 'clearAll', 'k1', 'k2', 'start', 'v2', 'v3'],
          Q.unk.active ? C.ORDER.map(s => 'A' + s).concat(['check', 'show']) : [], Array(6).fill('other'));
        const b = pick(B);
        if (b[0] === 'S' && b.length <= 3) A.sample(Q, b.slice(1));
        else if (b[0] === 'A' && b.length <= 3) A.ans(Q, b.slice(1));
        else switch (b) {
          case 'clean': A.clean(Q); break;
          case 'z420': A.zoom(Q, 420); break; case 'z40': A.zoom(Q, 40); break; case 'z4': A.zoom(Q, 4); break;
          case 'L2': A.step(Q, -10); break; case 'L': A.step(Q, -1); break; case 'R': A.step(Q, 1); break; case 'R2': A.step(Q, 10); break;
          case 'peak': A.peak(Q); break; case 'dip': A.dip(Q); break; case 'rec': A.record(Q); break; case 'clearAll': A.clearAll(Q); break;
          case 'k1': A.kind(Q, 1); break; case 'k2': A.kind(Q, 2); break; case 'start': A.unkStart(Q); break;
          case 'check': A.check(Q); break; case 'show': A.show(Q); break;
          case 'v2': A.view2d(Q); break; case 'v3': A.view3d(Q); break;
          default: break;
        }
      } else if (u < 55 || u < 65) {   // 滑桿（25）與數字欄（10）：最小、最大、隨機位置；數字欄打極端值（多半被夾到最小或最大）
        const names = ['conc', 'air', 'hgt', 'res'].concat(Q.lamp ? ['tl'] : []), nm = pick(names), sl = SL[nm], m = rnd();
        let v;
        if (u < 55) v = m < 0.2 ? sl.min : m < 0.4 ? sl.max : sl.pos(0.02 + 0.96 * rnd());
        else v = pick([sl.min, sl.min, sl.max, sl.max, sl.min, Math.min(sl.max, Math.max(sl.min, 3.14159265358979)), sl.max]);
        if (nm === 'air' && u < 55 && m >= 0.4) v = Math.round(v);
        A.slider(Q, nm, v);
      } else if (u < 73) {
        const c = pick(['cobalt', 'lamp', 'log']);
        if (c === 'cobalt') A.cobalt(Q); else if (c === 'lamp') A.lamp(Q); else A.log(Q);
      } else if (u < 88) {   // 畫布：主畫面（拖到白金絲的機會很小）、光譜圖（點或拖曳 → 量測）、能階圖（沒有反應）
        const which = pick(['cv', 'gcv', 'ecv']);
        if (which === 'gcv') { const w = A.win(Q); A.cursor(Q, w[0] + (w[1] - w[0]) * (0.05 + 0.9 * rnd())); }
        else if (which === 'cv' && Q.view === '2d' && rnd() < 0.06) A.slider(Q, 'hgt', 120 * rnd());
      }
      // 其餘：等待
    }
    Q.events.filter(hid).forEach(id => { hits[id] = (hits[id] || 0) + 1; });
  }
  missions.filter(m => m.hidden).forEach(m => {
    const n = hits[m.id] || 0, rate = n / ROUNDS;
    ok(rate <= 0.005, m.id + '（' + m.level + ' 級）誤觸 ' + n + ' / ' + ROUNDS + ' 回合 = ' + (100 * rate).toFixed(2) + '%');
  });
  console.log('    （亂按共 ' + (ROUNDS * STEPS) + ' 步，用時 ' + ((Date.now() - t0) / 1000).toFixed(0) + ' 秒）');
}

// ======================= 總結 =======================
const missing = missions.filter(m => !done[m.id]).map(m => m.id);
ok(!missing.length, missing.length ? '沒有證明到的任務：' + missing.join('、') : missions.length + ' 個任務都證明做得到');
const pub = missions.filter(m => !m.hidden), hidden = missions.filter(m => m.hidden);
console.log('    （一般任務 ' + pub.length + ' 個、' + pub.reduce((a, m) => a + m.level, 0) + ' 顆星；隱藏任務 ' + hidden.length + ' 個、' +
  hidden.reduce((a, m) => a + m.level * 2, 0) + ' 顆星；7 級以上的隱藏任務 ' + hidden.filter(m => m.level >= 7).length + ' 個）');
ok(hidden.length === 10 && hidden.filter(m => m.level >= 7).length >= 3 && hidden.every(m => m.level >= 3 && m.level <= 10 && m.riddle && m.riddle.zh && m.riddle.en && !m.desc),
  '隱藏任務 10 個、3–10 級、至少 3 個 7 級以上、提示寫在 riddle');
if (bad) { console.log('失敗 ' + bad + ' 項'); process.exitCode = 1; }
