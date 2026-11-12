/* 任務可達成的證明腳本。用法：node tools/mission-proofs/stars-hr.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、不該觸發的不會觸發。
 * 事件內容與 js/stars-hr.js 的 snapshot() 相同，全部由 js/stars-hr-core.js 計算。
 * 滑桿可打字的精度：溫度 1 K、半徑 0.0001 R☉、質量 0.001 M☉（stars-hr.html 的 data-decimals）；
 * 範圍：溫度 2000–50000 K、半徑 0.005–2000 R☉、質量 0.1–20 M☉。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/stars-hr-core.js');
const missions = [];
global.window = { StarsCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/stars-hr.js');
const byId = id => missions.find(m => m.id === 'stars-hr-' + id);

/** 頁面狀態：自由模式給 T、R；主序模式給 M */
function snap(o) {
  o = o || {};
  let s;
  if (o.M != null) { const m = K.mainSequence(o.M); s = { mode: 'ms', T: m.T, R: m.R, L: m.L, M: o.M, life: m.life }; }
  else { const T = o.T != null ? o.T : 5772, R = o.R != null ? o.R : 1; s = { mode: 'free', T: T, R: R, L: K.lumSun(R, T), M: null, life: null }; }
  const b = K.bands(s.T);
  return Object.assign(s, { peak: K.peak(s.T) * 1e9, cls: K.spectral(s.T), uv: b.uv, vis: b.vis, ir: b.ir, white: K.whiteDist(s.T),
    mbol: K.mbol(s.L), region: '', dragging: !!o.dragging, pick: '', pins: 0, spec: 'abs' });
}
const ev = o => ({ type: 'star', data: snap(o) });
let ok = 0, bad = 0;
function expect(name, cond) { if (cond) { ok++; console.log('  ✓ ' + name); } else { bad++; console.error('  ✗ ' + name); process.exitCode = 1; } }
const hit = (id, o) => byId(id).check(ev(o));
/** 在整數溫度上掃描，傳回成立的區間 [最低, 最高]（R 由 fR(T) 給，預設 1） */
function tRange(id, fR, lo, hi) {
  let a = null, b = null;
  for (let T = lo || 2000; T <= (hi || 50000); T++) if (hit(id, { T: T, R: fR ? fR(T) : 1 })) { if (a == null) a = T; b = T; }
  return [a, b];
}
const r4 = v => Math.round(v * 1e4) / 1e4;   // 半徑打字精度
const m3 = v => Math.round(v * 1e3) / 1e3;   // 質量打字精度

