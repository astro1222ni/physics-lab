/* missions/binary-search.js — 線性搜尋與二分搜尋的任務（一般任務星星數 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/binary-search.js 發出，都在使用者操作之後；資料由 BinarySearchCore 產生，任務證明用同一套函式）：
 *   'search'：兩種搜尋都跑完之後（「開始搜尋」播完、「單步」走完或「直接看結果」）。BinarySearchCore.searchEvent：
 *             { n, kind（'sorted' | 'dups' | 'unsorted'）, first（找第一個出現的位置）, target, inArray, count, firstIdx, lastIdx,
 *               linCmp, linFound, binCmp, binFound, binOk, plainIdx, plainCmp（一般版二分搜尋）, worst（⌊log₂n⌋+1）, perfect, below, above, path, via }
 *   'sweep'：按「每個目標都找一次」之後。BinarySearchCore.sweepEvent：
 *             { n, kind, first, keys, linAvg, binAvg, ratio, linMax, binMax, binMin, binFound, failMin, failMax, failAvg（只有排好的才有）, worst, perfect }
 *   'game'：猜數字猜中（或耍賴的電腦只剩一個數）之後。BinarySearchCore.gameEvent：
 *             { N, adversary, guesses, optimal（⌈log₂(N+1)⌉）, wasted（猜了早就不可能的數）, allMid, secret }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const sorted = function (d) { return d.kind === 'sorted'; };
  const isPow2 = function (x) { return x >= 1 && (x & (x - 1)) === 0; };
  const log2i = function (x) { let k = 0; while ((1 << (k + 1)) <= x) k++; return k; };

  LabMission.register('binary-search', [
    {
      id: 'binary-search-1', level: 1,
      title: { zh: '第一次搜尋', en: 'The first search' },
      desc: { zh: '按「開始搜尋」（或用「單步」一步一步走），讓兩種方法把一個卡片上有的數找完。', en: 'Press “Start search” (or “Step” through it) and let both methods finish looking for a number that is on the cards.' },
      check: function (ev) { return ev.type === 'search' && ev.data.inArray; }
    },
    {
      id: 'binary-search-2', level: 2,
      title: { zh: '翻遍每一張', en: 'Every single card' },
      desc: { zh: '在「排好的」卡片中搜尋一個卡片上沒有的數，看線性搜尋要比幾次才肯放棄。', en: 'With “Sorted” cards, search for a number that is not on any card and see how many comparisons linear search needs before it gives up.' },
      check: function (ev) { const d = ev.data; return ev.type === 'search' && sorted(d) && !d.inArray; }
    },
    {
      id: 'binary-search-3', level: 2,
      title: { zh: '第一眼就看到', en: 'Found at first glance' },
      desc: { zh: '在至少 15 張「排好的」卡片中，讓二分搜尋只比 1 次就找到目標。', en: 'With at least 15 “Sorted” cards, make binary search find the target with just 1 comparison.' },
      check: function (ev) { const d = ev.data; return ev.type === 'search' && sorted(d) && d.n >= 15 && d.binFound >= 0 && d.binCmp === 1; }
    },
    {
      id: 'binary-search-4', level: 3,
      title: { zh: '烏龜贏一次', en: 'The tortoise wins one' },
      desc: { zh: '在至少 15 張「排好的」卡片中，找一個讓線性搜尋比得比二分搜尋還少次的目標。', en: 'With at least 15 “Sorted” cards, pick a target that linear search finds with fewer comparisons than binary search.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'search' && sorted(d) && d.n >= 15 && d.linFound >= 0 && d.binFound >= 0 && d.linCmp < d.binCmp;
      }
    },
    {
      id: 'binary-search-5', level: 4,
      title: { zh: '最壞的情況', en: 'The worst case' },
      desc: { zh: '在至少 100 張「排好的」卡片中，找一個讓二分搜尋比到最多次才找到的目標（決策樹有幾層就比幾次）。', en: 'With at least 100 “Sorted” cards, pick a target that binary search finds only after the most comparisons it can ever need (one for every level of the tree).' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'search' && sorted(d) && !d.first && d.n >= 100 && d.binFound >= 0 && d.binCmp === d.worst;
      }
    },
    {
      id: 'binary-search-6', level: 4,
      title: { zh: '七次之內', en: 'Within seven' },
      desc: { zh: '玩範圍 1 到 100 的猜數字，在 7 次之內猜中。', en: 'Play the guessing game with numbers from 1 to 100 and get it in 7 guesses or fewer.' },
      check: function (ev) { const d = ev.data; return ev.type === 'game' && d.N === 100 && d.guesses <= 7; }
    },
    {
      id: 'binary-search-7', level: 3,
      title: { zh: '沒排序就會漏', en: 'Unsorted means missed' },
      desc: { zh: '選「沒排序」，找一個卡片上明明有、二分搜尋卻說找不到的數。', en: 'Choose “Not sorted” and find a number that is on the cards but that binary search says is not there.' },
      check: function (ev) { const d = ev.data; return ev.type === 'search' && d.kind === 'unsorted' && d.inArray && d.binFound < 0; }
    },
    {
      id: 'binary-search-8', level: 3,
      title: { zh: '五十倍', en: 'Fifty times faster' },
      desc: { zh: '用「排好的」卡片按「每個目標都找一次」，讓線性搜尋的平均比較次數是二分搜尋的 50 倍以上。', en: 'With “Sorted” cards, press “Search for every number” so that linear search averages at least 50 times as many comparisons as binary search.' },
      check: function (ev) { const d = ev.data; return ev.type === 'sweep' && sorted(d) && d.ratio >= 50; }
    },
    {
      id: 'binary-search-9', level: 5,
      title: { zh: '第一個出現的位置', en: 'The first occurrence' },
      desc: { zh: '選「有重複的值」並勾選「找第一個出現的位置」，搜尋一個重複的數，而且一般的二分搜尋不會停在它第一次出現的地方。', en: 'Choose “With repeats”, tick “Find the first occurrence”, and search for a repeated number that the ordinary binary search would not stop at first.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'search' && d.kind === 'dups' && d.first && d.count >= 2 && d.binFound === d.firstIdx && d.plainIdx !== d.firstIdx;
      }
    },
    {
      id: 'binary-search-10', level: 6,
      title: { zh: '十次之內', en: 'Within ten' },
      desc: { zh: '玩範圍 1 到 1000 的猜數字，在 10 次之內猜中。', en: 'Play the guessing game with numbers from 1 to 1000 and get it in 10 guesses or fewer.' },
      check: function (ev) { const d = ev.data; return ev.type === 'game' && d.N === 1000 && d.guesses <= 10; }
    },
    {
      id: 'binary-search-11', level: 7,
      title: { zh: '打敗耍賴的電腦', en: 'Beat the cheating computer' },
      desc: { zh: '勾選「耍賴的電腦」，在範圍 1 到 100 裡只用 7 次就逼它說出答案。', en: 'Tick “Cheating computer” and, with numbers from 1 to 100, corner it in just 7 guesses.' },
      check: function (ev) { const d = ev.data; return ev.type === 'game' && d.adversary && d.N === 100 && d.guesses <= 7; }
    },
    {
      id: 'binary-search-12', level: 9,
      title: { zh: '千中選一', en: 'One in a thousand' },
      desc: { zh: '勾選「耍賴的電腦」，在範圍 1 到 1000 裡只用 10 次就逼它說出答案。', en: 'Tick “Cheating computer” and, with numbers from 1 to 1000, corner it in just 10 guesses.' },
      check: function (ev) { const d = ev.data; return ev.type === 'game' && d.adversary && d.N === 1000 && d.guesses <= 10; }
    },

    // ---------- 隱藏任務 ----------
    {
      id: 'binary-search-h1', level: 3, hidden: true,
      riddle: { zh: '兩位尋人者這次一樣倒楣，都走完了自己最長的那條路。', en: 'This time both seekers were equally unlucky: each walked the longest road they have.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'search' && sorted(d) && !d.first && d.n >= 100 && d.linFound >= 0 && d.binFound >= 0 && d.linCmp === d.n && d.binCmp === d.worst;
      }
    },
    {
      // 要看著兩邊跑完（「開始搜尋」或「單步」，不算「直接看結果」）；n ≥ 63、≥ 4 次：亂按模擬碰巧完成 < 1%
      id: 'binary-search-h2', level: 5, hidden: true,
      riddle: { zh: '龜與兔在同一聲鐘響裡抵達。', en: 'The tortoise and the hare cross the line on the very same tick.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'search' && d.via !== 'skip' && sorted(d) && d.n >= 63 && d.linFound >= 0 && d.binFound >= 0 && d.linCmp === d.binCmp && d.binCmp >= 4;
      }
    },
    {
      id: 'binary-search-h3', level: 5, hidden: true,
      riddle: { zh: '同一張臉站成一排；一位指認了排頭，一位指認了排尾，兩人都沒說錯。', en: 'Identical faces stand in a row; one witness points to the first, the other to the last, and neither is wrong.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'search' && d.kind === 'dups' && !d.first && d.n >= 31 && d.count >= 5 && d.binFound === d.lastIdx && d.linFound === d.firstIdx;
      }
    },
    {
      id: 'binary-search-h4', level: 4, hidden: true,
      riddle: { zh: '一步一步往前挪，那個騙子就陪你走完全程。', en: 'Inch forward one step at a time, and the trickster will walk you all the way to the end.' },
      check: function (ev) { const d = ev.data; return ev.type === 'game' && d.adversary && d.N >= 10 && d.wasted === 0 && d.guesses === d.N; }
    },
    {
      id: 'binary-search-h5', level: 6, hidden: true,
      riddle: { zh: '明明第一眼就認出了你，卻還要一路問到底：你前面還有沒有人？', en: 'I knew you at first glance, yet I still had to ask all the way down: is anyone ahead of you?' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'search' && d.kind === 'dups' && d.first && d.n >= 31 && d.plainCmp === 1 && d.binFound === d.firstIdx && d.firstIdx <= d.plainIdx - 2;
      }
    },
    {
      // 只有 n = 31、63（每層都排滿）；n = 15 用滑桿太容易碰到，所以不算
      id: 'binary-search-h6', level: 7, hidden: true,
      riddle: { zh: '每一扇錯的門後面，樓梯都一樣長。', en: 'Behind every wrong door, the staircase is exactly as long.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'sweep' && sorted(d) && !d.first && d.n >= 31 && d.n <= 63 && d.failMin != null && d.failMin === d.failMax;
      }
    },
    {
      // n = 127、255、511；1023 是滑桿最右端，太容易碰巧，所以不算
      id: 'binary-search-h7', level: 7, hidden: true,
      riddle: { zh: '站在門口的那一位，聰明人卻翻遍了整棟樓才找到。', en: 'The one standing right at the door — the clever seeker searched the whole building before finding them.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'search' && sorted(d) && !d.first && d.n >= 100 && d.n < 1023 && d.linCmp === 1 && d.binFound === 0 && d.binCmp === d.worst;
      }
    },
    {
      id: 'binary-search-h8', level: 8, hidden: true,
      riddle: { zh: '只多請了一位客人，樓房就得再加蓋一層。', en: 'Invite just one more guest, and the house needs a whole new floor.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'search' || !sorted(d) || d.first || d.binFound < 0 || d.binCmp !== d.worst || d.n < 31) return false;
        mem.full = mem.full || {}; mem.more = mem.more || {};
        let k = -1;
        if (isPow2(d.n + 1)) { k = log2i(d.n + 1); mem.full[k] = true; }
        else if (isPow2(d.n)) { k = log2i(d.n); mem.more[k] = true; }
        return k >= 5 && !!mem.full[k] && !!mem.more[k];
      }
    },
    {
      id: 'binary-search-h9', level: 8, hidden: true,
      riddle: { zh: '沒有地圖的迷宮，你卻每個岔路都轉對，一路走到了最深處。', en: 'A maze with no map, yet you turned the right way at every fork, all the way to the deepest room.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'search' && d.kind === 'unsorted' && !d.first && d.n >= 31 && d.binFound >= 0 && d.binCmp === d.worst;
      }
    },
    {
      id: 'binary-search-h10', level: 9, hidden: true,
      riddle: { zh: '沒有一絲餘裕的天平：每一次都得放在正中央，差一點都不行。', en: 'A balance with no slack at all: every weighing must sit dead centre, not a hair off.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'game' && d.adversary && d.N >= 63 && isPow2(d.N + 1) && d.guesses === log2i(d.N + 1);
      }
    }
  ]);
})();
