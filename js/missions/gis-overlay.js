/* missions/gis-overlay.js — 圖層疊合與選址的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/gis-overlay.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'go'：拖曳滑桿時大約每 0.25 秒一次；放開滑桿、換設施、換方法、換畫面、換圖層、開關條件、改土地使用、
 *         回到預設條件、點或拖曳格子、轉動立體圖時立刻回報。
 *     data = {
 *       act（param、toggle、land、fac、reset、method、view、layer、probe、rotate）, fac（incinerator／school／solar）,
 *       method（bool／weight）, view（map／3d）, layer（result、z、slope、flood、fault、road、town、land）,
 *       cfg = { stage（河水上漲 m）, slope／flood／fault／road／town = { on, v（town 另有 near）}, land = { on, v（允許的土地使用陣列） } },
 *       w（各條件的權重）,
 *       bool = { cells, area, patches, largest, sitesBig（≥ 0.25 km² 的連續用地塊數）, fail（各條件不通過的格數） },
 *       weight = { best, bestK, area70, bestOk（最高分的格子在布林疊合也通過） },
 *       flood = { area, town }（淹水的土地與住宅，km²）,
 *       probe（點的格子；沒有時 null）= GisCore.inspect() 加上 score、ok：{ k, x, y, z, slope, hand, depth, fault, road, town, land, pass, all, score, ok }
 *     }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const K = window.GisCore;
  const V = function (ev) { return ev.type === 'go' ? ev.data : null; };
  const allOn = function (d) { return K.CRIT.every(function (c) { return d.cfg[c].on; }); };
  /** 這種設施預設的每一條都用上，而且沒有比預設條件更寬鬆 */
  function strict(d, fac) {
    if (!d || d.fac !== fac) return false;
    const p = K.preset(fac), c = d.cfg;
    // 這種設施預設用上的條件都要開著（太陽能場預設不看斷層與住家）
    if (!K.CRIT.every(function (q) { return !p[q].on || c[q].on; })) return false;
    if (c.stage < p.stage - 1e-9) return false;
    if (c.slope.v > p.slope.v + 1e-9 || c.flood.v > p.flood.v + 1e-9 || c.road.v > p.road.v + 1e-9) return false;
    if (p.fault.on && c.fault.v < p.fault.v - 1e-9) return false;
    if (p.town.on && (c.town.near !== p.town.near || (p.town.near ? c.town.v > p.town.v + 1e-9 : c.town.v < p.town.v - 1e-9))) return false;
    return c.land.v.every(function (u) { return p.land.v.indexOf(u) >= 0; });
  }
  // 最高、最陡的格子（只算一次）
  let TOP = null;
  function tops() {
    if (TOP) return TOP;
    const L = K.layers();
    let zk = 0, sk = 0;
    for (let k = 0; k < K.NX * K.NY; k++) { if (L.z[k] > L.z[zk]) zk = k; if (L.slope[k] > L.slope[sk]) sk = k; }
    TOP = { z: zk, slope: sk };
    return TOP;
  }

  LabMission.register('gis-overlay', [
    {
      id: 'gis-overlay-1', level: 1,
      title: { zh: '這一格', en: 'One cell' },
      desc: { zh: '點地圖上的一格，看它每一個圖層的資料。', en: 'Tap a cell on the map and read every layer there.' },
      check: function (ev) { const d = V(ev); return !!d && d.act === 'probe' && !!d.probe; }
    },
    {
      id: 'gis-overlay-2', level: 2,
      title: { zh: '一層疊一層', en: 'Layer upon layer' },
      desc: { zh: '切到「圖層疊起來」。', en: 'Switch to “Layer stack”.' },
      check: function (ev) { const d = V(ev); return !!d && d.view === '3d'; }
    },
    {
      id: 'gis-overlay-3', level: 2,
      title: { zh: '水會淹到哪裡', en: 'Where the water goes' },
      desc: { zh: '顯示「淹水」圖層。', en: 'Show the “Flooding” layer.' },
      check: function (ev) { const d = V(ev); return !!d && d.view === 'map' && d.layer === 'flood'; }
    },
    {
      id: 'gis-overlay-4', level: 3,
      title: { zh: '最高分的地方', en: 'The top score' },
      desc: { zh: '切到加權疊合，點最高分的那一格。', en: 'Switch to the weighted overlay and tap the top-scoring cell.' },
      check: function (ev) { const d = V(ev); return !!d && d.method === 'weight' && !!d.probe && d.probe.k === d.weight.bestK; }
    },
    {
      id: 'gis-overlay-5', level: 3,
      title: { zh: '大水進城', en: 'Flood in town' },
      desc: { zh: '把淹水情境調高，讓住宅區至少 1.5 平方公里淹水。', en: 'Raise the flood scenario until at least 1.5 km² of housing is under water.' },
      check: function (ev) { const d = V(ev); return !!d && d.flood.town >= 1.5 - 1e-9; }
    },
    {
      id: 'gis-overlay-6', level: 4,
      title: { zh: '一塊校地', en: 'A plot for a school' },
      desc: { zh: '學校：每一條都用上、不放寬，點一格每一條都通過的地。', en: 'School: with every rule on and none relaxed, tap a cell that passes them all.' },
      check: function (ev) { const d = V(ev); return strict(d, 'school') && d.method === 'bool' && !!d.probe && d.probe.ok; }
    },
    {
      id: 'gis-overlay-7', level: 4,
      title: { zh: '遠離斷層兩公里', en: 'Two kilometres from the fault' },
      desc: { zh: '焚化廠：其他條件不放寬，離活動斷層至少 2 km，還要剩下至少一塊 0.25 平方公里的連續用地。', en: 'Incinerator: keep every other rule, require 2 km from the fault, and still leave a piece of at least 0.25 km².' },
      check: function (ev) { const d = V(ev); return strict(d, 'incinerator') && d.cfg.fault.v >= 2000 && d.bool.sitesBig >= 1; }
    },
    {
      id: 'gis-overlay-8', level: 5,
      title: { zh: '只剩一塊', en: 'Only one piece left' },
      desc: { zh: '布林疊合、六個條件都用上：可以蓋的地剛好連成一塊。', en: 'Boolean overlay with all six rules on: the suitable land forms exactly one piece.' },
      check: function (ev) { const d = V(ev); return !!d && allOn(d) && d.bool.patches === 1; }
    },
    {
      id: 'gis-overlay-9', level: 5,
      title: { zh: '剛好一平方公里', en: 'Exactly one square kilometre' },
      desc: { zh: '布林疊合、六個條件都用上：可以蓋的面積剛好 1 平方公里（16 格）。', en: 'Boolean overlay with all six rules on: exactly 1 km² (16 cells) is suitable.' },
      check: function (ev) { const d = V(ev); return !!d && allOn(d) && d.bool.cells === 16; }
    },
    {
      id: 'gis-overlay-10', level: 6,
      title: { zh: '兩種方法不一樣', en: 'The methods disagree' },
      desc: { zh: '調整加權疊合的權重，讓最高分的格子在布林疊合裡沒有通過。', en: 'Change the weights so that the top-scoring cell fails the boolean overlay.' },
      check: function (ev) { const d = V(ev); return !!d && d.method === 'weight' && d.weight.bestK >= 0 && !d.weight.bestOk; }
    },
    {
      id: 'gis-overlay-11', level: 6,
      title: { zh: '離家五公里', en: 'Five kilometres from home' },
      desc: { zh: '焚化廠：其他條件不放寬，離住家至少 5 km，還要剩下至少一塊 0.25 平方公里的連續用地。', en: 'Incinerator: keep every other rule, stay at least 5 km from homes, and still leave a piece of at least 0.25 km².' },
      check: function (ev) { const d = V(ev); return strict(d, 'incinerator') && d.cfg.town.v >= 5000 && d.bool.sitesBig >= 1; }
    },
    {
      id: 'gis-overlay-12', level: 7,
      title: { zh: '平平的大太陽能場', en: 'A big, flat solar farm' },
      desc: { zh: '太陽能場：其他條件不放寬，坡度不超過 2%，最大的一塊連續用地至少 5 平方公里。', en: 'Solar farm: keep every other rule, limit the slope to 2%, and keep a single piece of at least 5 km².' },
      check: function (ev) { const d = V(ev); return strict(d, 'solar') && d.cfg.slope.v <= 2 + 1e-9 && d.bool.largest >= 5 - 1e-9; }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'gis-overlay-h1', level: 3, hidden: true,
      riddle: { zh: '雨停了，客廳裡還站著水。', en: 'The rain has stopped; the water still stands in the living room.' },
      check: function (ev) { const d = V(ev); return !!d && !!d.probe && d.probe.land === 1 && d.probe.depth > 0; }
    },
    {
      id: 'gis-overlay-h2', level: 4, hidden: true,
      riddle: { zh: '大地的裂縫，從門前經過。', en: 'The crack in the earth runs past the front door.' },
      check: function (ev) { const d = V(ev); return !!d && !!d.probe && d.probe.land === 1 && d.probe.fault < 125; }
    },
    {
      id: 'gis-overlay-h3', level: 5, hidden: true,
      riddle: { zh: '整個縣，都在你的腳下。', en: 'The whole county lies beneath your feet.' },
      check: function (ev) { const d = V(ev); return !!d && !!d.probe && d.probe.k === tops().z; }
    },
    {
      id: 'gis-overlay-h4', level: 5, hidden: true,
      riddle: { zh: '這裡連山羊都要小心。', en: 'Even a goat would tread carefully here.' },
      check: function (ev) { const d = V(ev); return !!d && !!d.probe && d.probe.k === tops().slope; }
    },
    {
      id: 'gis-overlay-h5', level: 6, hidden: true,
      riddle: { zh: '第十六戶人家的門檻，剛好被淹過。', en: 'The water has just crossed the sixteenth doorstep.' },
      check: function (ev) { const d = V(ev); return !!d && d.layer === 'flood' && d.view === 'map' && Math.abs(d.flood.town - 1) < 1e-9; }
    },
    {
      id: 'gis-overlay-h6', level: 6, hidden: true,
      riddle: { zh: '沒有一條規則，整個縣都說好。', en: 'With no rules at all, the whole county says yes.' },
      check: function (ev) { const d = V(ev); return !!d && d.method === 'bool' && d.bool.cells === K.NX * K.NY; }
    },
    {
      id: 'gis-overlay-h7', level: 7, hidden: true,
      riddle: { zh: '最大的那場雨裡，孩子們還有一間乾的教室。', en: 'In the worst storm, the children still have a dry classroom.' },
      check: function (ev) { const d = V(ev); return strict(d, 'school') && d.cfg.stage >= 6 - 1e-9 && !!d.probe && d.probe.ok; }
    },
    {
      id: 'gis-overlay-h8', level: 7, hidden: true,
      riddle: { zh: '考了第一名，卻被一條規則刷掉。', en: 'Top of the class, yet thrown out by a single rule.' },
      check: function (ev) { const d = V(ev); return !!d && d.method === 'weight' && !d.weight.bestOk && !!d.probe && d.probe.k === d.weight.bestK; }
    },
    {
      id: 'gis-overlay-h9', level: 8, hidden: true,
      riddle: { zh: '三平方公里的鏡子，鋪在幾乎沒有坡的地上。', en: 'Three square kilometres of mirrors on ground with almost no slope.' },
      check: function (ev) { const d = V(ev); return strict(d, 'solar') && d.cfg.slope.v <= 1 + 1e-9 && d.bool.largest >= 3 - 1e-9; }
    },
    {
      id: 'gis-overlay-h10', level: 9, hidden: true,
      riddle: { zh: '校門再往外退五十公尺，就無處可蓋。', en: 'Move the gate back fifty metres more, and there is nowhere left to build.' },
      check: function (ev) {
        const d = V(ev);
        if (!strict(d, 'school') || d.bool.sitesBig < 1) return false;
        const c = JSON.parse(JSON.stringify(d.cfg));
        c.fault.v += 50;
        return K.boolean(c).sitesBig === 0;
      }
    }
  ]);
})();
