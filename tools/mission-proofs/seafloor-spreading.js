/* 任務可達成的證明腳本。用法：node tools/mission-proofs/seafloor-spreading.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、不該觸發的不會觸發。
 * 事件內容與 js/seafloor-spreading.js 的 snapshot() 相同，全部由 js/seafloor-spreading-core.js 計算（剖面取 520 點、畫到 8.6 Ma）。
 * 滑桿可打字的精度：半擴張速率 0.01 cm/yr、磁力計深度 0.01 km、時間 0.001 Ma（seafloor-spreading.html 的 data-decimals）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/seafloor-spreading-core.js');
const missions = [];
global.window = { SeafloorCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/seafloor-spreading.js');
const byId = id => missions.find(m => m.id === 'seafloor-spreading-' + id);

/** 頁面狀態：預設值與 seafloor-spreading.html 相同 */
function snap(o) {
  const s = Object.assign({ uL: 2.5, uR: 2.5, zs: 0, tau: 0, cx: 0, playing: false, mystery: false, dragging: false }, o);
  if (o && o.u != null) { s.uL = s.uR = o.u; }
  const P = { uL: s.uL, uR: s.uR, tau: s.tau, zs: s.zs };
  const R = s.mystery ? 400 : 8.6 * Math.max(s.uL, s.uR) * K.KM_PER_MA, n = 520, xs = [];
  for (let i = 0; i <= n; i++) xs.push(-R + 2 * R * i / n);
  const B = K.profile(P, xs, R * 1.04).B, c = K.crustAt(P, s.cx);
  let Bmax = -Infinity; for (const b of B) Bmax = Math.max(Bmax, b);
  return { uL: s.uL, uR: s.uR, sym: s.uL === s.uR, zs: s.zs, tau: s.tau, playing: s.playing, mystery: s.mystery, dragging: s.dragging,
    cx: s.cx, cAge: c.age, cBorn: c.born, cPol: c.pol, cIn: c.inRecord, cDepth: K.depth(c.age), cHeat: K.heatFlow(c.age),
    bmL: K.namedAt(P, 'brunhes', -1)[1], bmR: K.namedAt(P, 'brunhes', 1)[1], Bmax: Bmax,
    ja: K.resolved(P, 0.988, 1.072, 30, 1), cobb: K.resolved(P, 1.173, 1.185, 20, 1), R: R };
}
const ev = o => ({ type: 'state', data: snap(o) });
let ok = 0, bad = 0;
function expect(name, cond) { if (cond) { ok++; console.log('  ✓ ' + name); } else { bad++; console.error('  ✗ ' + name); process.exitCode = 1; } }
const f1 = v => v.toFixed(1), f0 = v => v.toFixed(0), f2 = v => v.toFixed(2), f3 = v => v.toFixed(3);
let d;

