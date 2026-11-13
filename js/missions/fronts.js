/* missions/fronts.js — 冷鋒、暖鋒與梅雨鋒面的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/fronts.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'state'：任何設定改變時；'run'：鋒面通過的紀錄播完時送一次，data.done = true。
 *   共同欄位：mode（'cold'、'warm'、'stat'）, chart, anim, preset（'def'、'surge'、'dry'、'humid'、'jet'、'south'；自己調過是 ''）,
 *     Tw, Tdw, Tc, Tdc（暖、冷氣團的氣溫與露點 °C）, N（坡度 1 : N）, U（鋒面移動 km/h）, V（暖空氣爬坡 m/s）,
 *     w（上升速度 m/s）, zl（凝結高度 m）, band（地面雨帶寬 km；雲底超過 2 km 是 null）, bandHours, rain0, shear（Margules 風切 m/s）, t。
 *   紀錄播完（done）再加：total（雨量 mm）, hours（下雨時數）, peak（最大降水率 mm/h）, dT, dTd（結束 − 開始）, dP（hPa）, pMin, pMax,
 *     wind0, wind1（風從哪裡吹來的度數）, clouds（依序看到的雲：'cs' 卷層雲、'as' 高層雲、'ns' 雨層雲、'cb' 積雨雲，用逗號接起來）,
 *     passed（鋒面線通過測站）, capped（72 小時還沒走完）, tFront, tStart, tEnd, max1、max3、max24（任意連續 1、3、24 小時的最大雨量）,
 *     tCloud（第一次看到鋒面雲的時刻）, snow（地面 0 °C 以下時落下的量：雪）。
 * 中央氣象署的雨量分級：大雨＝24 小時 80 mm 或 1 小時 40 mm；豪雨＝24 小時 200 mm 或 3 小時 100 mm；大豪雨＝24 小時 350 mm；超大豪雨＝24 小時 500 mm。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const done = function (ev, mode) { const d = ev.type === 'run' ? ev.data : null; return d && d.done && (!mode || d.mode === mode) ? d : null; };
  const has = function (d, k) { return (',' + d.clouds + ',').indexOf(',' + k + ',') >= 0; };
  const lead = function (d) { return d.tStart != null && d.tCloud != null ? d.tStart - d.tCloud : null; };

  LabMission.register('fronts', [
    {
      id: 'fronts-1', level: 1,
      title: { zh: '冷鋒過境', en: 'A cold front passes' },
      desc: { zh: '在「冷鋒」按「讓鋒面通過」，看完測站的紀錄。', en: 'With “Cold front”, press “Let the front pass” and watch the station record to the end.' },
      check: function (ev) { const d = done(ev, 'cold'); return !!d && d.passed; }
    },
    {
      id: 'fronts-2', level: 2,
      title: { zh: '暖鋒過境', en: 'A warm front passes' },
      desc: { zh: '在「暖鋒」讓鋒面通過測站，看完紀錄。', en: 'With “Warm front”, let the front pass the station and watch the record to the end.' },
      check: function (ev) { const d = done(ev, 'warm'); return !!d && d.passed; }
    },
    {
      id: 'fronts-3', level: 2,
      title: { zh: '梅雨季', en: 'Plum rain season' },
      desc: { zh: '在「梅雨鋒面」看完一次測站的紀錄。', en: 'With “Plum rain front”, watch one station record to the end.' },
      check: function (ev) { return !!done(ev, 'stat'); }
    },
    {
      id: 'fronts-4', level: 3,
      title: { zh: '卷雲是預告', en: 'Cirrus gives warning' },
      desc: { zh: '暖鋒來之前先看到卷層雲，12 小時以後才開始下雨。', en: 'Ahead of a warm front, see cirrostratus first, with the rain starting 12 hours or more later.' },
      check: function (ev) { const d = done(ev, 'warm'); return !!d && d.clouds.indexOf('cs') === 0 && d.total > 0 && lead(d) >= 12; }
    },
    {
      id: 'fronts-5', level: 3,
      title: { zh: '乾冷鋒', en: 'A dry cold front' },
      desc: { zh: '讓冷鋒通過，地面卻一滴雨也沒下：暖空氣要夠乾，雲底高過 2 km。', en: 'Let a cold front pass without a single drop reaching the ground: the warm air must be dry enough for the cloud base to be above 2 km.' },
      check: function (ev) { const d = done(ev, 'cold'); return !!d && d.passed && d.total === 0; }
    },
    {
      id: 'fronts-6', level: 4,
      title: { zh: '大雨特報', en: 'Heavy rain advisory' },
      desc: { zh: '達到中央氣象署大雨的標準：任意 1 小時 40 mm 以上，或 24 小時 80 mm 以上。', en: 'Reach the Central Weather Administration’s level of heavy rain: 40 mm or more in any 1 hour, or 80 mm or more in 24 hours.' },
      check: function (ev) { const d = done(ev); return !!d && (d.max1 >= 40 || d.max24 >= 80); }
    },
    {
      id: 'fronts-7', level: 4,
      title: { zh: '寒流南下', en: 'A cold surge' },
      desc: { zh: '冷鋒過後氣溫下降 15 °C 以上。', en: 'Make the temperature drop by 15 °C or more after a cold front.' },
      check: function (ev) { const d = done(ev, 'cold'); return !!d && d.passed && d.dT <= -15; }
    },
    {
      id: 'fronts-8', level: 5,
      title: { zh: '豪雨特報', en: 'Extremely heavy rain' },
      desc: { zh: '達到豪雨的標準：任意 24 小時 200 mm 以上，或 3 小時 100 mm 以上。', en: 'Reach the level of extremely heavy rain: 200 mm or more in any 24 hours, or 100 mm or more in 3 hours.' },
      check: function (ev) { const d = done(ev); return !!d && (d.max24 >= 200 || d.max3 >= 100); }
    },
    {
      id: 'fronts-9', level: 5,
      title: { zh: '綿綿細雨', en: 'Endless drizzle' },
      desc: { zh: '暖鋒的雨下 15 小時以上，但每小時都不超過 3 mm。', en: 'Make warm-front rain last 15 hours or more without ever exceeding 3 mm per hour.' },
      check: function (ev) { const d = done(ev, 'warm'); return !!d && d.hours >= 15 && d.peak <= 3; }
    },
    {
      id: 'fronts-10', level: 6,
      title: { zh: '冷鋒帶來 100 mm', en: '100 mm from a cold front' },
      desc: { zh: '一道冷鋒通過，讓測站的雨量達到 100 mm 以上。', en: 'Get 100 mm or more of rain at the station from one cold front.' },
      check: function (ev) { const d = done(ev, 'cold'); return !!d && d.total >= 100; }
    },
    {
      id: 'fronts-11', level: 7,
      title: { zh: '大豪雨', en: 'Torrential rain' },
      desc: { zh: '任意 24 小時下 350 mm 以上（大豪雨）。', en: 'Get 350 mm or more in any 24 hours (torrential rain).' },
      check: function (ev) { const d = done(ev); return !!d && d.max24 >= 350; }
    },
    {
      id: 'fronts-12', level: 9,
      title: { zh: '超大豪雨', en: 'Extremely torrential rain' },
      desc: { zh: '任意 24 小時下 500 mm 以上（超大豪雨）。', en: 'Get 500 mm or more in any 24 hours (extremely torrential rain).' },
      check: function (ev) { const d = done(ev); return !!d && d.max24 >= 500; }
    },

    // ───── 隱藏任務 ─────
    {
      id: 'fronts-h1', level: 3, hidden: true,
      title: { zh: '雨幡', en: 'Virga' },
      riddle: { zh: '天上在下，地上是乾的。', en: 'It falls up there; down here it stays dry.' },
      desc: { zh: '暖鋒的高層雲下了雨，但雲底在 2–2.2 km，雨在半空蒸發，地面一滴也沒有。', en: 'Warm-front altostratus rains, but with the cloud base at 2–2.2 km the rain evaporates on the way down and none reaches the ground.' },
      check: function (ev) { const d = done(ev, 'warm'); return !!d && d.total === 0 && has(d, 'as') && d.zl >= 2000 && d.zl <= 2200; }
    },
    {
      id: 'fronts-h2', level: 4, hidden: true,
      title: { zh: '寒流', en: 'Cold wave' },
      riddle: { zh: '數到十，就有名字了。', en: 'Count down to ten and it earns a name.' },
      desc: { zh: '冷鋒過後氣溫降了 10 °C 以上，剛好降到 8–10 °C：中央氣象署以臺北 10 °C 以下稱為寒流。', en: 'After a cold front the temperature falls by 10 °C or more, landing at 8–10 °C: Taiwan calls it a cold wave when Taipei drops to 10 °C or below.' },
      check: function (ev) { const d = done(ev, 'cold'); if (!d || !d.passed) return false; const T1 = d.Tw + d.dT; return d.dT <= -10 && T1 >= 8 && T1 <= 10; }
    },
    {
      id: 'fronts-h3', level: 5, hidden: true,
      title: { zh: '一公里的雲底', en: 'A one-kilometre base' },
      riddle: { zh: '差八度，高一千。', en: 'Eight degrees apart, a thousand up.' },
      desc: { zh: '暖空氣的凝結高度在 990–1010 m：氣溫和露點每差 1 °C，雲底大約高 125 m。', en: 'Put the warm air’s condensation level at 990–1010 m: each 1 °C between temperature and dew point raises the cloud base by about 125 m.' },
      check: function (ev) { const d = done(ev); return !!d && Math.abs(d.zl - 1000) <= 10; }
    },
    {
      id: 'fronts-h4', level: 6, hidden: true,
      title: { zh: '一天前的預告', en: 'A day’s notice' },
      riddle: { zh: '白色的羽毛，明天的雨。', en: 'White feathers today, rain tomorrow.' },
      desc: { zh: '暖鋒從看到卷層雲到開始下雨，剛好隔 24 小時（23.8–24.2 小時）。', en: 'Make the warm-front rain start 24 hours (23.8–24.2 h) after the cirrostratus first appears.' },
      check: function (ev) { const d = done(ev, 'warm'); const l = d && lead(d); return !!d && d.total > 0 && l != null && l >= 23.8 && l <= 24.2; }
    },
    {
      id: 'fronts-h5', level: 6, hidden: true,
      title: { zh: '短延時強降雨', en: 'A short, violent burst' },
      riddle: { zh: '三個鐘頭就夠了，一整天反而不夠。', en: 'Three hours is enough; a whole day is not.' },
      desc: { zh: '3 小時就下了 100 mm 以上，達到豪雨，但 24 小時的雨量不到 200 mm。', en: 'Reach extremely heavy rain with 100 mm or more in 3 hours while the 24-hour total stays below 200 mm.' },
      check: function (ev) { const d = done(ev); return !!d && d.max3 >= 100 && d.max24 < 200; }
    },
    {
      id: 'fronts-h6', level: 7, hidden: true,
      title: { zh: '平地下雪', en: 'Snow on the plain' },
      riddle: { zh: '冷一點點，雨就換了衣服。', en: 'A touch colder and the rain changes its coat.' },
      desc: { zh: '冷氣團只有 −2–0 °C，冷鋒過後卻下了 10 mm 以上的雪（以融化的水量計）。', en: 'With the cold air only −2 to 0 °C, get 10 mm or more of snow (as melted water) behind a cold front.' },
      check: function (ev) { const d = done(ev, 'cold'); return !!d && d.Tc >= -2 && d.Tc <= 0 && d.snow >= 10; }
    },
    {
      id: 'fronts-h7', level: 7, hidden: true,
      title: { zh: '連下三天', en: 'Three days of rain' },
      riddle: { zh: '它不走，雨也不走。', en: 'It will not leave, and neither will the rain.' },
      desc: { zh: '梅雨鋒面的雨下了 60 小時以上、72 小時到了還沒停，其中有 24 小時下到 350 mm 以上（大豪雨）。', en: 'Make plum-rain-front rain last 60 hours or more, still falling when 72 hours are up, with 350 mm or more in some 24 hours (torrential rain).' },
      check: function (ev) { const d = done(ev, 'stat'); return !!d && d.capped && d.hours >= 60 && d.max24 >= 350; }
    },
    {
      id: 'fronts-h8', level: 8, hidden: true,
      title: { zh: '慢吞吞的冷鋒', en: 'A sluggish cold front' },
      riddle: { zh: '腳步越慢，傘越不能收。', en: 'The slower it walks, the longer the umbrella stays open.' },
      desc: { zh: '冷鋒走得慢，任意 24 小時下了 200 mm 以上：雨量 = 雨帶上的降水率 ÷ 鋒面速度。', en: 'Slow the cold front down until it drops 200 mm or more in some 24 hours: rainfall = rain rate across the band ÷ the front’s speed.' },
      check: function (ev) { const d = done(ev, 'cold'); return !!d && d.max24 >= 200; }
    },
    {
      id: 'fronts-h9', level: 9, hidden: true,
      title: { zh: '雪轉雨', en: 'Snow turning to rain' },
      riddle: { zh: '先白後溼，暖意在後頭。', en: 'White first, then wet; the warmth comes last.' },
      desc: { zh: '冷氣團 −2–0 °C，暖鋒前先下 5 mm 以上的雪，鋒面靠近、氣溫升過 0 °C 後又下了 1 mm 以上的雨。', en: 'With the cold air at −2 to 0 °C, get 5 mm or more of snow ahead of a warm front, then 1 mm or more of rain once the temperature climbs above 0 °C.' },
      check: function (ev) { const d = done(ev, 'warm'); return !!d && d.Tc >= -2 && d.Tc <= 0 && d.snow >= 5 && d.total - d.snow >= 1; }
    },
    {
      id: 'fronts-h10', level: 10, hidden: true,
      title: { zh: '一公尺的雨', en: 'A metre of rain' },
      riddle: { zh: '走得完的雨，也能淹到腰。', en: 'Rain that does move on can still reach your waist.' },
      desc: { zh: '梅雨鋒面在 72 小時內走過測站、雨也停了，這一場卻下了 1000 mm 以上。', en: 'Let the plum rain front pass the station and the rain stop within 72 hours, yet total 1000 mm or more.' },
      check: function (ev) { const d = done(ev, 'stat'); return !!d && !d.capped && d.total >= 1000; }
    }
  ]);
})();
