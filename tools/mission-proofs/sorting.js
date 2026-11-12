/* 任務可達成的證明腳本。用法：node tools/mission-proofs/sorting.js
 * 用 js/sorting-core.js 產生和 js/sorting.js 完全相同的事件資料（'finish'、'race'，含比較次數對 n 圖的點），證明：
 *   1. 每個任務在滑桿範圍（n 5–64；自訂 2–64 個 1–99 的整數）內做得到，印出解法；
 *   2. 預設狀態不觸發任何任務（頁面載入不送事件；預設資料跑完也只完成「排好了！」）；
 *   3. 十個隱藏任務的解法彼此不會順便完成另一個隱藏任務（印出交叉檢查表）；
 *   4. 靠運氣的任務算出平均要洗幾次牌；
 *   5. 固定種子的亂按模擬（400 人 × 300 次操作），印出每個任務被碰巧完成的比例，隱藏任務都要 < 2%。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const S = require(ROOT + 'js/sorting-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/sorting.js');
const byId = id => missions.find(m => m.id === 'sorting-' + id);
const hidden = missions.filter(m => m.hidden);
const half = n => n * (n - 1) / 2;

// ---------- 與 js/sorting.js 相同的事件資料 ----------
/** 模擬一個頁面：圖上的點會累積（同一演算法、n、比較次數只算一個點） */
function page() {
  const chart = [];
  const add = (a, n, c) => { if (!chart.some(q => q.a === a && q.n === n && q.c === c)) chart.push({ a, n, c }); };
  const base = (v, shape, m3) => ({
    n: v.length, shape, custom: shape === 'custom', median3: !!m3, values: v.slice(),
    inv: S.inversions(v), cycles: S.cycles(v), distinct: S.distinct(v), dup: S.dupCount(v),
    sortedIn: S.isSorted(v), reversedIn: S.isStrictlyDecreasing(v), chart: null
  });
  return {
    finish(algo, v, shape, m3) {
      const r = S.run(algo, v, { median3: !!m3 });
      add(algo, v.length, r.comps);
      const d = Object.assign(base(v, shape, m3), { mode: 'single', algo, comps: r.comps, swaps: r.swaps, writes: r.writes, steps: r.steps, stable: r.stable, broken: r.broken, maxDepth: r.maxDepth });
      d.chart = chart.map(q => Object.assign({}, q));
      return { type: 'finish', data: d };
    },
    race(v, shape, m3) {
      const results = {};
      const steps = S.ALGOS.map(a => { const r = S.run(a, v, { median3: !!m3 }); results[a] = { comps: r.comps, swaps: r.swaps, writes: r.writes, steps: r.steps, stable: r.stable, broken: r.broken, maxDepth: r.maxDepth }; return r.steps; });
      const order = steps.slice().sort((x, y) => x - y);
      S.ALGOS.forEach((a, i) => { results[a].place = 1 + order.indexOf(steps[i]); add(a, v.length, results[a].comps); });
      const d = Object.assign(base(v, shape, m3), { mode: 'race', results });
      d.chart = chart.map(q => Object.assign({}, q));
      return { type: 'race', data: d };
    },
    clear() { chart.length = 0; }   // 「全部清除」
  };
}
const data = (n, shape, seed) => S.makeData(n, shape, seed || 1);
const range1 = n => Array.from({ length: n }, (_, i) => i + 1);

let fail = 0;
function hits(m, events) { m.mem = {}; return events.some(e => !!m.check(e, m.mem)); }
function expect(id, events, want, note) {
  const ok = hits(byId(id), events);
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(4) + (want ? ' 達成：' : ' 不觸發：') + note);
}

// ---------- 三數取中的「殺手」資料：McIlroy (1999) 的對手策略 ----------
// 值一開始都還沒決定（gas）；比較兩個 gas 時，把樞紐候選凍結成下一個最小的值。對手的回答前後一致，
// 所以跑完後得到的排列再拿去排，比較順序完全一樣。
function killer(n, median3) {
  const GAS = 1e9, val = new Array(n).fill(GAS);
  let next = 1, cand = -1;
  const cmp = (x, y) => {
    if (val[x] === GAS && val[y] === GAS) { if (x === cand) val[x] = next++; else val[y] = next++; }
    if (val[x] === GAS) cand = x; else if (val[y] === GAS) cand = y;
    return val[x] - val[y];
  };
  S.run('quick', new Array(n).fill(0), { median3, cmp });
  for (let i = 0; i < n; i++) if (val[i] === GAS) val[i] = next++;
  return val;
}

