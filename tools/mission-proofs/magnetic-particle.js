/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/magnetic-particle.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
// 以物理核心模擬頁面的 tick 邏輯（與 js/magnetic-particle.js 相同），把事件餵給任務檔的 check
const MC = require(__ROOT + 'js/magnetic-particle-core.js');
global.window = global;
let missions = [];
window.LabMission = { register: (id, list) => { missions = list.map(m => Object.assign({ mem: {} }, m)); } };
require(__ROOT + 'js/missions/magnetic-particle.js');
const W = 24, H = 16, CM = 0.01, MARGIN = 0.6, ZMAX = 48;
const BOUNDS = { x0: -MARGIN * CM, x1: (W + MARGIN) * CM, y0: -MARGIN * CM, y1: (H + MARGIN) * CM, z0: -ZMAX * CM, z1: ZMAX * CM };
const done = {};
function shoot(par, start, opt) {
  opt = opt || {};
  const fired = [];
  const fieldCfg = () => { const th = par.ang * Math.PI / 180, E = par.E * 1e3; return { Bz: par.B * 1e-3, Ex: -E * Math.sin(th), Ey: E * Math.cos(th), region: par.region ? { xMin: W / 2 * CM } : null }; };
  const th = par.ang * Math.PI / 180, c = MC.pitchComponents(par.v * 1e5, par.theta);
  const p = { x: start.x * CM, y: start.y * CM, z: 0, vx: c.perp * Math.cos(th), vy: c.perp * Math.sin(th), vz: c.par, q: par.q * MC.E_CHARGE, m: par.m * MC.AMU, t: 0, turn: 0, tField: 0 };
  const trail = [[p.x, p.y, 0]];
  const run = { cycles: 0, entered: false, entryY: 0, entryTurn: 0, passed: false, maxDev: 0 };
  const base = () => { const h = MC.helix(par.m * MC.AMU, par.q * MC.E_CHARGE, par.v * 1e5, par.B * 1e-3, par.theta);
    return { q: par.q, m: par.m, v: par.v, B: par.B, E: par.E, theta: par.theta, ang: par.ang, region: par.region, x0: start.x, y0: start.y, r: h.r / CM, Tus: h.T * 1e6, pitch: h.pitch / CM, vd: par.B !== 0 ? Math.abs(par.E * 1e3 / (par.B * 1e-3)) : null }; };
  const emit = (type, extra) => { const data = Object.assign(base(), extra); fired.push([type, data]);
    missions.forEach(m => { if (done[m.id]) return; let ok = false; try { ok = !!m.check({ type, data }, m.mem); } catch (e) { console.log('ERR', m.id, e); } if (ok) { done[m.id] = true; console.log('   ✔', m.id, 'L' + m.level, type, JSON.stringify(extra, (k, v) => typeof v === 'number' ? +v.toPrecision(5) : v)); } }); };
  const cyc = () => (par.region || par.q === 0 || par.B === 0) ? Infinity : MC.period(par.m * MC.AMU, par.q * MC.E_CHARGE, par.B * 1e-3);
  const offsets = (x, y) => { const dx = x / CM - start.x, dy = y / CM - start.y; return { dx, dy, along: dx * Math.cos(th) + dy * Math.sin(th), dev: Math.abs(-dx * Math.sin(th) + dy * Math.cos(th)) }; };
  const frame = (opt.speed || 0.5) * 1e-6 / 60; // 60 fps
  for (let k = 0; k < (opt.frames || 20000); k++) {
    const f0 = fieldCfg(); const rev0 = Math.floor(Math.abs(p.turn) / (2 * Math.PI)); const in0 = MC.inField(f0, p.x);
    const turn0 = p.turn, t0 = p.t, z0 = p.z, x0 = p.x, y0 = p.y, vx0 = p.vx, vy0 = p.vy, tf0 = p.tField, trail0 = trail.length;
    const o = { bounds: BOUNDS, maxStep: 1e-4, maxAngle: 0.01, trail, trailSpacing: 1e-4 };
    const Tc = cyc(); let remain = frame, stop = null;
    while (remain > 0 && !stop) { const tb = (run.cycles + 1) * Tc - p.t;
      if (tb <= remain) { stop = MC.advance(p, f0, Math.max(tb, 0), o); remain -= Math.max(tb, 0); if (!stop) { run.cycles++; const q = offsets(p.x, p.y), d = Math.hypot(q.dx, q.dy); emit('cycle', { n: run.cycles, t: p.t * 1e6, dx: q.dx, dy: q.dy, disp: d, vavg: d * CM / p.t }); } }
      else { stop = MC.advance(p, f0, remain, o); remain = 0; } }
    for (let i = Math.max(trail0 - 1, 0); i < trail.length; i++) { const q = offsets(trail[i][0], trail[i][1]); if (q.dev > run.maxDev) run.maxDev = q.dev; }
    const rev1 = Math.floor(Math.abs(p.turn) / (2 * Math.PI));
    for (let n = rev0 + 1; n <= rev1; n++) { const a = Math.abs(turn0), b = Math.abs(p.turn), w = b > a ? (2 * Math.PI * n - a) / (b - a) : 1;
      emit('lap', { n, dir: p.turn > 0 ? 1 : -1, tLap: (t0 + w * (p.t - t0)) * 1e6, zLap: (z0 + w * (p.z - z0)) / CM }); }
    if (par.region) { const xb = W / 2 * CM, in1 = MC.inField(f0, p.x);
      if (!in0 && (in1 || p.tField > tf0) && !run.entered && Math.abs(vx0) > 0) { run.entered = true; run.entryY = (y0 + vy0 * (xb - x0) / vx0) / CM; run.entryTurn = turn0; }
      if (run.entered && !run.passed && !in1 && Math.abs(p.vx) > 0) { run.passed = true; emit('region', { entryY: run.entryY, exitY: (p.y - p.vy * (p.x - xb) / p.vx) / CM, turnDeg: (p.turn - run.entryTurn) * 180 / Math.PI, tField: p.tField * 1e6 }); } }
    if (stop) { const q = offsets(p.x, p.y); emit('exit', { axis: stop.axis, t: p.t * 1e6, along: q.along, maxDev: run.maxDev, disp: Math.hypot(q.dx, q.dy), z: p.z / CM, turnDeg: p.turn * 180 / Math.PI }); break; }
    if (opt.untilLaps && rev1 >= opt.untilLaps) break;
    if (opt.untilCycles && run.cycles >= opt.untilCycles) break;
  }
  return fired;
}
const D = { B: 100, q: 2, m: 4, v: 3, theta: 90, ang: 0, E: 0, region: false };
const P = o => Object.assign({}, D, o);
const startForCenter = (par, cx, cy) => { const th = par.ang * Math.PI / 180, c = MC.pitchComponents(par.v * 1e5, par.theta); const vx = c.perp * Math.cos(th), vy = c.perp * Math.sin(th); const k = par.m * MC.AMU / (par.q * MC.E_CHARGE * par.B * 1e-3) / CM; return { x: cx - k * vy, y: cy + k * vx }; };
const S0 = startForCenter(D, 12, 8); // 預設出發點（等速圓周運動情境）
module.exports = { shoot, P, S0, done, missions };
if (require.main === module) {
  console.log('--- 預設狀態與五個情境（不應完成 L1 以外的任務）');
  shoot(P({}), S0, { untilLaps: 3 });
  shoot(P({ theta: 60 }), S0, { untilLaps: 3 });
  shoot(P({ B: -100, v: 2, region: true }), { x: 2, y: 3.5 });
  shoot(P({ E: 30 }), { x: 1.5, y: 8 });
  shoot(P({ B: 200, v: 0, E: 20 }), { x: 1.5, y: 7 });
  console.log('    (done so far:', Object.keys(done).join(', ') + ')');
  console.log('--- 解法');
  shoot(P({ q: -2 }), { x: 12, y: 2 }, { untilLaps: 1 });                                    // 2 逆時針
  shoot(P({ v: 2.4 }), S0, { untilLaps: 1 });                                   // 3 半徑 4.977 cm
  shoot(P({ v: 1 }), S0, { untilLaps: 1 }); shoot(P({ v: 2 }), S0, { untilLaps: 1 }); // 4
  shoot(P({ v: 4, E: 40 }), { x: 1.5, y: 8 });                                 // 5 速度選擇器
  shoot(P({ q: 3, m: 2, B: 145 }), S0, { untilLaps: 10 });                      // 6 十圈 2.994 μs
  shoot(P({ v: 2, region: true, ang: -45 }), { x: 6, y: 15 });         // 7 轉直角
  shoot(P({ q: 3, m: 1, B: 200, v: 0, E: 60 }), { x: 1.5, y: 7 }, { untilCycles: 3 }); // 8 漂移
  shoot(P({ B: -100, v: 2, region: true, m: 4 }), { x: 2, y: 3.5 }); shoot(P({ B: -100, v: 2, region: true, m: 5.93 }), { x: 2, y: 3.5 }); // 9
  shoot(P({ B: -100, v: 2, region: true, q: 1, m: 2 }), { x: 2, y: 3.5 });     // 10（與上面 q=2、m=4 那發比較）
  shoot(P({ v: 1.23, theta: 51.5 }), S0, { untilLaps: 1 });                     // 11 螺旋
  shoot(P({ q: 3, m: 1, B: 200, v: 0, E: 73.5 }), { x: 1.5, y: 7 }, { untilCycles: 3 }); // 12 擺線
  shoot(P({ q: 0 }), S0);                                                       // h1
  shoot(P({ theta: 0 }), S0);                                                   // h2
  shoot(P({ B: 200, v: 0, E: 20, q: -2 }), { x: 1.5, y: 7 }, { untilCycles: 2 }); // h3（與情境 drift 那發比較）
  const miss = missions.filter(m => !done[m.id]).map(m => m.id);
  console.log(miss.length ? 'NOT DONE: ' + miss.join(', ') : 'ALL ' + missions.length + ' missions achieved');
}
