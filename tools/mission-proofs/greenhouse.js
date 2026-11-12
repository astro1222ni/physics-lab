/* 任務可達成的證明腳本。用法：node tools/mission-proofs/greenhouse.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、不該觸發的不會觸發。
 * 事件 'state' 的內容與 js/greenhouse.js 的 snapshot() 相同，全部由 js/greenhouse-core.js 計算；
 * 時間積分與 js/greenhouse.js 的 integrate（每步 0.05 年 RK4）、jump（積分到 |N| < 10⁻⁴ 且離平衡 0.001 K）相同。
 * 滑桿可打字的精度：太陽 0.01%、CO₂ 0.1 ppm、ε₀ 0.001、反照率 0.001（greenhouse.html 的 data-decimals）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/greenhouse-core.js');
const missions = [];
global.window = { GreenhouseCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/greenhouse.js');
const byId = id => missions.find(m => m.id === 'greenhouse-' + id);

const SNOW = 0.95, EQ_N = 0.05, DEF_EPS = 0.779;
/** 模擬頁面：滑桿值（與 readSliders 相同的換算）、溫度、路徑 */
function page(o) {
  const s = Object.assign({ sun: 100, co2: 280, eps: DEF_EPS, alb: 0.3, wv: false, ice: false, T: 288 }, o);
  s.t = 0; s.pathMax = s.pathMin = s.T; s.wasSnow = false;
  s.P = function () { return { S: s.sun / 100, co2: s.co2, eps0: Math.abs(s.eps - DEF_EPS) < 1e-9 ? K.EPS0 : s.eps, alpha0: s.alb, wv: s.wv, ice: s.ice }; };
  s.track = function () {
    s.pathMax = Math.max(s.pathMax, s.T); s.pathMin = Math.min(s.pathMin, s.T);
    const P = s.P(); if (P.ice && K.iceFraction(P, s.T) >= SNOW) s.wasSnow = true;
  };
  s.wasSnow = (function () { const P = s.P(); return P.ice && K.iceFraction(P, s.T) >= SNOW; })();
  return s;
}
function snapshot(s) {
  const P = s.P(), f = K.flows(P, s.T), Teq = K.settle(P, s.T), base = K.baseline(P);
  return {
    S: s.sun, co2: s.co2, eps0: P.eps0, alpha0: s.alb, wv: s.wv, ice: s.ice, T: s.T, N: f.N, Teq: Teq, base: base,
    dT: base != null ? s.T - base : null, dTeq: base != null && Teq != null ? Teq - base : null,
    eq: Math.abs(f.N) < EQ_N && Teq != null && Math.abs(Teq - s.T) < 0.05, eps: f.eps, alpha: f.alpha,
    iceFrac: K.iceFraction(P, s.T), iceLat: K.iceLatitude(P, s.T), snow: P.ice && K.iceFraction(P, s.T) >= SNOW,
    t: s.t, pathMax: s.pathMax, pathMin: s.pathMin, wasSnow: s.wasSnow
  };
}
function jump(s) {
  const P = s.P(), Teq = K.settle(P, s.T);
  let guard = 0;
  while (guard++ < 60000) {
    if (Math.abs(K.imbalance(P, s.T)) < 1e-4 && Math.abs(s.T - Teq) < 1e-3) break;
    s.T = K.step(P, s.T, 0.05 * K.YEAR); s.t += 0.05; s.track();
  }
  return s;
}
function play(s, years) { const P = s.P(); for (let t = 0; t < years - 1e-9; t += 0.05) { s.T = K.step(P, s.T, 0.05 * K.YEAR); s.t += 0.05; s.track(); } return s; }
function setTemp(s, T) { s.T = T; s.pathMax = s.pathMin = T; const P = s.P(); s.wasSnow = P.ice && K.iceFraction(P, T) >= SNOW; return s; }
const ev = s => ({ type: 'state', data: snapshot(s) });
const hits = (id, s) => byId(id).check(ev(s));

let ok = 0, bad = 0;
function expect(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label + (extra ? '（' + extra + '）' : '')); }
  else { bad++; console.error('  ✗ ' + label + (extra ? '（' + extra + '）' : '')); }
}
const f2 = v => v == null ? '—' : v.toFixed(2);