// =====================================================================
console.log('預設狀態');
{
  // 頁面載入時不送任何事件；只有使用者按了單步、播放或直接跑完並跑到最後才送。
  // 下面確認：預設資料（n = 24、亂序第 1 份）用每一種演算法跑完、或五種一起比，都只會完成 sorting-1。
  const v = data(24, 'random', 1);
  const P = page();
  const evs = S.ALGOS.map(a => P.finish(a, v, 'random', false)).concat([P.finish('quick', v, 'random', true), page().race(v, 'random', false)]);
  const hit = missions.filter(m => m.id !== 'sorting-1' && hits(m, evs)).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設資料跑完觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設資料（n = 24、亂序）不論用哪一種演算法跑完、或五種一起比，都只完成 sorting-1');
}

// =====================================================================
console.log('公開任務的解法');
{
  expect('1', [page().finish('bubble', data(24, 'random'), 'random')], true, '泡沫排序跑完');
  expect('1', [page().race(data(5, 'sorted'), 'sorted')], true, '五種一起比跑完也算');
  expect('2', [page().finish('bubble', data(10, 'sorted'), 'sorted')], true, 'n = 10「已排好」：泡沫比較 9 次');
  expect('2', [page().finish('bubble', data(9, 'sorted'), 'sorted')], false, 'n = 9 太少');
  expect('2', [page().finish('bubble', data(10, 'nearly'), 'nearly')], false, '幾乎排好（比較 ' + S.count('bubble', data(10, 'nearly')).comps + ' 次）');
  expect('3', [page().finish('insertion', data(10, 'reversed'), 'reversed')], true, 'n = 10「反序」：插入比較 45 次');
  expect('3', [page().finish('insertion', data(10, 'random'), 'random')], false, '亂序（比較 ' + S.count('insertion', data(10, 'random')).comps + ' 次）');
  { const P = page(); expect('4', [P.finish('selection', data(12, 'random'), 'random'), P.finish('selection', data(12, 'sorted'), 'sorted'), P.finish('selection', data(12, 'reversed'), 'reversed')], true, 'n = 12：亂序、已排好、反序各跑一次選擇排序（都是 66 次）'); }
  { const P = page(); expect('4', [P.finish('selection', data(12, 'random'), 'random'), P.finish('selection', data(13, 'sorted'), 'sorted'), P.finish('selection', data(12, 'reversed'), 'reversed')], false, 'n 不同不算'); }
  { const P = page(); expect('4', [P.finish('selection', data(12, 'random', 1), 'random'), P.finish('selection', data(12, 'random', 2), 'random'), P.finish('selection', data(12, 'random', 3), 'random')], false, '三份亂序只算一種形態'); }
  { let s = 1; while (S.run('selection', data(16, 'few', s)).stable) s++; expect('5', [page().finish('selection', data(16, 'few', s), 'few')], true, 'n = 16「很多重複」第 ' + s + ' 份：選擇排序打亂了 ' + S.run('selection', data(16, 'few', s)).broken + ' 對'); }
  expect('5', [page().finish('merge', data(16, 'few'), 'few')], false, '合併排序永遠穩定');
  expect('5', [page().finish('selection', [2, 2, 1], 'custom')], false, '自訂 2, 2, 1 只有 3 個數（這是隱藏任務的事）');
  expect('6', [page().race(data(32, 'nearly'), 'nearly')], true, 'n = 32「幾乎排好」五種一起比（插入 ' + S.count('insertion', data(32, 'nearly')).comps + '、泡沫 ' + S.count('bubble', data(32, 'nearly')).comps + '、合併 ' + S.count('merge', data(32, 'nearly')).comps + '）');
  expect('6', [page().race(data(31, 'nearly'), 'nearly')], false, 'n = 31 太少');
  {
    let bad = 0;
    for (let n = 32; n <= 64; n++) for (let s = 1; s <= 60; s++) if (!hits(byId('6'), [page().race(data(n, 'nearly', s), 'nearly')])) bad++;
    if (bad) fail++;
    console.log((bad ? '  ✗ ' : '  ✓ ') + '6    n = 32–64、每個 n 60 份「幾乎排好」：插入排序的比較次數都是五種裡最少（不符合 ' + bad + ' 份）');
  }
  expect('7', [page().finish('quick', data(20, 'sorted'), 'sorted')], true, 'n = 20「已排好」：快速排序比較 190 次');
  expect('7', [page().finish('quick', data(20, 'reversed'), 'reversed')], true, 'n = 20「反序」也是 190 次');
  expect('7', [page().finish('quick', Array(20).fill(5), 'custom')], false, '自訂 20 個 5：也是 190 次，但有重複值（那是隱藏任務的事）');
  expect('7', [page().finish('quick', data(20, 'sorted'), 'sorted', true)], false, '勾了三數取中不算');
  {
    const P = page(), evs = [5, 8, 12, 20, 33].map(n => P.finish('selection', data(n, 'random'), 'random'));
    expect('8', evs, true, '選擇排序跑 n = 5、8、12、20、33（任何資料都在曲線上）');
    const P2 = page(), ev2 = [5, 8, 12, 20].map(n => P2.finish('selection', data(n, 'random'), 'random'));
    expect('8', ev2, false, '只有 4 個 n');
    const P3 = page(), ev3 = [10, 20, 30, 40, 50].map(n => P3.race(data(n, 'reversed'), 'reversed'));
    expect('8', ev3, true, '反序五種一起比 n = 10、20、30、40、50（泡沫、選擇、插入、快速都在曲線上）');
  }
  expect('9', [page().finish('quick', data(32, 'sorted'), 'sorted', true)], true, 'n = 32「已排好」＋三數取中：' + S.count('quick', data(32, 'sorted'), { median3: true }).comps + ' 次 < 496 / 3');
  expect('9', [page().finish('quick', data(31, 'sorted'), 'sorted', true)], false, 'n = 31 太少');
  expect('9', [page().finish('quick', data(32, 'sorted'), 'sorted', false)], false, '沒勾三數取中（496 次）');
  {
    const v = range1(10).map(x => x % 10 + 1);   // 2, 3, …, 10, 1：一個 10 循環
    expect('10', [page().finish('selection', v, 'custom')], true, '自訂 ' + v.join(' ') + '（一整個循環）：交換 9 次');
    expect('10', [page().finish('selection', data(10, 'reversed'), 'reversed')], false, '反序只交換 5 次');
  }
  expect('11', [page().finish('merge', S.mergeWorstData(16), 'custom')], true, '自訂 ' + S.mergeWorstData(16).join(' ') + '：49 次');
  expect('11', [page().finish('merge', data(16, 'reversed'), 'reversed')], false, '反序只有 32 次');
  expect('12', [page().finish('quick', S.quickBestData(15), 'custom')], true, '自訂 ' + S.quickBestData(15).join(' ') + '：34 次');
  expect('12', [page().finish('quick', S.quickBestData(16), 'custom')], true, '自訂 16 個數：' + S.quickMin(16) + ' 次');
  expect('12', [page().finish('quick', data(15, 'random', 1), 'random')], false, '亂序（' + S.count('quick', data(15, 'random', 1)).comps + ' 次）');
}

