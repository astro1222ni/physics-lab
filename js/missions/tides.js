/* missions/tides.js — 潮汐的任務（星星數 = 等級 1–10）
 *
 * 事件（js/tides.js 只在使用者操作過之後才回報；載入頁面與自動播放不算）：
 *   'state'：放開滑桿、拖曳結束、鍵盤移動、跳躍結束、按暫停、改勾選框時，data 為目前的物理量：
 *            psi（月球與太陽的夾角，度 0–360）, dec（月球赤緯，度）, dist（月地距離，平均距離的倍數）, lat（觀測點緯度）,
 *            sun（是否加入太陽）, t（模擬時間，小時）, lt（地方時）, h（此刻潮位，m）, range（以此刻為中心一個太陰日內的潮差，m）,
 *            hi, lo, eqRange（赤道上的潮差，m）, highsPerDay（一個太陰日內的高潮次數）, ratioM（月球引潮力是真實值的幾倍 = 1/dist³）, view；
 *   'high'：時間前進時經過觀測點的一次高潮，data = { t, h, moonAlt（那一刻月球的高度角，度）, gap（與上一次高潮相隔幾小時）,
 *            dh（這一次減上一次的高度，m）, prevH, prevMoonAlt, dec, lat, sun, dist, psi }；參數一改，gap、dh 就重新計算（null）；
 *   'cam'：3D 檢視按下視角按鈕，data = { preset: 'side'|'top'|'moon', dec }。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const isState = function (ev) { return ev.type === 'state'; };
  const isHigh = function (ev) { return ev.type === 'high'; };
  const near = function (a, b, tol) { let d = Math.abs(((a - b) % 360 + 360) % 360); if (d > 180) d = 360 - d; return d <= tol; };
  const paired = function (ev) { return isHigh(ev) && ev.data.gap != null; };

  LabMission.register('tides', [
    {
      id: 'tides-1', level: 1,
      title: { zh: '漲潮了', en: 'Here comes the tide' },
      desc: { zh: '讓時間前進，經過一次高潮：觀測點的海面漲到最高。', en: 'Let time run until the site has a high tide: the sea reaches its highest point.' },
      check: function (ev) { return isHigh(ev); }
    },
    {
      id: 'tides-2', level: 2,
      title: { zh: '大潮', en: 'Spring tide' },
      desc: { zh: '加入太陽，把月球放到新月或滿月的位置（與太陽的夾角 0° 或 180°，誤差 3° 以內），讓月球與太陽的隆起疊在一起。', en: 'With the Sun included, put the Moon at new moon or full moon (0° or 180° from the Sun, within 3°) so the two sets of bulges line up.' },
      check: function (ev) { return isState(ev) && ev.data.sun && (near(ev.data.psi, 0, 3) || near(ev.data.psi, 180, 3)); }
    },
    {
      id: 'tides-3', level: 2,
      title: { zh: '小潮', en: 'Neap tide' },
      desc: { zh: '加入太陽，把月球放到上弦或下弦的位置（與太陽的夾角 90° 或 270°，誤差 3° 以內），讓兩組隆起互相垂直。', en: 'With the Sun included, put the Moon at first or last quarter (90° or 270° from the Sun, within 3°) so the two sets of bulges are at right angles.' },
      check: function (ev) { return isState(ev) && ev.data.sun && (near(ev.data.psi, 90, 3) || near(ev.data.psi, 270, 3)); }
    },
    {
      id: 'tides-4', level: 3,
      title: { zh: '傾斜的隆起', en: 'Tilted bulges' },
      desc: { zh: '把月球赤緯調到 20° 以上（或 −20° 以下），在 3D 檢視按「側看隆起」，看兩個隆起一個偏北、一個偏南。', en: 'Set the Moon’s declination beyond ±20°, then in the 3D view press “Bulges side-on”: one bulge leans north, the other south.' },
      check: function (ev) { return ev.type === 'cam' && ev.data.preset === 'side' && Math.abs(ev.data.dec) >= 20; }
    },
    {
      id: 'tides-5', level: 3,
      title: { zh: '十二小時二十五分', en: 'Twelve hours twenty-five' },
      desc: { zh: '關掉太陽，讓時間前進經過兩次相連的高潮，量出它們相隔 12 小時 25 分（誤差 2 分鐘以內）。', en: 'Turn the Sun off and let time run through two high tides in a row, 12 h 25 min apart (within 2 minutes).' },
      check: function (ev) { return paired(ev) && !ev.data.sun && ev.data.gap >= 12.4206 - 2 / 60 && ev.data.gap <= 12.4206 + 2 / 60; }
    },
    {
      id: 'tides-6', level: 4,
      title: { zh: '一高一低', en: 'One high, one low' },
      desc: { zh: '調整月球赤緯與觀測點緯度，讓同一天相連的兩次高潮相差 20 cm 以上（日潮不等），而且兩次高潮都還在平均海面以上。', en: 'Adjust the Moon’s declination and the site’s latitude so that two high tides in a row on the same day differ by at least 20 cm (diurnal inequality), with both high tides still above mean sea level.' },
      check: function (ev) { return paired(ev) && ev.data.gap < 20 && Math.abs(ev.data.dh) >= 0.2 && ev.data.h > 0 && ev.data.prevH > 0; }
    },
    {
      id: 'tides-7', level: 5,
      title: { zh: '赤道的公平', en: 'Fair at the equator' },
      desc: { zh: '月球赤緯在 20° 以上（或 −20° 以下）時，找一個地方讓相連兩次高潮的高度差不到 0.5 cm。（太陽也會讓高潮一天天改變，可以先關掉太陽。）', en: 'With the Moon’s declination beyond ±20°, find a place where two high tides in a row differ by less than 0.5 cm. (The Sun also makes the high tides change from day to day, so you may want to turn it off first.)' },
      check: function (ev) { return paired(ev) && ev.data.gap < 20 && Math.abs(ev.data.dec) >= 20 && Math.abs(ev.data.dh) <= 0.005; }
    },
    {
      id: 'tides-8', level: 6,
      title: { zh: '一天只漲一次', en: 'Once a day' },
      desc: { zh: '讓觀測點變成「全日潮」：相連兩次高潮相隔 20 小時以上。', en: 'Give the site a diurnal tide: two high tides in a row more than 20 hours apart.' },
      check: function (ev) { return paired(ev) && ev.data.gap >= 20; }
    },
    {
      id: 'tides-9', level: 7,
      title: { zh: '最高的大潮', en: 'The highest spring tide' },
      desc: { zh: '月地距離保持真實的平均距離（1 倍），讓觀測點的一次高潮達到平均海面以上 50 cm。', en: 'Keeping the Moon at its real mean distance (1×), give the site a high tide at least 50 cm above mean sea level.' },
      check: function (ev) { return isHigh(ev) && ev.data.h >= 0.5 && Math.abs(ev.data.dist - 1) <= 0.005; }
    },
    {
      id: 'tides-10', level: 8,
      title: { zh: '引潮力加倍', en: 'Double the pull' },
      desc: { zh: '改變月地距離，讓月球的引潮力恰好變成真實值的 2 倍（誤差 1% 以內）。', en: 'Change the Earth–Moon distance so that the Moon’s tidal acceleration becomes exactly twice the real value (within 1%).' },
      check: function (ev) { return isState(ev) && ev.data.ratioM >= 1.98 && ev.data.ratioM <= 2.02; }
    },
    {
      id: 'tides-11', level: 10,
      title: { zh: '隆起消失', en: 'The bulges vanish' },
      desc: { zh: '先按暫停，加入太陽，讓月球留在天赤道上（赤緯 0°，誤差 0.3° 以內），只調整月球的位置與距離，讓赤道上的潮差小於 1 cm：月球與太陽的半日潮正好互相抵消。', en: 'Pause first. With the Sun included and the Moon kept on the celestial equator (declination 0°, within 0.3°), adjust only the Moon’s position and distance until the tidal range on the equator is under 1 cm: the Moon’s and the Sun’s semidiurnal tides cancel exactly.' },
      check: function (ev) { return isState(ev) && ev.data.sun && Math.abs(ev.data.dec) <= 0.3 && ev.data.eqRange < 0.01; }
    },
    {
      id: 'tides-h1', level: 5, hidden: true,
      riddle: { zh: '有個地方不必等潮——因為它永遠不來。', en: 'There is a place where no one waits for the tide — it never comes.' },
      check: function (ev) { return isState(ev) && ev.data.range <= 0.002; }
    },
    {
      id: 'tides-h2', level: 4, hidden: true,
      riddle: { zh: '最滿的一刻，依舊是空的。', en: 'Even at its fullest, it is still empty.' },
      check: function (ev) { return isHigh(ev) && ev.data.h < 0; }
    },
    {
      id: 'tides-h3', level: 6, hidden: true,
      riddle: { zh: '看不見的那位，給的反而更多。', en: 'The one you cannot see gives you more.' },
      check: function (ev) {
        const d = ev.data;
        // 只有月球（關掉太陽）、真實的月地距離，月亮在地平線下的那次高潮比上一次（月亮在天上）高 40 cm 以上
        return paired(ev) && !d.sun && Math.abs(d.dist - 1) < 0.005 && d.gap < 20 && d.moonAlt < 0 && d.prevMoonAlt != null && d.prevMoonAlt > 0 && d.dh >= 0.4;
      }
    }
  ]);
})();
