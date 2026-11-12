/* 任務可達成的證明腳本。用法：node tools/mission-proofs/typhoon.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、不該觸發的不會觸發。
 * 事件內容與 js/typhoon.js 的 stormData()、finish() 相同，全部由 js/typhoon-core.js 計算；
 * 颱風從測站區前方 450 km 出發、走 900 km（不動時 48 小時），每步 120 秒（與 js/typhoon.js 的 K.advance(run, …, 120, 900) 相同）。
 * 滑桿可打字的精度：中心氣壓 0.1 hPa、Rm 0.1 km、B 0.01、緯度 0.1°、移動速度 0.1 m/s、方向 1°（typhoon.html 的 data-decimals）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/typhoon-core.js');
const missions = [];
global.window = { TyphoonCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/typhoon.js');
const byId = id => missions.find(m => m.id === 'typhoon-' + id);

const PENV = 1010, START = 450e3;
/** 頁面設定：預設值與 typhoon.html 相同；st = 兩個測站在路徑右邊的距離（km，負＝左邊）或 {x, y}（km） */
function page(o) { return Object.assign({ pc: 950, rm: 40, B: 1.5, lat: 23, c: 5, hd: 300, st: [60, -60] }, o); }
function storm(p) { return { pc: p.pc, penv: PENV, Rm: p.rm * 1e3, B: p.B, lat: p.lat, c: p.c, hd: p.hd }; }
function stormData(p) {
  const s = K.summary(storm(p));
  return { pc: p.pc, Rm: p.rm, B: p.B, lat: p.lat, c: p.c, hd: p.hd, dp: s.dp, vMax: s.vMax, vSym: s.vSym, vGrad: s.vGrad,
    cls: s.cls.key, r7: s.r7 / 1e3, r10: s.r10 / 1e3, surge: s.surge * 100 };
}
function pass(p) {
  const S = storm(p), h = S.hd * K.DEG, D0 = S.c > 0 ? START : 0;
  const st = p.st.map(q => typeof q === 'number' ? { x: q * 1e3 * Math.cos(h), y: -q * 1e3 * Math.sin(h) } : { x: q.x * 1e3, y: q.y * 1e3 });
  const run = K.makeRun(S, { x: -D0 * Math.sin(h), y: -D0 * Math.cos(h) }, st);
  K.begin(run);
  const T = S.c > 0 ? 2 * START / S.c : 48 * 3600;
  K.advance(run, T, 120, 900);
  const d = stormData(p); d.t = run.t / 3600; d.st = [K.stats(run, 0), K.stats(run, 1)];
  return d;
}
const evS = p => ({ type: 'storm', data: stormData(p) });
const evP = p => ({ type: 'pass', data: pass(p) });
let ok = 0, bad = 0;
function expect(name, cond) { if (cond) { ok++; console.log('  ✓ ' + name); } else { bad++; console.error('  ✗ ' + name); process.exitCode = 1; } }
const f1 = v => v.toFixed(1), f0 = v => v.toFixed(0);
let p, d;

