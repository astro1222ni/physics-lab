/* missions/knn.js — k 最近鄰分類的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（由 js/knn-core.js 的 Session 產生、js/knn.js 轉送，都在使用者操作之後）：
 *   'state'：使用者每做一個改變之後（放點、移除、拖曳點、載入預設資料、清空、移動查詢點、改 k、改距離、改單位、標準化）。
 *       { src（'add'／'remove'／'move'／'preset'／'clear'／'query'／'k'／'metric'／'scale'／'std'）,
 *         set（'blobs' 兩團、'three' 三團、'moons' 月牙、'checker' 棋盤、'noisy' 有雜訊；編輯過就是 'custom'）, base, edited,
 *         n, counts[3]（A、B、C 各幾個）, nClasses, majority（人數唯一最多的類，沒有就 −1）, userAll（每個點都是自己放的）, added, removed, moved,
 *         k（滑桿）, kEff（查詢點實際用的 k = min(k, n)）, metric（'euclid'／'manhattan'）, scale（x2 的單位 1／100）, std（標準化）,
 *         qx, qy（查詢點的格點座標，1 格 = 0.05）, onPoint, pred（預測類別 0／1／2）, votes[3], tie（'none'／'dist'／'first'）,
 *         nn1（最近鄰的類別）, kthD（第 k 近的距離）, nbr（k 個鄰居的點編號）,
 *         allEqual（k 個鄰居全都一樣遠）, orderSensitive（同距離時改成「後放的先選」答案會變）, lastSeat（只有最後一席是同距離在搶，而且決定了答案）,
 *         losersCloser（至少兩個落選類別的鄰居，全都比每一個勝出類別的鄰居近）, nLosers（這時落選的鄰居有幾個）, loserRatio（勝方最近的歐氏距離 ÷ 敗方最遠的歐氏距離）,
 *         key（資料的指紋）, kLoo（留一法實際用的 k = min(k, n − 1)）, loo（目前 k 的留一法正確率）, looCorrect,
 *         bestAcc, bestKs（正確率最高的 k，由小到大）, curve（每個 k 猜對幾個）, ks（k 的清單 1, 3, 5, …）,
 *         eqDist（只有兩個不同類的點時：兩點到查詢點完全一樣遠）, euRatio（同上：兩點歐氏距離的比，≥ 1） }
 *   'looStep'：留一法走了一題。{ pos, n, ok, correct, stepped（這一輪用「單步」走了幾題）, user, k, set }
 *   'looDone'：留一法走完。{ n, k, kEff, correct, acc, stepped, dist, set, metric, scale, std }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const isState = function (ev) { return ev.type === 'state'; };
  /** 只留最近幾筆紀錄，免得暫存越長越大 */
  function remember(mem, key) {
    mem.box = mem.box || {};
    mem.order = mem.order || [];
    if (!mem.box[key]) {
      mem.box[key] = {};
      mem.order.push(key);
      if (mem.order.length > 30) delete mem.box[mem.order.shift()];
    }
    return mem.box[key];
  }
  const qKey = function (d) { return d.key + '#' + d.qx + ',' + d.qy; };
  const twoBig = function (d, m) { let k = 0; d.counts.forEach(function (c) { if (c >= m) k++; }); return k >= 2; };
  /** 同一份資料、同一個 k 與距離：記下「不標準化 × 1」「不標準化 × 100」「標準化 × 100」三種的留一法正確率 */
  function scaleBox(ev, mem) {
    const d = ev.data;
    if (!isState(ev) || d.n < 10 || d.loo == null) return null;
    const e = remember(mem, d.key + '|' + d.k + '|' + d.metric);
    const tag = d.std ? (d.scale === 100 ? 'z100' : 'z1') : (d.scale === 100 ? 's100' : 's1');
    e[tag] = d.loo;
    return e;
  }

  LabMission.register('knn', [
    {
      id: 'knn-1', level: 1,
      title: { zh: '換邊站', en: 'Changing sides' },
      desc: { zh: '拖曳星形的查詢點，讓它被判成 B 類（藍色方塊）。', en: 'Drag the star-shaped query point until it is classified as B (blue squares).' },
      check: function (ev) { return isState(ev) && ev.data.src === 'query' && ev.data.pred === 1; }
    },
    {
      id: 'knn-2', level: 2,
      title: { zh: '輪流當考題', en: 'Taking turns as the test' },
      desc: { zh: '按「單步」至少 5 次，看每個點輪流被拿出來，讓其他的點來猜它。', en: 'Press “Step” at least 5 times and watch each point being taken out in turn and guessed by the others.' },
      check: function (ev) { return ev.type === 'looStep' && ev.data.stepped >= 5; }
    },
    {
      id: 'knn-3', level: 2,
      title: { zh: '問一個還是問五個', en: 'Ask one or ask five' },
      desc: { zh: '查詢點不動，讓 k = 1 和 k = 5 給出不同的答案。', en: 'Keep the query point still and make k = 1 and k = 5 give different answers.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isState(ev) || d.pred < 0 || (d.k !== 1 && d.k !== 5) || d.kEff !== d.k) return false;
        const e = remember(mem, qKey(d) + '|' + d.metric + d.scale + d.std);
        e[d.k] = d.pred;
        return e[1] != null && e[5] != null && e[1] !== e[5];
      }
    },
    {
      id: 'knn-4', level: 3,
      title: { zh: '圓形與菱形', en: 'Circle and diamond' },
      desc: { zh: '查詢點和 k 都不動，在「歐氏」和「曼哈頓」之間切換，讓兩種距離選出的鄰居不完全一樣。', en: 'Keep the query point and k fixed and switch between “Euclidean” and “Manhattan” so that the two distances pick different neighbours.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isState(ev) || d.kEff < 1) return false;
        const e = remember(mem, qKey(d) + '|' + d.k + '|' + d.scale + d.std);
        e[d.metric] = d.nbr.slice().sort(function (a, b) { return a - b; }).join(',');
        return e.euclid != null && e.manhattan != null && e.euclid !== e.manhattan;
      }
    },
    {
      id: 'knn-5', level: 3,
      title: { zh: '彎彎的月牙', en: 'Crescent moons' },
      desc: { zh: '按「月牙」，再調整「鄰居數 k」，讓留一法正確率至少 95%。（一條直線分不開這兩類，鄰居卻分得開。）', en: 'Press “Moons”, then adjust “Number of neighbours k” until the leave-one-out accuracy is at least 95%. (No straight line separates these two classes, but neighbours can.)' },
      check: function (ev) { const d = ev.data; return isState(ev) && d.src === 'k' && d.set === 'moons' && d.loo != null && d.loo >= 0.95 - 1e-9; }
    },
    {
      id: 'knn-6', level: 4,
      title: { zh: '人多就贏', en: 'Strength in numbers' },
      desc: { zh: '至少 6 個點時，把「鄰居數 k」拉到不小於點數，再把查詢點拖到人數較少那一類的點旁邊：它還是被判成人數最多的那一類。', en: 'With at least 6 points, set “Number of neighbours k” to at least the number of points, then drag the query point right next to a point of a smaller class: it is still classified as the biggest class.' },
      check: function (ev) {
        const d = ev.data;
        return isState(ev) && d.src === 'query' && d.n >= 6 && d.kEff === d.n && d.majority >= 0 && d.pred === d.majority && d.nn1 !== d.majority;
      }
    },
    {
      id: 'knn-7', level: 5,
      title: { zh: '雜訊裡的最佳 k', en: 'The best k in the noise' },
      desc: { zh: '按「有雜訊」，把「鄰居數 k」設成留一法正確率最高的值，而且這個正確率要比 k = 1 時至少高 8 個百分點。（這一份做不到，就再按一次「有雜訊」換一份。）', en: 'Press “Noisy” and set “Number of neighbours k” to the value with the highest leave-one-out accuracy — an accuracy at least 8 percentage points above that of k = 1. (If this set cannot do it, press “Noisy” again for a new one.)' },
      check: function (ev) {
        const d = ev.data;
        if (!isState(ev) || d.src !== 'k' || d.set !== 'noisy' || d.loo == null || !d.curve.length || d.k === 1) return false;
        return Math.abs(d.loo - d.bestAcc) < 1e-9 && d.bestAcc >= d.curve[0] / d.n + 0.08 - 1e-9;
      }
    },
    {
      id: 'knn-8', level: 6,
      title: { zh: '票數平手', en: 'A tied vote' },
      desc: { zh: '放三類的點，讓查詢點的投票出現平手：票數最多的類別不只一個。', en: 'Use points of three classes and make the vote at the query point a tie: more than one class has the most votes.' },
      // k 是奇數；只有兩類時奇數票不會平手，所以 kEff = k 的平手一定用到三類（點數少於 k 時的偶數票平手不算）
      check: function (ev) { const d = ev.data; return isState(ev) && d.tie !== 'none' && d.pred >= 0 && d.kEff === d.k; }
    },
    {
      id: 'knn-9', level: 7,
      title: { zh: '單位的陷阱', en: 'The unit trap' },
      desc: { zh: '按「兩團」，在同一個 k 與距離下，比較 x2 的單位「× 1」和「× 100」（都不勾「標準化」），讓留一法正確率至少差 20 個百分點。', en: 'Press “Two blobs” and, with the same k and distance, compare the unit of x2 at “× 1” and “× 100” (both without “Standardise”) so that the leave-one-out accuracies differ by at least 20 percentage points.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (d.set !== 'blobs') return false;
        const e = scaleBox(ev, mem);
        return !!e && e.s1 != null && e.s100 != null && e.s1 - e.s100 >= 0.2 - 1e-9;
      }
    },
    {
      id: 'knn-10', level: 8,
      title: { zh: '標準化救回來', en: 'Rescued by standardising' },
      desc: { zh: '找一份資料（至少 10 個點），x2 的單位從「× 1」改成「× 100」後留一法正確率掉了至少 20 個百分點；再勾選「標準化」，讓正確率回到和「× 1」時相差不到 5 個百分點。k 與距離都不要改。', en: 'Find data (at least 10 points) whose leave-one-out accuracy drops by at least 20 percentage points when the unit of x2 goes from “× 1” to “× 100”; then tick “Standardise” to bring it back within 5 points of the “× 1” value. Keep k and the distance the same.' },
      check: function (ev, mem) {
        const e = scaleBox(ev, mem);
        return !!e && e.s1 != null && e.s100 != null && e.z100 != null && e.s1 - e.s100 >= 0.2 - 1e-9 && Math.abs(e.z100 - e.s1) <= 0.05 + 1e-9;
      }
    },
    {
      id: 'knn-11', level: 9,
      title: { zh: '要問很多鄰居才準', en: 'Only many neighbours get it right' },
      desc: { zh: '按「清空資料」，自己放至少 12 個點（至少兩類各 4 個以上），讓留一法正確率最高的 k 至少是 7：也就是 k = 1、3、5 都比它差。', en: 'Press “Clear points” and place at least 12 points yourself (at least two classes with 4 or more each) so that the best leave-one-out k is at least 7: k = 1, 3 and 5 all do worse.' },
      check: function (ev) {
        const d = ev.data;
        return isState(ev) && d.userAll && d.n >= 12 && twoBig(d, 4) && d.bestKs.length > 0 && d.bestKs[0] >= 7;
      }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'knn-h1', level: 3, hidden: true,
      riddle: { zh: '兩座燈塔各照一半的海；有一條航線，兩邊的光一樣亮。站上去。', en: 'Two lighthouses each light half the sea; along one route both lights shine equally bright. Stand on it.' },
      check: function (ev) {
        const d = ev.data;
        return isState(ev) && d.src === 'query' && d.n === 2 && d.nClasses === 2 && d.metric === 'euclid' && d.kEff === 1 && d.eqDist === true;
      }
    },
    {
      id: 'knn-h2', level: 4, hidden: true,
      riddle: { zh: '離你最近的好幾位，全都在選舉中落敗。', en: 'The several standing closest to you all lost the election.' },
      // 至少 3 個落選的鄰居全都比勝方近，而且勝方最近的也遠了 1.5 倍以上（亂按時 2 個落選者太常見）
      check: function (ev) { const d = ev.data; return isState(ev) && d.losersCloser && d.nLosers >= 3 && d.loserRatio >= 1.5 && d.tie === 'none' && d.kEff === d.k; }
    },
    {
      id: 'knn-h3', level: 5, hidden: true,
      riddle: { zh: '每個人都有一票；可是誰一離席，他那一邊就輸了——人人如此。', en: 'Everyone has a vote; yet whoever leaves the room, their side loses — every single time.' },
      check: function (ev) {
        const d = ev.data;
        if (!isState(ev) || !d.userAll || d.nClasses !== 2 || d.n < 10) return false;
        const big = d.counts.filter(function (c) { return c > 0; });
        return big[0] === big[1] && d.kLoo === d.n - 1 && d.looCorrect === 0;
      }
    },
    {
      id: 'knn-h4', level: 5, hidden: true,
      riddle: { zh: '圍著你的那幾位，誰也不比誰更靠近——而且不只四位。', en: 'Those gathered around you — more than four of them — none any closer than another.' },
      check: function (ev) { const d = ev.data; return isState(ev) && d.allEqual && d.kEff >= 5; }
    },
    {
      id: 'knn-h5', level: 6, hidden: true,
      riddle: { zh: '最後一個座位，有兩位一樣遠的客人在搶；先到的坐下了，而這一席決定了結局。', en: 'Two guests, equally far, race for the very last seat; the one who came first sits down — and that seat decides the outcome.' },
      // 自己放的點、k 個座位全坐滿（亂按大量預設資料時，格點上一樣遠的點太常見）
      check: function (ev) { const d = ev.data; return isState(ev) && d.lastSeat && d.userAll && d.kEff === d.k; }
    },
    {
      id: 'knn-h6', level: 7, hidden: true,
      riddle: { zh: '每個人最親近的鄰居，都是另一國的人。', en: 'Everyone’s closest neighbour belongs to the other side.' },
      check: function (ev) { const d = ev.data; return isState(ev) && d.n >= 8 && twoBig(d, 4) && d.kLoo === 1 && d.looCorrect === 0; }
    },
    {
      id: 'knn-h7', level: 7, hidden: true,
      riddle: { zh: '換一種走路的方式，兩人之間的中立地帶，就從一條小徑變成一整片廣場。', en: 'Walk a different way, and the no-man’s-land between two people grows from a narrow path into a whole square.' },
      check: function (ev) {
        const d = ev.data;
        return isState(ev) && d.src === 'query' && d.n === 2 && d.nClasses === 2 && d.metric === 'manhattan' && d.kEff === 1 && d.eqDist === true && d.euRatio >= 1.25;
      }
    },
    {
      id: 'knn-h8', level: 8, hidden: true,
      riddle: { zh: '三方各得一票，連路程也一樣遠；最後只好看誰先報到。', en: 'Three parties, one vote each, and even the distances are the same; in the end it comes down to who arrived first.' },
      check: function (ev) {
        const d = ev.data;
        return isState(ev) && d.kEff === 3 && d.votes[0] === 1 && d.votes[1] === 1 && d.votes[2] === 1 && d.tie === 'first';
      }
    },
    {
      id: 'knn-h9', level: 9, hidden: true,
      riddle: { zh: '把其中一把尺放大，本來是陷阱；這一回，它卻成了救星。', en: 'Stretching one ruler is usually a trap; this time it comes to the rescue.' },
      check: function (ev, mem) {
        const e = scaleBox(ev, mem);
        return !!e && e.s1 != null && e.s100 != null && e.s100 - e.s1 >= 0.25 - 1e-9 && e.s100 >= 0.9 - 1e-9;
      }
    },
    {
      id: 'knn-h10', level: 10, hidden: true,
      riddle: { zh: '不管問幾位鄰居，少數人從來沒被聽見，多數人也從來沒聽錯。', en: 'However many neighbours you ask, the few are never heard and the many are never wrong.' },
      check: function (ev) {
        const d = ev.data;
        if (!isState(ev) || d.nClasses !== 2 || d.n < 10 || d.majority < 0 || d.curve.length < 5) return false;
        const minor = d.n - d.counts[d.majority];
        return minor >= 2 && d.curve.every(function (v) { return v === d.counts[d.majority]; });
      }
    }
  ]);
})();
