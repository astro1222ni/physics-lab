/* 任務可達成的證明腳本。用法：node tools/mission-proofs/microwave.js
 * 用物理核心照頁面的做法產生「記錄」與「狀態」事件（滑桿精度：ψ 0.5°、探針 0.01 cm、偏極柵可打字到 0.1°、讀數到 0.01 mA），
 * 確認每個任務都做得到、預設狀態不會觸發任務。修改物理核心或任務條件後重跑。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(__ROOT + 'js/microwave-core.js');
let list;
global.window = { LabMission: { register: (m, l) => { list = l; } } };
global.LabMission = window.LabMission;
require(__ROOT + 'js/missions/microwave.js');
const byId = Object.fromEntries(list.map(m => [m.id, m]));
let fails = 0;
function run(id, evs, expect = true, note = '') {
  const m = byId[id], mem = {}; let ok = false;
  evs.forEach(e => { if (m.check(e, mem)) ok = true; });
  if (ok !== expect) fails++;
  console.log((ok === expect ? 'OK  ' : 'FAIL') + ' ' + id + (expect ? '' : '（應不通過）') + (note ? '  ' + note : ''));
}
const K = C.KIT, DEG = Math.PI / 180;
const r2 = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
const half = x => Math.round(x * 2) / 2;
const F0 = 10.525;
const hp = lam => K.hpbw * lam / C.lambdaCm(F0);

// ---------- 頁面的記錄（同 js/microwave.js 的 record()） ----------
function reflectRow(thetaI, psi, o = {}) {
  const f = o.f || F0, lam = C.lambdaCm(f), tilt = o.err ? (o.tilt || 1.5) : 0, sens = o.sens || 1;
  const p = { thetaI, plate: true, tilt, lam, hpbw: hp(lam) };
  const psiPeak = C.extremum(x => C.reflectSignal({ ...p, psi: x }), Math.max(30, 2 * thetaI - 30), Math.min(180, 2 * thetaI + 30), 1, 240);
  const I = r2(C.meter(C.reflectSignal({ ...p, psi }), sens, 'reflect'), 2);
  return { mode: 'reflect', thetaI, psi, thetaR: psi - thetaI, I, err: !!o.err, fTrue: f, psiPeak, sens };
}
function refractRow(mat, n, psi, o = {}) {
  const f = o.f || F0, lam = C.lambdaCm(f), tilt = o.err ? (o.tilt || 1.5) : 0;
  const p = { n, A: K.prismA, lam, tilt };
  const psiPeak = C.extremum(x => C.refractSignal({ ...p, psi: x }), 110, 180, 1, 140);
  const q = C.prismFromPsi(psi, K.prismA);
  return { mode: 'refract', mat, psi, delta: q.delta, theta2: q.theta2, n: q.n, I: r2(C.meter(C.refractSignal({ ...p, psi }), 1, 'refract'), 2),
    nAcc: n, unknown: mat === 'unknown', revealed: !!o.revealed, err: !!o.err, fTrue: f, psiPeak, nPeak: C.prismFromPsi(psiPeak, K.prismA).n };
}
function standRow(x0, x1, N, o = {}) {
  const f = o.f || F0, lam = C.lambdaFromNodes(x0, x1, N);
  return { mode: 'standing', x0, x1, N, dx: Math.abs(x1 - x0), lam, f: C.freqGHz(lam), fTrue: f, lamTrue: C.lambdaCm(f), unknown: !!o.unknown, revealed: !!o.revealed, err: !!o.err };
}
function polarSig(g1on, g1, g2on, g2, rx, d, o = {}) {
  const lam = C.lambdaCm(o.f || F0);
  return C.polarSignal({ g1: { on: g1on, ang: g1 }, g2: { on: g2on, ang: g2 }, rx, d, lam, leak: o.err ? 0.04 : 0, tPerp: o.err ? 0.96 : 1 });
}
function polarRow(rows, g1on, g1, g2on, g2, rx, d, o = {}) {
  const sens = o.sens || 1, r = polarSig(g1on, g1, g2on, g2, rx, d, o);
  const row = { mode: 'polar', g1on, g1, g2on, g2, rx, d, sens, I: r2(C.meter(r.S, sens, 'polar'), 2), err: !!o.err, fTrue: o.f || F0, amp2: r.amp * r.amp };
  const isRef = x => (!x.g1on || x.g1 === 0) && (!x.g2on || x.g2 === 0) && x.rx === 0 && x.I > 0;
  const same = x => x.g1on === row.g1on && x.g2on === row.g2on && Math.abs(x.d - row.d) < 0.005 && x.sens === row.sens && x.err === row.err;
  const ref = isRef(row) ? row : rows.slice().reverse().find(x => same(x) && isRef(x));
  row.ref = ref ? ref.I : null; row.ratio = ref ? row.I / ref.I : null;
  return row;
}
/** 依序記錄，每次送出含整張表的事件 */
function events(rows) { const out = []; rows.forEach((r, i) => out.push({ type: 'record', data: { mode: r.mode, row: r, rows: rows.slice(0, i + 1), err: r.err } })); return out; }

