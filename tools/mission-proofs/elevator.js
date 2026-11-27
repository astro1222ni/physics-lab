/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/elevator.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
// 用物理核心證明每個任務在滑桿範圍與精度內做得到
const E = require(__ROOT + 'js/elevator-core.js');
const g = E.G, h = E.BALL_H;
const out = (id, ok, msg) => {
  console.log((ok ? 'OK  ' : 'NO  ') + id.padEnd(13) + msg);
  if (!ok) process.exitCode = 1;
};

// 1
out('elevator-1', true, '任一趟（例：1F→2F，2√3 = ' + (2 * Math.sqrt(3)).toFixed(3) + ' s）');
// 2：10F、預設 vt = 5、ab = 4.9
{ const y = E.predictStop(27, 0, 5, 4.9); out('elevator-2', y >= 0 && E.reading(60, -g) === 0, `10F 剪斷（預設）：自由落體讀數 0，停在 y = ${y.toFixed(3)} m`); }
// 3：1F→10F 預設，減速段 v > 0、a = −1
{ const tr = E.tripProfile(0, 27, 1, 2.5, 0); const d = tr.find(s => s.kind === 'dec'); const r = E.reading(60, d.a);
  out('elevator-3', d.v0 > 0 && r < 60, `上行減速段：v 由 ${d.v0} 降到 0，讀數 ${r.toFixed(2)} kgw，持續 ${(d.t1 - d.t0).toFixed(2)} s 可按暫停`); }
// 4
{ const r = E.reading(60, 1.96); out('elevator-4', Math.abs(r - 72) <= 0.05, `A = 1.96（打字）→ ${r.toFixed(4)} kgw；或 ab… 最小 2.0 不行（${E.reading(60, 2).toFixed(2)}）`); }
// 5
{ const k = E.springExtension(E.springTension(1, 7.84)) / E.springExtension(E.springTension(1, 0)); out('elevator-5', Math.abs(k - 1.8) <= 0.009, `ab = 7.84（打字）→ 伸長量比 ${k.toFixed(5)}（行程最大 A = 3 只到 ${(1 + 3 / g).toFixed(3)}）`); }
// 6
{ const up = E.tripProfile(0, 9, 0.98, 2.5, 0)[0], dn = E.tripProfile(9, 0, 0.98, 2.5, 0).find(s => s.kind === 'dec');
  out('elevator-6', Math.abs(E.reading(60, up.a) - 66) < 0.1 && Math.abs(E.reading(60, dn.a) - 66) < 0.1 && dn.v0 < 0,
    `A = 0.98：上行加速 ${E.reading(60, up.a).toFixed(3)}、下行減速 ${E.reading(60, dn.a).toFixed(3)} kgw（A 在 0.97–0.99 都可以）`); }
// 7：神秘電梯，讀數顯示到 0.1 kgw，m 30–100 kg
{ let worst = 0;
  for (let m = 30; m <= 100; m++) for (let A = 0.5; A <= 2.5001; A += 0.01) {
    const shown = Math.round(E.reading(m, A) * 10) / 10, est = g * (shown / m - 1);
    worst = Math.max(worst, Math.abs(est - A));
  }
  out('elevator-7', worst <= 0.02, `由顯示的讀數（0.1 kgw）推算：最大誤差 ${worst.toFixed(4)} m/s²（m = 30 kg 時最大），容許 0.02`); }
// 8：A = 2.30，V = 6，1F→10F 的加速段中放開
{ const tr = E.tripProfile(0, 27, 2.3, 6, 0); const s = E.stateAt(tr, 0.5);
  const tl = E.ballLanding(tr, { tr: 0.5, yb: s.y + h, vb: s.v }, 0.5); const ratio = (tl - 0.5) / E.fallTime(h, 0);
  out('elevator-8', Math.abs(ratio - 0.9) <= 0.0045 && tl < tr[0].t1, `A = 2.3、V = 6：加速段 ${tr[0].t1.toFixed(2)} s 內放開，t/t0 = ${ratio.toFixed(5)}（可放開的時間窗 ${(tr[0].t1 - (tl - 0.5)).toFixed(2)} s）`); }
