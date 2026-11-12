/* 任務可達成的證明腳本。用法：node tools/mission-proofs/regression.js
 * 用數學核心證明每個任務做得到（事件格式與 js/regression.js 的 emitPts 等相同），並確認預設狀態與範例資料按鈕不會觸發任務。
 * 點：點在圖上的位置取到 0.01（打開「對齊格線」時是 0.5 的格點）；範圍 0–20。我的直線：斜率 −3 到 3（0.01）、截距 −30 到 40（0.1；點數字可打到 0.01）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const R = require(ROOT + 'js/regression-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/regression.js');
const byId = id => missions.find(m => m.id === 'regression-' + id);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;

/** 與頁面 emitPts 相同的事件 */
function ptsEv(pts, opt) {
  opt = opt || {};
  const s = R.stats(pts);
  return { type: 'pts', data: {
    n: s.n, r: s.r, m: s.m, c: s.c, mx: s.mx, my: s.my, sse: s.sse, set: opt.set || 'edited',
    mine: opt.mine ? { m: opt.mine[0], c: opt.mine[1], sse: R.sse(pts, opt.mine[0], opt.mine[1]) } : null,
    quad: R.quadFit(pts), zview: !!opt.z, chal: !!opt.chal } };
}
function addEv(before, p) {
  const b = R.stats(before), a = R.stats(before.concat([p]));
  return { type: 'add', data: { n: a.n, before: { n: b.n, r: b.r, m: b.m, c: b.c }, after: { r: a.r, m: a.m, c: a.c }, chal: false } };
}
function dragEv(before, i, p) {
  const after = before.map(q => q.slice()); after[i] = p;
  return { type: 'drag', data: { n: after.length, r0: R.stats(before).r, r1: R.stats(after).r, chal: false } };
}
/** 點都在 0.01 的格點上、在範圍內 */
function onGrid(pts, step) {
  const k = 1 / (step || 0.01);
  return pts.every(p => p.every(v => v >= 0 && v <= 20 && Math.abs(v * k - Math.round(v * k)) < 1e-9));
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
function grid(id, pts, step) { if (!onGrid(pts, step)) { fail++; console.log('  ✗ ' + id + ' 的範例點不在格點上'); } }

// ---------- 預設狀態與範例資料不觸發 ----------
{
  const evs = [ptsEv(R.preset('default'), { set: 'default' })];
  ['pos', 'neg', 'none', 'I', 'II', 'III', 'IV'].forEach(k => { evs.push(ptsEv(R.preset(k), { set: k }), { type: 'dataset', data: { set: k } }); });
  evs.push(ptsEv(R.preset('default'), { z: true }));
  const hit = missions.filter(m => { return evs.some(e => { m.mem = {}; return m.check(e, m.mem); }); }).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態或單一範例資料觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設資料（r = ' + R.stats(R.preset('default')).r.toFixed(3) + '）、七組範例資料（各按一次）、標準化，都不觸發任務');
}

// ---------- 一般任務 ----------
expect(1, [addEv(R.preset('default'), [3, 15])], true, '在 (3, 15) 加一個點');
expect(2, [{ type: 'squares', data: { on: true, n: 12 } }], true, '打開殘差平方');
expect(2, [{ type: 'squares', data: { on: false, n: 12 } }], false, '關掉不算');
{
  const p3 = [[2, 2.5], [5, 5], [8, 8.5], [11, 11], [14, 14.5]];
  grid(3, p3, 0.5);
  expect(3, [ptsEv(p3)], true, '五個點 r = ' + R.stats(p3).r.toFixed(4));
  expect(3, [ptsEv(R.preset('pos'))], false, '「正相關」範例 r = 0.8');
  const p4 = p3.map(p => [p[0], 20 - p[1]]);
  expect(4, [ptsEv(p4)], true, '上下翻過來 r = ' + R.stats(p4).r.toFixed(4));
  expect(4, [ptsEv(R.preset('neg'))], false, '「負相關」範例 r = −0.8');
}
{
  // 正方形的四個角加中心兩點：r = 0
  const p5 = [[5, 5], [15, 5], [5, 15], [15, 15], [10, 8], [10, 12]];
  expect(5, [ptsEv(p5)], true, '正方形四角加中間兩點 r = ' + R.stats(p5).r.toFixed(4));
  expect(5, [ptsEv(R.preset('none'))], false, '「幾乎無關」範例 r = 0.1');
  expect(5, [ptsEv(p5.slice(0, 5))], false, '只有 5 個點');
}
{
  const pts = R.preset('default'), s = R.stats(pts);
  // 我的直線：斜率取 0.01、截距取 0.1 的格點
  const m = Math.round(s.m * 100) / 100, c = Math.round((s.my - m * s.mx) * 10) / 10;
  const k = R.sse(pts, m, c) / s.sse;
  expect(6, [ptsEv(pts, { mine: [m, c] })], true, '預設資料，我的直線 y = ' + m + 'x + ' + c + '：殘差平方和是最小值的 ' + k.toFixed(4) + ' 倍');
  expect(6, [ptsEv(pts, { mine: [0, 9.1] })], false, '一開始的水平線（' + (R.sse(pts, 0, 9.1) / s.sse).toFixed(2) + ' 倍）');
  expect(6, [ptsEv(pts)], false, '沒開我的直線');
}
expect(7, ['I', 'II', 'III', 'IV'].map(k => ({ type: 'dataset', data: { set: k } })), true, '四組都看過');
expect(7, ['I', 'II', 'III', 'I'].map(k => ({ type: 'dataset', data: { set: k } })), false, '只看三組');
{
  // 預設資料（12 點、r ≈ 0.67）：把右上角的點 (15.5, 15.5) 拖到右下角 (20, 0)
  const pts = R.preset('default');
  const i = pts.findIndex(p => p[0] === 15.5);
  const ev = dragEv(pts, i, [20, 0]);
  expect(8, [ev], true, '預設資料把 (15.5, 15.5) 拖到 (20, 0)：r ' + ev.data.r0.toFixed(3) + ' → ' + ev.data.r1.toFixed(3));
  // 只拖到 (20, 5) 不夠
  const ev2 = dragEv(pts, i, [20, 4]);
  expect(8, [ev2], false, '拖到 (20, 4)：r → ' + ev2.data.r1.toFixed(3));
  // 每個點拖到任何一個角，最多能把 r 拉到多低
  let best = 1;
  pts.forEach((p, j) => [[0, 0], [0, 20], [20, 0], [20, 20]].forEach(q => { best = Math.min(best, R.stats(pts.map((t, k) => (k === j ? q : t))).r); }));
  console.log('  ・ 預設資料只拖一個點，r 最低到 ' + best.toFixed(3));
}
{
  const p9 = [[2, 3], [5, 7.5], [8, 12], [11, 16.5], [13, 19.5]];
  grid(9, p9, 0.5);
  expect(9, [ptsEv(p9)], true, '對齊格線，y = 1.5x 上的五個點：r = ' + R.stats(p9).r);
  const bad = [[2, 3], [5, 7.5], [8, 12], [11, 16.5], [13, 19.6]];
  expect(9, [ptsEv(bad)], false, '最後一點偏 0.1：r = ' + R.stats(bad).r.toFixed(6));
  expect(9, [ptsEv([[2, 5], [6, 5], [10, 5], [14, 5], [18, 5]])], false, '水平線（r 沒有定義）');
}
{
  // 每個 x 放兩個點，對稱地分在 y = x 上下：(x, x ± d)
  const p10 = [[3, 4], [3, 2], [8, 9.5], [8, 6.5], [13, 14], [13, 12]];
  grid(10, p10, 0.5);
  const s = R.stats(p10);
  expect(10, [ptsEv(p10)], true, '六個點：斜率 ' + s.m.toFixed(4) + '、截距 ' + s.c.toFixed(4) + '、r = ' + s.r.toFixed(4));
  expect(10, [ptsEv([[3, 3], [6, 6], [9, 9], [12, 12], [15, 15], [18, 18]])], false, '都在 y = x 上（r = 1 太整齊）');
}
expect(11, [{ type: 'challenge', data: { hit: true, guess: 0.5, r: 0.52, streak: 1 } }], true, '猜中一題（每題 r 都在 −0.95 到 0.95：見單元測試的 2000 題）');
expect(11, [{ type: 'challenge', data: { hit: false, guess: 0.5, r: 0.6, streak: 0 } }], false, '沒猜中');
expect(12, [1, 2, 3].map(k => ({ type: 'challenge', data: { hit: true, guess: 0, r: 0, streak: k } })), true, '連續猜中三題');
expect(12, [{ type: 'challenge', data: { hit: true, streak: 2 } }, { type: 'challenge', data: { hit: false, streak: 0 } }, { type: 'challenge', data: { hit: true, streak: 1 } }], false, '中間錯一題');
{
  // 亂猜（永遠猜 0）的命中率：r 在 [−0.95, 0.95] 均勻，|r| ≤ 0.05 的機會
  const rand = R.rng(5); let prev = null, hit = 0;
  for (let t = 0; t < 2000; t++) { const ch = R.genChallenge(rand, prev); if (R.chalHit(ch, 0)) hit++; prev = ch; }
  console.log('  ・ 亂猜 0 的命中率 ' + (100 * hit / 2000).toFixed(1) + '%（任務 11 是 5 級；連中三題約 ' + (Math.pow(hit / 2000, 3) * 100).toFixed(4) + '%）');
}

// ---------- 隱藏任務 ----------
{
  const par = [8, 9, 10, 11, 12].map(x => [x, 5 + (x - 10) * (x - 10)]);
  grid('h1', par, 0.5);
  expect('h1', [ptsEv(par)], true, '對齊格線，拋物線 y = 5 + (x − 10)² 上的五個點：r = ' + R.stats(par).r + '、二次 R² = ' + R.quadFit(par).R2.toFixed(6));
  const half = [8, 9, 10, 11, 12].map(x => [x, 5 + 0.5 * (x - 10) * (x - 10)]);
  grid('h1', half, 0.5);
  expect('h1', [ptsEv(half)], true, '平一點的 y = 5 + 0.5(x − 10)² 也行');
  expect('h1', [ptsEv(R.ANSCOMBE.II)], false, '安斯康姆 II 是拋物線，但 r = 0.816');
  expect('h1', [ptsEv(par.slice(0, 4).concat([[12, 9.5]]))], false, '最後一點偏 0.5（r = ' + R.stats(par.slice(0, 4).concat([[12, 9.5]])).r.toFixed(3) + '）');
  expect('h1', [ptsEv([[5, 5], [15, 5], [5, 15], [15, 15], [10, 8], [10, 12]])], false, '正方形四角（r = 0，但不是拋物線）');
}
{
  const pts = R.preset('default'), s = R.stats(pts);
  const mean = [Math.round(s.mx * 100) / 100, Math.round(s.my * 100) / 100];
  expect('h2', [addEv(pts, mean)], true, '預設資料，在平均點 (' + mean.join(', ') + ') 加一個點');
  // 點擊的誤差：在平均點附近多遠以內都算
  let ok = 0, tot = 0;
  for (let dx = -0.5; dx <= 0.5001; dx += 0.05) for (let dy = -0.5; dy <= 0.5001; dy += 0.05) {
    tot++; const m = byId('h2'); m.mem = {};
    if (m.check(addEv(pts, [R.round6(mean[0] + dx), R.round6(mean[1] + dy)]), m.mem)) ok++;
  }
  console.log('  ・ 平均點周圍 ±0.5 的格子裡，' + ok + ' / ' + tot + ' 個位置算（約 ±' + Math.sqrt(ok * 0.0025 / Math.PI).toFixed(2) + ' 的圓，畫面上約 ' + (Math.sqrt(ok * 0.0025 / Math.PI) * 25).toFixed(0) + ' 像素）');
  expect('h2', [addEv(pts, [mean[0], mean[1] + 0.5])], false, '往上偏 0.5 不算');
  expect('h2', [addEv(pts, [mean[0] + 3, mean[1] + 3 * s.m])], false, '加在迴歸直線上、離平均點 3 格（直線不動，但 r 變了）');
  const line = [[2, 3], [5, 7.5], [8, 12], [11, 16.5]];
  expect('h2', [addEv(line, [13, 19.5])], false, '本來就排成直線的點，加在直線上不算');
  expect('h2', [addEv([[1, 1], [3, 5], [9, 2]], [13 / 3, 8 / 3])], false, '原本只有 3 個點不算');
}

// ---------- 星星總數 ----------
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const sp = pub.reduce((s, m) => s + starsOf(m), 0), sh = hid.reduce((s, m) => s + starsOf(m), 0);
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('  ✗ 隱藏任務超過 20 顆'); }
console.log('\n公開 ' + pub.length + ' 個 ' + sp + ' 顆、隱藏 ' + hid.length + ' 個 ' + sh + ' 顆，共 ' + (sp + sh) + ' 顆。');
console.log(fail ? fail + ' 項失敗' : '全部通過');
if (fail) process.exit(1);
