/* 任務可達成的證明腳本。用法：node tools/mission-proofs/polymerization.js
 * 用化學核心模擬頁面（js/polymerization.js）的操作與事件：每一幀 1/60 秒、依時間倍率前進模擬時間，
 * 反應進行中每 0.5 秒送一次 'tick'、反應結束時再送一次；「記錄數據」送 'record'（含同一段的紀錄）；「暫停」送 'hold'。
 * 確認每個任務都做得到、預設狀態不會觸發隱藏任務、每個隱藏任務的做法不會順便完成別的隱藏任務，
 * 並量出照建議做法要花多少真實時間。修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const PC = require(__ROOT + 'js/polymerization-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/polymerization.js');

const SPEEDS = [1, 5, 20, 60];
let bad = 0, seedNo = 11;
const done = {};
const hid = id => /-h\d+$/.test(id);
function freshMissions() { missions.forEach(m => { m.done = false; }); }

// ---------- 模擬頁面（與 js/polymerization.js 的 newRun／advance／afterAdvance／evData 一致） ----------
function newPage() {
  return { st: { mode: 'add', mon: 'styrene', init: 0.005, term: 'comb', pair: 'nylon66', q: 1, dry: true, speed: 1 }, rows: [], seg: 0, events: [], wall: 0, runSeq: 0, acted: true };
}
function newRun(P, o) {
  Object.assign(P.st, o || {});
  const s = P.st;
  P.runSeq++;
  P.sim = s.mode === 'add' ? PC.createAdd({ mon: s.mon, init: s.init, term: s.term, seed: seedNo++ })
    : PC.createCond({ pair: s.pair, q: s.q, dry: s.dry, seed: seedNo++ });
  P.run = { t50: null, eqXn: null, everDry: s.dry, ended: false };
  P.running = false;
}
function pMinEq(sim) { return PC.peqClosed(sim.K, sim.NA0, sim.NB0) / Math.min(sim.NA0, sim.NB0); }
function evData(P) {
  const sim = P.sim, s = PC.stats(sim), run = P.run;
  const d = { mode: sim.kind, t: sim.t, conv: s.conv, Xn: s.Xn, Xw: s.Xw, PDI: s.PDI, Mn: s.Mn, Mw: s.Mw, ended: !!s.ended, run: P.runSeq, seg: P.seg, running: P.running };
  if (sim.kind === 'add') {
    Object.assign(d, { mon: sim.mon, gas: !!PC.ADD_MON[sim.mon].gas, init: sim.init, term: sim.term, shrink: s.shrink, initLeft: s.initLeft, radicals: s.radicals,
      deadEnd: !!(s.ended && sim.NM > 0 && sim.NI === 0), t50: run.t50 });
  } else {
    const atEq = !P.st.dry && !run.everDry && s.peq != null && sim.t >= 20 && Math.abs(s.conv - s.peq) <= 0.004;
    Object.assign(d, { pair: sim.pair, ab: sim.ab, q: sim.q, r: s.r, dry: P.st.dry, everDry: run.everDry, closedAll: !run.everDry, pA: s.pA,
      waterOut: s.waterOut, waterMax: s.waterMax, peq: s.peq, atEq: atEq, eqXn: run.eqXn });
  }
  return d;
}
function emit(P, type, data) {
  if (!P.acted) return;
  const ev = { type, data };
  missions.forEach(m => { if (!m.done && m.check(ev)) { m.done = true; P.events.push(m.id); } });
}
function afterAdvance(P, tStart) {
  const sim = P.sim, run = P.run;
  if (sim.kind === 'add') {
    if (run.t50 == null && 1 - sim.NM / sim.N >= 0.5) run.t50 = tStart + (sim.t - tStart) * 0.5;
  } else if (!P.st.dry && !run.everDry && run.eqXn == null && sim.t >= 20) {
    if (Math.abs(PC.pMin(sim) - pMinEq(sim)) <= 0.004) run.eqXn = sim.N / sim.M;
  }
  if (PC.ended(sim) && !run.ended) { run.ended = true; P.running = false; emit(P, 'tick', evData(P)); }
}
function start(P) {
  if (PC.ended(P.sim)) newRun(P);
  P.running = true;
  if (P.sim.kind === 'cond' && P.st.dry) P.run.everDry = true;
}
/** 跑到 until(P) 成立或 maxSec 秒真實時間；傳回這段花的真實秒數 */
function wait(P, maxSec, until) {
  const w0 = P.wall, frames = Math.round(maxSec * 60);
  for (let k = 0; k < frames; k++) {
    if (!P.running) break;
    const sim = P.sim, t0 = sim.t, tEnd = t0 + SPEEDS[P.st.speed] / 60;
    while (sim.t < tEnd - 1e-12 && !PC.ended(sim)) PC.step(sim, tEnd - sim.t, 1e7);
    afterAdvance(P, t0);
    P.wall += 1 / 60;
    if (k % 30 === 29 && P.running) emit(P, 'tick', evData(P));
    if (until && until(P)) { if (P.running && k % 30 !== 29) emit(P, 'tick', evData(P)); break; }   // 頁面繼續跑，0.5 秒內會送下一個 tick
  }
  return P.wall - w0;
}
function hold(P) { P.running = false; emit(P, 'hold', evData(P)); }
function record(P) {
  const d = evData(P);
  d.n = P.rows.filter(r => r.seg === P.seg).length + 1;
  P.rows.push(d);
  emit(P, 'record', Object.assign({}, d, { rows: P.rows.filter(r => r.seg === P.seg) }));
  return d;
}
function setDry(P, v) {
  P.st.dry = v;
  if (P.sim.kind === 'cond') {
    P.sim.dry = v;
    if (v && (P.running || P.sim.t > 0)) P.run.everDry = true;
    if (!v && P.sim.t === 0) P.run.everDry = false;
  }
}
const conv = P => (P.sim.kind === 'add' ? 1 - P.sim.NM / P.sim.N : PC.pMin(P.sim));
const fmt = (x, d) => (+x).toFixed(d == null ? 3 : d);
const sec = x => x.toFixed(0) + ' 秒';

