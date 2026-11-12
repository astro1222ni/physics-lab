/* 任務可達成的證明腳本。用法：node tools/mission-proofs/e-over-m.js
 * 用真正的任務檢查函式 + 物理核心模擬頁面（js/e-over-m.js）送出的事件，證明每個任務都做得到、預設狀態不會觸發任務。
 * 修改物理核心、頁面事件或任務條件後重跑。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(__ROOT + 'js/e-over-m-core.js');
global.window = { LabMission: { register(id, list) { global.M = list; } } }; global.LabMission = global.window.LabMission;
require(__ROOT + 'js/missions/e-over-m.js');

const ZERO = C.APP.scaleZero * 100, RB = C.APP.bulbR * 100;
let done = {}, cal = { eV: 0, eI: 0 };
let st, rows;
function reset() { st = { power: false, warm: 0, fromMin: false, V: 0, I: 0, alpha: 0, mode: 'ideal', parallax: false }; rows = []; M.forEach(m => { m.mem = {}; }); }
const meterV = () => st.mode === 'real' ? C.meter(st.V, cal.eV, 1) : Math.round(st.V);
const meterI = () => st.mode === 'real' ? C.meter(st.I, cal.eI, 0.01) : Math.round(st.I * 100) / 100;
function orbit() {
  if (st.V <= 0) return null;
  const o = C.orbit({ V: st.V, I: st.I, uniform: st.mode !== 'real', alpha: st.alpha * Math.PI / 180, maxTurns: 12 });
  return { o, D: o.D * 100, xMin: o.xMin * 100, xMax: o.xMax * 100, top: o.yMax * 100, gap: RB - o.maxDist * 100 };
}
function beamOn() { return st.power && st.warm >= 1 && st.V >= C.GLOW_V; }
function info() {
  const b = orbit();
  return { power: st.power, warm: st.warm >= 1, on: beamOn(), fromMin: st.fromMin,
    complete: !!(b && beamOn() && b.o.closed && st.alpha === 0), V: st.V, I: st.I, Vm: meterV(), Im: meterI(), alpha: st.alpha,
    mode: st.mode, parallax: st.parallax, closed: !!(b && b.o.closed), hitGlass: !!(b && b.o.hitGlass), turns: b ? b.o.turns : 0,
    D: b ? b.D : 0, top: b ? b.top : 0, gap: b ? b.gap : 0, zMax: b ? b.o.zMax * 100 : 0 };
}
function emit(type, data, label) {
  M.forEach(m => { if (done[m.id]) return; if (m.check({ type, data }, m.mem)) done[m.id] = label; });
}
function set(k, v) { st[k] = v; emit('beam', info(), `${k}=${v}`); }
function power(on) {
  if (on) { st.power = true; st.fromMin = st.V === 0 && st.I === 0; st.warm = 1; emit('beam', info(), 'power on'); emit('power', { on: true, fromMin: st.fromMin }); }
  else { st.power = false; st.warm = 0; emit('beam', info(), 'power off'); }
}
/** 記錄：游標對準電子束最左、最右端（讀到 0.01 cm）；有視差時假設眼睛正對每一個游標（等於真正的邊緣） */
function record(label) {
  const b = orbit();
  if (!beamOn() || !b || !b.o.closed || st.alpha !== 0) throw new Error('cannot record: ' + label);
  const xL = Math.round((b.xMin - ZERO) * 100) / 100, xR = Math.round((b.xMax - ZERO) * 100) / 100;
  const row = { V: meterV(), I: meterI(), xL, xR, D: +(xR - xL).toFixed(2), Dtrue: b.D, mode: st.mode, parallax: st.parallax, eyeOK: st.parallax };
  rows.push(row);
  const A = C.analyze(rows.map(r => ({ V: r.V, I: r.I, D: r.D / 100 })));
  const em = A.rows[A.rows.length - 1].em;
  const vset = new Set(rows.map(r => r.V));
  emit('record', { row: Object.assign({ em, err: em / C.EM - 1 }, row), rows: rows.map((r, i) => Object.assign({ em: A.rows[i].em }, r)),
    n: A.n, distinctV: vset.size, fitErr: A.fitErr, meanErr: A.meanErr, allReal: rows.every(r => r.mode === 'real' && r.parallax && r.eyeOK), top: b.top },
  `${label}: V=${row.V} I=${row.I.toFixed(2)} D=${row.D.toFixed(2)} (true ${b.D.toFixed(3)}) e/m err ${((em / C.EM - 1) * 100).toFixed(2)}% fit ${(A.fitErr * 100).toFixed(2)}%`);
  return { row, A, em };
}

