/* 任務可達成的證明腳本。用法：node tools/mission-proofs/big-o.js
 * 用核心 js/big-o-core.js 產生與頁面完全相同的事件（laneEvent／raceEvent／doubleEvent／compareEvent，以及 axis），
 * 證明每個任務在控制項範圍內做得到、預設狀態不會觸發（第一個入門任務除外），
 * 十個隱藏任務的解法互不順便完成（印交叉檢查表），靠運氣的任務算出平均要試幾次，
 * 並用固定種子的亂按模擬（400 人 × 300 個操作）印出每個任務被碰巧完成的比例（隱藏任務要 < 2%）。
 * 控制項：元素個數 n 1–1000（對數滑桿，點數字可輸入任何整數；點圖或方向鍵也能改 n）；速度每秒 1–1000000 個操作；
 *         合併排序的資料「隨機／已排好／最壞情況」與「換一組資料」（預設種子 1113）；「開始賽跑」「單步」「直接跑完」「重來」；
 *         「n 加倍」（2n ≤ 1000 才能按）；座標「線性／半對數／雙對數」；常數因子 A = a·f(n)、B = b·g(n)：
 *         f、g 是 log n、√n、n、n log n、n²、n³、2^n、n! 之一，a、b 是 1–1000 的整數（對數滑桿，點數字可輸入）。
 *         預設 n = 12、隨機、A = 10 · n log n、B = 1 · n²、線性座標。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const B = require(ROOT + 'js/big-o-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/big-o.js');
const byId = id => missions.find(m => m.id === 'big-o-' + id);
const SEED = 1113;
const ALGOS = B.ALGOS;

// ---------- 與 js/big-o.js 相同的事件資料 ----------
// 次數：二分 = ⌊log2 n⌋ + 1、循序 = n、兩兩 = n(n − 1)/2、子集合 = 2^n 都只看 n；合併排序真的跑一次（快取）。
// 下面先證明這個快速版和核心的 run() 完全一樣，模擬時才用快速版。
const mergeCache = new Map();
function mergeCount(n, shape, seed) {
  const k = n + '|' + shape + '|' + (shape === 'random' ? seed : 0);
  let v = mergeCache.get(k);
  if (v == null) { if (mergeCache.size > 20000) mergeCache.clear(); v = B.mergeSort(B.makeData(n, shape, seed)).count; mergeCache.set(k, v); }
  return v;
}
function fastCounts(n, shape, seed) {
  return { binary: B.bitLen(n), linear: n, merge: mergeCount(n, shape, seed), pairs: n * (n - 1) / 2, subsets: Math.pow(2, n) };
}
function R(n, shape, seed) { return { n: n, shape: shape, seed: seed, counts: fastCounts(n, shape, seed), formula: n > B.REAL_SUBSET_MAX }; }
function fastDouble(n0, shape, seed) {
  const n1 = 2 * n0, c0 = fastCounts(n0, shape, seed), c1 = fastCounts(n1, shape, seed), ratio = {}, diff = {};
  ALGOS.forEach(k => { ratio[k] = c0[k] > 0 ? c1[k] / c0[k] : null; diff[k] = c1[k] - c0[k]; });
  return { n0: n0, n1: n1, shape: shape, before: c0, after: c1, ratio: ratio, diff: diff };
}
const crossCache = new Map();
function fastCompare(fa, a, fb, b, n, via) {
  const k = fa + '|' + a + '|' + fb + '|' + b;
  let x = crossCache.get(k);
  if (!x) { if (crossCache.size > 50000) crossCache.clear(); x = B.crossover(fa, a, fb, b); crossCache.set(k, x); }
  return { fa: fa, a: a, fb: fb, b: b, n: n, at: B.cmpAt(fa, a, fb, b, n), equalAt: B.exactEqual(fa, a, fb, b, n), same: x.same,
    winner: x.winner, cross: x.cross, crossStrict: x.crossStrict, equal: x.equal.slice(0, 12), approx: x.approx, via: via };
}
let fail = 0;
{
  let bad = 0;
  for (let n = 1; n <= 24; n++) B.SHAPES.forEach(sh => [SEED, 7, 99991].forEach(sd => {
    if (JSON.stringify(B.counts(n, sh, sd)) !== JSON.stringify(fastCounts(n, sh, sd))) bad++;
  }));
  [30, 55, 64, 100, 256, 500, 999, 1000].forEach(n => B.SHAPES.forEach(sh => { if (JSON.stringify(B.counts(n, sh, SEED)) !== JSON.stringify(fastCounts(n, sh, SEED))) bad++; }));
  [1, 5, 10, 12, 41, 256, 500].forEach(n => { if (JSON.stringify(B.doubleEvent(n, 'random', SEED)) !== JSON.stringify(fastDouble(n, 'random', SEED))) bad++; });
  [['nlogn', 10, 'n2', 1], ['n', 1000, 'nlogn', 1], ['n2', 1, 'exp2', 1], ['log', 100, 'n', 1], ['fact', 3, 'exp2', 900]].forEach(q => [1, 4, 44, 256, 997].forEach(n => {
    if (JSON.stringify(B.compareEvent(q[0], q[1], q[2], q[3], n, 'cmp')) !== JSON.stringify(fastCompare(q[0], q[1], q[2], q[3], n, 'cmp'))) bad++;
  }));
  if (bad) fail++;
  console.log((bad ? '  ✗ ' : '  ✓ ') + '模擬用的快速版次數、加倍、比較事件與核心完全相同' + (bad ? '（' + bad + ' 處不同）' : ''));
}

/** 一場賽跑：從時鐘 0 開始，依頁面的規則依序發出 lane（同一拍跑完的一起）與最後的 race */
function raceEvents(n, shape, seed, via, upto) {
  const r = R(n, shape, seed == null ? SEED : seed);
  const tMax = Math.max.apply(null, ALGOS.map(a => r.counts[a]));
  const T = upto == null ? tMax : Math.min(upto, tMax);
  const evs = [], done = {};
  const finish = t => {
    const newly = ALGOS.filter(a => !done[a] && t >= r.counts[a]);
    newly.forEach(a => { done[a] = true; evs.push({ type: 'lane', data: B.laneEvent(r, a, via) }); });
    if (newly.length && ALGOS.every(a => done[a])) evs.push({ type: 'race', data: B.raceEvent(r, via) });
  };
  // 依跑完的先後（相同次數一起）
  const ts = Array.from(new Set([0].concat(ALGOS.map(a => r.counts[a])))).filter(t => t <= T).sort((p, q) => p - q);
  if (via === 'skip') finish(T); else ts.forEach(finish);
  return evs;
}
const race = (n, shape, via, seed) => raceEvents(n, shape || 'random', seed, via || 'skip');
const dbl = (n0, shape, seed) => {
  const ev = fastDouble(n0, shape || 'random', seed == null ? SEED : seed);
  return [{ type: 'double', data: ev }, { type: 'compare', data: fastCompare('nlogn', 10, 'n2', 1, 2 * n0, 'n') }];
};
const cmp = (fa, a, fb, b, n, via) => ({ type: 'compare', data: fastCompare(fa, a, fb, b, n == null ? 12 : n, via || 'cmp') });
/** 先選好函數與常數，再把 n 一格一格改（每改一次發一個 via 'n' 的比較事件） */
const walk = (fa, a, fb, b, ns) => [cmp(fa, a, fb, b, 12)].concat(ns.map(n => cmp(fa, a, fb, b, n, 'n')));
const axis = m => ({ type: 'axis', data: { mode: m } });