// =====================================================================
console.log('隱藏任務的解法');
const sol = {};
{
  const first = n => { let s = 1; while (S.count('selection', data(n, 'random', s)).swaps <= Math.floor(n / 2)) s++; return s; };
  const a = first(12), b = first(14);
  sol.h1 = { note: 'n = 12 與 n = 14 各一次：亂序選擇排序（交換 ' + S.count('selection', data(12, 'random', a)).swaps + '、' + S.count('selection', data(14, 'random', b)).swaps + ' 次），再「反序」選擇排序（只交換 6、7 次）',
    ev: P => [P.finish('selection', data(12, 'random', a), 'random'), P.finish('selection', data(12, 'reversed'), 'reversed'), P.finish('selection', data(14, 'random', b), 'random'), P.finish('selection', data(14, 'reversed'), 'reversed')] };
}
{
  const v = [10].concat(range1(9));   // 10, 1, 2, …, 9：一隻兔子在最前面
  sol.h2 = { note: '自訂 ' + v.join(' ') + '：泡沫與插入都比較 ' + S.count('bubble', v).comps + ' 次', ev: P => [P.finish('bubble', v, 'custom'), P.finish('insertion', v, 'custom')] };
}
{
  const k = killer(32, true);
  sol.h3 = { note: '自訂（McIlroy 對手產生）' + k.join(' ') + '：三數取中仍比較 ' + S.count('quick', k, { median3: true }).comps + ' 次 ≥ 496 / 2', ev: P => [P.finish('quick', k, 'custom', true)] };
}
sol.h4 = { note: '自訂 10 個 7：快速排序比較 45 次', ev: P => [P.finish('quick', Array(10).fill(7), 'custom')] };
const swapHalves = n => range1(n).map(i => (i - 1 + n / 2) % n + 1);   // n/2+1 … n, 1 … n/2
sol.h5 = { note: '自訂 ' + swapHalves(16).join(' ') + '（後半整段比前半小）合併排序：比較 32、寫入 64', ev: P => [P.finish('merge', swapHalves(16), 'custom')] };
{
  let s = 1; while (S.inversions(data(16, 'random', s)) !== 60) s++;
  sol.h6 = { note: 'n = 16 亂序第 ' + s + ' 份（逆序數剛好 60 = 16·15/4）插入排序', ev: P => [P.finish('insertion', data(16, 'random', s), 'random')] };
}
sol.h7 = { note: '自訂 2 2 1 選擇排序（兩個 2 換了順序）', ev: P => [P.finish('selection', [2, 2, 1], 'custom')] };
sol.h8 = { note: 'n = 15 與 n = 17：「已排好」合併排序 ' + S.count('merge', data(15, 'sorted')).comps + '、' + S.count('merge', data(17, 'sorted')).comps + ' 次，「反序」' + S.count('merge', data(15, 'reversed')).comps + '、' + S.count('merge', data(17, 'reversed')).comps + ' 次',
  ev: P => [P.finish('merge', data(15, 'sorted'), 'sorted'), P.finish('merge', data(15, 'reversed'), 'reversed'), P.finish('merge', data(17, 'sorted'), 'sorted'), P.finish('merge', data(17, 'reversed'), 'reversed')] };
{
  const v = [1, 2, 3, 4].flatMap(x => [x, x, x, x, x]);   // 1 1 1 1 1 2 2 2 2 2 …：已排好的重複資料
  sol.h9 = { note: '自訂 ' + v.join(' ') + ' 快速排序（已排好的重複資料，不交換）', ev: P => [P.finish('quick', v, 'custom')] };
}
{
  const v = range1(10).map(x => x % 10 + 1);
  sol.h10 = { note: '自訂 ' + v.join(' ') + '（最小值在最後的烏龜）泡沫排序：比較 45、交換 9', ev: P => [P.finish('bubble', v, 'custom')] };
}
hidden.forEach(m => {
  const k = m.id.replace('sorting-', '');
  expect(k, sol[k].ev(page()), true, sol[k].note);
});
// 反例：條件的邊界
expect('h1', [page().finish('selection', data(12, 'reversed'), 'reversed')], false, '只跑反序、沒有先跑亂序對照');
expect('h1', (P => [P.finish('selection', data(12, 'random', 1), 'random'), P.finish('selection', data(14, 'reversed'), 'reversed')])(page()), false, '亂序與反序的 n 不同');
expect('h1', (P => [P.finish('selection', data(12, 'random', 1), 'random'), P.finish('selection', data(12, 'reversed'), 'reversed')])(page()), false, '只在一個 n 看到（要兩個不同的 n）');
expect('h2', (P => [P.finish('bubble', data(10, 'sorted'), 'sorted'), P.finish('insertion', data(10, 'sorted'), 'sorted')])(page()), false, '已排好時兩者都是 n − 1（不算）');
expect('h2', (P => [P.finish('bubble', data(10, 'reversed'), 'reversed'), P.finish('insertion', data(10, 'reversed'), 'reversed')])(page()), false, '反序時兩者都是 n(n − 1)/2（不算）');
expect('h2', (P => [P.finish('bubble', data(10, 'random'), 'random'), P.finish('insertion', data(10, 'random'), 'random')])(page()), false, '亂序：泡沫 ' + S.count('bubble', data(10, 'random')).comps + '、插入 ' + S.count('insertion', data(10, 'random')).comps);
expect('h2', [page().race([10].concat(range1(9)), 'custom')], false, '五種一起比不算（隱藏任務只看單一演算法）');
expect('h3', [page().finish('quick', killer(32, true), 'custom', false)], false, '殺手資料但沒勾三數取中');
expect('h4', [page().finish('quick', Array(9).fill(7), 'custom')], false, '9 個數太少');
expect('h5', [page().finish('merge', data(16, 'sorted'), 'sorted')], false, '「已排好」n = 16 也是 32 / 64，但已排好、反序不算（要自己排出來）');
expect('h5', [page().finish('merge', swapHalves(24), 'custom')], false, 'n = 24 前後半對調：不是每次都對半分（' + S.count('merge', swapHalves(24)).comps + ' × 2 ≠ ' + S.mergeWrites(24) + '）');
expect('h7', [page().finish('selection', [2, 2, 1, 3], 'custom')], false, '4 個數不算（要最小的）');
expect('h7', [page().finish('merge', [2, 2, 1], 'custom')], false, '合併排序穩定');
expect('h8', (P => [P.finish('merge', data(16, 'sorted'), 'sorted'), P.finish('merge', data(16, 'reversed'), 'reversed'), P.finish('merge', data(15, 'sorted'), 'sorted'), P.finish('merge', data(15, 'reversed'), 'reversed')])(page()), false, 'n = 16 時兩者都是 32（一樣多），只有 n = 15 一條河');
expect('h9', [page().finish('quick', [4, 3, 2, 1].flatMap(x => [x, x, x, x, x]), 'custom')], true, '反過來的重複資料（4 4 4 4 4 3 … 1）也穩定：另一種解法');
expect('h9', [page().finish('quick', [1, 2, 3, 4].flatMap(x => [x, x, x, x]), 'custom')], false, '16 個數太少（n = 12–16 的「很多重複」偶爾會剛好穩定，所以要 20 個以上）');
expect('h9', [page().finish('quick', data(20, 'few', 1), 'few')], false, '「很多重複」n = 20 第 1 份：' + (S.run('quick', data(20, 'few', 1)).stable ? '穩定' : '不穩定'));
expect('h10', [page().finish('bubble', data(10, 'reversed'), 'reversed')], false, '反序：比較 45 但交換 45');
{
  // h3 對所有 n = 32–64 都做得到；亂序資料（每個 n 300 份）不會誤觸
  let ok = 0, acc = 0;
  for (let n = 32; n <= 64; n++) {
    if (S.count('quick', killer(n, true), { median3: true }).comps * 2 >= half(n)) ok++;
    for (let s = 1; s <= 300; s++) if (S.count('quick', data(n, 'random', s), { median3: true }).comps * 2 >= half(n)) acc++;
  }
  if (ok !== 33 || acc) fail++;
  console.log((ok === 33 && !acc ? '  ✓ ' : '  ✗ ') + 'h3   n = 32–64 的殺手資料全部達到 n(n − 1)/4（' + ok + '/33）；亂序 33 × 300 份沒有一份達到（' + acc + ' 份）');
}
{
  // h5：前後半對調的資料在 n = 16、32、64 都做得到
  const ok = [16, 32, 64].filter(n => hits(byId('h5'), [page().finish('merge', swapHalves(n), 'custom')]));
  if (ok.length !== 3) fail++;
  console.log((ok.length === 3 ? '  ✓ ' : '  ✗ ') + 'h5   前後半對調的自訂資料在 n = ' + ok.join('、') + ' 都做到（比較 × 2 = 寫入）');
}

