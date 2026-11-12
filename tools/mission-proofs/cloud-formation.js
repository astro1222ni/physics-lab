/* 任務可達成的證明腳本。用法：node tools/mission-proofs/cloud-formation.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。
 * 事件格式與 js/cloud-formation.js 相同（'state'、'cross'、'pass'、'record'），全部由 js/cloud-formation-core.js 計算。
 * 滑桿可打字的精度：氣溫 0.01 °C、溼度 0.01 %、山高 0.1 m、降水效率 0.1 %、遞減率 0.01 °C/km（cloud-formation.html 的 data-decimals）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/cloud-formation-core.js');
const missions = [];
global.window = { CloudCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/cloud-formation.js');
const byId = id => missions.find(m => m.id === 'cloud-formation-' + id);
const TK = K.TK;

const DEF = { T0: 28, RH: 70, H: 1500, eff: 100, gamma: 5.5 };
const round = (v, d) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
function cfg(o) {
  o = Object.assign({}, DEF, o);
  return { T0: round(o.T0, 2), RH: round(o.RH, 2), H: round(o.H, 1), eff: round(o.eff, 1), gamma: round(o.gamma, 2) };
}
function sim(o) { o = cfg(o); return K.simulate({ T0: o.T0, RH: o.RH / 100, H: o.H, eff: o.eff / 100, gamma: o.gamma }); }
/** 與 js/cloud-formation.js 的 missionData() 相同 */
function data(o) {
  o = cfg(o);
  const res = sim(o), s0 = res.start;
  return {
    T0: o.T0, RH: (o.RH / 100) * 100, H: o.H, eff: (o.eff / 100) * 100, gamma: o.gamma,
    Td0: s0.Td - TK, lcl: res.lcl ? res.lcl.z : null, cloud: res.cloud,
    topT: res.top.T - TK, leeT: res.lee.T - TK, leeRH: res.lee.RH * 100, foehn: res.foehn, rain: res.rain * 1000,
    zEvap: res.zEvap, leeCloud: res.cloud && res.zEvap < o.H - 1, lfc: res.lfc, el: res.el, cape: res.cape,
    triggered: res.triggered, stability: res.stability, view: '2d'
  };
}
const stateEv = o => ({ type: 'state', data: data(o) });
/** 在參數 o 下，依序在路徑位置 u1、u2 按「記錄」：與 js/cloud-formation.js 的 recBtn 相同 */
function recEv(o, u1, u2) {
  const res = sim(o);
  const a = K.stateAtU(res, u1), b = K.stateAtU(res, u2);
  const pick = r => ({ z: r.z, T: r.T - TK, RH: r.RH * 100, l: r.l * 1000, branch: r.branch });
  const rate = Math.abs(b.z - a.z) >= 50 ? (a.T - b.T) / ((b.z - a.z) / 1000) : null;
  return { type: 'record', data: { n: 2, a: pick(a), b: pick(b), sameVer: true, dz: Math.abs(b.z - a.z), rate: rate, lcl: res.lcl ? res.lcl.z : null } };
}
/** 單變數二分法：找 lo..hi 之間讓 f(x) = 0 的 x（f 單調），回傳四捨五入到 d 位小數的 x */
function solve(f, lo, hi, d) {
  let flo = f(lo);
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2, fm = f(m);
    if ((fm > 0) === (flo > 0)) { lo = m; flo = fm; } else hi = m;
  }
  return round((lo + hi) / 2, d);
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
const f1 = v => v == null ? '—' : v.toFixed(1);
const f2 = v => v == null ? '—' : v.toFixed(2);
const m0 = v => v == null ? '—' : Math.round(v) + ' m';

