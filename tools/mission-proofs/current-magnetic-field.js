/* 任務可達成的證明腳本。用法：node tools/mission-proofs/current-magnetic-field.js
 * 用真正的任務檢查函式 + 物理核心模擬頁面（js/current-magnetic-field.js）送出的事件，證明每個任務都做得到、預設狀態不會觸發任務。
 * 磁針照頁面的做法積分（每格 1/60 s 呼叫 stepNeedle；「停穩」＝角速度 < 0.003 rad/s 且在平衡方向 0.02° 內或被摩擦卡住，持續 0.25 s），
 * 含誤差模式用頁面的電流表誤差（±0.4%）、刻度盤零點偏差（±1°～±2°）、讀數取到 0.1°、支點摩擦，並把最壞的組合都跑一遍。
 * 修改物理核心、頁面事件或任務條件後重跑。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(__ROOT + 'js/current-magnetic-field-core.js');
global.window = { LabMission: { register(id, list) { global.M = list; } } }; global.LabMission = global.window.LabMission;
require(__ROOT + 'js/missions/current-magnetic-field.js');

const DEG = Math.PI / 180;
let done = {}, cal = { amm: 0, zero: 0 };
let st, needle, rowsO, rowsP;
function reset() {
  st = { I: 0, s: 1, above: true, h: 3, alpha: 0, d: 0, loc: 'taipei', earth: true, inst: 'ideal', dial: 0,
    shape: 'wire', N: 50, R: 5, Ns: 300, Ls: 20, Rs: 3, px: 2, py: 0 };
  needle = { phi: 0, om: 0, stuck: false };
  rowsO = []; rowsP = [];
  M.forEach(m => { m.mem = {}; });
}
const real = () => st.inst === 'real';
const field = () => C.oerstedField({ I: st.I, s: st.s, alpha: st.alpha, above: st.above, h: st.h / 100, d: st.d / 100, BH: C.earth(st.loc).H, earth: st.earth });
const zeroOffset = () => (real() ? cal.zero : 0) + st.dial;
const ammeter = () => real() ? Math.round(st.I * (1 + cal.amm) * 100) / 100 : Math.round(st.I * 100) / 100;
const reading = () => { const r = C.wrapDeg(needle.phi / DEG - zeroOffset()); return real() ? Math.round(r * 10) / 10 : r; };
/** 照頁面 stepPhysics：積分到停穩（最多 240 s） */
function settle() {
  const f = field();
  let restT = 0, kick = false;
  for (let i = 0; i < 240 * 60; i++) {
    const dt = 1 / 60;
    if (f.Bh > 0 && !kick && Math.cos(needle.phi - f.thetaEq * DEG) < -0.9999 && Math.abs(needle.om) < 1e-3) { needle.om += 0.02; kick = true; }
    C.stepNeedle(needle, f.Bx, f.By, dt, { friction: real() });
    const off = Math.abs(C.wrapDeg(needle.phi / DEG - f.thetaEq));
    const still = Math.abs(needle.om) < 0.003 && (off < 0.02 || needle.stuck || f.Bh < 0.03 * C.NEEDLE.Bref);
    if (still) restT += dt; else restT = 0;
    if (restT > 0.25) return;
  }
  throw new Error('needle did not settle');
}
function needleInfo() {
  const f = field();
  return { I: st.I, Im: ammeter(), s: st.s, above: st.above, r: st.h, alpha: st.alpha, d: st.d, earth: st.earth, loc: st.loc,
    BH: C.earth(st.loc).H * 1e6, BIh: f.BIh * 1e6, Bnet: f.Bh * 1e6, thetaEq: f.thetaEq, theta: C.wrapDeg(needle.phi / DEG),
    read: reading(), mode: st.inst, rest: true, period: C.needlePeriod(f.Bh) };
}
function emit(type, data, label) {
  M.forEach(m => { if (done[m.id]) return; if (m.check({ type, data }, m.mem)) done[m.id] = label; });
}
/** 改設定 → 磁針停穩 → 'needle'（頁面 onRest，只在使用者改過設定後） */
function set(k, v, label) {
  st[k] = v;
  settle();
  emit('needle', needleInfo(), label || `${k}=${v}`);
}
function anaO() { return C.tangentAnalysis(rowsO.map(r => ({ I: r.I, r: r.r, theta: r.theta, s: r.s, above: r.above })), C.earth(st.loc).H); }
function recordO(label) {
  const rd = reading();
  if (!st.earth || !(ammeter() > 0) || Math.abs(rd) < 1 || Math.abs(rd) >= 89) throw new Error('page would refuse to record: ' + label);
  const I = ammeter(), r = Math.round(st.h * 100) / 100, tn = Math.tan(Math.abs(rd) * DEG), BI = C.wireB(I, r / 100) * 1e6;
  const row = { I, s: st.s, above: st.above, r, alpha: st.alpha, d: st.d, theta: rd, tan: tn, BI, BH: BI / tn, mode: st.inst, loc: st.loc, earth: st.earth };
  rowsO.push(row);
  const A = anaO();
  emit('record', { kind: 'oersted', row, rows: rowsO.slice(), ana: A }, label);
  return A;
}
function recordP(label) {
  const P = { shape: st.shape, I: st.I, s: st.s };
  if (P.shape === 'coil') { P.N = st.N; P.R = st.R / 100; }
  if (P.shape === 'solenoid') { P.N = st.Ns; P.L = st.Ls / 100; P.R = st.Rs / 100; }
  const b = C.planeField(P, st.px / 100, st.py / 100), B = Math.hypot(b.bx, b.by), f = C.formulaAt(P, st.px / 100, st.py / 100);
  const row = { shape: P.shape, I: Math.round(P.I * 100) / 100, s: st.s, N: P.N || null, R: P.R ? P.R * 100 : null, L: P.L ? P.L * 100 : null,
    x: st.px, y: st.py, B: B * 1e6, formula: f ? f.B * 1e6 : null, axis: f && f.axis != null ? f.axis * 1e6 : null };
  row.diff = row.formula ? row.B / row.formula - 1 : null;
  rowsP.push(row);
  emit('record', { kind: 'probe', row, rows: rowsP.slice() }, label);
  return row;
}
function clear() { rowsO = []; rowsP = []; emit('clear', {}, 'clear'); }