// 駐波：真正讀數最小的位置（探針精度 0.01 cm）
function trueNode(lam, tilt, s) {
  const p = { lam, tilt, hpbw: hp(lam) }, pp = C.platePrep(C.standingScene(p)), nn = C.nodeNear(p, s);
  return r2(C.extremum(x => C.standingSignal(p, x, 0, pp), nn - lam / 4, nn + lam / 4, -1, 200), 2);
}

// ---------- 1–3 反射 ----------
const lam0 = C.lambdaCm(F0);
const refl = [20, 30, 40, 50, 60, 70, 80].map(th => { const r0 = reflectRow(th, 180); return reflectRow(th, half(r0.psiPeak)); });
console.log('  反射：讀數最大的 ψ（θi 20–80）', refl.map(r => r.psiPeak.toFixed(2)).join(' '), '→ θr', refl.map(r => r.thetaR.toFixed(1)).join(' '));
run('microwave-1', events([refl[0]]));
run('microwave-2', events([refl[2]]), true, 'θi = 40°，ψ = ' + refl[2].psi);
run('microwave-2', events([reflectRow(40, half(refl[2].psiPeak) + 3)]), false);
run('microwave-3', events(refl));
run('microwave-3', events(refl.slice(0, 6)), false);

// ---------- 4、7、10–12 駐波 ----------
const n40 = trueNode(lam0, 0, 40), n5 = trueNode(lam0, 0, n40 - 2.5 * lam0);
console.log('  駐波：起點', n40, '終點（第 5 個波節）', n5, '→ λ =', C.lambdaFromNodes(n40, n5, 5).toFixed(4), '（真值', lam0.toFixed(4) + '）');
run('microwave-4', events([standRow(n40, n5, 5)]));
run('microwave-4', events([standRow(n40, n5 - 0.2, 5)]), false);
const starts = [40, 39, 41, 42.4, 37.6];
const rows7 = starts.map(s => { const a = trueNode(lam0, 0, s), b = trueNode(lam0, 0, a - 2.5 * lam0); return standRow(a, b, 5); });
console.log('  5 次 λ', rows7.map(r => r.lam.toFixed(4)).join(' '), '→ f =', (29.9792458 / rows7.reduce((s, r) => s + r.lam, 0) * 5).toFixed(4), 'GHz');
run('microwave-7', events(rows7));
run('microwave-7', events(rows7.slice(0, 4)), false);
// 10：未知頻率（8.8–11.6 GHz），3 次、每次 5 個波節
let worst10 = 0;
for (let f = 8.8; f <= 11.6001; f += 0.2) {
  const lam = C.lambdaCm(f);
  const rows = [40, 39.2, 41.1].map(s => { const a = trueNode(lam, 0, s), b = trueNode(lam, 0, a - 2.5 * lam); return standRow(a, b, 5, { f, unknown: true }); });
  const fm = 29.9792458 / (rows.reduce((s, r) => s + r.lam, 0) / 3);
  worst10 = Math.max(worst10, Math.abs(fm - f) / f);
  if (Math.abs(f - 9.6) < 1e-6) run('microwave-10', events(rows), true, 'f = 9.6 GHz');
}
console.log('  未知頻率 8.8–11.6 GHz：最壞的誤差', (worst10 * 100).toFixed(3) + '%（容許 0.7%）');
run('microwave-10', events([standRow(39.32, 32.21, 5, { f: 10.525, unknown: true, revealed: true })].concat(rows7.slice(0, 2))), false);
// 11、12：含誤差（發射器偏 ±2°，刻度讀數 ±0.03 cm 的隨機誤差）
function errRows(N, seed, tilt, k) {
  let a = seed; const rnd = () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; };
  const lam = lam0, out = [];
  for (let i = 0; i < (k || 5); i++) {
    const s = 40 + (i - 2) * 0.7;
    const x0 = trueNode(lam, tilt, s), x1 = trueNode(lam, tilt, x0 - N / 2 * lam);
    out.push(standRow(r2(x0 + (rnd() * 2 - 1) * 0.03, 2), r2(x1 + (rnd() * 2 - 1) * 0.03, 2), N, { err: true }));
  }
  return out;
}
let pass11 = 0, pass12 = 0, best12 = 9;
for (let seed = 1; seed <= 40; seed++) {
  const tilt = (seed % 2 ? 1 : -1) * (0.8 + (seed % 7) * 0.2);
  const a = errRows(5, seed, tilt), b = errRows(8, seed + 100, tilt);
  if (byId['microwave-11'].check(events(a).pop(), {})) pass11++;
  if (byId['microwave-12'].check(events(b).pop(), {})) pass12++;
  best12 = Math.min(best12, Math.abs(b.reduce((s, r) => s + r.lam, 0) / 5 - lam0) / lam0);
}
const ex8 = [40, 39.3, 40.7, 38.6, 41.4].map(s => { const x0 = trueNode(lam0, 2, s), x1 = trueNode(lam0, 2, x0 - 4 * lam0); return standRow(x0, x1, 8, { err: true }); });
const ex8err = Math.abs(ex8.reduce((s, r) => s + r.lam, 0) / 5 - lam0) / lam0;
console.log('  含誤差、隨機讀數誤差 ±0.03 cm：40 組裡 11 號任務通過', pass11, '組，12 號任務通過', pass12, '組；波節位置讀準時 N = 8 的系統偏差', (ex8err * 100).toFixed(3) + '%');
run('microwave-11', events(errRows(5, 3, 1.4)));
run('microwave-12', events(ex8), true, '讀準每個波節（N = 8、發射器偏 2°）');
run('microwave-12', events(errRows(5, 3, 1.4)), false);

