/* 任務可達成的證明腳本。用法：node tools/mission-proofs/ohms-law.js
 * 用物理核心模擬頁面（js/ohms-law.js）的操作與事件，確認每個任務都做得到、預設狀態不會觸發任務；
 * 「含誤差」的任務另做蒙地卡羅：照建議的做法量很多次，看成功的機率。修改物理核心或任務條件後重跑。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(__ROOT + 'js/ohms-law-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({ mem: {} }, x)); } }; global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/ohms-law.js');

// ---------- 可重現的亂數 ----------
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------- 模擬頁面（與 js/ohms-law.js 的狀態、讀數、事件內容一致） ----------
function newPage(X, rng) {
  return { el: 'b', m: 'int', ra: 1, rv: 0, ideal: true, emf: 1, box: 10, zero: { A: 0, V: 0 }, zeroed: false,
    burnt: false, revealed: false, pts: [], lampCold: null, X: X || { nominal: 220, actual: 223.4 }, rng: rng || Math.random, sol: null, rd: null };
}
const fsA = P => K.AMMETER.ranges[P.ra], fsV = P => K.VOLTMETER.ranges[P.rv];
function trueR(P, el) {
  if (K.WIRES[el]) return K.wireR(K.WIRES[el]);
  if (el === 'carbon') return K.CARBON.actual;
  if (el === 'X') return P.X.actual;
  return null;
}
function cfg(P) {
  const elem = P.el === 'lamp' ? (P.burnt ? { kind: 'open' } : { kind: 'lamp' }) : { kind: 'R', R: trueR(P, P.el) };
  return { emf: P.emf, rs: K.SUPPLY.r, Rbox: P.box, rA: K.ammeterR(fsA(P)), rV: K.voltmeterR(fsV(P)), method: P.m, elem };
}
function reread(P) {
  const s = P.sol;
  P.rd = {
    A: K.readMeter(s.IA, fsA(P), K.AMMETER.divs, { ideal: P.ideal, zero: P.ideal ? 0 : P.zero.A, rng: P.rng }),
    V: K.readMeter(s.VV, fsV(P), K.VOLTMETER.divs, { ideal: P.ideal, zero: P.ideal ? 0 : P.zero.V, rng: P.rng })
  };
}
let log = true;
const done = {};
function fire(label, type, data) {
  const hits = missions.filter(m => !done[m.id] && m.check({ type, data }, m.mem));
  hits.forEach(m => { done[m.id] = label; });
  if (log) console.log(('  ' + label).padEnd(66), hits.map(m => m.id).join(', ') || '-');
  return hits;
}
/** 改設定（等同使用者操作控制項後放開）：重解電路、處理燒斷、回報 'meter' 事件 */
function set(P, o, label) {
  const wasBurnt = P.burnt;
  Object.assign(P, o);
  let s = K.bench(cfg(P)), burnNow = false;
  if (s.burn && P.el === 'lamp' && !P.burnt) { P.burnt = true; burnNow = true; s = K.bench(cfg(P)); }
  P.sol = s; reread(P);
  const hits = [];
  if (burnNow) hits.push.apply(hits, fire((label || 'set') + ' → 燒斷', 'burnout', { el: 'lamp', emf: P.emf, box: P.box, m: P.m }));
  if (label !== false) {
    hits.push.apply(hits, fire(label || 'set', 'meter', { action: 'x', el: P.el, m: P.m, ideal: P.ideal, emf: P.emf, box: P.box,
      V: P.rd.V.reading, I: P.rd.A.reading, VV: s.VV, IA: s.IA, VR: s.VR, IR: s.IR, fsA: fsA(P), fsV: fsV(P),
      defA: P.rd.A.needle / fsA(P), defV: P.rd.V.needle / fsV(P), overA: P.rd.A.over, overV: P.rd.V.over, burnt: P.burnt, wasBurnt }));
  }
  return hits;
}
function series(P, el, m) { return P.pts.filter(p => p.el === el && p.m === m); }
function fitOf(P, list, el, m) {
  const use = list.filter(p => p.V > 0);
  if (!use.length) return null;
  const f = K.fitOrigin(use.map(p => p.V), use.map(p => p.I));
  if (!f || !(f.k > 0)) return null;
  const Rt = trueR(P, el), R = 1 / f.k;
  let vmin = Infinity, vmax = 0;
  use.forEach(p => { vmin = Math.min(vmin, p.V); vmax = Math.max(vmax, p.V); });
  return { el, m, n: list.length, R, k: f.k, r2: f.r2, slope: f.slope, icpt: f.icpt, maxRel: f.maxRel, Rtrue: Rt, err: Rt ? R / Rt - 1 : null,
    vmin, vmax, allReal: list.every(p => !p.ideal && p.zeroed) };
}
function allFits(P) {
  const out = {};
  ['a', 'b', 'c', 'd', 'e', 'carbon', 'X', 'lamp'].forEach(el => ['ext', 'int'].forEach(m => {
    const l = series(P, el, m);
    if (l.length) out[el + '|' + m] = fitOf(P, l, el, m) || { el, m, n: l.length, R: NaN, err: null };
  }));
  return out;
}
function lampStats(P) {
  const L = P.pts.filter(p => p.el === 'lamp' && p.V > 0 && p.I > 0);
  if (!L.length) return { n: 0, ratio: 0 };
  let rmin = Infinity, rmax = 0, vmin = Infinity, vmax = 0;
  L.forEach(p => { const r = p.V / p.I; rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); vmin = Math.min(vmin, p.V); vmax = Math.max(vmax, p.V); });
  return { n: L.length, ratio: rmax / rmin, rmin, rmax, vmin, vmax };
}
/** 按「記錄」：超過量程或兩表都是 0 時頁面不會記錄 */
function record(P, label) {
  const rd = P.rd, s = P.sol;
  if (rd.A.over || rd.V.over) throw new Error('超過量程，頁面不會記錄：' + label);
  if (rd.A.reading <= 0 && rd.V.reading <= 0) throw new Error('兩表都是 0：' + label);
  const p = { el: P.el, m: P.m, V: rd.V.reading, I: rd.A.reading, ideal: P.ideal, zeroed: P.ideal || P.zeroed };
  P.pts.push(p);
  reread(P);
  const list = series(P, p.el, p.m);
  return fire(label || 'record', 'record', { el: p.el, m: p.m, ideal: p.ideal, zeroed: p.zeroed, V: p.V, I: p.I, fsA: fsA(P), fsV: fsV(P),
    defA: p.I / fsA(P), defV: p.V / fsV(P), emf: P.emf, box: P.box, Rtrue: trueR(P, p.el), VR: s.VR, IR: s.IR, n: list.length,
    revealed: P.revealed, lampCold: P.lampCold, fit: fitOf(P, list, p.el, p.m), fits: allFits(P), lamp: lampStats(P) });
}
/** 調電源使伏特計的真實電壓 = target（線性元件直接比例；燈泡用二分法）；電源設定精度 0.01 V */
function emfFor(P, target) {
  const vv = e => K.bench(Object.assign(cfg(P), { emf: e })).VV;
  if (P.el !== 'lamp') return Math.round(Math.min(K.SUPPLY.max, target / vv(1)) * 100) / 100; // 線性：V 與 ε 成正比
  let lo = 0, hi = K.SUPPLY.max;
  if (vv(hi) < target) return hi;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (vv(mid) < target) lo = mid; else hi = mid; }
  return Math.round(hi * 100) / 100;
}
/** 依序把伏特計調到幾個目標電壓並記錄 */
function sweep(P, targets, label) {
  let hits = [];
  targets.forEach((t, i) => { set(P, { emf: emfFor(P, t) }, false); hits = hits.concat(record(P, label + ' #' + (i + 1) + ' V≈' + t)); });
  return hits;
}
const lin = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));

