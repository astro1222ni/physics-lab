/* missions/hanoi.js — 河內塔的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/hanoi-core.js 的 Session 發出，js/hanoi.js 轉給 LabMission.emit；都在使用者操作之後）：
 *   'move'：搬了一個盤子。{ src（'hand' 親手：按柱子、拖曳或鍵盤／'auto' 自動解）, n, disk, from, to（'A'／'B'／'C'）,
 *          moves（這一段的步數）, dist（離目標還有幾步）, state（每個盤在哪根柱，第 1 個字母是盤 1）, target（'A'／'B'／'C'／'custom'）,
 *          perfect（全部疊在同一根柱時是那根柱，否則 ''）, startPerfect（這一段開始時整疊在哪根柱，不是整疊時 ''）,
 *          bigPegs（最大的盤這一段到過的柱子，例如 'AB'）, bigHand（最大的盤被親手搬的次數）,
 *          tour3（連續親手搬時，依序經過三根不同柱子的「整疊」所用的步數；沒有時 −1）, hint（這一段開過「顯示最短路」） }
 *   'solved'：到達目標。{ n, moves, src, handAll（全部親手）, handMoves, autoMoves, autoFirst（自動解的步都在親手的步之前）,
 *          startKind（'perfect'／'shuffled' 打亂／'other'）, startPerfect, startDist（這一段開始時離目標幾步）, hint, target, goal（目標狀態）,
 *          tail{ len, start, startPerfect, startDist, hand, big }（最後一段「每步都讓距離少 1」的最短路：長度、起點、起點離目標幾步、是否全親手、最大盤搬了幾次）,
 *          d1, d2（自訂目標、而且尾段起點的最大盤不在目標柱時：最大盤直接搬一次／經過第三根柱搬兩次的最少步數；否則 null）,
 *          rot（這一段每一步都是 A → B → C → A 方向時 1、都是反方向時 −1、兩種都有時 0） }
 *   'illegal'：想把大盤放到小盤上（被擋下）。{ n, disk, onto, from, to, src }
 *   'undo'：按「上一步」。{ n, moves, undoRun（連續按了幾次）, fromSolved（這串上一步是從「已到達目標」開始的）, solvedLen（那時的步數）,
 *          atStart（已經倒回這一段的起點）, startPerfect, dist }
 *   'auto'：自動解完成。{ n, alg（'rec' 遞迴／'iter' 最小盤輪流）, from, target, moves, stepMoves（用「自動解」「單步」走的步數）,
 *          skipMoves（用「跳過子問題」走的步數）, presses（按了幾次自動解相關的按鈕）, skips（其中「跳過子問題」幾次）,
 *          fromPerfect（從整疊開始）, same（最小盤輪流：每一步都和遞迴相同） }
 *   'bfs'：按「廣度優先搜尋」，搜完整個狀態圖。{ n, start, startPerfect, layers（層數）, visited, dist（到目標的步數）, target, lastSrc（之前最後一個改變狀態的操作） }
 *   'quiz'：回答一題。{ kind（'disk' 第 k 步搬哪個盤／'move' 第 k 步從哪根柱到哪根柱）, ok, streak（同一種題目連續答對）, k }
 *   'legend'：傳說的計算（放開滑桿或按速度按鈕時）。{ N, rate（每秒幾步）, years, seconds }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  // 小工具寫在這裡（排行榜頁只載入任務檔、不載入核心）
  const full = function (n) { return Math.pow(2, n) - 1; };      // n 個盤的最少步數
  const PEGI = { A: 0, B: 1, C: 2 };
  const isSolved = function (ev) { return ev.type === 'solved' && ev.data.target !== 'custom'; };
  const handSolve = function (d, n) { return d.n === n && d.handAll && d.startPerfect !== '' && d.moves === full(n); };

  LabMission.register('hanoi', [
    {
      id: 'hanoi-1', level: 1,
      title: { zh: '三層塔', en: 'A three-disc tower' },
      desc: { zh: '把「盤子數 n」設成 3，用「A 柱」「B 柱」「C 柱」（或直接拖曳盤子）親手把整疊搬到目標柱。', en: 'Set “Number of discs n” to 3 and move the whole tower to the target peg yourself with “Peg A”, “Peg B” and “Peg C” (or by dragging the discs).' },
      check: function (ev) { return isSolved(ev) && ev.data.n === 3 && ev.data.handAll; }
    },
    {
      id: 'hanoi-2', level: 2,
      title: { zh: '七步就好', en: 'Seven moves will do' },
      desc: { zh: '3 個盤子、從整疊開始，親手用最少的 7 步搬完（不開「顯示最短路」）。', en: 'With 3 discs, start from a full tower and finish by hand in the minimum 7 moves (without “Show shortest path”).' },
      check: function (ev) { return isSolved(ev) && handSolve(ev.data, 3) && !ev.data.hint; }
    },
    {
      id: 'hanoi-3', level: 2,
      title: { zh: '世界末日還有多久', en: 'How long until the end of the world?' },
      desc: { zh: '把「傳說的盤子數 N」設成 64，再選「每秒 1 步」。', en: 'Set “Discs in the legend N” to 64, then choose “1 move per second”.' },
      check: function (ev) { return ev.type === 'legend' && ev.data.N === 64 && ev.data.rate === 1; }
    },
    {
      id: 'hanoi-4', level: 3,
      title: { zh: '看遞迴怎麼想', en: 'Watch recursion think' },
      desc: { zh: '至少 4 個盤子、從整疊開始，選「遞迴」，用「自動解」或「單步」把整疊搬完。', en: 'With at least 4 discs, start from a full tower, choose “Recursive” and let “Auto solve” or “Step” move the whole tower.' },
      check: function (ev) { const d = ev.data; return ev.type === 'auto' && d.alg === 'rec' && d.n >= 4 && d.fromPerfect; }
    },
    {
      id: 'hanoi-5', level: 3,
      title: { zh: '一層一層擴散', en: 'Spreading layer by layer' },
      desc: { zh: '至少 3 個盤子、從整疊開始，按「廣度優先搜尋」找出到目標的最短步數。', en: 'With at least 3 discs, start from a full tower and press “Breadth-first search” to find the shortest number of moves to the target.' },
      check: function (ev) { const d = ev.data; return ev.type === 'bfs' && d.n >= 3 && d.startPerfect !== '' && d.target !== 'custom' && d.dist === full(d.n); }
    },
    {
      id: 'hanoi-6', level: 4,
      title: { zh: '十五步', en: 'Fifteen moves' },
      desc: { zh: '4 個盤子、從整疊開始，親手用最少的 15 步搬完。', en: 'With 4 discs, start from a full tower and finish by hand in the minimum 15 moves.' },
      check: function (ev) { return isSolved(ev) && handSolve(ev.data, 4); }
    },
    {
      id: 'hanoi-7', level: 4,
      title: { zh: '三句話說完', en: 'Done in three sentences' },
      desc: { zh: '至少 6 個盤子、從整疊開始，選「遞迴」後只按「跳過子問題」，最多按 3 次就把整疊搬完。', en: 'With at least 6 discs, start from a full tower, choose “Recursive” and press only “Skip subproblem” — at most 3 presses to move the whole tower.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'auto' && d.alg === 'rec' && d.n >= 6 && d.fromPerfect && d.presses === d.skips && d.skips <= 3 && d.skipMoves === d.moves;
      }
    },
    {
      id: 'hanoi-8', level: 5,
      title: { zh: '尺規函數', en: 'The ruler function' },
      desc: { zh: '按「出題」，連續答對 5 題：第 k 步搬的是哪一個盤。', en: 'Press “New question” and answer 5 questions in a row correctly: which disc moves at step k.' },
      check: function (ev) { return ev.type === 'quiz' && ev.data.kind === 'disk' && ev.data.ok && ev.data.streak >= 5; }
    },
    {
      id: 'hanoi-9', level: 5,
      title: { zh: '不用遞迴也可以', en: 'No recursion needed' },
      desc: { zh: '至少 6 個盤子、從整疊開始，選「最小盤輪流」自動解完，看它每一步都和遞迴相同。', en: 'With at least 6 discs, start from a full tower, choose “Smallest disc alternates” and let it finish — every move matches the recursive solution.' },
      check: function (ev) { const d = ev.data; return ev.type === 'auto' && d.alg === 'iter' && d.n >= 6 && d.same && d.stepMoves === d.moves; }
    },
    {
      id: 'hanoi-10', level: 6,
      title: { zh: '三十一步', en: 'Thirty-one moves' },
      desc: { zh: '5 個盤子、從整疊開始，親手用最少的 31 步搬完。', en: 'With 5 discs, start from a full tower and finish by hand in the minimum 31 moves.' },
      check: function (ev) { return isSolved(ev) && handSolve(ev.data, 5); }
    },
    {
      id: 'hanoi-11', level: 8,
      title: { zh: '從亂局回家', en: 'Home from chaos' },
      desc: { zh: '至少 6 個盤子，按「打亂」（離目標至少 20 步），再親手用最少步數搬到目標，不開「顯示最短路」。', en: 'With at least 6 discs, press “Shuffle” (at least 20 moves from the target), then reach the target by hand in the fewest moves, without “Show shortest path”.' },
      check: function (ev) {
        const d = ev.data;
        return isSolved(ev) && d.n >= 6 && d.startKind === 'shuffled' && d.handAll && !d.hint && d.startDist >= 20 && d.moves === d.startDist;
      }
    },
    {
      id: 'hanoi-12', level: 10,
      title: { zh: '預言第 k 步', en: 'Predict move k' },
      desc: { zh: '按「進階題」，連續答對 3 題：第 k 步從哪根柱搬到哪根柱。', en: 'Press “Hard question” and answer 3 questions in a row correctly: from which peg to which peg move k goes.' },
      check: function (ev) { return ev.type === 'quiz' && ev.data.kind === 'move' && ev.data.ok && ev.data.streak >= 3; }
    },

    // ---------------- 隱藏任務（十個）----------------
    {
      id: 'hanoi-h1', level: 3, hidden: true,
      riddle: { zh: '走完了全程，再一步一步倒著走回去，直到回到故事的第一頁。', en: 'Finish the whole journey, then walk it backwards step by step, until you are on the first page of the story again.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'undo' && d.n >= 4 && d.fromSolved && d.atStart && d.startPerfect !== '' && d.solvedLen >= full(d.n) && d.undoRun === d.solvedLen;
      }
    },
    {
      id: 'hanoi-h2', level: 4, hidden: true,
      riddle: { zh: '如果第一步落在宇宙誕生的那一刻，而你從不偷懶也從不趕工，到今天還搬不完——最少要幾層？界線兩邊，你都要親眼看過。', en: 'If the first move was made the instant the universe was born, and you never slacked and never hurried, how many discs would still be unfinished today? Look at both sides of the line with your own eyes.' },
      check: function (ev, mem) {
        if (ev.type !== 'legend') return false;
        const d = ev.data;
        if (d.rate !== 1) { mem.prev = 0; return false; }
        const ok = (mem.prev === 58 && d.N === 59) || (mem.prev === 59 && d.N === 58);
        mem.prev = d.N;
        return ok;
      }
    },
    {
      id: 'hanoi-h3', level: 5, hidden: true,
      riddle: { zh: '第一步就走錯了，終點卻一點也沒有變遠；之後你再也沒有走錯。', en: 'Your very first move was wrong, yet the goal got no farther away; after that you never went wrong again.' },
      check: function (ev) {
        const d = ev.data, F = full(d.n);
        return isSolved(ev) && d.n >= 4 && d.handAll && !d.hint && d.startPerfect !== '' && d.startDist === F && d.moves === F + 1 &&
          d.tail.hand && d.tail.len === F && d.tail.startDist === F && d.tail.startPerfect === '';
      }
    },
    {
      id: 'hanoi-h4', level: 5, hidden: true,
      riddle: { zh: '最小的那一位永遠朝同一個方向繞圈。可是它分得出單數和雙數，也認得終點——讓它把每一種情形都繞給你看。', en: 'The smallest one always circles in the same direction. Yet it can tell odd from even, and it knows where the journey ends — let it show you every case.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'auto' || d.alg !== 'iter' || !d.fromPerfect || d.n < 3 || !d.same || d.stepMoves !== d.moves || !(d.from in PEGI) || !(d.target in PEGI)) return false;
        mem.seen = mem.seen || {};
        mem.seen[(d.n % 2) + ':' + ((PEGI[d.target] - PEGI[d.from] + 3) % 3)] = true;
        return Object.keys(mem.seen).length >= 4;
      }
    },
    {
      id: 'hanoi-h5', level: 6, hidden: true,
      riddle: { zh: '三座城門，你都親自拜訪過，而且一步也沒有多走。', en: 'Three city gates — you visited every one yourself, without a single extra step.' },
      check: function (ev) { const d = ev.data; return ev.type === 'move' && d.src === 'hand' && d.n >= 4 && d.tour3 === 2 * full(d.n); }
    },
    {
      id: 'hanoi-h6', level: 6, hidden: true,
      riddle: { zh: '師父示範到一半就放手，徒弟接著做完，一步也沒有多。', en: 'The master demonstrates halfway and lets go; the apprentice finishes the job without one extra move.' },
      check: function (ev) {
        const d = ev.data;
        return isSolved(ev) && d.n >= 5 && d.src === 'hand' && d.startPerfect !== '' && d.moves === full(d.n) && d.autoFirst &&
          d.autoMoves >= Math.pow(2, d.n - 1) && d.handMoves >= Math.pow(2, d.n - 2);
      }
    },
    {
      id: 'hanoi-h7', level: 7, hidden: true,
      riddle: { zh: '最重的那一位想盡快住遍三個房間。它只能在大家都讓路時出門——而你沒讓它多等一刻。', en: 'The heaviest one wants to live in all three rooms as soon as possible. It can only go out when everyone else makes way — and you never kept it waiting a moment longer.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'move' && d.src === 'hand' && d.n >= 5 && d.disk === d.n && d.startPerfect !== '' && d.bigPegs.length === 3 && d.moves === Math.pow(2, d.n);
      }
    },
    {
      id: 'hanoi-h8', level: 8, hidden: true,
      riddle: { zh: '兩條一樣短的回家路，差別只在最大的那一片肯不肯多出一趟門。兩條都走給我看。', en: 'Two equally short roads home; the only difference is whether the largest one agrees to make an extra trip. Walk both for me.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (ev.type !== 'solved' || d.target !== 'custom' || d.n < 3 || d.hint || !d.tail.hand || d.d1 === null || d.d1 !== d.d2) return false;
        if (d.tail.big !== 1 && d.tail.big !== 2) return false;
        mem.ways = mem.ways || {};
        const key = d.n + ':' + d.tail.start + '>' + d.goal;
        mem.ways[key] = (mem.ways[key] || 0) | d.tail.big;
        return mem.ways[key] === 3;
      }
    },
    {
      id: 'hanoi-h9', level: 9, hidden: true,
      riddle: { zh: '三座城圍成一圈，城與城之間只有單行道。不逆行、不多走一步，把整座塔送到終點。', en: 'Three cities stand in a ring, joined only by one-way roads. Never drive against the traffic, never take an extra step, and deliver the whole tower to its destination.' },
      check: function (ev) {
        const d = ev.data;
        if (!isSolved(ev) || d.n < 4 || !d.handAll || !d.rot || !(d.startPerfect in PEGI) || !(d.target in PEGI)) return false;
        const k = ((PEGI[d.target] - PEGI[d.startPerfect]) * d.rot + 6) % 3;   // 照單行道的方向要往前幾格
        let q = 0, r = 0;                                                          // 整疊往前一格最少 q 步、兩格最少 r 步
        for (let i = 1; i <= d.n; i++) { const q2 = 2 * r + 1, r2 = 2 * r + q + 2; q = q2; r = r2; }
        return k > 0 && d.moves === (k === 1 ? q : r);
      }
    },
    {
      id: 'hanoi-h10', level: 10, hidden: true,
      riddle: { zh: '壓箱底的那一位搬家，直直走過去竟然比繞一圈還遠。', en: 'When the one at the very bottom moves house, going straight there turns out to be longer than going the long way round.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'solved' && d.target === 'custom' && d.n >= 3 && !d.hint && d.tail.hand && d.d1 !== null && d.d2 < d.d1 && d.tail.big === 2;
      }
    }
  ]);
})();
