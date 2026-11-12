/* 任務可達成的證明腳本。用法：node tools/mission-proofs/atmosphere-layers.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、不該觸發的不會觸發。
 * 事件 'state' 的內容與 js/atmosphere-layers.js 的 snapshot() 相同；'burst' 與 onBurst() 相同，全部由 js/atmosphere-layers-core.js 計算。
 * 滑桿可打字的精度（atmosphere-layers.html 的 data-decimals）：高度 0.001 km（1 m）、ΔT 0.01 K、地面直徑 0.001 m。
 * 氣球：頁面每一步最多積分 4 秒、爆破時用二分法找到剛好撐到爆破直徑的高度，和 core.burstAltitude 的解析值相同（測試裡核對到 1 m）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/atmosphere-layers-core.js');
const missions = [];
global.window = { AtmosphereLayersCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/atmosphere-layers.js');
const byId = id => missions.find(m => m.id === 'atmosphere-layers-' + id);

const r3 = v => Math.round(v * 1000) / 1000;      // 打字精度 0.001
const r2 = v => Math.round(v * 100) / 100;
/** 頁面狀態 → 'state' 事件 */
function stateEv(zkm, dT, refKm) {
  zkm = r3(zkm); dT = dT || 0;
  const s = K.at(zkm * 1000, dT), s0 = K.at(0, dT);
  const r = refKm == null ? null : K.at(r3(refKm) * 1000, dT);
  return { type: 'state', data: {
    z: zkm * 1000, dT: dT, T: s.T, P: s.P, rho: s.rho, above: s.above, boil: s.boil, mfp: s.mfp, c: s.c, H: s.H,
    layer: s.layer, lapse: K.lapse(zkm * 1000, dT), Ts: s0.T, rhoHe0: s0.P * 0.0040026 / (K.RSTAR * s0.T),
    ref: r ? { z: r.z, P: r.P, T: r.T } : null, range: 120, q: 'P', log: true } };
}
/** 一次飛行（前面的飛行 prev 是 [{type, D0, dT}]） */
const flights = [];
function flyEv(type, D0, dT, keep) {
  D0 = r3(D0); dT = dT || 0;
  const f = K.fly(type, D0, dT, 4);
  if (f.grounded) return null;
  const b = f.b, s = K.at(b.z, dT);
  const v0 = K.balloonAt(K.launch(type, D0, dT), 0).v;
  const rec = { type: type, D0: D0, dT: dT, v0: v0, zBurst: b.z, Pburst: s.P };
  const list = (keep || []).concat([rec]);
  return { type: 'burst', data: Object.assign({ Tburst: s.T, t: b.t, flights: list }, rec) };
}
const hits = (id, ev) => !!ev && byId(id).check(ev);

let ok = 0, bad = 0;
function expect(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label + (extra ? '（' + extra + '）' : '')); }
  else { bad++; console.error('  ✗ ' + label + (extra ? '（' + extra + '）' : '')); }
}
const km = v => (v / 1000).toFixed(3) + ' km';
const allIds = missions.map(m => m.id.replace('atmosphere-layers-', ''));
const examples = {};
function ex(id, ev, note) { examples[id] = ev; expect(id + ' 做得到', hits(id, ev), note); }
function no(id, ev, note) { expect(id + ' 不觸發：' + note, !hits(id, ev)); }

