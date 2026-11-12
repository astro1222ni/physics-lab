/* 任務可達成的證明腳本。用法：node tools/mission-proofs/binary-search.js
 * 用核心 js/binary-search-core.js 產生與頁面完全相同的事件（searchEvent／sweepEvent／gameEvent），
 * 證明每個任務在控制項範圍內做得到、預設狀態不會觸發（第一個入門任務除外），
 * 十個隱藏任務的解法互不順便完成（印交叉檢查表），靠運氣的任務算出平均要試幾次，
 * 並用固定種子的亂按模擬（400 人 × 300 個操作）印出每個任務被碰巧完成的比例（隱藏任務要 < 2%）。
 * 控制項：卡片張數 n 4–1023（對數滑桿，點數字可輸入任何整數）；資料「排好的／有重複的值／沒排序」；
 *         「找第一個出現的位置」；「換一組資料」換亂數種子（預設種子 1112）；目標值 −999 到 9999 的整數；
 *         猜數字範圍 1 到 N：N 10–1000（滑桿每格 10，點數字可輸入任何整數）；「耍賴的電腦」。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const B = require(ROOT + 'js/binary-search-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/binary-search.js');
const byId = id => missions.find(m => m.id === 'binary-search-' + id);
const SEED = 1112;

// ---------- 與 js/binary-search.js 相同的事件資料 ----------
const data = (n, kind, seed) => B.makeData(seed == null ? SEED : seed, n, kind);
/** via：'skip'（直接看結果，預設）、'play'（開始搜尋看完）、'step'（單步走完） */
function searchEv(n, kind, t, first, seed, via) {
  const ev = B.searchEvent(data(n, kind, seed), t, !!first);
  ev.via = via || 'skip';
  return { type: 'search', data: ev };
}
/** 用第 i 張卡上的數當目標 */
function atEv(n, kind, i, first, seed, via) { return searchEv(n, kind, data(n, kind, seed).a[i], first, seed, via); }
function sweepEv(n, kind, first, seed) { return { type: 'sweep', data: B.sweepEvent(data(n, kind, seed), !!first) }; }
/** 玩一局猜數字。strategy(g) 回傳下一個要猜的數；secret 只用在誠實的電腦 */
function play(N, adversary, strategy, rand, secret) {
  const g = B.newGame(N, adversary, rand);
  if (!adversary && secret != null) g.secret = secret;
  let guard = 0;
  while (!g.done && guard++ < 5000) B.guess(g, strategy(g), rand);
  return { type: 'game', data: B.gameEvent(g) };
}
const midS = g => Math.floor((g.lo + g.hi) / 2);
const midC = g => Math.ceil((g.lo + g.hi) / 2);
const loS = g => g.lo;
const hiS = g => g.hi;
/** 第一次猜偏 k 格，之後都猜正中間 */
function slipOnce(k) { let first = true; return g => { if (first) { first = false; return Math.floor((g.lo + g.hi) / 2) + k; } return midS(g); }; }

let fail = 0;
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { ok = ok || !!m.check(e, m.mem); });
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}
/** 靠運氣的任務：重複 trials 回合，回報成功率與平均要試幾次 */
function chance(id, trials, trial, note, minRate) {
  const m = byId(id);
  const rand = B.rng(12345);
  let hit = 0;
  for (let t = 0; t < trials; t++) { m.mem = {}; if (trial(rand, t).some(e => m.check(e, m.mem))) hit++; }
  const rate = hit / trials;
  const pass = rate >= minRate;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + ' 機率：' + note + '：每回成功率 ' + (rate * 100).toFixed(1) + '%（平均約試 ' + (rate ? Math.ceil(1 / rate) : '∞') + ' 回）');
  return rate;
}
const triggered = (events, list) => (list || missions).filter(m => { m.mem = {}; return events.some(e => m.check(e, m.mem)); }).map(m => m.id.replace('binary-search-', ''));

