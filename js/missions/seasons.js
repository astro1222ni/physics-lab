/* missions/seasons.js — 四季與太陽軌跡的任務（星星數 = 等級 1–10）
 *
 * 事件（js/seasons.js 只在使用者動手之後回報；頁面載入時的自動播放不算）：
 *   'state'：使用者改了任何設定（地點、緯度、日期、時刻、傾角、選項、拖曳、鍵盤），以及使用者按下播放後每 0.25 秒；
 *   'sunrise'：使用者按「播放」後，太陽升過地平線（h0 = −0.833° 或 0°）；
 *   'midnight'：播放中，太陽在午夜（時角 ±180°）仍在地平線上；
 *   'trace'：竿影尖端的紀錄多了一點（span：記錄了幾小時，count：幾個點）；
 *   'analemma'：「一年」模式中，每天同一時刻的太陽位置記錄到 300 天以上（days、upDays）。
 * data：seasons-core 的 snapshot（lat, lon, zone, day, clock, eps, refract, atmos, dec, R, H, alt, az, zen,
 *   ratio（影長 ÷ 竿長，太陽在地平線下為 Infinity）, shadowAz, noon, noonAlt, rise, set, dayLen, polar（'day'|'night'|null）,
 *   riseAz, setAz, I, Q, Qeq（MJ/m²）…）＋ loc（地點代號或 'custom'）, season（'mar'|'jun'|'sep'|'dec'|null：
 *   當地這一天是否為二分二至）, realTilt（傾角是 23.44°）, mode（'day'|'year'）, playing。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const n180 = function (x) { x = ((x % 360) + 360) % 360; return x >= 180 ? x - 360 : x; };
  const still = function (ev) { return ev.type === 'state' && !ev.data.playing; };

  LabMission.register('seasons', [
    {
      id: 'seasons-1', level: 1,
      title: { zh: '看日出', en: 'Watch the sunrise' },
      desc: { zh: '按「播放」讓時間前進，看太陽從地平線升起。', en: 'Press “Play” to let time run and watch the Sun come up over the horizon.' },
      check: function (ev) { return ev.type === 'sunrise'; }
    },
    {
      id: 'seasons-2', level: 2,
      title: { zh: '影子指向正北', en: 'Shadow due north' },
      desc: { zh: '停在某一刻，讓竿影指向正北（誤差 1° 以內）。', en: 'Stop at a moment when the pole’s shadow points due north (within 1°).' },
      check: function (ev) { const d = ev.data; return still(ev) && d.alt > 2 && d.ratio >= 0.01 && d.shadowAz != null && Math.abs(n180(d.shadowAz)) <= 1; } // 影子要看得到（至少竿長的 1%）
    },
    {
      id: 'seasons-3', level: 3,
      title: { zh: '臺北冬至的長影', en: 'Taipei’s long winter shadow' },
      desc: { zh: '在臺北的冬至那天，停在正午前後 5 分鐘內：這是一年之中正午竿影最長的一天。', en: 'In Taipei on the December solstice, stop within 5 minutes of noon: the noon shadow is the longest of the year.' },
      check: function (ev) {
        const d = ev.data;
        return still(ev) && d.loc === 'taipei' && d.season === 'dec' && d.realTilt && Math.abs(d.clock - d.noon) <= 5 / 60;
      }
    },
    {
      id: 'seasons-4', level: 3,
      title: { zh: '太陽不下山', en: 'The Sun that never sets' },
      desc: { zh: '用真實的地軸傾角，找一個地點和日期，讓太陽一整天都不落下（永晝）。', en: 'With the real axial tilt, find a place and a date where the Sun does not set all day (midnight sun).' },
      check: function (ev) { const d = ev.data; return ev.type === 'state' && d.realTilt && d.polar === 'day'; }
    },
    {
      id: 'seasons-5', level: 4,
      title: { zh: '影子和竿子一樣長', en: 'Shadow as long as the pole' },
      desc: { zh: '停在某一刻，讓竿影的長度等於竿長（誤差 0.5% 以內）。這時太陽的高度角是多少？', en: 'Stop at a moment when the shadow is exactly as long as the pole (within 0.5%). How high is the Sun then?' },
      check: function (ev) { const d = ev.data; return still(ev) && d.alt > 0 && Math.abs(d.ratio - 1) <= 0.005; }
    },
    {
      id: 'seasons-6', level: 4,
      title: { zh: '夏至的天頂', en: 'Overhead at the June solstice' },
      desc: { zh: '用真實傾角，在夏至那天找一個地方，讓太陽正好在頭頂：竿影短到不到竿長的 0.5%。', en: 'With the real tilt, on the June solstice find a place where the Sun is straight overhead: the shadow is shorter than 0.5% of the pole.' },
      check: function (ev) { const d = ev.data; return still(ev) && d.season === 'jun' && d.realTilt && d.alt > 0 && d.ratio <= 0.005; }
    },
    {
      id: 'seasons-7', level: 5,
      title: { zh: '南半球的影子', en: 'A southern shadow' },
      desc: { zh: '在雪梨，12 月冬至那天（南半球的夏至），停在竿影指向正南的時刻（誤差 1° 以內）。', en: 'In Sydney on the December solstice (midsummer in the south), stop when the shadow points due south (within 1°).' },
      check: function (ev) {
        const d = ev.data;
        return still(ev) && d.loc === 'sydney' && d.season === 'dec' && d.realTilt && d.alt > 0 && d.shadowAz != null && Math.abs(n180(d.shadowAz - 180)) <= 1;
      }
    },
    {
      id: 'seasons-8', level: 6,
      title: { zh: '真正的晝夜等長', en: 'Truly equal day and night' },
      desc: { zh: '在臺北（日出日落計入大氣折射），找出白天正好 12 小時（誤差 1 分鐘以內）的日子。它在春分那天嗎？', en: 'In Taipei (with refraction at sunrise and sunset), find a day whose daylight lasts exactly 12 hours (within 1 minute). Is it the equinox?' },
      check: function (ev) {
        const d = ev.data;
        return still(ev) && d.loc === 'taipei' && d.realTilt && d.refract && !d.polar && Math.abs(d.dayLen - 12) <= 1 / 60;
      }
    },
    {
      id: 'seasons-9', level: 6,
      title: { zh: '夏至日照冠軍', en: 'June-solstice sunshine champion' },
      desc: { zh: '不計大氣，在夏至那天找一個地方，一天每平方公尺收到的日照量比赤道多 30% 以上。', en: 'Without the air, on the June solstice find a place whose daily sunshine per square metre beats the equator’s by more than 30%.' },
      check: function (ev) { const d = ev.data; return still(ev) && d.season === 'jun' && d.realTilt && !d.atmos && d.Q >= 1.3 * d.Qeq; }
    },
    {
      id: 'seasons-10', level: 8,
      title: { zh: '東北方的日出', en: 'Sunrise in the north-east' },
      desc: { zh: '用真實傾角，讓太陽從方位角 45°（東北方，誤差 0.2° 以內）升起。在臺灣做得到嗎？', en: 'With the real tilt, make the Sun rise at azimuth 45° (north-east, within 0.2°). Can it happen in Taiwan?' },
      check: function (ev) { const d = ev.data; return still(ev) && d.realTilt && !d.polar && Math.abs(d.riseAz - 45) <= 0.2; }
    },
    {
      id: 'seasons-11', level: 9,
      title: { zh: '傾倒的地軸', en: 'A toppled axis' },
      desc: { zh: '在臺北，只改變地軸傾角，讓夏至那天出現永晝，而且傾角小於 66°。', en: 'In Taipei, change only the axial tilt so that the June solstice has the midnight sun, with a tilt below 66°.' },
      check: function (ev) {
        const d = ev.data;
        return still(ev) && d.loc === 'taipei' && d.season === 'jun' && d.polar === 'day' && d.eps < 66;
      }
    },
    {
      id: 'seasons-12', level: 10,
      title: { zh: '大師：指向東北的竿影', en: 'Master: a north-east shadow' },
      desc: { zh: '在臺北用真實傾角，找出竿影長度等於竿長（誤差 1% 以內）、而且影子指向東北方（方位角 45°，誤差 1° 以內）的日期與時刻。', en: 'In Taipei with the real tilt, find a date and time when the shadow is as long as the pole (within 1%) and points north-east (azimuth 45°, within 1°).' },
      check: function (ev) {
        const d = ev.data;
        return still(ev) && d.loc === 'taipei' && d.realTilt && d.alt > 0 && Math.abs(d.ratio - 1) <= 0.01 && d.shadowAz != null && Math.abs(n180(d.shadowAz - 45)) <= 1;
      }
    },
    // ---------- 隱藏任務：只給隱晦的提示 ----------
    {
      id: 'seasons-h1', level: 6, hidden: true,
      riddle: { zh: '每天在同一刻去看它，一年過去，它在天上寫了一個字。', en: 'Visit it at the same hour every day; after a year it has written a character in the sky.' },
      check: function (ev) { const d = ev.data; return ev.type === 'analemma' && d.days >= 330 && d.upDays >= 300 && d.realTilt; }
    },
    {
      id: 'seasons-h2', level: 5, hidden: true,
      riddle: { zh: '一年只有兩天，影子的足跡不肯轉彎。', en: 'Only twice a year does the shadow’s footprint refuse to turn.' },
      check: function (ev) {
        const d = ev.data;
        return ev.type === 'trace' && (d.season === 'mar' || d.season === 'sep') && d.realTilt && d.span >= 6 && Math.abs(d.lat) >= 10 && Math.abs(d.lat) <= 60;
      }
    },
    {
      id: 'seasons-h3', level: 4, hidden: true,
      riddle: { zh: '夜半時分，仍需要一頂草帽。', en: 'At midnight you still need a straw hat.' },
      check: function (ev) { return ev.type === 'midnight'; }
    }
  ]);
})();
