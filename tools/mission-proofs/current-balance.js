/* 任務可達成的證明腳本。用法：node tools/mission-proofs/current-balance.js
 * 用真正的任務檢查函式 + 物理核心模擬頁面（js/current-balance.js）送出的事件，證明每個任務都做得到、預設狀態不會觸發任務。
 * 天平一律模擬「停穩」之後的狀態：理想模式停在 eqAngle，含誤差模式（支點摩擦）由上一個角度用 restAngle 慢慢放開。
 * 修改物理核心、頁面事件或任務條件後重跑。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(__ROOT + 'js/current-balance-core.js');
global.window = { LabMission: { register(id, list) { global.M = list; } } }; global.LabMission = global.window.LabMission;
require(__ROOT + 'js/missions/current-balance.js');

const APP = C.APP, G = C.G;
let done = {}, cal = { e1: 0, e2: 0, eS: 0 }, dev = 0;
let st, rows, th;
function reset() {
  st = { power: false, fromMin: false, I1: 0, I2: 0, s1: -1, s2: 1, hung: false, len: 2.5, piece: null, nut: APP.nutX0, mode: 'ideal', realSol: false, part: 1, combos: {} };
  rows = []; th = 0; cut(); settle(); M.forEach(m => { m.mem = {}; });
}
const real = () => st.mode === 'real';
function cut() {
  const m = C.wireMass(st.len / 100, real() ? dev : 0);
  st.piece = { len: st.len, m, mg: Math.round(C.meter(m * 1e6, real() ? cal.eS : 0, 1)) };
}
const I1t = () => st.power ? st.I1 : 0, I2t = () => st.power ? st.I2 : 0;
const I1m = () => Math.round(C.meter(I1t(), real() ? cal.e1 : 0, 0.01) * 100) / 100;
const I2m = () => Math.round(C.meter(I2t(), real() ? cal.e2 : 0, 0.01) * 100) / 100;
const torque = () => C.netTorque({ m: st.hung ? st.piece.m : 0, I1: I1t(), I2: I2t(), s1: st.s1, s2: st.s2, nut: st.nut, real: st.realSol });
const zeroOff = () => C.torqueToMass(APP.nutM * G * (st.nut - APP.nutOK) * 1e-3) * 1e6;
const tip = () => -C.tipOf(th) * 1000;
const level = () => Math.abs(tip()) <= APP.levelTip * 1000 + 1e-9;
const currents = () => st.power && st.I1 > 0 && st.I2 > 0;
function settle() { th = real() ? C.restAngle(th, torque(), APP.tauF) : C.eqAngle(torque()); }
function info() {
  return { power: st.power, fromMin: st.fromMin, I1: I1t(), I2: I2t(), I1m: I1m(), I2m: I2m(), s1: st.s1, s2: st.s2,
    magDown: currents() && st.s1 * st.s2 > 0, currents: currents(), hung: st.hung, mg: st.piece.mg, mTrue: st.piece.m * 1e6, len: st.piece.len,
    nut: st.nut, zeroOff: zeroOff(), tip: tip(), level: level(), rest: true, stop: Math.abs(th) >= APP.thetaMax - 1e-9,
    mode: st.mode, realSol: st.realSol, part: st.part, combos: Object.keys(st.combos).length };
}
function emit(type, data, label) {
  M.forEach(m => { if (done[m.id]) return; if (m.check({ type, data }, m.mem)) done[m.id] = label; });
}
/** 改一個設定 → 天平停穩 → 送出 'state'（同頁面的 onSettle） */
function set(k, v, label) {
  st[k] = v;
  if (k === 'len' || k === 'mode') cut();
  settle();
  if (currents()) st.combos[st.s1 + ',' + st.s2] = true;
  emit('state', info(), label || `${k}=${v}`);
}
function power(on) {
  st.power = on; st.fromMin = on && st.I1 === 0 && st.I2 === 0;
  settle(); emit('power', { on, fromMin: st.fromMin }); emit('state', info(), on ? 'power on' : 'power off');
}
/** 調整其中一個電流（which = 'I1' 或 'I2'）讓天平水平：先試滑桿的 0.01 A 格點，不夠再打字到 0.001 A */
function balance(which) {
  const other = which === 'I1' ? st.I2 : st.I1;
  const need = (st.hung ? st.piece.m * G * APP.d2 : 0) + APP.nutM * G * (st.nut - APP.nutOK) * 1e-3;
  const exact = need / (C.factor(st.realSol) * other * st.s1 * st.s2);
  for (const step of [0.01, 0.001]) {
    const v = Math.round(exact / step) * step;
    if (!(v > 0) || v > (which === 'I1' ? APP.I1Max : APP.I2Max)) throw new Error(`${which} = ${v.toFixed(3)} A is outside the slider range`);
    th = 0.002; set(which, +v.toFixed(3), `${which}=${v.toFixed(3)}`);
    if (level()) return v;
  }
  throw new Error(`cannot balance with ${which} (need ${exact.toFixed(4)} A)`);
}
function record(label) {
  if (!st.power || !st.hung || !(I1m() > 0 && I2m() > 0) || !level()) throw new Error('cannot record: ' + label);
  const row = { part: st.part, m: st.piece.mg, I1: I1m(), I2: I2m(), mode: st.mode, realSol: st.realSol,
    zeroOff: Math.round(zeroOff() * 100) / 100, mTrue: st.piece.m * 1e6, tip: tip() };
  rows.push(row);
  const An = C.analyze(rows.map(r => ({ part: r.part, m: r.m * 1e-6, I1: r.I1, I2: r.I2 })));
  const R = rows.map((r, i) => Object.assign({ F: An.rows[i].F, B: An.rows[i].B, mu0: An.rows[i].mu0, err: An.rows[i].mu0 / C.MU0 - 1 }, r));
  const last = R[R.length - 1];
  emit('record', {
    row: last, rows: R, n: An.n,
    p1: { n: An.p1.n, mu0: An.p1.mu0, err: An.p1.err, distinctM: An.p1.distinctM || 0, I1spread: An.p1.I1spread, intercept: An.p1.line ? An.p1.line.intercept : null },
    p2: { n: An.p2.n, B: An.p2.B, Bth: An.p2.Bth, err: An.p2.err, mu0: An.p2.mu0, distinctM: An.p2.distinctM || 0, I2spread: An.p2.I2spread },
    mu0Mean: An.mu0Mean, meanErr: An.meanErr
  }, `${label}: m=${row.m} mg I1=${row.I1.toFixed(2)} I2=${row.I2.toFixed(2)} μ0 err ${(last.err * 100).toFixed(2)}%`);
  return An;
}
function clear() { rows = []; emit('clear', {}); }