// =====================================================================
console.log('\n十個隱藏任務的交叉檢查表（列：用哪個解法；欄：完成了哪些隱藏任務；只有對角線應該是 ●）');
{
  const ids = hidden.map(m => m.id.replace('sorting-', ''));
  console.log('        ' + ids.map(k => k.padStart(4)).join(''));
  let cross = 0;
  ids.forEach(row => {
    const line = ids.map(col => {
      const done = hits(byId(col), sol[row].ev(page()));
      if (done && col !== row) cross++;
      return (done ? (col === row ? '●' : '✗') : '·').padStart(4);
    }).join('');
    console.log('  ' + row.padEnd(6) + line);
  });
  if (cross) { fail++; console.log('  ✗ 有 ' + cross + ' 個解法順便完成了別的隱藏任務'); }
  else console.log('  ✓ 每個解法只完成自己那一個隱藏任務');
}

// =====================================================================
console.log('\n靠運氣（按「洗牌」）的任務：平均要洗幾次');
function luck(note, trials, f) {
  let hit = 0;
  for (let s = 1; s <= trials; s++) if (f(s)) hit++;
  const p = hit / trials;
  console.log('  ・' + note + '：' + (p * 100).toFixed(2) + '%（平均約洗 ' + (p ? Math.round(1 / p) : '∞') + ' 次）');
  return p;
}
luck('sorting-10 亂序 n = 10 選擇排序交換 9 次（剛好一整個循環，理論 1/10）', 20000, s => S.count('selection', data(10, 'random', s)).swaps === 9);
luck('sorting-11 亂序 n = 16 合併排序達到最壞 49 次', 20000, s => S.count('merge', data(16, 'random', s)).comps === 49);
const p6 = luck('h6 亂序 n = 16 逆序數剛好 60', 20000, s => S.inversions(data(16, 'random', s)) === 60);
luck('h6 亂序 n = 17 逆序數剛好 68', 20000, s => S.inversions(data(17, 'random', s)) === 68);
if (!(p6 > 0.02)) { fail++; console.log('  ✗ h6 太難碰到'); }
console.log('亂按誤觸的機會（隱藏任務）');
{
  let st = 0, tot = 0;
  for (let n = 20; n <= 64; n++) for (let s = 1; s <= 200; s++) { tot++; const r = S.run('quick', data(n, 'few', s)); if (r.stable) st++; }
  console.log('  ・h9：「很多重複」n = 20–64、每個 n 200 份，快速排序剛好穩定的有 ' + st + ' / ' + tot + ' 份');
  if (st / tot > 0.001) { fail++; console.log('  ✗ h9 太容易誤觸'); }
  let st3 = 0;
  for (let n = 20; n <= 64; n++) for (let s = 1; s <= 200; s++) if (S.run('quick', data(n, 'few', s), { median3: true }).stable) st3++;
  console.log('  ・h9：同樣的資料勾三數取中，剛好穩定的有 ' + st3 + ' / ' + tot + ' 份');
  if (st3 / tot > 0.001) { fail++; console.log('  ✗ h9（三數取中）太容易誤觸'); }
  let h6 = 0, t6 = 0;
  for (let n = 16; n <= 64; n++) for (let s = 1; s <= 200; s++) { t6++; if (hits(byId('h6'), [page().finish('insertion', data(n, 'random', s), 'random')])) h6++; }
  console.log('  ・h6：亂序 n = 16–64 各 200 份隨便跑一次插入排序，碰巧完成的有 ' + h6 + ' / ' + t6 + ' 份（' + (h6 / t6 * 100).toFixed(2) + '%）');
}

