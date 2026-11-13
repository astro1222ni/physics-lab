/* missions/time-zones.js — 經緯度、時區與換日線的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/time-zones.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'tz'：日期、時刻、量測點、圖層、地圖中央、飛行設定或 2D／3D 改變時（播放中每 0.25 秒一次）；飛機落地時多帶 flight。
 *     data = TimeZoneCore.snapshot(…) = {
 *       day（UTC 第幾天）, utc（UTC 鐘點）, date：{ m, d }, dec（太陽赤緯°）, eot（均時差，分）, sub：{ lat, lon }（直射點）,
 *       dates（理想時區此刻有幾個日期）, minority（較少的那些日期占地球經度的比例）, cityDates（城市清單裡此刻有幾個不同的日期）,
 *       taipei：{ clock, day, alt, H（時角°，負 = 上午）, dayLen（晝長，小時） },
 *       cities：{ <id>：{ day, clock, alt, H } },
 *       probe：{ lon, lat, city（城市 id 或 null）, zone, off（時鐘的 UTC 偏移）, day, clock, lmt（地方平時）, ast（視太陽時）, alt, H,
 *               dayLen, polar（null／'day'／'night'）, offMinusLmt（鐘比地方平時快幾小時）, lmtMinusTaipei（地方平時比臺北快幾小時）,
 *               dSub（離太陽直射點幾度） },
 *       flight：剛落地的飛行（其他事件為 null）{ dep, arr, dist（km）, dur（小時）, earlierClock, earlierDate, dateDiff, clockDiff,
 *               depDate：{ y, m, d }, arrDate, sunrises, sunsets（途中日出、日落次數）, minAlt（途中最低太陽仰角）,
 *               lmtDrift（飛機下方地方平時最多偏離起點幾小時）, westward, dLon（經度變化，往東為正，跨過 180° 不跳） },
 *       moving（播放中為 true）, view, center, layers }
 *   'cam'：3D 視角按鈕。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const M = function (ev) { return ev.type === 'tz' ? ev.data : null; };
  const within = function (v, lo, hi) { return v != null && v >= lo && v <= hi; };
  const FL = function (d) { return d && d.flight; };
  /** 「調整時刻」類的任務要停下來才算：播放中、或飛機剛落地的那一刻不算（按暫停會再送一次） */
  const still = function (d) { return !!d && !d.moving && !d.flight; };
  /** 兩個鐘點（小時）相差多少（跨午夜也對） */
  const gap = function (a, b) { const x = Math.abs(a - b) % 24; return Math.min(x, 24 - x); };
  const H0 = -0.833;
  const atHorizon = function (c) { return c && within(c.alt, H0 - 0.25, H0 + 0.25); };

  LabMission.register('time-zones', [
    {
      id: 'time-zones-1', level: 1,
      title: { zh: '臺北的中午', en: 'Noon in Taipei' },
      desc: { zh: '調整時刻，讓臺北的時鐘指著中午 12 點（前後 5 分鐘以內）。', en: 'Set the time so that the clocks in Taipei read 12 noon (within 5 minutes).' },
      check: function (ev) { const d = M(ev); return still(d) && gap(d.taipei.clock, 12) <= 5 / 60; }
    },
    {
      id: 'time-zones-2', level: 2,
      title: { zh: '慢兩個小時的經線', en: 'Two hours behind the Sun in Taipei' },
      desc: { zh: '把量測點放在地方平時比臺北慢 2 小時的經線上（臺北 10 點時那裡才 8 點；誤差 1 分鐘以內）。想想看：經度要差幾度？', en: 'Put the measuring point on the meridian whose local mean time is 2 hours behind Taipei’s (10:00 in Taipei, 08:00 there; within 1 minute). How many degrees of longitude is that?' },
      check: function (ev) { const d = M(ev), p = d && d.probe; return !!p && within(p.lmtMinusTaipei, -2 - 1 / 60, -2 + 1 / 60); }
    },
    {
      id: 'time-zones-3', level: 2,
      title: { zh: '太陽直射北回歸線', en: 'The Sun over the Tropic of Cancer' },
      desc: { zh: '把日期調到太陽直射點到達北緯 23.4° 以北的日子。', en: 'Choose a date when the subsolar point reaches 23.4° N or further north.' },
      check: function (ev) { const d = M(ev); return still(d) && d.dec >= 23.4; }
    },
    {
      id: 'time-zones-4', level: 3,
      title: { zh: '晝夜平分', en: 'Equal day and night' },
      desc: { zh: '找一天讓晨昏線剛好通過南北兩極：太陽赤緯在 −0.3° 到 +0.3° 之間。', en: 'Find a day when the terminator passes through both poles: the Sun’s declination between −0.3° and +0.3°.' },
      check: function (ev) { const d = M(ev); return still(d) && within(d.dec, -0.3, 0.3); }
    },
    {
      id: 'time-zones-5', level: 3,
      title: { zh: '時光倒流', en: 'Back in time' },
      desc: { zh: '搭一班飛機：落地和起飛是同一個日期，但落地時當地的鐘，比起飛時出發地的鐘還早。', en: 'Take a flight that lands on the same date it left, with the clock at landing showing an earlier time than the clock at take-off.' },
      check: function (ev) { const F = FL(M(ev)); return !!F && F.earlierClock && F.dateDiff === 0; }
    },
    {
      id: 'time-zones-6', level: 4,
      title: { zh: '全世界幾乎同一天', en: 'Almost one date' },
      desc: { zh: '調整時刻，讓理想時區裡比較少的那個日期，只剩換日線旁的半個時區（占地球不到 2.1%）。', en: 'Set the time so that, in the ideal time zones, the other date covers only the half zone next to the date line (less than 2.1% of the Earth).' },
      check: function (ev) { const d = M(ev); return still(d) && d.dates >= 1 && d.minority <= 0.021; }
    },
    {
      id: 'time-zones-7', level: 4,
      title: { zh: '臺北白天最短的日子', en: 'Taipei’s shortest days' },
      desc: { zh: '找一天，臺北的晝長不到 10 小時 36 分。', en: 'Find a day when daylight in Taipei lasts less than 10 h 36 min.' },
      check: function (ev) { const d = M(ev); return still(d) && d.taipei.dayLen != null && d.taipei.dayLen <= 10.6; }
    },
    {
      id: 'time-zones-8', level: 5,
      title: { zh: '白天 20 小時', en: 'A 20-hour day' },
      desc: { zh: '把量測點放在當天晝長至少 20 小時的地方。', en: 'Put the measuring point somewhere with at least 20 hours of daylight that day.' },
      check: function (ev) { const d = M(ev), p = d && d.probe; return !!p && p.dayLen >= 20; }
    },
    {
      id: 'time-zones-9', level: 5,
      title: { zh: '落地的日期比起飛還早', en: 'Land before you left' },
      desc: { zh: '搭一班飛機，落地時當地的日期比起飛時出發地的日期早一天。', en: 'Take a flight that lands on a date one day earlier than the date it took off.' },
      check: function (ev) { const F = FL(M(ev)); return !!F && F.earlierDate; }
    },
    {
      id: 'time-zones-10', level: 6,
      title: { zh: '臺北的正午不是 12 點', en: 'Solar noon is not 12:00' },
      desc: { zh: '找出太陽在臺北升到最高的那一刻（時角在 ±0.25° 以內），而且那時臺北的鐘離 12:00 至少差 20 分鐘。', en: 'Find the moment the Sun is highest over Taipei (hour angle within ±0.25°) on a day when Taipei’s clocks are then at least 20 minutes away from 12:00.' },
      check: function (ev) { const d = M(ev); return still(d) && Math.abs(d.taipei.H) <= 0.25 && gap(d.taipei.clock, 12) >= 1 / 3; }
    },
    {
      id: 'time-zones-11', level: 7,
      title: { zh: '往東飛，太陽不落', en: 'Eastbound under a Sun that never sets' },
      desc: { zh: '搭一班往東飛越至少 60 個經度、至少 8 小時的飛機，全程飛機正下方都是白天（太陽一次也沒有落下）。往東飛會迎向黑夜，要選什麼季節、什麼航線？', en: 'Take a flight of at least 8 hours that travels at least 60° of longitude eastward, with the Sun above the horizon below the plane the whole way. Flying east carries you towards the night, so which season and which route will work?' },
      check: function (ev) { const F = FL(M(ev)); return !!F && F.dur >= 8 && F.dLon >= 60 && F.minAlt > H0; }
    },
    {
      id: 'time-zones-12', level: 8,
      title: { zh: '太陽直射高雄', en: 'The Sun overhead in Kaohsiung' },
      desc: { zh: '讓高雄的太陽仰角達到 89.5° 以上：太陽幾乎就在頭頂正上方。臺北做得到嗎？', en: 'Make the Sun’s altitude in Kaohsiung at least 89.5°, almost straight overhead. Could Taipei ever do this?' },
      check: function (ev) { const d = M(ev); return still(d) && d.cities.kaohsiung.alt >= 89.5; }
    },
    // ---------- 隱藏任務 ----------
    {
      id: 'time-zones-h1', level: 3, hidden: true,
      riddle: { zh: '半夜十二點，還得戴上墨鏡。', en: 'At midnight you still need your sunglasses.' },
      check: function (ev) { const d = M(ev), p = d && d.probe; return !!p && gap(p.lmt, 0) <= 0.25 && p.alt > 0; }
    },
    {
      id: 'time-zones-h2', level: 4, hidden: true,
      riddle: { zh: '三個鐘，難得說了同一句話。', en: 'Three clocks, for once, say the same thing.' },
      check: function (ev) {
        const d = M(ev), p = d && d.probe;
        return !!p && gap(p.clock, p.lmt) <= 1 / 60 && gap(p.clock, p.ast) <= 1 / 60;
      }
    },
    {
      id: 'time-zones-h3', level: 5, hidden: true,
      riddle: { zh: '一杯咖啡的時間，日曆卻撕回去一頁。', en: 'In the time it takes to drink a coffee, the calendar turns back a page.' },
      check: function (ev) { const F = FL(M(ev)); return !!F && F.dist < 300 && F.earlierDate; }
    },
    {
      id: 'time-zones-h4', level: 6, hidden: true,
      riddle: { zh: '三本日曆翻在三個不同的頁，而你站在最邊邊。', en: 'Three calendars open on three different pages, and you stand at the very edge.' },
      check: function (ev) {
        const d = M(ev), p = d && d.probe;
        return !!p && d.cityDates >= 3 && (p.city === 'kiritimati' || p.city === 'pagopago');
      }
    },
    {
      id: 'time-zones-h5', level: 6, hidden: true,
      riddle: { zh: '正午時分，滿天星斗。', en: 'High noon, and the sky is full of stars.' },
      check: function (ev) { const d = M(ev), p = d && d.probe; return !!p && gap(p.lmt, 12) <= 0.25 && p.alt < -6; }
    },
    {
      id: 'time-zones-h6', level: 5, hidden: true,
      riddle: { zh: '南方的正午，影子躲進了腳底。', en: 'Noon in the south: your shadow hides under your feet.' },
      check: function (ev) { const d = M(ev), p = d && d.probe; return !!p && p.lat < 0 && p.dSub <= 0.5; }
    },
    {
      id: 'time-zones-h7', level: 7, hidden: true,
      riddle: { zh: '一路向西，時間像是停住了。', en: 'Heading west, time seems to stand still.' },
      check: function (ev) { const F = FL(M(ev)); return !!F && F.dur >= 4 && F.westward && F.lmtDrift <= 1 / 3; }
    },
    {
      id: 'time-zones-h8', level: 8, hidden: true,
      riddle: { zh: '家鄉的雞啼，正是遠方的晚鐘。', en: 'The rooster crowing at home is the evening bell far away.' },
      check: function (ev) {
        const d = M(ev);
        if (!d) return false;
        const tp = d.cities.taipei;
        if (!atHorizon(tp) || tp.H >= 0) return false;
        return Object.keys(d.cities).some(function (id) { const c = d.cities[id]; return id !== 'taipei' && id !== 'kaohsiung' && atHorizon(c) && c.H > 0; });
      }
    },
    {
      id: 'time-zones-h9', level: 9, hidden: true,
      riddle: { zh: '同一張登機證，迎接了兩個早晨。', en: 'One boarding pass, two mornings.' },
      check: function (ev) { const F = FL(M(ev)); return !!F && F.dur <= 12 && F.sunrises >= 2; }
    },
    {
      id: 'time-zones-h10', level: 8, hidden: true,
      riddle: { zh: '舉杯兩次，送走同一年。', en: 'Raise your glass twice to see off the same year.' },
      check: function (ev) {
        const F = FL(M(ev));
        return !!F && F.dist >= 1000 && F.earlierDate && F.depDate.m === 1 && F.depDate.d === 1 && F.arrDate.m === 12 && F.arrDate.d === 31;
      }
    }
  ]);
})();
