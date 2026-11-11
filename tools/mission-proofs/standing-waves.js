/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/standing-waves.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const SW = require(__ROOT + 'js/standing-waves-core.js');
let list;
global.window = { LabMission: { register: (m, l) => { list = l; } } };
global.LabMission = window.LabMission;
require(__ROOT + 'js/missions/standing-waves.js');
const RHO = 0.7;
function steady(end, f, v, L, opt) {
  opt = opt || {};
  const p = { end, f, v, L, a: 1, rho: RHO }, near = SW.nearestHarmonic(p), c = SW.modeCounts(end, near.n), pts = SW.standingPoints(p);
  const Tr = SW.roundTrip(p), t = opt.t || 10 * Tr + 0.01;
  return { type: 'steady', data: { end, f, v, L, lambda: v / f, f1: SW.fundamental(end, v, L), resonant: near.resonant, n: near.n, m: near.m, fn: near.f,
    nodes: near.resonant ? c.nodes : null, antinodes: near.resonant ? c.antinodes : null, nodePositions: pts.nodes, antinodePositions: pts.antinodes,
    ampSteady: SW.steadyAmplitude(p), gain: SW.gain(end, f, v, L, RHO), t, roundTrips: Math.floor(t / Tr), skipped: !!opt.skipped } };
}
function pulse(type, end, shape, v, L, w, t) {
  const p = { end, shape, v, L, w, A: 3 }, tm = SW.pulseTimes(p);
  t = t == null ? tm.tHit : t;
  let mx = 0; for (let i = 0; i <= 400; i++) mx = Math.max(mx, Math.abs(SW.pulseAt(p, L * i / 400, t).sum));
  return { type, data: { end, shape, v, L, w, A: 3, t, tHit: tm.tHit, tStart: tm.tStart, tEnd: tm.tEnd, maxAbs: mx } };
}
const byId = Object.fromEntries(list.map(m => [m.id, m]));
function run(id, evs, expect = true) {
  const m = byId[id], mem = {}; let ok = false;
  evs.forEach(e => { if (m.check(e, mem)) ok = true; });
  console.log((ok === expect ? 'OK  ' : 'FAIL') + ' ' + id + (expect ? '' : ' (應不通過)'));
}
const fh = (end, n, v, L) => SW.harmonicFreq(end, n, v, L);
run('standing-waves-1', [pulse('pulseReflected', 'fixed', 'sine', 2, 2, 0.4)]);
run('standing-waves-2', [pulse('pulseReflected', 'fixed', 'sine', 2, 2, 0.4), pulse('pulseReflected', 'free', 'sine', 2, 2, 0.4)]);
run('standing-waves-3', [steady('fixed', fh('fixed', 1, 2, 2), 2, 2)]);
run('standing-waves-3', [steady('fixed', 1.2, 2, 2)], false);
run('standing-waves-4', [pulse('pulseReflected', 'fixed', 'sine', 2.2, 2, 0.4)]);
run('standing-waves-4', [pulse('pulseReflected', 'fixed', 'sine', 2, 2, 0.4)], false);
run('standing-waves-5', [steady('fixed', fh('fixed', 4, 2, 2), 2, 2)]);
run('standing-waves-6', [steady('free', fh('free', 3, 2, 2), 2, 2)]);
run('standing-waves-7', [steady('fixed', 3, 3, 2)]);
run('standing-waves-7', [steady('fixed', 3, 3, 1.5)], false);
run('standing-waves-8', [steady('free', fh('free', 3, 2, 1), 2, 1)]);
console.log('  λ =', 2 / fh('free', 3, 2, 1));
run('standing-waves-9', [steady('fixed', fh('fixed', 2, 2, 2), 2, 2), steady('free', fh('free', 2, 2, 1.5), 2, 1.5)]);
console.log('  f =', fh('fixed', 2, 2, 2), fh('free', 2, 2, 1.5));
run('standing-waves-10', [steady('fixed', 1.25, 2, 2)]);
console.log('  A(1.25) =', SW.steadyAmplitude({ end: 'fixed', f: 1.25, v: 2, L: 2, a: 1, rho: RHO }));
// 0.001 Hz 精度下的容許範圍
let ok10 = []; for (let f = 1.2; f <= 1.3; f += 0.001) if (SW.steadyAmplitude({ end: 'fixed', f, v: 2, L: 2, a: 1, rho: RHO }) <= 0.59) ok10.push(f.toFixed(3));
console.log('  可行頻率範圍', ok10[0], '–', ok10[ok10.length - 1]);
run('standing-waves-10', [steady('fixed', 1.2, 2, 2)], false);
run('standing-waves-11', [steady('fixed', 2.5, 1.5, 1.8)]);
run('standing-waves-11', [steady('fixed', 2.5, 1, 1.2)]);
run('standing-waves-11', [steady('fixed', 2.5, 3, 3)], false);
run('standing-waves-h1', [steady('fixed', 1, 2, 2, { t: 60.5 })]);
run('standing-waves-h1', [steady('fixed', 1, 2, 2, { t: 80.5, skipped: true })], false);
run('standing-waves-h2', [steady('fixed', fh('fixed', 6, 4, 1), 4, 1)]);
run('standing-waves-h2', [steady('free', fh('free', 6, 4, 1), 4, 1)]);
// h3：固定端、對稱脈波，在 tHit 附近暫停
const pp = { end: 'fixed', shape: 'sine', v: 0.5, L: 2, w: 0.8, A: 3 }, tm = SW.pulseTimes(pp);
let win = []; for (let d = -0.05; d <= 0.05; d += 0.0005) { const e = pulse('paused', 'fixed', 'sine', 0.5, 2, 0.8, tm.tHit + d); if (byId['standing-waves-h3'].check(e, {})) win.push(d); }
console.log('  h3 視窗 (v=0.5, w=0.8, 半正弦)：τ ∈ [', win[0].toFixed(4), ',', win[win.length - 1].toFixed(4), '] s → 慢動作下真實時間約 ±', (win[win.length - 1] / 0.25).toFixed(3), 's');
run('standing-waves-h3', [pulse('paused', 'fixed', 'sine', 0.5, 2, 0.8, tm.tHit + 0.005)]);
run('standing-waves-h3', [pulse('paused', 'fixed', 'gauss', 0.5, 2, 0.8, SW.pulseTimes({ ...pp, shape: 'gauss' }).tHit)]);
run('standing-waves-h3', [pulse('paused', 'fixed', 'tri', 0.5, 2, 0.8, tm.tHit)], false);
run('standing-waves-h3', [pulse('paused', 'free', 'sine', 0.5, 2, 0.8, tm.tHit)], false);
run('standing-waves-h3', [pulse('paused', 'fixed', 'sine', 0.5, 2, 0.8, 0.1)], false);
// 預設狀態不會意外過關：預設 f = 1.2 Hz、v = 2、L = 2、固定端
const def = steady('fixed', 1.2, 2, 2, { t: 61 });
list.forEach(m => { if (m.check(def, {})) console.log('FAIL 預設狀態意外過關', m.id); });
console.log('任務數', list.length, list.map(m => m.id + ':' + m.level).join(' '));
