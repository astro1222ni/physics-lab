/* 任務可達成的證明腳本。用法：node tools/mission-proofs/chemical-equilibrium.js
 * 用化學核心模擬頁面（js/chemical-equilibrium.js）的操作與事件：每一幀 1/60 秒、依播放速度前進，
 * 用 EqCore.relax 趨近平衡，|ln(Q/K)| < 0.001 維持 0.3 秒就「平衡」：把組成對齊到精確的平衡、記一列、送 'settle'；
 * 預測模式送 'predict'；未知反應「核對答案」送 'answer'。確認每個任務都做得到、預設狀態不會觸發任務，
 * 並量出照建議做法要等多久才平衡。修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const E = require(__ROOT + 'js/chemical-equilibrium-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({ mem: {} }, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/chemical-equilibrium.js');

const SPEEDS = [1, 10, 100];
function rxd(rx) {
  const r = E.RX[rx];
  return { sp: r.sp, nu: r.nu, Tmin: r.Tmin, Tmax: r.Tmax, T: r.T, n0: r.n0, V: r.V || 50, Vr: r.Vr || [10, 100], step: r.step || 5e-4, Pr: r.Pr || [0.2, 6] };
}
// ---------- 模擬頁面（與 js/chemical-equilibrium.js 的 opts／startFrom／changed／settle／answerPredict 一致） ----------
function newPage(rx, side) {
  const P = { rx, mode: 'V', T: rxd(rx).T, V: rxd(rx).V, P: 1, cat: false, speed: rx === 'n2o4' || rx === 'mys' ? 0 : 1, rows: [], seg: 0, events: [],
    acted: false, pred: false, waiting: null, streak: 0, kinds: {}, zero: false, mysId: 0, wall: 0 };
  startFrom(P, side || 'R');
  return P;
}
function opts(P) {
  if (P.mode === 'V') return { T: P.T, V: P.V / 1000 };
  const o = { T: P.T, P: P.P }, L = rxd(P.rx).Vr;
  const V = E.props(P.rx, P.n, o).V * 1000;
  if (V > L[1]) return { T: P.T, V: L[1] / 1000, stop: 1 };
  if (V < L[0]) return { T: P.T, V: L[0] / 1000, stop: -1 };
  return o;
}
function startFrom(P, side) {
  P.seg++; P.origin = side;
  const r = rxd(P.rx);
  P.n = { Ar: 0 };
  r.sp.forEach(s => { P.n[s] = 0; });
  if (side === 'R') r.sp.forEach((s, i) => { if (r.nu[i] < 0) P.n[s] = r.n0[s] || 0; });
  else {
    let xi = Infinity;
    r.sp.forEach((s, i) => { if (r.nu[i] < 0) xi = Math.min(xi, (r.n0[s] || 0) / -r.nu[i]); });
    r.sp.forEach((s, i) => { if (r.nu[i] > 0) P.n[s] = r.nu[i] * xi; });
  }
  P.changes = []; P.pending = true; P.settledFor = 0; P.waiting = null;
}
function emit(P, type, data) {
  if (!P.acted) return;
  const ev = { type, data };
  missions.forEach(m => { if (!m.done && m.check(ev)) { m.done = true; P.events.push(m.id); } });
}
/** 改變條件（頁面的 changed）：kind 是改變的種類 */
function change(P, kind, fn) {
  P.acted = true;
  const atEq = !P.pending;
  fn(P);
  P.changes.push(kind);
  P.pending = true; P.settledFor = 0;
  if (P.waiting) { P.waiting.kinds[kind] = 1; P.waiting.truth = E.direction(P.rx, P.n, opts(P), 1e-4); }
  else if (P.pred && atEq) { const k = {}; k[kind] = 1; P.waiting = { truth: E.direction(P.rx, P.n, opts(P), 1e-4), kinds: k }; }
}
function amount(P, sp, d) {
  const r = rxd(P.rx), step = r.step;
  const kind = sp === 'Ar' ? (P.mode === 'V' ? 'ArV' : 'ArP') : (d > 0 ? 'add-' : 'rem-') + (r.nu[r.sp.indexOf(sp)] < 0 ? 'R' : 'P');
  change(P, kind, p => { p.n[sp] = d > 0 ? Math.min(20 * step, (p.n[sp] || 0) + step) : Math.max(0, (p.n[sp] || 0) - step); if (p.n[sp] < step * 1e-6) p.n[sp] = 0; });
}
function setT(P, v) { if (v !== P.T) change(P, v > P.T ? 'T+' : 'T-', p => { p.T = v; }); }
function setV(P, v) { if (v !== P.V) change(P, v < P.V ? 'V-' : 'V+', p => { p.V = v; }); }
function setP(P, v) { if (v !== P.P) change(P, v > P.P ? 'V-' : 'V+', p => { p.P = v; }); }
function setCat(P, on) { change(P, 'cat', p => { p.cat = on; }); }
function setMode(P, m) {
  P.acted = true;
  const pr = E.props(P.rx, P.n, opts(P));
  P.mode = m;
  if (m === 'P') { const Pr = rxd(P.rx).Pr; P.P = Math.max(Pr[0], Math.min(Pr[1], pr.P)); }
  else { const Vr = rxd(P.rx).Vr; P.V = Math.max(Vr[0], Math.min(Vr[1], pr.V * 1000)); }
}
function settleNow(P) {
  const o = opts(P);
  P.n = E.equilibrium(P.rx, P.n, o).n;
  const pr = E.props(P.rx, P.n, o);
  const row = { seg: P.seg, rx: P.rx, mys: P.mysId, T: P.T, V: pr.V * 1000, P: pr.P, mode: P.mode, cat: P.cat, n: Object.assign({}, P.n), p: pr.p, x: pr.x, c: pr.c,
    Ar: P.n.Ar || 0, K: E.K(P.rx, P.T), changes: P.changes.slice(), origin: P.origin, stop: !!o.stop };
  const earlier = P.rows.filter(r => r.seg === P.seg).slice(-30);
  P.rows.push(row);
  P.changes = []; P.pending = false;
  emit(P, 'settle', Object.assign({}, row, { prev: earlier[earlier.length - 1] || null, earlier }));
  return row;
}
/** 播放到平衡（每幀 1/60 秒）；傳回花了多少「真實時間」秒 */
function run(P, maxWall) {
  const dtw = 1 / 60;
  let wall = 0;
  if (P.waiting) throw new Error('預測中，模擬應該停住');
  while (wall < (maxWall || 600)) {
    const o = opts(P);
    const g0 = E.xiRange(P.rx, P.n);
    if (g0.hi - g0.lo > 1e-12) P.n = E.relax(P.rx, P.n, o, dtw * SPEEDS[P.speed], P.cat);
    wall += dtw;
    const g = E.lnQK(P.rx, P.n, opts(P));
    if (isFinite(g) && Math.abs(g) < 1e-3) P.settledFor += dtw; else P.settledFor = 0;
    if (P.pending && P.settledFor >= 0.3) { settleNow(P); return wall; }
    if (!P.pending) return wall;
  }
  return Infinity;
}
function predict(P, choice) {
  const w = P.waiting, ks = Object.keys(w.kinds), kind = ks.length === 1 ? ks[0] : 'mix';
  const ok = choice === w.truth;
  if (ok) { P.streak++; P.kinds[kind] = 1; if (w.truth === 0) P.zero = true; } else { P.streak = 0; P.kinds = {}; P.zero = false; }
  P.waiting = null;
  emit(P, 'predict', { ok, streak: P.streak, kinds: Object.keys(P.kinds).length, zero: P.zero, truth: w.truth, choice, kind });
  return ok;
}
function lnKRow(r) { const R = E.RX[r.rx]; let s = 0; R.sp.forEach((k, i) => { s += R.nu[i] * Math.log(r.p[k]); }); return s; }

