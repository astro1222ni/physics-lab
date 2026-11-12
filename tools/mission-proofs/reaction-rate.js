/* 任務可達成的證明腳本。用法：node tools/mission-proofs/reaction-rate.js
 * 用化學核心模擬頁面（js/reaction-rate.js）的操作與事件：每一幀前進 0.5 ps（正常速度約 25 幀／秒），
 * 每 10 ps 送一次 'tick'（頁面是每 0.5 秒一次＝正常速度 10 ps），改條件就把這一次收進數據表、開始新的一次；
 * 未知反應「核對答案」送 'answer'。確認每個任務都做得到、預設狀態不會觸發任務；
 * 有隨機性的任務另做多次，看照建議做法的成功率。修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(__ROOT + 'js/reaction-rate-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({ mem: {} }, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/reaction-rate.js');

// ---------- 模擬頁面（與 js/reaction-rate.js 的 cfg／makeRun／summary／eqWindow／emitTick 一致） ----------
let seedBase = 1;
function keyOf(c) { return c.mys ? 'm' + c.mys : [c.Ea, c.dH, c.cat ? 1 : 0, c.steric ? 1 : 0].join('|'); }
function newPage(c) {
  const P = { c: Object.assign({ T: 400, Ea: 10, dH: -10, cat: false, steric: false, heat: false, nA: 100, nB: 100, mys: 0 }, c || {}), runs: [], cur: null, speed: 1, mysE0: null, mysId: 0, tries: 0 };
  P.cur = makeRun(P);
  return P;
}
function makeRun(P) {
  const c = Object.assign({}, P.c);
  if (c.mys) { c.Ea = P.mysE0; c.dH = -30; c.cat = false; c.steric = false; c.heat = false; }
  const sim = K.createSim({ T: c.T, Ea: c.Ea, dH: c.dH, cat: c.cat, steric: c.steric, nA: c.nA, nB: c.nB, heat: c.heat ? 'gas' : 'bath', seed: seedBase++ });
  sim.keepEvents = true;
  return { id: P.runs.length + 1, cfg: c, key: keyOf(c), sim, slowFwd: 0, Tgas: c.T, TgasMax: c.T, eqS: [{ t: 0, f: 0, r: 0 }], nextEq: 5 };
}
function summary(r) {
  const s = r.sim, st = s.stats, m = K.measure(s), c = r.cfg;
  const lim = Math.min(s.n0[K.A], s.n0[K.B]);
  return { id: r.id, key: r.key, mys: c.mys, T: c.T, Ea: c.mys ? null : c.Ea, EaF: c.mys ? null : s.EaF, dH: c.dH, cat: c.cat, steric: c.steric, heat: c.heat,
    nA: c.nA, nB: c.nB, t: s.t, collAB: st.collAB, enoughAB: st.enoughAB, fwd: st.fwd, rev: st.rev, k: st.fwd > 0 ? m.kF_SI : null, kErr: m.relErrF,
    rate0: m.rate0, rate0n: m.rate0n, tHalf: st.tHalf, t10: st.t10, conv: lim > 0 ? (st.fwd - st.rev) / lim : 0,
    fracObs: m.fracObs, effObs: m.effObs, fracTh: c.mys ? null : K.fracAbove(s.EaF, c.T), Tgas: r.Tgas, TgasMax: r.TgasMax, slowFwd: r.slowFwd };
}
/** 改條件：這一次收進數據表（滿 5 ps 而且有 A–B 碰撞），開始新的一次 */
function set(P, o) {
  const r = P.cur;
  if (r.sim.t >= 5 && r.sim.stats.collAB > 0) { P.runs.push(summary(r)); if (P.runs.length > 40) P.runs.shift(); }
  Object.assign(P.c, o || {});
  P.cur = makeRun(P);
}
function eqWindow(r) {
  const s = r.sim, list = r.eqS;
  let base = list[0];
  for (let i = list.length - 1; i >= 0; i--) if (list[i].t <= s.t - 500 + 1e-9) { base = list[i]; break; }
  return { span: s.t - base.t, f: s.stats.fwd - base.f, r: s.stats.rev - base.r };
}
function distinctT(rows) { const s = {}; rows.forEach(r => { s[r.T] = 1; }); return Object.keys(s).length; }
function tickData(P) {
  const rows = P.runs.concat([summary(P.cur)]);
  let arr = null;
  const c = P.cur.cfg;
  if (!c.mys && !c.heat) {
    const grp = rows.filter(r => r.key === P.cur.key && !r.heat && r.fwd >= 80 && r.k > 0);
    if (grp.length >= 2 && distinctT(grp) >= 2) {
      const f = K.arrhenius(grp.map(r => ({ T: r.T, k: r.k, n: r.fwd })));
      let lo = Infinity, hi = -Infinity;
      grp.forEach(r => { lo = Math.min(lo, r.T); hi = Math.max(hi, r.T); });
      if (f) arr = { nT: distinctT(grp), span: hi - lo, Ea: f.Ea, EaApp: K.apparentEa(P.cur.sim.EaF, grp.map(r => ({ T: r.T, n: r.fwd }))), EaF: P.cur.sim.EaF };
    }
  }
  return { run: rows[rows.length - 1], runs: rows, eq: eqWindow(P.cur), arr, speed: P.speed };
}
/** 前進：每一幀 0.5 ps，每 10 ps 送一次 tick；until(P) 成立或到 maxT（ps）就停。傳回這段時間完成的任務代號 */
function run(P, maxT, until) {
  const r = P.cur, s = r.sim, hits = [];
  let nextTick = s.t + 10;
  while (s.t < maxT) {
    K.advance(s, 0.5);
    for (const e of s.ev) if (e.kind === 2 && P.speed === 0) r.slowFwd++;
    s.ev.length = 0;
    r.Tgas = K.kineticTemp(s);
    if (s.t > 2) r.TgasMax = Math.max(r.TgasMax, r.Tgas);
    while (s.t >= r.nextEq) { r.eqS.push({ t: s.t, f: s.stats.fwd, r: s.stats.rev }); r.nextEq += 5; if (r.eqS.length > 400) r.eqS.splice(1, 1); }
    if (s.t >= nextTick) { nextTick += 10; hits.push.apply(hits, fire(P, 'tick', tickData(P))); }
    if (until && until(P)) { hits.push.apply(hits, fire(P, 'tick', tickData(P))); break; }
  }
  return hits;
}
function answer(P, ans) {
  const rows = P.runs.concat([summary(P.cur)]).filter(r => r.mys === P.mysId && r.fwd > 0 && r.k > 0);
  P.tries++;
  const app = K.apparentEa(P.mysE0, rows.map(r => ({ T: r.T, n: r.fwd })));
  const err = Math.min(Math.abs(ans - P.mysE0) / P.mysE0, Math.abs(ans - app) / app);
  const nT = distinctT(rows.filter(r => r.fwd >= 30));
  return { hits: fire(P, 'answer', { ans, err, nT, tries: P.tries, revealed: false }), err, nT, rows };
}
function fitFromTable(P) {
  const rows = P.runs.concat([summary(P.cur)]).filter(r => r.mys === P.mysId && r.fwd > 0 && r.k > 0);
  return K.arrhenius(rows.map(r => ({ T: r.T, k: r.k, n: r.fwd })));
}