// ---------- 預設狀態 ----------
console.log('預設狀態（n = 20、排好的、種子 1112、目標 a[12]、一般二分搜尋；猜數字 1 到 100、誠實的電腦）');
{
  const a = data(20, 'sorted').a;
  const t0 = a[Math.round(0.65 * 19)];
  const evS = searchEv(20, 'sorted', t0, false);
  const evW = sweepEv(20, 'sorted', false);
  const hitS = triggered([evS]), hitW = triggered([evW]);
  const okS = hitS.length === 1 && hitS[0] === '1';
  if (!okS || hitW.length) fail++;
  console.log((okS ? '  ✓ ' : '  ✗ ') + '直接按「開始搜尋」（目標 ' + t0 + '，線性 ' + evS.data.linCmp + ' 次、二分 ' + evS.data.binCmp + ' 次）只完成入門任務 1：' + (hitS.join('、') || '無'));
  console.log((hitW.length ? '  ✗ ' : '  ✓ ') + '直接按「每個目標都找一次」不觸發任何任務' + (hitW.length ? '：' + hitW.join('、') : ''));
  // 預設的猜數字：亂猜（從還可能的數裡隨便挑）不會完成任何隱藏任務
  const r = B.rng(7);
  let hidHit = 0;
  for (let k = 0; k < 500; k++) {
    const ev = play(100, false, g => g.lo + Math.floor(r() * (g.hi - g.lo + 1)), r);
    if (triggered([ev], missions.filter(m => m.hidden)).length) hidHit++;
  }
  if (hidHit) fail++;
  console.log((hidHit ? '  ✗ ' : '  ✓ ') + '預設的猜數字亂猜 500 局，沒有一局完成隱藏任務');
}