console.log('seafloor-spreading 任務證明');
// 1
expect('1 播完錄音帶', byId('1').check({ type: 'tape', data: { uL: 2.5, uR: 2.5 } }));
expect('1 一般狀態不算', !byId('1').check(ev({})));
// 2 布容邊界：2.5 cm/yr → 0.781 × 25 = 19.525 km
expect('2 船在右邊 19.5 km（邊界 19.525 km）', byId('2').check(ev({ cx: 19.5 })));
expect('2 船在左邊 −20.3 km', byId('2').check(ev({ cx: -20.3 })));
expect('2 差 1.5 km 不算', !byId('2').check(ev({ cx: 21 })));
expect('2 過去的時間不算', !byId('2').check(ev({ cx: 19.5, tau: 0.2 })));
expect('2 船在中洋脊上不算', !byId('2').check(ev({ cx: 0, u: 0.5 })) && !byId('2').check(ev({ cx: 0.3 })));
expect('2 神秘海脊不算', !byId('2').check(ev({ cx: 19.5, mystery: true })));
// 3
d = snap({ zs: 2.0 });
expect('3 深拖 2.0 km：最大 ' + f0(d.Bmax) + ' nT', byId('3').check({ type: 'state', data: d }));
d = snap({});
expect('3 海面 ' + f0(d.Bmax) + ' nT 不算', !byId('3').check({ type: 'state', data: d }));
// 4
expect('4 停在 1.85 Ma', byId('4').check(ev({ tau: 1.85 })));
expect('4 1.75 Ma 不算', !byId('4').check(ev({ tau: 1.75 })));
expect('4 播放中經過不算', !byId('4').check(ev({ tau: 1.85, playing: true })));
// 5 3000 m → 年齡 (400/365)² = 1.201 Ma → 2.5 cm/yr 時 30.0 km
d = snap({ cx: 30 });
expect('5 30 km：水深 ' + f1(d.cDepth) + ' m、年齡 ' + f3(d.cAge) + ' Ma', byId('5').check({ type: 'state', data: d }));
d = snap({ cx: 31 });
expect('5 31 km（' + f1(d.cDepth) + ' m）不算', !byId('5').check({ type: 'state', data: d }));
// 6 200 mW/m² → 年齡 (510/200)² = 6.50 Ma → 162.6 km（剖面畫到 215 km）
d = snap({ cx: -162.6 });
expect('6 −162.6 km：熱流 ' + f1(d.cHeat) + '（剖面範圍 ±' + f0(d.R) + ' km）', byId('6').check({ type: 'state', data: d }));
d = snap({ cx: 150 });
expect('6 150 km（' + f1(d.cHeat) + '）不算', !byId('6').check({ type: 'state', data: d }));
expect('6 拖曳途中掃過去不算（要放開停在那裡）', !byId('6').check(ev({ cx: -162.6, dragging: true })) && !byId('5').check(ev({ cx: 30, dragging: true })) && !byId('2').check(ev({ cx: 19.5, dragging: true })));
expect('6 神秘海脊不算', !byId('6').check(ev({ cx: -162.6, mystery: true })));
// 7
d = snap({ uR: 4, uL: 2 });
expect('7 右 4、左 2 cm/yr：' + f1(d.bmR) + ' / ' + f1(d.bmL) + ' km', byId('7').check({ type: 'state', data: d }));
expect('7 右 1.5、左 3 也算', byId('7').check(ev({ uR: 1.5, uL: 3 })));
expect('7 右 3、左 2 不算', !byId('7').check(ev({ uR: 3, uL: 2 })));
expect('7 布容期還沒形成（0.8 Ma 前）不算', !byId('7').check(ev({ uR: 4, uL: 2, tau: 0.8 })));
// 8 海面上的極限：臨界約 1.21–1.25 cm/yr
expect('8 海面、右 1.25 cm/yr 看得出加拉米佑', byId('8').check(ev({ uR: 1.25, uL: 2.5 })));
expect('8 右 1.3、左右一樣 也算', byId('8').check(ev({ u: 1.3 })));
expect('8 右 1.15 看不出來', !byId('8').check(ev({ uR: 1.15, uL: 2.5 })));
expect('8 右 1.4 超過 1.3 不算', !byId('8').check(ev({ uR: 1.4, uL: 2.5 })));
expect('8 磁力計不在海面不算', !byId('8').check(ev({ u: 1.25, zs: 0.5 })));
// 9 慢速脊
expect('9 0.95 cm/yr、深拖 1.5 km', byId('9').check(ev({ u: 0.95, zs: 1.5 })));
expect('9 0.9 cm/yr、深拖 1.0 km', byId('9').check(ev({ u: 0.9, zs: 1.0 })));
expect('9 海面看不出來', !byId('9').check(ev({ u: 0.95, zs: 0 })));
expect('9 1.05 cm/yr 不算', !byId('9').check(ev({ u: 1.05, zs: 1.5 })));
// 10、11
expect('10 誤差 4%', byId('10').check({ type: 'guess', data: { u: 3, g: 3.12, err: 0.04 } }));
expect('10 誤差 6% 不算', !byId('10').check({ type: 'guess', data: { u: 3, g: 3.18, err: 0.06 } }));
expect('11 誤差 0.8%', byId('11').check({ type: 'guess', data: { u: 5, g: 5.04, err: 0.008 } }));
expect('11 誤差 2% 不算', !byId('11').check({ type: 'guess', data: { u: 5, g: 5.1, err: 0.02 } }));
// 神秘海脊真的量得到 1%：布容邊界的位置 = 0.781 × u × 10 km；船的位置可以 0.1 km 為單位讀，在 1 cm/yr 時 0.781 × 10 = 7.81 km，0.1 km ≈ 1.3%
// 所以要用更遠的邊界：高斯／松山邊界 2.581 Ma（1 cm/yr 時 25.8 km，0.1 km ≈ 0.4%）
{
  const u = 1, P = { uL: u, uR: u, tau: 0, zs: 0 }, x = 2.581 * u * 10, xs = [];
  for (let i = 0; i <= 520; i++) xs.push(-400 + 800 * i / 520);
  const read = Math.round(x * 10) / 10;
  expect('11 最慢的 1 cm/yr：高斯／松山邊界 ' + f2(x) + ' km，讀到 0.1 km 的誤差 ' + f2(Math.abs(read / 25.81 - u) / u * 100) + '%', Math.abs(read / 25.81 - u) / u <= 0.01);
}
// 隱藏 1：錄音帶的第一個字 = 年表最老的 8.0–8.108 Ma（剖面畫到 8.6 Ma，拖到最邊緣不算）
d = snap({ cx: 201.25 });
expect('h1 201.25 km：形成於 ' + f3(d.cBorn) + ' Ma 前', missions.find(m => m.id === 'seafloor-spreading-h1').check({ type: 'state', data: d }));
d = snap({ cx: 215 });
expect('h1 拖到最邊緣（' + f3(d.cBorn) + ' Ma，年表外）不算', !missions.find(m => m.id === 'seafloor-spreading-h1').check({ type: 'state', data: d }));
expect('h1 回到 8 Ma 前、船在中洋脊上不算', !missions.find(m => m.id === 'seafloor-spreading-h1').check(ev({ tau: 8 })));
d = snap({ cx: 190 });
expect('h1 190 km（' + f3(d.cBorn) + ' Ma）不算', !missions.find(m => m.id === 'seafloor-spreading-h1').check({ type: 'state', data: d }));
// 隱藏 2：慢速脊的卡布山
const h2 = missions.find(m => m.id === 'seafloor-spreading-h2');
expect('h2 1.2 cm/yr、深拖 2.3 km', h2.check(ev({ u: 1.2, zs: 2.3 })));
expect('h2 1.0 cm/yr、深拖 2.5 km', h2.check(ev({ u: 1.0, zs: 2.5 })));
expect('h2 1.2 cm/yr、深拖 1.5 km 看不出來', !h2.check(ev({ u: 1.2, zs: 1.5 })));
expect('h2 2 cm/yr 不算', !h2.check(ev({ u: 2, zs: 2.5 })));
// 隱藏 3
const h3 = missions.find(m => m.id === 'seafloor-spreading-h3');
expect('h3 停在 0.781 Ma', h3.check(ev({ tau: 0.781 })));
expect('h3 停在 4.300 Ma', h3.check(ev({ tau: 4.3 })));
expect('h3 0.785 Ma 不算', !h3.check(ev({ tau: 0.785 })));
expect('h3 播放中不算', !h3.check(ev({ tau: 0.781, playing: true })));
expect('h3 現在（0 Ma）不算', !h3.check(ev({ tau: 0 })));
// 亂按：滑桿都在極端值時，需要「剛好」的任務都不會觸發
{
  const hit = new Set();
  for (const uR of [0.5, 8]) for (const uL of [0.5, 8]) for (const zs of [0, 2.5]) for (const tau of [0, 8]) for (const cx of [-1e9, 0, 1e9]) {
    const R = 8.6 * Math.max(uL, uR) * 10;
    const e = ev({ uR, uL, zs, tau, cx: Math.max(-R, Math.min(R, cx)) });
    for (const id of ['2', '5', '6', '7', '8', '9', 'h1', 'h2', 'h3']) if (missions.find(m => m.id === 'seafloor-spreading-' + id).check(e)) hit.add(id);
  }
  expect('滑桿全在極端值（64 種組合）：' + (hit.size ? '觸發了 ' + [...hit].join('、') : '精確任務都沒有觸發'), hit.size === 0);
}

const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
console.log(`\n公開 ${pub.length} 個（${pub.reduce((s, m) => s + m.level, 0)} 顆星），隱藏 ${hid.length} 個（等級 × 2 共 ${hid.reduce((s, m) => s + 2 * m.level, 0)} 顆星），合計 ${pub.reduce((s, m) => s + m.level, 0) + hid.reduce((s, m) => s + 2 * m.level, 0)} 顆`);
console.log(`${ok} 項通過${bad ? '、' + bad + ' 項失敗' : ''}`);
