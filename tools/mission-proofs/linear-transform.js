/* 任務可達成的證明腳本。用法：node tools/mission-proofs/linear-transform.js
 * 用數學核心證明每個任務在滑桿範圍與精度內做得到（事件格式與 js/linear-transform.js 的 emitNow 相同），並確認預設狀態、範例矩陣不會順手完成任務。
 * 滑桿：矩陣元素 −3 到 3（間隔 0.1，可以打字到小數第 2 位）；探針 x 的分量 −4 到 4（拖曳 0.05 一格、鍵盤 0.01 一格、打字到小數第 2 位）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const L = require(ROOT + 'js/linear-transform-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/linear-transform.js');
const byId = id => missions.find(m => m.id === 'linear-transform-' + id);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;
const DEF2 = [[1.5, 0.5], [0.5, 1]], DEFX = [1, 2], DEF3 = [[1, 0.5, 0], [0, 1, 0.5], [0.5, 0, 1]];
const PRE2 = { id: [[1, 0], [0, 1]], stretch: [[2, 0], [0, 0.5]], shear: [[1, 1], [0, 1]], mirror: [[1, 0], [0, -1]], proj: [[1, 0], [0, 0]], sym: [[1.5, 0.5], [0.5, 1.5]] };
const PRE3 = { id: L.I3, stretch: [[2, 0, 0], [0, 1.5, 0], [0, 0, 0.5]], shear: [[1, 0, 0.5], [0, 1, 0.5], [0, 0, 1]], rot: [[0, -1, 0], [1, 0, 0], [0, 0, 1]], mirror: [[1, 0, 0], [0, 1, 0], [0, 0, -1]], proj: [[1, 0, 0], [0, 1, 0], [0, 0, 0]] };

function ev2(M, x, chal) {
  x = x || DEFX;
  const e = L.eig2(M), p = L.probe(M, x);
  return { type: 'm2', data: { M: M, det: L.det2(M), tr: L.tr2(M), kind: e.kind, x: x, y: p.y, nx: p.nx, ny: p.ny, lambda: p.lambda, sin: p.sin, chal: !!chal } };
}
function ev3(M) { return { type: 'm3', data: { M: M, det: L.det3(M), rank: L.rank3(M) } }; }
/** 數值都在打字精度（0.01）上、在滑桿範圍內 */
function typed(M, x) {
  const ok = (v, lim) => Math.abs(v) <= lim + 1e-9 && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
  return M.every(r => r.every(v => ok(v, 3))) && (!x || x.every(v => ok(v, 4)));
}

let fail = 0;
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { ok = ok || !!m.check(e, m.mem); });
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}
function reach(id, M, x, note) {
  if (!typed(M, x)) { fail++; console.log('  ✗ ' + id + ' 的範例超出範圍或精度'); return; }
  expect(id, [M.length === 3 ? ev3(M) : ev2(M, x)], true, note);
}

// ---------- 預設狀態與範例矩陣不觸發 ----------
{
  const evs = [ev2(DEF2), ev3(DEF3)].concat(Object.keys(PRE2).map(k => ev2(PRE2[k])), Object.keys(PRE3).map(k => ev3(PRE3[k])));
  const hit = missions.filter(m => evs.some(e => { m.mem = {}; return m.check(e, m.mem); })).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態或範例矩陣（探針在預設位置）觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態、6 個平面範例與 6 個空間範例（探針在預設位置）都不觸發任務');
}

