/* missions/packet-routing.js — 網路封包與路由的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/packet-routing.js 轉送核心 World 的事件，都在使用者按「傳送訊息」「追蹤路由」、選距離向量等操作之後）：
 *   'delivered'：伺服器收齊整封訊息。'finished'：電腦收齊所有確認（之後才可能發現多餘的重送）。兩者資料相同：
 *       { algo（'ls'／'dv'）, net, k（每包字數）, M（字數）, P（封包數）, ttl, loss（%）, time（送達 ms）, finish, retx（重送次數）, sent,
 *         lost:{cut, ttl, loss, noroute}（資料封包遺失原因）, lostData, lostAll（含確認）, ooo（亂序到達數）, dup,
 *         paths（第一次到達的封包走過幾種不同的路）, path（只有一種路時，例如 'PC>R1>R4>…>SV'）, hops（路由器數）,
 *         pathDelay（那條路的延遲和）, lsDelay（連結狀態最短延遲）, ttlMin, ttlMax（到達時剩下的 TTL）, looped, loopDelivered,
 *         hamilton（有封包剛好經過每台路由器一次）, lastFirst（P ≥ 3 且最後一包最先到）, firstSeq, msg, cutOnIntact（原本的路上有線被切斷）,
 *         costEdited, topo（傳送時的連線狀態代碼）, topoChanged（傳送中連線有變）, bestKs, bestTime（這條路上最快的每包字數與時間）, split, auto }
 *   'failed'：同一包重送太多次，放棄。{ algo, net, msg, text（已依序收到的部分）, P, k, partition, accessCut, routerCuts, minCut, topo, time, delivered }
 *   'dropped'：資料封包被丟掉或遺失。{ reason（'ttl'／'noroute'／'cut'／'loss'）, looped, algo, ttl, at, seq }
 *   'trace'：追蹤路由結束。{ algo, net, topoChanged（追蹤途中連線有變）, reached, lines, names, repeat（同一台路由器出現兩次以上）, routers, split, auto, loss }
 *   'dv'：距離向量交換了一輪。{ round, converged, climb, climbSv（到伺服器的距離一路數到 16 的輪數）, split, auto, manual, net }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const is = function (ev, t) { return ev.type === t; };
  const clean = function (d) { return d.paths === 1 && !d.topoChanged && d.retx === 0 && d.lostAll === 0 && d.loss === 0; };

  LabMission.register('packet-routing', [
    {
      id: 'packet-routing-1', level: 1,
      title: { zh: '第一封訊息', en: 'Your first message' },
      desc: { zh: '按「傳送訊息」，讓伺服器收到完整的訊息。', en: 'Press “Send message” and let the server receive the whole message.' },
      check: function (ev) { return is(ev, 'delivered'); }
    },
    {
      id: 'packet-routing-2', level: 2,
      title: { zh: '一站一站回報', en: 'Reporting hop by hop' },
      desc: { zh: '按「追蹤路由」，一路追到伺服器回應為止。', en: 'Press “Traceroute” and follow it all the way until the server answers.' },
      check: function (ev) { return is(ev, 'trace') && ev.data.reached; }
    },
    {
      id: 'packet-routing-3', level: 3,
      title: { zh: '看著路由表收斂', en: 'Watching the tables converge' },
      desc: { zh: '選「距離向量（RIP）」並取消「自動交換」，一直按「交換一輪」，直到路由表不再改變。', en: 'Choose “Distance vector (RIP)”, untick “Auto exchange”, and keep pressing “Exchange once” until the routing tables stop changing.' },
      check: function (ev, mem) {
        if (!is(ev, 'dv')) return false;
        const d = ev.data;
        if (!d.manual) { mem.prog = false; return false; }
        if (!d.converged) { mem.prog = true; return false; }
        return !!mem.prog;
      }
    },
    {
      id: 'packet-routing-4', level: 3,
      title: { zh: '此路不通，請繞道', en: 'Road closed, take a detour' },
      desc: { zh: '「切斷」原本路徑上的一條線，再按「傳送訊息」，訊息仍然完整送達。', en: '“Cut” a link on the original route, then press “Send message”; the whole message still arrives.' },
      check: function (ev) { return is(ev, 'delivered') && ev.data.cutOnIntact; }
    },
    {
      id: 'packet-routing-5', level: 3,
      title: { zh: 'TTL 用完了', en: 'Out of TTL' },
      desc: { zh: '把「TTL」調得比路上的路由器數還少，讓資料封包在半路被丟掉。', en: 'Set “TTL” lower than the number of routers on the way, so that data packets are dropped halfway.' },
      check: function (ev) { return is(ev, 'dropped') && ev.data.reason === 'ttl' && !ev.data.looped; }
    },
    {
      id: 'packet-routing-6', level: 4,
      title: { zh: '半路斷線', en: 'Cut in mid-flight' },
      desc: { zh: '封包還在線上時「切斷」那條線，訊息最後仍然完整送達。', en: '“Cut” a link while a packet is travelling along it; the whole message still arrives in the end.' },
      check: function (ev) { return is(ev, 'delivered') && ev.data.lost.cut >= 1; }
    },
    {
      id: 'packet-routing-7', level: 4,
      title: { zh: '先寄的後到', en: 'Sent first, arrived later' },
      desc: { zh: '讓封包不照順序到達伺服器（接收端要重新排好），而且訊息完整送達。', en: 'Make packets reach the server out of order (the receiver has to put them back in order) while the whole message still arrives.' },
      check: function (ev) { return is(ev, 'delivered') && ev.data.ooo >= 1; }
    },
    {
      id: 'packet-routing-8', level: 5,
      title: { zh: '兩種地圖，兩條路', en: 'Two maps, two routes' },
      desc: { zh: '連線不變，用「連結狀態（OSPF）」和「距離向量（RIP）」各傳送一次訊息，兩次走的路不一樣。', en: 'Without changing the links, send the message once with “Link state (OSPF)” and once with “Distance vector (RIP)”, and see them take different routes.' },
      check: function (ev, mem) {
        if (!is(ev, 'delivered')) return false;
        const d = ev.data;
        if (d.paths !== 1 || d.topoChanged) return false;
        const r = mem[d.topo] = mem[d.topo] || {};
        r[d.algo] = d.path;
        return !!(r.ls && r.dv && r.ls !== r.dv);
      }
    },
    {
      id: 'packet-routing-9', level: 5,
      title: { zh: 'TTL 剛剛好', en: 'Just enough TTL' },
      desc: { zh: '調「TTL」，讓每個封包抵達伺服器時 TTL 都剛好剩 1。', en: 'Adjust “TTL” so that every packet reaches the server with exactly 1 left.' },
      check: function (ev) { return is(ev, 'delivered') && ev.data.ttlMin === 1 && ev.data.ttlMax === 1; }
    },
    {
      id: 'packet-routing-10', level: 6,
      title: { zh: '一分為二', en: 'Split in two' },
      desc: { zh: '只「切斷」路由器之間的線，把網路切成兩半，讓訊息怎麼重送都送不到（電腦和伺服器自己的線不可以切）。', en: '“Cut” only links between routers to split the network in two, so the message cannot get through however often it is resent (do not cut the computer’s or the server’s own link).' },
      check: function (ev) { const d = ev.data; return is(ev, 'failed') && d.partition && !d.accessCut && !d.delivered; }
    },
    {
      id: 'packet-routing-11', level: 7,
      title: { zh: '繞圈圈的封包', en: 'Going round in circles' },
      desc: { zh: '用「距離向量（RIP）」做出路由迴圈，讓資料封包在迴圈裡繞到 TTL 歸零。', en: 'Use “Distance vector (RIP)” to create a routing loop, and let a data packet go round it until its TTL runs out.' },
      check: function (ev) { const d = ev.data; return is(ev, 'dropped') && d.reason === 'ttl' && d.looped && d.algo === 'dv'; }
    },
    {
      id: 'packet-routing-12', level: 9,
      title: { zh: '最佳封包大小', en: 'The best packet size' },
      desc: { zh: '網路、路由、訊息都不變，找出讓整封訊息最快送達的「每包字數」，而且比它小、比它大的也各試一次（不要開遺失率）。', en: 'Keeping the network, routing and message the same, find the “Characters per packet” that delivers the whole message soonest, and also try one smaller and one larger value (keep the loss rate at 0).' },
      check: function (ev, mem) {
        if (!is(ev, 'delivered')) return false;
        const d = ev.data;
        if (!clean(d) || !d.bestKs || !d.bestKs.length) return false;
        const key = d.topo + '|' + d.algo + '|' + d.msg + '|' + d.path;
        const r = mem[key] = mem[key] || {};
        r[d.k] = d.time;
        const ks = Object.keys(r).map(Number);
        const lo = Math.min.apply(null, d.bestKs), hi = Math.max.apply(null, d.bestKs);
        return ks.some(function (k) { return d.bestKs.indexOf(k) >= 0; }) && ks.some(function (k) { return k < lo; }) && ks.some(function (k) { return k > hi; });
      }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'packet-routing-h1', level: 3, hidden: true,
      riddle: { zh: '每一封信的信封，都和信紙一樣重。', en: 'Every envelope weighs exactly as much as the letter inside it.' },
      check: function (ev) { const d = ev.data; return is(ev, 'delivered') && d.P >= 2 && d.k === 4 && d.M % 4 === 0; }
    },
    {
      id: 'packet-routing-h2', level: 4, hidden: true,
      riddle: { zh: '數站數的人選了捷徑，看帳單的人笑了：你剛好多付了一倍。', en: 'The one who counts the stops took the shortcut. The one who reads the bill laughed: you paid exactly twice as much.' },
      check: function (ev) {
        const d = ev.data;
        return is(ev, 'delivered') && d.algo === 'dv' && d.paths === 1 && !d.topoChanged && d.costEdited && d.lsDelay > 0 && d.pathDelay === 2 * d.lsDelay;
      }
    },
    {
      id: 'packet-routing-h3', level: 5, hidden: true,
      riddle: { zh: '沒有人失約，只是等的人太心急。', en: 'Nobody broke the promise; the one waiting was simply too impatient.' },
      check: function (ev) { const d = ev.data; return is(ev, 'finished') && d.retx >= 1 && d.lostAll === 0 && !d.looped && !d.topoChanged; }
    },
    {
      id: 'packet-routing-h4', level: 6, hidden: true,
      riddle: { zh: '它在同一個路口經過了兩次，最後還是回到了正確的路上。', en: 'It passed the same crossroads twice, yet still found its way in the end.' },
      check: function (ev) { const d = ev.data; return is(ev, 'delivered') && d.algo === 'dv' && d.loopDelivered && !d.topoChanged; }
    },
    {
      id: 'packet-routing-h5', level: 7, hidden: true,
      riddle: { zh: '它拜訪了每一個路口，每個只去一次，才把信送到。', en: 'It called at every crossroads, each exactly once, before it delivered the letter.' },
      check: function (ev) { return is(ev, 'delivered') && ev.data.hamilton; }
    },
    {
      id: 'packet-routing-h6', level: 7, hidden: true,
      riddle: { zh: '最後出發的，最先抵達。', en: 'The last to leave was the first to arrive.' },
      check: function (ev) { const d = ev.data; return is(ev, 'delivered') && d.lastFirst && d.retx === 0 && d.lostData === 0; }
    },
    {
      id: 'packet-routing-h7', level: 8, hidden: true,
      riddle: { zh: '兩個鄰居互相指路，越指越遠，一直數到「無限大」才停。', en: 'Two neighbours kept giving each other directions, further and further, and only stopped when they had counted to infinity.' },
      check: function (ev) { const d = ev.data; return is(ev, 'dv') && !d.split && d.climbSv >= 10; }
    },
    {
      id: 'packet-routing-h8', level: 8, hidden: true,
      riddle: { zh: '剪斷最少的線，讓兩岸從此不相往來。', en: 'Cut the fewest threads, and the two shores never speak again.' },
      check: function (ev) {
        const d = ev.data;
        return is(ev, 'failed') && d.partition && !d.accessCut && !d.delivered && d.routerCuts === d.minCut && d.net !== 'ring';
      }
    },
    {
      id: 'packet-routing-h9', level: 9, hidden: true,
      riddle: { zh: '1969 年秋天，一台電腦想對遠方說一個五個字母的詞，只說出前兩個，遠方就倒下了。讓歷史重演。', en: 'In the autumn of 1969, one computer tried to say a five-letter word to a distant one. Only the first two letters got through before the far end collapsed. Let history repeat itself.' },
      check: function (ev) { const d = ev.data; return is(ev, 'failed') && String(d.msg).toUpperCase() === 'LOGIN' && String(d.text).toUpperCase() === 'LO'; }
    },
    {
      id: 'packet-routing-h10', level: 10, hidden: true,
      riddle: { zh: '點名的時候，有一位答了兩次「有」。', en: 'At roll call, someone answered “present” twice.' },
      check: function (ev) { const d = ev.data; return is(ev, 'trace') && d.repeat && d.algo === 'dv' && !d.topoChanged && !d.reached; }
    }
  ]);
})();
