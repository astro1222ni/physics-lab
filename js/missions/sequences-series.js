/* missions/sequences-series.js — 等差、等比數列與級數的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/sequences-series.js 發出，都在使用者操作之後）：
 *   'arith'：等差模式的設定改變。{ a1, d, n, an（第 n 項）, Sn（前 n 項和）, pair（是否打開高斯的配對） }
 *   'geom'：等比模式的設定改變。{ a1, r, n, an, Sn, Sinf（|r| < 1 時的無窮級數和，否則 null）, first99（n 是不是第一個讓 S_n 和 S∞ 差不到 1% 的項數） }
 *   'fig'：圖形數模式的設定改變。{ kind（'tri' 三角形數或 'odd' 奇數和）, n, count（點數）, joined（三角形是否拼成長方形） }
 *   'challenge'：挑戰答對一題。{ time（秒）, streak（連續答對幾題）, last3（最近三題總秒數，不到三題為 null） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const near = function (v, w, tol) { return Math.abs(v - w) <= (tol == null ? 1e-9 : tol); };
  const isSq = function (m) { if (!(m > 0) || !Number.isInteger(m)) return false; const s = Math.round(Math.sqrt(m)); return s * s === m; };

  LabMission.register('sequences-series', [
    {
      id: 'sequences-series-1', level: 2,
      title: { zh: '小高斯的加法', en: 'Young Gauss’s sum' },
      desc: { zh: '做出 1 + 2 + 3 + … + 100，打開「高斯的方法」看它為什麼是 5050。', en: 'Build 1 + 2 + 3 + … + 100 and turn on “Gauss’s trick” to see why it is 5050.' },
      check: function (ev) { const d = ev.data; return ev.type === 'arith' && near(d.a1, 1) && near(d.d, 1) && d.n === 100 && d.pair; }
    },
    {
      id: 'sequences-series-2', level: 3,
      title: { zh: '正負抵銷', en: 'Cancelling out' },
      desc: { zh: '讓一個公差不是 0 的等差數列，前 n 項和剛好是 0（n ≥ 2）。', en: 'Make the sum of the first n terms of an arithmetic sequence exactly 0 (n ≥ 2, nonzero difference).' },
      check: function (ev) { const d = ev.data; return ev.type === 'arith' && d.n >= 2 && !near(d.d, 0) && near(d.Sn, 0); }
    },
    {
      id: 'sequences-series-3', level: 2,
      title: { zh: '第十項', en: 'The tenth term' },
      desc: { zh: '公差是 3，讓第 10 項是 25，而且畫出至少 10 項。', en: 'With difference 3, make the 10th term 25, showing at least 10 terms.' },
      check: function (ev) { const d = ev.data; return ev.type === 'arith' && near(d.d, 3) && d.n >= 10 && near(d.a1 + 9 * d.d, 25); }
    },
    {
      id: 'sequences-series-4', level: 4,
      title: { zh: '八項湊一百', en: 'Eight terms make a hundred' },
      desc: { zh: '讓等差數列前 8 項的和是 100，公差不是 0。', en: 'Make the first 8 terms of an arithmetic sequence add up to 100, with a nonzero difference.' },
      check: function (ev) { const d = ev.data; return ev.type === 'arith' && d.n === 8 && !near(d.d, 0) && near(d.Sn, 100); }
    },
    {
      id: 'sequences-series-5', level: 2,
      title: { zh: '一直加倍', en: 'Keep doubling' },
      desc: { zh: '公比是 2，讓前 n 項和是 1023。', en: 'With ratio 2, make the sum of the first n terms 1023.' },
      check: function (ev) { const d = ev.data; return ev.type === 'geom' && near(d.r, 2) && near(d.Sn, 1023); }
    },
    {
      id: 'sequences-series-6', level: 4,
      title: { zh: '跳來跳去逼近 1', en: 'Zigzagging to 1' },
      desc: { zh: '用負的公比，讓無窮等比級數的和是 1。', en: 'With a negative ratio, make the infinite geometric series add up to 1.' },
      check: function (ev) { const d = ev.data; return ev.type === 'geom' && d.r < 0 && d.Sinf != null && near(d.Sinf, 1, 1e-6); }
    },
    {
      id: 'sequences-series-7', level: 3,
      title: { zh: '0.999… 等於多少', en: 'What is 0.999…?' },
      desc: { zh: '做出 0.9 + 0.09 + 0.009 + …，至少加 5 項，看看它的極限。', en: 'Build 0.9 + 0.09 + 0.009 + … with at least 5 terms and look at its limit.' },
      check: function (ev) { const d = ev.data; return ev.type === 'geom' && near(d.a1, 0.9) && near(d.r, 0.1) && d.n >= 5; }
    },
    {
      id: 'sequences-series-8', level: 5,
      title: { zh: '差不到千分之一', en: 'Within a thousandth' },
      desc: { zh: '1 + 1/2 + 1/4 + …：最少要加幾項，部分和才和 S∞ 差不到 0.001？把 n 調到這個最少的項數。', en: '1 + 1/2 + 1/4 + …: how many terms at least before the partial sum is within 0.001 of S∞? Set n to that smallest number.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'geom' || !near(d.a1, 1) || !near(d.r, 0.5) || d.Sinf == null) return false;
        return Math.abs(d.Sinf - d.Sn) < 0.001 && Math.abs(d.Sinf - (d.Sn - d.an)) >= 0.001;
      }
    },
    {
      id: 'sequences-series-9', level: 2,
      title: { zh: '兩個三角形拼成長方形', en: 'Two triangles, one rectangle' },
      desc: { zh: '把第 10 個三角形數再拼一份轉過來的，看它為什麼是 10 × 11 的一半。', en: 'Add a turned-around copy of the 10th triangular number and see why it is half of 10 × 11.' },
      check: function (ev) { const d = ev.data; return ev.type === 'fig' && d.kind === 'tri' && d.n === 10 && d.joined; }
    },
    {
      id: 'sequences-series-10', level: 3,
      title: { zh: '奇數圍成的方陣', en: 'A square of odd numbers' },
      desc: { zh: '用奇數和排出 12 × 12 的方陣：1 + 3 + … + 23。', en: 'Lay out the odd numbers 1 + 3 + … + 23 as a 12 × 12 square.' },
      check: function (ev) { const d = ev.data; return ev.type === 'fig' && d.kind === 'odd' && d.n === 12; }
    },
    {
      id: 'sequences-series-11', level: 4,
      title: { zh: '猜數列', en: 'Guess the sequence' },
      desc: { zh: '按「出一題」，從前四項看出規律，調出同一個數列並送出。', en: 'Press “New challenge”, spot the rule from the first four terms, build the same sequence and submit.' },
      check: function (ev) { return ev.type === 'challenge'; }
    },
    {
      id: 'sequences-series-12', level: 7,
      title: { zh: '三連發', en: 'Three in a row' },
      desc: { zh: '連續答對三題挑戰，三題合計 90 秒以內。', en: 'Answer three challenges in a row correctly, in 90 seconds or less in total.' },
      check: function (ev) { return ev.type === 'challenge' && ev.data.last3 != null && ev.data.last3 <= 90; }
    },
    // ---------- 隱藏任務 ----------
    {
      // 常數數列（首項不是 0）同時是公差 0 的等差數列與公比 1 的等比數列：兩種都要用同樣的首項與項數做出來
      id: 'sequences-series-h1', level: 3, hidden: true,
      riddle: { zh: '原地踏步的人，兩個門派都收他。', en: 'One who only marks time is welcomed by both schools.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type === 'arith' && near(d.d, 0) && !near(d.a1, 0) && d.n >= 3) mem.a = d.a1 + '|' + d.n;
        else if (ev.type === 'geom' && near(d.r, 1) && !near(d.a1, 0) && d.n >= 3) mem.g = d.a1 + '|' + d.n;
        else return false;
        return mem.a != null && mem.a === mem.g;
      }
    },
    {
      // 公比 −1：部分和在 a_1 與 0 之間擺盪；從奇數項（和是 a_1）走到很後面的偶數項（和是 0）
      id: 'sequences-series-h2', level: 4, hidden: true,
      riddle: { zh: '來回擺盪了很久，最後兩手空空。', en: 'After swinging back and forth for a long time, it ends up empty-handed.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'geom') return false;
        const prev = mem.p; mem.p = null;
        if (!near(d.r, -1) || near(d.a1, 0)) return false;
        mem.p = { a1: d.a1, n: d.n };
        return d.n >= 50 && d.n % 2 === 0 && near(d.Sn, 0) && prev != null && prev.a1 === d.a1 && prev.n % 2 === 1;
      }
    },
    {
      // 1 + 3 + 5 + … 的前 n 項和是 n²：等差數列做出來，再用圖形數排出同一個 n 的方陣（順序不拘）
      id: 'sequences-series-h3', level: 4, hidden: true,
      riddle: { zh: '單數一個一個加起來，總會圍成一塊方田。', en: 'Add the odd ones one by one, and they always fence in a square field.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type === 'arith' && near(d.a1, 1) && near(d.d, 2) && d.n >= 5) mem.a = d.n;
        else if (ev.type === 'fig' && d.kind === 'odd' && d.n >= 5) mem.f = d.n;
        else return false;
        return mem.a != null && mem.a === mem.f;
      }
    },
    {
      // 第一個大於 1 的「三角形平方數」：T_8 = 36 = 6²；三角形排出來，再用奇數和排出一樣多點的正方形
      id: 'sequences-series-h4', level: 5, hidden: true,
      riddle: { zh: '一堆豆子，排得成三角形，也排得成正方形。', en: 'A heap of beans that can be laid out as a triangle, and also as a square.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'fig') return false;
        if (d.kind === 'tri') { mem.c = d.n > 1 && d.n <= 20 && isSq(d.count) ? d.count : null; return false; }
        return mem.c != null && d.count === mem.c;
      }
    },
    {
      // 西洋棋盤的米：1 + 2 + 4 + … 共 64 格，總數 2^64 − 1
      id: 'sequences-series-h5', level: 6, hidden: true,
      riddle: { zh: '國王一口答應了，最後卻付不出那麼多米。', en: 'The king agreed at once, and then could not pay all that rice.' },
      check: function (ev) { const d = ev.data; return ev.type === 'geom' && near(d.a1, 1) && near(d.r, 2) && d.n === 64; }
    },
    {
      // 等差的三個正數當直角三角形的三邊：a_1² + a_2² = a_3²（一定是 3 : 4 : 5）
      id: 'sequences-series-h6', level: 7, hidden: true,
      riddle: { zh: '三個等距的數，圍出一個直角。', en: 'Three evenly spaced numbers enclose a right angle.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'arith' || d.n !== 3 || !(d.a1 > 0) || !(d.d > 0)) return false;
        const a = d.a1, b = d.a1 + d.d, c = d.a1 + 2 * d.d;
        return near(a * a + b * b, c * c, 1e-6);
      }
    },
    {
      // 公差是負的：S_n 在最後一個正項時最大；剛剛多加一項（負的）讓和變小，退回一項就是最大
      id: 'sequences-series-h7', level: 7, hidden: true,
      riddle: { zh: '再往前一步就開始虧本，退一步剛剛好。', en: 'One more step and you start losing; one step back is just right.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'arith') return false;
        const prev = mem.p; mem.p = { a1: d.a1, d: d.d, n: d.n };
        if (!(d.d < 0) || d.n < 3 || !(d.an > 0) || !(d.an + d.d < 0)) return false;
        return prev != null && prev.a1 === d.a1 && prev.d === d.d && prev.n === d.n + 1;
      }
    },
    {
      // 等比級數收斂得慢：第一個讓 S_n 和 S∞ 差不到 1% 的 n，而且 n ≥ 20（例如 r = 0.9 時 n = 44）
      id: 'sequences-series-h8', level: 8, hidden: true,
      riddle: { zh: '離終點只剩百分之一的路，最早在哪一步？要走得夠久才算。', en: 'When is the first step at which only one percent of the way is left? It only counts if the walk is long.' },
      check: function (ev) { const d = ev.data; return ev.type === 'geom' && d.first99 && d.n >= 20; }
    },
    {
      // 公比滿足 r² = r + 1（黃金比 1.618 或 −0.618）：每一項都是前兩項的和，像費氏數列，卻是等比數列
      id: 'sequences-series-h9', level: 9, hidden: true,
      riddle: { zh: '每一項都是前兩項的和，卻又一直乘同一個倍數。', en: 'Each term is the sum of the two before it, and yet it keeps multiplying by the same factor.' },
      check: function (ev) { const d = ev.data; return ev.type === 'geom' && !near(d.a1, 0) && d.n >= 5 && Math.abs(d.r * d.r - d.r - 1) < 0.002; }
    },
    {
      // 下一個三角形平方數：T_49 = 1225 = 35²（再下一個是 T_288，超出範圍）
      id: 'sequences-series-h10', level: 10, hidden: true,
      riddle: { zh: '又是三角形又是正方形的，第二次要等很久。', en: 'Triangle and square at once: the second time is a long wait.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'fig') return false;
        if (d.kind === 'tri') { mem.c = d.n > 20 && isSq(d.count) ? d.count : null; return false; }
        return mem.c != null && d.count === mem.c;
      }
    }
  ]);
})();