console.log('typhoon 任務證明');
d = stormData(page());
expect('預設：中度颱風 ' + f1(d.vMax) + ' m/s，任何「storm」任務都不算', d.cls === 'moderate' && missions.every(m => !m.check({ type: 'storm', data: d }) || m.id === 'typhoon-x'));
// 1 輕度
p = page({ pc: 985 }); d = stormData(p);
expect('1 中心氣壓 985 hPa → ' + f1(d.vMax) + ' m/s 輕度颱風', byId('1').check(evS(p)));
p = page({ pc: 1005 }); d = stormData(p);
expect('1 1005 hPa → ' + f1(d.vMax) + ' m/s 只是熱帶性低氣壓', !byId('1').check(evS(p)));
// 2 強烈
p = page({ pc: 930 }); d = stormData(p);
expect('2 930 hPa → ' + f1(d.vMax) + ' m/s 強烈颱風', byId('2').check(evS(p)));
// 3 一個順轉一個逆轉（預設就做得到：按播放）
d = pass(page());
expect('3 預設按播放：A 順轉 ' + f0(d.st[0].rot) + '°、B 逆轉 ' + f0(d.st[1].rot) + '°', byId('3').check({ type: 'pass', data: d }));
expect('3 storm 事件不算', !byId('3').check(evS(page())));
d = pass(page({ st: [250, -250] }));
expect('3 兩站離路徑 250 km：' + f0(d.st[0].rot) + '° / ' + f0(d.st[1].rot) + '° 不算', !byId('3').check({ type: 'pass', data: d }));
// 4 南半球右邊順轉
d = pass(page({ lat: -15 }));
expect('4 南緯 15°：右側 A 順轉 ' + f0(d.st[0].rot) + '°', byId('4').check({ type: 'pass', data: d }));
expect('4 北半球不算', !byId('4').check(evP(page())));
// 5 巨大的暴風圈
p = page({ pc: 940, rm: 80, B: 1 }); d = stormData(p);
expect('5 940 hPa、Rm 80 km、B 1 → 七級風半徑 ' + f0(d.r7) + ' km', byId('5').check(evS(p)));
expect('5 預設 ' + f0(stormData(page()).r7) + ' km 不算', !byId('5').check(evS(page())));
// 6 颱風眼
d = pass(page({ c: 3, st: [0, -60] }));
expect('6 移動 3 m/s、A 在路徑上 → 眼中最小 ' + f1(d.st[0].minW) + ' m/s', byId('6').check({ type: 'pass', data: d }));
d = pass(page({ c: 12, st: [0, -60] }));
expect('6 移動 12 m/s 時眼中的背景風超過 5 m/s，不算', !byId('6').check({ type: 'pass', data: d }));
// 7 剛好強颱：二分找 51.0–51.4 的中心氣壓
let lo = 920, hi = 950;
for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (stormData(page({ pc: m })).vMax > 51.2) lo = m; else hi = m; }
p = page({ pc: Math.round(lo * 10) / 10 }); d = stormData(p);
expect('7 中心氣壓 ' + p.pc + ' hPa → ' + f1(d.vMax) + ' m/s（' + d.vMax.toFixed(3) + '）', byId('7').check(evS(p)));
const win = []; for (let pc = 930; pc <= 945; pc = Math.round((pc + 0.1) * 10) / 10) if (byId('7').check(evS(page({ pc })))) win.push(pc);
expect('7 可打字精度 0.1 hPa 下有 ' + win.length + ' 個值可用（' + win[0] + '–' + win[win.length - 1] + ' hPa）', win.length >= 3);
expect('7 925 hPa（' + f1(stormData(page({ pc: 925 })).vMax) + ' m/s）不算', !byId('7').check(evS(page({ pc: 925 }))));
// 8 北半球危險半圓
d = pass(page({ c: 10 }));
expect('8 移動 10 m/s、兩站 ±60 km：右 ' + f1(d.st[0].maxW) + ' − 左 ' + f1(d.st[1].maxW) + ' = ' + f1(d.st[0].maxW - d.st[1].maxW), byId('8').check({ type: 'pass', data: d }));
d = pass(page());
expect('8 預設 5 m/s 只差 ' + f1(d.st[0].maxW - d.st[1].maxW) + '，不算', !byId('8').check({ type: 'pass', data: d }));
d = pass(page({ c: 10, st: [30, -90] }));
expect('8 兩站離路徑不一樣遠（30、90 km）不算', !byId('8').check({ type: 'pass', data: d }));
expect('8 南半球不算', !byId('8').check(evP(page({ c: 10, lat: -20 }))));
// 9 小而猛
p = page({ pc: 935, rm: 12, B: 2.5 }); d = stormData(p);
expect('9 935 hPa、Rm 12 km、B 2.5 → ' + f1(d.vMax) + ' m/s、七級風半徑 ' + f0(d.r7) + ' km', byId('9').check(evS(p)));
p = page({ pc: 930 }); d = stormData(p);
expect('9 預設形狀的強颱 ' + f0(d.r7) + ' km 不算', !byId('9').check(evS(p)));
// 10 南半球危險半圓
d = pass(page({ c: 10, lat: -20 }));
expect('10 南緯 20°、10 m/s：左 ' + f1(d.st[1].maxW) + ' − 右 ' + f1(d.st[0].maxW) + ' = ' + f1(d.st[1].maxW - d.st[0].maxW), byId('10').check({ type: 'pass', data: d }));
expect('10 北半球不算', !byId('10').check(evP(page({ c: 10 }))));
// 11 氣壓計量到中心
d = pass(page({ c: 3, st: [5, -60] }));
expect('11 測站離路徑 5 km：最低 ' + d.st[0].minP.toFixed(2) + ' hPa（中心 950）', byId('11').check({ type: 'pass', data: d }));
d = pass(page({ c: 3, st: [25, -60] }));
expect('11 離路徑 25 km：最低 ' + d.st[0].minP.toFixed(2) + ' hPa 不算', !byId('11').check({ type: 'pass', data: d }));
d = pass(page({ c: 2, st: [0, -60] }));
expect('11 移動不到 3 m/s 不算', !byId('11').check({ type: 'pass', data: d }));
// 12 17 級以上
let best = null;
[[880, 30, 2], [880, 20, 2.5], [900, 25, 2.5], [870, 40, 2]].forEach(function (q) {
  [5, 8].forEach(function (c) {
    [-20, -30, -40, 20, 30, 40].forEach(function (s) {
      const dd = pass(page({ pc: q[0], rm: q[1], B: q[2], c: c, st: [s, 200] }));
      if (byId('12').check({ type: 'pass', data: dd }) && !best) best = { q: q, c: c, s: s, d: dd };
    });
  });
});
expect('12 找得到做法：' + (best ? best.q[0] + ' hPa、Rm ' + best.q[1] + ' km、B ' + best.q[2] + '、' + best.c + ' m/s、測站 ' + best.s + ' km → ' + f1(best.d.st[0].maxW) + ' m/s、轉 ' + f0(best.d.st[0].rot) + '°' : '無'), !!best);
d = pass(page({ pc: 880, rm: 30, B: 2, st: [150, -150] }));
expect('12 測站離路徑 150 km：' + f1(d.st[0].maxW) + ' m/s 不算', !byId('12').check({ type: 'pass', data: d }));