// =================== 預設狀態不可觸發任何任務 ===================
console.log('--- 預設狀態（載入頁面不回報事件；這裡把預設設定當成一次操作送出，仍不可觸發） ---');
let P = newPage();
const fDefault = set(P, {}, '預設：銅線 b、內接、50 mA、3 V、理想、ε=1 V、R箱=10 Ω');
if (fDefault.length) { console.log('✗ 預設狀態觸發了任務'); process.exitCode = 1; }
console.log('  預設讀數：V =', P.rd.V.reading.toFixed(4), 'V，I =', (P.rd.A.reading * 1000).toFixed(3), 'mA，R′ =', (P.rd.V.reading / P.rd.A.reading).toFixed(3), 'Ω');
['a', 'b', 'c', 'd', 'e', 'carbon', 'X', 'lamp'].forEach(el => { const Q = newPage(); const h = set(Q, { el }, false); if (h.length) { console.log('✗ 選元件 ' + el + ' 觸發了任務'); process.exitCode = 1; } });

// =================== 解法（理想模式） ===================
console.log('--- 解法 ---');
P = newPage();
set(P, { emf: 0.5 }, 'L1 準備：ε=0.5 V'); record(P, 'L1: 第一筆');
// L2：碳膜電阻 98.6 Ω、內接、50 mA、3 V：I≈25–29 mA、V≈2.5–2.9 V
set(P, { el: 'carbon', box: 0 }, 'L2 準備：碳膜電阻');
set(P, { emf: emfFor(P, 2.7) }, 'L2 準備：V≈2.7 V'); record(P, 'L2: 兩針過半');
// L3、L4、L5：銅線 b（外接、500 mA、3 V；再用內接 4 點）
P = newPage();
set(P, { el: 'b', m: 'ext', ra: 2, rv: 0, box: 0 }, 'L3/L5 準備：銅線 b、外接、500 mA、3 V');
sweep(P, lin(0.5, 2.9, 6), 'L3/L5: b 外接');
set(P, { m: 'int' }, 'L4 準備：改內接');
sweep(P, lin(0.5, 2.9, 4), 'L4: b 內接');
// L6：鎳鉻線 e、內接、50 mA、15 V
set(P, { el: 'e', m: 'int', ra: 1, rv: 1, box: 0 }, 'L6 準備：鎳鉻線 e、內接、50 mA、15 V');
sweep(P, lin(3, 14.5, 5), 'L6: e 內接');
// L7、L8：小燈泡（500 mA、3 V）；先在 0 V 用三用電表量冷電阻
set(P, { el: 'lamp', m: 'ext', ra: 2, rv: 0, box: 0, emf: 0 }, 'L7/L8 準備：燈泡、外接、500 mA、3 V、ε=0');
const cold = K.multimeter(K.LAMP.R0, { ideal: true });
P.lampCold = cold.value;
fire('L8 前：三用電表量冷燈泡 = ' + cold.value.toFixed(1) + ' Ω', 'multimeter', { el: 'lamp', value: cold.value, over: cold.over, Rtrue: K.LAMP.R0, cold: true });
sweep(P, [0.05, 0.1, 0.2, 0.4, 0.8, 1.2, 1.8, 2.2], 'L7: 燈泡');
sweep(P, [2.5], 'L8: 燈泡 2.5 V');
console.log('    （燈泡 V/I：' + lampStats(P).rmin.toFixed(3) + ' → ' + lampStats(P).rmax.toFixed(3) + ' Ω，冷電阻 ' + cold.value.toFixed(1) + ' Ω）');
// L9：X（隨機 E12 值）— 用 X 的範圍兩端與中間證明都做得到；策略：先粗量一點判斷大小，再選接法
function bestPlan(Rguess) {
  // 在所有接法與檔位中，挑系統誤差最小、又能讓指針偏轉較大的組合（學生依「臨界電阻 √(rA rV)」判斷即可）
  let best = null;
  ['ext', 'int'].forEach(m => [0, 1, 2].forEach(ra => [0, 1].forEach(rv => {
    const rA = K.ammeterR(K.AMMETER.ranges[ra]), rV = K.voltmeterR(K.VOLTMETER.ranges[rv]);
    const sys = Math.abs(K.predictedR(m, Rguess, rA, rV) / Rguess - 1);
    // 兩表同時能到的最大偏轉
    const Vmax = Math.min(K.VOLTMETER.ranges[rv], K.AMMETER.ranges[ra] * Rguess, 14);
    const dA = Vmax / Rguess / K.AMMETER.ranges[ra], dV = Vmax / K.VOLTMETER.ranges[rv];
    const score = sys + 0.004 / Math.min(dA, dV); // 偏轉太小 → 估讀的相對誤差大
    if (!best || score < best.score) best = { m, ra, rv, sys, score, Vmax };
  })));
  return best;
}
P = newPage(); log = false;
const xs = [];
K.E12_X.forEach(nom => [0.96, 1, 1.04].forEach(f => xs.push({ nominal: nom, actual: Math.round(nom * f * 10) / 10 })));
let worstX = 0;
xs.forEach(X => {
  const Q = newPage(X);
  const plan = bestPlan(X.nominal);
  set(Q, { el: 'X', m: plan.m, ra: plan.ra, rv: plan.rv, box: 0 }, false);
  const ok = sweep(Q, lin(plan.Vmax * 0.5, plan.Vmax * 0.95, 5), 'X').some(m => m.id === 'ohms-law-9');
  const f = fitOf(Q, series(Q, 'X', plan.m), 'X', plan.m);
  worstX = Math.max(worstX, Math.abs(f.err));
  missions.forEach(m => { delete done[m.id]; m.mem = {}; }); // 只測這一題，不影響下面的紀錄
  if (!ok) { console.log('✗ L9 X=' + X.actual + ' 做不到'); process.exitCode = 1; }
});
log = true;
console.log('  L9: X 的 45 種可能（每個 E12 值 ×0.96、×1、×1.04）都做得到，最大系統誤差 ' + (worstX * 100).toFixed(2) + '%（理想讀數）');
// 重做一次真正的 L1–L8 紀錄（上面為了逐一測 X 清掉了）
log = false;
P = newPage(); set(P, { emf: 0.5 }); record(P, 'L1');
set(P, { el: 'carbon', box: 0 }); set(P, { emf: emfFor(P, 2.7) }); record(P, 'L2');
P = newPage(); set(P, { el: 'b', m: 'ext', ra: 2, rv: 0, box: 0 }); sweep(P, lin(0.5, 2.9, 6), 'L3/L5');
set(P, { m: 'int' }); sweep(P, lin(0.5, 2.9, 4), 'L4');
set(P, { el: 'e', m: 'int', ra: 1, rv: 1, box: 0 }); sweep(P, lin(3, 14.5, 5), 'L6');
set(P, { el: 'lamp', m: 'ext', ra: 2, rv: 0, box: 0, emf: 0 }); P.lampCold = cold.value;
sweep(P, [0.05, 0.1, 0.2, 0.4, 0.8, 1.2, 1.8, 2.2], 'L7'); sweep(P, [2.5], 'L8');
log = true;
P.X = { nominal: 220, actual: 223.4 };
const plan220 = bestPlan(220);
set(P, { el: 'X', m: plan220.m, ra: plan220.ra, rv: plan220.rv, box: 0 }, 'L9 準備：X=223.4 Ω，' + plan220.m + '、' + K.AMMETER.ranges[plan220.ra] * 1000 + ' mA、' + K.VOLTMETER.ranges[plan220.rv] + ' V');
sweep(P, lin(plan220.Vmax * 0.5, plan220.Vmax * 0.95, 5), 'L9: X');
// L10：銅線 a、c、d（b 已經在上面量過）— 外接、500 mA、3 V（d 用 15 V 檔以免電流太小）
[['a', 0], ['c', 0], ['d', 1]].forEach(q => {
  set(P, { el: q[0], m: 'ext', ra: 2, rv: q[1], box: 0 }, 'L10 準備：銅線 ' + q[0]);
  const top = Math.min(K.VOLTMETER.ranges[q[1]] * 0.95, 0.48 * trueR(P, q[0]));
  sweep(P, lin(top * 0.4, top, 4), 'L10: ' + q[0]);
});