console.log('stars-hr 任務證明');
// 1 紅色的星
expect('1 3800 K 成立', hit('1', { T: 3800 }));
expect('1 3900 K 不算（K 型）', !hit('1', { T: 3900 }));
expect('1 拖曳途中不算', !hit('1', { T: 3000, dragging: true }));
// 2 峰值 500 nm
let r = tRange('2');
console.log('    峰值 500 ± 2 nm：' + r[0] + '–' + r[1] + ' K');
expect('2 有整數溫度可以達成（5796 K）', hit('2', { T: 5796 }));
expect('2 太陽（5772 K，峰值 502.04 nm）不算', !hit('2', { T: 5772 }));
expect('2 起始狀態不算', !byId('2').check(ev({})));
// 3 一半是紫外線（中位波長 = 380 nm）
r = tRange('3');
console.log('    紫外線 49.5%–50.5%：' + r[0] + '–' + r[1] + ' K');
expect('3 有整數溫度可以達成（約 10810 K）', hit('3', { T: 10810 }));
expect('3 20000 K 不算（太多）', !hit('3', { T: 20000 }));
expect('3 10000 K 不算', !hit('3', { T: 10000 }));
expect('3 範圍窄（< 200 K）', r[1] - r[0] < 200 && r[0] > 10500);
// 4 一樣大亮 100 倍：T = 5772 × 100^(1/4) = 18252.6 K
r = tRange('4');
console.log('    R = 1、L = 100 ± 2%：' + r[0] + '–' + r[1] + ' K');
expect('4 18253 K、R = 1 成立', hit('4', { T: 18253, R: 1 }));
expect('4 R = 1.006 不算', !hit('4', { T: 18253, R: 1.006 }));
expect('4 18500 K 不算（L 超過 2%）', !hit('4', { T: 18500, R: 1 }));
// 5 一樣熱亮 100 倍：R = 10
expect('5 5772 K、R = 10 成立', hit('5', { T: 5772, R: 10 }));
expect('5 R = 10.09 仍在 2% 內', hit('5', { T: 5772, R: 10.09 }));
expect('5 R = 10.11 不算（L = 102.2）', !hit('5', { T: 5772, R: 10.11 }));
expect('5 5810 K 不算（溫度差 0.66%）', !hit('5', { T: 5810, R: 10 }));
expect('5 和 4 不能同時成立', !(hit('4', { T: 5772, R: 10 })) && !(hit('5', { T: 18253, R: 1 })));
// 6 最大的真實恆星
const biggest = K.STARS.slice().sort((a, b) => b.R - a.R)[0];
console.log('    最大的真實恆星：' + biggest.id + '，R = ' + biggest.R.toFixed(0) + ' R☉');
expect('6 參宿四是半徑最大的那一顆', biggest.id === 'betelgeuse');
expect('6 選參宿四成立', byId('6').check({ type: 'pick', data: { id: 'betelgeuse', from: 'list' } }));
expect('6 選心宿二不算', !byId('6').check({ type: 'pick', data: { id: 'antares', from: 'chart' } }));
// 7 和地球一樣大
const RE = K.R_EARTH / K.R_SUN;
console.log('    地球半徑 = ' + RE.toFixed(6) + ' R☉；可打字的值 ' + r4(RE * 0.98) + '–' + r4(RE * 1.02));
expect('7 R = 0.0092、10000 K 成立', hit('7', { T: 10000, R: 0.0092 }));
expect('7 R = 0.0090 也在 2% 內', hit('7', { T: 12000, R: 0.0090 }));
expect('7 9999 K 不算', !hit('7', { T: 9999, R: 0.0092 }));
expect('7 R = 0.0095 不算', !hit('7', { T: 20000, R: 0.0095 }));
expect('7 半徑在滑桿範圍內（≥ 0.005）', RE > 0.005);
// 8 和宇宙一樣老
let mm = [];
for (let m = 0.1; m <= 20.0005; m = Math.round((m + 0.001) * 1000) / 1000) if (hit('8', { M: m })) mm.push(m);
console.log('    壽命 13.8 Gyr ± 2%：M = ' + mm[0] + '–' + mm[mm.length - 1] + '（' + mm.length + ' 個可打字的值；massForLife = ' + K.massForLife(13.8e9).toFixed(4) + '）');
expect('8 有可打字的質量', mm.length >= 3);
expect('8 自由模式同樣的星不算（沒有壽命）', !hit('8', { T: K.mainSequence(0.898).T, R: K.mainSequence(0.898).R }));
expect('8 太陽（1 M☉、100 億年）不算', !hit('8', { M: 1 }));
// 9 主序帶上的天狼星
mm = [];
for (let m = 0.1; m <= 20.0005; m = Math.round((m + 0.001) * 1000) / 1000) if (hit('9', { M: m })) mm.push(m);
console.log('    L = 25.4 ± 2% 的主序星：M = ' + mm[0] + '–' + mm[mm.length - 1]);
expect('9 有可打字的質量', mm.length >= 3);
expect('9 自由模式不算', !hit('9', { T: 9940, R: K.radiusSun(25.4, 9940) }));
// 10 複製天狼星 B
const RB = K.radiusSun(0.025, 24800);
console.log('    天狼星 B：R = ' + RB.toFixed(5) + ' R☉，打字 ' + r4(RB) + ' → L = ' + K.lumSun(r4(RB), 24800).toFixed(5));
expect('10 24800 K、R = 0.0086 成立', hit('10', { T: 24800, R: 0.0086 }));
expect('10 R = 0.0088 不算（L 差 5%）', !hit('10', { T: 24800, R: 0.0088 }));
expect('10 25100 K 不算', !hit('10', { T: 25100, R: 0.0085 }));
// 11 最白的星
r = tRange('11', null, 4000, 12000);
let best = 1, bt = 0; for (let T = 4000; T <= 12000; T++) { const w = K.whiteDist(T); if (w < best) { best = w; bt = T; } }
console.log('    最接近 D65：' + bt + ' K，距離 ' + best.toFixed(5) + '；≤ 0.0045 的範圍 ' + r[0] + '–' + r[1] + ' K');
expect('11 範圍包含最白的溫度', r[0] <= bt && r[1] >= bt);
expect('11 範圍窄（< 600 K）', r[1] - r[0] < 600);
expect('11 6500 K 不算（常說的「6500 K 白光」是 D65，不是黑體）', !hit('11', { T: 6500 }));
expect('11 太陽不算', !hit('11', { T: 5772 }));
let n11 = 0; for (let T = 2000; T <= 50000; T++) if (hit('11', { T: T })) n11++;
expect('11 只有一段連續的範圍', n11 === r[1] - r[0] + 1);
// 12 可見光最多
r = tRange('12', null, 5000, 10000);
let vb = 0, vt = 0; for (let T = 5000; T <= 10000; T++) { const v = K.visibleFraction(T); if (v > vb) { vb = v; vt = T; } }
console.log('    可見光比例最大：' + vt + ' K，' + (vb * 100).toFixed(3) + '%；≥ 46.72% 的範圍 ' + r[0] + '–' + r[1] + ' K');
expect('12 範圍包含最大值', r[0] <= vt && r[1] >= vt);
expect('12 範圍窄（< 500 K）', r[1] - r[0] < 500);
expect('12 峰值在 565 nm（' + Math.round(K.WIEN_B / 565e-9) + ' K）不算', !hit('12', { T: Math.round(K.WIEN_B / 565e-9) }));
expect('12 太陽不算', !hit('12', { T: 5772 }));
// 隱藏 1：T < 4000、L ≈ 10^5
expect('h1 3600 K、R = 813 成立（像參宿四）', hit('h1', { T: 3600, R: r4(K.radiusSun(1e5, 3600)) }));
expect('h1 3999 K 可以（R 在範圍內）', hit('h1', { T: 3999, R: r4(K.radiusSun(1e5, 3999)) }) && K.radiusSun(1e5, 3999) < 2000);
expect('h1 4000 K 不算', !hit('h1', { T: 4000, R: K.radiusSun(1e5, 4000) }));
expect('h1 L = 1.2 × 10⁵ 不算', !hit('h1', { T: 3600, R: K.radiusSun(1.2e5, 3600) }));
const tLow = K.tempOf(0.95e5, 2000);
console.log('    半徑上限 2000 R☉ 時，L = 0.95 × 10⁵ 最低可到 ' + tLow.toFixed(0) + ' K');
expect('h1 2300–3999 K 都做得到', hit('h1', { T: 2300, R: 2000 }) || hit('h1', { T: 2300, R: r4(K.radiusSun(1e5, 2300)) }));
expect('h1 2000 K 做不到（半徑超過滑桿上限）', K.radiusSun(0.95e5, 2000) > 2000);
// 隱藏 2：主序壽命 = 50–51 倍宇宙年齡
mm = [];
for (let m = 0.1; m <= 1.0005; m = Math.round((m + 0.001) * 1000) / 1000) if (hit('h2', { M: m })) mm.push(m);
console.log('    壽命 50–51 倍宇宙年齡：M = ' + mm.join('、'));
expect('h2 有可打字的質量', mm.length >= 1);
expect('h2 最輕的 0.1 M☉ 不算（太長壽）', !hit('h2', { M: 0.1 }));
// 隱藏 3：峰值 1 μm
r = tRange('h3');
console.log('    峰值 1000 ± 0.5 nm：' + r[0] + '–' + r[1] + ' K');
expect('h3 有整數溫度（2898 K）', hit('h3', { T: 2898 }));
expect('h3 2900 K 不算', !hit('h3', { T: 2900 }));

