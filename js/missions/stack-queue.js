/* missions/stack-queue.js — 堆疊與佇列的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 不依賴計算核心（排行榜頁只載入任務檔也能跑）。事件都由 js/stack-queue.js 在使用者操作之後送出；載入、預設值、自動播放都不觸發。
 *   'op'：模式一（堆疊與佇列）、模式二（環狀佇列）的每一次操作（包含失敗的嘗試）。
 *       模式一 { mode: 'desk', op（'push'|'pop'|'top'|'enq'|'deq'|'front'|'rot'|'pushB'|'popB'|'topB'|'toR'|'toL'|'clear'）, ok, err（'overflow'|'underflow'|''）, v,
 *               rk（右邊是 'queue' 或 'stack'）, cap, A, R（內容；佇列由前到後、堆疊由底到頂）, outA, outR, ops（基本操作次數）,
 *               cycA（這次操作讓堆疊 A 變空：{ pushed, popped, pure（只用放入、取出）}）, cycR（右邊變空：{ pushed, popped, pure, rots, kind }）,
 *               pass（只用「佇列 → 堆疊」「堆疊 → 佇列」走完一整輪：{ base（開始時佇列）, result（之後佇列）}）,
 *               jos（佇列只用「排到隊尾」「離開」剩下一人，而且每次離開前排到隊尾的次數都一樣：{ n, k, start, out, survivor }）,
 *               two（右邊是第二個堆疊時：{ inA（放入 A 的數）, outB（從 B 取出的數）, ok（沒用過取出 A、放入 B、B → A）, firstOut（第一次取出 B 時已放入幾個）}）}
 *       模式二 { mode: 'ring', op（'enq'|'deq'|'clear'）, ok, err（'full'|'empty'|''）, v, idx, wrapped, N, wrap（環狀）, front, rear, size, cap, trueFull（不繞回時曾經真的放滿 N 個）, rearWraps, frontWraps }
 *   'scan'：括號配對掃完（或出錯停下）。{ ok, err（'extraRight'|'extraLeft'|'mismatch'|''）, maxDepth, kinds（用了幾種括號）, nBr（括號個數）, balancedCounts, onlyRound（去掉空白後只有小括號）, key（去掉空白的字串）, typed（不是範例）}
 *   'eval'：後序式求值跑完。{ src（'typed'|'example'|'convert'）, ok, value, err, maxDepth, nNums, nOps, ops（各運算子次數）, nums, typed, fromParen（從中序轉來時，中序式的括號對數）}
 *   'convert'：中序轉後序跑完。{ ok, err, postfix, value, valueLeft（^ 改成由左往右算的值）, maxOps, nNums, nOps, parenPairs, numbersFirst, chainPow（有沒有括號隔開的連續 ^）, key, typed }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const same = function (a, b) { if (!a || !b || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
  const rev = function (a) { return a.slice().reverse(); };
  const inc = function (a) { for (let i = 1; i < a.length; i++) if (a[i] <= a[i - 1]) return false; return true; };
  const desk = function (ev) { return ev.type === 'op' && ev.data.mode === 'desk'; };
  const ring = function (ev) { return ev.type === 'op' && ev.data.mode === 'ring'; };

  LabMission.register('stack-queue', [
    {
      id: 'stack-queue-1', level: 1,
      title: { zh: '後進先出', en: 'Last in, first out' },
      desc: { zh: '用「放入（push）」放進至少 3 個數，再用「取出（pop）」全部拿出來：拿出來的順序剛好倒過來。', en: 'Put in at least 3 numbers with “Push”, then take them all out with “Pop”: they come out in reverse order.' },
      check: function (ev) { const c = ev.data.cycA; return desk(ev) && !!c && c.pure && c.pushed.length >= 3 && same(c.popped, rev(c.pushed)); }
    },
    {
      id: 'stack-queue-2', level: 1,
      title: { zh: '先進先出', en: 'First in, first out' },
      desc: { zh: '用「排入（enqueue）」排進至少 3 個數，再用「離開（dequeue）」讓它們全部離開：離開的順序和排入的順序一樣。', en: 'Line up at least 3 numbers with “Enqueue”, then let them all leave with “Dequeue”: they leave in the order they came.' },
      check: function (ev) { const c = ev.data.cycR; return desk(ev) && !!c && c.kind === 'queue' && c.pure && c.rots === 0 && c.pushed.length >= 3 && same(c.popped, c.pushed); }
    },
    {
      id: 'stack-queue-3', level: 2,
      title: { zh: '盤子疊不下了', en: 'No room for another plate' },
      desc: { zh: '把堆疊放到容量的上限，再按一次「放入（push）」：溢位（overflow），放不進去。', en: 'Fill the stack up to its capacity and press “Push” once more: overflow, it will not fit.' },
      check: function (ev) { return desk(ev) && ev.data.op === 'push' && ev.data.err === 'overflow'; }
    },
    {
      id: 'stack-queue-4', level: 3,
      title: { zh: '三層括號', en: 'Three layers of brackets' },
      desc: { zh: '在「括號配對」打一個小括號、中括號、大括號都用到，而且至少套了 3 層的式子，跑到最後配對成功。', en: 'In “Bracket matching”, type something that uses round, square and curly brackets, nested at least 3 deep, and run it to the end: everything matches.' },
      check: function (ev) { const d = ev.data; return ev.type === 'scan' && d.ok && d.kinds === 3 && d.maxDepth >= 3; }
    },
    {
      id: 'stack-queue-5', level: 4,
      title: { zh: '三種配對失敗', en: 'Three ways to fail' },
      desc: { zh: '在「括號配對」分別做出三種錯誤：多了右括號、多了左括號、左右不對應（各跑到出錯為止）。', en: 'In “Bracket matching”, make all three kinds of error, each run until it stops: an extra closing bracket, an extra opening bracket, and brackets that do not match.' },
      check: function (ev, mem) {
        if (ev.type !== 'scan' || ev.data.ok) return false;
        const e = ev.data.err;
        if (e === 'extraRight' || e === 'extraLeft' || e === 'mismatch') mem[e] = true;
        return !!(mem.extraRight && mem.extraLeft && mem.mismatch);
      }
    },
    {
      id: 'stack-queue-6', level: 4,
      title: { zh: '算出 24', en: 'Make 24' },
      desc: { zh: '在「後序式求值」寫一個至少有 4 個數字的後序式，跑完算出 24。', en: 'In “Postfix evaluation”, write a postfix expression with at least 4 numbers and run it: it comes out as 24.' },
      check: function (ev) { const d = ev.data; return ev.type === 'eval' && d.ok && d.value === 24 && d.nNums >= 4; }
    },
    {
      id: 'stack-queue-7', level: 5,
      title: { zh: '指定的出場順序', en: 'A given exit order' },
      desc: { zh: '把「要放的數」設成 1，從空的堆疊開始依序放入 1、2、3、4、5（中間可以隨時取出），讓取出的順序剛好是 3、2、5、4、1。', en: 'Set “Number to put in” to 1 and, starting from an empty stack, push 1, 2, 3, 4, 5 in order (popping whenever you like) so that they come out as 3, 2, 5, 4, 1.' },
      check: function (ev) { const c = ev.data.cycA; return desk(ev) && !!c && c.pure && same(c.pushed, [1, 2, 3, 4, 5]) && same(c.popped, [3, 2, 5, 4, 1]); }
    },
    {
      id: 'stack-queue-8', level: 5,
      title: { zh: '繞了一圈還是滿的', en: 'Full after going round' },
      desc: { zh: '在「環狀佇列」裡，讓佇列在 front 不是 0 的時候滿了（這時 rear 一定已經繞回陣列的開頭）。', en: 'In “Circular queue”, make the queue full while front is not 0 (by then rear must have wrapped round to the start of the array).' },
      check: function (ev) { const d = ev.data; return ring(ev) && d.wrap && d.op === 'enq' && d.err === 'full' && d.front !== 0; }
    },
    {
      id: 'stack-queue-9', level: 6,
      title: { zh: '先翻譯，再計算', en: 'Translate, then compute' },
      desc: { zh: '在「中序轉後序」自己寫一個有括號、至少 3 個運算子的式子（不用範例），轉完再按「拿去求值」，跑完算出答案。', en: 'In “Infix to postfix”, write your own expression (not an example) with brackets and at least 3 operators, convert it, then press “Evaluate it” and run it to get the answer.' },
      check: function (ev) { const d = ev.data; return ev.type === 'eval' && d.src === 'convert' && d.typed && d.ok && d.nOps >= 3 && d.fromParen >= 1; }
    },
    {
      id: 'stack-queue-10', level: 6,
      title: { zh: '整排倒過來', en: 'Turn the line around' },
      desc: { zh: '佇列裡至少排 5 個數，堆疊是空的；只用「佇列 → 堆疊」和「堆疊 → 佇列」，把佇列整排倒過來。', en: 'With at least 5 numbers in the queue and the stack empty, use only “Queue → stack” and “Stack → queue” to turn the whole queue around.' },
      check: function (ev) { const p = ev.data.pass; return desk(ev) && !!p && p.base.length >= 5 && same(p.result, rev(p.base)) && !same(p.base, rev(p.base)); }
    },
    {
      id: 'stack-queue-11', level: 7,
      title: { zh: '兩個堆疊排成一列隊伍', en: 'Two stacks make a queue' },
      desc: { zh: '「右邊放」選「第二個堆疊」，只用「放入（push）」、「A → B」、「取出 B」，讓取出的順序和放入的順序一樣，連續取出至少 6 個；而且要在開始取出之後，再放入新的數。', en: 'Set “On the right” to “Second stack” and use only “Push”, “A → B” and “Pop B” so that numbers come out in the order they went in — at least 6 in a row — putting in new numbers after you have started taking some out.' },
      check: function (ev) {
        const d = ev.data, t = d.two;
        return desk(ev) && d.rk === 'stack' && d.op === 'popB' && d.ok && !!t && t.ok && t.outB.length >= 6 && same(t.outB, t.inA.slice(0, t.outB.length)) && t.outB.length > t.firstOut;
      }
    },
    {
      id: 'stack-queue-12', level: 9,
      title: { zh: '不靠括號疊高樓', en: 'A tall stack with no brackets' },
      desc: { zh: '在「中序轉後序」寫一個不含任何括號的式子，讓運算子堆疊在轉換時疊到 4 層。', en: 'In “Infix to postfix”, write an expression with no brackets at all whose operator stack grows to 4 levels during the conversion.' },
      check: function (ev) { const d = ev.data; return ev.type === 'convert' && d.ok && d.parenPairs === 0 && d.maxOps >= 4; }
    },

    // ---------------- 隱藏任務（提示非常隱晦；完成時只恭喜、不說原因） ----------------
    {
      id: 'stack-queue-h1', level: 3, hidden: true,
      riddle: { zh: '一長串的帳，從頭到尾只用兩隻手就算完了。', en: 'A long, long bill, worked out from start to finish with just two hands.' },
      check: function (ev) { const d = ev.data; return ev.type === 'eval' && d.ok && d.typed && d.nNums >= 6 && d.maxDepth === 2; }
    },
    {
      id: 'stack-queue-h2', level: 4, hidden: true,
      riddle: { zh: '多帶了兩把傘，走的卻是同一條路。', en: 'Two extra umbrellas, and yet exactly the same road.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'convert' || !d.ok || d.nOps < 2) return false;
        const seen = mem[d.postfix] = mem[d.postfix] || {};
        seen[d.key] = d.parenPairs;
        const vals = Object.keys(seen).map(function (k) { return seen[k]; });
        return Math.max.apply(null, vals) - Math.min.apply(null, vals) >= 2;
      }
    },
    {
      id: 'stack-queue-h3', level: 5, hidden: true,
      riddle: { zh: '每一隻手都找得到另一隻手，舞會卻還是亂了套。', en: 'Every hand has another hand to hold, and still the dance falls apart.' },
      check: function (ev) { const d = ev.data; return ev.type === 'scan' && d.err === 'mismatch' && d.balancedCounts && d.typed && d.nBr >= 4; }
    },
    {
      id: 'stack-queue-h4', level: 6, hidden: true,
      riddle: { zh: '這間屋子曾經擠滿了人；現在一個人也沒有，門口卻還掛著「客滿」。', en: 'This house was once packed to the door; now nobody is inside, yet the sign still says “Full”.' },
      check: function (ev) { const d = ev.data; return ring(ev) && !d.wrap && d.op === 'enq' && d.err === 'full' && d.size === 0 && d.trueFull; }
    },
    {
      id: 'stack-queue-h5', level: 6, hidden: true,
      riddle: { zh: '整塊的麵包不肯切開；同樣的人、同樣的麵包，只換一個先後，就有人多分到了。', en: 'The loaves will not be cut; same people, same bread, only the order changes — and someone ends up with more.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'eval' || !d.ok || !d.typed || !d.ops) return false;
        const keys = Object.keys(d.ops);
        if (!d.ops['*'] || !d.ops['/'] || keys.some(function (k) { return k !== '*' && k !== '/'; })) return false;
        const key = d.nums.slice().sort(function (a, b) { return a - b; }).join(',') + '|' + d.ops['*'] + '*' + d.ops['/'];
        const vals = mem[key] = mem[key] || {};
        vals[d.value] = true;
        return Object.keys(vals).length >= 2;
      }
    },
    {
      id: 'stack-queue-h6', level: 7, hidden: true,
      riddle: { zh: '以 1960 年命名的那份報告說：塔從地基往上蓋。如今的課本說：從塔尖往下蓋。蓋一座讓兩派吵起來的塔。', en: 'The report named after 1960 said: build the tower up from the ground. Today’s textbooks say: build it down from the spire. Build a tower the two sides would argue about.' },
      check: function (ev) { const d = ev.data; return ev.type === 'convert' && d.ok && d.typed && d.chainPow && d.value !== null && d.valueLeft !== null && d.value !== d.valueLeft; }
    },
    {
      id: 'stack-queue-h7', level: 7, hidden: true,
      riddle: { zh: '只有一條直直的隊伍，最晚來的人卻總是第一個離開。', en: 'Just one straight line, and yet the last to arrive is always the first to go.' },
      check: function (ev) { const c = ev.data.cycR; return desk(ev) && !!c && c.kind === 'queue' && c.pure && c.pushed.length >= 4 && same(c.popped, rev(c.pushed)); }
    },
    {
      id: 'stack-queue-h8', level: 8, hidden: true,
      riddle: { zh: '三對左右，誰也不越過誰；合乎規矩的排法不多不少——一個不漏地全部排給我看。', en: 'Three lefts and three rights, none crossing another; the proper arrangements are neither many nor few — show me every single one.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'scan' || !d.ok || !d.typed || !d.onlyRound || d.nBr !== 6) return false;
        mem[d.key] = true;
        return Object.keys(mem).length >= 5;
      }
    },
    {
      id: 'stack-queue-h9', level: 9, hidden: true,
      riddle: { zh: '那位史家活了下來，因為他會數數。用一條隊伍，替他再數一次。', en: 'The historian survived because he could count. Use a single line to count it out for him once more.' },
      check: function (ev) { const j = ev.data.jos; return desk(ev) && !!j && j.k >= 2 && j.n >= 5; }
    },
    {
      id: 'stack-queue-h10', level: 10, hidden: true,
      riddle: { zh: '一列亂了號的車廂，開進一條死巷再倒出來，就排得整整齊齊。', en: 'A train with its carriages out of order runs into a dead-end siding, backs out again — and every number is in its place.' },
      check: function (ev) {
        const p = ev.data.pass;
        return desk(ev) && !!p && p.base.length >= 5 && inc(p.result) && !inc(p.base) && !same(p.result, rev(p.base));
      }
    }
  ]);
})();