// ---------- 公開任務 ----------
console.log('\n公開任務');
{
  const a20 = data(20, 'sorted').a;
  expect('1', [atEv(20, 'sorted', 12)], true, 'n = 20 排好的，目標 a[12] = ' + a20[12]);
  expect('1', [searchEv(20, 'sorted', B.randomAbsent(a20, B.rng(3)), false)], false, '找卡片上沒有的數');
  const out20 = B.randomAbsent(a20, B.rng(3));
  expect('2', [searchEv(20, 'sorted', out20, false)], true, 'n = 20 排好的，目標 ' + out20 + '（不在卡片上，線性比 20 次）');
  expect('2', [atEv(20, 'sorted', 3)], false, '目標在卡片上');
  expect('2', [searchEv(20, 'unsorted', out20, false)], false, '「沒排序」不算');
  expect('3', [atEv(20, 'sorted', 9)], true, 'n = 20，目標 a[9]（mid = ⌊(0 + 19)/2⌋ = 9）');
  expect('3', [atEv(15, 'sorted', 7)], true, 'n = 15，目標 a[7]');
  expect('3', [atEv(14, 'sorted', 6)], false, 'n = 14 太少張');
  expect('3', [atEv(20, 'sorted', 9, true)], false, '勾了「找第一個出現的位置」就不會 1 次結束');
  expect('4', [atEv(20, 'sorted', 0)], true, 'n = 20，目標 a[0]（線性 1 次、二分 4 次）');
  expect('4', [atEv(20, 'sorted', 9)], false, '目標 a[9]（線性 10 次、二分 1 次）');
  expect('4', [atEv(14, 'sorted', 0)], false, 'n = 14 太少張');
  expect('5', [atEv(100, 'sorted', 99)], true, 'n = 100，目標 a[99]（二分 7 次 = ⌊log₂100⌋ + 1）');
  expect('5', [atEv(100, 'sorted', 49)], false, '目標 a[49]（1 次）');
  expect('5', [atEv(99, 'sorted', 98)], false, 'n = 99 太少張');
  expect('6', [play(100, false, midS, B.rng(1), 37)], true, '1 到 100（答案 37），每次猜正中間');
  {
    let worst = 0;
    for (let s = 1; s <= 100; s++) worst = Math.max(worst, play(100, false, midS, B.rng(s), s).data.guesses);
    const ok = worst <= 7;
    if (!ok) fail++;
    console.log((ok ? '  ✓ ' : '  ✗ ') + '6   每次猜正中間：答案是 1 到 100 的任何一個數，最多都只要 ' + worst + ' 次');
  }
  expect('6', [play(100, false, loS, B.rng(1), 50)], false, '從 1 開始一個一個猜（答案 50，猜 50 次）');
  {
    const a = data(20, 'unsorted').a;
    const miss = a.filter(v => B.binarySearch(a, v, false).found < 0);
    expect('7', [searchEv(20, 'unsorted', miss[0], false)], true, 'n = 20 沒排序，目標 ' + miss[0] + '（卡片上有，二分搜尋說找不到；這組 20 個數中有 ' + miss.length + ' 個會漏）');
    const hitV = a.find(v => B.binarySearch(a, v, false).found >= 0);
    expect('7', [searchEv(20, 'unsorted', hitV, false)], false, '目標 ' + hitV + '（剛好找得到）');
    expect('7', [atEv(20, 'sorted', 5)], false, '排好的不會漏');
  }
  {
    let nMin = 0;
    for (let n = 4; n <= B.MAX_N; n++) if (sweepEv(n, 'sorted').data.ratio >= 50) { nMin = n; break; }
    expect('8', [sweepEv(1023, 'sorted')], true, 'n = 1023 排好的（' + B.trim(sweepEv(1023, 'sorted').data.ratio, 2) + ' 倍）');
    expect('8', [sweepEv(nMin, 'sorted')], true, 'n = ' + nMin + '（做得到的最小 n，' + B.trim(sweepEv(nMin, 'sorted').data.ratio, 2) + ' 倍）');
    expect('8', [sweepEv(nMin - 1, 'sorted')], false, 'n = ' + (nMin - 1) + '（' + B.trim(sweepEv(nMin - 1, 'sorted').data.ratio, 2) + ' 倍）');
    expect('8', [sweepEv(1023, 'unsorted')], false, '沒排序不算');
  }
  {
    const n = 20, a = data(n, 'dups').a;
    const keys = Array.from(new Set(a));
    const good = keys.filter(v => { const e = searchEv(n, 'dups', v, true).data; return e.count >= 2 && e.plainIdx !== e.firstIdx; });
    const plainFirst = keys.filter(v => { const e = searchEv(n, 'dups', v, true).data; return e.count >= 2 && e.plainIdx === e.firstIdx; });
    console.log('      （n = 20 有重複的值：' + a.join(' ') + '）');
    expect('9', [searchEv(n, 'dups', good[0], true)], true, 'n = 20 有重複的值，勾「找第一個出現的位置」，目標 ' + good[0] + '（重複的數中有 ' + good.length + ' 個合格）');
    if (plainFirst.length) expect('9', [searchEv(n, 'dups', plainFirst[0], true)], false, '目標 ' + plainFirst[0] + '：一般版剛好停在第一個');
    expect('9', [searchEv(n, 'dups', good[0], false)], false, '沒勾「找第一個出現的位置」');
  }
  {
    let worst = 0;
    for (let s = 1; s <= 1000; s++) worst = Math.max(worst, play(1000, false, midS, B.rng(s), s).data.guesses);
    const ok = worst <= 10;
    if (!ok) fail++;
    console.log((ok ? '  ✓ ' : '  ✗ ') + '10  達成：1 到 1000，每次猜正中間：答案是任何一個數，最多都只要 ' + worst + ' 次');
    expect('10', [play(1000, false, loS, B.rng(1), 500)], false, '從 1 開始一個一個猜（答案 500）');
  }
  expect('11', [play(100, true, midS, B.rng(1))], true, '耍賴的電腦、1 到 100，每次猜正中間（' + play(100, true, midS, B.rng(1)).data.guesses + ' 次）');
  expect('11', [play(100, true, midC, B.rng(2))], true, '每次猜正中間（偶數個時取右邊那個）');
  expect('11', [play(100, true, slipOnce(15), B.rng(3))], false, '第一次猜 65（偏 15 格，還剩 64 個數；共 ' + play(100, true, slipOnce(15), B.rng(3)).data.guesses + ' 次）');
  expect('11', [play(100, false, midS, B.rng(4), 37)], false, '沒勾「耍賴的電腦」不算（那是任務 6）');
  expect('12', [play(1000, true, midS, B.rng(1))], true, '耍賴的電腦、1 到 1000，每次猜正中間（' + play(1000, true, midS, B.rng(1)).data.guesses + ' 次）');
  expect('12', [play(1000, true, slipOnce(13), B.rng(5))], false, '第一次猜 513（偏 13 格，還剩 512 個數；共 ' + play(1000, true, slipOnce(13), B.rng(5)).data.guesses + ' 次）');
  {
    // 耍賴的電腦：任何策略都不可能少於 ⌈log₂(N+1)⌉ 次（隨機策略 2000 局）
    const r = B.rng(99);
    let min = Infinity;
    for (let k = 0; k < 2000; k++) min = Math.min(min, play(100, true, g => g.lo + Math.floor(r() * (g.hi - g.lo + 1)), r).data.guesses);
    const ok = min >= 7;
    if (!ok) fail++;
    console.log((ok ? '  ✓ ' : '  ✗ ') + '11  說明：耍賴的電腦面前隨便猜 2000 局，最少也要 ' + min + ' 次（理論下限 ⌈log₂101⌉ = 7）');
  }
}