// 9：5F（y = 15）靜止剪斷
{ const sols = [[6.26, 4.9], [7.67, 9.8], [5.42, 2.94]].map(([vt, ab]) => { const y = E.predictStop(15, 0, vt, ab); return `vt ${vt}、ab ${ab} → 停在 ${y.toFixed(4)}（差 ${((y - 9) * 100).toFixed(2)} cm）`; });
  const ok = Math.abs(E.predictStop(15, 0, 6.26, 4.9) - 9) <= 0.03;
  out('elevator-9', ok, '5F 斷纜降到 3F：' + sols.join('；')); }
// 10
{ const tr = E.tripProfile(0, 27, 0.98, 6, 0); const T = tr[tr.length - 1].t0;
  const rs = tr.map(s => E.reading(60, s.a)); const lo = Math.min(...rs), hi = Math.max(...rs);
  let range = []; for (let A = 0.95; A <= 1.0001; A += 0.01) { const t = E.tripDuration(27, A, 6); const r1 = E.reading(60, A), r0 = E.reading(60, -A); if (t <= 10.6 && r1 <= 66 + 1e-6 && r0 >= 54 - 1e-6) range.push(A.toFixed(2)); }
  out('elevator-10', T <= 10.6 && hi <= 66 + 1e-6 && lo >= 54 - 1e-6, `A = 0.98、V = 6：T = ${T.toFixed(3)} s，讀數 ${lo.toFixed(2)}–${hi.toFixed(2)}；可行的 A：${range.join(', ')}（V ≥ √(27A) ≈ 5.1）`); }
// 11：手動駕駛 1F → 6F：V = 0.5、A = 3，按住 ▲ 到 V，等速，在 y = 15 − V²/(2A) 按 ▼
{ const A = 3, V = 0.5;
  let tr = E.manualPlan(0, 0, 0, 1, A, V); const s1 = E.stateAt(tr, 1); tr = E.manualPlan(1, s1.y, s1.v, 0, A, V);
  const cr = tr[0]; const yPress = 15 - V * V / (2 * A); const tPress = cr.t0 + (yPress - cr.y0) / V;
  const res = [-0.06, 0, 0.06].map(dt => { const st = E.stateAt(tr, tPress + dt); const p = E.manualPlan(tPress + dt, st.y, st.v, -1, A, V); return p[p.length - 1].y0 - 15; });
  out('elevator-11', res.every(e => Math.abs(e) <= 0.03 + 1e-9) && !tr.slice(0, 1).some(s => s.kind === 'protect'),
    `V = 0.5、A = 3：在 y = ${yPress.toFixed(4)} m 按住 ▼，提早／延後 0.06 s 的停點誤差 ${res.map(e => (e * 100).toFixed(1) + ' cm').join('、')}（慢動作時真實時間容許 ±0.24 s）`); }
// 12：ab = 5.83、vt = 10，煞車段中放開
{ const tr = E.freeFallPlan(0, 27, 0, 10, 5.83); const tb = tr[1].t0 + 0.2; const s = E.stateAt(tr, tb);
  const tl = E.ballLanding(tr, { tr: tb, yb: s.y + h, vb: s.v }, tb);
  const okA = []; for (let ab = 5.7; ab <= 5.95; ab += 0.01) { const t = E.fallTime(h, ab); if (Math.abs(t - 0.4) <= 0.001) okA.push(ab.toFixed(2)); }
  out('elevator-12', Math.abs(tl - tb - 0.4) <= 0.001 && tl < tr[1].t1, `ab = 5.83、vt = 10：煞車段 ${(tr[1].t1 - tr[1].t0).toFixed(2)} s，放開後 t = ${(tl - tb).toFixed(5)} s；可行的 ab：${okA[0]}–${okA[okA.length - 1]}（10F 起始需停在 ${tr[2].y0.toFixed(2)} m ≥ 0）`); }
// h1：vt = 10、ab = 9.8 從 8F（21 m）剪斷，0.1 s 後放開小球
{ const tr = E.freeFallPlan(0, 21, 0, 10, 9.8); const s = E.stateAt(tr, 0.1);
  const ball = { tr: 0.1, yb: s.y + h, vb: s.v }; const tl = E.ballLanding(tr, ball, 0.1);
  const ft = Math.min(tl, tr[0].t1) - 0.1;
  out('elevator-h1', ft >= 0.3 && tr[2].y0 >= 0, `8F、vt = 10、ab = 9.8：剪斷後 0.1 s 放開，漂浮 ${ft.toFixed(3)} s，停在 ${tr[2].y0.toFixed(2)} m`); }
