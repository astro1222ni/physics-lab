/* 任務可達成的證明腳本。用法：node tools/mission-proofs/energy-coaster.js
 * 用物理核心（js/energy-coaster-core.js）跑出事件，照 js/energy-coaster.js 的格式組成任務事件，
 * 證明每個任務都做得到（滑桿精度：x0 0.01 m、μ 0.001、g 0.01、R 0.05、yref 0.01），而且預設狀態不會觸發任務。
 * 修改物理核心或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(__ROOT + 'js/energy-coaster-core.js');
const missions = [];
global.window = { CoasterCore: C, LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(__ROOT + 'js/missions/energy-coaster.js');
const byId = id => missions.find(m => m.id === 'energy-coaster-' + id);
const r2 = x => Math.round(x * 100) / 100;
const r3 = x => Math.round(x * 1000) / 1000;

function makeDef(o) {
  const d = JSON.parse(JSON.stringify(C.PRESETS[o.preset]));
  if (o.R != null) d.loop.R = o.R;
  return d;
}
function sigOf(def) {
  return JSON.stringify({ p: def.pts.map(p => [r3(p[0]), r3(p[1])]), l: def.loop ? [def.loop.at, r3(def.loop.R)] : null });
}
/** 軌道樣條部分高度為 y 的 x（在 [a, b] 內單調），四捨五入到滑桿精度 0.01 */
function xForY(tr, y, a, b) {
  const ya = tr.heightAt(a);
  let lo = a, hi = b;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if ((tr.heightAt(m) - y) * (ya - y) > 0) lo = m; else hi = m; }
  return r2((lo + hi) / 2);
}

/** 跑一次，照 js/energy-coaster.js 的方式組成任務事件。o：{ preset, R, mode, g, mu, x0, v0, m, yref, tMax } */
function runEvents(o) {
  const def = makeDef(o), tr = C.buildTrack(def);
  const P = { g: o.g == null ? 9.8 : o.g, mu: o.mu || 0, mode: o.mode || 'rail', x0: o.x0 == null ? C.PRESETS[o.preset].start : o.x0, v0: o.v0 || 0 };
  const m = o.m == null ? 500 : o.m, yref = o.yref || 0;
  const r = C.run(tr, P, o.tMax || 120);
  const L = tr.loop, s = r.sim;
  const base = {
    preset: o.preset, edited: o.R != null && o.R !== (C.PRESETS[o.preset].loop || {}).R, mode: P.mode, m: m, g: P.g, mu: P.mu, yref: yref,
    x0: P.x0, v0: P.v0, R: L ? L.R : null, y0: s.start.y, yLow: tr.yLow, h0: s.start.y - tr.yLow,
    ya: L ? L.ya : null, xa: L ? L.xa : null, sig: sigOf(def), target: C.PRESETS[o.preset].target || null
  };
  let qi = 0, bottomV = -1, loopDone = 0;
  const En = (y, v, q) => { const K = 0.5 * m * v * v, U = m * P.g * (y - yref), Q = m * (q + qi); return { K: K, U: U, Q: Q, E: K + U + Q }; };
  const out = [];
  for (const ev of r.events) {
    let d = null;
    switch (ev.type) {
      case 'bottom': { const first = !(bottomV >= 0); if (first) bottomV = ev.v; d = Object.assign({ v: ev.v, t: ev.t, first: first }, En(ev.y, ev.v, ev.q)); break; }
      case 'loopTop': d = { v: ev.v, nmg: ev.nmg }; break;
      case 'loopDone': loopDone++; d = { v: ev.v, ntopMg: ev.ntopMg, nMinMg: ev.nMinMg, loops: loopDone }; break;
      case 'detach': case 'leave': d = { x: ev.x, y: ev.y, v: ev.v, inLoop: !!ev.inLoop, yRel: ev.inLoop ? ev.yRel : null, phi: ev.inLoop ? ev.phi : null }; break;
      case 'attach': qi += 0.5 * ev.vn * ev.vn; d = { x: ev.x, y: ev.y, vn: ev.vn, flight: ev.flight, inLoop: !!ev.inLoop, yRel: ev.inLoop ? ev.yRel : null }; break;
      case 'land': d = { x: ev.x, v: ev.v, flight: ev.flight, fromEnd: !!ev.fromEnd }; break;
      case 'crash': d = { x: ev.x, y: ev.y }; break;
      case 'out': d = { x: ev.x, y: ev.y, fromEnd: !!ev.fromEnd }; break;
      case 'stop': d = Object.assign({ x: ev.x, y: ev.y, slope: ev.slope, path: ev.path, hAboveLow: ev.y - tr.yLow, inLoop: !!ev.inLoop, phi: ev.inLoop ? ev.phi : null, loopDone: loopDone, bottomPassed: bottomV >= 0 }, En(ev.y, 0, s.q)); break;
    }
    if (d) out.push({ type: ev.type, data: Object.assign({}, base, d) });
  }
  return { events: out, raw: r.events, sim: s, tr: tr, base: base, P: P };
}
/** 跑到 t 秒時把位能零點移到 yTo（js/energy-coaster.js 的 refMoved） */
function refmoveEvent(o, t, yTo) {
  const def = makeDef(o), tr = C.buildTrack(def);
  const P = { g: o.g == null ? 9.8 : o.g, mu: o.mu || 0, mode: o.mode || 'rail', x0: o.x0 == null ? C.PRESETS[o.preset].start : o.x0, v0: o.v0 || 0 };
  const m = o.m == null ? 500 : o.m, from = o.yref || 0;
  const r = C.run(tr, P, t);
  const K = C.kinematics(tr, P, r.sim), E = C.energies(tr, P, r.sim, m, yTo);
  const base = runEvents(Object.assign({}, o, { tMax: 0.001 })).base;
  return {
    type: 'refmove', data: Object.assign({}, base, { yref: yTo, from: from, to: yTo, dRef: yTo - from, moving: (r.sim.phase === 'track' || r.sim.phase === 'air') && K.speed > 0.05, K: E.K, U: E.U, Q: E.Q, E: E.E }), speed: K.speed
  };
}

