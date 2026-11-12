/* missions/shortest-path.js — 最短路徑：Dijkstra 演算法的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/shortest-path.js 發出，都在使用者按「單步」「播放」「下一個點」「直接跑完」之後；載入與預設值不觸發）：
 *   'settle'：Dijkstra／BFS 從佇列取出一個點（它的距離確定了）。
 *       { mode（'taiwan'／'random'／'grid'／'neg'）, algo（'dijkstra'／'bfs'／'bf'）, s, t（起點、終點編號）, node（取出的點）,
 *         key（臺灣地圖的城市代號，例如 'taichung'；其他模式是 ''）, ord（第幾個被確定）, d（它的距離）,
 *         manual（這次執行到目前為止只按過「單步」）, early（「找到終點就停」）, unedited（權重全是原值、沒有封閉的路）, V（點數）, k（已走的步數） }
 *   'finish'：一次執行走到最後一步。
 *       { mode, algo, s, t, sKey, tKey, V, E（沒封閉的邊數）, reach（走得到的點數）, settled（取出的點數）,
 *         steps, checks（檢查的邊）, relax（鬆弛＝更新次數）, cmp（找最小值的比較）, late（負權重：錯過的捷徑）,
 *         rounds、updRounds（Bellman–Ford 的輪數、有更新的輪數）, early, manual,
 *         dist（終點的距離；BFS 是那條路線的總長；到不了是 null）, hops（路線的邊數）, pathKey（路線的點編號，用 - 連接）,
 *         count（最短路有幾條；無向圖有權重 0 時是 null）,
 *         unedited, edits（權重和原值不同的邊數）, closed（封閉的邊數）, allEqual（沒封閉的邊權重都相同）, wsig（權重與封閉狀態的指紋）,
 *         dijDist, dijPathKey, bfsPathKey, bfsLen（同一張圖上 Dijkstra 與 BFS 的結果，用來對照）,
 *         wrong（Dijkstra 確定的點裡，和 Bellman–Ford 正確值不同的個數）, wrongT（終點算錯）, truthDist, truthHops（正確的最短路）, negOnPath（正確最短路上負權重的邊數）,
 *         adjST（起點與終點之間有一條沒封閉的路直接相連）, sideS, sideT（起點、終點所在的那一塊有幾個點）, sep（起點與終點被分開）,
 *         isDiam（臺灣原權重、Dijkstra，距離剛好是全島最遠的一對城市的距離 387 km）, sptMst（Dijkstra 完整跑完，最短路徑樹就是那一棵唯一的最小生成樹）,
 *         rows, cols（方格）, corners（起點與終點是方格的一對對角）, square（方格是正方形） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const fin = function (ev) { return ev.type === 'finish'; };
  const dij = function (d) { return d.algo === 'dijkstra'; };
  const tw = function (d) { return d.mode === 'taiwan'; };
  const path = function (d) { return d.pathKey ? d.pathKey.split('-').map(Number) : []; };
  // 臺灣地圖的城市編號（和 js/shortest-path-core.js 的 CITIES 順序相同；排行榜頁不載入核心，所以寫在這裡）
  const TAICHUNG = 5, HUALIEN = 16;
  const binom = function (n, k) { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); };

  LabMission.register('shortest-path', [
    {
      id: 'shortest-path-1', level: 1,
      title: { zh: '第一條最短路', en: 'Your first shortest route' },
      desc: { zh: '在「臺灣地圖」上選兩個不同的城市，用 Dijkstra 跑到最後一步（可以按「直接跑完」）。', en: 'On the “Taiwan map”, pick two different cities and run Dijkstra to the last step (you may press “Run to the end”).' },
      check: function (ev) { const d = ev.data; return fin(ev) && tw(d) && dij(d) && d.s !== d.t && d.dist !== null; }
    },
    {
      id: 'shortest-path-2', level: 2,
      title: { zh: '一步一腳印', en: 'One step at a time' },
      desc: { zh: '只按「單步」（不按「播放」「下一個點」「直接跑完」），讓 Dijkstra 確定終點的距離，而且至少走了 8 步。', en: 'Using only “Step” (no “Play”, “Next node” or “Run to the end”), let Dijkstra fix the goal’s distance after at least 8 steps.' },
      check: function (ev) { const d = ev.data; return ev.type === 'settle' && dij(d) && d.node === d.t && d.s !== d.t && d.manual && d.k >= 8; }
    },
    {
      id: 'shortest-path-3', level: 2,
      title: { zh: '從雨港到南國', en: 'From the rainy port to the deep south' },
      desc: { zh: '在原來的權重下，用 Dijkstra 找出從基隆到屏東的最短路線。它走西部還是東部？', en: 'With the original weights, use Dijkstra to find the shortest route from Keelung to Pingtung. Does it go down the west side or the east side?' },
      check: function (ev) { const d = ev.data; return fin(ev) && tw(d) && dij(d) && d.sKey === 'keelung' && d.tKey === 'pingtung' && d.unedited; }
    },
    {
      id: 'shortest-path-4', level: 3,
      title: { zh: '臺中排第三', en: 'Taichung comes third' },
      desc: { zh: '在原來的權重下選一個起點，讓臺中成為 Dijkstra 第 3 個確定的城市（起點算第 1 個）。', en: 'With the original weights, choose a start so that Taichung is the 3rd city Dijkstra fixes (the start counts as the 1st).' },
      check: function (ev) { const d = ev.data; return ev.type === 'settle' && tw(d) && dij(d) && d.key === 'taichung' && d.ord === 3 && d.unedited; }
    },
    {
      id: 'shortest-path-5', level: 3,
      title: { zh: '見好就收', en: 'Quit while you’re ahead' },
      desc: { zh: '打開「找到終點就停」，讓 Dijkstra 跑完時確定的點不到全部的一半。', en: 'Switch on “Stop at the goal” and make Dijkstra finish having fixed fewer than half of the places.' },
      check: function (ev) { const d = ev.data; return fin(ev) && dij(d) && d.early && d.s !== d.t && d.dist !== null && d.settled * 2 < d.V; }
    },
    {
      id: 'shortest-path-6', level: 4,
      title: { zh: '少轉車不等於近', en: 'Fewer changes, longer trip' },
      desc: { zh: '在「臺灣地圖」上用「BFS（邊數最少）」跑完，讓它的路線和 Dijkstra 不同、而且總長比較長。', en: 'On the “Taiwan map”, run “BFS (fewest edges)” to the end so that its route differs from Dijkstra’s and is longer in total.' },
      check: function (ev) { const d = ev.data; return fin(ev) && tw(d) && d.algo === 'bfs' && d.pathKey !== d.dijPathKey && d.dijDist !== null && d.bfsLen > d.dijDist; }
    },
    {
      id: 'shortest-path-7', level: 5,
      title: { zh: '改走西部', en: 'Take the west side' },
      desc: { zh: '改變權重或封閉道路，讓 Dijkstra 從基隆到屏東的最短路線改走西部、經過臺中。', en: 'Change weights or close roads so that Dijkstra’s shortest route from Keelung to Pingtung goes down the west side, through Taichung.' },
      check: function (ev) {
        const d = ev.data, p = path(d);
        return fin(ev) && tw(d) && dij(d) && d.sKey === 'keelung' && d.tKey === 'pingtung' && p.indexOf(TAICHUNG) >= 0 && p.indexOf(HUALIEN) < 0;
      }
    },
    {
      id: 'shortest-path-8', level: 5,
      title: { zh: '條條大路', en: 'Many roads lead there' },
      desc: { zh: '在「方格」裡跑完一次，讓起點到終點一樣短的最短路至少有 100 條（讀數會數給你看）。', en: 'Run to the end on the “Grid” so that there are at least 100 different shortest routes from the start to the goal (the readouts count them for you).' },
      check: function (ev) { const d = ev.data; return fin(ev) && d.mode === 'grid' && d.count !== null && d.count >= 100; }
    },
    {
      id: 'shortest-path-9', level: 6,
      title: { zh: '貪心的代價', en: 'The price of greed' },
      desc: { zh: '在「負權重」裡把邊改成負的，讓 Dijkstra 跑完後至少有一個點的距離和 Bellman–Ford 的正確值不同。', en: 'In “Negative weights”, make some edges negative so that after Dijkstra finishes, at least one place’s distance differs from Bellman–Ford’s correct value.' },
      check: function (ev) { const d = ev.data; return fin(ev) && d.mode === 'neg' && dij(d) && d.wrong > 0; }
    },
    {
      id: 'shortest-path-10', level: 7,
      title: { zh: '兩條路一樣短', en: 'Two roads, equally short' },
      desc: { zh: '只改一條邊的權重（不封閉任何路），讓基隆到屏東剛好有 2 條一樣短的最短路。', en: 'Change the weight of just one edge (closing no roads) so that there are exactly 2 equally short routes from Keelung to Pingtung.' },
      check: function (ev) {
        const d = ev.data;
        return fin(ev) && tw(d) && dij(d) && d.sKey === 'keelung' && d.tKey === 'pingtung' && d.edits === 1 && d.closed === 0 && d.count === 2;
      }
    },
    {
      id: 'shortest-path-11', level: 7,
      title: { zh: '一筆畫的最短路', en: 'A shortest route that visits everyone' },
      desc: { zh: '在「方格」裡不封閉任何路、只改權重，讓 Dijkstra 從起點到終點的最短路線經過每一個點。', en: 'On the “Grid”, closing no roads and only changing weights, make Dijkstra’s shortest route from the start to the goal pass through every place.' },
      check: function (ev) { const d = ev.data; return fin(ev) && d.mode === 'grid' && dij(d) && d.closed === 0 && d.V >= 9 && d.hops === d.V - 1; }
    },

    // ---------------- 隱藏任務（提示非常隱晦；完成時只恭喜、不說原因） ----------------
    {
      id: 'shortest-path-h1', level: 3, hidden: true,
      riddle: { zh: '相隔兩站以上，卻一步也不必走。', en: 'Two or more stops away, yet not a single step to walk.' },
      check: function (ev) { const d = ev.data; return fin(ev) && d.mode !== 'neg' && dij(d) && d.s !== d.t && d.dist === 0 && !d.adjST && d.hops >= 2; }
    },
    {
      id: 'shortest-path-h2', level: 4, hidden: true,
      riddle: { zh: '近在隔壁，最快的走法卻是繞過整個街區。', en: 'Right next door, yet the quickest way is all the way round the block.' },
      check: function (ev) { const d = ev.data; return fin(ev) && tw(d) && dij(d) && d.adjST && d.hops >= 3 && d.closed === 0; }
    },
    {
      id: 'shortest-path-h3', level: 5, hidden: true,
      riddle: { zh: '一路下坡，連貪心的人也沒有走錯。', en: 'Downhill all the way, and even the greedy walker never went wrong.' },
      check: function (ev) {
        const d = ev.data;
        return fin(ev) && d.mode === 'neg' && dij(d) && !d.early && d.wrong === 0 && d.late === 0 && d.truthHops >= 3 && d.negOnPath === d.truthHops;
      }
    },
    {
      id: 'shortest-path-h4', level: 7, hidden: true,
      riddle: { zh: '來回一樣遠，風景卻不一樣。', en: 'Just as far there as back, yet the scenery is different.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!(fin(ev) && tw(d) && dij(d) && !d.early && d.s !== d.t && d.dist !== null)) return false;
        const key = d.wsig + '|' + Math.min(d.s, d.t) + '-' + Math.max(d.s, d.t);
        const seen = mem[key];
        mem[key] = { s: d.s, p: d.pathKey, dist: d.dist };
        if (!seen || seen.s === d.s || seen.dist !== d.dist) return false;
        return seen.p.split('-').reverse().join('-') !== d.pathKey;
      }
    },
    {
      id: 'shortest-path-h5', level: 6, hidden: true,
      riddle: { zh: '人人平等的棋盤上，數一數從一角到對角的走法；換個大小再數一次——兩個答案都站在同一座三角形的中線上。', en: 'On a board where every road is equal, count the ways from one corner to the other; change the size and count again — both answers stand on the centre line of the same triangle.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!(fin(ev) && d.mode === 'grid' && d.square && d.rows >= 4 && d.closed === 0 && d.allEqual && d.corners && d.count === binom(2 * d.rows - 2, d.rows - 1))) return false;
        mem['k' + d.rows] = true;
        return Object.keys(mem).filter(function (k) { return /^k\d+$/.test(k); }).length >= 2;
      }
    },
    {
      id: 'shortest-path-h6', level: 7, hidden: true,
      riddle: { zh: '這座島上最遙遠的一段友誼，要雙向奔赴。', en: 'The most distant friendship on the island has to be travelled in both directions.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!(fin(ev) && d.isDiam)) return false;
        mem['from' + d.s] = d.t;
        return Object.keys(mem).filter(function (k) { return /^from/.test(k); }).some(function (k) { const s = +k.slice(4); return mem['from' + mem[k]] === s; });
      }
    },
    {
      id: 'shortest-path-h7', level: 8, hidden: true,
      riddle: { zh: '只要兩刀，島就一分為二，而且兩邊都不小。', en: 'Just two cuts, and the island falls in two — neither half a small one.' },
      check: function (ev) { const d = ev.data; return fin(ev) && tw(d) && d.closed === 2 && d.sep && d.sideS >= 5 && d.sideT >= 5; }
    },
    {
      id: 'shortest-path-h8', level: 9, hidden: true,
      riddle: { zh: '每一次回頭張望，都看見一條更好的路。', en: 'Every time it looked again, it saw a better way.' },
      check: function (ev) { const d = ev.data; return fin(ev) && tw(d) && dij(d) && !d.early && d.closed === 0 && d.reach === d.V && d.checks > 0 && d.relax === d.checks; }
    },
    {
      id: 'shortest-path-h9', level: 10, hidden: true,
      riddle: { zh: '最慢的情況也有它的完美：沒有一輪白費，直到最後一輪。', en: 'The slowest case has a perfection of its own: not one round wasted, right up to the very last.' },
      check: function (ev) { const d = ev.data; return fin(ev) && d.mode === 'neg' && d.algo === 'bf' && d.updRounds === d.V - 1; }
    },
    {
      id: 'shortest-path-h10', level: 9, hidden: true,
      riddle: { zh: '1959 年那三頁紙上的兩個問題，讓它們長成同一棵樹。', en: 'The two problems on those three pages from 1959: make them grow into the same tree.' },
      check: function (ev) { const d = ev.data; return fin(ev) && tw(d) && d.sptMst && d.closed === 0; }
    }
  ]);
})();