// ---------- 一般任務 ----------
expect(1, [{ type: 'drag', data: { what: 'i' } }], true, '拖曳 i 的尖端');
expect(1, [{ type: 'drag', data: { what: 'x' } }], false, '拖探針不算');
reach(2, [[1.5, 0.5], [0.5, -1]], null, 'd 改成 −1：det = −1.75');
expect(2, [ev2(PRE2.mirror)], false, '範例「鏡射」是對角矩陣，不算');
reach(3, [[2, 1], [1, 2]], null, '[2 1; 1 2]：det = 3');
reach(3, [[1.5, -1.5], [1, 1]], null, '[1.5 −1.5; 1 1]：det = 3');
expect(3, [ev2([[3, 0], [0, 1]])], false, '對角的 [3 0; 0 1] 不算');
reach(4, [[1, 2], [0.5, 1]], null, '[1 2; 0.5 1]：det = 0，四個數都不是 0');
reach(4, [[0.3, 0.6], [0.2, 0.4]], null, '[0.3 0.6; 0.2 0.4]：浮點誤差 ' + Math.abs(L.det2([[0.3, 0.6], [0.2, 0.4]])).toExponential(1));
expect(4, [ev2(PRE2.proj)], false, '範例「投影」有 0，不算');
expect(4, [ev2([[1, 2], [0.5, 1.01]])], false, '[1 2; 0.5 1.01]：det = 0.01 不算');
reach(5, [[0, -1], [1, 0]], null, '逆時針 90°');
reach(5, [[0, 1], [-1, 0]], null, '順時針 90°');
expect(5, [ev2([[0, -1], [1, 0.1]])], false, '差 0.1 不算');
reach(6, PRE2.sym, [1, 1], '範例「對稱矩陣」、探針 (1, 1)：λ = 2');
reach(6, DEF2, [1.85, 1.15], '預設矩陣、探針 (1.85, 1.15)（拖曳 0.05 格）：夾角 ' + (Math.asin(L.probe(DEF2, [1.85, 1.15]).sin) / L.DEG).toFixed(2) + '°，λ = ' + L.probe(DEF2, [1.85, 1.15]).lambda.toFixed(3));
expect(6, [ev2(PRE2.sym, [1, 0])], false, '探針在 x 軸上不算');
expect(6, [ev2(PRE2.stretch, [1, 0])], false, '對角矩陣不算');
expect(6, [ev2(PRE2.shear, [1, 0])], false, '剪切只有重根');
reach(7, [[0, 1], [1, 0]], [1, -1], '對 y = x 鏡射 [0 1; 1 0]、探針 (1, −1)：λ = −1');
{
  const M = [[0.5, 1.5], [0.5, -0.5]], e = L.eig2(M);
  console.log('      （[0.5 1.5; 0.5 −0.5] 的特徵值 ' + e.vals.map(v => v.toFixed(3)).join('、') + '）');
  reach(7, M, [1, -1], '[0.5 1.5; 0.5 −0.5]、探針 (1, −1)：λ = −1');
}
expect(7, [ev2([[-1, 0], [0, -1]], [1, 1])], false, '−I 是對角矩陣');
reach(8, [[2, -1], [1, 0]], null, '[2 −1; 1 0]：det 1、tr 2');
reach(8, [[1.5, 0.25], [-1, 0.5]], null, '[1.5 0.25; −1 0.5]：det 1、tr 2');
expect(8, [ev2(PRE2.shear)], false, '範例「剪切」c = 0，不算');
expect(8, [ev2(L.I2)], false, '單位矩陣不算');
reach(9, [[2, 1, 0], [0, 3, 0], [1, 0, 1]], null, '[2 1 0; 0 3 0; 1 0 1]：det = 6');
reach(9, [[1, 1, 0], [0, 2, 1], [2, 0, 2]], null, '[1 1 0; 0 2 1; 2 0 2]：det = ' + L.det3([[1, 1, 0], [0, 2, 1], [2, 0, 2]]));
expect(9, [ev3([[2, 0, 0], [0, 3, 0], [0, 0, 1]])], false, '對角的 diag(2, 3, 1) 不算');
expect(9, [ev3([[2, 1, 1], [0, 3, 1], [0, 0, 1]])], false, '上三角不算');
reach(10, [[1, 0, 1], [0, 1, 1], [1, 1, 2]], null, '第 3 行 = 第 1 行 + 第 2 行');
reach(10, [[1.1, 0.7, 1.8], [0.3, 1.9, 2.2], [-1.3, 0.2, -1.1]], null, '小數的例子（第 3 行 = 前兩行相加）');
expect(10, [ev3(PRE3.proj)], false, '範例「投影到地板」第 3 行是 0，不算');
expect(10, [ev3([[1, 2, 0], [1, 2, 1], [1, 2, 0]])], false, '前兩行平行，不算');
expect(10, [ev3([[1, 0, -3], [0, 1, 0.5], [0, 0, 0]])], false, '第 3 列是 0（壓到地板上，自動試玩亂按碰到的）不算');
expect(11, [{ type: 'challenge', data: { time: 20, streak: 1, last3: null } }], true, '答對一題（2000 題的檢查見單元測試）');
expect(12, [{ type: 'challenge', data: { time: 25, streak: 3, last3: 80 } }], true, '三題共 80 秒');
expect(12, [{ type: 'challenge', data: { time: 40, streak: 3, last3: 100 } }], false, '三題共 100 秒');
expect(3, [ev2([[2, 1], [1, 2]], null, true)], false, '挑戰中不算一般任務');

// ---------- 隱藏任務 ----------
reach('h1', [[0, 1], [0, 0]], null, '[0 1; 0 0]：A² = 0');
reach('h1', [[1, 1], [-1, -1]], null, '[1 1; −1 −1]：tr 0、det 0');
reach('h1', [[0.6, -0.4], [0.9, -0.6]], null, '[0.6 −0.4; 0.9 −0.6]：浮點 tr ' + L.tr2([[0.6, -0.4], [0.9, -0.6]]) + '、det ' + L.det2([[0.6, -0.4], [0.9, -0.6]]).toExponential(1));
expect('h1', [ev2([[0, 0], [0, 0]])], false, '零矩陣不算');
{
  const phi = (1 + Math.sqrt(5)) / 2;
  reach('h2', [[1, 1], [1, 0]], [1.62, 1], '費氏矩陣、探針 (1.62, 1)：λ = ' + L.probe([[1, 1], [1, 0]], [1.62, 1]).lambda.toFixed(4) + '（黃金比例 ' + phi.toFixed(4) + '）');
  reach('h2', [[0, 1], [1, 1]], [1, 1.6], '另一種寫法 [0 1; 1 1]、探針 (1, 1.6)');
  expect('h2', [ev2([[1, 1], [1, 0]], [1, -0.6])], false, '另一個特徵值 1 − φ 不算');
}

// ---------- 星星總數 ----------
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const sp = pub.reduce((s, m) => s + starsOf(m), 0), sh = hid.reduce((s, m) => s + starsOf(m), 0);
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('  ✗ 隱藏任務超過 20 顆'); }
console.log('\n公開 ' + pub.length + ' 個 ' + sp + ' 顆、隱藏 ' + hid.length + ' 個 ' + sh + ' 顆，共 ' + (sp + sh) + ' 顆。');
console.log(fail ? fail + ' 項失敗' : '全部通過');
if (fail) process.exit(1);