// ---------- 5、8 偏振 ----------
const prow = [];
[0, 30, 45, 60, 90].forEach(a => prow.push(polarRow(prow, true, 0, true, a, 0, 55)));
console.log('  偏振 I（mA）', prow.map(r => r.I.toFixed(2)).join(' '), ' I/I0', prow.map(r => r.ratio == null ? '—' : r.ratio.toFixed(3)).join(' '));
run('microwave-5', events(prow));
run('microwave-5', events(prow.slice(0, 4)), false);
const half8 = [];
half8.push(polarRow(half8, true, 0, true, 0, 0, 40));
const ok8 = [];
for (let a = 25; a <= 40; a += 0.5) { const r = polarRow(half8, true, 0, true, a, 0, 40); if (r.ratio >= 0.47 && r.ratio <= 0.53) ok8.push(a); }
console.log('  讀數減半（d = 40 cm）：可行的柵 2 角度', ok8[0] + '°–' + ok8[ok8.length - 1] + '°（滑桿每 5°，要用打字輸入）');
half8.push(polarRow(half8, true, 0, true, 33, 0, 40));
run('microwave-8', events(half8), true, '柵 2 = 33°，I/I0 = ' + half8[1].ratio.toFixed(3));
const h30 = [polarRow([], true, 0, true, 0, 0, 40)]; h30.push(polarRow(h30, true, 0, true, 30, 0, 40));
run('microwave-8', events(h30), false);

