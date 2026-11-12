/* 任務可達成的證明腳本。用法：node tools/mission-proofs/harmonic-series.js
 * 用數學核心（js/harmonic-series-core.js）證明每個任務在滑桿範圍與精度內做得到（事件資料由 HarmonicCore.missionData 產生，和頁面相同），
 * 預設狀態不觸發任何任務，10 個隱藏任務兩兩不會連帶完成，而且模擬「亂按」很多次也不會誤觸隱藏任務。
 * 介面精度：長條振幅 0–1、間隔 0.01（拖曳、鍵盤、滑桿都一樣）；基頻 110–880 Hz 對數滑桿 1000 格（點數字可打到 0.1 Hz）；泛音數 1–16；
 * 隨機相位是第 1、2、3…組（按「換一組」加一）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const H = require(ROOT + 'js/harmonic-series-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/harmonic-series.js');
const byId = id => missions.find(m => m.id === 'harmonic-series-' + id);
const hidden = missions.filter(m => m.hidden);

// ---------- 和頁面一樣的狀態與事件 ----------
const D = H.DEFAULT;
const arr = o => { const a = new Array(16).fill(0); Object.keys(o).forEach(k => { a[k - 1] = o[k]; }); return a; };
const r2 = x => Math.round(x * 100) / 100;
function st(o) { return Object.assign({ a: H.preset(D.preset, D.f0), f0: D.f0, N: D.N, mode: D.mode, seed: D.seed, preset: D.preset, edited: false }, o); }
/** 按預設音色（基頻 f0） */
function presetSt(id, o) { o = o || {}; const f0 = o.f0 || D.f0; return st(Object.assign({ a: H.preset(id, f0), preset: id, edited: false }, o)); }
/** 從預設音色出發、改了幾根長條（值都在 0.01 的格點上） */
function editSt(id, changes, o) {
  o = o || {};
  const f0 = o.f0 || D.f0;
  const a = H.preset(id, f0).slice();
  Object.keys(changes).forEach(k => { a[k - 1] = changes[k]; });
  return st(Object.assign({ a: a, preset: id, edited: true }, o));
}
const toneEv = s => ({ type: 'tone', data: H.missionData(s) });

let fail = 0;
function check(id, ev) { const m = byId(id); m.mem = {}; return !!m.check(ev, m.mem); }
function expect(id, ev, want, note) {
  const ok = check(id, ev) === want;
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}
const f3 = x => (+x).toFixed(3);