// =================== 含誤差（L11、L12）：一次實際的成功紀錄 ===================
function realRun(P, el, plan, n, label, rng) {
  set(P, { ideal: false, zero: { A: 0.7, V: -0.5 }, zeroed: false, emf: 0 }, false);
  P.zero = { A: 0, V: 0 }; P.zeroed = true; // 按「電表歸零」（電源 0 V）
  set(P, { el, m: plan.m, ra: plan.ra, rv: plan.rv, box: 0 }, false);
  const top = plan.Vmax * 0.98;
  return sweep(P, lin(top * 0.55, top, n), label);
}
console.log('--- 含誤差：照建議的做法實際量一次（固定亂數種子） ---');
P.rng = mulberry32(7);
const planX = bestRate('X', P.X, 6, 0.02, 300).plan; // 蒙地卡羅挑出的最好做法（函式在下面）
console.log('  L11 的做法：' + planTxt(planX));
let hit11 = false;
for (let t = 0; t < 20 && !hit11; t++) { P.pts = P.pts.filter(p => p.el !== 'X'); hit11 = realRun(P, 'X', planX, 6, 'L11 第 ' + (t + 1) + ' 次：X 含誤差', P.rng).some(m => m.id === 'ohms-law-11'); }
const planE = { m: 'int', ra: 1, rv: 1, Vmax: 15 };
let hit12 = false;
for (let t = 0; t < 20 && !hit12; t++) { P.pts = P.pts.filter(p => p.el !== 'e'); hit12 = realRun(P, 'e', planE, 10, 'L12 第 ' + (t + 1) + ' 次：e 含誤差', P.rng).some(m => m.id === 'ohms-law-12'); }