// ---------- 隱藏任務：解法 ----------
console.log('\n隱藏任務');
const sol = {};
{
  sol.h1 = [atEv(100, 'sorted', 99)];
  expect('h1', sol.h1, true, 'n = 100 排好的，目標 a[99]（最大的數：線性 100 次、二分 7 次）');
  expect('h1', [atEv(99, 'sorted', 98)], false, 'n = 99 太少張');
  expect('h1', [atEv(100, 'sorted', 98)], false, '目標 a[98]（線性 99 次）');

  // 龜兔同時：n ≥ 63，找線性與二分比較次數相同（≥ 4）的卡片，而且要看著它們跑完（「開始搜尋」或「單步」，不是「直接看結果」）
  let h2 = null;
  for (let n = 63; n <= 200 && !h2; n++) for (let i = 0; i < 12 && !h2; i++) {
    const e = atEv(n, 'sorted', i).data;
    if (e.linCmp === e.binCmp && e.binCmp >= 4) h2 = { n: n, i: i, c: e.binCmp };
  }
  sol.h2 = [atEv(h2.n, 'sorted', h2.i, false, null, 'play')];
  expect('h2', sol.h2, true, 'n = ' + h2.n + ' 排好的，目標 a[' + h2.i + ']，按「開始搜尋」看完（兩邊都比 ' + h2.c + ' 次）');
  expect('h2', [atEv(h2.n, 'sorted', h2.i, false, null, 'step')], true, '同上，用「單步」走完');
  expect('h2', [atEv(h2.n, 'sorted', h2.i)], false, '同上，但按「直接看結果」');
  expect('h2', [atEv(31, 'sorted', 4, false, null, 'play')], false, 'n = 31 目標 a[4]（都 5 次，但 n 太小）');
  {
    let cnt = 0;
    for (let n = 63; n <= B.MAX_N; n++) for (let i = 0; i < 12; i++) { const e = atEv(n, 'sorted', i).data; if (e.linCmp === e.binCmp && e.binCmp >= 4) { cnt++; break; } }
    console.log('      （n = 63 到 1023 中有 ' + cnt + ' 種 n 做得到；合格的卡一定在最前面幾張）');
  }

  // 指認兩端：n ≥ 31，出現 ≥ 5 次的數，一般二分搜尋停在最後一個
  let h3 = null, h3count = 0;
  for (let n = 31; n <= B.MAX_N; n++) {
    const a = data(n, 'dups').a;
    for (const v of new Set(a)) { const e = searchEv(n, 'dups', v, false).data; if (e.count >= 5 && e.binFound === e.lastIdx) { h3count++; if (!h3) h3 = { n: n, v: v, e: e }; break; } }
  }
  sol.h3 = [searchEv(h3.n, 'dups', h3.v, false)];
  expect('h3', sol.h3, true, 'n = ' + h3.n + ' 有重複的值，目標 ' + h3.v + '（出現 ' + h3.e.count + ' 次，線性停在 a[' + h3.e.firstIdx + ']、二分停在最後一個 a[' + h3.e.lastIdx + ']）');
  console.log('      （預設種子下 n = 31 到 1023 中有 ' + h3count + ' 種 n 做得到）');
  expect('h3', [searchEv(h3.n, 'dups', h3.v, true)], false, '勾了「找第一個出現的位置」');
  {
    let ex = null;
    for (let n = 31; n <= 200 && !ex; n++) { const a = data(n, 'dups').a; for (const v of new Set(a)) { const e = searchEv(n, 'dups', v, false).data; if (e.count >= 3 && e.count < 5 && e.binFound === e.lastIdx) { ex = { n: n, v: v, c: e.count }; break; } } }
    if (ex) expect('h3', [searchEv(ex.n, 'dups', ex.v, false)], false, 'n = ' + ex.n + ' 目標 ' + ex.v + '（停在最後一個，但只出現 ' + ex.c + ' 次）');
  }

  sol.h4 = [play(10, true, loS, B.rng(1))];
  expect('h4', sol.h4, true, '耍賴的電腦、1 到 10，從 1 開始一個一個往上猜（10 次）');
  expect('h4', [play(100, true, hiS, B.rng(1))], true, '耍賴的電腦、1 到 100，從 100 一個一個往下猜（100 次）');
  expect('h4', [play(10, true, midS, B.rng(1))], false, '猜正中間');
  expect('h4', [play(10, false, loS, B.rng(1), 10)], false, '誠實的電腦（答案 10）不算');

  // 一眼認出卻要問到底：n ≥ 31，中間那張的數，左邊至少還有兩張同樣的數
  let h5 = null, h5count = 0;
  for (let n = 31; n <= B.MAX_N; n++) {
    const a = data(n, 'dups').a, m = Math.floor((n - 1) / 2);
    if (a[m - 2] === a[m]) { h5count++; if (!h5) h5 = { n: n, v: a[m], m: m }; }
  }
  sol.h5 = [searchEv(h5.n, 'dups', h5.v, true)];
  const e5 = sol.h5[0].data;
  expect('h5', sol.h5, true, 'n = ' + h5.n + ' 有重複的值，勾「找第一個出現的位置」，目標 a[' + h5.m + '] = ' + h5.v + '（一般版第 1 次就停在 a[' + e5.plainIdx + ']，找第一個要比 ' + e5.binCmp + ' 次、停在 a[' + e5.firstIdx + ']）');
  console.log('      （預設種子下 n = 31 到 1023 中有 ' + h5count + ' 種 n 做得到）');
  expect('h5', [searchEv(h5.n, 'dups', h5.v, false)], false, '沒勾「找第一個出現的位置」');
  {
    let ex = null;
    for (let n = 31; n <= B.MAX_N && !ex; n++) { const a = data(n, 'dups').a, m = Math.floor((n - 1) / 2); if (a[m - 1] === a[m] && a[m - 2] !== a[m]) ex = { n: n, v: a[m] }; }
    if (ex) expect('h5', [searchEv(ex.n, 'dups', ex.v, true)], false, 'n = ' + ex.n + ' 目標 ' + ex.v + '（左邊只有一張同樣的數）');
  }

  sol.h6 = [sweepEv(31, 'sorted')];
  expect('h6', sol.h6, true, 'n = 31 排好的，「每個目標都找一次」（找不到時都比 5 次）');
  expect('h6', [sweepEv(63, 'sorted')], true, 'n = 63（都比 6 次）');
  expect('h6', [sweepEv(31, 'sorted', true)], false, 'n = 31 但勾了「找第一個出現的位置」');
  expect('h6', [sweepEv(15, 'sorted')], false, 'n = 15 太少張');
  expect('h6', [sweepEv(20, 'sorted')], false, 'n = 20（4 或 5 次）');
  expect('h6', [sweepEv(127, 'sorted')], false, 'n = 127 超出 31–63');

  sol.h7 = [atEv(127, 'sorted', 0)];
  expect('h7', sol.h7, true, 'n = 127 排好的，目標 a[0]（線性 1 次、二分 7 次）');
  expect('h7', [atEv(255, 'sorted', 0)], true, 'n = 255，目標 a[0]（二分 8 次）');
  expect('h7', [atEv(1023, 'sorted', 0)], false, 'n = 1023（滑桿最右端，太容易碰巧，不算）');
  expect('h7', [atEv(100, 'sorted', 0)], false, 'n = 100，目標 a[0]（二分 ' + atEv(100, 'sorted', 0).data.binCmp + ' 次，不是最壞的 7 次）');
  {
    const ns = [];
    for (let n = 100; n <= B.MAX_N; n++) if (triggered([atEv(n, 'sorted', 0)], [byId('h7')]).length) ns.push(n);
    console.log('      （n ≥ 100 中只有 n = ' + ns.join('、') + ' 做得到：每一層都排滿的樹）');
  }

  sol.h8 = [atEv(31, 'sorted', 2), atEv(32, 'sorted', 31)];
  expect('h8', sol.h8, true, 'n = 31 目標 a[2]（5 次），再 n = 32 目標 a[31]（6 次）');
  expect('h8', [atEv(127, 'sorted', 2), atEv(128, 'sorted', 127)], true, 'n = 127 目標 a[2]（7 次）、n = 128 目標 a[127]（8 次；n ≥ 100 時最後一張會順便完成 h1）');
  expect('h8', [atEv(127, 'sorted', 126)], false, '只做 n = 127');
  expect('h8', [atEv(127, 'sorted', 126), atEv(256, 'sorted', 255)], false, 'n = 127 與 n = 256（不是同一層）');
  expect('h8', [atEv(15, 'sorted', 14), atEv(16, 'sorted', 15)], false, 'n = 15、16 太少張');

  // 迷宮：沒排序的卡片，二分搜尋剛好一路轉對、在最深一層找到
  let h9 = null;
  for (let n = 31; n <= 200 && !h9; n++) {
    const a = data(n, 'unsorted').a;
    for (const v of a) { const e = searchEv(n, 'unsorted', v, false).data; if (e.binFound >= 0 && e.binCmp === e.worst) { h9 = { n: n, v: v, e: e }; break; } }
  }
  sol.h9 = [searchEv(h9.n, 'unsorted', h9.v, false)];
  expect('h9', sol.h9, true, 'n = ' + h9.n + ' 沒排序，目標 ' + h9.v + '（二分搜尋在 a[' + h9.e.binFound + '] 找到，比了 ' + h9.e.binCmp + ' 次 = 樹高）');
  expect('h9', [atEv(h9.n, 'sorted', h9.n - 1)], false, '排好的不算');

  sol.h10 = [play(63, true, midS, B.rng(1))];
  expect('h10', sol.h10, true, '耍賴的電腦、輸入 N = 63，每次猜正中間（6 次）');
  expect('h10', [play(127, true, midC, B.rng(2))], true, 'N = 127（7 次）');
  expect('h10', [play(63, true, slipOnce(1), B.rng(3))], false, 'N = 63 第一次猜偏 1 格（' + play(63, true, slipOnce(1), B.rng(3)).data.guesses + ' 次）');
  expect('h10', [play(100, true, midS, B.rng(4))], false, 'N = 100（101 不是 2 的冪）');
  expect('h10', [play(31, true, midS, B.rng(5))], false, 'N = 31 太小');
  {
    // 1 到 63 的範圍要 6 次猜完：每次都得猜在正中間（這裡用亂數驗證「偏一格就多一次」）
    const r = B.rng(11);
    let ok = true;
    for (let k = 0; k < 300; k++) {
      let off = false;
      const ev = play(63, true, g => { const mid = (g.lo + g.hi) / 2; let x = Math.round(mid); if (r() < 0.15 && g.hi > g.lo) { x = Math.max(g.lo, Math.min(g.hi, x + (r() < 0.5 ? -1 : 1))); } if (x !== mid && g.hi > g.lo && (g.hi - g.lo) % 2 === 0) off = true; return x; }, r);
      if (off && ev.data.guesses === 6) ok = false;
    }
    if (!ok) fail++;
    console.log((ok ? '  ✓ ' : '  ✗ ') + 'h10 說明：N = 63 時只要有一次沒猜在正中間，就一定超過 6 次（亂數 300 局）');
  }
}