console.log('雲的形成任務證明（' + missions.length + ' 個任務）');
// ---------- 預設狀態 ----------
{
  const d = data({});
  const evs = [stateEv({}), { type: 'cross', data: d }];
  const hit = [];
  missions.forEach(m => { if (m.id === 'cloud-formation-1') return; m.mem = {}; if (evs.some(e => m.check(e, m.mem))) hit.push(m.id); });
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設（28 °C、70%、山高 1500 m、降水 100%、5.5 °C/km）不觸發任何任務：雲底 ' + m0(d.lcl) + '、背風 ' + f1(d.leeT) + ' °C／' + f1(d.leeRH) +
    '%、焚風 +' + f2(d.foehn) + ' °C、自由對流 ' + m0(d.lfc) + '、觸發 ' + d.triggered + '（「雲出現了」要播放到雲底，那是使用者自己按的）');
}
// 1 雲出現了
{
  const m = byId(1);
  expect(1, [{ type: 'pass', data: { z: 764, T: 20 } }], true, '播放中氣塊穿過雲底就送出 pass');
  expect(1, [stateEv({})], false, 'state 事件不算');
  void m;
}
// 2 雲底 1000 m
{
  const rh = solve(x => data({ RH: x }).lcl - 1000, 40, 90, 2);
  const d = data({ RH: rh });
  expect(2, [stateEv({ RH: rh })], true, '28 °C、溼度 ' + rh + '%：雲底 ' + f1(d.lcl) + ' m');
  const rh2 = solve(x => data({ T0: 20, RH: x }).lcl - 1000, 40, 95, 0);
  expect(2, [stateEv({ T0: 20, RH: rh2 })], true, '只拖滑桿也做得到：20 °C、溼度 ' + rh2 + '%：雲底 ' + f1(data({ T0: 20, RH: rh2 }).lcl) + ' m');
  expect(2, [stateEv({ RH: rh, H: 900 })], false, '山只有 900 m（雲底高過山頂、沒有成雲）');
}
// 3 乾絕熱
{
  expect(3, [recEv({}, 0.52, 1)], true, '預設：背風坡 ' + m0(recEv({}, 0.52, 1).data.a.z) + ' 與背風山腳，' + f2(recEv({}, 0.52, 1).data.rate) + ' °C/km');
  expect(3, [recEv({ RH: 40, H: 3000 }, 0, K.uAtZ(1500, 3000, -1))], true, '溼度 40%、迎風坡 0 → 1500 m（雲底 ' + m0(data({ RH: 40, H: 3000 }).lcl) + '）：' + f2(recEv({ RH: 40, H: 3000 }, 0, K.uAtZ(1500, 3000, -1)).data.rate) + ' °C/km');
  expect(3, [recEv({ H: 3000 }, 0, K.uAtZ(1500, 3000, -1))], false, '預設溼度：1500 m 已在雲裡');
  expect(3, [recEv({}, 0.5005, 0.82 - 0.05)], false, '高度差不到 1000 m');
}
// 4 濕絕熱
{
  const o = { H: 3000 };
  const e = recEv(o, K.uAtZ(1000, 3000, -1), K.uAtZ(2500, 3000, -1));
  expect(4, [e], true, '山高 3000 m，迎風坡雲中 1000 → 2500 m：' + f2(e.data.rate) + ' °C/km');
  const e2 = recEv({ T0: 5, RH: 95, H: 4000 }, K.uAtZ(500, 4000, -1), K.uAtZ(3800, 4000, -1));
  expect(4, [e2], true, '寒冷（5 °C、95%）的高山 500 → 3800 m：' + f2(e2.data.rate) + ' °C/km');
  expect(4, [recEv(o, 0, K.uAtZ(2500, 3000, -1))], false, '一筆在雲底以下');
}
// 5 焚風
{
  const d = data({ H: 3000 });
  expect(5, [stateEv({ H: 3000 })], true, '山高 3000 m：焚風 +' + f2(d.foehn) + ' °C');
  expect(5, [stateEv({ H: 3000, eff: 50 })], false, '降水效率 50%：+' + f2(data({ H: 3000, eff: 50 }).foehn) + ' °C');
}
// 6 沒有雨就沒有焚風
{
  const d = data({ H: 3000, eff: 0 });
  expect(6, [stateEv({ H: 3000, eff: 0 })], true, '山高 3000 m、降水 0%：焚風 ' + d.foehn.toFixed(4) + ' °C（雲底 ' + m0(d.lcl) + '）');
  expect(6, [stateEv({ H: 1000, eff: 0 })], false, '山只比雲底高 ' + m0(1000 - data({ H: 1000, eff: 0 }).lcl));
  expect(6, [stateEv({ H: 3000, eff: 5 })], false, '降水 5%：+' + f2(data({ H: 3000, eff: 5 }).foehn) + ' °C');
}
// 7 雨影
{
  const o = { RH: 85, H: 4000, gamma: 6 };
  const d = data(o);
  expect(7, [stateEv(o)], true, '85%、山高 4000 m：背風溼度 ' + f1(d.leeRH) + '%');
  expect(7, [stateEv({ RH: 85, H: 3000, gamma: 6 })], false, '85%、山高 3000 m：' + f1(data({ RH: 85, H: 3000, gamma: 6 }).leeRH) + '%');
  expect(7, [stateEv({ RH: 80, H: 4000, gamma: 6 })], false, '迎風溼度只有 80%');
}
// 8 背風坡的雲牆
{
  // 28 °C、70%、山高 2000 m：用降水效率把背風雲底調到迎風雲底 + 1000 m
  const eff = solve(x => { const e = data({ H: 2000, eff: x }); return e.zEvap - e.lcl - 1000; }, 50, 100, 1);
  const d = data({ H: 2000, eff: eff });
  expect(8, [stateEv({ H: 2000, eff: eff })], true, '山高 2000 m、降水 ' + eff + '%：迎風雲底 ' + f1(d.lcl) + ' m、背風雲底 ' + f1(d.zEvap) + ' m（差 ' + f1(d.zEvap - d.lcl) + ' m）');
  const d2 = data({ H: 2000, eff: 80 });
  expect(8, [stateEv({ H: 2000, eff: 80 })], true, '只拖滑桿：山高 2000 m、降水 80%：差 ' + f1(d2.zEvap - d2.lcl) + ' m、背風雲底 ' + m0(d2.zEvap));
  const d3 = data({ H: 4000, eff: 40 });
  expect(8, [stateEv({ H: 4000, eff: 40 })], false, '山高 4000 m、降水 40%：差 ' + m0(d3.zEvap - d3.lcl) + '（不是 1000 m）');
  expect(8, [stateEv({ H: 2000, eff: 100 })], false, '降水 100%：背風坡沒有雲');
  expect(8, [stateEv({ H: 2000, eff: eff, RH: 100 })], false, '山腳起霧（溼度 100%）');
  // 雲牆要貼著山脊：差 1000 m 但背風雲底低於山高 80%
  let low = null;
  for (let H = 2500; H <= 4000 && !low; H += 50) for (let e = 30; e <= 100 && !low; e += 5) { const q = data({ H: H, eff: e }); if (q.leeCloud && Math.abs(q.zEvap - q.lcl - 1000) <= 25 && q.zEvap < 0.8 * H) low = { H: H, eff: e, z: q.zEvap }; }
  expect(8, low ? [stateEv({ H: low.H, eff: low.eff })] : [], false, '差 1000 m 但雲牆沒有貼著山脊：' + (low ? '山高 ' + low.H + ' m、背風雲底 ' + m0(low.z) : '（找不到這種情形，也算不觸發）'));
}
// 9 地形雷雨
{
  const o = { RH: 85, H: 1000, gamma: 6 };
  const d = data(o);
  expect(9, [stateEv(o)], true, '85%、山高 1000 m、6 °C/km：雲底 ' + m0(d.lcl) + '、自由對流 ' + m0(d.lfc) + '、雲頂 ' + m0(d.el));
  const d2 = data({ RH: 85, H: 3000, gamma: 6 });
  expect(9, [stateEv({ RH: 85, H: 3000, gamma: 6 })], false, '山高 3000 m：山頂比自由對流高 ' + m0(d2.H - d2.lfc) + '（不是「剛好推過去」）');
  expect(9, [stateEv({ H: 3000, gamma: 6.5 })], false, '70%、山高 3000 m、6.5 °C/km：雲頂 ' + m0(data({ H: 3000, gamma: 6.5 }).el));
  expect(9, [stateEv({ H: 3000 })], false, '5.5 °C/km：自由對流 ' + m0(data({ H: 3000 }).lfc) + '，觸發 ' + data({ H: 3000 }).triggered);
  expect(9, [stateEv({ RH: 85, H: 1000, gamma: 10.5 })], false, '絕對不穩定（10.5 °C/km）不算');
  const d3 = data({ RH: 100, H: 1000, gamma: 6 });
  expect(9, [stateEv({ RH: 100, H: 1000, gamma: 6 })], false, '山腳起霧（100%）：雲頂 ' + m0(d3.el));
}
// 10 小山大雷雨
{
  const o = { RH: 85, H: 800, gamma: 7 };
  const d = data(o);
  expect(10, [stateEv(o)], true, '85%、山高 800 m、7 °C/km：雲底 ' + m0(d.lcl) + '、自由對流 ' + m0(d.lfc) + '、雲頂 ' + m0(d.el));
  expect(10, [stateEv({ RH: 85, H: 850, gamma: 7 })], false, '山高 850 m');
  const d2 = data({ T0: 30, RH: 95, H: 800, gamma: 6.5 });
  expect(10, [stateEv({ T0: 30, RH: 95, H: 800, gamma: 6.5 })], false, '30 °C、95%：雲底只有 ' + m0(d2.lcl) + '（山腳幾乎飽和）');
  expect(10, [stateEv({ RH: 85, H: 800, gamma: 10 })], false, '10 °C/km（絕對不穩定）不算');
  expect(10, [stateEv({ T0: 40, RH: 100, H: 0, gamma: 11 })], false, '滑桿全部拉到最大（40 °C、100%、11 °C/km）、山高 0');
}
// 11 三十五度的焚風
{
  const rh = solve(x => data({ T0: 25, RH: x, H: 3000, gamma: 6 }).leeT - 35, 50, 100, 2);
  const d = data({ T0: 25, RH: rh, H: 3000, gamma: 6 });
  expect(11, [stateEv({ T0: 25, RH: rh, H: 3000, gamma: 6 })], true, '25 °C、溼度 ' + rh + '%、山高 3000 m：背風 ' + d.leeT.toFixed(3) + ' °C');
  // 只用滑桿的步長也做得到：找一組整數溼度、50 m 山高
  let found = null;
  for (let H = 2000; H <= 4000 && !found; H += 50) for (let RH = 60; RH <= 100 && !found; RH++) {
    const e = data({ T0: 25, RH: RH, H: H, gamma: 6 });
    if (Math.abs(e.leeT - 35) <= 0.1) found = { RH: RH, H: H, t: e.leeT };
  }
  expect(11, found ? [stateEv({ T0: 25, RH: found.RH, H: found.H, gamma: 6 })] : [], true, '只拖滑桿：溼度 ' + (found && found.RH) + '%、山高 ' + (found && found.H) + ' m → ' + (found && found.t.toFixed(3)) + ' °C');
  expect(11, [stateEv({ T0: 25, RH: rh, H: 3000, gamma: 6, eff: 95 })], false, '降水 95%');
}
// 12 兩個雲底
{
  // 溼度決定迎風雲底 500 m，再用降水效率把背風雲底調到 2000 m
  const rh = solve(x => data({ RH: x, H: 4000 }).lcl - 500, 70, 99, 2);
  const eff = solve(x => data({ RH: rh, H: 4000, eff: x }).zEvap - 2000, 0, 100, 1);
  const d = data({ RH: rh, H: 4000, eff: eff });
  expect(12, [stateEv({ RH: rh, H: 4000, eff: eff })], true, '28 °C、溼度 ' + rh + '%、山高 4000 m、降水 ' + eff + '%：雲底 ' + f1(d.lcl) + ' m、背風雲底 ' + f1(d.zEvap) + ' m');
  expect(12, [stateEv({ RH: rh, H: 4000, eff: 100 })], false, '降水 100%：背風坡沒有雲');
}
// h1 山頂飄雪
{
  const o = { T0: 15, RH: 80, H: 3000, gamma: 6 };
  const d = data(o);
  expect('h1', [stateEv(o)], true, '15 °C、80%、山高 3000 m：山頂 ' + f1(d.topT) + ' °C、降水 ' + f2(d.rain) + ' g/kg');
  expect('h1', [stateEv({ T0: 15, RH: 80, H: 3000, gamma: 6, eff: 0 })], false, '降水 0%');
  expect('h1', [stateEv({})], false, '預設：山頂 ' + f1(data({}).topT) + ' °C');
}
// h2 沙漠之風
{
  const o = { T0: 5, RH: 90, H: 4000, gamma: 9 };
  const d = data(o);
  expect('h2', [stateEv(o)], true, '5 °C、90%、山高 4000 m、9 °C/km：背風溼度 ' + f1(d.leeRH) + '%');
  expect('h2', [stateEv({ RH: 5, H: 0 })], false, '沒有山、溼度 5%（本來就乾的空氣不算）');
  expect('h2', [stateEv({ RH: 50, H: 4000 })], false, '迎風溼度 50%：背風 ' + f1(data({ RH: 50, H: 4000 }).leeRH) + '%');
  expect('h2', [stateEv({ T0: 10, RH: 70, H: 4000, gamma: 9.6 })], false, '舊版會觸發的 10 °C、70%、4000 m：迎風溼度不到 90%');
  expect('h2', [stateEv({ T0: -10, RH: 100, H: 4000, gamma: 11 })], false, '滑桿拉到極端（−10 °C、100%、4000 m、11 °C/km）：背風 ' + f1(data({ T0: -10, RH: 100, H: 4000, gamma: 11 }).leeRH) + '%，但山腳起霧、絕對不穩定');
  expect('h2', [stateEv({ T0: 10, RH: 90, H: 4000, gamma: 5 })], false, '10 °C、90%、4000 m、5 °C/km：背風 ' + f1(data({ T0: 10, RH: 90, H: 4000, gamma: 5 }).leeRH) + '%');
}
// h3 沒有山也長雲
{
  const o = { H: 0, gamma: 10.5 };
  const d = data(o);
  expect('h3', [stateEv(o)], true, '山高 0、遞減率 10.5 °C/km（絕對不穩定）：自由對流 ' + m0(d.lfc) + '、雲頂 ' + m0(d.el));
  expect('h3', [stateEv({ H: 0 })], false, '山高 0、5.5 °C/km');
  expect('h3', [stateEv({ H: 50, gamma: 10.5 })], false, '山高 50 m');
}

let stars = 0, hidden = 0;
missions.forEach(m => { if (m.hidden) hidden += 2 * m.level; else stars += m.level; });   // 隱藏任務星星＝等級 × 2（LabMission.starsOf）
console.log('\n任務 ' + missions.filter(m => !m.hidden).length + ' 個（' + stars + ' 顆星）＋ 隱藏 ' + missions.filter(m => m.hidden).length + ' 個（' + hidden + ' 顆星）');
console.log(fail ? '有 ' + fail + ' 項失敗' : '全部通過');
process.exitCode = fail ? 1 : 0;
