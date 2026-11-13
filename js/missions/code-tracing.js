/* missions/code-tracing.js — 程式追蹤的任務（一般任務星星數 = 等級；隱藏任務 = 等級 × 2）
 * 不依賴核心（排行榜頁只載入任務檔也能跑）。事件由 js/code-tracing.js 在使用者按「單步」「播放」或「直接跑完」、
 * 把程式跑到最後一步（或停在出錯的那一步）時送出，資料由核心的 finishEvent、guessEvent 產生（任務證明用的是同一套）：
 *   'finish'：{ prog（程式代號）, params（可以改的數字）, ok, error（null | 'overflow' | 'steps' | 'div0' | 'index' …）, output, steps（步數）,
 *              loops: [{ line, acts（進入幾次）, iters（本體共執行幾次）, zero（幾次一圈也沒跑）, maxIter }], zeroLoop, pyDiffs（C 與 Python 不同的除法次數）,
 *              sc（短路次數）, maxDepth, calls, condT, condF, peaks（每個變數出現過的最大值）, vars（主程式最後的變數值） }
 *   'guess'：先在「先猜再看」送出猜測、再把程式跑完時送出：{ prog, params, q, guess, correct, fresh（這組數字以前沒看過答案）, answer, steps, ok }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const fin = function (ev) { return ev.type === 'finish' && ev.data ? ev.data : null; };
  const gue = function (ev) { return ev.type === 'guess' && ev.data ? ev.data : null; };
  /** 猜中、而且這組數字以前沒看過答案 */
  const won = function (ev) { const d = gue(ev); return d && d.ok && d.correct && d.fresh ? d : null; };
  const loopIters = function (d) { return d.loops && d.loops.length ? d.loops[0].iters : 0; };

  LabMission.register('code-tracing', [
    {
      id: 'code-tracing-1', level: 1,
      title: { zh: '第一次追蹤', en: 'Your first trace' },
      desc: { zh: '選一支程式，用「單步」、「播放」或「直接跑完」把它一路跑到最後。', en: 'Pick a program and use “Step”, “Play” or “Run to the end” to take it all the way to the end.' },
      check: function (ev) { const d = fin(ev); return !!(d && d.ok); }
    },
    {
      id: 'code-tracing-2', level: 2,
      title: { zh: '先猜再看', en: 'Guess first, then look' },
      desc: { zh: '程式還沒開始跑的時候，寫下你預測的答案、按「送出猜測」，再把程式跑完：猜中一次（已經看過答案的同一組數字不算）。', en: 'Before the program starts, write down your prediction and press “Submit guess”, then run the program to the end: guess right once (a set of numbers whose answer you have already seen does not count).' },
      check: function (ev) { return !!won(ev); }
    },
    {
      id: 'code-tracing-3', level: 2,
      title: { zh: '一圈也不跑', en: 'Not even once' },
      desc: { zh: '改一改程式裡標出的數字，讓某一個迴圈的本體一次都沒有執行，再把程式跑完。', en: 'Change the marked numbers in a program so that the body of one of its loops never runs at all, then run the program to the end.' },
      check: function (ev) { const d = fin(ev); return !!(d && d.ok && d.zeroLoop); }
    },
    {
      id: 'code-tracing-4', level: 3,
      title: { zh: '< 和 <= 差一圈', en: '< and <= are one apart' },
      desc: { zh: '選「差一圈：< 與 <=」，讓 n 是 3 以上，先猜再看：猜中輸出的兩個數。', en: 'Choose “Off by one: < and <=”, with n at 3 or more, guess first and then look: get both numbers in the output right.' },
      check: function (ev) { const d = won(ev); return !!(d && d.prog === 'offbyone' && d.params.n >= 3); }
    },
    {
      id: 'code-tracing-5', level: 4,
      title: { zh: '負數的除法陷阱', en: 'The negative-division trap' },
      desc: { zh: '選「整數除法與餘數」，讓 C 的 / 或 % 和 Python 的 // 或 % 算出不一樣的結果，再把程式跑完。', en: 'Choose “Integer division and remainder” and make C’s / or % give a different result from Python’s // or %, then run the program to the end.' },
      check: function (ev) { const d = fin(ev); return !!(d && d.ok && d.prog === 'divmod' && d.pyDiffs > 0); }
    },
    {
      id: 'code-tracing-6', level: 4,
      title: { zh: '短路救了你', en: 'Saved by the short circuit' },
      desc: { zh: '選「短路求值」，讓 n 等於 5、要找的 t 不在陣列裡：i 走到 5 的時候 a[5] 根本不必算，程式平安跑完。', en: 'Choose “Short-circuit evaluation”, make n equal to 5 and choose a t that is not in the array: when i reaches 5, a[5] never has to be evaluated and the program ends safely.' },
      check: function (ev) { const d = fin(ev); return !!(d && d.ok && d.prog === 'guard' && d.params.n === 5 && d.vars.i === 5 && d.sc > 0); }
    },
    {
      id: 'code-tracing-7', level: 5,
      title: { zh: 'int 裝不下了', en: 'Too big for an int' },
      desc: { zh: '讓某一支程式算出超過 int 範圍（2147483647）的數，看它停在哪一步。可以從「階乘」或「次方（連乘）」下手。', en: 'Make a program produce a number beyond the range of int (2147483647) and see at which step it stops. “Factorial” or “Powers (repeated multiplication)” are good places to start.' },
      check: function (ev) { const d = fin(ev); return !!(d && d.error === 'overflow'); }
    },
    {
      id: 'code-tracing-8', level: 5,
      title: { zh: '停不下來', en: 'It never stops' },
      desc: { zh: '找一個數字，讓「冰雹數（3n + 1）」跑到 10000 步還停不下來。', en: 'Find a number that keeps “Hailstone numbers (3n + 1)” running past 10000 steps.' },
      check: function (ev) { const d = fin(ev); return !!(d && d.error === 'steps'); }
    },
    {
      id: 'code-tracing-9', level: 6,
      title: { zh: '歐幾里得的耐心', en: 'Euclid’s patience' },
      desc: { zh: '選「輾轉相除法」，找兩個 0 到 1000 的數，讓 while 迴圈至少跑 12 圈。', en: 'Choose “Euclid’s algorithm” and find two numbers from 0 to 1000 that make the while loop go round at least 12 times.' },
      check: function (ev) { const d = fin(ev); return !!(d && d.ok && d.prog === 'gcd' && loopIters(d) >= 12); }
    },
    {
      id: 'code-tracing-10', level: 8,
      title: { zh: '遞迴的回音', en: 'The echo of recursion' },
      desc: { zh: '選「遞迴：去程與回程」，把 n 改成 4 以上，先猜再看：猜中整串輸出。', en: 'Choose “Recursion: down and back up”, set n to 4 or more, guess first and then look: get the whole output right.' },
      check: function (ev) { const d = won(ev); return !!(d && d.prog === 'echo' && d.params.n >= 4); }
    },
    {
      id: 'code-tracing-11', level: 9,
      title: { zh: '連猜五中', en: 'Five in a row' },
      desc: { zh: '在 5 支不同的程式上連續猜中（中間猜錯一次就重新算；已經看過答案的不算）。', en: 'Guess right on 5 different programs in a row (one wrong guess starts the count again; answers you have already seen do not count).' },
      check: function (ev, mem) {
        const d = gue(ev);
        if (!d || !d.ok || !d.fresh) return false;
        if (!d.correct) { mem.run = []; return false; }
        mem.run = (mem.run || []).filter(function (p) { return p !== d.prog; }).concat([d.prog]);
        return mem.run.length >= 5;
      }
    },
    {
      id: 'code-tracing-12', level: 10,
      title: { zh: '冰雹的預言', en: 'The hailstone prophecy' },
      desc: { zh: '在「冰雹數（3n + 1）」先猜再看：猜中一個要走 20 步以上的 n 會印出幾步。', en: 'In “Hailstone numbers (3n + 1)”, guess first and then look: correctly predict the number of steps printed for an n that needs 20 steps or more.' },
      check: function (ev) { const d = won(ev); return !!(d && d.prog === 'collatz' && +d.answer >= 20); }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'code-tracing-h1', level: 3, hidden: true,
      riddle: { zh: '老師想讓全班安靜一整節課，有個孩子卻轉眼就交了卷。', en: 'The teacher hoped to keep the class quiet for a whole lesson; one boy handed in his answer almost at once.' },
      // 高斯的故事：1 + 2 + … + 100
      check: function (ev) { const d = fin(ev); return !!(d && d.ok && d.prog === 'sum' && d.params.n === 100); }
    },
    {
      id: 'code-tracing-h2', level: 4, hidden: true,
      riddle: { zh: '站在門檻上的人，一隻腳在門裡、一隻腳在門外——兩邊你都得試過。', en: 'Someone standing on the threshold has one foot inside and one outside — you must try both sides.' },
      // 邊界值測試：成績等第的同一條分界線（60、80 或 90）上下兩個分數都跑過
      check: function (ev, mem) {
        const d = fin(ev);
        if (!d || !d.ok || d.prog !== 'grade') return false;
        mem.s = mem.s || {};
        mem.s[d.params.s] = true;
        return [60, 80, 90].some(function (x) { return mem.s[x] && mem.s[x - 1]; });
      }
    },
    {
      id: 'code-tracing-h3', level: 5, hidden: true,
      riddle: { zh: '兩個世紀的開頭：一個收下了多出來的那一天，一個把它退了回去。', en: 'Two centuries begin: one keeps the extra day, the other gives it back.' },
      // 閏年：整百年。能被 400 整除的（2000）是閏年、不能的（1800、1900、2100）不是；兩種都跑過
      check: function (ev, mem) {
        const d = fin(ev);
        if (!d || !d.ok || d.prog !== 'leap' || d.params.y % 100 !== 0) return false;
        if (d.params.y % 400 === 0 && d.vars.leap === true) mem.yes = true;
        if (d.params.y % 400 !== 0 && d.vars.leap === false) mem.no = true;
        return !!(mem.yes && mem.no);
      }
    },
    {
      id: 'code-tracing-h4', level: 5, hidden: true,
      riddle: { zh: '明明寫得出來的那個數，卻被數成一個字也沒有。', en: 'A number you can perfectly well write down is counted as having no digits at all.' },
      // 拆位數的程式把 0 數成 0 位（while 的條件 n > 0 一開始就不成立）：典型的邊界錯誤
      check: function (ev) { const d = fin(ev); return !!(d && d.ok && d.prog === 'digits' && d.params.n === 0); }
    },
    {
      id: 'code-tracing-h5', level: 6, hidden: true,
      riddle: { zh: '三個三相乘的那顆冰雹，在雲裡翻滾了一百多回才落地。', en: 'The hailstone made of three threes multiplied together tumbles in the clouds more than a hundred times before it lands.' },
      // 冰雹數 27：111 步，最高到 9232
      check: function (ev) { const d = fin(ev); return !!(d && d.ok && d.prog === 'collatz' && d.params.n === 27); }
    },
    {
      id: 'code-tracing-h6', level: 7, hidden: true,
      riddle: { zh: '一個數和它的影子各照一次鏡子：在 C 裡兩張臉恰好相反；換到另一種語言，影子就再也回不了家。', en: 'A number and its shadow each look in the mirror: in C the two faces are exact opposites; in another language the shadow would never find its way home.' },
      // 「把數字倒過來」：同一個 |n|（≥ 10、不是回文數）正負各跑一次，得到 r 與 −r（負的那次 / 與 % 和 Python 不同；Python 版會停不下來）
      check: function (ev, mem) {
        const d = fin(ev);
        if (!d || !d.ok || d.prog !== 'reverse' || Math.abs(d.params.n) < 10) return false;
        mem.r = mem.r || {};
        const key = String(Math.abs(d.params.n));
        const rec = mem.r[key] = mem.r[key] || {};
        if (d.params.n > 0) rec.pos = d.vars.r; else if (d.pyDiffs > 0) rec.neg = d.vars.r;
        // 回文數（例如 99999）照鏡子還是自己，不算；也避免把 n 拉到最小、最大各跑一次就碰巧完成
        return rec.pos != null && rec.neg != null && rec.pos === -rec.neg && rec.pos !== 0 && Math.abs(rec.pos) !== Math.abs(d.params.n);
      }
    },
    {
      id: 'code-tracing-h7', level: 7, hidden: true,
      riddle: { zh: '兩塊相鄰的方磚，拼成一塊更大的方磚。最小的那一組人人都知道——找下一組。', en: 'Two neighbouring square tiles join into one bigger square tile. Everyone knows the smallest set — find the next one.' },
      // 平方和：a² + (a + 1)² 是完全平方數而且大於 25（a = 20 或 −21：400 + 441 = 841 = 29²）
      check: function (ev) {
        const d = fin(ev);
        if (!d || !d.ok || d.prog !== 'square') return false;
        const s = d.vars.s, r = Math.round(Math.sqrt(s));
        return s > 25 && r * r === s;
      }
    },
    {
      id: 'code-tracing-h8', level: 8, hidden: true,
      riddle: { zh: '最有耐心的一對：每一次相除都只商一；而且它們客氣到第一步就先交換位置。', en: 'The most patient pair: every division gives a quotient of one, and they are so polite that their very first step is to swap places.' },
      // 輾轉相除法：0 到 1000 之間迴圈最多 15 圈，只有 (610, 987)（費氏數；拉梅定理）
      check: function (ev) { const d = fin(ev); return !!(d && d.ok && d.prog === 'gcd' && loopIters(d) >= 15); }
    },
    {
      id: 'code-tracing-h9', level: 9, hidden: true,
      riddle: { zh: '一千步以外的未來，你在第一步之前就說中了。', en: 'You foretold the future a thousand steps away before the first step was taken.' },
      // 先猜再看：猜中一個要跑 1000 步以上的程式（例如用公式算出 1 + … + n）
      check: function (ev) { const d = won(ev); return !!(d && d.steps >= 1000); }
    },
    {
      id: 'code-tracing-h10', level: 10, hidden: true,
      riddle: { zh: '一千以內被拋得最高的那顆冰雹，並不是在雲裡待得最久的那一顆。', en: 'The hailstone thrown highest of all below a thousand is not the one that stays in the clouds longest.' },
      // 冰雹數：1 到 1000 之中最高點最大的是 703（衝到 250504）；走最久的是 871
      check: function (ev) { const d = fin(ev); return !!(d && d.ok && d.prog === 'collatz' && d.peaks && d.peaks.n >= 250504); }
    }
  ]);
})();