// =================== 蒙地卡羅：含誤差時成功的機率 ===================
console.log('--- 蒙地卡羅（每種情況 2000 次；讀數照頁面：估讀標準差 0.15 小格、取到半小格） ---');
function passRate(el, X, plan, n, tol, trials) {
  const rng = mulberry32(12345);
  let pass = 0;
  // 電路的解與讀數的亂數無關：每個電壓只解一次
  const Q0 = newPage(X, rng);
  Object.assign(Q0, { el, m: plan.m, ra: plan.ra, rv: plan.rv, box: 0 });
  const top = plan.Vmax * 0.98;
  const sols = lin(top * 0.55, top, n).map(v => { Q0.emf = emfFor(Q0, v); return K.bench(cfg(Q0)); });
  for (let t = 0; t < trials; t++) {
    const Q = newPage(X, rng);
    Q.ideal = false; Q.zeroed = true;
    Object.assign(Q, { el, m: plan.m, ra: plan.ra, rv: plan.rv, box: 0 });
    sols.forEach(sol => {
      Q.sol = sol; reread(Q);
      if (Q.rd.A.over || Q.rd.V.over) return;
      Q.pts.push({ el, m: plan.m, V: Q.rd.V.reading, I: Q.rd.A.reading, ideal: false, zeroed: true });
    });
    const f = fitOf(Q, series(Q, el, plan.m), el, plan.m);
    if (f && f.n >= n && Math.abs(f.err) <= tol) pass++;
  }
  return pass / trials;
}
/** 所有接法與檔位的組合；Vmax = 兩表都不超過量程、電源不超過 15 V 時伏特計能到的最大電壓 */
function plansFor(el, X) {
  const out = [];
  ['ext', 'int'].forEach(m => [0, 1, 2].forEach(ra => [0, 1].forEach(rv => {
    const Q = newPage(X); Object.assign(Q, { el, m, ra, rv, box: 0, emf: 1 });
    const s1 = K.bench(cfg(Q));
    const Vmax = Math.min(s1.VV * K.SUPPLY.max, s1.VV / s1.IA * fsA(Q), fsV(Q));
    out.push({ m, ra, rv, Vmax });
  })));
  return out;
}
function bestRate(el, X, n, tol, trials) {
  let best = { rate: -1 };
  plansFor(el, X).forEach(pl => { const r = passRate(el, X, pl, n, tol, trials); if (r > best.rate) best = { rate: r, plan: pl }; });
  return best;
}
function planTxt(pl) { return (pl.m === 'ext' ? '外接' : '內接') + '、' + K.AMMETER.ranges[pl.ra] * 1000 + ' mA、' + K.VOLTMETER.ranges[pl.rv] + ' V'; }
[[6, 0.02], [10, 0.02], [6, 0.03], [10, 0.03]].forEach(q => {
  let worst = { rate: 2 }, wX = null;
  K.E12_X.forEach(nom => [0.96, 1, 1.04].forEach(fac => {
    const X = { nominal: nom, actual: Math.round(nom * fac * 10) / 10 };
    const b = bestRate('X', X, q[0], q[1], 600);
    if (b.rate < worst.rate) { worst = b; wX = X.actual; }
  }));
  console.log('  L11 試算（X，' + q[0] + ' 點，±' + q[1] * 100 + '%）：最難的 X = ' + wX + ' Ω，最好的做法（' + planTxt(worst.plan) + '）成功率 ' + (worst.rate * 100).toFixed(1) + '%');
});
const r12a = passRate('e', null, planE, 8, 0.01, 2000), r12b = passRate('e', null, planE, 16, 0.01, 2000);
console.log('  L12（e，內接、50 mA、15 V，±1%）：8 點成功率 ' + (r12a * 100).toFixed(1) + '%，16 點 ' + (r12b * 100).toFixed(1) + '%');
const r12bad = passRate('e', null, { m: 'int', ra: 0, rv: 1, Vmax: 4.9 }, 8, 0.01, 1000);
const r12ext = passRate('e', null, { m: 'ext', ra: 1, rv: 1, Vmax: 14 }, 8, 0.01, 1000);
console.log('  對照：e 用 5 mA 檔（r_A = 20 Ω）成功率 ' + (r12bad * 100).toFixed(1) + '%；用外接法 ' + (r12ext * 100).toFixed(1) + '%（都明顯較低：接法或檔位選錯，很難達成）');
if (r12a < 0.5) { console.log('✗ 含誤差任務的成功率太低'); process.exitCode = 1; }

