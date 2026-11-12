/* missions/sorting.js — 排序演算法比較的任務（一般任務星星數 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/sorting.js 發出，都在使用者按了「單步」「播放」或「直接跑完」、跑到最後一步之後）：
 *   共同欄位：{ n, shape（'random' | 'nearly' | 'reversed' | 'few' | 'sorted' | 'custom'）, custom, median3, values（原始資料）,
 *              inv（逆序數）, cycles（循環數）, distinct（相異值個數）, dup（n − distinct）, sortedIn（原始資料非遞減）,
 *              reversedIn（原始資料嚴格遞減）, chart（比較次數對 n 圖上所有的點 [{ a, n, c }]）}
 *   'finish'：單一演算法跑完。另有 { mode: 'single', algo, comps, swaps, writes, steps, stable, broken（被顛倒的相同值配對數）, maxDepth }
 *   'race'：五種一起比全部跑完。另有 { mode: 'race', results: { bubble: { comps, swaps, writes, steps, stable, broken, maxDepth, place }, … } }
 * 公開任務：單一演算法或五種一起比的結果都算。隱藏任務：只看單一演算法（一次只跑一種，不會一次完成好幾個）。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const half = function (n) { return n * (n - 1) / 2; };
  function ceilLog2(n) { let k = 0; while ((1 << k) < n) k++; return k; }
  function mergeWorst(n) { if (n <= 1) return 0; const k = ceilLog2(n); return n * k - Math.pow(2, k) + 1; }
  const qm = [0, 0];
  function quickMin(n) { if (n <= 1) return 0; if (qm[n] == null) qm[n] = n - 1 + quickMin(Math.floor((n - 1) / 2)) + quickMin(Math.ceil((n - 1) / 2)); return qm[n]; }
  /** 事件裡每個演算法的結果：單一演算法一筆、五種一起比五筆 */
  function runs(ev) {
    const d = ev.data || {};
    if (ev.type === 'finish') return [{ algo: d.algo, comps: d.comps, swaps: d.swaps, writes: d.writes, stable: d.stable, broken: d.broken }];
    if (ev.type === 'race' && d.results) return Object.keys(d.results).map(function (a) { const r = d.results[a]; return { algo: a, comps: r.comps, swaps: r.swaps, writes: r.writes, stable: r.stable, broken: r.broken }; });
    return [];
  }
  function anyRun(ev, f) { return runs(ev).some(function (r) { return f(r, ev.data); }); }
  function single(ev) { return ev.type === 'finish' && ev.data && ev.data.mode === 'single'; }
  function nonIncreasing(v) { for (let i = 1; i < v.length; i++) if (v[i - 1] < v[i]) return false; return true; }

  LabMission.register('sorting', [
    {
      id: 'sorting-1', level: 1,
      title: { zh: '排好了！', en: 'Sorted!' },
      desc: { zh: '選一種排序，用「單步」、「播放」或「直接跑完」，把資料一路排到最後一步。', en: 'Pick a sort and use “Step”, “Play” or “Run to the end” to take the data all the way to the last step.' },
      check: function (ev) { return runs(ev).length > 0; }
    },
    {
      id: 'sorting-2', level: 2,
      title: { zh: '一輪就收工', en: 'Done in one pass' },
      desc: { zh: '在至少 10 個數、「已排好」的資料上，讓「泡沫排序」只比較 n − 1 次就結束。', en: 'On “Sorted” data with at least 10 values, let “Bubble sort” finish after only n − 1 comparisons.' },
      check: function (ev) { return anyRun(ev, function (r, d) { return r.algo === 'bubble' && d.n >= 10 && r.comps === d.n - 1; }); }
    },
    {
      id: 'sorting-3', level: 3,
      title: { zh: '插隊插到底', en: 'Cutting all the way to the front' },
      desc: { zh: '找一份至少 10 個數的資料，讓「插入排序」的比較次數達到最多的 n(n − 1)/2 次。', en: 'Find data with at least 10 values on which “Insertion sort” makes the maximum n(n − 1)/2 comparisons.' },
      check: function (ev) { return anyRun(ev, function (r, d) { return r.algo === 'insertion' && d.n >= 10 && r.comps === half(d.n); }); }
    },
    {
      id: 'sorting-4', level: 3,
      title: { zh: '選擇排序不看資料', en: 'Selection sort does not care' },
      desc: { zh: '資料個數 n 不變（至少 10），用三種不同的資料形態各跑完一次「選擇排序」，看比較次數是不是一樣。', en: 'Keep n the same (at least 10) and run “Selection sort” to the end on three different shapes of data. Are the comparisons the same?' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!anyRun(ev, function (r) { return r.algo === 'selection'; }) || d.n < 10) return false;
        const c = runs(ev).filter(function (r) { return r.algo === 'selection'; })[0].comps;
        const key = d.n + '|' + c;
        mem[key] = mem[key] || {};
        mem[key][d.shape] = true;
        return Object.keys(mem[key]).length >= 3;
      }
    },
    {
      id: 'sorting-5', level: 4,
      title: { zh: '雙胞胎換了位置', en: 'The twins swapped places' },
      desc: { zh: '用有相同值、至少 8 個數的資料（例如「很多重複」），讓一種排序把相同值的原本順序打亂。', en: 'Using data with equal values and at least 8 values (for example “Many duplicates”), let a sort scramble the original order of equal values.' },
      check: function (ev) { return anyRun(ev, function (r, d) { return d.n >= 8 && r.stable === false; }); }
    },
    {
      id: 'sorting-6', level: 4,
      title: { zh: '幾乎排好時誰最快', en: 'Who wins when it is nearly sorted?' },
      desc: { zh: '在至少 32 個數、「幾乎排好」的資料上按「五種一起比」跑完，看哪一種比較最少。', en: 'On “Nearly sorted” data with at least 32 values, run “All five at once” to the end and see which one compares least.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'race' || d.shape !== 'nearly' || d.n < 32) return false;
        const R = d.results, ci = R.insertion.comps;
        return Object.keys(R).every(function (a) { return R[a].comps >= ci; });
      }
    },
    {
      id: 'sorting-7', level: 5,
      title: { zh: '快速排序的惡夢', en: 'Quicksort’s nightmare' },
      desc: { zh: '用沒有重複值、至少 20 個數的資料，讓「快速排序」（不勾「三數取中」）的比較次數達到最多的 n(n − 1)/2 次。', en: 'With at least 20 values and no repeats, make “Quicksort” (without “Median of three”) use the maximum n(n − 1)/2 comparisons.' },
      check: function (ev) { const d = ev.data; return !d.median3 && d.distinct === d.n && d.n >= 20 && anyRun(ev, function (r) { return r.algo === 'quick' && r.comps === half(d.n); }); }
    },
    {
      id: 'sorting-8', level: 5,
      title: { zh: '畫出拋物線', en: 'Draw the parabola' },
      desc: { zh: '在下方比較次數對 n 的圖上，讓同一種演算法至少有 5 個不同 n 的點落在 n(n − 1)/2 曲線上。', en: 'On the chart of comparisons against n below the bars, get points for at least 5 different values of n from the same algorithm lying on the n(n − 1)/2 curve.' },
      check: function (ev) {
        const pts = (ev.data && ev.data.chart) || [];
        const by = {};
        pts.forEach(function (q) { if (q.c === half(q.n)) { by[q.a] = by[q.a] || {}; by[q.a][q.n] = true; } });
        return Object.keys(by).some(function (a) { return Object.keys(by[a]).length >= 5; });
      }
    },
    {
      id: 'sorting-9', level: 6,
      title: { zh: '三數取中來救援', en: 'Median of three to the rescue' },
      desc: { zh: '在至少 32 個數、「已排好」的資料上勾選「三數取中」，讓「快速排序」的比較次數降到不到 n(n − 1)/2 的三分之一。', en: 'On “Sorted” data with at least 32 values, tick “Median of three” and bring the comparisons of “Quicksort” below one third of n(n − 1)/2.' },
      check: function (ev) { const d = ev.data; return d.median3 && d.sortedIn && d.distinct === d.n && d.n >= 32 && anyRun(ev, function (r) { return r.algo === 'quick' && r.comps * 3 < half(d.n); }); }
    },
    {
      id: 'sorting-10', level: 7,
      title: { zh: '每個人都要搬家', en: 'Everybody moves' },
      desc: { zh: '找一份至少 10 個數的資料，讓「選擇排序」的交換次數達到最多的 n − 1 次。', en: 'Find data with at least 10 values on which “Selection sort” makes the maximum n − 1 swaps.' },
      check: function (ev) { return anyRun(ev, function (r, d) { return r.algo === 'selection' && d.n >= 10 && r.swaps === d.n - 1; }); }
    },
    {
      id: 'sorting-11', level: 8,
      title: { zh: '合併排序的最壞情況', en: 'Merge sort at its worst' },
      desc: { zh: '找一份至少 16 個數的資料，讓「合併排序」的比較次數剛好達到讀數區公式算出的最壞值（16 個數是 49 次）。', en: 'Find data with at least 16 values on which “Merge sort” makes exactly the worst-case number of comparisons given by the formula in the readings (49 for 16 values).' },
      check: function (ev) { return anyRun(ev, function (r, d) { return r.algo === 'merge' && d.n >= 16 && r.comps === mergeWorst(d.n); }); }
    },
    {
      id: 'sorting-12', level: 10,
      title: { zh: '完美的樞紐', en: 'Perfect pivots' },
      desc: { zh: '用「自訂」資料（至少 15 個數），讓「快速排序」（不勾「三數取中」）的比較次數降到最少可能值——15 個數只要 34 次。', en: 'With “Custom” data (at least 15 values), bring “Quicksort” (without “Median of three”) down to the fewest comparisons possible — only 34 for 15 values.' },
      check: function (ev) { const d = ev.data; return !d.median3 && d.n >= 15 && anyRun(ev, function (r) { return r.algo === 'quick' && r.comps === quickMin(d.n); }); }
    },

    // ---------------- 隱藏任務（只看單一演算法） ----------------
    {
      id: 'sorting-h1', level: 3, hidden: true,
      riddle: { zh: '比起隨手打亂的隊伍，最亂的那一條，只要頭尾兩兩握手，就各自回家了——隊伍長一點、短一點都一樣。', en: 'Compared with a line shuffled at random, the most jumbled line of all only needs its two ends to shake hands, pair by pair, and everyone is home — whether the line is longer or shorter.' },
      // 選擇排序：同一個 n 先跑過亂序（交換多於 ⌊n/2⌋），再跑反序剛好 ⌊n/2⌋ 次；要在兩個不同的 n（≥ 10）都看到
      check: function (ev, mem) {
        if (!single(ev)) return false;
        const d = ev.data;
        if (d.algo !== 'selection' || d.n < 10) return false;
        mem.rand = mem.rand || {}; mem.ok = mem.ok || {};
        if (d.shape === 'random' && d.swaps > Math.floor(d.n / 2)) { mem.rand[d.n] = true; return false; }
        if (d.reversedIn && d.swaps === Math.floor(d.n / 2) && mem.rand[d.n]) mem.ok[d.n] = true;
        return Object.keys(mem.ok).length >= 2;
      }
    },
    {
      id: 'sorting-h2', level: 8, hidden: true,
      riddle: { zh: '愛冒泡的和愛插隊的，走在一條既不平坦、也不顛倒的路上，最後數出了同一個數。', en: 'The one who bubbles and the one who cuts in line walk a road that is neither smooth nor upside down, and end up counting to the same number.' },
      check: function (ev, mem) {
        if (!single(ev)) return false;
        const d = ev.data;
        if ((d.algo !== 'bubble' && d.algo !== 'insertion') || d.n < 8 || d.sortedIn || nonIncreasing(d.values)) return false;
        const key = d.values.join(',');
        mem.seen = mem.seen || {};
        const rec = mem.seen[key] = mem.seen[key] || {};
        rec[d.algo] = d.comps;
        return rec.bubble != null && rec.bubble === rec.insertion;
      }
    },
    {
      id: 'sorting-h3', level: 10, hidden: true,
      riddle: { zh: '三位證人一起作證，法官還是判錯了——一次又一次。', en: 'Three witnesses testify together, and still the judge gets it wrong — again and again.' },
      check: function (ev) {
        if (!single(ev)) return false;
        const d = ev.data;
        return d.algo === 'quick' && d.median3 && d.distinct === d.n && d.n >= 32 && d.comps * 2 >= half(d.n);
      }
    },
    {
      id: 'sorting-h4', level: 6, hidden: true,
      riddle: { zh: '眾生平等之處，分而治之最辛苦。', en: 'Where all are equal, divide and conquer toils the hardest.' },
      check: function (ev) {
        if (!single(ev)) return false;
        const d = ev.data;
        return d.algo === 'quick' && d.distinct === 1 && d.n >= 10 && d.comps >= half(d.n);
      }
    },
    {
      id: 'sorting-h5', level: 7, hidden: true,
      riddle: { zh: '隊伍不必排得整整齊齊；只要每一場會師都是勢均力敵的兩隊，而總有一隊先走光，另一隊連開口的機會都沒有。', en: 'The line need not be in order: it is enough that every meeting is between two evenly matched sides, and one side always runs out first while the other never even gets to speak.' },
      // 合併排序、n ≥ 16、原始資料既不是由小到大也不是由大到小，比較次數 × 2 = 寫入次數（每次合併都對半分、而且一邊倒）
      check: function (ev) {
        if (!single(ev)) return false;
        const d = ev.data;
        return d.algo === 'merge' && d.n >= 16 && !d.sortedIn && !d.reversedIn && d.comps * 2 === d.writes;
      }
    },
    {
      id: 'sorting-h6', level: 6, hidden: true,
      riddle: { zh: '在所有可能的隊伍裡，它不偏不倚，剛好站在正中央。', en: 'Among all the lines that could ever be, it stands exactly in the middle.' },
      check: function (ev) {
        if (!single(ev)) return false;
        const d = ev.data;
        return (d.algo === 'bubble' || d.algo === 'insertion') && d.n >= 16 && d.distinct === d.n && d.swaps * 4 === d.n * (d.n - 1);
      }
    },
    {
      id: 'sorting-h7', level: 7, hidden: true,
      riddle: { zh: '最小的背叛，只需要三個角色。', en: 'The smallest betrayal needs a cast of only three.' },
      check: function (ev) { return single(ev) && ev.data.n === 3 && ev.data.stable === false; }
    },
    {
      id: 'sorting-h8', level: 5, hidden: true,
      riddle: { zh: '逆流而上的船，在兩條不同的河上，都比順流而下的先到。', en: 'On two different rivers, the boat going upstream arrives before the one drifting down.' },
      // 合併排序、沒有重複：同一個 n 跑過已排好與反序，反序的比較次數較少；要在兩個不同的 n 都看到
      check: function (ev, mem) {
        if (!single(ev)) return false;
        const d = ev.data;
        if (d.algo !== 'merge' || d.distinct !== d.n) return false;
        mem.up = mem.up || {}; mem.down = mem.down || {}; mem.ok = mem.ok || {};
        if (d.sortedIn) mem.down[d.n] = d.comps;
        else if (d.reversedIn) mem.up[d.n] = d.comps;
        else return false;
        if (mem.up[d.n] != null && mem.down[d.n] != null && mem.up[d.n] < mem.down[d.n]) mem.ok[d.n] = true;
        return Object.keys(mem.ok).length >= 2;
      }
    },
    {
      id: 'sorting-h9', level: 4, hidden: true,
      riddle: { zh: '從不保證守約的人，這一次一個約也沒有失。', en: 'The one who never promises to keep its word kept every promise this time.' },
      check: function (ev) {
        if (!single(ev)) return false;
        const d = ev.data;
        return d.algo === 'quick' && d.n >= 20 && d.distinct >= 3 && d.dup * 4 >= d.n && d.stable === true;
      }
    },
    {
      id: 'sorting-h10', level: 7, hidden: true,
      riddle: { zh: '一隻烏龜殿後，整條隊伍就得走最遠的路。', en: 'One tortoise at the back, and the whole line must walk the longest road.' },
      check: function (ev) {
        if (!single(ev)) return false;
        const d = ev.data;
        return d.algo === 'bubble' && d.n >= 10 && d.comps === half(d.n) && d.swaps === d.n - 1;
      }
    }
  ]);
})();