// ---------- 靠運氣的任務 ----------
console.log('\n靠運氣的任務（固定種子模擬：照解法刻意去找時，平均要試幾次）');
{
  const fresh = (r, n, kind) => data(n, kind, 1 + Math.floor(r() * 1e9));
  chance('7', 2000, r => { const a = fresh(r, 20, 'unsorted'); return [{ type: 'search', data: B.searchEvent(a, B.randomPresent(a.a, r), false) }]; }, 'n = 20 沒排序、換資料後按一次「隨機挑一個有的」', 0.3);
  chance('9', 2000, r => { const a = fresh(r, 20, 'dups'); return [{ type: 'search', data: B.searchEvent(a, B.randomPresent(a.a, r), true) }]; }, 'n = 20 有重複的值、勾「找第一個出現的位置」、按一次「隨機挑一個有的」', 0.1);
  chance('h3', 1000, r => { const a = fresh(r, 100, 'dups'); return Array.from(new Set(a.a)).map(v => ({ type: 'search', data: B.searchEvent(a, v, false) })); }, 'n = 100 有重複的值、把出現很多次的數都試一次（換一組資料）', 0.1);
  chance('h5', 2000, r => { const n = 63, a = fresh(r, n, 'dups'); return [{ type: 'search', data: B.searchEvent(a, a.a[Math.floor((n - 1) / 2)], true) }]; }, 'n = 63 有重複的值、勾「找第一個出現的位置」、目標設成正中間那張（按「換一組資料」直到它左邊兩張也是同一個數）', 0.05);
  chance('h9', 2000, r => { const a = fresh(r, 31, 'unsorted'); return [{ type: 'search', data: B.searchEvent(a, B.randomPresent(a.a, r), false) }]; }, 'n = 31 沒排序、按一次「隨機挑一個有的」', 0.005);
  chance('h9', 2000, r => { const a = fresh(r, 31, 'unsorted'); return a.a.map(v => ({ type: 'search', data: B.searchEvent(a, v, false) })); }, 'n = 31 沒排序、把 31 張卡都點一次（換一組資料）', 0.5);
  chance('6', 2000, r => [play(100, false, g => g.lo + Math.floor(r() * (g.hi - g.lo + 1)), r)], '1 到 100 在「還可能」的範圍裡隨便猜', 0.1);
}

