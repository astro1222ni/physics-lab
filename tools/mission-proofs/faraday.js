/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/faraday.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const F = require(__ROOT + 'js/faraday-core.js');
let list;
global.window = { LabMission: { register: (m, l) => { list = l; } } };
global.LabMission = window.LabMission;
require(__ROOT + 'js/missions/faraday.js');
const M = Object.fromEntries(list.map(m => [m.id, m]));
const mems = {}; const chk = (id, type, data) => M[id].check({ type, data }, mems[id] = mems[id] || {});
const pass = (o) => { const p = { N: o.N, a: o.a, R: o.R, flipped: !!o.flipped }; const s = F.passSummary(p, o.v, o.dir || 1);
  return { mode: 'A', motion: 'pass', N: o.N, a: o.a, R: o.R, v: o.v, f: 0.5, dir: o.dir || 1, flipped: !!o.flipped, epsPeak: s.epsPeak, IPeak: s.IPeak, firstSign: s.firstSign, qHalf: s.qHalf, qTotal: s.qTotal, phiMax: s.phiMax }; };
const rodP = (o) => Object.assign({ x0: F.RAIL.x0, Bsign: -1 }, o);
function rodRun(o) { // 模擬頁面：tEnd、live（終端）、rodHalf、rodEnd
  const p = rodP(o), d = F.rodDerived(p);
  const tRail = F.rodTimeTo(F.RAIL.D, p, 3600), tStop = p.sub === 'release' && p.v0 > 0 ? d.tau * Math.log(1000) : Infinity;
  const tEnd = Math.min(tRail, tStop), reason = tRail <= tStop ? 'rail' : 'stopped';
  const base = Object.assign({ mode: 'B' }, o);
  const ev = (t) => { const s = F.rodState(t, p); return Object.assign({}, base, { t, x: s.x, v: s.v, eps: s.eps, I: s.I, P: s.P, heat: s.heat, work: s.work, KE: s.KE, tau: s.tau, vt: s.vt }); };
  const lives = []; for (let t = 0; t <= Math.min(tEnd, 60); t += 0.1) lives.push(ev(t)); lives.push(ev(Math.min(tEnd, 60)));
  const end = Object.assign(ev(tEnd), { reason, travel: F.rodState(tEnd, p).x - p.x0 });
  const half = d.tau * Math.LN2;
  return { lives, end, half: half <= tEnd ? Object.assign(ev(half), { tHalf: half }) : null, tEnd, reason };
}
const res = [];
const ok = (id, cond, sol) => res.push(`${cond ? 'OK ' : 'FAIL'} ${id} (L${M[id].level}) — ${sol}`);
// 1
ok('faraday-1', chk('faraday-1', 'passEnd', pass({ N: 100, a: 0.03, R: 10, v: 0.5, flipped: true })), '翻轉磁鐵後等速通過');
ok('faraday-1', !chk('faraday-1', 'passEnd', pass({ N: 100, a: 0.03, R: 10, v: 0.5, dir: -1 })), '（只反向不行）');
// 2 由右往左，未翻轉：S 極接近
{ let hit = false; const p = { N: 100, a: 0.03, R: 10, flipped: false };
  for (let t = 0; t < F.passDuration(0.5); t += 0.02) { const m = F.passState(t, 0.5, -1), s = F.coilState(m.x, m.v, p);
    if (chk('faraday-2', 'liveA', { motion: 'pass', I: s.I, nearPole: F.nearPole(s.I, m.x) })) hit = true; }
  let def = false;
  for (let t = 0; t < F.passDuration(0.5); t += 0.002) { const m = F.passState(t, 0.5, 1), s = F.coilState(m.x, m.v, p);
    if (Math.abs(s.I) > 1e-6 && F.nearPole(s.I, m.x) === 'S') def = true; }
  ok('faraday-2', hit && !def, '改成由右往左通過（S 極接近）；預設方向不會觸發');
}
// 3
chk('faraday-3', 'passEnd', pass({ N: 100, a: 0.03, R: 10, v: 0.2 }));
ok('faraday-3', chk('faraday-3', 'passEnd', pass({ N: 100, a: 0.03, R: 10, v: 0.6 })), 'v = 0.2 與 0.6 m/s 各通過一次');
// 4
ok('faraday-4', rodRun({ sub: 'const', B: 1, L: 0.5, R: 1, m: 0.2, v0: 3, F: 0.4 }).lives.some(e => chk('faraday-4', 'liveB', e)), '等速拉動 B=1 T, L=0.5 m, v=3 m/s');
// 5
chk('faraday-5', 'passEnd', pass({ N: 100, a: 0.03, R: 10, v: 0.25 }));
ok('faraday-5', chk('faraday-5', 'passEnd', pass({ N: 100, a: 0.03, R: 10, v: 0.5 })), 'v = 0.25 → 0.5 m/s');
// 6
{ const e = pass({ N: 200, a: 0.03, R: 10, v: 0.95 }); ok('faraday-6', chk('faraday-6', 'passEnd', e), `N=200, a=3 cm, v=0.95 m/s → ${e.epsPeak.toFixed(4)} V`); }
// 7
{ const r = rodRun({ sub: 'force', B: 1, L: 0.5, R: 1, m: 0.05, v0: 0, F: 0.5 }); ok('faraday-7', r.lives.some(e => chk('faraday-7', 'liveB', e)), `定力 F=0.5 N, B=1, L=0.5, R=1, m=0.05 → vt=2, 結束 ${r.reason} t=${r.tEnd.toFixed(2)}`); }
// 8
{ const o = { sub: 'release', B: 1, L: 0.5, R: 1, m: 0.25, v0: 1, F: 0 }; const r = rodRun(o);
  ok('faraday-8', chk('faraday-8', 'rodEnd', r.end), `放開 v0=1, m=0.25, R=1, B=1, L=0.5 (τ=1 s) → 滑行 ${r.end.travel.toFixed(4)} m, ${r.reason}`); }