console.log('greenhouse 任務證明');
// 1 沒有大氣
let s = jump(page({ eps: 0 }));
expect('1 ε₀ = 0 → 平衡 ' + f2(s.T) + ' K', hits('1', s));
expect('1 不在平衡（剛調好還沒走）不算', !hits('1', page({ eps: 0 })));
// 2 瞬間強迫
s = page({ co2: 560 });
expect('2 按「加倍 560」：N = ' + f2(snapshot(s).N), hits('2', s));
expect('2 只到 423 ppm 不算', !hits('2', page({ co2: 423 })));
expect('2 已經暖到平衡後不算', !hits('2', jump(page({ co2: 560 }))));
// 3 普朗克
s = jump(page({ co2: 560 }));
expect('3 不開回饋、加倍：暖 ' + f2(snapshot(s).dT) + ' K，經過 ' + s.t.toFixed(1) + ' 年', hits('3', s));
expect('3 開了水氣回饋不算', !hits('3', jump(page({ co2: 560, wv: true }))));
// 4 陽傘
s = jump(page({ co2: 560, alb: 0.311 }));
expect('4 α 打成 0.311 → ' + f2(s.T) + ' K', hits('4', s));
expect('4 只用滑桿 0.31 → ' + f2(jump(page({ co2: 560, alb: 0.31 })).T) + ' K 不夠準', !hits('4', jump(page({ co2: 560, alb: 0.31 }))));
// 5 水氣
s = jump(page({ co2: 560, wv: true }));
expect('5 水氣回饋：暖 ' + f2(snapshot(s).dT) + ' K', hits('5', s));
// 6 兩種回饋
s = jump(page({ co2: 560, wv: true, ice: true }));
expect('6 兩種回饋：暖 ' + f2(snapshot(s).dT) + ' K', hits('6', s));
expect('6 冰回饋沒開不算', !hits('6', jump(page({ co2: 560, wv: true }))));
// 7 1.5 °C（CO₂ 滑桿每格 5 ppm）
let found = [];
for (let c = 280; c <= 600; c += 5) { const p = jump(page({ co2: c, wv: true, ice: true })); if (hits('7', p)) found.push(c + '（' + f2(snapshot(p).dT) + '）'); }
expect('7 滑桿上做得到的 CO₂：' + found.join('、'), found.length >= 1);
expect('7 還沒到平衡（只播放 1 年）不算', !hits('7', play(page({ co2: 400, wv: true, ice: true }), 1)));
// 8 雪球：從 288 K、太陽調暗到 95%（兩種回饋）
s = page({ wv: true, ice: true });
s.sun = 95; jump(s);
expect('8 太陽 95%、從 288 K 出發 → ' + f2(s.T) + ' K、冰 ' + (snapshot(s).iceFrac * 100).toFixed(1) + '%', hits('8', s));
expect('8 點圖直接放到 220 K 不算（沒有從溫暖的地球出發）', !hits('8', setTemp(page({ wv: true, ice: true }), 220)));
s = page({ ice: true }); s.sun = 86; jump(s);
expect('8 只開冰回饋、太陽 86% → ' + f2(s.T) + ' K 是雪球，但不算（要兩種回饋、太陽不低於 95%）', !hits('8', s));
s = page({ wv: true, ice: true }); s.sun = 95.5; jump(s);
expect('8 太陽 95.5%（滑桿一格）也做得到 → ' + f2(s.T) + ' K', hits('8', s));
s = page({ wv: true, ice: true }); s.sun = 96; jump(s);
expect('8 太陽 96%：還在臨界點上面，不會結冰 → ' + f2(s.T) + ' K', !hits('8', s));
s = page({ wv: true, ice: true }); s.sun = 70; jump(s);
expect('8 太陽拉到最小 70% 不算（暗太多）→ ' + f2(s.T) + ' K', !hits('8', s));
s = page({ wv: true, ice: true, co2: 100 }); jump(s);
expect('8 CO2 拉到最小 100 ppm 不算 → ' + f2(s.T) + ' K', !hits('8', s));
s = page({ wv: true, ice: true }); s.eps = 0.5; jump(s);
expect('8 改 ε0 讓地球變冷不算 → ' + f2(s.T) + ' K', !hits('8', s));
// 9 回不去了
s = page({ wv: true, ice: true }); s.sun = 95; jump(s); s.sun = 100; jump(s);
expect('9 太陽調回 100% → 仍是 ' + f2(s.T) + ' K', hits('9', s));
s = page({ ice: true }); s.sun = 86; jump(s); s.sun = 100; jump(s);
expect('9 只開冰回饋也一樣 → ' + f2(s.T) + ' K', hits('9', s));
expect('9 沒有先從溫暖出發不算', !hits('9', jump(setTemp(page({ ice: true }), 230))));
// 10 用 CO₂ 融化雪球（不開水氣回饋）
s = page({ ice: true }); s.sun = 86; jump(s); s.sun = 100; jump(s);
s.co2 = 950; jump(s);
expect('10 CO₂ 950 ppm 融化 → ' + f2(s.T) + ' K，花了 ' + s.t.toFixed(0) + ' 年', hits('10', s));
s = page({ ice: true }); s.sun = 86; jump(s); s.sun = 100; jump(s); s.co2 = 900; jump(s);
expect('10 900 ppm 還不夠 → ' + f2(s.T) + ' K', !hits('10', s));
s = page({ wv: true, ice: true }); s.sun = 95; jump(s); s.sun = 100; jump(s); s.co2 = 2000; jump(s);
expect('10 開水氣回饋時 2000 ppm 也融不掉 → ' + f2(s.T) + ' K', !hits('10', s));
expect('10 點圖直接放到 290 K 不算', !hits('10', jump(setTemp(page({ ice: true, co2: 950 }), 290))));
// 11 年輕太陽
s = page({ ice: true, eps: 0.95 }); s.sun = 75; jump(s);
expect('11 先把 ε₀ 調到 0.95 再調暗太陽 → ' + f2(s.T) + ' K', hits('11', s));
s = page({ ice: true }); s.sun = 75; jump(s); s.eps = 1; jump(s);
expect('11 先結冰再加溫室氣體：' + f2(s.T) + ' K，回不來（遲滯）', !hits('11', s));
setTemp(s, 290); jump(s);
expect('11 但點能量平衡圖把它放回溫暖 → ' + f2(s.T) + ' K', hits('11', s));
s = page({ ice: true, co2: 2000 }); s.sun = 75; jump(s);
expect('11 只靠 CO₂ 2000 ppm 不夠 → ' + f2(s.T) + ' K', !hits('11', s));

