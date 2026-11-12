/* missions/contour-map.js — 等高線與 3D 地形的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/contour-map.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'terrain'：島嶼、等高距、著色、海平面、垂直誇大、水平切面、量測點、剖面線或 2D／3D 改變時（拖曳中每 0.22 秒一次），
 *     data = ContourCore.snapshot(…) = {
 *       preset（twin／volcano／valley／terrace）, max（最高點 m）, interval（等高距 m）, vexag（垂直誇大）, sea（海平面 m）, slice（水平切面 m）,
 *       view（'2d'／'3d'）, layers, islands（島嶼數）, land（陸地 km²）, landFrac（剩下的比例）,
 *       probe：{ x, y, h（m）, land, pct（坡度 %）, deg, aspect（坡向，北 0° 順時針）, cls（坡度分級 1–6）, crit（'peak'／'pit'／'saddle'／null）,
 *               dSummit（離最高點 m）, depression（窪地深度 m）, catchment（集水面積 km²）, catchFrac（÷ 這座島最大的集水面積）, spacing } 或 null,
 *       prof：{ L（m）, hA, hB, dh, avg（平均坡度 %）, maxSlope, maxDeg, appDeg（剖面圖上看起來的最陡角度）, ascent, descent, minH, maxH,
 *               clear（視線離地最小距離 m，含地球曲率）, clearFlat（不算曲率）, visible, grazeH、grazeFrac（最貼近處的地面高度、在剖面上的位置 0–1）,
 *               landAll, midPct（中點坡度 %） } 或 null }
 *   'cam'：3D 視角按鈕。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const M = function (ev) { return ev.type === 'terrain' ? ev.data : null; };
  const within = function (v, lo, hi) { return v != null && v >= lo && v <= hi; };
  const pr = function (d) { return d && d.probe; };
  const pf = function (d) { return d && d.prof && d.prof.L >= 20 ? d.prof : null; };
  const bothLand = function (d, P) { return P.hA > d.sea && P.hB > d.sea; };
  /** 視線最貼近地面的地方在剖面中段，而且是比較低的那一端高出 20 m 以上的山脊（不是沿著平地或等高線擦過去） */
  const ridge = function (P) { return P.grazeFrac >= 0.1 && P.grazeFrac <= 0.9 && P.grazeH >= Math.min(P.hA, P.hB) + 20; };

  LabMission.register('contour-map', [
    {
      id: 'contour-map-1', level: 1,
      title: { zh: '站上最高峰', en: 'On top of the island' },
      desc: { zh: '把量測點放在島的最高點附近：高度和最高點相差不到 5 m。', en: 'Put the measuring point on the island’s highest point: within 5 m of its height.' },
      check: function (ev) { const d = M(ev), p = pr(d); return !!p && p.h >= d.max - 5; }
    },
    {
      id: 'contour-map-2', level: 2,
      title: { zh: '找到六級坡', en: 'Find a class-6 slope' },
      desc: { zh: '在陸地上找一處坡度超過 55% 的地方（臺灣坡度分級的六級坡）。提示：等高線最密的地方。', en: 'Find a place on land steeper than 55% (class 6 in Taiwan’s slope grading). Hint: where the contours crowd together.' },
      check: function (ev) { const d = M(ev), p = pr(d); return !!p && p.land && p.cls === 6; }
    },
    {
      id: 'contour-map-3', level: 2,
      title: { zh: '從海邊到山頂', en: 'From the shore to the summit' },
      desc: { zh: '拉一條剖面線：一端在海裡，另一端在最高峰（高度和最高點相差 20 m 以內）。', en: 'Draw a profile line with one end in the sea and the other on the highest summit (within 20 m of its height).' },
      check: function (ev) {
        const d = M(ev), P = pf(d);
        return !!P && P.L >= 500 && ((P.hA <= d.sea && P.hB >= d.max - 20) || (P.hB <= d.sea && P.hA >= d.max - 20));
      }
    },
    {
      id: 'contour-map-4', level: 3,
      title: { zh: '被山擋住了', en: 'Hidden behind a hill' },
      desc: { zh: '剖面的兩端都在陸地上、相距至少 1 km，而且 A、B 看不到彼此（視線被地形擋住）。', en: 'Put both ends of the profile on land at least 1 km apart, so that A and B cannot see each other.' },
      check: function (ev) { const d = M(ev), P = pf(d); return !!P && bothLand(d, P) && P.L >= 1000 && !P.visible; }
    },
    {
      id: 'contour-map-5', level: 3,
      title: { zh: '朝南的山坡', en: 'A south-facing slope' },
      desc: { zh: '找一處朝正南（坡向 175°–185°）、坡度至少 30% 的山坡。在北半球，這樣的坡面曬到最多太陽。', en: 'Find a slope facing due south (aspect 175°–185°) and at least 30% steep. In the northern hemisphere such slopes get the most sun.' },
      check: function (ev) { const d = M(ev), p = pr(d); return !!p && p.land && p.pct >= 30 && within(p.aspect, 175, 185); }
    },
    {
      id: 'contour-map-6', level: 4,
      title: { zh: '找到鞍部', en: 'Find a saddle' },
      desc: { zh: '把量測點放在 200 m 以上的鞍部：兩座山之間稜線最低的地方，「這裡是」會顯示鞍部。', en: 'Put the measuring point on a saddle higher than 200 m — the lowest point of the ridge between two summits (“Landform here” says saddle).' },
      check: function (ev) { const d = M(ev), p = pr(d); return !!p && p.land && p.crit === 'saddle' && p.h >= 200; }
    },
    {
      id: 'contour-map-7', level: 4,
      title: { zh: '站在河谷裡', en: 'Down in a river valley' },
      desc: { zh: '把量測點放在海拔 50 m 以上的河道上，而且集水面積至少 1 km²。看看這附近等高線的 V 字尖端指向哪裡。', en: 'Put the measuring point on a river at least 50 m above the sea, with at least 1 km² draining through it. Which way do the V-shaped contours point here?' },
      check: function (ev) { const d = M(ev), p = pr(d); return !!p && p.land && p.h >= 50 && p.catchment >= 1; }
    },
    {
      id: 'contour-map-8', level: 5,
      title: { zh: '垂直誇大的錯覺', en: 'The exaggeration illusion' },
      desc: { zh: '拉一條至少 500 m 的剖面，最陡的地方真實坡角不超過 20°，但在剖面圖上看起來至少 60°。', en: 'Draw a profile at least 500 m long whose steepest part is no more than 20° in reality but looks at least 60° on the profile.' },
      check: function (ev) { const d = M(ev), P = pf(d); return !!P && P.L >= 500 && P.maxDeg <= 20 && P.appDeg >= 60; }
    },
    {
      id: 'contour-map-9', level: 5,
      title: { zh: '一座島變成兩座', en: 'One island becomes two' },
      desc: { zh: '讓海平面上升，直到島剛好分成兩座。', en: 'Raise the sea until the island splits into exactly two.' },
      check: function (ev) { const d = M(ev); return !!d && d.sea > 0 && d.islands === 2; }
    },
    {
      id: 'contour-map-10', level: 6,
      title: { zh: '淹掉一半', en: 'Half under water' },
      desc: { zh: '調海平面，讓陸地剛好剩下原來的一半（49.5%–50.5%）。', en: 'Set the sea level so that exactly half of the land is left (49.5%–50.5%).' },
      check: function (ev) { const d = M(ev); return !!d && within(d.landFrac, 0.495, 0.505); }
    },
    {
      id: 'contour-map-11', level: 6,
      title: { zh: '切過鞍部的平面', en: 'A plane through the saddle' },
      desc: { zh: '在 3D 檢視中，量測點放在 200 m 以上的鞍部，再把水平切面調到和它一樣高（相差 1 m 以內）：切出來的線在鞍部交叉成 X。', en: 'In 3D, put the measuring point on a saddle above 200 m and move the level plane to its height (within 1 m): the cut crosses itself in an X at the saddle.' },
      check: function (ev) { const d = M(ev), p = pr(d); return !!p && d.view === '3d' && p.land && p.crit === 'saddle' && p.h >= 200 && Math.abs(d.slice - p.h) <= 1; }
    },
    {
      id: 'contour-map-12', level: 7,
      title: { zh: '平均坡度剛好 25%', en: 'An average slope of exactly 25%' },
      desc: { zh: '拉一條全程在陸地上、至少 2 km 長的剖面，平均坡度（兩端高差 ÷ 長度）在 24.8%–25.2% 之間。', en: 'Draw a profile at least 2 km long, all on land, whose average slope (height difference ÷ length) is between 24.8% and 25.2%.' },
      check: function (ev) { const d = M(ev), P = pf(d); return !!P && P.landAll && P.L >= 2000 && within(P.avg, 24.8, 25.2); }
    },
    // ---------- 隱藏任務 ----------
    {
      id: 'contour-map-h1', level: 3, hidden: true,
      riddle: { zh: '爬到了山頂，才發現還得往下走。', en: 'You reach the top, only to find you must go down again.' },
      check: function (ev) { const d = M(ev), p = pr(d); return !!p && d.preset === 'volcano' && p.depression >= 100; }
    },
    {
      id: 'contour-map-h2', level: 4, hidden: true,
      riddle: { zh: '水漲到最後，只剩放一隻腳的地方。', en: 'When the water has risen all it can, there is room for one foot.' },
      check: function (ev) { const d = M(ev); return !!d && d.islands === 1 && d.land > 0 && d.land <= 0.02; }
    },
    {
      id: 'contour-map-h3', level: 4, hidden: true,
      riddle: { zh: '第二名也站在自己的頂端。', en: 'The runner-up also stands on a top of its own.' },
      check: function (ev) { const d = M(ev), p = pr(d); return !!p && p.land && p.crit === 'peak' && p.h >= 300 && p.dSummit >= 1000; }
    },
    {
      id: 'contour-map-h4', level: 5, hidden: true,
      riddle: { zh: '升高的和走過的，終於打成平手。', en: 'The rise and the run finally tie.' },
      check: function (ev) { const d = M(ev), p = pr(d); return !!p && p.land && within(p.pct, 99.5, 100.5) && p.catchFrac < 0.5; }
    },
    {
      id: 'contour-map-h5', level: 5, hidden: true,
      riddle: { zh: '只隔幾十步，中間卻像立著一堵牆。', en: 'A few dozen paces apart, yet it is as if a wall stood between.' },
      check: function (ev) { const d = M(ev), P = pf(d); return !!P && P.L <= 100 && bothLand(d, P) && P.clear <= -8; }
    },
    {
      id: 'contour-map-h6', level: 6, hidden: true,
      riddle: { zh: '在牆上橫走了一大段，一步也沒有升降。', en: 'A long walk across a wall, never a step up or down.' },
      check: function (ev) { const d = M(ev), P = pf(d); return !!P && P.landAll && P.L >= 600 && P.maxH - P.minH <= 3 && P.midPct >= 30; }
    },
    {
      id: 'contour-map-h7', level: 7, hidden: true,
      riddle: { zh: '看得見，只差一根頭髮。', en: 'In sight — by a hair’s breadth.' },
      check: function (ev) {
        const d = M(ev), P = pf(d);
        return !!P && P.visible && P.clear <= 1 && P.L >= 2000 && bothLand(d, P) && ridge(P);
      }
    },
    {
      id: 'contour-map-h8', level: 7, hidden: true,
      riddle: { zh: '大水不退，山只露出三顆牙。', en: 'The flood stays, and the mountain shows only three teeth.' },
      check: function (ev) { const d = M(ev); return !!d && d.islands === 3; }
    },
    {
      id: 'contour-map-h9', level: 8, hidden: true,
      riddle: { zh: '島上最多的雨水，最後都從你腳邊出海。', en: 'More of the island’s rain than anywhere else reaches the sea at your feet.' },
      check: function (ev) { const d = M(ev), p = pr(d); return !!p && p.catchFrac >= 0.9; }
    },
    {
      id: 'contour-map-h10', level: 9, hidden: true,
      riddle: { zh: '擋住你的不是山，是腳下這顆球。', en: 'What hides it is not the mountain but the ball beneath your feet.' },
      check: function (ev) {
        const d = M(ev), P = pf(d);
        return !!P && !P.visible && P.clearFlat >= 0 && P.L >= 2000;
      }
    }
  ]);
})();