// ---------- 1. 預設狀態：不通電時隨便動一動、按記錄（頁面會拒絕），不觸發任何任務 ----------
reset();
set('h', 4); set('alpha', 30); set('alpha', 0); set('above', false); set('above', true); set('loc', 'kaohsiung');
st.inst = 'real'; set('dial', 1.5); st.inst = 'ideal'; set('dial', 0);
st.shape = 'wire'; recordP('default probe (I = 0)'); st.shape = 'coil'; recordP('default coil'); st.shape = 'solenoid'; recordP('default solenoid');
console.log('預設狀態觸發：', Object.keys(done).length ? Object.keys(done) : '無');
const bad = Object.keys(done);

// ---------- 2. 一般任務（理想儀器） ----------
done = {}; reset();
set('h', 3); set('I', 3.00, 'm1 I = 3 A above, r = 3 cm');                               // m1
set('above', false, 'm3 below');                                                           // m3（同 I、r，上方 → 下方）
st.above = true; set('h', 2); set('I', 3.62, 'm4 r = 2 cm, I = 3.62 A');                 // m4：B導線 = BH
for (const I of [2.0, 3.0, 4.0]) { set('I', I); recordO(`m5 r=2 I=${I}`); }               // m5
set('h', 4); recordO('m7 r=4 I=4 (with r=2 I=4)');                                         // m7
// h1：忽略地磁，磁針轉 90°
set('earth', false, 'h1 no Earth'); st.earth = true; set('earth', true);
// h2：導線東西向、在上方、電流反向且 B導線 > BH：磁針轉半圈
set('h', 1); set('alpha', 90); set('s', -1); set('I', 2.5, 'h2 E–W wire, reverse, 2.5 A');
st.alpha = 0; st.s = 1; set('I', 0); set('h', 3);
// 三種形狀
clear(); st.I = 3; st.shape = 'wire';
st.px = 2; st.py = 0; recordP('m2 (2, 0)'); st.px = 0; st.py = 2; recordP('m2 (0, 2) — 90° apart');
st.shape = 'coil'; st.N = 50; st.R = 5; st.I = 1.59; st.px = 0; st.py = 0; recordP('m6 N=50 R=5 I=1.59 centre');   // m6
st.px = 3.83; st.py = 0; recordP('m9 x = 3.83 cm (0.766 R)');                                                    // m9
st.shape = 'solenoid'; st.Ns = 300; st.Ls = 30; st.Rs = 1; st.I = 1; st.px = 0; st.py = 0; recordP('m8 L=30 R=1 centre');
st.px = 15; recordP('m10 end x = L/2');                                                                            // m10
st.px = 0; st.py = 2; recordP('h3 outside, y = 2 cm');                                                             // h3
for (const m of M) console.log(m.id.padEnd(28), 'L' + String(m.level).padEnd(3), done[m.id] ? '✓ ' + done[m.id] : '✗ ' + (/-1[12]$/.test(m.id) ? '（下面另外證明）' : ''));
const missing = M.filter(m => !/-1[12]$/.test(m.id) && !done[m.id]).map(m => m.id);

