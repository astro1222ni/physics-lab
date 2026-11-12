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
  /** 記住最近 20 次選取的格子（每個任務各自一份），傳回清單，最後一個是這一次 */
  const pushSel = function (mem, d) {
    const list = mem.sels || (mem.sels = []);
    list.push({ n: d.n, p: d.p, k: d.k, prob: d.prob, paths: d.paths });
    if (list.length > 20) list.shift();
    return list;
  };

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
      // 11/13 修 B-M2：p = 0 或 1 時分布退化成一格、常態近似沒有意義（誤差算成 0），要 0 < p < 1 才算
      check: function (ev) { const d = ev.data; return ev.type === 'board' && d.p > 0 && d.p < 1 && d.normErr < 0.0016; }
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
      // 11/13 修 T11：提示要帶出「上百人」的份量（判定 N ≥ 100 不改）
      riddle: { zh: '上百個人各走各的路，腳步加起來，不多不少，正好落在預言的那一點。', en: 'A hundred travellers or more, each on a road of their own: add up all their steps, not one more, not one less, and they land exactly where it was foretold.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'drop' && !d.hidden && d.N >= 100 && d.p > 0 && d.p < 1 && Math.abs(d.mean - d.n * d.p) < 1e-9;
      }
    },
    // ---------- 11/13 補到 10 個隱藏任務（h4–h10；h1–h3 不改） ----------
    {
      // 鏡像對稱：P(X = k | n, p) = P(X = n − k | n, 1 − p)。在至少 8 層、p 偏一邊（|p − 0.5| ≥ 0.25）的釘板選一格（離中間至少 2 格），把 p 換成 1 − p，再選鏡像的那一格
      id: 'galton-board-h4', level: 4, hidden: true,
      riddle: { zh: '把世界左右翻過來，那條路的機會一點也沒變。', en: 'Flip the world from left to right, and that road’s chance does not change at all.' },
      check: function (ev, mem) {
        if (ev.type !== 'select') return false;
        const s = pushSel(mem, ev.data), a = s[s.length - 2], c = s[s.length - 1];
        if (!a || a.n !== c.n || a.n < 8 || !(a.p > 0 && a.p < 1) || Math.abs(a.p - 0.5) < 0.25 - 1e-9 || Math.abs(2 * a.k - a.n) < 4) return false;
        return Math.abs(a.p + c.p - 1) < 1e-9 && c.k === c.n - a.k && a.k !== c.k && Math.abs(a.prob - c.prob) < 1e-12;
      }
    },
    {
      // 期望值 np 都是 3 的四個釘板（例如 4 × 0.75、5 × 0.6、10 × 0.3、12 × 0.25）：中心一樣，變異數 3(1 − p) 不一樣
      id: 'galton-board-h5', level: 5, hidden: true,
      riddle: { zh: '四支隊伍走向同一個中心，有的散得開，有的收得緊。', en: 'Four parties march to the same centre; some spread out wide, some keep close.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'board' || !(d.p > 0 && d.p < 1) || !near(d.mean, 3, 1e-9)) return false;
        mem.ns = mem.ns || {}; mem.ns[d.n] = true;
        return Object.keys(mem.ns).length >= 4;
      }
    },
    {
      // 巴斯卡法則 C(n + 1, k) = C(n, k − 1) + C(n, k)：在至少 6 層的釘板選相鄰兩格（離兩邊都至少 2 格），再到多一層的釘板選它們下方的那一格
      id: 'galton-board-h6', level: 6, hidden: true,
      riddle: { zh: '兩條相鄰的小路，在下一層匯成一條。', en: 'Two neighbouring lanes merge into one on the next row.' },
      check: function (ev, mem) {
        if (ev.type !== 'select') return false;
        const s = pushSel(mem, ev.data), n = s.length;
        if (n < 3) return false;
        const a = s[n - 3], b = s[n - 2], c = s[n - 1], lo = Math.min(a.k, b.k), hi = Math.max(a.k, b.k);
        return a.n === b.n && a.n >= 6 && c.n === a.n + 1 && hi - lo === 1 && lo >= 2 && hi <= a.n - 2 && c.k === hi && c.paths === a.paths + b.paths;
      }
    },
    {
      // 卜瓦松極限：層數多、p 很小時，一次都不往右（第 0 格）的機率 (1 − p)^n ≈ e^(−np)；np 接近 1 時接近 1/e ≈ 0.3679
      id: 'galton-board-h7', level: 7, hidden: true,
      riddle: { zh: '機會很多，每一次都很渺茫；一次也沒碰上的可能，是一個有名常數的倒數。', en: 'Many chances, each one slim; the chance of never once succeeding is the reciprocal of a famous constant.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'select' || d.n < 12) return false;
        const edge = (d.k === 0 && d.p > 0 && d.p <= 0.1 + 1e-9) || (d.k === d.n && d.p < 1 && d.p >= 0.9 - 1e-9);
        return edge && Math.abs(d.prob - 1 / Math.E) < 0.005;
      }
    },
    {
      // 辛馬斯特的 3003：C(14, 6) = C(15, 5) = 3003，路徑數相同、出現在兩個不同層數的釘板（120 = C(10, 3) = C(16, 2) 太小不算）
      id: 'galton-board-h8', level: 8, hidden: true,
      riddle: { zh: '同一個數，在兩座高度不同的山上各被走到一次，而且它比一千還大。', en: 'The same number is reached on two mountains of different heights, and it is greater than a thousand.' },
      check: function (ev, mem) {
        if (ev.type !== 'select') return false;
        const s = pushSel(mem, ev.data), a = s[s.length - 2], c = s[s.length - 1];
        const inner = function (x) { return x.k >= 2 && x.k <= x.n - 2; };
        return !!a && a.n !== c.n && inner(a) && inner(c) && a.paths === c.paths && c.paths >= 1000;
      }
    },
    {
      // 曲棍球棒恆等式：C(r, r) + C(r + 1, r) + … + C(m, r) = C(m + 1, r + 1)。從第 r 層起，每層選第 r 格（或從右邊數），最後在下一層選轉角那一格
      id: 'galton-board-h9', level: 9, hidden: true,
      riddle: { zh: '沿著斜坡一路撿起來，總數就藏在轉角的下一格。', en: 'Pick up everything along the slope; the total hides one step past the bend.' },
      check: function (ev, mem) {
        if (ev.type !== 'select') return false;
        const s = pushSel(mem, ev.data), c = s[s.length - 1];
        function stick(key) {
          const r = key(c) - 1;
          if (r < 1) return false;
          let sum = 0;
          for (let j = 1; j < s.length; j++) {
            const x = s[s.length - 1 - j];
            if (x.n !== c.n - j || key(x) !== r) return false;
            sum += x.paths;
            if (x.n === r) return j >= 3 && sum === c.paths;
          }
          return false;
        }
        return stick(function (x) { return x.k; }) || stick(function (x) { return x.n - x.k; });
      }
    },
    {
      // 巴斯卡三角形的緩坡對角線加起來是費氏數：C(m, 0) + C(m − 1, 1) + C(m − 2, 2) + … = F(m + 1)（m ≥ 6，整條都要選到，順序可以倒過來，也可以從右邊數）
      id: 'galton-board-h10', level: 10, hidden: true,
      riddle: { zh: '在三角形裡走一條緩坡，把路上的數全部加起來，兔子就跑出來了。', en: 'Walk a gentle slope through the triangle and add up every number on the way: out come the rabbits.' },
      check: function (ev, mem) {
        if (ev.type !== 'select') return false;
        const s = pushSel(mem, ev.data), c = s[s.length - 1];
        function diag(m, mirror) {
          const L = Math.floor(m / 2) + 1;
          if (m < 6 || s.length < L) return false;
          const tail = s.slice(s.length - L);
          const want = [];
          for (let i = 0; i < L; i++) want.push({ n: m - i, k: mirror ? m - 2 * i : i });
          const same = function (list) { return list.every(function (w, i) { return tail[i].n === w.n && tail[i].k === w.k; }); };
          return same(want) || same(want.slice().reverse());
        }
        return diag(c.n + c.k, false) || diag(2 * c.n - c.k, true);
      }
    }
  ]);
})();