// =====================================================================
// 亂按模擬：像學生隨便點每個控制項（固定種子，400 人 × 300 次操作），
// 算出每個任務被碰巧完成的人數比例。隱藏任務都要 < 2%（目標 ≤ 1%）。
console.log('\n亂按模擬（種子 20261112，400 人 × 300 次操作）');
{
  const STUDENTS = 400, ACTIONS = 300;
  const R = S.rng(20261112);
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const pick = arr => arr[Math.floor(R() * arr.length)];
  const got = {};
  missions.forEach(m => { got[m.id] = 0; });
  for (let stu = 0; stu < STUDENTS; stu++) {
    // 頁面的初始狀態（和 js/sorting.js 一樣）
    const st = { mode: 'single', n: 24, shape: 'random', seed: 1, custom: [5, 2, 8, 2, 9, 1, 7, 3], algo: 'bubble', median3: false };
    const P = page();
    const done = new Set();
    missions.forEach(m => { m.mem = {}; });
    const values = () => (st.shape === 'custom' ? st.custom.slice() : S.makeData(st.n, st.shape, st.seed));
    for (let k = 0; k < ACTIONS; k++) {
      const u = R();
      if (u < 0.14) {                          // 拉「資料個數 n」：常常拉到最小或最大
        const v = R();
        st.n = v < 0.3 ? S.MIN_N : v < 0.6 ? S.MAX_N : ri(S.MIN_N, S.MAX_N);
      } else if (u < 0.29) {                   // 換資料形態
        st.shape = pick(S.SHAPES);
        if (st.shape === 'custom' && R() < 0.35) {   // 在「自訂」框隨手打幾個數再按「套用」
          const len = ri(2, 12);
          st.custom = Array.from({ length: len }, () => ri(1, 20));
        }
      } else if (u < 0.37) {                   // 洗牌
        st.seed++;
      } else if (u < 0.52) {                   // 換演算法
        st.algo = pick(S.ALGOS);
      } else if (u < 0.58) {                   // 切換三數取中
        st.median3 = !st.median3;
      } else if (u < 0.64) {                   // 切換「單一演算法／五種一起比」
        st.mode = st.mode === 'single' ? 'race' : 'single';
      } else if (u < 0.92) {                   // 跑到最後一步（直接跑完、播放到底、一直按單步）
        const v = values();
        const ev = st.mode === 'race' ? P.race(v, st.shape, st.median3) : P.finish(st.algo, v, st.shape, st.median3);
        missions.forEach(m => { if (!done.has(m.id) && m.check(ev, m.mem)) done.add(m.id); });
      } else if (u < 0.95) {                   // 全部清除
        P.clear();
      }                                        // 其餘：看畫面、按上一步、重來（不送事件）
    }
    done.forEach(id => { got[id]++; });
  }
  let worst = 0;
  const rows = missions.map(m => {
    const p = got[m.id] / STUDENTS;
    if (m.hidden) worst = Math.max(worst, p);
    return '  ' + (m.hidden ? (p < 0.02 ? (p <= 0.01 ? '✓ ' : '△ ') : '✗ ') : '  ') + m.id.replace('sorting-', '').padEnd(4) + ' ' + (m.hidden ? '隱藏' : '公開') + ' ' + String(m.level).padStart(2) + ' 級：' + (p * 100).toFixed(2) + '%';
  });
  console.log(rows.join('\n'));
  if (worst >= 0.02) { fail++; console.log('  ✗ 有隱藏任務亂按就有 2% 以上的人碰巧完成'); }
  else console.log('  ✓ 每個隱藏任務被碰巧完成的比例都 < 2%（最高 ' + (worst * 100).toFixed(2) + '%）');
}