// 極端與預設情境不會觸發精確任務
const exact = ['2', '3', '4', '5', '7', '8', '9', '10', '11', '12', 'h1', 'h2', 'h3'];
const corners = [];
[2000, 3000, 5772, 10000, 30000, 50000].forEach(T => [0.005, 0.012, 0.2, 1, 700, 2000].forEach(R => corners.push({ T: T, R: R })));
[0.1, 0.5, 1, 2, 5, 10, 20].forEach(M => corners.push({ M: M }));
[[5772, 1], [3200, 0.2], [10000, 0.012], [3500, 700]].forEach(q => corners.push({ T: q[0], R: q[1] }));   // 頁面上的快速設定
let falsePos = [];
corners.forEach(c => exact.forEach(id => { if (hit(id, c)) falsePos.push(id + ' @ ' + JSON.stringify(c)); }));
expect('極端值與快速設定（' + corners.length + ' 種）不會觸發精確任務' + (falsePos.length ? '：' + falsePos.join('；') : ''), falsePos.length === 0);
// 真實恆星本身也不會直接觸發（點選不會載入成你的恆星）
expect('任務數 12 + 隱藏 3', missions.filter(m => !m.hidden).length === 12 && missions.filter(m => m.hidden).length === 3);
expect('每個隱藏任務都有 riddle、沒有 desc', missions.filter(m => m.hidden).every(m => m.riddle && !m.desc));

console.log(`\n${ok} 項通過${bad ? '，' + bad + ' 項失敗' : ''}`);