function report(label, P, id, extra) {
  const ok = P.events.includes(id);
  const others = P.events.filter(x => hid(x) && x !== id);
  const leak = hid(id) && others.length > 0;
  console.log('  ' + (ok && !leak ? '✓' : '✗') + ' ' + id + '：' + label + (extra ? '（' + extra + '）' : '') + '，真實時間約 ' + sec(P.wall) +
    (others.length ? (leak ? '；✗ 順便完成了隱藏任務 ' : '；順便完成的隱藏任務 ') + others.join('、') : ''));
  if (ok && !leak) done[id] = true; else bad++;
}

console.log('加成聚合與縮合聚合：任務證明');

// ---------- 預設狀態不觸發隱藏任務 ----------
{
  freshMissions(); const P = newPage();
  newRun(P); start(P); wait(P, 1200);
  record(P);
  const addEnd = evData(P);
  newRun(P, { mode: 'cond' }); start(P); wait(P, 1200); record(P);
  const condEnd = evData(P);
  // 預設設定下的暫停：每 1 秒停一次看看
  newRun(P, { mode: 'add' });
  for (let k = 0; k < 12; k++) { start(P); wait(P, 1); hold(P); }
  const hs = P.events.filter(hid);
  console.log('  ' + (hs.length ? '✗' : '✓') + ' 預設設定（苯乙烯 0.5%、結合終止；耐綸 1:1 除水）跑到底、記錄、每秒暫停：觸發的隱藏任務 ' + (hs.join('、') || '沒有') +
    '（加成停在 ' + fmt(addEnd.conv * 100, 1) + '%、Xn ' + fmt(addEnd.Xn, 0) + '；縮合 p = ' + fmt(condEnd.conv, 5) + '、Xn ' + fmt(condEnd.Xn, 0) + '）');
  if (hs.length) bad++;
}

// ---------- 一般任務 ----------
let P;
freshMissions(); P = newPage(); newRun(P); start(P); wait(P, 600, Q => conv(Q) >= 0.5);
report('苯乙烯 0.5%、×5 按開始，轉化率到 50%', P, 'polymerization-1');

freshMissions(); P = newPage(); newRun(P, { mode: 'cond' }); start(P); wait(P, 600, Q => PC.stats(Q.sim).waterOut >= 1.0);
report('耐綸 1:1 除水、×5，收集到 1.00 g 水', P, 'polymerization-2');