// 隱藏任務
s = jump(page({ alb: 0, eps: 1 }));
expect('h1 α = 0、ε₀ = 1 → ' + f2(s.T) + ' K', hits('h1', s));
expect('h1 α = 0.01 不算', !hits('h1', jump(page({ alb: 0.01, eps: 1 }))));
s = page({ wv: true, ice: true }); s.sun = 95; jump(s); s.sun = 110; jump(s);
expect('h2 太陽 110% 仍是雪球 → ' + f2(s.T) + ' K', hits('h2', s));
s = page({ wv: true, ice: true }); s.sun = 95; jump(s); s.sun = 130; jump(s);
expect('h2 太陽 130% 就融了 → ' + f2(s.T) + ' K', !hits('h2', s));
s = page({ ice: true }); s.sun = 88.5; jump(s);
expect('h3 只開冰回饋、太陽 88.5% → 冰緣 ' + f2(snapshot(s).iceLat) + '°', hits('h3', s));
s = page({ ice: true }); s.sun = 90; jump(s);
expect('h3 太陽 90% → 冰緣 ' + f2(snapshot(s).iceLat) + '° 不算', !hits('h3', s));

// 星星
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const stars = pub.reduce((a, m) => a + m.level, 0), hstars = hid.reduce((a, m) => a + m.level * 2, 0);
console.log(`\n公開 ${pub.length} 個（${stars} 顆星），隱藏 ${hid.length} 個（等級 × 2 共 ${hstars} 顆星），合計 ${stars + hstars} 顆`);
console.log(`${ok} 項通過${bad ? '，' + bad + ' 項失敗' : ''}`);
if (bad) process.exitCode = 1;