function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { ok = ok || !!m.check(e, m.mem); });
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}
function chance(id, trials, trial, note, minRate) {
  const m = byId(id);
  const rand = B.rng(12345);
  let hit = 0;
  for (let t = 0; t < trials; t++) { m.mem = {}; if (trial(rand, t).some(e => m.check(e, m.mem))) hit++; }
  const rate = hit / trials;
  const pass = rate >= minRate;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + ' 機率：' + note + '：每回成功率 ' + (rate * 100).toFixed(2) + '%（平均約試 ' + (rate ? Math.ceil(1 / rate) : '∞') + ' 回）');
  return rate;
}
const triggered = (events, list) => (list || missions).filter(m => { m.mem = {}; return events.some(e => m.check(e, m.mem)); }).map(m => m.id.replace('big-o-', ''));

// ---------- 預設狀態 ----------
console.log('\n預設狀態（n = 12、隨機、種子 1113、A = 10 · n log n、B = 1 · n²、線性座標）');
{
  const c = fastCounts(12, 'random', SEED);
  console.log('  次數：二分 ' + c.binary + '、循序 ' + c.linear + '、合併 ' + c.merge + '、兩兩 ' + c.pairs + '、子集合 ' + c.subsets);
  const x = B.crossover('nlogn', 10, 'n2', 1);
  console.log('  預設的常數因子：交叉點 ' + x.cross + '（' + (x.equal.length ? '相等於 ' + x.equal.join('、') : '沒有剛好相等的 n') + '）');
  const cases = [
    ['按「開始賽跑」一直看到全部跑完', race(12, 'random', 'play'), ['1']],
    ['按「單步」一直走到全部跑完', race(12, 'random', 'step'), ['1']],
    ['按「直接跑完」', race(12, 'random', 'skip'), []],
    ['只看幾拍就暫停', raceEvents(12, 'random', SEED, 'play', 3), []],
    ['按「n 加倍」（12 → 24）', dbl(12), ['3']],
    ['只切一次「半對數」', [axis('semilog')], []],
    ['只切一次「雙對數」', [axis('loglog')], []],
    ['n 從 1 拉到 1000（每個值都放開一次）', walk('nlogn', 10, 'n2', 1, Array.from({ length: 1000 }, (_, i) => i + 1)), []],
    ['只改常數 a（1 到 1000 每個值）', Array.from({ length: 1000 }, (_, i) => cmp('nlogn', i + 1, 'n2', 1, 12)), []],
    ['只改常數 b（1 到 1000 每個值）', Array.from({ length: 1000 }, (_, i) => cmp('nlogn', 10, 'n2', i + 1, 12)), []],
    ['換資料、切三種資料後「直接跑完」', [].concat(race(12, 'sorted'), race(12, 'worst'), race(12, 'random', 'skip', 4242)), []]
  ];
  cases.forEach(cs => {
    const hit = triggered(cs[1]);
    const ok = JSON.stringify(hit) === JSON.stringify(cs[2]);
    if (!ok) fail++;
    console.log((ok ? '  ✓ ' : '  ✗ ') + cs[0] + '：' + (hit.length ? '完成 ' + hit.join('、') : '不觸發任何任務') + (ok ? '' : '（應該是 ' + (cs[2].join('、') || '無') + '）'));
  });
}