freshMissions(); P = newPage(); newRun(P, { mon: 'tfe', init: 0.0005 }); P.st.speed = 3; start(P); wait(P, 600, Q => conv(Q) >= 0.12);
report('四氟乙烯、起始劑 0.05%、×60，轉化率 12%', P, 'polymerization-3', 'Mn = ' + fmt(PC.stats(P.sim).Mn, 0));

freshMissions(); P = newPage(); newRun(P); P.st.speed = 3; start(P); wait(P, 600, Q => conv(Q) >= 0.76);
report('苯乙烯 0.5%、×60，轉化率 76%', P, 'polymerization-4', '收縮 ' + fmt(PC.stats(P.sim).shrink * 100, 1) + '%');

freshMissions(); P = newPage(); newRun(P, { mode: 'cond' }); P.st.speed = 3; start(P); wait(P, 600, Q => PC.stats(Q.sim).Xn >= 21);
report('耐綸 1:1 除水、×60', P, 'polymerization-5');

freshMissions(); P = newPage(); newRun(P, { mode: 'cond', dry: false }); P.st.speed = 3; start(P); wait(P, 600, Q => Q.events.includes('polymerization-6'));
report('耐綸、取消除水後開始、×60，等到平衡', P, 'polymerization-6', 'p = ' + fmt(conv(P), 4) + '、p_eq = ' + fmt(pMinEq(P.sim), 4) + '、Xn ' + fmt(P.sim.N / P.sim.M, 1));

freshMissions(); P = newPage(); newRun(P, { mode: 'cond', dry: false }); P.st.speed = 3; start(P); wait(P, 600, Q => Q.run.eqXn != null);
{
  const eq = P.run.eqXn; setDry(P, true); wait(P, 600, Q => Q.events.includes('polymerization-7'));
  report('耐綸密閉到平衡，再打開除水、×60', P, 'polymerization-7', '平衡 Xn ' + fmt(eq, 1) + ' → ' + fmt(P.sim.N / P.sim.M, 1));
}

freshMissions(); P = newPage(); newRun(P); start(P); wait(P, 600, Q => conv(Q) >= 0.05); hold(P); record(P);
newRun(P, { mode: 'cond', q: 1.5 }); P.st.speed = 3; start(P); wait(P, 1200); record(P);
report('苯乙烯 0.5% 在 5% 時記錄；耐綸 q = 1.5 除水跑到底再記錄', P, 'polymerization-8', '縮合 Xn ' + fmt(P.sim.N / P.sim.M, 2));

{
  freshMissions(); P = newPage();
  newRun(P, { init: 0.002 }); P.st.speed = 3; start(P); wait(P, 600, Q => conv(Q) >= 0.5); hold(P); const a = record(P);
  newRun(P, { init: 0.008 }); start(P); wait(P, 600, Q => conv(Q) >= 0.5); hold(P); const b = record(P);
  report('苯乙烯結合終止：起始劑 0.2% 與 0.8%，都在 50% 時記錄', P, 'polymerization-9', 'Xn 比 ' + fmt(a.Xn / b.Xn, 2));
}

freshMissions(); P = newPage(); newRun(P, { mode: 'cond', q: 0.95 }); P.st.speed = 3; start(P); wait(P, 1200, Q => conv(Q) >= 0.996);
report('耐綸 q = 0.95 除水、×60', P, 'polymerization-10', 'r = ' + fmt(PC.stats(P.sim).r, 3));