// 9
{ const o = { sub: 'release', B: 0.5, L: 0.5, R: 0.9, m: 0.1, v0: 1, F: 0 }; const r = rodRun(o);
  ok('faraday-9', r.half && chk('faraday-9', 'rodHalf', r.half), `放開 B=0.5, L=0.5, R=0.90, m=0.1, v0=1 → t½=${r.half && r.half.tHalf.toFixed(4)} s`); }
// 10
{ const p = { N: 210, a: 0.03, R: 50, flipped: false }; const pk = F.oscPeak(p, 1.0);
  ok('faraday-10', chk('faraday-10', 'cycle', { mode: 'A', N: 210, a: 0.03, R: 50, f: 1.0, flipped: false, epsPeak: pk, IPeak: pk / 50 }), `f=1.0 Hz, R=50, N=210, a=3 cm → ${(pk / 50 * 1e3).toFixed(3)} mA`); }
// 11
{ const r = rodRun({ sub: 'force', B: 2, L: 0.5, R: 0.75, m: 0.05, v0: 0, F: 2 }); ok('faraday-11', r.lives.some(e => chk('faraday-11', 'liveB', e)), 'F=2 N, B=2 T, L=0.5, R=0.75, m=0.05 → vt=1.5, P=3 W'); }
// 12
{ const e = pass({ N: 100, a: 0.03, R: 31.5, v: 0.948 }); ok('faraday-12', chk('faraday-12', 'passEnd', e), `N=100, a=3 cm, R=31.5 Ω, v=0.948 → ε=${e.epsPeak.toFixed(4)} V, q=${(Math.abs(e.qHalf) * 1e3).toFixed(4)} mC`); }
// h1
ok('faraday-h1', chk('faraday-h1', 'liveA', { motion: 'drag', centered: true, stillFor: 1.05, dragPeakI: 0.012 }), '拖曳磁鐵產生電流後，放在線圈正中央（±4 mm）靜止 1 s');
// h2
{ const r = rodRun({ sub: 'force', B: 1, L: 0.5, R: 1, m: 0.05, v0: 3, F: 0.25 }); ok('faraday-h2', r.lives.some(e => chk('faraday-h2', 'liveB', e)), `定力 F=0.25 N（vt=1）、v0=3、m=0.05 → 由上方降到終端速度, ${r.reason} t=${r.tEnd.toFixed(2)}`); }
// h3
{ const r = rodRun({ sub: 'release', B: 1, L: 0.5, R: 0.2, m: 0.5, v0: 2, F: 0 }); ok('faraday-h3', chk('faraday-h3', 'rodEnd', r.end), `放開 m=0.5, v0=2, B=1, L=0.5, R=0.2 → Q=${r.end.heat.toFixed(5)} J, ${r.reason}`); }
// 預設狀態不觸發
{ const fresh = {}; const c = (id, t, d) => M[id].check({ type: t, data: d }, fresh[id] = fresh[id] || {});
  const dA = pass({ N: 100, a: 0.03, R: 10, v: 0.5 }); const pk = F.oscPeak({ N: 100, a: 0.03, R: 10, flipped: false }, 0.5);
  const cyc = { mode: 'A', N: 100, a: 0.03, R: 10, f: 0.5, flipped: false, epsPeak: pk, IPeak: pk / 10 };
  const defB = { B: 1, L: 0.5, R: 1, m: 0.2, v0: 1.5, F: 0.4 };
  const runs = ['const', 'force', 'release'].map(sub => rodRun(Object.assign({ sub }, defB)));
  const trig = list.filter(m => {
    if (c(m.id, 'passEnd', dA) || c(m.id, 'cycle', cyc)) return true;
    return runs.some(r => r.lives.some(e => c(m.id, 'liveB', e)) || c(m.id, 'rodEnd', r.end) || (r.half && c(m.id, 'rodHalf', r.half)));
  });
  res.push((trig.length ? 'FAIL 預設觸發: ' + trig.map(m => m.id) : 'OK  預設狀態（各模式）不觸發任何任務'));
}
console.log(res.join('\n'));