// ---------- 預設狀態不觸發 ----------
{
  const evs = [toneEv(st({}))];
  // 只按預設音色、改相位或換一組（長條沒動），各種基頻與泛音數：不可觸發任何隱藏任務
  const sweep = [];
  H.PRESET_IDS.forEach(id => [110, 220, 330, 523.3, 660, 880].forEach(f0 => [1, 5, 12, 16].forEach(N => ['sine', 'random'].forEach(mode => [1, 2, 3].forEach(seed => {
    sweep.push(toneEv(presetSt(id, { f0: f0, N: N, mode: mode, seed: seed })));
  })))));
  const hitDefault = missions.filter(m => { m.mem = {}; return evs.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hitDefault.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hitDefault.join('、')); }
  else console.log('  ✓ 預設狀態（小提琴、220 Hz、N = 12、同相）不觸發任何任務');
  const hitSweep = hidden.filter(m => { m.mem = {}; return sweep.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hitSweep.length) { fail++; console.log('  ✗ 只按預設音色就觸發了隱藏任務 ' + hitSweep.join('、')); }
  else console.log('  ✓ 只按預設音色、換基頻（不含 440 Hz）、改泛音數、改相位（' + sweep.length + ' 種組合）都不觸發隱藏任務');
}

// ---------- 公開任務 ----------
console.log('\n公開任務：');
expect('1', { type: 'build', data: { done: true, N: 12, n: H.analyze(H.preset('violin'), 12, 'sine', 1, 220).active.length, preset: 'violin', edited: false } }, true,
  '預設小提琴（12 個泛音都不為 0）按「一個一個加上泛音」到最後');
expect('1', { type: 'build', data: { done: false, N: 12, n: 12 } }, false, '中途停止不算');
expect('1', { type: 'build', data: { done: true, N: 12, n: 6, preset: 'square' } }, true, '方波 N = 12（6 個奇次泛音）');
expect('1', { type: 'build', data: { done: true, N: 8, n: 4, preset: 'square' } }, false, '方波 N = 8 只有 4 個泛音');
expect('2', { type: 'view3d', data: { face: 'side' } }, true, '3D 按「側面看：頻譜（頻域）」');
expect('2', { type: 'view3d', data: { face: 'front' } }, false, '正面不算');
{
  const s700 = presetSt('voice', { f0: 700 });
  expect('3', toneEv(s700), true, '人聲、基頻 700 Hz（最強是第 ' + H.missionData(s700).strongest + ' 個）');
  expect('3', toneEv(presetSt('voice', { f0: H.f0FromPos(1000) })), true, '人聲、基頻拉到最右 880 Hz');
  expect('3', toneEv(presetSt('voice', { f0: 690 })), false, '690 Hz 不到 700');
  expect('3', toneEv(editSt('voice', { 2: 0.5 }, { f0: 760 })), false, '改過長條就不是人聲預設');
}
expect('4', toneEv(st({ a: arr({ 4: 1 }), edited: true })), true, '只留第 4 個、基頻 220 Hz → 880 Hz');
expect('4', toneEv(st({ a: arr({ 2: 0.6 }), f0: 440, edited: true })), true, '只留第 2 個、基頻 440 Hz');
expect('4', toneEv(st({ a: arr({ 3: 1 }), f0: H.f0FromPos(Math.round(H.posFromF0(880 / 3))), edited: true })), true,
  '只留第 3 個、基頻拖到 ' + H.f0FromPos(Math.round(H.posFromF0(880 / 3))).toFixed(2) + ' Hz（' + (1200 * Math.log2(3 * H.f0FromPos(Math.round(H.posFromF0(880 / 3))) / 880)).toFixed(1) + ' 音分）');
expect('4', toneEv(st({ a: arr({ 1: 1 }), f0: 880, edited: true })), false, '只留基頻不算（要第 2 個以上）');
expect('4', toneEv(st({ a: arr({ 4: 1 }), f0: 225, edited: true })), false, '基頻 225 Hz → 900 Hz 差 39 音分');
expect('5', toneEv(editSt('clarinet', { 2: 0, 4: 0, 6: 0, 8: 0, 10: 0, 12: 0 })), true, '單簧管 N = 12，6 個偶次拉到 0');
expect('5', toneEv(editSt('clarinet', { 2: 0, 4: 0 }, { N: 5 })), true, '單簧管 N = 5，只要拉 2、4 兩根');
expect('5', toneEv(editSt('clarinet', { 2: 0, 4: 0 }, { N: 6 })), false, 'N = 6 時第 6 個還在');
expect('5', toneEv(presetSt('square')), false, '直接按「方波」（沒有動手）不算');
expect('5', toneEv(editSt('square', { 3: 0.5 })), false, '「方波」本來就只有奇次：改一根長條也不算（要從「單簧管」開始，自動試玩抓到的情況）');
{
  let seed = 0, ratio = 0;
  for (let s = 1; s <= 30 && !seed; s++) { const d = H.missionData(presetSt('square', { mode: 'random', seed: s })); if (d.crest >= 1.5 * d.crestSine) { seed = s; ratio = d.crest / d.crestSine; } }
  const d1 = H.missionData(presetSt('square', { mode: 'random', seed: 1 }));
  expect('6', toneEv(presetSt('square', { mode: 'random', seed: seed })), true, '方波、隨機相位第 ' + seed + ' 組：峰值因數是同相的 ' + ratio.toFixed(2) + ' 倍');
  expect('6', toneEv(presetSt('square', { mode: 'random', seed: 1 })), false, '第 1 組只有 ' + (d1.crest / d1.crestSine).toFixed(2) + ' 倍（要按「換一組」）');
  let n = 0; for (let s = 1; s <= 40; s++) { const d = H.missionData(presetSt('square', { mode: 'random', seed: s })); if (d.crest >= 1.5 * d.crestSine) n++; }
  console.log('      （前 40 組裡有 ' + n + ' 組做得到）');
}
expect('7', toneEv(st({ a: arr({ 4: 0.5, 5: 0.5, 6: 0.5 }), edited: true })), true, '第 4、5、6 個各 0.5');
expect('7', toneEv(st({ a: arr({ 4: 0.5, 5: 0.5, 6: 0.29 }), edited: true })), false, '第 6 個 0.29 太弱');
expect('7', toneEv(st({ a: arr({ 1: 0.1, 4: 0.5, 5: 0.5, 6: 0.5 }), edited: true })), false, '基頻還在');
expect('8', toneEv(editSt('pure', { 3: 0.33, 5: 0.2, 7: 0.14 }, { N: 7 })), true, '純音 → 第 3、5、7 拖到 0.33、0.20、0.14，N = 7');
expect('8', toneEv(editSt('pure', { 3: 0.33, 5: 0.2, 7: 0.14, 9: 0.11, 11: 0.09, 13: 0.08, 15: 0.07 }, { N: 16 })), true, '一路拼到第 15 個，N = 16');
expect('8', toneEv(editSt('pure', { 3: 0.33, 5: 0.2 }, { N: 7 })), false, '第 7 個還是 0');
expect('8', toneEv(presetSt('square', { N: 7 })), false, '直接按「方波」不算');
{
  const ch = {}; for (let k = 1; k <= 8; k++) ch[k] = r2(1 / k);
  expect('9', toneEv(editSt('violin', ch, { N: 8 })), true, '小提琴 → 前 8 個拖到 ' + Object.values(ch).join('、'));
  const ch2 = Object.assign({}, ch, { 3: 0.3 });
  expect('9', toneEv(editSt('violin', ch2, { N: 8 })), false, '第 3 個 0.30（差 0.033）');
  expect('9', toneEv(editSt('violin', ch, { N: 8, mode: 'random' })), false, '隨機相位不算');
}
{
  let sol = null;
  for (let x = 0; x <= 1 && !sol; x = r2(x + 0.01)) { const s = st({ a: arr({ 1: 1, 2: 0.5, 8: x }), edited: true }); const d = H.missionData(s); if (d.cr >= 2.97 && d.cr <= 3.03 && d.strongest === 1) sol = { x: x, cr: d.cr, s: s }; }
  expect('10', toneEv(sol.s), true, '基頻 1、第 2 個 0.5、第 8 個 ' + sol.x + '：重心 ' + f3(sol.cr) + ' 倍');
  expect('10', toneEv(presetSt('violin', { f0: 110 })), false, '小提琴在 110 Hz 的重心 ' + f3(H.missionData(presetSt('violin', { f0: 110 })).cr) + '，但沒有動手調');
  expect('10', toneEv(st({ a: arr({ 3: 1 }), edited: true })), false, '只有第 3 個（重心剛好 3 倍，但不到 3 個泛音）');
}
{
  // 單簧管：把第 7、9、11 個奇次泛音調大，找重心與雙簧管相同的組合
  let sol = null;
  for (let x = 0.3; x <= 1 && !sol; x = r2(x + 0.01)) {
    const s = editSt('clarinet', { 7: x, 9: x, 11: x }, { N: 12 });
    const d = H.missionData(s);
    if (Math.abs(d.cr - d.crOboe) <= 0.05 && d.odd >= 10 * d.even) sol = { x: x, d: d, s: s };
  }
  expect('11', toneEv(sol.s), true, '單簧管 N = 12，第 7、9、11 個都拉到 ' + sol.x + '：重心 ' + f3(sol.d.cr) + '（雙簧管 ' + f3(sol.d.crOboe) + '），奇／偶 = ' + (sol.d.odd / sol.d.even).toFixed(1));
  expect('11', toneEv(presetSt('clarinet')), false, '單簧管原樣：重心 ' + f3(H.missionData(presetSt('clarinet')).cr));
  const s2 = editSt('clarinet', { 4: 0.5, 6: 0.5, 8: 0.5 }, { N: 12 });
  const d2 = H.missionData(s2);
  expect('11', toneEv(s2), false, '改偶次讓它變亮：重心 ' + f3(d2.cr) + '，但奇／偶只剩 ' + (d2.odd / d2.even).toFixed(1));
}
expect('12', toneEv(st({ a: arr({ 1: 1, 3: 0.18 }), edited: true })), true, '基頻 1、第 3 個 0.18：峰值因數 ' + f3(H.missionData(st({ a: arr({ 1: 1, 3: 0.18 }) })).crest));
expect('12', toneEv(st({ a: arr({ 1: 1, 3: 0.16 }), edited: true })), true, '第 3 個 0.16：' + f3(H.missionData(st({ a: arr({ 1: 1, 3: 0.16 }) })).crest));
expect('12', toneEv(st({ a: arr({ 1: 1, 3: 0.24 }), edited: true })), false, '第 3 個 0.24：' + f3(H.missionData(st({ a: arr({ 1: 1, 3: 0.24 }) })).crest));
expect('12', toneEv(st({ a: arr({ 1: 1 }), edited: true })), false, '純音：√2');

// ---------- 隱藏任務 ----------
console.log('\n隱藏任務：');
const sols = {};
function sol(id, s, note) { sols[id] = toneEv(s); expect(id, sols[id], true, note); }
{
  const p = Math.round(H.posFromF0(440));
  sol('h1', presetSt('oboe', { f0: 440 }), '雙簧管、基頻打 440 Hz（樂團對音）');
  expect('h1', toneEv(presetSt('oboe', { f0: H.f0FromPos(p) })), false, '只拖滑桿到不了：第 ' + p + ' 格 = ' + H.f0FromPos(p).toFixed(2) + ' Hz（' + (1200 * Math.log2(H.f0FromPos(p) / 440)).toFixed(2) + ' 音分）');
  expect('h1', toneEv(presetSt('oboe', { f0: 440.2 })), true, '打 440.2 Hz（+0.8 音分）也算');
  expect('h1', toneEv(presetSt('flute', { f0: 440 })), false, '長笛不算');
}
sol('h2', st({ a: arr({ 1: 1, 2: 0.6, 4: 0.4, 8: 0.3, 16: 0.2 }), N: 16, edited: true }), '只留第 1、2、4、8、16 個（五代都是同一個音名，一個比一個高八度）');
expect('h2', toneEv(st({ a: arr({ 1: 1, 2: 0.6, 4: 0.4, 8: 0.3 }), N: 16, edited: true })), false, '少了第 16 個（只有四代，亂按時偶爾會碰巧剩下這四個）');
expect('h2', toneEv(st({ a: arr({ 1: 1, 2: 0.6, 4: 0.4, 8: 0.3, 12: 0.1 }), N: 16, edited: true })), false, '多了第 12 個');
sol('h3', st({ a: arr({ 2: 0.6, 3: 0.5 }), N: 12, edited: true }), '只留第 2、3 個（缺基頻：波形仍以 220 Hz 重複）');
expect('h3', toneEv(st({ a: arr({ 2: 0.6, 3: 0.5 }), N: 4, edited: true })), false, 'N = 4（泛音數太少時亂按也可能剩下這兩個，所以要 N ≥ 6）');
expect('h3', toneEv(st({ a: arr({ 2: 0.6, 3: 0.25 }), N: 12, edited: true })), false, '第 3 個只有 0.25');
sol('h4', st({ a: arr({ 2: 1, 4: 0.5, 6: 0.3 }), N: 6, edited: true }), '只留第 2、4、6 個（波形每半個週期重複，高八度）');
expect('h4', toneEv(st({ a: arr({ 2: 1, 4: 0.5, 6: 0.05 }), N: 6, edited: true })), false, '第 6 個只有 0.05');
{
  const ch = {}; for (let k = 2; k <= 16; k += 2) ch[k] = 0;
  sol('h5', editSt('sawtooth', ch, { N: 16 }), '鋸齒波 N = 16，把 8 個偶次拉到 0（剩下的正好是方波的 1/k）');
  expect('h5', toneEv(editSt('sawtooth', { 2: 0, 4: 0, 6: 0, 8: 0 }, { N: 8 })), true, 'N = 8 只要拉 4 根');
  expect('h5', toneEv(editSt('sawtooth', { 2: 0, 4: 0, 6: 0 }, { N: 8 })), false, '第 8 個還在');
}
sol('h6', st({ a: arr({ 4: 0.5, 5: 0.5, 6: 0.5, 7: 0.5 }), N: 8, edited: true }), '只留第 4、5、6、7 個（屬七和弦，第 7 泛音比平均律低 31 音分）');
{
  const ch = { 3: 0.11, 5: 0.04, 7: 0.02 };
  sol('h7', editSt('square', ch, { N: 7 }), '方波 N = 7，第 3、5、7 個改成 0.11、0.04、0.02（1/k²：三角波的頻譜，但相位是方波的）');
  expect('h7', toneEv(editSt('square', { 3: 0.11, 5: 0.04, 7: 0.02, 9: 0.01, 11: 0.01, 13: 0.01, 15: 0 }, { N: 16 })), true, '一路改到 N = 16');
  expect('h7', toneEv(editSt('triangle', { 3: -0.11 }, { N: 7 })), false, '從三角波出發改一下（聽起來、看起來都還是三角波）');
  expect('h7', toneEv(presetSt('triangle', { N: 12, mode: 'random', seed: 2 })), false, '三角波＋隨機相位（亂按也做得到，所以不算）');
  expect('h7', toneEv(editSt('square', { 3: 0.15, 5: 0.04, 7: 0.02 }, { N: 7 })), false, '第 3 個 0.15');
}
{
  const ch = {}; for (let k = 1; k <= 16; k++) ch[k] = k <= 8 ? 0.5 : 0;
  sol('h8', st({ a: arr(ch), N: 12, edited: true }), '第 1–8 個都是 0.50：均方根 ' + f3(H.missionData(st({ a: arr(ch), N: 12 })).rms) + '（單一長條最多 0.707）');
  const ch4 = { 1: 0.71, 2: 0.71, 3: 0.71, 4: 0.71 };
  expect('h8', toneEv(st({ a: arr(ch4), N: 12, edited: true })), true, '第 1–4 個都是 0.71：均方根 ' + f3(H.missionData(st({ a: arr(ch4), N: 12 })).rms));
  expect('h8', toneEv(st({ a: arr({ 1: 0.5, 2: 0.5, 3: 0.5, 4: 0.5, 5: 0.5, 6: 0.5, 7: 0.5, 9: 0.5 }), N: 12, edited: true })), false, '跳過第 8 個（不連續）');
  expect('h8', toneEv(st({ a: arr(ch), N: 12, mode: 'random', edited: true })), false, '隨機相位不算（留給另一個謎）');
}
{
  const a = new Array(16).fill(1);
  let seed = 0, d0 = null;
  for (let s = 1; s <= 50 && !seed; s++) { const d = H.missionData(st({ a: a, N: 12, mode: 'random', seed: s, edited: true })); if (d.crest <= 0.6 * d.crestSine) { seed = s; d0 = d; } }
  sol('h9', st({ a: a, N: 12, mode: 'random', seed: seed, edited: true }), '12 根都拉到 1、隨機相位第 ' + seed + ' 組：峰值因數 ' + f3(d0.crest) + '（同相 ' + f3(d0.crestSine) + '）');
  let cnt = 0; for (let s = 1; s <= 50; s++) { const d = H.missionData(st({ a: a, N: 12, mode: 'random', seed: s })); if (d.crest <= 0.6 * d.crestSine) cnt++; }
  console.log('      （N = 12 時前 50 組裡有 ' + cnt + ' 組做得到）');
  const d1 = H.missionData(st({ a: a, N: 12, mode: 'random', seed: 1 }));
  expect('h9', toneEv(st({ a: a, N: 12, mode: 'random', seed: 1, edited: true })), false, '第 1 組：' + f3(d1.crest) + '，不夠低');
  const a2 = a.slice(); a2[5] = 0.9;
  expect('h9', toneEv(st({ a: a2, N: 12, mode: 'random', seed: seed, edited: true })), false, '有一根不一樣高');
}
{
  // 費耶（Fejér）式的漸弱：第 k 個 = (1/k)(1 − (k − 1)/(N + 1))，取到 0.01
  const N = 15, ch = {};
  for (let k = 1; k <= 16; k++) ch[k] = k <= N && k % 2 ? r2((1 / k) * (1 - (k - 1) / (N + 1))) : 0;
  const s = st({ a: arr(ch), N: 16, edited: true });
  const d = H.missionData(s);
  sol('h10', s, '奇次 ' + Object.keys(ch).filter(k => ch[k]).map(k => ch[k]).join('、') + '：峰值 ' + f3(d.peak) + ' = 正中央 ' + f3(d.quarter) + '、峰值因數 ' + f3(d.crest));
  const sq = st({ a: arr({ 1: 1, 3: 0.33, 5: 0.2, 7: 0.14, 9: 0.11, 11: 0.09, 13: 0.08, 15: 0.07 }), N: 16, edited: true });
  const dq = H.missionData(sq);
  expect('h10', toneEv(sq), false, '手拼的方波：峰值 ' + f3(dq.peak) + ' > 正中央 ' + f3(dq.quarter) + '（吉布斯的刺）');
  const lan = {}; for (let k = 1; k <= 15; k += 2) { const x = Math.PI * k / 16; lan[k] = r2((1 / k) * Math.sin(x) / x); }
  const dl = H.missionData(st({ a: arr(lan), N: 16 }));
  expect('h10', toneEv(st({ a: arr(lan), N: 16, edited: true })), true, 'Lanczos σ 因子（課本上壓吉布斯的方法）：峰值因數 ' + f3(dl.crest) + '，峰值 ' + f3(dl.peak) + '、正中央 ' + f3(dl.quarter));
  const half = st({ a: arr({ 1: 1, 3: 0.33, 5: 0.2, 7: 0.14, 9: 0.11, 11: 0.09, 13: 0.08, 15: 0.03 }), N: 16, edited: true });
  const dh = H.missionData(half);
  expect('h10', toneEv(half), false, '只把最高的第 15 個調小：峰值 ' + f3(dh.peak) + ' 仍高過正中央 ' + f3(dh.quarter));
}

// ---------- 隱藏任務兩兩不連帶完成 ----------
{
  let bad = 0;
  Object.keys(sols).forEach(id => {
    hidden.forEach(m => {
      if (m.id === 'harmonic-series-' + id) return;
      m.mem = {};
      if (m.check(sols[id], m.mem)) { bad++; console.log('  ✗ ' + id + ' 的解也完成了 ' + m.id); }
    });
  });
  if (bad) fail++;
  else console.log('\n  ✓ 10 個隱藏任務的解，都不會順便完成另一個隱藏任務');
}

// ---------- 模擬亂按：隱藏任務不可被誤觸 ----------
{
  const rnd = H.rng(20261113);
  const pick = list => list[Math.floor(rnd() * list.length)];
  let hits = {}, events = 0;
  for (let run = 0; run < 400; run++) {
    let s = st({});
    let sel = 1;
    for (let step = 0; step < 200; step++) {
      const u = rnd();
      if (u < 0.15) { const id = pick(H.PRESET_IDS); s = Object.assign({}, s, { a: H.preset(id, s.f0), preset: id, edited: false }); }
      else if (u < 0.22) s = Object.assign({}, s, { mode: s.mode === 'sine' ? 'random' : 'sine' });
      else if (u < 0.27) s = Object.assign({}, s, { mode: 'random', seed: s.seed + 1 });
      else if (u < 0.37) { const v = rnd(); s = Object.assign({}, s, { N: v < 0.2 ? 1 : v < 0.4 ? 16 : 1 + Math.floor(rnd() * 16) }); }
      else if (u < 0.47) {
        const v = rnd(), pos = v < 0.2 ? 0 : v < 0.4 ? 1000 : Math.round(rnd() * 1000);
        const f0 = H.f0FromPos(pos);
        const dep = H.PRESETS[s.preset].dependsOnF0 && !s.edited;
        s = Object.assign({}, s, { f0: f0, a: dep ? H.preset(s.preset, f0) : s.a });
      } else if (u < 0.9) {
        // 拖曳一根長條：40% 拖到底（0）、10% 拖到頂（1），其餘隨機
        const k = rnd() < 0.5 ? sel : 1 + Math.floor(rnd() * 16);
        sel = k;
        if (k > s.N) continue;
        const v = rnd(), val = v < 0.4 ? 0 : v < 0.5 ? 1 : r2(rnd());
        const a = s.a.slice(), old = a[k - 1];
        a[k - 1] = (old < 0 ? -1 : 1) * val;
        s = Object.assign({}, s, { a: a, edited: s.edited || Math.abs(a[k - 1] - old) >= 0.005 });
      } else continue;
      events++;
      const ev = toneEv(s);
      hidden.forEach(m => { m.mem = {}; if (m.check(ev, m.mem)) hits[m.id] = (hits[m.id] || 0) + 1; });
    }
  }
  const ids = Object.keys(hits);
  if (ids.length) { fail++; console.log('  ✗ 亂按 ' + events + ' 次誤觸：' + ids.map(i => i + ' ×' + hits[i]).join('、')); }
  else console.log('  ✓ 模擬亂按 ' + events + ' 次（400 回合 × 200 步：預設音色、相位、換一組、泛音數、基頻、拖曳長條），沒有誤觸任何隱藏任務');
}

// ---------- 總覽 ----------
const pub = missions.filter(m => !m.hidden), hid = hidden;
const starsOf = m => (m.hidden ? 2 : 1) * m.level;
const stars = missions.reduce((s, m) => s + starsOf(m), 0);
console.log(`\n公開 ${pub.length} 個、隱藏 ${hid.length} 個，共 ${stars} 顆星（公開 ${pub.reduce((s, m) => s + m.level, 0)}、隱藏 ${hid.reduce((s, m) => s + starsOf(m), 0)}，隱藏任務是等級 × 2）。`);
const hl = hid.map(m => m.level);
if (hid.length !== 10) { fail++; console.log('隱藏任務不是 10 個。'); }
if (hl.some(l => l < 3 || l > 10) || hl.filter(l => l >= 7).length < 3) { fail++; console.log('隱藏任務等級要在 3–10、至少 3 個 7 級以上：' + hl.join('、')); }
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('隱藏任務超過 20 顆星（規則上限）。'); }
if (pub.length < 10 || pub.length > 12) { fail++; console.log('公開任務要 10–12 個。'); }
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，預設狀態不觸發，隱藏任務互不連帶、亂按不誤觸。');