// ---------- 1. 預設狀態與隨便操作不應觸發 ----------
reset();
set('V', 0); set('I', 0); set('alpha', 0);
console.log('預設狀態觸發：', Object.keys(done).length ? Object.keys(done) : '無');
// 「快速開機」（沒有先歸零）不算第 1 關
set('V', 150); set('I', 1.4); power(true); set('I', 1.41);
console.log('快速開機（未歸零）觸發：', Object.keys(done).length ? Object.keys(done) : '無');

// ---------- 2. 一般任務（理想模式） ----------
done = {}; reset();
power(true); set('V', 100); set('I', 1.0);                       // m1
record('m2/m3');                                                 // m2, m3
set('I', 2.0); record('m4 (2x current)');                        // m4
set('V', 200); set('I', 1.41); record('m6 (200 V, I x sqrt2)');  // m6（與 100 V、1.00 A 同直徑）
set('V', 150); set('I', 1.20); record('m5 150');
set('V', 250); set('I', 1.40); record('m5 250 / m8');            // m5、m8
set('parallax', true); set('V', 120); set('I', 1.5); record('m7 parallax');
// h1 螺旋、h2 貼近玻璃、h3 頂端過球心
set('parallax', false);
set('V', 100); set('I', 1.92); set('alpha', 6);                   // h1
set('alpha', 0);
// h3（11/12 收緊）：光束經過頂端在球心不算，要記錄一筆；任務 4、6 常見的 100 V 2.00 A（頂端 −0.17 cm）、150 V 2.40 A（−0.08 cm）不會完成
if (done['e-over-m-h3']) { console.log('✗ h3 不應在記錄前完成'); process.exitCode = 1; }
set('V', 150); set('I', 2.40); record('不是 h3：150 V 2.40 A');
if (done['e-over-m-h3']) { console.log('✗ 150 V 2.40 A 不應完成 h3'); process.exitCode = 1; }
set('V', 100); set('I', 1.92); record('h3：100 V 1.92 A，頂端 0.007 cm');
set('V', 300); set('I', 1.22);                                   // h2
// m9：含誤差模式，同一電壓的小圓與大圓
set('mode', 'real'); set('V', 150); set('I', 2.0); record('m9 small');
set('I', 0.88); record('m9 large');
for (const m of M) console.log(m.id.padEnd(14), 'L' + String(m.level).padEnd(3), done[m.id] ? '✓ ' + done[m.id] : '✗ ' + (m.id.endsWith('-10') ? '（下面另外證明）' : ''));
const missing = M.filter(m => !m.id.endsWith('-10') && !done[m.id]).map(m => m.id);

// ---------- 3. 第 10 關：任何一組電表校正誤差（四個極端組合）都做得到 ----------
console.log('\n第 10 關（含誤差＋視差，5 筆、5 種電壓，中小型的圓）：');
let worst = 0;
for (const eV of [-0.004, 0.004]) for (const eI of [-0.003, 0.003]) {
  cal = { eV, eI }; done = {}; reset();
  power(true); set('mode', 'real'); set('parallax', true);
  // 半徑約 3 cm 的圓：I = sqrt(2V/em) / (K r)
  for (const V of [100, 150, 200, 250, 300]) {
    const I = Math.round(Math.sqrt(2 * V / C.EM) / (C.helmholtzK(C.APP.N, C.APP.R) * 0.03) * 100) / 100;
    set('V', V); set('I', I); record(`V=${V}`);
  }
  const A = C.analyze(rows.map(r => ({ V: r.V, I: r.I, D: r.D / 100 })));
  worst = Math.max(worst, Math.abs(A.fitErr));
  console.log(`  eV=${eV >= 0 ? '+' : ''}${eV} eI=${eI >= 0 ? '+' : ''}${eI}: 斜率誤差 ${(A.fitErr * 100).toFixed(2)}%  →  m10 ${done['e-over-m-10'] ? '✓' : '✗'}`);
}
console.log(`  最差 ${(worst * 100).toFixed(2)}%（門檻 2%）`);
const allOk = worst <= 0.02 && missing.length === 0;
if (missing.length) console.log('做不到：', missing);

// 結束碼：任何任務做不到就失敗
cal = { eV: 0, eI: 0 };
process.exitCode = allOk ? 0 : 1;
