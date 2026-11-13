/* 任務可達成的證明腳本。用法：node tools/mission-proofs/tides.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。
 * 事件格式與 js/tides.js 相同（'state'、'high'、'cam'），全部由 js/tides-core.js 計算。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/tides-core.js');
const missions = [];
global.window = { TidesCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/tides.js');
const byId = id => missions.find(m => m.id === 'tides-' + id);
const DEG = Math.PI / 180;

const DEF = { psi: 40, dec: 10, dist: 1, lat: 23.5, sun: true, t: 6 };
function P(o) { return { dec: o.dec, dist: o.dist, sun: o.sun }; }
function cfg(o) { return Object.assign({}, DEF, o); }
function psi0Of(o) { return o.psi - K.PSI_RATE * o.t; }
/** 與 js/tides.js 的 missionData() 相同 */
function stateEv(o) {
  o = cfg(o);
  const p = P(o), psi0 = psi0Of(o), psi = K.psiAt(psi0, o.t);
  const day = K.dayRange(p, o.lat, psi0, o.t);
  return { type: 'state', data: {
    psi: K.norm360(psi), dec: o.dec, dist: o.dist, lat: o.lat, sun: o.sun, t: o.t, lt: K.ltAt(o.t),
    h: K.heightT(p, o.lat, psi0, o.t), range: day.range, hi: day.hi, lo: day.lo, eqRange: K.equatorRange(p, psi),
    highsPerDay: K.highsPerLunarDay(p, o.lat, psi0, o.t), ratioM: 1 / Math.pow(o.dist, 3), view: '2d'
  } };
}
function moonAlt(o, psi0, t) {
  const rh = K.siteDir(o.lat, K.ltAt(t)), mh = K.moonDir(K.psiAt(psi0, t), o.dec);
  return Math.asin(Math.max(-1, Math.min(1, K.dot(rh, mh)))) / DEG;
}
/** 從 o.t 開始播放 days 天，與 js/tides.js 的 onHigh() 相同的 'high' 事件（參數不變，所以 lastHigh 一路累積） */
function highEvs(o, days) {
  o = cfg(o);
  const p = P(o), psi0 = psi0Of(o);
  const ex = K.extrema(p, o.lat, psi0, o.t, o.t + 24 * days, 0.2);
  let prev = null;
  return ex.highs.map(function (e) {
    const alt = moonAlt(o, psi0, e.t);
    const ev = { type: 'high', data: {
      t: e.t, h: e.h, moonAlt: alt, dec: o.dec, lat: o.lat, sun: o.sun, dist: o.dist, psi: K.norm360(K.psiAt(psi0, e.t)),
      gap: prev ? e.t - prev.t : null, dh: prev ? e.h - prev.h : null, prevH: prev ? prev.h : null, prevMoonAlt: prev ? prev.moonAlt : null
    } };
    prev = { t: e.t, h: e.h, moonAlt: alt };
    return ev;
  });
}
function cam(preset, dec) { return { type: 'cam', data: { preset: preset, dec: dec } }; }

let fail = 0;
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { if (m.check(e, m.mem)) ok = true; });
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}
const cm = h => (h * 100).toFixed(1) + ' cm';
const hm = h => Math.floor(h) + ' 時 ' + Math.round((h - Math.floor(h)) * 60) + ' 分';