// ---------- 1. 預設狀態與隨便操作不應觸發 ----------
reset();
emit('state', info(), 'default');
set('I1', 1.0); set('I2', 2.0); power(true);           // 沒先歸零旋鈕就開機
set('I1', 1.2);
console.log('預設狀態、未歸零旋鈕開機觸發：', Object.keys(done).length ? Object.keys(done) : '無');
const bad = Object.keys(done);

// ---------- 2. 一般任務（理想模式） ----------
done = {}; reset();
set('nut', APP.nutOK, 'm1 zero');                                   // m1
power(true); set('s1', 1); set('I1', 1.0); set('I2', 1.0);          // m2（bc 向下，外端上翹）
set('s2', -1); set('s1', -1); set('s2', 1); set('s1', 1);           // h1：四種接線
// h2：不掛東西、螺母沒歸零，用磁力把天平扶正
set('nut', APP.nutX0); set('I1', 0.5); balance('I2'); set('nut', APP.nutOK);
// m3、m5：2.5 cm（100 mg）
set('len', 2.5); set('hung', true); set('I1', 3.0); balance('I2'); record('m3 100 mg');
set('I1', 1.5); balance('I2'); record('m5 same piece, I1/2');
// m4：同一個 I1、質量加倍
set('I1', 3.0); set('len', 5.0); balance('I2'); record('m4 200 mg');
// m6：實驗一，I1 = 3 A，五種質量
clear();
for (const L of [1.0, 2.0, 3.0, 4.0, 5.0]) { set('len', L); balance('I2'); record(`m6 len ${L}`); }
// m7：實驗二，I2 = 4 A，五種質量
clear(); set('part', 2); set('I2', 4.0);
for (const L of [1.5, 2.5, 3.5, 4.5, 5.5]) { set('len', L); balance('I1'); record(`m7 len ${L}`); }
// h3：最重的漆包線（7.5 cm）
set('len', 7.5); set('I1', 4.0); balance('I2');
// m8：故意不歸零
clear(); set('part', 1); set('nut', APP.nutX0); set('I1', 3.0);
for (const L of [2.0, 3.0, 4.0]) { set('len', L); balance('I2'); record(`m8 unzeroed len ${L}`); }
// m9：真實螺線管
clear(); set('nut', APP.nutOK); set('realSol', true); set('I1', 3.0);
for (const L of [2.0, 3.0, 4.0]) { set('len', L); balance('I2'); record(`m9 real solenoid len ${L}`); }
set('realSol', false);
for (const m of M) console.log(m.id.padEnd(20), 'L' + String(m.level).padEnd(3), done[m.id] ? '✓ ' + done[m.id] : '✗ ' + (/-1[01]$/.test(m.id) ? '（下面另外證明）' : ''));
const missing = M.filter(m => !/-1[01]$/.test(m.id) && !done[m.id]).map(m => m.id);

