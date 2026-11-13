/* missions/graph-traversal.js — 圖的走訪：DFS 與 BFS 走迷宮的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 本檔不依賴計算核心（排行榜頁只載入任務檔）。
 * 事件（js/graph-traversal.js 發出，都在使用者按「單步」「播放」「直接跑完」之後；載入、拖曳起點終點、改設定都不觸發）：
 *   'found'：迷宮裡某一個演算法在這一步找到終點（DFS：終點被推進堆疊；BFS：終點被排進佇列）。
 *       { mode: 'maze', algo（'dfs'／'bfs'）, manual（這次執行到目前為止只按過「單步」「上一步」）, k（這個演算法走到第幾步找到）,
 *         path（找到的路長）, visited（找到時已拜訪的格數） }
 *   'finish'：DFS 和 BFS 都走到最後一步。
 *     迷宮：{ mode: 'maze', manual, n（邊長）, cells, gen（'dfs' 隨機 DFS／'prim' 隨機 Prim／'open' 空地）, seed, loops（打通牆 %）, edits（手畫切換牆的次數）,
 *         order（鄰居順序，例如 'NESW'）, early（找到終點就停）, s, t（格子編號 = 列 × n + 行）, adjST（起點與終點之間直接相通）,
 *         E（通道數）, walls（內牆數）, comps（連通塊數）, connected, isTree, cycles（獨立迴路數 E − N + C）, onCycle（只有一個環，而且起點和終點都在環上）,
 *         reach（起點走得到的格數）, branch（走得到的格子裡，岔路口〔三條以上通道〕的個數）, found（找到終點）,
 *         radius, ecc, isCenter（迷宮是樹時：樹的半徑、起點的離心率、起點是不是樹的中心）, sameOrder（兩者都完整走訪而且拜訪順序完全相同）, sig（迷宮的指紋）,
 *         dfs: { visited, steps, pops（退回次數）, popsBefore（找到終點前的退回次數）, maxStack, path, checks, foundStep },
 *         bfs: { visited, steps, maxQueue, path, checks, depth（最遠一層）, foundStep } }
 *     一般圖：{ mode: 'graph', manual, preset（'sample'／'random'）, V, E, s, rev（鄰居順序倒過來）, edits（點鄰接矩陣切換邊的次數）,
 *         comps, sizes, connected, reach, blockDiag（每個連通塊都是一段連續的字母：鄰接矩陣排成對角線上的方塊）,
 *         isTree, complete（完全圖）, ring, orderD, orderB（拜訪順序的字母）, sameOrder, sameTree（DFS 樹和 BFS 樹的每一條邊都相同）,
 *         depthD, depthB（兩棵樹的深度）, maxStack, maxQueue, sig }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const fin = function (ev) { return ev.type === 'finish'; };
  const maze = function (ev) { return fin(ev) && ev.data.mode === 'maze'; };
  const graph = function (ev) { return fin(ev) && ev.data.mode === 'graph'; };

  LabMission.register('graph-traversal', [
    {
      id: 'graph-traversal-1', level: 1,
      title: { zh: '走出迷宮', en: 'Out of the maze' },
      desc: { zh: '在「迷宮」裡讓 DFS 和 BFS 都走到最後一步（可以按「直接跑完」），兩者都找到終點。', en: 'In the “Maze”, let DFS and BFS both run to their last step (you may press “Run to the end”) and both reach the goal.' },
      check: function (ev) { return maze(ev) && ev.data.found; }
    },
    {
      id: 'graph-traversal-2', level: 2,
      title: { zh: '一步一腳印', en: 'One step at a time' },
      desc: { zh: '只按「單步」（不按「播放」「直接跑完」），讓 DFS 走到終點，而且至少走了 20 步。', en: 'Using only “Step” (no “Play” or “Run to the end”), let DFS reach the goal after at least 20 steps.' },
      check: function (ev) { const d = ev.data; return ev.type === 'found' && d.algo === 'dfs' && d.manual && d.k >= 20; }
    },
    {
      id: 'graph-traversal-3', level: 2,
      title: { zh: '換一種圖', en: 'A different kind of graph' },
      desc: { zh: '按「一般圖」，讓 DFS 和 BFS 都跑完，比較兩種拜訪順序。', en: 'Press “Graph”, let DFS and BFS both finish, and compare the two visiting orders.' },
      check: function (ev) { return graph(ev); }
    },
    {
      id: 'graph-traversal-4', level: 3,
      title: { zh: '此路不通', en: 'No way through' },
      desc: { zh: '用「畫牆」把終點圍起來，讓 DFS 和 BFS 都跑完卻找不到終點。', en: 'Use “Draw walls” to wall the goal in, so that DFS and BFS both finish without finding it.' },
      check: function (ev) { return maze(ev) && !ev.data.found && ev.data.edits >= 1; }
    },
    {
      id: 'graph-traversal-5', level: 3,
      title: { zh: '斷了聯絡', en: 'Out of touch' },
      desc: { zh: '在「一般圖」點鄰接矩陣的格子拿掉幾條邊，讓起點走不到的點至少有 3 個，再讓兩者都跑完。', en: 'In “Graph”, click cells of the adjacency matrix to remove some edges so that at least 3 vertices cannot be reached from the start, then let both finish.' },
      check: function (ev) { const d = ev.data; return graph(ev) && d.V - d.reach >= 3; }
    },
    {
      id: 'graph-traversal-6', level: 4,
      title: { zh: '一路順風', en: 'Never looking back' },
      desc: { zh: '讓 DFS 一次都沒有退回就走到終點，而且找到的路長至少 30。', en: 'Let DFS reach the goal without backing up even once, along a path of length at least 30.' },
      check: function (ev) { const d = ev.data; return maze(ev) && d.found && d.dfs.popsBefore === 0 && d.dfs.path >= 30; }
    },
    {
      id: 'graph-traversal-7', level: 4,
      title: { zh: '順序很重要', en: 'Order matters' },
      desc: { zh: '同一座迷宮、同樣的起點和終點，打開「找到終點就停」，換一種「鄰居順序」再跑一次，讓 DFS 拜訪的格數差 2 倍以上。', en: 'Same maze, same start and goal, with “Stop at the goal” on: switch to another “Neighbour order” and run again so that the number of cells DFS visits differs by a factor of 2 or more.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!maze(ev) || !d.early || !d.found) return false;
        const key = d.sig + '|' + d.s + '|' + d.t;
        if (mem.key !== key) { mem.key = key; mem.v = {}; }
        mem.v[d.order] = d.dfs.visited;
        return Object.keys(mem.v).some(function (o) {
          const a = mem.v[o], b = d.dfs.visited;
          return o !== d.order && (a >= 2 * b || b >= 2 * a);
        });
      }
    },
    {
      id: 'graph-traversal-8', level: 5,
      title: { zh: '繞遠路', en: 'The long way round' },
      desc: { zh: '在有迴路的迷宮裡（用「打通牆」或「空地」），讓 DFS 找到的路長至少是 BFS 的 2 倍，而且 BFS 的路長至少 10。', en: 'In a maze with loops (use “Open up walls” or “Open field”), make DFS’s path at least twice as long as BFS’s, with BFS’s path at least 10.' },
      check: function (ev) { const d = ev.data; return maze(ev) && d.found && d.bfs.path >= 10 && d.dfs.path >= 2 * d.bfs.path; }
    },
    {
      id: 'graph-traversal-9', level: 5,
      title: { zh: '長長的隊伍', en: 'A long queue' },
      desc: { zh: '讓 BFS 的佇列在某一刻排了至少 40 格。', en: 'Make BFS’s queue hold at least 40 cells at some moment.' },
      check: function (ev) { return maze(ev) && ev.data.bfs.maxQueue >= 40; }
    },
    {
      id: 'graph-traversal-10', level: 6,
      title: { zh: '深不見底', en: 'Bottomless' },
      desc: { zh: '讓 DFS 的堆疊在某一刻疊了至少 1000 格。', en: 'Make DFS’s stack hold at least 1000 cells at some moment.' },
      check: function (ev) { return maze(ev) && ev.data.dfs.maxStack >= 1000; }
    },
    {
      id: 'graph-traversal-11', level: 7,
      title: { zh: '平分秋色', en: 'Neck and neck' },
      desc: { zh: '打開「找到終點就停」，讓 DFS 和 BFS 找到終點時拜訪的格數一樣多，而且至少 30 格。', en: 'With “Stop at the goal” on, make DFS and BFS visit exactly the same number of cells, at least 30, by the time they find the goal.' },
      check: function (ev) { const d = ev.data; return maze(ev) && d.early && d.found && d.dfs.visited === d.bfs.visited && d.dfs.visited >= 30; }
    },
    {
      id: 'graph-traversal-12', level: 8,
      title: { zh: '最後一個才找到', en: 'Found last of all' },
      desc: { zh: '打開「找到終點就停」，在邊長至少 10 的迷宮裡選一個終點，讓 BFS 拜訪完所有走得到的格子，才終於找到它。', en: 'With “Stop at the goal” on, in a maze of side at least 10, choose a goal that BFS finds only after visiting every reachable cell.' },
      check: function (ev) { const d = ev.data; return maze(ev) && d.early && d.found && d.n >= 10 && d.bfs.visited === d.reach; }
    },

    // ======================= 隱藏任務（只顯示謎語；判定寫在註解） =======================
    {
      id: 'graph-traversal-h1', level: 3, hidden: true,
      riddle: { zh: '在人人互相認識的聚會上，深入的那位把大家牽成長長的一列，博覽的那位卻讓所有人圍著自己站成一圈。', en: 'At a party where everyone knows everyone, the deep one leads them all off in one long line, while the broad one has them all gather round in a single ring.' },
      // 判定：在 7 個點以上的完全圖上跑完：DFS 樹是一條長鏈（深度 V − 1），BFS 樹是一顆星（深度 1）。
      check: function (ev) { const d = ev.data; return graph(ev) && d.complete && d.V >= 7; }
    },
    {
      id: 'graph-traversal-h2', level: 4, hidden: true,
      riddle: { zh: '消息從空地的正中央傳開，每一刻剛聽到的人都站成一個圓——一個有四個角的圓。讓它一直傳到天涯海角。', en: 'News spreads from the very middle of an open square; at every moment, those who have just heard it stand in a circle — a circle with four corners. Let it travel to the ends of the earth.' },
      // 判定：在奇數邊長（至少 7）、沒有任何內牆的空地上，從正中央那一格出發完整走訪：BFS 一層一層的「圓」是菱形（計程車幾何），最後一層是四個角落。
      check: function (ev) { const d = ev.data; return maze(ev) && d.gen === 'open' && d.walls === 0 && d.n % 2 === 1 && d.n >= 7 && !d.early && d.s === (d.n * d.n - 1) / 2; }
    },
    {
      id: 'graph-traversal-h3', level: 5, hidden: true,
      riddle: { zh: '黑白相間的地板上，繞路的人總是成雙地多走——這一回，只多了最小的那一雙。', en: 'On a black-and-white floor, whoever takes a detour always walks the extra steps in pairs — this time, just the smallest pair.' },
      // 判定：邊長至少 8、連通而且只有一個迴路的迷宮，起點和終點不都在環上（環在路的中間），BFS 的路長至少 10，DFS 的路剛好多 2。
      // 方格是二部圖（黑白相間），同兩格之間每一條路的長度奇偶相同，所以繞路多走的步數一定是偶數；2 是最小的「一雙」。
      check: function (ev) { const d = ev.data; return maze(ev) && d.found && d.n >= 8 && d.connected && d.cycles === 1 && !d.onCycle && d.bfs.path >= 10 && d.dfs.path - d.bfs.path === 2; }
    },
    {
      id: 'graph-traversal-h4', level: 6, hidden: true,
      riddle: { zh: '1950 年，一位忒修斯在二十五個房間裡摸索，隔間是主人親手搬的。替牠蓋一座，看牠碰了壁、回頭，還是找到了出口。', en: 'In 1950 a Theseus felt its way through twenty-five rooms whose partitions its master moved by hand. Build it one, and watch it hit a wall, turn back, and still find the way out.' },
      // 判定：Shannon 的機器老鼠「忒修斯」（1950）走的是 5 × 5 的迷宮：在 5 × 5 的空地上親手畫至少 6 面牆，讓 DFS 退回至少一次之後仍然找到終點。
      check: function (ev) { const d = ev.data; return maze(ev) && d.n === 5 && d.gen === 'open' && d.walls >= 6 && d.found && d.dfs.popsBefore >= 1; }
    },
    {
      id: 'graph-traversal-h5', level: 6, hidden: true,
      riddle: { zh: '棋盤上有兩座互不往來的城堡，各自占著一個角落，城裡都熱熱鬧鬧。', en: 'On the chequerboard stand two castles that never visit each other, each holding a corner of its own, each one bustling inside.' },
      // 判定：讓一般圖（6 個點以上）恰好分成兩個連通塊，每塊至少 3 個點，而且每塊都是一段連續的字母：鄰接矩陣排成對角線上的兩個方塊，方塊外全是 0。
      check: function (ev) { const d = ev.data; return graph(ev) && d.V >= 6 && d.comps === 2 && d.blockDiag && Math.min.apply(null, d.sizes) >= 3; }
    },
    {
      id: 'graph-traversal-h6', level: 7, hidden: true,
      riddle: { zh: '在一片空地上親手砌牆，每一道都恰到好處：少一道，就有路繞成了圈；多一道，就有人回不了家。', en: 'On an open field, lay every wall yourself, each one just right: one fewer and some path loops back on itself; one more and someone can never get home.' },
      // 判定：從邊長至少 6 的空地開始手畫牆，畫成一棵生成樹：每一格都走得到，而且沒有任何迴路（通道數 = 格子數 − 1）。
      check: function (ev) { const d = ev.data; return maze(ev) && d.gen === 'open' && d.n >= 6 && d.isTree; }
    },
    {
      id: 'graph-traversal-h7', level: 8, hidden: true,
      riddle: { zh: '一位走得深、一位看得廣，說故事的順序不一樣，畫出的族譜卻一模一樣。', en: 'One goes deep, one looks wide; they tell the story in a different order, yet draw exactly the same family tree.' },
      // 判定：在 8 個點以上的連通圖上，讓 DFS 樹和 BFS 樹完全相同，但拜訪順序不同。定理：從同一點出發兩棵樹相同，圖本身就一定是那棵樹。
      check: function (ev) { const d = ev.data; return graph(ev) && d.connected && d.V >= 8 && d.sameTree && d.orderD !== d.orderB; }
    },
    {
      id: 'graph-traversal-h8', level: 8, hidden: true,
      riddle: { zh: '全城只有一個圓環，你和她隔著它對望；深入的那位偏偏挑了遠的那半圈。', en: 'There is just one ring road in the whole town, and you and she look at each other across it; the deep one, of course, takes the far half.' },
      // 判定：邊長至少 8 的迷宮連通而且剛好只有一個迴路，起點和終點都在這個環上，DFS 走了環上較遠的那一半，路比 BFS 長。
      check: function (ev) { const d = ev.data; return maze(ev) && d.n >= 8 && d.connected && d.cycles === 1 && d.onCycle && d.found && d.dfs.path > d.bfs.path; }
    },
    {
      id: 'graph-traversal-h9', level: 9, hidden: true,
      riddle: { zh: '1869 年有人證明：每一棵樹都有一顆心，最多兩顆。在迷宮裡找到它，從那裡把整座迷宮走遍。', en: 'In 1869 someone proved that every tree has a heart — two at most. Find it in the maze, and from there walk the whole maze.' },
      // 判定：在邊長至少 10、本身是樹的迷宮裡，把起點放在樹的中心（離最遠的格子最近的那一格；Jordan 1869：中心是一格或相鄰的兩格），關掉「找到終點就停」完整走訪。
      check: function (ev) { const d = ev.data; return maze(ev) && d.isTree && !d.early && d.n >= 10 && d.isCenter; }
    },
    {
      id: 'graph-traversal-h10', level: 10, hidden: true,
      riddle: { zh: '深思的與博覽的，竟一字不差地念出同一份名單；而那座城並不只有一條街。', en: 'The deep thinker and the wide reader recite the very same roll call, word for word — and that town has more than one street.' },
      // 判定：關掉「找到終點就停」，在邊長至少 8 的迷宮裡，讓 DFS 和 BFS 完整走訪至少 24 格，拜訪順序完全相同，而且走得到的格子裡至少有 3 個岔路口。例如梳子形：主幹上每一格只長一根短齒，鄰居順序讓齒排在主幹的下一格前面。
      check: function (ev) { const d = ev.data; return maze(ev) && !d.early && d.n >= 8 && d.reach >= 24 && d.branch >= 3 && d.sameOrder; }
    }
  ]);
})();