console.log('潮汐任務證明（' + missions.length + ' 個任務）');
// ---------- 預設狀態 ----------
{
  const evs = [stateEv({})];
  let hit = [];
  missions.forEach(m => { m.mem = {}; if (evs.some(e => m.check(e, m.mem))) hit.push(m.id); });
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態（ψ 40°、δ 10°、1 倍距離、緯度 23.5°、有太陽、06:00）的 state 事件不觸發任何任務');
  // 預設參數下自動播放 30 天：'high' 事件只在使用者操作過後才送出；即使送出，除了「漲潮了」也不會觸發別的任務
  const hs = highEvs({}, 30);
  hit = [];
  missions.forEach(m => { if (m.id === 'tides-1') return; m.mem = {}; if (hs.some(e => m.check(e, m.mem))) hit.push(m.id); });
  if (hit.length) { fail++; console.log('  ✗ 預設參數播放 30 天觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設參數播放 30 天（' + hs.length + ' 次高潮，最高 ' + cm(Math.max.apply(null, hs.map(e => e.data.h))) +
    '、相連高潮最大差 ' + cm(Math.max.apply(null, hs.filter(e => e.data.dh != null).map(e => Math.abs(e.data.dh)))) + '）只有「漲潮了」會成立；tides.js 在使用者操作前不送任何事件');
  // 預設參數播放中途暫停：只有月相位置對了才會觸發大潮／小潮（那是使用者自己選的時機）
  const hitP = [];
  for (let t = 6; t <= 6 + 24 * 30; t += 0.5) {
    const psi = K.norm360(DEF.psi + K.PSI_RATE * (t - 6));
    const ev = stateEv({ t: t, psi: psi });
    missions.forEach(m => { m.mem = {}; if (m.check(ev, m.mem) && hitP.indexOf(m.id) < 0) hitP.push(m.id); });
  }
  const extra = hitP.filter(id => id !== 'tides-2' && id !== 'tides-3');
  if (extra.length) { fail++; console.log('  ✗ 預設參數任意時刻暫停觸發了 ' + extra.join('、')); }
  else console.log('  ✓ 預設參數下任意時刻暫停，只可能在新月／滿月或上下弦附近成立「大潮」「小潮」（' + hitP.join('、') + '）');
}

// 1 漲潮了
expect(1, highEvs({}, 1), true, '預設參數播放一天就經過高潮');
// 2 大潮、3 小潮
expect(2, [stateEv({ psi: 180 })], true, 'ψ = 180°（滿月）');
expect(2, [stateEv({ psi: 357.5 })], true, 'ψ = 357.5°（新月前，誤差 2.5°）');
expect(2, [stateEv({ psi: 175 })], false, 'ψ = 175°');
expect(2, [stateEv({ psi: 180, sun: false })], false, '沒有太陽');
expect(3, [stateEv({ psi: 90 })], true, 'ψ = 90°（上弦）');
expect(3, [stateEv({ psi: 271 })], true, 'ψ = 271°（下弦）');
expect(3, [stateEv({ psi: 94 })], false, 'ψ = 94°');
// 4 傾斜的隆起
expect(4, [cam('side', 22)], true, 'δ = 22° 時按「側看隆起」');
expect(4, [cam('side', -28.6)], true, 'δ = −28.6°');
expect(4, [cam('side', 15), cam('top', 25)], false, 'δ = 15° 側看、δ = 25° 俯視');
// 5 十二小時二十五分
{
  const hs = highEvs({ sun: false }, 3);
  expect(5, hs, true, '關掉太陽，預設緯度、赤緯：相連高潮相隔 ' + hs.filter(e => e.data.gap).map(e => hm(e.data.gap)).join('、'));
  const hs2 = highEvs({ sun: false, lat: 40, dec: -20, psi: 100 }, 3);
  expect(5, hs2, true, '緯度 40°、赤緯 −20°：' + hs2.filter(e => e.data.gap).map(e => hm(e.data.gap)).join('、') + '（與緯度、赤緯無關）');
  const spring = highEvs({ psi: 0 }, 1.1), neap = highEvs({ psi: 90 }, 1.1);
  expect(5, spring.concat(neap), false, '有太陽：大潮時 ' + hm(spring[1].data.gap) + '、小潮時 ' + hm(neap[1].data.gap));
}
// 6 一高一低
{
  const hs = highEvs({ sun: false, lat: 23.5, dec: 20 }, 2);
  expect(6, hs, true, '關掉太陽，緯度 23.5°、赤緯 20°：相連高潮差 ' + hs.filter(e => e.data.dh != null).map(e => cm(Math.abs(e.data.dh))).join('、') + '，高潮最低 ' + cm(Math.min.apply(null, hs.map(e => e.data.h))));
  const hs2 = highEvs({ lat: 23.5, dec: 25 }, 2);
  expect(6, hs2, true, '有太陽，緯度 23.5°、赤緯 25°：' + hs2.filter(e => e.data.dh != null).map(e => cm(Math.abs(e.data.dh))).join('、'));
  expect('h2', hs.concat(hs2), false, '上面兩個任務 6 的達成例都不會順便完成隱藏 h2（兩次高潮都在平均海面以上）');
  expect(6, highEvs({ sun: false, lat: 0, dec: 25 }, 2), false, '赤道上沒有日潮不等');
  const old = highEvs({ sun: false, lat: 30, dec: 25 }, 2);
  expect(6, old, false, '試玩回報 C17 的做法（關掉太陽，緯度 30°、赤緯 25°）：第二次高潮 ' + cm(Math.min.apply(null, old.map(e => e.data.h))) + '，不在平均海面以上，不算');
  expect(6, highEvs({ sun: false, lat: 50, dec: 25 }, 2), false, '緯度 50°：差很大，但第二次高潮在平均海面以下');
}
// 7 赤道的公平
{
  const hs = highEvs({ sun: false, lat: 0, dec: 25 }, 2);
  expect(7, hs, true, '關掉太陽，緯度 0°、赤緯 25°：差 ' + hs.filter(e => e.data.dh != null).map(e => cm(Math.abs(e.data.dh))).join('、'));
  const sp = highEvs({ lat: 0, dec: 25, psi: 0 }, 1.1);
  expect(7, sp, true, '有太陽、大潮時（ψ = 0°）緯度 0°：差 ' + sp.filter(e => e.data.dh != null).map(e => (Math.abs(e.data.dh) * 1000).toFixed(1) + ' mm').join('、'));
  expect(7, highEvs({ sun: false, lat: 2, dec: 25 }, 2), false, '緯度 2°：差 ' + cm(Math.abs(highEvs({ sun: false, lat: 2, dec: 25 }, 2)[1].data.dh)));
  expect(7, highEvs({ sun: false, lat: 0, dec: 15 }, 2), false, '赤緯只有 15°');
}
// 8 一天只漲一次
{
  const hs = highEvs({ sun: false, lat: 70, dec: 25 }, 3);
  expect(8, hs, true, '關掉太陽，緯度 70°、赤緯 25°（φ + δ > 90°）：相隔 ' + hs.filter(e => e.data.gap).map(e => hm(e.data.gap)).join('、'));
  const hs2 = highEvs({ lat: -65, dec: -28.6 }, 3);
  expect(8, hs2, true, '有太陽，南緯 65°、赤緯 −28.6°：相隔 ' + hs2.filter(e => e.data.gap).map(e => hm(e.data.gap)).join('、'));
  expect(8, highEvs({ sun: false, lat: 55, dec: 25 }, 3), false, '緯度 55°、赤緯 25°（φ + δ < 90°）');
}
// 9 最高的大潮
{
  const hs = highEvs({ lat: 0, dec: 0, psi: 0 }, 1);
  expect(9, hs, true, '緯度 0°、赤緯 0°、新月：高潮 ' + hs.map(e => cm(e.data.h)).join('、') + '（理論最大 ' + cm(K.H_MOON + K.H_SUN) + '）');
  const hs2 = highEvs({ lat: 8, dec: 5, psi: 180 }, 1);
  expect(9, hs2, true, '緯度 8°、赤緯 5°、滿月：' + hs2.map(e => cm(e.data.h)).join('、'));
  expect(9, highEvs({ lat: 23.5, dec: 10, psi: 0 }, 2), false, '預設緯度與赤緯的大潮：最高 ' + cm(Math.max.apply(null, highEvs({ lat: 23.5, dec: 10, psi: 0 }, 2).map(e => e.data.h))));
  expect(9, highEvs({ lat: 23.5, dec: 10, psi: 0, dist: 0.8 }, 1), false, '把月球拉近到 0.8 倍不算');
}
// 10 引潮力加倍
expect(10, [stateEv({ dist: 0.794 })], true, '月地距離打字輸入 0.794 → 1/d³ = ' + (1 / Math.pow(0.794, 3)).toFixed(4) + '（理論 2^(−1/3) = ' + Math.pow(2, -1 / 3).toFixed(4) + '）');
expect(10, [stateEv({ dist: 0.79 }), stateEv({ dist: 0.8 })], false, '滑桿的 0.79、0.80（' + (1 / Math.pow(0.79, 3)).toFixed(3) + '、' + (1 / Math.pow(0.8, 3)).toFixed(3) + '）');
expect(10, [stateEv({ dist: 0.5 })], false, '只把距離減半（8 倍）');
// 11 隆起消失
{
  const dSol = Math.pow(K.H_MOON / K.H_SUN, 1 / 3);
  expect(11, [stateEv({ dec: 0, psi: 90, dist: 1.3 })], true, 'δ = 0、ψ = 90°、距離 1.30 倍：赤道潮差 ' + cm(K.equatorRange({ dec: 0, dist: 1.3, sun: true }, 90)) + '（理論 d = (H☾/H☉)^(1/3) = ' + dSol.toFixed(4) + '）');
  expect(11, [stateEv({ dec: 0, psi: 270, dist: 1.296 })], true, 'δ = 0、ψ = 270°、1.296 倍：' + cm(K.equatorRange({ dec: 0, dist: 1.296, sun: true }, 270)));
  const d2 = dSol * Math.pow(Math.cos(15 * DEG), 2 / 3);
  expect(11, [stateEv({ dec: 15, psi: 90, dist: Math.round(d2 * 1000) / 1000 })], false, 'δ = 15° 時距離改成 ' + d2.toFixed(3) + ' 倍也會抵消，但月球不在天赤道上，不算：' + cm(K.equatorRange({ dec: 15, dist: Math.round(d2 * 1000) / 1000, sun: true }, 90)));
  let w = 0; while (K.equatorRange({ dec: 0, dist: 1.296, sun: true }, 90 + w + 0.01) < 0.01) w += 0.01;
  console.log('      容許範圍：ψ 在 90° ± ' + w.toFixed(2) + '° 之內（1.296 倍）；滑桿每格 1°');
  expect(11, [stateEv({ dec: 0, psi: 90, dist: 1 })], false, '真實距離的小潮：' + cm(K.equatorRange({ dec: 0, dist: 1, sun: true }, 90)));
  expect(11, [stateEv({ dec: 0, psi: 90, dist: 1.3, sun: false })], false, '關掉太陽');
  const d3 = Math.round(dSol * Math.pow(Math.cos(28.6 * DEG), 2 / 3) * 100) / 100;
  expect(11, [stateEv({ dec: -28.6, psi: 270, dist: d3 })], false, '舊版的誤觸：赤緯拉到最小 −28.6°、小潮、距離 ' + d3 + ' 倍：' + cm(K.equatorRange({ dec: -28.6, dist: d3, sun: true }, 270)));
  expect(11, [stateEv({ dec: 0.3, psi: 90, dist: 1.3 })], true, '赤緯 0.3° 還算：' + cm(K.equatorRange({ dec: 0.3, dist: 1.3, sun: true }, 90)));
}
// h1 永遠不來的潮
{
  expect('h1', [stateEv({ lat: 90 })], true, '北極：今日潮差 ' + (stateEv({ lat: 90 }).data.range * 1000).toFixed(3) + ' mm');
  expect('h1', [stateEv({ lat: -90, dec: -28.6, psi: 0 })], true, '南極、赤緯 −28.6°、大潮：' + (stateEv({ lat: -90, dec: -28.6, psi: 0 }).data.range * 1000).toFixed(3) + ' mm');
  expect('h1', [stateEv({ lat: 85 })], false, '緯度 85°：' + cm(stateEv({ lat: 85 }).data.range));
  expect('h1', [stateEv({})], false, '預設：' + cm(stateEv({}).data.range));
}
// h2 低於平均海面的高潮
{
  const hs = highEvs({ sun: false, lat: 70, dec: 0 }, 1);
  expect('h2', hs, true, '關掉太陽，緯度 70°、赤緯 0°：高潮 ' + hs.map(e => cm(e.data.h)).join('、'));
  const hs2 = highEvs({ lat: 65, dec: 2, psi: 90 }, 1);
  expect('h2', hs2, true, '有太陽、小潮，緯度 65°、赤緯 2°：' + hs2.map(e => cm(e.data.h)).join('、'));
  expect('h2', highEvs({ lat: 40, dec: 0 }, 2), false, '緯度 40°');
}
// h3 月亮在地平線下時的高潮比較高
{
  const hs = highEvs({ sun: false, lat: 45, dec: -25 }, 2);
  expect('h3', hs, true, '關掉太陽，緯度 45°、赤緯 −25°：' + hs.map(e => cm(e.data.h) + '（月高 ' + e.data.moonAlt.toFixed(0) + '°）').join('、'));
  const hs2 = highEvs({ lat: 23.5, dec: -20 }, 2);
  expect('h3', hs2, false, '有太陽不算（舊版會觸發），緯度 23.5°、赤緯 −20°：' + hs2.map(e => cm(e.data.h) + '（月高 ' + e.data.moonAlt.toFixed(0) + '°）').join('、'));
  expect('h3', highEvs({ sun: false, lat: 30, dec: 25 }, 2), false, '緯度與赤緯同號：月在地平線上時那次比較高');
  const hs3 = highEvs({ sun: false, lat: 30, dec: -15 }, 2);
  expect('h3', hs3, false, '關掉太陽，緯度 30°、赤緯 −15°：差不到 40 cm：' + hs3.map(e => cm(e.data.h)).join('、'));
  expect('h3', highEvs({ sun: false, lat: 45, dec: -25, dist: 0.8 }, 2), false, '月地距離不是真實值（0.8 倍）不算');
  const hs4 = highEvs({ sun: false, lat: 23.5, dec: -28.6 }, 2);
  expect('h3', hs4, false, '舊版的誤觸：關掉太陽、預設緯度 23.5°、赤緯拉到最小：' + hs4.map(e => cm(e.data.h)).join('、'));
}

// ---------- 新增的隱藏任務 h4–h10（11/13，隱藏任務補到 10 個） ----------
const ach = {};   // 每個隱藏任務的達成例（用來證明彼此不連帶完成）
// h4 引力加倍：距離 1/√2
{
  const e = [stateEv({ dist: 0.7071 })];
  ach.h4 = e;
  expect('h4', e, true, '距離打 0.7071 倍：引力 ' + (1 / 0.7071 / 0.7071).toFixed(3) + ' 倍、引潮力 ' + (1 / Math.pow(0.7071, 3)).toFixed(3) + ' 倍');
  expect('h4', [stateEv({ dist: 0.71 })], false, '滑桿最近的格子 0.71 倍碰不到（要打字）');
  expect('h4', [stateEv({ dist: 0.794 })], false, '任務 10 的距離（引潮力 2 倍）不算');
}
// h5 近地點大潮
{
  const e = [stateEv({ dist: 0.945, psi: 0 })];
  ach.h5 = e;
  expect('h5', e, true, '近地點 0.945 倍、新月');
  expect('h5', [stateEv({ dist: 0.945, psi: 181.5 })], true, '近地點、滿月附近 181.5°');
  expect('h5', [stateEv({ dist: 0.95, psi: 0 })], false, '滑桿格子 0.95 倍碰不到（要打 0.945）');
  expect('h5', [stateEv({ dist: 0.945, psi: 90 })], false, '近地點但小潮');
  expect('h5', [stateEv({ dist: 0.945, psi: 0, sun: false })], false, '關掉太陽');
}
// h6 月亮在天頂時的高潮
{
  const hs = highEvs({ sun: false, lat: 20, dec: 20 }, 2);
  ach.h6 = hs;
  expect('h6', hs, true, '關掉太陽，緯度 = 赤緯 = 20°：高潮時月高 ' + hs.map(e => e.data.moonAlt.toFixed(2) + '°').join('、'));
  expect('h6', highEvs({ sun: false, lat: 21, dec: 20 }, 2), false, '差 1°：月高最多 89°');
  const hs2 = highEvs({ lat: 20, dec: 20 }, 2);
  expect('h6', hs2, false, '有太陽不算，高潮時月高 ' + hs2.map(e => e.data.moonAlt.toFixed(1) + '°').join('、'));
}
// h7 兩邊一樣大、站在同一邊
{
  const d = Math.pow(K.H_MOON / K.H_SUN, 1 / 3);
  const e = [stateEv({ dist: 1.296, psi: 180 })];
  ach.h7 = e;
  expect('h7', e, true, '距離 1.296 倍（理論 ' + d.toFixed(4) + '）、滿月：月球與太陽的引潮力相等');
  expect('h7', [stateEv({ dist: 1.3, psi: 0 })], false, '滑桿格子 1.30 倍碰不到');
  expect('h7', [stateEv({ dist: 1.296, psi: 90 })], false, '同樣距離但在小潮（那是任務 11）');
  expect(11, e, false, '這個達成例不會完成任務 11（大潮時赤道潮差 ' + cm(e[0].data.eqRange) + '）');
}
// h8、h9 大潮與小潮的潮差比
function sn(o) { return [stateEv(Object.assign({ lat: 0, dec: 0, psi: 0 }, o)), stateEv(Object.assign({ lat: 0, dec: 0, psi: 90 }, o))]; }
const rat = ev => (ev[0].data.range / ev[1].data.range).toFixed(3);
{
  const e = sn({ dist: 1.1 });
  ach.h8 = e;
  expect('h8', e, true, '赤道、赤緯 0°、距離 1.10 倍：大潮 ÷ 小潮 = ' + rat(e));
  const e2 = sn({ dist: 1.09 });
  expect('h8', e2, false, '1.09 倍：' + rat(e2));
  const e3 = [stateEv({ lat: 0, dec: 0, psi: 0, dist: 1.1 }), stateEv({ lat: 0, dec: 0, psi: 90, dist: 1.2 })];
  expect('h8', e3, false, '大潮、小潮在不同距離量的不算');
  const e4 = sn({ dist: 1.1, lat: 23.5 });
  expect('h8', e4, false, '不在赤道（緯度 23.5°）不算');
}
{
  const e = sn({ dist: 1 });
  ach.h9 = e;
  expect('h9', e, true, '赤道、赤緯 0°、真實距離：大潮 ÷ 小潮 = ' + rat(e) + '（大潮 ' + cm(e[0].data.range) + '、小潮 ' + cm(e[1].data.range) + '）');
  expect('h9', sn({ dist: 1.1 }), false, '距離 1.10 倍（那是 h8）');
  expect('h9', [stateEv({ lat: 0, dec: 0, psi: 0 })], false, '只量了大潮');
  expect('h9', sn({ dist: 1, sun: false }), false, '關掉太陽：沒有大小潮');
}
// h10 日潮不等南北顛倒
{
  const n = highEvs({ lat: 23.5, dec: 20 }, 2), so = highEvs({ lat: -23.5, dec: 20 }, 2);
  ach.h10 = n.concat(so);
  const show = hs => hs.map(e => cm(e.data.h) + '（月高 ' + e.data.moonAlt.toFixed(0) + '°）').join('、');
  expect('h10', ach.h10, true, '有太陽、赤緯 20°：北緯 23.5° ' + show(n) + '；南緯 23.5° ' + show(so));
  expect('h10', n, false, '只做北半球');
  expect('h10', n.concat(highEvs({ lat: -30, dec: 20 }, 2)), false, '南北緯度不對稱（23.5° 與 −30°）');
  expect('h10', highEvs({ sun: false, lat: 23.5, dec: 20 }, 2).concat(highEvs({ sun: false, lat: -23.5, dec: 20 }, 2)), false, '關掉太陽不算（避免和 h3 連帶）');
  expect('h3', ach.h10, false, '這個達成例不會完成 h3');
  expect('h2', ach.h10, false, '也不會完成 h2（四次高潮都在平均海面以上）');
}
// 新的隱藏任務：預設狀態與預設參數播放 30 天都不觸發
{
  const evs = [stateEv({})].concat(highEvs({}, 30));
  ['h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10'].forEach(id => expect(id, evs, false, '預設狀態與預設參數播放 30 天'));
}
// 彼此不連帶完成：每個隱藏任務的達成例，不會讓其他隱藏任務成立
{
  ach.h1 = [stateEv({ lat: 90 })]; ach.h2 = highEvs({ sun: false, lat: 70, dec: 0 }, 1); ach.h3 = highEvs({ sun: false, lat: 45, dec: -25 }, 2);
  const ids = Object.keys(ach);
  ids.forEach(a => {
    // 已知例外（已上線的判定不改）：h3 要「月在地平線下那次高 40 cm 以上」，只開月球時另一次高潮必然在平均海面以下，
    // 所以 h3 一定伴隨 h2（逐一試過緯度 0–90°、赤緯 0 至 −28.6° 都找不到反例）。新的 h4–h10 都沒有這種情形。
    const KNOWN = { h3: ['h2'] };
    const hit = ids.filter(b => b !== a && !(KNOWN[a] || []).includes(b) && (() => { const m = byId(b); m.mem = {}; return ach[a].some(e => m.check(e, m.mem)); })());
    if (hit.length) { fail++; console.log('  ✗ ' + a + ' 的達成例也完成了 ' + hit.join('、')); }
    else console.log('  ✓ ' + a + ' 的達成例不會順便完成別的隱藏任務');
  });
}

let stars = 0, hidden = 0;
missions.forEach(m => { if (m.hidden) hidden += m.level * 2; else stars += m.level; });
console.log('\n任務 ' + missions.filter(m => !m.hidden).length + ' 個（' + stars + ' 顆星）＋ 隱藏 ' + missions.filter(m => m.hidden).length + ' 個（等級 × 2 共 ' + hidden + ' 顆星）');
console.log(fail ? '有 ' + fail + ' 項失敗' : '全部通過');
process.exitCode = fail ? 1 : 0;