let fail = 0;
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { if (m.check(e, m.mem)) ok = true; });
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}
const ev = (r, type) => r.events.filter(e => e.type === type);

console.log('energy-coaster 任務證明');

// 預設狀態（U 形谷、軌道車、地球、μ = 0、x0 = 2.6、零點在地面）與自動播放：跑 120 s 的所有事件都不觸發任務
{
  const d = runEvents({ preset: 'valley' });
  const evs = d.events.concat([refmoveEvent({ preset: 'valley' }, 1.3, 0)]);
  missions.forEach(m => { m.mem = {}; if (evs.some(e => m.check(e, m.mem))) { fail++; console.log('  ✗ 預設狀態觸發了 ' + m.id); } });
  console.log('  ✓ 預設狀態與自動播放（' + d.events.length + ' 個事件，最低點 v = ' + ev(d, 'bottom')[0].data.v.toFixed(3) + ' m/s）不觸發任何任務');
}

// 1 繞一圈
expect(1, runEvents({ preset: 'loop' }).events, true, '按「圓形迴圈」（軌道車、x0 = 1.5）');
expect(1, runEvents({ preset: 'twin' }).events, false, '雙峰沒有迴圈');

// 2 零點隨你訂
expect(2, [refmoveEvent({ preset: 'valley' }, 1.0, 5)], true, '預設條件跑 1 s 時把零點由 0 移到 5 m');
expect(2, [refmoveEvent({ preset: 'valley' }, 1.0, 4.95)], false, '只移 4.95 m');
{
  const e = refmoveEvent({ preset: 'loop', mu: 0.06, x0: 1.6 }, 60, 6);
  expect(2, [e], false, '小車已經停住（v = ' + e.speed.toFixed(2) + '）時移動零點');
}

// 3 時速 54 公里：最低點 15.0 m/s
{
  const tr = C.buildTrack(C.PRESETS.valley), y = tr.yLow + 15 * 15 / (2 * 9.8);
  const x0 = xForY(tr, y, 2, 7);
  const d = runEvents({ preset: 'valley', x0: x0 });
  expect(3, d.events, true, 'U 形谷 x0 = ' + x0 + '（h0 = ' + d.base.h0.toFixed(3) + ' m）→ v = ' + ev(d, 'bottom')[0].data.v.toFixed(3) + ' m/s');
  const d2 = runEvents({ preset: 'valley', g: 10.87 });
  expect(3, d2.events, true, '或保持 x0 = 2.6、把 g 改成 10.87 → v = ' + ev(d2, 'bottom')[0].data.v.toFixed(3) + ' m/s');
  expect(3, runEvents({ preset: 'valley', x0: x0, mu: 0.001 }).events, false, '有摩擦 μ = 0.001 不算');
}

