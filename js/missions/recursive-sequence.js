/* missions/recursive-sequence.js — 遞迴數列與蛛網圖的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/recursive-sequence.js 發出，都在使用者操作之後）：
 *   'iter'：蛛網圖模式的設定改變。{ fn（'lin' | 'sqrt' | 'cf' | 'cos' | 'bab' | 'logi'）, p, q, c, k, b, r（各種遞迴的參數）, a1, n,
 *           ts（前 n 項；某一項沒有定義就停在前一項）, an（第 n 項，沒有定義是 NaN）, fixed（[{ x, stable }]）, period（邏輯斯諦的長期週期，0 = 混沌；其他遞迴是 null） }
 *   'fib'：費氏型模式的設定改變。{ a1, a2, n, ts, an, ratio（a_n / a_(n−1)） }
 *   'challenge'：挑戰答對一題。{ time（秒）, streak（連續答對幾題）, last3（最近三題總秒數，不到三題為 null） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const near = function (v, w, tol) { return Math.abs(v - w) <= (tol == null ? 1e-9 : tol); };
  const PHI = (1 + Math.sqrt(5)) / 2;
  const DOTTIE = 0.7390851332151607;
  const linL = function (d) { return d.q / (1 - d.p); };
  /** 邏輯斯諦 r = 4 從 x 出發的第 n 項（任務自己重算另一個起點用） */
  const logi4 = function (x, n) { for (let k = 1; k < n; k++) x = 4 * x * (1 - x); return x; };

  LabMission.register('recursive-sequence', [
    {
      id: 'recursive-sequence-1', level: 2,
      title: { zh: '走樓梯', en: 'Climbing the stairs' },
      desc: { zh: '用一次式（下一項 = p × 這一項 + q）、0 < p < 1，讓交點 L 剛好是 5；從離 L 至少 2 的地方出發，畫到最後一項和 L 差不到 0.01。', en: 'With the linear rule (next = p × this + q) and 0 < p < 1, make the crossing L exactly 5; start at least 2 away from L and draw until the last term is within 0.01 of L.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'iter' || d.fn !== 'lin' || !(d.p > 0 && d.p < 1) || d.n < 8) return false;
        const L = linL(d);
        return near(L, 5, 1e-9) && Math.abs(d.a1 - L) >= 2 && Math.abs(d.an - L) < 0.01;
      }
    },
    {
      id: 'recursive-sequence-2', level: 3,
      title: { zh: '繞螺旋', en: 'Spiralling in' },
      desc: { zh: '同樣用一次式，這次 −1 < p < 0，讓交點 L 剛好是 −2；從離 L 至少 2 的地方出發，畫到最後一項和 L 差不到 0.01。', en: 'Again with the linear rule, this time −1 < p < 0 and the crossing L exactly −2; start at least 2 away from L and draw until the last term is within 0.01 of L.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'iter' || d.fn !== 'lin' || !(d.p > -1 && d.p < 0) || d.n < 8) return false;
        const L = linL(d);
        return near(L, -2, 1e-9) && Math.abs(d.a1 - L) >= 2 && Math.abs(d.an - L) < 0.01;
      }
    },
    {
      id: 'recursive-sequence-3', level: 3,
      title: { zh: '越走越遠', en: 'Running away' },
      desc: { zh: '用 p > 1 的一次式，從離 L 不到 0.1 的地方出發，讓最後一項離 L 至少 50。', en: 'With the linear rule and p > 1, start less than 0.1 away from L and let the last term end up at least 50 away from L.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'iter' || d.fn !== 'lin' || !(d.p > 1)) return false;
        const L = linL(d), s = Math.abs(d.a1 - L);
        return s > 1e-9 && s <= 0.1 + 1e-9 && Math.abs(d.an - L) >= 50;
      }
    },
    {
      id: 'recursive-sequence-4', level: 4,
      title: { zh: '螺旋的正中心', en: 'The eye of the spiral' },
      desc: { zh: '用一次式、p 是負的（q 不是 0），選一個首項，讓至少 3 項全都一樣。', en: 'With the linear rule, a negative p and q not 0, pick a first term so that at least 3 terms are all the same.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'iter' || d.fn !== 'lin' || !(d.p < 0) || near(d.q, 0) || d.n < 3) return false;
        return near(d.a1, linL(d), 1e-9);
      }
    },
    {
      id: 'recursive-sequence-5', level: 4,
      title: { zh: '根號裡的 6', en: 'Six under the root' },
      desc: { zh: '用「下一項 = √(這一項 + 6)」，畫至少 10 項，讓最後一項和 3 差不到 0.001。', en: 'With next = √(this + 6), draw at least 10 terms and get the last one within 0.001 of 3.' },
      check: function (ev) { const d = ev.data; return ev.type === 'iter' && d.fn === 'sqrt' && near(d.c, 6) && d.n >= 10 && Math.abs(d.an - 3) < 0.001; }
    },
    {
      id: 'recursive-sequence-6', level: 4,
      title: { zh: '一直按 cos 鍵', en: 'Pressing cos again and again' },
      desc: { zh: '用「下一項 = cos(這一項)」（弧度）一直按下去：最少要畫到第幾項，才和 cos x = x 的解差不到 0.001？把 n 停在剛好那一項（至少第 5 項）。', en: 'Keep applying next = cos(this) (radians): which is the first term within 0.001 of the solution of cos x = x? Stop n exactly there (term 5 or later).' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'iter' || d.fn !== 'cos' || d.n < 5 || d.ts.length !== d.n) return false;
        return Math.abs(d.ts[d.n - 1] - DOTTIE) < 0.001 && !(Math.abs(d.ts[d.n - 2] - DOTTIE) < 0.001);
      }
    },
    {
      id: 'recursive-sequence-7', level: 5,
      title: { zh: '兩點循環', en: 'A two-cycle' },
      desc: { zh: '用邏輯斯諦（下一項 = r × 這一項 × (1 − 這一項)），調 r 讓數列最後在兩個值之間輪流跳；再把首項設成其中一個值，讓數列從第一項就兩點來回（第 3 項和第 1 項差不到 0.0001）。', en: 'With the logistic rule (next = r × this × (1 − this)), adjust r so the terms end up taking turns between two values; then set the first term to one of them so the sequence alternates from the very start (term 3 within 0.0001 of term 1).' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'iter' || d.fn !== 'logi' || d.period !== 2 || d.n < 3 || d.ts.length < 3) return false;
        return Math.abs(d.ts[2] - d.ts[0]) < 1e-4 && Math.abs(d.ts[1] - d.ts[0]) > 0.1;
      }
    },
    {
      id: 'recursive-sequence-8', level: 6,
      title: { zh: '四點循環', en: 'A four-cycle' },
      desc: { zh: '再把 r 調大一點，讓數列最後在四個值之間輪流跳（畫至少 30 項）。', en: 'Raise r a little more so that in the long run the terms cycle through four values (draw at least 30 terms).' },
      check: function (ev) { const d = ev.data; return ev.type === 'iter' && d.fn === 'logi' && d.period === 4 && d.n >= 30; }
    },
    {
      id: 'recursive-sequence-9', level: 3,
      title: { zh: '湊出一百', en: 'Make a hundred' },
      desc: { zh: '在費氏型模式，調兩個起始項和項數，讓最後一項剛好是 100（至少 6 項）。', en: 'In Fibonacci mode, choose the two starting terms and the number of terms so that the last term is exactly 100 (at least 6 terms).' },
      check: function (ev) { const d = ev.data; return ev.type === 'fib' && d.n >= 6 && near(d.an, 100, 1e-6); }
    },
    {
      id: 'recursive-sequence-10', level: 4,
      title: { zh: '不管怎麼開始', en: 'However it starts' },
      desc: { zh: '用兩個不一樣的正數當起始項：相鄰兩項的比最早在第幾項和 φ 差不到 0.0001？把 n 停在剛好那一項。', en: 'Start with two different positive numbers: at which term does the ratio of neighbours first get within 0.0001 of φ? Stop n exactly there.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'fib' || !(d.a1 > 0 && d.a2 > 0) || near(d.a1, d.a2) || d.n < 3) return false;
        const t = d.ts, n = d.n, prev = t[n - 2] / t[n - 3];
        return Math.abs(d.ratio - PHI) < 1e-4 && !(Math.abs(prev - PHI) < 1e-4);
      }
    },
    {
      id: 'recursive-sequence-11', level: 4,
      title: { zh: '猜遞迴', en: 'Guess the rule' },
      desc: { zh: '按「出一題」，從前五項看出 p、q 和首項，調出同一個數列並送出。', en: 'Press “New challenge”, work out p, q and the first term from the first five terms, build the same sequence and submit.' },
      check: function (ev) { return ev.type === 'challenge'; }
    },
    {
      id: 'recursive-sequence-12', level: 7,
      title: { zh: '三連發', en: 'Three in a row' },
      desc: { zh: '連續答對三題挑戰，三題合計 90 秒以內。', en: 'Answer three challenges in a row correctly, in 90 seconds or less in total.' },
      check: function (ev) { return ev.type === 'challenge' && ev.data.last3 != null && ev.data.last3 <= 90; }
    },
    // ---------- 隱藏任務 ----------
    {
      // p = 1 是等差數列：y = x + q 和 y = x 平行；讓某一項剛好走回 0
      id: 'recursive-sequence-h1', level: 3, hidden: true,
      riddle: { zh: '與鏡子平行地走，一格一格，剛好走回原點。', en: 'Walking parallel to the mirror, step by step, until it lands back on zero.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'iter' && d.fn === 'lin' && near(d.p, 1) && !near(d.q, 0) && !near(d.a1, 0) && d.n >= 5 && near(d.an, 0, 1e-9);
      }
    },
    {
      // 邏輯斯諦 r = 4 是完全混沌，但不動點 3/4 一直都在：4 × 0.75 × 0.25 = 0.75
      id: 'recursive-sequence-h2', level: 4, hidden: true,
      riddle: { zh: '最亂的地方，也有一個站著不動的人。', en: 'Even in the wildest place, someone stands perfectly still.' },
      check: function (ev) { const d = ev.data; return ev.type === 'iter' && d.fn === 'logi' && near(d.r, 4) && near(d.a1, 0.75) && d.n >= 20; }
    },
    {
      // √(2 + √(2 + √(2 + …))) = 2：從 0 開始，第 n 項和 2 差不到 0.0001
      id: 'recursive-sequence-h3', level: 4, hidden: true,
      riddle: { zh: '一層包一層，剝到最裡面是空的，整顆卻剛好是二。', en: 'Layer inside layer, empty at the very core, and the whole thing is exactly two.' },
      check: function (ev) { const d = ev.data; return ev.type === 'iter' && d.fn === 'sqrt' && near(d.c, 2) && near(d.a1, 0) && d.n >= 8 && Math.abs(d.an - 2) < 1e-4; }
    },
    {
      // 1 + 1/(1 + 1/(1 + …)) 是黃金比：連分數 a_(n+1) = 1 + 1/a_n
      id: 'recursive-sequence-h4', level: 5, hidden: true,
      riddle: { zh: '永遠把自己翻過來再加一，最後停在最美的比例。', en: 'Forever turning itself upside down and adding one, it comes to rest at the fairest proportion.' },
      check: function (ev) { const d = ev.data; return ev.type === 'iter' && d.fn === 'cf' && near(d.k, 1) && d.n >= 15 && Math.abs(d.an - PHI) < 1e-4; }
    },
    {
      // 「週期三意味著混沌」：r 約 3.83 到 3.856 的窗口裡出現三點循環
      id: 'recursive-sequence-h5', level: 6, hidden: true,
      riddle: { zh: '出現了三，就什麼都可能出現。', en: 'Once three appears, anything can appear.' },
      check: function (ev) { const d = ev.data; return ev.type === 'iter' && d.fn === 'logi' && d.period === 3 && d.n >= 30; }
    },
    {
      // 倍週期分岔再多一次：八點循環（r 約 3.544 到 3.564）
      id: 'recursive-sequence-h6', level: 7, hidden: true,
      riddle: { zh: '一分為二，二分為四，再分一次。', en: 'One splits into two, two into four, and once more.' },
      check: function (ev) { const d = ev.data; return ev.type === 'iter' && d.fn === 'logi' && d.period === 8 && d.n >= 30; }
    },
    {
      // 費氏型的起始比剛好是 −1/φ：數列變成公比 −0.618 的等比數列，越來越小（其他起點都會長大）
      id: 'recursive-sequence-h7', level: 7, hidden: true,
      riddle: { zh: '每一項都是前兩項的和，卻越加越小。', en: 'Every term is the sum of the two before it, and yet it keeps shrinking.' },
      check: function (ev) { const d = ev.data; return ev.type === 'fib' && !near(d.a1, 0) && d.n >= 10 && Math.abs(d.a2 / d.a1 + 1 / PHI) < 0.001; }
    },
    {
      // 蝴蝶效應：r = 4 時，兩個起點只差不到 0.001（兩次設定），第 n 項卻差 0.5 以上（任務自己重算上一個起點）
      id: 'recursive-sequence-h8', level: 8, hidden: true,
      riddle: { zh: '起點只差一根頭髮，終點卻天差地遠。', en: 'The starts differ by a hair; the ends are worlds apart.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'iter') return false;
        const prev = mem.a; mem.a = null;
        if (d.fn !== 'logi' || !near(d.r, 4)) return false;
        mem.a = d.a1;
        if (prev == null || d.n < 15 || near(d.a1, 0) || near(d.a1, 0.75) || near(d.a1, 1)) return false;
        const gap = Math.abs(d.a1 - prev);
        return gap > 1e-12 && gap <= 0.001 + 1e-9 && Math.abs(d.an - logi4(prev, d.n)) >= 0.5;
      }
    },
    {
      // 巴比倫開方法算 √2：把項數停在「第一個」和 √2 差不到 10^(−6) 的項（從 1 開始是第 5 項）
      id: 'recursive-sequence-h9', level: 9, hidden: true,
      riddle: { zh: '泥板上的老方法，算到小數第六位就該停手，一步也不多。', en: 'The old method from the clay tablet: stop as soon as the sixth decimal is right, not one step later.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'iter' || d.fn !== 'bab' || !near(d.b, 2) || !(d.a1 > 0) || d.ts.length !== d.n) return false;
        const s = Math.SQRT2, n = d.n;
        return Math.abs(d.ts[n - 1] - s) < 1e-6 && (n === 1 || !(Math.abs(d.ts[n - 2] - s) < 1e-6));
      }
    },
    {
      // r = 4 的三點循環（例如 0.1883 → 0.6113 → 0.9505 → 0.1883）：不穩定，要打字打到第四位才找得到
      id: 'recursive-sequence-h10', level: 10, hidden: true,
      riddle: { zh: '最狂亂的地方，也有人在原地跳著三步舞。', en: 'Even in the wildest place, someone dances a three-step on the spot.' },
      check: function (ev) {
        const d = ev.data;
        if (ev.type !== 'iter' || d.fn !== 'logi' || !near(d.r, 4) || d.n < 4 || d.ts.length < 4) return false;
        const t = d.ts;
        return Math.abs(t[3] - t[0]) < 0.001 && Math.abs(t[1] - t[0]) > 0.1 && Math.abs(t[2] - t[0]) > 0.1;
      }
    }
  ]);
})();