console.log('atmosphere-layers 任務證明');
// 預設狀態
{
  const ev0 = stateEv(0, 0);
  const fired = allIds.filter(id => hits(id, ev0));
  expect('預設狀態（海平面、ΔT = 0、沒有參考點）不觸發任何任務', fired.length === 0, fired.join(','));
}
// 1 玉山
ex('1', stateEv(3.952, 0), '3952 m：' + (K.at(3952).P / 100).toFixed(1) + ' hPa');
no('1', stateEv(3.93, 0), '3930 m');
// 2 一半
{ const z = K.heightOfPressure(K.P0 / 2) / 1000; ex('2', stateEv(z, 0), km(z * 1000)); no('2', stateEv(z, 0.5), 'ΔT = 0.5'); no('2', stateEv(5.3, 0), '5.3 km'); }
// 3 對流層頂
ex('3', stateEv(11.019, 0), '11.019 km'); no('3', stateEv(11.2, 0), '11.2 km');
// 4 任何一次爆破
ex('4', flyEv('b600', 1.5, 0), 'b600、1.5 m：' + km(K.burstAltitude('b600', 1.5, 0)));
// 5 最冷
ex('5', stateEv(88, 0), '88 km：' + (K.at(88000).T - 273.15).toFixed(2) + ' °C'); no('5', stateEv(88, -1), 'ΔT = −1'); no('5', stateEv(80, 0), '80 km');
// 6 暖空氣柱
{
  let dTmin = null;
  for (let d = 0; d <= 30; d += 0.5) { if (K.heightOfPressure(50000, d) >= 5900.5) { dTmin = d; break; } }
  const z = K.heightOfPressure(50000, 20) / 1000;
  ex('6', stateEv(z, 20), 'ΔT = +20，500 hPa 在 ' + km(z * 1000) + '；至少要 ΔT ≈ +' + dTmin);
  no('6', stateEv(K.heightOfPressure(50000, 0) / 1000, 0), '標準大氣 500 hPa 在 5.579 km');
}
// 7 聖母峰
{
  const ds = [];
  for (let d = -30; d <= 30; d += 0.5) { const P = K.at(8849, d).P; if (P >= 33500 && P <= 33900) ds.push(d); }
  ex('7', stateEv(8.849, ds[0]), 'ΔT = ' + ds[0] + '…' + ds[ds.length - 1] + ' K');
  no('7', stateEv(8.849, 0), 'ΔT = 0（315.0 hPa）');
}
// 8 標準探空
{
  const okD = [];
  for (let D0 = 1.38; D0 <= 1.47; D0 += 0.001) { const e = flyEv('b600', D0, 0); if (hits('8', e)) okD.push(r3(D0)); }
  ex('8', flyEv('b600', okD[Math.floor(okD.length / 2)], 0), '600 g、D0 = ' + okD[0] + '–' + okD[okD.length - 1] + ' m');
  no('8', flyEv('b600', 1.5, 0), 'D0 = 1.5（' + K.balloonAt(K.launch('b600', 1.5, 0), 0).v.toFixed(2) + ' m/s、' + km(K.burstAltitude('b600', 1.5, 0)) + '）');
  no('8', flyEv('b600', okD[0], 1), 'ΔT = 1');
  // 和 12 不會同時完成
  const both = okD.filter(D0 => hits('12', flyEv('b600', D0, 0)));
  expect('8 與 12 不會同一次飛行完成', both.length === 0, both.join(','));
}
// 9 尺度高度
{
  const ref = 12, Pr = K.at(12000).P, z = K.heightOfPressure(Pr / Math.E) / 1000;
  ex('9', stateEv(z, 0, ref), '參考點 12 km、探測點 ' + km(r3(z) * 1000) + '，相距 ' + ((r3(z) - ref) * 1000).toFixed(0) + ' m');
  const z2 = K.heightOfPressure(K.at(8000).P / Math.E) / 1000;
  no('9', stateEv(z2, 0, 8), '參考點 8 km（對流層裡）');
  no('9', stateEv(ref, 0, z), '參考點在上、探測點在下');
}
// 10 四十公里
ex('10', flyEv('b3000', 1.85, 0), '3000 g、1.85 m：' + km(K.burstAltitude('b3000', 1.85, 0)) + '，出發 ' + K.balloonAt(K.launch('b3000', 1.85, 0), 0).v.toFixed(2) + ' m/s');
no('10', flyEv('b3000', 1.95, 0), '1.95 m（' + km(K.burstAltitude('b3000', 1.95, 0)) + '）');
no('10', flyEv('b3000', 1.85, 5), 'ΔT = 5');
// 11 冷天與熱天
{
  const cold = flyEv('b600', 1.5, -15).data;
  const warm = flyEv('b600', 1.5, 15, [cold]);
  ex('11', warm, 'ΔT −15：' + km(cold.zBurst) + '；+15：' + km(warm.data.zBurst));
  const c2 = flyEv('b600', 1.5, -14).data;
  no('11', flyEv('b600', 1.5, 15, [c2]), '溫差 29 K');
  no('11', flyEv('b600', 1.6, 15, [cold]), '地面直徑不同');
  no('11', flyEv('b1200', 1.5, 15, [cold]), '氣球不同');
}
// 12 百分之九十九
{
  const okD = [];
  for (let D0 = 1.37; D0 <= 1.42; D0 += 0.001) { if (hits('12', flyEv('b600', D0, 0))) okD.push(r3(D0)); }
  ex('12', flyEv('b600', okD[0], 0), '600 g、ΔT = 0、D0 = ' + okD.join('、') + ' m');
  no('12', flyEv('b600', 1.5, 0), '1.5 m（' + (K.at(K.burstAltitude('b600', 1.5, 0)).P / K.P0 * 100).toFixed(3) + '%）');
}
// ---------- 隱藏 ----------
{ const z = K.heightOfPressure(K.vaporPressure(37)) / 1000; ex('h1', stateEv(z, 0), km(r3(z) * 1000) + '，沸點 ' + K.at(r3(z) * 1000).boil.toFixed(2) + ' °C'); no('h1', stateEv(18, 0), '18 km'); }
{
  const zt = K.heightOfPressure(K.TRIPLE) / 1000;
  ex('h2', stateEv(zt - 0.02, 0), km(r3(zt - 0.02) * 1000) + '，沸點 ' + K.at(r3(zt - 0.02) * 1000).boil.toFixed(3) + ' °C');
  no('h2', stateEv(zt + 0.02, 0), '三相點以上（沒有液態水）'); no('h2', stateEv(33.5, 0), '33.5 km');
}
{
  let lo = 90000, hi = 120000; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (K.at(m).T < K.T0) lo = m; else hi = m; }
  ex('h3', stateEv(lo / 1000, 0), km(lo)); ex('h3', stateEv(lo / 1000, 10), 'ΔT = +10 也在同一高度');
  no('h3', stateEv(lo / 1000 + 0.1, 0), '+100 m'); no('h3', stateEv(0, 0), '海平面本身');
}
{
  const rhe = K.at(0).P * 0.0040026 / (K.RSTAR * K.at(0).T);
  let lo = 0, hi = 40000; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (K.at(m).rho > rhe) lo = m; else hi = m; }
  ex('h4', stateEv(lo / 1000, 0), km(lo)); no('h4', stateEv(lo / 1000 + 0.05, 0), '+50 m');
}
{
  let lo = 86000, hi = 120000; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (K.at(m).mfp < 1.005) lo = m; else hi = m; }
  ex('h5', stateEv(lo / 1000, 0), km(lo)); no('h5', stateEv(lo / 1000, 0.5), 'ΔT = 0.5'); no('h5', stateEv(110, 0), '110 km');
}
{
  const okD = [];
  for (let D0 = 2.2; D0 <= 3.0; D0 += 0.005) { if (hits('h6', flyEv('b300', D0, 0))) okD.push(r3(D0)); }
  ex('h6', flyEv('b300', okD[0], 0), '300 g、D0 = ' + okD[0] + '–' + okD[okD.length - 1] + ' m');
  no('h6', flyEv('b300', 2.2, 0), '2.2 m（' + km(K.burstAltitude('b300', 2.2, 0)) + '）');
}
{
  // 密度 × g = 1 Pa/m 的高度附近：參考點與探測點相距 100 m
  let lo = 0, hi = 40000; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; const s = K.at(m); if (s.rho * s.g > 1) lo = m; else hi = m; }
  const zr = r3((lo - 50) / 1000);
  ex('h7', stateEv(zr + 0.1, 0, zr), '參考點 ' + km(zr * 1000) + '、往上 100 m');
  no('h7', stateEv(10.1, 0, 10), '10 km（每公尺約 4.1 Pa）');
  no('h7', stateEv(zr + 0.2, 0, zr), '相距 200 m');
}
{
  const ds = [];
  for (let d = -10; d <= 0; d += 0.01) {
    const z1 = r3(K.heightOfPressure(100000, d) / 1000), z2 = r3(K.heightOfPressure(50000, d) / 1000);
    if (hits('h8', stateEv(z2, r2(d), z1))) ds.push(r2(d));
  }
  const d = ds[Math.floor(ds.length / 2)];
  ex('h8', stateEv(K.heightOfPressure(50000, d) / 1000, d, K.heightOfPressure(100000, d) / 1000), 'ΔT = ' + ds[0] + '…' + ds[ds.length - 1] + ' K');
  no('h8', stateEv(K.heightOfPressure(50000, 0) / 1000, 0, K.heightOfPressure(100000, 0) / 1000), '標準大氣（厚度 5468 m）');
}
{
  const a = flyEv('b600', 1.3, 0).data;
  const D2 = 1.3 * K.BALLOONS.b1200.burst / K.BALLOONS.b600.burst;
  ex('h9', flyEv('b1200', D2, 0, [a]), '600 g 1.3 m 與 1200 g ' + r3(D2) + ' m：' + km(a.zBurst) + '、' + km(K.burstAltitude('b1200', r3(D2), 0)));
  no('h9', flyEv('b1200', 1.8, 0, [a]), '1200 g 1.8 m');
  no('h9', flyEv('b600', 1.3, 0, [a]), '同一種氣球');
  no('h9', flyEv('b1200', D2, 5, [a]), '大氣不同');
}
{
  const okD = [];
  for (let D0 = 1.9; D0 <= 2.3; D0 += 0.001) { if (hits('h10', flyEv('b3000', D0, 0))) okD.push(r3(D0)); }
  ex('h10', flyEv('b3000', okD[0], 0), '3000 g、D0 = ' + okD[0] + '–' + okD[okD.length - 1] + ' m');
  no('h10', flyEv('b3000', 2.2, 0), '2.2 m（' + km(K.burstAltitude('b3000', 2.2, 0)) + '）');
  no('h10', flyEv('b3000', 2.0, 0), '2.0 m（出發 ' + K.balloonAt(K.launch('b3000', 2.0, 0), 0).v.toFixed(2) + ' m/s）');
}

// 隱藏任務彼此不連帶完成：每個隱藏任務的達成例，不會讓別的隱藏任務完成
{
  const hid = allIds.filter(id => id[0] === 'h');
  hid.forEach(function (id) {
    const others = hid.filter(o => o !== id && hits(o, examples[id]));
    expect(id + ' 的達成例不會順便完成別的隱藏任務', others.length === 0, others.join(','));
  });
}

console.log('\n' + ok + ' 項通過' + (bad ? '，' + bad + ' 項失敗' : ''));
if (bad) process.exitCode = 1;
