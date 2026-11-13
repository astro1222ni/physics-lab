/* missions/big-o.js — 時間複雜度的任務（一般任務星星數 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/big-o.js 發出，都在使用者操作之後；資料由 BigOCore 產生，任務證明用同一套函式）：
 *   'lane'：某一個演算法跑到終點（「開始賽跑」播放中、「單步」走到、或「直接跑完」）。BigOCore.laneEvent：
 *           { algo（'binary' | 'linear' | 'merge' | 'pairs' | 'subsets'）, n, shape（'random' | 'sorted' | 'worst'）, count,
 *             formula（子集合用公式算）, via（'play' | 'step' | 'skip'）, bound（合併排序的上界）, counts（五種的次數） }
 *   'race'：五個都跑完。BigOCore.raceEvent：{ n, shape, counts, formula（n > 20）, via, mergeBound, timeNs（每個 1 奈秒） }
 *   'double'：按「n 加倍」。BigOCore.doubleEvent：{ n0, n1 = 2·n0, shape, before, after, ratio（after ÷ before）, diff（after − before） }
 *   'compare'：改常數因子區的函數或常數（via 'cmp'），或改 n（via 'n'）。BigOCore.compareEvent：
 *           { fa, a, fb, b（A = a·fa(n)、B = b·fb(n)；函數代號 log、sqrt、n、nlogn、n2、n3、exp2、fact）, n（目前的 n）,
 *             at（目前的 n 哪邊大：'A' | 'B' | 'eq'）, equalAt（目前的 n 剛好相等）, same（同一個函數）, winner（長得快的一邊）,
 *             cross（從這個 n 起快的一邊 ≥ 慢的一邊）, crossStrict（從這個 n 起 >）, equal（剛好相等的 n，前 12 個）, approx, via }
 *   'axis'：切換成長曲線的座標。{ mode：'lin' | 'semilog' | 'loglog' }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const isPow2 = function (x) { return x >= 1 && Math.floor(x) === x && (x & (x - 1)) === 0; };
  /** 這兩個函數剛好是 p、q（不管誰放 A、誰放 B） */
  const pair = function (d, p, q) { return (d.fa === p && d.fb === q) || (d.fa === q && d.fb === p); };
  /** 函數 f 那一邊的常數 */
  const constOf = function (d, f) { return d.fa === f ? d.a : d.b; };
  /** 目前的 n 比較大的是哪一個函數（剛好相等時是 null） */
  const bigger = function (d) { return d.at === 'A' ? d.fa : d.at === 'B' ? d.fb : null; };

  LabMission.register('big-o', [
    {
      id: 'big-o-1', level: 1,
      title: { zh: '起跑', en: 'Off the line' },
      desc: { zh: '按「開始賽跑」（或用「單步」一拍一拍走），看至少一個演算法跑到終點。', en: 'Press “Start race” (or “Step” through it tick by tick) and watch at least one algorithm reach the finish.' },
      check: function (ev) { return ev.type === 'lane' && ev.data.via !== 'skip'; }
    },
    {
      id: 'big-o-2', level: 2,
      title: { zh: '用公式算', en: 'Counted by formula' },
      desc: { zh: '把元素個數 n 調到大於 20，讓五個演算法都跑完（可以按「直接跑完」），看列出所有子集合要等多久。', en: 'Set the number of items n above 20 and let all five algorithms finish (“Run to the end” is fine); see how long listing every subset would take.' },
      check: function (ev) { return ev.type === 'race' && ev.data.formula; }
    },
    {
      id: 'big-o-3', level: 2,
      title: { zh: '加倍實驗', en: 'The doubling experiment' },
      desc: { zh: '按「n 加倍」，看每一種演算法的次數變成幾倍。', en: 'Press “Double n” and see how many times as many operations each algorithm needs.' },
      check: function (ev) { return ev.type === 'double'; }
    },
    {
      id: 'big-o-4', level: 3,
      title: { zh: '平方的代價', en: 'The price of a square' },
      desc: { zh: '選一個夠大的 n 再按「n 加倍」，讓兩兩比較的次數變成原來的 4 倍（誤差 0.05 以內）。', en: 'Pick a large enough n and press “Double n” so that every-pair comparisons become 4 times as many (within 0.05).' },
      check: function (ev) { const r = ev.type === 'double' && ev.data.ratio.pairs; return !!r && Math.abs(r - 4) <= 0.05 + 1e-12; }
    },
    {
      id: 'big-o-5', level: 3,
      title: { zh: '一百倍的常數', en: 'A constant of one hundred' },
      desc: { zh: '在常數因子區把兩個函數選成 n 和 n²，調整常數，讓交叉點剛好落在 n = 100。', en: 'In the constant-factor panel choose n and n², then set the constants so the crossover lands exactly at n = 100.' },
      check: function (ev) { const d = ev.data; return ev.type === 'compare' && pair(d, 'n', 'n2') && d.cross === 100; }
    },
    {
      id: 'big-o-6', level: 4,
      title: { zh: '指數超車', en: 'The exponential overtakes' },
      desc: { zh: '把兩個函數選成 n² 和 2^n、兩個常數設成一樣，再把 n 調到 2^n 從此一直比 n² 大的第一個值。', en: 'Choose n² and 2^n with equal constants, then set n to the first value from which 2^n stays strictly larger than n² for good.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'compare' && pair(d, 'n2', 'exp2') && d.a === d.b && d.n === d.crossStrict;
      }
    },
    {
      id: 'big-o-7', level: 4,
      title: { zh: '兩種直線', en: 'Two kinds of straight line' },
      desc: { zh: '把成長曲線切到「半對數」，再切到「雙對數」，看哪一種曲線在哪一種座標裡變成直線。', en: 'Switch the growth chart to “Semi-log” and then to “Log–log”, and see which curves turn into straight lines in which view.' },
      check: function (ev, mem) {
        if (ev.type !== 'axis') return false;
        mem[ev.data.mode] = true;
        return !!(mem.semilog && mem.loglog);
      }
    },
    {
      id: 'big-o-8', level: 5,
      title: { zh: '合併排序的最壞情況', en: 'Merge sort at its worst' },
      desc: { zh: '選「最壞情況」，n 至少 100，讓合併排序跑完：比較次數剛好等於上界。', en: 'Choose “Worst case” with n at least 100 and let merge sort finish: the comparisons hit the bound exactly.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'lane' && d.algo === 'merge' && d.shape === 'worst' && d.n >= 100 && d.count === d.bound;
      }
    },
    {
      id: 'big-o-9', level: 5,
      title: { zh: '只多一步', en: 'Just one more step' },
      desc: { zh: '讓 n 從 256 以上按「n 加倍」：資料多了幾百個，二分搜尋卻只多比 1 次。', en: 'From n of 256 or more, press “Double n”: hundreds more items, yet binary search needs only 1 more comparison.' },
      check: function (ev) { const d = ev.data; return ev.type === 'double' && d.n0 >= 256 && d.diff.binary === 1; }
    },
    {
      id: 'big-o-10', level: 6,
      title: { zh: '等上一年', en: 'A year of waiting' },
      desc: { zh: '每個操作 1 奈秒：找出最小的 n，讓列出所有子集合要等一年以上，並讓五個演算法都跑完。', en: 'At 1 ns per operation, find the smallest n for which listing every subset takes a year or more, and let all five algorithms finish.' },
      check: function (ev) { return ev.type === 'race' && ev.data.n === 55; }
    },
    {
      id: 'big-o-11', level: 6,
      title: { zh: '常數救不了', en: 'No constant can save it' },
      desc: { zh: '在常數因子區調整函數與常數，讓交叉點超過一百萬：長得慢的那一邊雖然常數很大，終究還是被追過。', en: 'In the constant-factor panel, choose functions and constants so the crossover is beyond one million: the slower-growing side has a big constant, yet it is still overtaken in the end.' },
      check: function (ev) { const d = ev.data; return ev.type === 'compare' && !d.same && d.cross > 1e6; }
    },
    {
      id: 'big-o-12', level: 8,
      title: { zh: '交叉點落在一千', en: 'Crossover at one thousand' },
      desc: { zh: '把兩個函數選成 n log n 和 n²，調整兩個常數，讓交叉點剛好落在 n = 1000。', en: 'Choose n log n and n², then set both constants so the crossover lands exactly at n = 1000.' },
      check: function (ev) { const d = ev.data; return ev.type === 'compare' && pair(d, 'nlogn', 'n2') && d.cross === 1000; }
    },

    // ---------- 隱藏任務 ----------
    {
      id: 'big-o-h1', level: 3, hidden: true,
      riddle: { zh: '三位跑者，三種腳程；在你親手敲下的同一聲鐘響裡，一起踏上終點。', en: 'Three runners with three different paces; on the one tick you strike by hand, they cross the line together.' },
      check: function (ev) {
        const d = ev.data, c = ev.type === 'race' && d.counts;
        return !!c && d.via === 'step' && d.shape === 'worst' && c.linear === c.merge && c.merge === c.pairs;
      }
    },
    {
      id: 'big-o-h2', level: 4, hidden: true,
      riddle: { zh: '平方與倍增在路上相遇兩次，從此再也不見。', en: 'The square and the doubler meet twice on the road, and never again.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'compare' || !pair(d, 'n2', 'exp2') || d.a !== d.b || !d.equalAt) return false;
        mem['e' + d.n] = true;
        return !!(mem.e2 && mem.e4);
      }
    },
    {
      id: 'big-o-h3', level: 4, hidden: true,
      riddle: { zh: '隊伍早已整齊，對折又對折的人剛好只花了一半的力氣。', en: 'The line was already in order; the one who folds and folds again spent exactly half the effort.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'lane' || d.algo !== 'merge' || d.shape !== 'sorted' || !isPow2(d.n) || d.n < 256) return false;
        return d.count * 2 === d.n * Math.round(Math.log2(d.n));
      }
    },
    {
      id: 'big-o-h4', level: 5, hidden: true,
      riddle: { zh: '站在根號與對數最後一次並肩的地方。', en: 'Stand where the root and the logarithm walk side by side for the last time.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'compare' && pair(d, 'sqrt', 'log') && d.a === d.b && d.equalAt && d.n === 16;
      }
    },
    {
      id: 'big-o-h5', level: 5, hidden: true,
      riddle: { zh: '一秒鐘的工作，只是份量加倍，就成了半輩子。', en: 'One second of work; double the size, and it becomes half a lifetime.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type === 'double') { mem.d30 = d.n0 === 30; return false; }
        if (ev.type === 'compare' && d.via === 'n' && d.n !== 60) mem.d30 = false;
        return ev.type === 'race' && d.n === 60 && !!mem.d30;
      }
    },
    {
      id: 'big-o-h6', level: 7, hidden: true,
      riddle: { zh: '厚厚那本教科書的第一章：八對六十四。站到讓位的那一格。', en: 'Chapter one of the thick textbook: eight against sixty-four. Stand on the square where one gives way.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'compare' && pair(d, 'n2', 'nlogn') && constOf(d, 'n2') === 8 && constOf(d, 'nlogn') === 64 && d.n === d.cross;
      }
    },
    {
      id: 'big-o-h7', level: 7, hidden: true,
      riddle: { zh: '隨手洗的牌，偏偏洗出了最難纏的那一副。', en: 'A careless shuffle that happened to deal the nastiest deck of all.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'lane' && d.algo === 'merge' && d.shape === 'random' && d.n >= 16 && d.count === d.bound;
      }
    },
    {
      id: 'big-o-h8', level: 6, hidden: true,
      riddle: { zh: '聰明人每一步都慢了一百倍；站到老實人終於不再落後的那一格。', en: 'The clever one is a hundred times slower at every step; stand on the square where the plodder stops falling behind.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'compare' && pair(d, 'log', 'n') && constOf(d, 'log') === 100 * constOf(d, 'n') && d.n === d.cross;
      }
    },
    {
      id: 'big-o-h9', level: 10, hidden: true,
      riddle: { zh: '兩種不同的成長，在二的某次方上分毫不差；那一格至少是六十四。', en: 'Two different growths agree to the last digit at some power of two — sixty-four or beyond.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'compare' && !d.same && d.equalAt && isPow2(d.n) && d.n >= 64;
      }
    },
    {
      id: 'big-o-h10', level: 8, hidden: true,
      riddle: { zh: '倍增起跑就領先，立方隨即反超，最後倍增再也不回頭。站上起點，再站上最後一次易手的前後兩格。', en: 'The doubler leads from the start, the cube overtakes, then the doubler pulls away for good. Stand on the start line, then on both squares of the final handover.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'compare' || !pair(d, 'n3', 'exp2') || d.a !== d.b) return false;
        const big = bigger(d);
        if (d.n === 1 && big === 'exp2') mem.one = true;
        if (d.n === 9 && big === 'n3') mem.nine = true;
        if (d.n === 10 && big === 'exp2') mem.ten = true;
        return !!(mem.one && mem.nine && mem.ten);
      }
    }
  ]);
})();
