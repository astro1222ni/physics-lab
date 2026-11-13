/* missions/von-thunen.js — 杜能的農業區位圈的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/von-thunen.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'vt'：拖曳滑桿時大約每 0.25 秒一次；放開滑桿、換作物、種／不種、開關河流、換畫面、換範圍、
 *         回到杜能的設定、點或拖曳「這塊地」、轉動立體圖時立刻回報。
 *     data = VonCore.summary() 的內容，再加上 act（param、crop、grow、river、view、zoom、reset、probe、rotate）、view（map／3d）、zoom、sel：
 *       river（有沒有河）, k（河運費率；沒有河時為 1）, m（運費倍率）,
 *       crops.<作物>（veg、wood、grain、live）= { on, Y, p, c, f, A（城市的地租）, B（每公里少）, d0（地租歸零的距離） },
 *       allOn（四種都種）, changedYPC（產量、價格、成本有沒有改過）,
 *       rings（由內而外 [{ id, from, to, rFrom, rTo }]）, order（圈的順序）, present／width／inner／outer（各作物的圈）,
 *       frontier（農業的最外緣，運輸距離）, frontierRiver（沿河的最外緣）, areas／share（各圈的面積與占農地的比例）,
 *       farm（農地面積）, S（有河時面積的倍數）, totalRent（全區總地租，元／年）,
 *       tie3（三條地租線最接近交在同一點的一組：{ spread, d, ids }）, parallel（坡度最接近的兩種作物：{ q, ids }）,
 *       probe（這塊地：{ x, y, dist, D, usesRiver, land, water, landing, angle, id, rent }）
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const V = function (ev) { return ev.type === 'vt' ? ev.data : null; };
  const TOTAL0 = window.VonCore ? window.VonCore.TOTAL0 : 609681497.72;
  const idx = function (d, id) { return d.order.indexOf(id); };

  LabMission.register('von-thunen', [
    {
      id: 'von-thunen-1', level: 1,
      title: { zh: '這塊地種什麼', en: 'What grows here?' },
      desc: { zh: '點地圖上的一個地方，看那裡種什麼。', en: 'Tap a spot on the map to see what grows there.' },
      check: function (ev) { const d = V(ev); return !!d && d.act === 'probe' && !!d.probe; }
    },
    {
      id: 'von-thunen-2', level: 2,
      title: { zh: '地租的山', en: 'A hill of rent' },
      desc: { zh: '切到「立體地租曲面」，把地租當成高度來看。', en: 'Switch to the 3D rent surface and see rent as height.' },
      check: function (ev) { const d = V(ev); return !!d && d.view === '3d'; }
    },
    {
      id: 'von-thunen-3', level: 2,
      title: { zh: '河流來了', en: 'Here comes a river' },
      desc: { zh: '打開河流，看圈怎麼變形。', en: 'Switch on the river and watch the rings change shape.' },
      check: function (ev) { const d = V(ev); return !!d && d.river && d.k < 1; }
    },
    {
      id: 'von-thunen-4', level: 3,
      title: { zh: '一百公里的邊疆', en: 'A frontier at 100 km' },
      desc: { zh: '讓農業的最外緣（地租降到 0 的地方）離城 100 公里，差 1 公里以內。', en: 'Put the edge of farming (where rent falls to 0) 100 km from the city, within 1 km.' },
      check: function (ev) { const d = V(ev); return !!d && Math.abs(d.frontier - 100) <= 1; }
    },
    {
      id: 'von-thunen-5', level: 3,
      title: { zh: '冷藏車', en: 'Refrigerated lorries' },
      desc: { zh: '讓蔬菜與牛奶的圈一路延伸到離城 20 公里以外。', en: 'Make the vegetables-and-dairy ring reach beyond 20 km from the city.' },
      check: function (ev) { const d = V(ev); return !!d && d.present.veg && d.outer.veg >= 20; }
    },
    {
      id: 'von-thunen-6', level: 4,
      title: { zh: '不再燒柴', en: 'No more firewood' },
      desc: { zh: '四種作物都種，但只改數值，讓林木圈從地圖上消失。', en: 'Keep all four crops but, by changing the numbers only, make the forestry ring disappear.' },
      check: function (ev) { const d = V(ev); return !!d && d.allOn && !d.present.wood && d.rings.length > 0; }
    },
    {
      id: 'von-thunen-7', level: 4,
      title: { zh: '順著河走', en: 'Down the river' },
      desc: { zh: '打開河流，讓沿河方向的農業延伸到離城 300 公里以外。', en: 'With the river on, make farming reach more than 300 km along it.' },
      check: function (ev) { const d = V(ev); return !!d && d.river && d.frontier > 0 && d.frontierRiver >= 300; }
    },
    {
      id: 'von-thunen-8', level: 5,
      title: { zh: '牧場搬進來', en: 'Pasture moves in' },
      desc: { zh: '四種作物都種，讓放牧圈排到穀物圈的內側（兩個圈都要在）。', en: 'With all four crops, put the grazing ring inside the grain ring (both rings must be there).' },
      check: function (ev) { const d = V(ev); return !!d && d.allOn && d.present.live && d.present.grain && idx(d, 'live') < idx(d, 'grain'); }
    },
    {
      id: 'von-thunen-9', level: 5,
      title: { zh: '一樣寬', en: 'Equal widths' },
      desc: { zh: '讓林木圈和穀物圈一樣寬，差 0.2 公里以內。', en: 'Make the forestry and grain rings the same width, within 0.2 km.' },
      check: function (ev) { const d = V(ev); return !!d && d.present.wood && d.present.grain && Math.abs(d.width.wood - d.width.grain) <= 0.2; }
    },
    {
      id: 'von-thunen-10', level: 6,
      title: { zh: '兩倍的農地', en: 'Twice the farmland' },
      desc: { zh: '打開河流，讓農地面積剛好變成沒有河時的 2 倍（差 1% 以內）。', en: 'With the river on, make the farmland exactly twice as large as without it (within 1%).' },
      check: function (ev) { const d = V(ev); return !!d && d.river && d.frontier > 0 && Math.abs(d.S - 2) <= 0.02; }
    },
    {
      id: 'von-thunen-11', level: 6,
      title: { zh: '鐵路通車', en: 'The railway arrives' },
      desc: { zh: '沒有河、四種作物的產量、價格、成本都照杜能的設定，只改運費，讓全區總地租變成原來的 2 倍（差 2% 以內）。', en: 'No river, and yields, prices and costs as von Thünen set them: change only freight to double the total rent (within 2%).' },
      check: function (ev) { const d = V(ev); return !!d && !d.river && d.allOn && !d.changedYPC && Math.abs(d.totalRent / TOTAL0 - 2) <= 0.04; }
    },
    {
      id: 'von-thunen-12', level: 7,
      title: { zh: '一樣大的兩圈', en: 'Two rings, one size' },
      desc: { zh: '讓蔬菜與牛奶圈和林木圈的面積一樣大，差 1% 以內。', en: 'Make the vegetables-and-dairy ring and the forestry ring cover the same area, within 1%.' },
      check: function (ev) { const d = V(ev); return !!d && d.present.veg && d.present.wood && Math.abs(d.areas.veg / d.areas.wood - 1) <= 0.01; }
    },

    // ---------- 隱藏任務 ----------
    {
      id: 'von-thunen-h1', level: 3, hidden: true,
      riddle: { zh: '河就在那裡，他卻選擇走路。', en: 'The river is right there, yet he walks.' },
      check: function (ev) { const d = V(ev); const p = d && d.probe; return !!p && d.act === 'probe' && d.river && d.k <= 0.9 && !p.usesRiver && Math.abs(p.y) >= 5 && !!p.id; }
    },
    {
      id: 'von-thunen-h2', level: 4, hidden: true,
      riddle: { zh: '只差一點點就不虧，城門口卻沒有人肯種。', en: 'Just short of breaking even, and no one will plant it even at the city gate.' },
      check: function (ev) {
        const d = V(ev);
        return !!d && ['veg', 'wood', 'grain', 'live'].some(function (id) { const c = d.crops[id]; return c.on && c.c > 0 && c.p < c.c && c.p >= 0.99 * c.c; });
      }
    },
    {
      id: 'von-thunen-h3', level: 5, hidden: true,
      riddle: { zh: '一出城門，先走進樹林。', en: 'Step out of the city gate and into the woods.' },
      check: function (ev) { const d = V(ev); return !!d && d.allOn && d.rings.length === 4 && d.order[0] === 'wood'; }
    },
    {
      id: 'von-thunen-h4', level: 5, hidden: true,
      riddle: { zh: '剛好一半的土地，天亮以前就得進城。', en: 'Exactly half the land must reach town before dawn.' },
      check: function (ev) { const d = V(ev); return !!d && d.allOn && Math.abs(d.share.veg - 0.5) <= 0.005; }
    },
    {
      id: 'von-thunen-h5', level: 6, hidden: true,
      riddle: { zh: '再往外一步，這塊地就一文不值。', en: 'One more step out, and this land is worth nothing.' },
      check: function (ev) { const d = V(ev); const p = d && d.probe; return !!p && d.frontier > 0 && p.D >= 5 && Math.abs(p.D - d.frontier) <= 0.1; }
    },
    {
      id: 'von-thunen-h6', level: 6, hidden: true,
      riddle: { zh: '比最遠的牧人還遠三倍，仍聽得見鋤頭聲。', en: 'Three times farther than the last herdsman, and still the sound of a hoe.' },
      check: function (ev) { const d = V(ev); const p = d && d.probe; return !!p && d.river && !!p.id && p.dist >= 3 * d.frontier; }
    },
    {
      id: 'von-thunen-h7', level: 7, hidden: true,
      riddle: { zh: '走到水邊的那一刻，腳步剛好斜成直角的一半。', en: 'Where he reaches the water, his path leans at exactly half a right angle.' },
      check: function (ev) { const d = V(ev); const p = d && d.probe; return !!p && d.river && p.usesRiver && p.angle != null && Math.abs(p.angle - 45) <= 0.5 && !!p.id; }
    },
    {
      id: 'von-thunen-h8', level: 7, hidden: true,
      riddle: { zh: '在城門口，四種收成一樣值錢。', en: 'At the city gate, all four harvests are worth the same.' },
      check: function (ev) {
        const d = V(ev);
        if (!d || !d.allOn) return false;
        const a = ['veg', 'wood', 'grain', 'live'].map(function (id) { return d.crops[id].A; });
        const lo = Math.min.apply(null, a), hi = Math.max.apply(null, a);
        return lo > 0 && hi <= lo * 1.01;
      }
    },
    {
      id: 'von-thunen-h9', level: 8, hidden: true,
      riddle: { zh: '三個人在同一個路口相遇。', en: 'Three travellers meet at the same crossroads.' },
      check: function (ev) { const d = V(ev); return !!d && !!d.tie3 && d.tie3.spread <= 0.05 && d.tie3.d >= 0.5; }
    },
    {
      id: 'von-thunen-h10', level: 10, hidden: true,
      riddle: { zh: '由外而內，整個世界倒過來。', en: 'From the outside in, the whole world turned over.' },
      check: function (ev) { const d = V(ev); return !!d && d.allOn && d.order.join() === 'live,grain,wood,veg'; }
    }
  ]);
})();
