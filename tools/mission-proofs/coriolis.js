/* 任務可達成的證明腳本。用法：node tools/mission-proofs/coriolis.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、不該觸發的不會觸發。
 * 事件格式與 js/coriolis.js 相同，全部由 js/coriolis-core.js 計算：
 *   轉盤 'land'／'still'（與 launch、shotEnd、shotFinished 相同）；
 *   地球上的風 'parcel'（與 stepParcels、milestones 相同：每 3 小時、風向轉滿一圈、進到低壓中心 50 km 內、結束時）。
 * 滑桿可打字的精度：轉速 0.01、發射速度 0.001、瞄準角 0.01、發射點 0.001、緯度 0.01、氣壓梯度 0.01、氣壓差 0.1、摩擦 0.01、風速 0.01、風向 0.1（coriolis.html 的 data-decimals）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/coriolis-core.js');
const missions = [];
global.window = { CoriolisCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/coriolis.js');
const byId = id => missions.find(m => m.id === 'coriolis-' + id);
const round = (v, d) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);

// ---------- 轉盤（與 js/coriolis.js 的 launch／shotEnd／shotFinished 相同） ----------
function shot(o) {
  o = Object.assign({ spin: 1, rpm: 10, v0: 1, aim: 0, r0: 0 }, o);
  const w = o.spin * o.rpm * 2 * Math.PI / 60;
  const res = K.turntable({ omega: w, v0: o.v0, aim: o.aim, r0: o.r0, R: 1 });
  const aw = Math.abs(w);
  const end = isFinite(res.T) && res.T < 20 ? res.T : (aw > 1e-6 ? Math.min(2 * Math.PI / aw, 60) : 3);
  const V = Math.hypot(res.V[0], res.V[1]);
  if (isFinite(res.T) && res.T <= end + 1e-9) return { type: 'land', data: { spin: o.spin, rpm: o.rpm, v0: o.v0, aim: o.aim, r0: o.r0, miss: res.miss, T: res.T, V: V } };
  return { type: 'still', data: { spin: o.spin, rpm: o.rpm, v0: o.v0, aim: o.aim, r0: o.r0, V: V, t: end } };
}

// ---------- 地球上的風（與 stepParcels／milestones 相同；每一幀前進 frame 秒，4 小時／秒、60 fps 約 240 秒） ----------
const DEF = { lat: 25, field: 'low', G: 1, dp: 20, k: 2, v0: 0, dir: 90, x: -400, y: 300 };
function release(o, hoursMax, frame) {
  o = Object.assign({}, DEF, o);
  frame = frame || 240;
  const b = o.dir * K.DEG;
  const c = K.parcel({ lat: o.lat, k: o.k * 1e-5, field: { type: o.field, G: o.G, dp: o.dp } }, o.x * 1e3, o.y * 1e3, o.v0 * Math.sin(b), o.v0 * Math.cos(b));
  const evs = [];
  const snap = () => { const d = K.snapshot(c); d.id = 1; evs.push({ type: 'parcel', data: d }); };
  const MAX_T = Math.min(240, hoursMax || 240) * 3600;
  let nextEmit = 3 * 3600, loopSaid = false, eyeSaid = false;
  while (c.t < MAX_T - 1e-6) {
    let left = Math.min(frame, MAX_T - c.t);
    while (left > 1e-6) {
      const h = Math.min(left, nextEmit - c.t);
      K.advance(c, h, 60); left -= h;
      if (c.t >= nextEmit - 1e-6) { snap(); nextEmit += 3 * 3600; }
    }
    if (c.loopT != null && !loopSaid) { loopSaid = true; snap(); }
    if (!eyeSaid && c.minR < 50e3 && c.P.field.type === 'low' && c.r0 > 60e3) { eyeSaid = true; snap(); }
    if (Math.abs(c.s.x) > 8000e3 || Math.abs(c.s.y) > 8000e3) break;
  }
  snap();
  return evs;
}
function first(id, evs) { const m = byId(id); m.mem = {}; return evs.find(e => m.check(e, m.mem)) || null; }

let fail = 0;
function expect(id, events, want, note) {
  const hit = first(id, events);
  const pass = !!hit === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note + (hit && want && hit.type === 'parcel' ? '（第 ' + hit.data.t.toFixed(1) + ' 小時）' : ''));
  return hit;
}
const f1 = v => v == null ? '—' : v.toFixed(1);
const f2 = v => v == null ? '—' : v.toFixed(2);

console.log('科氏力任務證明（' + missions.length + ' 個任務，總星數 ' + missions.filter(m => !m.hidden).reduce((a, m) => a + m.level, 0) + '＋隱藏 ' + missions.filter(m => m.hidden).reduce((a, m) => a + 2 * m.level, 0) + '（隱藏任務星星＝等級 × 2））');

// ---------- 預設：放出一團空氣（低氣壓、北緯 25°、摩擦 1、靜止）只該完成「逆時針的低氣壓」 ----------
{
  const evs = release({});
  const hit = [];
  missions.forEach(m => { m.mem = {}; if (evs.some(e => m.check(e, m.mem))) hit.push(m.id); });
  const ok = hit.length === 1 && hit[0] === 'coriolis-5';
  if (!ok) fail++;
  const last = evs[evs.length - 1].data;
  console.log((ok ? '  ✓ ' : '  ✗ ') + '預設設定（摩擦 2）放出空氣只完成「逆時針的低氣壓」：10 天後繞 ' + f2(last.winding) + ' 圈、最近離中心 ' + f1(last.minR) + ' km' + (ok ? '' : '；實際觸發 ' + hit.join('、')));
  const s = shot({});
  const hit2 = missions.filter(m => { m.mem = {}; return m.check(s, m.mem); }).map(m => m.id);
  const ok2 = hit2.length === 1 && hit2[0] === 'coriolis-1';
  if (!ok2) fail++;
  console.log((ok2 ? '  ✓ ' : '  ✗ ') + '預設轉盤（逆時針 10 圈／分、1 m/s、正對目標）只完成「轉盤上的一球」：落點偏右 ' + f1(-s.data.miss) + '°' + (ok2 ? '' : '；實際觸發 ' + hit2.join('、')));
}
// 1
expect(1, [shot({})], true, '預設發射');
expect(1, [shot({ rpm: 0 })], false, '盤不轉');
// 2 往右偏
expect(2, release({ field: 'uniform', lat: 25 }), true, '北緯 25°、平直等壓線、靜止出發');
expect(2, release({ field: 'uniform', lat: -25 }), false, '南緯 25°（往左偏）');
expect(2, release({ field: 'uniform', lat: 25, v0: 5, dir: 0 }), false, '有初速');
// 3 赤道
expect(3, release({ lat: 0 }), true, '赤道、低氣壓、靜止出發（離中心 500 km）');
expect(3, release({ lat: 2 }), false, '北緯 2°：maxOff ' + f1(release({ lat: 2 }, 60).slice(-1)[0].data.maxOff) + '°');
// 4 打中目標
{
  const a = round(K.aimToHit(10 * 2 * Math.PI / 60, 1, 1), 2);
  const s = shot({ aim: a });
  expect(4, [s], true, '10 圈／分、1 m/s、瞄準 ' + a + '°：差 ' + f2(s.data.miss) + '°');
  const s2 = shot({ rpm: 20, v0: 2.5, aim: 30, r0: 0.4 });
  expect(4, [shot({ rpm: 20, v0: 2.5, aim: round(solveAim(20, 2.5, 0.4), 2), r0: 0.4 })], true, '發射點離中心 0.4 m、20 圈／分、2.5 m/s：瞄準 ' + round(solveAim(20, 2.5, 0.4), 2) + '°');
  void s2;
  expect(4, [shot({ rpm: 5, aim: K.aimToHit(5 * 2 * Math.PI / 60, 1, 1) })], false, '只有 5 圈／分');
  expect(4, [shot({ aim: 50 })], false, '瞄準 50°：差 ' + f1(shot({ aim: 50 }).data.miss) + '°');
}
function solveAim(rpm, v0, r0) {
  let lo = -90, hi = 90;
  const f = a => shot({ rpm: rpm, v0: v0, aim: a, r0: r0 }).data.miss;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if ((f(m) > 0) === (f(lo) > 0)) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
// 5 逆時針的低氣壓
expect(5, release({}), true, '預設（北緯 25°、低氣壓、摩擦 2）');
expect(5, release({ lat: -25 }), false, '南半球（順時針）');
// 6 順時針的盤
{
  const s = shot({ spin: -1 });
  expect(6, [s], true, '順時針 10 圈／分、正對目標：落點偏左 ' + f1(s.data.miss) + '°');
  expect(6, [shot({ spin: 1 })], false, '逆時針（偏右）');
  expect(6, [shot({ spin: -1, r0: 0.3 })], false, '發射點不在中心');
}
// 7 地轉風
{
  const vg = round(K.geostrophicSpeed({ type: 'uniform', G: 1 }, 0, 0, 25), 2);
  expect(7, release({ field: 'uniform', k: 0, v0: vg, dir: 90, x: -1000, y: 0 }, 30), true, '北緯 25°、1 hPa/100 km、沒有摩擦，初速 ' + vg + ' m/s 吹向 90°（東）');
  const vg2 = round(K.geostrophicSpeed({ type: 'uniform', G: 2 }, 0, 0, -40), 2);
  expect(7, release({ field: 'uniform', G: 2, lat: -40, k: 0, v0: vg2, dir: 270, x: 1000, y: 0 }, 30), true, '南緯 40°、2 hPa/100 km：' + vg2 + ' m/s 吹向 270°（西）');
  const vs = Math.round(vg * 2) / 2;
  expect(7, release({ field: 'uniform', k: 0, v0: vs, dir: 90, x: -1000, y: 0 }, 30), true, '只拖滑桿（0.5 m/s 一格）：' + vs + ' m/s，與地轉風差 ' + f1(Math.abs(vs - vg) / vg * 100) + '%');
  expect(7, release({ field: 'uniform', k: 0, v0: vg * 0.9, dir: 90, x: -1000, y: 0 }, 30), false, '速度少 10%');
  expect(7, release({ field: 'uniform', k: 0, v0: vg, dir: 80, x: -1000, y: 0 }, 30), false, '方向偏 10°');
  expect(7, release({ field: 'uniform', k: 0.5, v0: vg, dir: 90, x: -1000, y: 0 }, 30), false, '有摩擦');
}
// 8 順時針的高氣壓
expect(8, release({ field: 'high', k: 0, x: 300, y: 0 }), true, '北緯 25°、高氣壓、沒有摩擦、離中心 300 km');
expect(8, release({ field: 'high', k: 0, x: -400, y: 300 }), true, '預設游標位置（離中心 500 km）');
expect(8, release({ field: 'high', k: 0, lat: -25 }), false, '南半球（逆時針）');
// 9 一天一圈
{
  const e = expect(9, release({ field: 'none', k: 0, lat: 29.9, v0: 10 }, 30), true, '緯度 29.9°（要打字）、初速 10 m/s');
  void e;
  expect(9, release({ field: 'none', k: 0, lat: 30, v0: 10 }, 30), false, '緯度 30°：' + f2(release({ field: 'none', k: 0, lat: 30, v0: 10 }, 30).find(x => x.data.loopT != null).data.loopT) + ' 小時');
  expect(9, release({ field: 'none', k: 0, lat: -29.9, v0: 10 }, 30), true, '南緯 29.9° 也可以');
  expect(9, release({ field: 'none', k: 0.5, lat: 29.9, v0: 10 }, 30), false, '有摩擦');
}
// 10 摩擦讓風斜吹
{
  const sw = K.steadyWind({ lat: 25, k: 3.6e-5, field: { type: 'uniform', G: 1 } });
  expect(10, release({ field: 'uniform', k: 3.6, x: -1000, y: 0 }, 60), true, '北緯 25°、摩擦 3.6：理論 α = ' + f2(sw.angle) + '°');
  expect(10, release({ field: 'uniform', k: 3, x: -1000, y: 0 }, 60), false, '摩擦 3：α = ' + f2(K.steadyWind({ lat: 25, k: 3e-5, field: { type: 'uniform', G: 1 } }).angle) + '°');
  expect(10, release({ field: 'uniform', k: 3.6, x: -1000, y: 0 }, 40), false, '只吹了 40 小時');
}
// 11 颱風眼
expect(11, release({ k: 3 }), true, '北緯 25°、低氣壓 20 hPa、摩擦 3');
expect(11, release({ k: 2, dp: 40 }), true, '摩擦 2、氣壓差 40 hPa');
expect(11, release({ k: 1 }), false, '摩擦 1：' + f1(release({ k: 1 }).find(e => e.data.minR < 50 && e.data.winding >= 2) ? release({ k: 1 }).find(e => e.data.minR < 50 && e.data.winding >= 2).data.t : null) + ' 小時才進到 50 km');
expect(11, release({ k: 3, lat: -25 }), false, '南半球');
// 12 南半球的氣旋
{
  const cands = [];
  [-15, -20, -25, -30, -40].forEach(lat => [1, 2, 3, 4, 5].forEach(k => [20, 30, 40, 60].forEach(dp => {
    const ok = first(12, release({ lat: lat, k: k, dp: dp }, 72));
    if (ok) cands.push(lat + '°／k ' + k + '／' + dp + ' hPa（' + ok.data.t.toFixed(0) + ' h）');
  })));
  const pick = cands[0];
  if (!pick) { fail++; console.log('  ✗ 12  找不到可以完成的組合'); }
  else console.log('  ✓ 12  達成：可行組合 ' + cands.length + ' 種，例如 ' + cands.slice(0, 4).join('、'));
  expect(12, release({ lat: -25, k: 1 }), false, '南緯 25°、摩擦 1、20 hPa');
  expect(12, release({ lat: -25 }), false, '南緯 25°、預設摩擦 2、20 hPa');
  expect(12, release({ lat: 25, k: 3, dp: 40 }), false, '北半球');
}
// 隱藏
expect('h1', release({ field: 'none', k: 0, lat: 90, v0: 10 }, 20), true, '北極、沒有氣壓差、初速 10 m/s：' + f2(K.inertialPeriod(90) / 3600) + ' 小時');
expect('h1', release({ field: 'none', k: 0, lat: -88.5, v0: 10 }, 20), true, '南緯 88.5°：' + f2(K.inertialPeriod(-88.5) / 3600) + ' 小時');
expect('h1', release({ field: 'none', k: 0, lat: 85, v0: 10 }, 20), false, '北緯 85°：' + f2(K.inertialPeriod(85) / 3600) + ' 小時');
{
  const v = round(10 * 2 * Math.PI / 60 * 0.5, 3);
  expect('h2', [shot({ rpm: 10, r0: 0.5, v0: v, aim: 90 })], true, '10 圈／分、發射點 0.5 m、往 90° 推 ' + v + ' m/s（抵消 Ωr0）');
  expect('h2', [shot({ spin: -1, rpm: 10, r0: 0.5, v0: v, aim: -90 })], true, '順時針的盤：往 −90° 推');
  expect('h2', [shot({ rpm: 10, r0: 0.5, v0: 0.45, aim: 90 })], false, '速度不夠（0.45 m/s）：球被盤帶著甩出去');
  expect('h2', [shot({ rpm: 10, r0: 0, v0: 0 })], false, '在中心不動（沒有被帶著繞圈）');
}
expect('h3', release({ field: 'uniform', lat: 0, k: 0 }, 60), true, '赤道、平直等壓線、沒有摩擦');
expect('h3', release({ field: 'uniform', lat: 0, k: 0.5 }, 240), false, '有摩擦：最快 ' + f1(release({ field: 'uniform', lat: 0, k: 0.5 }).slice(-1)[0].data.vmax) + ' m/s');
expect('h3', release({ field: 'uniform', lat: 5, k: 0 }, 240), false, '北緯 5°：最快 ' + f1(release({ field: 'uniform', lat: 5, k: 0 }).slice(-1)[0].data.vmax) + ' m/s');

console.log(fail ? '\n有 ' + fail + ' 項不符' : '\n全部通過');
process.exitCode = fail ? 1 : 0;