// ---------- 公開任務 ----------
console.log('\n公開任務');
expect(1, race(12, 'random', 'play'), true, '「開始賽跑」看到二分搜尋跑到終點（第 4 拍）');
expect(1, raceEvents(12, 'random', SEED, 'step', 4), true, '「單步」走 4 拍，二分搜尋跑完');
expect(1, race(12, 'random', 'skip'), false, '「直接跑完」不算看到');
expect(2, race(21), true, 'n = 21「直接跑完」：子集合 2^21 用公式算');
expect(2, race(20), false, 'n = 20 還是真的列出 1048576 個子集合');
expect(3, dbl(12), true, 'n = 12 按「n 加倍」');
expect(4, dbl(41), true, 'n = 41 加倍：兩兩比較 ' + B.formula.pairs(41) + ' → ' + B.formula.pairs(82) + '，' + B.trim(B.formula.pairs(82) / B.formula.pairs(41), 4) + ' 倍');
expect(4, dbl(40), false, 'n = 40 加倍：' + B.trim(B.formula.pairs(80) / B.formula.pairs(40), 4) + ' 倍（差超過 0.05）');
expect(4, dbl(500), true, 'n = 500 加倍：' + B.trim(B.formula.pairs(1000) / B.formula.pairs(500), 4) + ' 倍');
expect(5, [cmp('n', 100, 'n2', 1)], true, 'A = 100 · n、B = n²：交叉點 ' + B.crossover('n', 100, 'n2', 1).cross);
expect(5, [cmp('n2', 3, 'n', 300)], true, 'A = 3 · n²、B = 300 · n（對調也可以）：交叉點 ' + B.crossover('n2', 3, 'n', 300).cross);
expect(5, [cmp('n', 99, 'n2', 1)], false, 'A = 99 · n：交叉點 ' + B.crossover('n', 99, 'n2', 1).cross);
{
  const x = B.crossover('n2', 1, 'exp2', 1);
  expect(6, walk('n2', 1, 'exp2', 1, [5]), true, 'n² 對 2^n、常數都是 1、n = 5（從 ' + x.crossStrict + ' 起 2^n 一直比較大；≥ 從 ' + x.cross + ' 起）');
  expect(6, walk('n2', 1, 'exp2', 1, [4]), false, 'n = 4（兩邊都是 16，還不算「比較大」）');
  expect(6, walk('n2', 7, 'exp2', 7, [5]), true, '常數都是 7 也一樣');
  expect(6, walk('n2', 1, 'exp2', 2, [5]), false, '常數不一樣');
}
expect(7, [axis('semilog'), axis('lin'), axis('loglog')], true, '切「半對數」再切「雙對數」');
expect(7, [axis('semilog'), axis('semilog'), axis('lin')], false, '只切「半對數」');
expect(8, race(100, 'worst'), true, '「最壞情況」n = 100：合併排序 ' + fastCounts(100, 'worst').merge + ' 次 = 上界 ' + B.formula.merge(100));
expect(8, race(99, 'worst'), false, 'n = 99');
expect(8, race(100, 'random'), false, '隨機資料 n = 100：' + fastCounts(100, 'random', SEED).merge + ' 次');
expect(9, dbl(256), true, 'n = 256 加倍：二分搜尋 ' + B.bitLen(256) + ' → ' + B.bitLen(512) + ' 次');
expect(9, dbl(255), false, 'n = 255');
expect(10, race(55), true, 'n = 55：2^55 奈秒 ≈ ' + B.trim(Math.pow(2, 55) / B.NS.yr, 3) + ' 年');
expect(10, race(54), false, 'n = 54：2^54 奈秒 ≈ ' + B.trim(Math.pow(2, 54) / B.NS.yr, 3) + ' 年');
expect(11, [cmp('log', 1000, 'n', 1)], false, 'A = 1000 · log n、B = n：交叉點 ' + B.crossover('log', 1000, 'n', 1).cross + '（不到一百萬）');
expect(11, [cmp('nlogn', 1000, 'n2', 1)], false, '預設的 n log n 對 n²，常數 a 拉到 1000：交叉點 ' + B.crossover('nlogn', 1000, 'n2', 1).cross);
expect(11, [cmp('log', 1000, 'sqrt', 1)], true, 'A = 1000 · log n、B = √n：交叉點 ' + B.crossover('log', 1000, 'sqrt', 1).cross);
expect(11, [cmp('n', 1000, 'nlogn', 1)], true, 'A = 1000 · n、B = n log n：交叉點約 2^1000');
expect(11, [cmp('n', 19, 'nlogn', 1)], false, 'A = 19 · n、B = n log n：交叉點 ' + B.crossover('n', 19, 'nlogn', 1).cross);
expect(11, [cmp('n', 20, 'nlogn', 1)], true, 'A = 20 · n、B = n log n：交叉點 ' + B.crossover('n', 20, 'nlogn', 1).cross);
expect(12, [cmp('nlogn', 301, 'n2', 3)], true, 'A = 301 · n log n、B = 3 · n²：交叉點 ' + B.crossover('nlogn', 301, 'n2', 3).cross);
expect(12, [cmp('nlogn', 702, 'n2', 7)], true, 'A = 702 · n log n、B = 7 · n²：交叉點 ' + B.crossover('nlogn', 702, 'n2', 7).cross);
expect(12, [cmp('nlogn', 100, 'n2', 1)], false, 'A = 100 · n log n、B = n²：交叉點 ' + B.crossover('nlogn', 100, 'n2', 1).cross);
{
  // 任務 12：列出所有做得到的常數組合
  const ok = [];
  for (let b = 1; b <= 1000; b++) for (let a = Math.floor(b * 99); a <= Math.min(1000, Math.ceil(b * 101)); a++) if (B.crossover('nlogn', a, 'n2', b).cross === 1000) ok.push(a + ':' + b);
  if (!ok.length) fail++;
  console.log((ok.length ? '  ✓ ' : '  ✗ ') + '12  任務 12 做得到的 a : b 共 ' + ok.length + ' 組：' + ok.slice(0, 12).join('、') + (ok.length > 12 ? '…' : ''));
}