// 隱藏任務
expect('h1 中心氣壓 870 hPa', byId('h1').check(evS(page({ pc: 870 }))));
expect('h1 870.1 hPa 不算', !byId('h1').check(evS(page({ pc: 870.1 }))));
d = pass(page({ c: 0, st: [{ x: 100, y: 0 }, { x: -300, y: 0 }] }));
expect('h2 颱風不動、跑完 ' + f1(d.t) + ' 小時，A 一直吹 ' + f1(d.st[0].maxW) + ' m/s', byId('h2').check({ type: 'pass', data: d }));
expect('h2 會動的颱風不算', !byId('h2').check(evP(page())));
p = page({ lat: 0, pc: 990 }); d = stormData(p);
expect('h3 赤道、990 hPa → ' + f1(d.vMax) + ' m/s', byId('h3').check(evS(p)));
expect('h3 緯度 0.5° 不算', !byId('h3').check(evS(page({ lat: 0.5, pc: 990 }))));
expect('h3 赤道 1004 hPa（' + f1(stormData(page({ lat: 0, pc: 1004 })).vMax) + ' m/s）不算', !byId('h3').check(evS(page({ lat: 0, pc: 1004 }))));

// 星星
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const stars = pub.reduce((a, m) => a + m.level, 0), hstars = hid.reduce((a, m) => a + m.level * 2, 0);
console.log(`\n公開 ${pub.length} 個（${stars} 顆星），隱藏 ${hid.length} 個（等級 × 2 共 ${hstars} 顆星），合計 ${stars + hstars} 顆`);
console.log(`${ok} 項通過${bad ? '，' + bad + ' 項失敗' : ''}`);
if (bad) process.exitCode = 1;