// ---------- 亂按模擬：像學生隨便點，任務被碰巧完成的比例 ----------
// 每人從預設狀態開始，隨機做 300 個操作（各控制項機會均等）：拉 n（含拉到兩端、亂打數字）、切三種資料、勾找第一個、換資料、
// 點卡片、點決策樹（先落在某一層再挑節點）、隨機挑有的／沒有的、亂打目標、方向鍵、開始搜尋（一半機會看到跑完）、單步、直接看結果、
// 每個目標都找一次、猜數字（改 N、切耍賴、隨便猜）。事件全由核心產生，與頁面相同。標準：每個隱藏任務 < 2%。
const MONKEY_PEOPLE = 400, MONKEY_ACTIONS = 300;
function monkey(people, actions, seed) {
  const r = B.rng(seed);
  const N_LN = Math.log(B.MAX_N / B.MIN_N);
  const nFromPos = p => Math.max(B.MIN_N, Math.min(B.MAX_N, Math.round(B.MIN_N * Math.exp(N_LN * p / 1000))));
  const dataCache = new Map(), sweepCache = new Map();
  const dataOf = (sd, n, kind) => { const k = sd + '|' + n + '|' + kind; let d = dataCache.get(k); if (!d) { if (dataCache.size > 4000) dataCache.clear(); d = B.makeData(sd, n, kind); dataCache.set(k, d); } return d; };
  const sweepOf = (d, first) => { const k = d.seed + '|' + d.n + '|' + d.kind + '|' + first; let e = sweepCache.get(k); if (!e) { if (sweepCache.size > 4000) sweepCache.clear(); e = B.sweepEvent(d, first); sweepCache.set(k, e); } return e; };
  const ACTS = ['n', 'n', 'nType', 'sorted', 'dups', 'unsorted', 'first', 'reseed', 'card', 'card', 'tree', 'rndIn', 'rndOut', 'typeT', 'key',
    'start', 'step', 'step', 'skip', 'restart', 'sweep', 'clear', 'log', 'speed', 'gN', 'cheat', 'newGame', 'guess', 'guess', 'guess', 'gType'];
  const pick = arr => arr[Math.floor(r() * arr.length)];
  const count = {}, evN = { search: 0, sweep: 0, game: 0 };
  missions.forEach(m => { count[m.id] = 0; });
  for (let p = 0; p < people; p++) {
    missions.forEach(m => { m.mem = {}; m.got = false; });
    const fire = ev => { evN[ev.type]++; missions.forEach(m => { if (!m.got && m.check(ev, m.mem)) { m.got = true; count[m.id]++; } }); };
    const s = { n: 20, kind: 'sorted', first: false, seed: SEED, steps: 0, gN: 100, adv: false };
    let d = dataOf(s.seed, s.n, s.kind);
    s.t = d.a[Math.round(0.65 * 19)];
    let g = B.newGame(s.gN, s.adv, r);
    const refresh = () => { d = dataOf(s.seed, s.n, s.kind); s.steps = 0; };
    const search = via => { const e = B.searchEvent(d, s.t, s.first); e.via = via; s.steps = 0; fire({ type: 'search', data: e }); };
    const newGame = () => { g = B.newGame(s.gN, s.adv, r); };
    for (let k = 0; k < actions; k++) {
      const a = pick(ACTS);
      if (a === 'n') { const u = r(); s.n = nFromPos(u < 0.15 ? 0 : u < 0.3 ? 1000 : Math.round(r() * 1000)); refresh(); }
      else if (a === 'nType') { s.n = pick([B.MAX_N, B.MIN_N, B.MIN_N, B.MAX_N, Math.max(B.MIN_N, Math.min(B.MAX_N, 1 + Math.floor(r() * 1100)))]); refresh(); }
      else if (a === 'sorted' || a === 'dups' || a === 'unsorted') { s.kind = a; refresh(); }
      else if (a === 'first') { s.first = !s.first; s.steps = 0; }
      else if (a === 'reseed') { s.seed = 1 + Math.floor(r() * 2147483646); refresh(); }
      else if (a === 'card') { s.t = d.a[Math.floor(r() * s.n)]; s.steps = 0; }
      else if (a === 'tree') {
        const TR = B.tree(s.n), lv = Math.floor(r() * TR.height), list = [];
        for (let i = 0; i < s.n; i++) if (TR.depth[i] === lv) list.push(i);
        s.t = d.a[pick(list)]; s.steps = 0;
      }
      else if (a === 'rndIn') { s.t = B.randomPresent(d.a, r); s.steps = 0; }
      else if (a === 'rndOut') { s.t = B.randomAbsent(d.a, r); s.steps = 0; }
      else if (a === 'typeT') { s.t = pick([Math.floor(r() * 100), Math.floor(r() * 1000), -5, 9999, 0, 1]); s.steps = 0; }
      else if (a === 'key') { s.t += pick([-1, 1]); s.steps = 0; }
      else if (a === 'start') { if (r() < 0.5) search('play'); }
      else if (a === 'step') { s.steps++; const e = B.searchEvent(d, s.t, s.first); if (s.steps >= Math.max(e.linCmp, e.binCmp)) search('step'); }
      else if (a === 'skip') search('skip');
      else if (a === 'restart') s.steps = 0;
      else if (a === 'sweep') fire({ type: 'sweep', data: sweepOf(d, s.first) });
      else if (a === 'clear') newGame();
      else if (a === 'gN') { const u = r(); s.gN = u < 0.15 ? 10 : u < 0.3 ? 1000 : 10 * (1 + Math.floor(r() * 100)); newGame(); }
      else if (a === 'gType') { s.gN = pick([10, 1000, 10, 1000, 10 + Math.floor(r() * 991)]); newGame(); }
      else if (a === 'cheat') { s.adv = !s.adv; newGame(); }
      else if (a === 'newGame') newGame();
      else if (a === 'guess' && !g.done) {
        const u = r();
        if (u >= 0.8) continue; // 打了不合法的數（小數、超出範圍）被拒絕
        const x = u < 0.5 ? 1 + Math.floor(r() * g.N) : g.lo + Math.floor(r() * (g.hi - g.lo + 1));
        if (B.guess(g, x, r).result === 'hit') fire({ type: 'game', data: B.gameEvent(g) });
      }
    }
  }
  return { count: count, evN: evN };
}
{
  const res = monkey(MONKEY_PEOPLE, MONKEY_ACTIONS, 20261112);
  console.log(`\n亂按模擬（${MONKEY_PEOPLE} 人 × 每人 ${MONKEY_ACTIONS} 個操作；共 ${res.evN.search} 次搜尋、${res.evN.sweep} 次「每個目標都找一次」、${res.evN.game} 局猜中）`);
  const line = list => list.map(m => m.id.replace('binary-search-', '') + ' ' + (100 * res.count[m.id] / MONKEY_PEOPLE).toFixed(2) + '%').join('、');
  console.log('  公開：' + line(missions.filter(m => !m.hidden)));
  console.log('  隱藏：' + line(missions.filter(m => m.hidden)));
  const over = missions.filter(m => m.hidden && res.count[m.id] / MONKEY_PEOPLE >= 0.02);
  if (over.length) { fail++; console.log('  ✗ 隱藏任務碰巧完成 ≥ 2%：' + over.map(m => m.id).join('、')); }
  else console.log('  ✓ 每個隱藏任務被碰巧完成的比例都 < 2%（最高 ' + Math.max.apply(null, missions.filter(m => m.hidden).map(m => 100 * res.count[m.id] / MONKEY_PEOPLE)).toFixed(2) + '%）');
}