// ---------- 任務判定（每次用乾淨的任務記憶） ----------
let only = null;   // 只判定某些任務（null = 全部）
function fire(P, type, data) {
  return missions.filter(m => (!only || only.indexOf(m.id) >= 0) && m.check({ type, data }, m.mem)).map(m => m.id);
}
const results = {};
function ok(id, cond, note) {
  results[id] = results[id] || { pass: 0, n: 0, notes: [] };
  results[id].n++;
  if (cond) results[id].pass++;
  if (note) results[id].notes.push(note);
}
const has = (hits, id) => hits.indexOf(id) >= 0;
const ID = n => 'reaction-rate-' + n;
const t0 = Date.now();

// 0. 預設狀態（正常速度、什麼都不改，跑 2000 ps）不會觸發任何任務
{
  const P = newPage();
  const hits = run(P, 2000);
  console.log('預設狀態 2000 ps 觸發的任務：', hits.length ? Array.from(new Set(hits)).join(', ') : '（沒有）');
  if (hits.length) process.exitCode = 1;
}

// 1. 慢動作看到一次反應
{
  const P = newPage(); P.speed = 0;
  const hits = run(P, 200, Q => Q.cur.slowFwd >= 1);
  ok(ID(1), has(hits, ID(1)), '慢動作 ' + num(P.cur.sim.t) + ' ps 看到第一次反應');
}
// 2. 700 K 轉化一半
{
  const P = newPage(); set(P, { T: 700 });
  const hits = run(P, 1000, Q => Q.cur.sim.stats.tHalf != null);
  ok(ID(2), has(hits, ID(2)), '700 K 半生期 ' + num(P.cur.sim.stats.tHalf) + ' ps');
}
// 3. 半生期 270–330 ps：用理論的 t½ = V/(k·N_A0) 選溫度（Ea 10、ΔH −10、各 100 個）
{
  let best = null;
  for (let Tk = 200; Tk <= 1000; Tk += 10) {
    const th = K.theory({ T: Tk, Ea: 10, dH: -10, nA: 100, nB: 100 });
    const th2 = K.V / (th.kF * 100);
    if (!best || Math.abs(th2 - 300) < Math.abs(best.t - 300)) best = { T: Tk, t: th2 };
  }
  for (let k = 0; k < 10; k++) {
    const P = newPage(); set(P, { T: best.T });
    const hits = run(P, 800, Q => Q.cur.sim.stats.tHalf != null);
    ok(ID(3), has(hits, ID(3)), k ? null : '選 T = ' + best.T + ' K（理論 t½ = ' + num(best.t) + ' ps），模擬 ' + num(P.cur.sim.stats.tHalf) + ' ps');
  }
}
// 4. 濃度加倍、k 不變：600 K，A 100 → 200（B 100），各跑到 80 次反應
for (let k = 0; k < 10; k++) {
  only = [ID(4)];
  const P = newPage(); set(P, { T: 600, nA: 100, nB: 100 });
  run(P, 3000, Q => Q.cur.sim.stats.fwd >= 80);
  set(P, { nA: 200 });
  const hits = run(P, 3000, Q => Q.cur.sim.stats.fwd >= 80);
  ok(ID(4), has(hits, ID(4)), k ? null : 'k 比值 ' + (summary(P.cur).k / P.runs[P.runs.length - 1].k).toFixed(3));
  only = null;
}
// 5. 方向因子：800 K、Ea 5、各 200 個，累積 300 次以上能量足夠的碰撞
for (let k = 0; k < 10; k++) {
  only = [ID(5)];
  const P = newPage(); set(P, { T: 800, Ea: 5, steric: true, nA: 200, nB: 200 });
  const hits = run(P, 2000, Q => Q.cur.sim.stats.enoughAB >= 400);
  const st = P.cur.sim.stats;
  ok(ID(5), has(hits, ID(5)), k ? null : '有效／能量足夠 = ' + st.fwd + '/' + st.enoughAB + ' = ' + (st.fwd / st.enoughAB).toFixed(3));
  only = null;
}
// 6. 催化劑：Ea 20、300 K、ΔH −10、各 200 個
for (let k = 0; k < 5; k++) {
  only = [ID(6)];
  const P = newPage(); set(P, { T: 300, Ea: 20, cat: true, nA: 200, nB: 200 });
  const hits = run(P, 1500, Q => Q.cur.sim.stats.tHalf != null);
  ok(ID(6), has(hits, ID(6)), k ? null : '催化 300 K 半生期 ' + num(P.cur.sim.stats.tHalf) + ' ps（沒有催化劑時理論 ' +
    num(K.V / (K.theory({ T: 300, Ea: 20, dH: -10, nA: 200, nB: 200 }).kF * 200)) + ' ps）');
  only = null;
}
// 7. 10%：500 K、Ea 9.5（e^(−Ea/RT) = 0.1017）、各 200 個，3000 次以上 A–B 碰撞
for (let k = 0; k < 10; k++) {
  only = [ID(7)];
  const P = newPage(); set(P, { T: 500, Ea: 9.5, nA: 200, nB: 200 });
  const hits = run(P, 2000, Q => Q.cur.sim.stats.collAB >= 3500);
  const st = P.cur.sim.stats;
  ok(ID(7), has(hits, ID(7)), k ? null : '理論 ' + K.fracAbove(9.5, 500).toFixed(4) + '，模擬 ' + (st.enoughAB / st.collAB).toFixed(4) + '（' + st.collAB + ' 次）');
  only = null;
}
// 8. 動態平衡：ΔH −3、Ea 2、800 K、各 100 個，跑 1500 ps
for (let k = 0; k < 5; k++) {
  only = [ID(8)];
  const P = newPage(); set(P, { T: 800, Ea: 2, dH: -3 });
  const hits = run(P, 1500);
  const q = eqWindow(P.cur);
  ok(ID(8), has(hits, ID(8)), k ? null : '最後 500 ps：正 ' + q.f + '、逆 ' + q.r);
  only = null;
}
// 9. 阿瑞尼斯圖：Ea 10，在 400、600、800 K 各跑到 120 次反應（各 200 個）
for (let k = 0; k < 6; k++) {
  only = [ID(9)];
  const P = newPage(); set(P, { Ea: 10, nA: 200, nB: 200 });
  let hits = [];
  [400, 600, 800].forEach(Tk => { set(P, { T: Tk }); hits = hits.concat(run(P, 4000, Q => Q.cur.sim.stats.fwd >= 120)); });
  const d = tickData(P).arr;
  ok(ID(9), has(hits, ID(9)), k ? null : '擬合 Ea ' + d.Ea.toFixed(2) + '，應得 ' + d.EaApp.toFixed(2) + '（門檻 ' + d.EaF + '）');
  only = null;
}
// 10、11. 未知反應：600、800、1000 K 各跑到 150 次反應（各 200 個），讀阿瑞尼斯圖的斜率填答案
{
  const rnd = K.rng(20261112);
  let n10 = 0, n11 = 0, N = 8;
  const errs = [];
  for (let k = 0; k < N; k++) {
    only = [ID(10), ID(11)];
    const P = newPage({ nA: 200, nB: 200 });
    P.mysId = 1; P.mysE0 = K.mysteryEa(rnd);
    set(P, { mys: 1 });
    [600, 800, 1000].forEach(Tk => { set(P, { T: Tk }); run(P, 6000, Q => Q.cur.sim.stats.fwd >= 150); });
    const f = fitFromTable(P);
    const a = answer(P, Math.round(f.Ea * 10) / 10);
    errs.push((100 * a.err).toFixed(1) + '%');
    if (has(a.hits, ID(10))) n10++;
    if (has(a.hits, ID(11))) n11++;
    only = null;
  }
  ok(ID(10), n10 > 0, '8 個隨機未知反應中 ' + n10 + ' 個達 10%');
  ok(ID(11), n11 > 0, '8 個隨機未知反應中 ' + n11 + ' 個達 4%（誤差 ' + errs.join('、') + '）');
  results[ID(10)].rate = n10 / N; results[ID(11)].rate = n11 / N;
}
// h1. 千次擦肩：Ea 40、200 K
{
  only = [ID('h1')];
  const P = newPage(); set(P, { T: 200, Ea: 40, nA: 200, nB: 200 });
  const hits = run(P, 2000, Q => Q.cur.sim.stats.collAB >= 1000);
  ok(ID('h1'), has(hits, ID('h1')), '碰撞 ' + P.cur.sim.stats.collAB + ' 次、反應 ' + P.cur.sim.stats.fwd + ' 次');
  only = null;
}
// h2. 每次相遇都反應：Ea 0
{
  only = [ID('h2')];
  const P = newPage(); set(P, { Ea: 0 });
  const hits = run(P, 300, Q => Q.cur.sim.stats.collAB >= 60);
  ok(ID('h2'), has(hits, ID('h2')), '碰撞 ' + P.cur.sim.stats.collAB + '、反應 ' + P.cur.sim.stats.fwd);
  only = null;
}
// h3. 自我加熱：反應熱留在氣體裡、ΔH −40、Ea 2、200 K、各 200 個
{
  only = [ID('h3')];
  const P = newPage(); set(P, { T: 200, Ea: 2, dH: -40, heat: true, nA: 200, nB: 200 });
  const hits = run(P, 400);
  ok(ID('h3'), has(hits, ID('h3')), '氣體最高 ' + num(P.cur.TgasMax) + ' K（器壁 200 K）');
  only = null;
}

function num(x) { return x == null ? '—' : (+x).toFixed(0); }

// ---------- 報告 ----------
let fail = 0, stars = 0, hstars = 0;
missions.forEach(m => {
  const r = results[m.id];
  const pass = r && r.pass > 0;
  if (!pass) fail++;
  if (m.hidden) hstars += m.level; else stars += m.level;
  const rate = r ? (r.rate != null ? r.rate : r.pass / r.n) : 0;
  console.log((pass ? '✓ ' : '✗ ') + m.id + '（' + m.level + ' 級' + (m.hidden ? '，隱藏' : '') + '）成功率 ' + (100 * rate).toFixed(0) + '%' + (r && r.notes.length ? '：' + r.notes.join('；') : ''));
});
console.log('公開 ' + missions.filter(m => !m.hidden).length + ' 個 ' + stars + ' 顆星、隱藏 ' + missions.filter(m => m.hidden).length + ' 個 ' + hstars + ' 顆星；用時 ' + ((Date.now() - t0) / 1000).toFixed(0) + ' 秒');
if (fail) { console.log('有 ' + fail + ' 個任務沒有證明做得到'); process.exitCode = 1; }
