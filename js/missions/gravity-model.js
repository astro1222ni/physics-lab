/* missions/gravity-model.js — 重力模型與距離衰減的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/gravity-model.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'grav'：拖曳滑桿時大約每 0.25 秒一次；放開滑桿、點城市、換選單、換畫面、換距離量法、加入／拖曳新市鎮時回報。
 *     data = {
 *       act（b、pop、from、to、view、mode、town、drag）, view（flows／areas／decay）, mode（km／hsr）, b（0.5–3）,
 *       from、to（城市代號，新市鎮是 'new'）, order（A 的互動對象由大到小）, shares = { 代號: A 的互動占比 },
 *       pair = null 或 { km, car（分）, hsr（分）, frac（分界點離 A 的比例）, fracBig（離大城的比例）, popRatio（大城 ÷ 小城）,
 *                        near（離分界點最近的第三座城市）, nearKm },
 *       town = null 或 { lon, lat, pop, top（新市鎮互動最多的城市）, dom（對新市鎮引力最大的城市）, top3（城市引力第一名 ÷ 第三名）,
 *                        pf、pt（A、B 對新市鎮的引力）, off（新市鎮離 A–B 線段多遠，km）, area（勢力範圍畫面時的面積 km^2） },
 *       area = null 或 { 代號: 勢力範圍面積 km^2 }（只在勢力範圍畫面）
 *     }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const V = function (ev) { return ev.type === 'grav' ? ev.data : null; };
  const pairIs = function (d, a, b) { return (d.from === a && d.to === b) || (d.from === b && d.to === a); };
  const NORTH = ['tpe', 'ntp', 'tyn', 'kee'];

  LabMission.register('gravity-model', [
    {
      id: 'gravity-model-1', level: 1,
      title: { zh: '從這裡出發', en: 'Start from here' },
      desc: { zh: '點地圖上的一座城市（或用選單），把它當作出發地 A。', en: 'Tap a city on the map (or use the menu) to make it the starting city A.' },
      check: function (ev) { const d = V(ev); return !!d && d.act === 'from'; }
    },
    {
      id: 'gravity-model-2', level: 2,
      title: { zh: '各據一方', en: 'Each to its own' },
      desc: { zh: '打開「勢力範圍」，看每一塊地被哪座城市吸引。', en: 'Open “Trade areas” and see which city pulls each piece of land.' },
      check: function (ev) { const d = V(ev); return !!d && d.view === 'areas'; }
    },
    {
      id: 'gravity-model-3', level: 2,
      title: { zh: '一條斜線', en: 'One straight line' },
      desc: { zh: '打開「距離衰減」的對數圖。', en: 'Open the log–log “Distance decay” plot.' },
      check: function (ev) { const d = V(ev); return !!d && d.view === 'decay'; }
    },
    {
      id: 'gravity-model-4', level: 3,
      title: { zh: '只看鄰居', en: 'Only the neighbour' },
      desc: { zh: '用直線距離，從臺中出發，讓流向彰化的互動占 90% 以上。', en: 'With straight-line distance, from Taichung, make Changhua take more than 90% of the interaction.' },
      check: function (ev) { const d = V(ev); return !!d && d.mode === 'km' && d.from === 'txg' && d.shares.chw >= 0.9; }
    },
    {
      id: 'gravity-model-5', level: 3,
      title: { zh: '遠方也重要', en: 'Far away still counts' },
      desc: { zh: '用直線距離，從臺北出發，讓流向高雄的互動至少 3%。', en: 'With straight-line distance, from Taipei, give Kaohsiung at least 3% of the interaction.' },
      check: function (ev) { const d = V(ev); return !!d && d.mode === 'km' && d.from === 'tpe' && d.shares.khh >= 0.03; }
    },
    {
      id: 'gravity-model-6', level: 4,
      title: { zh: '縮短的島', en: 'A shorter island' },
      desc: { zh: '用交通時間，選臺北和高雄當 A、B，看搭高鐵的時間不到開車的 40%。', en: 'Using travel time, pick Taipei and Kaohsiung as A and B and see the rail trip take under 40% of the driving time.' },
      check: function (ev) { const d = V(ev); return !!d && d.mode === 'hsr' && pairIs(d, 'tpe', 'khh') && !!d.pair && d.pair.hsr <= 0.4 * d.pair.car; }
    },
    {
      id: 'gravity-model-7', level: 4,
      title: { zh: '大城的商圈', en: 'A big city’s reach' },
      desc: { zh: '選兩座人口差 5 倍以上的城市，讓分界點離大城至少占全程的 70%。', en: 'Pick two cities whose populations differ more than five times, and push the break point at least 70% of the way from the big city.' },
      check: function (ev) { const d = V(ev); return !!d && d.view === 'flows' && !!d.pair && d.pair.popRatio >= 5 && d.pair.fracBig >= 0.7; }
    },
    {
      id: 'gravity-model-8', level: 3,
      title: { zh: '東部的新市鎮', en: 'A new town in the east' },
      desc: { zh: '加入新市鎮，放到一個地方，讓它互動最多的城市是花蓮。', en: 'Add a new town and place it where its biggest partner is Hualien.' },
      check: function (ev) { const d = V(ev); return !!d && !!d.town && d.town.top === 'hua'; }
    },
    {
      id: 'gravity-model-9', level: 5,
      title: { zh: '兩邊一樣用力', en: 'Pulled equally' },
      desc: { zh: 'A、B 選臺北和臺中，把新市鎮放在兩城引力相等的地方（差不到 3%）。', en: 'With Taipei and Taichung as A and B, put the new town where their pulls are equal (within 3%).' },
      check: function (ev) { const d = V(ev), t = d && d.town; return !!t && pairIs(d, 'tpe', 'txg') && t.pf > 0 && t.pt > 0 && Math.abs(t.pf / t.pt - 1) <= 0.03; }
    },
    {
      id: 'gravity-model-10', level: 5,
      title: { zh: '後山的天地', en: 'Room on the east side' },
      desc: { zh: '在「勢力範圍」，讓臺東的勢力範圍至少 1500 km²。', en: 'In “Trade areas”, make Taitung’s area at least 1,500 km².' },
      check: function (ev) { const d = V(ev); return !!d && d.view === 'areas' && !!d.area && d.area.ttt >= 1500; }
    },
    {
      id: 'gravity-model-11', level: 6,
      title: { zh: '搶走第一名', en: 'Steal first place' },
      desc: { zh: '從臺中出發，用新市鎮搶下臺中互動最多的位置（原本是彰化）。', en: 'From Taichung, let the new town take over as Taichung’s biggest partner (normally Changhua).' },
      check: function (ev) { const d = V(ev); return !!d && !!d.town && d.from === 'txg' && d.order[0] === 'new'; }
    },
    {
      id: 'gravity-model-12', level: 5,
      title: { zh: '北方的巨人', en: 'The giant of the north' },
      desc: { zh: '在「勢力範圍」，讓新北的勢力範圍比臺中大。', en: 'In “Trade areas”, make New Taipei’s area larger than Taichung’s.' },
      check: function (ev) { const d = V(ev); return !!d && d.view === 'areas' && !!d.area && d.area.ntp > d.area.txg; }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'gravity-model-h1', level: 3, hidden: true,
      riddle: { zh: '隔著一條溪，兩座城眼裡只有彼此。', en: 'Across one stream, two towns have eyes only for each other.' },
      check: function (ev) { const d = V(ev); return !!d && pairIs(d, 'hsc', 'hsz') && d.order[0] === (d.from === 'hsc' ? 'hsz' : 'hsc') && d.shares[d.order[0]] >= 0.95; }
    },
    {
      id: 'gravity-model-h2', level: 4, hidden: true,
      riddle: { zh: '一樣重的兩塊石頭，繩子的中點永遠不動。', en: 'Two stones of equal weight: the middle of the rope never moves.' },
      check: function (ev) { const d = V(ev), p = d && d.pair; return !!p && d.act === 'b' && d.view === 'flows' && Math.abs(d.b - 2) > 0.05 && p.popRatio < 1.001 && d.from !== 'new' && d.to !== 'new'; }
    },
    {
      id: 'gravity-model-h3', level: 5, hidden: true,
      riddle: { zh: '最快的列車，也幫不了山海之間的這一段路。', en: 'Even the fastest train cannot help on this road between mountains and sea.' },
      check: function (ev) { const d = V(ev), p = d && d.pair; return !!p && d.mode === 'hsr' && pairIs(d, 'hua', 'ttt') && p.hsr >= p.car - 0.01; }
    },
    {
      id: 'gravity-model-h4', level: 6, hidden: true,
      riddle: { zh: '新來的巨人，搶光了鄰居的每一寸土地。', en: 'The newcomer giant takes every inch of its neighbour’s land.' },
      check: function (ev) {
        const d = V(ev);
        if (!d || !d.town || d.view !== 'areas' || !d.area || d.b < 2) return false;
        return Object.keys(d.area).some(function (k) { return k !== 'new' && d.area[k] === 0; });
      }
    },
    {
      id: 'gravity-model-h5', level: 7, hidden: true,
      riddle: { zh: '坐上列車，遠方的港比身邊的港還近。', en: 'Board the train, and the far harbour is nearer than the one next door.' },
      check: function (ev) { const d = V(ev); return !!d && d.mode === 'hsr' && d.from === 'tpe' && d.b >= 1 && d.order.indexOf('khh') >= 0 && d.order.indexOf('khh') < d.order.indexOf('kee'); }
    },
    {
      id: 'gravity-model-h6', level: 7, hidden: true,
      riddle: { zh: '群山之間，小小的村也能稱王。', en: 'Among the mountains, even a small village can be king.' },
      check: function (ev) { const d = V(ev), t = d && d.town; return !!t && d.view === 'areas' && d.b <= 2 && t.pop <= 10 && t.area != null && t.area >= 1000; }
    },
    {
      id: 'gravity-model-h7', level: 8, hidden: true,
      riddle: { zh: '兩座城拔河的繩結，剛好落在第三座城。', en: 'The knot in a tug of war between two cities lands right on a third.' },
      check: function (ev) { const d = V(ev), p = d && d.pair; return !!p && d.view === 'flows' && d.from !== 'new' && d.to !== 'new' && p.nearKm <= 1.5; }
    },
    {
      id: 'gravity-model-h8', level: 8, hidden: true,
      riddle: { zh: '住在南方，心卻被北方的城拉走。', en: 'Living in the south, yet its heart is pulled by a northern city.' },
      check: function (ev) { const d = V(ev), t = d && d.town; return !!t && d.mode === 'hsr' && d.b >= 1 && t.lat < 23.6 && NORTH.indexOf(t.dom) >= 0; }
    },
    {
      id: 'gravity-model-h9', level: 9, hidden: true,
      riddle: { zh: '一樣用力的地方，不只在兩城之間的那條線上。', en: 'Equal pulls are found not only on the line between the two.' },
      check: function (ev) { const d = V(ev), t = d && d.town, p = d && d.pair; return !!t && !!p && p.popRatio >= 1.5 && t.pf > 0 && t.pt > 0 && Math.abs(t.pf / t.pt - 1) <= 0.02 && t.off != null && t.off >= 30; }
    },
    {
      id: 'gravity-model-h10', level: 10, hidden: true,
      riddle: { zh: '三國鼎立的那一點。', en: 'The point where three kingdoms stand in balance.' },
      check: function (ev) { const d = V(ev), t = d && d.town; return !!t && t.top3 <= 1.05; }
    }
  ]);
})();