// 4 月球上跳得比較遠？
{
  const a = runEvents({ preset: 'jump', g: 9.8 }), b = runEvents({ preset: 'jump', g: 1.62 });
  const xa = ev(a, 'land')[0].data.x, xb = ev(b, 'land')[0].data.x;
  expect(4, a.events.concat(b.events), true, '跳台 x0 = 1.5：地球落在 ' + xa.toFixed(4) + ' m、月球落在 ' + xb.toFixed(4) + ' m（與 g 無關）');
  expect(4, a.events.concat(runEvents({ preset: 'jump', g: 6 }).events), false, 'g 只差 3.8');
  expect(4, a.events.concat(runEvents({ preset: 'jump', g: 1.62, x0: 1.6 }).events), false, '出發點不同');
}

// 5 地球與月球：最低點速率相同
{
  const tr = C.buildTrack(C.PRESETS.valley);
  let xLow = 2; for (let x = 2; x < 30; x += 0.01) if (tr.heightAt(x) < tr.heightAt(xLow)) xLow = x; // 谷底
  const hE = 1.6, xE = xForY(tr, tr.yLow + hE, 2, xLow), xM = xForY(tr, tr.yLow + hE * 9.8 / 1.62, 2, xLow);
  const a = runEvents({ preset: 'valley', x0: xE }), b = runEvents({ preset: 'valley', x0: xM, g: 1.62 });
  const va = ev(a, 'bottom')[0].data.v, vb = ev(b, 'bottom')[0].data.v;
  expect(5, a.events.concat(b.events), true, '地球 x0 = ' + xE + '（h0 = ' + a.base.h0.toFixed(3) + '）v = ' + va.toFixed(3) + '；月球 x0 = ' + xM + '（h0 = ' + b.base.h0.toFixed(3) + '）v = ' + vb.toFixed(3));
  expect(5, a.events.concat(runEvents({ preset: 'valley', x0: xE, g: 1.62 }).events), false, '同一個出發點（速率差 √6 倍）');
}

// 6 精準落點：跳台末端（14.5, 5）水平飛出，落點 x = 14.5 + 2√(5h)，h = 6.6125 m
{
  const tr = C.buildTrack(C.PRESETS.jump), x0 = xForY(tr, 5 + 6.6125, 1.5, 8);
  const d = runEvents({ preset: 'jump', x0: x0 });
  expect(6, d.events, true, '跳台 x0 = ' + x0 + '（離台面 ' + (d.base.y0 - 5).toFixed(3) + ' m）→ 落在 ' + ev(d, 'land')[0].data.x.toFixed(3) + ' m');
  const d2 = runEvents({ preset: 'jump', mu: 0.05 });
  expect(6, d2.events, false, '預設出發點 μ = 0.05 → 落在 ' + ev(d2, 'land')[0].data.x.toFixed(3) + ' m');
  expect(6, runEvents({ preset: 'jump' }).events, false, '預設 x0 = 1.5 → 落在 ' + ev(runEvents({ preset: 'jump' }), 'land')[0].data.x.toFixed(3) + ' m');
}

// 7 停在高台、8 一半變成熱
{
  const d = runEvents({ preset: 'loop', mu: 0.055, x0: 2.1 });
  const st = ev(d, 'stop')[0].data;
  expect(7, d.events, true, '圓形迴圈、軌道車 μ = 0.055、x0 = 2.1 → 停在 (' + st.x.toFixed(2) + ', ' + st.y.toFixed(2) + ')，比最低點高 ' + st.hAboveLow.toFixed(2) + ' m');
  expect(8, d.events, true, '同上，零點在地面：Q/E = ' + (st.Q / st.E).toFixed(4));
  const d2 = runEvents({ preset: 'loop', mu: 0.055, x0: 2.05 });
  expect(8, d2.events, true, '另一解 x0 = 2.05：Q/E = ' + (ev(d2, 'stop')[0].data.Q / ev(d2, 'stop')[0].data.E).toFixed(4));
  expect(8, runEvents({ preset: 'loop', mu: 0.055, x0: 2.1, yref: 1 }).events, false, '零點不在地面');
  const d3 = runEvents({ preset: 'loop', mu: 0.1, x0: 29, v0: 2 });
  expect(7, d3.events, false, '直接在高台上推一下（沒經過最低點），停在 x = ' + ev(d3, 'stop')[0].data.x.toFixed(2));
  expect(8, runEvents({ preset: 'loop', mu: 0.06, x0: 1.6 }).events, false, 'μ = 0.06、x0 = 1.6：Q/E = ' + (() => { const s = ev(runEvents({ preset: 'loop', mu: 0.06, x0: 1.6 }), 'stop')[0].data; return (s.Q / s.E).toFixed(4); })());
}