/** 暫停時 Đ 落在範圍內的比例（不同亂數） */
function holdRate(term, lo, hi, id, n) {
  let ok = 0, worst = 0, wall = 0;
  const leaks = new Set();
  for (let k = 0; k < n; k++) {
    freshMissions(); const Q = newPage(); newRun(Q, { term: term }); start(Q); wait(Q, 60, R => conv(R) >= 0.08); hold(Q);
    const d = PC.stats(Q.sim);
    worst = Math.max(worst, Math.abs(d.PDI - (lo + hi) / 2));
    if (Q.events.includes(id)) ok++;
    Q.events.filter(x => hid(x) && x !== id).forEach(x => leaks.add(x));
    wall = Q.wall;
  }
  const pass = ok >= n * 0.9 && !(hid(id) && leaks.size);
  console.log('  ' + (pass ? '✓' : '✗') + ' ' + id + '：' + (term === 'comb' ? '結合' : '歧化') + '終止、苯乙烯 0.5%、×5，轉化率 8% 時暫停（' + n + ' 次）：成功 ' + ok + ' 次，Đ 最多偏離 ' + fmt(worst, 3) +
    '，真實時間約 ' + sec(wall) + (leaks.size ? '；順便完成 ' + [...leaks].join('、') : ''));
  if (pass) done[id] = true; else bad++;
}
holdRate('comb', 1.40, 1.65, 'polymerization-11', 20);

{
  // 解出 Mn = 10 000 的莫耳比：先用卡羅瑟斯方程式估計，再照模擬微調
  let q = 1 / 0.9775, best = null;
  for (let it = 0; it < 6; it++) {
    freshMissions(); P = newPage(); newRun(P, { mode: 'cond', q: +q.toFixed(4) }); P.st.speed = 3; start(P);
    wait(P, 1200, Q => Q.events.includes('polymerization-12') || PC.ended(Q.sim));
    const Mn = PC.stats(P.sim).Mn;
    best = { q: +q.toFixed(4), Mn: Mn, P: P };
    if (P.events.includes('polymerization-12')) break;
    // Mn ∝ 1/(1 − r)：r 往 Mn 想要的方向修正
    const r = 1 / q, r2 = 1 - (1 - r) * Mn / 10000;
    q = 1 / r2;
  }
  P = best.P;
  report('耐綸 q = ' + best.q + '（r = ' + fmt(1 / best.q, 4) + '）除水、×60，跑到 p ≥ 99.95%', P, 'polymerization-12', 'Mn = ' + fmt(best.Mn, 0));
}

// ---------- 隱藏任務 ----------
freshMissions(); P = newPage(); newRun(P, { init: 0.0013 }); P.st.speed = 3; start(P); wait(P, 1200);
report('苯乙烯、起始劑 0.13%、×60 跑到底（起始劑用完）', P, 'polymerization-h1', '停在 ' + fmt(conv(P) * 100, 1) + '%');

freshMissions(); P = newPage(); newRun(P, { mode: 'cond', pair: 'pet', dry: false }); P.st.speed = 3; start(P); wait(P, 600, Q => Q.events.includes('polymerization-h2'));
report('PET、取消除水、×60 等到平衡', P, 'polymerization-h2', 'p = ' + fmt(conv(P), 4));

freshMissions(); P = newPage(); newRun(P, { mon: 'mma', init: 0.02 }); P.st.speed = 3; start(P); wait(P, 1200);
report('甲基丙烯酸甲酯、起始劑 2%、×60 跑到底', P, 'polymerization-h3', '收縮 ' + fmt(PC.stats(P.sim).shrink * 100, 2) + '%');

{
  freshMissions(); P = newPage();
  newRun(P, { term: 'comb' }); start(P); wait(P, 600, Q => conv(Q) >= 0.3); hold(P); const a = record(P);
  newRun(P, { term: 'disp' }); start(P); wait(P, 600, Q => conv(Q) >= 0.3); hold(P); const b = record(P);
  report('苯乙烯 0.5%：結合、歧化各在 30% 時記錄', P, 'polymerization-h4', 'Xn 比 ' + fmt(a.Xn / b.Xn, 3));
}
{
  // h4 的穩定度：多試幾次
  let ok = 0; const n = 10;
  for (let k = 0; k < n; k++) {
    freshMissions(); const Q = newPage();
    newRun(Q, { term: 'comb' }); start(Q); wait(Q, 600, R => conv(R) >= 0.3); hold(Q); record(Q);
    newRun(Q, { term: 'disp' }); start(Q); wait(Q, 600, R => conv(R) >= 0.3); hold(Q); record(Q);
    if (Q.events.includes('polymerization-h4')) ok++;
  }
  console.log('    （h4 重做 ' + n + ' 次成功 ' + ok + ' 次）');
  if (ok < n * 0.9) { bad++; console.log('  ✗ h4 不夠穩定'); }
}