// ---------- 6、9 折射 ----------
const rf = [];
for (const [mat, n] of [['polystyrene', 1.59], ['paraffin', 1.49]]) {
  const pk = refractRow(mat, n, 180).psiPeak, r = refractRow(mat, n, half(pk));
  rf.push(r);
  console.log('  ' + mat + '：讀數最大的 ψ =', pk.toFixed(2), '→ n =', r.n.toFixed(4), '（公認', n + '，誤差', ((r.n - n) / n * 100).toFixed(2) + '%）');
}
run('microwave-6', events([rf[0]]));
run('microwave-6', events([refractRow('polystyrene', 1.59, 162)]), false);
let worst9 = 0;
for (let n = 1.40; n <= 1.6201; n += 0.02) {
  const pk = refractRow('unknown', n, 180).psiPeak, r = refractRow('unknown', n, half(pk));
  worst9 = Math.max(worst9, Math.abs(r.n - n) / n);
  if (Math.abs(n - 1.62) < 1e-6) run('microwave-9', events([r, refractRow('unknown', n, half(pk) - 0.5)]), true, 'n = 1.62');
}
console.log('  未知材料 n = 1.40–1.62，讀數最大法的最壞誤差', (worst9 * 100).toFixed(2) + '%（容許 2.5%）');
run('microwave-9', events([refractRow('unknown', 1.5, 160, { revealed: true }), refractRow('unknown', 1.5, 160, { revealed: true })]), false);

// ---------- 隱藏任務（狀態事件） ----------
function state(o) {
  return { type: 'state', data: Object.assign({ mode: 'reflect', err: false, plate: false, thetaI: 20, psi: 180, shadow: false, reading: 0.82, over: false, sens: 1,
    g1on: false, g1: 0, g2on: false, g2: 0, rx: 0, d: 55, amp2: null, s: 40 }, o) };
}
const pol = (o) => { const r = polarSig(!!o.g1on, o.g1 || 0, !!o.g2on, o.g2 || 0, o.rx || 0, 55); return state(Object.assign({ mode: 'polar', amp2: r.amp * r.amp }, o)); };
run('microwave-h1', [pol({ rx: 90, g2on: true, g2: 45 })], true, 'ρ = 90°、柵 2 = 45° → 振幅平方 ' + polarSig(false, 0, true, 45, 90, 55).amp ** 2);
run('microwave-h1', [pol({ rx: 90 })], false);
run('microwave-h2', [pol({ rx: 180 })]);
run('microwave-h2', [pol({ rx: 175 })], false);
function shadowOf(th, psi) {
  const r = { x: -K.arm * Math.cos(psi * DEG), y: K.arm * Math.sin(psi * DEG) }, a = { x: -K.arm, y: 0 };
  const tx = Math.sin(th * DEG), ty = Math.cos(th * DEG), dx = r.x - a.x, dy = r.y - a.y, den = dx * ty - dy * tx;
  const u = (-a.x * ty + a.y * tx) / den, v = (-a.x * dy + a.y * dx) / den;
  return u > 0 && u < 1 && Math.abs(v) <= K.plateW / 2;
}
const behind = (psi, sens) => C.meter(C.reflectSignal({ thetaI: 20, psi, plate: true, lam: lam0, hpbw: hp(lam0) }), sens, 'reflect');
console.log('  金屬板後方（θi = 20°）：ψ = 176° 靈敏度 ×1 讀數', behind(176, 1).toFixed(3), 'mA；×10 讀數', behind(176, 10).toFixed(3), 'mA；在影子裡', shadowOf(20, 176));
run('microwave-h3', [state({ plate: true, psi: 176, shadow: shadowOf(20, 176), reading: behind(176, 10), sens: 10 })]);
run('microwave-h3', [state({ plate: true, psi: 176, shadow: shadowOf(20, 176), reading: behind(176, 1) })], false);

// ---------- 預設狀態不會過關 ----------
const def = [state({}), state({ mode: 'polar', amp2: 1, reading: 0.52 })];
list.forEach(m => def.forEach(e => { if (m.check(e, {})) { fails++; console.log('FAIL 預設狀態意外過關', m.id); } }));
console.log('任務數', list.length, list.map(m => m.id + ':' + m.level).join(' '));
console.log(fails ? '有 ' + fails + ' 項不符合預期' : '全部符合預期');
process.exit(fails ? 1 : 0);
