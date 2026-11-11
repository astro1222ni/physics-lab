/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/incline-friction.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
// 用物理核心證明每個任務都做得到（事件格式模仿 js/incline-friction.js）
'use strict';
const ROOT = __ROOT + '';
const IC = require(ROOT + 'js/incline-friction-core.js');
const missions = [];
global.window = { InclineCore: IC, LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/incline-friction.js');
const byId = id => missions.find(m => m.id === 'incline-friction-' + id);
const D2R = Math.PI / 180, XMAX = 1.7, GATES = [0.5, 1.5], OPT = { xMin: -0.2, xMax: XMAX, gates: GATES };
const SURF = Object.fromEntries(IC.SURFACES.map(s => [s.id, s]));
const R2 = x => Math.round(x * 100) / 100;

function mk(cfg) { // cfg: theta(deg), m, surf | mus,muk, F, mode, start, v0
  const u = cfg.mus != null ? { mus: cfg.mus, muk: cfg.muk } : SURF[cfg.surf || 'wood'];
  return Object.assign({ theta: 20, m: 2, F: 0, mode: 'along', start: 'top', v0: 0, surf: cfg.surf || 'wood' }, cfg, { mus: u.mus, muk: u.muk });
}
function P(c) { return { m: c.m, theta: c.theta * D2R, mus: c.mus, muk: c.muk, F: c.F, mode: c.mode }; }
function snap(c, s, contact, extra) {
  const p = P(c), fo = IC.forcesAt(p, s.v, contact), th = IC.thresholds(p);
  return Object.assign({ surf: c.surf, theta: c.theta, thetaC: Math.atan(c.mus) / D2R, m: c.m, mus: c.mus, muk: c.muk, mode: c.mode, F: c.F,
    x: s.x, v: s.v, t: s.t, a: fo.a, f: fo.f, N: fo.N, D: fo.D, fsMax: fo.fsMax, fk: fo.fk, P: fo.P, kind: fo.kind,
    freeHold: Math.abs(fo.D) <= fo.fsMax * (1 + 1e-12) + 1e-12, moving: s.v !== 0, upStart: th.upStart, hold: th.hold, upConst: th.upConst,
    downConst: th.downConst, selfLock: th.selfLock, heat: -s.wf, start: c.start }, extra || {});
}
/** 放手後跑 T 秒，傳回所有事件（同頁面的整理方式） */
function run(c, T, cause0) {
  const sp = c.start === 'top' ? { x: 0, contact: 0 } : { x: XMAX, contact: 1 };
  let s = IC.newState(sp.x, c.v0, sp.contact);
  const evs = [];
  const rel = snap(c, s, s.contact, { v0: c.v0 }); rel.holds = c.v0 === 0 && rel.freeHold;
  evs.push({ type: 'release', data: rel });
  if (c.v0 !== 0) evs.push({ type: 'motion', data: snap(c, s, s.contact, { reason: 'release' }) });
  const runI = { turns: 0, hitTop: false, gates: [[], []], slipT: c.v0 !== 0 ? 0 : null };
  const n = Math.ceil(T * 60);
  for (let i = 0; i < n; i++) {
    const r = IC.step(P(c), s, 1 / 60, OPT); s = r.s;
    r.ev.forEach(e => {
      if (e.type === 'slip') { if (runI.slipT == null) runI.slipT = e.t; evs.push({ type: 'slip', data: snap(c, s, s.contact, { cause: cause0 || 'release', dir: e.dir }) }); evs.push({ type: 'motion', data: snap(c, s, s.contact, { reason: 'slip' }) }); }
      if (e.type === 'stick') evs.push({ type: 'stick', data: snap(c, s, s.contact, { x: e.x }) });
      if (e.type === 'turn') { runI.turns++; evs.push({ type: 'turn', data: snap(c, s, s.contact, { x: e.x }) }); evs.push({ type: 'motion', data: snap(c, s, s.contact, { reason: 'turn' }) }); }
      if (e.type === 'hit') { evs.push({ type: 'hit', data: snap(c, s, s.contact, { end: e.end > 0 ? 'bottom' : 'top', speed: Math.abs(e.v), tRun: e.t, v0: c.v0, turned: runI.turns > 0, hitTopBefore: runI.hitTop, sameEpoch: true }) }); if (e.end < 0) runI.hitTop = true; }
      if (e.type === 'gate') {
        runI.gates[e.i].push({ t: e.t, v: e.v, turns: runI.turns });
        const j = 1 - e.i, me = runI.gates[e.i].slice(-1)[0], o = runI.gates[j].slice(-1)[0];
        if (o && o.turns === me.turns && o.t < me.t && (o.v > 0) === (me.v > 0)) {
          const g1 = e.i === 0 ? me : o, g2 = e.i === 0 ? o : me;
          const clean = c.start === 'top' && c.v0 === 0 && runI.slipT === 0 && me.v > 0;
          evs.push({ type: 'gates', data: snap(c, s, s.contact, { t1: g1.t, t2: g2.t, v1: g1.v, v2: g2.v, dir: me.v > 0 ? 1 : -1, sameEpoch: true, clean, aGate: clean ? IC.accelFromGates(0.5, g1.t, 1.5, g2.t) : null }) });
        }
      }
    });
  }
  return { evs, s };
}
let fail = 0;
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  const ok = events.some(e => m.check(e, m.mem));
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}
// 預設狀態：放手後 3 s（θ = 20°、木頭、F = 0），以及放手前的 params/rest
{
  const c = mk({}); const r = run(c, 3);
  const extra = [{ type: 'params', data: snap(c, IC.newState(0, 0, 0), 2) }, { type: 'rest', data: snap(c, r.s, r.s.contact) }];
  const hit = missions.filter(m => { m.mem = {}; return r.evs.concat(extra).some(e => m.check(e, m.mem)); });
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.map(m => m.id)); } else console.log('  ✓ 預設狀態（放手、靜止）不觸發任何任務；事件：' + r.evs.map(e => e.type).join(','));
}
// 1 溜下去
expect(1, run(mk({ theta: 35 }), 3).evs, true, '木頭 θ = 35°，放手 → 撞到底端');
// 2 經典摩擦力圖：θ = 0，慢慢加力（每 2 ms 加 4.9 N/s × 0.002 s）
{
  const c = mk({ theta: 0 }); let s = IC.newState(0, 0, 0), slipF = null;
  for (let i = 0; i < 5000 && slipF == null; i++) { c.F += 4.9 * 0.002; const r = IC.step(P(c), s, 0.002, OPT); s = r.s; if (r.ev.some(e => e.type === 'slip')) slipF = c.F; }
  // θ = 0 時推力往「上坡」方向（左）；起點上方有 0.2 m 空間，從底端開始也可以
  const c2 = mk({ theta: 0, start: 'bottom' }); let s2 = IC.newState(XMAX, 0, 1), slipF2 = null;
  for (let i = 0; i < 5000 && slipF2 == null; i++) { c2.F += 4.9 * 0.002; const r = IC.step(P(c2), s2, 0.002, OPT); s2 = r.s; if (r.ev.some(e => e.type === 'slip')) slipF2 = c2.F; }
  console.log('      θ = 0、起點頂端：' + (slipF == null ? '不會滑' : 'F = ' + slipF.toFixed(3)) + '；起點底端：F = ' + slipF2.toFixed(3) + ' N（μs mg = ' + (0.5 * 2 * 9.8).toFixed(3) + '）');
  expect(2, [{ type: 'slip', data: snap(c, s, 0, { cause: 'ramp', dir: -1 }) }], true, 'θ = 0、預設起點（頂端）、慢慢加力 → 在 F ≈ μs mg 開始滑');
}
// 3 臨界角：每 2 ms 抬高 0.004°
{
  for (const surf of ['wood', 'steel', 'ice']) {
    const c = mk({ theta: 5, surf }); let s = IC.newState(0, 0, 0), th = null;
    for (let i = 0; i < 100000 && th == null; i++) { c.theta += 2 * 0.002; const r = IC.step(P(c), s, 0.002, OPT); s = r.s; if (r.ev.some(e => e.type === 'slip')) th = c.theta; }
    expect(3, [{ type: 'slip', data: snap(c, s, 0, { cause: 'raise', dir: 1 }) }], true, surf + '：慢慢抬高，在 θ = ' + th.toFixed(3) + '° 滑動（θc = ' + (Math.atan(c.mus) / D2R).toFixed(3) + '°）');
  }
  const c = mk({ theta: 27.2 });
  expect(3, [{ type: 'slip', data: snap(c, IC.newState(0, 0.01, 0), 0, { cause: 'tilt', dir: 1 }) }], false, '用手一次拉到 27.2°（差 0.63°）');
}
// 4 輕輕撐住：木頭 θ = 40°（θc + 13.4°），F = hold 取到小數第 2 位（無條件進位）
{
  const c0 = mk({ theta: 40 }); const hold = IC.thresholds(P(c0)).hold; const F = Math.ceil(hold * 100) / 100;
  expect(4, run(mk({ theta: 40, F }), 1).evs, true, '木頭 θ = 40°：hold = ' + hold.toFixed(4) + ' N，輸入 F = ' + F.toFixed(2) + '（+' + ((F / hold - 1) * 100).toFixed(2) + '%）→ 放手後靜止');
  expect(4, run(mk({ theta: 40, F: R2(hold * 1.05) }), 1).evs, false, 'F = ' + R2(hold * 1.05) + '（多 5%）');
  const F2 = Math.floor(hold * 100) / 100;
  expect(4, run(mk({ theta: 40, F: F2 }), 1).evs, false, 'F = ' + F2.toFixed(2) + '（不夠，木塊滑下去）');
}
// 5 等速下滑：tan θ = μk，θ 輸入到 0.01°，v0 = 1.00 m/s
{
  const th = R2(Math.atan(0.3) / D2R);
  const r = run(mk({ theta: th, v0: 1 }), 3);
  const g = r.evs.find(e => e.type === 'gates');
  expect(5, r.evs, true, '木頭 θ = ' + th + '°（arctan 0.3 = ' + (Math.atan(0.3) / D2R).toFixed(4) + '°）、v0 = 1.00：v1 = ' + g.data.v1.toFixed(4) + '、v2 = ' + g.data.v2.toFixed(4));
  const th2 = 16.7; const r2 = run(mk({ theta: th2, v0: 1 }), 3); const g2 = r2.evs.find(e => e.type === 'gates');
  expect(5, r2.evs, true, '只用滑桿 θ = 16.7°：v1 = ' + g2.data.v1.toFixed(4) + '、v2 = ' + g2.data.v2.toFixed(4));
  const r3 = run(mk({ theta: 18, v0: 1 }), 3); const g3 = r3.evs.find(e => e.type === 'gates');
  expect(5, r3.evs, false, 'θ = 18°：v1 = ' + g3.data.v1.toFixed(3) + '、v2 = ' + g3.data.v2.toFixed(3));
  expect(5, run(mk({ theta: th }), 3).evs, false, '同角度但 v0 = 0：μs > μk，木塊不會自己動');
}
// 6 最小推力：預設 θ = 20°、木頭，F 每次 +0.01（打字）到超過門檻
{
  const c = mk({ theta: 20, start: 'bottom' }); const up = IC.thresholds(P(c)).upStart; const F = Math.floor(up * 100) / 100 + 0.01;
  const s0 = IC.newState(XMAX, 0, 1);
  const before = IC.step(P(Object.assign({}, c, { F: F - 0.01 })), s0, 0.1, OPT);
  const after = IC.step(P(Object.assign({}, c, { F })), s0, 0.1, OPT);
  const ev = { type: 'slip', data: snap(Object.assign({}, c, { F }), after.s, 0, { cause: 'force', dir: -1 }) };
  expect(6, [ev], before.ev.length === 0 && after.ev.some(e => e.type === 'slip'), '木頭 θ = 20°：upStart = ' + up.toFixed(4) + ' N；F = ' + (F - 0.01).toFixed(2) + ' 不動，F = ' + F.toFixed(2) + ' 開始往上滑');
  const evB = { type: 'slip', data: snap(Object.assign({}, c, { F: R2(up + 0.2) }), after.s, 0, { cause: 'force', dir: -1 }) };
  expect(6, [evB], false, '一次加到 F = ' + R2(up + 0.2));
  const evR = { type: 'slip', data: snap(Object.assign({}, c, { F }), after.s, 0, { cause: 'ramp', dir: -1 }) };
  expect(6, [evR], false, '用「慢慢加力」不算');
}
// 7 加速度 1 m/s²：(a) 木頭 θ = 20°，從底端以 v0 = −1 射出，F = forceForAccel；(b) 冰：從靜止就推得動
{
  const c = mk({ theta: 20, start: 'bottom', v0: -1 }); const F = R2(IC.forceForAccel(P(c), -1, -1));
  const r = run(Object.assign(c, { F }), 0.5); const m = r.evs.find(e => e.type === 'motion');
  expect(7, r.evs, true, '木頭 θ = 20°、底端 v0 = −1.00、F = ' + F + ' N（m(1 + g sinθ + μk g cosθ) = ' + IC.forceForAccel(P(c), -1, -1).toFixed(4) + '）→ a = ' + m.data.a.toFixed(4));
  const c0 = mk({ theta: 20, start: 'bottom', F }); expect(7, run(c0, 0.5).evs, false, '同樣的 F 但 v0 = 0：推不動（upStart = ' + IC.thresholds(P(c0)).upStart.toFixed(2) + ' N）');
  const ci = mk({ theta: 20, start: 'bottom', surf: 'ice' }); const Fi = R2(IC.forceForAccel(P(ci), -1, -1));
  const ri = run(Object.assign(ci, { F: Fi }), 0.5);
  expect(7, ri.evs, true, '冰 θ = 20°、從靜止：F = ' + Fi + ' N > upStart = ' + IC.thresholds(P(ci)).upStart.toFixed(2) + ' → a = ' + ri.evs.find(e => e.type === 'motion').data.a.toFixed(4));
}
// 8、10 神秘表面：用臨界角量 μs、用光電門量 μk（只用畫面上看得到的數字）
{
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  let okS = 0, okK = 0, N = 40, worstS = 0, worstK = 0;
  for (let k = 0; k < N; k++) {
    const ms = IC.mysterySurface(rnd);
    // μs：慢慢抬高，讀滑動角（畫面顯示到 0.01°）
    const c = mk({ theta: 5, mus: ms.mus, muk: ms.muk, surf: 'mystery' }); let s = IC.newState(0, 0, 0), th = null;
    for (let i = 0; i < 100000 && th == null; i++) { c.theta += 0.004; const r = IC.step(P(c), s, 0.002, OPT); s = r.s; if (r.ev.some(e => e.type === 'slip')) th = c.theta; }
    const gs = Math.round(Math.tan(R2(th) * D2R) * 1000) / 1000;
    // μk：在 θc + 8° 靜止釋放，讀 t1、t2（顯示到 0.001 s）
    const thr = R2(th + 8);
    const r = run(mk({ theta: thr, mus: ms.mus, muk: ms.muk, surf: 'mystery' }), 4);
    const g = r.evs.find(e => e.type === 'gates');
    const t1 = Math.round(g.data.t1 * 1000) / 1000, t2 = Math.round(g.data.t2 * 1000) / 1000;
    const a = 2 * 1 / (t2 * t2 - t1 * t1), gk = Math.round(IC.mukFromAccel(thr * D2R, a) * 1000) / 1000;
    const eS = Math.abs(gs - ms.mus) / ms.mus, eK = Math.abs(gk - ms.muk) / ms.muk;
    worstS = Math.max(worstS, eS); worstK = Math.max(worstK, eK);
    if (byId(8).check({ type: 'guess', data: { errS: eS } })) okS++;
    if (byId(10).check({ type: 'guess', data: { errK: eK } })) okK++;
  }
  console.log((okS === N ? '  ✓ ' : '  ✗ ') + '8   達成：' + N + ' 個隨機神秘表面，tan(滑動角) 全部在 2% 內（最大誤差 ' + (worstS * 100).toFixed(3) + '%）');
  console.log((okK === N ? '  ✓ ' : '  ✗ ') + '10  達成：' + N + ' 個隨機神秘表面，光電門 t1、t2 讀到 0.001 s 算出的 μk 全部在 2% 內（最大誤差 ' + (worstK * 100).toFixed(3) + '%）');
  if (okS !== N || okK !== N) fail++;
}
// 9 停在光電門 2：θ = 10°、木頭，頂端以 v0 往下射出
{
  const dec = 9.8 * (0.3 * Math.cos(10 * D2R) - Math.sin(10 * D2R));
  const v0 = R2(Math.sqrt(2 * dec * 1.5));
  const r = run(mk({ theta: 10, v0 }), 4); const st = r.evs.find(e => e.type === 'stick');
  expect(9, r.evs, true, '木頭 θ = 10°、v0 = ' + v0 + ' m/s（√(2·' + dec.toFixed(4) + '·1.5) = ' + Math.sqrt(2 * dec * 1.5).toFixed(4) + '）→ 停在 x = ' + st.data.x.toFixed(4));
  expect(9, run(mk({ theta: 10, v0: 1.95 }), 4).evs, false, 'v0 = 1.95 → x = ' + (1.95 * 1.95 / 2 / dec).toFixed(3));
}
// 11 水平推等速上滑：木頭 θ = 20°，底端 v0 = −1.5，F = upConst
{
  const c = mk({ theta: 20, mode: 'horiz', start: 'bottom', v0: -1.5 }); const F = R2(IC.thresholds(P(c)).upConst);
  const r = run(Object.assign(c, { F }), 2); const g = r.evs.find(e => e.type === 'gates');
  expect(11, r.evs, true, '木頭 θ = 20°、水平 F = ' + F + ' N（mg(sinθ + μk cosθ)/(cosθ − μk sinθ) = ' + IC.thresholds(P(c)).upConst.toFixed(4) + '）、v0 = −1.50：v2 = ' + g.data.v2.toFixed(4) + '、v1 = ' + g.data.v1.toFixed(4));
  const c2 = mk({ theta: 20, mode: 'along', start: 'bottom', v0: -1.5 }); const F2 = R2(IC.thresholds(P(c2)).upConst);
  expect(11, run(Object.assign(c2, { F: F2 }), 2).evs, false, '沿斜面推等速上滑不算（F = ' + F2 + '）');
}
// 12 來回 1.50 s：木頭 θ = 35°，底端射出
{
  const th = 35, c = mk({ theta: th, start: 'bottom' });
  const aU = 9.8 * (Math.sin(th * D2R) + 0.3 * Math.cos(th * D2R)), aD = 9.8 * (Math.sin(th * D2R) - 0.3 * Math.cos(th * D2R));
  const v = 1.5 / (1 / aU + 1 / Math.sqrt(aU * aD)); const v0 = -R2(v);
  const r = run(Object.assign(c, { v0 }), 3); const h = r.evs.find(e => e.type === 'hit');
  expect(12, r.evs, true, '木頭 θ = 35°、底端 v0 = ' + v0 + '（理論 ' + (-v).toFixed(4) + '）：上滑 ' + (v * v / 2 / aU).toFixed(3) + ' m，回到底端 t = ' + h.data.tRun.toFixed(4) + ' s');
  const c3 = mk({ theta: 45, surf: 'steel', start: 'bottom' });
  const aU3 = 9.8 * (Math.sin(45 * D2R) + 0.57 * Math.cos(45 * D2R)), aD3 = 9.8 * (Math.sin(45 * D2R) - 0.57 * Math.cos(45 * D2R));
  const v3 = -R2(1.5 / (1 / aU3 + 1 / Math.sqrt(aU3 * aD3)));
  const r3 = run(Object.assign(c3, { v0: v3 }), 3);
  expect(12, r3.evs, true, '鋼 θ = 45°（tan 45° = 1 > μs = 0.74）、v0 = ' + v3 + '（上滑 ' + (v3 * v3 / 2 / aU3).toFixed(3) + ' m）→ t = ' + r3.evs.find(e => e.type === 'hit').data.tRun.toFixed(4));
  expect(12, run(mk({ theta: 35, start: 'bottom', v0: -4.5 }), 3).evs, false, 'v0 = −4.50 → t = ' + run(mk({ theta: 35, start: 'bottom', v0: -4.5 }), 3).evs.find(e => e.type === 'hit').data.tRun.toFixed(3));
  expect(12, run(mk({ theta: 20, start: 'bottom', v0: -3 }), 3).evs, false, 'θ = 20° < θc：停住不回來');
}
// h1 牆上：θ = 90°、水平 F ≥ mg/μs
{
  const c = mk({ theta: 90, mode: 'horiz', F: 40 });
  expect('h1', run(c, 1).evs, true, '木頭 θ = 90°、水平 F = 40 N ≥ mg/μs = ' + (2 * 9.8 / 0.5).toFixed(1) + ' N → 放手後不掉');
  expect('h1', run(mk({ theta: 90, mode: 'horiz', F: 39 }), 1).evs, false, 'F = 39 N 掉下去');
}
// h2 自鎖：木頭 θ = 70°（> 63.43°）、水平 F = 60 N
{
  const c = mk({ theta: 70, mode: 'horiz', F: 60 });
  expect('h2', run(c, 1).evs, true, '木頭 θ = 70°（自鎖角 ' + (IC.lockAngle(0.5) / D2R).toFixed(2) + '°）、水平 F = 60 N：不動');
  expect('h2', run(mk({ theta: 60, mode: 'horiz', F: 60 }), 1).evs, false, 'θ = 60°（未自鎖），F = 60 N 會往上滑');
}
// h3 摩擦力為零：θ = 30°、m = 2、沿斜面 F = mg sin30° = 9.80 N
{
  expect('h3', run(mk({ theta: 30, F: 9.8 }), 1).evs, true, 'θ = 30°、m = 2、F = 9.80 N = mg sin θ → 靜摩擦力 0');
  expect('h3', run(mk({ theta: 30, F: 9.7 }), 1).evs, false, 'F = 9.70 N → f = −0.1 N');
  expect('h3', run(mk({ theta: 30, mode: 'horiz', F: R2(2 * 9.8 * Math.tan(30 * D2R)) }), 1).evs, true, '水平 F = mg tan θ = ' + R2(2 * 9.8 * Math.tan(30 * D2R)) + ' N 也行（f = ' + (R2(2 * 9.8 * Math.tan(30 * D2R)) * Math.cos(30 * D2R) - 9.8).toFixed(4) + '）');
}
console.log(fail ? '\n有 ' + fail + ' 項失敗' : '\n全部通過');
process.exitCode = fail ? 1 : 0;
