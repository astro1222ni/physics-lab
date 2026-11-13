/* missions/humidity-dewpoint.js — 溼度與露點的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/humidity-dewpoint.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'state'：任何設定改變時；'run'：溼球穩定了、杯子起霧（runKind 'onset'）或冷卻結束（runKind 'end'）、一天播完。
 *   共同欄位：mode（'psy'、'cup'、'day'）, chart, anim。
 *   乾溼球：T（氣溫）, rh（真正的相對溼度 0–1）, z（海拔 m）, p（hPa）, type（'vent' 通風、'still' 百葉箱）, e, Td, Tw（溼球的平衡溫度）,
 *     Tread（溼球現在的讀數）, dT（乾球 − 溼球讀數）, settled（溼球穩定了）, rhRead（用這個海拔與種類的公式算出的溼度）,
 *     rhSea（同樣的讀數用海平面氣壓算）, rhWrong（同樣的讀數用通風的係數算）。
 *   冷杯子：T, rh, e, Td（露點）, Tf（霜點）, bath（'cold'、'ice'、'salt'）, Tcup, t, fog, kind（'dew'、'frost'；還沒起霧是 null）,
 *     fogAt（起霧時的杯溫）, err（fogAt − 真正的露點或霜點）, runKind。
 *   一天：Tmean, range, Td0（清晨以前的露點）, h, T, rh, Td, sat, frost, minRH, maxRH, satAny, frostAny, satAll, Tmin, tp（開始結露或結霜的溫度）,
 *     frozenDew（先結露再結冰）, wx（預設天氣代號；自己調過是 ''）。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const YUSHAN = 3952;
  const runOf = function (ev, m) { const d = ev.type === 'run' ? ev.data : null; return d && d.mode === m ? d : null; };
  const psy = function (ev) { const d = runOf(ev, 'psy'); return d && d.settled ? d : null; };
  const fog = function (ev, kind) { const d = runOf(ev, 'cup'); return d && d.kind && (!kind || d.kind === kind) ? d : null; };
  const day = function (ev) { return runOf(ev, 'day'); };

  LabMission.register('humidity-dewpoint', [
    {
      id: 'humidity-dewpoint-1', level: 1,
      title: { zh: '溼的比較冷', en: 'Wet is colder' },
      desc: { zh: '在「乾溼球溫度計」按「開始量」，等溼球的讀數穩定下來。', en: 'In “Wet and dry bulbs”, press “Start reading” and wait for the wet bulb to settle.' },
      check: function (ev) { return !!psy(ev); }
    },
    {
      id: 'humidity-dewpoint-2', level: 2,
      title: { zh: '杯子流汗了', en: 'The cup is sweating' },
      desc: { zh: '在「冷杯子找露點」把杯子冷卻到外面起霧。', en: 'In “The sweating cup”, cool the cup until its outside mists up.' },
      check: function (ev) { return !!fog(ev); }
    },
    {
      id: 'humidity-dewpoint-3', level: 2,
      title: { zh: '過完一天', en: 'A whole day' },
      desc: { zh: '在「一天的溼度」按「播放一天」，看完 24 小時。', en: 'In “Humidity over a day”, press “Play a day” and watch all 24 hours.' },
      check: function (ev) { return !!day(ev); }
    },
    {
      id: 'humidity-dewpoint-4', level: 3,
      title: { zh: '乾燥的空氣', en: 'Dry air' },
      desc: { zh: '量到乾球和溼球相差 8 °C 以上。', en: 'Get a difference of at least 8 °C between the dry and wet bulbs.' },
      check: function (ev) { const d = psy(ev); return !!d && d.dT >= 8; }
    },
    {
      id: 'humidity-dewpoint-5', level: 3,
      title: { zh: '杯子結霜', en: 'Frost on the cup' },
      desc: { zh: '讓冷杯子一開始就結霜（不是先起霧）：空氣要夠乾，露點在 0 °C 以下。', en: 'Make the cold cup grow frost first (not mist): the air must be dry enough for the dew point to be below 0 °C.' },
      check: function (ev) { return !!fog(ev, 'frost'); }
    },
    {
      id: 'humidity-dewpoint-6', level: 3,
      title: { zh: '清晨的露水', en: 'Morning dew' },
      desc: { zh: '播放一天，讓草上結露水（不是霜）。', en: 'Play a day with dew (not frost) forming on the grass.' },
      check: function (ev) { const d = day(ev); return !!d && d.satAny && !d.frostAny; }
    },
    {
      id: 'humidity-dewpoint-7', level: 4,
      title: { zh: '一半的溼度', en: 'Half humid' },
      desc: { zh: '量出相對溼度 50 %（49–51 %），而且乾溼球相差 7 °C 以上。', en: 'Measure a relative humidity of 50 % (49–51 %) with the bulbs at least 7 °C apart.' },
      check: function (ev) { const d = psy(ev); return !!d && Math.abs(d.rhRead - 0.5) <= 0.01 && d.dT >= 7; }
    },
    {
      id: 'humidity-dewpoint-8', level: 4,
      title: { zh: '悶熱的夏天', en: 'Muggy summer' },
      desc: { zh: '在露點 24 °C 以上的空氣裡讓杯子起霧。', en: 'Mist up the cup in air whose dew point is 24 °C or higher.' },
      check: function (ev) { const d = fog(ev); return !!d && d.Td >= 24; }
    },
    {
      id: 'humidity-dewpoint-9', level: 5,
      title: { zh: '三倍的溼度', en: 'Three times as humid' },
      desc: { zh: '播放一天，讓一天裡最高的相對溼度是最低的 3 倍以上。', en: 'Play a day in which the highest relative humidity is at least 3 times the lowest.' },
      check: function (ev) { const d = day(ev); return !!d && d.minRH > 0 && d.maxRH / d.minRH >= 3; }
    },
    {
      id: 'humidity-dewpoint-10', level: 5,
      title: { zh: '高山上的表', en: 'A table for the mountains' },
      desc: { zh: '在海拔 2500 m 以上量溼度，這時候用海平面的表會少算 5 % 以上。', en: 'Measure humidity 2500 m or higher up, where the sea-level table comes out at least 5 % too low.' },
      check: function (ev) { const d = psy(ev); return !!d && d.z >= 2500 && d.rhRead - d.rhSea >= 0.05; }
    },
    {
      id: 'humidity-dewpoint-11', level: 6,
      title: { zh: '量露點', en: 'Measuring the dew point' },
      desc: { zh: '用冷杯子量露點，起霧的杯溫和真正的露點差不到 0.4 °C。', en: 'Measure the dew point with the cold cup: the cup temperature at the first mist is within 0.4 °C of the true dew point.' },
      check: function (ev) { const d = fog(ev, 'dew'); return !!d && Math.abs(d.err) <= 0.4; }
    },
    {
      id: 'humidity-dewpoint-12', level: 7,
      title: { zh: '剛好碰到露點', en: 'Just touching the dew point' },
      desc: { zh: '播放一天，讓最低溫只比開始結露（結霜）的溫度低 0.2 °C 以內：剛剛好有露水。', en: 'Play a day whose minimum temperature is at most 0.2 °C below the temperature where dew (frost) starts: just barely dewy.' },
      check: function (ev) { const d = day(ev); return !!d && d.satAny && d.tp - d.Tmin <= 0.2; }
    },
    // ---------- 隱藏任務 ----------
    {
      id: 'humidity-dewpoint-h1', level: 3, hidden: true,
      title: { zh: '差一點點', en: 'Not quite' },
      riddle: { zh: '冰塊放進去，杯子還是乾的，只差一點點。', en: 'Ice goes in, the cup stays dry, by a hair.' },
      desc: { zh: '空氣的露點在 0–0.5 °C：冰水（0.5 °C）冷到底，杯子還是不會起霧。', en: 'With the air’s dew point at 0–0.5 °C, ice water (0.5 °C) cools the cup all the way down and it still never mists.' },
      check: function (ev) { const d = runOf(ev, 'cup'); return !!d && d.runKind === 'end' && d.bath === 'ice' && !d.kind && d.Td >= 0; }
    },
    {
      id: 'humidity-dewpoint-h2', level: 4, hidden: true,
      title: { zh: '一整天的霧', en: 'Fog all day' },
      riddle: { zh: '中午也沒有散，只是剛剛好。', en: 'Even at noon it would not lift, but only just.' },
      desc: { zh: '露點只比一天的最高溫高 0.05–0.3 °C：空氣整天飽和，連最熱的時候也剛好起霧。', en: 'A dew point just 0.05–0.3 °C above the day’s maximum: the air is saturated all day, foggy even at the warmest moment, but only just.' },
      check: function (ev) { const d = day(ev); if (!d || !d.satAll) return false; const x = d.Td0 - (d.Tmean + d.range / 2); return x >= 0.05 && x <= 0.3; }
    },
    {
      id: 'humidity-dewpoint-h3', level: 5, hidden: true,
      title: { zh: '高於冰點的冰', en: 'Ice above freezing' },
      riddle: { zh: '空氣不冷，紗布卻結冰了。', en: 'The air is not cold, yet the cloth has frozen.' },
      desc: { zh: '氣溫 6 °C 以上，溼球卻冷到 0 °C 以下：空氣很乾，蒸發吸熱讓紗布結冰。', en: 'Air at 6 °C or warmer, yet the wet bulb below 0 °C: the air is so dry that evaporation freezes the cloth.' },
      check: function (ev) { const d = psy(ev); return !!d && d.T >= 6 && d.Tw < 0; }
    },
    {
      id: 'humidity-dewpoint-h4', level: 5, hidden: true,
      title: { zh: '沒有風的箱子', en: 'A box without wind' },
      riddle: { zh: '箱子裡的讀數，拿風的表來查。', en: 'The box’s reading, looked up in the windy table.' },
      desc: { zh: '氣溫 10 °C 以上，用百葉箱量；如果誤用通風的表查，溼度會多算 8 % 以上（沒有風，溼球冷得比較少）。', en: 'At 10 °C or warmer, read the screen thermometers; looking them up in the ventilated table would overstate the humidity by at least 8 % (without wind the wet bulb cools less).' },
      check: function (ev) { const d = psy(ev); return !!d && d.type === 'still' && d.T >= 10 && d.rhWrong - d.rhRead >= 0.08; }
    },
    {
      id: 'humidity-dewpoint-h5', level: 6, hidden: true,
      title: { zh: '東北亞最高', en: 'Highest in Northeast Asia' },
      riddle: { zh: '比富士山還高一點的地方。', en: 'A little higher than Mount Fuji.' },
      desc: { zh: '在玉山主峰的高度（3952 m，±10 m）量溼度。', en: 'Measure humidity at the height of Yushan’s main peak (3952 m, ±10 m).' },
      check: function (ev) { const d = psy(ev); return !!d && Math.abs(d.z - YUSHAN) <= 10; }
    },
    {
      id: 'humidity-dewpoint-h6', level: 6, hidden: true,
      title: { zh: '凍住的露珠', en: 'Frozen dew' },
      riddle: { zh: '先是水珠，天亮前變成冰珠。', en: 'Water beads first, ice beads before dawn.' },
      desc: { zh: '露點在 0 °C 以上（但比最高溫低），最低溫卻在 0 °C 以下：先結露水，再結冰（凍露）。', en: 'A dew point above 0 °C (but below the maximum) and a minimum below 0 °C: dew forms first and then freezes (frozen dew).' },
      check: function (ev) { const d = day(ev); return !!d && d.frozenDew && !d.satAll; }
    },
    {
      id: 'humidity-dewpoint-h7', level: 7, hidden: true,
      title: { zh: '慢慢冷', en: 'Cool it slowly' },
      riddle: { zh: '冷得越慢，看得越準。', en: 'The slower it cools, the truer it reads.' },
      desc: { zh: '冷杯子量露點，起霧的杯溫和真正的露點差不到 0.1 °C：冷卻的東西只比露點低一點點。', en: 'Measure the dew point with the cup to within 0.1 °C: the coolant is only a little below the dew point.' },
      check: function (ev) { const d = fog(ev, 'dew'); return !!d && Math.abs(d.err) <= 0.1; }
    },
    {
      id: 'humidity-dewpoint-h8', level: 8, hidden: true,
      title: { zh: '流汗也沒用', en: 'Sweating won’t help' },
      riddle: { zh: '溼的皮膚，也降不到這個溫度以下。', en: 'Even wet skin cannot cool below this.' },
      desc: { zh: '溼球溫度 35–35.5 °C（乾溼球相差 2 °C 以上）：人體流汗也散不了熱的極限。', en: 'A wet-bulb temperature of 35–35.5 °C (bulbs at least 2 °C apart): the limit where even sweating cannot shed body heat.' },
      check: function (ev) { const d = psy(ev); return !!d && d.Tw >= 35 && d.Tw <= 35.5 && d.dT >= 2; }
    },
    {
      id: 'humidity-dewpoint-h9', level: 9, hidden: true,
      title: { zh: '量霜點', en: 'Measuring the frost point' },
      riddle: { zh: '鹽和冰，只比它冷一點點。', en: 'Salt and ice, only a touch colder than it.' },
      desc: { zh: '冷杯子量霜點，結霜的杯溫和真正的霜點差不到 0.1 °C。', en: 'Measure the frost point with the cup to within 0.1 °C.' },
      check: function (ev) { const d = fog(ev, 'frost'); return !!d && Math.abs(d.err) <= 0.1; }
    },
    {
      id: 'humidity-dewpoint-h10', level: 8, hidden: true,
      title: { zh: '乾的白霜', en: 'Dry frost' },
      riddle: { zh: '下午乾得像沙漠，清晨卻一片白。', en: 'Desert-dry in the afternoon, white at dawn.' },
      desc: { zh: '一天裡最低的相對溼度在 35 % 以下，清晨卻結霜。', en: 'The lowest relative humidity of the day is 35 % or less, yet frost forms at dawn.' },
      check: function (ev) { const d = day(ev); return !!d && d.minRH <= 0.35 && d.frostAny; }
    }
  ]);
})();