// ---------- 隱藏任務 ----------
console.log('\n隱藏任務');
let h7seed = null;
for (let s = 1; s < 100000 && h7seed == null; s++) if (mergeCount(16, 'random', s) === B.formula.merge(16)) h7seed = s;
const sol = {
  h1: race(3, 'worst', 'step'),
  h2: walk('n2', 1, 'exp2', 1, [2, 4]),
  h3: race(256, 'sorted'),
  h4: walk('sqrt', 1, 'log', 1, [16]),
  h5: dbl(30).concat(race(60)),
  h6: walk('n2', 8, 'nlogn', 64, [44]),
  h7: race(16, 'random', 'skip', h7seed),
  h8: walk('log', 100, 'n', 1, [997]),
  h9: walk('nlogn', 32, 'n2', 1, [256]),
  h10: walk('n3', 1, 'exp2', 1, [1, 9, 10])
};
expect('h1', sol.h1, true, 'n = 3「最壞情況」用「單步」走：循序 3、合併 3、兩兩 3，同一拍跑完');
expect('h1', race(3, 'worst', 'play'), false, '用「開始賽跑」播放（要一拍一拍親自走）');
expect('h1', race(3, 'worst', 'skip'), false, '「直接跑完」沒看到同一拍');
expect('h1', race(3, 'random', 'step', 1), false, 'n = 3 隨機資料（合併 ' + fastCounts(3, 'random', 1).merge + ' 次也不算，要「最壞情況」）');
expect('h1', race(4, 'worst'), false, 'n = 4：循序 4、合併 ' + fastCounts(4, 'worst').merge + '、兩兩 6');
expect('h2', sol.h2, true, 'n² 對 2^n、常數一樣，n = 2 與 n = 4 都站過（剛好相等）');
expect('h2', walk('n2', 1, 'exp2', 1, [2, 3, 5]), false, '只站過 n = 2');
expect('h2', walk('n2', 3, 'exp2', 3, [2, 4]), true, '常數都是 3 也一樣');
expect('h3', sol.h3, true, '「已排好」n = 256：合併排序 ' + fastCounts(256, 'sorted').merge + ' 次 = 256 × 8 ÷ 2');
expect('h3', race(128, 'sorted'), false, '「已排好」n = 128（太小，至少 256）');
expect('h3', race(512, 'sorted'), true, '「已排好」n = 512：' + fastCounts(512, 'sorted').merge + ' 次 = 512 × 9 ÷ 2');
expect('h3', race(48, 'sorted'), false, '「已排好」n = 48（不是 2 的次方）：' + fastCounts(48, 'sorted').merge + ' 次');
expect('h3', race(1000, 'sorted'), false, '「已排好」n = 1000');
expect('h4', sol.h4, true, '√n 對 log n、常數一樣、n = 16（4 = 4）');
expect('h4', walk('sqrt', 1, 'log', 1, [4]), false, 'n = 4（第一次相等）');
expect('h5', sol.h5, true, 'n = 30 加倍再讓五個都跑完：2^30 奈秒 ≈ ' + B.trim(Math.pow(2, 30) / 1e9, 3) + ' 秒 → 2^60 奈秒 ≈ ' + B.trim(Math.pow(2, 60) / B.NS.yr, 3) + ' 年');
expect('h5', dbl(30), false, '只按加倍、沒有跑完');
expect('h5', race(60), false, '直接把 n 設成 60 再跑完（沒有加倍）');
expect('h5', dbl(30).concat([cmp('nlogn', 10, 'n2', 1, 59, 'n'), cmp('nlogn', 10, 'n2', 1, 60, 'n')], race(60)), false, '加倍後把 n 改走再改回 60');
expect('h5', dbl(31).concat(race(62)), false, 'n = 31 加倍');
expect('h6', sol.h6, true, '8n² 對 64 n log n、n = ' + B.crossover('n2', 8, 'nlogn', 64).cross + '（CLRS 習題 1.2-2）');
expect('h6', walk('n2', 8, 'nlogn', 64, [43, 45]), false, 'n = 43、45');
expect('h6', walk('n2', 1, 'nlogn', 8, [44]), false, '同樣比例 1 : 8，但不是 8 和 64');
expect('h7', sol.h7, true, '隨機資料 n = 16（種子 ' + h7seed + '）合併排序剛好比滿 ' + B.formula.merge(16) + ' 次');
expect('h7', race(16, 'worst'), false, '「最壞情況」不算');
expect('h8', sol.h8, true, '100 · log n 對 n、n = ' + B.crossover('log', 100, 'n', 1).cross);
expect('h8', walk('log', 100, 'n', 1, [996]), false, 'n = 996（100 log2 996 ≈ ' + B.trim(100 * Math.log2(996), 4) + '，還比 996 大）');
expect('h8', walk('log', 200, 'n', 2, [997]), true, '200 · log n 對 2n 也一樣');
expect('h9', sol.h9, true, '32 · n log n 對 n²、n = 256（' + 32 * 256 * 8 + ' = ' + 256 * 256 + '）');
expect('h9', walk('nlogn', 32, 'n2', 3, [64]), true, '32 · n log n 對 3n²、n = 64');
expect('h9', walk('log', 32, 'n', 1, [256]), true, '32 · log n 對 n、n = 256');
expect('h9', walk('n', 8, 'nlogn', 1, [256]), true, '8n 對 n log n、n = 256');
expect('h9', walk('nlogn', 4, 'n2', 1, [16]), false, '4 · n log n 對 n²、n = 16（小於 64）');
expect('h9', walk('nlogn', 32, 'n2', 1, [128]), false, 'n = 128（不相等）');
expect('h10', sol.h10, true, 'n³ 對 2^n、常數一樣，n = 1（2 > 1）、9（729 > 512）、10（1024 > 1000）都站過');
expect('h10', walk('n3', 1, 'exp2', 1, [1, 2, 10]), false, '沒有站在 n = 9');
expect('h10', walk('n3', 1, 'exp2', 1, [9, 10]), false, '沒有站在 n = 1');

