/* missions/galton-board.js — 高爾頓板與二項分布的任務（星星數 = 等級 1–10）
 * 事件（js/galton-board.js 發出，都在使用者操作之後）：
 *   'drop'：球落進格子之後（動畫時每一顆、「瞬間 1000 顆」時一次）。
 *           { src（'ball' | 'batch'）, n, p（滑桿上的 p）, hidden（挑戰神祕的 p 中）, N, mean, variance（除以 N）, tv（½Σ|f − P|）, counts }
 *   'board'：改完層數 n 或機率 p 之後（挑戰中不發出）。{ n, p, mean, variance, normErr（常態近似每一格的最大誤差）, modes（機率最大的格子） }
 *   'select'：選取一個格子之後（挑戰中不發出）。{ n, p, k, prob, paths（C(n, k)）, isTop（是不是機率最大的格子） }
 *   'guess'：挑戰時猜了神祕的 p。{ n, p（真正的 p）, guess, N（當時的球數）, err }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const near = function (v, want, tol) { return isFinite(v) && Math.abs(v - want) <= tol; };

  LabMission.register('galton-board', [
    {
      id: 'galton-board-1', level: 1,
      title: { zh: '第一顆球', en: 'The first ball' },
      desc: { zh: '放一顆球下去，看它一路碰釘子、掉進哪一格。', en: 'Drop one ball and watch it bounce off the pegs into a bin.' },
      check: function (ev) { return ev.type === 'drop' && ev.data.N >= 1; }
    },
    {
      id: 'galton-board-2', level: 2,
      title: { zh: '機會最大的一格', en: 'The likeliest bin' },
      desc: { zh: '在至少 4 層的釘板上，點選機率最大的那一格。', en: 'On a board with at least 4 rows, select the bin with the highest probability.' },
      check: function (ev) { return ev.type === 'select' && ev.data.n >= 4 && ev.data.isTop; }
    },
    {
      id: 'galton-board-3', level: 3,
      title: { zh: '一層的板子', en: 'A one-row board' },
      desc: { zh: '只留 1 層釘子、p = 0.3，放至少 100 顆球，讓掉到右邊的比例和 0.3 相差不超過 0.02。', en: 'With 1 row of pegs and p = 0.3, drop at least 100 balls so that the share landing on the right is within 0.02 of 0.3.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'drop' && !d.hidden && d.n === 1 && near(d.p, 0.3, 1e-9) && d.N >= 100 && near(d.counts[1] / d.N, 0.3, 0.02);
      }
    },
    {
      id: 'galton-board-4', level: 3,
      title: { zh: '千分之一的機會', en: 'One in a thousand' },
      desc: { zh: '找一個釘板和一個格子，讓那一格的機率恰好是 1/1024，然後點選它。', en: 'Find a board and a bin whose probability is exactly 1/1024, and select that bin.' },
      check: function (ev) { return ev.type === 'select' && near(ev.data.prob * 1024, 1, 1e-6); }
    },
    {
      id: 'galton-board-5', level: 4,
      title: { zh: '120 條路', en: '120 paths' },
      desc: { zh: '找一個恰好有 120 條不同路徑可以到達的格子，點選它。', en: 'Select a bin that exactly 120 different paths lead to.' },
      check: function (ev) { return ev.type === 'select' && ev.data.paths === 120; }
    },
    {
      id: 'galton-board-6', level: 4,
      title: { zh: '平均 6、變異數 2.4', en: 'Mean 6, variance 2.4' },
      desc: { zh: '調出期望值 6、變異數 2.4 的二項分布。', en: 'Set up a binomial distribution with expected value 6 and variance 2.4.' },
      check: function (ev) { return ev.type === 'board' && near(ev.data.mean, 6, 1e-9) && near(ev.data.variance, 2.4, 1e-9); }
    },
    {
      id: 'galton-board-7', level: 5,
      title: { zh: '鐘形的影子', en: 'In the shadow of the bell' },
      desc: { zh: '調出一個釘板，讓常態近似（含連續性修正）每一格的誤差都小於 0.0016。', en: 'Set up a board on which the normal approximation (with continuity correction) is off by less than 0.0016 in every bin.' },
      check: function (ev) { return ev.type === 'board' && ev.data.normErr < 0.0016; }
    },
    {
      id: 'galton-board-8', level: 6,
      title: { zh: '兩格一樣高', en: 'A tie at the top' },
      desc: { zh: '在兩個層數不同的釘板上（p 都不是 0.5），各找到一次：機率最大的格子有兩格，而且兩格的機率完全相同。', en: 'On two boards with different numbers of rows (p ≠ 0.5 on both), find a case where two bins tie exactly for the highest probability.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'board' || d.modes.length !== 2 || Math.abs(d.p - 0.5) < 1e-9) return false;
        mem.ns = mem.ns || {}; mem.ns[d.n] = true;
        return Object.keys(mem.ns).length >= 2;
      }
    },
    {
      id: 'galton-board-9', level: 6,
      title: { zh: '猜中神祕的 p', en: 'The mystery p' },
      desc: { zh: '按「換一個神祕的 p」，放球觀察，猜出 p（誤差 ±0.02）。', en: 'Press “New mystery p”, drop balls and guess p to within ±0.02.' },
      check: function (ev) { return ev.type === 'guess' && ev.data.err <= 0.02 + 1e-9; }
    },
    {
      id: 'galton-board-10', level: 7,
      title: { zh: '大數法則', en: 'The law of large numbers' },
      desc: { zh: '在至少 8 層、p 在 0.25 到 0.75 之間的釘板上一直放球，直到實驗和理論的總差距 ½ Σ |f − P| 不超過 0.01。', en: 'On a board with at least 8 rows and p between 0.25 and 0.75, keep dropping balls until the total gap ½ Σ |f − P| between experiment and theory is at most 0.01.' },
      check: function (ev) { const d = ev.data; return ev.type === 'drop' && !d.hidden && d.n >= 8 && d.p >= 0.25 - 1e-9 && d.p <= 0.75 + 1e-9 && d.tv <= 0.01; }
    },
    {
      id: 'galton-board-11', level: 8,
      title: { zh: '變異數的實驗值', en: 'Measuring the variance' },
      desc: { zh: '在至少 4 層、0 < p < 1 的釘板上放至少 1000 顆球，讓實驗的變異數和 np(1 − p) 相差不到 1%。', en: 'On a board with at least 4 rows and 0 < p < 1, drop at least 1000 balls so that the measured variance is within 1% of np(1 − p).' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'drop' || d.hidden || d.n < 4 || d.N < 1000 || !(d.p > 0 && d.p < 1)) return false;
        const v = d.n * d.p * (1 - d.p);
        return Math.abs(d.variance / v - 1) <= 0.01;
      }
    },
    {
      id: 'galton-board-12', level: 10,
      title: { zh: '五十顆球的推理', en: 'Fifty balls of evidence' },
      desc: { zh: '挑戰神祕的 p 時，最多只用 50 顆球，就把 p 猜到誤差 ±0.01 以內。', en: 'In the mystery-p challenge, use at most 50 balls and still guess p to within ±0.01.' },
      check: function (ev) { const d = ev.data; return ev.type === 'guess' && d.N >= 1 && d.N <= 50 && d.err <= 0.01 + 1e-9; }
    },
    {
      id: 'galton-board-h1', level: 3, hidden: true,
      riddle: { zh: '一千條路，只有一條有人走。', en: 'A thousand roads, and only one of them is ever walked.' },
      check: function (ev) { const d = ev.data; return ev.type === 'drop' && !d.hidden && d.n >= 10 && (d.p === 0 || d.p === 1) && d.N >= 10; }
    },
    {
      id: 'galton-board-h2', level: 6, hidden: true,
      riddle: { zh: '八個旅人走進三層的林子，出來時排成了老祖宗畫過的那一行。', en: 'Eight travellers enter a wood three rows deep, and come out lined up like a row the ancients once drew.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'drop' && !d.hidden && d.n === 3 && d.N === 8 && d.counts[0] === 1 && d.counts[1] === 3 && d.counts[2] === 3 && d.counts[3] === 1;
      }
    },
    {
      id: 'galton-board-h3', level: 5, hidden: true,
      riddle: { zh: '眾人的腳步加起來，不多不少，正好落在預言的那一點。', en: 'Add up everyone’s steps: not one more, not one less, they land exactly where it was foretold.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'drop' && !d.hidden && d.N >= 100 && d.p > 0 && d.p < 1 && Math.abs(d.mean - d.n * d.p) < 1e-9;
      }
    }
  ]);
})();
