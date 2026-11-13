/* missions/urban-heat-island.js — 都市熱島的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/urban-heat-island.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'uhi'：拖曳滑桿時大約每 0.25 秒一次；放開滑桿、點地圖放溫度計、種公園、清除公園、換畫面時回報。
 *     data = {
 *       act（P、wind、hour、cloud、green、cool、probe、park、clear、view）, view（map／surface／profile／oke）,
 *       P（人口）, wind（m/s）, hour（0–24）, cloud（0–1）, green（0–0.5）, cool（0–1）, parks（公園數）,
 *       max（熱島強度：最高的溫差 °C）, center（市中心的溫差）, centerNoPark（拿掉公園時的市中心溫差）,
 *       peakKm（最熱點在市中心東邊幾 km）, peakParked（公園是否蓋住沒有對策時的最熱點）, area2（溫差 ≥ 2 °C 的面積 km^2）,
 *       oke（同人口的 Oke 值）, ucrit（臨界風速）, maxBase（沒有任何對策時的熱島強度）, mitig（對策讓強度降低的比例）,
 *       rural（郊區氣溫）, R（都市半徑 km）,
 *       probe = null 或 { x, y（km，東、南為正）, dT, t, water, park, urb（0–1）, imp, mirror（東西對稱那一點的溫差）, r }
 *     }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const V = function (ev) { return ev.type === 'uhi' ? ev.data : null; };
  const night = function (h) { return h <= 4 || h >= 24; };

  LabMission.register('urban-heat-island', [
    {
      id: 'urban-heat-island-1', level: 1,
      title: { zh: '量一量', en: 'Take a reading' },
      desc: { zh: '點地圖，放一支溫度計。', en: 'Tap the map to place a thermometer.' },
      check: function (ev) { const d = V(ev); return !!d && d.act === 'probe' && !!d.probe; }
    },
    {
      id: 'urban-heat-island-2', level: 2,
      title: { zh: '浮起來的島', en: 'An island of warm air' },
      desc: { zh: '打開「立體溫度」，看城市的溫度像一座島。', en: 'Open “3D” and see the city stand up like an island.' },
      check: function (ev) { const d = V(ev); return !!d && d.view === 'surface'; }
    },
    {
      id: 'urban-heat-island-3', level: 2,
      title: { zh: '橫切一刀', en: 'Cut across' },
      desc: { zh: '打開「東西剖面」，看溫度從郊區到市中心怎麼變。', en: 'Open the “Profile” and follow the temperature from countryside to centre.' },
      check: function (ev) { const d = V(ev); return !!d && d.view === 'profile'; }
    },
    {
      id: 'urban-heat-island-4', level: 3,
      title: { zh: '百萬人口', en: 'A million people' },
      desc: { zh: '在「人口與強度」圖上，把城市人口調到 100 萬以上。', en: 'On the “Population” chart, raise the population to at least 1 million.' },
      check: function (ev) { const d = V(ev); return !!d && d.view === 'oke' && d.P >= 1e6; }
    },
    {
      id: 'urban-heat-island-5', level: 3,
      title: { zh: '熱往下風跑', en: 'Heat drifts downwind' },
      desc: { zh: '加大西風，讓最熱的地方跑到市中心東邊 4 km 以外。', en: 'Strengthen the west wind until the hottest spot is more than 4 km east of the centre.' },
      check: function (ev) { const d = V(ev); return !!d && d.max > 0.1 && d.peakKm >= 4; }
    },
    {
      id: 'urban-heat-island-6', level: 4,
      title: { zh: '最強的熱島', en: 'The strongest island' },
      desc: { zh: '讓熱島強度（城裡最高比郊區高多少）達到 8 °C 以上。', en: 'Make the heat-island intensity (how much warmer the hottest spot is than the countryside) at least 8 °C.' },
      check: function (ev) { const d = V(ev); return !!d && d.max >= 8; }
    },
    {
      id: 'urban-heat-island-7', level: 4,
      title: { zh: '雲的棉被', en: 'A blanket of cloud' },
      desc: { zh: '人口 100 萬以上、無風的深夜（0–4 點），讓雲把熱島強度削到 Oke 值的一半以下。', en: 'With at least 1 million people, no wind, and the middle of the night (0–4 h), let cloud cut the intensity to under half the Oke value.' },
      check: function (ev) { const d = V(ev); return !!d && d.P >= 1e6 && d.wind <= 0.01 && night(d.hour) && d.max <= 0.5 * d.oke && d.cloud >= 0.5; }
    },
    {
      id: 'urban-heat-island-8', level: 4,
      title: { zh: '吹散熱島', en: 'Blow it away' },
      desc: { zh: '人口 100 萬以上，把風加大到熱島完全消失。', en: 'With at least 1 million people, raise the wind until the heat island is gone.' },
      check: function (ev) { const d = V(ev); return !!d && d.P >= 1e6 && d.max < 0.005 && d.wind >= d.ucrit - 1e-9; }
    },
    {
      id: 'urban-heat-island-9', level: 5,
      title: { zh: '城市之肺', en: 'The lungs of the city' },
      desc: { zh: '種公園，讓市中心的溫差比沒有公園時低 1.5 °C 以上。', en: 'Plant parks so the city centre is at least 1.5 °C cooler than without them.' },
      check: function (ev) { const d = V(ev); return !!d && d.parks > 0 && d.centerNoPark - d.center >= 1.5; }
    },
    {
      id: 'urban-heat-island-10', level: 5,
      title: { zh: '綠色與白色', en: 'Green and white' },
      desc: { zh: '不種公園，只用綠地和涼屋頂，讓人口 10 萬以上的城市熱島強度降低 40% 以上。', en: 'Without parks, use only green space and cool roofs to cut the intensity of a city of 100,000 or more by at least 40%.' },
      check: function (ev) { const d = V(ev); return !!d && d.parks === 0 && d.P >= 1e5 && d.maxBase > 0.1 && d.mitig >= 0.4; }
    },
    {
      id: 'urban-heat-island-11', level: 5,
      title: { zh: '小鎮也有熱島', en: 'Small towns too' },
      desc: { zh: '人口 2 萬以下的小鎮，讓熱島強度達到 4 °C 以上。', en: 'Give a town of 20,000 or fewer a heat island of at least 4 °C.' },
      check: function (ev) { const d = V(ev); return !!d && d.P <= 2e4 && d.max >= 4; }
    },
    {
      id: 'urban-heat-island-12', level: 6,
      title: { zh: '熱島擴張', en: 'A spreading island' },
      desc: { zh: '讓溫差 2 °C 以上的範圍超過 550 km²。', en: 'Make the area at least 2 °C warmer than the countryside larger than 550 km².' },
      check: function (ev) { const d = V(ev); return !!d && d.area2 >= 550; }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'urban-heat-island-h1', level: 3, hidden: true,
      riddle: { zh: '城裡流過一條涼涼的帶子。', en: 'A cool ribbon runs through the town.' },
      check: function (ev) { const d = V(ev), p = d && d.probe; return !!p && d.act === 'probe' && p.water && p.urb >= 0.5 && d.center - p.dT >= 5; }
    },
    {
      id: 'urban-heat-island-h2', level: 4, hidden: true,
      riddle: { zh: '萬事俱備，偏偏是太陽最高之後。', en: 'Everything is ready — except it is just after the sun is highest.' },
      check: function (ev) { const d = V(ev); return !!d && d.P >= 1e6 && d.wind <= 0.01 && d.cloud <= 0.001 && d.hour >= 13 && d.hour <= 15 && d.green === 0 && d.cool === 0 && d.parks === 0; }
    },
    {
      id: 'urban-heat-island-h3', level: 5, hidden: true,
      riddle: { zh: '沒有風、沒有雲的深夜，島浮得最高。', en: 'No wind, no cloud, deep in the night: the island floats highest.' },
      check: function (ev) { const d = V(ev); return !!d && d.view === 'surface' && d.P >= 5e5 && d.wind <= 0.01 && d.cloud <= 0.001 && d.hour >= 1 && d.hour <= 3; }
    },
    {
      id: 'urban-heat-island-h4', level: 6, hidden: true,
      riddle: { zh: '風從西邊來，熱全留給了東邊。', en: 'The wind comes from the west and leaves all its warmth to the east.' },
      check: function (ev) { const d = V(ev), p = d && d.probe; return !!p && d.view === 'profile' && Math.abs(p.y) <= 1 && d.wind >= 3 && d.cloud <= 0.2 && p.x < 0 && p.r >= d.R + 2 && p.urb < 0.05 && !p.water && p.dT < 0.2 && p.mirror >= 2.5; }
    },
    {
      id: 'urban-heat-island-h5', level: 7, hidden: true,
      riddle: { zh: '風再大一點點，島就沉了。', en: 'A little more wind and the island sinks.' },
      check: function (ev) { const d = V(ev); return !!d && d.view === 'profile' && d.P >= 1e6 && d.P <= 2e6 && d.max > 0.005 && d.wind >= d.ucrit - 0.5 && d.wind < d.ucrit; }
    },
    {
      id: 'urban-heat-island-h6', level: 7, hidden: true,
      riddle: { zh: '屋頂全白、綠意滿城，夜裡的熱還是散不去。', en: 'Every roof white, green everywhere — and still the night will not cool.' },
      check: function (ev) { const d = V(ev); return !!d && d.cool >= 0.999 && d.green >= 0.499 && d.max >= 2.5; }
    },
    {
      id: 'urban-heat-island-h7', level: 8, hidden: true,
      riddle: { zh: '樹，要種在熱跑去的地方。', en: 'Plant the trees where the heat has gone.' },
      check: function (ev) { const d = V(ev); return !!d && d.act === 'park' && d.wind >= 3 && d.peakParked && d.peakBaseKm >= 3; }
    },
    {
      id: 'urban-heat-island-h8', level: 8, hidden: true,
      riddle: { zh: '天空蓋得密不透風，城裡還是暖的。', en: 'The sky is sealed shut, yet the city stays warm.' },
      check: function (ev) { const d = V(ev); return !!d && d.cloud >= 0.999 && d.max >= 2; }
    },
    {
      id: 'urban-heat-island-h9', level: 9, hidden: true,
      riddle: { zh: '城的熱，乘著風去了鄉下。', en: 'The city’s warmth rides the wind into the fields.' },
      check: function (ev) { const d = V(ev), p = d && d.probe; return !!p && d.wind >= 2 && p.x > 0 && p.r >= d.R + 3 && p.urb < 0.05 && !p.water && p.dT >= 2.5; }
    },
    {
      id: 'urban-heat-island-h10', level: 10, hidden: true,
      riddle: { zh: '百萬人的城裡，有個地方比鄉下還涼。', en: 'In a city of a million, one spot is cooler than the countryside.' },
      check: function (ev) { const d = V(ev), p = d && d.probe; return !!p && d.P >= 1e6 && d.wind <= 1 && p.park && p.urb >= 0.7 && p.dT <= -0.3; }
    }
  ]);
})();