// h2
out('elevator-h2', Math.abs(E.reading(60, 9.8) / 60 - 2) < 1e-12, `ab = 9.8（最大值）：讀數 = 2 × 實重`);
// h3：1F→10F（預設）等速 2.5 m/s 時在 y = 10 m 剪斷
{ const y = E.predictStop(10, 2.5, 5, 4.9); out('elevator-h3', y >= 0, `上行 2.5 m/s 時於 y = 10 m 剪斷：先再上升 ${(2.5 * 2.5 / 2 / g).toFixed(3)} m，最後停在 ${y.toFixed(2)} m`); }

let tasks; global.LabMission = { register: (_, list) => { tasks = list; } }; global.window = { LabMission };
require(__ROOT + 'js/missions/elevator.js');
function verify(id, steps) { const m = tasks.find(x => x.id === 'elevator-' + id), mem = {}; if (!steps.some(([type, data]) => m.check({type, data}, mem))) throw Error(m.id); }
verify(1, [['trip', {from:1,to:2,d:3,mConst:true}]]);
verify(2, [['cut', {}], ['pause', {kind:'free', reading:E.reading(60,-g)}], ['brakeStop',{readMin:0}]]);
{ const plan = E.freeFallPlan(0, 21, 0, 10, 9.8);
  verify(2, [['cut', {}], ['brakeStop', { tFree: plan[1].t0, readMin: E.reading(60, -g) }]]);
}
verify('h2', [['phase', {m:60, weighingSet:true, reading:E.reading(60,g)}]]);
verify('h3', [['cut', {v0:2.5}]]);

const assert = require('node:assert/strict');
function hiddenHits(events) {
  return tasks.filter(m => {
    if (!m.hidden) return false;
    const mem = {};
    return events.some(event => m.check(event, mem));
  }).map(m => m.id);
}
function verifyHidden(name, events, wanted) {
  const got = hiddenHits(events);
  assert.deepEqual(got, wanted, name);
  console.log('✓', name, got);
}
function verifyLegacy(events) {
  const hits = hiddenHits(events).filter(id => !/-h[123]$/.test(id));
  assert.deepEqual(hits, [], '預設／既有任務範例誤觸新題');
}
const event = (type, data) => ({type, data});
function phases(plan, m, run) {
  return plan.filter(s => Number.isFinite(s.t1)).map(s => {
    const T = E.springTension(1, s.a);
    return event('phase', {kind:s.kind, run, a:s.a, m, ms:1, reading:E.reading(m,s.a),
      N:E.normalForce(m,s.a), T, ext:E.springExtension(T), ext0:E.springExtension(E.springTension(1,0)),
      ratio:1+s.a/g, dir:Math.sign(E.segAt(s,(s.t0+s.t1)/2).v), v:s.v0, y:s.y0, weighingSet:true});
  });
}
function ballEvent(plan, time) {
  const s = E.stateAt(plan,time);
  const tLand = E.ballLanding(plan,{tr:time, yb:s.y+h, vb:s.v},time);
  assert.ok(tLand > time);
  const t = tLand - time, active = plan.filter(seg => seg.t1 > time && seg.t0 < tLand);
  const aConst = active.every(seg => seg.a === active[0].a);
  const floatTime = active.filter(seg => seg.a === -g).reduce((sum,seg) =>
    sum + Math.min(tLand,seg.t1) - Math.max(time,seg.t0), 0);
  return event('ball', {h,t,t0:E.fallTime(h,0),ratio:t/E.fallTime(h,0),aConst,
    a:aConst ? active[0].a : null,gEff:2*h/t**2,floatTime});
}
function trip({from=1,to=10,A=1,V=2.5,m=60,balls=[]}) {
  const y0 = E.floorY(from), y1 = E.floorY(to), d = Math.abs(y1-y0);
  const plan = E.tripProfile(y0,y1,A,V,0), evs = phases(plan,m,'trip');
  for (const kind of balls) {
    const start = plan.find(s => s.kind === kind).t0;
    evs.push(ballEvent(plan,start+0.2));
  }
  const readings = evs.filter(e => e.type === 'phase').map(e => e.data.reading);
  evs.push(event('trip',{from,to,y0,y1,d,A,V,m,mConst:true,mystery:false,
    peakV:E.tripPeakSpeed(d,A,V),duration:plan.at(-1).t0,readMin:Math.min(...readings),readMax:Math.max(...readings)}));
  return evs;
}
function cut({from=10,vt=5,ab=4.9,y=E.floorY(from),v0=0,ballAt=null}) {
  const plan = E.freeFallPlan(0,y,v0,vt,ab), last = plan.at(-1);
  assert.ok(last.y0 >= 0, '斷纜高度不足');
  const startFloor = v0 === 0 && Math.abs(E.floorOf(y).off) < 1e-6 ? E.floorOf(y).n : null;
  return [event('cut',{v0,y0:y}), ...phases(plan,60,'free'),
    ...(ballAt == null ? [] : [ballEvent(plan,ballAt)]),
    event('brakeStop',{v0,startFloor,y0:y,yStop:last.y0,drop:y-last.y0,vTrip:vt,ab,manual:false,
      tFree:plan.find(s=>s.kind==='free').t1,readMin:0,readMax:E.reading(60,ab)})];
}
// 既有 1–12、h1–h3 的操作，包括相同設定所經過的行程段與斷纜煞車。
const legacyTrips = [{to:2},{},{A:1.96},{to:4,A:0.98},{from:4,to:1,A:0.98},
  {A:2.3,V:6,balls:['acc']},{A:0.98,V:6}];