// ---------- 3. 第 9、10 級（含誤差）：任何一組電表、電子秤校正誤差與漆包線偏差都做得到 ----------
console.log('\n第 9、10 級（含誤差、長螺線管近似、歸零；兩個實驗各 5 筆）：');
let worst = 0, worstGap = 0, fail10 = 0, fail11 = 0;
for (const e1 of [-0.006, 0.006]) for (const e2 of [-0.006, 0.006]) for (const eS of [-0.003, 0.003]) for (const d of [-0.02, 0.02]) {
  cal = { e1, e2, eS }; dev = d; done = {}; reset();
  set('mode', 'real'); set('nut', APP.nutOK); power(true); set('s1', 1);
  set('hung', true); set('I1', 3.0);
  for (const L of [2.0, 2.5, 3.0, 3.5, 4.0]) { set('len', L); balance('I2'); record(`p1 len ${L}`); }
  set('part', 2); set('I2', 4.0);
  let An;
  for (const L of [2.5, 3.0, 3.5, 4.0, 4.5]) { set('len', L); balance('I1'); An = record(`p2 len ${L}`); }
  worst = Math.max(worst, Math.abs(An.p1.err), Math.abs(An.p2.err));
  const gap = Math.abs(An.p1.mu0 / An.p2.mu0 - 1);
  worstGap = Math.max(worstGap, gap);
  if (!done['current-balance-10']) fail10++;
  if (!done['current-balance-11']) fail11++;
  console.log(`  e1=${e1 > 0 ? '+' : ''}${e1} e2=${e2 > 0 ? '+' : ''}${e2} eS=${eS > 0 ? '+' : ''}${eS} 線${d > 0 ? '+' : ''}${d}: 實驗一 ${(An.p1.err * 100).toFixed(2)}%  實驗二 ${(An.p2.err * 100).toFixed(2)}%  兩者差 ${(gap * 100).toFixed(2)}%  →  m10 ${done['current-balance-10'] ? '✓' : '✗'}  m11 ${done['current-balance-11'] ? '✓' : '✗'}`);
}
console.log(`  最差誤差 ${(worst * 100).toFixed(2)}%（門檻 3%）、兩實驗最大差 ${(worstGap * 100).toFixed(2)}%（門檻 1%）`);

const allOk = bad.length === 0 && missing.length === 0 && fail10 === 0 && fail11 === 0;
if (bad.length) console.log('預設狀態就觸發：', bad);
if (missing.length) console.log('做不到：', missing);
console.log(allOk ? '\n全部任務都做得到。' : '\n有任務做不到或被誤觸發。');
cal = { e1: 0, e2: 0, eS: 0 }; dev = 0;
process.exitCode = allOk ? 0 : 1;