// 9 頂點失重：自由小車 h = 2.5R（略多一點）
{
  const tr = C.buildTrack(C.PRESETS.loop), L = tr.loop;
  const x0 = xForY(tr, L.ya + 2.51 * L.R, 1.5, 5);
  const d = runEvents({ preset: 'loop', mode: 'free', x0: x0 });
  expect(9, d.events, true, '自由小車 x0 = ' + x0 + '（h = ' + ((d.base.y0 - L.ya) / L.R).toFixed(4) + 'R）→ 頂點 N = ' + ev(d, 'loopDone')[0].data.ntopMg.toFixed(4) + ' mg');
  const x1 = xForY(tr, L.ya + 2.48 * L.R, 1.5, 5);
  const d1 = runEvents({ preset: 'loop', mode: 'free', x0: x1 });
  expect(9, d1.events, false, 'x0 = ' + x1 + '（h = 2.48R）：在頂點前離軌（' + ev(d1, 'detach').length + ' 次離軌）');
  expect(9, runEvents({ preset: 'loop', mode: 'rail', x0: x0 }).events, false, '軌道車不算');
}

// 10 四分之三處離軌：h = 1.75R → 離軌高度 (R + 2h)/3 = 1.5R
{
  const tr = C.buildTrack(C.PRESETS.loop), L = tr.loop;
  const x0 = xForY(tr, L.ya + 1.75 * L.R, 1.5, 9.4);
  const d = runEvents({ preset: 'loop', mode: 'free', x0: x0 });
  const de = ev(d, 'detach')[0].data;
  expect(10, d.events, true, '自由小車 x0 = ' + x0 + '（h = ' + ((d.base.y0 - L.ya) / L.R).toFixed(4) + 'R）→ 離軌高度 ' + (de.yRel / (2 * L.R)).toFixed(4) + ' × 2R');
  const d2 = runEvents({ preset: 'loop', mode: 'free', x0: xForY(tr, L.ya + 2 * L.R, 1.5, 9.4) });
  expect(10, d2.events, false, 'h = 2R → 離軌高度 ' + (ev(d2, 'detach')[0].data.yRel / (2 * L.R)).toFixed(4) + ' × 2R');
}

// 11 摩擦中的迴圈：μ = 0.05 時要從更高處出發
{
  const sols = [];
  for (const x0 of [2.24, 2.25, 2.26, 2.27]) {
    const d = runEvents({ preset: 'loop', mode: 'free', mu: 0.05, x0: x0, tMax: 8 });
    const ld = ev(d, 'loopDone')[0];
    if (ld) sols.push(x0 + '：N = ' + ld.data.ntopMg.toFixed(4) + ' mg');
    expect(11, d.events, true, '自由小車 μ = 0.05、x0 = ' + x0 + (ld ? '（頂點 N = ' + ld.data.ntopMg.toFixed(4) + ' mg）' : ''));
  }
  expect(11, runEvents({ preset: 'loop', mode: 'free', mu: 0.05, x0: 2.2, tMax: 8 }).events, false, 'x0 = 2.2：頂點 N 太大');
  expect(11, runEvents({ preset: 'loop', mode: 'free', mu: 0.08, x0: 1.5, tMax: 8 }).events, true, '另一解 μ = 0.08、x0 = 1.5（從最高處出發）');
}