// 數值說明
{
  const P = { shape: 'solenoid', I: 1, s: 1, N: 300, L: 0.3, R: 0.01 };
  const c = C.planeField(P, 0, 0).bx, e = C.planeField(P, 0.15, 0).bx, o = C.planeField(P, 0, 0.02), id = C.solenoidIdeal(1000, 1);
  console.log(`\n  螺線管 L=30 cm、R=1 cm：中央 / μ0nI = ${(c / id).toFixed(5)}、管口 / 中央 = ${(e / c).toFixed(5)}、管外 y=2 cm / μ0nI = ${(Math.hypot(o.bx, o.by) / id).toExponential(2)}`);
  const P2 = { shape: 'solenoid', I: 1, s: 1, N: 300, L: 0.2, R: 0.03 };
  console.log(`  預設螺線管 L=20 cm、R=3 cm：中央 / μ0nI = ${(C.planeField(P2, 0, 0).bx / C.solenoidIdeal(1500, 1)).toFixed(4)}、管口 / 中央 = ${(C.planeField(P2, 0.1, 0).bx / C.planeField(P2, 0, 0).bx).toFixed(4)}（預設做不到 m8、m10）`);
  console.log(`  線圈 N=50、R=5 cm、I=1.59 A：中心 ${(C.coilCenter(50, 0.05, 1.59) * 1e6).toFixed(1)} μT；x = 3.83 cm 時 B/B中心 = ${(C.coilAxis(50, 0.05, 1, 0.0383) / C.coilCenter(50, 0.05, 1)).toFixed(5)}`);
  const BH = C.earth('taipei').H;
  console.log(`  臺北 BH = ${(BH * 1e6).toFixed(2)} μT；r = 2 cm 時 B導線 = BH 需 I = ${(BH * 2 * Math.PI * 0.02 / C.MU0).toFixed(3)} A`);
}

// ---------- 3. 第 9、10 級（含誤差）：電流表誤差、刻度盤零點偏差、摩擦的最壞組合 ----------
console.log('\n第 9、10 級（含誤差儀器；零點偏差、電流表誤差的各種組合）：');
let fail11 = 0, fail12 = 0, worst11 = 0, worst12 = 0;
for (const amm of [-0.004, 0, 0.004]) for (const zero of [-2, -1.73, -1, 1, 1.37, 2]) for (const loc of ['taipei', 'kaohsiung']) {
  cal = { amm, zero }; done = {}; reset();
  st.loc = loc; st.inst = 'real';
  // m11：不歸零，兩種電流各一組正反向（r = 2 cm，上方）
  set('h', 2);
  let A;
  for (const I of [2.0, 3.5]) {
    st.s = 1; set('I', I); A = recordO(`m11 I=${I} fwd`);
    set('s', -1); A = recordO(`m11 I=${I} rev`);
  }
  worst11 = Math.max(worst11, Math.abs(A.errPair));
  if (!done['current-magnetic-field-11']) fail11++;
  const e11 = A.errPair;
  // m12：先在不通電時歸零（讀刻度、轉刻度盤），再做 8 筆
  clear(); st.s = 1; set('I', 0);
  const r0 = reading();
  set('dial', Math.round((st.dial + r0) * 10) / 10, 'zero the dial');
  if (Math.abs(reading()) > 0.1) set('dial', Math.round((st.dial + reading()) * 10) / 10, 'zero again');
  for (const [h, I] of [[2, 1.5], [2, 2.5], [2, 3.5], [4, 3.0], [4, 5.0]]) {
    set('h', h); st.s = 1; set('I', I); A = recordO(`m12 r=${h} I=${I} fwd`);
    if (h === 2 && I !== 2.5) { set('s', -1); A = recordO(`m12 r=${h} I=${I} rev`); }
  }
  worst12 = Math.max(worst12, Math.abs(A.err));
  if (!done['current-magnetic-field-12']) fail12++;
  console.log(`  ${loc.padEnd(9)} 電流表${amm > 0 ? '+' : amm < 0 ? '−' : ' '}${Math.abs(amm * 100).toFixed(1)}%  零點${zero > 0 ? '+' : '−'}${Math.abs(zero).toFixed(2)}°：m11 正反向平均 ${(e11 * 100).toFixed(2)}% ${done['current-magnetic-field-11'] ? '✓' : '✗'}   m12 ${A.n} 筆 ${(A.err * 100).toFixed(2)}% ${done['current-magnetic-field-12'] ? '✓' : '✗'}`);
}
console.log(`  最差：m11 ${(worst11 * 100).toFixed(2)}%（門檻 1.5%）、m12 ${(worst12 * 100).toFixed(2)}%（門檻 1%）`);

// 沒歸零時 m12 做不到（同樣的 8 筆，零點偏 2°）
cal = { amm: 0.004, zero: 2 }; done = {}; reset(); st.inst = 'real';
let An;
for (const [h, I] of [[2, 1.5], [2, 2.5], [2, 3.5], [4, 3.0], [4, 5.0]]) { set('h', h); st.s = 1; set('I', I); An = recordO('no zero'); }
console.log(`  對照：不歸零、只做正向（零點 +2°）時全部數據的誤差 ${(An.err * 100).toFixed(2)}%，m12 ${done['current-magnetic-field-12'] ? '✓（不該發生）' : '✗（應該做不到）'}`);

const allOk = bad.length === 0 && missing.length === 0 && fail11 === 0 && fail12 === 0;
if (bad.length) console.log('預設狀態就觸發：', bad);
if (missing.length) console.log('做不到：', missing);
console.log(allOk ? '\n全部任務都做得到。' : '\n有任務做不到或被誤觸發。');
cal = { amm: 0, zero: 0 };
process.exitCode = allOk ? 0 : 1;