// ---------- 0. 預設狀態不觸發任務 ----------
function freshMissions() { missions.forEach(m => { m.done = false; }); }
let bad = 0;
const results = {};
function report(name, P, ids) {
  ids.forEach(id => {
    const ok = P.events.includes(id);
    results[id] = (results[id] || false) || ok;
    console.log((ok ? '  ✓ ' : '  ✗ ') + id + '：' + name);
  });
}
console.log('預設狀態（每個反應從反應物、從生成物開始，等到平衡，假裝已操作過）：');
['n2o4', 'haber', 'hi'].forEach(rx => ['R', 'P'].forEach(side => {
  freshMissions();
  const P = newPage(rx, side);
  P.acted = true;
  const w = run(P);
  console.log('  ' + rx + ' 從' + (side === 'R' ? '反應物' : '生成物') + '：真實時間 ' + w.toFixed(1) + ' s 平衡，觸發 ' + (P.events.join('、') || '無'));
  // 從生成物開始的哈柏法在 700 K 平衡不應觸發 h3（T < 850）
  if (P.events.length) bad++;
}));

// ---------- 1. 壓一壓 ----------
freshMissions();
let P = newPage('n2o4'); run(P);
setV(P, 30); const w1 = run(P);
report('n2o4 50 → 30 mL（真實時間 ' + w1.toFixed(1) + ' s）', P, ['chemical-equilibrium-1']);
// ---------- 2. 熱水 ----------
setT(P, 340); run(P);
report('n2o4 298 → 340 K', P, ['chemical-equilibrium-2']);
// ---------- 3、h1. 冰水 ----------
freshMissions();
P = newPage('n2o4'); run(P);
setT(P, 273); run(P); setV(P, 20); run(P);
report('n2o4 273 K、20 mL：x(N2O4) = ' + P.rows[P.rows.length - 1].x.N2O4.toFixed(3), P, ['chemical-equilibrium-3']);
for (let k = 0; k < 8; k++) amount(P, 'N2O4', 1);
setV(P, 10); run(P);
report('n2o4 273 K、10 mL、N2O4 加到 6 mmol：x(NO2) = ' + P.rows[P.rows.length - 1].x.NO2.toFixed(3), P, ['chemical-equilibrium-h1']);
// ---------- 4. HI 壓縮不動 ----------
freshMissions();
P = newPage('hi'); const w4a = run(P);
setV(P, 25); const w4 = run(P);
report('hi 700 K 50 → 25 mL（第一次平衡 ' + w4a.toFixed(1) + ' s，壓縮後 ' + w4.toFixed(2) + ' s）', P, ['chemical-equilibrium-4']);
// ---------- 5. 定容加氬 ----------
freshMissions();
P = newPage('n2o4'); run(P);
for (let k = 0; k < 6; k++) amount(P, 'Ar', 1);
run(P);
report('n2o4 定容加入 3 mmol 氬', P, ['chemical-equilibrium-5']);
// ---------- 6. 定壓加氬 ----------
freshMissions();
P = newPage('n2o4'); run(P);
setMode(P, 'P');
amount(P, 'Ar', 1); amount(P, 'Ar', 1);
run(P);
const r6 = P.rows[P.rows.length - 1], r6a = P.rows[P.rows.length - 2];
report('n2o4 定壓（' + r6.P.toFixed(3) + ' bar）加入 1 mmol 氬：NO2 變為 ' + (r6.n.NO2 / r6a.n.NO2).toFixed(3) + ' 倍', P, ['chemical-equilibrium-6']);
// ---------- 7. 哈柏法低溫高產率 ----------
freshMissions();
P = newPage('haber'); run(P);
setCat(P, true); setT(P, 500); P.speed = 2;
const w7 = run(P);
report('haber 有催化劑 500 K、×100（真實時間 ' + w7.toFixed(1) + ' s）：x(NH3) = ' + P.rows[P.rows.length - 1].x.NH3.toFixed(3), P, ['chemical-equilibrium-7']);
// 沒有催化劑要多久
{ const Q = newPage('haber'); run(Q); setT(Q, 500); Q.speed = 2; const w = run(Q, 3600); console.log('  （對照：沒有催化劑 500 K、×100 要 ' + w.toFixed(0) + ' s 真實時間）'); }
// ---------- 9. 又快又多 ----------
freshMissions();
P = newPage('haber'); run(P);
setV(P, 20); run(P);
report('haber 700 K、20 mL：x(NH3) = ' + P.rows[P.rows.length - 1].x.NH3.toFixed(3) + '，P = ' + P.rows[P.rows.length - 1].P.toFixed(0) + ' bar', P, ['chemical-equilibrium-9']);
// ---------- h3. 從生成物開始的哈柏法 ----------
freshMissions();
P = newPage('haber', 'P'); P.acted = true;
setT(P, 900); setV(P, 200); run(P);
report('haber 從生成物開始、900 K、200 mL：x(NH3) = ' + P.rows[P.rows.length - 1].x.NH3.toFixed(4), P, ['chemical-equilibrium-h3']);
// ---------- h2. 換季不換色 ----------
freshMissions();
P = newPage('n2o4'); run(P);
setT(P, 330); run(P);
const c0 = P.rows[P.rows.length - 1].c.NO2;
setT(P, 300);
// 找一個體積讓 c(NO2) 和 298 K 時一樣（學生可以用試誤：看讀數表的 c）
let lo = 10, hi = 100;
for (let k = 0; k < 40; k++) {
  const mid = (lo + hi) / 2;
  const m = E.equilibrium('n2o4', P.n, { T: 300, V: mid / 1000 }).n;
  const c = E.props('n2o4', m, { T: 300, V: mid / 1000 }).c.NO2;
  if (c > c0) lo = mid; else hi = mid;
}
const Vh = Math.round((lo + hi) / 2 * 10) / 10;
setV(P, Vh); run(P);
report('n2o4 先熱到 330 K 平衡，再冷到 300 K、體積 ' + Vh + ' mL（滑桿 0.1 mL 精度）：c(NO2) ' + c0.toExponential(4) + ' → ' + P.rows[P.rows.length - 1].c.NO2.toExponential(4), P, ['chemical-equilibrium-h2']);
// ---------- 8、10. 預測模式 ----------
freshMissions();
P = newPage('n2o4'); run(P);
P.pred = true;
const seq = [
  ['T+', p => setT(p, p.T + 10)], ['V-', p => setV(p, p.V - 10)], ['add-R', p => amount(p, 'N2O4', 1)], ['ArV', p => amount(p, 'Ar', 1)],
  ['rem-P', p => amount(p, 'NO2', -1)], ['T-', p => setT(p, p.T - 10)], ['V+', p => setV(p, p.V + 10)], ['cat', p => setCat(p, !p.cat)],
  ['add-P', p => amount(p, 'NO2', 1)], ['rem-R', p => amount(p, 'N2O4', -1)]
];
seq.forEach(s => {
  s[1](P);
  if (!P.waiting) throw new Error('沒有進入預測：' + s[0]);
  // 學生依勒沙特列原理作答
  const expect = { 'T+': 1, 'T-': -1, 'V-': -1, 'V+': 1, 'add-R': 1, 'add-P': -1, 'rem-R': -1, 'rem-P': 1, ArV: 0, cat: 0 }[s[0]];
  if (expect !== P.waiting.truth) { console.log('  ✗ 預測的真值與勒沙特列原理不一致：' + s[0] + ' 真值 ' + P.waiting.truth); bad++; }
  predict(P, expect);
  run(P);
});
report('預測 10 題（10 種改變，含 2 題不移動）', P, ['chemical-equilibrium-8', 'chemical-equilibrium-10']);
// 哈柏法與 HI 的預測真值也要和勒沙特列一致
[['haber', [['V-', p => setV(p, p.V - 10), 1], ['T+', p => setT(p, p.T + 20), -1], ['ArV', p => amount(p, 'Ar', 1), 0]]],
  ['hi', [['V-', p => setV(p, p.V - 10), 0], ['T+', p => setT(p, p.T + 20), -1], ['add-R', p => amount(p, 'H2', 1), 1]]]].forEach(c => {
  const Q = newPage(c[0]); run(Q); Q.pred = true;
  c[1].forEach(s => { s[1](Q); const ok = Q.waiting && Q.waiting.truth === s[2]; if (!ok) bad++; console.log('  ' + (ok ? '✓' : '✗') + ' ' + c[0] + ' ' + s[0] + ' 的真值 ' + (Q.waiting ? Q.waiting.truth : '無')); predict(Q, s[2]); run(Q); });
});
// ---------- 11、12. 未知反應 ----------
let ok11 = 0, ok12 = 0, N = 200;
let rs = 1;
const rng = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
for (let trial = 0; trial < N; trial++) {
  freshMissions();
  const mp = E.newMystery(rng);
  P = newPage('mys'); P.mysId = 1; P.acted = true;
  run(P);
  [290, 350, 410].forEach(Tk => { setT(P, Tk); run(P); });
  // 學生由紀錄表的分壓（顯示 3 位有效數字）算 ln K，再用斜率求 ΔH
  const pts = P.rows.filter(r => r.mys === 1).map(r => {
    const p3 = {}; Object.keys(r.p).forEach(k => { p3[k] = +r.p[k].toPrecision(3); });
    return { T: r.T, K: Math.exp(lnKRow(Object.assign({}, r, { p: p3 }))) };
  });
  const two = E.vantHoff([pts[1], pts[3]]), all = E.vantHoff(pts);
  const ts = {}; pts.forEach(p => { ts[p.T] = 1; });
  const st = { nT: Object.keys(ts).length };
  let lo2 = Infinity, hi2 = -Infinity; pts.forEach(p => { lo2 = Math.min(lo2, p.T); hi2 = Math.max(hi2, p.T); });
  emit(P, 'answer', { ans: +two.dH.toFixed(1), err: Math.abs(+two.dH.toFixed(1) - mp.dH) / mp.dH, nT: 2, span: 60, tries: 1, revealed: false });
  if (P.events.includes('chemical-equilibrium-11')) ok11++;
  emit(P, 'answer', { ans: +all.dH.toFixed(1), err: Math.abs(+all.dH.toFixed(1) - mp.dH) / mp.dH, nT: st.nT, span: hi2 - lo2, tries: 2, revealed: false });
  if (P.events.includes('chemical-equilibrium-12')) ok12++;
}
results['chemical-equilibrium-11'] = ok11 > 0; results['chemical-equilibrium-12'] = ok12 > 0;
console.log('  未知反應 ' + N + ' 次（290、350、410 K，分壓取 3 位有效數字）：任務 11 成功 ' + ok11 + ' 次，任務 12 成功 ' + ok12 + ' 次');

// ---------- 結論 ----------
const missing = missions.filter(m => !results[m.id]).map(m => m.id);
let stars = 0, hid = 0;
missions.forEach(m => { if (m.hidden) hid += 2 * m.level; else stars += m.level; }); // 隱藏任務星星 = 等級 × 2（LabMission.starsOf）
console.log('\n公開任務 ' + missions.filter(m => !m.hidden).length + ' 個（' + stars + ' 顆星）、隱藏任務 ' + missions.filter(m => m.hidden).length + ' 個（' + hid + ' 顆星）');
if (missing.length || bad) { console.log('✗ 沒有做到：' + missing.join('、') + (bad ? '（另有 ' + bad + ' 項錯誤）' : '')); process.exit(1); }
console.log('✓ 全部任務都做得到，預設狀態不觸發任務');