// 12 雲霄飛車設計師：把迴圈縮小（R ≤ 2.6，頂點低於 6.5 m 的高台），自由小車有摩擦繞完迴圈後停在高台上
{
  const cases = [{ R: 2.4, mu: 0.04, x0: 2.6 }, { R: 2, mu: 0.05, x0: 1.95 }, { R: 2.6, mu: 0.03, x0: 3.15 }];
  cases.forEach(c => {
    const d = runEvents({ preset: 'loop', mode: 'free', R: c.R, mu: c.mu, x0: c.x0 });
    const st = ev(d, 'stop')[0];
    expect(12, d.events, true, 'R = ' + c.R + '、μ = ' + c.mu + '、x0 = ' + c.x0 + (st ? ' → 停在 (' + st.data.x.toFixed(2) + ', ' + st.data.y.toFixed(2) + ')，迴圈頂點 ' + (d.base.ya + 2 * c.R).toFixed(2) + ' m' : ''));
  });
  expect(12, runEvents({ preset: 'loop', mode: 'free', mu: 0.06, x0: 1.6 }).events, false, 'R = 3.2（頂點 7.4 m）停在 6.5 m 的高台，不夠高');
  expect(12, runEvents({ preset: 'loop', mode: 'rail', R: 2.4, mu: 0.04, x0: 2.6 }).events, false, '軌道車不算');
}

// h1 蝙蝠的午睡：軌道車在迴圈頂點附近停住（倒掛）
{
  const d = runEvents({ preset: 'loop', mu: 0.11, x0: 1.58 });
  const st = ev(d, 'stop')[0].data;
  expect('h1', d.events, true, '軌道車 μ = 0.11、x0 = 1.58 → 停在 φ = ' + (st.phi * 180 / Math.PI).toFixed(1) + '°');
  const d2 = runEvents({ preset: 'loop', mu: 0.05, x0: 2.98 });
  expect('h1', d2.events, true, '另一解 μ = 0.05、x0 = 2.98 → φ = ' + (ev(d2, 'stop')[0].data.phi * 180 / Math.PI).toFixed(1) + '°');
  expect('h1', runEvents({ preset: 'loop', mode: 'free', mu: 0.11, x0: 1.58 }).events, false, '自由小車做不到（會掉下來）');
}

// h2 樣樣都在，加起來卻一無所有：零點放在能量水位，總能 E = 0
{
  const base = runEvents({ preset: 'valley' }).base, lvl = r2(base.y0);
  const d = runEvents({ preset: 'valley', yref: lvl });
  const b = ev(d, 'bottom')[0].data;
  expect('h2', d.events, true, '預設條件、零點 y0 = ' + lvl + ' m（出發點高度）→ 最低點 K = ' + b.K.toFixed(0) + ' J、U = ' + b.U.toFixed(0) + ' J、E = ' + b.E.toFixed(1) + ' J');
  expect('h2', [refmoveEvent({ preset: 'valley' }, 1.0, lvl)], true, '小車跑的時候把零點拖到 ' + lvl + ' m');
  expect('h2', runEvents({ preset: 'valley', yref: 11 }).events, false, '零點 11 m（E = ' + ev(runEvents({ preset: 'valley', yref: 11 }), 'bottom')[0].data.E.toFixed(0) + ' J）');
}

// h3 有一整秒，世界忘了托住你：自由小車飛越雙峰的山頂再落回軌道
{
  const d = runEvents({ preset: 'twin', mode: 'free', tMax: 30 });
  const at = ev(d, 'attach')[0].data;
  expect('h3', d.events, true, '雙峰、自由小車、x0 = 1.5 → 在 x = ' + ev(d, 'detach')[0].data.x.toFixed(2) + ' 離軌，飛 ' + at.flight.toFixed(3) + ' s 落在 x = ' + at.x.toFixed(2));
  const tr = C.buildTrack(C.PRESETS.loop), L = tr.loop;
  const d2 = runEvents({ preset: 'loop', mode: 'free', x0: xForY(tr, L.ya + 1.75 * L.R, 1.5, 9.4) });
  expect('h3', d2.events, false, '迴圈裡離軌後掉回迴圈底部（飛 ' + ev(d2, 'attach')[0].data.flight.toFixed(3) + ' s）不算');
  expect('h3', runEvents({ preset: 'twin', mode: 'free', x0: 2.5, tMax: 30 }).events, true, '另一解 x0 = 2.5（飛 ' + ev(runEvents({ preset: 'twin', mode: 'free', x0: 2.5, tMax: 30 }), 'attach')[0].data.flight.toFixed(3) + ' s）');
}

console.log(fail ? '\n有 ' + fail + ' 項失敗' : '\n全部通過');
process.exitCode = fail ? 1 : 0;
