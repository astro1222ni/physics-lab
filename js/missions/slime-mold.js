/* missions/slime-mold.js — 黏菌找路的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2）
 * 事件（js/slime-mold.js 送出）：
 *   'maze'：第一部分穩定下來（或跑太久停下）時。mu、noise、W、H、loops、cells、moved（食物不在預設的兩個角落）、converged、
 *           connected、single（剛好剩一條從 A 到 B 的路）、len（那條路的格數）、shortest、second（第二短的路線）、nShortest（最短路線有幾條）、
 *           cyc（剩下的獨立環路數）、isShortest、onShortOnly（剩下的管子都在某條最短路線上）、t
 *   'net'：第二部分穩定下來時。cities、ids、default15（鐵路 15 城）、all17、I0、gamma、M（山區阻力）、converged、connected、
 *          TL、MD（km）、FT、TLr、MDr（÷ 最小生成樹）、railTL、railMD、railFT（鐵路 15 城時才有）、beatRail、maxH（管子經過的最高示意高度）、
 *          east（有花蓮或臺東）、west（有西部城市）、t
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const maze = function (ev) { return ev.type === 'maze' && ev.data.converged; };
  const net = function (ev) { return ev.type === 'net' && ev.data.converged && ev.data.connected; };
  const mu1 = function (d) { return Math.abs(d.mu - 1) < 0.005; };

  LabMission.register('slime-mold', [
    {
      id: 'slime-mold-1', level: 1,
      title: { zh: '縮成一條路', en: 'Down to one route' },
      desc: { zh: '讓黏菌（μ = 1）在迷宮裡長到穩定，只剩下一條連接兩片燕麥的路。', en: 'Let the slime mould (μ = 1) grow in the maze until it settles on a single route between the two oat flakes.' },
      check: function (ev) { const d = ev.data; return maze(ev) && mu1(d) && d.single; }
    },
    {
      id: 'slime-mold-2', level: 2,
      title: { zh: '換個地方吃', en: 'Dinner elsewhere' },
      desc: { zh: '把燕麥片拖到別的格子（不是原本的兩個角落），μ = 1 的黏菌穩定後只剩一條路，而且是最短的那條。', en: 'Drag the oat flakes to other cells (not the two starting corners); with μ = 1 the mould settles on one route, and it is the shortest.' },
      check: function (ev) { const d = ev.data; return maze(ev) && mu1(d) && d.moved && d.single && d.isShortest; }
    },
    {
      id: 'slime-mold-3', level: 2,
      title: { zh: '連起所有城市', en: 'Join the cities' },
      desc: { zh: '在至少 8 個城市放食物，讓黏菌在臺灣長到穩定，所有城市都連在一起。', en: 'Put food on at least 8 cities and let the mould grow across Taiwan until it settles with every city connected.' },
      check: function (ev) { const d = ev.data; return net(ev) && d.cities >= 8; }
    },
    {
      id: 'slime-mold-4', level: 3,
      title: { zh: '只差兩步', en: 'Two steps apart' },
      desc: { zh: '找一個迷宮，最短路線至少 24 格、第二短的路線只多 2 格以內；μ = 1 的黏菌還是只留下最短的那條。', en: 'Find a maze whose shortest route is at least 24 cells and whose next shortest is at most 2 cells longer; with μ = 1 the mould still keeps only the shortest.' },
      check: function (ev) { const d = ev.data; return maze(ev) && mu1(d) && d.single && d.isShortest && d.shortest >= 24 && d.nShortest === 1 && d.second - d.shortest <= 2; }
    },
    {
      id: 'slime-mold-5', level: 4,
      title: { zh: '不只一條路', en: 'More than one way' },
      desc: { zh: '把 μ 調到 0.7 以下，黏菌穩定後還留著至少 2 個環路（好幾條路線一起分攤流量）。', en: 'Set μ to 0.7 or less and let the mould settle with at least 2 loops left (several routes sharing the flow).' },
      check: function (ev) { const d = ev.data; return maze(ev) && d.mu <= 0.7 && d.connected && d.cyc >= 2; }
    },
    {
      id: 'slime-mold-6', level: 4,
      title: { zh: '最省的樹', en: 'The leanest tree' },
      desc: { zh: '山區阻力至少 2、至少 10 個城市：讓黏菌長成一棵樹（容錯 0），總長不超過最小生成樹的 1.03 倍。', en: 'With mountain resistance at least 2 and at least 10 cities, let the mould grow into a tree (fault tolerance 0) no more than 1.03 times the length of the minimum spanning tree.' },
      check: function (ev) { const d = ev.data; return net(ev) && d.M >= 2 && d.cities >= 10 && d.FT < 0.05 && d.TLr <= 1.03; }
    },
    {
      id: 'slime-mold-7', level: 5,
      title: { zh: '二選一', en: 'Pick one' },
      desc: { zh: '找一個有兩條以上一樣短路線的迷宮，把 μ 調到 1.3 以上：黏菌穩定後只留下其中一條。', en: 'Find a maze with two or more equally short routes and set μ to 1.3 or more: the mould settles on just one of them.' },
      check: function (ev) { const d = ev.data; return maze(ev) && d.mu >= 1.3 && d.nShortest >= 2 && d.single && d.isShortest; }
    },
    {
      id: 'slime-mold-8', level: 5,
      title: { zh: '繞過中央山脈', en: 'Around the Central Range' },
      desc: { zh: '食物至少 6 個城市，東部（花蓮或臺東）和西部都要有：所有城市連在一起，但管子都不經過示意高度 0.35 以上的山區。', en: 'Put food on at least 6 cities, in both the east (Hualien or Taitung) and the west: every city is connected, yet no tube climbs above height 0.35.' },
      check: function (ev) { const d = ev.data; return net(ev) && d.cities >= 6 && d.east && d.west && d.maxH <= 0.35; }
    },
    {
      id: 'slime-mold-9', level: 6,
      title: { zh: '有備援的網', en: 'A network with a spare' },
      desc: { zh: '至少 10 個城市：黏菌網的容錯至少 90%，總長卻不超過最小生成樹的 1.35 倍。', en: 'With at least 10 cities, grow a network with fault tolerance at least 90% that is no more than 1.35 times the length of the minimum spanning tree.' },
      check: function (ev) { const d = ev.data; return net(ev) && d.cities >= 10 && d.FT >= 0.9 && d.TLr <= 1.35; }
    },
    {
      id: 'slime-mold-10', level: 7,
      title: { zh: '大迷宮', en: 'The big maze' },
      desc: { zh: '迷宮至少 300 格、多拆至少 20 面牆，最短路線只有一條、第二短只多 2 格以內：μ = 1 的黏菌只留下最短的那條。', en: 'In a maze of at least 300 cells with at least 20 extra openings, a unique shortest route and a next shortest at most 2 cells longer, the μ = 1 mould keeps only the shortest.' },
      check: function (ev) { const d = ev.data; return maze(ev) && mu1(d) && d.cells >= 300 && d.loops >= 20 && d.nShortest === 1 && d.single && d.isShortest && d.second - d.shortest <= 2; }
    },
    {
      id: 'slime-mold-11', level: 8,
      title: { zh: '不輸臺鐵', en: 'As good as the railway' },
      desc: { zh: '用鐵路 15 城：黏菌網的總長和平均距離都不超過臺鐵，容錯至少 95%。', en: 'With the 15 railway cities, grow a network no longer than the railway, with a mean distance no longer than the railway’s, and fault tolerance at least 95%.' },
      check: function (ev) { const d = ev.data; return net(ev) && d.default15 && d.beatRail && d.TL <= d.railTL && d.MD <= d.railMD && d.FT >= 0.95; }
    },
    {
      id: 'slime-mold-12', level: 10,
      title: { zh: '全臺十七城', en: 'All seventeen cities' },
      desc: { zh: '在全部 17 個城市放食物：容錯至少 90%、總長不超過最小生成樹的 1.3 倍、平均距離不超過它的 0.95 倍。', en: 'With food on all 17 cities: fault tolerance at least 90%, total length at most 1.3 times the minimum spanning tree’s and mean distance at most 0.95 times its.' },
      check: function (ev) { const d = ev.data; return net(ev) && d.all17 && d.FT >= 0.9 && d.TLr <= 1.3 && d.MDr <= 0.95; }
    },
    {
      id: 'slime-mold-h1', level: 5, hidden: true,
      riddle: { zh: '兩條路一樣近，就都捨不得放。', en: 'Two roads just as near: neither is let go.' },
      check: function (ev) { const d = ev.data; return maze(ev) && mu1(d) && d.connected && d.nShortest >= 2 && d.cyc >= 1 && d.onShortOnly; }
    },
    {
      id: 'slime-mold-h2', level: 3, hidden: true,
      riddle: { zh: '兩個人的世界，只需要一條路。', en: 'A world for two needs only one road.' },
      check: function (ev) { const d = ev.data; return net(ev) && d.cities === 2; }
    },
    {
      id: 'slime-mold-h3', level: 6, hidden: true,
      riddle: { zh: '預算寬裕，條條大路都留著。', en: 'With money to spare, every road is kept.' },
      check: function (ev) { const d = ev.data; return net(ev) && d.I0 >= 5 && d.TLr >= 1.8; }
    }
  ]);
})();