// ---------- 隱藏任務交叉檢查 ----------
console.log('\n隱藏任務交叉檢查（列 = 照這個解法做，欄 = 會不會順便完成；● 本身、· 沒有、✗ 順便完成）');
{
  const hid = missions.filter(m => m.hidden);
  const ids = hid.map(m => m.id.replace('binary-search-', ''));
  console.log('       ' + ids.map(s => s.padStart(4)).join(''));
  let bad = 0;
  ids.forEach(row => {
    const evs = sol[row];
    const cells = hid.map(m => {
      m.mem = {};
      const ok = evs.some(e => m.check(e, m.mem));
      const self = m.id.endsWith('-' + row);
      if (self && !ok) bad++;
      if (!self && ok) bad++;
      return (self ? (ok ? '●' : '?') : ok ? '✗' : '·').padStart(4);
    });
    const pubHit = triggered(evs, missions.filter(m => !m.hidden));
    console.log('  ' + row.padEnd(5) + cells.join('') + '   （也完成公開任務：' + (pubHit.join('、') || '無') + '）');
  });
  if (bad) { fail++; console.log('  ✗ 交叉檢查有 ' + bad + ' 格不符'); }
  else console.log('  ✓ 每個隱藏任務的解法只完成它自己');
}

// ---------- 總覽 ----------
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;   // 隱藏任務星星加倍（與 js/missions.js 的 LabMission.starsOf 相同）
const stars = missions.reduce((s, m) => s + starsOf(m), 0);
console.log(`\n公開 ${pub.length} 個、隱藏 ${hid.length} 個，共 ${stars} 顆星（公開 ${pub.reduce((s, m) => s + m.level, 0)}、隱藏 ${hid.reduce((s, m) => s + starsOf(m), 0)}，隱藏任務是等級 × 2）。`);
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('隱藏任務超過 20 顆星（規則上限）。'); }
if (pub.length < 8 || pub.length > 12 || hid.length !== 10) { fail++; console.log('任務數量不符合規定（公開 8–12、隱藏 10）。'); }
const idsAll = missions.map(m => m.id);
if (new Set(idsAll).size !== idsAll.length) { fail++; console.log('任務代號重複。'); }
if (hid.some(m => !m.riddle || m.desc)) { fail++; console.log('隱藏任務要用 riddle、不寫 desc。'); }
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，預設狀態不觸發（入門任務除外），隱藏任務互不順便完成。');