holdRate('disp', 1.85, 2.15, 'polymerization-h5', 20);

freshMissions(); P = newPage(); newRun(P, { mode: 'cond', q: 2 }); P.st.speed = 3; start(P); wait(P, 1200);
report('耐綸 q = 2（滑桿拉到最右）除水、×60 跑到底', P, 'polymerization-h6', 'Xn = ' + fmt(P.sim.N / P.sim.M, 3));

{
  freshMissions(); P = newPage();
  newRun(P, { init: 0.001 }); P.st.speed = 3; start(P); wait(P, 1200, Q => conv(Q) >= 0.55); hold(P); const a = record(P);
  newRun(P, { init: 0.025 }); start(P); wait(P, 1200, Q => conv(Q) >= 0.55); hold(P); const b = record(P);
  report('苯乙烯 0.1% 與 2.5%（差 25 倍），過了一半後各記錄一次', P, 'polymerization-h7',
    't½ ' + fmt(a.t50, 1) + ' s 與 ' + fmt(b.t50, 1) + ' s，比值 ÷ √25 = ' + fmt(a.t50 / b.t50 / 5, 2));
}

freshMissions(); P = newPage(); newRun(P, { mode: 'cond', q: 1.0101 }); P.st.speed = 3; start(P); wait(P, 1800);
report('耐綸 q = 1.0101（r = 0.990）除水、×60 跑到底', P, 'polymerization-h8', 'Xn = ' + fmt(P.sim.N / P.sim.M, 1));

{
  freshMissions(); P = newPage();
  newRun(P); start(P); wait(P, 600, Q => conv(Q) >= 0.5); hold(P); const a = record(P);
  // 用卡羅瑟斯方程式估計：Mn ≈ Xn × 113.16、Xn = (1 + r)/(1 − r)（p → 1）
  let r = (a.Mn / 113.16 - 1) / (a.Mn / 113.16 + 1), last = null;
  for (let it = 0; it < 6 && !P.events.includes('polymerization-h9'); it++) {
    newRun(P, { mode: 'cond', q: +(1 / r).toFixed(4) }); P.st.speed = 3; start(P); wait(P, 1800); last = record(P);
    r = 1 - (1 - (1 / +(1 / r).toFixed(4))) * last.Mn / a.Mn;
  }
  report('苯乙烯 0.5% 在 50% 時記錄（Mn ' + fmt(a.Mn, 0) + '），再調耐綸的莫耳比跑到底記錄', P, 'polymerization-h9', '耐綸 q = ' + fmt(last.q, 4) + '、Mn ' + fmt(last.Mn, 0));
}

{
  // 起始劑少到剛好停在一半
  let I = 0.00015, out = null;
  for (let it = 0; it < 5; it++) {
    freshMissions(); P = newPage(); newRun(P, { init: +I.toPrecision(3) }); P.st.speed = 3; start(P); wait(P, 3000);
    out = conv(P);
    if (P.events.includes('polymerization-h10')) break;
    // x∞ = 1 − exp(−c√I)：c√I = −ln(1 − x)
    I = I * Math.pow(Math.log(0.5) / Math.log(1 - out), 2);
  }
  report('苯乙烯、起始劑 ' + (P.st.init * 100).toPrecision(3) + '%、×60 跑到底', P, 'polymerization-h10', '停在 ' + fmt(out * 100, 2) + '%');
}

// ---------- 總結 ----------
const missing = missions.filter(m => !done[m.id]).map(m => m.id);
console.log(missing.length ? '  ✗ 沒有證明到的任務：' + missing.join('、') : '  ✓ ' + missions.length + ' 個任務都證明做得到');
if (missing.length) bad++;
const hidN = missions.filter(m => m.hidden);
console.log('    （一般 ' + missions.filter(m => !m.hidden).length + ' 個 ' + missions.filter(m => !m.hidden).reduce((a, m) => a + m.level, 0) + ' 顆星、隱藏 ' + hidN.length + ' 個 ' +
  hidN.reduce((a, m) => a + m.level * 2, 0) + ' 顆星；隱藏任務 7 級以上 ' + hidN.filter(m => m.level >= 7).length + ' 個）');
if (bad) { console.log('失敗 ' + bad + ' 項'); process.exitCode = 1; }