console.log('\n靠運氣的隱藏任務');
chance('h7', 20000, r => race(16, 'random', 'skip', 1 + Math.floor(r() * 2147483646)), 'n = 16、按「換一組資料」再「直接跑完」', 0.02);
chance('h7', 20000, r => race(17, 'random', 'skip', 1 + Math.floor(r() * 2147483646)), 'n = 17', 0.003);
chance('h7', 20000, r => race(32, 'random', 'skip', 1 + Math.floor(r() * 2147483646)), 'n = 32（越大越難）', 0);

// ---------- 亂按模擬：像學生隨便點，任務被碰巧完成的比例 ----------
// 每人從預設狀態開始，隨機做 300 個操作（各控制項機會均等）：拉 n（含拉到兩端）、亂打 n、點圖、方向鍵、拉速度、三種資料、換資料、
// 開始賽跑（看一陣子，看多久隨機）、單步、直接跑完、重來、全部清除、n 加倍、三種座標、換兩個函數、拉兩個常數（含兩端）、亂打常數。
// 事件與頁面相同（改 n 都會發 via 'n' 的比較事件）。標準：每個隱藏任務 < 2%。
const MONKEY_PEOPLE = 400, MONKEY_ACTIONS = 300;
function monkey(people, actions, seed) {
  const r = B.rng(seed);
  const fromPos = (p, max) => Math.max(1, Math.min(max, Math.round(Math.pow(max, p / 1000))));
  const SPEEDS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000];
  const ACTS = ['n', 'n', 'nType', 'chart', 'key', 'speed', 'random', 'sorted', 'worst', 'reseed', 'play', 'play', 'step', 'step', 'skip',
    'restart', 'clear', 'double', 'double', 'lin', 'semilog', 'loglog', 'fA', 'fB', 'a', 'b', 'aType', 'bType'];
  const pick = arr => arr[Math.floor(r() * arr.length)];
  const count = {}, evN = { lane: 0, race: 0, double: 0, compare: 0, axis: 0 };
  missions.forEach(m => { count[m.id] = 0; });
  for (let p = 0; p < people; p++) {
    missions.forEach(m => { m.mem = {}; m.got = false; });
    const fire = ev => { evN[ev.type]++; missions.forEach(m => { if (!m.got && m.check(ev, m.mem)) { m.got = true; count[m.id]++; } }); };
    const s = { n: 12, shape: 'random', seed: SEED, speed: 20, fa: 'nlogn', a: 10, fb: 'n2', b: 1, t: 0, done: {}, raceDone: false };
    let run = R(s.n, s.shape, s.seed);
    const rebuild = () => { run = R(s.n, s.shape, s.seed); s.t = 0; s.done = {}; s.raceDone = false; };
    const reset = () => { s.t = 0; s.done = {}; s.raceDone = false; };
    const tMax = () => Math.max.apply(null, ALGOS.map(a => run.counts[a]));
    const advance = via => {
      const t = Math.floor(s.t);
      const newly = ALGOS.filter(a => !s.done[a] && t >= run.counts[a]);
      newly.forEach(a => { s.done[a] = true; fire({ type: 'lane', data: B.laneEvent(run, a, via) }); });
      if (newly.length && ALGOS.every(a => s.done[a])) { s.raceDone = true; fire({ type: 'race', data: B.raceEvent(run, via) }); }
    };
    const setN = n => { s.n = Math.max(1, Math.min(1000, n)); rebuild(); fire({ type: 'compare', data: fastCompare(s.fa, s.a, s.fb, s.b, s.n, 'n') }); };
    const cmpNow = () => fire({ type: 'compare', data: fastCompare(s.fa, s.a, s.fb, s.b, s.n, 'cmp') });
    for (let k = 0; k < actions; k++) {
      const a = pick(ACTS);
      if (a === 'n') { const u = r(); setN(fromPos(u < 0.15 ? 0 : u < 0.3 ? 1000 : Math.round(r() * 1000), 1000)); }
      else if (a === 'nType') setN(pick([1000, 1, 10, 100, 1 + Math.floor(r() * 1000)]));
      else if (a === 'chart') setN(1 + Math.floor(r() * 1000 * pick([1, 0.1, 0.02])));
      else if (a === 'key') setN(s.n + pick([-1, 1, -Math.max(1, Math.round(s.n * 0.1)), Math.max(1, Math.round(s.n * 0.1))]));
      else if (a === 'speed') s.speed = SPEEDS[Math.floor(r() * SPEEDS.length)];
      else if (a === 'random' || a === 'sorted' || a === 'worst') { s.shape = a; rebuild(); }
      else if (a === 'reseed') { s.seed = 1 + Math.floor(r() * 2147483646); s.shape = 'random'; rebuild(); }
      else if (a === 'play') { if (s.raceDone) reset(); advance('play'); s.t = Math.min(tMax(), s.t + s.speed * r() * 20); advance('play'); }
      else if (a === 'step') { if (s.raceDone) reset(); s.t = Math.min(tMax(), Math.floor(s.t) + 1); advance('step'); }
      else if (a === 'skip') { if (s.raceDone) reset(); s.t = tMax(); advance('skip'); }
      else if (a === 'restart') reset();
      else if (a === 'clear') { /* 只清圖上的點 */ }
      else if (a === 'double') { if (2 * s.n <= 1000) { fire({ type: 'double', data: fastDouble(s.n, s.shape, s.seed) }); setN(2 * s.n); } }
      else if (a === 'lin' || a === 'semilog' || a === 'loglog') fire({ type: 'axis', data: { mode: a } });
      else if (a === 'fA') { s.fa = pick(B.FUNCS); cmpNow(); }
      else if (a === 'fB') { s.fb = pick(B.FUNCS); cmpNow(); }
      else if (a === 'a' || a === 'b') { const u = r(); s[a] = fromPos(u < 0.15 ? 0 : u < 0.3 ? 1000 : Math.round(r() * 1000), 1000); cmpNow(); }
      else if (a === 'aType' || a === 'bType') { s[a[0]] = pick([1, 10, 100, 1000, 1 + Math.floor(r() * 1000)]); cmpNow(); }
    }
  }
  return { count: count, evN: evN };
}
{
  const res = monkey(MONKEY_PEOPLE, MONKEY_ACTIONS, 20261113);
  console.log(`\n亂按模擬（${MONKEY_PEOPLE} 人 × 每人 ${MONKEY_ACTIONS} 個操作；共 ${res.evN.lane} 次跑完一條、${res.evN.race} 場跑完、${res.evN.double} 次加倍、${res.evN.compare} 次比較、${res.evN.axis} 次切座標）`);
  const line = list => list.map(m => m.id.replace('big-o-', '') + ' ' + (100 * res.count[m.id] / MONKEY_PEOPLE).toFixed(2) + '%').join('、');
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
  const ids = hid.map(m => m.id.replace('big-o-', ''));
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
if (hid.filter(m => m.level >= 7).length < 3 || hid.some(m => m.level < 3 || m.level > 10)) { fail++; console.log('隱藏任務等級要在 3–10、至少 3 個在 7 級以上。'); }
const idsAll = missions.map(m => m.id);
if (new Set(idsAll).size !== idsAll.length) { fail++; console.log('任務代號重複。'); }
if (hid.some(m => !m.riddle || m.desc)) { fail++; console.log('隱藏任務要用 riddle、不寫 desc。'); }
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，預設狀態不觸發（入門任務除外），隱藏任務互不順便完成。');
