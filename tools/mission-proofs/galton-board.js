/* 任務可達成的證明腳本。用法：node tools/mission-proofs/galton-board.js
 * 用數學核心證明每個任務在滑桿範圍與精度內做得到（事件格式與 js/galton-board.js 相同），
 * 靠運氣的任務用固定種子的亂數實際模擬，算出平均要試幾次；並確認預設狀態不會觸發任務。
 * 滑桿：n 1–16（整數）、p 0–1（0.05；點數字可輸入到 0.01）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const G = require(ROOT + 'js/galton-board-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/galton-board.js');
const byId = id => missions.find(m => m.id === 'galton-board-' + id);

// ---------- 與 js/galton-board.js 相同的事件資料 ----------
function dropEv(n, p, counts, hidden) {
  const st = G.stats(counts);
  return { type: 'drop', data: { src: 'ball', n: n, p: p, hidden: !!hidden, N: st.N, mean: st.mean, variance: st.variance, tv: G.tv(counts, G.pmf(n, p)), counts: counts.slice() } };
}
function boardEv(n, p) {
  return { type: 'board', data: { n: n, p: p, mean: G.mean(n, p), variance: G.variance(n, p), normErr: G.maxNormalErr(n, p), modes: G.modes(n, p) } };
}
function selectEv(n, p, k) {
  const P = G.pmf(n, p);
  return { type: 'select', data: { src: 'tap', n: n, p: p, k: k, prob: P[k], paths: G.choose(n, k), isTop: G.topBins(P).indexOf(k) >= 0 } };
}
function guessEv(n, p, guess, N) { return { type: 'guess', data: { n: n, p: p, guess: guess, N: N, err: Math.abs(guess - p), round: 1 } }; }
/** 一顆一顆落下（每顆一個事件），回傳事件陣列 */
function dropSeq(rand, n, p, count, counts, hidden) {
  counts = counts || G.zeros(n + 1);
  const out = [];
  for (let i = 0; i < count; i++) { counts[G.drop(rand, n, p).k]++; out.push(dropEv(n, p, counts, hidden)); }
  return out;
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
/** 靠運氣的任務：重複 trials 回合，每回合跑 trial(rand) 回傳事件；回報成功率 */
function chance(id, trials, trial, note, minRate) {
  const m = byId(id);
  const rand = G.rng(12345);
  let hit = 0;
  for (let t = 0; t < trials; t++) { m.mem = {}; if (trial(rand).some(e => m.check(e, m.mem))) hit++; }
  const rate = hit / trials;
  const pass = rate >= minRate;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + ' 機率：' + note + '：每回合成功率 ' + (rate * 100).toFixed(1) + '%（平均約試 ' + (rate ? Math.ceil(1 / rate) : '∞') + ' 回）');
}