// =================== 隱藏任務 ===================
console.log('--- 隱藏任務 ---');
P = newPage();
set(P, { el: 'lamp', m: 'ext', ra: 2, rv: 1, box: 0 }, 'h 準備：燈泡、外接、500 mA、15 V');
set(P, { emf: 7 }, 'h1: ε 調到 7 V（燈泡兩端遠超過 2.5 V）');
set(P, { emf: 6 }, 'h2: 燒斷後再調電源（伏特計跨在斷掉的燈絲兩端）');
const sH = P.sol;
console.log('    （燒斷後：伏特計 ' + sH.VV.toFixed(3) + ' V，電源 ' + P.emf + ' V）');
// h3：碳膜電阻、外接；找整數 R箱 讓伏特計的電壓恰好是電源的一半
P = newPage();
set(P, { el: 'carbon', m: 'ext', ra: 1, rv: 1, emf: 4 }, false);
let bestBox = 0, bestErr = 1;
for (let b = 1; b <= 400; b++) { const s = K.bench(Object.assign(cfg(P), { Rbox: b })); const e = Math.abs(s.VV / P.emf - 0.5); if (e < bestErr) { bestErr = e; bestBox = b; } }
set(P, { box: bestBox }, 'h3: 碳膜電阻、外接、ε=4 V、R箱=' + bestBox + ' Ω（V/ε 差 ' + (bestErr * 100).toFixed(3) + '%）');

console.log('--- 全部 ---');
missions.forEach(m => console.log(m.id.padEnd(14), ('L' + m.level).padEnd(4), done[m.id] ? '✓ ' + done[m.id].trim() : '✗ 沒有完成'));
if (missions.some(m => !done[m.id])) process.exitCode = 1;
