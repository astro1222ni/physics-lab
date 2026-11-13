/* missions/remote-sensing.js — 遙測：假色影像與植生指標 NDVI 的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/remote-sensing.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'rs'：拖曳滑桿時大約每 0.25 秒一次；放開滑桿、換畫面、換圖層、換波段組合、選像元、播放一年時回報。
 *     data = {
 *       act（param、day、probe、comp、rgb、layer、view）, view（image／spectrum／scatter）, layer（rgb／ndvi／ndwi）,
 *       comp（natural／cir／agri／swir／custom）, rgb（[紅, 綠, 藍] 放的波段 1–7）, day（1–365）, drought（0–1）, turb（0–1）, haze（0–0.15）, playing,
 *       mean = { 各類地表的平均 NDVI }, meanW = { 各類地表的平均 NDWI }, paddy0（同一天沒有乾旱時稻田的平均 NDVI）,
 *       paddyC（同一天沒有霧霾時稻田的平均 NDVI）,
 *       probe = null 或 { k, cls（water、pond、forest、town、park、paddy、fallow、sand）, stage（稻田的階段）, ndvi, ndwi, ndbi,
 *                        mix = { veg, soil, water, urban }（像元裡各種地表的比例）, b（7 個波段的反射率） }
 *     }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const V = function (ev) { return ev.type === 'rs' ? ev.data : null; };
  const img = function (d) { return d.view === 'image'; };
  const clear = function (d) { return d.drought === 0 && d.haze <= 0.005; };

  LabMission.register('remote-sensing', [
    {
      id: 'remote-sensing-1', level: 1,
      title: { zh: '衛星看到的一格', en: 'One pixel from space' },
      desc: { zh: '在影像上點一個像元，看它在 7 個波段的反射率。', en: 'Tap a pixel on the image and read its reflectance in the 7 bands.' },
      check: function (ev) { const d = V(ev); return !!d && d.act === 'probe' && !!d.probe; }
    },
    {
      id: 'remote-sensing-2', level: 2,
      title: { zh: '紅色的森林', en: 'A red forest' },
      desc: { zh: '換成標準假色（5-4-3），看健康的植物變成紅色。', en: 'Switch to colour infrared (5-4-3) and watch healthy plants turn red.' },
      check: function (ev) { const d = V(ev); return !!d && img(d) && d.layer === 'rgb' && d.comp === 'cir'; }
    },
    {
      id: 'remote-sensing-3', level: 2,
      title: { zh: '植生指標地圖', en: 'A vegetation index map' },
      desc: { zh: '打開 NDVI 圖層。', en: 'Open the NDVI layer.' },
      check: function (ev) { const d = V(ev); return !!d && img(d) && d.layer === 'ndvi'; }
    },
    {
      id: 'remote-sensing-4', level: 3,
      title: { zh: '紅邊', en: 'The red edge' },
      desc: { zh: '選一個森林的像元，打開光譜曲線，看紅光到近紅外之間的陡坡。', en: 'Pick a forest pixel and open the spectrum to see the steep rise from red to near infrared.' },
      check: function (ev) { const d = V(ev); return !!d && d.view === 'spectrum' && !!d.probe && d.probe.cls === 'forest'; }
    },
    {
      id: 'remote-sensing-5', level: 3,
      title: { zh: '把看不見的光塗成綠色', en: 'Paint the invisible light green' },
      desc: { zh: '自訂組合：把近紅外（波段 5）放在綠色，紅色和藍色放別的波段。', en: 'Custom composite: put near infrared (band 5) in green, and other bands in red and blue.' },
      check: function (ev) { const d = V(ev); return !!d && img(d) && d.layer === 'rgb' && d.comp === 'custom' && d.rgb[1] === 5 && d.rgb[0] !== 5 && d.rgb[2] !== 5; }
    },
    {
      id: 'remote-sensing-6', level: 3,
      title: { zh: '土壤線', en: 'The soil line' },
      desc: { zh: '選一個休耕地的像元，到紅光–近紅外散布圖找到它。', en: 'Pick a fallow-field pixel and find it on the red–NIR plot.' },
      check: function (ev) { const d = V(ev); return !!d && d.view === 'scatter' && !!d.probe && d.probe.cls === 'fallow'; }
    },
    {
      id: 'remote-sensing-7', level: 4,
      title: { zh: '最綠的季節', en: 'The greenest season' },
      desc: { zh: '在 NDVI 圖層，沒有乾旱、沒有霧霾，找一天讓稻田的平均 NDVI 至少 0.75（停在那一天，不是播放中經過）。', en: 'On the NDVI layer, with no drought and no haze, stop on a day when the paddies average an NDVI of at least 0.75 (not just passing while playing).' },
      check: function (ev) { const d = V(ev); return !!d && img(d) && d.layer === 'ndvi' && !d.playing && clear(d) && d.mean.paddy >= 0.75; }
    },
    {
      id: 'remote-sensing-8', level: 4,
      title: { zh: '田變成一面鏡子', en: 'Fields turned to mirrors' },
      desc: { zh: '打開 NDWI 圖層，找一天讓稻田的平均 NDWI 至少 0.2。', en: 'Open the NDWI layer and find a day when the paddies average an NDWI of at least 0.2.' },
      check: function (ev) { const d = V(ev); return !!d && img(d) && d.layer === 'ndwi' && d.meanW.paddy >= 0.2; }
    },
    {
      id: 'remote-sensing-9', level: 5,
      title: { zh: '稻穗轉黃', en: 'Rice turning gold' },
      desc: { zh: '選一個正在成熟轉黃的稻田像元，NDVI 低於 0.45，打開光譜曲線看它和健康植物差在哪裡。', en: 'Pick a ripening paddy pixel with an NDVI below 0.45 and open its spectrum to compare with healthy plants.' },
      check: function (ev) { const d = V(ev); return !!d && d.view === 'spectrum' && !!d.probe && d.probe.cls === 'paddy' && d.probe.stage === 'ripe' && d.probe.ndvi < 0.45; }
    },
    {
      id: 'remote-sensing-10', level: 5,
      title: { zh: '缺水的稻田', en: 'Thirsty paddies' },
      desc: { zh: '在稻子長得正好的時候（沒有乾旱時平均 NDVI 至少 0.7），讓乾旱把稻田的平均 NDVI 拉低至少 0.2。', en: 'When the rice is at its best (an NDVI of at least 0.7 without drought), let drought pull the paddy average down by at least 0.2.' },
      check: function (ev) { const d = V(ev); return !!d && d.paddy0 >= 0.7 && d.mean.paddy <= d.paddy0 - 0.2; }
    },
    {
      id: 'remote-sensing-11', level: 5,
      title: { zh: '隔著一層霧', en: 'Through the haze' },
      desc: { zh: '在 NDVI 圖層，讓霧霾把稻田的平均 NDVI 拉低至少 0.08（和同一天沒有霧霾時比）。', en: 'On the NDVI layer, let haze lower the paddy average by at least 0.08 compared with the same day without haze.' },
      check: function (ev) { const d = V(ev); return !!d && img(d) && d.layer === 'ndvi' && d.paddyC >= 0.5 && d.paddyC - d.mean.paddy >= 0.08; }
    },
    {
      id: 'remote-sensing-12', level: 6,
      title: { zh: '一年兩穫', en: 'Two harvests a year' },
      desc: { zh: '在 NDVI 圖層，沒有乾旱、沒有霧霾，用日期滑桿找到第二期稻作最茂盛的時候：第 190 天以後，稻田的平均 NDVI 至少 0.72。', en: 'On the NDVI layer, with no drought and no haze, use the day slider to find the second crop at its best: after day 190, a paddy average NDVI of at least 0.72.' },
      check: function (ev) { const d = V(ev); return !!d && img(d) && d.layer === 'ndvi' && d.act === 'day' && !d.playing && clear(d) && d.day >= 190 && d.mean.paddy >= 0.72; }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'remote-sensing-h1', level: 3, hidden: true,
      riddle: { zh: '在最長的光裡，河的內彎閃閃發亮。', en: 'In the longest light, the inside of the bend shines.' },
      check: function (ev) { const d = V(ev); return !!d && img(d) && d.layer === 'rgb' && d.comp === 'swir' && !!d.probe && d.probe.cls === 'sand'; }
    },
    {
      id: 'remote-sensing-h2', level: 4, hidden: true,
      riddle: { zh: '灰色的城裡，有一塊不肯變灰的方塊。', en: 'In the grey town, one square refuses to turn grey.' },
      check: function (ev) { const d = V(ev); return !!d && img(d) && d.layer === 'ndvi' && !!d.probe && d.probe.cls === 'park'; }
    },
    {
      id: 'remote-sensing-h3', level: 5, hidden: true,
      riddle: { zh: '三盞燈，只聽同一種看不見的光。', en: 'Three lamps, all listening to the same unseen light.' },
      check: function (ev) { const d = V(ev); return !!d && img(d) && d.layer === 'rgb' && d.rgb[0] === 5 && d.rgb[1] === 5 && d.rgb[2] === 5; }
    },
    {
      id: 'remote-sensing-h4', level: 6, hidden: true,
      riddle: { zh: '明明種下了秧，衛星卻只看見水。', en: 'The seedlings are planted, yet the satellite sees only water.' },
      check: function (ev) { const d = V(ev); return !!d && d.view === 'spectrum' && !!d.probe && d.probe.cls === 'paddy' && d.probe.stage === 'young' && d.probe.ndvi < -0.05; }
    },
    {
      id: 'remote-sensing-h5', level: 7, hidden: true,
      riddle: { zh: '一年之中，稻子只有一天最驕傲。', en: 'Of all the days in a year, the rice is proudest on just one.' },
      check: function (ev) { const d = V(ev); return !!d && img(d) && d.layer === 'ndvi' && !d.playing && d.day === 111 && d.drought === 0 && d.haze === 0; }
    },
    {
      id: 'remote-sensing-h6', level: 7, hidden: true,
      riddle: { zh: '最綠的季節，雨卻遲遲不來。', en: 'The greenest season, and still the rain will not come.' },
      check: function (ev) { const d = V(ev); return !!d && d.act === 'param' && img(d) && d.layer === 'ndvi' && d.paddy0 >= 0.78 && d.mean.paddy < 0.5; }
    },
    {
      id: 'remote-sensing-h7', level: 6, hidden: true,
      riddle: { zh: '在第六道光裡，水泥終於贏過了樹葉。', en: 'In the sixth light, concrete finally outshines the leaves.' },
      check: function (ev) { const d = V(ev); return !!d && d.view === 'spectrum' && !!d.probe && d.probe.cls === 'town' && d.probe.ndbi >= 0.06; }
    },
    {
      id: 'remote-sensing-h8', level: 7, hidden: true,
      riddle: { zh: '最藍的那隻眼睛，最先看見天空的灰。', en: 'The bluest eye is the first to see the grey in the sky.' },
      check: function (ev) { const d = V(ev); return !!d && img(d) && d.layer === 'rgb' && d.rgb[0] === 1 && d.rgb[1] === 1 && d.rgb[2] === 1 && d.haze >= 0.1; }
    },
    {
      id: 'remote-sensing-h9', level: 8, hidden: true,
      riddle: { zh: '一個格子，住著三戶人家。', en: 'One little square, three households.' },
      check: function (ev) { const d = V(ev); const m = d && d.probe && d.probe.mix; return !!m && img(d) && d.layer === 'ndwi' && m.veg >= 0.22 && m.water >= 0.22 && m.soil >= 0.22; }
    },
    {
      id: 'remote-sensing-h10', level: 10, hidden: true,
      riddle: { zh: '第二次的綠，也有它的冠軍。', en: 'The second green has its champion too.' },
      check: function (ev) { const d = V(ev); return !!d && img(d) && d.layer === 'ndvi' && clear(d) && d.day >= 200 && !!d.probe && d.probe.cls === 'paddy' && d.probe.ndvi >= 0.8; }
    }
  ]);
})();