// ---------- 預設狀態不觸發 ----------
{
  const defaults = [boardEv(10, 0.5)];
  const hit = missions.filter(m => { m.mem = {}; return m.id !== 'galton-board-1' && defaults.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設釘板（n = 10、p = 0.5）不觸發任何任務');
}

// ---------- 確定做得到的任務 ----------
expect('1', dropSeq(G.rng(1), 10, 0.5, 1), true, '放一顆球');
expect('2', [selectEv(10, 0.5, 5)], true, 'n = 10、p = 0.5 選第 5 格');
expect('2', [selectEv(10, 0.5, 4)], false, '第 4 格不是最大');
expect('2', [selectEv(3, 0.5, 1)], false, 'n = 3 太少層');
expect('2', [selectEv(9, 0.3, 2)], true, 'n = 9、p = 0.3：第 2、3 格並列，選第 2 格也算');
expect('4', [selectEv(10, 0.5, 0)], true, 'n = 10、p = 0.5 的第 0 格');
expect('4', [selectEv(5, 0.75, 0)], true, 'n = 5、p = 0.75 的第 0 格：(1/4)⁵');
expect('4', [selectEv(10, 0.5, 1)], false, '第 1 格是 10/1024');
expect('5', [selectEv(10, 0.5, 3)], true, 'C(10, 3) = 120');
expect('5', [selectEv(16, 0.5, 14)], true, 'C(16, 14) = 120');
expect('5', [selectEv(10, 0.5, 4)], false, 'C(10, 4) = 210');
expect('6', [boardEv(10, 0.6)], true, 'n = 10、p = 0.6');
expect('6', [boardEv(15, 0.4)], false, 'n = 15、p = 0.4：平均 6、變異數 3.6');
expect('7', [boardEv(14, 0.5)], true, 'n = 14、p = 0.5（誤差 ' + G.maxNormalErr(14, 0.5).toFixed(5) + '）');
expect('7', [boardEv(16, 0.5)], true, 'n = 16、p = 0.5（誤差 ' + G.maxNormalErr(16, 0.5).toFixed(5) + '）');
expect('7', [boardEv(13, 0.5)], false, 'n = 13、p = 0.5（誤差 ' + G.maxNormalErr(13, 0.5).toFixed(5) + '）');
expect('7', [boardEv(16, 0.45)], false, 'n = 16、p = 0.45（誤差 ' + G.maxNormalErr(16, 0.45).toFixed(5) + '）');
expect('8', [boardEv(9, 0.3)], true, 'n = 9、p = 0.3：(n + 1)p = 3');
expect('8', [boardEv(4, 0.2)], true, 'n = 4、p = 0.2：(n + 1)p = 1');
expect('8', [boardEv(9, 0.5)], false, 'n = 9、p = 0.5 不算（p 要 ≠ 0.5）');
expect('8', [boardEv(10, 0.3)], false, 'n = 10、p = 0.3：(n + 1)p = 3.3 不是整數');
expect('9', [guessEv(10, 0.37, 0.36, 300)], true, '猜 0.36（差 0.01）');
expect('9', [guessEv(10, 0.37, 0.34, 300)], false, '猜 0.34（差 0.03）');
expect('12', [guessEv(16, 0.37, 0.36, 50)], true, '50 顆球、猜差 0.01');
expect('12', [guessEv(16, 0.37, 0.37, 51)], false, '用了 51 顆球');
expect('h1', dropSeq(G.rng(2), 10, 1, 10), true, 'n = 10、p = 1：10 顆球全部落在最右格');
expect('h1', dropSeq(G.rng(2), 10, 0.95, 10), false, 'p = 0.95 不算');
expect('h2', [dropEv(3, 0.5, [1, 3, 3, 1])], true, 'n = 3、8 顆球恰好排成 1、3、3、1');
expect('h2', [dropEv(3, 0.5, [1, 3, 3, 2])], false, '9 顆球不算');
expect('3', [dropEv(1, 0.3, [70, 30])], true, 'n = 1、p = 0.3、100 顆中 30 顆往右');
expect('3', [dropEv(1, 0.3, [74, 26])], false, '26 顆往右（差 0.04）');
expect('3', [dropEv(1, 0.3, [70, 30], true)], false, '挑戰神祕的 p 時不算');

// ---------- 靠運氣的任務：實際模擬 ----------
console.log('  （以下用固定種子實際落球）');
chance('3', 200, r => dropSeq(r, 1, 0.3, 400), 'n = 1、p = 0.3 一顆顆放到 400 顆', 0.9);
chance('10', 40, r => { const c = G.zeros(11); const out = []; for (let b = 0; b < 12; b++) { G.dropMany(r, 10, 0.5, 1000, c); out.push(dropEv(10, 0.5, c)); } return out; }, 'n = 10、p = 0.5 按 12 次「瞬間 1000 顆」', 0.9);
chance('11', 40, r => { const c = G.zeros(11); const out = []; for (let b = 0; b < 20; b++) { G.dropMany(r, 10, 0.5, 1000, c); out.push(dropEv(10, 0.5, c)); } return out; }, 'n = 10、p = 0.5 按 20 次「瞬間 1000 顆」', 0.7);
chance('11', 40, r => { const c = G.zeros(11); return dropSeq(r, 10, 0.5, 3000, c); }, 'n = 10、p = 0.5 一顆顆放到 3000 顆（每顆都檢查）', 0.7);
chance('9', 400, r => { const p = G.hiddenP(r, 0.5); const c = G.dropMany(r, 16, p, 300); return [guessEv(16, p, Math.round(G.estimateP(c, 16) * 100) / 100, 300)]; }, 'n = 16、放 300 顆後猜 x̄/n', 0.9);
chance('12', 400, r => { const p = G.hiddenP(r, 0.5); const c = G.dropMany(r, 16, p, 50); return [guessEv(16, p, Math.round(G.estimateP(c, 16) * 100) / 100, 50)]; }, 'n = 16、放 50 顆後猜 x̄/n', 0.3);
chance('h2', 2000, r => dropSeq(r, 3, 0.5, 8), 'n = 3、p = 0.5 一顆顆放 8 顆', 0.03);
chance('h3', 400, r => dropSeq(r, 10, 0.5, 400), 'n = 10、p = 0.5 一顆顆放到 400 顆', 0.3);

// ---------- 總覽 ----------
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const stars = missions.reduce((s, m) => s + m.level, 0);
console.log(`\n公開 ${pub.length} 個、隱藏 ${hid.length} 個，共 ${stars} 顆星（公開 ${pub.reduce((s, m) => s + m.level, 0)}、隱藏 ${hid.reduce((s, m) => s + m.level, 0)}）。`);
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，預設狀態不觸發。');
