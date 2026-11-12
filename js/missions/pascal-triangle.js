/* missions/pascal-triangle.js — 巴斯卡三角形與二項式定理的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/pascal-triangle.js 發出，都在使用者操作之後）：
 *   'cell'：在三角形上點一格。{ n, k, value（C(n, k) 的十進位字串）, mod（依餘數上色時的 m，沒上色是 null）, rows }
 *   'tri'：三角形的設定改變。{ rows（列數）, mod（同上） }
 *   'path'：自己一步一步走到終點 B。{ m, n, nb（路障數） }
 *   'grid'：走格子的設定改變（格子大小、路障）。{ m, n, nb, count（路徑數）, total（沒有路障時的路徑數） }
 *   'binom'：二項式的設定改變或代入。{ a, b, n（(a x + b)^n）, coefs（x^0 到 x^n 的係數）, sub（剛剛代入的 x：1、−1 或 null） }
 *   'challenge'：挑戰答對一題。{ time（秒）, streak（連續答對幾題）, last3（最近三題總秒數，不到三題為 null） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const allOdd = function (n) { return n >= 0 && ((n + 1) & n) === 0; };

  LabMission.register('pascal-triangle', [
    {
      id: 'pascal-triangle-1', level: 1,
      title: { zh: '點一格', en: 'Tap a number' },
      desc: { zh: '在巴斯卡三角形上點一格，看它是上面哪兩格加起來的。', en: 'Tap a cell of Pascal’s triangle and see which two cells above add up to it.' },
      check: function (ev) { return ev.type === 'cell'; }
    },
    {
      id: 'pascal-triangle-2', level: 2,
      title: { zh: '奇偶花紋', en: 'Odd and even' },
      desc: { zh: '依「除以 m 的餘數」上色、m 用 2，並把列數加到 32 以上，看奇數排出的花紋。', en: 'Colour by the remainder on division by m with m = 2, and show at least 32 rows to see the pattern the odd numbers make.' },
      check: function (ev) { return ev.type === 'tri' && ev.data.mod === 2 && ev.data.rows >= 32; }
    },
    {
      id: 'pascal-triangle-3', level: 3,
      title: { zh: '三種花紋', en: 'Three patterns' },
      desc: { zh: '至少 16 列時，依三種不同的 m 看「除以 m 的餘數」上色的花紋。', en: 'With at least 16 rows, colour by the remainder on division by m for three different values of m.' },
      check: function (ev, mem) {
        if (ev.type !== 'tri' || ev.data.mod == null || ev.data.rows < 16) return false;
        mem.ms = mem.ms || {};
        mem.ms[ev.data.mod] = true;
        return Object.keys(mem.ms).length >= 3;
      }
    },
    {
      id: 'pascal-triangle-4', level: 5,
      title: { zh: '四個 120', en: 'Four 120s' },
      desc: { zh: '數字 120 在三角形的前 64 列裡出現 4 次。把這 4 格都點出來。', en: 'The number 120 appears 4 times in the first 64 rows. Tap all four of them.' },
      check: function (ev, mem) {
        if (ev.type !== 'cell' || ev.data.value !== '120') return false;
        mem.pos = mem.pos || {};
        mem.pos[ev.data.n + ',' + ev.data.k] = true;
        return Object.keys(mem.pos).length >= 4;
      }
    },
    {
      id: 'pascal-triangle-5', level: 2,
      title: { zh: '走到 B', en: 'Walk to B' },
      desc: { zh: '在「走格子」模式，從 A 一步一步（向右或向上）點到 B。', en: 'In “Grid paths” mode, tap your way from A to B one step at a time (right or up).' },
      check: function (ev) { return ev.type === 'path'; }
    },
    {
      id: 'pascal-triangle-6', level: 3,
      title: { zh: '252 條路', en: '252 routes' },
      desc: { zh: '不放路障，把格子調成從 A 到 B 剛好有 252 條最短路徑。', en: 'With no blocks, size the grid so that there are exactly 252 shortest routes from A to B.' },
      check: function (ev) { return ev.type === 'grid' && ev.data.nb === 0 && ev.data.count === 252; }
    },
    {
      id: 'pascal-triangle-7', level: 4,
      title: { zh: '擋掉一半', en: 'Block half of them' },
      desc: { zh: '只放一個路障，讓路徑數剛好變成沒有路障時的一半。', en: 'Place a single block so that the number of routes becomes exactly half of what it was.' },
      check: function (ev) { const d = ev.data; return ev.type === 'grid' && d.nb === 1 && d.count * 2 === d.total; }
    },
    {
      id: 'pascal-triangle-8', level: 5,
      title: { zh: '剩下 20 條', en: '20 routes left' },
      desc: { zh: '在 4 × 4 的格子放兩個路障，讓路徑剛好剩下 20 條。', en: 'On a 4 × 4 grid, place two blocks so that exactly 20 routes are left.' },
      check: function (ev) { const d = ev.data; return ev.type === 'grid' && d.m === 4 && d.n === 4 && d.nb === 2 && d.count === 20; }
    },
    {
      id: 'pascal-triangle-9', level: 3,
      title: { zh: '代入 1 和 −1', en: 'Put in 1 and −1' },
      desc: { zh: '在「二項式展開」模式，同一個展開式（n ≥ 4）先後代入 x = 1 和 x = −1，看係數和與交錯和。', en: 'In “Binomial expansion” mode, put x = 1 and x = −1 into the same expansion (n ≥ 4) to get the sum and the alternating sum of the coefficients.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'binom' || d.n < 4 || d.sub == null) return false;
        const key = d.a + ',' + d.b + ',' + d.n;
        if (mem.key !== key) { mem.key = key; mem.s = {}; }
        mem.s[d.sub] = true;
        return !!(mem.s[1] && mem.s[-1]);
      }
    },
    {
      id: 'pascal-triangle-10', level: 4,
      title: { zh: '係數 −160', en: 'A coefficient of −160' },
      desc: { zh: '調整 (a x + b)^n，讓展開式裡有一項的係數剛好是 −160。', en: 'Adjust (a x + b)^n so that one term of the expansion has coefficient exactly −160.' },
      check: function (ev) { return ev.type === 'binom' && ev.data.coefs.indexOf(-160) >= 0; }
    },
    {
      id: 'pascal-triangle-11', level: 4,
      title: { zh: '幾條路？', en: 'How many routes?' },
      desc: { zh: '按「出一題」，不看數字，選出從 A 到 B 有幾條最短路徑。', en: 'Press “New challenge” and, without the numbers, pick how many shortest routes go from A to B.' },
      check: function (ev) { return ev.type === 'challenge'; }
    },
    {
      id: 'pascal-triangle-12', level: 7,
      title: { zh: '三連發', en: 'Three in a row' },
      desc: { zh: '連續答對三題挑戰，三題合計 60 秒以內。', en: 'Answer three challenges in a row correctly, in 60 seconds or less in total.' },
      check: function (ev) { return ev.type === 'challenge' && ev.data.last3 != null && ev.data.last3 <= 60; }
    },
    {
      id: 'pascal-triangle-h1', level: 4, hidden: true,
      riddle: { zh: '整排的人都落單。', en: 'Everyone in the row is the odd one out.' },
      check: function (ev) { const d = ev.data; return ev.type === 'cell' && d.mod === 2 && d.n >= 7 && allOdd(d.n); }
    },
    {
      id: 'pascal-triangle-h2', level: 4, hidden: true,
      riddle: { zh: '條條大路，只剩一條。', en: 'All roads once led there; now only one does.' },
      check: function (ev) { const d = ev.data; return ev.type === 'grid' && d.m >= 3 && d.n >= 3 && d.count === 1; }
    }
  ]);
})();