const legacyCuts = [{},{ab:7.84},{from:6,vt:6.26},{from:6,vt:7.67,ab:9.8},
  {from:6,vt:5.42,ab:2.94},{vt:10,ab:5.83,ballAt:10/g+0.2},
  {from:8,vt:10,ab:9.8,ballAt:0.1},{y:10,v0:2.5}];
const oldEvents = [...legacyTrips.flatMap(trip), ...legacyCuts.flatMap(cut)];
const manual = E.manualPlan(0,0,0,1,3,0.5);
const yPress = 15 - 0.5**2 / 6;
oldEvents.push(...phases(manual,60,'manual'), ...phases(E.manualPlan(0,yPress,0.5,-1,3,0.5),60,'manual'));
oldEvents.push(event('manualStop',{fromFloor:1,floor:6,off:0,protect:false}),
  event('guess',{aTrue:1.23,err:0}), event('pause',{v:2.5,reading:E.reading(60,-1),m:60}));
for (const m of tasks.filter(m => !m.hidden || /-h[123]$/.test(m.id))) {
  const mem = {};
  assert.ok(oldEvents.some(e => m.check(e,mem)), m.id + ' 既有成功例');
}
verifyLegacy(oldEvents);

const short = V => ({to:2,A:1,V});
const leg = (from,to,A,V,m=60,balls=[]) => ({from,to,A,V,m,balls});
const examples = [
  [trip,[short(2.2),leg(2,1,1,4.4)],leg(2,1,1,4.41)],
  [trip,[leg(1,3,1.5,3),leg(3,7,1.5,3)],leg(3,7,1.51,3)],
  [trip,[leg(1,5,1.96,2.5,44),leg(5,1,1.96,2.5,66)],leg(5,1,1.96,2.5,66.1)],
  [trip,[leg(1,5,0.75,4),leg(5,1,1,2)],leg(5,1,1.01,2)],
  [cut,[{vt:3},{vt:6}],{vt:6.01}],
  [trip,[leg(1,10,2,3,40),leg(10,1,2,2,90)],leg(10,1,2,2,90.2)],
  [trip,[leg(1,8,1.5,3,60,['acc']),leg(8,1,1.5,3,60,['acc'])],leg(8,1,1.51,3,60,['acc'])]
];
examples.forEach(([simulate, steps, miss], i) => {
  const id = 'elevator-h' + (i + 4);
  verifyHidden(id + ' ' + JSON.stringify(steps),steps.flatMap(simulate),[id]);
  verifyHidden(id + ' 近失 ' + JSON.stringify(miss),[...steps.slice(0,-1),miss].flatMap(simulate),[]);
});