// =====================================================================
const pub = missions.filter(m => !m.hidden);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;
const stars = missions.reduce((s, m) => s + starsOf(m), 0);
console.log(`\n公開 ${pub.length} 個、隱藏 ${hidden.length} 個，共 ${stars} 顆星（公開 ${pub.reduce((s, m) => s + m.level, 0)}、隱藏 ${hidden.reduce((s, m) => s + starsOf(m), 0)}，隱藏任務是等級 × 2）。`);
console.log('隱藏任務等級：' + hidden.map(m => m.id.replace('sorting-', '') + '=' + m.level).join('、') + '（7 級以上 ' + hidden.filter(m => m.level >= 7).length + ' 個）');
if (hidden.length !== 10) { fail++; console.log('隱藏任務不是 10 個。'); }
if (hidden.filter(m => m.level >= 7).length < 3) { fail++; console.log('7 級以上的隱藏任務少於 3 個。'); }
if (hidden.some(m => m.level < 3 || m.level > 10 || !m.riddle || !m.riddle.zh || !m.riddle.en || m.desc)) { fail++; console.log('隱藏任務的等級或謎語格式不對。'); }
if (pub.length < 8 || pub.length > 12) { fail++; console.log('公開任務不是 8–12 個。'); }
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，預設狀態不觸發，隱藏任務彼此不會順便完成。');
