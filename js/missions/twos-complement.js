/* missions/twos-complement.js — 負數與二補數的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/twos-complement.js 發出，都在使用者操作之後；挑戰中題目自己設定的值不發出）：
 *   'value'：暫存器 A 的位元圖樣被設定、改變，或換了讀法之後。
 *       { src（'toggle' 點燈、'typeDec'／'typeHex'／'typeBin' 在該欄輸入、'inc' +1、'dec' −1、'not' 取反、'neg' 取負、
 *              'clear' 歸零、'result' 結果放回 A、'rep' 換表示法、'bits' 改位元數）,
 *         n（位元數）, rep（'twos'|'ones'|'sign'|'bias'）, u（位元圖樣，當成無號數）, prev（操作前的圖樣）, prevN（操作前的位元數）,
 *         v（用目前的表示法讀出的值）, pv（操作前的值）, negZero（是不是負零）,
 *         C, V（+1 與 −1 時加法器的旗標，其他操作是 null）, kept（改位元數時值有沒有保留）,
 *         vSrc（目前這個圖樣是哪一種操作做出來的；換表示法、或改位元數而值不變時沿用）, prevSrc（操作前那個圖樣是怎麼做出來的） }
 *   'negate'：按「取負」之後。{ n, rep, u（取負前）, r（取負後）, v, w（取負前後的值）, same（圖樣沒變）, overflow, src（取負前那個圖樣怎麼來的） }
 *   'arith'：按「A + B」或「A − B」之後。
 *       { op（'add'|'sub'）, n, rep, a, b, r（加法器的結果圖樣）, C, V, N, Z,
 *         x, y（A、B 用目前的表示法讀出的值）, truth（正確答案）, fits（正確答案在範圍內）, raw（加法器直接給的答案用目前的表示法讀）, ok（raw = truth）,
 *         aSrc, bSrc（A、B 是怎麼做出來的） }
 *   'extend'：按「延伸」之後。{ n, m, rep, u, v（二補數讀法）, sx, sv（符號延伸的圖樣與值）, zx, zv（補零延伸）, src（A 怎麼來的） }
 *   'quiz'：旗標挑戰答了一題。{ ok, streak（連續答對）, n, op }
 *   'round'：旗標挑戰一回合（10 題）結束。{ correct, total, time（秒）, n }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const P = function (k) { return Math.pow(2, k); };
  // 親手設定的值：點燈或在輸入欄打字（不算 +1、−1、取反、取負一路滑過去剛好經過的值）
  const HAND = { toggle: 1, typeDec: 1, typeHex: 1, typeBin: 1 };
  const byHand = function (s) { return !!HAND[s]; };
  const isVal = function (ev) { return ev.type === 'value'; };
  const isArith = function (ev, op, rep) { return ev.type === 'arith' && (!op || ev.data.op === op) && (!rep || ev.data.rep === rep); };

  LabMission.register('twos-complement', [
    {
      id: 'twos-complement-1', level: 1,
      title: { zh: '負一長什麼樣子', en: 'What −1 looks like' },
      desc: { zh: '在「二補數」讓暫存器 A 等於 −1，看看每一盞燈。', en: 'In “Two’s complement”, make register A equal −1 and look at every lamp.' },
      check: function (ev) { return isVal(ev) && ev.data.rep === 'twos' && ev.data.v === -1; }
    },
    {
      id: 'twos-complement-2', level: 2,
      title: { zh: '兩個零', en: 'Two zeros' },
      desc: { zh: '切到「原碼」或「一補數」，做出負零（−0）。', en: 'Switch to “Sign–magnitude” or “Ones’ complement” and make a negative zero (−0).' },
      check: function (ev) { return isVal(ev) && (ev.data.rep === 'sign' || ev.data.rep === 'ones') && ev.data.negZero; }
    },
    {
      id: 'twos-complement-3', level: 3,
      title: { zh: '取反再加一', en: 'Invert, then add one' },
      desc: { zh: '在「二補數」把 A 設成 5，按「取負」，看它先取反、再加一，變成 −5。', en: 'In “Two’s complement”, set A to 5 and press “Negate”: watch it invert every bit, then add one, and become −5.' },
      check: function (ev) { const d = ev.data; return ev.type === 'negate' && d.rep === 'twos' && d.v === 5 && d.w === -5; }
    },
    {
      id: 'twos-complement-4', level: 3,
      title: { zh: '進位不等於溢位', en: 'A carry is not an overflow' },
      desc: { zh: '在「二補數」按「A + B」，讓 C = 1 而 V = 0：最高位送出了進位，答案卻完全正確。', en: 'In “Two’s complement”, press “A + B” so that C = 1 but V = 0: a carry leaves the top bit, yet the answer is perfectly right.' },
      check: function (ev) { const d = ev.data; return isArith(ev, 'add', 'twos') && d.C === 1 && d.V === 0; }
    },
    {
      id: 'twos-complement-5', level: 4,
      title: { zh: '沒有進位的溢位', en: 'Overflow without a carry' },
      desc: { zh: '在「二補數」按「A + B」，讓 V = 1 而 C = 0：兩個正數加出了負數。', en: 'In “Two’s complement”, press “A + B” so that V = 1 but C = 0: two positive numbers add up to a negative one.' },
      check: function (ev) { const d = ev.data; return isArith(ev, 'add', 'twos') && d.V === 1 && d.C === 0; }
    },
    {
      id: 'twos-complement-6', level: 4,
      title: { zh: '原碼的加法器失靈了', en: 'Sign–magnitude breaks the adder' },
      desc: { zh: '切到「原碼」，按「A + B」算一題答案在範圍內的加法，讓加法器直接給的答案是錯的。', en: 'Switch to “Sign–magnitude” and press “A + B” on a sum whose answer is in range, so that the adder’s direct answer is wrong.' },
      check: function (ev) { const d = ev.data; return isArith(ev, 'add', 'sign') && d.fits && !d.ok; }
    },
    {
      id: 'twos-complement-7', level: 5,
      title: { zh: '符號延伸', en: 'Sign extension' },
      desc: { zh: '在「二補數」、8 位元時，把一個負數按「延伸」放大成 16 位元，值保持不變。', en: 'In “Two’s complement” with 8 bits, press “Extend” to widen a negative number to 16 bits without changing its value.' },
      check: function (ev) { const d = ev.data; return ev.type === 'extend' && d.rep === 'twos' && d.n === 8 && d.m === 16 && d.v < 0 && d.sv === d.v; }
    },
    {
      id: 'twos-complement-8', level: 5,
      title: { zh: '借位', en: 'A borrow' },
      desc: { zh: '在「二補數」、A 和 B 都不是 0 時按「A − B」，讓 C = 0（當成無號數時要借位），而 V = 0（有號的答案仍然正確）。', en: 'In “Two’s complement”, with neither A nor B equal to 0, press “A − B” so that C = 0 (a borrow, reading them as unsigned numbers) while V = 0 (the signed answer is still right).' },
      check: function (ev) { const d = ev.data; return isArith(ev, 'sub', 'twos') && d.a !== 0 && d.b !== 0 && d.C === 0 && d.V === 0; }
    },
    {
      id: 'twos-complement-9', level: 6,
      title: { zh: '兩盞旗標一起亮', en: 'Both flags at once' },
      desc: { zh: '在「二補數」按「A + B」，讓 C 和 V 同時是 1。', en: 'In “Two’s complement”, press “A + B” so that C and V are both 1.' },
      check: function (ev) { const d = ev.data; return isArith(ev, 'add', 'twos') && d.C === 1 && d.V === 1; }
    },
    {
      id: 'twos-complement-10', level: 7,
      title: { zh: '取負還是自己', en: 'Its own negative' },
      desc: { zh: '在「二補數」找一個不是 0 的數，按「取負」之後還是它自己。', en: 'In “Two’s complement”, find a number other than 0 that is still itself after you press “Negate”.' },
      check: function (ev) { const d = ev.data; return ev.type === 'negate' && d.rep === 'twos' && d.same && d.u !== 0; }
    },
    {
      id: 'twos-complement-11', level: 7,
      title: { zh: '連對五題', en: 'Five in a row' },
      desc: { zh: '按「開始挑戰」，連續 5 題都正確預測 C 和 V。', en: 'Press “Start the challenge” and predict both C and V correctly in 5 questions in a row.' },
      check: function (ev) { return ev.type === 'quiz' && ev.data.ok && ev.data.streak >= 5; }
    },
    {
      id: 'twos-complement-12', level: 9,
      title: { zh: '旗標高手', en: 'Flag master' },
      desc: { zh: '在至少 8 個位元時按「開始挑戰」，一回合 10 題全對，而且總共不超過 120 秒。', en: 'With at least 8 bits, press “Start the challenge” and get all 10 questions of the round right within 120 seconds in total.' },
      check: function (ev) { const d = ev.data; return ev.type === 'round' && d.correct === 10 && d.total === 10 && d.time <= 120 && d.n >= 8; }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'twos-complement-h1', level: 3, hidden: true,
      riddle: { zh: '一個不算大的正數，被硬塞進一個位元組，出來的時候已經變成負的。', en: 'A fairly small positive number was squeezed into a single byte — and came out negative.' },
      check: function (ev) {
        const d = ev.data;
        return isVal(ev) && d.src === 'bits' && d.rep === 'twos' && d.n === 8 && d.prevN > 8 && d.pv >= 128 && d.pv <= 255 && d.v < 0 && byHand(d.prevSrc);
      }
    },
    {
      id: 'twos-complement-h2', level: 4, hidden: true,
      riddle: { zh: '同一個數換上兩套衣服，只差在頭上那頂帽子：一套讓大小可以直接比，一套讓加法不必分正負。', en: 'The same number in two outfits that differ only in the hat: one outfit lets you compare sizes directly, the other lets you add without caring about signs.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isVal(ev) || d.src !== 'typeDec' || d.v === 0 || (d.rep !== 'bias' && d.rep !== 'twos')) return false;
        mem.s = mem.s || {};
        const k = d.n + '|' + d.v;
        mem.s[k] = mem.s[k] || {};
        mem.s[k][d.rep] = true;
        return !!(mem.s[k].bias && mem.s[k].twos);
      }
    },
    {
      id: 'twos-complement-h3', level: 5, hidden: true,
      riddle: { zh: '在有兩個零的國度裡，你和你的相反數握手言和，留下來的卻是比較陰沉的那一個零。', en: 'In the land with two zeros, you make peace with your opposite — and what remains is the gloomier of the two zeros.' },
      check: function (ev) {
        const d = ev.data, m = P(d.n);
        // A、B 都要親手設定；±1 太容易碰巧遇到（−1 按兩次就是 1 的取反），要 |A| ≥ 2
        return isArith(ev, 'add', 'ones') && d.n >= 8 && byHand(d.aSrc) && byHand(d.bSrc) && Math.abs(d.x) >= 2 && d.b === m - 1 - d.a && d.r === m - 1;
      }
    },
    {
      id: 'twos-complement-h4', level: 5, hidden: true,
      riddle: { zh: '兩道最深的海溝疊在一起，竟然浮出了海面。', en: 'Two of the deepest trenches, stacked together, rise all the way to sea level.' },
      check: function (ev) { const d = ev.data, h = P(d.n - 1); return isArith(ev, 'add', 'twos') && d.a === h && d.b === h; }
    },
    {
      id: 'twos-complement-h5', level: 6, hidden: true,
      riddle: { zh: '繞著地球跑的鐘只有十根手指；數到盡頭的下一週，它以為世界回到了第一天。', en: 'The clocks circling the Earth count weeks on just ten fingers; one week after running out, they believe the world is back at day one.' },
      check: function (ev) { const d = ev.data; return isVal(ev) && d.src === 'inc' && d.n === 10 && d.prev === 1023 && d.u === 0 && byHand(d.prevSrc); }
    },
    {
      id: 'twos-complement-h6', level: 7, hidden: true,
      riddle: { zh: '一個再普通不過的字母，被撐成一個整數那麼寬，竟被誤認成故事的結局。', en: 'A perfectly ordinary letter, stretched to the width of an integer, was mistaken for the end of the story.' },
      check: function (ev) { const d = ev.data; return ev.type === 'extend' && d.n === 8 && d.m === 32 && d.u === 255 && d.sv === -1 && byHand(d.src); }
    },
    {
      id: 'twos-complement-h7', level: 7, hidden: true,
      riddle: { zh: '兩種寫負數的方法吵個不停；在所有的負數裡，它們只同意一個。', en: 'Two ways of writing negative numbers never stop arguing; among all the negatives, they agree on exactly one.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isVal(ev) || d.n < 8 || (d.rep !== 'sign' && d.rep !== 'twos') || d.u !== 3 * P(d.n - 2) || !byHand(d.vSrc)) return false;
        mem.s = mem.s || {};
        mem.s[d.n] = mem.s[d.n] || {};
        mem.s[d.n][d.rep] = true;
        return !!(mem.s[d.n].sign && mem.s[d.n].twos);
      }
    },
    {
      id: 'twos-complement-h8', level: 8, hidden: true,
      riddle: { zh: '網路上每一個封包的表頭都要做一種加法：從最高處溢出去的那一點，得從最低處撿回來。親手把它做完。', en: 'Every packet on the Internet carries a sum in its header: whatever spills over the top must be picked up again at the bottom. Finish one by hand.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type === 'arith') {
          // 一補數的加法、最高位送出進位、正確答案在範圍內，但加法器直接給的答案少了 1（還沒做迴繞進位）
          mem.p = (d.rep === 'ones' && d.op === 'add' && d.C === 1 && d.fits && !d.ok) ? { n: d.n, r: d.r, truth: d.truth } : null;
          mem.stage = mem.p ? 1 : 0;
          return false;
        }
        if (!isVal(ev) || !mem.p) return false;
        if (mem.stage === 1 && d.src === 'result' && d.u === mem.p.r && d.n === mem.p.n && d.rep === 'ones') { mem.stage = 2; return false; }
        if (mem.stage === 2 && d.src === 'inc' && d.prev === mem.p.r && d.n === mem.p.n && d.rep === 'ones' && d.v === mem.p.truth) return true;
        if (d.src !== 'rep' || d.rep !== 'ones') { mem.p = null; mem.stage = 0; }
        return false;
      }
    },
    {
      id: 'twos-complement-h9', level: 8, hidden: true,
      riddle: { zh: '2014 年底，一段騎馬舞讓一個計數器數到了盡頭。在同樣寬的格子裡，替它再數下一下。', en: 'At the end of 2014 a horse-riding dance pushed a counter to the very end. In boxes just as wide, count one more for it.' },
      check: function (ev) { const d = ev.data; return isVal(ev) && d.src === 'inc' && d.n === 32 && d.rep === 'twos' && d.prev === P(31) - 1 && byHand(d.prevSrc); }
    },
    {
      id: 'twos-complement-h10', level: 10, hidden: true,
      riddle: { zh: '加上它、減去它，帳本上的數字一模一樣，連進位也一樣；警報卻只為其中一次響起。而它不是零。', en: 'Add it or subtract it: every figure in the ledger is the same, carries included — yet the alarm rings for only one of the two. And it is not zero.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isArith(ev, null, 'twos') || d.n < 8 || d.b === 0 || d.a === d.b) return false;
        mem.r = mem.r || {};
        const k = d.n + '|' + d.a + '|' + d.b;
        mem.r[k] = mem.r[k] || {};
        mem.r[k][d.op] = { r: d.r, C: d.C, V: d.V };
        const s = mem.r[k].add, t = mem.r[k].sub;
        return !!(s && t && s.r === t.r && s.C === t.C && s.V !== t.V);
      }
    }
  ]);
})();
